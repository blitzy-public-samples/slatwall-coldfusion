/* ================================================================================================
 * SkuService — the Catalog's SKU service.
 *
 * PROVENANCE. Ported from `model/service/SkuService.cfc` (334 lines), whose nine declared public
 * members are reproduced here by name, arity and argument order (transformation rule TR-1), plus the
 * one member the legacy fabricated at run time and this port must declare explicitly (IR-1). The
 * behaviour-bearing collaborators were read in full and are never imported: `model/dao/SkuDAO.cfc`
 * (whose surface became `../ports/repositories/SkuRepository`), `model/entity/Sku.cfc`,
 * `model/entity/Product.cfc`, `model/entity/ProductType.cfc`, `model/entity/Option.cfc`,
 * `model/entity/OptionGroup.cfc`, `model/validation/Sku.json`,
 * `config/dbdata/SlatwallProductType.xml.cfm`, `org/Hibachi/HibachiService.cfc`,
 * `org/Hibachi/HibachiSmartList.cfc`, `model/service/PhysicalService.cfc` and
 * `model/service/ProductService.cfc`. Every legacy file is REFERENCE; nothing in the CFML tree is
 * modified (AAP 0.4.1.1, TR-6).
 *
 * WHY THIS IS THE HIGHEST-RISK FILE IN THE SLICE. `createSkus` [model/service/SkuService.cfc:L58-L208]
 * is the largest single business rule in the Catalog, and three of its properties can change silently
 * under a well-intentioned rewrite: the three-way discriminator, the odometer enumeration ORDER, and
 * the order in which SKU validation observes its freshly created siblings (AAP 0.6.2). None of the
 * three produces a compile error when it drifts, so each is pinned by an explicit comment at the site
 * where the judgment was made, per AAP 0.8.2 guideline 6.
 *
 * THE NINE DECLARED MEMBERS, WITH THEIR SOURCE LOCATORS
 *   createSkus                 [:L58]  the combination engine — three branches, always returns true
 *   processImageUpload         [:L210] boolean-returning, D24
 *   getProductSkus             [:L220] `sorted` REQUIRED (Discrepancy 2), D13
 *   getSortedProductSkus       [:L246] reads the product's own collection, D13
 *   searchSkusByProductType    [:L271] BOTH arguments optional (Discrepancy 3)
 *   getSkuStocksDeletableFlag  [:L281] D4 — the member it delegates to does not exist
 *   getTransactionExistsFlag   [:L285] declares no arguments, forwards a collection — D23
 *   getSkuBySkuCode            [:L289] optional argument, constrained by an out-of-scope caller
 *   getSkuSmartList            [:L309] entity, three joins, five keyword properties
 *
 * THE ONE SYNTHESIZED MEMBER. `newSku()` has no declaration anywhere in the legacy tree. It resolves
 * through `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281], which routes a `new` prefix to
 * `onMissingNewMethod` [:L544-L549] and thence to `new( entityName )`. The legacy component calls it
 * five times — [model/service/SkuService.cfc:L92], [:L127], [:L154], [:L182] and [:L192] — so IR-1 and
 * TR-3 require it to become an explicitly declared, typed member. The dispatcher itself is NEVER
 * ported: this file contains no `Proxy`, no `Reflect`, no string dispatcher, no index signature, no
 * decorator and no service locator, and `org/Hibachi/` is read for contract only (AAP 0.8.3.2).
 * Synthesis is reproduced ONLY where it is used: the same mechanism would have answered `saveSku`,
 * `deleteSku`, `countSku`, `listSku`, `exportSku` and `processSku*` just as readily, and none of those
 * has a call site in this slice, so none is declared here (AAP 0.4.2.5).
 *
 * DEPENDENCY UNTANGLING (AAP 0.6.3.2). The legacy component declares five injected properties. Call
 * sites were counted across the component, and one genuine collaborator is not declared at all:
 *   skuDAO                      [:L51] 8 call sites — LIVE, becomes {@link SkuRepository}
 *   optionService               [:L53] 1 call site  — LIVE, becomes the injected {@link OptionService}
 *   subscriptionService         [:L55] 3 call sites — LIVE but OUT OF SCOPE, becomes
 *                                      {@link SubscriptionTermPort}
 *   contentService              [:L56] 2 call sites — LIVE but OUT OF SCOPE, becomes
 *                                      {@link AccessContentPort}
 *   getService('imageService')  [:L212] 1 call site — HIDDEN. Resolved through a runtime string
 *                                      lookup and NEVER declared as a property, so any dependency
 *                                      analysis based on component metadata misses it entirely. It
 *                                      becomes {@link ImagePathPort}.
 *   productService              [:L54] ZERO call sites — DEAD INJECTION. Deliberately absent from the
 *                                      constructor, from the imports and from this file. Dropping it
 *                                      is what keeps the service graph acyclic: `ProductService`
 *                                      injects `SkuService` at [model/service/ProductService.cfc:L55],
 *                                      so wiring the reverse edge would recreate a cycle for a
 *                                      collaborator nothing ever called (AAP 0.4.3.1).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO (S2, S3, S4, S5). No SQL string, fragment, placeholder or
 * table name; no `mysql2`; no adapter, config, handler or integration import; no AWS type; no
 * `process.env`; no filesystem or network module; no `BaseService` inheritance; no new dependency and
 * no new helper file. Every query reaches the database through {@link SkuRepository} or
 * {@link SmartListQueryPort}. Every import below is relative, extensionless and single-quoted, with no
 * path alias and no barrel.
 *
 * M7 — WARM-CONTAINER STATELESSNESS. This class holds NO mutable state. Every field is a readonly
 * constructor parameter property; every derived value is function-local. A Lambda container reuses a
 * module-scope singleton across invocations, so an instance field or module-level cache would bleed
 * one request's data into the next. The legacy relied on the opposite guarantee — a per-request
 * component instance plus `cacheuse="transactional"` on 111 of 113 entities, plus the memoized option
 * group sort order at [model/dao/SkuDAO.cfc:L204-L228] — none of which survives between invocations
 * (AAP 0.6.6 mismatch M7). The sort-order memo is the repository adapter's concern, and the port
 * exposes {@link SkuRepository.clearOptionGroupSortOrderCache} for it; this service never calls it,
 * because the legacy service never did either.
 *
 * TEST PROVENANCE: NET-NEW, IN FULL. No legacy `SkuServiceTest` exists anywhere under `meta/tests/`
 * (AAP 0.6.5.2), so all nine declared members and the explicitly synthesized `newSku` are net-new
 * coverage. This is stated plainly rather than implying parity with a legacy suite that does not
 * exist, which is the specific question AAP 0.8.3.7 exists to answer honestly. The class is directly
 * constructible from typed test doubles — that is what the ports are for — and needs no mocking
 * library, which the legacy repository does not contain in any form (AAP 0.4.3.6).
 * ============================================================================================== */

import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../domain/BaseProductType';
import type { Option } from '../domain/option/Option';
import type {
  Product,
  ProductDefaultSkuDelegate,
  ProductSkuMember,
} from '../domain/product/Product';
import type { SkusBySelectedOptionsLookup } from '../domain/sku/Sku';
import { SKU_UNSAVED_ID_VALUE, Sku } from '../domain/sku/Sku';
import {
  DomainError,
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
  ContentAccessSkuCreationData,
  ContentAccessSkuCreationMode,
} from '../ports/AccessContentPort';
import type { ImagePathPort } from '../ports/ImagePathPort';
import { IMAGE_UPLOAD_ALLOWED_EXTENSIONS } from '../ports/ImagePathPort';
import type {
  SmartListFilter,
  SmartListInput,
  SmartListJoin,
  SmartListKeywordProperty,
  SmartListOrder,
  SmartListPagination,
  SmartListQuery,
  SmartListQueryPort,
  SmartListRange,
  SmartListResult,
  SmartListWhereGroup,
} from '../ports/SmartListQueryPort';
import type {
  SubscriptionSkuCreationData,
  SubscriptionTermPort,
} from '../ports/SubscriptionTermPort';
import type { SkuRepository, SkuSearchRow } from '../ports/repositories/SkuRepository';
import type { ValidateOptions, ValidationRuleSet, Validator } from '../validation/Validator';
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
 * ⚠️ THE BRANCH KEY IS THE `systemCode`, NOT THE `productTypeID`, AND THE DISTINCTION IS EASY TO GET
 * WRONG. Each seeded row carries BOTH: the merchandise row is
 * `productTypeID="444df2f7ea9c87e60051f3cd87b435a1" … systemCode="merchandise"`. [:L61] compares
 * against the literal string `"merchandise"` — the systemCode — so the 32-character identifier is a
 * DIFFERENT column and comparing against it would silently take the fallthrough at [:L204] for every
 * product. AAP 0.4.1.4 lists the UUIDs beside the codes, which makes the two easy to conflate; they
 * are not interchangeable.
 *
 * ⛔ THE CODES ARE READ FROM THE SEED REGISTRY, NOT RETYPED. `../domain/BaseProductType` owns the
 * seeded facts — both the identifiers and the codes — so this file names the registry entries rather
 * than repeating any literal. If a code ever changes in the seed data the branch keys follow it
 * automatically instead of drifting apart, and no local copy can disagree with the source of truth.
 * ---------------------------------------------------------------------------------------------- */

/** [config/dbdata/SlatwallProductType.xml.cfm:L13] — the branch key at [model/service/SkuService.cfc:L61]. */
const MERCHANDISE_BASE_PRODUCT_TYPE = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode;

/** [config/dbdata/SlatwallProductType.xml.cfm:L14] — the branch key at [model/service/SkuService.cfc:L139]. */
const SUBSCRIPTION_BASE_PRODUCT_TYPE = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode;

/** [config/dbdata/SlatwallProductType.xml.cfm:L15] — the branch key at [model/service/SkuService.cfc:L173]. */
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

/* ------------------------------------------------------------------------------------------------
 * VALIDATION AND ERROR KEYS
 * ---------------------------------------------------------------------------------------------- */

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
const SKU_SAVE_CONTEXT = 'save';

/** `arguments.product.addError("subscriptionBenefits", …)` — [model/service/SkuService.cfc:L143]. */
const SUBSCRIPTION_BENEFITS_ERROR_PROPERTY = 'subscriptionBenefits';

/** `arguments.product.addError("subscriptionTerms", …)` — [model/service/SkuService.cfc:L148]. */
const SUBSCRIPTION_TERMS_ERROR_PROPERTY = 'subscriptionTerms';

/** `arguments.product.addError("accessContents", …)` — [model/service/SkuService.cfc:L176]. */
const ACCESS_CONTENTS_ERROR_PROPERTY = 'accessContents';

/* ------------------------------------------------------------------------------------------------
 * SKU CODE AND CFML LIST CONVENTIONS
 * ---------------------------------------------------------------------------------------------- */

/** The separator in `productCode & "-#…#"` — [model/service/SkuService.cfc:L97], [:L133], [:L159], [:L184], [:L194]. */
const SKU_CODE_SEGMENT_DELIMITER = '-';

/** The suffix at [model/service/SkuService.cfc:L133] and [:L184] is the LITERAL `1`, not an ordinal. */
const FIRST_SKU_CODE_SUFFIX = 1;

/** CFML's default list delimiter, used by every `listLen` / `listGetAt` / `listToArray` call here. */
const CFML_LIST_DELIMITER = ',';

/** The 1-based ordinal the legacy `for(var c=1; …)` loops publish into a SKU code at [:L194]. */
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
 * SMART LIST CONSTANTS — [model/service/SkuService.cfc:L309-L325]
 *
 * The legacy member names the root entity, adds three related-property joins and registers five
 * keyword properties. All five facts are observable in the query the port receives, so all five are
 * pinned as frozen constants rather than assembled inline: a reviewer can check them against the
 * source line by line, and nothing can reorder or reweight them at run time (M7).
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
 * ⚠️ THE THIRD IS A LEFT JOIN AND THE FIRST TWO ARE NOT. [model/service/SkuService.cfc:L314] and
 * [:L315] call `joinRelatedProperty` with no third argument, which defaults `joinType` to the empty
 * string at [org/Hibachi/HibachiSmartList.cfc:L212] and yields an inner join. [:L316] passes `"left"`
 * explicitly, because a SKU need not have an alternate code and an inner join would silently drop
 * every SKU that has none. `SmartListJoin.joinType` is omitted for the inner joins rather than set to
 * the empty string, so the absent form means "the legacy default" (S1, `exactOptionalPropertyTypes`).
 */
const SKU_SMART_LIST_JOINS: readonly SmartListJoin[] = Object.freeze([
  /* [:L314] */ { parentEntityName: SKU_ENTITY_NAME, relatedProperty: 'product' },
  /* [:L315] */ { parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'productType' },
  /* [:L316] */ {
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

/* ------------------------------------------------------------------------------------------------
 * SMART LIST INPUT KEY GRAMMAR — [org/Hibachi/HibachiSmartList.cfc:L85-L157]
 *
 * ⚠️ THIS GRAMMAR IS KNOWINGLY RESTATED, NOT SHARED, AND THE DUPLICATION IS SCOPE-FORCED RATHER THAN
 * DEFERRED WORK. `./OptionService` holds a translator with the identical grammar in a MODULE-PRIVATE
 * function it does not export, so the two cannot share one implementation without modifying a file
 * outside this file's scope — which S5 ("add nothing") and the prompt's guideline 1 both forbid. The
 * grammar is therefore restated from the same source lines rather than approximated, and it is
 * restated in full so the two readings cannot silently diverge. Naming the duplication is better than
 * hiding it; it is recorded here as an accepted consequence of the boundary, not as a task.
 *
 * ⛔ NO DEFAULT IS SUPPLIED FOR ANYTHING THE CALLER OMITS. `setup` defaults `pageRecordsStart=1` and
 * `pageRecordsShow=10` at [org/Hibachi/HibachiSmartList.cfc:L39], but those are the paging engine's
 * own defaults, not values this member chooses, and the port models "nothing was asked for" as an
 * absent member. Inventing them here would be a page size this file has no authority to set (S9).
 * ---------------------------------------------------------------------------------------------- */

/** `variables.dataKeyDelimiter = ":"` — [org/Hibachi/HibachiSmartList.cfc:L37]. */
const SMART_LIST_DATA_KEY_DELIMITER = ':';

/** `left(i,2) == "F:"` — [org/Hibachi/HibachiSmartList.cfc:L98]. */
const FILTER_PREFIX = `F${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `left(i,3) == "FR:"` — [org/Hibachi/HibachiSmartList.cfc:L100]. */
const FILTER_REMOVAL_PREFIX = `FR${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `left(i,3) == "FI:"` — [org/Hibachi/HibachiSmartList.cfc:L102]. */
const IN_FILTER_PREFIX = `FI${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `left(i,4) == "FIR:"` — [org/Hibachi/HibachiSmartList.cfc:L104]. */
const IN_FILTER_REMOVAL_PREFIX = `FIR${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `left(i,3) == "FK:"` — [org/Hibachi/HibachiSmartList.cfc:L106]. */
const LIKE_FILTER_PREFIX = `FK${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `left(i,4) == "FKR:"` — [org/Hibachi/HibachiSmartList.cfc:L112]. */
const LIKE_FILTER_REMOVAL_PREFIX = `FKR${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `left(i,2) == "R:"` — [org/Hibachi/HibachiSmartList.cfc:L114]. */
const RANGE_PREFIX = `R${SMART_LIST_DATA_KEY_DELIMITER}`;

/** `i == "OrderBy"` — [org/Hibachi/HibachiSmartList.cfc:L116]. */
const ORDER_BY_KEY = 'OrderBy';

/** `i == "P:Show"` — [org/Hibachi/HibachiSmartList.cfc:L121]. */
const PAGE_SHOW_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Show`;

/** `i == "P:Start"` — [org/Hibachi/HibachiSmartList.cfc:L127]. */
const PAGE_START_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Start`;

/** `i == "P:Current"` — [org/Hibachi/HibachiSmartList.cfc:L129]. */
const PAGE_CURRENT_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Current`;

/** The singular alias copied onto the plural at [org/Hibachi/HibachiSmartList.cfc:L135-L137]. */
const KEYWORD_KEY = 'keyword';

/** The plural key actually read at [org/Hibachi/HibachiSmartList.cfc:L140]. */
const KEYWORDS_KEY = 'keywords';

/** `arguments.data[i] == "ALL"` — [org/Hibachi/HibachiSmartList.cfc:L122]. */
const PAGE_RECORDS_SHOW_ALL_KEYWORD = 'ALL';

/** `setPageRecordsShow(1000000000)` — [org/Hibachi/HibachiSmartList.cfc:L123], also the ceiling at [:L124]. */
const PAGE_RECORDS_SHOW_ALL = 1000000000;

/** `variables.orderPropertyDelimiter = ","` — [org/Hibachi/HibachiSmartList.cfc:L35]. */
const ORDER_PROPERTY_DELIMITER = ',';

/** `variables.orderDirectionDelimiter = "|"` — [org/Hibachi/HibachiSmartList.cfc:L34]. */
const ORDER_DIRECTION_DELIMITER = '|';

/** `listFindNoCase("D,DESC", …)` — [org/Hibachi/HibachiSmartList.cfc:L476]. */
const DESCENDING_ORDER_TOKENS: readonly string[] = Object.freeze(['D', 'DESC']);

/** `variables.rangeDelimiter = "^"` — [org/Hibachi/HibachiSmartList.cfc:L36]. */
const RANGE_DELIMITER = '^';

/** The `%value%` wrapper built one list entry at a time at [org/Hibachi/HibachiSmartList.cfc:L108-L110]. */
const LIKE_FILTER_WILDCARD = '%';

/** `Replace(arguments.data.Keywords," ",",","all")` and its two siblings — [:L143-L145]. */
const KEYWORD_SEPARATORS: readonly string[] = Object.freeze([' ', '%20', '+']);

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
 * `../domain/sku/Sku` deliberately does NOT declare `getClassName`, `hasProperty`,
 * `getPropertyMetaData`, `getEntityName`, `getPrimaryIDValue`, `getPrimaryIDPropertyName` or
 * `getValueByPropertyIdentifier`: those are Hibachi base-class facilities on
 * `org/Hibachi/HibachiObject.cfc` and `org/Hibachi/HibachiEntity.cfc`, and
 * [model/entity/Sku.cfc:L236] is the source's own list of the members it inherits rather than defines.
 * `../validation/rules/sku.rules` needs them, so its subject type is the intersection of the domain
 * entity with that surface.
 *
 * ⛔ THE INTERSECTION IS DERIVED, NOT RESTATED. The second half is read off
 * `resolveSkuUniqueTarget`'s own parameter type, which is `SkuValidationSubject & UniquePropertyEntity`.
 * Naming `UniquePropertyEntity` directly would mean importing `../ports/UniquePropertyPort`, which is
 * not in this file's dependency whitelist (D4/E5). `Parameters<…>` obtains the identical type from a
 * module that IS whitelisted, and cannot fall out of step with it.
 *
 * WHERE THE EXTRA SURFACE COMES FROM AT RUN TIME: the composition root, exactly as for
 * `./BrandService`'s `ManagedBrand`. This is the subtree's established pattern, not a new one.
 */
export type ManagedSku = Sku & Parameters<typeof resolveSkuUniqueTarget>[0];

/**
 * The one validation capability this service needs, expressed over the domain SKU.
 *
 * WHY A NARROW VIEW RATHER THAN THE `Validator` CLASS. `Validator.validate` is generic in
 * `TSubject extends ValidationSubject`, and the value this service holds is a plain {@link Sku}, which
 * is deliberately not a `ValidationSubject` (see {@link ManagedSku}). Declaring the dependency as this
 * interface — with `validate` written in METHOD syntax, so its parameters are compared bivariantly —
 * lets a real `Validator` satisfy it while keeping the call site typed in terms of the entity this
 * service actually creates. `./BrandService` declares `BrandBaseService` for the same reason and in the
 * same way.
 */
export interface SkuSaveValidator {
  validate(
    sku: Sku,
    ruleSet: ValidationRuleSet<ManagedSku>,
    context: string,
    options?: ValidateOptions,
  ): Promise<ValidationError>;
}

/**
 * Binds a newly created SKU to the delegate shape `Product.defaultSku` accepts.
 *
 * ⚠️ THIS IS NOT AN OPTIONAL CONVENIENCE. `../domain/sku/Sku` records, in its own mismatch register,
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
 * `numeric` data-type constraint that `model/validation/Sku.json:5` declares for `price`: booleans are
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
 * ⚠️ A NON-NUMERIC VALUE BECOMES `NaN` RATHER THAN AN EXCEPTION, AND THAT IS THE FAITHFUL CHOICE.
 * `newSku.setPrice(arguments.data.price)` at [model/service/SkuService.cfc:L93] is a generated setter
 * with no declared type, so CFML stores whatever it is handed and the `numeric` rule at
 * `model/validation/Sku.json:5` is what reports the problem. `Sku.price` is typed `number`, so the
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
 * CFML `isDate`, approximated.
 *
 * ⚠️ FLAGGED APPROXIMATION. [org/Hibachi/HibachiSmartList.cfc:L446] accepts a range endpoint that is
 * either numeric or a date, and CFML's `isDate` recognises a locale-sensitive set of formats that has
 * no exact JavaScript equivalent. `Date.parse` is the closest primitive available without adding a
 * dependency (S5), and it is narrowed by rejecting anything {@link readsAsCfmlNumeric} already accepts,
 * because CFML's `isDate("5")` is false while `Date.parse` is permissive about bare numbers on some
 * engines. The divergence is confined to which range strings are accepted; no range value is rewritten.
 */
function readsAsCfmlDate(value: string): boolean {
  if (value.trim().length === 0 || readsAsCfmlNumeric(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value.trim()));
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
      `createSkus reads data.${key} without a guard at ${locator}, and the key is absent. The ` +
        `legacy code performs the same unguarded read at that line and raises here too.`,
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
 * ⚠️ THE SUBSCRIPTION BRANCH HAS NO LIST-PRICE GUARD AT ALL — [model/service/SkuService.cfc:L153-L169]
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
      `createSkus treats data.${key} as a list at ${locator}, but the supplied value is not a ` +
        `simple value. CFML's list functions raise on the same input.`,
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
      `createSkus evaluates data.${BUNDLE_CONTENT_ACCESS_DATA_KEY} as a boolean at ${locator}, but ` +
        `the supplied value cannot be read as one. CFML raises on the same coercion.`,
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
 * ⚠️ THE MOMENT THIS IS CALLED IS PART OF THE BEHAVIOUR. In the odometer branch the code is built at
 * [:L97] BEFORE `product.addSku` at [:L100], so the first SKU of a product with no SKUs is numbered 1.
 * In the subscription branch `setProduct` runs FIRST at [:L155], so the collection already contains the
 * new SKU and the same expression numbers the first one 2. That asymmetry is real, is carried, and is
 * the reason this is a function of the product rather than a counter.
 */
function nextSkuCodeSuffix(product: Product): number {
  return product.getSkus().length + 1;
}

/* ================================================================================================
 * SMART LIST INPUT TRANSLATION — [org/Hibachi/HibachiSmartList.cfc:L85-L157]
 *
 * `getSkuSmartList` hands its `data` struct to `getSkuDAO().getSmartList(argumentCollection=arguments)`
 * [model/service/SkuService.cfc:L312], which reaches `hibachiSmartList.setup(…)`
 * [org/Hibachi/HibachiDAO.cfc:L108] and thence `applyData`. The port's single execution member takes an
 * already-composed {@link SmartListQuery}, so the grammar `applyData` interprets is translated here.
 * ⛔ No SQL is composed: the output is a description, and the adapter behind
 * {@link SmartListQueryPort} owns every statement (S2).
 * ============================================================================================== */

/** The mutable accumulator the input keys are folded into before the immutable query is composed. */
interface SkuSmartListQueryDraft {
  filters: SmartListFilter[];
  likeFilters: SmartListFilter[];
  inFilters: SmartListFilter[];
  ranges: SmartListRange[];
  orders: SmartListOrder[];
  keywords: string[];
  pageRecordsStart?: number;
  pageRecordsShow?: number;
  currentPageDeclaration?: string;
}

/** `removeFilter` / `removeInFilter` / `removeLikeFilter` delete a whole property key at once. */
function removeEntriesForProperty(entries: SmartListFilter[], propertyIdentifier: string): void {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]?.propertyIdentifier === propertyIdentifier) {
      entries.splice(index, 1);
    }
  }
}

/** `"%#listGetAt(value, x, ",")#%"` accumulated one entry at a time — [:L108-L110]. */
function buildPatternFilterValue(raw: string): string {
  return cfmlListToArray(raw)
    .map((entry) => `${LIKE_FILTER_WILDCARD}${entry}${LIKE_FILTER_WILDCARD}`)
    .join(CFML_LIST_DELIMITER);
}

/** `isNumeric(v) && v <= 1000000000 && v > 0` — [:L124], [:L127] and [:L129]. */
function readAcceptablePageValue(value: string | number | boolean): number | undefined {
  if (!readsAsCfmlNumeric(value)) {
    return undefined;
  }
  const numeric = toCfmlNumber(value);
  return numeric > 0 && numeric <= PAGE_RECORDS_SHOW_ALL ? numeric : undefined;
}

/** `addRange`'s two-sided acceptance test and the raw value it stores — [:L445-L453]. */
function parseRangeValue(propertyIdentifier: string, raw: string): SmartListRange | undefined {
  const parts = cfmlListToArray(raw, RANGE_DELIMITER);
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';

  /* Both halves of [:L446] are reproduced verbatim, INCLUDING the fact that the lower-bound clause's
   * date test reads `listLast` rather than `listFirst`. That looks like a typo and may well be one, but
   * it decides which range strings the legacy accepts, so it is carried rather than corrected. */
  const lowerAcceptable =
    raw.startsWith(RANGE_DELIMITER) || readsAsCfmlNumeric(first) || readsAsCfmlDate(last);
  const upperAcceptable =
    raw.endsWith(RANGE_DELIMITER) || readsAsCfmlNumeric(last) || readsAsCfmlDate(last);
  if (!lowerAcceptable || !upperAcceptable) {
    return undefined;
  }

  const delimiterIndex = raw.indexOf(RANGE_DELIMITER);
  const lowerText = delimiterIndex < 0 ? raw : raw.slice(0, delimiterIndex);
  const upperText = delimiterIndex < 0 ? '' : raw.slice(delimiterIndex + RANGE_DELIMITER.length);
  return {
    propertyIdentifier,
    ...(lowerText.length > 0 ? { lowerBound: lowerText } : {}),
    ...(upperText.length > 0 ? { upperBound: upperText } : {}),
  };
}

/** `addOrder`'s `property|direction` grammar and its `D`/`DESC` tokens — [:L473-L483]. */
function parseOrderStatement(statement: string): SmartListOrder | undefined {
  const parts = cfmlListToArray(statement, ORDER_DIRECTION_DELIMITER);
  const propertyIdentifier = parts[0];
  if (propertyIdentifier === undefined || propertyIdentifier.length === 0) {
    return undefined;
  }
  const lastPart = parts[parts.length - 1];
  const descending =
    parts.length > 1 &&
    lastPart !== undefined &&
    DESCENDING_ORDER_TOKENS.some((token) => token === lastPart.trim().toUpperCase());
  return { propertyIdentifier, direction: descending ? 'DESC' : 'ASC' };
}

/**
 * `OrderBy` — [org/Hibachi/HibachiSmartList.cfc:L116-L120].
 *
 * ⚠️ THE RESET IS INSIDE THE LOOP, SO ONLY THE LAST TERM SURVIVES. `variables.orders = []` at [:L118]
 * runs once per comma-separated term, immediately before that term is appended, which means a
 * multi-term `OrderBy` collapses to its final term. That is almost certainly not what the author
 * intended, it is not one of the twenty-one register entries of AAP 0.6.7, and it is carried unchanged
 * and recorded here as an OBSERVED EXTRA rather than given a defect identifier this file has no
 * authority to mint (S7, S9).
 */
function applyOrderByEntry(draft: SkuSmartListQueryDraft, raw: string): void {
  for (const term of cfmlListToArray(raw, ORDER_PROPERTY_DELIMITER)) {
    draft.orders.length = 0;
    const order = parseOrderStatement(term);
    if (order !== undefined) {
      draft.orders.push(order);
    }
  }
}

/** `P:Show`, including the `ALL` sentinel — [org/Hibachi/HibachiSmartList.cfc:L121-L126]. */
function applyPageShowEntry(draft: SkuSmartListQueryDraft, value: string | number | boolean): void {
  if (typeof value === 'string' && value.trim().toUpperCase() === PAGE_RECORDS_SHOW_ALL_KEYWORD) {
    draft.pageRecordsShow = PAGE_RECORDS_SHOW_ALL;
    return;
  }
  const show = readAcceptablePageValue(value);
  if (show !== undefined) {
    draft.pageRecordsShow = show;
  }
}

/**
 * Folds one input entry into the draft, in the legacy's own prefix-test order.
 *
 * The order of the tests is not cosmetic: `F:` is tested before `FR:`, and `FI:` before `FIR:`, exactly
 * as at [org/Hibachi/HibachiSmartList.cfc:L98-L131]. Reordering them would misclassify a key, because
 * the shorter prefixes are proper prefixes of nothing but themselves only under this sequence.
 *
 * The three removal keys additionally require `isBoolean(value) && value` at [:L100], [:L104] and
 * [:L112]; a non-boolean value there is SKIPPED rather than raising, because CFML's `&&` short-circuits
 * on the `isBoolean` test. That is the opposite of the `bundleContentAccess` read in `createSkus`,
 * which has no such test and therefore does raise — see {@link readGuardedBundleContentAccessFlag}.
 */
function applyInputEntry(
  draft: SkuSmartListQueryDraft,
  key: string,
  value: string | number | boolean,
): void {
  if (key.startsWith(FILTER_PREFIX)) {
    draft.filters.push({ propertyIdentifier: key.slice(FILTER_PREFIX.length), value });
    return;
  }
  if (key.startsWith(FILTER_REMOVAL_PREFIX) && readsAsCfmlBoolean(value) && toCfmlBoolean(value)) {
    removeEntriesForProperty(draft.filters, key.slice(FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(IN_FILTER_PREFIX)) {
    draft.inFilters.push({ propertyIdentifier: key.slice(IN_FILTER_PREFIX.length), value });
    return;
  }
  if (
    key.startsWith(IN_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.inFilters, key.slice(IN_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(LIKE_FILTER_PREFIX)) {
    draft.likeFilters.push({
      propertyIdentifier: key.slice(LIKE_FILTER_PREFIX.length),
      value: buildPatternFilterValue(String(value)),
    });
    return;
  }
  if (
    key.startsWith(LIKE_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.likeFilters, key.slice(LIKE_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(RANGE_PREFIX)) {
    const range = parseRangeValue(key.slice(RANGE_PREFIX.length), String(value));
    if (range !== undefined) {
      draft.ranges.push(range);
    }
    return;
  }
  if (key === ORDER_BY_KEY) {
    applyOrderByEntry(draft, String(value));
    return;
  }
  if (key === PAGE_SHOW_KEY) {
    applyPageShowEntry(draft, value);
    return;
  }
  if (key === PAGE_START_KEY) {
    const start = readAcceptablePageValue(value);
    if (start !== undefined) {
      draft.pageRecordsStart = start;
    }
    return;
  }
  if (key === PAGE_CURRENT_KEY) {
    const current = readAcceptablePageValue(value);
    if (current !== undefined) {
      /* `SmartListPagination.currentPageDeclaration` is declared a STRING because
       * [org/Hibachi/HibachiSmartList.cfc:L130] assigns the raw value to a member that also carries the
       * non-numeric page declarations the paging engine understands. */
      draft.currentPageDeclaration = String(current);
    }
  }
}

/** The three separator replacements then `listToArray` — [org/Hibachi/HibachiSmartList.cfc:L143-L146]. */
function parseKeywords(raw: string): string[] {
  let keywordList = raw;
  for (const separator of KEYWORD_SEPARATORS) {
    keywordList = keywordList.split(separator).join(CFML_LIST_DELIMITER);
  }
  return cfmlListToArray(keywordList);
}

/**
 * Composes the immutable query, omitting every group the caller left empty.
 *
 * Omission is the faithful encoding of emptiness: [org/Hibachi/HibachiSmartList.cfc:L563] skips a where
 * group whose collections are all empty, so an absent collection and an empty one are
 * indistinguishable in the legacy's output. Members are added conditionally rather than assigned
 * `undefined` because `exactOptionalPropertyTypes` treats those as different types (S1).
 *
 * The entity name, the three joins and the five keyword properties are ALWAYS present, because
 * [model/service/SkuService.cfc:L310-L322] sets them unconditionally on every call.
 */
function composeSkuSmartListQuery(draft: SkuSmartListQueryDraft): SmartListQuery {
  const whereGroup: SmartListWhereGroup = {
    ...(draft.filters.length > 0 ? { filters: draft.filters } : {}),
    ...(draft.likeFilters.length > 0 ? { likeFilters: draft.likeFilters } : {}),
    ...(draft.inFilters.length > 0 ? { inFilters: draft.inFilters } : {}),
    ...(draft.ranges.length > 0 ? { ranges: draft.ranges } : {}),
  };
  const pagination: SmartListPagination = {
    ...(draft.pageRecordsStart !== undefined ? { pageRecordsStart: draft.pageRecordsStart } : {}),
    ...(draft.pageRecordsShow !== undefined ? { pageRecordsShow: draft.pageRecordsShow } : {}),
    ...(draft.currentPageDeclaration !== undefined
      ? { currentPageDeclaration: draft.currentPageDeclaration }
      : {}),
  };

  return {
    entityName: SKU_ENTITY_NAME,
    joins: SKU_SMART_LIST_JOINS,
    keywordProperties: SKU_SMART_LIST_KEYWORD_PROPERTIES,
    ...(Object.keys(whereGroup).length > 0 ? { whereGroups: [whereGroup] } : {}),
    ...(draft.keywords.length > 0 ? { keywords: draft.keywords } : {}),
    ...(draft.orders.length > 0 ? { orders: draft.orders } : {}),
    ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
  };
}

/**
 * Translates the caller's smart-list input into the query description the port executes.
 *
 * ⛔ `savedStateID` IS DELIBERATELY NOT HONOURED. [org/Hibachi/HibachiSmartList.cfc:L92-L95] calls
 * `setSavedStateID` and `loadSavedState`, which read a session-scoped store of previously applied
 * filters. No port in this slice exposes such a store, and inventing one — or a file to hold it —
 * would breach S5. The key is therefore ignored rather than half-implemented, and stating that is more
 * useful than a silent no-op.
 *
 * @param input - The caller's `data` struct. All six real legacy call sites supply none.
 * @returns The immutable query description, always carrying the entity, joins and keyword properties.
 */
function buildSkuSmartListQuery(input?: SmartListInput): SmartListQuery {
  const draft: SkuSmartListQueryDraft = {
    filters: [],
    likeFilters: [],
    inFilters: [],
    ranges: [],
    orders: [],
    keywords: [],
  };

  if (input === undefined) {
    return composeSkuSmartListQuery(draft);
  }

  const entries = input as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(entries)) {
    const value = entries[key];
    if (isCfmlSimpleValue(value)) {
      applyInputEntry(draft, key, value);
    }
  }

  /* The singular key is copied onto the plural at [:L135-L137] BEFORE the plural is read at [:L140], so
   * a caller supplying both effectively supplies only the singular. Reading the singular first
   * reproduces that precedence. */
  const singularKeyword = entries[KEYWORD_KEY];
  const pluralKeywords = entries[KEYWORDS_KEY];
  const rawKeywords = typeof singularKeyword === 'string' ? singularKeyword : pluralKeywords;
  if (typeof rawKeywords === 'string') {
    draft.keywords = parseKeywords(rawKeywords);
  }

  return composeSkuSmartListQuery(draft);
}

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
        `Product ${product.productID === '' ? '(unsaved)' : product.productID} has an associated SKU ` +
          `that is not a Sku entity, so model/service/SkuService.cfc:L248 cannot read it.`,
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
 * ⚠️⚠️ TODO(parity) D13 — model/service/SkuService.cfc:L220-L269. THE REORDER IS LEFT ABLE TO FAIL, AND
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
 * ⛔ Deliberately NOT done: appending the unplaced SKU; filtering it out; placing it first or last;
 * returning the partial array; falling back to the unsorted order. Every one of those would make a
 * currently failing call succeed with a different answer.
 *
 * `arrayResize` at [:L228] pre-sizes the result to the SORTED list's length, not the input's — so when the
 * two differ the legacy returns an array sized by the query. The sparse pre-size reproduces that.
 */
function reorderBySortedSkuIds(
  skus: readonly Sku[],
  sortedSkuIds: readonly string[],
  locator: string,
): Sku[] {
  // [:L228] `arrayResize(sortedArrayReturn, len(sortedArray))`
  const reordered = new Array<Sku>(sortedSkuIds.length);

  for (const sku of skus) {
    // [:L237] `arrayFind(sortedArray, skus[i].getSkuID())` — 0 when absent, and 0 is fatal there.
    const position = sortedSkuIds.indexOf(sku.skuID);
    if (position < 0) {
      throw new DomainError(
        `SKU ${sku.skuID === SKU_UNSAVED_ID_VALUE ? '(unsaved)' : sku.skuID} ` +
          `has no position in the sorted SKU ordering, so ${locator} cannot place it. Carried ` +
          `unrepaired as defect D13: the sorted ordering covers option-bearing SKUs only ` +
          `(model/dao/SkuDAO.cfc:L172-L204), and the legacy raises on the same input by indexing ` +
          `position zero of a one-based array.`,
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

  return reordered;
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
  ) {}

  /* ---------------------------------------------------------------------------------------------
   * THE EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED MEMBER
   * ------------------------------------------------------------------------------------------- */

  /**
   * Creates an unsaved SKU.
   *
   * ⭐ IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED. `this.newSku()` has no declaration anywhere
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
   * TEST PROVENANCE: NET-NEW.
   *
   * @returns A new, unassociated, unsaved SKU.
   */
  public newSku(): Sku {
    return new Sku();
  }

  /* ---------------------------------------------------------------------------------------------
   * THE COMBINATION ENGINE — [model/service/SkuService.cfc:L58-L208]
   * ------------------------------------------------------------------------------------------- */

  /**
   * Creates the SKUs a newly saved product requires, branching on its base product type.
   *
   * ⚠️ THE RETURN VALUE IS NOT A SUCCESS SIGNAL. [model/service/SkuService.cfc:L207] is an
   * unconditional `return true`, reached even when the subscription or content-access branch has added
   * errors and created nothing at all. The only caller,
   * `ProductService.saveProduct` [model/service/ProductService.cfc:L279], DISCARDS the value and
   * decides what to do next by re-checking the product's own error state at [:L286]. The boolean is
   * therefore vestigial, and it is preserved exactly — not narrowed to `void`, not made meaningful, not
   * used to report the error state.
   *
   * ⚠️ THIS METHOD DOES NOT PERSIST ANYTHING, AND NEITHER DOES THE LEGACY. `createSkus` never calls
   * save. The SKUs reach the database as a Hibernate cascade of the product save that
   * `ProductService.saveProduct` performs afterwards at [model/service/ProductService.cfc:L287], which
   * is itself gated on the product having no errors, and the write lands at the request-end flush
   * (AAP 0.6.6 mismatch M5). {@link SkuRepository} exposes no save member for exactly that reason, and
   * this file imports no unit of work and no adapter (S2, S4).
   *
   * ⚠️ M6 — VALIDATION READ-BACK. The highest-risk execution mismatch in the slice. See
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
  public async createSkus(product: Product, data: Record<string, unknown>): Promise<boolean> {
    /* THE ERROR BAG STANDS IN FOR THE PRODUCT'S FRAMEWORK-OWNED ERROR STATE, AND THE SUBSTITUTION IS
     * PROVABLY GATE-NEUTRAL. The legacy calls `arguments.product.addError(…)` at [:L143], [:L148] and
     * [:L176] and reads `arguments.product.hasErrors()` at [:L152] and [:L180]. Neither member exists on
     * `../domain/product/Product`: `addError`, `hasErrors` and `getErrors` are Hibachi base-class
     * facilities, and [model/entity/Sku.cfc:L236] is the source's own list of them. TR-5 requires the
     * gap to be flagged rather than the members quietly dropped, so the accumulation and both gates are
     * reproduced against one method-scoped bag, and the onward visibility of those errors to
     * `ProductService.saveProduct`'s own check at [model/service/ProductService.cfc:L286] belongs to the
     * product entity and its owning service, not here.
     *
     * Per-SKU validation findings accumulate into the SAME bag rather than a fresh one, so nothing is
     * dropped. That cannot change either gate's outcome: each branch's gate precedes ALL SKU creation
     * in that branch, and the three branches are mutually exclusive, so no gate is ever evaluated after
     * a SKU has been validated. */
    const errors = new ValidationError();

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
        await this.createMerchandiseSkusFromSelectedOptions(
          product,
          data,
          rawOptions,
          ruleSet,
          errors,
        );
      } else {
        await this.createSingleMerchandiseSku(product, data, ruleSet, errors);
      }
    } else if (baseProductType === SUBSCRIPTION_BASE_PRODUCT_TYPE) {
      await this.createSubscriptionSkus(product, data, ruleSet, errors);
    } else if (baseProductType === CONTENT_ACCESS_BASE_PRODUCT_TYPE) {
      await this.createContentAccessSkus(product, data, ruleSet, errors);
    } else {
      /* [:L204] `throw("There was an unexpected error when creating this product")`. ⛔ THE MESSAGE
       * STRING IS OWNED BY `../errors/DomainError` AND IS IMPORTED, NEVER RETYPED — it is observable
       * behaviour, so a second copy could drift from the first. There is deliberately no default
       * branch: an unrecognised discriminator raises, exactly as the legacy does. */
      throw new DomainError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE, {
        context: {
          productID: product.productID,
          baseProductType,
          locator: 'model/service/SkuService.cfc:L203-L205',
        },
      });
    }

    /* [:L207] — unconditional, even after error additions. See the method note above. */
    return true;
  }

  /**
   * MERCHANDISE, OPTIONS SUPPLIED — [model/service/SkuService.cfc:L64-L122]. The odometer.
   *
   * ⚠️⚠️ THE ENUMERATION ORDER IS THE BEHAVIOUR. This is not a set of combinations; it is a SEQUENCE of
   * them, and three observable outcomes depend on the sequence: the SKU-code suffixes are assigned in
   * it, `defaultSku` is whichever SKU the sequence produces first, and — through M6 — it is the order in
   * which each SKU's uniqueness rule observes its already-created siblings. It must therefore be ported
   * literally. It is deliberately NOT re-expressed as recursion, as a Cartesian-product helper, as a
   * generator, or as any mathematically equivalent enumeration with a different order.
   *
   * The legacy working model is retained name for name — `optionGroups` [:L66], `totalCombos` [:L67],
   * `indexedKeys` [:L68] and `currentIndexesByKey` [:L69] — so the two can be read side by side.
   *
   * ⛔ THE DEAD LOCAL `keyToChange` IS NOT EMITTED. [:L70] declares `var keyToChange = ""` and NOTHING
   * in the method ever reads or reassigns it; the carry loop uses `changeKeyIndex` [:L111] instead. An
   * unread binding would be an ESLint error here, and emitting one to mirror a dead declaration would
   * trade a real build failure for zero behavioural gain. Its omission is recorded rather than silent
   * (S7).
   *
   * ⚠️ M9 — CFML STRUCT ITERATION IS UNORDERED; THIS IS NOT. [:L82] and [:L106] both traverse the
   * `optionGroups` struct with `for(var key in …)`, and CFML specifies no order for a plain struct, so
   * the legacy's own combination sequence is unspecified. A `Map` preserves FIRST-SEEN INSERTION order,
   * which is the order the selected-option list itself establishes at [:L73-L79]. That choice is
   * deliberate: it is stable across runs and platforms, so tests and builds are reproducible, and it is
   * the most defensible reading of an unspecified legacy order. ⛔ The group identifiers are NOT sorted —
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
    errors: ValidationError,
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
      totalCombos = totalCombos * bucket.length;
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

      await this.validateNewSku(newSku, ruleSet, errors);

      /* [:L109] — the carry is skipped on the final combination, so the wheels are left mid-sequence. */
      if (combination < totalCombos - 1) {
        this.advanceOptionOdometer(optionGroups, indexedKeys, currentIndexesByKey);
      }
    }
  }

  /**
   * The odometer carry — [model/service/SkuService.cfc:L110-L120].
   *
   * ⚠️ `indexedKeys[0]` ADVANCES FASTEST. `changeKeyIndex` starts at the FIRST published key ([:L111]
   * starts it at CFML's 1) and only moves on when that wheel has already reached its last position, so
   * the earliest-seen option group is the least significant digit. Reversing this reverses the SKU
   * sequence and therefore the SKU codes and the default SKU.
   *
   * ⚠️ THE MISSING BOUNDS GUARD IS PRESERVED, NOT ADDED. [:L113] indexes `indexedKeys[changeKeyIndex]`
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
          `The option combination carry ran past the last option group while creating SKUs. ` +
            `model/service/SkuService.cfc:L113 indexes indexedKeys without a bounds check and raises ` +
            `on the same state.`,
          { context: { changeKeyIndex, locator: 'model/service/SkuService.cfc:L110-L120' } },
        );
      }
      const bucket = optionGroups.get(optionGroupID);
      const currentIndex = currentIndexesByKey.get(optionGroupID);
      if (bucket === undefined || currentIndex === undefined) {
        throw new DomainError(
          `Option group ${optionGroupID} has no combination state while creating SKUs, so ` +
            `model/service/SkuService.cfc:L113 cannot resolve.`,
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
   * ⚠️ THIS BRANCH CALLS `thisSku.setProduct(product)` AT [:L128], NOT `product.addSku(thisSku)`, AND IT
   * IS PORTED THAT WAY. The two are behaviourally identical — [model/entity/Product.cfc:L1010]
   * implements `addSku` as `arguments.sku.setProduct( this )` — so this looks like a pointless
   * inconsistency to normalise away. It is left exactly as written: the source-level choice is what a
   * reviewer comparing the two branches will check, and "the branches differ in which member they call"
   * is a true statement about the legacy that a normalised port would erase.
   *
   * ⚠️ THE SUFFIX IS THE LITERAL `1`, NOT AN ORDINAL. [:L133] writes `& "-1"` with no arithmetic at all,
   * where the odometer branch computes `arrayLen(getSkus()) + 1`. On a product that already has SKUs
   * this branch will therefore mint a duplicate code, which the `skuCode` uniqueness rule in
   * `model/validation/Sku.json:9` is what catches. Carried unchanged.
   *
   * ⚠️ `setDefaultSku` IS UNCONDITIONAL HERE. [:L134] has no `isNull(getDefaultSku())` guard, unlike
   * [:L101], so this branch REPLACES an existing default. Carried unchanged.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createSingleMerchandiseSku(
    product: Product,
    data: Record<string, unknown>,
    ruleSet: ValidationRuleSet<ManagedSku>,
    errors: ValidationError,
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

    await this.validateNewSku(thisSku, ruleSet, errors);
  }

  /**
   * SUBSCRIPTION — [model/service/SkuService.cfc:L139-L170]. One SKU per selected subscription term.
   *
   * ⚠️ `renewalPrice` IS SET FROM THE SAME `data.price` VALUE AS `price`. [:L156] and [:L157] read the
   * identical key. There is a distinct `renewalPrice` field on the entity and
   * `model/validation/Sku.json:11` validates it separately, and `ProductService` DOES read a separate
   * renewal price at [model/service/ProductService.cfc:L179], so this looks like a copy-paste slip. It
   * is carried unchanged: repairing it would change every subscription SKU this method has ever created.
   *
   * ⚠️ `data.renewalSubscriptionBenefits` IS READ WITHOUT A GUARD at [:L163], while
   * `subscriptionBenefits` and `subscriptionTerms` are both guarded at [:L142] and [:L147]. An absent key
   * therefore RAISES rather than being treated as an empty list — which is exactly why
   * `SubscriptionSkuCreationData` declares that member REQUIRED while declaring the other two optional.
   * The read is placed immediately after the gate rather than inside the loop, which is equivalent: the
   * gate can only pass when at least one term was supplied, so the legacy always performs the read at
   * least once too.
   *
   * ⚠️ THERE IS NO LIST-PRICE HANDLING IN THIS BRANCH AT ALL, unlike both merchandise arms. Carried.
   *
   * ⛔ BOUNDARY — THE BENEFIT ASSOCIATIONS CANNOT BE MADE HERE, AND ARE NOT FAKED. [:L161] and [:L164]
   * call `thisSku.addSubscriptionBenefit(…)` and `thisSku.addRenewalSubscriptionBenefit(…)`.
   * `../domain/sku/Sku` declares neither member and neither collection, because the subscription module
   * is out of scope (AAP 0.2.2.1). Every benefit is still RESOLVED through the port, in source order, so
   * the lookups happen and an unresolvable benefit still fails exactly where it fails in the legacy; only
   * the final association is absent, and it is flagged here rather than dropped silently (TR-5).
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createSubscriptionSkus(
    product: Product,
    data: Record<string, unknown>,
    ruleSet: ValidationRuleSet<ManagedSku>,
    errors: ValidationError,
  ): Promise<void> {
    // [:L142-L144]
    const subscriptionBenefits = readCfmlListOrEmpty(
      data,
      SUBSCRIPTION_BENEFITS_DATA_KEY,
      'model/service/SkuService.cfc:L142',
    );
    if (subscriptionBenefits.length === 0) {
      errors.addError(SUBSCRIPTION_BENEFITS_ERROR_PROPERTY, SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY);
    }

    // [:L147-L149]
    const subscriptionTerms = readCfmlListOrEmpty(
      data,
      SUBSCRIPTION_TERMS_DATA_KEY,
      'model/service/SkuService.cfc:L147',
    );
    if (subscriptionTerms.length === 0) {
      errors.addError(SUBSCRIPTION_TERMS_ERROR_PROPERTY, SUBSCRIPTION_TERMS_REQUIRED_RBKEY);
    }

    /* [:L152] `if(!arguments.product.hasErrors())` — the whole creation loop is gated, so a product that
     * failed either check above ends this branch having created nothing. */
    if (errors.hasErrors()) {
      return;
    }

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
        throw new DomainError(
          `The subscription term list lost its entry at position ${String(index)} while creating SKUs.`,
          { context: { index, locator: 'model/service/SkuService.cfc:L158' } },
        );
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

      // [:L160-L162] — resolved in source order; the association is boundary-omitted.
      for (const subscriptionBenefitID of subscriptionBenefits) {
        await this.requireSubscriptionBenefit(
          subscriptionBenefitID,
          'model/service/SkuService.cfc:L161',
        );
      }
      // [:L163-L165] — likewise, over the unguarded list.
      for (const renewalBenefitID of subscriptionData.renewalSubscriptionBenefits) {
        await this.requireSubscriptionBenefit(
          renewalBenefitID,
          'model/service/SkuService.cfc:L164',
        );
      }

      // [:L166-L168] `if(i==1)`
      if (index === FIRST_ARRAY_INDEX) {
        product.defaultSku = this.bindDefaultSkuDelegate(thisSku);
      }

      await this.validateNewSku(thisSku, ruleSet, errors);
    }
  }

  /**
   * CONTENT ACCESS — [model/service/SkuService.cfc:L173-L202]. Either one bundled SKU or one per content.
   *
   * ⚠️ THE MUTATION ORDER IS THE INVERSE OF BOTH SIBLING BRANCHES. Here the SKU code is assigned BEFORE
   * the product association — [:L184] then [:L185], and [:L194] then [:L195] — whereas the subscription
   * branch associates first [:L155] and the odometer branch associates after computing the code from the
   * collection length [:L97] then [:L100]. The consequence is real: because the association has not
   * happened yet, `arrayLen(getSkus())` would be one lower here, which is precisely why this branch uses
   * a literal `1` and an explicit `c` ordinal instead of the collection length. Carried as written.
   *
   * ⚠️ THE BUNDLED ARM SETS THE DEFAULT SKU UNCONDITIONALLY at [:L189], while the per-content arm gates
   * it on the first iteration at [:L197]. Both are carried.
   *
   * ⛔ NO CONTENT IDENTIFIER IS DEDUPLICATED, SORTED OR NORMALISED — the per-content arm creates exactly
   * one SKU per list entry, in input order, with the 1-based suffixes `-1`, `-2`, … that [:L194]
   * produces.
   *
   * ⛔ BOUNDARY — `newSku.addAccessContent(…)` at [:L187] and [:L196] has no target member.
   * `../domain/sku/Sku` declares no `accessContents` collection, because the content module is out of
   * scope. Each content is still resolved through the port so the lookup and its failure mode survive;
   * only the association is absent, and it is flagged rather than dropped (TR-5).
   *
   * TEST PROVENANCE: NET-NEW.
   */
  private async createContentAccessSkus(
    product: Product,
    data: Record<string, unknown>,
    ruleSet: ValidationRuleSet<ManagedSku>,
    errors: ValidationError,
  ): Promise<void> {
    // [:L175-L177]
    const accessContents = readCfmlListOrEmpty(
      data,
      ACCESS_CONTENTS_DATA_KEY,
      'model/service/SkuService.cfc:L175',
    );
    if (accessContents.length === 0) {
      errors.addError(ACCESS_CONTENTS_ERROR_PROPERTY, ACCESS_CONTENTS_REQUIRED_RBKEY);
    }

    // [:L180] — the same gate shape as the subscription branch.
    if (errors.hasErrors()) {
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

    if (creationMode === 'bundled') {
      // [:L182-L189]
      const newSku = this.newSku();
      newSku.price = creationData.price;
      // [:L184] — the literal suffix, assigned BEFORE the association below.
      newSku.skuCode = buildSkuCode(product, FIRST_SKU_CODE_SUFFIX);
      newSku.setProduct(product);
      for (const contentID of accessContents) {
        await this.requireAccessContent(contentID, 'model/service/SkuService.cfc:L187');
      }
      // [:L189] — unconditional.
      product.defaultSku = this.bindDefaultSkuDelegate(newSku);

      await this.validateNewSku(newSku, ruleSet, errors);
      return;
    }

    // [:L191-L200]
    for (let index = 0; index < accessContents.length; index++) {
      const contentID = accessContents[index];
      if (contentID === undefined) {
        throw new DomainError(
          `The access-content list lost its entry at position ${String(index)} while creating SKUs.`,
          { context: { index, locator: 'model/service/SkuService.cfc:L196' } },
        );
      }

      const newSku = this.newSku();
      // [:L193]
      newSku.price = creationData.price;
      // [:L194] `"-#c#"` — the 1-based ordinal of the loop, not the collection length.
      newSku.skuCode = buildSkuCode(product, index + FIRST_ORDINAL);
      // [:L195]
      newSku.setProduct(product);
      // [:L196] — exactly one content per SKU.
      await this.requireAccessContent(contentID, 'model/service/SkuService.cfc:L196');
      // [:L197-L199] `if(c==1)`
      if (index === FIRST_ARRAY_INDEX) {
        product.defaultSku = this.bindDefaultSkuDelegate(newSku);
      }

      await this.validateNewSku(newSku, ruleSet, errors);
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * COLLABORATOR RESOLUTION — the unguarded legacy dereferences, made explicit
   *
   * Each helper below reproduces one legacy expression that dereferences a lookup result without
   * checking it. Hibachi's `get`-prefixed lookups return null when nothing matches
   * [org/Hibachi/HibachiService.cfc:L305-L328], so every one of these raises in CFML on a missing
   * record, and every one raises here. ⛔ None of them substitutes a default, skips the entry or
   * shortens the resulting collection — doing so would change the number of SKUs created, which is the
   * one thing a caller can actually observe.
   * ------------------------------------------------------------------------------------------- */

  /** `getOptionService().getOption( listGetAt(arguments.data.options, i) )` — [:L74]. */
  private async requireOption(optionID: string, locator: string): Promise<Option> {
    const option = await this.optionService.getOption(optionID);
    if (option === null) {
      throw new DomainError(
        `Selected option ${optionID} does not exist, so ${locator} cannot resolve it. The legacy ` +
          `code dereferences the lookup result without a guard at that line and raises here too.`,
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
        `Selected option ${option.optionID === '' ? '(unsaved)' : option.optionID} has no option ` +
          `group, so ${locator} cannot resolve. The legacy code dereferences the option group without ` +
          `a guard at that line and raises here too.`,
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
        `Option group ${optionGroupID} has no current combination index, so ` +
          `model/service/SkuService.cfc:L107 cannot resolve.`,
        { context: { optionGroupID, locator: 'model/service/SkuService.cfc:L107' } },
      );
    }
    const option = bucket[currentIndex];
    if (option === undefined) {
      throw new DomainError(
        `Option group ${optionGroupID} has no option at combination index ${String(currentIndex)}, ` +
          `so model/service/SkuService.cfc:L107 cannot resolve. CFML raises on the same out-of-range ` +
          `array read.`,
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
        `Subscription term ${subscriptionTermID} does not exist, so ${locator} cannot resolve it. ` +
          `The legacy code passes the unchecked lookup result straight to setSubscriptionTerm and ` +
          `raises here too.`,
        { context: { subscriptionTermID, locator } },
      );
    }
    return subscriptionTerm;
  }

  /** `getSubscriptionService().getSubscriptionBenefit( … )` — [:L161] and [:L164]. */
  private async requireSubscriptionBenefit(
    subscriptionBenefitID: string,
    locator: string,
  ): Promise<void> {
    const subscriptionBenefit =
      await this.subscriptionTermPort.getSubscriptionBenefit(subscriptionBenefitID);
    if (subscriptionBenefit === null) {
      throw new DomainError(
        `Subscription benefit ${subscriptionBenefitID} does not exist, so ${locator} cannot resolve ` +
          `it. The legacy code passes the unchecked lookup result straight to the SKU's benefit ` +
          `collection and raises here too.`,
        { context: { subscriptionBenefitID, locator } },
      );
    }
    /* ⛔ BOUNDARY: the legacy would now call addSubscriptionBenefit or addRenewalSubscriptionBenefit.
     * `../domain/sku/Sku` declares neither collection (subscription module out of scope), so the
     * resolved reference has no association target. See the branch note on
     * {@link SkuService.createSubscriptionSkus}. */
  }

  /** `getContentService().getContent( … )` — [:L187] and [:L196]. */
  private async requireAccessContent(contentID: string, locator: string): Promise<void> {
    const accessContent = await this.accessContentPort.getContent(contentID);
    if (accessContent === null) {
      throw new DomainError(
        `Access content ${contentID} does not exist, so ${locator} cannot resolve it. The legacy ` +
          `code passes the unchecked lookup result straight to addAccessContent and raises here too.`,
        { context: { contentID, locator } },
      );
    }
    /* ⛔ BOUNDARY: the legacy would now call addAccessContent. `../domain/sku/Sku` declares no
     * accessContents collection (content module out of scope). See the branch note on
     * {@link SkuService.createContentAccessSkus}. */
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
   * ⚠️⚠️ M6 — THIS IS THE HIGHEST-RISK EXECUTION-MODEL MISMATCH IN THE SLICE (AAP 0.6.2, 0.6.6). The
   * cycle is:
   *
   *   createSkus → per-SKU save/validation → `model/validation/Sku.json` method rule
   *     → `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L756-L769]
   *     → `Product.getSkusBySelectedOptions()` → the `SwSku`/`SwSkuOption` query
   *     → rows the SAME operation is in the middle of writing.
   *
   * Under CFML the rule only ever observes the siblings already visible to the Hibernate session, so the
   * result depends on flush timing AND on the order in which the batch is persisted. Under `mysql2` there
   * is no session and no automatic flush. Making each SKU visible to the next SKU's uniqueness read
   * belongs to the adapter and unit-of-work composition, which this file must not and does not import
   * (S2, S4) — but THE SEQUENCING JUDGMENT IS THIS SERVICE'S, and it is made here:
   *
   *   ✔ each SKU is validated individually, at the point in the odometer or branch sequence where the
   *     legacy would have saved it;
   *   ⛔ the batch is NOT inserted first and validated afterwards;
   *   ⛔ the batch is NOT validated in full before any SKU exists;
   *   ⛔ the awaits are NOT reordered, hoisted, deferred, or collected into `Promise.all`.
   *
   * THE SEQUENTIAL AWAITS ARE THE POINT. `Promise.all` here would let two SKUs' uniqueness reads observe
   * the same sibling set and both pass, where the legacy fails the second — a silent divergence with no
   * compile error and no test failure unless a test is written for it. `await` inside a loop is normally
   * a lint smell; here it is load-bearing, and it must not be "optimised" to satisfy a linter.
   *
   * ⚠️ TODO(parity) D19 — model/entity/Sku.cfc:L756-L769. AN OPTIONLESS SKU FAILS `hasUniqueOptions` ON
   * ANY PRODUCT THAT ALREADY HAS OPTION-BEARING SKUS, and that is carried unrepaired. With no options the
   * selected-option list is empty, and by semantic T5 (AAP 0.6.1.3) the query legitimately degenerates to
   * "every option-bearing SKU of this product" rather than returning nothing. The legacy guard then reads
   * `if(!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()))`, which can only
   * pass when the product has no option-bearing SKUs at all. ⛔ The rules are NOT bypassed for optionless
   * SKUs and the case is NOT special-cased away — both the merchandise no-options branch and the
   * degenerate lone-delimiter path at [:L64] flow through this method unchanged.
   *
   * Findings accumulate into the caller's bag through `ValidateOptions.errors`, preserving the rule set's
   * own property keys and rbKey message values rather than any text invented here.
   *
   * TEST PROVENANCE: NET-NEW. A test must be able to prove that EITHER naive ordering fails.
   */
  private async validateNewSku(
    sku: Sku,
    ruleSet: ValidationRuleSet<ManagedSku>,
    errors: ValidationError,
  ): Promise<void> {
    const options: ValidateOptions = { errors };
    await this.validator.validate(sku, ruleSet, SKU_SAVE_CONTEXT, options);
  }

  /* ---------------------------------------------------------------------------------------------
   * THE REMAINING EIGHT DECLARED MEMBERS — [model/service/SkuService.cfc:L210-L325]
   * ------------------------------------------------------------------------------------------- */

  /**
   * Saves an uploaded image file against a SKU's image path.
   *
   * ⚠️ TODO(parity) D24 — model/service/SkuService.cfc:L210-L218. THE RETURN TYPE IS `boolean`, NOT
   * `Sku`, AND THIS CORRECTS THE AAP. The legacy declares `returntype="any"` but its body ends in
   * `return getService("imageService").saveImageFile(…)`, and `saveImageFile` yields a boolean — so the
   * only value this member has ever produced is a boolean. AAP 0.4.2.2 tabulates
   * `Promise<Sku>`; that entry is wrong, and the source-honest signature is used instead. ⛔ Returning or
   * mutating a `Sku` as a substitute would fabricate behaviour the legacy never had.
   *
   * ⭐ THE IMAGE DEPENDENCY IS THE HIDDEN ONE. [:L212] resolves it as
   * `getService("imageService")` — a dynamic string lookup that is NEVER declared as a component
   * property, so it is invisible to any dependency analysis based on component metadata, and a port built
   * from such an analysis would compile and then fail at the first image operation (AAP 0.6.3.2). It is
   * routed through {@link ImagePathPort} (import rule R2).
   *
   * ⛔ THE ALLOWED-EXTENSION LIST IS IMPORTED, NEVER RETYPED. `IMAGE_UPLOAD_ALLOWED_EXTENSIONS` is
   * `../ports/ImagePathPort`'s single source of truth for the literal `"jpg,jpeg,png,gif"` at [:L215] —
   * exact value, exact order. A second copy of the string in this file could drift from the first.
   *
   * The legacy parameter is spelled with a capital `S` — `required any Sku` at [:L210] — and is then read
   * as `arguments.Sku` at [:L211]. CFML argument names are case-insensitive, so the spelling carries no
   * meaning; the idiomatic lower-case name is used and the source spelling recorded here.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param sku - The SKU whose image path receives the file.
   * @param imageUploadResult - The upload result struct, passed through to the port opaquely.
   * @returns The port's boolean result, unchanged.
   */
  public async processImageUpload(
    sku: Sku,
    imageUploadResult: Record<string, unknown>,
  ): Promise<boolean> {
    // [:L211] `var imagePath = arguments.Sku.getImagePath();`
    const filePath = await sku.getImagePath(this.imagePathPort);
    // [:L212-L216] — the hidden dependency, through the port. The boolean is returned unchanged.
    return this.imagePathPort.saveImageFile({
      uploadResult: imageUploadResult,
      filePath,
      allowedExtensions: IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
    });
  }

  /**
   * Returns a product's SKUs, optionally reordered by the option-group sort ordering.
   *
   * ⚠️ `sorted` IS REQUIRED, NOT OPTIONAL. [model/service/SkuService.cfc:L220] declares
   * `required boolean sorted` while `fetchOptions` carries the default `false`. AAP 0.4.2.2 records this
   * as Discrepancy 2 precisely because the reverse would be the natural guess. The one in-repository
   * caller, [model/entity/Product.cfc:L159], supplies both.
   *
   * ⚠️ THE SORT GATE HAS THREE PARTS, NOT ONE — [:L224] tests `arguments.sorted`, then
   * `arrayLen(skus) > 1`, then `arrayLen(skus[1].getOptions())`. The third part means A PRODUCT WHOSE
   * FIRST SKU HAS NO OPTIONS IS NEVER SORTED, however many option-bearing SKUs follow it, and it is what
   * makes this member markedly less exposed to D13 than its sibling. All three parts are preserved, in
   * order.
   *
   * ⚠️ TODO(parity) D13 — model/service/SkuService.cfc:L220-L244. THE REORDER CAN FAIL, AND IT IS LEFT
   * ABLE TO FAIL. See {@link SkuService.reorderBySortedSkuIds}.
   *
   * ⚠️ The `fetchOptions` flag is not merely an eager-loading hint: in the DAO it appends
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
   * ⚠️ THIS READS THE PRODUCT'S OWN COLLECTION, NOT THE REPOSITORY. [:L248] is
   * `arguments.product.getSkus()`, so unlike {@link SkuService.getProductSkus} this member issues no
   * fetch and observes whatever is already associated — including SKUs created earlier in the same
   * `createSkus` run and not yet flushed. Preserved.
   *
   * ⚠️ TODO(parity) D13 — model/service/SkuService.cfc:L246-L269. THIS MEMBER IS THE MORE EXPOSED OF THE
   * TWO, and the annotation is repeated here deliberately rather than cross-referenced, because the
   * exposure differs. [:L250] gates only on `arrayLen(skus) < 2`; there is NO equivalent of the
   * first-SKU-has-options test that [:L224] applies. So a product with two SKUs of which one has no
   * options reaches the reorder here, and the sorted-identifier query returns option-bearing SKUs only
   * [model/dao/SkuDAO.cfc:L172-L204] — leaving the optionless SKU with no position. See
   * {@link SkuService.reorderBySortedSkuIds}.
   *
   * ⚠️ ZERO CALLERS EXIST FOR THIS MEMBER ANYWHERE IN THE REPOSITORY — a full-tree search finds no
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
   * ⚠️ BOTH ARGUMENTS ARE OPTIONAL. [:L271] declares `string term, string productTypeID` with neither
   * marked `required` — AAP 0.4.2.2 Discrepancy 3. The looseness is genuine and is preserved rather than
   * tightened, so an omitted argument stays omitted and is not converted into an empty string.
   *
   * ⚠️ The DAO reads `arguments.term` UNGUARDED into its LIKE parameter
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
   * ⚠️ TODO(parity) D4 — model/service/SkuService.cfc:L281-L283. THIS MEMBER CANNOT WORK, AND IT IS
   * PRESERVED AS AN EXPLICIT NOT-IMPLEMENTED BOUNDARY RATHER THAN GIVEN AN ANSWER. [:L282] delegates to
   * `getSkuDAO().getSkuStocksDeletableFlag(…)`, and that DAO member EXISTS NOWHERE IN THE REPOSITORY —
   * `model/dao/SkuDAO.cfc` declares six public members and none of them is it. So the only path that
   * reaches this member, `Sku.getStocksDeletableFlag()` [model/entity/Sku.cfc:L567-L572], has never been
   * able to resolve. `../domain/sku/Sku` makes the same declaration for the same reason.
   *
   * ⛔ Deliberately NOT done: returning a fabricated `true` or `false`; querying stock or inventory
   * (both modules are out of scope, AAP 0.2.2.1); adding a member to {@link SkuRepository} to satisfy the
   * call, which would invent a query the legacy never had.
   *
   * The member is NOT declared `async`: an `async` body with no `await` is an error under this project's
   * type-aware lint configuration, so the rejection is returned from a synchronous
   * `Promise`-returning method instead. The identifier is carried into the error context, which also
   * keeps the parameter genuinely used.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param skuID - The SKU identifier the legacy would have passed to the absent DAO member.
   * @returns Never resolves.
   * @throws {NotImplementedError} always.
   */
  public getSkuStocksDeletableFlag(skuID: string): Promise<boolean> {
    throw new NotImplementedError(
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
    );
  }

  /**
   * Reports whether any transaction references the given SKU or product.
   *
   * ⚠️ TODO(parity) D23 — model/service/SkuService.cfc:L285-L287; callers model/entity/Sku.cfc:L594 and
   * model/entity/Product.cfc:L626. THE LEGACY DECLARATION TAKES ZERO FORMAL PARAMETERS BUT THE MEMBER IS
   * NOT ARGUMENT-FREE. [:L285] is `public boolean function getTransactionExistsFlag()` and [:L286]
   * forwards `argumentCollection=arguments` to the DAO, which declares `string productID, string skuID`
   * [model/dao/SkuDAO.cfc:L53-L56]. CFML passes named arguments a signature never declared, so the real
   * callers each supply one:
   *
   *   `Sku.cfc:L594`     → `skuID = this.getSkuID()`
   *   `Product.cfc:L626` → `productID = this.getProductID()`
   *
   * A literal zero-argument TypeScript method would compile and then break both of its own callers, so
   * the observed contract is declared instead — behaviour over literal signature. This is the ratified
   * target from AAP 0.4.2.2 rather than that section's narrower prose reading.
   *
   * ⚠️ THE ARGUMENT ORDER IS DELIBERATELY SWAPPED ON THE WAY OUT. This member takes `(skuID, productID)`
   * — SKU first, matching the service's own name and its more specific caller — while
   * {@link SkuRepository.transactionExists} takes `(productID, skuID)`, matching the DAO's declaration
   * order. The mapping below is the one place the two orders meet, and getting it backwards would silently
   * test the wrong column, so it is called out rather than left to be inferred. The DAO resolves the
   * overlap by letting `skuID` win when both are present [model/dao/SkuDAO.cfc:L59-L64]; that precedence
   * is the adapter's to keep.
   *
   * Both values are forwarded as declared, including when they are `undefined` — the port's optional
   * parameters accept that, and omitting versus explicitly passing `undefined` is indistinguishable for
   * positional parameters.
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async getTransactionExistsFlag(skuID?: string, productID?: string): Promise<boolean> {
    // ⚠️ (skuID, productID) in → (productID, skuID) out. See the note above.
    return this.skuRepository.transactionExists(productID, skuID);
  }

  /**
   * Finds a SKU by its SKU code, falling back to alternate SKU codes. Pure delegation — [:L289-L291].
   *
   * ⚠️ THE ARGUMENT IS OPTIONAL HERE AND REQUIRED ONE LAYER DOWN. [:L289] declares `string skuCode` with
   * no `required`, while `model/dao/SkuDAO.cfc:L102` declares `required string skuCode` — so an omitted
   * code passes this member and fails at the DAO. The loose service signature is preserved because
   * tightening it would reject a call the legacy accepts, and the DAO's own requirement is reproduced as
   * an explicit failure at the point the legacy fails.
   *
   * ⚠️ THE NULL RETURN IS PART OF THE CONTRACT AND MUST NOT BECOME A THROW. The out-of-scope caller
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
        'getSkuBySkuCode was called without a SKU code. The service signature at ' +
          'model/service/SkuService.cfc:L289 leaves the argument optional, but the underlying lookup at ' +
          'model/dao/SkuDAO.cfc:L102 declares it required, so the legacy raises here too.',
        { context: { locator: 'model/service/SkuService.cfc:L289-L291' } },
      );
    }
    return this.skuRepository.findBySkuCode(skuCode);
  }

  /**
   * Returns a paginated, filterable SKU smart list — [:L309-L325].
   *
   * The legacy composes it in four steps, all preserved by {@link buildSkuSmartListQuery}: the root
   * entity `SlatwallSku` [:L310]; three related-property joins [:L314-L316], THE THIRD OF WHICH IS A
   * `left` JOIN so SKUs with no alternate codes are still returned; and five keyword properties at weight
   * 1 [:L318-L322]. ⛔ No pagination default, filter or ordering is invented — the caller's `data` is
   * translated and nothing more. Every in-repository caller passes no arguments at all
   * (`integrationServices/google/controllers/feed.cfc:L63` among five others), which is exactly why an
   * invented default here would be invisible in review and change every one of them.
   *
   * ⚠️ `currentURL` IS ACCEPTED AND DELIBERATELY NOT FORWARDED, hence the underscore. [:L309] declares
   * it and [:L312] passes it into the smart list, where it exists to build saved-state and paging URLs
   * for the CFML view layer [org/Hibachi/HibachiSmartList.cfc:L39]. `../ports/SmartListQueryPort`
   * deliberately excludes it from both `SmartListInput` and `SmartListQuery`: URL construction is a
   * presentation concern and there is no view layer in a headless service (AAP 0.3.4). ⛔ The parameter
   * is KEPT rather than deleted so the signature stays call-compatible with the legacy, which the
   * project's lint configuration anticipates by exempting `_`-prefixed parameters.
   *
   * ⚠️ THE SOURCE USES `getSkuDAO().getSmartList` [:L312], NOT the global Hibachi DAO — so the query is
   * expressed through the typed port, never as SQL (S2).
   *
   * TEST PROVENANCE: NET-NEW.
   */
  public async getSkuSmartList(
    data?: SmartListInput,
    _currentURL?: string,
  ): Promise<SmartListResult<Sku>> {
    return this.smartListQueryPort.execute<Sku>(buildSkuSmartListQuery(data));
  }
}
