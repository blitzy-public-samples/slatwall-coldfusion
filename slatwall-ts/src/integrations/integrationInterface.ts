// The integration contract.
//
// TypeScript port of the CFML `<cfinterface>` at
// [integrationServices/IntegrationInterface.cfc:L50-L89]: one exported interface plus its two
// supporting types, with no runtime footprint.
//
// [integrationServices/BaseIntegration.cfc:L49-L74] supplies six zero-argument defaults, which is
// why an adapter can satisfy this contract while declaring fewer methods.
//
// JUDGMENT CALL: an empty CFML declaration has no body, so where two signals in the source
// contradict each other the target follows the declared return type rather than the prose. The
// three affected members carry the detail.

// JUDGMENT CALL: A single type is modelled rather than a list, because every in-scope
// implementation returns one value.
/**
 * The integration types the legacy contract recognizes.
 *
 * The vocabulary is documented at [integrationServices/IntegrationInterface.cfc:L68-L71]:
 * `shipping` for shipping methods and rates, `payment` for payment methods, `fw1` for an
 * integration that contributes views.
 */
export type IntegrationType = 'shipping' | 'payment' | 'fw1' | 'custom';

/**
 * One setting an integration contributes.
 *
 * `fieldType` is the only key the in-scope adapter sets
 * [integrationServices/google/Integration.cfc:L69]; the legacy definitions are open structs whose
 * other keys are read by the admin.
 */
export interface SettingDefinition {
  fieldType: string;
}

/**
 * The integration contract an adapter satisfies.
 *
 * Mirrors the five members of the legacy `<cfinterface>`
 * [integrationServices/IntegrationInterface.cfc:L50-L89].
 */
export interface IntegrationInterface {
  init(): this;

  getDisplayName(): string;

  getIntegrationTypes(): IntegrationType;

  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L76-L79]: this member's
  // documentation describes returning true when a default view file exists, contradicting the
  // declared struct return at [integrationServices/IntegrationInterface.cfc:L75].
  // Preserved deliberately; do not fix without a product decision.
  getSettings(): Record<string, SettingDefinition>;

  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82]: this is the only member
  // declared without an `access` attribute, so it is not stated to be public as its siblings at
  // [integrationServices/IntegrationInterface.cfc:L52, L56, L63, L75] are.
  // Preserved deliberately; do not fix without a product decision.
  //
  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82-L87]: its documentation
  // describes returning ColdSpring XML, contradicting the declared array return.
  // Preserved deliberately; do not fix without a product decision.
  getEventHandlers(): string[];
}
