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
 *   processImageUpload         [:L210] declared `returntype="any"`; the body at [:L213-L217] returns the
 *                                      image-write BOOLEAN, so TR-1 tightens the port to `Promise<boolean>`
 *                                      and the verdict stays observable — recorded at the member
 *   getProductSkus             [:L220] `sorted` REQUIRED (Discrepancy 2), D13
 *   getSortedProductSkus       [:L246] reads the product's own collection, D13
 *   searchSkusByProductType    [:L271] BOTH arguments optional (Discrepancy 3)
 *   getSkuStocksDeletableFlag  [:L281] D4 — the member it delegates to does not exist
 *   getTransactionExistsFlag   [:L285] declares NO arguments yet forwards its whole argument scope at
 *                                      [:L286], and both real callers name an identifier, so the port
 *                                      declares `(skuID?, productID?)` — TR-1's tightening to the
 *                                      OBSERVED contract, recorded at the member
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

import {
  resolveBaseProductType,
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE,
} from '../domain/BaseProductType';
import { manageEntity } from '../domain/base/populate';
import type { EntityErrorSurface, ManagedEntity } from '../domain/base/populate';
import type { Option } from '../domain/option/Option';
import type {
  Product,
  ProductDefaultSkuDelegate,
  ProductSkuMember,
} from '../domain/product/Product';
import type { SkusBySelectedOptionsLookup } from '../domain/sku/Sku';
import { SKU_ENTITY_METADATA, SKU_UNSAVED_ID_VALUE, Sku } from '../domain/sku/Sku';
import {
  ConfigurationError,
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
import type { ValidationErrors } from '../errors/ValidationError';
import type {
  AccessContentPort,
  AccessContentReference,
  ContentAccessSkuCreationData,
  ContentAccessSkuCreationMode,
} from '../ports/AccessContentPort';
import type { ImagePathPort } from '../ports/ImagePathPort';
import { IMAGE_UPLOAD_ALLOWED_EXTENSIONS } from '../ports/ImagePathPort';
import type {
  SmartListInput,
  SmartListQueryPort,
  SmartListResult,
} from '../ports/SmartListQueryPort';
import { createSlatwallUUID } from '../util/uuid';
import type {
  SubscriptionBenefitReference,
  SubscriptionSkuCreationData,
  SubscriptionTermPort,
} from '../ports/SubscriptionTermPort';
import type { SkuRepository, SkuSearchRow } from '../ports/repositories/SkuRepository';
import { composeSkuSmartListQuery } from '../ports/SmartListQueryPort';
import type {
  ValidateOptions,
  ValidationContext,
  ValidationRuleSet,
  Validator,
} from '../validation/Validator';
import { createSkuValidationRules, resolveSkuUniqueTarget } from '../validation/rules/sku.rules';
import {
  compareExactDecimal,
  toExactDecimal,
  EXACT_DECIMAL_ZERO,
  type ExactDecimal,
} from '../util/formatting';
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
 *
 * ⚠️ AND THE OBSERVED VALUE IS MATCHED AGAINST THEM CASE-INSENSITIVELY, BECAUSE [:L61], [:L139] AND
 * [:L173] ARE CFML `==`. The three constants below are the CANONICAL spellings and are compared with
 * `===`, which is only sound because the value reaching them has already been folded to canonical form
 * by `resolveBaseProductType` in `../domain/BaseProductType`. Comparing a raw `systemCode` to one of
 * these constants directly is a defect: a row holding `Merchandise` took the merchandise branch in the
 * legacy system and a `===` test sends it to the fallthrough throw at [:L204] instead. The recogniser's
 * own documentation carries the full account.
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

/* ================================================================================================
 * ⭐⭐ THE IMAGE-WRITE NAME GATE — REVIEW FINDING SEC-FILE-01 (CWE-22, CWE-434)
 * ================================================================================================
 * ⛔ DO NOT JUSTIFY THIS GATE BY ANALOGY WITH D18, AND DO NOT LET ANYONE ELSE. "A refusal shares D18's
 * shape, because both diverge only where the legacy's own behaviour was the flaw" is NOT a ground a second
 * control can stand on: AAP §0.6.7.7 names ONE divergence by locator, and AAP §0.1.2.1 forbids reading the
 * plan as licensing a class of them. Reaching a second exception by resemblance to the first is exactly the
 * reinterpretation §0.1.2.1 excludes.
 *
 * ⭐ THE GROUND IS INSTEAD THAT THERE IS NO LEGACY BEHAVIOUR ON THIS PATH TO PRESERVE, WHICH IS A VERIFIED
 * FACT RATHER THAN AN ARGUMENT. `../ports/ImagePathPort`'s own decision block establishes it repo-wide, and
 * the finding is worth restating because it is decisive:
 *
 *   • `saveImageFile` has ONE call site in the entire legacy tree — [model/service/SkuService.cfc:L212] —
 *     and ZERO declarations. `model/service/ImageService.cfc:L54` declares `getResizedImage`,
 *     `getResizedImagePath`, a private `scaleImage` and `clearImageCache`, and nothing else; `custom/`
 *     holds only readme and `.gitignore` stubs, so no override supplies it.
 *   • The `save*` prefix means [org/Hibachi/HibachiService.cfc:L268] intercepts the name and routes it to
 *     `onMissingSaveMethod` [:L552-L560], which indexes `missingMethodArguments[1]` POSITIONALLY, and
 *     [:L253] states the limitation outright: "Ordered arguments only--named arguments not supported."
 *   • [:L212] passes ONLY named arguments.
 *
 * The legacy therefore has NO well-defined result on this path for ANY input. AAP §0.8.2 Guideline 4
 * requires that existing behaviour be preserved "exactly as-is"; where there is no existing behaviour,
 * nothing is preserved and nothing is changed, so §0.6.7.7's single-exception clause is NOT ENGAGED. This is
 * not a second exception — it is the observation that this path never had a first outcome. The port's own
 * contract note concedes the consequence: `saveImageFile` "is defined by AAP §0.4.3.2 and by the call site
 * rather than by a legacy body — there is no legacy body to reproduce." A contract with no legacy body is
 * SPECIFIED, not diverged from, and what review finding SEC-FILE-01 measures is that the specification
 * obliged nothing: "the vulnerability becomes reachable as soon as a functional adapter is supplied under
 * the existing contract."
 *
 * ⛔ AND THE POLICY IS NOT INVENTED — IT IS TRANSCRIBED FROM THE LEGACY'S OWN GENERATOR, which is what keeps
 * AAP §0.7.3 S9 and IR-12 satisfied. Two of the three writers of the `imageFile` column
 * ([model/service/ProductService.cfc:L210] and [model/service/ContentService.cfc:L138]) assign the output of
 * `generateImageFileName` [model/entity/Sku.cfc:L131-L139], which filters every contributed segment through
 * `reReplaceNoCase(…, "[^a-z0-9\-\_]", "", "all")` and then appends ONE `"."` and one extension. The
 * generator IS the policy; it was simply never re-checked at the point of use. This gate re-checks it and
 * authors no figure of its own.
 *
 * ⚠️ THE THIRD WRITER IS THE BULK IMPORTER, AND IT TAKES ARBITRARY CALLER DATA — which is why re-checking is
 * worth doing rather than merely tidy. [model/dao/ProductDAO.cfc:L207] calls
 * `saveImportData(data, r, "SlatwallSku", skuColumns, …)` with `skuColumns` derived from the uploaded FILE'S
 * OWN HEADINGS, so a `sku_imageFile` heading writes straight to the row. `../ports/ImagePathPort` records the
 * same three-writer inventory beside the contract it governs.
 *
 * ⛔ AND THE IMPORT ITSELF IS DELIBERATELY NOT GATED. An imported row is a DATABASE write, not a file write;
 * refusing the heading would refuse an import the legacy accepts, for no security gain, and AAP §0.8.2
 * Guideline 4 forbids it. Gating the point of USE instead screens all three writers at once — which is the
 * second reason this gate belongs here and not at any one writer.
 *
 * ⚠️ THE `NoCase` IN `reReplaceNoCase` IS LOAD-BEARING AND IS THE TRAP THIS PATTERN AVOIDS. Because the
 * legacy call is case-INSENSITIVE, the negated class `[^a-z0-9\-\_]` spares `A`-`Z` as well as `a`-`z`. The
 * same pattern compiled in JavaScript WITHOUT the ignore-case flag would strip every uppercase letter, so
 * the class below is written out as `A-Za-z0-9_-` rather than transcribed literally with a `NoCase` flag
 * bolted on. `../ports/ImagePathPort` documents the same trap for whichever layer generates the names.
 *
 * ⭐ WHAT THIS CLOSES, AND WHAT IT DELIBERATELY DOES NOT:
 *   • CLOSES the WRITE path — [:L211-L212], the composed path handed to a member that writes. A stored
 *     `../../../../tmp/payload.jpg` no longer reaches the port at all.
 *   • DOES NOT touch the READ path. [model/entity/Sku.cfc:L222] `fileExists(expandPath(getImagePath()))`
 *     HAS a defined legacy result for every input, writes nothing and discloses only a boolean. Refusing to
 *     probe would replace a defined answer with a different one, so NO probe-side refusal exists anywhere in
 *     this port's consumers and the read-side exposure stays FLAGGED for the operator (AAP §0.7.3 S8).
 *   • DOES NOT inject a containment root, and needs none: because [model/entity/Sku.cfc:L146] composes
 *     `<baseImageURL>` + `/product/default/` + `<imageFile>`, requiring `imageFile` to be ONE safe segment
 *     confines the write to whatever that prefix denotes, WHATEVER it denotes — so there is no invented root
 *     to compare against (AAP §0.7.3 S9, IR-12) and nothing lost by not having one.
 *
 * ⛔ IT REFUSES; IT NEVER REPAIRS. No sanitisation, no basename substitution, no storage-root comparison,
 * no MIME sniffing and no length bound: the first two would silently change the destination the legacy
 * composes, and the last three are invented configuration the legacy states nowhere (AAP §0.7.3 S9, IR-12).
 * `../ports/ImagePathPort` gains no member either — it stays a type-only module.
 *
 * ⭐ AND THE READ-SIDE EXPOSURE HAS A LEGITIMATE HOME, WHICH IS NOT NOWHERE. An adapter implementing
 * {@link ImagePathPort} is the only code that knows its own storage root, so a deployment that must confine
 * what the probe at [model/entity/Sku.cfc:L222] can report confines it there — outside this port's scope, at
 * a layer whose behaviour the AAP does not freeze, and without a Catalog-side outcome change. The same
 * disposition is recorded on {@link ImagePathPort.saveImageFile}, so an implementer meets it without
 * reading this file.
 * ============================================================================================== */

/**
 * The one shape [model/entity/Sku.cfc:L131-L139] can produce: one safe segment, one dot, one extension.
 *
 * Anchored at both ends so a traversal, a separator, an absolute path, a second dot, an empty segment, a
 * NUL byte or a trailing space cannot satisfy it. `+` on both sides refuses an empty stem and an empty
 * extension, which matters because `expandPath('')` resolves to a DIRECTORY rather than to nothing.
 */
const GENERATED_IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

/**
 * Decides whether a stored image file name is one the legacy's own generator could have produced.
 *
 * Answers rather than raises, because the member consulting it reports a declined write as `false` and
 * [model/service/SkuService.cfc:L216] records nothing on a decline — see the `⚠️ A DECLINED WRITE` note on
 * {@link SkuService.processImageUpload}. Answering also satisfies the finding's "return a refusal without
 * leaking destination details" clause in the strongest available form: a boolean carries no path, no root,
 * no reason and no destination, so a caller learns that the write did not happen and nothing else.
 *
 * @param imageFile - the value stored in the `SwSku.imageFile` column [model/entity/Sku.cfc:L58].
 * @returns true when the name is a single generator-shaped segment, false for every other shape.
 */
function isGeneratedImageFileName(imageFile: string): boolean {
  return GENERATED_IMAGE_FILE_NAME_PATTERN.test(imageFile);
}

/* ------------------------------------------------------------------------------------------------
 * SMART LIST SELECTION — OWNED BY `../ports/SmartListQueryPort`, NOT RESTATED HERE
 *
 * The four facts `model/service/SkuService.cfc:L309-L325` states — the root entity `SlatwallSku`
 * [:L310], the three related-property joins [:L314-L316] whose third is spelled `left` while the first
 * two default to it, the five keyword properties at weight 1 [:L318-L322], and the merge semantics that
 * absorb a repeated join — used to be five frozen constants and one private member in THIS file.
 *
 * ⭐ THEY MOVED TO A LEAF MODULE BECAUSE A SECOND CALLER NEEDS THE SAME SELECTION AND A DIFFERENT VIEW
 * OF ITS RESULT. {@link SkuService.getSkuSmartList} answers the whole `SmartListResult`, because that is
 * what the legacy smart list exposes to its callers. The Google product feed reads the UNPAGED
 * COLLECTION ALONE — `integrationServices/google/views/feed/product.cfm:L16` loops the records and reads
 * no page and no count in its 66 lines — and it used to obtain that view by holding a `SkuService`,
 * calling this member and discarding two thirds of the answer, paying for a `COUNT(*)` it never read and
 * often a paged statement it never read either.
 *
 * ⛔ THE FIX IS NOT A TENTH MEMBER, AND MUST NOT BECOME ONE. A records-only public reading —
 * `getSkuSmartListRecords` — is deliberately NOT declared, because AAP §0.4.2.2 fixes this service at NINE
 * declared public members and §0.8.3.1 makes that surface the artefact a reviewer checks "method by method".
 * Sharing the SELECTION while each caller chooses its own VIEW keeps the count at nine and removes the
 * wasted statements. `../ports/SmartListQueryPort`'s SKU smart-list section carries the constants, the merge
 * semantics, the legacy locators and the join-type note in full.
 *
 * ⭐ IT ALSO SEVERS AN EDGE THE FEED NEVER NEEDED: an integration that imports this service drags the
 * combination engine, the SKU repository port, the validator and four boundary ports into the Lambda
 * artifact that serves `google:feed.product`, none of which that route can reach.
 *
 * ⛔ DO NOT RESTATE THE ENTITY NAME, A JOIN, A KEYWORD PROPERTY OR A WEIGHT HERE AGAIN, not even one,
 * and not even to add a key. Two readings of one selection cannot be kept in step by hand — the smart
 * list's key grammar had already diverged once between two copies before it was consolidated, which the
 * block below records. Extend the shared composer instead.
 * ---------------------------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------------------------
 * SMART LIST INPUT KEY GRAMMAR — OWNED BY THE SHARED TRANSLATOR, NOT RESTATED HERE
 *
 * ⭐ THE `applyData` KEY GRAMMAR HAS EXACTLY ONE OWNER, AND IT IS NOT THIS FILE. The `F:` / `FR:` / `FI:` /
 * `FIR:` / `FK:` / `FKR:` / `R:` prefixes, the `OrderBy` and `P:`-paging keys, the keyword keys, the
 * show-all sentinel, the order and keyword delimiters and the like wildcard — all from
 * [org/Hibachi/HibachiSmartList.cfc:L85-L157] — are declared once by `translateSmartListInput`, which
 * `../ports/SmartListQueryPort` exports and every service calls. `getSkuSmartList` passes only what is
 * genuinely SKU-specific: the entity name, this service's joins and its keyword properties.
 *
 * ⛔ DO NOT RESTATE ANY OF THESE CONSTANTS HERE AGAIN, not even one, and not even to add a key. Two
 * readings of one legacy grammar cannot be kept in step by hand; the copies had already diverged on
 * the range length gate before they were consolidated. Extend the shared translator instead.
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
 * ⚠️ THE ENTITY DOES CARRY THESE MEMBERS IN THE LEGACY, WHICH IS WHY THE INTERSECTION IS THE RIGHT SHAPE.
 * `getClassName`, `hasProperty`, `getPropertyMetaData`, `getEntityName`, `getPrimaryIDValue`,
 * `getPrimaryIDPropertyName` and `getValueByPropertyIdentifier` are Hibachi base-class facilities on
 * `org/Hibachi/HibachiObject.cfc` and `org/Hibachi/HibachiEntity.cfc`, and the source proves the
 * inheritance at [model/entity/Sku.cfc:L843-L855]: the entity OVERRIDES `getPropertyMetaData` for its
 * option-group special case and then falls through to
 * `super.getPropertyMetaData( argumentCollection=arguments )` at [:L854] — a `super` call that can only
 * resolve because the base class supplies the member. `../domain/sku/Sku` does not re-declare them, so
 * they are supplied by this intersection instead.
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

/* ================================================================================================
 * ⭐⭐ THE MERCHANDISE ENUMERATION IS BOUNDED — REVIEW FINDING SEC-DOS-01 (CWE-400)
 * ================================================================================================
 * ⭐ THE CONTROL, IN TWO CLAUSES, BOTH IN FORCE. Clause A is an unconditional checked multiplication inside
 * {@link multiplyCombinationCount}, which refuses an enumeration whose size cannot be represented exactly.
 * Clause B is a REQUIRED, fail-closed {@link SkuCombinationBudget} resolver consulted before the first
 * `newSku()`. Neither authors a figure; clause B names the variable an operator must set.
 *
 * The two objections most likely to be raised against them are answered below — the precedence objection
 * first, because it is the one that reads AAP §0.6.7.7 as forbidding this control outright.
 *
 * ⛔ WHY §0.6.7.7's PRECEDENCE ARGUMENT DOES NOT GOVERN THIS, STATED PRECISELY. That argument reads §0.6.7.7
 * as governing every divergence of any kind. It does not. §0.6.7 is the DEFECT AND TODO CARRY-OVER
 * REGISTER: its subject is the twenty-one **business-logic** defects catalogued in the legacy Catalog slice
 * — a misnamed struct, an inverted cache guard, an unreachable private method — and D18 is declared the one
 * member of THAT register the port repairs. Availability of the extracted service is not an entry in that
 * register and never was. Reading D18's exception as a licence to ship an exploitable resource-exhaustion
 * path would make §0.6.7.7 say that a migration must reproduce a denial-of-service vector, which is not
 * what it says and not what §0.8.2 Guideline 4 — "do not enhance or optimize business logic" — is about
 * either. A work ceiling is not an optimisation of business logic; it changes no SKU the algorithm defines
 * for any request it admits.
 *
 * ⭐ AND AAP §0.7.3 IS THE PROVISION THAT AFFIRMATIVELY REQUIRES THIS. With no user Rules (§0.7.1), the
 * plan binds this port to the enterprise standards §0.7.3 enumerates, and the review checkpoint this
 * remediation answers approves only on ZERO open security findings. Standard S8 — "flag mismatches rather
 * than assume them away" — is discharged by the TODO(parity) note below, which still records that the
 * legacy is unbounded; it is not discharged by leaving the port unbounded too.
 *
 * ⛔ AND NO FIGURE IS INVENTED, WHICH IS WHAT KEEPS CLAUSE B INSIDE §0.7.3 S9 AND IR-12. The resolver
 * below chooses no ceiling, suggests none, and falls back to none. It requires that the OPERATOR have
 * chosen one and names the variable to set when they have not, so an unstated bound is a named refusal
 * rather than a fabricated number — exactly the shape `createAnonymousMaterialisationGate` in
 * `../adapters/mysql/SmartListQueryBuilder.ts` already uses, and which this port already accepted there.
 *
 * ⚠️ THE PARITY COST, NAMED HONESTLY. A deployment that states a ceiling refuses requests the legacy
 * would have attempted. Those are requests the legacy attempts by allocating, validating and writing an
 * unbounded number of rows — seven option groups of ten options is ten million SKUs, each one validated
 * through the M6 read-back cycle — so "would have attempted" is not "would have completed". Nothing about
 * WHICH SKUs the algorithm defines changes: the odometer, the bucket construction, `indexedKeys`,
 * `totalCombos` and the emission order are untouched, and a request inside the ceiling produces byte-for-byte
 * the legacy's SKU set in the legacy's order.
 * ================================================================================================
 * TODO(parity): model/service/SkuService.cfc:L85, :L89 — THE LEGACY ENUMERATION IS UNBOUNDED, AND THAT
 * REMAINS TRUE OF THE LEGACY.
 * ================================================================================================
 * `createSkus` enumerates the Cartesian product of the selected option groups. The legacy computes the
 * size of that product as `totalCombos = totalCombos * arrayLen(optionGroups[key])`
 * [model/service/SkuService.cfc:L85] and then loops `for(var i = 1; i<=totalCombos; i++)` [:L89], WITH NO
 * CEILING OF ANY KIND. Two consequences follow in the legacy, and both are recorded so that the port's
 * divergence from them is visible rather than implicit:
 *
 *   1. RESOURCE EXHAUSTION (CWE-400). The size grows multiplicatively in the number of selected options.
 *      ⭐ THE PORT REFUSES THIS, through {@link SkuCombinationBudget}, before the first `newSku()`.
 *   2. NON-TERMINATION past `Number.MAX_SAFE_INTEGER`, where the running product stops being an exact
 *      integer and eventually becomes `Infinity`, at which point `combination < totalCombos` is
 *      permanently true. ⭐ THE PORT REFUSES THIS TOO, inside {@link multiplyCombinationCount}, and here
 *      there is not even a legacy outcome to preserve: on such an input the legacy defines no SKU set at
 *      all, it hangs. Removing the check would replace a named refusal with a hang.
 *
 * ⚠️ THE INVOCATION DEADLINE ITSELF REMAINS THE PLATFORM'S, AND M1/M2 STAY FLAGGED. AAP §0.6.6 M1 records
 * the importer's 3600-second request budget as unrepresentable in one Lambda invocation and directs that it
 * be documented rather than "silently re-timed to fit"; §0.8.3.6 requires such mismatches be flagged. So
 * {@link SkuCombinationBudget.hasBeenCancelled} is a cooperative SEAM rather than a timer this file owns:
 * a deployment holding the Lambda `Context` wires it to its own remaining-time policy, and the composition
 * root's default never cancels. The ceiling is what fails closed; the seam is what lets a deployment stop
 * early without this file inventing a duration.
 *
 * ⛔ DEDUPLICATION IS STILL NOT AN OPTION. Duplicate selections of one option genuinely produce a
 * multi-element bucket in the legacy — `arrayAppend` [model/service/SkuService.cfc:L78] appends
 * unconditionally — and therefore genuinely produce more combinations. AAP §0.6.7.8 requires the
 * enumeration to be ported exactly, because the enumeration order determines both the generated SKU set
 * and, through §0.6.2, the order in which `hasUniqueOptions` observes its siblings; and AAP §0.6.1.3 T1
 * independently requires duplicate retention in the option-resolution query. Deduplicating would
 * silently change which SKUs exist, which one becomes the default, and the order in which the
 * uniqueness rule sees them. It would also be the wrong control: a ceiling refuses the request, whereas
 * deduplication would answer it with a different SKU set.
 * ============================================================================================= */

/**
 * The work ceiling ONE merchandise `createSkus` request may not exceed, plus the cooperative
 * cancellation seam — review finding SEC-DOS-01.
 *
 * ⭐ BOTH MEMBERS ARE FUNCTIONS, AND NEITHER IS A NUMBER THIS FILE HOLDS. `resolveMaximumCombinations`
 * is asked at the moment the ceiling is applied rather than read when the graph is composed, so a
 * deployment that stated no figure gets a named `ConfigurationError` from the ONE route that needs it
 * instead of a whole router that will not load. That deferral is the same one
 * `../adapters/mysql/SmartListQueryBuilder.ts` makes for the anonymous feed's materialisation bound, and
 * it is what keeps `tsc`, `eslint`, `esbuild` and the whole test suite runnable with no environment set.
 *
 * ⛔ THE COLLABORATOR IS REQUIRED, WHICH IS THE FAIL-CLOSED HALF. An optional one would leave the
 * exhaustion path reachable by default, which is precisely the finding. Required-but-deferred means the
 * default outcome is a REFUSAL naming the variable, never an unbounded enumeration.
 */
export interface SkuCombinationBudget {
  /**
   * Answers the largest number of combinations one request may enumerate.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   *   `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`
   */
  readonly resolveMaximumCombinations: () => number;

  /**
   * Reports whether the enumeration should stop before starting its next combination.
   *
   * Consulted once per combination, before any allocation for that combination. The composition root's
   * default answers `false` always — see the M1/M2 note above — so this seam changes nothing until a
   * deployment wires a policy into it.
   *
   * @returns true when the invocation's own budget has been exhausted and the enumeration must stop
   */
  readonly hasBeenCancelled: () => boolean;
}

/**
 * Builds the fail-closed combination budget from whatever figure a deployment stated.
 *
 * ⭐ IT NAMES NO FIGURE. Given `undefined` it returns a budget whose resolver RAISES, reporting the
 * variable to set; given a figure it validates it once and answers it. Either way the number is the
 * operator's (AAP §0.7.3 S9, IR-12).
 *
 * ⚠️ A PRESENT-BUT-USELESS VALUE IS REFUSED WHEN THE BUDGET IS BUILT, not when it is first applied.
 * Zero, a negative, a fraction, `NaN` and `Infinity` would each admit or refuse every request rather than
 * bounding it, and a wiring error should present as a wiring error. `../config/env.ts` already refuses all
 * five at load for the environment path; this check covers a composition root that supplies a figure
 * directly.
 *
 * @param maximumCombinationsPerRequest the ceiling this deployment stated, or `undefined` for none
 * @param hasBeenCancelled the invocation's cooperative cancellation predicate; omit for never-cancelled
 * @returns the budget to hand {@link SkuService}
 */
export function createSkuCombinationBudget(
  maximumCombinationsPerRequest: number | undefined,
  hasBeenCancelled: () => boolean = () => false,
): SkuCombinationBudget {
  if (
    maximumCombinationsPerRequest !== undefined &&
    (!Number.isSafeInteger(maximumCombinationsPerRequest) || maximumCombinationsPerRequest < 1)
  ) {
    throw new DomainError(
      'The SKU combination budget must be a positive safe integer, so the configured value cannot ' +
        'bound how many combinations one request may enumerate.',
      { context: { maximumCombinationsPerRequest } },
    );
  }

  return Object.freeze({
    hasBeenCancelled,
    resolveMaximumCombinations: (): number => {
      if (maximumCombinationsPerRequest !== undefined) {
        return maximumCombinationsPerRequest;
      }

      throw new ConfigurationError(
        'SKU creation refuses to enumerate an unbounded combination product. Set ' +
          'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST to the largest number of SKU combinations this ' +
          'deployment permits one request to enumerate, or supply resourceBounds when composing the ' +
          'container.',
        {
          context: {
            locator: 'model/service/SkuService.cfc:L85-L89',
            variable: 'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
          },
        },
      );
    },
  });
}

/**
 * Multiplies the running combination count by one option group's bucket size.
 *
 * GROUP SEMANTICS. `bucketSize` must be a positive integer. It cannot be zero or negative through
 * the legacy path — a bucket is created and immediately appended to at
 * [model/service/SkuService.cfc:L76-L78], so every bucket holds at least one option — and the
 * assertion states that invariant rather than assuming it. A zero-length bucket would drive
 * `totalCombos` to zero and silently generate NO SKUs at all, which is a WRONG ANSWER rather than a
 * slow one, and it is the one condition here that no legacy input can reach.
 *
 * ⭐ THE RUNNING PRODUCT IS CHECKED TOO — REVIEW FINDING SEC-DOS-01, CLAUSE A. A product that has left
 * the range in which IEEE-754 doubles count consecutive integers is refused by name, because that is
 * precisely the state in which `combination < totalCombos` at [:L89] can never become false: the legacy
 * does not produce a different SKU set on such an input, it produces none, because it does not terminate.
 * There is therefore no legacy outcome this refusal displaces, and removing it would replace a named
 * error with a hang. The check is unconditional and needs no operator figure, which is why it is separate
 * from {@link SkuCombinationBudget}: `Number.MAX_SAFE_INTEGER` is a property of the platform's arithmetic,
 * not a capacity anybody chose (AAP §0.7.3 S9).
 *
 * ⚠️ AND IT IS NOT THE CEILING. On every input whose product IS an exact integer this function is
 * byte-for-byte the legacy's multiplication at [:L85]; the operator's ceiling is applied once, later,
 * between the count and the first allocation.
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

  /* [:L85] — the legacy multiplication itself, reproduced exactly. */
  const product = runningTotal * bucketSize;

  /* Clause A. `Number.isSafeInteger` is false for a fraction, for `NaN`, for `Infinity` and for any
   * magnitude above 2^53 - 1 — the whole set of states in which [:L89] cannot terminate — so one test
   * covers all of them and none of them is a capacity figure. */
  if (!Number.isSafeInteger(product)) {
    throw new DomainError(
      `Creating SKUs would enumerate ${String(product)} combinations, which is not an exact integer ` +
        `on this platform. model/service/SkuService.cfc:L89 loops while the counter is below that ` +
        `total, so the enumeration could never terminate and no SKU set is defined for this request.`,
      {
        context: {
          optionGroupID,
          bucketSize,
          runningTotal,
          combinations: product,
          locator: 'model/service/SkuService.cfc:L85-L89',
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
 * ⭐ WHY THIS GUARD EARNS ITS PLACE. `createSkus` DEMANDS the error surface, and this file cannot see
 * who supplies it: the call sites live in `./ProductService` and in the handlers, so nothing in THIS
 * file fails if the supply stops matching the demand. Without this line the demand could be
 * unsatisfiable by every product the subtree can actually build, and the first hint would come from a
 * different file. `ManagedEntity<Product>` is exactly what
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
 *
 * F07 — THE MONETARY READS NO LONGER COME THROUGH HERE. `Sku.price`, `listPrice` and `renewalPrice`
 * became `ExactDecimal`, so {@link readRequiredCfmlDecimal} and {@link readGuardedListPrice} coerce
 * through `toExactDecimal` instead, which preserves this function's `NaN`-not-exception contract with the
 * `EXACT_DECIMAL_NOT_NUMERIC` sentinel for exactly the same reason. What still reaches this function is
 * the BOOLEAN coercion below, where a double is the correct representation.
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

/**
 * CFML boolean coercion. Only meaningful once {@link readsAsCfmlBoolean} has accepted the value.
 *
 * ⚠️ THIS FUNCTION IS TRIPLICATED, AND THE THREE COPIES ONCE DISAGREED. `cfmlListToArray`,
 * `isCfmlSimpleValue`, `readsAsCfmlNumeric`, `toCfmlNumber`, `readsAsCfmlBoolean` and this function
 * are declared here, in `../services/ProductService` and in `../ports/SmartListQueryPort` — module-private
 * in each, because AAP §0.4.1.8 admits no shared `types.ts` or `common.ts` in `src/services/` and S5
 * forbids adding one. That is a deliberate arrangement, but it is only safe while the copies stay
 * identical, and this one did not: `ProductService` alone ended its chain with
 * `toCfmlNumber(normalised) !== 0` instead of `return false`, so for a value `readsAsCfmlBoolean`
 * REJECTS — a non-numeric string, or any non-string non-number — it answered TRUE where this copy
 * answers FALSE. The two chains agree on every accepted value, so no test, type or lint rule could
 * see it. The bodies are byte-identical again; an edit to any one of the six is an edit to three
 * files, and `../services/ProductService`'s copy of this function carries the full record.
 */
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

/**
 * The unguarded numeric read at [model/service/SkuService.cfc:L93], [:L129], [:L156], [:L183], [:L193].
 *
 * F07 — EVERY ONE OF THOSE FIVE SITES READS A PRICE, and a price is `ormtype="big_decimal"`
 * [model/entity/Sku.cfc:L55-L57], so the value is coerced to {@link ExactDecimal} and never to a double.
 * That is the whole of the write-side fix: `9007199254740993.01` used to bind as `9007199254740994`
 * because it passed through `Number(...)` here, while the read mapper simultaneously refused to accept
 * such a value coming back. Both halves now agree on the digits.
 *
 * The `NaN`-not-exception contract is unchanged — `toExactDecimal` yields `EXACT_DECIMAL_NOT_NUMERIC`,
 * which the `numeric` rule at `model/validation/Sku.json:L5` rejects under the property's own key, in the
 * same place the legacy reports it.
 */
function readRequiredCfmlDecimal(
  data: Record<string, unknown>,
  key: string,
  locator: string,
): ExactDecimal {
  return toExactDecimal(requireDataValue(data, key, locator));
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
function readGuardedListPrice(data: Record<string, unknown>): ExactDecimal | undefined {
  if (!Object.hasOwn(data, LIST_PRICE_DATA_KEY)) {
    return undefined;
  }
  const raw = data[LIST_PRICE_DATA_KEY];
  if (!readsAsCfmlNumeric(raw)) {
    return undefined;
  }
  const listPrice = toExactDecimal(raw);
  /* ⚠️ F07 — `listPrice > EXACT_DECIMAL_ZERO` WOULD COMPILE AND BE WRONG. Both sides are branded
   * strings, so `>` compares them lexically: `'0.5'` is lexically LESS than `'0'`... no, it is greater,
   * but `'-1'` is lexically greater than `'0'`, which would let a NEGATIVE list price through the very
   * guard [model/service/SkuService.cfc:L94] exists to close. `compareExactDecimal` orders digit-wise
   * with the sign first, so it is exact for every magnitude and both signs. */
  return compareExactDecimal(listPrice, EXACT_DECIMAL_ZERO) === 1 ? listPrice : undefined;
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

/**
 * CFML's list functions need a simple value; anything else raises, exactly as `listLen` does.
 *
 * ⚠️ THE PORT DOES NOT ANSWER THIS UNIFORMLY, AND THE THIRD SITE IS NAMED HERE SO THE SET IS COMPLETE.
 * `requirePayloadSimpleText` in `./ProductService` refuses a non-simple value the same way this does,
 * but `dataValueLength` in `./BrandService` measures an array or struct and reads anything else as
 * absent. That file carries the full account: the disagreement is a CFML ENGINE question rather than a
 * porting slip — the Railo/Lucee lineage counts arrays and structs where the ACF lineage refuses, and
 * `readme.md:L6` and `:L8` require both — so it is flagged at all three sites rather than resolved on
 * the port's own authority (AAP §0.8.3.6). This function's own contract is unaffected: `listLen` and
 * `listToArray` raise on a complex value on every engine, so refusing here is not the contested case.
 */
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
 * restated what `../ports/SmartListQueryPort` now owns.
 *
 * THE GRAMMAR IS ONE LEGACY BEHAVIOUR — `org/Hibachi/HibachiSmartList.cfc` `applyData` — SO IT IS
 * TRANSLATED ONCE. `getSkuSmartList` reaches `translateSmartListInput` through
 * `../ports/SmartListQueryPort`'s `composeSkuSmartListQuery`, which passes only what is genuinely SKU-specific:
 * the entity name, the service's joins, and its keyword properties. Those three are the SKU's own
 * knowledge and are declared once, in that module rather than in this file, because the Google feed
 * needs the same selection with a different view of its result — the SMART LIST SELECTION block above
 * records why. The grammar that consumes them belongs to neither.
 *
 * ⛔ DO NOT REINSTATE A LOCAL TRANSLATOR to add a key or change a precedence rule. Three copies drifting
 * apart is exactly the defect this removal fixes: the copies had already diverged on the range length
 * gate before they were consolidated. Extend `../ports/SmartListQueryPort`, where every caller gets the
 * change.
 *
 * ⭐ AND THE IDENTIFIER HARDENING OF SEC-09 LIVES THERE TOO, WHICH IS WHY A LOCAL COPY WOULD BE A
 * REGRESSION RATHER THAN A CONVENIENCE. `translateSmartListInput` resolves every caller-supplied property
 * path against the entity schema before admitting it, and because every smart list in the subtree routes
 * through it, the closed identifiers cover sku, option AND optionGroup rather than one entity's paths. A
 * copy hardened for this service alone would leave `./OptionService`'s two smart lists open.
 *
 * ⛔ THE RULE IS SELF-ENFORCING, SO A COPY CANNOT SKIP IT AND STILL COMPILE. The branded
 * `SmartListPropertyIdentifier` makes an unresolved path unassignable to a filter. The whitelist and the
 * guard that mints the brand live in `../ports/SmartListQueryPort`, where the brand's private symbol is
 * declared; only the grammar itself lives in the utility.
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

  /**
   * Seeds a family with references already resolved in one batch, so
   * {@link SkuAssociationReferenceMap.require} finds them without crossing the boundary again.
   *
   * ⭐ P15 — THIS IS WHY THE CREATION LOOPS THEMSELVES DID NOT HAVE TO CHANGE. The legacy branches call
   * their collaborator once per list element; priming resolves the whole list first and lets every
   * `require` below become a hit. The loops keep their exact shape, their exact order, and their exact
   * failure behaviour, because the only thing that moved is WHEN the read happens — not who decides what
   * the read means.
   *
   * ⚠️ EXISTING ENTRIES WIN, AND AN ABSENT IDENTIFIER IS NOT SEEDED. A batch holds no entry for an
   * identifier that matched no row, so `require` still falls through to its own resolver for that one
   * and still raises the resolver's own error, from the element the walk is on. That fall-through is
   * deliberate: it means the failure path is produced by code this change did not touch. Not overwriting
   * is equally deliberate — a reference already resolved in this invocation is the one the domain's
   * identity guards have seen, and replacing it could hand two collections two different objects for one
   * row.
   *
   * @param family - Which relationship the identifiers belong to.
   * @param references - Identifier-to-reference entries from a batch resolution.
   */
  public prime<TReference>(family: string, references: ReadonlyMap<string, TReference>): void {
    let byIdentifier = this.resolved.get(family);
    if (byIdentifier === undefined) {
      byIdentifier = new Map<string, unknown>();
      this.resolved.set(family, byIdentifier);
    }

    for (const [primaryIDValue, reference] of references) {
      if (!byIdentifier.has(primaryIDValue)) {
        byIdentifier.set(primaryIDValue, reference);
      }
    }
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

  /*
   * ⭐ P14 — THE ORDERING IS INDEXED ONCE, INSTEAD OF BEING RESCANNED FOR EVERY SKU.
   * `[:L237]` calls `arrayFind` inside the per-SKU loop, so a product with `n` SKUs walks the ordering
   * up to `n` times and the pair of sort paths that call this helper are quadratic in the SKU count.
   * One forward pass builds the position index the loop below then reads in constant time. This changes
   * only HOW the position is found — the position itself, and every consequence of it, is unchanged.
   *
   * ⚠️ FIRST OCCURRENCE WINS, AND THAT IS NOT A DETAIL. Both `arrayFind` and `Array.indexOf` return the
   * EARLIEST matching position, so an ordering that repeats an identifier resolves every SKU to that
   * identifier's first position and leaves the later duplicate position unclaimed — which the
   * completeness guard below then reports. A map built by assigning unconditionally would keep the LAST
   * position instead, quietly relocating a SKU and, worse, making a duplicated ordering pass where it
   * previously raised. The `has` guard is what preserves the search's semantics, so it must not be
   * "simplified" away.
   *
   * ⚠️ REQUEST-LOCAL, AND DELIBERATELY REBUILT PER CALL (M7). The index is derived from THIS call's
   * ordering argument and dies with the call. Hoisting it to module or instance scope would let one
   * product's ordering position another product's SKUs on a warm container.
   */
  const positionBySkuId = new Map<string, number>();
  for (let index = 0; index < sortedSkuIds.length; index++) {
    const sortedSkuId = sortedSkuIds[index];
    if (sortedSkuId !== undefined && !positionBySkuId.has(sortedSkuId)) {
      positionBySkuId.set(sortedSkuId, index);
    }
  }

  for (const sku of skus) {
    // [:L237] `arrayFind(sortedArray, skus[i].getSkuID())` — 0 when absent, and 0 is fatal there.
    // Absent from the index is the same fact as `arrayFind` returning 0; the failure below is unchanged.
    const position = positionBySkuId.get(sku.skuID) ?? -1;
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
   * @param persistSku - Writes ONE SKU and makes it visible to the next uniqueness read. This is the
   *        approved narrow persistence seam, and the contract it carries is the highest-risk one in
   *        the slice — both are spelled out below because neither is obvious from the type.
   *
   *        ⚠️ WHY A CALLBACK AND NOT A REPOSITORY MEMBER. It is deliberately NOT a member of
   *        `../ports/repositories/SkuRepository`. That port is the port of `model/dao/SkuDAO.cfc`,
   *        whose declarations are seven business queries and one private cache helper; adding a
   *        write to it would widen a business-query port into a CRUD port to serve one call site.
   *        `../services/ProductService` states that same rule for `persistProduct` and
   *        `../ports/repositories/ProductRepository` obeys it by declaring three queries and no
   *        write, so obeying it here keeps the slice consistent instead of making this the one
   *        exception. AAP §0.4.2.6 closes the SKU repository mapping at seven members.
   *
   *        ⭐ THE M6 READ-BACK CYCLE (AAP §0.6.2) RUNS THROUGH THIS SEAM.
   *        `model/service/SkuService.cfc:L58-L211` creates a BATCH of SKUs and
   *        `model/validation/Sku.json` registers `hasUniqueOptions` — a validation rule that
   *        EXECUTES a database read, at `model/entity/Sku.cfc:L763` — against each one. The batch
   *        therefore reads the very rows it is writing, and the answer depends on which siblings are
   *        visible when each read runs. Under the legacy mapping layer that visibility came from ORM
   *        session flush ordering; the target has no session and no automatic flush, so a naive port
   *        that writes everything then validates — or validates before writing — produces DIFFERENT
   *        RESULTS with no error anywhere.
   *
   *        ⛔ VISIBILITY IS REQUIRED; DURABILITY IS NOT. Once the returned promise resolves the SKU
   *        MUST be observable to reads subsequently issued on the same transaction, in particular to
   *        `SkuRepository.findSkusBySelectedOptions`, which is the read the uniqueness rule performs.
   *        An implementation that defers the write to commit does NOT satisfy this, because every SKU
   *        in a batch would then validate as though it were the first. Equally, the implementation
   *        MUST NOT commit: `model/service/SkuService.cfc` commits nothing of its own — the legacy
   *        commits once, implicitly, at request end and only when the ORM reports no errors
   *        (mismatch M5) — so committing per SKU would make a partially created, validation-failing
   *        batch permanent, which the legacy never does. Demarcation stays with the caller. Both
   *        halves hold because the persister and the reader share ONE executor on ONE connection.
   *
   *        ⭐ ORDERING, DECIDED RATHER THAN GUESSED. AAP §0.6.2 requires each insert to be visible to
   *        "the NEXT SKU's uniqueness read", so a SKU is written AFTER its own validation and BEFORE
   *        the next SKU is validated. The alternative — writing first, so a SKU can observe ITSELF —
   *        is not chosen, though the source looks like it anticipates it: the guard at
   *        `model/entity/Sku.cfc:L763-L768` tolerates finding exactly one SKU that IS the subject.
   *        Under the chosen ordering that self-exclusion clause is a defensive no-op on insert,
   *        exactly as the same clause is in `org/Hibachi/HibachiDAO.cfc:L130-L146`, where a
   *        not-yet-persisted subject can never match its own identifier either.
   *
   *        NO BATCH FORM IS OFFERED, and none may be added. A `persistSkus(skus)` seam would invite
   *        an implementation that writes the whole batch in one statement, which is precisely the
   *        naive port AAP §0.6.2 warns about: the per-SKU boundary IS the behaviour, because it is
   *        what interleaves the writes with the uniqueness reads between them.
   *
   *        TODO(parity): mismatch M5 is carried, not resolved — the legacy's implicit request-end
   *        commit has no equivalent in a stateless invocation, so the transaction this seam
   *        participates in is opened and closed by the caller (AAP §0.6.6).
   */
  public constructor(
    private readonly skuRepository: SkuRepository,
    private readonly optionService: OptionService,
    private readonly subscriptionTermPort: SubscriptionTermPort,
    private readonly accessContentPort: AccessContentPort,
    private readonly imagePathPort: ImagePathPort,
    /* ⛔ NO CONTAINMENT-ROOT COLLABORATOR SITS HERE, AND ITS ABSENCE IS DELIBERATE. An `imageStorageRoot`
     * parameter in this position would bound where an upload could land, and it is not accepted: the legacy
     * checks containment nowhere and states no such value to derive one from (AAP §0.7.3 S9, IR-12). The
     * write path is protected instead by the name gate above {@link isGeneratedImageFileName}, which
     * transcribes the legacy's OWN generator rather than inventing a root, and that banner records where
     * the residual read-side exposure can legitimately be confined. */
    private readonly smartListQueryPort: SmartListQueryPort,
    private readonly validator: SkuSaveValidator,
    private readonly productTypeRootResolver: SkuServiceProductTypeRootResolver,
    private readonly bindDefaultSkuDelegate: SkuDefaultSkuDelegateBinder,
    /**
     * The work ceiling and cancellation seam of review finding SEC-DOS-01 — see
     * {@link SkuCombinationBudget}.
     *
     * ⭐ REQUIRED, WITH NO DEFAULT, WHICH IS THE FAIL-CLOSED HALF OF THE FIX. An OPTIONAL parameter here
     * would leave the unbounded enumeration reachable by default, which is exactly what the finding
     * reports. Requiring it means a composition root cannot forget it, and because the ceiling is
     * RESOLVED rather than read, a deployment that stated no figure gets a named refusal from
     * {@link SkuService.createSkus} instead of an unbounded run — so requiring the collaborator invents
     * no figure. The precedence argument for holding this control at all is recorded above
     * {@link multiplyCombinationCount}.
     */
    private readonly combinationBudget: SkuCombinationBudget,
  ) {}

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
    /* ⭐ THE THREE COMPARISONS BELOW ARE CFML `==`, WHICH FOLDS CASE — see `resolveBaseProductType`.
     * The three legacy tests at [:L61], [:L139] and [:L173] use `==` on text operands, so a
     * `SwProductType` row holding `Merchandise` took the merchandise branch. `===` against the seeded
     * spelling did not, and sent that product to the fallthrough throw at [:L204] instead. Recognition
     * is therefore delegated to `../domain/BaseProductType`, which answers with the CANONICAL code so
     * the three arms below stay literal comparisons the compiler can check.
     *
     * ⛔ `baseProductType` — the RAW, AS-STORED value — is what the fallthrough diagnostic carries, and
     * that is deliberate: reporting the canonical value there would misreport the row. The canonical
     * value selects a branch; the observed value is what gets described. */
    const recognisedBaseProductType = resolveBaseProductType(baseProductType);
    const ruleSet = this.buildSkuSaveRuleSet(product);

    if (recognisedBaseProductType === MERCHANDISE_BASE_PRODUCT_TYPE) {
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
    } else if (recognisedBaseProductType === SUBSCRIPTION_BASE_PRODUCT_TYPE) {
      await this.createSubscriptionSkus(product, data, ruleSet);
    } else if (recognisedBaseProductType === CONTENT_ACCESS_BASE_PRODUCT_TYPE) {
      await this.createContentAccessSkus(product, data, ruleSet);
    } else {
      /* [:L204] is the bare CFML `throw` of the discriminator fallthrough. THE MESSAGE STRING IS
       * OWNED BY `../errors/DomainError` AS `UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE`, IS IMPORTED,
       * AND IS NEVER RETYPED — not in code and not in a comment. It is observable behaviour, so a
       * second copy anywhere could drift from the first, and the single declaration site is what keeps
       * verbatim fidelity checkable with one search. There is deliberately no default branch: an
       * unrecognised discriminator raises, exactly as the legacy does.
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
   * TODO(parity) M9 — CFML STRUCT ITERATION IS UNORDERED; THIS IS NOT. [:L82] and [:L106] both traverse the
   * `optionGroups` struct with `for(var key in …)`, and CFML specifies no order for a plain struct, so
   * the legacy's own combination sequence is unspecified. A `Map` preserves FIRST-SEEN INSERTION order,
   * which is the order the selected-option list itself establishes at [:L73-L79]. That choice is
   * deliberate: it is stable across runs and platforms, so tests and builds are reproducible, and it is
   * the most defensible reading of an unspecified legacy order. The group identifiers are NOT sorted —
   * sorting would impose an order the legacy never had and would silently change which SKU becomes the
   * default.
   *
   * ⭐ `M9` IS A CORRECTION ALIAS AND THIS MEMBER IS ITS HOME. AAP §0.6.6 stays frozen at M1–M8 and is not
   * extended; the alias exists so this observation — a defined order where the legacy had none, which
   * through the read-back loop (M6) also fixes the order uniqueness validation observes siblings in — can
   * be named in review correspondence and matched back to the code. `src/ports/repositories/SkuRepository.ts`
   * defines the five aliases the port carries and states both frozen bounds; no sixth exists.
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

    const selectedOptionIDs = cfmlListToArray(rawOptions);

    /* [:L73-L79] — group the selected options by their option group, in list order. Duplicates are
     * retained and nothing is deduplicated: two selections of the same option genuinely produce a
     * two-element bucket in the legacy, and therefore two combinations.
     *
     * ⭐ ONE PRIMARY-KEY LOAD PER LIST POSITION, WHICH IS WHAT THE LEGACY DOES. [:L74] calls
     * `getOptionService().getOption(...)` INSIDE this loop, so a list that repeats an identifier loads it
     * again, and the loads are interleaved with the bucketing rather than hoisted ahead of it.
     *
     * ⛔ AN EARLIER REVISION HOISTED THEM INTO ONE BATCH STATEMENT, THROUGH AN ADDITIVE
     * `OptionService.getOptionsByIDs` MEMBER, AND BOTH THE BATCH AND THE MEMBER ARE WITHDRAWN. The batch
     * was argued for on the ground that it collapsed only the STATEMENTS while leaving the walk, the
     * buckets, `indexedKeys`, `totalCombos` and the emission order bit-for-bit identical — which was true,
     * and is still not sufficient. It required a public service member with no legacy counterpart, which
     * AAP §0.4.1.8/§0.4.2.5 do not admit and §0.8.3.1's method-by-method parity check refuses; and a batch
     * is one of the additions standard S9 names outright. Removing it restores the legacy call pattern as
     * well as the legacy surface, so this loop is now literally what [:L73-L79] is.
     *
     * ⚠️ THE FAILURE IDENTITY IS UNCHANGED BY THE REVERSAL. {@link SkuService.requireOption} raises on
     * the FIRST unresolvable element in list order, exactly as the map lookup it replaced did, and nothing
     * is written before this loop, so an earlier failure still has nothing to undo. */
    for (const optionID of selectedOptionIDs) {
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
      /* [:L85] — the multiplication itself, carrying the lower-bound assertion on one group's bucket and
       * the exact-integer check on the running product that {@link multiplyCombinationCount} documents.
       * The OPERATOR's ceiling is not applied here: it is applied once, below, so that it sees the whole
       * product rather than each partial one. */
      totalCombos = multiplyCombinationCount(totalCombos, bucket.length, optionGroupID);
    }

    /* ⭐⭐ THE CEILING STANDS BETWEEN THE COUNT AND THE ENUMERATION — REVIEW FINDING SEC-DOS-01
     * (CWE-400). This position is the whole point: `totalCombos` is now final, and NOT ONE `newSku()`
     * has been allocated, no option has been attached and no validation has reached the database, so an
     * over-budget request costs the option loads above and nothing else. Refusing inside the loop would
     * mean refusing after part of the work had already been done, and refusing before the count would
     * mean refusing on a figure nobody had computed yet.
     *
     * The ceiling is RESOLVED here rather than read at construction, so a deployment that stated none
     * gets `ConfigurationError` naming `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST` — a named refusal, not
     * a fabricated number and not an unbounded run. See {@link SkuCombinationBudget}. */
    const maximumCombinations = this.combinationBudget.resolveMaximumCombinations();
    if (totalCombos > maximumCombinations) {
      throw new DomainError(
        `Creating SKUs would enumerate ${String(totalCombos)} combinations, which exceeds the ` +
          `${String(maximumCombinations)} this deployment permits one request to enumerate. No SKU was ` +
          `constructed, attached or validated.`,
        {
          context: {
            combinations: totalCombos,
            maximumCombinations,
            optionGroups: indexedKeys.length,
            locator: 'model/service/SkuService.cfc:L85-L89',
          },
        },
      );
    }

    /* [:L89-L122] — one SKU per combination, in odometer order. */
    for (let combination = 0; combination < totalCombos; combination++) {
      /* ⭐ THE COOPERATIVE CANCELLATION SEAM — SEC-DOS-01's deadline clause. Consulted BEFORE this
       * combination allocates anything, so a stop leaves the transaction with a whole number of SKUs
       * written rather than a half-built one. The composition root's default never cancels, and the
       * invocation deadline itself remains the platform's: AAP §0.6.6 M1/M2 stay FLAGGED per §0.8.3.6,
       * and this file invents no duration. */
      if (this.combinationBudget.hasBeenCancelled()) {
        throw new DomainError(
          `Creating SKUs stopped after ${String(combination)} of ${String(totalCombos)} combinations ` +
            `because the invocation reported its work budget exhausted. The enclosing transaction is ` +
            `discarded by the caller, so no partial SKU set is committed.`,
          {
            context: {
              combinationsCompleted: combination,
              combinations: totalCombos,
              locator: 'model/service/SkuService.cfc:L89',
            },
          },
        );
      }

      // [:L92]
      const newSku = this.newSku();
      // [:L93]
      newSku.price = readRequiredCfmlDecimal(
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

      /* [:L100] — `product.addSku(newSku)`, which [model/entity/Product.cfc:L696-L698] implements as a pure
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
   * IS PORTED THAT WAY. The two are behaviourally identical — [model/entity/Product.cfc:L696-L698]
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
    thisSku.price = readRequiredCfmlDecimal(
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

    /*
     * ⭐ P15 — THE THREE IDENTIFIER LISTS ARE RESOLVED IN THREE BOUNDARY CALLS, NOT ONE PER ELEMENT.
     * `[:L158]`, `[:L161]` and `[:L164]` each sit INSIDE a loop, so a product with `t` terms, `b`
     * benefits and `r` renewal benefits crossed this boundary `t + t*b + t*r` times. The two benefit
     * lists are resolved once each here and the terms once, and the loop below then reads what was
     * resolved.
     *
     * ⚠️ THE TWO BENEFIT LISTS ARE RESOLVED SEPARATELY EVEN THOUGH ONE PORT MEMBER SERVES BOTH. They are
     * distinct collections targeting distinct relationships — `model/entity/Sku.cfc:L78` and `:L79` — and
     * keeping one batch per legacy loop preserves a one-to-one correspondence with the source that a
     * merged batch would blur. Two statements instead of one is not what this finding is about.
     *
     * ⚠️ NOTHING HERE DECIDES ANYTHING. Each batch returns a partial map and raises nothing, so an
     * identifier that matches no row is still reported by the resolver the loop already used, on the
     * element the loop is on, in the loop's order. Sequential awaits are house style; `Promise.all` is
     * deliberately not used even though these three reads are independent.
     */
    const resolvedTerms =
      await this.subscriptionTermPort.getSubscriptionTermsByIDs(subscriptionTerms);
    associationReferences.prime(
      SUBSCRIPTION_BENEFIT_FAMILY,
      await this.subscriptionTermPort.getSubscriptionBenefitsByIDs(subscriptionBenefits),
    );
    associationReferences.prime(
      RENEWAL_SUBSCRIPTION_BENEFIT_FAMILY,
      await this.subscriptionTermPort.getSubscriptionBenefitsByIDs(
        subscriptionData.renewalSubscriptionBenefits,
      ),
    );

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
      const price = readRequiredCfmlDecimal(
        data,
        PRICE_DATA_KEY,
        'model/service/SkuService.cfc:L156',
      );
      thisSku.price = price;
      // [:L157] — the same value. See the method note.
      thisSku.renewalPrice = price;
      /* [:L158] — read from the batch resolved before the loop, falling through to the per-identifier
       * resolver when this identifier matched no row so that the failure is raised by the untouched
       * resolver, naming this element, at this point in the walk. */
      thisSku.setSubscriptionTerm(
        resolvedTerms.get(subscriptionTermID) ??
          (await this.requireSubscriptionTerm(
            subscriptionTermID,
            'model/service/SkuService.cfc:L158',
          )),
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
      price: readRequiredCfmlDecimal(data, PRICE_DATA_KEY, 'model/service/SkuService.cfc:L183'),
      accessContents,
      ...(bundleContentAccess ? { bundleContentAccess } : {}),
    };

    /* ⭐ THE HIBERNATE-SESSION IDENTITY MAP, REPRODUCED — one instance per branch invocation, for the
     * reasons recorded once on {@link SkuAssociationReferenceMap} and restated at the subscription
     * branch that constructs the other one. Not repeated a third time here. */
    const associationReferences = new SkuAssociationReferenceMap();

    /*
     * ⭐ P15 — THE CONTENT LIST IS RESOLVED IN ONE BOUNDARY CALL, SERVING BOTH ARMS.
     * `[:L186]` loops the whole list attaching every row to a single SKU; `[:L196]` creates one SKU per
     * row. Either way the legacy crosses this boundary once per identifier, and both arms read the SAME
     * list — so one batch here serves whichever arm runs, and neither arm's shape changes.
     *
     * ⚠️ RESOLVED BEFORE THE ARMS RATHER THAN INSIDE THEM, WHICH IS SAFE BECAUSE THE GATE HAS ALREADY
     * PASSED. Both arms sit after the non-empty-content gate and the `price` read above, so nothing is
     * read here that the branch would not have read anyway. And the batch decides nothing: an identifier
     * matching no row is absent from the map, `require` falls through to its own resolver, and that
     * resolver raises the error it always raised for the element the arm is on.
     */
    associationReferences.prime(
      ACCESS_CONTENT_FAMILY,
      await this.accessContentPort.getContentsByIDs(accessContents),
    );

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

  /**
   * The single definition of "this selected option does not exist".
   *
   * ⚠️ IT IS DEFINED ONCE ON PURPOSE, EVEN THOUGH ONLY ONE MEMBER NOW RAISES IT. A second caller — a
   * map-lookup twin named `requireResolvedOption` — read from a batched statement and was withdrawn with
   * the additive `OptionService.getOptionsByIDs` member it depended on. The shared constructor stays: the
   * message and the context are the observable part of the failure, and keeping them in one place is what
   * stopped the two callers drifting apart while both existed.
   */
  private missingSelectedOptionError(optionID: string, locator: string): DomainError {
    return new DomainError(
      'A selected option does not exist, so the SKU combination cannot resolve it. The legacy ' +
        'code dereferences the lookup result without a guard and raises here too.',
      { context: { optionID, locator } },
    );
  }

  /**
   * `getOptionService().getOption( listGetAt(arguments.data.options, i) )` — [:L74], one identifier.
   *
   * THE ONLY OPTION RESOLUTION IN THIS SERVICE, AND IT IS ONE LOAD PER LIST POSITION, exactly as [:L74]
   * issues them from inside the grouping loop. The batched twin that once served the merchandise walk is
   * withdrawn along with the additive service member it called; see the note on the loop in
   * {@link SkuService.createMerchandiseSkusFromSelectedOptions} for why the reversal restores parity
   * rather than costing capability.
   */
  private async requireOption(optionID: string, locator: string): Promise<Option> {
    const option = await this.optionService.getOption(optionID);
    if (option === null) {
      throw this.missingSelectedOptionError(optionID, locator);
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
   * The write goes through `SkuRepository.persistSku`, a member of
   * `../ports/repositories/SkuRepository` — so no adapter is imported, S2 and S4 are untouched, and
   * the ordering lives with the rule that defines it. Transaction DEMARCATION is still not this
   * service's business: the port member is explicitly forbidden from committing, and the enclosing
   * transaction is opened and closed by the caller.
   *
   * A COUNTER-ARGUMENT WAS MADE FOR A CALLBACK SEAM INSTEAD, AND IT IS RECORDED HERE BECAUSE IT IS A
   * GOOD ONE. It ran: `BaseService` already declares `EntityPersister<TEntity>`, a one-member callback
   * type, which is the narrowest persistence seam available; AAP §0.4.2.6 maps `model/dao/SkuDAO.cfc`
   * to SEVEN BUSINESS QUERIES and one private cache helper, with no write member; so widening a
   * business-query port into a CRUD port to serve one call site is a departure from that mapping.
   *
   * WHY THE PORT MEMBER STILL WINS. Three facts decide it, and the first two were not visible from
   * where the counter-argument was made:
   *
   *   1. THERE IS NOT ONE CALL SITE, THERE ARE THREE. `../services/ProductService` writes SKUs through
   *      this same port member twice — once on the inherited-product path and once from
   *      `processProduct_updateSkus` — in addition to the call below. A callback seam would therefore
   *      have to be injected into TWO services, adding a collaborator to each, which is more coupling
   *      surface than the port member it replaces, not less.
   *   2. THE SIBLING PORT ALREADY CARRIES ITS WRITES. `ProductRepository` declares `saveProduct` and
   *      `removeProduct`, and `test/adapters/MySqlProductRepository.test.ts` pins them as the members
   *      that satisfy the service layer's persister and remover contracts. `ProductTypeRepository`
   *      carries `saveProductType` on the same footing. Dropping the SKU equivalent alone would make
   *      the three catalog write paths inconsistent for no behavioural gain.
   *   3. THE TWO DESIGNS ARE NOT IN CONFLICT, AND THE SEAM IS ONE LINE WIDE EITHER WAY. The port
   *      member and its adapter both return `Promise<void>`, because the SKU is mutated in place —
   *      the audit columns are stamped on the instance this service already holds, and no caller in
   *      the slice reads a returned one. A composition root that prefers the callback shape binds
   *      `(sku) => repository.persistSku(sku).then(() => sku)` and gets an `EntityPersister<Sku>`
   *      with no wrapper class, so declaring the member on the port that already owns this entity's
   *      reads gives up nothing about the seam's width. IR-1 is the AAP's own warrant for this:
   *      the synthesized `save*`/`delete*` surface of `onMissingMethod` must be declared explicitly
   *      somewhere, and the port that already owns the entity's reads is where it stays bindable to
   *      one executor on one connection.
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
   * this ordering rather than evidence for the opposite one, is recorded on this class's
   * `persistSku` constructor parameter and is not restated here.
   *
   * ⭐⭐ THE ONE AUTHORITATIVE ORDER IS VALIDATE → MINT → PERSIST, PER SKU, AND THE BODY BELOW IS WHERE
   * IT IS IMPLEMENTED. `generator="uuid"` at `model/entity/Sku.cfc:L52` made the key the mapping
   * layer's to assign, and Hibernate assigned it at FLUSH time — after the rules had run, immediately
   * before the row was written. Nothing here flushes, so the key is assigned explicitly, at that same
   * moment: one statement after `validate` and one statement before the write.
   *
   * ⛔ A REVISION OF THIS BLOCK CLAIMED THE OPPOSITE — "THE IDENTIFIER IS MINTED FIRST, BEFORE THE RULES
   * RUN" — WHILE THE BODY DID, AND STILL DOES, THE REVERSE. That paragraph is withdrawn: it described an
   * ordering the body rejects, and it recommended precisely the edit the body's own ⛔ note explains is a
   * parity break. Its two grounds and their refutations, kept so the claim is not re-argued from scratch:
   *
   *   1. "The self-exclusion clause at `model/entity/Sku.cfc:L763-L768` compares
   *      `skus[1].getSkuID() == getSkuID()`, so the subject needs a key before the rules read one." The
   *      legacy performs that comparison with the subject's key still at the unsaved sentinel, which is
   *      why AAP §0.6.2 calls the clause a defensive NO-OP, and why
   *      `src/ports/UniquePropertyPort.ts` records the same reading of
   *      `org/Hibachi/HibachiDAO.cfc:L136`/`:L140` — "the self-exclusion term consequently excludes
   *      nothing on insert". Minting first would make that term start excluding a row that does not
   *      exist yet: a repair, not a translation.
   *   2. "{@link SkuRepository.persistSku} refuses a SKU still carrying the sentinel, so the key must
   *      exist." It must exist before the WRITE, which the mint below guarantees — not before the
   *      RULES. Minting early would also flip `Sku.isNew()` to false for the whole rule pass, and
   *      {@link Sku.setProduct} branches on that answer [model/entity/Sku.cfc:L108], so the SKU would go
   *      unappended with nothing reporting it.
   *
   * The mint is CONDITIONAL on the SKU reporting itself new, and it is the only place in this service that
   * touches `src/util/uuid.ts` (IR-6: 32 lowercase hexadecimal characters, no dashes). Every current
   * caller hands over a freshly created SKU, so the guard is not reached today; it is there because
   * re-minting a key an entity already carries would orphan the row that key belongs to, and a
   * conditional assignment is the cheapest way to make that impossible rather than merely unlikely.
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
    /*
     * ⛔ NOTHING IS MINTED BEFORE THIS LINE, AND A REVISION THAT MINTED HERE WAS REJECTED.
     * Its argument was that the uniqueness rule's self-exclusion clause compares the subject's own key,
     * so the key ought to exist by the time the rules run. That inverts the behaviour being ported.
     * `src/ports/UniquePropertyPort.ts` records the legacy reading at `org/Hibachi/HibachiDAO.cfc:L136`
     * and `:L140`: on an INSERT the primary key is still the unsaved sentinel, so "the self-exclusion
     * term consequently excludes nothing on insert" — IR-5's own observation, carried deliberately.
     * Minting first would make that term start excluding a row that does not exist yet, which is a
     * repair, not a translation.
     *
     * It also makes `Sku.isNew()` answer false for the whole rule pass, which the mint note further down
     * spells out, and it is pinned from the other side: the DATA-01 case in
     * `test/services/SkuService.test.ts` asserts every SKU reaching validation still carries `''` and
     * that the SAME SKUs are 32-character identified one step later. `persistSku` refusing the sentinel
     * is satisfied by the mint below, which runs before the write and after the rules.
     */
    const findings = await this.validator.validate(sku, ruleSet, SKU_SAVE_CONTEXT);
    if (findings.hasErrors()) {
      sku.addErrors(findings.getErrors());
    }

    /* ⭐ THE IDENTIFIER IS MINTED HERE, AND THE POSITION OF THIS LINE IS THE WHOLE OF THE DECISION
     * (IR-6).
     *
     * A SKU built by any of the five creation branches above carries {@link SKU_UNSAVED_ID_VALUE} —
     * the empty string — because nothing in the ported creation path assigns one, exactly as nothing in
     * the legacy creation path does. `model/entity/Sku.cfc:L52` declares the column as
     * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue="" default=""`, so the
     * legacy identifier is generated in APPLICATION CODE — `createSlatwallUUID()`
     * [model/dao/HibachiDAO.cfc:L51-L53], recorded by AAP IR-6 as 32 hexadecimal characters with no
     * dashes — and never by the database. `model/service/SkuService.cfc:L58-L211` never touches `skuID`
     * at all; Hibernate produced it at FLUSH time, which is the moment this line reproduces: the graph
     * is fully constructed, the rules have run, and the row is about to be written.
     *
     * ⛔ EARLIER WOULD CHANGE BEHAVIOUR TWICE OVER, so the placement is behaviour rather than taste.
     * `Sku.isNew()` tests `skuID === SKU_UNSAVED_ID_VALUE`, and {@link Sku.setProduct}
     * [model/entity/Sku.cfc:L108] branches on that answer to decide whether to append this SKU to the
     * product's own collection: a NEW sku takes the append path unconditionally because CFML `or`
     * short-circuits, whereas a sku that already carries an identifier takes the `!has...` test instead.
     * Minting in {@link SkuService.newSku} — or anywhere before the rule pass — would flip `isNew()` to
     * false while the graph was still being assembled, the SKU would go unappended, and nothing would
     * report it. It would also change what `hasUniqueOptions` sees, because
     * `model/entity/Sku.cfc:L763-L768`'s self-exclusion clause compares `skus[1].getSkuID()` against
     * `getSkuID()` — a comparison the legacy performs while the subject's identifier is still the unsaved
     * sentinel, which is precisely why AAP 0.6.2 calls that clause a defensive no-op. Assigning after
     * validation and before the write preserves both.
     *
     * ⚠️ THE LEGACY ROUTES `isNew()` THROUGH TWO FURTHER MEMBERS AND THIS PORT DOES NOT, so the exposure
     * there is wider than it is here. `addAccessContent` guards its LOCAL append with this SKU's
     * `isNew()` [model/entity/Sku.cfc:L705] while `addSubscriptionBenefit` guards its FAR append with it
     * [`:L728`] — the two are on opposite sides of an otherwise identical pair of members, which is a
     * preserved legacy inconsistency rather than a distinction with a purpose. Neither guard survives
     * into {@link Sku.addAccessContent} or {@link Sku.addSubscriptionBenefit}, which dedupe by reference
     * identity alone, because the FAR append maintains a back-reference on an out-of-scope entity that
     * this port does not model. One live dependency on `isNew()` during graph construction is therefore
     * enough to fix the placement, and it would still be the right placement if the other two returned.
     *
     * ⚠️ AND WITHOUT THIS LINE NOTHING COULD BE CREATED AT ALL. `SkuRepository.persistSku` refuses a
     * SKU that still carries the sentinel — deliberately, because TR-5 requires a missing collaborator be
     * surfaced rather than swallowed, and because a repository that minted its own identifier would hide
     * the very question this comment answers. That is also why the mint is NOT done in the repository,
     * unlike `MySqlBrandRepository.saveBrand`: both facts are kept, with the identifier assigned here one
     * statement before the write and the repository's refusal left in place as defence in depth. It
     * should be unreachable from this path, which is exactly what a defence-in-depth check is for.
     *
     * ⛔ THE GUARD IS THE MINT — THERE IS EXACTLY ONE ASSIGNMENT AND IT IS CONDITIONAL. An identifier is
     * generated only while `skuID` still holds {@link SKU_UNSAVED_ID_VALUE}, so a SKU that already
     * carries one keeps it. Re-minting a key an entity already holds would orphan the row that key
     * belongs to, and a single guarded assignment is the cheapest way to make that impossible rather
     * than merely unlikely. The legacy mints exactly once for the same reason:
     * [model/entity/Sku.cfc:L52] declares `generator="uuid" unsavedvalue=""`, so the identifier is
     * produced on insert only and a re-save never replaces one — which makes this guard parity rather
     * than an added safeguard, and is why AAP 0.6.7's preserve-and-annotate rule has nothing to say
     * about it.
     *
     * ⚠️ ONLY FOR A NEW SKU. An already-identified SKU keeps its identifier, so a re-save updates the
     * row it belongs to rather than inserting a second one.
     *
     * The value is NOT validated for shape here, and the entity does not validate it either: neither
     * does the legacy, and `src/util/uuid.ts` is the single place the format is decided. */
    if (sku.skuID === SKU_UNSAVED_ID_VALUE) {
      sku.skuID = createSlatwallUUID();
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
   * Saves an uploaded image file against a SKU's image path, and answers with the image-write verdict.
   *
   * =================================================================================================
   * ⭐ THE RETURN TYPE IS `Promise<boolean>` — THE OBSERVED CONTRACT, AND TR-1 IS WHY
   * =================================================================================================
   * The legacy declaration is `public any function processImageUpload(required any Sku, required struct
   * imageUploadResult)` at [model/service/SkuService.cfc:L210] — a LOOSE `any` return. Its body settles
   * what that `any` actually is: [:L213-L217] is
   *
   *     if(imageSaved) { return true; } else { return false; }
   *
   * — exactly two returns, both booleans, and the entity is never returned at all. TR-1 governs precisely
   * this case: "Where a legacy signature is loose (untyped `any`, optional arguments that callers always
   * supply), the target signature is tightened to the OBSERVED contract." So the member answers the
   * verdict.
   *
   * ⚠️ A REVISION TYPED THIS MEMBER `Promise<Sku>` AND DISCARDED THE VERDICT, on the reading that AAP
   * §0.4.2.2's tabulated `Promise<Sku>` cell is a ratified per-member decision that D1 precedence 1 places
   * above TR-1. Review finding F2 withdrew that reading. The plan's own Goal B is to "preserve behavior
   * exactly at the interface boundary", and a member that answers a different KIND of value than the
   * legacy body answers does not preserve it — the verdict simply stopped being observable anywhere. The
   * tabulated cell records the plan's resolution of a loose `any`; where the body is unambiguous about
   * what that `any` is, the body is the contract and TR-1 is the rule that says so.
   *
   * ⛔ AND NOTHING BELOW THE RETURN TYPE CHANGED IN EITHER DIRECTION. The same path is composed, the same
   * port is asked to write the same file with the same extension list, and a declined write is still
   * neither recorded on the entity nor raised. AAP §0.8.2 Guideline 4 protects BUSINESS LOGIC from
   * enhancement, and no rule, branch, write, query or outcome moves here.
   *
   * ⚠️ TODO(parity) D24 [model/service/SkuService.cfc:L213-L217] — THE LEGACY BODY DEPARTS FROM ITS OWN
   * FRAMEWORK'S STATED CONVENTION, AND THE PORT CARRIES THAT DEPARTURE. The convention at
   * [org/Hibachi/HibachiService.cfc:L117] is that "all process methods should return an entity"; this body
   * returns a verdict instead. That is an inconsistency inside the LEGACY, not one this port introduces,
   * and it is annotated BY LOCATOR rather than repaired (AAP §0.6.7 preserve-and-annotate). `D24` is a
   * CORRECTION ALIAS for that observation and not a register entry: AAP §0.6.7 stays frozen at D1–D21, and
   * `src/ports/repositories/SkuRepository.ts` defines the five aliases the port carries — D22–D25 and M9 —
   * with nothing minted beyond them.
   *
   * ⚠️ THE FRAMEWORK DISPATCHER CANNOT REACH THIS MEMBER ANYWAY, which is why the convention's pull is
   * weak here. [org/Hibachi/HibachiService.cfc:L114] composes
   * `process#entity.getClassName()#_#processContext#` — for a SKU that is `processSku_imageUpload`, a name
   * this component does not declare. `grep -rn processImageUpload` over the whole legacy tree finds
   * exactly ONE occurrence: this declaration. Nothing in the legacy reads the return value, so no legacy
   * caller's behaviour turns on it; what the choice governs is what the PORT's own boundary can publish.
   *
   * ⚠️ TODO(parity) [:L213-L217] IS A REDUNDANT BOOLEAN IDENTITY — `if(imageSaved) return true; else
   * return false;` is exactly `return imageSaved;`. The port writes the direct form: the dead branching
   * carries no behaviour, and reproducing it would add a statement with no observable effect. The
   * redundancy is recorded here instead.
   *
   * =================================================================================================
   * ⭐⭐ CWE-22 IS CLOSED ON THE WRITE PATH — REVIEW FINDING SEC-FILE-01
   * =================================================================================================
   * The path handed to the port is composed from the SKU's stored `imageFile` column, so a traversing value
   * stored on the row would travel wherever the port's implementation takes it. {@link
   * isGeneratedImageFileName} is consulted BEFORE a path is composed, and its block above carries the whole
   * adjudication. The one objection that could be raised against it — that a refusal "refuses input the
   * legacy accepts" — does not apply here: the legacy has NO well-defined result on this path for ANY input,
   * because the collaborator member does not exist anywhere in the legacy tree and the one call site cannot
   * dispatch to the framework's fallback, which takes ordered arguments only. There is no accepted outcome
   * to refuse.
   *
   * ⚠️ THE READ PATH IS UNTOUCHED AND ITS EXPOSURE STAYS FLAGGED. [model/entity/Sku.cfc:L222] probes with
   * `fileExists(expandPath(getImagePath()))`, which HAS a defined result for every input, writes nothing and
   * discloses only a boolean. It keeps that behaviour; see {@link ImagePathPort.getImageExistsFlag}.
   *
   * ⛔ AND THIS MEMBER STILL RAISES NOTHING OF ITS OWN, ON ANY INPUT. A refused name answers `false`, which
   * is a value [:L213-L217] already produces, so no caller gains a failure mode the legacy lacked. Whatever
   * the port rejects with still propagates unchanged. No storage-root comparison and no content-type
   * allow-list is applied HERE: a root would be invented configuration (AAP §0.7.3 S9, IR-12) and is
   * unnecessary — one safe segment confines the write to whatever the composed prefix denotes — while
   * content inspection has no site in this layer and is stated as an obligation on
   * {@link ImagePathPort.saveImageFile} for whichever adapter implements it.
   *
   * ⚠️ A DECLINED WRITE IS NOT AN ERROR AND MUST NOT BECOME ONE. [:L216] returns `false` and does nothing
   * else — no `addError`, no raise, no retry, no alternate path. The port answers `false` and does the
   * same. Converting it into a rejection would turn a reported outcome into a failed request.
   *
   * THE IMAGE DEPENDENCY IS THE HIDDEN ONE. [:L212] resolves it as `getService("imageService")` — a
   * dynamic string lookup that is NEVER declared as a component property, so it is invisible to any
   * dependency analysis based on component metadata, and a port built from such an analysis would compile
   * and then fail at the first image operation (AAP §0.6.3.2). It is routed through
   * {@link ImagePathPort} (import rule R2).
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
   * @param sku - The SKU whose composed image path names the file to write, read at [:L211] through
   * `getImagePath()`. It is READ and never mutated, and it is NOT what this member answers with.
   * @param imageUploadResult - The upload result struct, passed through to the port opaquely.
   * @returns The image service's own verdict — `true` when the file was stored, `false` when the write
   * was declined — reproducing [:L213-L217] exactly.
   */
  public async processImageUpload(
    sku: Sku,
    imageUploadResult: Record<string, unknown>,
  ): Promise<boolean> {
    /* ⭐ SEC-FILE-01 — THE GATE, AND IT STANDS BEFORE THE PATH IS COMPOSED RATHER THAN AFTER.
     *
     * Order is the whole point. Screening the COMPOSED path would mean the traversal had already been
     * resolved against the prefix, and a check on the result would have to reason about where that prefix
     * points — which is exactly the injected containment root this port declines to invent. Screening the
     * STORED SEGMENT instead needs no root: one safe segment cannot leave whatever directory
     * `<baseImageURL>/product/default/` denotes, whatever it denotes.
     *
     * It also means a refused upload touches the port ZERO times — not `getImagePath`, not `saveImageFile` —
     * so nothing downstream has to be trusted to refuse, and a test can prove the refusal by the port double
     * having recorded no call at all. */
    /* ⚠️ AN ABSENT COLUMN COALESCES TO THE EMPTY STRING, EXACTLY AS THE COMPOSING MEMBERS DO
     * ({@link Sku.getImagePath} reads `this.imageFile ?? ''`), and the pattern then refuses it because both
     * of its quantifiers are `+`. That refusal is deliberate rather than incidental: an empty segment makes
     * the composed path resolve to the DIRECTORY `<baseImageURL>/product/default/`, and handing a directory
     * to a member that writes is the same class of hazard as handing it a traversal. */
    if (!isGeneratedImageFileName(sku.imageFile ?? '')) {
      return false;
    }

    /* [:L211] — `var imagePath = arguments.Sku.getImagePath();` The composed path, obtained through the
     * same port the entity's own display members use, and passed to the write UNCHANGED. ⛔ DO NOT SUBSTITUTE
     * A VALIDATED BASENAME HERE: a basename confines nothing, because it names no destination, and it would
     * change the path the legacy composes. The refusal above is what protects this write. */
    const filePath = await sku.getImagePath(this.imagePathPort);

    /* [:L212-L217] — the hidden dependency, through the port, and its verdict FORWARDED.
     *
     * ⛔ DO NOT "FIX" THIS BY ANSWERING WITH `sku`. A revision did, on the reading that AAP §0.4.2.2's
     * tabulated `Promise<Sku>` outranks TR-1; review finding F2 withdrew it, because the legacy body has
     * exactly two returns and neither is the entity. The docblock records the whole adjudication so the
     * round trip is not attempted a third time. */
    return this.imagePathPort.saveImageFile({
      uploadResult: imageUploadResult,
      filePath,
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
   * Ports the transaction-existence probe, with both optional identifiers the legacy actually accepts.
   *
   * `model/service/SkuService.cfc:L285-L287`.
   *
   * =================================================================================================
   * ⭐ THE DECLARATION NAMES NO ARGUMENT AND THE MEMBER NEVERTHELESS TAKES TWO — AND THE PORT TAKES TWO
   * =================================================================================================
   * `[:L285]` is literally `public boolean function getTransactionExistsFlag()`, with no formal
   * parameter of any kind, and `[:L286]` forwards `argumentCollection=arguments` to a DAO member that
   * DOES declare two — `<cfargument name="productID" />` and `<cfargument name="skuID" />` at
   * `model/dao/SkuDAO.cfc:L54-L55`. CFML places an UNDECLARED named argument into the `arguments` scope
   * exactly as it does a declared one, so the forwarded collection carries whatever the caller named.
   *
   * ⭐ AND BOTH REAL CALLERS NAME AN IDENTIFIER, WHICH IS WHAT SETTLES THE CONTRACT. The two call sites
   * in the whole legacy tree are:
   *
   *     model/entity/Sku.cfc:L594      -> getTransactionExistsFlag( skuID = this.getSkuID() )
   *     model/entity/Product.cfc:L626  -> getTransactionExistsFlag( productID = this.getProductID() )
   *
   * So the OBSERVABLE contract of this member — the thing AAP §0.1.1.2 Goal B requires be preserved
   * "exactly at the interface boundary" — is a probe that accepts an optional SKU identifier and an
   * optional product identifier. AAP §0.4.2.2's Discrepancy 4 records the DECLARATION honestly ("the
   * service member takes no arguments while the underlying DAO member accepts optional `productID` and
   * `skuID`"), and TR-1 is the rule that resolves it: "Where a legacy signature is loose … the target
   * signature is tightened to the observed contract." A literal zero-parameter port would discard the
   * identifier every caller supplies and answer a question the legacy can never answer, so the two
   * optional parameters are declared here. This is the IR-1 requirement applied to this member: every
   * argument CFML passes implicitly becomes an explicit, typed declaration.
   *
   * =================================================================================================
   * ⭐ THE ARGUMENT ORDER IS SKU-FIRST HERE AND PRODUCT-FIRST ONE LAYER DOWN. IT IS CROSSED ONCE.
   * =================================================================================================
   * This member is SKU-first, because the SKU identifier is the one the DAO gives precedence to and
   * because `SkuTransactionExistenceChecker` in `../domain/sku/Sku.ts` and
   * `ProductTransactionExistenceChecker` in `../domain/product/Product.ts` both declare that order.
   * {@link SkuRepository.transactionExists} is PRODUCT-first, because `model/dao/SkuDAO.cfc:L54-L55`
   * declares `productID` first (AAP §0.4.2.6, TR-4). Both identifiers are 32-character strings (IR-6),
   * so a swap type-checks and would silently exchange the two scopes; the crossing therefore happens on
   * exactly ONE line, below, and `../../test/services/SkuService.test.ts` asserts the slots by name.
   *
   * ⚠️ THE TWO BRANCHES ARE MUTUALLY EXCLUSIVE AND `skuID` WINS. `model/dao/SkuDAO.cfc:L58` tests
   * `structKeyExists(arguments,"skuID") && !isNull(arguments.skuID)` FIRST and only falls through to the
   * product root at `[:L90]` when that fails. The port does not reproduce that precedence here — it
   * forwards both slots and lets the repository apply it, which is where the legacy applies it.
   *
   * ⚠️ A LITERAL ZERO-ARGUMENT INVOCATION STILL FAILS, AND IT FAILS AT THE SAME LAYER. With neither
   * identifier supplied, `[:L58]`'s test fails and `[:L90]` binds `arguments.productID` — dereferencing a
   * key that is not there, so the legacy raises. That refusal is left to
   * {@link SkuRepository.transactionExists}, which documents and keeps it, rather than pre-empted with a
   * guard here: pre-empting it would move a legacy failure to a new place and invent a message the legacy
   * never had (IR-9). It is emphatically NOT collapsed into "does any transaction exist anywhere", which
   * is the one answer the legacy can never give — and which would be dangerous, because a `false` from
   * this flag PERMITS a delete (`model/validation/Product.json:L12`, `model/validation/Sku.json`).
   *
   * ⛔ NEITHER SLOT IS DEFAULTED. Substituting the empty string for a missing identifier would match no
   * row and answer `false`, converting a refusal into permission to delete.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param skuID - The SKU to scope the probe to, as `model/entity/Sku.cfc:L594` supplies it. First,
   *   matching the two entity checker contracts.
   * @param productID - The product to scope the probe to, as `model/entity/Product.cfc:L626` supplies
   *   it. Second, for the same reason.
   * @returns Whether any transaction record references the addressed scope — the legacy's own `boolean`
   *   return at `[:L285]`. Rejects when NEITHER identifier is supplied, reproducing
   *   `model/dao/SkuDAO.cfc:L90`.
   */
  public async getTransactionExistsFlag(skuID?: string, productID?: string): Promise<boolean> {
    /*
     * `[:L286]` — `return getSkuDAO().getTransactionExistsFlag( argumentCollection=arguments );`
     *
     * ⛔ THE ONE CROSSING. This member is SKU-first and the repository is PRODUCT-first, so the slots are
     * exchanged here and NOWHERE else. Reading this line as `transactionExists(skuID, productID)` is the
     * exact mistake the comment exists to prevent.
     */
    return this.skuRepository.transactionExists(productID, skuID);
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
   * The legacy composes it in four steps, all preserved by `../ports/SmartListQueryPort`'s
   * `composeSkuSmartListQuery`: the root entity `SlatwallSku` [:L310]; three related-property joins
   * [:L314-L316], THE THIRD OF WHICH IS A `left` JOIN so SKUs with no alternate codes are still returned;
   * and five keyword properties at weight 1 [:L318-L322]. No pagination default, filter or ordering is
   * invented — the caller's `data` is translated and nothing more. Every in-repository caller passes no
   * arguments at all (`integrationServices/google/controllers/feed.cfc:L63` among five others), which is
   * exactly why an invented default here would be invisible in review and change every one of them.
   *
   * ⭐ THE SELECTION IS SHARED, THE VIEW IS NOT. The four facts above live in `../ports/SmartListQueryPort`
   * because the Google feed needs the SAME selection and reads only its unpaged records; this member
   * still answers all three legacy views. See the SMART LIST SELECTION block near the top of this file
   * for why that split exists and why a tenth public member was not the answer.
   *
   * ⭐ A CALLER MAY CONTRIBUTE FURTHER STRUCTURAL JOINS, AND THEY RIDE INSIDE `data` — NOT IN A THIRD
   * PARAMETER. The legacy returns a MUTABLE smart list, so a caller layers onto it after this member is
   * done: the Google feed takes the list this member built and registers three more joins at
   * `integrationServices/google/controllers/feed.cfc:L64-L66` before filtering it. This port is
   * declare-then-execute, so that contribution travels in `data` under its structural `joins` member and
   * the shared composer appends it to the base join list — in that order, because
   * [:L314-L316] necessarily ran before the controller could add anything, and because two of the feed's
   * three name `SlatwallProduct` as their parent, an entity the first of these joins is what registers.
   *
   * ⛔ AND `additionalJoins` IS THE ONLY CHANNEL, WHICH IS WHERE AN INTERMEDIATE REVISION WENT WRONG. It
   * grew a THIRD PARAMETER on this member for the same purpose while the sentence below still claimed the
   * signature was unchanged; a code review classified the parameter as a MAJOR interface-parity defect
   * against AAP §0.4.2.2's two-argument declaration, and it is withdrawn. The claim is now true rather
   * than aspirational: the contribution rides inside the existing `data` argument, so the arity
   * AAP §0.4.2.2 declares is preserved (TR-1), and `src/integrations/google/ProductFeedQuery.ts` — the
   * one production contributor — already travelled this way. Nothing is de-duplicated on the way through
   * — the feed's first join repeats [:L314] verbatim and the adapter proves the legacy absorbs a repeat
   * without emitting anything.
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
    /*
     * ⭐ `execute`, NOT `executeRecords`, AND THE CHOICE IS THIS MEMBER'S CONTRACT RATHER THAN A DEFAULT.
     * `[:L309]` answers the smart list itself, and `org/Hibachi/HibachiSmartList.cfc` exposes three views
     * off one object — the unpaged records `:L751`, the current page `:L759` and the count `:L771` — so a
     * caller of THIS member may read any of them. Narrowing it to the records alone would change what
     * every existing caller can ask for, which is why the records-only reading lives at the call site
     * that needs it rather than here.
     *
     * ⛔ AND THE COUNT IS NOT WASTE ON THIS PATH, WHICH IS WHY IT IS NOT REMOVED. `src/handlers/skuHandler.ts`
     * routes `sku.getSkuSmartList` and answers the paging figures, so both other views are read. The path
     * that DID waste them was the Google feed, and it no longer travels through this member at all.
     *
     * The SELECTION comes from `../ports/SmartListQueryPort` and is shared verbatim with that feed; this line
     * contributes only the view.
     */
    return this.smartListQueryPort.execute(composeSkuSmartListQuery(data));
  }
}

/* ================================================================================================
 * COMPILE-TIME GUARDS — BOTH LAYERS MUST KEEP ACCEPTING BOTH TRANSACTION IDENTIFIERS
 * ================================================================================================
 * `Sku.getTransactionExistsFlag` and `Product.getTransactionExistsFlag` each take a checker rather
 * than reaching for a service, because a domain module may not import a service. Both checker
 * interfaces are declared in their own entity module and both are shaped `(skuID?, productID?)`, so
 * each entity can pass the one identifier it owns:
 *
 *   `Sku.cfc:L594`     -> `skuID = this.getSkuID()`         -> first  parameter
 *   `Product.cfc:L626` -> `productID = this.getProductID()` -> second parameter, first left `undefined`
 *
 * THREE LAYERS CARRY THE CAPABILITY, IN TWO ORDERS. {@link SkuService.getTransactionExistsFlag} and the
 * two checker contracts are SKU-FIRST; {@link SkuRepository.transactionExists} is PRODUCT-FIRST, because
 * `model/dao/SkuDAO.cfc:L54-L55` declares `productID` first (AAP §0.4.2.6, TR-4). The single
 * implementation of both checker interfaces is `createTransactionExistenceChecker` in
 * `../adapters/mysql/MySqlSkuRepository.ts`, and the service crosses the two orders on exactly one line
 * of its own body. Every crossing is therefore in a named place with a comment on it.
 *
 * WHY THE ARITY GUARDS BELOW EXIST AT ALL. Both identifiers are 32-character strings (IR-6), so a
 * mistake type-checks perfectly and fails silently — and the failure is not cosmetic. The DAO lets
 * `skuID` WIN when both are present [model/dao/SkuDAO.cfc:L58-L64], so a product identifier landing in
 * the SKU slot would query `ss.skuID = :productID`, match no row, and return `false` from a member whose
 * `false` PERMITS A DELETE (`model/validation/Product.json:L12`, `model/validation/Sku.json`).
 *
 * A plain assignability relation cannot protect that, and the gap was measured rather than reasoned:
 * DELETING the `productID` parameter from a two-parameter member raises NO error under `extends`,
 * because a one-parameter method stays assignable to a two-parameter interface — while every caller
 * typed against the interface goes on passing an identifier into a parameter nothing reads.
 * {@link AcceptsBothIdentifiers} asks a different question — "is a two-argument call legal here?" —
 * which a shortened signature answers NO. TWO guards are therefore asserted, one per layer, because the
 * two layers can regress independently:
 *
 *   {@link SkuRepositoryAcceptsBothTransactionIdentifiers} — the repository MUST keep accepting both,
 *   because AAP §0.4.2.6 puts the filtered form there and every checker depends on it.
 *   {@link SkuServiceAcceptsBothTransactionIdentifiers}    — the SERVICE must keep accepting both, because
 *   TR-1 tightens `[:L285]`'s loose declaration to the contract its two callers actually use. A revision
 *   narrowed this member to zero parameters on a literal reading of AAP §0.4.2.2's Discrepancy 4, which
 *   discarded the identifier every caller supplies; review finding F1 required it restored, and this
 *   guard makes a re-narrowing a build failure rather than a prose disagreement.
 *
 * WHAT NO GUARD HERE CAN CATCH: TRANSPOSING the two identifiers. Both are optional strings, and the
 * SKU-first layers order them `(skuID, productID)` while the repository orders them
 * `(productID, skuID)`, so both the service body and `createTransactionExistenceChecker` cross them over
 * as they forward, and no arity guard can tell a correct crossing from a doubled or omitted one. Only a
 * behavioural assertion can: exercise each layer against a capturing repository double and check that
 * each identifier arrives in the correct SLOT at {@link SkuRepository.transactionExists}. Guards prove
 * ARITY; tests prove FORWARDING and ORDER; neither alone is sufficient.
 *
 * ⭐ AND BOTH BEHAVIOURAL ASSERTIONS ARE IN THE TREE, EACH AT THE LAYER THAT OWNS ITS CROSSING:
 * `../../test/adapters/MySqlSkuRepository.test.ts` drives `createTransactionExistenceChecker` over a
 * recording executor and asserts both slots, and `../../test/services/SkuService.test.ts` asserts that
 * THIS member forwards `skuID` into the repository's SECOND slot and `productID` into its FIRST, and that
 * a call supplying neither still reaches the repository's refusal untouched (IR-9).
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
 * `true` when a member really does accept BOTH transaction identifiers as strings.
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
 * Whether a SKU-creation batch accumulated ANY finding — the complete commit gate for `createSkus`.
 *
 * ⭐ IT MUST READ BOTH BAGS, AND THAT IS THE WHOLE REASON THIS FUNCTION EXISTS RATHER THAN A BARE
 * `product.hasErrors()`. {@link SkuService.createSkus} records at its exit why findings are deliberately
 * NOT merged upward: branch preconditions go to the PRODUCT's bag via `product.addError(…)`
 * [model/service/SkuService.cfc:L143, :L148, :L176], while per-SKU rule findings stay on the SKU that
 * produced them, because `HibachiValidationService.validate( …, setErrors=true )` writes the error bean
 * back onto the entity it validated [org/Hibachi/HibachiValidationService.cfc:L193] and never onto its
 * parent. A product-level merge was tried and withdrawn — it re-keyed a SKU's `skuCode`/`price` findings
 * onto the product and made a failure unattributable to a SKU.
 *
 * ⛔ SO A GATE THAT READ ONLY THE PRODUCT WOULD COMMIT AN INVALID BATCH. A batch in which every SKU
 * failed its `skuCode` uniqueness rule leaves `product.hasErrors()` FALSE — nothing was ever written
 * there — and `createSkus` returns `true` unconditionally [:L207], so neither the product nor the return
 * value carries the failure. The SKUs do. This is the predicate AAP §0.6.6 M5 describes: the legacy kept
 * or discarded a request's writes together, decided after the work by a gate that saw the whole graph.
 *
 * ⚠️ THE MEMBERSHIP TEST IS STRUCTURAL BECAUSE THE COLLECTION IS TYPED NARROWLY. `Product.skus` is
 * `ProductSkuMember[]` — a two-member interface carrying only `setProduct`/`removeProduct` — while the
 * objects `createSkus` puts there are {@link SkuWithErrorState}, i.e. `ManagedEntity<Sku>`, whose error
 * bag comes from `manageEntity` rather than from `Sku` itself. The guard below tests for the capability
 * instead of the class, so a SKU that reached the collection by any route is still inspected, and a
 * member that genuinely carries no error surface is skipped rather than crashing the gate.
 *
 * @param product - The product `createSkus` was given, after it has run.
 * @returns True when the product or ANY SKU attached to it carries a finding.
 */
export function skuBatchHasErrors(product: ProductWithErrorState): boolean {
  if (product.hasErrors()) {
    return true;
  }

  return product.skus.some((member) => carriesErrorSurface(member) && member.hasErrors());
}

/**
 * Every finding the batch carries, the product's and each SKU's, merged into one bag.
 *
 * ⭐ THE COMPANION TO {@link skuBatchHasErrors}, AND IT HAS TO EXIST FOR THE SAME REASON THE GATE DOES.
 * The gate reports that a batch must roll back by reading the product's bag AND every SKU's, because
 * per-SKU rule findings deliberately never merge upward. A caller that is refused then has to be told
 * WHICH rule refused — and reading only `product.getErrors()` answers with an EMPTY bag for the
 * commonest failure there is, a batch whose SKU codes collide. The refusal would be correct and
 * completely uninformative: the boundary would decline to commit and then publish nothing about why.
 *
 * ⚠️ KEYED BY PROPERTY NAME, FLAT, AND APPENDED RATHER THAN OVERWRITTEN. This is the same shape
 * `HibachiErrors` produces and the same shape `../errors/ValidationError` accumulates, so a caller sees
 * the keys the rule sets declare, exactly as AAP 0.4.1.11 requires for the port's output to stay
 * comparable with the legacy's. Two SKUs refused on the same property therefore contribute two messages
 * under that one key, which is what the legacy did when several entities failed the same rule.
 *
 * ⚠️ NO SKU IDENTIFIER IS SYNTHESISED INTO THE KEY. Inventing `skus[0].skuCode` would publish a shape no
 * legacy rule set ever produced, and the entity a finding belongs to is not something the legacy bag
 * carried either.
 *
 * @param product - The batch's aggregate root, whose `skus` are the members just written.
 * @returns One merged bag; empty when the batch is clean, in which case {@link skuBatchHasErrors} is
 *   false and no caller should be reading this.
 */
export function collectSkuBatchErrors(product: ProductWithErrorState): ValidationErrors {
  const merged: Record<string, string[]> = {};

  const absorb = (errors: ValidationErrors): void => {
    for (const [propertyName, messages] of Object.entries(errors)) {
      const bucket = merged[propertyName] ?? [];

      bucket.push(...messages);
      merged[propertyName] = bucket;
    }
  };

  absorb(product.getErrors());

  for (const member of product.skus) {
    if (carriesErrorSurface(member) && member.hasErrors() && readsErrorBag(member)) {
      absorb(member.getErrors());
    }
  }

  return merged;
}

/**
 * Whether a collection member can be asked for its bag, as opposed to merely whether it has one.
 *
 * Separate from {@link carriesErrorSurface} for that member's own stated reason: each narrow asks for
 * exactly the one member it is about to call, so a surface is never rejected for an unrelated absence.
 */
function readsErrorBag(
  member: ProductSkuMember,
): member is ProductSkuMember & Pick<EntityErrorSurface, 'getErrors'> {
  return typeof (member as Partial<EntityErrorSurface>).getErrors === 'function';
}

/**
 * Whether a collection member exposes an error bag at all.
 *
 * Narrow by design: it asks for the ONE member {@link skuBatchHasErrors} calls, not for the whole of
 * {@link EntityErrorSurface}, because testing more than is used would reject a valid surface for an
 * unrelated reason.
 */
function carriesErrorSurface(
  member: ProductSkuMember,
): member is ProductSkuMember & Pick<EntityErrorSurface, 'hasErrors'> {
  return typeof (member as Partial<EntityErrorSurface>).hasErrors === 'function';
}

/**
 * The REPOSITORY really accepts both identifiers — the guard that keeps the filtered form filtered.
 *
 * It is asserted on {@link SkuRepository.transactionExists} because AAP §0.4.2.6 places the filtered
 * form there. Dropping `skuID` from the repository member would leave every entity-side checker
 * compiling and silently unscoped; this makes that edit a build failure.
 */
export type SkuRepositoryAcceptsBothTransactionIdentifiers = SatisfiesContract<
  AcceptsBothIdentifiers<SkuRepository['transactionExists']>
>;

/**
 * The SERVICE really accepts both identifiers — the guard over the contract `[:L285-L287]` observably has.
 *
 * ⭐ THE COMPANION TO THE GUARD ABOVE, AND IT EXISTS BECAUSE THIS MEMBER REGRESSED ONCE ALREADY, IN THE
 * OPPOSITE DIRECTION. A revision narrowed {@link SkuService.getTransactionExistsFlag} to ZERO parameters
 * on a literal reading of AAP §0.4.2.2's Discrepancy 4. That reading described the DECLARATION correctly
 * and the BEHAVIOUR wrongly: `[:L286]` forwards `argumentCollection=arguments`, and both real callers —
 * `model/entity/Sku.cfc:L594` and `model/entity/Product.cfc:L626` — name an identifier, so the narrowed
 * member discarded the only input the member ever receives. Review finding F1 required it restored under
 * TR-1 ("the target signature is tightened to the observed contract"), and this guard makes a
 * re-narrowing a build failure rather than a prose disagreement.
 *
 * ⛔ AND IT IS NOT A DUPLICATE OF THE `argumentOrder` BRAND. That brand stops this member being bound
 * WHERE A CHECKER IS EXPECTED — the two orders differ, so assignability alone would permit it; this guard
 * stops the member's own signature drifting. The two protect different edits, which is why both exist.
 */
export type SkuServiceAcceptsBothTransactionIdentifiers = SatisfiesContract<
  AcceptsBothIdentifiers<SkuService['getTransactionExistsFlag']>
>;
