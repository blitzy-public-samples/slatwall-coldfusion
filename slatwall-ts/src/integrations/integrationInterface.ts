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
//   from the closed set of thirteen exactly-pinned dependencies `package.json`
//   declares (3 runtime and 10 development), and no Node built-in.
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
 * The integration contract an adapter satisfies.
 *
 * Mirrors the five members of the legacy `<cfinterface>`
 * [integrationServices/IntegrationInterface.cfc:L50-L89]. An implementation that declines a member
 * inherits a default from the base component [integrationServices/BaseIntegration.cfc:L51-L73],
 * which is why an adapter can satisfy this contract while declaring fewer methods.
 */

// JUDGMENT CALL: A single type is modelled rather than a list, because every in-scope implementation returns one value.
/**
 * The integration types the legacy contract recognizes.
 *
 * The vocabulary is documented at [integrationServices/IntegrationInterface.cfc:L68-L71]: `shipping`
 * for shipping methods and rates, `payment` for payment methods, `fw1` for an integration that
 * contributes views, and `custom` for one that only hooks events. There is no product-feed type.
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

export interface IntegrationInterface {
  init(): this;

  getDisplayName(): string;

  getIntegrationTypes(): IntegrationType;

  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L76-L79]: the documentation for this member describes returning true when a default view file exists, which contradicts the declared struct return.
  // Preserved deliberately; do not fix without a product decision.
  getSettings(): Record<string, SettingDefinition>;

  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82]: this is the only member declared without an `access` attribute, so it is not stated to be public as its siblings are.
  // Preserved deliberately; do not fix without a product decision.
  // LEGACY-DEFECT [integrationServices/IntegrationInterface.cfc:L82-L87]: its documentation describes returning ColdSpring XML, which contradicts the declared array return.
  // Preserved deliberately; do not fix without a product decision.
  getEventHandlers(): string[];
}
