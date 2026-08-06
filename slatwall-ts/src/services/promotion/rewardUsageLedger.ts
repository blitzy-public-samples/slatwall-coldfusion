// ---------------------------------------------------------------------------
// THE SIBLINGS THIS FILE NAMES, AND WHAT EACH ONE OWNS
//
// Commentary below hands responsibilities to other modules by name, and every
// one of them exists on the branch - so each mention points at real code rather
// than at an intention. Naming a boundary here is how this file records what it
// deliberately does NOT do, so that no responsibility below acquires a second
// owner:
//
//   src/services/promotionService.ts                the facade that owns the
//                                                   reward loop and CALLS this
//                                                   ledger; see the ownership
//                                                   section for the exact seam
//   src/services/promotion/twoPassRewardIterator.ts the two explicit ordered
//                                                   passes the facade drives
//   src/services/promotion/salePriceSeeding.ts      the `promotionRewardID = ""`
//                                                   path that BYPASSES this
//                                                   ledger entirely
//   src/handlers/bootstrap.ts                       the composition root; it
//                                                   wires services, NOT this
//                                                   ledger - see "REQUEST
//                                                   SCOPING" for why
//   tests/unit/services/promotion/rewardUsageLedger.test.ts
//                                                   the net-new suite this
//                                                   module obliges but does not
//                                                   author
//
// `src/services/promotion/discountAmount.ts`, `src/services/promotion/
// overUseStripping.ts`, `src/repositories/mysql/mysqlPromotionRepository.ts` and
// `src/domain/promotionEngine/qualifiedDiscountTypes.ts` ARE shipped and are
// named without the marker. None of the four is imported here - see "ZERO
// INTRA-FOLDER IMPORTS".
// ---------------------------------------------------------------------------

/**
 * slatwall-ts - the MUTABLE promotion-reward usage ledger: the state that
 * decides how many times a promotion reward may be used on one order.
 *
 * WHAT THIS FILE IS
 * The five inline fragments of `updateOrderAmountsWithPromotions`
 * [model/service/PromotionService.cfc:L58-L546] that create, mutate and order
 * `promotionRewardUsageDetails` - the structure declared as `var
 * promotionRewardUsageDetails = {};` at
 * [model/service/PromotionService.cfc:L139] and threaded through that method's
 * 489-line body:
 *
 *   1. ENTRY SEEDING       [model/service/PromotionService.cfc:L171-L189]
 *   2. THE RATCHET         [model/service/PromotionService.cfc:L223-L224]
 *   3. THE INCREMENT       [model/service/PromotionService.cfc:L297]
 *   4. THE DIVISION        [model/service/PromotionService.cfc:L299]
 *   5. THE ASCENDING SORT  [model/service/PromotionService.cfc:L301-L329]
 *
 * `model/service/PromotionService.cfc` is the SOLE BEHAVIOURAL AUTHORITY for
 * this module. `model/entity/PromotionReward.cfc` is read only as an accessor
 * contract, and only for the four accessors the fragments above actually call:
 * `getPromotionRewardID`, `getMaximumUsePerOrder`, `getMaximumUsePerItem` and
 * `getMaximumUsePerQualification`.
 *
 * AUTHORITY
 * AAP 0.4.1, the promotion-engine decomposition row for this path: CREATE from
 * [model/service/PromotionService.cfc:L173-L188] and
 * [model/service/PromotionService.cfc:L297-L329], described as "The mutable
 * usage ledger and its two opposing insert-sorts". AAP 0.8.1's Preserve-Exactly
 * directive names "promotion discount math together with use-limit enforcement
 * semantics"; the discount math is `discountAmount.ts`, and THE USE-LIMIT
 * ENFORCEMENT HALF IS THIS FILE. AAP 0.6.1 is the hotspot analysis this module
 * has to keep reproducible.
 *
 * THESE ARE INLINE FRAGMENTS, NOT NAMED CFML FUNCTIONS
 * None of the five is a `<cffunction>`, so there is no legacy method name to
 * carry over and the project's interface-parity rule does not constrain the
 * naming here - it binds ported CFML METHODS, and this module ports none. The
 * names below are therefore chosen for clarity, and every one cites the exact
 * source range it reproduces so a reviewer can check the mapping rather than
 * trust it. No signature is reshaped, no signature is widened and no private
 * method is promoted to public anywhere in this file: the project's five
 * visibility widenings all belong to other modules and that ledger is exhausted.
 *
 * ============================ WHAT THIS MODULE OWNS ========================
 * The order-item reward branch spans [model/service/PromotionService.cfc:L200-L296]
 * and, apart from the five ranges named above, all of it belongs to the facade.
 * The boundary is drawn deliberately and the following are NOT reproduced here:
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L228, L231-L233, L236-L238]: the `discountQuantity` derivation and BOTH of its clamps are FACADE-OWNED READS of this ledger and are deliberately absent from this module. L228 computes `qualificationQuantity * maximumUsePerQualification`; L231-L233 clamps the result down to `orderItem.getQuantity()`; L236-L238 clamps it down again to `maximumUsePerItem`.
 * All three READ ledger state that this module owns, which is exactly why they are easy to absorb by accident - and absorbing them would move the clamp against the order item's own quantity inside a type that cannot see an order item's quantity. `recordOrderItemUsage` therefore RECEIVES the finished `discountQuantity`; it never derives one.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294]: the DESCENDING insertion sort over `orderItemQulifiedDiscounts` is FACADE-OWNED and is deliberately NOT implemented here. It orders by `discountAmount` descending so that only index `[1]` - the single largest discount - is ever applied at [model/service/PromotionService.cfc:L524-L537], whereas the ascending sort in this file orders by `discountPerUseValue` so that over-use stripping removes the CHEAPEST-PER-USE discounts first.
 * The two run in OPPOSITE directions, both orderings are load-bearing, and they must never be unified into one comparator or one shared insertion helper. That is the reason `insertUsageInAscendingOrder` below is a private method of this class rather than a general-purpose sorted-insert utility: a shared utility is precisely the refactor that would invite someone to point the second sort at it.
 *
 * Also absent, and belonging to the facade: the `qualificationQuantity` read at
 * [model/service/PromotionService.cfc:L222], the price-group base-price
 * selection at [model/service/PromotionService.cfc:L241-L252], the fulfillment
 * branch opening at [model/service/PromotionService.cfc:L345] and the
 * order-level branch opening at [model/service/PromotionService.cfc:L415].
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L542-L544]: the project's one carried-forward legacy TODO - `// TODO [issue #1766]`, the return/exchange branch that does nothing - sits in the facade's span and is NOT absorbed here.
 * It is recorded only so that its absence from this file reads as a boundary decision rather than as an omission.
 *
 * ==================== THE 1000000 SENTINEL DOES ARITHMETIC =================
 * See {@link UNLIMITED_USE_UNTIL_CONFIGURED} for the full reasoning. In short:
 * the seed is an ordinary finite number that is multiplied, compared and
 * assigned, so `Infinity`, `Number.MAX_SAFE_INTEGER`, `null`, `undefined` and an
 * optional property are all wrong, and not for stylistic reasons.
 *
 * ==================== A PERSISTED ZERO MEANS UNLIMITED ====================
 * See {@link resolveUseLimit}. A stored `0` fails the legacy `> 0` test, so the
 * override never fires and the sentinel survives - a reward configured with
 * `maximumUsePerOrder = 0` is therefore effectively UNLIMITED rather than
 * unusable. So is a negative one. Neither is validated, normalised or rejected.
 *
 * ===================== MUTABILITY IS LOAD-BEARING =========================
 * The ledger's shapes are published by
 * `src/domain/promotionEngine/rewardUsageTypes.ts` and are IMPORTED here, never
 * redeclared, widened, re-derived or shadowed by a local interface. That module
 * marks mutability PER MEMBER on the evidence of a full source census, and this
 * module is the one that performs every one of those mutations:
 *
 *   * `usedInOrder` is incremented in place at
 *     [model/service/PromotionService.cfc:L297].
 *   * `maximumUsePerOrder` is ratcheted down at
 *     [model/service/PromotionService.cfc:L224].
 *   * `orderItemsUsage` is a `readonly` PROPERTY holding a MUTABLE ARRAY: the
 *     binding is never reassigned, but the contents are spliced at
 *     [model/service/PromotionService.cfc:L309] and appended at
 *     [model/service/PromotionService.cfc:L323]. It is never a `ReadonlyArray`,
 *     and no `Readonly<>` wrapper appears anywhere in this file - either one
 *     would make the algorithm inexpressible.
 *   * `maximumUsePerItem` and `maximumUsePerQualification` are published
 *     `readonly`, which has a real consequence for how seeding is written; see
 *     the JUDGMENT CALL on {@link RewardUsageLedger.ensureRewardEntry}.
 *
 * ===================== REQUEST SCOPING, AND WHY ===========================
 * The legacy structure is a `var` local to ONE invocation
 * [model/service/PromotionService.cfc:L139], and the port keeps it that way by
 * making the ledger an INSTANCE field of this class. There is no module-level
 * mutable state in this file, and the class is deliberately NOT a singleton
 * wired in the composition root `src/handlers/bootstrap.ts`: one
 * `RewardUsageLedger` is constructed per invocation of the promotion pass.
 *
 * That is a CORRECTNESS requirement, not housekeeping. A module-level or
 * container-scoped ledger would survive between unrelated invocations on a warm
 * Lambda container, so one customer's accumulated `usedInOrder` and one
 * customer's ratcheted `maximumUsePerOrder` would silently constrain - or fail
 * to constrain - a different customer's order. Structural scoping is what makes
 * that unrepresentable rather than merely discouraged.
 *
 * ================ THE ORDER-DEPENDENCE THIS MODULE CREATES ================
 * Two of the promotion engine's order-dependence mechanisms live here outright,
 * and the ascending half of a third does; each is annotated at its
 * implementation. They are the reason this module is characterised rather than
 * merely unit-tested: the ledger is what makes "which reward ran first" change
 * the money a customer is charged.
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE TO THIS FILE, AND HERE IS WHY.
 * The project standard is that every query uses prepared statements, preserving
 * the injection-safety guarantee `cfqueryparam` provided (AAP 0.8.3). This
 * module executes no query of any kind - no SQL string, no driver import, no
 * connection, no interpolation site - so there is nothing here for the standard
 * to bind. Every statement that reads or writes the `Sw*` tables lives in
 * `src/repositories/mysql/**`, and the reward collection this ledger keys itself
 * from is fetched by `src/repositories/mysql/mysqlPromotionRepository.ts`.
 * Stating the exemption explicitly is the point: silence would read as an
 * oversight.
 *
 * SYNCHRONOUS THROUGHOUT
 * Nothing in this module reaches a DAO, an ORM, a port or the network, so every
 * method below is synchronous and none returns a promise. The project's async
 * boundary rule is that a method becomes `async` if and only if its legacy body
 * reached the DAO or ORM; these five fragments do not, so making any of them
 * `async` "for consistency" would be a gratuitous signature change. This module
 * also consumes NO port - it adds none to the project's thirteen.
 *
 * TEST COVERAGE IS ENTIRELY NET-NEW (B8)
 *
 * LEGACY-NOTE [meta/tests/unit/service/]: no legacy test touches this behaviour. That directory holds only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, none of which is in scope, and `meta/tests/unit/dao/` holds only AccountDAOTest and PaymentDAOTest. Every suite exercising this module is therefore NET-NEW and must be labelled net-new rather than presented as parity.
 * Across the whole migration only `meta/tests/unit/entity/BrandTest.cfc` and `meta/tests/unit/entity/ProductTest.cfc` are extended, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty stub contributing zero coverage. The obligation is real - every fragment above needs a test - but the test tier under `slatwall-ts/tests/**` is owned by a different author; this comment states the obligation, it does not discharge it, and this file authors no test.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT
 * `review_rules` returns the single line "No user rules provided." - a fixed
 * single-line sentinel rather than a paginated document, so the read is complete
 * and the absence is verified rather than assumed. No rule is invented to fill
 * it, and it is not treated as licence to lower the bar: the project's
 * enterprise substitutes apply at full strength here, and the ones this file
 * carries are maximal type strictness, the domain-inward layer boundary, the
 * single arithmetic surface, one exported unit with no barrel, and in-code
 * annotation of every judgment call and every preserved behaviour. Zero files
 * enter scope by rule mandate - there is no third, rule-driven category of
 * in-scope file - and there are consequently no rule conflicts to resolve.
 * `review_rules` remains the authoritative source; this is a record of its
 * result.
 *
 * LOCATOR CORRECTION, RECORDED SO A REVIEWER CAN RECONCILE IT
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc]: the `precisionEvaluate` census for this file is NINE sites, not the eight AAP 0.6.1 publishes. Verified by direct search of the 1125-line source, which returns exactly L150, L252, L299, L486, L990, L995, L1001, L1006 and L1007; the published list omits L1006, the subtraction that feeds `roundValueByRoundingRule`.
 * The project's locator-drift rule is that the SOURCE WINS, so the corrected census is recorded here rather than the published one being repeated. Exactly one of the nine - L299 - belongs to this module. (The shipped `src/lib/cfml/precision.ts` counts eleven in-scope sites by additionally including [model/service/PriceGroupService.cfc:L323] and [model/service/PriceGroupService.cfc:L331]; the two censuses agree on all nine `PromotionService.cfc` sites and differ only in scope, not in fact.)
 */

import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import type {
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
  UnlimitedUseSentinel,
} from '../../domain/promotionEngine/rewardUsageTypes.js';
import type { Money } from '../../domain/valueObjects/money.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import { structGet, structKeyExists } from '../../lib/cfml/struct.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

/**
 * The value the legacy engine seeds into all three use limits to mean "the
 * merchant configured no limit": one million, exactly as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L175-L177]: the seed at L173-L179 writes `maximumUsePerOrder = 1000000`, `maximumUsePerItem = 1000000` and `maximumUsePerQualification = 1000000`, and this constant names that literal without altering it. The digits are written without a numeric separator so that `1000000` greps identically in the target and in the source.
 * The declared type is the published `UnlimitedUseSentinel` alias, which is the literal type `1000000`, so the compiler - not a reviewer's diligence - is what holds this value to the source. `src/domain/promotionEngine/rewardUsageTypes.ts` publishes that alias as a TYPE rather than a `const` because a value declared there would put engine state in the domain's type layer, so naming the value is this module's job and this is the single place it is named.
 *
 * WHY NO SUBSTITUTION IS ACCEPTABLE - THE SENTINEL PARTICIPATES IN ARITHMETIC.
 * `Infinity`, `Number.MAX_SAFE_INTEGER`, `Number.POSITIVE_INFINITY`, `null`,
 * `undefined`, an optional property and a boolean `unlimited` flag are each
 * wrong here, because the value is not merely compared against - it is
 * multiplied, assigned and subtracted:
 *
 *   * [model/service/PromotionService.cfc:L223] compares the product
 *     `qualificationQuantity * maximumUsePerQualification` against
 *     `maximumUsePerOrder`, so a seeded sentinel is a MULTIPLICAND.
 *   * [model/service/PromotionService.cfc:L224] then assigns that same product
 *     back into `maximumUsePerOrder`, so the seeded value PROPAGATES into a
 *     stored limit.
 *   * [model/service/PromotionService.cfc:L228] derives `discountQuantity` from
 *     the same product, and
 *     [model/service/PromotionService.cfc:L236] clamps it against
 *     `maximumUsePerItem` - both facade-owned reads.
 *   * [model/service/PromotionService.cfc:L472] subtracts `maximumUsePerOrder`
 *     from `usedInOrder` during over-use stripping.
 *
 * Substitute `Infinity` and `qualificationQuantity * Infinity` is `Infinity`;
 * the L223 comparison `Infinity < Infinity` is false exactly as
 * `1000000 < 1000000` is false, so that one line survives the substitution and
 * gives false confidence. The two that do not survive are the L224 assignment,
 * which would store `Infinity` as a real limit, and the L472 subtraction, where
 * `Infinity - Infinity` is `NaN` and every subsequent comparison against it is
 * false. `undefined` or a flag would instead make L223's multiplication and
 * L471's comparison inexpressible without inventing a branch the legacy code
 * does not have. Changing the sentinel changes the money charged.
 *
 * ONE MILLION IS AN INHABITANT OF `number`, NOT A SEPARATE KIND OF VALUE.
 * The three limit members it seeds are typed `number`, never
 * `number | UnlimitedUseSentinel`. Nothing anywhere branches on "is this the
 * sentinel", and to every line that reads them a seeded sentinel and a
 * merchant-configured limit are the same kind of value. This constant exists to
 * name the seed and make it searchable, not to partition the type.
 */
const UNLIMITED_USE_UNTIL_CONFIGURED: UnlimitedUseSentinel = 1000000;

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port.
 *
 * CFML parity [model/service/PromotionService.cfc:L180, L183, L186]: the `!isNull(...)` half of each of the three override guards.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is the
 * right shape for a general-purpose predicate but gives the compiler nothing to
 * narrow with, so a limit typed `number | undefined` stays `number | undefined`
 * across it and the `> 0` comparison beside it will not compile. Wrapping it in
 * a type predicate keeps ONE definition of "nullish" in the subtree - the
 * delegation is real rather than decorative - while letting `strict` mode see
 * the narrowing. That matters because `@typescript-eslint/no-non-null-assertion`
 * is an error across `src/**`, and a `!` assertion is exactly the construct that
 * would silence the check protecting these three guards. The configured limits
 * are NARROWED, never asserted.
 *
 * The same wrapper, for the same reason, is already established in the shipped
 * sibling `src/services/promotion/discountAmount.ts`; this is that house pattern
 * rather than a new invention, and it is module-local and unexported because
 * this module exports exactly one unit.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Resolves one persisted use limit into the number the ledger will carry:
 * the merchant's value when it is present and positive, and the sentinel
 * otherwise.
 *
 * CFML parity [model/service/PromotionService.cfc:L180, L183, L186]: all three legacy override guards have the IDENTICAL shape `!isNull(x) && x > 0`, and that shape is reproduced verbatim in the single condition below. The three sites differ only in which accessor they read, so they are expressed once here and applied three times by {@link RewardUsageLedger.ensureRewardEntry} - a factoring of an identical predicate, not a change to it.
 *
 * ============ A PERSISTED ZERO MEANS UNLIMITED. THIS IS LOAD-BEARING. ======
 * The guard tests `> 0`, so a stored `0` FAILS it, the override never fires and
 * the sentinel survives. A promotion reward configured with
 * `maximumUsePerOrder = 0` is therefore treated as effectively UNLIMITED - not
 * as "may never be used", which is what the configuration looks like it says.
 * A NEGATIVE stored value fails the same test and takes the same path.
 *
 * This is counter-intuitive and is extremely easy to "fix" by accident, so, to
 * be explicit about the boundaries: `>` is never widened to `>=`; there is no
 * separate zero branch; zero is never treated as a limit; and no positivity
 * validation, no throw on a negative value and no normalisation of one is added,
 * because the legacy has none and adding validation the source lacks would
 * reject configurations the running system accepts today.
 *
 * A SECOND, DOCUMENTED ROUTE TO THE SAME OUTCOME
 * `model/entity/PromotionReward.cfc` declares all three limits as
 * `ormtype="integer" hb_nullRBKey="define.unlimited"`
 * [model/entity/PromotionReward.cfc:L65, L66, L67], so at the ENTITY layer
 * ABSENCE already means unlimited and the ported accessors return
 * `number | undefined` accordingly. The `!isNull(...)` half of the guard is what
 * handles that documented route; the `> 0` half is what silently produces the
 * undocumented one. Both are preserved, and this function is the single
 * translation point between the entity layer's "absent means unlimited"
 * convention and the ledger layer's numeric sentinel. The two conventions are
 * deliberately NOT harmonised.
 *
 * @param configuredLimit the persisted limit, `undefined` when the column is
 *   null.
 * @returns the configured limit when it is present and strictly positive, and
 *   {@link UNLIMITED_USE_UNTIL_CONFIGURED} in every other case.
 */
function resolveUseLimit(configuredLimit: number | undefined): number {
  if (!isAbsent(configuredLimit) && configuredLimit > 0) {
    return configuredLimit;
  }

  return UNLIMITED_USE_UNTIL_CONFIGURED;
}

/**
 * Store `value` on `target` under `key` as an OWN, enumerable data property.
 *
 * ★ WHY THIS EXISTS INSTEAD OF `target[key] = value`, AND WHY IT IS A MONEY
 * CONCERN. The key is a persisted `SwPromoReward.promotionRewardID` value, so it
 * is EXTERNALLY SOURCED. A plain object inherits `Object.prototype`, whose legacy
 * `__proto__` accessor intercepts `target['__proto__'] = value`, so the seeded
 * entry is silently DISCARDED. The consequence is not cosmetic: this ledger is
 * where `usedInOrder` accumulates, so a reward whose identifier is `__proto__`
 * would be RESEEDED on every {@link RewardUsageLedger.ensureRewardEntry} call,
 * its running usage would reset to zero each time, and its per-order use limit
 * would never be reached - the reward would apply without bound. Use-limit
 * enforcement is one of the three must-preserve behaviours of this migration, so
 * losing ledger state is a direct financial-integrity failure.
 * `Object.defineProperty` declares an own, enumerable, writable, configurable
 * data property, so the write cannot be intercepted.
 *
 * CFML parity [model/service/PromotionService.cfc:L173-L178]: a CFML struct has
 * no prototype chain and no reserved keys, so `promotionRewardUsageDetails[
 * '__proto__' ]` accumulated usage exactly like any other reward. The plain
 * assignment this replaces was the divergence, and it is the ONLY thing changing
 * here - no limit, no comparison, no arithmetic and no ordering is touched.
 *
 * The identical mechanism, for the identical reason, is used by
 * `src/lib/logger.ts` `redactPlainObject`, `src/domain/entities/sku.ts`,
 * `src/domain/entities/product.ts`,
 * `src/repositories/mysql/mysqlSkuRepository.ts`,
 * `src/services/priceGroupService.ts` and `src/services/productService.ts`.
 *
 * @param target the ledger being seeded. Mutated in place.
 * @param key the reward identifier. Used verbatim, never normalised.
 * @param value the seeded usage record.
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
 * The promotion engine's reward-usage ledger for ONE order: `var
 * promotionRewardUsageDetails = {};` [model/service/PromotionService.cfc:L139],
 * together with the five fragments that seed, ratchet, increment, divide and
 * order it.
 *
 * THE SINGLE EXPORTED UNIT OF THIS MODULE. There is no barrel, no default
 * export, and no second export: `isAbsent`, `resolveUseLimit` and
 * `UNLIMITED_USE_UNTIL_CONFIGURED` are module-local by design.
 *
 * JUDGMENT CALL: a CLASS, not a set of free functions over a passed-in record.
 * The alternative - exported functions each taking the ledger as their first
 * parameter - would mirror the CFML more literally, and it is the shape the
 * sibling `overUseStripping.ts` correctly uses because that module is a pure
 * transformation over a ledger it does not own. This module OWNS the ledger's
 * lifetime, and that difference is what decides the shape: an instance field
 * makes the request scoping described in the file header STRUCTURAL rather than
 * conventional, so the unsafe alternative - a module-level record shared across
 * warm-container invocations - cannot be reached by accident. A class is also
 * the idiomatic TypeScript expression of "a mutable structure threaded through a
 * loop", which the Minimal Change Clause requires: that clause scopes the
 * FUNCTIONAL surface, and a line-for-line CFML transliteration would violate it
 * rather than satisfy it.
 *
 * HOW THE FACADE USES IT. One instance per invocation of the promotion pass.
 * For each reward the facade calls {@link ensureRewardEntry} once, and then, for
 * each qualifying order item, {@link ratchetMaximumUsePerOrder} before it derives
 * `discountQuantity` and {@link recordOrderItemUsage} once the discount is known
 * to be positive. When both passes are finished it hands
 * {@link promotionRewardUsageDetails} to `stripOverUsedRewardDiscounts`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never mutates an `OrderItemView`, never
 * writes to order persistence and never holds a live order-item reference: the
 * Order aggregate is out of scope and reaches the engine only as a read-only
 * view at the anti-corruption boundary, so all this ledger retains of an order
 * item is its opaque `orderItemID` string. It also emits no
 * applied-promotion intent and constructs no `PromotionApplied`; that write-side
 * entity is out of this module's reach entirely.
 *
 * ZERO INTRA-FOLDER IMPORTS. This module imports nothing from
 * `src/services/promotion/**` and nothing from `src/services/**`, and in
 * particular it never imports the facade `src/services/promotionService.ts`
 * - the dependency is DIRECTIONAL, the facade may import the
 * decomposition modules, and a cycle back would be a gate failure. Its only
 * imports are four `import type`s from `src/domain/**` and two runtime helpers
 * from `src/lib/cfml/**`. It imports no repository, no handler and no
 * integration, and it imports no third-party package at all: `decimal.js` in
 * particular is reachable only through `Money`, which is the project's single
 * arithmetic surface.
 */
export class RewardUsageLedger {
  /**
   * Every reward's limits and running usage for THIS order, keyed by
   * `promotionRewardID`.
   *
   * CFML parity [model/service/PromotionService.cfc:L139]: `var promotionRewardUsageDetails = {};` - a struct local to one invocation, starting empty and gaining a key per reward encountered.
   * `private readonly` binds the FIELD, not its contents: the record itself is deliberately mutable, because {@link ensureRewardEntry} adds keys to it and the two members documented on `PromotionRewardUsageDetail` are mutated in place. It is an INSTANCE field, which is what confines it to one request - see the file header for why that is a correctness requirement rather than a matter of tidiness.
   */
  private readonly ledger: PromotionRewardUsageDetails = {};

  /**
   * The ledger itself, for the one consumer that needs the whole structure
   * rather than a single entry.
   *
   * Named for the legacy variable at
   * [model/service/PromotionService.cfc:L139] so that the correspondence is
   * visible at the call site. `stripOverUsedRewardDiscounts` in the shipped
   * sibling `src/services/promotion/overUseStripping.ts` takes exactly this
   * structure as its first parameter: it iterates the keys with
   * `Object.entries`, which reproduces the legacy `for(var prID in
   * promotionRewardUsageDetails)` at
   * [model/service/PromotionService.cfc:L468], and it reads entries by a leaked
   * reward identifier as the source does.
   *
   * JUDGMENT CALL: this returns the LIVE record rather than a copy, and the
   * return type is deliberately not wrapped in `Readonly<>`. Copying would break
   * the algorithm rather than protect it - the legacy structure is one shared
   * mutable local, over-use stripping is specified against the ratcheted and
   * incremented values this class produced, and a snapshot taken at any moment
   * would be a different structure from the one the source works on. A
   * `Readonly<>` return type would additionally not even be assignable to the
   * consumer's `PromotionRewardUsageDetails` parameter, so the mutability is part
   * of the published contract and not an oversight here.
   */
  public get promotionRewardUsageDetails(): PromotionRewardUsageDetails {
    return this.ledger;
  }

  /**
   * Ensures this order's ledger has an entry for the given reward, seeding it on
   * first encounter and leaving it completely untouched afterwards.
   *
   * CFML parity [model/service/PromotionService.cfc:L171-L189]: the guarded seed. `if(!structKeyExists(promotionRewardUsageDetails, reward.getPromotionRewardID()))` at L172 wraps the whole of L173-L188, so an entry is seeded EXACTLY ONCE PER REWARD PER INVOCATION and a re-encountered reward keeps every bit of state it has accumulated - the incremented `usedInOrder`, the ratcheted `maximumUsePerOrder` and the ordered `orderItemsUsage`.
   * That guard is what makes this structure a LEDGER rather than a per-iteration scratch struct, and it matters because the legacy reward loop genuinely revisits rewards: the two-pass iteration at [model/service/PromotionService.cfc:L458-L461] resets its counter to 0 and runs the whole collection a second time, so every reward is seen at least twice.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L171]: the source comment on this block reads "This will be used for the maxUsePerQualification & and maxUsePerItem up front, and then later to remove discounts that violate max usage" - the stray "& and" is the source's own wording and is quoted here unaltered rather than silently corrected.
   * Its substance is accurate and worth keeping: the per-qualification and per-item limits are consumed UP FRONT, by the ratchet and by the facade's clamp, whereas the per-order limit is consumed LATER, by over-use stripping after both passes have finished.
   *
   * JUDGMENT CALL: the three limits are RESOLVED BEFORE the entry is constructed,
   * rather than seeded to the sentinel and then conditionally overwritten as
   * L173-L188 does. This is forced by the published contract:
   * `PromotionRewardUsageDetail` declares `maximumUsePerItem` and
   * `maximumUsePerQualification` `readonly` - correctly, because the legacy never
   * writes them again after this block - so a post-construction overwrite is not
   * expressible and should not be made expressible by widening a domain type to
   * suit a transliteration. The outcome is identical: the entry is not reachable
   * by anything between L173 and L188, the ledger key is not published until the
   * assignment below, and every guard is evaluated exactly as the source
   * evaluates it. The intermediate state the source passes through is therefore
   * unobservable, which is what makes this a faithful re-expression rather than a
   * divergence.
   *
   * The returned entry is what makes the rest of this class's surface safe to
   * use: the caller holds a narrowed `PromotionRewardUsageDetail` and passes it
   * back to {@link ratchetMaximumUsePerOrder} and
   * {@link recordOrderItemUsage}, so no consumer has to index the ledger and
   * none is tempted into a non-null assertion.
   *
   * @param reward the promotion reward being processed; only its identifier and
   *   its three use limits are read.
   * @returns the existing entry when one is already present, otherwise the entry
   *   just seeded.
   */
  public ensureRewardEntry(reward: PromotionReward): PromotionRewardUsageDetail {
    const promotionRewardID = reward.getPromotionRewardID();

    // [model/service/PromotionService.cfc:L172] `if(!structKeyExists(...))` - the
    // presence test is delegated to the CFML `structKeyExists` port, which folds
    // key case exactly as a CFML struct does, so the guard behaves the way the
    // source's guard behaves rather than the way a bare TypeScript `in` would.
    if (structKeyExists(this.ledger, promotionRewardID)) {
      // The presence test and the read are two separate obligations here, and
      // both are honoured. `noUncheckedIndexedAccess` types this read
      // `PromotionRewardUsageDetail | undefined` regardless of what the guard
      // above proved, and `@typescript-eslint/no-non-null-assertion` is an error
      // across `src/**`, so the entry is NARROWED into a local and tested. The
      // compiler then proves what the CFML merely assumed.
      //
      // ★ THE READ FOLDS KEY CASE, EXACTLY AS THE GUARD ABOVE DOES, AND THIS
      // PARAGRAPH RECORDS WHY IT MUST. A superseded revision read
      // `this.ledger[promotionRewardID]` directly - a CASE-SENSITIVE lookup
      // behind a CASE-INSENSITIVE guard - so an identifier differing only in
      // case passed `structKeyExists`, read back `undefined`, and fell through
      // to seed a SECOND ledger entry. That is not CFML behaviour: a CFML struct
      // key is case-insensitive, so [model/service/PromotionService.cfc:L172]
      // finds the existing entry and L189 leaves it untouched. The divergence
      // was money-affecting in one direction - usage would split across two
      // entries and `maximumUsePerOrder` would be UNDER-enforced, letting a
      // reward apply more times than its own limit allows - and the previous
      // note calling the fall-through "the safe resolution" had it backwards.
      // Both halves now resolve through the same `findStoredKey` in
      // `../../lib/cfml/struct.js`, so they cannot disagree at all: a
      // case-differing identifier reuses the one entry with its accumulated
      // `usedInOrder` and its FIRST-SEEN limits intact, which is what the
      // "first-wins on the limits" case in this module's suite asserts for the
      // exact-spelling path.
      //
      // The `!== undefined` test below therefore narrows a type rather than
      // deciding behaviour: it can only fail for a key stored with a literally
      // `undefined` value, and nothing in this module ever stores one - the seed
      // below always constructs a complete entry.
      const existingUsage = structGet(this.ledger, promotionRewardID);

      if (existingUsage !== undefined) {
        // [model/service/PromotionService.cfc:L189] the guard's closing brace:
        // when the entry exists the legacy block does NOTHING AT ALL. No
        // re-seed, no re-read of the reward's limits, no reset of accumulated
        // usage.
        return existingUsage;
      }
    }

    // [model/service/PromotionService.cfc:L173-L179] the seed, and
    // [model/service/PromotionService.cfc:L180-L188] the three overrides, both
    // expressed as one construction; see the JUDGMENT CALL above.
    const seededUsage: PromotionRewardUsageDetail = {
      // [model/service/PromotionService.cfc:L174] `usedInOrder = 0`. A COUNT of
      // uses, seeded to the number zero - never `Money.zero`. Counts stay plain
      // numbers throughout this module.
      usedInOrder: 0,

      // [model/service/PromotionService.cfc:L175, L180-L182]
      maximumUsePerOrder: resolveUseLimit(reward.getMaximumUsePerOrder()),

      // [model/service/PromotionService.cfc:L176, L183-L185]
      maximumUsePerItem: resolveUseLimit(reward.getMaximumUsePerItem()),

      // [model/service/PromotionService.cfc:L177, L186-L188]
      maximumUsePerQualification: resolveUseLimit(reward.getMaximumUsePerQualification()),

      // [model/service/PromotionService.cfc:L178] `orderItemsUsage = []`. A
      // fresh, EMPTY and MUTABLE array per reward; the ascending insertion sort
      // below is the only thing that ever adds to it.
      orderItemsUsage: [],
    };

    // `putOwnStructKey`, not `this.ledger[promotionRewardID] = seededUsage`: the key is a
    // persisted reward identifier, and a plain assignment for `__proto__` would store
    // nothing - reseeding the entry on every call and resetting `usedInOrder` to zero, so
    // the reward's per-order limit could never be reached.
    putOwnStructKey(this.ledger, promotionRewardID, seededUsage);

    return seededUsage;
  }

  /**
   * Ratchets a reward's per-order use limit DOWN to the allowance implied by how
   * many times one order item qualifies, when that allowance is strictly smaller
   * than the limit already recorded.
   *
   * CFML parity [model/service/PromotionService.cfc:L223-L224]: `if((qualificationQuantity * maximumUsePerQualification) lt maximumUsePerOrder) { maximumUsePerOrder = (qualificationQuantity * maximumUsePerQualification); }`. The CFML word operator `lt` is STRICTLY less than, so an allowance EQUAL to the current limit does not re-assign - a distinction that is invisible in the outcome here but must not be relaxed to `<=`, because the source's own most common case is exactly the equal one: a qualification quantity of 1 against an unconfigured `maximumUsePerQualification` yields `1 * 1000000`, which is not less than the seeded `1000000`.
   * The product is computed ONCE here and used for both the comparison and the assignment, where the source recomputes the identical expression on each of the two lines. Both operands are plain integer counts, so the two formulations are arithmetically indistinguishable.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L223-L224]: THIS RATCHET IS AN ORDER-DEPENDENCE MECHANISM IN ITS OWN RIGHT, and it was identified while analysing this decomposition rather than being one of the five vectors AAP 0.6.1 publishes - it is recorded here so the count of known mechanisms is honest rather than inherited. The ratchet sits INSIDE the order-item loop, it fires at most once per qualifying item, and it only ever LOWERS `maximumUsePerOrder`. Over-use stripping then reads the RATCHETED value at [model/service/PromotionService.cfc:L471-L472], never the seeded one.
   * The consequence is that the final per-order limit depends on WHICH order items qualified and in WHAT ORDER they were visited, which is why this method is deliberately non-idempotent across differing inputs and why no reset, no per-item snapshot and no restore of the seeded value is provided: the value is monotonically non-increasing for the whole invocation, and any of those additions would discard exactly the accumulated state the source relies on.
   *
   * ARITHMETIC ON COUNTS, NOT ON MONEY. `qualificationQuantity`,
   * `maximumUsePerQualification` and `maximumUsePerOrder` are all counts of uses,
   * so this multiplication and comparison stay on plain `number` and are
   * deliberately NOT routed through `Money`. The project's single-arithmetic-
   * surface standard governs monetary values, and wrapping a use count in a
   * currency type would misrepresent the domain; the only monetary value in this
   * module is `discountPerUseValue`.
   *
   * @param usage the ledger entry returned by {@link ensureRewardEntry} for the
   *   reward being processed.
   * @param qualificationQuantity how many times this order item qualifies under
   *   the reward's promotion period, read by the facade at
   *   [model/service/PromotionService.cfc:L222].
   */
  public ratchetMaximumUsePerOrder(
    usage: PromotionRewardUsageDetail,
    qualificationQuantity: number,
  ): void {
    // [model/service/PromotionService.cfc:L223, L224] the product both lines
    // compute.
    const qualifiedUseAllowance = qualificationQuantity * usage.maximumUsePerQualification;

    // [model/service/PromotionService.cfc:L223] `lt` is strict; see the parity
    // note above for why this must not become `<=`.
    if (qualifiedUseAllowance < usage.maximumUsePerOrder) {
      // [model/service/PromotionService.cfc:L224] the ratchet, in place.
      usage.maximumUsePerOrder = qualifiedUseAllowance;
    }
  }

  /**
   * Records one application of a reward to one order item: charges the use
   * against the reward's running total, derives the discount's per-use value and
   * files it in ascending order.
   *
   * CFML parity [model/service/PromotionService.cfc:L296-L329]: the three fragments the legacy performs as one unconditional contiguous sequence, inside the `if(discountAmount > 0)` gate opened at L257 - the increment at L297, the division at L299, and the ascending insertion at L301-L329.
   * The `discountAmount > 0` gate itself is FACADE-OWNED and is not re-tested here: this method is the body of that branch, not the branch.
   *
   * JUDGMENT CALL: fragments 3, 4 and 5 share ONE public method, and the
   * alternative of three separately callable methods was rejected on fidelity
   * grounds rather than aesthetic ones. The legacy performs all three
   * unconditionally and in this exact order every time the gate opens; there is
   * no source path that increments without filing, files without incrementing, or
   * reorders the two. Three public methods would make all of those reachable, and
   * exposing the division alone would additionally relocate the choice of ITS
   * OPERANDS into the facade - which is precisely the decision this module is
   * meant to own. The ascending sort is still isolated in its own named private
   * method, so each of the five owned fragments maps one-to-one onto a named unit
   * and remains individually reviewable.
   *
   * LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: the increment below is the promotion engine's primary order-dependence mechanism, and the reason it is genuinely non-deterministic is the reward collection's ORDER. `getActivePromotionRewards` ends in `ormExecuteQuery` at L131 with NO `ORDER BY` - verified by a case-insensitive search of all 593 lines of that DAO, which returns ZERO matches - so the iteration order is whatever the driver returns.
   * Because `usedInOrder` accumulates in place, whether a later reward is still allowed to apply depends on which earlier rewards ran, so at an exact tie the money charged can differ between two runs over identical data. The absence of ordering is PRESERVED, at the repository, where `src/repositories/mysql/mysqlPromotionRepository.ts` already carries its own marker forbidding an implementation from adding one; this note records the fact and does not restate that module's annotation. Nothing in this module sorts, re-orders or otherwise assumes an order over the reward collection, and no stabilising tie-break is introduced anywhere in it - imposing one here would make a non-deterministic legacy behaviour deterministic in one arbitrary direction, which is a change to behaviour dressed up as a cleanup.
   *
   * @param usage the ledger entry returned by {@link ensureRewardEntry} for the
   *   reward being applied.
   * @param orderItem the read-only view of the order item receiving the discount;
   *   only its opaque `orderItemID` is read, and it is never mutated.
   * @param discountQuantity how many uses this application consumes, already
   *   derived and clamped by the facade at
   *   [model/service/PromotionService.cfc:L228-L238].
   * @param discountAmount the discount for this item, already computed by the
   *   facade at [model/service/PromotionService.cfc:L244] or
   *   [model/service/PromotionService.cfc:L252].
   * @throws if `discountQuantity` is zero. The legacy divisor is unguarded and
   *   this reproduces that exactly; see the note on the division below.
   */
  public recordOrderItemUsage(
    usage: PromotionRewardUsageDetail,
    orderItem: OrderItemView,
    discountQuantity: number,
    discountAmount: Money,
  ): void {
    // [model/service/PromotionService.cfc:L296-L297] "Increment the number of
    // times this promotion reward has been used" - `usedInOrder += discountQuantity`,
    // IN PLACE on the shared entry. This single statement is what threads state
    // through the whole reward loop; see the ordering note above.
    usage.usedInOrder += discountQuantity;

    // [model/service/PromotionService.cfc:L299]
    // `var discountPerUseValue = precisionEvaluate('discountAmount / discountQuantity');`
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L299]: THE DIVISOR IS UNGUARDED, AND THE ABSENCE OF THE GUARD IS REPRODUCED DELIBERATELY. The source applies no zero check to `discountQuantity`, so a zero divisor raises a division-by-zero error in CFML. `Money.dividedBy` resolves through the arbitrary-precision substrate, which refuses a zero divisor and throws, AND THAT THROW IS ALLOWED TO PROPAGATE: it is not caught here, not defaulted to zero, not resolved to `Money.zero`, and not short-circuited by an early return when `discountQuantity` is zero.
    // Adding a guard would be adding validation the legacy lacks, and each of the plausible "safe" resolutions is worse than the throw: returning zero would silently invent money by filing a free use against the reward, and skipping the filing would silently under-enforce the per-order limit because L297 above has ALREADY charged the use. The shipped `Money.dividedBy` documents this same call site and assigns the guard decision to this module by name; the decision recorded here is that there is no guard. This is one of four unguarded divisions across the decomposition, and none of the four is guarded.
    //
    // `precisionEvaluate` is translated into a typed call on the single
    // arithmetic surface, never into a string evaluator: `Money` reaches
    // arbitrary-precision arithmetic through `src/lib/cfml/precision.ts`, which
    // deliberately publishes no expression evaluator, and no `eval`, no
    // `new Function`, no `vm` and no hand-rolled expression parser appears
    // anywhere in this file. `discountQuantity` is passed as the plain integer
    // count it is - `dividedBy` accepts a non-monetary integer divisor for
    // exactly this case - so no count is ever wrapped in `Money`, and no raw
    // floating-point operation touches the monetary value.
    const discountPerUseValue = discountAmount.dividedBy(discountQuantity);

    this.insertUsageInAscendingOrder(
      usage,
      orderItem.orderItemID,
      discountQuantity,
      discountPerUseValue,
    );
  }

  /**
   * Files one usage record into a reward's `orderItemsUsage`, keeping the array
   * in ascending order of `discountPerUseValue`.
   *
   * CFML parity [model/service/PromotionService.cfc:L301-L329]: the ascending insertion sort. It scans for the FIRST existing record whose `discountPerUseValue` is STRICTLY GREATER than the newcomer's, inserts before it and stops; when no such record is found the newcomer is appended. Ascending order is what lets over-use stripping remove the CHEAPEST-PER-USE discounts first as it walks `orderItemsUsage` from index 1 at [model/service/PromotionService.cfc:L475].
   *
   * THE TIE-BREAK IS STRICT AND FAVOURS THE INCUMBENT. L306 tests `>`, not
   * `>=`, so a newcomer whose per-use value EQUALS an existing record's does not
   * displace it: the scan simply continues past every equal record and the
   * newcomer ends up AFTER all of them - appended at the end when no strictly
   * greater record exists at all. Equal-valued records therefore accumulate in
   * arrival order, which given the unordered reward collection is itself part of
   * the non-determinism described on {@link recordOrderItemUsage}. Relaxing this
   * comparison to `>=` would insert the newcomer before its equals and change
   * which discount over-use stripping reaches first.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L303]: the source comment above this loop reads "loop over any previous orderItemUsage of this reward an place it in ASC order based on discountPerUseValue" - "an" for "and" is the source's own typo, quoted here unaltered rather than silently corrected.
   * It is preserved because the comment is the source's own statement of intent for this ordering, and the ordering is behaviour that must survive; correcting the prose would make the quotation no longer a quotation.
   *
   * CFML parity [model/service/PromotionService.cfc:L304, L309]: CFML ARRAYS ARE 1-BASED AND TYPESCRIPT ARRAYS ARE 0-BASED, so the index mapping is stated explicitly. The legacy loop runs `oiu = 1 .. arrayLen(...)` and `arrayInsertAt(array, oiu, item)` inserts BEFORE the element currently at 1-based position `oiu`; `array.splice(index, 0, item)` inserts before the element at 0-based position `index`. Legacy `oiu` and the `index` below therefore denote THE SAME ELEMENT throughout - `index === oiu - 1` - and both operations insert before it, so the resulting order is identical.
   * The 1-based loop is NOT emulated: `entries()` yields the 0-based index alongside a non-optional element, which is the idiomatic TypeScript form and also the one that needs no undefined-narrowing and no non-null assertion under `noUncheckedIndexedAccess`.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L304, L315-L316, L320]: two mechanical simplifications, neither of which changes the outcome. First, the legacy re-evaluates `arrayLen(...)` on every iteration where the array reference is captured once below; the array is LIVE either way, because neither a CFML struct member nor a TypeScript property access returns a defensive copy, and the loop is exited immediately on the one iteration that mutates it. Second, the legacy `usageAdded` flag exists only to let `if(!usageAdded)` at L320 skip the append after the `break` at L316, so an early `return` from this method expresses the same control flow directly and the flag is not reproduced.
   * Both are code-shape changes required by the Minimal Change Clause's demand for idiomatic TypeScript, and neither alters which element is inserted where.
   *
   * BOTH PATHS CONSTRUCT A FRESH RECORD. The source builds a separate
   * three-member literal at L309-L313 and again at L323-L327 with no shared
   * factory between them, and that is reproduced: the two literals below are
   * independent objects and no single record object is ever shared between the
   * insert path and the append path. Each carries exactly the three published
   * members and no fourth - the literals are contextually typed by the element
   * type of `PromotionRewardUsageDetail['orderItemsUsage']`, so excess-property
   * checking is what enforces that rather than a comment.
   *
   * `orderItemsUsage` is mutated through its `readonly` PROPERTY binding, which
   * is exactly the published contract: the binding cannot be reassigned, and the
   * contents can be spliced and pushed. Nothing here wraps it in `Readonly<>` or
   * treats it as a `ReadonlyArray`; either would make this method inexpressible.
   *
   * Module-private: the ordering is a property of this ledger, and it is
   * deliberately NOT a reusable sorted-insert utility. See the file header for
   * the descending counterpart it must never be unified with.
   */
  private insertUsageInAscendingOrder(
    usage: PromotionRewardUsageDetail,
    orderItemID: string,
    discountQuantity: number,
    discountPerUseValue: Money,
  ): void {
    const orderItemsUsage = usage.orderItemsUsage;

    // [model/service/PromotionService.cfc:L304] the scan. `index` is the 0-based
    // counterpart of the legacy 1-based `oiu`; see the index-mapping note above.
    for (const [index, existingUsage] of orderItemsUsage.entries()) {
      // [model/service/PromotionService.cfc:L306] STRICTLY greater, expressed on
      // the closed `Money` surface: `isGreaterThan` is the comparison the value
      // object publishes, and there is no `min`, no `max` and no sort helper on
      // it to reach for instead. No raw floating-point comparison of a monetary
      // value appears here.
      if (existingUsage.discountPerUseValue.isGreaterThan(discountPerUseValue)) {
        // [model/service/PromotionService.cfc:L309-L313] `arrayInsertAt(..., oiu, {...})`.
        orderItemsUsage.splice(index, 0, {
          orderItemID,
          discountQuantity,
          discountPerUseValue,
        });

        // [model/service/PromotionService.cfc:L315-L316] `usageAdded = true; break;`
        // - insert at the FIRST strictly greater position, then stop, and skip
        // the append.
        return;
      }
    }

    // [model/service/PromotionService.cfc:L320-L329] `if(!usageAdded)` -
    // `arrayAppend(..., {...})`. Reached when the array was empty or when every
    // existing record's per-use value is less than or equal to the newcomer's,
    // which is where an equal-valued newcomer lands.
    orderItemsUsage.push({
      orderItemID,
      discountQuantity,
      discountPerUseValue,
    });
  }
}
