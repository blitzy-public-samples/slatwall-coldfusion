// ---------------------------------------------------------------------------
// The integration contract.
//
// TypeScript port of the CFML `<cfinterface>` at
// [integrationServices/IntegrationInterface.cfc:L50-L89]: one exported interface plus its two
// supporting types, with no runtime footprint.
//
// MEMBER PARITY IS THE ACCEPTANCE CONTRACT, so the five names are the legacy names verbatim. Each
// source member is parameterless and has an empty body, so each stays parameterless and synchronous
// here - the async boundary in this port opens only where a legacy body reached the DAO or the ORM.
//
//   [integrationServices/IntegrationInterface.cfc:L52-L54] init                 any
//   [integrationServices/IntegrationInterface.cfc:L56-L61] getDisplayName       string
//   [integrationServices/IntegrationInterface.cfc:L63-L73] getIntegrationTypes  string
//   [integrationServices/IntegrationInterface.cfc:L75-L80] getSettings          struct
//   [integrationServices/IntegrationInterface.cfc:L82-L87] getEventHandlers     array
//
// THE SIXTH BASE DEFAULT IS DELIBERATELY NOT A MEMBER.
// [integrationServices/BaseIntegration.cfc:L49-L74] supplies six zero-argument defaults, which is
// why an adapter can satisfy this contract while declaring fewer methods. Five line up with the
// members above; `getAdminNavbarHTML()` [integrationServices/BaseIntegration.cfc:L71-L73] is
// declared only on the base component and never by the `<cfinterface>`, so declaring it here would
// misstate what the legacy interface required of its implementors.
//
// THIS CONTRACT CANNOT CARRY A PRODUCT FEED, and the one adapter in scope is one. The vocabulary at
// [integrationServices/IntegrationInterface.cfc:L68-L71] documents four types - shipping, payment,
// fw1, custom - and none is a feed, so the legacy Google adapter registers as `fw1`
// [integrationServices/google/Integration.cfc:L55-L57] and keeps its feed logic elsewhere:
// [integrationServices/google/controllers/feed.cfc:L58] is the entrypoint,
// [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75] the query and
// [integrationServices/google/views/feed/product.cfm] the rendering. Feed generation is therefore
// declared as its own port in the domain layer, never here. Two constraints bind every future
// change to this file: the vocabulary must never gain an invented `productFeed` value, and no feed
// method may ever be added under any name.
//
// JUDGMENT CALL: an empty CFML declaration has no body, so where two signals in the source
// contradict each other the target follows the declared return type rather than the prose. The
// three affected members carry the detail.
// ---------------------------------------------------------------------------

// JUDGMENT CALL: A single type is modelled rather than a list, because every in-scope
// implementation returns one value.
/**
 * The integration types the legacy contract recognizes.
 *
 * The vocabulary is documented at [integrationServices/IntegrationInterface.cfc:L68-L71]:
 * `shipping` for shipping methods and rates, `payment` for payment methods, `fw1` for an
 * integration that contributes views, and `custom` for one that only hooks events. There is no
 * product-feed type.
 */
export type IntegrationType = 'shipping' | 'payment' | 'fw1' | 'custom';

/**
 * One setting an integration contributes.
 *
 * `fieldType` is the only key the in-scope adapter sets
 * [integrationServices/google/Integration.cfc:L69]; the legacy definitions are open structs whose
 * other keys are read by the admin, which is outside this slice.
 */
export interface SettingDefinition {
  fieldType: string;
}

/**
 * The integration contract an adapter satisfies.
 *
 * Mirrors the five members of the legacy `<cfinterface>`
 * [integrationServices/IntegrationInterface.cfc:L50-L89]. An implementation that declines a member
 * inherits a default from the base component [integrationServices/BaseIntegration.cfc:L51-L73],
 * which is why an adapter can satisfy this contract while declaring fewer methods.
 */
export interface IntegrationInterface {
  init(): this;

  getDisplayName(): string;

  getIntegrationTypes(): IntegrationType;

  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L76-L79]: this member's
  // documentation describes returning true when a default view file exists, contradicting the
  // declared struct return at [integrationServices/IntegrationInterface.cfc:L75].
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // The declared type, the base default `return {};`
  // [integrationServices/BaseIntegration.cfc:L63-L65] and the sole in-scope implementor
  // [integrationServices/google/Integration.cfc:L63-L65] all agree with one another, so the target
  // follows the declared struct return rather than the erroneous prose.
  getSettings(): Record<string, SettingDefinition>;

  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82]: this is the only member
  // declared without an `access` attribute, so it is not stated to be public as its siblings at
  // [integrationServices/IntegrationInterface.cfc:L52, L56, L63, L75] are.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // CFML defaults an omitted access attribute to public and every member of a TypeScript interface
  // is public by definition, so the asymmetry cannot be expressed here at all.
  //
  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82-L87]: its documentation
  // describes returning ColdSpring XML, contradicting the declared array return.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // The declared type and the base default `return [];`
  // [integrationServices/BaseIntegration.cfc:L67-L69] agree, so the target follows the declared
  // array return.
  getEventHandlers(): string[];
}
