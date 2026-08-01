/**
 * The integration contract — INT-03.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/IntegrationContract.ts`, whose legacy origin is the `<cfinterface>` at
 * `integrationServices/IntegrationInterface.cfc:L50-L89` (AAP §0.4.1.10).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * The legacy contract is a five-member `<cfinterface>`: `init` (`:L52`), `getDisplayName` (`:L56`),
 * `getIntegrationTypes` (`:L63`), `getSettings` (`:L75`) and `getEventHandlers` (`:L82`). Three
 * further members exist in the surrounding legacy files and are DELIBERATELY not part of the
 * contract — `getAdminNavbarHTML` (`integrationServices/BaseIntegration.cfc:L71`),
 * `getIntegratedSettings` (`integrationServices/google/Integration.cfc:L67`) and `getSettingOptions`
 * (`:L73`). A port that widened the interface to five-plus-one would look harmless and would change
 * the contract every future adapter has to satisfy, so the boundary is asserted from both sides:
 * every declared name is on the contract, and every contract key is one of the declared names.
 *
 * Three properties of the legacy declaration survive translation and are each asserted here:
 *
 *   1. ARITY. Every one of the five `<cffunction>` tags declares no `<cfargument>` at all, so every
 *      ported member is zero-arity. `getSettingOptions` — the one member in the folder that DOES take
 *      an argument (`required string settingName`) — is precisely one of the three excluded.
 *   2. SYNCHRONICITY. CFML has no `async` facility, so no legacy caller can await anything. The port
 *      must therefore not have introduced a promise anywhere in the contract; AAP §0.6.6 M8 records
 *      the same commitment for `SettingResolverPort`, so no caller in the slice depends on background
 *      completion. This is asserted at RUNTIME rather than by the declared type alone, because a
 *      declaration reading `string` can still be produced by an `async` function body.
 *   3. VISIBILITY. Four of the five legacy tags carry `access="public"`; `getEventHandlers` at `:L82`
 *      carries NO `access` attribute. A TypeScript interface has no visibility facility at all, so the
 *      translation makes all five equally reachable, and the assertion is that the un-annotated member
 *      is reachable from outside its class exactly like the other four.
 *
 * TWO CARRIED DOC-DRIFT DEFECTS ARE ASSERTED AS BEHAVIOUR, NOT AS PROSE. `IntegrationInterface.cfc`
 * declares `getSettings` with `returntype="struct"` while its own hint says to "return true"; and it
 * declares `getEventHandlers` with `returntype="array"` while its hint describes ColdSpring XML. Both
 * are stale legacy prose carried across as unnumbered `TODO(parity)` notes rather than repaired, per
 * AAP §0.8.2 guideline 4. What is asserted is the DECLARED shape that the port kept — an object and an
 * array — because that is the observable behaviour; the prose is not executable and is not asserted.
 *
 * NO DATABASE, NO NETWORK, NO FILESYSTEM PRODUCT PATH. The contract is a type. Two of its cases read
 * the port's own source file as TEXT with `node:fs`/`node:path`, because "declares exactly five
 * members, in this order" is a property of the declaration and cannot be observed from a value at
 * runtime — an interface leaves nothing behind after compilation. Nothing here parses, evaluates or
 * modifies that file, and no product behaviour is routed through either built-in. Only files inside
 * this subtree are read: the CFML tree is reference-only and is never touched by a test.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * integration contract, the base integration or the Google adapter, and AAP §0.8.3.7 requires that
 * absence to be flagged explicitly rather than implied away. TRACEABILITY HERE IS DOCUMENTARY, NEVER
 * EMPIRICAL: MXUnit and CFSelenium are not vendored (`meta/tests/readme.txt:L4-L5`),
 * `meta/docker/slatwall-local-dev/` does not exist, and no CFML runtime is reproducible in this
 * environment, so the legacy suite was read rather than run (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. The contract's declaration and the conformance of the two classes that implement it. This
 * file asserts no default VALUE (that is `BaseIntegration.test.ts`), no Google override (that is
 * `GoogleIntegration.test.ts`), no feed selection, no serialization and no handler behaviour.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BaseIntegration } from '../../src/integrations/google/BaseIntegration';
import { GoogleIntegration } from '../../src/integrations/google/GoogleIntegration';

import type {
  IntegrationContract,
  IntegrationSettingDescriptor,
} from '../../src/integrations/google/IntegrationContract';

/* =================================================================================================
 * Compile-time claims.
 *
 * `type AssertAssignable<TActual extends TExpected, TExpected> = TActual` fails to COMPILE when the
 * claim stops holding, which is the only way to assert something about an interface that leaves no
 * runtime value behind. The two mutual aliases below are together an exhaustiveness proof: dropping a
 * member from the contract breaks the first, and adding a sixth breaks the second.
 * ============================================================================================== */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/** The five members, in the `<cfinterface>` declaration order of `IntegrationInterface.cfc`. */
const CONTRACT_MEMBERS = [
  'init',
  'getDisplayName',
  'getIntegrationTypes',
  'getSettings',
  'getEventHandlers',
] as const;

type DeclaredMemberName = (typeof CONTRACT_MEMBERS)[number];

type _EveryDeclaredNameIsOnTheContract = AssertAssignable<
  DeclaredMemberName,
  keyof IntegrationContract
>;
type _EveryContractKeyIsDeclaredHere = AssertAssignable<
  keyof IntegrationContract,
  DeclaredMemberName
>;

/**
 * The three members that exist in the folder and are deliberately NOT on the contract, each with the
 * legacy locator that would justify adding it if the boundary were ever widened.
 */
const EXCLUDED_CANDIDATES = [
  'getAdminNavbarHTML',
  'getIntegratedSettings',
  'getSettingOptions',
] as const;

type ExcludedCandidateName = (typeof EXCLUDED_CANDIDATES)[number];

/** `Extract` collapses to `never` only while none of the three has reached the contract. */
type _NoExcludedCandidateReachedTheContract = AssertAssignable<
  Extract<keyof IntegrationContract, ExcludedCandidateName>,
  never
>;

type _BaseIntegrationConformsToTheContract = AssertAssignable<BaseIntegration, IntegrationContract>;
type _GoogleIntegrationConformsToTheContract = AssertAssignable<
  GoogleIntegration,
  IntegrationContract
>;

/* =================================================================================================
 * A conformer that is NOT a `BaseIntegration`.
 *
 * `integrationServices/google/Integration.cfc:L49` both `extends` the base and `implements` the
 * interface, but those are independent declarations: the interface itself demands no base class. This
 * class proves the ported contract kept that independence — if the port had folded a base-class
 * dependency into the interface, this would stop compiling.
 * ============================================================================================== */
class MinimalConformer implements IntegrationContract {
  public init(): this {
    return this;
  }

  public getDisplayName(): string {
    return 'Minimal';
  }

  public getIntegrationTypes(): string {
    return 'custom';
  }

  public getSettings(): Readonly<Record<string, IntegrationSettingDescriptor>> {
    return {};
  }

  public getEventHandlers(): readonly unknown[] {
    return [];
  }
}

/* =================================================================================================
 * Exhaustive member access without `any`.
 *
 * Both records are keyed by the member-name union, so a member added to or removed from
 * `CONTRACT_MEMBERS` fails to compile here rather than silently going unasserted. One record hands
 * back the FUNCTION (for arity and for the `AsyncFunction` check), the other INVOKES it (for the
 * returned-value checks); neither needs `Function.prototype.call`, a cast, or a non-null assertion.
 * ============================================================================================== */
type ContractMethod = (...args: never[]) => unknown;

const METHOD_READERS: Readonly<
  Record<DeclaredMemberName, (subject: IntegrationContract) => ContractMethod>
> = {
  init: (subject) => subject.init,
  getDisplayName: (subject) => subject.getDisplayName,
  getIntegrationTypes: (subject) => subject.getIntegrationTypes,
  getSettings: (subject) => subject.getSettings,
  getEventHandlers: (subject) => subject.getEventHandlers,
};

const METHOD_INVOKERS: Readonly<
  Record<DeclaredMemberName, (subject: IntegrationContract) => unknown>
> = {
  init: (subject) => subject.init(),
  getDisplayName: (subject) => subject.getDisplayName(),
  getIntegrationTypes: (subject) => subject.getIntegrationTypes(),
  getSettings: (subject) => subject.getSettings(),
  getEventHandlers: (subject) => subject.getEventHandlers(),
};

/** Fresh instances per case, so no case can observe a value another case produced. */
function conformers(): readonly {
  readonly label: string;
  readonly subject: IntegrationContract;
}[] {
  return [
    { label: 'BaseIntegration', subject: new BaseIntegration() },
    { label: 'GoogleIntegration', subject: new GoogleIntegration() },
    { label: 'MinimalConformer', subject: new MinimalConformer() },
  ];
}

/* =================================================================================================
 * Source-text inspection.
 *
 * An interface produces no runtime value, so "declares exactly these five, in this order" can only be
 * observed in the declaration itself. The port's own file is read as text and the member lines are
 * lifted out of the interface body. `readDeclaredContractMembers` deliberately re-reads on every call
 * rather than memoising at module scope, so no case can be influenced by another's read.
 * ============================================================================================== */
const CONTRACT_SOURCE_PATH = join(
  __dirname,
  '..',
  '..',
  'src',
  'integrations',
  'google',
  'IntegrationContract.ts',
);

const CONTRACT_INTERFACE_OPENING = 'export interface IntegrationContract {';

/** Matches a two-space-indented member declaration such as `  getSettings(): …;`. */
const MEMBER_DECLARATION_PATTERN = /^ {2}([A-Za-z][A-Za-z0-9]*)\(/;

interface ContractDeclaration {
  /** The interface body, exclusive of the opening line and the closing brace. */
  readonly body: string;
  /** Member names in declaration order. */
  readonly members: readonly string[];
}

function readDeclaredContractMembers(): ContractDeclaration {
  const text = readFileSync(CONTRACT_SOURCE_PATH, 'utf8');
  const opensAt = text.indexOf(CONTRACT_INTERFACE_OPENING);

  if (opensAt === -1) {
    throw new Error(
      `${CONTRACT_SOURCE_PATH} no longer declares "${CONTRACT_INTERFACE_OPENING}", so the source-text ` +
        'cases below would assert nothing. Fix the reader rather than deleting the cases.',
    );
  }

  const bodyStart = opensAt + CONTRACT_INTERFACE_OPENING.length;
  const closesAt = text.indexOf('\n}', bodyStart);

  if (closesAt === -1) {
    throw new Error(
      `${CONTRACT_SOURCE_PATH} has no closing brace after the interface opening, so the body could not ` +
        'be bounded.',
    );
  }

  const body = text.slice(bodyStart, closesAt);
  const members: string[] = [];

  for (const line of body.split('\n')) {
    const matched = MEMBER_DECLARATION_PATTERN.exec(line);
    const name = matched?.[1];

    if (name !== undefined) {
      members.push(name);
    }
  }

  return { body, members };
}

describe('NET-NEW IntegrationContract — the five declared members (INT-03)', () => {
  it('[NET-NEW] reads the interface body, so the two source-text cases below assert something', () => {
    const declaration = readDeclaredContractMembers();

    /*
     * A self-check on the reader. Without it, a bad slice would leave both censuses vacuously green.
     * The body must be non-empty and must not have overrun into the sibling interface declaration.
     */
    expect(declaration.body.length).toBeGreaterThan(0);
    expect(declaration.body).not.toContain('export interface');
    expect(declaration.members.length).toBeGreaterThan(0);
  });

  it('[NET-NEW] declares the five members in the IntegrationInterface.cfc order', () => {
    const { members } = readDeclaredContractMembers();

    /*
     * `:L52`, `:L56`, `:L63`, `:L75`, `:L82` — the order the legacy `<cffunction>` tags sit in. Order is
     * asserted, not just membership, because the ported file is the contract a reviewer reads against the
     * legacy interface side by side, and a reordered declaration makes that comparison harder for no gain.
     */
    expect(members).toEqual([
      'init',
      'getDisplayName',
      'getIntegrationTypes',
      'getSettings',
      'getEventHandlers',
    ]);
  });

  it('[NET-NEW] declares no sixth member, so the contract cannot drift wider than the interface', () => {
    const { members } = readDeclaredContractMembers();

    expect(members).toHaveLength(CONTRACT_MEMBERS.length);
    expect(members).toHaveLength(5);

    /*
     * The compile-time half of the same claim lives in `_EveryContractKeyIsDeclaredHere` above: a sixth
     * key on the interface would fail `tsc` before this case ever ran. Both halves are kept, because the
     * type alias catches a widened INTERFACE while this case also catches a widened FILE — a member added
     * to the declaration but shadowed by an identical name elsewhere would slip past the type alone.
     */
  });

  it('[NET-NEW] excludes the three candidate sixth members that exist elsewhere in the folder', () => {
    const { members } = readDeclaredContractMembers();

    /*
     * `getAdminNavbarHTML` — BaseIntegration.cfc:L71. Present on the BASE CLASS, so every integration
     * inherits it; absent from the interface, so no adapter is obliged to provide it.
     * `getIntegratedSettings` — google/Integration.cfc:L67. A Google-only member.
     * `getSettingOptions` — google/Integration.cfc:L73. Google-only, and the ONE member in the folder
     * that takes an argument, which is why the zero-arity case below can be unconditional.
     */
    for (const candidate of EXCLUDED_CANDIDATES) {
      expect(members).not.toContain(candidate);
    }

    /* The values are asserted too, so the list itself cannot silently empty out and pass. */
    expect(EXCLUDED_CANDIDATES).toEqual([
      'getAdminNavbarHTML',
      'getIntegratedSettings',
      'getSettingOptions',
    ]);
  });

  it('[NET-NEW] resolves every declared name on every conformer, wired to the member of that name', () => {
    for (const { label, subject } of conformers()) {
      for (const name of CONTRACT_MEMBERS) {
        const method = METHOD_READERS[name](subject);

        /*
         * `method.name` guards the reader record itself. A copy-paste slip in `METHOD_READERS` would hand
         * back a different member and every other case in this file would still report green, so the
         * wiring is asserted rather than assumed. The conformer label rides along inside the compared
         * object so a failure names which of the three broke.
         */
        expect({ conformer: label, member: name, resolved: method.name }).toEqual({
          conformer: label,
          member: name,
          resolved: name,
        });
        expect(typeof method).toBe('function');
      }
    }
  });
});

describe('NET-NEW IntegrationContract — arity, synchronicity and visibility (INT-03)', () => {
  it('[NET-NEW] declares every member zero-arity, because no legacy tag declares a cfargument', () => {
    for (const { subject } of conformers()) {
      for (const name of CONTRACT_MEMBERS) {
        /*
         * `IntegrationInterface.cfc:L52-L87` — five `<cffunction>` tags, zero `<cfargument>` tags between
         * them. The one legacy member that does take an argument, `getSettingOptions(required string
         * settingName)`, is deliberately off the contract, so this holds for all five without exception.
         */
        expect(METHOD_READERS[name](subject)).toHaveLength(0);
      }
    }
  });

  it('[NET-NEW] declares no member async, proven from the function rather than the return type', () => {
    for (const { subject } of conformers()) {
      for (const name of CONTRACT_MEMBERS) {
        const method = METHOD_READERS[name](subject);

        /*
         * A declaration reading `: string` can still be produced by an `async` body that returns a
         * promise, so the constructor name is what settles it. CFML has no async facility at all, so an
         * `AsyncFunction` anywhere here would be an invention of the port (AAP §0.8.3.5, IR-12).
         */
        expect(method.constructor.name).toBe('Function');
        expect(method.constructor.name).not.toBe('AsyncFunction');
      }
    }
  });

  it('[NET-NEW] returns a settled value from every member, never a promise to await', () => {
    for (const { subject } of conformers()) {
      for (const name of CONTRACT_MEMBERS) {
        const returned = METHOD_INVOKERS[name](subject);

        /*
         * The runtime half of the synchronicity claim. AAP §0.6.6 M8 records the same commitment for
         * `SettingResolverPort`: the contract is synchronous so no caller in the slice can come to depend
         * on background completion.
         */
        expect(returned).not.toBeInstanceOf(Promise);
        expect(returned).toBeDefined();
      }
    }
  });

  it('[NET-NEW] leaves getEventHandlers as reachable as the four that declare access="public"', () => {
    /*
     * `IntegrationInterface.cfc:L82` is the one tag with NO `access` attribute, while `:L52`, `:L56`,
     * `:L63` and `:L75` all declare `access="public"`. A TypeScript interface has no visibility facility,
     * so the translation makes all five equally reachable; the observable claim is that the un-annotated
     * member is callable from outside its class exactly like its four siblings.
     */
    for (const { subject } of conformers()) {
      expect(Array.isArray(subject.getEventHandlers())).toBe(true);
      expect(typeof subject.getDisplayName()).toBe('string');
    }
  });
});

describe('NET-NEW IntegrationContract — the declared return shapes (INT-03)', () => {
  it('[NET-NEW] returns the subject itself from init, which is what `return this` means', () => {
    for (const { subject } of conformers()) {
      /* `IntegrationInterface.cfc:L52` declares `returntype="any"`; every implementation returns itself. */
      expect(subject.init()).toBe(subject);
    }
  });

  it('[NET-NEW] returns a string from getDisplayName and getIntegrationTypes', () => {
    for (const { subject } of conformers()) {
      expect(typeof subject.getDisplayName()).toBe('string');
      expect(typeof subject.getIntegrationTypes()).toBe('string');
    }
  });

  it('[NET-NEW] returns a struct from getSettings, carrying the stale "return true" hint unrepaired', () => {
    for (const { subject } of conformers()) {
      const settings = subject.getSettings();

      /*
       * TODO(parity), unnumbered — IntegrationInterface.cfc:L75-L79. The tag declares
       * `returntype="struct"` while its own hint says to "return true only if there is a
       * /views/main/default.cfm file". The prose is stale and is carried across rather than repaired
       * (AAP §0.8.2 guideline 4); what is asserted is the DECLARED shape the port kept, because that is
       * the part that is executable.
       */
      expect(typeof settings).toBe('object');
      expect(settings).not.toBeNull();
      expect(typeof settings).not.toBe('boolean');
      expect(Array.isArray(settings)).toBe(false);
    }
  });

  it('[NET-NEW] returns an array from getEventHandlers, carrying the stale ColdSpring hint unrepaired', () => {
    for (const { subject } of conformers()) {
      const handlers = subject.getEventHandlers();

      /*
       * TODO(parity), unnumbered — IntegrationInterface.cfc:L82-L86. The tag declares
       * `returntype="array"` while its hint describes "valid coldspring xml". Same treatment: the
       * declared shape is asserted, the stale prose is not repaired.
       */
      expect(Array.isArray(handlers)).toBe(true);
      expect(typeof handlers).not.toBe('string');
    }
  });

  it('[NET-NEW] types a settings entry by its fieldType alone, matching IntegrationSettingDescriptor', () => {
    /*
     * The descriptor is the only other export of the contract file. Its single member is what the Google
     * adapter's `getIntegratedSettings` actually produces — `{ fieldType: "select" }` at
     * google/Integration.cfc:L67-L71 — so a descriptor that grew a second required member would break
     * that adapter. Asserting the shape here keeps the two files honest about one another.
     */
    const descriptor: IntegrationSettingDescriptor = { fieldType: 'select' };

    expect(Object.keys(descriptor)).toEqual(['fieldType']);
    expect(descriptor.fieldType).toBe('select');
  });
});

describe('NET-NEW IntegrationContract — conformance of the shipped implementations (INT-03)', () => {
  it('[NET-NEW] is satisfied by BaseIntegration', () => {
    const subject: IntegrationContract = new BaseIntegration();

    for (const name of CONTRACT_MEMBERS) {
      expect(typeof METHOD_READERS[name](subject)).toBe('function');
    }
  });

  it('[NET-NEW] is satisfied by GoogleIntegration', () => {
    const subject: IntegrationContract = new GoogleIntegration();

    for (const name of CONTRACT_MEMBERS) {
      expect(typeof METHOD_READERS[name](subject)).toBe('function');
    }
  });

  it('[NET-NEW] is satisfiable without extending BaseIntegration, as the legacy interface demands', () => {
    /*
     * `google/Integration.cfc:L49` carries `extends="…BaseIntegration"` AND
     * `implements="…IntegrationInterface"` as two independent declarations. The interface itself demands
     * no base class, and `MinimalConformer` is the proof the port preserved that: it satisfies the
     * contract while inheriting nothing. Were the port to have folded a base-class dependency into the
     * interface, the class declaration above would not compile.
     */
    const subject = new MinimalConformer();

    expect(subject).not.toBeInstanceOf(BaseIntegration);
    expect(subject.getDisplayName()).toBe('Minimal');
    expect(subject.getIntegrationTypes()).toBe('custom');
    expect(subject.init()).toBe(subject);
  });

  it('[NET-NEW] exposes no member that reaches Google, so the stub cannot make a live call', () => {
    /*
     * AAP §0.8.3.3 — the adapter is a stub and no live call to Google is introduced anywhere. The contract
     * is the surface a future adapter is written against, so the claim belongs here as well as in
     * `GoogleIntegration.test.ts`: nothing the contract can return is a Google endpoint or credential.
     */
    for (const { subject } of conformers()) {
      const rendered = [
        subject.getDisplayName(),
        subject.getIntegrationTypes(),
        JSON.stringify(subject.getSettings()),
        JSON.stringify(subject.getEventHandlers()),
      ].join(' ');

      expect(rendered).not.toContain('http://');
      expect(rendered).not.toContain('https://');
      expect(rendered.toLowerCase()).not.toContain('googleapis');
      expect(rendered.toLowerCase()).not.toContain('oauth');
    }
  });
});
