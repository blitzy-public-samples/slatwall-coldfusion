/**
 * SALE-PRICE SEEDING — the pass that enters sale prices into the discount competition.
 *
 * Port of [model/service/PromotionService.cfc:L144-L162], the first loop inside
 * `updateOrderAmountsWithPromotions`. It walks the order's items and, for every item whose SKU
 * carries a sale price strictly below the SKU's own price, seeds one qualified-discount record into
 * the accumulator BEFORE the main reward iteration at [model/service/PromotionService.cfc:L164]
 * begins. Running first is the whole point: it is what lets a sale price compete on equal footing
 * with reward discounts in the descending insertion sort that happens later and elsewhere.
 *
 * `model/service/PromotionService.cfc` is the SOLE BEHAVIOURAL AUTHORITY for this module. Every
 * locator below was re-read against that file during authoring; the file is 1125 lines and the
 * cited range was confirmed character for character. `model/entity/Sku.cfc` is consulted only as
 * the accessor contract behind `orderItem.getSku().getSalePriceDetails()`.
 *
 * THE LEGACY RANGE, VERBATIM — this is what a reviewer diffs the method below against:
 *
 *   L144 // Loop over orderItems and add Sale Prices to the qualified discounts
 *   L145 for(var orderItem in arguments.order.getOrderItems()) {
 *   L146   var salePriceDetails = orderItem.getSku().getSalePriceDetails();
 *   L147
 *   L148   if(structKeyExists(salePriceDetails, "salePrice") && salePriceDetails.salePrice < orderItem.getSku().getPrice()) {
 *   L149
 *   L150     var discountAmount = precisionEvaluate('(orderItem.getSku().getPrice() * orderItem.getQuantity()) - (salePriceDetails.salePrice * orderItem.getQuantity())');
 *   L151
 *   L152     orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ] = [];
 *   L153
 *   L154     // Insert this value into the potential discounts array
 *   L155     arrayAppend(orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ], {
 *   L156       promotionRewardID = "",
 *   L157       promotion = this.getPromotion(salePriceDetails.promotionID),
 *   L158       discountAmount = discountAmount
 *   L159     });
 *   L160
 *   L161   }
 *   L162 }
 *
 * WHAT THIS MODULE IS NOT ALLOWED TO DO, stated up front because each prohibition is a money
 * decision rather than a style preference:
 *
 *   * It does NOT sort. The descending insertion sort that establishes "index [1] is best" lives at
 *     [model/service/PromotionService.cfc:L266-L294] and belongs to the promotion façade. This
 *     module only appends. See the LEGACY-NOTE on {@link SalePriceSeeder.seedSalePriceDiscounts}.
 *   * It does NOT round, quantize, clamp or format. The seeded amount is a raw extended-price
 *     delta. Quantization belongs to the reward path alone
 *     ([model/service/PromotionService.cfc:L1017], ported in `./discountAmount.ts`).
 *   * It does NOT add a guard the legacy lacks — no non-negativity test on the sale price, no
 *     presence test on the promotion identifier, no throw on a malformed detail row.
 *   * It does NOT hold state. Nothing in this module is module-level and mutable. The accumulator
 *     is supplied by the caller and lives for exactly one invocation, mirroring the legacy
 *     `var orderItemQulifiedDiscounts = {}` at [model/service/PromotionService.cfc:L142]. Reusing
 *     one map across invocations on a warm container would let one customer's discount surface in
 *     another customer's order, which is a correctness and safety failure.
 *
 * PARAMETERIZED SQL IS NOT APPLICABLE HERE. This module runs no query, opens no connection and
 * imports no driver. Every statement in the target is a prepared statement, but they all live in
 * `src/repositories/mysql/**`; the only data this module reads arrives already materialized on the
 * `Sku` entity and through the injected promotion resolver.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L142]: the accumulator this module writes into is spelled `orderItemQulifiedDiscounts` in the legacy source — "Qulified", missing the `a` — and the target uses the corrected spelling `orderItemQualifiedDiscounts`.
 * The rename is permitted because the identifier is a function-local accumulator rather than a persisted or transported contract: it is never a column, never a JSON key and never a parameter name, and the interface-parity obligation binds public method names. Contrast the identifiers that ARE contracts and are therefore preserved verbatim wherever they surface — `hb_permission="promotionPeriod.promtionRewards"` at [model/entity/PromotionReward.cfc:L49] chief among them. The two cases must not be conflated: one is renamed with a comment, the other is preserved with a comment.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L138]: the neighbouring declaration carries the comment "This is a structure of promotionRewards that will hold information reguarding maximum usages" — "reguarding" is the source's own spelling and is quoted here unaltered rather than silently corrected.
 * It is quoted at all because that declaration is the reward-usage ledger this module deliberately does NOT touch: sale-price records are invisible to it, which is the invariant recorded on the sentinel below.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L150, L252, L299, L486, L990, L995, L1001, L1006, L1007]: the `precisionEvaluate` census for this component is NINE sites, not the eight the published plan lists.
 * Two corrections, both confirmed by direct search of the source, which wins over any published locator: the plan's "L248" is a comment line and the arithmetic it means is on L252, and the plan's single "L1007" is really two adjacent sites, L1006 and L1007. This module owns exactly one of the nine — L150 — and routes it through the `Money` value object.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L121-L131]: the illustrative docblock describing the accumulator promises FIVE members on each record — `promotionRewardID`, `promotion`, `discountAmount`, `discountQuantity` and `discountPerUseValue` — while every one of the three construction sites in the component writes only the first three: L156-L158 here, L275-L277 and L289-L291 on the reward path.
 * The target follows the CODE. The two phantom members are not materialized, and the record type is imported from `../../domain/promotionEngine/qualifiedDiscountTypes.js` rather than redeclared, so this module cannot widen it even by accident. A same-named `discountQuantity` and `discountPerUseValue` do genuinely exist, but on the reward ledger's per-item usage rows at L311-L312 and L325-L326 — the docblock conflates two different structures.
 *
 * LEGACY-NOTE: TEST COVERAGE FOR THIS MODULE IS ENTIRELY NET-NEW, and must be labelled net-new rather than presented as parity.
 * No legacy test touches the promotion engine: `meta/tests/unit/service/` holds only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, none of which is in scope, and `meta/tests/unit/dao/` holds only AccountDAOTest and PaymentDAOTest. Authoring the suites belongs to the test tier under `slatwall-ts/tests/**`; this module authors none.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT. `review_rules` returns the single line
 * "No user rules provided." — queried while authoring this file, with that one line as the whole
 * document, so the read is complete. No rule is invented to fill the absence, and the absence is
 * not treated as licence to lower the bar: the project's enterprise substitutes apply here at full
 * strength — maximal TypeScript strictness, a single arithmetic surface for money, explicit
 * constructor injection, one exported unit per file with no barrel, and an in-code annotation for
 * every judgment call. `review_rules` remains the authoritative source should rules ever be added.
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
 * This is the collaborator standing in for the framework accessor at
 * [model/service/PromotionService.cfc:L157] — `this.getPromotion(salePriceDetails.promotionID)`.
 * In the legacy that call is an inherited `HibachiService` dynamic entity getter, `get<Entity>(id)`
 * resolved by the framework at request time; it is not a method anyone wrote and it has no
 * counterpart in the ported port set.
 *
 * JUDGMENT CALL: the framework accessor becomes a CONSTRUCTOR-INJECTED COLLABORATOR whose contract is declared as this local interface, and three alternatives were considered and rejected.
 * REJECTED — a fourteenth port, or a new member on `../../domain/ports/promotionRepository.js`: the port set is closed at thirteen and `promotionRepository`'s member set is frozen at seven, none of which loads a `Promotion` by identifier (verified by reading the interface: getActivePromotionRewards, getPromotionPeriodUseCount, getPromotionPeriodAccountUseCount, getPromotionCodeUseCount, getPromotionCodeAccountUseCount, getSalePricePromotionRewardsQuery, getRoundingRuleQuery). Declaring this contract in `src/domain/ports/` would create the fourteenth port by another name, so it is declared here, attached to the one class that consumes it.
 * REJECTED — widening an existing signature to pass the promotion in: no signature-widening budget remains anywhere in the project, and this fragment is inline legacy code with no legacy method name whose shape could absorb a parameter.
 * REJECTED — a service locator, a runtime scan or module-level state: replacing the locator with explicit constructor injection is the point of retiring the legacy bean factory, and module-level state is prohibited outright because on a warm container it outlives the request that created it.
 * CHOSEN — an injected collaborator, wired once in the composition root, typed to the narrowest contract that already exists. The record type in `../../domain/promotionEngine/qualifiedDiscountTypes.js` types its `promotion` member as the `Promotion` ENTITY, so "resolve a `Promotion` from an opaque `promotionID`" is the whole contract and nothing more is asked of it.
 *
 * The method keeps the legacy name `getPromotion` verbatim so the call site below reads as the
 * source line it replaces.
 *
 * THE RETURN IS NON-NULLABLE, DELIBERATELY. The legacy assigns the result straight into the record
 * with no absence test, and `QualifiedDiscount.promotion` is a required member. Declaring
 * `Promise<Promotion | undefined>` would force this module to either throw or skip on absence, and
 * both are validation the legacy does not perform — the framework getter always answers an entity.
 * Resolving the identifier is the implementation's problem, not this module's.
 */
export interface SalePricePromotionResolver {
  getPromotion(promotionID: string): Promise<Promotion>;
}

/**
 * Seeds sale-price records into the qualified-discount accumulator.
 *
 * A class rather than a bare function so the promotion resolver arrives as an explicit, compile-
 * checked constructor argument — the same treatment every other collaborator in the ported engine
 * gets, and the replacement for the legacy convention-scanned bean factory. There is no container,
 * no locator and no runtime scan.
 *
 * INSTANCES CARRY NO MUTABLE STATE. The only field is the injected resolver, and it is `readonly`.
 * Everything the seeding pass computes lives in locals for the duration of one call, and the
 * accumulator it writes into belongs to the caller.
 */
export class SalePriceSeeder {
  constructor(private readonly promotionResolver: SalePricePromotionResolver) {}

  /**
   * Runs the sale-price seeding pass over one order.
   *
   * Ports [model/service/PromotionService.cfc:L144-L162] whole. The name is idiomatic TypeScript
   * rather than a carried-over CFML name because the source fragment is inline code inside a much
   * larger function and has no method name to preserve — interface parity binds the named service
   * methods, and this is not one of them.
   *
   * THE ACCUMULATOR IS SUPPLIED BY THE CALLER, NOT RETURNED. Legacy declares it three lines
   * earlier at [model/service/PromotionService.cfc:L142] as `var orderItemQulifiedDiscounts = {}`
   * and this loop writes into it in place, so accepting it as a parameter is the faithful shape.
   * It also keeps L152's semantics observable: an unconditional assignment can only be seen to
   * REPLACE something if the map it writes into might already hold it. Returning a fresh map
   * instead would quietly erase that, which is exactly the class of tidying this port refuses.
   *
   * ASYNCHRONOUS, and the derivation is worth stating because it is not obvious from the body.
   *
   * JUDGMENT CALL: this method is `async` because the promotion resolution at [model/service/PromotionService.cfc:L157] reaches persistent storage, and for no other reason.
   * The async boundary rule for this port is that a method becomes asynchronous if and only if its legacy body reaches the DAO or the ORM, or a collaborator that does. Two candidate reaches exist in this range, and they resolved differently. The sale-price detail read at L146 transitively reaches the sale-price query — `Sku.getSalePriceDetails()` delegates to `Product.getSkuSalePriceDetails()`, which delegates to the promotion service's `getSalePriceDetailsForProductSkus()`, which is DAO-backed — but `src/domain/entities/sku.ts` resolved that reach at the repository boundary instead, pre-materializing the detail row during hydration so the accessor stays synchronous, exactly as the currency cascade does. So no `await` is placed on it: awaiting a value that is not a promise would be a false signal about where the boundary is. The promotion resolution at L157 has no such materialization available — the identifier only becomes known once the detail row has been read — so it stays a genuine asynchronous collaborator call, and it is what makes this method asynchronous.
   * If `sku.ts` ever moves the detail row back behind an asynchronous accessor, the change needed here is to `await` that one call; nothing else about this method's shape depends on which choice was made.
   *
   * ITEMS ARE PROCESSED STRICTLY IN SEQUENCE. The legacy loop is sequential and the resolutions are
   * not gathered concurrently, so this reproduces that: one item is finished before the next
   * begins. Batching the resolver calls would change the order in which the accumulator is written.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294]: this module APPENDS ONLY — it performs no sorting of any kind, and it exposes no comparator and no insert-at-position helper.
   * The descending insertion sort that establishes the "index [1] is the best discount" invariant the application pass at L529-L534 depends on lives at L266-L294 and belongs to the promotion façade, outside this range. Two consequences follow from seeding running FIRST. A seeded sale-price record occupies position 1 the moment it is appended, and the test that would displace it at L271 is a STRICT `<` — so a reward discount of exactly equal value does NOT displace an incumbent sale price; only a strictly larger one does. And because this module owns neither sort, it must not create the temptation to unify them: the reward-usage ledger at L301-L329 is insert-sorted ASCENDING by discount-per-use while the accumulator is sorted DESCENDING by discount amount, the two orderings answer different questions, and one shared comparator would change the money.
   *
   * @param order the order to seed, as the read-only anti-corruption view. Never mutated.
   * @param orderItemQualifiedDiscounts the caller's accumulator, written in place.
   */
  public async seedSalePriceDiscounts(
    order: OrderView,
    orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
  ): Promise<void> {
    // CFML parity [model/service/PromotionService.cfc:L145]: `for(var orderItem in arguments.order.getOrderItems())` iterates an ARRAY, and CFML's for-in over an array yields the ELEMENTS rather than indices — so this is a plain for-of over the items, with no 1-based index emulation and no index arithmetic anywhere.
    // The collection expression is likewise evaluated once, as CFML evaluates it once, and it is
    // annotated with the element type so the read-only contract is visible at the point of
    // iteration: `OrderItemView` carries opaque identifiers and is never written to.
    const orderItems: readonly OrderItemView[] = order.orderItems;

    for (const orderItem of orderItems) {
      // [L146] The sale-price detail row for this item's SKU. `undefined` here is how the target
      // spells the legacy's "no sale-price row": `Product.getSkuSalePriceDetails` guards on key
      // existence at [model/entity/Product.cfc:L183-L184] and has NO `else`, so a SKU with no
      // winning sale price yields an absent or empty structure — and that is exactly why the
      // presence test on the next line is necessary at all rather than merely defensive.
      // Where the legacy carries the optionality is worth being precise about, because the two
      // layers spell it differently. In CFML `salePrice` is an optional KEY on a struct that may
      // itself be empty, and both states answer the same `structKeyExists` test. The ported
      // projection resolves that into one shape: the RECORD is optional, and `salePrice` is a
      // required member of a record that exists. Both halves of the legacy test therefore have to
      // be reproduced — the record's absence, then the key's — and neither subsumes the other.
      const salePriceDetails = orderItem.sku.getSalePriceDetails();

      // CFML parity [model/service/PromotionService.cfc:L148, L150]: `orderItem.getSku().getPrice()` is evaluated TWICE in the source — once in the gate at L148 and again inside the arithmetic at L150 — and `getQuantity()` is evaluated twice inside L150 alone. Each value is read ONCE here so that the gate and the arithmetic are provably testing and multiplying the same value.
      // Both accessors are plain field reads over already-materialized state — `getPrice()` returns
      // the persisted column [model/entity/Sku.cfc:L56, `default="0"`, so never absent] and
      // `getSalePriceDetails()` returns the row materialized during hydration — so neither read has
      // an effect, neither memoizes on demand, and reading them before the gate rather than inside
      // it cannot be observed. This is about determinism and legibility: two reads of one value
      // invite the two to drift apart, and nothing else.
      const skuPrice = orderItem.sku.getPrice();

      // CFML parity [model/service/PromotionService.cfc:L148]: the gate is a CONJUNCTION of two independent tests joined by a SHORT-CIRCUITING `&&`, and both halves are reproduced in order — key presence first, the comparison second, and the comparison is never reached when the key is absent.
      // Test one is `structKeyExists(salePriceDetails, "salePrice")`. It is routed through the CFML
      // struct helper because CFML struct keys are matched CASE-INSENSITIVELY while TypeScript keys
      // are not, and it is a presence test and nothing more: no default-value lookup is used here,
      // because substituting a default for an absent price is precisely how a zero reaches a money
      // path. The leading `!== undefined` term is the same test one level up — it rules out the
      // absent structure the legacy would have found empty — and it is written as an explicit
      // comparison because the nullish helper answers a boolean without narrowing, and a non-null
      // assertion is not available in this subtree. `src/domain/entities/sku.ts` narrows the very
      // same value the very same way.
      // The folded presence test and the direct read below cannot disagree, and it is worth saying
      // why rather than leaving it to be inferred: the detail row is a first-party TypeScript
      // interface, so `salePrice` is a declared member and every producer of the row spells it
      // canonically. The case-folding helper is here to reproduce the CFML SEMANTIC faithfully —
      // CFML would have matched any casing — not to paper over a key whose spelling is unknown. A
      // value-fetching lookup is deliberately not used for the read: the row's members have
      // different types, so fetching through the helper would widen the result to their union and
      // force a runtime type test that the legacy never performs.
      // Test two is `salePriceDetails.salePrice < orderItem.getSku().getPrice()`, a STRICT less
      // than. A sale price EQUAL to the SKU price seeds nothing at all: no accumulator key, no
      // record. It is expressed through the money value object's comparison surface, never as a raw
      // numeric comparison on a monetary operand.
      if (
        salePriceDetails !== undefined &&
        structKeyExists(salePriceDetails, 'salePrice') &&
        salePriceDetails.salePrice.isLessThan(skuPrice)
      ) {
        // [L150] and [L152-L159] read these three values; each is captured once. The quantity is a
        // COUNT rather than an amount of money — the column is `ormtype="integer"` — so it stays a
        // number and enters the arithmetic as a multiplier.
        const salePrice = salePriceDetails.salePrice;
        const quantity = orderItem.quantity;
        const orderItemID = orderItem.orderItemID;

        // CFML parity [model/service/PromotionService.cfc:L150]: the legacy computes TWO EXTENDED AMOUNTS AND SUBTRACTS THEM — `(price * quantity) - (salePrice * quantity)` — and this reproduces that shape exactly: two multiplications, then one subtraction.
        // It is deliberately NOT algebraically simplified to `(price - salePrice) * quantity`. The
        // two forms agree in exact decimal arithmetic, so the reason is not arithmetic: the
        // acceptance contract for this port is that a reviewer can diff the target against the
        // cited source line, and restructuring the expression destroys that check for no gain.
        // This is `precisionEvaluate` site L150 of the nine recorded in the module header. All of
        // it runs through the money value object, whose arbitrary-precision substrate is what
        // `precisionEvaluate` provided; no floating-point operation touches a monetary value here.
        // Nothing is rounded, quantized, clamped or formatted — the seeded amount is a raw extended
        // price delta, and the two-decimal presentation step belongs to the reward path alone.
        const discountAmount = skuPrice.times(quantity).minus(salePrice.times(quantity));

        // CFML parity [model/service/PromotionService.cfc:L152]: a FRESH empty array is assigned UNCONDITIONALLY — there is no `structKeyExists` guard here — and it is assigned only INSIDE the gate above.
        // The asymmetry with the reward path is real and is reproduced rather than normalised: the
        // reward path at L260-L263 wraps the identical assignment in `if(!structKeyExists(...))`,
        // so it preserves an existing bucket where this one would replace it. In this pass each
        // order item is visited once, so nothing is discarded in practice — but the two idioms are
        // not interchangeable, and collapsing them into one would change that.
        // Assigning only inside the gate is load-bearing further downstream: the application pass
        // at L529 tests `structKeyExists` on this map, so an item with no qualifying sale price
        // must genuinely have NO key. Pre-seeding every item with an empty array would satisfy the
        // key test and change which items are considered.
        // The array is held in a local as well as stored, because L155 appends into the very array
        // L152 created. Reading it back out of the map would be a checked index access proving
        // something already known, and the non-null assertion that would paper over it is banned.
        const potentialDiscounts: QualifiedDiscount[] = [];
        orderItemQualifiedDiscounts[orderItemID] = potentialDiscounts;

        // CFML parity [model/service/PromotionService.cfc:L157 versus L276 and L290]: a `Promotion` reaches the accumulator by TWO DIFFERENT ROUTES, and only this one is a lookup.
        // Here the winning detail row carries a promotion identifier and the promotion is resolved
        // FROM it. On the reward path the promotion is reached by pure association traversal —
        // `reward.getPromotionPeriod().getPromotion()` — with no lookup at all. Both yield the same
        // entity type and the accumulator record is identical either way, which is why the record
        // type needs no discriminator. The identifier is OPAQUE: it is passed straight through,
        // never parsed, never validated and never transformed.
        // Resolution happens after the array has been stored, matching the source order in which
        // L152 completes before the L155 record literal is evaluated.
        const promotion = await this.promotionResolver.getPromotion(salePriceDetails.promotionID);

        // [L154-L159] `arrayAppend` of exactly ONE record, into the array created one line above.
        // The record has EXACTLY THREE members; see the header note on the L121-L131 docblock,
        // which promises five. The type is imported, so the shape cannot drift.
        //
        // CFML parity [model/service/PromotionService.cfc:L156]: `promotionRewardID = ""` — the EMPTY STRING is an in-band SENTINEL, not a placeholder, and it is what makes a sale-price record STRUCTURALLY IMMUNE to use-limit stripping.
        // The over-use stripping pass at L468-L521 iterates the keys of the reward-usage ledger and
        // matches records with `.promotionRewardID == prID` at L483 and L499. Every `prID` is a
        // real reward identifier, and the ledger never holds a key for the empty string, so a
        // seeded sale-price record can never be matched, never be scaled down and never be deleted.
        // Reward-path records carry the reward's REAL identifier by contrast
        // (`reward.getPromotionRewardID()` at L275 and L289), which is what makes them strippable
        // and this one not. Substituting `undefined`, `null`, a synthetic identifier, a symbol or a
        // discriminant tag — or modelling sale-price records as a separate union member — would
        // erase the immunity along with the sentinel and change the amount a customer is charged.
        // The counterpart module `./overUseStripping.ts` reproduces that pass and must likewise not
        // be extended to reach these records; the invariant has to hold from both ends.
        potentialDiscounts.push({
          promotionRewardID: '',
          promotion,
          discountAmount,
        });
      }
    }
  }
}
