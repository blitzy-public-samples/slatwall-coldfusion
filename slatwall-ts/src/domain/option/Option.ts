/**
 * Option — the `SwOption` catalog entity of Slatwall 3.1.39, re-expressed as strict-mode TypeScript.
 *
 * Ported from [model/entity/Option.cfc]. AAP §0.4.1.4 names exactly three things for this module —
 * five persistent properties, the required option-group relationship, and the SKUs relationship
 * inverse over `SwSkuOption` — and that row is the scope. [model/entity/Option.cfc] declares six
 * further relationships and twelve further methods, every one of which reaches explicitly
 * out-of-scope territory; each is catalogued with its locator in the exclusion block below and then
 * omitted, so the omission reads as a decision rather than an oversight (S8).
 *
 * THIS IS ONE OF ONLY THREE COMPLETE PORTS IN THE `domain/` SUBTREE. AAP §0.2.2.6 states it directly:
 * "`Brand.cfc`, `Option.cfc` and `OptionGroup.cfc` declare no non-persistent properties at all, so
 * they are unaffected." The legacy source declares no `persistent="false"` property, so there is no
 * calculated-property boundary to negotiate here and nothing is excluded for pricing, promotion,
 * inventory or currency reasons — contrast the sixteen `Product`/`Sku` members §0.2.2.6 excludes.
 * Everything this entity omits, it omits because the RELATED TYPE is out of scope, never because the
 * member itself reaches a port.
 *
 * LABELS USED THROUGHOUT THIS FILE. `S1`-`S9` are the AAP §0.7.3 enterprise standards. `R-A`, `R-B`
 * and `R-C` are this module's three structural decisions — the type-only mutual reference with
 * `./OptionGroup`, the declared descriptor set that replaces `populate()`, and the narrow local
 * interfaces that stand in for out-of-scope collaborators. `F<n>` are this port's file-scope rules,
 * cited where they bite: F2 (a collection getter returns the LIVE array), F3 (a legacy short-circuit
 * is preserved exactly), F5 (`optionGroup` is typed optional), F6 (the index-base sentinel
 * translation), F7 (newly found copy-paste defects, recorded not ported), F8 (a collaborator arrives
 * as a parameter, never a lookup), F11 (a delegation stays a delegation), F12 (validation lives in
 * `src/validation/**`), F20 (`sortOrder` is ORM-lifecycle-assigned and never assigned here), F21
 * (`isNew` is a pure derived predicate) and F22 (no framework member is declared on this class).
 *
 * THE ENTITY-MODULE CONVENTION, SHARED WITH `./OptionGroup`:
 *
 *   1. THE PERSISTENT DATA SURFACE IS PUBLIC FIELDS, named exactly as the legacy properties. CFML
 *      generated `getX()`/`setX()` pairs from `accessors=true` [model/entity/Option.cfc:L49] and those
 *      are deliberately not reproduced, for three reasons of which the third is decisive: the folder
 *      specification sanctions it; AAP §0.8.1 asks for idiomatic TypeScript rather than preserved CFML
 *      idioms; and `../base/populate` implements CFML's null semantics as `delete target[name]`, its
 *      port of `_setProperty`'s `structDelete`, which an accessor-backed value cannot satisfy —
 *      `populate` and `src/adapters/mysql/rowMappers.ts` are field-oriented by construction, so fields
 *      are required for interop with the very modules that hydrate this entity. Consequently every
 *      legacy scalar read becomes direct field access: `getOptionCode()`
 *      [model/entity/Sku.cfc:L135] becomes `option.optionCode`, `getOptionName()`
 *      [model/entity/Sku.cfc:L236], [:L581], [:L867], [:L888] and
 *      [model/service/OptionService.cfc:L59] becomes `option.optionName`, `getOptionID()`
 *      [model/entity/Sku.cfc:L760] becomes `option.optionID`, and `getSortOrder()` becomes
 *      `option.sortOrder`.
 *   2. DECLARE A METHOD ONLY where the legacy declares a real body, or where an implicit ORM member is
 *      called from in-scope code. For this entity that is exactly six members: `getImageDirectory()`
 *      [model/entity/Option.cfc:L81-L83], `setOptionGroup()` [:L92-L97], `removeOptionGroup()`
 *      [:L98-L107], `addSku()` [:L110-L112], `removeSku()` [:L113-L115] and the derived `isNew()`,
 *      which this entity's own [:L94] calls. Nothing else — and in particular NO collection getter,
 *      because unlike `OptionGroup.getOptions()` [model/entity/OptionGroup.cfc:L73-L79] this entity
 *      exposes no collection accessor with a body at all.
 *   3. EVERY LEGACY BEHAVIOURAL CLAIM CARRIES AN INLINE `path:locator` CITATION so each statement can
 *      be verified against source. `TODO(parity)` marks a carried defect; `TODO(boundary)` marks an
 *      out-of-scope collaborator.
 *
 * THE COMPONENT DECLARATION [model/entity/Option.cfc:L49], attribute by attribute:
 *
 *   entityname="SlatwallOption"          ->  this class
 *   table="SwOption"                     ->  owned by `src/adapters/mysql/**`; never named in an
 *                                            executable position here (S2)
 *   hb_serviceName="optionService"       ->  `src/services/OptionService.ts`
 *   hb_permission="optionGroup.options"  ->  PERMISSION IS DELEGATED THROUGH THE PARENT GROUP, not
 *                                            declared on this entity — the same ownership asymmetry
 *                                            that makes `OptionGroup.addOption` a one-line delegation
 *                                            into this class. Authorisation is not part of this slice,
 *                                            so the attribute has no counterpart in the port.
 *   extends="HibachiEntity"              ->  the LOCAL Slatwall base [model/entity/HibachiEntity.cfc],
 *                                            not the framework one (IR-8). Its `populate()` [:L56]
 *                                            becomes the descriptor set at the foot of this file
 *                                            (R-B), and its `setting()` [:L129-L131] is reached by
 *                                            exactly one member here — see F8 on
 *                                            {@link Option.getImageDirectory}.
 *   cacheuse="transactional"             ->  FLAGGED, NOT EMULATED (S8 / mismatch M7). A warm Lambda
 *                                            container persists module scope across invocations and
 *                                            therefore across tenants, so a module-scope second-level
 *                                            cache would be a correctness hazard rather than an
 *                                            optimisation. This module holds no cache and no mutable
 *                                            module-scope binding; its two module constants are
 *                                            frozen and content-free, and loading it has no side
 *                                            effect. The legacy entity memoised nothing either, so
 *                                            nothing is lost — contrast [model/entity/Sku.cfc:L500-L522],
 *                                            whose per-instance memoisation carries defects D1 and D2.
 *
 * M6 — THE VALIDATION READ-BACK LOOP: THIS FILE SUPPLIES READS AND RESOLVES NOTHING. AAP §0.6.2 calls
 * it "the highest-risk item in the slice", and both halves read THIS entity:
 * `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L756-L769] builds a list from
 * `getOptions()[i].getOptionID()` at [:L760] and then drives a DATABASE READ-BACK DURING SAVE at
 * [:L763] through `getProduct().getSkusBySelectedOptions(...)`; and
 * `Sku.hasOneOptionPerOptionGroup()` [model/entity/Sku.cfc:L772-L784] reads
 * `getOptions()[i].getOptionGroup().getOptionGroupID()` at [:L776] and [:L779]. This module's ONLY
 * obligation is that `optionID` and `optionGroup` are plain, SYNCHRONOUSLY readable fields — no async
 * hop, no port, no lazy load — so those consumers need no collaborator to read them. The ordering
 * hazard itself belongs to `src/adapters/mysql/UnitOfWork.ts` and is deliberately not addressed here
 * (S8: flag it, resolve nothing). One detail for whoever ports `Sku.ts`, not acted on here: the
 * `listFind` at [model/entity/Sku.cfc:L776] is CASE-SENSITIVE, `listFindNoCase` being the insensitive
 * variant.
 *
 * F22 — NO FRAMEWORK MEMBER IS DECLARED HERE: not the primary-identifier or new-flag accessors, not
 * `validate`/`hasErrors`/`getErrors`, and not `getPropertyMetaData`, `onMissingMethod`, `populate`,
 * `getPropertySmartList`, `setting`, `getService`, `getAttributeValue`, `getSimpleRepresentation` or
 * `getSimpleRepresentationPropertyName`. They are `org/Hibachi/**` members, and that tree is "a
 * boundary to extract from, never modify" (AAP §0.8.3.2); the AAP key-change row for this file names
 * none of them; and unrequested surface is forbidden outright. `getOptionsForSelect` deserves its own
 * line because it is the member most likely to be mistaken for an entity method: it is a SERVICE
 * member [model/service/OptionService.cfc:L55-L62] belonging to `src/services/OptionService.ts`, whose
 * `{name, value}` projection [:L59] is assembled THERE from the plain `optionName` and `optionID`
 * fields declared below. Its loop variable is unscoped at [:L58] — a real defect in a file this port
 * does not own, neither fixed nor imitated (S7).
 *
 * Recorded because it looks like a gap and is not: the framework's
 * `getSimpleRepresentationPropertyName()` [org/Hibachi/HibachiEntity.cfc:L74-L87] scanned properties
 * for one named `getClassName() & "name"` and threw when none matched. For this entity it resolved to
 * `optionName`, which is declared below, so the entity satisfies the legacy assertion
 * `simple_representation_exists_and_is_simple`
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] structurally, without the member.
 * `isNew()` is the ONE exception to this mandate, forced by this entity's own [:L94].
 *
 * IMPORT DISCIPLINE (S4 hexagonal separation). Three import statements and the list is closed: two
 * reach the sibling `base/` modules that hydrate this entity, and the third is the type-only mutual
 * reference to `./OptionGroup` (R-A). Nothing is imported from `src/adapters/**`, `src/services/**`,
 * `src/config/**`, `src/validation/**`, `src/handlers/**`, `src/integrations/**`, `src/util/**`,
 * `src/errors/**` or `src/ports/**`; no sibling entity module other than `./OptionGroup` is reached;
 * no AWS type appears; no `node:` builtin is used; the environment is never read; and nothing comes
 * from `node_modules` (S5 — the manifest is closed and this file adds nothing to it). Every specifier
 * is relative and extensionless because `tsconfig.json` declares neither `paths` nor `baseUrl`, so
 * `tsc` and `esbuild` resolve identically; named exports only, no default export, no top-level
 * `await` and no `import.meta`, because the artifact is bundled to CommonJS for the Node 20 Lambda
 * runtime.
 *
 * ONE DELIBERATE NON-IMPORT, RECORDED SO IT READS AS A DECISION. `src/ports/SettingResolverPort.ts`
 * declares its `setting` member in method syntax with an OPTIONAL context precisely so that a sibling
 * narrowing the name to a single literal still accepts a full implementation of the port. This module
 * honours that design WITHOUT importing it: the domain layer reaching into `src/ports/**` would invert
 * the direction S4 exists to protect. {@link OptionImageDirectoryResolver} is therefore shaped so a
 * full `SettingResolverPort` implementation satisfies its `setting` half structurally — method syntax,
 * one required parameter, an accepted optional second — which is exactly the interoperability the port
 * asks for. This entity's only setting read is `'globalAssetsImageFolderPath'`
 * [model/entity/Option.cfc:L82].
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
/*
 * R-A — THE MUTUAL TYPE REFERENCE WITH `./OptionGroup`, AND WHY IT IS SAFE.
 *
 * `Option.optionGroup` is an `OptionGroup`; `OptionGroup.options` is an `Option[]`. That is a genuine
 * two-way reference and it is resolved deliberately rather than broken: NEITHER CLASS EVER
 * INSTANTIATES THE OTHER. {@link Option.setOptionGroup} only calls `optionGroup.getOptions()`
 * [model/entity/Option.cfc:L95] and `optionGroup.hasOption(...)` [:L94], while
 * `OptionGroup.addOption` only calls `option.setOptionGroup(this)`
 * [model/entity/OptionGroup.cfc:L93]. Both directions are therefore type-only, `import type` is
 * FULLY ERASED AT EMIT, and the bundle contains no circular CommonJS module load and no
 * initialisation-order hazard. `./OptionGroup` imports this module the same way, on purpose.
 *
 * It is emphatically NOT resolved by forking a duplicate local structural interface for
 * `OptionGroup` — that would split the type in two and hand the `Sku` and `Product` consumers the
 * wrong one — nor by weakening `optionGroup` to a locally invented shape. The real type is imported
 * and its real members are called.
 */
import type { OptionGroup } from './OptionGroup';

/**
 * Every property name [model/entity/Option.cfc] declares WITHIN THIS FILE'S SCOPE — the union
 * `populate` is keyed by.
 *
 * Twelve names, in source declaration order, matching the source block for block: the five
 * persistent properties [model/entity/Option.cfc:L52-L56], the in-scope many-to-one `optionGroup`
 * [:L59], the in-scope many-to-many inverse `skus` [:L66], the one remote property [:L73] and the
 * four audit properties [:L76-L79].
 *
 * The four audit names are spliced in through `AuditPropertyName` rather than written out a second
 * time, so this union cannot drift from the frozen tuple `../base/AuditableEntity` exports nor from
 * the exclusion the population engine applies with it.
 *
 * THE SIX OUT-OF-SCOPE RELATIONSHIP NAMES ARE ABSENT FROM THIS UNION ON PURPOSE — `defaultImage`
 * [:L60], `images` [:L63], `promotionRewards` [:L67], `promotionRewardExclusions` [:L68],
 * `promotionQualifiers` [:L69] and `promotionQualifierExclusions` [:L70]. Because the union is what
 * keys every descriptor, their absence here is what makes describing one a COMPILE ERROR rather than
 * a matter of discipline. See the exclusion register below for why each is out of scope.
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
 * ⚠️ NOT the same as {@link OPTION_ENTITY_NAME}: this one carries no `Slatwall` prefix. It is
 * interpolated into every validation message
 * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216] and into the property-metadata
 * failure [org/Hibachi/HibachiTransient.cfc:L746], so a prefixed value here would change observable
 * message text.
 */
export const OPTION_CLASS_NAME = 'Option';

/**
 * The mapped ORM entity name, declared by the `entityname` attribute on
 * [model/entity/Option.cfc:L49] and read at runtime by [org/Hibachi/HibachiEntity.cfc:L287-L289].
 *
 * ⚠️ THIS IS THE LOGICAL ENTITY NAME, NOT THE PHYSICAL `Sw*` TABLE NAME. The legacy uniqueness
 * statement [org/Hibachi/HibachiDAO.cfc:L140] is expressed over the mapped object graph, so the
 * prefixed form is correct there and is not a defect to correct; translating it to a table is the
 * adapter's responsibility.
 */
export const OPTION_ENTITY_NAME = 'SlatwallOption';

/**
 * The name of the primary identifier property — [model/entity/Option.cfc:L52], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 *
 * The legacy resolved this name through `getService("hibachiService")`
 * [org/Hibachi/HibachiEntity.cfc:L249-L251]. Declaring it removes the service locator AAP 0.7.3 S3
 * forbids, and it is what makes the value safe to place in identifier position after the adapter
 * validates it: the name comes from entity metadata, never from caller input.
 */
export const OPTION_PRIMARY_ID_PROPERTY_NAME = 'optionID';

/**
 * Every property this entity DECLARES, as a keyed set — the port of `getPropertiesStruct()`, the
 * structure [org/Hibachi/HibachiTransient.cfc:L739] resolves and which both `hasProperty` [:L764]
 * and `getPropertyMetaData` [:L741] key into. A CFML struct keyed by property name is what the
 * legacy held; a keyed object is what this holds, and membership is an own-key test in both.
 *
 * ⚠️ THE `DeclaredPropertyNameSet<OptionPropertyName>` ANNOTATION IS THE POINT, NOT DECORATION. It checks this
 * set against the entity's property-name union in BOTH directions: a MISSING name fails to compile
 * ("Property 'x' is missing in type"), and an INVENTED one fails to compile too (the object is not
 * assignable). Both directions matter. A missing name would make `hasProperty` answer false, and
 * [org/Hibachi/HibachiValidationService.cfc:L171] SILENTLY SKIPS a rule whose property is absent —
 * so a validation rule would stop running with no error anywhere in the port. An invented name
 * would START running a rule the legacy never ran.
 *
 * ⭐ THIS SET IS THE ENTITY'S COMPLETE DECLARED SURFACE, because [model/entity/Option.cfc] declares
 * NO non-persistent property at all — a fact AAP 0.2.2.6 records explicitly ("`Brand.cfc`,
 * `Option.cfc` and `OptionGroup.cfc` declare no non-persistent properties"). Every identifier
 * `model/validation/Option.json` names — `optionCode` [:L3], `optionName` [:L4], `optionGroup` [:L5]
 * and `skus` [:L6] — is present here, so all four of that document's rules genuinely RUN, unlike the
 * `physicalCounts` delete guards on the sibling entities, which the presence gate skips.
 *
 * ⚠️ THIS IS A STATEMENT ABOUT WHAT THE LEGACY ENTITY DECLARES, NOT ABOUT WHAT THIS PORT
 * IMPLEMENTS, and the two differ deliberately. AAP 0.2.2.6 excludes the pricing, promotion,
 * inventory and currency-derived calculated members from the port because they reach exclusively
 * into out-of-scope services — yet the legacy still DECLARES them, so `hasProperty` must still
 * answer true for them exactly as the legacy does. Trimming this set to the implemented surface
 * would be the "missing name" failure above dressed up as tidiness.
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
 * and {@link OPTION_PROPERTY_DESCRIPTORS} reads its `className` from here so the literal is written
 * once.
 *
 * ⚠️ THIS ENTITY IS THE ONE IN THE SLICE WHOSE DECLARED SET AND FIELD SET DIVERGE, AND THE DIVERGENCE
 * IS MEASURED RATHER THAN INCIDENTAL. [model/entity/Option.cfc] declares EIGHTEEN persistent
 * properties; {@link OptionPropertyName} carries TWELVE of them, because six relationships reach
 * entities AAP §0.2.2.2 excludes and this port therefore does not model. The legacy predicate
 * `structKeyExists(getPropertiesStruct(), name)` answers true for all eighteen, so the six are
 * listed under `declaredNonFieldProperties` — that is what keeps `hasProperty` answering exactly as
 * the legacy predicate did, while leaving the six unreadable through
 * {@link EntityMetadataSurface.getValueByPropertyIdentifier}, which is the honest state for a
 * property this port has no field for. No in-scope rule set or uniqueness check names any of the
 * six, so the read-side divergence is unreachable; the answer-side divergence would have been
 * reachable and is therefore closed.
 *
 * TWELVE FIELD KEYS: [`:L52-L56`], [`:L59`], [`:L66`], [`:L73`] and the four audit properties at
 * [`:L76-L79`].
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
 * F8 / S3 — WHY THIS INTERFACE EXISTS AND WHY IT IS SHAPED EXACTLY LIKE THIS.
 * The legacy body is one line [model/entity/Option.cfc:L81-L83]:
 *
 *     public string function getImageDirectory() {
 *         return getURLFromPath(setting('globalAssetsImageFolderPath')) & '/option/';
 *     }
 *
 * Both of the members it calls arrive by INHERITANCE, from two different levels of the chain, and
 * both cross the scope boundary:
 *   - `setting(...)` is the local Slatwall base's helper
 *     [model/entity/HibachiEntity.cfc:L129-L131], which forwards to
 *     `getService("settingService").getSettingValue(settingName=..., object=this, ...)` — a
 *     string-keyed service locator onto the out-of-scope effective-value engine.
 *   - `getURLFromPath(...)` is the framework object's pure string transform
 *     [org/Hibachi/HibachiObject.cfc:L83-L91]: it normalises backslashes to forward slashes and then
 *     strips the expanded web-root prefix from the front of the path.
 *
 * Modelling BOTH as one collaborator is the faithful choice, not a convenience: in the legacy the two
 * were equally available on `this`, so a single injected capability set is what the method actually
 * had. `src/ports/SettingResolverPort.ts` reaches the same conclusion from the other side, recording
 * that `getURLFromPath` is deliberately NOT part of that port because "it is a pure string transform
 * over an already-resolved value ... It belongs with the consumers that call it, not in this
 * contract."
 *
 * NARROWED TO THE ONE KEY THIS ENTITY READS, AND NO WIDER. `'globalAssetsImageFolderPath'` is the
 * only setting name this file's source mentions, so the parameter type is that literal rather than a
 * broad name union. A typo becomes a compile error instead of a silent runtime miss.
 *
 * DECLARED IN METHOD SYNTAX, DELIBERATELY. Method parameters are compared bivariantly, so a full
 * `SettingResolverPort` implementation — whose signature is
 * `setting(settingName: SettingName, context?: SettingResolutionContext): SettingValue` — satisfies
 * the `setting` half of this interface even though its parameter type is wider and it accepts a
 * second argument this entity never passes. That interoperability is exactly what the port's own
 * documentation asks for, and it is why the required arity here is one.
 *
 * SUBSTITUTABLE BY A PLAIN OBJECT LITERAL (S6): no class, no abstract base, no registry, no service
 * locator, no container import and no default instance. A two-property literal satisfies it in a
 * test, which matters because the legacy suite had no mocking library at all and booted the entire
 * FW/1 application instead (§0.4.3.6).
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
 * F11 / R-C / IR-1 — THIS IS AN EXPLICIT DECLARATION OF TWO ORM-SYNTHESIZED MEMBERS, NOT MERELY A
 * FORWARD REFERENCE. [model/entity/Sku.cfc] declares no `addOption` and no `removeOption` anywhere:
 * both were SYNTHESIZED at runtime from `singularname="option"` on the owning many-to-many at
 * [model/entity/Sku.cfc:L76], which is exactly the implicit surface IR-1 requires to be declared
 * explicitly because TypeScript under `strict` has no equivalent facility. This interface is therefore
 * the first place those two members exist as declarations at all.
 *
 * THE OWNERSHIP ASYMMETRY, WHICH IS THE WHOLE REASON THOSE TWO METHODS DELEGATE. `Sku` is the OWNING
 * side: [model/entity/Sku.cfc:L75] labels the block "(many-to-many - owner)" and [:L76] declares
 * `linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"` carrying NO `inverse="true"`.
 * `Option` is the INVERSE side: [model/entity/Option.cfc:L66] declares the mirror image,
 * `linktable="SwSkuOption" fkcolumn="optionID" inversejoincolumn="skuID"`, and it DOES carry
 * `inverse="true"`. The link table is named here as prose provenance only, never in an executable
 * position (S2); the physical link belongs to `src/adapters/mysql/**`.
 *
 * A LOCAL STRUCTURAL INTERFACE RATHER THAN AN IMPORT, AND DELIBERATELY MINIMAL. It covers ONLY what
 * [model/entity/Option.cfc:L110-L115] touches — the two members — is not typed as an escape-hatch
 * collection (S1), and is named distinctly from `Sku` so it can never be mistaken for the real domain
 * type. Because TypeScript is structurally typed, a concrete `Sku` declaring these two members
 * satisfies it with no adapter and no cast.
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

/* ===============================================================================================
 * THE EXCLUSION REGISTER — SIX RELATIONSHIPS AND TWELVE METHODS THAT ARE NOT PORTED
 * ===============================================================================================
 * The AAP key-change row for this file names the five persistent properties, `optionGroup` and
 * `skus`. Everything below is in the source and is deliberately absent from the port. Each is
 * recorded with its locator so the omission reads as a decision rather than an oversight (S8), and
 * none of the six names appears in {@link OptionPropertyName}, which makes describing one a compile
 * error rather than a matter of discipline.
 *
 * SIX RELATIONSHIPS:
 *   [model/entity/Option.cfc:L60]  defaultImage  many-to-one  cfc="Image" fkcolumn="defaultImageID"
 *   [model/entity/Option.cfc:L63]  images        one-to-many  cfc="Image" cascade="all-delete-orphan"
 *       `Image` is not among the six in-scope entities (§0.2.1.2), and image concerns cross the
 *       boundary through `ImagePathPort` (§0.2.2.7 / §0.4.1.6). Note that this entity's one image
 *       member, {@link Option.getImageDirectory}, needs NEITHER of these relationships — it composes
 *       a directory from a setting, so excluding them costs the port nothing.
 *   [model/entity/Option.cfc:L67]  promotionRewards              many-to-many  SwPromoRewardOption
 *   [model/entity/Option.cfc:L68]  promotionRewardExclusions     many-to-many  SwPromoRewardExclOption
 *   [model/entity/Option.cfc:L69]  promotionQualifiers           many-to-many  SwPromoQualOption
 *   [model/entity/Option.cfc:L70]  promotionQualifierExclusions  many-to-many  SwPromoQualExclOption
 *       All four target the nine excluded `model/**` promotion components (§0.2.2.1). All four are
 *       `inverse="true"`, so the owning side — and therefore every write — lives in those excluded
 *       files regardless.
 *
 * TWELVE METHODS, all pure delegations into excluded types:
 *   [model/entity/Option.cfc:L118-L120] addPromotionReward
 *   [model/entity/Option.cfc:L121-L123] removePromotionReward
 *   [model/entity/Option.cfc:L126-L128] addPromotionRewardExclusion
 *   [model/entity/Option.cfc:L129-L131] removePromotionRewardExclusion
 *   [model/entity/Option.cfc:L134-L136] addPromotionQualifier
 *   [model/entity/Option.cfc:L137-L139] removePromotionQualifier
 *   [model/entity/Option.cfc:L142-L144] addPromotionQualifierExclusion
 *   [model/entity/Option.cfc:L145-L147] removePromotionQualifierExclusion
 *
 * F7 / TODO(parity) — TWO NEWLY DISCOVERED COPY-PASTE DEFECTS, RECORDED HERE AND NEITHER PORTED
 * NOR REPAIRED. Both `remove*Exclusion` members call `addExcludedOption` where they plainly intend
 * `removeExcludedOption`:
 *   [model/entity/Option.cfc:L129-L131] `removePromotionRewardExclusion` calls
 *       `arguments.promotionReward.addExcludedOption( this )`
 *   [model/entity/Option.cfc:L145-L147] `removePromotionQualifierExclusion` calls
 *       `arguments.promotionQualifier.addExcludedOption( this )`
 * so asking either to REMOVE an exclusion ADDS one instead. Contrast
 * their correctly-paired siblings at [:L121-L123] and [:L137-L139], which do call `removeOption`.
 * These are NOT in the AAP §0.6.7 source register — it attributes D1, D2, D3, D16 and D19 to
 * `Sku.cfc`, D5 to `Product.cfc` and D21 to `ProductType.cfc`, and lists nothing at all for this file —
 * so they are a finding of this port's own analysis, carried here WITHOUT a number of their own:
 * the register is stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus the
 * source extension D22 and the three contract corrections D23, D24 and D25, with no D26 or beyond;
 * and AAP 0.6.6's M1-M8 plus M9, with no M10 or beyond).
 *
 * The treatment S7 dictates, and the reasoning for it: because the members themselves are out of
 * scope, the honest carry-over is this record and NO CODE. Porting the two methods purely in order to
 * carry the bug would import an excluded type and widen the scope; silently correcting the call would
 * be exactly the "enhance beyond what the migration requires" that §0.8.2 Guideline 4 forbids. So the
 * defect is documented precisely enough that whoever ports the promotion slice inherits the finding
 * rather than rediscovering it.
 * =============================================================================================== */

/**
 * One selectable product option — the `SwOption` row, its parent group and its SKU links.
 *
 * PORT OF [model/entity/Option.cfc], component body L49-L159. Twelve fields and six methods; every
 * other declaration in that file is catalogued in the exclusion register above.
 *
 * `implements AuditableEntity` is an INTERFACE CONFORMANCE ASSERTION, NOT INHERITANCE. There is no
 * `extends` clause on this class and no base entity class exists in this subtree at all: §0.3.3
 * replaces the legacy template-method reuse with composition, and `../base/AuditableEntity` states
 * its own contract as "a type plus free functions", satisfied structurally. Declaring the interface
 * costs nothing at run time and makes the compiler prove the four audit fields match the shared shape
 * exactly, which is stronger than a comment promising they do.
 *
 * CONSTRUCTIBLE WITH NO ARGUMENT, BY MANDATE (S6). There is no constructor, no injected collaborator,
 * no framework bootstrap, no container, no database handle and no input/output anywhere in this class,
 * so `new Option()` succeeds anywhere. The legacy suite could not do this: every test extended a base
 * that booted the entire FW/1 application and resolved services through DI/1, and the repository
 * vendors no mocking library at all (§0.4.3.6). A fresh instance also satisfies the legacy base
 * assertion `defaults_are_correct` [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] by
 * construction: `isNew()` is `true` [:L65] and the primary identifier has zero length [:L66].
 * The one member with a genuine external dependency, {@link Option.getImageDirectory}, takes it as a
 * PARAMETER rather than holding it, which is precisely what keeps construction free (S3).
 *
 * ONE NOTE ON FIELD EMIT, RECORDED BECAUSE IT IS OBSERVABLE AND MUST NOT BE "FIXED" BY INVENTING
 * SOMETHING (S8/S9). CFML models a null column as a KEY ABSENT FROM `variables`, which is why
 * `../base/populate` clears a value with `delete` and why every nullable column below is optional
 * rather than explicitly union-ed with `undefined`. `tsconfig.json` targets ES2022, so
 * `useDefineForClassFields` defaults to `true` and a declared-but-uninitialised field is materialised
 * with the value `undefined` at construction rather than left absent. For a SCALAR COLUMN that
 * distinction is invisible to every consumer in this slice — `exactOptionalPropertyTypes` already
 * forces each reader to handle `undefined`, `JSON.stringify` omits it, and `delete` restores true
 * absence — so the scalar columns below are documented here rather than papered over with a `declare`
 * modifier or a hand-written constructor the source does not have. The sibling `./OptionGroup` records
 * the identical note for its scalars; that convention is shared.
 *
 * THE ONE ASSOCIATION FIELD IS THE EXCEPTION, AND IT IS AN EXCEPTION ON PURPOSE.
 * {@link Option.optionGroup} carries `declare`, so it is genuinely ABSENT on a fresh instance rather
 * than present holding `undefined`. `./OptionGroup` needs no such exception because it declares no
 * many-to-one at all. The reason is a contract owned one layer out:
 * `src/adapters/mysql/rowMappers.ts` hydrates scalar columns only, leaves every many-to-one
 * UNRESOLVED, and guarantees that an unresolved association is absent — a guarantee the sibling
 * entities `Product`, `Sku` and `Brand` already honour by declaring their association fields the same
 * way. See the field's own doc comment.
 */
export class Option implements AuditableEntity, ManagedEntity {
  /* -------------------------------------------------------------------------------------------
   * Persistent Properties — [model/entity/Option.cfc:L52-L56]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The primary identifier.
   *
   * PORT OF [model/entity/Option.cfc:L52]:
   *   property name="optionID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *            unsavedvalue="" default="";
   *
   * F21 — TYPED `string` AND INITIALISED TO `''`, NEVER OPTIONAL AND NEVER NULL. This is the single
   * most load-bearing typing decision in the file, and on THIS entity it is doubly so, because
   * {@link Option.setOptionGroup} consults `isNew()` at [model/entity/Option.cfc:L94] and `isNew()` is
   * DERIVED FROM THIS FIELD rather than stored. The chain, end to end:
   *   `unsavedvalue="" default=""` here;
   *   `getPrimaryIDValue()` returns the primary-ID property [org/Hibachi/HibachiEntity.cfc:L244];
   *   `getNewFlag() { if(getPrimaryIDValue() == "") return true; return false; }`
   *     [org/Hibachi/HibachiEntity.cfc:L571-L576];
   *   `isNew() { return getNewFlag(); }` [org/Hibachi/HibachiEntity.cfc:L707-L709].
   * Typing this member as optional would break that derivation under `exactOptionalPropertyTypes` and
   * would cost the entity its zero-dependency constructibility.
   *
   * Once persisted the value is a 32-character LOWERCASE HEX string with NO DASHES (IR-6: 107 of the
   * 113 legacy entities declare `fieldtype="id" generator="uuid" ormtype="string" length="32"`, and
   * identifiers are neither dashed RFC-4122 values nor auto-increment numbers). Generation is owned by
   * `src/util/uuid.ts` and is deliberately NOT performed here — the domain layer never assigns it.
   *
   * READ SYNCHRONOUSLY BY THE M6 VALIDATION READ-BACK: `Sku.hasUniqueOptions()` builds its option
   * list from this field at [model/entity/Sku.cfc:L760]. See the M6 block in the module header.
   * Also projected as the `value` half of the unused-option row at [model/dao/OptionDAO.cfc:L88] and
   * of the select projection at [model/service/OptionService.cfc:L59].
   */
  optionID: string = '';

  /**
   * The option's stable code, used as a lookup and naming key rather than for display.
   *
   * PORT OF [model/entity/Option.cfc:L53] `property name="optionCode" ormtype="string";`
   *
   * Read by `Sku.generateImageFileName()` at [model/entity/Sku.cfc:L135], which strips it to
   * `[a-z0-9\-\_]` before appending it to a generated image file name — and only for options whose
   * group carries `imageGroupFlag` [:L134].
   *
   * VALIDATION, DOCUMENTED AND NOT IMPLEMENTED (F12) — [model/validation/Option.json:L3] declares
   * `[{"contexts":"save","required":true,"unique":true,"regex":"^[a-zA-Z0-9-_.|:~^]+$"}]`. The pattern
   * is reproduced byte-exactly above as PROSE and is deliberately NOT compiled into a regular
   * expression here. Three owners, none of them this file: the rule set is
   * `src/validation/rules/option.rules.ts`, the uniqueness half is an application-side existence query
   * (IR-5, ported from [org/Hibachi/HibachiDAO.cfc:L130-L146]) owned by
   * `src/adapters/mysql/UniquePropertyChecker.ts`, and the required half is evaluated in the `save`
   * context only. IR-5 matters because the legacy enforced uniqueness in APPLICATION CODE DURING
   * VALIDATION, independently of the column metadata, so a database constraint alone would not
   * reproduce the observable behaviour.
   */
  optionCode?: string;

  /**
   * The option's display name — the "Large" in a "Size: Large" SKU definition.
   *
   * PORT OF [model/entity/Option.cfc:L54] `property name="optionName" ormtype="string";`
   *
   * The most widely read field on this entity. Consumers: `Sku.getOptionsDisplay()`
   * [model/entity/Sku.cfc:L236], `Sku.getSkuDefinition()` [:L581] — which renders
   * `" #optionGroup.getOptionGroupName()#: #option.getOptionName()#"` — and [:L867], [:L888]. It is
   * also the `name` half of both option projections: the `"<group> - <option>"` label at
   * [model/dao/OptionDAO.cfc:L88] and the plain select projection at
   * [model/service/OptionService.cfc:L59].
   *
   * It is additionally the property the framework's simple-representation scan resolves to for this
   * entity; see F22 in the module header.
   *
   * VALIDATION, DOCUMENTED AND NOT IMPLEMENTED (F12) — [model/validation/Option.json:L4] declares
   * `[{"contexts":"save","required":true}]`, owned by `src/validation/rules/option.rules.ts`.
   */
  optionName?: string;

  /**
   * Long-form description of the option.
   *
   * PORT OF [model/entity/Option.cfc:L55]:
   *   property name="optionDescription" ormtype="string" length="4000" hb_formFieldType="wysiwyg";
   *
   * BOTH EXTRA ATTRIBUTES ARE RECORDED HERE AS COMMENTS AND NOWHERE ELSE (S9), and they are two
   * different kinds of metadata:
   *   - `length="4000"` is DDL metadata for the column. [model/validation/Option.json] declares no
   *     rule of any kind for this property, so there is NO runtime length check, NO truncation and NO
   *     validator. Inventing one would be inventing behaviour the source does not have.
   *   - `hb_formFieldType="wysiwyg"` is ADMIN-UI metadata, and the `admin/**` tree of 352 files is
   *     explicitly out of scope (§0.2.2.2). It is NOT the `hb_formatType` attribute that appears once
   *     in scope at [model/entity/Brand.cfc:L57]; they are different attributes, and neither is
   *     consulted by the population path. So no HTML sanitiser, no rich-text handling and no escaping
   *     is added here — that would be inventing a security control the legacy did not have, in the
   *     wrong layer.
   */
  optionDescription?: string;

  /**
   * The option's position in the ordering WITHIN ITS PARENT GROUP.
   *
   * PORT OF [model/entity/Option.cfc:L56]:
   *   property name="sortOrder" ormtype="integer" sortContext="optionGroup";
   *
   * F20 / TODO(boundary) — THIS FIELD IS ORM-LIFECYCLE-ASSIGNED AND NOTHING IN APPLICATION CODE
   * EVER SETS IT. `setSortOrder(` matches EXACTLY ONE LINE in the whole repository —
   * [org/Hibachi/HibachiEntity.cfc:L646] — inside the `preInsert()` block at
   * [org/Hibachi/HibachiEntity.cfc:L637-L647], which reads the current top value through
   * `getService("hibachiService").getTableTopSortOrder(...)`
   * [org/Hibachi/HibachiService.cfc:L777] and assigns `topSortOrder + 1`.
   *
   * THIS ENTITY IS THE ONE THAT EXERCISES THE `sortContext` BRANCH, and that is why the attribute
   * is worth this much comment. `sortContext=` occurs exactly five times in the legacy tree —
   * [model/entity/Attribute.cfc:L60], [model/entity/ShippingMethodRate.cfc:L53],
   * [model/entity/Option.cfc:L56], [model/entity/ShippingMethod.cfc:L55] and
   * [model/entity/AttributeOption.cfc:L55] — and THIS IS THE ONLY IN-SCOPE ONE. The branch at
   * [org/Hibachi/HibachiEntity.cfc:L641-L642] fires only when the attribute is present AND the named
   * context property is set, and it then passes `contextIDColumn` and `contextIDValue` drawn from the
   * parent, so this option's first value is `max(sortOrder) WITHIN ITS OPTION GROUP` plus one.
   * Contrast the sibling: `OptionGroup` declares no `sortContext`, so it seeds across its whole table
   * [org/Hibachi/HibachiEntity.cfc:L644].
   * OWNER IN THE PORT: `src/adapters/mysql/UnitOfWork.ts`, and it needs the PARENT OPTION GROUP'S
   * identifier to reproduce the context-scoped variant. It is not implemented here because it requires
   * a `MAX()` aggregate and the domain layer performs no data access (S2/S4), and because
   * `src/domain/base/AuditableEntity.ts` carries an explicit negative mandate excluding this block
   * from the audit lifecycle it does own.
   *
   * TYPED OPTIONAL, DELIBERATELY, AND MORE CLEARLY CORRECT HERE THAN ON THE SIBLING. Three constraints
   * intersect and leave one honest answer: F20 forbids assigning it here, S9 forbids inventing a
   * default such as `0`, and `strictPropertyInitialization` rejects an uninitialised required field.
   * Absence is also the faithful model of the pre-`preInsert` state, in which the key is simply not
   * present in the legacy `variables` scope. The field stays freely assignable so `UnitOfWork` can
   * write it. Unlike [model/entity/OptionGroup.cfc:L58], THIS COLUMN CARRIES NO `required="true"`, so
   * optional is not merely the pragmatic choice — it is what the mapping actually declares.
   *
   * S7 — LATENT ISSUE RECORDED, NOT REPAIRED. That missing `required` constraint matters, because
   * this column is a MULTIPLICAND in the sorted-SKU ordering:
   * `SUM(SwOption.sortOrder * POWER(10, <next> - SwOptionGroup.sortOrder))` at
   * [model/dao/SkuDAO.cfc:L195] for SQL Server and [:L197] otherwise. One null here makes the ENTIRE
   * SUM null in MySQL, and the ordering silently degrades. `SwOptionGroup.sortOrder` IS declared
   * `required="true"`; `SwOption.sortOrder` is not. Recorded; not acted on — and the ordering itself
   * must not be "tidied", because it is load-bearing again at `addOrder("sortOrder|ASC")`
   * [model/entity/Product.cfc:L345] and at the `orderby="sortOrder"` on the parent collection
   * [model/entity/OptionGroup.cfc:L70]. The related literal TODO in that query, D8 at
   * [model/dao/SkuDAO.cfc:L177], belongs to `src/adapters/mysql/MySqlSkuRepository.ts`.
   */
  sortOrder?: number;

  /* -------------------------------------------------------------------------------------------
   * Related Object Properties (many-to-one) — [model/entity/Option.cfc:L59]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The group this option belongs to.
   *
   * PORT OF [model/entity/Option.cfc:L59]:
   *   property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one" fkcolumn="optionGroupID";
   *
   * THIS ENTITY OWNS THE FOREIGN KEY. `fkcolumn="optionGroupID"` sits HERE, and the mirror
   * declaration [model/entity/OptionGroup.cfc:L70] carries `inverse="true"`. That single fact explains
   * the whole shape of this module: all bidirectional mutation logic for the relationship lives in
   * {@link Option.setOptionGroup} and {@link Option.removeOptionGroup}, and `OptionGroup.addOption`
   * [model/entity/OptionGroup.cfc:L92-L94] / `OptionGroup.removeOption` [:L95-L97] are one-line
   * delegations INTO them. It also explains `hb_permission="optionGroup.options"`
   * [model/entity/Option.cfc:L49] — even authorisation is expressed through the parent.
   * The column name is recorded as provenance only; the column-to-field mapping belongs to
   * `src/adapters/mysql/rowMappers.ts`.
   *
   * F5 — TYPED OPTIONAL, AND THE REASON IS A GENUINE TENSION IN THE SOURCE RATHER THAN A
   * RELAXATION OF THE CONTRACT. Both halves are real and both are carried (S8):
   *
   *   REQUIRED — [model/validation/Option.json:L5] declares
   *   `"optionGroup": [{"contexts":"save","required":true}]`. That is where the requiredness actually
   *   lives, and it is where it is enforced: in the SAVE CONTEXT, by the rule set
   *   `src/validation/rules/option.rules.ts`. Note precisely what does NOT carry it — the ORM mapping
   *   at [model/entity/Option.cfc:L59] declares no `required` attribute at all, unlike
   *   [model/entity/OptionGroup.cfc:L58] which does. Locating the requiredness correctly is the point:
   *   it is a validation rule, not a mapping constraint.
   *
   *   DELETABLE — this entity's own {@link Option.removeOptionGroup} genuinely REMOVES the value at
   *   run time, with `structDelete(variables, "optionGroup")` at [model/entity/Option.cfc:L106].
   *
   * A field that the entity's own code deletes cannot be typed non-optional without lying to the
   * compiler, and a lie there would force a non-null assertion at every read — which S1 forbids
   * outright. So OPTIONALITY HERE IS A FAITHFUL REFLECTION OF THE SOURCE, NOT A WEAKENING OF THE
   * REQUIRED RELATIONSHIP: the requirement is preserved exactly where the legacy put it, one layer up.
   * Under `exactOptionalPropertyTypes` the value is cleared with `delete` and never by assigning
   * `undefined`, which is the same operation `../base/populate` performs for a null column.
   *
   * READ SYNCHRONOUSLY BY THE M6 VALIDATION READ-BACK: `Sku.hasOneOptionPerOptionGroup()` reaches
   * `getOptions()[i].getOptionGroup().getOptionGroupID()` at [model/entity/Sku.cfc:L776] and [:L779],
   * and `Sku.generateImageFileName()` reaches `option.getOptionGroup().getImageGroupFlag()` at
   * [:L134]. Both are plain field reads in the port — no port, no lazy load, no async hop.
   *
   * ⚠️ `declare`, AND IT IS THE ONLY FIELD IN THIS CLASS THAT CARRIES IT. `declare` suppresses the
   * field DEFINITION while keeping the type, so a fresh `new Option()` does not carry this key at all
   * and an unresolved parent group is ABSENT rather than present holding `undefined`. That is what
   * `src/adapters/mysql/rowMappers.ts` promises for every unhydrated many-to-one, and this is the
   * class's only many-to-one; the scalar columns above deliberately do NOT use it, for the reason set
   * out in the class doc comment. `delete` in {@link Option.removeOptionGroup} is unaffected — it
   * still removes the key when one has genuinely been assigned, which is the faithful port of
   * `structDelete(variables, "optionGroup")` at [model/entity/Option.cfc:L106].
   */
  declare optionGroup?: OptionGroup;

  /* -------------------------------------------------------------------------------------------
   * Related Object Properties (many-to-many - inverse) — [model/entity/Option.cfc:L66]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The SKUs that carry this option.
   *
   * PORT OF [model/entity/Option.cfc:L66]:
   *   property name="skus" singularname="sku" cfc="Sku" fieldtype="many-to-many"
   *            linktable="SwSkuOption" fkcolumn="optionID" inversejoincolumn="skuID" inverse="true";
   *
   * THE INVERSE SIDE. `Sku` owns this relationship — [model/entity/Sku.cfc:L75] labels its block
   * "(many-to-many - owner)" and [:L76] declares the mirror with NO `inverse="true"`. Consequently
   * {@link Option.addSku} and {@link Option.removeSku} are PURE DELEGATIONS and THIS ARRAY IS NEVER
   * MUTATED BY THEM; see the note on {@link Option.addSku} for why duplicating the write here would
   * double-add. `SwSkuOption`, `fkcolumn="optionID"` and `inversejoincolumn="skuID"` are recorded as
   * prose provenance only (S2) — the link table belongs to `src/adapters/mysql/**`.
   *
   * TYPED AGAINST {@link SkuOptionOwner}, a narrow local structural interface, because
   * `src/domain/sku/Sku.ts` is a different module's file: it is neither created nor imported here, and
   * the collection is emphatically not typed as an escape hatch (S1). See {@link SkuOptionOwner} for
   * the full reasoning, including the finding that the two members it declares exist NOWHERE in the
   * legacy source and were ORM-synthesized from `singularname="option"` at
   * [model/entity/Sku.cfc:L76] (IR-1).
   *
   * NEVER OPTIONAL AND NEVER ABSENT: an empty array is the correct empty state, and it is what the
   * legacy base assertion `defaults_are_correct`
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] expects of a fresh entity — the
   * `BrandTest` override [meta/tests/unit/entity/BrandTest.cfc] makes the same expectation explicit
   * for its own collection. It is one of only TWO source-declared defaults on this entity, the other
   * being `optionID` (`''`). Note the contrast with the sibling: `OptionGroup` has a third, the
   * `default="0"` on `imageGroupFlag` [model/entity/OptionGroup.cfc:L57]; THIS ENTITY DECLARES NO
   * BOOLEAN AT ALL and therefore has no boolean default. Nothing else is invented (S9).
   *
   * VALIDATION, DOCUMENTED AND NOT IMPLEMENTED (F12) — [model/validation/Option.json:L6] declares
   * `"skus": [{"contexts":"delete","maxCollection":0}]`, a DELETE GUARD: an option still carried by
   * any SKU cannot be deleted. The rule belongs to `src/validation/rules/option.rules.ts`, but the
   * property surface it reads has to exist here, which is why this field is part of the port even
   * though nothing in this module ever writes it.
   */
  skus: SkuOptionOwner[] = [];

  /* -------------------------------------------------------------------------------------------
   * Remote properties — [model/entity/Option.cfc:L73]
   * ----------------------------------------------------------------------------------------- */

  /**
   * The identifier this option carries in an external system.
   *
   * PORT OF [model/entity/Option.cfc:L73] `property name="remoteID" ormtype="string";`
   *
   * Kept in its own section because the source keeps it in its own section. It is a real persisted
   * column and belongs in the port: the AAP's "five persistent properties" phrasing counts only the
   * `// Persistent Properties` block [model/entity/Option.cfc:L51-L56], and the file-scope rule that
   * governs unrequested surface governs FILES, not fields. Unlike the audit block below it does NOT
   * carry `hb_populateEnabled="false"`, so it remains populate-enabled and is described as an ordinary
   * column at the foot of this file.
   */
  remoteID?: string;

  /* -------------------------------------------------------------------------------------------
   * Audit properties — [model/entity/Option.cfc:L76-L79]
   *
   * Declared byte-identically on all six in-scope entities and never written by application code: the
   * CFML engine's Hibernate hooks `preInsert()` and `preUpdate()`
   * [org/Hibachi/HibachiEntity.cfc:L595-L682] stamped them. That behaviour is owned by
   * `../base/AuditableEntity` (`applyPreInsertAudit` / `applyPreUpdateAudit`) and invoked from
   * `src/adapters/mysql/UnitOfWork.ts`. It is NOT implemented here, and this class does not extend an
   * audit base class — §0.3.3 mandates composition, and that module declares itself a type plus free
   * functions rather than an inheritance root.
   *
   * All four are declared `hb_populateEnabled="false"`, which is honoured twice over: structurally by
   * the population engine, which excludes them ahead of every other check, and explicitly by the
   * descriptor entries at the foot of this file, which are derived from the exported
   * `AUDIT_PROPERTY_NAMES` tuple rather than from four re-typed string literals.
   *
   * `Account` IS OUT OF SCOPE — 21 `model/**` account components (§0.2.2.1) — so the two account
   * fields are typed as IDENTIFIER STRINGS and no account type is declared, imported or stubbed. The
   * foreign-key columns `createdByAccountID` and `modifiedByAccountID` are provenance only; the
   * column-to-field mapping belongs to `src/adapters/mysql/rowMappers.ts`.
   *
   * ONE ASYMMETRY THAT LOOKS LIKE AN INCONSISTENCY AND MUST NOT BE HARMONISED: only the two DateTime
   * getters were overridden to return the empty string when null
   * [org/Hibachi/HibachiEntity.cfc:L291-L305]. The two Account getters have no override anywhere and
   * are genuinely null-when-unset. `../base/AuditableEntity` preserves that split in its accessors, so
   * absence is represented two different ways on purpose.
   * ----------------------------------------------------------------------------------------- */

  createdDateTime?: Date;

  /**
   * Identifier of the administrative account that created the row — PORT OF
   * [model/entity/Option.cfc:L77], declared there as
   * `cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`. Carries the 32-character
   * identifier of IR-6.
   */
  createdByAccount?: string;

  /**
   * When the row was last written. PORT OF [model/entity/Option.cfc:L78].
   *
   * Written on insert as well as on update, which surprises readers who expect the modified pair to
   * stay untouched until the first real update; `../base/AuditableEntity` documents that asymmetry
   * against the framework lines that cause it.
   */
  modifiedDateTime?: Date;

  /**
   * Identifier of the administrative account that last wrote the row — PORT OF
   * [model/entity/Option.cfc:L79], `fkcolumn="modifiedByAccountID"`. Typed as an identifier string for
   * the same reason as {@link Option.createdByAccount}.
   */
  modifiedByAccount?: string;

  /* ===========================================================================================
   * Image directory — [model/entity/Option.cfc:L81-L83]
   * =========================================================================================== */

  /**
   * The web directory this option's images live in.
   *
   * PORT OF [model/entity/Option.cfc:L81-L83]. The legacy body, verbatim:
   *
   *     public string function getImageDirectory() {
   *         return getURLFromPath(setting('globalAssetsImageFolderPath')) & '/option/';
   *     }
   *
   * F8 / S3 — THE COLLABORATOR IS A PARAMETER, NOT A LOOKUP. The legacy reached both of its
   * collaborators through inheritance, and one of them, `setting()`
   * [model/entity/HibachiEntity.cfc:L129-L131], is a string-keyed service locator onto the
   * out-of-scope settings engine. S3 permits exactly one replacement for that: an explicitly injected,
   * typed capability. So there is no locator, no registry, no container import, no module-scope
   * singleton and NO DEFAULT RESOLVER INSTANCE — the caller supplies it. See
   * {@link OptionImageDirectoryResolver} for why both capabilities are modelled as one collaborator
   * and why its `setting` member is shaped to accept a full `SettingResolverPort` implementation.
   *
   * The alternative — holding the resolver as a constructor-injected field — was rejected: it would
   * cost the entity its no-argument constructibility (S6), which the entity-test base assertion at
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] and every other member of this class
   * depend on. Parameter injection confines the dependency to the one member that genuinely has it.
   *
   * BEHAVIOUR PRESERVED EXACTLY: the resolved setting value is passed THROUGH the path-to-URL
   * transform first and the literal `'/option/'` is appended second, byte-for-byte and in that order.
   * The suffix carries both a leading and a trailing slash exactly as the source writes it — the
   * leading one because the transform yields a path with no trailing separator, the trailing one
   * because callers append a file name directly. Neither is normalised away, and no path joining,
   * de-duplication or trailing-slash "tidying" is performed: that would be a silent behaviour change
   * (S7) in a value that ends up in a URL.
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

  /* ===========================================================================================
   * Bidirectional Helper Methods — [model/entity/Option.cfc:L89-L115]
   * =========================================================================================== */

  /**
   * Attaches this option to an option group, maintaining both sides of the relationship.
   *
   * PORT OF [model/entity/Option.cfc:L92-L97]. The legacy body, verbatim:
   *
   *     public void function setOptionGroup(required any optionGroup) {
   *         variables.optionGroup = arguments.optionGroup;
   *         if(isNew() or !arguments.optionGroup.hasOption( this )) {
   *             arrayAppend(arguments.optionGroup.getOptions(), this);
   *         }
   *     }
   *
   * This is where the owning side of `fkcolumn="optionGroupID"` earns its keep: `OptionGroup.addOption`
   * [model/entity/OptionGroup.cfc:L92-L94] does nothing but call this method, so ALL synchronisation
   * logic for the relationship is here and exists in exactly one place.
   *
   * F3 / TODO(parity) — THE SHORT-CIRCUIT IS PRESERVED EXACTLY, INCLUDING ITS SURPRISING
   * CONSEQUENCE, AND IT IS NOT REPAIRED. The condition at [model/entity/Option.cfc:L94] is a
   * short-circuiting OR whose FIRST arm is this option's own `isNew()`. CFML's `or` short-circuits and
   * so does `||`, therefore:
   *
   *   FOR A TRANSIENT OPTION the first arm is true, `hasOption` IS NEVER EVALUATED, and THE APPEND IS
   *   UNCONDITIONAL. Calling this method twice with the same group on the same new option APPENDS IT
   *   TWICE. The de-duplication `hasOption` provides is live only once the option has been persisted
   *   and its identifier is no longer the empty string.
   *
   * That is observed legacy behaviour and it is carried as-is (S7). The disjunction is NOT reordered,
   * no containment guard is added, no de-duplication is performed, and the append is not made
   * conditional — each of those "improvements" would change results silently. Corroborating that this
   * is the framework's consistent idiom rather than a local slip: the identical pattern appears at both
   * out-of-scope call sites of `hasOption`, [model/entity/PromotionQualifier.cfc:L161] and
   * [model/entity/PromotionReward.cfc:L219], spelled `arguments.option.isNew() or
   * !hasOption(arguments.option)`.
   *
   * THE APPEND TARGETS THE LIVE ARRAY, BY REFERENCE — A DEFENSIVE COPY WOULD BE A SILENT NO-OP.
   * `OptionGroup.getOptions()` returns its backing array itself, by reference, and guarantees so
   * explicitly (its own F2 note, ported from [model/entity/OptionGroup.cfc:L73-L79]). Pushing onto the
   * returned array is therefore how the group's collection actually changes. Writing
   * `[...group.getOptions()].push(this)` or copying the array first would compile, raise nothing, and
   * simply stop the relationship synchronising.
   *
   * `hasOption` is itself an ORM-SYNTHESIZED member in the legacy (IR-1), generated from
   * `singularname="option"` at [model/entity/OptionGroup.cfc:L70] and declared explicitly by
   * `./OptionGroup` for precisely this call site. It is called, not re-implemented: membership testing
   * belongs to the collection's owner, and duplicating it here could drift from it.
   *
   * The legacy `required any optionGroup` parameter is tightened to the precise `OptionGroup` type,
   * which is the licence §0.8.1 grants for idiom while behaviour is held fixed.
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
   * PORT OF [model/entity/Option.cfc:L98-L107], whose body substitutes the currently-assigned group
   * when the argument is omitted [:L99-L101], finds the option in the group's collection with
   * `arrayFind` [:L102], removes it under a found-index guard [:L103-L105], and then clears its own
   * back-reference with `structDelete` [:L106].
   *
   * THE ARGUMENT IS OPTIONAL IN THE LEGACY — `any optionGroup`, with no `required` — so both paths are
   * part of the contract and both are reproduced. `OptionGroup.removeOption` passes the group
   * explicitly [model/entity/OptionGroup.cfc:L96], and `??` treats an explicitly-passed `undefined`
   * exactly as CFML treated an omitted argument, which is the faithful reading of a
   * `structKeyExists(arguments, ...)` test.
   *
   * F6 — THE INDEX-BASE TRANSLATION, WHERE TWO SENTINEL CONVENTIONS COLLIDE. CFML `arrayFind` returns
   * a ONE-BASED index and `0` for "not found", so the legacy greater-than-zero guard at
   * [model/entity/Option.cfc:L103] is correct in CFML. TypeScript `Array.prototype.indexOf` returns a
   * ZERO-BASED index and `-1` for "not found", so `0` is a PERFECTLY VALID POSITION. Transliterating
   * that guard would compile, raise nothing, and SILENTLY FAIL TO REMOVE AN OPTION SITTING AT POSITION
   * 0 of its group's collection — which is where the first option of every group sits, making it the
   * common case rather than an edge case. The correct translation is a comparison against `-1`, and it
   * is what appears below; the legacy guard is paraphrased above rather than quoted so that no CFML
   * one-based sentinel survives anywhere in this file.
   *
   * `arrayFind` matches objects by REFERENCE IDENTITY and `indexOf` uses strict equality, which for
   * objects is also reference identity, so the port is correct by construction on that point: two
   * distinct options with equal field values are correctly NOT treated as the same member, and no
   * identifier is compared. `indexOf` and `splice` are also chosen over an indexed read so that
   * `noUncheckedIndexedAccess` never yields a possibly-`undefined` value and no non-null assertion is
   * needed (S1).
   *
   * THE CLEAR AT [model/entity/Option.cfc:L106] IS UNCONDITIONAL, AND ITS POSITION IS PRESERVED. It
   * runs whether or not the collection entry was found, so it is the last statement here, outside every
   * guard. Under `exactOptionalPropertyTypes` it is a `delete` and never an assignment of `undefined` —
   * the same operation `../base/populate` performs for a null column, and the reason
   * {@link Option.optionGroup} is typed optional (F5).
   *
   * BOTH MUTATIONS TARGET THE LIVE ARRAY. `getOptions()` is called once and its result held in a local;
   * that local is a REFERENCE ALIAS to the group's backing array, not a copy, so the splice mutates the
   * group's own collection exactly as [model/entity/Option.cfc:L104] does. Copying it would make the
   * removal a silent no-op.
   *
   * ONE EDGE PATH DIVERGES, AND IT IS FLAGGED RATHER THAN PAPERED OVER (S8). When the argument is
   * omitted AND no group is currently assigned, the legacy raised a CFML undefined-variable error at
   * [model/entity/Option.cfc:L100] before ever reaching the collection; this port performs only the
   * unconditional clear. That is the right resolution rather than a silent relaxation for three
   * reasons: the path is unreachable, `removeOptionGroup` having exactly one call site
   * [model/entity/OptionGroup.cfc:L96] which always passes the group explicitly; the legacy failure was
   * an ENGINE diagnostic rather than application behaviour, so it is not one of the legacy `throw()`
   * message strings `src/errors/DomainError.ts` carries; and manufacturing a replacement error type or
   * message would invent behaviour the source does not state (S9). With no group to search there is
   * also no collection entry that could be removed, so the clear is the only work the legacy would have
   * performed had it got that far.
   *
   * @param optionGroup - The group to detach from. Omit it to detach from the currently-assigned group.
   */
  removeOptionGroup(optionGroup?: OptionGroup): void {
    const removeFrom = optionGroup ?? this.optionGroup;

    if (removeFrom !== undefined) {
      const groupOptions = removeFrom.getOptions();
      const index = groupOptions.indexOf(this);

      if (index !== -1) {
        groupOptions.splice(index, 1);
      }
    }

    delete this.optionGroup;
  }

  /**
   * Attaches this option to a SKU, by handing the SKU the owning side of the relationship.
   *
   * PORT OF [model/entity/Option.cfc:L110-L112]:
   *
   *     public void function addSku(required any sku) {
   *         arguments.sku.addOption( this );
   *     }
   *
   * F11 — A PURE DELEGATION, AND IT MUST STAY ONE. THIS METHOD DOES NOT TOUCH
   * {@link Option.skus}. `inverse="true"` at [model/entity/Option.cfc:L66] means `Sku` owns the
   * `SwSkuOption` link — [model/entity/Sku.cfc:L75] labels its block "(many-to-many - owner)" and
   * [:L76] carries no `inverse` attribute — so the owning side maintains the collection on both ends.
   * Pushing onto this entity's own array here as well would DOUBLE-ADD: a silent duplicate rather than
   * an error, and one that would then propagate into `Sku.hasUniqueOptions()`
   * [model/entity/Sku.cfc:L756-L769], whose option list is built from exactly these links. The body
   * does what the source does and nothing more (S7).
   *
   * The legacy `required any sku` parameter is tightened to {@link SkuOptionOwner}.
   *
   * TODO(boundary): the concrete counterpart is `src/domain/sku/Sku.ts`, a different module's file. It
   * owns the link collection and, with `src/adapters/mysql/**`, the physical `SwSkuOption` write. The
   * two members called through this parameter appear NOWHERE in [model/entity/Sku.cfc] — they were
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
   * PORT OF [model/entity/Option.cfc:L113-L115]:
   *
   *     public void function removeSku(required any sku) {
   *         arguments.sku.removeOption( this );
   *     }
   *
   * The mirror of {@link Option.addSku} and a pure delegation for the same `inverse="true"` reason
   * [model/entity/Option.cfc:L66]. It likewise DOES NOT touch {@link Option.skus}: splicing this
   * entity's own array here as well would remove the wrong element or remove one twice, and the owning
   * side has already done the work.
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
   * F21 — A PURE DERIVED PREDICATE: THE PRIMARY IDENTIFIER EQUALS THE EMPTY STRING. Nothing stores
   * this. `newFlag` is declared `persistent="false"` on the framework base, but NO `setNewFlag` EXISTS
   * ANYWHERE IN THE REPOSITORY — the value is computed on every read. The full chain:
   *   `unsavedvalue="" default=""` [model/entity/Option.cfc:L52];
   *   `getPrimaryIDValue()` returns the primary-ID property [org/Hibachi/HibachiEntity.cfc:L244];
   *   `getNewFlag() { if(getPrimaryIDValue() == "") return true; return false; }`
   *     [org/Hibachi/HibachiEntity.cfc:L571-L576];
   *   `isNew() { return getNewFlag(); }` [org/Hibachi/HibachiEntity.cfc:L707-L709].
   *
   * ZERO PORTS AND ZERO DATABASE ACCESS, and on this entity that is not merely convenient — it is
   * load-bearing twice over. It is what makes the entity cheaply constructible (S6), and it is what
   * lets the guard in {@link Option.setOptionGroup} work with no collaborator at all: the unqualified
   * `isNew()` at [model/entity/Option.cfc:L94] resolves to THIS OPTION'S OWN inherited predicate, not
   * to the group's. It also gives `defaults_are_correct`
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] both of its assertions for free —
   * `isNew()` at [:L65] and a zero-length primary identifier at [:L66].
   *
   * RECORDED PRECISELY: `isNew()` sits inside the framework's "Deprecated Methods" section, opened at
   * [org/Hibachi/HibachiEntity.cfc:L704], and it is ported anyway — because this entity's own source
   * calls it at [model/entity/Option.cfc:L94]. It is the ONE exception to the F22 negative mandate in
   * the module header, and the only reason it is not simply a private helper is that
   * `OptionGroup.hasOption` sits on the other side of the same guard and the two files share one
   * convention.
   *
   * @returns `true` when the option has not been persisted yet.
   */
  isNew(): boolean {
    return this.optionID === '';
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
   * @returns The mapped ORM entity name, NOT the physical table name.
   */
  getEntityName(): string {
    return OPTION_ENTITY_NAME;
  }

  /**
   * `optionID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP 0.7.3 S3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return OPTION_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's VALUE — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * ⚠️ RETURNS `''` FOR AN UNSAVED INSTANCE, because [model/entity/Option.cfc:L52] declares
   * `unsavedvalue=""` and this class initialises the field to `''`. That is what makes the
   * self-exclusion term of the uniqueness query a NO-OP on insert — an observation AAP 0.4.1.7
   * requires be reproduced rather than tidied away, and which `src/ports/UniquePropertyPort.ts`
   * carries as a `TODO(parity)`. It is also the value
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts on a fresh instance.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.optionID;
  }

  /**
   * Whether this entity DECLARES the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * ⚠️ A FALSE ANSWER SILENTLY SKIPS A VALIDATION RULE rather than failing it
   * [org/Hibachi/HibachiValidationService.cfc:L171]. See OPTION_DECLARED_PROPERTIES, whose
   * exhaustiveness is compile-checked precisely because of that.
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(OPTION_DECLARED_PROPERTIES, propertyIdentifier);
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
      OPTION_DECLARED_PROPERTIES,
      propertyName,
      OPTION_CLASS_NAME,
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
 * `Option` HAS NO `populate()` MEMBER, deliberately, and for exactly the two reasons its sibling
 * records. In the legacy tree the method arrived by inheritance from the local base
 * [model/entity/HibachiEntity.cfc:L56] and reflected over component metadata at run time. §0.3.3
 * replaces template-method inheritance with composition, so there is no base class to inherit it
 * from; and `../base/populate` declares its contract as a FREE FUNCTION taking a `descriptorSet`
 * parameter, precisely so that per-entity metadata is supplied BY the entity module rather than
 * discovered inside the engine (TR-3). Callers write:
 *
 *     populate(option, data, OPTION_PROPERTY_DESCRIPTORS, {
 *         authorization: { entityName: option.getClassName(), authorizer },
 *     });
 *
 * THE FOURTH ARGUMENT IS NOT OPTIONAL IN EFFECT FOR THIS ENTITY. `Option` is persistent, so ARM 1 of
 * the population master gate at [org/Hibachi/HibachiTransient.cfc:L186] does not short-circuit and the
 * per-property authorisation arms [:L188-L190] are reached. `../base/populate` fails closed without the
 * context, so a three-argument call would populate NO declared property. `../../services/BaseService`
 * builds the object per save from its required authoriser collaborator; only a direct caller writes it.
 *
 * WHAT IS DECLARED, AND THE COUNT AUDIT. This entity declares twelve properties. Eleven are
 * describable and one is not:
 *
 *   4  simple columns      optionCode, optionName, optionDescription, sortOrder
 *                          [model/entity/Option.cfc:L53-L56]
 *   1  remote column       remoteID [model/entity/Option.cfc:L73]
 *   4  audit properties    populate-DISABLED [model/entity/Option.cfc:L76-L79]
 *   1  many-to-one         optionGroup [model/entity/Option.cfc:L59] — factory-only, see below
 *   1  many-to-many        skus [model/entity/Option.cfc:L66] — factory-only, see below
 *   -- ------------------  ------------------------------------------------------------------
 *   11 describable         + 1 omitted (optionID) = 12
 *
 * The six out-of-scope relationships of the EXCLUSION REGISTER above — [model/entity/Option.cfc:L60],
 * [:L63] and [:L67-L70] — are absent from this table for the same reason they are absent from the
 * class: they are not fields of this port, so they cannot be populated into one.
 *
 * WHY `optionID` IS OMITTED — A G6 TRANSLATION DECISION, NOT AN OVERSIGHT. The primary identifier
 * declares `fieldtype="id"` [model/entity/Option.cfc:L52], and the legacy column branch is gated on
 * `!structKeyExists(currentProperty, "fieldType") || fieldType == "column"`. For an id property that
 * gate is FALSE, and no relationship branch matches either, so THE LEGACY NEVER POPULATED A PRIMARY
 * IDENTIFIER FROM REQUEST DATA. The type system agrees independently: `../base/populate` derives its
 * `PropertyKind` union from the four values the engine actually consults and has no `'id'` member at
 * all, so an id descriptor is not expressible. Omitting the property is therefore observably
 * identical to the source, whereas describing it as a column would make the primary key writable
 * from a payload — and on this entity that would additionally corrupt {@link Option.isNew}, which is
 * nothing but a read of that field (F21).
 *
 * DESCRIPTOR FACTS VERIFIED FOR THIS ENTITY — and no machinery is added for the absent ones (S9):
 *   - `notNull` occurs EXACTLY ONCE in the whole in-scope slice, at [model/entity/Product.cfc:L55],
 *     and NOT on this entity. The consequence is real and is left exactly as the source leaves it: a
 *     blank simple value DELETES the key here rather than assigning the empty string. That is why
 *     `optionCode`, `optionName`, `optionDescription` and `remoteID` are declared optional above and
 *     are cleared with `delete` rather than with `= undefined` (S1).
 *   - `hb_sessionDefault`, `hb_populateArray` and `hb_fileUpload` occur ZERO times across all six
 *     in-scope entities, so no descriptor below declares them.
 *   - `hb_populateEnabled="public"` occurs 68 times in the legacy tree and ZERO times in scope; only
 *     `false` and absent occur here, so the tri-value is consumed but never exercised.
 *   - `hb_formatType` occurs once in scope, at [model/entity/Brand.cfc:L57], and the legacy live path
 *     ignores it entirely. Not applicable to this entity. Note that `hb_formFieldType="wysiwyg"` at
 *     [model/entity/Option.cfc:L55] is a DIFFERENT attribute — admin-UI metadata, out of scope, and
 *     already documented as comment-only on the field itself.
 *   - Exactly TWO relationship kinds are present and in scope: `optionGroup`, many-to-one
 *     [model/entity/Option.cfc:L59]; and `skus`, many-to-many with `inverse="true"`
 *     [model/entity/Option.cfc:L66].
 *
 * THE `singularName` CASING TRAP. The legacy composed member names from this attribute and spelled
 * the key inconsistently while doing so — capital `N` at [org/Hibachi/HibachiTransient.cfc:L294],
 * lower-case `n` at [:L339] and [:L357] — which worked only because CFML struct keys are
 * case-insensitive. TypeScript is case-SENSITIVE, so `../base/populate` pins one spelling,
 * `singularName`, and that pinned spelling is what the `skus` descriptor below uses. The value is
 * provenance only; nothing concatenates it into a member name, because S3 forbids exactly that.
 * =============================================================================================== */

/**
 * The four audit properties, marked populate-disabled.
 *
 * DERIVED FROM the frozen `AUDIT_PROPERTY_NAMES` tuple that `../base/AuditableEntity` exports, rather
 * than from four re-typed string literals, so this list cannot drift from the shared definition or
 * from the exclusion the population engine applies with it. `populateEnabled: false` is the direct
 * port of `hb_populateEnabled="false"` at [model/entity/Option.cfc:L76-L79].
 *
 * BELT AND BRACES, ON PURPOSE. The engine already excludes these four names unconditionally, ahead of
 * every other check, so these entries are not load-bearing for behaviour. They are declared anyway
 * because the legacy DECLARATION is what this file ports, and a reader auditing the descriptor table
 * against the source should find every property accounted for.
 *
 * THE TWO ACCOUNT PROPERTIES ARE DESCRIBED AS COLUMNS even though the source declares them
 * `fieldtype="many-to-one"` at [model/entity/Option.cfc:L77] and [:L79]. That is sound and
 * deliberate: the engine short-circuits on the audit name before every kind-specific branch, so the
 * kind is unreachable for these two, and describing them as relationships would force this file to
 * declare an `Account` primary-identifier name and an `Account` loader — inventing a surface for a
 * domain that §0.2.2.1 places entirely out of scope across 21 files.
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
 * for [model/entity/Option.cfc:L49] is the bare component name.
 *
 * It is the ARM 3 operand of the population gate [org/Hibachi/HibachiTransient.cfc:L190], and it is
 * the key the out-of-scope permission records are stored under — `getEntityPermissionDetails()`
 * derives its key set from a directory listing of `model/entity` at
 * [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141]. Declared once here because BOTH descriptor
 * sets below need it and a drifted spelling would silently deny every property, the ladder being
 * default-deny. It is NOT derived from `Option.name` at runtime: that is the reflection TR-3 retires,
 * and esbuild is free to rename a class.
 */
const OPTION_LEGACY_CLASS_NAME = 'Option';

/**
 * The five simple columns, in source declaration order.
 *
 * PORT OF [model/entity/Option.cfc:L53-L56] and [:L73]. `kind` is omitted throughout, which is
 * exactly equivalent to declaring `kind: 'column'`: not one of these five properties declares a
 * `fieldtype` attribute in the source, and the legacy gate treats an absent `fieldtype` as a column.
 *
 * DECLARATION ORDER IS PRESERVED because it is population order — the legacy loop iterates declared
 * properties rather than payload keys, so the order is observable whenever two properties feed the
 * same downstream value. `remoteID` comes last because [model/entity/Option.cfc:L73] declares it
 * after the relationship block, not because the column is in any way secondary.
 *
 * `sortOrder` APPEARS HERE AND IS STILL NOT ASSIGNED BY THIS FILE (F20). Being describable and being
 * self-assigned are different things: a caller may populate it from an explicit payload exactly as
 * the legacy admin surface could, but the FIRST value on insert comes from
 * [org/Hibachi/HibachiEntity.cfc:L637-L647] and is owned by `src/adapters/mysql/UnitOfWork.ts`. No
 * default is invented here (S9).
 */
const OPTION_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<OptionPropertyName>[] =
  Object.freeze([
    { name: 'optionCode', valueType: 'string' },
    { name: 'optionName', valueType: 'string' },
    { name: 'optionDescription', valueType: 'string' },
    { name: 'sortOrder', valueType: 'integer' },
    { name: 'remoteID', valueType: 'string' },
  ]);

/**
 * The population contract for `Option`, minus the two relationships.
 *
 * Nine descriptors: the five columns of [model/entity/Option.cfc:L53-L56] and [:L73], plus the four
 * populate-disabled audit properties of [:L76-L79]. `persistent: true` ports `persistent=true` on the
 * component declaration at [model/entity/Option.cfc:L49], and it is consequential rather than
 * decorative: the legacy authorisation gate short-circuits for NON-persistent targets, so process
 * objects populate freely while entities such as this one have per-property authorisation consulted —
 * here through `hb_permission="optionGroup.options"`, which delegates the check to the parent group.
 * `../base/populate` ports all three arms of that gate and DENIES when no authorisation collaborator
 * is supplied, so a persistent target is never populated by default. `className` accompanies the flag
 * because the third arm passes it as its `entityName` argument.
 *
 * WHY NEITHER RELATIONSHIP IS IN THIS CONSTANT — A MISMATCH FLAGGED RATHER THAN ASSUMED AWAY (S8).
 * Both relationship descriptors are required by their own contracts to carry a `RelatedEntityLoader`
 * and a `populateRelated`, and the many-to-many additionally requires an identifier reader. None of
 * those can exist in a static constant declared inside the domain layer: a loader performs DATA
 * ACCESS, which S2 and S4 forbid here, and `populateRelated` would need the related module's own
 * descriptor set — for `optionGroup` that means a VALUE import of `./OptionGroup` and therefore
 * precisely the runtime circular CommonJS require that R-A's type-only import exists to avoid, and
 * for `skus` it means `src/domain/sku/Sku.ts`, which is another agent's file (R-C). Both are
 * consequently supplied through {@link createOptionPropertyDescriptors}, whose collaborators the
 * composition root injects.
 *
 * This constant remains the form the AAP call example uses, and it is complete and correct for every
 * payload that carries neither a nested `optionGroup` struct nor a `skus` array or identifier list.
 * That covers every in-scope call path: the catalog services attach an option group by resolving it
 * and calling the helpers — [model/service/ProductService.cfc:L115] resolves the group through
 * `getOptionGroup(...)` and [:L119] then calls `skus[i].addOption(options[1])` — rather than by
 * handing a nested payload to `populate`. The surface that would produce such a payload is the
 * generic admin entity-save screen, and `admin/**` is out of scope across 352 files (§0.2.2.2).
 */
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
 * PORT OF the relationship halves of [model/entity/Option.cfc:L59] and [:L66]. The collaborators are
 * the explicit replacements for framework machinery the legacy resolved dynamically, and every one of
 * them is constructor-injected at the composition root rather than looked up (S3):
 *
 *   - the two loaders replace `getService("hibachiService").getServiceByEntityName(...)`
 *     [org/Hibachi/HibachiTransient.cfc:L233] followed by an `invokeMethod("get" & entityName, ...)`
 *     call — a string-keyed service locator feeding a synthesized method name, at [:L239] for the
 *     create-if-missing arm and [:L261] for the load-only arm, with the related primary-identifier
 *     NAME itself resolved by a third such lookup at [:L227]. Implemented by
 *     `src/adapters/mysql/MySqlOptionRepository.ts` and, for skus, `MySqlSkuRepository.ts`.
 *   - the two populators replace the legacy recursion `thisEntity.populate(...)`, which resolved only
 *     because every entity carried the method by inheritance. In the port each related type's
 *     descriptors belong to its own module, so the recursion arrives as a function — typically a
 *     one-line call back into `populate` with that module's descriptor set.
 *   - `readSkuPrimaryId` replaces
 *     `existingRelatedEntities[m].invokeMethod("get#primaryIDPropertyName#")`
 *     [org/Hibachi/HibachiTransient.cfc:L329]. It is a PARAMETER rather than a member of
 *     {@link SkuOptionOwner} on purpose: R-C scopes that interface to exactly the two members
 *     [model/entity/Option.cfc:L110-L115] touches, and widening it with a `skuID` field would make it
 *     a partial duplicate of the real `Sku` domain type instead of a minimal delegation contract.
 *
 * TODO(parity) — THE MANY-TO-ONE ASSIGNMENT DOES NOT ROUTE THROUGH {@link Option.setOptionGroup},
 * AND ON THIS ENTITY THAT IS OBSERVABLE. The legacy helper assigned through a DYNAMIC SETTER:
 * `_setProperty` reads `var theMethod = this["set" & arguments.name]` and calls it
 * [org/Hibachi/HibachiTransient.cfc:L806-L819], so the many-to-one writes at [:L242] and [:L265]
 * invoked `setOptionGroup(...)` — and on `Option`, alone among the in-scope entities, that name resolves to
 * a HAND-WRITTEN BIDIRECTIONAL OVERRIDE [model/entity/Option.cfc:L92-L97] rather than to a generated
 * accessor. The legacy populate path therefore also appended this option to the group's collection.
 * `../base/populate` deliberately does not survive that dynamic dispatch — it is the same
 * `onMissingMethod` family IR-1 replaces with explicit declarations, and S3 and TR-3 forbid it — so
 * its port assigns the field directly and the append does not happen. Neither this file nor the
 * descriptor contract can bridge the gap: `ManyToOnePropertyDescriptor` exposes a loader and a
 * populator and NO assignment hook, by design [org/Hibachi/HibachiTransient.cfc:L242], [:L255],
 * [:L265]. The gap is therefore FLAGGED, NOT SILENTLY RESOLVED (S8): a caller that needs the
 * bidirectional effect must call {@link Option.setOptionGroup} explicitly, which is what every
 * in-scope call path already does. It is recorded here rather than repaired because repairing it would
 * mean editing `../base/populate`, a file this file must treat as read-only.
 *
 * TODO(boundary) — `skus` IS THE INVERSE SIDE, SO ITS MUTATIONS LEAVE THIS MODULE.
 * `addRelated` and `removeRelated` delegate to {@link Option.addSku} and {@link Option.removeSku},
 * which delegate on to the OWNING side [model/entity/Sku.cfc:L76], exactly as
 * [model/entity/Option.cfc:L110-L115] does. `readRelated` hands back the LIVE `skus` array, which is
 * what the delimited-list branch of the engine expects — it iterates that array backwards while
 * `removeRelated` mutates, so the reverse iteration is correct either way. Convergence of that branch
 * consequently depends on the eventual `src/domain/sku/Sku.ts` maintaining the inverse end of
 * `SwSkuOption` the way the ORM did. That dependency is stated rather than assumed away, and it is not
 * resolvable from the inverse side.
 *
 * `relatedPrimaryIdPropertyName` is `'optionGroupID'` read from [model/entity/OptionGroup.cfc:L52] and
 * `'skuID'` read from [model/entity/Sku.cfc:L52]. Both descriptors declare their operations in METHOD
 * syntax deliberately, matching the descriptor interfaces, so a descriptor written against a concrete
 * related type stays assignable to the heterogeneous descriptor collection with no cast (S1: this file
 * contains no `as` cast, no non-null assertion and no suppression comment).
 *
 * NOTHING IS MEMOIZED and no state is retained between calls: a fresh set is built per call, so
 * nothing can bleed across warm Lambda invocations or across tenants (M7).
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
