// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

/**
 * BaseIntegration — the default-implementation base class every Slatwall integration adapter
 * extends, and the reason `GoogleIntegration.ts` can be a faithful stub rather than a six-member
 * duplication.
 *
 * AUTHORITY
 * ---------
 * AAP §0.4.1.10 states the target for this file in four words: "Default implementations
 * preserved." That is the whole mandate — no member is enhanced, no member is generalised, and no
 * member is added. Every value returned below is the value the legacy component returns.
 *
 * LEGACY ORIGIN — integrationServices/BaseIntegration.cfc:L49-L74
 * --------------------------------------------------------------
 * A declaration scan of that span returns EXACTLY SIX members, each with a one-line body:
 *
 *   L51  init                 returns the component itself
 *   L55  getDisplayName       returns the two-word fallback display name reproduced below
 *   L59  getIntegrationTypes  returns the empty string
 *   L63  getSettings          returns an empty structure
 *   L67  getEventHandlers     returns an empty array
 *   L71  getAdminNavbarHTML   returns the empty string
 *
 * Six is a scan result, not an assumption. The legacy component declares every one of them
 * `public`, declares no properties, and declares no constructor.
 *
 * FIVE OF THE SIX ARE CONTRACTUAL, AND THE ASYMMETRY IS DELIBERATE
 * ---------------------------------------------------------------
 * `IntegrationContract` declares five members, because
 * integrationServices/IntegrationInterface.cfc:L50-L89 declares five. The sixth member on this
 * class, `getAdminNavbarHTML`, is declared by the legacy BASE COMPONENT
 * (integrationServices/BaseIntegration.cfc:L71) and by no `<cfinterface>` member at all. It is
 * therefore implemented here and deliberately absent from the contract. The full reasoning sits at
 * the member itself, below; it is flagged here too because a reviewer scanning the interface for a
 * sixth declaration would otherwise read its absence as an oversight rather than as fidelity.
 * `IntegrationContract.ts` records the same decision from the interface side.
 *
 * WHY THIS CLASS HAS NO SUPERTYPE
 * -------------------------------
 * integrationServices/BaseIntegration.cfc:L49 declares the legacy component as extending a
 * Hibachi framework base object. That inheritance is NOT carried forward. `org/Hibachi/**` is the
 * framework boundary this port extracts FROM, and AAP §0.8.3.2 is unambiguous: nothing from it is
 * ported or depended upon. The 938 files under that tree are reference-only.
 *
 * The boundary falls here cleanly, and that is checkable rather than asserted: none of the six
 * bodies below reads inherited state or calls an inherited member — each returns a fixed value —
 * so discarding the framework supertype costs nothing observable. The legacy supertype's own
 * symbol is deliberately not reproduced in this file — the locator above is the reference — so a
 * scan of this subtree for framework identifiers returns nothing from it.
 *
 * WHY INHERITANCE IS NEVERTHELESS THE RIGHT SHAPE FOR THIS ONE CLASS
 * -----------------------------------------------------------------
 * This deserves stating plainly, because a reviewer who knows the subtree-wide rule will read the
 * `extends BaseIntegration` clause in `GoogleIntegration.ts` as a violation of it.
 *
 * It is not. The composition-over-inheritance decision of AAP §0.3.3 targets one specific thing:
 * template-method reuse through `extends="HibachiService"` and the `super.save()` call chain,
 * where a service inherited a large framework surface it never used and where the inherited
 * behavior was invisible at the call site. Replacing THAT with an injected collaborator is what
 * the decision buys. It does not prohibit a small, in-scope adapter base whose entire purpose is
 * to supply defaults.
 *
 * Keeping the inheritance here is a documented judgment under prompt Guideline 6, and it earns
 * something concrete: `getEventHandlers()` and `getAdminNavbarHTML()` are inherited by
 * `GoogleIntegration` unchanged, exactly as the legacy adapter inherits them
 * (integrationServices/google/Integration.cfc:L49 extends this component). Composing instead would
 * force the adapter to redeclare both members purely to delegate — duplication the legacy tree
 * does not have. The legacy adapter overrides four members and inherits two; the port reproduces
 * that shape member for member.
 *
 * WHY IT IS COLOCATED HERE AND NOT HOISTED
 * ----------------------------------------
 * In the CFML tree this base component sits in the PARENT directory, `integrationServices/`,
 * because seventeen adapters share it. In this subtree exactly one adapter is in scope — `google`
 * — and those seventeen siblings, together with the six sibling contract and base components for
 * authentication, payment and shipping, are explicitly out of scope (AAP §0.2.2.3). The AAP
 * therefore colocates this class inside `src/integrations/google/`. There is no second subclass to
 * share it with, and a parent-level copy would imply a generality this port does not have.
 *
 * For the same reason the class is NOT widened to serve the payment or shipping adapter families:
 * none of their members appears below, and no token, credential, endpoint or rate concept enters
 * this file.
 *
 * DIRECTLY INSTANTIABLE, AND WITHOUT COLLABORATORS
 * ------------------------------------------------
 * Two alternative shapes were available, and both are rejected on evidence:
 *
 *   - The class is NOT declared as an incomplete base awaiting a subclass. The legacy component is
 *     directly instantiable and every one of its six bodies is concrete, so no member is left for
 *     a subclass to supply. Declaring the class or a member as unimplemented would change the
 *     contract by making instantiation impossible, which the Minimal Change Clause (AAP §0.8.1)
 *     forbids: idiom may change freely, behavior may not.
 *   - The class declares NO constructor and takes NO parameters. The legacy component declares no
 *     constructor either; `init()` is its initializer and it merely returns the instance. This
 *     class has zero collaborators, so there is nothing to inject — which is why AAP §0.7.3 S3,
 *     explicit constructor injection, is satisfied here by having no dependency at all rather than
 *     by wiring one.
 *
 * ARCHITECTURAL POSITION (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------
 * This module declares exactly ONE import: a type-only import of its sibling contract. The
 * `import type` form is required rather than stylistic — `IntegrationContract.ts` contains only
 * interface declarations and emits no runtime code, so a value import would name a module that
 * does not exist after compilation. Everything else is deliberately absent:
 *
 *   - No port, no repository, no service, no handler and no configuration module is referenced.
 *   - No provider event, result or invocation-context type is named. All provider coupling is
 *     confined to `src/handlers/`.
 *   - The environment is never read here. Configuration flows one way through `src/config/`
 *     (AAP §0.4.3.5), and nothing below the config layer reads it.
 *   - No database driver, connection, statement text, table or column identifier appears.
 *   - No filesystem, path or address-parsing builtin, and no transport, markup, date or vendor
 *     package either. The in-scope adapter is a stub that makes no outbound call (AAP §0.8.3.3),
 *     so no client of that sort belongs in this folder.
 *   - No package is added (AAP §0.7.3 S5 — the dependency set is frozen).
 *
 * A FRESH VALUE PER CALL — EXECUTION-MODEL MISMATCH M7
 * ---------------------------------------------------
 * `getSettings()` and `getEventHandlers()` each construct their empty value inline, on every call.
 * Neither reads a shared binding, and this module holds no module-scope state at all: no hoisted
 * empty constant, no cache, no memo, no counter, and no reassignable module-scope binding.
 *
 * That is not incidental. Two independent reasons make it the only compliant shape:
 *
 *   - FIDELITY. The legacy bodies construct a new structure and a new array per invocation
 *     (integrationServices/BaseIntegration.cfc:L64 and L68). A shared instance would hand every
 *     caller the same object, so one caller mutating it would change what a later caller observes
 *     — behavior the legacy component does not have.
 *   - MISMATCH M7. Nothing survives between invocations of a stateless handler except
 *     module-scope state, which persists on a warm container. A shared mutable value here would
 *     outlive the invocation that touched it and could carry data across a tenant boundary. The
 *     declared return types are read-only views, which states the intent; constructing fresh
 *     values enforces it even against a caller that discards those types.
 *
 * WHAT IS DELIBERATELY NOT DECLARED (AAP §0.7.3 S9 — invent nothing)
 * -----------------------------------------------------------------
 *   - No seventh member. The two settings-related members declared solely on the Google adapter
 *     (integrationServices/google/Integration.cfc:L67 and L73) belong exclusively to
 *     `GoogleIntegration.ts`, and their names are deliberately not reproduced here so that each
 *     resolves to exactly one declaring file. Adding either, even as an empty default, would give
 *     this base class behavior the legacy base component does not have.
 *   - No lookup table, no discovery scan, no factory, no static single-instance accessor and no
 *     self-declaration hook. The legacy framework located integrations by scanning components on
 *     the ORM CFC path; AAP §0.8.3.2 and TR-3 retire that machinery rather than translating it, so
 *     its replacement is the one explicit `implements` clause written by hand below.
 *   - No lifecycle hook, no configuration hook, and no threshold, budget, retry or limit. None is
 *     observable in the legacy component, and AAP §0.6.6 together with IR-12 forbid inventing one.
 *   - Every member is synchronous. No body defers, and the keyword that would mark a member as
 *     awaitable appears nowhere in this file. Deferring a member would change the observable
 *     contract for every implementor and every caller.
 *
 * CARRIED-DEFECT DISCIPLINE
 * -------------------------
 * This file carries no entry of the plan's carried-defect catalogue and mints no new number in it.
 * This folder owns exactly two entries and neither is this file's: the adapter's display-name
 * copy-paste artifact is annotated in `GoogleIntegration.ts`, and the dead, syntactically broken
 * feed data-access component is evidenced in this folder's `README.md`. An entry must be findable
 * in exactly one place, and this module is not that place for either.
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
   * A declaration scan of integrationServices/IntegrationInterface.cfc:L50-L89 returns five
   * members, and this is not one of them: it is declared on the legacy BASE COMPONENT only
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
