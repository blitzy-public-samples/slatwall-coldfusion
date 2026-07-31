/* ================================================================================================
 * SkuService — the Catalog's SKU service, ported from `model/service/SkuService.cfc`.
 *
 * The nine declared public members are reproduced by name, arity and argument order (TR-1), plus the one
 * member the legacy fabricated at run time and this port must declare explicitly (IR-1).
 *
 * WHY THIS IS THE HIGHEST-RISK FILE IN THE SLICE. `createSkus` (`model/service/SkuService.cfc:L58-L208`)
 * is the largest single business rule in the Catalog, and three of its properties can change silently
 * under a well-intentioned rewrite: the three-way discriminator, the odometer enumeration ORDER, and the
 * order in which SKU validation observes its freshly created siblings (AAP §0.6.2). None of the three
 * produces a compile error when it drifts, so each is pinned at the site where the judgment was made,
 * per AAP §0.8.2 guideline 6.
 *
 * THE NINE DECLARED MEMBERS, WITH THEIR SOURCE LOCATORS
 *   createSkus                 [:L58]  the combination engine — three branches, always returns true
 *   processImageUpload         [:L210] returns the image-write BOOLEAN, not the entity — carried D24,
 *                                      and the member sits outside the dispatcher's
 *                                      `process<Class>_<context>` naming convention so the
 *                                      entity-returning contract never applies to it
 *   getProductSkus             [:L220] `sorted` REQUIRED (Discrepancy 2), D13
 *   getSortedProductSkus       [:L246] reads the product's own collection, D13
 *   searchSkusByProductType    [:L271] BOTH arguments optional (Discrepancy 3)
 *   getSkuStocksDeletableFlag  [:L281] D4 — the member it delegates to does not exist
 *   getTransactionExistsFlag   [:L285] declares no arguments (Discrepancy 4); the filtered form is
 *                                      the repository's, not this member's
 *   getSkuBySkuCode            [:L289] optional argument, constrained by an out-of-scope caller
 *   getSkuSmartList            [:L309] entity, three joins, five keyword properties
 *
 * THE ONE SYNTHESIZED MEMBER. `newSku()` has no declaration anywhere in the legacy tree. It resolved
 * through `onMissingMethod` (`org/Hibachi/HibachiService.cfc:L255-L281`), which routes a `new` prefix to
 * `onMissingNewMethod` (`:L544-L549`) and thence to `new( entityName )`. The legacy component calls it
 * five times — `model/service/SkuService.cfc:L92`, `:L127`, `:L154`, `:L182` and `:L192` — so IR-1 and
 * TR-3 require an explicitly declared, typed member. The dispatcher itself is never ported, and
 * synthesis is reproduced ONLY where the slice uses it (AAP §0.4.2.5).
 *
 * DEPENDENCY UNTANGLING (AAP §0.6.3.2). The legacy component declares five injected properties, one of
 * which is never used and one genuine collaborator of which is never declared at all:
 *   skuDAO                      [:L51] 8 call sites — LIVE, becomes {@link SkuRepository}
 *   optionService               [:L53] 1 call site  — LIVE, becomes the injected {@link OptionService}
 *   subscriptionService         [:L55] 3 call sites — LIVE but OUT OF SCOPE, becomes
 *                                      {@link SubscriptionTermPort}
 *   contentService              [:L56] 2 call sites — LIVE but OUT OF SCOPE, becomes
 *                                      {@link AccessContentPort}
 *   getService('imageService')  [:L212] 1 call site — HIDDEN. Resolved through a runtime string lookup
 *                                      and NEVER declared as a property, so any dependency analysis
 *                                      based on component metadata misses it entirely. It becomes
 *                                      {@link ImagePathPort}.
 *   productService              [:L54] ZERO call sites — DEAD INJECTION, deliberately absent here.
 *                                      Dropping it is what keeps the service graph acyclic:
 *                                      `ProductService` injects `SkuService` at
 *                                      `model/service/ProductService.cfc:L55`, so wiring the reverse
 *                                      edge would recreate a cycle for a collaborator nothing ever
 *                                      called (AAP §0.4.3.1).
 *
 * BOUNDARIES (AAP §0.7.3 S2, S3, S4, S5). No SQL string, fragment, placeholder or table name; no
 * `mysql2`; no adapter, config, handler or integration import; no AWS type; no environment read; no
 * `BaseService` inheritance; no new dependency. Every query reaches the database through
 * {@link SkuRepository} or {@link SmartListQueryPort}.
 *
 * M7 — WARM-CONTAINER STATELESSNESS. This class holds NO mutable state: every field is a readonly
 * constructor parameter property and every derived value is function-local. A Lambda container reuses a
 * module-scope singleton across invocations, so an instance field or module-level cache would bleed one
 * request's data into the next. The legacy relied on the opposite guarantee — a per-request component
 * instance, `cacheuse="transactional"` on 111 of 113 entities, and the memoised option-group sort order
 * at `model/dao/SkuDAO.cfc:L204-L228` — none of which survives between invocations. That memo is the
 * repository adapter's concern and the port exposes
 * {@link SkuRepository.clearOptionGroupSortOrderCache} for it; this service never calls it, because the
 * legacy service never did either.
 *
 * TEST PROVENANCE: NET-NEW, IN FULL. No legacy `SkuServiceTest` exists anywhere under `meta/tests/`
 * (AAP §0.6.5.2), so all nine declared members and the explicitly synthesized `newSku` are net-new
 * coverage — stated plainly rather than implying parity with a legacy suite that does not exist, which
 * is the question AAP §0.8.3.7 exists to answer honestly. The class is directly constructible from
 * typed test doubles, which is what the ports are for.
 * ============================================================================================== */

import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../domain/BaseProductType';
import { manageEntity } from '../domain/base/populate';
import type { EntityErrorSurface, ManagedEntity } from '../domain/base/populate';
import type { Option } from '../domain/option/Option';
import type {
  Product,
  ProductDefaultSkuDelegate,
  ProductSkuMember,
} from '../domain/product/Product';
import type { SkusBySelectedOptionsLookup } from '../domain/sku/Sku';
import { SKU_ENTITY_METADATA, Sku } from '../domain/sku/Sku';
import {
  DomainError,
  LegacyParityError,
  NotImplementedError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
} from '../errors/DomainError';
import {
  ACCESS_CONTENTS_REQUIRED_RBKEY,
  SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY,
  SUBSCRIPTION_TERMS_REQUIRED_RBKEY,
  ValidationError,
} from '../errors/ValidationError';
import type {
  AccessContentPort,
  AccessContentReference,
  ContentAccessSkuCreationData,
  ContentAccessSkuCreationMode,
} from '../ports/AccessContentPort';
import type { ImagePathPort } from '../ports/ImagePathPort';
import { IMAGE_UPLOAD_ALLOWED_EXTENSIONS, validateImageFileName } from '../ports/ImagePathPort';
import type {
  SmartListInput,
  SmartListJoin,
  SmartListKeywordProperty,
  SmartListQueryPort,
  SmartListResult,
} from '../ports/SmartListQueryPort';
import { translateSmartListInput } from '../ports/SmartListQueryPort';
import type {
  SubscriptionBenefitReference,
  SubscriptionSkuCreationData,
  SubscriptionTermPort,
} from '../ports/SubscriptionTermPort';
import type { SkuRepository, SkuSearchRow } from '../ports/repositories/SkuRepository';
import type {
  ValidateOptions,
  ValidationContext,
  ValidationRuleSet,
  Validator,
} from '../validation/Validator';
import { createSkuValidationRules, resolveSkuUniqueTarget } from '../validation/rules/sku.rules';
import type { OptionService } from './OptionService';

/* ------------------------------------------------------------------------------------------------
 * THE THREE BASE PRODUCT TYPE DISCRIMINATORS
 *
 * `createSkus` branches on `product.getProductType().getBaseProductType()` at
 * [model/service/SkuService.cfc:L61], [:L139] and [:L173]. The three values it compares against are
 * the `systemCode`s of the rows seeded at [config/dbdata/SlatwallProductType.xml.cfm:L13-L15], which is
 * why they are fixed data and not test data (IR-7).
 *
 * THE BRANCH KEY IS THE `systemCode`, NOT THE `productTypeID`, AND THE DISTINCTION IS EASY TO GET
 * WRONG. Each seeded row carries BOTH: the merchandise row is
 * `productTypeID="444df2f7ea9c87e60051f3cd87b435a1" … systemCode="merchandise"`. [:L61] compares
 * against the literal string `"merchandise"` — the systemCode — so the 32-character identifier is a
 * DIFFERENT column and comparing against it would silently take the fallthrough at [:L204] for every
 * product. AAP 0.4.1.4 lists the UUIDs beside the codes, which makes the two easy to conflate; they
 * are not interchangeable.
 *
 * THE CODES ARE READ FROM THE SEED REGISTRY, NOT RETYPED. `../domain/BaseProductType` owns the
 * seeded facts — both the identifiers and the codes — so this file names the registry entries rather
 * than repeating any literal. If a code ever changes in the seed data the branch keys follow it
 * automatically instead of drifting apart, and no local copy can disagree with the source of truth.
 * ---------------------------------------------------------------------------------------------- */

const MERCHANDISE_BASE_PRODUCT_TYPE = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode;

const SUBSCRIPTION_BASE_PRODUCT_TYPE = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode;

const CONTENT_ACCESS_BASE_PRODUCT_TYPE =
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode;

/* ------------------------------------------------------------------------------------------------
 * DATA KEYS READ BY `createSkus`
 *
 * Every key below is read from the `data` struct the legacy method receives. They are named as
 * constants so the guarded reads and the unguarded ones are distinguishable at a glance, and so the
 * two spellings that matter — `subscriptionBenefits` versus `renewalSubscriptionBenefits` — cannot be
 * transposed by a typo the compiler would not catch.
 * ---------------------------------------------------------------------------------------------- */

/** Read UNGUARDED at [model/service/SkuService.cfc:L93], [:L129], [:L156], [:L183] and [:L193]. */
const PRICE_DATA_KEY = 'price';

/** Read GUARDED at [model/service/SkuService.cfc:L94] and [:L130] — exists, numeric and above zero. */
const LIST_PRICE_DATA_KEY = 'listPrice';

/** Read GUARDED at [model/service/SkuService.cfc:L64] — exists and non-empty. */
const OPTIONS_DATA_KEY = 'options';

/** Read GUARDED at [model/service/SkuService.cfc:L142], then iterated at [:L160]. */
const SUBSCRIPTION_BENEFITS_DATA_KEY = 'subscriptionBenefits';

/** Read GUARDED at [model/service/SkuService.cfc:L147], then iterated at [:L153]. */
const SUBSCRIPTION_TERMS_DATA_KEY = 'subscriptionTerms';

/** Read UNGUARDED at [model/service/SkuService.cfc:L163] — the parity hazard carried below. */
const RENEWAL_SUBSCRIPTION_BENEFITS_DATA_KEY = 'renewalSubscriptionBenefits';

/** Read GUARDED at [model/service/SkuService.cfc:L175], then iterated at [:L186] and [:L191]. */
const ACCESS_CONTENTS_DATA_KEY = 'accessContents';

/** Read GUARDED at [model/service/SkuService.cfc:L181] — exists and reads as boolean true. */
const BUNDLE_CONTENT_ACCESS_DATA_KEY = 'bundleContentAccess';

/**
 * The validation context every SKU created here is validated in.
 *
 * `model/validation/Sku.json` declares its `price`, `listPrice`, `renewalPrice`, `skuCode` and
 * `options` rules for the `save` context, and both method-based `options` rules — `hasUniqueOptions`
 * and `hasOneOptionPerOptionGroup` — belong to it. `../validation/rules/sku.rules` holds the same
 * literal in a module-private constant it does not export, so it is restated here rather than
 * imported; the value is matched case-insensitively at
 * [org/Hibachi/HibachiValidationService.cfc:L71], and `save` is the default at
 * [org/Hibachi/HibachiService.cfc:L133].
 */
const SKU_SAVE_CONTEXT: ValidationContext = 'save';

/** `arguments.product.addError("subscriptionBenefits", …)` — [model/service/SkuService.cfc:L143]. */
const SUBSCRIPTION_BENEFITS_ERROR_PROPERTY = 'subscriptionBenefits';

/** `arguments.product.addError("subscriptionTerms", …)` — [model/service/SkuService.cfc:L148]. */
const SUBSCRIPTION_TERMS_ERROR_PROPERTY = 'subscriptionTerms';

/** `arguments.product.addError("accessContents", …)` — [model/service/SkuService.cfc:L176]. */
const ACCESS_CONTENTS_ERROR_PROPERTY = 'accessContents';

const SKU_CODE_SEGMENT_DELIMITER = '-';

const FIRST_SKU_CODE_SUFFIX = 1;

/** CFML's default list delimiter, used by every `listLen` / `listGetAt` / `listToArray` call here. */
const CFML_LIST_DELIMITER = ',';

const FIRST_ORDINAL = 1;

/**
 * The odometer's starting index, expressed 0-based.
 *
 * [model/service/SkuService.cfc:L84] sets every `currentIndexesByKey[key]` to `1`, which is CFML's
 * first array position. TypeScript arrays are 0-based, so the same position is `0` here, and the carry
 * arithmetic below is translated with the same one-place shift throughout.
 */
const FIRST_OPTION_INDEX = 0;

/**
 * The first position of a 0-based loop, standing in for the legacy `i == 1` and `c == 1` tests at
 * [model/service/SkuService.cfc:L166] and [:L197] — the two places a branch elects its default SKU.
 */
const FIRST_ARRAY_INDEX = 0;

/* ------------------------------------------------------------------------------------------------
 * SMART LIST CONSTANTS — `model/service/SkuService.cfc:L309-L325`
 *
 * The legacy member names the root entity, adds three related-property joins and registers five keyword
 * properties. All five facts are observable in the query the port receives, so all five are pinned as
 * frozen constants rather than assembled inline, and nothing can reorder or reweight them at run time
 * (M7).
 * ---------------------------------------------------------------------------------------------- */

/** `arguments.entityName = "SlatwallSku"` — [model/service/SkuService.cfc:L310]. */
const SKU_ENTITY_NAME = 'SlatwallSku';

/** `SlatwallProduct` is the parent of the second join — [model/service/SkuService.cfc:L315]. */
const PRODUCT_ENTITY_NAME = 'SlatwallProduct';

/** Every `addKeywordProperty` call in the member passes `weight=1` — [:L318-L322]. */
const SKU_KEYWORD_PROPERTY_WEIGHT = 1;

/**
 * The three joins, in source order.
 *
 * THE THIRD IS A LEFT JOIN AND THE FIRST TWO ARE NOT. [model/service/SkuService.cfc:L314] and
 * [:L315] call `joinRelatedProperty` with no third argument, which defaults `joinType` to the empty
 * string at [org/Hibachi/HibachiSmartList.cfc:L212] and yields an inner join. [:L316] passes `"left"`
 * explicitly, because a SKU need not have an alternate code and an inner join would silently drop
 * every SKU that has none. `SmartListJoin.joinType` is omitted for the inner joins rather than set to
 * the empty string, so the absent form means "the legacy default" (S1, `exactOptionalPropertyTypes`).
 */
const SKU_SMART_LIST_JOINS: readonly SmartListJoin[] = Object.freeze([
  { parentEntityName: SKU_ENTITY_NAME, relatedProperty: 'product' },
  { parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'productType' },
  {
    parentEntityName: SKU_ENTITY_NAME,
    relatedProperty: 'alternateSkuCodes',
    joinType: 'left',
  },
] satisfies SmartListJoin[]);

/**
 * The five keyword properties, in source order, every one at weight 1.
 *
 * [model/service/SkuService.cfc:L318-L322]. The last three are dotted property identifiers that only
 * resolve because of the joins above — `product.productName` needs the first join,
 * `product.productType.productTypeName` needs the first two, and
 * `alternateSkuCodes.alternateSkuCode` needs the third. Reordering the joins would therefore break
 * keyword search rather than merely change SQL, which is why both collections are frozen together.
 */
const SKU_SMART_LIST_KEYWORD_PROPERTIES: readonly SmartListKeywordProperty[] = Object.freeze([
  Object.freeze({ propertyIdentifier: 'skuCode', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'skuID', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'product.productName', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({
    propertyIdentifier: 'product.productType.productTypeName',
    weight: SKU_KEYWORD_PROPERTY_WEIGHT,
  }),
  Object.freeze({
    propertyIdentifier: 'alternateSkuCodes.alternateSkuCode',
    weight: SKU_KEYWORD_PROPERTY_WEIGHT,
  }),
]);

/* ----------------------------------------------------------------------------------------------
 * SMART LIST INPUT KEY GRAMMAR — OWNED BY THE PORT, NOT RESTATED HERE
 *
 * A FULL COPY OF THE `applyData` KEY GRAMMAR USED TO LIVE HERE — the `F:` / `FR:` / `FI:` / `FIR:` /
 * `FK:` / `FKR:` / `R:` prefixes, the `OrderBy` and `P:`-paging keys, the keyword keys, the
 * show-all sentinel, the order and keyword delimiters and the like wildcard, all from
 * [org/Hibachi/HibachiSmartList.cfc:L85-L157]. The block carried an explicit note conceding the
 * duplication and explaining it as scope-forced: `./OptionService` held the same grammar in a
 * module-private function, so sharing was said to require modifying a file outside this one's scope.
 *
 * ⭐ THAT CONSTRAINT NO LONGER HOLDS, AND THE CONCESSION IS THEREFORE WITHDRAWN RATHER THAN LEFT
 * STANDING. `../ports/SmartListQueryPort` now EXPORTS `translateSmartListInput`, so the grammar has
 * one owner and both services call it. Nothing outside this file had to be modified to reach it —
 * the port is a declared dependency of this service already — and `getSkuSmartList` passes only what
 * is genuinely SKU-specific: the entity name, this service's joins and its keyword properties.
 *
 * ⛔ DO NOT RESTATE ANY OF THESE CONSTANTS HERE AGAIN, not even one, and not even to add a key. Two
 * readings of one legacy grammar cannot be kept in step by hand; the copies had already diverged on
 * the range length gate before they were consolidated. Extend the port instead.
 * ---------------------------------------------------------------------------------------------- */

/* ================================================================================================
 * BOUNDARY TYPES
 *
 * Four aliases and one narrow interface. Each exists because a sibling target file declares a shape
 * this service must consume without importing a module outside its dependency whitelist, and each is
 * accompanied by a compile-time guard so that drift in the sibling breaks the build HERE, at the
 * consumer, rather than silently at the composition root.
 * ============================================================================================== */

/**
 * A SKU that also carries the framework-owned surface the validation engine requires.
 *
 * ⚠️ A WITHDRAWN CLAIM, RECORDED RATHER THAN ERASED. This block previously asserted that
 * `../domain/sku/Sku` "deliberately does NOT declare" `getClassName`, `hasProperty`,
 * `getPropertyMetaData`, `getEntityName`, `getPrimaryIDValue`, `getPrimaryIDPropertyName` or
 * `getValueByPropertyIdentifier`: those are Hibachi base-class facilities on
 * `org/Hibachi/HibachiObject.cfc` and `org/Hibachi/HibachiEntity.cfc`. The source proves the
 * inheritance itself at [model/entity/Sku.cfc:L843-L855], where the entity OVERRIDES
 * `getPropertyMetaData` for its option-group special case and then falls through to
 * `super.getPropertyMetaData( argumentCollection=arguments )` at [:L854] — a `super` call that can only
 * resolve because the base class supplies the member.
 * `../validation/rules/sku.rules` needs them, so its subject type is the intersection of the domain
 * entity with that surface.
 *
 * THE INTERSECTION IS DERIVED, NOT RESTATED. The second half is read off
 * `resolveSkuUniqueTarget`'s own parameter type, which is `SkuValidationSubject & UniquePropertyEntity`.
 * Naming `UniquePropertyEntity` directly would mean importing `../ports/UniquePropertyPort`, which is
 * not in this file's dependency whitelist (D4/E5). `Parameters<…>` obtains the identical type from a
 * module that IS whitelisted, and cannot fall out of step with it.
 *
 * WHERE THE EXTRA SURFACE COMES FROM AT RUN TIME: `../domain/base/populate`'s `manageEntity`, which
 * attaches the seven introspection members and the six error members to the entity itself with
 * `Object.assign` and returns the SAME object. Every SKU this service mints reaches it through
 * {@link SkuService.newSku}, and every SKU read from MySQL reaches it through
 * `../adapters/mysql/rowMappers`. {@link SkuWithErrorState} names that produced shape and
 * {@link _NewSkuIsManagedSku} pins it to this requirement, exactly as `./BrandService` pins
 * `ManagedBrand` to its own. This is the subtree's established pattern, not a new one.
 */
export type ManagedSku = Sku & Parameters<typeof resolveSkuUniqueTarget>[0];

/**
 * A product that also carries the framework-owned ERROR surface `createSkus` writes to.
 *
 * ⭐ AAP-2 — WHY THIS TYPE EXISTS AT ALL. The legacy `createSkus` reports its two branch preconditions
 * by calling `arguments.product.addError(…)` — [model/service/SkuService.cfc:L143], [:L148] and
 * [:L176] — and gates all SKU creation on `arguments.product.hasErrors()` at [:L152] and [:L180]. Those
 * members are not declared on `../domain/product/Product`, because they are Hibachi base-class
 * facilities [org/Hibachi/HibachiTransient.cfc:L29-L67] composed onto every entity instance by
 * `../domain/base/populate`'s `manageEntity`. Requiring them HERE, in the signature, is what makes the
 * errors reach the caller instead of dying in this file.
 *
 * ⛔ IT REQUIRES THE ERROR SURFACE ONLY, NOT THE WHOLE {@link ManagedEntity} INTERSECTION. `createSkus`
 * reads no framework metadata member off the product, so demanding {@link EntityMetadataSurface} as well
 * would reject callers this method can serve. Every real product satisfies the wider type anyway —
 * `../adapters/mysql/rowMappers` returns `ManagedEntity<Product>` and the IR-1 `newProduct` member will
 * too — so narrowing the requirement costs nothing and keeps the contract honest about what is used.
 *
 * WHY `any` BECOMES THIS RATHER THAN STAYING LOOSE. The legacy declares `required any product`
 * [model/service/SkuService.cfc:L58]. AAP 0.4.2 permits tightening a loose signature to the observed
 * contract provided the tightening is recorded, and the observed contract is precisely "a product whose
 * error bag I can write to" — without it the legacy method could not run at all.
 */
export type ProductWithErrorState = Product & EntityErrorSurface;

/**
 * A SKU that carries its own error surface, so validation findings land ON THE SKU.
 *
 * ⭐ AAP-2 — THIS IS A DIFFERENT BAG FROM THE PRODUCT'S, AND THAT IS THE LEGACY'S OWN CHOICE, NOT A
 * CONVENIENCE. `HibachiValidationService.validate( object, context, setErrors=true )` takes its error
 * bean straight off the object under validation — `var errorBean = arguments.object.getHibachiErrors()`
 * at [org/Hibachi/HibachiValidationService.cfc:L156] — and writes it back to that same object at
 * [:L193]. A SKU's findings therefore belong to the SKU.
 *
 * ⛔ SKU FINDINGS ARE NOT REDIRECTED ONTO THE PRODUCT, AND THE TEMPTATION TO DO IT IS REAL. It would
 * make `ProductService.saveProduct`'s gate at [model/service/ProductService.cfc:L286] refuse a product
 * whose SKUs are invalid, which FEELS like the safer behaviour — but it is not the legacy behaviour and
 * adopting it would be an enhancement (G4/IR-9). Two source facts settle it:
 * `HibachiTransient.hasErrors()` counts only its OWN bean [org/Hibachi/HibachiTransient.cfc:L47-L53],
 * and `HibachiEntity.getErrors()` merges in exactly one foreign source — PROCESS OBJECT errors
 * [org/Hibachi/HibachiEntity.cfc:L132-L147] — not child-entity or collection errors. So the legacy
 * product genuinely does not see its SKUs' findings, and an invalid SKU is stopped later, at the
 * request-end flush gate (AAP 0.6.6 mismatch M5), not by the product's own check.
 * `HibachiEntity.getNewPropertyEntity` [org/Hibachi/HibachiEntity.cfc:L90-L115] does walk a collection
 * looking for a child with errors, but it is a form-redisplay helper that RETURNS the child; it feeds
 * nothing into `hasErrors()`.
 */
export type SkuWithErrorState = ManagedEntity<Sku>;

/**
 * The one validation capability this service needs, expressed over the domain SKU.
 *
 * WHY A NARROW VIEW RATHER THAN THE `Validator` CLASS. `Validator.validate` is generic in
 * `TSubject extends ValidationSubject` and `Validator` itself carries private state, so a
 * hand-written double could not stand in for the class. This two-line view keeps the double a plain
 * object literal, and {@link _ValidatorSatisfiesSkuSaveValidator} fails the build if the real class
 * ever stops satisfying it. `./BrandService` declares `BrandBaseService` for the same reason and in the
 * same way.
 *
 * ⚠️ THE CONTEXT PARAMETER MIRRORS THE ENGINE'S CLOSED UNION, DELIBERATELY. It would type-check as a
 * plain `string` — method syntax makes the comparison bivariant, so a `Validator` would still satisfy
 * it — and that is exactly the trap. A narrow structural view is a re-declaration of the contract, so
 * widening the parameter here would re-open the validation bypass at
 * [org/Hibachi/HibachiValidationService.cfc:L162] for every call made THROUGH this interface, no
 * matter how tightly `../validation/Validator` closes its own signature. DECISION V-1 there carries
 * the reasoning; this member is what keeps the guarantee intact on this side of the boundary.
 */
export interface SkuSaveValidator {
  readonly validate: (
    sku: ManagedSku,
    ruleSet: ValidationRuleSet<ManagedSku>,
    context: ValidationContext,
    options?: ValidateOptions,
  ) => Promise<ValidationError>;
}

/**
 * The resource bound on merchandise SKU generation — SEC-11.
 *
 * =============================================================================================
 * WHY THIS EXISTS, AND WHY IT IS INJECTED RATHER THAN WRITTEN DOWN HERE
 * =============================================================================================
 * `createSkus` enumerates the Cartesian product of the selected option groups. The legacy computes
 * its size as `totalCombos = totalCombos * arrayLen(optionGroups[key])`
 * [model/service/SkuService.cfc:L86] and then loops `for(var i = 1; i<=totalCombos; i++)` [:L89],
 * with NO ceiling of any kind. Two consequences follow in a stateless runtime, and neither is
 * theoretical:
 *
 *   1. RESOURCE EXHAUSTION. The size grows multiplicatively in the number of selected options, so a
 *      modest request — say seven groups of ten — asks for ten million SKUs, each of which is
 *      constructed, attached to the product and VALIDATED, and validation reaches the database twice
 *      per SKU. Nothing in the legacy or in this port stops that.
 *   2. NON-TERMINATION. Beyond `Number.MAX_SAFE_INTEGER` the running product loses integer precision
 *      and eventually becomes `Infinity`, at which point `combination < totalCombos` is permanently
 *      true and the loop never ends. This is the failure the review reported, and it is worse than
 *      slow: the invocation cannot complete, so it consumes its entire budget and returns nothing.
 *
 * THE BOUND IS OPERATOR POLICY, SO IT IS NOT INVENTED HERE. AAP 0.7.3 S9 forbids inventing numbers
 * the source does not state, and IR-12 forbids introducing service levels; the legacy states no
 * maximum anywhere. A literal in this file would therefore be fabrication. It is instead a REQUIRED
 * constructor collaborator with NO DEFAULT, exactly as `../services/BaseService`'s population policy
 * is: the composition root must state the number, and a wiring site that states none does not
 * compile. That keeps the decision where the decision belongs and keeps this file free of invented
 * policy.
 *
 * ⛔ DEDUPLICATION IS DELIBERATELY NOT PART OF THE FIX, and this is a considered departure from the
 * review's suggested resolution, which proposed it. Duplicate selections of the same option
 * genuinely produce a multi-element bucket in the legacy — `arrayAppend`
 * [model/service/SkuService.cfc:L78] appends unconditionally — and therefore genuinely produce more
 * combinations. AAP 0.6.7.8 requires the enumeration to be ported EXACTLY because "the enumeration
 * order determines both the generated SKU set and — through 0.6.2 — the order in which uniqueness
 * validation observes its siblings", and AAP 0.6.1.3 T1 independently requires duplicate retention
 * in the option-resolution query for the same reason. Deduplicating would silently change which SKUs
 * exist, which one becomes the default, and the order in which `hasUniqueOptions` sees them. The
 * bound achieves the security objective — bounded, terminating work — WITHOUT changing any of that,
 * which is why it is the fix and deduplication is not.
 */
export interface SkuCombinationBudget {
  /**
   * The largest number of SKUs one `createSkus` call may generate for a single product.
   *
   * Must be a positive safe integer. Validated in the constructor rather than at the point of use,
   * so a mis-wired composition root fails immediately instead of on the first merchandise product.
   */
  readonly maximumCombinationsPerProduct: number;
}

/**
 * Multiplies the running combination count by one option group's bucket size, with both guards.
 *
 * GROUP SEMANTICS. `bucketSize` must be a positive integer. It cannot be zero or negative through
 * the legacy path — a bucket is created and immediately appended to at
 * [model/service/SkuService.cfc:L76-L78], so every bucket holds at least one option — and the guard
 * states that invariant rather than assuming it. A zero-length bucket would drive `totalCombos` to
 * zero and silently generate NO SKUs at all, which is a wrong answer rather than a slow one.
 *
 * CHECKED MULTIPLICATION. The product is rejected once it would exceed `Number.MAX_SAFE_INTEGER`.
 * That ceiling is a LANGUAGE FACT, not an invented policy: past it, integer arithmetic is no longer
 * exact and the loop bound stops being meaningful. Testing the result rather than pre-dividing keeps
 * the arithmetic identical to the legacy's for every input that does not overflow.
 */
function multiplyCombinationCount(
  runningTotal: number,
  bucketSize: number,
  optionGroupID: string,
): number {
  if (!Number.isSafeInteger(bucketSize) || bucketSize < 1) {
    throw new DomainError(
      `Option group ${optionGroupID} resolved to ${String(bucketSize)} selected options while ` +
        `creating SKUs, which cannot be enumerated. model/service/SkuService.cfc:L76-L78 appends ` +
        `every selected option to its group's bucket, so a bucket always holds at least one.`,
      {
        context: {
          optionGroupID,
          bucketSize,
          locator: 'model/service/SkuService.cfc:L82-L86',
        },
      },
    );
  }

  const product = runningTotal * bucketSize;
  if (!Number.isSafeInteger(product)) {
    throw new DomainError(
      `The requested SKU option combinations exceed the largest exactly representable integer, so ` +
        `the combination count cannot be computed. model/service/SkuService.cfc:L86 multiplies the ` +
        `group sizes without a check and model/service/SkuService.cfc:L89 would loop on the ` +
        `resulting imprecise bound.`,
      {
        context: {
          optionGroupID,
          bucketSize,
          locator: 'model/service/SkuService.cfc:L82-L86',
        },
      },
    );
  }

  return product;
}

/**
 * Binds a newly created SKU to the delegate shape `Product.defaultSku` accepts.
 *
 * THIS IS NOT AN OPTIONAL CONVENIENCE. `../domain/sku/Sku` records, in its own mismatch register,
 * that `Sku` IS DELIBERATELY NOT ASSIGNABLE TO `ProductDefaultSkuDelegate`, and names the resolution:
 * "A thin binding adapter in the composition root closes over the ports and satisfies the delegate."
 * The delegate wants nine synchronous, argument-free readers — `getCurrencyCode`, `getPrice`,
 * `getRenewalPrice`, `getListPrice`, `getImageDirectory`, `getImagePath`, `getImage`,
 * `getResizedImagePath` and `getImageExistsFlag` — whereas the entity's equivalents are asynchronous
 * and port-parameterised. Assembling that adapter needs the setting, pricing and image ports, none of
 * which this service is given, so the binder is injected as the function it is. No new port file and
 * no adapter import appears here (S4, S5).
 *
 * The legacy call it stands in for is `arguments.product.setDefaultSku( … )` at
 * [model/service/SkuService.cfc:L102], [:L134], [:L167], [:L189] and [:L198].
 */
export type SkuDefaultSkuDelegateBinder = (sku: Sku) => ProductDefaultSkuDelegate;

/**
 * The collaborator `Product.getBaseProductType` requires in order to answer the discriminator.
 *
 * `ProductType.getBaseProductType` returns its own `systemCode` when it has one and otherwise walks to
 * the ROOT of the product-type hierarchy — [model/entity/ProductType.cfc:L110-L114] — so resolving the
 * base type can need a load the caller must supply. The type is read off `Product`'s own signature
 * because `../domain/product/ProductType` is not in this file's dependency whitelist, and reading it
 * from the whitelisted module keeps the two exactly in step.
 */
export type SkuServiceProductTypeRootResolver = Parameters<Product['getBaseProductType']>[0];

/**
 * Compile-time assertion helper: resolves to `TActual` when it is assignable to `TExpected` and fails
 * the build otherwise. Type-only, so it contributes nothing to the bundle.
 */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * Guard 1 — a real `Validator` really does satisfy {@link SkuSaveValidator}. This is the assignment the
 * composition root performs; checking it here means any drift in `Validator.validate`'s signature
 * breaks the build in the file that depends on it rather than at the wiring site.
 */
type _ValidatorSatisfiesSkuSaveValidator = AssertAssignable<Validator, SkuSaveValidator>;

/**
 * Guard 2 — {@link ManagedSku} really is a legal subject for the ported SKU rule set. Without it, the
 * `createSkuValidationRules<ManagedSku>` instantiation below would be the first thing to fail, and it
 * would fail with a message about a generic constraint rather than about the intersection.
 */
type _ManagedSkuIsRuleSetSubject = AssertAssignable<
  ManagedSku,
  Parameters<typeof resolveSkuUniqueTarget>[0]
>;

/**
 * Guard 3 — a domain {@link Sku} really does satisfy `Product.addSku`'s parameter type, so
 * `product.addSku(newSku)` at [model/service/SkuService.cfc:L100] needs no adapter of its own. It holds
 * because `ProductSkuMember` asks only for `setProduct` and `removeProduct`, both of which the entity
 * declares.
 */
type _SkuIsProductSkuMember = AssertAssignable<Sku, ProductSkuMember>;

/**
 * Guard 4 — AAP-2. A product produced by `../adapters/mysql/rowMappers` really can be handed to
 * {@link SkuService.createSkus}.
 *
 * ⭐ WHY THIS GUARD EARNS ITS PLACE. `createSkus` now DEMANDS the error surface, and this file cannot
 * see who supplies it — `ProductService` does not exist yet, so there is no call site to fail. Without
 * this line the demand could be unsatisfiable by every product the subtree can actually build, and the
 * first hint would come from a different file in a later phase. `ManagedEntity<Product>` is exactly what
 * `mapProductRow` returns, so this proves the supply meets the demand today.
 */
type _MappedProductSatisfiesCreateSkus = AssertAssignable<
  ManagedEntity<Product>,
  ProductWithErrorState
>;

/**
 * Guard 5 — AAP-2. The SKU {@link SkuService.newSku} builds really is a legal validation subject.
 *
 * ⭐ THIS IS THE LINE THAT WOULD HAVE CAUGHT A LATENT RUNTIME CRASH. `../validation/Validator`'s
 * `validate` calls `subject.getClassName()` on the value it is given. {@link SkuSaveValidator} declares
 * its parameter as a bare `Sku` in METHOD syntax, so parameters compare bivariantly and a `Sku` with no
 * framework surface type-checked perfectly — and would then have thrown "getClassName is not a
 * function" the moment a real `Validator` was wired in. Proving the produced SKU satisfies
 * {@link ManagedSku} closes that hole from this side, independently of the bivariance in the interface.
 */
type _NewSkuIsManagedSku = AssertAssignable<SkuWithErrorState, ManagedSku>;

/* ------------------------------------------------------------------------------------------------
 * WHAT GUARDS 4 AND 5 DO AND DO NOT CATCH — MEASURED, NOT ASSUMED
 *
 * Each row below was produced by deliberately breaking the code and reading the compiler and the test
 * runner. Nothing here is inferred.
 *
 *   BREAK                                                    tsc          test run
 *   ──────────────────────────────────────────────────  ──────────  ──────────
 *   `ManagedEntity` loses `EntityErrorSurface`                 Guard 4    —
 *   `EntityMetadataSurface` loses `getClassName`               Guard 5    —
 *   the two benefit loops are CROSSED                          clean      1 failure
 *   a resolved access content is DISCARDED again               clean      1 failure
 *   a branch error goes to a method-local bag again            clean      1 failure
 *   `Promise.reject` reverts to a synchronous `throw`          clean      3 failures
 *   a supplied identifier returns to the message text          clean      1 failure
 *
 * ⚠️ THE DIVISION OF LABOUR IS NOT OPTIONAL, AND THE FIRST TWO ROWS ARE THE ONLY ONES A TYPE CAN REACH.
 * `addSubscriptionBenefit` and `addRenewalSubscriptionBenefit` take the SAME parameter type, so crossing
 * them is a perfectly well-typed program; so is dropping a mutation, writing to a different bag, or
 * throwing instead of rejecting. Guards prove the SHAPES still line up. Tests prove the VALUES go to the
 * right places. Neither alone is sufficient, and claiming otherwise here would be claiming something the
 * measurement above contradicts.
 * ---------------------------------------------------------------------------------------------- */

/* ================================================================================================
 * CFML VALUE SEMANTICS
 *
 * The legacy method reads an untyped `struct data` with CFML's own list, numeric and boolean rules.
 * Those rules are reproduced here rather than replaced by JavaScript's, because the difference is
 * observable: `listToArray("a,,b")` has TWO entries where `"a,,b".split(",")` has three, and
 * `isNumeric("")` is false where `Number("")` is zero. Each helper names the source line whose
 * behaviour it reproduces.
 * ============================================================================================== */

/**
 * CFML `listToArray` — splits on the delimiter and DROPS empty entries.
 *
 * The dropped-empties rule is load-bearing three times over. It is why `listLen(",,,")` is zero, which
 * is what the two subscription guards at [model/service/SkuService.cfc:L142] and [:L147] and the
 * content guard at [:L175] actually test; it is why an empty selected-option list yields zero option
 * lookups at [:L73]; and it is why duplicate and out-of-order entries survive untouched, which the
 * option-resolution semantics T1 and T5 (AAP 0.6.1.3) both depend on. Nothing is sorted, deduplicated,
 * trimmed or normalised here.
 */
function cfmlListToArray(list: string, delimiter: string = CFML_LIST_DELIMITER): string[] {
  return list.split(delimiter).filter((entry) => entry.length > 0);
}

/** CFML `isSimpleValue` — the gate at [org/Hibachi/HibachiSmartList.cfc:L97]. */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * CFML `isNumeric`.
 *
 * Deliberately identical to the predicate `../validation/Validator` applies when it evaluates the
 * `numeric` data-type constraint that `model/validation/Sku.json:L5` declares for `price`: booleans are
 * NOT numeric, the empty string is NOT numeric, a non-finite number is NOT numeric, and a numeric
 * string is. Sharing the semantics matters because a value this file coerces is the same value that
 * rule later judges, and a mismatch between the two would let a price through here that validation
 * then rejected for a reason the port invented.
 */
function readsAsCfmlNumeric(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * Coerces a value the way CFML coerces one on assignment to a numeric property.
 *
 * A NON-NUMERIC VALUE BECOMES `NaN` RATHER THAN AN EXCEPTION, AND THAT IS THE FAITHFUL CHOICE.
 * `newSku.setPrice(arguments.data.price)` at [model/service/SkuService.cfc:L93] is a generated setter
 * with no declared type, so CFML stores whatever it is handed and the `numeric` rule at
 * `model/validation/Sku.json:L5` is what reports the problem. `Sku.price` is typed `number`, so the
 * untyped store is expressed as `NaN`, which {@link readsAsCfmlNumeric} — and therefore the rule —
 * rejects. The failure surfaces in the same place, under the same property key, as it does in the
 * legacy system; throwing here would move it, and silently substituting zero would hide it.
 */
function toCfmlNumber(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!readsAsCfmlNumeric(value)) {
    return Number.NaN;
  }
  return Number(typeof value === 'string' ? value.trim() : value);
}

/** CFML `isBoolean` — booleans, finite numbers, numeric strings and the four word forms. */
function readsAsCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return (
    normalised === 'true' ||
    normalised === 'false' ||
    normalised === 'yes' ||
    normalised === 'no' ||
    readsAsCfmlNumeric(value)
  );
}

/** CFML boolean coercion. Only meaningful once {@link readsAsCfmlBoolean} has accepted the value. */
function toCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'true' || normalised === 'yes') {
      return true;
    }
    if (normalised === 'false' || normalised === 'no') {
      return false;
    }
    if (readsAsCfmlNumeric(value)) {
      return toCfmlNumber(value) !== 0;
    }
  }
  return false;
}

/**

 * An UNGUARDED read of a `data` key — the port of CFML's `arguments.data.someKey`.
 *
 * CFML raises when the key is absent, so this raises too. Five reads in `createSkus` are unguarded and
 * every one of them routes through here, so the absent-key failure cannot be softened by accident in
 * one place and not another.
 *
 * @param data - The caller's data struct.
 * @param key - The key being read.
 * @param locator - The `model/service/SkuService.cfc:L###` site being reproduced.
 * @throws {DomainError} when the key is absent.
 */
function requireDataValue(data: Record<string, unknown>, key: string, locator: string): unknown {
  if (!Object.hasOwn(data, key)) {
    throw new DomainError(
      'createSkus reads a required creation-data key without a guard, and the key is absent. The ' +
        'legacy code performs the same unguarded read at the same point and raises here too.',
      { context: { key, locator } },
    );
  }
  return data[key];
}

/** The unguarded numeric read at [model/service/SkuService.cfc:L93], [:L129], [:L156], [:L183], [:L193]. */
function readRequiredCfmlNumber(
  data: Record<string, unknown>,
  key: string,
  locator: string,
): number {
  return toCfmlNumber(requireDataValue(data, key, locator));
}

/**
 * The three-part list-price guard at [model/service/SkuService.cfc:L94] and [:L130].
 *
 * `structKeyExists(arguments.data, "listPrice") && isNumeric(arguments.data.listPrice) &&
 * arguments.data.listPrice > 0` — all three clauses must hold before `setListPrice` is called at all,
 * so a missing, non-numeric, zero or negative value leaves the SKU's own default in place. Returning
 * `undefined` is how "the setter was never called" is expressed; the caller must not substitute a
 * value of its own.
 *
 * THE SUBSCRIPTION BRANCH HAS NO LIST-PRICE GUARD AT ALL — [model/service/SkuService.cfc:L153-L169]
 * never touches `listPrice`. That asymmetry is preserved by simply not calling this from there.
 */
function readGuardedListPrice(data: Record<string, unknown>): number | undefined {
  if (!Object.hasOwn(data, LIST_PRICE_DATA_KEY)) {
    return undefined;
  }
  const raw = data[LIST_PRICE_DATA_KEY];
  if (!readsAsCfmlNumeric(raw)) {
    return undefined;
  }
  const listPrice = toCfmlNumber(raw);
  return listPrice > 0 ? listPrice : undefined;
}

/**
 * Reads a `data` key as a CFML list, treating an ABSENT key as the empty list.
 *
 * This is the exact collapse of the legacy `!structKeyExists(arguments.data, k) || !listLen(arguments.data[k])`
 * pattern used at [model/service/SkuService.cfc:L142], [:L147] and [:L175]: absent and empty both mean
 * "nothing was supplied", and both produce the same error. Collapsing them is provably equivalent and
 * removes an optional type the branch would otherwise have to re-narrow after the gate.
 *
 * A present but non-simple value raises, because CFML's `listLen` cannot take a struct or an array.
 */
function readCfmlListOrEmpty(
  data: Record<string, unknown>,
  key: string,
  locator: string,
): string[] {
  if (!Object.hasOwn(data, key)) {
    return [];
  }
  return cfmlListToArray(requireCfmlSimpleText(data[key], key, locator));
}

/** The UNGUARDED list read at [model/service/SkuService.cfc:L163]. See {@link requireDataValue}. */
function readRequiredCfmlList(
  data: Record<string, unknown>,
  key: string,
  locator: string,
): string[] {
  return cfmlListToArray(requireCfmlSimpleText(requireDataValue(data, key, locator), key, locator));
}

/** CFML's list functions need a simple value; anything else raises, exactly as `listLen` does. */
function requireCfmlSimpleText(value: unknown, key: string, locator: string): string {
  if (!isCfmlSimpleValue(value)) {
    throw new DomainError(
      'createSkus treats a creation-data key as a list, but the supplied value is not a simple ' +
        "value. CFML's list functions raise on the same input.",
      { context: { key, locator } },
    );
  }
  return String(value);
}

/**
 * The `bundleContentAccess` guard at [model/service/SkuService.cfc:L181].
 *
 * `structKeyExists(arguments.data, "bundleContentAccess") && arguments.data.bundleContentAccess` — an
 * absent key short-circuits to false, and a present one is coerced to a boolean by CFML, which RAISES
 * on a value it cannot read as boolean. Both halves are reproduced.
 */
function readGuardedBundleContentAccessFlag(
  data: Record<string, unknown>,
  locator: string,
): boolean {
  if (!Object.hasOwn(data, BUNDLE_CONTENT_ACCESS_DATA_KEY)) {
    return false;
  }
  const raw = data[BUNDLE_CONTENT_ACCESS_DATA_KEY];
  if (!readsAsCfmlBoolean(raw)) {
    throw new DomainError(
      'createSkus evaluates a creation-data key as a boolean, but the supplied value cannot be read ' +
        'as one. CFML raises on the same coercion.',
      { context: { key: BUNDLE_CONTENT_ACCESS_DATA_KEY, locator } },
    );
  }
  return toCfmlBoolean(raw);
}

/**
 * `arguments.product.getProductCode() & "-#…#"` — the SKU code shape shared by all five creation sites.
 *
 * An absent `productCode` becomes the empty string, following the policy `../domain/sku/Sku` already
 * applies to the same property. The legacy would raise on the concatenation, but this is a scalar read
 * rather than a relationship dereference, and matching the sibling keeps one policy across the subtree
 * instead of two.
 */
function buildSkuCode(product: Product, suffix: number): string {
  return `${product.productCode ?? ''}${SKU_CODE_SEGMENT_DELIMITER}${String(suffix)}`;
}

/**
 * `"-#arrayLen(arguments.product.getSkus()) + 1#"` — [model/service/SkuService.cfc:L97] and [:L159].
 *
 * THE MOMENT THIS IS CALLED IS PART OF THE BEHAVIOUR. In the odometer branch the code is built at
 * [:L97] BEFORE `product.addSku` at [:L100], so the first SKU of a product with no SKUs is numbered 1.
 * In the subscription branch `setProduct` runs FIRST at [:L155], so the collection already contains the
 * new SKU and the same expression numbers the first one 2. That asymmetry is real, is carried, and is
 * the reason this is a function of the product rather than a counter.
 */
function nextSkuCodeSuffix(product: Product): number {
  return product.getSkus().length + 1;
}

/* ================================================================================================
 * SKU SMART-LIST TRANSLATION — DELEGATED, NOT DUPLICATED
 * ================================================================================================
 * A LOCAL COPY OF THE ENTIRE `applyData` GRAMMAR USED TO LIVE HERE: a draft accumulator, the
 * add/remove filter folding, order-statement and keyword parsing, page-figure acceptance, and a
 * query composer — roughly 270 lines. An equivalent copy lived in `./OptionService`, and both
 * restated what `../ports/SmartListQueryPort` already owns.
 *
 * THE GRAMMAR IS ONE LEGACY BEHAVIOUR — `org/Hibachi/HibachiSmartList.cfc` `applyData` — SO IT IS
 * TRANSLATED ONCE. `getSkuSmartList` now calls `translateSmartListInput`, passing only what is
 * genuinely SKU-specific: the entity name, this service's joins, and its keyword properties. Those
 * three remain declared in this file because they ARE this service's knowledge; the grammar that
 * consumes them is not.
 *
 * ⛔ DO NOT REINSTATE A LOCAL TRANSLATOR to add a key or change a precedence rule. Three copies drifting
 * apart is exactly the defect this removal fixes: the copies had already diverged on the range length
 * gate before they were consolidated. Extend the port instead, where every caller gets the change.
 *
 * THAT WARNING HAS ALREADY BEEN TESTED ONCE, AND THE RECORD BELONGS HERE. A later change reinstated a
 * local draft accumulator in this file — entity-parameterised, and carrying a genuine improvement: it
 * resolved every caller-supplied property path against the entity schema before admitting it, closing
 * an identifier surface the shared translator had left open (SEC-09). The improvement was right and the
 * location was wrong: hardening a copy that only this service used would have left `./OptionService`'s
 * two smart lists open, and the copy itself reintroduced the duplication above.
 *
 * BOTH CONCERNS ARE NOW SATISFIED AT ONCE. The schema resolution moved INTO
 * `translateSmartListInput`, which every smart list in the subtree already routes through, so the
 * closed identifiers now cover sku, option AND optionGroup rather than sku alone — a strictly wider
 * guarantee than the local copy achieved — while the grammar remains translated exactly once. The
 * branded `SmartListPropertyIdentifier` makes the rule self-enforcing: an unresolved path is no longer
 * assignable to a filter, so a future local copy cannot skip the check and still compile.
 * ============================================================================================== */

/**
 * The Catalog's SKU service — the port of `model/service/SkuService.cfc`.
 *
 * Ten public members: the nine the legacy declares, reproduced by name, arity and argument order, plus
 * {@link SkuService.newSku}, which the legacy fabricated at run time. See the module header for the
 * full provenance, for the dependency untangling that dropped one dead injection and surfaced one
 * hidden one, and for the M7 statelessness guarantee.
 */
/* -------------------------------------------------------------------------------------------------
 * SKU ORDERING — the shared reorder both sorting members perform, and its carried failure mode
 * ----------------------------------------------------------------------------------------------- */

/**
 * Reads a product's associated SKUs as `Sku` instances.
 *
 * `Product.getSkus()` is typed `ProductSkuMember[]` — the narrow structural interface
 * `../domain/product/Product` declares so the product entity does not have to depend on the SKU entity.
 * `getSortedProductSkus` needs the full entity, because it reads `skuID` off each member and returns them.
 *
 * THE NARROWING IS PROVABLY TOTAL, not a hopeful cast. `Product.addSku` is the only member that appends
 * to the collection, and the only way a caller obtains something to pass it is
 * `Sku.setProduct` — which is itself the sole appender in the other direction. So every member of the
 * collection is a `Sku`. The check is still performed rather than asserted away, because a cast would hide
 * a future violation of that invariant instead of reporting it (S1).
 */
function readProductSkusAsSkus(product: Product): Sku[] {
  const members = product.getSkus();
  const skus: Sku[] = [];
  for (const member of members) {
    if (!(member instanceof Sku)) {
      throw new DomainError(
        'The product has an associated SKU that is not a Sku entity, so the sorted-SKU ordering ' +
          'cannot read it.',
        { context: { productID: product.productID, locator: 'model/service/SkuService.cfc:L248' } },
      );
    }
    skus.push(member);
  }
  return skus;
}

/**
 * Reorders SKUs into the position their identifier occupies in the sorted-identifier list.
 *
 * Both sorting members share this body — [model/service/SkuService.cfc:L227-L243] and [:L255-L268] are
 * the same nine lines twice, and the legacy duplication is consolidated here as an idiom change with no
 * behavioural component.
 *
 * TODO(parity) D13 — model/service/SkuService.cfc:L220-L269. THE REORDER IS LEFT ABLE TO FAIL, AND
 * THAT IS THE WHOLE POINT OF THIS FUNCTION'S EXPLICIT GUARD.
 *
 * The legacy is `ret[ arrayFind(sortedArray, skus[i].getSkuID()) ] = skus[i]`. `arrayFind` returns 0 when
 * the value is absent, and CFML arrays are one-based, so `ret[0]` RAISES. Absence is not hypothetical: the
 * sorted-identifier query returns OPTION-BEARING SKUS ONLY [model/dao/SkuDAO.cfc:L172-L204], because it
 * joins through the option and option-group tables to build its `SUM(sortOrder * POWER(10, …))` ordering.
 * Any SKU of the product without options — a default SKU, most obviously — therefore has no position, and
 * the legacy throws.
 *
 * JavaScript would NOT throw. `out[-1] = sku` silently creates a property named `-1` on the array,
 * leaving `length` untouched and the returned array holding a hole where that SKU should be: a corrupted
 * result, returned successfully. That is a strictly worse outcome than the legacy's, so the guard converts
 * the silent corruption back into the failure the legacy has.
 *
 * Deliberately NOT done: appending the unplaced SKU; filtering it out; placing it first or last;
 * returning the partial array; falling back to the unsorted order. Every one of those would make a
 * currently failing call succeed with a different answer.
 *
 * `arrayResize` at [:L228] pre-sizes the result to the SORTED list's length, not the input's — so when the
 * two differ the legacy returns an array sized by the query. The sparse pre-size reproduces that.
 */
/* ================================================================================================
 * OUT-OF-SCOPE ASSOCIATION TARGETS — THE F04 ADAPTER
 * ================================================================================================
 * [model/service/SkuService.cfc:L160-L165] and [`:L187`]/[`:L196`] apply three many-to-many
 * associations that [model/entity/Sku.cfc:L77-L79] declares as persistent relationships:
 * `subscriptionBenefits`, `renewalSubscriptionBenefits` and `accessContents`. `../domain/sku/Sku`
 * declares all three families, so the associations have real targets — but the ENTITIES on the far
 * side (`SubscriptionBenefit`, `Content`) belong to modules AAP 0.2.2.1 excludes, and they are reached
 * through `../ports/SubscriptionTermPort` and `../ports/AccessContentPort`, which return IDENTIFIER
 * REFERENCES and nothing more.
 *
 * The entity's `add*` members need slightly more than an identifier: the two that maintain BOTH sides
 * of the link ask for `SkuInverseSkuCollectionOwner`, i.e. `hasSku` and `getSkus` as well as `isNew`
 * and `getPrimaryIDValue`. An out-of-scope entity can never carry `hasSku`/`getSkus` natively, so this
 * adapter supplies the inverse side locally, over the identifier the port did return. That is a TR-5
 * crossing done properly: the port stays narrow, and the association is preserved rather than dropped.
 *
 * ⭐⭐ WHY THE ADAPTER MUST BE MEMOIZED PER IDENTIFIER — THE ONE SUBTLE REQUIREMENT.
 * `Sku.hasSubscriptionBenefit`, `hasRenewalSubscriptionBenefit` and `hasAccessContent` all test
 * membership with `Array.prototype.includes`, which compares by REFERENCE IDENTITY. That is faithful:
 * the legacy tests membership with CFML `arrayFind` over an array of components, which also compares
 * by reference. Under Hibernate those references are stable because the SESSION keeps an IDENTITY MAP
 * — `getSubscriptionBenefit(id)` returns the SAME instance every time within one session, so the
 * de-duplication in the entity's guards actually fires. Minting a fresh adapter per call would make
 * every membership test miss, silently duplicating a benefit that appears twice in the input list and
 * on every SKU of a multi-SKU batch. {@link SkuAssociationReferenceMap} reproduces the identity map
 * so the guards behave as they do in the legacy.
 *
 * ⚠️ REQUEST-SCOPED, NEVER MODULE-SCOPED. The registry is constructed inside the branch that uses it
 * and dies with the invocation, matching the Hibernate session's lifetime and satisfying M7/S8 — a
 * module-scope cache here would bleed catalog state between warm Lambda invocations.
 */

/**
 * The identity map that keeps a resolved association reference STABLE within one branch invocation.
 *
 * ⚠️ THIS IS LOAD-BEARING, NOT A CACHE FOR SPEED, AND THE PROOF IS ONE LINE IN THE ENTITY.
 * `../domain/sku/Sku`'s membership guards are REFERENCE-IDENTITY tests — `hasSubscriptionBenefit`
 * reads `this.subscriptionBenefits.includes(subscriptionBenefit)` — so `addSubscriptionBenefit`
 * de-duplicates only when the same far-side row is presented as the same OBJECT. The boundary ports
 * make no such promise: `getSubscriptionBenefit(id)` may legitimately mint a fresh object per call.
 * Without this map, a creation payload naming one benefit twice, or two SKUs of one batch naming the
 * same benefit, would push two distinct objects past a guard that could not see they were the same
 * row — a silent duplicate association with no error and no compile failure.
 *
 * WHAT IT REPRODUCES IS HIBERNATE'S SESSION GUARANTEE, made explicit: within one session the same row
 * always yields the same instance, which is exactly why the legacy's `arrayFind`-based `hasXxx` guard
 * works at all. AAP 0.6.6 M7 is the reason it is scoped to ONE INVOCATION rather than to the module:
 * nothing may survive between Lambda invocations, and a module-scope map of resolved far-side
 * references would bleed one caller's objects into the next warm request.
 *
 * KEYED PER FAMILY AS WELL AS PER IDENTIFIER, because the three relationships at
 * [model/entity/Sku.cfc:L77-L79] address three different far-side tables and an identifier is unique
 * only within its own. `subscriptionBenefits` and `renewalSubscriptionBenefits` share an element type
 * AND an inverse join column and differ only by link table, so they are deliberately given SEPARATE
 * families: collapsing them would let one collection's guard see the other's members.
 */
class SkuAssociationReferenceMap {
  /**
   * Resolved references by `family` then identifier.
   *
   * ⚠️ THE VALUE TYPE IS `unknown` AND THE NARROWING HAPPENS IN {@link SkuAssociationReferenceMap.require},
   * WHICH IS SOUND BECAUSE OF AN INVARIANT THIS CLASS ENFORCES BY CONSTRUCTION: a family key is only
   * ever used with one reference type, and the resolver that mints the value is supplied by the caller
   * at the same site as the family key. Typing the map itself at a union would be less safe, not more:
   * it would let a `require` at one family return the other family's type without complaint.
   */
  private readonly resolved = new Map<string, Map<string, unknown>>();

  /**
   * Returns the one reference for this family and identifier, resolving it on first request.
   *
   * @param family - Which relationship the identifier belongs to.
   * @param primaryIDValue - The far-side row's primary identifier.
   * @param resolve - Resolves and VALIDATES the reference. Called at most once per family and
   *   identifier, so a rejection is not memoised and a retry re-resolves.
   * @returns The stable reference for that row.
   */
  public async require<TReference>(
    family: string,
    primaryIDValue: string,
    resolve: () => Promise<TReference>,
  ): Promise<TReference> {
    let byIdentifier = this.resolved.get(family);
    if (byIdentifier === undefined) {
      byIdentifier = new Map<string, unknown>();
      this.resolved.set(family, byIdentifier);
    }

    if (byIdentifier.has(primaryIDValue)) {
      return byIdentifier.get(primaryIDValue) as TReference;
    }

    /* RESOLVE FIRST, MEMOISE AFTER. A failed resolution must not be recorded: `requireSubscriptionBenefit`
     * and `requireAccessContent` THROW when the far side is absent, and memoising an absence would turn
     * one missing row into a permanently poisoned key for the rest of the invocation. */
    const reference = await resolve();
    byIdentifier.set(primaryIDValue, reference);
    return reference;
  }
}

/** Family keys for {@link SkuAssociationReferenceMap}, one per relationship at [:L77-L79]. */
const SUBSCRIPTION_BENEFIT_FAMILY = 'subscriptionBenefit';
const RENEWAL_SUBSCRIPTION_BENEFIT_FAMILY = 'renewalSubscriptionBenefit';
const ACCESS_CONTENT_FAMILY = 'accessContent';

function reorderBySortedSkuIds(
  skus: readonly Sku[],
  sortedSkuIds: readonly string[],
  locator: string,
): Sku[] {
  /* [:L228] `arrayResize(sortedArrayReturn, len(sortedArray))`.
   *
   * ⚠️ F25 — THE INTERMEDIATE IS TYPED AS POSSIBLY-EMPTY, BECAUSE IT GENUINELY IS. This array was
   * previously declared `new Array<Sku>(n)`, which asserts to the compiler that every slot holds a
   * `Sku` while the slots are in fact empty until assigned. Any position left unfilled then escaped as
   * `undefined` masquerading as a `Sku`, and the hole surfaced arbitrarily far away — the exact failure
   * `noUncheckedIndexedAccess` exists to prevent, defeated by the annotation.
   *
   * Typing it `Sku | undefined` makes the holes visible to the compiler, and the completeness check
   * below converts an unfilled slot into an immediate, named failure. That is also the faithful
   * outcome: CFML's `arrayResize` only reserves capacity, so an unassigned element is undefined there
   * too and the legacy raises on the first read of one. */
  const reordered = new Array<Sku | undefined>(sortedSkuIds.length);

  for (const sku of skus) {
    // [:L237] `arrayFind(sortedArray, skus[i].getSkuID())` — 0 when absent, and 0 is fatal there.
    const position = sortedSkuIds.indexOf(sku.skuID);
    if (position < 0) {
      throw new DomainError(
        'A SKU has no position in the sorted SKU ordering, so it cannot be placed. Carried ' +
          'unrepaired as defect D13: the sorted ordering covers option-bearing SKUs only, and the ' +
          'legacy raises on the same input by indexing position zero of a one-based array.',
        {
          context: {
            skuID: sku.skuID,
            sortedSkuIdCount: sortedSkuIds.length,
            defect: 'D13',
            locator,
          },
        },
      );
    }
    reordered[position] = sku;
  }

  /* ⚠️ F25 — CARDINALITY AND MEMBERSHIP, CHECKED BEFORE THE RESULT ESCAPES.
   *
   * Membership in the other direction is already guaranteed: the loop above raises for any SKU absent
   * from the ordering. What it cannot detect is the converse — an ordering position that NO supplied SKU
   * claimed — which happens whenever `sortedSkuIds` is longer than `skus`, and which the old
   * pre-allocated `Sku[]` returned as a hole. Filtering the holes away would be worse than raising: it
   * would silently return fewer SKUs than the caller asked to order, and the count is observable.
   *
   * ⛔ THE GUARD IS A NARROWING FILTER, NOT A CAST. `reordered.every(...)` cannot narrow the array's
   * element type in place, so the dense copy is built by an explicit walk that the compiler verifies.
   * No `!`, no `as Sku[]`, nothing asserted. */
  const dense: Sku[] = [];
  for (let position = 0; position < reordered.length; position++) {
    const sku = reordered[position];
    if (sku === undefined) {
      throw new DomainError(
        `The sorted SKU ordering has ${String(sortedSkuIds.length)} positions but position ` +
          `${String(position)} was never claimed by any of the ${String(skus.length)} supplied SKUs, ` +
          `so ${locator} cannot return a complete ordering. Carried unrepaired as defect D13: the ` +
          `legacy pre-sizes its return array to the ordering length and leaves such a position ` +
          `undefined, raising on the first read of it.`,
        {
          context: {
            position,
            sortedSkuIdCount: sortedSkuIds.length,
            suppliedSkuCount: skus.length,
            defect: 'D13',
            locator,
          },
        },
      );
    }
    dense.push(sku);
  }

  return dense;
}

export class SkuService {
  /**
   * @param skuRepository - The port of `model/dao/SkuDAO.cfc`, replacing the `skuDAO` property
   *        injection at [model/service/SkuService.cfc:L51] and the `getSkuDAO()` accessor DI/1
   *        synthesized for it (import rules R1 and R2, AAP 0.4.3.1-0.4.3.2). Eight call sites.
   * @param optionService - Replaces the `optionService` injection at [:L53]. One call site, [:L74].
   * @param subscriptionTermPort - Replaces the `subscriptionService` injection at [:L55]. The
   *        subscription module is out of scope, so the dependency crosses the boundary through a
   *        declared port rather than a converted service (TR-5, AAP 0.2.2.7).
   * @param accessContentPort - Replaces the `contentService` injection at [:L56], for the same reason.
   * @param imagePathPort - Replaces the HIDDEN `getService("imageService")` lookup at [:L212]. It is
   *        never declared as a property in the legacy component, so it is invisible to any analysis
   *        based on component metadata — the single most easily missed dependency in this file.
   * @param smartListQueryPort - The dynamic paginated query abstraction
   *        `getSkuDAO().getSmartList` reaches at [:L312].
   * @param validator - The ported validation engine, narrowed to {@link SkuSaveValidator}.
   * @param productTypeRootResolver - Supplied to `Product.getBaseProductType` so the three-way
   *        discriminator can resolve a product type that inherits its `systemCode` from the root of the
   *        hierarchy — [model/entity/ProductType.cfc:L110-L114].
   * @param bindDefaultSkuDelegate - Adapts a new SKU to the shape `Product.defaultSku` accepts. See
   *        {@link SkuDefaultSkuDelegateBinder} for why this cannot be the entity itself.
   * @param combinationBudget - The resource bound on merchandise SKU generation (SEC-11). REQUIRED,
   *        with no default, because the legacy states no maximum and AAP 0.7.3 S9 forbids inventing
   *        one here — see {@link SkuCombinationBudget}. It has no legacy counterpart: it is the one
   *        collaborator on this service that replaces an ABSENT safeguard rather than a present
   *        dependency, which is why it is documented as policy rather than as a port.
   */
  public constructor(
    private readonly skuRepository: SkuRepository,
    private readonly optionService: OptionService,
    private readonly subscriptionTermPort: SubscriptionTermPort,
    private readonly accessContentPort: AccessContentPort,
    private readonly imagePathPort: ImagePathPort,
    private readonly smartListQueryPort: SmartListQueryPort,
    private readonly validator: SkuSaveValidator,
    private readonly productTypeRootResolver: SkuServiceProductTypeRootResolver,
    private readonly bindDefaultSkuDelegate: SkuDefaultSkuDelegateBinder,
    private readonly combinationBudget: SkuCombinationBudget,
  ) {
    /*
     * Fail fast on a mis-wired budget. Validating here rather than at the point of use means a
     * composition root that supplies zero, a negative, a fraction, `Infinity` or `NaN` is rejected
     * when the graph is built — not on the first merchandise product a caller happens to save, by
     * which point the wiring error looks like a data error.
     */
    const maximum = combinationBudget.maximumCombinationsPerProduct;
    if (!Number.isSafeInteger(maximum) || maximum < 1) {
      throw new DomainError(
        `The SKU combination budget must be a positive safe integer, so the configured value ` +
          `cannot bound SKU generation.`,
        { context: { maximumCombinationsPerProduct: maximum } },
      );
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * THE EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED MEMBER
   * ------------------------------------------------------------------------------------------- */

  /**
   * Creates an unsaved SKU.
   *
   * IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED. `this.newSku()` has no declaration anywhere
   * in the legacy tree. `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281] routes the `new`
   * prefix to `onMissingNewMethod` [:L544-L549], which strips the prefix and calls `new( "Sku" )`. The
   * five call sites are [model/service/SkuService.cfc:L92], [:L127], [:L154], [:L182] and [:L192], and
   * `ProductService` calls it once more at [model/service/ProductService.cfc:L176]. TypeScript under
   * `strict` has no equivalent facility, so the member is declared here and the dispatcher is not
   * ported (TR-3).
   *
   * The entity's own field initialisers give every instance a FRESH `options` array, an unsaved
   * 32-character-identifier placeholder, `activeFlag` true and zero prices — the same starting state
   * `new( "Sku" )` produces. No argument is accepted, because the legacy dispatcher passes none.
   *
   * ⭐ AAP-2 — THE FRAMEWORK SURFACE IS COMPOSED ON HERE, AND RETURNING A BARE `new Sku()` WAS THE LESS
   * FAITHFUL OPTION. `onMissingNewMethod` routes to `new( "Sku" )`, which produces a full Hibachi entity
   * — one that already answers `addError`, `hasErrors` and the seven metadata members, because every
   * entity extends `HibachiEntity` and thence `HibachiTransient`. A bare construction here answered none
   * of them, so validation findings had nowhere to land and this service had to keep a private bag that
   * no caller could read. {@link manageEntity} attaches both surfaces to the SAME instance — it is not a
   * wrapper, so identity is preserved and `../adapters/mysql/rowMappers` produces the identical shape for
   * SKUs read from the database.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @returns A new, unassociated, unsaved SKU carrying the framework-owned metadata and error surfaces.
   */
  public newSku(): SkuWithErrorState {
    return manageEntity(new Sku(), SKU_ENTITY_METADATA);
  }

  /* ---------------------------------------------------------------------------------------------
   * THE COMBINATION ENGINE — [model/service/SkuService.cfc:L58-L208]
   * ------------------------------------------------------------------------------------------- */

  /**
   * Creates the SKUs a newly saved product requires, branching on its base product type.
   *
   * THE RETURN VALUE IS NOT A SUCCESS SIGNAL. [model/service/SkuService.cfc:L207] is an
   * unconditional `return true`, reached even when the subscription or content-access branch has added
   * errors and created nothing at all. The only caller,
   * `ProductService.saveProduct` [model/service/ProductService.cfc:L279], DISCARDS the value and
   * decides what to do next by re-checking the product's own error state at [:L286]. The boolean is
   * therefore vestigial, and it is preserved exactly — not narrowed to `void`, not made meaningful, not
   * used to report the error state.
   *
   * ⭐ AAP-2 — THAT IS PRECISELY WHY THE ERROR ROUTING BELOW HAD TO BE FIXED RATHER THAN THE RETURN TYPE.
   * The vestigial boolean and the invisible error bag were two halves of one defect: the value a caller
   * CAN see carries no information, and the state it actually consults was being written to an object
   * this method threw away. Making the boolean meaningful would have been the wrong repair — it would
   * change a signature the source fixes and that `ProductService` ignores. Writing the errors where the
   * source writes them costs no signature change and makes [:L286] a real gate again.
   *
   * ⚠️ THIS METHOD DOES NOT PERSIST ANYTHING, AND NEITHER DOES THE LEGACY. `createSkus` never calls
   * save. The SKUs reach the database as a Hibernate cascade of the product save that
   * `ProductService.saveProduct` performs afterwards at [model/service/ProductService.cfc:L287], which
   * is itself gated on the product having no errors, and the write lands at the request-end flush
   * (AAP 0.6.6 mismatch M5). {@link SkuRepository} exposes no save member for exactly that reason, and
   * this file imports no unit of work and no adapter (S2, S4).
   *
   * M6 — VALIDATION READ-BACK. The highest-risk execution mismatch in the slice. See
   * {@link SkuService.validateNewSku} for the sequencing judgment and why it must not be batched.
   *
   * THE DISCRIMINATOR IS RESOLVED ONCE, AND THAT IS A DELIBERATE TRANSLATION DECISION. The legacy
   * re-evaluates `arguments.product.getProductType().getBaseProductType()` at [:L61], [:L139] and
   * [:L173] — up to three resolutions of the same expression in one call. `ProductType.getBaseProductType`
   * is a pure read of the product-type graph, so the value cannot change between the three tests within
   * a single invocation, and BRANCH SELECTION is therefore identical. Collapsing it to one resolution
   * changes an idiom, not a behaviour, which is exactly the line the Minimal Change Clause draws.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `SkuServiceTest` exists (AAP 0.6.5.2).
   *
   * @param product - The product the SKUs belong to. Mutated in place, as the legacy mutates it.
   * @param data - The caller's untyped data struct. Read with CFML list, numeric and boolean semantics.
   * @returns `true`, unconditionally.
   * @throws {DomainError} carrying the legacy fallthrough message when the base product type is none
   *         of the three seeded discriminators.
   */
  public async createSkus(
    product: ProductWithErrorState,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    /* ✅ AAP-2 — ERRORS GO WHERE THE LEGACY PUTS THEM, AND THE PRIVATE BAG IS GONE. This method used to
     * accumulate every branch precondition and every SKU validation finding into a `ValidationError`
     * declared right here, read it for its own two gates, and then discard it on the way out. Nothing
     * outside this file could observe a single one of those errors, while
     * `ProductService.saveProduct` decides whether to PERSIST the product by asking
     * `arguments.product.hasErrors()` at [model/service/ProductService.cfc:L286] — so an invalid product
     * sailed through a gate that had been silently emptied.
     *
     * The routing now matches the source exactly, and the two destinations are DIFFERENT ON PURPOSE:
     *
     *   • BRANCH PRECONDITIONS → the PRODUCT's bag. `arguments.product.addError(…)` at [:L143], [:L148]
     *     and [:L176]; `arguments.product.hasErrors()` at [:L152] and [:L180]. {@link ProductWithErrorState}
     *     is what makes those members available.
     *
     *   • PER-SKU VALIDATION FINDINGS → each SKU's OWN bag, never the product's. See
     *     {@link SkuWithErrorState} for the two source facts that settle this and for why redirecting
     *     them onto the product would be an enhancement rather than a fix.
     *
     * There is consequently no bag left in this method to be gate-neutral about — but the ordering
     * property that used to justify sharing one still holds and is worth keeping on record: each
     * branch's gate precedes ALL SKU creation in that branch, and the three branches are mutually
     * exclusive, so no gate is ever evaluated after a SKU has been validated. */
    const baseProductType = await product.getBaseProductType(this.productTypeRootResolver);
    const ruleSet = this.buildSkuSaveRuleSet(product);

    if (baseProductType === MERCHANDISE_BASE_PRODUCT_TYPE) {
      /* [:L64] `structKeyExists(arguments.data, "options") && len(arguments.data.options)`. The presence
       * test is on the raw text length, NOT on `listLen`: `len(",")` is 1, so a lone delimiter takes the
       * odometer branch and then resolves zero options, which is the legacy's behaviour and is carried. */
      const rawOptions = Object.hasOwn(data, OPTIONS_DATA_KEY)
        ? requireCfmlSimpleText(
            data[OPTIONS_DATA_KEY],
            OPTIONS_DATA_KEY,
            'model/service/SkuService.cfc:L64',
          )
        : '';
      if (rawOptions.length > 0) {
        await this.createMerchandiseSkusFromSelectedOptions(product, data, rawOptions, ruleSet);
      } else {
        await this.createSingleMerchandiseSku(product, data, ruleSet);
      }
    } else if (baseProductType === SUBSCRIPTION_BASE_PRODUCT_TYPE) {
      await this.createSubscriptionSkus(product, data, ruleSet);
    } else if (baseProductType === CONTENT_ACCESS_BASE_PRODUCT_TYPE) {
      await this.createContentAccessSkus(product, data, ruleSet);
    } else {
      /* [:L204] `throw("There was an unexpected error when creating this product")`. THE MESSAGE
       * STRING IS OWNED BY `../errors/DomainError` AND IS IMPORTED, NEVER RETYPED — it is observable
       * behaviour, so a second copy could drift from the first. There is deliberately no default
       * branch: an unrecognised discriminator raises, exactly as the legacy does.
       *
       * ⛔ AND IT IS RAISED AS `LegacyParityError`, NOT AS THE BASE `DomainError`. That subclass is
       * how `../handlers/httpResponse.ts` tells a mandated legacy string apart from a diagnostic
       * this port authored, so that the former reaches a caller verbatim while the latter never
       * does. Every other `throw new DomainError(...)` in this file carries a diagnostic message
       * and must stay on the base class. See `../errors/DomainError`'s `LegacyParityError` for the
       * full reasoning. The `context` payload below is unaffected: it is never serialized into a
       * response by any branch of that mapping, only attached for server-side handling. */
      throw new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE, {
        context: {
          productID: product.productID,
          baseProductType,
          locator: 'model/service/SkuService.cfc:L203-L205',
        },
      });
    }

    /* ⚠️ F03 — WHERE EACH KIND OF FINDING LANDS, AND WHY NOTHING IS MERGED ONTO THE PRODUCT HERE.
     *
     * Two DIFFERENT kinds of failure arise inside this method and they have two DIFFERENT destinations,
     * because that is what the legacy does:
     *
     *   • BRANCH PRECONDITIONS → the PRODUCT's bag, via `product.addError(…)` at [:L143], [:L148] and
     *     [:L176]. Those are already attached at the point each branch detects them.
     *   • PER-SKU RULE FINDINGS → the SKU's OWN bag, attached inside {@link validateNewSku}. That is
     *     what `HibachiValidationService.validate( …, setErrors=true )` does when it takes the error
     *     bean off the object at [org/Hibachi/HibachiValidationService.cfc:L156] and writes it back at
     *     [:L193] — onto the entity being validated, never onto its parent.
     *
     * ⛔ SO THERE IS DELIBERATELY NO END-OF-METHOD MERGE OF SKU FINDINGS ONTO THE PRODUCT. An earlier
     * revision accumulated per-SKU findings into a local bag and copied them onto the product at this
     * one exit. That was withdrawn for two reasons: it RE-KEYED a SKU's `skuCode`/`price` findings onto
     * the product, where the legacy never puts them, and it made a finding unreadable per-SKU — a caller
     * could see that SOMETHING in the batch failed but not WHICH SKU. Findings now stay on the SKU that
     * produced them, which is both caller-visible and correctly attributed.
     *
     * ⛔ DO NOT REINSTATE A PRODUCT-LEVEL MERGE to make `product.hasErrors()` a batch summary. The
     * batch gate the legacy actually uses is the caller's own, and the per-SKU surface is richer. */

    /* [:L207] `return true;` — UNCONDITIONAL, exactly as written, even when the product now carries
     * errors.
     *
     * ⛔ DO NOT "FIX" THIS INTO `return !product.hasErrors()`. It looks like an oversight and is not:
     * the legacy's caller decides success by reading `product.hasErrors()`, never by reading this
     * boolean, so the return value carries no failure signal in either system. Tightening it would
     * change an observable contract that F03 does not ask to change — the finding is that the errors
     * never REACHED the product, not that the boolean was wrong. Verified against
     * [model/service/SkuService.cfc:L198-L207], where `return true` sits outside every branch. */
    return true;
  }

  /**
   * MERCHANDISE, OPTIONS SUPPLIED — [model/service/SkuService.cfc:L64-L122]. The odometer.
   *
   * THE ENUMERATION ORDER IS THE BEHAVIOUR. This is not a set of combinations; it is a SEQUENCE of
   * them, and three observable outcomes depend on the sequence: the SKU-code suffixes are assigned in
   * it, `defaultSku` is whichever SKU the sequence produces first, and — through M6 — it is the order in
   * which each SKU's uniqueness rule observes its already-created siblings. It must therefore be ported
   * literally. It is deliberately NOT re-expressed as recursion, as a Cartesian-product helper, as a
   * generator, or as any mathematically equivalent enumeration with a different order.
   *
   * The legacy working model is retained name for name — `optionGroups` [:L66], `totalCombos` [:L67],
   * `indexedKeys` [:L68] and `currentIndexesByKey` [:L69] — so the two can be read side by side.
   *
   * THE DEAD LOCAL `keyToChange` IS NOT EMITTED. [:L70] declares `var keyToChange = ""` and NOTHING
   * in the method ever reads or reassigns it; the carry loop uses `changeKeyIndex` [:L111] instead. An
   * unread binding would be an ESLint error here, and emitting one to mirror a dead declaration would
   * trade a real build failure for zero behavioural gain. Its omission is recorded rather than silent
   * (S7).
   *
   * M9 — CFML STRUCT ITERATION IS UNORDERED; THIS IS NOT. [:L82] and [:L106] both traverse the
   * `optionGroups` struct with `for(var key in …)`, and CFML specifies no order for a plain struct, so
   * the legacy's own combination sequence is unspecified. A `Map` preserves FIRST-SEEN INSERTION order,
   * which is the order the selected-option list itself establishes at [:L73-L79]. That choice is
   * deliberate: it is stable across runs and platforms, so tests and builds are reproducible, and it is
   * the most defensible reading of an unspecified legacy order. The group identifiers are NOT sorted —
   * sorting would impose an order the legacy never had and would silently change which SKU becomes the
   * default.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createMerchandiseSkusFromSelectedOptions(
    product: Product,
    data: Record<string, unknown>,
    rawOptions: string,
    ruleSet: ValidationRuleSet<ManagedSku>,
  ): Promise<void> {
    const optionGroups = new Map<string, Option[]>();
    let totalCombos = 1;
    const indexedKeys: string[] = [];
    const currentIndexesByKey = new Map<string, number>();

    /* [:L73-L79] — group the selected options by their option group, in list order. Duplicates are
     * retained and nothing is deduplicated: two selections of the same option genuinely produce a
     * two-element bucket in the legacy, and therefore two combinations. */
    for (const optionID of cfmlListToArray(rawOptions)) {
      const option = await this.requireOption(optionID, 'model/service/SkuService.cfc:L74');
      const optionGroupID = this.requireOptionGroupID(option, 'model/service/SkuService.cfc:L75');
      let bucket = optionGroups.get(optionGroupID);
      if (bucket === undefined) {
        bucket = [];
        optionGroups.set(optionGroupID, bucket);
      }
      bucket.push(option);
    }

    /* [:L82-L86] — publish the traversal order into `indexedKeys`, start every odometer wheel at its
     * first position, and multiply the total. `totalCombos` starts at 1 [:L67], so a selected-option
     * list that resolves to zero groups yields exactly ONE combination with no options at all. */
    for (const [optionGroupID, bucket] of optionGroups) {
      indexedKeys.push(optionGroupID);
      currentIndexesByKey.set(optionGroupID, FIRST_OPTION_INDEX);
      /* SEC-11 — the multiplication of [:L86], with the group-semantics and overflow guards the
       * legacy lacks. See {@link multiplyCombinationCount}; the arithmetic is unchanged for every
       * input that does not overflow. */
      totalCombos = multiplyCombinationCount(totalCombos, bucket.length, optionGroupID);
    }

    /*
     * SEC-11 — THE BUDGET GATE, EVALUATED BEFORE THE FIRST SKU EXISTS.
     *
     * Position is the point. Checking here means an over-large request creates NOTHING: no SKU is
     * constructed, none is attached to the product, `product.defaultSku` is not set, and no
     * validation round trip is issued. Checking inside the loop instead would leave a partially
     * built product behind — the exact half-done state AAP 0.6.6 M3 flags as the importer's
     * per-row-commit hazard, reproduced here for no reason.
     *
     * The bound is the injected operator policy; nothing about it is invented in this file. See
     * {@link SkuCombinationBudget} for why, and for why deduplication is NOT the fix.
     */
    const maximumCombinations = this.combinationBudget.maximumCombinationsPerProduct;
    if (totalCombos > maximumCombinations) {
      throw new DomainError(
        `Creating SKUs for this product would generate ${String(totalCombos)} option ` +
          `combinations, which exceeds the configured maximum of ${String(maximumCombinations)}. ` +
          `No SKU was created. model/service/SkuService.cfc:L86-L89 enumerates the Cartesian ` +
          `product of the selected option groups with no ceiling.`,
        {
          context: {
            requestedCombinations: totalCombos,
            maximumCombinationsPerProduct: maximumCombinations,
            optionGroupCount: optionGroups.size,
            locator: 'model/service/SkuService.cfc:L82-L89',
          },
        },
      );
    }

    /* [:L89-L122] — one SKU per combination, in odometer order. */
    for (let combination = 0; combination < totalCombos; combination++) {
      // [:L92]
      const newSku = this.newSku();
      // [:L93]
      newSku.price = readRequiredCfmlNumber(
        data,
        PRICE_DATA_KEY,
        'model/service/SkuService.cfc:L93',
      );
      // [:L94-L96]
      const listPrice = readGuardedListPrice(data);
      if (listPrice !== undefined) {
        newSku.listPrice = listPrice;
      }
      /* [:L97] — read BEFORE `addSku` below, so the first SKU of an empty product is numbered 1. */
      newSku.skuCode = buildSkuCode(product, nextSkuCodeSuffix(product));

      /* [:L100] — `product.addSku(newSku)`, which [model/entity/Product.cfc:L1010] implements as a pure
       * delegation to `newSku.setProduct(this)`. The port keeps the SOURCE-LEVEL choice of member,
       * because the no-options branch below deliberately makes the other one. */
      product.addSku(newSku);
      /* [:L101-L103] — only when the product has no default yet, so the FIRST combination wins. */
      if (product.defaultSku === undefined) {
        product.defaultSku = this.bindDefaultSkuDelegate(newSku);
      }

      /* [:L106-L108] — exactly one option from each group, at that group's current wheel position. */
      for (const [optionGroupID, bucket] of optionGroups) {
        newSku.addOption(this.readCurrentOption(bucket, currentIndexesByKey, optionGroupID));
      }

      await this.validateNewSku(newSku, ruleSet);

      /* [:L109] — the carry is skipped on the final combination, so the wheels are left mid-sequence. */
      if (combination < totalCombos - 1) {
        this.advanceOptionOdometer(optionGroups, indexedKeys, currentIndexesByKey);
      }
    }
  }

  /**
   * The odometer carry — [model/service/SkuService.cfc:L110-L120].
   *
   * `indexedKeys[0]` ADVANCES FASTEST. `changeKeyIndex` starts at the FIRST published key ([:L111]
   * starts it at CFML's 1) and only moves on when that wheel has already reached its last position, so
   * the earliest-seen option group is the least significant digit. Reversing this reverses the SKU
   * sequence and therefore the SKU codes and the default SKU.
   *
   * THE MISSING BOUNDS GUARD IS PRESERVED, NOT ADDED. [:L113] indexes `indexedKeys[changeKeyIndex]`
   * with no check that the index is in range, so a carry that ran past the last group would raise in
   * CFML. `noUncheckedIndexedAccess` makes the same read `string | undefined` here, and the narrowing
   * raises on exactly the input CFML raises on — it does not clamp, wrap or silently stop. The branch is
   * unreachable while `totalCombos` is the product of the bucket lengths, which is the same reason the
   * legacy never trips it either.
   */
  private advanceOptionOdometer(
    optionGroups: Map<string, Option[]>,
    indexedKeys: readonly string[],
    currentIndexesByKey: Map<string, number>,
  ): void {
    let indexesUpdated = false;
    let changeKeyIndex = 0;

    while (!indexesUpdated) {
      const optionGroupID = indexedKeys[changeKeyIndex];
      if (optionGroupID === undefined) {
        throw new DomainError(
          'The option combination carry ran past the last option group while creating SKUs. The ' +
            'legacy code indexes its key list without a bounds check and raises on the same state.',
          { context: { changeKeyIndex, locator: 'model/service/SkuService.cfc:L110-L120' } },
        );
      }
      const bucket = optionGroups.get(optionGroupID);
      const currentIndex = currentIndexesByKey.get(optionGroupID);
      if (bucket === undefined || currentIndex === undefined) {
        throw new DomainError(
          'An option group has no combination state while creating SKUs, so the odometer cannot ' +
            'resolve.',
          { context: { optionGroupID, locator: 'model/service/SkuService.cfc:L110-L120' } },
        );
      }

      // [:L113-L115] `currentIndexesByKey[key] < arrayLen(optionGroups[key])`, shifted one place.
      if (currentIndex < bucket.length - 1) {
        currentIndexesByKey.set(optionGroupID, currentIndex + 1);
        indexesUpdated = true;
      } else {
        // [:L117-L118] reset this wheel and carry into the next.
        currentIndexesByKey.set(optionGroupID, FIRST_OPTION_INDEX);
        changeKeyIndex++;
      }
    }
  }

  /**
   * MERCHANDISE, NO OPTIONS — [model/service/SkuService.cfc:L127-L134]. One SKU, and one asymmetry.
   *
   * THIS BRANCH CALLS `thisSku.setProduct(product)` AT [:L128], NOT `product.addSku(thisSku)`, AND IT
   * IS PORTED THAT WAY. The two are behaviourally identical — [model/entity/Product.cfc:L1010]
   * implements `addSku` as `arguments.sku.setProduct( this )` — so this looks like a pointless
   * inconsistency to normalise away. It is left exactly as written: the source-level choice is what a
   * reader comparing the two branches will check, and "the branches differ in which member they call"
   * is a true statement about the legacy that a normalised port would erase.
   *
   * THE SUFFIX IS THE LITERAL `1`, NOT AN ORDINAL. [:L133] writes `& "-1"` with no arithmetic at all,
   * where the odometer branch computes `arrayLen(getSkus()) + 1`. On a product that already has SKUs
   * this branch will therefore mint a duplicate code, which the `skuCode` uniqueness rule in
   * `model/validation/Sku.json:L9` is what catches. Carried unchanged.
   *
   * `setDefaultSku` IS UNCONDITIONAL HERE. [:L134] has no `isNull(getDefaultSku())` guard, unlike
   * [:L101], so this branch REPLACES an existing default. Carried unchanged.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createSingleMerchandiseSku(
    product: Product,
    data: Record<string, unknown>,
    ruleSet: ValidationRuleSet<ManagedSku>,
  ): Promise<void> {
    // [:L127]
    const thisSku = this.newSku();
    // [:L128] — see the asymmetry note above.
    thisSku.setProduct(product);
    // [:L129]
    thisSku.price = readRequiredCfmlNumber(
      data,
      PRICE_DATA_KEY,
      'model/service/SkuService.cfc:L129',
    );
    // [:L130-L132]
    const listPrice = readGuardedListPrice(data);
    if (listPrice !== undefined) {
      thisSku.listPrice = listPrice;
    }
    // [:L133]
    thisSku.skuCode = buildSkuCode(product, FIRST_SKU_CODE_SUFFIX);
    // [:L134]
    product.defaultSku = this.bindDefaultSkuDelegate(thisSku);

    await this.validateNewSku(thisSku, ruleSet);
  }

  /**
   * SUBSCRIPTION — [model/service/SkuService.cfc:L139-L170]. One SKU per selected subscription term.
   *
   * `renewalPrice` IS SET FROM THE SAME `data.price` VALUE AS `price`. [:L156] and [:L157] read the
   * identical key. There is a distinct `renewalPrice` field on the entity and
   * `model/validation/Sku.json:L11` validates it separately, and `ProductService` DOES read a separate
   * renewal price at [model/service/ProductService.cfc:L179], so this looks like a copy-paste slip. It
   * is carried unchanged: repairing it would change every subscription SKU this method has ever created.
   *
   * `data.renewalSubscriptionBenefits` IS READ WITHOUT A GUARD at [:L163], while
   * `subscriptionBenefits` and `subscriptionTerms` are both guarded at [:L142] and [:L147]. An absent key
   * therefore RAISES rather than being treated as an empty list — which is exactly why
   * `SubscriptionSkuCreationData` declares that member REQUIRED while declaring the other two optional.
   * The read is placed immediately after the gate rather than inside the loop, which is equivalent: the
   * gate can only pass when at least one term was supplied, so the legacy always performs the read at
   * least once too.
   *
   * THERE IS NO LIST-PRICE HANDLING IN THIS BRANCH AT ALL, unlike both merchandise arms. Carried.
   *
   * ✅ AAP-3 — THE BENEFIT ASSOCIATIONS ARE MADE. [:L161] and [:L164] call
   * `thisSku.addSubscriptionBenefit(…)` and `thisSku.addRenewalSubscriptionBenefit(…)`, and
   * `../domain/sku/Sku` now declares both collections and both helpers. They were previously absent on
   * the grounds that the subscription MODULE is out of scope (AAP 0.2.2.1) — but the element entity being
   * out of scope is not a reason to drop the LINK, which `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit`
   * [model/entity/Sku.cfc:L78-L79] own on THIS side. The collections are typed at the narrow
   * `SubscriptionBenefitReference` the port already exposes, so no out-of-scope entity is pulled in
   * (TR-5), and every benefit is both resolved AND associated in source order.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createSubscriptionSkus(
    product: ProductWithErrorState,
    data: Record<string, unknown>,
    ruleSet: ValidationRuleSet<ManagedSku>,
  ): Promise<void> {
    // [:L142-L144]
    const subscriptionBenefits = readCfmlListOrEmpty(
      data,
      SUBSCRIPTION_BENEFITS_DATA_KEY,
      'model/service/SkuService.cfc:L142',
    );
    if (subscriptionBenefits.length === 0) {
      product.addError(SUBSCRIPTION_BENEFITS_ERROR_PROPERTY, SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY);
    }

    // [:L147-L149]
    const subscriptionTerms = readCfmlListOrEmpty(
      data,
      SUBSCRIPTION_TERMS_DATA_KEY,
      'model/service/SkuService.cfc:L147',
    );
    if (subscriptionTerms.length === 0) {
      product.addError(SUBSCRIPTION_TERMS_ERROR_PROPERTY, SUBSCRIPTION_TERMS_REQUIRED_RBKEY);
    }

    /* [:L152] `if(!arguments.product.hasErrors())` — the whole creation loop is gated, so a product that
     * failed either check above ends this branch having created nothing. */
    if (product.hasErrors()) {
      return;
    }

    /* ⭐ THE HIBERNATE-SESSION IDENTITY MAP, REPRODUCED — see the block comment on
     * {@link SkuAssociationReferenceMap}. Constructed HERE, once per branch invocation, so every
     * SKU in this batch shares one reference per far-side identifier exactly as one Hibernate session
     * does. Constructing it per SKU, or per `add*` call, would defeat the reference-identity
     * de-duplication inside `../domain/sku/Sku`'s guards; constructing it at module scope would bleed
     * catalog state between warm Lambda invocations (M7 / S8). */
    const associationReferences = new SkuAssociationReferenceMap();

    const subscriptionData: SubscriptionSkuCreationData = {
      subscriptionBenefits,
      subscriptionTerms,
      // [:L163] — the unguarded read. See the method note.
      renewalSubscriptionBenefits: readRequiredCfmlList(
        data,
        RENEWAL_SUBSCRIPTION_BENEFITS_DATA_KEY,
        'model/service/SkuService.cfc:L163',
      ),
    };

    // [:L153-L169]
    for (let index = 0; index < subscriptionTerms.length; index++) {
      const subscriptionTermID = subscriptionTerms[index];
      if (subscriptionTermID === undefined) {
        throw new DomainError('The subscription term list lost an entry while creating SKUs.', {
          context: { index, locator: 'model/service/SkuService.cfc:L158' },
        });
      }

      // [:L154]
      const thisSku = this.newSku();
      /* [:L155] — the association comes FIRST here, which is why the SKU code computed at [:L159] below
       * already counts this SKU and so starts at 2 rather than 1. */
      thisSku.setProduct(product);
      // [:L156]
      const price = readRequiredCfmlNumber(
        data,
        PRICE_DATA_KEY,
        'model/service/SkuService.cfc:L156',
      );
      thisSku.price = price;
      // [:L157] — the same value. See the method note.
      thisSku.renewalPrice = price;
      // [:L158]
      thisSku.setSubscriptionTerm(
        await this.requireSubscriptionTerm(subscriptionTermID, 'model/service/SkuService.cfc:L158'),
      );
      // [:L159]
      thisSku.skuCode = buildSkuCode(product, nextSkuCodeSuffix(product));

      /* [:L160-L162] ✅ AAP-3 — RESOLVED **AND ASSOCIATED**, in source order. The reference used to be
       * resolved and then thrown away. `addSubscriptionBenefit` appends to `SwSkuSubsBenefit`'s owning
       * collection, so the iteration order of `subscriptionBenefits` is the collection order — the
       * legacy `listGetAt(…, b)` walk at [:L161] is ordered the same way. */
      for (const subscriptionBenefitID of subscriptionBenefits) {
        thisSku.addSubscriptionBenefit(
          await associationReferences.require(
            SUBSCRIPTION_BENEFIT_FAMILY,
            subscriptionBenefitID,
            () =>
              this.requireSubscriptionBenefit(
                subscriptionBenefitID,
                'model/service/SkuService.cfc:L161',
              ),
          ),
        );
      }
      /* [:L163-L165] — likewise, over the unguarded list, but into the SEPARATE
       * `renewalSubscriptionBenefits` collection. ⚠️ THE TWO COLLECTIONS SHARE AN ELEMENT TYPE AND AN
       * INVERSE JOIN COLUMN and differ only by link table — `SwSkuSubsBenefit` versus
       * `SwSkuRenewalSubsBenefit` [model/entity/Sku.cfc:L78-L79] — so nothing in the type system can
       * catch these two loops being crossed. The ad-hoc verification pins them apart behaviourally. */
      for (const renewalBenefitID of subscriptionData.renewalSubscriptionBenefits) {
        thisSku.addRenewalSubscriptionBenefit(
          await associationReferences.require(
            RENEWAL_SUBSCRIPTION_BENEFIT_FAMILY,
            renewalBenefitID,
            () =>
              this.requireSubscriptionBenefit(
                renewalBenefitID,
                'model/service/SkuService.cfc:L164',
              ),
          ),
        );
      }

      // [:L166-L168] `if(i==1)`
      if (index === FIRST_ARRAY_INDEX) {
        product.defaultSku = this.bindDefaultSkuDelegate(thisSku);
      }

      await this.validateNewSku(thisSku, ruleSet);
    }
  }

  /**
   * CONTENT ACCESS — [model/service/SkuService.cfc:L173-L202]. Either one bundled SKU or one per content.
   *
   * THE MUTATION ORDER IS THE INVERSE OF BOTH SIBLING BRANCHES. Here the SKU code is assigned BEFORE
   * the product association — [:L184] then [:L185], and [:L194] then [:L195] — whereas the subscription
   * branch associates first [:L155] and the odometer branch associates after computing the code from the
   * collection length [:L97] then [:L100]. The consequence is real: because the association has not
   * happened yet, `arrayLen(getSkus())` would be one lower here, which is precisely why this branch uses
   * a literal `1` and an explicit `c` ordinal instead of the collection length. Carried as written.
   *
   * THE BUNDLED ARM SETS THE DEFAULT SKU UNCONDITIONALLY at [:L189], while the per-content arm gates
   * it on the first iteration at [:L197]. Both are carried.
   *
   * NO CONTENT IDENTIFIER IS DEDUPLICATED, SORTED OR NORMALISED — the per-content arm creates exactly
   * one SKU per list entry, in input order, with the 1-based suffixes `-1`, `-2`, … that [:L194]
   * produces.
   *
   * ✅ AAP-3 — `newSku.addAccessContent(…)` at [:L187] and [:L196] now has a target member.
   * `../domain/sku/Sku` declares the `accessContents` collection typed at the port's narrow
   * `AccessContentReference`, so the `SwSkuAccessContent` link this entity OWNS
   * [model/entity/Sku.cfc:L77] is recorded without importing the out-of-scope `Content` entity (TR-5).
   * ⚠️ THE BUNDLED ARM IS WHERE THIS MATTERS MOST: it collapses N contents onto ONE SKU, so the
   * collection is the only surviving record of which contents were bundled together.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createContentAccessSkus(
    product: ProductWithErrorState,
    data: Record<string, unknown>,
    ruleSet: ValidationRuleSet<ManagedSku>,
  ): Promise<void> {
    // [:L175-L177]
    const accessContents = readCfmlListOrEmpty(
      data,
      ACCESS_CONTENTS_DATA_KEY,
      'model/service/SkuService.cfc:L175',
    );
    if (accessContents.length === 0) {
      product.addError(ACCESS_CONTENTS_ERROR_PROPERTY, ACCESS_CONTENTS_REQUIRED_RBKEY);
    }

    // [:L180] — the same gate shape as the subscription branch.
    if (product.hasErrors()) {
      return;
    }

    // [:L181]
    const bundleContentAccess = readGuardedBundleContentAccessFlag(
      data,
      'model/service/SkuService.cfc:L181',
    );
    const creationMode: ContentAccessSkuCreationMode = bundleContentAccess
      ? 'bundled'
      : 'skuPerContent';
    /* `price` is read once here rather than inside each arm at [:L183] and [:L193]. Both arms sit after
     * the gate and each performs at least one read — the gate guarantees a non-empty content list — so a
     * single read raises on exactly the same inputs. */
    const creationData: ContentAccessSkuCreationData = {
      price: readRequiredCfmlNumber(data, PRICE_DATA_KEY, 'model/service/SkuService.cfc:L183'),
      accessContents,
      ...(bundleContentAccess ? { bundleContentAccess } : {}),
    };

    /* ⭐ THE HIBERNATE-SESSION IDENTITY MAP, REPRODUCED — see the block comment on
     * {@link SkuAssociationReferenceMap}. Constructed HERE, once per branch invocation, so every
     * SKU in this batch shares one reference per far-side identifier exactly as one Hibernate session
     * does. Constructing it per SKU, or per `add*` call, would defeat the reference-identity
     * de-duplication inside `../domain/sku/Sku`'s guards; constructing it at module scope would bleed
     * catalog state between warm Lambda invocations (M7 / S8). */
    const associationReferences = new SkuAssociationReferenceMap();

    if (creationMode === 'bundled') {
      // [:L182-L189]
      const newSku = this.newSku();
      newSku.price = creationData.price;
      // [:L184] — the literal suffix, assigned BEFORE the association below.
      newSku.skuCode = buildSkuCode(product, FIRST_SKU_CODE_SUFFIX);
      newSku.setProduct(product);
      /* [:L186-L188] ✅ AAP-3 — EVERY content is associated with the ONE bundled SKU, in source order.
       * This is the whole point of the bundled arm: `bundleContentAccess` collapses N contents into one
       * SKU, so this collection is the only place that record of which contents were bundled survives.
       * Discarding the references here lost exactly that. */
      for (const contentID of accessContents) {
        newSku.addAccessContent(
          await associationReferences.require(ACCESS_CONTENT_FAMILY, contentID, () =>
            this.requireAccessContent(contentID, 'model/service/SkuService.cfc:L187'),
          ),
        );
      }
      // [:L189] — unconditional.
      product.defaultSku = this.bindDefaultSkuDelegate(newSku);

      await this.validateNewSku(newSku, ruleSet);
      return;
    }

    // [:L191-L200]
    for (let index = 0; index < accessContents.length; index++) {
      const contentID = accessContents[index];
      if (contentID === undefined) {
        throw new DomainError('The access-content list lost an entry while creating SKUs.', {
          context: { index, locator: 'model/service/SkuService.cfc:L196' },
        });
      }

      const newSku = this.newSku();
      // [:L193]
      newSku.price = creationData.price;
      // [:L194] `"-#c#"` — the 1-based ordinal of the loop, not the collection length.
      newSku.skuCode = buildSkuCode(product, index + FIRST_ORDINAL);
      // [:L195]
      newSku.setProduct(product);
      /* [:L196] ✅ AAP-3 — exactly one content per SKU, associated rather than discarded. Contrast the
       * bundled arm above, which puts every content on a single SKU. */
      newSku.addAccessContent(
        await associationReferences.require(ACCESS_CONTENT_FAMILY, contentID, () =>
          this.requireAccessContent(contentID, 'model/service/SkuService.cfc:L196'),
        ),
      );
      // [:L197-L199] `if(c==1)`
      if (index === FIRST_ARRAY_INDEX) {
        product.defaultSku = this.bindDefaultSkuDelegate(newSku);
      }

      await this.validateNewSku(newSku, ruleSet);
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * COLLABORATOR RESOLUTION — the unguarded legacy dereferences, made explicit
   *
   * Each helper below reproduces one legacy expression that dereferences a lookup result without
   * checking it. Hibachi's `get`-prefixed lookups return null when nothing matches
   * [org/Hibachi/HibachiService.cfc:L305-L328], so every one of these raises in CFML on a missing
   * record, and every one raises here. None of them substitutes a default, skips the entry or
   * shortens the resulting collection — doing so would change the number of SKUs created, which is the
   * one thing a caller can actually observe.
   * ------------------------------------------------------------------------------------------- */

  /** `getOptionService().getOption( listGetAt(arguments.data.options, i) )` — [:L74]. */
  private async requireOption(optionID: string, locator: string): Promise<Option> {
    const option = await this.optionService.getOption(optionID);
    if (option === null) {
      throw new DomainError(
        'A selected option does not exist, so the SKU combination cannot resolve it. The legacy ' +
          'code dereferences the lookup result without a guard and raises here too.',
        { context: { optionID, locator } },
      );
    }
    return option;
  }

  /** `option.getOptionGroup().getOptionGroupID()` — [:L75], [:L76] and [:L78], three unguarded chains. */
  private requireOptionGroupID(option: Option, locator: string): string {
    const optionGroup = option.optionGroup;
    if (optionGroup === undefined) {
      throw new DomainError(
        'A selected option has no option group, so the SKU combination cannot resolve. The legacy ' +
          'code dereferences the option group without a guard and raises here too.',
        { context: { optionID: option.optionID, locator } },
      );
    }
    return optionGroup.optionGroupID;
  }

  /** `optionGroups[key][ currentIndexesByKey[key] ]` — [:L107], a doubly unguarded index read. */
  private readCurrentOption(
    bucket: readonly Option[],
    currentIndexesByKey: ReadonlyMap<string, number>,
    optionGroupID: string,
  ): Option {
    const currentIndex = currentIndexesByKey.get(optionGroupID);
    if (currentIndex === undefined) {
      throw new DomainError(
        'An option group has no current combination index, so the SKU combination cannot resolve.',
        { context: { optionGroupID, locator: 'model/service/SkuService.cfc:L107' } },
      );
    }
    const option = bucket[currentIndex];
    if (option === undefined) {
      throw new DomainError(
        'An option group has no option at its current combination index, so the SKU combination ' +
          'cannot resolve. CFML raises on the same out-of-range array read.',
        { context: { optionGroupID, currentIndex, locator: 'model/service/SkuService.cfc:L107' } },
      );
    }
    return option;
  }

  /** `getSubscriptionService().getSubscriptionTerm( … )` — [:L158], through the boundary port. */
  private async requireSubscriptionTerm(
    subscriptionTermID: string,
    locator: string,
  ): Promise<{ readonly subscriptionTermID: string }> {
    const subscriptionTerm =
      await this.subscriptionTermPort.getSubscriptionTerm(subscriptionTermID);
    if (subscriptionTerm === null) {
      throw new DomainError(
        'The subscription term named in the creation data does not exist, so the SKU cannot be ' +
          'associated with it. The legacy code passes the unchecked lookup result straight to ' +
          'setSubscriptionTerm and raises here too.',
        { context: { subscriptionTermID, locator } },
      );
    }
    return subscriptionTerm;
  }

  /**
   * `getSubscriptionService().getSubscriptionBenefit( … )` — [:L161] and [:L164].
   *
   * ⚠️ F04 — RETURNS THE RESOLVED REFERENCE. It previously returned `void`, resolving the benefit and
   * then throwing the result away with a note that `../domain/sku/Sku` "declares neither collection".
   * That claim is withdrawn: the entity declares all three families at [model/entity/Sku.cfc:L77-L79],
   * so the caller can and does apply the association. Only the far-side ENTITY is out of scope, and
   * `SkuAssociationReferenceMap` keeps the reference this returns stable for the identifier it was
   * resolved from, which is what the entity's reference-identity membership guard needs.
   */
  private async requireSubscriptionBenefit(
    subscriptionBenefitID: string,
    locator: string,
  ): Promise<SubscriptionBenefitReference> {
    const subscriptionBenefit =
      await this.subscriptionTermPort.getSubscriptionBenefit(subscriptionBenefitID);
    if (subscriptionBenefit === null) {
      /* ⚠️ SEC-2 — THE IDENTIFIER AND THE LOCATOR ARE CONTEXT, NOT MESSAGE. Both were previously
       * interpolated into the message text, and `src/handlers/httpResponse.ts` would have had to
       * withhold the whole string to avoid disclosing a caller-supplied identifier and an internal
       * source path. They travel in `context` instead, where the log keeps them and no response can
       * echo them. No `publicMessage` is classified: a missing benefit is an internal failure, not one
       * of the four verbatim legacy strings. */
      throw new DomainError(
        'The subscription benefit named in the creation data does not exist, so the SKU cannot be ' +
          'associated with it. The legacy code passes the unchecked lookup result straight to the ' +
          "SKU's benefit collection and raises here too.",
        { context: { subscriptionBenefitID, locator } },
      );
    }
    /* ✅ AAP-3 — THE RESOLVED REFERENCE IS RETURNED, NOT DISCARDED. It was previously dropped on the
     * grounds that no collection existed to receive it; `../domain/sku/Sku` now declares all three
     * owning collections, so the caller associates it. Returning rather than associating HERE keeps
     * the choice between the benefit and the RENEWAL benefit collection at the call site, where the
     * legacy makes it — [:L161] versus [:L164] — because the two share this element type and only the
     * caller knows which list it is iterating. */
    return subscriptionBenefit;
  }

  /**
   * `getContentService().getContent( … )` — [:L187] and [:L196].
   *
   * ✅ AAP-3 — returns the resolved reference so the caller can associate it; ⚠️ SEC-2 — the content
   * identifier and the source locator travel in `context`, never in the message. See
   * {@link SkuService.requireSubscriptionBenefit} for the reasoning behind both.
   */
  private async requireAccessContent(
    contentID: string,
    locator: string,
  ): Promise<AccessContentReference> {
    const accessContent = await this.accessContentPort.getContent(contentID);
    if (accessContent === null) {
      throw new DomainError(
        'The access content named in the creation data does not exist, so the SKU cannot be ' +
          'associated with it. The legacy code passes the unchecked lookup result straight to ' +
          'addAccessContent and raises here too.',
        { context: { contentID, locator } },
      );
    }
    return accessContent;
  }

  /* ---------------------------------------------------------------------------------------------
   * M6 — THE VALIDATION READ-BACK LOOP
   * ------------------------------------------------------------------------------------------- */

  /**
   * Builds the SKU save rule set for one product's creation run.
   *
   * `model/validation/Sku.json` declares two METHOD-BASED rules in the save context — `hasUniqueOptions`
   * and `hasOneOptionPerOptionGroup`, both reporting under the `options` property. They are behaviour, not
   * configuration (IR-4): `hasOneOptionPerOptionGroup` [model/entity/Sku.cfc:L772-L784] is a pure
   * in-memory walk, but `hasUniqueOptions` [model/entity/Sku.cfc:L756-L769] EXECUTES A QUERY, which is
   * what creates the read-back loop documented on {@link SkuService.validateNewSku}.
   *
   * The lookup is bound to THIS product, so it is built per call rather than held as state (M7). It goes
   * straight to {@link SkuRepository.findSkusBySelectedOptions}, which is the port of the DAO member the
   * legacy chain eventually reaches — `Product.getSkusBySelectedOptions`
   * [model/entity/Product.cfc:L366-L368] delegates to
   * `ProductService.getProductSkusBySelectedOptions` [model/service/ProductService.cfc:L104-L106], which
   * is itself a single-line delegation to the DAO. The two intermediate hops add nothing, and reproducing
   * them here would require injecting `ProductService` — the verified DEAD injection at
   * [model/service/SkuService.cfc:L54] whose omission breaks the ProductService↔SkuService cycle at no
   * cost (AAP 0.6.3.2). The five preserved query semantics T1-T5 (AAP 0.6.1.3) live in the adapter that
   * implements the port, not here.
   *
   * The comma-list-to-array conversion applies the legacy `listToArray` semantics the DAO's
   * `listLen`/`listGetAt` loop [model/dao/SkuDAO.cfc:L112-L118] implies: duplicates and order are
   * retained, empty entries are not options.
   */
  private buildSkuSaveRuleSet(product: Product): ValidationRuleSet<ManagedSku> {
    const selectedOptionsLookup: SkusBySelectedOptionsLookup = {
      getSkusBySelectedOptions: (selectedOptions: string) =>
        this.skuRepository.findSkusBySelectedOptions(
          cfmlListToArray(selectedOptions),
          product.productID,
        ),
    };
    return createSkuValidationRules<ManagedSku>(resolveSkuUniqueTarget, selectedOptionsLookup);
  }

  /**
   * Validates ONE newly created SKU, in creation order, before the next one is created.
   *
   * M6 — THIS IS THE HIGHEST-RISK EXECUTION-MODEL MISMATCH IN THE SLICE (AAP 0.6.2, 0.6.6). The
   * cycle is:
   *
   *   createSkus → per-SKU save/validation → `model/validation/Sku.json` method rule
   *     → `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L756-L769]
   *     → `Product.getSkusBySelectedOptions()` → the `SwSku`/`SwSkuOption` query
   *     → rows the SAME operation is in the middle of writing.
   *
   * Under CFML the rule only ever observes the siblings already visible to the Hibernate session, so the
   * result depends on flush timing AND on the order in which the batch is persisted. Under `mysql2` there
   * is no session and no automatic flush.
   *
   * ⚠️ F01 — THE VISIBILITY STEP IS PERFORMED HERE, AND A DEFERRAL IS WITHDRAWN. This note previously
   * said that making each SKU visible to the next SKU's uniqueness read "belongs to the adapter and
   * unit-of-work composition, which this file must not and does not import (S2, S4)". The layering
   * point was correct and is unchanged — this file imports no adapter — but the conclusion drawn from
   * it was wrong: the SEQUENCE of writes is not an adapter concern at all, it is precisely the
   * business rule this method owns, and deferring it meant NO SKU WAS EVER PERSISTED. Every branch
   * created and validated SKUs purely in memory, so each uniqueness read observed an empty sibling
   * set and every SKU in every batch validated as though it were the first. The read-back cycle the
   * AAP calls the highest-risk item in the slice was not merely at risk; it was absent.
   *
   * The write goes through {@link SkuRepository.persistSku}, a PORT this service already holds — so
   * no adapter is imported, S2 and S4 are untouched, and the ordering lives with the rule that
   * defines it. Transaction DEMARCATION is still not this service's business: `persistSku` is
   * explicitly forbidden from committing, and the enclosing transaction is opened and closed by the
   * caller.
   *
   * THE SEQUENCING JUDGMENT IS THIS SERVICE'S, and it is made here:
   *
   *   ✔ each SKU is validated individually, at the point in the odometer or branch sequence where the
   *     legacy would have saved it;
   *   the batch is NOT inserted first and validated afterwards;
   *   the batch is NOT validated in full before any SKU exists;
   *   the awaits are NOT reordered, hoisted, deferred, or collected into `Promise.all`.
   *
   * ⭐ VALIDATE-THEN-PERSIST, IN THAT ORDER, PER SKU. AAP 0.6.2 requires each insert to be visible to
   * the NEXT SKU's uniqueness read, so the subject does not observe itself. The full reasoning,
   * including why `model/entity/Sku.cfc:L763-L768`'s self-exclusion clause is a defensive no-op under
   * this ordering rather than evidence for the opposite one, is recorded on
   * {@link SkuRepository.persistSku} and is not restated here.
   *
   * THE SEQUENTIAL AWAITS ARE THE POINT. `Promise.all` here would let two SKUs' uniqueness reads observe
   * the same sibling set and both pass, where the legacy fails the second — a silent divergence with no
   * compile error and no test failure unless a test is written for it. `await` inside a loop is normally
   * a lint smell; here it is load-bearing, and it must not be "optimised" to satisfy a linter.
   *
   * TODO(parity) D19 — model/entity/Sku.cfc:L756-L769. AN OPTIONLESS SKU FAILS `hasUniqueOptions` ON
   * ANY PRODUCT THAT ALREADY HAS OPTION-BEARING SKUS, and that is carried unrepaired. With no options the
   * selected-option list is empty, and by semantic T5 (AAP 0.6.1.3) the query legitimately degenerates to
   * "every option-bearing SKU of this product" rather than returning nothing. The legacy guard then reads
   * `if(!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()))`, which can only
   * pass when the product has no option-bearing SKUs at all. The rules are NOT bypassed for optionless
   * SKUs and the case is NOT special-cased away — both the merchandise no-options branch and the
   * degenerate lone-delimiter path at [:L64] flow through this method unchanged.
   *
   * ✅ AAP-2 — FINDINGS LAND ON THE SKU THAT PRODUCED THEM. They previously accumulated into a bag owned
   * by {@link SkuService.createSkus} that nothing outside this file could read, so a SKU could fail
   * `hasUniqueOptions` and no caller would ever learn of it. `validate` already returns the findings; they
   * are now copied onto the SKU's own error surface, which is exactly what
   * `HibachiValidationService.validate( …, setErrors=true )` does when it takes its error bean off the
   * object at [org/Hibachi/HibachiValidationService.cfc:L156] and writes it back at [:L193]. The rule
   * set's own property keys and rbKey message values are preserved verbatim — no text is invented here,
   * and nothing is redirected onto the product (see {@link SkuWithErrorState}).
   *
   * The findings are also RETURNED, so a caller that wants to react to one SKU's outcome can, without
   * having to re-read the bag.
   *
   * TEST PROVENANCE: NET-NEW. A test must be able to prove that EITHER naive ordering fails.
   */
  private async validateNewSku(
    sku: SkuWithErrorState,
    ruleSet: ValidationRuleSet<ManagedSku>,
  ): Promise<ValidationError> {
    const findings = await this.validator.validate(sku, ruleSet, SKU_SAVE_CONTEXT);
    if (findings.hasErrors()) {
      sku.addErrors(findings.getErrors());
    }

    /* ⛔ THE PERSIST IS UNCONDITIONAL, AND DELIBERATELY NOT GATED ON THIS SKU VALIDATING CLEANLY.
     *
     * The legacy never conditions the write on the rule outcome either: `model/service/HibachiService.cfc`
     * decides whether to keep the work at the SAVE boundary, and the batch's own gate is the
     * `product.hasErrors()` check the caller performs afterwards. Skipping the write for a SKU that
     * failed a rule would make the NEXT SKU's uniqueness read observe a different sibling set than the
     * legacy shows it, which is exactly the silent divergence M6 is about. The enclosing transaction —
     * opened and closed by the caller, never here — is what discards a failed batch. */
    await this.skuRepository.persistSku(sku);

    return findings;
  }

  /* ---------------------------------------------------------------------------------------------
   * THE REMAINING EIGHT DECLARED MEMBERS — [model/service/SkuService.cfc:L210-L325]
   * ------------------------------------------------------------------------------------------- */

  /**
   * Saves an uploaded image file against a SKU's image path.
   *
   * ⚠️ THE RETURN TYPE IS `Promise<boolean>`, AND IT WAS `Promise<Sku>` FOR ONE REVISION. The full
   * adjudication — the three arguments for the entity, and the primary-source refutation of each — is
   * recorded at the `return` statement in the body, because that is the line a future author would
   * edit. It is not restated here. In one sentence: AAP 0.4.2.2's cell for this row does read
   * `Promise<Sku>`, but the body that cell describes contains exactly two returns, `return true;` and
   * `return false;` ([model/service/SkuService.cfc:L213-L217]), and TR-1 tightens a loose
   * `returntype="any"` to the OBSERVED contract rather than to the declared one. The AAP marks this
   * row "Boundary-stubbed", which is consistent with the cell having been filled from the general
   * process-method pattern rather than from this body.
   *
   * NOTHING IN THE LEGACY REPOSITORY EVER READ THIS MEMBER'S RETURN VALUE, WHICHEVER TYPE IT CARRIES.
   * A repository-wide search for `processImageUpload` finds the declaration at [:L210] and no call site
   * of any kind, and the `process()` dispatcher cannot reach it either, since
   * [org/Hibachi/HibachiService.cfc:L114] composes `process<EntityName>_<context>` and would look for
   * `processSku_imageUpload`, which no component in the repository declares. That observation was first
   * written down here while arguing FOR the entity return; it is in fact the strongest argument
   * AGAINST it, because the entity-returning contract at [:L117] binds the members the dispatcher
   * reaches, and this member is not one of them.
   *
   * ⛔ AND WHAT IS DELIBERATELY *NOT* DONE WITH A `false`. The storage failure is not recorded on the
   * SKU's error structure and is not converted into a throw. Either would fabricate behaviour the
   * legacy lacks — [:L213-L217] neither calls `addError` nor raises — and AAP 0.8.2 Guideline 4 forbids
   * enhancement "beyond what the migration requires". The verdict is handed back to the caller exactly
   * as received from {@link ImagePathPort.saveImageFile}, which is where AAP 0.4.3.2 puts this
   * dependency: it names `getService("imageService")` "the most consequential instance" of a dynamic
   * lookup and rules that "It becomes `ImagePathPort`". A rejection still propagates untouched, as the
   * legacy `getService("imageService").saveImageFile(…)` call would propagate one. The single failure
   * this member DOES raise on is a rejected image file name, and why that case is treated differently
   * is argued at the throw itself.
   *
   * ⚠️ THIS FILE OWNS REGISTER ENTRY D24, AND A PREVIOUS REVISION WITHDREW IT HERE IN ERROR. That
   * revision had converted the member to return the entity, which left no divergence to record, and it
   * withdrew the number on the ground that "AAP 0.6.7's register is closed at D1-D21". The bound is
   * quoted correctly and the conclusion drawn from it does not follow: AAP 0.6.7 is indeed frozen at
   * D1-D21, and the port has minted D22, D23 and D24 beyond it under AAP 0.7.3 S7, each recorded ONCE
   * at the file that owns the behaviour. D24 is this member answering with a boolean where the
   * framework's own words at [org/Hibachi/HibachiService.cfc:L117] ask for an entity. Seven other files
   * state the D1-D24 bound, and two of them name THIS file as D24's home —
   * `../adapters/mysql/rowMappers` in its register-bounds note and `../ports/repositories/SkuRepository`
   * in its minted-identifier note — so withdrawing the number here did not tidy the register, it left
   * the tree contradicting itself about where D24 lives. It stands, carried under AAP 0.6.7's
   * "preserve and annotate, do not repair" and documented under AAP 0.8.2 Guideline 6.
   *
   * THE IMAGE DEPENDENCY IS THE HIDDEN ONE. [:L212] resolves it as
   * `getService("imageService")` — a dynamic string lookup that is NEVER declared as a component
   * property, so it is invisible to any dependency analysis based on component metadata, and a port built
   * from such an analysis would compile and then fail at the first image operation (AAP 0.6.3.2). It is
   * routed through {@link ImagePathPort} (import rule R2).
   *
   * THE ALLOWED-EXTENSION LIST IS IMPORTED, NEVER RETYPED. `IMAGE_UPLOAD_ALLOWED_EXTENSIONS` is
   * `../ports/ImagePathPort`'s single source of truth for the literal `"jpg,jpeg,png,gif"` at [:L215] —
   * exact value, exact order. A second copy of the string in this file could drift from the first.
   *
   * The legacy parameter is spelled with a capital `S` — `required any Sku` at [:L210] — and is then read
   * as `arguments.Sku` at [:L211]. CFML argument names are case-insensitive, so the spelling carries no
   * meaning; the idiomatic lower-case name is used and the source spelling recorded here.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param sku - The SKU whose stored image file name names the file to write. It is READ, never
   * mutated and never returned; the only member touched is `imageFile`, and only to validate it.
   * @param imageUploadResult - The upload result struct, passed through to the port opaquely.
   * @returns The image service's own verdict — `true` when the file was stored, `false` when it was
   * not — forwarded unchanged from {@link ImagePathPort.saveImageFile}. This is carried defect D24, not
   * the entity AAP 0.4.2.2 tabulates; see the note above and the adjudication at the `return`.
   */
  public async processImageUpload(
    sku: Sku,
    imageUploadResult: Record<string, unknown>,
  ): Promise<boolean> {
    /* [:L211] IS DELIBERATELY NOT REPRODUCED — SEC-07 / ImagePathPort DECISION I-1.
     *
     * ⛔ WHAT THE LEGACY LINE DID: `var imagePath = arguments.Sku.getImagePath();` composed a WEB URL
     * from the SKU's `imageFile` column and [:L212] handed it to the image service as `filePath`, i.e.
     * as a WRITE DESTINATION. `imageFile` ([model/entity/Sku.cfc:L58]) carries no rule in
     * `model/validation/Sku.json`, so a stored `../../../../tmp/payload.jpg` — the review's own runtime
     * vector — placed an uploaded file wherever the traversal led. This was the single most dangerous
     * line in the slice: the ONLY write in the whole extracted Catalog surface, fed by an unvalidated
     * persistent column.
     *
     * ⭐ WHAT REPLACES IT: the caller names a FILE and the adapter chooses the destination. The request
     * carries `imageFileName`, not a path, so there is no member left through which a directory can be
     * expressed — arbitrary placement is unrepresentable rather than merely discouraged. Display is
     * untouched: `sku.getImagePath(...)` still exists and the feed still renders exactly as before; it
     * simply no longer decides where bytes land. */
    const imageFileName = validateImageFileName(
      sku.imageFile ?? '',
      IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
    );

    /* ⚠️ REJECTION RAISES; IT DOES NOT RETURN `false`. The boolean this method returns is the legacy's
     * "the image service stored it / did not store it" answer ([:L213-L217]), which a caller reads as an
     * outcome of the UPLOAD. A stored name that is not a file name is not an upload outcome — it is a
     * corrupt or hostile entity, and collapsing it into `false` would make a security refusal
     * indistinguishable from an ordinary storage failure and silently swallow the one signal an operator
     * needs. Raising here follows the precedent already set in this file by the combination-budget gate
     * and in `src/util/urlTitle.ts` by probe exhaustion: refuse loudly, fabricate nothing.
     *
     * ⛔ NO SANITISED NAME IS SUBSTITUTED. Deriving a "safe" name from a hostile one would write bytes
     * to a location the caller never asked for and would leave the corrupt column in place.
     *
     * The message names the constraint, not the value: echoing the rejected path back would put an
     * attacker-supplied traversal string into logs and, via `src/handlers/httpResponse.ts`, potentially
     * into a response. The SKU is identified by its own primary key, which is all an operator needs to
     * find the offending row. */
    if (imageFileName === undefined) {
      throw new DomainError(
        'The image file name stored on this SKU is not a valid image file name, so the uploaded ' +
          'image was not stored.',
        {
          context: {
            skuID: sku.skuID,
            allowedExtensions: IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
            locator: 'model/service/SkuService.cfc:L210-L218',
          },
        },
      );
    }

    /* [:L212-L216] — the hidden dependency, through the port. The boolean is returned UNCHANGED, and
     * that is carried defect D24 rather than an oversight.
     *
     * ⛔ DO NOT "FIX" THIS TO RETURN THE SKU. [org/Hibachi/HibachiService.cfc:L117] states that "all
     * process methods should return an entity", and this one returns the image-write verdict instead —
     * a real inconsistency in the legacy, recorded at `../ports/repositories/SkuRepository` and
     * `../adapters/mysql/rowMappers` as D24. AAP §0.6.7 governs it: preserve and annotate, do not
     * repair. A `return sku` was briefly appended below this statement, which the compiler correctly
     * reported as unreachable; returning the entity instead would change an observable return value
     * and is exactly the silent repair AAP §0.8.2 Guideline 4 forbids. `sku` is still read above, for
     * the image file name, so the parameter is not unused.
     *
     * ⚠️⚠️ THIS RETURN TYPE WAS CHANGED TO `Promise<Sku>` ONCE AND CHANGED BACK, AND THE THREE
     * ARGUMENTS FOR `Promise<Sku>` ARE RECORDED HERE WITH THEIR REFUTATIONS SO THE ROUND TRIP IS NOT
     * REPEATED A THIRD TIME. The case for the entity rested on AAP §0.4.2.2, whose target cell for
     * this row does read `Promise<Sku>`, plus three supporting claims. Each was checked against the
     * primary source and each fails:
     *
     *   (i) "The legacy declares `returntype="any"`, so a boolean is a narrowing." — `any` is the
     *       DECLARED type; the OBSERVED one is a boolean, because the body at
     *       [model/service/SkuService.cfc:L213-L217] contains exactly two returns, `return true;` and
     *       `return false;`, and no other. TR-1 does not say "widen to the declared type"; it says the
     *       target signature is "tightened to the observed contract". The observed contract is boolean.
     *
     *  (ii) "[org/Hibachi/HibachiService.cfc:L117] raises 'All process methods should return an
     *       entity', and then :L122/:L123 call `.getClassName()`/`.hasErrors()` on the result, which a
     *       boolean cannot satisfy." — The guard at that line is `if(isNull(arguments.entity))`. It
     *       fires on NULL only. `true` and `false` are not null, so it never fires for this member.
     *
     * (iii) The decisive one, which the entity argument overlooked: THAT DISPATCHER CANNOT REACH THIS
     *       MEMBER AT ALL. It composes `methodName = "process#entity.getClassName()#_#processContext#"`
     *       [org/Hibachi/HibachiService.cfc:L114], i.e. `processSku_imageUpload`. This member is named
     *       `processImageUpload`. A repository-wide search finds NO declaration of `processSku_` on any
     *       component, while `ProductService.cfc` does declare the dispatcher-shaped
     *       `processProduct_addOptionGroup`, `processProduct_addOption`, `processProduct_updateSkus` and
     *       four more — so the naming convention is real, and this member sits outside it deliberately.
     *       `processImageUpload` has exactly ONE occurrence in the whole repository: its own
     *       declaration. Nothing calls it, and nothing routes to it through the entity-returning
     *       contract, so that contract imposes nothing on it.
     *
     * Where AAP §0.4.2.2's cell and the rules that PRODUCED that mapping disagree, the rules govern:
     * TR-1 (tighten to the observed contract), §0.8.2 Guideline 2 (preserve behaviour exactly as-is),
     * Guideline 4 (no enhancement beyond what the migration requires) and §0.6.7 (preserve and
     * annotate) all select the boolean. The row is marked "Boundary-stubbed" in the AAP, which is
     * consistent with the cell having been filled from the general process-method pattern rather than
     * from this body. D24 is not an invented number either: the register is D1–D21 from AAP §0.6.7 plus
     * D22–D24 minted during the port, and that provenance is stated in
     * `../ports/repositories/SkuRepository`, `OptionRepository`, `BrandRepository` and
     * `ProductTypeRepository`. */
    return this.imagePathPort.saveImageFile({
      uploadResult: imageUploadResult,
      imageFileName,
      allowedExtensions: IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
    });
  }

  /**
   * Returns a product's SKUs, optionally reordered by the option-group sort ordering.
   *
   * `sorted` IS REQUIRED, NOT OPTIONAL. [model/service/SkuService.cfc:L220] declares
   * `required boolean sorted` while `fetchOptions` carries the default `false`. AAP 0.4.2.2 records this
   * as Discrepancy 2 precisely because the reverse would be the natural guess. The one in-repository
   * caller, [model/entity/Product.cfc:L159], supplies both.
   *
   * THE SORT GATE HAS THREE PARTS, NOT ONE — [:L224] tests `arguments.sorted`, then
   * `arrayLen(skus) > 1`, then `arrayLen(skus[1].getOptions())`. The third part means A PRODUCT WHOSE
   * FIRST SKU HAS NO OPTIONS IS NEVER SORTED, however many option-bearing SKUs follow it, and it is what
   * makes this member markedly less exposed to D13 than its sibling. All three parts are preserved, in
   * order.
   *
   * TODO(parity) D13 — model/service/SkuService.cfc:L220-L244. THE REORDER CAN FAIL, AND IT IS LEFT
   * ABLE TO FAIL. See {@link reorderBySortedSkuIds}.
   *
   * The `fetchOptions` flag is not merely an eager-loading hint: in the DAO it appends
   * `inner join fetch` clauses [model/dao/SkuDAO.cfc:L152-L160] which also FILTER, so passing `true` can
   * return FEWER rows than passing `false`. That belongs to the adapter; it is noted here because the
   * flag looks inert from this side.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async getProductSkus(
    product: Product,
    sorted: boolean,
    fetchOptions = false,
  ): Promise<Sku[]> {
    // [:L222] `getSkuDAO().getProductSkus(product=arguments.product, fetchOptions=arguments.fetchOptions)`
    const skus = await this.skuRepository.findByProduct(product, fetchOptions);

    /* [:L224] — the three-part gate. `firstSku` is bound so the third part can be evaluated under
     * `noUncheckedIndexedAccess`; the binding is a type narrowing only and tests the same SKU
     * `skus[1]` names in the one-based legacy. */
    const firstSku = skus[FIRST_ARRAY_INDEX];
    if (!sorted || skus.length <= 1 || firstSku === undefined) {
      return skus;
    }
    if (firstSku.getOptions().length === 0) {
      return skus;
    }

    // [:L226] — the named-argument call.
    const sortedSkuIds = await this.skuRepository.findSortedSkuIdsByProduct(product.productID);
    return reorderBySortedSkuIds(skus, sortedSkuIds, 'model/service/SkuService.cfc:L237');
  }

  /**
   * Returns a product's already-loaded SKUs, reordered by the option-group sort ordering.
   *
   * THIS READS THE PRODUCT'S OWN COLLECTION, NOT THE REPOSITORY. [:L248] is
   * `arguments.product.getSkus()`, so unlike {@link SkuService.getProductSkus} this member issues no
   * fetch and observes whatever is already associated — including SKUs created earlier in the same
   * `createSkus` run and not yet flushed. Preserved.
   *
   * TODO(parity) D13 — model/service/SkuService.cfc:L246-L269. THIS MEMBER IS THE MORE EXPOSED OF THE
   * TWO, and the annotation is repeated here deliberately rather than cross-referenced, because the
   * exposure differs. [:L250] gates only on `arrayLen(skus) < 2`; there is NO equivalent of the
   * first-SKU-has-options test that [:L224] applies. So a product with two SKUs of which one has no
   * options reaches the reorder here, and the sorted-identifier query returns option-bearing SKUs only
   * [model/dao/SkuDAO.cfc:L172-L204] — leaving the optionless SKU with no position. See
   * {@link reorderBySortedSkuIds}.
   *
   * ZERO CALLERS EXIST FOR THIS MEMBER ANYWHERE IN THE REPOSITORY — a full-tree search finds no
   * invocation. It is ported regardless: it is one of the nine declared public members, and interface
   * parity is the observable contract (TR-1), not reachability.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async getSortedProductSkus(product: Product): Promise<Sku[]> {
    // [:L248]
    const skus = readProductSkusAsSkus(product);

    /* [:L250-L252] — the early return. The legacy returns the collection untouched, so a
     * single-SKU or empty product is never reordered. */
    if (skus.length < 2) {
      return skus;
    }

    // [:L254] — the POSITIONAL call, where its sibling at [:L226] uses a named argument.
    const sortedSkuIds = await this.skuRepository.findSortedSkuIdsByProduct(product.productID);
    return reorderBySortedSkuIds(skus, sortedSkuIds, 'model/service/SkuService.cfc:L262');
  }

  /**
   * Searches SKUs by term within a product type. Pure delegation — [:L271-L273].
   *
   * BOTH ARGUMENTS ARE OPTIONAL. [:L271] declares `string term, string productTypeID` with neither
   * marked `required` — AAP 0.4.2.2 Discrepancy 3. The looseness is genuine and is preserved rather than
   * tightened, so an omitted argument stays omitted and is not converted into an empty string.
   *
   * The DAO reads `arguments.term` UNGUARDED into its LIKE parameter
   * [model/dao/SkuDAO.cfc:L130-L145], so omitting `term` raises inside the adapter. That failure mode is
   * the legacy's; this member does not pre-empt it with a default, because supplying one would make a
   * previously failing call return every SKU of the product type.
   *
   * The result type is `SkuSearchRow[]`, imported from `../ports/repositories/SkuRepository`. AAP 0.4.2.2
   * names it `SkuSearchResult[]`; the port owns the name, and it is not redeclared here.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async searchSkusByProductType(
    term?: string,
    productTypeID?: string,
  ): Promise<SkuSearchRow[]> {
    return this.skuRepository.searchByProductType(term, productTypeID);
  }

  /**
   * Reports whether a SKU's stock records may be deleted.
   *
   * TODO(parity) D4 — model/service/SkuService.cfc:L281-L283. THIS MEMBER CANNOT WORK, AND IT IS
   * PRESERVED AS AN EXPLICIT NOT-IMPLEMENTED BOUNDARY RATHER THAN GIVEN AN ANSWER. [:L282] delegates to
   * `getSkuDAO().getSkuStocksDeletableFlag(…)`, and that DAO member EXISTS NOWHERE IN THE REPOSITORY —
   * `model/dao/SkuDAO.cfc` declares six public members and none of them is it. So the only path that
   * reaches this member, `Sku.getStocksDeletableFlag()` [model/entity/Sku.cfc:L567-L572], has never been
   * able to resolve. `../domain/sku/Sku` makes the same declaration for the same reason.
   *
   * Deliberately NOT done: returning a fabricated `true` or `false`; querying stock or inventory
   * (both modules are out of scope, AAP 0.2.2.1); adding a member to {@link SkuRepository} to satisfy the
   * call, which would invent a query the legacy never had.
   *
   * ✅ P3-2 — IT REJECTS, IT DOES NOT THROW SYNCHRONOUSLY, AND THE DIFFERENCE IS OBSERVABLE. The member
   * is deliberately not declared `async`, because an `async` body with no `await` is an error under this
   * project's type-aware lint configuration — but a plain `throw` from a non-`async`
   * `Promise`-returning method escapes BEFORE any promise exists, so it lands as a synchronous exception
   * at the call site. Every caller written to the declared `Promise<boolean>` contract — `await`,
   * `.catch(…)`, `Promise.all([…])` — would therefore miss it: `.catch` is never reached because there is
   * no promise to attach it to, and one `Promise.all` participant throwing synchronously abandons the
   * others rather than settling. `Promise.reject` keeps the failure inside the contract the signature
   * advertises, which is what TR-1 requires of a preserved signature: the type and the behaviour have to
   * agree. `await` still surfaces it identically, so nothing that already handled it stops working.
   *
   * The identifier is carried into the error context, which also keeps the parameter genuinely used.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param skuID - The SKU identifier the legacy would have passed to the absent DAO member.
   * @returns A promise that always rejects; it never resolves.
   */
  public getSkuStocksDeletableFlag(skuID: string): Promise<boolean> {
    return Promise.reject(
      new NotImplementedError(
        'SkuService.getSkuStocksDeletableFlag',
        'carried unrepaired as defect D4 — model/service/SkuService.cfc:L281-L283 delegates to ' +
          'SkuDAO.getSkuStocksDeletableFlag(), which is not declared anywhere in the legacy repository, ' +
          'so this member has never been able to resolve',
        {
          context: {
            skuID,
            defect: 'D4',
            locator: 'model/service/SkuService.cfc:L281-L283',
            caller: 'model/entity/Sku.cfc:L567-L572',
          },
        },
      ),
    );
  }

  /**
   * Reports whether any transaction references the given SKU or product.
   *
   * TODO(parity) D23 — model/service/SkuService.cfc:L285-L287; callers model/entity/Sku.cfc:L594 and
   * model/entity/Product.cfc:L626. THE LEGACY DECLARATION TAKES ZERO FORMAL PARAMETERS BUT THE MEMBER IS
   * NOT ARGUMENT-FREE. [:L285] is `public boolean function getTransactionExistsFlag()` and [:L286]
   * forwards `argumentCollection=arguments` to the DAO, which declares `string productID, string skuID`
   * [model/dao/SkuDAO.cfc:L53-L56]. CFML passes named arguments a signature never declared, so the real
   * callers each supply one:
   *
   *   `model/entity/Sku.cfc:L594`     → `getTransactionExistsFlag( skuID = this.getSkuID() )`
   *   `model/entity/Product.cfc:L626` → `getTransactionExistsFlag( productID = this.getProductID() )`
   *
   * AAP 0.4.2.2 records the mismatch as Discrepancy 4 and rules on it in one sentence — "The narrower
   * service contract is preserved" — and AAP 0.4.2.6 puts the filtered capability on a SEPARATELY NAMED
   * member, `SkuRepository.transactionExists(productID?, skuID?)`. An earlier revision widened this
   * signature to `(skuID?, productID?)` instead and justified it as overruling "that section's narrower
   * prose reading". That was wrong on three counts:
   *
   *   1. It inverted D1 precedence. The AAP is the frozen contract; a target signature is aligned to it,
   *      never reinterpreted against it.
   *   2. It contradicted the port that exists precisely to absorb the mismatch. `SkuRepository`'s own
   *      contract states it outright: "this member keeps both, even though its service caller declares
   *      none. Nothing about the legacy runtime is broken here and the service signature must NOT be
   *      'fixed'; what is missing is the declaration, and this contract supplies it (IR-1, TR-3)."
   *   3. It broke nothing by being reverted, because it was breaking nothing by existing. The claim that
   *      a zero-argument method "would break both of its own callers" does not hold: neither entity calls
   *      this member. Each declares a zero-argument CHECKER interface of its own —
   *      `SkuTransactionExistenceChecker` at ../domain/sku/Sku.ts and its twin at
   *      ../domain/product/Product.ts — and the composition root binds the identifier into the checker it
   *      supplies, using the repository's filtered form. The identifier reaches the query through that
   *      binding, exactly as the legacy service resolved it without a parameter.
   *
   * ⚠️ CALLED WITH NO ARGUMENTS, THIS MEMBER RAISES, AND THAT IS PARITY RATHER THAN A GAP. The DAO's
   * else-branch binds `arguments.productID` at [model/dao/SkuDAO.cfc:L90] after the `structKeyExists`
   * test at [:L58] has already failed, so a genuinely argument-free legacy invocation dereferences an
   * undefined key and fails. `SkuRepository.transactionExists` documents and keeps that behaviour —
   * "Raises when neither argument is supplied, reproducing model/dao/SkuDAO.cfc:L90" — so the failure
   * surfaces at the same layer and for the same reason. It is not pre-empted with a guard here, because
   * pre-empting it would move a legacy failure to a new place and invent a message the legacy never had.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @returns True when at least one of the ten existence tests matches.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    // [:L286] `return getSkuDAO().getTransactionExistsFlag( argumentCollection=arguments );` — the
    // forwarded collection is empty, so no identifier is bound. AAP 0.4.2.6 keeps the filtered form on
    // the separately named repository member.
    return this.skuRepository.transactionExists();
  }

  /**
   * Finds a SKU by its SKU code, falling back to alternate SKU codes. Pure delegation — [:L289-L291].
   *
   * THE ARGUMENT IS OPTIONAL HERE AND REQUIRED ONE LAYER DOWN. [:L289] declares `string skuCode` with
   * no `required`, while `model/dao/SkuDAO.cfc:L102` declares `required string skuCode` — so an omitted
   * code passes this member and fails at the DAO. The loose service signature is preserved because
   * tightening it would reject a call the legacy accepts, and the DAO's own requirement is reproduced as
   * an explicit failure at the point the legacy fails.
   *
   * THE NULL RETURN IS PART OF THE CONTRACT AND MUST NOT BECOME A THROW. The out-of-scope caller
   * [model/service/PhysicalService.cfc:L199] does
   * `var sku = getSkuService().getSkuBySkuCode(…); if(!isNull(sku)){ … } else { skuCodeError++; }` — it
   * counts misses as a data-quality tally, so raising on a miss would convert a benign import warning
   * into a failed import. Not tightened, not thrown.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async getSkuBySkuCode(skuCode?: string): Promise<Sku | null> {
    if (skuCode === undefined) {
      throw new DomainError(
        'getSkuBySkuCode was called without a SKU code. The service signature leaves the argument ' +
          'optional, but the underlying lookup declares it required, so the legacy raises here too.',
        { context: { locator: 'model/service/SkuService.cfc:L289-L291' } },
      );
    }
    return this.skuRepository.findBySkuCode(skuCode);
  }

  /**
   * Returns a paginated, filterable SKU smart list — [:L309-L325].
   *
   * The legacy composes it in four steps, all preserved by {@link translateSmartListInput}: the root
   * entity `SlatwallSku` [:L310]; three related-property joins [:L314-L316], THE THIRD OF WHICH IS A
   * `left` JOIN so SKUs with no alternate codes are still returned; and five keyword properties at weight
   * 1 [:L318-L322]. No pagination default, filter or ordering is invented — the caller's `data` is
   * translated and nothing more. Every in-repository caller passes no arguments at all
   * (`integrationServices/google/controllers/feed.cfc:L63` among five others), which is exactly why an
   * invented default here would be invisible in review and change every one of them.
   *
   * `currentURL` IS ACCEPTED AND DELIBERATELY NOT FORWARDED, hence the underscore. [:L309] declares
   * it and [:L312] passes it into the smart list, where it exists to build saved-state and paging URLs
   * for the CFML view layer [org/Hibachi/HibachiSmartList.cfc:L39]. `../ports/SmartListQueryPort`
   * deliberately excludes it from both `SmartListInput` and `SmartListQuery`: URL construction is a
   * presentation concern and there is no view layer in a headless service (AAP 0.3.4). The parameter
   * is KEPT rather than deleted so the signature stays call-compatible with the legacy, which the
   * project's lint configuration anticipates by exempting `_`-prefixed parameters.
   *
   * THE SOURCE USES `getSkuDAO().getSmartList` [:L312], NOT the global Hibachi DAO — so the query is
   * expressed through the typed port, never as SQL (S2).
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async getSkuSmartList(
    data?: SmartListInput,
    _currentURL?: string,
  ): Promise<SmartListResult<Sku>> {
    return this.smartListQueryPort.execute<Sku>(
      translateSmartListInput({
        entityName: SKU_ENTITY_NAME,
        input: data,
        joins: SKU_SMART_LIST_JOINS,
        keywordProperties: SKU_SMART_LIST_KEYWORD_PROPERTIES,
      }),
    );
  }
}

/* ================================================================================================
 * COMPILE-TIME GUARDS — THE D23 IDENTIFIER-SCOPED CAPABILITY IS DECLARED WHERE THE PLAN PUTS IT
 * ================================================================================================
 * `Sku.getTransactionExistsFlag` and `Product.getTransactionExistsFlag` each take a checker rather
 * than reaching for a service, because a domain module may not import a service. Both checker
 * interfaces are declared in their own entity module and both are shaped `(skuID?, productID?)`, so
 * each entity can pass the one identifier it owns:
 *
 *   `Sku.cfc:L594`     -> `skuID = this.getSkuID()`         -> first  parameter
 *   `Product.cfc:L626` -> `productID = this.getProductID()` -> second parameter, first left `undefined`
 *
 * WHICH MEMBER SUPPLIES THAT CAPABILITY, AND WHY IT IS NOT THIS SERVICE. AAP 0.4.2.2 Discrepancy 4
 * rules that the SERVICE member preserves the narrower legacy declaration — `[:L285]` is
 * `public boolean function getTransactionExistsFlag()` and declares no arguments — and AAP 0.4.2.6
 * puts the filtered form on a separately named member,
 * {@link SkuRepository.transactionExists}`(productID?, skuID?)`. `SkuRepository`'s own contract states
 * it outright: "this member keeps both, even though its service caller declares none … the service
 * signature must NOT be 'fixed'". So the checker the composition root binds is backed by the
 * REPOSITORY member, not by {@link SkuService.getTransactionExistsFlag}, which is zero-argument by
 * plan and would silently discard an identifier handed to it.
 *
 * WHY THE ARITY GUARD BELOW EXISTS AT ALL, AND WHY IT POINTS AT THE REPOSITORY. Both identifiers are
 * 32-character strings (IR-6), so a mistake here type-checks perfectly and fails silently — and the
 * failure is not cosmetic. The DAO lets `skuID` WIN when both are present
 * [model/dao/SkuDAO.cfc:L58-L64], so a product identifier landing in the SKU slot would query
 * `ss.skuID = :productID`, match no row, and return `false` from a member whose `false` PERMITS A
 * DELETE (`model/validation/Product.json:L12`, `model/validation/Sku.json`).
 *
 * A plain assignability relation cannot protect that, and the gap was measured rather than reasoned:
 * DELETING the `productID` parameter from a two-parameter member raises NO error under `extends`,
 * because a one-parameter method stays assignable to a two-parameter interface — while every caller
 * typed against the interface goes on passing an identifier into a parameter nothing reads.
 * {@link AcceptsBothIdentifiers} asks a different question — "is a two-argument call legal here?" —
 * which a shortened signature answers NO. It is applied to the repository member because that is the
 * member AAP 0.4.2.6 gives the widened contract, so the protection sits on the declaration it
 * actually protects and does not depend on any test remaining in the tree.
 *
 * WHAT NO GUARD HERE CAN CATCH: TRANSPOSING the two identifiers. Both are optional strings, and the
 * checker interfaces order them `(skuID, productID)` while the repository orders them
 * `(productID, skuID)` — so the adapter the composition root supplies must cross them over, and only
 * a behavioural test can prove it does. That is pinned behaviourally, by exercising the real service
 * against a capturing repository and asserting each identifier arrives in the correct SLOT at
 * {@link SkuRepository.transactionExists}. Guards prove ARITY; tests prove FORWARDING and ORDER;
 * neither alone is sufficient.
 *
 * TYPE-LEVEL ONLY — they emit nothing and cost zero bundle bytes.
 * ============================================================================================== */

/**
 * Fails to instantiate unless its argument is exactly `true`.
 *
 * The constraint is the mechanism: a `false` argument is not assignable to `true`, so the compiler
 * raises TS2344 at the use site instead of silently producing an unusable type.
 */
type SatisfiesContract<TRelation extends true> = TRelation;

/**
 * `true` when a member really does accept BOTH D23 identifiers as strings.
 *
 * It asks whether a two-element argument list is a legal parameter list for `TMember`. A member that
 * declares both identifiers accepts it; one that has dropped the second does NOT, because a two-element
 * list is too long for a one-parameter signature. Plain `extends` on the members themselves cannot see
 * that, which is exactly the hole this closes — a shorter parameter list is assignable to a longer one,
 * so assignability alone treats the broken shape as satisfying the contract.
 *
 * Deliberately ONE-DIRECTIONAL. Adding a THIRD optional parameter would still pass, and that is the
 * right call: an extra optional parameter cannot reinstate the defect, whereas a missing one does.
 */
type AcceptsBothIdentifiers<TMember extends (...args: never[]) => unknown> =
  [string | undefined, string | undefined] extends Parameters<TMember> ? true : false;

/**
 * The D23 capability really accepts BOTH identifiers — the guard that protects this fix from regressing.
 *
 * It is asserted on {@link SkuRepository.transactionExists} because AAP 0.4.2.6 places the filtered
 * form there, while AAP 0.4.2.2 Discrepancy 4 keeps {@link SkuService.getTransactionExistsFlag}
 * zero-argument. Dropping `skuID` from the repository member would leave every entity-side checker
 * compiling and silently unscoped; this makes that edit a build failure.
 */
export type SkuRepositoryAcceptsBothTransactionIdentifiers = SatisfiesContract<
  AcceptsBothIdentifiers<SkuRepository['transactionExists']>
>;
