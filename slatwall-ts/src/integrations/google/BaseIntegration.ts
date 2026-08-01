/**
 * BaseIntegration — the default-implementation base class every Slatwall integration adapter
 * extends, and the reason `GoogleIntegration.ts` can be a faithful stub rather than a six-member
 * duplication.
 *
 * Legacy origin: `integrationServices/BaseIntegration.cfc:L49-L74`, which declares exactly six
 * public members, each with a one-line body:
 *
 *   :L51  init                 returns the component itself
 *   :L55  getDisplayName       returns the two-word fallback display name reproduced below
 *   :L59  getIntegrationTypes  returns the empty string
 *   :L63  getSettings          returns an empty structure
 *   :L67  getEventHandlers     returns an empty array
 *   :L71  getAdminNavbarHTML   returns the empty string
 *
 * No member is enhanced, generalised or added: every value returned below is the value the legacy
 * component returns. The legacy component declares no properties and no constructor.
 *
 * FIVE OF THE SIX ARE CONTRACTUAL, AND THE ASYMMETRY IS DELIBERATE
 * `IntegrationContract` declares five members because
 * `integrationServices/IntegrationInterface.cfc:L50-L89` declares five. The sixth member here,
 * `getAdminNavbarHTML`, is declared by the legacy BASE COMPONENT
 * (`integrationServices/BaseIntegration.cfc:L71`) and by no `<cfinterface>` member, so it is
 * implemented on this class and deliberately absent from the contract. It is flagged up here as well
 * as at the member itself, because a reader scanning the interface for a sixth declaration would
 * otherwise read its absence as an oversight rather than as fidelity.
 *
 * WHY THIS CLASS HAS NO SUPERTYPE
 * `integrationServices/BaseIntegration.cfc:L49` declares the legacy component as extending a
 * Hibachi framework base object. That inheritance is not carried forward: `org/Hibachi/**` is the
 * framework boundary this port extracts FROM, and AAP §0.8.3.2 ports nothing from it. The boundary
 * falls here cleanly — none of the six bodies below reads inherited state or calls an inherited
 * member, each returns a fixed value — so discarding the supertype costs nothing observable. The
 * legacy supertype's own symbol is deliberately not reproduced anywhere in this file; the locator
 * above is the reference.
 *
 * WHY INHERITANCE IS NEVERTHELESS THE RIGHT SHAPE FOR THIS ONE CLASS
 * A reader who knows the subtree-wide rule will read the `extends BaseIntegration` clause in
 * `GoogleIntegration.ts` as a violation of it, so the judgment is recorded here (prompt
 * Guideline 6). The composition-over-inheritance decision of AAP §0.3.3 targets one specific thing:
 * template-method reuse through `extends="HibachiService"` and the `super.save()` call chain, where
 * a service inherited a large framework surface it never used and the inherited behavior was
 * invisible at the call site. It does not prohibit a small, in-scope adapter base whose entire
 * purpose is to supply defaults.
 *
 * Keeping the inheritance earns something concrete: `getEventHandlers()` and `getAdminNavbarHTML()`
 * are inherited by `GoogleIntegration` unchanged, exactly as the legacy adapter inherits them
 * (`integrationServices/google/Integration.cfc:L49` extends this component). Composing instead would
 * force the adapter to redeclare both members purely to delegate — duplication the legacy tree does
 * not have. The legacy adapter overrides four members and inherits two; the port reproduces that
 * shape member for member.
 *
 * COLOCATED, NOT HOISTED
 * In the CFML tree this base component sits in the parent `integrationServices/` directory because
 * seventeen adapters share it. Here exactly one adapter is in scope, and the sibling adapters along
 * with the authentication, payment and shipping contracts and bases are out of scope
 * (AAP §0.2.2.3), so the class is colocated with its one subclass. It is deliberately not widened to
 * serve those families: none of their members appears below, and no token, credential, endpoint or
 * rate concept enters this file.
 *
 * DIRECTLY INSTANTIABLE, AND WITHOUT COLLABORATORS
 * The class is not declared abstract and declares no unimplemented member. The legacy component is
 * directly instantiable and all six of its bodies are concrete, so nothing is left for a subclass to
 * supply, and making instantiation impossible would change the contract — which the Minimal Change
 * Clause (AAP §0.8.1) forbids, under which idiom may change freely but behavior may not. It declares
 * no constructor and takes no parameters, matching the legacy component, whose `init()` is merely an
 * initializer returning the instance. With zero collaborators there is nothing to inject.
 *
 * ONE IMPORT ONLY, AND IT MUST BE TYPE-ONLY
 * The sibling contract is imported with `import type` for a structural reason rather than a
 * stylistic one: `IntegrationContract.ts` holds only interface declarations and emits no runtime
 * code, so a value import would name a module that does not exist after compilation.
 *
 * A FRESH VALUE PER CALL — MISMATCH M7
 * `getSettings()` and `getEventHandlers()` each construct their empty value inline on every call,
 * and this module holds no module-scope state at all. Two independent reasons make that the only
 * compliant shape. FIDELITY: the legacy bodies construct a new structure and a new array per
 * invocation (`integrationServices/BaseIntegration.cfc:L64` and `:L68`), so a shared instance would
 * hand every caller the same object and one caller mutating it would change what a later caller
 * observes. MISMATCH M7: module-scope state persists on a warm container, so a shared mutable value
 * would outlive the invocation that touched it and could carry data across a tenant boundary. The
 * declared return types are read-only views, which states the intent; constructing fresh values
 * enforces it even against a caller that discards those types.
 *
 * WHAT IS DELIBERATELY NOT DECLARED
 * No seventh member: the two settings-related members declared solely on the Google adapter
 * (`integrationServices/google/Integration.cfc:L67` and `:L73`) belong to `GoogleIntegration.ts`
 * alone, and their names are not reproduced here so that each resolves to exactly one declaring
 * file. No lookup table, discovery scan, factory or self-registration hook either — the legacy
 * framework located integrations by scanning the ORM CFC path, and AAP §0.8.3.2 with TR-3 retires
 * that machinery rather than translating it, so its replacement is the one hand-written `implements`
 * clause below. No lifecycle hook, threshold, budget, retry or limit: none is observable in the
 * legacy component, and AAP §0.6.6 with IR-12 forbid inventing one. Every member is synchronous,
 * because deferring one would change the observable contract for every implementor and caller.
 *
 * CARRIED-DEFECT DISCIPLINE
 * -------------------------
 * This file carries no entry of the plan's carried-defect catalogue and mints no new number in it.
 * This folder owns exactly two entries (AAP §0.6.7) and neither is this file's: the adapter's
 * display-name copy-paste artifact D11 is annotated in `GoogleIntegration.ts`, and the dead,
 * syntactically broken feed data-access component is D12.
 *
 * ⭐ F19 — THE D12 POINTER, AND WHY IT MOVED TWICE. It originally named this folder's `README.md`,
 * appealing to the rule that an entry must be findable in exactly one place. At an earlier checkpoint
 * that README was undelivered, so the pointer was redirected to `IntegrationContract.ts` to keep the
 * evidence findable somewhere. `README.md` is now delivered and AAP §0.4.1.10 assigns the D12 finding
 * to it explicitly, so the pointer names `README.md` §9 once more and the interim copy has been
 * withdrawn rather than left to be kept in step by hand. This file continues to hold neither entry.
 *
 * One legacy inconsistency inside this file's own span is recorded here and given no number,
 * because it is not a defect: integrationServices/BaseIntegration.cfc:L60 writes the empty string
 * with double quotes while L72 writes it with single quotes. Both produce an identical value in
 * CFML, so the difference is quoting style and carries no behavioral meaning. The port emits the
 * subtree's single-quote convention for both.
 */

import type { IntegrationContract, IntegrationSettingDescriptor } from './IntegrationContract';

/**
 * The default implementations shared by Slatwall integration adapters.
 *
 * Legacy: integrationServices/BaseIntegration.cfc:L49-L74. Members are declared in the legacy
 * order — L51, L55, L59, L63, L67, L71 — so the two files can be read side by side, member for
 * member. Every member is declared `public` because the legacy component declares every one of
 * them `public`.
 */
export class BaseIntegration implements IntegrationContract {
  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L51-L53 — the body returns the component
   * itself and does nothing else. There is no initialization work to reproduce.
   *
   * The polymorphic `this` return type is the contract's (`IntegrationContract.init`), and it is
   * what makes the inheritance in `GoogleIntegration.ts` worth having: `GoogleIntegration.init()`
   * is typed as returning `GoogleIntegration`, not as returning this base class, so a caller keeps
   * the concrete type it started with and can chain against it. Typing the member as the base
   * class, as the interface, as `void` or as `unknown` would each discard that, and reproducing
   * CFML's untyped catch-all return is forbidden outright by AAP §0.7.3 S1.
   */
  public init(): this {
    return this;
  }

  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L55-L57.
   *
   * The literal below is BEHAVIOR, not a placeholder, and must not be improved into something
   * more descriptive. It is the observable display name of an adapter that does not override this
   * member, so it reaches administrative output verbatim. Two words, capitalised exactly as the
   * legacy component capitalises them, separated by a single space; it is reproduced byte for byte
   * under AAP §0.7.3 S7 — preserve and annotate, do not repair.
   *
   * `GoogleIntegration` overrides this member (integrationServices/google/Integration.cfc:L59-L61),
   * so this fallback is what a future adapter would inherit rather than what the one in-scope
   * adapter displays.
   */
  public getDisplayName(): string {
    return 'Not Defined';
  }

  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L59-L61 — the empty string.
   *
   * Empty is the meaningful default, not a missing value. The contract is a comma-separated list
   * of type tokens carried in ONE string (integrationServices/IntegrationInterface.cfc:L65-L66),
   * so a base class that claims no token supports no integration type until a subclass declares
   * one. `GoogleIntegration` overrides it with its single token
   * (integrationServices/google/Integration.cfc:L55-L57).
   *
   * The return is the empty string — not `null`, not `undefined`, and not a token standing for
   * "unclassified". The empty string is what the legacy body returns, and the distinction is
   * observable to a caller that splits the value into a list.
   */
  public getIntegrationTypes(): string {
    return '';
  }

  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L63-L65 — a new empty structure.
   *
   * The empty object literal is constructed INLINE on every call. See the module note above: a
   * hoisted shared instance would break fidelity with the legacy per-invocation construction and
   * would violate mismatch M7 by surviving on a warm container between invocations.
   *
   * The `Readonly<...>` return type is the contract's, unchanged. It records that the structure is
   * a description to be read, never a handle to be written through. Under the subtree's
   * `noUncheckedIndexedAccess` setting an indexed read is typed as possibly absent, so a caller
   * must handle the missing-key case explicitly — correct here, because an empty structure is
   * exactly what this default returns.
   *
   * `GoogleIntegration` overrides this member with an empty structure of its own
   * (integrationServices/google/Integration.cfc:L63-L65). The adapter's one POPULATED settings
   * structure lives on a separate, non-contract member that belongs to that file alone, which is
   * why no populated default appears here.
   */
  public getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {};
  }

  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L67-L69 — a new empty array.
   *
   * Constructed INLINE on every call, for the two reasons given in the module note. No shared
   * empty array is hoisted to module scope.
   *
   * The element type is `unknown` because no element is observable in the in-scope slice: every
   * implementation returns an empty array and no in-scope caller reads an element. `unknown`
   * forces a consumer to narrow before use and invents no element shape. `readonly` records that
   * the value is a declaration to be read, not a collection to append to.
   *
   * `GoogleIntegration` does NOT override this member — it inherits this body unchanged, exactly
   * as the legacy adapter inherits it (integrationServices/google/Integration.cfc:L49). That
   * inheritance is one of the two reasons this class exists rather than being inlined into the
   * adapter.
   */
  public getEventHandlers(): readonly unknown[] {
    return [];
  }

  /**
   * Legacy: integrationServices/BaseIntegration.cfc:L71-L73 — the empty string.
   *
   * THIS MEMBER IS NOT PART OF `IntegrationContract`, AND THAT IS CORRECT.
   *
   * The legacy `<cfinterface>` at integrationServices/IntegrationInterface.cfc:L50-L89 declares
   * five members, and this is not one of them: it is declared on the legacy BASE COMPONENT only
   * (integrationServices/BaseIntegration.cfc:L71). Promoting it to the contract would impose a
   * requirement the legacy `<cfinterface>` never imposed and would force every future implementor
   * to supply it — invention forbidden by AAP §0.7.3 S9. Dropping it instead would remove a member
   * from the observable surface of this class and of every subclass, which the Minimal Change
   * Clause (AAP §0.8.1) forbids. Implementing it here, and only here, is the one shape that is
   * faithful in both directions. `IntegrationContract.ts` records the reciprocal half of this
   * decision from the interface side.
   *
   * It stays PUBLIC. The legacy component declares it `public`, and `GoogleIntegration` inherits it
   * as part of its observable surface, so narrowing it to a protected or private member would
   * change that surface.
   *
   * Empty markup is the meaningful default: a base class contributes nothing to administrative
   * navigation until a subclass returns something. Neither in-scope class overrides it.
   */
  public getAdminNavbarHTML(): string {
    return '';
  }
}
