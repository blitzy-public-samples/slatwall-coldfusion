/**
 * Option domain tests — NET-NEW.
 *
 * WHY THE LABEL IS NET-NEW AND NOT TRACEABLE
 * There is no dedicated legacy test for this entity. `meta/tests/unit/entity/` ships components for
 * a small subset of the entity catalogue and Option is not among them: no `OptionTest.cfc` exists
 * anywhere in the repository, so no legacy assertion, no legacy fixture and no legacy expectation
 * about Option was ever written down. Every case below is therefore net-new coverage, and the file
 * carries exactly one label — this one — rather than mixing a traceable claim into a suite that has
 * nothing to trace to. AAP §0.6.5.2 reaches the same conclusion from the inventory side and §0.8.3.7
 * requires the gap to be flagged explicitly rather than implied away, because the standing question
 * this exercise answers is precisely whether converted methods get replicated tests or silently
 * generated ones. The honest answer for Option is: generated, from source.
 *
 * TRACEABILITY IS DOCUMENTARY, GROUNDED IN TWO LEGACY DOCUMENTS
 * Because there is no legacy test to port, every expectation below is derived by reading legacy
 * source and is cited to the line that states it. The two documents that between them define the
 * whole of this entity's behaviour are:
 *
 *   - `model/entity/Option.cfc` — the component declaration at `:L49`, the five persistent
 *     properties at `:L52-L56`, the option-group relationship at `:L59`, the SKUs
 *     many-to-many-inverse at `:L66`, the image directory member at `:L81-L83`, and the four
 *     bidirectional helpers at `:L92-L97`, `:L98-L107`, `:L110-L112` and `:L113-L115`.
 *   - `model/validation/Option.json` — the declarative rule document: `optionCode` at `:L3`,
 *     `optionName` at `:L4`, `optionGroup` at `:L5` and the `skus` delete guard at `:L6`.
 *
 * No legacy run was observed and no legacy output was compared. The legacy suite cannot be executed
 * in this environment at all — MXUnit and CFSelenium are not vendored and there is no CFML engine
 * available — so a documentary mapping from cited source is the strongest claim available, and it is
 * stated rather than dressed up as parity (AAP §0.6.5.3, §0.8.4.2).
 *
 * THE STRUCTURAL TRANSLATION: LEGACY INTEGRATION TEST -> TARGET UNIT TEST
 * The two suites differ in kind by design (AAP §0.4.3.6). A LEGACY ENTITY TEST BOOTED THE WHOLE FW/1
 * APPLICATION before it could touch an entity: `meta/tests/unit/SlatwallUnitTestBase.cfc` instantiates
 * `Slatwall.Application`, calls `bootstrap()`, promotes the request account to super-user, and only
 * then resolves the entity through a string-keyed DI/1 lookup onto an `onMissingMethod`-synthesized
 * factory member. Every legacy assertion was consequently an integration assertion over a live
 * Hibernate session inside a running framework.
 *
 * THE TARGET FIXTURE IS `new Option()`, CONSTRUCTED DIRECTLY AND WIRED TO HAND-WRITTEN DOUBLES.
 * Nothing is bootstrapped, no container is built, no service is resolved, no connection is opened, no
 * environment variable is read and no framework is present. The one collaborator that genuinely sits
 * outside this entity — the settings engine behind `getImageDirectory()` — arrives as a hand-written
 * double from `test/support/inMemoryRepositories.ts`, which is also where the option, option-group and
 * SKU builders come from. AAP §0.4.3.6 records that the legacy repository ships no mocking library and
 * that the target suite substitutes plain doubles instead: `jest.mock` is not used anywhere below, the
 * module registry is never touched, and no third-party mocking package is introduced.
 *
 * WHAT IS EXERCISED FOR REAL
 * The actual `Option` class, the actual `OptionGroup` class, the actual `Sku` class, the actual
 * `Validator`, the actual transliterated `option.rules.ts` rule set and the actual `ValidationError`
 * bag. Nothing about the code under test is reimplemented here.
 *
 * ⚠️ THE OPTION-GROUP AND SKU SIDES ARE THE REAL CLASSES, NOT COPIES OF THEM — AND THAT IS
 * LOAD-BEARING. Both of Option's collection-facing mutators are pure delegations in one direction or
 * the other: `setOptionGroup` reaches into the group's live array while `addSku` hands the whole
 * operation to the SKU. A double that reproduced `getOptions`, `hasOption`, `addOption` or
 * `removeOption` would make the cases below pass against test-local code while the production bodies
 * rotted unobserved. So `new OptionGroup()` and `new Sku()` are constructed instead — both take no
 * constructor arguments, perform no I/O and need no container, exactly like `Option`. The one place a
 * structural stand-in appears is {@link RecordingSkuOptionOwner}, whose only purpose is to make the
 * DELEGATION itself observable by declining to maintain the relationship; it reimplements nothing.
 *
 * SCOPE OF THIS FILE, AND WHY IT IS COMPLETE
 * The assigned Option slice is the five persistent properties, the required option-group
 * relationship, the SKUs relationship inverse over the `SwSkuOption` link table, and the converted
 * methods — `getImageDirectory`, `setOptionGroup`, `removeOptionGroup`, `addSku`, `removeSku` and the
 * derived `isNew`. All of those are covered below, and covering them completes the slice.
 *
 * NO UN-PORTABLE BOUNDARY STUB IS REQUIRED, AND NONE IS INVENTED. `model/entity/Option.cfc:L85-L87`
 * — the entity's "Non-Persistent Property Methods" section — is a START banner, a blank line and an
 * END banner. The entity declares no calculated property at all, so the calculated-property boundary
 * of AAP §0.2.2.6 that forces `Product` and `Sku` to exclude pricing, promotion, inventory and
 * currency members simply does not arise here. There is nothing to stub, and no fake non-persistent
 * member is fabricated in order to have a boundary to test, and no field the legacy entity does not
 * declare is introduced anywhere in this file.
 *
 * DELIBERATELY UNTESTED, RECORDED SO THE OMISSION READS AS A DECISION. `model/entity/Option.cfc`
 * also declares an image relationship pair at `:L60` and `:L63` and four promotion
 * many-to-many-inverse collections at `:L67-L70`, with eight promotion helper methods over them at
 * `:L118-L147`. Two of those helpers are copy/paste faults — `removePromotionRewardExclusion` at
 * `:L129-L131` and `removePromotionQualifierExclusion` at `:L145-L147` both call the ADD-side
 * member — and they are named here purely so a reader knows they were seen. They are outside this
 * file's in-scope relationships: the image and promotion families are excluded by AAP §0.2.2.1 and
 * §0.2.2.2, the port models none of those six relationships as fields, and consequently no promotion
 * or image type is imported below, no promotion behaviour is asserted, and neither fault is
 * reproduced. {@link OPTION_EXCLUDED_RELATIONSHIP_LOCATORS} pins each excluded name to its declaring
 * line, and one case asserts that the port's field-backed name space really does omit all six, which
 * is what keeps the exclusion checkable rather than merely claimed.
 *
 * CONVENTIONS
 * Every case name begins `NET-NEW —` followed by the legacy locator it is derived from, so the
 * provenance of each assertion is visible in the runner output and not only in this header. Comments
 * carry `TODO(parity)` where a legacy behaviour is preserved rather than repaired, and label
 * technology-specific translation decisions where an idiom had to change for the target language to
 * express the same behaviour. The enterprise standards of AAP §0.7.3 govern in the absence of any
 * user-specified rule document; in a test file the ones with teeth are strict type safety — no
 * `any`, no unsafe or double cast, no non-null assertion and no compiler or linter suppression of any
 * kind — preserve-and-annotate rather than repair, and invent nothing the source does not state. No
 * timing, capacity or service-level assertion appears anywhere below, and no identifier is generated.
 */

import {
  OPTION_CLASS_NAME,
  OPTION_DECLARED_PROPERTIES,
  OPTION_ENTITY_METADATA,
  OPTION_ENTITY_NAME,
  OPTION_PRIMARY_ID_PROPERTY_NAME,
  OPTION_PROPERTY_DESCRIPTORS,
  Option,
  type OptionImageDirectoryResolver,
  type OptionPropertyName,
  type SkuOptionOwner,
} from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { Sku } from '../../src/domain/sku/Sku';
import { ValidationError } from '../../src/errors/ValidationError';
import { Validator, type ValidationContext } from '../../src/validation/Validator';
import {
  optionValidationRuleSet,
  resolveOptionUniqueTarget,
} from '../../src/validation/rules/option.rules';
import {
  buildOption,
  buildOptionGroup,
  buildSku,
  createSettingResolverDouble,
  createValidatorHarness,
  type SettingResolverCall,
} from '../support/inMemoryRepositories';

/* ================================================================================================
 * SOURCE-GROUNDED CONSTANTS
 *
 * Every value below is read from a cited legacy line or imported from the code under test. Nothing
 * is invented: no UUID is generated, no production setting default is reproduced, no timing or
 * capacity figure appears and no coverage threshold is asserted.
 *
 * THE THREE IDENTITY CONSTANTS ARE IMPORTED FROM PRODUCTION RATHER THAN RESTATED. `OPTION_CLASS_NAME`,
 * `OPTION_ENTITY_NAME` and `OPTION_PRIMARY_ID_PROPERTY_NAME` arrive through the import above, because
 * a case that asserts a literal it declared itself exercises the test file rather than the code under
 * test and would keep passing after the production value diverged. The cases below pin those imported
 * constants to the legacy attributes that define them — `entityname="SlatwallOption"` at
 * `model/entity/Option.cfc:L49` and the file's only `fieldtype="id"` declaration at `:L52` — so a
 * change in the entity fails here instead of passing silently.
 * ============================================================================================== */

/**
 * The unsaved primary-identifier value, verbatim from `model/entity/Option.cfc:L52`, which declares
 * both `unsavedvalue=""` and `default=""`.
 *
 * It is the sentinel `Option.isNew()` compares against, which is the port of the legacy
 * `getNewFlag()` derivation: the primary-ID value is read and an empty one means new. That
 * derivation is why this entity's own `:L94` short-circuit can consult `isNew()` without any
 * persistence being present.
 *
 * NO IDENTIFIER IS EVER GENERATED IN THIS FILE. Per AAP IR-6 an Option key is a 32-character
 * lowercase hex string minted by the persistence layer, so a test that produced one would be
 * asserting a value the source does not state.
 */
const OPTION_UNSAVED_ID_VALUE = '';

/**
 * Identifiers assigned to Options that must read as SAVED, so the `!hasOption(this)` arm of the
 * `:L94` guard is the one that decides.
 *
 * These are opaque test inputs, not seeded data. They are written out literally — never generated —
 * purely so they have the SHAPE `model/entity/Option.cfc:L52` declares (`ormtype="string" length="32"`,
 * produced by the legacy `createSlatwallUUID()`: no dashes, never upper case), and each is distinct so
 * that no two collaborators are accidentally interchangeable.
 */
const SAVED_OPTION_IDS = Object.freeze({
  hasOptionGuard: '00000000000000000000000000000031',
  spliceFirst: '00000000000000000000000000000032',
  spliceSecond: '00000000000000000000000000000033',
  crossGroup: '00000000000000000000000000000034',
  nonMember: '00000000000000000000000000000035',
  uniqueIncumbent: '00000000000000000000000000000036',
  uniqueCandidate: '00000000000000000000000000000037',
} as const);

/**
 * The FIVE persistent properties of `model/entity/Option.cfc:L52-L56`, in declaration order.
 *
 * `satisfies` rather than a cast: the literal tuple is preserved for the per-property cases below
 * while every member is checked against the entity's real property-name union, so a typo or a
 * property that no longer exists is a compile error and a name the entity does not declare could not
 * be added here.
 */
const OPTION_PERSISTENT_PROPERTY_NAMES = [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
] as const satisfies readonly OptionPropertyName[];

/**
 * Every property the port models as a field, mapped to the legacy line that declares it.
 *
 * `Record<OptionPropertyName, string>` makes this EXHAUSTIVE by compile check — a name added to the
 * entity's property union and not recorded here is an error — and the object literal's excess
 * property check makes it impossible to record a name the entity does not declare. Both halves
 * matter, because this is the map the completeness case compares against the production set that
 * `Option.hasProperty` actually answers over, and the legacy predicate was a test of DECLARED
 * METADATA rather than of runtime value presence. Answering it from runtime keys instead would make
 * every validation rule skip and would turn the save-validation case into a silent no-op.
 */
const OPTION_DECLARED_PROPERTY_LOCATORS: Record<OptionPropertyName, string> = {
  optionID: 'model/entity/Option.cfc:L52',
  optionCode: 'model/entity/Option.cfc:L53',
  optionName: 'model/entity/Option.cfc:L54',
  optionDescription: 'model/entity/Option.cfc:L55',
  sortOrder: 'model/entity/Option.cfc:L56',
  optionGroup: 'model/entity/Option.cfc:L59',
  skus: 'model/entity/Option.cfc:L66',
  remoteID: 'model/entity/Option.cfc:L73',
  createdDateTime: 'model/entity/Option.cfc:L76',
  createdByAccount: 'model/entity/Option.cfc:L77',
  modifiedDateTime: 'model/entity/Option.cfc:L78',
  modifiedByAccount: 'model/entity/Option.cfc:L79',
};

/**
 * The field-backed declared property names, derived from the PRODUCTION set rather than from the
 * locator map above.
 *
 * The direction matters. `Option.hasProperty` is answered in production from
 * `OPTION_DECLARED_PROPERTIES`, so a list built here from a different source could agree with the
 * locator map while disagreeing with the code under test. The locator map keeps its own distinct job
 * — pinning each name to the legacy line that declares it, which the production set does not record —
 * and one case asserts the two agree, so drift in either direction fails rather than hides.
 *
 * Typed as plain strings because the only consumer is a string comparison against the
 * property-existence predicate; narrowing further would add nothing.
 */
const OPTION_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(OPTION_DECLARED_PROPERTIES);

/**
 * The six relationships `model/entity/Option.cfc` declares that the port deliberately does not model
 * as fields, each pinned to its declaring line.
 *
 * This is the checkable form of the scope statement in the file header. The image pair reaches the
 * out-of-scope image entity and the four promotion collections reach the out-of-scope promotion
 * entities, so none of them appears in the entity's property-name union — which is what makes
 * describing one a compile error rather than a matter of discipline. Recording the NAMES as strings
 * imports nothing: no promotion type and no image type is referenced anywhere in this file.
 */
const OPTION_EXCLUDED_RELATIONSHIP_LOCATORS: Readonly<Record<string, string>> = Object.freeze({
  defaultImage: 'model/entity/Option.cfc:L60',
  images: 'model/entity/Option.cfc:L63',
  promotionRewards: 'model/entity/Option.cfc:L67',
  promotionRewardExclusions: 'model/entity/Option.cfc:L68',
  promotionQualifiers: 'model/entity/Option.cfc:L69',
  promotionQualifierExclusions: 'model/entity/Option.cfc:L70',
});

/**
 * The `save` context — the only context `model/validation/Option.json` names on `optionCode`,
 * `optionName` and `optionGroup` (`:L3-L5`).
 */
const SAVE_CONTEXT: ValidationContext = 'save';

/**
 * The `delete` context — the only context `model/validation/Option.json:L6` names, on the `skus`
 * collection guard.
 */
const DELETE_CONTEXT: ValidationContext = 'delete';

/**
 * The literal suffix `model/entity/Option.cfc:L82` appends after the resolved image folder URL.
 *
 * Byte-exact and asserted as such: a leading slash, the lower-case word `option`, a trailing slash.
 * The trailing slash is what makes the returned value a DIRECTORY rather than a file path, and the
 * casing is what a case-sensitive object store would care about, so neither is normalised.
 */
const OPTION_IMAGE_DIRECTORY_SUFFIX = '/option/';

/**
 * A synthetic file-system path standing in for the value the out-of-scope settings engine would
 * resolve for `globalAssetsImageFolderPath`.
 *
 * DELIBERATELY NOT THE PRODUCTION DEFAULT. The effective value of that key is computed by the
 * setting service, which is out of scope, so reproducing whatever it happens to return would be
 * inventing a fact this file cannot verify. What `model/entity/Option.cfc:L81-L83` actually
 * guarantees is a composition — resolve the key, transform the path, append the suffix — and an
 * obviously synthetic input proves the composition without asserting anything about the default.
 */
const SYNTHETIC_IMAGE_FOLDER_PATH = '/opt/slatwall-test-fixture/assets/images';

/**
 * The web path the path-to-URL transform double returns for {@link SYNTHETIC_IMAGE_FOLDER_PATH}.
 *
 * The real transform is the framework object's pure string helper: it normalises backslashes and
 * strips the expanded web-root prefix. That behaviour belongs to its own owner and is NOT
 * reimplemented here — no filesystem call, no path module, no expansion of any root. The double
 * returns a canned value so the only thing this file asserts about `getImageDirectory` is what that
 * method itself is responsible for: which setting it reads, that it feeds the resolved value through
 * the transform, and the byte-exact suffix it appends.
 */
const SYNTHETIC_IMAGE_FOLDER_URL = '/slatwall-test-fixture/assets/images';

/* ================================================================================================
 * LOCAL HELPERS
 *
 * Each helper exists to remove repetition from the cases, never to stand in for behaviour under test.
 * None of them reimplements an entity member, and every one of them returns FRESH mutable state so
 * that no entity, collection or double is shared between cases. There is deliberately no
 * module-scope `Option`, `OptionGroup`, `Sku`, array or validator anywhere in this file: the frozen
 * constants above hold only strings.
 * ============================================================================================== */

/**
 * One entry of the entity's own populate descriptor set, named by type query so that no module
 * outside this file's dependency set has to be imported to talk about it.
 */
type OptionPropertyDescriptorEntry = (typeof OPTION_PROPERTY_DESCRIPTORS.properties)[number];

/**
 * Finds the populate descriptor the entity declares for a property, if it declares one.
 *
 * @param propertyName - The property to look up.
 * @returns The descriptor, or `undefined` when the property carries none.
 */
function findDescriptor(
  propertyName: OptionPropertyName,
): OptionPropertyDescriptorEntry | undefined {
  return OPTION_PROPERTY_DESCRIPTORS.properties.find(
    (descriptor) => descriptor.name === propertyName,
  );
}

/**
 * The declared column value type of a descriptor, or `undefined` for a descriptor that carries none.
 *
 * The `in` test is a narrowing operator rather than a cast: only the column-shaped member of the
 * descriptor union declares `valueType`, so the compiler selects it and the read is checked.
 *
 * @param descriptor - The descriptor to inspect.
 * @returns The declared value type, or `undefined`.
 */
function descriptorValueType(descriptor: OptionPropertyDescriptorEntry): string | undefined {
  return 'valueType' in descriptor ? descriptor.valueType : undefined;
}

/**
 * Builds a real `Option` that reads as SAVED, by assigning it a primary identifier.
 *
 * `Option.isNew()` is the port of the legacy new-flag derivation — the primary-ID value is compared
 * against the `unsavedvalue=""` of `model/entity/Option.cfc:L52` — so assigning the identifier is the
 * whole of "saving" for the purposes of that predicate. No persistence, no repository and no service
 * is involved, and the predicate itself is never stubbed.
 *
 * @param optionID - One of {@link SAVED_OPTION_IDS}.
 * @returns A real `Option` for which `isNew()` returns false.
 */
function createSavedOption(optionID: string): Option {
  const option = new Option();
  option.optionID = optionID;
  return option;
}

/**
 * A minimal owning-side collaborator that RECORDS the delegated call and deliberately declines to
 * maintain the relationship.
 *
 * WHY A RECORDER RATHER THAN THE REAL `Sku` FOR THE DELEGATION CASES. `model/entity/Option.cfc:L110-L115`
 * makes `addSku` and `removeSku` pure delegations onto the owning side: every observable effect on the
 * link belongs to the SKU. Against a real `Sku` a passing assertion is therefore ambiguous — the
 * collection could have been maintained by either party. A collaborator that records the call and
 * does nothing else removes the ambiguity: if the option's own inverse array changes, the option
 * mutated it itself, which is exactly the thing that must not happen on the inverse side.
 *
 * It implements the port's own {@link SkuOptionOwner} contract, so no cast and no structural fiction
 * is involved, and it reimplements neither `addOption` nor `removeOption` — it merely observes that
 * they were called and with what.
 */
class RecordingSkuOptionOwner implements SkuOptionOwner {
  /** Every option handed to {@link RecordingSkuOptionOwner.addOption}, in call order. */
  public readonly added: Option[] = [];

  /** Every option handed to {@link RecordingSkuOptionOwner.removeOption}, in call order. */
  public readonly removed: Option[] = [];

  /**
   * Records the attach delegation of `model/entity/Option.cfc:L111` without performing it.
   *
   * @param option - The option the entity delegated with.
   */
  public addOption(option: Option): void {
    this.added.push(option);
  }

  /**
   * Records the detach delegation of `model/entity/Option.cfc:L114` without performing it.
   *
   * @param option - The option the entity delegated with.
   */
  public removeOption(option: Option): void {
    this.removed.push(option);
  }
}

/**
 * What {@link createImageDirectoryCollaborator} hands back: the collaborator the entity is called
 * with, plus the two recorders that make its use observable.
 */
interface ImageDirectoryCollaborator {
  /** The collaborator passed to `Option.getImageDirectory`. */
  readonly resolver: OptionImageDirectoryResolver;

  /**
   * The settings double's own LIVE call log, exposed by reference rather than copied, so a case that
   * asserts against it after invoking the entity sees what the entity actually did.
   */
  readonly settingCalls: readonly SettingResolverCall[];

  /** Every path the entity fed through the path-to-URL transform, in call order. */
  readonly transformedPaths: readonly string[];
}

/**
 * Builds the two capabilities `model/entity/Option.cfc:L81-L83` reaches through, as a fresh
 * collaborator per case.
 *
 * The settings half is the SYNCHRONOUS setting-resolver double from
 * `test/support/inMemoryRepositories.ts`, seeded with the one key this entity reads. Synchronous is
 * the point: the legacy `setting()` helper returned a value directly, so a caller could compose it
 * inline, and the target port is declared synchronous for the same reason. Seeding is also the point
 * — that double raises rather than guessing when an unseeded key is read, so a mis-typed key surfaces
 * as a failure instead of silently resolving to a fabricated default.
 *
 * The path-to-URL half has no port and needs none, being a pure string transform; here it is a
 * recorder returning a canned web path, so this file asserts nothing about a transform it does not
 * own and performs no filesystem or path resolution of any kind.
 *
 * @returns A fresh collaborator plus its two call recorders.
 */
function createImageDirectoryCollaborator(): ImageDirectoryCollaborator {
  const settings = createSettingResolverDouble({
    settings: [{ settingName: 'globalAssetsImageFolderPath', value: SYNTHETIC_IMAGE_FOLDER_PATH }],
  });
  const transformedPaths: string[] = [];

  return {
    settingCalls: settings.calls,
    transformedPaths,
    resolver: {
      setting: (settingName: 'globalAssetsImageFolderPath'): string =>
        settings.resolver.setting(settingName),
      getURLFromPath: (path: string): string => {
        transformedPaths.push(path);
        return SYNTHETIC_IMAGE_FOLDER_URL;
      },
    },
  };
}

/* ================================================================================================
 * THE PERSISTENT PROPERTY SURFACE — `model/entity/Option.cfc:L52-L56`
 *
 * Five properties, one case each, plus one completeness case. Only source-grounded defaults are
 * asserted: where the legacy declares a `default=` attribute the ported value is checked against it,
 * and where it declares none the field is asserted ABSENT rather than given an invented starting
 * value.
 * ============================================================================================== */

describe('Option — the persistent property surface', () => {
  it('NET-NEW — model/entity/Option.cfc:L52 — optionID is the primary identifier and holds the declared unsaved value on a fresh instance', () => {
    const option = new Option();

    // `:L52` declares `unsavedvalue="" default=""`, so the starting value is the empty string —
    // not null, not absent and never a generated identifier (AAP IR-6).
    expect(option.optionID).toBe(OPTION_UNSAVED_ID_VALUE);
    expect(typeof option.optionID).toBe('string');
    expect(Object.hasOwn(option, 'optionID')).toBe(true);

    // The same value is what the primary-ID reader reports, which is what makes the derived new-flag
    // work without any persistence being present.
    expect(option.getPrimaryIDValue()).toBe(OPTION_UNSAVED_ID_VALUE);

    // `fieldtype="id"` is the reason this property, alone among the five, carries NO populate
    // descriptor: a primary key is assigned by the persistence layer, never populated from input.
    expect(findDescriptor('optionID')).toBeUndefined();

    // It is nevertheless a declared property, because the legacy metadata predicate answered over
    // declarations rather than over populatable fields.
    expect(option.hasProperty('optionID')).toBe(true);
    expect(OPTION_DECLARED_PROPERTY_LOCATORS.optionID).toBe('model/entity/Option.cfc:L52');
  });

  it('NET-NEW — model/entity/Option.cfc:L53 — optionCode is a populate-enabled string with no declared default, and the entity applies no formatting to it', () => {
    const option = new Option();

    // `ormtype="string"` with no `default=` attribute, so a fresh instance carries no value. The
    // field is present-but-undefined rather than deleted, which is what the population engine's
    // clear-on-null semantics require of a scalar column.
    expect(option.optionCode).toBeUndefined();

    const descriptor = findDescriptor('optionCode');
    expect(descriptor).toBeDefined();
    if (descriptor !== undefined) {
      expect(descriptorValueType(descriptor)).toBe('string');
      // Absent `populateEnabled` means the default, populatable state — contrast the audit block,
      // which the legacy marks `hb_populateEnabled="false"`.
      expect(descriptor.populateEnabled).toBeUndefined();
    }

    // The entity stores the code verbatim. Its format and uniqueness are declared in
    // `model/validation/Option.json:L3` and enforced by the validation layer, never by the setter,
    // so a value that the rule set would reject is still assignable here.
    option.optionCode = 'colour red';
    expect(option.optionCode).toBe('colour red');
  });

  it('NET-NEW — model/entity/Option.cfc:L54 — optionName is a populate-enabled string with no declared default', () => {
    const option = new Option();

    expect(option.optionName).toBeUndefined();

    const descriptor = findDescriptor('optionName');
    expect(descriptor).toBeDefined();
    if (descriptor !== undefined) {
      expect(descriptorValueType(descriptor)).toBe('string');
      expect(descriptor.populateEnabled).toBeUndefined();
    }

    option.optionName = 'Red';
    expect(option.optionName).toBe('Red');

    // `model/validation/Option.json:L4` requires presence in the `save` context only, so the entity
    // itself accepts absence — asserted here, exercised by the validation cases further down.
    expect(option.hasProperty('optionName')).toBe(true);
  });

  it('NET-NEW — model/entity/Option.cfc:L55 — optionDescription is a populate-enabled long string and the entity enforces no length limit of its own', () => {
    const option = new Option();

    expect(option.optionDescription).toBeUndefined();

    const descriptor = findDescriptor('optionDescription');
    expect(descriptor).toBeDefined();
    if (descriptor !== undefined) {
      // `length="4000"` is a column width and `hb_formFieldType="wysiwyg"` is an admin-form hint.
      // Neither is a value type, so the descriptor declares the same `string` type as its siblings
      // and no max-length rule is invented here — `model/validation/Option.json` declares none for
      // this property.
      expect(descriptorValueType(descriptor)).toBe('string');
      expect(descriptor.populateEnabled).toBeUndefined();
    }

    option.optionDescription = '<p>A description carrying markup, stored verbatim.</p>';
    expect(option.optionDescription).toBe('<p>A description carrying markup, stored verbatim.</p>');
  });

  it('NET-NEW — model/entity/Option.cfc:L56 — sortOrder is an integer that starts absent because it is assigned per option group by the persistence lifecycle', () => {
    const option = new Option();

    // ABSENT, NOT SEEDED. `:L56` declares `ormtype="integer"` with NO `default=` and NO
    // `required="true"` — contrast `model/entity/OptionGroup.cfc:L58`, whose sortOrder IS declared
    // required. Nothing in application code assigns this field; the legacy pre-insert hook did, and
    // in the port that responsibility sits with the persistence layer. So the honest fresh-instance
    // state is "no value", and no starting number is invented for it here.
    expect(option.sortOrder).toBeUndefined();

    // `sortContext="optionGroup"` is the part that must not be mistaken for a table-wide seed: the
    // first value is the maximum WITHIN THE OWNING OPTION GROUP plus one, which is why the seed
    // cannot be computed without a parent and is deliberately not asserted as a number here.
    expect(OPTION_DECLARED_PROPERTY_LOCATORS.sortOrder).toBe('model/entity/Option.cfc:L56');

    const descriptor = findDescriptor('sortOrder');
    expect(descriptor).toBeDefined();
    if (descriptor !== undefined) {
      expect(descriptorValueType(descriptor)).toBe('integer');
      expect(descriptor.populateEnabled).toBeUndefined();
    }

    // The field stays freely assignable so the persistence layer can write the resolved value, and
    // the ordering it feeds — the parent collection's `orderby="sortOrder"` at
    // `model/entity/OptionGroup.cfc:L70` — reads it straight back.
    option.sortOrder = 2;
    expect(option.sortOrder).toBe(2);

    // `model/validation/Option.json` declares NO rule for this property, and none is added: the rule
    // set below is consumed as written rather than extended.
    const declaredRuleProperties = optionValidationRuleSet.properties.map(
      (property) => property.propertyIdentifier,
    );
    expect(declaredRuleProperties).not.toContain('sortOrder');
  });

  it('NET-NEW — model/entity/Option.cfc:L52-L56 — the persistent surface is exactly these five properties, and the declared name space matches the port exactly', () => {
    const option = new Option();

    expect(OPTION_PERSISTENT_PROPERTY_NAMES).toEqual([
      'optionID',
      'optionCode',
      'optionName',
      'optionDescription',
      'sortOrder',
    ]);
    expect(OPTION_PERSISTENT_PROPERTY_NAMES).toHaveLength(5);

    // Each of the five is a declared property of the entity and is pinned to a legacy line.
    for (const propertyName of OPTION_PERSISTENT_PROPERTY_NAMES) {
      expect(option.hasProperty(propertyName)).toBe(true);
      expect(OPTION_DECLARED_PROPERTY_NAMES).toContain(propertyName);
      expect(OPTION_DECLARED_PROPERTY_LOCATORS[propertyName]).toMatch(
        /^model\/entity\/Option\.cfc:L\d+$/,
      );
    }

    // The locator map and the production declared set agree in BOTH directions, so neither can
    // drift silently: a property added to the entity but not recorded here fails, and a name
    // recorded here that the entity does not declare could not have compiled.
    expect([...OPTION_DECLARED_PROPERTY_NAMES].sort()).toEqual(
      Object.keys(OPTION_DECLARED_PROPERTY_LOCATORS).sort(),
    );

    // An undeclared name answers false, which is what makes a rule for a property the subject does
    // not carry inert rather than an error.
    expect(option.hasProperty('optionGroupName')).toBe(false);
  });
});

/* ================================================================================================
 * CONSTRUCTION AND UNSAVED IDENTITY — the derived `isNew()` predicate
 *
 * `isNew()` is the one framework member the port declares on this entity, and it is declared because
 * the entity's OWN `:L94` short-circuit calls it. Everything the `setOptionGroup` parity cases assert
 * hangs off this predicate, so it gets its own coverage first.
 * ============================================================================================== */

describe('Option — construction and unsaved identity', () => {
  it('NET-NEW — model/entity/Option.cfc:L52 — a freshly constructed Option is new, and assigning an identifier is the whole of becoming saved', () => {
    const option = new Option();

    // The port of the legacy new-flag derivation: an empty primary-ID value means new.
    expect(option.isNew()).toBe(true);
    expect(option.getPrimaryIDValue()).toBe(OPTION_UNSAVED_ID_VALUE);
    expect(option.getPrimaryIDValue()).toHaveLength(0);

    option.optionID = SAVED_OPTION_IDS.hasOptionGuard;

    expect(option.isNew()).toBe(false);
    expect(option.getPrimaryIDValue()).toBe(SAVED_OPTION_IDS.hasOptionGuard);

    // Returning to the declared unsaved value returns the entity to the new state, because the
    // predicate is derived rather than stored — there is no separate flag to fall out of step.
    option.optionID = OPTION_UNSAVED_ID_VALUE;
    expect(option.isNew()).toBe(true);
  });

  it('NET-NEW — model/entity/Option.cfc:L49 — an Option is constructible with no arguments and no collaborator, and its collections start empty and live', () => {
    // Zero-dependency constructibility is the property that lets this whole suite be unit tests: no
    // application boot, no container, no service lookup and no connection, in contrast to the legacy
    // fixture described in the file header.
    const option = new Option();
    const other = new Option();

    expect(option.skus).toEqual([]);
    expect(other.skus).toEqual([]);

    // Each instance owns its own array — a shared module-scope collection would leak state between
    // cases, which is exactly what the legacy per-instance memoisation hazards looked like.
    expect(other.skus).not.toBe(option.skus);

    // The inverse collection is exposed as a live array rather than copied on read, so a repeated
    // read is the same object.
    expect(option.skus).toBe(option.skus);

    // The support builder produces the same zero-argument construction, seeding only what it is
    // asked for, so a builder-made Option is indistinguishable from a hand-made one.
    const built = buildOption();
    expect(built).toBeInstanceOf(Option);
    expect(built.isNew()).toBe(true);
    expect(built.optionCode).toBeUndefined();
    expect(built.sortOrder).toBeUndefined();
  });
});

/* ================================================================================================
 * THE REQUIRED OPTION-GROUP RELATIONSHIP — `model/entity/Option.cfc:L59` and
 * `model/validation/Option.json:L5`
 *
 * F5 — THE DELIBERATE TENSION BETWEEN THE TWO SOURCES, RESOLVED IN NEITHER DIRECTION.
 * The ORM mapping at `:L59` declares `cfc="OptionGroup" fieldtype="many-to-one"
 * fkcolumn="optionGroupID"` and carries NO requiredness attribute, so a transient Option with no
 * group is a legal object as far as the mapping is concerned. The validation document at `:L5`
 * declares `[{"contexts":"save","required":true}]`, so that same object cannot be SAVED. The port
 * keeps both halves exactly as they are: the TypeScript field is optional, and the rule set rejects
 * its absence in the `save` context. Tightening the field to required would make the rule
 * unreachable; dropping the rule would make an unsaveable object saveable. Neither is done, and the
 * two cases below assert each half in turn so the tension is visible rather than smoothed over.
 * ============================================================================================== */

describe('Option — the required option-group relationship', () => {
  it('NET-NEW — model/entity/Option.cfc:L59 — a fresh Option is constructible with the option-group field entirely absent, not merely undefined', () => {
    const option = new Option();

    // ABSENT, NOT PRESENT-HOLDING-UNDEFINED. The many-to-one is the one field the port declares
    // without emitting it, which is what lets an unresolved association be distinguished from one
    // resolved to nothing. The row mapper hydrates scalar columns only and leaves every many-to-one
    // unresolved, so absence is the state it guarantees and the state the entity must start in.
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
    expect('optionGroup' in option).toBe(false);
    expect(option.optionGroup).toBeUndefined();

    // Absent as a VALUE, still present as a DECLARATION — the distinction the legacy metadata
    // predicate turned on, and the reason the rule below is evaluated rather than skipped.
    expect(option.hasProperty('optionGroup')).toBe(true);
    expect(OPTION_DECLARED_PROPERTY_LOCATORS.optionGroup).toBe('model/entity/Option.cfc:L59');

    // The mapping is a many-to-one, so there is no group-side collection to initialise on this
    // entity and no `getOptionGroups` accessor is invented.
    expect(Object.getOwnPropertyNames(Option.prototype)).not.toContain('getOptionGroups');
  });

  it('NET-NEW — model/validation/Option.json:L5 — saving an Option with no option group fails validation, keyed by the full property name with an array of messages', async () => {
    const harness = createValidatorHarness();
    const option = new Option();

    // The REAL validator over the REAL rule set. No fake rule engine, no hand-rolled predicate and
    // no reimplementation of the constraint evaluator appears in this file.
    expect(harness.validator).toBeInstanceOf(Validator);

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);

    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasErrors()).toBe(true);

    // KEYED BY THE FULL PROPERTY IDENTIFIER, `optionGroup`, not by a trailing segment and not by a
    // rewritten label. The legacy engine reported against the identifier the rule was declared
    // under, and the port keeps that.
    expect(errors.hasError('optionGroup')).toBe(true);
    expect(Object.keys(errors.getErrors())).toContain('optionGroup');

    // STORED AS AN ARRAY, because a property can accumulate more than one failure — which is exactly
    // what `optionCode` does in this same run.
    const optionGroupMessages = errors.getError('optionGroup');
    expect(Array.isArray(optionGroupMessages)).toBe(true);
    expect(optionGroupMessages).toEqual(['validate.save.Option.optionGroup.required']);

    // The rest of the bag in the same run, so the requiredness of the group is seen alongside the
    // two required scalars of `:L3` and `:L4` rather than in isolation. `skus` is absent because its
    // only rule names the `delete` context.
    expect(errors.getErrors()).toEqual({
      optionCode: ['validate.save.Option.optionCode.required'],
      optionName: ['validate.save.Option.optionName.required'],
      optionGroup: ['validate.save.Option.optionGroup.required'],
    });
    expect(errors.hasError('skus')).toBe(false);
  });

  it('NET-NEW — model/validation/Option.json:L5 — assigning a real option group satisfies the requirement by presence alone, with no further constraint on the group', async () => {
    const harness = createValidatorHarness();
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'red', optionName: 'Red', optionGroup });

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);

    // Presence is the whole of the requirement. The legacy required-check passed any component
    // outright without inspecting it, so an option group carrying no name and no code still
    // satisfies `:L5` — and the port must not invent a deeper check.
    expect(option.optionGroup).toBe(optionGroup);
    expect(errors.hasError('optionGroup')).toBe(false);
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});
  });
});

/* ================================================================================================
 * `setOptionGroup()` — `model/entity/Option.cfc:L92-L97`
 *
 * The legacy body, verbatim:
 *
 *     variables.optionGroup = arguments.optionGroup;
 *     if(isNew() or !arguments.optionGroup.hasOption( this )) {
 *         arrayAppend(arguments.optionGroup.getOptions(), this);
 *     }
 *
 * Two behaviours have to survive together: the assignment is unconditional, and the append is
 * governed by a SHORT-CIRCUITING disjunction whose left operand is the new-flag. The order of those
 * operands is the whole of the parity question, and the cases below fix it in both directions.
 * ============================================================================================== */

describe('Option — setOptionGroup parity', () => {
  it('NET-NEW — model/entity/Option.cfc:L92-L97 — setOptionGroup assigns the group and appends the option into the group live options array', () => {
    const optionGroup = new OptionGroup();
    const option = new Option();

    expect(optionGroup.getOptions()).toEqual([]);

    option.setOptionGroup(optionGroup);

    // The assignment at `:L93` happens first and unconditionally.
    expect(option.optionGroup).toBe(optionGroup);
    expect(Object.hasOwn(option, 'optionGroup')).toBe(true);

    // The append at `:L95` targets the group's LIVE collection, not a copy of it — the legacy
    // appended into the array `getOptions()` returned, and the port reads the same array back.
    expect(optionGroup.getOptions()).toHaveLength(1);
    expect(optionGroup.getOptions()[0]).toBe(option);
    expect(optionGroup.hasOption(option)).toBe(true);
    expect(optionGroup.getOptions()).toBe(optionGroup.options);

    // The group's own delegating helper reaches the identical body, because
    // `model/entity/OptionGroup.cfc:L92-L94` is nothing but `option.setOptionGroup(this)`. Asserting
    // it here is what proves the two entities are wired to each other rather than each maintaining a
    // private view of the relationship.
    const secondGroup = new OptionGroup();
    const secondOption = new Option();
    secondGroup.addOption(secondOption);
    expect(secondOption.optionGroup).toBe(secondGroup);
    expect(secondGroup.getOptions()).toEqual([secondOption]);
  });

  it('NET-NEW — model/entity/Option.cfc:L92-L97 — a NEW option short-circuits the containment test and appends again, so a repeated assignment double-appends', () => {
    const optionGroup = new OptionGroup();
    const option = new Option();

    // The option is new, which is the left operand of the `:L94` disjunction.
    expect(option.isNew()).toBe(true);

    option.setOptionGroup(optionGroup);
    expect(optionGroup.getOptions()).toHaveLength(1);

    // The group now already contains the option, so the right operand would suppress the append.
    expect(optionGroup.hasOption(option)).toBe(true);

    option.setOptionGroup(optionGroup);

    // TODO(parity) F3 — model/entity/Option.cfc:L92-L97. `isNew()` is the LEFT operand of an `or`,
    // so for an unsaved option it short-circuits and the containment test is never reached. The
    // append therefore happens a second time and the group holds the identical instance twice. This
    // is carried across exactly as written: no containment guard is added, no de-duplication is
    // performed and the entry is not collapsed. Repairing it would change observable behaviour, and
    // it would change it in a place that matters — the parent collection is declared
    // `cascade="all-delete-orphan"` at `model/entity/OptionGroup.cfc:L70`, and the option-group sort
    // order this collection feeds is read by the sorted-SKU ordering query.
    expect(optionGroup.getOptions()).toHaveLength(2);
    expect(optionGroup.getOptions()[0]).toBe(option);
    expect(optionGroup.getOptions()[1]).toBe(option);
    expect(optionGroup.getOptions().filter((candidate) => candidate === option)).toHaveLength(2);

    // The assignment side stays single-valued regardless of how many times the append fired, because
    // `:L93` overwrites rather than accumulates.
    expect(option.optionGroup).toBe(optionGroup);
  });

  it('NET-NEW — model/entity/Option.cfc:L92-L97 — a PERSISTED option already in the group takes the containment branch and is not appended again', () => {
    const optionGroup = new OptionGroup();
    const option = createSavedOption(SAVED_OPTION_IDS.hasOptionGuard);

    // Saved, so the left operand is false and the containment test at `:L94` is the one that
    // decides — the branch a new option can never reach.
    expect(option.isNew()).toBe(false);

    option.setOptionGroup(optionGroup);
    expect(optionGroup.getOptions()).toHaveLength(1);
    expect(optionGroup.hasOption(option)).toBe(true);

    option.setOptionGroup(optionGroup);

    // `!hasOption(this)` is false, so the append is skipped and the collection stays single-entry.
    // This is the same code path as the double-append case above, differing only in the identifier,
    // which is what makes the parity finding a property of the new-flag rather than of the group.
    expect(optionGroup.getOptions()).toHaveLength(1);
    expect(optionGroup.getOptions()[0]).toBe(option);
    expect(option.optionGroup).toBe(optionGroup);
  });

  it('NET-NEW — model/entity/Option.cfc:L92-L97 — reassigning a persisted option to a second group appends into the new group and leaves the previous membership behind', () => {
    const firstGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const secondGroup = buildOptionGroup({ optionGroupCode: 'size' });
    const option = createSavedOption(SAVED_OPTION_IDS.crossGroup);

    option.setOptionGroup(firstGroup);
    option.setOptionGroup(secondGroup);

    // The many-to-one now points at the second group, because `:L93` overwrites.
    expect(option.optionGroup).toBe(secondGroup);
    expect(secondGroup.getOptions()).toEqual([option]);

    // TODO(parity) — the first group's collection is NOT cleaned up. `:L92-L97` performs no removal
    // from a previously assigned group; only `removeOptionGroup` at `:L98-L107` does that, and
    // nothing calls it here. The stale membership is preserved rather than tidied, because tidying
    // it would add behaviour the legacy entity does not have.
    expect(firstGroup.getOptions()).toEqual([option]);
    expect(firstGroup.hasOption(option)).toBe(true);
  });
});

/* ================================================================================================
 * `removeOptionGroup()` — `model/entity/Option.cfc:L98-L107`
 *
 * The legacy body, verbatim:
 *
 *     if(!structKeyExists(arguments, "optionGroup")) {
 *         arguments.optionGroup = variables.optionGroup;
 *     }
 *     var index = arrayFind(arguments.optionGroup.getOptions(), this);
 *     if(index > 0) {
 *         arrayDeleteAt(arguments.optionGroup.getOptions(), index);
 *     }
 *     structDelete(variables, "optionGroup");
 *
 * G6 / F6 — THE INDEX-BASE SENTINEL TRANSLATION, AND WHY IT IS NOT A BEHAVIOUR CHANGE.
 * `model/entity/Option.cfc:L102-L104` is the one place in this entity where a faithful transliteration
 * would be WRONG. CFML arrays are ONE-based and `arrayFind` returns `0` to mean "not found", so
 * `index > 0` reads as "found" there. JavaScript arrays are ZERO-based and `indexOf` returns `-1` to
 * mean "not found", so the same predicate written as `index > 0` would silently skip the FIRST
 * element of every collection. The correct translation of the sentinel is `index !== -1` followed by
 * `splice`, which is what the port does — a technology-specific indexing translation carrying exactly
 * the legacy meaning, not a change to what the method does. The first case below is the regression
 * that would fail under the naive transliteration, and it is mandatory precisely because a
 * transliteration bug there produces no error and no compile failure.
 * ============================================================================================== */

describe('Option — removeOptionGroup translation', () => {
  it('NET-NEW — model/entity/Option.cfc:L102-L104 — removal succeeds for the option at array position zero, which the naive one-based sentinel would have skipped', () => {
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const first = buildOption({ optionCode: 'red', optionName: 'Red', optionGroup });
    const second = buildOption({ optionCode: 'blue', optionName: 'Blue', optionGroup });

    // The regression's precondition: the option under test is at JavaScript index 0. Under CFML that
    // same position is index 1 and `index > 0` is true; under JavaScript `index > 0` would be false
    // and the option would never be spliced out.
    expect(optionGroup.getOptions().indexOf(first)).toBe(0);
    expect(optionGroup.getOptions()).toHaveLength(2);

    first.removeOptionGroup(optionGroup);

    // G6 / F6 — `index !== -1` plus `splice`, so position zero is removed like any other.
    expect(optionGroup.getOptions()).toHaveLength(1);
    expect(optionGroup.hasOption(first)).toBe(false);

    // The sibling is untouched and has shifted down, which is what `splice` does and what
    // `arrayDeleteAt` did.
    expect(optionGroup.getOptions()[0]).toBe(second);
    expect(optionGroup.hasOption(second)).toBe(true);
  });

  it('NET-NEW — model/entity/Option.cfc:L102-L104 — removal of a later position leaves the earlier entries in place, so the translated sentinel is not merely off by one', () => {
    const optionGroup = buildOptionGroup({ optionGroupCode: 'size' });
    const first = createSavedOption(SAVED_OPTION_IDS.spliceFirst);
    const second = createSavedOption(SAVED_OPTION_IDS.spliceSecond);
    first.setOptionGroup(optionGroup);
    second.setOptionGroup(optionGroup);

    expect(optionGroup.getOptions()).toEqual([first, second]);

    second.removeOptionGroup(optionGroup);

    expect(optionGroup.getOptions()).toEqual([first]);
    expect(optionGroup.hasOption(first)).toBe(true);
    expect(optionGroup.hasOption(second)).toBe(false);
  });

  it('NET-NEW — model/entity/Option.cfc:L106 — the relationship property is unset unconditionally, even when the option was not a member of the collection', () => {
    const assignedGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const unrelatedGroup = buildOptionGroup({ optionGroupCode: 'material' });
    const option = createSavedOption(SAVED_OPTION_IDS.nonMember);
    option.setOptionGroup(assignedGroup);

    expect(option.optionGroup).toBe(assignedGroup);
    expect(unrelatedGroup.hasOption(option)).toBe(false);

    // The explicit-argument path of `:L99-L101`: the caller names a group the option is NOT in, so
    // the lookup finds nothing and the splice at `:L103-L105` is skipped entirely.
    option.removeOptionGroup(unrelatedGroup);

    expect(unrelatedGroup.getOptions()).toEqual([]);

    // `:L106` sits OUTSIDE the found-branch, so the back-reference is deleted regardless. That is
    // faithfully carried: the option ends up with no group even though nothing was spliced, and the
    // group it really belonged to still lists it.
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
    expect('optionGroup' in option).toBe(false);
    expect(option.optionGroup).toBeUndefined();

    // TODO(parity) — the assigned group keeps the now-orphaned membership. `:L98-L107` removes from
    // the group it was ASKED about, never from the one the option was actually assigned to, and no
    // reconciliation is added here.
    expect(assignedGroup.getOptions()).toEqual([option]);
  });

  it('NET-NEW — model/entity/Option.cfc:L99-L101 — the optional argument falls back to the currently assigned group, and the fallback removes the membership', () => {
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'green', optionName: 'Green', optionGroup });

    expect(option.optionGroup).toBe(optionGroup);
    expect(optionGroup.getOptions()).toEqual([option]);

    // No argument at all — the port of the `structKeyExists(arguments, "optionGroup")` default at
    // `:L99-L101`, which substituted the currently assigned group.
    option.removeOptionGroup();

    expect(optionGroup.getOptions()).toEqual([]);
    expect(optionGroup.hasOption(option)).toBe(false);
    expect(option.optionGroup).toBeUndefined();
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
  });

  it('NET-NEW — model/entity/Option.cfc:L98-L107 — a second removal is a no-op rather than a failure, because there is no longer a group to fall back to', () => {
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'white', optionName: 'White', optionGroup });

    option.removeOptionGroup();
    expect(option.optionGroup).toBeUndefined();

    // The fallback now resolves to nothing. The port guards the collection lookup on that, so the
    // unconditional unset at `:L106` still runs and no error escapes — which is the behaviour a
    // repeated cleanup path depends on.
    expect(() => {
      option.removeOptionGroup();
    }).not.toThrow();

    expect(option.optionGroup).toBeUndefined();
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
    expect(optionGroup.getOptions()).toEqual([]);
  });

  it('NET-NEW — model/entity/Option.cfc:L98-L107 — a never-assigned option can be removed, and the group-side delegating helper reaches the same body', () => {
    const orphan = new Option();

    // No group was ever assigned, so both the argument and the fallback are absent.
    expect(Object.hasOwn(orphan, 'optionGroup')).toBe(false);
    expect(() => {
      orphan.removeOptionGroup();
    }).not.toThrow();
    expect(orphan.optionGroup).toBeUndefined();

    // `model/entity/OptionGroup.cfc:L95-L97` is nothing but `option.removeOptionGroup(this)`, so the
    // group-side helper must produce the identical outcome. Exercising it here is what proves the
    // removal is owned in one place rather than implemented twice.
    const optionGroup = new OptionGroup();
    const member = new Option();
    optionGroup.addOption(member);
    expect(optionGroup.getOptions()).toEqual([member]);

    optionGroup.removeOption(member);

    expect(optionGroup.getOptions()).toEqual([]);
    expect(member.optionGroup).toBeUndefined();
    expect(Object.hasOwn(member, 'optionGroup')).toBe(false);
  });
});

/* ================================================================================================
 * THE SKUS RELATIONSHIP, INVERSE OVER `SwSkuOption` — `model/entity/Option.cfc:L66` and `:L109-L115`
 *
 * THE OWNERSHIP ASYMMETRY IS THE WHOLE POINT, AND IT IS DECLARED IN THE MAPPINGS.
 *   `model/entity/Sku.cfc:L75` labels its block "(many-to-many - owner)" and `:L76` declares
 *       `linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"` with NO `inverse`
 *       attribute — so the SKU OWNS the association and is the side that writes the link row.
 *   `model/entity/Option.cfc:L66` declares the mirror image,
 *       `linktable="SwSkuOption" fkcolumn="optionID" inversejoincolumn="skuID"`, and it DOES carry
 *       `inverse="true"` — so the Option is the INVERSE side and merely reflects the link.
 *
 * That is why `:L110-L112` and `:L113-L115` are pure delegations: `addSku` is `sku.addOption(this)`
 * and `removeSku` is `sku.removeOption(this)`. Neither touches the option's own collection, and the
 * cases below assert both halves of that — the delegation happened, AND the inverse array was left
 * alone. The link table is named here as prose provenance only; no SQL and no adapter is reached from
 * this file.
 *
 * Neither `addSku` nor `removeSku` was ever declared in `model/entity/Sku.cfc`'s counterpart members:
 * `addOption` and `removeOption` were synthesized at runtime from the owning mapping's
 * `singularname="option"`, which is precisely the implicit surface AAP IR-1 requires to be declared
 * explicitly in the port. Calling them below is therefore the first executable check that those two
 * declarations exist and behave.
 * ============================================================================================== */

describe('Option — the SKUs inverse relationship over SwSkuOption', () => {
  it('NET-NEW — model/entity/Option.cfc:L66 — the SKUs collection is the inverse side, exposed as a live array with no collection accessor of its own', () => {
    const option = new Option();

    // Present and initialised, because a many-to-many collection is hydrated as an array rather than
    // left unresolved the way the many-to-one is.
    expect(Object.hasOwn(option, 'skus')).toBe(true);
    expect(option.skus).toEqual([]);
    expect(option.hasProperty('skus')).toBe(true);
    expect(OPTION_DECLARED_PROPERTY_LOCATORS.skus).toBe('model/entity/Option.cfc:L66');

    // The INVERSE side exposes no collection accessor at all: `model/entity/Option.cfc` declares no
    // `getSkus`/`hasSku` body, unlike `model/entity/OptionGroup.cfc:L73-L79` which declares
    // `getOptions`. The port declares exactly the members the legacy declares, so no accessor is
    // invented here to make the two sides look symmetrical.
    const optionMembers = Object.getOwnPropertyNames(Option.prototype);
    expect(optionMembers).toContain('addSku');
    expect(optionMembers).toContain('removeSku');
    expect(optionMembers).not.toContain('getSkus');
    expect(optionMembers).not.toContain('hasSku');

    // The OWNING side does declare its collection accessors, which is the asymmetry stated above
    // expressed as a structural fact rather than as a comment.
    const skuMembers = Object.getOwnPropertyNames(Sku.prototype);
    expect(skuMembers).toContain('getOptions');
    expect(skuMembers).toContain('hasOption');
    expect(skuMembers).toContain('addOption');
    expect(skuMembers).toContain('removeOption');
  });

  it('NET-NEW — model/entity/Option.cfc:L110-L112 — addSku delegates to the SKU and never pushes into the option own inverse array', () => {
    const option = new Option();
    const owner = new RecordingSkuOptionOwner();

    option.addSku(owner);

    // The delegation of `:L111` happened, with `this` as the argument.
    expect(owner.added).toEqual([option]);
    expect(owner.removed).toEqual([]);

    // AND the option's own collection is untouched. The recorder deliberately declines to maintain
    // the relationship, so any entry appearing here could only have been put there by the option
    // itself — which on the inverse side must never happen.
    expect(option.skus).toEqual([]);
    expect(option.skus).toHaveLength(0);
  });

  it('NET-NEW — model/entity/Option.cfc:L113-L115 — removeSku delegates to the SKU and never mutates the option own inverse array', () => {
    const option = new Option();
    const owner = new RecordingSkuOptionOwner();

    // Seed the inverse array the way the persistence layer would, so that a method which wrongly
    // mutated it would be caught rather than merely failing to add.
    option.skus.push(owner);
    expect(option.skus).toHaveLength(1);

    option.removeSku(owner);

    // The delegation of `:L114` happened.
    expect(owner.removed).toEqual([option]);
    expect(owner.added).toEqual([]);

    // The inverse array is left exactly as it was found. `:L113-L115` performs no removal of its own,
    // and the port performs none either.
    expect(option.skus).toEqual([owner]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L75-L76 — against a real Sku the owning side maintains the association end to end, and the option inverse array stays empty', () => {
    const option = buildOption({ optionCode: 'red', optionName: 'Red' });
    const sku = buildSku({ skuCode: 'SKU-RED' });

    option.addSku(sku);

    // The owning collection now carries the option, which is the observable effect the delegation
    // was for.
    expect(sku.getOptions()).toEqual([option]);
    expect(sku.hasOption(option)).toBe(true);
    expect(sku.getOptions()).toBe(sku.options);

    // The inverse side is still empty, because it is the SKU that owns the link.
    expect(option.skus).toEqual([]);

    // The owning side carries its own containment guard, so a repeated attach does not duplicate —
    // note that this is the OWNER's guard and is unrelated to the unsaved short-circuit that makes
    // `setOptionGroup` double-append.
    option.addSku(sku);
    expect(sku.getOptions()).toEqual([option]);

    option.removeSku(sku);

    expect(sku.getOptions()).toEqual([]);
    expect(sku.hasOption(option)).toBe(false);
    expect(option.skus).toEqual([]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L75-L76 — several options attach to one SKU in call order, and each option keeps its own empty inverse array', () => {
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const red = buildOption({ optionCode: 'red', optionName: 'Red', optionGroup });
    const blue = buildOption({ optionCode: 'blue', optionName: 'Blue', optionGroup });
    const sku = buildSku({ skuCode: 'SKU-MULTI' });

    red.addSku(sku);
    blue.addSku(sku);

    // Order is the order of the calls: the owning collection is appended to, never sorted.
    expect(sku.getOptions()).toEqual([red, blue]);

    // Each inverse side remains its own untouched array — no shared collection, no cross-talk.
    expect(red.skus).toEqual([]);
    expect(blue.skus).toEqual([]);
    expect(red.skus).not.toBe(blue.skus);

    red.removeSku(sku);

    // Removing one leaves the other, and the removal happened entirely on the owning side.
    expect(sku.getOptions()).toEqual([blue]);
    expect(sku.hasOption(red)).toBe(false);
    expect(sku.hasOption(blue)).toBe(true);
  });
});

/* ================================================================================================
 * `getImageDirectory()` — `model/entity/Option.cfc:L81-L83`
 *
 * The legacy body is one line:
 *
 *     return getURLFromPath(setting('globalAssetsImageFolderPath')) & '/option/';
 *
 * Both members it calls arrived by inheritance and both cross the scope boundary: `setting()` forwards
 * into the out-of-scope setting service's effective-value engine, and `getURLFromPath()` is the
 * framework object's pure string transform. The port takes them as one explicit collaborator
 * parameter, so this method is the only member of the entity that needs anything injected — and the
 * only one whose test needs a double.
 *
 * WHAT IS ASSERTED, AND WHAT DELIBERATELY IS NOT. Asserted: which setting key is read, that the
 * resolved value is fed through the transform, and the byte-exact suffix that is appended. Not
 * asserted: the value the production settings engine resolves for that key, and what the real
 * path-to-URL transform does with it. Neither belongs to this entity, and inventing either would be
 * asserting a fact this file cannot verify. Nothing here touches the filesystem, resolves a path or
 * expands a web root.
 * ============================================================================================== */

describe('Option — the image directory member', () => {
  it('NET-NEW — model/entity/Option.cfc:L81-L83 — getImageDirectory reads globalAssetsImageFolderPath, feeds it through the path transform, and appends the byte-exact /option/ suffix', () => {
    const collaborator = createImageDirectoryCollaborator();
    const option = new Option();

    const directory = option.getImageDirectory(collaborator.resolver);

    // The composition, end to end: transform result then suffix, concatenated in that order.
    expect(directory).toBe(`${SYNTHETIC_IMAGE_FOLDER_URL}${OPTION_IMAGE_DIRECTORY_SUFFIX}`);
    expect(typeof directory).toBe('string');

    // BYTE-EXACT SUFFIX. Lower-case `option`, a leading slash and — decisively — a TRAILING slash,
    // which is what makes the returned value a directory rather than a file path. None of the three
    // is normalised away.
    expect(OPTION_IMAGE_DIRECTORY_SUFFIX).toBe('/option/');
    expect(directory.endsWith('/option/')).toBe(true);
    expect(directory.slice(-OPTION_IMAGE_DIRECTORY_SUFFIX.length)).toBe('/option/');
    expect(directory).not.toContain('/Option/');

    // EXACTLY ONE setting read, for exactly the key `:L82` names, with no resolution context — the
    // legacy call passed the bare setting name. The double raises rather than guessing for any
    // unseeded key, so a mis-typed key would have failed here instead of silently resolving.
    expect(collaborator.settingCalls).toHaveLength(1);
    expect(collaborator.settingCalls.map((call) => call.settingName)).toEqual([
      'globalAssetsImageFolderPath',
    ]);
    expect(collaborator.settingCalls[0]?.context).toBeUndefined();

    // The RESOLVED value is what reaches the transform — the entity does not pass the key, and it
    // does not transform the value itself.
    expect(collaborator.transformedPaths).toEqual([SYNTHETIC_IMAGE_FOLDER_PATH]);
  });

  it('NET-NEW — model/entity/Option.cfc:L81-L83 — the method is a pure synchronous composition: it holds no state, caches nothing, and re-reads the setting on every call', () => {
    const collaborator = createImageDirectoryCollaborator();
    const option = new Option();

    const first = option.getImageDirectory(collaborator.resolver);
    const second = option.getImageDirectory(collaborator.resolver);

    // Same input, same output, and no promise anywhere: the resolver contract is synchronous
    // precisely so a caller can compose the value inline the way `:L82` did.
    expect(second).toBe(first);

    // TWO reads, not one. The legacy entity memoised nothing here, and the port holds no cache
    // either — which matters because a warm container persists module scope across invocations and a
    // cached setting value would then be shared across tenants.
    expect(collaborator.settingCalls).toHaveLength(2);
    expect(collaborator.transformedPaths).toEqual([
      SYNTHETIC_IMAGE_FOLDER_PATH,
      SYNTHETIC_IMAGE_FOLDER_PATH,
    ]);

    // The call leaves the entity itself untouched: no field is written and no collection is grown, so
    // the member is a read of collaborators rather than a mutation of state.
    expect(option.optionID).toBe(OPTION_UNSAVED_ID_VALUE);
    expect(option.skus).toEqual([]);
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
  });

  it('NET-NEW — model/entity/Option.cfc:L81-L83 — the suffix is appended verbatim, so whatever shape the transform returns is preserved ahead of it', () => {
    // A transform result with a trailing slash of its own is a legitimate input the entity makes no
    // attempt to tidy: `:L82` concatenates, it does not join. The doubled transform returns exactly
    // what it is told to, so this case pins the concatenation semantics rather than any path logic.
    const settings = createSettingResolverDouble({
      settings: [
        { settingName: 'globalAssetsImageFolderPath', value: SYNTHETIC_IMAGE_FOLDER_PATH },
      ],
    });
    const trailingSlashUrl = `${SYNTHETIC_IMAGE_FOLDER_URL}/`;
    const resolver: OptionImageDirectoryResolver = {
      setting: (settingName: 'globalAssetsImageFolderPath'): string =>
        settings.resolver.setting(settingName),
      getURLFromPath: (): string => trailingSlashUrl,
    };
    const option = new Option();

    const directory = option.getImageDirectory(resolver);

    // TODO(parity) — the doubled slash is carried, not collapsed. Normalising it would be a repair of
    // legacy behaviour rather than a port of it, and the legacy concatenation had no such step.
    expect(directory).toBe(`${trailingSlashUrl}${OPTION_IMAGE_DIRECTORY_SUFFIX}`);
    expect(directory).toContain('//option/');
    expect(directory.endsWith('/option/')).toBe(true);
  });
});

/* ================================================================================================
 * THE ENTITY-BASE ASSERTION PATTERN, RE-EXPRESSED AGAINST THE TARGET LAYERS
 *
 * `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` declares four assertions that every legacy
 * entity test inherited. Option had no test component, so it INHERITED NOTHING and none of the four
 * ever ran against it — which is why the cases below are net-new rather than traceable. They are
 * still worth carrying, because the four are the entity-shaped questions worth asking, and following
 * the useful parts of that pattern is the closest thing to a legacy signal this entity has.
 *
 * WHERE EACH ASSERTION NOW LIVES, MEMBER BY MEMBER:
 *   `:L51-L54`  validate-as-save-fails      MOVED OUT OF THE ENTITY. `validate`/`hasErrors` were
 *                                           framework members, and the framework is retired for this
 *                                           slice rather than ported, so the check is re-expressed
 *                                           against `src/validation/Validator.ts` driving
 *                                           `option.rules.ts`.
 *   `:L56-L58`  simple representation       STRUCTURAL. The framework resolved the property by a
 *                                           naming convention — the class name with `name` appended —
 *                                           and threw when nothing matched. The port declares no such
 *                                           member on this entity, so the case asserts the convention
 *                                           RESOLVES using the entity's own real members rather than
 *                                           re-implementing the resolver.
 *   `:L60-L62`  primary-ID property name    PRESENT. It is one of the managed-entity members the port
 *                                           declares explicitly under AAP IR-1, because the validator
 *                                           and the uniqueness port require it by name.
 *   `:L64-L67`  defaults are correct        PRESENT, split across the construction cases above and
 *                                           re-asserted here in the base's own terms.
 * ============================================================================================== */

describe('Option — the entity-base assertion pattern', () => {
  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — validating a new instance for save does not pass, and reports a keyed error bag from the real rule set', async () => {
    const harness = createValidatorHarness();
    const option = new Option();

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);

    // The base assertion was `assert(entity.hasErrors())` after `validate(context="save")`. The
    // predicate now lives on the returned error bag rather than on the entity, which is the layer
    // move recorded above and not a change in what is being claimed.
    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasErrors()).toBe(true);

    // Three of the four declared rule properties fail on a fresh instance; the fourth names the
    // `delete` context and is correctly not evaluated here.
    expect(Object.keys(errors.getErrors()).sort()).toEqual([
      'optionCode',
      'optionGroup',
      'optionName',
    ]);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 — a simple representation exists, is a simple value, and resolves by the <classname>name convention to optionName', () => {
    const option = new Option();

    // The convention the framework resolver applied: the class name with `name` appended, compared
    // case-insensitively against the declared property names. Deriving it from the entity's OWN
    // `getClassName()` is what makes this a check of the code under test rather than of a literal
    // this file wrote down.
    expect(option.getClassName()).toBe(OPTION_CLASS_NAME);
    const conventionalName = `${option.getClassName()}name`.toLowerCase();
    const resolved = OPTION_DECLARED_PROPERTY_NAMES.filter(
      (propertyName) => propertyName.toLowerCase() === conventionalName,
    );

    // Exactly one property matches, so the resolver would have succeeded rather than thrown — the
    // reason this entity satisfies the legacy assertion structurally even though the port declares no
    // simple-representation member on it.
    expect(resolved).toEqual(['optionName']);
    expect(option.hasProperty('optionName')).toBe(true);

    // And the value read through that property is a SIMPLE value in both states. An unset property
    // reads as the empty string rather than as undefined, which is what the legacy simple-value
    // assertion required of it.
    const emptyRepresentation = option.getValueByPropertyIdentifier('optionName');
    expect(typeof emptyRepresentation).toBe('string');
    expect(emptyRepresentation).toBe('');

    option.optionName = 'Red';
    const populatedRepresentation = option.getValueByPropertyIdentifier('optionName');
    expect(typeof populatedRepresentation).toBe('string');
    expect(populatedRepresentation).toBe('Red');
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a non-empty primary-ID property name exists, it identifies optionID, and its metadata resolves', () => {
    const option = new Option();

    // `assert(len(entity.getPrimaryIDPropertyName()))` — non-empty is the whole of the base
    // assertion.
    expect(option.getPrimaryIDPropertyName().length).toBeGreaterThan(0);

    // And it identifies the one property `model/entity/Option.cfc:L52` declares `fieldtype="id"`.
    expect(option.getPrimaryIDPropertyName()).toBe(OPTION_PRIMARY_ID_PROPERTY_NAME);
    expect(OPTION_PRIMARY_ID_PROPERTY_NAME).toBe('optionID');
    expect(OPTION_DECLARED_PROPERTY_NAMES).toContain(OPTION_PRIMARY_ID_PROPERTY_NAME);
    expect(OPTION_DECLARED_PROPERTY_LOCATORS[OPTION_PRIMARY_ID_PROPERTY_NAME]).toBe(
      'model/entity/Option.cfc:L52',
    );

    // The metadata lookup the uniqueness port performs resolves for it, returning the property's own
    // name — the value the port then uses to read the candidate value off the entity.
    expect(option.getPropertyMetaData(OPTION_PRIMARY_ID_PROPERTY_NAME).name).toBe('optionID');
    expect(option.getPropertyMetaData('optionCode').name).toBe('optionCode');

    // The mapped ORM entity name is the LOGICAL name from the `entityname` attribute at `:L49`, not
    // the physical `SwOption` table — the distinction the uniqueness statement is expressed over.
    expect(option.getEntityName()).toBe(OPTION_ENTITY_NAME);
    expect(OPTION_ENTITY_NAME).toBe('SlatwallOption');
    expect(OPTION_CLASS_NAME).toBe('Option');
    expect(OPTION_ENTITY_NAME).not.toBe(OPTION_CLASS_NAME);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67 — defaults are correct: a fresh instance is new and its primary-ID value is empty', () => {
    const option = new Option();

    // The base's two assertions, verbatim in intent: `assert(entity.isNew())` and
    // `assert(!len(entity.getPrimaryIDValue()))`.
    expect(option.isNew()).toBe(true);
    expect(option.getPrimaryIDValue()).toHaveLength(0);

    // The only other declared default on this entity is the empty inverse collection. Every remaining
    // property starts without a value, because `model/entity/Option.cfc:L52-L56` declares `default=`
    // on the identifier alone — so no further default is asserted, and none is invented.
    expect(option.skus).toEqual([]);
    expect(option.optionCode).toBeUndefined();
    expect(option.optionName).toBeUndefined();
    expect(option.optionDescription).toBeUndefined();
    expect(option.sortOrder).toBeUndefined();
    expect(option.optionGroup).toBeUndefined();
  });
});

/* ================================================================================================
 * THE DECLARATIVE RULE SET — `model/validation/Option.json`, consumed as `option.rules.ts`
 *
 * Four properties carry rules and no more: `optionCode` required + unique + format at `:L3`,
 * `optionName` required at `:L4`, `optionGroup` required at `:L5`, and a `skus` delete guard at `:L6`.
 * The rule set is CONSUMED as written — the shared code format pattern is neither retyped nor
 * redefined here, no rule is added for `sortOrder` because the document declares none, and the
 * constraint evaluator is the real one.
 * ============================================================================================== */

describe('Option — the declarative validation rules', () => {
  it('NET-NEW — model/validation/Option.json — the rule set declares exactly four properties, in document order, and adds none', () => {
    const declared = optionValidationRuleSet.properties.map(
      (property) => property.propertyIdentifier,
    );

    // Document order preserved: `:L3`, `:L4`, `:L5`, `:L6`.
    expect(declared).toEqual(['optionCode', 'optionName', 'optionGroup', 'skus']);
    expect(declared).toHaveLength(4);

    // Every rule property is a real declared property of the entity, so none of them is inert. The
    // legacy engine silently skipped a rule whose property the subject did not carry, and a rule set
    // naming a phantom would therefore have been a silent no-op rather than an error.
    const option = new Option();
    for (const propertyIdentifier of declared) {
      expect(option.hasProperty(propertyIdentifier)).toBe(true);
    }

    // The uniqueness target for this entity resolves to the entity itself, so the existence query is
    // run against the Option being saved rather than against a related object.
    expect(resolveOptionUniqueTarget(option)).toBe(option);
  });

  it('NET-NEW — model/validation/Option.json:L3 — optionCode is required, format-checked and uniqueness-checked, and a well-formed unused code passes all three', async () => {
    const harness = createValidatorHarness();
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({
      optionCode: 'colour-red_01.a|b:c~d^e',
      optionName: 'Red',
      optionGroup,
    });

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);

    // The code above deliberately exercises every character class the shared format pattern admits.
    // The pattern itself is imported by the rule set from the module that owns it and is NOT retyped
    // here — a second copy would drift from the one the code under test uses.
    expect(errors.hasError('optionCode')).toBe(false);
    expect(errors.hasErrors()).toBe(false);

    // The uniqueness check was really delegated, once, naming the trailing property segment and
    // carrying the entity's mapped name — evidence that the application-side existence check runs
    // during validation rather than being left to a column constraint.
    expect(harness.uniqueProperty.calls).toHaveLength(1);
    expect(harness.uniqueProperty.calls[0]?.propertyName).toBe('optionCode');
    expect(harness.uniqueProperty.calls[0]?.entityName).toBe('SlatwallOption');
    expect(harness.uniqueProperty.calls[0]?.value).toBe('colour-red_01.a|b:c~d^e');
  });

  it('NET-NEW — model/validation/Option.json:L3 — a code containing a character the shared format pattern excludes fails the format constraint alone', async () => {
    const harness = createValidatorHarness();
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'colour red', optionName: 'Red', optionGroup });

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);

    // A space is outside the admitted classes, so the format constraint fails while presence and
    // uniqueness both pass — the three constraints of `:L3` are evaluated independently rather than
    // short-circuiting one another.
    expect(errors.getError('optionCode')).toEqual(['validate.save.Option.optionCode.regex']);
    expect(errors.hasError('optionName')).toBe(false);
    expect(errors.hasError('optionGroup')).toBe(false);
  });

  it('NET-NEW — model/validation/Option.json:L3 — a code already held by another Option fails uniqueness, and the same code held by the same Option does not', async () => {
    const takenCode = 'colour-red';
    const harness = createValidatorHarness([
      {
        entityName: 'SlatwallOption',
        propertyName: 'optionCode',
        value: takenCode,
        entityID: SAVED_OPTION_IDS.uniqueIncumbent,
      },
    ]);
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });

    const collidingOption = buildOption({
      optionID: SAVED_OPTION_IDS.uniqueCandidate,
      optionCode: takenCode,
      optionName: 'Red',
      optionGroup,
    });
    const collidingErrors = await harness.validateDryRun(
      collidingOption,
      optionValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(collidingErrors.getError('optionCode')).toEqual([
      'validate.save.Option.optionCode.unique',
    ]);

    // The incumbent itself re-validates cleanly, because the existence check excludes the entity
    // being saved — the self-exclusion clause of the ported uniqueness statement.
    const incumbentOption = buildOption({
      optionID: SAVED_OPTION_IDS.uniqueIncumbent,
      optionCode: takenCode,
      optionName: 'Red',
      optionGroup,
    });
    const incumbentErrors = await harness.validateDryRun(
      incumbentOption,
      optionValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(incumbentErrors.hasError('optionCode')).toBe(false);
    expect(incumbentErrors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/Option.json:L4 — optionName is required for save, and only presence is checked', async () => {
    const harness = createValidatorHarness();
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'red', optionGroup });

    const absent = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);
    expect(absent.getError('optionName')).toEqual(['validate.save.Option.optionName.required']);

    // Whitespace alone does not satisfy presence — the legacy presence test trimmed before measuring
    // length, and the port keeps that.
    option.optionName = '   ';
    const blank = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);
    expect(blank.getError('optionName')).toEqual(['validate.save.Option.optionName.required']);

    // No format and no length rule is declared for this property, so any non-blank value passes and
    // none is invented here.
    option.optionName = 'Red / Crimson (2026)';
    const present = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);
    expect(present.hasError('optionName')).toBe(false);
    expect(present.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/Option.json:L6 — the delete guard rejects an Option whose SKUs collection is not empty, and only in the delete context', async () => {
    const harness = createValidatorHarness();
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'red', optionName: 'Red', optionGroup });

    // An unused Option deletes cleanly: the guard is a maximum-collection rule, so an empty
    // collection satisfies it.
    const unusedErrors = await harness.validateDryRun(
      option,
      optionValidationRuleSet,
      DELETE_CONTEXT,
    );
    expect(unusedErrors.hasErrors()).toBe(false);
    expect(unusedErrors.getErrors()).toEqual({});

    // Seed the INVERSE collection the way the persistence layer hydrates it. It is seeded directly
    // and deliberately: `addSku` delegates to the owning side and correctly leaves this array alone,
    // so the state the delete guard reads can only arrive from hydration.
    const sku = buildSku({ skuCode: 'SKU-RED' });
    option.skus.push(sku);

    const usedErrors = await harness.validateDryRun(
      option,
      optionValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(usedErrors.getError('skus')).toEqual(['validate.delete.Option.skus.maxCollection']);
    expect(Object.keys(usedErrors.getErrors())).toEqual(['skus']);

    // The guard is scoped to `delete`. In the `save` context the same populated collection raises
    // nothing, which is why an Option can be saved with SKUs attached but not deleted.
    const saveErrors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);
    expect(saveErrors.hasError('skus')).toBe(false);
    expect(saveErrors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/Option.json:L3-L5 — the save rules do not fire in the delete context, so a blank Option is deletable', async () => {
    const harness = createValidatorHarness();
    const option = new Option();

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, DELETE_CONTEXT);

    // Every context gate is honoured in both directions: the three `save` rules of `:L3-L5` are
    // skipped here even though all three would fail, and the uniqueness port is never consulted.
    expect(errors.hasErrors()).toBe(false);
    expect(errors.hasError('optionCode')).toBe(false);
    expect(errors.hasError('optionName')).toBe(false);
    expect(errors.hasError('optionGroup')).toBe(false);
    expect(harness.uniqueProperty.calls).toEqual([]);
  });
});

/* ================================================================================================
 * SCOPE AND COMPLETENESS
 *
 * The two cases below are the checkable form of the scope statement in the file header. The first
 * pins the converted method surface, so a member appearing or disappearing fails here rather than
 * going unnoticed. The second pins the exclusions, so the image and promotion relationships stay out
 * of the port's field-backed name space.
 *
 * WHY NO BOUNDARY STUB IS TESTED: there is nothing to stub. `model/entity/Option.cfc:L85-L87`, the
 * entity's non-persistent-property section, is empty, so this entity declares no calculated member
 * reaching a price, promotion, inventory or currency service — and consequently the port has no
 * un-portable member to represent. No placeholder property is fabricated in order to have a boundary
 * to assert against.
 * ============================================================================================== */

describe('Option — scope and completeness', () => {
  it('NET-NEW — model/entity/Option.cfc:L81-L115 — the converted method surface is exactly the declared members, and every one of them has explicit coverage above', () => {
    const declaredMembers = Object.getOwnPropertyNames(Option.prototype);

    // The five members `model/entity/Option.cfc` declares with a real body, plus the derived
    // new-flag predicate the entity's own `:L94` calls. Each has at least one case above.
    expect(declaredMembers).toContain('getImageDirectory');
    expect(declaredMembers).toContain('setOptionGroup');
    expect(declaredMembers).toContain('removeOptionGroup');
    expect(declaredMembers).toContain('addSku');
    expect(declaredMembers).toContain('removeSku');
    expect(declaredMembers).toContain('isNew');

    // The managed-entity members the port declares explicitly under AAP IR-1, because the validator
    // and the uniqueness port require them by name. All six are exercised above.
    expect(declaredMembers).toContain('getClassName');
    expect(declaredMembers).toContain('getEntityName');
    expect(declaredMembers).toContain('getPrimaryIDPropertyName');
    expect(declaredMembers).toContain('getPrimaryIDValue');
    expect(declaredMembers).toContain('hasProperty');
    expect(declaredMembers).toContain('getPropertyMetaData');
    expect(declaredMembers).toContain('getValueByPropertyIdentifier');

    // NOTHING ELSE. The surface is closed at those thirteen plus the constructor, which is what makes
    // the exclusion register a fact about the class rather than a claim in a comment. In particular
    // none of the eight promotion helpers of `:L118-L147` was carried across, and no framework
    // member the slice does not use was invented.
    expect(declaredMembers).toHaveLength(14);
    expect(declaredMembers).toContain('constructor');
    expect(declaredMembers).not.toContain('addPromotionReward');
    expect(declaredMembers).not.toContain('removePromotionRewardExclusion');
    expect(declaredMembers).not.toContain('addPromotionQualifier');
    expect(declaredMembers).not.toContain('removePromotionQualifierExclusion');
  });

  it('NET-NEW — model/entity/Option.cfc:L60-L70 — the image and promotion relationships are recorded as declared but are absent from the field-backed name space', () => {
    const option = new Option();
    const excludedNames = Object.keys(OPTION_EXCLUDED_RELATIONSHIP_LOCATORS);

    expect(excludedNames).toHaveLength(6);

    for (const excludedName of excludedNames) {
      // Not a field of the port, so nothing about the excluded family can be read off an Option and
      // no out-of-scope type had to be imported to model it.
      expect(OPTION_DECLARED_PROPERTY_NAMES).not.toContain(excludedName);
      expect(Object.hasOwn(option, excludedName)).toBe(false);
      expect(option.hasProperty(excludedName)).toBe(false);

      // Recorded, though — the port keeps the legacy declaration on the books so the exclusion is a
      // documented decision rather than a hole, and each name is pinned to its declaring line.
      expect(OPTION_ENTITY_METADATA.declaredNonFieldProperties?.[excludedName]).toBe(true);
      expect(OPTION_EXCLUDED_RELATIONSHIP_LOCATORS[excludedName]).toMatch(
        /^model\/entity\/Option\.cfc:L\d+$/,
      );
    }

    // The two sets are disjoint and together account for every relationship the legacy entity
    // declares, so a name cannot be both modelled and excluded.
    for (const declaredName of OPTION_DECLARED_PROPERTY_NAMES) {
      expect(excludedNames).not.toContain(declaredName);
    }

    // The metadata declaration agrees with the class on the identity constants, so the two cannot
    // drift into disagreement about which entity they describe.
    expect(OPTION_ENTITY_METADATA.className).toBe(option.getClassName());
    expect(OPTION_ENTITY_METADATA.entityName).toBe(option.getEntityName());
    expect(OPTION_ENTITY_METADATA.primaryIDPropertyName).toBe(option.getPrimaryIDPropertyName());
  });
});
