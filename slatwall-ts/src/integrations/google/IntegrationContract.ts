// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

/**
 * IntegrationContract — the TypeScript translation of the Slatwall integration `<cfinterface>`,
 * and the foundational declaration of `src/integrations/google/`.
 *
 * LEGACY ORIGIN (read directly; every claim carries its locator)
 * -------------------------------------------------------------
 * integrationServices/IntegrationInterface.cfc:L50-L89 — the `<cfinterface>` block. A declaration
 * scan of that span returns EXACTLY FIVE members, in this order:
 *
 *   L52  init                 access="public"          return declared as CFML's untyped catch-all
 *   L56  getDisplayName       access="public"          returntype="string"
 *   L63  getIntegrationTypes  access="public"          returntype="string"
 *   L75  getSettings          access="public"          returntype="struct"
 *   L82  getEventHandlers     (no `access` attribute)  returntype="array"
 *
 * L82 is the subtle one: it declares no `access` attribute at all. CFML defaults component
 * function access to public, so it is a full member of the public contract and not an internal
 * helper. Five members is a declaration-scan result, not an assumption — there is no sixth.
 *
 * integrationServices/BaseIntegration.cfc:L51-L69 — the default bodies, which are what fix the
 * honest target types rather than the loose CFML declarations: `return this` (L52),
 * `"Not Defined"` (L56), `""` (L60), `{}` (L64), `[]` (L68).
 *
 * integrationServices/google/Integration.cfc:L49-L71 — the one in-scope adapter. Its component
 * attributes declare `implements="Slatwall.integrationServices.IntegrationInterface"` while also
 * extending the base component, so it satisfies the contract partly through inheritance: it
 * overrides `init` (L51), `getIntegrationTypes` (L55, returning `"fw1"`), `getDisplayName` (L59,
 * returning `"Google"`) and `getSettings` (L63, returning `{}`), and inherits the fifth member
 * unchanged. The target reproduces exactly that shape — `BaseIntegration.ts` implements this
 * interface, and `GoogleIntegration.ts` implements it through that base.
 *
 * AUTHORITY, AND WHICH HALF OF THE LEGACY MECHANISM SURVIVES
 * ---------------------------------------------------------
 * AAP §0.4.1.10 states the target for this file verbatim: "The five-method contract — init,
 * getDisplayName, getIntegrationTypes, getSettings, getEventHandlers — becomes a TypeScript
 * interface." AAP §0.3.3 assigns it the Adapter pattern role, replacing "`<cfinterface>`
 * implemented by a component discovered on the ORM CFC path" with "a TypeScript interface
 * implemented by an adapter class".
 *
 * The CONTRACT is translated; the DISCOVERY is deleted. The legacy framework located integrations
 * by scanning components on the ORM CFC path, and AAP §0.8.3.2 retires that machinery rather than
 * carrying it forward, so its replacement is one explicit `implements` clause written by hand in
 * `GoogleIntegration.ts`. That is why this module holds no registry, no lookup table, no discovery
 * helper and no factory: the mechanism those would serve no longer exists.
 *
 * HOW THIS FOLDER SPLITS THE WORK (orientation for reviewers — AAP §0.6.4)
 * -----------------------------------------------------------------------
 * A reviewer who opens the adapter first will be misled about where the feed logic lives, so the
 * split is recorded here, at the contract every other file in the folder depends on:
 *
 *   GoogleIntegration.ts   nearly empty BY FAITHFULNESS, not by neglect. The legacy
 *                          integrationServices/google/Integration.cfc carries no feed logic
 *                          whatsoever — its contract members return two fixed strings and an
 *                          empty structure.
 *   ProductFeedQuery.ts    owns record selection, ported from
 *                          integrationServices/google/controllers/feed.cfc.
 *   ProductFeedBuilder.ts  owns all RSS field shaping, ported from
 *                          integrationServices/google/views/feed/product.cfm. This is where the
 *                          real work of the feed lands.
 *   README.md              carries the feed route, and the evidence that
 *                          integrationServices/google/model/dao/FeedDAO.cfc is unreachable,
 *                          syntactically broken code with zero callers and is deliberately not
 *                          ported.
 *
 * ARCHITECTURAL POSITION (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------
 * This module declares ZERO imports, and it is the one file in the folder that must make that
 * claim unconditionally: a contract that reached for a collaborator would invert the dependency
 * direction of every file implementing it. Concretely, and all deliberate:
 *
 *   - No sibling module, no port, no adapter, no service, no handler and no configuration module
 *     is referenced. The only dependency is the TypeScript language itself.
 *   - No cloud-provider event, result or invocation-context type is named. All provider coupling
 *     is confined to `src/handlers/`.
 *   - The environment is never read here. Configuration flows one way through `src/config/`
 *     (AAP §0.4.3.5), and nothing below the config layer reads it.
 *   - No database driver, connection, query text, table or column identifier appears.
 *   - No filesystem, path or address-parsing builtin is used, and no network-transport, markup,
 *     date or vendor SDK package either. The in-scope adapter is a stub that makes no outbound
 *     call (AAP §0.8.3.3), so no client of that sort belongs in this folder at all, let alone in
 *     its contract.
 *   - No package is added (AAP §0.7.3 S5 — the deliverable's dependency set is frozen).
 *
 * TYPES ONLY — THIS MODULE EMITS NO RUNTIME CODE
 * ----------------------------------------------
 * Both exports are interfaces. Nothing here survives compilation, which is what lets
 * `BaseIntegration.ts` and `GoogleIntegration.ts` consume this module with `import type` and keeps
 * the packaged artifact free of a module whose entire content is a compile-time contract. There is
 * no class, no abstract class, no enumeration, no constant and no function in this file.
 *
 * Two consequences worth stating because they are checkable:
 *
 *   - Execution-model mismatch M7 — nothing survives between invocations of a stateless handler,
 *     so per-request state must never be memoized at module scope — is satisfied trivially and
 *     verifiably: there is no module-scope binding here at all, mutable or otherwise. No cache,
 *     no memo, no counter, no `let`.
 *   - The contract is deliberately not generalised. There is no runtime dispatch mechanism
 *     whatsoever: no interception layer, no introspection, no string-keyed member resolution, no
 *     annotation syntax, no plugin registry and no service locator (AAP §0.7.3 S3). The legacy
 *     framework fabricated members at call time; this port declares every one of them instead.
 *
 * WHY THE CONTRACT IS COLOCATED HERE AND NOT HOISTED
 * --------------------------------------------------
 * In the CFML tree this contract sits in the PARENT directory, `integrationServices/`, because
 * seventeen adapters share it. In this subtree exactly one adapter is in scope — `google` — while
 * those seventeen siblings and the six sibling contract and base components for authentication,
 * payment and shipping are explicitly out of scope (AAP §0.2.2.3). The AAP therefore colocates the
 * contract inside `src/integrations/google/`: there is no second implementor to share it with, and
 * a parent-level copy would imply a generality this port does not have. For the same reason the
 * contract is not widened to accommodate payment or shipping adapters, and none of their members
 * appears below.
 *
 * WHAT IS DELIBERATELY NOT DECLARED (AAP §0.7.3 S9 — invent nothing)
 * -----------------------------------------------------------------
 *   - No supertype. The legacy base component extends a Hibachi framework object
 *     (integrationServices/BaseIntegration.cfc:L49), but org/Hibachi/** is the boundary being
 *     extracted FROM and is never carried forward (AAP §0.8.3.2), so this interface has no
 *     `extends` clause.
 *   - No sixth member. Three candidates were considered and rejected because each is observable on
 *     one component only and never on the `<cfinterface>`: one admin-markup member declared solely
 *     on the legacy base component (integrationServices/BaseIntegration.cfc:L71), and two
 *     settings-related members declared solely on the Google adapter
 *     (integrationServices/google/Integration.cfc:L67 and L73). Promoting either kind to the
 *     contract would invent a requirement the legacy interface never imposed, so each is declared
 *     where it actually lives — on `BaseIntegration.ts` and `GoogleIntegration.ts` respectively —
 *     and not here.
 *   - No token union, no element shape, no setting key, and no threshold, budget or limit
 *     whatsoever. Each omission is justified at the member it would have described.
 *
 * REGISTER DISCIPLINE
 * -------------------
 * This folder owns exactly two entries of the plan's carried-defect register, and NEITHER belongs
 * to this file: the display-name copy-paste artifact is annotated in `GoogleIntegration.ts`, and
 * the dead, syntactically broken feed DAO is evidenced in this folder's `README.md`. Each carries
 * its register number at its own annotation site, which is why neither number is reproduced here —
 * a register entry must be findable in exactly one place, and this module is not that place for
 * either of them. It also mints no new defect number and no new execution-mismatch number, so the
 * two parity notes below are deliberately UNNUMBERED: they record stale legacy documentation, they
 * do not extend the register.
 */

/**
 * The contract every Slatwall integration adapter satisfies — five members, no more.
 *
 * Legacy: integrationServices/IntegrationInterface.cfc:L50-L89. The members are declared in the
 * legacy order so the two files can be read side by side, member for member.
 *
 * ALL FIVE MEMBERS ARE SYNCHRONOUS. Every legacy member is synchronous, no in-scope caller awaits
 * one, and this folder's implementations are pure value returns. Not one member therefore returns
 * a deferred value, and the keyword that would mark a member as awaitable appears nowhere in this
 * module. Deferring a member would change the observable contract for every implementor and every
 * caller — a behavior change the Minimal Change Clause (AAP §0.8.1) forbids, under which idiom
 * may change freely but behavior may not.
 *
 * `IntegrationSettingDescriptor`, referenced by the fourth member, is declared immediately below;
 * TypeScript interface declarations hoist, so the forward reference resolves.
 */
export interface IntegrationContract {
  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L52.
   *
   * The polymorphic `this` return type is the translation of a CFML declaration whose return was
   * the language's untyped catch-all, combined with a body that universally returns the component
   * itself (integrationServices/BaseIntegration.cfc:L52 and
   * integrationServices/google/Integration.cfc:L52).
   *
   * `this` preserves the fluent contract for implementors: `GoogleIntegration.init()` is typed as
   * returning `GoogleIntegration`, not as returning this interface, so a caller keeps the concrete
   * type it started with and can chain against it. Typing the member as the interface, as `void`
   * or as `unknown` would each discard that, and reproducing the untyped catch-all is forbidden
   * outright by AAP §0.7.3 S1.
   */
  init(): this;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L56, documented at L57-L60 as returning
   * the display name the integration should carry.
   *
   * Both observable returns are plain strings — `"Not Defined"` from the base component
   * (integrationServices/BaseIntegration.cfc:L56) and `"Google"` from the adapter
   * (integrationServices/google/Integration.cfc:L60) — so `string` is exact, and no narrower
   * literal type is available without inventing one.
   */
  getDisplayName(): string;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L63.
   *
   * The contract is a comma-separated list carried in a SINGLE string, as its documentation states
   * at L65-L66, and it is kept as `string` for precisely that reason. The four tokens the legacy
   * documentation enumerates, with the meanings it gives them
   * (integrationServices/IntegrationInterface.cfc:L68-L71), are recorded here as documentation
   * only:
   *
   *   shipping  the integration becomes usable by shipping methods and rates.
   *   payment   the integration becomes usable by payment methods.
   *   fw1       the integration may carry custom views.
   *   custom    the integration only hooks into events; no views and nothing further.
   *
   * They are NOT modelled as a union type, and the return is NOT an array. Three reasons, each
   * evidenced: the legacy value is one string that may carry several comma-separated tokens; the
   * only in-scope adapter returns the single token `"fw1"`
   * (integrationServices/google/Integration.cfc:L56) while the base component returns the empty
   * string (integrationServices/BaseIntegration.cfc:L60), so neither observable value would
   * justify a closed set; and two of the four tokens exist to serve the payment and shipping
   * adapter families that are explicitly out of scope
   * (AAP §0.2.2.3). Narrowing the type here would invent a contract the legacy interface does not
   * state (AAP §0.7.3 S9).
   */
  getIntegrationTypes(): string;

  /**
   * Legacy: integrationServices/IntegrationInterface.cfc:L75, declared `returntype="struct"`.
   *
   * Both observable implementations return an empty structure — the base component at
   * integrationServices/BaseIntegration.cfc:L64, the adapter at
   * integrationServices/google/Integration.cfc:L64 — and the one populated setting structure in
   * the entire slice keys descriptors by setting name, which is what fixes the value type below.
   *
   * `Readonly<...>` records that the returned structure is a description to be read, never a
   * handle to be written through. Under the subtree's `noUncheckedIndexedAccess` setting an
   * indexed read is typed `IntegrationSettingDescriptor | undefined`, so a caller must handle the
   * absent-key case explicitly — correct here, because the empty structure is the normal return.
   *
   * TODO(parity) — legacy documentation defect, preserved rather than repaired (AAP §0.7.3 S7).
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
   * The ELEMENT type is not observable in the in-scope slice: every implementation returns an
   * empty array, no in-scope caller reads an element, and the legacy prose describes a shape the
   * declaration contradicts (see the parity note below). `unknown` is therefore the honest
   * element type — it satisfies AAP §0.7.3 S1 because it is not the untyped catch-all and forces
   * a consumer to narrow before use, and it satisfies S9 because it invents no element shape.
   * `readonly` records that the value is a declaration to be read, not a collection to append to.
   *
   * TODO(parity) — legacy documentation defect, preserved rather than repaired (AAP §0.7.3 S7).
   * integrationServices/IntegrationInterface.cfc:L84 documents this member as returning valid
   * ColdSpring XML that overrides the default XML: a markup-string description attached to a
   * member declared `returntype="array"` and observably returning an empty array. The declared
   * `array` contract wins and the prose is stale. It is recorded, not corrected, and deliberately
   * carries no register number.
   */
  getEventHandlers(): readonly unknown[];
}

/**
 * The shape of one entry in the structure an integration returns to describe its settings.
 *
 * Locator and justification: this shape is taken byte-exactly from the only populated setting
 * structure observable in the whole in-scope slice, at
 * integrationServices/google/Integration.cfc:L67-L71, whose descriptor literal is
 * `{fieldType="select"}` on L69. One key, one field, one value.
 *
 * `fieldType` stays `string` and is NOT narrowed to a `'select'` literal union. `select` is the
 * value the Google adapter happens to use; it is not an enumeration the contract declares, and no
 * second value is observable in scope from which a union could honestly be built.
 *
 * Nothing else about a setting descriptor is observable in scope, so nothing else is declared —
 * no default value, no label, no option list, no required flag, no data type, no sort order. Each
 * would be invention (AAP §0.7.3 S9).
 *
 * It is declared in this module, rather than in a shared type bucket, because this is the
 * producing module for the contract's types and because the folder is closed at six files with no
 * such bucket in it. It is exported because `GoogleIntegration.ts` needs it for the adapter-only
 * settings member that this contract deliberately does not declare.
 */
export interface IntegrationSettingDescriptor {
  readonly fieldType: string;
}
