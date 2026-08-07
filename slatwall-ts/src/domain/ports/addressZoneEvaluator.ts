// slatwall-ts - address-zone membership port.
//
// One injected, synchronous, boolean-returning contract answering "is this address inside this
// address zone?", together with the three read-only input projections it consumes.
//
// The address-zone test is a GATE on MONEY: it decides whether a shipping-related promotion reward
// or qualifier applies.

/**
 * The address fields a zone test reads.
 *
 * The CFML ORM mapping does not declare these values required [model/entity/Address.cfc:L59-L62],
 * so the target projection permits undefined.
 */
export interface AddressProjection {
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly countryCode?: string | null;
}

// JUDGMENT CALL: Zone locations are typed separately from the address under test even though
// legacy maps both onto Address.
/**
 * One location entry of a zone, whose set fields are the criteria an address must match.
 *
 * A field left unset matches every address: the legacy test only narrows on a field the location
 * actually carries [model/service/AddressService.cfc:L63-L74].
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
 * `AddressZone` is an out-of-scope entity type, so the in-scope layers publish a zone association
 * as a list of opaque `addressZoneID` values - `PromotionQualifier.getShippingAddressZoneIDs()`
 * and `PromotionReward.getShippingAddressZoneIDs()`.
 *
 * When `addressZoneLocations` is NON-EMPTY, test those locations and resolve nothing.
 */
export interface AddressZoneProjection {
  /**
   * The opaque `addressZoneID` of the zone under test, carried verbatim from the link row
   * [model/entity/PromotionQualifier.cfc:L75 `inversejoincolumn="addressZoneID"`].
   */
  readonly addressZoneID: string;

  /**
   * The zone's locations when the caller already holds them, and an EMPTY list when the caller
   * publishes none.
   */
  readonly addressZoneLocations: readonly AddressZoneLocationProjection[];
}

/**
 * Address-zone membership: the single collaborator the promotion engine needs in order to decide
 * whether a shipping-related reward or qualifier applies to a given address.
 *
 * Ported from `isAddressInZone` [model/service/AddressService.cfc:L57], the one method of the
 * legacy `AddressService` that the in-scope slice depends on.
 *
 * This contract replaces the legacy DI/1 collaborator declared at
 * [model/service/PromotionService.cfc:L53].
 */
export interface AddressZoneEvaluator {
  // LEGACY-NOTE [model/service/AddressService.cfc:L63-L74]: only the zone-location value is
  // null-guarded; the address value it is compared against is read without a guard. Retained to
  // preserve the cited legacy behavior.
  /**
   * Report whether an address falls inside a zone.
   *
   * Which locations are tested is decided by {@link AddressZoneProjection}.
   *
   * @param address the address to test.
   * @param addressZone the zone to test it against, identified by `addressZoneID`.
   * @returns true when some location of the zone matches on every field it sets.
   */
  isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean;
}
