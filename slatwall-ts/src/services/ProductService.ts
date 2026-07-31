/**
 * `ProductService` — the TypeScript port of `model/service/ProductService.cfc`, the largest of the
 * four Catalog services named by the prompt (367 lines, AAP §0.2.1.1).
 *
 * ==================================================================================================
 * WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT
 * ==================================================================================================
 * It is the preserved PUBLIC SURFACE of the legacy component: FIFTEEN declared members, at the exact
 * names, arity and argument order the legacy declares (TR-1), plus THREE members that the legacy never
 * declared anywhere and that only existed because `org/Hibachi/HibachiService.cfc:L255-L281` fabricated
 * them from a method-name prefix at run time (IR-1). Under `strict` TypeScript there is no equivalent
 * facility, so each synthesized call site becomes an explicit, compile-checked declaration.
 *
 * It is NOT a transliteration. Every framework mechanism the legacy leant on is replaced by a
 * declaration (TR-3): DI/1 property injection becomes constructor injection, `getService("name")`
 * string lookup becomes a typed collaborator, `extends="HibachiService"` plus `super.save()` becomes
 * composition against an injected base service (IR-8), the `onMissingMethod` CRUD surface becomes
 * declared methods, and the generic `processProduct(entity, data, context)` dispatcher becomes four
 * DIRECT, typed method calls. There is no string dispatcher, no `Proxy`, no `Reflect`, no indexer and
 * no service locator anywhere below.
 *
 * ==================================================================================================
 * THE FIFTEEN DECLARED MEMBERS, IN SOURCE ORDER (AAP §0.4.2.1)
 * ==================================================================================================
 *   `:L65`   loadDataFromFile                        M1 — the one-hour budget has no single-invocation form
 *   `:L70`   getFormattedOptionGroups                D25 — returns a MAP keyed by group NAME, not an array
 *   `:L104`  getProductSkusBySelectedOptions         the prompt's worked example; T1–T5 in §0.6.1.3
 *   `:L113`  processProductAddOptionGroup            D14 — only the FIRST option reaches existing SKUs
 *   `:L128`  processProductAddOption                 case-insensitive option matching and de-duplication
 *   `:L157`  processProductAddProductReview          TR-5 — ProductReview is out of scope
 *   `:L173`  processProductAddSubscriptionTerm       D6 — reads an `arguments.data` that is not a parameter
 *   `:L198`  processProductDeleteDefaultImage        unscoped `imageFile`; filesystem is out of scope
 *   `:L208`  processProductUpdateDefaultImageFileNames
 *   `:L216`  processProductUpdateSkus
 *   `:L235`  processProductUploadDefaultImage        TR-5 — no upload primitive crosses the boundary
 *   `:L264`  saveProduct                             the five-step path that BYPASSES the base save
 *   `:L294`  saveProductType                         by-reference `data` mutation + parent inheritance
 *   `:L317`  deleteProduct                           the load-bearing default-SKU null dance
 *   `:L342`  getProductSmartList                     Discrepancy 1 — `currentURL` is declared untyped
 *
 * THE THREE SYNTHESIZED MEMBERS THAT ARE USED, AND ONLY THOSE (AAP §0.4.2.5): `newProduct`,
 * `getProductType` and `getProduct`. `countProduct*`, `listProduct*` and `exportProduct*` are equally
 * synthesizable by the retired prefix dispatcher and equally absent from every call site in the slice,
 * so they are NOT declared. Synthesis is reproduced WHERE IT IS USED, never wholesale.
 *
 * ==================================================================================================
 * FOUR THINGS THAT ARE ABSENT ON PURPOSE — each an omission a reader would otherwise read as a bug
 * ==================================================================================================
 * ⛔ TODO(parity) D15 — `buildSkuCombinations`. `model/service/ProductService.cfc:L82-L97` declares a PRIVATE
 *    `buildSkuCombinations(Array storage, numeric position, any data, String currentOption)`. A
 *    repository-wide search finds exactly two occurrences of that identifier: its own declaration at
 *    `:L82` and its own recursive call at `:L91`. Nothing else in the repository calls it, so it is
 *    UNREACHABLE DEAD CODE. It has NO TypeScript member here, and AAP §0.4.1.8 records the omission as
 *    a decision. Porting it would add a live, testable member the legacy system does not have.
 *
 * ⛔ D5 — `getProductOptionsByGroup`. `model/entity/Product.cfc:L631-L633` calls
 *    `getProductService().getProductOptionsByGroup(this)`, and `ProductService` DECLARES NO SUCH
 *    MEMBER. The defect is carried on the domain side, where `Product.getProductOptionsByGroup()`
 *    raises with the locator; this service's explicit surface therefore has no such member. Inventing
 *    one here would repair a legacy defect (§0.6.7.3), which Guideline 4 forbids.
 *
 * ⛔ Two DEAD INJECTIONS. `model/service/ProductService.cfc:L54` declares `property name="productTypeDAO"`
 *    and `:L57` declares `property name="contentService"`. A call-site scan over the whole component
 *    finds ZERO uses of either accessor (§0.6.3.1), so neither is a collaborator and neither is wired
 *    here. No `ProductTypeService`, `ContentService` or `DataService` class is created or imported: the
 *    only member the legacy ever reached on `dataService` is `createUniqueURLTitle`, which AAP
 *    §0.4.1.11 makes a utility, so the dependency is narrowed to that utility plus the uniqueness probe
 *    it takes as a parameter.
 *
 * ⛔ `ImagePathPort` and `UniquePropertyPort` are READ but NOT IMPORTED. The image members this service
 *    retains need only `Sku.generateImageFileName(settings)`, which takes a setting resolver and no
 *    image port; and the uniqueness check that the `save` context performs belongs to the injected
 *    `Validator`, which already holds the port. Injecting either here would put an unused collaborator
 *    on the constructor (S5).
 *
 * ==================================================================================================
 * EXECUTION-MODEL MISMATCHES CARRIED AS FLAGS, NOT RESOLVED (AAP §0.6.6, S8)
 * ==================================================================================================
 *   M1  `:L66` raises the request timeout to 3600 SECONDS before delegating the import. AWS Lambda's
 *       maximum function timeout is 15 minutes, so the budget is UNREPRESENTABLE in one invocation. It
 *       is neither silently re-timed to 900 seconds nor to any invented value; see `loadDataFromFile`.
 *   M6  `saveProduct` creates and validates SKUs while the product is still TRANSIENT and persists it
 *       afterwards. The ordering is sequential and load-bearing; see that member.
 *   M7  this class is a SINGLETON in the legacy DI/1 declarations and is memoized across warm Lambda
 *       invocations by the composition root. It therefore holds NO mutable state: every field is
 *       `readonly` and set once in the constructor, and no member writes to `this`. Per-request
 *       memoization lives on the entities, which are per-request objects.
 *
 * ==================================================================================================
 * VALIDATION — WHY THIS SERVICE OWNS THE PROCESS PIPELINE
 * ==================================================================================================
 * The legacy never called `processProduct_addOption` directly. It called the generic
 * `process(entity, data, processContext)` at `org/Hibachi/HibachiService.cfc:L84-L120`, which
 * (1) validated the ENTITY under the process context at `:L96`, (2) populated and validated the
 * process object at `:L99-L108` when one existed for that context, and (3) invoked
 * `process<ClassName>_<context>` at `:L112-L118` ONLY IF `!entity.hasErrors()`.
 *
 * TR-3 retires the dispatcher, and the handler layer is a thin AWS boundary (AAP §0.4.1.9), so the
 * pipeline has exactly one honest home: these public members. Each one therefore runs
 * `Validator.validateProcess` — itself the declared port of `:L84-L120` — records the entity findings
 * on the entity exactly as `HibachiTransient.validate()` does, and performs its body only when the
 * ENTITY has no errors. Population is NOT re-performed: a typed process object arrives already
 * populated, which is the same state `:L102-L105` leaves it in.
 *
 * ⚠️ THE GATE READS ENTITY ERRORS ONLY, AND THAT IS NOT AN OVERSIGHT. `:L112` is
 * `if(!arguments.entity.hasErrors())`, and `HibachiTransient.hasErrors()`
 * (`org/Hibachi/HibachiTransient.cfc:L47-L53`) inspects that object's OWN bag. Process-object findings
 * do not reach the entity, and they do not reach the commit gate either: the ORM error flag is raised
 * at `org/Hibachi/HibachiTransient.cfc:L455-L457` only `if(this.isPersistent() && this.hasErrors())`,
 * and a process object is not persistent. So a process object carrying findings still lets the body
 * run, and still lets the request commit. Preserved, not harmonised (Guideline 4).
 *
 * ⚠️ AND THE PROCESS-OBJECT BAG HAS NO HOME HERE, WHICH IS STATED RATHER THAN HIDDEN. The legacy
 * records those findings on the process object itself, where a controller reads them. The ported
 * process objects — `../domain/process/ProductUpdateSkus` and its two siblings — are PLAIN DATA
 * INTERFACES with no error surface, which is their declared contract and not this file's to change.
 * The findings are therefore evaluated (so the behaviour of the two-pass pipeline is preserved) and
 * returned by the private helper, but they are written nowhere. That is an information boundary, and
 * it is recorded here so the absence reads as a decision.
 *
 * ==================================================================================================
 * TEST PROVENANCE (S6, AAP §0.6.5)
 * ==================================================================================================
 * NO `ProductServiceTest` EXISTS ANYWHERE UNDER `meta/tests/`. Every one of the eighteen members below
 * is therefore NET-NEW coverage, and each member's own documentation says so. The legacy signal that
 * does exist touches this service only INDIRECTLY, through four regressions in
 * `meta/tests/unit/IssuesTest.cfc` — `issue_1097` (populate, save then delete a product carrying a
 * nested product-type struct), `issue_1296` and `issue_1329` (`getProductSmartList`), and `issue_1331`
 * (`newProduct` then `getProductType('444df313ec53a08c32d8ae434af5819a')`) — plus
 * `meta/tests/unit/entity/ProductTest.cfc`, which asserts an ENTITY member and not a service member.
 * Those are labelled TRACEABLE where they touch a member, and the member is still net-new.
 *
 * ==================================================================================================
 * STANDARDS (AAP §0.7.3; `review_rules` reports NO USER RULES, so the S1–S9 bar applies instead)
 * ==================================================================================================
 *   S1 strict typing, no explicit `any`, every `unknown` narrowed by a private structural guard.
 *   S2 no SQL. `SwProduct` and `SwProductType` appear only as the table DISCRIMINATOR argument that
 *      `../util/urlTitle` passes through to the injected probe — never inside a statement.
 *   S3 constructor injection only; the base service is COMPOSED, never extended.
 *   S4 imports confined to `domain`, `ports`, `validation`, `util`, `errors` and sibling services. No
 *      adapter, config, handler or integration import; no `mysql2`, no AWS type, no `process.env`, no
 *      `node:fs`, `node:path` or `node:url`.
 *   S5 nothing is added: no new file, no new dependency, no new service and no invented port.
 *   S7 defects are preserved and annotated — never repaired.
 *   S9 nothing is invented: no retry, no timeout, no page size, no batch size and no service level.
 */

import { assignPropertyValue, clearPropertyValue, populate } from '../domain/base/populate';
import type { PropertyDescriptorSet } from '../domain/base/populate';
import type { Option } from '../domain/option/Option';
import type { OptionGroup } from '../domain/option/OptionGroup';
import type { ProductAddOption } from '../domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../domain/process/ProductAddOptionGroup';
import { PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS } from '../domain/process/ProductUpdateSkus';
import type { ProductUpdateSkus } from '../domain/process/ProductUpdateSkus';
import { Product } from '../domain/product/Product';
import type {
  ProductDefaultSkuDelegate,
  ProductOptionFinder,
  ProductOptionGroupFinder,
  ProductPropertyName,
  ProductSettingResolver,
  ProductUnusedOptionFinder,
} from '../domain/product/Product';
import type {
  ProductType,
  ProductTypePropertyName,
  ProductTypeRootResolver,
} from '../domain/product/ProductType';
import { Sku } from '../domain/sku/Sku';
import type { DefaultSkuIdReader, SkuSettingResolver } from '../domain/sku/Sku';
import { DomainError, LegacyParityError, NotImplementedError } from '../errors/DomainError';
import { FILE_UPLOAD_RBKEY } from '../errors/ValidationError';
import type { AccountContextPort, AccountReference } from '../ports/AccountContextPort';
import type { PopulationAuthorizationPort } from '../ports/AccountContextPort';
import { validateProductImportSource } from '../ports/repositories/ProductRepository';
import type {
  ProductImportSource,
  ProductImportSourcePolicy,
  ProductRepository,
} from '../ports/repositories/ProductRepository';
import type { SkuRepository } from '../ports/repositories/SkuRepository';
import type { SettingResolverPort } from '../ports/SettingResolverPort';
import { translateSmartListInput } from '../ports/SmartListQueryPort';
import type {
  SmartListEntityName,
  SmartListInput,
  SmartListJoin,
  SmartListKeywordProperty,
  SmartListPropertyIdentifier,
  SmartListQuery,
  SmartListQueryPort,
  SmartListResult,
} from '../ports/SmartListQueryPort';
import type {
  SubscriptionTermPort,
  SubscriptionTermReference,
} from '../ports/SubscriptionTermPort';
import { productValidationRuleSet } from '../validation/rules/product.rules';
import type { ProductValidationSubject } from '../validation/rules/product.rules';
import { productUpdateSkusValidationRuleSet } from '../validation/rules/productUpdateSkus.rules';
import type { ProductUpdateSkusValidationSubject } from '../validation/rules/productUpdateSkus.rules';
import type {
  ProcessObjectValidationTarget,
  ProcessValidationResult,
  ValidationContext,
  Validator,
} from '../validation/Validator';
import { createUniqueURLTitle } from '../util/urlTitle';
import type { UniqueValueProbe, UrlTitleAttemptBudget } from '../util/urlTitle';
import type { BaseService, BaseServiceEntity, EntityPersister } from './BaseService';
import type { OptionService, SelectOption } from './OptionService';
import type { ProductWithErrorState, SkuService } from './SkuService';

/* ================================================================================================
 * SECTION 1 — DISCRIMINATORS AND LITERALS TRANSCRIBED FROM THE SOURCE
 *
 * Every value below is read off the legacy source, and every one is data rather than SQL (S2).
 * ============================================================================================== */

/**
 * The ORM entity name the smart-list override assigns at `model/service/ProductService.cfc:L343`
 * (`arguments.entityName = "SlatwallProduct"`) and the parent name it names at `:L347-L349`.
 *
 * Declared as a module literal rather than imported from `../domain/product/Product`, whose
 * `PRODUCT_ENTITY_NAME` is widened to `string` and therefore not assignable to
 * {@link SmartListEntityName}. `../services/SkuService` reaches the same conclusion for the same
 * reason, so the two files agree by construction rather than by coincidence.
 */
const PRODUCT_ENTITY_NAME = 'SlatwallProduct' satisfies SmartListEntityName;

/** The ORM entity name behind `productService.getProductType(id)` — see AAP §0.4.2.5. */
const PRODUCT_TYPE_ENTITY_NAME = 'SlatwallProductType' satisfies SmartListEntityName;

/** `model/entity/Product.cfc:L52` — the primary key `getProduct(id)` filters on. */
const PRODUCT_ID_PROPERTY = 'productID' satisfies SmartListPropertyIdentifier<'SlatwallProduct'>;

/** `model/entity/ProductType.cfc:L52` — the primary key `getProductType(id)` filters on. */
const PRODUCT_TYPE_ID_PROPERTY =
  'productTypeID' satisfies SmartListPropertyIdentifier<'SlatwallProductType'>;

/**
 * The table discriminator `model/service/ProductService.cfc:L269` hands to
 * `createUniqueURLTitle(titleString=…, tableName="SwProduct")`.
 *
 * ⚠️ THIS IS NOT SQL (S2). It travels no further than the `tableName` parameter of
 * `../util/urlTitle`, which passes it to the injected {@link UniqueValueProbe} without composing a
 * statement. No statement, fragment, placeholder or identifier is written in this file.
 */
const PRODUCT_TABLE_NAME = 'SwProduct';

/** The same discriminator for the product-type path — `model/service/ProductService.cfc:L296`. */
const PRODUCT_TYPE_TABLE_NAME = 'SwProductType';

/** `model/entity/Product.cfc:L71` — the property the delete path clears and conditionally restores. */
const PRODUCT_DEFAULT_SKU_PROPERTY = 'defaultSku' satisfies ProductPropertyName;

/**
 * The weight every one of the five keyword properties is registered with at
 * `model/service/ProductService.cfc:L351-L355`. All five pass `weight=1`; none differs.
 */
const PRODUCT_KEYWORD_PROPERTY_WEIGHT = 1;

/**
 * The three related-property joins of `model/service/ProductService.cfc:L347-L349`, in declaration
 * order, with the join type each line declares.
 *
 * ⚠️ THE THIRD IS A LEFT JOIN AND THE FIRST TWO ARE NOT. `:L349` passes the third positional argument
 * `"left"`; `:L347` and `:L348` omit it, so those two are inner joins. Making all three left joins
 * would admit products with no product type and no default SKU into every keyword search, and making
 * the brand join inner would silently drop every brandless product. Both halves are behaviour.
 */
const PRODUCT_SMART_LIST_JOINS: readonly SmartListJoin[] = Object.freeze([
  Object.freeze({ parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'productType' }),
  Object.freeze({ parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'defaultSku' }),
  Object.freeze({
    parentEntityName: PRODUCT_ENTITY_NAME,
    relatedProperty: 'brand',
    joinType: 'left',
  }),
] satisfies SmartListJoin[]);

/**
 * The five keyword properties of `model/service/ProductService.cfc:L351-L355`, IN DECLARATION ORDER.
 *
 * Order is preserved because the legacy appends to an ordered array and the query builder emits the
 * per-property predicates in that order; nothing here sorts, de-duplicates or re-weights them. Note
 * that two are RELATED-property paths (`brand.brandName`, `productType.productTypeName`), which is
 * exactly why the joins above must be registered alongside them.
 */
const PRODUCT_SMART_LIST_KEYWORD_PROPERTIES: readonly SmartListKeywordProperty[] = Object.freeze([
  Object.freeze({ propertyIdentifier: 'calculatedTitle', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'brand.brandName', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'productName', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'productCode', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({
    propertyIdentifier: 'productType.productTypeName',
    weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT,
  }),
] satisfies SmartListKeywordProperty[]);

/** The CFML list delimiter `listLen`/`listGetAt` default to, used by the selected-options split. */
const CFML_LIST_DELIMITER = ',';

/**
 * The separator `model/service/ProductService.cfc:L183` places between the product code and the
 * ordinal when it composes a subscription SKU's code: `product.getProductCode() & "-#…#"`.
 */
const SKU_CODE_SEGMENT_DELIMITER = '-';

/** `model/service/ProductService.cfc:L295` / `:L297` — the payload key the URL title is written to. */
const URL_TITLE_DATA_KEY = 'urlTitle';

/** `model/service/ProductService.cfc:L296` — the payload key preferred as the title source. */
const PRODUCT_TYPE_NAME_DATA_KEY = 'productTypeName';

/** `model/service/ProductService.cfc:L199` — the payload key the delete-image guard tests for. */
const IMAGE_FILE_DATA_KEY = 'imageFile';

/** `model/service/ProductService.cfc:L131` — the creation-data key carrying the option-ID list. */
const OPTIONS_DATA_KEY = 'options';

/** `model/service/ProductService.cfc:L132` — the creation-data key carrying the default SKU price. */
const PRICE_DATA_KEY = 'price';

/** `model/service/ProductService.cfc:L136` — the conditionally added list-price key. */
const LIST_PRICE_DATA_KEY = 'listPrice';

/**
 * `model/service/ProductService.cfc:L200-L201` — the path segment appended to the image folder
 * setting when the default image is deleted. Transcribed WITH its trailing slash, because the legacy
 * concatenates the file name directly after it.
 */
const PRODUCT_DEFAULT_IMAGE_PATH_SEGMENT = '/product/default/';

/**
 * `model/service/ProductService.cfc:L240` — the upload directory segment. Transcribed WITHOUT a
 * trailing slash, because `:L241` supplies the separator itself when it composes the full path. The
 * two constants are deliberately not merged: they are two different literals in the source.
 */
const PRODUCT_DEFAULT_IMAGE_UPLOAD_DIRECTORY_SEGMENT = '/product/default';

/** `model/service/ProductService.cfc:L241` — the separator between directory and file name. */
const IMAGE_PATH_SEPARATOR = '/';

/**
 * `model/service/ProductService.cfc:L249` — the process property whose metadata carries the accepted
 * MIME types for the default-image upload.
 */
const UPLOAD_FILE_PROPERTY_NAME = 'uploadFile';

/** `model/service/ProductService.cfc:L160` — the approved review's active flag. */
const REVIEW_ACTIVE_FLAG_APPROVED = 1;

/** `model/service/ProductService.cfc:L163` — the pending review's active flag. */
const REVIEW_ACTIVE_FLAG_PENDING = 0;

/**
 * The four process contexts this service owns, each a member of {@link ValidationContext}.
 *
 * ⚠️ `updateDefaultImageFileNames`, `deleteDefaultImage`, `uploadDefaultImage` and `addProductReview`
 * ARE ABSENT, AND THAT MATCHES BOTH SOURCES. `model/validation/Product.json` declares rules for five
 * contexts only — `save`, `delete`, `addOptionGroup`, `addOption` and `addSubscriptionTerm` — so the
 * other four contexts have nothing to evaluate, and `../validation/Validator` narrows
 * {@link ValidationContext} to exclude them at compile time. For those members the pipeline reduces
 * to its invocation gate alone, which is reproduced where each one needs it.
 */
type ProductProcessContext = Extract<
  ValidationContext,
  'addOptionGroup' | 'addOption' | 'addSubscriptionTerm' | 'updateSkus'
>;

/* ================================================================================================
 * SECTION 2 — COMPILE-TIME PROOFS
 *
 * Each alias below fails to compile if a collaborator stops fitting the interface this service hands
 * it to. They cost nothing at run time — `import type` erases and a type alias emits no code — and
 * they turn a silent structural drift in a sibling file into a build failure here.
 * ============================================================================================== */

/** Resolves to `TActual` only when `TActual` is assignable to `TExpected`. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * `Product` carries its own error surface, so it is already the shape
 * `SkuService.createSkus` requires and no wrapping is needed at either call site.
 */
export type ProductSatisfiesSkuServiceContract = AssertAssignable<Product, ProductWithErrorState>;

/**
 * `Product` is already a validation subject for `../validation/rules/product.rules`, which is what
 * lets the save path hand the entity itself to the validator and the process paths hand it a view
 * that merely ADDS the resolved derived values.
 */
export type ProductSatisfiesValidationSubject = AssertAssignable<Product, ProductValidationSubject>;

/**
 * The setting resolver satisfies BOTH entity-side contracts, which is why one collaborator serves
 * `Product.getTitle(settings)` and `Sku.generateImageFileName(settings)` without an adapter.
 */
export type SettingResolverSatisfiesProductContract = AssertAssignable<
  SettingResolverPort,
  ProductSettingResolver
>;
export type SettingResolverSatisfiesSkuContract = AssertAssignable<
  SettingResolverPort,
  SkuSettingResolver
>;

/**
 * `OptionService` satisfies all three option-finding contracts `Product` declares, so the single
 * injected sibling serves every option lookup rather than three separate collaborators.
 */
export type OptionServiceSatisfiesOptionGroupFinder = AssertAssignable<
  OptionService,
  ProductOptionGroupFinder
>;
export type OptionServiceSatisfiesOptionFinder = AssertAssignable<
  OptionService,
  ProductOptionFinder
>;
export type OptionServiceSatisfiesUnusedOptionFinder = AssertAssignable<
  OptionService,
  ProductUnusedOptionFinder
>;

/**
 * A term resolved through `../ports/SubscriptionTermPort` fits `Sku.setSubscriptionTerm` directly.
 * `SubscriptionTermRef` additionally declares an OPTIONAL name, so the narrower port reference is
 * assignable and no shim is required at `model/service/ProductService.cfc:L184`.
 */
export type SubscriptionTermReferenceFitsSku = AssertAssignable<
  SubscriptionTermReference,
  Parameters<Sku['setSubscriptionTerm']>[0]
>;

/**
 * `Product` and `ProductType` both fit the base service's entity constraint at their own property-name
 * unions, which is what makes the two `Pick<BaseService<…>>` aliases below legal instantiations rather
 * than wishful ones.
 */
export type ProductFitsBaseService = AssertAssignable<
  Product,
  BaseServiceEntity<ProductPropertyName>
>;

/* ================================================================================================
 * SECTION 3 — NARROW COLLABORATOR CONTRACTS
 *
 * The base service is COMPOSED, never extended (IR-8, S3). `model/service/BrandService.cfc:L76` calls
 * `super.save()`, and that call resolves to the LOCAL override at `model/service/HibachiService.cfc:L86`
 * rather than to the framework base — a distinction that matters because the local override adds
 * behaviour. This service inherits from neither: it declares exactly the members it calls.
 * ============================================================================================== */

/**
 * The single base-service member the product path uses: `super.delete(…)` at
 * `model/service/ProductService.cfc:L326`.
 *
 * ⚠️ `save` IS DELIBERATELY ABSENT FROM THIS CONTRACT. `saveProduct` does NOT call the base save — it
 * persists directly at `:L286-L288` — and declaring a member this service never calls would obscure
 * exactly the asymmetry that {@link ProductService.saveProduct} exists to preserve.
 */
export type ProductBaseService = Pick<BaseService<Product, ProductPropertyName>, 'delete'>;

/**
 * The single base-service member the product-type path uses: `super.save(…)` at
 * `model/service/ProductService.cfc:L303`.
 *
 * A SECOND, DIFFERENTLY TYPED BASE SERVICE IS REQUIRED and is not duplication. The base service is
 * generic over its entity and that entity's property-name union, and the two members this service
 * needs are on two different instantiations: `delete` on the product one, `save` on the product-type
 * one. Collapsing them would mean widening one instantiation until it accepted both entities, which
 * would give up the compile-time guarantee that a product is never saved through the product-type
 * rule set and vice versa.
 */
export type ProductTypeBaseService = Pick<
  BaseService<ProductType, ProductTypePropertyName>,
  'save'
>;

/**
 * The two validator members this service calls — nothing more.
 *
 * `validate` ports `arguments.product.validate( context="save" )` at
 * `model/service/ProductService.cfc:L273`; `validateProcess` ports the whole two-pass pipeline of
 * `org/Hibachi/HibachiService.cfc:L84-L120` that the retired dispatcher used to run around every
 * `processProduct_*` member. Narrowing to a `Pick` rather than taking the class keeps the contract
 * exact — it cannot drift from the real implementation — while leaving a test double free to supply
 * two functions and no uniqueness port.
 */
export type ProductProcessValidator = Pick<Validator, 'validate' | 'validateProcess'>;

/* ================================================================================================
 * SECTION 4 — STRUCTURAL CONTRACTS FOR THE THREE OUT-OF-SCOPE PROCESS OBJECTS
 *
 * `Product_AddProductReview.cfc`, `Product_AddSubscriptionTerm.cfc` and
 * `Product_UploadDefaultImage.cfc` are ALL EXPLICITLY OUT OF SCOPE (AAP §0.2.2.4), so no ported domain
 * type exists for any of them and none is created here (S5). AAP §0.4.2.1 types those three parameters
 * `unknown`, and S1 forbids leaving an `unknown` unnarrowed, so each is narrowed by a PRIVATE
 * STRUCTURAL GUARD that asks only for the members the legacy body actually reads.
 *
 * Asking for less than the body reads would push the failure into the body; asking for more would
 * invent a contract for an excluded component. Each interface below is therefore exactly the observed
 * read set, with its locator.
 * ============================================================================================== */

/**
 * The review object `model/service/ProductService.cfc:L160`, `:L163` and `:L167` mutate.
 *
 * ⚠️ `setAccount` RECEIVES AN {@link AccountReference}, NOT AN ACCOUNT ENTITY. `:L167` passes
 * `getHibachiScope().getAccount()`, and `Account` is excluded (AAP §0.2.2.1). The account context port
 * is the only currency that crosses the boundary, and it is what is passed. Recorded as a translation
 * decision, not as equivalence.
 */
interface ProductReviewTarget {
  setActiveFlag(activeFlag: number): void;
  setAccount(account: AccountReference): void;
}

/** The `addProductReview` process object — one read, at `model/service/ProductService.cfc:L160`. */
interface ProductReviewProcessObject {
  getNewProductReview(): ProductReviewTarget;
}

/**
 * The `addSubscriptionTerm` process object — four reads, at
 * `model/service/ProductService.cfc:L175`, `:L178`, `:L179` and `:L180`.
 *
 * The three price members return `unknown` because the legacy declares no type for them and because
 * `:L180` proves the code itself does not trust the shape: it tests `!= ""` AND `isNumeric(…)` before
 * using the value. Typing them `number` would erase the very guard that makes D6 reachable.
 */
interface SubscriptionTermProcessObject {
  getSubscriptionTermID(): string;
  getPrice(): unknown;
  getRenewalPrice(): unknown;
  getListPrice(): unknown;
}

/**
 * The metadata `model/service/ProductService.cfc:L249` reads off the `uploadFile` property to obtain
 * the accepted MIME types. The attribute keeps its legacy spelling, `hb_fileAcceptMIMEType`, because
 * that is the key the excluded component declares.
 */
interface UploadFilePropertyMetaData {
  readonly hb_fileAcceptMIMEType?: string;
}

/**
 * The `uploadDefaultImage` process object — three reads, at
 * `model/service/ProductService.cfc:L241`, `:L249` and `:L253`.
 */
interface UploadDefaultImageProcessObject {
  getImageFile(): string;
  getPropertyMetaData(propertyName: string): UploadFilePropertyMetaData;
  addError(errorName: string, errorMessage: string): void;
}

/* ================================================================================================
 * SECTION 5 — THE COLLABORATOR GRAPH
 * ============================================================================================== */

/**
 * Everything this service needs, named.
 *
 * WHY A NAMED OBJECT RATHER THAN POSITIONAL PARAMETERS. `../services/BrandService` takes three
 * collaborators and `../services/SkuService` ten, and both take them positionally; this service needs
 * SIXTEEN, and four of them are bare functions or plain records whose types do not distinguish them
 * from one another. A transposition between two same-shaped positional arguments compiles cleanly and
 * fails at run time. `../services/BaseService` already resolves the same problem the same way, with a
 * `BaseServiceCollaborators` object, so this follows an in-repository precedent rather than inventing a
 * convention — and it makes the composition root's wiring readable at the call site.
 *
 * Every member is a LIVE EDGE, verified by counting call sites in the legacy component (§0.6.3.1). The
 * two dead injections are absent, and so are the four framework facilities that §0.6.3.1 classifies as
 * excluded or narrowed.
 */
export interface ProductServiceCollaborators {
  /**
   * `property name="productDAO"` — `model/service/ProductService.cfc:L53`, ONE call site, at `:L67`.
   */
  readonly productRepository: ProductRepository;

  /**
   * `property name="skuDAO"` — `model/service/ProductService.cfc:L52`, ONE call site, at `:L105`.
   */
  readonly skuRepository: SkuRepository;

  /**
   * `property name="skuService"` — `model/service/ProductService.cfc:L58`, THREE call sites, at
   * `:L150`, `:L176` and `:L279`.
   */
  readonly skuService: SkuService;

  /**
   * `property name="optionService"` — `model/service/ProductService.cfc:L60`, THREE call sites, at
   * `:L76`, `:L115` and `:L130`. Serves as all three of `Product`'s option-finder contracts; see the
   * proofs in section 2.
   */
  readonly optionService: OptionService;

  /** The composed base service for the product delete path — `model/service/ProductService.cfc:L326`. */
  readonly baseService: ProductBaseService;

  /** The composed base service for the product-type save path — `model/service/ProductService.cfc:L303`. */
  readonly productTypeBaseService: ProductTypeBaseService;

  /** The validator behind `:L273` and behind the retired process pipeline. */
  readonly validator: ProductProcessValidator;

  /**
   * `getHibachiScope().setting(…)` at `model/service/ProductService.cfc:L200`, `:L201` and `:L240`,
   * plus `product.setting(…)` at `:L159` and the title and image-file-name members the retained code
   * reaches. IR-2 — a narrow setting port, not the platform-wide settings engine.
   */
  readonly settings: SettingResolverPort;

  /**
   * `getHibachiScope().getLoggedInFlag()` at `model/service/ProductService.cfc:L166` and
   * `getHibachiScope().getAccount()` at `:L167`.
   */
  readonly accountContext: AccountContextPort;

  /** The paginated dynamic-query abstraction behind `:L345` and behind the two `get*` members. */
  readonly smartListQueryPort: SmartListQueryPort;

  /**
   * `property name="subscriptionService"` — `model/service/ProductService.cfc:L59`, ONE call site, at
   * `:L175`. Crosses the boundary as a port because the subscription domain is excluded (TR-5).
   */
  readonly subscriptionTermPort: SubscriptionTermPort;

  /**
   * Resolves a product type's root ancestor so `Product.getBaseProductType(…)` can answer the
   * discriminator the three process contexts gate on.
   *
   * ⚠️ THIS IS NOT THE DEAD `productTypeDAO` INJECTION, and it is not this service's own
   * {@link ProductService.getProductType} either: that member answers `ProductType | null` while the
   * resolver's contract answers `… | undefined`, so the two are not interchangeable and the resolver is
   * supplied by the composition root.
   */
  readonly productTypeRootResolver: ProductTypeRootResolver;

  /** The population contract `model/service/ProductService.cfc:L266` drives — `product.populate(data)`. */
  readonly productPropertyDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;

  /** The population authorisation gate of `org/Hibachi/HibachiTransient.cfc:L186-L190`. */
  readonly populationAuthorization: PopulationAuthorizationPort;

  /**
   * The uniqueness probe `createUniqueURLTitle` calls once per collision candidate.
   *
   * ONE PROBE SERVES BOTH TABLES because the probe's own contract takes the table name as its first
   * parameter, exactly as `model/service/DataService.cfc:L53` declares
   * `createUniqueURLTitle(titleString, tableName)` and `model/dao/DataDAO.cfc:L126` receives it. A
   * second, table-specific probe would duplicate that parameter in the type system.
   */
  readonly isUrlTitleAvailable: UniqueValueProbe;

  /**
   * The collision-probe bound, passed straight through to `../util/urlTitle`.
   *
   * S9 — this service states no number of its own. The value travels from the composition root to the
   * utility unchanged, exactly as `../services/BrandService` passes its own.
   */
  readonly urlTitleAttemptBudget: UrlTitleAttemptBudget;

  /**
   * The direct persister behind `getHibachiDAO().save(target=arguments.product)` at
   * `model/service/ProductService.cfc:L287`.
   *
   * ⚠️ IT IS A NARROW CALLBACK RATHER THAN A REPOSITORY MEMBER ON PURPOSE.
   * `../ports/repositories/ProductRepository` declares the three BUSINESS QUERIES the legacy
   * `ProductDAO` declares and nothing else; adding a generic `save` to it would widen a
   * business-query port into a CRUD port to serve one call site. The narrow persister expresses the
   * one thing that call site needs.
   */
  readonly persistProduct: EntityPersister<Product>;

  /**
   * The operator's import-source policy, required by `../ports/repositories/ProductRepository`.
   *
   * ⚠️ THE POLICY IS INJECTED, NEVER WRITTEN DOWN. That port's own contract states that every policy
   * value is supplied at the composition root and that no default may appear in code, and it names the
   * refusal path as the caller's obligation. This service therefore holds the policy and runs the gate;
   * it invents no scheme, host, size cap, timeout or redirect count (S9).
   */
  readonly importSourcePolicy: ProductImportSourcePolicy;

  /**
   * Reads the identifier of the delegate held in `Product.defaultSku`.
   *
   * ⚠️ WHY THIS IS NECESSARY, AND WHY IT IS NOT AN INVENTED PORT.
   * `model/service/ProductService.cfc:L185` and `:L188` read
   * `arguments.product.getDefaultSku().getSubscriptionBenefits()` — they need the default SKU AS AN
   * ENTITY. In the ported domain `Product.defaultSku` is declared
   * `ProductDefaultSkuDelegate`, NOT `Sku`: `../domain/sku/Sku` records in its own mismatch register
   * that `Sku` IS DELIBERATELY NOT ASSIGNABLE to that interface, because the delegate wants nine
   * synchronous argument-free readers while the entity's equivalents are asynchronous and
   * port-parameterised, and it names the resolution — a thin binder in the composition root. So the
   * value in that slot is a WRAPPER closing over a SKU, and an `instanceof Sku` test against it is
   * false at run time. Nothing on the delegate exposes a benefit collection.
   *
   * `../domain/sku/Sku` already faced this exact identity question and already exports the answer:
   * {@link Sku.getDefaultFlag} takes a `DefaultSkuIdReader` and compares its result with `skuID`.
   * The same exported type is reused here rather than a second one being declared (S5), and the
   * default SKU entity is then located among `Product.getSkus()` — where it is guaranteed to be,
   * since `Sku.setProduct` appends to that live collection and `SwSku.productID` is the legacy's own
   * back-reference. No port file is created and no adapter is imported (S3, S4).
   */
  readonly defaultSkuIdReader: DefaultSkuIdReader;
}

/* ================================================================================================
 * SECTION 6 — CFML VALUE SEMANTICS
 *
 * The legacy reads untyped values out of structs and out of process objects and lets CFML coerce them.
 * The ported fields are strongly typed, so the coercion has to be written down. These helpers
 * reproduce CFML's rules; they are module-private, and they mirror the equivalents in
 * `../services/SkuService` member for member so the two services cannot disagree about what a legacy
 * value means.
 * ============================================================================================== */

/**
 * CFML's `isNumeric`, as applied to a value read out of a struct or a process object.
 *
 * The pattern admits an optional sign, digits with an optional fractional part, a leading-dot form and
 * scientific notation — and rejects an empty or blank string, which is the case
 * `model/service/ProductService.cfc:L180` guards against explicitly.
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
 * CFML's numeric coercion. Booleans become 1 and 0, as CFML's own numeric cast does; anything that
 * `isNumeric` rejects yields `NaN` rather than a fabricated zero, so a caller must decide what to do
 * about it rather than silently storing a number the payload never contained.
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

/**
 * CFML's `isSimpleValue` — a string, a number or a boolean, and nothing else.
 *
 * Spelled exactly as `../services/SkuService` spells it, rather than as a second predicate with the
 * same name and different edges (S5). It matters because CFML's string and numeric casts RAISE on a
 * complex value rather than coercing it, so every coercion below has to know the difference.
 */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Whether CFML's boolean cast would accept the value at all, rather than raising. */
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

/** CFML's boolean cast, for values {@link readsAsCfmlBoolean} has already accepted. */
function toCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  /* Only a string can reach here: the two branches above take booleans and numbers, and
   * `readsAsCfmlBoolean` — which every caller applies first — rejects every other type. */
  const normalised = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalised === 'true' || normalised === 'yes') {
    return true;
  }
  if (normalised === 'false' || normalised === 'no') {
    return false;
  }
  return toCfmlNumber(normalised) !== 0;
}

/**
 * `structKeyExists(data, key)`, using an own-property test so an inherited key cannot masquerade as a
 * supplied one.
 */
function dataKeyExists(data: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(data, key);
}

/**
 * CFML's `len(data.key)` for a payload value, expressed as a length.
 *
 * Non-simple values yield zero, which is what the legacy guards effectively see: `len()` raises on a
 * struct or array, and the guards that call it are always reached with simple values in practice. Zero
 * is the conservative reading and it keeps the guard's meaning — "the payload supplied nothing usable".
 */
function dataValueLength(data: Record<string, unknown>, key: string): number {
  if (!dataKeyExists(data, key)) {
    return 0;
  }
  const value = data[key];
  if (typeof value === 'string') {
    return value.length;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).length;
  }
  return 0;
}

/** The payload value as CFML would render it in a string context, or `undefined` when unusable. */
function dataValueText(data: Record<string, unknown>, key: string): string | undefined {
  if (!dataKeyExists(data, key)) {
    return undefined;
  }
  const value = data[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/** CFML's `!isNull(x) && len(x)` for an entity string property. */
/**
 * CFML's `value != ""` on an untyped value — the FIRST half of the guard at
 * `model/service/ProductService.cfc:L180`.
 *
 * CFML compares with `!=` by coercing both sides to strings, so this is a test for "renders as
 * something other than the empty string". It is kept as its own predicate, rather than folded into the
 * numeric test that follows it, because the source states two clauses and a reader checking parity
 * should find two.
 */
function readsAsNonEmptyCfmlText(value: unknown): boolean {
  /* CFML cannot compare a COMPLEX value with a string at all — it raises "Can't cast Object to
   * String". Answering false leaves the guard at `:L180` unmet, which is also the conclusion its
   * second clause, `isNumeric(...)`, reaches independently for the same value. */
  if (!isCfmlSimpleValue(value)) {
    return false;
  }

  return String(value) !== '';
}

function hasEntityText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/**
 * Whether an unknown value carries a callable member of the given name.
 *
 * The one cast in this file, and it is confined here. `Reflect` and `Proxy` are forbidden, and
 * `Object.getOwnPropertyDescriptor` cannot see a class instance's prototype methods, so a narrowing
 * index read is the remaining option. The result is `unknown`, so nothing unsafe escapes.
 */
function hasCallableMember(candidate: unknown, memberName: string): boolean {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const members = candidate as Readonly<Record<string, unknown>>;
  return typeof members[memberName] === 'function';
}

/** Narrows the `addProductReview` process object to its one observed member. */
function isProductReviewProcessObject(candidate: unknown): candidate is ProductReviewProcessObject {
  return hasCallableMember(candidate, 'getNewProductReview');
}

/** Narrows the `addSubscriptionTerm` process object to its four observed members. */
function isSubscriptionTermProcessObject(
  candidate: unknown,
): candidate is SubscriptionTermProcessObject {
  return (
    hasCallableMember(candidate, 'getSubscriptionTermID') &&
    hasCallableMember(candidate, 'getPrice') &&
    hasCallableMember(candidate, 'getRenewalPrice') &&
    hasCallableMember(candidate, 'getListPrice')
  );
}

/** Narrows the `uploadDefaultImage` process object to its three observed members. */
function isUploadDefaultImageProcessObject(
  candidate: unknown,
): candidate is UploadDefaultImageProcessObject {
  return (
    hasCallableMember(candidate, 'getImageFile') &&
    hasCallableMember(candidate, 'getPropertyMetaData') &&
    hasCallableMember(candidate, 'addError')
  );
}

/* ================================================================================================
 * SECTION 7 — ENTITY NARROWING AND QUERY COMPOSITION
 * ============================================================================================== */

/**
 * Narrows a product's SKU collection from the relationship's declared member interface to the entity.
 *
 * `Product.getSkus()` answers `ProductSkuMember[]`, an interface carrying only the two inverse-side
 * mutators, because the domain layer refuses to make the product depend on the whole SKU surface. Four
 * members here need the real entity — to add an option at `model/service/ProductService.cfc:L118`, to
 * read options at `:L142`, to set prices at `:L223` and `:L227`, and to set image file names at `:L210`.
 *
 * The narrowing RAISES rather than skipping. A collection member that is not a SKU is a corrupt object
 * graph, and quietly ignoring it would make a bulk price update silently touch fewer rows than the
 * caller asked for. `../services/SkuService` narrows the same relationship the same way.
 */
function readProductSkusAsSkus(product: Product, locator: string): Sku[] {
  const skus: Sku[] = [];
  for (const member of product.getSkus()) {
    if (!(member instanceof Sku)) {
      throw new DomainError(
        'The product has an associated SKU that is not a Sku entity, so this member cannot read it.',
        { context: { productID: product.productID, locator } },
      );
    }
    skus.push(member);
  }
  return skus;
}

/**
 * A primary-key lookup expressed as a single-filter dynamic query.
 *
 * The shape `../services/OptionService` uses for the same purpose, and for the same reason: the two
 * synthesized `get<Entity>(id)` members that AAP §0.4.2.5 requires have no repository behind them —
 * `../ports/repositories/ProductRepository` deliberately declares only the three business queries the
 * legacy `ProductDAO` declares — so the paginated query port is the one abstraction that can answer
 * them without widening a port (S5).
 */
function buildIdentifierQuery<TEntity extends SmartListEntityName>(
  entityName: TEntity,
  propertyIdentifier: SmartListPropertyIdentifier<TEntity>,
  value: string,
): SmartListQuery {
  return { entityName, whereGroups: [{ filters: [{ propertyIdentifier, value }] }] };
}

/**
 * Builds the validation VIEW `../validation/rules/product.rules` expects.
 *
 * WHY A VIEW AND NOT THE ENTITY. That rule set's own contract is explicit: the subject handed to the
 * validator carries DERIVED VALUES THE CALLER HAS ALREADY AWAITED, because a rule declares a
 * synchronous reader and cannot await anything. Two of the values the catalog rules read are not plain
 * fields on the entity — `price` resolves through `Product.getPrice()` to a local override or to the
 * default SKU (`model/entity/Product.cfc:L118` declares it non-persistent), and `baseProductType`
 * resolves through an ancestor walk — so handing the bare entity to the validator would present
 * `price` as absent for every product that prices through its default SKU and would fail the save.
 *
 * ⚠️ NO RULE IS EVALUATED, RELAXED OR SHORT-CIRCUITED HERE. This function only RESOLVES values. The
 * rule set decides what they mean, including the case its own boundary note calls out: if `price`
 * resolves to absent then the presence rule fails and the save is rejected, and that outcome is
 * deliberately not smoothed over.
 *
 * Every metadata and identity member delegates to the entity, so the uniqueness constraints continue
 * to see the real primary key and the real property metadata.
 *
 * ⭐ WHY EVERY DATA MEMBER IS A CONDITIONAL SPREAD RATHER THAN A PLAIN ASSIGNMENT, AND WHY THAT IS
 * SEMANTIC AND NOT CEREMONY. `org/Hibachi/HibachiValidationService.cfc:L256-L266` SHORT-CIRCUITS ON
 * ABSENCE: a property that is not there is not validated, while a property that is there and empty is.
 * A key omitted from this object reproduces the first case; a key written with the value `undefined`
 * would claim the second. `exactOptionalPropertyTypes` refuses the second spelling for exactly that
 * reason, so the spread form is the one that says what the legacy means.
 *
 * ⛔ `physicalCounts` IS OMITTED ENTIRELY, and its absence is the faithful outcome rather than a gap.
 * `model/validation/Product.json` declares a delete guard on it, and NO ENTITY IN THE SLICE DECLARES
 * SUCH A PROPERTY — all three declare `physicals` instead. `hasProperty('physicalCounts')` therefore
 * answers false on the delegating view exactly as it does on the entity, and
 * `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule. Adding a field to make it resolve
 * would invent a guard the legacy does not enforce (S9).
 */
function buildProductValidationSubject(
  product: Product,
  derived: ProductDerivedValidationValues,
): ProductValidationSubject {
  return {
    getClassName: () => product.getClassName(),
    hasProperty: (propertyIdentifier: string) => product.hasProperty(propertyIdentifier),
    getPropertyMetaData: (propertyName: string) => product.getPropertyMetaData(propertyName),
    getEntityName: () => product.getEntityName(),
    getPrimaryIDValue: () => product.getPrimaryIDValue(),
    getPrimaryIDPropertyName: () => product.getPrimaryIDPropertyName(),
    getValueByPropertyIdentifier: (propertyIdentifier: string) =>
      product.getValueByPropertyIdentifier(propertyIdentifier),
    /* `productType` needs no guard: the rule reads it as the unknown top type, which already admits
     * absence, and a presence check on a missing reference is the whole point of that rule. */
    productType: product.productType,
    ...(derived.baseProductType === undefined ? {} : { baseProductType: derived.baseProductType }),
    ...(derived.price === undefined ? {} : { price: derived.price }),
    ...(product.productName === undefined ? {} : { productName: product.productName }),
    ...(product.productCode === undefined ? {} : { productCode: product.productCode }),
    /* The MEMOISED slot, read exactly as it stands. Only the `delete` context's guard reads this, and
     * that context is owned by the composed base service and its own delete-subject resolver — never
     * by this view — so resolving it here would issue a query no applicable rule consumes. */
    ...(product.transactionExistsFlag === undefined
      ? {}
      : { transactionExistsFlag: product.transactionExistsFlag }),
    ...(derived.unusedProductOptions === undefined
      ? {}
      : { unusedProductOptions: derived.unusedProductOptions }),
    ...(derived.unusedProductOptionGroups === undefined
      ? {}
      : { unusedProductOptionGroups: derived.unusedProductOptionGroups }),
    ...(derived.unusedProductSubscriptionTerms === undefined
      ? {}
      : { unusedProductSubscriptionTerms: derived.unusedProductSubscriptionTerms }),
    ...(product.urlTitle === undefined ? {} : { urlTitle: product.urlTitle }),
  };
}

/**
 * The values {@link buildProductValidationSubject} cannot read straight off the entity.
 *
 * Each is optional because each is resolved ONLY for the contexts whose rules read it. Resolving all
 * five for every context would issue queries no rule consumes, and — for the three minimum-collection
 * gates — would make one context's boundary stub visible to another context that never asks about it.
 */
interface ProductDerivedValidationValues {
  readonly baseProductType?: string | undefined;
  readonly price?: number | undefined;
  readonly unusedProductOptions?: readonly unknown[] | undefined;
  readonly unusedProductOptionGroups?: readonly unknown[] | undefined;
  readonly unusedProductSubscriptionTerms?: readonly unknown[] | undefined;
}

/**
 * Builds the process-object validation view for the `updateSkus` context.
 *
 * `../domain/process/ProductUpdateSkus` is a plain data interface, so the two members
 * `../validation/Validator` needs of any subject — the class name it composes message keys from, and
 * the declared-property test that decides whether a rule applies at all — are supplied from that
 * module's own exported population contract rather than being written out again here. That keeps the
 * class name `Product_UpdateSkus` (underscore and all, as `org/Hibachi/HibachiObject.cfc:L135-L137`
 * derives it from the file name) and the five declared property names in exactly one place.
 *
 * The four data members are conditional spreads for the same absence reason as the entity view above,
 * and here the distinction is load-bearing rather than merely correct: the two conditions
 * `../validation/rules/productUpdateSkus.rules` declares compare a flag to 1, and an ABSENT flag leaves
 * its condition unmet, which is what keeps the conditional price rules from firing on a form that never
 * offered the field.
 */
function buildProductUpdateSkusValidationSubject(
  processObject: ProductUpdateSkus,
): ProductUpdateSkusValidationSubject {
  return {
    getClassName: () => PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName,
    hasProperty: (propertyIdentifier: string) =>
      PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.properties.some(
        (descriptor) => descriptor.name === propertyIdentifier,
      ),
    ...(processObject.updatePriceFlag === undefined
      ? {}
      : { updatePriceFlag: processObject.updatePriceFlag }),
    ...(processObject.price === undefined ? {} : { price: processObject.price }),
    ...(processObject.updateListPriceFlag === undefined
      ? {}
      : { updateListPriceFlag: processObject.updateListPriceFlag }),
    ...(processObject.listPrice === undefined ? {} : { listPrice: processObject.listPrice }),
  };
}

/* ================================================================================================
 * SECTION 8 — THE SERVICE
 * ============================================================================================== */

/**
 * The Catalog product service.
 *
 * ⚠️ M7 — THIS CLASS IS STATELESS AND MUST STAY THAT WAY. `org/Hibachi/Hibachi.cfc:L289-L345` declares
 * the services as DI/1 SINGLETONS, and AAP §0.4.1.3 memoizes the composition root across warm Lambda
 * invocations, so one instance can serve many requests on one container. Every field below is
 * `readonly` and assigned once; no member writes to `this`; and nothing is cached at instance or module
 * scope. The per-request memoization the legacy performed in entity `variables` scope lives on the
 * entities, which are per-request objects — see `Product.getOptionGroups`, which memoizes into the
 * entity it was called on.
 */
export class ProductService {
  private readonly productRepository: ProductRepository;

  private readonly skuRepository: SkuRepository;

  private readonly skuService: SkuService;

  private readonly optionService: OptionService;

  private readonly baseService: ProductBaseService;

  private readonly productTypeBaseService: ProductTypeBaseService;

  private readonly validator: ProductProcessValidator;

  private readonly settings: SettingResolverPort;

  private readonly accountContext: AccountContextPort;

  private readonly smartListQueryPort: SmartListQueryPort;

  private readonly subscriptionTermPort: SubscriptionTermPort;

  private readonly productTypeRootResolver: ProductTypeRootResolver;

  private readonly productPropertyDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;

  private readonly populationAuthorization: PopulationAuthorizationPort;

  private readonly isUrlTitleAvailable: UniqueValueProbe;

  private readonly urlTitleAttemptBudget: UrlTitleAttemptBudget;

  private readonly persistProduct: EntityPersister<Product>;

  private readonly importSourcePolicy: ProductImportSourcePolicy;

  /** @see ProductServiceCollaborators.defaultSkuIdReader */
  private readonly defaultSkuIdReader: DefaultSkuIdReader;

  /**
   * Wires the graph the retired DI/1 container used to wire by name.
   *
   * `org/Hibachi/DI1/ioc.cfc:L546` scanned the bean directory and populated `property name="…"`
   * declarations by matching names at run time; `getService("productService")` then resolved the
   * instance from a string. Both halves are gone: the collaborators arrive typed and named, and a
   * missing or mis-shaped one is a COMPILE error at the composition root instead of a run-time
   * `NullPointerException` on the first request that happens to reach that code path (TR-3, S3).
   *
   * The collaborators are unpacked into `readonly` fields rather than retained as an object so that the
   * call sites below read as the legacy's `getSkuDAO()`, `getOptionService()` and so on did, with one
   * name per collaborator and no indirection.
   *
   * @param collaborators - The sixteen live edges of §0.6.3.1, named.
   */
  public constructor(collaborators: ProductServiceCollaborators) {
    this.productRepository = collaborators.productRepository;
    this.skuRepository = collaborators.skuRepository;
    this.skuService = collaborators.skuService;
    this.optionService = collaborators.optionService;
    this.baseService = collaborators.baseService;
    this.productTypeBaseService = collaborators.productTypeBaseService;
    this.validator = collaborators.validator;
    this.settings = collaborators.settings;
    this.accountContext = collaborators.accountContext;
    this.smartListQueryPort = collaborators.smartListQueryPort;
    this.subscriptionTermPort = collaborators.subscriptionTermPort;
    this.productTypeRootResolver = collaborators.productTypeRootResolver;
    this.productPropertyDescriptors = collaborators.productPropertyDescriptors;
    this.populationAuthorization = collaborators.populationAuthorization;
    this.isUrlTitleAvailable = collaborators.isUrlTitleAvailable;
    this.urlTitleAttemptBudget = collaborators.urlTitleAttemptBudget;
    this.persistProduct = collaborators.persistProduct;
    this.importSourcePolicy = collaborators.importSourcePolicy;
    this.defaultSkuIdReader = collaborators.defaultSkuIdReader;
  }

  /* ==============================================================================================
   * PREVIOUSLY SYNTHESIZED MEMBERS — IR-1
   *
   * None of the three has a declaration anywhere in the legacy repository. Each exists because
   * `org/Hibachi/HibachiService.cfc:L255-L281` intercepted the call, matched a name prefix, derived the
   * entity name from the remainder and dispatched to the generic DAO. `strict` TypeScript has no
   * equivalent, and TR-3 retires the mechanism rather than re-creating it, so each real call site
   * becomes an explicitly declared, typed member — and ONLY the real call sites do.
   * ============================================================================================ */

  /**
   * Constructs a new, transient product — the `new*` prefix branch of the retired dispatcher.
   *
   * Called by `meta/tests/unit/IssuesTest.cfc:L98` (`issue_1331`) and by every product-creation path
   * that reaches `saveProduct` with an unsaved entity. The legacy dispatcher resolved
   * `newProduct()` to `entityNew("SlatwallProduct")`, which produced an entity whose primary key was
   * still empty — which is precisely what `Product.isNew()` tests, and therefore what
   * {@link ProductService.saveProduct}'s fourth step turns on.
   *
   * ⚠️ NO `manageEntity` WRAPPING, AND THE CONTRAST WITH `SkuService.newSku()` IS DELIBERATE.
   * `../domain/sku/Sku` declares the metadata surface but not the error surface, so that sibling has to
   * wrap. `../domain/product/Product` declares BOTH on the class, lazily creating its own error bag on
   * first use, so a bare construction is already the full managed shape — see the assignability proofs
   * in section 2. Wrapping anyway would add a second object with a second error bag, and findings
   * recorded through one would be invisible through the other.
   *
   * TEST PROVENANCE: NET-NEW as a service member; the legacy usage it reproduces is TRACEABLE to
   * `meta/tests/unit/IssuesTest.cfc:L96-L104`.
   *
   * @returns A transient product with an empty primary key.
   */
  public newProduct(): Product {
    return new Product();
  }

  /**
   * Loads one product by its identifier, or resolves `null` when no such product exists.
   *
   * The `get*` prefix branch of the retired dispatcher. Real call sites are the handler layer and the
   * process paths, both of which hand an identifier straight through from a request.
   *
   * WHY THE QUERY PORT AND NOT A REPOSITORY MEMBER. `../ports/repositories/ProductRepository` declares
   * the three business queries `model/dao/ProductDAO.cfc` declares — attribute sets, the file import
   * and the product-type search — and nothing else, because that is the DAO's actual surface. The
   * legacy `getProduct(id)` never went through the product DAO either: the dispatcher sent it to the
   * generic `HibachiDAO`. The paginated query port is this layer's declared equivalent, and
   * `../services/OptionService` answers its own two synthesized `get*` members exactly the same way.
   *
   * `null` rather than `undefined` is the legacy answer shape: `entityLoadByPK` yields null, and the
   * callers test it with `isNull()`.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param productID - The 32-character product identifier.
   * @returns The product, or `null` when the identifier matches no row.
   */
  public async getProduct(productID: string): Promise<Product | null> {
    const result = await this.smartListQueryPort.execute<Product>(
      buildIdentifierQuery(PRODUCT_ENTITY_NAME, PRODUCT_ID_PROPERTY, productID),
    );

    return result.records[0] ?? null;
  }

  /**
   * Loads one product type by its identifier, or resolves `null` when no such type exists.
   *
   * The same prefix branch as {@link ProductService.getProduct}, and the member
   * `meta/tests/unit/IssuesTest.cfc:L98` calls with the seeded merchandise discriminator
   * `444df313ec53a08c32d8ae434af5819a` before asserting that `Product.isProcessable('addOptionGroup')`
   * answers false. That regression is the only legacy exercise of this member anywhere.
   *
   * ⚠️ THIS IS NOT THE ROOT-TYPE RESOLVER, and the two are not interchangeable. The resolver injected
   * as `productTypeRootResolver` answers `… | undefined` and exists to let a product walk to its root
   * ancestor for the base-type discriminator; this member answers `… | null` because that is the shape
   * a legacy `get*` call yields. Collapsing them would change one contract to suit the other.
   *
   * TEST PROVENANCE: TRACEABLE to `meta/tests/unit/IssuesTest.cfc:L96-L104` for the usage; NET-NEW as a
   * unit-tested service member.
   *
   * @param productTypeID - The 32-character product-type identifier.
   * @returns The product type, or `null` when the identifier matches no row.
   */
  public async getProductType(productTypeID: string): Promise<ProductType | null> {
    const result = await this.smartListQueryPort.execute<ProductType>(
      buildIdentifierQuery(PRODUCT_TYPE_ENTITY_NAME, PRODUCT_TYPE_ID_PROPERTY, productTypeID),
    );

    return result.records[0] ?? null;
  }

  /* ==============================================================================================
   * THE RETIRED PROCESS PIPELINE, AS TWO PRIVATE MEMBERS
   * ============================================================================================ */

  /**
   * Resolves the derived values the rules of one process context read, and nothing else.
   *
   * `model/validation/Product.json` gates each of the three process contexts on TWO properties: the
   * base-type discriminator, and one minimum-collection guard specific to that context. Only those are
   * resolved, and only for the context that reads them — resolving all three collections for every
   * context would issue queries no applicable rule consumes and would let one context's boundary
   * condition surface in another that never asks about it.
   *
   * `updateSkus` resolves NOTHING, because `model/validation/Product.json` declares no rule for that
   * context. The entity still travels through the pipeline, exactly as `:L96` sends it, so that the
   * invocation gate keeps its meaning.
   *
   * ⚠️ THE `addSubscriptionTerm` PATH IS A DECLARED BOUNDARY, AND ITS CONSEQUENCE IS STATED RATHER THAN
   * WORKED AROUND. `Product.getUnusedProductSubscriptionTerms(finder?)` answers an EMPTY ARRAY when no
   * finder is supplied, and `../ports/SubscriptionTermPort` declares no unused-terms member to supply
   * one — the subscription domain is excluded (AAP §0.2.2.1) and inventing a port member is forbidden
   * (S5). The `minCollection 1` guard therefore fails, and
   * {@link ProductService.processProductAddSubscriptionTerm} short-circuits with that finding. That is
   * the honest outcome of a stubbed boundary meeting a real rule (TR-5); it is NOT patched by passing a
   * fabricated collection, and it is NOT hidden by skipping the rule.
   */
  private async buildProcessValidationSubject(
    product: Product,
    context: ProductProcessContext,
  ): Promise<ProductValidationSubject> {
    if (context === 'updateSkus') {
      return buildProductValidationSubject(product, {});
    }

    /* `model/validation/Product.json` gates all three process contexts on this discriminator —
     * merchandise for the two option contexts, subscription for the term context. */
    const baseProductType = await product.getBaseProductType(this.productTypeRootResolver);

    if (context === 'addOptionGroup') {
      const unusedProductOptionGroups = await product.getUnusedProductOptionGroups(
        this.optionService,
        this.optionService,
      );

      return buildProductValidationSubject(product, { baseProductType, unusedProductOptionGroups });
    }

    if (context === 'addOption') {
      const unusedProductOptions = await product.getUnusedProductOptions(
        this.optionService,
        this.optionService,
      );

      return buildProductValidationSubject(product, { baseProductType, unusedProductOptions });
    }

    const unusedProductSubscriptionTerms = await product.getUnusedProductSubscriptionTerms();

    return buildProductValidationSubject(product, {
      baseProductType,
      unusedProductSubscriptionTerms,
    });
  }

  /**
   * Runs the two-pass validation that `org/Hibachi/HibachiService.cfc:L84-L120` ran around every
   * `processProduct_*` member, and records the entity findings on the entity.
   *
   * THE ONE THING THIS DOES NOT DO IS DISPATCH. `:L113` composed a method name from the class name and
   * the context string and invoked it reflectively; TR-3 retires that, so each public member calls this
   * helper and then runs its own body inline. There is no `[methodName]` lookup, no switch on a context
   * string, no `Proxy` and no `Reflect` anywhere in this file.
   *
   * Population is NOT re-performed. `:L102-L105` populated the process object from the request payload
   * and set a flag so it happened at most once; in the ported design a typed process object arrives
   * already populated, which is the same state the legacy leaves it in before `:L108` validates it.
   *
   * ⚠️ THE FINDINGS ARE RECORDED, THEN THE CALLER GATES ON THE ENTITY. `HibachiTransient.validate()`
   * writes into the object's own error bag, which is why `addErrors` is used rather than a returned bag
   * being inspected in isolation: a product that arrived with findings keeps them, and the gate at
   * `:L112` sees the union — exactly as the legacy `hasErrors()` does.
   *
   * ⚠️ AND THE PROCESS-OBJECT BAG IS EVALUATED BUT NOT RECORDED, WHICH IS AN INFORMATION BOUNDARY AND
   * NOT A DROPPED FINDING. The ported process objects are plain data interfaces with no error surface,
   * and that contract belongs to `../domain/process/**` rather than to this file. The findings cannot
   * change any outcome in any case: `:L112` reads entity errors only, and the request-level commit gate
   * at `org/Hibachi/HibachiTransient.cfc:L455-L457` raises the ORM error flag only for PERSISTENT
   * objects, which a process object is not. The result is returned so a caller — or a future
   * error-carrying process object — can consume it.
   */
  private async runProcessValidation(
    product: Product,
    context: ProductProcessContext,
    processObject?: ProcessObjectValidationTarget<ProductUpdateSkusValidationSubject>,
  ): Promise<ProcessValidationResult> {
    const subject = await this.buildProcessValidationSubject(product, context);

    const result = await this.validator.validateProcess<
      ProductValidationSubject,
      ProductUpdateSkusValidationSubject
    >({
      entity: subject,
      entityRuleSet: productValidationRuleSet,
      processContext: context,
      ...(processObject === undefined ? {} : { processObject }),
    });

    product.addErrors(result.entityErrors.getErrors());

    return result;
  }

  /**
   * Derives a URL title that is free on `SwProduct` — `model/service/ProductService.cfc:L269`.
   *
   * The transformation itself belongs to `../util/urlTitle`, which ports
   * `model/service/DataService.cfc:L53-L71` verbatim, including the detail that the counter is
   * PRE-INCREMENTED so the first collision suffix is `-2` rather than `-1`. Nothing about the algorithm
   * is restated here; this member supplies the table discriminator and the injected probe.
   */
  private createUniqueProductUrlTitle(titleString: string): Promise<string> {
    return createUniqueURLTitle(
      titleString,
      PRODUCT_TABLE_NAME,
      this.isUrlTitleAvailable,
      this.urlTitleAttemptBudget,
    );
  }

  /** The same derivation against `SwProductType` — `model/service/ProductService.cfc:L296`, `:L298`. */
  private createUniqueProductTypeUrlTitle(titleString: string): Promise<string> {
    return createUniqueURLTitle(
      titleString,
      PRODUCT_TYPE_TABLE_NAME,
      this.isUrlTitleAvailable,
      this.urlTitleAttemptBudget,
    );
  }

  /**
   * Reads a product's default SKU, raising where the legacy dereferences it without a guard.
   *
   * `model/service/ProductService.cfc:L132`, `:L135`, `:L136`, `:L185` and `:L188` all call
   * `arguments.product.getDefaultSku()` and immediately call a member on the result, with no
   * null check anywhere. A product with no default SKU therefore fails in the legacy too. Raising with
   * the locator makes that failure legible instead of letting an `undefined` propagate into a price
   * field; fabricating a default SKU, or skipping the step, would change which SKUs get created.
   */
  private requireDefaultSku(product: Product, locator: string): ProductDefaultSkuDelegate {
    const defaultSku = product.defaultSku;
    if (defaultSku === undefined) {
      throw new DomainError(
        'The product has no default SKU, and the legacy member dereferences it without a guard.',
        { context: { productID: product.productID, locator } },
      );
    }

    return defaultSku;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 1 OF 15 — `model/service/ProductService.cfc:L65`
   * ============================================================================================ */

  /**
   * Imports products from a delimited file.
   *
   * The port of `public void function loadDataFromFile(required string fileURL, string
   * textQualifier = "")`. Both the name and the argument order are preserved, and so is the default:
   * `textQualifier` defaults to the empty string exactly as `:L65` declares, which keeps the external
   * signature `(fileURL: string, textQualifier?: string)` that AAP §0.4.2.1 ratifies.
   *
   * ==============================================================================================
   * ⚠️ M1 — THE ONE-HOUR BUDGET HAS NO SINGLE-INVOCATION FORM, AND IS NOT SILENTLY RE-TIMED
   * ==============================================================================================
   * `:L66` is `getHibachiTagService().cfSetting(requesttimeout="3600")` — a request budget of 3600
   * SECONDS, raised immediately before the delegation at `:L67`. AWS Lambda's maximum function timeout
   * is 15 minutes, so that budget is UNREPRESENTABLE in one invocation.
   *
   * WHAT THIS MEMBER THEREFORE DOES NOT DO, each choice deliberate:
   *   - it does NOT set 900 seconds, or any other value. Substituting the platform ceiling would look
   *     like a port of the line and would in fact be a new, invented number (S9), and it would turn a
   *     surfaced mismatch into a silent truncation of an import that used to be allowed an hour;
   *   - it does NOT read a Lambda context, a remaining-time budget or an environment variable. All AWS
   *     coupling belongs to `src/handlers/**` (S4), and this service imports no AWS type;
   *   - it does NOT add a retry, a chunk size, a page size or a resumption token (S9). None exists in
   *     the legacy, and inventing one would be a new execution model rather than a port of this one.
   *
   * WHAT IS REQUIRED INSTEAD, stated as the decision AAP §0.6.6 asks for: the operational model for
   * this member must be OUT-OF-BAND — queued, chunked or step-orchestrated — and that decision belongs
   * to `src/handlers/productHandler.ts` (AAP §0.4.1.9), which is where the mismatch is flagged. Two
   * neighbouring mismatches compound it and are recorded on the port rather than here: M3, the
   * PER-ROW transaction at `model/dao/ProductDAO.cfc:L176-L177`, which leaves a partially imported
   * catalog on any mid-file failure; and M4, the in-request remote fetch at
   * `model/dao/ProductDAO.cfc:L87`.
   *
   * ==============================================================================================
   * THE POLICY GATE, AND WHY IT IS NOT AN INVENTED CHECK
   * ==============================================================================================
   * `../ports/repositories/ProductRepository.importFromFile` accepts only a branded
   * {@link ProductImportSource}, and `validateProductImportSource` is its only producer. That decision,
   * its reasoning and its refusal semantics are the PORT'S, declared there and not here: the port states
   * that the policy is supplied at the composition root, that no default may be written into code, and
   * that the caller runs the gate and handles refusal. This member is that caller. It supplies the
   * injected policy, forwards an approved source and refuses otherwise; it decides nothing about which
   * locations are permissible.
   *
   * THE REFUSAL NAMES THE CONSTRAINT, NOT THE VALUE. The port withholds a per-clause reason on purpose,
   * so that a request-facing entry point cannot be used to enumerate the configured schemes and hosts;
   * echoing the rejected candidate back into an error context would defeat the same purpose by putting
   * caller-supplied text into logs and potentially into a response. The locator is enough for an
   * operator, who has both the policy and the request in hand.
   *
   * TEST PROVENANCE: NET-NEW. No legacy test touches this member; `model/dao/ProductDAO.cfc`'s importer
   * has no test either (AAP §0.6.5.2).
   *
   * @param fileURL - The location the caller asks to import from, passed to the policy gate untouched.
   * @param textQualifier - The optional text qualifier, defaulting to the empty string as `:L65` does.
   * @returns Nothing. `model/dao/ProductDAO.cfc:L73` reports no row count and no error summary, and
   *   inventing one would be inventing information the legacy never produced.
   * @throws {DomainError} when the configured policy does not approve the location, in which case no
   *   retrieval is attempted at all.
   */
  public async loadDataFromFile(fileURL: string, textQualifier: string = ''): Promise<void> {
    const approvedSource: ProductImportSource | undefined = validateProductImportSource(
      fileURL,
      this.importSourcePolicy,
    );

    if (approvedSource === undefined) {
      throw new DomainError(
        'The requested import location is not approved by the configured import-source policy, so ' +
          'no retrieval was attempted.',
        { context: { locator: 'model/service/ProductService.cfc:L65-L68' } },
      );
    }

    await this.productRepository.importFromFile(approvedSource, textQualifier);
  }

  /* ==============================================================================================
   * DECLARED MEMBER 2 OF 15 — `model/service/ProductService.cfc:L70`
   * ============================================================================================ */

  /**
   * Groups a product's selectable options by option-group name.
   *
   * ==============================================================================================
   * TODO(parity) D25 — `model/service/ProductService.cfc:L70-L80`: THE RESULT IS A MAP, NOT AN ARRAY
   * ==============================================================================================
   * `:L71` initialises `var AvailableOptions = {}` — a CFML STRUCT — and `:L76` assigns into it with
   * `AvailableOptions[ productObjectGroups[i].getOptionGroupName() ] = …`, keyed by the option group's
   * NAME. `:L79` returns that struct. The result is therefore a keyed map, and an earlier reading of
   * this member as returning `FormattedOptionGroup[]` was wrong: an array would lose the keys the one
   * consumer indexes by, and would silently turn same-named groups into two entries.
   *
   * The honest signature is `Promise<Record<string, SelectOption[]>>`. It is a promise because
   * `Product.getOptionGroups(finder)` and `Product.getOptionsByOptionGroup(finder, id)` are both
   * asynchronous in the ported domain — the legacy resolved both through lazy ORM relationships that
   * looked synchronous only because the engine blocked — and forcing a synchronous signature here would
   * mean either duplicating those queries or fabricating their results.
   *
   * FOUR BEHAVIOURS PRESERVED EXACTLY, each one a place a well-meant improvement would change results:
   *   1. THE KEY IS THE GROUP NAME, never the group ID. Switching to IDs would be more robust and would
   *      break every consumer that indexes by the label it renders.
   *   2. SAME-NAMED GROUPS OVERWRITE. `:L76` is a plain struct assignment, so the LAST group with a
   *      given name wins and the earlier entry is lost. No multimap, no array-of-arrays, no suffixing
   *      and no de-duplication is introduced.
   *   3. NO SORTING. The map is built in the order `Product.getOptionGroups()` yields, and the legacy
   *      neither sorts the groups nor sorts within a group.
   *   4. THE OPTIONS PROJECTION IS THE SIBLING'S. `OptionService.getOptionsForSelect` owns the
   *      `{name, value}` shape; this member does not re-derive it, and `SelectOption` is imported
   *      type-only from that sibling rather than being re-declared (S5).
   *
   * TODO(parity) D10-CLASS, UNNUMBERED — TWO UNSCOPED VARIABLES. `:L73` assigns `productObjectGroups` and `:L75`
   * assigns the loop counter `i`, both WITHOUT `var`, so in CFML both leak into the component's shared
   * `variables` scope. On a singleton service under concurrent requests that is a genuine race: two
   * simultaneous callers share one counter. TypeScript's block scoping removes the hazard by
   * construction — the `for…of` binding below cannot escape the loop — and that is recorded as a
   * deliberate translation decision rather than assigned a new defect number, exactly as AAP §0.6.7.5
   * treats the same class of finding at `:L70-L80`.
   *
   * THE GROUP NAME IS DEREFERENCED WITHOUT A GUARD, as `:L76` does. A group with no name cannot be a
   * struct key in CFML either, so the legacy raises on the same input; raising here with the locator
   * keeps that failure legible rather than silently producing a `"undefined"` key.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product whose option groups are read.
   * @returns Selectable options keyed by option-group name, in group order.
   * @throws {DomainError} when an option group carries no name, matching the legacy's unguarded read.
   */
  public async getFormattedOptionGroups(product: Product): Promise<Record<string, SelectOption[]>> {
    const availableOptions: Record<string, SelectOption[]> = {};

    const productObjectGroups: OptionGroup[] = await product.getOptionGroups(this.optionService);

    for (const optionGroup of productObjectGroups) {
      const optionGroupName = optionGroup.optionGroupName;
      if (optionGroupName === undefined) {
        throw new DomainError(
          'An option group has no name, so it cannot key the formatted-option-group map.',
          {
            context: {
              productID: product.productID,
              optionGroupID: optionGroup.optionGroupID,
              locator: 'model/service/ProductService.cfc:L76',
            },
          },
        );
      }

      /* Sequential on purpose. The legacy loop resolves one group's options before moving to the next,
       * and the map is built in that order; `Promise.all` would issue them concurrently and is not used
       * (house style) even though the results happen to be independent. */
      const options: Option[] = await product.getOptionsByOptionGroup(
        this.optionService,
        optionGroup.optionGroupID,
      );

      availableOptions[optionGroupName] = this.optionService.getOptionsForSelect(options);
    }

    return availableOptions;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 3 OF 15 — `model/service/ProductService.cfc:L104`
   * ============================================================================================ */

  /**
   * Resolves the SKUs of one product that carry EVERY one of the selected options.
   *
   * The prompt's worked example, and the member AAP §0.6.1 identifies as the hardest piece of the slice
   * — not because this method is long (`:L105` is a single delegation) but because five semantics of the
   * query beneath it are each easy to change by accident.
   *
   * THE SIGNATURE IS FIXED BY TWO OUT-OF-SCOPE CALLERS AND MUST NOT BE REORDERED OR NAMED DIFFERENTLY.
   * `model/process/Order_AddOrderItem.cfc:L238` calls
   * `getProductSkusBySelectedOptions(getSelectedOptionIDList(), getProduct().getProductID())`
   * POSITIONALLY, and `model/entity/Product.cfc:L367` calls
   * `getProductSkusBySelectedOptions(arguments.selectedOptions, this.getProductID())` positionally as
   * well. The selected-option list is first and the product identifier second; both are required.
   *
   * ==============================================================================================
   * WHY THIS IS NO LONGER LITERALLY A ONE-LINE DELEGATION — a documented judgment call
   * ==============================================================================================
   * `:L105` forwards `argumentCollection=arguments` unchanged, and the DAO then walks the list with
   * `listLen`/`listGetAt`. The ported repository declares
   * `findSkusBySelectedOptions(optionIds: string[], productId: string)` — an ARRAY, because a
   * comma-delimited string is not a type. The list-to-array conversion therefore has to happen
   * somewhere, and it happens HERE, inline, because that is the layer at which the legacy string
   * contract terminates. It is deliberately NOT extracted into a helper or a new file (S5), and
   * behaviour is preserved over syntax: the conversion reproduces CFML's list semantics rather than
   * JavaScript's `split`.
   *
   * THE CONVERSION, AND WHAT EACH RULE PROTECTS:
   *   - EMPTY ELEMENTS ARE DROPPED, because CFML list functions skip them. `''` yields ZERO elements
   *     (not one empty element), and `'a,,b'` yields exactly `['a','b']`. An empty option ID would
   *     otherwise become an `EXISTS` clause that matches nothing and would silently empty the result.
   *   - DUPLICATES ARE RETAINED, and so is source ORDER. See T1 below: the repository emits one
   *     correlated `EXISTS` per element, so the element count and order are part of the contract.
   *   - NOTHING IS TRIMMED, LOWER-CASED OR OTHERWISE NORMALISED. `listGetAt` returns the element
   *     verbatim, whitespace included, and normalising here would change which identifiers bind.
   *
   * ==============================================================================================
   * THE FIVE SEMANTICS THIS MEMBER AND ITS REPOSITORY MUST JOINTLY PRESERVE (AAP §0.6.1.3)
   * ==============================================================================================
   *   T1 CONJUNCTION, NOT INTERSECTION. `model/dao/SkuDAO.cfc:L107-L128` appends ONE correlated
   *      `exists` sub-query PER LIST ELEMENT and ANDs them, so a SKU must carry EVERY listed option.
   *      Re-expressing that as `optionID IN (…)` would turn the conjunction into a disjunction; a
   *      `GROUP BY … HAVING COUNT(*) = N` rewrite would diverge whenever the list repeats an entry.
   *      Passing the elements through with duplicates intact is this member's half of that contract.
   *   T2 THE PRODUCT IDENTIFIER IS ALWAYS PRESENT ON THE REAL PATH. The DAO guards it with
   *      `structKeyExists(arguments,"productID")`, but this service declares it `required` and is the
   *      DAO's ONLY caller, so that branch is always taken. The parameter is typed required here, which
   *      records the decision instead of preserving an unreachable branch.
   *   T3 THE OPTION-BEARING GUARD BELONGS TO THE REPOSITORY. The DAO's `inner join sku.options as opt`
   *      binds an alias the `where` clause never mentions, so it looks removable; it is not, because it
   *      silently EXCLUDES option-less SKUs from every result. The repository preserves an equivalent
   *      existence guard; this member neither adds nor compensates for one.
   *   T4 DISTINCTNESS BELONGS TO THE REPOSITORY. The join fans out one row per SKU-option pair, so
   *      `select distinct` is mandatory; without it a SKU carrying N options returns N times and every
   *      arity assertion built on the result breaks.
   *   T5 AN EMPTY SELECTION IS LEGAL AND MEANINGFUL. `Product.getSkusBySelectedOptions` defaults the
   *      list to `""` and `listLen("")` is zero, so no `EXISTS` clause is appended and the query
   *      legitimately degenerates to "every option-bearing SKU of this product".
   *      `Product.getSkuBySelectedOptions` and `Sku.hasUniqueOptions` both DEPEND on that degenerate
   *      form, so guarding against an empty list here would break two callers — one of which is a
   *      registered validation rule.
   *
   * ⚠️ AND THE ARITY ASSERTIONS ARE NOT THIS MEMBER'S EITHER. `model/entity/Product.cfc:L349-L364`
   * raises three distinct messages — more than one SKU returned, no SKU found, and an empty selection
   * against a non-singleton SKU set — and those live on the entity with their strings reproduced
   * verbatim. This member returns the collection unfiltered, exactly as `:L105` does.
   *
   * TEST PROVENANCE: NET-NEW. No `ProductServiceTest` and no `SkuDAOTest` exists (AAP §0.6.5.2), so
   * both this member and the query beneath it are net-new coverage.
   *
   * @param selectedOptions - A comma-delimited list of option identifiers, read with CFML list
   *   semantics. May be empty, which is a legal input meaning "no option filter" (T5).
   * @param productID - The product whose SKUs are searched. Required, and second (T2).
   * @returns Every SKU of that product carrying all of the selected options, distinct.
   */
  public getProductSkusBySelectedOptions(
    selectedOptions: string,
    productID: string,
  ): Promise<Sku[]> {
    const optionIds: string[] = selectedOptions
      .split(CFML_LIST_DELIMITER)
      .filter((optionId) => optionId.length > 0);

    return this.skuRepository.findSkusBySelectedOptions(optionIds, productID);
  }

  /* ==============================================================================================
   * DECLARED MEMBER 4 OF 15 — `model/service/ProductService.cfc:L113`
   * ============================================================================================ */

  /**
   * Adds an option group to a product, and one of its options to every existing SKU.
   *
   * The port of `processProduct_addOptionGroup`. The target name is camel-cased to
   * `processProductAddOptionGroup` per AAP §0.4.2.1, and the legacy underscore identifier is named here
   * so a reader searching the CFML source for `processProduct_addOptionGroup` lands on the right member.
   *
   * THE BODY IS REPRODUCED IN SOURCE ORDER, AND THE ORDER MATTERS:
   *   `:L114`  the existing SKUs are read FIRST, before the option group is resolved. Reading them after
   *            the resolution would be equivalent today and is not done, because the legacy sequence is
   *            what a reader compares against.
   *   `:L115`  the group is resolved through the explicitly declared `OptionService.getOptionGroup`
   *            (IR-1 — that member is synthesized in the legacy and has no declaration anywhere), and
   *            its options are read. The legacy chains straight off the lookup with NO null check, so a
   *            missing group fails there too; the failure is raised with its locator rather than being
   *            silently ignored or turned into a created group.
   *   `:L117`  the whole mutation is gated on the group having at least one option.
   *   `:L118`  the loop.
   *   `:L123`  the image file names are refreshed.
   *   `:L125`  the product is returned.
   *
   * ==============================================================================================
   * TODO(parity) D14 — `model/service/ProductService.cfc:L113-L126`: ONLY THE FIRST OPTION IS ADDED
   * ==============================================================================================
   * `:L118` is `skus[i].addOption(options[1])`. CFML arrays are 1-based, so `options[1]` is the FIRST
   * option of the newly added group — and it is added to EVERY existing SKU, for every SKU, regardless
   * of how many options the group contains. A product with three existing SKUs and a new group of four
   * options gains one option on each SKU, not a twelve-SKU matrix.
   *
   * That is almost certainly not what the author intended, and it is PRESERVED UNREPAIRED (Guideline 4,
   * S7). It is NOT changed to iterate every option, NOT changed to regenerate the combination matrix
   * through `SkuService.createSkus`, and NOT changed to pick a sorted or default option. Any of those
   * would alter which SKUs exist after the process runs. `options[0]` below is the zero-based spelling
   * of the same element.
   *
   * TODO(parity) D10-CLASS, UNNUMBERED — `:L118` declares its loop counter `i` without `var`, leaking it into the
   * component's shared scope on a singleton service. Block scoping removes the hazard; recorded as a
   * translation decision without minting a new number.
   *
   * DISPATCH — `:L123` calls `this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames')`,
   * a reflective call through the retired generic dispatcher. It becomes a DIRECT, typed call to
   * {@link ProductService.processProductUpdateDefaultImageFileNames}. That member reproduces the one
   * part of the pipeline the context still has — the `:L112` invocation gate — because
   * `model/validation/Product.json` declares no rules for `updateDefaultImageFileNames` and
   * `../validation/Validator` therefore does not admit it as a context at all.
   *
   * VALIDATION — the `addOptionGroup` context's rules live INSIDE `model/validation/Product.json`, not
   * in a `Product_AddOptionGroup.json` (there is none, and AAP §0.2.1.5 flags that as the subtlety most
   * likely to be misread). Two rules apply: the base type must be the merchandise discriminator, and
   * `unusedProductOptionGroups` must hold at least one entry. No process-object rule set exists for this
   * context in either system, so none is supplied; the legacy validated the process object against an
   * empty document, which produced no findings either.
   *
   * TEST PROVENANCE: NET-NEW as a service member. `meta/tests/unit/IssuesTest.cfc:L96-L104`
   * (`issue_1331`) is TRACEABLE for the neighbouring assertion that `isProcessable('addOptionGroup')`
   * answers false for a given product type, which exercises the gate rather than this body.
   *
   * @param product - The product being processed. Returned whether or not the body runs.
   * @param processObject - Carries the option-group identifier to add.
   * @returns The same product, as `:L125` does.
   * @throws {DomainError} when no option-group identifier was supplied, or when the identifier resolves
   *   to no group — both points at which the legacy dereferences without a guard.
   */
  public async processProductAddOptionGroup(
    product: Product,
    processObject: ProductAddOptionGroup,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'addOptionGroup');
    if (product.hasErrors()) {
      return product;
    }

    /* `:L114` — the SKUs first, exactly as written. */
    const skus: Sku[] = readProductSkusAsSkus(product, 'model/service/ProductService.cfc:L114');

    /* `:L115` — `getOptionService().getOptionGroup( processObject.getOptionGroup() ).getOptions()`,
     * chained with no null check at either step. */
    const optionGroupID = processObject.optionGroup;
    if (optionGroupID === undefined) {
      throw new DomainError(
        'The addOptionGroup process object carries no option-group identifier, and the legacy member ' +
          'passes it to the lookup without a guard.',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L115',
          },
        },
      );
    }

    const optionGroup = await this.optionService.getOptionGroup(optionGroupID);
    if (optionGroup === null) {
      throw new DomainError(
        'The option-group identifier resolves to no option group, and the legacy member calls ' +
          'getOptions() on the result of that lookup without a guard.',
        {
          context: {
            productID: product.productID,
            optionGroupID,
            locator: 'model/service/ProductService.cfc:L115',
          },
        },
      );
    }

    const options: Option[] = optionGroup.getOptions();

    /* `:L117-L121` — the arity gate and the loop. Capturing the first element IS the `arrayLen(options)`
     * guard: under `noUncheckedIndexedAccess` the narrowing and the guard are the same statement.
     *
     * TODO(parity) D14 — one option, the FIRST, onto every existing SKU. See the block above. */
    const firstOption = options[0];
    if (firstOption !== undefined) {
      for (const sku of skus) {
        sku.addOption(firstOption);
      }
    }

    /* `:L123` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
    return this.processProductUpdateDefaultImageFileNames(product);
  }

  /* ==============================================================================================
   * DECLARED MEMBER 5 OF 15 — `model/service/ProductService.cfc:L128`
   * ============================================================================================ */

  /**
   * Adds one option to a product by regenerating its SKU combinations.
   *
   * The port of `processProduct_addOption` (`:L128-L155`), reproduced step for step.
   *
   * ==============================================================================================
   * THE CREATION PAYLOAD — `:L131-L137`
   * ==============================================================================================
   * `:L130`  the new option is resolved through the explicitly declared `OptionService.getOption`
   *          (IR-1), and `:L131` reads its identifier off the result with no null check.
   * `:L131`  `options` starts as the NEW option's identifier alone, as a CFML LIST — a
   *          comma-delimited string, which `SkuService.createSkus` then splits again. The string form is
   *          preserved rather than being upgraded to an array, because the payload is the documented
   *          contract between these two services and `createSkus` reads it with list semantics.
   * `:L132`  `price` is read from the DEFAULT SKU, unguarded.
   * `:L135`  `listPrice` is read from the default SKU too, but GUARDED with `!isNull(…)`. The asymmetry
   *          between these two lines is real, is visible in the source, and is preserved: the author
   *          knew a list price may be absent and did not extend the same courtesy to the price.
   *
   * ⚠️ AN ABSENT VALUE OMITS ITS KEY RATHER THAN WRITING `undefined`, AND THAT IS THE FAITHFUL READING.
   * Assigning a null into a CFML struct key leaves the key unset, so a product whose default SKU has no
   * price reaches `createSkus` WITHOUT a `price` key — and `createSkus` reads that key without a guard,
   * so it raises there, at its own locator. Writing the key with an `undefined` value instead would make
   * `createSkus` see a PRESENT key, coerce it to `NaN` and store a nonsense price. The conditional
   * spread keeps the failure at the legacy's own failure point.
   *
   * ==============================================================================================
   * THE EXISTING-OPTION WALK — `:L140-L148`, AND WHY IT IS CASE-INSENSITIVE
   * ==============================================================================================
   * `:L144` is one condition with two halves, and BOTH are case-insensitive in CFML:
   *   - `…getOptionGroup().getOptionGroupID() != newOption.getOptionGroup().getOptionGroupID()` uses
   *     CFML's `!=`, which compares STRINGS WITHOUT REGARD TO CASE. A `!==` translation would treat two
   *     spellings of one identifier as different groups and would admit a second option from the group
   *     being added.
   *   - `!listFindNoCase(newOptionsData.options, …getOptionID())` is explicitly case-insensitive
   *     membership.
   * Both are reproduced by comparing case-folded values while APPENDING THE ORIGINAL SPELLING, so the
   * identifiers handed to `createSkus` are byte-for-byte the ones the entities carry, in the order the
   * walk encounters them.
   *
   * `:L142` and `:L144` also dereference `getOptionGroup()` on each existing option with no guard, as
   * `:L130`/`:L131` do on the new option. Those raise with their locators.
   *
   * ==============================================================================================
   * THE CONSEQUENCE AT `:L150`, PRESERVED
   * ==============================================================================================
   * `createSkus` is re-entered on a product that ALREADY HAS SKUS. The legacy performs no reconciliation
   * of any kind: it does not remove the existing combinations, does not detect that some of the
   * combinations it is about to generate already exist, and does not de-duplicate afterwards. Re-running
   * this process can therefore regenerate the cross-product and leave duplicate combinations behind.
   * That is carried across unchanged — no diff, no merge, no pre-clean (Guideline 4).
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product being processed.
   * @param processObject - Carries the identifier of the option to add.
   * @returns The same product, as `:L154` does.
   * @throws {DomainError} at each point the legacy dereferences a lookup result or a relationship
   *   without a guard.
   */
  public async processProductAddOption(
    product: Product,
    processObject: ProductAddOption,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'addOption');
    if (product.hasErrors()) {
      return product;
    }

    /* `:L130` — the lookup, and `:L131` reads straight off its result. */
    const optionID = processObject.option;
    if (optionID === undefined) {
      throw new DomainError(
        'The addOption process object carries no option identifier, and the legacy member passes it ' +
          'to the lookup without a guard.',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L130',
          },
        },
      );
    }

    const newOption = await this.optionService.getOption(optionID);
    if (newOption === null) {
      throw new DomainError(
        'The option identifier resolves to no option, and the legacy member reads getOptionID() off ' +
          'the result of that lookup without a guard.',
        {
          context: {
            productID: product.productID,
            optionID,
            locator: 'model/service/ProductService.cfc:L130',
          },
        },
      );
    }

    const newOptionGroupID = this.requireOptionGroupID(
      newOption,
      'model/service/ProductService.cfc:L144',
    );

    /* `:L132` and `:L135-L137` — both read the default SKU, which `:L132` dereferences unguarded. */
    const defaultSku = this.requireDefaultSku(product, 'model/service/ProductService.cfc:L132');
    const defaultSkuPrice = defaultSku.getPrice();
    const defaultSkuListPrice = defaultSku.getListPrice();

    /* `:L131` — the option list starts as the new option's identifier alone. Held as an array while it
     * is walked, and rendered back to a CFML list once, at the end. */
    const selectedOptionIds: string[] = [newOption.optionID];
    const selectedOptionIdsFolded = new Set<string>([newOption.optionID.toLowerCase()]);

    /* `:L140-L148` — the nested walk. The collection is read once: nothing in either loop body mutates
     * the product's SKU collection or any SKU's option collection, so a single read is observationally
     * identical to the legacy's re-read on every iteration, and the iteration ORDER is unchanged. */
    const existingSkus: Sku[] = readProductSkusAsSkus(
      product,
      'model/service/ProductService.cfc:L140',
    );

    for (const existingSku of existingSkus) {
      for (const existingOption of existingSku.getOptions()) {
        const existingOptionGroupID = this.requireOptionGroupID(
          existingOption,
          'model/service/ProductService.cfc:L144',
        );

        /* `:L144` — CFML's `!=` on strings is case-INSENSITIVE, and so is `listFindNoCase`. Comparison
         * folds case; the value appended at `:L145` keeps its original spelling. */
        const differentGroup =
          existingOptionGroupID.toLowerCase() !== newOptionGroupID.toLowerCase();
        const alreadyListed = selectedOptionIdsFolded.has(existingOption.optionID.toLowerCase());

        if (differentGroup && !alreadyListed) {
          selectedOptionIds.push(existingOption.optionID);
          selectedOptionIdsFolded.add(existingOption.optionID.toLowerCase());
        }
      }
    }

    const newOptionsData: Record<string, unknown> = {
      [OPTIONS_DATA_KEY]: selectedOptionIds.join(CFML_LIST_DELIMITER),
      ...(defaultSkuPrice === undefined ? {} : { [PRICE_DATA_KEY]: defaultSkuPrice }),
      ...(defaultSkuListPrice === undefined ? {} : { [LIST_PRICE_DATA_KEY]: defaultSkuListPrice }),
    };

    /* `:L150` — re-entered on a product that already has SKUs; see the block above. */
    await this.skuService.createSkus(product, newOptionsData);

    /* `:L152` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
    return this.processProductUpdateDefaultImageFileNames(product);
  }

  /**
   * Reads an option's option-group identifier, raising where the legacy dereferences it unguarded.
   *
   * `model/service/ProductService.cfc:L144` chains `getOptionGroup().getOptionGroupID()` on both the
   * new option and each existing option, with no check at either step. `model/entity/Option.cfc:L59`
   * declares the relationship required, so an option without one is a corrupt row rather than a
   * supported state — and the legacy fails on it too.
   */
  private requireOptionGroupID(option: Option, locator: string): string {
    const optionGroup = option.optionGroup;
    if (optionGroup === undefined) {
      throw new DomainError(
        'An option has no option group, and the legacy member reads getOptionGroupID() off that ' +
          'relationship without a guard.',
        { context: { optionID: option.optionID, locator } },
      );
    }

    return optionGroup.optionGroupID;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 6 OF 15 — `model/service/ProductService.cfc:L157`
   * ============================================================================================ */

  /**
   * Approves or holds a new product review, and attributes it to the signed-in account.
   *
   * ==============================================================================================
   * ⚠️ TR-5 — `ProductReview` IS EXCLUDED, AND THE MEMBER IS KEPT ANYWAY
   * ==============================================================================================
   * `model/entity/ProductReview.cfc` and `model/validation/ProductReview.json` are both out of scope
   * (AAP §0.2.2.4), and `Account` is out of scope too (§0.2.2.1). The public member may NOT be dropped
   * for that reason — dropping it would silently shrink the 15-member contract the prompt requires to be
   * checkable method-by-method — so it is kept, and as much of the observed behaviour as the existing
   * ports permit is preserved.
   *
   * NO OUT-OF-SCOPE TYPE IS IMPORTED OR INVENTED. The process object arrives as `unknown` and is
   * narrowed by {@link isProductReviewProcessObject}, a PRIVATE STRUCTURAL GUARD over the single member
   * `:L160` reads. That is deliberate: declaring a `ProductReview` interface here would put an excluded
   * entity's contract in this file, and creating one under `../domain/**` would add a file the AAP does
   * not list (S5).
   *
   * THE THREE OBSERVED BEHAVIOURS, PRESERVED:
   *   `:L159`  the setting is read THROUGH THE PRODUCT — `arguments.product.setting(…)`, not through the
   *            Hibachi scope — so the resolution context names the product. That distinction is not
   *            cosmetic: `model/entity/HibachiEntity.cfc:L129` resolves a setting hierarchically, and an
   *            entity-scoped read can differ from a global one.
   *   `:L160`  / `:L162` the active flag is set to 1 or 0. Both branches are reproduced explicitly
   *            rather than collapsed into a ternary over a boolean, because the legacy writes the
   *            NUMBERS 1 and 0 into the flag and a boolean would be a different value.
   *   `:L166`  / `:L167` the account is attached only when a user is signed in.
   *
   * ⚠️ THE SIGNED-IN PREDICATE IS A TRANSLATION, AND IT IS FLAGGED AS ONE. `getHibachiScope().getLoggedInFlag()`
   * is `!getSession().getAccount().isNew()` (`org/Hibachi/HibachiScope.cfc:L40-L45`) — a session always
   * holds an account, and being signed OUT is represented by that account being NEW rather than by its
   * absence. `../ports/AccountContextPort` deliberately declines to model the session, and answers
   * `undefined` when there is no current account. The faithful reading of the legacy predicate is
   * therefore "an account is present AND it is not new", and both clauses are required: dropping the
   * newFlag test would attribute reviews to the anonymous account, which is exactly what `isNew()`
   * exists to prevent.
   *
   * ⚠️ AND `setAccount` RECEIVES AN {@link AccountReference}, NOT AN ACCOUNT ENTITY. `:L167` passes the
   * scope's account object. The only account currency that crosses this boundary is the port's
   * reference, so that is what is passed; whoever implements the review target adapts it. Recorded as a
   * boundary translation rather than claimed as equivalence.
   *
   * VALIDATION — `model/validation/Product.json` declares NO rules for the `addProductReview` context,
   * and `../validation/Validator` does not admit it as a context. The legacy pipeline still validated
   * the entity against an empty rule set for that context, which produced no findings, so the ported
   * member simply runs. The `:L112` invocation gate is preserved directly, because a product that
   * arrived carrying findings must not be mutated.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product being reviewed. Returned unchanged in every path.
   * @param processObject - The `addProductReview` process object, narrowed structurally.
   * @returns The same product, as `:L170` does.
   * @throws {DomainError} when the process object does not expose `getNewProductReview`.
   */
  public processProductAddProductReview(
    product: Product,
    processObject: unknown,
  ): Promise<Product> {
    /* `:L112` — the invocation gate, reproduced without the retired dispatcher. No rule set exists for
     * this context, so there is nothing to validate against; a product that already carries findings is
     * still left untouched. */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    if (!isProductReviewProcessObject(processObject)) {
      return Promise.reject(
        new DomainError(
          'The addProductReview process object does not expose getNewProductReview, which the legacy ' +
            'member calls without a guard. ProductReview is out of scope (AAP §0.2.2.4), so no ' +
            'process-object type is declared here and the shape is checked structurally.',
          {
            context: {
              productID: product.productID,
              locator: 'model/service/ProductService.cfc:L157-L171',
            },
          },
        ),
      );
    }

    /* `:L159` — read through the PRODUCT, not through the global scope. */
    const autoApprove: boolean = toCfmlBoolean(
      this.settings.setting('productAutoApproveReviewsFlag', {
        entityName: 'Product',
        entityId: product.productID,
      }),
    );

    /* `:L160` / `:L162` — the literal 1 and 0, both branches explicit. */
    if (autoApprove) {
      processObject.getNewProductReview().setActiveFlag(REVIEW_ACTIVE_FLAG_APPROVED);
    } else {
      processObject.getNewProductReview().setActiveFlag(REVIEW_ACTIVE_FLAG_PENDING);
    }

    /* `:L166-L168` — see the signed-in-predicate note above. */
    const currentAccount = this.accountContext.getCurrentAccount();
    if (currentAccount !== undefined && !currentAccount.newFlag) {
      processObject.getNewProductReview().setAccount(currentAccount);
    }

    return Promise.resolve(product);
  }

  /* ==============================================================================================
   * DECLARED MEMBER 7 OF 15 — `model/service/ProductService.cfc:L173`
   * ============================================================================================ */

  /**
   * Adds a subscription-term SKU to a product.
   *
   * The body is reproduced in source order, and the order is observable because `:L183` counts the
   * product's existing SKUs BEFORE `:L191` attaches the new one:
   *   `:L175`  the term is resolved through `../ports/SubscriptionTermPort`.
   *   `:L176`  a new SKU is created through the explicitly declared `SkuService.newSku` (IR-1).
   *   `:L178`  the price is copied, UNGUARDED.
   *   `:L179`  the renewal price is copied, UNGUARDED.
   *   `:L180`  the list price is GUARDED — and the guarded branch is broken. See D6 below.
   *   `:L183`  the SKU code is composed from the product code and the existing SKU COUNT PLUS ONE.
   *   `:L184`  the term is attached.
   *   `:L185-L187`  the default SKU's subscription benefits are copied across.
   *   `:L188-L190`  its renewal subscription benefits are copied across.
   *   `:L191`  the SKU is attached to the product — AFTER the count at `:L183` was taken.
   *   `:L193`  the image file names are refreshed.
   *
   * ==============================================================================================
   * TODO(parity) D6 — `model/service/ProductService.cfc:L173-L196`, at `:L180-L182`
   * ==============================================================================================
   * The guard and the assignment read DIFFERENT OBJECTS:
   *
   *   `:L180`  `if( arguments.processObject.getListPrice() != "" && isNumeric( … ) )`
   *   `:L181`  `newSku.setListPrice( arguments.data.listPrice );`
   *
   * The signature at `:L173` declares `(required any product, required any processObject)`. There is NO
   * `data` argument, so `arguments.data` is UNDEFINED and the assignment fails at run time — but only
   * when the guard passes, which is to say only when a caller supplies a non-empty numeric list price.
   * The member appears to work for every caller who omits one.
   *
   * PRESERVED, NOT REPAIRED (Guideline 4, S7). Specifically NOT done:
   *   - a third `data` parameter is NOT added. The public two-argument signature is part of the
   *     preserved contract, and adding a parameter would change it;
   *   - the assignment is NOT redirected to `processObject.getListPrice()`. That is the obvious repair,
   *     it is almost certainly what the author meant, and making it would mean this port stores a list
   *     price where the legacy raises — a silent behavioural divergence in the direction of "working";
   *   - the branch is NOT skipped, and no substitute value is invented. Either would report success for
   *     an operation the legacy cannot complete.
   * Instead the branch raises {@link LegacyParityError} naming the locator, so the defect is reachable,
   * observable and attributable in exactly the circumstances that reach it in the legacy.
   *
   * THE PRICE COERCION FOLLOWS THE SIBLING'S ESTABLISHED CONVENTION. `:L178` and `:L179` hand whatever
   * the process object returns straight to a numeric ORM property; `../services/SkuService` already
   * ports that coercion as `toCfmlNumber`, and the same helper is used here rather than a second,
   * differently-behaving numeric reader (S5).
   *
   * ==============================================================================================
   * ⚠️ TR-5 — THE SUBSCRIPTION DOMAIN IS EXCLUDED, WITH ONE CONSEQUENCE STATED OUTRIGHT
   * ==============================================================================================
   * The eleven `Subscription*` components under `model/` are out of scope (AAP §0.2.2.1), so the term is a
   * {@link SubscriptionTermReference} from the port rather than an entity, and the process object is
   * narrowed structurally by {@link isSubscriptionTermProcessObject} rather than typed.
   *
   * The benefit copy at `:L185-L190`, however, is NOT stubbed: `../domain/sku/Sku` carries
   * `subscriptionBenefits` and `renewalSubscriptionBenefits` as collections of the same port reference,
   * so once the default SKU is narrowed to the entity the loops run faithfully, including
   * `addSubscriptionBenefit`'s own membership check.
   *
   * AND THE VALIDATED PATH CANNOT REACH THIS BODY TODAY. `model/validation/Product.json` gates the
   * `addSubscriptionTerm` context on `unusedProductSubscriptionTerms` holding at least one entry, and
   * `Product.getUnusedProductSubscriptionTerms()` answers an EMPTY ARRAY with no finder — see
   * {@link ProductService.buildProcessValidationSubject} for why no finder exists and why one is not
   * invented. The guard therefore fails and this member returns early. That is the honest consequence of
   * a declared boundary meeting a real rule, it is reported rather than engineered around, and the body
   * below is nonetheless a complete port so that it is correct the moment the subscription domain is
   * converted.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product gaining a subscription SKU.
   * @param processObject - The `addSubscriptionTerm` process object, narrowed structurally.
   * @returns The same product, as `:L195` does.
   * @throws {DomainError} when the process object lacks an observed member, when the term identifier
   *   resolves to no term, or when the product has no default SKU.
   * @throws {LegacyParityError} when the `:L180` guard passes, because `:L181` then reads an argument
   *   the signature does not declare.
   */
  public async processProductAddSubscriptionTerm(
    product: Product,
    processObject: unknown,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'addSubscriptionTerm');
    if (product.hasErrors()) {
      return product;
    }

    if (!isSubscriptionTermProcessObject(processObject)) {
      throw new DomainError(
        'The addSubscriptionTerm process object does not expose the members the legacy member calls. ' +
          'The subscription domain is out of scope (AAP §0.2.2.1), so the shape is checked ' +
          'structurally rather than typed.',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L173-L196',
          },
        },
      );
    }

    /* `:L175` — resolved through the port; the legacy chains no guard, and `:L184` would pass the null
     * straight into the relationship. */
    const subscriptionTermID = processObject.getSubscriptionTermID();
    const newSubscriptionTerm =
      await this.subscriptionTermPort.getSubscriptionTerm(subscriptionTermID);
    if (newSubscriptionTerm === null) {
      throw new DomainError(
        'The subscription-term identifier resolves to no term, and the legacy member assigns the ' +
          'lookup result to the SKU relationship without a guard.',
        {
          context: {
            productID: product.productID,
            subscriptionTermID,
            locator: 'model/service/ProductService.cfc:L175',
          },
        },
      );
    }

    /* `:L176` — the explicitly declared synthesized member on the sibling service. */
    const newSku = this.skuService.newSku();

    /* `:L178` / `:L179` — both unguarded, both coerced the way the sibling coerces. */
    newSku.price = toCfmlNumber(processObject.getPrice());
    newSku.renewalPrice = toCfmlNumber(processObject.getRenewalPrice());

    /* `:L180` — the guard, reproduced exactly: non-empty AND numeric. */
    const listPriceCandidate = processObject.getListPrice();
    if (readsAsNonEmptyCfmlText(listPriceCandidate) && readsAsCfmlNumeric(listPriceCandidate)) {
      /* TODO(parity) D6 — `:L181` assigns from `arguments.data.listPrice`, and no `data` argument
       * exists. See the block above for why this raises instead of being redirected or skipped. */
      throw new LegacyParityError(
        'The legacy member guards on the process object but assigns from arguments.data.listPrice, ' +
          'and its signature declares no data argument, so the assignment cannot be performed. ' +
          'Carried unrepaired as defect D6.',
        {
          context: {
            productID: product.productID,
            defect: 'D6',
            locator: 'model/service/ProductService.cfc:L180-L182',
            guardedOn: 'processObject.getListPrice()',
            assignedFrom: 'arguments.data.listPrice',
          },
        },
      );
    }

    /* `:L183` — `getProductCode() & "-#arrayLen(getSkus()) + 1#"`. The count is taken here, BEFORE the
     * product is attached at `:L191`, so it excludes this SKU. */
    const existingSkuCount = product.getSkus().length;
    newSku.skuCode = `${product.productCode ?? ''}${SKU_CODE_SEGMENT_DELIMITER}${String(
      existingSkuCount + 1,
    )}`;

    /* `:L184`. */
    newSku.setSubscriptionTerm(newSubscriptionTerm);

    /* `:L185-L190` — copied from the DEFAULT SKU's collections, not from the process object. The legacy
     * re-evaluates the collection on every iteration of each loop; neither body mutates the default
     * SKU, so a single read yields the same members in the same order. */
    const defaultSku = this.requireDefaultSkuEntity(
      product,
      'model/service/ProductService.cfc:L185',
    );

    for (const subscriptionBenefit of defaultSku.subscriptionBenefits) {
      newSku.addSubscriptionBenefit(subscriptionBenefit);
    }

    for (const renewalSubscriptionBenefit of defaultSku.renewalSubscriptionBenefits) {
      newSku.addRenewalSubscriptionBenefit(renewalSubscriptionBenefit);
    }

    /* `:L191`. */
    newSku.setProduct(product);

    /* `:L193` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
    return this.processProductUpdateDefaultImageFileNames(product);
  }

  /* ==============================================================================================
   * DECLARED MEMBER 8 OF 15 — `model/service/ProductService.cfc:L198`
   * ============================================================================================ */

  /**
   * Deletes a product's default image file.
   *
   * ==============================================================================================
   * ⚠️ TR-5 — FILESYSTEM I/O IS OUT OF SCOPE, AND `node:fs` IS FORBIDDEN IN THIS LAYER
   * ==============================================================================================
   * `:L200` calls `fileExists(…)` and `:L201` calls `fileDelete(…)`. Neither has any equivalent this
   * service may reach: `../ports/ImagePathPort` composes and probes WEB paths and can save an
   * already-completed upload, but declares no delete, and adding one would be inventing a port member
   * (S5). Importing `node:fs` is prohibited outright (S4) — a service in a hexagonal design does not
   * touch a device.
   *
   * ==============================================================================================
   * TODO(parity) AN UNNUMBERED D10-CLASS DEFECT MAKES THE BODY UNREACHABLE IN THE LEGACY TOO
   * ==============================================================================================
   * `:L199` tests `structKeyExists(arguments.data, "imageFile")` — correctly scoped. `:L200` and `:L201`
   * then interpolate `#imageFile#`, an UNSCOPED reference, NOT `arguments.data.imageFile`. Nothing in
   * the component declares `imageFile`, so the moment the key IS present the path composition raises an
   * undefined-variable error. The member only "works" when there is nothing to delete.
   *
   * This is the same class of finding as `:L73`/`:L75` and `:L118` — an unscoped variable — so per AAP
   * §0.6.7.5 it is recorded WITHOUT minting a new defect number, and it is PRESERVED:
   *   - the composition is NOT silently corrected to `data.imageFile`. That repair would make a
   *     never-executed delete path start executing, which is a behavioural change in the most
   *     consequential possible direction — file removal;
   *   - no deletion is claimed to have succeeded, and no `true` is returned to imply one;
   *   - the no-op path is preserved EXACTLY: when the key is absent, `:L199` skips everything and
   *     `:L205` returns the product, so this member does the same and raises nothing.
   *
   * The setting is read through the HIBACHI SCOPE at `:L200`, not through the product — contrast `:L159`
   * — so it is resolved globally here, with no entity context. Reading it before the raise keeps the
   * legacy's evaluation order visible.
   *
   * VALIDATION — `model/validation/Product.json` declares no rules for `deleteDefaultImage`. The `:L112`
   * gate is preserved.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product whose image is being removed. Returned in the no-op path.
   * @param data - The request payload; only the `imageFile` key is read, and only for its presence.
   * @returns The same product, as `:L205` does, when no image file was named.
   * @throws {NotImplementedError} when an image file IS named, because the legacy path both requires
   *   filesystem access this layer may not perform and fails on an unscoped variable before reaching it.
   */
  public processProductDeleteDefaultImage(
    product: Product,
    data: Record<string, unknown>,
  ): Promise<Product> {
    /* `:L112`. */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    /* `:L199` — the correctly scoped presence test. Absent means no-op, exactly as written. */
    if (!dataKeyExists(data, IMAGE_FILE_DATA_KEY)) {
      return Promise.resolve(product);
    }

    /* `:L200` — read through the global scope, before the composition that fails. */
    const imageFolderPath = this.settings.setting('globalAssetsImageFolderPath');

    return Promise.reject(
      new NotImplementedError(
        'ProductService.processProductDeleteDefaultImage',
        'the legacy path performs filesystem I/O, which this layer may not reach (TR-5, S4), and it ' +
          'interpolates an unscoped imageFile rather than data.imageFile, so it raises in the legacy ' +
          'too the moment the key is present — carried unrepaired',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L198-L206',
            unscopedReference: 'imageFile',
            resolvedDirectory: `${imageFolderPath}${PRODUCT_DEFAULT_IMAGE_PATH_SEGMENT}`,
            defectClass: 'D10-class, unnumbered (AAP §0.6.7.5)',
          },
        },
      ),
    );
  }

  /* ==============================================================================================
   * DECLARED MEMBER 9 OF 15 — `model/service/ProductService.cfc:L208`
   * ============================================================================================ */

  /**
   * Regenerates the image file name of every SKU on a product.
   *
   * `:L209-L211` is a two-line loop: for each SKU, `setImageFile( sku.generateImageFileName() )`. The
   * body is pure in-memory string composition, and it IS ported in full rather than stubbed —
   * `../domain/sku/Sku.generateImageFileName` already carries the whole algorithm from
   * `model/entity/Sku.cfc:L131-L139`, including the two product-scoped settings it reads and the
   * `imageGroupFlag` test that decides which option codes contribute.
   *
   * WHY IT NONETHELESS TOUCHES A BOUNDARY, AND WHY THAT IS SATISFIED HERE. AAP §0.4.1.8 classifies this
   * member as boundary-stubbed because the generator reaches image behaviour. In the ported domain that
   * reach is narrowed to exactly two setting reads — `productImageOptionCodeDelimiter` and
   * `productImageDefaultExtension` — which `../ports/SettingResolverPort` already declares. No excluded
   * service is crossed, no path is composed and no file is touched, so the loop runs for real and the
   * TR-5 gap does not arise. The proof that the injected resolver satisfies the SKU-side contract is
   * {@link SettingResolverSatisfiesSkuContract}.
   *
   * ⚠️ THE UNCACHED GENERATOR IS CALLED ON PURPOSE. `Sku` also exposes a memoizing accessor; `:L210`
   * calls the GENERATOR, so a stale per-instance cache cannot mask a change made earlier in the same
   * process — which matters precisely because the three members that call this one have just mutated a
   * SKU's options.
   *
   * FOUR CALLERS, ALL DIRECT. `:L123`, `:L152`, `:L193` and `:L282` each reached this behaviour through
   * `this.processProduct(product, {}, 'updateDefaultImageFileNames')` — a reflective call through the
   * dispatcher IR-1/TR-3 retire. All four now call this member by name, which is what makes the string
   * `'updateDefaultImageFileNames'` appear nowhere in this file as a dispatch key.
   *
   * VALIDATION — and this is why the pipeline helper is not used here: `model/validation/Product.json`
   * declares NO rules for `updateDefaultImageFileNames`, and `../validation/Validator` does not admit it
   * as a context at all, so there is nothing to validate against. What the legacy pipeline DID
   * contribute is the invocation gate at `org/Hibachi/HibachiService.cfc:L112`, and that is reproduced
   * literally: a product carrying findings is returned untouched. Preserving it matters — the four
   * callers each invoke this member after their own mutation, and `saveProduct` invokes it inside a
   * gated branch where an error may have been recorded a moment earlier.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product whose SKUs are renamed in place.
   * @returns The same product, as `:L213` does.
   * @throws {DomainError} when a SKU collection member is not a SKU entity, or — propagated from the
   *   generator — when a SKU has no product or a contributing option carries no option group.
   */
  public processProductUpdateDefaultImageFileNames(product: Product): Promise<Product> {
    /* `org/Hibachi/HibachiService.cfc:L112` — the invocation gate, all that survives of the pipeline
     * for a context with no rule set. */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    /* `:L209-L211`. */
    const skus: Sku[] = readProductSkusAsSkus(product, 'model/service/ProductService.cfc:L209');
    for (const sku of skus) {
      sku.imageFile = sku.generateImageFileName(this.settings);
    }

    return Promise.resolve(product);
  }

  /* ==============================================================================================
   * DECLARED MEMBER 10 OF 15 — `model/service/ProductService.cfc:L216`
   * ============================================================================================ */

  /**
   * Applies a price and/or a list price to every SKU of a product.
   *
   * Fully ported — no boundary, no stub, no excluded collaborator. The one member of the four process
   * methods whose behaviour is entirely within the slice.
   *
   * THE BODY, IN SOURCE ORDER:
   *   `:L218`  the SKU collection is read once, into a local.
   *   `:L219`  the whole loop is gated on the collection being non-empty. Redundant over a `for…of`,
   *            and reproduced anyway so the shape matches the source a reader is comparing against.
   *   `:L222`  `if( processObject.getUpdatePriceFlag() )` — CFML evaluates the flag as a BOOLEAN, which
   *            accepts `1`, `"1"`, `"true"`, `"yes"` and their negatives alike. The ported process
   *            object declares the flag as `string | number` precisely because the legacy declares no
   *            type, so it is read through the CFML boolean reader rather than tested for truthiness:
   *            JavaScript would treat the STRING `"0"` as true, which would apply a price the legacy
   *            leaves alone.
   *   `:L223`  the price is assigned, with the same numeric coercion the sibling uses.
   *   `:L226`  / `:L227` the same, for the list price.
   *   `:L232`  the product is returned.
   *
   * ⚠️ NO IMAGE REFRESH. `:L216-L233` does NOT call `updateDefaultImageFileNames`, unlike the three
   * other process members. Prices do not participate in image file names, so there is nothing to
   * refresh — and adding the call for symmetry would be inventing work the legacy does not do.
   *
   * TODO(parity) D10-CLASS, UNNUMBERED — `:L220` declares its loop counter `i` without `var`, leaking it into the
   * component's shared scope. Block scoping removes the hazard; recorded as a translation decision.
   *
   * VALIDATION — this context DOES have a process-object rule set, and it is the only one that does.
   * `model/validation/Product_UpdateSkus.json` declares two CONDITIONS — `showPrice` when
   * `updatePriceFlag eq 1`, `showListPrice` when `updateListPriceFlag eq 1` — and makes `price` and
   * `listPrice` required and numeric only under them. That is why
   * {@link buildProductUpdateSkusValidationSubject} exists and why the process object is handed to the
   * validator here: the conditional rules are the whole point of the context.
   *
   * THE PROCESS-OBJECT FINDINGS DO NOT GATE THE BODY, AND THAT IS THE LEGACY'S BEHAVIOUR, NOT AN
   * OVERSIGHT. `org/Hibachi/HibachiService.cfc:L112` gates on `entity.hasErrors()` alone, and
   * `HibachiTransient.hasErrors()` reads only the object's OWN bag — a process object's findings are
   * never merged into the entity's. `model/validation/Product.json` declares no `updateSkus` rules, so
   * the entity is validated against nothing and the body runs even when the conditional price rules
   * fail. Harmonising that — gating on the process object's bag — would be an improvement and a
   * divergence; see the note on {@link ProductService.runProcessValidation} for why those findings
   * additionally have nowhere to be recorded.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product whose SKUs are repriced.
   * @param processObject - Carries the two flags and the two prices.
   * @returns The same product, as `:L232` does.
   * @throws {DomainError} when a SKU collection member is not a SKU entity.
   */
  public async processProductUpdateSkus(
    product: Product,
    processObject: ProductUpdateSkus,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'updateSkus', {
      subject: buildProductUpdateSkusValidationSubject(processObject),
      ruleSet: productUpdateSkusValidationRuleSet,
    });
    if (product.hasErrors()) {
      return product;
    }

    /* `:L218`. */
    const skus: Sku[] = readProductSkusAsSkus(product, 'model/service/ProductService.cfc:L218');

    /* `:L219` — reproduced although a `for…of` makes it redundant. */
    if (skus.length > 0) {
      for (const sku of skus) {
        /* `:L222-L224` — CFML boolean evaluation, not JavaScript truthiness. */
        if (this.readProcessFlag(processObject.updatePriceFlag, 'updatePriceFlag', ':L222')) {
          sku.price = toCfmlNumber(processObject.price);
        }

        /* `:L226-L228`. */
        if (
          this.readProcessFlag(processObject.updateListPriceFlag, 'updateListPriceFlag', ':L226')
        ) {
          sku.listPrice = toCfmlNumber(processObject.listPrice);
        }
      }
    }

    return product;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 11 OF 15 — `model/service/ProductService.cfc:L235`
   * ============================================================================================ */

  /**
   * Uploads a product's default image.
   *
   * ==============================================================================================
   * ⚠️ TR-5 — THE UPLOAD PRIMITIVE ITSELF IS OUT OF SCOPE
   * ==============================================================================================
   * `:L249` calls CFML's `fileUpload( tempDirectory, 'uploadFile', acceptedMIMETypes, 'makeUnique' )` —
   * a tag that consumes the CURRENT REQUEST'S multipart body, writes the part to disk and answers a
   * result struct — and `:L250` then calls `fileMove` to relocate it. Three things that path needs are
   * unavailable to this layer, each for a stated reason:
   *   - the multipart request body. Request handling lives in `src/handlers/**` (S4), and this service
   *     imports no AWS type and reads no event;
   *   - `getHibachiTempDirectory()`. AAP §0.6.3.1 classifies it as a framework facility and EXCLUDES it
   *     rather than narrowing it to a port;
   *   - filesystem I/O. `node:fs` is forbidden here (S4), and `../ports/ImagePathPort.saveImageFile`
   *     accepts an ALREADY-COMPLETED `uploadResult` — it consumes the output of the missing primitive,
   *     it does not replace it. That is why that port is not injected into this service at all.
   *
   * WHAT IS STILL PORTED FOR REAL, so the boundary is as narrow as the evidence allows:
   *   `:L240`  the upload directory is composed from the global setting and the `/product/default`
   *            suffix. Note the suffix has NO trailing slash here, while `:L200`'s has one; the two
   *            literals are kept separate rather than unified, because unifying them would change one
   *            of the two composed paths.
   *   `:L241`  the full file path is composed from that directory and the process object's image file.
   *   `:L249`  the accepted MIME types are read from the `uploadFile` property's metadata, under the
   *            legacy attribute spelling `hb_fileAcceptMIMEType`.
   * All three are performed before the gap is reported, so the observable pre-state — which setting was
   * read, which path was composed, which MIME types were accepted — is preserved exactly.
   *
   * ==============================================================================================
   * THE CATCH BEHAVIOUR IS THE OBSERVABLE CONTRACT, AND IT IS HONOURED
   * ==============================================================================================
   * `:L252-L254` catches EVERY exception and records `addError('imageFile', rbKey('validate.fileUpload'))`
   * on the process object, then `:L256` returns the product normally. The member therefore never
   * propagates an upload failure — it converts it into a validation finding. This port does the same:
   * the unavailable primitive is exactly the failure the catch exists for, so the finding is recorded
   * and the product is returned.
   *
   * THE MESSAGE KEY IS IMPORTED, NEVER RETYPED. `FILE_UPLOAD_RBKEY` comes from `../errors/ValidationError`
   * so the key is declared once; an inline `'validate.fileUpload'` here could drift from it silently.
   *
   * TODO(parity) D10-CLASS, UNNUMBERED — `:L253` references `processObject` UNSCOPED inside the catch block, where
   * every other line in the member uses `arguments.processObject`. In CFML this happens to resolve
   * because the unscoped name falls through to the arguments scope, so it works by accident rather than
   * by intent. The typed parameter is used here, and the deliberate correction is recorded without
   * minting a new defect number.
   *
   * VALIDATION — `model/validation/Product.json` declares no rules for `uploadDefaultImage`. The `:L112`
   * gate is preserved.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The product whose default image is being replaced.
   * @param processObject - The `uploadDefaultImage` process object, narrowed structurally.
   * @returns The same product, as `:L256` does — with the upload failure recorded on the process object
   *   rather than raised, which is precisely what `:L252-L254` does.
   * @throws {DomainError} when the process object does not expose the three members `:L241`, `:L249`
   *   and `:L253` call. This is NOT the upload failure: it means the object cannot even be the one the
   *   legacy operates on, so there is nothing to record a finding against.
   */
  public processProductUploadDefaultImage(
    product: Product,
    processObject: unknown,
  ): Promise<Product> {
    /* `:L112`. */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    if (!isUploadDefaultImageProcessObject(processObject)) {
      return Promise.reject(
        new DomainError(
          'The uploadDefaultImage process object does not expose the members the legacy member calls, ' +
            'so there is no object on which to record the fileUpload finding.',
          {
            context: {
              productID: product.productID,
              locator: 'model/service/ProductService.cfc:L235-L257',
            },
          },
        ),
      );
    }

    /* `:L240` — the global setting, and the suffix WITHOUT a trailing slash. */
    const uploadDirectory = `${this.settings.setting(
      'globalAssetsImageFolderPath',
    )}${PRODUCT_DEFAULT_IMAGE_UPLOAD_DIRECTORY_SEGMENT}`;

    /* `:L241`. */
    const fullFilePath = `${uploadDirectory}${IMAGE_PATH_SEPARATOR}${processObject.getImageFile()}`;

    /* `:L249` — the accepted MIME types, under the legacy attribute spelling. */
    const acceptedMimeTypes =
      processObject.getPropertyMetaData(UPLOAD_FILE_PROPERTY_NAME).hb_fileAcceptMIMEType;

    /* `:L244-L250` cannot be performed here; see the block above. `:L252-L254` is what the legacy does
     * when they fail, and it is what is done — the finding is recorded, not raised. The composed path
     * and MIME types are read first so the pre-state matches the source exactly. */
    void fullFilePath;
    void acceptedMimeTypes;

    processObject.addError(IMAGE_FILE_DATA_KEY, FILE_UPLOAD_RBKEY);

    /* `:L256`. */
    return Promise.resolve(product);
  }

  /**
   * Evaluates one of the two `Product_UpdateSkus` flags the way CFML evaluates an `if` condition.
   *
   * `model/service/ProductService.cfc:L222` and `:L226` place the flag DIRECTLY in an `if`, and CFML
   * casts it to a boolean there — accepting `1`, `0`, `"1"`, `"0"`, `"true"`, `"false"`, `"yes"` and
   * `"no"`, and RAISING for anything else, including null. `model/process/Product_UpdateSkus.cfc:L49`
   * declares the property with no default and no type, so an unpopulated flag is null and the legacy
   * raises on it.
   *
   * BOTH HALVES OF THAT ARE REPRODUCED, AND NEITHER IS SOFTENED:
   *   - the cast is CFML's, not JavaScript's. Testing truthiness instead would treat the STRING `"0"` as
   *     true and would apply a price the legacy leaves alone — the single most likely silent divergence
   *     in this member;
   *   - a value that cannot be cast RAISES rather than being treated as false. Skipping it quietly would
   *     turn a failed update into a successful no-op, which reports success for work never done.
   */
  private readProcessFlag(value: unknown, flagName: string, locator: string): boolean {
    if (!readsAsCfmlBoolean(value)) {
      throw new DomainError(
        'The update flag cannot be evaluated as a CFML boolean, and the legacy member places it ' +
          'directly in an if condition, which raises for exactly these values.',
        {
          context: {
            flagName,
            locator: `model/service/ProductService.cfc${locator}`,
          },
        },
      );
    }

    return toCfmlBoolean(value);
  }

  /**
   * Resolves a product's default SKU AS THE SKU ENTITY, which the delegate in that slot is not.
   *
   * `model/service/ProductService.cfc:L185` and `:L188` need the entity, because they read its
   * subscription-benefit collections — and `Product.defaultSku` holds a
   * {@link ProductDefaultSkuDelegate} wrapper instead. See
   * {@link ProductServiceCollaborators.defaultSkuIdReader} for why that is so, why an `instanceof`
   * test against the slot is false at run time, and why the reader is the sanctioned way across.
   *
   * The entity is located by identifier among `Product.getSkus()`, narrowed there from the
   * relationship's member interface. Failure to find it RAISES rather than being papered over: the
   * legacy dereferences the default SKU with no guard at both lines, so a product whose default SKU is
   * not among its own SKUs is corrupt in either system, and quietly copying no benefits would produce a
   * subscription SKU the legacy would never have produced.
   */
  private requireDefaultSkuEntity(product: Product, locator: string): Sku {
    const defaultSkuDelegate = this.requireDefaultSku(product, locator);
    const defaultSkuID = this.defaultSkuIdReader(defaultSkuDelegate);

    const skus: Sku[] = readProductSkusAsSkus(product, locator);
    const defaultSku = skus.find((sku) => sku.skuID === defaultSkuID);

    if (defaultSku === undefined) {
      throw new DomainError(
        "The product's default SKU is not present among its own SKUs, so the entity behind the " +
          'default-SKU delegate cannot be resolved and its subscription-benefit collections cannot ' +
          'be read.',
        { context: { productID: product.productID, defaultSkuID, locator } },
      );
    }

    return defaultSku;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 12 OF 15 — `model/service/ProductService.cfc:L264`
   * ============================================================================================ */

  /**
   * Saves a product, creating its SKUs on first save.
   *
   * ==============================================================================================
   * ⚠️ THIS MEMBER BYPASSES THE BASE SERVICE, AND THE BYPASS IS LOAD-BEARING
   * ==============================================================================================
   * `:L287` is `arguments.product = getHibachiDAO().save( target=arguments.product )` — the DATA-ACCESS
   * save, called DIRECTLY. It is not `super.save()`. That single line is the most important thing to
   * understand about this member, because it means the whole of `model/service/HibachiService.cfc:L86-L104`
   * — the LOCAL base override, with its activeFlag handling and its settings-cache post-processing — DOES
   * NOT RUN for a product. `saveProductType` two members below DOES call `super.save()`, and
   * `model/service/BrandService.cfc:L76` does too.
   *
   * THE ASYMMETRY IS PRESERVED AND MUST NOT BE HARMONISED. Routing this through the base service would
   * be the obvious tidy-up; it would also start running post-processing the legacy never runs for a
   * product, which is a behavioural change. That is why `ProductBaseService` is declared as
   * `Pick<BaseService<…>, 'delete'>` — `save` IS DELIBERATELY ABSENT FROM THE INJECTED TYPE, so the
   * harmonisation is not merely discouraged, it does not compile. The narrow
   * {@link EntityPersister} callback supplied at construction is the ported equivalent of the direct
   * data-access call.
   *
   * ==============================================================================================
   * THE FIVE STEPS, IN ORDER, WITH THE PRECISE CONDITION EACH ONE USES
   * ==============================================================================================
   *   1. `:L266`  POPULATE FROM THE PAYLOAD. Performed through `../domain/base/populate` with the
   *      product's own descriptor set, so the `hb_populateEnabled="false"` exclusions
   *      `model/entity/HibachiEntity.cfc:L56` honours are honoured here too.
   *
   *   2. `:L268-L270`  THE URL TITLE, AND THREE DETAILS THAT ARE EACH EASY TO GET WRONG:
   *        - the test is `isNull( getURLTitle() )` — NULL ONLY. A product whose URL title is the EMPTY
   *          STRING keeps it. Contrast `saveProductType` at `:L295`, which tests null OR empty. Adding
   *          an emptiness test here would generate titles the legacy leaves alone;
   *        - `data.urlTitle` is NOT consulted. Population at step 1 has already had its chance to set
   *          the property, so the entity is the only thing read;
   *        - the title string is `getTitle()`, NOT `getProductName()`. `model/entity/Product.cfc`
   *          composes `getTitle()` from the `productTitleString` setting, so it can differ from the
   *          product name entirely.
   *      The result is assigned TO THE ENTITY — `setURLTitle(...)` — not into `data`. Again the contrast
   *      with `saveProductType`, which mutates the payload instead, is real and is preserved.
   *
   *   3. `:L273`  VALIDATE IN THE `save` CONTEXT. The findings are recorded on the entity, because every
   *      gate below reads `product.hasErrors()` and `org/Hibachi/HibachiTransient.cfc:L47-L53` reads the
   *      object's own bag.
   *
   *   4. `:L276-L283`  ONLY WHEN THE PRODUCT IS NEW **AND** CLEAN: create the SKUs, then refresh the
   *      image file names. Both conjuncts matter — an existing product never re-enters SKU creation from
   *      here, and a product carrying validation findings never enters it at all.
   *
   *   5. `:L286-L288`  PERSIST ONLY WHEN STILL CLEAN. `hasErrors()` is re-read, because step 4 can add
   *      findings: `SkuService.createSkus` records required-field failures ON THE PRODUCT.
   *
   * ==============================================================================================
   * ⚠️ M6 — THE ORDERING IS THE EXECUTION-MODEL MISMATCH, AND IT IS SEQUENTIAL ON PURPOSE
   * ==============================================================================================
   * The product is still TRANSIENT while its SKUs are being created and validated at step 4; it is not
   * persisted until step 5. Under CFML that worked because Hibernate held everything in a session and
   * flushed at request end. It matters here because `Sku.hasUniqueOptions` — a REGISTERED VALIDATION
   * RULE in `model/validation/Sku.json`, not a helper — QUERIES BACK the SKUs of the same product while
   * the batch is being written (AAP §0.6.2, the highest-risk item in the slice).
   *
   * Two consequences for this file:
   *   - every step above is `await`ed IN SEQUENCE. No step is hoisted, reordered or run concurrently,
   *     and `Promise.all` appears nowhere: the odometer order in which `createSkus` enumerates
   *     combinations determines the order in which uniqueness validation observes its siblings;
   *   - the transaction boundary that makes each insert visible to the next read is NOT this service's
   *     to draw. `src/adapters/mysql/UnitOfWork.ts` owns it (AAP §0.4.1.7), and a service in a
   *     hexagonal design does not open a transaction. Naming that here is the flag AAP §0.6.6 asks for.
   *
   * TEST PROVENANCE: NET-NEW as a service member, with TRACEABLE neighbours.
   * `meta/tests/unit/IssuesTest.cfc:L51-L70` (`issue_1097`) populates, saves and deletes a product with
   * a nested product-type struct and therefore exercises steps 1, 3 and 5 end to end.
   *
   * @param product - The product to save. Mutated in place and also returned.
   * @param data - The request payload, used for population and forwarded to SKU creation.
   * @returns The saved product when it validated, or the same product carrying findings when it did not.
   *   `:L291` returns the product either way, so this member does NOT throw on validation failure —
   *   unlike `../services/BaseService.save`, whose contract does.
   */
  public async saveProduct(product: Product, data: Record<string, unknown>): Promise<Product> {
    /* STEP 1 — `:L266`. */
    populate(product, data, this.productPropertyDescriptors, this.populationAuthorization);

    /* STEP 2 — `:L268-L270`. Null only; `getTitle()`, not the product name; set on the entity. */
    if (product.urlTitle === undefined) {
      product.urlTitle = await this.createUniqueProductUrlTitle(product.getTitle(this.settings));
    }

    /* STEP 3 — `:L273`. `price` is non-persistent on the product and delegates to the default SKU, so
     * the delegating accessor is what the required-and-numeric rule must see; the rule set's own
     * boundary note assigns that resolution to whoever assembles the subject, which is this member. */
    const errors = await this.validator.validate(
      buildProductValidationSubject(product, { price: product.getPrice() }),
      productValidationRuleSet,
      'save',
    );
    product.addErrors(errors.getErrors());

    /* STEP 4 — `:L276-L283`. Both conjuncts, in the legacy's order. */
    if (product.isNew() && !product.hasErrors()) {
      await this.skuService.createSkus(product, data);

      /* `:L282` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
      product = await this.processProductUpdateDefaultImageFileNames(product);
    }

    /* STEP 5 — `:L286-L288`. Re-read, because step 4 can record findings on the product. */
    if (!product.hasErrors()) {
      product = await this.persistProduct(product);
    }

    /* `:L291`. */
    return product;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 13 OF 15 — `model/service/ProductService.cfc:L294`
   * ============================================================================================ */

  /**
   * Saves a product type, deriving its URL title and inheriting its parent's products.
   *
   * ==============================================================================================
   * ⚠️ THE URL TITLE IS WRITTEN INTO THE PAYLOAD, NOT ONTO THE ENTITY
   * ==============================================================================================
   * `:L297` and `:L299` both assign `data.urlTitle = …`. They do NOT call a setter on the product type.
   * That is a BY-REFERENCE MUTATION of the caller's struct, and it is functional rather than incidental:
   * the value only reaches the entity because `:L303` then hands the same struct to `super.save()`,
   * which populates from it. Assigning to the entity instead would appear equivalent and would in fact
   * differ twice over — the caller's struct would no longer carry the derived title, and population
   * would not see it.
   *
   * The contrast with `saveProduct` two members above — which sets the entity and never touches the
   * payload — is deliberate on the legacy's part and is preserved on both sides.
   *
   * ==============================================================================================
   * THE FOUR-CLAUSE OUTER GATE AND THE THREE-WAY INNER CHOICE, EXACTLY AS WRITTEN
   * ==============================================================================================
   * `:L295` fires only when the entity has NO usable title AND the payload has NO usable title:
   *   `( isNull(getURLTitle()) || !len(getURLTitle()) ) && ( !structKeyExists(data,"urlTitle") || !len(data.urlTitle) )`
   * Note this member tests NULL **OR** EMPTY on the entity, where `saveProduct:L268` tests null alone.
   * Both readings are preserved as written rather than being made consistent with each other.
   *
   * Inside, `:L296-L300` chooses between three outcomes:
   *   - `:L297`  the PAYLOAD's `productTypeName`, when present and non-empty. Preferred first;
   *   - `:L299`  otherwise the ENTITY's `productTypeName`, when present and non-empty;
   *   - and OTHERWISE NOTHING AT ALL. There is no `else`. When neither name is usable, `data.urlTitle`
   *     is never written, and the type proceeds to `super.save()` with no URL title — where
   *     `model/validation/ProductType.json` requires one, so the save fails validation. That third path
   *     is easy to miss and easy to "fix" with a fallback; no fallback is invented (S9), because the
   *     validation failure is the legacy's answer.
   *
   * ==============================================================================================
   * `:L303` COMPOSES THE BASE SERVICE — AND THAT IS WHY THE `:L306` GATE NEEDS NO ERROR CHECK
   * ==============================================================================================
   * `super.save(productType, data)` resolves to the LOCAL override at
   * `model/service/HibachiService.cfc:L86` (IR-8), not to the framework base — the local one adds
   * activeFlag and settings-cache post-processing. It is reached by DELEGATION to an injected
   * collaborator, not by inheritance (R3), which is what keeps this service composed rather than
   * subclassed.
   *
   * `:L306`'s first clause is `!arguments.productType.hasErrors()`. `../services/BaseService.save`
   * THROWS a `ValidationError` when validation fails, so if the awaited call returns normally there were
   * no findings — the clause is satisfied BY CONTROL FLOW, and re-testing it would be dead code. The
   * clause is preserved in meaning, not in syntax, and this note is the record of that judgment.
   *
   * ==============================================================================================
   * `:L306-L308` — THE PARENT-PRODUCT-TYPE INHERITANCE, PORTED IN FULL
   * ==============================================================================================
   * Three clauses, all required, in this order: no findings; a parent product type exists; and that
   * parent has at least one product. Only then does `:L307` REPLACE this type's product collection with
   * the parent's — `setProducts(...)`, an outright replacement, not an append and not a union. A type
   * with its own products loses them to the parent's set. That is what the source does, so that is what
   * happens here; the arity guard is preserved too, so a childless parent leaves the collection alone.
   *
   * This logic was absent from the summary row in AAP §0.4.1.8 and is mandatory per the agent
   * prompt — it is read from the source and reproduced rather than inferred.
   *
   * TEST PROVENANCE: NET-NEW as a service member. `meta/tests/unit/IssuesTest.cfc:L51-L70`
   * (`issue_1097`) saves a product carrying a nested product-type struct and is TRACEABLE for the
   * neighbouring population path.
   *
   * @param productType - The product type to save.
   * @param data - The request payload. MUTATED BY DESIGN: `urlTitle` may be written into it.
   * @returns The saved product type, reassigned from the base service's return as `:L303` does.
   * @throws {ValidationError} propagated from the composed base service when validation fails. `:L310`
   *   returns normally in the legacy and sets an error flag instead; the ported base service's throw is
   *   its established contract and the two other in-slice callers of `save` already rely on it.
   */
  public async saveProductType(
    productType: ProductType,
    data: Record<string, unknown>,
  ): Promise<ProductType> {
    /* `:L295` — entity null OR empty, AND payload absent OR empty. */
    const entityUrlTitleUnusable = !hasEntityText(productType.urlTitle);
    const payloadUrlTitleUnusable = dataValueLength(data, URL_TITLE_DATA_KEY) === 0;

    if (entityUrlTitleUnusable && payloadUrlTitleUnusable) {
      const payloadProductTypeName = dataValueText(data, PRODUCT_TYPE_NAME_DATA_KEY);

      if (payloadProductTypeName !== undefined) {
        /* `:L297` — the payload's name wins. Written INTO the payload, by reference. */
        data[URL_TITLE_DATA_KEY] =
          await this.createUniqueProductTypeUrlTitle(payloadProductTypeName);
      } else if (hasEntityText(productType.productTypeName)) {
        /* `:L298-L299` — otherwise the entity's name. */
        data[URL_TITLE_DATA_KEY] = await this.createUniqueProductTypeUrlTitle(
          productType.productTypeName,
        );
      }
      /* No else. `:L296-L300` has none; see the three-way note above for why none is invented. */
    }

    /* `:L303` — the LOCAL base override, reached by composition, and reassigned from its return. */
    productType = await this.productTypeBaseService.save(productType, data);

    /* `:L306-L308` — all three clauses. The first is satisfied by control flow; see the note above. */
    const parentProductType = productType.parentProductType;
    if (parentProductType !== undefined) {
      const parentProducts = parentProductType.getProducts();
      if (parentProducts.length > 0) {
        /* `:L307` — a REPLACEMENT, not a merge. */
        productType.setProducts(parentProducts);
      }
    }

    /* `:L310`. */
    return productType;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 14 OF 15 — `model/service/ProductService.cfc:L317`
   * ============================================================================================ */

  /**
   * Deletes a product, clearing its default SKU first and restoring it only if the delete is refused.
   *
   * ==============================================================================================
   * ⚠️ THE NULL DANCE IS LOAD-BEARING, AND ITS ASYMMETRY IS THE POINT
   * ==============================================================================================
   * `:L320`  the current default SKU is stashed in a local — the source comment says "so we can reset
   *          if delete fails".
   * `:L323`  the relationship is CLEARED — `setDefaultSku( javaCast("null","") )`, CFML's idiom for
   *          assigning a genuine null. The source comment explains why: "Remove the default sku so that
   *          we can delete this entity". `SwProduct.defaultSkuID` references `SwSku`, and `SwSku` in turn
   *          references `SwProduct`, so the circular reference must be broken before either row can go.
   * `:L326`  the composed base service decides. `model/service/HibachiService.cfc:L68` runs the delete
   *          validation and the settings and comments cleanup, and answers a boolean.
   * `:L329-L333`  ON FAILURE ONLY, the stashed SKU is put back and `false` is returned.
   * `:L335`  on success the relationship STAYS CLEARED and `true` is returned.
   *
   * WHAT MUST NOT BE DONE, because it is the natural instinct and it is wrong:
   *   - the restore must NOT move into a `finally`, and must NOT be made unconditional. On success the
   *     product is gone and re-pointing a deleted row's relationship at a SKU is meaningless at best;
   *   - the clear must NOT be deferred until after the delete decision. It is what MAKES the delete
   *     possible, so deferring it would change the outcome rather than tidy the sequence;
   *   - the boolean must NOT be re-derived, negated or turned into a throw. `:L332` and `:L335` return
   *     it as they find it, and the caller distinguishes refusal from success by that value.
   *
   * `../services/BaseService.delete` is the right collaborator for exactly this reason: it RETURNS A
   * BOOLEAN and does not throw when the delete guards refuse, which is precisely the shape `:L326`
   * consumes. (Contrast its `save`, which throws — see the note on `saveProductType`.)
   *
   * THE CLEAR AND THE RESTORE GO THROUGH `../domain/base/populate`'s ASSIGNMENT PRIMITIVES.
   * `clearPropertyValue` deletes the property, which is how an ABSENT optional relationship is spelled
   * under `exactOptionalPropertyTypes` — the faithful reading of `javaCast("null","")`. Writing
   * `undefined` into the slot would leave the property PRESENT with an undefined value, which is a
   * different state, and the one the compiler rejects for that very reason. The restore is conditional
   * for the same reason: a product that had NO default SKU to begin with must be left with the property
   * absent, not present-and-undefined.
   *
   * THE DELETE GUARDS THEMSELVES BELONG TO THE BASE SERVICE. `model/validation/Product.json` declares
   * two — `physicalCounts` at maximum zero and `transactionExistsFlag` equal to false — and they are
   * evaluated by the composed base service against the delete subject its own resolver produces, wired
   * at the composition root. This member does not evaluate them and does not second-guess them.
   *
   * TEST PROVENANCE: NET-NEW as a service member. `meta/tests/unit/IssuesTest.cfc:L51-L70`
   * (`issue_1097`) deletes a saved product and is TRACEABLE for the success path.
   *
   * @param product - The product to delete. Its default-SKU relationship is mutated either way.
   * @returns `true` when the delete succeeded, `false` when the guards refused it — the base service's
   *   own answer, returned unchanged.
   */
  public async deleteProduct(product: Product): Promise<boolean> {
    /* `:L320` — stash it. */
    const defaultSku = product.defaultSku;

    /* `:L323` — clear it, so the circular reference cannot block the delete. */
    clearPropertyValue<ProductPropertyName>(product, PRODUCT_DEFAULT_SKU_PROPERTY);

    /* `:L326` — the composed base service, which answers a boolean rather than throwing. */
    const deleteOK = await this.baseService.delete(product);

    /* `:L329-L333` — restore ON FAILURE ONLY, and only when there was something to restore. */
    if (!deleteOK) {
      if (defaultSku !== undefined) {
        assignPropertyValue<ProductPropertyName>(product, PRODUCT_DEFAULT_SKU_PROPERTY, defaultSku);
      }

      return false;
    }

    /* `:L335` — on success the relationship stays cleared. */
    return true;
  }

  /* ==============================================================================================
   * DECLARED MEMBER 15 OF 15 — `model/service/ProductService.cfc:L342`
   * ============================================================================================ */

  /**
   * Builds the paginated product query, with its joins and keyword properties registered.
   *
   * `:L343-L357` sets the entity name, obtains a smart list, registers THREE related-property joins and
   * FIVE keyword properties, and returns it. Every one of those is reproduced.
   *
   * ==============================================================================================
   * THE JOINS — AND THE ONE ASYMMETRY THAT CHANGES RESULTS
   * ==============================================================================================
   *   `:L347`  `productType` — INNER, by omission of the third argument.
   *   `:L348`  `defaultSku`  — INNER, likewise.
   *   `:L349`  `brand`       — **LEFT**, explicitly.
   * Brand is the only optional one of the three, and that is not cosmetic: making it inner would DROP
   * every product without a brand from every result, and making the other two left would ADMIT products
   * with no product type or no default SKU that the legacy excludes. The three are frozen in
   * {@link PRODUCT_SMART_LIST_JOINS} in source order, with the join type carried per entry.
   *
   * ==============================================================================================
   * THE KEYWORD PROPERTIES — FIVE, ALL AT WEIGHT 1, IN DECLARATION ORDER
   * ==============================================================================================
   * `:L351-L355` registers `calculatedTitle`, `brand.brandName`, `productName`, `productCode` and
   * `productType.productTypeName`, each with `weight=1` explicitly. Two of the five reach ACROSS the
   * joins above, which is why the joins must be registered first — `brand.brandName` depends on the
   * left join, so a keyword search still matches brandless products on the other four properties.
   *
   * Every weight is written out rather than defaulted, because the legacy writes them out; and the
   * uniform value is why {@link PRODUCT_KEYWORD_PROPERTY_WEIGHT} is a single named constant rather than
   * five literals. The ORDER is preserved because relevance ranking reads the registration sequence.
   *
   * ==============================================================================================
   * DISCREPANCY 1 — `currentURL` IS ACCEPTED, TYPED, AND HAS NO EFFECT ON THE QUERY
   * ==============================================================================================
   * `:L342` declares `currentURL=""` with NO TYPE AT ALL, beside a `data` argument that IS typed.
   * AAP §0.4.2.1 tightens it to an optional string, and TR-1 requires that tightening be recorded rather
   * than made silently — this is the record.
   *
   * It is accepted and NOT forwarded, because there is nothing to forward it to.
   * `org/Hibachi/HibachiSmartList.cfc:L39` uses it solely for LINK BUILDING, a presentation concern;
   * `../ports/SmartListQueryPort` deliberately keeps it out of `SmartListInput` and out of
   * `SmartListQuery`, and states that reasoning on its own contract. The parameter therefore survives so
   * that the signature stays checkable method-by-method against the legacy, and it is spelled with a
   * leading underscore exactly as `SkuService.getSkuSmartList` spells it — the sibling precedent for the
   * same argument on the same port (S5). Dropping the parameter would break the ratified signature;
   * inventing a link-building surface to consume it would invent a port member.
   *
   * NO PAGINATION DEFAULT IS SUPPLIED, and no SQL appears here. `:L342` declares no page size and no
   * page number, so none is invented (S9); `translateSmartListInput` maps only what the caller provides,
   * and the adapter behind the port emits the statement.
   *
   * TEST PROVENANCE: NET-NEW as a service member, and the BEST-COVERED member in the file by legacy
   * regression. Three `meta/tests/unit/IssuesTest.cfc` cases are TRACEABLE:
   * `issue_1296` asserts PAGE-RECORD DISTINCTNESS — which is what the three joins make necessary, since
   * joining `skus` fans rows out; `issue_1329` exercises this member directly; and `issue_1331` covers
   * the neighbouring processability gate.
   *
   * @param data - Optional smart-list input: keywords, ordering, filters, pagination.
   * @param _currentURL - Accepted for signature parity and unused; see Discrepancy 1 above.
   * @returns The paginated product result, produced by the adapter behind the port.
   */
  public getProductSmartList(
    data?: SmartListInput,
    _currentURL?: string,
  ): Promise<SmartListResult<Product>> {
    return this.smartListQueryPort.execute<Product>(
      translateSmartListInput({
        /* `:L343`. */
        entityName: PRODUCT_ENTITY_NAME,
        input: data,
        /* `:L347-L349` — order and join types preserved, brand LEFT. */
        joins: PRODUCT_SMART_LIST_JOINS,
        /* `:L351-L355` — five properties, weight 1, registration order preserved. */
        keywordProperties: PRODUCT_SMART_LIST_KEYWORD_PROPERTIES,
      }),
    );
  }
}
