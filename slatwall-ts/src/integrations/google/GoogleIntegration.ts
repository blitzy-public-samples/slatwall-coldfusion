/**
 * GoogleIntegration — the interface-conformant Google integration adapter, translated from
 * `integrationServices/google/Integration.cfc:L49-L79`.
 *
 * This file is nearly empty by faithfulness, not by neglect
 * The legacy component is 79 lines and breaks down to a license header, one component declaration,
 * four contract members returning two fixed strings and an empty structure, one populated settings
 * structure, and one member whose body is blank. AAP §0.6.4 investigated four candidate homes for
 * the Google product-feed logic and recorded, for this file, "No feed logic whatsoever."
 *
 * There is therefore nothing more to port. Feed generation, a merchant client, an outbound call or a
 * product-category lookup added here would be behavior the legacy system does not have, which AAP
 * §0.7.3 AAP §0.7.3 forbids outright. AAP §0.4.1.10 specifies the target contents exactly and no more: the
 * type token, the display name, an empty settings structure, and the one product-type setting field,
 * with the display-name defect recorded.
 */

import type { IntegrationContract, IntegrationSettingDescriptor } from './IntegrationContract';
import { BaseIntegration } from './BaseIntegration';

/** The Google integration adapter. */
export class GoogleIntegration extends BaseIntegration implements IntegrationContract {
  /** Legacy: `integrationServices/google/Integration.cfc:L51-L53`. */
  public override init(): this {
    return this;
  }

  /** Legacy: integrationServices/google/Integration.cfc:L55-L57. */
  public override getIntegrationTypes(): string {
    return 'fw1';
  }

  /**
   * Legacy: `integrationServices/google/Integration.cfc:L59-L61`.
   *
   * TODO(parity) D11 — `integrationServices/google/Integration.cfc:L49`. The component attributes on
   * that line declare `displayname="USA epay"` while this method returns the vendor name below. The
   * two disagree, and the method is the one that takes effect. It is a copy-paste artifact: the
   * component was cloned from the USAePay payment adapter — which is also why an
   * interface-conformant shell exists here with no feed implementation behind it, so the artifact is
   * genuinely informative evidence rather than noise.
   */
  public override getDisplayName(): string {
    return 'Google';
  }

  /** Legacy: integrationServices/google/Integration.cfc:L63-L65 — a new empty structure. */
  public override getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {};
  }

  /**
   * Legacy: integrationServices/google/Integration.cfc:L67-L71 — the one populated settings
   * structure in the entire in-scope slice: a single key whose descriptor declares a single field,
   * written in the legacy source as fieldType="select" at L69.
   */
  public getIntegratedSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {
      productGoogleProductType: { fieldType: 'select' },
    };
  }

  /**
   * Legacy: integrationServices/google/Integration.cfc:L73-L77.
   *
   * TODO(parity) — unnumbered. Declaration-versus-body mismatch: Integration.cfc:L73 declares
   * returntype="array" while the body at L74-L77 contains no return statement, so the declared
   * collection return is never actually produced. Recorded, not repaired (AAP §0.7.3). It
   * carries no register number by design — it is a stale legacy declaration, not a new register
   * entry.
   *
   * TODO(parity) — unnumbered. Operator case sensitivity: the comparison at Integration.cfc:L74
   * uses CFML's `eq`, which is case-insensitive, whereas the strict comparison below is
   * case-sensitive. Under the legacy, a differently-cased setting name would have entered the
   * branch; under this port it will not. The divergence is not observable: the branch body is
   * blank and the method produces nothing on either path, so the result is identical whichever
   * branch is taken. It is recorded rather than "fixed" — a case-insensitive comparison, or
   * normalising the argument's case, would add behavior the port has no evidence for, and would add
   * it in order to change a result that cannot differ. Also unnumbered by design.
   */
  public getSettingOptions(settingName: string): readonly unknown[] | undefined {
    if (settingName === 'productGoogleProductType') {
      // Intentionally blank, mirroring integrationServices/google/Integration.cfc:L74-L76, whose
      // branch body is empty and produces no options. Nothing belongs in here: a category
      // taxonomy, an enumerated list or a placeholder would each add behavior the legacy adapter
      // does not have (AAP §0.7.3).
    }

    return undefined;
  }
}
