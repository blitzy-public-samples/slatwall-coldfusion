/**
 * Brand — the Catalog's brand entity, extracted from a retired CFML ORM.
 *
 * Ported from [model/entity/Brand.cfc], whose component declaration at [:L49] reads
 * `component displayname="Brand" entityname="SlatwallBrand" table="SwBrand" persistent=true
 * output=false accessors=true extends="HibachiEntity" cacheuse="transactional"
 * hb_serviceName="brandService" hb_permission="this"`. Scope per AAP §0.4.1.4: six persistent
 * properties and the products relationship. Four of those attributes carry information this port
 * records rather than reproduces:
 *
 * - `entityname` / `table`. The table is named in prose only. This module contains no SQL, no query
 * string, no driver import and no table or column identifier in any code position (AAP §0.7.3); mapping
 * brand rows to and from this type belongs to `src/adapters/mysql/rowMappers.ts`.
 * - `extends="HibachiEntity"` resolves to the local [model/entity/HibachiEntity.cfc], not to
 * `org/Hibachi/HibachiEntity.cfc` (IR-8). That local class is the one whose `populate` override
 * [model/entity/HibachiEntity.cfc:L56-L97] and `setting` helper [:L129] the in-scope entities
 * actually inherit. Neither is reproduced as a member here: population belongs to
 * `../base/populate`, and brand has no `setting` caller at all.
 */

import {
  AUDIT_PROPERTY_NAMES,
  hasDeclaredProperty,
  isAuditPropertyName,
  readSimpleRepresentation,
  readValueByPropertyIdentifier,
  requireDeclaredPropertyMetaData,
  resolveSimpleRepresentationPropertyName,
  type AuditableEntity,
  type AuditPropertyName,
  type DeclaredPropertyNameSet,
  type EntityPropertyMetaData,
  type AuditableManagedEntity,
} from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  EntityMetadataDeclaration,
  OneToManyPropertyDescriptor,
  PopulatePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
import { readIdentifierOrUnsaved, readsAsUnsavedIdentifier } from '../base/populate';

/* Translation decision: `import type`, and why the mutual cycle is harmless. */
import type { Product } from './Product';

/**
 * The element type of Brand's `attributeValues` collection.
 *
 * TODO(boundary): the rightful long-term owner of attribute-value handling is the attribute
 * subsystem (§0.2.2.1), which is outside this slice. No attribute service is imported, no
 * `AttributeValue` class is declared, no file is created under `src/ports/`, and the
 * `assignedAttributeSetSmartList` machinery of [model/entity/HibachiEntity.cfc:L62-L89] is not
 * reproduced — `../base/populate` already flags that same seam as a declared TR-5 omission on its
 * `afterPopulate` option, and these two files agree by construction.
 */
export interface BrandAttributeValueAssociation {
  setBrand(brand: Brand): void;

  removeBrand(brand: Brand): void;
}

/**
 * The element type of a many-to-many-inverse collection whose collaborator family is entirely
 * out of scope.
 *
 * TODO(boundary): the rightful owners of these element types are the promotion, vendor and
 * physical-count subsystems, three families AAP §0.2.2.1 excludes outright. When a later slice converts
 * any of them, replace this alias at the corresponding field declaration with that family's real
 * domain type; no port file is created here and no shape is invented (TR-5, AAP §0.7.3).
 */
export type OutOfScopeAssociation = object;

/**
 * A brand — the port of `model/entity/Brand.cfc`.
 *
 * @example
 * ```ts
 * const brand = new brand;
 * brand.brandName = 'acme';
 * ```
 */
export class Brand implements AuditableEntity, AuditableManagedEntity {
  /* persistent properties — [model/entity/Brand.cfc:L51-L57] */

  /**
   * The primary identifier — [model/entity/Brand.cfc:L52]:
   *
   * Property name="brandID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   * unsavedvalue="" default="";
   */
  brandID: string = '';

  /**
   * [model/entity/Brand.cfc:L53] `property name="activeFlag" ormtype="boolean"`, whose legacy hint
   * reads verbatim: "As Brands Get Old, They would be marked as Not Active".
   */
  declare activeFlag?: boolean;

  /**
   * [model/entity/Brand.cfc:L54] `property name="publishedFlag" ormtype="boolean"` — the one
   * persistent property in the file that carries no hint at all. Optional and defaulted nowhere,
   * for the same reason as `activeFlag`.
   */
  declare publishedFlag?: boolean;

  /**
   * [model/entity/Brand.cfc:L55] `property name="urlTitle" ormtype="string" unique="true"`, hint:
   * "This is the name that is used in the URL string".
   */
  declare urlTitle?: string;

  /**
   * [model/entity/Brand.cfc:L56] `property name="brandName" ormtype="string"`, hint: "This is the
   * common name that the brand goes by."
   */
  declare brandName?: string;

  /**
   * [model/entity/Brand.cfc:L57] `property name="brandWebsite" ormtype="string"
   * hb_formatType="url"`, hint: "This is the Website of the brand".
   */
  declare brandWebsite?: string;

  /*
   * Related object properties (one-to-many) — [model/entity/Brand.cfc:L59-L61]
   * every collection on this class is eagerly initialised to `[]` in its own declaration. Not
   * lazily on first access, not optional, not `undefined`. `new brand` yields empty arrays
   * immediately. The requirement is traceable, not stylistic — see the note on `getProducts`
   * below and [meta/tests/unit/entity/BrandTest.cfc:L58-L60] — and applying it uniformly to all
   * eight collections is what makes the live-array contract safe to rely on everywhere.
   */

  /**
   * [model/entity/Brand.cfc:L60]:
   *
   * Property name="attributeValues" singularname="attributeValue" cfc="attributeValue"
   * type="array" fieldtype="one-to-many" fkcolumn="brandID"
   * cascade="all-delete-orphan" inverse="true";
   */
  attributeValues: BrandAttributeValueAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L61]:
   *
   * Property name="products" singularname="product" cfc="product" type="array"
   * fieldtype="one-to-many" fkcolumn="brandID" inverse="true";
   */
  products: Product[] = [];

  /*
   * Related object properties (many-to-many) — [model/entity/Brand.cfc:L63-L71]
   * the "many-to-many - owner" section is empty: [:l63-l64] is a banner with nothing under it, so
   * Brand owns no many-to-many relationship. All six below are inverse sides, each declaring
   * `inverse="true"` and naming a link table it does not own.
   */

  /**
   * [model/entity/Brand.cfc:L66] — `cfc="PromotionReward"`, link table `SwPromoRewardBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="promotionRewardID"`, `hb_populateEnabled="false"`.
   * Populate-disabled exclusion 1 of Brand's five relationship exclusions.
   */
  promotionRewards: OutOfScopeAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L67] — `cfc="PromotionReward"`, link table `SwPromoRewardExclBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="promotionRewardID"`, `hb_populateEnabled="false"`.
   * The exclusion side of the same collaborator: a brand can be excluded from a promotion reward as
   * well as qualify for one. Populate-disabled exclusion 2 of five.
   */
  promotionRewardExclusions: OutOfScopeAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L68] — `cfc="PromotionQualifier"`, link table `SwPromoQualBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="promotionQualifierID"`, `hb_populateEnabled="false"`.
   * Populate-disabled exclusion 3 of five.
   */
  promotionQualifiers: OutOfScopeAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L69] — `cfc="PromotionQualifier"`, link table `SwPromoQualExclBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="promotionQualifierID"`, `hb_populateEnabled="false"`.
   * Populate-disabled exclusion 4 of five.
   */
  promotionQualifierExclusions: OutOfScopeAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L70] — `cfc="Vendor"`, link table `SwVendorBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="vendorID"`.
   */
  vendors: OutOfScopeAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L71] — `cfc="Physical"`, link table `SwPhysicalBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="physicalID"`, `hb_populateEnabled="false"`.
   * Populate-disabled exclusion 5 of five.
   */
  physicals: OutOfScopeAssociation[] = [];

  /* Remote properties — [model/entity/Brand.cfc:L73-L74] */

  /**
   * [model/entity/Brand.cfc:L74] `property name="remoteID" ormtype="string"` — the identifier this
   * brand carries in whatever external system it was imported from.
   */
  declare remoteID?: string;

  /*
   * Audit properties — [model/entity/Brand.cfc:L76-L80]
   * All four are declared `hb_populateEnabled="false"` and are therefore never writable from
   * request data; only `applyPreInsertAudit`/`applyPreUpdateAudit` in `../base/AuditableEntity` may
   * write them. They are declared on Brand's own surface — this class implements `AuditableEntity`
   * structurally and extends nothing (§0.3.3) — and the four names are never re-listed by hand
   * anywhere in this file: the descriptor section derives them from the shared
   * `AUDIT_PROPERTY_NAMES` tuple.
   */

  declare createdDateTime?: Date;

  /**
   * [model/entity/Brand.cfc:L78] `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
   * fkcolumn="createdByAccountID"`. Holds the account identifier, not an account entity.
   */
  declare createdByAccount?: string;

  declare modifiedDateTime?: Date;

  /**
   * [model/entity/Brand.cfc:L80] `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
   * fkcolumn="modifiedByAccountID"`. Holds the account identifier, not an account entity.
   */
  declare modifiedByAccount?: string;

  /*
   * Non-persistent property methods — [model/entity/Brand.cfc:L83-L85]
   * intentionally empty, exactly as the legacy section is. Those three lines are a start banner, a
   * blank line and an end banner. Brand declares zero non-persistent properties, which is the whole
   * reason AAP §0.4.1.4 calls this port complete. Nothing is omitted here.
   */

  /* Bidirectional helper methods — [model/entity/Brand.cfc:L87-L155] */

  /**
   * Returns the live `products` array, by reference.
   *
   * @returns The live products collection. Mutating the returned array mutates this brand.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * Whether a product is already in this brand's `products` collection.
   *
   * @param product - The product to look for.
   * @returns `true` when this exact product instance is already in the collection.
   */
  hasProduct(product: Product): boolean {
    return this.products.includes(product);
  }

  /**
   * Adds an attribute value to this brand — the port of
   * [model/entity/Brand.cfc:L90-L92]:
   *
   * Public void function addAttributeValue(required any attributeValue) {
   * arguments.attributeValue.setBrand( this );
   * }
   *
   * @param attributeValue - The attribute value to associate with this brand.
   */
  addAttributeValue(attributeValue: BrandAttributeValueAssociation): void {
    attributeValue.setBrand(this);
  }

  /**
   * Removes an attribute value from this brand — the port of
   * [model/entity/Brand.cfc:L93-L95]:
   *
   * Public void function removeAttributeValue(required any attributeValue) {
   * arguments.attributeValue.removeBrand( this );
   * }
   *
   * @param attributeValue - The attribute value to disassociate from this brand.
   */
  removeAttributeValue(attributeValue: BrandAttributeValueAssociation): void {
    attributeValue.removeBrand(this);
  }

  /**
   * Adds a product to this brand — the port of [model/entity/Brand.cfc:L98-L100]:
   *
   * Public void function addProduct(required any product) {
   * arguments.product.setBrand(this);
   * }
   *
   * @param product - The product to assign to this brand.
   */
  addProduct(product: Product): void {
    product.setBrand(this);
  }

  /**
   * Removes a product from this brand — the port of [model/entity/Brand.cfc:L101-L103]:
   *
   * Public void function removeProduct(required any product) {
   * arguments.product.removeBrand(this);
   * }
   *
   * @param product - The product to disassociate from this brand.
   */
  removeProduct(product: Product): void {
    product.removeBrand(this);
  }

  /*
   * The twelve promotion / qualifier / vendor / physical helpers — documented and omitted
   * [model/entity/Brand.cfc:L105-L153] declares twelve further bidirectional helpers. None is ported,
   * and this is the record of that decision so the omission reads as deliberate:
   *
   * AddPromotionReward [:L106-L108] -> promotionReward.addBrand(this)
   * removePromotionReward [:L110-L112] -> promotionReward.removeBrand(this)
   * addPromotionRewardExclusion [:L115-L117] -> promotionReward.addExcludedBrand(this)
   * removePromotionRewardExclusion [:L118-L120] -> promotionReward.removeExcludedBrand(this)
   * addPromotionQualifier [:L123-L125] -> promotionQualifier.addBrand(this)
   * removePromotionQualifier [:L127-L129] -> promotionQualifier.removeBrand(this)
   * addPromotionQualifierExclusion [:L132-L134] -> promotionQualifier.addExcludedBrand(this)
   * removePromotionQualifierExcl. [:L135-L137] -> promotionQualifier.removeExcludedBrand(this)
   */

  /**
   * Whether this brand has never been persisted.
   *
   * @returns `true` while `brandID` still holds the unsaved value, and also when population has
   * cleared the key outright — see {@link readsAsUnsavedIdentifier} for why that state is reachable.
   */
  isNew(): boolean {
    return readsAsUnsavedIdentifier(this.brandID);
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
   * `Brand` — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of the
   * component's fully qualified name. Interpolated into every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216].
   *
   * @returns The bare class name.
   */
  getClassName(): string {
    return BRAND_CLASS_NAME;
  }

  /**
   * `SlatwallBrand` — [org/Hibachi/HibachiEntity.cfc:L287-L289]. Live metadata reflection is replaced by the
   * declared constant, per TR-3.
   *
   * @returns The mapped ORM entity name, not the physical table name.
   */
  getEntityName(): string {
    return BRAND_ENTITY_NAME;
  }

  /**
   * `brandID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP §0.7.3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return BRAND_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's value — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return readIdentifierOrUnsaved(this.brandID);
  }

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(BRAND_DECLARED_PROPERTIES, propertyIdentifier);
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
      BRAND_DECLARED_PROPERTIES,
      propertyName,
      BRAND_CLASS_NAME,
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

  /**
   * The property whose value represents this entity — the framework default at
   * [org/Hibachi/HibachiEntity.cfc:L74-L88], resolved by naming convention.
   *
   * @returns `'brandName'` for this entity, resolved from the declared property set.
   * @throws DomainError when no declared property satisfies the convention — unreachable for Brand.
   */
  getSimpleRepresentationPropertyName(): string {
    return resolveSimpleRepresentationPropertyName(BRAND_CLASS_NAME, BRAND_DECLARED_PROPERTIES);
  }

  /**
   * A simple representation of this entity — the framework default at
   * [org/Hibachi/HibachiEntity.cfc:L59-L71].
   *
   * @returns The brand name when set, otherwise the legacy blank fallthrough.
   */
  getSimpleRepresentation(): string {
    return readSimpleRepresentation(this, this.getSimpleRepresentationPropertyName());
  }
}

/*
 * [model/validation/Brand.json] — documented here, implemented in the validation layer
 * `src/validation/rules/brand.rules.ts` owns these five rules and `src/validation/Validator.ts`
 * evaluates them; not one is implemented, evaluated or enforced in this file. They are recorded
 * because they are behaviour (IR-4 — the declarative rule sets are part of the observable contract,
 * not configuration) and because a reader of this entity needs to know which constraints exist:
 *
 * Property context rule
 * brandName save required
 * brandWebsite save dataType: "url" <- the live url constraint; see the field's note,
 * where the dead `hb_formatType` path is explained
 * urlTitle save required and unique
 * products delete maxCollection: 0 <- a brand with products cannot be deleted; hence no
 * cascade on `products` at [:L61]
 */

/*
 * The traceable test contract — where each legacy assertion lands
 * `test/domain/Brand.test.ts` is TRACEABLE to [meta/tests/unit/entity/BrandTest.cfc] and is owned
 * by another file. This note exists so its author is not left guessing which assertions this class
 * can satisfy and which it deliberately cannot, because forbids declaring the framework members
 * three of the four legacy assertions call.
 */

/*
 * The population contract (r-b) — declared descriptors, not runtime metadata reflection
 * The legacy `populate` reflected over component metadata at runtime and assigned through
 * dynamically composed setter names. `../base/populate` replaces all of it with a declared,
 * compile-checked descriptor model, and TR-3 would forbid a reflective equivalent even if
 * TypeScript offered one. Two consequences for this file:
 *
 * - `brand.ts` declares no `populate` method. `../base/populate` owns population, `` forbids
 * the member, and the local override at [model/entity/HibachiEntity.cfc:L56-L97] that added
 * attribute-value handling is flagged there as a declared TR-5 boundary omission.
 * - `brand.ts` exports its descriptor set, in the exact shape `PropertyDescriptorSet` declares.
 */

/** Every property name `model/entity/Brand.cfc` declares — all nineteen, in declaration order. */
export type BrandPropertyName =
  | 'brandID'
  | 'activeFlag'
  | 'publishedFlag'
  | 'urlTitle'
  | 'brandName'
  | 'brandWebsite'
  | 'attributeValues'
  | 'products'
  | 'promotionRewards'
  | 'promotionRewardExclusions'
  | 'promotionQualifiers'
  | 'promotionQualifierExclusions'
  | 'vendors'
  | 'physicals'
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
export const BRAND_CLASS_NAME = 'Brand';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/Brand.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 */
export const BRAND_ENTITY_NAME = 'SlatwallBrand';

/**
 * The name of the primary identifier property — [model/entity/Brand.cfc:L52], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 */
export const BRAND_PRIMARY_ID_PROPERTY_NAME = 'brandID';

/**
 * Every property this entity declares, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 */
export const BRAND_DECLARED_PROPERTIES: DeclaredPropertyNameSet<BrandPropertyName> = Object.freeze({
  brandID: true,
  activeFlag: true,
  publishedFlag: true,
  urlTitle: true,
  brandName: true,
  brandWebsite: true,
  attributeValues: true,
  products: true,
  promotionRewards: true,
  promotionRewardExclusions: true,
  promotionQualifiers: true,
  promotionQualifierExclusions: true,
  vendors: true,
  physicals: true,
  remoteID: true,
  createdDateTime: true,
  createdByAccount: true,
  modifiedDateTime: true,
  modifiedByAccount: true,
});

/**
 * Brand's frozen metadata declaration — what `manageEntity` reads to compose the seven framework
 * introspection members onto an instance.
 */
export const BRAND_ENTITY_METADATA: EntityMetadataDeclaration<BrandPropertyName> = Object.freeze({
  className: 'Brand',
  entityName: 'SlatwallBrand',
  primaryIDPropertyName: 'brandID',
  properties: Object.freeze({
    brandID: true,
    activeFlag: true,
    publishedFlag: true,
    urlTitle: true,
    brandName: true,
    brandWebsite: true,
    attributeValues: true,
    products: true,
    promotionRewards: true,
    promotionRewardExclusions: true,
    promotionQualifiers: true,
    promotionQualifierExclusions: true,
    vendors: true,
    physicals: true,
    remoteID: true,
    createdDateTime: true,
    createdByAccount: true,
    modifiedDateTime: true,
    modifiedByAccount: true,
  } satisfies Readonly<Record<BrandPropertyName, true>>),
} satisfies EntityMetadataDeclaration<BrandPropertyName>);

/**
 * Brand's five own `hb_populateEnabled="false"` relationship declarations — the ones that make this
 * entity unique in the slice.
 */
export const BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES = Object.freeze([
  'promotionRewards',
  'promotionRewardExclusions',
  'promotionQualifiers',
  'promotionQualifierExclusions',
  'physicals',
] as const) satisfies readonly Exclude<BrandPropertyName, AuditPropertyName | 'vendors'>[];

/** The name of one of brand's five own populate-disabled relationship properties. */
export type BrandRelationshipPopulateDisabledPropertyName =
  (typeof BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES)[number];

/**
 * Whether a property of Brand is populate-disabled — the union of the shared audit exclusion and
 * Brand's five own relationship exclusions, and therefore the single source of truth for the nine.
 *
 * @param propertyName - A candidate property key.
 * @returns `true` when the property carries `hb_populateEnabled="false"` in the legacy declaration.
 */
export function isBrandPopulateDisabledProperty(propertyName: string): boolean {
  return (
    isAuditPropertyName(propertyName) ||
    BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES.some(
      (disabledPropertyName) => disabledPropertyName === propertyName,
    )
  );
}

/**
 * The five simple persistent properties population may write, in legacy declaration order —
 * [model/entity/Brand.cfc:L53-L57].
 */
const BRAND_SIMPLE_PROPERTY_DESCRIPTORS: readonly ColumnPropertyDescriptor<BrandPropertyName>[] = [
  { name: 'activeFlag', valueType: 'boolean' },
  { name: 'publishedFlag', valueType: 'boolean' },
  { name: 'urlTitle', valueType: 'string' },
  { name: 'brandName', valueType: 'string' },
  { name: 'brandWebsite', valueType: 'string' },
];

/**
 * `remoteID` — [model/entity/Brand.cfc:L74]. A populate-enabled simple property, declared
 * separately from the five above because it sits after the relationship block in the legacy source
 * and declaration order is preserved.
 */
const BRAND_REMOTE_ID_DESCRIPTOR: ColumnPropertyDescriptor<BrandPropertyName> = {
  name: 'remoteID',
  valueType: 'string',
};

/*
 * Translation decision: A populate-disabled property declares no relationship machinery.
 */

/** The four audit properties as populate-disabled descriptors, generated from the shared tuple. */
const BRAND_AUDIT_PROPERTY_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Brand,
  AuditPropertyName
>[] = AUDIT_PROPERTY_NAMES.map<PopulatePropertyDescriptor<Brand, AuditPropertyName>>(
  (auditPropertyName) => ({ name: auditPropertyName, populateEnabled: false }),
);

/**
 * Brand's five own relationship exclusions as populate-disabled descriptors, generated from
 * {@link BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES} so that each name is written exactly
 * once in this file.
 */
const BRAND_RELATIONSHIP_POPULATE_DISABLED_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Brand,
  BrandRelationshipPopulateDisabledPropertyName
>[] = BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES.map<
  PopulatePropertyDescriptor<Brand, BrandRelationshipPopulateDisabledPropertyName>
>((disabledPropertyName) => ({ name: disabledPropertyName, populateEnabled: false }));

/** The collaborators the `products` relationship needs before population can act on it. */
export interface BrandProductsRelationshipCollaborators {
  /**
   * Resolves a product by its 32-character identifier — the injected replacement for the legacy
   * service lookup. `loadOrCreate` is the `{1=id, 2=true}` form the legacy array branch used;
   * `loadExisting` is the load-only form.
   */
  readonly productLoader: RelatedEntityLoader<Product>;

  /**
   * Populates a resolved product from its nested payload struct — the port of the legacy recursion
   * at [org/Hibachi/HibachiTransient.cfc:L300]. `Product.ts` owns Product's descriptors, so the
   * recursion arrives as a function rather than as an import, which is also what keeps the two
   * entity modules free of any runtime dependency on each other.
   */
  readonly populateProduct: SubPropertyPopulator<Product>;
}

/**
 * Builds Brand's population contract — the declared replacement for the legacy `getProperties()`
 * metadata walk.
 *
 * TODO(boundary): the rightful owners are the attribute subsystem and the vendor subsystem, both
 * outside this slice (TR-5). No port file is created, no service is imported and no shape is
 * invented for either collaborator.
 *
 * @param productsRelationship - The `products` relationship's collaborators. Omit them to obtain
 * the
 * dependency-free contract, in which the `products` descriptor is not declared at all and a
 * `products` payload key is ignored exactly as `attributeValues` and `vendors` are.
 *
 * @returns Brand's population contract, with `persistent: true` and its properties in legacy
 * declaration order.
 *
 * @example
 * ```ts
 * // dependency-free — what brandService.saveBrand uses, since per AAP §0.6.3.3 brandService's only
 * // collaborators are the ported url-title utility and the injected BaseService.
 * ```
 */
export function createBrandPropertyDescriptors(
  productsRelationship?: BrandProductsRelationshipCollaborators,
): PropertyDescriptorSet<Brand, BrandPropertyName> {
  /* The one-to-many descriptor for `products` — [model/entity/Brand.cfc:L61]. */
  const productsDescriptors: readonly OneToManyPropertyDescriptor<Brand, 'products', Product>[] =
    productsRelationship === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'products',
            relatedPrimaryIdPropertyName: 'productID',
            singularName: 'product',
            loader: productsRelationship.productLoader,
            addRelated(brand, product) {
              brand.addProduct(product);
            },
            populateRelated(product, data) {
              productsRelationship.populateProduct(product, data);
            },
          },
        ];

  return {
    /*
     * `getClassName` [org/Hibachi/HibachiObject.cfc:L135-L137] returns `listLast(getClassFullname(),
     * ".")`, which for [model/entity/Brand.cfc:L49] is the bare component name `Brand`. That legacy
     * name is what the out-of-scope permission records are keyed by — `getEntityPermissionDetails()`
     * derives its key set from a directory listing of `model/entity` at
     * [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141] — so it is carried verbatim rather than
     * derived from this class's TypeScript name, which esbuild is free to rename.
     */
    entityName: BRAND_CLASS_NAME,

    /*
     * [model/entity/Brand.cfc:L49] declares `persistent=true`, so this is `true` — and the flag is
     * load-bearing rather than informational. `../base/populate` uses it as the first arm of the
     * legacy authorisation or at [org/Hibachi/HibachiTransient.cfc:L186-L190]: a transient process
     * object short-circuits that or and populates freely, whereas a persistent entity such as Brand
     * has per-property access control consulted. All three arms of that or are live in that module,
     * with arms 2 and 3 resolved through `PopulationAuthorizationPort` from
     * `../../ports/AccountContextPort`; the caller supplies the policy.
     */
    persistent: true,

    /*
     * In legacy declaration order, with every gap accounted for.
     */
    properties: [
      ...BRAND_SIMPLE_PROPERTY_DESCRIPTORS,
      ...productsDescriptors,
      ...BRAND_RELATIONSHIP_POPULATE_DISABLED_DESCRIPTORS,
      BRAND_REMOTE_ID_DESCRIPTOR,
      ...BRAND_AUDIT_PROPERTY_DESCRIPTORS,
    ],
  };
}

/** Brand's dependency-free population contract. */
export const BRAND_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Brand, BrandPropertyName> =
  createBrandPropertyDescriptors();
