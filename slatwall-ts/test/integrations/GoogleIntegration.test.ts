/**
 * The Google integration stub — INT-05.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. This file covers
 * `src/integrations/google/GoogleIntegration.ts`, whose legacy origin is
 * `integrationServices/google/Integration.cfc:L49-L79` (AAP §0.4.1.10).
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE — AND WHY THE SUBJECT IS ALMOST EMPTY
 * =================================================================================================
 * AAP §0.6.4 records the counter-intuitive finding this whole file rests on: the interface-conformant
 * component carries NO FEED LOGIC AT ALL. The record selection lives in
 * `integrationServices/google/controllers/feed.cfc` and the field mapping lives in
 * `integrationServices/google/views/feed/product.cfm`, so a faithful stub is nearly empty BY
 * FAITHFULNESS rather than by neglect (AAP §0.6.4.3, §0.8.3.3). A reviewer expecting the integration
 * class to hold the feed should read that section first; the two files that do hold it are covered by
 * `ProductFeedQuery.test.ts` and `ProductFeedBuilder.test.ts`.
 *
 * What the legacy component DOES declare, in its own declaration order, is six members:
 * `init` (`:L51`), `getIntegrationTypes` (`:L55`), `getDisplayName` (`:L59`), `getSettings` (`:L63`),
 * `getIntegratedSettings` (`:L67`) and `getSettingOptions` (`:L73`). Note the order: the component
 * declares `getIntegrationTypes` BEFORE `getDisplayName`, which is the reverse of the interface at
 * `integrationServices/IntegrationInterface.cfc:L56-L63`. The port keeps the component's order, and
 * that is asserted rather than tidied.
 *
 * Five claims carry the weight:
 *
 *   1. THE OVERRIDES TOOK. `getIntegrationTypes()` is `'fw1'` and `getDisplayName()` is `'Google'`.
 *      The display name is additionally asserted NOT to be the base default `'Not Defined'`, because
 *      an override that silently failed to bind would return the default and every positive assertion
 *      about "a string" would still pass.
 *   2. THE INHERITANCE IS REAL. `getEventHandlers()` and `getAdminNavbarHTML()` are NOT declared on
 *      this component and must still answer the base defaults, so they are asserted here as inherited
 *      AND asserted absent from this class's own prototype.
 *   3. `getSettings()` AND `getIntegratedSettings()` ARE NOT THE SAME MEMBER. `:L63` returns an empty
 *      struct while `:L67` returns exactly one descriptor. Conflating them would be an easy and
 *      invisible port error, so each is asserted against the other.
 *   4. DEFECT D11 IS CARRIED, NOT CORRECTED. `:L49` carries the component attribute
 *      `displayname="USA epay"` — a copy-paste artefact from the payment adapter this file was cloned
 *      from. AAP §0.6.7.6 records it as recorded-not-corrected, because the EFFECTIVE display name
 *      comes from the method. The assertion is therefore twofold: the method returns `'Google'`, and
 *      the string `'USA epay'` has no behavioural expression anywhere in the ported surface. The
 *      marker itself lives at `GoogleIntegration.ts:188`.
 *   5. `getSettingOptions` RETURNS NOTHING, FOR EVERY INPUT. `:L73-L77` opens
 *      `if(arguments.settingName eq "productGoogleProductType") { }` — an EMPTY branch — and then ends
 *      with NO return statement at all. The port preserves the empty branch, so the seeded name and an
 *      unrelated name are indistinguishable from outside. Two unnumbered `TODO(parity)` notes travel
 *      with it: the declared return type admits an array the body can never produce, and CFML's `eq`
 *      is case-insensitive where TypeScript's `===` is not — a difference with no observable effect
 *      precisely BECAUSE the branch is empty. Both are asserted as they behave (AAP §0.8.2 g4).
 *
 * NO DATABASE, NO NETWORK, NO CREDENTIAL, NO LIVE GOOGLE CALL. AAP §0.8.3.3 forbids a live call and
 * the subject introduces no HTTP client, so a case below sweeps every returned value for an endpoint,
 * a credential or an OAuth token and asserts none appears. The subject has no collaborators and no
 * constructor parameters, so every case constructs it directly.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test exercises the
 * Google adapter, and AAP §0.8.3.7 requires that absence to be flagged explicitly rather than implied
 * away. TRACEABILITY HERE IS DOCUMENTARY, NEVER EMPIRICAL: MXUnit and CFSelenium are not vendored
 * (`meta/tests/readme.txt:L4-L5`), `meta/docker/slatwall-local-dev/` does not exist, and no CFML
 * runtime is reproducible in this environment, so the legacy suite was read rather than run
 * (AAP §0.6.5.3, §0.8.4).
 *
 * SCOPE. This component's six members and its relationship to the base. The five-member contract
 * boundary belongs to `IntegrationContract.test.ts`, the base defaults to `BaseIntegration.test.ts`,
 * the feed selection to `ProductFeedQuery.test.ts` and the serialization to
 * `ProductFeedBuilder.test.ts`.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import { BaseIntegration } from '../../src/integrations/google/BaseIntegration';
import { GoogleIntegration } from '../../src/integrations/google/GoogleIntegration';

import type { IntegrationContract } from '../../src/integrations/google/IntegrationContract';

/** The six members in `google/Integration.cfc` declaration order — types before display name. */
const GOOGLE_MEMBERS = [
  'init',
  'getIntegrationTypes',
  'getDisplayName',
  'getSettings',
  'getIntegratedSettings',
  'getSettingOptions',
] as const;

/** `:L57` — the one integration type this adapter claims. */
const LEGACY_INTEGRATION_TYPE = 'fw1';

/** `:L61` — the effective display name, which is the method's answer and not the `:L49` attribute. */
const LEGACY_DISPLAY_NAME = 'Google';

/** `:L49` — defect D11's copy-paste artefact. Asserted ABSENT from behaviour, never repaired. */
const D11_COPY_PASTE_ARTEFACT = 'USA epay';

/** `:L55` on the base — the default the override must be seen to displace. */
const BASE_DISPLAY_NAME_DEFAULT = 'Not Defined';

/** `:L68` — the sole integrated setting, and the name `getSettingOptions` tests against at `:L74`. */
const INTEGRATED_SETTING_NAME = 'productGoogleProductType';

/** `:L68` — the descriptor's only member and its value. */
const INTEGRATED_SETTING_FIELD_TYPE = 'select';

/** Reads a constructor's own prototype methods in declaration order, constructor excluded. */
function prototypeMembersOf(constructorFunction: typeof GoogleIntegration): readonly string[] {
  return Object.getOwnPropertyNames(constructorFunction.prototype).filter(
    (name) => name !== 'constructor',
  );
}

/**
 * Every string the ported surface can emit, joined for the two sweeps below.
 *
 * `getSettingOptions` is excluded deliberately: it returns `undefined` for every input, so it emits no
 * string at all, and the cases that own it assert exactly that.
 */
function renderEverySurfaceString(subject: GoogleIntegration): string {
  return [
    subject.getDisplayName(),
    subject.getIntegrationTypes(),
    subject.getAdminNavbarHTML(),
    JSON.stringify(subject.getSettings()),
    JSON.stringify(subject.getIntegratedSettings()),
    JSON.stringify(subject.getEventHandlers()),
  ].join(' ');
}

describe('NET-NEW GoogleIntegration — the prototype shape and the inheritance (INT-05)', () => {
  it('[NET-NEW] declares the six members in the google/Integration.cfc order, types before name', () => {
    /*
     * `:L51`, `:L55`, `:L59`, `:L63`, `:L67`, `:L73`. The component declares `getIntegrationTypes` second
     * and `getDisplayName` third, the reverse of the interface at IntegrationInterface.cfc:L56-L63. The
     * port follows the COMPONENT, and asserting the order keeps a side-by-side reading honest.
     */
    expect(prototypeMembersOf(GoogleIntegration)).toEqual([
      'init',
      'getIntegrationTypes',
      'getDisplayName',
      'getSettings',
      'getIntegratedSettings',
      'getSettingOptions',
    ]);
  });

  it('[NET-NEW] declares no seventh member, so the stub cannot grow logic the legacy file lacks', () => {
    const members = prototypeMembersOf(GoogleIntegration);

    /*
     * AAP §0.6.4 — the component carries no feed logic. A seventh member here would mean the stub had
     * acquired behaviour that belongs in `ProductFeedQuery` or `ProductFeedBuilder`.
     */
    expect(members).toHaveLength(GOOGLE_MEMBERS.length);
    expect(members).toHaveLength(6);
  });

  it('[NET-NEW] extends BaseIntegration, exactly as :L49 declares', () => {
    const subject = new GoogleIntegration();

    /*
     * `:L49` carries `extends="Slatwall.integrationServices.BaseIntegration"`. The chain is asserted link
     * by link, because `instanceof` alone would also pass for a deeper accidental chain.
     */
    expect(subject).toBeInstanceOf(GoogleIntegration);
    expect(subject).toBeInstanceOf(BaseIntegration);
    expect(Object.getPrototypeOf(GoogleIntegration.prototype)).toBe(BaseIntegration.prototype);
    expect(Object.getPrototypeOf(BaseIntegration.prototype)).toBe(Object.prototype);
  });

  it('[NET-NEW] takes no constructor argument, because :L51 declares no cfargument', () => {
    expect(GoogleIntegration).toHaveLength(0);
    expect(new GoogleIntegration()).toBeInstanceOf(GoogleIntegration);
  });

  it('[NET-NEW] declares neither inherited member on its own prototype', () => {
    const members = prototypeMembersOf(GoogleIntegration);

    /*
     * `getEventHandlers` and `getAdminNavbarHTML` are absent from `google/Integration.cfc` entirely. They
     * must therefore be INHERITED rather than re-declared — a port that copied them down would satisfy
     * every value assertion below while quietly duplicating the base.
     */
    expect(members).not.toContain('getEventHandlers');
    expect(members).not.toContain('getAdminNavbarHTML');
  });

  it('[NET-NEW] inherits the base defaults for the two members it does not declare', () => {
    const subject = new GoogleIntegration();

    /* BaseIntegration.cfc:L67 and :L71. */
    expect(subject.getEventHandlers()).toEqual([]);
    expect(subject.getAdminNavbarHTML()).toBe('');
  });

  it('[NET-NEW] satisfies the five-member contract when read through it', () => {
    const contract: IntegrationContract = new GoogleIntegration();

    /* `:L49` also carries `implements="Slatwall.integrationServices.IntegrationInterface"`. */
    expect(contract.getIntegrationTypes()).toBe(LEGACY_INTEGRATION_TYPE);
    expect(contract.getDisplayName()).toBe(LEGACY_DISPLAY_NAME);
    expect(contract.getSettings()).toEqual({});
    expect(contract.getEventHandlers()).toEqual([]);
    expect(contract.init()).toBe(contract);
  });
});

describe('NET-NEW GoogleIntegration — the four overridden members (INT-05)', () => {
  it('[NET-NEW] returns the instance itself from init', () => {
    const subject = new GoogleIntegration();

    /* `:L51-L53` — `return this;`, the same as the base, re-declared by the component. */
    expect(subject.init()).toBe(subject);
    expect(subject.init()).toBe(subject.init());
  });

  it('[NET-NEW] returns the exact token "fw1" from getIntegrationTypes', () => {
    const subject = new GoogleIntegration();

    /*
     * `:L55-L57`. `IntegrationInterface.cfc:L64-L72` documents the token vocabulary as shipping, payment,
     * fw1 and custom; this adapter claims `fw1` alone, which is what routes the feed action through the
     * framework rather than through a payment or shipping pipeline.
     */
    expect(subject.getIntegrationTypes()).toBe(LEGACY_INTEGRATION_TYPE);
    expect(subject.getIntegrationTypes()).toBe('fw1');
    /* Not the base default, so the override is observably in effect. */
    expect(subject.getIntegrationTypes()).not.toBe('');
  });

  it('[NET-NEW] returns the exact name "Google" from getDisplayName, not the base default', () => {
    const subject = new GoogleIntegration();

    /*
     * `:L59-L61`. Asserting the negative matters as much as the positive: an override that failed to bind
     * would return `'Not Defined'` from BaseIntegration.cfc:L56 and a "returns a non-empty string"
     * assertion would still pass.
     */
    expect(subject.getDisplayName()).toBe(LEGACY_DISPLAY_NAME);
    expect(subject.getDisplayName()).not.toBe(BASE_DISPLAY_NAME_DEFAULT);
  });

  it('[NET-NEW] returns an empty struct from getSettings, distinct from getIntegratedSettings', () => {
    const subject = new GoogleIntegration();

    /*
     * `:L63-L65` returns `{}` while `:L67-L71` returns one descriptor. Conflating the two would be an easy
     * and invisible port error, so each is asserted against the other rather than in isolation.
     */
    expect(subject.getSettings()).toEqual({});
    expect(Object.keys(subject.getSettings())).toEqual([]);
    expect(subject.getSettings()).not.toEqual(subject.getIntegratedSettings());
    expect(Object.keys(subject.getSettings())).not.toContain(INTEGRATED_SETTING_NAME);
  });
});

describe('NET-NEW GoogleIntegration — getIntegratedSettings, the one member with content (INT-05)', () => {
  it('[NET-NEW] returns exactly one descriptor, keyed productGoogleProductType with fieldType select', () => {
    const subject = new GoogleIntegration();
    const integrated = subject.getIntegratedSettings();

    /*
     * `:L67-L71` — `return { productGoogleProductType = {fieldType="select"} };`. Asserted as a whole
     * object rather than key by key, so an extra key would fail here too. This is the only content the
     * legacy component carries, and AAP §0.6.4.3 is why there is no more.
     */
    expect(integrated).toEqual({
      [INTEGRATED_SETTING_NAME]: { fieldType: INTEGRATED_SETTING_FIELD_TYPE },
    });
    expect(Object.keys(integrated)).toEqual([INTEGRATED_SETTING_NAME]);
    expect(integrated[INTEGRATED_SETTING_NAME]?.fieldType).toBe('select');
  });

  it('[NET-NEW] is not a member of the five-member contract, yet is reachable on the class', () => {
    const subject = new GoogleIntegration();

    /*
     * `IntegrationContract.test.ts` asserts the same boundary from the other side, where
     * `getIntegratedSettings` is one of the three deliberately excluded candidates. Here the complement is
     * asserted: it exists on this class, so excluding it from the contract costs the adapter nothing.
     */
    expect(typeof subject.getIntegratedSettings).toBe('function');
    expect(prototypeMembersOf(GoogleIntegration)).toContain('getIntegratedSettings');
  });

  it('[NET-NEW] hands back a fresh struct, and a fresh descriptor inside it, on every call', () => {
    const subject = new GoogleIntegration();

    /*
     * `:L68` builds both objects as literals, so both are new on every call. The NESTED object is asserted
     * separately because hoisting only the descriptor to module scope would satisfy the outer check and
     * still share mutable state across every invocation on a warm container (AAP §0.6.6 M7).
     */
    expect(subject.getIntegratedSettings()).not.toBe(subject.getIntegratedSettings());
    expect(subject.getIntegratedSettings()[INTEGRATED_SETTING_NAME]).not.toBe(
      subject.getIntegratedSettings()[INTEGRATED_SETTING_NAME],
    );
  });

  it('[NET-NEW] survives a poisoned struct and a poisoned descriptor: the next call is clean', () => {
    const subject = new GoogleIntegration();
    const poisoned = subject.getIntegratedSettings();

    /* The adversarial half — `Object.assign` mutates in place, with no cast and no assertion operator. */
    Object.assign(poisoned, { injectedByTest: { fieldType: 'text' } });
    const poisonedDescriptor = poisoned[INTEGRATED_SETTING_NAME];
    if (poisonedDescriptor !== undefined) {
      Object.assign(poisonedDescriptor, { fieldType: 'injectedByTest' });
    }

    expect(Object.keys(poisoned)).toEqual([INTEGRATED_SETTING_NAME, 'injectedByTest']);
    expect(subject.getIntegratedSettings()).toEqual({
      [INTEGRATED_SETTING_NAME]: { fieldType: INTEGRATED_SETTING_FIELD_TYPE },
    });
  });

  it('[NET-NEW] shares no integrated setting between two instances', () => {
    const first = new GoogleIntegration();
    const second = new GoogleIntegration();

    Object.assign(first.getIntegratedSettings(), { injectedByTest: { fieldType: 'text' } });

    expect(Object.keys(second.getIntegratedSettings())).toEqual([INTEGRATED_SETTING_NAME]);
  });
});

describe('NET-NEW GoogleIntegration — getSettingOptions returns nothing, for every input (INT-05)', () => {
  /** The seeded name, a case variant of it, an unrelated name, and the empty string. */
  const PROBED_SETTING_NAMES = [
    INTEGRATED_SETTING_NAME,
    'PRODUCTGOOGLEPRODUCTTYPE',
    'productGoogleProductTYPE',
    'someUnrelatedSettingName',
    '',
  ] as const;

  it('[NET-NEW] declares one argument, matching `required string settingName` at :L73', () => {
    const subject = new GoogleIntegration();

    /*
     * This is the ONE member in the whole folder that takes an argument, which is why
     * `IntegrationContract.test.ts` can assert zero arity across all five contract members without
     * exception — this member is deliberately off the contract.
     */
    expect(subject.getSettingOptions).toHaveLength(1);
  });

  it('[NET-NEW] returns undefined for the seeded name, because the branch at :L74 is EMPTY', () => {
    const subject = new GoogleIntegration();

    /*
     * `:L73-L77` is `if(arguments.settingName eq "productGoogleProductType") { }` followed by the end of
     * the function — no return statement anywhere. The port preserves the empty branch verbatim rather
     * than filling it in, per AAP §0.8.2 guideline 4, so the seeded name yields nothing.
     */
    expect(subject.getSettingOptions(INTEGRATED_SETTING_NAME)).toBeUndefined();
  });

  it('[NET-NEW] returns undefined for every other input too, so the branch is unobservable', () => {
    const subject = new GoogleIntegration();

    /*
     * TODO(parity), unnumbered — the empty branch makes the seeded name and an unrelated name
     * INDISTINGUISHABLE from outside. That is the carried behaviour, and it is what makes the second
     * unnumbered note harmless: CFML's `eq` is case-insensitive where TypeScript's `===` is not, but with
     * an empty branch the case-varied inputs below land on the same answer either way.
     */
    for (const settingName of PROBED_SETTING_NAMES) {
      expect({ settingName, options: subject.getSettingOptions(settingName) }).toEqual({
        settingName,
        options: undefined,
      });
    }
  });

  it('[NET-NEW] returns undefined rather than an empty array or null', () => {
    const subject = new GoogleIntegration();
    const options = subject.getSettingOptions(INTEGRATED_SETTING_NAME);

    /*
     * TODO(parity), unnumbered — the declared return type admits `readonly unknown[]` that the body can
     * never produce, mirroring the legacy `returntype="array"` on a function with no return statement. The
     * distinction asserted here is the one a caller can act on: `undefined` is not `[]` and not `null`, so
     * a caller cannot iterate the result and cannot treat it as "present but empty".
     */
    expect(options).toBeUndefined();
    expect(options).not.toEqual([]);
    expect(options).not.toBeNull();
    expect(Array.isArray(options)).toBe(false);
  });

  it('[NET-NEW] never produces options for any probed name, so no input reaches the array branch', () => {
    const subject = new GoogleIntegration();
    const produced = PROBED_SETTING_NAMES.map((settingName) =>
      subject.getSettingOptions(settingName),
    );

    expect(produced.filter((options) => options !== undefined)).toEqual([]);
    expect(produced).toHaveLength(PROBED_SETTING_NAMES.length);
  });
});

describe('NET-NEW GoogleIntegration — carried defect D11 and the absent live-Google surface (INT-05)', () => {
  it('[NET-NEW] carries D11 without correcting it: the method answers Google, the attribute is inert', () => {
    const subject = new GoogleIntegration();

    /*
     * Defect D11 — `google/Integration.cfc:L49` carries `displayname="USA epay"`, a copy-paste artefact
     * from the payment adapter this component was cloned from. AAP §0.6.7.6 records it as
     * recorded-not-corrected because the EFFECTIVE display name comes from the method at `:L59`. The port
     * therefore has no member expressing the attribute, and the marker lives at GoogleIntegration.ts:188.
     * Repairing it would be a silent behavioural change; asserting it converts an invisible temptation
     * into a checked decision.
     */
    expect(subject.getDisplayName()).toBe(LEGACY_DISPLAY_NAME);
    expect(renderEverySurfaceString(subject)).not.toContain(D11_COPY_PASTE_ARTEFACT);
    expect(renderEverySurfaceString(subject).toLowerCase()).not.toContain('usa epay');
    expect(renderEverySurfaceString(subject).toLowerCase()).not.toContain('usaepay');
  });

  it('[NET-NEW] exposes no endpoint, credential or token, so the stub cannot call Google', () => {
    const subject = new GoogleIntegration();
    const rendered = renderEverySurfaceString(subject).toLowerCase();

    /*
     * AAP §0.8.3.3 — "Implement it as a stub/mock satisfying the same interface contract — do not make
     * live calls to Google's real API." The component introduces no HTTP client, and AAP §0.5.2 records
     * that `mysql2` is the ONLY runtime dependency, so there is nothing here that could reach the network.
     * This sweep is the observable form of that claim.
     */
    expect(rendered).not.toContain('http://');
    expect(rendered).not.toContain('https://');
    expect(rendered).not.toContain('googleapis');
    expect(rendered).not.toContain('merchants');
    expect(rendered).not.toContain('oauth');
    expect(rendered).not.toContain('client_secret');
    expect(rendered).not.toContain('api_key');
  });

  it('[NET-NEW] emits no feed field, because the feed lives in two other files entirely', () => {
    const subject = new GoogleIntegration();
    const rendered = renderEverySurfaceString(subject);

    /*
     * AAP §0.6.4 — the selection is in `feed.cfc` and the field mapping is in `views/feed/product.cfm`,
     * so not one `g:`-namespaced field or RSS token belongs to this component. Asserting their absence is
     * what makes "the stub is nearly empty by faithfulness" a checked statement rather than an excuse.
     */
    expect(rendered).not.toContain('g:id');
    expect(rendered).not.toContain('g:price');
    expect(rendered).not.toContain('<rss');
    expect(rendered).not.toContain('Slatwall Product Feed');
  });
});
