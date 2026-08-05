/**
 * Option domain tests — NET-NEW.
 *
 * Why the label is net-new and not TRACEABLE
 * There is no dedicated legacy test for this entity. `meta/tests/unit/entity/` ships components for
 * a small subset of the entity catalogue and Option is not among them: no `OptionTest.cfc` exists
 * anywhere in the repository, so no legacy assertion, no legacy fixture and no legacy expectation
 * about Option was ever written down. Every case below is therefore net-new coverage, and the file
 * carries exactly one label — this one — rather than mixing a traceable claim into a suite that has
 *
 * Traceability is documentary, grounded in two legacy documents
 * Because there is no legacy test to port, every expectation below is derived by reading legacy
 * source and is cited to the line that states it. The two documents that between them define the
 * whole of this entity's behaviour are:
 *
 * - `model/entity/Option.cfc` — the component declaration at `:L49`, the five persistent
 * properties at `:L52-L56`, the option-group relationship at `:L59`, the SKUs
 * many-to-many-inverse at `:L66`, the image directory member at `:L81-L83`, and the four
 * bidirectional helpers at `:l92-l97`, `:l98-l107`, `:l110-l112` and `:L113-L115`.
 * - `model/validation/Option.json` — the declarative rule document: `optionCode` at `:L3`,
 * `optionName` at `:L4`, `optionGroup` at `:L5` and the `skus` delete guard at `:L6`.
 */

import { manageEntity, populate, populateWithSubProperties } from '../../src/domain/base/populate';
import type { RelatedEntityLoader, SubPropertyPopulator } from '../../src/domain/base/populate';
import {
  OPTION_CLASS_NAME,
  OPTION_DECLARED_PROPERTIES,
  OPTION_ENTITY_METADATA,
  OPTION_ENTITY_NAME,
  OPTION_PRIMARY_ID_PROPERTY_NAME,
  OPTION_PROPERTY_DESCRIPTORS,
  Option,
  createOptionPropertyDescriptors,
  type OptionImageDirectoryResolver,
  type OptionPropertyName,
  type SkuOptionOwner,
} from '../../src/domain/option/Option';
import { OPTION_GROUP_ENTITY_METADATA, OptionGroup } from '../../src/domain/option/OptionGroup';
import { Sku } from '../../src/domain/sku/Sku';
import { ValidationError } from '../../src/errors/ValidationError';
import type { PopulationAuthorizationPort } from '../../src/ports/AccountContextPort';
import { Validator, type ValidationContext } from '../../src/validation/Validator';
import {
  optionValidationRuleSet,
  resolveOptionUniqueTarget,
} from '../../src/validation/rules/option.rules';
import {
  buildOption,
  buildOptionGroup,
  buildSku,
  createPopulationAuthorizationDouble,
  createSettingResolverDouble,
  createValidatorHarness,
  type SettingResolverCall,
} from '../support/inMemoryRepositories';

/* Source-grounded constants. */

/**
 * The unsaved primary-identifier value, verbatim from `model/entity/Option.cfc:L52`, which declares
 * both `unsavedvalue=""` and `default=""`.
 */
const OPTION_UNSAVED_ID_VALUE = '';

/**
 * Identifiers assigned to Options that must read as saved, so the `!hasOption(this)` arm of the
 * `:L94` guard is the one that decides.
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

/** Opaque identifiers reserved for the population-contract cases at the end of this suite. */
const POPULATION_IDS = Object.freeze({
  optionGroup: '11111111111111111111111111111111',
  missingOptionGroup: '22222222222222222222222222222222',
  keepSku: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  removeFirstSku: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  removeSecondSku: 'cccccccccccccccccccccccccccccccc',
  addSku: 'dddddddddddddddddddddddddddddddd',
  unloadableSku: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  caseSensitiveSku: 'abcdefabcdefabcdefabcdefabcdefab',
} as const);

/** The five persistent properties of `model/entity/Option.cfc:L52-L56`, in declaration order. */
const OPTION_PERSISTENT_PROPERTY_NAMES = [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
] as const satisfies readonly OptionPropertyName[];

/** Every property the port models as a field, mapped to the legacy line that declares it. */
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
 * The field-backed declared property names, derived from the production set rather than from the
 * locator map above.
 */
const OPTION_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(OPTION_DECLARED_PROPERTIES);

/**
 * The six relationships `model/entity/Option.cfc` declares that the port deliberately does not model
 * as fields, each pinned to its declaring line.
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

/** The literal suffix `model/entity/Option.cfc:L82` appends after the resolved image folder URL. */
const OPTION_IMAGE_DIRECTORY_SUFFIX = '/option/';

/**
 * A synthetic file-system path standing in for the value the out-of-scope settings engine would
 * resolve for `globalAssetsImageFolderPath`.
 */
const SYNTHETIC_IMAGE_FOLDER_PATH = '/opt/slatwall-test-fixture/assets/images';

/**
 * The web path the path-to-URL transform double returns for {@link SYNTHETIC_IMAGE_FOLDER_PATH}.
 */
const SYNTHETIC_IMAGE_FOLDER_URL = '/slatwall-test-fixture/assets/images';

/* Local helpers. */

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
 * @param descriptor - The descriptor to inspect.
 * @returns The declared value type, or `undefined`.
 */
function descriptorValueType(descriptor: OptionPropertyDescriptorEntry): string | undefined {
  return 'valueType' in descriptor ? descriptor.valueType : undefined;
}

/**
 * Builds a real `Option` that reads as saved, by assigning it a primary identifier.
 *
 * @param optionID - One of {@link SAVED_OPTION_IDS}.
 * @returns a real `Option` for which `isNew()` returns false.
 */
function createSavedOption(optionID: string): Option {
  const option = new Option();
  option.optionID = optionID;
  return option;
}

/**
 * A minimal owning-side collaborator that records the delegated call and deliberately declines to
 * maintain the relationship.
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
  readonly resolver: OptionImageDirectoryResolver;

  /**
   * The settings double's own live call log, exposed by reference rather than copied, so a case that
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
 * @returns a fresh collaborator plus its two call recorders.
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

/* The persistent property surface — `model/entity/Option.cfc:L52-L56` */

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

    // `fieldtype="id"` is the reason this property, alone among the five, carries no populate
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

    // Absent, not seeded. `:L56` declares `ormtype="integer"` with no `default=` and no
    // `required="true"` — contrast `model/entity/OptionGroup.cfc:L58`, whose sortOrder is declared
    // required. Nothing in application code assigns this field; the legacy pre-insert hook did, and
    // in the port that responsibility sits with the persistence layer. So the honest fresh-instance
    // state is "no value", and no starting number is invented for it here.
    expect(option.sortOrder).toBeUndefined();

    // `sortContext="optionGroup"` is the part that must not be mistaken for a table-wide seed: the
    // first value is the maximum within the owning option group plus one, which is why the seed
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

    // `model/validation/Option.json` declares no rule for this property, and none is added: the rule
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

    // The locator map and the production declared set agree in both directions, so neither can
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

/* Construction and unsaved identity — the derived `isNew()` predicate. */

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

/*
 * The required option-group relationship — `model/entity/Option.cfc:L59` and
 * `model/validation/Option.json:L5`
 */

describe('Option — the required option-group relationship', () => {
  it('NET-NEW — model/entity/Option.cfc:L59 — a fresh Option is constructible with the option-group field entirely absent, not merely undefined', () => {
    const option = new Option();

    // Absent, not present-holding-undefined. The many-to-one is the one field the port declares
    // without emitting it, which is what lets an unresolved association be distinguished from one
    // resolved to nothing. The row mapper hydrates scalar columns only and leaves every many-to-one
    // unresolved, so absence is the state it guarantees and the state the entity must start in.
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
    expect('optionGroup' in option).toBe(false);
    expect(option.optionGroup).toBeUndefined();

    // Absent as a value, still present as a declaration — the distinction the legacy metadata
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

    // The real validator over the real rule set. No fake rule engine, no hand-rolled predicate and
    // no reimplementation of the constraint evaluator appears in this file.
    expect(harness.validator).toBeInstanceOf(Validator);

    const errors = await harness.validateDryRun(option, optionValidationRuleSet, SAVE_CONTEXT);

    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasErrors()).toBe(true);

    // Keyed by the full property identifier, `optionGroup`, not by a trailing segment and not by a
    // rewritten label. The legacy engine reported against the identifier the rule was declared
    // under, and the port keeps that.
    expect(errors.hasError('optionGroup')).toBe(true);
    expect(Object.keys(errors.getErrors())).toContain('optionGroup');

    // Stored as an array, because a property can accumulate more than one failure — which is exactly
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

/* `setOptionGroup()` — `model/entity/Option.cfc:L92-L97` */

describe('Option — setOptionGroup parity', () => {
  it('NET-NEW — model/entity/Option.cfc:L92-L97 — setOptionGroup assigns the group and appends the option into the group live options array', () => {
    const optionGroup = new OptionGroup();
    const option = new Option();

    expect(optionGroup.getOptions()).toEqual([]);

    option.setOptionGroup(optionGroup);

    // The assignment at `:L93` happens first and unconditionally.
    expect(option.optionGroup).toBe(optionGroup);
    expect(Object.hasOwn(option, 'optionGroup')).toBe(true);

    // The append at `:L95` targets the group's live collection, not a copy of it — the legacy
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

    // TODO(parity) — model/entity/Option.cfc:L92-L97. `isNew()` is the left operand of an `or`,
    // so for an unsaved option it short-circuits and the containment test is never reached. The
    // append therefore happens a second time and the group holds the identical instance twice. This
    // is carried across exactly as written: no containment guard is added, no de-duplication is
    // performed and the entry is not collapsed. Repairing it would change observable behaviour, and
    // it would change it in a place that matters — the parent collection is declared.
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

    // TODO(parity) — the first group's collection is not cleaned up. `:L92-L97` performs no removal
    // from a previously assigned group; only `removeOptionGroup` at `:L98-L107` does that, and
    // nothing calls it here. The stale membership is preserved rather than tidied, because tidying
    // it would add behaviour the legacy entity does not have.
    expect(firstGroup.getOptions()).toEqual([option]);
    expect(firstGroup.hasOption(option)).toBe(true);
  });
});

/* `removeOptionGroup()` — `model/entity/Option.cfc:L98-L107` */

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

    // `index !== -1` plus `splice`, so position zero is removed like any other.
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

    // The explicit-argument path of `:L99-L101`: the caller names a group the option is not in, so
    // the lookup finds nothing and the splice at `:L103-L105` is skipped entirely.
    option.removeOptionGroup(unrelatedGroup);

    expect(unrelatedGroup.getOptions()).toEqual([]);

    // `:L106` sits outside the found-branch, so the back-reference is deleted regardless. That is
    // faithfully carried: the option ends up with no group even though nothing was spliced, and the
    // group it really belonged to still lists it.
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
    expect('optionGroup' in option).toBe(false);
    expect(option.optionGroup).toBeUndefined();

    // TODO(parity) — the assigned group keeps the now-orphaned membership. `:L98-L107` removes from
    // the group it was asked about, never from the one the option was actually assigned to, and no
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

  it('NET-NEW — model/entity/Option.cfc:L100 — a SECOND removal FAILS, because the fallback resolves to nothing and the legacy dereferences it', () => {
    /*
     * This case asserted the opposite, and asserting it is what kept the defect alive.
     * It previously read "a second removal is a no-op rather than a failure" and closed with
     * `.not.toThrow()`, on the stated grounds that "no error escapes — which is the behaviour a
     * repeated cleanup path depends on". No legacy caller depends on any such thing: the sole legacy
     * call site `model/entity/OptionGroup.cfc:L96` always passes the group explicitly, and there is no
     * repeated-cleanup path in the source at all. The sentence described a convenience the port had.
     */
    const optionGroup = buildOptionGroup({ optionGroupCode: 'colour' });
    const option = buildOption({ optionCode: 'white', optionName: 'White', optionGroup });

    // The first removal succeeds: the fallback still resolves, so this is the ordinary path.
    option.removeOptionGroup();
    expect(option.optionGroup).toBeUndefined();
    expect(optionGroup.getOptions()).toEqual([]);

    // The second has nothing to fall back to, so it fails — as the legacy does.
    expect(() => {
      option.removeOptionGroup();
    }).toThrow(TypeError);
    // The diagnostic names the legacy locator, so the parity story travels with the failure.
    expect(() => {
      option.removeOptionGroup();
    }).toThrow(/model\/entity\/Option\.cfc:L100/);

    // Nothing moved. The legacy raises before its clear, so a failed call performs no write; there is
    // no half-applied state to distinguish from the state the first removal left behind.
    expect(option.optionGroup).toBeUndefined();
    expect(Object.hasOwn(option, 'optionGroup')).toBe(false);
    expect(optionGroup.getOptions()).toEqual([]);
  });

  it('NET-NEW — model/entity/Option.cfc:L100 — a NEVER-assigned option cannot be detached without an explicit group, and the group-side delegating helper reaches the same body', () => {
    const orphan = new Option();

    /*
     * The second half of the same behaviour. A never-assigned option cannot be removed: with
     * neither an argument nor a fallback, `model/entity/Option.cfc:L100` reads an undefined
     * variable and raises. The group-side half of this case passes either way, which is the useful
     * signal — it confirms the raise is confined to the argument-less path and that the real,
     * exercised delegation is untouched.
     */
    expect(Object.hasOwn(orphan, 'optionGroup')).toBe(false);
    expect(() => {
      orphan.removeOptionGroup();
    }).toThrow(TypeError);
    // Still absent, because the legacy raises before its clear — the failure writes nothing.
    expect(orphan.optionGroup).toBeUndefined();
    expect(Object.hasOwn(orphan, 'optionGroup')).toBe(false);

    // And the shipped delegating path is unaffected, which is the point of keeping this half.
    // `model/entity/OptionGroup.cfc:L95-L97` is nothing but `option.removeOptionGroup(this)` — it
    // always supplies an argument, so it never reaches the fallback and never raises. That is what
    // makes the correction above safe for every caller in the slice: the raise is confined to the
    // no-argument form, and no in-scope caller uses it.
    const optionGroup = new OptionGroup();
    const member = new Option();
    optionGroup.addOption(member);
    expect(optionGroup.getOptions()).toEqual([member]);

    expect(() => optionGroup.removeOption(member)).not.toThrow();

    expect(optionGroup.getOptions()).toEqual([]);
    expect(member.optionGroup).toBeUndefined();
    expect(Object.hasOwn(member, 'optionGroup')).toBe(false);

    // And it stays safe even for a non-member, because the argument is still supplied: the lookup
    // simply finds nothing and `:L106` unsets regardless.
    expect(() => optionGroup.removeOption(new Option())).not.toThrow();
  });
});

/*
 * The SKUS relationship, inverse over `SwSkuOption` — `model/entity/Option.cfc:L66` and `:L109-L115`
 */

describe('Option — the SKUs inverse relationship over SwSkuOption', () => {
  it('NET-NEW — model/entity/Option.cfc:L66 — the SKUs collection is the inverse side, exposed as a live array with no collection accessor of its own', () => {
    const option = new Option();

    // Present and initialised, because a many-to-many collection is hydrated as an array rather than
    // left unresolved the way the many-to-one is.
    expect(Object.hasOwn(option, 'skus')).toBe(true);
    expect(option.skus).toEqual([]);
    expect(option.hasProperty('skus')).toBe(true);
    expect(OPTION_DECLARED_PROPERTY_LOCATORS.skus).toBe('model/entity/Option.cfc:L66');

    // The inverse side exposes no collection accessor at all: `model/entity/Option.cfc` declares no
    // `getSkus`/`hasSku` body, unlike `model/entity/OptionGroup.cfc:L73-L79` which declares
    // `getOptions`. The port declares exactly the members the legacy declares, so no accessor is
    // invented here to make the two sides look symmetrical.
    const optionMembers = Object.getOwnPropertyNames(Option.prototype);
    expect(optionMembers).toContain('addSku');
    expect(optionMembers).toContain('removeSku');
    expect(optionMembers).not.toContain('getSkus');
    expect(optionMembers).not.toContain('hasSku');

    // The owning side does declare its collection accessors, which is the asymmetry stated above
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

    expect(owner.added).toEqual([option]);
    expect(owner.removed).toEqual([]);

    // And the option's own collection is untouched. The recorder deliberately declines to maintain
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
    // note that this is the owner's guard and is unrelated to the unsaved short-circuit that makes
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

/* `getImageDirectory()` — `model/entity/Option.cfc:L81-L83` */

describe('Option — the image directory member', () => {
  it('NET-NEW — model/entity/Option.cfc:L81-L83 — getImageDirectory reads globalAssetsImageFolderPath, feeds it through the path transform, and appends the byte-exact /option/ suffix', () => {
    const collaborator = createImageDirectoryCollaborator();
    const option = new Option();

    const directory = option.getImageDirectory(collaborator.resolver);

    // The composition, end to end: transform result then suffix, concatenated in that order.
    expect(directory).toBe(`${SYNTHETIC_IMAGE_FOLDER_URL}${OPTION_IMAGE_DIRECTORY_SUFFIX}`);
    expect(typeof directory).toBe('string');

    // Byte-exact suffix. Lower-case `option`, a leading slash and — decisively — a trailing slash,
    // which is what makes the returned value a directory rather than a file path. None of the three
    // is normalised away.
    expect(OPTION_IMAGE_DIRECTORY_SUFFIX).toBe('/option/');
    expect(directory.endsWith('/option/')).toBe(true);
    expect(directory.slice(-OPTION_IMAGE_DIRECTORY_SUFFIX.length)).toBe('/option/');
    expect(directory).not.toContain('/Option/');

    // Exactly one setting read, for exactly the key `:L82` names, with no resolution context — the
    // legacy call passed the bare setting name. The double raises rather than guessing for any
    // unseeded key, so a mis-typed key would have failed here instead of silently resolving.
    expect(collaborator.settingCalls).toHaveLength(1);
    expect(collaborator.settingCalls.map((call) => call.settingName)).toEqual([
      'globalAssetsImageFolderPath',
    ]);
    expect(collaborator.settingCalls[0]?.context).toBeUndefined();

    // The resolved value is what reaches the transform — the entity does not pass the key, and it
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

    // Two reads, not one. The legacy entity memoised nothing here, and the port holds no cache
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

/* The entity-base assertion pattern, re-expressed against the target layers. */

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
    // case-insensitively against the declared property names. Deriving it from the entity's own
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

    // And the value read through that property is a simple value in both states. An unset property
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

    // The mapped ORM entity name is the logical name from the `entityname` attribute at `:L49`, not
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

/* The declarative rule set — `model/validation/Option.json`, consumed as `option.rules.ts` */

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
    // The pattern itself is imported by the rule set from the module that owns it and is not retyped
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

    // Seed the inverse collection the way the persistence layer hydrates it. It is seeded directly
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

/*
 * NET-NEW — both relationship branches, driven through Option's REAL descriptor factory.
 *
 * The factory is exported because callers must supply the two relationship loaders and recursive
 * populators explicitly; a coverage run found that no production composition root had done so yet.
 * Exercising a hand-built descriptor here would leave that contract unproved, so every case below
 * obtains its descriptors from createOptionPropertyDescriptors and observes the real entity methods
 * the factory delegates to.
 */
describe('Option — NET-NEW — createOptionPropertyDescriptors and relationship population', () => {
  /** A group loader with separate logs for the create-if-missing and existing-only forms. */
  function optionGroupCatalog(groups: readonly OptionGroup[]): {
    readonly loader: RelatedEntityLoader<OptionGroup>;
    readonly loadExistingIds: string[];
    readonly loadOrCreateIds: string[];
  } {
    const known = [...groups];
    const loadExistingIds: string[] = [];
    const loadOrCreateIds: string[] = [];

    return {
      loadExistingIds,
      loadOrCreateIds,
      loader: {
        loadExisting: (relatedId: string): OptionGroup | undefined => {
          loadExistingIds.push(relatedId);
          return known.find((candidate) => candidate.optionGroupID === relatedId);
        },
        loadOrCreate: (relatedId: string): OptionGroup => {
          loadOrCreateIds.push(relatedId);
          const existing = known.find((candidate) => candidate.optionGroupID === relatedId);

          if (existing !== undefined) {
            return existing;
          }

          const created = buildOptionGroup({ optionGroupID: relatedId });
          known.push(created);
          return created;
        },
      },
    };
  }

  /** Records the nested struct handed to the option-group recursive-population seam. */
  function optionGroupSubPopulations(): {
    readonly populate: SubPropertyPopulator<OptionGroup>;
    readonly calls: {
      readonly optionGroupID: string;
      readonly data: Record<string, unknown>;
    }[];
  } {
    const calls: {
      readonly optionGroupID: string;
      readonly data: Record<string, unknown>;
    }[] = [];

    return {
      calls,
      populate: (optionGroup: OptionGroup, data: Record<string, unknown>): void => {
        calls.push({ optionGroupID: optionGroup.optionGroupID, data });
      },
    };
  }

  /**
   * An owning-side SKU double whose add/remove methods maintain Option's live inverse array.
   * That makes branch 5's backwards iteration observable while still exercising Option.addSku and
   * Option.removeSku through the factory.
   */
  class MutatingSkuOptionOwner implements SkuOptionOwner {
    constructor(
      public readonly skuID: string,
      private readonly events: string[],
    ) {}

    addOption(option: Option): void {
      this.events.push(`add:${this.skuID}`);
      if (!option.skus.includes(this)) {
        option.skus.push(this);
      }
    }

    removeOption(option: Option): void {
      this.events.push(`remove:${this.skuID}`);
      const index = option.skus.indexOf(this);
      if (index !== -1) {
        option.skus.splice(index, 1);
      }
    }
  }

  /** A SKU loader/populator/read-id bundle matching the five collaborators the factory requires. */
  function skuCatalog(
    skus: readonly MutatingSkuOptionOwner[],
    events: string[],
  ): {
    readonly loader: RelatedEntityLoader<SkuOptionOwner>;
    readonly populate: SubPropertyPopulator<SkuOptionOwner>;
    readonly readPrimaryId: (sku: SkuOptionOwner) => string;
    readonly loadExistingIds: string[];
    readonly loadOrCreateIds: string[];
    readonly populateCalls: {
      readonly skuID: string;
      readonly data: Record<string, unknown>;
    }[];
  } {
    const known = [...skus];
    const identifiers = new Map<SkuOptionOwner, string>(
      known.map((sku): readonly [SkuOptionOwner, string] => [sku, sku.skuID]),
    );
    const loadExistingIds: string[] = [];
    const loadOrCreateIds: string[] = [];
    const populateCalls: {
      readonly skuID: string;
      readonly data: Record<string, unknown>;
    }[] = [];
    const readPrimaryId = (sku: SkuOptionOwner): string => identifiers.get(sku) ?? '';

    return {
      loadExistingIds,
      loadOrCreateIds,
      populateCalls,
      readPrimaryId,
      loader: {
        loadExisting: (relatedId: string): SkuOptionOwner | undefined => {
          loadExistingIds.push(relatedId);
          return known.find((candidate) => candidate.skuID === relatedId);
        },
        loadOrCreate: (relatedId: string): SkuOptionOwner => {
          loadOrCreateIds.push(relatedId);
          const existing = known.find((candidate) => candidate.skuID === relatedId);

          if (existing !== undefined) {
            return existing;
          }

          const created = new MutatingSkuOptionOwner(relatedId, events);
          known.push(created);
          identifiers.set(created, relatedId);
          return created;
        },
      },
      populate: (sku: SkuOptionOwner, data: Record<string, unknown>): void => {
        populateCalls.push({ skuID: readPrimaryId(sku), data });
      },
    };
  }

  /** Population permitted, so relationship effects are not hidden behind the persistent gate. */
  const permitPopulation = (): PopulationAuthorizationPort =>
    createPopulationAuthorizationDouble().populationAuthorization;

  it('NET-NEW — model/entity/Option.cfc:L52-L79 — the factory appends exactly the many-to-one and many-to-many descriptors', () => {
    const groups = optionGroupCatalog([]);
    const groupSubPopulations = optionGroupSubPopulations();
    const skus = skuCatalog([], []);
    const descriptors = createOptionPropertyDescriptors(
      groups.loader,
      groupSubPopulations.populate,
      skus.loader,
      skus.populate,
      skus.readPrimaryId,
    );

    expect(descriptors.entityName).toBe(OPTION_PROPERTY_DESCRIPTORS.entityName);
    expect(descriptors.persistent).toBe(true);
    expect(descriptors.properties.map((descriptor) => descriptor.name)).toStrictEqual([
      ...OPTION_PROPERTY_DESCRIPTORS.properties.map((descriptor) => descriptor.name),
      'optionGroup',
      'skus',
    ]);
    expect(descriptors.properties).toHaveLength(OPTION_PROPERTY_DESCRIPTORS.properties.length + 2);
    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors.properties)).toBe(true);

    expect(descriptors.properties.at(-2)).toMatchObject({
      name: 'optionGroup',
      kind: 'many-to-one',
      relatedPrimaryIdPropertyName: 'optionGroupID',
    });
    expect(descriptors.properties.at(-1)).toMatchObject({
      name: 'skus',
      kind: 'many-to-many',
      relatedPrimaryIdPropertyName: 'skuID',
      singularName: 'sku',
    });
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L236-L248 — a multi-key optionGroup struct loads-or-creates, populates and records the related group', () => {
    const optionGroup = buildOptionGroup({ optionGroupID: POPULATION_IDS.optionGroup });
    const groups = optionGroupCatalog([optionGroup]);
    const groupSubPopulations = optionGroupSubPopulations();
    const skus = skuCatalog([], []);
    const option = buildOption({ optionID: SAVED_OPTION_IDS.nonMember });
    const nestedData = {
      optionGroupID: POPULATION_IDS.optionGroup,
      optionGroupName: 'Size',
    };

    const result = populateWithSubProperties(
      option,
      { optionGroup: nestedData },
      createOptionPropertyDescriptors(
        groups.loader,
        groupSubPopulations.populate,
        skus.loader,
        skus.populate,
        skus.readPrimaryId,
      ),
      permitPopulation(),
    );

    expect(groups.loadOrCreateIds).toEqual([POPULATION_IDS.optionGroup]);
    expect(groups.loadExistingIds).toEqual([]);
    expect(option.optionGroup).toBe(optionGroup);
    expect(groupSubPopulations.calls).toEqual([
      { optionGroupID: POPULATION_IDS.optionGroup, data: nestedData },
    ]);
    expect(result.populatedSubProperties.optionGroup).toBe(optionGroup);

    /* The real entity accessor can traverse the relationship that the descriptor just assigned. */
    expect(option.getValueByPropertyIdentifier('optionGroup.optionGroupID')).toBe(
      POPULATION_IDS.optionGroup,
    );

    /*
     * The concrete entities own equivalent accessors in AuditableEntity, so they do not call the
     * composition helper in populate.ts. Drive that exported helper explicitly with the same metadata
     * declarations: its private isTraversableValue guard must recognise the managed related object and
     * delegate the remaining path rather than returning the unresolved empty string.
     */
    const managedGroup = manageEntity(
      { optionGroupID: POPULATION_IDS.optionGroup, optionGroupName: 'Size' },
      OPTION_GROUP_ENTITY_METADATA,
    );
    const managedOption = manageEntity(
      { optionID: SAVED_OPTION_IDS.nonMember, optionGroup: managedGroup },
      OPTION_ENTITY_METADATA,
    );
    expect(managedOption.getValueByPropertyIdentifier('optionGroup.optionGroupName')).toBe('Size');
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L230-L266 — one-key optionGroup structs load, clear or preserve, while an ARRAY is not a struct', () => {
    const optionGroup = buildOptionGroup({ optionGroupID: POPULATION_IDS.optionGroup });
    const groups = optionGroupCatalog([optionGroup]);
    const groupSubPopulations = optionGroupSubPopulations();
    const skus = skuCatalog([], []);
    const descriptors = createOptionPropertyDescriptors(
      groups.loader,
      groupSubPopulations.populate,
      skus.loader,
      skus.populate,
      skus.readPrimaryId,
    );

    const loaded = buildOption({ optionID: SAVED_OPTION_IDS.spliceFirst });
    populate(
      loaded,
      { optionGroup: { optionGroupID: POPULATION_IDS.optionGroup } },
      descriptors,
      permitPopulation(),
    );
    expect(loaded.optionGroup).toBe(optionGroup);

    const preserved = buildOption({ optionID: SAVED_OPTION_IDS.spliceSecond });
    preserved.optionGroup = optionGroup;
    populate(
      preserved,
      { optionGroup: { optionGroupID: POPULATION_IDS.missingOptionGroup } },
      descriptors,
      permitPopulation(),
    );
    expect(preserved.optionGroup).toBe(optionGroup);

    const cleared = buildOption({ optionID: SAVED_OPTION_IDS.crossGroup });
    cleared.optionGroup = optionGroup;
    populate(cleared, { optionGroup: { optionGroupID: '' } }, descriptors, permitPopulation());
    expect(cleared.optionGroup).toBeUndefined();

    const arrayPayload = buildOption({ optionID: SAVED_OPTION_IDS.nonMember });
    arrayPayload.optionGroup = optionGroup;
    populate(
      arrayPayload,
      { optionGroup: [{ optionGroupID: POPULATION_IDS.optionGroup }] },
      descriptors,
      permitPopulation(),
    );
    expect(arrayPayload.optionGroup).toBe(optionGroup);

    expect(groups.loadExistingIds).toEqual([
      POPULATION_IDS.optionGroup,
      POPULATION_IDS.missingOptionGroup,
    ]);
    expect(groups.loadOrCreateIds).toEqual([]);
    expect(groupSubPopulations.calls).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L272-L306 — an ARRAY of SKU structs delegates add, recursive population and recording through the factory', () => {
    const events: string[] = [];
    const relatedSku = new MutatingSkuOptionOwner(POPULATION_IDS.addSku, events);
    const groups = optionGroupCatalog([]);
    const groupSubPopulations = optionGroupSubPopulations();
    const skus = skuCatalog([relatedSku], events);
    const option = buildOption({ optionID: SAVED_OPTION_IDS.nonMember });
    const nestedData = { skuID: POPULATION_IDS.addSku, skuCode: 'ADDED-SKU' };

    const result = populateWithSubProperties(
      option,
      { skus: [nestedData] },
      createOptionPropertyDescriptors(
        groups.loader,
        groupSubPopulations.populate,
        skus.loader,
        skus.populate,
        skus.readPrimaryId,
      ),
      permitPopulation(),
    );

    expect(skus.loadOrCreateIds).toEqual([POPULATION_IDS.addSku]);
    expect(skus.loadExistingIds).toEqual([]);
    expect(events).toEqual([`add:${POPULATION_IDS.addSku}`]);
    expect(option.skus).toStrictEqual([relatedSku]);
    expect(skus.populateCalls).toEqual([{ skuID: POPULATION_IDS.addSku, data: nestedData }]);
    expect(result.populatedSubProperties.skus).toStrictEqual([relatedSku]);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L309-L359 — the delimited SKU diff keeps, removes backwards, adds, skips misses, drops empty elements and compares case-sensitively', () => {
    const events: string[] = [];
    const kept = new MutatingSkuOptionOwner(POPULATION_IDS.keepSku, events);
    const removedFirst = new MutatingSkuOptionOwner(POPULATION_IDS.removeFirstSku, events);
    const removedSecond = new MutatingSkuOptionOwner(POPULATION_IDS.removeSecondSku, events);
    const caseSensitive = new MutatingSkuOptionOwner(POPULATION_IDS.caseSensitiveSku, events);
    const added = new MutatingSkuOptionOwner(POPULATION_IDS.addSku, events);
    const groups = optionGroupCatalog([]);
    const groupSubPopulations = optionGroupSubPopulations();
    const skus = skuCatalog([kept, removedFirst, removedSecond, caseSensitive, added], events);
    const option = buildOption({ optionID: SAVED_OPTION_IDS.nonMember });
    option.skus.push(kept, removedFirst, removedSecond, caseSensitive);
    const caseVariant = POPULATION_IDS.caseSensitiveSku.toUpperCase();

    const result = populateWithSubProperties(
      option,
      {
        skus:
          `,${POPULATION_IDS.keepSku},,${POPULATION_IDS.addSku},` +
          `${POPULATION_IDS.unloadableSku},${caseVariant},,`,
      },
      createOptionPropertyDescriptors(
        groups.loader,
        groupSubPopulations.populate,
        skus.loader,
        skus.populate,
        skus.readPrimaryId,
      ),
      permitPopulation(),
    );

    /*
     * Reverse order is load-bearing: every removal mutates the live array. A forward walk would skip
     * removedSecond after removing removedFirst; the observed order proves the ported backwards loop.
     */
    expect(events).toEqual([
      `remove:${POPULATION_IDS.caseSensitiveSku}`,
      `remove:${POPULATION_IDS.removeSecondSku}`,
      `remove:${POPULATION_IDS.removeFirstSku}`,
      `add:${POPULATION_IDS.addSku}`,
    ]);
    expect(option.skus).toStrictEqual([kept, added]);

    /*
     * The intersection is not reloaded. Empty list elements never reach the loader. The unloadable
     * identifier and the case-variant miss both reach it and are silently skipped.
     */
    expect(skus.loadExistingIds).toEqual([
      POPULATION_IDS.addSku,
      POPULATION_IDS.unloadableSku,
      caseVariant,
    ]);
    expect(skus.loadExistingIds).not.toContain('');
    expect(skus.loadOrCreateIds).toEqual([]);
    expect(skus.populateCalls).toEqual([]);
    expect(result.populatedSubProperties.skus).toBeUndefined();
  });
});

/* Scope and completeness. */

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

    // Nothing else. The surface is closed at those thirteen plus the constructor, which is what makes
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
