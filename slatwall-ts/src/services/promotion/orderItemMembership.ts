// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order "a
// compile-order convenience, not a schedule". Commentary in this file therefore names
// modules of the target layout that may not exist yet. Every such name carries
// `(planned)` at its point of use, meaning exactly: a planned Agent Action Plan target
// that is ABSENT from the subtree at this checkpoint. Nothing here asserts that any of
// them exists now, and no behaviour in this file depends on one:
//
//   src/handlers/bootstrap.ts                              composition root (wiring)
//   src/services/promotionService.ts                       the facade that calls this module
//   src/services/promotion/qualifierQualification.ts       sibling decomposition module
//   src/services/promotion/promotionPeriodQualification.ts sibling decomposition module
//   tests/unit/services/promotion                          this module's net-new suite
//
// ★ THIS MODULE IMPORTS NO SIBLING, AND THAT IS A STRUCTURAL FACT RATHER THAN A
// CHECKPOINT ACCIDENT. It is a proven LEAF of the nine-module promotion decomposition.
// An exhaustive call-site census over the 1125 lines of the legacy service finds the two
// twins called at exactly three places, and this module calls back into none of them:
//
//   [model/service/PromotionService.cfc:L727]  inside `getQualifierQualificationDetails`
//     `getOrderItemInQualifier(qualifier=qualifier, orderItem=orderItem)` - positive.
//     Consumer: `./qualifierQualification.ts` (planned).
//   [model/service/PromotionService.cfc:L805]  inside
//     `getPromotionPeriodOrderItemQualificationCount`
//     `!getOrderItemInQualifier(qualifier=qualifier, orderItem=thisOrderItem)` - NEGATED.
//     Consumer: `./promotionPeriodQualification.ts` (planned).
//   [model/service/PromotionService.cfc:L220]  `getOrderItemInReward(reward, orderItem)`.
//     Facade-owned, so `getOrderItemInReward` has NO in-folder consumer at all. It is
//     exported regardless, because `../promotionService.ts` (planned) needs it.
//
// The dependency edge therefore runs FROM those two siblings and the facade INTO this
// file, never outward. ⛔ `../promotionService.js` is NEVER imported here: the facade may
// import the nine, and nothing in the nine may import the facade. The graph stays acyclic.
//
// CFML parity [model/service/PromotionService.cfc:L727, L805, L220]: the two qualifier
// call sites use CFML's KEYWORD argument form and the reward call site uses the POSITIONAL
// form. TypeScript has no keyword arguments, so all three collapse onto one positional
// call shape in the target. That is a language difference, not a behavioural one, and it
// is recorded once here rather than at each site.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// slatwall-ts - Promotion order-item membership
//
// PORTED FROM the two membership twins, as a 1:1 logic extraction:
//
//   public boolean function getOrderItemInQualifier(required any qualifier, required any orderItem)
//     [model/service/PromotionService.cfc:L852-L919]
//   public boolean function getOrderItemInReward(required any reward, required any orderItem)
//     [model/service/PromotionService.cfc:L921-L985]
//
// `model/service/PromotionService.cfc` is the SOLE BEHAVIOURAL AUTHORITY for this file.
// `model/entity/PromotionQualifier.cfc` and `model/entity/PromotionReward.cfc` were read
// only as accessor contracts, never as behaviour.
//
// These two functions decide WHICH ORDER ITEMS a promotion qualifier or reward applies to,
// which places them directly beneath MUST-PRESERVE AREA #1 (AAP 0.8.1) - promotion
// discount math together with use-limit enforcement semantics. The arithmetic lives in
// `./discountAmount.ts`; this module decides what that arithmetic is applied to. A wrong
// membership answer changes which items receive a discount, so it changes the money a
// customer is charged just as surely as a wrong operator would. Nothing here may be tidied
// on aesthetic grounds.
//
// ⚠️⚠️⚠️ READ THIS BEFORE READING THE CODE: THE TWO TWINS ARE NEAR-IDENTICAL AND MUST NOT
// BE UNIFIED.
//
// CFML parity [model/service/PromotionService.cfc:L873-L886, L943-L952] - THE EXCLUSION
// CENSUS IS SEVEN OR-OPERANDS IN THE QUALIFIER TWIN AND FIVE IN THE REWARD TWIN:
//
//   #  exclusion operand                              qualifier      reward
//   1  hasExcludedProductType (materialized-path)     L873   yes     L943   yes
//   2  minimumItemPrice > orderItem price             L875   yes     ---    ABSENT
//   3  maximumItemPrice < orderItem price             L877   yes     ---    ABSENT
//   4  hasExcludedProduct(...)                        L879   yes     L945   yes
//   5  hasExcludedSku(...)                            L881   yes     L947   yes
//   6  compound excluded-brand clause                 L883   yes     L949   yes
//   7  hasAnyExcludedOption(...)                      L885   yes     L951   yes
//
// ⇒ A REWARD HAS NO ITEM-PRICE GATE AT ALL. A qualifier can be scoped to items inside a
// price band; a reward cannot. The reward entity does not even declare the two bounds -
// `model/entity/PromotionReward.cfc` contains no `minimumItemPrice` or `maximumItemPrice`
// property, whereas `model/entity/PromotionQualifier.cfc:L61-L62` declares both as
// `ormtype="big_decimal"` with `hb_nullRBKey="define.0"` and `hb_nullRBKey="define.unlimited"`
// respectively. So the asymmetry is a schema fact, not a call-site accident.
//
// The two twins are therefore authored SEPARATELY below, each mirroring its own cited line
// range, and the duplication between them is DELIBERATE. Unifying them into one generic
// "thing with exclusions" membership function would either silently apply the item-price
// gates to rewards - inventing enforcement the legacy does not perform - or silently drop
// them from qualifiers. Both change money. Refactoring the duplication away is a
// BEHAVIOURAL CHANGE, not a cleanup.
//
// The one thing the twins DO legitimately share is the mechanical comma-list product-type
// path scan, which is byte-identical in both and which AAP 0.3.3 mandates centralising in
// `materializedIdPath`. That scan carries no include/exclude polarity, so sharing it hides
// nothing. See `productTypeIdPathIntersects` below. Everything else is written out twice.
//
// ★ THIS FILE OWNS NO NUMBERED DEFECT-REGISTER ENTRY. What it owns instead are six
// structural findings, each annotated at its site: the 7-versus-5 exclusion asymmetry
// above; the null-brand polarity inversion; the restrictive include-side default; the four
// `listFindNoCase` bare-truthiness sites; the `includedPropertyTypeIDList` misspelling; and
// the L875/L877 bare-scope artifact.
//
// ★ ZERO DELIBERATE DIVERGENCES LIVE IN THIS FILE. This folder's two divergences are both
// already spent in `./discountAmount.ts` on register entries 12 and 13, and the project's
// third is spent in `src/domain/entities/product.ts`. This file therefore may not diverge
// from legacy behaviour in ANY respect, and it does not. Every departure recorded below is
// either a language difference that cannot be expressed in the target (the CFML bare-scope
// reads, the keyword call form, 1-based indexing) or an unobservable read-count reduction
// on a pure accessor. Neither category is a divergence.
//
// ★ BUDGETS SPENT BY THIS FILE: zero new ports (the port set stays at 13) · zero signature
// reshapings · zero signature widenings · zero VISIBILITY widenings, because both twins are
// already declared `public boolean function` in the legacy source - the project's
// five-widening ledger (`getPromotionPeriodQualificationDetails`,
// `getQualifierQualificationDetails`, `getPromotionPeriodQualifiedFulfillmentIDList`,
// `getPromotionPeriodOrderItemQualificationCount`, `getDiscountAmount`) is untouched and
// remains exhausted · zero test files authored · zero new modules in this folder beyond
// this one of the locked nine · no barrel, no `index.ts`, no nested subfolder.
//
// E5 - PARAMETERIZED SQL IS NOT APPLICABLE TO THIS MODULE, and the reason is stated here
// rather than left to inference: this module runs NO queries and holds NO connection. Both
// twins traverse associations that were already materialized at the repository boundary and
// walk a comma-delimited string in memory. All SQL in the subtree lives in
// `src/repositories/mysql/**`, where every statement is a prepared statement preserving the
// injection-safety property that `cfqueryparam` provided.
//
// E6 / no ambient state - THIS MODULE READS NO SETTINGS and takes no settings provider, no
// request scope and no collaborator of any kind. It also declares NO MODULE-LEVEL MUTABLE
// STATE: no memo, no cache, no lazily populated module-scope map, not even for the derived
// product-type identifier lists, which are rebuilt inside each call. That is a CORRECTNESS
// AND SAFETY requirement rather than a stylistic one. Module-level state survives on a warm
// Lambda container between UNRELATED requests, so a cached membership answer or a cached
// identifier list could leak one customer's promotion membership into another customer's
// order. The single documented module-state exception in the whole subtree is the MySQL
// connection pool in `src/repositories/mysql/connection.ts`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L852-L985]: THIS MODULE'S TEST COVERAGE
// IS NET-NEW, and is flagged as net-new rather than presented as parity. `meta/tests/`
// contains no test for `PromotionService` at all - `meta/tests/unit/service/` holds only
// AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, none
// of which is in scope. The two legacy files that do touch this slice, BrandTest.cfc and
// ProductTest.cfc, are entity tests and neither exercises membership. There is therefore no
// legacy antecedent to trace to, and no assertion below is carried forward from one. The
// characterization suite belongs to `tests/unit/services/promotion` (planned), which is
// owned by another boundary; this file authors no test.
// ---------------------------------------------------------------------------

import type { Brand } from '../../domain/entities/brand.js';
import type { Product } from '../../domain/entities/product.js';
import type { ProductType } from '../../domain/entities/productType.js';
import type { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import { idPathContainsAnyId } from '../../domain/valueObjects/materializedIdPath.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import { listAppend } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// JUDGMENT CALL: this module exports exactly ONE unit - the class
// `OrderItemMembership` - carrying BOTH verbatim-named methods.
//
// The tension resolved: E7 permits exactly one exported primary unit per file with no
// barrel re-exports, while interface parity (AAP 0.8.1, and the acceptance contract for
// this migration) requires this file to expose TWO methods whose names are the legacy CFML
// names character-for-character. A class satisfies both at once: one exported symbol,
// two frozen method names. It also gives the shared mechanical path scan and the two
// narrowing helpers a natural module-local home, none of which leaks into the public
// surface.
//
// The class deliberately has NO CONSTRUCTOR DEPENDENCIES. Both methods are pure over their
// arguments - they reach no DAO, no ORM, no port and no setting - so there is nothing to
// inject. That is expected and correct, and no collaborator was invented to justify the
// shape. Consumers hold the instance as a `readonly` constructor field, wired once in
// `src/handlers/bootstrap.ts` (planned) per transformation rule T1: explicit constructor
// injection, no service locator, no DI container package, no runtime convention scan.
//
// The alternatives rejected, and why:
//   * TWO FREE EXPORTED FUNCTIONS. Rejected: two exported units in one file breaks E7's
//     one-unit rule, and the rule exists so that a regenerated file's diff stays minimal
//     during the refine loop.
//   * TWO SEPARATE FILES, one per twin. Rejected outright: this folder is locked at NINE
//     modules, and a tenth and eleventh module would be a gate failure.
//   * A BARREL RE-EXPORT to present both names from one specifier. Forbidden outright by
//     the no-barrel policy, and enforced by the ESLint `no-restricted-imports` barrel
//     pattern group.
//   * A NAMESPACE OBJECT (`export const orderItemMembership = { ... }`). Rejected: it is a
//     barrel wearing a different hat, it cannot be constructor-injected as a type, and it
//     invites the module-level mutable state this module forbids.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CFML parity [model/entity/OrderItem.cfc:L53, L63] - HOW THE LEGACY ORDER-ITEM READS MAP
// ONTO THE VIEW. Both twins read exactly two things from the order item:
// `arguments.orderItem.getSku()` and `arguments.orderItem.getPrice()`. In the target the
// order item arrives as `OrderItemView`, the read-only anti-corruption shape that lets an
// out-of-scope aggregate drive an in-scope engine, and that shape publishes its members as
// `readonly` PROPERTIES rather than accessor methods. So `getSku()` reads `orderItem.sku`
// and `getPrice()` reads `orderItem.price`. Both are non-nullable on the view, matching the
// legacy sites, which dereference them without any guard.
//
// The view is READ-ONLY in both directions: nothing here mutates an `OrderItemView`, and
// nothing here writes to order persistence. Membership is a question, and answering it
// leaves the order untouched - the write side is the applied-promotion intent emitted much
// later by `./promotionApplication.ts`.
// ---------------------------------------------------------------------------

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port.
 *
 * CFML parity [model/service/PromotionService.cfc:L875, L877, L883, L911, L949, L977]: the six
 * `isNull()` / `!isNull()` tests across the two twins - two item-price bounds, two excluded-brand
 * clauses and two brand-inclusion clauses.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is the right shape for a
 * general-purpose predicate but gives the compiler nothing to narrow with. Wrapping it in a type
 * predicate keeps ONE definition of "nullish" in the subtree - the delegation is real, not
 * decorative - while letting `strict` mode see the narrowing. That matters because
 * `@typescript-eslint/no-non-null-assertion` is an error across `src/**`, and a postfix `!` is
 * exactly the construct that would silence the checks protecting these six branches. Every
 * nullable value below is NARROWED, never asserted.
 *
 * Module-local and deliberately not exported: this module exports exactly one unit.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * The order item's product, reproducing the legacy UNGUARDED dereference.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L864, L879, L883, L899, L905, L911]: the legacy
 * walks `arguments.orderItem.getSku().getProduct()` at six sites in the qualifier twin, and at the
 * matching sites in the reward twin, WITHOUT A SINGLE NULL GUARD. The ported `Sku.getProduct()`
 * answers `Product | undefined` because `Sku.remove*` can genuinely clear the association, so the
 * strict profile forces the absence to be acknowledged. Acknowledging it is a TYPE-LEVEL NECESSITY,
 * NOT A BEHAVIOURAL CHANGE, and no guard was added that the legacy lacks: an absent product RAISES
 * here, exactly as CFML raises on a dereference of nothing. It must never be softened into a silent
 * `false`, because `false` would quietly withhold a discount that a data fault - not a business
 * rule - is responsible for.
 *
 * ⚠️ CALL THIS AT THE CLAUSE POSITION, NEVER HOISTED TO THE TOP OF A TWIN. In the qualifier twin the
 * two item-price gates at [L875] and [L877] can short-circuit the exclusion disjunction BEFORE the
 * first product dereference at [L879], and the product-type block at [L858] dereferences nothing
 * when its collection is empty. A hoisted resolution would raise where the legacy quietly answers
 * `false`. The legacy itself resolves the product afresh at every site, so calling per site is also
 * exact read-count parity rather than a compromise.
 */
function requireProduct(orderItem: OrderItemView): Product {
  const product = orderItem.sku.getProduct();

  if (isAbsent(product)) {
    throw new Error(
      `OrderItem '${orderItem.orderItemID}': promotion membership requires the sku's owning ` +
        `product, which [model/service/PromotionService.cfc:L879, L883, L905, L911] and their ` +
        `reward twins dereference unconditionally.`,
    );
  }

  return product;
}

/**
 * The order item's product type, reproducing the legacy UNGUARDED dereference.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L864]: the five-hop chain
 * `arguments.orderItem.getSku().getProduct().getProductType().getProductTypeIDPath()` is
 * dereferenced with no null guard at any of its four sites - [L864-L865], [L899-L900],
 * [L934-L935] and [L965-L966]. The ported `Product.getProductType()` answers
 * `ProductType | undefined`, so the absence must be acknowledged; as above, the acknowledgement is a
 * typing necessity and the RESULTING BEHAVIOUR on an absent product type is the same raise the
 * legacy produces, never a silent `false`.
 *
 * No guard is added beyond that, per the prohibition on validation the legacy lacks: the path string
 * itself may legitimately be EMPTY, and an empty path is answered `false` by the shared path scan
 * for the structural reason that a path of no elements has nothing to look up.
 */
function requireProductType(orderItem: OrderItemView): ProductType {
  const productType = requireProduct(orderItem).getProductType();

  if (isAbsent(productType)) {
    throw new Error(
      `OrderItem '${orderItem.orderItemID}': promotion membership requires the product's product ` +
        `type, which [model/service/PromotionService.cfc:L864-L865, L899-L900, L934-L935, ` +
        `L965-L966] dereferences unconditionally.`,
    );
  }

  return productType;
}

/**
 * THE ONE THING THE TWO TWINS SHARE: the mechanical comma-list product-type path scan.
 *
 * This helper is MECHANICAL ONLY. It answers "does this order item's product-type ancestry
 * intersect this configured set of product types" and nothing more. It carries NO include/exclude
 * polarity, which is precisely why sharing it hides nothing - the semantics of the answer stay in
 * the two twins, where one caller treats `true` as grounds for exclusion and the other treats it as
 * grounds for inclusion. It is shared because the legacy code is byte-identical at all four sites
 * and AAP 0.3.3 mandates centralising the comma-list identifier-path logic rather than
 * re-implementing it per method.
 *
 * Legacy sites reproduced: [model/service/PromotionService.cfc:L859-L869] (qualifier exclusion),
 * [L893-L903] (qualifier inclusion), [L929-L939] (reward exclusion), [L959-L969] (reward inclusion).
 *
 * CFML parity [model/service/PromotionService.cfc:L861, L896, L931, L962]: each legacy accumulator
 * starts as the EMPTY STRING at [L859], [L893], [L929] and [L959], and `listAppend` onto an empty
 * list yields the value alone with NO LEADING DELIMITER. The shared `listAppend` port reproduces
 * that exactly, so a single-element list is `"id"` and never `",id"`. The accumulation stays here,
 * with the caller of the path module, because the collection it is built from differs between the
 * two twins and between the include and exclude sides.
 *
 * CFML parity [model/service/PromotionService.cfc:L860, L895, L930, L961]: the legacy accumulation
 * loops are 1-BASED - `for(var i=1; i<=arrayLen(...); i++)` reading `[i]`. The target iterates the
 * array by value instead of emulating CFML's indexing, which the Minimal Change Clause requires:
 * idiomatic TypeScript is the goal and a line-for-line transliteration would violate it. The mapping
 * is exact and total - legacy element `i` is `configuredProductTypes[i - 1]` - and iterating by
 * value also means there is no indexed read to narrow under `noUncheckedIndexedAccess`, so no
 * element can be `undefined` and nothing is asserted.
 *
 * CFML parity [model/service/PromotionService.cfc:L864, L865]: the five-hop accessor chain is
 * evaluated TWICE PER LOOP ITERATION in the legacy - once in the loop bound at [L864] and again in
 * the loop body at [L865] - at all four sites. It is read ONCE here, before the scan. The reason is
 * DETERMINISM AND READABILITY: one read makes it self-evident that every comparison in a single scan
 * is made against the same path, which re-reading through a mutable object graph does not guarantee
 * on its face. This is an unobservable read-count reduction on a pure accessor, not a divergence.
 *
 * CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966]: all four legacy lookups
 * are `if(listFindNoCase(list, element))`, and `listFindNoCase` answers a 1-BASED POSITION on a hit
 * or `0` on a miss - it is NOT a boolean. Every one of them is therefore bare numeric truthiness.
 * The comparison is made EXPLICITLY against `0` inside `idPathContainsAnyId`, which is the single
 * site where these four walks now discharge it, and which is why this helper delegates rather than
 * hand-rolling the scan. Two hazards are avoided by that delegation: writing
 * `if (listFindNoCase(...))` and leaning on JavaScript's coincidental falsiness of `0`, and
 * substituting an `Array.prototype.findIndex` or `indexOf` result - which answers `-1` on a miss -
 * into a `> 0` comparison, where a miss would read as a hit for some formulations and index 0 would
 * be lost. The delegated convention is the 1-based one: position `> 0`.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L865, L900, L935, L966]: cited as `!arrayFind`
 * sites; verified as un-negated `listFindNoCase` sites. Locator corrected against source.
 * The sole `!arrayFind` site in this method family is [model/service/PromotionService.cfc:L602],
 * which lives in `getPromotionPeriodQualificationDetails` and belongs to
 * `./promotionPeriodQualification.ts` (planned), not here.
 *
 * CFML parity [model/service/PromotionService.cfc:L865]: `listFindNoCase` is CASE-INSENSITIVE by
 * contract, as CFML `findNoCase` and CFML struct keys are. TypeScript comparison is not, so the
 * identifier match goes through the shared port rather than a hand-rolled `===` on the identifier
 * strings, which would silently reject a stored identifier whose casing differs from the configured
 * one.
 *
 * ⚠️ THE `arrayLen(...)` GUARD DELIBERATELY STAYS WITH THE CALLER, at [L858], [L892], [L928] and
 * [L958]. It is not folded in here, because it does more than skip empty work: while the configured
 * collection is empty the legacy never touches the five-hop chain at all, so folding the guard
 * inward would move the product-type dereference - and the raise it can produce - to a place the
 * legacy never reaches.
 *
 * @param orderItem - the order item whose product-type ancestry is walked.
 * @param configuredProductTypes - the configured product types, LIVE and treated as read-only.
 * @returns `true` when some element of the item's product-type path is in the configured set.
 */
function productTypeIdPathIntersects(
  orderItem: OrderItemView,
  configuredProductTypes: readonly ProductType[],
): boolean {
  // [L859] / [L893] / [L929] / [L959]: the accumulator starts empty.
  let configuredProductTypeIDList = '';

  // [L860-L862] / [L895-L897] / [L930-L932] / [L961-L963].
  for (const configuredProductType of configuredProductTypes) {
    configuredProductTypeIDList = listAppend(
      configuredProductTypeIDList,
      configuredProductType.getProductTypeID(),
    );
  }

  // [L864] loop bound and [L865] loop body, collapsed into one read.
  const productTypeIDPath = requireProductType(orderItem).getProductTypeIDPath();

  // [L864-L869] / [L899-L903] / [L934-L939] / [L965-L969]: the walk itself, delegated.
  return idPathContainsAnyId(productTypeIDPath, configuredProductTypeIDList);
}

// ---------------------------------------------------------------------------
// ★★★ THE NULL-BRAND POLARITY INVERSION. BOTH DIRECTIONS ARE RESTRICTIVE, THROUGH OPPOSITE
// LOGIC, AND BOTH ARE LOAD-BEARING.
//
// CFML parity [model/service/PromotionService.cfc:L883, L911] and the reward twin's
// equivalents at [L949] and [L977].
//
// EXCLUDE SIDE - [L883] / [L949] - A BRANDLESS PRODUCT IS EXCLUDED:
//
//   ( arrayLen( getExcludedBrands() ) && ( isNull( ...getBrand() ) || hasExcludedBrand( ...getBrand() ) ) )
//
// Read it carefully: when the qualifier or reward names ANY excluded brand AND the product
// has NO brand at all, the item is EXCLUDED. A null brand is treated as though it were
// itself on the exclusion list. That is counter-intuitive and it decides money, so it is
// reproduced exactly.
//
// INCLUDE SIDE - [L911] / [L977] - A BRANDLESS PRODUCT CAN NEVER BE INCLUDED:
//
//   if(!isNull( ...getBrand() ) && hasBrand( ...getBrand() )) { return true; }
//
// The null test is NEGATED here, so a brandless product simply never satisfies a brand
// inclusion.
//
// ⇒ THE POLARITY OF THE NULL TEST IS INVERTED BETWEEN THE TWO SIDES - `isNull(...) ||` on the
// exclude side against `!isNull(...) &&` on the include side - YET BOTH OUTCOMES POINT THE
// SAME WAY: RESTRICTIVE. Neither side is normalised into a shared brand-resolution helper;
// the exclude side does not skip brandless products, and the include side does not treat a
// brandless product as a wildcard.
//
// ⚠️ THE NULL DEREFERENCE IS PROTECTED BY SHORT-CIRCUIT EVALUATION ALONE, NOT BY A SEPARATE
// GUARD. On the exclude side `hasExcludedBrand(getBrand())` is reached only once
// `isNull(getBrand())` answered false; on the include side `hasBrand(getBrand())` is reached
// only once `!isNull(getBrand())` answered true. TypeScript's `||` and `&&` short-circuit
// identically, so the ordering maps cleanly - but reordering the operands would introduce a
// dereference of a nullish value that the legacy never performs, so the ordering is exact.
//
// ⚠️ TWO SEPARATE PREDICATES FOLLOW, ONE PER TWIN, AND THEY ARE NOT MERGED. The bodies are
// near-identical, and that is accepted for the same reason the twins themselves are not
// merged: a single shared brand predicate would make the qualifier and the reward look
// interchangeable at the one clause where the surrounding censuses differ, and the next
// person to touch it would generalise one twin into the other. Each predicate names its own
// legacy line so a reviewer can diff it against exactly one source site.
//
// Why a predicate at all rather than inline operands: the clause needs the resolved brand
// twice, and TypeScript cannot narrow the result of two separate calls. Binding it to a
// local requires a statement context, and a local hoisted above the disjunction would
// dereference the product when `getExcludedBrands()` is empty - which the legacy never does,
// because `arrayLen(...)` short-circuits first. Each predicate therefore applies the
// length gate BEFORE reading the brand, which is exactly the legacy operand order.
//
// CFML parity [model/service/PromotionService.cfc:L883, L949]: the legacy reads
// `...getBrand()` TWICE inside the clause, once per operand. It is read ONCE below. That is
// an unobservable read-count reduction on a pure accessor, in the same category as the
// path capture above, and not a divergence.
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: `hasExcludedBrand` and `hasBrand`
// belong to the framework's implicit collection-contains family, which answers `false`
// against an empty configured collection. On the exclude side that `false` is PERMISSIVE -
// the item survives - and on the include side the identical `false` is RESTRICTIVE - the
// item is rejected. See the fuller note on the two twins below.
// ---------------------------------------------------------------------------

/**
 * The compound excluded-brand exclusion operand of the QUALIFIER twin.
 *
 * Ports [model/service/PromotionService.cfc:L883] and nothing else.
 *
 * @param qualifier - the promotion qualifier whose excluded brands are consulted.
 * @param orderItem - the order item under test.
 * @returns `true` when this operand excludes the item.
 */
function qualifierExcludesByBrand(
  qualifier: PromotionQualifier,
  orderItem: OrderItemView,
): boolean {
  // [L883] first operand: `arrayLen( arguments.qualifier.getExcludedBrands() )`, as an explicit
  // emptiness test rather than the legacy's bare numeric truthiness. No excluded brands means this
  // operand contributes nothing AND the brand is never read.
  const excludedBrands: readonly Brand[] = qualifier.getExcludedBrands();
  if (excludedBrands.length === 0) {
    return false;
  }

  const brand = requireProduct(orderItem).getBrand();

  // [L883] second operand: `isNull( ...getBrand() )`. A BRANDLESS PRODUCT IS EXCLUDED.
  if (isAbsent(brand)) {
    return true;
  }

  // [L883] third operand: `arguments.qualifier.hasExcludedBrand( ...getBrand() )`, reached only
  // because the brand is present.
  return qualifier.hasExcludedBrand(brand);
}

/**
 * The compound excluded-brand exclusion operand of the REWARD twin.
 *
 * Ports [model/service/PromotionService.cfc:L949] and nothing else. Deliberately a separate
 * function from the qualifier's [L883] equivalent - see the block comment above.
 *
 * @param reward - the promotion reward whose excluded brands are consulted.
 * @param orderItem - the order item under test.
 * @returns `true` when this operand excludes the item.
 */
function rewardExcludesByBrand(reward: PromotionReward, orderItem: OrderItemView): boolean {
  // [L949] first operand: `arrayLen( arguments.reward.getExcludedBrands() )`.
  const excludedBrands: readonly Brand[] = reward.getExcludedBrands();
  if (excludedBrands.length === 0) {
    return false;
  }

  const brand = requireProduct(orderItem).getBrand();

  // [L949] second operand: `isNull( ...getBrand() )`. A BRANDLESS PRODUCT IS EXCLUDED.
  if (isAbsent(brand)) {
    return true;
  }

  // [L949] third operand: `arguments.reward.hasExcludedBrand( ...getBrand() )`.
  return reward.hasExcludedBrand(brand);
}

// ---------------------------------------------------------------------------
// ★★ THE EMPTY-COLLECTION ANSWER MEANS TWO OPPOSITE THINGS, DEPENDING ONLY ON WHICH SIDE OF
// THE FUNCTION IT LANDS ON.
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]:
//
//   public boolean function hasAnyInProperty( required string propertyName, array entityArray ) {
//     for(var entity in arguments.entityArray) {
//       if( evaluate("has#propertyName#( entity )") ){ return true; }
//     }
//     return false;
//   }
//
// When the passed array is empty the loop body never executes and the method answers `false`.
// The singular family - `hasExcludedProduct`, `hasExcludedSku`, `hasExcludedBrand`,
// `hasProduct`, `hasSku`, `hasBrand` - behaves equivalently against an empty CONFIGURED
// collection. That single `false` then means:
//
//   EXCLUDE side  [L879, L881, L883, L885] and [L945, L947, L949, L951]
//     "not on the exclusion list"  ⇒ PERMISSIVE: the item SURVIVES.
//   INCLUDE side  [L905, L908, L911, L914] and [L971, L974, L977, L980]
//     "not on the inclusion list"  ⇒ RESTRICTIVE: the item is REJECTED.
//
// ⛔ THE INCLUDE AND EXCLUDE PATHS ARE THEREFORE KEPT VISIBLY DISTINCT BELOW, AND ARE NEVER
// FACTORED INTO ONE GENERIC MEMBERSHIP HELPER such as a shared `matchesAny(collection,
// candidate)` used by both sides. One helper would make the asymmetry above invisible, and
// the next reader would "simplify" one side into the other. The framework's SEMANTICS are
// reproduced here; no file under `org/Hibachi/**` is ported or modified - that tree is a
// boundary to extract from and never touch.
// ---------------------------------------------------------------------------

/**
 * Which order items a promotion qualifier or reward applies to.
 *
 * ONE exported unit carrying the two membership twins, both with their legacy CFML names verbatim in
 * camelCase - `getOrderItemInQualifier`, not `isOrderItemInQualifier`; `getOrderItemInReward`, not
 * `orderItemMatchesReward`. Interface parity is the acceptance contract for this migration, so a
 * reviewer can diff these two surfaces against
 * [model/service/PromotionService.cfc:L852-L919, L921-L985] method for method. The ESLint
 * configuration deliberately ships no naming-convention rules precisely so that parity wins over
 * house style here.
 *
 * BOTH METHODS ARE SYNCHRONOUS, and that is a deliberate application of the project's async boundary
 * rule: a ported method becomes `async` if and only if its legacy body reaches the DAO or the ORM, or
 * a collaborator that does. Neither of these bodies reaches any of them. They traverse associations
 * that the repository already materialized and walk a comma-delimited string, so making either one
 * `async` for consistency would add a promise the legacy contract does not have and would force every
 * caller - including the negated call site at [model/service/PromotionService.cfc:L805] - to await a
 * pure predicate.
 *
 * The legacy `any` parameter types are replaced by the concrete entity and view types, which is a
 * refinement rather than a widening; the legacy `boolean` return is unchanged. Parameter names, order
 * and count are unchanged in both methods.
 *
 * Stateless and safe to share: the class holds no field, no cache and no collaborator, so a single
 * instance may be wired once in `src/handlers/bootstrap.ts` (planned) and injected into
 * `./qualifierQualification.ts` (planned), `./promotionPeriodQualification.ts` (planned) and
 * `../promotionService.ts` (planned) as a `readonly` constructor field.
 */
export class OrderItemMembership {
  /**
   * Does this qualifier apply to this order item?
   *
   * Ports `public boolean function getOrderItemInQualifier(required any qualifier, required any
   * orderItem)` [model/service/PromotionService.cfc:L852-L919].
   *
   * SEVEN exclusion operands, including the two item-price gates the reward twin does not have. The
   * shape is: exclusions first with a single early `return false`, then inclusions as sequential
   * early `return true`s, then a restrictive final `return false`.
   *
   * @param qualifier - the promotion qualifier being tested.
   * @param orderItem - the order item being tested, read-only.
   * @returns `true` when the item is a member of this qualifier's scope.
   */
  public getOrderItemInQualifier(qualifier: PromotionQualifier, orderItem: OrderItemView): boolean {
    // ---- [L854] START: Check Exclusions ----------------------------------------------------
    //
    // ⚠️ EXCLUSIONS ARE EVALUATED FIRST AND SHORT-CIRCUIT THE WHOLE FUNCTION. If any operand
    // matches, [L887] answers `false` and the inclusion block below is never reached. Evaluating
    // inclusions first would let an item that is both included and excluded slip through as a
    // member, which is a different answer and therefore different money.

    // [L856] the flag, declared false before the disjunction that consumes it.
    let hasExcludedProductType = false;

    // [L857-L870] the product-type exclusion scan. It is computed BEFORE the big `if` and its
    // result is consumed as the FIRST operand of that disjunction, so this scan runs
    // unconditionally - subject only to its own emptiness gate - whereas operands 2 through 7 are
    // short-circuited. That two-step shape is reproduced rather than inlined as a lazily evaluated
    // call in the disjunction, which would change when the path walk happens.
    //
    // [L858] `arrayLen(...)` as an explicit emptiness test. See `productTypeIdPathIntersects` for
    // why this gate stays here and is not folded into the scan.
    const excludedProductTypes: readonly ProductType[] = qualifier.getExcludedProductTypes();
    if (excludedProductTypes.length > 0) {
      // [L864-L869] the legacy loop sets the flag and `break`s on the first hit. The delegated
      // scan stops at the first hit for the same reason, and its boolean answer is what the flag
      // records. Assigning `false` on a miss restores the value [L856] already established.
      hasExcludedProductType = productTypeIdPathIntersects(orderItem, excludedProductTypes);
    }

    // ---- The two item-price gates, QUALIFIER-ONLY ------------------------------------------
    //
    // CFML parity [model/service/PromotionService.cfc:L875, L877] - THE BARE-`qualifier` SCOPE
    // ARTIFACT. Both legacy operands read the UNSCOPED `qualifier.getMinimumItemPrice()` and
    // `qualifier.getMaximumItemPrice()`, while every other operand in the same `if` reads
    // `arguments.qualifier`. In CFML the unscoped lookup resolves to `arguments`, so the behaviour
    // is identical; it is a style wart, not a bug, and it is the same family as the bare-scope
    // reads at [L727], [L743], [L993] and [L998]. TypeScript has no `arguments` scope, so the
    // distinction CANNOT EXIST in the target. It is recorded once here, and no attempt is made to
    // reproduce a scope distinction that cannot exist - attempting to would be exactly the kind of
    // CFML transliteration the Minimal Change Clause forbids.
    //
    // Each legacy operand reads its bound TWICE, once for the null test and once for the
    // comparison. Each is read once here, into a local. Both accessors are pure reads on the
    // qualifier itself and dereference nothing nullable, so hoisting them above the disjunction
    // cannot introduce a raise the legacy avoids - unlike the product, which is resolved at its
    // clause position.
    const minimumItemPrice = qualifier.getMinimumItemPrice();
    const maximumItemPrice = qualifier.getMaximumItemPrice();

    // [L873-L888] THE SEVEN-OPERAND EXCLUSION DISJUNCTION, in legacy operand order.
    //
    // CFML parity [model/service/PromotionService.cfc:L873-L886, L943-L952]: SEVEN operands here
    // against FIVE in `getOrderItemInReward`. Operands 2 and 3 - the item-price gates - exist ONLY
    // in this twin. The duplication between the two disjunctions is DELIBERATE; unifying them is a
    // behavioural change. See the census table in the file header.
    //
    // CFML parity [model/service/PromotionService.cfc:L875, L877] - BOTH ITEM-PRICE COMPARISONS
    // ARE STRICT, so BOUNDARY EQUALITY IS INCLUSIVE. An item priced exactly at
    // `minimumItemPrice` is NOT excluded, because `min > price` is false at equality, and one
    // priced exactly at `maximumItemPrice` is NOT excluded either. `>=` or `<=` here would
    // exclude the boundary and charge a different price. The comparison direction reads
    // backwards but is correct: the clause EXCLUDES when the configured minimum sits ABOVE the
    // item price, meaning the item is too cheap to qualify - and symmetrically when the
    // configured maximum sits BELOW it, meaning the item is too expensive.
    //
    // Both bounds are nullable and INDEPENDENT - a qualifier may configure one, both or neither -
    // and an absent bound imposes no constraint at all. Nothing validates that the minimum does
    // not exceed the maximum, nothing validates non-negativity, and nothing raises on a
    // nonsensical band: the legacy performs none of those checks, and an inverted band that
    // excludes every item is legitimate legacy behaviour rather than a fault to be caught.
    //
    // Both bounds and the item price are MONETARY, so all three are `Money` and the comparisons
    // go through `Money.isGreaterThan` and `Money.isLessThan`. No raw floating-point operation
    // touches a monetary value anywhere in this file, and `Money.zero` is never substituted for an
    // absent bound - an absent bound is the absence of a constraint, not a bound of zero.
    if (
      hasExcludedProductType ||
      (!isAbsent(minimumItemPrice) && minimumItemPrice.isGreaterThan(orderItem.price)) ||
      (!isAbsent(maximumItemPrice) && maximumItemPrice.isLessThan(orderItem.price)) ||
      qualifier.hasExcludedProduct(requireProduct(orderItem)) ||
      qualifier.hasExcludedSku(orderItem.sku) ||
      qualifierExcludesByBrand(qualifier, orderItem) ||
      qualifier.hasAnyExcludedOption(orderItem.sku.getOptions())
    ) {
      // [L887]
      return false;
    }

    // ---- [L890] START: Check Inclusions ---------------------------------------------------

    // [L892-L904] the product-type inclusion scan. Same loop shape as the exclusion scan above,
    // DIFFERENT EXIT: the legacy exclusion loop sets a flag and `break`s, while this one
    // `return true`s straight out of the function at [L901]. Both exits are mirrored faithfully.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L893, L959]: the legacy accumulator for both
    // inclusion scans is named `includedPropertyTypeIDList` - "Property" where it should read
    // "Product" - and the misspelling recurs at [L896]/[L900] and [L962]/[L966]. It is a purely
    // local variable with no data contract of any kind, so the target spells it correctly; the
    // original spelling is recorded here because a reviewer diffing the two surfaces meets it
    // first. Contrast `hb_permission="promotionPeriod.promtionRewards"` at
    // [model/entity/PromotionReward.cfc:L57], which IS a persisted data contract and is preserved
    // VERBATIM, misspelling and all. The two categories must not be conflated: an internal
    // identifier is renamed and recorded, a contract string is preserved and recorded.
    const includedProductTypes: readonly ProductType[] = qualifier.getProductTypes();
    if (includedProductTypes.length > 0) {
      // [L899-L903]
      if (productTypeIdPathIntersects(orderItem, includedProductTypes)) {
        return true;
      }
    }

    // [L905-L916] FOUR SEQUENTIAL INCLUSION TESTS, each with its OWN early `return true`. The
    // legacy writes four separate `if` statements - NOT an `if`/`else if` chain and NOT a single
    // `||` disjunction - and that is reproduced literally so a reviewer can diff them line for
    // line. Each of these answers `false` against an empty configured collection, and on this side
    // of the function that `false` is RESTRICTIVE.

    // [L905-L907]
    if (qualifier.hasProduct(requireProduct(orderItem))) {
      return true;
    }

    // [L908-L910]
    if (qualifier.hasSku(orderItem.sku)) {
      return true;
    }

    // [L911-L913] the brand inclusion, with the null test NEGATED - the polarity inversion against
    // [L883]. A BRANDLESS PRODUCT CAN NEVER BE INCLUDED. The product is dereferenced
    // unconditionally here exactly as the legacy does, which [L905] has already done by this point,
    // and `hasBrand` is reached only once the brand is known present.
    const brand = requireProduct(orderItem).getBrand();
    if (!isAbsent(brand) && qualifier.hasBrand(brand)) {
      return true;
    }

    // [L914-L916]
    if (qualifier.hasAnyOption(orderItem.sku.getOptions())) {
      return true;
    }

    // CFML parity [model/service/PromotionService.cfc:L918, L984] - THE FINAL `return false` IS A
    // RESTRICTIVE DEFAULT AND IT IS LOAD-BEARING. A qualifier with no product types, no products,
    // no skus, no brands and no options matches NOTHING: every order item falls through every
    // inclusion test and lands here. An "empty" qualifier therefore scopes ZERO items. This is NOT
    // inverted into a permissive "matches everything" default, and no "if no inclusion criteria are
    // configured, include all" convenience branch is added - that would be behaviour the legacy
    // does not have, and it would silently widen every unconfigured promotion to the whole order.
    // [L918]
    return false;
  }

  /**
   * Does this reward apply to this order item?
   *
   * Ports `public boolean function getOrderItemInReward(required any reward, required any
   * orderItem)` [model/service/PromotionService.cfc:L921-L985].
   *
   * FIVE exclusion operands. ⛔ THE TWO ITEM-PRICE GATES OF THE QUALIFIER TWIN ARE ABSENT HERE AND
   * MUST NOT BE ADDED: `PromotionReward` declares neither `minimumItemPrice` nor
   * `maximumItemPrice`, so adding them would invent enforcement the legacy does not perform and
   * would withhold discounts the legacy grants.
   *
   * @param reward - the promotion reward being tested.
   * @param orderItem - the order item being tested, read-only.
   * @returns `true` when the item is a member of this reward's scope.
   */
  public getOrderItemInReward(reward: PromotionReward, orderItem: OrderItemView): boolean {
    // ---- [L924] START: Check Exclusions ----------------------------------------------------
    //
    // ⚠️ EXCLUSIONS FIRST, short-circuiting the whole function at [L953], exactly as in the
    // qualifier twin.

    // [L926]
    let hasExcludedProductType = false;

    // [L927-L940] the product-type exclusion scan, computed before the disjunction and consumed as
    // its first operand. [L928] `arrayLen(...)` as an explicit emptiness test.
    const excludedProductTypes: readonly ProductType[] = reward.getExcludedProductTypes();
    if (excludedProductTypes.length > 0) {
      // [L934-L939] flag-and-break in the legacy; the delegated scan's boolean answer records it.
      hasExcludedProductType = productTypeIdPathIntersects(orderItem, excludedProductTypes);
    }

    // [L943-L954] THE FIVE-OPERAND EXCLUSION DISJUNCTION, in legacy operand order.
    //
    // CFML parity [model/service/PromotionService.cfc:L873-L886, L943-L952]: FIVE operands here
    // against SEVEN in `getOrderItemInQualifier`. THERE IS NO ITEM-PRICE GATE IN THIS TWIN - a
    // reward cannot be scoped to a price band. The body below is deliberately NOT shared with the
    // qualifier twin: the two are near-identical but not identical, and the difference is exactly
    // the two operands that decide which items get priced.
    if (
      hasExcludedProductType ||
      reward.hasExcludedProduct(requireProduct(orderItem)) ||
      reward.hasExcludedSku(orderItem.sku) ||
      rewardExcludesByBrand(reward, orderItem) ||
      reward.hasAnyExcludedOption(orderItem.sku.getOptions())
    ) {
      // [L953]
      return false;
    }

    // ---- [L956] START: Check Inclusions ---------------------------------------------------

    // [L958-L970] the product-type inclusion scan - same loop shape as the exclusion scan, exiting
    // by `return true` at [L967] rather than by flag-and-break. The legacy accumulator here is the
    // second `includedPropertyTypeIDList` site, at [L959]; see the note in the qualifier twin.
    const includedProductTypes: readonly ProductType[] = reward.getProductTypes();
    if (includedProductTypes.length > 0) {
      // [L965-L969]
      if (productTypeIdPathIntersects(orderItem, includedProductTypes)) {
        return true;
      }
    }

    // [L971-L982] FOUR SEQUENTIAL INCLUSION TESTS, each with its own early `return true` - four
    // separate `if` statements in the legacy, not a chain and not a disjunction.

    // [L971-L973]
    if (reward.hasProduct(requireProduct(orderItem))) {
      return true;
    }

    // [L974-L976]
    if (reward.hasSku(orderItem.sku)) {
      return true;
    }

    // [L977-L979] the brand inclusion, null test NEGATED - the polarity inversion against [L949].
    // A BRANDLESS PRODUCT CAN NEVER BE INCLUDED.
    const brand = requireProduct(orderItem).getBrand();
    if (!isAbsent(brand) && reward.hasBrand(brand)) {
      return true;
    }

    // [L980-L982]
    if (reward.hasAnyOption(orderItem.sku.getOptions())) {
      return true;
    }

    // CFML parity [model/service/PromotionService.cfc:L918, L984] - THE RESTRICTIVE DEFAULT. A
    // reward with no product types, no products, no skus, no brands and no options matches NOTHING,
    // so an "empty" reward discounts ZERO items. Preserved, never inverted.
    // [L984]
    return false;
  }
}
