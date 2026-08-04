/**
 * OptionGroup — the `SwOptionGroup` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode
 * TypeScript.
 *
 * Ported from [model/entity/OptionGroup.cfc]. AAP §0.4.1.4 names seven persistent properties and
 * `getOptions()` with its sort-order ordering [:L73], and that row is the scope.
 *
 * Why this file EXISTS at all — it is an implicit scope addition (AAP §0.2.1.2). The prompt's Catalog
 * slice never named `OptionGroup.cfc`; four independent code paths made it unavoidable, and the AAP
 * concludes in as many words that "Omitting it would leave the option model unusable":
 * `Option.optionGroup` is a required many-to-one [model/entity/Option.cfc:L59];
 * `ProductService.processProduct_addOptionGroup` resolves a group through the option service and
 * immediately reads its collection [model/service/ProductService.cfc:L115];
 * `Product.getOptionGroups()` queries the entity directly [model/entity/Product.cfc:L251-L261]; and
 * the sorted-SKU ordering query reads `SwOptionGroup.sortOrder` [model/dao/SkuDAO.cfc:L172-L204].
 */

import {
  AUDIT_PROPERTY_NAMES,
  hasDeclaredProperty,
  readValueByPropertyIdentifier,
  requireDeclaredPropertyMetaData,
} from '../base/AuditableEntity';
import type {
  AuditPropertyName,
  AuditableEntity,
  DeclaredPropertyNameSet,
  EntityPropertyMetaData,
  ManagedEntity,
} from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  EntityMetadataDeclaration,
  DisabledPropertyDescriptor,
  OneToManyPropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
/* R-A — the mutual type reference with `./Option`, and why it is safe. */
import type { Option } from './Option';

/**
 * Every property name `model/entity/OptionGroup.cfc` declares — the union `populate` is keyed by.
 */
export type OptionGroupPropertyName =
  | 'optionGroupID'
  | 'optionGroupName'
  | 'optionGroupCode'
  | 'optionGroupImage'
  | 'optionGroupDescription'
  | 'imageGroupFlag'
  | 'sortOrder'
  | 'remoteID'
  | AuditPropertyName
  | 'options';

/*
 * The managed-entity constants — what only this entity can state
 * `src/domain/base/AuditableEntity.ts` holds the shared managed-entity contract and every word of
 * its rationale. Three facts cannot be shared because they differ per entity, and the legacy
 * resolved all three at runtime — two by reflecting over live component metadata and one through the
 * DI/1 service locator. TR-3 and AAP §0.7.3 replace all three with declarations.
 */

/**
 * The bare class name — the value [org/Hibachi/HibachiObject.cfc:L135-L137] derives by taking the
 * last dot-delimited segment of the component's fully qualified name.
 */
export const OPTION_GROUP_CLASS_NAME = 'OptionGroup';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/OptionGroup.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 */
export const OPTION_GROUP_ENTITY_NAME = 'SlatwallOptionGroup';

/**
 * The name of the primary identifier property — [model/entity/OptionGroup.cfc:L52], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 */
export const OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME = 'optionGroupID';

/**
 * Every property this entity declares, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 */
export const OPTION_GROUP_DECLARED_PROPERTIES: DeclaredPropertyNameSet<OptionGroupPropertyName> =
  Object.freeze({
    optionGroupID: true,
    optionGroupName: true,
    optionGroupCode: true,
    optionGroupImage: true,
    optionGroupDescription: true,
    imageGroupFlag: true,
    sortOrder: true,
    remoteID: true,
    options: true,
    createdDateTime: true,
    createdByAccount: true,
    modifiedDateTime: true,
    modifiedByAccount: true,
  });

/**
 * OptionGroup's frozen metadata declaration — what `manageEntity` reads to compose the seven
 * framework introspection members onto an instance.
 */
export const OPTION_GROUP_ENTITY_METADATA: EntityMetadataDeclaration<OptionGroupPropertyName> =
  Object.freeze({
    className: 'OptionGroup',
    entityName: 'SlatwallOptionGroup',
    primaryIDPropertyName: 'optionGroupID',
    properties: Object.freeze({
      optionGroupID: true,
      optionGroupName: true,
      optionGroupCode: true,
      optionGroupImage: true,
      optionGroupDescription: true,
      imageGroupFlag: true,
      sortOrder: true,
      remoteID: true,
      options: true,
      createdDateTime: true,
      createdByAccount: true,
      modifiedDateTime: true,
      modifiedByAccount: true,
    } satisfies Readonly<Record<OptionGroupPropertyName, true>>),
  } satisfies EntityMetadataDeclaration<OptionGroupPropertyName>);

/**
 * A group of mutually exclusive product options — the `SwOptionGroup` row and its option collection.
 */
export class OptionGroup implements AuditableEntity, ManagedEntity {
  /* persistent properties — [model/entity/OptionGroup.cfc:L52-L58] */

  /** The primary identifier. */
  optionGroupID: string = '';

  /** The group's display name — for example the "size" in a "size: large" SKU definition. */
  optionGroupName?: string;

  /** The group's stable code, used as a lookup key rather than for display. */
  optionGroupCode?: string;

  /** The group-level image reference. */
  optionGroupImage?: string;

  /** Long-form description of the group. */
  optionGroupDescription?: string;

  /** Whether this group drives image selection for its SKUs. */
  imageGroupFlag: boolean = false;

  /** The group's position in the option-group ordering. */
  sortOrder?: number;

  /* Remote properties — [model/entity/OptionGroup.cfc:L61] */

  /** The identifier this group carries in an external system. */
  remoteID?: string;

  /* Audit properties — [model/entity/OptionGroup.cfc:L64-L67] */

  /** When the row was first written. Port of [model/entity/OptionGroup.cfc:L64]. */
  createdDateTime?: Date;

  /**
   * Identifier of the administrative account that created the row — port of
   * [model/entity/OptionGroup.cfc:L65], declared there as
   * `cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   */
  createdByAccount?: string;

  /** When the row was last written. Port of [model/entity/OptionGroup.cfc:L66]. */
  modifiedDateTime?: Date;

  /**
   * Identifier of the administrative account that last wrote the row — port of
   * [model/entity/OptionGroup.cfc:L67], `fkcolumn="modifiedByAccountID"`. Typed as an identifier
   * string for the same reason as `createdByAccount`.
   */
  modifiedByAccount?: string;

  /* Related object properties — [model/entity/OptionGroup.cfc:L70] */

  /** The options belonging to this group. */
  options: Option[] = [];

  /* Bidirectional Helper methods — [model/entity/OptionGroup.cfc:L89-L99] */

  /**
   * Returns this group's options — the live array, by reference.
   *
   * @returns The live `options` array, mutable and by reference.
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * Whether the given option already belongs to this group.
   *
   * @param option - The option to look for.
   * @returns `true` when this exact option instance is already in the collection.
   */
  hasOption(option: Option): boolean {
    return this.options.includes(option);
  }

  /**
   * Adds an option to this group, by handing the option itself the owning side of the relationship.
   *
   * @param option - The option to attach to this group.
   */
  addOption(option: Option): void {
    option.setOptionGroup(this);
  }

  /**
   * Removes an option from this group, by having the option detach itself.
   *
   * @param option - The option to detach from this group.
   */
  removeOption(option: Option): void {
    option.removeOptionGroup(this);
  }

  /**
   * Whether this group has never been persisted.
   *
   * @returns `true` when the group has not been persisted yet.
   */
  isNew(): boolean {
    return this.optionGroupID === '';
  }

  /*
   * The managed-entity contract — [org/Hibachi/**], inherited in CFML, declared here (IR-1 / TR-3)
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain, and which `src/validation/Validator.ts` and
   * `src/ports/UniquePropertyPort.ts` both require by name. Neither contract can be satisfied by a
   * plain data class, which is why they are declared rather than assumed.
   */

  /**
   * `OptionGroup` — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of the
   * component's fully qualified name. Interpolated into every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216].
   *
   * @returns The bare class name.
   */
  getClassName(): string {
    return OPTION_GROUP_CLASS_NAME;
  }

  /**
   * `SlatwallOptionGroup` — [org/Hibachi/HibachiEntity.cfc:L287-L289]. Live metadata reflection is replaced by the
   * declared constant, per TR-3.
   *
   * @returns The mapped ORM entity name, not the physical table name.
   */
  getEntityName(): string {
    return OPTION_GROUP_ENTITY_NAME;
  }

  /**
   * `optionGroupID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP §0.7.3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's value — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.optionGroupID;
  }

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(OPTION_GROUP_DECLARED_PROPERTIES, propertyIdentifier);
  }

  /**
   * Resolves a declared property's metadata, raising for an undeclared name —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747], whose present-key branch is at [:L741-L743] and
   * whose throw is at [:L746]. The non-optional return type is faithful to that declaration.
   *
   * @param propertyName - The name to resolve.
   * @returns The metadata for that property.
   * @throws DomainError - When no property of that name is declared. Withheld from every response
   * by the deny-by-default presentation, because it signals a fault in the port rather than
   * anything a caller can provoke.
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData {
    return requireDeclaredPropertyMetaData(
      OPTION_GROUP_DECLARED_PROPERTIES,
      propertyName,
      OPTION_GROUP_CLASS_NAME,
    );
  }

  /**
   * Reads a value by property identifier, walking a path delimited by either `.` or `_` —
   * [org/Hibachi/HibachiTransient.cfc:L466-L481]. An unresolvable path yields `''`, never an absent
   * value; `readValueByPropertyIdentifier` documents all four traversal rules and why each is
   * behaviour rather than convenience.
   *
   * @param propertyIdentifier - A property name, or a delimited path.
   * @returns The resolved value, or `''`.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown {
    return readValueByPropertyIdentifier(this, propertyIdentifier);
  }
}

/*
 * R-B — the population contract: A declared descriptor set, and no `populate` method
 * `optionGroup` has no `populate` member, deliberately. In the legacy tree the method arrived by
 * inheritance from the local base [model/entity/HibachiEntity.cfc:L56] and reflected over component
 * metadata at runtime. Two independent reasons it is not re-created here: §0.3.3 replaces
 * template-method inheritance with composition, so there is no base class to inherit it from; and
 * `../base/populate` declares its contract as a free function taking a `descriptorSet` parameter,
 * which is exactly so that per-entity metadata is supplied by the entity module rather than
 * discovered inside the engine (TR-3).
 */

/** The four audit properties, marked populate-disabled. */
const AUDIT_PROPERTY_DESCRIPTORS: readonly DisabledPropertyDescriptor<AuditPropertyName>[] =
  Object.freeze(
    AUDIT_PROPERTY_NAMES.map<DisabledPropertyDescriptor<AuditPropertyName>>(
      (auditPropertyName) => ({
        name: auditPropertyName,
        populateEnabled: false,
      }),
    ),
  );

/**
 * The legacy `getClassName` value for this entity [org/Hibachi/HibachiObject.cfc:L135-L137], which
 * for [model/entity/OptionGroup.cfc:L49] is the bare component name.
 */
const OPTION_GROUP_LEGACY_CLASS_NAME = 'OptionGroup';

/** The seven simple columns, in source declaration order. */
const OPTION_GROUP_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<OptionGroupPropertyName>[] =
  Object.freeze([
    { name: 'optionGroupName', valueType: 'string' },
    { name: 'optionGroupCode', valueType: 'string' },
    { name: 'optionGroupImage', valueType: 'string' },
    { name: 'optionGroupDescription', valueType: 'string' },
    { name: 'imageGroupFlag', valueType: 'boolean' },
    { name: 'sortOrder', valueType: 'integer' },
    { name: 'remoteID', valueType: 'string' },
  ]);

/** The population contract for `optionGroup`, minus the `options` relationship. */
export const OPTION_GROUP_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<
  OptionGroup,
  OptionGroupPropertyName
> = Object.freeze({
  entityName: OPTION_GROUP_LEGACY_CLASS_NAME,
  persistent: true,
  properties: Object.freeze([...OPTION_GROUP_COLUMN_DESCRIPTORS, ...AUDIT_PROPERTY_DESCRIPTORS]),
});

/**
 * Builds the complete population contract, including the `options` one-to-many relationship.
 *
 * @param optionLoader - Resolves an `Option` by its 32-character identifier.
 * @param populateOption - Populates a resolved `Option` from a nested payload struct.
 * @returns The twelve-descriptor population contract for `OptionGroup`.
 */
export function createOptionGroupPropertyDescriptors(
  optionLoader: RelatedEntityLoader<Option>,
  populateOption: SubPropertyPopulator<Option>,
): PropertyDescriptorSet<OptionGroup, OptionGroupPropertyName> {
  const optionsDescriptor: OneToManyPropertyDescriptor<OptionGroup, 'options', Option> = {
    name: 'options',
    kind: 'one-to-many',
    relatedPrimaryIdPropertyName: 'optionID',
    singularName: 'option',
    loader: optionLoader,
    addRelated(optionGroup: OptionGroup, option: Option): void {
      optionGroup.addOption(option);
    },
    populateRelated(option: Option, data: Record<string, unknown>): void {
      populateOption(option, data);
    },
  };

  return Object.freeze({
    entityName: OPTION_GROUP_LEGACY_CLASS_NAME,
    persistent: true,
    properties: Object.freeze([...OPTION_GROUP_PROPERTY_DESCRIPTORS.properties, optionsDescriptor]),
  });
}
