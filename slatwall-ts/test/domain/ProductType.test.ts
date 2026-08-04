/**
 * ProductType domain tests — NET-NEW.
 *
 * Provenance — there is no legacy counterpart to this file.
 * `meta/tests/` contains no `ProductTypeTest.cfc`. `meta/tests/unit/entity/` holds a dedicated test
 * for only a small minority of the legacy entities, and ProductType is not among them, so this
 * entity entered the port with zero legacy coverage. Every case below is therefore labelled
 * NET-NEW, individually and without exception. In particular, a case is not labelled TRACEABLE
 * merely because it re-expresses one of the four assertions ProductType would have inherited from
 *
 * Traceability is documentary, not EMPIRICAL — and the legacy suite was not run.
 * No legacy result was observed and no legacy output was compared against this suite. MXUnit and
 * CFSelenium are not vendored in this repository: `meta/tests/readme.txt:L4-L5` requires each to be
 * installed on the machine with a mapping inside cfide, and neither mapping nor engine exists here.
 * Every legacy fact asserted below rests on a cited `path:Lnn` locator read out of the CFML source,
 * which is a weaker claim than a re-run comparison and is stated plainly rather than implied away.
 */

import {
  createProductTypePropertyDescriptorSet,
  PRODUCT_TYPE_CLASS_NAME,
  PRODUCT_TYPE_DECLARED_PROPERTIES,
  PRODUCT_TYPE_ENTITY_METADATA,
  PRODUCT_TYPE_ENTITY_NAME,
  PRODUCT_TYPE_PRIMARY_ID_PROPERTY_NAME,
  ProductType,
  type InheritedAttributeSetAssignment,
  type InheritedAttributeSetAssignmentSource,
  type ProductTypeAttributeValueOwner,
  type ProductTypePopulationCollaborators,
  type ProductTypePropertyName,
} from '../../src/domain/product/ProductType';
import { DomainError } from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import type { ValidationContext } from '../../src/validation/Validator';
import {
  productTypeValidationRuleSet,
  type ProductTypeValidationSubject,
} from '../../src/validation/rules/productType.rules';
import {
  ALL_SEEDED_PRODUCT_TYPES,
  CONTENT_ACCESS_PRODUCT_TYPE,
  CONTENT_ACCESS_PRODUCT_TYPE_ID,
  MERCHANDISE_PRODUCT_TYPE,
  MERCHANDISE_PRODUCT_TYPE_ID,
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE,
  SUBSCRIPTION_PRODUCT_TYPE,
  SUBSCRIPTION_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  buildProduct,
  buildProductType,
  createProductTypeRootResolverDouble,
  createValidatorHarness,
} from '../support/inMemoryRepositories';

/*
 * Source-grounded constants
 * Every value here is read from a cited legacy line or from the fixture. Nothing is invented.
 */

/**
 * The unsaved primary-identifier value, from `model/entity/ProductType.cfc:L52`, which declares
 * both `unsavedvalue=""` and `default=""`. It is the sentinel `ProductType.isNew()` compares
 * against.
 */
const UNSAVED_PRODUCT_TYPE_ID = '';

/** The delimiter `productTypeIDPath` is built with. */
const ID_PATH_DELIMITER = ',';

/** The simple-representation separator, verbatim from `model/entity/ProductType.cfc:L275`. */
const SIMPLE_REPRESENTATION_SEPARATOR = ' &raquo; ';

/**
 * The eight persistent properties of `model/entity/ProductType.cfc:L52-L59`, in declaration order.
 */
const PERSISTENT_PROPERTY_NAMES = [
  'productTypeID',
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
] as const satisfies readonly ProductTypePropertyName[];

/**
 * The four audit properties of `model/entity/ProductType.cfc:L82-L86`, each declared
 * `hb_populateEnabled="false"`.
 */
const POPULATE_DISABLED_PROPERTY_NAMES = [
  'createdDateTime',
  'createdByAccount',
  'modifiedDateTime',
  'modifiedByAccount',
] as const satisfies readonly ProductTypePropertyName[];

/**
 * The `save` and `delete` contexts of `model/validation/ProductType.json:L2-L8` — the only two
 * contexts that document declares.
 */
const SAVE_CONTEXT: ValidationContext = 'save';
const DELETE_CONTEXT: ValidationContext = 'delete';

/**
 * A non-empty string that is verifiably not one of the three seeded `systemCode` values, borrowed
 * from the fixture rather than invented.
 */
const NON_DISCRIMINATOR_STRING = MERCHANDISE_PRODUCT_TYPE.productTypeName;

/** A persisted identifier for a product type this suite invents no data for. */
const OTHER_ROW_ID = `${MERCHANDISE_PRODUCT_TYPE_ID}-another-row`;

/* Local support factories. */

/** Read one declared member off a live `productType` by name, for the uniqueness probe. */
function readDeclaredProductTypeValue(
  productType: ProductType,
  propertyIdentifier: string,
): unknown {
  switch (propertyIdentifier) {
    case 'productTypeID':
      return productType.productTypeID;
    case 'urlTitle':
      return productType.urlTitle ?? '';
    case 'productTypeName':
      return productType.productTypeName ?? '';
    case 'systemCode':
      return productType.systemCode ?? '';
    case 'products':
      return productType.products;
    case 'childProductTypes':
      return productType.childProductTypes;
    default:
      return '';
  }
}

/** Wrap a real `productType` as the validation subject the rule set expects. */
function createProductTypeValidationSubject(
  productType: ProductType,
): ProductTypeValidationSubject {
  return {
    getClassName: (): string => PRODUCT_TYPE_CLASS_NAME,
    getEntityName: (): string => PRODUCT_TYPE_ENTITY_NAME,
    getPrimaryIDPropertyName: (): string => PRODUCT_TYPE_PRIMARY_ID_PROPERTY_NAME,
    getPrimaryIDValue: (): string => productType.productTypeID,
    hasProperty: (propertyIdentifier: string): boolean =>
      Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, propertyIdentifier),
    /*
     * `org/Hibachi/HibachiTransient.cfc:L738-L747` returns the entry when the key is present and
     * raises when it is absent — it never reports a silent miss. The raise is reproduced so an
     * undeclared name cannot quietly collapse into a passing uniqueness verdict.
     */
    getPropertyMetaData: (propertyName: string) => {
      if (!Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, propertyName)) {
        throw new TypeError(`ProductType declares no property named ${propertyName}`);
      }
      return { name: propertyName };
    },
    getValueByPropertyIdentifier: (propertyIdentifier: string): unknown =>
      readDeclaredProductTypeValue(productType, propertyIdentifier),
    products: productType.products,
    childProductTypes: productType.childProductTypes,
    ...(productType.productTypeName === undefined
      ? {}
      : { productTypeName: productType.productTypeName }),
    ...(productType.urlTitle === undefined ? {} : { urlTitle: productType.urlTitle }),
    ...(productType.systemCode === undefined ? {} : { systemCode: productType.systemCode }),
  };
}

/** A deliberately opaque stand-in for one attribute-set assignment. */
interface OpaqueAttributeSetAssignment {
  readonly testLocalLabel: string;
}

/**
 * Supply the D21 boundary capability.
 *
 * TODO(boundary): the rightful implementer is the `attributeService` family, which is out of scope,
 * reached through the SmartList abstraction the domain layer deliberately does not import. The
 * capability is declared and injected explicitly instead of being resolved through a locator, and
 * the member is never dropped from the interface.
 */
function createAttributeSetAssignmentSource(
  records: readonly InheritedAttributeSetAssignment[],
): InheritedAttributeSetAssignmentSource {
  return {
    getAttributeSetAssignmentRecords: (): readonly InheritedAttributeSetAssignment[] => records,
  };
}

/** One attribute-value owner that records which product type it was pointed at. */
interface RecordingAttributeValueOwner extends ProductTypeAttributeValueOwner {
  readonly assignedTo: readonly ProductType[];
  readonly removedFrom: readonly (ProductType | undefined)[];
}

function createRecordingAttributeValueOwner(): RecordingAttributeValueOwner {
  const assignedTo: ProductType[] = [];
  const removedFrom: (ProductType | undefined)[] = [];

  return {
    assignedTo,
    removedFrom,
    setProductType: (productType: ProductType): void => {
      assignedTo.push(productType);
    },
    removeProductType: (productType?: ProductType): void => {
      removedFrom.push(productType);
    },
  };
}

/** The six collaborators plus everything a case needs to observe about how they were used. */
interface DescriptorCollaboratorHarness {
  readonly collaborators: ProductTypePopulationCollaborators;
  /** Which populator ran, in order — `'productType'`, `'product'` or `'attributeValue'`. */
  readonly populated: readonly string[];
  /** Every owner the attribute-value loader minted, so a delegation can be read back off it. */
  readonly mintedAttributeValueOwners: readonly RecordingAttributeValueOwner[];
}

/**
 * Build the six collaborators `createProductTypePropertyDescriptorSet` requires, wrapped in a
 * harness that records how they were used.
 */
function createDescriptorCollaboratorHarness(): DescriptorCollaboratorHarness {
  const populated: string[] = [];
  const mintedAttributeValueOwners: RecordingAttributeValueOwner[] = [];

  return {
    populated,
    mintedAttributeValueOwners,
    collaborators: {
      productTypeLoader: {
        loadOrCreate: (): ProductType => new ProductType(),
        loadExisting: (): ProductType | undefined => undefined,
      },
      populateProductType: (): void => {
        populated.push('productType');
      },
      productLoader: {
        loadOrCreate: () => buildProduct(),
        loadExisting: () => undefined,
      },
      populateProduct: (): void => {
        populated.push('product');
      },
      attributeValueLoader: {
        loadOrCreate: (): ProductTypeAttributeValueOwner => {
          const owner = createRecordingAttributeValueOwner();
          mintedAttributeValueOwners.push(owner);
          return owner;
        },
        loadExisting: () => undefined,
      },
      populateAttributeValue: (): void => {
        populated.push('attributeValue');
      },
    },
  };
}

/**
 * Project one seeded fixture record onto the three transport facts of
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`.
 */
function projectSeedTransportFacts(record: {
  readonly productTypeID: string;
  readonly productTypeIDPath: string;
  readonly parentProductTypeID: string;
  readonly activeFlag: string;
}): {
  readonly idPathEqualsOwnID: boolean;
  readonly parentProductTypeID: string;
  readonly activeFlag: string;
} {
  return {
    idPathEqualsOwnID: record.productTypeIDPath === record.productTypeID,
    parentProductTypeID: record.parentProductTypeID,
    activeFlag: record.activeFlag,
  };
}

/* 1. the default entity contract. */

describe('ProductType — the default entity contract', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L52 — a fresh ProductType holds the blank unsaved identifier and reports isNew', () => {
    // The translation of `assert(entity.isNew())` and `assert(!len(entity.getPrimaryIDValue()))` at
    // meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67. `:L52` declares both
    // `unsavedvalue=""` and `default=""`, and the port initialises the field to the empty string, so
    // the two legacy assertions collapse onto one observable state.
    const productType = new ProductType();

    expect(productType.productTypeID).toBe(UNSAVED_PRODUCT_TYPE_ID);
    expect(productType.isNew()).toBe(true);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L52 — a persisted identifier makes isNew false, and nothing generates one', () => {
    // The identifier comes from the fixture, never from a generator: the port does not mint
    // identifiers in the domain layer and this file introduces no UUID helper.
    const productType = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    expect(productType.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE.productTypeID);
    expect(productType.isNew()).toBe(false);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L52 — productTypeID is the primary identifier property, and the class and entity names are the legacy ones', () => {
    // The translation of `assert(len(entity.getPrimaryIDPropertyName()))` at
    // meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62. `:L52` is the file's only
    // `fieldtype="id"` declaration. The class name and the logical entity name are read from
    // `:L49`'s component attributes and are what the reported error keys and the uniqueness
    // statement are composed from, which is why all three are asserted together.
    expect(PRODUCT_TYPE_PRIMARY_ID_PROPERTY_NAME).toBe('productTypeID');
    expect(PRODUCT_TYPE_PRIMARY_ID_PROPERTY_NAME.length).toBeGreaterThan(0);
    expect(PRODUCT_TYPE_CLASS_NAME).toBe('ProductType');
    expect(PRODUCT_TYPE_ENTITY_NAME).toBe('SlatwallProductType');
  });

  it('NET-NEW — model/entity/ProductType.cfc:L65-L67 — the three owned collections default to fresh, live, per-instance arrays', () => {
    const first = new ProductType();
    const second = new ProductType();

    expect(first.childProductTypes).toEqual([]);
    expect(first.products).toEqual([]);
    expect(first.attributeValues).toEqual([]);

    // Per instance, never shared. A collection hoisted to module scope would survive between warm
    // Lambda invocations and bleed one request's hierarchy into another's, which is the class of
    // execution-model mismatch this port flags rather than absorbs.
    expect(first.childProductTypes).not.toBe(second.childProductTypes);
    expect(first.products).not.toBe(second.products);

    // The getters hand back the live array, not a copy — `setParentProductType` appends through
    // `getChildProductTypes()` at model/entity/ProductType.cfc:L152, so a copy would make that
    // append a silent no-op.
    expect(first.getChildProductTypes()).toBe(first.childProductTypes);
    expect(first.getProducts()).toBe(first.products);
  });
});

/* 2. the eight persistent properties — `model/entity/ProductType.cfc:L52-L59` */

describe('ProductType — the eight persistent properties', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L52-L59 — all eight are declared, and remoteID, the relationships and the audit block are declared but are NOT among them', () => {
    for (const propertyName of PERSISTENT_PROPERTY_NAMES) {
      expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, propertyName)).toBe(true);
    }
    expect(PERSISTENT_PROPERTY_NAMES).toHaveLength(8);

    // `:L79-L80` remote, `:L61-L77` related-object, `:L82-L86` audit — every one declared, and every
    // one outside the count of eight. Keeping the four groups distinct is the point of this case.
    const declaredButNotPersistentEight = [
      'remoteID',
      'parentProductType',
      'childProductTypes',
      'products',
      'attributeValues',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'priceGroupRateExclusions',
      'attributeSets',
      'physicals',
      ...POPULATE_DISABLED_PROPERTY_NAMES,
    ] as const satisfies readonly ProductTypePropertyName[];

    for (const propertyName of declaredButNotPersistentEight) {
      expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, propertyName)).toBe(true);
      expect(PERSISTENT_PROPERTY_NAMES).not.toContain(propertyName);
    }

    // The whole declared surface, exhaustively: the twenty-one field properties above plus the four
    // audit properties, plus the single non-field declaration `parentProductTypeOptions` from
    // `:L89`. An entity gaining or losing a declaration fails here rather than drifting.
    expect(Object.keys(PRODUCT_TYPE_ENTITY_METADATA.properties)).toHaveLength(
      PERSISTENT_PROPERTY_NAMES.length + declaredButNotPersistentEight.length,
    );
    expect(PRODUCT_TYPE_ENTITY_METADATA.declaredNonFieldProperties).toEqual({
      parentProductTypeOptions: true,
    });
    expect(Object.keys(PRODUCT_TYPE_DECLARED_PROPERTIES)).toHaveLength(
      Object.keys(PRODUCT_TYPE_ENTITY_METADATA.properties).length + 1,
    );
  });

  it('NET-NEW — model/validation/ProductType.json:L8 — physicalCounts is NOT a ProductType property, and no field is invented to make its rule resolve', () => {
    // The entity declares `physicals` at model/entity/ProductType.cfc:L77, not `physicalCounts`.
    // The stale validation key is deliberately left un-normalised on both sides: the rule stays in
    // the ported rule set and the entity gains no field, which is what keeps the rule inert exactly
    // as org/Hibachi/HibachiValidationService.cfc:L171 leaves it.
    //
    // TODO(parity) — model/validation/ProductType.json:L8 references a property this entity does not
    // declare. Not repaired here, and not repaired in the rule set either.
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicals')).toBe(true);
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicalCounts')).toBe(false);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L53-L59 — the seven non-identifier persistent members read as absent on a fresh instance and hold what is written to them', () => {
    const fresh = new ProductType();

    // Absence is asserted through the field, not through key presence — and that choice is the
    // interesting part of this case rather than an accident of convenience.
    expect(fresh.productTypeIDPath).toBeUndefined();
    expect(fresh.activeFlag).toBeUndefined();
    expect(fresh.publishedFlag).toBeUndefined();
    expect(fresh.urlTitle).toBeUndefined();
    expect(fresh.productTypeName).toBeUndefined();
    expect(fresh.productTypeDescription).toBeUndefined();
    expect(fresh.systemCode).toBeUndefined();

    // The other representation, proved to converge on the same reading: delete the key exactly as
    // population does for a null column, and the member still reads as absent.
    delete fresh.systemCode;
    expect(Object.hasOwn(fresh, 'systemCode')).toBe(false);
    expect(fresh.systemCode).toBeUndefined();

    // Values come from the seeded fixture row wherever one exists, so no discriminator value is
    // invented. `productTypeDescription` has no seeded value — `config/dbdata/
    // SlatwallProductType.xml.cfm:L3-L11` declares no such column — so the fixture's own
    // `productTypeName` stands in for a free-text string rather than a made-up sentence.
    const populated = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE.productTypeIDPath,
      productTypeName: SUBSCRIPTION_PRODUCT_TYPE.productTypeName,
      urlTitle: SUBSCRIPTION_PRODUCT_TYPE.urlTitle,
      systemCode: SUBSCRIPTION_PRODUCT_TYPE.systemCode,
      productTypeDescription: SUBSCRIPTION_PRODUCT_TYPE.productTypeName,
      activeFlag: true,
      publishedFlag: false,
    });

    expect(populated.productTypeIDPath).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    expect(populated.productTypeName).toBe('Subscription');
    expect(populated.urlTitle).toBe('subscription');
    expect(populated.systemCode).toBe('subscription');
    expect(populated.productTypeDescription).toBe('Subscription');
    expect(populated.activeFlag).toBe(true);

    // `:L55` declares `publishedFlag` as an ORM boolean with no default, so a written `false` must
    // survive as the boolean and not be coerced into the truthy string CFML would accept.
    expect(populated.publishedFlag).toBe(false);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L82-L86 — the four audit members read as absent on a fresh instance, and the lifecycle hook is what fills them', () => {
    const fresh = new ProductType();

    // Read through the fields for the reason given above: absence is a value reading in this port,
    // not a key reading.
    expect(fresh.createdDateTime).toBeUndefined();
    expect(fresh.createdByAccount).toBeUndefined();
    expect(fresh.modifiedDateTime).toBeUndefined();
    expect(fresh.modifiedByAccount).toBeUndefined();

    // Asserted a second time by name, driven off the shared audit-name list, so a future rename can
    // never leave this case silently passing against a member that no longer exists.
    for (const propertyName of POPULATE_DISABLED_PROPERTY_NAMES) {
      expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, propertyName)).toBe(true);
    }

    // `:L83-L86` marks all four `hb_populateEnabled="false"` precisely because the ORM lifecycle owns
    // them, never a caller. Running the insert hook is what puts values in them, and it does so
    // without any audit actor — the account half stays absent when no actor is known, rather than
    // being back-filled with a fabricated identity.
    fresh.preInsert();
    expect(fresh.createdDateTime).toBeInstanceOf(Date);
    expect(fresh.modifiedDateTime).toBeInstanceOf(Date);
    expect(fresh.createdByAccount).toBeUndefined();
    expect(fresh.modifiedByAccount).toBeUndefined();
  });
});

/* 3. the population descriptor set — `createProductTypePropertyDescriptorSet` */

describe('ProductType — the population descriptor set', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L49 — the set names the class, declares it persistent and describes every populatable property once', () => {
    const descriptorSet = createProductTypePropertyDescriptorSet(
      createDescriptorCollaboratorHarness().collaborators,
    );

    expect(descriptorSet.entityName).toBe(PRODUCT_TYPE_CLASS_NAME);
    // `:L49` declares `persistent="true"`, so the population guard does not short-circuit for this
    // entity.
    expect(descriptorSet.persistent).toBe(true);

    // Eight persistent columns, then the four traversable relationships, then the remote property,
    // then the four audit properties. The eight many-to-many-inverse collections of `:L70-L77` are
    // deliberately not described: none is traversed by any ported member and every collaborator
    // involved is out of scope.
    expect(descriptorSet.properties.map((descriptor) => descriptor.name)).toEqual([
      ...PERSISTENT_PROPERTY_NAMES,
      'parentProductType',
      'childProductTypes',
      'products',
      'attributeValues',
      'remoteID',
      ...POPULATE_DISABLED_PROPERTY_NAMES,
    ]);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L82-L86 — EXACTLY the four audit properties are populate-disabled', () => {
    const descriptorSet = createProductTypePropertyDescriptorSet(
      createDescriptorCollaboratorHarness().collaborators,
    );

    const populateDisabled = descriptorSet.properties
      .filter((descriptor) => descriptor.populateEnabled === false)
      .map((descriptor) => descriptor.name);

    expect(populateDisabled).toEqual([...POPULATE_DISABLED_PROPERTY_NAMES]);
    expect(populateDisabled).toHaveLength(4);

    // Not nine, and not a sibling entity's list. Every other described property stays populatable,
    // including the primary identifier's own descriptor, so the exclusion set is precisely the four
    // properties ProductType itself marks `hb_populateEnabled="false"`.
    const populatable = descriptorSet.properties
      .filter((descriptor) => descriptor.populateEnabled !== false)
      .map((descriptor) => descriptor.name);

    expect(populatable).toContain('productTypeID');
    expect(populatable).toHaveLength(descriptorSet.properties.length - 4);
    for (const propertyName of POPULATE_DISABLED_PROPERTY_NAMES) {
      expect(populatable).not.toContain(propertyName);
    }
  });

  it('NET-NEW — model/entity/ProductType.cfc:L62-L67 — the relationship descriptors carry the legacy field types and singular names', () => {
    const descriptorSet = createProductTypePropertyDescriptorSet(
      createDescriptorCollaboratorHarness().collaborators,
    );

    const kindByName = descriptorSet.properties.map((descriptor) => ({
      name: descriptor.name,
      kind:
        descriptor.populateEnabled === false
          ? 'populate-disabled'
          : 'kind' in descriptor && descriptor.kind !== undefined
            ? descriptor.kind
            : 'column',
    }));

    // `:L62` many-to-one, `:L65`-`:L67` one-to-many. This is also the declarative statement of the
    // self-reference `:L49`'s `hb_parentPropertyName="parentProductType"` names.
    expect(kindByName).toContainEqual({ name: 'parentProductType', kind: 'many-to-one' });
    expect(kindByName).toContainEqual({ name: 'childProductTypes', kind: 'one-to-many' });
    expect(kindByName).toContainEqual({ name: 'products', kind: 'one-to-many' });
    expect(kindByName).toContainEqual({ name: 'attributeValues', kind: 'one-to-many' });
    expect(kindByName).toContainEqual({ name: 'systemCode', kind: 'column' });
    expect(kindByName).toContainEqual({ name: 'createdDateTime', kind: 'populate-disabled' });

    // The `singularname` attributes of `:L65`, `:L66` and `:L67` verbatim. They are what the legacy
    // framework's `add<singularName>` synthesis keyed off, so they are behaviour rather than
    // decoration — `addChildProductType`, `addProduct` and `addAttributeValue` are the members it
    // fabricated, and each is now declared explicitly on the class.
    const singularNames = descriptorSet.properties.flatMap((descriptor) =>
      'singularName' in descriptor
        ? [{ name: descriptor.name, singularName: descriptor.singularName }]
        : [],
    );

    expect(singularNames).toEqual([
      { name: 'childProductTypes', singularName: 'childProductType' },
      { name: 'products', singularName: 'product' },
      { name: 'attributeValues', singularName: 'attributeValue' },
    ]);
  });

  it('NET-NEW — IR-1 — each relationship descriptor DELEGATES to the entity own declared member rather than re-implementing the collection semantics', () => {
    const harness = createDescriptorCollaboratorHarness();
    const descriptorSet = createProductTypePropertyDescriptorSet(harness.collaborators);
    const target = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    // Read the four related-object descriptors back out of the set, through the populate-enabled
    // narrowing rather than an assertion, so a descriptor that had become populate-disabled would
    // fail the narrowing instead of silently reporting nothing.
    const relatedDescriptors = descriptorSet.properties.flatMap((descriptor) =>
      descriptor.populateEnabled !== false && 'populateRelated' in descriptor
        ? [{ name: descriptor.name, descriptor }]
        : [],
    );

    expect(relatedDescriptors.map((entry) => entry.name)).toEqual([
      'parentProductType',
      'childProductTypes',
      'products',
      'attributeValues',
    ]);

    // Only the three collection sides carry `addRelated`. The many-to-one `:L62` does not, because
    // population assigns a single reference directly instead of routing through an `add` member —
    // which is also why the legacy synthesized no `addParentProductType`.
    expect(
      relatedDescriptors.flatMap((entry) => ('addRelated' in entry.descriptor ? [entry.name] : [])),
    ).toEqual(['childProductTypes', 'products', 'attributeValues']);

    for (const entry of relatedDescriptors) {
      const related = entry.descriptor.loader.loadOrCreate('');
      if ('addRelated' in entry.descriptor) {
        entry.descriptor.addRelated(target, related);
      }
      entry.descriptor.populateRelated(related, {});
    }

    // The point of the case. The legacy framework fabricated `add<singularName>` by prefix dispatch
    // (`org/Hibachi/HibachiService.cfc:L255-L281`), and the port declares each member explicitly, so
    // the descriptor must route through the declared member and must not carry its own copy of the
    // relationship rule. Each of the three observable effects below can only have been produced by
    // the entity's own member:
    // `addChildProductType` — `:L167-L169` delegates to `setParentProductType`, which appends the
    // child and back-points it. Both halves are visible here.
    // `addProduct` — `:L101-L107`'s companion re-points the product without appending,
    // because the legacy declares this side `inverse="true"`.
    // `addAttributeValue` — reaches into the owner rather than into this entity's array.
    expect(target.childProductTypes).toHaveLength(1);
    expect(target.childProductTypes.map((child) => child.parentProductType)).toEqual([target]);
    expect(target.products).toEqual([]);
    expect(harness.mintedAttributeValueOwners).toHaveLength(1);
    expect(harness.mintedAttributeValueOwners.map((owner) => owner.assignedTo)).toEqual([[target]]);
    expect(target.attributeValues).toEqual([]);

    // And each descriptor's sub-property populator routes to the injected collaborator for the
    // related type, in the descriptor set's own declaration order. `productType` appears twice
    // because both the many-to-one parent and the one-to-many child side relate to this same class.
    expect(harness.populated).toEqual(['productType', 'productType', 'product', 'attributeValue']);

    // The symmetric remove member, closing the pair rather than leaving half a contract asserted. It
    // reaches into the owner exactly as the add member does, and it touches only the two members
    // `ProductTypeAttributeValueOwner` declares — no attribute-domain behaviour is asserted, and the
    // entity's own array stays untouched on both sides because the legacy declares this collection
    // `inverse="true"`.
    for (const owner of harness.mintedAttributeValueOwners) {
      target.removeAttributeValue(owner);
    }

    expect(harness.mintedAttributeValueOwners.map((owner) => owner.removedFrom)).toEqual([
      [target],
    ]);
    expect(target.attributeValues).toEqual([]);
  });
});

/* 4. the seeded discriminators — `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` */

describe('ProductType — the three seeded discriminators', () => {
  it('NET-NEW — config/dbdata/SlatwallProductType.xml.cfm:L13-L15 — exactly three rows are seeded, and each is keyed by its own systemCode', () => {
    expect(ALL_SEEDED_PRODUCT_TYPES).toHaveLength(3);

    // The three `systemCode` values production logic branches on. These are the literal branch keys
    // of the SKU-combination discriminator, so a single wrong character would silently stop a branch
    // from ever matching, with no compile error anywhere.
    expect(Object.keys(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE)).toEqual([
      'merchandise',
      'subscription',
      'contentAccess',
    ]);
    expect(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise).toBe(MERCHANDISE_PRODUCT_TYPE);
    expect(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription).toBe(SUBSCRIPTION_PRODUCT_TYPE);
    expect(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess).toBe(CONTENT_ACCESS_PRODUCT_TYPE);

    // The three standalone identifier constants and the identifiers held on the records are the same
    // values — asserted structurally so no hexadecimal literal is duplicated here.
    expect(MERCHANDISE_PRODUCT_TYPE.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(SUBSCRIPTION_PRODUCT_TYPE.productTypeID).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    expect(CONTENT_ACCESS_PRODUCT_TYPE.productTypeID).toBe(CONTENT_ACCESS_PRODUCT_TYPE_ID);

    // CFML's string `==` folds case, TypeScript's `===` does not. The legacy discriminator
    // comparisons would also have matched `'Merchandise'` or `'MERCHANDISE'`; the ported comparison
    // will not. Keeping the seeded exact-case literals is the correct translation, because the
    // seeded rows are the only values those comparisons can legitimately see, but the narrowing is a
    // real behavioural divergence, which is why the fixture discriminators are intentionally exact,
    // immutable constants and are never re-cased, dashed, slugged or derived.
    expect(MERCHANDISE_PRODUCT_TYPE.systemCode).not.toBe(MERCHANDISE_PRODUCT_TYPE.productTypeName);
  });

  it('NET-NEW — config/dbdata/SlatwallProductType.xml.cfm:L13-L15 — every seeded row is a ROOT: its identifier path is its own identifier, its parent renders as the literal NULL and its active flag renders as the literal 1', () => {
    // The projection is documentary: it reads the fixture record and reshapes nothing. These are XML
    // transport strings — this seed-data format spells SQL NULL as the four-character string `NULL`
    // and renders the `datatype="bit"` column (`:L10`) as the one-character string `1`. They are kept
    // strictly distinct from the entity's own representation, which models the same two concepts as
    // an absent `parentProductType` reference and a `boolean` `activeFlag`.
    for (const seededRecord of ALL_SEEDED_PRODUCT_TYPES) {
      expect(projectSeedTransportFacts(seededRecord)).toEqual({
        idPathEqualsOwnID: true,
        parentProductTypeID: 'NULL',
        activeFlag: '1',
      });
    }

    // Stated positively as well, because it is the fact the hierarchy cases below rely on: all three
    // seeded product types are roots, so no seeded row is ever the child of another.
    expect(MERCHANDISE_PRODUCT_TYPE.productTypeIDPath).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(SUBSCRIPTION_PRODUCT_TYPE.productTypeIDPath).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    expect(CONTENT_ACCESS_PRODUCT_TYPE.productTypeIDPath).toBe(CONTENT_ACCESS_PRODUCT_TYPE_ID);
  });

  it('NET-NEW — config/dbdata/SlatwallProductType.xml.cfm:L15 — the content-access row preserves three independent, byte-exact renderings of one concept', () => {
    // one legacy line, three different spellings, none derived from another: title case with a
    // space, camelCase, and kebab-case. There is no slug helper, no `replace` and no case folding
    // between them. Normalising any one of them to match another would change data the legacy system
    // treats as three independent columns, so the asymmetry is asserted rather than tidied.
    expect(CONTENT_ACCESS_PRODUCT_TYPE.productTypeName).toBe('Content Access');
    expect(CONTENT_ACCESS_PRODUCT_TYPE.systemCode).toBe('contentAccess');
    expect(CONTENT_ACCESS_PRODUCT_TYPE.urlTitle).toBe('content-access');

    // All three differ from one another, which is the property a well-meant "tidy-up" would destroy.
    expect(
      new Set([
        CONTENT_ACCESS_PRODUCT_TYPE.productTypeName,
        CONTENT_ACCESS_PRODUCT_TYPE.systemCode,
        CONTENT_ACCESS_PRODUCT_TYPE.urlTitle,
      ]).size,
    ).toBe(3);
  });
});

/*
 * 5. the self-referencing hierarchy — `model/entity/ProductType.cfc:L49`, `:L62-L67`, `:L149-L172`
 */

describe('ProductType — the self-referencing hierarchy', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L149-L153 — setting a parent assigns the reference and appends the child to the parent live collection', () => {
    // synthetic arrangement. Two seeded identifiers, borrowed as verified constants only.
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });

    child.setParentProductType(parent);

    // `:L150` assigns first, `:L151-L153` appends second. The order matters because the guard's
    // second operand calls back into the parent.
    expect(child.parentProductType).toBe(parent);
    expect(parent.getChildProductTypes()).toEqual([child]);
    expect(parent.hasChildProductType(child)).toBe(true);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L151 — a PERSISTED child is appended only once, because the membership guard is actually evaluated', () => {
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });

    child.setParentProductType(parent);
    child.setParentProductType(parent);

    // `isNew()` is false, so `isNew() or !parent.hasChildProductType(this)` evaluates its second
    // operand, finds the child already present and skips the append.
    expect(parent.getChildProductTypes()).toEqual([child]);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L151 — a NEW child is appended UNCONDITIONALLY, so a second call appends it twice', () => {
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = new ProductType();

    child.setParentProductType(parent);
    child.setParentProductType(parent);

    // TODO(parity) — model/entity/ProductType.cfc:L151. the short-circuit is the behaviour. CFML's
    // `or` never evaluates `hasChildProductType` once `isNew()` is true, so an unsaved child is
    // appended every time. TypeScript's `||` short-circuits identically, so the duplicate is
    // preserved verbatim. The membership test must not be hoisted out of the `||` "for clarity" —
    // hoisting it is precisely the repair that is forbidden here.
    expect(parent.getChildProductTypes()).toEqual([child, child]);
    expect(parent.getChildProductTypes()).toHaveLength(2);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L155-L164 — removing an EXPLICIT parent splices the child out and clears the child parent reference', () => {
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: parent,
    });

    child.removeParentProductType(parent);

    // `:L159-L162` finds the index and deletes at it; `:L163` then deletes the key unconditionally.
    expect(parent.getChildProductTypes()).toEqual([]);
    expect(parent.hasChildProductType(child)).toBe(false);
    expect(Object.hasOwn(child, 'parentProductType')).toBe(false);
    expect(child.parentProductType).toBeUndefined();
  });

  it('NET-NEW — model/entity/ProductType.cfc:L156-L158 — an OMITTED parent argument defaults to the child own parent reference', () => {
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      parentProductType: parent,
    });

    // `:L156-L158` reproduces `if(!structKeyExists(arguments, "parentProductType"))` by defaulting
    // from the entity's own field, which is why the no-argument form still finds the right parent.
    child.removeParentProductType();

    expect(parent.getChildProductTypes()).toEqual([]);
    expect(Object.hasOwn(child, 'parentProductType')).toBe(false);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L157 — the doubly-degenerate call, no argument on a ROOT, FAILS exactly as the legacy does', () => {
    /*
     * The call fails rather than being guarded into a safe no-op. Guarding the whole body could be
     * argued as a hardening of an unreachable-in-practice path, but a hardening that turns a
     * failure into a success is a behaviour change, and AAP §0.6.7 admits exactly one behaviour
     * repair — D18, the importer's SQL parameterisation (§0.6.7.7).
     */
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    expect(() => {
      root.removeParentProductType();
    }).toThrow(TypeError);
    // The diagnostic names the legacy locator, so the parity story travels with the failure.
    expect(() => {
      root.removeParentProductType();
    }).toThrow(/model\/entity\/ProductType\.cfc:L157/);

    // Nothing moved. The legacy raises before its delete, so a failed call performs no write — the
    // root is exactly as it was, and no partial state distinguishes a failure from a success.
    expect(root.parentProductType).toBeUndefined();
    expect(root.getChildProductTypes()).toEqual([]);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L160-L163 — the parent reference is cleared even when the child was never in that parent collection', () => {
    const unrelatedParent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const realParent = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      parentProductType: realParent,
    });

    child.removeParentProductType(unrelatedParent);

    // The splice is guarded by `index > 0` at `:L160`, but the `structDelete` at `:L163` is not
    // guarded at all. So the real parent keeps the child while the child loses its back-reference —
    // an asymmetry carried across exactly as written.
    expect(unrelatedParent.getChildProductTypes()).toEqual([]);
    expect(realParent.getChildProductTypes()).toEqual([child]);
    expect(Object.hasOwn(child, 'parentProductType')).toBe(false);
  });

  it('NET-NEW — IR-1 — hasChildProductType answers by object identity and reports both membership and absence', () => {
    // No source declaration EXISTS for this member. `model/entity/ProductType.cfc:L151` calls it,
    // but it appears nowhere in that file: the legacy framework fabricated `has<singularName>` at
    // runtime from the `singularname="childProductType"` attribute of `:L65`. TypeScript under
    // `strict` has no equivalent facility, so the port declares it explicitly.
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const member = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: parent,
    });

    // A different instance carrying the same identifier is not a member. The legacy `arrayFind` used
    // by the sibling remover compares object references, and the ported membership test does the
    // same, so identity — not identifier equality — is the contract.
    const twinByIdentifier = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });

    expect(parent.hasChildProductType(member)).toBe(true);
    expect(parent.hasChildProductType(twinByIdentifier)).toBe(false);
    expect(twinByIdentifier.productTypeID).toBe(member.productTypeID);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L167-L172 — the child-side helpers are pure delegations, and the rename is an API-language adaptation only', () => {
    // the legacy spelling is lowercase-`c`: `addchildProductType` at `:L167` and
    // `removechildProductType` at `:L170`, while the declared ORM property at `:L65` is
    // `childProductTypes` with `singularname="childProductType"`. CFML method names are case-
    // insensitive, so the mismatch is invisible there; TypeScript is case-sensitive, and carrying
    // the lowercase spelling across would have produced members no caller could name consistently.
    // The port therefore uses `addChildProductType` and `removeChildProductType`.
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });

    parent.addChildProductType(child);

    expect(child.parentProductType).toBe(parent);
    expect(parent.getChildProductTypes()).toEqual([child]);

    parent.removeChildProductType(child);

    expect(parent.getChildProductTypes()).toEqual([]);
    expect(Object.hasOwn(child, 'parentProductType')).toBe(false);
  });
});

/* 6. the identifier path — `model/entity/ProductType.cfc:L53`, `:L250-L255`, `:L305-L313` */

describe('ProductType — the identifier path', () => {
  it('NET-NEW — org/Hibachi/HibachiEntity.cfc:L308-L324 — a brand-new root yields the blank path', () => {
    // `listPrepend("", "")` is the empty string, and an unsaved entity's primary-identifier value is
    // the empty string (`model/entity/ProductType.cfc:L52`), so the documented result for a
    // brand-new root is a blank path rather than a single empty segment or a bare delimiter.
    const newRoot = new ProductType();

    expect(newRoot.getProductTypeIDPath()).toBe('');
    expect(newRoot.getProductTypeIDPath()).not.toContain(ID_PATH_DELIMITER);
  });

  it('NET-NEW — org/Hibachi/HibachiEntity.cfc:L315 — an existing root yields exactly its own identifier', () => {
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    expect(root.getProductTypeIDPath()).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(root.getProductTypeIDPath()).not.toContain(ID_PATH_DELIMITER);
  });

  it('NET-NEW — org/Hibachi/HibachiEntity.cfc:L314-L321 — the path is comma-delimited, ROOT-FIRST and SELF-LAST across three levels', () => {
    // synthetic arrangement. Three seeded identifiers are borrowed as verified constants to
    // build a three-level chain. The seeded rows themselves are all roots; nothing here claims
    // otherwise.
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const middle = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: root,
    });
    const leaf = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      parentProductType: middle,
    });

    // `listPrepend` puts each ancestor in front of what has been accumulated, which is what makes the
    // walk root-first even though it starts at the leaf. The delimiter is the CFML list default,
    // because `:L315` supplies none.
    const expectedLeafPath = [
      MERCHANDISE_PRODUCT_TYPE_ID,
      SUBSCRIPTION_PRODUCT_TYPE_ID,
      CONTENT_ACCESS_PRODUCT_TYPE_ID,
    ].join(ID_PATH_DELIMITER);

    expect(leaf.getProductTypeIDPath()).toBe(expectedLeafPath);
    expect(leaf.getProductTypeIDPath().split(ID_PATH_DELIMITER)).toHaveLength(3);

    // Self-last, root-first: the leaf's own identifier is the final segment and the root's is the
    // first, which is precisely what `getBaseProductType()` relies on when it takes the first
    // element.
    expect(leaf.getProductTypeIDPath().startsWith(MERCHANDISE_PRODUCT_TYPE_ID)).toBe(true);
    expect(leaf.getProductTypeIDPath().endsWith(CONTENT_ACCESS_PRODUCT_TYPE_ID)).toBe(true);
    expect(middle.getProductTypeIDPath()).toBe(
      [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID].join(ID_PATH_DELIMITER),
    );

    // TODO(parity) — the recursive ascent at org/Hibachi/HibachiEntity.cfc:L314-L321 has no cycle
    // guard: a product type reachable from itself through `parentProductType` would loop forever. The
    // ported walk reproduces that faithfully rather than adding a visited-set the legacy never had.
    // No cycle is constructed anywhere in this file, and no case can recurse indefinitely.
  });

  it('NET-NEW — model/entity/ProductType.cfc:L250-L255 — the path is built once and memoized into the entity own field', () => {
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: root,
    });

    // Before the first read the field reads as absent — the lazy build has not run. Read as a value
    // for the reason set out in the persistent-property group: this port has two representations of
    // absence and no consumer distinguishes them.
    expect(child.productTypeIDPath).toBeUndefined();

    const firstRead = child.getProductTypeIDPath();

    // `:L251-L253` writes the built value back into `variables.productTypeIDPath`, which is
    // SIMULTANEOUSLY the ORM property and the cache — so the memo slot is the persistent field
    // itself, exactly as in the legacy, and no separate cache is introduced.
    expect(child.productTypeIDPath).toBe(firstRead);
    expect(child.getProductTypeIDPath()).toBe(firstRead);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L251 — the memo is PER INSTANCE and can never be module-global', () => {
    const firstRoot = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const secondRoot = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });

    // Reading one must not populate, prime or influence the other. Module-scope state survives on a
    // warm Lambda container across invocations and would bleed one request's hierarchy into
    // another's — the mismatch this port flags rather than absorbs — so this case exists to pin the
    // absence of any shared slot. This file adds no shared mutable module state of its own either.
    expect(firstRoot.getProductTypeIDPath()).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(secondRoot.productTypeIDPath).toBeUndefined();
    expect(secondRoot.getProductTypeIDPath()).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);
    expect(firstRoot.getProductTypeIDPath()).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L305-L308 — preInsert recomputes the path UNCONDITIONALLY, overwriting a stale memo', () => {
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });

    // Read the path while the child is still a root, so the memo holds the root-shaped value.
    expect(child.getProductTypeIDPath()).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);

    child.setParentProductType(root);

    // The lazy getter does not INVALIDATE itself. `:L251` only builds when the field is null, so
    // after re-parenting the memoized value is stale — and that is the legacy behaviour, carried
    // across rather than repaired. The recomputation boundary is the ORM hook, not the getter.
    expect(child.getProductTypeIDPath()).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);

    child.preInsert();

    // `:L306` calls the path builder directly and assigns the result, overwriting whatever the lazy
    // read had memoized. A forced refresh is the whole point: without it a re-parented product type
    // would persist its old ancestry. The hook must therefore never be "optimised" into a call to the
    // lazy getter.
    expect(child.getProductTypeIDPath()).toBe(
      [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID].join(ID_PATH_DELIMITER),
    );

    // TODO(boundary) — in the legacy this hook fires itself, as part of the flush the retired
    // framework triggered at request end. A stateless invocation has no ORM session, no automatic
    // flush and no request-end hook, so `src/adapters/mysql/UnitOfWork.ts` must call it explicitly at
    // its transaction boundary. Nothing is persisted here and no unit-of-work double is fabricated:
    // This case observes the hook's own path recomputation and nothing else. The audit stamping the
    // hook also performs is delegated to the shared audit helpers and is not this case's subject.
  });

  it('NET-NEW — model/entity/ProductType.cfc:L310-L313 — preUpdate recomputes the path the same way, and the oldData snapshot is accepted without being read', () => {
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: root,
    });

    // The seeded path is deliberately the stale root-shaped one, standing in for a row loaded from
    // the database before it was re-parented.
    expect(child.productTypeIDPath).toBe(SUBSCRIPTION_PRODUCT_TYPE_ID);

    // The pre-modification snapshot Hibernate handed the hook keeps the first parameter position for
    // signature fidelity with the legacy `struct oldData`. It is deliberately not forwarded onward:
    // The audit block that received it in the legacy reads it nowhere, because the fields written
    // depend only on the clock and the actor.
    child.preUpdate({ productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID });

    expect(child.productTypeIDPath).toBe(
      [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID].join(ID_PATH_DELIMITER),
    );

    // Calling it with no snapshot at all behaves identically, which is what makes the parameter
    // genuinely optional rather than merely tolerated.
    child.productTypeIDPath = SUBSCRIPTION_PRODUCT_TYPE_ID;
    child.preUpdate();

    expect(child.productTypeIDPath).toBe(
      [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID].join(ID_PATH_DELIMITER),
    );
  });
});

/* 7. the simple representation — `model/entity/ProductType.cfc:L273-L278` */

describe('ProductType — the simple representation', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L277 — a root simple representation is exactly its productTypeName', () => {
    const root = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
    });

    // `:L274` finds no parent, so `:L277` returns the name unadorned — no separator, no prefix.
    expect(root.getSimpleRepresentation()).toBe('Merchandise');
    expect(root.getSimpleRepresentation()).not.toContain(SIMPLE_REPRESENTATION_SEPARATOR);
    expect(typeof root.getSimpleRepresentation()).toBe('string');
  });

  it('NET-NEW — model/entity/ProductType.cfc:L275 — a child recursively composes parent and child names with the exact separator', () => {
    // synthetic arrangement, and the names are fixture names rather than invented catalog
    // names. The seeded rows remain root-only; this parent/child pair exists solely to reach the
    // recursive arm.
    const root = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
    });
    const child = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      productTypeName: CONTENT_ACCESS_PRODUCT_TYPE.productTypeName,
      parentProductType: root,
    });

    // The separator is the HTML entity reference with one space on each side, byte-exact from
    // `:L275`. It is not decoded to the character it denotes: the legacy emits these characters, and
    // decoding here would make target output differ from legacy output.
    expect(child.getSimpleRepresentation()).toBe('Merchandise &raquo; Content Access');
    expect(child.getSimpleRepresentation()).toBe(
      `Merchandise${SIMPLE_REPRESENTATION_SEPARATOR}Content Access`,
    );

    // Three levels compose left-to-right from the root, because `:L275` recurses into the parent
    // first and appends its own name last.
    const grandchild = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeName: SUBSCRIPTION_PRODUCT_TYPE.productTypeName,
      parentProductType: child,
    });

    expect(grandchild.getSimpleRepresentation()).toBe(
      'Merchandise &raquo; Content Access &raquo; Subscription',
    );

    // TODO(parity) — the recursion at model/entity/ProductType.cfc:L274-L275 has no cycle guard,
    // exactly like the identifier-path walk it mirrors. It is preserved as written; no cycle is
    // constructed here and the defect is neither triggered nor repaired.
  });

  it('NET-NEW — model/entity/ProductType.cfc:L273-L278 — an absent productTypeName yields no representation, at either level', () => {
    // The legacy is declared `public string function` yet `:L277` returns whatever
    // `getProductTypeName()` yields, which is null for a row that has none — a state
    // `model/validation/ProductType.json:L3` only prevents at save time, never at read time. The port
    // represents that state as `undefined` rather than inventing a placeholder string, and a child
    // whose parent has no name is undefined for the same reason: `:L275` would have concatenated a
    // null.
    const namelessRoot = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const namedChild = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeName: SUBSCRIPTION_PRODUCT_TYPE.productTypeName,
      parentProductType: namelessRoot,
    });

    expect(namelessRoot.getSimpleRepresentation()).toBeUndefined();
    expect(namedChild.getSimpleRepresentation()).toBeUndefined();
  });
});

/* 8. getBaseProductType — `model/entity/ProductType.cfc:L109-L115` */

describe('ProductType — getBaseProductType', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L114 — a non-empty own systemCode is returned directly, and the root resolver is never consulted', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: MERCHANDISE_PRODUCT_TYPE.systemCode,
    });
    const rootResolver = createProductTypeRootResolverDouble();

    await expect(productType.getBaseProductType(rootResolver.resolver)).resolves.toBe(
      'merchandise',
    );

    // `:L111`'s guard fails, so `:L112` is never reached and no lookup happens at all. Asserting the
    // absence of the call is the only way to prove the short-circuit rather than merely the result.
    expect(rootResolver.requestedProductTypeIds).toEqual([]);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L111-L112 — an UNSET systemCode resolves the FIRST identifier of the path and returns the root code', async () => {
    // synthetic arrangement: a seeded identifier is reused as a child so the walk has an
    // ancestor to find. The seeded rows are all roots.
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: root,
    });
    const rootResolver = createProductTypeRootResolverDouble();

    // The first of the two missing forms: nothing was ever written, so the member reads as
    // `undefined` — the port's rendering of the legacy `isNull(getSystemCode())` half of `:L111`.
    expect(child.systemCode).toBeUndefined();

    await expect(child.getBaseProductType(rootResolver.resolver)).resolves.toBe('merchandise');

    // `listFirst(getProductTypeIDPath())` takes the root identifier, never the entity's own — which is
    // exactly what makes the path's root-first ordering load-bearing.
    expect(rootResolver.requestedProductTypeIds).toEqual([MERCHANDISE_PRODUCT_TYPE_ID]);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L111 — an EMPTY-STRING systemCode takes the same resolver branch as an unset one', async () => {
    const root = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      systemCode: '',
      parentProductType: root,
    });
    const rootResolver = createProductTypeRootResolverDouble();

    // `:L111` is `isNull(getSystemCode()) || getSystemCode() == ""` — two missing forms, not one, and
    // the port keeps both because the legacy tested both. The blank string is a genuinely different
    // value from the previous case's `undefined`, it is not falsy-collapsed into it anywhere, and it
    // must take the same resolver branch. Under `exactOptionalPropertyTypes` writing `''` is also the
    // only way to reach this arm without writing `undefined`, which the declared type forbids.
    expect(child.systemCode).toBe('');
    expect(child.systemCode).not.toBeUndefined();

    await expect(child.getBaseProductType(rootResolver.resolver)).resolves.toBe('subscription');
    expect(rootResolver.requestedProductTypeIds).toEqual([SUBSCRIPTION_PRODUCT_TYPE_ID]);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L110 — the result stays a GENERAL string: an unrecognised code is returned as-is, from either branch, and nothing raises', async () => {
    // the legacy member is declared `public any function` and returns whatever the row holds. Nothing
    // in the schema or in model/validation/ProductType.json constrains `systemCode` to the three
    // seeded values, so narrowing the result to those three would delete an observable legacy
    // behaviour — the unrecognised path is genuinely reachable, and the downstream fallthrough that
    // depends on it must stay reachable too. `NON_DISCRIMINATOR_STRING` is the fixture's own
    // `productTypeName`, a verified value that is not one of the three system codes.
    const ownCode = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: NON_DISCRIMINATOR_STRING,
    });
    const unusedResolver = createProductTypeRootResolverDouble();

    await expect(ownCode.getBaseProductType(unusedResolver.resolver)).resolves.toBe(
      NON_DISCRIMINATOR_STRING,
    );
    expect(unusedResolver.requestedProductTypeIds).toEqual([]);

    // And through the resolver branch, where the root itself carries an unrecognised code. The value
    // is passed through untouched: no recognition, no canonicalisation and no raise.
    const root = buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      parentProductType: root,
    });
    const resolverWithUnrecognisedRoot = createProductTypeRootResolverDouble([
      { productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID, systemCode: NON_DISCRIMINATOR_STRING },
    ]);

    await expect(child.getBaseProductType(resolverWithUnrecognisedRoot.resolver)).resolves.toBe(
      NON_DISCRIMINATOR_STRING,
    );
  });

  it('NET-NEW — model/entity/ProductType.cfc:L112 — an UNRESOLVABLE root RAISES, while a root that resolves without a code answers absence', async () => {
    // The two absences the legacy keeps distinguishable, and this case is where they separate.
    // `:L112` reads `getService("ProductService").getProductType(listFirst(...)).getSystemCode()` —
    // one expression with two distinct failure modes:
    // • the lookup yields nothing → `.getSystemCode()` dereferences a null → CFML raises.
    // • the lookup yields a row that holds no code → the getter returns CFML null → the method
    // returns null, and the caller receives it.
    const root = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const child = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: root,
    });

    // Absence 1: no row. An empty seed set means the walk finds nothing, so the port raises.
    const emptyResolver = createProductTypeRootResolverDouble([]);

    await expect(child.getBaseProductType(emptyResolver.resolver)).rejects.toBeInstanceOf(
      DomainError,
    );
    // The resolver was consulted, with the root identifier — the raise follows a real lookup rather
    // than short-circuiting ahead of one.
    expect(emptyResolver.requestedProductTypeIds).toEqual([MERCHANDISE_PRODUCT_TYPE_ID]);
    await expect(
      child.getBaseProductType(createProductTypeRootResolverDouble([]).resolver),
    ).rejects.toThrow(/model\/entity\/ProductType\.cfc:L112/);

    // Absence 2: row present, no code. Still `undefined`, because that is the legacy answer, and
    // the return type's `| undefined` now denotes exactly this one state.
    const codelessRootResolver = createProductTypeRootResolverDouble([
      { productTypeID: MERCHANDISE_PRODUCT_TYPE_ID },
    ]);
    const secondChild = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      parentProductType: buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID }),
    });

    await expect(
      secondChild.getBaseProductType(codelessRootResolver.resolver),
    ).resolves.toBeUndefined();
  });

  it('NET-NEW — org/Hibachi/HibachiEntity.cfc:L308-L324 — a brand-new entity resolves the blank first identifier and RAISES, because no row carries a blank identifier', async () => {
    const brandNew = new ProductType();
    const rootResolver = createProductTypeRootResolverDouble();

    // The blank path has no non-empty segment, so the identifier handed to the resolver is the empty
    // string. No row can match it, which puts this squarely in absence 1 above — and the legacy
    // reached the same dereference for the same reason, because `listFirst` of a blank path is blank.
    await expect(brandNew.getBaseProductType(rootResolver.resolver)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(rootResolver.requestedProductTypeIds).toEqual(['']);

    // The diagnostic names the blank path rather than printing a bare empty string, so the state is
    // legible in a log without disclosing anything: `DomainError` presents neutrally at the handler.
    await expect(
      new ProductType().getBaseProductType(createProductTypeRootResolverDouble().resolver),
    ).rejects.toThrow(/\(empty identifier path\)/);
  });
});

/* 9. the D21 attribute boundary — `model/entity/ProductType.cfc:L92-L99` */

describe('ProductType — the D21 inherited attribute-set boundary', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L94 — EVERY assignment the capability supplies is returned, unfiltered by this product type or any parent', () => {
    const subject = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      parentProductType: buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID }),
    });

    // Two of the three records are labelled as belonging elsewhere, and they must still come back.
    // Their presence in the result is the proof of the defect; filtering them out would be the repair
    // that is forbidden here.
    const assignments: readonly OpaqueAttributeSetAssignment[] = [
      Object.freeze({ testLocalLabel: 'assignment-on-an-unrelated-product-type' }),
      Object.freeze({ testLocalLabel: 'assignment-on-this-product-type' }),
      Object.freeze({ testLocalLabel: 'assignment-on-a-second-unrelated-product-type' }),
    ];

    const result = subject.getInheritedAttributeSetAssignments(
      createAttributeSetAssignmentSource(assignments),
    );

    // Todo get by all the parent productTypeIDs
    //
    // TODO(parity) D21 model/entity/ProductType.cfc:L92-L98 — the line above is the legacy comment
    // verbatim, and it is an admission rather than a plan: the member never filters by this product
    // type, never walks the parent chain and never consults `productTypeIDPath`, so the word
    // "Inherited" in its name describes an intention and not the implementation.
    expect(result).toHaveLength(3);
    expect(result).toEqual(assignments);

    // The two records that visibly do not belong to the subject survive, and naming them in the
    // assertion is the point: a future "fix" that filters by product type fails right here.
    //
    expect(result).toContainEqual({ testLocalLabel: 'assignment-on-an-unrelated-product-type' });
    expect(result).toContainEqual({
      testLocalLabel: 'assignment-on-a-second-unrelated-product-type',
    });

    // The subject has a parent and therefore a two-segment ancestry path, and neither of those
    // influences the result — the member reads no state off `this` at all.
    //
    expect(subject.getProductTypeIDPath()).toContain(ID_PATH_DELIMITER);
    expect(subject.parentProductType).toBeDefined();
  });

  it('NET-NEW — model/entity/ProductType.cfc:L94 — the records array is handed back BY REFERENCE, not copied', () => {
    const subject = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const assignments: readonly OpaqueAttributeSetAssignment[] = [
      Object.freeze({ testLocalLabel: 'the-only-assignment' }),
    ];

    // The legacy returns the SmartList's own records array; cloning it in the port would introduce a
    // divergence no legacy behaviour calls for.
    //
    expect(
      subject.getInheritedAttributeSetAssignments(createAttributeSetAssignmentSource(assignments)),
    ).toBe(assignments);
  });

  it('NET-NEW — model/entity/ProductType.cfc:L95-L97 — an ABSENT capability yields an empty array, and so does an empty source', () => {
    const subject = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    // TODO(boundary) — the rightful implementer is the out-of-scope `attributeService` family reached
    // through the SmartList abstraction the domain layer deliberately does not import. No parent-ID
    // filtering, SmartList behaviour, service lookup, SQL or repository port is introduced here: the
    // boundary stub is the whole of the ported behaviour for this slice.
    expect(subject.getInheritedAttributeSetAssignments()).toEqual([]);
    expect(
      subject.getInheritedAttributeSetAssignments(createAttributeSetAssignmentSource([])),
    ).toEqual([]);
  });
});

/* 10. declarative validation — `model/validation/ProductType.json:L2-L8` */

describe('ProductType — declarative validation on save', () => {
  it('NET-NEW — model/validation/ProductType.json:L3 — an absent productTypeName fails required, and the JSON is the ONLY mechanism that requires it', async () => {
    const productType = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const harness = createValidatorHarness();

    // `model/entity/ProductType.cfc:L57` declares
    // `property name="productTypeName" ormtype="string";` — no `required`, no `notnull`, no `length`.
    // The ORM would happily persist a nameless product type; the requirement exists only in the
    // declarative document, which is precisely why porting the document as data rather than dropping
    // it was mandatory. Nothing about the entity's field declaration enforces this.
    expect(productType.productTypeName).toBeUndefined();

    const errors = await harness.validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(errors.hasErrors()).toBe(true);
    expect(errors.hasError('productTypeName')).toBe(true);

    // The key is the full property identifier and the value is an array.
    // `org/Hibachi/HibachiErrors.cfc:L14-L31` appends into an array per key, and the trailing-segment
    // form derived at `org/Hibachi/HibachiValidationService.cfc:L208` shapes the message only.
    expect(errors.getError('productTypeName')).toEqual([
      'validate.save.ProductType.productTypeName.required',
    ]);
  });

  it('NET-NEW — model/validation/ProductType.json:L3 — a populated productTypeName satisfies required, and a whitespace-only one does not', async () => {
    const named = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
      urlTitle: MERCHANDISE_PRODUCT_TYPE.urlTitle,
    });

    await expect(
      createValidatorHarness()
        .validateDryRun(
          createProductTypeValidationSubject(named),
          productTypeValidationRuleSet,
          SAVE_CONTEXT,
        )
        .then((errors) => errors.hasError('productTypeName')),
    ).resolves.toBe(false);

    // CFML presence is a trimmed-length test, not a null test: `len(trim(value))` at
    // `org/Hibachi/HibachiValidationService.cfc`'s required branch. A tab-and-space value is
    // therefore absent for validation purposes even though the column would store it, and the port
    // keeps that rather than the looser JavaScript truthiness test a naive translation would reach
    // for.
    const whitespaceNamed = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: ' \t ',
      urlTitle: MERCHANDISE_PRODUCT_TYPE.urlTitle,
    });

    const errors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(whitespaceNamed),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(errors.getError('productTypeName')).toEqual([
      'validate.save.ProductType.productTypeName.required',
    ]);
  });

  it('NET-NEW — model/validation/ProductType.json:L4 — an absent urlTitle fails required while its uniqueness probe still runs and PASSES', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
    });
    const harness = createValidatorHarness();

    const errors = await harness.validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    // Only the presence constraint fails. `:L4` is one rule object carrying two keys, and the port
    // flattens it into two independent constraints — so the second one is genuinely evaluated here
    // rather than skipped because the first failed.
    expect(errors.getError('urlTitle')).toEqual(['validate.save.ProductType.urlTitle.required']);

    // The probe was made, and it was made with the legacy binding shape: the trailing segment as the
    // property name, the logical ORM entity name, the subject's own identifier, and the value the
    // legacy reader coalesces an absent string into (`org/Hibachi/HibachiTransient.cfc:L466`
    // returns the empty string rather than a null).
    expect(harness.uniqueProperty.calls).toEqual([
      {
        propertyName: 'urlTitle',
        resolvedPropertyName: 'urlTitle',
        entityName: PRODUCT_TYPE_ENTITY_NAME,
        entityID: MERCHANDISE_PRODUCT_TYPE_ID,
        value: '',
      },
    ]);
  });

  it('NET-NEW — model/validation/ProductType.json:L4 — a urlTitle already held by a DIFFERENT row fails unique, and polarity is pinned by exercising the COLLIDING case', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
      urlTitle: MERCHANDISE_PRODUCT_TYPE.urlTitle,
    });

    // Polarity. `true` means unique and therefore savable; `org/Hibachi/HibachiDAO.cfc:L142-L144`
    // returns false when the existence query finds rows and `:L146` returns true when it finds none,
    // and `org/Hibachi/HibachiValidationService.cfc:L467-L470` passes that through unmodified. An
    // inverted port would still satisfy a test that only covered the non-colliding path, so the
    // collision is exercised here deliberately. The uniqueness check is not re-implemented in this
    // file — the seeded row is data, and the verdict comes from the port.
    const harness = createValidatorHarness([
      {
        entityName: PRODUCT_TYPE_ENTITY_NAME,
        propertyName: 'urlTitle',
        value: MERCHANDISE_PRODUCT_TYPE.urlTitle,
        entityID: OTHER_ROW_ID,
      },
    ]);

    const errors = await harness.validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    // Presence is satisfied, so exactly one message lands, and it is keyed by the property rather
    // than by the constraint.
    expect(errors.getError('urlTitle')).toEqual(['validate.save.ProductType.urlTitle.unique']);
    expect(errors.getError('productTypeName')).toEqual([]);
  });

  it('NET-NEW — org/Hibachi/HibachiDAO.cfc:L140 — the same value held by the SAME row is not a collision, and that self-exclusion is a no-op on insert', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
      urlTitle: MERCHANDISE_PRODUCT_TYPE.urlTitle,
    });

    const harness = createValidatorHarness([
      {
        entityName: PRODUCT_TYPE_ENTITY_NAME,
        propertyName: 'urlTitle',
        value: MERCHANDISE_PRODUCT_TYPE.urlTitle,
        entityID: MERCHANDISE_PRODUCT_TYPE_ID,
      },
    ]);

    const errors = await harness.validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(errors.hasErrors()).toBe(false);

    // TODO(parity) — the self-exclusion clause compares primary identifiers, so on an INSERT, where
    // no identifier has been assigned yet, it excludes nothing. It looks like protection against
    // self-collision and is not, on the path that matters most. Reproduced, not repaired: the
    // unsaved subject below still probes, and its blank identifier can match no seeded row's.
    const unsaved = buildProductType({
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
      urlTitle: MERCHANDISE_PRODUCT_TYPE.urlTitle,
    });
    const insertHarness = createValidatorHarness([
      {
        entityName: PRODUCT_TYPE_ENTITY_NAME,
        propertyName: 'urlTitle',
        value: MERCHANDISE_PRODUCT_TYPE.urlTitle,
        entityID: OTHER_ROW_ID,
      },
    ]);

    const insertErrors = await insertHarness.validateDryRun(
      createProductTypeValidationSubject(unsaved),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(unsaved.productTypeID).toBe(UNSAVED_PRODUCT_TYPE_ID);
    expect(insertErrors.getError('urlTitle')).toEqual([
      'validate.save.ProductType.urlTitle.unique',
    ]);
  });

  it('NET-NEW — model/validation/ProductType.json:L4 — BOTH constraints of the one rule object can fail in a single pass, under one key, in declaration order', async () => {
    // A blank title fails presence, and a blank title already held elsewhere fails uniqueness too.
    // Evaluation does not short-circuit — `org/Hibachi/HibachiValidationService.cfc:L77-L88`
    // flattens the rule object into one constraint record per key and evaluates each — so this is
    // the case that proves the array-valued error key is load-bearing rather than decorative.
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: MERCHANDISE_PRODUCT_TYPE.productTypeName,
      urlTitle: '',
    });
    const harness = createValidatorHarness([
      {
        entityName: PRODUCT_TYPE_ENTITY_NAME,
        propertyName: 'urlTitle',
        value: '',
        entityID: OTHER_ROW_ID,
      },
    ]);

    const errors = await harness.validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    expect(errors.getError('urlTitle')).toEqual([
      'validate.save.ProductType.urlTitle.required',
      'validate.save.ProductType.urlTitle.unique',
    ]);
    expect(Object.keys(errors.getErrors())).toEqual(['urlTitle']);
  });

  it('NET-NEW — model/validation/ProductType.json:L3-L4 — a named, uniquely titled product type saves clean, and the delete guards do NOT fire on save', async () => {
    // synthetic arrangement only: the three XML seed rows are all roots with no products. The
    // collections and the system code here are populated purely to prove the context gate, and this
    // makes no claim about the seeded topology.
    const productType = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      productTypeName: CONTENT_ACCESS_PRODUCT_TYPE.productTypeName,
      urlTitle: CONTENT_ACCESS_PRODUCT_TYPE.urlTitle,
      systemCode: CONTENT_ACCESS_PRODUCT_TYPE.systemCode,
    });
    productType.childProductTypes.push(buildProductType({ productTypeID: OTHER_ROW_ID }));
    productType.setProducts([buildProduct({ productID: OTHER_ROW_ID })]);
    productType.products.push(buildProduct({ productID: OTHER_ROW_ID }));

    const errors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      SAVE_CONTEXT,
    );

    // `:L5-L8` all declare `"contexts":"delete"`, so a non-empty product collection, a non-empty
    // child collection and a real system code are all irrelevant on the save path.
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});
  });
});

describe('ProductType — declarative validation on delete', () => {
  it('NET-NEW — model/validation/ProductType.json:L5 — a non-empty products collection blocks deletion, and an empty one does not', async () => {
    const withProducts = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    withProducts.products.push(buildProduct({ productID: OTHER_ROW_ID }));

    const blocked = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(withProducts),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(blocked.getError('products')).toEqual([
      'validate.delete.ProductType.products.maxCollection',
    ]);

    // A ceiling of zero passes for an empty array, because its length is zero — the guard blocks
    // "has any", not "has a collection".
    const withoutProducts = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    const allowed = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(withoutProducts),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(withoutProducts.products).toEqual([]);
    expect(allowed.hasError('products')).toBe(false);
  });

  it('NET-NEW — model/validation/ProductType.json:L6 — a non-empty childProductTypes collection blocks deletion under EXACTLY that key', async () => {
    const parent = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    // Synthetic arrangement: a seeded identifier is reused as a child so the guard has
    // something to see. The three XML seed rows are all roots and none is a child of another.
    buildProductType({ productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID, parentProductType: parent });

    const errors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(parent),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    // The key is `childProductTypes`. Prose describing this guard has called it "child
    // productTypes", and that wording is stale: the document key at `:L6` and the entity property at
    // `model/entity/ProductType.cfc:L65-L67` are both `childProductTypes`, so the corrected key is
    // what the engine reports and what is asserted here.
    expect(parent.childProductTypes).toHaveLength(1);
    expect(errors.getError('childProductTypes')).toEqual([
      'validate.delete.ProductType.childProductTypes.maxCollection',
    ]);
    expect(errors.hasError('productTypes')).toBe(false);
  });

  it('NET-NEW — model/validation/ProductType.json:L7 — ANY non-empty systemCode blocks deletion, because the rule is an arbitrary-string LENGTH check and not a membership test', async () => {
    // A value that is verifiably not one of the three seeded discriminators — it is the fixture's
    // own `productTypeName`, which differs from its `systemCode` only in case. If the guard were a
    // membership test against the seeded codes, or an `inList`, this would pass. It does not.
    const arbitraryCode = buildProductType({
      productTypeID: OTHER_ROW_ID,
      systemCode: NON_DISCRIMINATOR_STRING,
    });

    const arbitraryErrors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(arbitraryCode),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(arbitraryErrors.getError('systemCode')).toEqual([
      'validate.delete.ProductType.systemCode.maxLength',
    ]);

    // And it blocks the seeded rows too, which is the guard rail's actual purpose: `maxLength: 0` on
    // a string column is the only thing in the slice protecting the three seeded discriminators from
    // deletion. No `BaseProductType` guard is imported to establish this and the rule is not
    // converted to an `inList` — the length check is the whole mechanism.
    const seeded = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      systemCode: SUBSCRIPTION_PRODUCT_TYPE.systemCode,
    });

    const seededErrors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(seeded),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(seededErrors.getError('systemCode')).toEqual([
      'validate.delete.ProductType.systemCode.maxLength',
    ]);
  });

  it('NET-NEW — model/validation/ProductType.json:L7 — an EMPTY systemCode satisfies the ceiling, and so does an absent one', async () => {
    // A trimmed length of zero is `<= 0`, so a blank code passes — which is what makes an
    // administrator-created product type deletable at all.
    const blankCode = buildProductType({ productTypeID: OTHER_ROW_ID, systemCode: '' });

    const blankErrors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(blankCode),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(blankErrors.hasError('systemCode')).toBe(false);

    // The absent branch is separate and explicit in the engine — a null short-circuits to a pass
    // before any length is measured — so it is asserted separately rather than assumed to coincide.
    const noCode = buildProductType({ productTypeID: OTHER_ROW_ID });

    const noCodeErrors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(noCode),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(noCode.systemCode).toBeUndefined();
    expect(noCodeErrors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/ProductType.json:L8 — the physicalCounts guard is DECLARED and INERT, and populating the real physicals collection does not make it fire', async () => {
    const productType = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });

    // The document guards `physicalCounts`. The entity declares `physicals`
    // (`model/entity/ProductType.cfc:L77`, `singularname="physical"`). The names do not match, and
    // `org/Hibachi/HibachiValidationService.cfc:L171` silently skips a rule whose property
    // identifier the object does not carry — so the rule has never fired in the legacy system and
    // must not fire here.
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicalCounts')).toBe(false);
    expect(
      productTypeValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).toContain('physicalCounts');

    // Populate the collection the entity actually has. No `physicalCounts` field is invented on the
    // object to make the rule reachable, and nothing about the physical domain is exercised beyond
    // the array holding one opaque reference.
    productType.physicals.push({ physicalID: OTHER_ROW_ID });

    const errors = await createValidatorHarness().validateDryRun(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
    );

    expect(productType.physicals).toHaveLength(1);
    expect(errors.hasError('physicalCounts')).toBe(false);
    expect(errors.hasError('physicals')).toBe(false);
    expect(errors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/ProductType.json:L2-L8 — the context gate selects rules in both directions, and every failure lands under a full property identifier with an array value', async () => {
    const productType = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      systemCode: SUBSCRIPTION_PRODUCT_TYPE.systemCode,
    });
    productType.products.push(buildProduct({ productID: OTHER_ROW_ID }));
    // Synthetic arrangement: seeded identifiers reused to give the child guard something to
    // see. The seeded rows themselves are all roots.
    buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      parentProductType: productType,
    });

    // The subject carries no name and no title, so both save constraints would fail — and neither
    // does, because `:L3-L4` declare `"contexts":"save"` and this pass is a delete.
    const bag = new ValidationError();
    const returned = await createValidatorHarness().validateInto(
      createProductTypeValidationSubject(productType),
      productTypeValidationRuleSet,
      DELETE_CONTEXT,
      bag,
    );

    // The production bag is used as landed, mutated in place, and handed back — no error container
    // is recreated here.
    expect(returned).toBe(bag);
    expect(bag.getErrors()).toEqual({
      products: ['validate.delete.ProductType.products.maxCollection'],
      childProductTypes: ['validate.delete.ProductType.childProductTypes.maxCollection'],
      systemCode: ['validate.delete.ProductType.systemCode.maxLength'],
    });

    // Every value is an array, and no save-context key is present.
    expect(Object.values(bag.getErrors()).every((messages) => Array.isArray(messages))).toBe(true);
    expect(bag.hasError('productTypeName')).toBe(false);
    expect(bag.hasError('urlTitle')).toBe(false);
  });
});

/* 11. the overridden product collection setter — `model/entity/ProductType.cfc:L101-L107` */

describe('ProductType — setProducts', () => {
  it('NET-NEW — model/entity/ProductType.cfc:L101-L107 — the collection is REPLACED wholesale and every supplied product is re-pointed at this product type', () => {
    const productType = buildProductType({ productTypeID: MERCHANDISE_PRODUCT_TYPE_ID });
    const previousOccupant = buildProduct({ productID: OTHER_ROW_ID });
    productType.products.push(previousOccupant);

    const firstReference = productType.products;
    const adopted = [
      buildProduct({ productID: `${SUBSCRIPTION_PRODUCT_TYPE_ID}-first-product` }),
      buildProduct({ productID: `${SUBSCRIPTION_PRODUCT_TYPE_ID}-second-product` }),
    ];

    productType.setProducts(adopted);

    // `:L103`'s `variables.Products = []` assigns a brand-NEW array rather than clearing in place, so
    // the reference changes and the previous occupant is gone from the collection.
    expect(productType.products).not.toBe(firstReference);
    expect(firstReference).toEqual([previousOccupant]);

    // And the new collection is empty. `:L105`'s loop calls `addProduct(product)`, and the ported
    // `addProduct` sets `product.productType = this` without appending — faithfully, because the
    // legacy declares this side of the relationship `inverse="true"`, which makes the product the
    // owner and leaves this array to be refreshed by the ORM rather than by the setter.
    expect(productType.products).toEqual([]);
    expect(adopted.map((product) => product.productType)).toEqual([productType, productType]);

    // The re-point is what the caller depends on, so it is asserted by identity rather than by
    // equality. No Product behaviour beyond this single reference is touched.
    expect(adopted.every((product) => product.productType === productType)).toBe(true);
  });
});
