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
 *   - `entityname` / `table`. The table is named in PROSE ONLY. This module contains no SQL, no query
 *     string, no driver import and no table or column identifier in any code position (S2); mapping
 *     brand rows to and from this type belongs to `src/adapters/mysql/rowMappers.ts`.
 *   - `extends="HibachiEntity"` resolves to the LOCAL [model/entity/HibachiEntity.cfc], not to
 *     `org/Hibachi/HibachiEntity.cfc` (IR-8). That local class is the one whose `populate()` override
 *     [model/entity/HibachiEntity.cfc:L56-L97] and `setting()` helper [:L129] the in-scope entities
 *     actually inherit. Neither is reproduced as a member here: population belongs to
 *     `../base/populate`, and Brand has no `setting()` caller at all.
 *   - `cacheuse="transactional"` is a Hibernate second-level cache directive with no equivalent in a
 *     stateless Lambda invocation — mismatch M7. FLAGGED and deliberately not implemented: nothing
 *     survives between invocations except module scope, and module-scope state on a warm container
 *     leaks across invocations and therefore across tenants. This module holds no cache, no memoized
 *     value and no module-scope mutable binding; its two module-scope bindings are frozen constants
 *     with no per-request content.
 *   - `accessors=true` is why the legacy needed no `getBrandName()` in source and still had one. See
 *     THE ACCESSOR DECISION below.
 *
 * Standards citations use the AAP §0.7.3 identifiers S1-S9. `F<n>` markers are this port's own
 * file-scope rules — most often F2 (a collection getter returns the LIVE array), F9 (SmartList
 * members belong to the SmartList port and its adapter), F12 (validation lives in
 * `src/validation/**`), F21 (`isNew` is the one sanctioned framework-shaped member) and F22
 * (framework members are not declared on domain entities). AAP §0.8.2 Guideline 6 requires every
 * technology-specific translation decision to be documented where it is made; those are labelled
 * `D-a` through `D-l` at the point each one is made — `D-a` and `D-l` in this header, because they
 * govern the whole property surface, and the rest at the declaration each one concerns.
 *
 *   - `entityname="SlatwallBrand"` and `table="SwBrand"`. The table is named here in PROSE ONLY.
 *     This module contains no SQL, no query string, no driver import and no table or column
 *     identifier in any code position; mapping brand rows to and from this type is owned by
 *     `src/adapters/mysql/rowMappers.ts` (AAP §0.4.1.7). The LOGICAL ORM name is a different thing
 *     and IS declared as a value, exactly once, in {@link BRAND_ENTITY_METADATA} — `getEntityName()`
 *     [org/Hibachi/HibachiEntity.cfc:L287-L289] is observable behaviour that
 *     `src/ports/UniquePropertyPort.ts` consumes, and the two attributes must never be conflated.
 *
 * D-a — THE ACCESSOR DECISION: PUBLIC FIELDS, NOT GENERATED getX/setX PAIRS. `accessors=true` made the
 * engine generate a pair per property and legacy callers used them: [model/service/BrandService.cfc:L68]
 * reads `getURLTitle()`, [:L71-L72] read `getBrandName()`, [model/entity/Product.cfc:L528] reads
 * `getBrand().getBrandName()`, [integrationServices/google/views/feed/product.cfm:L32] reads
 * `sku.getProduct().getBrand().getBrandName()`, and [model/entity/Product.cfc:L814] with
 * [model/entity/Sku.cfc:L345, L831] read `getBrandID()`. NONE of those accessors is reproduced: the
 * persistent surface is PUBLIC FIELDS named exactly as the legacy properties, so every read above
 * becomes a field read. That is the idiomatic TypeScript AAP §0.8.1 asks for — minimal in functional
 * scope, expressly NOT minimal in idiom — and it is also FORCED, for a reason unrelated to taste:
 *
 *     `../base/populate` implements CFML's null semantics as `delete target[propertyName]`
 *     (`clearPropertyValue`), and a value behind a getter/setter pair CANNOT be deleted.
 *
 * The observable proof that deletion rather than assigning `''` is the correct semantic sits in the
 * service layer: [model/service/ProductService.cfc:L268] guards its unique-URL-title generation with
 * `isNull(getURLTitle())` ALONE, whereas `saveProductType` at [:L295] guards with
 * `isNull(...) || !len(...)`. If population assigned `''` instead of deleting the key, the L268 branch
 * could never fire and a product saved with a blank `urlTitle` would silently end up with none.
 * `exactOptionalPropertyTypes` is enabled for this subtree precisely so that "unset" means the key is
 * ABSENT; `undefined` is never assigned to any property in this file.
 *
 * Two methods are still declared, each for a reason that is not an accessor: `getProducts()` carries
 * the LIVE-ARRAY-BY-REFERENCE contract (F2) that three legacy call sites mutate through, which a field
 * read would not document and a copy would break; and `hasProduct()` has no declaration anywhere in
 * the legacy source, having been fabricated by the ORM's `has<singularName>()` generation, so IR-1
 * requires it to become an explicit typed declaration.
 *
 * WHAT IS DELIBERATELY ABSENT (F22). No framework member is declared here — not the primary-identifier
 * or new-flag accessors, not `validate`/`hasErrors`/`getErrors`, not `getPropertyMetaData`,
 * `onMissingMethod`, `populate`, `getPropertySmartList`, `setting`, `getService` or
 * `getAttributeValue`. Every one lived on the retired framework base classes, which AAP §0.8.3.2
 * retires for this slice rather than carrying forward. Their replacements live elsewhere by design:
 * population in `../base/populate`, validation in `src/validation/**`, paginated dynamic queries behind
 * `SmartListQueryPort`, setting resolution behind `SettingResolverPort`, and the audit lifecycle in
 * `../base/AuditableEntity`. `isNew()` is the ONE exception (F21), exempt because it is a pure derived
 * predicate over this class's own primary identifier with no dependency on anything.
 *
 * BRAND OVERRIDES NEITHER SIMPLE-REPRESENTATION MEMBER, and the asymmetry across this folder is legacy
 * fact: `ProductType.ts` overrides `getSimpleRepresentation()` and `Product.ts` overrides
 * `getSimpleRepresentationPropertyName()` because their legacy sources declare those overrides.
 * [model/entity/Brand.cfc] declares neither, so this file declares neither. The three shapes must NOT
 * be harmonised (AAP §0.8.2 Guideline 2).
 *
 * D-l — `declare` ON EVERY OPTIONAL FIELD, AND WHY IT IS NOT COSMETIC. Ten fields carry the modifier:
 * the five optional persistent scalars, `remoteID` and the four audit properties. `tsconfig.json`
 * targets ES2022, which turns `useDefineForClassFields` on, and under that setting a bare class-field
 * declaration is emitted as a real `Object.defineProperty` at construction time EVEN WITH NO
 * INITIALISER — so `activeFlag?: boolean;` would produce an OWN property whose value is `undefined` on
 * every `new Brand()`. `declare` makes the field a type-level declaration only, so nothing is emitted
 * and the key stays genuinely absent until something assigns it. Three consequences, in increasing
 * order of importance: it is the legacy semantic, since CFML properties do not exist until assigned and
 * `structKeyExists(variables, "urlTitle")` is FALSE on a fresh brand; it is the subtree's stated
 * contract, since `exactOptionalPropertyTypes` and `../base/AuditableEntity` both promise that unset
 * means absent, and emitting own `undefined` properties would make both claims false at run time while
 * leaving them true at the type level, which nothing would flag; and it keeps `delete` meaningful,
 * because otherwise the round trip is observably lopsided — absent before the first population, absent
 * after a blank one, yet present-and-`undefined` on a brand that was merely constructed, so anything
 * enumerating the entity would see a different property set depending on how the instance came to be.
 * `brandID` and the eight collections deliberately do NOT carry `declare`: they need real emitted
 * initialisers, `''` and `[]`, and the eager `[]` is itself a test requirement.
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
  type ManagedEntity,
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

/*
 * D-d — G6 TRANSLATION DECISION: `import type`, AND WHY THE MUTUAL CYCLE IS HARMLESS.
 *
 * `Product` is imported for TYPE POSITIONS ONLY — the `products` collection, three method
 * signatures and one descriptor type argument. `Product.ts` imports `Brand` in turn, because
 * [model/entity/Product.cfc:L68] declares `property name="brand" cfc="Brand"
 * fieldtype="many-to-one"`, so the two modules form a cycle at the TYPE level. That is expected and
 * correct rather than a design flaw to work around: `import type` is FULLY ERASED at emit, so the
 * bundled CommonJS artifact contains no `require('./Product')` from this module at all and there is
 * no runtime cycle, no partially initialised module and no bundler ordering hazard.
 *
 * The alternative — a local structural interface duplicating Product's shape — is explicitly
 * forbidden for this collaborator, and rightly: `Product` is IN SCOPE (AAP §0.3.1 places it in this
 * same folder and §0.4.5 lands the whole subtree in ONE phase), so a fork would be a second
 * declaration of a type that already exists, guaranteed to drift. The type is likewise never
 * weakened to `any`, `unknown` or `object`, which would silently discard the compile-time guarantee
 * that `addProduct` receives something that really can accept a brand back.
 *
 * THE EXACT CONTRACT THIS MODULE REQUIRES OF `./Product`, stated so the two files cannot disagree —
 * `Product` must be an exported class or interface declaring `setBrand(brand: Brand): void` and
 * `removeBrand(brand?: Brand): void`, matching the hand-written members at
 * [model/entity/Product.cfc:L662-L667] and [:L668-L677]. Nothing else about `Product` is touched
 * here: not its identifier, not its name, not any other member. `setBrand` is the one that
 * maintains both sides of the relationship and carries the duplicate guard, which is why
 * {@link Brand.addProduct} delegates to it rather than appending directly.
 */
import type { Product } from './Product';

/**
 * The element type of Brand's `attributeValues` collection.
 *
 * NARROW, DISTINCTLY NAMED AND LOCAL, BY MANDATE (the R-C pattern). `AttributeValue` is out of
 * scope: §0.2.2.1 excludes the six `Attribute`-prefixed components under the legacy `model` tree,
 * and §0.2.2.6 names `attributeService` among the excluded collaborators. Per TR-5 the two members
 * that depend on it are NOT quietly dropped — they are implemented against this interface, which
 * declares EXACTLY the two members the legacy code touches and nothing more:
 *
 *     [model/entity/Brand.cfc:L91] `arguments.attributeValue.setBrand( this );`
 *     [model/entity/Brand.cfc:L94] `arguments.attributeValue.removeBrand( this );`
 *
 * Both are real, hand-written members of the excluded component —
 * [model/entity/AttributeValue.cfc:L167] `public void function setBrand(required any brand)` and
 * [:L173] `public void function removeBrand(any brand)` — which the FK declaration at
 * [model/entity/AttributeValue.cfc:L66] `property name="brand" cfc="Brand" fieldtype="many-to-one"
 * fkcolumn="brandID"` exists to serve. So this interface describes members that genuinely exist; it
 * invents nothing (S9).
 *
 * The name is deliberately NOT `AttributeValue`: it must be impossible to mistake this two-member
 * structural stand-in for the real domain type, exactly as `Option.skus` is typed against
 * `SkuOptionOwner` rather than `Sku` in the sibling `option/` modules. It is exported so that a
 * test can satisfy it with a plain object literal and no mocking library, which matters because the
 * legacy suite has none and booted the entire FW/1 application instead (§0.4.3.6).
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
 * D-k — the element type of a many-to-many-inverse collection whose collaborator family is entirely
 * out of scope.
 *
 * Three excluded families reach Brand through the six collections at [model/entity/Brand.cfc:L66-L71]:
 * `Promotion*`, `Vendor*` and `Physical*`, all excluded by AAP §0.2.2.1.
 *
 * WHY `object` AND NOT A DECLARED INTERFACE. No in-scope code traverses any of these collections, reads
 * a member off an element or calls a method on one; the identically named methods on
 * [model/entity/Product.cfc:L732, L772, L780] and [model/entity/Sku.cfc:L672, L744] are those entities'
 * OWN bidirectional helpers rather than calls into Brand. For a collection that is only ever declared,
 * an opaque element type is the honest declaration: it carries the fact that the collection holds
 * entities without inventing a shape for them (S9), and because `object` exposes no member the compiler
 * actively prevents this port from starting to depend on one by accident. `object` rather than an empty
 * `interface`, because an empty object type is flagged by `@typescript-eslint/no-empty-object-type` and
 * inventing a marker member to satisfy the linter is the fabrication S9 forbids; `object` rather than
 * `unknown` or `any`, because those would admit a string or a number into a collection the legacy
 * mapping guarantees holds entities.
 *
 * ONE ALIAS, SIX USES, AND THE CONSEQUENCE STATED PLAINLY: the six collections are mutually assignable.
 * That is a real limitation, acceptable only because nothing in scope traverses or cross-assigns them,
 * and preferable to six invented shapes.
 *
 * TODO(boundary): the rightful owners of these element types are the promotion, vendor and
 * physical-count subsystems, three families AAP §0.2.2.1 excludes outright. When a later slice converts
 * any of them, replace this alias at the corresponding field declaration with that family's real
 * domain type; no port file is created here and no shape is invented (TR-5, S9).
 */
export type OutOfScopeAssociation = object;

/**
 * A brand — the port of `model/entity/Brand.cfc`.
 *
 * `implements AuditableEntity`, and deliberately `extends` NOTHING. §0.3.3 replaces the legacy
 * template-method inheritance with composition, so the audit block is satisfied STRUCTURALLY: the
 * four fields are declared on Brand's own property surface below and the compiler checks them
 * against the shared contract, while the functions that write them — `applyPreInsertAudit` and
 * `applyPreUpdateAudit` — stay in `../base/AuditableEntity` and are invoked by the code that owns
 * the write (`src/adapters/mysql/UnitOfWork.ts`). Nothing is inherited from anything.
 *
 * CONSTRUCTIBLE WITH NO ARGUMENTS, BY MANDATE (S6). There is no declared constructor, because field
 * initialisers express every default the legacy source has. `new Brand()` performs no I/O, no data
 * access, no async work and no framework bootstrap; it cannot fail. That is what makes
 * `test/domain/Brand.test.ts` — TRACEABLE to [meta/tests/unit/entity/BrandTest.cfc] — a unit test
 * rather than the integration test the legacy suite had to be (§0.4.3.6), and it is what
 * `newBrand()` in `src/services/BrandService.ts` will call. That service member is itself an IR-1
 * synthesized declaration listed in AAP §0.4.2.5; it belongs to the service, never here.
 *
 * @example
 * ```ts
 * const brand = new Brand();
 * brand.brandName = 'ACME';
 * brand.isNew();          // true  — brandID is still the unsaved value
 * brand.getProducts();    // []    — the traceable default of BrandTest.cfc:L58-L60
 * ```
 */
export class Brand implements AuditableEntity, ManagedEntity {
  /*
   * ============================================================================================
   * PERSISTENT PROPERTIES — [model/entity/Brand.cfc:L51-L57]
   * ============================================================================================
   */

  /**
   * The primary identifier — [model/entity/Brand.cfc:L52]:
   *
   *     property name="brandID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *              unsavedvalue="" default="";
   *
   * INITIALISED TO THE EMPTY STRING, WHICH IS THE LEGACY `unsavedvalue` AND `default` VERBATIM. It
   * is the sentinel `isNew()` tests, and it is why this one field is required and non-optional
   * where every other scalar below is optional: a Brand is never in a state where it has no
   * `brandID` property at all, only in a state where that property still holds the unsaved value.
   *
   * IDENTIFIERS ARE GENERATED BY THE PERSISTENCE LAYER, NOT HERE (IR-6). Per AAP §6.2, 107 of the
   * 113
   * legacy entities declare `fieldtype="id" generator="uuid" ormtype="string" length="32"`, so the
   * value is a 32-CHARACTER LOWERCASE HEX STRING WITH NO DASHES — never a dashed RFC-4122 value and
   * never an auto-increment number. Generation is `createSlatwallUUID()`'s job, ported to
   * `src/util/uuid.ts`. This module therefore does NOT import `../../util/uuid`, does NOT import
   * `node:crypto`, and calls no identifier generator anywhere: a domain entity that minted its own
   * key would take the decision away from the layer that owns the write.
   */
  brandID: string = '';

  /**
   * [model/entity/Brand.cfc:L53] `property name="activeFlag" ormtype="boolean"`, whose legacy hint
   * reads verbatim: "As Brands Get Old, They would be marked as Not Active".
   *
   * OPTIONAL, AND WITH NO DEFAULT. The legacy declaration carries no `default` attribute — unlike
   * [model/entity/Product.cfc:L58] `publishedFlag`, which declares `default="false"` — so an
   * unpopulated `activeFlag` is genuinely absent rather than false. Inventing a default here would
   * be inventing behaviour (S9), and `exactOptionalPropertyTypes` keeps the distinction honest:
   * absent means the key is missing, never present-and-`undefined`.
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
   *
   * `unique="true"` IS RECORDED HERE AND ENFORCED ELSEWHERE. Two independent mechanisms guarded it
   * in the legacy system and neither belongs to this class:
   *   - the database column constraint, which `src/adapters/mysql/**` owns; and
   *   - an APPLICATION-SIDE existence query run during validation (IR-5) —
   *     `isUniqueProperty()` at [org/Hibachi/HibachiDAO.cfc:L130-L146] — ported to
   *     `src/adapters/mysql/UniquePropertyChecker.ts` and reached through `UniquePropertyPort`.
   * Five of the eight unique columns in the whole system belong to this slice, so the
   * application-side check is not optional; it is simply not an entity concern. No uniqueness check
   * is performed here.
   *
   * The value itself is produced by `createUniqueURLTitle()`
   * [model/service/DataService.cfc:L53-L71], ported verbatim to `src/util/urlTitle.ts` and invoked
   * by `BrandService.saveBrand` — [model/service/BrandService.cfc:L67-L78] — never by the entity.
   */
  declare urlTitle?: string;

  /**
   * [model/entity/Brand.cfc:L56] `property name="brandName" ormtype="string"`, hint: "This is the
   * common name that the brand goes by."
   *
   * EXPLICITLY NOT `notNull`. That matters more than it looks: `notNull` occurs EXACTLY ONCE in the
   * entire in-scope slice — [model/entity/Product.cfc:L55] `productName` — and it is the attribute
   * that decides which arm of population a blank value takes. So `brandName` follows the ordinary
   * null-by-deletion rule: a blank incoming value DELETES the key
   * (`clearPropertyValue` in `../base/populate`) rather than assigning `''`. `brandName` being
   * required for a save is a VALIDATION rule, not a mapping one — see the validation block below.
   */
  declare brandName?: string;

  /**
   * [model/entity/Brand.cfc:L57] `property name="brandWebsite" ormtype="string"
   * hb_formatType="url"`, hint: "This is the Website of the brand".
   *
   * D-b — G6 TRANSLATION DECISION: `hb_formatType="url"` IS A DEAD PATH, AND ONLY THE VALIDATION
   * MECHANISM IS LIVE. Two independent mechanisms could have constrained this value, and exactly
   * one of them ever ran:
   *
   *   DEAD — population never honoured `hb_formatType`. The block that would have consulted it,
   *     [org/Hibachi/HibachiTransient.cfc:L201-L206], is COMMENTED OUT in the legacy source; the
   *     live statement immediately below it at [:L207] is a plain
   *     `_setProperty(currentProperty.name, trim(arguments.data[ currentProperty.name ]))` with no
   *     format argument at all. `_setProperty`'s own third parameter is accepted and never read. So
   *     `hb_formatType` had NO runtime effect during population — verified twice over, and
   *     `../base/populate` independently records the same finding.
   *   LIVE — the URL constraint that actually executed is the declarative rule
   *     `"brandWebsite": [{"contexts":"save","dataType":"url"}]` in `model/validation/Brand.json`,
   *     owned by `src/validation/rules/brand.rules.ts`.
   *
   * NEITHER is implemented here: no URL parsing, no format coercion, no validation. The field holds
   * whatever string the caller assigned, exactly as the legacy property did.
   */
  declare brandWebsite?: string;

  /*
   * ============================================================================================
   * RELATED OBJECT PROPERTIES (one-to-many) — [model/entity/Brand.cfc:L59-L61]
   * ============================================================================================
   * EVERY COLLECTION ON THIS CLASS IS EAGERLY INITIALISED TO `[]` IN ITS OWN DECLARATION. Not
   * lazily on first access, not optional, not `undefined`. `new Brand()` yields empty arrays
   * immediately. The requirement is traceable, not stylistic — see the note on `getProducts()`
   * below and [meta/tests/unit/entity/BrandTest.cfc:L58-L60] — and applying it uniformly to all
   * eight collections is what makes the live-array contract (F2) safe to rely on everywhere.
   *
   * A REAL ASYMMETRY IN THE LEGACY MAPPING, PRESERVED AS DOCUMENTATION: `attributeValues` [:L60]
   * declares `cascade="all-delete-orphan"` while `products` [:L61] declares NO cascade at all.
   * Deleting a brand therefore cascaded to its attribute values but never to its products — which
   * is exactly why `model/validation/Brand.json` needs a `products` delete guard (`maxCollection:
   * 0`) and needs no equivalent guard for `attributeValues`. Cascade is a persistence concern owned
   * by `src/adapters/mysql/**`; §0.8.2 Guideline 4 forbids "improving" the mapping by adding the
   * missing cascade, so it is recorded here and changed nowhere.
   */

  /**
   * [model/entity/Brand.cfc:L60]:
   *
   *     property name="attributeValues" singularname="attributeValue" cfc="AttributeValue"
   *              type="array" fieldtype="one-to-many" fkcolumn="brandID"
   *              cascade="all-delete-orphan" inverse="true";
   *
   * Typed against the narrow local {@link BrandAttributeValueAssociation} because the attribute
   * family is out of scope; see that interface for the full TR-5 rationale.
   */
  attributeValues: BrandAttributeValueAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L61]:
   *
   *     property name="products" singularname="product" cfc="Product" type="array"
   *              fieldtype="one-to-many" fkcolumn="brandID" inverse="true";
   *
   * THE ONE RELATIONSHIP THIS FILE'S AAP ROW NAMES — "Six persistent properties and the products
   * relationship" (§0.4.1.4). `Product` is in scope and imported by type only; the array is the
   * LIVE collection that `Product.setBrand`/`Product.removeBrand` mutate directly, so see {@link
   * Brand.getProducts} before touching it.
   */
  products: Product[] = [];

  /*
   * ============================================================================================
   * RELATED OBJECT PROPERTIES (many-to-many) — [model/entity/Brand.cfc:L63-L71]
   * ============================================================================================
   * THE "many-to-many - owner" SECTION IS EMPTY: [:L63-L64] is a banner with nothing under it, so
   * Brand owns no many-to-many relationship. All six below are INVERSE sides, each declaring
   * `inverse="true"` and naming a link table it does not own.
   *
   * FIVE OF THE SIX CARRY `hb_populateEnabled="false"`, AND THE SIXTH — `vendors` AT [:L70] — DOES
   * NOT. It sits between two flagged declarations in a block of six near-identical lines, which makes
   * it easy to read past. Brand is unique in the slice for carrying nine `hb_populateEnabled="false"`
   * declarations in total ([:L66], [:L67], [:L68], [:L69], [:L71] and the four audit properties at
   * [:L77-L80]) where the other five in-scope entities carry exactly four. The descriptor section
   * below encodes that count, and the `vendors` exception, as compile-checked structure rather than as
   * a comment somebody can forget.
   *
   * A legacy declaration quirk that changes nothing here: `type="array"` is present on [:L67], [:L69]
   * and [:L71] and absent on [:L66], [:L68] and [:L70]. Hibernate returns a collection either way, so
   * all six are modelled as arrays, which is what the legacy code observed at run time.
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
   *
   * THE DELIBERATE EXCEPTION: this declaration carries NO `hb_populateEnabled` attribute, so it
   * is populate-ENABLED, and it is the only one of the six that is. It sits between
   * `promotionQualifierExclusions` at [:L69] and `physicals` at [:L71], both of which are flagged —
   * an off-by-one that is trivially easy to get wrong when scanning six similar lines. It is
   * therefore NOT one of the nine populate-disabled properties, and the descriptor section below
   * enforces that with a compile-time exclusion rather than trusting this comment.
   */
  vendors: OutOfScopeAssociation[] = [];

  /**
   * [model/entity/Brand.cfc:L71] — `cfc="Physical"`, link table `SwPhysicalBrand`,
   * `fkcolumn="brandID"`, `inversejoincolumn="physicalID"`, `hb_populateEnabled="false"`.
   * Populate-disabled exclusion 5 of five.
   *
   * NOTE THE NAME, because `model/validation/Brand.json` does not use it: the declared property is
   * `physicals`, whereas the delete guard in that document names `physicalCounts` — a property no
   * entity in this folder declares. See the validation block below; no `physicalCounts` field is
   * invented here to make that rule resolve (S9).
   */
  physicals: OutOfScopeAssociation[] = [];

  /*
   * ============================================================================================
   * REMOTE PROPERTIES — [model/entity/Brand.cfc:L73-L74]
   * ============================================================================================
   */

  /**
   * [model/entity/Brand.cfc:L74] `property name="remoteID" ormtype="string"` — the identifier this
   * brand carries in whatever external system it was imported from.
   *
   * POPULATE-ENABLED, and worth saying so explicitly: it is declared immediately above the audit
   * block, all four members of which are flagged, and it carries no `hb_populateEnabled` attribute
   * of its own. `../base/AuditableEntity` records the same fact from the other direction, noting
   * that `remoteID` is deliberately not a member of the shared audit exclusion list.
   */
  declare remoteID?: string;

  /*
   * ============================================================================================
   * AUDIT PROPERTIES — [model/entity/Brand.cfc:L76-L80]
   * ============================================================================================
   * All four are declared `hb_populateEnabled="false"` and are therefore NEVER writable from
   * request data; only `applyPreInsertAudit`/`applyPreUpdateAudit` in `../base/AuditableEntity` may
   * write them. They are declared on Brand's OWN surface — this class implements `AuditableEntity`
   * structurally and extends nothing (§0.3.3) — and the four names are never re-listed by hand
   * anywhere in this file: the descriptor section derives them from the shared
   * `AUDIT_PROPERTY_NAMES` tuple.
   *
   * D-g — G6 TRANSLATION DECISION: TWO DIFFERENT REPRESENTATIONS OF ABSENCE, PRESERVED, NOT
   * HARMONISED. The framework overrode exactly two of the four getters, and only to keep a null out
   * of the caller's hands: `getCreatedDateTime()` [org/Hibachi/HibachiEntity.cfc:L291-L297] and
   * `getModifiedDateTime()` [:L299-L305] each return the EMPTY STRING when unset. The two account
   * getters have NO override anywhere in the repository, so their absence is genuine absence with
   * no sentinel. This file mirrors `../base/AuditableEntity` exactly: the fields are plainly
   * optional here, and the empty-string rendering for the two timestamps lives in that module's
   * `getCreatedDateTime`/`getModifiedDateTime` accessors, which return `Date | ''`. Collapsing the
   * two representations into one would be tidier and would change observable behaviour.
   *
   * WHY THE ACCOUNT FIELDS ARE `string`: the legacy declarations are `many-to-one` associations to
   * `cfc="Account"`, but the twenty-one `Account*` components are explicitly out of scope
   * (§0.2.2.1). No `Account` type is declared or imported; the field carries the 32-character
   * account IDENTIFIER (IR-6), which is what `src/adapters/mysql/rowMappers.ts` reads out of the
   * `createdByAccountID` and `modifiedByAccountID` columns.
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
   * ============================================================================================
   * NON-PERSISTENT PROPERTY METHODS — [model/entity/Brand.cfc:L83-L85]
   * ============================================================================================
   * INTENTIONALLY EMPTY, exactly as the legacy section is. Those three lines are a START banner, a
   * blank line and an END banner. Brand declares ZERO non-persistent properties, which is the whole
   * reason AAP §0.4.1.4 calls this port COMPLETE. Nothing is omitted here.
   * ============================================================================================
   */

  /*
   * ============================================================================================
   * BIDIRECTIONAL HELPER METHODS — [model/entity/Brand.cfc:L87-L155]
   * ============================================================================================
   */

  /**
   * Returns the LIVE `products` array, by reference.
   *
   * D-f — F2, AND THE MOST LOAD-BEARING LINE IN THIS FILE. This must never return a copy: not
   * `.slice()`, not a spread, not `ReadonlyArray`, not a defensive clone of any kind. The far side
   * of the relationship mutates the array it gets back:
   *
   *     [model/entity/Product.cfc:L662-L667]  setBrand()
   *         variables.brand = arguments.brand;
   *         if(isNew() or !arguments.brand.hasProduct( this )) {
   *             arrayAppend(arguments.brand.getProducts(), this);   // appends INTO the live array
   *         }
   *
   *     [model/entity/Product.cfc:L668-L677]  removeBrand()
   *         var index = arrayFind(arguments.brand.getProducts(), this);
   *         if(index > 0) {
   *             arrayDeleteAt(arguments.brand.getProducts(), index); // splices OUT of it
   *         }
   *
   * A defensive copy would turn BOTH of those into silent no-ops — no error, no exception, no
   * failing type check, just a relationship that never actually forms or never actually breaks. The
   * array is also eagerly initialised in its declaration, so this method can never return
   * `undefined`.
   *
   * TRACEABLE COVERAGE: [meta/tests/unit/entity/BrandTest.cfc:L58-L60] is
   * `defaults_are_correct() { assertEquals(variables.entity.getProducts(), []); }`, which is a FULL
   * OVERRIDE of the base assertion of the same name rather than an addition to it — which is
   * exactly why AAP §0.6.5.1 describes Brand's legacy coverage as "the overridden defaults
   * assertion plus THREE inherited". `new Brand().getProducts()` returning `[]` is therefore a hard
   * requirement of the one legacy test that exists for this entity.
   *
   * @returns The live products collection. Mutating the returned array mutates this brand.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * Whether a product is already in this brand's `products` collection.
   *
   * IR-1 — AN EXPLICITLY DECLARED SYNTHESIZED MEMBER. `hasProduct` has NO declaration anywhere in
   * `model/entity/Brand.cfc`; the CFML ORM fabricated a `has<singularName>()` member for every
   * collection property from the `singularname="product"` attribute at
   * [model/entity/Brand.cfc:L61]. (It is not one of the prefixes
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] dispatches either — that `onMissingMethod` handles
   * `hasUniqueOrNull*`, `hasUnique*`, `hasAny*` and the `get*` family, and would have thrown for a
   * plain `hasProduct`.) TypeScript under `strict` has no such facility and TR-3 would forbid one,
   * so the member becomes this declaration. It is MANDATORY rather than optional: without it
   * [model/entity/Product.cfc:L664] `if(isNew() or !arguments.brand.hasProduct( this ))` cannot
   * compile, and the same generated member is relied on identically by
   * [model/entity/Vendor.cfc:L154], [model/entity/Physical.cfc:L160],
   * [model/entity/PromotionQualifier.cfc:L201], [model/entity/PromotionReward.cfc:L259] and
   * [model/entity/PriceGroupRate.cfc:L220].
   *
   * D-e — G6 TRANSLATION DECISION: MEMBERSHIP IS BY OBJECT IDENTITY. `Array.prototype.includes`
   *     uses
   * SameValueZero, which for objects is reference equality — the faithful analogue of the legacy
   * `arrayFind(arguments.brand.getProducts(), this)` at [model/entity/Product.cfc:L672], which
   * locates THE SAME INSTANCE rather than an equal-by-identifier one, and of Hibernate's own
   * collection `contains`, since no in-scope entity overrides equality. No comparison by
   * `productID` is introduced: that would be a different predicate, it would answer differently for
   * two distinct transient instances that share an identifier, and it would be an invention (S9).
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
   *     public void function addAttributeValue(required any attributeValue) {
   *         arguments.attributeValue.setBrand( this );
   *     }
   *
   * A PURE DELEGATION. Brand does not touch its own `attributeValues` array: the far side owns the
   * foreign key (`fkcolumn="brandID"` on [model/entity/AttributeValue.cfc:L66]) and its `setBrand`
   * appends into this brand's collection, exactly as `Product.setBrand` does for `products`.
   * Porting this as a local `push` would put the same append in two places and change which side of
   * the relationship is authoritative.
   *
   * The parameter is typed against the narrow local {@link BrandAttributeValueAssociation} rather
   * than an `AttributeValue` class, because the attribute family is out of scope — see that
   * interface for the TR-5 rationale and its `TODO(boundary)` flag. The member itself is NOT
   * dropped, which is the point of TR-5: a boundary is crossed through a declared contract, never
   * by deleting the member.
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
   *     public void function removeAttributeValue(required any attributeValue) {
   *         arguments.attributeValue.removeBrand( this );
   *     }
   *
   * A pure delegation, for the same reason as {@link Brand.addAttributeValue}.
   *
   * @param attributeValue - The attribute value to disassociate from this brand.
   */
  removeAttributeValue(attributeValue: BrandAttributeValueAssociation): void {
    attributeValue.removeBrand(this);
  }

  /**
   * Adds a product to this brand — the port of [model/entity/Brand.cfc:L98-L100]:
   *
   *     public void function addProduct(required any product) {
   *        arguments.product.setBrand(this);
   *     }
   *
   * A PURE DELEGATION, AND THE DIRECTION IS THE BEHAVIOUR. Brand never appends to its own
   * `products`
   * array; it hands itself to the product, whose `setBrand` at [model/entity/Product.cfc:L662-L667]
   * assigns the back-reference AND appends into `brand.getProducts()` — guarded by
   * `isNew() or !hasProduct(this)` so an existing product is not added twice. Reimplementing the
   * append here would duplicate that guard, and duplicating it is how the two sides drift.
   *
   * @param product - The product to assign to this brand.
   */
  addProduct(product: Product): void {
    product.setBrand(this);
  }

  /**
   * Removes a product from this brand — the port of [model/entity/Brand.cfc:L101-L103]:
   *
   *     public void function removeProduct(required any product) {
   *        arguments.Product.removeBrand(this);
   *     }
   *
   * D-c — THE CAPITAL-P CASING QUIRK AT [:L102]. The legacy body reads `arguments.Product` with an
   * upper-case P while the argument declared one line above at [:L101] is `product`, and the sibling
   * `addProduct` at [:L99] uses lower case. CFML's `arguments` scope is case-INSENSITIVE, so the
   * mismatch resolved to the same argument and the method worked; TypeScript is case-SENSITIVE, so a
   * literal transliteration would reference an identifier that does not exist.
   *
   * THE DECLARED LOWER-CASE NAME IS USED. This is a translation decision, not a repair: nothing
   * about the observable behaviour changes, because both spellings always denoted the same value.
   * §0.8.2 Guideline 4 forbids "enhancing" business logic, and this changes none — it records a
   * language-level difference and picks the only spelling that compiles. The quirk is documented
   * rather than silently normalised so that a reviewer diffing the two files sees why the letter
   * changed. It is also NOT one of the twenty-one carried defects: AAP §0.6.7 catalogues D1-D21, the
   * port's register is closed at D1-D24, and this file introduces no new defect identifier (S7).
   *
   * A pure delegation, like its counterpart: [model/entity/Product.cfc:L668-L677] `removeBrand`
   * splices this product out of the live `products` array and then clears its own back-reference.
   *
   * @param product - The product to disassociate from this brand.
   */
  removeProduct(product: Product): void {
    product.removeBrand(this);
  }

  /*
   * ============================================================================================
   * THE TWELVE PROMOTION / QUALIFIER / VENDOR / PHYSICAL HELPERS — DOCUMENTED AND OMITTED
   * ============================================================================================
   * [model/entity/Brand.cfc:L105-L153] declares twelve further bidirectional helpers. None is ported,
   * and this is the record of that decision so the omission reads as deliberate:
   *
   *   addPromotionReward             [:L106-L108]  -> promotionReward.addBrand(this)
   *   removePromotionReward          [:L110-L112]  -> promotionReward.removeBrand(this)
   *   addPromotionRewardExclusion    [:L115-L117]  -> promotionReward.addExcludedBrand(this)
   *   removePromotionRewardExclusion [:L118-L120]  -> promotionReward.removeExcludedBrand(this)
   *   addPromotionQualifier          [:L123-L125]  -> promotionQualifier.addBrand(this)
   *   removePromotionQualifier       [:L127-L129]  -> promotionQualifier.removeBrand(this)
   *   addPromotionQualifierExclusion [:L132-L134]  -> promotionQualifier.addExcludedBrand(this)
   *   removePromotionQualifierExcl.  [:L135-L137]  -> promotionQualifier.removeExcludedBrand(this)
   *   addVendor                      [:L140-L142]  -> vendor.addBrand(this)
   *   removeVendor                   [:L143-L145]  -> vendor.removeBrand(this)
   *   addPhysical                    [:L148-L150]  -> physical.addBrand(this)
   *   removePhysical                 [:L151-L153]  -> physical.removeBrand(this)
   *
   * THREE INDEPENDENT REASONS. Every collaborator family — `Promotion*`, `Vendor*`, `Physical*` — is
   * excluded by AAP §0.2.2.1, so implementing the twelve would mean declaring `addBrand`,
   * `removeBrand`, `addExcludedBrand` and `removeExcludedBrand` contracts for three excluded families,
   * which S9 forbids. Nothing in scope calls any of them: the identically named methods at
   * [model/entity/Product.cfc:L732, L772, L780] and [model/entity/Sku.cfc:L672, L744] are those
   * entities' own helpers, not calls into Brand. And the AAP row for this file names only the six
   * persistent properties and the products relationship, so adding twelve members it does not name
   * would be scope creep.
   *
   * Brand's exclusion helpers are internally consistent — both exclusion pairs match their
   * counterparts ([:L116] with [:L119], [:L133] with [:L136]) — so there is no add/remove mismatch
   * defect on this entity and AAP §0.6.7 carries no Brand entry.
   *
   * The six collections these helpers would have maintained ARE still declared as fields above, for
   * descriptor completeness and so that the nine `hb_populateEnabled="false"` declarations can be
   * recorded faithfully.
   * ============================================================================================
   */

  /**
   * Whether this brand has never been persisted.
   *
   * F21 — THE ONE SANCTIONED FRAMEWORK-SHAPED MEMBER ON THIS CLASS, and it earns the exemption by
   * being a pure derived predicate over this class's own primary identifier: no data access, no
   * collaborator, no ambient scope, nothing to inject. It reproduces the legacy semantic of
   * `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571-L576], which returns true exactly when
   * `getPrimaryIDValue() == ""` — and for Brand the primary identifier is `brandID`
   * [model/entity/Brand.cfc:L52], whose `unsavedvalue=""` is the value this test compares against.
   *
   * It satisfies inherited base assertion 4 directly:
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts both `entity.isNew()` and
   * `!len(entity.getPrimaryIDValue())` on a freshly created instance, and `new Brand()` makes both
   * true because `brandID` initialises to `''`.
   *
   * @returns `true` while `brandID` still holds the unsaved value.
   */
  isNew(): boolean {
    return this.brandID === '';
  }

  /* ============================================================================================
   * THE MANAGED-ENTITY CONTRACT — [org/Hibachi/**], INHERITED IN CFML, DECLARED HERE (IR-1 / TR-3)
   * ============================================================================================
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain, and which `src/validation/Validator.ts` and
   * `src/ports/UniquePropertyPort.ts` both require BY NAME. Neither contract can be satisfied by a
   * plain data class, which is why they are declared rather than assumed:
   * `ValidationSubject` reads `getClassName` and `hasProperty`, and `UniquePropertyEntity` reads
   * `getEntityName`, `getPrimaryIDValue`, `getPrimaryIDPropertyName`, `getPropertyMetaData` and
   * `getValueByPropertyIdentifier` in exactly the order [org/Hibachi/HibachiDAO.cfc:L134-L138]
   * reads them.
   *
   * `src/domain/base/AuditableEntity.ts` owns the shared behaviour and every word of the rationale —
   * including why there is no base class, why the member names are not modernised, and which
   * inherited members are deliberately NOT ported. Each member below is the thin delegation plus the
   * constant only this entity can state.
   *
   * ⭐ THIS IS THE ROOT FIX FOR THE `Brand` SAVE PATH. Without these members a `Brand` is a plain
   * data class that satisfies neither `ValidationSubject` nor `UniquePropertyEntity`, so the save
   * path could only type-check by asserting the mismatch away. With them the assertion is
   * unnecessary and `src/adapters/mysql/rowMappers.ts` hydrates a genuinely valid validation
   * subject.
   * ============================================================================================ */

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
   * @returns The mapped ORM entity name, NOT the physical table name.
   */
  getEntityName(): string {
    return BRAND_ENTITY_NAME;
  }

  /**
   * `brandID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP 0.7.3 S3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return BRAND_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's VALUE — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * ⚠️ RETURNS `''` FOR AN UNSAVED INSTANCE, because [model/entity/Brand.cfc:L52] declares
   * `unsavedvalue=""` and this class initialises the field to `''`. That is what makes the
   * self-exclusion term of the uniqueness query a NO-OP on insert — an observation AAP 0.4.1.7
   * requires be reproduced rather than tidied away, and which `src/ports/UniquePropertyPort.ts`
   * carries as a `TODO(parity)`. It is also the value
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts on a fresh instance.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.brandID;
  }

  /**
   * Whether this entity DECLARES the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * ⚠️ A FALSE ANSWER SILENTLY SKIPS A VALIDATION RULE rather than failing it
   * [org/Hibachi/HibachiValidationService.cfc:L171]. See BRAND_DECLARED_PROPERTIES, whose
   * exhaustiveness is compile-checked precisely because of that.
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(BRAND_DECLARED_PROPERTIES, propertyIdentifier);
  }

  /**
   * Resolves a declared property's metadata, RAISING for an undeclared name —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747], whose present-key branch is at [:L741-L743] and
   * whose throw is at [:L746]. The non-optional return type is faithful to that declaration.
   *
   * @param propertyName - The name to resolve.
   * @returns The metadata for that property.
   * @throws DomainError - When no property of that name is declared. Withheld from every response
   *   by the deny-by-default presentation, because it signals a fault in the port rather than
   *   anything a caller can provoke.
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData {
    return requireDeclaredPropertyMetaData(
      BRAND_DECLARED_PROPERTIES,
      propertyName,
      BRAND_CLASS_NAME,
    );
  }

  /**
   * Reads a value by property identifier, walking a path delimited by EITHER `.` OR `_` —
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
   * The property whose value represents this entity — the FRAMEWORK DEFAULT at
   * [org/Hibachi/HibachiEntity.cfc:L74-L88], resolved by naming convention.
   *
   * ⭐ F22 — DECLARED BECAUSE THE LEGACY INHERITED IT, NOT BECAUSE THE LEGACY OVERRODE IT.
   * `model/entity/Brand.cfc:L157-L159` is an empty override section, so Brand overrode neither this
   * member nor {@link Brand.getSimpleRepresentation} and both resolved through inheritance. IR-1
   * requires an inherited member the slice depends on to be declared explicitly, and the dependency
   * is real: `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58` asserts against it, which
   * AAP §0.6.5.1 counts as traceable legacy coverage for this entity. Before this declaration existed
   * the assertion could only be re-expressed against a test-local reimplementation of the convention,
   * which is a documentary claim rather than a traceable one — the gap review finding F22 named.
   *
   * ⚠️ THE CONVENTION MATCHES CASE-INSENSITIVELY. `Brand` + `name` gives `Brandname`, which matches
   * the declared `brandName` only because [:L81] compares with CFML `==`.
   * `resolveSimpleRepresentationPropertyName` carries the full reasoning and the contrast with the
   * case-SENSITIVE `listFind` rule in `populate.ts`.
   *
   * DISTINCT FROM `Product.ts` AND `Sku.ts`, which return a hard-coded name because their legacy
   * classes override this member outright. Brand resolves rather than asserts, because resolution is
   * what it inherited.
   *
   * @returns `'brandName'` for this entity, resolved from the declared property set.
   * @throws DomainError when no declared property satisfies the convention — unreachable for Brand.
   */
  getSimpleRepresentationPropertyName(): string {
    return resolveSimpleRepresentationPropertyName(BRAND_CLASS_NAME, BRAND_DECLARED_PROPERTIES);
  }

  /**
   * A simple representation of this entity — the FRAMEWORK DEFAULT at
   * [org/Hibachi/HibachiEntity.cfc:L59-L71].
   *
   * Reads the property {@link Brand.getSimpleRepresentationPropertyName} names and returns it when it
   * is a simple value, otherwise the legacy BLANK FALLTHROUGH at [:L70].
   *
   * ⚠️ A FRESH Brand REPRESENTS AS `''`, AND THAT IS THE CONTRACT. `brandName` is nullable
   * [model/entity/Brand.cfc:L56], so a new instance takes [:L70] and yields the empty string — a
   * simple value, which is exactly why the inherited legacy assertion passes on a new instance.
   * `undefined` would be the natural TypeScript instinct here and would break it.
   *
   * DISTINCT FROM `ProductType.ts`, which overrides the representation itself to build a `&raquo;`
   * separated ancestor path and can legitimately answer `undefined`. Brand inherits the default and
   * therefore cannot.
   *
   * @returns The brand name when set, otherwise the legacy blank fallthrough.
   */
  getSimpleRepresentation(): string {
    return readSimpleRepresentation(this, this.getSimpleRepresentationPropertyName());
  }
}

/* ================================================================================================
 * [model/validation/Brand.json] — DOCUMENTED HERE, IMPLEMENTED IN THE VALIDATION LAYER
 * ================================================================================================
 * `src/validation/rules/brand.rules.ts` owns these five rules and `src/validation/Validator.ts`
 * evaluates them; NOT ONE is implemented, evaluated or enforced in this file. They are recorded
 * because they are behaviour (IR-4 — the declarative rule sets are part of the observable contract,
 * not configuration) and because a reader of this entity needs to know which constraints exist:
 *
 *   PROPERTY         CONTEXT   RULE
 *   brandName        save      required
 *   brandWebsite     save      dataType: "url"   <- the LIVE url constraint; see the field's note,
 *                                                   where the dead `hb_formatType` path is explained
 *   urlTitle         save      required AND unique
 *   products         delete    maxCollection: 0  <- a brand with products cannot be deleted; hence no
 *                                                   cascade on `products` at [:L61]
 *   physicalCounts   delete    maxCollection: 0
 *
 * There are exactly two contexts across the whole folder, `save` and `delete`.
 *
 * ⚠️ `physicalCounts` IS A PHANTOM PROPERTY, AND IT IS NOT INVENTED HERE (S9). It is referenced by
 * all three validation documents in this folder and DECLARED BY NONE of the three entities: Brand
 * declares `physicals` at [model/entity/Brand.cfc:L71], not `physicalCounts`, and a grep for
 * `physicalCounts` across `model/entity/Brand.cfc` returns ZERO hits. This is a genuine
 * undeclared-property validation reference in the legacy source. NO `physicalCounts` field is added
 * to this class to make the rule resolve: fabricating a property so a rule stops dangling would
 * invent schema the legacy system does not have, and it would put a phantom into
 * `src/adapters/mysql/rowMappers.ts`'s column mapping. The finding is recorded and left exactly as
 * it is — preserve and annotate, do not repair (S7). It is likewise NOT assigned a defect
 * identifier: §0.6.7 catalogues D1-D21 and the port's register is closed at D1-D24.
 *
 * UNIQUENESS IS NOT AN ENTITY CONCERN. The `urlTitle` unique rule is enforced by the application-side
 * existence query of IR-5 — `isUniqueProperty()` [org/Hibachi/HibachiDAO.cfc:L130-L146], ported to
 * `src/adapters/mysql/UniquePropertyChecker.ts` behind `UniquePropertyPort` — in addition to the
 * database column constraint. Neither runs here.
 * ================================================================================================
 */

/* ================================================================================================
 * THE TRACEABLE TEST CONTRACT — WHERE EACH LEGACY ASSERTION LANDS
 * ================================================================================================
 * `test/domain/Brand.test.ts` is TRACEABLE to [meta/tests/unit/entity/BrandTest.cfc] and is owned
 * by another file. This note exists so its author is not left guessing which assertions this class
 * can satisfy and which it deliberately cannot, because F22 forbids declaring the framework members
 * three of the four legacy assertions call.
 *
 * The legacy fixture is [meta/tests/unit/entity/BrandTest.cfc:L52-L56]:
 *
 *     public void function setUp() {
 *         super.setup();
 *         variables.entity = request.slatwallScope.getService("brandService").newBrand();
 *     }
 *
 * `newBrand()` is an IR-1 synthesized service member — fabricated by
 * [org/Hibachi/HibachiService.cfc:L255-L281]'s `new*` prefix dispatch, and enumerated in AAP
 * §0.4.2.5 — so it belongs to `src/services/BrandService.ts`, never to this class. In the target
 * the fixture is simply `new Brand()`, which is why the constructor takes no arguments and does no
 * work (S6).
 *
 *   ASSERTION 1  validate_as_save_for_a_new_instance_doesnt_pass
 *                [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54]
 *                `entity.validate(context="save")` then `assert(entity.hasErrors())`.
 *                LANDS ON THE VALIDATION LAYER. `validate` and `hasErrors` are framework members
 *                that
 *                F22 forbids on this class; `src/validation/Validator.ts` evaluates
 *                `src/validation/rules/brand.rules.ts` against a Brand instance and reports errors.
 *                It passes for a new instance because `brandName` and `urlTitle` are both required
 *                in the `save` context and both are absent on `new Brand()`.
 *
 *   ASSERTION 2  simple_representation_exists_and_is_simple  [:L56-L58]
 *                `assert(isSimpleValue(entity.getSimpleRepresentation()))`.
 *                ⭐ LANDS ON THIS CLASS. Brand OVERRODE neither `getSimpleRepresentation()`
 *                [org/Hibachi/HibachiEntity.cfc:L59] nor `getSimpleRepresentationPropertyName()`
 *                [:L74] — its "Overridden Methods" section is empty — so it INHERITED both, and
 *                IR-1 turns an inherited member the slice depends on into an explicit declaration.
 *                Both are declared above: the naming convention resolves `brandName`, and an unset
 *                name falls through to the blank default at [:L70], which is precisely why the
 *                legacy `isSimpleValue` assertion passes on a new instance. Review finding F22
 *                corrected the earlier position that this assertion did not land here.
 *
 *   ASSERTION 3  has_primary_id_property_name  [:L60-L62]
 *                `assert(len(entity.getPrimaryIDPropertyName()))`.
 *                ⭐ LANDS ON A REAL MEMBER. `getPrimaryIDPropertyName()`
 *                [org/Hibachi/HibachiEntity.cfc:L249] is one of the seven `ManagedEntity` members
 *                this class declares under IR-1; an earlier revision recorded it as forbidden and
 *                resolved the assertion against the descriptor set instead, which F05 corrected.
 *                The descriptor set still records the same fact structurally: Brand's
 *                primary identifier property is `brandID`, declared `fieldtype="id"` at
 *                [model/entity/Brand.cfc:L52], it is a member of {@link BrandPropertyName}, and
 *                it is deliberately absent from the descriptor list for the reason at D-h below.
 *
 *   ASSERTION 4  defaults_are_correct
 *                OVERRIDDEN FOR BRAND. [meta/tests/unit/entity/BrandTest.cfc:L58-L60] REPLACES the
 *                base version at [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]
 *                entirely — CFML method overriding, not augmentation — which is why AAP §0.6.5.1
 *                counts Brand's coverage as the overridden defaults assertion plus THREE inherited
 *                rather than four. Both versions are satisfiable here: the override's
 *                `assertEquals(entity.getProducts(), [])` by the eager `[]` initialiser, and the
 *                base version's `assert(entity.isNew())` and
 *                `assert(!len(entity.getPrimaryIDValue()))` by
 *                {@link Brand.isNew} and `brandID === ''`.
 * ================================================================================================
 */

/* ================================================================================================
 * THE POPULATION CONTRACT (R-B) — DECLARED DESCRIPTORS, NOT RUNTIME METADATA REFLECTION
 * ================================================================================================
 * The legacy `populate()` reflected over component metadata at runtime and assigned through
 * dynamically composed setter names. `../base/populate` replaces all of it with a declared,
 * compile-checked descriptor model, and TR-3 would forbid a reflective equivalent even if
 * TypeScript offered one. Two consequences for this file:
 *
 *   - `Brand.ts` DECLARES NO `populate()` METHOD. `../base/populate` owns population, `F22` forbids
 *     the member, and the local override at [model/entity/HibachiEntity.cfc:L56-L97] that added
 *     attribute-value handling is flagged there as a declared TR-5 boundary omission.
 *   - `Brand.ts` EXPORTS ITS DESCRIPTOR SET, in the exact shape `PropertyDescriptorSet` declares.
 * ================================================================================================
 */

/**
 * Every property name `model/entity/Brand.cfc` declares — all nineteen, in declaration order.
 *
 * This union is the compile-checked property-name space for Brand.
 * `PopulationTarget<TPropertyName>` in `../base/populate` is keyed by it, so an indexed write
 * during population can only ever target a name declared here and a typo is a compile error rather
 * than a silently created property. The audit four are contributed by `AuditPropertyName` rather
 * than re-typed, so this union cannot drift from `../base/AuditableEntity`.
 *
 * It is deliberately the COMPLETE legacy surface, including the primary identifier and the three
 * properties the descriptor list below omits: the name space is documentation of what the entity
 * declares, whereas the descriptor list is the narrower statement of what population may act on.
 */
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

/* ================================================================================================
 * THE MANAGED-ENTITY CONSTANTS — WHAT ONLY THIS ENTITY CAN STATE
 * ================================================================================================
 * `src/domain/base/AuditableEntity.ts` holds the shared managed-entity contract and every word of
 * its rationale. Three facts cannot be shared because they differ per entity, and the legacy
 * resolved all three at runtime — two by reflecting over live component metadata and one through the
 * DI/1 service locator. TR-3 and AAP 0.7.3 S3 replace all three with declarations.
 * ================================================================================================ */

/**
 * The bare class name — the value [org/Hibachi/HibachiObject.cfc:L135-L137] derives by taking the
 * last dot-delimited segment of the component's fully qualified name.
 *
 * ⚠️ NOT the same as {@link BRAND_ENTITY_NAME}: this one carries no `Slatwall` prefix. It is
 * interpolated into every validation message
 * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216] and into the property-metadata
 * failure [org/Hibachi/HibachiTransient.cfc:L746], so a prefixed value here would change observable
 * message text.
 */
export const BRAND_CLASS_NAME = 'Brand';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/Brand.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 *
 * ⚠️ THIS IS THE LOGICAL ENTITY NAME, NOT THE PHYSICAL `Sw*` TABLE NAME. The legacy uniqueness
 * statement [org/Hibachi/HibachiDAO.cfc:L140] is expressed over the mapped object graph, so the
 * prefixed form is correct there and is not a defect to correct; translating it to a table is the
 * adapter's responsibility.
 */
export const BRAND_ENTITY_NAME = 'SlatwallBrand';

/**
 * The name of the primary identifier property — [model/entity/Brand.cfc:L52], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 *
 * The legacy resolved this name through `getService("hibachiService")`
 * [org/Hibachi/HibachiEntity.cfc:L249-L251]. Declaring it removes the service locator AAP 0.7.3 S3
 * forbids, and it is what makes the value safe to place in identifier position after the adapter
 * validates it: the name comes from entity metadata, never from caller input.
 */
export const BRAND_PRIMARY_ID_PROPERTY_NAME = 'brandID';

/**
 * Every property this entity DECLARES, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 *
 * ⚠️ THE `DeclaredPropertyNameSet<BrandPropertyName>` ANNOTATION IS THE POINT, NOT DECORATION. It checks this
 * set against the entity's property-name union in BOTH directions: a MISSING name fails to compile
 * ("Property 'x' is missing in type"), and an INVENTED one fails to compile too (the object is not
 * assignable). Both directions matter. A missing name would make `hasProperty` answer false, and
 * [org/Hibachi/HibachiValidationService.cfc:L171] SILENTLY SKIPS a rule whose property is absent —
 * so a validation rule would stop running with no error anywhere in the port. An invented name
 * would START running a rule the legacy never ran.
 *
 * ⚠️⚠️ `physicalCounts` IS ABSENT, AND ITS ABSENCE IS THE FAITHFUL ANSWER RATHER THAN AN OVERSIGHT.
 * `model/validation/Brand.json:L6` declares a delete guard against `physicalCounts`, but
 * [model/entity/Brand.cfc:L71] declares that collection as `physicals` and NO property named
 * `physicalCounts` exists anywhere on the entity. The legacy `hasProperty('physicalCounts')`
 * therefore answers FALSE and [org/Hibachi/HibachiValidationService.cfc:L171] SKIPS the rule — the
 * guard has never run in the legacy system. TODO(parity): carried as observed and intentionally NOT
 * repaired. Adding the name here to "make the rule work" would ENABLE a guard the legacy never
 * enforced, which AAP 0.8.2 Guidelines 2 and 4 forbid and AAP 0.7.3 S7 requires be annotated
 * instead.
 *
 * ⚠️ THIS IS A STATEMENT ABOUT WHAT THE LEGACY ENTITY DECLARES, NOT ABOUT WHAT THIS PORT
 * IMPLEMENTS, and the two differ deliberately. AAP 0.2.2.6 excludes the pricing, promotion,
 * inventory and currency-derived calculated members from the port because they reach exclusively
 * into out-of-scope services — yet the legacy still DECLARES them, so `hasProperty` must still
 * answer true for them exactly as the legacy does. Trimming this set to the implemented surface
 * would be the "missing name" failure above dressed up as tidiness.
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
 * Brand's frozen metadata declaration — the runtime answer to the seven framework introspection
 * members this class deliberately does not declare.
 *
 * See {@link EntityMetadataDeclaration} for what each member ports and why the surface is composed
 * onto an instance by `../base/manageEntity` rather than hand-written here. This constant is the
 * ONLY place in this module where the class name and the ORM entity name appear as VALUES rather
 * than as prose, and {@link BRAND_PROPERTY_DESCRIPTORS} reads its `className` from here so the
 * literal is written once.
 *
 * NINETEEN KEYS, WHICH IS EVERY PROPERTY [model/entity/Brand.cfc] DECLARES. The fifteen at
 * [`:L52-L57`], [`:L60`], [`:L63`], [`:L66-L71`] and [`:L74`] plus the four audit properties at
 * [`:L77-L80`]. `declaredNonFieldProperties` is deliberately ABSENT rather than empty: this entity
 * declares NO `persistent="false"` property at all — measured, not assumed — so its declared set
 * and its field set coincide exactly, and `hasProperty` answers identically to the legacy predicate
 * for every name.
 *
 * ⚠️ `physicalCounts` IS NOT HERE, AND THAT ABSENCE IS LOAD-BEARING. `model/validation/Brand.json`
 * does not name it, but the sibling product and SKU documents do while neither entity declares it,
 * and `./Product.ts` records that this module established the compile-checked idiom for that
 * inertness. Adding a name to this record activates every rule that names it.
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
 * Brand's five OWN `hb_populateEnabled="false"` relationship declarations — the ones that make this
 * entity unique in the slice.
 *
 * [model/entity/Brand.cfc:L66], [:L67], [:L68], [:L69] and [:L71]. Together with the four audit
 * properties at [:L77-L80] they are the NINE populate-disabled properties Brand carries, where the
 * other five in-scope entities carry exactly four. They are Brand-specific and therefore belong
 * here rather than in the shared `AUDIT_PROPERTY_NAMES` list, which `../base/AuditableEntity`
 * states explicitly in its own note on that constant.
 *
 * THE `satisfies` CLAUSE IS THE POINT, NOT DECORATION. `Exclude<BrandPropertyName,
 * AuditPropertyName | 'vendors'>` makes two invariants COMPILE-CHECKED rather than commented:
 *
 *   1. NO AUDIT NAME CAN BE ADDED HERE. The audit four are excluded from the permitted union, so
 *      duplicating one of them into this Brand-specific list is a compile error. The audit
 *      exclusion is derived from the shared tuple exactly once, further down.
 *   2. `vendors` CAN NEVER BE ADDED HERE. [model/entity/Brand.cfc:L70] carries no
 *      `hb_populateEnabled` attribute — it is the single populate-ENABLED many-to-many-inverse
 *      relationship on Brand, sitting between two flagged declarations — and this clause turns that
 *      off-by-one hazard into a compile error instead of a comment somebody has to remember.
 *
 * `Object.freeze` adds run-time immutability so a consumer cannot mutate the shared list; `as
 * const` preserves the literal tuple so the union type below can be derived from it. Both,
 * deliberately, because either alone leaves a gap.
 */
export const BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES = Object.freeze([
  'promotionRewards',
  'promotionRewardExclusions',
  'promotionQualifiers',
  'promotionQualifierExclusions',
  'physicals',
] as const) satisfies readonly Exclude<BrandPropertyName, AuditPropertyName | 'vendors'>[];

/**
 * The name of one of Brand's five own populate-disabled relationship properties.
 *
 * Derived by indexed access over the frozen tuple rather than written out a second time, so the
 * type and the runtime list cannot drift apart.
 */
export type BrandRelationshipPopulateDisabledPropertyName =
  (typeof BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES)[number];

/**
 * Whether a property of Brand is populate-disabled — the union of the shared audit exclusion and
 * Brand's five own relationship exclusions, and therefore the single source of truth for the NINE.
 *
 * WHY THIS IS EXPORTED. Three consumers need the fact and none of them should re-derive it:
 * `../base/populate` enforces the audit half structurally and the Brand half through the
 * descriptors
 * below; `src/adapters/mysql/rowMappers.ts` must never write any of the nine from request data; and
 * the traceable Brand test can assert the count is nine and that `vendors` is not among them
 * without hand-copying names out of the legacy source.
 *
 * The audit half delegates to `isAuditPropertyName` from `../base/AuditableEntity` rather than
 * re-listing `createdDateTime`, `createdByAccount`, `modifiedDateTime` and `modifiedByAccount`.
 * Those four strings appear NOWHERE in this file outside their own field declarations and their
 * JSDoc: the shared tuple is the authority, exactly as the governing instruction requires.
 *
 * The parameter is `string`, not `BrandPropertyName`, because a caller iterating incoming payload
 * keys has strings in hand — the same reason `isAuditPropertyName` takes one.
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
 *
 * ORDER IS PRESERVED BECAUSE IT IS OBSERVABLE. `../base/populate` iterates DECLARED PROPERTIES
 * rather than payload keys, so declaration order is population order.
 *
 * NO `notNull` ON ANY OF THEM, WHICH IS THE WHOLE STORY FOR BLANK VALUES. `notNull` occurs exactly
 * once in the in-scope slice — [model/entity/Product.cfc:L55] — so for every property here a blank
 * incoming value takes the DELETE arm rather than assigning `''`. `populateArray` and `fileUpload`
 * are likewise omitted from every descriptor because `hb_populateArray` and `hb_fileUpload` occur
 * ZERO times in `model/entity/Brand.cfc`; declaring either would invent metadata (S9).
 *
 * D-h — THE PRIMARY IDENTIFIER IS DELIBERATELY ABSENT. `brandID` [model/entity/Brand.cfc:L52]
 *     declares
 * `fieldtype="id"`, and NO populate branch admits it: BRANCH 1 and BRANCH 2 require the `fieldtype`
 * attribute to be absent or `"column"` [org/Hibachi/HibachiTransient.cfc:L193, :L216], BRANCH 3
 * requires `"many-to-one"` [:L221], and BRANCHES 4 and 5 require `"one-to-many"` or
 * `"many-to-many"` [:L273, :L310]. An `id` field matched none of them, so the legacy `populate()`
 * NEVER wrote a primary key from request data. Omitting it here reproduces that exactly, and it has
 * a second, concrete benefit: `brandID` is the one required, non-optional field on the class, and a
 * blank payload value reaching BRANCH 1 would `delete` it and break {@link Brand.isNew}. Identifier
 * assignment belongs to the persistence layer (IR-6).
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
 * D-i — G6 TRANSLATION DECISION: A POPULATE-DISABLED PROPERTY DECLARES NO RELATIONSHIP MACHINERY.
 *
 * The nine descriptors generated below carry `name` and `populateEnabled: false` and NOTHING ELSE —
 * no `kind`, no loader, no add, no remove, no collection reader, no identifier reader. Five of them
 * are `many-to-many` in the legacy mapping and two are `many-to-one`, so the omission needs
 * justification rather than assumption. There are two reasons, and both are decisive:
 *
 *   1. THE KIND IS NEVER CONSULTED FOR THEM. `../base/populate`'s loop applies its gates in a fixed
 *      order: the structural audit exclusion first, then the payload-key test, then
 *      `populateEnabled === false`, then authorisation — and ONLY THEN does it dispatch on `kind`.
 *      A populate-disabled property therefore exits the loop before any kind-specific member could
 *      be read. Declaring a `kind` would change nothing observable.
 *   2. DECLARING ONE WOULD FORCE THIS FILE TO INVENT AN OUT-OF-SCOPE SURFACE. A `many-to-many`
 *      descriptor obliges its author to supply `loader`, `addRelated`, `removeRelated`,
 *      `readRelated` and `readRelatedPrimaryId` for the related type. For `PromotionReward`,
 *      `PromotionQualifier` and `Physical` that means implementing the very twelve bidirectional
 *      helpers AAP §0.4.1.4 directs this port to document and omit, against three families §0.2.2.1
 *      excludes outright — which S9 forbids. For the two audit account properties it would mean
 *      declaring an `Account`
 *      type, and the twenty-one `Account*` components are excluded too; `../base/AuditableEntity`
 *      already settles that by typing both fields as the account IDENTIFIER string.
 *
 * The full legacy metadata for all nine — `fieldtype`, `linktable`, `fkcolumn`, `inversejoincolumn`
 * and `cfc` — is recorded on the field declarations above, so nothing is lost by not encoding it in
 * a descriptor that would never read it.
 */

/**
 * The four audit properties as populate-disabled descriptors, GENERATED from the shared tuple.
 *
 * The four name strings are never written by hand here: `AUDIT_PROPERTY_NAMES` from
 * `../base/AuditableEntity` is the authority, so this list cannot drift from it and adding a fifth
 * audit property there would extend this list automatically.
 *
 * BELT AND BRACES, DELIBERATELY. `../base/populate` ALREADY excludes these four structurally, ahead
 * of every other check, by testing `isAuditPropertyName`. Marking them here as well is not
 * redundancy for its own sake: the descriptor set is also the faithful record of the legacy
 * DECLARATION, and
 * [model/entity/Brand.cfc:L77-L80] really does carry `hb_populateEnabled="false"` on all four. A
 * reader auditing this file against the legacy source must be able to count nine flags and find
 * nine.
 */
const BRAND_AUDIT_PROPERTY_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Brand,
  AuditPropertyName
>[] = AUDIT_PROPERTY_NAMES.map<PopulatePropertyDescriptor<Brand, AuditPropertyName>>(
  (auditPropertyName) => ({ name: auditPropertyName, populateEnabled: false }),
);

/**
 * Brand's five own relationship exclusions as populate-disabled descriptors, GENERATED from
 * {@link BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES} so that each name is written exactly
 * once in this file.
 *
 * The tuple's order is the legacy declaration order — [model/entity/Brand.cfc:L66], [:L67], [:L68],
 * [:L69], then [:L71] — and because `vendors` at [:L70] is omitted from the descriptor list
 * entirely (see D-j), placing this group between the products relationship and `remoteID` keeps the
 * whole `properties` array in exact source order.
 */
const BRAND_RELATIONSHIP_POPULATE_DISABLED_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Brand,
  BrandRelationshipPopulateDisabledPropertyName
>[] = BRAND_RELATIONSHIP_POPULATE_DISABLED_PROPERTY_NAMES.map<
  PopulatePropertyDescriptor<Brand, BrandRelationshipPopulateDisabledPropertyName>
>((disabledPropertyName) => ({ name: disabledPropertyName, populateEnabled: false }));

/**
 * The collaborators the `products` relationship needs before population can act on it.
 *
 * WHY THEY ARE PARAMETERS AND NOT IMPORTS (S3). BRANCH 4 of the legacy population pass resolved
 * each related entity through `getService("hibachiService").getServiceByEntityName(...)` and then
 * invoked a dynamically composed `get#cfc#()` — a string-keyed service locator feeding a
 * synthesised method name [org/Hibachi/HibachiTransient.cfc:L288, :L291]. That is precisely the
 * machinery IR-1 replaces with declarations and S3 forbids outright. It collapses into these two
 * explicit, typed members, supplied by the composition root in `src/config/container.ts` — never
 * resolved by this module, which imports no repository, no service and no configuration (S4) and
 * performs no data access (S2).
 *
 * Both are satisfiable by a plain object literal in a test (S6): the loader by an in-memory map,
 * the populator by a one-line call into `populate` with `Product.ts`'s own descriptor set.
 */
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
 * D-j — G6 TRANSLATION DECISION: TWO POPULATE-ENABLED RELATIONSHIPS ARE FLAGGED BOUNDARY OMISSIONS,
 * AND ABSENCE HERE DOES NOT MEAN POPULATE-DISABLED. Read this before concluding a property was
 * forgotten:
 *
 *   `attributeValues` [model/entity/Brand.cfc:L60] and `vendors` [:L70] are both populate-ENABLED
 *   in the legacy declaration, and neither appears in the `properties` array below. Their machinery
 *   cannot be supplied from here without inventing an out-of-scope surface: a descriptor for either
 *   requires a loader and a sub-populator for `AttributeValue` or `Vendor`, and `vendors`
 *   additionally requires the `addVendor`/`removeVendor` helpers at [:L140-L145] that AAP §0.4.1.4
 *   directs this port to document and omit. §0.2.2.1 excludes both families.
 *
 *   TODO(boundary): the rightful owners are the attribute subsystem and the vendor subsystem, both
 *   outside this slice (TR-5). No port file is created, no service is imported and no shape is
 *   invented for either collaborator.
 *
 *   THE OBSERVABLE CONSEQUENCE, STATED PLAINLY: a payload carrying an `attributeValues` or
 *   `vendors` key is SILENTLY IGNORED here, where the legacy pass would have resolved and attached
 *   the related entities. `../base/populate` documents that an unmatched payload key is ignored
 *   with no error and nothing thrown, so this is a behaviour gap and not a crash.
 *
 *   WHY OMISSION IS THE SAFE FORM OF THE GAP, rather than listing them without a `kind`: a
 *   descriptor with no `kind` is a COLUMN descriptor, and BRANCH 1 would then assign a trimmed
 *   STRING into an array-valued field for a simple payload value. The legacy pass could never do
 *   that — both properties declare a `fieldtype`, so BRANCH 1's gate excluded them — so listing
 *   them kind-less would introduce a corruption the legacy system did not have. The
 *   populate-disabled nine are safe to list kind-less for the opposite reason: the gate stops them
 *   first (D-i).
 *
 * `products` IS DIFFERENT, and it is the relationship this file's AAP row names. `Product` is in
 * scope and lands in the same phase (§0.4.5), so its descriptor is declared in full and only the
 * two genuinely external pieces — resolving a product and populating it — arrive as injected
 * collaborators. Call this factory with them wherever product sub-population is required; call it
 * with nothing for the dependency-free contract.
 *
 * @param productsRelationship - The `products` relationship's collaborators. Omit them to obtain
 * the
 *   dependency-free contract, in which the `products` descriptor is not declared at all and a
 *   `products` payload key is ignored exactly as `attributeValues` and `vendors` are.
 * @returns Brand's population contract, with `persistent: true` and its properties in legacy
 *   declaration order.
 *
 * @example
 * ```ts
 * // Dependency-free — what BrandService.saveBrand uses, since per AAP 0.6.3.3 BrandService's only
 * // collaborators are the ported url-title utility and the injected BaseService.
 * //
 * // `Brand` is PERSISTENT, so the authorisation context is required in effect: ARM 1 of the master
 * // gate at [org/Hibachi/HibachiTransient.cfc:L186] does not short-circuit for it, and omitting the
 * // context makes `../base/populate` fail closed and populate no declared property at all.
 * // `../../services/BaseService` assembles this object per save from its required authoriser
 * // collaborator, so a service never writes it out by hand.
 * populate(brand, data, createBrandPropertyDescriptors(), {
 *   authorization: { entityName: brand.getClassName(), authorizer },
 * });
 * ```
 */
export function createBrandPropertyDescriptors(
  productsRelationship?: BrandProductsRelationshipCollaborators,
): PropertyDescriptorSet<Brand, BrandPropertyName> {
  /*
   * The one-to-many descriptor for `products` — [model/entity/Brand.cfc:L61].
   *
   * `singularName: 'product'` is the legacy `singularname="product"` attribute, and the CAPITAL N
   * is the spelling `../base/populate` pins: the legacy code spelled the metadata key
   * inconsistently while composing method names from it — `singularName` at
   * [org/Hibachi/HibachiTransient.cfc:L294] against `singularname` at [:L339] and [:L357] — which
   * worked only because CFML struct keys are case-insensitive. Nothing here concatenates the value
   * into a member name (S3, TR-3); it is declared provenance, and `addRelated` below is the
   * explicit replacement for that dispatch.
   *
   * `relatedPrimaryIdPropertyName: 'productID'` is Product's declared primary identifier
   * [model/entity/Product.cfc:L52] `fieldtype="id"`. The legacy code resolved it at runtime through
   * `getPrimaryIDPropertyNameByEntityName(...)` over an interpolated entity name
   * [org/Hibachi/HibachiTransient.cfc:L227]; TR-3 replaces that lookup with this declaration.
   *
   * `addRelated` delegates to {@link Brand.addProduct} rather than pushing onto the array. That is
   * not a stylistic choice: the legacy `add*` members are hand-written bidirectional helpers, not
   * plain collection pushes — [model/entity/Brand.cfc:L98-L100] is
   * `arguments.product.setBrand(this)` — and `Product.setBrand` is what maintains BOTH sides plus
   * the duplicate guard.
   */
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
     * `getClassName()` [org/Hibachi/HibachiObject.cfc:L135-L137] returns `listLast(getClassFullname(),
     * ".")`, which for [model/entity/Brand.cfc:L49] is the bare component name `Brand`. That LEGACY
     * name is what the out-of-scope permission records are keyed by — `getEntityPermissionDetails()`
     * derives its key set from a directory listing of `model/entity` at
     * [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141] — so it is carried verbatim rather than
     * derived from this class's TypeScript name, which esbuild is free to rename.
     */
    entityName: BRAND_CLASS_NAME,

    /*
     * [model/entity/Brand.cfc:L49] declares `persistent=true`, so this is `true` — and the flag is
     * load-bearing rather than informational. `../base/populate` uses it as the first arm of the
     * legacy authorisation OR at [org/Hibachi/HibachiTransient.cfc:L186-L190]: a transient process
     * object short-circuits that OR and populates freely, whereas a persistent entity such as Brand
     * has per-property access control consulted. All three arms of that OR are live in that module,
     * with ARMS 2 and 3 resolved through `PopulationAuthorizationPort` from
     * `../../ports/AccountContextPort`; the caller supplies the policy.
     */
    persistent: true,

    /*
     * IN LEGACY DECLARATION ORDER, with every gap accounted for:
     *   [:L52] brandID                    omitted  — D-h, no populate branch admits an `id` field
     *   [:L53-L57] the five simple props  listed
     *   [:L60] attributeValues            omitted  — D-j, flagged boundary omission
     *   [:L61] products                   listed when its collaborators are supplied
     *   [:L66-L69] the four promotion m2m listed, populate-disabled
     *   [:L70] vendors                    omitted  — D-j, flagged boundary omission, and NOT
     *                                               populate-disabled: it carries no flag at all
     *   [:L71] physicals                  listed, populate-disabled
     *   [:L74] remoteID                   listed
     *   [:L77-L80] the four audit props   listed, populate-disabled
     * Nine of the listed descriptors carry `populateEnabled: false`, matching the nine
     * `hb_populateEnabled="false"` declarations in the legacy file exactly.
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

/**
 * Brand's dependency-free population contract.
 *
 * The form `src/services/BrandService.ts` uses: per AAP §0.6.3.3 that service's only collaborators
 * are `dataService` — narrowed to the ported `src/util/urlTitle.ts` utility — and the injected
 * `BaseService` behind the legacy `super.save()` at [model/service/BrandService.cfc:L76], so it has
 * no product loader to supply and needs none. Pass collaborators to
 * {@link createBrandPropertyDescriptors} wherever product sub-population is genuinely required.
 *
 * Evaluated once at module load and structurally immutable: every descriptor member is `readonly`,
 * the two name lists it derives from are frozen, and nothing here is mutable module-scope state
 * that could bleed across warm Lambda invocations (M7 / S8).
 */
export const BRAND_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Brand, BrandPropertyName> =
  createBrandPropertyDescriptors();
