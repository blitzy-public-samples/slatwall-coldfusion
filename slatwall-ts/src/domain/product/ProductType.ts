/**
 * ProductType — the self-referencing hierarchy of the Slatwall Catalog.
 *
 * Ported from [model/entity/ProductType.cfc]. Scope per AAP §0.4.1.4: the self-referencing hierarchy,
 * `productTypeIDPath`, `systemCode`, `getBaseProductType()` [:L110], and
 * `getInheritedAttributeSetAssignments()` boundary-stubbed with defect D21 flagged. The consolidated
 * register at the foot of this file gives a locator and a reason for every member deliberately not
 * carried across.
 *
 * Standards citations below use the AAP §0.7.3 identifiers S1-S9. `F<n>` markers are this port's own
 * file-scope rules; the two cited most often are F9 (SmartList members belong to
 * `src/ports/SmartListQueryPort.ts` and `src/adapters/mysql/SmartListQueryBuilder.ts`, never to the
 * domain layer) and F22 (framework members are not declared on domain entities).
 *
 * THIS ENTITY CARRIES MORE WEIGHT THAN ITS SIZE SUGGESTS. `getBaseProductType()` produces the literal
 * three-way branch key of the largest business rule in the slice, `SkuService.createSkus`
 * [model/service/SkuService.cfc:L58-L211], whose merchandise arm is selected at [:L61] by
 * `arguments.product.getProductType().getBaseProductType() == "merchandise"` and whose fallthrough
 * `throw` sits at [:L204]. [model/entity/Sku.cfc:L577-L584] and [model/dao/SkuDAO.cfc:L154-L156]
 * discriminate on the same value. A wrong answer from this one method silently produces the wrong
 * SKUs, or none, with no error raised anywhere.
 *
 * THE LEGACY COMPONENT DECLARATION — [model/entity/ProductType.cfc:L49] — fact by fact:
 *
 *     component displayname="Product Type" entityname="SlatwallProductType" table="SwProductType"
 *       persistent="true" extends="HibachiEntity" cacheuse="transactional"
 *       hb_serviceName="productService" hb_permission="this"
 *       hb_parentPropertyName="parentProductType" { … }
 *
 *   - `extends="HibachiEntity"` resolves to the LOCAL `model/entity/HibachiEntity.cfc`, NOT to
 *     `org/Hibachi/HibachiEntity.cfc` (IR-8). The distinction is load-bearing elsewhere in the
 *     slice — `model/service/BrandService.cfc:L76`'s `super.save()` reaches the local override at
 *     `model/service/HibachiService.cfc:L86` — and it is recorded here because the local base is
 *     what supplied `populate()` [model/entity/HibachiEntity.cfc:L56], now owned by
 *     `../base/populate`. This class extends NOTHING: §0.3.3 replaces template-method inheritance
 *     with composition, so the two behaviours this file needs from its former base classes arrive
 *     as imported free functions (`../base/AuditableEntity`) and as an exported descriptor set
 *     consumed by `../base/populate`.
 *   - `entityname="SlatwallProductType"` / `table="SwProductType"`. The TABLE name appears in this
 *     file ONLY as prose provenance, never as code: S2 confines every table name, column name and
 *     SQL fragment to `src/adapters/mysql/**`, and this module issues no query and imports no
 *     driver. The LOGICAL ORM name is declared exactly once as a value, in
 *     {@link PRODUCT_TYPE_ENTITY_METADATA}, because `getEntityName()`
 *     [org/Hibachi/HibachiEntity.cfc:L287-L289] is observable behaviour that
 *     `src/ports/UniquePropertyPort.ts` consumes; a logical entity name is not a table identifier
 *     and S2 is unaffected.
 *   - `cacheuse="transactional"` — a Hibernate second-level cache directive, declared on 111 of the
 *     113 legacy entities. FLAGGED, NOT IMPLEMENTED (mismatch M7): nothing survives between Lambda
 *     invocations except module-scope state, and module-scope caching of per-entity data would
 *     bleed across warm invocations and therefore across tenants. This file holds no module-scope
 *     mutable binding and adds no cache; the single legacy memoization it does carry
 *     (`variables.productTypeIDPath`, `model/entity/ProductType.cfc:L251-L253`) is reproduced as
 *     PER-INSTANCE state on {@link ProductType.getProductTypeIDPath}.
 *   - `hb_serviceName="productService"` — THERE IS NO `ProductTypeService`. Product types are served by
 *     `ProductService`: `saveProductType` is declared at [model/service/ProductService.cfc:L294], and
 *     the reader `getProductType(id)` has no declaration at all — it is fabricated at runtime by
 *     `onMissingMethod` prefix dispatch [org/Hibachi/HibachiService.cfc:L255-L281] and is one of the
 *     members AAP §0.4.2.5 requires to be declared explicitly (IR-1). That synthesized reader is
 *     exactly the capability {@link ProductTypeRootResolver} stands in for.
 *   - `hb_permission="this"` is an admin-authorisation hint consumed by the retired framework's
 *     permission layer. Recorded; nothing here reads or enforces it.
 *   - `hb_parentPropertyName="parentProductType"` is the DECLARATIVE STATEMENT OF THE SELF-REFERENCE.
 *     The framework's identifier-path machinery keyed off this attribute, which is why the ported
 *     {@link ProductType.getProductTypeIDPath} walks `parentProductType` specifically rather than a
 *     property named at run time.
 *
 * [model/validation/ProductType.json] — DOCUMENTED HERE, ENFORCED ELSEWHERE. These rules are
 * behaviour, not configuration (IR-4); `src/validation/rules/productType.rules.ts` and
 * `src/validation/Validator.ts` interpret them and THIS FILE ENFORCES NONE OF THEM. They are
 * reproduced because two of them explain why fields on this class exist at all. There are exactly two
 * contexts, `save` and `delete`:
 *
 *     "productTypeName":   [{"contexts":"save",  "required":true}]
 *     "urlTitle":          [{"contexts":"save",  "required":true, "unique":true}]
 *     "products":          [{"contexts":"delete","maxCollection":0}]
 *     "childProductTypes": [{"contexts":"delete","maxCollection":0}]
 *     "systemCode":        [{"contexts":"delete","maxLength":0}]
 *     "physicalCounts":    [{"contexts":"delete","maxCollection":0}]
 *
 *   - THE `systemCode` `maxLength: 0` DELETE GUARD IS WHAT PROTECTS THE THREE SEEDED DISCRIMINATORS
 *     FROM DELETION. A product type carrying ANY `systemCode` fails the delete context, and the only
 *     rows that carry one are the three seeded at [config/dbdata/SlatwallProductType.xml.cfm:L13-L15].
 *     That rule READS {@link ProductType.systemCode}, which is why the field exists here even though
 *     this file enforces nothing.
 *   - `urlTitle`'s `unique: true` is not implemented here either. Application-side uniqueness is IR-5,
 *     enforced by an existence query in `src/adapters/mysql/UniquePropertyChecker.ts` ported from
 *     [org/Hibachi/HibachiDAO.cfc:L130-L146], independently of the column's `unique="true"` metadata.
 *   - `physicalCounts` — S9, DO NOT INVENT IT. All three validation documents in this product family
 *     reference the key ([model/validation/Product.json:L7], [model/validation/Brand.json:L7],
 *     [model/validation/ProductType.json:L8]) and none of the corresponding entities declares it —
 *     they declare `physicals`. Repository-wide, the ONLY `physicalCounts` property declaration is
 *     [model/entity/Physical.cfc:L59]. It is a genuine undeclared-property validation reference in the
 *     legacy source; no field is added here to make it resolve.
 *
 * `test/domain/ProductType.test.ts` IS NET-NEW: AAP §0.6.5.2 verified that no `ProductTypeTest`
 * exists anywhere in `meta/tests/`, so this entity had zero legacy coverage. The target test still
 * follows the four inherited assertions of `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67`,
 * which split across layers: the `validate`/`hasErrors` assertion lands on the validation layer
 * because F22 forbids declaring those members here; `simple_representation_exists_and_is_simple`
 * lands on {@link ProductType.getSimpleRepresentation}, this file's single sanctioned F22 exception
 * because the legacy genuinely overrides it with a recursive body at
 * [model/entity/ProductType.cfc:L273-L278]; `has_primary_id_property_name` lands on
 * {@link ProductType.getPrimaryIDPropertyName}; and `defaults_are_correct` is satisfied by
 * {@link ProductType.isNew} and {@link ProductType.getPrimaryIDValue} together with `productTypeID`
 * defaulting to the empty string, which is what [`:L52`]'s `unsavedvalue=""` declares. The primary
 * key is NOT in the population descriptor set: F08 establishes that the legacy never populates a
 * `fieldtype="id"` property, so the name is declared without being writable.
 *
 * The obligation this file carries for that suite (S6) is that `new ProductType()` succeeds with NO
 * arguments — no framework bootstrap, no container, no database, no I/O and no async work in the
 * constructor — and that every collaborator is substitutable by a plain object literal satisfying a
 * structural interface. Because {@link ProductType.getBaseProductType} takes its resolver as an
 * explicit parameter, both of its branches are reachable from a two-line stub.
 */

import type { BaseProductType } from '../BaseProductType';
/*
 * ⚠️ THREE HELPERS AND ONE TYPE WERE DROPPED FROM THIS IMPORT ALONGSIDE THE SEVEN MANAGED-ENTITY
 * METHODS, AND THEIR ABSENCE IS THE EVIDENCE THAT THE REMOVAL WAS COMPLETE. `hasDeclaredProperty`,
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
import type { Product } from './Product';

/*
 * =============================================================================================
 * THE `./Product` IMPORT — A TYPE-LEVEL CYCLE THAT IS EXPECTED AND CORRECT (G6)
 * =============================================================================================
 * `Product` is IN SCOPE (AAP §0.2.1.2), so it is imported as the real domain type and NOT forked
 * into a local structural stand-in: a fork would compile and then drift, and two divergent notions
 * of "product" in one folder is precisely the outcome the ports pattern exists to avoid.
 *
 * `domain/product/Product.ts` refers back to this module for its own `productType` association, so
 * the two files reference each other at the TYPE level. That is not a runtime cycle: `import type`
 * is fully erased at emit, so neither the CommonJS output nor the esbuild bundle contains a
 * `require()` between them, and there is no module-initialisation ordering hazard to reason about.
 * The import is deliberately written in `import type` form for exactly that reason — a value import
 * used only in type positions would survive `isolatedModules` transpilation and reintroduce the
 * edge.
 *
 * Per AAP §0.4.5 the whole subtree lands in ONE phase, so a moment in which `./Product.ts` is not
 * yet on disk is expected rather than a defect in this file. Three responses to that moment are
 * explicitly forbidden and none is taken here: this file does not create `./Product.ts`, does not
 * fork a duplicate interface for it, and does not weaken the type to `any`, `unknown` or `unknown[]`
 * to make the reference resolve.
 */

/**
 * The resolved current-account context accepted by the two ORM lifecycle hooks.
 *
 * G6 TRANSLATION DECISION — WHY THIS TYPE IS DERIVED RATHER THAN IMPORTED. The stamping functions in
 * `../base/AuditableEntity` accept an `AccountReference`, which is declared in
 * `src/ports/AccountContextPort.ts`. S4 confines this file's imports to `../BaseProductType`, the
 * two `../base/` modules and a type-only `./Product`, so `ports/` is out of reach from here — and
 * reaching into it would put a domain entity one import away from the port layer for no behavioural
 * gain. Deriving the parameter type from the function this file already imports keeps the two in
 * lockstep automatically: if the audit module's signature changes, this alias changes with it and
 * every hook below fails to compile until it is reconciled. Nothing is duplicated and nothing is
 * asserted.
 *
 * It is exported because it appears in the parameter list of two public methods
 * ({@link ProductType.preInsert} and {@link ProductType.preUpdate}). The eventual caller named in
 * their `TODO(boundary)` annotations — `src/adapters/mysql/UnitOfWork.ts` — sits in the adapter
 * layer, which S4 permits to import from `domain/`, so exporting the alias lets that caller name the
 * type it must supply instead of reconstructing it with `Parameters<…>` gymnastics of its own.
 */
export type AuditActor = Parameters<typeof applyPreInsertAudit>[1];

/**
 * A `systemCode` carrier — the only thing {@link ProductType.getBaseProductType} reads off the root
 * product type it resolves.
 *
 * Narrow by design (Phase E): the legacy expression calls exactly one method on the resolved
 * entity, `getSystemCode()`, so exactly one member is declared. `ProductType` itself satisfies this
 * structurally, so a real implementation can hand back a fully hydrated instance without any
 * adaptation, and a test can hand back `{ systemCode: 'merchandise' }`.
 *
 * `systemCode` is optional because the legacy column is nullable and because the root's code being
 * absent is a reachable state — see the resolution table on
 * {@link ProductType.getBaseProductType}. Under `exactOptionalPropertyTypes` "absent" means the key
 * is missing rather than present-and-`undefined`.
 */
export interface ProductTypeSystemCodeSource {
  readonly systemCode?: string;
}

/**
 * Resolves a product type by identifier — the injected replacement for the legacy service locator
 * inside `getBaseProductType()`.
 *
 * PORT OF the collaborator half of `model/entity/ProductType.cfc:L112`:
 *
 *     getService("ProductService").getProductType( listFirst(getProductTypeIDPath()) ).getSystemCode()
 *
 * G6 TRANSLATION DECISION — WHY A CAPABILITY PARAMETER AND NOT A SERVICE IMPORT. Three separate
 * constraints converge on the same answer. R2/S3 forbid a service locator and any string-keyed
 * runtime resolution, so `getService("ProductService")` cannot survive in any form. S4 forbids a
 * `domain/` module importing from `services/` outright, so importing the real `ProductService`
 * is not an option either. And the method being ported needs precisely ONE capability — map an
 * identifier to something carrying a `systemCode` — so a whole service would be a wildly
 * over-broad dependency for it.
 *
 * The interface is named for what it DOES rather than for the class that will implement it,
 * deliberately: `ProductTypeRootResolver` can never be mistaken for `ProductService`, and a reader
 * cannot conclude that a domain entity depends on a service.
 *
 * `getProductType` keeps the legacy method name so the mapping stays greppable. That legacy member
 * has no declaration anywhere — it is fabricated by `onMissingMethod` prefix dispatch at
 * `org/Hibachi/HibachiService.cfc:L255-L281` and is listed in AAP §0.4.2.5 as one of the eighteen
 * synthesized members that must be declared explicitly (IR-1).
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
   *   product type's identifier path. May be the empty string when the path is empty; see the
   *   resolution table on {@link ProductType.getBaseProductType}.
   * @returns The product type, or `undefined` when no such row exists — the state in which the
   *   legacy expression dereferenced a null.
   */
  getProductType(productTypeID: string): Promise<ProductTypeSystemCodeSource | undefined>;
}

/**
 * One attribute-set assignment, as returned by the D21 stub — DELIBERATELY OPAQUE.
 *
 * S9 — INVENT NOTHING. `AttributeSetAssignment` is not a shape that can be read from anywhere: the
 * identifier occurs only at [model/entity/ProductType.cfc:L92] and [:L94], and release 3.1.39 has no
 * `model/entity/AttributeSetAssignment.cfc` at all. So no field is guessed here.
 *
 * `object` is chosen over two alternatives that both fail. `unknown` would be wider than the legacy
 * value, which is always an entity instance and never a primitive or null. `Record<string, unknown>`
 * would be NARROWER in practice, because a class instance is not assignable to an index-signature
 * type, so a future adapter handing back real entities could not satisfy it. The type is exported
 * because it appears in a public return type and a caller must be able to name it.
 */
export type InheritedAttributeSetAssignment = object;

/**
 * Supplies the attribute-set assignments read by the D21 stub.
 *
 * PORT OF the collaborator half of `model/entity/ProductType.cfc:L94`. The method name preserves the
 * legacy call shape — `getAttributeSetAssignmentSmartList().getRecords()` — collapsed into the one
 * operation actually performed: fetch the records.
 *
 * TODO(boundary): the rightful owner is the `attributeService` family, which AAP §0.2.2.1 places
 * explicitly out of scope (`model/**\/Attribute*.cfc`, six files), reached through
 * `src/ports/SmartListQueryPort.ts` — the abstraction that replaces
 * `org/Hibachi/HibachiSmartList.cfc`, whose members F9 keeps out of the domain layer entirely.
 *
 * FLAGGED EXECUTION-MODEL MISMATCH (M5/M7), not silently resolved: this capability is declared
 * SYNCHRONOUS because the legacy member it serves is `public array function` and TR-1 preserves that
 * signature, while the legacy synchronicity was itself only possible inside a request-scoped ORM
 * session. A repository-backed implementation in the target would be asynchronous. The mismatch is
 * recorded here rather than pre-empted, and it is moot in practice for the reason given on
 * {@link ProductType.getInheritedAttributeSetAssignments}: the member has no caller anywhere in the
 * repository and queries an entity that does not exist.
 */
export interface InheritedAttributeSetAssignmentSource {
  getAttributeSetAssignmentRecords(): readonly InheritedAttributeSetAssignment[];
}

/**
 * The inverse side of the `attributeValues` relationship — exactly the two members the ported
 * helpers touch, and nothing else (Phase E).
 *
 * PORT OF the two calls at `model/entity/ProductType.cfc:L232` and :L235. Both resolve to
 * HAND-WRITTEN bidirectional helpers on the related entity, `model/entity/AttributeValue.cfc:L257`
 * and :L263 — verified, and worth verifying, because it is what makes these two delegations real
 * behaviour rather than accessor noise.
 *
 * `removeProductType`'s parameter is optional because the legacy signature is `removeProductType(any
 * productType)` with no `required` modifier and defaults the argument from its own field at
 * `model/entity/AttributeValue.cfc:L264-L266` — the same shape as
 * {@link ProductType.removeParentProductType}.
 *
 * Named for the ROLE it plays rather than after `AttributeValue`, so it cannot be mistaken for a
 * port of that entity. `attributeValueID` [model/entity/AttributeValue.cfc:L57] is deliberately not
 * declared: nothing in this file reads it.
 *
 * TODO(boundary): the implementer is the `Attribute*` family, out of scope per AAP §0.2.2.1. Note
 * for whoever writes it that the legacy `AttributeValue.setProductType` reaches BACK into
 * `productType.hasAttributeValue(this)` and `productType.getAttributeValues()`
 * [model/entity/AttributeValue.cfc:L259-L260]. Neither member is declared on this class, because
 * Rule 2 admits a synthesized ORM member only where an IN-SCOPE call site exists and both call sites
 * are in the out-of-scope `AttributeValue.cfc`. The {@link ProductType.attributeValues} field is
 * public, so an in-scope adapter can reach the live collection directly when one is written.
 */
export interface ProductTypeAttributeValueOwner {
  setProductType(productType: ProductType): void;
  removeProductType(productType?: ProductType): void;
}

/*
 * =============================================================================================
 * THE FIVE OPAQUE RELATIONSHIP REFERENCE TYPES — `model/entity/ProductType.cfc:L70-L77`
 * =============================================================================================
 * The eight many-to-many-inverse collections are DECLARED as fields below, because the legacy
 * declares them and `getProperties()` walked every declaration, but NONE of them is traversed by
 * any ported member: the sixteen add/remove helpers that would traverse them are the omitted
 * `model/entity/ProductType.cfc:L174-L228` and :L238-L244 set, and every collaborator involved is
 * explicitly out of scope (`Promotion*` 9 files, `PriceGroup*` 4, `Attribute*` 6, `Physical*` 6).
 *
 * Each element type therefore carries exactly ONE member: the related entity's primary identifier.
 * Nothing is guessed — every name below is read from the legacy `inversejoincolumn` attribute of the
 * property it serves and cross-checked against the related entity's own `fieldtype="id"`
 * declaration:
 *
 *   promotionRewardID    `:L70`, `:L71`  ↔ `model/entity/PromotionReward.cfc:L60`
 *   promotionQualifierID `:L72`, `:L73`  ↔ `model/entity/PromotionQualifier.cfc:L52`
 *   priceGroupRateID     `:L74`, `:L75`  ↔ `model/entity/PriceGroupRate.cfc:L52`
 *   attributeSetID       `:L76`          ↔ `model/entity/AttributeSet.cfc:L52`
 *   physicalID           `:L77`          ↔ `model/entity/Physical.cfc:L52`
 *
 * Five types rather than eight, because six of the eight properties pair up onto three related
 * entities: `promotionRewards`/`promotionRewardExclusions` are both `cfc="PromotionReward"`,
 * `promotionQualifiers`/`promotionQualifierExclusions` are both `cfc="PromotionQualifier"`, and
 * `priceGroupRates`/`priceGroupRateExclusions` are both `cfc="PriceGroupRate"`. The exclusion
 * variants differ only in their link table and in which helper they route through — the legacy
 * inclusion helpers call `addProductType`/`removeProductType` on the collaborator while the
 * exclusion helpers call `addExcludedProductType`/`removeExcludedProductType`
 * [`:L184`, `:L187`, `:L200`, `:L203`, `:L216`, `:L219`] — so a single element type per entity is
 * both correct and non-duplicative.
 *
 * Each is a one-member interface rather than an empty marker: an empty object type accepts anything
 * at all, which would make these fields untyped in effect.
 * =============================================================================================
 */

/** A `PromotionReward` reference — see the block above. Link tables `SwPromoRewardProductType`
 * [`model/entity/ProductType.cfc:L70`] and `SwPromoRewardExclProductType` [`:L71`]. */
export interface PromotionRewardReference {
  readonly promotionRewardID: string;
}

/** A `PromotionQualifier` reference. Link tables `SwPromoQualProductType`
 * [`model/entity/ProductType.cfc:L72`] and `SwPromoQualExclProductType` [`:L73`]. */
export interface PromotionQualifierReference {
  readonly promotionQualifierID: string;
}

/** A `PriceGroupRate` reference. Link tables `SwPriceGroupRateProductType`
 * [`model/entity/ProductType.cfc:L74`] and `SwPriceGrpRateExclProductType` [`:L75`]. */
export interface PriceGroupRateReference {
  readonly priceGroupRateID: string;
}

/** An `AttributeSet` reference. Link table `SwAttributeSetProductType`
 * [`model/entity/ProductType.cfc:L76`]. */
export interface AttributeSetReference {
  readonly attributeSetID: string;
}

/** A `Physical` reference. Link table `SwPhysicalProductType`
 * [`model/entity/ProductType.cfc:L77`]. */
export interface PhysicalReference {
  readonly physicalID: string;
}

/**
 * The value {@link ProductType.getBaseProductType} yields: a `systemCode` read out of the database,
 * which MAY be one of the three seeded discriminators and may equally be anything else.
 *
 * THIS TYPE IS THE SINGLE MOST IMPORTANT DECLARATION IN THIS FILE, AND WIDENING IT IS NOT A
 * TIDY-UP — NARROWING IT IS A SILENT DELETION OF LEGACY BEHAVIOUR.
 *
 * `model/service/SkuService.cfc:L58-L211` branches three ways on this value and ends in a
 * fallthrough `throw` at :L204 whose message literal is owned by `src/errors/DomainError.ts`. If
 * this method were typed as returning ONLY `BaseProductType`, the compiler would prove that
 * fallthrough unreachable, a future reader would delete it as dead code, and a genuinely observable
 * legacy behaviour would be gone — with no test failing, because the type system would have
 * asserted the impossibility rather than the code establishing it. The legacy member is declared
 * `public any function` [model/entity/ProductType.cfc:L110] and returns whatever string the
 * `SwProductType` row holds; nothing in the schema, in `model/validation/ProductType.json` or
 * anywhere in the code constrains it to the three seeded codes.
 *
 * G6 TRANSLATION DECISION — WHY THE `string & {}` MEMBER IS THERE. The intersection is the standard
 * "literal union" idiom: it keeps the union from collapsing so the three known codes stay visible to
 * a reader and to editor completion, while every other string remains assignable, so the
 * unrecognised path stays genuinely reachable. `BaseProductType | string` would be reduced by the
 * compiler to plain `string` and the documentation value would be lost; the intersection preserves
 * both halves without asserting anything.
 *
 * G6 TRANSLATION DECISION — WHY A RAW CODE AND NOT A DISCRIMINATED RESULT. AAP §0.4.1.4 permits
 * either. The raw code is chosen because every consumer compares it directly against a string —
 * `== "merchandise"` at `model/service/SkuService.cfc:L61`, `eq "contentAccess"` at
 * `model/entity/Sku.cfc:L577`, the same at `model/dao/SkuDAO.cfc:L154-L156` — so the raw form
 * preserves the call-site shape those consumers already have (TR-1), whereas a wrapper object would
 * force every one of them to be rewritten around a discriminant that the legacy never had.
 *
 * WHERE THE RUNTIME RECOGNITION BELONGS, STATED EXPLICITLY BECAUSE THE TWO REQUIREMENTS PULL AGAINST
 * EACH OTHER. The value must be recognised through `resolveBaseProductType` — it is an unvalidated
 * database string and nothing else may be assumed about it — AND the unrecognised case must stay
 * reachable. Both hold only if the recognition happens at the RECOGNITION POINT, which is the consumer,
 * not here: recognising inside this method would either shrink the return type to the three codes
 * (deleting the fallthrough) or be a branch whose arms return the same value. The recogniser is
 * therefore named, located and explained here, and imported by whoever recognises — one line,
 * `import { resolveBaseProductType } from '../BaseProductType'`. It is deliberately NOT imported by
 * this module: an import used nowhere is a lint error under this project's configuration, and adding a
 * use for the import's sake is exactly the kind of ceremony that hides a decision instead of recording
 * it.
 *
 * ⚠️ AND THE RECOGNITION IS CASE-INSENSITIVE, WHICH IS WHY IT IS A RESOLVER AND NOT A TYPE GUARD. Every
 * legacy comparison listed above is CFML `==`, which folds case, so a row holding `Merchandise` matched
 * `"merchandise"`. A `value is BaseProductType` predicate would narrow the OBSERVED text and leave every
 * subsequent literal comparison failing against it; `resolveBaseProductType` instead returns the
 * CANONICAL code, or `undefined`, and leaves the stored value untouched. Read its documentation before
 * comparing a value of this type to anything.
 *
 * RECOGNITION IS THE CONSUMER'S JOB, AND IT HAS A TOOL. `resolveBaseProductType` in
 * `../BaseProductType` maps a value of this type onto {@link BaseProductType} and gives a consumer
 * exhaustive checking inside the recognised branch plus a genuinely reachable `undefined` case. It is
 * deliberately NOT called inside `getBaseProductType`: the legacy method is recognition-blind, so
 * calling it here could only either narrow the return type — deleting the fallthrough, as above — or
 * be a no-op branch whose arms return the same value. Note also that the three legacy consumers treat
 * the unrecognised case DIFFERENTLY and must not be aligned to one another: `createSkus` throws,
 * `getSkuDefinition` [model/entity/Sku.cfc:L574-L590] has no fallthrough arm at all and leaves its
 * result as the empty string, and `SkuDAO.getProductSkus` [model/dao/SkuDAO.cfc:L154-L161] simply adds
 * no join. None of those decisions belongs to this entity.
 */
export type BaseProductTypeCode = BaseProductType | (string & {});

/**
 * `SlatwallProductType`, table `SwProductType` — a Catalog product type.
 *
 * Extends nothing, by design (§0.3.3, composition over inheritance): the audit lifecycle arrives
 * from `../base/AuditableEntity` as free functions, population arrives from `../base/populate`
 * driven by {@link createProductTypePropertyDescriptorSet}, and `implements AuditableEntity` below
 * is a purely structural compile-time check that the four audit fields match that contract exactly —
 * it creates no base class and no inheritance edge.
 *
 * THE DATA SURFACE IS PUBLIC FIELDS, NOT ACCESSOR PAIRS (Rule 1). The legacy CFC declared
 * `accessors="true"` and relied on CFML to generate a `getX()`/`setX()` pair for every property;
 * none of those pairs is reproduced. The decisive reason is not brevity: `../base/populate`
 * implements CFML's null-by-deletion semantics as `delete target[name]`
 * (`clearPropertyValue`), and a value behind an accessor cannot be deleted. The observable proof
 * that the legacy really deletes rather than blanks sits in this entity's own save path —
 * `model/service/ProductService.cfc:L295` (`saveProductType`) tests
 * `isNull(getURLTitle()) || !len(getURLTitle())`, whereas `saveProduct` at :L268 tests
 * `isNull(getURLTitle())` ALONE. If population assigned `''` instead of removing the key, the
 * product-side test could never fire and unique-URL-title generation would be dead code.
 *
 * G6 — HOW TO TEST FOR AN ABSENT PROPERTY IN THIS PORT, BECAUSE THE OBVIOUS ANSWER IS WRONG.
 * `tsconfig.json` targets ES2022, which turns `useDefineForClassFields` ON by default, so the emitted
 * constructor DEFINES every ordinarily-declared field below — including the optional ones with no
 * initialiser — as an own property whose value is `undefined`. A freshly constructed instance
 * therefore carries every SCALAR key, and `'systemCode' in productType` and `Object.keys(productType)`
 * are MEANINGLESS as absence tests for those. They are not the translation of CFML's
 * `structKeyExists(variables, …)`, however much they resemble it.
 *
 * ONE FIELD IS DELIBERATELY DIFFERENT: {@link ProductType.parentProductType} carries `declare`, so it
 * is NOT defined on a fresh instance and IS genuinely absent. That single exception exists because it
 * is the class's only ASSOCIATION field and `src/adapters/mysql/rowMappers.ts` guarantees an
 * unresolved association is absent rather than present-and-undefined; the field's own doc comment
 * gives the full reasoning. It changes nothing about how this file TESTS for absence — every guard
 * still uses `=== undefined`, which is correct for both states — so the rule below is unaffected.
 *
 * `value === undefined` IS the translation of the legacy `isNull(...)`, and it is what every guard in
 * this file uses, without exception — which is also what the framework itself used at every decision
 * point (`isNull(getSystemCode())` at `model/entity/ProductType.cfc:L111`,
 * `isNull(getParentProductType())` at `:L274`, `isNull(variables.productTypeIDPath)` at `:L251`).
 * Three consequences worth stating so nobody has to rediscover them:
 *
 *   - `delete this.parentProductType` in {@link ProductType.removeParentProductType} remains the
 *     faithful port of `structDelete`. Because that field carries `declare`, the key is absent on a
 *     fresh instance and present only once a parent has genuinely been assigned, so the delete
 *     removes a key that really is there. Either way the state reads identically through
 *     `=== undefined`, which is the only lens this port looks through.
 *   - `exactOptionalPropertyTypes` still earns its keep, at the level where it applies: it forbids
 *     ASSIGNING `undefined` to any of these properties, so nothing in this file can manufacture the
 *     "explicitly undefined" state, and `../base/populate` clears a property by deleting it
 *     (`clearPropertyValue`) rather than by blanking it.
 *   - Every dependency agrees on the `=== undefined` convention:
 *     `../base/AuditableEntity`'s accessors test `entity.createdDateTime === undefined`, and neither
 *     `../base/populate` nor `src/validation/Validator.ts` ever inspects key presence on an ENTITY —
 *     `populate`'s `hasOwnProperty` call reads the incoming PAYLOAD, and the validator's key count is
 *     gated behind a prototype check that excludes class instances by construction.
 *
 * A METHOD IS DECLARED ONLY WHERE THE LEGACY HAS A REAL BODY, OR WHERE AN ORM-SYNTHESIZED MEMBER
 * HAS AN IN-SCOPE CALL SITE (Rule 2 / IR-1 / F4). That second clause is what admits
 * {@link ProductType.getChildProductTypes} [called at `model/entity/ProductType.cfc:L152`, :L159,
 * :L161], {@link ProductType.hasChildProductType} [:L151], {@link ProductType.addProduct} [:L105]
 * and {@link ProductType.getProducts} [called at `model/service/ProductService.cfc:L306`]. It is
 * also what EXCLUDES members whose only call sites are out of scope, and what excludes the framework
 * members F22 forbids outright — there is no `getPrimaryIDValue`, `getPrimaryIDPropertyName`,
 * `getNewFlag`, `validate`, `hasErrors`, `getErrors`, `getPropertyMetaData`, `onMissingMethod`,
 * `populate`, `getPropertySmartList`, `getPropertyOptionsSmartList`, `setting`, `getService`,
 * `getAttributeValue` or `hasUniqueProperty` anywhere in this class.
 *
 * {@link ProductType.getSimpleRepresentation} is the ONE sanctioned exception to that negative
 * mandate, because `model/entity/ProductType.cfc:L273-L278` genuinely overrides it with a real
 * recursive body. It gets NO `getSimpleRepresentationPropertyName()` companion — that override
 * belongs to `Product.ts` [model/entity/Product.cfc:L791-L793] — and `Brand.ts` has neither. The
 * three entity modules in this folder legitimately have three different shapes; they are not to be
 * harmonised.
 *
 * ⛔ AND THIS CLASS DOES NOT DECLARE `implements ManagedEntity`, WHICH ITS FIVE SIBLINGS DO. The
 * non-generic `ManagedEntity` interface in `../base/AuditableEntity` is the CONTRACT for the seven
 * framework introspection members, so claiming it would oblige this class to declare exactly the
 * members the mandate above forbids — and an earlier revision did claim it, which is precisely how
 * those seven methods came to be written here in contradiction of the mandate. The obligation was
 * removed rather than the mandate. `AuditableEntity` is still implemented, because the four audit
 * properties are genuine declared columns [model/entity/ProductType.cfc:L83-L86].
 *
 * ✅ NOTHING IS LOST, BECAUSE THE MANAGED VIEW IS A DIFFERENT TYPE FROM THE CONTRACT. `../base/populate`
 * declares the generic `ManagedEntity<TEntity>` — `TEntity & EntityMetadataSurface & EntityErrorSurface`
 * — and `manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA)` produces it by augmenting and
 * returning THE SAME INSTANCE. A collaborator that needs the introspection surface asks for the managed
 * view; the class itself simply does not pretend to be it. See the managed-entity contract block below.
 */
export class ProductType implements AuditableEntity {
  /*
   * ─── Persistent properties — `model/entity/ProductType.cfc:L52-L59` ──────────────────────────
   */

  /**
   * `property name="productTypeID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   * unsavedvalue="" default="";` [`:L52`]
   *
   * IR-6 — a 32-character LOWERCASE HEX identifier with NO DASHES, not an auto-increment number and
   * not a dashed RFC-4122 string. 107 of the 113 legacy entities declare exactly this shape.
   *
   * GENERATED BY THE PERSISTENCE LAYER, NEVER HERE. `src/util/uuid.ts` ports
   * `createSlatwallUUID()` and `src/adapters/mysql/**` decides when to call it; this file imports
   * no identifier generator, no `node:crypto` and nothing from `util/`. The empty-string default is
   * the legacy `unsavedvalue=""`/`default=""` pair verbatim, and it is what makes
   * {@link ProductType.isNew} a pure derived predicate.
   */
  productTypeID: string = '';

  /**
   * `property name="productTypeIDPath" ormtype="string" length="4000";` [`:L53`]
   *
   * The comma-delimited, ROOT-FIRST chain of identifiers from the root of the hierarchy down to and
   * including this product type. Column length 4000, recorded as provenance; no length check is
   * performed here (the legacy performs none either, and `model/validation/ProductType.json`
   * declares no rule for this property).
   *
   * Optional because it is genuinely absent until something computes it, which happens in exactly
   * two ways: lazily on first read through {@link ProductType.getProductTypeIDPath}, or by forced
   * recomputation in {@link ProductType.preInsert} / {@link ProductType.preUpdate}. It is also a
   * populatable column in the legacy — see the descriptor set — so a payload can set it directly.
   */
  productTypeIDPath?: string;

  /**
   * `property name="activeFlag" ormtype="boolean" hint="As A ProductType Get Old, They would be
   * marked as Not Active";` [`:L54`]
   *
   * The legacy hint is carried verbatim, typographical errors included. No default is applied here:
   * the CFC declares none, and the three seeded rows carry `activeFlag="1"` as SEED DATA
   * [`config/dbdata/SlatwallProductType.xml.cfm:L13-L15`] rather than as an entity-level default.
   * Inventing `= true` would be a behaviour change dressed as a convenience (S9).
   */
  activeFlag?: boolean;

  /** `property name="publishedFlag" ormtype="boolean";` [`:L55`] No default, for the same reason. */
  publishedFlag?: boolean;

  /**
   * `property name="urlTitle" ormtype="string" unique="true" hint="This is the name that is used in
   * the URL string";` [`:L56`]
   *
   * The `unique="true"` constraint is NOT enforced here. Two mechanisms enforce it in the legacy and
   * both live elsewhere: the database column constraint, and the application-side existence query of
   * IR-5 [`org/Hibachi/HibachiDAO.cfc:L130-L146`], ported to
   * `src/adapters/mysql/UniquePropertyChecker.ts`. Generation of a unique value is
   * `saveProductType`'s job [`model/service/ProductService.cfc:L295-L301`] via
   * `src/util/urlTitle.ts`; five of the eight unique columns in the whole system belong to this
   * slice, and this is one of them.
   */
  urlTitle?: string;

  /**
   * `property name="productTypeName" ormtype="string";` [`:L57`]
   *
   * EXPLICITLY NOT `notNull`. That attribute occurs exactly ONCE in the entire in-scope slice —
   * `model/entity/Product.cfc:L55` `productName` — and its absence here is behaviour, not an
   * oversight: when a blank value arrives, `../base/populate` DELETES this key rather than assigning
   * `''` [`org/Hibachi/HibachiTransient.cfc:L196-L197`], so "blank input" and "absent" converge on
   * the same state. `model/validation/ProductType.json` requires the property on save, which is
   * how the legacy rejects the blank case — in the validation layer, not here.
   */
  productTypeName?: string;

  /** `property name="productTypeDescription" ormtype="string" length="4000";` [`:L58`] */
  productTypeDescription?: string;

  /**
   * `property name="systemCode" ormtype="string";` [`:L59`] — the most consequential field in this
   * class.
   *
   * A plain nullable string in the schema, and only three rows in the entire system ever carry a
   * value: the seeded discriminators at `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, whose
   * literals are FIXED PLATFORM SEED DATA AND NOT TEST DATA (IR-7). Those literals are owned by
   * `../BaseProductType` and are deliberately NOT re-declared here — a second copy of an opaque
   * 32-character identifier is exactly the drift that module exists to prevent. They are the literal
   * branch keys of `SkuService.createSkus`, and the `systemCode` delete guard of
   * `model/validation/ProductType.json:L7` is what keeps those three rows undeletable.
   *
   * TYPED `string`, NOT `BaseProductType`, DELIBERATELY. The value is an arbitrary, unvalidated
   * database string; typing it as the three-member union would be an unchecked assertion about data
   * this code does not control, and it would make the unrecognised path unreachable. See
   * {@link BaseProductTypeCode}.
   */
  systemCode?: string;

  /*
   * ─── Related object properties (many-to-one) — `model/entity/ProductType.cfc:L62` ─────────────
   */

  /**
   * `property name="parentProductType" cfc="ProductType" fieldtype="many-to-one"
   * fkcolumn="parentProductTypeID";` [`:L62`]
   *
   * The self-reference that makes this entity a hierarchy, and the property named declaratively by
   * `hb_parentPropertyName="parentProductType"` on the component tag.
   *
   * OPTIONAL BY NECESSITY, NOT BY STYLE. `model/entity/ProductType.cfc:L163` ends
   * `removeParentProductType` with `structDelete(variables, "parentProductType")` — it REMOVES the
   * key rather than blanking it — and the faithful translation is `delete this.parentProductType`,
   * which the compiler permits only on an optional property. Under `exactOptionalPropertyTypes` the
   * field is therefore either present with a real `ProductType` or ABSENT; `undefined` is never
   * assigned to it anywhere in this file. Roots have no parent, which is the same absent state:
   * all three seeded rows carry `parentProductTypeID="NULL"`.
   *
   * ⚠️ `declare`, AND IT IS THE ONLY FIELD IN THIS CLASS THAT CARRIES IT. `declare` suppresses the
   * field DEFINITION while keeping the type, so a fresh instance does not carry this key at all —
   * absent, rather than present holding `undefined`. That matters here and nowhere else in this class
   * because this is the one ASSOCIATION field: `src/adapters/mysql/rowMappers.ts` hydrates scalar
   * columns only and leaves every many-to-one UNRESOLVED, and it states an absence-normalisation
   * invariant for exactly that state. Without `declare` a mapped `ProductType` would carry an own
   * `parentProductType` key holding `undefined`, breaking that invariant and diverging from the
   * sibling entities `Product`, `Sku` and `Brand`, which already `declare` their association fields.
   * The scalar columns above deliberately do NOT use it — see the G6 note in the class doc comment.
   */
  declare parentProductType?: ProductType;

  /*
   * ─── Related object properties (one-to-many) — `model/entity/ProductType.cfc:L65-L67` ─────────
   *
   * All three collections are initialised EAGERLY to `[]` in their declarations, so a bare
   * `new ProductType()` is immediately usable and every live-array contract below holds from the
   * first statement (S6). Recorded honestly: unlike `Brand`, whose legacy test overrides
   * `defaults_are_correct` to assert an empty `getProducts()`
   * [`meta/tests/unit/entity/BrandTest.cfc:L49-L61`], there is NO legacy `ProductTypeTest` and
   * therefore no traceable assertion behind this choice — it follows the folder convention rather
   * than an inherited expectation, and saying so is better than implying traceability that does not
   * exist.
   *
   * The three legacy mappings differ in ways that are recorded as fact and NOT modelled:
   * `childProductTypes` and `products` declare `cascade="all"`, `attributeValues` declares
   * `cascade="all-delete-orphan"`, and `products` UNIQUELY declares `lazy="extra"` — a Hibernate
   * collection-loading hint with no equivalent in an explicit row-mapper world. Cascade and fetch
   * strategy are hydration and persistence concerns owned by `src/adapters/mysql/rowMappers.ts` and
   * `src/adapters/mysql/UnitOfWork.ts`; reproducing them here would put persistence policy in the
   * domain layer.
   */

  /**
   * `property name="childProductTypes" singularname="childProductType" cfc="ProductType"
   * fieldtype="one-to-many" inverse="true" fkcolumn="parentProductTypeID" cascade="all";` [`:L65`]
   */
  childProductTypes: ProductType[] = [];

  /**
   * `property name="products" singularname="product" cfc="Product" fieldtype="one-to-many"
   * inverse="true" fkcolumn="productTypeID" lazy="extra" cascade="all";` [`:L66`]
   *
   * This is the one collection whose ARRAY REFERENCE is replaced rather than emptied in place, by
   * {@link ProductType.setProducts} — a legacy defect carried across verbatim; see that method.
   */
  products: Product[] = [];

  /**
   * `property name="attributeValues" singularname="attributeValue" cfc="AttributeValue"
   * fieldtype="one-to-many" fkcolumn="productTypeID" cascade="all-delete-orphan" inverse="true";`
   * [`:L67`]
   *
   * Typed against {@link ProductTypeAttributeValueOwner} — the narrow inverse-side capability — and
   * not against an invented `AttributeValue` entity, which AAP §0.2.2.1 places out of scope.
   */
  attributeValues: ProductTypeAttributeValueOwner[] = [];

  /*
   * ─── Related object properties (many-to-many, inverse) — `:L70-L77` ───────────────────────────
   *
   * Eight collections, five element types, no traversal — see the block comment above the reference
   * interfaces. They are declared because the legacy declares them and because omitting them would
   * make this class's data surface quietly narrower than the row it maps; they are typed opaquely
   * because nothing here reads more than an identifier from them.
   *
   * NONE OF THE EIGHT IS POPULATE-DISABLED. `hb_populateEnabled="false"` appears EXACTLY FOUR
   * TIMES on this entity — the audit block at `:L83-L86`, and nowhere in `:L70-L77`.
   * That is a real difference from `Brand.cfc`, which carries NINE such declarations (its four audit
   * properties at `:L77-L80` plus `promotionRewards` `:L66`, `promotionRewardExclusions` `:L67`,
   * `promotionQualifiers` `:L68`, `promotionQualifierExclusions` `:L69` and `physicals` `:L71`).
   * Brand's five extra exclusions belong to `Brand.ts` and must not be copied into this file.
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

  /** `:L77` — `type="array"`, `linktable="SwPhysicalProductType"`, `inversejoincolumn="physicalID"`. */
  physicals: PhysicalReference[] = [];

  /*
   * ─── Remote properties — `model/entity/ProductType.cfc:L80` ───────────────────────────────────
   */

  /**
   * `property name="remoteID" ormtype="string";` [`:L80`]
   *
   * The external-system correlation identifier. Recorded explicitly because it sits immediately
   * above the audit block and, unlike those four, does NOT carry `hb_populateEnabled="false"` — it
   * is populatable from request data, and its descriptor below reflects that.
   */
  remoteID?: string;

  /*
   * ─── Audit properties — `model/entity/ProductType.cfc:L83-L86` ────────────────────────────────
   *
   * All four declare `hb_populateEnabled="false"`, and all four are declared on THIS class's own
   * property surface rather than inherited: `AuditableEntity` is a structural contract and an
   * `implements` clause, never a base class (§0.3.3). Writing them is the exclusive privilege of
   * `applyPreInsertAudit` / `applyPreUpdateAudit`, invoked from the two hooks at the foot of this
   * class; nothing else in this file assigns them.
   *
   * TWO REPRESENTATIONS OF ABSENCE, DELIBERATELY NOT HARMONISED. The framework overrode exactly two
   * of the four getters — `getCreatedDateTime()` [`org/Hibachi/HibachiEntity.cfc:L291-L297`] and
   * `getModifiedDateTime()` [`:L299-L305`] — each returning the EMPTY STRING when the value is null,
   * and that empty string was observable to CFML callers. The two account getters have no override
   * anywhere in the repository, so their absence is genuine absence with no sentinel. The
   * `Date | ''` reads therefore live on `../base/AuditableEntity`'s accessors
   * (`getCreatedDateTime` / `getModifiedDateTime`), while the fields themselves are simply optional
   * here, exactly as that module establishes.
   *
   * The two account fields are typed `string` — the 32-character account identifier — because the
   * twenty-one `Account*` files are out of scope (AAP §0.2.2.1). No `Account` type is declared or
   * imported anywhere in this file.
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
   * ─── Derived state ────────────────────────────────────────────────────────────────────────────
   */

  /**
   * Whether this instance has never been persisted: exactly when {@link ProductType.productTypeID}
   * is the empty string, which is the legacy `unsavedvalue=""` [`:L52`].
   *
   * F21 — a PURE DERIVED PREDICATE with no stored flag. The legacy equivalent is
   * `getNewFlag()`/`isNew()` on the framework base, computed the same way from the primary
   * identifier, and this is the ONE framework-derived predicate this class reproduces because it is
   * doubly load-bearing:
   *
   *  1. `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67` asserts both `entity.isNew()`
   *     and `!len(entity.getPrimaryIDValue())` for a freshly constructed entity — base assertion 4.
   *  2. `model/entity/ProductType.cfc:L151` short-circuits on `isNew() or ...`, which is what makes
   *     the double-append behaviour documented on {@link ProductType.setParentProductType} possible.
   *
   * The companion `getPrimaryIDValue()` is NOT declared (F22); a caller needing the raw value reads
   * {@link ProductType.productTypeID} directly, which is the same slot the framework member read.
   */
  isNew(): boolean {
    return this.productTypeID === '';
  }

  /*
   * ─── Collection accessors — the F2 live-array contract ────────────────────────────────────────
   */

  /**
   * The LIVE `childProductTypes` array, BY REFERENCE.
   *
   * F2 — NEVER RETURN A COPY FROM THIS METHOD. No `.slice()`, no spread, no `ReadonlyArray`, no
   * defensive clone. Three legacy call sites MUTATE the value this method returns:
   * `model/entity/ProductType.cfc:L152` appends into it, and `:L159`/`:L161` find-then-splice it. A
   * defensive copy would not fail to compile and would not fail a naive test — it would silently
   * turn {@link ProductType.setParentProductType}'s append and
   * {@link ProductType.removeParentProductType}'s removal into NO-OPS, leaving the hierarchy's
   * reverse side permanently empty. This is the single easiest way to break the hierarchy from
   * inside this file.
   *
   * Declared under Rule 2's second clause: the legacy has no hand-written body for it — Hibachi
   * synthesizes `get<Property>()` from the ORM metadata (IR-1) — but it has in-scope call sites, so
   * it becomes an explicit, typed member.
   */
  getChildProductTypes(): ProductType[] {
    return this.childProductTypes;
  }

  /**
   * Whether `childProductType` is already a member of this product type's child collection.
   *
   * IR-1 — synthesized by Hibachi's `has<Property>` prefix dispatch
   * [`org/Hibachi/HibachiService.cfc:L255-L281` is the service-side analogue; the entity-side
   * synthesis is the same mechanism] and therefore declared explicitly here, because
   * `model/entity/ProductType.cfc:L151` calls it and TypeScript has no equivalent facility (IR-1).
   *
   * IDENTITY MEMBERSHIP, matching the legacy exactly: the CFML `arrayFind(collection, entity)` form
   * used throughout this entity compares object references, so `Array.prototype.includes` — which
   * uses SameValueZero, i.e. reference identity for objects — is the faithful translation. No
   * identifier-based comparison is substituted: two distinct in-memory instances sharing a
   * `productTypeID` are NOT the same member to the legacy, and making them equal here would change
   * behaviour.
   */
  hasChildProductType(childProductType: ProductType): boolean {
    return this.childProductTypes.includes(childProductType);
  }

  /**
   * The LIVE `products` array, BY REFERENCE — the same F2 contract as
   * {@link ProductType.getChildProductTypes}, and for a concrete in-scope reason:
   * `model/service/ProductService.cfc:L306-L307` reads
   * `productType.getParentProductType().getProducts()` and hands the result straight into
   * {@link ProductType.setProducts}, so this method feeds the one code path in the slice that
   * re-parents a product collection.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /*
   * ─── Overridden implicit getters ──────────────────────────────────────────────────────────────
   *
   * The legacy section header is `// ============== START: Overridden Implicet Getters
   * ===================` [`model/entity/ProductType.cfc:L248`] — the misspelling of "Implicit" is
   * the legacy's, quoted here as found rather than corrected, since the point of quoting it is
   * traceability.
   */

  /**
   * The comma-delimited, ROOT-FIRST identifier path from the root of the hierarchy down to and
   * including this product type — built on first read and then reused.
   *
   * Ports `model/entity/ProductType.cfc:L250-L255` verbatim in structure:
   *
   * ```cfml
   * public string function getProductTypeIDPath() {
   *     if(isNull(variables.productTypeIDPath)) {
   *         variables.productTypeIDPath = buildIDPathList( "parentProductType" );
   *     }
   *     return variables.productTypeIDPath;
   * }
   * ```
   *
   * Rule 3 — THE BACKING FIELD AND THIS GETTER BOTH EXIST, and that is faithful rather than
   * redundant: the legacy keeps the persistent property `productTypeIDPath` [`:L53`] AND overrides
   * its implicit getter, and the override carries real behaviour (the lazy build) that a bare field
   * read cannot express.
   *
   * S8 / M7 — THE MEMOIZATION SLOT IS THE INSTANCE FIELD ITSELF, EXACTLY AS IN THE LEGACY, where
   * `variables.productTypeIDPath` is simultaneously the ORM property and the cache. So no separate
   * cache is introduced, and — the part that matters for the target execution model — the memo is
   * PER INSTANCE and can NEVER be module-scope. Module-scope state survives on a warm Lambda
   * container across invocations and would bleed one request's hierarchy into another's; that is the
   * class of mismatch AAP §0.6.6 requires be flagged rather than absorbed. `Sw*` second-level
   * caching (`cacheuse="transactional"`) is likewise not reproduced anywhere in this file.
   *
   * Written with a local rather than by re-reading the field after assignment so the returned value
   * is provably the built one; the legacy re-read is behaviourally identical.
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
   * ─── The base product type — the three-way branch key of SkuService.createSkus ────────────────
   */

  /**
   * This product type's INHERITED base product type code: its own `systemCode` when it has one, and
   * otherwise the `systemCode` of the ROOT of its hierarchy.
   *
   * Ports `model/entity/ProductType.cfc:L109-L115`, preceded there by the legacy comment
   * `//get merchandisetype ` — quoted here with its lowercase spelling and its trailing space
   * intact, because the point of quoting a legacy comment is traceability, not tidiness:
   *
   * ```cfml
   * //get merchandisetype
   * public any function getBaseProductType() {
   *     if(isNull(getSystemCode()) || getSystemCode() == ""){
   *         return getService("ProductService").getProductType(listFirst(getProductTypeIDPath())).getSystemCode();
   *     }
   *     return getSystemCode();
   * }
   * ```
   *
   * THE TWO-HALF GUARD IS REPRODUCED EXACTLY. The legacy tests `isNull(...)` **OR** `== ""`, so an
   * absent code and a present-but-empty code both fall through to root resolution. Under
   * `exactOptionalPropertyTypes` those are two genuinely different states, so both must be tested;
   * checking only for absence would make an empty-string `systemCode` short-circuit and return `''`,
   * which no legacy path can produce.
   *
   * THE ROOT IS THE FIRST ELEMENT OF THE ID PATH, and that is only true because
   * `buildIDPathList` PREPENDS. See {@link buildProductTypeIDPathList}: reverse the ordering there
   * and this method silently starts returning a LEAF's code — or nothing — with no error anywhere.
   *
   * G6 — WHY THIS TAKES A PARAMETER THE LEGACY DID NOT HAVE. `getService("ProductService")` cannot
   * survive (R2/S3: no service locator, no string-keyed runtime resolution — note in passing that
   * the legacy spells it with a capital `P` here while other in-scope call sites spell it
   * `getService("productService")`, which only works because CFML component lookup is
   * case-insensitive), and S4 forbids a `domain/` → `services/` import outright. The capability
   * therefore arrives as an explicit constructor-free parameter typed by
   * {@link ProductTypeRootResolver}, whose name is deliberately unlike `ProductService` so the two
   * can never be conflated. This widens the legacy zero-argument signature — recorded as a
   * deliberate departure from TR-1's arity preservation, sanctioned by AAP §0.4.1.4 for exactly this
   * member, and made in the direction that keeps the dependency explicit rather than hidden.
   *
   * G6 / M5 / M7 — WHY THIS IS `async` WHEN THE LEGACY IS SYNCHRONOUS. The legacy is synchronous
   * only because Hibernate resolves the association eagerly inside a request-scoped ORM session, so
   * the "lookup" is a hydrated-graph read. There is no session in a stateless Lambda invocation, so
   * the root read is a repository round trip and the method returns a `Promise`. This is precisely
   * the class of execution-model difference AAP §0.6.6 requires be FLAGGED rather than papered over,
   * and it is flagged here rather than hidden behind a synchronous facade over blocking I/O.
   *
   * THE RETURN TYPE ADMITS UNRECOGNISED CODES ON PURPOSE — see {@link BaseProductTypeCode} for
   * the full reasoning. Narrowing it to the three seeded codes would statically delete the
   * `model/service/SkuService.cfc:L204` fallthrough.
   *
   * WHY `undefined` RATHER THAN A THROW WHEN THE ROOT CANNOT BE RESOLVED. The legacy chains
   * `.getSystemCode()` straight onto the lookup result [`:L112`], so a missing root raises a CFML
   * engine null-reference error there — and that IS reachable: a brand-new root product type has an
   * empty `productTypeIDPath`, so the lookup identifier is empty. The port cannot reproduce a CFML
   * engine error, must not invent a domain error message (S9), and cannot reach
   * `src/errors/DomainError.ts` because S4 closes this file's import list to its three dependency
   * modules. So the condition is surfaced as `undefined` — which is ALSO what the legacy returns
   * when the root resolves but carries a null `systemCode`, since CFML returns null from that
   * getter. `TODO(parity)`: the legacy distinguishes those two cases by raising on the first; this
   * port converges them on `undefined`. The failure stays loud at the same place it was loud before,
   * because `undefined` matches none of the three branch keys and
   * `model/service/SkuService.cfc:L204` throws — so no caller silently succeeds where the legacy
   * failed.
   *
   * `resolveBaseProductType` from `../BaseProductType` is deliberately NOT called here; recognition
   * belongs to the consumer, and each consumer treats an unrecognised code differently. See
   * {@link BaseProductTypeCode}. Note that recognition is CASE-INSENSITIVE there, matching CFML `==`,
   * so the raw casing this method returns is exactly what the consumers must be given.
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

    // `listFirst(getProductTypeIDPath())` [`:L112`] — the ROOT identifier, first because
    // `buildIDPathList` prepends.
    const rootProductTypeID = listFirstIdentifier(this.getProductTypeIDPath());
    const rootProductType = await rootProductTypeResolver.getProductType(rootProductTypeID);
    if (rootProductType === undefined) {
      return undefined;
    }
    return rootProductType.systemCode;
  }

  /*
   * ─── Overridden framework members (the single sanctioned F22 exception) ────────────────────────
   */

  /**
   * The human-readable representation of this product type: the full ancestry chain, root-most segment
   * first, joined by the HTML right-guillemet entity. Ports
   * [model/entity/ProductType.cfc:L273-L278] verbatim in structure:
   *
   * ```cfml
   * public string function getSimpleRepresentation() {
   *     if(!isNull(getParentProductType())) {
   *         return getParentProductType().getSimpleRepresentation() & " &raquo; " & getProductTypeName();
   *     }
   *     return getProductTypeName();
   * }
   * ```
   *
   * THE ONE MEMBER F22 SANCTIONS ON THIS CLASS, because it is a genuine override with a genuine
   * recursive body rather than framework plumbing. It is also what makes base assertion 2 of
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L59] satisfiable against THIS class rather
   * than against the validation layer.
   *
   * THE SEPARATOR IS BYTE-EXACT: `' &raquo; '` — the HTML ENTITY, with exactly one leading and one
   * trailing space. It is observable output, reaching the Google feed's `g:product_type` element
   * through [integrationServices/google/views/feed/product.cfm]. Do not substitute the literal `»` or
   * `&#187;`, do not collapse or trim the spaces, and do not switch to a `join()` over a collected
   * segment array with a different separator. Any of those changes bytes on the wire.
   *
   * TODO(parity) [model/entity/ProductType.cfc:L274-L276] — NO CYCLE GUARD. Like
   * {@link buildProductTypeIDPathList}, the legacy recursion keeps no visited set and no depth limit,
   * so a cyclic `parentProductType` chain recurses until the stack is exhausted. AAP §0.8.2
   * Guideline 4 forbids adding a guard: a bounded result where the legacy failed is a behaviour
   * difference invisible to a reader comparing outputs.
   *
   * Not `async`, deliberately: no I/O and no collaborator, purely the in-memory parent chain — the one
   * respect in which this member differs from {@link ProductType.getBaseProductType}, which walks the
   * same hierarchy but must cross a repository boundary to do it.
   *
   * ABSENCE IS EXPLICIT, NOT DEFAULTED (S9). `productTypeName` is nullable [:L57] and the legacy `&`
   * concatenation raises on a null operand, so a missing name is an ERROR STATE in the legacy rather
   * than the empty string. No default is invented and no non-null assertion is used; the absence is
   * returned as `undefined` so a caller sees the unset state instead of a fabricated label. The same
   * applies transitively to an ancestor with no name, which is why the parent's representation is
   * checked before it is concatenated.
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
   * ─── Boundary-stubbed members (TR-5 — declared, never quietly dropped) ─────────────────────────
   */

  /**
   * The attribute-set assignments this product type inherits — as the legacy actually behaves, which
   * is NOT what the member name promises.
   *
   * Ports `model/entity/ProductType.cfc:L92-L99`:
   *
   * ```cfml
   * public array function getInheritedAttributeSetAssignments(){
   *     … the :L93 TODO comment, carried verbatim as a live annotation below rather than duplicated
   *       inside this quotation, so the exact legacy string occurs exactly ONCE in this file …
   *     var attributeSetAssignments = getService("AttributeService").getAttributeSetAssignmentSmartList().getRecords();
   *     if(!arrayLen(attributeSetAssignments)){
   *         attributeSetAssignments = [];
   *     }
   *     return attributeSetAssignments;
   * }
   * ```
   *
   * DEFECT D21 — AAP §0.6.7.1. THE LEGACY RETURNS **EVERY** ATTRIBUTE-SET ASSIGNMENT IN THE
   * SYSTEM, COMPLETELY UNFILTERED. It never filters by this product type, never walks the parent
   * chain, and never consults `productTypeIDPath` — the word "Inherited" in the member name describes
   * an intention, not the implementation. That is exactly what the carried TODO admits. D21 is one of
   * only THREE literal source TODOs in the entire in-scope slice, and G4 forbids implementing the
   * filtering the TODO wishes for: doing so would change results with no test to catch it and would
   * make this port incomparable to the legacy.
   */
  // Todo get by all the parent productTypeIDs
  /*
   * `TODO(parity)` — the line above is `model/entity/ProductType.cfc:L93` VERBATIM: capital `T`,
   * lowercase `odo`, no colon. It is reproduced exactly, once, and left in place of the filtering it
   * asks for. Locator: `model/entity/ProductType.cfc:L92-L99`; AAP §0.6.7.1 defect **D21**.
   *
   * ADDITIONAL D21 PROVENANCE FOUND WHILE PORTING, recorded against the existing defect ID because
   * this finding is provenance for D21 rather than a distinct behaviour, and AAP §0.6.7 catalogues
   * D1–D21 (the live bound is stated only at `src/ports/repositories/SkuRepository.ts`): this member has ZERO callers
   * anywhere in the repository, and the `AttributeSetAssignment` entity it claims to return EXISTS
   * NOWHERE in release 3.1.39 — the string occurs only at `:L92` and `:L94` of this one file. So
   * the legacy member could never have executed successfully even once. That strengthens the case
   * for
   * preserving it verbatim rather than repairing it: there is no observed behaviour to regress
   * against, and inventing one would be fabrication (S9).
   *
   * `TODO(boundary)` — the collaborator is out of scope twice over: `attributeService` belongs to the
   * excluded `model/**\/Attribute*.cfc` family (6 files, AAP §0.2.2.1), and
   * `getAttributeSetAssignmentSmartList()` is a SmartList member, which F9 keeps out of the domain
   * layer entirely. The rightful owners are the attribute-domain service and
   * `src/ports/SmartListQueryPort.ts` via `src/adapters/mysql/SmartListQueryBuilder.ts`; the
   * capability arrives here as an explicit optional parameter typed by
   * {@link InheritedAttributeSetAssignmentSource} instead (TR-5: the member is declared and
   * implemented against a port, never dropped from the interface).
   *
   * THE LEGACY EMPTY-CASE NORMALISATION IS A NO-OP, recorded as an observation:
   * `getRecords()` already returns an array, so reassigning `[]` when its length is zero changes
   * nothing. The resulting behaviour — an empty array when there is nothing to return — is what this
   * port produces, both when the source yields no records and when no source is supplied at all.
   *
   * `readonly` on the return type, not a copy: the legacy hands back the SmartList's own records
   * array by reference, so cloning it here would introduce a divergence that no legacy behaviour
   * calls for. `readonly` is erased at emit and costs nothing at runtime.
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
   * ─── Overridden collection setter — `model/entity/ProductType.cfc:L101-L107` ───────────────────
   */

  /**
   * Replace this product type's product collection wholesale, re-pointing every supplied product at
   * this product type.
   *
   * Ports `model/entity/ProductType.cfc:L101-L107`:
   *
   * ```cfml
   * public void function setProducts(required array Products) {
   *     // first, clear existing collection
   *     variables.Products = [];
   *     for( var product in arguments.Products ) {
   *         addProduct(product);
   *     }
   * }
   * ```
   *
   * IT HAS A LIVE IN-SCOPE CALLER, which is why it is ported rather than treated as unused surface:
   * `model/service/ProductService.cfc:L306-L307` calls
   * `productType.setProducts( productType.getParentProductType().getProducts() )`, adopting the
   * parent's products onto the child product type. That call site is also the evidence for what
   * {@link ProductType.addProduct} must do — see the note there.
   *
   * `TODO(parity)` — THIS OVERRIDE REPLACES THE ARRAY REFERENCE INSTEAD OF EMPTYING IT IN PLACE.
   * `model/entity/ProductType.cfc:L103` assigns a brand-new array, so any holder of the previous
   * array — including anything that obtained it from {@link ProductType.getProducts} — keeps a STALE
   * reference and will never see the reset. That breaks the F2 live-array contract INSIDE THE LEGACY
   * CODE ITSELF, and it is reproduced exactly: `this.products = []`, not a length truncation and not
   * a `splice(0)`. G4 forbids the repair. Locator: `model/entity/ProductType.cfc:L103`.
   *
   * G6 — THE CAPITAL-`P` CASING QUIRK. The legacy parameter [`:L101`] and the legacy assignment
   * target [`:L103`] are both spelled `Products`, while the declared ORM property [`:L66`] is
   * `products`. CFML's `arguments` and `variables` scopes are case-insensitive, so the mismatch is
   * invisible there; TypeScript is case-sensitive, and had the same spelling been copied across, the
   * assignment would have created a SECOND, unrelated property and left `products` untouched. The
   * declared lowercase name is therefore used for both the field and the parameter, and the legacy
   * inconsistency is recorded here rather than transcribed. (Same class of quirk as
   * `model/entity/Brand.cfc:L102` and as `:L167-L172` of this file — see
   * {@link ProductType.addChildProductType}.)
   *
   * THE RESET IS THE ONLY DIRECT WRITE TO THE COLLECTION. Nothing after it appends to
   * `this.products`; every element travels through {@link ProductType.addProduct}, exactly as the
   * legacy loop does, and the legacy labelled that reset step with an inline comment at [:L102].
   */
  setProducts(products: readonly Product[]): void {
    this.products = [];
    for (const product of products) {
      this.addProduct(product);
    }
  }

  /*
   * ─── Bidirectional helper methods — `model/entity/ProductType.cfc:L146-L246` ───────────────────
   *
   * The legacy section is fenced by `// ============= START: Bidirectional Helper Methods
   * ===================` [`:L146`] and its matching `END` banner [`:L246`], and contains twenty-two
   * members across ten relationships. FOUR are ported here (the parent/child pair at `:L149-L172`
   * and the attribute-value pair at `:L231-L236`), plus the IR-1 synthesized `addProduct` the
   * overridden setter above requires; the remaining sixteen are enumerated with their reasons in the
   * NOT-PORTED block at the foot of this module.
   */

  /**
   * Attach `product` to this product type — legacy sub-comment `// Products (one-to-many)` by
   * position, invoked from `model/entity/ProductType.cfc:L105`.
   *
   * IR-1 — THERE IS NO DECLARATION FOR THIS MEMBER ANYWHERE IN `ProductType.cfc`. It is fabricated at
   * runtime from the ORM metadata by the framework's `add<singularName>` synthesis
   * (`singularname="product"` at `:L66`), which is why {@link ProductType.setProducts} can call it on
   * `:L105` without it appearing in any source file. TypeScript under `strict` has no equivalent
   * facility, so the member is declared explicitly — and it MUST be, or the setter above could not
   * compile. This is the mechanism AAP §0.4.2.5 catalogues for the service layer, applied here on the
   * entity side.
   *
   * G6 — WHAT THE SYNTHESIZED ADDER DOES, AND THE EVIDENCE FOR IT. It sets the INVERSE side: the
   * product's own `productType` reference. Three facts support that reading and are recorded because
   * the CFML runtime is not reproducible here (AAP §0.8.4.1), so this is a documented judgment call
   * rather than an observed behaviour:
   *
   *  1. `products` is mapped `inverse="true"` [`:L66`], so the child's foreign key is the ONLY side
   *     Hibernate persists. If the adder merely appended to this entity's in-memory array,
   *     `model/service/ProductService.cfc:L306-L307` would write nothing to the database and the
   *     whole call would be pointless.
   *  2. Slatwall's own hand-written convention for one-to-many in this very file works the same way:
   *     `addchildProductType` [`:L167-L169`] delegates to the CHILD's parent-side setter rather than
   *     touching its own collection.
   *  3. `model/entity/Product.cfc:L69` declares `productType` as a plain many-to-one with NO
   *     hand-written `setProductType` (the only hand-written setter on that entity is `setBrand` at
   *     `:L662`), so the legacy delegation lands on the CFML-generated simple assignment — which
   *     under Rule 1 of this folder IS a direct field write, since generated accessor pairs are not
   *     reproduced.
   *
   * A CONSEQUENCE WORTH STATING PLAINLY: because the adder writes the child's reference and not this
   * entity's array, `setProducts` leaves `this.products` EMPTY. That mirrors the legacy, where an
   * `inverse="true"` collection is refreshed from the database rather than maintained in memory —
   * hydration is owned by `src/adapters/mysql/rowMappers.ts`. No compensating in-memory append is
   * invented here (S9).
   */
  addProduct(product: Product): void {
    product.productType = this;
  }

  /**
   * Attach this product type to `parentProductType`, and register it on the parent's child
   * collection.
   *
   * Ports `model/entity/ProductType.cfc:L149-L154` — legacy sub-comment
   * `// Parent Product Type (many-to-one)` [`:L148`]:
   *
   * ```cfml
   * public void function setParentProductType(required any parentProductType) {
   *     variables.parentProductType = arguments.parentProductType;
   *     if(isNew() or !arguments.parentProductType.hasChildProductType( this )) {
   *         arrayAppend(arguments.parentProductType.getChildProductTypes(), this);
   *     }
   * }
   * ```
   *
   * ASSIGN FIRST [`:L150`], THEN CONDITIONALLY APPEND [`:L151-L153`] — the order is preserved because
   * the guard's second operand calls back into the parent, and reordering would change what that call
   * observes.
   *
   * `TODO(parity)` — THE GUARD IS A SHORT-CIRCUIT AND THE SHORT-CIRCUIT IS THE BEHAVIOUR. When
   * this entity `isNew()`, CFML's `or` never evaluates `hasChildProductType`, so the append happens
   * UNCONDITIONALLY; only for a persisted entity is membership actually tested. The consequence is
   * that calling this method twice on a NEW entity appends it to the parent's collection TWICE.
   * TypeScript's `||` short-circuits identically, so the legacy behaviour is preserved verbatim — and
   * the membership test must NOT be hoisted out of the `||` "for clarity", because hoisting it is
   * precisely the fix G4 forbids. Locator: `model/entity/ProductType.cfc:L151`.
   *
   * THE APPEND TARGETS THE PARENT'S LIVE ARRAY [`:L152`], obtained through
   * {@link ProductType.getChildProductTypes}. If that getter ever returned a copy, this append would
   * become a silent no-op — see the warning on the getter itself.
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
   * Ports `model/entity/ProductType.cfc:L155-L164`:
   *
   * ```cfml
   * public void function removeParentProductType(any parentProductType) {
   *     if(!structKeyExists(arguments, "parentProductType")) {
   *         arguments.parentProductType = variables.parentProductType;
   *     }
   *     var index = arrayFind(arguments.parentProductType.getChildProductTypes(), this);
   *     if(index > 0) {
   *         arrayDeleteAt(arguments.parentProductType.getChildProductTypes(), index);
   *     }
   *     structDelete(variables, "parentProductType");
   * }
   * ```
   *
   * THE ARGUMENT IS OPTIONAL — declared `any parentProductType` with NO `required` [`:L155`] — and
   * `:L156-L158` defaults it from this entity's own reference. Both halves are reproduced: the
   * parameter is optional and the default is read from the field.
   *
   * `TODO(parity)` — CFML 1-BASED INDEX ARITHMETIC, TRANSLATED BY SEMANTICS AND NOT BY LITERAL.
   * `arrayFind` returns **0** when the element is absent and a 1-based position otherwise, which is
   * why the legacy guard reads `if(index > 0)`. `Array.prototype.indexOf` returns **-1** when absent
   * and a 0-based position otherwise, so the guard becomes `!== -1`. Copying `> 0` across would have
   * been catastrophic in both directions: it would skip a genuine removal at position 0 and treat the
   * not-found sentinel `-1` as merely "not positive" — and with `splice(-1, 1)` it would have deleted
   * the LAST element instead. Locator: `model/entity/ProductType.cfc:L159-L161`.
   *
   * `TODO(parity)` — THE LOCAL LINK IS SEVERED UNCONDITIONALLY. `structDelete` at `:L163` sits
   * OUTSIDE the `if(index > 0)` block and runs even when the supplied parent was never this entity's
   * parent, so the reference is always dropped whether or not the reverse-side removal happened. That
   * asymmetry is preserved exactly, and it is the reason
   * {@link ProductType.parentProductType} MUST be an optional property: the faithful translation of
   * `structDelete(variables, "parentProductType")` is `delete this.parentProductType`, which the
   * compiler permits only on an optional member. `undefined` is never assigned in its place — under
   * `exactOptionalPropertyTypes` that would be a different state, and `../base/populate` distinguishes
   * them the same way.
   *
   * ONE DOCUMENTED DIVERGENCE, made explicit rather than hidden: when the argument is omitted AND
   * this entity has no parent, the legacy dereferences a null at `:L159` and raises a CFML engine
   * error. The port cannot reproduce a CFML engine error and may not invent a domain error message
   * (S9), so it skips the reverse-side removal — there is nothing to remove from — and still performs
   * the unconditional delete, leaving the observable local state identical to the success path.
   */
  removeParentProductType(parentProductType?: ProductType): void {
    // Legacy `if(!structKeyExists(arguments, "parentProductType"))` [`:L156-L158`]: default the
    // target from this entity's own reference when the caller supplied none.
    const targetParentProductType = parentProductType ?? this.parentProductType;

    if (targetParentProductType !== undefined) {
      const childProductTypes = targetParentProductType.getChildProductTypes();
      const index = childProductTypes.indexOf(this);
      // `arrayFind` 0-when-absent / 1-based  ->  `indexOf` -1-when-absent / 0-based [`:L159-L161`].
      if (index !== -1) {
        childProductTypes.splice(index, 1);
      }
    }

    // `structDelete(variables, "parentProductType")` [`:L163`] — UNCONDITIONAL, outside the guard.
    delete this.parentProductType;
  }

  /**
   * Adopt `childProductType` as a child of this product type, by delegating to the child's parent
   * setter.
   *
   * Ports `model/entity/ProductType.cfc:L167-L169` — legacy sub-comment
   * `// Child Product Types (one-to-many)` [`:L166`]. A PURE DELEGATION: this entity never mutates
   * `childProductTypes` here; the append happens inside
   * {@link ProductType.setParentProductType}, which is also where the short-circuit guard lives.
   *
   * G6 — A DELIBERATE, RECORDED RENAME. The legacy method is spelled `addchildProductType` with a
   * LOWERCASE `c` [`:L167`], while its parameter is `ChildProductType` with a CAPITAL `C` and the
   * declared ORM property and its `singularname` are `childProductTypes` / `childProductType`
   * [`:L65`] — three spellings of one name, harmless only because CFML is case-insensitive
   * throughout. Conventional camelCase is used here for both the method and the parameter. Nothing in
   * scope calls these members by the legacy spelling, §0.8.1 explicitly
   * licenses idiomatic TypeScript while forbidding behaviour change, and the delegation behaviour is
   * untouched — so this is a naming decision recorded in the open, not a silent divergence.
   */
  addChildProductType(childProductType: ProductType): void {
    childProductType.setParentProductType(this);
  }

  /**
   * Release `childProductType` from this product type, by delegating to the child's parent remover.
   *
   * Ports `model/entity/ProductType.cfc:L170-L172`. Renamed from the legacy lowercase-`c`
   * `removechildProductType` on exactly the grounds recorded on
   * {@link ProductType.addChildProductType}. Note that the delegation passes `this` explicitly, so
   * the optional-argument defaulting inside
   * {@link ProductType.removeParentProductType} is never exercised on this path.
   */
  removeChildProductType(childProductType: ProductType): void {
    childProductType.removeParentProductType(this);
  }

  /**
   * Attach `attributeValue` to this product type, by delegating to its inverse-side setter.
   *
   * Ports `model/entity/ProductType.cfc:L231-L233` — legacy sub-comment
   * `// Attribute Values (one-to-many)` [`:L230`]:
   *
   * ```cfml
   * public void function addAttributeValue(required any attributeValue) {
   *     arguments.attributeValue.setProductType( this );
   * }
   * ```
   *
   * `TODO(boundary)` — TR-5, DECLARED RATHER THAN QUIETLY DROPPED. `AttributeValue` belongs to the
   * excluded `model/**\/Attribute*.cfc` family (6 files, AAP §0.2.2.1), so the parameter is typed
   * against the narrow local capability {@link ProductTypeAttributeValueOwner} instead of an invented
   * entity — exactly the treatment `Brand.ts` gives its own `model/entity/Brand.cfc:L90-L95` pair.
   * The rightful owner of the real type is the attribute domain, which this slice does not convert.
   *
   * A DELIBERATE NON-DECLARATION, recorded because its absence is easy to mistake for an omission:
   * the legacy inverse-side implementation `model/entity/AttributeValue.cfc:L257-L272` calls back
   * into `productType.hasAttributeValue(this)` and `productType.getAttributeValues()`. Both are
   * IR-1 synthesized members — and both have ONLY out-of-scope call sites, so Rule 2's second clause
   * does not admit them and they are NOT declared on this class. Compare
   * {@link ProductType.hasChildProductType}, which is admitted precisely because `:L151` of this file
   * calls it.
   */
  addAttributeValue(attributeValue: ProductTypeAttributeValueOwner): void {
    attributeValue.setProductType(this);
  }

  /**
   * Detach `attributeValue` from this product type, by delegating to its inverse-side remover.
   *
   * Ports `model/entity/ProductType.cfc:L234-L236`. `this` is passed explicitly, matching the legacy
   * `arguments.attributeValue.removeProductType( this )`; the optional parameter on
   * {@link ProductTypeAttributeValueOwner.removeProductType} exists because the legacy remover it
   * models declares its own argument optional, mirroring
   * {@link ProductType.removeParentProductType}.
   */
  removeAttributeValue(attributeValue: ProductTypeAttributeValueOwner): void {
    attributeValue.removeProductType(this);
  }

  /*
   * ─── ORM event hooks — `model/entity/ProductType.cfc:L305-L313` ────────────────────────────────
   *
   * `TODO(boundary)` — IN THE LEGACY THESE FIRE THEMSELVES; HERE THEY MUST BE CALLED. Hibernate
   * invokes `preInsert`/`preUpdate` automatically as part of the flush that the framework triggers at
   * request end [`org/Hibachi/Hibachi.cfc` performs a double `ormFlush()` when the ORM has no errors,
   * with `flushAtRequestEnd=false`]. A stateless Lambda invocation has NO ORM session, NO automatic
   * flush and NO request-end hook (M5), so `src/adapters/mysql/UnitOfWork.ts` MUST call these two
   * methods explicitly at its transaction boundary — immediately before the corresponding INSERT and
   * UPDATE. If it does not, `productTypeIDPath` is never refreshed and the audit block is never
   * stamped, and NOTHING WILL FAIL LOUDLY: the row simply persists with a stale path and empty audit
   * columns. That is why the requirement is recorded here, on the members themselves, and not only in
   * the plan.
   *
   * BOTH RECOMPUTE THE PATH UNCONDITIONALLY, and that is deliberately NOT the lazy getter: `:L306`
   * and `:L311` call `buildIDPathList(...)` directly and assign the result, OVERWRITING any value the
   * lazy read had already memoized. A forced refresh is the whole point — a product type that has
   * been re-parented since its path was first computed would otherwise persist the old ancestry — so
   * these hooks must not be "optimised" into a call to
   * {@link ProductType.getProductTypeIDPath}, which would return the stale memo.
   *
   * AUDIT STAMPING IS DELEGATED, NOT REIMPLEMENTED. The legacy `super.preInsert()` / `super.preUpdate()`
   * calls reach the framework's audit block [`org/Hibachi/HibachiEntity.cfc:L598-L649` and
   * `:L657-L681`]; the port delegates to the free functions `applyPreInsertAudit` /
   * `applyPreUpdateAudit` exported by `../base/AuditableEntity` (§0.3.3 — composition over
   * inheritance, so there is no `super` to call and no base class to extend).
   */

  /**
   * Pre-insert hook — ports `model/entity/ProductType.cfc:L305-L308`:
   *
   * ```cfml
   * public void function preInsert(){
   *     setProductTypeIDPath( buildIDPathList( "parentProductType" ) );
   *     super.preInsert();
   * }
   * ```
   *
   * ORDER IS PRESERVED: the path is rebuilt FIRST, then the audit block is stamped. The legacy
   * `setProductTypeIDPath(...)` call is a field assignment here, per Rule 1.
   *
   * @param auditActor - The resolved current-account context, or omitted when there is none. The
   *   legacy hook took no arguments and read the actor from `getHibachiScope().getAccount()`
   *   [`org/Hibachi/HibachiObject.cfc:L74-L76`]; S3 forbids that request-scoped lookup, so the actor
   *   arrives explicitly — the same substitution `../base/AuditableEntity` makes, and the reason its
   *   `AccountReference` shape is reused here through {@link AuditActor} rather than re-declared.
   */
  preInsert(auditActor?: AuditActor): void {
    // `setProductTypeIDPath( buildIDPathList( "parentProductType" ) )` [`:L306`] — forced refresh.
    this.productTypeIDPath = buildProductTypeIDPathList(this);
    // `super.preInsert()` [`:L307`] — the framework audit block, by delegation.
    applyPreInsertAudit(this, auditActor);
  }

  /**
   * Pre-update hook — ports [model/entity/ProductType.cfc:L310-L313], which refreshes the identifier
   * path and then delegates to the framework audit block.
   *
   * S7 — THE `;;` AT [model/entity/ProductType.cfc:L311] IS RECORDED, NOT REPRODUCED. That line
   * genuinely ends `);;`: an extra empty statement, harmless in CFML and with no runtime effect. The
   * TypeScript below emits one statement. Recording the difference keeps the two files reconcilable
   * without emitting an empty statement the linter would flag.
   *
   * @param oldData - The pre-modification snapshot Hibernate handed the hook. Kept in the FIRST
   *   parameter position for signature fidelity with the legacy `struct oldData`, and typed as a
   *   record of unknown values rather than `any` (S1). It is deliberately NOT forwarded: the legacy
   *   passed it on through `argumentcollection=arguments`, but the audit block that receives it reads
   *   it nowhere [org/Hibachi/HibachiEntity.cfc:L657-L681], because the fields written depend only on
   *   the clock and the actor.
   * @param auditActor - As on {@link ProductType.preInsert}.
   */
  preUpdate(oldData?: Record<string, unknown>, auditActor?: AuditActor): void {
    // `setProductTypeIDPath( buildIDPathList( "parentProductType" ) );;` [`:L311`] — forced refresh.
    this.productTypeIDPath = buildProductTypeIDPathList(this);
    // `super.preUpdate(argumentcollection=arguments)` [`:L312`] — the framework audit block.
    applyPreUpdateAudit(this, auditActor);
  }

  /* ============================================================================================
   * THE MANAGED-ENTITY CONTRACT — DELIBERATELY *NOT* DECLARED ON THIS CLASS (F22)
   * ============================================================================================
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain — `getClassName`, `getEntityName`, `getPrimaryIDPropertyName`,
   * `getPrimaryIDValue`, `hasProperty`, `getPropertyMetaData` and `getValueByPropertyIdentifier`.
   * `src/validation/Validator.ts` and `src/ports/UniquePropertyPort.ts` both require them BY NAME:
   * `ValidationSubject` reads `getClassName` and `hasProperty`, and `UniquePropertyEntity` reads
   * `getEntityName`, `getPrimaryIDValue`, `getPrimaryIDPropertyName`, `getPropertyMetaData` and
   * `getValueByPropertyIdentifier` in exactly the order [org/Hibachi/HibachiDAO.cfc:L134-L138]
   * reads them.
   *
   * ⛔ AND NONE OF THE SEVEN IS A METHOD OF THIS CLASS. This module's own negative mandate names
   * `getPrimaryIDPropertyName`, `getPrimaryIDValue` and `getPropertyMetaData` among the framework
   * members that must not be declared here, and admits EXACTLY ONE exception —
   * {@link ProductType.getSimpleRepresentation}, which is sanctioned because
   * [model/entity/ProductType.cfc:L273-L278] genuinely overrides it with a real recursive body. The
   * other six are framework members of the same family and are excluded on the same ground.
   *
   * ✅ THEY ARE SUPPLIED BY COMPOSITION, WHICH IS WHY EXCLUDING THEM COSTS NOTHING.
   * `manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA)` — `manageEntity` from
   * `../base/populate`, the declaration from {@link PRODUCT_TYPE_ENTITY_METADATA} at the foot of this
   * module — attaches all seven to the instance and RETURNS THE SAME OBJECT, so identity is
   * preserved and nothing is wrapped or proxied. `src/adapters/mysql/rowMappers.ts` already performs
   * that call on every hydrated product type, so any instance reaching the validator or the
   * uniqueness checker carries the surface those contracts require. The behaviour therefore exists
   * once, for all six entities, instead of once per entity.
   *
   * ⚠️ AN EARLIER REVISION DECLARED ALL SEVEN AS METHODS HERE, AND THE CONTRADICTION IS RECORDED
   * RATHER THAN QUIETLY TIDIED AWAY. The module simultaneously asserted, in three places, that the
   * members were "composed onto an instance by `../base/manageEntity` rather than hand-written here"
   * and that "there is no `getPrimaryIDValue` ... anywhere in this CLASS" — while the class declared
   * exactly those methods a few hundred lines above. The prose described the intended design and the
   * code did not implement it; the methods were removed rather than the prose, because the prose was
   * the half that matched the mandate.
   *
   * ⚠️ THE FIVE SIBLING ENTITIES STILL DECLARE THEM, AND THAT ASYMMETRY IS INTENTIONAL — DO NOT
   * "HARMONISE" IT. `Product.ts`, `Brand.ts`, `Sku.ts`, `Option.ts` and `OptionGroup.ts` each declare
   * the seven, and `test/domain/Brand.test.ts` asserts several of them directly on a `Brand`. Those
   * files are governed by their own contracts; this one carries an explicit negative mandate that
   * they do not. Making all six alike would mean overriding a stated mandate for the sake of
   * symmetry, so the difference is documented here instead — exactly as this module already does for
   * `getSimpleRepresentationPropertyName`, which `Product.ts` declares and this file must not.
   * ============================================================================================ */
}

/* ================================================================================================
 * MODULE-PRIVATE HELPERS — the ported framework algorithm
 * ============================================================================================= */

/**
 * Builds the comma-delimited, ROOT-FIRST identifier path for `startingProductType` by walking its
 * `parentProductType` chain to the root. Ports `buildIDPathList` from
 * [org/Hibachi/HibachiEntity.cfc:L308-L324] verbatim in structure:
 *
 * ```cfml
 * public string function buildIDPathList(required string parentPropertyName) {
 *     var idPathList = "";
 *     var thisEntity = this;
 *     var hasParent = true;
 *     do {
 *         idPathList = listPrepend(idPathList, thisEntity.getPrimaryIDValue());
 *         if( isNull( evaluate("thisEntity.get#arguments.parentPropertyName#()") ) ) {
 *             hasParent = false;
 *         } else {
 *             thisEntity = evaluate("thisEntity.get#arguments.parentPropertyName#()");
 *         }
 *     } while( hasParent );
 *     return idPathList;
 * }
 * ```
 *
 * It lives at module scope rather than behind a port or as a method: the algorithm is pure, walks only
 * in-memory `parentProductType` references and needs no collaborator, and the legacy walk opens with
 * `var thisEntity = this`, which a parameter expresses without aliasing `this`.
 *
 * ROOT-FIRST, SELF-LAST — THE SINGLE MOST IMPORTANT PROPERTY OF THIS FUNCTION. `listPrepend` puts each
 * newly visited ancestor IN FRONT of what has been collected, so walking child → parent → grandparent
 * yields `grandparent,parent,child`. That ordering is exactly why
 * {@link ProductType.getBaseProductType} reads the ROOT with `listFirst`. Reverse it — by appending
 * instead of prepending, or by reversing at the end — and `getBaseProductType` starts silently
 * returning a LEAF's `systemCode`, or nothing at all, with no error raised and no test failing unless
 * the test was written for a chain deeper than one level.
 *
 * NO LEADING COMMA FOR A SINGLE-ELEMENT PATH. CFML's `listPrepend("", "abc")` returns exactly `"abc"`,
 * whereas the naive translation — seeding an accumulator array with `''` and calling `join(',')` —
 * produces `",abc"`. {@link listPrependIdentifier} reproduces the CFML rule directly: when the
 * accumulated list is empty the value IS the list. Two consequences follow, both legacy behaviour
 * preserved rather than smoothed:
 *
 *   - A BRAND-NEW ROOT YIELDS THE EMPTY STRING, because `getPrimaryIDValue()` on an unsaved entity is
 *     `''` [the `unsavedvalue=""` of model/entity/ProductType.cfc:L52] and prepending it to an empty
 *     list leaves the list empty. No placeholder is substituted (S9). This is precisely the state that
 *     makes {@link ProductType.getBaseProductType}'s root lookup fail for a new root.
 *   - A PERSISTED CHILD UNDER A NEW PARENT YIELDS A LEADING COMMA — `",C"` — because the accumulator
 *     is non-empty when the parent's empty identifier is prepended. CFML list functions treat empty
 *     elements as non-elements, so `listFirst(",C")` is `"C"`; {@link listFirstIdentifier} reproduces
 *     that rule rather than blindly taking element zero.
 *
 * TODO(parity) [org/Hibachi/HibachiEntity.cfc:L313-L321] — NO CYCLE GUARD, NO DEPTH LIMIT. The legacy
 * `do`/`while` keeps no visited set and no counter, so a cyclic `parentProductType` chain — which
 * nothing in the schema, in [model/validation/ProductType.json] or in
 * {@link ProductType.setParentProductType} prevents — loops forever. AAP §0.8.2 Guideline 4 forbids
 * the guard, which would turn a hang into a result. The `do`/`while` shape is preserved too, so the
 * starting entity is always visited even when it has no parent.
 *
 * TWO PIECES OF FRAMEWORK MACHINERY DISAPPEAR HERE, both by declaration rather than by dispatch
 * (R2 / S3 / TR-3). The string-composed dynamic call
 * `evaluate("thisEntity.get#arguments.parentPropertyName#()")`, evaluated twice per legacy iteration,
 * becomes a direct field read; the generic `parentPropertyName` parameter is not reproduced because
 * the slice only ever passes `"parentProductType"` ([model/entity/ProductType.cfc:L306], [:L311] and
 * the lazy getter at [:L252]) and because `hb_parentPropertyName` on the component tag is the
 * declarative statement of that specialisation. And `thisEntity.getPrimaryIDValue()`
 * [org/Hibachi/HibachiEntity.cfc:L244] becomes a read of {@link ProductType.productTypeID}, the same
 * slot it read, because F22 forbids declaring the framework member.
 *
 * @param startingProductType - The entity whose ancestry is walked; always the LAST element of the
 *   returned path.
 * @returns The comma-delimited identifier path, root first. Empty when the walk collects no
 *   identifiers at all.
 */
function buildProductTypeIDPathList(startingProductType: ProductType): string {
  let idPathList = '';
  let currentProductType: ProductType = startingProductType;
  let hasParent = true;

  do {
    // `listPrepend(idPathList, thisEntity.getPrimaryIDValue())` [`:L313`] — prepend, hence root-first.
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

/**
 * Reproduces CFML's `listPrepend(list, value)` for the comma-delimited identifier path.
 *
 * THE ONE RULE THAT MATTERS: when the list is empty the result is the value ALONE, with no delimiter.
 * Otherwise the value, one comma, then the existing list. That is why a single-element path is the
 * bare identifier and why a genuinely empty identifier prepended onto a non-empty list leaves the
 * leading comma the legacy leaves — see {@link buildProductTypeIDPathList}.
 *
 * Named for the operation rather than for the type it happens to handle, because it is intentionally
 * not a general list utility: nothing else in this module builds a list, `src/util/` owns shared
 * helpers, and exporting a second general-purpose list function from a domain entity would invite
 * exactly the duplication that S4's layering exists to prevent.
 */
function listPrependIdentifier(idPathList: string, identifier: string): string {
  return idPathList === '' ? identifier : `${identifier},${idPathList}`;
}

/**
 * Reproduces CFML's `listFirst(list)` for the comma-delimited identifier path — the call at
 * `model/entity/ProductType.cfc:L112`.
 *
 * CFML LISTS TREAT EMPTY ELEMENTS AS NON-ELEMENTS, so `listFirst(",C")` is `"C"` and NOT `""`.
 * Splitting on `,` and taking index zero would therefore return the wrong value for precisely the
 * path shape {@link buildProductTypeIDPathList} produces for a persisted child under an unsaved
 * parent. The first NON-EMPTY element is returned instead, which is what the CFML function does. This
 * also sidesteps `noUncheckedIndexedAccess` honestly, by iterating rather than by asserting that
 * element zero exists.
 *
 * G6 — A DOCUMENTED ENGINE DIVERGENCE, RESOLVED THE TOTAL WAY. The two CFML engines this application
 * supports disagree about `listFirst("")`: one returns the empty string and the other raises. The
 * CFML runtime is not reproducible in this environment (AAP §0.8.4.1), so rather than guess which
 * behaviour to reproduce, the port takes the total path and returns the empty string — an identifier
 * that {@link ProductTypeRootResolver} cannot resolve, so the caller lands on its documented
 * "root unresolved" outcome either way. Precedent: defect D20 [`model/dao/ProductDAO.cfc:L64`] is
 * carried the same way, as an engine divergence whose precondition the migration itself removes.
 */
function listFirstIdentifier(idPathList: string): string {
  for (const candidateIdentifier of idPathList.split(',')) {
    if (candidateIdentifier !== '') {
      return candidateIdentifier;
    }
  }
  return '';
}

/* ================================================================================================
 * THE POPULATION CONTRACT (R-B)
 * ============================================================================================= */

/**
 * Every property name `model/entity/ProductType.cfc` declares — all twenty-five of them, in
 * declaration order: the eight persistent scalars [`:L52-L59`], the many-to-one [`:L62`], the three
 * one-to-many collections [`:L65-L67`], the eight many-to-many inverses [`:L70-L77`], `remoteID`
 * [`:L80`] and the four audit properties [`:L83-L86`], the last of these reused from
 * {@link AuditPropertyName} rather than re-spelled.
 *
 * The union is complete even though the descriptor set below is not, and the difference is
 * deliberate — see {@link createProductTypePropertyDescriptorSet}. Completeness here is what lets
 * `PopulationTarget<ProductTypePropertyName>` check this class's whole declared surface.
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
 *
 * ⭐ THIS IS HOW BOTH THINGS STAY TRUE AT ONCE. The mandate says there is no `getPrimaryIDValue`,
 * `getPrimaryIDPropertyName` or `getPropertyMetaData` anywhere in this CLASS, and there is not: the
 * members are composed onto an instance by `manageEntity` from `../base/populate`, reading the
 * declaration below, so the behaviour exists exactly once for all six entities instead of six times
 * over. See {@link EntityMetadataDeclaration} for what each member ports and why.
 *
 * ⚠️ THIS PARAGRAPH WAS FALSE WHEN IT WAS FIRST WRITTEN, AND THE CODE WAS CHANGED TO MATCH IT RATHER
 * THAN THE REVERSE. At that point the class DID declare all seven members as hand-written methods a
 * few hundred lines above, so a reader who trusted this note would have been misled about where the
 * behaviour lived, while a reader who trusted the mandate would have been misled about whether it was
 * obeyed. The methods were removed, the `implements ManagedEntity` clause that obliged them was
 * dropped, and the claim is now checkable: grep this file for `getPrimaryIDValue(` and the only hits
 * are prose. The wording is left as it stood because it always described the intended design
 * correctly; only the code was wrong.
 *
 * ⚠️ AND THE SAME WORDING STOOD IN ALL FIVE SIBLING MODULES, WHERE IT WAS RESOLVED THE OTHER WAY.
 * `Sku.ts`, `Product.ts`, `Brand.ts`, `Option.ts` and `OptionGroup.ts` each carried this note verbatim
 * while hand-writing all seven members and declaring `implements ManagedEntity` — and for them the
 * CODE is right, because accepting that contract is a legitimate choice and only this class declines
 * it. Their notes were corrected to describe what they do; an earlier revision of this block named
 * only two of the five, which understated the spread. `../base/AuditableEntity` now records the split
 * once, on the contract itself, so the question "which classes declare these seven" has exactly one
 * answer to read.
 *
 * ⚠️ AND THE PATH IN THE ORIGINAL WORDING WAS ALSO WRONG: it said `../base/manageEntity`, which is not
 * a module. `manageEntity` is a FUNCTION exported by `../base/populate`. Corrected above rather than
 * quietly reworded, because a wrong path in a note about where behaviour lives is the specific error
 * this block exists to prevent.
 *
 * This constant is the ONLY place in this module where the class name and the ORM entity name appear
 * as VALUES rather than as prose, and {@link createProductTypePropertyDescriptorSet} reads its
 * `className` from here so the literal is written once.
 *
 * TWENTY-FIVE FIELD KEYS — every persistent property [model/entity/ProductType.cfc] declares: the
 * eight scalars at [`:L52-L59`], the parent relationship at [`:L62`], the collections at
 * [`:L65-L67`] and [`:L70-L77`], the remote identifier at [`:L80`] and the four audit properties at
 * [`:L83-L86`].
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
     * answers TRUE for it and `src/validation/Validator.ts` silently skips a rule whose property
     * answers false; no `model/validation/ProductType.json` rule names it today, so listing it
     * changes no rule's behaviour and closes the gap for any that ever does.
     */
    declaredNonFieldProperties: Object.freeze({ parentProductTypeOptions: true }),
  } satisfies EntityMetadataDeclaration<ProductTypePropertyName>);

/* ================================================================================================
 * THE PER-ENTITY METADATA CONSTANTS — ONE SOURCE, TWO VOCABULARIES
 * ================================================================================================
 * `PRODUCT_TYPE_ENTITY_METADATA` above is the single frozen declaration of this entity's class name, ORM entity name,
 * primary-identifier property name and declared-property set. The four constants below NAME those
 * same four facts individually, because the entity's own metadata members and the population
 * descriptor set read them one at a time, and a named constant states the intent better at each of
 * those sites than reaching into a record does.
 *
 * ⛔ THEY ARE DERIVED, NEVER RE-SPELLED. Every one reads out of `PRODUCT_TYPE_ENTITY_METADATA`; not one repeats a literal.
 * That is the whole point. The class name in particular is consumed in three places that MUST agree
 * — `getClassName()`, every validation message
 * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216], and the third arm of the population
 * authorisation gate through `PropertyDescriptorSet.className` — and a second literal would let two
 * of the three drift apart with no compile error and no test failure.
 *
 * ⚠️ `PRODUCT_TYPE_CLASS_NAME` IS NOT `PRODUCT_TYPE_ENTITY_NAME`. The first is the bare `ProductType`, the last
 * dot-delimited segment [org/Hibachi/HibachiObject.cfc:L135-L137]; the second carries the `Slatwall`
 * prefix declared by the `entityname` attribute at [`:L49`] and read at
 * [org/Hibachi/HibachiEntity.cfc:L287-L289]. Interchanging them changes observable message text in
 * one direction and breaks the mapped-graph vocabulary in the other.
 * ================================================================================================ */

/**
 * The bare class name — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of
 * the component's fully qualified name. Carries NO `Slatwall` prefix.
 */
export const PRODUCT_TYPE_CLASS_NAME: string = PRODUCT_TYPE_ENTITY_METADATA.className;

/**
 * The mapped ORM entity name declared by the `entityname` attribute at [`:L49`] and read at
 * [org/Hibachi/HibachiEntity.cfc:L287-L289].
 *
 * ⚠️ THE LOGICAL ENTITY NAME, NOT THE PHYSICAL `Sw*` TABLE. The legacy uniqueness statement
 * [org/Hibachi/HibachiDAO.cfc:L140] is expressed over the mapped object graph, so the prefixed form
 * is correct there; translating it into a table is the adapter's responsibility, never this module's.
 */
export const PRODUCT_TYPE_ENTITY_NAME: string = PRODUCT_TYPE_ENTITY_METADATA.entityName;

/**
 * The NAME of the primary identifier property — [`:L52`], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 *
 * The legacy resolved this name through `getService("hibachiService")`
 * [org/Hibachi/HibachiEntity.cfc:L249-L251]. Declaring it removes the string-keyed service locator
 * AAP 0.7.3 S3 forbids, and it is what makes the value safe in identifier position: the name comes
 * from entity metadata, never from caller input.
 */
export const PRODUCT_TYPE_PRIMARY_ID_PROPERTY_NAME: string =
  PRODUCT_TYPE_ENTITY_METADATA.primaryIDPropertyName;

/**
 * Every property name the LEGACY entity declares, as a keyed set — the port of the
 * `getPropertiesStruct()` structure [org/Hibachi/HibachiTransient.cfc:L739] that both `hasProperty`
 * [:L764] and `getPropertyMetaData` [:L741] key into. Membership is an own-key test in both.
 *
 * ⚠️ IT IS THE UNION OF THE TWO RECORDS `PRODUCT_TYPE_ENTITY_METADATA` KEEPS SEPARATE, AND IT HAS TO BE. `properties`
 * holds the names this port carries as fields; `declaredNonFieldProperties` holds the names the
 * legacy entity declares that this port does NOT carry — accessors and boundary members such as
 * `defaultFlag` and `transactionExistsFlag`. The legacy predicate reads the entity's WHOLE declared
 * property table, and `src/validation/Validator.ts` SILENTLY SKIPS a rule whose property is absent
 * [org/Hibachi/HibachiValidationService.cfc:L171] — so answering false for a name in the second
 * record would turn a live validation rule inert with no error reported anywhere.
 *
 * ⚠️ THE COMPILE-CHECKED EXHAUSTIVENESS LIVES ON `PRODUCT_TYPE_ENTITY_METADATA`, NOT HERE, and that is deliberate. The
 * `satisfies` annotations there check both records against the entity's property-name unions in BOTH
 * directions — a missing name and an invented one each fail the build. This constant merges two
 * already-checked records, so widening it to `string` keys loses nothing: there is no union to check
 * the merged set against, since the second record's names are by definition the ones no
 * property-name union carries.
 *
 * ⚠️ A NAME ABSENT FROM BOTH RECORDS STAYS ABSENT HERE, AND THAT IS ALSO LOAD-BEARING.
 * `physicalCounts` is named by the validation JSON and declared by NEITHER entity, so the legacy
 * engine skips those rules and this port must too. TODO(parity): carried as observed and NOT
 * repaired, per AAP 0.8.2 Guidelines 2 and 4. Adding it "for completeness" would activate a rule the
 * legacy system has never run.
 */
export const PRODUCT_TYPE_DECLARED_PROPERTIES: DeclaredPropertyNameSet<string> = Object.freeze({
  ...PRODUCT_TYPE_ENTITY_METADATA.properties,
  ...(PRODUCT_TYPE_ENTITY_METADATA.declaredNonFieldProperties ?? {}),
});

/**
 * The collaborators the relationship descriptors need, supplied by the composition root
 * (`src/config/container.ts`) rather than resolved here.
 *
 * ONE LOADER SERVES BOTH `parentProductType` AND `childProductTypes`, because both relate to
 * `ProductType` and the legacy resolved both through the SAME entity service — a single
 * `getService("hibachiService").getServiceByEntityName(...)` lookup keyed on the related CFC name
 * [`org/Hibachi/HibachiTransient.cfc:L227`, `:L233`]. Splitting them would invent a distinction the
 * legacy never had.
 *
 * `TODO(boundary)` — `attributeValueLoader` and `populateAttributeValue` cross the scope boundary:
 * `AttributeValue` belongs to the excluded `model/**\/Attribute*.cfc` family (AAP §0.2.2.1), so they
 * are typed against {@link ProductTypeAttributeValueOwner}. Their rightful owner is the attribute
 * domain, which this slice does not convert.
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
 * R-B — THIS MODULE DECLARES THE CONTRACT; `../base/populate` EXECUTES IT. There is deliberately no
 * `populate()` method on {@link ProductType}: `model/entity/HibachiEntity.cfc:L56` overrode
 * population on the entity, and the port relocates that responsibility to one place (TR-2), leaving
 * each entity module to declare only what its own properties are.
 *
 * A FACTORY RATHER THAN A CONSTANT, AND NOT AS A MATTER OF TASTE. The four relationship descriptors
 * each require a `RelatedEntityLoader` and a sub-property populator, and those are repository-backed
 * collaborators. A module-scope constant would have to close over module-scope collaborators, which
 * M7 / S8 forbid outright — module state survives across invocations on a warm Lambda container and
 * would bleed between tenants — and building them here by lookup would be the service locator S3
 * forbids. So the collaborators arrive as an argument and the set is built per call. The scalar
 * descriptors could have been a constant; splitting them from the relationships would have put the
 * declaration order below at risk of drifting from the legacy's, which the population layer treats as
 * observable, so they are declared together in one place.
 *
 * EXACTLY FOUR PROPERTIES ARE POPULATE-DISABLED — the audit block, and nothing else. Their names
 * come from `AUDIT_PROPERTY_NAMES` by mapping over it, never by re-typing the four strings, so this
 * declaration cannot drift from `../base/AuditableEntity`. Across
 * `model/entity/ProductType.cfc:L70-L77`, NONE of the eight many-to-many inverses carries
 * `hb_populateEnabled="false"` on THIS entity — unlike `model/entity/Brand.cfc`, which carries nine
 * such declarations in total. Brand's five extra relationship exclusions belong to `Brand.ts`; if
 * they ever appear here, they were copied in error.
 *
 * DECLARATION ORDER IS PRESERVED EXACTLY, because `../base/populate` iterates declared properties
 * rather than payload keys, which makes declaration order the population order — observable whenever
 * two properties feed the same downstream value.
 *
 * `TODO(boundary)` — THE EIGHT MANY-TO-MANY INVERSES HAVE NO DESCRIPTOR, AND THE OMISSION IS A
 * DECISION. A `ManyToManyPropertyDescriptor` requires add, remove, read and identifier-read
 * operations over the related entity; for these eight, the legacy add/remove members
 * [`model/entity/ProductType.cfc:L174-L228`, `:L238-L244`] are exactly the sixteen the NOT-PORTED
 * block below excludes, and every related family — `Promotion*` (9 files), `PriceGroup*` (4),
 * `Attribute*` (6), `Physical*` (6) — is out of scope (AAP §0.2.2.1). Supplying descriptors would
 * mean inventing that surface (S9). THE CONSEQUENCE, STATED PLAINLY: a payload key naming one of the
 * eight is SILENTLY IGNORED here, whereas the legacy would have attempted to populate it. Rightful
 * owners are the excluded domains and `src/ports/SmartListQueryPort.ts`. The property names remain in
 * {@link ProductTypePropertyName} so the class's declared surface stays complete and honest.
 *
 * ONE FURTHER CONSEQUENCE WORTH RECORDING, owned by the population layer rather than by this file:
 * `../base/populate` fulfils a many-to-one by writing the property directly, so populating
 * `parentProductType` from a payload assigns the reference WITHOUT routing through
 * {@link ProductType.setParentProductType} — the parent's `childProductTypes` array is therefore not
 * appended to on that path. The bidirectional helpers remain the way to establish both sides, and
 * `src/adapters/mysql/rowMappers.ts` owns hydration of the reverse side.
 *
 * @param collaborators - The injected loaders and sub-property populators.
 * @returns The complete population contract for this entity, `persistent: true` per the
 *   `persistent="true"` attribute on `model/entity/ProductType.cfc:L49`.
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
    // none declares `notNull`, so a blank value DELETES the key rather than assigning `''`.
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
    // `:L70-L77` — the eight many-to-many inverses are declared in the legacy HERE, between the
    // one-to-many block and `remoteID`. They have no descriptor; see the warning above.
    { name: 'remoteID', valueType: 'string' },
    ...auditPropertyDescriptors,
  ];

  /*
   * `entityName` is the legacy `getClassName()` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
   * [model/entity/ProductType.cfc:L49] — the bare component name. It is the ARM 3 operand of the
   * population gate [org/Hibachi/HibachiTransient.cfc:L190] and the key the out-of-scope permission
   * records are stored under [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141], so the legacy
   * spelling is carried verbatim rather than read from `ProductType.name` at runtime.
   */
  return { entityName: 'ProductType', persistent: true, properties };
}

/* ================================================================================================
 * NOT PORTED — every omission with its locator and its reason
 *
 * Each entry is a DECISION, not an oversight: excluded because its collaborator is out of scope,
 * because it is unreachable, or because the layer that owns it is elsewhere in the target.
 *
 * ── 1. `parentProductTypeOptions`, the sole non-persistent property [:L89], and its accessor
 *       `getParentProductTypeOptions( string baseProductType="" )` [:L122-L142]. Three independent
 *       reasons, any one sufficient: it is built on `getPropertyOptionsSmartList( "parentProductType" )`
 *       [:L128], a framework-synthesized SmartList member that F9 keeps out of the domain layer; [:L129]
 *       calls `getService('productService').getProductTypeBySystemCode( … )`, WHICH IS DECLARED NOWHERE
 *       IN THE REPOSITORY — the same defect class as D5 [model/entity/Product.cfc:L631-L633] — and S9
 *       forbids inventing it; and it calls {@link ProductType.getBaseProductType} at [:L125], which is
 *       asynchronous here, so even the reachable part could not keep its synchronous shape. Its two
 *       lazy caches disappear with it, which is why this module has exactly ONE memoization.
 *
 * ── 2. `getAppliedPriceGroupRateByPriceGroup( required any priceGroup )` [:L117-L119]. Delegates to
 *       `priceGroupService`, and `model/**\/PriceGroup*.cfc` is out of scope (AAP §0.2.2.1). Not
 *       boundary-stubbed, because unlike the attribute-value pair there is no in-scope caller, so a
 *       port for it would create surface the slice never exercises (S9). A legacy defect recorded in
 *       passing rather than repaired (Guideline 4): the call passes `product=this` — a ProductType,
 *       under an argument named `product` — harmless in untyped CFML.
 *
 * ── 3. `getProductsSmartList()` [:L261-L267]. F9 twice over: a SmartList getter obtaining its
 *       SmartList from `productService`. It also injects a RAW
 *       `addWhereCondition(" aslatwallproducttype.productTypeIDPath LIKE '#getProductTypeIDPath()#%'")`
 *       [:L264] — the path INTERPOLATED into SQL, which S2 forbids. `SmartListQueryPort` and
 *       `src/adapters/mysql/SmartListQueryBuilder.ts` own both the query and the parameterized form of
 *       that predicate.
 *
 * ── 4. `getAssignedAttributeSetSmartList()` [:L280-L299]. F9, plus the out-of-scope `attributeService`
 *       [:L283]. It builds an `IN` list by `replace()`-ing the commas of the identifier path into
 *       quoted separators [:L292], the exact string-interpolation pattern S2 forbids and the same shape
 *       AAP §0.4.3.4 flags on [model/dao/OptionDAO.cfc:L93-L116], where the target emits one `?` per
 *       value instead.
 *
 * ── 5. The sixteen many-to-many-inverse bidirectional helpers, eight pairs:
 *       `add/removePromotionReward` [:L175-L180], `add/removePromotionRewardExclusion` [:L183-L188],
 *       `add/removePromotionQualifier` [:L191-L196],
 *       `add/removePromotionQualifierExclusion` [:L199-L204], `add/removePriceGroupRate` [:L207-L212],
 *       `add/removePriceGroupRateExclusion` [:L215-L220], `add/removeAttributeSet` [:L223-L228] and
 *       `add/removePhysical` [:L239-L244]. Every collaborator is an excluded family — `Promotion*`,
 *       `PriceGroup*`, `Attribute*`, `Physical*` — and no in-scope code calls any of the sixteen. Each
 *       is a two-line delegation to the far side's own helper (for example [:L240]
 *       `arguments.physical.addProductType( this )`), so porting them would mean declaring sixteen
 *       capability interfaces for behaviour nothing in this slice invokes. The COLLECTIONS are declared
 *       on the class, because the row really has them; only the mutators are omitted. Contrast entry 6.
 *
 * ── 6. NOT an omission — `addAttributeValue`/`removeAttributeValue` [:L231-L236] ARE ported even
 *       though `AttributeValue` is out of scope, because TR-5 requires a boundary-crossing member to be
 *       declared against a port rather than dropped, and because the legacy inverse side
 *       [model/entity/AttributeValue.cfc:L257-L272] calls back into this entity, making the pair a live
 *       bidirectional contract. The difference from entry 5 is exactly that: a live contract versus
 *       sixteen uncalled delegations.
 *
 * ── 7. The framework member surface F22 forbids — the primary-identifier, new-flag, validation,
 *       metadata, dynamic-dispatch, populate, SmartList, setting, service-locator and attribute-value
 *       accessors. None is declared here; `getSimpleRepresentation` is the one sanctioned exception,
 *       for the reason given on the method itself. Their owners in the target are
 *       `src/validation/Validator.ts` with `src/validation/rules/productType.rules.ts`,
 *       `src/ports/SettingResolverPort.ts`, `src/adapters/mysql/UniquePropertyChecker.ts` (IR-5), and
 *       `../base/populate` served from here by {@link createProductTypePropertyDescriptorSet}.
 *
 * ── 8. `getAttributeValues()` and `hasAttributeValue()` — IR-1 synthesized members whose only call
 *       sites are out of scope [model/entity/AttributeValue.cfc:L257-L272]. Compare
 *       {@link ProductType.hasChildProductType}, admitted precisely because [:L151] of this very file
 *       calls it. The asymmetry is the declare-only-what-is-used rule working as intended.
 *
 * ── 9. The GPL v3 with-linking-exception banner [:L1-L48], including its empty `Notes:` block at
 *       [:L46-L47], and every section banner in the file. The licence header is not reproduced because
 *       no file in this subtree carries one: the deliverable is an additive subtree under the
 *       repository's own licence. The banners' CONTENT is carried — each legacy section is reproduced
 *       as a section comment above the members it introduced, misspellings and all where quoted.
 *
 * Also ported from OUTSIDE this file, because this entity's behaviour depends on it:
 * `buildIDPathList` [org/Hibachi/HibachiEntity.cfc:L308-L324] -> the module-private walker above.
 * ============================================================================================= */
