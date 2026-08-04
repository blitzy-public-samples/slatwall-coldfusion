/**
 * Option — the `SwOption` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode TypeScript.
 *
 * Ported from [model/entity/Option.cfc]. AAP §0.4.1.4 names exactly three things for this module —
 * five persistent properties, the required option-group relationship, and the SKUs relationship
 * inverse over `SwSkuOption` — and that row is the scope. [model/entity/Option.cfc] declares six
 * further relationships and twelve further methods, every one of which reaches explicitly
 * out-of-scope territory; each is catalogued with its locator in the exclusion block below and then
 * omitted, so the omission reads as a decision rather than an oversight (AAP §0.7.3).
 *
 * This is one of only three complete ports in the `domain/` subtree. AAP §0.2.2.6 states it directly:
 * "`Brand.cfc`, `Option.cfc` and `OptionGroup.cfc` declare no non-persistent properties at all, so
 * they are unaffected." The legacy source declares no `persistent="false"` property, so there is no
 * calculated-property boundary to negotiate here and nothing is excluded for pricing, promotion,
 * inventory or currency reasons — contrast the sixteen `Product`/`Sku` members §0.2.2.6 excludes.
 * Everything this entity omits, it omits because the related type is out of scope, never because the
 * member itself reaches a port.
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
  ManyToManyPropertyDescriptor,
  ManyToOnePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
/* R-A — the mutual type reference with `./OptionGroup`, and why it is safe. */
import type { OptionGroup } from './OptionGroup';

/**
 * Every property name [model/entity/Option.cfc] declares within this file's scope — the union
 * `populate` is keyed by.
 */
export type OptionPropertyName =
  | 'optionID'
  | 'optionCode'
  | 'optionName'
  | 'optionDescription'
  | 'sortOrder'
  | 'optionGroup'
  | 'skus'
  | 'remoteID'
  | AuditPropertyName;

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
export const OPTION_CLASS_NAME = 'Option';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/Option.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 */
export const OPTION_ENTITY_NAME = 'SlatwallOption';

/**
 * The name of the primary identifier property — [model/entity/Option.cfc:L52], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 */
export const OPTION_PRIMARY_ID_PROPERTY_NAME = 'optionID';

/**
 * Every property this entity declares, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 */
export const OPTION_DECLARED_PROPERTIES: DeclaredPropertyNameSet<OptionPropertyName> =
  Object.freeze({
    optionID: true,
    optionCode: true,
    optionName: true,
    optionDescription: true,
    sortOrder: true,
    optionGroup: true,
    skus: true,
    remoteID: true,
    createdDateTime: true,
    createdByAccount: true,
    modifiedDateTime: true,
    modifiedByAccount: true,
  });

/**
 * Option's frozen metadata declaration — what `manageEntity` reads to compose the seven framework
 * introspection members onto an instance.
 */
export const OPTION_ENTITY_METADATA: EntityMetadataDeclaration<OptionPropertyName> = Object.freeze({
  className: 'Option',
  entityName: 'SlatwallOption',
  primaryIDPropertyName: 'optionID',
  properties: Object.freeze({
    optionID: true,
    optionCode: true,
    optionName: true,
    optionDescription: true,
    sortOrder: true,
    optionGroup: true,
    skus: true,
    remoteID: true,
    createdDateTime: true,
    createdByAccount: true,
    modifiedDateTime: true,
    modifiedByAccount: true,
  } satisfies Readonly<Record<OptionPropertyName, true>>),
  /*
   * The six persistent relationships [model/entity/Option.cfc] declares and this port does not
   * model: `defaultImage` [`:L60`] and `images` [`:L63`] reach the out-of-scope image entity, and
   * `promotionRewards` [`:L67`], `promotionRewardExclusions` [`:L68`], `promotionQualifiers`
   * [`:L69`] and `promotionQualifierExclusions` [`:L70`] reach the out-of-scope promotion entities.
   * Typed as a plain key record rather than as a union, because by definition these are the names no
   * property-name union in this module carries; there is nothing to constrain them against.
   */
  declaredNonFieldProperties: Object.freeze({
    defaultImage: true,
    images: true,
    promotionRewards: true,
    promotionRewardExclusions: true,
    promotionQualifiers: true,
    promotionQualifierExclusions: true,
  }),
} satisfies EntityMetadataDeclaration<OptionPropertyName>);

/**
 * The two framework capabilities {@link Option.getImageDirectory} reaches through — supplied as an
 * explicit parameter rather than resolved.
 *
 * TODO(boundary): the eventual owner of the settings half is `src/ports/SettingResolverPort.ts`
 * (§0.4.1.6 — `'globalAssetsImageFolderPath'` is one of the eighteen keys the slice reads),
 * implemented by `src/adapters/settings/StaticSettingResolver.ts`. The path-to-URL half has no port
 * because it needs none. Until the composition root wires them, the capability arrives here as a
 * parameter and this module reaches nothing on its own.
 */
export interface OptionImageDirectoryResolver {
  /**
   * Resolves the effective value of the one setting this entity reads.
   *
   * @param settingName - Always `'globalAssetsImageFolderPath'`; the literal type is the whole point.
   * @returns The configured image folder path, in the shape the legacy engine returned it.
   */
  setting(settingName: 'globalAssetsImageFolderPath'): string;

  /**
   * Converts a file-system path to a web path — the port of
   * [org/Hibachi/HibachiObject.cfc:L83-L91].
   *
   * @param path - The already-resolved setting value.
   * @returns The equivalent web path.
   */
  getURLFromPath(path: string): string;
}

/**
 * The owning side of the `SwSkuOption` relationship, as narrowly as {@link Option.addSku} and
 * {@link Option.removeSku} actually use it.
 *
 * TODO(boundary): the eventual concrete counterpart is `src/domain/sku/Sku.ts`, which owns the link
 * collection and the `SwSkuOption` write. This module never maintains that collection itself — see the
 * note on {@link Option.addSku}.
 */
export interface SkuOptionOwner {
  /**
   * Attaches an option to this SKU — the owning-side operation
   * [model/entity/Option.cfc:L111] delegates to.
   *
   * @param option - The option to attach.
   */
  addOption(option: Option): void;

  /**
   * Detaches an option from this SKU — the owning-side operation
   * [model/entity/Option.cfc:L114] delegates to.
   *
   * @param option - The option to detach.
   */
  removeOption(option: Option): void;
}

/*
 * The exclusion register — six relationships and twelve methods that are not ported
 * The AAP key-change row for this file names the five persistent properties, `optionGroup` and
 * `skus`. Everything below is in the source and is deliberately absent from the port. Each is
 * recorded with its locator so the omission reads as a decision rather than an oversight (AAP §0.7.3), and
 * none of the six names appears in {@link OptionPropertyName}, which makes describing one a compile
 * error rather than a matter of discipline.
 */

/** One selectable product option — the `SwOption` row, its parent group and its SKU links. */
export class Option implements AuditableEntity, ManagedEntity {
  /* persistent properties — [model/entity/Option.cfc:L52-L56] */

  /** The primary identifier. */
  optionID: string = '';

  /** The option's stable code, used as a lookup and naming key rather than for display. */
  optionCode?: string;

  /** The option's display name — the "large" in a "size: large" SKU definition. */
  optionName?: string;

  /** Long-form description of the option. */
  optionDescription?: string;

  /** The option's position in the ordering within its parent group. */
  sortOrder?: number;

  /* Related object properties (many-to-one) — [model/entity/Option.cfc:L59] */

  /** The group this option belongs to. */
  declare optionGroup?: OptionGroup;

  /* Related object properties (many-to-many - inverse) — [model/entity/Option.cfc:L66] */

  /** The SKUs that carry this option. */
  skus: SkuOptionOwner[] = [];

  /* Remote properties — [model/entity/Option.cfc:L73] */

  /** The identifier this option carries in an external system. */
  remoteID?: string;

  /* Audit properties — [model/entity/Option.cfc:L76-L79] */

  createdDateTime?: Date;

  /**
   * Identifier of the administrative account that created the row — port of
   * [model/entity/Option.cfc:L77], declared there as
   * `cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`. Carries the 32-character
   * identifier of IR-6.
   */
  createdByAccount?: string;

  /** When the row was last written. Port of [model/entity/Option.cfc:L78]. */
  modifiedDateTime?: Date;

  /**
   * Identifier of the administrative account that last wrote the row — port of
   * [model/entity/Option.cfc:L79], `fkcolumn="modifiedByAccountID"`. Typed as an identifier string for
   * the same reason as {@link Option.createdByAccount}.
   */
  modifiedByAccount?: string;

  /* Image directory — [model/entity/Option.cfc:L81-L83] */

  /**
   * The web directory this option's images live in.
   *
   * TODO(boundary): the settings half is owned by `src/ports/SettingResolverPort.ts` (§0.4.1.6 —
   * `'globalAssetsImageFolderPath'` is one of the eighteen configuration keys the slice reads),
   * implemented by `src/adapters/settings/StaticSettingResolver.ts`; the path-to-URL half is the pure
   * transform at [org/Hibachi/HibachiObject.cfc:L83-L91] and needs no port. Wiring happens once in
   * `src/config/container.ts`; this module reaches nothing on its own.
   *
   * @param resolver - The two capabilities the legacy inherited, supplied explicitly.
   * @returns The option image directory as a web path, ending in `/option/`.
   */
  getImageDirectory(resolver: OptionImageDirectoryResolver): string {
    return resolver.getURLFromPath(resolver.setting('globalAssetsImageFolderPath')) + '/option/';
  }

  /* Bidirectional Helper methods — [model/entity/Option.cfc:L89-L115] */

  /**
   * Attaches this option to an option group, maintaining both sides of the relationship.
   *
   * @param optionGroup - The group to attach this option to.
   */
  setOptionGroup(optionGroup: OptionGroup): void {
    this.optionGroup = optionGroup;

    if (this.isNew() || !optionGroup.hasOption(this)) {
      optionGroup.getOptions().push(this);
    }
  }

  /**
   * Detaches this option from an option group, clearing both sides of the relationship.
   *
   * @param optionGroup - The group to detach from. Omit it to detach from the currently-assigned group.
   * @throws TypeError - When the argument is omitted and no group is assigned, reproducing the CFML
   * engine diagnostic at [model/entity/Option.cfc:L100]. Nothing is cleared, because the legacy
   * never reaches its clear on this path.
   */
  removeOptionGroup(optionGroup?: OptionGroup): void {
    const removeFrom = optionGroup ?? this.optionGroup;

    if (removeFrom === undefined) {
      // [model/entity/Option.cfc:L100] raises here — before the search at :L102 and before the
      // unconditional clear at :L106. Statement order preserved: the clear below is not reached.
      throw new TypeError(
        `Option ${this.isNew() ? '(unsaved)' : this.optionID} had removeOptionGroup called with no ` +
          'option group while none is assigned. ' +
          'model/entity/Option.cfc:L100 defaults the argument from variables.optionGroup, a key that ' +
          'does not exist for a null many-to-one, so the CFML engine raises an undefined-variable ' +
          'error at that line — before the collection search at :L102 and before the unconditional ' +
          'clear at :L106. Carried unrepaired per AAP §0.6.7 and Refactor Discipline Guideline 4: ' +
          'relaxing it into a silent clear would suppress the failure and perform a write the legacy ' +
          'never performs. Pass the option group explicitly, as ' +
          'model/entity/OptionGroup.cfc:L96 does.',
      );
    }

    const groupOptions = removeFrom.getOptions();
    const index = groupOptions.indexOf(this);

    if (index !== -1) {
      groupOptions.splice(index, 1);
    }

    delete this.optionGroup;
  }

  /**
   * Attaches this option to a SKU, by handing the SKU the owning side of the relationship.
   *
   * TODO(boundary): the concrete counterpart is `src/domain/sku/Sku.ts`, a different module's file. It
   * owns the link collection and, with `src/adapters/mysql/**`, the physical `SwSkuOption` write. The
   * two members called through this parameter appear nowhere in [model/entity/Sku.cfc] — they were
   * ORM-synthesized from `singularname="option"` at [model/entity/Sku.cfc:L76] (IR-1), so
   * {@link SkuOptionOwner} is where they first exist as declarations.
   *
   * @param sku - The SKU to attach this option to.
   */
  addSku(sku: SkuOptionOwner): void {
    sku.addOption(this);
  }

  /**
   * Detaches this option from a SKU, by having the SKU drop the link.
   *
   * TODO(boundary): as for {@link Option.addSku} — `src/domain/sku/Sku.ts` is the concrete counterpart
   * and owns the link.
   *
   * @param sku - The SKU to detach this option from.
   */
  removeSku(sku: SkuOptionOwner): void {
    sku.removeOption(this);
  }

  /**
   * Whether this option has never been persisted.
   *
   * @returns `true` when the option has not been persisted yet.
   */
  isNew(): boolean {
    return this.optionID === '';
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
   * `Option` — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of the
   * component's fully qualified name. Interpolated into every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216].
   *
   * @returns The bare class name.
   */
  getClassName(): string {
    return OPTION_CLASS_NAME;
  }

  /**
   * `SlatwallOption` — [org/Hibachi/HibachiEntity.cfc:L287-L289]. Live metadata reflection is replaced by the
   * declared constant, per TR-3.
   *
   * @returns The mapped ORM entity name, not the physical table name.
   */
  getEntityName(): string {
    return OPTION_ENTITY_NAME;
  }

  /**
   * `optionID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP §0.7.3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return OPTION_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's value — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.optionID;
  }

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(OPTION_DECLARED_PROPERTIES, propertyIdentifier);
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
      OPTION_DECLARED_PROPERTIES,
      propertyName,
      OPTION_CLASS_NAME,
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
 * `option` has no `populate` member, deliberately, and for exactly the two reasons its sibling
 * records. In the legacy tree the method arrived by inheritance from the local base
 * [model/entity/HibachiEntity.cfc:L56] and reflected over component metadata at run time. §0.3.3
 * replaces template-method inheritance with composition, so there is no base class to inherit it
 * from; and `../base/populate` declares its contract as a free function taking a `descriptorSet`
 * parameter, precisely so that per-entity metadata is supplied by the entity module rather than
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
 * for [model/entity/Option.cfc:L49] is the bare component name.
 */
const OPTION_LEGACY_CLASS_NAME = 'Option';

/** The five simple columns, in source declaration order. */
const OPTION_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<OptionPropertyName>[] =
  Object.freeze([
    { name: 'optionCode', valueType: 'string' },
    { name: 'optionName', valueType: 'string' },
    { name: 'optionDescription', valueType: 'string' },
    { name: 'sortOrder', valueType: 'integer' },
    { name: 'remoteID', valueType: 'string' },
  ]);

/** The population contract for `option`, minus the two relationships. */
export const OPTION_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Option, OptionPropertyName> =
  Object.freeze({
    entityName: OPTION_LEGACY_CLASS_NAME,
    persistent: true,
    properties: Object.freeze([...OPTION_COLUMN_DESCRIPTORS, ...AUDIT_PROPERTY_DESCRIPTORS]),
  });

/**
 * Builds the complete population contract, including the `optionGroup` many-to-one and the `skus`
 * many-to-many inverse.
 *
 * TODO(parity) — the many-to-one assignment does not route through {@link Option.setOptionGroup},
 * and on this entity that is observable. The legacy helper assigned through a dynamic setter:
 * `_setProperty` reads `var theMethod = this["set" & arguments.name]` and calls it
 * [org/Hibachi/HibachiTransient.cfc:L806-L819], so the many-to-one writes at [:L242] and [:L265]
 * invoked `setOptionGroup(...)` — and on `Option`, alone among the in-scope entities, that name resolves to
 * a hand-written bidirectional override [model/entity/Option.cfc:L92-L97] rather than to a generated
 * accessor. The legacy populate path therefore also appended this option to the group's collection.
 *
 * TODO(boundary) — `skus` is the inverse side, so its mutations leave this module.
 * `addRelated` and `removeRelated` delegate to {@link Option.addSku} and {@link Option.removeSku},
 * which delegate on to the owning side [model/entity/Sku.cfc:L76], exactly as
 * [model/entity/Option.cfc:L110-L115] does. `readRelated` hands back the live `skus` array, which is
 * what the delimited-list branch of the engine expects — it iterates that array backwards while
 * `removeRelated` mutates, so the reverse iteration is correct either way. Convergence of that branch
 * consequently depends on the eventual `src/domain/sku/Sku.ts` maintaining the inverse end of
 * `SwSkuOption` the way the ORM did. That dependency is stated rather than assumed away, and it is not
 *
 * @param optionGroupLoader - Resolves an `OptionGroup` by its 32-character identifier.
 * @param populateOptionGroup - Populates a resolved `OptionGroup` from a nested payload struct.
 * @param skuLoader - Resolves a SKU by its 32-character identifier.
 * @param populateSku - Populates a resolved SKU from a nested payload struct.
 * @param readSkuPrimaryId - Reads a related SKU's primary identifier, or `''` when it has none yet.
 * @returns The eleven-descriptor population contract for `Option`.
 */
export function createOptionPropertyDescriptors(
  optionGroupLoader: RelatedEntityLoader<OptionGroup>,
  populateOptionGroup: SubPropertyPopulator<OptionGroup>,
  skuLoader: RelatedEntityLoader<SkuOptionOwner>,
  populateSku: SubPropertyPopulator<SkuOptionOwner>,
  readSkuPrimaryId: (sku: SkuOptionOwner) => string,
): PropertyDescriptorSet<Option, OptionPropertyName> {
  const optionGroupDescriptor: ManyToOnePropertyDescriptor<'optionGroup', OptionGroup> = {
    name: 'optionGroup',
    kind: 'many-to-one',
    relatedPrimaryIdPropertyName: 'optionGroupID',
    loader: optionGroupLoader,
    populateRelated(optionGroup: OptionGroup, data: Record<string, unknown>): void {
      populateOptionGroup(optionGroup, data);
    },
  };

  const skusDescriptor: ManyToManyPropertyDescriptor<Option, 'skus', SkuOptionOwner> = {
    name: 'skus',
    kind: 'many-to-many',
    relatedPrimaryIdPropertyName: 'skuID',
    singularName: 'sku',
    loader: skuLoader,
    addRelated(option: Option, sku: SkuOptionOwner): void {
      option.addSku(sku);
    },
    populateRelated(sku: SkuOptionOwner, data: Record<string, unknown>): void {
      populateSku(sku, data);
    },
    removeRelated(option: Option, sku: SkuOptionOwner): void {
      option.removeSku(sku);
    },
    readRelated(option: Option): readonly SkuOptionOwner[] {
      return option.skus;
    },
    readRelatedPrimaryId(sku: SkuOptionOwner): string {
      return readSkuPrimaryId(sku);
    },
  };

  return Object.freeze({
    entityName: OPTION_LEGACY_CLASS_NAME,
    persistent: true,
    properties: Object.freeze([
      ...OPTION_PROPERTY_DESCRIPTORS.properties,
      optionGroupDescriptor,
      skusDescriptor,
    ]),
  });
}
