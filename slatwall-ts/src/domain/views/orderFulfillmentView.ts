// ---------------------------------------------------------------------------
// slatwall-ts - OrderFulfillmentView: the read-only anti-corruption input
//                shape for an order fulfillment
//
// PURPOSE
//   A read-only projection of [model/entity/OrderFulfillment.cfc], carrying
//   exactly the state the in-scope promotion engine reads off a fulfillment
//   and nothing else. It is consumed by two legacy regions:
//
//     * the fulfillment-reward branch of
//       `updateOrderAmountsWithPromotions`, [model/service/PromotionService.cfc:L344-L410]
//     * the fulfillment qualifier gates of
//       `getQualifierQualificationDetails`, [model/service/PromotionService.cfc:L655-L710]
//
//   plus two smaller readers that consume only the identifier and the weight:
//   `getPromotionPeriodQualificationDetails` [PromotionService.cfc:L559-L561]
//   and `getPromotionPeriodQualifiedFulfillmentIDList` [PromotionService.cfc:L752-L781].
//
// WHY THIS FILE EXISTS - THE MOST IMPORTANT SCOPE SEAM IN THE MIGRATION
//   `updateOrderAmountsWithPromotions(required any order)`
//   [model/service/PromotionService.cfc:L58] operates on an ORDER, yet
//   `model/service/OrderService.cfc` and every order / cart / checkout /
//   fulfillment entity are explicitly OUT OF SCOPE. `OrderFulfillment.cfc`
//   says so itself: its component declaration at
//   [model/entity/OrderFulfillment.cfc:L49] carries
//   `hb_serviceName="orderService"`, so the entity is served by the very
//   service the port does not convert.
//
//   This shape - together with `orderItemView.ts` and `orderView.ts` - is the
//   mechanism by which that out-of-scope aggregate becomes an INPUT to an
//   in-scope engine rather than a DEPENDENCY of it. The engine reads these
//   views and emits applied-promotion intents keyed by the opaque
//   `orderFulfillmentID`; it never loads, mutates or persists an order. That
//   inversion is what makes the slice independently deployable.
//
//   Consequently this file is NOT, and must never become, an
//   `OrderFulfillment` entity, a mutable aggregate, a persistence surface, or
//   a port of `model/entity/OrderFulfillment.cfc` / `model/entity/Address.cfc`.
//   Those components, and `model/service/AddressService.cfc`, were read as
//   REFERENCE ONLY - for their ORM type declarations and their branch logic.
//   Reading a file never converts it into a write target.
//
// THE FIVE INVARIANTS THAT DEFINE A VIEW
//   1. READ-ONLY, ABSOLUTELY. Every member is `readonly`, every array is a
//      `readonly T[]`, and every nested structure is readonly throughout.
//      There is no setter, no mutator, no `add*` / `remove*`, no persistence
//      method, no ORM handle, no `save`, no `delete` - and in fact no method
//      of any kind anywhere in this module.
//   2. NO MUTATION OF ORDER STATE, EVER. See the `appliedPromotions` note
//      below; that member is where this invariant does its hardest work.
//   3. OPAQUE IDENTIFIERS. `orderFulfillmentID` is an opaque `string` - the
//      key the engines emit intents against, never dereferenced back into an
//      out-of-scope entity.
//   4. MONEY IS `Money`, never `number`. The one genuine exception is
//      `totalShippingWeight`, which is a WEIGHT and not an amount.
//   5. NO ORM, NO LAZINESS. Collections and associations arrive ALREADY
//      POPULATED. A view never simulates lazy loading and never reaches a
//      port; the fetch shape is decided at the repository boundary that
//      produced it.
//
// TYPES ONLY - THIS MODULE EMITS ZERO RUNTIME JAVASCRIPT
//   There is no class, no function, no `const`, no `enum` and no runtime value
//   of any kind here. The single import is `import type`, so it erases
//   completely. That is deliberate: an input contract should cost nothing at
//   runtime and should be impossible to instantiate incorrectly.
//
// PARAMETERIZED SQL: NOT APPLICABLE TO THIS FILE - STATED, NOT OMITTED
//   The project standard is that every database query uses prepared
//   statements exclusively, preserving the injection-safety guarantee
//   `cfqueryparam` provided in the legacy tree. That obligation is recorded
//   here as EXPLICITLY NOT APPLICABLE rather than silently skipped: this file
//   contains types only and NO query of any kind - no SQL string, no
//   statement, no parameter binding, no connection, no driver import, and no
//   database access whatsoever. The obligation rests wholly with
//   `src/repositories/mysql/**`, which is the only layer permitted to issue a
//   query. Nothing in this module may be read as sanctioning a SQL surface,
//   and none is invented here.
//
// TEST COVERAGE FOR THIS SHAPE IS NET-NEW, NOT PARITY
//   No legacy test touches any order-shaped input. The legacy suite under
//   `meta/tests/` contains exactly three files that reach the in-scope slice -
//   `unit/entity/BrandTest.cfc`, `unit/entity/ProductTest.cfc`, and
//   `functional/admin/entity/ProductTest.cfc`, the last of which is an empty
//   stub - and none of them exercises an order, an order item or a
//   fulfillment. Any suite written against the types in this module is
//   therefore NET-NEW coverage and must be labelled as such; presenting it as
//   traceable parity would misrepresent the legacy baseline. This file states
//   that obligation and discharges nothing else: it authors no test, no
//   fixture and no mock.
//
// JUDGMENT CALL: THE MEMBER COUNT IS SEVEN, NOT FOUR.
//   The published plan (AAP 0.4.1, the row for this path) describes this
//   shape as carrying only "shipping method, address, weight, and an opaque
//   `orderFulfillmentID`" - FOUR members. That understates it. A census of
//   every `orderFulfillment.get*()` call site across
//   `model/service/PromotionService.cfc` returns SEVEN distinct accessors, and
//   the source census is authoritative over the summary:
//
//     1. getOrderFulfillmentID()  L351, L560, L666, L708, L756, L774
//     2. getFulfillmentCharge()   L373
//     3. getFulfillmentMethod()   L353, L678, L699
//     4. getShippingMethod()      L355, L701, L703
//     5. getAppliedPromotions()   L381, L385, L388, L389, L393
//     6. getTotalShippingWeight() L695, L697, L769, L771
//     7. getAddress()             L360, L362, L678, L684, L703
//
//   Dropping any of the three the summary omits - `fulfillmentCharge`,
//   `fulfillmentMethod`, `appliedPromotions` - would make a live gate
//   inexpressible, and `fulfillmentCharge` is the discount base of the entire
//   fulfillment-reward branch. So: exactly seven top-level members. Do not add
//   an eighth, and do not omit one.
//
// JUDGMENT CALL: `ShippingMethodOptionView` IS DELIBERATELY NOT DECLARED HERE.
//   The folder specification for `src/domain/views/` placed
//   `ShippingMethodOptionView` in this file. A first-hand census of
//   `getShippingMethodOptionsDiscountAmountDetails`
//   [model/service/PromotionService.cfc:L1032] shows that is not possible, and
//   the source overrides the specification. That method reads exactly three
//   accessors off its `shippingMethodOption` argument, and the first
//   dereferences UPWARD into the Order:
//
//     shippingMethodOption.getOrderFulfillment()   x4
//       L1040  .getOrder().getPromotionCodeList()
//       L1049  .getOrder() passed WHOLE into
//              getPromotionPeriodQualificationDetails(promotionPeriod=, order=)
//       L1054  .getFulfillmentMethod()
//       L1063  .getAddress()
//     shippingMethodOption.getShippingMethodRate()  L1056 -> .getShippingMethod()
//     shippingMethodOption.getTotalCharge()         L1069
//
//   Because the legacy chain reaches
//   `shippingMethodOption.getOrderFulfillment().getOrder()`, the shape
//   transitively requires `OrderView`. Declaring it here would force this
//   module to import `orderView.ts`, which already imports this module - a
//   CIRCULAR view type. `ShippingMethodOptionView` therefore belongs in
//   `orderView.ts`, which legitimately imports both leaf views. This note
//   exists so a reviewer can see the specification was overridden by source
//   evidence rather than by preference.
//
// NON-CIRCULARITY IS A HARD REQUIREMENT
//   The view graph is a DAG: `{ orderItemView, orderFulfillmentView } ->
//   orderView`. This module imports NEITHER sibling. It must not import
//   `orderView.ts` (see the relocation note above), and it must not import
//   `orderItemView.ts` either - the fulfillment-reward branch at
//   [model/service/PromotionService.cfc:L345-L410] contains ZERO
//   `orderItem.get*()` references, verified by count, so there is nothing for
//   such an import to carry.
//
// EXPLICITLY EXCLUDED: THERE IS NO `currencyCode` MEMBER
//   [model/entity/OrderFulfillment.cfc:L54] does declare
//   `currencyCode ormtype="string" length="3"`, so the column exists. But a
//   case-insensitive search for `currencyCode` across
//   `model/service/PromotionService.cfc` and
//   `model/service/PriceGroupService.cfc` returns ZERO hits in both files. No
//   in-scope call site reads it off a fulfillment; the currency code is
//   carried structurally on `OrderView`. Adding it here would be inventing a
//   member nothing reads.
//
// EMPTY-COLLECTION SEMANTICS: SIX DISTINCT RULES. COLLAPSING ANY IS A MONEY BUG
//   The in-scope slice does NOT have one convention for "what does an empty
//   collection mean". It has six, and two of them are exact opposites. They
//   are recorded together, here, precisely so nobody unifies them.
//
//   RULE 1 - PERMISSIVE, in the reward gate that consumes THIS view.
//     An empty restriction collection on a REWARD means NO RESTRICTION. The
//     three-way fulfillment gate, [model/service/PromotionService.cfc:L351-L355]:
//       arrayFind(...qualifiedFulfillmentIDs, orderFulfillment.getOrderFulfillmentID())
//       && ( !arrayLen(reward.getFulfillmentMethods())
//            || reward.hasFulfillmentMethod(orderFulfillment.getFulfillmentMethod()) )
//       && ( !arrayLen(reward.getShippingMethods())
//            || (!isNull(orderFulfillment.getShippingMethod())
//                && reward.hasShippingMethod(orderFulfillment.getShippingMethod())) )
//     The address-zone gate at [PromotionService.cfc:L357-L368] is permissive
//     the same way: `addressIsInZone = true` at L357, and ONLY
//     `if(arrayLen(reward.getShippingAddressZones()))` at L358 flips it to
//     false at L359 and actually tests. So an empty `shippingAddressZones`
//     collection on a reward means the reward APPLIES.
//
//   RULE 2 - RESTRICTIVE, in the evaluator. THE EXACT OPPOSITE OF RULE 1.
//     [model/service/AddressService.cfc:L58] initialises
//     `var addressInZone = false;` and L60 walks
//     `addressZone.getAddressZoneLocations()`. The flag is only ever flipped
//     INSIDE the loop body, so with ZERO locations the body never executes and
//     it stays FALSE. An empty `locations` collection on an address zone means
//     NOT IN ZONE.
//     Rules 1 and 2 sit within a few lines of each other on the same code
//     path and mean opposite things. Normalising them into a single
//     "empty means unconstrained" convention would silently widen every
//     shipping promotion - it would change what customers are charged.
//
//   RULE 3 - `hasAnyInProperty` returns FALSE on an empty array.
//     [org/Hibachi/HibachiEntity.cfc:L340-L350] loops `arguments.entityArray`
//     and returns false after the loop. That is PERMISSIVE when the array is
//     an exclude-list and RESTRICTIVE when it is an include-list - the same
//     helper, opposite effects, depending on the caller's intent.
//
//   RULE 4 - the fulfillment three-way gate of rule 1 additionally carries the
//     single-promotion-per-fulfillment `[1]` assumption. See
//     `AppliedPromotionView` below.
//
//   RULE 5 - `Brand.getProducts()` defaults to an empty array, which is a
//     plain "no rows" default and carries no gate semantics at all.
//
//   RULE 6 - SEPARATE FROM ALL FIVE ABOVE: a FIRST-WRITER-WINS INITIALISATION
//     TEST. [model/service/PromotionService.cfc:L381] is
//     `if(!arrayLen(orderFulfillment.getAppliedPromotions())) { addNew = true; }`
//     which reads "nothing has been applied to this fulfillment yet, so this
//     discount wins by default". That is neither the permissive
//     reward-restriction rule nor the restrictive address-zone rule - it is a
//     test on the ACCUMULATOR rather than on a restriction. It is called out
//     separately so it is never normalised into the other five.
//
// ---------------------------------------------------------------------------

import type { Money } from '../valueObjects/money.js';

/**
 * The shipping address hanging off a fulfillment, projected down to exactly
 * the five things the in-scope slice reads. Five - no more.
 *
 * THE FOUR ADDRESS FIELDS ARE FIXED BY THE EVALUATOR, NOT CHOSEN
 * `isAddressInZone` [model/service/AddressService.cfc:L57-L80] reads exactly
 * four fields off its `address` argument, each inside a guard on the LOCATION
 * side:
 *
 *   [model/service/AddressService.cfc:L63]  getPostalCode()
 *   [model/service/AddressService.cfc:L66]  getCity()
 *   [model/service/AddressService.cfc:L69]  getStateCode()
 *   [model/service/AddressService.cfc:L72]  getCountryCode()
 *
 * Nothing else from `Address` is reachable from any in-scope call site, so
 * nothing else appears here. In particular there is deliberately no
 * `addressID`, `name`, `company`, `phone`, `streetAddress`, `street2Address`,
 * `locality` or `remoteID`: those columns exist on the legacy entity but no
 * in-scope reader touches them, and projecting them would drift this view
 * toward being an entity substitute.
 *
 * CFML parity [model/entity/Address.cfc:L59-L62]: all four are declared as
 * plain nullable strings - `L59 city`, `L60 stateCode`, `L61 postalCode`,
 * `L62 countryCode`, each `hb_populateEnabled="public" ormtype="string"` with
 * no `notnull` and no `default`. Each therefore maps to `string | undefined`.
 *
 * They are REQUIRED members whose type INCLUDES `undefined`, not optional
 * members. `exactOptionalPropertyTypes` is enabled, which makes "the member is
 * absent" and "the member is present and holds undefined" genuinely different
 * states; the legacy columns always exist and are simply nullable, so the
 * second state is the accurate one. Writing `postalCode?: string` would model
 * a column that can vanish, which is not what the schema says.
 *
 * A NOTE ON THE EVALUATOR BOUNDARY, so the mapping is never guessed at:
 * `src/domain/ports/addressZoneEvaluator.ts` declares its own
 * `AddressProjection` for the port's argument, and it is a SEPARATE
 * declaration by design. Handing a `ShippingAddressView` to that port is an
 * explicit mapping step performed by the consumer - which is exactly what an
 * anti-corruption boundary is for. This view does not widen itself to match a
 * port signature, and the port does not widen itself to match a view.
 *
 * NO COMPARISON HELPER LIVES HERE. CFML `!=` on strings is case-insensitive
 * and TypeScript `!==` is not, so the four field comparisons must be performed
 * case-insensitively - but that is the `addressZoneEvaluator` port
 * implementation's obligation, not this view's. A view holds data; it decides
 * nothing.
 */
export interface ShippingAddressView {
  /** CFML parity [model/service/AddressService.cfc:L63] via [model/entity/Address.cfc:L61]. */
  readonly postalCode: string | undefined;

  /** CFML parity [model/service/AddressService.cfc:L66] via [model/entity/Address.cfc:L59]. */
  readonly city: string | undefined;

  /** CFML parity [model/service/AddressService.cfc:L69] via [model/entity/Address.cfc:L60]. */
  readonly stateCode: string | undefined;

  /** CFML parity [model/service/AddressService.cfc:L72] via [model/entity/Address.cfc:L62]. */
  readonly countryCode: string | undefined;

  /**
   * Whether this address is newly-created and not yet persisted.
   *
   * WHY THIS IS AN EXPLICIT MEMBER RATHER THAN SOMETHING DERIVED
   * The legacy code probes ORM entity state to answer this. The port has no
   * ORM and therefore no entity state to interrogate, so the answer has to
   * arrive as data, decided by whatever produced the view. There is nothing to
   * compute here and nothing to infer - inferring it from, say, a missing
   * identifier would be substituting a guess for a fact the legacy runtime
   * actually knew.
   *
   * ONE MEMBER COVERS TWO LEGACY ACCESSORS. They are distinct base methods on
   * the same framework class, and one is simply a deprecated alias of the
   * other:
   *   [org/Hibachi/HibachiEntity.cfc:L707]  isNew()      - sits in the
   *                                         component's "Deprecated Methods"
   *                                         section; its body is literally
   *                                         `return getNewFlag();`
   *   [org/Hibachi/HibachiEntity.cfc:L571]  getNewFlag() - the real
   *                                         implementation: true when
   *                                         `getPrimaryIDValue() == ""`
   * Because they return the same value, collapsing them into one view member
   * loses nothing. (`org/Hibachi/**` is a boundary to extract from and never
   * to modify; it is cited here only to name where the semantics come from.)
   *
   * IT LIVES ON THE ADDRESS, NOT ON THE FULFILLMENT. Every legacy call site
   * probes the flag THROUGH the address, so composing it here keeps the shape
   * faithful to the accessor chain and keeps `OrderFulfillmentView` at seven
   * members:
   *   [model/service/PromotionService.cfc:L360]  guarded -
   *     `!isNull(orderFulfillment.getAddress()) && !orderFulfillment.getAddress().isNew()`
   *   [model/service/PromotionService.cfc:L678]  UNGUARDED -
   *     `... && !orderFulfillment.getAddress().getNewFlag()`
   *   [model/service/PromotionService.cfc:L703]  UNGUARDED -
   *     `... && (orderFulfillment.getAddress().getNewFlag() || ...)`
   *
   * THE NULL-GUARD ASYMMETRY IS REAL AND IS PRESERVED, NOT REPAIRED. L360
   * guards the address against null before dereferencing it; L678 and L703
   * dereference it with no guard at all, so a fulfillment with no address
   * raises at runtime on those two paths and does not on the first. The branch
   * logic is reproduced as written - "fixing" the missing guard would change
   * which promotions apply, and that is a product decision rather than a
   * translation one. Typing `address` as `ShippingAddressView | undefined` is
   * what forces a consumer to confront the asymmetry explicitly instead of
   * inheriting it silently, which is the correct outcome.
   *
   * CONTEXT, NOT CLAIMED: L703 is additionally the site of the published
   * defect-register entry numbered 11 - the shipping-address-zones clause
   * re-tests `hasShippingMethod` where it should test the zone condition. It
   * is named here only so a reader of this view understands the shape of the
   * consumer that reads it. `src/domain/views/**` owns NO defect-register
   * entry; ownership of that entry sits with `src/services/**`.
   */
  readonly isNew: boolean;
}

/**
 * The fulfillment method a fulfillment was placed against, projected to the
 * two fields the in-scope slice reads - and it genuinely needs BOTH, because
 * they are read in two different ways.
 *
 * CFML parity [model/entity/OrderFulfillment.cfc:L61]:
 * `property name="fulfillmentMethod" cfc="FulfillmentMethod"
 * fieldtype="many-to-one" fkcolumn="fulfillmentMethodID"`.
 *
 * WHY TWO FIELDS AND NOT ONE - IDENTITY AND TYPE ARE DIFFERENT READS
 *
 *   IDENTITY. The whole entity is handed to a membership test, which compares
 *   by primary key:
 *     [model/service/PromotionService.cfc:L353]
 *       `reward.hasFulfillmentMethod(orderFulfillment.getFulfillmentMethod())`
 *     [model/service/PromotionService.cfc:L699]
 *       `arguments.qualifier.hasFulfillmentMethod(orderFulfillment.getFulfillmentMethod())`
 *   `fulfillmentMethodID` is what makes those tests expressible without
 *   porting the out-of-scope `FulfillmentMethod` entity: a membership test
 *   over identifiers is exactly equivalent to the legacy `hasX(entity)` and
 *   needs nothing else.
 *
 *   TYPE. A separate site compares the method's CLASSIFICATION against a
 *   literal:
 *     [model/service/PromotionService.cfc:L678]
 *       `orderFulfillment.getFulfillmentMethod().getFulfillmentMethodType() eq "shipping"`
 *   This is a value comparison, not an identity comparison, and no identifier
 *   can answer it. Dropping `fulfillmentMethodType` would make the
 *   shipping-address-zone qualifier gate inexpressible.
 *
 * `fulfillmentMethodType` is typed as a plain `string` rather than a union of
 * literals. The legacy value is compared with CFML `eq`, which is
 * case-insensitive, and the set of valid types is owned by the out-of-scope
 * `FulfillmentMethod` entity - not enumerable from anything in scope. Narrowing
 * it to a literal union would assert a vocabulary this slice cannot verify.
 * The `"shipping"` comparison belongs to the consumer, performed with the
 * project's case-insensitive equality helper.
 *
 * Neither field is nullable. `fulfillmentMethod` is a many-to-one association
 * that the legacy code dereferences with NO null guard at
 * [model/service/PromotionService.cfc:L678], so a fulfillment always has one
 * on every path this view feeds - unlike `shippingMethod`, which is guarded
 * and is therefore modelled as nullable below.
 */
export interface FulfillmentMethodView {
  /**
   * OPAQUE. The identity used by the membership tests at
   * [model/service/PromotionService.cfc:L353] and
   * [model/service/PromotionService.cfc:L699]. Never dereferenced into the
   * out-of-scope `FulfillmentMethod` entity.
   */
  readonly fulfillmentMethodID: string;

  /**
   * The method's classification, compared against the literal `"shipping"` at
   * [model/service/PromotionService.cfc:L678].
   */
  readonly fulfillmentMethodType: string;
}

/**
 * The shipping method a fulfillment was placed against, projected to the one
 * field the in-scope slice reads: its identity.
 *
 * CFML parity [model/entity/OrderFulfillment.cfc:L65]:
 * `property name="shippingMethod" hb_populateEnabled="public"
 * cfc="ShippingMethod" fieldtype="many-to-one" fkcolumn="shippingMethodID"`.
 *
 * ONE FIELD, BECAUSE ONLY IDENTITY IS EVER READ. Every in-scope site hands the
 * whole entity to a membership test and reads nothing off it:
 *   [model/service/PromotionService.cfc:L355]
 *     `!isNull(orderFulfillment.getShippingMethod())
 *      && reward.hasShippingMethod(orderFulfillment.getShippingMethod())`
 *   [model/service/PromotionService.cfc:L701]
 *     `isNull(orderFulfillment.getShippingMethod())
 *      || !arguments.qualifier.hasShippingMethod(orderFulfillment.getShippingMethod())`
 *   [model/service/PromotionService.cfc:L703]
 *     `... || !arguments.qualifier.hasShippingMethod(orderFulfillment.getShippingMethod())`
 * Unlike the fulfillment method there is no type comparison anywhere, so there
 * is no second field to carry.
 *
 * THIS TYPE IS EXPORTED FOR A CONCRETE, VERIFIED REASON, not for symmetry.
 * `orderView.ts` needs it for the shipping-method-rate shape:
 * [model/service/PromotionService.cfc:L1056] reads
 * `arguments.shippingMethodOption.getShippingMethodRate().getShippingMethod()`
 * and feeds the result to `reward.hasShippingMethod(...)` - the same identity
 * read, reached through a different association. Exporting it here lets
 * `orderView.ts` consume one declaration instead of redeclaring a second,
 * divergence-prone copy, and it costs no new dependency: `orderView.ts`
 * already imports from this module.
 */
export interface ShippingMethodView {
  /**
   * OPAQUE. The identity used by the membership tests at
   * [model/service/PromotionService.cfc:L355],
   * [model/service/PromotionService.cfc:L701] and
   * [model/service/PromotionService.cfc:L703]. Never dereferenced into the
   * out-of-scope `ShippingMethod` entity.
   */
  readonly shippingMethodID: string;
}

/**
 * One promotion already applied to a fulfillment, on the READ side.
 *
 * CFML parity [model/entity/OrderFulfillment.cfc:L69]:
 * `property name="appliedPromotions" singularname="appliedPromotion"
 * cfc="PromotionApplied" fieldtype="one-to-many" fkcolumn="orderFulfillmentID"
 * cascade="all-delete-orphan" inverse="true"`.
 *
 * THE READ SURFACE IS EXACTLY TWO ACCESSORS. Verified by reading
 * [model/service/PromotionService.cfc:L376-L406] line by line:
 *
 *   L385  `orderFulfillment.getAppliedPromotions()[1].getDiscountAmount() < discountAmount`
 *   L388  `orderFulfillment.getAppliedPromotions()[1].getPromotion().getPromotionID()
 *          == reward.getPromotionPeriod().getPromotion().getPromotionID()`
 *
 * A `Money` comparison and a string identity comparison. Nothing else is read
 * off an applied-promotion element anywhere in the in-scope slice - not
 * `promotionAppliedID`, not `appliedType`, not `currencyCode`, not the
 * order/orderItem foreign keys. So this shape carries exactly two members.
 *
 * WHY NEITHER THE `PromotionApplied` NOR THE `Promotion` ENTITY IS IMPORTED
 * `src/domain/entities/promotionApplied.ts` exists, but the plan designates it
 * the WRITE-SIDE OUTPUT of the engine; this shape is the READ SIDE, an input.
 * Importing the write-side entity into a read-only input contract would couple
 * the two directions together and defeat the point of the seam. The `Promotion`
 * entity is likewise not imported: only `promotionID` is ever read, and
 * invariant 3 prefers an opaque identifier to a whole aggregate.
 *
 * The nested `promotion` wrapper mirrors the two-level legacy accessor chain
 * `.getPromotion().getPromotionID()` verbatim rather than flattening it to a
 * `promotionID` member, because interface parity at the member level is the
 * acceptance contract for this port.
 *
 * CONTEXT, NOT CLAIMED - THE SINGLE-PROMOTION-PER-FULFILLMENT `[1]` ASSUMPTION
 * // LEGACY-DEFECT [model/service/PromotionService.cfc:L385-L393]: the engine
 * // indexes element `[1]` of `getAppliedPromotions()` unconditionally after
 * // testing only that the collection is non-empty, assuming at most one
 * // promotion is ever applied to a fulfillment. The collection is a
 * // one-to-many with nothing enforcing that cardinality, so a second element
 * // would be read past and silently ignored.
 * // Preserved deliberately; do not fix without a product decision.
 * This entry is recorded here as CONTEXT so a consumer inherits the finding.
 * `src/domain/views/**` owns no defect-register entry - ownership sits with
 * `src/services/**`, which is where the indexing actually happens.
 *
 * Two consequences for the consumer, both of which follow from the toolchain
 * rather than from convention. `noUncheckedIndexedAccess` is enabled, so
 * `appliedPromotions[0]` has type `AppliedPromotionView | undefined` and the
 * consumer must NARROW it - a non-null assertion and a cast are both
 * unavailable, which is the desired outcome. And the assumption must be
 * REPRODUCED, not defensively generalised: rewriting the branch as a loop over
 * every applied promotion, or as a max-by-discount reduction, would change
 * which discount survives and therefore change money.
 *
 * THE INVERSION IS THREE-WAY: ADD, UPDATE-AMOUNT, AND REMOVE
 * The legacy engine performs three structurally different mutations on this
 * collection, and a consumer that emits only "add" intents cannot express two
 * of them:
 *
 *   UPDATE  [model/service/PromotionService.cfc:L389]
 *           `...getAppliedPromotions()[1].setDiscountAmount(discountAmount)`
 *           - taken when the incumbent promotion is the SAME promotion and the
 *             new discount is larger: raise the amount in place.
 *   REMOVE  [model/service/PromotionService.cfc:L393]
 *           `...getAppliedPromotions()[1].removeOrderFulfillment()`
 *           - taken when the incumbent is a DIFFERENT promotion and the new
 *             discount is larger: detach the incumbent, then add.
 *   ADD     [model/service/PromotionService.cfc:L400-L405]
 *           `this.newPromotionApplied()` (L401),
 *           `setAppliedType('orderFulfillment')` (L402),
 *           `setPromotion(...)` (L403),
 *           `setOrderFulfillment(...)` (L404),
 *           `setDiscountAmount(...)` (L405)
 *
 * The intent vocabulary the engine emits must therefore cover all three,
 * keyed by the opaque `orderFulfillmentID`. An add-only design would silently
 * drop the L389 raise and the L393 detach and would change what customers are
 * charged. This is recorded here so the consumer inherits the requirement
 * rather than rediscovering it. The intent types themselves are deliberately
 * NOT declared in this module: `src/domain/views/**` declares INPUT shapes
 * only, and emitting-side vocabulary belongs to the consumer subtree.
 *
 * `readonly` IS DOING REAL WORK HERE, NOT DECORATION
 * Because `appliedPromotions` is a `readonly AppliedPromotionView[]` and
 * `discountAmount` is a `readonly` member of an immutable `Money`, the legacy
 * `setDiscountAmount` of L389 and `removeOrderFulfillment` of L393 are
 * STRUCTURALLY IMPOSSIBLE to express against this view. A consumer cannot
 * accidentally mutate order state through it; the only way to express those
 * two operations is to emit an intent. The compiler enforces the seam, which
 * is precisely why invariant 2 is stated as an invariant and not as guidance.
 */
export interface AppliedPromotionView {
  /**
   * The discount already applied, compared with `<` at
   * [model/service/PromotionService.cfc:L385].
   *
   * `Money` and never `number`: this is currency, and all monetary values in
   * the port pass through the single arithmetic surface. The legacy column is
   * `property name="discountAmount" ormtype="big_decimal"`
   * [model/entity/PromotionApplied.cfc:L53] - with no `default`, exactly like
   * `fulfillmentCharge` - which is what `Money` exists to represent without
   * floating-point drift.
   *
   * LOCATOR CORRECTION, recorded so a reviewer can reconcile it: the published
   * plan cites this column as [model/entity/PromotionApplied.cfc:L49]. L49 is
   * the `component` declaration line; the property is at L53. The source is
   * the authority.
   */
  readonly discountAmount: Money;

  /**
   * The promotion this application belongs to, carrying only its identity.
   *
   * Nested rather than flattened, mirroring
   * `.getPromotion().getPromotionID()` at
   * [model/service/PromotionService.cfc:L388]. The identifier is OPAQUE - it
   * is compared for equality and never dereferenced into a `Promotion`.
   *
   * CFML parity [model/entity/PromotionApplied.cfc:L57]:
   * `property name="promotion" cfc="Promotion" fieldtype="many-to-one"
   * fkcolumn="promotionID"` - a required association, so the wrapper is not
   * nullable.
   */
  readonly promotion: {
    readonly promotionID: string;
  };
}

/**
 * A read-only projection of one order fulfillment: the anti-corruption input
 * shape the in-scope promotion engine consumes in place of the out-of-scope
 * `OrderFulfillment` aggregate.
 *
 * EXACTLY SEVEN MEMBERS, each proven by a live call site. See the
 * seven-not-four note in this file's header for the census and for why the
 * published four-member summary is understated. Do not add an eighth member;
 * do not omit one of the seven.
 *
 * Member names are the legacy accessor names in verbatim camelCase, because
 * interface parity is the acceptance contract for this port and a reviewer must
 * be able to diff the two surfaces directly. `getOrderFulfillmentID()` becomes
 * `orderFulfillmentID`, not `id`; `getTotalShippingWeight()` becomes
 * `totalShippingWeight`, not `weight`.
 *
 * CFML parity [model/entity/OrderFulfillment.cfc:L49]:
 * `entityname="SlatwallOrderFulfillment" table="SwOrderFulfillment"
 * ... hb_serviceName="orderService"`. That last attribute is the reason this
 * file is a view and not an entity: the legacy component is served by
 * `OrderService`, which is explicitly out of scope.
 */
export interface OrderFulfillmentView {
  /**
   * OPAQUE IDENTIFIER - the key the engines emit intents against.
   *
   * Read at [model/service/PromotionService.cfc:L351] (the reward gate's
   * `arrayFind` against the qualified-fulfillment list), L560 (seeding
   * `qualificationDetails.qualifiedFulfillmentIDs`), L666 (appending to the
   * qualifier's own list), L708 (locating an entry to delete after a gate
   * fails), and L756 / L774 (building and pruning the comma-delimited
   * qualified-fulfillment list).
   *
   * It is compared and collected, never dereferenced. On the write side it is
   * what an `appliedType: 'orderFulfillment'` intent is keyed by - the legacy
   * equivalents being `setAppliedType('orderFulfillment')`
   * [model/service/PromotionService.cfc:L402] and
   * `setOrderFulfillment( orderFulfillment )`
   * [model/service/PromotionService.cfc:L404]. Keying by an opaque string is
   * what lets the engine name a fulfillment without holding one.
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L52]:
   * `ormtype="string" length="32" fieldtype="id" generator="uuid"`.
   */
  readonly orderFulfillmentID: string;

  /**
   * The fulfillment charge - the DISCOUNT BASE of the entire
   * fulfillment-reward branch.
   *
   * Read at exactly one place, [model/service/PromotionService.cfc:L373]:
   * `var discountAmount = getDiscountAmount(reward, orderFulfillment.getFulfillmentCharge(), 1);`
   * One call site, and it is the one that decides the money. It also feeds the
   * order-level total indirectly, via
   * `arguments.order.getFulfillmentChargeAfterDiscountTotal()` at
   * [model/service/PromotionService.cfc:L417].
   *
   * `Money`, never `number`. CFML parity
   * [model/entity/OrderFulfillment.cfc:L53]:
   * `property name="fulfillmentCharge" ormtype="big_decimal"` - declared with
   * NO `default="0"`, which is worth stating because it means the legacy column
   * is genuinely nullable at the schema level even though every in-scope reader
   * dereferences it unguarded. The member is non-nullable here to match how it
   * is actually read; and `Money` has no zero fallback for a reason - a
   * defaulted amount would silently discount from a base of nothing.
   */
  readonly fulfillmentCharge: Money;

  /**
   * The fulfillment method, carrying both its identity and its type. See
   * {@link FulfillmentMethodView} for why both fields are load-bearing.
   *
   * Read at [model/service/PromotionService.cfc:L353] and L699 by identity, and
   * at L678 by type. Not nullable - L678 dereferences it with no guard.
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L61].
   */
  readonly fulfillmentMethod: FulfillmentMethodView;

  /**
   * The shipping method, or `undefined` when the fulfillment has none.
   *
   * NULLABLE, AND THE NULLABILITY IS LOAD-BEARING. The legacy code guards it
   * explicitly at two of its three read sites, which is what proves the column
   * is genuinely optional in practice rather than merely in the schema:
   *   [model/service/PromotionService.cfc:L355]
   *     `!isNull(orderFulfillment.getShippingMethod()) && reward.hasShippingMethod(...)`
   *   [model/service/PromotionService.cfc:L701]
   *     `isNull(orderFulfillment.getShippingMethod()) || !qualifier.hasShippingMethod(...)`
   * Note that the two guards have OPPOSITE polarity because one sits in a
   * permissive reward gate and the other in a restrictive qualifier gate: at
   * L355 an absent shipping method makes the reward NOT apply, while at L701 an
   * absent shipping method DISQUALIFIES the fulfillment. Both reduce to "no
   * shipping method means no match", and a consumer must preserve each in its
   * own polarity.
   * The third site, [model/service/PromotionService.cfc:L703], passes it to
   * `hasShippingMethod(...)` with NO guard at all.
   *
   * Declared as a REQUIRED member whose type includes `undefined`, not as an
   * optional `shippingMethod?:` member. `exactOptionalPropertyTypes` is
   * enabled, so the two forms are genuinely different: the legacy column
   * always exists on the row and is simply nullable, so "present and
   * undefined" is the accurate model and "may be absent" is not.
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L65].
   */
  readonly shippingMethod: ShippingMethodView | undefined;

  /**
   * Promotions already applied to this fulfillment, ALREADY POPULATED.
   *
   * Read at [model/service/PromotionService.cfc:L381] (the first-writer-wins
   * emptiness test - rule 6 in this file's header), L385 and L388 (the two
   * accessors that make up the entire read surface), and L389 and L393 (the
   * two in-place mutations the view makes structurally impossible).
   *
   * See {@link AppliedPromotionView} for the `[1]` single-promotion assumption,
   * the three-way ADD / UPDATE / REMOVE inversion a consumer must express, and
   * the reason `readonly` here is load-bearing rather than decorative.
   *
   * A `readonly T[]`, so neither the array nor its length can be changed
   * through this view. Per invariant 5 it arrives fully materialised - there is
   * no lazy collection to trigger and no port to reach.
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L69].
   */
  readonly appliedPromotions: readonly AppliedPromotionView[];

  /**
   * The total shipping weight of the fulfillment's items.
   *
   * A WEIGHT, NOT MONEY - so this is genuinely a `number` and deliberately not
   * a `Money`. It is a physical quantity compared against the numeric
   * qualifier thresholds `getMinimumFulfillmentWeight()` and
   * `getMaximumFulfillmentWeight()`; it is never added to, subtracted from, or
   * multiplied against a currency amount, so routing it through the monetary
   * arithmetic surface would misclassify it. This is the one member of the
   * seven that is correctly a raw number.
   *
   * Read at [model/service/PromotionService.cfc:L695] and L697 (the qualifier
   * gate's minimum and maximum weight tests) and at L769 and L771 (the same two
   * tests inside `getPromotionPeriodQualifiedFulfillmentIDList`).
   *
   * IT ARRIVES PRE-COMPUTED, AND THAT IS THE ANTI-CORRUPTION INVERSION.
   * On the legacy entity this is a COMPUTED accessor, not a column:
   * `public numeric function getTotalShippingWeight()`
   * [model/entity/OrderFulfillment.cfc:L317] walks
   * `getOrderFulfillmentItems()`, and for each item reaches
   * `getService("measurementService").convertWeightToGlobalWeightUnit(...)`
   * with two SKU settings, multiplying by `orderItem.getQuantity()`.
   * Reproducing that computation inside this slice would require porting the
   * out-of-scope `OrderFulfillment` and `OrderItem` entities and the
   * out-of-scope measurement service, and would drag a unit-conversion
   * subsystem across the seam. Accepting the already-resolved scalar is what
   * keeps the boundary intact: whoever builds the view owns the computation,
   * and the engine consumes a fact. This is a SCOPE decision about where a
   * responsibility sits - it is not a cache and not an optimization, and no
   * claim of any kind is made about how long the computation takes.
   */
  readonly totalShippingWeight: number;

  /**
   * The shipping address, or `undefined` when the fulfillment has none.
   *
   * Read at [model/service/PromotionService.cfc:L360] (guarded null test plus
   * the `isNew()` probe), L362 (passed to `isAddressInZone` in the
   * reward branch), L678 (the unguarded `getNewFlag()` probe), L684 (passed to
   * `isAddressInZone` in the qualifier branch), and L703 (the second unguarded
   * `getNewFlag()` probe). See {@link ShippingAddressView} for the five fields,
   * both framework origins of the `isNew` flag, and the guarded-versus-
   * unguarded asymmetry that is preserved rather than repaired.
   *
   * Declared as a REQUIRED member whose type includes `undefined`, for the same
   * `exactOptionalPropertyTypes` reason as `shippingMethod` above. Typing it
   * this way is what forces a consumer to confront the L678 / L703 asymmetry
   * explicitly instead of inheriting a latent dereference of nothing.
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L125]: on the legacy entity
   * `getAddress()` is a DERIVED accessor rather than a column - it returns
   * `getShippingAddress()` [model/entity/OrderFulfillment.cfc:L64] when that is
   * present, and otherwise falls back to copying the account address and
   * assigning it. That fallback WRITES, which is precisely the kind of hidden
   * mutation a read-only view exists to exclude: this member is the resolved
   * OUTCOME of that accessor, and resolving it is the responsibility of
   * whatever constructs the view.
   */
  readonly address: ShippingAddressView | undefined;
}
