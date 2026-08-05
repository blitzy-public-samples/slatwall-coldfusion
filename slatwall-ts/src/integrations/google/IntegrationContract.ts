/**
 * IntegrationContract — the five-member contract every Slatwall integration adapter satisfies.
 *
 * Legacy origin: the `<cfinterface>` block at
 * `integrationServices/IntegrationInterface.cfc:L50-L89`, which declares exactly five members, in
 * this order:
 *
 * `:L52` `init` return declared as CFML's untyped catch-all
 * `:L56` `getDisplayName` returntype="string"
 * `:L63` `getIntegrationTypes` returntype="string"
 * `:L75` `getSettings` returntype="struct"
 * `:L82` `getEventHandlers` no `access` attribute — public by CFML default.
 */

/** The contract every Slatwall integration adapter satisfies — five members, no more. */
export interface IntegrationContract {
  /** Legacy: integrationServices/IntegrationInterface.cfc:L52. */
  init(): this;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L56, documented at L57-L60 as returning
   * the display name the integration should carry.
   */
  getDisplayName(): string;

  /** Legacy: integrationServices/IntegrationInterface.cfc:L63. */
  getIntegrationTypes(): string;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L75, declared `returntype="struct"`.
   *
   * TODO(parity) — legacy documentation defect, preserved rather than repaired (AAP §0.7.3).
   * integrationServices/IntegrationInterface.cfc:L77-L78 documents this member as returning true
   * only when a `/views/main/default.cfm` file is present inside the integration service: a
   * boolean description attached to a member whose declared return type is `struct` and whose two
   * observable implementations both return an empty structure. The declared `struct` contract
   * wins and the prose is stale. It is recorded, not corrected, and deliberately carries no
   * register number.
   */
  getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>>;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L82 — the member declaring no `access`
   * attribute, public by CFML default. Both observable implementations return an empty array
   * (integrationServices/BaseIntegration.cfc:L68, inherited unchanged by the Google adapter).
   *
   * TODO(parity) — legacy documentation defect, preserved rather than repaired (AAP §0.7.3).
   * integrationServices/IntegrationInterface.cfc:L84 documents this member as returning valid
   * ColdSpring XML that overrides the default XML: a markup-string description attached to a
   * member declared `returntype="array"` and observably returning an empty array. The declared
   * `array` contract wins and the prose is stale. It is recorded, not corrected, and deliberately
   * carries no register number.
   */
  getEventHandlers(): readonly unknown[];
}

/** The shape of one entry in the structure an integration returns to describe its settings. */
export interface IntegrationSettingDescriptor {
  readonly fieldType: string;
}
