/**
 * The base integration's default implementations — INT-04.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/BaseIntegration.ts`, whose legacy origin is
 * `integrationServices/BaseIntegration.cfc:L49-L73` (AAP §0.4.1.10).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The legacy base declares SIX members where the interface declares five: `init` (`:L51`),
 * `getDisplayName` (`:L55`), `getIntegrationTypes` (`:L59`), `getSettings` (`:L63`),
 * `getEventHandlers` (`:L67`) and — beyond the contract — `getAdminNavbarHTML` (`:L71`). Every one is
 * a default an adapter may leave alone, so each default VALUE is observable behaviour rather than
 * incidental initialisation, and every one is asserted as an exact literal.
 *
 * Four properties carry the weight here:
 *
 *   1. THE HIBACHI BASE CLASS IS GONE. `BaseIntegration.cfc:L49` reads
 *      `component extends="Slatwall.org.Hibachi.HibachiObject"`. AAP §0.8.3.2 is unambiguous that
 *      nothing from `org/Hibachi/` is ported or depended upon, so the ported class must extend
 *      NOTHING. That is asserted directly off the prototype chain, which is the only place a dropped
 *      base class can be observed once the file compiles.
 *   2. `init()` RETURNS THE INSTANCE. `:L51-L53` is `return this;`. Identity is asserted with `toBe`,
 *      not equality, because a base that returned a copy would satisfy `toEqual` and still break the
 *      `getIntegration().init()` chaining idiom the legacy factory relies on.
 *   3. THE MUTABLE DEFAULTS ARE FRESH PER CALL. `:L63` and `:L67` return a literal `{}` and a literal
 *      `[]`. A port that hoisted either to a shared module-scope constant would pass every value
 *      assertion and then leak one integration's mutation into the next — a genuine hazard under AAP
 *      §0.6.6 M7, where module scope is the ONLY thing that survives between Lambda invocations on a
 *      warm container. Freshness is therefore proven ADVERSARIALLY: the first result is poisoned, and
 *      the next call must still be clean.
 *   4. THE DEFAULTS ARE MUTABLE, AND DELIBERATELY SO. CFML's `{}` and `[]` are ordinary mutable
 *      values, so the port neither freezes nor deep-clones them. That is asserted rather than left
 *      implicit, because inventing immutability the legacy did not have is exactly the kind of quiet
 *      "improvement" AAP §0.8.2 guideline 4 forbids.
 *
 * NO DATABASE, NO NETWORK, NO FILESYSTEM. The subject is a six-method class with no collaborators, no
 * constructor parameters and no I/O, so every case constructs it directly. Member ORDER is read off
 * `BaseIntegration.prototype` rather than out of the source text, because a class body defines its
 * methods on the prototype in declaration order and that makes the claim observable from a value.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * base integration, and AAP §0.8.3.7 requires that absence to be flagged explicitly rather than
 * implied away. TRACEABILITY HERE IS DOCUMENTARY, NEVER EMPIRICAL: MXUnit and CFSelenium are not
 * vendored (`meta/tests/readme.txt:L4-L5`), `meta/docker/slatwall-local-dev/` does not exist, and no
 * CFML runtime is reproducible in this environment, so the legacy suite was read rather than run
 * (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. The base class's own six defaults and its prototype shape. The five-member contract boundary
 * belongs to `IntegrationContract.test.ts`; the Google overrides belong to
 * `GoogleIntegration.test.ts`; no feed selection, serialization or handler behaviour appears here.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import { BaseIntegration } from '../../src/integrations/google/BaseIntegration';

import type {
  IntegrationContract,
  IntegrationSettingDescriptor,
} from '../../src/integrations/google/IntegrationContract';

/**
 * The six members in `BaseIntegration.cfc` declaration order. The sixth is beyond the contract, which
 * is why it is listed here and asserted absent in `IntegrationContract.test.ts`.
 */
const BASE_MEMBERS = [
  'init',
  'getDisplayName',
  'getIntegrationTypes',
  'getSettings',
  'getEventHandlers',
  'getAdminNavbarHTML',
] as const;

/** `:L56` — the exact literal. Not "Undefined", not an empty string, not a localised key. */
const LEGACY_DISPLAY_NAME_DEFAULT = 'Not Defined';

/**
 * A subclass that overrides nothing at all.
 *
 * AAP §0.4.3.3 replaces template-method inheritance with composition for the SERVICE layer, but the
 * integration base is an inheritance point in the legacy design and stays one here — `google/
 * Integration.cfc:L49` extends it. This class is the check that the defaults are genuinely inherited
 * rather than re-declared per adapter: if `BaseIntegration` ever stopped supplying one, an adapter
 * that overrides nothing would start returning `undefined` and the cases below would catch it.
 */
class InheritingIntegration extends BaseIntegration {}

/** Fresh instances per case, so no case can observe a value another case produced or mutated. */
function subjects(): readonly { readonly label: string; readonly subject: BaseIntegration }[] {
  return [
    { label: 'BaseIntegration', subject: new BaseIntegration() },
    { label: 'InheritingIntegration', subject: new InheritingIntegration() },
  ];
}

/** Reads the prototype's own methods in declaration order, with the constructor excluded. */
function prototypeMembersOf(constructorFunction: typeof BaseIntegration): readonly string[] {
  return Object.getOwnPropertyNames(constructorFunction.prototype).filter(
    (name) => name !== 'constructor',
  );
}

describe('NET-NEW BaseIntegration — the prototype shape (INT-04)', () => {
  it('[NET-NEW] declares the six members in the BaseIntegration.cfc order', () => {
    /*
     * `:L51`, `:L55`, `:L59`, `:L63`, `:L67`, `:L71`. A class body installs its methods on the prototype
     * in declaration order, so this asserts the ported order matches the legacy order without reading the
     * file as text.
     */
    expect(prototypeMembersOf(BaseIntegration)).toEqual([
      'init',
      'getDisplayName',
      'getIntegrationTypes',
      'getSettings',
      'getEventHandlers',
      'getAdminNavbarHTML',
    ]);
  });

  it('[NET-NEW] declares no seventh member, so the base cannot drift wider than the legacy component', () => {
    const members = prototypeMembersOf(BaseIntegration);

    expect(members).toHaveLength(BASE_MEMBERS.length);
    expect(members).toHaveLength(6);
  });

  it('[NET-NEW] extends nothing, because org/Hibachi/ is a boundary and never a carry-over', () => {
    /*
     * `BaseIntegration.cfc:L49` reads `component extends="Slatwall.org.Hibachi.HibachiObject"`. AAP
     * §0.8.3.2 forbids porting or depending on anything under `org/Hibachi/`, so the ported class sits
     * directly on `Object`. Once the file compiles, the prototype chain is the only place a dropped base
     * class is observable — an accidental `extends` would leave an extra link here.
     */
    expect(Object.getPrototypeOf(BaseIntegration.prototype)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(BaseIntegration)).toBe(Function.prototype);
  });

  it('[NET-NEW] takes no constructor argument, because the legacy initialiser takes none either', () => {
    /*
     * `:L51` — `public any function init()` declares no `<cfargument>`. The port therefore has no
     * declared constructor at all, so its arity is zero and construction cannot fail.
     */
    expect(BaseIntegration).toHaveLength(0);
    expect(new BaseIntegration()).toBeInstanceOf(BaseIntegration);
  });

  it('[NET-NEW] resolves all six members on a subclass that overrides nothing', () => {
    const subject = new InheritingIntegration();

    for (const name of BASE_MEMBERS) {
      /* `in` rather than an own-property check, because inheritance is the point of this case. */
      expect(name in subject).toBe(true);
    }

    expect(prototypeMembersOf(InheritingIntegration)).toEqual([]);
    expect(subject).toBeInstanceOf(BaseIntegration);
  });
});

describe('NET-NEW BaseIntegration — the six default values (INT-04)', () => {
  it('[NET-NEW] returns the instance itself from init, which is what `return this` means', () => {
    for (const { subject } of subjects()) {
      /*
       * `:L51-L53`. Identity, not equality: a base returning a copy would satisfy `toEqual` and still
       * break the `init()` chaining the legacy factory depends on. Two calls also return the same thing.
       */
      expect(subject.init()).toBe(subject);
      expect(subject.init()).toBe(subject.init());
    }
  });

  it('[NET-NEW] returns the exact string "Not Defined" from getDisplayName', () => {
    for (const { label, subject } of subjects()) {
      /*
       * `:L55-L57`. The literal matters: it is what an integration that forgets to override displays, and
       * `GoogleIntegration.test.ts` asserts the Google adapter does NOT return it, which only proves the
       * override took effect while this default is pinned.
       */
      expect({ from: label, displayName: subject.getDisplayName() }).toEqual({
        from: label,
        displayName: LEGACY_DISPLAY_NAME_DEFAULT,
      });
      expect(subject.getDisplayName()).toBe('Not Defined');
    }
  });

  it('[NET-NEW] returns the empty string from getIntegrationTypes', () => {
    for (const { subject } of subjects()) {
      /* `:L59-L61`. An empty token list — the base claims no integration type at all. */
      expect(subject.getIntegrationTypes()).toBe('');
      expect(subject.getIntegrationTypes()).not.toBe('fw1');
    }
  });

  it('[NET-NEW] returns an empty struct from getSettings', () => {
    for (const { subject } of subjects()) {
      const settings = subject.getSettings();

      /* `:L63-L65`. Empty, an object rather than a boolean, and not an array. */
      expect(settings).toEqual({});
      expect(Object.keys(settings)).toEqual([]);
      expect(Array.isArray(settings)).toBe(false);
    }
  });

  it('[NET-NEW] returns an empty array from getEventHandlers', () => {
    for (const { subject } of subjects()) {
      const handlers = subject.getEventHandlers();

      /* `:L67-L69`. Empty, and an array rather than the ColdSpring XML string the stale hint describes. */
      expect(handlers).toEqual([]);
      expect(Array.isArray(handlers)).toBe(true);
      expect(handlers).toHaveLength(0);
    }
  });

  it('[NET-NEW] returns the empty string from getAdminNavbarHTML, the member beyond the contract', () => {
    for (const { subject } of subjects()) {
      /*
       * `:L71-L73`. This is the sixth member — inherited by every integration yet deliberately absent
       * from the five-member contract, which `IntegrationContract.test.ts` asserts from the other side.
       * Its default is the empty string, so an integration that adds no admin navigation contributes no
       * markup rather than the string "undefined".
       */
      expect(subject.getAdminNavbarHTML()).toBe('');
      expect(typeof subject.getAdminNavbarHTML()).toBe('string');
    }
  });

  it('[NET-NEW] satisfies the five-member contract while carrying its own sixth member', () => {
    const contract: IntegrationContract = new BaseIntegration();
    const subject = new BaseIntegration();

    expect(contract.getDisplayName()).toBe(LEGACY_DISPLAY_NAME_DEFAULT);
    /* Reachable at runtime, and off the contract at compile time — both halves are the intent. */
    expect(typeof subject.getAdminNavbarHTML).toBe('function');
  });
});

describe('NET-NEW BaseIntegration — the mutable defaults are fresh per call (INT-04)', () => {
  it('[NET-NEW] hands back a different struct on every getSettings call', () => {
    const subject = new BaseIntegration();

    /*
     * `:L64` returns a LITERAL `{}`. A port that hoisted it to a module-scope constant would satisfy every
     * value assertion above and still share one object across every integration and — under AAP §0.6.6 M7
     * — across every invocation on a warm Lambda container, because module scope is the only thing that
     * survives. Reference inequality is the assertion that rules that out.
     */
    expect(subject.getSettings()).not.toBe(subject.getSettings());
  });

  it('[NET-NEW] hands back a different array on every getEventHandlers call', () => {
    const subject = new BaseIntegration();

    /* `:L68` returns a LITERAL `[]`; same hazard, same assertion. */
    expect(subject.getEventHandlers()).not.toBe(subject.getEventHandlers());
  });

  it('[NET-NEW] survives a poisoned struct: the next call is still empty', () => {
    const subject = new BaseIntegration();
    const poisonedSettings = subject.getSettings();
    const injected: Readonly<Record<string, IntegrationSettingDescriptor>> = {
      injectedByTest: { fieldType: 'select' },
    };

    /*
     * The adversarial half. `Object.assign` mutates the returned struct in place — no cast, no `any`, no
     * non-null assertion — and the next call must be unaffected. Were the default shared, the injected
     * key would reappear and this case would fail.
     */
    Object.assign(poisonedSettings, injected);
    expect(Object.keys(poisonedSettings)).toEqual(['injectedByTest']);

    expect(subject.getSettings()).toEqual({});
    expect(Object.keys(subject.getSettings())).toEqual([]);
  });

  it('[NET-NEW] survives a poisoned array: the next call is still empty', () => {
    const subject = new BaseIntegration();
    const poisonedHandlers = subject.getEventHandlers();

    /* Assigning index 0 on an empty array also advances its length, so the poison is real. */
    Object.assign(poisonedHandlers, ['injectedByTest']);
    expect(poisonedHandlers).toHaveLength(1);

    expect(subject.getEventHandlers()).toEqual([]);
    expect(subject.getEventHandlers()).toHaveLength(0);
  });

  it('[NET-NEW] shares no default between two instances', () => {
    const first = new BaseIntegration();
    const second = new BaseIntegration();

    Object.assign(first.getSettings(), { injectedByTest: { fieldType: 'select' } });
    Object.assign(first.getEventHandlers(), ['injectedByTest']);

    /* Cross-instance leakage is the same defect one step further out; it is asserted separately. */
    expect(second.getSettings()).toEqual({});
    expect(second.getEventHandlers()).toEqual([]);
    expect(first.getSettings()).not.toBe(second.getSettings());
  });

  it('[NET-NEW] leaves the defaults mutable, inventing no immutability the legacy lacked', () => {
    const subject = new BaseIntegration();

    /*
     * CFML's `{}` and `[]` are ordinary mutable values, and `:L63-L69` returns them unfrozen. Freezing
     * them here would be a quiet behavioural change of exactly the kind AAP §0.8.2 guideline 4 forbids, so
     * the port's choice is asserted rather than left to inference. Freshness per call — the three cases
     * above — is what protects callers, not immutability.
     */
    expect(Object.isFrozen(subject.getSettings())).toBe(false);
    expect(Object.isFrozen(subject.getEventHandlers())).toBe(false);
  });
});
