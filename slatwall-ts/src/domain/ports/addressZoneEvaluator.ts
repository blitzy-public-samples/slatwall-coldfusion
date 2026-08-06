// ---------------------------------------------------------------------------
// THE SIBLINGS THIS FILE NAMES, AND WHAT EACH ONE OWNS
//
// Commentary below hands responsibilities to other modules by name, and every
// one of them exists on the branch - so each mention points at real code rather
// than at an intention. Naming a boundary here is how this file records what it
// deliberately does NOT do, so that no responsibility below acquires a second
// owner:
//
//   src/handlers/bootstrap.ts  composition root (wiring)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - address-zone membership port
//
// PURPOSE
//   One injected, synchronous, boolean-returning contract answering "is this
//   address inside this address zone?", together with the three read-only
//   input projections it consumes. It is the TypeScript expression of a single
//   legacy method, `isAddressInZone`, declared at
//   [model/service/AddressService.cfc:L57].
//
//   The address-zone test is a GATE ON MONEY: it decides whether a
//   shipping-related promotion reward or qualifier applies. The semantics
//   recorded below are therefore behavior to preserve exactly, not
//   implementation detail. Preserving promotion discount math and use-limit
//   enforcement is one of the three named must-preserve areas of this port.
//
// THIS PORT IS LIVE, AND IT IS EXERCISED FROM THREE IN-SCOPE CALL SITES
//   It carries no placeholder semantics and stands in for nothing. The
//   in-scope `PromotionService` declares the collaborator at
//   [model/service/PromotionService.cfc:L53] (`property name="addressService"`)
//   and reaches this method at three distinct places, each verified by reading
//   the legacy tree:
//
//     PromotionService.cfc:L362   inside updateOrderAmountsWithPromotions, in
//                                 the fulfillment-reward branch - that is,
//                                 directly on the must-preserve discount
//                                 pipeline
//     PromotionService.cfc:L684   inside getQualifierQualificationDetails, the
//                                 shipping-address-zone qualifier gate
//     PromotionService.cfc:L1063  inside
//                                 getShippingMethodOptionsDiscountAmountDetails
//
//   Two further legacy callers exist and are out of scope, so nothing here is
//   shaped for them: ShippingService.cfc:L294 and TaxService.cfc:L75.
//
//   L362 and L1063 call with named arguments (`address=`, `addressZone=`);
//   L684 calls positionally, which independently fixes the parameter ORDER
//   published below as (address, addressZone).
//
// THE ONE METHOD, AND ITS EXACT LEGACY SEMANTICS
//   [model/service/AddressService.cfc:L57-L82], read as behavior:
//
//     L58        addressInZone starts false
//     L60-L61    walk addressZone.getAddressZoneLocations()
//     L62        inLocation starts true for each location
//     L63-L74    four guarded inequality checks, in this source order:
//                  postalCode, city, stateCode, countryCode
//                each shaped exactly:
//                  if (!isNull(location.getX()) && location.getX() != address.getX())
//                    inLocation = false
//     L75-L78    the first location with inLocation still true sets
//                addressInZone = true and breaks
//     L81        return addressInZone
//
//   Stated as rules:
//     * A location matches when EVERY field that location actually specifies
//       matches the address. A field the location leaves absent is NOT a
//       constraint.
//     * The address is in the zone when AT LEAST ONE location matches.
//     * The walk stops at the first match. That is legacy behavior being
//       carried forward, and it is recorded here for that reason alone.
//
//   THE GUARD IS ASYMMETRIC, AND THE ASYMMETRY IS LOAD-BEARING.
//   `!isNull(...)` wraps the LOCATION side only, at L63, L66, L69 and L72; the
//   address side is never guarded. The two absences are consequently not
//   symmetrical, and an implementation must not treat them as though they
//   were:
//     * an absent LOCATION field imposes no constraint - it is skipped;
//     * an absent ADDRESS field cannot satisfy a location field that DOES
//       specify a value - the comparison fails and that location is rejected.
//   Reading an absent address field as a wildcard would widen every zone.
//
// BEHAVIOR-CRITICAL: AN EMPTY LOCATION COLLECTION MEANS NOT IN ZONE
//   `addressInZone` is initialized to false at L58 and is only ever flipped
//   INSIDE the loop body, at L76. An address zone whose `addressZoneLocations`
//   collection is empty therefore yields FALSE.
//
//   That reading is RESTRICTIVE, not permissive. An empty collection does not
//   mean "unconstrained" and it does not mean "everything matches".
//   Implementing it as permissive is the single most likely mistake in this
//   module, and it would silently apply shipping promotions to addresses the
//   legacy system excludes - it would change what customers are charged.
//   Preserve the restrictive reading.
//
//   This is intended behavior carried forward, not a defect, and no defect
//   marker is assigned to this module.
//
// EVERY COMPARISON MUST BE CASE-INSENSITIVE
//   CFML `!=` on strings is case-insensitive; TypeScript `!==` is not. All
//   four field comparisons must therefore be performed case-insensitively, or
//   a zone location recorded in one casing stops matching an address recorded
//   in another and the promotion silently stops applying.
//
//   The absence tests are CFML `isNull`-style, so BOTH `null` and `undefined`
//   count as "no value present" in the target.
//
//   The sanctioned helpers for both concerns already exist in this subtree:
//     cfEquals            in src/lib/cfml/struct.ts
//     isNullish, cfLen    in src/lib/cfml/truthiness.ts
//
//   They are named here as direction for whoever writes the implementation.
//   This module does not import them: a type declaration has no use for a
//   runtime helper - see "IT IMPORTS NOTHING" below.
//
// THIS PORT IS SYNCHRONOUS
//   `isAddressInZone` returns `boolean`, never `Promise<boolean>`, and the
//   method is not `async`. The legacy body performs no DAO call, no ORM query
//   and no HTTP call: it walks an already-loaded collection and compares
//   strings. Nothing in it justifies an async boundary, and adding one would
//   force every caller onto a promise chain for a pure predicate.
//
//   The caller supplies the zone with its locations ALREADY MATERIALIZED.
//   This port fetches nothing. That follows the subtree-wide rule that
//   associations are materialized at the repository boundary and Hibernate
//   lazy loading is not simulated, so the fetch shape stays an explicit
//   decision made where the query is written rather than a hidden one made
//   here.
//
//   Of the thirteen ports in this folder, only this one and the settings
//   provider are synchronous. Every other port is async.
//
// WHY THE INPUT SHAPES ARE DECLARED IN THIS FILE
//   Address, AddressZone and the zone-location rows are NOT among the eighteen
//   in-scope entities, so there is no `../entities/address.ts` to import and
//   none will be created. The legacy signature types both parameters `any`,
//   which this project's strictness profile forbids outright.
//
//   The standing convention for exactly this case is that an out-of-scope
//   entity type becomes a locally declared, read-only PROJECTION inside the
//   port that needs it, carrying only the fields the algorithm actually reads.
//   Hence the three interfaces below - and hence no new file, because this
//   folder is closed at thirteen ports.
//
//   VERIFIED SCHEMA NOTE, because it explains a surprise below. There is no
//   AddressZoneLocation entity in the legacy model. The association is
//   declared at [model/entity/AddressZone.cfc:L61] as
//     cfc="Address" fieldtype="many-to-many" linktable="SwAddressZoneLocation"
//   so `SwAddressZoneLocation` is a LINK TABLE and the zone's "locations" are
//   `SwAddress` rows. Address and zone-location are consequently backed by the
//   same table and share an identical field set. They are still declared as
//   two separate interfaces because their MEANING differs; see each
//   declaration. Collapsing them into one alias would erase the distinction
//   between "the address under test" and "a constraint on that address", which
//   is exactly the asymmetry documented above.
//
//   Schema continuity is unaffected: the existing `SwAddress`, `SwAddressZone`
//   and `SwAddressZoneLocation` tables are read exactly as they stand. No
//   migration, no rename, no new table, no column change.
//
// WHAT IS DELIBERATELY NOT DECLARED HERE
//   * ShippingMethodOptionView. The service-tier signature
//     `getShippingMethodOptionsDiscountAmountDetails(option: ShippingMethodOptionView)`
//     is owned by src/services/**. Declaring that shape here would leak a
//     service input type into the ports folder and create a second, competing
//     definition of it.
//   * No shipping-discount-details type, no shipping-method type, no
//     fulfillment type, and no order, order-item or order-fulfillment type.
//   * No account shape. Where such an identifier is needed anywhere in this
//     folder it is reduced to an opaque string ID, and this port needs none.
//   * No monetary type at all. The zone test returns a boolean; the discount
//     arithmetic this gate controls is computed in the service tier, through
//     the value object that owns every currency calculation in this port.
//     Nothing monetary is declared or referenced in this file.
//
// THIS MODULE EMITS NO RUNTIME JAVASCRIPT
//   Interfaces only. No class, no const, no function body, and deliberately no
//   TypeScript `enum` - an `enum` is the one type-like construct that does
//   emit runtime code. Everything here is erased at compile time, so the
//   module contributes nothing to the Lambda bundle and cannot participate in
//   a runtime import cycle. The ports-to-entities relationship is a type-graph
//   relationship only, and it stays that way precisely because these files
//   hold no values and nothing re-exports them.
//
// IT IMPORTS NOTHING
//   Zero import statements, by design rather than by coincidence: every type
//   this contract needs is declared below.
//
//   The domain layer may import only from within src/domain/** and from
//   src/lib/**. Reaching src/repositories/**, src/handlers/** or
//   src/integrations/**, or the mysql2 / aws-lambda / dotenv packages, is a
//   build failure enforced by the `no-restricted-imports` boundary in
//   eslint.config.mjs. Beyond that boundary this folder also declines, by
//   design, to import src/lib/config.ts or src/lib/logger.ts, decimal.js, any
//   sibling port, any read-only order view, and any barrel - there are no
//   barrel files anywhere in this subtree.
//
// WHO IMPLEMENTS THIS PORT
//   Six of the thirteen ports are implemented under src/repositories/mysql/**.
//   This is NOT one of them: it has no adapter file anywhere in the target
//   layout, so its only implementation home is the composition root at
//   src/handlers/bootstrap.ts, which wires the single concrete instance.
//
//   Three obligations fall on that implementation. Two are drawn from the
//   legacy body: compare all four fields case-insensitively, and treat a zone
//   with no matching location - including one with no locations at all - as not
//   entered. The third is drawn from what the in-scope callers can supply: the
//   promotion engine publishes a zone association as opaque `addressZoneID`
//   values and holds no locations, so the implementation MUST resolve locations
//   from `addressZoneID` whenever the supplied location list is empty. That
//   resolution is synchronous, because this contract is: the zone-to-locations
//   state is materialized before the call, never fetched inside it.
//
// THE PUBLISHED NAMES ARE CANONICAL
//   FOUR modules now consume this contract - `src/services/promotionService.ts`,
//   `src/services/promotion/qualifierQualification.ts`,
//   `src/handlers/promotionApplicationHandler.ts` and the composition root
//   `src/handlers/bootstrap.ts` - and every one of them is written against the
//   names below. A rename here is therefore no longer a local edit: it changes
//   four call sites and the acceptance contract at the same time.
//   `isAddressInZone`, `address` and `addressZone` are carried over verbatim
//   from the CFML declaration because method-level interface parity IS the
//   acceptance contract for this migration, and that is why no naming-convention
//   lint rule is enabled anywhere in this project. Do not rename any of them.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, and it was re-read to
//   confirm it. No rule is invented to fill the gap, and the absence is not
//   treated as license to lower the bar: maximal strictness with no `any` and
//   no suppression comment, one exported contract per file, no barrel, no
//   hardcoded locale literal of any kind, and every judgment call annotated
//   where it was made.
//
// TEST COVERAGE IS NET-NEW
//   No legacy test touches AddressService. Only three legacy test files reach
//   the in-scope slice at all - meta/tests/unit/entity/BrandTest.cfc,
//   meta/tests/unit/entity/ProductTest.cfc, and
//   meta/tests/functional/admin/entity/ProductTest.cfc, which is an empty
//   scaffold - and none of them covers this method. Coverage for this port is
//   therefore net-new and must never be presented as legacy parity. The test
//   tier is authored separately and is not part of this module.
// ---------------------------------------------------------------------------

/**
 * The address fields a zone test reads.
 *
 * The CFML ORM mapping does not declare these values required
 * [model/entity/Address.cfc:L59-L62], so the target projection permits undefined.
 */
export interface AddressProjection {
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly countryCode?: string | null;
}

// JUDGMENT CALL: Zone locations are typed separately from the address under test even though legacy maps both onto Address.
/**
 * One location entry of a zone, whose set fields are the criteria an address must match.
 *
 * A field left unset matches every address: the legacy test only narrows on a field the location
 * actually carries [model/service/AddressService.cfc:L63-L74]. The CFML mapping declares zone
 * locations as a many-to-many onto Address [model/entity/AddressZone.cfc:L61] and does not declare
 * any of these values required, so the target projection permits undefined.
 */
export interface AddressZoneLocationProjection {
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly countryCode?: string | null;
}

/**
 * The zone under test: its opaque identity, and its ordered list of locations.
 *
 * BOTH MEMBERS ARE REQUIRED, AND THE IDENTIFIER IS THE LOAD-BEARING ONE.
 * `AddressZone` is an out-of-scope entity type, so the in-scope layers publish a zone association as
 * a list of opaque `addressZoneID` values - `PromotionQualifier.getShippingAddressZoneIDs()` and
 * `PromotionReward.getShippingAddressZoneIDs()` - and NEVER as zone entities carrying locations
 * [model/entity/PromotionQualifier.cfc:L75, model/entity/PromotionReward.cfc:L77]. A caller in that
 * position can therefore supply the identity but not the locations.
 *
 * Declaring `addressZoneLocations` alone would make this contract UNIMPLEMENTABLE for exactly the one
 * caller it exists to serve: the caller would hand over an empty list, the implementation would read
 * "this zone has no locations", and `isAddressInZone` would answer `false` for every configured zone -
 * silently, and for a zone the legacy would have entered. `addressZoneID` closes that gap by giving
 * the implementation the only key it needs to resolve the zone itself.
 *
 * THE OBLIGATION THIS PLACES ON AN IMPLEMENTATION, STATED SO IT CANNOT BE MISSED:
 *   * When `addressZoneLocations` is NON-EMPTY, test those locations and resolve nothing. A caller
 *     that has already materialized the association is authoritative about it.
 *   * When `addressZoneLocations` is EMPTY, resolve this zone's locations from `addressZoneID` before
 *     answering. An empty list from a caller that publishes no locations is "not supplied", not "none
 *     exist", and the two must not be conflated.
 *   * A zone that genuinely HAS no locations is still not entered. That restriction is legacy
 *     behavior - the loop at [model/service/AddressService.cfc:L60-L61] runs zero times and
 *     `addressInZone` stays `false` - and resolving by identifier must not soften it into a match.
 *
 * Resolution stays SYNCHRONOUS, because this contract is synchronous: an implementation materializes
 * its zone-to-locations state ahead of the call, exactly as the SKU currency-detail map is
 * materialized during hydration so that the SKU's accessors can stay synchronous.
 */
export interface AddressZoneProjection {
  /**
   * The opaque `addressZoneID` of the zone under test, carried verbatim from the link row
   * [model/entity/PromotionQualifier.cfc:L75 `inversejoincolumn="addressZoneID"`].
   *
   * The identity is preserved with its stored casing. CFML compares identifiers case-insensitively,
   * so an implementation that resolves against a keyed store must fold case when it looks this up
   * rather than assume the caller normalized it.
   */
  readonly addressZoneID: string;

  /**
   * The zone's locations when the caller already holds them, and an EMPTY list when the caller
   * publishes none. See the type's own note for why the two cases are not the same and what each
   * obliges an implementation to do.
   */
  readonly addressZoneLocations: readonly AddressZoneLocationProjection[];
}

/**
 * Address-zone membership: the single collaborator the promotion engine needs
 * in order to decide whether a shipping-related reward or qualifier applies to
 * a given address.
 *
 * Ported from `isAddressInZone` [model/service/AddressService.cfc:L57], the one
 * method of the legacy `AddressService` that the in-scope slice depends on. The
 * rest of that component - `copyAddress`, `getCountryCodeOptions` and the
 * framework-inherited surface - is out of scope and deliberately absent.
 *
 * This contract replaces the legacy DI/1 collaborator declared at
 * [model/service/PromotionService.cfc:L53]. It has no adapter file in the
 * target layout, so the composition root at src/handlers/bootstrap.ts is its
 * only implementation home.
 */
export interface AddressZoneEvaluator {
  // LEGACY-NOTE [model/service/AddressService.cfc:L63-L74]: only the zone-location value is null-guarded; the address value it is compared against is read without a guard.
  // Retained to preserve the cited legacy behavior.
  /**
   * Report whether an address falls inside a zone.
   *
   * CFML parity [model/service/AddressService.cfc:L60-L81]: each location is tested on postal code,
   * city, state code and country code; the first location whose set fields all match wins and the loop
   * stops [model/service/AddressService.cfc:L75-L78], and a zone with no matching location — including
   * a zone with no locations at all — is not entered. Comparison folds case, because the legacy `!=`
   * operator compares strings without regard to case.
   *
   * WHICH LOCATIONS ARE TESTED is decided by {@link AddressZoneProjection}, not here: an implementation
   * tests `addressZone.addressZoneLocations` when that list is non-empty and otherwise resolves the
   * zone's locations from `addressZone.addressZoneID` first. An empty list from a caller that publishes
   * no locations means "not supplied" and must not be read as "none exist" - see the projection's note
   * for the full obligation. A zone that genuinely has no locations is still not entered.
   *
   * @param address the address to test.
   * @param addressZone the zone to test it against, identified by `addressZoneID`.
   * @returns true when some location of the zone matches on every field it sets.
   */
  isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean;
}
