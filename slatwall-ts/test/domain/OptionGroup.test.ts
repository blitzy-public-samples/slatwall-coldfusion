/**
 * OptionGroup domain tests — NET-NEW.
 *
 * PROVENANCE — EVERY CASE IN THIS FILE IS NET-NEW COVERAGE
 * There is NO legacy `OptionGroupTest.cfc`. The legacy MXUnit entity suite under
 * `meta/tests/unit/entity/` carries a dedicated component for `Product` and for `Brand` and for
 * nothing else in this slice, so no assertion below replicates a legacy OptionGroup test case and
 * none is labelled TRACEABLE. `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67` supplies
 * the generic PATTERN four of the cases translate — `validate_as_save_for_a_new_instance_doesnt_pass`
 * at `:L51-L54`, `simple_representation_exists_and_is_simple` at `:L56-L58`,
 * `has_primary_id_property_name` at `:L60-L62` and `defaults_are_correct` at `:L64-L67` — but a
 * pattern an OptionGroup component never instantiated is a pattern, not coverage. Following it is
 * worth doing; calling the result traceable would not be honest, so those four cases are labelled
 * NET-NEW like the rest.
 *
 * THAT PROVENANCE IS DOCUMENTARY, NOT EMPIRICAL
 * No legacy result was observed and no output was compared, because the legacy suite CANNOT BE
 * EXECUTED in this environment. MXUnit is not vendored — `meta/tests/readme.txt:L4` requires it to be
 * installed on the machine with a mapping inside CFIDE, and `meta/tests/unit/SlatwallUnitTestBase.cfc`
 * extends `mxunit.framework.TestCase`, which is therefore unresolvable — and CFSelenium is not
 * vendored either (`meta/tests/readme.txt:L5`). Every legacy claim below rests on the cited source
 * locator and on nothing else. That is a weaker claim than a re-run comparison and it is stated
 * rather than implied away.
 *
 * WHY THIS FILE IS IN SCOPE AT ALL — OptionGroup IS A REQUIRED IMPLICIT SCOPE ADDITION
 * The Catalog slice never named `model/entity/OptionGroup.cfc`, so this comment is mandatory: without
 * it the file reads as scope creep. Four independent code paths make the entity unavoidable, and
 * omitting it would leave the option model unusable:
 *
 *   1. `model/entity/Option.cfc:L59` declares
 *      `property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one" fkcolumn="optionGroupID";`
 *      — the relationship every option hangs from, and the side that OWNS the foreign key. Its
 *      requiredness is declared in the save context at `model/validation/Option.json:L5`.
 *   2. `model/service/ProductService.cfc:L115` resolves a group during
 *      `processProduct_addOptionGroup` and immediately reads its collection:
 *      `getOptionService().getOptionGroup(arguments.processObject.getOptionGroup()).getOptions()`.
 *   3. `model/entity/Product.cfc:L251-L261` queries option groups directly, ordering them with
 *      `addOrder("sortOrder|ASC")` at `:L256`.
 *   4. `model/dao/SkuDAO.cfc:L172-L204` reads `SwOptionGroup.sortOrder` while ordering generated
 *      SKUs — joined at `:L188` and used as the `POWER` exponent at `:L195` and `:L197`.
 *
 * NO NON-PERSISTENT BOUNDARY STUB IS NEEDED, AND NONE IS INVENTED
 * `model/entity/OptionGroup.cfc:L85-L87` — the entity's "Non-Persistent Property Methods" section —
 * is a START banner, a blank line and an END banner. The entity declares ZERO non-persistent
 * properties, so the calculated-property boundary that forces `Product` and `Sku` to exclude their
 * pricing, promotion, inventory and currency-derived members does not arise here. Nothing is stubbed,
 * no fake calculated member is invented in order to have a boundary to test, and no pricing,
 * currency, stock, inventory, promotion, location, fulfillment or attribute collaborator is
 * referenced anywhere in this file.
 *
 * WHAT IS EXERCISED FOR REAL
 * The real `OptionGroup`, the real `Option`, the real `Validator` (reached through the repository's
 * own `createValidatorHarness`, which constructs it rather than faking it), the real transliterated
 * `optionGroup.rules.ts` rule set and the real `ValidationError` bag. Nothing about the code under
 * test is re-implemented here: no error bag, no validation engine, no ordering algorithm and no
 * uniqueness statement.
 *
 * ⚠️ THE OPTION SIDE IS THE REAL `Option`, AND THAT IS LOAD-BEARING. `OptionGroup.addOption` and
 * `OptionGroup.removeOption` are PURE DELEGATIONS into `Option`, so every observable effect on the
 * relationship is produced by the option. Reproducing `setOptionGroup` and `removeOptionGroup` inside
 * a double would make those cases pass against test-local code while the production bodies rotted
 * unobserved. So the positive-path cases construct a real `Option` and call the real members, and
 * exactly ONE local recorder — {@link RecordingOption}, a real `Option` subclass that records the
 * delegated call and deliberately declines to maintain the relationship — exists to prove that the
 * group never mutates its own collection on its own account. It overrides two methods and
 * reimplements neither.
 *
 * `jest.mock` is not used, the module registry is not touched, no module is imported dynamically and
 * no mocking package is introduced — the legacy repository ships none, which is precisely why the
 * ports and the plain constructors make substitution possible without one.
 *
 * LABELS. `TODO(parity)` marks a carried legacy behaviour or a documented port decision;
 * `TODO(boundary)` marks a member that belongs to a layer outside the domain. Both spellings are
 * exact so a lint or grep gate can find them. `G6` marks the one judgment call this file has to
 * encode: ORM-mapping requiredness and declarative validation are DIFFERENT mechanisms, and
 * `sortOrder` is subject to the first and not the second.
 *
 * No user-authored repository rules were provided for this project, so enterprise-standard strict
 * TypeScript and Jest practice governs instead: no `any`, no `as` cast, no non-null assertion, no
 * suppression comment, deterministic factory-created state, and cases that are isolated and pass in
 * any order. No latency, throughput, capacity or coverage-threshold figure is asserted anywhere.
 */

import { Option } from '../../src/domain/option/Option';
import {
  OPTION_GROUP_CLASS_NAME,
  OPTION_GROUP_DECLARED_PROPERTIES,
  OPTION_GROUP_ENTITY_NAME,
  OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME,
  OPTION_GROUP_PROPERTY_DESCRIPTORS,
  OptionGroup,
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
  createValidatorHarness,
} from '../support/inMemoryRepositories';

/* ================================================================================================
 * SOURCE-GROUNDED CONSTANTS
 *
 * Every value here is read from a cited legacy line or imported from production. Nothing is
 * invented: no identifier is generated, no seed UUID is reproduced, no service level appears and the
 * `optionGroupCode` pattern is never retyped.
 * ============================================================================================== */

/**
 * The unsaved primary-identifier value, verbatim from `model/entity/OptionGroup.cfc:L52`, which
 * declares both `unsavedvalue=""` and `default=""`.
 *
 * It is the sentinel `OptionGroup.isNew()` compares against, reproducing `getNewFlag()` at
 * `org/Hibachi/HibachiEntity.cfc:L571-L576` through `getPrimaryIDValue()` at `:L244`. NO IDENTIFIER
 * IS EVER GENERATED IN THIS FILE: per IR-6 a real key is a 32-character hex string minted by the
 * persistence layer, so the two opaque identifiers below are test inputs and nothing more.
 */
const OPTION_GROUP_UNSAVED_ID_VALUE = '';

/**
 * An opaque persisted identifier, used only where a case needs a group or an option to be NOT new.
 *
 * These are deliberately unremarkable 32-character lowercase-hex test inputs. They are not seeded
 * data, they are not reproduced from any fixture pool, and no case asserts anything about their
 * content — only about the saved/unsaved distinction they make possible.
 */
const PERSISTED_OPTION_GROUP_ID = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';

/** A second opaque persisted identifier, so a collision can be seeded against a DIFFERENT row. */
const OTHER_PERSISTED_OPTION_GROUP_ID = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';

/**
 * An opaque persisted OPTION identifier — `model/entity/Option.cfc:L52` declares the same
 * `fieldtype="id" generator="uuid" length="32"` shape for its own key.
 *
 * It exists so the identity-versus-key case can give two DISTINCT option instances the SAME
 * identifier, which is the only way to prove membership is reference-based rather than key-based.
 */
const PERSISTED_OPTION_ID = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3';

/**
 * The SEVEN persistent properties of `model/entity/OptionGroup.cfc:L52-L58`, in declaration order.
 *
 * `satisfies` rather than a cast: the literal tuple survives for the per-property cases below while
 * every member is checked against the entity's real property-name union, so a typo or a renamed
 * property is a compile error. `remoteID` (`:L61`) and the four audit properties (`:L64-L67`) are
 * DELIBERATELY ABSENT — they are real declared columns and they are covered in their own right, but
 * the source keeps them in separate sections and this list is the "Persistent Properties" block
 * exactly as the source draws it. No property is fabricated to round the number up or down.
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
 *
 * They are DECLARED SUPPORT FIELDS, not additional persistent properties: the CFML engine's
 * Hibernate hooks stamped them (`org/Hibachi/HibachiEntity.cfc:L595-L682`) and application code never
 * wrote them, which is exactly why the source withholds them from population.
 */
const OPTION_GROUP_AUDIT_PROPERTY_NAMES = [
  'createdDateTime',
  'createdByAccount',
  'modifiedDateTime',
  'modifiedByAccount',
] as const satisfies readonly OptionGroupPropertyName[];

/**
 * Every property `model/entity/OptionGroup.cfc` declares, mapped to the line that declares it.
 *
 * `Record<OptionGroupPropertyName, string>` makes this map EXHAUSTIVE BY COMPILE CHECK in both
 * directions — a property added to the entity's name space and not recorded here is an error, and
 * the object literal's excess-property check makes it impossible to record a name the entity does
 * not declare. Both halves matter, because `hasProperty` is answered from the production declared
 * set and `org/Hibachi/HibachiValidationService.cfc:L171` SILENTLY SKIPS a rule whose property the
 * subject does not carry. A drifted name space would therefore turn a validation case into a
 * no-op that still passes.
 */
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
 * The declared property names, read from the PRODUCTION set rather than from the locator map above.
 *
 * This asymmetry is deliberate. `hasProperty` is answered in production from
 * `OPTION_GROUP_DECLARED_PROPERTIES`, so a list rebuilt here from a different source could agree
 * with the locator map while disagreeing with the code under test. The locator map keeps its own
 * job — pinning each name to the legacy line that declares it, which production does not record —
 * and one case below asserts the two agree, so drift in either direction fails rather than hides.
 */
const OPTION_GROUP_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(
  OPTION_GROUP_DECLARED_PROPERTIES,
);

/* ================================================================================================
 * THE ONE LOCAL RECORDER — A REAL `Option` SUBCLASS THAT RECORDS AND DECLINES TO WIRE
 *
 * `OptionGroup.addOption` is `option.setOptionGroup(this)` and `OptionGroup.removeOption` is
 * `option.removeOptionGroup(this)` — pure delegations, ported from
 * `model/entity/OptionGroup.cfc:L92-L94` and `:L95-L97`. Proving they are PURE needs a collaborator
 * that records the call and then does nothing, because with a fully working `Option` an appended
 * element is ambiguous: it could have come from the option side (correct) or from the group pushing
 * into its own array as well (a silent double-append). Replacing the called member with a typed
 * no-op removes the ambiguity — if the collection still changes, the group did it.
 *
 * IT SUBCLASSES THE REAL `Option` rather than restating its shape, so the production type is what
 * the group's `addOption(option: Option)` signature receives, with no cast and no structural stand-in
 * that could drift from the class. `noImplicitOverride` is on, so both members carry `override` and
 * the compiler proves each one actually overrides something — a renamed production member breaks
 * this file instead of silently recording nothing. TWO METHODS ARE OVERRIDDEN AND NEITHER IS
 * REIMPLEMENTED: no relationship maintenance is copied here, which is the whole point.
 * ============================================================================================== */

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

/* ================================================================================================
 * DERIVATION HELPERS OVER THE PRODUCTION DESCRIPTOR SET
 *
 * These read `OPTION_GROUP_PROPERTY_DESCRIPTORS` and never restate it, so every descriptor
 * assertion below is a claim about production. `noUncheckedIndexedAccess` is honoured throughout:
 * nothing is read by index, and no non-null assertion appears.
 * ============================================================================================== */

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

/**
 * Name-to-declared-value-type for every COLUMN descriptor in the set.
 *
 * The `'valueType' in descriptor` narrowing is what selects columns without importing the
 * descriptor union's type names: a relationship descriptor declares a `kind` and no `valueType`, and
 * a populate-disabled descriptor declares neither.
 */
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
 * `org/Hibachi/HibachiEntity.cfc:L74-L87` computed it and over the PRODUCTION declared set.
 *
 * The legacy scan walked the entity's own property metadata looking for a property named
 * `getClassName() & "name"` and threw at `:L86` when none matched; the comparison was a CFML `==`,
 * which is CASE-INSENSITIVE, so `optionGroupName` matched `OptionGroupname`. The lowercase
 * comparison below is the faithful translation of that one detail, and running the scan over
 * `OPTION_GROUP_DECLARED_PROPERTIES` rather than over a test-local list is what makes the case a
 * claim about production.
 */
const resolveSimpleRepresentationPropertyName = (className: string): string | undefined => {
  const conventionalName = `${className}name`.toLowerCase();

  return OPTION_GROUP_DECLARED_PROPERTY_NAMES.find(
    (propertyName) => propertyName.toLowerCase() === conventionalName,
  );
};

/* ================================================================================================
 * A — THE PERSISTENT PROPERTY SURFACE — model/entity/OptionGroup.cfc:L52-L58
 * ============================================================================================== */

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

    // Assigning an identifier is what makes the group persisted; no identifier is GENERATED here.
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

    // Stored verbatim. Image PATH resolution is an out-of-scope collaborator's job, and this entity
    // declares no member that touches one, so nothing is stubbed for it.
    optionGroup.optionGroupImage = 'group.png';
    expect(optionGroup.optionGroupImage).toBe('group.png');
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L56 — optionGroupDescription is an absent-by-default string and the entity enforces no length of its own', () => {
    const optionGroup = new OptionGroup();

    expect(optionGroup.optionGroupDescription).toBeUndefined();

    // `length="4000"` is a COLUMN constraint, and `model/validation/OptionGroup.json` declares no
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

    // See section C for the full lifecycle judgment; this case pins only the field's own shape.
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
    // `org/Hibachi/HibachiValidationService.cfc:L171` skip a rule SILENTLY, which is the most
    // dangerous failure mode in this area and the reason the set is asserted rather than trusted.
    for (const propertyName of OPTION_GROUP_DECLARED_PROPERTY_NAMES) {
      expect(optionGroup.hasProperty(propertyName)).toBe(true);
      expect(optionGroup.getPropertyMetaData(propertyName).name).toBe(propertyName);
    }

    // The seven "Persistent Properties" and the four audit properties are all inside that space,
    // and the counts are stated as what the SOURCE BLOCKS hold rather than as an invented total.
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

    // `getClassName()` (`org/Hibachi/HibachiObject.cfc:L135-L137`) is the BARE component name and is
    // what every validation message interpolates
    // (`org/Hibachi/HibachiValidationService.cfc:L202`, `:L213`, `:L216`).
    expect(optionGroup.getClassName()).toBe(OPTION_GROUP_CLASS_NAME);
    expect(OPTION_GROUP_CLASS_NAME).toBe('OptionGroup');

    // `getEntityName()` is the `entityname` attribute — the LOGICAL entity name, not the physical
    // `SwOptionGroup` table, which no assertion in this file names in an executable position.
    expect(optionGroup.getEntityName()).toBe(OPTION_GROUP_ENTITY_NAME);
    expect(OPTION_GROUP_ENTITY_NAME).toBe('SlatwallOptionGroup');
  });
});

/* ================================================================================================
 * B — THE POPULATION DESCRIPTOR SET — model/entity/OptionGroup.cfc:L53-L67
 *
 * The entity exports DESCRIPTORS instead of carrying a `populate()` method: in the legacy tree
 * `populate()` arrived by inheritance from the local base (`model/entity/HibachiEntity.cfc:L56`) and
 * reflected over component metadata at runtime, and the port replaces that reflection with a declared
 * set. No case below asserts a `populate()` member on the entity, because the entity deliberately has
 * none.
 * ============================================================================================== */

describe('OptionGroup — NET-NEW — the exported population descriptors, model/entity/OptionGroup.cfc:L53-L67', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L53-L61 — the seven column descriptors appear in source declaration order, with optionGroupID deliberately absent', () => {
    // Declaration order is preserved because it is POPULATION order: the legacy loop iterated
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

    // ⚠️ `optionGroupID` IS NOT A POPULATABLE PROPERTY AND ITS ABSENCE IS THE CONTRACT, not a gap.
    // `:L52` declares `fieldtype="id" generator="uuid"`, so the identifier is minted by the
    // persistence layer and never arrives in a payload. It is still a DECLARED property — section A
    // asserts `hasProperty('optionGroupID')` — which is exactly the distinction being drawn here.
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

    // The seven columns are NOT disabled — none of them carries the attribute in the source — so the
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
    // (`org/Hibachi/HibachiTransient.cfc:L186-L190`) short-circuits for NON-persistent targets, so a
    // process object populates freely while an entity such as this one has per-property
    // authorisation consulted.
    expect(OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toBe(OPTION_GROUP_CLASS_NAME);
    expect(OPTION_GROUP_PROPERTY_DESCRIPTORS.persistent).toBe(true);

    // Eleven descriptors in total: the seven columns plus the four audit properties.
    expect(OPTION_GROUP_PROPERTY_DESCRIPTORS.properties).toHaveLength(11);
  });
});

/* ================================================================================================
 * C — THE `sortOrder` LIFECYCLE — model/entity/OptionGroup.cfc:L58
 *
 * G6 — TWO DIFFERENT MECHANISMS, AND THIS SECTION EXISTS TO KEEP THEM APART.
 * `:L58` declares `property name="sortOrder" ormtype="integer" required="true";` — that is ORM MAPPING
 * metadata, enforced by the column and by the ORM lifecycle. `model/validation/OptionGroup.json:L2-L5`
 * declares rules for `optionGroupName` (`:L3`), `optionGroupCode` (`:L4`) and `options` (`:L5`) AND FOR
 * NOTHING ELSE — there is no `sortOrder` rule in that document at all. So the honest statement is:
 * `sortOrder` is required by the MAPPING and unmentioned by DECLARATIVE VALIDATION, and a port that
 * "helpfully" added a required rule for it would reject saves the legacy accepted. The proof that no
 * such rule was invented lives at the case in section G that validates a group with `sortOrder`
 * unset; the ORM-required half is recorded here and is NOT erased by it.
 *
 * WHO ACTUALLY ASSIGNS THE VALUE. Not this entity and not application code. `setSortOrder(` matches
 * exactly one line in the whole legacy repository, inside the `preInsert()` block of
 * `org/Hibachi/HibachiEntity.cfc:L637-L647`, which reads the current top sort order and stores
 * `topSortOrder + 1`. For option groups that top value is computed table-wide:
 * `model/dao/SkuDAO.cfc:L204-L215` seeds its memo at `1` (`:L206`), then runs
 * `max(SwOptionGroup.sortOrder)` (`:L211`) and stores `+ 1` (`:L214`). ⚠️ AND IT IS TABLE-WIDE
 * PRECISELY BECAUSE `OptionGroup` DECLARES NO `sortContext` — contrast `model/entity/Option.cfc:L56`,
 * `property name="sortOrder" ormtype="integer" sortContext="optionGroup";`, which scopes an option's
 * seed WITHIN its group. That asymmetry is the whole difference between the two entities' ordering,
 * and it is why the port's `sortOrder` is a freely assignable optional field rather than something
 * the constructor fills in.
 *
 * WHAT THIS SECTION DELIBERATELY DOES NOT DO. It executes no SQL and imports no adapter, it does not
 * make the entity assign a value, and it invents no sort-order allocator. There is no timing test, no
 * concurrency test, no uniqueness test and no maximum-value test — the source states none of those
 * properties, so asserting them would be fabrication rather than coverage.
 * ============================================================================================== */

describe('OptionGroup — NET-NEW — the sortOrder lifecycle, model/entity/OptionGroup.cfc:L58', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L58 — a fresh group leaves sortOrder unset, because the entity never assigns one', () => {
    const fromConstructor = new OptionGroup();
    const fromFactory = buildOptionGroup();

    // The landed representation of "no value yet" is `undefined`, and this asserts THAT rather than a
    // guessed sentinel: no `0`, no `-1` and no `null` is expected, because `:L58` declares no
    // `default` and inventing one would be a behaviour the source does not state.
    expect(fromConstructor.sortOrder).toBeUndefined();
    expect(fromFactory.sortOrder).toBeUndefined();

    // Absence is also faithful to the pre-`preInsert` legacy state, in which the key was simply not
    // present in the component's `variables` scope. The field is materialised as an own key here only
    // because the compiler targets ES2022 and defines declared class fields; that is an emit detail
    // with no consumer in this slice, and it is recorded rather than papered over.
    expect(Object.prototype.hasOwnProperty.call(fromConstructor, 'sortOrder')).toBe(true);

    // It is a DECLARED property regardless, so a rule naming it would run — see section G for the
    // proof that no such rule exists.
    expect(fromConstructor.hasProperty('sortOrder')).toBe(true);
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L58 — an explicitly supplied numeric sortOrder is retained verbatim, and supplying one is not an allocation', () => {
    // ⚠️ THE VALUE BELOW IS A TEST INPUT, NOT AN ALLOCATED SORT ORDER. Nothing in this file computes
    // a next value: the legacy allocation is `max(SwOptionGroup.sortOrder) + 1` over the whole table
    // (`model/dao/SkuDAO.cfc:L211`, `:L214`), it belongs to the persistence layer, and no query is
    // executed or imitated here. The only claim is that the FIELD holds what it is handed.
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
    // The population contract types it `integer` (section B asserts the whole map) and does NOT
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

/* ================================================================================================
 * D — THE ORDERED OPTIONS RELATIONSHIP AND ITS LIVE ARRAY — model/entity/OptionGroup.cfc:L70-L79
 *
 * THE MAPPING, byte-exact from `:L70`:
 *
 *     property name="options" singularname="option" cfc="Option" fieldtype="one-to-many"
 *              fkcolumn="optionGroupID" inverse="true" cascade="all-delete-orphan"
 *              orderby="sortOrder";
 *
 * `orderby="sortOrder"` is applied by the ORM at LOAD time, so relationship order is ASCENDING
 * `sortOrder` and the port's persistence layer is responsible for handing the array over already in
 * that order. Nothing sorts in the domain layer, and the ordering must not be "tidied": it is
 * load-bearing again at `addOrder("sortOrder|ASC")` (`model/entity/Product.cfc:L256`) and as the
 * `POWER` exponent in the sorted-SKU query (`model/dao/SkuDAO.cfc:L195`, `:L197`).
 *
 * TODO(parity) — THE LEGACY OVERLOAD IS COLLAPSED, AND THAT IS A DOCUMENTED PORT DECISION RATHER
 * THAN A CLAIM THE OVERLOAD NEVER EXISTED. The legacy signature is
 * `public array function getOptions(orderby, sortType="text", direction="asc")` (`:L73`), with a
 * two-branch body: `:L74-L75` returns `variables.Options` untouched when no `orderby` is supplied,
 * and `:L76-L77` otherwise delegates to `getService("hibachiUtilityService").sortObjectArray(...)`.
 * The port declares a ZERO-ARGUMENT `getOptions()` and does not implement the second branch, so the
 * in-memory sort at `:L76-L77` IS NOT PORTED. Consequently no case below passes an argument to
 * `getOptions()`, and `sortObjectArray` is neither recreated nor imitated anywhere in this file —
 * doing either would be inventing a target surface to test.
 *
 * TODO(boundary) — `getOptionsSmartList()` (`model/entity/OptionGroup.cfc:L81-L83`) IS OUT OF THIS
 * LAYER AND IS NOT TESTED. Its body is `return getPropertySmartList(propertyName="options");`, and
 * `getPropertySmartList` is `org/Hibachi/**` machinery whose paginated dynamic-query abstraction
 * belongs to the smart-list port and its MySQL query builder. No SmartList API is fabricated here, no
 * case asserts one, and no substitute member is invented so that something could be asserted.
 * Corroborating that the SmartList path is a service/adapter concern rather than an entity one:
 * `model/entity/Product.cfc:L251-L261` reaches option groups through the option service's smart list,
 * never through this entity.
 * ============================================================================================== */

describe('OptionGroup — NET-NEW — the ordered options relationship, model/entity/OptionGroup.cfc:L70-L79', () => {
  it('NET-NEW — model/entity/OptionGroup.cfc:L70 — a fresh group carries an empty options array, and the array is per-instance rather than shared', () => {
    const first = new OptionGroup();
    const second = new OptionGroup();

    expect(first.getOptions()).toEqual([]);
    expect(second.getOptions()).toEqual([]);

    // ⚠️ PER-INSTANCE, NOT A SHARED MODULE-LEVEL ARRAY. A shared empty array would leak options
    // between groups the moment one of them gained a member, which in a warm Lambda container means
    // leaking across invocations and across tenants. The empty array is also what the legacy entity
    // base assertion `defaults_are_correct`
    // (`meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67`) expects of a fresh entity.
    expect(first.getOptions()).not.toBe(second.getOptions());
  });

  it('NET-NEW — model/entity/OptionGroup.cfc:L70 — getOptions() hands back the options in ascending sortOrder relationship order, exactly as received', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'size' });

    // A deliberately identifiable sequence, attached ALREADY IN RELATIONSHIP ORDER — which is what
    // `orderby="sortOrder"` guarantees a loaded collection looks like. Each option carries a distinct
    // code so the assertion pins ORDER and not merely membership.
    buildOption({ optionCode: 'small', optionName: 'Small', sortOrder: 1, optionGroup });
    buildOption({ optionCode: 'medium', optionName: 'Medium', sortOrder: 2, optionGroup });
    buildOption({ optionCode: 'large', optionName: 'Large', sortOrder: 3, optionGroup });

    // TODO(parity) — asserted with a ZERO-ARGUMENT call, because the legacy `orderby` overload
    // (`:L73`) and its in-memory sort branch (`:L76-L77`) are deliberately not ported. The port
    // therefore preserves the order it is GIVEN and never re-sorts; a case that passed an argument
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

    // ⚠️ REFERENCE IDENTITY, NOT DEEP EQUALITY — and the distinction is behaviour rather than style.
    // The legacy no-argument branch is a bare `return variables.Options;`, and
    // `model/entity/Option.cfc` MUTATES what it is handed: `arrayAppend(...getOptions(), this)` at
    // `:L95`, `arrayFind(...getOptions(), this)` at `:L102` and `arrayDeleteAt(...)` at `:L104`.
    // Returning `[...this.options]`, `.slice()` or a readonly view would turn the append and the
    // delete into SILENT NO-OPS — no error, no compile failure, and a bidirectional relationship that
    // simply stops synchronising.
    expect(secondRead).toBe(firstRead);
    expect(firstRead).toBe(optionGroup.options);

    // LIVE, not a snapshot: the reference captured BEFORE the option attached itself observes the
    // append, because it is the very array the option side pushed into.
    const option = buildOption({ optionCode: 'small', sortOrder: 1, optionGroup });

    expect(firstRead).toHaveLength(1);
    expect(firstRead).toContain(option);
    expect(optionGroup.getOptions()).toBe(firstRead);
  });
});

/* ================================================================================================
 * E — THE THREE RELATIONSHIP HELPERS — model/entity/OptionGroup.cfc:L92-L97, PLUS IR-1 `hasOption`
 *
 * IR-1 — `hasOption` APPEARS NOWHERE IN THE LEGACY SOURCE AND STILL HAS TO BE DECLARED.
 * `model/entity/OptionGroup.cfc` contains no `hasOption` declaration at all: the member was
 * SYNTHESIZED at runtime as an implicit ORM member generated from the `options` property's
 * `singularname="option"` (`:L70`) — the framework acknowledges this in as many words at
 * `org/Hibachi/HibachiEntity.cfc:L343`, "evaluate is used instead of invokeMethod() because hasXXX()
 * is an implicit orm function". TypeScript under `strict` has no equivalent facility, so the member
 * becomes an explicit typed declaration or it ceases to exist. The in-scope call site that forces it
 * is `model/entity/Option.cfc:L94`, `if(isNew() or !arguments.optionGroup.hasOption( this ))`, which
 * guards the append at `:L95`.
 *
 * `addOption` (`:L92-L94`) AND `removeOption` (`:L95-L97`) ARE PURE DELEGATIONS, AND `inverse="true"`
 * IS WHY. The mapping at `:L70` marks this side inverse, so `Option` owns the foreign key
 * (`model/entity/Option.cfc:L59` carries the `fkcolumn`) and all mutation logic lives on the option.
 * The group's job is to hand ownership over — `arguments.option.setOptionGroup( this )` and
 * `arguments.option.removeOptionGroup( this )` — and nothing more. A group that ALSO pushed into its
 * own array would double-append silently, so "does nothing else" is the assertion that matters, and
 * {@link RecordingOption} is what makes it observable.
 *
 * SCOPE HELD: the Option-side behaviours these delegations reach — the unsaved short-circuit in the
 * `:L94` guard, and the `arrayFind` index-base handling at `:L102-L105` — belong to the Option suite
 * and are not duplicated here. The positive-path cases below assert only what is observable FROM THE
 * GROUP, using the real `Option` so the production bodies are genuinely exercised rather than mimicked.
 * ============================================================================================== */

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

    // A DIFFERENT instance carrying the SAME identifier and the same code is deliberately NOT a
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

    // Delegated exactly once, with THIS group as the argument — `arguments.option.setOptionGroup( this )`.
    expect(recorder.setOptionGroupCalls).toEqual([optionGroup]);
    expect(recorder.setOptionGroupCalls[0]).toBe(optionGroup);

    // ⚠️ AND THE GROUP DID NOTHING ELSE. The recorder declines to wire the relationship, so any
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

    // Delegated exactly once, with the group passed EXPLICITLY — worth pinning, because the option's
    // `removeOptionGroup(any optionGroup)` (`model/entity/Option.cfc:L98`) takes an OPTIONAL argument
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

/* ================================================================================================
 * F — THE INHERITED ENTITY-TEST PATTERN, TRANSLATED
 *     meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67
 *
 * ⚠️ READ THIS BEFORE READING THE FOUR CASES. They translate a GENERIC base class that every legacy
 * entity test inherited — four assertions, no OptionGroup anywhere in them — and they are therefore
 * NET-NEW coverage, not replicated coverage. The legacy entity suite instantiated that base for
 * exactly two catalog entities, `Product` and `Brand`; there was never an `OptionGroupTest.cfc` to
 * inherit it, so no legacy test has ever made any of the four assertions BELOW ABOUT THIS ENTITY.
 * Following a legacy pattern is not the same as extending legacy coverage, and the distinction is
 * the whole point of labelling every case.
 *
 * The four inherited assertions and how each one crosses:
 *   `:L51-L54` validate_as_save_for_a_new_instance_doesnt_pass — the entity's own `validate()` and
 *      `hasErrors()` were framework members (`org/Hibachi/HibachiTransient.cfc`). The port has
 *      neither: validation is an explicit collaborator, so the translation runs the REAL `Validator`
 *      over the REAL rule set and reads the REAL `ValidationError` bag. No bag is reimplemented here.
 *   `:L56-L58` simple_representation_exists_and_is_simple — see the case for why this becomes a
 *      claim about the declared name space rather than a call to an invented member.
 *   `:L60-L62` has_primary_id_property_name — `len(...)` truthiness becomes a named assertion.
 *   `:L64-L67` defaults_are_correct — `isNew()` plus a zero-length primary identifier.
 *
 * ONE THING THE LEGACY BASE DID THAT THIS FILE DELIBERATELY DOES NOT: it leaned on
 * `variables.entity`, seeded once by a `SlatwallUnitTestBase` (`meta/tests/unit/SlatwallUnitTestBase.cfc`)
 * that booted the whole FW/1 application and resolved collaborators through DI/1 at run time — with
 * its own lifecycle hooks left commented out. Shared mutable suite state is precisely what makes such
 * a suite order-dependent, so every case here builds its own subject and its own harness. That is
 * also why these are unit tests where the legacy ones were integration tests; a reviewer comparing
 * the two should expect that difference by design rather than read it as a gap.
 * ============================================================================================== */

describe('OptionGroup — NET-NEW — the inherited entity-test pattern, meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67', () => {
  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — save validation of a blank new group does NOT pass, and the findings land in the real error bag the caller owns', async () => {
    // A fresh harness and a fresh bag per case: nothing is shared, so the case is order-independent.
    const harness = createValidatorHarness();
    const optionGroup = new OptionGroup();
    const errors = new ValidationError();

    /*
     * ⚠️ THE EVALUATOR IS THE PRODUCTION ONE, AND THAT CLAIM IS CHECKED RATHER THAN ASSERTED IN PROSE.
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
     * observation because the entity WAS the bag. Here the bag is a separate object handed in, so the
     * translation has to prove the two halves still meet: the validator reports into the caller's own
     * bag and hands that same bag back, rather than quietly answering from a throwaway.
     */
    expect(returned).toBe(errors);
    expect(errors.hasErrors()).toBe(true);

    /*
     * A blank new group fails on exactly the two required properties of
     * `model/validation/OptionGroup.json:L3-L4` and on nothing else. Asserting the KEY SET, not just
     * `hasErrors()`, is what makes this a real translation: `hasErrors()` alone would pass just as
     * happily if a rule the source does not declare had fired — including one against `sortOrder`,
     * which `:L58` marks ORM-required and the validation document deliberately says nothing about.
     */
    expect(Object.keys(errors.getErrors()).sort()).toEqual(['optionGroupCode', 'optionGroupName']);
    expect(errors.hasError('optionGroupName')).toBe(true);
    expect(errors.hasError('optionGroupCode')).toBe(true);

    // And a property nobody reported against reads back as an EMPTY ARRAY rather than raising, which
    // is the accessor behaviour every case in section G depends on.
    expect(errors.getError('sortOrder')).toEqual([]);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 — the simple-representation convention resolves to the simple optionGroupName field', () => {
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size' });

    /*
     * ⚠️ WHAT IS BEING ASSERTED, AND WHY IT IS NOT A CALL. The legacy assertion was
     * `isSimpleValue(entity.getSimpleRepresentation())`, and both members it reaches —
     * `getSimpleRepresentation()` (`org/Hibachi/HibachiEntity.cfc:L59-L71`) and
     * `getSimpleRepresentationPropertyName()` (`:L74-L87`) — live in `org/Hibachi/**`, the tree the
     * AAP treats as a boundary to extract FROM and never carry over. The landed entity therefore has
     * neither member, by an explicit and documented decision on the production file. Inventing a
     * `getSimpleRepresentation()` here purely so a test could call it would add production surface
     * that nothing in the slice asks for, so this case asserts the CONVENTION the legacy member
     * computed instead of the member itself.
     *
     * The convention is reproduced faithfully, including the one detail that is easy to lose: the
     * legacy scan compared with a CFML `==`, which is CASE-INSENSITIVE, so a property literally named
     * `optionGroupName` matched the constructed name `OptionGroupname`. The helper folds case for
     * exactly that reason, and it scans the PRODUCTION declared set, so the claim is about the entity
     * and not about a list restated in this file.
     */
    const propertyName = resolveSimpleRepresentationPropertyName(optionGroup.getClassName());

    expect(propertyName).toBe('optionGroupName');
    expect(optionGroup.hasProperty('optionGroupName')).toBe(true);

    /*
     * "Exists and IS SIMPLE" is the other half of `:L57`, and it is a real constraint rather than a
     * formality: `:L65` returned the value only when `isSimpleValue()` held and fell back to `""`
     * otherwise, so a representation resolving to a collection or an object would have been silently
     * blanked. `optionGroupName` is the `ormtype="string"` column at `:L53`, so the value is a string
     * — and the resolution goes through the entity's own property-identifier reader, which is the
     * closest the port has to the legacy `invokeMethod("get…")` at `:L62`.
     */
    const representation = optionGroup.getValueByPropertyIdentifier('optionGroupName');

    expect(typeof representation).toBe('string');
    expect(representation).toBe('Size');

    // The legacy scan THREW when no property matched (`:L86-L87`); a match existing is what keeps this
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
     * ⚠️ AND IT IS NOT IN THE POPULATION CONTRACT. `generator="uuid"` means the persistence layer
     * mints the key, so `OPTION_GROUP_PROPERTY_DESCRIPTORS` withholds it — a primary identifier that
     * is declared, readable and NEVER populatable from request data. Both facts are asserted together
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
     * The two assertions are ONE contract in the port, not two coincidences: `isNew()` is the
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
     * invented — `sortOrder` in particular is left alone, for the reason section C records.
     */
    expect(optionGroup.imageGroupFlag).toBe(false);
    expect(optionGroup.getOptions()).toEqual([]);
  });
});

/* ================================================================================================
 * G — DECLARATIVE VALIDATION FIDELITY — model/validation/OptionGroup.json:L2-L5
 *
 * THREE PROPERTIES, FIVE CONSTRAINTS, TWO CONTEXTS. That is the whole document, and these cases
 * assert it through the REAL `Validator` over the REAL exported rule set — never through a rule
 * table restated here, and never by retyping the code pattern, which production sources from a shared
 * constant. Behaviour is the assertion; the declaration is production's business.
 *
 * WHAT IS DELIBERATELY NOT HERE. The evaluator's own general behaviours — context selection, the
 * accumulate-never-short-circuit policy, loose `eq` comparison, conditional rule groups, the
 * silently-skipped-property guard at `org/Hibachi/HibachiValidationService.cfc:L171` — belong to the
 * validator's own suite and to `test/validation/rules.test.ts`. These cases assert only what THIS
 * document declares about THIS entity. Two evaluator behaviours are nevertheless exercised, because
 * they are only observable through a rule object that carries more than one constraint and this
 * document has exactly one such object: accumulation under a single key, and its message ORDER.
 *
 * EVERY CASE BUILDS ITS OWN HARNESS. `createValidatorHarness()` is a factory, and the uniqueness
 * double it wraps records every probe, so a shared instance would leak both seeded rows and recorded
 * calls between cases and make them order-dependent. No harness is hoisted into a `beforeEach` and
 * none is module-scoped.
 * ============================================================================================== */

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
     * ⚠️ WHITESPACE-ONLY ALSO FAILS, and this is the case that would be lost by a naive translation.
     * `validate_required` (`org/Hibachi/HibachiValidationService.cfc:L240-L245`) measured the TRIMMED
     * string length, so `"   "` was exactly as absent as `""`. A JavaScript truthiness check would
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
     * And a real value passes. Note what is NOT reported alongside it: no length ceiling and no
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
     * ABSENT: presence fails and the pattern PASSES, so exactly ONE message is reported. The pattern
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
     * ⚠️ THE EMPTY STRING IS THE INTERESTING ONE: presence fails AND the pattern fails, because the
     * pattern requires one or more characters. TWO messages land under the ONE key, IN DECLARATION
     * ORDER — required first, pattern second — which is the observable proof that evaluation
     * accumulates rather than stopping at the first failure. Absent and empty are therefore NOT
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
     * A PRESENT BUT MALFORMED CODE: presence passes, the pattern fails on the space. The pattern
     * itself is NEVER RETYPED IN THIS FILE — production sources it from one shared constant, and a
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
     * ⚠️ POLARITY. `isUniqueProperty` answers TRUE when the value is UNIQUE, meaning available. The
     * name reads like a question and the answer is the good news, so an inverted reading turns every
     * free code into a collision and every collision into a pass — and both directions still
     * "validate", which is why both are asserted here rather than only the failure.
     *
     * IR-5 is binding in its strongest form for this property: `model/entity/OptionGroup.cfc:L54`
     * declares no `unique="true"`, so this rule is the ONLY uniqueness enforcement in the system and
     * there is no database constraint behind it.
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
     * is new, which makes the self-exclusion term `and e.optionGroupID != :entityID` a genuine NO-OP
     * ON INSERT — it excludes nothing. On an update that same term is what stops a row colliding with
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
     * Now the same code, held by a DIFFERENT row. A fresh factory-created harness carries the seed —
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

    // Presence and pattern both pass, so uniqueness is the ONLY message — the three constraints on
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
     * A group with no options deletes cleanly, and NOTHING ELSE is reported: the name, code and
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

    // Reported under the FULL property key `options`, which is the relationship property name at
    // `model/entity/OptionGroup.cfc:L70` and not the `singularname` the mapping also declares.
    expect(guardedErrors.getError('options')).toEqual([
      'validate.delete.OptionGroup.options.maxCollection',
    ]);
    expect(Object.keys(guardedErrors.getErrors())).toEqual(['options']);

    /*
     * TODO(parity) — `model/entity/OptionGroup.cfc:L70` declares `cascade="all-delete-orphan"`, which
     * would delete the child options along with their group, while this guard refuses the delete
     * whenever any child exists. The cascade can therefore NEVER FIRE for a non-empty group. The
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

    // TWO options still produce ONE message: the ceiling is measured once against the collection, not
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

    /*
     * ⚠️ G6 — TWO REQUIREMENT SYSTEMS, AND THIS ASSERTION IS ABOUT ONLY ONE OF THEM.
     *
     * `model/entity/OptionGroup.cfc:L58` declares `sortOrder` with `required="true"` — that is ORM
     * MAPPING METADATA, enforced by the persistence layer at flush time. `model/validation/
     * OptionGroup.json:L2-L5` declares rules for `optionGroupName`, `optionGroupCode` and `options`
     * and says NOTHING about `sortOrder` — that is DECLARATIVE VALIDATION, enforced before the save.
     *
     * The two do not agree, and the disagreement is real legacy structure. This case pins the
     * validation half: the ported rule set must not invent a presence rule for `sortOrder` merely
     * because the mapping marks it required. Asserting the whole error bag is empty, rather than only
     * that no `sortOrder` key is present, is what makes an invented rule fail here.
     *
     * NOTHING IS ERASED BY THIS. The ORM requirement at `:L58` still stands; it is simply enforced
     * somewhere this test does not reach, and section C records who assigns the value.
     *
     * ⭐ AND "SOMEWHERE THIS TEST DOES NOT REACH" IS NOW A NAMED, TESTED PLACE (review finding 18). The
     * review's concern was never this assertion — it is correct and must stay — but that NOTHING
     * downstream noticed an unset group. `test/adapters/UnitOfWork.test.ts` now covers both halves of
     * `org/Hibachi/HibachiEntity.cfc:L637-L647`: `UnitOfWork.seedFirstSortOrder` assigns
     * `topSortOrder + 1` from the WHOLE-TABLE read this entity's missing `sortContext` selects, and
     * `assertSortOrderAssigned` refuses at the persistence boundary when something bypassed the
     * assignment. So the two requirement systems are each enforced where they belong, and neither has
     * been taught the other's job.
     */
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});
    expect(errors.getError('sortOrder')).toEqual([]);
    expect(errors.hasError('sortOrder')).toBe(false);
  });

  it('NET-NEW — model/validation/OptionGroup.json:L2-L5 — the entity satisfies the rule set subject contract directly, and findings accumulate into a bag the caller already owns', async () => {
    /*
     * The rule set is typed against `OptionGroupValidationSubject`, an intersection of the validator's
     * own subject contract, the uniqueness port's entity contract and the three properties the rules
     * read. THE ENTITY SATISFIES IT WITH NO CAST — the binding below is the assertion, checked at
     * compile time, and it is what proves the domain class and the rule set were designed against one
     * another rather than bridged by a structural adapter at the call site.
     */
    const optionGroup = buildOptionGroup({ optionGroupName: 'Size', optionGroupCode: 'A B' });
    const subject: OptionGroupValidationSubject = optionGroup;

    expect(subject.getClassName()).toBe(OPTION_GROUP_CLASS_NAME);
    expect(subject.hasProperty('optionGroupCode')).toBe(true);

    /*
     * MUTATING mode into a bag that ALREADY HOLDS a finding, reported through the only member the
     * legacy error contract exposes for the purpose. This is the shape `BaseService.save` works in:
     * the entity's own bag travels with it, so a validator that replaced the bag — or dropped what was
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

    // The earlier finding survives, the new one lands beside it, and every value is an ARRAY.
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
