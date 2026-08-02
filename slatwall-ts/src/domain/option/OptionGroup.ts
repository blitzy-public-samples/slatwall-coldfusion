/**
 * OptionGroup — the `SwOptionGroup` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode
 * TypeScript.
 *
 * Ported from [model/entity/OptionGroup.cfc]. AAP §0.4.1.4 names seven persistent properties and
 * `getOptions()` with its sort-order ordering [:L73], and that row is the scope.
 *
 * WHY THIS FILE EXISTS AT ALL — IT IS AN IMPLICIT SCOPE ADDITION (AAP §0.2.1.2). The prompt's Catalog
 * slice never named `OptionGroup.cfc`; four independent code paths made it unavoidable, and the AAP
 * concludes in as many words that "Omitting it would leave the option model unusable":
 * `Option.optionGroup` is a required many-to-one [model/entity/Option.cfc:L59];
 * `ProductService.processProduct_addOptionGroup` resolves a group through the option service and
 * immediately reads its collection [model/service/ProductService.cfc:L115];
 * `Product.getOptionGroups()` queries the entity directly [model/entity/Product.cfc:L251-L261]; and
 * the sorted-SKU ordering query reads `SwOptionGroup.sortOrder` [model/dao/SkuDAO.cfc:L172-L204].
 *
 * LABELS USED THROUGHOUT THIS FILE. `S1`-`S9` are the AAP §0.7.3 enterprise standards. `R-A` and `R-B`
 * are this module's two structural decisions — the type-only mutual reference with `./Option`, and the
 * declared descriptor set that replaces `populate()`. `F<n>` are this port's file-scope rules, cited
 * where they bite: F1 (a legacy overload is collapsed), F2 (a collection getter returns the LIVE
 * array), F4 (an ORM-synthesized member is declared explicitly), F9 (SmartList members stay out of the
 * domain layer), F12 (validation lives in `src/validation/**`), F20 (`sortOrder` is
 * ORM-lifecycle-assigned and never assigned here), F21 (`isNew` is a pure derived predicate) and F22
 * (no framework member is declared on this class).
 *
 * THE ENTITY-MODULE CONVENTION THIS FOLDER ESTABLISHES. `option/` is the first entity module in this
 * port, and `sku/Sku.ts`, `product/Product.ts`, `product/ProductType.ts` and `product/Brand.ts` follow
 * the three rules below. `Option.cfc` and `OptionGroup.cfc` declare ZERO non-persistent properties,
 * which makes them the only two complete ports in the `domain/` subtree: there is no
 * calculated-property boundary to negotiate and nothing to exclude for pricing, inventory or promotion
 * reasons, in contrast to the sixteen `Product`/`Sku` members AAP §0.2.2.6 excludes outright.
 *
 *   1. THE PERSISTENT DATA SURFACE IS PUBLIC FIELDS, named exactly as the legacy properties. CFML
 *      generated `getX()`/`setX()` pairs from `accessors=true` [model/entity/OptionGroup.cfc:L49] and
 *      those are deliberately not reproduced, for three reasons of which the third is decisive: the
 *      folder specification sanctions it; AAP §0.8.1 asks for idiomatic TypeScript rather than
 *      preserved CFML idioms; and `../base/populate` implements CFML's null semantics as
 *      `delete target[name]`, its port of `_setProperty`'s `structDelete`, which an accessor-backed
 *      value cannot satisfy — `populate` and `src/adapters/mysql/rowMappers.ts` are field-oriented by
 *      construction, so fields are required for interop with the very modules that hydrate this entity.
 *      Consequently every legacy scalar read becomes direct field access: `getOptionGroupID()`
 *      [model/entity/Sku.cfc:L516-L517] becomes `optionGroup.optionGroupID`, `getOptionGroupCode()`
 *      [model/entity/Sku.cfc:L504-L505] becomes `optionGroup.optionGroupCode`, `getOptionGroupName()`
 *      [model/entity/Sku.cfc:L581] becomes `optionGroup.optionGroupName`, and `getImageGroupFlag()`
 *      [model/entity/Sku.cfc:L134] becomes `optionGroup.imageGroupFlag`.
 *   2. DECLARE A METHOD ONLY where the legacy declares a real body, or where an implicit ORM member is
 *      called from in-scope code. For this entity that is exactly five members: `getOptions()`
 *      [model/entity/OptionGroup.cfc:L73-L79], `hasOption()` (ORM-synthesized, forced by
 *      [model/entity/Option.cfc:L94] — see F4), `addOption()` [model/entity/OptionGroup.cfc:L92-L94],
 *      `removeOption()` [:L95-L97] and the derived `isNew()`. Nothing else; the negative half of this
 *      rule is F22.
 *   3. KEEP BOTH the `options` backing field AND the `getOptions()` method. This looks redundant and is
 *      not: the legacy does the same thing, holding `variables.Options` behind `getOptions()`. The
 *      field is required for `populate` and `rowMappers` interop; the method is required because the
 *      AAP key-change row names it, because [model/service/ProductService.cfc:L115],
 *      [model/entity/Option.cfc:L95], [:L102] and [:L104] all call it, and because the
 *      live-array-by-reference contract (F2) is expressed through it.
 *
 * THE COMPONENT DECLARATION [model/entity/OptionGroup.cfc:L49], attribute by attribute:
 *
 *   entityname="SlatwallOptionGroup"   ->  this class
 *   table="SwOptionGroup"              ->  owned by `src/adapters/mysql/**`, never named executably
 *                                          here (S2)
 *   hb_serviceName="optionService"     ->  `src/services/OptionService.ts`
 *   hb_permission="this"               ->  no counterpart; authorisation is not part of this slice
 *   extends="HibachiEntity"            ->  the LOCAL Slatwall base [model/entity/HibachiEntity.cfc],
 *                                          not the framework one (IR-8). Its `populate()` [:L56]
 *                                          becomes the descriptor set at the foot of this file (R-B),
 *                                          and its `setting()` [:L129] has no consumer on this entity,
 *                                          so no `SettingResolverPort` is reached from here.
 *   cacheuse="transactional"           ->  FLAGGED, NOT EMULATED (S8 / mismatch M7). A warm Lambda
 *                                          container persists module scope across invocations and
 *                                          therefore across tenants, so a module-scope second-level
 *                                          cache would be a correctness hazard rather than an
 *                                          optimisation. This module holds no cache and no mutable
 *                                          module-scope binding; its two module constants are frozen
 *                                          and content-free, and loading it has no side effect.
 *
 * M6 — THE VALIDATION READ-BACK LOOP: THIS FILE SUPPLIES READS AND RESOLVES NOTHING.
 * `Sku.hasOneOptionPerOptionGroup()` [model/entity/Sku.cfc:L771-L784] reads
 * `getOptions()[i].getOptionGroup().getOptionGroupID()` at [:L776] and [:L779], and
 * `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L756-L769] drives a database read-back during save,
 * which AAP §0.6.2 calls "the highest-risk item in the slice". This file's only obligation is that
 * `optionGroupID` be a plain, synchronously readable field, so those consumers need no async hop and no
 * port. The ordering hazard itself belongs to `src/adapters/mysql/UnitOfWork.ts` and is deliberately
 * not addressed here. One detail for whoever ports `Sku.ts`, not acted on here: the `listFind` at
 * [model/entity/Sku.cfc:L776] is CASE-SENSITIVE, `listFindNoCase` being the insensitive variant.
 *
 * F22 — NO FRAMEWORK MEMBER IS DECLARED HERE: not the primary-identifier or new-flag accessors, not
 * `validate`/`hasErrors`/`getErrors`, and not `getPropertyMetaData`, `onMissingMethod`, `populate`,
 * `getPropertySmartList`, `setting`, `getService`, `getAttributeValue`, `getSimpleRepresentation` or
 * `getSimpleRepresentationPropertyName`. They are `org/Hibachi/**` members, and that tree is "a
 * boundary to extract from, never modify" (AAP §0.8.3.2); the AAP key-change row for this file names
 * none of them; and unrequested surface is forbidden outright. Recorded because it looks like a gap and
 * is not: the framework's `getSimpleRepresentationPropertyName()`
 * [org/Hibachi/HibachiEntity.cfc:L74-L87] scanned properties for one named `getClassName() & "name"` —
 * a case-insensitive CFML `==` — and threw when none matched. For this entity it resolved to
 * `optionGroupName`, which is declared below, so the entity satisfies the legacy assertion
 * `simple_representation_exists_and_is_simple`
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] structurally, without the member.
 * `isNew()` is the ONE exception to this mandate, for the reason given on it.
 *
 * IMPORT DISCIPLINE (S4 hexagonal separation). Three imports and the list is closed: two reach the
 * sibling `base/` modules that hydrate this entity, and the third is the type-only mutual reference to
 * `./Option` (R-A). Nothing from `src/adapters/**`, `src/services/**`, `src/config/**`,
 * `src/validation/**`, `src/handlers/**`, `src/integrations/**`, `src/util/**`, `src/errors/**` or
 * `src/ports/**` is imported, no AWS type appears, no `node:` builtin is used, the environment is never
 * read, and nothing comes from `node_modules` (S5 — the manifest is closed and this file adds nothing
 * to it). Every specifier is relative and extensionless because `tsconfig.json` declares neither
 * `paths` nor `baseUrl`, so `tsc` and `esbuild` resolve identically; named exports only, no default
 * export, no top-level `await` and no `import.meta`, because the artifact is bundled to CommonJS for
 * the Node 20 Lambda runtime.
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
/*
 * R-A — THE MUTUAL TYPE REFERENCE WITH `./Option`, AND WHY IT IS SAFE.
 *
 * `OptionGroup.options` is `Option[]`; `Option.optionGroup` is `OptionGroup`. That is a genuine
 * two-way reference and it is resolved deliberately rather than broken: NEITHER CLASS EVER
 * INSTANTIATES THE OTHER. `addOption` only calls `option.setOptionGroup(this)`
 * [model/entity/OptionGroup.cfc:L93], and `Option.setOptionGroup` only appends to the array it is
 * handed [model/entity/Option.cfc:L95]. Both directions are therefore type-only, `import type` is
 * fully erased at emit, and the bundle contains no circular CommonJS require and no module-
 * hazard.
 *
 * Per §0.4.5 every file of this subtree lands in one phase, so an unresolved specifier here is a
 * transient authoring state rather than a defect. It is emphatically NOT resolved by writing
 * `Option.ts` (a different module's file), by forking a duplicate local structural interface for
 * `Option` (which would split the type in two and hand the `Sku` and `Product` consumers the wrong
 * one), or by weakening `options` to a locally invented shape.
 */
import type { Option } from './Option';

/**
 * Every property name `model/entity/OptionGroup.cfc` declares — the union `populate` is keyed by.
 *
 * Thirteen names, in declaration order, matching the source block for block: the seven persistent
 * properties [model/entity/OptionGroup.cfc:L52-L58], the one remote property [:L61], the four audit
 * properties [:L64-L67] and the one related-object property [:L70].
 *
 * The four audit names are spliced in through `AuditPropertyName` rather than written out a second
 * time, so this union cannot drift from the frozen tuple `../base/AuditableEntity` exports and from
 * the exclusion the population engine applies with it.
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
 * ⚠️ NOT the same as {@link OPTION_GROUP_ENTITY_NAME}: this one carries no `Slatwall` prefix. It is
 * interpolated into every validation message
 * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216] and into the property-metadata
 * failure [org/Hibachi/HibachiTransient.cfc:L746], so a prefixed value here would change observable
 * message text.
 */
export const OPTION_GROUP_CLASS_NAME = 'OptionGroup';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/OptionGroup.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 *
 * ⚠️ THIS IS THE LOGICAL ENTITY NAME, NOT THE PHYSICAL `Sw*` TABLE NAME. The legacy uniqueness
 * statement [org/Hibachi/HibachiDAO.cfc:L140] is expressed over the mapped object graph, so the
 * prefixed form is correct there and is not a defect to correct; translating it to a table is the
 * adapter's responsibility.
 */
export const OPTION_GROUP_ENTITY_NAME = 'SlatwallOptionGroup';

/**
 * The name of the primary identifier property — [model/entity/OptionGroup.cfc:L52], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 *
 * The legacy resolved this name through `getService("hibachiService")`
 * [org/Hibachi/HibachiEntity.cfc:L249-L251]. Declaring it removes the service locator AAP 0.7.3 S3
 * forbids, and it is what makes the value safe to place in identifier position after the adapter
 * validates it: the name comes from entity metadata, never from caller input.
 */
export const OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME = 'optionGroupID';

/**
 * Every property this entity DECLARES, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 *
 * ⚠️ THE `DeclaredPropertyNameSet<OptionGroupPropertyName>` ANNOTATION IS THE POINT, NOT DECORATION. It checks this
 * set against the entity's property-name union in BOTH directions: a MISSING name fails to compile
 * ("Property 'x' is missing in type"), and an INVENTED one fails to compile too (the object is not
 * assignable). Both directions matter. A missing name would make `hasProperty` answer false, and
 * [org/Hibachi/HibachiValidationService.cfc:L171] SILENTLY SKIPS a rule whose property is absent —
 * so a validation rule would stop running with no error anywhere in the port. An invented name
 * would START running a rule the legacy never ran.
 *
 * ⭐ THIS SET IS THE ENTITY'S COMPLETE DECLARED SURFACE, because [model/entity/OptionGroup.cfc]
 * declares NO non-persistent property at all — the same fact AAP 0.2.2.6 records for `Brand.cfc` and
 * `Option.cfc`. All three identifiers `model/validation/OptionGroup.json` names —
 * `optionGroupName` [:L3], `optionGroupCode` [:L4] and `options` [:L5] — are present, so every rule
 * in that document genuinely RUNS.
 *
 * ⚠️ THIS IS A STATEMENT ABOUT WHAT THE LEGACY ENTITY DECLARES, NOT ABOUT WHAT THIS PORT
 * IMPLEMENTS, and the two differ deliberately. AAP 0.2.2.6 excludes the pricing, promotion,
 * inventory and currency-derived calculated members from the port because they reach exclusively
 * into out-of-scope services — yet the legacy still DECLARES them, so `hasProperty` must still
 * answer true for them exactly as the legacy does. Trimming this set to the implemented surface
 * would be the "missing name" failure above dressed up as tidiness.
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
 *
 * ⚠️ THIS CLASS ALSO DECLARES ALL SEVEN ITSELF, AND THIS BLOCK USED TO SAY IT "deliberately does not
 * declare" THEM. They are hand-written further down this module over its own frozen constants,
 * alongside an `implements ManagedEntity` clause that obliges them, and `../base/populate`'s
 * `Object.assign` then shadows those prototype methods with equivalent own-property closures over this
 * declaration. `../base/AuditableEntity` records once which classes declare the seven and which rely
 * on composition — `../product/ProductType.ts` is the only one that does the latter.
 *
 * See {@link EntityMetadataDeclaration} for what each member ports. This constant is the ONLY place
 * in this module where the class name and the ORM entity name appear as VALUES rather than as prose,
 * and {@link OPTION_GROUP_PROPERTY_DESCRIPTORS} reads its `className` from here so the literal is
 * written once.
 *
 * THIRTEEN KEYS, WHICH IS EVERY PROPERTY [model/entity/OptionGroup.cfc] DECLARES: the nine at
 * [`:L52-L57`], [`:L60`], [`:L63`] and [`:L66`] plus the four audit properties at [`:L69-L72`].
 * `declaredNonFieldProperties` is deliberately ABSENT rather than empty — this entity declares no
 * `persistent="false"` property and no relationship this port omits, so its declared set and its
 * field set coincide exactly.
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
 *
 * PORT OF [model/entity/OptionGroup.cfc], component body L49-L108. Thirteen fields and five
 * methods; the source declares nothing else.
 *
 * `implements AuditableEntity` is an interface conformance assertion, NOT inheritance. There is no
 * `extends` clause on this class and there is no base entity class in this subtree at all:
 * §0.3.3 replaces the legacy template-method reuse with composition, and
 * `../base/AuditableEntity` states its own contract as "a type plus free functions", satisfied
 * structurally. Declaring the interface here costs nothing at runtime and makes the compiler prove
 * that the four audit fields match the shared shape exactly, which is stronger than a comment
 * promising they do.
 *
 * CONSTRUCTIBLE WITH NO ARGUMENT, BY MANDATE (S6). There is no constructor, no injected
 * collaborator, no framework bootstrap, no container, no database handle and no I/O anywhere in
 * this class, so `new OptionGroup()` succeeds anywhere — which is the whole point of the port. The
 * legacy suite could not do this: every test extended a base that booted the entire FW/1
 * application and resolved services through DI/1, and the repository vendors no mocking library at
 * all (§0.4.3.6). A fresh instance also satisfies the legacy base assertion `defaults_are_correct`
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L66-L69] by construction: `isNew()` is `true`
 * and the primary identifier has zero length.
 *
 * ONE NOTE ON FIELD EMIT, RECORDED BECAUSE IT IS OBSERVABLE AND MUST NOT BE "FIXED" BY INVENTING
 * SOMETHING (S8/S9). CFML models a null column as a KEY ABSENT FROM `variables`, which is why
 * `../base/populate` clears a value with `delete` and why every nullable column below is optional
 * rather than `string | undefined`. `tsconfig.json` targets ES2022, so `useDefineForClassFields`
 * defaults to `true` and a declared-but-uninitialised field is materialised with the value
 * `undefined` at construction rather than left absent. The distinction is invisible to every
 * consumer in this slice — `exactOptionalPropertyTypes` already forces each reader to handle
 * `undefined`, `JSON.stringify` omits it, and `delete` restores true absence — so it is documented
 * here rather than papered over with a `declare` modifier or a hand-written constructor that the
 * source does not have.
 */
export class OptionGroup implements AuditableEntity, ManagedEntity {
  /* -------------------------------------------------------------------------------------------
   * Persistent Properties — [model/entity/OptionGroup.cfc:L52-L58]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The primary identifier.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L52]:
   *   property name="optionGroupID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *            unsavedvalue="" default="";
   *
   * F21 — TYPED `string` AND INITIALISED TO `''`, NEVER OPTIONAL AND NEVER NULL. This is the
   * single most load-bearing typing decision in the file, because `isNew()` is derived from it
   * rather than stored. The chain: `unsavedvalue="" default=""` here;
   * `getNewFlag() { if(getPrimaryIDValue() == "") return true; return false; }`
   * [org/Hibachi/HibachiEntity.cfc:L571-L576]; `getPrimaryIDValue()` returns the primary-ID
   * property [org/Hibachi/HibachiEntity.cfc:L244]; `isNew() { return getNewFlag(); }`
   * [org/Hibachi/HibachiEntity.cfc:L707-L709]. Typing this member as optional would break that
   * derivation under `exactOptionalPropertyTypes` and would cost the entity its
   * zero-dependency constructibility.
   *
   * Once persisted the value is a 32-character LOWERCASE HEX string with NO DASHES (IR-6: 107 of
   * the 113 legacy entities declare `fieldtype="id" generator="uuid" ormtype="string" length="32"`,
   * and identifiers are neither dashed RFC-4122 values nor auto-increment numbers). Generation is
   * owned by `src/util/uuid.ts` and is deliberately not performed here — this field is never
   * assigned by the domain layer.
   */
  optionGroupID: string = '';

  /**
   * The group's display name — for example the "Size" in a "Size: Large" SKU definition.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L53] `property name="optionGroupName" ormtype="string";`
   *
   * Read by `Sku.getSkuDefinition()` [model/entity/Sku.cfc:L581] and by the option-label projection
   * `"<group> - <option>"` that `OptionService.getUnusedProductOptions` produces. It is also the
   * property the framework's simple-representation scan resolves to; see F22 in the module header.
   *
   * VALIDATION, DOCUMENTED AND NOT IMPLEMENTED (F12) — [model/validation/OptionGroup.json:L3]
   * declares `[{"contexts":"save","required":true}]`. That rule is owned by
   * `src/validation/rules/optionGroup.rules.ts`; no check is performed in the domain layer.
   */
  optionGroupName?: string;

  /**
   * The group's stable code, used as a lookup key rather than for display.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L54] `property name="optionGroupCode" ormtype="string";`
   *
   * Read by `Sku.getOptionsByOptionGroupCodeStruct()` [model/entity/Sku.cfc:L504-L505], which keys a
   * struct by this value.
   *
   * VALIDATION, DOCUMENTED AND NOT IMPLEMENTED (F12) — [model/validation/OptionGroup.json:L4]
   * declares `[{"contexts":"save","required":true,"unique":true,"regex":"^[a-zA-Z0-9-_.|:~^]+$"}]`.
   * The pattern is reproduced byte-exactly above as prose and is deliberately NOT compiled into a
   * `RegExp` here. Two owners, neither of them this file: the rule set is
   * `src/validation/rules/optionGroup.rules.ts`, and the uniqueness half is an application-side
   * existence query (IR-5, ported from [org/Hibachi/HibachiDAO.cfc:L130-L146]) owned by
   * `src/adapters/mysql/UniquePropertyChecker.ts`. IR-5 matters because the legacy enforced
   * uniqueness in application code DURING VALIDATION, independently of the column metadata, so a
   * database constraint alone would not reproduce the observable behaviour.
   */
  optionGroupCode?: string;

  /**
   * The group-level image reference.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L55] `property name="optionGroupImage" ormtype="string";`
   *
   * Carried as the declared column and nothing more. Image path construction crosses the scope
   * boundary through `ImagePathPort` (§0.2.2.7) and belongs to the SKU-side members, not here; this
   * entity reaches no port at all. Note that it is `imageGroupFlag`, not this field, that
   * [model/entity/Sku.cfc:L134] consults when deciding whether a group participates in image
   * resolution.
   */
  optionGroupImage?: string;

  /**
   * Long-form description of the group.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L56]:
   *   property name="optionGroupDescription" ormtype="string" length="4000";
   *
   * `length="4000"` IS RECORDED HERE AS A COMMENT AND NOWHERE ELSE (S9). It is DDL metadata for the
   * column, not a rule: [model/validation/OptionGroup.json] declares no length rule for this
   * property, so no runtime length check, no truncation and no validator is added. Inventing one
   * would be inventing behaviour the source does not have.
   */
  optionGroupDescription?: string;

  /**
   * Whether this group drives image selection for its SKUs.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L57]:
   *   property name="imageGroupFlag" ormtype="boolean" default="0";
   *
   * `false` is the direct translation of `default="0"` and is one of only three source-declared
   * defaults on this entity — the others being `optionGroupID` (`''`) and `options` (`[]`). No
   * other default is invented (S9).
   *
   * Consumed by `Sku.getImageFileName()` [model/entity/Sku.cfc:L134], which tests
   * `option.getOptionGroup().getImageGroupFlag()` per option to decide which options contribute to
   * the generated image file name.
   */
  imageGroupFlag: boolean = false;

  /**
   * The group's position in the option-group ordering.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L58]:
   *   property name="sortOrder" ormtype="integer" required="true";
   *
   * F20 — THIS FIELD IS ORM-LIFECYCLE-ASSIGNED. NOTHING IN APPLICATION CODE
   * EVER SETS IT, on this entity or on `Option`. `setSortOrder(` matches exactly ONE line in the
   * whole repository — [org/Hibachi/HibachiEntity.cfc:L646] — inside the `preInsert()` block at
   * [org/Hibachi/HibachiEntity.cfc:L637-L647], which reads the top sort order through
   * `getService("hibachiService").getTableTopSortOrder(...)`
   * [org/Hibachi/HibachiService.cfc:L777] and assigns `topSortOrder + 1`. `OptionGroup` declares no
   * `sortContext`, so its first value is `max(sortOrder)` across the entire `SwOptionGroup` table
   * plus one, whereas [model/entity/Option.cfc:L56] declares `sortContext="optionGroup"` and is
   * scoped within its group. That is precisely how `required="true"` can hold with no caller ever
   * setting the value.
   * OWNER IN THE PORT: `src/adapters/mysql/UnitOfWork.ts`. It is not implemented here because it
   * requires a `MAX()` query and the domain layer performs no data access (S2/S4), and because
   * `src/domain/base/AuditableEntity.ts` carries an explicit negative mandate excluding that block
   * from the audit lifecycle it does own.
   *
   * ⭐ THE BOUNDARY OBLIGATION IS NOW DISCHARGED, AND THE `TODO(boundary)` MARKER IS WITHDRAWN WITH IT
   * (review finding 18). The owner formerly held only the READ half — `UnitOfWork.getTableTopSortOrder`,
   * the port of `org/Hibachi/HibachiDAO.cfc:L149-L168` — so nothing anywhere performed the ASSIGNMENT at
   * `:L646` and this slot could reach a writable-value collector still absent. Both halves now exist:
   * `UnitOfWork.seedFirstSortOrder` assigns `topSortOrder + 1` through the WHOLE-TABLE read this entity
   * needs, and `assertSortOrderAssigned` refuses at the persistence boundary if something bypassed the
   * assignment. NOTHING ABOUT THIS FIELD'S DECLARATION CHANGED: it stays optional, it acquires no default
   * here, and `model/validation/OptionGroup.json` still declares no rule for it.
   *
   * TYPED OPTIONAL, DELIBERATELY. Three constraints intersect and leave exactly one honest answer:
   * F20 forbids assigning it here, S9 forbids inventing a default such as `0`, and
   * `strictPropertyInitialization` rejects an uninitialised required field. Absence is also the
   * faithful model of the pre-`preInsert` state, in which the key is simply not present in the
   * legacy `variables` scope. It stays freely assignable, so `UnitOfWork` can write it.
   *
   * ASYMMETRY WORTH RECORDING: `required="true"` appears in the ORM mapping yet `sortOrder` is
   * ABSENT from [model/validation/OptionGroup.json] entirely — the requiredness is enforced by the
   * column and by the ORM lifecycle, never by the validation rule set.
   *
   * S7 — LATENT ISSUE RECORDED, NOT REPAIRED. This column is `required="true"` precisely because
   * it is an EXPONENT: the sorted-SKU ordering computes
   * `SUM(SwOption.sortOrder * POWER(10, next - SwOptionGroup.sortOrder))`
   * [model/dao/SkuDAO.cfc:L195] for SQL Server and [:L197] otherwise, over the three inner joins at
   * [model/dao/SkuDAO.cfc:L184-L188], with `next` coming from `max(SwOptionGroup.sortOrder)` at
   * [model/dao/SkuDAO.cfc:L211]. `SwOption.sortOrder` carries NO required constraint
   * [model/entity/Option.cfc:L56], and one NULL there makes the whole sum NULL in MySQL. Recorded;
   * not acted on. The ordering itself must not be "tidied" — it is load-bearing here and again at
   * `addOrder("sortOrder|ASC")` [model/entity/Product.cfc:L256].
   */
  sortOrder?: number;

  /* -------------------------------------------------------------------------------------------
   * Remote properties — [model/entity/OptionGroup.cfc:L61]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The identifier this group carries in an external system.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L61] `property name="remoteID" ormtype="string";`
   *
   * Kept in its own section because the source keeps it in its own section. It is a real persisted
   * column and belongs in the port: the AAP's "seven persistent properties" phrasing counts only
   * the `// Persistent Properties` block, and it does NOT carry
   * `hb_populateEnabled="false"`, so unlike the audit block it remains populate-enabled.
   */
  remoteID?: string;

  /* -------------------------------------------------------------------------------------------
   * Audit properties — [model/entity/OptionGroup.cfc:L64-L67]
   *
   * Declared byte-identically on all six in-scope entities and never written by application code:
   * the CFML engine's Hibernate hooks `preInsert()` and `preUpdate()`
   * [org/Hibachi/HibachiEntity.cfc:L595-L682] stamped them. That behaviour is owned by
   * `../base/AuditableEntity` (`applyPreInsertAudit` / `applyPreUpdateAudit`) and invoked from
   * `src/adapters/mysql/UnitOfWork.ts`. It is NOT implemented here, and this class does not extend
   * an audit base class — §0.3.3 mandates composition, and the module declares itself a type plus
   * free functions rather than an inheritance root.
   *
   * All four are declared `hb_populateEnabled="false"`, which is honoured twice over: structurally
   * by the population engine, which excludes them ahead of every other check, and explicitly by the
   * descriptor entries at the foot of this file, which are derived from the exported
   * `AUDIT_PROPERTY_NAMES` tuple rather than from four re-typed string literals.
   *
   * ONE ASYMMETRY THAT LOOKS LIKE AN INCONSISTENCY AND MUST NOT BE HARMONISED: only the two
   * DateTime getters were overridden to return the empty string when null
   * [org/Hibachi/HibachiEntity.cfc:L291-L297] and [:L299-L305]. The two Account getters have no
   * override anywhere and are genuinely null-when-unset. `../base/AuditableEntity` preserves that
   * split in its accessors, so absence is represented two different ways on purpose.
   * ----------------------------------------------------------------------------------------- */

  /**
   * When the row was first written. PORT OF [model/entity/OptionGroup.cfc:L64].
   */
  createdDateTime?: Date;

  /**
   * Identifier of the administrative account that created the row — PORT OF
   * [model/entity/OptionGroup.cfc:L65], declared there as
   * `cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   *
   * TYPED AS AN IDENTIFIER STRING, NOT AN ENTITY. The twenty-one `Account*.cfc` files across
   * `model/entity`, `model/service`, `model/dao` and `model/process` are explicitly out of scope
   * (§0.2.2.1), so no account type is declared, imported or stubbed here; the field carries the
   * 32-character identifier of IR-6. The foreign-key column name is recorded above as provenance
   * only — the column-to-field mapping belongs to `src/adapters/mysql/rowMappers.ts`.
   */
  createdByAccount?: string;

  /**
   * When the row was last written. PORT OF [model/entity/OptionGroup.cfc:L66].
   *
   * Written on insert as well as on update, which surprises readers who expect the modified pair to
   * stay untouched until the first real update; `../base/AuditableEntity` documents that asymmetry
   * against the framework lines that cause it.
   */
  modifiedDateTime?: Date;

  /**
   * Identifier of the administrative account that last wrote the row — PORT OF
   * [model/entity/OptionGroup.cfc:L67], `fkcolumn="modifiedByAccountID"`. Typed as an identifier
   * string for the same reason as `createdByAccount`.
   */
  modifiedByAccount?: string;

  /* -------------------------------------------------------------------------------------------
   * Related Object Properties — [model/entity/OptionGroup.cfc:L70]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The options belonging to this group.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L70]:
   *   property name="options" singularname="option" cfc="Option" fieldtype="one-to-many"
   *            fkcolumn="optionGroupID" inverse="true" cascade="all-delete-orphan"
   *            orderby="sortOrder";
   *
   * Every attribute of that declaration matters, so each is recorded against what it causes:
   *
   *   singularname="option"        — the reason the ORM-generated member names are `hasOption`,
   *                                  `addOption` and `removeOption` rather than `hasOptions` and
   *                                  friends. It is carried into the descriptor set at the foot of
   *                                  this file as `singularName`.
   *   fkcolumn="optionGroupID"     — the child column; provenance only, mapped by
   *                                  `src/adapters/mysql/rowMappers.ts`.
   *   inverse="true"               — `Option` OWNS THE FOREIGN KEY. This is exactly why
   *                                  `addOption` and `removeOption` below delegate instead of
   *                                  mutating this array themselves.
   *   cascade="all-delete-orphan"  — see the F12 tension recorded on `getOptions()`.
   *   orderby="sortOrder"          — Hibernate applied it at LOAD time. In the port,
   *                                  `src/adapters/mysql/MySqlOptionRepository.ts` and
   *                                  `src/adapters/mysql/rowMappers.ts` are responsible for
   *                                  producing this array already in `sortOrder` order. NOTHING IS
   *                                  SORTED HERE, and the ordering must not be "tidied" (S7): it is
   *                                  load-bearing at `addOrder("sortOrder|ASC")`
   *                                  [model/entity/Product.cfc:L256] and again as the `POWER`
   *                                  exponent at [model/dao/SkuDAO.cfc:L195] / [:L197].
   *
   * NEVER OPTIONAL AND NEVER ABSENT: an empty array is the correct empty state, and it is what the
   * legacy base assertion `defaults_are_correct`
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L66-L69] expects of a fresh entity — the
   * `BrandTest` override [meta/tests/unit/entity/BrandTest.cfc] makes the same expectation explicit
   * for its own collection.
   */
  options: Option[] = [];

  /* ===========================================================================================
   * Bidirectional Helper Methods — [model/entity/OptionGroup.cfc:L89-L99]
   * =========================================================================================== */

  /**
   * Returns this group's options — THE LIVE ARRAY, BY REFERENCE.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L73-L79]. The legacy body, verbatim:
   *
   *     public array function getOptions(orderby, sortType="text", direction="asc") {
   *         if(!structKeyExists(arguments,"orderby")) {
   *             return variables.Options;
   *         } else {
   *             return getService("hibachiUtilityService").sortObjectArray(
   *                 variables.Options, arguments.orderby, arguments.sortType, arguments.direction);
   *         }
   *     }
   *
   * F2 — RETURNING THE LIVE ARRAY IS BEHAVIOUR, NOT STYLE. A DEFENSIVE COPY IS FORBIDDEN.
   * `model/entity/Option.cfc` mutates the returned array directly, in three places:
   *   [model/entity/Option.cfc:L95]  `arrayAppend(arguments.optionGroup.getOptions(), this)`
   *   [model/entity/Option.cfc:L102] `arrayFind(arguments.optionGroup.getOptions(), this)`
   *   [model/entity/Option.cfc:L104] `arrayDeleteAt(arguments.optionGroup.getOptions(), index)`
   * Returning `[...this.options]`, `this.options.slice()` or a `ReadonlyArray` view would turn the
   * append at L95 and the delete at L104 into SILENT NO-OPS — no error, no compile failure, wrong
   * behaviour, and the bidirectional relationship would simply stop synchronising. The return type
   * is therefore the mutable `Option[]` and the body is a bare field read. This is the judgment call
   * §0.8.2 Guideline 6 exists to have documented.
   *
   * F1 / TODO(parity) — THE OVERLOAD IS COLLAPSED, DELIBERATELY AND WITH EVIDENCE.
   * The legacy signature was `getOptions(orderby, sortType="text", direction="asc")` and its second
   * branch is UNREACHABLE DEAD CODE. Across `model/`,
   * `integrationServices/`, `admin/` and `frontend/` the only line matching `getOptions(` with a
   * non-empty argument list is the declaration itself, [model/entity/OptionGroup.cfc:L73]. Every
   * real call site passes nothing — [model/service/ProductService.cfc:L115],
   * [model/entity/Option.cfc:L95], [:L102] and [:L104]. The branch's delegate,
   * `sortObjectArray` at [model/service/HibachiUtilityService.cfc:L514] (the LOCAL service, not the
   * `org/Hibachi/` one), additionally carries an undocumented defect of its own: it keys a struct on
   * `"{VALUE}.{randRange(1,100)}"` to preserve ties [:L522-L523], that random suffix can itself
   * collide and SILENTLY LOSE elements, and it then sorts composite string keys lexicographically
   * [:L526]. The port therefore declares no parameters, does not implement the sort branch, does not
   * carry `sortObjectArray` across, and does NOT repair its collision defect (S7 — it is a
   * proven-dead branch in a file this port does not own). Collapsing a proven-unreachable branch as
   * a cited decision rather than dropping it in silence follows the precedent the AAP sets for T2,
   * where the unreachable optional-`productID` path of the option-to-SKU query is collapsed the same
   * way. The one `getService(...)` call in the legacy source disappears with it, which is the
   * outcome S3 wants: it is replaced by nothing, not by a locator, a registry or a container import.
   *
   * F9 / TODO(boundary) — `getOptionsSmartList()` IS DELIBERATELY ABSENT.
   * The source declares it at [model/entity/OptionGroup.cfc:L81-L83] as
   * `return getPropertySmartList(propertyName="options");`. `getPropertySmartList` is
   * `org/Hibachi/**` machinery, and the paginated dynamic-query abstraction it belongs to is
   * `SmartListQueryPort` (§0.2.2.7), implemented by `src/adapters/mysql/SmartListQueryBuilder.ts`.
   * The member is not named in this file's AAP key-change row and no port is reachable from the
   * domain layer, so it is recorded here as an omission-by-decision rather than an oversight (S8).
   * Corroborating that the SmartList path is a service/adapter concern and not an entity one:
   * [model/entity/Product.cfc:L251-L261] reaches option groups through
   * `getService("OptionService").getOptionGroupSmartList()` with
   * `addFilter("options.skus.product.productID", ...)` and `addOrder("sortOrder|ASC")` — never
   * through this entity.
   *
   * F12 — THE DELETE GUARD AND `cascade="all-delete-orphan"` ARE IN GENUINE TENSION. BOTH ARE
   * CARRIED; NEITHER IS RESOLVED HERE (S8). [model/validation/OptionGroup.json:L5] declares
   * `"options": [{"contexts":"delete","maxCollection":0}]`, which BLOCKS the delete outright while
   * this collection is non-empty, whereas [model/entity/OptionGroup.cfc:L70] declares
   * `cascade="all-delete-orphan"`, under which Hibernate would have cascade-deleted the children.
   * Both are real declarations in the source. Neither is adjudicated in the domain layer: the rule
   * belongs to `src/validation/rules/optionGroup.rules.ts` and the cascade belongs to the delete
   * path in `src/adapters/mysql/**`.
   *
   * @returns The live `options` array, mutable and by reference.
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * Whether the given option already belongs to this group.
   *
   * F4 / IR-1 — THIS MEMBER APPEARS NOWHERE IN THE LEGACY SOURCE AND MUST STILL BE DECLARED.
   * `hasOption` was SYNTHESIZED at runtime: it is an implicit ORM member generated from the
   * `options` property's `singularname="option"` [model/entity/OptionGroup.cfc:L70], which the
   * framework itself acknowledges — [org/Hibachi/HibachiEntity.cfc:L343] carries the comment
   * "evaluate is used instead of invokeMethod() because hasXXX() is an implicit orm function".
   * TypeScript under `strict` has no equivalent facility (IR-1), so the member becomes an explicit,
   * typed declaration or it ceases to exist.
   *
   * THE CALL SITE THAT FORCES IT is in-scope: [model/entity/Option.cfc:L94]
   * `if(isNew() or !arguments.optionGroup.hasOption( this ))`, guarding the append at [:L95]. Omit
   * this member and `domain/option/Option.ts` cannot compile. (Two further call sites exist and are
   * listed only so the member's shape is understood, never to be ported:
   * [model/entity/PromotionQualifier.cfc:L161] and [model/entity/PromotionReward.cfc:L219], both in
   * excluded promotion files.)
   *
   * WHEN THIS GUARD IS ACTUALLY LIVE — OBSERVED BEHAVIOUR, CARRIED AND NOT REPAIRED (S7).
   * The condition at [model/entity/Option.cfc:L94] is a short-circuiting OR whose FIRST arm is the
   * option's own `isNew()`. For a TRANSIENT option that arm is true, so `hasOption` is never
   * consulted and THE APPEND IS UNCONDITIONAL: attaching the same transient option twice appends it
   * twice. The de-duplication this member provides is therefore live only once the option has been
   * persisted and its identifier is no longer the empty string. The identical pattern appears at
   * both out-of-scope call sites, which spell it `arguments.option.isNew() or
   * !hasOption(arguments.option)`, so it is the framework's consistent idiom rather than a local
   * slip. It is recorded here because it is genuinely surprising, and it is left exactly as it is:
   * this member reports membership faithfully and neither adds a guard of its own nor changes when
   * the owning side chooses to consult it.
   *
   * IDENTITY-BASED MEMBERSHIP, matching the reference-equality semantics CFML's `arrayFind` applies
   * to objects — the same test [model/entity/Option.cfc:L102] relies on. `Array.prototype.includes`
   * compares with SameValueZero, so it is reference identity for objects; no property is compared,
   * no identifier is compared, and in particular two distinct transient options with the same
   * `optionID` are correctly NOT treated as the same member. `includes` also sidesteps
   * `noUncheckedIndexedAccess` entirely, so no indexed read and no non-null assertion is needed.
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
   * PORT OF [model/entity/OptionGroup.cfc:L92-L94]:
   *
   *     public void function addOption(required any option) {
   *         arguments.option.setOptionGroup( this );
   *     }
   *
   * A PURE DELEGATION, AND IT MUST STAY ONE. `inverse="true"`
   * [model/entity/OptionGroup.cfc:L70] means `Option` owns the foreign key, so all mutation logic
   * lives on the `Option` side: `Option.setOptionGroup` assigns the back-reference and then appends
   * to this group's live array itself, behind its own guard
   * [model/entity/Option.cfc:L92-L97]. Pushing into `this.options` here as well would DOUBLE-APPEND
   * — a silent duplicate rather than an error — so this body does exactly what the source does and
   * nothing more (S7). The legacy `required any option` parameter is tightened to the precise
   * `Option` type, which is the licence §0.8.1 grants for idiom while behaviour is held fixed.
   *
   * @param option - The option to attach to this group.
   */
  addOption(option: Option): void {
    option.setOptionGroup(this);
  }

  /**
   * Removes an option from this group, by having the option detach itself.
   *
   * PORT OF [model/entity/OptionGroup.cfc:L95-L97]:
   *
   *     public void function removeOption(required any option) {
   *         arguments.option.removeOptionGroup( this );
   *     }
   *
   * The mirror of `addOption`, and a pure delegation for the same `inverse="true"` reason:
   * `Option.removeOptionGroup` locates itself with `arrayFind` [model/entity/Option.cfc:L102] and
   * deletes itself with `arrayDeleteAt` [:L104] from the live array, then clears its own
   * back-reference [:L106]. Splicing `this.options` here as well would remove the wrong element or
   * remove one twice.
   *
   * PASSING `this` EXPLICITLY IS CORRECT, and worth recording because the legacy argument is
   * OPTIONAL: `public void function removeOptionGroup(any optionGroup)`
   * [model/entity/Option.cfc:L98] falls back to its own `variables.optionGroup` when the argument is
   * absent [:L99-L101]. The source passes the group explicitly here, so the port does too — and that
   * is load-bearing rather than incidental: the fallback path RAISES when no group is assigned,
   * reproducing the CFML engine diagnostic at [model/entity/Option.cfc:L100]. Passing `this` is what
   * makes this delegation unable to reach that failure, in the port exactly as in the legacy.
   *
   * @param option - The option to detach from this group.
   */
  removeOption(option: Option): void {
    option.removeOptionGroup(this);
  }

  /**
   * Whether this group has never been persisted.
   *
   * F21 — A PURE DERIVED PREDICATE: THE PRIMARY IDENTIFIER EQUALS THE EMPTY STRING. `newFlag` is
   * declared `persistent="false"` on the framework base but no `setNewFlag` exists anywhere, so nothing
   * stores it. The chain is `unsavedvalue="" default=""`
   * [model/entity/OptionGroup.cfc:L52] -> `getPrimaryIDValue()`
   * [org/Hibachi/HibachiEntity.cfc:L244] -> `getNewFlag()` [:L571-L576] -> `isNew()` [:L707-L709].
   * Requiring zero ports and zero database access is what makes the entity cheaply constructible (S6)
   * and what lets the guard at [model/entity/Option.cfc:L94] work with no collaborator at all.
   *
   * TWO THINGS RECORDED PRECISELY. `isNew()` sits inside the framework's "Deprecated Methods" section
   * [org/Hibachi/HibachiEntity.cfc:L705] yet in-scope code still calls it, so it is ported anyway and is
   * the ONE exception to the F22 negative mandate. And — stated exactly because the distinction is easy
   * to garble — the unqualified `isNew()` at [model/entity/Option.cfc:L94] resolves to the OPTION's own
   * inherited predicate, not to this group's; no `optionGroup.isNew()` call site exists. The member is
   * declared here because it is the identical predicate every entity inherits from the same base, because
   * the legacy entity-test base reads it on every entity, and because it is part of the convention this
   * module sets for `sku/` and `product/`.
   *
   * @returns `true` when the group has not been persisted yet.
   */
  isNew(): boolean {
    return this.optionGroupID === '';
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
   * ============================================================================================ */

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
   * @returns The mapped ORM entity name, NOT the physical table name.
   */
  getEntityName(): string {
    return OPTION_GROUP_ENTITY_NAME;
  }

  /**
   * `optionGroupID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP 0.7.3 S3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return OPTION_GROUP_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's VALUE — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * ⚠️ RETURNS `''` FOR AN UNSAVED INSTANCE, because [model/entity/OptionGroup.cfc:L52] declares
   * `unsavedvalue=""` and this class initialises the field to `''`. That is what makes the
   * self-exclusion term of the uniqueness query a NO-OP on insert — an observation AAP 0.4.1.7
   * requires be reproduced rather than tidied away, and which `src/ports/UniquePropertyPort.ts`
   * carries as a `TODO(parity)`. It is also the value
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts on a fresh instance.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.optionGroupID;
  }

  /**
   * Whether this entity DECLARES the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * ⚠️ A FALSE ANSWER SILENTLY SKIPS A VALIDATION RULE rather than failing it
   * [org/Hibachi/HibachiValidationService.cfc:L171]. See OPTION_GROUP_DECLARED_PROPERTIES, whose
   * exhaustiveness is compile-checked precisely because of that.
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(OPTION_GROUP_DECLARED_PROPERTIES, propertyIdentifier);
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
      OPTION_GROUP_DECLARED_PROPERTIES,
      propertyName,
      OPTION_GROUP_CLASS_NAME,
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
}

/* ===============================================================================================
 * R-B — THE POPULATION CONTRACT: A DECLARED DESCRIPTOR SET, AND NO `populate()` METHOD
 * ===============================================================================================
 * `OptionGroup` HAS NO `populate()` MEMBER, deliberately. In the legacy tree the method arrived by
 * inheritance from the local base [model/entity/HibachiEntity.cfc:L56] and reflected over component
 * metadata at runtime. Two independent reasons it is not re-created here: §0.3.3 replaces
 * template-method inheritance with composition, so there is no base class to inherit it from; and
 * `../base/populate` declares its contract as a free function taking a `descriptorSet` parameter,
 * which is exactly so that per-entity metadata is supplied BY the entity module rather than
 * discovered inside the engine (TR-3). Callers write:
 *
 *     populate(optionGroup, data, OPTION_GROUP_PROPERTY_DESCRIPTORS, {
 *         authorization: { entityName: optionGroup.getClassName(), authorizer },
 *     });
 *
 * THE FOURTH ARGUMENT IS NOT OPTIONAL IN EFFECT FOR THIS ENTITY. `OptionGroup` is persistent, so ARM 1
 * of the population master gate at [org/Hibachi/HibachiTransient.cfc:L186] does not short-circuit and
 * the per-property authorisation arms [:L188-L190] are reached. `../base/populate` fails closed without
 * the context, so a three-argument call would populate NO declared property.
 * `../../services/BaseService` builds the object per save from its required authoriser collaborator;
 * only a direct caller writes it.
 *
 * WHAT IS DECLARED, AND THE COUNT AUDIT. The entity declares thirteen properties. Twelve are
 * describable and one is not:
 *
 *   6  simple columns      optionGroupName, optionGroupCode, optionGroupImage,
 *                          optionGroupDescription, imageGroupFlag, sortOrder
 *                          [model/entity/OptionGroup.cfc:L53-L58]
 *   1  remote column       remoteID [model/entity/OptionGroup.cfc:L61]
 *   4  audit properties    populate-DISABLED [model/entity/OptionGroup.cfc:L64-L67]
 *   1  one-to-many         options [model/entity/OptionGroup.cfc:L70] — factory-only, see below
 *   -- ------------------  ------------------------------------------------------------------
 *   12 describable         + 1 omitted (optionGroupID) = 13
 *
 * WHY `optionGroupID` IS OMITTED — A G6 TRANSLATION DECISION, NOT AN OVERSIGHT. The primary
 * identifier declares `fieldtype="id"` [model/entity/OptionGroup.cfc:L52], and the legacy column
 * branch is gated on `!structKeyExists(currentProperty, "fieldType") || fieldType == "column"`. For
 * an id property that gate is FALSE, and no relationship branch matches either, so THE LEGACY
 * NEVER POPULATED A PRIMARY IDENTIFIER FROM REQUEST DATA. The type system agrees independently:
 * `../base/populate` derives its `PropertyKind` union from the four values the engine actually
 * consults and has no `'id'` member at all, so an id descriptor is not even expressible. Omitting
 * the property is therefore observably identical to the source, whereas describing it as a column
 * would silently make the primary key writable from a payload.
 *
 * DESCRIPTOR FACTS VERIFIED FOR THIS ENTITY — and no machinery is added for the absent ones (S9):
 *   - `notNull` occurs EXACTLY ONCE in the whole in-scope slice, at [model/entity/Product.cfc:L55],
 *     and NOT on this entity. The consequence is real and is left as-is: a blank simple value
 *     DELETES the key here rather than assigning the empty string.
 *   - `hb_sessionDefault`, `hb_populateArray` and `hb_fileUpload` occur ZERO times across all six
 *     in-scope entities, so no descriptor below declares them.
 *   - `hb_populateEnabled="public"` occurs 68 times in the legacy tree and ZERO times in scope; only
 *     `false` and absent occur here, so the tri-value is consumed but never exercised.
 *   - `hb_formatType` occurs once in scope, at [model/entity/Brand.cfc:L57], and the legacy live
 *     path ignores it entirely. Not applicable to this entity.
 *   - Exactly ONE relationship kind is present: `options`, one-to-many, `singularname="option"`
 *     [model/entity/OptionGroup.cfc:L70].
 *
 * THE `singularName` CASING TRAP. The legacy composed member names from this attribute and spelled
 * the key inconsistently while doing so — capital `N` in one place, lower-case `n` in two others —
 * which worked only because CFML struct keys are case-insensitive. TypeScript is case-SENSITIVE, so
 * `../base/populate` pins one spelling, `singularName`, and that pinned spelling is what the
 * descriptor below uses. The value is provenance only; nothing concatenates it into a member name,
 * because S3 forbids exactly that.
 * =============================================================================================== */

/**
 * The four audit properties, marked populate-disabled.
 *
 * DERIVED FROM the frozen `AUDIT_PROPERTY_NAMES` tuple that `../base/AuditableEntity` exports,
 * rather than from four re-typed string literals, so this list cannot drift from the shared
 * definition or from the exclusion the population engine applies with it. `populateEnabled: false`
 * is the direct port of `hb_populateEnabled="false"` at [model/entity/OptionGroup.cfc:L64-L67].
 *
 * BELT AND BRACES, ON PURPOSE. The engine already excludes these four names unconditionally, ahead
 * of every other check, so these entries are not load-bearing for behaviour. They are declared
 * anyway because the legacy DECLARATION is what this file ports, and a reader comparing the
 * descriptor table against the source should find every property accounted for.
 *
 * THE TWO ACCOUNT PROPERTIES ARE DESCRIBED AS COLUMNS even though the source declares them
 * `fieldtype="many-to-one"` [model/entity/OptionGroup.cfc:L65] and [:L67]. That is sound and
 * deliberate: the engine short-circuits on the audit name before every kind-specific branch, so
 * the kind is unreachable for these two, and describing them as relationships would force this file
 * to declare an `Account` primary-identifier name and an `Account` loader — inventing a surface for
 * a domain that §0.2.2.1 places entirely out of scope.
 *
 * An immutable module constant, not module-scope state: frozen at both the type level and at run
 * time, holding no per-request content, in the same documented-safe category as
 * `AUDIT_PROPERTY_NAMES` itself (M7).
 */
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
 * The legacy `getClassName()` value for this entity [org/Hibachi/HibachiObject.cfc:L135-L137], which
 * for [model/entity/OptionGroup.cfc:L49] is the bare component name.
 *
 * It is the ARM 3 operand of the population gate [org/Hibachi/HibachiTransient.cfc:L190] and the key
 * the out-of-scope permission records are stored under
 * [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141]. Declared once because both descriptor sets
 * below need it, and carried verbatim rather than read from `OptionGroup.name` at runtime — that would
 * be the reflection TR-3 retires, and bundling may rename a class.
 */
const OPTION_GROUP_LEGACY_CLASS_NAME = 'OptionGroup';

/**
 * The seven simple columns, in source declaration order.
 *
 * PORT OF [model/entity/OptionGroup.cfc:L53-L58] and [:L61]. `kind` is omitted throughout, which is
 * exactly equivalent to declaring `kind: 'column'`: not one of these properties declares a
 * `fieldtype` attribute in the source, and the legacy gate treats an absent `fieldtype` as a column.
 *
 * DECLARATION ORDER IS PRESERVED because it is population order — the legacy loop iterates declared
 * properties rather than payload keys, so the order is observable whenever two properties feed the
 * same downstream value.
 */
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

/**
 * The population contract for `OptionGroup`, minus the `options` relationship.
 *
 * Eleven descriptors: the seven columns of [model/entity/OptionGroup.cfc:L53-L58] and [:L61], plus
 * the four populate-disabled audit properties of [:L64-L67]. `persistent: true` ports
 * `persistent=true` on the component declaration at [model/entity/OptionGroup.cfc:L49], and it is
 * consequential rather than decorative: the legacy authorisation gate short-circuits for
 * NON-persistent targets, so process objects populate freely while entities such as this one have
 * per-property authorisation consulted. `../base/populate` ports all three arms of that gate and
 * DENIES when no authorisation collaborator is supplied, so a persistent target is never populated by
 * default. `className` accompanies the flag because the third arm passes it as its `entityName`
 * argument.
 *
 * WHY THE `options` RELATIONSHIP IS NOT IN THIS CONSTANT — A MISMATCH FLAGGED RATHER THAN
 * ASSUMED AWAY (S8). A one-to-many descriptor is required by its own contract to carry a
 * `RelatedEntityLoader` and a `populateRelated`. Neither can exist in a static constant declared
 * inside the domain layer: the loader performs DATA ACCESS, which S2 and S4 forbid here, and
 * `populateRelated` would need `Option`'s own descriptor set, which means a VALUE import of
 * `./Option` and therefore precisely the runtime circular CommonJS require that R-A's type-only
 * exists to avoid. The relationship is consequently supplied through
 * {@link createOptionGroupPropertyDescriptors}, whose collaborators the composition root injects.
 * This constant remains the form the AAP call example uses, and it is complete and correct for
 * every payload that carries no nested `options` array — which is every payload the in-scope call
 * paths produce, since [model/service/ProductService.cfc:L115] attaches options through
 * `addOption` rather than through a populate payload.
 */
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
 * PORT OF the relationship half of [model/entity/OptionGroup.cfc:L70]. The two collaborators are
 * the explicit replacements for two pieces of framework machinery the legacy resolved dynamically,
 * and both are constructor-injected at the composition root rather than looked up (S3):
 *
 *   - `optionLoader` replaces `getService("hibachiService").getServiceByEntityName(...)` followed by
 *     an `invokeMethod("get" & entityName, ...)` call — a string-keyed service locator feeding a
 *     synthesized method name. Implemented by `src/adapters/mysql/MySqlOptionRepository.ts`.
 *   - `populateOption` replaces the legacy recursion `thisEntity.populate(...)`, which resolved only
 *     because every entity carried the method by inheritance. In the port `Option`'s descriptors
 *     belong to `Option`'s own module, so the recursion arrives as a function — typically a one-line
 *     call back into `populate` with that module's descriptor set.
 *
 * `relatedPrimaryIdPropertyName` is `'optionID'`, read from [model/entity/Option.cfc:L52]. The two
 * operations are declared in METHOD syntax deliberately, matching the descriptor interface, so a
 * descriptor written against the concrete `Option` type stays assignable to the heterogeneous
 * descriptor collection with no cast (S1: this file contains no `as` cast, no non-null assertion and
 * no suppression comment).
 *
 * `addRelated` delegates to {@link OptionGroup.addOption}, which is the whole reason the operation is
 * injected rather than implemented as a collection push: the legacy `add*` members are hand-written
 * bidirectional helpers, and here that helper hands ownership to the `Option` side because
 * `inverse="true"` makes `Option` the owner of the foreign key.
 *
 * NOTHING IS MEMOIZED and no state is retained between calls: a fresh set is built per call, so
 * nothing can bleed across warm Lambda invocations or across tenants (M7).
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
