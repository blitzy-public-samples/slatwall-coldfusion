// slatwall-ts - SKU creation, option-ordered retrieval and SKU lookup service.
//
// CFML parity [model/service/SkuService.cfc:L49]: the component declares
// `extends="HibachiService" persistent="false" accessors="true" output="false"`. None of the four
// attributes has a TypeScript analogue and all four are dropped.

import { randomUUID } from 'node:crypto';

import { Sku } from '../domain/entities/sku.js';
import { Money } from '../domain/valueObjects/money.js';
import { listGetAt, listLen } from '../lib/cfml/list.js';
import { cfEquals, cfFoldKey, structGet, structKeyExists } from '../lib/cfml/struct.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';

import type { Option } from '../domain/entities/option.js';
import type { OptionGroup } from '../domain/entities/optionGroup.js';
import type { Product } from '../domain/entities/product.js';
import type { ProductType } from '../domain/entities/productType.js';
import type { SkuHydrationInput, SkuImageSettingValues } from '../domain/entities/sku.js';
import type { ImageStore, ImageUploadResultProjection } from '../domain/ports/imageStore.js';
import type { SkuRepository } from '../domain/ports/skuRepository.js';
import type {
  SubscriptionBenefitHandle,
  SubscriptionTermProvider,
} from '../domain/ports/subscriptionTermProvider.js';
import type { CfTruthyInput } from '../lib/cfml/truthiness.js';

// Module-local constants and helpers.

/**
 * The allowed image extensions, verbatim from [model/service/SkuService.cfc:L212].
 *
 * Preserved character for character as a comma-delimited list, because it is the legacy value and
 * B5 forbids adding, removing or reordering a constraint the legacy states.
 */
const ALLOWED_IMAGE_EXTENSIONS = 'jpg,jpeg,png,gif';

/**
 * The three resource-bundle identifiers this component passes to `addError`.
 *
 * `rbKey()` resolves them through JavaRB in the legacy admin, and AAP 0.5.3 keeps every such
 * identifier verbatim as a string constant precisely so the legacy admin can still resolve it.
 *
 * Two details are deliberate and must not be "fixed": * [model/service/SkuService.cfc:L143]
 * misspells benefits as `benifits`.
 */
const RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED = 'entity.product.subscriptionbenifitsrequired';
const RB_KEY_SUBSCRIPTION_TERMS_REQUIRED = 'entity.product.subscriptiontermsrequired';
const RB_KEY_ACCESS_CONTENTS_REQUIRED = 'validate.product.accesscontentsrequired';

/**
 * The properties `findSkus`' statement matches the keyword against: `skuCode` alone.
 *
 * [model/dao/SkuDAO.cfc:L132] writes one comparison, `skuCode like:code`, and
 * [model/service/SkuService.cfc:L133] binds `%#term#%` to it.
 */
const SKU_KEYWORD_PROPERTIES = [{ propertyIdentifier: 'skuCode', weight: 1 }] as const;

/**
 * The joins `findSkus`' statement performs: none.
 *
 * [model/dao/SkuDAO.cfc:L132] is `select skuID,skuCode from SlatwallSku where skuCode like:code`.
 *
 * What was wrong was publishing them as this query's contract.
 */
const SKU_SMART_LIST_JOINS = [] as const;

/**
 * The default bound on how many SKUs one `createSkus` invocation will create.
 *
 * AAP 0.6.5 REQUIRES an explicit batch limit on the bulk SKU paths, so a bound must exist for the
 * requirement to be met; it is constructor-configurable.
 */
const DEFAULT_MAXIMUM_SKU_CREATION_BATCH_SIZE = 1000;

/**
 * What CFML's `isNumeric()` accepts, expressed as one pattern.
 *
 * A module-scope `const` holding an immutable `RegExp` literal, compiled once.
 *
 * This pattern is carried verbatim from `src/domain/entities/roundingRule.ts`, which is the house
 * precedent for a module-local `isNumeric`.
 */
const CFML_NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A local equivalent of CFML's `isNumeric()`, scoped to the values that reach it.
 *
 * Whitespace is trimmed before testing, which is CFML parity rather than convenience: both target
 * engines tolerate surrounding whitespace in `isNumeric()`.
 *
 * @param value a `listPrice` field value exactly as it was read.
 * @returns `true` when CFML would consider `value` numeric.
 */
function isNumeric(value: string): boolean {
  return CFML_NUMERIC_PATTERN.test(value.trim());
}

/**
 * Canonicalises a CFML numeric literal into the plain decimal numeral `Money` accepts.
 *
 * CFML parity: assigning a form value to a `big_decimal` property coerced it silently, so
 * `' 9.99 '`, `'+9.99'` and `'9.'` all reached the column as the same number.
 *
 * @param value a CFML numeric literal.
 * @returns the same value as a candidate plain decimal numeral.
 */
function canonicalPlainDecimalNumeral(value: string): string {
  const trimmed = value.trim();
  const unsigned = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

  return unsigned.endsWith('.') ? unsigned.slice(0, -1) : unsigned;
}

/**
 * A CFML-shaped entity identifier, generated the way `createHibachiUUID()` is.
 *
 * `mysqlSkuRepository.insertSku` mints its own key with an identically-shaped generator and
 * returns a rehydrated SKU carrying it.
 */
function createHibachiShapedIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Raised when the sorted-ID result cannot be filled densely from the supplied SKUs.
 *
 * MODULE-LOCAL and not EXPORTED, following the pattern `src/repositories/mysql/dialect.ts` and
 * `src/repositories/mysql/connection.ts` already establish: the class is local, it sets an
 * explicit `name`.
 *
 * `arrayResize` at [model/service/SkuService.cfc:L232] and [model/service/SkuService.cfc:L260]
 * sizes the result to the QUERY's row count.
 */
class SkuSortOrderError extends Error {
  /**
   * The product whose SKUs were being sorted.
   */
  readonly productID: string;

  /**
   * How many rows the sorted-ID query returned, i.e. the resized length.
   */
  readonly sortedIdentifierCount: number;

  /**
   * How many SKUs the caller supplied to fill those rows.
   */
  readonly suppliedSkuCount: number;

  /**
   * Which positions were left unfilled, zero-based, in ascending order.
   */
  readonly unfilledPositions: readonly number[];

  constructor(
    productID: string,
    sortedIdentifierCount: number,
    suppliedSkuCount: number,
    unfilledPositions: readonly number[],
    siteLocator: string,
  ) {
    super(
      [
        `SkuService could not place a SKU at every position of the sorted-ID result for product`,
        `'${productID}': the query returned ${String(sortedIdentifierCount)} row(s) but only`,
        `${String(suppliedSkuCount)} SKU(s) were supplied, leaving position(s)`,
        `${unfilledPositions.join(', ')} unfilled.`,
        `[model/service/SkuService.cfc:${siteLocator}] sizes the result with arrayResize to the`,
        'query row count, so those positions are CFML nulls - which raise on the first access, at',
        'the caller rather than here. The published return type is Sku[], so the array is refused',
        'at the boundary instead of being handed over with holes in it.',
        'Load the product with every SKU the query can return, or narrow the query to the SKUs in',
        'hand.',
      ].join(' '),
    );
    this.name = 'SkuSortOrderError';
    this.productID = productID;
    this.sortedIdentifierCount = sortedIdentifierCount;
    this.suppliedSkuCount = suppliedSkuCount;
    this.unfilledPositions = unfilledPositions;
  }
}

// Co-located type declarations.

/**
 * The `data` struct [model/service/SkuService.cfc:L58] receives, typed.
 *
 * The legacy signature is `createSkus(required any product, required struct data)` and the struct
 * is untyped, so this interface is the target's replacement for it.
 *
 * There is no `renewalPrice` member, and that is deliberate.
 */
export interface CreateSkusInput {
  readonly price: string;

  /**
   * [model/service/SkuService.cfc:L94-L96], [model/service/SkuService.cfc:L130-L132] - a decimal
   * numeral, gated by a THREE-clause guard. Optional, and a value of exactly `0` or a non-numeric
   * value is silently dropped, exactly as the legacy drops it.
   */
  readonly listPrice?: string | undefined;

  /**
   * [model/service/SkuService.cfc:L64], [model/service/SkuService.cfc:L73],
   * [model/service/SkuService.cfc:L74] - a comma-delimited list of `optionID`s. Its presence and
   * non-zero STRING LENGTH is what selects the multi-SKU merchandise branch.
   */
  readonly options?: string | undefined;

  /**
   * The `Option` entities the `options` list names, already hydrated.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L74]: `getOptionService().getOption(id)` is
   * `HibachiService`'s generic `get<Entity>(primaryKey)` CRUD accessor, not a method declared on
   * `OptionService.cfc` - that component declares only `getOptionsForSelect`.
   */
  readonly resolvedOptions?: readonly Option[] | undefined;

  /**
   * [model/service/SkuService.cfc:L142], [model/service/SkuService.cfc:L160],
   * [model/service/SkuService.cfc:L161] - a comma-delimited list of `subscriptionBenefitID`s.
   */
  readonly subscriptionBenefits?: string | undefined;

  /**
   * [model/service/SkuService.cfc:L147], [model/service/SkuService.cfc:L153],
   * [model/service/SkuService.cfc:L158] - a comma-delimited list of `subscriptionTermID`s.
   */
  readonly subscriptionTerms?: string | undefined;

  /**
   * [model/service/SkuService.cfc:L163], [model/service/SkuService.cfc:L164] - a comma-delimited
   * list of `subscriptionBenefitID`s, iterated with no preceding existence guard. See the
   * LEGACY-DEFECT marker at that site.
   */
  readonly renewalSubscriptionBenefits?: string | undefined;

  /**
   * [model/service/SkuService.cfc:L175], [model/service/SkuService.cfc:L186],
   * [model/service/SkuService.cfc:L187], [model/service/SkuService.cfc:L191],
   * [model/service/SkuService.cfc:L196] - a comma-delimited list of `contentID`s.
   */
  readonly accessContents?: string | undefined;

  /**
   * [model/service/SkuService.cfc:L181] - tested for existence and then for BARE TRUTHINESS on the
   * value itself, which is why it is typed as CFML-truthy input rather than `boolean`.
   */
  readonly bundleContentAccess?: CfTruthyInput;
}

/**
 * The `imageUploadResult` struct [model/service/SkuService.cfc:L210] receives.
 *
 * `src/domain/ports/imageStore.ts` already declares `ImageUploadResultProjection` as the contract
 * `saveImageFile` accepts.
 */
export type ImageUploadResult = ImageUploadResultProjection;

/**
 * The typed criteria that replaces the `HibachiSmartList` this component built at
 * [model/service/SkuService.cfc:L309-L325].
 *
 * There is no filter bag, no arbitrary property path, no `data` struct passthrough and no paging
 * surface - `data={}` and `currentURL=""` were framework plumbing and are dropped.
 */
export interface SkuQueryCriteria {
  /**
   * The search term. Matched against `skuCode` and only `skuCode` [model/dao/SkuDAO.cfc:L132] -
   * which is exactly the one keyword property the returned page reports.
   */
  readonly keyword: string;

  /**
   * An optional product-type filter, carried as a comma-delimited list exactly as
   * `searchSkusByProductType` carries it.
   */
  readonly productTypeID?: string | undefined;
}

/**
 * What `findSkus` returns: the matched SKUs plus the query surface that produced them.
 *
 * The joins `AND` keyword properties are reported rather than hidden so that the surface is
 * OBSERVABLE - which also makes it directly assertable by the net-new test tier.
 */
export interface SkuPage {
  /**
   * The matched SKUs, in the order the repository returned them.
   */
  readonly skus: readonly Sku[];

  /**
   * The term that was searched for, echoed back.
   */
  readonly keyword: string;
  readonly keywordProperties: typeof SKU_KEYWORD_PROPERTIES;
  readonly joins: typeof SKU_SMART_LIST_JOINS;
}

/**
 * The four association ID sets a SKU draft can carry at construction.
 *
 * LEGACY-NOTE [model/service/SkuService.cfc:L158, L161, L164, L187, L196]: the legacy calls
 * `setSubscriptionTerm`, `addSubscriptionBenefit`, `addRenewalSubscriptionBenefit` and
 * `addAccessContent` on a SKU it has already created.
 *
 * Module-local and not exported: this module exports one runtime value.
 */
type SkuDraftAssociations = Pick<
  SkuHydrationInput,
  'subscriptionTermID' | 'subscriptionBenefitIDs' | 'renewalSubscriptionBenefitIDs'
> &
  Pick<SkuHydrationInput, 'accessContentIDs'>;

/**
 * One accumulated validation failure, standing in for a `HibachiEntity` error entry.
 *
 * Module-local; see the `createSkus` note on error accumulation for why the failures cannot be
 * attached to the product.
 */
interface SkuCreationValidationFailure {
  /**
   * The property the legacy `addError` call names.
   */
  readonly propertyName: string;

  /**
   * The resource-bundle identifier, preserved verbatim.
   */
  readonly rbKey: string;
}

/**
 * The union of every value type `CreateSkusInput` can hold.
 */
type CreateSkusInputValue = CreateSkusInput[keyof CreateSkusInput];

/**
 * Reads a `string` field off the input struct with CFML's case-insensitive key semantics.
 *
 * CFML struct keys are case-insensitive and TypeScript's are not, so every `arguments.data.x` read
 * in the legacy body would have found a key written `X`.
 *
 * A key holding a non-string value answers `undefined` rather than being coerced.
 */
function readStringField(data: CreateSkusInput, key: string): string | undefined {
  const value: CreateSkusInputValue | undefined = structGet(data, key);

  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads a CFML-truthy field off the input struct with case-insensitive key semantics. Used only
 * for [model/service/SkuService.cfc:L181]'s `bundleContentAccess`.
 */
function readTruthyField(data: CreateSkusInput, key: string): CfTruthyInput {
  const value: CreateSkusInputValue | undefined = structGet(data, key);

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

/**
 * The three `baseProductType` values [model/service/SkuService.cfc:L61],
 * [model/service/SkuService.cfc:L139] and [model/service/SkuService.cfc:L173] dispatch on, exactly
 * as spelled in the source.
 */
const BASE_PRODUCT_TYPE_MERCHANDISE = 'merchandise';
const BASE_PRODUCT_TYPE_SUBSCRIPTION = 'subscription';
const BASE_PRODUCT_TYPE_CONTENT_ACCESS = 'contentAccess';

/**
 * The message [model/service/SkuService.cfc:L204] raises, verbatim.
 *
 * CFML parity [model/service/SkuService.cfc:L204]: the legacy statement is the bare form
 * `throw("There was an unexpected error when creating this product")`, so the string is the
 * message and there is no type, detail or error code to carry.
 */
const UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE =
  'There was an unexpected error when creating this product';

/**
 * Fields, and the first has been retired - see immediately below.
 *
 * LEGACY-NOTE [model/service/SkuService.cfc:L143, L148, L152, L176, L180]: the three `addError`
 * calls and the two `hasErrors()` gates are `HibachiEntity` error collection.
 *
 * Module-local and not exported: this module exports one runtime value.
 */
interface SkuCreationLedger {
  /**
   * The accumulated `addError` payloads, standing in for the product's error collection and gating
   * creation exactly as [model/service/SkuService.cfc:L152] and
   * [model/service/SkuService.cfc:L180] gate it.
   *
   * Leaving the invocation, which is why it does not need to.
   *
   * The resource-bundle identifiers are carried verbatim so a surfacing layer can use them
   * unchanged once an error-collection surface exists.
   */
  readonly validationFailures: SkuCreationValidationFailure[];
}

/**
 * The product code every skuCode formula concatenates, or a raise when it is absent.
 *
 * CFML parity [model/service/SkuService.cfc:L97, L133, L159, L184, L194]: all four formulas
 * concatenate `arguments.product.getProductCode()` with no null test, and a null reaching a CFML
 * string concatenation raises.
 *
 * @param product The product whose code prefixes the generated codes.
 * @param siteLocator The legacy locator of the formula that needed it.
 */
function requireProductCode(product: Product, siteLocator: string): string {
  const productCode = product.getProductCode();

  if (productCode === undefined) {
    throw new Error(
      `SkuService.createSkus: product '${product.getProductID()}' has no product code. ` +
        `[model/service/SkuService.cfc:${siteLocator}] concatenates getProductCode() with no ` +
        'null test, so the legacy raises here too.',
    );
  }

  return productCode;
}

/**
 * `data.price` as `Money`, read exactly as unguardedly as the legacy reads it.
 *
 * [model/service/SkuService.cfc:L183] and [model/service/SkuService.cfc:L193] all read
 * `arguments.data.price` with no `structKeyExists` test, which makes the field effectively
 * REQUIRED by omission - its absence raises in CFML.
 *
 * @param data The creation input.
 * @param siteLocator The legacy locator of the read being reproduced.
 */
function requirePrice(data: CreateSkusInput, siteLocator: string): Money {
  const rawPrice = readStringField(data, 'price');

  if (rawPrice === undefined) {
    throw new Error(
      'SkuService.createSkus: price is absent. ' +
        `[model/service/SkuService.cfc:${siteLocator}] reads arguments.data.price with no ` +
        'structKeyExists guard, so the legacy raises here. No default is substituted.',
    );
  }

  return Money.fromDecimalString(canonicalPlainDecimalNumeral(rawPrice));
}

/**
 * `data.listPrice` as `Money`, or `undefined` when the legacy's guard would drop it.
 *
 * [model/service/SkuService.cfc:L94] and [model/service/SkuService.cfc:L130] read
 * `structKeyExists(arguments.data, "listPrice") && isNumeric(arguments.data.listPrice) && arguments.data.listPrice > 0`.
 *
 * The comparison goes through `Money`, never a raw float compare (E4).
 *
 * @param data The creation input.
 * @returns The list price, or `undefined` when any clause fails.
 */
function resolveGuardedListPrice(data: CreateSkusInput): Money | undefined {
  // Clause 1 - existence.
  if (!structKeyExists(data, 'listPrice')) {
    return undefined;
  }

  const rawListPrice = readStringField(data, 'listPrice');

  // Clause 2 - CFML numeric. The `undefined` arm covers a key present with a non-string value,
  // which the typed contract forbids but a JSON boundary can produce; CFML's `isNumeric` would
  // answer false for it too.
  if (rawListPrice === undefined || !isNumeric(rawListPrice)) {
    return undefined;
  }

  const canonicalListPrice = canonicalPlainDecimalNumeral(rawListPrice);

  // The representability test described above. Exponent notation is the only CFML numeric form
  // that survives canonicalisation and that `Money` still rejects.
  if (canonicalListPrice.includes('e') || canonicalListPrice.includes('E')) {
    return undefined;
  }

  const listPrice = Money.fromDecimalString(canonicalListPrice);

  // Clause 3 - strictly greater than zero. A `listPrice` of exactly `0` is dropped.
  return listPrice.isGreaterThan(Money.zero) ? listPrice : undefined;
}

/**
 * The hydrated `Option` that an identifier drawn from `data.options` names.
 *
 * CFML parity [model/service/SkuService.cfc:L74]: `getOption(id)` was an ORM primary-key load, and
 * a `Sw*` identifier column compares under a case-folding collation, so the match folds case here
 * too.
 *
 * @param data The creation input, carrying the hydrated options.
 * @param optionID One identifier from the `options` comma-list.
 */
function resolveOptionByID(data: CreateSkusInput, optionID: string): Option {
  const resolvedOptions = data.resolvedOptions;

  if (resolvedOptions !== undefined) {
    for (const candidate of resolvedOptions) {
      if (cfEquals(candidate.getOptionID(), optionID)) {
        return candidate;
      }
    }
  }

  throw new Error(
    `SkuService.createSkus: option '${optionID}' is named in data.options but is absent from ` +
      'data.resolvedOptions. [model/service/SkuService.cfc:L74] loaded it through ' +
      "HibachiService's generic get<Entity>(primaryKey), which the thirteen-port set does not " +
      "carry, so hydration is the boundary's responsibility. An unresolved identifier raises, " +
      'exactly as the legacy raised at [L75] on the null the lookup returned.',
  );
}

/**
 * The canonical identity of one option combination, as a comparable string.
 *
 * @param options The options one SKU carries.
 * @returns The combination's key, or `''` when the SKU carries no options at all - which describes
 * no combination and is deliberately never matched.
 */
function optionSetKey(options: readonly Option[]): string {
  if (options.length === 0) {
    return '';
  }

  return [...options.map((option) => cfFoldKey(option.getOptionID()))].sort().join('\u0000');
}

/**
 * Every option combination the product ALREADY carries, as a set of keys.
 *
 * @param product The product whose live SKU array is read.
 * @returns The keys of the combinations already present.
 */
function snapshotExistingOptionSets(product: Product): ReadonlySet<string> {
  const keys = new Set<string>();

  for (const existingSku of product.getSkus()) {
    const key = optionSetKey(existingSku.getOptions());

    if (key !== '') {
      keys.add(key);
    }
  }

  return keys;
}

/**
 * One option drawn from each group, at that group's current odometer index.
 *
 * @param optionGroups Every supplied option, bucketed by option group, in payload order.
 * @param currentIndexesByKey Each group's current 1-based index into its bucket.
 * @returns The chosen options, in the order [model/service/SkuService.cfc:L106] visits their
 * groups.
 * @throws When a group has no current index, or its index is out of range.
 */
function selectCombinationOptions(
  optionGroups: ReadonlyMap<string, readonly Option[]>,
  currentIndexesByKey: ReadonlyMap<string, number>,
): Option[] {
  const chosen: Option[] = [];

  for (const [optionGroupID, groupOptions] of optionGroups) {
    const currentIndex = currentIndexesByKey.get(optionGroupID);

    if (currentIndex === undefined) {
      throw new Error(
        `SkuService.createSkus: no current index for option group '${optionGroupID}'. ` +
          '[model/service/SkuService.cfc:L107] reads currentIndexesByKey[key] for every ' +
          'key of optionGroups, which [L84] populated.',
      );
    }

    // [model/service/SkuService.cfc:L107] CFML arrays are 1-based, so the stored index maps to
    // `index - 1` here. Under `noUncheckedIndexedAccess` this read is `Option | undefined` and it
    // is NARROWED, never asserted away with `!`.
    const chosenOption = groupOptions[currentIndex - 1];

    if (chosenOption === undefined) {
      throw new Error(
        `SkuService.createSkus: option index ${String(currentIndex)} is out of range for ` +
          `option group '${optionGroupID}' (${String(groupOptions.length)} options). ` +
          '[model/service/SkuService.cfc:L107] indexes the group array directly, so the ' +
          'legacy raises here too.',
      );
    }

    chosen.push(chosenOption);
  }

  return chosen;
}

/**
 * The SKU half of Slatwall's catalog service surface.
 */
export class SkuService {
  /**
   * @param skuRepository The seven-member SKU data port.
   * @param imageStore The image stub port, reached only from `processImageUpload`.
   * @param subscriptionTermProvider The subscription stub port, reached only from the out-of-scope
   * subscription branch of `createSkus`.
   * @param maximumSkuCreationBatchSize The correctness bound on how many SKUs one `createSkus`
   * invocation will create.
   * @param imageSettingValues The already-resolved image-setting values every SKU draft this
   * service constructs carries forward.
   */
  public constructor(
    private readonly skuRepository: SkuRepository,
    private readonly imageStore: ImageStore,
    private readonly subscriptionTermProvider: SubscriptionTermProvider,
    private readonly maximumSkuCreationBatchSize: number = DEFAULT_MAXIMUM_SKU_CREATION_BATCH_SIZE,
    private readonly imageSettingValues?: SkuImageSettingValues,
  ) {
    // The bound is meaningless unless it is a positive whole number, and a misconfigured bound
    // would either refuse every invocation or bound nothing at all.
    if (!Number.isSafeInteger(maximumSkuCreationBatchSize) || maximumSkuCreationBatchSize < 1) {
      throw new Error(
        'SkuService: maximumSkuCreationBatchSize must be a positive safe integer; ' +
          `received ${String(maximumSkuCreationBatchSize)}.`,
      );
    }
  }

  /**
   * Creates the SKU set a newly configured product requires, dispatching on the product's base
   * product type.
   *
   * CFML parity [model/service/SkuService.cfc:L61]: the legacy chains
   * `getProductType().getBaseProductType()` with no null test on the product type, so a product
   * with no type raises there.
   *
   * @param product The product to attach the created SKUs to.
   * @param data The typed replacement for the legacy `struct`.
   * @returns Always `true`.
   */
  public async createSkus(product: Product, data: CreateSkusInput): Promise<boolean> {
    const productType: ProductType | undefined = product.getProductType();

    if (productType === undefined) {
      throw new Error(
        `SkuService.createSkus: product '${product.getProductID()}' has no product type. ` +
          '[model/service/SkuService.cfc:L61] chains getProductType().getBaseProductType() ' +
          'with no null test, so the legacy raises here too.',
      );
    }

    // `cfEquals` raises when either side is absent, which is what CFML does when a null reaches a
    // comparison.
    const baseProductType = await productType.getBaseProductType();

    const ledger: SkuCreationLedger = {
      validationFailures: [],
    };

    if (cfEquals(baseProductType, BASE_PRODUCT_TYPE_MERCHANDISE)) {
      this.createMerchandiseSkus(product, data, ledger);
    } else if (cfEquals(baseProductType, BASE_PRODUCT_TYPE_SUBSCRIPTION)) {
      await this.createSubscriptionSkus(product, data, ledger);
    } else if (cfEquals(baseProductType, BASE_PRODUCT_TYPE_CONTENT_ACCESS)) {
      this.createContentAccessSkus(product, data, ledger);
    } else {
      throw new Error(UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE);
    }
    return true;
  }

  // CreateSkus - merchandise branch [model/service/SkuService.cfc:L61-L136]

  /**
   * The merchandise arm: multiple SKUs when options were supplied, a single SKU when they were
   * not.
   *
   * CFML parity [model/service/SkuService.cfc:L64]: the gate is
   * `structKeyExists(arguments.data, "options") && len(arguments.data.options)`, and `len()`
   * applied to a comma-delimited LIST is a STRING-LENGTH test.
   */
  private createMerchandiseSkus(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): void {
    const optionIDList = readStringField(data, 'options');
    const hasOptions = structKeyExists(data, 'options') && cfLen(optionIDList) > 0;

    // The second conjunct is a compile-time narrowing of a condition the first already guarantees
    // `cfLen(undefined)` is 0, so `hasOptions` cannot hold while the list is absent.
    if (hasOptions && optionIDList !== undefined) {
      this.createMerchandiseSkusForOptionCombinations(product, data, ledger, optionIDList);
    } else {
      this.createSingleMerchandiseSku(product, data, ledger);
    }
  }

  /**
   * One SKU per combination of one option drawn from each option group.
   *
   * Ports [model/service/SkuService.cfc:L64-L122] - the cartesian-product path, and the most
   * delicate code in this file.
   *
   * CFML parity [model/service/SkuService.cfc:L75-L78]: the legacy keys `optionGroups` by
   * `optionGroupID` in a CFML struct, whose keys are case-insensitive.
   */
  private createMerchandiseSkusForOptionCombinations(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
    optionIDList: string,
  ): void {
    const productCode = requireProductCode(product, 'L97');

    // [model/service/SkuService.cfc:L66-L69]. Insertion-ordered structures throughout; see the
    // annotation on the grouping loop below.
    const optionGroups = new Map<string, Option[]>();
    const indexedKeys: string[] = [];
    const currentIndexesByKey = new Map<string, number>();
    let totalCombos = 1;

    // [model/service/SkuService.cfc:L73-L79] Bucket every supplied option under its option group,
    // in the order the comma-list names them.
    for (let i = 1; i <= listLen(optionIDList); i++) {
      // [model/service/SkuService.cfc:L74] 1-based, exactly as `listGetAt` is 1-based.
      const option = resolveOptionByID(data, listGetAt(optionIDList, i));

      // [model/service/SkuService.cfc:L75] The legacy chains
      // `option.getOptionGroup().getOptionGroupID()` with no null test, so an option with no group
      // raises there. Reproduced explicitly.
      const optionGroup: OptionGroup | undefined = option.getOptionGroup();

      if (optionGroup === undefined) {
        throw new Error(
          `SkuService.createSkus: option '${option.getOptionID()}' has no option group. ` +
            '[model/service/SkuService.cfc:L75] chains getOptionGroup().getOptionGroupID() ' +
            'with no null test, so the legacy raises here too.',
        );
      }

      const optionGroupID = optionGroup.getOptionGroupID();
      const bucket = optionGroups.get(optionGroupID);

      if (bucket === undefined) {
        // [model/service/SkuService.cfc:L76] then [model/service/SkuService.cfc:L78] - initialise
        // the bucket, then append into it.
        optionGroups.set(optionGroupID, [option]);
      } else {
        bucket.push(option);
      }
    }

    // [model/service/SkuService.cfc:L82] and [model/service/SkuService.cfc:L106] both iterate
    // `optionGroups` with `for(var key in optionGroups)`.
    for (const [optionGroupID, groupOptions] of optionGroups) {
      indexedKeys.push(optionGroupID);
      currentIndexesByKey.set(optionGroupID, 1);
      totalCombos = totalCombos * groupOptions.length;
    }

    // The bound is checked here, after `totalCombos` is known and before the creation loop makes
    // its first mutation. See `assertWithinCreationBound`.
    this.assertWithinCreationBound(totalCombos, product, 'L85');

    // Taken before the first attachment, and not updated as the loop runs. See
    // `snapshotExistingOptionSets` for why both of those are deliberate.
    const existingOptionSets = snapshotExistingOptionSets(product);
    for (let i = 1; i <= totalCombos; i++) {
      const newSku = this.newSkuDraft();

      // [model/service/SkuService.cfc:L93] Read unguarded, exactly as the legacy reads it. An
      // absent or unrepresentable price raises on the FIRST iteration, before
      // [model/service/SkuService.cfc:L100] has attached anything, so this raise cannot leave a
      // partial set.
      newSku.setPrice(requirePrice(data, 'L93'));
      const listPrice = resolveGuardedListPrice(data);

      if (listPrice !== undefined) {
        newSku.setListPrice(listPrice);
      }

      // Combination options are selected here, before the sku code is stamped: a deliberate
      // reordering of [model/service/SkuService.cfc:L100-L108].
      //
      // The two narrowing raises inside `selectCombinationOptions` consequently fire before the
      // code stamp rather than after it.
      const combinationOptions = selectCombinationOptions(optionGroups, currentIndexesByKey);

      // Combination the product already carried before this call was created by an earlier
      // invocation, so creating it again is not a new outcome - it is a duplicate.
      //
      // new-product path [model/service/ProductService.cfc:L275-L279] the product is `isNew()` and
      // carries no SKUs, so the snapshot is empty.
      if (!existingOptionSets.has(optionSetKey(combinationOptions))) {
        // CFML parity [model/service/SkuService.cfc:L97, L100]: the skuCode counter reads
        // `product.getSkus()` length, which this same loop mutates at
        // [model/service/SkuService.cfc:L100].
        const skuCode = `${productCode}-${product.getSkus().length + 1}`;

        this.assertSkuCodeAvailable(product, skuCode, 'L97');
        newSku.setSkuCode(skuCode);

        // [model/service/SkuService.cfc:L100] Parent to child. NOTE the asymmetry with every other
        // branch: this is the only site that links through `product.addSku(...)`, and this branch
        // never calls `setProduct`.
        product.addSku(newSku);

        // [model/service/SkuService.cfc:L101-L103] STRATEGY 1 of 5: first-wins, via a genuine null
        // test on the product's existing default.
        if (isNullish(product.getDefaultSku())) {
          product.setDefaultSku(newSku);
        }

        // [model/service/SkuService.cfc:L106-L108] One option from each group, in the order
        // [model/service/SkuService.cfc:L106] walks them - the selection itself now happens above,
        // before anything was stamped or attached.
        for (const chosenOption of combinationOptions) {
          newSku.addOption(chosenOption);
        }
      }

      // CFML parity [model/service/SkuService.cfc:L109, L118]: the carry loop has no bounds check
      // on `changeKeyIndex` against `arrayLen(indexedKeys)`.
      if (i < totalCombos) {
        let indexesUpdated = false;
        let changeKeyIndex = 1;

        // [model/service/SkuService.cfc:L112-L120] An odometer: advance the first group that has
        // room, resetting every group it passes.
        while (!indexesUpdated) {
          // [model/service/SkuService.cfc:L113] The unguarded read the
          // [model/service/SkuService.cfc:L109] guard protects. Narrowed rather than asserted; if
          // the narrow ever fails, this raises exactly as the CFML out-of-range read raises.
          const changeKey = indexedKeys[changeKeyIndex - 1];

          if (changeKey === undefined) {
            throw new Error(
              `SkuService.createSkus: carry index ${String(changeKeyIndex)} is out of range ` +
                `for ${String(indexedKeys.length)} option groups. ` +
                '[model/service/SkuService.cfc:L118] increments changeKeyIndex with no bounds ' +
                'check, and [L113] then reads indexedKeys out of range. Reaching this means ' +
                'the load-bearing [L109] guard was bypassed.',
            );
          }

          const changeGroupOptions = optionGroups.get(changeKey);
          const changeGroupIndex = currentIndexesByKey.get(changeKey);

          if (changeGroupOptions === undefined || changeGroupIndex === undefined) {
            throw new Error(
              `SkuService.createSkus: option group '${changeKey}' is missing from the ` +
                'combination state. [model/service/SkuService.cfc:L113] reads both ' +
                'optionGroups[key] and currentIndexesByKey[key] for every key [L83] snapshotted.',
            );
          }

          if (changeGroupIndex < changeGroupOptions.length) {
            currentIndexesByKey.set(changeKey, changeGroupIndex + 1);
            indexesUpdated = true;
          } else {
            // [model/service/SkuService.cfc:L117-L118] Reset this group and carry into the next
            // one.
            currentIndexesByKey.set(changeKey, 1);
            changeKeyIndex++;
          }
        }
      }
    }
  }

  /**
   * The single-SKU merchandise path, taken when no options were supplied.
   *
   * The skuCode is the hardcoded `-1` [model/service/SkuService.cfc:L133], not a counter.
   */
  private createSingleMerchandiseSku(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): void {
    const productCode = requireProductCode(product, 'L133');

    // [model/service/SkuService.cfc:L133] The code is a pure function of the product code, so it
    // is known before anything is constructed - which is what lets this path reconcile at all.
    const skuCode = `${productCode}-1`;

    // HARDCODED `-1`, so a repeat of this call regenerates a code the product already carries and
    // the legacy attaches a second SKU under it.
    //
    // Links the SKU to the product before [model/service/SkuService.cfc:L133] stamps it, so a
    // verdict reached after construction would arrive too late to avoid attaching.
    if (this.skuCodeAlreadyCarried(product, skuCode)) {
      requirePrice(data, 'L129');

      return;
    }
    const thisSku = this.newSkuDraft();

    // [model/service/SkuService.cfc:L128] Child to parent.
    thisSku.setProduct(product);

    // [model/service/SkuService.cfc:L129] Unguarded, as at [model/service/SkuService.cfc:L93].
    thisSku.setPrice(requirePrice(data, 'L129'));
    const listPrice = resolveGuardedListPrice(data);

    if (listPrice !== undefined) {
      thisSku.setListPrice(listPrice);
    }

    // [model/service/SkuService.cfc:L133] sku-code formula 2 of 4: hardcoded `-1`, no counter.
    thisSku.setSkuCode(skuCode);

    // [model/service/SkuService.cfc:L134] STRATEGY 2 of 5: unconditional. No `isNull` test, no
    // loop-index test - this branch overwrites whatever default the product already carried.
    product.setDefaultSku(thisSku);
  }

  // CreateSkus - subscription branch [model/service/SkuService.cfc:L139-L170]

  /**
   * The subscription arm: one SKU per subscription term.
   *
   * Subscription business logic is excluded, so this is a thin path over the
   * `subscriptionTermProvider` STUB port.
   *
   * CFML parity [model/service/SkuService.cfc:L142, L147, L175]: all three of these gates use the
   * compound predicate `!structKeyExists(...) || !listLen(...)`, and `!listLen(...)` is a bare
   * numeric truthiness test.
   */
  private async createSubscriptionSkus(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): Promise<void> {
    const productCode = requireProductCode(product, 'L159');
    const subscriptionBenefitsList = readStringField(data, 'subscriptionBenefits');
    const hasSubscriptionBenefits =
      structKeyExists(data, 'subscriptionBenefits') &&
      subscriptionBenefitsList !== undefined &&
      listLen(subscriptionBenefitsList) > 0;

    if (!hasSubscriptionBenefits) {
      // [model/service/SkuService.cfc:L143] The resource-bundle identifier is a DATA CONTRACT and
      // is preserved character for character, misspelling included. No i18n runtime is introduced;
      // it is a plain string constant.
      ledger.validationFailures.push({
        propertyName: 'subscriptionBenefits',
        rbKey: RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED,
      });
    }
    const subscriptionTermsList = readStringField(data, 'subscriptionTerms');
    const hasSubscriptionTerms =
      structKeyExists(data, 'subscriptionTerms') &&
      subscriptionTermsList !== undefined &&
      listLen(subscriptionTermsList) > 0;

    if (!hasSubscriptionTerms) {
      ledger.validationFailures.push({
        propertyName: 'subscriptionTerms',
        rbKey: RB_KEY_SUBSCRIPTION_TERMS_REQUIRED,
      });
    }

    // [model/service/SkuService.cfc:L152] The two trailing conjuncts are compile-time narrowings
    // of what the first already guarantees: no failure can have been skipped while either list is
    // absent. They add no runtime guard (B5).
    if (
      ledger.validationFailures.length > 0 ||
      subscriptionTermsList === undefined ||
      subscriptionBenefitsList === undefined
    ) {
      return;
    }

    const plannedSkuCount = listLen(subscriptionTermsList);

    this.assertWithinCreationBound(plannedSkuCount, product, 'L153');
    for (let i = 1; i <= plannedSkuCount; i++) {
      // [model/service/SkuService.cfc:L158] The legacy passes `getSubscriptionTerm(...)`'s result
      // straight into a setter, so an identifier that does not resolve puts a null into a CFML
      // argument list and raises. Reproduced.
      const subscriptionTermID = listGetAt(subscriptionTermsList, i);
      const termHandle =
        await this.subscriptionTermProvider.getSubscriptionTerm(subscriptionTermID);

      if (termHandle === undefined) {
        throw new Error(
          `SkuService.createSkus: subscription term '${subscriptionTermID}' did not resolve. ` +
            '[model/service/SkuService.cfc:L158] passes the lookup result directly to ' +
            'setSubscriptionTerm, so the legacy raises on a null there too.',
        );
      }
      const subscriptionBenefitIDs = await this.resolveSubscriptionBenefitIDs(
        subscriptionBenefitsList,
        'L161',
      );

      // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits` is
      // iterated with no `structKeyExists` guard, unlike `subscriptionBenefits` at L142 and
      // `subscriptionTerms` at L147, and `model/validation/Product.json` never mentions it either,
      // so its absence raises. The field is typed optional so that absence is representable and the
      // read below raises rather than defaulting to an empty list.
      // Preserved deliberately; do not fix without a product decision.
      const renewalSubscriptionBenefitsList = readStringField(data, 'renewalSubscriptionBenefits');

      if (renewalSubscriptionBenefitsList === undefined) {
        throw new Error(
          'SkuService.createSkus: renewalSubscriptionBenefits is absent. ' +
            '[model/service/SkuService.cfc:L163] iterates it with no structKeyExists guard - ' +
            'unlike subscriptionBenefits [L142] and subscriptionTerms [L147] - and it is never ' +
            'validated, so the legacy raises here. Preserved deliberately.',
        );
      }
      const renewalSubscriptionBenefitIDs = await this.resolveSubscriptionBenefitIDs(
        renewalSubscriptionBenefitsList,
        'L164',
      );

      // [model/service/SkuService.cfc:L154] Constructed with its associations; see the note above
      // on why.
      const thisSku = this.newSkuDraft({
        subscriptionTermID: termHandle.subscriptionTermID,
        subscriptionBenefitIDs,
        renewalSubscriptionBenefitIDs,
      });

      // [model/service/SkuService.cfc:L155] Child to parent, and before the code stamp - see the
      // skuCode note below.
      thisSku.setProduct(product);

      // [model/service/SkuService.cfc:L156-L157] one value, two properties. `renewalPrice` is set
      // from `data.price`, not from a separate renewal input, which is why `CreateSkusInput` has
      // no `renewalPrice` member.
      const price = requirePrice(data, 'L156');

      thisSku.setPrice(price);
      thisSku.setRenewalPrice(price);

      // CFML parity [model/service/SkuService.cfc:L155, L159]: sku-code formula 1 of 4 again -
      // `arrayLen(product.getSkus()) + 1` - but with the statements in the opposite order to the
      // merchandise path.
      const skuCode = `${productCode}-${product.getSkus().length + 1}`;

      this.assertSkuCodeAvailable(product, skuCode, 'L159');
      thisSku.setSkuCode(skuCode);

      // [model/service/SkuService.cfc:L166-L168] STRATEGY 3 of 5: a loop-index test, not a null
      // test and not unconditional. It overwrites any existing default, unlike
      // [model/service/SkuService.cfc:L101].
      if (i === 1) {
        product.setDefaultSku(thisSku);
      }
    }
  }

  /**
   * Resolves a comma-delimited list of subscription-benefit identifiers to the identifiers of the
   * handles they name.
   */
  private async resolveSubscriptionBenefitIDs(
    subscriptionBenefitIDList: string,
    siteLocator: string,
  ): Promise<string[]> {
    const resolved: string[] = [];

    for (let b = 1; b <= listLen(subscriptionBenefitIDList); b++) {
      const subscriptionBenefitID = listGetAt(subscriptionBenefitIDList, b);
      const handle: SubscriptionBenefitHandle | undefined =
        await this.subscriptionTermProvider.getSubscriptionBenefit(subscriptionBenefitID);

      if (handle === undefined) {
        throw new Error(
          `SkuService.createSkus: subscription benefit '${subscriptionBenefitID}' did not ` +
            `resolve. [model/service/SkuService.cfc:${siteLocator}] passes the lookup result ` +
            'directly to the add method, so the legacy raises on a null there too.',
        );
      }

      resolved.push(handle.subscriptionBenefitID);
    }

    return resolved;
  }

  // CreateSkus - contentAccess branch [model/service/SkuService.cfc:L173-L202]

  /**
   * The contentAccess arm: either one bundled SKU holding every access content, or one SKU per
   * content.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L173-L202]: the contentAccess branch is out of
   * scope.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L173]: branches on `baseProductType`
   * `"contentAccess"`, a value `model/validation/Product.json`'s `inList` constraint does not
   * permit - that constraint admits exactly `merchandise` and `subscription`.
   */
  private createContentAccessSkus(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): void {
    const productCode = requireProductCode(product, 'L184');
    const accessContentsList = readStringField(data, 'accessContents');
    const hasAccessContents =
      structKeyExists(data, 'accessContents') &&
      accessContentsList !== undefined &&
      listLen(accessContentsList) > 0;

    if (!hasAccessContents) {
      ledger.validationFailures.push({
        propertyName: 'accessContents',
        rbKey: RB_KEY_ACCESS_CONTENTS_REQUIRED,
      });
    }

    // [model/service/SkuService.cfc:L180] The trailing conjunct is the same compile-time narrowing
    // as [model/service/SkuService.cfc:L152]'s.
    if (ledger.validationFailures.length > 0 || accessContentsList === undefined) {
      return;
    }

    // [model/service/SkuService.cfc:L181] Existence, and then a BARE TRUTHINESS test on the value
    // itself - which is why `bundleContentAccess` is typed as CFML-truthy input rather than
    // `boolean`.
    const bundleContentAccess =
      structKeyExists(data, 'bundleContentAccess') &&
      cfTruthy(readTruthyField(data, 'bundleContentAccess'));

    if (bundleContentAccess) {
      // [model/service/SkuService.cfc:L182-L189] one SKU holding every access content.
      this.assertWithinCreationBound(1, product, 'L182');

      const accessContentIDs: string[] = [];
      for (let c = 1; c <= listLen(accessContentsList); c++) {
        accessContentIDs.push(listGetAt(accessContentsList, c));
      }
      const newSku = this.newSkuDraft({ accessContentIDs });

      // [model/service/SkuService.cfc:L183] Unguarded, as at [model/service/SkuService.cfc:L93].
      newSku.setPrice(requirePrice(data, 'L183'));

      // [model/service/SkuService.cfc:L184] sku-code formula 2 of 4 again: hardcoded `-1`.
      const skuCode = `${productCode}-1`;

      this.assertSkuCodeAvailable(product, skuCode, 'L184');
      newSku.setSkuCode(skuCode);

      // [model/service/SkuService.cfc:L185] Child to parent, and after the code stamp - the
      // opposite order to the subscription branch, which is immaterial here only because the code
      // is hardcoded and reads nothing.
      newSku.setProduct(product);

      // [model/service/SkuService.cfc:L189] STRATEGY 4 of 5: unconditional, like
      // [model/service/SkuService.cfc:L134] and unlike [model/service/SkuService.cfc:L197].
      product.setDefaultSku(newSku);
    } else {
      // [model/service/SkuService.cfc:L191-L200] one sku per content.
      const plannedSkuCount = listLen(accessContentsList);

      this.assertWithinCreationBound(plannedSkuCount, product, 'L191');

      for (let c = 1; c <= plannedSkuCount; c++) {
        // [model/service/SkuService.cfc:L196] One content per SKU, in list order.
        const accessContentID = listGetAt(accessContentsList, c);
        const newSku = this.newSkuDraft({ accessContentIDs: [accessContentID] });

        // [model/service/SkuService.cfc:L193] Unguarded, as at [model/service/SkuService.cfc:L93].
        // Note that neither contentAccess sub-branch has any listPrice handling, unlike
        // [model/service/SkuService.cfc:L94] and [model/service/SkuService.cfc:L130].
        newSku.setPrice(requirePrice(data, 'L193'));

        // [model/service/SkuService.cfc:L194] sku-code formula 4 of 4: the loop counter, `-#c#`.
        // Not the array length, not a hardcoded `-1`.
        const skuCode = `${productCode}-${String(c)}`;

        this.assertSkuCodeAvailable(product, skuCode, 'L194');
        newSku.setSkuCode(skuCode);
        newSku.setProduct(product);

        // [model/service/SkuService.cfc:L197-L199] STRATEGY 5 of 5: a loop-index test on `c`,
        // mirroring [model/service/SkuService.cfc:L166]'s test on `i` but in a branch whose
        // sibling [model/service/SkuService.cfc:L189] is unconditional.
        if (c === 1) {
          product.setDefaultSku(newSku);
        }
      }
    }
  }

  /**
   * Hands an uploaded image to the image store at the SKU's image path.
   *
   * CFML parity [model/service/SkuService.cfc:L213-L217]:
   * `if(imageSaved) { return true; } else { return false; }` is an identity conditional.
   *
   * @param sku The SKU whose image path the upload is written to, and the value returned.
   * @param result The upload descriptor, shaped by the image port.
   * @returns The same SKU instance, unmodified - this method writes nothing to it.
   */
  public async processImageUpload(sku: Sku, result: ImageUploadResult): Promise<Sku> {
    const imagePath: string = sku.getImagePath();

    // [model/service/SkuService.cfc:L212] and [model/service/SkuService.cfc:L213-L217], collapsed.
    // Awaited so a rejection still surfaces; the boolean it resolves to is the unread value the
    // docblock accounts for.
    await this.imageStore.saveImageFile(result, imagePath, ALLOWED_IMAGE_EXTENSIONS);

    return sku;
  }

  // GetProductSkus [model/service/SkuService.cfc:L220-L244] and getSortedProductSkus
  // [model/service/SkuService.cfc:L246-L269]

  /**
   * A product's SKUs, optionally in option-group sort order.
   *
   * CFML parity [model/service/SkuService.cfc:L223]: `arrayLen(skus[1].getOptions())` reads index
   * 1 with no guard of its own - it is safe only because `arrayLen(skus) gt 1` short-circuits
   * first.
   *
   * @param product The product whose SKUs are wanted.
   * @param sorted Whether to apply the option-group sort order.
   * @param fetchOptions Whether the repository should materialise each SKU's options.
   * @returns The SKUs.
   */
  public async getProductSkus(
    product: Product,
    sorted: boolean,
    fetchOptions = false,
  ): Promise<Sku[]> {
    const skus = await this.skuRepository.getProductSkus(product, fetchOptions);

    // [model/service/SkuService.cfc:L223] The narrowed index-1 read the short-circuit protects.
    const firstSku = skus[0];

    if (sorted && skus.length > 1 && firstSku !== undefined && firstSku.getOptions().length > 0) {
      // [model/service/SkuService.cfc:L224] Keyword-style in the legacy.
      const sortedSkuIDs = await this.skuRepository.getSortedProductSkusID(product.getProductID());

      // [model/service/SkuService.cfc:L225-L240] then [model/service/SkuService.cfc:L243] - the
      // legacy assigns the merged array back over `skus` and returns that; returning it directly
      // is identical.
      return this.mergeIntoSortOrder(skus, sortedSkuIDs, 'L236-L237', product.getProductID());
    }

    // [model/service/SkuService.cfc:L243] The unsorted path answers the repository's array
    // unchanged.
    return skus;
  }

  /**
   * A product's already-materialised SKUs, in option-group sort order.
   *
   * [model/service/SkuService.cfc:L268] returns `sortedArrayReturn`, where
   * [model/service/SkuService.cfc:L240] assigned it back over `skus` first.
   *
   * @param product The product whose SKUs are wanted.
   * @returns Fewer than two SKUs: the product's live array.
   */
  public async getSortedProductSkus(product: Product): Promise<Sku[]> {
    // [model/service/SkuService.cfc:L247] the entity, not the repository.
    const skus = product.getSkus();
    if (skus.length < 2) {
      return skus;
    }

    // [model/service/SkuService.cfc:L252] Positional in the legacy, where
    // [model/service/SkuService.cfc:L224] is keyword-style.
    const sortedSkuIDs = await this.skuRepository.getSortedProductSkusID(product.getProductID());
    return this.mergeIntoSortOrder(skus, sortedSkuIDs, 'L264-L265', product.getProductID());
  }

  /**
   * Places each SKU at the position its identifier occupies in the sorted-ID result.
   *
   * @param skus The SKUs to place.
   * @param sortedSkuIDs The ordered identifiers, one per query row.
   * @param siteLocator Which of the two duplicated sites this call reproduces.
   * @param productID The product being sorted, carried for the failure message only.
   * @throws SkuSortOrderError When the sorted-ID result is longer than the SKUs can fill, so a
   * dense `Sku[]` cannot be produced.
   */
  private mergeIntoSortOrder(
    skus: readonly Sku[],
    sortedSkuIDs: readonly string[],
    siteLocator: string,
    productID: string,
  ): Sku[] {
    // [model/service/SkuService.cfc:L228-L230] / [model/service/SkuService.cfc:L256-L258] The
    // query's `skuID` column, walked positionally into a flat array. The port already hands back
    // that column as an ordered list, so the positional walk is a copy.
    const sortedArray: string[] = [...sortedSkuIDs];

    // [model/service/SkuService.cfc:L232] / [model/service/SkuService.cfc:L260] `arrayResize` to
    // the QUERY row count - the source of the holes.
    const sortedArrayReturn: (Sku | undefined)[] = new Array<Sku | undefined>(sortedArray.length);

    // [model/service/SkuService.cfc:L234-L238] / [model/service/SkuService.cfc:L262-L266]
    for (let i = 1; i <= skus.length; i++) {
      const sku = skus[i - 1];

      if (sku === undefined) {
        throw new Error(
          `SkuService.mergeIntoSortOrder: no SKU at position ${String(i)} of ${String(skus.length)}.`,
        );
      }
      const skuID = sku.getSkuID();

      // LEGACY-DEFECT [model/service/SkuService.cfc:L236-L237]: `arrayFind` answers 0 when the
      // skuID is absent from the sorted-ID query and the 1-based assignment then raises, while
      // `arrayResize` sizes the result to the query row count and leaves null holes.
      // LEGACY-DEFECT [model/service/SkuService.cfc:L264-L265]: the identical unguarded
      // `arrayFind`-as-index and `arrayResize` behaviour, duplicated from L236-L237 - the plan cites
      // the first site only, and both are annotated here because both exist.
      // Preserved deliberately; do not fix without a product decision.
      //
      // `arrayFind` is 1-based, case-sensitive and answers 0 on a miss, so `indexOf` plus one
      // reproduces all three properties.
      const index = sortedArray.indexOf(skuID) + 1;

      if (index === 0) {
        throw new Error(
          `SkuService.getProductSkus: sku '${skuID}' is absent from the sorted-ID result, so ` +
            `arrayFind answered 0. [model/service/SkuService.cfc:${siteLocator}] then assigns ` +
            'to index 0 of a 1-based array, which raises. Reproduced deliberately.',
        );
      }

      // [model/service/SkuService.cfc:L237] / [model/service/SkuService.cfc:L265]
      sortedArrayReturn[index - 1] = sku;
    }

    // The dense fill, built by NARROWING each slot rather than asserting the array.
    const densePlacement: Sku[] = [];
    const unfilledPositions: number[] = [];

    for (const [position, placed] of sortedArrayReturn.entries()) {
      if (placed === undefined) {
        unfilledPositions.push(position);

        continue;
      }

      densePlacement.push(placed);
    }

    if (unfilledPositions.length !== 0) {
      throw new SkuSortOrderError(
        productID,
        sortedArrayReturn.length,
        skus.length,
        unfilledPositions,
        siteLocator,
      );
    }

    return densePlacement;
  }

  // SearchSkusByProductType [model/service/SkuService.cfc:L271-L273] and the DAO pass-throughs
  // [model/service/SkuService.cfc:L281-L291]

  /**
   * SKUs matching a search term, optionally narrowed to product types.
   *
   * Neither parameter is `required` in the legacy, so neither is required here.
   *
   * CFML parity [model/dao/SkuDAO.cfc:L130]: this port takes singular `productTypeID`, while
   * `productRepository.searchProductsByProductType` takes plural `productTypeIDs`.
   */
  public async searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
    return this.skuRepository.searchSkusByProductType(term, productTypeID);
  }

  /**
   * Whether a SKU's stock records may be deleted.
   *
   * LEGACY-DEFECT [model/service/SkuService.cfc:L281-L283]: delegates to
   * `getSkuDAO().getSkuStocksDeletableFlag`, which does not exist on `SkuDAO`, is absent from
   * `org/Hibachi/`.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param skuID The SKU whose stock records were asked about.
   */
  public async getSkuStocksDeletableFlag(skuID: string): Promise<boolean> {
    // The rejection is returned rather than thrown so that the method stays a genuinely
    // asynchronous member of the surface: a `throw` in an `async` body with no `await` is a lint
    // error.
    return Promise.reject(
      new Error(
        `SkuService.getSkuStocksDeletableFlag('${skuID}') is unreachable. ` +
          '[model/service/SkuService.cfc:L282] delegates to SkuDAO.getSkuStocksDeletableFlag, ' +
          'which does not exist on SkuDAO, is absent from org/Hibachi/, and cannot be ' +
          'dynamically dispatched because HibachiDAO declares no onMissingMethod. The legacy ' +
          'raises unconditionally; that raise is reproduced.',
      ),
    );
  }

  /**
   * Whether any order transaction exists against the SKUs in question.
   *
   * CFML parity [model/service/SkuService.cfc:L286]: the method declares no parameters yet
   * forwards `argumentCollection=arguments` to the DAO.
   *
   * "so the DAO receives neither of its two optional filters.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    return this.skuRepository.getTransactionExistsFlag();
  }

  /**
   * The SKU carrying a given code.
   *
   * `skuCode` is not `required` in the legacy signature, so it is optional here.
   */
  public async getSkuBySkuCode(skuCode?: string): Promise<Sku | undefined> {
    if (skuCode === undefined) {
      return Promise.reject(
        new Error(
          'SkuService.getSkuBySkuCode: skuCode is absent. [model/service/SkuService.cfc:L290] ' +
            'forwards argumentCollection=arguments into [model/dao/SkuDAO.cfc:L102], which ' +
            'declares `required string skuCode` and raises. Reproduced.',
        ),
      );
    }
    return this.skuRepository.getSkuBySkuCode(skuCode);
  }

  // FindSkus [model/service/SkuService.cfc:L309-L325] - the renamed smart list.

  /**
   * SKUs matching a keyword, with the query surface of the statement that ran.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L309-L325]: `getSkuSmartList` is renamed to
   * `findSkus` and reshaped into a typed repository query.
   *
   * @param criteria The typed replacement for the smart list's dynamic filter surface.
   * @returns The matched SKUs plus the query surface of the statement that produced them.
   */
  public async findSkus(criteria: SkuQueryCriteria): Promise<SkuPage> {
    // [model/service/SkuService.cfc:L312] through [model/service/SkuService.cfc:L324], expressed
    // as the one query the port publishes.
    const skus = await this.skuRepository.searchSkusByProductType(
      criteria.keyword,
      criteria.productTypeID,
    );

    return {
      skus,
      keyword: criteria.keyword,
      keywordProperties: SKU_KEYWORD_PROPERTIES,
      joins: SKU_SMART_LIST_JOINS,
    };
  }

  // Construction and the correctness bounds.

  /**
   * A new, unpersisted SKU draft.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L92, L127, L154, L182, L192]: `this.newSku()` is
   * `HibachiService`'s dynamic `new<Entity>()` factory, reached at five sites.
   *
   * @param associations The four association identifier sets the branch has resolved, attached at
   * construction because the entity publishes no mutators for them.
   */
  private newSkuDraft(associations: SkuDraftAssociations = {}): Sku {
    return new Sku({
      skuID: createHibachiShapedIdentifier(),
      isNew: true,
      skuRepository: this.skuRepository,
      ...(this.imageSettingValues === undefined
        ? {}
        : { imageSettingValues: this.imageSettingValues }),
      ...associations,
    });
  }

  /**
   * Refuses an invocation that would create more SKUs than the configured bound allows, before the
   * first SKU is attached.
   *
   * @param plannedSkuCount How many SKUs this branch is about to create.
   * @param product The product being populated, named in the refusal.
   * @param siteLocator The legacy locator whose count this bounds.
   */
  private assertWithinCreationBound(
    plannedSkuCount: number,
    product: Product,
    siteLocator: string,
  ): void {
    if (plannedSkuCount > this.maximumSkuCreationBatchSize) {
      throw new Error(
        `SkuService.createSkus: product '${product.getProductID()}' would create ` +
          `${String(plannedSkuCount)} SKUs, above the configured bound of ` +
          `${String(this.maximumSkuCreationBatchSize)}. ` +
          `[model/service/SkuService.cfc:${siteLocator}] computes this count as the product of ` +
          'every option group size and bounds it nowhere. Refused before anything was ' +
          'attached, so the product is unchanged.',
      );
    }
  }

  /**
   * Whether the product already carries a SKU under this code.
   *
   * `Product.skus` is `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73], so that array
   * is the SKU set this product will hold after the caller's save.
   *
   * @param product The product whose existing SKUs are read.
   * @param skuCode The code about to be stamped.
   * @returns `true` when a sibling already carries it.
   */
  private skuCodeAlreadyCarried(product: Product, skuCode: string): boolean {
    const foldedSkuCode = cfFoldKey(skuCode);

    return product.getSkus().some((existingSku) => {
      const existingSkuCode = existingSku.getSkuCode();

      return existingSkuCode !== undefined && cfFoldKey(existingSkuCode) === foldedSkuCode;
    });
  }

  /**
   * Refuses to attach a SKU whose generated code the product already carries.
   *
   * @param product The product whose existing SKUs are checked.
   * @param skuCode The code about to be stamped.
   * @param siteLocator The legacy locator of the formula that produced it.
   */
  private assertSkuCodeAvailable(product: Product, skuCode: string, siteLocator: string): void {
    if (this.skuCodeAlreadyCarried(product, skuCode)) {
      throw new Error(
        `SkuService.createSkus: product '${product.getProductID()}' already carries a SKU coded ` +
          `'${skuCode}'. [model/service/SkuService.cfc:${siteLocator}] regenerates that code on ` +
          'every invocation, so continuing would attach a duplicate that ' +
          '[model/entity/Sku.cfc:L54] declares unique. Refused before anything was attached.',
      );
    }
  }
}
