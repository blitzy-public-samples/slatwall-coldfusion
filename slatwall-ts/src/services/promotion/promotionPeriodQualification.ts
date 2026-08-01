/**
 * slatwall-ts - PROMOTION PERIOD QUALIFICATION: whether a promotion period may be applied to an
 * order at all, which of the order's fulfillments it permits, and - for the two orphaned helpers
 * hosted here - which fulfillment IDs survive a weight filter and how many times one order item
 * qualifies.
 *
 * WHAT THIS FILE IS
 * A one-to-one port of THREE private CFML helpers, all from `model/service/PromotionService.cfc`,
 * which is the SOLE BEHAVIOURAL AUTHORITY for every line below:
 *
 *   PRIMARY    `getPromotionPeriodQualificationDetails`        [L549-L627]  ASYNC
 *   ORPHAN #1  `getPromotionPeriodQualifiedFulfillmentIDList`  [L752-L781]  SYNCHRONOUS
 *   ORPHAN #2  `getPromotionPeriodOrderItemQualificationCount` [L783-L849]  SYNCHRONOUS
 *
 * `model/dao/PromotionDAO.cfc` and `model/entity/PromotionQualifier.cfc` were read only as
 * repository and accessor contracts; neither contributes behaviour here. Where any brief disagreed
 * with the component, the component won and the correction is recorded as a `LEGACY-NOTE` at the
 * site or in the corrections block below.
 *
 * THE ORPHANED-HELPER HOSTING RULING
 * ORPHAN #1 and ORPHAN #2 fall outside every other decomposition module's cited source range, so
 * they are hosted HERE. `L549-L627` is this module's PRIMARY extract, not an exhaustive one. The
 * promotion decomposition folder is exactly nine modules: no tenth module for the orphans, no
 * `index.ts`, no barrel, no shared `types.ts` or `helpers.ts`, no `sql/` directory and no nested
 * subfolder. The two orphans are public members of the one class this file exports.
 *
 * WHY IT MATTERS
 * This sits directly beneath must-preserve area #1 - promotion discount math together with
 * use-limit enforcement semantics. Both use-count gates in the PRIMARY body ARE use-limit
 * enforcement, and their single `qualificationsMeet` output gates whole branches of the engine
 * [model/service/PromotionService.cfc:L197, L1053]. ORPHAN #2's return value flows into the ledger
 * ratchet at [model/service/PromotionService.cfc:L222-L224] and therefore shapes
 * `maximumUsePerOrder`. A wrong answer anywhere here does not produce a slightly different
 * discount - it changes the money a customer is charged.
 *
 * THE ASYNC BOUNDARY, DERIVED RATHER THAN ASSUMED
 * The PRIMARY method is `async` for exactly one reason: the legacy body reaches
 * `getPromotionDAO()` twice, at [model/service/PromotionService.cfc:L567] and
 * [model/service/PromotionService.cfc:L576]. Everything else it does traverses already-materialized
 * associations or compares plain integers. BOTH ORPHANS REACH NO DAO AND NO ORM, so both stay
 * SYNCHRONOUS - neither is promoted to `async` "for consistency", which would be a signature
 * reshaping, and none of those remain.
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE TO THIS MODULE, AND STATED RATHER THAN SILENTLY OMITTED.
 * The project standard is that every query uses prepared statements, preserving the injection
 * safety `cfqueryparam` provided. This module executes no query of any kind - no SQL string, no
 * driver import, no connection, no interpolation site. The two counts it needs arrive through the
 * injected promotion repository port, and every statement that touches the `Sw*` schema lives in
 * `src/repositories/mysql/**`. Silence here would read as an oversight, so the exemption is on the
 * record.
 *
 * MONEY (E4): SATISFIED AFFIRMATIVELY BY ABSENCE, WHICH IS ALSO STATED RATHER THAN OMITTED.
 * CFML parity: this module handles no monetary values, so `Money` is deliberately not imported;
 * every numeric here is a plain integer count or a plain fulfillment weight. The full census across
 * the three ranges: use counts and their maxima [L566, L568, L574, L577], a qualification count
 * [L593], an array length [L621], fulfillment weights [L769, L771], and quantities and
 * qualification counts [L785, L801, L825, L831, L835, L840, L848]. None of the nine
 * `precisionEvaluate` sites in the component - verified at L150, L252, L299, L486, L990, L995,
 * L1001, L1006 and L1007 - falls inside these ranges, so `src/lib/cfml/precision.ts` is not
 * imported either.
 *
 * SCHEMA CONTINUITY (B5): NOTHING IS PERSISTED, AND NO VALIDATION THE LEGACY LACKS IS ADDED.
 * This module computes in-memory verdicts and returns them. No table, no column, no migration. It
 * adds no `qualifierType` validation, no `rewardMatchingType` exhaustiveness check, no
 * `minimumItemQuantity > 0` requirement, no null guard the legacy does not already have, and no
 * runtime ordering check. The two places a `throw` appears - [L774] and [L831] - are REPRODUCTIONS
 * of failures the legacy raises, not validation of my own; each carries its own annotation.
 *
 * NO MODULE-LEVEL MUTABLE STATE - A CORRECTNESS CONSTRAINT, NOT HOUSEKEEPING.
 * On a warm Lambda container, module-level state survives between UNRELATED invocations, so a
 * cached qualification verdict could leak one customer's result into another customer's order. The
 * only module-scope bindings below are pure functions and one type declaration; not one of them
 * holds state. The `promotionPeriodQualifications` memo is NOT created here: it is an
 * invocation-local `var` in both legacy consumers [model/service/PromotionService.cfc:L136, L1038]
 * and stays owned by the callers, request-scoped. (The single documented module-state exception
 * anywhere in this subtree is the MySQL connection pool in `src/repositories/mysql/connection.ts`.)
 *
 * NO SETTINGS AND NO AMBIENT SCOPE. This module reads no setting, takes no `settingsProvider`, and
 * never touches `src/lib/config.ts` - process configuration is not a request scope. Everything the
 * three algorithms need arrives through their parameters and the three injected collaborators.
 *
 * VIEWS ARE READ-ONLY AND NOTHING IS WRITTEN BACK.
 * `OrderView`, `OrderItemView` and `OrderFulfillmentView` are the anti-corruption projections of an
 * out-of-scope aggregate. Their `orderItemID` / `orderFulfillmentID` values are OPAQUE strings,
 * carried verbatim and never parsed. Nothing here mutates a view or a collection it receives, and
 * nothing here writes to order persistence.
 *
 * THE TWO CONSUMERS OF THE PRIMARY METHOD, AND WHY BOTH ARE SERVED
 * Consumer #1 is the engine `updateOrderAmountsWithPromotions`: memo at
 * [model/service/PromotionService.cfc:L136], lazy populate at L192-L193, then it reads every live
 * member - `qualificationsMeet` at L197, `qualifiedFulfillmentIDs` at L209 and L351, and
 * `orderItems` at L212-L213, L217 and L222. Consumer #2 is the facade's
 * `getShippingMethodOptionsDiscountAmountDetails` [model/service/PromotionService.cfc:L1032]: memo
 * at L1038, lazy populate at L1048-L1049 with the order derived from a shipping-method option, and
 * it reads ONLY `qualificationsMeet` at L1053. So the returned record must be fully usable when
 * only `qualificationsMeet` is consulted, and the order must arrive as a PARAMETER - this module
 * assumes no provenance for it and reaches for no ambient state.
 *
 * LEGACY-NOTE: the folder's no-intra-folder-imports discipline is DIRECTIONAL. The facade
 * ../promotionService.ts may import all nine modules; nothing here may import the facade back.
 * Sibling imports among the nine are permitted while the graph stays acyclic: this module imports
 * ./qualifierQualification.ts (L590) and ./orderItemMembership.ts (L805);
 * ./qualifierQualification.ts imports ./orderItemMembership.ts (L727); ./orderItemMembership.ts
 * imports no sibling. No cycle.
 * The alternative - injecting each collaborating function as an extra parameter - would consume a
 * signature widening, and ZERO signature widenings remain project-wide.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L549]: private in legacy; exported here as project
 * visibility widening #1 so the behaviour is directly testable. Visibility only - behaviour
 * unchanged.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L752]: private in legacy; exported here as project
 * visibility widening #3 so the behaviour is directly testable. Visibility only - behaviour
 * unchanged.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L783]: private in legacy; exported here as project
 * visibility widening #4 so the behaviour is directly testable. Visibility only - behaviour
 * unchanged.
 * Three of the five permitted visibility widenings are consumed by this one file; #2
 * (`getQualifierQualificationDetails` [L629]) is spent in ./qualifierQualification.ts and #5
 * (`getDiscountAmount` [L987]) in ./discountAmount.ts. THE LEDGER IS NOW EXHAUSTED, and no other
 * private method of the legacy component is promoted anywhere. Visibility widenings and SIGNATURE
 * widenings are separate ledgers and are never conflated: the single signature-widening slot is
 * already spent on `isCurrent(now?: Date)` in `src/domain/entities/promotionPeriod.ts`, so no
 * parameter is added, removed, reordered or defaulted on any of the three methods below.
 *
 * ------------------------------------------------------------------------------------------------
 * THREE CORRECTIONS WHERE THE BRIEF AND THE SOURCE DISAGREED. THE SOURCE WON.
 * ------------------------------------------------------------------------------------------------
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L569, L613, L614, L615]: cited as
 * L570/L614/L615/L616; verified at L569/L613/L614/L615. Locators corrected against source per the
 * project locator-drift rule.
 * The three `qualificationsMeet = false` writes are at L569, L578 and L613, and the early-return
 * reset writes `qualifiedFulfillmentIDs` at L614 and `qualifierDetails` at L615 with the `return`
 * itself at L616.
 *
 * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L109-L113]: `rewardMatchingType` was cited as the
 * four-value vocabulary `sku | product | productType | brand`; the entity declares FIVE select
 * options and the first is `any`.
 * The published `RewardMatchingType` union agrees, so `any` is a FIRST-CLASS CONFIGURED VALUE that
 * takes the permissive fallthrough at [model/service/PromotionService.cfc:L808-L818] by design
 * rather than by accident. That makes the absence of a default branch there deliberate, and it is
 * reproduced without validation - see the annotation on the exclusion disjunction.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L549, L752, L783]: the first parameter was cited
 * as `period`; the legacy declares `required any promotionPeriod` at all three sites and the three
 * published signature aliases in `../../domain/promotionEngine/qualificationTypes.ts` name it
 * `promotionPeriod` too, so that is the name used below.
 * Parameter COUNT, ORDER and OPTIONALITY are identical either way, so this spends nothing from the
 * signature-reshaping or signature-widening ledgers; it simply keeps the ported surface diffable
 * against the CFML source name for name.
 *
 * ------------------------------------------------------------------------------------------------
 *
 * LEGACY-NOTE [meta/tests/unit/service]: TEST COVERAGE FOR THIS MODULE IS NET-NEW, NOT PARITY.
 * The legacy suite's service tier holds only AccountServiceTest, HibachiServiceTest,
 * PaymentServiceTest and UtilityRBServiceTest, none of which is in scope, and the only two legacy
 * tests touching this slice at all cover the Brand and Product entities.
 * Nothing exercised here traces to a legacy antecedent, so none of it may be presented as
 * carried-forward coverage. The obligation is still real - every converted method needs a test, and
 * the characterization suites must pin current behaviour INCLUDING every defect reproduced below -
 * but `slatwall-ts/tests/**` is authored separately and this module creates no test file.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT. The rules document returns exactly "No user rules
 * provided.", re-queried both without a range and over the whole document with byte-identical
 * results, so the absence is verified rather than assumed. No rule is invented to fill it, no file
 * enters scope by rule mandate, there is no rule conflict to resolve, and the absence is not
 * treated as licence to lower the bar: maximal strictness with no `any`, no suppression comment and
 * no non-null assertion; one exported unit; no barrel; every judgment call annotated where it was
 * made.
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
import { isNullish } from '../../lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------------------------
// MODULE-LOCAL HELPERS. None is exported: this file exports exactly one unit (E7), and every
// helper below exists to reproduce a CFML semantic that the strict profile will not let me write
// inline. All are pure functions - none of them holds state.
// ---------------------------------------------------------------------------------------------

/**
 * A narrowing wrapper over the shared `isNullish()` port of CFML `isNull()`, in the POSITIVE
 * polarity the source writes as `!isNull(...)`.
 *
 * CFML parity [model/service/PromotionService.cfc:L566, L574, L575, L769, L771, L830]: the six
 * `!isNull(...)` tests this module reproduces - the two period use-count overrides, the account
 * presence test, the two fulfillment weight bounds, and the minimum item quantity.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is right for a general-purpose
 * predicate but gives the compiler nothing to narrow with. Wrapping it in a type predicate keeps ONE
 * definition of "nullish" in the subtree - the delegation is real, not decorative - while letting
 * strict mode see the narrowing. That matters because `@typescript-eslint/no-non-null-assertion` is
 * an error across `src/**`, and a postfix `!` is exactly the construct that would silence the checks
 * protecting these branches. Every nullable value below is NARROWED, never asserted.
 */
function isPresent<TValue>(value: TValue | undefined): value is TValue {
  return !isNullish(value);
}

/**
 * The same wrapper in the NEGATIVE polarity the source writes as `isNull(...)`.
 *
 * CFML parity [model/service/PromotionService.cfc:L814, L816]: the two brand-absence clauses of the
 * exclusion disjunction, which are the only bare `isNull(...)` tests in the three ported ranges.
 * Both polarities are declared because both appear in the source, and reading `!isPresent(...)` at a
 * site the source writes as `isNull(...)` would invert the reader's mental model at precisely the
 * two clauses whose ORDER is load-bearing. Both delegate to the one shared definition, so there is
 * no second notion of nullish anywhere.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * CFML `ListDeleteAt` over a comma-delimited list, 1-BASED, RAISING on an unusable position.
 *
 * JUDGMENT CALL: ListDeleteAt is implemented module-locally because lib/cfml/list.ts is locked at
 * five exports and lib/cfml at five files; adding an export or a file would breach the locked
 * layout, and a tenth module in this folder is a gate failure. Scope is deliberately private to this
 * module. It is composed from two of the locked five - `listLen` for the element count and
 * `listToArray` for the split - so the delimiter semantics are the shared module's, not a second
 * private notion of what a list is. The rejected alternatives were: exporting a sixth function from
 * `list.ts` (breaches the five-export lock), adding a sixth `lib/cfml` file (breaches the five-file
 * lock), and inlining the deletion at the call site (would hide the 1-based contract and the raise
 * inside an expression).
 *
 * CFML parity [model/service/PromotionService.cfc:L774]: the raise is the REPRODUCTION of a legacy
 * failure, not validation of my own. CFML's `ListDeleteAt` raises when handed a position of `0` or
 * one past the end, and `listFindNoCase` hands it exactly `0` for an absent element, so raising here
 * is what keeps the ported behaviour identical. See the defect marker at the call site for how that
 * position becomes reachable.
 *
 * The `delimiter` parameter exists because CFML's takes one, and it defaults to a comma as CFML's
 * does. Every call site in the ported ranges uses that default single character, which is also the
 * only shape for which the split-and-rejoin below is exact: `listToArray` treats the argument as a
 * SET of delimiter characters while the rejoin uses it as a literal separator, and the two coincide
 * only for a single character. No caller passes anything else.
 *
 * @param list - the comma-delimited list to delete from.
 * @param position - the 1-based position to delete. `0` and out-of-range values raise.
 * @param delimiter - a single delimiter character; defaults to a comma, as CFML does.
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

  // The one place a 1-based CFML position becomes a 0-based JavaScript index in this module. It is
  // converted HERE, once, immediately after the bounds check that made it safe - not at the call
  // site, where it would sit next to a `listFindNoCase` result that is still 1-based.
  elements.splice(position - 1, 1);

  return elements.join(delimiter);
}

/**
 * The order item's product, reproducing the legacy UNGUARDED dereference.
 *
 * CFML parity [model/service/PromotionService.cfc:L810, L814, L816, L818]: the legacy walks
 * `...getSku().getProduct()` at four sites inside the exclusion disjunction WITHOUT A SINGLE NULL
 * GUARD, while it does guard the BRAND two hops further out at L814 and L816. That asymmetry is the
 * behaviour and it is preserved exactly: no guard is added here that the legacy lacks (B5).
 *
 * The ported `Sku.getProduct()` answers `Product | undefined` because the association can genuinely
 * be cleared, so the strict profile forces the absence to be acknowledged. ACKNOWLEDGING IT IS A
 * TYPE-LEVEL NECESSITY, NOT A BEHAVIOURAL CHANGE: an absent product RAISES here, exactly as CFML
 * raises on a dereference of nothing. It must never be softened into a silent non-match, because a
 * silent non-match would withhold a discount for which a data fault - not a business rule - is
 * responsible.
 *
 * CALL THIS AT THE CLAUSE POSITION, NEVER HOISTED. The disjunction short-circuits, so a `sku` match
 * decided at L808 must never pay for a product dereference that L810 would have performed. Hoisting
 * the resolution would raise where the legacy quietly answers "excluded". The legacy itself resolves
 * the product afresh at every site, so calling per site is exact read-count parity rather than a
 * compromise.
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
 * `...getSku().getProduct().getProductType().getProductTypeID()` is dereferenced twice on one line -
 * once for the item being examined and once for the target item - with no null guard on either. A
 * SKU whose product carries no product type therefore raises, and that is preserved: the `sku`,
 * `product` and `productType` arms of the disjunction receive NO null handling at all, and only
 * `brand` does.
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
 * CFML parity [model/service/PromotionService.cfc:L814-L818]: unlike the product and product-type
 * helpers above, this raise is PROVABLY UNREACHABLE in the preserved clause order - L818 is only
 * evaluated once L814 and L816 have both answered false, which means both brands are present. That
 * is the whole point of keeping the three clauses in source order, and routing L818 through a
 * raising accessor is what makes the order-criticality MECHANICAL instead of merely commented: any
 * future reordering that put L818 first would surface as this raise rather than as a wrong discount.
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
 * aliases rather than by restating their shapes.
 *
 * JUDGMENT CALL: the three methods are bound to the published aliases through a module-local
 * `implements` interface so that interface parity - the project's acceptance contract - is checked
 * by the compiler instead of by review. Nothing is redeclared, widened or re-derived: each member is
 * the imported alias NAMED, so this declaration contains no structural duplicate of any published
 * type and cannot drift from one. Rejected alternatives: writing the three signatures by hand and
 * trusting review (the aliases exist precisely so that is unnecessary); spelling the parameter and
 * return types as `Parameters<...>[0]` / `ReturnType<...>` at each method (compile-checked but
 * unreadable, and readability is a stated requirement); and exporting this interface (E7 permits one
 * exported unit per file, and the class is it).
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
 * JUDGMENT CALL: exported as the class PromotionPeriodQualificationEvaluator rather than three free
 * functions, because E7 permits one exported unit per file and three verbatim-named methods must
 * coexist. The `...Evaluator` suffix follows QualifierQualificationEvaluator, the convention already
 * set in this folder, and avoids colliding with the published PeriodQualification type. Rejected:
 * three separate modules (a tenth file is a gate failure) and a namespace object (not idiomatic).
 *
 * All three collaborators replace a legacy DI/1 convention-scanned `property name="xService";`
 * declaration and are wired exactly once in the composition root `src/handlers/bootstrap.ts`
 * (transformation rule T1). There is no service locator, no `getService("...")` lookup, no DI
 * container package and no runtime scan anywhere in this file - which also retires DI/1's 30-second
 * first-scan lock rather than reimplementing it.
 *
 * The instance holds NO mutable state. All three fields are `readonly` collaborators, and every
 * value the three algorithms compute lives on the stack for the duration of a single call, so one
 * instance is safe to reuse and cannot carry one order's verdict into another's.
 *
 * ORDERING, DOCUMENTED AND DELIBERATELY NOT ENFORCED HERE.
 * `PriceGroupService.updateOrderAmountsWithPriceGroups()`
 * [model/service/PriceGroupService.cfc:L364-L375] must run BEFORE
 * `PromotionService.updateOrderAmountsWithPromotions()`, because the discount base price at
 * [model/service/PromotionService.cfc:L241-L252] is chosen differently depending on price-group
 * eligibility - the promotion pass reads state the price-group pass writes. In legacy that held only
 * because `OrderService` happened to call them in that sequence. The requirement belongs to the
 * facade's documentation and to `src/handlers/promotionApplicationHandler.ts`, which orders the two
 * passes; nothing in this class depends on it, and no runtime check or ordering flag is added here
 * (B5).
 */
export class PromotionPeriodQualificationEvaluator implements PromotionPeriodQualificationSurface {
  public constructor(
    /**
     * The promotion repository port. Replaces the legacy `getPromotionDAO()` accessor at
     * [model/service/PromotionService.cfc:L567] and [model/service/PromotionService.cfc:L576]. Only
     * two of the port's seven members are consumed here and no member is added to it: the port set
     * stays locked, and no fourteenth port file is created.
     */
    private readonly promotionRepository: PromotionRepository,

    /**
     * The per-qualifier evaluator. Replaces the same-component call at
     * [model/service/PromotionService.cfc:L590]. Its single public method is SYNCHRONOUS, which is
     * why the qualifier loop below introduces no await.
     */
    private readonly qualifierQualificationEvaluator: QualifierQualificationEvaluator,

    /**
     * Order-item membership. Replaces the same-component call at
     * [model/service/PromotionService.cfc:L805]. Both of its membership twins are SYNCHRONOUS and it
     * declares no constructor dependencies of its own.
     */
    private readonly orderItemMembership: OrderItemMembership,
  ) {}

  /**
   * Decide whether a promotion period qualifies for an order, and collect what qualified.
   *
   * Ported from `private struct function getPromotionPeriodQualificationDetails(required any
   * promotionPeriod, required any order)` [model/service/PromotionService.cfc:L549-L627]. The name is
   * the legacy CFML name verbatim; the legacy `any` parameters become the concrete `PromotionPeriod`
   * entity and the read-only `OrderView`; the legacy `struct` return becomes the published
   * `PeriodQualification`.
   *
   * ASYNC, and only because of the two repository reaches at
   * [model/service/PromotionService.cfc:L567] and [model/service/PromotionService.cfc:L576].
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
    // [L552-L557] The FOUR-KEY seed, in source order. There are FOUR keys, not three: `orderItems`
    // is a live member of the contract even though nothing in this method ever writes it - the
    // engine populates it at [model/service/PromotionService.cfc:L213] after the record has been
    // memoized. It is seeded as an empty record and is neither omitted nor made optional.
    //
    // The published type declares `qualifiedFulfillmentIDs` and `qualifierDetails` as `readonly`
    // PROPERTIES holding MUTABLE arrays, and `qualificationsMeet` as a plain mutable boolean. That
    // combination is deliberate and load-bearing: the bindings are fixed, the contents are mutated.
    // Nothing here is wrapped in `Readonly<>` and no array is typed `ReadonlyArray`.
    const qualificationDetails: PeriodQualification = {
      qualificationsMeet: true,
      qualifiedFulfillmentIDs: [],
      qualifierDetails: [],
      orderItems: {},
    };

    // [L559-L561] THE DEFAULT IS "ALL FULFILLMENTS QUALIFY". Every fulfillment ID on the order is
    // appended before any qualification work happens.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L554, L560, L614]: qualifiedFulfillmentIDs is
    // all-or-nothing, never incrementally narrowed; empty means "nothing qualifies", not "no
    // restriction".
    // The mechanism was cited as "only ever narrowed". It is not narrowed at all: inside this method
    // the array is touched at exactly three places - initialized empty at L554, filled with every
    // fulfillment ID at L560, and replaced with an empty array at L614 on the early-return path. The
    // brief's CONCLUSION nonetheless holds and is honoured, and it is the inverse of the exclude-list
    // semantics used elsewhere in the engine, where an empty configured collection is PERMISSIVE. A
    // consumer that read emptiness as permissive would discount every fulfillment of an order the
    // legacy grants none to. Per-qualifier narrowing does exist, but it happens inside
    // ./qualifierQualification.ts on ITS OWN qualifiedFulfillmentIDs array and reaches this record
    // only wholesale, via the append at L609. The two arrays are not the same array.
    //
    // The collection is captured once for DETERMINISM AND READABILITY: one value cannot change
    // between the loop bound and the element read, and the reader sees the subject in one place. The
    // legacy re-invokes the accessor on every iteration; nothing in this loop mutates the order, so
    // the captured array is observationally identical.
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
    // means UNLIMITED - the `gt 0` guard fails and the limit check is skipped entirely.
    // The shape `!isNull(x) && x > 0` is preserved verbatim at BOTH gates. It is counter-intuitive
    // and trivially "fixed" by accident, and the same override shape guards the three
    // `maximumUsePer*` limits in ./rewardUsageLedger.ts - same semantic, different struct.
    //
    // The accessor is captured once rather than invoked twice as the legacy does, for DETERMINISM AND
    // READABILITY and because narrowing a nullable accessor requires a stable binding; the value
    // cannot change between the guard and the comparison either way.
    const maximumUseCount = promotionPeriod.getMaximumUseCount();
    if (isPresent(maximumUseCount) && maximumUseCount > 0) {
      // [L567] The only reason this method is async. The call is issued ONLY when the guard above
      // passed, exactly as the legacy issues it - no query is made that the legacy would not make,
      // and the two repository calls are neither parallelised, batched nor memoized here.
      const periodUseCount =
        await this.promotionRepository.getPromotionPeriodUseCount(promotionPeriod);

      // [L568] THE COMPARISON IS NON-STRICT. Reaching the maximum use count EXACTLY disqualifies.
      // That is a genuine difference from ./qualifierQualification.ts, whose four order-level bounds
      // at [model/service/PromotionService.cfc:L644, L646, L648, L650] are all STRICT, so boundary
      // equality does NOT disqualify there. Neither module is normalised toward the other.
      if (periodUseCount >= maximumUseCount) {
        // [L569]
        qualificationDetails.qualificationsMeet = false;
      }
    }

    // [L574-L581] GATE 2: this account's use count. Also must-preserve area #1.
    const maximumAccountUseCount = promotionPeriod.getMaximumAccountUseCount();
    if (isPresent(maximumAccountUseCount) && maximumAccountUseCount > 0) {
      // CFML parity [model/service/PromotionService.cfc:L575]: an order with no account skips the
      // account use-limit check entirely; the limit is never enforced for accountless orders.
      // This is a PERMISSIVE path and it is load-bearing: a guest order is never blocked by
      // `maximumAccountUseCount`, however high the count. A missing account is not treated as a
      // failure and no fallback account is substituted.
      //
      // JUDGMENT CALL: the legacy tests the out-of-scope `Account` ENTITY - `!isNull(order.getAccount())` -
      // and no such entity exists in the target. `OrderView` publishes `accountID: string | undefined`
      // instead, which is the anti-corruption boundary's documented reduction of that aggregate to an
      // opaque identifier, and the repository port's second parameter is the same opaque `accountID`
      // because the legacy DAO immediately reduces the entity to `account.getAccountID()`
      // [model/dao/PromotionDAO.cfc:L193]. So the entity-presence test becomes a presence test on
      // that string, routed through the shared truthiness helper. Nothing is invented: no account
      // port is added, no fourteenth port file is created, and the identifier is carried verbatim and
      // never parsed. An empty-string identifier is PRESENT under this reading, which matches the
      // legacy exactly - a present account whose identifier is empty would have been passed through
      // to the query unchanged.
      const accountID = order.accountID;
      if (isPresent(accountID)) {
        // [L576] Issued only when BOTH L574 and L575 passed. That exact conditionality is preserved.
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
    // falls through to here, skips the qualifier loop wholesale, and returns at L626 with
    // `qualificationsMeet: false` but `qualifiedFulfillmentIDs` STILL FULL from the L560 seed and
    // `qualifierDetails` empty. A QUALIFIER failure (L613-L616) returns with
    // `qualificationsMeet: false` and `qualifiedFulfillmentIDs` EMPTIED.
    // The difference is not observable through the current call sites because both consumers gate on
    // `qualificationsMeet` first, at L197 and at L1053 - but a consumer must never infer
    // disqualification from an empty `qualifierDetails` or a populated `qualifiedFulfillmentIDs`,
    // since those are also the shapes a vacuously qualifying period with no qualifiers produces.
    if (qualificationDetails.qualificationsMeet) {
      // [L587] A materialized association, so plain synchronous iteration. Captured once for
      // determinism and readability, as at L559.
      const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();

      for (const qualifier of promotionQualifiers) {
        // [L590] The sibling call.
        //
        // CFML parity [model/service/PromotionService.cfc:L590]: positional two-argument call form
        // preserved.
        // It is SYNCHRONOUS and is deliberately not awaited; it is reached through the injected
        // evaluator rather than through a same-component method call, which is what T1 replaces the
        // legacy convention scan with.
        const thisQualifierDetails: QualifierQualification =
          this.qualifierQualificationEvaluator.getQualifierQualificationDetails(qualifier, order);

        // [L593] The legacy writes a bare numeric truthiness test.
        //
        // CFML parity [model/service/PromotionService.cfc:L593]: CFML numeric truthiness means
        // "non-zero"; qualificationCount is provably non-negative on every path, so `> 0` is exact.
        // The proof is in ./qualifierQualification.ts: the order arm yields 1 or 0
        // [model/service/PromotionService.cfc:L641, L652]; the fulfillment arm increments once per
        // fulfillment at L665 before any decrement at L707, so it cannot go below 0; the order-item
        // arm yields 0 at L717 or a truncated non-negative quotient at L743. Because the value is
        // non-negative, `> 0` and `!== 0` coincide and `> 0` is the faithful translation. A bare
        // truthy test is never written.
        if (thisQualifierDetails.qualificationCount > 0) {
          // [L596] The fulfillment-type discriminator.
          //
          // CFML parity [model/service/PromotionService.cfc:L596]: CFML `==` on strings is
          // case-insensitive; qualifierType is a fixed persisted lowercase-camel vocabulary, so
          // strict `===` is exact.
          // The five legal values are `order`, `fulfillment`, `merchandise`, `subscription` and
          // `contentAccess` [model/entity/PromotionQualifier.cfc:L53], and `fulfillment` is a single
          // all-lower-case word matched against exactly the token that column stores. The accessor is
          // nullable, and CFML renders an unset string as the empty string in a comparison, so the
          // `?? ''` reproduces that coercion; an absent type equals no literal under either reading.
          // `../../lib/cfml/struct.js` is deliberately NOT imported - there is no case-insensitive
          // struct-key lookup anywhere in these three ranges.
          const qualifierType = qualifier.getQualifierType() ?? '';

          if (qualifierType === 'fulfillment') {
            // [L599-L605] Union the qualifier's own qualified fulfillment IDs into the local
            // accumulator, skipping duplicates.
            for (const orderFulfillmentID of thisQualifierDetails.qualifiedFulfillmentIDs) {
              // CFML parity [model/service/PromotionService.cfc:L602]: arrayFind returns a 1-based
              // index or 0; the negated form is a membership test, translated explicitly rather than
              // as a truthy check.
              // This is the ONLY `!arrayFind` site in the whole component - the other project sites
              // are model/service/ProductService.cfc:L144 and model/service/PriceGroupService.cfc:L281,
              // and the four sites at L865/L900/L935/L966 in ./orderItemMembership.ts are
              // `listFindNoCase`, not `arrayFind`. `includes` is used because it IS the membership
              // question the negation asks; a raw `findIndex` result would answer -1 on a miss rather
              // than 0, and testing `> 0` against that would be wrong for the first element AND
              // misread a miss.
              if (!explicitlyQualifiedFulfillmentIDs.includes(orderFulfillmentID)) {
                // [L603]
                explicitlyQualifiedFulfillmentIDs.push(orderFulfillmentID);
              }
            }
          }

          // [L609] Attach the qualifier's verdict WHOLESALE - the object exactly as returned, not
          // cloned, filtered or projected. Its own `qualifiedFulfillmentIDs`, already narrowed inside
          // ./qualifierQualification.ts, travels with it and is the only place per-qualifier
          // fulfillment narrowing survives.
          qualificationDetails.qualifierDetails.push(thisQualifierDetails);
        } else {
          // [L612-L616] A SINGLE non-qualifying qualifier aborts the whole period, immediately. The
          // `else` binds to the L593 test, and the return is preserved as an immediate return - never
          // converted into a flag-and-continue, which would let later qualifiers keep appending.
          //
          // LEGACY-NOTE [model/service/PromotionService.cfc:L613-L616]: the early-return reset clears
          // three of the four keys and spares orderItems; orderItems is never written in this
          // function, so the sparing is structurally inert here - reproduced as-is because adding a
          // fourth reset would add absent behaviour.
          // The reset was also glossed as preserving state `orderItems` had accumulated. Within a
          // single invocation it accumulates nothing: the caller populates it at L213, after the
          // record has been memoized. Reproducing the three-key reset exactly is still required,
          // because a fourth reset line would be behaviour the legacy does not have (B5).
          //
          // CFML parity [model/service/PromotionService.cfc:L614, L615]: the legacy REBINDS each key
          // to a fresh empty array, while the published type fixes the binding and leaves the
          // contents mutable, so the reset is performed by emptying the arrays IN PLACE.
          // That is observationally identical here: the record is returned on the next line and
          // nothing holds a prior reference to either array at this point. The only earlier reader in
          // this method, the L599 loop, reads `thisQualifierDetails.qualifiedFulfillmentIDs` - a
          // DIFFERENT array, belonging to the qualifier's own verdict.
          qualificationDetails.qualificationsMeet = false;
          qualificationDetails.qualifiedFulfillmentIDs.length = 0;
          qualificationDetails.qualifierDetails.length = 0;

          return qualificationDetails;
        }
      }
    }

    // [L621-L623] THE ORPHANED WRITE.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: writes `qualifiedFulfillments`, a key
    // the L552-L557 initializer never creates, typed as entities in the L93 docblock but assigned ID
    // strings, and read by nothing - every consumer reads `qualifiedFulfillmentIDs` (L209, L351).
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L563, L595-L606, L621-L623]: the entire
    // explicitlyQualifiedFulfillmentIDs computation feeds only the orphaned key, so the expected
    // narrowing of qualifiedFulfillmentIDs never occurs and the L209/L351 probes match every
    // fulfillment.
    // Reproduced in full; wiring it up would change which fulfillments are discounted.
    //
    // The bare `arrayLen(...)` condition becomes an explicit `.length > 0`, never a truthy test on a
    // count. Under `exactOptionalPropertyTypes` the optional dead field is assigned a real `string[]`
    // and never `undefined`, so "absent" and "present but undefined" stay distinct states - and the
    // field is WRITTEN here and READ nowhere.
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
   * promotionPeriod, required any order)` [model/service/PromotionService.cfc:L752-L781]. SYNCHRONOUS:
   * the body reaches no DAO and no ORM.
   *
   * THE RETURN IS A COMMA-DELIMITED STRING, NOT AN ARRAY. It is seeded `''` at
   * [model/service/PromotionService.cfc:L753], built with `listAppend` at L756, mutated by
   * `ListDeleteAt` at L774 and returned as a string at L780. It must never be conflated with the
   * `string[]` member `qualifiedFulfillmentIDs` of `PeriodQualification`: the comma-list return is
   * retained as a `string` for signature parity and is parsed by callers through
   * `../../lib/cfml/list.js`.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L752]: this helper has zero call sites anywhere in
   * the non-Hibachi codebase; ported and exported for surface completeness, exercised by tests only.
   * That was verified rather than assumed: a search of every non-Hibachi `.cfc` and `.cfm` for the
   * method name returns exactly one hit, its own declaration line.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L769-L772]: orphan #1 excludes on weight bounds
   * only, while the live path in ./qualifierQualification.js (L693-L704) applies six clauses; the two
   * disagree.
   * Ported as written; reconciling them would invent behaviour. The live path adds the address-zone
   * flag, the fulfillment-methods gate, the shipping-methods gate and the shipping-address-zones
   * clause carrying DEFECT 11, so this helper qualifies fulfillments the live path excludes. That
   * divergence is almost certainly why the helper was abandoned, and porting it as anything other
   * than its own two-clause self would be inventing behaviour.
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
    // `listAppend('', v) === v`, so the first append emits NO leading delimiter - which matters
    // because a leading comma would shift every later `listFindNoCase` position by one.
    let qualifiedFulfillmentIDs = '';

    // [L755-L757] Seed with every fulfillment ID.
    //
    // CFML parity [model/service/PromotionService.cfc:L755, L767]: the loop variable `f` is `var`'d
    // TWICE in one CFML function scope - here and again in the inner loop below. CFML has one function
    // scope, so the second declaration is a redeclaration of the same variable; in TypeScript the two
    // `for` bodies are distinct block scopes, so the artifact simply disappears. It belongs to the same
    // family as the sibling-block `var discountAmount` redeclarations at
    // [model/service/PromotionService.cfc:L244, L252].
    //
    // The 1-BASED-TO-0-BASED TRANSLATION IS ELIMINATED RATHER THAN PERFORMED. The legacy walks
    // `for(var f=1; f<=arrayLen(...); f++)` and re-reads the element as `getOrderFulfillments()[f]`
    // at L756; iterating the captured array directly means no index exists to get wrong. That is
    // observationally identical because nothing in this method mutates the order's fulfillment
    // collection - only the local list string changes - and the collection is captured once for
    // DETERMINISM AND READABILITY. Under `noUncheckedIndexedAccess` an indexed read would also have
    // been `OrderFulfillmentView | undefined`, and the rule here is to NARROW, never assert; removing
    // the index removes the question.
    const orderFulfillments: readonly OrderFulfillmentView[] = order.orderFulfillments;
    for (const orderFulfillment of orderFulfillments) {
      // [L756]
      qualifiedFulfillmentIDs = listAppend(
        qualifiedFulfillmentIDs,
        orderFulfillment.orderFulfillmentID,
      );
    }

    // [L759-L760] The source comment above L760 says "Loop over Qualifiers looking for fulfillment
    // qualifiers", and here it is CORRECT - this loop really does filter fulfillment qualifiers. The
    // same comment is copy-pasted above the ORDER-ITEM loop at L787, where it is wrong; see the
    // annotation there. Captured once, as at L755, for the same determinism and readability reason,
    // and with the same index elimination at L762.
    const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();
    for (const qualifier of promotionQualifiers) {
      // [L764] Treated exactly as L596: strict `===` against the lowercase literal, with the same
      // case-insensitivity audit.
      //
      // CFML parity [model/service/PromotionService.cfc:L764]: CFML `==` on strings is
      // case-insensitive; qualifierType is a fixed persisted lowercase-camel vocabulary, so strict
      // `===` is exact.
      const qualifierType = qualifier.getQualifierType() ?? '';

      if (qualifierType === 'fulfillment') {
        // [L766-L768] The inner loop. Index eliminated as at L755; the element the legacy re-reads at
        // L768 is the loop subject here.
        for (const orderFulfillment of orderFulfillments) {
          // [L769, L771] BOTH BOUNDS ARE STRICT and both are null-guarded. Boundary equality does NOT
          // exclude: a fulfillment weighing exactly the minimum, or exactly the maximum, survives.
          // The weights are PLAIN NUMERICS, never `Money` - they are shipping weights, not currency -
          // so no value object and no decimal library is involved. Each accessor is read once per
          // fulfillment rather than twice as the legacy reads it, for determinism and readability and
          // because narrowing a nullable accessor requires a stable binding.
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
            // LEGACY-DEFECT [model/service/PromotionService.cfc:L774]: listFindNoCase's 0-on-miss result is fed
            // straight into ListDeleteAt as a 1-based position; two fulfillment-type qualifiers excluding the same
            // fulfillment make the second delete throw. Unreachable in production only because L752 has no callers.
            // Preserved deliberately; do not fix without a product decision.
            //
            // The hazard is REACHABLE BY CONFIGURATION, not merely latent. The outer qualifier loop at
            // L760 can encounter several fulfillment-type qualifiers; if two of them exclude the SAME
            // fulfillment on weight, the first deletes the ID and the second's `listFindNoCase`
            // answers 0, so the second delete raises. Within a single qualifier's inner loop each
            // fulfillment is visited once, so one qualifier cannot double-delete - the hazard needs at
            // least two fulfillment-type qualifiers on the period. No zero-position guard is added, no
            // no-op fallback is substituted and the error is not swallowed: the raise is the faithful
            // outcome and it propagates.
            //
            // LEGACY-NOTE [model/service/PromotionService.cfc:L774]: twin of the array-index hazard at L708/L709,
            // owned by ./qualifierQualification.ts. Ownership corrected against source per the locator-drift rule.
            // That module reproduces the ARRAY-index form, `arrayFind` feeding `arrayDeleteAt`; this
            // one reproduces the LIST-index form. Each is discoverable from the other.
            //
            // CFML parity [model/service/PromotionService.cfc:L774]: the source writes `ListDeleteAt`
            // with a capital L and `listFindNoCase` with a lowercase l in a single expression, because
            // CFML function names are case-insensitive. TypeScript's are not, so each appears below in
            // its one canonical spelling - the module-local `listDeleteAt` and the shared
            // `listFindNoCase`.
            qualifiedFulfillmentIDs = listDeleteAt(
              qualifiedFulfillmentIDs,
              listFindNoCase(qualifiedFulfillmentIDs, orderFulfillment.orderFulfillmentID),
            );
          }
        }
      }
    }

    // [L780] L777 carries trailing whitespace after its closing brace in the source; that is a
    // formatting artifact with no behaviour and is not reproduced.
    return qualifiedFulfillmentIDs;
  }

  /**
   * Count how many times ONE order item qualifies under a promotion period's order-item qualifiers.
   *
   * Ported from `private numeric function getPromotionPeriodOrderItemQualificationCount(required any
   * promotionPeriod, required any orderItem, required any order)`
   * [model/service/PromotionService.cfc:L783-L849]. SYNCHRONOUS: the body reaches no DAO and no ORM.
   *
   * TWO ORDER ITEMS ARE IN PLAY AND THE DISTINCTION IS LOAD-BEARING. The `orderItem` PARAMETER is the
   * TARGET - the item whose qualification count is being computed. `thisOrderItem`, declared inside
   * the inner loop and named exactly as the legacy names it at
   * [model/service/PromotionService.cfc:L800], is the item currently being examined. Every clause of
   * the exclusion disjunction compares one against the other, so confusing them silently changes
   * which items qualify.
   *
   * Parameter order is `promotionPeriod, orderItem, order` - the legacy order at
   * [model/service/PromotionService.cfc:L783] - and it is not rearranged.
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
    // LEGACY-NOTE [model/service/PromotionService.cfc:L785, L848]: with no order-item qualifiers this
    // returns the WHOLE ORDER's total sale quantity as a single item's qualification count; that value
    // feeds the L223-L224 ratchet in ./rewardUsageLedger.ts and therefore shapes use-limit
    // enforcement.
    // Neither the L794 gate nor the L840 early return can fire when a period declares no order-item
    // qualifier, so control reaches L848 with the seed untouched - a number that has nothing to do
    // with the item that was asked about. Downstream the facade reads it at L222 as
    // `qualificationQuantity` and the ratchet drives `maximumUsePerOrder` down to
    // `min(current, qualificationQuantity * maximumUsePerQualification)`, so this seed reaches the
    // money. It is a plain integer count, never `Money`, and it is captured once for determinism and
    // readability.
    let allQualifiersCount = order.totalSaleQuantity;

    // [L787-L788]
    //
    // CFML parity [model/service/PromotionService.cfc:L787]: source comment says "fulfillment
    // qualifiers"; the loop filters order-item qualifiers.
    // The text is copy-pasted from orphan #1's L759, where it is accurate. The misleading wording is
    // recorded rather than reproduced, because a comment that lies is worse than no comment.
    //
    // Captured once, with the 1-based index at L790 eliminated for the same reason as at L755.
    const promotionQualifiers: PromotionQualifier[] = promotionPeriod.getPromotionQualifiers();
    for (const qualifier of promotionQualifiers) {
      // [L791] Reset per qualifier, not accumulated across them.
      let qualifierCount = 0;

      // [L793-L794] The order-item-type gate.
      //
      // CFML parity [model/service/PromotionService.cfc:L794]: `listFindNoCase` returns a 1-based
      // index or 0, so the result is compared explicitly against `0` and never used as a truthy
      // value. This is the same 1-based-index rule that governs L865, L900, L935 and L966 in
      // ./orderItemMembership.ts.
      //
      // THE COMMA-LIST TOKEN ORDER DIFFERS BY SITE AND IS PRESERVED VERBATIM PER SITE. This site and
      // the facade's L200 both write `"merchandise,subscription,contentAccess"`, while L714 in
      // ./qualifierQualification.ts writes `"contentAccess,merchandise,subscription"`. All three are
      // membership tests, so the order is behaviourally irrelevant at every one of them - which is
      // precisely why no shared constant is extracted and no order is normalised: a reviewer diffing
      // against the source must see the same string, and inferring a PRIORITY from either ordering
      // would be inventing behaviour.
      const qualifierType = qualifier.getQualifierType() ?? '';

      if (listFindNoCase('merchandise,subscription,contentAccess', qualifierType) > 0) {
        // [L808-L818] read this SIX times inside the innermost loop; it is captured once per qualifier
        // for determinism and readability - one value cannot change between six clauses that are meant
        // to describe one configuration.
        //
        // CFML parity [model/service/PromotionService.cfc:L808]: the accessor reads
        // "RewardMatchingType" but is invoked on a `PromotionQualifier`, not a `PromotionReward`. The
        // property genuinely lives on the qualifier [model/entity/PromotionQualifier.cfc:L65]; the
        // name is a naming artifact, carried over verbatim because the accessor name is part of the
        // ported surface.
        const rewardMatchingType: RewardMatchingType | undefined =
          qualifier.getRewardMatchingType();

        // [L796-L797] Index eliminated as at L755; the element the legacy re-reads at L800 is the loop
        // subject. Captured once for determinism and readability.
        const orderItems: readonly OrderItemView[] = order.orderItems;

        for (const thisOrderItem of orderItems) {
          // [L801] Seeded to the FULL item quantity, not to 1. A plain integer count, never `Money`.
          let orderItemQualifierCount = thisOrderItem.quantity;

          // [L803-L819] THE SEVEN-CLAUSE EXCLUSION DISJUNCTION. It asks "does this item fail to
          // qualify for any reason", and a single true operand zeroes the count.
          //
          // CFML parity [model/service/PromotionService.cfc:L814-L818]: the brand cascade is
          // order-critical - L818's double dereference is null-safe only because L814 and L816
          // short-circuit first. Do not reorder, merge, or collapse these three clauses.
          //
          // THE `sku`, `product` AND `productType` CLAUSES ARE NOT NULL-GUARDED AT ALL. L810
          // dereferences `.getProduct()` and L812 dereferences `.getProduct().getProductType()` with no
          // guard whatsoever; only `brand` receives null handling. A SKU whose product has no product
          // type raises at L812. THE ASYMMETRY IS PRESERVED and no guard is added (B5) - it belongs to
          // the same null-guard-asymmetry family as L678-versus-L703 in ./qualifierQualification.ts and
          // the brand polarity inversion in ./orderItemMembership.ts. The `requireProduct`,
          // `requireProductType` and `requireBrand` helpers exist only because the ported accessors are
          // typed nullable; they raise where CFML raises and are called AT THE CLAUSE POSITION so the
          // short-circuit still decides what gets dereferenced.
          //
          // THERE IS NO DEFAULT AND NO `else` FOR AN UNRECOGNISED `rewardMatchingType`. The vocabulary
          // is `any | sku | product | productType | brand` [model/entity/PromotionQualifier.cfc:L109-L113],
          // and `any` - the FIRST option the admin is offered - matches none of the six literal
          // comparisons, so none of clauses 2-7 fires and the item qualifies on the strength of clause 1
          // alone. An absent value behaves identically. That PERMISSIVE FALLTHROUGH is the designed
          // behaviour of `any`, not an accident, so the value is not validated, no default branch is
          // added and nothing is thrown (B5).
          if (
            // [L805] Clause 1: the sibling membership call, NEGATED.
            //
            // CFML parity [model/service/PromotionService.cfc:L805]: keyword-argument call form,
            // negated; translated to a positional invocation on the injected collaborator with the
            // negation preserved.
            // It is SYNCHRONOUS and is deliberately not awaited.
            !this.orderItemMembership.getOrderItemInQualifier(qualifier, thisOrderItem) ||
            // [L808] Clause 2: sku identity. `sku` is non-nullable on the view, matching the legacy
            // site, which dereferences it without a guard.
            (rewardMatchingType === 'sku' &&
              thisOrderItem.sku.getSkuID() !== orderItem.sku.getSkuID()) ||
            // [L810] Clause 3: product identity. Unguarded in the legacy; raises on an absent product.
            (rewardMatchingType === 'product' &&
              requireProduct(thisOrderItem).getProductID() !==
                requireProduct(orderItem).getProductID()) ||
            // [L812] Clause 4: product-type identity. Unguarded in the legacy at both dereferences.
            (rewardMatchingType === 'productType' &&
              requireProductType(thisOrderItem).getProductTypeID() !==
                requireProductType(orderItem).getProductTypeID()) ||
            // [L814] Clause 5: the examined item has no brand. FIRST of the order-critical trio.
            (rewardMatchingType === 'brand' &&
              isAbsent(requireProduct(thisOrderItem).getBrand())) ||
            // [L816] Clause 6: the TARGET item has no brand. SECOND of the trio.
            (rewardMatchingType === 'brand' && isAbsent(requireProduct(orderItem).getBrand())) ||
            // [L818] Clause 7: brand identity. Its double dereference is safe only because clauses 5
            // and 6 already answered false.
            (rewardMatchingType === 'brand' &&
              requireBrand(thisOrderItem).getBrandID() !== requireBrand(orderItem).getBrandID())
          ) {
            // [L821]
            orderItemQualifierCount = 0;
          }

          // [L825] Added in UNCONDITIONALLY, after the `if` closes at L823. The order is
          // seed-then-maybe-zero-then-always-add and it is not restructured into
          // add-only-when-qualifying: the arithmetic result would be the same, but the structure is
          // what a reviewer diffs against the source.
          qualifierCount += orderItemQualifierCount;
        }

        // [L829-L832] The minimum-item-quantity division.
        //
        // LEGACY-NOTE [model/service/PromotionService.cfc:L830]: a null minimumItemQuantity leaves the
        // accumulated count intact (PERMISSIVE). The structurally parallel guard at L742, owned by
        // ./qualifierQualification.ts, has the opposite RESTRICTIVE polarity. Do not normalise either.
        // There a null minimum leaves `qualificationCount` at 0; here a null minimum leaves the full
        // accumulated count standing. The two are genuinely different and both are reproduced.
        const minimumItemQuantity = qualifier.getMinimumItemQuantity();
        if (isPresent(minimumItemQuantity)) {
          // CFML parity [model/service/PromotionService.cfc:L831]: CFML int(x/0) throws while
          // Math.trunc(x/0) yields Infinity; the throw is reproduced explicitly so the ported
          // behaviour matches. This is behaviour reproduction, not added validation (the legacy
          // performs no divisor check).
          // The divisor passes only `!isNull` - there is NO `> 0` check here, in deliberate contrast
          // with the `gt 0` overrides at L566 and L574 and with the ledger's three `maximumUsePer*`
          // gates - so a persisted `0` reaches the division. `Math.trunc(x / 0)` is `Infinity` and
          // `Math.trunc(0 / 0)` is `NaN`, and either propagating silently into the ratchet would be a
          // DIVERGENCE. This folder's divergence budget is spent in full inside ./discountAmount.ts,
          // so raising is the only faithful option. The twin site L743 in ./qualifierQualification.ts
          // takes the identical treatment.
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
          // neither operand is validated for sign (B5). Both operands are plain integer counts, so
          // this is deliberately NOT routed through `Money`, `../../lib/cfml/precision.js` (whose
          // `divide()` accepts only `string | Decimal`, excluding `number` by design) or
          // `../../lib/cfml/numberFormat.js`.
          //
          // THE FOLDER-WIDE UNGUARDED-DIVISION REGISTER, AND NONE OF THE FOUR IS GUARDED:
          // L299 belongs to ./rewardUsageLedger.ts, L486 to ./overUseStripping.ts, L743 to
          // ./qualifierQualification.ts, and L831 to this module.
          qualifierCount = Math.trunc(qualifierCount / minimumItemQuantity);
        }

        // [L834-L837] Keep the LOWER of the running minimum and this qualifier's count.
        //
        // The comparison is STRICT, so an EQUAL count does not replace the incumbent. That places it
        // in this folder's incumbent-favouring tie-break family, alongside the strict order-level
        // bounds in ./qualifierQualification.ts and the strict comparisons in both of the engine's
        // opposed insertion sorts.
        if (qualifierCount < allQualifiersCount) {
          // [L836]
          allQualifiersCount = qualifierCount;
        }

        // [L839-L842] The early return.
        //
        // CFML parity [model/service/PromotionService.cfc:L839]: the source comment misspells
        // "qualifications" as "qualifiacitons". It is comment text rather than a data contract, so no
        // rename ledger is involved and the corrected spelling is used here.
        //
        // THE STRICTNESS IS MIXED IN ADJACENT LINES AND BOTH FORMS ARE REPRODUCED, NOT HARMONISED:
        // L835 is strict `<` while L840 is NON-STRICT `<=`. The test admits negatives but the return
        // does not propagate one, so a returning zero is a genuine zero. This return sits INSIDE the
        // L794 gate and INSIDE the qualifier loop, so it can only fire once at least one
        // order-item-type qualifier has been processed, and remaining qualifiers are never evaluated
        // once any qualifier disqualifies the item.
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
