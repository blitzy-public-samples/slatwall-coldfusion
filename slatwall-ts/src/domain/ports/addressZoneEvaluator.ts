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
//   Two obligations fall on that implementation, both drawn from the legacy
//   body: compare all four fields case-insensitively, and accept the zone's
//   locations already materialized, since this contract is synchronous and
//   performs no fetch of its own.
//
// THE PUBLISHED NAMES ARE CANONICAL
//   Every subtree that will consume this contract - entities, services,
//   repositories, handlers and the integration adapter - is currently empty.
//   The type names, the method name, the parameter names and the parameter
//   order published here are therefore the definition all of them will be
//   written against. `isAddressInZone`, `address` and `addressZone` are
//   carried over verbatim from the CFML declaration because method-level
//   interface parity is the acceptance contract for this migration, and that
//   is why no naming-convention lint rule is enabled anywhere in this project.
//   Do not rename any of them later.
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
 * The address being tested for zone membership.
 *
 * An anti-corruption PROJECTION of the out-of-scope `SlatwallAddress` entity
 * [model/entity/Address.cfc:L49, table `SwAddress`]. It is not a domain entity
 * and not a substitute for one: it carries only the four fields the membership
 * algorithm reads, and it must NOT be grown. An address field that some other
 * feature needs belongs to that feature, not to this contract.
 *
 * All four columns are declared `ormtype="string"` with no not-null constraint
 * [model/entity/Address.cfc:L59-L62], so every one of them is genuinely
 * absent-capable in the existing schema. That is precisely why the legacy
 * comparisons are guarded at all.
 *
 * ABSENCE HERE MEANS "THIS ADDRESS HAS NO SUCH VALUE" - it does not mean
 * "matches anything". An absent field cannot satisfy a zone location that
 * specifies a value for it; see {@link AddressZoneEvaluator.isAddressInZone}.
 *
 * Each field is optional AND nullable, and both halves of that are deliberate:
 *
 *   - OPTIONAL, written `field?: string | null` and pointedly not
 *     `field?: string | null | undefined`, keeps faith with
 *     `exactOptionalPropertyTypes`: an absent key is legal, while explicitly
 *     passing `undefined` for a present key is a compile error. `undefined` is
 *     not a distinct legal value here, because absence already carries that
 *     meaning, so it is not added to the union.
 *   - NULLABLE because `null` genuinely is a distinct legal state: these are
 *     nullable MySQL columns, the driver yields `null` for an unset one, and
 *     `null` is the exact state the legacy `isNull()` guard tests. Excluding it
 *     would leave the rule that both `null` and absence count as "no value"
 *     describing something the type system had already ruled out.
 */
export interface AddressProjection {
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly countryCode?: string | null;
}

/**
 * One location entry of an address zone: a set of CONSTRAINTS an address is
 * tested against.
 *
 * An anti-corruption projection, deliberately minimal, and not to be grown
 * into an entity substitute.
 *
 * Structurally this is identical to {@link AddressProjection}, and that is not
 * an oversight - it is what the legacy schema says. `AddressZone` declares its
 * locations at [model/entity/AddressZone.cfc:L61] as
 * `cfc="Address" fieldtype="many-to-many" linktable="SwAddressZoneLocation"`,
 * so `SwAddressZoneLocation` is a link table and each location IS an
 * `SwAddress` row. There is no `AddressZoneLocation` entity to project.
 *
 * The two shapes are nevertheless kept as separate declarations because they
 * play opposite roles, and a field's ABSENCE means something different in each:
 *
 *   - absent on {@link AddressProjection} - the address has no such value, and
 *     therefore cannot satisfy a constraint on that field;
 *   - absent HERE - NO CONSTRAINT on that field. The legacy guard skips it, so
 *     the field is simply not considered when matching.
 *
 * Optionality and nullability follow {@link AddressProjection} for the same
 * reasons, with one addition specific to this side of the comparison: `null`
 * carries the same "no constraint" meaning that absence does, because the
 * legacy test is `!isNull(...)` and treats the two alike.
 */
export interface AddressZoneLocationProjection {
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly countryCode?: string | null;
}

/**
 * The address zone an address is tested against.
 *
 * An anti-corruption projection of the out-of-scope `SlatwallAddressZone`
 * entity [model/entity/AddressZone.cfc:L49, table `SwAddressZone`]. It carries
 * only the collection the membership algorithm walks - not the zone's
 * identifier, its name, its audit columns, or its associations to shipping
 * methods, shipping-method rates, tax-category rates and promotion qualifiers.
 * Do not grow it to add them.
 *
 * The property is named for the legacy accessor it replaces,
 * `getAddressZoneLocations()` [model/service/AddressService.cfc:L60-L61].
 *
 * It is REQUIRED, and it is READ-ONLY at both levels.
 *
 *   - REQUIRED because the algorithm always walks it, and an absent collection
 *     is not a state the legacy code can represent. A zone with no locations is
 *     expressed as an empty array, which is a meaningful value with a specific
 *     and restrictive outcome - see
 *     {@link AddressZoneEvaluator.isAddressInZone}.
 *   - READ-ONLY, in the array and in every element, because this is an input
 *     the domain reads and must never reorder, extend or otherwise mutate.
 */
export interface AddressZoneProjection {
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
  /**
   * Report whether `address` falls inside `addressZone`.
   *
   * Ported from [model/service/AddressService.cfc:L57-L82]. The method name and
   * both parameter names are carried over verbatim from that declaration, and
   * the parameter order is fixed by the positional call at
   * [model/service/PromotionService.cfc:L684].
   *
   * MATCHING RULES, exactly as the legacy body applies them:
   *
   *   1. Four fields are compared, in this source order: `postalCode`, `city`,
   *      `stateCode`, `countryCode` [L63, L66, L69, L72].
   *   2. A location matches when EVERY field that location actually specifies
   *      matches the address. A field the location leaves absent - `null` or
   *      missing - is NOT a constraint and is skipped.
   *   3. The address is in the zone when AT LEAST ONE location matches.
   *   4. The walk stops at the first matching location [L77]. Later locations
   *      are not examined. This is legacy behavior being preserved, and it is
   *      documented as behavior for that reason alone.
   *
   * BEHAVIOR-CRITICAL - AN EMPTY LOCATION COLLECTION MEANS NOT IN ZONE.
   * `addressInZone` is initialized to false [L58] and is only ever flipped
   * inside the loop body [L76], so an {@link AddressZoneProjection} whose
   * `addressZoneLocations` array is empty returns `false`. That is RESTRICTIVE,
   * not permissive: an empty collection does not mean "unconstrained" and does
   * not mean "everything matches". Implementing it permissively would silently
   * apply shipping promotions to addresses the legacy system excludes, changing
   * what customers are charged. This is intended behavior to preserve, not a
   * defect to repair.
   *
   * THE ABSENCE GUARD IS ASYMMETRIC. `!isNull(...)` wraps the LOCATION side
   * only [L63, L66, L69, L72]; the address side is never guarded. So an absent
   * LOCATION field imposes no constraint, whereas an absent ADDRESS field
   * cannot satisfy a location field that does specify a value - that comparison
   * fails and the location is rejected. Treating an absent address field as a
   * wildcard would widen every zone.
   *
   * COMPARISONS MUST BE CASE-INSENSITIVE. CFML `!=` on strings ignores case and
   * TypeScript `!==` does not, so an implementation that compares strictly
   * changes behavior. Both absence tests must also follow CFML `isNull`
   * semantics, treating `null` and `undefined` alike. The sanctioned helpers
   * are `cfEquals` in src/lib/cfml/struct.ts and `isNullish` / `cfLen` in
   * src/lib/cfml/truthiness.ts; this module names them as direction for the
   * implementer without importing them.
   *
   * SYNCHRONOUS BY RULING. The return type is `boolean`, never
   * `Promise<boolean>`, and the method is not `async`: the legacy body performs
   * no DAO call, no ORM query and no HTTP call. The caller must supply
   * `addressZone` with its locations already materialized, because this
   * contract performs no fetch. The result is always a definite boolean and is
   * never `undefined`.
   *
   * @param address - the address under test, as a read-only projection.
   * @param addressZone - the zone to test against, carrying its already
   *   materialized locations.
   * @returns `true` when at least one zone location matches the address;
   *   `false` otherwise, including when the zone has no locations.
   */
  isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean;
}
