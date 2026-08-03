// ---------------------------------------------------------------------------
// The Google integration adapter.
//
// TypeScript port of [integrationServices/google/Integration.cfc:L49-L79], the concrete CFML
// component through which Slatwall registers its Google product-feed subsystem. A SECONDARY
// ADAPTER: it implements the contract in src/integrations/integrationInterface.ts and carries, as
// ordinary members, the two base-component defaults the legacy `extends` relationship supplied.
// Every one of its eight members answers with a constant; the class declares no field, reads no
// clock, opens no connection and consults no configuration.
//
// The source component's tag attributes - `accessors="true"`, `output="false"` and the `extends` /
// `implements` dotted paths [integrationServices/google/Integration.cfc:L49] - are CFML component
// metadata and are not carried over: `accessors` generated getters for declared properties and this
// component declares none, and `output="false"` suppressed whitespace in generated markup.
// `implements IntegrationInterface` below is the compiler check that the CFML attribute only
// asserted.
//
// MEMBER PARITY IS THE ACCEPTANCE CONTRACT, so every member name is the legacy name verbatim. Every
// member is synchronous - the async boundary in this port opens only where a legacy body reached
// the DAO or the ORM, and each of these returns a literal.
//
//   [integrationServices/google/Integration.cfc:L51-L53] init                  any
//   [integrationServices/google/Integration.cfc:L55-L57] getIntegrationTypes   string
//   [integrationServices/google/Integration.cfc:L59-L61] getDisplayName        string
//   [integrationServices/google/Integration.cfc:L63-L65] getSettings           struct
//   [integrationServices/google/Integration.cfc:L67-L71] getIntegratedSettings struct
//   [integrationServices/google/Integration.cfc:L73-L77] getSettingOptions     array
//   [integrationServices/BaseIntegration.cfc:L67-L69]    getEventHandlers      array
//   [integrationServices/BaseIntegration.cfc:L71-L73]    getAdminNavbarHTML    string
//
// EIGHT MEMBERS, NOT NINE: six declared on the component
// [integrationServices/google/Integration.cfc:L51-L77] and two inherited from the base
// [integrationServices/BaseIntegration.cfc:L67-L73]. Read another way, five are contract members
// declared on [integrationServices/IntegrationInterface.cfc:L50-L89], two are Google-only extras
// absent from the interface (getIntegratedSettings, getSettingOptions), and one is a base-only
// default: getAdminNavbarHTML, declared only on [integrationServices/BaseIntegration.cfc:L71-L73]
// and therefore deliberately absent from src/integrations/integrationInterface.ts, where adding it
// would misstate what the legacy interface required of its implementors. This file owns all eight;
// the contract file owns the five.
//
// FEED GENERATION IS DELIBERATELY NOT AMONG THEM, and that is the whole discrepancy with any
// nine-member reading of this adapter. The legacy component contains no feed logic: the entrypoint
// is [integrationServices/google/controllers/feed.cfc:L58], the query
// [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75] and the rendering
// [integrationServices/google/views/feed/product.cfm], none of which is reachable from the
// component. In the target that capability is declared as its own port in the domain layer.
//
// TWO PRESERVED DEFECTS LIVE IN THIS FILE, AND ONLY IN THIS FILE - the display-name contradiction
// [integrationServices/google/Integration.cfc:L49 versus L59-L61], and getSettingOptions returning
// null for every input [integrationServices/google/Integration.cfc:L73-L77]. Both are annotated at
// their sites below, and no other module in this port annotates either, so those markers are the
// single record of them. The source component carries no deferred-work marker of its own.
//
// THE ADAPTER PERFORMS NO LIVE GOOGLE CALL AND NEEDS NO CREDENTIAL, because the legacy component
// does not either: its bodies contain no transport, no authentication and no configuration read.
// The four string literals below - 'fw1', 'Google', 'productGoogleProductType' and 'select' - are
// preserved legacy output and metadata values, not configuration, and must never become settings,
// constructor arguments or lookups.
// ---------------------------------------------------------------------------

import type {
  IntegrationInterface,
  IntegrationType,
  SettingDefinition,
} from '../integrationInterface.js';
import { cfEquals } from '../../lib/cfml/struct.js';

/**
 * The Google integration adapter.
 *
 * A direct port of [integrationServices/google/Integration.cfc:L49-L79]. The eight members below
 * are the complete surface, in the source's own declaration order with the two inherited defaults
 * appended, under the source's own names.
 *
 * JUDGMENT CALL: the exported class is named `GoogleIntegration`, not the source's bare
 * `Integration`. Interface parity binds METHOD names, all eight of which are carried over verbatim;
 * it does not bind the type name, because CFML never had one to bind - the legacy component's
 * identity is its dotted path, `Slatwall.integrationServices.google.Integration`, of which
 * `Integration` is only the final segment. Seventeen adapter folders under `integrationServices/`
 * each declare their own `Integration.cfc` and only this one is in scope, so the qualified name
 * keeps the adapter distinguishable both from its siblings and from the `IntegrationInterface` it
 * implements.
 *
 * JUDGMENT CALL: the contract is implemented directly and the two inherited defaults are inlined as
 * ordinary members, rather than reproducing `extends BaseIntegration` as a TypeScript base class.
 * [integrationServices/BaseIntegration.cfc:L49-L74] supplies six defaults and this component
 * overrides four of them [integrationServices/google/Integration.cfc:L51-L65], so only
 * `getEventHandlers` and `getAdminNavbarHTML` are genuinely inherited unchanged. A base class
 * carrying two constant-returning members would buy nothing and cost something specific:
 * `noImplicitOverride` would demand an `override` keyword on four members that have no legacy
 * counterpart for it, and the surface a reviewer must diff against the CFML would be split across
 * two files. It would also model an inheritance chain that does not survive the port - the CFML
 * base itself extends `Slatwall.org.Hibachi.HibachiObject`
 * [integrationServices/BaseIntegration.cfc:L49], and org/Hibachi/** is a boundary this migration
 * extracts from and never ports.
 */
export class GoogleIntegration implements IntegrationInterface {
  /**
   * Initialises the adapter and returns it.
   *
   * Ported from [integrationServices/google/Integration.cfc:L51-L53], whose body is `return this;`
   * and whose declared `returntype="any"` carried no type discipline. The base default
   * [integrationServices/BaseIntegration.cfc:L51-L53] is byte-identical, so the legacy override
   * changed nothing; it is reproduced because the component declares it.
   *
   * The return is the polymorphic `this` rather than the interface type, which preserves the
   * caller's concrete type through the call so this adapter's two extras stay reachable on the
   * result. There is nothing to initialise: the class declares no field.
   */
  init(): this {
    return this;
  }

  /**
   * The integration type this adapter registers as.
   *
   * Ported from [integrationServices/google/Integration.cfc:L55-L57], whose body is
   *   `return "fw1";`.
   * See {@link IntegrationType} for the four permitted values, documented as prose at
   * [integrationServices/IntegrationInterface.cfc:L68-L71].
   *
   * JUDGMENT CALL: `'fw1'` is declared, even though this migration's ambiguity analysis reasoned
   * toward `'custom'`. The tension is real: this adapter is a product feed, the vocabulary
   * describes `fw1` as an integration that can have custom views and `custom` as one that hooks
   * events with no views, so on the descriptions alone neither is a natural fit. THE SOURCE IS
   * AUTHORITATIVE AND THE SOURCE DECLARES `"fw1"`, which is the value a reviewer can diff against
   * [integrationServices/google/Integration.cfc:L55-L57]. Substituting `'custom'` would silently
   * change how the platform classifies this adapter, because the legacy engine keys view resolution
   * off this value - which is why the feed subsystem has views at all.
   *
   * JUDGMENT CALL: the vocabulary has no product-feed type and none is invented, so
   * {@link IntegrationType} is not widened with a `productFeed` member and no feed method is added
   * to this class or to the contract.
   *
   * JUDGMENT CALL: the base component's empty-string answer is not a fifth vocabulary value, and
   * {@link IntegrationType} must never admit `''`.
   * [integrationServices/BaseIntegration.cfc:L59-L61] returns `""`, which is not one of the four
   * documented types but a placeholder for "an adapter that has not answered yet". Admitting `''`
   * into the union would leave every consumer's exhaustive handling permanently incomplete in order
   * to model a value the vocabulary never had. This class overrides the member outright, so the
   * empty value is unreachable from here anyway.
   */
  getIntegrationTypes(): IntegrationType {
    return 'fw1';
  }

  /**
   * The adapter's human-readable name.
   *
   * Ported from [integrationServices/google/Integration.cfc:L59-L61], whose body is
   *   `return "Google";`.
   * The contract documents the member as returning the display name the integration should have
   * [integrationServices/IntegrationInterface.cfc:L57-L60], and the base default is the placeholder
   * "Not Defined" [integrationServices/BaseIntegration.cfc:L55-L57], which this override replaces.
   */
  getDisplayName(): string {
    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
    // displayname="USA epay" while this method returns "Google".
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // The attribute is a copy-paste artefact from the USAePay payment adapter, which really does
    // exist at integrationServices/usaepay/ and is out of scope here. The two signals contradict
    // each other outright and the target has to follow one.
    //
    // THIS METHOD IS AUTHORITATIVE. `getDisplayName()` is the contract member
    // [integrationServices/IntegrationInterface.cfc:L56-L61]; every caller wanting a display name
    // calls it, and it answers "Google". The tag attribute is component metadata that no in-scope
    // caller consults, so following the method reproduces observable behaviour exactly while
    // following the attribute would change it. The tag's value is named in the marker above so a
    // reader can see what disagrees with what, and that is the only place it appears: it is never
    // emitted, no member returns it, and the attribute is not ported as a field.
    return 'Google';
  }

  /**
   * The adapter's own setting definitions, keyed by setting name.
   *
   * Ported from [integrationServices/google/Integration.cfc:L63-L65], whose body is `return {};` -
   * identical to the base default [integrationServices/BaseIntegration.cfc:L63-L65]. An empty map
   * is a legitimate answer rather than a missing one: this adapter contributes no setting of its
   * own and contributes one INTEGRATED setting instead, through
   * {@link GoogleIntegration.getIntegratedSettings}.
   *
   * The contract's own doc comment for this member describes a boolean check for a view file
   * [integrationServices/IntegrationInterface.cfc:L76-L79], a copy-paste error recorded in
   * src/integrations/integrationInterface.ts. The declared `returntype="struct"`, the base default
   * and this component's body all agree that a struct is meant.
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
   *
   * Ported from [integrationServices/google/Integration.cfc:L67-L71]. One of the two
   * Google-specific extras: the component declares it and the `<cfinterface>` does not.
   *
   * EXACTLY ONE ENTRY, and exactly one property on it. The legacy body is
   *   `productGoogleProductType = {fieldType="select"}`,
   * which is also the only evidence anywhere in the legacy slice of what a setting definition
   * contains - hence {@link SettingDefinition} declaring `fieldType` and nothing else. No label,
   * default, requiredness flag, option list, sort order or validation rule is invented, however
   * natural such a field would look: each would be a requirement with no source line for a reviewer
   * to check it against.
   *
   * A fresh map is returned per call, for the reason given at
   * {@link GoogleIntegration.getSettings}.
   */
  getIntegratedSettings(): Record<string, SettingDefinition> {
    return {
      productGoogleProductType: { fieldType: 'select' },
    };
  }

  /**
   * The selectable options for one of this adapter's integrated settings.
   *
   * Ported from [integrationServices/google/Integration.cfc:L73-L77]. The second of the two
   * Google-specific extras, and the member carrying the second preserved defect - see the marker in
   * the body.
   *
   * @param settingName - the setting whose options are requested. Named and typed exactly as
   *   the legacy `required string settingName`
   *   [integrationServices/google/Integration.cfc:L73].
   * @returns nothing, on every path. Reproducing that is the point.
   */
  getSettingOptions(settingName: string): string[] | undefined {
    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: getSettingOptions
    // declares returntype="array", its only conditional branch has an empty body, and the function
    // contains no return statement anywhere - so it returns null for every input, including the one
    // setting name it tests.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // The legacy body is a single `if` on the setting name whose body is blank
    // [integrationServices/google/Integration.cfc:L74-L76], followed by the end of the function.
    // CFML returns null when execution falls off the end and does not enforce the declared
    // `returntype` on that path, so the behaviour wins: no caller has ever received an array from
    // this method, not even by asking for 'productGoogleProductType'.
    //
    // Reproduced exactly, and nothing is returned on either path. Populating the options would
    // invent a feature, since no source anywhere says what those values would be. Returning an
    // empty array would be worse, because it silently converts "this method never answers" into
    // "this setting has no options", which a caller cannot tell apart from a real empty answer.
    // Throwing would turn a long-standing quiet no-answer into a server error.
    if (cfEquals(settingName, 'productGoogleProductType')) {
      // The branch is kept structurally present, and empty, because its emptiness IS the defect -
      // collapsing it away would hide that the source tests this exact name and then does nothing
      // with the result.
      //
      // CFML parity [integrationServices/google/Integration.cfc:L74]: CFML `eq` is
      // case-insensitive, so the legacy engine matched 'PRODUCTGOOGLEPRODUCTTYPE' just as readily;
      // `cfEquals` is used rather than a language operator, which would silently narrow that, so
      // the branch is reached for the same inputs as before.
      //
      // `cfEquals` raises for a nullish operand, as CFML does when a null reaches `eq`, but that
      // branch is unreachable here: `settingName` is a definite `string` (the legacy parameter is
      // `required string settingName` [integrationServices/google/Integration.cfc:L73], and
      // `strict` with no `any` in `src/**` means no caller can pass nullish) and the right operand
      // is a literal. It is deliberately NOT guarded - a guard would invent behaviour for a state
      // that cannot occur, in a method whose entire point is that it invents nothing.
    }

    // JUDGMENT CALL: the fall-through is written as an explicit `return undefined` rather than as
    // an implicit fall-off the end of the function. The legacy function has no return statement at
    // all and TypeScript would accept the same shape, since `undefined` is in the declared union.
    // Two things settle it the other way: a reader has to be able to see that BOTH paths yield
    // nothing - that is the defect - and an implicit fall-off makes that visible only to someone
    // who already knows the rule; and a literal transliteration of CFML control flow is not what
    // this port is for. The returned value is identical either way.
    return undefined;
  }

  /**
   * The adapter's event-handler identifiers.
   *
   * INHERITED, not declared: the Google component does not override this member, so it answers with
   * the base default `return [];` [integrationServices/BaseIntegration.cfc:L67-L69].
   *
   * The contract declares `returntype="array"` [integrationServices/IntegrationInterface.cfc:L82],
   * which the target follows; its doc comment describes a coldspring xml string instead
   * [integrationServices/IntegrationInterface.cfc:L83-L85], the second copy-paste error recorded in
   * src/integrations/integrationInterface.ts. The element type is `string` because the framework
   * resolved handlers by name.
   *
   * An empty array is this adapter's real answer, not a placeholder: it hooks into no platform
   * event. A fresh array is returned per call.
   */
  getEventHandlers(): string[] {
    return [];
  }

  /**
   * The markup this adapter contributes to the legacy admin navigation bar.
   *
   * INHERITED, not declared, and NOT a contract member: only the base component declares it
   * [integrationServices/BaseIntegration.cfc:L71-L73], where the body is `return '';`. It is
   * implemented here for surface completeness and is deliberately absent from
   * src/integrations/integrationInterface.ts - see this module's header.
   *
   * The empty string is the legacy answer and is a contract stub rather than a user-interface
   * concern: this adapter contributes no admin navigation, and the presentation subsystems are out
   * of scope for this migration.
   */
  getAdminNavbarHTML(): string {
    return '';
  }
}
