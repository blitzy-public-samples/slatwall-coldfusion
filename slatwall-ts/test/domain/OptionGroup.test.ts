/**
 * OptionGroup domain tests — NET-NEW.
 *
 * Provenance — every case in this file is net-new coverage
 * There is no legacy `OptionGroupTest.cfc`. The legacy MXUnit entity suite under
 * `meta/tests/unit/entity/` carries a dedicated component for `Product` and for `Brand` and for
 * nothing else in this slice, so no assertion below replicates a legacy OptionGroup test case and
 * none is labelled TRACEABLE. `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67` supplies
 * the generic pattern four of the cases translate — `validate_as_save_for_a_new_instance_doesnt_pass`
 *
 * That provenance is documentary, not EMPIRICAL
 * No legacy result was observed and no output was compared, because the legacy suite cannot be
 * executed in this environment. MXUnit is not vendored — `meta/tests/readme.txt:L4` requires it to be
 * installed on the machine with a mapping inside cfide, and `meta/tests/unit/SlatwallUnitTestBase.cfc`
 * extends `mxunit.framework.TestCase`, which is therefore unresolvable — and CFSelenium is not
 * vendored either (`meta/tests/readme.txt:L5`). Every legacy claim below rests on the cited source.
 */

import { populate, populateWithSubProperties } from '../../src/domain/base/populate';
import type {
  OneToManyPropertyDescriptor,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../../src/domain/base/populate';
import type { PopulationAuthorizationPort } from '../../src/ports/AccountContextPort';
import { Option } from '../../src/domain/option/Option';
import {
  OPTION_GROUP_CLASS_NAME,
  OPTION_GROUP_DECLARED_PROPERTIES,
  OPTION_GROUP_ENTITY_NAME,
  OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME,
  OPTION_GROUP_PROPERTY_DESCRIPTORS,
  OptionGroup,
  createOptionGroupPropertyDescriptors,
  type OptionGroupPropertyName,
} from '../../src/domain/option/OptionGroup';
import { ValidationError } from '../../src/errors/ValidationError';
import { Validator } from '../../src/validation/Validator';
import {
  optionGroupValidationRuleSet,
  optionsMaxCollectionConstraint,
  type OptionGroupValidationSubject,
} from '../../src/validation/rules/optionGroup.rules';
import {
  buildOption,
  buildOptionGroup,
  createPopulationAuthorizationDouble,
  createValidatorHarness,
} from '../support/inMemoryRepositories';

/* Source-grounded constants. */

/**
 * The unsaved primary-identifier value, verbatim from `model/entity/OptionGroup.cfc:L52`, which
 * declares both `unsavedvalue=""` and `default=""`.
 */
const OPTION_GROUP_UNSAVED_ID_VALUE = '';

/**
 * An opaque persisted identifier, used only where a case needs a group or an option to be not new.
 */
const PERSISTED_OPTION_GROUP_ID = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';

/** A second opaque persisted identifier, so a collision can be seeded against a different row. */
const OTHER_PERSISTED_OPTION_GROUP_ID = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';

/**
 * An opaque persisted option identifier — `model/entity/Option.cfc:L52` declares the same
 * `fieldtype="id" generator="uuid" length="32"` shape for its own key.
 */
const PERSISTED_OPTION_ID = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3';

/**
 * A second persisted option identifier, so the population branch's payload ORDER is observable rather
 * than merely its cardinality.
 */
const OTHER_PERSISTED_OPTION_ID = 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4';

/**
 * The seven persistent properties of `model/entity/OptionGroup.cfc:L52-L58`, in declaration order.
 */
const OPTION_GROUP_PERSISTENT_PROPERTY_NAMES = [
  'optionGroupID',
  'optionGroupName',
  'optionGroupCode',
  'optionGroupImage',
  'optionGroupDescription',
  'imageGroupFlag',
  'sortOrder',
] as const satisfies readonly OptionGroupPropertyName[];

/**
 * The four audit properties of `model/entity/OptionGroup.cfc:L64-L67`, every one of which carries
 * `hb_populateEnabled="false"`.
 */
const OPTION_GROUP_AUDIT_PROPERTY_NAMES = [
  'createdDateTime',
  'createdByAccount',
  'modifiedDateTime',
  'modifiedByAccount',
] as const satisfies readonly OptionGroupPropertyName[];

/** Every property `model/entity/OptionGroup.cfc` declares, mapped to the line that declares it. */
const OPTION_GROUP_DECLARED_PROPERTY_LOCATORS: Record<OptionGroupPropertyName, string> = {
  optionGroupID: 'model/entity/OptionGroup.cfc:L52',
  optionGroupName: 'model/entity/OptionGroup.cfc:L53',
  optionGroupCode: 'model/entity/OptionGroup.cfc:L54',
  optionGroupImage: 'model/entity/OptionGroup.cfc:L55',
  optionGroupDescription: 'model/entity/OptionGroup.cfc:L56',
  imageGroupFlag: 'model/entity/OptionGroup.cfc:L57',
  sortOrder: 'model/entity/OptionGroup.cfc:L58',
  remoteID: 'model/entity/OptionGroup.cfc:L61',
  createdDateTime: 'model/entity/OptionGroup.cfc:L64',
  createdByAccount: 'model/entity/OptionGroup.cfc:L65',
  modifiedDateTime: 'model/entity/OptionGroup.cfc:L66',
  modifiedByAccount: 'model/entity/OptionGroup.cfc:L67',
  options: 'model/entity/OptionGroup.cfc:L70',
};

/**
 * The declared property names, read from the production set rather than from the locator map above.
 */
const OPTION_GROUP_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(
  OPTION_GROUP_DECLARED_PROPERTIES,
);

/* The one local recorder — a real `option` subclass that records and declines to wire. */

/** A real `Option` whose two relationship mutators record their argument and wire nothing. */
class RecordingOption extends Option {
  /** Every group handed to {@link setOptionGroup}, in call order. */
  public readonly setOptionGroupCalls: OptionGroup[] = [];

  /** Every argument handed to {@link removeOptionGroup}, in call order, `undefined` included. */
  public readonly removeOptionGroupCalls: (OptionGroup | undefined)[] = [];

  public override setOptionGroup(optionGroup: OptionGroup): void {
    this.setOptionGroupCalls.push(optionGroup);
  }

  public override removeOptionGroup(optionGroup?: OptionGroup): void {
    this.removeOptionGroupCalls.push(optionGroup);
  }
}

/* Derivation helpers over the production descriptor set. */

/** One entry of the production descriptor collection, as production declares it. */
type OptionGroupPropertyDescriptor = (typeof OPTION_GROUP_PROPERTY_DESCRIPTORS.properties)[number];

/** The descriptor names in the order production declares them, which is population order. */
const declaredDescriptorNames = (): readonly string[] =>
  OPTION_GROUP_PROPERTY_DESCRIPTORS.properties.map((descriptor) => descriptor.name);

/** The descriptors for a named subset, in production order, so a missing one is visible. */
const descriptorsNamed = (
  names: readonly OptionGroupPropertyName[],
): readonly OptionGroupPropertyDescriptor[] =>
  OPTION_GROUP_PROPERTY_DESCRIPTORS.properties.filter((descriptor) =>
    names.some((name) => name === descriptor.name),
  );

/** Name-to-declared-value-type for every column descriptor in the set. */
const declaredColumnValueTypes = (): Record<string, string> => {
  const valueTypes: Record<string, string> = {};

  for (const descriptor of OPTION_GROUP_PROPERTY_DESCRIPTORS.properties) {
    if ('valueType' in descriptor) {
      valueTypes[descriptor.name] = descriptor.valueType;
    }
  }

  return valueTypes;
};

/**
 * The property name the legacy simple-representation convention resolves to, computed the way
 * `org/Hibachi/HibachiEntity.cfc:L74-L87` computed it and over the production declared set.
 */
const resolveSimpleRepresentationPropertyName = (className: string): string | undefined => {
  const conventionalName = `${className}name`.toLowerCase();

  return OPTION_GROUP_DECLARED_PROPERTY_NAMES.find(
    (propertyName) => propertyName.toLowerCase() === conventionalName,
  );
};

/* A — the persistent property surface — model/entity/OptionGroup.cfc:L52-L58. */

describe('OptionGroup — NET-NEW — the persistent property surface, model/entity/OptionGroup.cfc:L52-L58', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L52 — optionGroupID is the primary identifier, holds the declared unsaved value on a fresh instance, and is what isNew() derives from', () => {
    const optionGroup = new OptionGroup();

    // `unsavedvalue="" default=""` at `:L52`, reached through `getPrimaryIDValue()`
    // (`org/Hibachi/HibachiEntity.cfc:L244`) and `getNewFlag()` (`:L571-L576`).
    expect(optionGroup.optionGroupID).toBe(OPTION_GROUP_UNSAVED_ID_VALUE);
    expect(optionGroup.getPrimaryIDValue()).toBe(OPTION_GROUP_UNSAVED_ID_VALUE);
    expect(optionGroup.isNew()).toBe(true);

    // The name is resolved from the production constant, not from a literal declared in this file,
    // so a rename in the entity fails here. The literal pins that constant to `:L52`.
    expect(optionGroup.getPrimaryIDPropertyName()).toBe(OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME);
    expect(OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME).toBe('optionGroupID');

    // Assigning an identifier is what makes the group persisted; no identifier is generated here.
    optionGroup.optionGroupID = PERSISTED_OPTION_GROUP_ID;
    expect(optionGroup.getPrimaryIDValue()).toBe(PERSISTED_OPTION_GROUP_ID);
    expect(optionGroup.isNew()).toBe(false);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L53 — optionGroupName is an absent-by-default string that retains what is assigned to it', () => {
    const optionGroup = new OptionGroup();

    // `ormtype="string"` with no `default`, so absence is the correct empty state. CFML modelled a
    // null column as a key missing from `variables`; the port models it as an optional field.
    expect(optionGroup.optionGroupName).toBeUndefined();

    optionGroup.optionGroupName = 'Size';
    expect(optionGroup.optionGroupName).toBe('Size');
    expect(typeof optionGroup.optionGroupName).toBe('string');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L54 — optionGroupCode is an absent-by-default string that retains what is assigned to it', () => {
    const optionGroup = new OptionGroup();

    expect(optionGroup.optionGroupCode).toBeUndefined();

    optionGroup.optionGroupCode = 'size';
    expect(optionGroup.optionGroupCode).toBe('size');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L55 — optionGroupImage is an absent-by-default string and the entity applies no path handling to it', () => {
    const optionGroup = new OptionGroup();

    expect(optionGroup.optionGroupImage).toBeUndefined();

    // Stored verbatim. Image path resolution is an out-of-scope collaborator's job, and this entity
    // declares no member that touches one, so nothing is stubbed for it.
    optionGroup.optionGroupImage = 'group.png';
    expect(optionGroup.optionGroupImage).toBe('group.png');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L56 — optionGroupDescription is an absent-by-default string and the entity enforces no length of its own', () => {
    const optionGroup = new OptionGroup();

    expect(optionGroup.optionGroupDescription).toBeUndefined();

    // `length="4000"` is a column constraint, and `model/validation/OptionGroup.json` declares no
    // `maxLength` rule for this property, so the entity is not the place any ceiling is enforced.
    // No length rule is invented here to make one appear.
    optionGroup.optionGroupDescription = 'A group of options.';
    expect(optionGroup.optionGroupDescription).toBe('A group of options.');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L57 — imageGroupFlag defaults to the boolean false, the direct translation of default="0"', () => {
    const optionGroup = new OptionGroup();

    // `ormtype="boolean" default="0"`. The port exposes a real boolean: neither the string `'0'` nor
    // the number `0` is a public type here, and neither is asserted as one.
    expect(optionGroup.imageGroupFlag).toBe(false);
    expect(typeof optionGroup.imageGroupFlag).toBe('boolean');

    optionGroup.imageGroupFlag = true;
    expect(optionGroup.imageGroupFlag).toBe(true);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L58 — sortOrder is a number-typed field the entity leaves unset, and it is never assigned by construction', () => {
    const optionGroup = new OptionGroup();

    // See the lifecycle cases for the full judgment; this case pins only the field's own shape.
    expect(optionGroup.sortOrder).toBeUndefined();

    optionGroup.sortOrder = 3;
    expect(optionGroup.sortOrder).toBe(3);
    expect(typeof optionGroup.sortOrder).toBe('number');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L52-L70 — the declared name space is exactly the thirteen source declarations, and hasProperty answers over it with no phantoms', () => {
    const optionGroup = new OptionGroup();

    // The production declared set and the legacy locator map must agree, in both directions.
    expect([...OPTION_GROUP_DECLARED_PROPERTY_NAMES].sort()).toEqual(
      Object.keys(OPTION_GROUP_DECLARED_PROPERTY_LOCATORS).sort(),
    );

    // Every declared name answers true. A false answer would make
    // `org/Hibachi/HibachiValidationService.cfc:L171` skip a rule silently, which is the most
    // dangerous failure mode in this area and the reason the set is asserted rather than trusted.
    for (const propertyName of OPTION_GROUP_DECLARED_PROPERTY_NAMES) {
      expect(optionGroup.hasProperty(propertyName)).toBe(true);
      expect(optionGroup.getPropertyMetaData(propertyName).name).toBe(propertyName);
    }

    // The seven "Persistent Properties" and the four audit properties are all inside that space,
    // and the counts are stated as what the source blocks hold rather than as an invented total.
    expect(OPTION_GROUP_PERSISTENT_PROPERTY_NAMES).toHaveLength(7);
    expect(OPTION_GROUP_AUDIT_PROPERTY_NAMES).toHaveLength(4);
    for (const propertyName of [
      ...OPTION_GROUP_PERSISTENT_PROPERTY_NAMES,
      ...OPTION_GROUP_AUDIT_PROPERTY_NAMES,
    ]) {
      expect(OPTION_GROUP_DECLARED_PROPERTY_NAMES).toContain(propertyName);
    }

    // `remoteID` (`:L61`) and `options` (`:L70`) complete the space; nothing else is declared, and no
    // name outside it answers true.
    expect(OPTION_GROUP_DECLARED_PROPERTY_NAMES).toContain('remoteID');
    expect(OPTION_GROUP_DECLARED_PROPERTY_NAMES).toContain('options');
    expect(optionGroup.hasProperty('optiongroupname')).toBe(false);
    expect(optionGroup.hasProperty('optionGroupSortOrder')).toBe(false);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L49 — the entity reports the class name and the mapped ORM entity name the component declares', () => {
    const optionGroup = new OptionGroup();

    // `getClassName()` (`org/Hibachi/HibachiObject.cfc:L135-L137`) is the bare component name and is
    // what every validation message interpolates
    // (`org/Hibachi/HibachiValidationService.cfc:L202`, `:L213`, `:L216`).
    expect(optionGroup.getClassName()).toBe(OPTION_GROUP_CLASS_NAME);
    expect(OPTION_GROUP_CLASS_NAME).toBe('OptionGroup');

    // `getEntityName()` is the `entityname` attribute — the logical entity name, not the physical
    // `SwOptionGroup` table, which no assertion in this file names in an executable position.
    expect(optionGroup.getEntityName()).toBe(OPTION_GROUP_ENTITY_NAME);
    expect(OPTION_GROUP_ENTITY_NAME).toBe('SlatwallOptionGroup');
  });
});

/* B — the population descriptor set — model/entity/OptionGroup.cfc:L53-L67. */

describe('OptionGroup — NET-NEW — the exported population descriptors, model/entity/OptionGroup.cfc:L53-L67', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L53-L61 — the seven column descriptors appear in source declaration order, with optionGroupID deliberately absent', () => {
    // Declaration order is preserved because it is population order: the legacy loop iterated
    // declared properties rather than payload keys.
    expect(declaredDescriptorNames().slice(0, 7)).toEqual([
      'optionGroupName',
      'optionGroupCode',
      'optionGroupImage',
      'optionGroupDescription',
      'imageGroupFlag',
      'sortOrder',
      'remoteID',
    ]);

    // `optionGroupID` is not a populatable property and its absence is the contract, not a gap.
    // `:L52` declares `fieldtype="id" generator="uuid"`, so the identifier is minted by the
    // persistence layer and never arrives in a payload. It is still a declared property — the
    // declared-property cases assert `hasProperty('optionGroupID')` — which is exactly the distinction being drawn here.
    expect(declaredDescriptorNames()).not.toContain('optionGroupID');

    // `options` (`:L70`) is absent too, and for a different reason: a one-to-many descriptor is
    // required to carry a loader and a sub-populator, neither of which can exist in a static
    // constant inside the domain layer. Production supplies it through a factory that takes both as
    // parameters, which this file does not exercise — the collaborators belong to the composition
    // root, and reaching for them would breach the layering this suite is meant to respect.
    expect(declaredDescriptorNames()).not.toContain('options');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L53-L61 — each column descriptor carries the value type its ormtype declares', () => {
    // `ormtype="string"` at `:L53`-`:L56` and `:L61`, `ormtype="boolean"` at `:L57`,
    // `ormtype="integer"` at `:L58`. The mapping is asserted rather than assumed because a wrong
    // value type would coerce a payload value into the wrong shape at population time.
    expect(declaredColumnValueTypes()).toEqual({
      optionGroupName: 'string',
      optionGroupCode: 'string',
      optionGroupImage: 'string',
      optionGroupDescription: 'string',
      imageGroupFlag: 'boolean',
      sortOrder: 'integer',
      remoteID: 'string',
    });
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L64-L67 — all four audit descriptors are populate-disabled, reproducing hb_populateEnabled="false"', () => {
    const auditDescriptors = descriptorsNamed(OPTION_GROUP_AUDIT_PROPERTY_NAMES);

    // Present, in source order, and every one of them refused to population.
    expect(auditDescriptors.map((descriptor) => descriptor.name)).toEqual([
      ...OPTION_GROUP_AUDIT_PROPERTY_NAMES,
    ]);
    expect(auditDescriptors.map((descriptor) => descriptor.populateEnabled)).toEqual([
      false,
      false,
      false,
      false,
    ]);

    // The seven columns are not disabled — none of them carries the attribute in the source — so the
    // flag genuinely discriminates rather than being set everywhere.
    const columnDescriptors = descriptorsNamed(
      OPTION_GROUP_PERSISTENT_PROPERTY_NAMES.filter(
        (propertyName) => propertyName !== 'optionGroupID',
      ),
    );
    expect(columnDescriptors).toHaveLength(6);
    for (const descriptor of columnDescriptors) {
      expect(descriptor.populateEnabled).not.toBe(false);
    }
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L49 — the descriptor set carries the class name and the persistent flag from the component declaration', () => {
    // `persistent=true` is consequential rather than decorative: the legacy authorisation gate
    // (`org/Hibachi/HibachiTransient.cfc:L186-L190`) short-circuits for non-persistent targets, so a
    // process object populates freely while an entity such as this one has per-property
    // authorisation consulted.
    expect(OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toBe(OPTION_GROUP_CLASS_NAME);
    expect(OPTION_GROUP_PROPERTY_DESCRIPTORS.persistent).toBe(true);

    // Eleven descriptors in total: the seven columns plus the four audit properties.
    expect(OPTION_GROUP_PROPERTY_DESCRIPTORS.properties).toHaveLength(11);
  });
});

/* C — the `sortOrder` lifecycle — model/entity/OptionGroup.cfc:L58. */

describe('OptionGroup — NET-NEW — the sortOrder lifecycle, model/entity/OptionGroup.cfc:L58', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L58 — a fresh group leaves sortOrder unset, because the entity never assigns one', () => {
    const fromConstructor = new OptionGroup();
    const fromFactory = buildOptionGroup();

    // The landed representation of "no value yet" is `undefined`, and this asserts that rather than a
    // guessed sentinel: no `0`, no `-1` and no `null` is expected, because `:L58` declares no
    // `default` and inventing one would be a behaviour the source does not state.
    expect(fromConstructor.sortOrder).toBeUndefined();
    expect(fromFactory.sortOrder).toBeUndefined();

    // Absence is also faithful to the pre-`preInsert` legacy state, in which the key was simply not
    // present in the component's `variables` scope. The field is materialised as an own key here only
    // because the compiler targets ES2022 and defines declared class fields; that is an emit detail
    // with no consumer in this slice, and it is recorded rather than papered over.
    expect(Object.prototype.hasOwnProperty.call(fromConstructor, 'sortOrder')).toBe(true);

    // It is a declared property regardless, so a rule naming it would run — see the validation-support cases for the
    // proof that no such rule exists.
    expect(fromConstructor.hasProperty('sortOrder')).toBe(true);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L58 — an explicitly supplied numeric sortOrder is retained verbatim, and supplying one is not an allocation', () => {
    // The value below is a test input, not an allocated sort order. Nothing in this file computes
    // a next value: the legacy allocation is `max(SwOptionGroup.sortOrder) + 1` over the whole table
    // (`model/dao/SkuDAO.cfc:L211`, `:L214`), it belongs to the persistence layer, and no query is
    // executed or imitated here. The only claim is that the field holds what it is handed.
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size', sortOrder: 2 });

    expect(optionGroup.sortOrder).toBe(2);

    // Reassignable, because the lifecycle owner writes it after construction rather than before.
    optionGroup.sortOrder = 7;
    expect(optionGroup.sortOrder).toBe(7);

    // And nothing else on the entity moved as a side effect of ordering — the group holds a position,
    // it does not maintain one.
    expect(optionGroup.optionGroupName).toBe('Size');
    expect(optionGroup.isNew()).toBe(true);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L58 — sortOrder is carried as a populatable integer column, which is how the lifecycle owner can write it', () => {
    // The population contract types it `integer` (the population-contract cases assert the whole map) and does not
    // disable it, unlike the four audit properties. That combination is what lets
    // `preInsert`-equivalent code and a row mapper both set it, and it is asserted here so the
    // lifecycle story is grounded in the declared contract rather than in prose alone.
    const sortOrderDescriptors = descriptorsNamed(['sortOrder']);

    expect(sortOrderDescriptors).toHaveLength(1);
    expect(declaredColumnValueTypes()['sortOrder']).toBe('integer');
    for (const descriptor of sortOrderDescriptors) {
      expect(descriptor.populateEnabled).not.toBe(false);
    }
  });
});

/*
 * D — the ordered options relationship and its live array — model/entity/OptionGroup.cfc:L70-L79
 *
 * TODO(parity) — the legacy overload is collapsed, and that is a documented port decision rather
 * than a claim the overload never existed. The legacy signature is
 * `public array function getOptions(orderby, sortType="text", direction="asc")` (`:L73`), with a
 * two-branch body: `:L74-L75` returns `variables.Options` untouched when no `orderby` is supplied,
 * and `:L76-L77` otherwise delegates to `getService("hibachiUtilityService").sortObjectArray(...)`.
 *
 * TODO(boundary) — `getOptionsSmartList()` (`model/entity/OptionGroup.cfc:L81-L83`) is out of this
 * layer and is not tested. Its body is `return getPropertySmartList(propertyName="options");`, and
 * `getPropertySmartList` is `org/Hibachi/**` machinery whose paginated dynamic-query abstraction
 * belongs to the smart-list port and its MySQL query builder. No SmartList API is fabricated here, no
 * case asserts one, and no substitute member is invented so that something could be asserted. The
 * smartList path is a service and adapter concern rather than an entity one, and it is covered there.
 */

describe('OptionGroup — NET-NEW — the ordered options relationship, model/entity/OptionGroup.cfc:L70-L79', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L70 — a fresh group carries an empty options array, and the array is per-instance rather than shared', () => {
    const first = new OptionGroup();
    const second = new OptionGroup();

    expect(first.getOptions()).toEqual([]);
    expect(second.getOptions()).toEqual([]);

    // Per-instance, not a shared module-level array. A shared empty array would leak options
    // between groups the moment one of them gained a member, which in a warm Lambda container means
    // leaking across invocations and across tenants. The empty array is also what the legacy entity
    // base assertion `defaults_are_correct`
    // (`meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67`) expects of a fresh entity.
    expect(first.getOptions()).not.toBe(second.getOptions());
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L70 — getOptions() hands back the options in ascending sortOrder relationship order, exactly as received', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size' });

    // A deliberately identifiable sequence, attached already in relationship ORDER — which is what
    // `orderby="sortOrder"` guarantees a loaded collection looks like. Each option carries a distinct
    // code so the assertion pins ORDER and not merely membership.
    buildOption({ optionCode: 'small', optionName: 'Small', sortOrder: 1, optionGroup });
    buildOption({ optionCode: 'medium', optionName: 'Medium', sortOrder: 2, optionGroup });
    buildOption({ optionCode: 'large', optionName: 'Large', sortOrder: 3, optionGroup });

    // TODO(parity) — asserted with a zero-argument call, because the legacy `orderby` overload
    // (`:L73`) and its in-memory sort branch (`:L76-L77`) are deliberately not ported. The port
    // therefore preserves the order it is given and never re-sorts; a case that passed an argument
    // would be exercising a member the port does not declare.
    expect(optionGroup.getOptions().map((option) => option.optionCode)).toEqual([
      'small',
      'medium',
      'large',
    ]);
    expect(optionGroup.getOptions().map((option) => option.sortOrder)).toEqual([1, 2, 3]);

    // The ordering is not re-derived on read: a second call reports the same sequence, and the entity
    // holds no memo, no cache and no lazily sorted copy that could disagree with the first.
    expect(optionGroup.getOptions().map((option) => option.optionName)).toEqual([
      'Small',
      'Medium',
      'Large',
    ]);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L73-L75 — getOptions() returns the SAME live array reference on every call, never a defensive copy', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });

    const firstRead = optionGroup.getOptions();
    const secondRead = optionGroup.getOptions();

    // Reference identity, not deep equality — and the distinction is behaviour rather than style.
    // The legacy no-argument branch is a bare `return variables.Options;`, and
    // `model/entity/Option.cfc` mutates what it is handed: `arrayAppend(...getOptions(), this)` at
    // `:L95`, `arrayFind(...getOptions(), this)` at `:L102` and `arrayDeleteAt(...)` at `:L104`.
    expect(secondRead).toBe(firstRead);
    expect(firstRead).toBe(optionGroup.options);

    // Live, not a snapshot: the reference captured before the option attached itself observes the
    // append, because it is the very array the option side pushed into.
    const option = buildOption({ optionCode: 'small', sortOrder: 1, optionGroup });

    expect(firstRead).toHaveLength(1);
    expect(firstRead).toContain(option);
    expect(optionGroup.getOptions()).toBe(firstRead);
  });
});

/*
 * E — the three relationship helpers — model/entity/OptionGroup.cfc:l92-l97, plus IR-1 `hasOption`
 */

describe('OptionGroup — NET-NEW — the IR-1 relationship helpers, model/entity/OptionGroup.cfc:L92-L97', () => {
  it('NET-NEW — IR-1 / model/entity/Option.cfc:L94 — hasOption reports true for a member and false for a non-member', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });
    const member = buildOption({ optionCode: 'small', sortOrder: 1, optionGroup });
    const stranger = buildOption({ optionCode: 'large', sortOrder: 2 });

    expect(optionGroup.hasOption(member)).toBe(true);
    expect(optionGroup.hasOption(stranger)).toBe(false);

    // An empty group is a member of nothing, which is the state the `:L94` guard sees on a first
    // attach.
    expect(new OptionGroup().hasOption(member)).toBe(false);
  });

  it('NET-NEW — IR-1 — hasOption matches by OBJECT IDENTITY, never by the option identifier', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });
    const attached = buildOption({
      optionID: PERSISTED_OPTION_ID,
      optionCode: 'small',
      optionGroup,
    });

    // A different instance carrying the same identifier and the same code is deliberately not a
    // member. CFML's `arrayFind` compares objects by reference, which is the semantics
    // `model/entity/Option.cfc:L102` relies on when it locates itself for removal, so key-based
    // comparison would be a behaviour change rather than a refinement — and would make two distinct
    // transient options with equal identifiers indistinguishable.
    const impostor = buildOption({ optionID: PERSISTED_OPTION_ID, optionCode: 'small' });

    expect(attached.optionID).toBe(impostor.optionID);
    expect(attached.optionCode).toBe(impostor.optionCode);
    expect(optionGroup.hasOption(attached)).toBe(true);
    expect(optionGroup.hasOption(impostor)).toBe(false);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L92-L94 — addOption is a pure delegation to the option-side setOptionGroup, and the group never appends on its own account', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });
    const recorder = new RecordingOption();

    optionGroup.addOption(recorder);

    // Delegated exactly once, with this group as the argument — `arguments.option.setOptionGroup( this )`.
    expect(recorder.setOptionGroupCalls).toEqual([optionGroup]);
    expect(recorder.setOptionGroupCalls[0]).toBe(optionGroup);

    // And the group did nothing else. The recorder declines to wire the relationship, so any
    // element in the collection now could only have been put there by the group itself — which would
    // be the silent double-append that `inverse="true"` makes wrong.
    expect(optionGroup.getOptions()).toEqual([]);
    expect(optionGroup.hasOption(recorder)).toBe(false);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L95-L97 — removeOption is a pure delegation to the option-side removeOptionGroup, and the group never splices on its own account', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });
    const recorder = new RecordingOption();

    // Seed the collection directly through the group's own live array, which is exactly the mutation
    // the option side performs at `model/entity/Option.cfc:L95`. Doing it this way means the
    // collection is genuinely non-empty when the delegation runs, so "nothing was spliced" is a real
    // observation rather than a vacuous one.
    optionGroup.getOptions().push(recorder);
    expect(optionGroup.hasOption(recorder)).toBe(true);

    optionGroup.removeOption(recorder);

    // Delegated exactly once, with the group passed explicitly — worth pinning, because the option's
    // `removeOptionGroup(any optionGroup)` (`model/entity/Option.cfc:L98`) takes an optional argument
    // and falls back to its own reference when the argument is omitted (`:L99-L101`). The source
    // passes the group, so the port passes the group.
    expect(recorder.removeOptionGroupCalls).toEqual([optionGroup]);
    expect(recorder.removeOptionGroupCalls[0]).toBe(optionGroup);

    // And the group left its own collection alone: the element is still there, because removing it is
    // the option's job.
    expect(optionGroup.getOptions()).toEqual([recorder]);
    expect(optionGroup.hasOption(recorder)).toBe(true);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L93 — delegating through the REAL Option wires both sides of the relationship', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });
    const option = new Option();

    optionGroup.addOption(option);

    // The real option assigned its back-reference and appended itself into the group's live array, so
    // the delegation is not merely called — it works end to end. This is the case that would fail if
    // the production `Option` body regressed, which is why no double stands in for it.
    expect(option.optionGroup).toBe(optionGroup);
    expect(optionGroup.getOptions()).toEqual([option]);
    expect(optionGroup.hasOption(option)).toBe(true);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L96 — delegating removal through the REAL Option unwires both sides', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });
    const kept = buildOption({ optionCode: 'small', sortOrder: 1, optionGroup });
    const removed = buildOption({ optionCode: 'large', sortOrder: 2, optionGroup });

    expect(optionGroup.getOptions()).toEqual([kept, removed]);

    optionGroup.removeOption(removed);

    // The real option spliced itself out of the live array and dropped its own back-reference, and
    // the sibling was left exactly where it was — order preserved, no collateral removal.
    expect(optionGroup.getOptions()).toEqual([kept]);
    expect(optionGroup.hasOption(removed)).toBe(false);
    expect(optionGroup.hasOption(kept)).toBe(true);
    expect(removed.optionGroup).toBeUndefined();
    expect(kept.optionGroup).toBe(optionGroup);
  });
});

/*
 * F — the inherited entity-test pattern, translated
 * meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67.
 */

describe('OptionGroup — NET-NEW — the inherited entity-test pattern, meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67', () => {
  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — save validation of a blank new group does NOT pass, and the findings land in the real error bag the caller owns', async () => {
    // A fresh harness and a fresh bag per case: nothing is shared, so the case is order-independent.
    const harness = createValidatorHarness();
    const optionGroup = new OptionGroup();
    const errors = new ValidationError();

    /*
     * The evaluator is the production one, and that claim is checked rather than asserted in prose.
     * The harness supplies the one collaborator the real `Validator` constructor needs — the uniqueness
     * port — and nothing else; the evaluation itself is production code. A double in its place would
     * make every case in sections F and G pass against test-local logic, so the substitution is pinned
     * here, once, at the first point the validator is used.
     */
    expect(harness.validator).toBeInstanceOf(Validator);

    const returned = await harness.validateInto(
      optionGroup,
      optionGroupValidationRuleSet,
      'save',
      errors,
    );

    /*
     * The legacy pair `variables.entity.validate(context="save")` then `assert(hasErrors())` was one
     * observation because the entity was the bag. Here the bag is a separate object handed in, so the
     * translation has to prove the two halves still meet: the validator reports into the caller's own
     * bag and hands that same bag back, rather than quietly answering from a throwaway.
     */
    expect(returned).toBe(errors);
    expect(errors.hasErrors()).toBe(true);

    /*
     * A blank new group fails on exactly the two required properties of
     * `model/validation/OptionGroup.json:L3-L4` and on nothing else. Asserting the key SET, not just
     * `hasErrors()`, is what makes this a real translation: `hasErrors()` alone would pass just as
     * happily if a rule the source does not declare had fired — including one against `sortOrder`,
     * which `:L58` marks ORM-required and the validation document deliberately says nothing about.
     */
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['optionGroupCode', 'optionGroupName']);
    expect(errors.hasError('optionGroupName')).toBe(true);
    expect(errors.hasError('optionGroupCode')).toBe(true);

    // And a property nobody reported against reads back as an empty array rather than raising, which
    // is the accessor behaviour every case in the validation-support section depends on.
    expect(errors.getError('sortOrder')).toEqual([]);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 — the simple-representation convention resolves to the simple optionGroupName field', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });

    /*
     * What is being asserted, and why it is not a call. The legacy assertion was
     * `isSimpleValue(entity.getSimpleRepresentation())`, and both members it reaches —
     * `getSimpleRepresentation()` (`org/Hibachi/HibachiEntity.cfc:L59-L71`) and
     * `getSimpleRepresentationPropertyName()` (`:L74-L87`) — live in `org/Hibachi/**`, the tree the
     * AAP treats as a boundary to extract from and never carry over. The landed entity therefore
     * has neither member, by an explicit and documented decision on the production file, so the
     * assertion is re-expressed against the seam that now owns it.
     */
    const propertyName = resolveSimpleRepresentationPropertyName(optionGroup.getClassName());

    expect(propertyName).toBe('optionGroupName');
    expect(optionGroup.hasProperty('optionGroupName')).toBe(true);

    /*
     * "Exists and is simple" is the other half of `:L57`, and it is a real constraint rather than a
     * formality: `:L65` returned the value only when `isSimpleValue()` held and fell back to `""`
     * otherwise, so a representation resolving to a collection or an object would have been silently
     * blanked. `optionGroupName` is the `ormtype="string"` column at `:L53`, so the value is a string
     * — and the resolution goes through the entity's own property-identifier reader, which is the
     * closest the port has to the legacy `invokeMethod("get…")` at `:L62`.
     */
    const representation = optionGroup.getValueByPropertyIdentifier('optionGroupName');

    expect(typeof representation).toBe('string');
    expect(representation).toBe('Size');

    // The legacy scan threw when no property matched (`:L86-L87`); a match existing is what keeps this
    // entity on the passing side of that branch. The throw text is not reproduced here.
    expect(propertyName).not.toBeUndefined();
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a primary-ID property name exists, and it is optionGroupID in the exported metadata', () => {
    const optionGroup = new OptionGroup();

    // `assert(len(getPrimaryIDPropertyName()))` becomes a named, non-empty assertion.
    expect(optionGroup.getPrimaryIDPropertyName().length).toBeGreaterThan(0);
    expect(optionGroup.getPrimaryIDPropertyName()).toBe(OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME);

    /*
     * The legacy answer came from ORM metadata — the property carrying `fieldtype="id"` at
     * `model/entity/OptionGroup.cfc:L52`. In the port that metadata is exported, so the name is
     * checkable in both directions: the constant names a property the entity really declares, and the
     * instance method agrees with the constant.
     */
    expect(OPTION_GROUP_DECLARED_PROPERTY_NAMES).toContain(OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME);
    expect(optionGroup.hasProperty(OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME)).toBe(true);
    expect(OPTION_GROUP_DECLARED_PROPERTY_LOCATORS[OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME]).toBe(
      'model/entity/OptionGroup.cfc:L52',
    );

    /*
     * And it is not in the population contract. `generator="uuid"` means the persistence layer
     * mints the key, so `OPTION_GROUP_PROPERTY_DESCRIPTORS` withholds it — a primary identifier that
     * is declared, readable and never populatable from request data. Both facts are asserted together
     * because they are easy to conflate, and conflating them would open a key-overwrite seam.
     */
    expect(declaredDescriptorNames()).not.toContain(OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67 — the defaults of a fresh group are correct: it is new and its primary identifier is zero-length', () => {
    const optionGroup = new OptionGroup();

    // `assert(entity.isNew())` — the port derives it from the identifier rather than from a flag.
    expect(optionGroup.isNew()).toBe(true);

    // `assert(!len(entity.getPrimaryIDValue()))` — zero length, which for the declared
    // `unsavedvalue="" default=""` at `model/entity/OptionGroup.cfc:L52` is the empty string.
    expect(optionGroup.getPrimaryIDValue()).toHaveLength(0);
    expect(optionGroup.getPrimaryIDValue()).toBe(OPTION_GROUP_UNSAVED_ID_VALUE);

    /*
     * The two assertions are one contract in the port, not two coincidences: `isNew()` is the
     * identifier test. Pinning the direction — a persisted identifier makes the group not-new, and
     * clearing it makes it new again — is what stops a future refactor from splitting them into an
     * independent flag that could disagree with the key.
     */
    optionGroup.optionGroupID = PERSISTED_OPTION_GROUP_ID;
    expect(optionGroup.isNew()).toBe(false);
    expect(optionGroup.getPrimaryIDValue()).toBe(PERSISTED_OPTION_GROUP_ID);

    optionGroup.optionGroupID = OPTION_GROUP_UNSAVED_ID_VALUE;
    expect(optionGroup.isNew()).toBe(true);

    /*
     * The legacy base made no claim about the other defaults, so the two this entity actually
     * declares are pinned here rather than assumed: the boolean from `default="0"` at `:L57`, and the
     * empty relationship collection at `:L70`. Nothing else has a declared default, and none is
     * invented — `sortOrder` in particular is left alone, for the reason the lifecycle cases record.
     */
    expect(optionGroup.imageGroupFlag).toBe(false);
    expect(optionGroup.getOptions()).toEqual([]);
  });
});

/* G — declarative validation fidelity — model/validation/OptionGroup.json:L2-L5. */

describe('OptionGroup — NET-NEW — declarative validation fidelity, model/validation/OptionGroup.json:L2-L5', () => {
  it('NET-NEW — model/validation/OptionGroup.json:L3 — optionGroupName is required on save, and the legacy presence semantics carry over exactly', async () => {
    // Absent. The property is declared but never assigned, which is the state a fresh group is in.
    const absent = buildOptionGroup({ optionGroupCode: 'size' });
    const absentErrors = await createValidatorHarness().validateDryRun(
      absent,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(absentErrors.getError('optionGroupName')).toEqual([
      'validate.save.OptionGroup.optionGroupName.required',
    ]);

    // The empty string. Distinct from absence in the source, and reported identically here.
    const empty = buildOptionGroup({ optionGroupName: '', optionGroupCode: 'size' });
    const emptyErrors = await createValidatorHarness().validateDryRun(
      empty,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(emptyErrors.getError('optionGroupName')).toEqual([
      'validate.save.OptionGroup.optionGroupName.required',
    ]);

    /*
     * Whitespace-only also fails, and this is the case that would be lost by a naive translation.
     * `validate_required` (`org/Hibachi/HibachiValidationService.cfc:L240-L245`) measured the trimmed
     * string length, so `" "` was exactly as absent as `""`. A JavaScript truthiness check would
     * pass it, so the behaviour is pinned rather than assumed.
     */
    const whitespace = buildOptionGroup({ optionGroupName: '   ', optionGroupCode: 'size' });
    const whitespaceErrors = await createValidatorHarness().validateDryRun(
      whitespace,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(whitespaceErrors.getError('optionGroupName')).toEqual([
      'validate.save.OptionGroup.optionGroupName.required',
    ]);

    /*
     * And a real value passes. Note what is not reported alongside it: no length ceiling and no
     * format rule, because `model/entity/OptionGroup.cfc:L53` declares neither and the document adds
     * neither. The asymmetry with `optionGroupCode` one line away is real legacy structure.
     */
    const named = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size' });
    const namedErrors = await createValidatorHarness().validateDryRun(
      named,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(namedErrors.getError('optionGroupName')).toEqual([]);
    expect(namedErrors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/OptionGroup.json:L4 — optionGroupCode carries three save constraints on one rule object, and they accumulate under one key without short-circuiting', async () => {
    /*
     * Absent: presence fails and the pattern passes, so exactly one message is reported. The pattern
     * has no absence guard and needs none — the presence constraint on the same rule object does that
     * job independently, which is why the source declares both rather than assuming one implies the
     * other.
     */
    const absent = buildOptionGroup({ optionGroupName: 'Size' });
    const absentErrors = await createValidatorHarness().validateDryRun(
      absent,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(absentErrors.getError('optionGroupCode')).toEqual([
      'validate.save.OptionGroup.optionGroupCode.required',
    ]);

    /*
     * The empty string is the interesting one: presence fails and the pattern fails, because the
     * pattern requires one or more characters. Two messages land under the one key, in declaration
     * ORDER — required first, pattern second — which is the observable proof that evaluation
     * accumulates rather than stopping at the first failure. Absent and empty are therefore not
     * interchangeable inputs, and a translation that treated them as one would report a single
     * message here.
     */
    const blank = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: '' });
    const blankErrors = await createValidatorHarness().validateDryRun(
      blank,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(blankErrors.getError('optionGroupCode')).toEqual([
      'validate.save.OptionGroup.optionGroupCode.required',
      'validate.save.OptionGroup.optionGroupCode.regex',
    ]);

    /*
     * A present but malformed code: presence passes, the pattern fails on the space. The pattern
     * Itself is never retyped in this file — production sources it from one shared constant, and a
     * copy here could agree with the legacy document while disagreeing with the code under test, so
     * the constraint is exercised through a value the pattern rejects instead.
     */
    const spaced = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'A B' });
    const spacedErrors = await createValidatorHarness().validateDryRun(
      spaced,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(spacedErrors.getError('optionGroupCode')).toEqual([
      'validate.save.OptionGroup.optionGroupCode.regex',
    ]);

    // A conformant code reports nothing at all, so the pattern is not rejecting ordinary values.
    const conformant = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size-1_2.3' });
    const conformantErrors = await createValidatorHarness().validateDryRun(
      conformant,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(conformantErrors.getError('optionGroupCode')).toEqual([]);
    expect(conformantErrors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/OptionGroup.json:L4 / IR-5 — the uniqueness port answers true for an AVAILABLE code, and a collision on another row reports the unique message', async () => {
    /*
     * Polarity. `isUniqueProperty` answers true when the value is unique, meaning available. The
     * name reads like a question and the answer is the good news, so an inverted reading turns every
     * free code into a collision and every collision into a pass — and both directions still
     * "validate", which is why both are asserted here rather than only the failure.
     */
    const availableHarness = createValidatorHarness();
    const available = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size' });
    const availableErrors = await availableHarness.validateDryRun(
      available,
      optionGroupValidationRuleSet,
      'save',
    );

    expect(availableErrors.hasErrors()).toBe(false);

    /*
     * The probe really happened, and it carried exactly what the legacy existence query would have
     * bound (`org/Hibachi/HibachiDAO.cfc:L130-L146`). `entityID` is the empty string because the group
     * is new, which makes the self-exclusion term `and e.optionGroupID != :entityID` a genuine no-op
     * on INSERT — it excludes nothing. On an update that same term is what stops a row colliding with
     * itself. The entity name is read from the production constant rather than written as a literal.
     */
    expect(availableHarness.uniqueProperty.calls).toEqual([
      {
        propertyName: 'optionGroupCode',
        resolvedPropertyName: 'optionGroupCode',
        entityName: OPTION_GROUP_ENTITY_NAME,
        entityID: OPTION_GROUP_UNSAVED_ID_VALUE,
        value: 'size',
      },
    ]);
    expect(OPTION_GROUP_ENTITY_NAME).toBe('SlatwallOptionGroup');

    /*
     * Now the same code, held by a different row. A fresh factory-created harness carries the seed —
     * no singleton is reused, so this case cannot be influenced by the one above or influence any
     * other.
     */
    const collidingHarness = createValidatorHarness([
      {
        entityName: OPTION_GROUP_ENTITY_NAME,
        propertyName: 'optionGroupCode',
        value: 'size',
        entityID: OTHER_PERSISTED_OPTION_GROUP_ID,
      },
    ]);
    const colliding = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size' });
    const collidingErrors = await collidingHarness.validateDryRun(
      colliding,
      optionGroupValidationRuleSet,
      'save',
    );

    // Presence and pattern both pass, so uniqueness is the only message — the three constraints on
    // the one rule object are genuinely independent.
    expect(collidingErrors.getError('optionGroupCode')).toEqual([
      'validate.save.OptionGroup.optionGroupCode.unique',
    ]);
    expect(collidingErrors.getError('optionGroupName')).toEqual([]);
  });

  it('NET-NEW — model/validation/OptionGroup.json:L5 — the delete guard admits an empty options collection and blocks a non-empty one under the options key', async () => {
    // The ceiling is production's, read from the exported constraint rather than written as a literal.
    // It is the document's only numeric value, transcribed at `:L5` rather than chosen.
    expect(optionsMaxCollectionConstraint.constraintType).toBe('maxCollection');
    expect(optionsMaxCollectionConstraint.constraintValue).toBe(0);

    const emptyHarness = createValidatorHarness();
    const empty = buildOptionGroup({
      optionGroupID: PERSISTED_OPTION_GROUP_ID,
      optionGroupName: 'Size',
      optionGroupCode: 'size',
    });

    expect(empty.getOptions()).toEqual([]);

    const emptyErrors = await emptyHarness.validateDryRun(
      empty,
      optionGroupValidationRuleSet,
      'delete',
    );

    /*
     * A group with no options deletes cleanly, and nothing else is reported: the name, code and
     * uniqueness rules are save-scoped, so the delete context selects the one guard and skips them.
     * The port was never even consulted, which is the sharpest available proof of that scoping.
     */
    expect(emptyErrors.hasErrors()).toBe(false);
    expect(emptyHarness.uniqueProperty.calls).toEqual([]);

    // One option is enough to block the delete, because the ceiling is zero rather than one.
    const guardedHarness = createValidatorHarness();
    const guarded = buildOptionGroup({
      optionGroupID: PERSISTED_OPTION_GROUP_ID,
      optionGroupName: 'Size',
      optionGroupCode: 'size',
    });
    buildOption({ optionCode: 'small', sortOrder: 1, optionGroup: guarded });

    const guardedErrors = await guardedHarness.validateDryRun(
      guarded,
      optionGroupValidationRuleSet,
      'delete',
    );

    // Reported under the full property key `options`, which is the relationship property name at
    // `model/entity/OptionGroup.cfc:L70` and not the `singularname` the mapping also declares.
    expect(guardedErrors.getError('options')).toEqual([
      'validate.delete.OptionGroup.options.maxCollection',
    ]);
    expect(Object.keys(guardedErrors.getErrors())).toEqual(['options']);

    /*
     * TODO(parity) — `model/entity/OptionGroup.cfc:L70` declares `cascade="all-delete-orphan"`, which
     * would delete the child options along with their group, while this guard refuses the delete
     * whenever any child exists. The cascade can therefore never fire for a non-empty group. The
     * tension is legacy structure and is preserved rather than reconciled; nothing here resolves it.
     */
    const crowdedHarness = createValidatorHarness();
    const crowded = buildOptionGroup({
      optionGroupID: PERSISTED_OPTION_GROUP_ID,
      optionGroupName: 'Size',
      optionGroupCode: 'size',
    });
    buildOption({ optionCode: 'small', sortOrder: 1, optionGroup: crowded });
    buildOption({ optionCode: 'large', sortOrder: 2, optionGroup: crowded });

    const crowdedErrors = await crowdedHarness.validateDryRun(
      crowded,
      optionGroupValidationRuleSet,
      'delete',
    );

    // Two options still produce one message: the ceiling is measured once against the collection, not
    // once per element, so the count does not multiply the reporting.
    expect(crowdedErrors.getError('options')).toEqual([
      'validate.delete.OptionGroup.options.maxCollection',
    ]);
  });

  it('NET-NEW — model/validation/OptionGroup.json:L2-L5 — there is NO declarative rule for sortOrder, so a group with sortOrder unset saves clean', async () => {
    const harness = createValidatorHarness();
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size' });

    // Nothing has assigned a sort order, and nothing in this file assigns one.
    expect(optionGroup.sortOrder).toBeUndefined();

    const errors = await harness.validateDryRun(optionGroup, optionGroupValidationRuleSet, 'save');

    /* Two requirement systems, and this assertion is about only one of them. */
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});
    expect(errors.getError('sortOrder')).toEqual([]);
    expect(errors.hasError('sortOrder')).toBe(false);
  });

  it('NET-NEW — model/validation/OptionGroup.json:L2-L5 — the entity satisfies the rule set subject contract directly, and findings accumulate into a bag the caller already owns', async () => {
    /*
     * The rule set is typed against `OptionGroupValidationSubject`, an intersection of the validator's
     * own subject contract, the uniqueness port's entity contract and the three properties the rules
     * read. The entity satisfies it with no cast — the binding below is the assertion, checked at
     * compile time, and it is what proves the domain class and the rule set were designed against one
     * another rather than bridged by a structural adapter at the call site.
     */
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'A B' });
    const subject: OptionGroupValidationSubject = optionGroup;

    expect(subject.getClassName()).toBe(OPTION_GROUP_CLASS_NAME);
    expect(subject.hasProperty('optionGroupCode')).toBe(true);

    /*
     * Mutating mode into a bag that already holds a finding, reported through the only member the
     * legacy error contract exposes for the purpose. This is the shape `BaseService.save` works in:
     * The entity's own bag travels with it, so a validator that replaced the bag — or dropped what was
     * already in it — would lose findings raised earlier in the same operation.
     */
    const errors = new ValidationError();
    errors.addError('optionGroupImage', 'preexisting.finding');

    const returned = await createValidatorHarness().validateInto(
      subject,
      optionGroupValidationRuleSet,
      'save',
      errors,
    );

    expect(returned).toBe(errors);

    // The earlier finding survives, the new one lands beside it, and every value is an array.
    expect(errors.getError('optionGroupImage')).toEqual(['preexisting.finding']);
    expect(errors.getError('optionGroupCode')).toEqual([
      'validate.save.OptionGroup.optionGroupCode.regex',
    ]);
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['optionGroupCode', 'optionGroupImage']);

    // A key nobody reported against still reads back as an empty array rather than raising.
    expect(errors.getError('optionGroupDescription')).toEqual([]);
    expect(errors.hasError('optionGroupDescription')).toBe(false);
  });
});

/*
 * NET-NEW — the one-to-many population branch, driven through this entity's REAL descriptor set.
 *
 * Why these cases exist, and why here. A qa run measured `src/domain/base/populate.ts` at 55.07 %
 * statements / 45.33 % branches with nine named functions never executed, because the only population
 * path any test drove was the many-to-one nested struct (via the legacy `issue_1097` regression). The
 * collection branches — branch 4 for a one-to-many or many-to-many ARRAY payload
 * [org/Hibachi/HibachiTransient.cfc:L272-L308] and branch 5 for a many-to-many DELIMITED LIST
 * [:L309-L359] — do string splitting and per-item identifier resolution, which is exactly where a
 * silent divergence hides. The same run measured `createOptionGroupPropertyDescriptors` as exported,
 * never executed and with no caller in `src/`.
 *
 * Both findings share one flow, so they are closed together: this factory is the slice's only
 * one-to-many descriptor source over an entity small enough to assert exhaustively, so driving
 * `populate()` through it exercises the engine branch AND the factory at once — a real contract rather
 * than a descriptor set assembled in the test to suit the assertion.
 */

describe('OptionGroup — NET-NEW — createOptionGroupPropertyDescriptors, the complete population contract', () => {
  /** A loader that answers from a fixed catalog and records every identifier it is asked for. */
  function optionCatalog(options: readonly Option[]): {
    readonly loader: RelatedEntityLoader<Option>;
    readonly loadExistingIds: string[];
    readonly loadOrCreateIds: string[];
    readonly created: Option[];
  } {
    const loadExistingIds: string[] = [];
    const loadOrCreateIds: string[] = [];
    const created: Option[] = [];
    const known = [...options];

    return {
      loadExistingIds,
      loadOrCreateIds,
      created,
      loader: {
        loadExisting: (relatedId: string): Option | undefined => {
          loadExistingIds.push(relatedId);
          return known.find((candidate) => candidate.optionID === relatedId);
        },
        loadOrCreate: (relatedId: string): Option => {
          loadOrCreateIds.push(relatedId);
          const existing = known.find((candidate) => candidate.optionID === relatedId);

          if (existing !== undefined) {
            return existing;
          }

          /* `loadOrCreate` is [:L239]'s `{1=id, 2=true}` — the createNew flag — so a miss mints one. */
          const minted = buildOption({ optionID: relatedId });
          known.push(minted);
          created.push(minted);
          return minted;
        },
      },
    };
  }

  /** Records every recursive sub-population the descriptor performed, in order. */
  function subPopulations(): {
    readonly populate: SubPropertyPopulator<Option>;
    readonly calls: { readonly optionID: string; readonly data: Record<string, unknown> }[];
  } {
    const calls: { readonly optionID: string; readonly data: Record<string, unknown> }[] = [];

    return {
      calls,
      populate: (option: Option, data: Record<string, unknown>): void => {
        calls.push({ optionID: option.optionID, data });
      },
    };
  }

  /** Population permitted, so a written property is observable rather than silently denied. */
  const permitPopulation = (): PopulationAuthorizationPort =>
    createPopulationAuthorizationDouble().populationAuthorization;

  it('NET-NEW — model/entity/OptionGroup.cfc:L70 — the set is the seven columns, the four audit descriptors and the one relationship', () => {
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const descriptors = createOptionGroupPropertyDescriptors(catalog.loader, sub.populate);

    /* Twelve, and the relationship is LAST — declaration order is preserved from the source. */
    expect(descriptors.properties).toHaveLength(
      OPTION_GROUP_PROPERTY_DESCRIPTORS.properties.length + 1,
    );
    expect(descriptors.properties.map((descriptor) => descriptor.name)).toStrictEqual([
      ...OPTION_GROUP_PROPERTY_DESCRIPTORS.properties.map((descriptor) => descriptor.name),
      'options',
    ]);

    /* The class name and the persistent flag travel from the component declaration, unchanged. */
    expect(descriptors.entityName).toBe(OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName);
    expect(descriptors.entityName).toBe(OPTION_GROUP_CLASS_NAME);
    expect(descriptors.persistent).toBe(true);
    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(descriptors.properties)).toBe(true);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L273-L279 — the relationship descriptor carries the legacy field type, singular name and related key', () => {
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const descriptors = createOptionGroupPropertyDescriptors(catalog.loader, sub.populate);
    const options = descriptors.properties.find((descriptor) => descriptor.name === 'options');

    expect(options).toBeDefined();
    /*
     * `singularName` is what the legacy composed its dynamic `add#singularName#` call from at [:L294],
     * so it is part of the contract rather than a label.
     */
    expect(options).toMatchObject({
      kind: 'one-to-many',
      name: 'options',
      relatedPrimaryIdPropertyName: 'optionID',
      singularName: 'option',
    });
  });

  it('NET-NEW — IR-1 — addRelated DELEGATES to the entity own addOption, wiring both sides', () => {
    /*
     * The descriptor must not re-implement the collection semantics. `addOption` delegates on to
     * `Option.setOptionGroup` [model/entity/OptionGroup.cfc:L92-L94], so a descriptor that pushed into
     * the array itself would leave the option's own back-reference unset.
     */
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });
    const option = buildOption({ optionID: PERSISTED_OPTION_ID });
    const catalog = optionCatalog([option]);
    const sub = subPopulations();
    const descriptors = createOptionGroupPropertyDescriptors(catalog.loader, sub.populate);
    const options = descriptors.properties.find((descriptor) => descriptor.name === 'options');

    /*
     * Narrowed through the descriptor union rather than asserted with a cast: a descriptor that had
     * become a column, or populate-disabled, fails this guard instead of failing an unrelated
     * expectation later.
     */
    if (options === undefined || !('kind' in options) || options.kind !== 'one-to-many') {
      throw new Error('the options descriptor must be present and one-to-many');
    }

    /*
     * The descriptor set's element type widens the related entity to `object`, because one set holds
     * descriptors for several relationships. `addRelated` is therefore called through the widened type,
     * which is exactly what the engine does.
     */
    const oneToMany: OneToManyPropertyDescriptor<OptionGroup, OptionGroupPropertyName, object> =
      options;

    oneToMany.addRelated(group, option);

    expect(group.getOptions()).toStrictEqual([option]);
    expect(option.optionGroup).toBe(group);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L282-L294 — an ARRAY payload adds every gated element, in payload order', () => {
    /*
     * Branch 4's forward loop. Each element must carry the related primary-ID key [:L285]; the entity is
     * then added UNCONDITIONALLY at [:L294], before the key-count test at [:L297]. That ordering looks
     * like an oversight and is preserved deliberately: moving the add inside the key-count test would
     * change which relationships exist after a pass.
     */
    const first = buildOption({ optionID: PERSISTED_OPTION_ID });
    const second = buildOption({ optionID: OTHER_PERSISTED_OPTION_ID });
    const catalog = optionCatalog([first, second]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    populate(
      group,
      {
        options: [{ optionID: OTHER_PERSISTED_OPTION_ID }, { optionID: PERSISTED_OPTION_ID }],
      },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    /* Payload order, not catalog order — the loop is forward and appends as it goes. */
    expect(group.getOptions()).toStrictEqual([second, first]);
    /* `loadOrCreate`, never `loadExisting`: branch 4 passes the createNew flag at [:L288]. */
    expect(catalog.loadOrCreateIds).toEqual([OTHER_PERSISTED_OPTION_ID, PERSISTED_OPTION_ID]);
    expect(catalog.loadExistingIds).toEqual([]);
    /* One key each, so no recursive population and nothing recorded. */
    expect(sub.calls).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L288 — an element whose identifier misses is CREATED, not skipped', () => {
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    populate(
      group,
      { options: [{ optionID: PERSISTED_OPTION_ID }] },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    expect(catalog.created.map((option) => option.optionID)).toEqual([PERSISTED_OPTION_ID]);
    expect(group.getOptions()).toHaveLength(1);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L297-L306 — an element with MORE than one key is recursively populated and RECORDED', () => {
    const option = buildOption({ optionID: PERSISTED_OPTION_ID });
    const catalog = optionCatalog([option]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    const result = populateWithSubProperties(
      group,
      {
        options: [
          { optionID: PERSISTED_OPTION_ID, optionName: 'Large' },
          { optionID: OTHER_PERSISTED_OPTION_ID },
        ],
      },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    /* Only the multi-key element is populated recursively, and it carries the WHOLE element struct. */
    expect(sub.calls).toEqual([
      {
        optionID: PERSISTED_OPTION_ID,
        data: { optionID: PERSISTED_OPTION_ID, optionName: 'Large' },
      },
    ]);

    /*
     * And the record is an ARRAY under the property name — the legacy accumulated one at [:L302-L305].
     * Both elements were ADDED; only the multi-key one is recorded.
     */
    expect(result.populatedSubProperties.options).toHaveLength(1);
    expect(group.getOptions()).toHaveLength(2);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L285 — an element with no related-ID key is SKIPPED entirely', () => {
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    const result = populateWithSubProperties(
      group,
      { options: [{ optionName: 'No identifier at all' }] },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    expect(catalog.loadOrCreateIds).toEqual([]);
    expect(group.getOptions()).toEqual([]);
    expect(result.populatedSubProperties.options).toBeUndefined();
  });

  it('NET-NEW — a NON-STRUCT element, and a non-scalar identifier, are both skipped rather than raising', () => {
    /*
     * A strict-typing consequence recorded rather than hidden: CFML's `structKeyExists` at [:L285] would
     * have failed outright on a non-struct element, and this module raises nothing, so such an element
     * matches no path and the branch does nothing to it.
     */
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    populate(
      group,
      { options: ['not a struct', 42, null, { optionID: { nested: true } }] },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    expect(catalog.loadOrCreateIds).toEqual([]);
    expect(group.getOptions()).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L285 — `populateSubProperties` is a payload-level KILL SWITCH for the whole branch', () => {
    /*
     * The second half of the [:L285] gate, and it is read out of the incoming payload rather than passed
     * as an argument — so a caller switches the collection branch off through the data itself. Every
     * falsy CFML spelling is exercised, because the flag arrives as whatever a request carried.
     */
    for (const flag of [false, 0, '0', 'false', 'FALSE', 'no', 'No', ' false ']) {
      const catalog = optionCatalog([]);
      const sub = subPopulations();
      const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

      populate(
        group,
        {
          options: [{ optionID: PERSISTED_OPTION_ID, optionName: 'Large' }],
          populateSubProperties: flag,
        },
        createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
        permitPopulation(),
      );

      expect(group.getOptions()).toEqual([]);
      expect(catalog.loadOrCreateIds).toEqual([]);
    }
  });

  it('NET-NEW — a TRUTHY `populateSubProperties`, in any CFML spelling, leaves the branch running', () => {
    for (const flag of [true, 1, '1', 'true', 'TRUE', 'yes', 'anything else at all']) {
      const catalog = optionCatalog([]);
      const sub = subPopulations();
      const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

      populate(
        group,
        { options: [{ optionID: PERSISTED_OPTION_ID }], populateSubProperties: flag },
        createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
        permitPopulation(),
      );

      expect(group.getOptions()).toHaveLength(1);
    }
  });

  it('NET-NEW — an absent `populateSubProperties` key defaults to ON, matching structKeyExists', () => {
    /*
     * The gate is `(!structKeyExists(data,"populateSubProperties") || data.populateSubProperties)`, so
     * absence is permission. Asserted separately from the truthy spellings because it takes the other
     * arm of the `||`.
     */
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    populate(
      group,
      { options: [{ optionID: PERSISTED_OPTION_ID }] },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    expect(group.getOptions()).toHaveLength(1);
  });

  it('NET-NEW — an EMPTY array payload runs the branch and records nothing, which is not the same as no key', () => {
    const catalog = optionCatalog([]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    const result = populateWithSubProperties(
      group,
      { options: [] },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    expect(group.getOptions()).toEqual([]);
    expect(result.populatedSubProperties.options).toBeUndefined();
    expect(catalog.loadOrCreateIds).toEqual([]);
  });

  it('NET-NEW — a one-to-many key carrying a SIMPLE value matches no branch at all, and is left alone', () => {
    /*
     * Branch 5's delimited-list form is many-to-many ONLY [:L310], so a delimited list against a
     * one-to-many property is not a diff instruction — it matches nothing and the collection is
     * untouched. This is the discrimination that makes branch 5's `isManyToManyDescriptor` gate
     * load-bearing rather than decorative.
     */
    const option = buildOption({ optionID: PERSISTED_OPTION_ID });
    const catalog = optionCatalog([option]);
    const sub = subPopulations();
    const group = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

    populate(
      group,
      { options: PERSISTED_OPTION_ID },
      createOptionGroupPropertyDescriptors(catalog.loader, sub.populate),
      permitPopulation(),
    );

    expect(group.getOptions()).toEqual([]);
    expect(catalog.loadOrCreateIds).toEqual([]);
    expect(catalog.loadExistingIds).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L200-L206 — an INTEGER column coerces numeric text, and refuses what CFML would refuse', () => {
    /*
     * `sortOrder` is the slice's integer column, and the coercion is a distinct branch from the string
     * and boolean ones: a numeric STRING is accepted and rendered as a number, a boolean is refused
     * because CFML would not have cast one into a numeric column, and a value beyond the exact-integer
     * range is refused rather than silently rounded to a different number than the caller sent.
     */
    const descriptors = createOptionGroupPropertyDescriptors(
      optionCatalog([]).loader,
      subPopulations().populate,
    );

    const accepted = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });
    populate(accepted, { sortOrder: ' 7 ' }, descriptors, permitPopulation());
    expect(accepted.sortOrder).toBe(7);

    const negative = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });
    populate(negative, { sortOrder: '-3' }, descriptors, permitPopulation());
    expect(negative.sortOrder).toBe(-3);

    const numeric = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });
    populate(numeric, { sortOrder: 12 }, descriptors, permitPopulation());
    expect(numeric.sortOrder).toBe(12);

    /* A blank clears the key outright — [:L195] runs before any conversion. */
    const cleared = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });
    cleared.sortOrder = 5;
    populate(cleared, { sortOrder: '   ' }, descriptors, permitPopulation());
    expect(cleared.sortOrder).toBeUndefined();

    for (const refused of ['1.5', 'seven', true, false, '9007199254740993']) {
      const subject = buildOptionGroup({ optionGroupID: PERSISTED_OPTION_GROUP_ID });

      expect(() => {
        populate(subject, { sortOrder: refused }, descriptors, permitPopulation());
      }).toThrow();
      expect(subject.sortOrder).toBeUndefined();
    }
  });
});
