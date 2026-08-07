// Already present and consumed as-is: every one of the seven ports named on the constructor, the
// five entities imported below, `Money`, and the four `src/lib/cfml` semantic-parity helpers.

// slatwall-ts - Product, product-type and product-option orchestration service.
//
// `productTypeRepository` is on the constructor even though `productTypeDAO` is omitted, and the
// two facts do not contradict each other - see the JUDGMENT CALL on `saveProductType`.
//
// Saying so explicitly matters in this file for two distinct reasons.

import { z } from 'zod';

import { ENTITY_CODE_PATTERN } from '../domain/entities/optionGroup.js';
import { Money } from '../domain/valueObjects/money.js';
import { listAppend, listFindNoCase, listGetAt, listLen } from '../lib/cfml/list.js';
import { cfNumberToString } from '../lib/cfml/numberFormat.js';
import {
  cfEquals,
  structFindKey,
  structGet,
  structKeyExists,
  structKeyList,
} from '../lib/cfml/struct.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';
import type { CfTruthyInput } from '../lib/cfml/truthiness.js';

import type { Option } from '../domain/entities/option.js';
import type { OptionGroup } from '../domain/entities/optionGroup.js';
import type { Product } from '../domain/entities/product.js';
import type { ProductType } from '../domain/entities/productType.js';
import type { Sku } from '../domain/entities/sku.js';
import type { ImageStore, ImageUploadResultProjection } from '../domain/ports/imageStore.js';
// `SelectOption` only. The `OptionRepository` interface itself is deliberately not imported: this
// component declares no `optionDAO` property, so it takes no option repository edge - see the
// LEGACY-NOTE below the constructor.
import type { SelectOption } from '../domain/ports/optionRepository.js';
import type { ProductRepository, ProductSearchRow } from '../domain/ports/productRepository.js';
import type { ProductTypeRepository } from '../domain/ports/productTypeRepository.js';
import type { SkuRepository } from '../domain/ports/skuRepository.js';
import type { SubscriptionTermProvider } from '../domain/ports/subscriptionTermProvider.js';
import type { UrlTitleGenerator } from '../domain/ports/urlTitleGenerator.js';
import type { CfStruct } from '../lib/cfml/struct.js';

// The legacy component types every entity parameter and most returns as `any`.

/**
 * One entry of the accumulator that `getFormattedOptionGroups` returns.
 *
 * `SelectOption` is imported from `src/domain/ports/optionRepository.ts` rather than redeclared:
 * it is already published there as the shape `OptionService.getOptionsForSelect` produces.
 */
export interface FormattedOptionGroup {
  /**
   * The option-group name exactly as it was used as the struct key at
   * [model/service/ProductService.cfc:L76], via `getOptionGroupName()`.
   *
   * The ported `OptionGroup.getOptionGroupName()` answers `string | undefined` because the column
   * is nullable, while a CFML struct key is always a string.
   */
  readonly optionGroupName: string;

  /**
   * The select-list projection of that group's options, in repository order.
   */
  readonly options: readonly SelectOption[];
}

/**
 * Input to `processProduct_addOptionGroup`, derived from
 * [model/process/Product_AddOptionGroup.cfc:L49-L57] - a pure zero-logic `HibachiProcess` DTO
 * declaring exactly two properties.
 *
 * `product` is not a member here: it is the method's first parameter, exactly as the legacy
 * signature `(required any product, required any processObject)` declares it.
 *
 * `optionGroup` holds an ID STRING, not a hydrated entity.
 */
export interface ProductAddOptionGroupInput {
  /**
   * The option-group identifier to add. Loaded at L115.
   */
  readonly optionGroup: string;
}

/**
 * Input to `processProduct_addOption`, derived from [model/process/Product_AddOption.cfc:L49-L57]
 * the same zero-logic DTO shape, declaring `product` (L52) and `option` (L55).
 *
 * `option` likewise holds an ID string, proven by [model/service/ProductService.cfc:L130].
 */
export interface ProductAddOptionInput {
  /**
   * The option identifier to add. Loaded at L130.
   */
  readonly option: string;
}

/**
 * Input to `processProduct_updateSkus`, derived from
 * [model/process/Product_UpdateSkus.cfc:L49-L60].
 *
 * LEGACY-NOTE [model/process/Product_UpdateSkus.cfc:L52]: locator corrected from L49 to L52 for
 * the `product` property. Verified against source; the specification's line reference had drifted.
 *
 * Legacy dto declares no type on either flag, the declarative rule compares it to the literal
 * number 1, and the runtime branch applies a bare numeric truthiness test.
 */
export interface ProductUpdateSkusInput {
  /**
   * Gate for the price update. Read by the declarative condition `showPrice` as
   * `updatePriceFlag eq 1`, and by the runtime branch at [model/service/ProductService.cfc:L222]
   * as a bare truthiness test.
   */
  readonly updatePriceFlag?: string | number | boolean | undefined;

  /**
   * The price to apply. Required by the schema only when `updatePriceFlag` equals the number.
   */
  readonly price?: string | number | undefined;

  /**
   * Gate for the list-price update. Read by the declarative condition `showListPrice` as
   * `updateListPriceFlag eq 1`, and by the runtime branch at
   * [model/service/ProductService.cfc:L226] as a bare truthiness test.
   */
  readonly updateListPriceFlag?: string | number | boolean | undefined;

  /**
   * The list price to apply. Required by the schema only when `updateListPriceFlag` equals the
   * number.
   */
  readonly listPrice?: string | number | undefined;
}

/**
 * Input to `processProduct_deleteDefaultImage`.
 *
 * `imageFile` is optional because the legacy body gates every use of it behind
 * `structKeyExists(arguments.data, "imageFile")` [model/service/ProductService.cfc:L199].
 */
export interface DeleteDefaultImageInput {
  /**
   * Relative file name of the default image to remove. Gated at L199.
   */
  readonly imageFile?: string | undefined;
}

/**
 * Input to `processProduct_addProductReview` - an OUT-OF-SCOPE branch whose signature is published
 * for interface parity only.
 *
 * Modelled with a single opaque identifier rather than a review aggregate.
 */
export interface ProductAddProductReviewInput {
  readonly newProductReviewID?: string | undefined;
}

/**
 * Input to `processProduct_addSubscriptionTerm` - an OUT-OF-SCOPE branch whose signature is
 * published for interface parity only.
 *
 * Carries the one identifier the legacy body reads before it reaches anything out of scope:
 * `processObject.getSubscriptionTermID()` [model/service/ProductService.cfc:L175].
 */
export interface ProductAddSubscriptionTermInput {
  /**
   * The subscription term identifier the legacy branch would have loaded.
   */
  readonly subscriptionTermID: string;
}

/**
 * Input to `processProduct_uploadDefaultImage` - an OUT-OF-SCOPE branch whose signature is
 * published for interface parity only.
 *
 * Carries the two `Data Properties` the legacy process object declares
 * [model/process/Product_UploadDefaultImage.cfc:L53-L54] and nothing else: `imageFile`, read at
 * [model/service/ProductService.cfc:L241], and `uploadFile`.
 */
export interface ProductUploadDefaultImageInput {
  /**
   * Target file name for the uploaded default image. Read at L241.
   */
  readonly imageFile?: string | undefined;

  /**
   * The already-completed upload, as the read-only projection `src/domain/ports/imageStore.ts`
   * publishes. Absent when there is nothing to store.
   */
  readonly uploadFile?: ImageUploadResultProjection | undefined;
}

/**
 * The save payload for `saveProduct`, and - by the coupling documented below - the payload handed
 * to the SKU-creation collaborator.
 *
 * JUDGMENT CALL: this one type serves both `saveProduct(product, data)` and the `newOptionsData`
 * struct assembled by `processProduct_addOption`, and that is not an economy - it is the coupling
 * the legacy code already has, made visible.
 */
export interface ProductSaveInput {
  /**
   * The URL title `populate` [model/service/ProductService.cfc:L266] copies onto the entity, and
   * the value the one-clause generation guard at [model/service/ProductService.cfc:L268] then
   * sees.
   */
  urlTitle?: string | undefined;

  /**
   * The product name `populate` [model/service/ProductService.cfc:L266] copies onto the entity,
   * and the value the `required` save rule on `productName` `model/validation/Product.json` then
   * judges.
   *
   * The warning's premise ("the entity is immutable, so anything else has nowhere to go") no
   * longer holds either: `src/domain/entities/product.ts` publishes one ORM-generated setter per
   * scalar column.
   */
  productName?: string | undefined;

  /**
   * `productCode` [model/entity/Product.cfc:L56]. Populated at
   * [model/service/ProductService.cfc:L266] and judged by the `required` + `unique` + `regex` save
   * rule `model/validation/Product.json`.
   */
  productCode?: string | undefined;

  /**
   * `productDescription` [model/entity/Product.cfc:L57]. Populated at
   * [model/service/ProductService.cfc:L266]; no save rule is declared on it.
   */
  productDescription?: string | undefined;

  /**
   * `activeFlag` [model/entity/Product.cfc:L53]. Populated at
   * [model/service/ProductService.cfc:L266]; no save rule is declared on it.
   */
  activeFlag?: boolean | undefined;

  /**
   * `publishedFlag` [model/entity/Product.cfc:L58]. Populated at
   * [model/service/ProductService.cfc:L266]; no save rule is declared on it.
   */
  publishedFlag?: boolean | undefined;

  /**
   * `sortOrder` [model/entity/Product.cfc:L59]. Populated at
   * [model/service/ProductService.cfc:L266]; no save rule is declared on it.
   *
   * The legacy `ormtype="integer"` is stated as a `number` and is checked for integrality by
   * `populateProduct`.
   */
  sortOrder?: number | undefined;

  /**
   * `remoteID` [model/entity/Product.cfc:L93]. Populated at
   * [model/service/ProductService.cfc:L266]; no save rule is declared on it.
   *
   * The integration-identity column an external system stamps its own key into.
   */
  remoteID?: string | undefined;

  /**
   * Comma-delimited option-ID list consumed by the SKU-creation collaborator. Seeded at
   * [model/service/ProductService.cfc:L132] and EXTENDED in PLACE by `listAppend` at
   * [model/service/ProductService.cfc:L145], which is why it is writable.
   */
  options?: string | undefined;

  /**
   * List price for the SKUs to be created. Assigned at [model/service/ProductService.cfc:L136],
   * behind the single-clause guard at L135, which is why it is writable.
   */
  listPrice?: Money | undefined;

  /**
   * Price for the SKUs to be created. Read UNGUARDED from the default SKU at
   * [model/service/ProductService.cfc:L133] and never written afterwards.
   */
  readonly price?: Money | undefined;
}

/**
 * The save payload for `saveProductType`.
 *
 * Both fields exist because the four-clause guard at [model/service/ProductService.cfc:L295] reads
 * `data.urlTitle` and the first inner branch at [model/service/ProductService.cfc:L296-L297] reads
 * `data.productTypeName`.
 */
export interface ProductTypeSaveInput {
  /**
   * Written in place by either inner branch at L297 / L299 when generation fires.
   */
  urlTitle?: string | undefined;

  /**
   * The preferred title source, read by the first inner branch at L296 - and a populate target.
   */
  readonly productTypeName?: string | undefined;

  /**
   * `productTypeDescription` [model/entity/ProductType.cfc:L58]. Populated by `super.save`'s
   * populate step; no save rule is declared on it.
   */
  readonly productTypeDescription?: string | undefined;

  /**
   * `systemCode` [model/entity/ProductType.cfc:L59]. Populated by `super.save`'s populate step.
   *
   * A `delete`-context rule declares `maxLength: 0` on it `model/validation/ProductType.json` -
   * meaning a product type with a system code may not be deleted - and no save-context rule.
   */
  readonly systemCode?: string | undefined;
  readonly activeFlag?: boolean | undefined;

  /**
   * `publishedFlag` [model/entity/ProductType.cfc:L55]. Populated by `super.save`'s populate step;
   * no save rule is declared on it.
   */
  readonly publishedFlag?: boolean | undefined;
}

/**
 * A supplied paging bound is not a non-negative safe integer.
 *
 * The shape check is a correctness fix as much as a resource one, which is why the check is on
 * negativity and integrality rather than on magnitude.
 */
export class ProductPagingCriteriaError extends Error {
  /**
   * Which member was rejected.
   */
  readonly member: 'pageRecordsStart' | 'pageRecordsShow';

  /**
   * The value as supplied. Numeric, so reporting it discloses nothing.
   */
  readonly supplied: number;

  constructor(member: 'pageRecordsStart' | 'pageRecordsShow', supplied: number) {
    super(
      `Paging criterion '${member}' was supplied as ${String(supplied)}, and a supplied value must ` +
        'be a non-negative safe integer. Omit it instead: an absent pageRecordsStart begins at the ' +
        'first record and an absent pageRecordsShow returns the whole result set.',
    );

    this.name = 'ProductPagingCriteriaError';
    this.member = member;
    this.supplied = supplied;
  }
}

/**
 * A save payload carries a scalar column whose value is not of the ORM type the column declares.
 */
export class ProductPopulateError extends Error {
  /**
   * The payload member that was rejected.
   */
  readonly member: 'sortOrder';

  /**
   * The value as supplied. Numeric, so reporting it discloses nothing.
   */
  readonly supplied: number;

  constructor(member: 'sortOrder', supplied: number) {
    super(
      `Save payload member '${member}' was supplied as ${String(supplied)}, and the column it ` +
        'populates declares ormtype="integer" [model/entity/Product.cfc:L59]. Supply a safe ' +
        'integer, or omit the member to leave the stored value untouched.',
    );

    this.name = 'ProductPopulateError';
    this.member = member;
    this.supplied = supplied;
  }
}

/**
 * One failed save-context rule: the property it names and the message the server authored.
 *
 * CFML parity [org/Hibachi/HibachiService.cfc:L151-L167]: a failed save is an ordinary return in the
 * legacy - `save` returns the same entity whether it validated or not and leaves the errors on it,
 * and [model/service/ProductService.cfc:L291, L309] both end `return arguments.<entity>;`. So this
 * tier reports rules through `addError` on the entity and never through an exception.
 */
export interface ProductSaveContextError {
  /**
   * The property the failed rule is declared on.
   */
  readonly propertyIdentifier: string;
  /**
   * The rule that failed. Never the value that failed it.
   */
  readonly errorMessage: string;
}

/**
 * Reject a supplied paging bound that is not a non-negative safe integer.
 *
 * `undefined` passes untouched, because absence is a meaning rather than a missing value on both
 * members.
 */
function assertPagingBound(
  member: 'pageRecordsStart' | 'pageRecordsShow',
  supplied: number | undefined,
): void {
  if (supplied === undefined) {
    return;
  }

  if (!Number.isSafeInteger(supplied) || supplied < 0) {
    throw new ProductPagingCriteriaError(member, supplied);
  }
}

/**
 * Criteria for `findProducts`, the replacement for `getProductSmartList`
 * [model/service/ProductService.cfc:L342-L358].
 *
 * `currentURL` survives as a plain optional string with the legacy `""` default because the
 * parameter is part of the surface being diffed; nothing in the ported path derives behaviour from
 * it.
 */
export interface ProductQueryCriteria {
  /**
   * This once read "the five keyword properties preserved on {@link ProductPage}" and that was a
   * cross-layer contradiction.
   *
   * Required here, though the port member it feeds is optional.
   *
   * `ProductRepository.searchProductsByProductType(term?, productTypeIDs?)` declares `term`
   * optional because [model/dao/ProductDAO.cfc:L419] declares `string term` without `required`.
   */
  readonly keyword: string;

  /**
   * Comma-delimited product-type identifiers to restrict to.
   */
  readonly productTypeIDs?: string | undefined;

  /**
   * Zero-based index of the first record to return. Absent means start at the beginning; no page
   * size or offset is invented when the caller supplies none.
   */
  readonly pageRecordsStart?: number | undefined;

  /**
   * Maximum number of records to return. Absent means the whole result set.
   */
  readonly pageRecordsShow?: number | undefined;

  /**
   * Carried for signature parity with the legacy `currentURL=""` parameter
   * [model/service/ProductService.cfc:L342]. Not interpreted.
   */
  readonly currentURL?: string | undefined;
}

/**
 * The result of `findProducts`: the matched products, the paging window that produced them, and
 * the query contract of the statement that actually ran.
 *
 * The last part is the point, and it is worth being exact about which query it describes.
 *
 * The join `AND` keyword shapes are written inline rather than promoted to named aliases, keeping
 * this module's published names to the set its method signatures actually require.
 */
export interface ProductPage {
  /**
   * The matched rows, in repository order.
   */
  readonly records: readonly ProductSearchRow[];

  /**
   * How many products matched before the paging window was applied.
   */
  readonly recordsCount: number;

  /**
   * The zero-based start index actually applied.
   */
  readonly pageRecordsStart: number;

  /**
   * The window size actually applied, or `undefined` for the whole result set.
   */
  readonly pageRecordsShow: number | undefined;

  /**
   * The entity the legacy smart list was built against, verbatim from
   * [model/service/ProductService.cfc:L343].
   */
  readonly entityName: 'SlatwallProduct';

  /**
   * The related-property joins the executed statement performs.
   *
   * The member survives as an empty list rather than being deleted, because "this query joins
   * nothing" is a fact worth publishing: it is what tells a caller that a product with no brand.
   *
   * The element type stays STRUCTURAL rather than being narrowed to `never`, so a future statement
   * that genuinely joins can populate it without reopening this type.
   */
  readonly joins: readonly {
    readonly entityName: 'SlatwallProduct';
    readonly propertyIdentifier: string;
    readonly joinType: 'inner' | 'left';
  }[];

  /**
   * The properties the executed statement matches the keyword against: `productName` alone, at
   * weight.
   *
   * One PROPERTY, because [model/dao/ProductDAO.cfc:L421] writes `productName like:prodName` and
   * nothing more.
   */
  readonly keywordProperties: readonly {
    readonly propertyIdentifier: string;
    readonly weight: number;
  }[];
}

/**
 * The narrow SKU-creation collaborator this service requires.
 */
export interface SkuCreationCollaborator {
  /**
   * Creates the SKU set implied by the payload's option list and prices.
   *
   * Ported from `public boolean function createSkus(required any product, required struct data)`
   * [model/service/SkuService.cfc:L58].
   */
  createSkus(product: Product, data: ProductSaveInput): Promise<boolean>;
}

/**
 * The narrow batch-write collaborator `processProduct_updateSkus` requires: one UNIT of WORK for
 * the whole repriced set.
 *
 * Why it is a module-local structural contract and not a port member.
 */
export interface SkuBatchWriteCollaborator {
  /**
   * @param skus The SKUs this call mutated, in the order the product's collection holds them.
   * @returns Nothing. The persisted instances are deliberately not handed back: a `Sku`'s
   * identifier and audit stamps are `private readonly`, so the writer answers new objects.
   * @throws Whatever the write raises, after the transaction has been rolled back - so a raise
   * from here means NOTHING was persisted.
   */
  saveMutatedSkus(productID: string, skus: readonly Sku[]): Promise<void>;
}

/**
 * What a batch-bound refusal has to say about ITSELF, so one guard can serve more than one caller
 * without either caller's message going vague.
 *
 * WHY THIS EXISTS. `assertWithinUpdateBound` was written for a single caller and hardcoded that
 * caller's name, its verb and the legacy locator it was bounding, straight into the message it throws.
 * A SECOND bulk-write path now runs through the same guard - see
 * {@link ProductService.processProduct_updateDefaultImageFileNames} - and a shared guard that names
 * the wrong method in its refusal is worse than two guards: the operator reading the message goes
 * looking in the wrong place. So the three parts of the message that are the CALLER'S are supplied by
 * the caller, and everything else - the count, the bound, the identifier, the "nothing was mutated or
 * written" assurance - stays the guard's.
 *
 * IT IS NOT EXPORTED AND IT IS NOT A PORT. It carries no behaviour, describes no collaborator and
 * crosses no layer; it exists so that a `throw` composed in one place can still read as though it were
 * written at the site that raised it. `ProductService`'s published surface is unchanged by it.
 */
interface SkuBatchBoundRefusal {
  /**
   * The method that would have done the work, named exactly as the surface publishes it, so the
   * refusal points at the method a caller actually invoked rather than at the guard.
   */
  readonly operation: string;

  /**
   * What that method would have done to the SKUs, in the infinitive - `reprice`, `rename and rewrite`.
   * It completes the clause "would ... N SKUs", so a verb that does not fit that frame reads wrongly.
   */
  readonly verb: string;

  /**
   * The one sentence stating WHICH legacy statement is being bounded and WHY the bound exists at all,
   * cited to its locator. It ends with a full stop; the guard supplies the sentence that follows it.
   */
  readonly legacyGround: string;
}

/**
 * The narrow option-loading collaborator this service requires. See the JUDGMENT
 * CALL on {@link SkuCreationCollaborator} for why this is a local structural
 * interface rather than a port.
 *
 * Of the two sanctioned resolutions, the first - consume a member an existing port already
 * declares - was checked and does not fit: `src/domain/ports/optionRepository.ts` is closed at
 * exactly two members, `getUnusedProductOptions` and `getUnusedProductOptionGroups`.
 */
export interface OptionLoadingCollaborator {
  /**
   * Projects options onto the select-list shape.
   *
   * Ported from `public array function getOptionsForSelect(required any options)`
   * [model/service/OptionService.cfc:L55].
   */
  getOptionsForSelect(options: readonly Option[]): SelectOption[];

  /**
   * Loads one option group by identifier. Stands in for the framework generic accessor invoked at
   * [model/service/ProductService.cfc:L115].
   *
   * Answers `undefined` for an unknown identifier rather than throwing, matching how every ported
   * repository loader in this subtree reports a miss.
   */
  getOptionGroup(optionGroupID: string): Promise<OptionGroup | undefined>;

  /**
   * Loads one option by identifier. Stands in for the framework generic accessor invoked at
   * [model/service/ProductService.cfc:L130].
   */
  getOption(optionID: string): Promise<Option | undefined>;
}

// module-local constants and helpers.

/**
 * The related-property joins `findProducts`' statement performs: none.
 *
 * Taken verbatim from [model/service/ProductService.cfc:L347-L349], with the note that "the join
 * types are load-bearing and are not normalised...
 *
 * Every word of that is true of the SMART LIST, and the smart list is not what runs.
 */
const PRODUCT_QUERY_JOINS = [] as const satisfies ProductPage['joins'];

/**
 * The properties `findProducts`' statement matches the keyword against: `productName` alone.
 *
 * [model/dao/ProductDAO.cfc:L421] writes one comparison, `productName like:prodName`, and
 * [model/dao/ProductDAO.cfc:L422] binds `%#arguments.term#%` to it.
 */
const PRODUCT_QUERY_KEYWORD_PROPERTIES = [
  { propertyIdentifier: 'productName', weight: 1 },
] as const satisfies ProductPage['keywordProperties'];

/**
 * The physical table name the URL-title generator is called with when the subject is a product,
 * verbatim from [model/service/ProductService.cfc:L269].
 *
 * E6 carve-out, stated explicitly: this is not configuration and must not migrate to
 * `src/lib/config.ts`.
 */
const PRODUCT_URL_TITLE_TABLE = 'SwProduct';
const PRODUCT_TYPE_URL_TITLE_TABLE = 'SwProductType';

/**
 * The resource-bundle identifier the legacy upload branch attaches to its validation error,
 * verbatim from [model/service/ProductService.cfc:L253].
 *
 * LEGACY-NOTE [model/service/ProductService.cfc:L253]: this is a data contract string, carried
 * byte-identically and never resolved.
 */
const FILE_UPLOAD_VALIDATION_RB_KEY = 'validate.fileUpload';

/**
 * The process context the default-image upload is dispatched under.
 *
 * `'processObjects'` - the error NAME the framework injects under - is written at the call site
 * rather than hoisted, because it is the framework's own literal and appears exactly once.
 */
const UPLOAD_DEFAULT_IMAGE_PROCESS_CONTEXT = 'uploadDefaultImage';

/**
 * The process context `processProduct_addProductReview` is dispatched under.
 *
 * The sibling of {@link UPLOAD_DEFAULT_IMAGE_PROCESS_CONTEXT}, spelled the way this method's own
 * suffix spells it, and a DATA CONTRACT with the legacy admin for the same reason: it is the value a
 * caller reads back out of `product.getErrors().processObjects` after
 * `HibachiEntity.getErrors()` [org/Hibachi/HibachiEntity.cfc:L133-L146] has injected it.
 */
const ADD_PRODUCT_REVIEW_PROCESS_CONTEXT = 'addProductReview';

/**
 * The resource-bundle key recording that a process this port does not implement was reached.
 *
 * IT IS A NEW KEY AND NOT A LEGACY ONE, AND SAYING SO PLAINLY MATTERS. Every other `rbKey` in
 * this subtree is carried over verbatim so the legacy admin can still resolve it; this one has no
 * legacy counterpart, because the legacy IMPLEMENTED the process it names and had nothing to report.
 * It is spelled in the framework's own `<namespace>.<detail>` convention so a resolver treats it like
 * any other missing key rather than choking on it, and it is never resolved here - JavaRB is not
 * ported and no i18n runtime exists (AAP 0.5.3).
 */
const UNIMPLEMENTED_PROCESS_RB_KEY = 'validate.processNotImplemented';

/**
 * The permitted upload extensions for a product's default image, verbatim from
 * `hb_fileAcceptExtension` on the `uploadFile` property declaration
 * [model/process/Product_UploadDefaultImage.cfc:L54].
 *
 * Why this value and not the one at [model/service/SkuService.cfc:L212].
 *
 * The leading dots are the source's and are left in place.
 */
const DEFAULT_IMAGE_UPLOAD_ACCEPT_EXTENSIONS = '.jpeg,.jpg,.png,.gif';

/**
 * CFML `isNumeric()` for the shapes a JSON boundary can deliver: a finite number, or a string that
 * is a decimal numeral with an optional sign and an optional exponent.
 *
 * This IMPLEMENTS the declared rule `dataType: "numeric"` from
 * `model/validation/Product_UpdateSkus.json`; it does not add one.
 *
 * The exponent it admits is bounded by {@link isLegacyNumeric}, not by this pattern.
 */
const LEGACY_NUMERIC_NUMERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * The value the two declarative conditions of `model/validation/Product_UpdateSkus.json` compare
 * against.
 */
const CONDITION_FLAG_SET_VALUE = 1;

/**
 * How many SKUs a single `processProduct_updateSkus` call may reprice.
 *
 * [model/service/ProductService.cfc:L218-L230] loops over every SKU a product carries and applies
 * the new price to each.
 *
 * It is the same value and the same shape as `SkuService`'s creation bound, which guards the
 * combination odometer at [model/service/SkuService.cfc:L109-L121].
 */
const DEFAULT_MAXIMUM_SKU_UPDATE_BATCH_SIZE = 1000;

/**
 * Did the caller ASK for a SKU update? The non-raising half of the two flag questions.
 *
 * Why a second predicate exists alongside `cfTruthy`, which answers the same question.
 *
 * `cfTruthy` is asked INSIDE the repricing loop, at the line CFML asks it
 * [model/service/ProductService.cfc:L222, L226].
 *
 * @param flag `updatePriceFlag` or `updateListPriceFlag`, as supplied.
 * @returns whether the flag reads as a request to update, with no possibility of raising.
 */
function requestsSkuUpdate(flag: CfTruthyInput): boolean {
  if (flag === undefined || flag === null) {
    return false;
  }

  try {
    return cfTruthy(flag);
  } catch {
    // An unconvertible value. Answering `false` leaves the refusal to the loop; see above.
    return false;
  }
}

/**
 * Whether a flag satisfies `eq 1` the way the declarative condition does.
 *
 * CFML `eq` compares numerically, so the string `'1'` and the number `1` both satisfy the
 * condition while `'2'`, `2`, `0`, `false` and absence do not.
 */
function satisfiesConditionFlag(flag: unknown): boolean {
  if (typeof flag === 'boolean') {
    return flag;
  }

  if (typeof flag === 'number') {
    return flag === CONDITION_FLAG_SET_VALUE;
  }

  if (typeof flag === 'string' && LEGACY_NUMERIC_NUMERAL.test(flag.trim())) {
    return Number(flag.trim()) === CONDITION_FLAG_SET_VALUE;
  }

  return false;
}

/**
 * The declarative rule set of `model/validation/Product_UpdateSkus.json`, ported verbatim and
 * reproducing nothing MORE.
 *
 * This is the one zod usage licensed anywhere in `src/services/**`.
 */
const productUpdateSkusSchema = z
  .object({
    updatePriceFlag: z.unknown().optional(),
    price: z.unknown().optional(),
    updateListPriceFlag: z.unknown().optional(),
    listPrice: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    // The `showPrice` condition, then the `price` rule it gates.
    if (satisfiesConditionFlag(value.updatePriceFlag)) {
      if (value.price === undefined || value.price === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'price is required when updatePriceFlag equals 1',
          path: ['price'],
        });
      } else if (!isLegacyNumeric(value.price)) {
        ctx.addIssue({
          code: 'custom',
          message: 'price must be numeric when updatePriceFlag equals 1',
          path: ['price'],
        });
      }
    }

    // The `showListPrice` condition, then the `listPrice` rule it gates.
    if (satisfiesConditionFlag(value.updateListPriceFlag)) {
      if (value.listPrice === undefined || value.listPrice === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'listPrice is required when updateListPriceFlag equals 1',
          path: ['listPrice'],
        });
      } else if (!isLegacyNumeric(value.listPrice)) {
        ctx.addIssue({
          code: 'custom',
          message: 'listPrice must be numeric when updateListPriceFlag equals 1',
          path: ['listPrice'],
        });
      }
    }
  });

/**
 * Whether a candidate satisfies the legacy `dataType: "numeric"` constraint.
 *
 * Declared as a type predicate so that a value which passes can be handed to the decimal-string
 * conversion without an assertion.
 */
function isLegacyNumeric(value: unknown): value is string | number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && isWithinLegacyNumericMagnitude(String(value));
  }

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();

  return LEGACY_NUMERIC_NUMERAL.test(trimmed) && isWithinLegacyNumericMagnitude(trimmed);
}

/**
 * The widest numeral {@link isLegacyNumeric} admits, in characters.
 */
const MAX_LEGACY_NUMERIC_CHARACTERS = 1024;

/**
 * The widest decimal exponent {@link isLegacyNumeric} admits.
 */
const MAX_LEGACY_NUMERIC_EXPONENT = 256;

// The exponent, digits and sign of a numeral already matched by LEGACY_NUMERIC_NUMERAL. Read from
// the notation rather than parsed, because the point of this test is to decide whether parsing is
// safe.
const LEGACY_NUMERIC_EXPONENT_PART = /[eE]([+-]?\d+)$/;

/**
 * Whether a matched legacy numeral is narrow enough to render in plain notation.
 *
 * Two measures, both taken from the notation itself so that nothing is parsed before it is judged:
 * the raw character count, which catches a numeral written out in full.
 *
 * @param numeral a trimmed string already matched by {@link LEGACY_NUMERIC_NUMERAL}.
 * @returns whether the numeral is within both bounds.
 */
function isWithinLegacyNumericMagnitude(numeral: string): boolean {
  if (numeral.length > MAX_LEGACY_NUMERIC_CHARACTERS) {
    return false;
  }

  const exponentMatch = LEGACY_NUMERIC_EXPONENT_PART.exec(numeral);

  if (exponentMatch === null) {
    return true;
  }

  const declaredExponent = exponentMatch[1];

  if (declaredExponent === undefined) {
    return true;
  }

  return Math.abs(Number(declaredExponent)) <= MAX_LEGACY_NUMERIC_EXPONENT;
}

/**
 * Path constructs that make a stored-image name something other than one name.
 *
 * `deleteImageFile` has no legacy antecedent.
 *
 * [model/service/ProductService.cfc:L241-L250], recorded as a JUDGMENT CALL and registered in
 * `tests/traceability/legacyTestMap.ts` under `outOfScopeSecurityRefusals`, which names this
 * module, that legacy citation and this reasoning so the decision is greppable and gated rather
 * than buried in prose.
 */
const IMAGE_FILE_NAME_MAX_LENGTH = 255;

/**
 * Any path separator, in either posix or Windows form. See {@link IMAGE_FILE_NAME_MAX_LENGTH}.
 */
const IMAGE_FILE_SEPARATOR = /[/\\]/;

/**
 * Any C0 or C1 control character, NUL included.
 *
 * Written as an explicit code-point class rather than with `\p{Cc}` so that no Unicode-property
 * lookup stands between the source and what is rejected.
 */
const IMAGE_FILE_CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * The sentence that closes every refusal, phrased to be true of both callers.
 *
 * A per-operation variant was written first - `'No deletion was attempted.'` against
 * `'No file was stored.'` - and then removed.
 */
const IMAGE_FILE_REFUSAL_OUTCOME = 'No file was touched.';

/**
 * Rejects a `data.imageFile` value that is anything other than one plain file name.
 *
 * It throws rather than skipping the operation, and that is the deliberate choice.
 *
 * It runs before the path is composed, so no traversing string is ever built, let alone handed
 * across the port boundary.
 *
 * EXPORTED, SO THE TRANSPORT TIER CAN APPLY THE SAME RULE RATHER THAN A COPY OF IT.
 * `deleteDefaultImageBody` in `src/handlers/catalogQueryHandler.ts` publishes `imageFile`, and
 * runtime acceptance testing (finding F-04) found an EMPTY one answering HTTP 500 - because this
 * function's raise is a plain `Error` and the handler's error mapper reduces an unrecognized throw to
 * a server fault. An empty or traversing file name is a CALLER mistake and owes a 400 naming the
 * member. That schema now uses THIS FUNCTION as its predicate, so the wire grammar and the service's
 * grammar are one rule by construction - the same delegation `cfTruthy` and `toDecimalString` receive
 * for the two flags and the price - and a copied denylist cannot drift from this one.
 *
 * ⚠ THE RAISE STAYS, AND IS DEFENCE IN DEPTH RATHER THAN THE ONLY GUARD. This is the documented
 * path-traversal boundary and it must keep refusing for every in-process caller, including
 * `processProduct_uploadDefaultImage`, whose legacy `try` deliberately converts the refusal into a
 * recorded validation error instead. Exporting the function moves nothing and weakens nothing.
 *
 * NO B4 LEDGER SLOT IS CONSUMED. The visibility-widening budget covers LEGACY methods promoted from
 * `private`; this helper has no legacy antecedent at all - the block above says outright that "no
 * legacy parity is owed for this member" - so it is port-authored code, like the net-new
 * {@link MissingAssociationError}.
 *
 * @param imageFile the caller-supplied name, already known to be present and defined.
 * @throws Error when the value is not a single, traversal-free file name.
 */
export function assertPlainImageFileName(imageFile: string): void {
  const outcome = IMAGE_FILE_REFUSAL_OUTCOME;

  if (imageFile.length === 0 || imageFile.trim().length === 0) {
    throw new Error(
      'imageFile must name a file inside product/default/, but it was empty or whitespace only, ' +
        `which addresses the directory rather than a file in it. ${outcome}`,
    );
  }

  if (imageFile.length > IMAGE_FILE_NAME_MAX_LENGTH) {
    throw new Error(
      `imageFile must be at most ${String(IMAGE_FILE_NAME_MAX_LENGTH)} characters, but it was ` +
        `${String(imageFile.length)}. ${outcome}`,
    );
  }

  if (IMAGE_FILE_SEPARATOR.test(imageFile)) {
    throw new Error(
      'imageFile must be a single file name with no path separator, so that it cannot address ' +
        `anything outside product/default/. ${outcome}`,
    );
  }

  // Separators are already refused, so the whole value is the only segment there is.
  if (imageFile === '.' || imageFile === '..') {
    throw new Error(
      `imageFile must name a file, not a directory reference such as "." or "..". ${outcome}`,
    );
  }

  if (imageFile.includes('%')) {
    throw new Error(
      'imageFile must not contain a percent sign, which is how a separator or a dot segment ' +
        `would be smuggled past this check in encoded form. ${outcome}`,
    );
  }

  if (IMAGE_FILE_CONTROL_CHARACTER.test(imageFile)) {
    throw new Error(
      'imageFile must not contain a control character; a NUL in particular truncates a path in ' +
        'any C-based syscall, so the name that is read is not the name that resolves. ' +
        outcome,
    );
  }
}

/**
 * Converts a validated legacy `numeric` input into the domain monetary type.
 *
 * @throws CfmlNumberFormatError when the numeral is not finite or not renderable, which is the
 * honest outcome: the legacy would have failed at the same point, and substituting zero here would
 * set a price of zero.
 */
function toMoneyFromLegacyNumeric(value: string | number): Money {
  return Money.fromDecimalString(cfNumberToString(String(value)));
}

/**
 * The CFML predicate `!isNull(value) && len(value)`, expressed once as a single narrowing test.
 *
 * The same composition `src/services/brandService.ts` established, reused verbatim so the two
 * files read identically: `isNullish()` for `isNull()` and `cfTruthy(cfLen())` for `len()` in a
 * condition.
 *
 * By De Morgan, `!hasCfLength(x)` is exactly `isNull(x) || !len(x)`, which is the left disjunction
 * of the four-clause gate at [model/service/ProductService.cfc:L295].
 */
function hasCfLength(value: string | undefined): value is string {
  return !isNullish(value) && cfTruthy(cfLen(value));
}

/**
 * One TEXT key of a save payload, read case-insensitively, or `undefined` when it is absent or
 * holds something other than a string.
 *
 * CFML parity: the legacy has no equivalent step because a CFML struct value needs no narrowing -
 * `len(data.urlTitle)` would have coerced whatever was there.
 */
function readTextKey<TStruct extends object>(struct: TStruct, key: string): string | undefined {
  const value: unknown = structGet(struct, key);

  return typeof value === 'string' ? value : undefined;
}

/**
 * Writes a resolved `urlTitle` into a save payload the way a CFML struct assignment writes:
 * updating the key ALREADY in USE when one is present in any casing, and creating the canonical
 * key only when none is.
 *
 * JUDGMENT CALL: the same helper `src/services/brandService.ts` needed, for the same reason, and
 * shared in shape rather than in code because the two files may not import each other.
 */
function writeResolvedUrlTitle(data: { urlTitle?: string | undefined }, urlTitle: string): void {
  const storedKey = structFindKey(data, 'urlTitle');

  if (storedKey === undefined || storedKey === 'urlTitle') {
    data.urlTitle = urlTitle;
    return;
  }

  Reflect.set(data, storedKey, urlTitle);
}

/**
 * Copy every scalar column the payload carries onto the product, before anything reads it.
 *
 * This is the step whose absence produced two measured defects, so its contract is stated in terms
 * of them.
 *
 * Association population is not reproduced, and the entity records the same exclusion.
 *
 * @param product The entity being saved.
 * @param data The save payload.
 * @throws {@link ProductPopulateError} when `sortOrder` is present but is not an integer.
 */
function populateProduct(product: Product, data: ProductSaveInput): void {
  // `urlTitle` [model/entity/Product.cfc:L54] - nullable, so blank-after-trim clears it.
  if (structKeyExists(data, 'urlTitle')) {
    const urlTitle = structGet(data, 'urlTitle');

    if (typeof urlTitle === 'string') {
      product.setUrlTitle(urlTitle.trim());
    }
  }

  // `productName` [model/entity/Product.cfc:L55] - the one `notNull` COLUMN in the set, so a blank
  // value is stored as `''` rather than cleared, and then fails its own `required` rule.
  if (structKeyExists(data, 'productName')) {
    const productName = structGet(data, 'productName');

    if (typeof productName === 'string') {
      product.setProductName(productName.trim());
    }
  }
  if (structKeyExists(data, 'productCode')) {
    const productCode = structGet(data, 'productCode');

    if (typeof productCode === 'string') {
      product.setProductCode(productCode.trim());
    }
  }
  if (structKeyExists(data, 'productDescription')) {
    const productDescription = structGet(data, 'productDescription');

    if (typeof productDescription === 'string') {
      product.setProductDescription(productDescription.trim());
    }
  }

  // `activeFlag` [model/entity/Product.cfc:L53]. Already a resolved boolean on this payload - see
  // the member's own note for why no CFML boolean-ish coercion table is reproduced.
  if (structKeyExists(data, 'activeFlag')) {
    const activeFlag = structGet(data, 'activeFlag');

    if (typeof activeFlag === 'boolean') {
      product.setActiveFlag(activeFlag);
    }
  }
  if (structKeyExists(data, 'publishedFlag')) {
    const publishedFlag = structGet(data, 'publishedFlag');

    if (typeof publishedFlag === 'boolean') {
      product.setPublishedFlag(publishedFlag);
    }
  }

  // `sortOrder` [model/entity/Product.cfc:L59] - `ormtype="integer"`, so integrality is checked
  // rather than truncated. See the `@throws` tag.
  if (structKeyExists(data, 'sortOrder')) {
    const sortOrder = structGet(data, 'sortOrder');

    if (typeof sortOrder === 'number') {
      if (!Number.isSafeInteger(sortOrder)) {
        throw new ProductPopulateError('sortOrder', sortOrder);
      }

      product.setSortOrder(sortOrder);
    }
  }
  if (structKeyExists(data, 'remoteID')) {
    const remoteID = structGet(data, 'remoteID');

    if (typeof remoteID === 'string') {
      product.setRemoteID(remoteID.trim());
    }
  }
}

/**
 * Copy every scalar column the payload carries onto the product type, before anything reads it.
 *
 * The four column semantics are the ones `populateProduct` documents in full - present-keys-only,
 * case-insensitive key match, trimmed simple values.
 *
 * @param productType The entity being saved.
 * @param data The save payload.
 */
function populateProductType(productType: ProductType, data: ProductTypeSaveInput): void {
  if (structKeyExists(data, 'urlTitle')) {
    const urlTitle = structGet(data, 'urlTitle');

    if (typeof urlTitle === 'string') {
      productType.setUrlTitle(urlTitle.trim());
    }
  }
  if (structKeyExists(data, 'productTypeName')) {
    const productTypeName = structGet(data, 'productTypeName');

    if (typeof productTypeName === 'string') {
      productType.setProductTypeName(productTypeName.trim());
    }
  }
  if (structKeyExists(data, 'productTypeDescription')) {
    const productTypeDescription = structGet(data, 'productTypeDescription');

    if (typeof productTypeDescription === 'string') {
      productType.setProductTypeDescription(productTypeDescription.trim());
    }
  }
  if (structKeyExists(data, 'systemCode')) {
    const systemCode = structGet(data, 'systemCode');

    if (typeof systemCode === 'string') {
      productType.setSystemCode(systemCode.trim());
    }
  }
  if (structKeyExists(data, 'activeFlag')) {
    const activeFlag = structGet(data, 'activeFlag');

    if (typeof activeFlag === 'boolean') {
      productType.setActiveFlag(activeFlag);
    }
  }
  if (structKeyExists(data, 'publishedFlag')) {
    const publishedFlag = structGet(data, 'publishedFlag');

    if (typeof publishedFlag === 'boolean') {
      productType.setPublishedFlag(publishedFlag);
    }
  }
}

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity [model/service/ProductService.cfc:L71-L79]: a CFML struct has no prototype chain and
 * no reserved keys, so an option group named `__proto__` occupied an ordinary key and reached the
 * returned array.
 *
 * @param target the record being built.
 * @param key the resolved key.
 * @param value the value to store.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Reproduces `arguments.product.validate( context="save" )`
 * [model/service/ProductService.cfc:L273] against the SAVE-CONTEXT rules declared in
 * `model/validation/Product.json`, and against nothing else.
 *
 * LEGACY-NOTE `model/validation/Product.json`: locator correction.
 *
 * @param product the entity being saved, read for ALL FIVE rules.
 * @returns one entry per failed rule, empty when the product passes.
 */
function collectProductSaveContextErrors(
  product: Product,
  suppliedPrice: Money | undefined,
): { readonly propertyIdentifier: string; readonly errorMessage: string }[] {
  const errors: { readonly propertyIdentifier: string; readonly errorMessage: string }[] = [];

  // `"price": [{"contexts":"save","required":true,"dataType":"numeric"}]`. The
  // entity answers `Money | undefined`, and a `Money` is numeric by construction -
  // it cannot hold NaN, an infinity or a non-numeral - so the `dataType` half of
  // the rule is discharged by the type and only presence remains to be tested.
  //
  // THE PAYLOAD IS PROBED FIRST AND THE ENTITY SECOND, WHICH IS `getPrice()`'s OWN ORDER, AND
  // OMITTING THE FIRST PROBE MADE THIS RULE UNSATISFIABLE. `price` is a DECLARED NON-PERSISTENT
  // PROPERTY [model/entity/Product.cfc:L118]; `populate` writes it like any other simple column
  // [org/Hibachi/HibachiTransient.cfc:L192-L204]; and `getPrice()` tests
  // `structKeyExists(variables, "price")` BEFORE it reaches the default SKU
  // [model/entity/Product.cfc:L561-L568]. So in the legacy, a payload that carried `price` satisfied
  // this rule ON ITS OWN, whether or not the product had a default SKU to borrow from.
  //
  // This revision reads the entity ALONE, and runtime acceptance testing (finding F-07) measured what
  // that cost: for a product with no default SKU, `saveProduct` refused with
  // `{"path":"price","message":"price is required"}` and there was no request that could satisfy it,
  // because the transport tier published no `price` member to supply. The operation was published,
  // routed and unsatisfiable. `src/handlers/catalogQueryHandler.ts` now publishes the member and the
  // rule now reads it here.
  //
  // WHY A PARAMETER RATHER THAN A WRITE ONTO THE ENTITY. `src/domain/entities/product.ts`
  // deliberately publishes NO `setPrice` - the slot is a constructor-time hydration member and its own
  // unit suite asserts the absence, because the legacy accessor set delegates every OTHER price
  // reader to the default SKU and a setter would invite writing through them. `populateProduct` writes
  // the eight SCALAR COLUMNS and this is not one. Threading the value to the ONE rule that reads it
  // reproduces the legacy probe exactly, adds no entity member and leaves the payload's own
  // `price` free to travel on to `createSkus` as it always did
  // [model/service/SkuService.cfc:L93] - see the `skuCreation.createSkus` call in `saveProduct`.
  if (suppliedPrice === undefined && product.getPrice() === undefined) {
    errors.push({ propertyIdentifier: 'price', errorMessage: 'price is required' });
  }
  if (!hasCfLength(product.getProductName())) {
    errors.push({ propertyIdentifier: 'productName', errorMessage: 'productName is required' });
  }

  // `"productCode": [{"contexts":"save","required":true,"unique":true, "regex":"^[a-zA-Z0-9-_.|:~^]+$"}]`.
  const productCode = product.getProductCode();

  if (!hasCfLength(productCode)) {
    errors.push({ propertyIdentifier: 'productCode', errorMessage: 'productCode is required' });
  } else if (!ENTITY_CODE_PATTERN.test(productCode)) {
    errors.push({
      propertyIdentifier: 'productCode',
      errorMessage: 'productCode contains an unsupported character',
    });
  }
  if (product.getProductType() === undefined) {
    errors.push({ propertyIdentifier: 'productType', errorMessage: 'productType is required' });
  }
  if (!hasCfLength(product.getUrlTitle())) {
    errors.push({ propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' });
  }

  return errors;
}

/**
 * Reproduces the `validate(context="save")` that `super.save` performs internally
 * [org/Hibachi/HibachiService.cfc:L150], against the SAVE-CONTEXT rules declared in
 * `model/validation/ProductType.json`.
 *
 * @param productType the entity being saved, read for both rules.
 * @returns one entry per failed rule, empty when the product type passes.
 */
function collectProductTypeSaveContextErrors(
  productType: ProductType,
): { readonly propertyIdentifier: string; readonly errorMessage: string }[] {
  const errors: { readonly propertyIdentifier: string; readonly errorMessage: string }[] = [];
  if (!hasCfLength(productType.getProductTypeName())) {
    errors.push({
      propertyIdentifier: 'productTypeName',
      errorMessage: 'productTypeName is required',
    });
  }
  if (!hasCfLength(productType.getUrlTitle())) {
    errors.push({ propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' });
  }

  return errors;
}

/**
 * One unresolvable member of a caller's request, named as a member and never as a value.
 *
 * Mirrors `OrderViewDocumentFieldIssue` in `src/handlers/bootstrap.ts` deliberately, member for
 * member, so that a caller reading a refusal from THIS capability meets the same two-part shape it
 * meets everywhere else in this subtree. It is declared here rather than imported because
 * `MappedFieldIssue` lives in `src/handlers/errorMapper.ts` and a service must not import from the
 * handlers tier.
 */
export interface UnresolvedReferenceFieldIssue {
  /** Dotted path to the offending member of the request payload. SERVER-AUTHORED, always. */
  readonly path: string;
  /** What the member had to satisfy and did not. NEVER the value it held. */
  readonly message: string;
}

/**
 * The single constraint sentence published for an unresolvable reference.
 *
 * Fixed and server-authored. It states the CONSTRAINT - a reference must name a row that exists -
 * and states nothing about which rows do or do not exist beyond the answer the caller already has
 * by asking. No identifier, no row count, no statement and no table name.
 */
const UNRESOLVED_REFERENCE_MESSAGE = 'must name an existing record';

/**
 * A member of the CALLER'S OWN PAYLOAD names a row that does not exist.
 *
 * WHY THIS TYPE EXISTS, AND WHAT IT COST NOT TO HAVE IT. `requireAssociation` threw a bare
 * `Error`, so `src/handlers/errorMapper.ts` - whose recognized set is deliberately CLOSED - could only
 * reach its `unrecognized` arm and answer HTTP 500 with no `fields`. Runtime acceptance testing
 * (finding F-12) sent well-formed payloads naming a nonexistent `optionGroup` and a nonexistent
 * `option` and received exactly that: the caller was told THIS SERVICE had failed when the CALLER had,
 * and an operator's 5xx alarm counted a typo as an outage.
 *
 * THE MECHANISM IS THE ONE ALREADY SANCTIONED FOR THIS EXACT PROBLEM, not a new one.
 * `OrderViewDocumentDataError` in `src/handlers/bootstrap.ts` is the precedent: the throwing module
 * EXPORTS the class, the primary adapter narrows it with `instanceof` and answers
 * `invalidRequestResponse('unusableRequestInput', ..., fields)`, and `errorMapper` is never asked to
 * recognize anything new. No error module is created, no file is added to `src/lib/` or
 * `src/handlers/`, and no back-edge from a service to a handler is introduced - all four of which
 * `src/handlers/errorMapper.ts` names explicitly as things not to do.
 *
 * THE DISCLOSURE ARGUMENT, SETTLED THE SAME WAY IT WAS SETTLED THERE. Nothing published names an
 * identifier: the refusal is a MEMBER PATH plus {@link UNRESOLVED_REFERENCE_MESSAGE}. The route is
 * authenticated and requires an ADMINISTRATIVE principal before any database work happens, and the
 * catalogue reads this same capability publishes already answer existence questions to that same
 * principal - so the marginal disclosure of "the member you sent did not resolve" is nil, while the
 * cost of mislabelling it is a caller who cannot tell a typo from an outage.
 *
 * ONLY A CLIENT-SUPPLIED REFERENCE RAISES THIS. `requireAssociation` throws it when - and only
 * when - a `field` is named, which the four call sites decide individually. A dereference of SERVER
 * STATE - an existing SKU's missing option group, a product's missing default SKU - is NOT a request
 * the caller can fix, so those sites name no field, keep throwing a plain `Error`, and keep landing on
 * the generic 500 arm where a service-shaped failure belongs. Mapping those to 400 would tell a caller
 * to correct a payload that is already correct.
 *
 * The message on the `Error` itself is FIXED and names no member, because the handler owns the
 * sentence a caller sees and this text only ever reaches a log.
 */
export class MissingAssociationError extends Error {
  /** The member paths that could not be resolved, and the constraint each failed. */
  public readonly fields: readonly UnresolvedReferenceFieldIssue[];

  public constructor(fields: readonly UnresolvedReferenceFieldIssue[]) {
    super(
      'The request names catalogue data this operation cannot resolve, so nothing was mutated ' +
        'and nothing was written.',
    );
    this.name = 'MissingAssociationError';
    this.fields = fields;
  }
}

/**
 * Narrows an association or lookup result that the legacy body DEREFERENCES WITHOUT
 * A NULL CHECK, failing in the same place and for the same reason when it is absent.
 *
 * JUDGMENT CALL: several legacy statements chain straight through a nullable result -
 * `getOptionGroup(id).getOptions()` [model/service/ProductService.cfc:L115],
 * `getDefaultSku().getPrice()` [model/service/ProductService.cfc:L133],
 * `getOptionGroup().getOptionGroupID()` [model/service/ProductService.cfc:L144].
 * Under CFML each of those raises at the dereference when the left side is null. The
 * ported accessors answer `T | undefined`, and there are exactly three ways to
 * handle that: assert with `!`, which is banned in `src/**` and would hide the case
 * entirely; substitute a default, which for `getPrice()` would mean selling product
 * at whatever the default was; or FAIL AT THE SAME POINT THE LEGACY FAILS. This
 * helper is the third, applied uniformly so that every such site reads identically
 * and carries its own locator in the message.
 *
 * It is not new behaviour and it is not a guard the legacy lacked: it is the legacy's
 * own failure, given a message. Every call site is a place the CFML would have thrown.
 *
 * IT NOW DISTINGUISHES A CALLER'S MISTAKE FROM THE SERVICE'S OWN, AND THE `field` PARAMETER IS
 * THE WHOLE OF THAT DISTINCTION. Every call site still fails at the same point for the same reason;
 * what a site now also declares is WHOSE input made the value absent. A site that resolves a
 * reference the CALLER SENT names the payload member it came from, and this raises
 * {@link MissingAssociationError} so the primary adapter can answer a 400 naming that member. A site
 * that dereferences SERVER STATE names nothing and keeps raising a plain `Error`, which is what keeps
 * it on the generic 500 arm where it belongs. See {@link MissingAssociationError} for what finding
 * F-12 measured when neither was distinguished.
 *
 * THE THROWN MESSAGE NO LONGER CARRIES THE CALLER'S VALUE, and that is a security correction
 * rather than a tidy-up. `description` was interpolated with the submitted identifier - `Option group
 * 'og-nonexistent'` - and a thrown message is read by `src/lib/logger.ts` and, on one arm, published.
 * `src/handlers/errorMapper.ts` states the invariant plainly: a value the CALLER chose is not
 * admissible in a published path or message. So `description` is still interpolated for the
 * FIELD-LESS server-state sites, whose descriptions are literals, and the client-supplied sites hand
 * their identifier NOWHERE - the diagnosis a caller and an operator both get is the member name plus
 * the correlation identifier, which is what every schema rejection in this subtree already gives them.
 *
 * @param value the possibly-absent association.
 * @param description what was being dereferenced, for the message. SERVER-AUTHORED: never
 *   interpolate a submitted value into it.
 * @param locator the `model/**` line that dereferences it without checking.
 * @param field the request-payload member this value was resolved FROM, when it came from the
 *   caller. Omit it for server state. Server-authored - a literal at the call site, never composed.
 * @throws MissingAssociationError when `value` is absent and `field` was named.
 * @throws Error when `value` is absent and no `field` was named.
 */
function requireAssociation<TValue>(
  value: TValue | undefined,
  description: string,
  locator: string,
  field?: string,
): TValue {
  if (value !== undefined) {
    return value;
  }

  if (field !== undefined) {
    throw new MissingAssociationError([{ path: field, message: UNRESOLVED_REFERENCE_MESSAGE }]);
  }

  throw new Error(
    `${description} could not be resolved. The legacy body at ${locator} dereferences ` +
      `it without a null check and fails at the same point when it is absent.`,
  );
}

/**
 * Ported from
 * `private any function buildSkuCombinations(Array storage, numeric position, any data, String currentOption)`
 * [model/service/ProductService.cfc:L82-L97].
 *
 * LEGACY-NOTE [model/service/ProductService.cfc:L84]: `var i = 1;` is dead - the value `1` is
 * never read before the `for(i=1;...)` at L87 overwrites it. Recorded as a secondary-register
 * item; a `for...of` loop leaves nothing for it to initialise.
 */
function buildSkuCombinations(
  storage: string[],
  position: number,
  data: CfStruct<readonly SelectOption[]>,
  currentOption: string,
): string[] {
  const keys = structKeyList(data).join(',');

  // CFML parity [model/service/ProductService.cfc:L86]: `if(listlen(keys))` is a bare numeric
  // truthiness test on a count, written here as the explicit comparison it means.
  if (listLen(keys) > 0) {
    // `listGetAt` is 1-based and THROWS for a position past the end, exactly as CFML's does.
    const groupKey = listGetAt(keys, position);

    // The `?? []` arm is UNREACHABLE and is present only to satisfy `noUncheckedIndexedAccess`
    // without an assertion: `groupKey` was drawn from this very struct's own key list, so the
    // lookup always resolves.
    const groupOptions = data[groupKey] ?? [];
    const isFinalKey = position === listLen(keys);

    for (const option of groupOptions) {
      const nextOption = `${currentOption}|${option.value}`;

      if (isFinalKey) {
        storage.push(nextOption);
      } else {
        storage = buildSkuCombinations(storage, position + 1, data, nextOption);
      }
    }
  }

  return storage;
}
void buildSkuCombinations;

/**
 * The ported surface of `model/service/ProductService.cfc`.
 */
export class ProductService {
  /**
   * Wires the nine collaborators the legacy component reached through DI/1 properties
   * [model/service/ProductService.cfc:L52-L60], plus one configured bound.
   *
   * @param productRepository Replaces `productDAO`.
   * @param skuRepository Replaces `skuDAO`.
   * @param productTypeRepository Persistence seam for `saveProductType`.
   * @param urlTitleGenerator Replaces `dataService`; its only use here is URL-title generation.
   * @param imageStore Filesystem seam for `processProduct_deleteDefaultImage`.
   * @param subscriptionTermProvider Stub port for the out-of-scope subscription path.
   * @param skuCreation Replaces the `skuService` reach for SKU creation.
   * @param optionLoading Replaces the `optionService` reach for option loading.
   * @param skuBatchWrite Batch-write seam for `processProduct_updateSkus`.
   * @param maximumSkuUpdateBatchSize How many SKUs one `processProduct_updateSkus` call may
   * reprice in a single atomic write, per AAP 0.6.5.
   */
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly skuRepository: SkuRepository,
    private readonly productTypeRepository: ProductTypeRepository,
    private readonly urlTitleGenerator: UrlTitleGenerator,
    private readonly imageStore: ImageStore,
    private readonly subscriptionTermProvider: SubscriptionTermProvider,
    private readonly skuCreation: SkuCreationCollaborator,
    private readonly optionLoading: OptionLoadingCollaborator,
    private readonly skuBatchWrite: SkuBatchWriteCollaborator,
    private readonly maximumSkuUpdateBatchSize: number = DEFAULT_MAXIMUM_SKU_UPDATE_BATCH_SIZE,
  ) {
    // The bound is validated at construction rather than at each use, so a misconfigured
    // composition root fails when it is wired rather than on the first request that happens to
    // reprice a product.
    if (!Number.isSafeInteger(maximumSkuUpdateBatchSize) || maximumSkuUpdateBatchSize < 1) {
      throw new Error(
        `ProductService: maximumSkuUpdateBatchSize must be a positive safe integer, received ` +
          `${String(maximumSkuUpdateBatchSize)}. It bounds how many SKUs one ` +
          'processProduct_updateSkus call may reprice in a single atomic write, per AAP 0.6.5.',
      );
    }
  }

  // LEGACY-NOTE [model/service/ProductService.cfc:L54, L57]: `productTypeDAO` and `contentService`
  // are declared by DI/1 convention and referenced nowhere in the component, so neither is a
  // constructor parameter here. There is no `optionDAO` property either
  // [model/service/ProductService.cfc:L52-L60], so no option repository is injected - the option
  // module is a type-only dependency of this file.

  // CFML parity [model/service/ProductService.cfc:L63, L100]: the legacy component organises
  // itself with section banners, correctly paired here.

  /**
   * Ported from
   * `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`
   * [model/service/ProductService.cfc:L65-L68].
   *
   * @param fileURL Location of the import file.
   * @param textQualifier The legacy `""` default is preserved exactly, on both sides of the
   * boundary: this signature declares it and so does [model/dao/ProductDAO.cfc:L73].
   */
  async loadDataFromFile(fileURL: string, textQualifier = ''): Promise<void> {
    // CFML parity [model/service/ProductService.cfc:L67]: the legacy delegates POSITIONALLY with
    // exactly two arguments, in declaration order, and the port member mirrors that arity and
    // order. Nothing is added to the call and nothing is reordered.
    await this.productRepository.loadDataFromFile(fileURL, textQualifier);
  }

  /**
   * Ported from `public any function getFormattedOptionGroups(required any product)`
   * [model/service/ProductService.cfc:L70-L80].
   *
   * SYNCHRONOUS - the only synchronous method on this class.
   *
   * @param product The product whose option groups are formatted.
   * @returns One entry per DISTINCT option-group name, in traversal order.
   */
  getFormattedOptionGroups(product: Product): FormattedOptionGroup[] {
    // The mutable accumulator stands in for the CFML struct at L71. It is FUNCTION-LOCAL: no
    // module-level or instance-level cache exists in this file, so nothing survives the call.
    const availableOptions: Record<string, readonly SelectOption[]> = {};

    const productObjectGroups = product.getOptionGroups();

    for (const optionGroup of productObjectGroups) {
      // The ported accessor answers `string | undefined` because the column is nullable, while a
      // CFML struct key is always a string.
      const optionGroupName = optionGroup.getOptionGroupName() ?? '';

      const options = this.optionLoading.getOptionsForSelect(
        product.getOptionsByOptionGroup(optionGroup.getOptionGroupID()),
      );

      // The case-insensitive write: when a key differing only in case is already present, UPDATE
      // it rather than adding a second entry. That is what makes the last-write-wins collision
      // above behave as CFML's did.
      const storedKey = structFindKey(availableOptions, optionGroupName);

      // The write itself goes through `putOwnStructKey`: the resolved key is a persisted column
      // value, and a plain assignment for `__proto__` would store nothing while recording every
      // sibling group.
      putOwnStructKey(availableOptions, storedKey ?? optionGroupName, options);
    }

    return Object.entries(availableOptions).map(([optionGroupName, options]) => ({
      optionGroupName,
      options,
    }));
  }

  // LEGACY-NOTE [model/service/ProductService.cfc:L108]: the closing banner reads
  // `START: DAO Passthrough` where `END` was plainly intended - the section contains one method
  // and is bracketed by two identical opening banners.

  /**
   * Ported from
   * `public any function getProductSkusBySelectedOptions(required string selectedOptions, required string productID)`
   * [model/service/ProductService.cfc:L104-L106].
   *
   * @param selectedOptions Comma-delimited option identifiers.
   * @param productID The product to restrict to.
   * @returns The SKUs matching every selected option, in repository order.
   */
  async getProductSkusBySelectedOptions(
    selectedOptions: string,
    productID: string,
  ): Promise<Sku[]> {
    return this.skuRepository.getSkusBySelectedOptions(selectedOptions, productID);
  }

  // Eight methods, and the section is the only one in the component where in-scope and
  // out-of-scope work sit side by side.

  /**
   * Ported from
   * `public any function processProduct_addOptionGroup(required any product, required any processObject)`
   * [model/service/ProductService.cfc:L113-L126].
   *
   * @param product The product being modified.
   * @param input Carries the option-group identifier to add.
   * @returns The same product instance that was passed in, matching
   * [model/service/ProductService.cfc:L125].
   */
  async processProduct_addOptionGroup(
    product: Product,
    input: ProductAddOptionGroupInput,
  ): Promise<Product> {
    const skus = product.getSkus();
    const optionGroup = requireAssociation(
      await this.optionLoading.getOptionGroup(input.optionGroup),
      'Option group named by the request',
      'model/service/ProductService.cfc:L115',
      'optionGroup',
    );

    const options = optionGroup.getOptions();

    // CFML parity [model/service/ProductService.cfc:L117]: `if(arrayLen(options))` is a bare
    // numeric truthiness test on a count, written here as the explicit comparison it means.
    if (options.length > 0) {
      // CFML's `options[1]` is this port's `options[0]`. Under `noUncheckedIndexedAccess` that
      // read answers `Option | undefined`, so it is BOUND and NARROWED rather than asserted - `!`
      // is banned in `src/**`.
      const firstOption = options[0];

      if (firstOption !== undefined) {
        // LEGACY-DEFECT [model/service/ProductService.cfc:L119]: every existing SKU is given
        // options[1] - the first option of the newly added group - rather than an option matched
        // to that SKU.
        // Preserved deliberately; do not fix without a product decision.
        for (const sku of skus) {
          sku.addOption(firstOption);
        }
      }
    }

    // CFML parity [model/service/ProductService.cfc:L123]: the legacy line is
    // `this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames')` - the
    // framework's generic convention dispatcher.
    product = await this.processProduct_updateDefaultImageFileNames(product);

    return product;
  }

  /**
   * Ported from
   * `public any function processProduct_addOption(required any product, required any processObject)`
   * [model/service/ProductService.cfc:L128-L155].
   *
   * @param product The product being modified.
   * @param input Carries the option identifier to add.
   * @returns The same product instance that was passed in, matching
   * [model/service/ProductService.cfc:L154].
   */
  async processProduct_addOption(product: Product, input: ProductAddOptionInput): Promise<Product> {
    // L130, the same framework generic loader as L115.
    // THE FOURTH ARGUMENT NAMES THE PAYLOAD MEMBER - see the sibling site in
    // `processProduct_addOptionGroup` for the full reasoning. Client-supplied, so a miss is the
    // caller's to fix.
    const newOption = requireAssociation(
      await this.optionLoading.getOption(input.option),
      'Option named by the request',
      'model/service/ProductService.cfc:L130',
      'option',
    );
    const defaultSku = requireAssociation(
      product.getDefaultSku(),
      'Default SKU',
      'model/service/ProductService.cfc:L133',
    );

    // CFML parity [model/service/ProductService.cfc:L131-L134]: the legacy assembles a struct with
    // `options` and `price`.
    const newOptionsData: ProductSaveInput = {
      options: newOption.getOptionID(),
      price: defaultSku.getPrice(),
    };

    // `isNull(...)` is a genuine null test, so it routes through the null helper rather than being
    // modelled as a `structKeyExists` probe or a bare falsiness test.
    if (!isNullish(defaultSku.getListPrice())) {
      newOptionsData.listPrice = defaultSku.getListPrice();
    }

    // L144 dereferences `newOption.getOptionGroup().getOptionGroupID()` with no null check, once
    // per inner iteration.
    const newOptionGroup = requireAssociation(
      newOption.getOptionGroup(),
      'Option group of the option named by the request',
      'model/service/ProductService.cfc:L144',
    );

    // CFML parity [model/service/ProductService.cfc:L140, L142]: both loop conditions RE-EVALUATE
    // the live association accessors on every iteration - `arrayLen(arguments.product.getSkus())`
    // and `arrayLen(arguments.product.getSkus()[s].getOptions())`.
    for (let s = 0; s < product.getSkus().length; s += 1) {
      const existingSku = product.getSkus()[s];

      // Narrowing required by `noUncheckedIndexedAccess`.
      if (existingSku === undefined) {
        continue;
      }

      for (let o = 0; o < existingSku.getOptions().length; o += 1) {
        const existingOption = existingSku.getOptions()[o];

        if (existingOption === undefined) {
          continue;
        }

        const existingOptionGroup = requireAssociation(
          existingOption.getOptionGroup(),
          `Option group of option '${existingOption.getOptionID()}'`,
          'model/service/ProductService.cfc:L144',
        );

        const currentOptions = newOptionsData.options ?? '';

        // Two translations on one line, both mandatory.
        //
        // CFML parity [model/service/ProductService.cfc:L144]: the option-group comparison uses
        // `!=`, and CFML string comparison is CASE-INSENSITIVE.
        //
        // The membership test is a negated `listFindNoCase`, and `listFindNoCase` returns a
        // 1-BASED index or.
        if (
          !cfEquals(existingOptionGroup.getOptionGroupID(), newOptionGroup.getOptionGroupID()) &&
          listFindNoCase(currentOptions, existingOption.getOptionID()) === 0
        ) {
          newOptionsData.options = listAppend(currentOptions, existingOption.getOptionID());
        }
      }
    }

    // LEGACY-NOTE [model/service/ProductService.cfc:L150]: `createSkus` is declared
    // `returntype="boolean"` at [model/service/SkuService.cfc:L58], and the return value is
    // discarded here.
    await this.skuCreation.createSkus(product, newOptionsData);
    product = await this.processProduct_updateDefaultImageFileNames(product);

    return product;
  }

  /**
   * @param product Answered unchanged, matching [model/service/ProductService.cfc:L170].
   * @param input Accepted for signature parity; not read, because every statement that would read
   * it operates on the unmodelled review.
   * @returns The same product instance that was passed in, matching
   * [model/service/ProductService.cfc:L170].
   */
  async processProduct_addProductReview(
    product: Product,
    // Declared for interface parity with [model/service/ProductService.cfc:L157]; every statement
    // that reads the process object operates on the unmodelled review, so there is nothing here to
    // read.
    input: ProductAddProductReviewInput,
  ): Promise<Product> {
    // The method is `async` for signature parity with its three siblings and because the
    // dispatcher awaits every process method; its body reaches no collaborator.
    await Promise.resolve();

    // THE POSITIVE SIGNAL. Written on the SAME two channels
    // `processProduct_uploadDefaultImage` writes, in the same order, so the two methods report an
    // unperformed process identically. `'processObjects'` is the framework's own error NAME and the
    // context is the value it injects under it - see the constants for why both are data contracts.
    product.addError('newProductReview', UNIMPLEMENTED_PROCESS_RB_KEY);
    product.addError('processObjects', ADD_PRODUCT_REVIEW_PROCESS_CONTEXT);

    return product;
  }

  /**
   * LEGACY-NOTE [model/service/ProductService.cfc:L176]: the branch cannot build its sku.
   *
   * @param product Answered after the [model/service/ProductService.cfc:L193] dispatcher call,
   * matching [model/service/ProductService.cfc:L195].
   * @param input Its `subscriptionTermID` IS read, reproducing
   * [model/service/ProductService.cfc:L175].
   * @returns The product, matching [model/service/ProductService.cfc:L195].
   */
  async processProduct_addSubscriptionTerm(
    product: Product,
    input: ProductAddSubscriptionTermInput,
  ): Promise<Product> {
    // CFML parity [model/service/ProductService.cfc:L175]: the one statement in this branch that
    // has a ported counterpart is reproduced, through the stub subscription port.
    await this.subscriptionTermProvider.getSubscriptionTerm(input.subscriptionTermID);

    // LEGACY-DEFECT [model/service/ProductService.cfc:L181]: the guard reads a `listPrice` the
    // process object never declares, so the branch behind it can never be taken. It is registered
    // rather than reproduced: no `setListPrice` is written and no `listPrice` member is invented on
    // the input to make the guard evaluable, because the AAP keeps this path out of scope.
    // Preserved deliberately; do not fix without a product decision.

    // CFML parity [model/service/ProductService.cfc:L193]: the third of the four dispatcher sites,
    // reached on every invocation that the [model/service/ProductService.cfc:L180] guard does not
    // divert - which, through this surface, is every invocation.
    product = await this.processProduct_updateDefaultImageFileNames(product);

    return product;
  }

  /**
   * Ported from
   * `public any function processProduct_deleteDefaultImage(required any product, required struct data)`
   * [model/service/ProductService.cfc:L198-L206].
   *
   * @param product Accepted and returned unchanged, matching
   * [model/service/ProductService.cfc:L205].
   * @param data Carries the optional `imageFile` name, gated at
   * [model/service/ProductService.cfc:L199].
   * @returns The same product instance that was passed in.
   */
  async processProduct_deleteDefaultImage(
    product: Product,
    data: DeleteDefaultImageInput,
  ): Promise<Product> {
    // CFML parity [model/service/ProductService.cfc:L199]: the key is probed through the
    // CASE-INSENSITIVE accessor, because CFML struct keys fold case and TypeScript keys do not, so
    // a caller sending `ImageFile` behaves as it did under CFML.
    if (structKeyExists(data, 'imageFile')) {
      const imageFile = structGet(data, 'imageFile');

      // LEGACY-DEFECT [model/service/ProductService.cfc:L200-L201]: the path interpolates
      // `#imageFile#` unscoped, and no local or argument of that name exists - only
      // `arguments.data.imageFile` - so the guard on the preceding line admits execution into a
      // statement that cannot resolve its own reference.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Narrowing required by `noUncheckedIndexedAccess` and by `exactOptionalPropertyTypes`,
      // which allows an explicitly-`undefined` optional property.
      if (imageFile !== undefined) {
        // SECURITY BOUNDARY - path traversal. Checked before the path is composed, so no traversing
        // string is ever built or handed across the port.
        //
        // JUDGMENT CALL: this is a security refusal on an out-of-scope stub path
        // [model/service/ProductService.cfc:L241-L250], not one of the three deliberate divergences
        // AAP 0.6.7 permits, and it spends none of that budget. The legacy composed its destination
        // from the same caller-supplied value with no check at all; the port refuses anything that
        // is not a single segment inside the image directory, and no name the legacy image-name
        // generator can produce trips the check.
        assertPlainImageFileName(imageFile);

        await this.imageStore.deleteImageFile(`product/default/${imageFile}`);
      }
    }

    return product;
  }

  /**
   * Ported from
   * `public any function processProduct_updateDefaultImageFileNames( required any product )`
   * [model/service/ProductService.cfc:L208-L214].
   *
   * The image-group filter is applied here, not at the port.
   *
   * It still must not THROW, and the constraint is now load-bearing rather than incidental.
   *
   * THIS BODY WAS ONCE A DOCUMENTED NO-OP, AND THE REASONING IS QUOTED RATHER THAN
   * DELETED. It read: "The specification asserts that `generateImageFileName()` is a live
   * public entity method with an in-scope caller. Against the SHIPPED ENTITY that is false:
   * `src/domain/entities/sku.ts` publishes NEITHER `generateImageFileName()` NOR
   * `setImageFile()` ... generating the name requires `productImageOptionCodeDelimiter` and
   * `productImageDefaultExtension`, and both are outside the closed seven-key `SettingKey`
   * union. THE SOURCE WINS. The entity set is closed at eighteen files and this service adds
   * no member to any of them, so there is nothing here to call and nothing to assign." It
   * closed with: "Recording the gap is the only honest option left."
   *
   * ONE CORRECTION INSIDE THAT QUOTE. The `SettingKey` union holds FOUR keys -
   * `globalURLKeyProduct` [model/service/SettingService.cfc:L178], `globalURLKeyProductType`
   * [model/service/SettingService.cfc:L179], `skuCurrency` [model/service/SettingService.cfc:L221]
   * and `skuEligibleCurrencies` [model/service/SettingService.cfc:L222] - while
   * `productImageDefaultExtension` [model/service/SettingService.cfc:L191],
   * `productImageOptionCodeDelimiter` [model/service/SettingService.cfc:L192] and
   * `productTitleString` [model/service/SettingService.cfc:L193] are resolved once in
   * `src/handlers/bootstrap.ts` and handed inward as plain strings. The foot of
   * `src/domain/ports/settingsProvider.ts` carries the authoritative record of that narrowing.
   *
   * THAT DOES NOT MOVE THE CONCLUSION, because what the quote got wrong was its PREMISE and not its
   * count: the settings are resolvable, once, by the composition root, whether they sit on the port
   * or beside it. The composition belongs to the image seam because that is where image-file naming
   * is CONSUMED, not because a value was unreachable.
   *
   * Every observation in that was accurate. The conclusion was not the only option left, and
   * it had a cost the note did not weigh: a method named
   * `processProduct_updateDefaultImageFileNames`, awaited from four dispatch sites, updated no
   * file name. The two halves of [model/service/ProductService.cfc:L210] were treated as one indivisible problem when they are
   * two separable ones:
   *
   *   * `sku.setImageFile(...)` is the generated setter for a persisted column,
   *     `property name="imageFile" ormtype="string" length="50"`
   *     [model/entity/Sku.cfc:L58]. Publishing it needs no setting and no new signature - it
   *     is an accessor the entity always owned, withheld only because its one caller was
   *     unreachable. It is now published, cited to that caller.
   *   * `sku.generateImageFileName()` does not live on the entity, though not for the reason
   *     quoted: it moves to `ImageStore.generateSkuImageFileName(descriptor)`, the seam that
   *     already owns the image subsystem, which is where the two settings are CONSUMED. The
   *     port specifies the composition in full so no implementation can invent a naming
   *     convention.
   *
   * So this method now does what [model/service/ProductService.cfc:L209-L211] does: it walks every SKU on the product, composes
   * that SKU's name, and assigns it. NO ENTITY MEMBER WAS ADDED TO SATISFY THIS beyond the
   * withheld setter, the entity set is still closed at eighteen files, and the `SettingKey`
   * union is untouched.
   *
   * THE IMAGE-GROUP FILTER IS APPLIED HERE, NOT AT THE PORT. [model/service/ProductService.cfc:L134]
   * tests `option.getOptionGroup().getImageGroupFlag()`, which reads an ASSOCIATION. Only a
   * caller holding the entity graph can evaluate it, so the traversal and the test stay on
   * this side and the port receives the codes that survived. An option whose group is absent
   * contributes nothing: the legacy `getOptionGroup()` returning null would raise on the
   * following method call, and a SKU whose options were loaded without their groups is a fetch
   * shape this service does not control, so it is skipped rather than turned into a raise.
   *
   * THE RENAMING HALF STILL CANNOT THROW, AND THAT IS STILL LOAD-BEARING. Four methods on this
   * class dispatch to this one - `processProduct_addOptionGroup` [model/service/ProductService.cfc:L123], `processProduct_addOption`
   * [model/service/ProductService.cfc:L152], the out-of-scope `processProduct_addSubscriptionTerm` stub [model/service/ProductService.cfc:L193] and the new-product path
   * of `saveProduct` [model/service/ProductService.cfc:L282] - so a raise from the traversal would take all four down. Nothing in the traversal can raise: absent
   * groups are skipped, the port composes from values that admit `undefined`, and no assertion, cast
   * or lookup failure is possible. What CAN now raise is the write below and the bound in front of it,
   * and both are deliberate; see the next paragraph for why, and note that the bound is checked before
   * the first assignment so a refusal leaves the product exactly as it was found.
   *
   * IT NOW PERSISTS, AND THE NOTE THAT SAID IT MUST NOT WAS FACTUALLY WRONG. The removed
   * paragraph read: "⚠ IT ASSIGNS AND DOES NOT PERSIST, which is the legacy's own behaviour and not an
   * omission. [model/service/ProductService.cfc:L208-L214] mutates managed entities and returns the product; Hibernate flushed them at
   * request end, together with whatever the DISPATCHING process method went on to save. Every one of
   * the four dispatch sites is inside a method that performs its own write, so the names travel with
   * that write rather than needing one of their own. A `saveSku` per SKU here would issue writes the
   * legacy did not."
   *
   * ITS FIRST TWO SENTENCES ARE RIGHT AND ITS THIRD IS FALSE, and the third is the one the conclusion
   * rested on. Of the four dispatch sites, exactly ONE performs a write - `saveProduct` [model/service/ProductService.cfc:L282], whose
   * save is dispatched AFTER this call and whose adapter cascades the new product's SKUs. The other
   * three write NOTHING: [model/service/ProductService.cfc:L123] and [model/service/ProductService.cfc:L152] end at their dispatch and return, `HibachiService.process()`
   * [org/Hibachi/HibachiService.cfc:L84-L129] validates, dispatches and returns without ever saving,
   * and [org/Hibachi/HibachiService.cfc:L193]'s branch is a stub here. QA measured the consequence directly: routed
   * `processProduct_addOptionGroup`, `processProduct_addOption` and
   * `processProduct_updateDefaultImageFileNames` requests each answered HTTP 200 with a save-shaped
   *
   * body and issued ZERO DML statements. `processProduct_addOptionGroup`'s option-link mutation was
   * unflushable by ANY code path in the port, so the operation could not be carried out at all.
   *
   * SO THE FLUSH IS WRITTEN DOWN, IN ONE PLACE, AND THIS IS THAT PLACE. It is not a new capability: the
   * legacy's Hibernate session flushed every entity the request had dirtied - the SKUs renamed at
   * [org/Hibachi/HibachiService.cfc:L209-L211] AND whatever the dispatching method changed before reaching here - as ONE unit inside
   * the ambient `cftransaction`. There is no session here, so the flush has to be a statement. This
   * method is where it belongs because it is the LAST STATEMENT OF ALL FOUR dispatchers: one flush here
   * covers the option links [org/Hibachi/HibachiService.cfc:L119] appended, the SKUs `createSkus` attached at [org/Hibachi/HibachiService.cfc:L150], and the names
   * assigned below, in ONE transaction, and it cannot be double-issued by a caller that also flushed.
   *
   * WHY THE WHOLE COLLECTION IS WRITTEN RATHER THAN A DIRTY SUBSET, which is the one respect in
   * which this is BROADER than Hibernate's flush. This method cannot see what its caller changed - it
   * receives a product, not a change log - and the mutation that most needs flushing is not its own:
   * `processProduct_addOptionGroup` changes a SKU's OPTIONS and may leave its composed image file name
   * identical, so a subset chosen by comparing image file names would skip exactly the SKU whose link
   * rows have to be rewritten. Writing the set the caller handed over is therefore the only choice that
   * covers a mutation this method is not told about. The cost is stated rather than hidden: a SKU whose
   * columns are unchanged is still rewritten with its own current values, so its `modifiedDateTime`
   * advances where Hibernate's dirty check would have left the row alone. The END STATE is identical
   *
   * and the write is idempotent by key - re-running reaches the same rows with the same values - which
   * is what keeps this operation resendable. Contrast `processProduct_updateSkus`, which CAN see its
   * own write set, collects it, and writes only that.
   *
   * AAP 0.6.5's THREE OBLIGATIONS, DISCHARGED HERE AS THEY ARE ON THE REPRICING PATH. BATCH LIMIT:
   * the collection size is checked against {@link ProductService.maximumSkuUpdateBatchSize} BEFORE the
   * first assignment, through the shared guard, so an over-large product is refused whole and
   * untouched. IDEMPOTENCY: the name is a pure function of the SKU's own options and its product's
   * code, and the link rewrite is a delete-then-insert of the collection in hand, so a retry reaches
   * the same end state. COMPENSATION: there is nothing to compensate, because
   * {@link SkuBatchWriteCollaborator} commits the whole set or none of it - "all written" and
   * "unchanged" are the only reachable outcomes, the same two the legacy flush had.
   *
   * A TRANSIENT PRODUCT IS DELIBERATELY NOT FLUSHED HERE, AND THAT IS WHAT KEEPS [org/Hibachi/HibachiService.cfc:L282] CORRECT.
   * `saveProduct` dispatches this method from its NEW-PRODUCT branch, BEFORE
   * `productRepository.saveProduct` has written the owning row - and `SwSku.productID` references
   * `SwProduct`, so inserting the children first would either violate that reference or bind a
   * product identifier that does not exist yet. The adapter already owns that sequence: it writes the
   * product row, cascades the transient SKUs, then sets the deferred `defaultSkuID`, all in ONE
   * transaction. So the flush is gated on `!product.isNew()`, which leaves the new-product path
   * behaving exactly as it did - assign, return, let the cascade persist - and confines the new write
   * to the three paths that had no write at all. The gate is `isNew()`, the entity's own published
   *
   * test, not a flag threaded down from the caller: a method that has to be TOLD whether to persist
   * can be told wrongly by a fifth caller, and this one cannot.
   *
   * @param product - The product whose SKUs are renamed in place and, unless it is still transient,
   *   persisted as one unit before this method answers.
   * @returns The same product instance that was passed in, matching [org/Hibachi/HibachiService.cfc:L213]. The persisted instances are
   *   deliberately NOT spliced in - see {@link SkuBatchWriteCollaborator.saveMutatedSkus} for why
   *   answering new objects would change the identity of the caller's collection members.
   * @throws Error when the product carries more SKUs than the configured batch bound allows, before
   *   anything has been mutated or written; or whatever the write raises, after its transaction has
   *   been rolled back, in which case NOTHING was persisted.
   */
  async processProduct_updateDefaultImageFileNames(product: Product): Promise<Product> {
    // The live association handle, bound ONCE and used for the traversal, the bound and the write, so
    // all three are demonstrably talking about the same collection. [org/Hibachi/HibachiService.cfc:L209] re-reads
    // `arguments.product.getSkus()` per iteration of a `for..in`, which CFML evaluates once anyway.
    const skus = product.getSkus();

    // THE ONE QUESTION THAT DECIDES WHETHER THIS CALL WRITES, ASKED BEFORE ANYTHING IS TOUCHED.
    // Taken up front rather than at the write below because the bound is conditional on it too: a
    // transient product is not bounded here, since its SKUs are bounded by `createSkus` and persisted
    // by the adapter's cascade rather than by this method. `isNew()` cannot change while this method
    // runs - it reads the identifier, and nothing here assigns one.
    const persists = !product.isNew();

    if (persists) {
      // The AAP 0.6.5 batch limit, checked BEFORE the first assignment so an over-large product is
      // refused with its SKUs untouched rather than renamed-then-refused. The count is the WHOLE
      // collection because the loop below mutates every member unconditionally - there is no flag and
      // no per-SKU condition to narrow it, unlike the repricing path's write set.
      this.assertWithinUpdateBound(product, skus.length, {
        operation: 'processProduct_updateDefaultImageFileNames',
        verb: 'rename and rewrite',
        legacyGround:
          '[model/service/ProductService.cfc:L208-L214] renamed every SKU of a product and left the ' +
          "flush to a Hibernate session inside the request's ambient transaction, neither of which " +
          'exists on Lambda, so the batch is bounded per AAP 0.6.5.',
      });
    }

    // [org/Hibachi/HibachiService.cfc:L209] `for(var sku in arguments.product.getSkus())` - every SKU, unconditionally.
    // There is no options guard, no count floor and no early return; a product with no SKUs
    // simply renames nothing.
    for (const sku of skus) {
      const imageGroupOptionCodes: (string | undefined)[] = [];

      // [model/service/ProductService.cfc:L133-L137] The option traversal, in the entity's own
      // order, keeping only the codes whose group carries the image-group flag.
      for (const option of sku.getOptions()) {
        // [model/service/ProductService.cfc:L134] The association read that keeps this test on
        // this side of the port.
        const optionGroup = option.getOptionGroup();

        if (optionGroup !== undefined && optionGroup.getImageGroupFlag()) {
          // [model/service/ProductService.cfc:L135] The code is appended RAW. The delimiter and
          // the sanitisation are the port's, specified there in full, because splitting them
          // across the two sides is how the two halves come to disagree.
          imageGroupOptionCodes.push(option.getOptionCode());
        }
      }

      // [model/service/ProductService.cfc:L210] The assignment, with
      // [model/service/ProductService.cfc:L138]'s composition behind the port.
      sku.setImageFile(
        this.imageStore.generateSkuImageFileName({
          // [model/service/ProductService.cfc:L138] `getProduct().getProductCode()` - read from
          // the product being processed rather than through `sku.getProduct()`, which is the same
          // object on a coherently loaded graph and is guaranteed present here.
          productCode: product.getProductCode(),
          imageGroupOptionCodes,
        }),
      );
    }

    // THE FLUSH THE LEGACY SESSION PERFORMED, ISSUED AFTER THE TRAVERSAL SO A RAISE FROM EITHER SIDE
    // LEAVES THE ROWS AS THEY WERE FOUND. Every SKU on the product is handed over rather than a
    // computed subset: [model/service/ProductService.cfc:L209] renames EVERY one of them
    // unconditionally, so the write set and the collection are the same set. An empty collection
    // opens no transaction and issues no statement, matching a session that dirtied no entity, and a
    // transient product writes nothing - both guards live in
    // {@link ProductService.persistMutatedSkus}, so this line carries no capacity reasoning of its
    // own and `persists` above governs only the batch bound.
    await this.persistMutatedSkus(product, skus);

    // [model/service/ProductService.cfc:L213]
    return product;
  }

  /**
   * What the divergence looks like from the outside, stated honestly.
   *
   * change. Two LEGACY-NOTEs stood here.
   *
   * @param product The product whose SKUs are updated in place and then persisted.
   * @param input The flags and prices, validated against the declarative rules first.
   * @returns The same product instance that was passed in, matching
   * [model/service/ProductService.cfc:L232].
   * @throws z.ZodError when a set flag arrives without its matching numeric price.
   */
  async processProduct_updateSkus(
    product: Product,
    input: ProductUpdateSkusInput,
  ): Promise<Product> {
    // This method once opened with `await Promise.resolve();`, `AND` that line is now gone rather
    // than kept.
    //
    // The two sibling methods that do still open that way - `processProduct_addProductReview` and
    // `processProduct_uploadDefaultImage` - keep it deliberately.

    // The declarative rules of `model/validation/Product_UpdateSkus.json`, applied before any
    // mutation - which is the order the legacy framework used, validating the process object on
    // population.
    productUpdateSkusSchema.parse(input);

    // CFML parity [model/service/ProductService.cfc:L218]: the LIVE association array again, not a
    // snapshot.
    const skus = product.getSkus();

    // Recorded that the batch bound ran before anything asked whether there was work at all, so a
    // source-required NO-OP - both flags falsy - was REFUSED on a product with many SKUs.
    //
    // Null and on an unconvertible value, exactly as CFML's `if(null)` does - and the legacy
    // raises INSIDE the LOOP, on the first SKU.
    const updateSetSize =
      requestsSkuUpdate(input.updatePriceFlag) || requestsSkuUpdate(input.updateListPriceFlag)
        ? skus.length
        : 0;

    // The AAP 0.6.5 batch limit, applied BEFORE the first mutation so that an
    // over-large product is refused whole - and now applied to THE ACTUAL UPDATE SET, so a call
    // that would mutate nothing is never refused. Placed after the schema parse because the
    // declarative rules are the legacy's own first gate and a malformed request should
    // fail as a validation error rather than as a capacity refusal.
    this.assertWithinUpdateBound(product, updateSetSize, {
      operation: 'processProduct_updateSkus',
      verb: 'reprice',
      legacyGround:
        '[model/service/ProductService.cfc:L218-L230] repriced every SKU of a product under an ' +
        'ambient transaction and an hour-long request budget, neither of which exists on ' +
        'Lambda, so the batch is bounded per AAP 0.6.5.',
    });

    // The SKUs this call actually changed, which is what gets written. An untouched SKU is not
    // persisted, matching a Hibernate session that dirtied no entity.
    const mutatedSkus: Sku[] = [];

    // CFML parity [model/service/ProductService.cfc:L219]: `if(arrayLen(skus))` is a bare numeric
    // truthiness test on a count. The guard is redundant in front of a loop that would simply not
    // iterate, and it is kept because it is what the legacy wrote.
    if (skus.length > 0) {
      for (const sku of skus) {
        // Set by either branch below. A SKU touched by both is still collected once, because the
        // collection is a write set rather than a change log.
        let mutated = false;

        // CFML parity [model/service/ProductService.cfc:L222]: a bare numeric truthiness test on
        // the flag, which is why it routes through the truthiness helper.
        if (cfTruthy(input.updatePriceFlag)) {
          const price = input.price;

          if (!isLegacyNumeric(price)) {
            throw new Error(
              'updatePriceFlag is set but price is absent or not numeric. The declarative ' +
                'rule in model/validation/Product_UpdateSkus.json only requires price when ' +
                'updatePriceFlag equals 1, while the runtime branch at ' +
                'model/service/ProductService.cfc:L222 is a bare truthiness test; that ' +
                'divergence is preserved, and this is where it surfaces.',
            );
          }

          sku.setPrice(toMoneyFromLegacyNumeric(price));
          mutated = true;
        }

        // CFML parity [model/service/ProductService.cfc:L226]: the same shape again for the list
        // price, independently gated. The two branches do not interact, matching the two
        // independent conditions in the validation file.
        if (cfTruthy(input.updateListPriceFlag)) {
          const listPrice = input.listPrice;

          if (!isLegacyNumeric(listPrice)) {
            throw new Error(
              'updateListPriceFlag is set but listPrice is absent or not numeric. The ' +
                'declarative rule in model/validation/Product_UpdateSkus.json only requires ' +
                'listPrice when updateListPriceFlag equals 1, while the runtime branch at ' +
                'model/service/ProductService.cfc:L226 is a bare truthiness test; that ' +
                'divergence is preserved, and this is where it surfaces.',
            );
          }

          sku.setListPrice(toMoneyFromLegacyNumeric(listPrice));
          mutated = true;
        }

        if (mutated) {
          mutatedSkus.push(sku);
        }
      }
    }

    // The write, issued after the loop rather than inside it, so a raise from either branch above
    // reaches the caller having persisted nothing at all.
    //
    // ONE UNIT OF WORK FOR THE COLLECTION, NOT ONE PER SKU. Idempotency by key makes a retry
    // safe; it does not make an unreachable write succeed. A permanent mid-batch failure - a
    // constraint the sixth of ten SKUs violates every time - would otherwise leave one to five
    // repriced and seven to ten not, and every retry would reproduce that identical split.
    //
    // The set commits through {@link SkuBatchWriteCollaborator}, which is ONE transaction:
    // all of them or none. That RESTORES the source's two reachable outcomes rather than
    // improving on them - [model/service/ProductService.cfc:L232] handed back managed entities
    // whose Hibernate session flushed every dirtied SKU as one unit inside the request's
    // `cftransaction`, and `HibachiService.process()` [org/Hibachi/HibachiService.cfc:L84-L129]
    // saved nothing itself. AAP 0.6.5's three obligations are all still discharged: the bound
    // ran before the first mutation, the write is still idempotent by key, and there is now
    // nothing left to compensate.
    //
    // THE PARENT KEY TRAVELS WITH THE SET, AND ITS ABSENCE IS A DATA-LOSS HAZARD. Without it the
    // write binds `SwSku.productID` from `sku.getProduct()?.getProductID()` - an association this
    // fetch shape never materializes - so every repriced row has its parent key ERASED to SQL
    // NULL. See {@link SkuBatchWriteCollaborator.saveMutatedSkus}. The key is read off the product
    // this method was handed, which is by definition the parent of every SKU in its own
    // collection.
    await this.persistMutatedSkus(product, mutatedSkus);

    return product;
  }

  /**
   * Persists a set of this product's SKUs, binding the product's own identifier as their parent key.
   *
   * THE ONE PLACE THIS SERVICE HANDS SKUs TO PERSISTENCE, AND THE ONE PLACE THE PARENT KEY IS
   * RESOLVED. Four operations reach it - `processProduct_updateSkus`,
   * `processProduct_addOptionGroup`, `processProduct_addOption` and
   * `processProduct_updateDefaultImageFileNames` - and every one of them holds the product whose
   * collection it just mutated. Centralising the key resolution is what makes "a SKU is never written
   * without its parent" checkable in one place rather than at four call sites.
   *
   * A TRANSIENT PRODUCT WRITES NOTHING HERE, AND THAT IS HIBERNATE'S OWN ORDERING RATHER THAN A
   * SKIPPED WRITE. `Product.productID` is legitimately the empty string before the row exists
   * [model/entity/Product.cfc:L52 `unsavedvalue=""`], and a `SwSku.productID` naming nothing is the
   * orphaning state itself, so a row whose parent key cannot be named must not be written at all.
   *
   * It does not need to be, either: `Product.skus` declares `cascade="all-delete-orphan"`
   * [model/entity/Product.cfc:L73], so the aggregate write inserts a transient product's SKUs, in
   * one transaction, after the parent row exists. `MysqlProductRepository.saveProduct` reproduces
   * that cascade and `saveProduct` is the one path that reaches it, so nothing is lost by returning
   * early: the caller either goes on to save the product - which writes them - or discards it, which
   * persists nothing at all, exactly as discarding an unflushed Hibernate session did.
   *
   * ⚠ THIS IS NOT THE SILENT DISCARD THE FINDING WAS ABOUT, and the difference is worth stating
   * because the two look alike from a distance. The finding was a PERSISTED product answering HTTP
   * 200 while its already-durable rows kept their old values. Every routed operation loads its
   * product by identifier before reaching this service, so `productID` is non-empty on every one of
   * them and the early return is unreachable from the API. What reaches it is an in-memory caller
   * assembling a product it has not saved yet.
   *
   * @param product - The product whose collection the caller mutated; its identifier is the parent key.
   * @param skus - The SKUs to write. An empty set writes nothing and opens no transaction.
   */
  private async persistMutatedSkus(product: Product, skus: readonly Sku[]): Promise<void> {
    const productID = product.getProductID();

    if (productID.length === 0) {
      return;
    }

    await this.skuBatchWrite.saveMutatedSkus(productID, skus);
  }

  /**
   * Refuses to reprice more SKUs in one atomic write than the configured bound allows.
   *
   * @param product The product being repriced, named in the message so the refusal is actionable.
   * @param skuCount How many SKUs this call would actually reprice - the whole collection when
   * either flag holds, and ZERO when neither does.
   * @throws Error when the count exceeds the bound.
   */
  private assertWithinUpdateBound(
    product: Product,
    skuCount: number,
    refusal: SkuBatchBoundRefusal,
  ): void {
    if (skuCount > this.maximumSkuUpdateBatchSize) {
      throw new Error(
        `ProductService.${refusal.operation}: product '${product.getProductID()}' would ` +
          `${refusal.verb} ${String(skuCount)} SKUs, above the configured bound of ` +
          `${String(this.maximumSkuUpdateBatchSize)}. ` +
          `${refusal.legacyGround} Refused before anything was mutated or ` +
          'written, so the product is unchanged.',
      );
    }
  }

  /**
   * LEGACY-NOTE [model/service/ProductService.cfc:L245-L247]:
   * `if(!directoryExists(...)) directoryCreate(...)` has no counterpart, and none is invented.
   *
   * @param product Answered unchanged, matching [model/service/ProductService.cfc:L256].
   * @param input Its `imageFile` names the destination and its `uploadFile` carries the
   * already-completed upload projection.
   * @returns The same product instance that was passed in, matching
   * [model/service/ProductService.cfc:L256].
   */
  async processProduct_uploadDefaultImage(
    product: Product,
    input: ProductUploadDefaultImageInput,
  ): Promise<Product> {
    const uploadFile = input.uploadFile;
    const imageFile = input.imageFile;

    // The upload half of [model/service/ProductService.cfc:L249] happens before this method is
    // reached, so an invocation that carries no completed projection - or no destination name to
    // write it under - has nothing to hand the store.
    if (uploadFile !== undefined && imageFile !== undefined) {
      try {
        // SECURITY BOUNDARY - path traversal. Checked before the path is composed, so no traversing
        // string is ever built or handed across the port.
        //
        // DELETION [model/service/ProductService.cfc:L198-L206] has no try/catch at all, so a
        // refusal there propagates - which is why the guard sits outside any handler in that
        // method.
        assertPlainImageFileName(imageFile);

        // CFML parity [model/service/ProductService.cfc:L241, L250]: the destination is the upload
        // directory joined to `processObject.getImageFile()`, and the bytes are moved into it. The
        // store-relative form is used for the reason recorded above.
        await this.imageStore.saveImageFile(
          uploadFile,
          `product/default/${imageFile}`,
          DEFAULT_IMAGE_UPLOAD_ACCEPT_EXTENSIONS,
        );
      } catch {
        // CFML parity [model/service/ProductService.cfc:L252-L254]: `catch(any e)` catches
        // EVERYTHING, records `'validate.fileUpload'` against the `imageFile` property of the
        // process object, and falls through to the return.
        //
        // The error onto the PROCESS OBJECT, which is a `HibachiProcess` entity with its own
        // register.
        product.addError('imageFile', FILE_UPLOAD_VALIDATION_RB_KEY);
        product.addError('processObjects', UPLOAD_DEFAULT_IMAGE_PROCESS_CONTEXT);
      }
    }

    return product;
  }

  // `saveProduct` does populate [model/service/ProductService.cfc:L266] and validate
  // [model/service/ProductService.cfc:L273] by HAND and then calls
  // `getHibachiDAO().save(target=arguments.product)` [model/service/ProductService.cfc:L287] with
  // a KEYWORD argument.

  /**
   * @param product The product being saved.
   * @param data The save payload, READ ONLY BY THIS METHOD.
   * @returns THE SAME ENTITY EITHER WAY, which is the legacy contract
   * [org/Hibachi/HibachiService.cfc:L167], [model/service/ProductService.cfc:L291]: the PERSISTED
   * product when it validated.
   * @throws {@link ProductPopulateError} when the payload states `sortOrder` as something that is
   * not an ORM integer.
   */
  async saveProduct(product: Product, data: ProductSaveInput): Promise<Product> {
    populateProduct(product, data);

    if (isNullish(product.getUrlTitle())) {
      // CFML parity [model/service/ProductService.cfc:L269]: the legacy calls the generator with
      // KEYWORD arguments - `titleString=` and `tableName=` - and the port declares the same two
      // parameters in the same order.
      const generatedUrlTitle = await this.urlTitleGenerator.createUniqueURLTitle(
        product.getTitle(),
        PRODUCT_URL_TITLE_TABLE,
      );

      // CFML parity [model/service/ProductService.cfc:L269]: the resolved title is written ONTO
      // the ENTITY, which is what the legacy statement `arguments.product.setURLTitle(...)` does.
      product.setUrlTitle(generatedUrlTitle);
    }

    // CFML parity [model/service/ProductService.cfc:L273]: validate, reproduced
    // service-locally for the save context. It reads THE ENTITY for all five rules,
    // including `urlTitle`, because populate and generation have both already landed on
    // it - which is the state `arguments.product.validate(context="save")` saw. See
    // `collectProductSaveContextErrors` for the five rules, the locator correction and
    // the two `unique` qualifiers that are deliberately not asserted in memory.
    //
    // THE PAYLOAD'S `price` IS HANDED IN, because `getPrice()` probes that slot BEFORE the default
    // SKU [model/entity/Product.cfc:L561-L568] and `populate`
    // [org/Hibachi/HibachiTransient.cfc:L169-L205] had already written it by the time the legacy
    // validated. Without it the rule is unsatisfiable for a product with no default SKU; the full
    // account is at `collectProductSaveContextErrors`.
    const errors = collectProductSaveContextErrors(product, data.price);
    const hasErrors = errors.length > 0;

    // CFML parity [model/service/ProductService.cfc:L276]: both conditions, in order - the product
    // must be new and already free of errors.
    //
    // Bound to a name rather than tested inline, because the refusal report below has to know
    // whether sku creation ran at all.
    const skuCreationRan = product.isNew() && !hasErrors;

    if (skuCreationRan) {
      await this.skuCreation.createSkus(product, data);

      // L282, the fourth and last dispatcher site. See the CFML parity note at
      // [model/service/ProductService.cfc:L123].
      product = await this.processProduct_updateDefaultImageFileNames(product);
    }

    // CFML parity [model/service/ProductService.cfc:L286]: the legacy asks `hasErrors()` a second
    // time here, and the second ask can answer differently from the first.
    //
    // The `isNew()` term becomes `skuCreationRan`, which is the same test plus the one that makes
    // it meaningful.
    const skuCreationWasRefused = skuCreationRan && product.getSkus().length === 0;

    // Errors `createSkus` records are added to the PRODUCT at
    // [model/service/SkuService.cfc:L142, L148, L177], not to a SKU, so the property identifier is
    // the product's own collection.
    if (hasErrors || skuCreationWasRefused) {
      const refusals: ProductSaveContextError[] = [...errors];

      if (skuCreationWasRefused) {
        refusals.push({
          propertyIdentifier: 'skus',
          errorMessage:
            'sku creation attached no sku to this new product, so the product was not persisted',
        });
      }

      for (const refusal of refusals) {
        product.addError(refusal.propertyIdentifier, refusal.errorMessage);
      }

      // CFML parity [model/service/ProductService.cfc:L286, L291]: the save at
      // [model/service/ProductService.cfc:L287] is skipped and the same, unpersisted entity is
      // answered - carrying its errors.
      return product;
    }

    // LEGACY-NOTE [model/service/ProductService.cfc:L287]: this line is
    // `getHibachiDAO().save(target=arguments.product)` - a KEYWORD call to the DAO, not
    // `super.save`, and therefore not the framework service-level save that `saveProductType` uses
    // at [model/service/ProductService.cfc:L303].
    product = await this.productRepository.saveProduct(product, {
      urlTitle: product.getUrlTitle(),
      productName: product.getProductName(),
    });

    return product;
  }

  /**
   * The three-revision record is in the step 3 note in the body.
   *
   * @param productType The product type being saved.
   * @param data The save payload, MUTATED IN PLACE when generation fires - see the JUDGMENT CALL
   * below.
   * @returns THE SAME ENTITY EITHER WAY: the PERSISTED product type when it validated, or the
   * UNPERSISTED product type CARRYING ITS ERRORS when it did not.
   * !structKeyExists(data, "urlTitle") || !len(data.urlTitle)
   */
  async saveProductType(
    productType: ProductType,
    data: ProductTypeSaveInput,
  ): Promise<ProductType> {
    if (
      !hasCfLength(productType.getUrlTitle()) &&
      (!structKeyExists(data, 'urlTitle') || !hasCfLength(readTextKey(data, 'urlTitle')))
    ) {
      // CFML parity [model/service/ProductService.cfc:L296-L299]: the preference order is
      // `data.productTypeName` FIRST and the entity's own `getProductTypeName()` SECOND.
      const incomingProductTypeName = readTextKey(data, 'productTypeName');
      const entityProductTypeName = productType.getProductTypeName();

      if (structKeyExists(data, 'productTypeName') && hasCfLength(incomingProductTypeName)) {
        // JUDGMENT CALL: the generated title is written into the CALLER'S `data` object, in place,
        // because that is what the legacy line does and because the persisted outcome depends on
        // it.
        writeResolvedUrlTitle(
          data,
          await this.urlTitleGenerator.createUniqueURLTitle(
            incomingProductTypeName,
            // `"SwProductType"` preserved byte-identically, same carve-out as `"SwProduct"`: a
            // schema data contract, not configuration.
            PRODUCT_TYPE_URL_TITLE_TABLE,
          ),
        );
      } else if (!isNullish(entityProductTypeName) && hasCfLength(entityProductTypeName)) {
        // The `!isNullish(...)` term is REDUNDANT in front of `hasCfLength`, which asks it first.
        writeResolvedUrlTitle(
          data,
          await this.urlTitleGenerator.createUniqueURLTitle(
            entityProductTypeName,
            PRODUCT_TYPE_URL_TITLE_TABLE,
          ),
        );
      }

      // No `else`. When neither source yields a name the URL title stays unset and this method
      // reports nothing - preserved deliberately, as recorded above.
    }

    // CFML parity [model/service/ProductService.cfc:L303]: `super.save(productType, data)` is
    // POSITIONAL and delegates populate, validate and save to the framework - the opposite of
    // `saveProduct`.
    //
    // Consuming `productTypeRepository.saveProductType`, a member the port already declares, is
    // consuming an existing port and is entirely permitted.

    // Step 1 - populate [org/Hibachi/HibachiService.cfc:L145]:
    // `if(structKeyExists(arguments,"data")) { arguments.entity.populate(...); }`.
    //
    // Read through the CASE-INSENSITIVE accessor, because populate matched CFML property names
    // case-insensitively; UNCONDITIONAL on PRESENCE and never conditional on emptiness.
    populateProductType(productType, data);

    const populatedProductTypeName = structGet(data, 'productTypeName');

    // STEP 2 - validate [org/Hibachi/HibachiService.cfc:L150]:
    // `arguments.entity.validate(context=arguments.context)`, where the context defaults to
    // `"save"` [org/Hibachi/HibachiService.cfc:L140].
    const errors = collectProductTypeSaveContextErrors(productType);
    const hasErrors = errors.length > 0;

    // Step 3 - save, only when clean [org/Hibachi/HibachiService.cfc:L153-L155]:
    // `if(!arguments.entity.hasErrors()) { arguments.entity = getHibachiDAO().save(...); }`.
    //
    // The framework returns the entity either way [org/Hibachi/HibachiService.cfc:L167], so so
    // does this.
    //
    // The payload below carries the two columns the adapter can address.
    if (hasErrors) {
      for (const error of errors) {
        productType.addError(error.propertyIdentifier, error.errorMessage);
      }

      // CFML parity [org/Hibachi/HibachiService.cfc:L153-L155, L167]: the write is SKIPPED and the
      // same entity is answered.
      return productType;
    }

    productType = await this.productTypeRepository.saveProductType(productType, {
      urlTitle: productType.getUrlTitle(),
      productTypeName:
        typeof populatedProductTypeName === 'string'
          ? populatedProductTypeName
          : productType.getProductTypeName(),
    });

    // CFML parity [model/service/ProductService.cfc:L306]: the legacy condition is
    // `!hasErrors() && !isNull(getParentProductType()) and arrayLen(...getProducts())`. Three
    // notes, all faithful: * It MIXES `&&` and `and` in one expression.
    const parentProductType = productType.getParentProductType();

    if (parentProductType !== undefined && parentProductType.getProducts().length > 0) {
      // LEGACY-DEFECT [model/service/ProductService.cfc:L307]: the parent's product collection is
      // assigned directly to the child, replacing rather than merging the child's own products.
      // Preserved deliberately; do not fix without a product decision.
      productType.setProducts(parentProductType.getProducts());
    }

    return productType;
  }

  /**
   * Ported from `public boolean function deleteProduct(required any product)`
   * [model/service/ProductService.cfc:L317-L336].
   *
   * CFML parity [model/service/ProductService.cfc:L323]: `javaCast("null", "")` is the CFML
   * null-assignment idiom.
   *
   * @param product The product to delete.
   * @returns `true` when the product was deleted, `false` when validation or the delete itself
   * refused - the legacy answers a boolean either way and never throws for a refused delete.
   */
  async deleteProduct(product: Product): Promise<boolean> {
    // The enforceable delete-context rule: `transactionExistsFlag eq false`.
    const transactionExists = await this.skuRepository.getTransactionExistsFlag(
      product.getProductID(),
    );

    if (transactionExists) {
      // The refusal takes the same exit the legacy takes for a failed delete, and it takes it
      // before the delete is attempted rather than after.
      return false;
    }

    // CFML parity [model/service/ProductService.cfc:L320]: the snapshot, bound before the
    // association is cleared and read again only on the failure exit. It is a real local with a
    // real consumer, not a placeholder - see [model/service/ProductService.cfc:L329-L333] below.
    const defaultSkuSnapshot = product.getDefaultSku();

    // CFML parity [model/service/ProductService.cfc:L323]: the in-memory half of the detach.
    if (defaultSkuSnapshot !== undefined) {
      product.setDefaultSku(undefined);
    }

    // CFML parity [model/service/ProductService.cfc:L326]: `super.delete(arguments.product)` is
    // POSITIONAL and answers a boolean. It maps onto `productRepository.deleteProduct`, a member
    // the port ALREADY DECLARES with exactly that shape; nothing is invented.
    const deleteOK = await this.productRepository.deleteProduct(product);

    // CFML parity [model/service/ProductService.cfc:L329-L335]: the legacy's explicit two-exit
    // shape is kept rather than collapsed to `return deleteOK`.
    if (!deleteOK) {
      // CFML parity [model/service/ProductService.cfc:L330]: the restore, and it restores the same
      // INSTANCE rather than a copy - `getDefaultSku()` on the caller's product answers exactly
      // what it answered before this method was entered.
      if (defaultSkuSnapshot !== undefined) {
        product.setDefaultSku(defaultSkuSnapshot);
      }

      return false;
    }

    // And the SUCCESS EXIT does not RESTORE, which is the legacy's own shape rather than an
    // omission: [model/service/ProductService.cfc:L329-L333] sits inside the `else` of the delete
    // test.
    return true;
  }

  /**
   * Replaces `public any function getProductSmartList(struct data={}, currentURL="")`
   * [model/service/ProductService.cfc:L342-L358].
   *
   * LEGACY-NOTE [model/service/ProductService.cfc:L342]: getProductSmartList returned a
   * HibachiSmartList - a generic, string-keyed.
   *
   * @param criteria The typed query.
   * @returns The matched products, the paging window applied, and the preserved query contract.
   */
  async findProducts(criteria: ProductQueryCriteria): Promise<ProductPage> {
    assertPagingBound('pageRecordsStart', criteria.pageRecordsStart);
    assertPagingBound('pageRecordsShow', criteria.pageRecordsShow);

    // The keyword term and the product-type restriction are the two filters the legacy smart list
    // was actually driven with from this component's call sites.
    //
    // `criteria.keyword` is a `string`, never `undefined`, so the unconditional bind at
    // [model/dao/ProductDAO.cfc:L422] is satisfied by construction rather than by hope.
    const pageRecordsStart = criteria.pageRecordsStart ?? 0;
    const pageRecordsShow = criteria.pageRecordsShow;

    // A window is supplied only when the caller asked for one.
    const matched = await this.productRepository.searchProductsByProductType(
      criteria.keyword,
      criteria.productTypeIDs,
      ...(pageRecordsShow === undefined
        ? []
        : [{ start: pageRecordsStart, count: pageRecordsShow }]),
    );

    // A start with no count is still applied here, because it is not expressible as a window and
    // the adapter has already materialized every match for it.
    const records =
      pageRecordsShow === undefined ? matched.records.slice(pageRecordsStart) : matched.records;

    return {
      records,
      recordsCount: matched.matchedCount,
      pageRecordsStart,
      pageRecordsShow,
      entityName: 'SlatwallProduct',
      joins: PRODUCT_QUERY_JOINS,
      keywordProperties: PRODUCT_QUERY_KEYWORD_PROPERTIES,
    };
  }
}
