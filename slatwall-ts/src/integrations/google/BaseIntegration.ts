/**
 * BaseIntegration — the default-implementation base class every Slatwall integration adapter
 * extends, and the reason `GoogleIntegration.ts` can be a faithful stub rather than a six-member
 * duplication.
 *
 * Legacy origin: `integrationServices/BaseIntegration.cfc:L49-L74`, which declares exactly six
 * public members, each with a one-line body:
 *
 * `:L51` `init` returns the component itself
 * `:L55` `getDisplayName` returns the two-word fallback display name reproduced below
 * `:L59` `getIntegrationTypes` returns the empty string
 * `:L63` `getSettings` returns an empty structure
 * `:L67` `getEventHandlers` returns an empty array
 * `:L71` `getAdminNavbarHTML` returns the empty string.
 */

import type { IntegrationContract, IntegrationSettingDescriptor } from './IntegrationContract';

/** The default implementations shared by Slatwall integration adapters. */
export class BaseIntegration implements IntegrationContract {
  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L51-L53 — the body returns the component
   * itself and does nothing else. There is no initialization work to reproduce.
   */
  public init(): this {
    return this;
  }

  /** Legacy: integrationServices/BaseIntegration.cfc:L55-L57. */
  public getDisplayName(): string {
    return 'Not Defined';
  }

  /** Legacy: integrationServices/BaseIntegration.cfc:L59-L61 — the empty string. */
  public getIntegrationTypes(): string {
    return '';
  }

  /** Legacy: integrationServices/BaseIntegration.cfc:L63-L65 — a new empty structure. */
  public getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {};
  }

  /** Legacy: integrationServices/BaseIntegration.cfc:L67-L69 — a new empty array. */
  public getEventHandlers(): readonly unknown[] {
    return [];
  }

  /** Legacy: integrationServices/BaseIntegration.cfc:L71-L73 — the empty string. */
  public getAdminNavbarHTML(): string {
    return '';
  }
}
