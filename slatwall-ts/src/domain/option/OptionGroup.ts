/**
 * OptionGroup — the `SwOptionGroup` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode
 * TypeScript.
 *
 * ---------------------------------------------------------------------------------------------
 * AAP AUTHORITY
 * ---------------------------------------------------------------------------------------------
 * §0.4.1.4 "Domain Layer", verbatim row:
 *
 *   | slatwall-ts/src/domain/option/OptionGroup.ts | CREATE | model/entity/OptionGroup.cfc |
 *   | Seven persistent properties; getOptions() with its sort-order ordering [L73] |
 *
 * WHY THIS FILE EXISTS AT ALL — IT IS AN IMPLICIT SCOPE ADDITION (§0.2.1.2). The prompt's Catalog
 * slice never named `OptionGroup.cfc`. Four independent code paths made it unavoidable, and the AAP
 * concludes in as many words that "Omitting it would leave the option model unusable":
 *
 *   1. `Option.optionGroup` is a required many-to-one [model/entity/Option.cfc:L59].
 *   2. `ProductService.processProduct_addOptionGroup` resolves a group through the option service
 *      and immediately reads its collection — `getOptionService().getOptionGroup(...).getOptions()`
 *      [model/service/ProductService.cfc:L115].
 *   3. `Product.getOptionGroups()` queries the entity directly [model/entity/Product.cfc:L251-L261].
 *   4. The sorted-SKU ordering query reads `SwOptionGroup.sortOrder`
 *      [model/dao/SkuDAO.cfc:L172-L204].
 *
 * ---------------------------------------------------------------------------------------------
 * RULES VERDICT, RECORDED RATHER THAN ASSUMED (UR4)
 * ---------------------------------------------------------------------------------------------
 * No user-specified rules were provided for this project: `review_rules` returns the single line
 * "No user rules provided." verbatim. The nine AAP §0.7.3 enterprise standards govern in their
 * place, and the bar is NOT lowered.
 *
 * Corroborated independently: repeated `review_rules` calls return the byte-identical single line,
 * and a filesystem sweep finds no `.blitzyignore`, `.cursorrules`, `AGENTS.md`, `CLAUDE.md`,
 * `.editorconfig`, `.eslintrc*`, `.prettierrc*`, `CONTRIBUTING.md` or `CODEOWNERS` anywhere in the
 * repository. Zero files enter scope by rule. The standards with teeth here are S1 (strict type
 * safety — no `unknown`-laundering cast, no non-null assertion, no suppression comment), S2 (a
 * purely negative obligation: no query, no driver import, and the table names appear only as prose
 * provenance), S3, S4, S5 (nothing from `node_modules` is imported), S6 (`new OptionGroup()` is
 * constructible with no argument, no container and no I/O), S7, S8 and S9.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE ENTITY-MODULE CONVENTION THIS FOLDER ESTABLISHES
 * ---------------------------------------------------------------------------------------------
 * `option/` is the first entity module authored in this port, and `sku/Sku.ts`,
 * `product/Product.ts`, `product/ProductType.ts` and `product/Brand.ts` inherit the three rules
 * below. `Option.cfc` and `OptionGroup.cfc` declare ZERO non-persistent properties, which makes
 * them the only two complete ports in the whole `domain/` subtree: there is no calculated-property
 * boundary to negotiate here and nothing to exclude for pricing, inventory or promotion reasons
 * (contrast §0.2.2.6, where sixteen `Product`/`Sku` members are excluded outright).
 *
 * CONVENTION 1 — THE PERSISTENT DATA SURFACE IS PUBLIC FIELDS, named exactly as the legacy
 * properties. CFML generated `getX()`/`setX()` pairs from `accessors=true`
 * [model/entity/OptionGroup.cfc:L49]; those are deliberately not reproduced. Three independent
 * justifications, the third decisive:
 *   (a) The folder specification sanctions it — "generated accessors become plain members".
 *   (b) §0.8.1 Minimal Change Clause: "It does not mean preserving CFML idioms in TypeScript;
 *       idiomatic, conventional TypeScript is expected."
 *   (c) DECISIVE — `../base/populate` implements CFML's null semantics as `delete target[name]`
 *       (its port of `_setProperty`'s `structDelete`), and an accessor-backed value cannot be
 *       deleted. `populate` and `src/adapters/mysql/rowMappers.ts` are field-oriented by
 *       construction, so fields are required for interop with the very modules that hydrate this
 *       entity.
 * Consequently every plain scalar read at a legacy call site becomes direct field access in the
 * TypeScript consumers: `getOptionGroupID()` [model/entity/Sku.cfc:L516-L517] becomes
 * `optionGroup.optionGroupID`, `getOptionGroupCode()` [model/entity/Sku.cfc:L504-L505] becomes
 * `optionGroup.optionGroupCode`, `getOptionGroupName()` [model/entity/Sku.cfc:L581] becomes
 * `optionGroup.optionGroupName`, and `getImageGroupFlag()` [model/entity/Sku.cfc:L134] becomes
 * `optionGroup.imageGroupFlag`.
 *
 * CONVENTION 2 — DECLARE A METHOD ONLY where the legacy declares a real body, or where an implicit
 * ORM member is called from in-scope code. For this entity that is exactly five members:
 * `getOptions()` [model/entity/OptionGroup.cfc:L73-L79], `hasOption()` (ORM-synthesized, forced by
 * [model/entity/Option.cfc:L94] — see F4), `addOption()`
 * [model/entity/OptionGroup.cfc:L92-L94], `removeOption()`
 * [model/entity/OptionGroup.cfc:L95-L97] and `isNew()` (derived — see F21). Nothing else. The
 * negative half of this rule is F22, below.
 *
 * CONVENTION 3 — KEEP BOTH the `options` backing field AND the `getOptions()` method. This looks
 * redundant and is not; the legacy does exactly the same thing, holding `variables.Options` behind
 * `getOptions()`. The field is required for `populate` and `rowMappers` interop (convention 1c);
 * the method is required because the AAP key-change row names it, because
 * [model/service/ProductService.cfc:L115], [model/entity/Option.cfc:L95], [:L102] and [:L104] all
 * call it, and because the live-array-by-reference contract (F2) is expressed through it.
 *
 * ---------------------------------------------------------------------------------------------
 * SOURCE MAPPING [model/entity/OptionGroup.cfc:L49]
 * ---------------------------------------------------------------------------------------------
 *   entityname="SlatwallOptionGroup"   ->  this class
 *   table="SwOptionGroup"              ->  owned by src/adapters/mysql/**, never named executably
 *                                          here (S2)
 *   hb_serviceName="optionService"     ->  src/services/OptionService.ts
 *   hb_permission="this"               ->  no counterpart; authorisation is not part of this slice
 *   extends="HibachiEntity"            ->  the LOCAL Slatwall base [model/entity/HibachiEntity.cfc],
 *                                          not the framework one (IR-8). Its `populate()` [:L56]
 *                                          becomes the descriptor set at the foot of this file
 *                                          (R-B), and its `setting()` [:L129] has no consumer on
 *                                          this entity, so no SettingResolverPort is reached from
 *                                          here.
 *   cacheuse="transactional"           ->  ⚠️ FLAGGED, NOT EMULATED (S8 / mismatch M7). 111 of the
 *                                          113 legacy entities carry this attribute. A warm Lambda
 *                                          container persists module scope across invocations and
 *                                          therefore across tenants, so a module-scope second-level
 *                                          cache would be a correctness hazard rather than an
 *                                          optimisation. This module holds no cache, no registry,
 *                                          no counter, no singleton and no mutable module-scope
 *                                          binding; the two module constants below are frozen and
 *                                          content-free. Loading this module has no side effect,
 *                                          performs no I/O and logs nothing.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ M6 — THE VALIDATION READ-BACK LOOP: THIS FILE SUPPLIES READS AND RESOLVES NOTHING
 * ---------------------------------------------------------------------------------------------
 * `Sku.hasOneOptionPerOptionGroup()` [model/entity/Sku.cfc:L771-L784] reads
 * `getOptions()[i].getOptionGroup().getOptionGroupID()` at [:L776] and [:L779], and
 * `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L756-L769] drives a database read-back during
 * save — which §0.6.2 calls "the highest-risk item in the slice". This file's only obligation is
 * that `optionGroupID` be a plain, synchronously readable field, so those consumers need no async
 * hop and no port. The ordering hazard itself is owned by `src/adapters/mysql/UnitOfWork.ts` and is
 * deliberately not addressed here. (Informational, for whoever ports `Sku.ts`: the `listFind` at
 * [model/entity/Sku.cfc:L776] is CASE-SENSITIVE — `listFindNoCase` is the insensitive variant.)
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ F22 — NEGATIVE MANDATE: NO FRAMEWORK MEMBER IS INVENTED HERE
 * ---------------------------------------------------------------------------------------------
 * None of the following is declared on this class: `getSimpleRepresentation`,
 * `getSimpleRepresentationPropertyName`, `getPrimaryIDPropertyName`, `getPrimaryIDValue`,
 * `getNewFlag`, `validate`, `hasErrors`, `getErrors`, `getPropertyMetaData`, `onMissingMethod`,
 * `populate`, `getPropertySmartList`, `setting`, `getService` or `getAttributeValue`. Three reasons,
 * each independently sufficient: they are `org/Hibachi/**` members and that tree of 938 files is
 * "a boundary to extract from, never modify" (§0.8.3.2); the AAP key-change row for this file names
 * none of them; and unrequested surface is forbidden outright.
 *
 * Recorded because it looks like a gap and is not: the framework's
 * `getSimpleRepresentationPropertyName()` [org/Hibachi/HibachiEntity.cfc:L74-L87] scanned properties
 * for one named `getClassName() & "name"` — a case-insensitive CFML `==` — and threw when none
 * matched. For this entity it resolved to `optionGroupName`, which is declared below, so the entity
 * satisfies the legacy assertion `simple_representation_exists_and_is_simple`
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] structurally, without the member.
 * `isNew()` is the ONE exception to this mandate, for the reason given on it.
 *
 * ---------------------------------------------------------------------------------------------
 * IMPORT DISCIPLINE (S4 hexagonal separation, §0.4.3.5)
 * ---------------------------------------------------------------------------------------------
 * Three imports, and the list is closed. Two reach the sibling `base/` modules that hydrate this
 * entity; the third is type-only and mutual (R-A, below). Nothing from `src/adapters/**`,
 * `src/services/**`, `src/config/**`, `src/validation/**`, `src/handlers/**`,
 * `src/integrations/**`, `src/util/**`, `src/errors/**` or `src/ports/**` is imported, no AWS type
 * appears, no `node:` builtin is used, the environment is never read, and nothing is imported from
 * `node_modules` — not the single runtime dependency the manifest declares, and none of `uuid`,
 * `zod`, `class-validator`, `lodash`, `date-fns` or `reflect-metadata` (S5: the manifest is closed
 * and this file adds nothing to it). Every specifier is relative and extensionless, because
 * `tsconfig.json` declares neither `paths` nor `baseUrl` so that `tsc` and `esbuild` resolve
 * identically, per AAP §0.4.3.5. Named exports
 * only and no default export, no top-level `await` and no `import.meta`, because the artifact is
 * bundled to CommonJS for the Node 20 Lambda runtime.
 */

import { AUDIT_PROPERTY_NAMES } from '../base/AuditableEntity';
import type { AuditPropertyName, AuditableEntity } from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  OneToManyPropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
/*
 * ⚠️ R-A — THE MUTUAL TYPE REFERENCE WITH `./Option`, AND WHY IT IS SAFE.
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
export class OptionGroup implements AuditableEntity {
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
   * ⚠️ F21 — TYPED `string` AND INITIALISED TO `''`, NEVER OPTIONAL AND NEVER NULL. This is the
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
   * ⚠️ F20 / TODO(boundary) — THIS FIELD IS ORM-LIFECYCLE-ASSIGNED. NOTHING IN APPLICATION CODE
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
   * ⚠️ S7 — LATENT ISSUE RECORDED, NOT REPAIRED. This column is `required="true"` precisely because
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
   *   inverse="true"               — ⚠️ `Option` OWNS THE FOREIGN KEY. This is exactly why
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
   * ⚠️ F2 — RETURNING THE LIVE ARRAY IS BEHAVIOUR, NOT STYLE. A DEFENSIVE COPY IS FORBIDDEN.
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
   * ⚠️ F1 / TODO(parity) — THE OVERLOAD IS COLLAPSED, DELIBERATELY AND WITH EVIDENCE.
   * The legacy signature was `getOptions(orderby, sortType="text", direction="asc")` and its second
   * branch is UNREACHABLE DEAD CODE. Grep-proved repository-wide across `model/`,
   * `integrationServices/`, `admin/` and `frontend/`: the only line matching `getOptions(` with a
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
   * ⚠️ F9 / TODO(boundary) — `getOptionsSmartList()` IS DELIBERATELY ABSENT.
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
   * ⚠️ F12 — THE DELETE GUARD AND `cascade="all-delete-orphan"` ARE IN GENUINE TENSION. BOTH ARE
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
   * ⚠️ F4 / IR-1 — THIS MEMBER APPEARS NOWHERE IN THE LEGACY SOURCE AND MUST STILL BE DECLARED.
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
   * ⚠️ WHEN THIS GUARD IS ACTUALLY LIVE — OBSERVED BEHAVIOUR, CARRIED AND NOT REPAIRED (S7).
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
   * absent [:L99-L101]. The source passes the group explicitly here, so the port does too.
   *
   * @param option - The option to detach from this group.
   */
  removeOption(option: Option): void {
    option.removeOptionGroup(this);
  }

  /**
   * Whether this group has never been persisted.
   *
   * ⚠️ F21 — A PURE DERIVED PREDICATE: THE PRIMARY IDENTIFIER EQUALS THE EMPTY STRING. `newFlag` is
   * declared `persistent="false"` on the framework base, but no `setNewFlag` exists anywhere in the
   * repository — nothing stores this. The full chain: `unsavedvalue="" default=""`
   * [model/entity/OptionGroup.cfc:L52]; `getPrimaryIDValue()` returns the primary-ID property
   * [org/Hibachi/HibachiEntity.cfc:L244]; `getNewFlag() { if(getPrimaryIDValue() == "") return
   * true; return false; }` [org/Hibachi/HibachiEntity.cfc:L571-L576]; and
   * `isNew() { return getNewFlag(); }` [org/Hibachi/HibachiEntity.cfc:L707-L709].
   *
   * THIS MEMBER REQUIRES ZERO PORTS AND ZERO DATABASE ACCESS, which is what makes the entity
   * cheaply constructible (S6) and what lets the guard at [model/entity/Option.cfc:L94] work with no
   * collaborator at all. It also gives `defaults_are_correct`
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L66-L69] its two assertions for free.
   *
   * TWO THINGS RECORDED PRECISELY RATHER THAN APPROXIMATELY. First, `isNew()` sits inside the
   * framework's "Deprecated Methods" section, opened at [org/Hibachi/HibachiEntity.cfc:L705], yet
   * in-scope code still calls it — so it is ported anyway, and it is the ONE exception to the F22
   * negative mandate in the module header. Second, and stated exactly because the distinction is
   * easy to garble: the unqualified `isNew()` at [model/entity/Option.cfc:L94] resolves to the
   * OPTION's own inherited predicate, not to this group's — a repository-wide grep finds no
   * `optionGroup.isNew()` call site at all. The member is declared here because it is the identical
   * predicate inherited from the same base class by every entity, because the legacy entity-test
   * base reads it on every entity, and because it is part of the convention this module sets for
   * `sku/` and `product/`.
   *
   * @returns `true` when the group has not been persisted yet.
   */
  isNew(): boolean {
    return this.optionGroupID === '';
  }
}

/* ===============================================================================================
 * ⚠️ R-B — THE POPULATION CONTRACT: A DECLARED DESCRIPTOR SET, AND NO `populate()` METHOD
 * ===============================================================================================
 * `OptionGroup` HAS NO `populate()` MEMBER, deliberately. In the legacy tree the method arrived by
 * inheritance from the local base [model/entity/HibachiEntity.cfc:L56] and reflected over component
 * metadata at runtime. Two independent reasons it is not re-created here: §0.3.3 replaces
 * template-method inheritance with composition, so there is no base class to inherit it from; and
 * `../base/populate` declares its contract as a free function taking a `descriptorSet` parameter,
 * which is exactly so that per-entity metadata is supplied BY the entity module rather than
 * discovered inside the engine (TR-3). Callers write:
 *
 *     populate(optionGroup, data, OPTION_GROUP_PROPERTY_DESCRIPTORS);
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
 * ⚠️ WHY `optionGroupID` IS OMITTED — A G6 TRANSLATION DECISION, NOT AN OVERSIGHT. The primary
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
 *   - `hb_populateEnabled="public"` occurs 68 times repository-wide and ZERO times in scope; only
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
const AUDIT_PROPERTY_DESCRIPTORS: readonly ColumnPropertyDescriptor<AuditPropertyName>[] =
  Object.freeze(
    AUDIT_PROPERTY_NAMES.map<ColumnPropertyDescriptor<AuditPropertyName>>((auditPropertyName) => ({
      name: auditPropertyName,
      kind: 'column',
      populateEnabled: false,
    })),
  );

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
    { name: 'optionGroupName' },
    { name: 'optionGroupCode' },
    { name: 'optionGroupImage' },
    { name: 'optionGroupDescription' },
    { name: 'imageGroupFlag' },
    { name: 'sortOrder' },
    { name: 'remoteID' },
  ]);

/**
 * The population contract for `OptionGroup`, minus the `options` relationship.
 *
 * Eleven descriptors: the seven columns of [model/entity/OptionGroup.cfc:L53-L58] and [:L61], plus
 * the four populate-disabled audit properties of [:L64-L67]. `persistent: true` ports
 * `persistent=true` on the component declaration at [model/entity/OptionGroup.cfc:L49], and it is
 * consequential rather than decorative: the legacy authorisation gate short-circuits for
 * NON-persistent targets, so process objects populate freely while entities such as this one had
 * per-property authorisation consulted.
 *
 * ⚠️ WHY THE `options` RELATIONSHIP IS NOT IN THIS CONSTANT — A MISMATCH FLAGGED RATHER THAN
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
    persistent: true,
    properties: Object.freeze([...OPTION_GROUP_PROPERTY_DESCRIPTORS.properties, optionsDescriptor]),
  });
}
