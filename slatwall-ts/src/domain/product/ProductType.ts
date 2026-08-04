/**
 * ProductType — the self-referencing hierarchy of the Slatwall Catalog.
 *
 * Ported from [model/entity/ProductType.cfc]. Scope per AAP §0.4.1.4: the self-referencing hierarchy,
 * `productTypeIDPath`, `systemCode`, `getBaseProductType` [:L110], and
 * `getInheritedAttributeSetAssignments` boundary-stubbed with defect D21 flagged. The consolidated
 * register at the foot of this file gives a locator and a reason for every member deliberately not
 * carried across.
 *
 * Standards citations below use the AAP §0.7.3 identifiers AAP §0.7.3-AAP §0.7.3. `F<n>` markers are this port's own
 * file-scope rules; the two cited most often are (smartList members belong to
 * `src/ports/SmartListQueryPort.ts` and `src/adapters/mysql/SmartListQueryBuilder.ts`, never to the
 * domain layer) and (framework members are not declared on domain entities).
 */

import type { BaseProductType } from '../BaseProductType';
/*
 * Three helpers and one type were dropped from this import alongside the seven managed-entity
 * methods, and their absence is the evidence that the removal was complete. `hasDeclaredProperty`,
 * `readValueByPropertyIdentifier`, `requireDeclaredPropertyMetaData` and `EntityPropertyMetaData`
 * were imported for `hasProperty`, `getValueByPropertyIdentifier` and `getPropertyMetaData`
 * respectively. `../base/populate`'s `manageEntity` now calls the same three helpers from one place
 * for all six entities, so this module needs none of them — see the managed-entity contract block
 * below. Nothing else in this file referenced them, which is why removing the methods left them
 * unused rather than merely under-used.
 */
import {
  applyPreInsertAudit,
  applyPreUpdateAudit,
  AUDIT_PROPERTY_NAMES,
  type AuditableEntity,
  type AuditPropertyName,
  type DeclaredPropertyNameSet,
} from '../base/AuditableEntity';
import type {
  DisabledPropertyDescriptor,
  EntityMetadataDeclaration,
  ManyToOnePropertyDescriptor,
  OneToManyPropertyDescriptor,
  PopulatePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
/*
 * `src/errors/DomainError.ts` is a permitted import for a `domain/` module. Hexagonal separation
 * (AAP §0.7.3) forbids `domain/` →
 * `adapters/`, `services/`, `config/`, `validation/`, `handlers/` and `integrations/`; `errors/` is
 * in none of those groups. It is a leaf module with no imports of its own beyond the type system,
 * sitting below the domain layer exactly as `src/util/` does, and all three sibling entity modules
 * import it — `../../errors/DomainError` at `src/domain/product/Product.ts`,
 * `src/domain/sku/Sku.ts` and `src/domain/option/Option.ts`. reading AAP §0.7.3's per-file "permitted"
 */
import { DomainError } from '../../errors/DomainError';
import type { Product } from './Product';

/*
 * The `./Product` import — a type-level cycle that is expected and correct
 * `Product` is in scope (AAP §0.2.1.2), so it is imported as the real domain type and not forked
 * into a local structural stand-in: a fork would compile and then drift, and two divergent notions
 * of "product" in one folder is precisely the outcome the ports pattern exists to avoid.
 */

/** The resolved current-account context accepted by the two ORM lifecycle hooks. */
export type AuditActor = Parameters<typeof applyPreInsertAudit>[1];

/**
 * A `systemCode` carrier — the only thing {@link ProductType.getBaseProductType} reads off the root
 * product type it resolves.
 */
export interface ProductTypeSystemCodeSource {
  readonly systemCode?: string;
}

/**
 * Resolves a product type by identifier — the injected replacement for the legacy service locator
 * inside `getBaseProductType`.
 *
 * TODO(boundary): the real implementation of this interface belongs to
 * `src/services/ProductService.ts` over `src/ports/repositories/ProductTypeRepository.ts` — the
 * `getProductType(id)` reader of AAP §0.4.2.5 and the tree query of
 * `model/dao/ProductTypeDAO.cfc:L52`. Neither is authored by this file, and this file declares no
 * port of its own (TR-5: the boundary is crossed through a declared capability, never quietly
 * dropped).
 */
export interface ProductTypeRootResolver {
  /**
   * @param productTypeID - A 32-character identifier per IR-6, taken from the first element of this
   * product type's identifier path. May be the empty string when the path is empty; see the
   * resolution table on {@link productType.getBaseProductType}.
   *
   * @returns The product type, or `undefined` when no such row exists — the state in which the
   * legacy expression dereferenced a null.
   */
  getProductType(productTypeID: string): Promise<ProductTypeSystemCodeSource | undefined>;
}

/**
 * Reads the `parentProductTypeID` a product type was hydrated with.
 *
 * @param productType - Any product type instance.
 * @returns The preserved parent identifier, or `undefined` when there is none.
 */
export type ParentProductTypeIdReader = (productType: object) => string | undefined;

/** One attribute-set assignment, as returned by the D21 stub — deliberately opaque. */
export type InheritedAttributeSetAssignment = object;

/**
 * Supplies the attribute-set assignments read by the D21 stub.
 *
 * TODO(boundary): the rightful owner is the `attributeService` family, which AAP §0.2.2.1 places
 * explicitly out of scope (`model/**\/Attribute*.cfc`, six files), reached through
 * `src/ports/SmartListQueryPort.ts` — the abstraction that replaces
 * `org/Hibachi/HibachiSmartList.cfc`, whose members keeps out of the domain layer entirely.
 */
export interface InheritedAttributeSetAssignmentSource {
  getAttributeSetAssignmentRecords(): readonly InheritedAttributeSetAssignment[];
}

/**
 * The inverse side of the `attributeValues` relationship — exactly the two members the ported
 * helpers touch, and nothing else (Phase E).
 *
 * TODO(boundary): the implementer is the `Attribute*` family, out of scope per AAP §0.2.2.1. Note
 * for whoever writes it that the legacy `AttributeValue.setProductType` reaches back into
 * `productType.hasAttributeValue(this)` and `productType.getAttributeValues()`
 * [model/entity/AttributeValue.cfc:L259-L260]. Neither member is declared on this class, because
 * Rule 2 admits a synthesized ORM member only where an in-scope call site exists and both call sites
 * are in the out-of-scope `AttributeValue.cfc`. The {@link ProductType.attributeValues} field is
 * public, so an in-scope adapter can reach the live collection directly when one is written.
 */
export interface ProductTypeAttributeValueOwner {
  setProductType(productType: ProductType): void;
  removeProductType(productType?: ProductType): void;
}

/*
 * The five opaque relationship reference types — `model/entity/ProductType.cfc:L70-L77`
 * The eight many-to-many-inverse collections are declared as fields below, because the legacy
 * declares them and `getProperties()` walked every declaration, but none of them is traversed by
 * any ported member: the sixteen add/remove helpers that would traverse them are the omitted
 * `model/entity/ProductType.cfc:L174-L228` and :L238-L244 set, and every collaborator involved is
 * explicitly out of scope (`Promotion*` 9 files, `PriceGroup*` 4, `Attribute*` 6, `Physical*` 6).
 */

/**
 * A `PromotionReward` reference — see the block above. Link tables `SwPromoRewardProductType`
 * [`model/entity/ProductType.cfc:L70`] and `SwPromoRewardExclProductType` [`:L71`].
 */
export interface PromotionRewardReference {
  readonly promotionRewardID: string;
}

/**
 * A `PromotionQualifier` reference. Link tables `SwPromoQualProductType`
 * [`model/entity/ProductType.cfc:L72`] and `SwPromoQualExclProductType` [`:L73`].
 */
export interface PromotionQualifierReference {
  readonly promotionQualifierID: string;
}

/**
 * A `PriceGroupRate` reference. Link tables `SwPriceGroupRateProductType`
 * [`model/entity/ProductType.cfc:L74`] and `SwPriceGrpRateExclProductType` [`:L75`].
 */
export interface PriceGroupRateReference {
  readonly priceGroupRateID: string;
}

/**
 * An `AttributeSet` reference. Link table `SwAttributeSetProductType`
 * [`model/entity/ProductType.cfc:L76`].
 */
export interface AttributeSetReference {
  readonly attributeSetID: string;
}

/**
 * A `Physical` reference. Link table `SwPhysicalProductType`
 * [`model/entity/ProductType.cfc:L77`].
 */
export interface PhysicalReference {
  readonly physicalID: string;
}

/**
 * The value {@link ProductType.getBaseProductType} yields: a `systemCode` read out of the database,
 * which may be one of the three seeded discriminators and may equally be anything else.
 */
export type BaseProductTypeCode = BaseProductType | (string & {});

/** `SlatwallProductType`, table `SwProductType` — a catalog product type. */
export class ProductType implements AuditableEntity {
  /*
   * Persistent properties — `model/entity/ProductType.cfc:L52-L59`.
   */

  /**
   * `property name="productTypeID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   * unsavedvalue="" default="";` [`:L52`]
   */
  productTypeID: string = '';

  /** `property name="productTypeIDPath" ormtype="string" length="4000";` [`:L53`] */
  productTypeIDPath?: string;

  /**
   * `property name="activeFlag" ormtype="boolean" hint="As a ProductType Get Old, They would be
   * marked as Not Active";` [`:L54`]
   */
  activeFlag?: boolean;

  /**
   * `property name="publishedFlag" ormtype="boolean";` [`:L55`] No default, for the same reason.
   */
  publishedFlag?: boolean;

  /**
   * `property name="urlTitle" ormtype="string" unique="true" hint="This is the name that is used in
   * the URL string";` [`:L56`]
   */
  urlTitle?: string;

  /** `property name="productTypeName" ormtype="string";` [`:L57`] */
  productTypeName?: string;

  /** `property name="productTypeDescription" ormtype="string" length="4000";` [`:L58`] */
  productTypeDescription?: string;

  /**
   * `property name="systemCode" ormtype="string";` [`:L59`] — the most consequential field in this
   * class.
   */
  systemCode?: string;

  /*
   * Related object properties (many-to-one) — `model/entity/ProductType.cfc:L62`.
   */

  /**
   * `property name="parentProductType" cfc="ProductType" fieldtype="many-to-one"
   * fkcolumn="parentProductTypeID";` [`:L62`]
   */
  declare parentProductType?: ProductType;

  /*
   * Related object properties (one-to-many) — `model/entity/ProductType.cfc:L65-L67`.
   */

  /**
   * `property name="childProductTypes" singularname="childProductType" cfc="ProductType"
   * fieldtype="one-to-many" inverse="true" fkcolumn="parentProductTypeID" cascade="all";` [`:L65`]
   */
  childProductTypes: ProductType[] = [];

  /**
   * `property name="products" singularname="product" cfc="Product" fieldtype="one-to-many"
   * inverse="true" fkcolumn="productTypeID" lazy="extra" cascade="all";` [`:L66`]
   */
  products: Product[] = [];

  /**
   * `property name="attributeValues" singularname="attributeValue" cfc="AttributeValue"
   * fieldtype="one-to-many" fkcolumn="productTypeID" cascade="all-delete-orphan" inverse="true";`
   * [`:L67`]
   */
  attributeValues: ProductTypeAttributeValueOwner[] = [];

  /*
   * Related object properties (many-to-many, inverse) — `:L70-L77`.
   */

  /** `:L70` — `linktable="SwPromoRewardProductType"`, `inversejoincolumn="promotionRewardID"`. */
  promotionRewards: PromotionRewardReference[] = [];

  /**
   * `:L71` — `type="array"`, `linktable="SwPromoRewardExclProductType"`,
   * `inversejoincolumn="promotionRewardID"`.
   */
  promotionRewardExclusions: PromotionRewardReference[] = [];

  /** `:L72` — `linktable="SwPromoQualProductType"`, `inversejoincolumn="promotionQualifierID"`. */
  promotionQualifiers: PromotionQualifierReference[] = [];

  /**
   * `:L73` — `type="array"`, `linktable="SwPromoQualExclProductType"`,
   * `inversejoincolumn="promotionQualifierID"`.
   */
  promotionQualifierExclusions: PromotionQualifierReference[] = [];

  /** `:L74` — `linktable="SwPriceGroupRateProductType"`, `inversejoincolumn="priceGroupRateID"`. */
  priceGroupRates: PriceGroupRateReference[] = [];

  /**
   * `:L75` — `linktable="SwPriceGrpRateExclProductType"`, `inversejoincolumn="priceGroupRateID"`.
   */
  priceGroupRateExclusions: PriceGroupRateReference[] = [];

  /**
   * `:L76` — `type="array"`, `linktable="SwAttributeSetProductType"`,
   * `inversejoincolumn="attributeSetID"`.
   */
  attributeSets: AttributeSetReference[] = [];

  /**
   * `:L77` — `type="array"`, `linktable="SwPhysicalProductType"`, `inversejoincolumn="physicalID"`.
   */
  physicals: PhysicalReference[] = [];

  /*
   * Remote properties — `model/entity/ProductType.cfc:L80`.
   */

  /** `property name="remoteID" ormtype="string";` [`:L80`] */
  remoteID?: string;

  /*
   * Audit properties — `model/entity/ProductType.cfc:L83-L86`.
   */

  /** `property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";` [`:L83`] */
  createdDateTime?: Date;

  /**
   * `property name="createdByAccount" hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="createdByAccountID";` [`:L84`]
   */
  createdByAccount?: string;

  /** `property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";` [`:L85`] */
  modifiedDateTime?: Date;

  /**
   * `property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="modifiedByAccountID";` [`:L86`]
   */
  modifiedByAccount?: string;

  /*
   * Derived state.
   */

  /**
   * Whether this instance has never been persisted: exactly when {@link ProductType.productTypeID}
   * is the empty string, which is the legacy `unsavedvalue=""` [`:L52`].
   */
  isNew(): boolean {
    return this.productTypeID === '';
  }

  /* Collection accessors — the live-array contract. */

  /** The live `childProductTypes` array, by reference. */
  getChildProductTypes(): ProductType[] {
    return this.childProductTypes;
  }

  /** Whether `childProductType` is already a member of this product type's child collection. */
  hasChildProductType(childProductType: ProductType): boolean {
    return this.childProductTypes.includes(childProductType);
  }

  /**
   * The live `products` array, by reference — the same contract as
   * {@link ProductType.getChildProductTypes}, and for a concrete in-scope reason:
   * `model/service/ProductService.cfc:L306-L307` reads
   * `productType.getParentProductType().getProducts` and hands the result straight into
   * {@link ProductType.setProducts}, so this method feeds the one code path in the slice that
   * re-parents a product collection.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /*
   * Overridden implicit getters.
   */

  /**
   * The comma-delimited, root-first identifier path from the root of the hierarchy down to and
   * including this product type — built on first read and then reused.
   */
  getProductTypeIDPath(): string {
    const memoizedIDPathList = this.productTypeIDPath;
    if (memoizedIDPathList !== undefined) {
      return memoizedIDPathList;
    }
    const builtIDPathList = buildProductTypeIDPathList(this);
    this.productTypeIDPath = builtIDPathList;
    return builtIDPathList;
  }

  /*
   * The base product type — the three-way branch key of skuService.createSkus.
   */

  /**
   * This product type's inherited base product type code: its own `systemCode` when it has one, and
   * otherwise the `systemCode` of the root of its hierarchy.
   */
  async getBaseProductType(
    rootProductTypeResolver: ProductTypeRootResolver,
  ): Promise<BaseProductTypeCode | undefined> {
    const ownSystemCode = this.systemCode;
    // Legacy `if(isNull(getSystemCode()) || getSystemCode() == "")` inverted: both halves of the
    // fallthrough condition must fail before the own code is returned directly [`:L111`].
    if (ownSystemCode !== undefined && ownSystemCode !== '') {
      return ownSystemCode;
    }

    // `listFirst(getProductTypeIDPath)` [`:L112`] — the root identifier, first because
    // `buildIDPathList` prepends.
    const rootProductTypeID = listFirstIdentifier(this.getProductTypeIDPath());
    const rootProductType = await rootProductTypeResolver.getProductType(rootProductTypeID);

    if (rootProductType === undefined) {
      /*
       * Legacy `:L112` chains `.getSystemCode()` onto this lookup with no guard, so a missing row
       * fails here rather than yielding a value. An empty `rootProductTypeID` — the brand-new-root
       * case — reaches this same branch, because no row carries an empty identifier.
       */
      throw new DomainError(
        `Product type ${this.isNew() ? '(unsaved)' : this.productTypeID} carries no systemCode of ` +
          `its own, and its root product type ${rootProductTypeID === '' ? '(empty identifier path)' : rootProductTypeID} ` +
          'could not be resolved, so model/entity/ProductType.cfc:L112 has nothing to read a ' +
          'systemCode from. The legacy code dereferences the unresolved lookup without a guard, and ' +
          'raises here too.',
        {
          context: {
            productTypeID: this.productTypeID,
            rootProductTypeID,
            productTypeIDPath: this.getProductTypeIDPath(),
            locator: 'model/entity/ProductType.cfc:L112',
          },
        },
      );
    }

    /*
     * May be `undefined`: the root exists but holds no `systemCode`. The legacy getter returns CFML
     * null there and the caller receives it, so this absence is the legacy answer — the one the
     * return type's `| undefined` now exclusively denotes.
     */
    return rootProductType.systemCode;
  }

  /* Overridden framework members (the single sanctioned exception). */

  /**
   * The human-readable representation of this product type: the full ancestry chain, root-most segment
   * first, joined by the HTML right-guillemet entity. Ports
   * [model/entity/ProductType.cfc:L273-L278] verbatim in structure:
   *
   * ```cfml
   * public string function getSimpleRepresentation {
   * if(!isNull(getParentProductType())) {
   * return getParentProductType().getSimpleRepresentation & " &raquo; " & getProductTypeName();
   * }
   * return getProductTypeName();
   * }
   * ```
   *
   * TODO(parity) [model/entity/ProductType.cfc:L274-L276] — no cycle guard. Like
   * {@link buildProductTypeIDPathList}, the legacy recursion keeps no visited set and no depth limit,
   * so a cyclic `parentProductType` chain recurses until the stack is exhausted. AAP §0.8.2
   * Guideline 4 forbids adding a guard: a bounded result where the legacy failed is a behaviour
   * difference invisible to a reader comparing outputs.
   */
  getSimpleRepresentation(): string | undefined {
    const productTypeName = this.productTypeName;
    const parentProductType = this.parentProductType;

    if (parentProductType !== undefined) {
      const parentSimpleRepresentation = parentProductType.getSimpleRepresentation();
      if (parentSimpleRepresentation === undefined || productTypeName === undefined) {
        return undefined;
      }
      // ' &raquo; ' — HTML entity, one leading space, one trailing space. Byte-exact.
      return `${parentSimpleRepresentation} &raquo; ${productTypeName}`;
    }

    return productTypeName;
  }

  /*
   * Boundary-stubbed members (TR-5 — declared, never quietly dropped).
   */

  /**
   * The attribute-set assignments this product type inherits — as the legacy actually behaves, which
   * is not what the member name promises.
   */
  // Todo get by all the parent productTypeIDs.
  /*
   * `TODO(parity)` — the line above is `model/entity/ProductType.cfc:L93` verbatim: capital `T`,
   * lowercase `odo`, no colon. It is reproduced exactly, once, and left in place of the filtering it
   * asks for. Locator: `model/entity/ProductType.cfc:L92-L99`; AAP §0.6.7.1 defect **D21**.
   */
  getInheritedAttributeSetAssignments(
    attributeSetAssignmentSource?: InheritedAttributeSetAssignmentSource,
  ): readonly InheritedAttributeSetAssignment[] {
    if (attributeSetAssignmentSource === undefined) {
      return [];
    }
    return attributeSetAssignmentSource.getAttributeSetAssignmentRecords();
  }

  /*
   * Overridden collection setter — `model/entity/ProductType.cfc:L101-L107`.
   */

  /**
   * Replace this product type's product collection wholesale, re-pointing every supplied product at
   * this product type.
   */
  setProducts(products: readonly Product[]): void {
    this.products = [];
    for (const product of products) {
      this.addProduct(product);
    }
  }

  /*
   * Bidirectional helper methods — `model/entity/ProductType.cfc:L146-L246`.
   */

  /**
   * Attach `product` to this product type — legacy sub-comment `// Products (one-to-many)` by
   * position, invoked from `model/entity/ProductType.cfc:L105`.
   */
  addProduct(product: Product): void {
    product.productType = this;
  }

  /**
   * Attach this product type to `parentProductType`, and register it on the parent's child
   * collection.
   */
  setParentProductType(parentProductType: ProductType): void {
    this.parentProductType = parentProductType;
    if (this.isNew() || !parentProductType.hasChildProductType(this)) {
      parentProductType.getChildProductTypes().push(this);
    }
  }

  /**
   * Detach this product type from a parent, removing it from that parent's child collection and
   * clearing its own parent reference.
   *
   * @throws TypeError - When the argument is omitted and no parent is assigned, reproducing the CFML
   * engine diagnostic at `:L157`. nothing is deleted, because the legacy never reaches its delete.
   */
  removeParentProductType(parentProductType?: ProductType): void {
    // Legacy `if(!structKeyExists(arguments, "parentProductType"))` [`:L156-L158`]: default the
    // target from this entity's own reference when the caller supplied none.
    const targetParentProductType = parentProductType ?? this.parentProductType;

    if (targetParentProductType === undefined) {
      // `:L157` raises here — before the search at `:L159` and before the unconditional delete at
      // `:L163`. Statement order preserved: the delete below is not reached.
      throw new TypeError(
        'ProductType.removeParentProductType was called with no parent product type while none is ' +
          'assigned. model/entity/ProductType.cfc:L157 defaults the argument from ' +
          'variables.parentProductType, a key that does not exist for a null many-to-one, so the CFML ' +
          'engine raises an undefined-variable error at that line — before the collection search at ' +
          ':L159 and before the unconditional delete at :L163. Carried unrepaired per AAP §0.6.7 and ' +
          'Refactor Discipline Guideline 4: relaxing it into a silent delete would suppress the ' +
          'failure and perform a write the legacy never performs. Pass the ' +
          'parent product type explicitly, as model/entity/ProductType.cfc:L171 does.',
      );
    }

    const childProductTypes = targetParentProductType.getChildProductTypes();
    const index = childProductTypes.indexOf(this);
    // `arrayFind` 0-when-absent / 1-based -> `indexOf` -1-when-absent / 0-based [`:L159-L161`].
    if (index !== -1) {
      childProductTypes.splice(index, 1);
    }

    // `structDelete(variables, "parentProductType")` [`:L163`] — unconditional, outside the guard.
    delete this.parentProductType;
  }

  /**
   * Adopt `childProductType` as a child of this product type, by delegating to the child's parent
   * setter.
   */
  addChildProductType(childProductType: ProductType): void {
    childProductType.setParentProductType(this);
  }

  /**
   * Release `childProductType` from this product type, by delegating to the child's parent remover.
   */
  removeChildProductType(childProductType: ProductType): void {
    childProductType.removeParentProductType(this);
  }

  /** Attach `attributeValue` to this product type, by delegating to its inverse-side setter. */
  addAttributeValue(attributeValue: ProductTypeAttributeValueOwner): void {
    attributeValue.setProductType(this);
  }

  /** Detach `attributeValue` from this product type, by delegating to its inverse-side remover. */
  removeAttributeValue(attributeValue: ProductTypeAttributeValueOwner): void {
    attributeValue.removeProductType(this);
  }

  /*
   * ORM event hooks — `model/entity/ProductType.cfc:L305-L313`.
   */

  /**
   * Pre-insert hook — ports `model/entity/ProductType.cfc:L305-L308`:
   *
   * ```cfml
   * public void function preInsert{
   * setProductTypeIDPath( buildIDPathList( "parentProductType" ) );
   * super.preInsert;
   * }
   * ```
   *
   * @param auditActor - The resolved current-account context, or omitted when there is none. The
   * legacy hook took no arguments and read the actor from `getHibachiScope().getAccount()`
   * [`org/Hibachi/HibachiObject.cfc:L74-L76`]; AAP §0.7.3 forbids that request-scoped lookup, so the actor
   * arrives explicitly — the same substitution `../base/AuditableEntity` makes, and the reason its
   * `AccountReference` shape is reused here through {@link auditActor} rather than re-declared.
   */
  preInsert(auditActor?: AuditActor): void {
    // `setProductTypeIDPath( buildIDPathList( "parentProductType" ) )` [`:L306`] — forced refresh.
    this.productTypeIDPath = buildProductTypeIDPathList(this);
    // `super.preInsert` [`:L307`] — the framework audit block, by delegation.
    applyPreInsertAudit(this, auditActor);
  }

  /**
   * Pre-update hook — ports [model/entity/ProductType.cfc:L310-L313], which refreshes the identifier
   * path and then delegates to the framework audit block.
   *
   * @param oldData - The pre-modification snapshot Hibernate handed the hook. Kept in the first
   * parameter position for signature fidelity with the legacy `struct oldData`, and typed as a
   * record of unknown values rather than `any` (AAP §0.7.3). It is deliberately not forwarded: the legacy
   * passed it on through `argumentcollection=arguments`, but the audit block that receives it reads
   * it nowhere [org/Hibachi/HibachiEntity.cfc:L657-L681], because the fields written depend only on
   * the clock and the actor.
   */
  preUpdate(oldData?: Record<string, unknown>, auditActor?: AuditActor): void {
    // `setProductTypeIDPath( buildIDPathList( "parentProductType" ) );;` [`:L311`] — forced refresh.
    this.productTypeIDPath = buildProductTypeIDPathList(this);
    // `super.preUpdate(argumentcollection=arguments)` [`:L312`] — the framework audit block.
    applyPreUpdateAudit(this, auditActor);
  }

  /*
   * The managed-entity contract — deliberately *not* declared on this class
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain — `getClassName`, `getEntityName`, `getPrimaryIDPropertyName`,
   * `getPrimaryIDValue`, `hasProperty`, `getPropertyMetaData` and `getValueByPropertyIdentifier`.
   * `src/validation/Validator.ts` and `src/ports/UniquePropertyPort.ts` both require them by name.
   */
}

/* Module-private helpers — the ported framework algorithm. */

/**
 * Builds the comma-delimited, root-first identifier path for `startingProductType` by walking its
 * `parentProductType` chain to the root. Ports `buildIDPathList` from
 * [org/Hibachi/HibachiEntity.cfc:L308-L324] verbatim in structure:
 *
 * ```cfml
 * public string function buildIDPathList(required string parentPropertyName) {
 * var idPathList = "";
 * Var thisEntity = this;
 * Var hasParent = true;
 * do {
 * idPathList = listPrepend(idPathList, thisEntity.getPrimaryIDValue);
 *
 * TODO(parity) [org/Hibachi/HibachiEntity.cfc:L313-L321] — no cycle guard, no depth LIMIT. The legacy
 * `do`/`while` keeps no visited set and no counter, so a cyclic `parentProductType` chain — which
 * nothing in the schema, in [model/validation/ProductType.json] or in
 * {@link ProductType.setParentProductType} prevents — loops forever. AAP §0.8.2 Guideline 4 forbids
 * the guard, which would turn a hang into a result. The `do`/`while` shape is preserved too, so the
 * starting entity is always visited even when it has no parent.
 *
 * @param startingProductType - The entity whose ancestry is walked; always the last element of the
 * returned path.
 *
 * @returns The comma-delimited identifier path, root first. Empty when the walk collects no
 * identifiers at all.
 * ```
 */
function buildProductTypeIDPathList(startingProductType: ProductType): string {
  let idPathList = '';
  let currentProductType: ProductType = startingProductType;
  let hasParent = true;

  do {
    // `listPrepend(idPathList, thisEntity.getPrimaryIDValue)` [`:L313`] — prepend, hence root-first.
    idPathList = listPrependIdentifier(idPathList, currentProductType.productTypeID);

    const parentProductType = currentProductType.parentProductType;
    if (parentProductType === undefined) {
      // `if( isNull( … ) ) { hasParent = false; }` [`:L314-L316`]
      hasParent = false;
    } else {
      currentProductType = parentProductType;
    }
  } while (hasParent);

  return idPathList;
}

/** Reproduces CFML's `listPrepend(list, value)` for the comma-delimited identifier path. */
function listPrependIdentifier(idPathList: string, identifier: string): string {
  return idPathList === '' ? identifier : `${identifier},${idPathList}`;
}

/**
 * Reproduces CFML's `listFirst(list)` for the comma-delimited identifier path — the call at
 * `model/entity/ProductType.cfc:L112`.
 */
function listFirstIdentifier(idPathList: string): string {
  for (const candidateIdentifier of idPathList.split(',')) {
    if (candidateIdentifier !== '') {
      return candidateIdentifier;
    }
  }
  return '';
}

/* The population contract (r-b) */

/**
 * Every property name `model/entity/ProductType.cfc` declares — all twenty-five of them, in
 * declaration order: the eight persistent scalars [`:L52-L59`], the many-to-one [`:L62`], the three
 * one-to-many collections [`:L65-L67`], the eight many-to-many inverses [`:L70-L77`], `remoteID`
 * [`:L80`] and the four audit properties [`:L83-L86`], the last of these reused from
 * {@link AuditPropertyName} rather than re-spelled.
 */
export type ProductTypePropertyName =
  | 'productTypeID'
  | 'productTypeIDPath'
  | 'activeFlag'
  | 'publishedFlag'
  | 'urlTitle'
  | 'productTypeName'
  | 'productTypeDescription'
  | 'systemCode'
  | 'parentProductType'
  | 'childProductTypes'
  | 'products'
  | 'attributeValues'
  | 'promotionRewards'
  | 'promotionRewardExclusions'
  | 'promotionQualifiers'
  | 'promotionQualifierExclusions'
  | 'priceGroupRates'
  | 'priceGroupRateExclusions'
  | 'attributeSets'
  | 'physicals'
  | 'remoteID'
  | AuditPropertyName;

/**
 * ProductType's frozen metadata declaration — the runtime answer to the seven framework
 * introspection members the negative mandate in this module's class documentation forbids as
 * hand-written methods.
 */
export const PRODUCT_TYPE_ENTITY_METADATA: EntityMetadataDeclaration<ProductTypePropertyName> =
  Object.freeze({
    className: 'ProductType',
    entityName: 'SlatwallProductType',
    primaryIDPropertyName: 'productTypeID',
    properties: Object.freeze({
      productTypeID: true,
      productTypeIDPath: true,
      activeFlag: true,
      publishedFlag: true,
      urlTitle: true,
      productTypeName: true,
      productTypeDescription: true,
      systemCode: true,
      parentProductType: true,
      childProductTypes: true,
      products: true,
      attributeValues: true,
      promotionRewards: true,
      promotionRewardExclusions: true,
      promotionQualifiers: true,
      promotionQualifierExclusions: true,
      priceGroupRates: true,
      priceGroupRateExclusions: true,
      attributeSets: true,
      physicals: true,
      remoteID: true,
      createdDateTime: true,
      createdByAccount: true,
      modifiedDateTime: true,
      modifiedByAccount: true,
    } satisfies Readonly<Record<ProductTypePropertyName, true>>),
    /*
     * The single `persistent="false"` property this entity declares — `parentProductTypeOptions` at
     * [model/entity/ProductType.cfc:L89], an administrative select-option list whose legacy getter
     * reaches the framework's own option machinery. It is declared here because the legacy predicate
     * answers true for it and `src/validation/Validator.ts` silently skips a rule whose property
     * answers false; no `model/validation/ProductType.json` rule names it today, so listing it
     * changes no rule's behaviour and closes the gap for any that ever does.
     */
    declaredNonFieldProperties: Object.freeze({ parentProductTypeOptions: true }),
  } satisfies EntityMetadataDeclaration<ProductTypePropertyName>);

/*
 * The per-entity metadata constants — one source, two vocabularies
 * `PRODUCT_TYPE_ENTITY_METADATA` above is the single frozen declaration of this entity's class name, ORM entity name,
 * primary-identifier property name and declared-property set. The four constants below name those
 * same four facts individually, because the entity's own metadata members and the population
 * descriptor set read them one at a time, and a named constant states the intent better at each of
 * those sites than reaching into a record does.
 */

/**
 * The bare class name — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of
 * the component's fully qualified name. Carries no `Slatwall` prefix.
 */
export const PRODUCT_TYPE_CLASS_NAME: string = PRODUCT_TYPE_ENTITY_METADATA.className;

/**
 * The mapped ORM entity name declared by the `entityname` attribute at [`:L49`] and read at
 * [org/Hibachi/HibachiEntity.cfc:L287-L289].
 */
export const PRODUCT_TYPE_ENTITY_NAME: string = PRODUCT_TYPE_ENTITY_METADATA.entityName;

/**
 * The name of the primary identifier property — [`:L52`], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 */
export const PRODUCT_TYPE_PRIMARY_ID_PROPERTY_NAME: string =
  PRODUCT_TYPE_ENTITY_METADATA.primaryIDPropertyName;

/**
 * Every property name the legacy entity declares, as a keyed set — the port of the
 * `getPropertiesStruct()` structure [org/Hibachi/HibachiTransient.cfc:L739] that both `hasProperty`
 * [:L764] and `getPropertyMetaData` [:L741] key into. Membership is an own-key test in both.
 */
export const PRODUCT_TYPE_DECLARED_PROPERTIES: DeclaredPropertyNameSet<string> = Object.freeze({
  ...PRODUCT_TYPE_ENTITY_METADATA.properties,
  ...(PRODUCT_TYPE_ENTITY_METADATA.declaredNonFieldProperties ?? {}),
});

/**
 * The collaborators the relationship descriptors need, supplied by the composition root
 * (`src/config/container.ts`) rather than resolved here.
 */
export interface ProductTypePopulationCollaborators {
  readonly productTypeLoader: RelatedEntityLoader<ProductType>;

  readonly populateProductType: SubPropertyPopulator<ProductType>;

  readonly productLoader: RelatedEntityLoader<Product>;

  readonly populateProduct: SubPropertyPopulator<Product>;

  readonly attributeValueLoader: RelatedEntityLoader<ProductTypeAttributeValueOwner>;

  readonly populateAttributeValue: SubPropertyPopulator<ProductTypeAttributeValueOwner>;
}

/**
 * The population contract for `ProductType` — the declared replacement for the runtime metadata walk
 * `getProperties()` performed [`org/Hibachi/HibachiTransient.cfc:L770-L789`].
 *
 * @param collaborators - The injected loaders and sub-property populators.
 * @returns The complete population contract for this entity, `persistent: true` per the
 * `persistent="true"` attribute on `model/entity/ProductType.cfc:L49`.
 */
export function createProductTypePropertyDescriptorSet(
  collaborators: ProductTypePopulationCollaborators,
): PropertyDescriptorSet<ProductType, ProductTypePropertyName> {
  // `:L62` — the self-reference. `relatedPrimaryIdPropertyName` is this entity's own identifier
  // property, since the related entity is another ProductType.
  const parentProductTypeDescriptor: ManyToOnePropertyDescriptor<'parentProductType', ProductType> =
    {
      name: 'parentProductType',
      kind: 'many-to-one',
      relatedPrimaryIdPropertyName: 'productTypeID',
      loader: collaborators.productTypeLoader,
      populateRelated(related, data) {
        collaborators.populateProductType(related, data);
      },
    };

  // `:L65` — `singularname="childProductType"`. `addRelated` routes through this entity's own
  // bidirectional helper, which is what keeps both sides consistent during population.
  const childProductTypesDescriptor: OneToManyPropertyDescriptor<
    ProductType,
    'childProductTypes',
    ProductType
  > = {
    name: 'childProductTypes',
    kind: 'one-to-many',
    relatedPrimaryIdPropertyName: 'productTypeID',
    singularName: 'childProductType',
    loader: collaborators.productTypeLoader,
    addRelated(target, related) {
      target.addChildProductType(related);
    },
    populateRelated(related, data) {
      collaborators.populateProductType(related, data);
    },
  };

  // `:L66` — `singularname="product"`. `addRelated` uses the IR-1 member declared on the class, so
  // population sets the inverse side exactly as `setProducts` does.
  const productsDescriptor: OneToManyPropertyDescriptor<ProductType, 'products', Product> = {
    name: 'products',
    kind: 'one-to-many',
    relatedPrimaryIdPropertyName: 'productID',
    singularName: 'product',
    loader: collaborators.productLoader,
    addRelated(target, related) {
      target.addProduct(related);
    },
    populateRelated(related, data) {
      collaborators.populateProduct(related, data);
    },
  };

  // `:L67` — `singularname="attributeValue"`, related identifier `attributeValueID`
  // [`model/entity/AttributeValue.cfc:L57`].
  const attributeValuesDescriptor: OneToManyPropertyDescriptor<
    ProductType,
    'attributeValues',
    ProductTypeAttributeValueOwner
  > = {
    name: 'attributeValues',
    kind: 'one-to-many',
    relatedPrimaryIdPropertyName: 'attributeValueID',
    singularName: 'attributeValue',
    loader: collaborators.attributeValueLoader,
    addRelated(target, related) {
      target.addAttributeValue(related);
    },
    populateRelated(related, data) {
      collaborators.populateAttributeValue(related, data);
    },
  };

  // The four `hb_populateEnabled="false"` audit properties [`:L83-L86`], derived from the shared
  // list so the four name strings are never written out a second time.
  const auditPropertyDescriptors: readonly DisabledPropertyDescriptor<AuditPropertyName>[] =
    AUDIT_PROPERTY_NAMES.map<DisabledPropertyDescriptor<AuditPropertyName>>(
      (auditPropertyName) => ({
        name: auditPropertyName,
        populateEnabled: false,
      }),
    );

  const properties: readonly PopulatePropertyDescriptor<ProductType, ProductTypePropertyName>[] = [
    // `:L52-L59` — the eight persistent scalars. None declares `fieldtype`, so `kind` is omitted;
    // None declares `notNull`, so a blank value deletes the key rather than assigning `''`.
    { name: 'productTypeID', valueType: 'string' },
    { name: 'productTypeIDPath', valueType: 'string' },
    { name: 'activeFlag', valueType: 'boolean' },
    { name: 'publishedFlag', valueType: 'boolean' },
    { name: 'urlTitle', valueType: 'string' },
    { name: 'productTypeName', valueType: 'string' },
    { name: 'productTypeDescription', valueType: 'string' },
    { name: 'systemCode', valueType: 'string' },
    parentProductTypeDescriptor,
    childProductTypesDescriptor,
    productsDescriptor,
    attributeValuesDescriptor,
    // `:L70-L77` — the eight many-to-many inverses are declared in the legacy here, between the
    // one-to-many block and `remoteID`. They have no descriptor; see the warning above.
    { name: 'remoteID', valueType: 'string' },
    ...auditPropertyDescriptors,
  ];

  /*
   * `entityName` is the legacy `getClassName` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
   * [model/entity/ProductType.cfc:L49] — the bare component name. It is the arm 3 operand of the
   * population gate [org/Hibachi/HibachiTransient.cfc:L190] and the key the out-of-scope permission
   * records are stored under [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141], so the legacy
   * spelling is carried verbatim rather than read from `ProductType.name` at runtime.
   */
  return { entityName: 'ProductType', persistent: true, properties };
}

/* Not ported — every omission with its locator and its reason. */
