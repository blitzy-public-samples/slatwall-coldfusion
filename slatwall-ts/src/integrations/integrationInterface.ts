// ---------------------------------------------------------------------------
// slatwall-ts - the integration contract
//
// WHAT THIS MODULE IS
//   The TypeScript port of the CFML `<cfinterface>` at
//   [integrationServices/IntegrationInterface.cfc:L50-L89] - the contract every
//   Slatwall integration adapter implements. It is a pure declaration module:
//   one exported interface plus its two co-located supporting types. There is no
//   class here, no implementation, no constant, no function and no runtime code
//   of any kind, so the module has no runtime footprint at all and nothing in it
//   can be mocked, stubbed or spied on - there is simply nothing to execute.
//
// THE PORTED SURFACE, MEMBER FOR MEMBER
//   Interface parity is the acceptance contract for this migration, so the five
//   member names are the legacy CFML names verbatim in camelCase. A reviewer can
//   diff this surface against the source declaration by declaration:
//
//     [IntegrationInterface.cfc:L52-L54]  init                 any    -> init(): this
//     [IntegrationInterface.cfc:L56-L61]  getDisplayName       string -> getDisplayName(): string
//     [IntegrationInterface.cfc:L63-L73]  getIntegrationTypes  string -> getIntegrationTypes(): IntegrationType
//     [IntegrationInterface.cfc:L75-L80]  getSettings          struct -> getSettings(): Record<string, SettingDefinition>
//     [IntegrationInterface.cfc:L82-L87]  getEventHandlers     array  -> getEventHandlers(): string[]
//
//   Five members, and five only. Every one is parameterless in the source and is
//   therefore parameterless here, and every one stays synchronous: the async
//   boundary in this port opens only where a legacy body reached the DAO or the
//   ORM, and each of these declarations has an empty body. Nothing was renamed,
//   nothing was reshaped, and no member was added - an idiomatic-TypeScript
//   rename such as `displayName` or `eventHandlers` would break the very parity
//   this file exists to make checkable.
//
//   Being idiomatic and being faithful are not in tension here. The shape of the
//   contract is carried over exactly; the CFML mechanics that expressed it are
//   not. There is no attempt to emulate `<cffunction>` tags, no `access`
//   modifier smuggled in as pseudo-syntax, and no type named after a CFML
//   primitive - a `struct` return became a dictionary with a named value type,
//   not a type called `Struct`.
//
// THE SIXTH DEFAULT, WHICH IS NOT PART OF THIS CONTRACT
//   [integrationServices/BaseIntegration.cfc:L49-L74] supplies six
//   zero-argument defaults that a concrete adapter inherits:
//
//     init()                -> this           [BaseIntegration.cfc:L51-L53]
//     getDisplayName()      -> "Not Defined"  [BaseIntegration.cfc:L55-L57]
//     getIntegrationTypes() -> ""             [BaseIntegration.cfc:L59-L61]
//     getSettings()         -> {}             [BaseIntegration.cfc:L63-L65]
//     getEventHandlers()    -> []             [BaseIntegration.cfc:L67-L69]
//     getAdminNavbarHTML()  -> ''             [BaseIntegration.cfc:L71-L73]
//
//   The first five line up with the interface members above. The sixth,
//   `getAdminNavbarHTML()` [BaseIntegration.cfc:L71-L73], is declared ONLY on
//   the base component - the `<cfinterface>` never mentions it. It is therefore
//   a non-interface base default: part of a concrete adapter's surface, and
//   deliberately NOT a member of this contract. Declaring it here would
//   misrepresent what the legacy interface required of its implementors, so it
//   is documented instead. That documentation is the whole of the "+ inherited
//   default" this file owes; the member itself belongs to the adapter.
//
// THE PRODUCT-FEED MISMATCH - DOCUMENTED, NOT PAPERED OVER
//   This contract cannot carry a product feed. That is worth stating plainly,
//   because the one adapter in scope IS a product feed.
//
//   The vocabulary [IntegrationInterface.cfc:L68-L71] documents exactly four
//   integration types - shipping, payment, fw1, custom - and not one of them is
//   a feed. The legacy Google adapter resolves that by registering itself as
//   "fw1" [integrationServices/google/Integration.cfc:L55-L57], the type whose
//   own description is about having custom views, and its feed logic lives
//   nowhere near this interface:
//
//     [integrationServices/google/controllers/feed.cfc:L58]      the entrypoint
//     [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75] the query
//     [integrationServices/google/views/feed/product.cfm]        the rendering
//
//   So the interface never described feed generation, and this port does not
//   pretend it did. Feed generation is declared separately, as its own port in
//   the domain layer, and is implemented by the Google feed service in the
//   sibling `google/` folder. Naming those consumers is deliberately prose and
//   not code: this module imports nothing (see below), and a comment that
//   mentions a module is not a dependency on it.
//
//   Two consequences bind every future change to this file. The vocabulary must
//   never gain an invented `productFeed` value - the honest fit for the adapter
//   is what the source actually declares. And no feed method may ever be added
//   here, under any name.
//
// THREE LATENT INCONSISTENCIES IN THE SOURCE DECLARATION
//   Reading the `<cfinterface>` line by line surfaces three internal
//   inconsistencies. All three are recorded, and none is repaired in the legacy
//   file - this migration modifies no existing repository file, and the folder
//   these sources sit in is precisely the one where an obliging in-place "fix"
//   would do the most damage: the CFML monolith keeps running, and the `google`
//   subsystem still routes through it.
//
//   An empty CFML declaration has no body, so there is no behaviour here to
//   preserve or to alter. What is actually at stake in each case is narrower:
//   two signals in the source contradict each other, and the target has to
//   follow one of them. Which one, and why, is stated for each.
// ---------------------------------------------------------------------------

// LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82]: getEventHandlers declares no access attribute.
// Preserved deliberately; do not fix without a product decision.
//
// Its four siblings all declare access="public"
// [integrationServices/IntegrationInterface.cfc:L52, L56, L63, L75]; L82 alone
// omits it. CFML defaults an omitted access attribute to public, so the
// practical effect is nil and the asymmetry is cosmetic. The target types all
// five members identically, as members of a TypeScript interface, where every
// member is public by definition and the distinction cannot be expressed at
// all - which is why this one resolves itself rather than needing a decision.

// LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L76-L79]: getSettings doc comment describes a boolean view-file check.
// Preserved deliberately; do not fix without a product decision.
//
// The prose reads "This method should return true only if there is a
// /views/main/default.cfm file inside of the integration service" - a
// copy-paste error. It describes a boolean test about a view file and has
// nothing to do with settings, contradicting the member's own
// returntype="struct" [integrationServices/IntegrationInterface.cfc:L75] and
// contradicting the base default `return {};`
// [integrationServices/BaseIntegration.cfc:L63-L65]. The declared type and the
// base default agree with each other, and the sole in-scope implementor agrees
// with them too [integrationServices/google/Integration.cfc:L63-L65]. THE
// TARGET FOLLOWS THE DECLARED STRUCT RETURN, NOT THE ERRONEOUS PROSE: hence
// `getSettings(): Record<string, SettingDefinition>` and not a boolean.

// LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82-L87]: getEventHandlers doc comment describes coldspring xml, not an array.
// Preserved deliberately; do not fix without a product decision.
//
// The declaration says returntype="array"
// [integrationServices/IntegrationInterface.cfc:L82] while its own doc comment
// says the method "should return a valid coldspring xml that overrides the
// default xml" [integrationServices/IntegrationInterface.cfc:L83-L85] - that is,
// a string. Once again the declared type and the base default agree with each
// other and disagree with the prose: `return [];`
// [integrationServices/BaseIntegration.cfc:L67-L69] is an array. THE TARGET
// FOLLOWS THE DECLARED ARRAY RETURN: hence `getEventHandlers(): string[]`.

// ---------------------------------------------------------------------------
// WHY THIS MODULE IMPORTS NOTHING
//   Zero imports, of any kind - no first-party module, no third-party package
//   from the closed set of fourteen pinned dependencies, and no Node built-in.
//   A contract that named a concrete collaborator would stop being a contract,
//   and the two supporting types below exist precisely so that an implementor
//   needs nothing else. There is no transport concept here, no authentication
//   concept, and no credential concept, because the contract genuinely has
//   none: the legacy interface declared five empty methods and nothing more.
//
// WHO CONSUMES IT
//   Stated declaratively, because none of these modules is imported here and
//   this file must never import them. The concrete Google adapter in the
//   sibling `google/` folder implements this interface and takes both
//   supporting types from this module - one dependency edge, pointing upward
//   out of `google/` into this file. The reverse edge must never exist, which
//   is what keeps the folder acyclic. Binding an adapter to a port happens in
//   the composition root, not here.
//
// NO USER RULES WERE PROVIDED
//   The project rules document says exactly that, and the plan states it
//   outright. So no rule governs this file, no rule is invented to fill the
//   gap, and the absence is not treated as license to lower the bar. The
//   enterprise substitute standard applies at full strength: maximal
//   strictness, no `any` and no suppression comment anywhere, one principal
//   exported unit with its supporting types co-located, no barrel and no
//   re-export, no credential of any kind, and every judgment call annotated at
//   the point where it was made.
//
// TEST COVERAGE IS NET-NEW
//   `meta/tests/` contains nothing at all for the integration surface: the only
//   legacy suites extended anywhere in this port are
//   meta/tests/unit/entity/BrandTest.cfc and
//   meta/tests/unit/entity/ProductTest.cfc, neither of which touches an
//   integration. Coverage for this contract and for the Google adapter is
//   therefore net-new and must never be presented as parity with legacy tests.
//   The test tier is authored separately; what this module owes it is to be
//   trivially testable, which a declaration module with no runtime footprint
//   already is.
//
// LICENSE CONTINUITY
//   Slatwall is GPL v3.0 [readme.md:L20], Copyright (C) ten24, LLC
//   [readme.md:L32-L33]. The readme grants a special exception for custom code
//   [readme.md:L53-L57], but its guideline list names exactly one permitted
//   directory - the literal /integrationServices/ at [readme.md:L65], reached
//   through [readme.md:L63-L64]. This subtree is `slatwall-ts/`, which is not
//   that path, so the special exception does NOT extend here and standard GPL
//   v3.0 terms apply. That distinction bites hardest in this very folder,
//   because this is the one place lifting logic out of /integrationServices/,
//   where the exception applied, into a location where it does not. Attribution
//   is carried forward in slatwall-ts/NOTICE-GPL.md; no license text is
//   reproduced here.
// ---------------------------------------------------------------------------

/**
 * The documented integration-type vocabulary, expressed as a union.
 *
 * The legacy member is a plain `returntype="string"`
 * [integrationServices/IntegrationInterface.cfc:L63]; the permitted values exist
 * only as prose in its doc comment
 * [integrationServices/IntegrationInterface.cfc:L68-L71]. Making them a type is
 * the point of this declaration - a mistyped integration type stops being a
 * runtime surprise and becomes a compile error.
 *
 * The four values, with the source's own descriptions carried over faithfully.
 * The spelling "ect." at [integrationServices/IntegrationInterface.cfc:L70] is
 * the source's, quoted rather than corrected:
 *
 * - `shipping` - "When set this integration will be able to be used by shipping
 *   methods / rates"
 * - `payment` - "When set this integration will be able to be used by payment
 *   methods"
 * - `fw1` - "When set then this integration can have custom views, ect."
 * - `custom` - "This is defined when all you want to do is hook into events, but
 *   no views or anything else."
 *
 * The set is closed at exactly these four members, and two specific additions
 * are ruled out rather than merely unmentioned:
 *
 * - No `productFeed`. There is no feed type in the source vocabulary, even
 *   though the one in-scope adapter is a product feed; that mismatch is
 *   documented in this module's header and is resolved by declaring feed
 *   generation as a separate capability, never by extending this union.
 * - No empty string. `getIntegrationTypes()` returns `""` on the base component
 *   [integrationServices/BaseIntegration.cfc:L59-L61], but that is a
 *   placeholder for "an adapter that has not answered yet", not a fifth
 *   vocabulary value - the concrete adapter always overrides it
 *   [integrationServices/google/Integration.cfc:L55-L57]. Admitting `''` here
 *   would make every implementor's exhaustive handling of this union
 *   permanently incomplete in order to model a value the vocabulary never had.
 */
export type IntegrationType = 'shipping' | 'payment' | 'fw1' | 'custom';

/**
 * One entry in the map returned by {@link IntegrationInterface.getSettings}.
 *
 * The legacy return is an untyped CFML `struct`
 * [integrationServices/IntegrationInterface.cfc:L75], so the only evidence
 * anywhere in the legacy source of what a setting definition actually contains
 * is a single literal:
 *
 *     { productGoogleProductType = {fieldType="select"} }
 *
 * from [integrationServices/google/Integration.cfc:L67-L71]. That literal
 * populates exactly one key, `fieldType`, and nothing else. This interface
 * therefore declares exactly one property. No `label`, `defaultValue`,
 * `required`, `options`, `sortOrder` or `validation` field is invented, however
 * natural such a field would look: every one of them would be a requirement
 * this migration made up, and a reviewer diffing this type against the source
 * would have no line to check it against.
 *
 * `fieldType` is typed `string` rather than the one-member union `'select'`,
 * which is the wider of the two honest options and is chosen deliberately.
 * `'select'` is the only value ever OBSERVED, but it is observed in a single
 * literal belonging to a single adapter, and this interface is the generic
 * contract that every Slatwall integration implements - only the Google adapter
 * is in scope, yet the contract is not Google-specific. Narrowing a generic
 * contract to one adapter's one observed value would encode a coincidence as a
 * constraint, and would reject a conforming adapter for declaring a field type
 * the legacy engine accepted. The narrow value is documented above instead,
 * which keeps the evidence visible without hard-coding it.
 */
export interface SettingDefinition {
  /**
   * The kind of form control this setting is rendered as.
   *
   * The sole observed value is `'select'`
   * [integrationServices/google/Integration.cfc:L67-L71]. It is required, not
   * optional, because it is the only key the legacy literal contains - a
   * setting definition with no field type has no counterpart in the source.
   */
  fieldType: string;
}

/**
 * The contract every Slatwall integration adapter implements.
 *
 * A direct port of the `<cfinterface>` at
 * [integrationServices/IntegrationInterface.cfc:L50-L89]. The five members below
 * are the complete contract, in the source's own declaration order, under the
 * source's own names. Defaults for all five are supplied by the base component
 * [integrationServices/BaseIntegration.cfc:L49-L74], which also supplies a sixth
 * zero-argument default, `getAdminNavbarHTML()`
 * [integrationServices/BaseIntegration.cfc:L71-L73], that the `<cfinterface>`
 * never declares and that is consequently not a member here - see this module's
 * header for the reasoning.
 */
export interface IntegrationInterface {
  /**
   * Initialises the adapter and returns it.
   *
   * Ported from [integrationServices/IntegrationInterface.cfc:L52-L54], whose
   * declaration is `returntype="any"` with an empty body and no documentation.
   * The return is typed as the polymorphic `this` rather than as the interface,
   * because both known bodies return the instance itself
   * [integrationServices/BaseIntegration.cfc:L51-L53],
   * [integrationServices/google/Integration.cfc:L51-L53]. `this` preserves the
   * caller's concrete type through the call, so an adapter's own members stay
   * reachable on the result - which the CFML `any` allowed by having no type
   * discipline at all, and which returning the interface type would silently
   * take away.
   */
  init(): this;

  /**
   * The adapter's human-readable name.
   *
   * Ported from [integrationServices/IntegrationInterface.cfc:L56-L61], whose
   * documentation reads: "This method should return a String with the display
   * name that you would like for the integration to have". A direct map of
   * `returntype="string"`; the base default is "Not Defined"
   * [integrationServices/BaseIntegration.cfc:L55-L57].
   */
  getDisplayName(): string;

  /**
   * The integration type this adapter registers as.
   *
   * Ported from [integrationServices/IntegrationInterface.cfc:L63-L73]. See
   * {@link IntegrationType} for the four permitted values and the source's
   * description of each.
   *
   * A DELIBERATE NARROWING, recorded because silence would read as an oversight.
   * The source documents the return as "a comma seperated list of the
   * integration types that it supports"
   * [integrationServices/IntegrationInterface.cfc:L65] - the spelling
   * "seperated" is the source's, quoted rather than corrected - so a CFML
   * implementor could in principle have answered with several types in one
   * string. The target types a SINGLE union member instead of a delimited
   * string or an array, for two reasons. First, a delimited string moves the
   * vocabulary back out of the type system and into a parser, which is exactly
   * what this port is removing. Second, the multi-value case has no instance to
   * preserve: the only in-scope implementor returns the single value "fw1"
   * [integrationServices/google/Integration.cfc:L55-L57], so no information is
   * lost in practice. Should a future adapter genuinely need to register as more
   * than one type, that is a change to this contract - a decision to take
   * openly, not something to leave a loophole for here.
   */
  getIntegrationTypes(): IntegrationType;

  /**
   * The adapter's setting definitions, keyed by setting name.
   *
   * Ported from [integrationServices/IntegrationInterface.cfc:L75-L80], whose
   * `returntype="struct"` is what the target follows. Its doc comment describes
   * something else entirely, which is the copy-paste error recorded in this
   * module's header; the declared type, the base default `return {};`
   * [integrationServices/BaseIntegration.cfc:L63-L65] and the sole in-scope
   * implementor [integrationServices/google/Integration.cfc:L63-L65] all agree
   * that a struct is meant.
   *
   * The CFML struct becomes a dictionary keyed by arbitrary setting name whose
   * VALUE type is named - {@link SettingDefinition} - which is the distinction
   * that matters: the keys are genuinely open, so an interface with fixed
   * property names would be wrong, but the values are not untyped and must never
   * be weakened to `unknown` or to a bare object type. Both known bodies return
   * an empty map, and an empty map is a legitimate answer here rather than a
   * missing one, so the return is not optional.
   */
  getSettings(): Record<string, SettingDefinition>;

  /**
   * The adapter's event-handler identifiers.
   *
   * Ported from [integrationServices/IntegrationInterface.cfc:L82-L87], whose
   * `returntype="array"` is what the target follows - its doc comment describes
   * a coldspring xml string instead, which is the second contradiction recorded
   * in this module's header, and the base default `return [];`
   * [integrationServices/BaseIntegration.cfc:L67-L69] settles it in favour of
   * the array. The element type is `string`, because the framework resolved
   * handlers by name; nothing in the legacy source ever puts a non-string in
   * this array. The sole in-scope implementor does not override the member at
   * all, so it answers with the inherited empty array.
   */
  getEventHandlers(): string[];
}
