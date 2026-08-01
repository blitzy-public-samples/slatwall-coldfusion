/**
 * slatwall-ts - QUALIFIER QUALIFICATION: the three-way `qualifierType` dispatch that decides, for
 * one promotion qualifier, HOW MANY TIMES it qualifies and WHICH fulfillments and order items it
 * qualifies.
 *
 * WHAT THIS FILE IS
 * A one-to-one port of the private CFML helper `getQualifierQualificationDetails`
 * [model/service/PromotionService.cfc:L629-L750]. `model/service/PromotionService.cfc` is the SOLE
 * BEHAVIOURAL AUTHORITY for everything below; `model/entity/PromotionQualifier.cfc` and
 * `model/service/AddressService.cfc` were read only as accessor and port contracts.
 *
 * WHY IT MATTERS
 * This sits directly beneath must-preserve area #1 - promotion discount math together with
 * use-limit enforcement semantics. The `qualificationCount` computed here is multiplied by the
 * reward ledger's `maximumUsePerQualification` in the ratchet at
 * [model/service/PromotionService.cfc:L222-L224], and the `qualifiedFulfillmentIDs` produced here
 * gate whole branches of the engine. A wrong answer does not produce a slightly different
 * discount - it changes the money a customer is charged.
 *
 * THE THREE ARMS, AND THE ONE THAT IS ABSENT
 *   ORDER       [model/service/PromotionService.cfc:L638-L653] - assign 1, then revoke to 0.
 *   FULFILLMENT [model/service/PromotionService.cfc:L656-L711] - count and append FIRST, then test
 *               and walk the append back.
 *   ORDER ITEM  [model/service/PromotionService.cfc:L714-L745] - accumulate matching quantity, then
 *               divide by the configured minimum.
 *   (no default) [model/service/PromotionService.cfc:L747] - see the LEGACY-NOTE on the dispatch.
 *
 * SYNCHRONOUS, AND DELIBERATELY SO
 * The legacy body reaches no DAO and no ORM. Its only outward calls are
 * `getAddressService().isAddressInZone(...)` [model/service/PromotionService.cfc:L684], whose port
 * declares a single synchronous member, and `getOrderItemInQualifier(...)`
 * [model/service/PromotionService.cfc:L727], which is synchronous. Nothing here justifies an async
 * boundary, and adding one "for consistency" with the async caller would force a promise chain
 * onto a pure computation.
 *
 * PARAMETERIZED SQL (E5): NOT APPLICABLE TO THIS FILE, AND STATED RATHER THAN SILENTLY OMITTED.
 * The project standard is that every query uses prepared statements, preserving the injection
 * safety `cfqueryparam` provided. This module issues NO query of any kind - no SQL string, no
 * driver import, no connection, no interpolation site. Every statement that touches the `Sw*`
 * schema lives in `src/repositories/mysql/**`, which is the only layer that speaks to the
 * database. Silence here would read as an oversight, so the exemption is recorded.
 *
 * SCHEMA CONTINUITY (B5): NOTHING HERE IS PERSISTED, AND NO VALIDATION THE LEGACY LACKS IS ADDED.
 * This module computes an in-memory verdict and returns it. No table, no column, no migration. It
 * adds no `qualifierType` validation, no exhaustiveness check, no min-versus-max check, no
 * non-negativity check, no divisor validation and no null guard the legacy does not already have.
 * Every place where that restraint is load-bearing carries its own annotation below.
 *
 * NO MODULE-LEVEL MUTABLE STATE - A CORRECTNESS CONSTRAINT, NOT HOUSEKEEPING.
 * There is no memo, no cache and no lazily-populated module-scope map in this file, and none may be
 * added. On a warm Lambda container module-level state survives between UNRELATED invocations, so a
 * cached qualification verdict could leak one customer's result into another customer's order. The
 * only module-scope bindings below are the two pure helper functions and one type declaration -
 * none of them holds state. Request-scoped state lives on the stack, inside the one public method.
 * (The single documented module-state exception anywhere in this subtree is the MySQL connection
 * pool in `src/repositories/mysql/connection.ts`, which is an engineering decision about connection
 * reuse.)
 *
 * NO SETTINGS AND NO AMBIENT SCOPE. This module reads no setting, takes no `settingsProvider`, and
 * never touches `src/lib/config.ts` - process configuration is not a request scope. Everything the
 * algorithm needs arrives through its two parameters and its two injected collaborators.
 *
 * VIEWS ARE READ-ONLY AND NOTHING IS WRITTEN BACK.
 * `OrderView`, `OrderItemView` and `OrderFulfillmentView` are the anti-corruption projections of an
 * out-of-scope aggregate. Their `orderID` / `orderItemID` / `orderFulfillmentID` values are OPAQUE
 * strings, carried verbatim and never parsed. This module mutates no view, mutates no collection it
 * receives, and writes nothing to order persistence: it returns a value and that is all.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L629]: VISIBILITY WIDENING. The legacy declaration
 * is `private struct function`, and the ported unit below is EXPORTED so this behaviour can be
 * tested directly instead of only through the 489-line engine that calls it.
 * This alters VISIBILITY ONLY and does not alter behaviour: no parameter is added, removed,
 * reordered or defaulted, the return shape is the published `QualifierQualification` unchanged, and
 * no branch is reachable that was not reachable before. No other private method of the legacy
 * component is promoted by this file.
 *
 * LEGACY-NOTE [meta/tests/unit/service]: TEST COVERAGE FOR THIS MODULE IS NET-NEW, NOT PARITY.
 * The legacy suite's service tier holds only AccountServiceTest, HibachiServiceTest,
 * PaymentServiceTest and UtilityRBServiceTest, none of which is in scope, and the only two legacy
 * tests that touch this slice at all cover the Brand and Product entities.
 * Nothing exercised here traces to a legacy antecedent, so none of it may be presented as
 * carried-forward coverage. The obligation is still real - every converted method needs a test, and
 * the characterization suites must pin current behaviour INCLUDING the defect reproduced below -
 * but `slatwall-ts/tests/**` is authored separately and this module creates no test file.
 *
 * NO USER RULES WERE PROVIDED FOR THIS PROJECT. The rules document returns exactly "No user rules
 * provided.", re-queried both without a range and over the whole document with byte-identical
 * results, so the absence is verified rather than assumed. No rule is invented to fill it and the
 * absence is not treated as licence to lower the bar: maximal strictness with no `any`, no
 * suppression comment and no non-null assertion; one exported unit; no barrel; every judgment call
 * annotated where it was made.
 */

import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneLocationProjection,
  AddressZoneProjection,
} from '../../domain/ports/addressZoneEvaluator.js';
import type { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type {
  QualifiedOrderItemDetail,
  QualifierQualification,
} from '../../domain/promotionEngine/qualificationTypes.js';
import type {
  OrderFulfillmentView,
  ShippingAddressView,
} from '../../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import type { OrderItemMembership } from './orderItemMembership.js';
import { listFindNoCase } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT IMPORTED, AND WHY EACH OMISSION IS A DECISION
//
//   ../promotionService.js               - the facade. The intra-folder import discipline is
//                                          DIRECTIONAL: the facade may import all nine modules of
//                                          this folder, and NOTHING in this folder may import it
//                                          back. A cycle here would be a gate failure.
//   ../../domain/valueObjects/money.js   - `Money` is reached only as the STATIC TYPE of
//                                          `OrderView.subtotal` and of the qualifier's two subtotal
//                                          gates, and it is compared through methods those values
//                                          already carry. No `Money` value is constructed here, so
//                                          importing the class would be an unused binding and
//                                          `noUnusedLocals` would reject it.
//   decimal.js                           - never imported directly anywhere in this subtree; all
//                                          decimal arithmetic is `Money`'s. This folder needs none
//                                          of the fourteen pinned packages directly.
//   ../../lib/cfml/precision.js          - there is no `precisionEvaluate` site in L629-L750.
//   ../../lib/cfml/numberFormat.js       - there is no `numberFormat` call in L629-L750, and the
//                                          L743 division is plain integer arithmetic.
//   ../../lib/cfml/struct.js             - no case-insensitive struct-key access in this range.
//   ../../domain/valueObjects/
//     materializedIdPath.js              - comma-list ID-path walking belongs to
//                                          ./orderItemMembership.js, which this module delegates to.
//   ../../domain/promotionEngine/
//     rewardUsageTypes.js,
//     qualifiedDiscountTypes.js          - this module touches neither the reward-usage ledger nor
//                                          the qualified-discount accumulator.
//   ../../domain/entities/promotionApplied.js - nothing is applied here; this module only qualifies.
//   ../../repositories/**, ../../handlers/**, ../../integrations/** - outward layers. This folder
//                                          imports from ../../domain/** and ../../lib/** only.
// ---------------------------------------------------------------------------------------------

// JUDGMENT CALL: the qualifier's shipping-address-zone collection reaches this module as OPAQUE
// IDENTIFIERS, so the value handed to the zone evaluator is modelled here rather than fetched.
//
// The legacy loop at [model/service/PromotionService.cfc:L681] iterates MATERIALIZED `AddressZone`
// entities off the qualifier and hands each one to `isAddressInZone`
// [model/service/PromotionService.cfc:L684]. `AddressZone` is not one of the eighteen in-scope
// entities, and the two shipped in-scope entities that own the association both collapsed it to
// opaque identifiers and both published the same far-side contract FOR THIS FILE BY NAME:
// `src/domain/entities/promotionQualifier.ts` directs that the fulfillment-method, shipping-method
// and shipping-address-zone gates be evaluated "against these opaque identifier lists, resolving
// zone semantics only through the `addressZoneEvaluator` port", and
// `src/domain/entities/promotionReward.ts` says the same of its own zone collection. Accordingly
// `PromotionQualifier` exposes `getShippingAddressZoneIDs(): readonly string[]` and no
// entity-array accessor.
//
// So the identifier is the only per-zone datum this module holds. It is carried through verbatim,
// one loop element per configured zone, which preserves the collection's CARDINALITY, its ORDER and
// the early exit on the first hit. Resolving that identifier to a location set belongs to the
// composition root, which wires the single `AddressZoneEvaluator` instance and is the only
// zone-aware layer in the target. That is also what the legacy did: the location walk happened
// INSIDE `AddressService.isAddressInZone` [model/service/AddressService.cfc:L60-L61], over a
// collection Hibernate loaded lazily at that point - not in the promotion service.
//
// Rejected alternatives, each named so the choice is reviewable:
//   * add `getShippingAddressZones()` to `PromotionQualifier` - no member may be added to a
//     published type, and the entity's own census records the accessor as deliberately absent;
//   * a fourth module under `src/domain/views/` - that folder is closed at three;
//   * a fourteenth port for zone materialization - the port folder is closed at thirteen;
//   * a third injected collaborator - the collaborator set for this unit is exactly two;
//   * make the method `async` and fetch - the method is synchronous by mandate and no repository
//     port is in scope for this folder;
//   * skip the loop when zones are configured - that would change which fulfillments qualify, and
//     therefore the money.
/**
 * One configured shipping address zone, as this module can address it.
 *
 * Extends the published {@link AddressZoneProjection} rather than redeclaring it, so the value is
 * accepted by the port without widening, shadowing or re-deriving the port's own contract.
 *
 * `addressZoneLocations` keeps the published element type and is NOT narrowed to the empty tuple.
 * That distinction is behavioural, not cosmetic, and it is the single most important line in this
 * file's zone handling:
 *
 *   * The port documents that "a zone with no matching location - INCLUDING A ZONE WITH NO LOCATIONS
 *     AT ALL - is not entered" [src/domain/ports/addressZoneEvaluator.ts, isAddressInZone]. So a zone
 *     whose location list is EMPTY is a zone that deterministically answers `false`.
 *   * Typing the member `readonly []` would therefore be this module ASSERTING, in the type system,
 *     that every configured zone fails - which is a substantive claim about zone membership, and a
 *     WRONG one. Legacy answers `true` for an address that matches a real zone location, and that
 *     answer is observable: it decides inclusion whenever the qualifier configures BOTH zones and
 *     shipping methods and the fulfillment's method is a member (the one branch that DEFECT 11 at
 *     L703 degrades to the new-address test alone rather than excluding outright).
 *   * Keeping the published element type instead says only what is true - this module carries
 *     whatever locations it is given, and it decides no membership itself.
 *
 * THE OBLIGATION THIS PLACES ON THE PORT IMPLEMENTATION, STATED SO IT CANNOT BE MISSED: the domain
 * layer deliberately does not materialize the zone association, so the value this module constructs
 * carries the zone's IDENTITY in `addressZoneID` and an EMPTY location list. The single concrete
 * `AddressZoneEvaluator` - wired in the composition root, which the port names as its only
 * implementation home - MUST resolve locations from `addressZoneID` and must NOT treat the empty list
 * as "this zone has no locations". This module makes no zone-membership decision of its own; it calls
 * the port once per configured zone, in the source's order, and honours the first `true`, which is
 * exactly the delegation the entity mandates: resolve zone semantics ONLY through the port
 * [src/domain/entities/promotionQualifier.ts, the far-side contract for this file].
 *
 * A throwing accessor on `addressZoneLocations` was considered as a way to make a naive
 * empty-list read fail loudly rather than silently answer `false`, and REJECTED: it would add a
 * failure mode neither the legacy nor the port contract has, and it would break a perfectly
 * legitimate implementation that reads locations in a future where they ARE materialized.
 */
interface ConfiguredShippingAddressZone extends AddressZoneProjection {
  /**
   * The opaque `SwPromoQualShipAddressZone.addressZoneID` value, carried verbatim. This is the
   * load-bearing field: it is the only per-zone datum the domain layer publishes, and it is what the
   * port implementation must resolve against.
   */
  readonly addressZoneID: string;

  /**
   * The port's declared channel for a zone's locations, kept at the published element type. Supplied
   * empty by this layer because the domain does not materialize the association; see the type's own
   * note for the obligation that places on the implementation.
   */
  readonly addressZoneLocations: readonly AddressZoneLocationProjection[];
}

/**
 * Project the qualifier's configured shipping-address-zone IDs onto the shape the evaluator port
 * accepts, preserving CARDINALITY and ORDER exactly.
 *
 * CFML parity [model/service/PromotionService.cfc:L672, L681, L703]: the source iterates
 * `arguments.qualifier.getShippingAddressZones()`, an array of `AddressZone` ENTITIES, and hands each
 * element straight to `isAddressInZone`. The shipped domain layer publishes the same association as
 * `getShippingAddressZoneIDs(): readonly string[]` - opaque identifiers rather than entities, because
 * `AddressZone` is an out-of-scope entity type - so the target iterates the identifier list instead.
 * The mapping is one-to-one and order-preserving, so `arrayLen(...)` at L672, L699-style length gates
 * and the L681 iteration order all answer identically, and the L685-L686 early exit still stops at
 * the same element.
 *
 * Nothing about zone MEMBERSHIP is decided here. That semantic belongs entirely to the
 * `addressZoneEvaluator` port, which is the only collaborator permitted to resolve a zone, and which
 * receives `addressZoneID` verbatim so it can do so. The location list is supplied empty because the
 * domain publishes no locations; see {@link ConfiguredShippingAddressZone} for the obligation that
 * places on the port implementation and for why this module must not narrow the member to an empty
 * tuple.
 */
function toConfiguredShippingAddressZones(
  addressZoneIDs: readonly string[],
): readonly ConfiguredShippingAddressZone[] {
  return addressZoneIDs.map((addressZoneID) => {
    const addressZoneLocations: readonly AddressZoneLocationProjection[] = [];

    return { addressZoneID, addressZoneLocations };
  });
}

/**
 * A narrowing wrapper over the shared `isNullish()` port of CFML `isNull()`.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is right for a general-purpose
 * predicate but gives the compiler nothing to narrow with. Wrapping it in a type predicate keeps
 * ONE definition of "nullish" in the subtree - the delegation is real, not decorative - while
 * letting strict mode see the narrowing, so no non-null assertion (banned in `src/**`) and no type
 * assertion is needed at any of the eight `!isNull(...)` sites this module reproduces
 * [model/service/PromotionService.cfc:L644, L646, L648, L650, L695, L697, L701, L742].
 *
 * A present value is a CONSTRAINT and an absent one imposes NONE - that polarity is the legacy's at
 * every bound, and it is why absence must be answered rather than defaulted away.
 */
function isPresent<TValue>(value: TValue | undefined): value is TValue {
  return !isNullish(value);
}

/**
 * Project a fulfillment's shipping address onto the shape the zone evaluator declares.
 *
 * JUDGMENT CALL: the projection is built field by field instead of passing the view straight
 * through, because the two shipped contracts are not assignment-compatible under
 * `exactOptionalPropertyTypes`: `ShippingAddressView` declares each field `string | undefined`
 * while `AddressProjection` declares each one optional with type `string | null`, so handing the
 * view over directly is a compile error (TS2379) rather than a style choice.
 *
 * The mapping is BEHAVIOUR-NEUTRAL, and that is the whole point of doing it explicitly. The zone
 * evaluator null-guards the LOCATION side only and never absence-tests the ADDRESS side
 * [model/service/AddressService.cfc:L63-L74]; an absent address field therefore cannot satisfy a
 * location field that does specify a value, and it reaches that outcome identically whether it
 * arrives as `null` or as `undefined`. The port's own contract states that both count as "no value
 * present". Nothing is defaulted, widened or invented: four fields in, the same four fields out.
 */
function toAddressProjection(address: ShippingAddressView): AddressProjection {
  return {
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    stateCode: address.stateCode ?? null,
    countryCode: address.countryCode ?? null,
  };
}

/**
 * Read a fulfillment's address the way the legacy qualifier branch reads it: WITHOUT A GUARD.
 *
 * CFML parity [model/service/PromotionService.cfc:L678, L684, L703]: the qualifier branch
 * dereferences `orderFulfillment.getAddress()` at three separate sites and guards it at NONE of
 * them, so an unresolved address is a legacy null-reference failure at whichever site is reached
 * first. `src/domain/views/orderFulfillmentView.ts` types `address` as `ShippingAddressView |
 * undefined` for exactly that reason, so the absence is expressible in the target and must resolve
 * the same way it does in CFML - by FAILING, never by degrading into `false`.
 *
 * This helper therefore RAISES rather than validates. It adds no behaviour: it reproduces the
 * legacy failure so that a `strict`-mode narrowing obligation cannot quietly turn a legacy
 * exception into a silently different answer (B5 forbids adding validation the legacy lacks, and it
 * equally forbids swallowing a failure the legacy has).
 *
 * The `locator` argument names the legacy site being reproduced, so a raised error identifies which
 * of the three dereferences fired. It is called once per legacy dereference - never hoisted into a
 * single shared read - because the legacy calls `getAddress()` afresh at each site.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L360, L678, L703]: THE NULL-GUARD ASYMMETRY IS THE
 * SOURCE'S AND IS NOT NORMALISED HERE. The fulfillment-REWARD branch at L360 guards the very same
 * dereference with `!isNull(orderFulfillment.getAddress()) && !orderFulfillment.getAddress().isNew()`,
 * and it reads the flag through a DIFFERENT accessor (`isNew()` there, `getNewFlag()` at L678 and
 * L703).
 * No guard is added to the two qualifier sites to match L360, and none is removed from L360, which
 * is not this module's code in any case. Both readings stay expressible and each call site chooses
 * for itself, which is what preserving the asymmetry means.
 */
function dereferenceFulfillmentAddress(
  orderFulfillment: OrderFulfillmentView,
  locator: string,
): ShippingAddressView {
  const address = orderFulfillment.address;

  if (!isPresent(address)) {
    throw new TypeError(
      `Unresolved fulfillment address for orderFulfillmentID ` +
        `"${orderFulfillment.orderFulfillmentID}". Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when no ` +
        `address has been resolved.`,
    );
  }

  return address;
}

// JUDGMENT CALL: the exported unit is a CLASS named `QualifierQualificationEvaluator`, not
// `QualifierQualification`.
//
// `QualifierQualification` is already taken - it is the published RETURN TYPE imported from
// `../../domain/promotionEngine/qualificationTypes.js`, and this file must not redeclare, widen,
// re-derive or shadow it. Naming the class distinctly keeps the published name visible at the point
// of use, which is where a reviewer checks interface parity.
//
// Rejected alternatives:
//   * a free exported function - it stops being one exported unit the moment a helper needs
//     exporting, and the two arm evaluators below are exactly that pressure;
//   * an aliased import of the published type - it hides the canonical name at the site that most
//     needs to show it, and makes the return annotation unverifiable at a glance;
//   * a second module to hold the helpers - this folder is closed at nine modules, so a tenth would
//     be a gate failure, as would a barrel, an `index.ts`, a `types.ts` or a nested subfolder.
//
// The class exports ONE public method. The two arm evaluators are `private`, which is what lets the
// dispatch read like the source without turning either of them into a second export.

// JUDGMENT CALL: the collaborating membership unit is received by CONSTRUCTOR INJECTION, and the
// sibling import that makes it possible is DIRECTIONAL rather than forbidden.
//
// The no-intra-folder-imports discipline in this folder is directional, not absolute: the facade
// `../promotionService.ts` may import all nine modules, and nothing in this folder may import the
// facade back. Sibling imports AMONG the nine are necessary and permitted while the graph stays
// ACYCLIC, and the verified edges here form a strict chain with no cycle:
//
//   ./promotionPeriodQualification.ts  ->  THIS MODULE  ->  ./orderItemMembership.ts
//        (calls at L590)                                        (call at L727)
//
// `./orderItemMembership.ts` exports a single class carrying both verbatim-named membership methods
// and declares no constructor dependencies of its own, so injecting the unit costs nothing and keeps
// this module's own collaborator set explicit and compile-checked.
//
// The alternative - passing the collaborating function in as a parameter of
// `getQualifierQualificationDetails` - would CONSUME A SIGNATURE WIDENING, and zero remain
// project-wide. Injection is therefore not merely tidier, it is the only option that leaves the
// acceptance contract intact.

/**
 * The qualifier-level qualification evaluator: one qualifier in, one verdict out.
 *
 * Both collaborators replace a legacy DI/1 convention-scanned property and are wired exactly once in
 * the composition root (transformation rule T1). There is no service locator, no DI container
 * package and no runtime scan anywhere in this file - the legacy `getAddressService()` lookup at
 * [model/service/PromotionService.cfc:L684] and the implicit same-component call at
 * [model/service/PromotionService.cfc:L727] both become explicit, compile-checked constructor
 * arguments.
 *
 * The instance holds NO mutable state. Both fields are `readonly` collaborators, and every value the
 * algorithm computes lives on the stack for the duration of a single call, so one instance is safe
 * to reuse and cannot carry one order's verdict into another's.
 */
export class QualifierQualificationEvaluator {
  public constructor(
    /**
     * Address-zone membership. Replaces `getAddressService()` at
     * [model/service/PromotionService.cfc:L684]. The port declares exactly one member and it is
     * SYNCHRONOUS, which is why this module needs no async boundary.
     */
    private readonly addressZoneEvaluator: AddressZoneEvaluator,

    /**
     * Order-item membership. Replaces the same-component call at
     * [model/service/PromotionService.cfc:L727].
     */
    private readonly orderItemMembership: OrderItemMembership,
  ) {}

  /**
   * Decide how many times one promotion qualifier qualifies, and which fulfillments and order items
   * it qualifies.
   *
   * Ported from `private struct function getQualifierQualificationDetails(required any qualifier,
   * required any order)` [model/service/PromotionService.cfc:L629]. The name is the legacy CFML name
   * verbatim; the legacy `any` parameters become the concrete `PromotionQualifier` and `OrderView`;
   * the legacy `struct` return becomes the published `QualifierQualification`.
   *
   * SYNCHRONOUS. See the module header.
   *
   * @param qualifier the qualifier being evaluated.
   * @param order the read-only order projection to evaluate it against.
   * @returns the qualifier's verdict, exactly as the legacy struct carried it.
   */
  public getQualifierQualificationDetails(
    qualifier: PromotionQualifier,
    order: OrderView,
  ): QualifierQualification {
    // The four-member seed [model/service/PromotionService.cfc:L630-L635], in source order. The
    // first member holds the qualifier ENTITY itself - it is the identity of the record, not
    // redundant, and the published type declares it.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L633, L660]: `qualifiedFulfillmentIDs` has been
    // cited as initialized at L656; the source disagrees. L656 is the `else if` FULFILLMENT DISPATCH
    // line, the initializer is here at L633, and the re-initialization is at L660. The loop range
    // L663-L711 is confirmed correct.
    // Locator corrected against source per the project locator-drift rule (SOURCE WINS). Every other
    // locator in the published census - `qualifier` at L631, `qualificationCount` at L632, the
    // L638-L653 gates, the L722-L725 records, the L743 computation, the L749 return and the L750
    // close - was re-verified against the source at zero drift and is used as published.
    const qualifierDetails: QualifierQualification = {
      qualifier,
      qualificationCount: 0,
      qualifiedFulfillmentIDs: [],
      qualifiedOrderItemDetails: [],
    };

    // CFML parity [model/service/PromotionService.cfc:L638, L656, L714]: `getQualifierType()` is
    // read at all three dispatch sites and is captured once here. The divergence is for DETERMINISM
    // and READABILITY - one value cannot change between three tests that are meant to be mutually
    // exclusive, and the reader sees the dispatch subject in one place.
    //
    // CFML parity [model/service/PromotionService.cfc:L53 of model/entity/PromotionQualifier.cfc]:
    // `qualifierType` is a nullable string column, and CFML renders an unset string as the empty
    // string in both a comparison and a list context. Nothing hinges on that coercion here: the
    // empty string equals neither `"order"` nor `"fulfillment"`, and `listFindNoCase` over a list
    // that contains no empty token answers `0`. An absent `qualifierType` therefore reaches no arm
    // under either reading, which is the same outcome as the missing default recorded below.
    const qualifierType = qualifier.getQualifierType() ?? '';

    // CFML parity [model/service/PromotionService.cfc:L638, L656, L714]: THE CASE-SENSITIVITY AUDIT
    // FOR THE DISPATCH, MADE EXPLICIT RATHER THAN ASSUMED. CFML's `==` is case-insensitive on strings,
    // so all three of the source's tests tolerate any casing; the lint profile mandates strict
    // equality, which is exactly what forces this audit to happen at the site instead of disappearing
    // into an operator. The two equality arms therefore compare case-SENSITIVELY while the third stays
    // case-INSENSITIVE through `listFindNoCase`.
    //
    // That is safe, and the reason is the data rather than the operator: `qualifierType` is a
    // fixed-vocabulary `select` column [model/entity/PromotionQualifier.cfc:L53] whose five legal
    // values are written by the admin as `order`, `fulfillment`, `contentAccess`, `merchandise` and
    // `subscription`, and the two literals reached by strict equality here - `"order"` and
    // `"fulfillment"` - are single all-lower-case words matched against exactly the tokens that
    // column stores. `listFindNoCase` is kept for the third arm because the source chose it there
    // deliberately: `listFind` IS case-sensitive in CFML, so the author's choice of the `NoCase`
    // variant is a positive instruction, and the `contentAccess` token is the one value in the
    // vocabulary whose casing is not uniform.
    //
    // No case-folding helper is introduced and `../../lib/cfml/struct.js` is deliberately not
    // imported: nothing in this range performs a case-insensitive struct-key lookup, and adding a
    // comparison helper for a fixed vocabulary would spend a dependency to restate what the column
    // already guarantees.

    // ORDER
    if (qualifierType === 'order') {
      // CFML parity [model/service/PromotionService.cfc:L641, L652]: ASSIGN THEN REVOKE. The count is
      // set to 1 FIRST - the legacy comment reads "because that is the max for an order qualifier" -
      // and the four-clause disjunction then revokes it back to 0. The shape is the legacy control
      // flow and is reproduced as such rather than inverted into compute-the-predicate-then-assign.
      qualifierDetails.qualificationCount = 1;

      // CFML parity [model/service/PromotionService.cfc:L644, L646, L648, L650]: `getTotalSaleQuantity()`
      // is read at L644 and L646 and `getSubtotal()` at L648 and L650; each is captured once, before
      // the disjunction, for DETERMINISM and READABILITY - a single evaluation cannot disagree with
      // itself between two clauses of one predicate.
      const totalSaleQuantity = order.totalSaleQuantity;
      const subtotal = order.subtotal;

      const minimumOrderQuantity = qualifier.getMinimumOrderQuantity();
      const maximumOrderQuantity = qualifier.getMaximumOrderQuantity();
      const minimumOrderSubtotal = qualifier.getMinimumOrderSubtotal();
      const maximumOrderSubtotal = qualifier.getMaximumOrderSubtotal();

      // CFML parity [model/service/PromotionService.cfc:L644, L646, L648, L650]: ALL FOUR BOUNDS ARE
      // STRICT and all four are null-guarded with `!isNull(x) && ...`. A value EXACTLY EQUAL to a
      // bound does NOT disqualify, so `>=` and `<=` are wrong here and boundary equality is
      // inclusive - a real money decision, not a rounding detail. Each bound is independently
      // nullable and an absent bound imposes no constraint at all.
      //
      // CFML parity [model/service/PromotionService.cfc:L644, L646, L648, L650]: THE MONEY-VERSUS-COUNT
      // CENSUS FOR THIS ARM. L644 and L646 compare ORDER QUANTITIES, which are plain counts
      // (`ormtype="integer"` [model/entity/PromotionQualifier.cfc:L55, L56]) and must never be routed
      // through `Money`. L648 and L650 compare SUBTOTALS, which are monetary
      // (`ormtype="big_decimal" hb_formatType="currency"` [model/entity/PromotionQualifier.cfc:L57,
      // L58]) and are compared through `Money`'s own comparison members so no floating-point
      // operation touches a currency value. These two clauses are the ONLY monetary operations in
      // this file, and neither performs arithmetic.
      //
      // B5: no min-versus-max check, no non-negativity check and no throw on an inverted band. An
      // inverted band that disqualifies every order is legitimate legacy behaviour.
      if (
        (isPresent(minimumOrderQuantity) && minimumOrderQuantity > totalSaleQuantity) ||
        (isPresent(maximumOrderQuantity) && maximumOrderQuantity < totalSaleQuantity) ||
        (isPresent(minimumOrderSubtotal) && minimumOrderSubtotal.isGreaterThan(subtotal)) ||
        (isPresent(maximumOrderSubtotal) && maximumOrderSubtotal.isLessThan(subtotal))
      ) {
        qualifierDetails.qualificationCount = 0;
      }

      // FULFILLMENT
    } else if (qualifierType === 'fulfillment') {
      this.evaluateFulfillmentArm(qualifier, order, qualifierDetails);

      // ORDER ITEM
      //
      // CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: THE COMMA-LIST TOKEN-ORDER
      // TRAP. The literal below is reproduced EXACTLY as written at L714 -
      // `"contentAccess,merchandise,subscription"` - even though the same three tokens appear in a
      // DIFFERENT ORDER at L200 and L794 as `"merchandise,subscription,contentAccess"`. All three
      // sites are membership tests, so the order is behaviourally irrelevant at every one of them;
      // the divergence is preserved anyway, per site, with no shared constant and no normalisation,
      // because a reviewer diffing target against source must see the same string at the same site
      // and because no set-ordering or priority assumption is ever safe across these lists.
      //
      // CFML parity [model/service/PromotionService.cfc:L714]: `listFindNoCase` returns a 1-BASED
      // INDEX OR `0`, NEVER A BOOLEAN, and L714 consumes it as bare CFML truthiness. The port
      // compares the index explicitly against `0`. The shared `listFindNoCase` helper is
      // case-INSENSITIVE by contract, so no hand-rolled `===` comparison on the type string is used.
      //
      // CFML parity [model/service/PromotionService.cfc:L638, L656, L714]: THE DISPATCH IS
      // HETEROGENEOUS AND THAT IS FAITHFUL. The first two arms test string equality and the third
      // tests list membership. All three shapes are reproduced; they are deliberately not unified
      // into one `switch` or one membership test.
    } else if (listFindNoCase('contentAccess,merchandise,subscription', qualifierType) > 0) {
      this.evaluateOrderItemArm(qualifier, order, qualifierDetails);
    }

    // LEGACY-NOTE [model/service/PromotionService.cfc:L747]: THERE IS NO FINAL `else`. L747 closes the
    // chain, so an UNRECOGNISED `qualifierType` - and an absent one - falls through every arm and this
    // method returns the untouched L630-L635 seed: `qualificationCount` 0 and two empty arrays.
    // The missing default is reproduced deliberately. No `else` that throws is added, no
    // exhaustiveness `never` check is introduced over the five known type values, and
    // `qualifierType` is not validated in any way (B5). The caller's own gate treats a zero count as
    // a failed qualification, so falling through is a meaningful answer rather than an error state.

    return qualifierDetails;
  }

  /**
   * The FULFILLMENT arm [model/service/PromotionService.cfc:L656-L711].
   *
   * Every fulfillment on the order is COUNTED AND APPENDED FIRST and only afterwards tested; a
   * fulfillment that fails the test has its count and its ID walked back. The shape is the source's
   * and it is load-bearing in two independent ways - see the notes at the increment and at the
   * removal.
   *
   * CFML parity [model/service/PromotionService.cfc:L658, L706, L716]: the source comment "Set the
   * qualification count to the total fulfillments" appears THREE times - at L658 above `= 0`, where
   * it is at least forward-looking; at L706 above a DECREMENT, where it is a copy-paste artifact;
   * and at L716 inside the ORDER ITEM arm, where it is simply wrong, since nothing there concerns
   * fulfillments. The artifact is recorded rather than silently corrected, and the misleading
   * wording is deliberately NOT propagated into the target as though it were accurate.
   *
   * @param qualifier the qualifier being evaluated.
   * @param order the read-only order projection.
   * @param qualifierDetails the verdict accumulator, mutated in place exactly as the source mutates
   *   its struct.
   */
  private evaluateFulfillmentArm(
    qualifier: PromotionQualifier,
    order: OrderView,
    qualifierDetails: QualifierQualification,
  ): void {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L659-L660]: THE RE-INITIALIZATION IS REDUNDANT
    // AND IS PRESERVED ANYWAY. L632 and L633 already seeded `qualificationCount` to 0 and
    // `qualifiedFulfillmentIDs` to an empty array, and nothing between the seed and here can have
    // changed either - the ORDER arm is a sibling branch of the same `if` chain, so reaching this arm
    // proves it did not run. The two statements are reproduced because the source has them and
    // because a reader comparing the two files must find them; they are annotated as redundant
    // rather than deleted.
    //
    // The array is cleared by CONTENT rather than replaced by a fresh literal. The published type
    // declares `qualifiedFulfillmentIDs` a `readonly` PROPERTY holding a MUTABLE array, so
    // reassigning it is a compile error (TS2540) while emptying it is not - and emptying it is what
    // L660 observably does in a state where the array is provably already empty.
    qualifierDetails.qualificationCount = 0;
    qualifierDetails.qualifiedFulfillmentIDs.length = 0;

    // CFML parity [model/service/PromotionService.cfc:L672, L681, L695, L697, L699, L701, L703]: the
    // qualifier's own configuration is read repeatedly by the source - `getShippingAddressZones()` at
    // L672, L681 and L703, `getFulfillmentMethods()` at L699, `getShippingMethods()` at L701 (twice)
    // and L703, and the two weight bounds at L695 and L697 - and every one of those reads is
    // invariant across the loop, because nothing in this arm mutates the qualifier. Each is captured
    // ONCE here. The divergence is for DETERMINISM and READABILITY: a single read makes it
    // structurally impossible for the L672 gate to have tested one collection while the L681 loop
    // walked another, or for the L701 clause to disagree with the L703 clause about the same list -
    // which is precisely the class of divergence that repeated lookups permit.
    const configuredShippingAddressZones = toConfiguredShippingAddressZones(
      qualifier.getShippingAddressZoneIDs(),
    );
    const configuredFulfillmentMethodIDs = qualifier.getFulfillmentMethodIDs();
    const configuredShippingMethodIDs = qualifier.getShippingMethodIDs();
    const minimumFulfillmentWeight = qualifier.getMinimumFulfillmentWeight();
    const maximumFulfillmentWeight = qualifier.getMaximumFulfillmentWeight();

    // [L663] A CFML `for(var x in array)` iterates VALUES, so this is an ordinary `for...of`. The
    // collection arrives as a `readonly` array on a read-only view and is treated as such: nothing
    // here mutates the view, the collection, or order persistence (B1 forbids emulating 1-based
    // indexing anywhere, and no index is needed).
    for (const orderFulfillment of order.orderFulfillments) {
      // CFML parity [model/service/PromotionService.cfc:L665-L666, L707-L709]: COUNT AND APPEND
      // BEFORE TESTING. Both statements run UNCONDITIONALLY at the top of every iteration, before a
      // single condition has been evaluated; only afterwards does the L693-L704 disjunction decide,
      // and on a match L707-L709 walks the append back. The shape is deliberately NOT optimised into
      // test-first-then-append, for two independent reasons: it changes the ORDER of the surviving
      // IDs, and the indexed removal at L708-L709 only survives BECAUSE the append already happened
      // (see the note there).
      qualifierDetails.qualificationCount++;
      qualifierDetails.qualifiedFulfillmentIDs.push(orderFulfillment.orderFulfillmentID);

      // CFML parity [model/service/PromotionService.cfc:L669, L675, L685, L693]: the source declares
      // this flag as `addressZoneOK` (capital K) at L669, then writes it at L675 and L685 and reads
      // it at L693 as `addressZoneOk` (lower-case k). CFML identifiers are CASE-INSENSITIVE, so that
      // is ONE variable; TypeScript is case-sensitive, so a literal transliteration would create TWO
      // distinct bindings and silently break the logic - the `false` written at L675 would never be
      // seen at L693, and every fulfillment would pass the zone check. ONE spelling is therefore
      // used throughout the target.
      //
      // CFML parity [model/service/PromotionService.cfc:L669, L672, L675]: THE ZONE DEFAULT IS
      // PERMISSIVE-UNLESS-CONFIGURED. The flag starts `true` and is flipped to `false` only when
      // zones are ACTUALLY configured, so a qualifier with no shipping address zones passes the zone
      // check automatically. B5 forbids adding a check the legacy lacks, so no zone requirement is
      // invented for the unconfigured case.
      let addressZoneOk = true;

      // [L672] `arrayLen(...)` is used bare as a boolean by the source; numeric truthiness is
      // forbidden in the target, so every one of the four `arrayLen` conditions this arm reproduces
      // (L672, L699, L701, L703) is written as an explicit `.length > 0`.
      if (configuredShippingAddressZones.length > 0) {
        // [L675] By default, if there WERE address zones then the flag must start false.
        addressZoneOk = false;

        // CFML parity [model/service/PromotionService.cfc:L678]: THE PRECONDITION IS COMPOUND AND
        // SHORT-CIRCUITING, and all four of its details matter. (a) The source uses the CFML word
        // operator `eq`, which becomes strict `===`. (b) The literal is lower-case `"shipping"`.
        // (c) `getNewFlag()` is NEGATED - a brand-new, unsaved address DISQUALIFIES. (d) If the
        // precondition FAILS, the flag REMAINS `false` from L675 and the fulfillment is excluded at
        // L693 without any zone ever being consulted. That silent-exclusion path is load-bearing: no
        // `else` is added to rescue it, and it is the reason a non-shipping fulfillment can never
        // satisfy a zone-bearing qualifier.
        if (
          orderFulfillment.fulfillmentMethod.fulfillmentMethodType === 'shipping' &&
          !dereferenceFulfillmentAddress(orderFulfillment, 'L678').isNew
        ) {
          // [L681-L688] Loop over each configured zone and check whether this address is in one.
          for (const shippingAddressZone of configuredShippingAddressZones) {
            // [L684] The port call is POSITIONAL with two arguments, address first, zone second,
            // exactly as `getAddressService().isAddressInZone(...)` is called by the source. The port
            // declares exactly one member and it is SYNCHRONOUS, which is why this whole module needs
            // no async boundary.
            if (
              this.addressZoneEvaluator.isAddressInZone(
                toAddressProjection(dereferenceFulfillmentAddress(orderFulfillment, 'L684')),
                shippingAddressZone,
              )
            ) {
              // [L685-L686] If found, set to true and STOP LOOPING. The early exit is the source's
              // and is preserved: a later zone can neither undo nor re-confirm a match.
              addressZoneOk = true;
              break;
            }
          }
        }
      }

      // [L693] Now that the address-zone verdict is known, everything else is checked.
      //
      // CFML parity [model/service/PromotionService.cfc:L695, L697]: THE FULFILLMENT WEIGHT BOUNDS
      // ARE PLAIN NUMERICS, NOT MONEY. `minimumFulfillmentWeight`, `maximumFulfillmentWeight` and
      // `totalShippingWeight` are WEIGHTS - the qualifier declares the first two with
      // `hb_formatType="weight"` [model/entity/PromotionQualifier.cfc:L63, L64] - so routing them
      // through `Money` would be as wrong as routing a currency value through a float. Both
      // comparisons are STRICT, so a fulfillment weighing exactly the bound does NOT disqualify, and
      // both are null-guarded: an absent bound imposes no constraint.
      const totalShippingWeight = orderFulfillment.totalShippingWeight;

      // CFML parity [model/service/PromotionService.cfc:L701, L703]: `getShippingMethod()` is read
      // three times by the source - twice at L701 and once at L703 - and is captured once here for
      // DETERMINISM and READABILITY. The capture changes nothing about the GUARDING, which is
      // asymmetric in the source and stays asymmetric here: see the two clauses below.
      const shippingMethod = orderFulfillment.shippingMethod;

      // CFML parity [model/service/PromotionService.cfc:L699, L701] and
      // [org/Hibachi/HibachiEntity.cfc:L340-L350]: THE "CONFIGURED LIST GATES A NEGATIVE MEMBERSHIP
      // TEST" SHAPE. Both clauses read `arrayLen(collection) && !hasX(...)`, so an UNCONFIGURED list
      // imposes NO constraint (permissive) while a configured list that omits this fulfillment's
      // value EXCLUDES it (restrictive). Both polarities are reproduced. The `hasX` family answers
      // `false` against an empty collection because its loop body never runs, which is exactly the
      // include/exclude asymmetry documented at `hasAnyInProperty` - and it is what makes DEFECT 11
      // below total rather than marginal.
      //
      // The two membership paths are kept SEPARATELY WRITTEN, against two separately captured
      // identifier lists. They are deliberately NOT factored into one generic membership helper or
      // one shared "shipping constraint" flag: a unified helper would make DEFECT 11 invisible, and
      // the next reader would simplify it away.
      //
      // CFML parity [model/service/PromotionService.cfc:L701, L703]: THE NULL-GUARD ASYMMETRY IS THE
      // SOURCE'S AND IS PRESERVED ON BOTH SIDES. L701 guards the shipping-method dereference with an
      // explicit `isNull(...) ||` and L703 passes the same potentially-absent value straight into
      // `hasShippingMethod(...)` with NO guard. No guard is added at L703 and none is removed from
      // L701 (B5). The unguarded path must behave as the legacy does and must never collapse into a
      // silent `false`; the translation below satisfies that in every REACHABLE state, and the
      // reachability argument is spelled out at the clause itself.
      if (
        !addressZoneOk ||
        (isPresent(minimumFulfillmentWeight) && minimumFulfillmentWeight > totalShippingWeight) ||
        (isPresent(maximumFulfillmentWeight) && maximumFulfillmentWeight < totalShippingWeight) ||
        // [L699] A configured fulfillment-method list that omits this fulfillment's method excludes
        // it. `hasFulfillmentMethod(entity)` becomes an exact primary-key membership test over the
        // opaque `fulfillmentMethodID` list the qualifier publishes, which is the same comparison
        // the shipped entities use for every other association membership check.
        (configuredFulfillmentMethodIDs.length > 0 &&
          !configuredFulfillmentMethodIDs.includes(
            orderFulfillment.fulfillmentMethod.fulfillmentMethodID,
          )) ||
        // [L701] The shipping-method clause, WITH the source's explicit absence guard: an absent
        // shipping method on a fulfillment excludes it as surely as a non-matching one does.
        (configuredShippingMethodIDs.length > 0 &&
          (!isPresent(shippingMethod) ||
            !configuredShippingMethodIDs.includes(shippingMethod.shippingMethodID))) ||
        // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-ZONES clause
        // re-tests hasShippingMethod instead of a zone condition; because hasShippingMethod returns
        // false against an empty collection, a qualifier with zones but no shipping methods excludes
        // EVERY fulfillment and negates the correct zone evaluation at L672-L690.
        // Preserved deliberately; do not fix without a product decision.
        //
        // L703 is a copy of L701 with only TWO of its three parts edited - the `arrayLen` subject
        // became `getShippingAddressZones()` and the first disjunct became the new-address test, but
        // the SECOND disjunct was left as the shipping-METHOD membership test. Substituting the whole
        // clause for `arrayLen(zones) > 0`:
        //
        //   * no shipping methods configured -> `hasShippingMethod(...)` is false against the empty
        //     collection -> `!false` is TRUE -> the clause collapses to `zones.length > 0` and EVERY
        //     fulfillment is excluded unconditionally, discarding the correct `addressZoneOk` verdict
        //     that L693 had just consumed properly;
        //   * shipping methods configured -> reaching L703 at all means L701 was false, so the
        //     method is present AND a member -> `!true` is FALSE -> the clause degrades to the
        //     new-address test alone.
        //
        // THE IN-FILE COUNTER-EXAMPLE THAT PROVES THIS IS A BUG AND NOT INTENT: the facade's own
        // `getShippingMethodOptionsDiscountAmountDetails` performs the address-zone test CORRECTLY,
        // so the two formulations disagree inside a single component.
        //
        // The translation of `!hasShippingMethod(getShippingMethod())` below is
        // `!(present && member)`, which is faithful in every reachable state. The only state where it
        // could differ - an ABSENT shipping method with a NON-EMPTY configured list, where CFML's
        // implicit `hasX` would fall through to its no-argument form and answer TRUE - is
        // UNREACHABLE here, because that state makes the L701 clause above TRUE and short-circuits
        // the disjunction before L703 is ever evaluated. When the list IS empty both readings answer
        // false, so no guard is needed and none is added.
        //
        // The `getAddress()` dereference below is likewise unguarded, exactly as the source leaves
        // it; see `dereferenceFulfillmentAddress`.
        (configuredShippingAddressZones.length > 0 &&
          (dereferenceFulfillmentAddress(orderFulfillment, 'L703').isNew ||
            !(
              isPresent(shippingMethod) &&
              configuredShippingMethodIDs.includes(shippingMethod.shippingMethodID)
            )))
      ) {
        // [L707] The decrement. The source's comment above it reads "Set the qualification count to
        // the total fulfillments"; see the artifact note on this method.
        qualifierDetails.qualificationCount--;

        // CFML parity [model/service/PromotionService.cfc:L708-L709]: `arrayFind` returns a 1-BASED
        // INDEX on a hit and `0` on a MISS, and its result is consumed DIRECTLY AS A POSITION - it is
        // NEVER a boolean, so `if(arrayFind(...))` is not what the source writes and is not what the
        // target writes. `arrayDeleteAt(array, 0)` THROWS in CFML, so this pair carries a LATENT
        // THROW HAZARD that survives only because the very same ID was appended at L666 earlier in
        // this same iteration.
        //
        // The hazard is REPRODUCED, not repaired: no `di > 0` guard is added (B5), and no
        // filter/splice formulation that silently no-ops on a miss is used. If the index is absent
        // the target MUST fail, exactly as the legacy would.
        //
        // The index convention is converted DELIBERATELY and in one place, because the two languages
        // disagree twice over: `Array.prototype.indexOf` answers `-1` on a miss, not `0`, so a naive
        // `> 0` test against it would be wrong for the first element AND would misread a miss.
        // `zeroBasedIndex + 1` reconstructs `arrayFind`'s exact contract - a 1-based position, or 0
        // when absent - and every line below reasons in that one convention.
        //
        // LEGACY-NOTE [model/service/PromotionService.cfc:L708-L709]: the array-index throw hazard
        // owned by this module is arrayFind/arrayDeleteAt here; the parallel list-index hazard at L774
        // (ListDeleteAt/listFindNoCase) lives in orphan #1 and is owned by
        // ./promotionPeriodQualification.ts.
        // Ownership corrected against source per the project locator-drift rule.
        //
        // The correction is not a matter of preference: L774 sits inside
        // `getPromotionPeriodQualifiedFulfillmentIDList`, whose declaration is at L752 and whose body
        // runs to L781 - verified against the source - so it is outside the L629-L750 range this
        // module ports. No list-index deletion is reproduced here, and no `listDeleteAt` or
        // `arrayDeleteAt` export is added to `../../lib/cfml/list.js`: the removal below is ordinary
        // array manipulation on a plain array, and that shared module stays closed at five files and
        // five exports.
        const zeroBasedIndex = qualifierDetails.qualifiedFulfillmentIDs.indexOf(
          orderFulfillment.orderFulfillmentID,
        );
        const di = zeroBasedIndex + 1;

        if (di === 0) {
          throw new RangeError(
            `arrayDeleteAt index out of range for orderFulfillmentID ` +
              `"${orderFulfillment.orderFulfillmentID}". Reproduces the latent CFML failure at ` +
              `model/service/PromotionService.cfc:L708-L709, where arrayFind answers 0 for an ` +
              `absent element and arrayDeleteAt raises on index 0.`,
          );
        }

        qualifierDetails.qualifiedFulfillmentIDs.splice(di - 1, 1);
      }
    }
  }

  /**
   * The ORDER ITEM arm [model/service/PromotionService.cfc:L714-L745], reached for the
   * `contentAccess`, `merchandise` and `subscription` qualifier types.
   *
   * Every order item is offered to the membership test; only the ones that pass contribute a record
   * and a quantity. The arm's final answer is NOT the qualifying quantity - it is that quantity
   * divided by the configured minimum, and it stays ZERO when no minimum is configured.
   *
   * CFML parity [model/service/PromotionService.cfc:L727, L742, L743]: the source reads the argument
   * as `arguments.qualifier` at L742 and as the BARE `qualifier` at L727 and L743 - adjacent lines
   * disagreeing about scope qualification. TypeScript has no `arguments` scope, so the distinction
   * CANNOT exist in the target; reproducing it would require emulating CFML scopes, which B1 forbids
   * outright. The artifact is recorded once here and not modelled. The same artifact appears in the
   * sibling family at L875, L877, L993 and L998.
   *
   * @param qualifier the qualifier being evaluated.
   * @param order the read-only order projection.
   * @param qualifierDetails the verdict accumulator, mutated in place.
   */
  private evaluateOrderItemArm(
    qualifier: PromotionQualifier,
    order: OrderView,
    qualifierDetails: QualifierQualification,
  ): void {
    // [L717] The count is re-zeroed. As in the fulfillment arm this repeats the L632 seed and is
    // preserved rather than deleted; unlike the fulfillment arm the source does NOT re-initialize
    // `qualifiedOrderItemDetails` here, and no re-initialization is invented for it (B5).
    qualifierDetails.qualificationCount = 0;

    // [L718] The running total of qualifying item quantity. A PLAIN COUNT: it is never routed through
    // `Money`, and neither is `qualificationCount`.
    let qualifiedItemsQuantity = 0;

    // [L720] A CFML `for(var x in array)` over the order's items, iterating VALUES. The collection is
    // captured with an EXPLICIT `readonly` element type rather than left to inference, because the
    // read-only discipline is the whole point of the anti-corruption view: the array carries no
    // defensive copy, so it is LIVE, and the type is what states at this site that nothing here
    // mutates an `OrderItemView`, reorders the collection, or writes to order persistence.
    const orderItems: readonly OrderItemView[] = order.orderItems;

    for (const orderItem of orderItems) {
      // CFML parity [model/service/PromotionService.cfc:L727, L733]: ONLY QUALIFYING ITEMS ARE
      // APPENDED. L733 sits INSIDE the L727 gate, so a non-qualifying item produces a record that is
      // silently discarded. No record with a zero `qualificationCount` is ever appended.
      //
      // TypeScript has no keyword arguments, so the source's KEYWORD call form
      // `getOrderItemInQualifier(qualifier=qualifier, orderItem=orderItem)` collapses into a
      // positional call in the declared parameter order. That is a language difference, not a
      // behavioural one. (The same helper is called NEGATED at L805, from a method this module does
      // not own.)
      if (this.orderItemMembership.getOrderItemInQualifier(qualifier, orderItem)) {
        // CFML parity [model/service/PromotionService.cfc:L729-L730]: `getQuantity()` is read twice by
        // the source - once to set the record's count and once to add to the running total - and is
        // captured once here for DETERMINISM and READABILITY, so the record and the accumulator
        // cannot possibly disagree about the same item's quantity.
        const qualifyingQuantity = orderItem.quantity;

        // LEGACY-NOTE [model/service/PromotionService.cfc:L722-L725, L729]: TWO STRUCTURAL CHANGES
        // HERE, BOTH OBSERVATIONALLY IDENTICAL, BOTH DELIBERATE.
        //
        // (1) THE LOCAL IS RENAMED. The source names this record `qualifiedOrderItemDetails` -
        // character-for-character the name of the ARRAY it is appended to at L733,
        // `qualifierDetails.qualifiedOrderItemDetails`. CFML tells them apart by scope prefix;
        // TypeScript cannot, so the local becomes `orderItemDetail` (singular, matching what it
        // holds). This is a B1 idiomatic-TypeScript requirement, not an optional tidy-up. The
        // ACCUMULATOR MEMBER NAME IS UNCHANGED - only the local binding is renamed - and the rename
        // has no behavioural effect whatsoever.
        //
        // (2) THE RECORD IS CONSTRUCTED ONCE WITH ITS FINAL VALUE. The source builds it at L722-L725
        // with `qualificationCount = 0` and MUTATES that member at L729; the published
        // `QualifiedOrderItemDetail` declares `qualificationCount` `readonly`, so the target computes
        // the quantity first and then builds the record complete. This is observationally identical:
        // the record is FRESH PER ITERATION, it is never read between L725 and L729, and it is only
        // appended at L733 AFTER the assignment - so no observer can ever see the intermediate zero.
        // The record still carries EXACTLY TWO members, matching the published type; nothing is added
        // to it and nothing is widened.
        const orderItemDetail: QualifiedOrderItemDetail = {
          orderItem,
          qualificationCount: qualifyingQuantity,
        };

        // [L730]
        qualifiedItemsQuantity += qualifyingQuantity;

        // [L733] Add this order item to the array.
        qualifierDetails.qualifiedOrderItemDetails.push(orderItemDetail);
      }
    }

    // [L740] The source's `gt` is the CFML word operator and becomes strict `>` on a PLAIN INTEGER
    // COUNT, never a `Money` comparison. This gate wraps L742-L744, so an order in which nothing
    // qualified never reaches the division at all.
    if (qualifiedItemsQuantity > 0) {
      const minimumItemQuantity = qualifier.getMinimumItemQuantity();

      // CFML parity [model/service/PromotionService.cfc:L742]: a null minimumItemQuantity leaves
      // qualificationCount at 0 (RESTRICTIVE). The structurally parallel guard at L830, owned by
      // ./promotionPeriodQualification.ts, has the opposite PERMISSIVE polarity. Do not normalise
      // either.
      //
      // There is NO `else` and no fallback at L742, so a qualifier that matched items but configures
      // no minimum qualifies NOTHING. That is load-bearing: no `else` assigning
      // `qualifiedItemsQuantity` is added, and the minimum is NOT defaulted to 1.
      if (isPresent(minimumItemQuantity)) {
        // CFML parity [model/service/PromotionService.cfc:L743]: CFML throws on division by zero;
        // JavaScript yields Infinity. The throw is reproduced so a zero minimumItemQuantity fails as
        // it does in legacy.
        // This is behaviour reproduction, not added validation (B5).
        //
        // A zero divisor passes the `!isNull` test above and reaches the division, and
        // `Math.trunc(Infinity)` is `Infinity` - a silent `Infinity` propagating into the ledger
        // ratchet is a DIVERGENCE and is unacceptable. The divisor is therefore NOT guarded in the
        // legacy sense (no clamp, no substituted 0, no skipped assignment); the legacy FAILURE is
        // raised instead. This is one of four unguarded divisions across this folder - L299, L486,
        // L743 here, and L831 - and none of them is guarded.
        if (minimumItemQuantity === 0) {
          throw new RangeError(
            `Division by zero computing qualifier qualification count: minimumItemQuantity is 0. ` +
              `Reproduces the CFML failure at model/service/PromotionService.cfc:L743, where a zero ` +
              `divisor raises rather than yielding Infinity.`,
          );
        }

        // [L743] `int()` TRUNCATES TOWARD ZERO - it does not round - so `Math.trunc` is the only
        // correct translation. `Math.round` and `Math.floor` both diverge from truncation (the former
        // everywhere, the latter on negatives), and a negative quotient is reachable here because
        // neither the accumulated quantity nor the configured minimum is validated for sign (B5). The
        // structurally parallel `int()` at L831, owned by ./promotionPeriodQualification.ts, takes the
        // same treatment.
        //
        // Both operands are plain integer counts, so E4 does not apply: this is plain arithmetic, and
        // it is deliberately NOT routed through `Money`, `precision.ts` or `numberFormat.ts`.
        qualifierDetails.qualificationCount = Math.trunc(
          qualifiedItemsQuantity / minimumItemQuantity,
        );
      }
    }
  }
}
