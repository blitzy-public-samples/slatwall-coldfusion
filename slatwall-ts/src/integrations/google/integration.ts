// The Google integration adapter.
//
// EIGHT MEMBERS, not NINE: six declared on the component
// [integrationServices/google/Integration.cfc:L51-L77] and two inherited from the base
// [integrationServices/BaseIntegration.cfc:L67-L73].
//
// Feed generation is deliberately not among them, and that is the whole discrepancy with any
// nine-member reading of this adapter.
//
// Two preserved defects live in this file, and only in this file - the display-name contradiction
// [integrationServices/google/Integration.cfc:L49 versus L59-L61].

import type {
  IntegrationInterface,
  IntegrationType,
  SettingDefinition,
} from '../integrationInterface.js';
import { cfEquals } from '../../lib/cfml/struct.js';

/**
 * The Google integration adapter.
 *
 * JUDGMENT CALL: the exported class is named `GoogleIntegration`, not the source's bare
 * `Integration`.
 *
 * JUDGMENT CALL: the contract is implemented directly and the two inherited defaults are inlined
 * as ordinary members, rather than reproducing `extends BaseIntegration` as a TypeScript base
 * class.
 */
export class GoogleIntegration implements IntegrationInterface {
  /**
   * Initialises the adapter and returns it.
   *
   * Ported from [integrationServices/google/Integration.cfc:L51-L53], whose body is `return this;`
   * and whose declared `returntype="any"` carried no type discipline.
   *
   * The return is the polymorphic `this` rather than the interface type, which preserves the
   * caller's concrete type through the call so this adapter's two extras stay reachable on the
   * result.
   */
  init(): this {
    return this;
  }

  /**
   * The integration type this adapter registers as.
   *
   * JUDGMENT CALL: `'fw1'` is declared, even though this migration's ambiguity analysis reasoned
   * toward `'custom'`.
   *
   * JUDGMENT CALL: the vocabulary has no product-feed type and none is invented, so {@link
   * IntegrationType} is not widened with a `productFeed` member and no feed method is added to
   * this class or to the contract.
   *
   * JUDGMENT CALL: the base component's empty-string answer is not a fifth vocabulary value, and
   * {@link IntegrationType} must never admit `''`.
   */
  getIntegrationTypes(): IntegrationType {
    return 'fw1';
  }

  /**
   * The adapter's human-readable name.
   */
  getDisplayName(): string {
    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
    // displayname="USA epay" while this method returns "Google".
    // Preserved deliberately; do not fix without a product decision.
    return 'Google';
  }

  /**
   * The adapter's own setting definitions, keyed by setting name.
   *
   * The contract's own doc comment for this member describes a boolean check for a view file
   * [integrationServices/IntegrationInterface.cfc:L76-L79].
   *
   * A FRESH map is returned on every call, mirroring the CFML struct literal, so a caller that
   * mutates the result cannot affect a later call.
   */
  getSettings(): Record<string, SettingDefinition> {
    return {};
  }

  /**
   * The setting definitions this adapter contributes to the platform's settings surface, keyed by
   * setting name.
   */
  getIntegratedSettings(): Record<string, SettingDefinition> {
    return {
      productGoogleProductType: { fieldType: 'select' },
    };
  }

  /**
   * The selectable options for one of this adapter's integrated settings.
   *
   * @param settingName the setting whose options are requested.
   * @returns nothing , on every path.
   */
  getSettingOptions(settingName: string): string[] | undefined {
    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: getSettingOptions
    // declares returntype="array", its only conditional branch has an empty body, and the function
    // contains no return statement anywhere - so it returns null for every input.
    // Preserved deliberately; do not fix without a product decision.
    if (cfEquals(settingName, 'productGoogleProductType')) {
      // The branch is kept structurally present, and empty, because its emptiness is the defect -
      // collapsing it away would hide that the source tests this exact name and then does nothing
      // with the result.
      //
      // CFML parity [integrationServices/google/Integration.cfc:L74]: CFML `eq` is
      // case-insensitive, so the legacy engine matched 'PRODUCTGOOGLEPRODUCTTYPE' just as readily;
      // `cfEquals` is used rather than a language operator, which would silently narrow that.
    }

    // JUDGMENT CALL: the fall-through is written as an explicit `return undefined` rather than as
    // an implicit fall-off the end of the function.
    return undefined;
  }

  /**
   * The adapter's event-handler identifiers.
   *
   * INHERITED, not declared: the Google component does not override this member, so it answers
   * with the base default `return [];` [integrationServices/BaseIntegration.cfc:L67-L69].
   *
   * The contract declares `returntype="array"` [integrationServices/IntegrationInterface.cfc:L82],
   * which the target follows; its doc comment describes a coldspring xml string instead
   * [integrationServices/IntegrationInterface.cfc:L83-L85].
   */
  getEventHandlers(): string[] {
    return [];
  }

  /**
   * The markup this adapter contributes to the legacy admin navigation bar.
   *
   * INHERITED, not declared, and not a contract member: only the base component declares it
   * [integrationServices/BaseIntegration.cfc:L71-L73], where the body is `return '';`.
   *
   * The empty string is the legacy answer and is a contract stub rather than a user-interface
   * concern: this adapter contributes no admin navigation.
   */
  getAdminNavbarHTML(): string {
    return '';
  }
}
