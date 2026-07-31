/**
 * GoogleIntegration — the interface-conformant Google integration adapter, translated from
 * `integrationServices/google/Integration.cfc:L49-L79`.
 *
 * THIS FILE IS NEARLY EMPTY BY FAITHFULNESS, NOT BY NEGLECT
 * The legacy component is 79 lines and breaks down to a license header, one component declaration,
 * four contract members returning two fixed strings and an empty structure, one populated settings
 * structure, and one member whose body is blank. AAP §0.6.4 investigated four candidate homes for
 * the Google product-feed logic and recorded, for this file, "No feed logic whatsoever."
 *
 * There is therefore nothing more to port. Feed generation, a merchant client, an outbound call or a
 * product-category lookup added here would be behavior the legacy system does not have, which AAP
 * §0.7.3 S9 forbids outright. AAP §0.4.1.10 specifies the target contents exactly and no more: the
 * type token, the display name, an empty settings structure, and the one product-type setting field,
 * with the display-name defect recorded.
 *
 * WHERE THE FEED LOGIC ACTUALLY LIVES — orientation, because this is the wrong place to look
 * The work is split three ways and not one of the three is this file. This file is the
 * interface-conformant stub only. Record selection — the related-property joins, the activity and
 * publication filters and the availability range filter that choose which records the feed contains
 * — is ported from `integrationServices/google/controllers/feed.cfc:L49-L74` into a planned
 * `ProductFeedQuery.ts`. All RSS field shaping is ported from
 * `integrationServices/google/views/feed/product.cfm:L1-L65` into `ProductFeedBuilder.ts`, which is
 * where the real work of the feed lands.
 *
 *   GoogleIntegration.ts   (this file) the interface-conformant stub only. The legacy
 *                          integrationServices/google/Integration.cfc carries no feed logic at all.
 *   ProductFeedQuery.ts    owns record selection, ported from
 *                          integrationServices/google/controllers/feed.cfc:L49-L74 — the related-
 *                          property joins, the activity and publication filters and the
 *                          availability range filter that choose which records the feed contains.
 *                          ⚠️ NOT DELIVERED AT THIS CHECKPOINT (F19).
 *   ProductFeedBuilder.ts  owns all RSS field shaping, ported from
 *                          integrationServices/google/views/feed/product.cfm:L1-L65. This is where
 *                          the real work of the feed lands.
 *
 * A fourth candidate was rejected outright: integrationServices/google/model/dao/FeedDAO.cfc is
 * unreachable, syntactically broken code with zero callers across the repository, and it is
 * deliberately not ported. Its register entry D12 and the evidence behind it are carried in
 * `IntegrationContract.ts` — see REGISTER DISCIPLINE below.
 *
 * ⚠️ F19 — THIS FOLDER IS NOT "CLOSED AT EXACTLY SIX FILES", AND SAYING SO WAS A FALSE STATEMENT OF
 * FACT. It holds FOUR: IntegrationContract.ts, BaseIntegration.ts, GoogleIntegration.ts and
 * ProductFeedBuilder.ts. AAP §0.4.1.10 plans six, adding ProductFeedQuery.ts and README.md, and both
 * remain planned — but a reader was being told they could open them today. The PROHIBITION the sentence
 * existed to carry is unaffected and still holds: no barrel, no registry, no discovery module, no
 * shared type bucket, no subfolder, no handler and no second adapter belongs in this folder, because
 * the discovery mechanism such a file would serve was retired rather than translated (AAP §0.8.3.2).
 *
 * The subtree-wide pattern is composition over inheritance, so a reader will flag the `extends`. The
 * reasoning is specific rather than general: the composition-over-inheritance decision of AAP §0.3.3
 * targets template-method reuse through `extends="HibachiService"` and the `super.save()` call
 * chain, where a service inherited a large framework surface it never used and the inherited
 * behavior was invisible at the call site. It does not prohibit a small, in-scope adapter base whose
 * entire purpose is to supply defaults. Keeping the inheritance earns something concrete:
 * `getEventHandlers()` and `getAdminNavbarHTML()` are inherited unchanged, exactly as the legacy
 * adapter inherits them from `integrationServices/BaseIntegration.cfc:L67` and `:L71`. Composing
 * instead would force this class to redeclare both members purely to delegate — duplication the
 * legacy tree does not have.
 *
 * The `implements` clause is not redundant decoration either. `BaseIntegration` already satisfies
 * the contract, so conformance would otherwise be inherited silently; restating it makes this
 * class's conformance a compile-checked declaration at the one place a reader looks for it, which is
 * what AAP §0.7.3 S3 asks for in place of the retired framework discovery.
 *
 * MEMBER ORDER FOLLOWS THE LEGACY ADAPTER, NOT THE INTERFACE
 * The six members below are declared in legacy adapter order (`:L51`, `:L55`, `:L59`, `:L63`,
 * `:L67`, `:L73`), which DIVERGES from the contract: the adapter declares `getIntegrationTypes`
 * (`:L55`) before `getDisplayName` (`:L59`), whereas the interface declares `getDisplayName`
 * (`integrationServices/IntegrationInterface.cfc:L56`) before `getIntegrationTypes` (`:L63`). Member
 * order is not a runtime contract in either language, so the legacy order is kept deliberately: it
 * lets the two files be read side by side, member for member.
 *
 * TWO CFML COMPONENT ATTRIBUTES ARE DELIBERATELY NOT TRANSLATED
 * `Integration.cfc:L49` also carries `accessors="true"` and `output="false"`. Neither has a
 * TypeScript counterpart. `accessors="true"` would generate a getter and a setter per declared
 * property, and this component declares zero properties, so it generates nothing — there is no
 * accessor surface to port, and adding one would invent a member. `output="false"` governs CFML
 * template output buffering, a concept with no counterpart in a class that returns values. The third
 * attribute on that line is the subject of the register annotation at `getDisplayName()` below.
 *
 * NO CONSTRUCTOR, NO COLLABORATORS
 * The legacy component declares no constructor, declares no properties and injects nothing, so this
 * class declares no constructor and takes no parameters. It holds no reference to a feed query, a
 * feed builder, a service, a port or a repository: AAP §0.7.3 S3 is satisfied here by having no
 * dependency to inject rather than by wiring one, and adding a collaborator would invent coupling
 * the legacy adapter does not have.
 *
 * Its two imports are both local siblings — a type-only import of the contract and its setting
 * descriptor, and a value import of the base class. The type-only form is structural rather than
 * stylistic: `IntegrationContract.ts` holds only interface declarations and emits no runtime code,
 * so a value import would name a module that does not exist after compilation. The base class is
 * imported as a value precisely because it is extended.
 *
 * A FRESH VALUE PER CALL — MISMATCH M7
 * Both structure-returning members construct their value inline on every call. This module holds no
 * module-scope state and the class declares no instance field. FIDELITY: the legacy bodies construct
 * a new structure per invocation (`integrationServices/google/Integration.cfc:L64` and `:L68-L70`),
 * so a shared instance would hand every caller the same object and one caller mutating it would
 * change what a later caller observes. MISMATCH M7: module-scope state persists on a warm container,
 * so a shared mutable value would outlive the invocation that touched it and could carry data across
 * a tenant boundary.
 *
 * REGISTER DISCIPLINE
 * -------------------
 * This file owns exactly ONE entry of the plan's carried-defect register: the display-name
 * copy-paste artifact, annotated at getDisplayName() below with its exact locator. The folder's
 * other entry — D12, the dead, syntactically broken feed DAO — is carried in
 * `IntegrationContract.ts` and is deliberately not restated here, because a register entry must be
 * findable in exactly one place. ⚠️ F19: this pointer previously named an undelivered `README.md`, so
 * that entry was findable in NO place; it now names the module that actually holds it.
 *
 * This file mints NO new defect number and NO new execution-mismatch number. The two mismatches
 * recorded at getSettingOptions() below are therefore deliberately UNNUMBERED: they record a stale
 * legacy declaration and a language-level operator difference, neither of which extends the
 * register.
 */

import type { IntegrationContract, IntegrationSettingDescriptor } from './IntegrationContract';
import { BaseIntegration } from './BaseIntegration';

/**
 * The Google integration adapter.
 *
 * Legacy: integrationServices/google/Integration.cfc:L49-L79. Six members, declared in legacy
 * order (L51, L55, L59, L63, L67, L73), every one of them declared `public` because the legacy
 * component declares every one of them `public`.
 *
 * FOUR of the six carry the `override` keyword because BaseIntegration declares them, and the
 * subtree compiles with noImplicitOverride, which makes the keyword mandatory rather than
 * decorative: it turns a future rename or removal of a base member into a compile error here
 * instead of a silently orphaned method. The remaining TWO — getIntegratedSettings() and
 * getSettingOptions() — are declared by the legacy adapter alone, on no base class and in no
 * interface, so they carry no such keyword; each states that at its own declaration.
 *
 * NOT ONE MEMBER IS DEFERRED. Every legacy member is synchronous, every body below is a value
 * return, and no in-scope caller awaits one. Deferring a member would change the observable
 * contract for every caller — behavior the Minimal Change Clause (AAP §0.8.1) forbids, under which
 * idiom may change freely but behavior may not.
 */
export class GoogleIntegration extends BaseIntegration implements IntegrationContract {
  /**
   * Legacy: `integrationServices/google/Integration.cfc:L51-L53`.
   *
   * A REDUNDANT OVERRIDE, KEPT DELIBERATELY. This body is byte-identical to the inherited one at
   * `integrationServices/BaseIntegration.cfc:L51-L53` — both return the component itself — so
   * removing it would change no observable behavior. It is kept because the legacy adapter
   * re-declares it regardless, and a side-by-side reading of the two files should show the same
   * members in the same order. Do not delete it as dead code.
   *
   * The polymorphic `this` return type is the contract's, so a caller that chains keeps the concrete
   * type it started with. Reproducing CFML's untyped catch-all return is forbidden by AAP §0.7.3 S1.
   */
  public override init(): this {
    return this;
  }

  /**
   * Legacy: integrationServices/google/Integration.cfc:L55-L57.
   *
   * The literal below is the single type token this adapter claims — lowercase, three characters.
   * integrationServices/IntegrationInterface.cfc:L70 documents its meaning: when set, the
   * integration may carry custom views. That is exactly what the legacy Google service does, through
   * its own controller and view (integrationServices/google/controllers/feed.cfc and
   * integrationServices/google/views/feed/product.cfm), which is why this is the one token present.
   *
   * The return is ONE string, not a collection and not a narrowed union: the contract is a
   * comma-separated list carried in a single string (IntegrationInterface.cfc:L65-L66). No second
   * token is added. The other three tokens the legacy documentation enumerates at L68-L71 exist to
   * serve the shipping and payment adapter families, and all sixteen sibling adapters are explicitly
   * out of scope (AAP §0.2.2.3), so claiming one of their tokens here would advertise capability
   * this adapter does not have (AAP §0.7.3 S9).
   */
  public override getIntegrationTypes(): string {
    return 'fw1';
  }

  /**
   * Legacy: `integrationServices/google/Integration.cfc:L59-L61`.
   *
   * THIS IS THE EFFECTIVE DISPLAY NAME. What this method returns is what an administrative surface
   * shows, and it overrides the two-word fallback the base class supplies
   * (`integrationServices/BaseIntegration.cfc:L55-L57`).
   *
   * TODO(parity) D11 — `integrationServices/google/Integration.cfc:L49`. The component attributes on
   * that line declare `displayname="USA epay"` while this method returns the vendor name below. The
   * two disagree, and the method is the one that takes effect. It is a copy-paste artifact: the
   * component was cloned from the USAePay payment adapter — which is also why an
   * interface-conformant shell exists here with no feed implementation behind it, so the artifact is
   * genuinely informative evidence rather than noise.
   *
   * CARRIED, NOT REPAIRED (AAP §0.7.3 S7). The stale metadata is never read by this port, is not
   * reproduced as a field, a constant or a generated accessor, and must not win. The legacy CFML file
   * is likewise not edited: the CFML tree stays byte-for-byte unchanged (AAP §0.8.1 and §0.8.2
   * guideline 1).
   */
  public override getDisplayName(): string {
    return 'Google';
  }

  /**
   * Legacy: integrationServices/google/Integration.cfc:L63-L65 — a new empty structure.
   *
   * Empty is the observable behavior, not an omission: this adapter contributes no integration
   * setting of its own through the contract member. The empty object literal is constructed inline
   * on every call, faithful to the legacy body and required by mismatch M7 — see the module note
   * above; no shared instance may be allowed to survive on a warm container.
   *
   * The return type is the contract's, unchanged (IntegrationContract.getSettings). Under the
   * subtree's noUncheckedIndexedAccess setting an indexed read of the result is typed as possibly
   * absent, so a caller must handle the missing-key case explicitly — correct here, because an
   * empty structure is exactly what this member returns.
   *
   * This member is DISTINCT from getIntegratedSettings() below, which holds the one populated
   * settings structure in the slice. The legacy adapter declares both, at L63 and L67 respectively;
   * conflating them would move a populated structure onto the contract member, where the legacy
   * returns nothing.
   */
  public override getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {};
  }

  /**
   * Legacy: integrationServices/google/Integration.cfc:L67-L71 — the ONE populated settings
   * structure in the entire in-scope slice: a single key whose descriptor declares a single field,
   * written in the legacy source as fieldType="select" at L69.
   *
   * NOT A CONTRACT MEMBER. integrationServices/IntegrationInterface.cfc declares five members
   * (L52, L56, L63, L75, L82) and this is none of them; it exists on the legacy adapter alone, at
   * Integration.cfc:L67. It is therefore declared here and is deliberately absent from
   * IntegrationContract, which records the same decision from the interface side, and it carries no
   * `override` keyword because no base class declares it. Promoting it to the contract would impose
   * a requirement on every implementor that the legacy interface never imposed (AAP §0.7.3 S9).
   *
   * The descriptor type is imported from IntegrationContract rather than redeclared locally: that
   * module is the producing module for this folder's types, and the literal at Integration.cfc:L69
   * is the sole source of the descriptor's shape. Nothing is added to it — no default value, no
   * label, no option list, no required flag, no sort order — because nothing else is observable
   * (AAP §0.7.3 S9). Exactly one entry is returned, because the legacy structure has exactly one.
   *
   * A fresh object literal per call, for the same two reasons as getSettings(): fidelity to the
   * legacy per-invocation construction, and mismatch M7.
   *
   * DRIFT TRAP — THIS SETTING DOES NOT POPULATE THE FEED'S PRODUCT CATEGORY.
   * The productGoogleProductType setting declared here is NEVER consumed by the feed.
   * integrationServices/google/Integration.cfc:L68 declares it;
   * integrationServices/google/views/feed/product.cfm:L20 emits
   * `<g:google_product_category></g:google_product_category>` — an intentionally EMPTY element —
   * regardless of it. The two are not connected in the legacy system.
   *
   * This is the most tempting improvement in the whole folder: a reader sees a product-type setting
   * declared on the adapter, sees an empty category element in the feed, and joins them. Joining
   * them would invent behavior (AAP §0.7.3 S9) and would change the emitted feed, so it is not
   * done — and this adapter deliberately holds no reference to the feed builder through which it
   * could be done.
   */
  public getIntegratedSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {
      productGoogleProductType: { fieldType: 'select' },
    };
  }

  /**
   * Legacy: integrationServices/google/Integration.cfc:L73-L77.
   *
   * NOT A CONTRACT MEMBER. integrationServices/IntegrationInterface.cfc declares five members and
   * this is none of them; it exists on the legacy adapter alone, at Integration.cfc:L73. It is
   * declared here, is deliberately absent from IntegrationContract, and carries no `override`
   * keyword because no base class declares it.
   *
   * PRESERVING AN ABSENCE, NOT FABRICATING A VALUE. The legacy method produces nothing: the branch
   * it opens at L74 has a blank body at L75, the branch closes at L76, the method closes at L77,
   * and there is no return statement in it at all. The union with the value-less result below is
   * the honest translation of that. It is also why the body does NOT return an empty collection —
   * an empty collection would assert "this setting has zero options", which is a different and
   * stronger claim than "this method returns nothing". Under AAP §0.7.3 S1 the union is the precise
   * shape; under S9, making the stronger claim would be invention.
   *
   * THE ELEMENT TYPE IS DELIBERATELY UNNARROWED. No element is observable in the slice, because no
   * element is ever produced. The name-and-value projection type used by the option service was
   * considered and rejected for two independent reasons: importing it would couple
   * src/integrations/ to src/services/ for no behavioral gain, breaching the hexagonal separation
   * of AAP §0.7.3 S4; and borrowing it would imply a contract this member does not have, since the
   * legacy produces no options whatsoever. An unnarrowed element type forces a consumer to narrow
   * before use and invents nothing.
   *
   * TODO(parity) — UNNUMBERED. Declaration-versus-body mismatch: Integration.cfc:L73 declares
   * returntype="array" while the body at L74-L77 contains no return statement, so the declared
   * collection return is never actually produced. Recorded, not repaired (AAP §0.7.3 S7). It
   * carries no register number by design — it is a stale legacy declaration, not a new register
   * entry.
   *
   * TODO(parity) — UNNUMBERED. Operator case sensitivity: the comparison at Integration.cfc:L74
   * uses CFML's `eq`, which is case-INSENSITIVE, whereas the strict comparison below is
   * case-SENSITIVE. Under the legacy, a differently-cased setting name would have entered the
   * branch; under this port it will not. The divergence is NOT observable: the branch body is
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
      // does not have (AAP §0.7.3 S9).
    }

    return undefined;
  }
}
