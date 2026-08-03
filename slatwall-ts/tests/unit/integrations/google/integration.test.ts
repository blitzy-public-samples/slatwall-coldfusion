// ---------------------------------------------------------------------------
// slatwall-ts - tests/unit/integrations/google/integration.test.ts
//
// SUBJECT: src/integrations/google/integration.ts - the `GoogleIntegration` adapter, ported from
// [integrationServices/google/Integration.cfc:L49-L79] - and, THROUGH that adapter, the five-member
// contract declared in src/integrations/integrationInterface.ts. There is deliberately no separate
// suite for the contract: a contract here is type declarations with no runtime footprint, so the
// honest way to assert it is to bind a real implementation to it, with no cast, and let the
// compiler do the work.
//
// The adapter is a metadata component - eight members, each answering with a constant. It declares
// no constructor parameter and no field, reads no configuration and no clock, opens no connection,
// issues no query and makes no outbound call, so this suite needs no double, fixture module,
// container, environment or server: every subject is constructed with a bare `new` inside the case
// that reads it, and nothing is held at module scope.
//
// COVERAGE CLASSIFICATION: NET-NEW, with no legacy antecedent; presenting it as parity would be
// false. meta/tests/ holds nothing for the integration surface - searching it for the integration
// services directory, the feed DAO, the interface component, the base component or any of this
// adapter's eight member names matches only the license header each of those files carries, and
// `google` matches zero lines. The two suites that DO extend legacy coverage are
// meta/tests/unit/entity/ProductTest.cfc (the URL-format case, whose nike-air-jorden fixture is
// retained verbatim) and meta/tests/unit/entity/BrandTest.cfc (an empty products array), and this
// is neither; meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub acknowledged
// rather than counted.
//
// VERIFIED ON DISK, WHERE THE SHIPPED SYMBOLS DIFFER FROM EXPECTATION
//   1. THE EXPORTED CLASS IS `GoogleIntegration`, not the source's bare `Integration`.
//      The component's identity was its dotted path,
//      `Slatwall.integrationServices.google.Integration`, of which `Integration` was only
//      the last segment. Interface parity binds MEMBER names, all eight verbatim, so the
//      class name is free to be unambiguous: seventeen `Integration.cfc` components exist
//      in the legacy tree and one is in scope.
//   2. THE CLASS DECLARES `implements IntegrationInterface`, which is what makes the
//      conformance block below a compiler check rather than a convention.
//   3. THE TWO BASE DEFAULTS ARE INLINED AS ORDINARY MEMBERS. The shipped module builds
//      no TypeScript base class, so no `override` keyword exists to observe and this
//      suite asserts BEHAVIOUR - the eight returns - never an inheritance mechanism.
//   4. THE MODULE IMPORTS THE CFML EQUALITY HELPER and uses it in `getSettingOptions`, so
//      the case-insensitivity of CFML `eq` survives the port and the differing-case
//      inputs below are genuinely exercised rather than hypothetical.
//
// THE PORTED SURFACE: EIGHT MEMBERS, ALL SYNCHRONOUS. Six are declared on the Google component and
// two inherited from the base component; locators abbreviate integrationServices/.
//
//     init()                  -> the receiver  [.../google/Integration.cfc:L51-L53]
//     getIntegrationTypes()   -> 'fw1'         [.../google/Integration.cfc:L55-L57]
//     getDisplayName()        -> 'Google'      [.../google/Integration.cfc:L59-L61]
//     getSettings()           -> {}            [.../google/Integration.cfc:L63-L65]
//     getIntegratedSettings() -> one entry     [.../google/Integration.cfc:L67-L71]
//     getSettingOptions(name) -> nothing       [.../google/Integration.cfc:L73-L77]
//     getEventHandlers()      -> []            [.../BaseIntegration.cfc:L67-L69]
//     getAdminNavbarHTML()    -> ''            [.../BaseIntegration.cfc:L71-L73]
//
// None is asynchronous. The async boundary opens where a legacy body reached the DAO or the ORM,
// and not one of these bodies reaches anything, so awaiting a member would assert a signature the
// port does not have. Checked rather than assumed below.
//
// FEED GENERATION IS NOT ASSERTED HERE, WHICH IS THE WHOLE OF THE EIGHT-VERSUS-NINE QUESTION. The
// legacy component holds no feed logic: the entrypoint is a controller member
// [integrationServices/google/controllers/feed.cfc:L58] mutating a request context, the query lives
// in [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75] and the rendering in
// [integrationServices/google/views/feed/product.cfm]. None is reachable from the adapter, and this
// file imports none of the ported replacements.
//
// THE TYPE VOCABULARY, QUOTED WITH ITS OWN TYPOS INTACT.
// [integrationServices/IntegrationInterface.cfc:L63-L73] documents the vocabulary in prose, and two
// of its typos are reproduced verbatim rather than tidied, because a reviewer diffing this file
// against the source should find the source's own words: the member "should return a comma
// seperated list of the integration types" [L65], and the `fw1` entry reads "custom views, ect."
// [L70]. The four documented values are exactly:
//
//     shipping  [L68]  usable by shipping methods and rates
//     payment   [L69]  usable by payment methods
//     fw1       [L70]  may contribute custom views, ect.
//     custom    [L71]  hooks into events, with no views
//
// THERE IS NO PRODUCT-FEED TYPE IN THAT VOCABULARY, and the consequence is asserted below rather
// than papered over: the union admits no fifth member, so the integration contract by itself cannot
// carry the feed.
//
// INHERITANCE, AS IT WAS AND AS IT NOW IS. [integrationServices/BaseIntegration.cfc:L49] extends
// `Slatwall.org.Hibachi.HibachiObject` and does NOT implement the interface; it supplies defaults
// only, which is why an adapter can satisfy the contract while declaring fewer methods than the
// contract has. The Google component overrides four of the five contract members
// [integrationServices/google/Integration.cfc:L51-L65] and inherits `getEventHandlers`, while
// `getAdminNavbarHTML` is a sixth base member the contract never declared. The target has no base
// class, so what is asserted is that all eight members answer what the CFML answered, whichever
// component answered it.
//
// FIXTURE PROVENANCE: [meta/tests/unit/Helper.cfc:L51-L75] is followed as a PATTERN - build the
// subject a case needs inside that case - and its MECHANISM rejected: it constructs a persistent
// entity through the ORM, saves it by reaching a service through an ambient request-scoped locator
// and flushes the session, which is why every legacy "unit" test boots the real application, the
// ORM and the dependency container.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { GoogleIntegration } from '../../../../src/integrations/google/integration.js';
import type {
  IntegrationInterface,
  IntegrationType,
  SettingDefinition,
} from '../../../../src/integrations/integrationInterface.js';

describe('the adapter constructs with no argument and carries no state', () => {
  it('constructs from a bare `new`, with no argument and no wiring', () => {
    const adapter = new GoogleIntegration();

    expect(adapter).toBeInstanceOf(GoogleIntegration);

    // Zero declared constructor arity is the assertion: nothing to inject, so a composition root
    // can build this adapter without knowing anything about it.
    expect(GoogleIntegration.length).toBe(0);
  });

  it('declares no own property, so there is nothing in it to hold state', () => {
    const adapter = new GoogleIntegration();

    expect(Object.keys(adapter)).toStrictEqual([]);
    expect(Object.getOwnPropertyNames(adapter)).toStrictEqual([]);
  });

  it('exposes exactly the eight ported members, and no ninth', () => {
    // CFML parity [integrationServices/google/Integration.cfc:L51-L77]: six members are declared on
    // the component and two more arrive from the base component, which is eight and not nine. The
    // names are the legacy CFML names verbatim, in camelCase, which lets a reviewer diff the two
    // surfaces directly; the list is alphabetised to match the census.
    const surface = Object.getOwnPropertyNames(GoogleIntegration.prototype)
      .filter((member) => member !== 'constructor')
      .sort();

    expect(surface).toStrictEqual([
      'getAdminNavbarHTML',
      'getDisplayName',
      'getEventHandlers',
      'getIntegratedSettings',
      'getIntegrationTypes',
      'getSettingOptions',
      'getSettings',
      'init',
    ]);
    expect(surface).toHaveLength(8);
  });

  it('does not expose the feed entrypoint, which belongs to a controller and not to the adapter', () => {
    // CFML parity [integrationServices/google/controllers/feed.cfc:L58]: the feed entrypoint is a
    // controller member, so the ported adapter surface must not grow a feed method.
    const surface = Object.getOwnPropertyNames(GoogleIntegration.prototype);

    expect(surface).not.toContain('product');
    expect(surface).not.toContain('generateProductFeed');
  });
});

describe('the five-member contract is satisfied, and the compiler is what proves it', () => {
  it('binds to the contract type with no cast, and answers through the binding', () => {
    const adapter = new GoogleIntegration();

    // THE BINDING IS THE ASSERTION. `tsc` rejects this line unless the class satisfies every member
    // the contract declares. No `as` and no `satisfies` standing in for a real mismatch: a cast
    // would assert the conclusion.
    const contract: IntegrationInterface = adapter;

    expect(contract.init()).toBe(adapter);
    expect(contract.getDisplayName()).toBe('Google');
    expect(contract.getIntegrationTypes()).toBe('fw1');
    expect(contract.getSettings()).toStrictEqual({});
    expect(contract.getEventHandlers()).toStrictEqual([]);
  });

  it('declares those five members, each of them present on the adapter', () => {
    // Every entry is checked twice: by the compiler, because the array is typed as contract keys,
    // and at run time, because the member must exist on the class.
    const contractMembers: readonly (keyof IntegrationInterface)[] = [
      'init',
      'getDisplayName',
      'getIntegrationTypes',
      'getSettings',
      'getEventHandlers',
    ];

    expect(contractMembers).toHaveLength(5);

    const surface = Object.getOwnPropertyNames(GoogleIntegration.prototype);
    for (const member of contractMembers) {
      expect(surface).toContain(member);
    }
  });

  it('leaves the inherited navbar default off the contract, where the source left it', () => {
    // CFML parity [integrationServices/IntegrationInterface.cfc:L50-L89]: the <cfinterface>
    // declares five members and `getAdminNavbarHTML` is not among them, so the ported contract must
    // not carry it either.
    // @ts-expect-error `getAdminNavbarHTML` is a non-interface base default declared at [integrationServices/BaseIntegration.cfc:L71-L73], so it must not be a key of the ported contract. Adding it would misstate what the legacy interface required of its implementors.
    const navbarIsNotAContractMember: keyof IntegrationInterface = 'getAdminNavbarHTML';
    const asPlainString: string = navbarIsNotAContractMember;

    expect(asPlainString).toBe('getAdminNavbarHTML');

    // It is still a real member of the adapter, which is the distinction: part of a concrete
    // adapter's surface, and no part of the contract.
    expect(Object.getOwnPropertyNames(GoogleIntegration.prototype)).toContain('getAdminNavbarHTML');
  });

  it('leaves both Google-specific extras off the contract as well', () => {
    // @ts-expect-error `getIntegratedSettings` is declared on the Google component [integrationServices/google/Integration.cfc:L67-L71] and nowhere on the interface, so it must not be a contract key.
    const integratedSettingsIsNotAContractMember: keyof IntegrationInterface =
      'getIntegratedSettings';
    // @ts-expect-error `getSettingOptions` is likewise Google-specific [integrationServices/google/Integration.cfc:L73-L77] and absent from the interface, so it must not be a contract key.
    const settingOptionsIsNotAContractMember: keyof IntegrationInterface = 'getSettingOptions';

    const extras: string[] = [
      integratedSettingsIsNotAContractMember,
      settingOptionsIsNotAContractMember,
    ];

    expect(extras).toStrictEqual(['getIntegratedSettings', 'getSettingOptions']);

    const surface = Object.getOwnPropertyNames(GoogleIntegration.prototype);
    for (const extra of extras) {
      expect(surface).toContain(extra);
    }
  });
});

describe('init() hands back the very instance it was called on', () => {
  it('returns the receiver itself, not a copy and not a rebuilt adapter', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/google/Integration.cfc:L51-L53]: the legacy body
    //   `return this;`
    // so identity is the contract - deep equality would pass against any second instance and would
    // prove nothing.
    expect(adapter.init()).toBe(adapter);
  });

  it('returns the same instance however many times it is called', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.init()).toBe(adapter.init());
    expect(adapter.init().init()).toBe(adapter);
  });

  it('keeps the concrete type through the call, so the extras stay reachable', () => {
    const adapter = new GoogleIntegration();

    // The polymorphic `this` return is what makes this compile: a member declared on the class
    // rather than on the contract is still reachable on what `init()` returns.
    const initialised = adapter.init();

    expect(initialised.getIntegratedSettings()).toStrictEqual({
      productGoogleProductType: { fieldType: 'select' },
    });
    expect(initialised.getSettingOptions('productGoogleProductType')).toBeUndefined();
  });

  it('gives each instance its own receiver back', () => {
    const first = new GoogleIntegration();
    const second = new GoogleIntegration();

    expect(first.init()).not.toBe(second.init());
  });
});

describe('getIntegrationTypes() answers one scalar value from a four-value vocabulary', () => {
  it("answers exactly 'fw1'", () => {
    const adapter = new GoogleIntegration();

    // JUDGMENT CALL: 'fw1' is carried over verbatim, even though reading the vocabulary's own
    // descriptions argues for 'custom'. The vocabulary describes `fw1` as an integration that may
    // contribute custom views [integrationServices/IntegrationInterface.cfc:L70] and `custom` as
    // the choice for hooking events with no views [L71], so on the descriptions alone neither fits
    // a feed. THE SOURCE IS AUTHORITATIVE AND IT SAYS `"fw1"`
    // [integrationServices/google/Integration.cfc:L55-L57]. Interface parity is the acceptance
    // contract, and the legacy engine keys view resolution off this value - which is why the feed
    // subsystem has views at all - so the tidier reading would silently change how the platform
    // classifies this adapter.
    const declared: IntegrationType = adapter.getIntegrationTypes();

    expect(declared).toBe('fw1');
  });

  it('answers a scalar string, never a one-element array and never a comma-list', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/IntegrationInterface.cfc:L65]: the prose calls for a comma
    // seperated list, yet no in-scope adapter ever declared more than one type, so the port models
    // a single value.
    const asPlainString: string = adapter.getIntegrationTypes();

    expect(typeof adapter.getIntegrationTypes()).toBe('string');
    expect(Array.isArray(adapter.getIntegrationTypes())).toBe(false);
    expect(asPlainString).not.toContain(',');
    expect(asPlainString).toHaveLength(3);
    expect(asPlainString).not.toBe('');
  });

  it('admits no fifth member for the product feed that the vocabulary never had', () => {
    // JUDGMENT CALL: the four-value vocabulary is not widened with a product-feed member, and no
    // feed method is added to the contract to compensate.
    // [integrationServices/IntegrationInterface.cfc:L68-L71] documents four values and not one
    // describes a feed, so the integration contract by itself cannot carry the feed. That is why
    // feed generation is a separate domain port, implemented by the feed service, the feed
    // repository and the renderer.

    // @ts-expect-error 'productFeed' is deliberately absent from the four documented values at [integrationServices/IntegrationInterface.cfc:L68-L71], so it must not be assignable to the ported union.
    const notAVocabularyMember: IntegrationType = 'productFeed';
    const asPlainString: string = notAVocabularyMember;
    const declaredByTheAdapter: string = new GoogleIntegration().getIntegrationTypes();

    expect(asPlainString).toBe('productFeed');
    expect(declaredByTheAdapter).not.toBe(asPlainString);
  });

  it('does not widen to the base component empty-string default', () => {
    // JUDGMENT CALL: the base component's empty-string answer is not a fifth vocabulary value, and
    // the ported union must never admit it. [integrationServices/BaseIntegration.cfc:L59-L61]
    // returns `""`, a placeholder for an adapter that has not answered yet rather than a
    // classification, and admitting it would leave every consumer's exhaustive handling of the
    // union permanently incomplete. The Google component overrides the member, so it is unreachable
    // here.

    // @ts-expect-error The base component answers the empty string [integrationServices/BaseIntegration.cfc:L59-L61], which is a placeholder rather than a vocabulary value, so it must not be assignable to the ported union.
    const baseDefaultIsNotAVocabularyMember: IntegrationType = '';
    const asPlainString: string = baseDefaultIsNotAVocabularyMember;
    const declaredByTheAdapter: string = new GoogleIntegration().getIntegrationTypes();

    expect(asPlainString).toBe('');
    expect(declaredByTheAdapter).not.toBe(asPlainString);
  });

  it('is a single value at the type level too, so a comma-list is not assignable', () => {
    // @ts-expect-error The ported union models ONE value, so a comma-list of two of them must not be assignable however faithfully it echoes the source's prose at [integrationServices/IntegrationInterface.cfc:L65].
    const commaList: IntegrationType = 'fw1,custom';
    const asPlainString: string = commaList;
    const declaredByTheAdapter: string = new GoogleIntegration().getIntegrationTypes();

    expect(asPlainString).toBe('fw1,custom');
    expect(declaredByTheAdapter).not.toBe(asPlainString);
  });
});

describe('getDisplayName() answers Google, and the component tag disagrees with it', () => {
  it("answers exactly 'Google'", () => {
    const adapter = new GoogleIntegration();

    // THE METHOD IS AUTHORITATIVE, which is why this assertion reads 'Google'. `getDisplayName()`
    // is the contract member [integrationServices/IntegrationInterface.cfc:L56-L61] and every
    // caller wanting a display name calls it; the tag attribute is component metadata no in-scope
    // caller consults, so following the method reproduces observable behaviour exactly while
    // following the attribute would change it. The attribute's value appears in the marker below
    // and nowhere else: no member returns it, no assertion expects it.
    //
    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the component tag declares
    // displayname="USA epay", copied from the USAePay payment adapter, while getDisplayName() at
    // L59-L61 answers "Google".
    //
    // Preserved deliberately; do not fix without a product decision.
    expect(adapter.getDisplayName()).toBe('Google');
    expect(adapter.getDisplayName()).toHaveLength(6);
  });

  it('answers the override rather than the base component placeholder', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/BaseIntegration.cfc:L55-L57]: the base default is the
    // placeholder "Not Defined", which the Google component overrides, so inheriting it would be a
    // regression rather than a default.
    expect(adapter.getDisplayName()).not.toBe('Not Defined');
    expect(adapter.getDisplayName()).not.toBe('');
  });

  it('answers a plain string with no surrounding whitespace and no formatting applied', () => {
    const adapter = new GoogleIntegration();
    const displayName = adapter.getDisplayName();

    expect(typeof displayName).toBe('string');
    expect(displayName).toBe(displayName.trim());
  });
});

describe('getSettings() answers an empty map, which is never the integrated payload', () => {
  it('answers an empty map rather than nothing at all', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/google/Integration.cfc:L63-L65]: the legacy body
    //   `return {};`
    // an empty struct is a legitimate answer here rather than a missing one, because this adapter
    // contributes no setting of its own.
    const settings: Record<string, SettingDefinition> = adapter.getSettings();

    expect(settings).toStrictEqual({});
    expect(Object.keys(settings)).toStrictEqual([]);
    expect(settings).toBeDefined();
    expect(settings).not.toBeNull();
    expect(Array.isArray(settings)).toBe(false);
  });

  it('is never conflated with the integrated settings, which are a different member', () => {
    const adapter = new GoogleIntegration();

    // The two members are distinct in the source and stay distinct here:
    // [integrationServices/google/Integration.cfc:L63-L65] answers an empty struct and L67-L71
    // answers a populated one.
    expect(adapter.getSettings()).not.toStrictEqual(adapter.getIntegratedSettings());
    expect(Object.keys(adapter.getSettings())).not.toContain('productGoogleProductType');
  });

  it('hands back a fresh map per call, so a caller cannot corrupt a later one', () => {
    const adapter = new GoogleIntegration();

    const first = adapter.getSettings();
    const second = adapter.getSettings();

    expect(first).not.toBe(second);

    first['injectedByACaller'] = { fieldType: 'text' };

    expect(adapter.getSettings()).toStrictEqual({});
    expect(second).toStrictEqual({});
  });
});

describe('getIntegratedSettings() answers one entry carrying one evidenced field', () => {
  it('answers exactly the single documented entry, spelled as the source spells it', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/google/Integration.cfc:L67-L71]: the legacy body declares
    // one key with one property, `productGoogleProductType = {fieldType="select"}`, and the key
    // spelling is carried over verbatim.
    const definitions: Record<string, SettingDefinition> = adapter.getIntegratedSettings();

    // A strict deep comparison is what keeps a field nobody evidenced from creeping in: an added
    // label, default value, requiredness flag, option list, sort order or validation rule would
    // fail this line, and each would be a requirement invented by the port.
    expect(definitions).toStrictEqual({ productGoogleProductType: { fieldType: 'select' } });
    expect(Object.keys(definitions)).toStrictEqual(['productGoogleProductType']);
  });

  it('carries the field name and value the source evidences, and nothing besides', () => {
    const adapter = new GoogleIntegration();
    const definitions = adapter.getIntegratedSettings();

    expect(Object.keys(definitions)).toHaveLength(1);

    // Reading through entries keeps every access narrowed: the pair's second element is a
    // definition rather than a possibly-absent lookup.
    for (const [name, definition] of Object.entries(definitions)) {
      expect(name).toBe('productGoogleProductType');
      expect(Object.keys(definition)).toStrictEqual(['fieldType']);
      expect(definition.fieldType).toBe('select');
    }
  });

  it('hands back a fresh map per call, so a caller cannot corrupt a later one', () => {
    const adapter = new GoogleIntegration();

    const first = adapter.getIntegratedSettings();
    const second = adapter.getIntegratedSettings();

    expect(first).not.toBe(second);

    first['productGoogleProductType'] = { fieldType: 'overwrittenByACaller' };

    expect(adapter.getIntegratedSettings()).toStrictEqual({
      productGoogleProductType: { fieldType: 'select' },
    });
    expect(second).toStrictEqual({ productGoogleProductType: { fieldType: 'select' } });
  });
});

describe('getSettingOptions() answers nothing, whatever it is asked', () => {
  it('answers nothing for the very setting name the source tests', () => {
    const adapter = new GoogleIntegration();

    // Reproduced exactly, and this is the case that proves it: asking with the name the source
    // itself tests still yields nothing. Populating the options would invent a feature, because the
    // component carries no source for what those values would be. An empty array would be worse,
    // silently converting "this member never answers" into "this setting has no options". Raising
    // would turn a quiet non-answer into an error.
    const options: string[] | undefined = adapter.getSettingOptions('productGoogleProductType');

    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L73-L77]: getSettingOptions
    // declares returntype="array", its single conditional branch has an empty body, and the
    // function contains no return statement anywhere, so it answers null for every input -
    // including the one setting name it tests.
    //
    // Preserved deliberately; do not fix without a product decision.
    expect(options).toBeUndefined();
  });

  it('answers nothing for a setting name the source never tests', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getSettingOptions('someOtherSettingName')).toBeUndefined();
  });

  it('answers nothing for an upper-cased spelling, since the CFML eq operator folds case', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/google/Integration.cfc:L74]: CFML `eq` is case-insensitive,
    // so the legacy engine matched this spelling just as readily, and the ported comparison goes
    // through the CFML equality helper to keep that true. The point is the pairing - the match is
    // preserved AND the answer is still nothing - so what is asserted is the answer, not which
    // branch ran.
    expect(adapter.getSettingOptions('PRODUCTGOOGLEPRODUCTTYPE')).toBeUndefined();
  });

  it('answers nothing for a lower-cased spelling either', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getSettingOptions('productgoogleproducttype')).toBeUndefined();
  });

  it('answers nothing for a mixed-case spelling, and for an empty setting name', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getSettingOptions('ProductGoogleProductType')).toBeUndefined();

    // An empty string is a definite string rather than an absent one, so the ported comparison
    // evaluates it and falls through, as CFML did.
    expect(adapter.getSettingOptions('')).toBeUndefined();
  });

  it('never normalises the absent answer into an empty array or a null', () => {
    const adapter = new GoogleIntegration();
    const options = adapter.getSettingOptions('productGoogleProductType');

    expect(options).not.toStrictEqual([]);
    expect(options).not.toBeNull();
    expect(options).toBeUndefined();
    expect(Array.isArray(options)).toBe(false);
  });

  it('does not raise for any of those inputs', () => {
    const adapter = new GoogleIntegration();

    expect(() => adapter.getSettingOptions('productGoogleProductType')).not.toThrow();
    expect(() => adapter.getSettingOptions('PRODUCTGOOGLEPRODUCTTYPE')).not.toThrow();
    expect(() => adapter.getSettingOptions('someOtherSettingName')).not.toThrow();
    expect(() => adapter.getSettingOptions('')).not.toThrow();
  });

  it('answers the same absent value on a repeated call', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getSettingOptions('productGoogleProductType')).toBe(
      adapter.getSettingOptions('productGoogleProductType'),
    );
  });
});

describe('getEventHandlers() answers an empty array, inherited rather than declared', () => {
  it('answers an empty array of handler identifiers', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/BaseIntegration.cfc:L67-L69]: the Google component declines
    // this member, so the base default answers, and its body is `return [];`. An empty array is
    // this adapter's real answer, not a placeholder.
    const handlers: string[] = adapter.getEventHandlers();

    expect(handlers).toStrictEqual([]);
    expect(handlers).toHaveLength(0);
    expect(Array.isArray(handlers)).toBe(true);
  });

  it('holds no element at the first index, read without asserting the index away', () => {
    const adapter = new GoogleIntegration();
    const handlers = adapter.getEventHandlers();

    // The annotation carries the absence that strict indexed access reports, so the read stays
    // narrowed.
    const firstHandler: string | undefined = handlers[0];

    expect(firstHandler).toBeUndefined();
  });

  it('hands back a fresh array per call, so a caller cannot corrupt a later one', () => {
    const adapter = new GoogleIntegration();

    const first = adapter.getEventHandlers();
    const second = adapter.getEventHandlers();

    expect(first).not.toBe(second);

    first.push('injectedByACaller');

    expect(adapter.getEventHandlers()).toStrictEqual([]);
    expect(second).toStrictEqual([]);
  });
});

describe('getAdminNavbarHTML() answers an empty string, and is no part of the contract', () => {
  it('answers the empty string', () => {
    const adapter = new GoogleIntegration();

    // CFML parity [integrationServices/BaseIntegration.cfc:L71-L73]: the base body is `return '';`,
    // and the Google component declines the member, so the empty string is the legacy answer.
    const markup: string = adapter.getAdminNavbarHTML();

    expect(markup).toBe('');
    expect(markup).toHaveLength(0);
    expect(typeof markup).toBe('string');
  });

  it('composes no markup, because this target renders no user interface at all', () => {
    const adapter = new GoogleIntegration();
    const markup = adapter.getAdminNavbarHTML();

    // The empty answer is a contract stub rather than a presentation concern: this adapter
    // contributes no admin navigation, and this subtree's compiler options declare no browser
    // library, so no browser type is even in scope to reference.
    expect(markup).not.toContain('<');
    expect(markup.trim()).toBe('');
  });
});

describe('every member answers synchronously', () => {
  it('answers with a value directly, and never with a promise, on all eight members', () => {
    const adapter = new GoogleIntegration();

    // Sync stays sync. Awaiting any of these would assert a signature the port does not have, so
    // the absence of a promise is checked at each member.
    expect(adapter.init()).not.toBeInstanceOf(Promise);
    expect(adapter.getIntegrationTypes()).not.toBeInstanceOf(Promise);
    expect(adapter.getDisplayName()).not.toBeInstanceOf(Promise);
    expect(adapter.getSettings()).not.toBeInstanceOf(Promise);
    expect(adapter.getIntegratedSettings()).not.toBeInstanceOf(Promise);
    expect(adapter.getSettingOptions('productGoogleProductType')).not.toBeInstanceOf(Promise);
    expect(adapter.getEventHandlers()).not.toBeInstanceOf(Promise);
    expect(adapter.getAdminNavbarHTML()).not.toBeInstanceOf(Promise);
  });

  it('answers with the declared shape at every member, not a wrapper around it', () => {
    const adapter = new GoogleIntegration();

    expect(typeof adapter.getIntegrationTypes()).toBe('string');
    expect(typeof adapter.getDisplayName()).toBe('string');
    expect(typeof adapter.getAdminNavbarHTML()).toBe('string');
    expect(typeof adapter.getSettings()).toBe('object');
    expect(typeof adapter.getIntegratedSettings()).toBe('object');
    expect(typeof adapter.getSettingOptions('productGoogleProductType')).toBe('undefined');
    expect(Array.isArray(adapter.getEventHandlers())).toBe(true);
    expect(adapter.init()).toBeInstanceOf(GoogleIntegration);
  });

  it('has no member whose result exposes a then, so nothing here is thenable', () => {
    const adapter = new GoogleIntegration();

    const settings: Record<string, SettingDefinition> = adapter.getSettings();
    const definitions: Record<string, SettingDefinition> = adapter.getIntegratedSettings();

    expect(Object.keys(settings)).not.toContain('then');
    expect(Object.keys(definitions)).not.toContain('then');
    expect(Object.keys(adapter)).not.toContain('then');
  });
});

describe('answers are stable across calls and across instances', () => {
  it('answers the same way on a repeated call, holding nothing between them', () => {
    const adapter = new GoogleIntegration();

    expect(adapter.getIntegrationTypes()).toBe(adapter.getIntegrationTypes());
    expect(adapter.getDisplayName()).toBe(adapter.getDisplayName());
    expect(adapter.getAdminNavbarHTML()).toBe(adapter.getAdminNavbarHTML());
    expect(adapter.getSettings()).toStrictEqual(adapter.getSettings());
    expect(adapter.getIntegratedSettings()).toStrictEqual(adapter.getIntegratedSettings());
    expect(adapter.getEventHandlers()).toStrictEqual(adapter.getEventHandlers());
  });

  it('answers identically from a second, independently constructed instance', () => {
    const first = new GoogleIntegration();
    const second = new GoogleIntegration();

    // Two instances agreeing on all eight answers is the evidence that no ambient state and no
    // shared cache is in play.
    expect(first.getIntegrationTypes()).toBe(second.getIntegrationTypes());
    expect(first.getDisplayName()).toBe(second.getDisplayName());
    expect(first.getAdminNavbarHTML()).toBe(second.getAdminNavbarHTML());
    expect(first.getSettings()).toStrictEqual(second.getSettings());
    expect(first.getIntegratedSettings()).toStrictEqual(second.getIntegratedSettings());
    expect(first.getEventHandlers()).toStrictEqual(second.getEventHandlers());
    expect(first.getSettingOptions('productGoogleProductType')).toBe(
      second.getSettingOptions('productGoogleProductType'),
    );
    expect(first.init()).not.toBe(second.init());
  });

  it('leaves a mutated result from one instance invisible to the other', () => {
    const first = new GoogleIntegration();
    const second = new GoogleIntegration();

    const handlers = first.getEventHandlers();
    handlers.push('injectedByACaller');

    const settings = first.getSettings();
    settings['injectedByACaller'] = { fieldType: 'text' };

    expect(second.getEventHandlers()).toStrictEqual([]);
    expect(second.getSettings()).toStrictEqual({});
    expect(first.getEventHandlers()).toStrictEqual([]);
    expect(first.getSettings()).toStrictEqual({});
  });
});
