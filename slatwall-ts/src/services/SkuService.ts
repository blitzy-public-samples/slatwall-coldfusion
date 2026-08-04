/*
 * SkuService — the Catalog's SKU service, ported from `model/service/SkuService.cfc`.
 *
 * The nine declared public members are reproduced by name, arity and argument order (TR-1), plus the one
 * member the legacy fabricated at run time and this port must declare explicitly (IR-1).
 *
 * Why this is the highest-risk file in the slice. `createSkus` (`model/service/SkuService.cfc:L58-L208`)
 * is the largest single business rule in the Catalog, and three of its properties can change silently
 * under a well-intentioned rewrite: the three-way discriminator, the odometer enumeration ORDER, and the
 * order in which SKU validation observes its freshly created siblings (AAP §0.6.2). None of the three
 * produces a compile error when it drifts, so each is pinned at the site where the judgment was made,
 * per AAP §0.8.2 guideline 6.
 */

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

/* The three base product type discriminators. */

const MERCHANDISE_BASE_PRODUCT_TYPE = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode;

const SUBSCRIPTION_BASE_PRODUCT_TYPE = SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode;

const CONTENT_ACCESS_BASE_PRODUCT_TYPE =
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode;

/* Data keys read by `createSkus` */

/** Read unguarded at [model/service/SkuService.cfc:L93], [:L129], [:L156], [:L183] and [:L193]. */
const PRICE_DATA_KEY = 'price';

/**
 * Read guarded at [model/service/SkuService.cfc:L94] and [:L130] — exists, numeric and above zero.
 */
const LIST_PRICE_DATA_KEY = 'listPrice';

/** Read guarded at [model/service/SkuService.cfc:L64] — exists and non-empty. */
const OPTIONS_DATA_KEY = 'options';

/** Read guarded at [model/service/SkuService.cfc:L142], then iterated at [:L160]. */
const SUBSCRIPTION_BENEFITS_DATA_KEY = 'subscriptionBenefits';

/** Read guarded at [model/service/SkuService.cfc:L147], then iterated at [:L153]. */
const SUBSCRIPTION_TERMS_DATA_KEY = 'subscriptionTerms';

/** Read unguarded at [model/service/SkuService.cfc:L163] — the parity hazard carried below. */
const RENEWAL_SUBSCRIPTION_BENEFITS_DATA_KEY = 'renewalSubscriptionBenefits';

/** Read guarded at [model/service/SkuService.cfc:L175], then iterated at [:L186] and [:L191]. */
const ACCESS_CONTENTS_DATA_KEY = 'accessContents';

/** Read guarded at [model/service/SkuService.cfc:L181] — exists and reads as boolean true. */
const BUNDLE_CONTENT_ACCESS_DATA_KEY = 'bundleContentAccess';

/** The validation context every SKU created here is validated in. */
const SKU_SAVE_CONTEXT: ValidationContext = 'save';

/**
 * `arguments.product.addError("subscriptionBenefits", …)` — [model/service/SkuService.cfc:L143].
 */
const SUBSCRIPTION_BENEFITS_ERROR_PROPERTY = 'subscriptionBenefits';

/** `arguments.product.addError("subscriptionTerms", …)` — [model/service/SkuService.cfc:L148]. */
const SUBSCRIPTION_TERMS_ERROR_PROPERTY = 'subscriptionTerms';

/** `arguments.product.addError("accessContents", …)` — [model/service/SkuService.cfc:L176]. */
const ACCESS_CONTENTS_ERROR_PROPERTY = 'accessContents';

const SKU_CODE_SEGMENT_DELIMITER = '-';

const FIRST_SKU_CODE_SUFFIX = 1;

/**
 * CFML's default list delimiter, used by every `listLen` / `listGetAt` / `listToArray` call here.
 */
const CFML_LIST_DELIMITER = ',';

const FIRST_ORDINAL = 1;

/** The odometer's starting index, expressed 0-based. */
const FIRST_OPTION_INDEX = 0;

/**
 * The first position of a 0-based loop, standing in for the legacy `i == 1` and `c == 1` tests at
 * [model/service/SkuService.cfc:L166] and [:L197] — the two places a branch elects its default SKU.
 */
const FIRST_ARRAY_INDEX = 0;

/*
 * The image-write name gate (CWE-22, CWE-434). Do not justify this gate by analogy with D18: AAP §0.6.7.7
 * names one divergence by locator, and AAP §0.1.2.1 forbids reading the plan as licensing a class of them.
 * Reaching a second exception by resemblance to the first is exactly the
 * reinterpretation §0.1.2.1 excludes.
 */

/**
 * The one shape [model/entity/Sku.cfc:L131-L139] can produce: one safe segment, one dot, one extension.
 */
const GENERATED_IMAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

/**
 * Decides whether a stored image file name is one the legacy's own generator could have produced.
 *
 * @param imageFile - the value stored in the `SwSku.imageFile` column [model/entity/Sku.cfc:L58].
 * @returns true when the name is a single generator-shaped segment, false for every other shape.
 */
function isGeneratedImageFileName(imageFile: string): boolean {
  return GENERATED_IMAGE_FILE_NAME_PATTERN.test(imageFile);
}

/* Smart list selection — owned by `../ports/SmartListQueryPort`, not restated here. */

/* Smart list input key grammar — owned by the shared translator, not restated here. */

/* Boundary types. */

/** A SKU that also carries the framework-owned surface the validation engine requires. */
export type ManagedSku = Sku & Parameters<typeof resolveSkuUniqueTarget>[0];

/** A product that also carries the framework-owned error surface `createSkus` writes to. */
export type ProductWithErrorState = Product & EntityErrorSurface;

/** A SKU that carries its own error surface, so validation findings land on the SKU. */
export type SkuWithErrorState = ManagedEntity<Sku>;

/** The one validation capability this service needs, expressed over the domain SKU. */
export interface SkuSaveValidator {
  readonly validate: (
    sku: ManagedSku,
    ruleSet: ValidationRuleSet<ManagedSku>,
    context: ValidationContext,
    options?: ValidateOptions,
  ) => Promise<ValidationError>;
}

/*
 * The merchandise enumeration is bounded (CWE-400) by two clauses, both in force. Clause a is an
 * unconditional checked multiplication inside
 * {@link multiplyCombinationCount}, which refuses an enumeration whose size cannot be represented exactly.
 * Clause B is a required, fail-closed {@link SkuCombinationBudget} resolver consulted before the first
 * `newSku`. neither authors a figure; clause B names the variable an operator must set.
 */

/**
 * The work ceiling one merchandise `createSkus` request may not exceed, plus the cooperative
 * cancellation seam.
 */
export interface SkuCombinationBudget {
  /**
   * Answers the largest number of combinations one request may enumerate.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   * `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`
   */
  readonly resolveMaximumCombinations: () => number;

  /**
   * Reports whether the enumeration should stop before starting its next combination.
   *
   */
  readonly hasBeenCancelled: () => boolean;
}

/**
 * Builds the fail-closed combination budget from whatever figure a deployment stated.
 *
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

/** Multiplies the running combination count by one option group's bucket size. */
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

  /*
   * Clause A. `Number.isSafeInteger` is false for a fraction, for `NaN`, for `Infinity` and for any
   * magnitude above 2^53 - 1 — the whole set of states in which [:L89] cannot terminate — so one test
   * covers all of them and none of them is a capacity figure.
   */
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

/** Binds a newly created SKU to the delegate shape `product.defaultSku` accepts. */
export type SkuDefaultSkuDelegateBinder = (sku: Sku) => ProductDefaultSkuDelegate;

/** The collaborator `product.getBaseProductType` requires in order to answer the discriminator. */
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
 * Guard 4. A product produced by `../adapters/mysql/rowMappers` really can be handed to
 * {@link SkuService.createSkus}.
 */
type _MappedProductSatisfiesCreateSkus = AssertAssignable<
  ManagedEntity<Product>,
  ProductWithErrorState
>;

/**
 * Guard 5. The SKU {@link skuService.newSku} builds really is a legal validation subject.
 */
type _NewSkuIsManagedSku = AssertAssignable<SkuWithErrorState, ManagedSku>;

/* What guards 4 and 5 do and do not catch — measured, not assumed. */

/* CFML value semantics. */

/** CFML `listToArray` — splits on the delimiter and drops empty entries. */
function cfmlListToArray(list: string, delimiter: string = CFML_LIST_DELIMITER): string[] {
  return list.split(delimiter).filter((entry) => entry.length > 0);
}

/** CFML `isSimpleValue` — the gate at [org/Hibachi/HibachiSmartList.cfc:L97]. */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** CFML `isNumeric`. */
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

/** Coerces a value the way CFML coerces one on assignment to a numeric property. */
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
 * An unguarded read of a `data` key — the port of CFML's `arguments.data.someKey`.
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
 */
function readRequiredCfmlDecimal(
  data: Record<string, unknown>,
  key: string,
  locator: string,
): ExactDecimal {
  return toExactDecimal(requireDataValue(data, key, locator));
}

/** The three-part list-price guard at [model/service/SkuService.cfc:L94] and [:L130]. */
function readGuardedListPrice(data: Record<string, unknown>): ExactDecimal | undefined {
  if (!Object.hasOwn(data, LIST_PRICE_DATA_KEY)) {
    return undefined;
  }
  const raw = data[LIST_PRICE_DATA_KEY];
  if (!readsAsCfmlNumeric(raw)) {
    return undefined;
  }
  const listPrice = toExactDecimal(raw);
  /*
   * — `listPrice > exact_decimal_zero` would compile and be wrong. Both sides are branded
   * strings, so `>` compares them lexically: `'0.5'` is lexically less than `'0'`... no, it is greater,
   * but `'-1'` is lexically greater than `'0'`, which would let a negative list price through the very
   * guard [model/service/SkuService.cfc:L94] exists to close. `compareExactDecimal` orders digit-wise
   * with the sign first, so it is exact for every magnitude and both signs.
   */
  return compareExactDecimal(listPrice, EXACT_DECIMAL_ZERO) === 1 ? listPrice : undefined;
}

/** Reads a `data` key as a CFML list, treating an absent key as the empty list. */
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

/** The unguarded list read at [model/service/SkuService.cfc:L163]. See {@link requireDataValue}. */
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

/** The `bundleContentAccess` guard at [model/service/SkuService.cfc:L181]. */
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
 */
function buildSkuCode(product: Product, suffix: number): string {
  return `${product.productCode ?? ''}${SKU_CODE_SEGMENT_DELIMITER}${String(suffix)}`;
}

/**
 * `"-#arrayLen(arguments.product.getSkus) + 1#"` — [model/service/SkuService.cfc:L97] and [:L159].
 */
function nextSkuCodeSuffix(product: Product): number {
  return product.getSkus().length + 1;
}

/*
 * SKU smart-list translation — delegated, NOT duplicated
 * A local copy of the entire `applyData` grammar used to live here: a draft accumulator, the
 * add/remove filter folding, order-statement and keyword parsing, page-figure acceptance, and a
 * query composer — roughly 270 lines. An equivalent copy lived in `./OptionService`, and both
 * restated what `../ports/SmartListQueryPort` now owns.
 */

/** The catalog's SKU service — the port of `model/service/SkuService.cfc`. */
/* SKU ordering — the shared reorder both sorting members perform, and its carried failure mode. */

/** Reads a product's associated SKUs as `Sku` instances. */
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
 * TODO(parity) D13 — model/service/SkuService.cfc:L220-L269. the reorder is left able to fail, and
 * that is the whole point of this function's explicit guard.
 */
/*
 * Out-of-scope association targets — the adapter
 * [model/service/SkuService.cfc:L160-L165] and [`:L187`]/[`:L196`] apply three many-to-many
 * associations that [model/entity/Sku.cfc:L77-L79] declares as persistent relationships:
 * `subscriptionBenefits`, `renewalSubscriptionBenefits` and `accessContents`. `../domain/sku/Sku`
 * declares all three families, so the associations have real targets — but the entities on the far
 * side (`subscriptionBenefit`, `content`) belong to modules AAP §0.2.2.1 excludes, and they are reached
 * through `../ports/SubscriptionTermPort` and `../ports/AccessContentPort`, which return identifier
 * references and nothing more.
 */

/**
 * The identity map that keeps a resolved association reference stable within one branch invocation.
 */
class SkuAssociationReferenceMap {
  /** resolved references by `family` then identifier. */
  private readonly resolved = new Map<string, Map<string, unknown>>();

  /**
   * Returns the one reference for this family and identifier, resolving it on first request.
   *
   * @param family - Which relationship the identifier belongs to.
   * @param primaryIDValue - The far-side row's primary identifier.
   * @param resolve - Resolves and validates the reference. Called at most once per family and
   * identifier, so a rejection is not memoised and a retry re-resolves.
   *
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

    /*
     * Resolve first, memoise after. A failed resolution must not be recorded: `requireSubscriptionBenefit`
     * and `requireAccessContent` throw when the far side is absent, and memoising an absence would turn
     * one missing row into a permanently poisoned key for the rest of the invocation.
     */
    const reference = await resolve();
    byIdentifier.set(primaryIDValue, reference);
    return reference;
  }

  /**
   * Seeds a family with references already resolved in one batch, so
   * {@link SkuAssociationReferenceMap.require} finds them without crossing the boundary again.
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
  /* [:L228] `arrayResize(sortedArrayReturn, len(sortedArray))`. */
  const reordered = new Array<Sku | undefined>(sortedSkuIds.length);

  /*
   * The ordering is indexed once, instead of being rescanned for every SKU.
   * `[:L237]` calls `arrayFind` inside the per-SKU loop, so a product with `n` SKUs walks the ordering
   * up to `n` times and the pair of sort paths that call this helper are quadratic in the SKU count.
   * One forward pass builds the position index the loop below then reads in constant time. This changes
   * only how the position is found — the position itself, and every consequence of it, is unchanged.
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

  /* — cardinality and membership, checked before the result escapes. */
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
   * injection at [model/service/SkuService.cfc:L51] and the `getSkuDAO()` accessor DI/1
   * synthesized for it (import rules R1 and R2, AAP §0.4.3.1-0.4.3.2). Eight call sites.
   *
   * @param optionService - Replaces the `optionService` injection at [:L53]. One call site, [:L74].
   *
   * TODO(parity): mismatch M5 is carried, not resolved — the legacy's implicit request-end
   * commit has no equivalent in a stateless invocation, so the transaction this seam
   * participates in is opened and closed by the caller (AAP §0.6.6).
   */
  public constructor(
    private readonly skuRepository: SkuRepository,
    private readonly optionService: OptionService,
    private readonly subscriptionTermPort: SubscriptionTermPort,
    private readonly accessContentPort: AccessContentPort,
    private readonly imagePathPort: ImagePathPort,
    /*
     * No containment-root collaborator sits here, and its absence is deliberate. An `imageStorageRoot`
     * parameter in this position would bound where an upload could land, and it is not accepted: the legacy
     * checks containment nowhere and states no such value to derive one from (AAP §0.7.3, IR-12). The
     * write path is protected instead by the name gate above {@link isGeneratedImageFileName}, which
     * transcribes the legacy's own generator rather than inventing a root, and that banner records where
     * the residual read-side exposure can legitimately be confined.
     */
    private readonly smartListQueryPort: SmartListQueryPort,
    private readonly validator: SkuSaveValidator,
    private readonly productTypeRootResolver: SkuServiceProductTypeRootResolver,
    private readonly bindDefaultSkuDelegate: SkuDefaultSkuDelegateBinder,
    /** The work ceiling and cancellation seam — see {@link SkuCombinationBudget}. */
    private readonly combinationBudget: SkuCombinationBudget,
  ) {}

  /* The explicitly declared, previously synthesized member. */

  /**
   * Creates an unsaved SKU.
   *
   * @returns a new, unassociated, unsaved SKU carrying the framework-owned metadata and error surfaces.
   */
  public newSku(): SkuWithErrorState {
    return manageEntity(new Sku(), SKU_ENTITY_METADATA);
  }

  /* The combination engine — [model/service/SkuService.cfc:L58-L208] */

  /**
   * Creates the SKUs a newly saved product requires, branching on its base product type.
   *
   * @param product - The product the SKUs belong to. Mutated in place, as the legacy mutates it.
   * @param data - The caller's untyped data struct. Read with CFML list, numeric and boolean semantics.
   * @returns `true`, unconditionally.
   * @throws {DomainError} carrying the legacy fallthrough message when the base product type is none
   * of the three seeded discriminators.
   */
  public async createSkus(
    product: ProductWithErrorState,
    data: Record<string, unknown>,
  ): Promise<boolean> {
    /*
     * Errors go where the legacy puts them, and the private bag is gone. This method used to
     * accumulate every branch precondition and every SKU validation finding into a `ValidationError`
     * declared right here, read it for its own two gates, and then discard it on the way out. Nothing
     * outside this file could observe a single one of those errors, while
     * `ProductService.saveProduct` decides whether to persist the product by asking
     * `arguments.product.hasErrors` at [model/service/ProductService.cfc:L286] — so an invalid product
     * sailed through a gate that had been silently emptied.
     */
    const baseProductType = await product.getBaseProductType(this.productTypeRootResolver);
    /*
     * The three comparisons below are CFML `==`, which folds case — see `resolveBaseProductType`.
     * The three legacy tests at [:L61], [:L139] and [:L173] use `==` on text operands, so a
     * `SwProductType` row holding `Merchandise` took the merchandise branch. `===` against the seeded
     * spelling did not, and sent that product to the fallthrough throw at [:L204] instead. Recognition
     * is therefore delegated to `../domain/BaseProductType`, which answers with the canonical code so
     * the three arms below stay literal comparisons the compiler can check.
     */
    const recognisedBaseProductType = resolveBaseProductType(baseProductType);
    const ruleSet = this.buildSkuSaveRuleSet(product);

    if (recognisedBaseProductType === MERCHANDISE_BASE_PRODUCT_TYPE) {
      /*
       * [:L64] `structKeyExists(arguments.data, "options") && len(arguments.data.options)`. The presence
       * test is on the raw text length, not on `listLen`: `len(",")` is 1, so a lone delimiter takes the
       * odometer branch and then resolves zero options, which is the legacy's behaviour and is carried.
       */
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
      /*
       * [:L204] is the bare CFML `throw` of the discriminator fallthrough. The message string is
       * owned BY `../errors/DomainError` as `UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE`, is imported,
       * and is never retyped — not in code and not in a comment. It is observable behaviour, so a
       * second copy anywhere could drift from the first, and the single declaration site is what keeps
       * verbatim fidelity checkable with one search. There is deliberately no default branch: an
       * unrecognised discriminator raises, exactly as the legacy does.
       */
      throw new LegacyParityError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE, {
        context: {
          productID: product.productID,
          baseProductType,
          locator: 'model/service/SkuService.cfc:L203-L205',
        },
      });
    }

    /* — where each kind of finding lands, and why nothing is merged onto the product here. */

    /*
     * [:L207] `return true;` — unconditional, exactly as written, even when the product now carries
     * errors.
     */
    return true;
  }

  /**
   * Merchandise, options supplied — [model/service/SkuService.cfc:L64-L122]. The odometer.
   *
   * TODO(parity) M9 — CFML struct iteration is unordered; this is not. [:L82] and [:L106] both traverse the
   * `optionGroups` struct with `for(var key in …)`, and CFML specifies no order for a plain struct, so
   * the legacy's own combination sequence is unspecified. A `Map` preserves first-seen insertion order,
   * which is the order the selected-option list itself establishes at [:L73-L79]. That choice is
   * deliberate: it is stable across runs and platforms, so tests and builds are reproducible, and it is
   * the most defensible reading of an unspecified legacy order. The group identifiers are not sorted —
   * sorting would impose an order the legacy never had and would silently change which SKU becomes the
   * default.
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

    /*
     * [:L73-L79] — group the selected options by their option group, in list order. Duplicates are
     * retained and nothing is deduplicated: two selections of the same option genuinely produce a
     * two-element bucket in the legacy, and therefore two combinations.
     */
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

    /*
     * [:L82-L86] — publish the traversal order into `indexedKeys`, start every odometer wheel at its
     * first position, and multiply the total. `totalCombos` starts at 1 [:L67], so a selected-option
     * list that resolves to zero groups yields exactly one combination with no options at all.
     */
    for (const [optionGroupID, bucket] of optionGroups) {
      indexedKeys.push(optionGroupID);
      currentIndexesByKey.set(optionGroupID, FIRST_OPTION_INDEX);
      /*
       * [:L85] — the multiplication itself, carrying the lower-bound assertion on one group's bucket and
       * the exact-integer check on the running product that {@link multiplyCombinationCount} documents.
       * The operator's ceiling is not applied here: it is applied once, below, so that it sees the whole
       * product rather than each partial one.
       */
      totalCombos = multiplyCombinationCount(totalCombos, bucket.length, optionGroupID);
    }

    /*
     * The ceiling stands between the count and the enumeration (CWE-400), and that position is the whole
     * point: `totalCombos` is now final, and not one `newSku`
     * has been allocated, no option has been attached and no validation has reached the database, so an
     * over-budget request costs the option loads above and nothing else. Refusing inside the loop would
     * mean refusing after part of the work had already been done, and refusing before the count would
     * mean refusing on a figure nobody had computed yet.
     */
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
      /*
       * The cooperative cancellation seam —'s deadline clause. Consulted before this
       * combination allocates anything, so a stop leaves the transaction with a whole number of SKUs
       * written rather than a half-built one. The composition root's default never cancels, and the
       * invocation deadline itself remains the platform's: AAP §0.6.6 M1/M2 stay flagged per §0.8.3.6,
       * and this file invents no duration.
       */
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
      /*
       * [:L97] — read before `addSku` below, so the first SKU of an empty product is numbered 1.
       */
      newSku.skuCode = buildSkuCode(product, nextSkuCodeSuffix(product));

      /*
       * [:L100] — `product.addSku(newSku)`, which [model/entity/Product.cfc:L696-L698] implements as a pure
       * delegation to `newSku.setProduct(this)`. The port keeps the source-level choice of member,
       * because the no-options branch below deliberately makes the other one.
       */
      product.addSku(newSku);
      /* [:L101-L103] — only when the product has no default yet, so the first combination wins. */
      if (product.defaultSku === undefined) {
        product.defaultSku = this.bindDefaultSkuDelegate(newSku);
      }

      /*
       * [:L106-L108] — exactly one option from each group, at that group's current wheel position.
       */
      for (const [optionGroupID, bucket] of optionGroups) {
        newSku.addOption(this.readCurrentOption(bucket, currentIndexesByKey, optionGroupID));
      }

      await this.validateNewSku(newSku, ruleSet);

      /*
       * [:L109] — the carry is skipped on the final combination, so the wheels are left mid-sequence.
       */
      if (combination < totalCombos - 1) {
        this.advanceOptionOdometer(optionGroups, indexedKeys, currentIndexesByKey);
      }
    }
  }

  /** The odometer carry — [model/service/SkuService.cfc:L110-L120]. */
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
   * Merchandise, no options — [model/service/SkuService.cfc:L127-L134]. One SKU, and one asymmetry.
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
   * Subscription — [model/service/SkuService.cfc:L139-L170]. One SKU per selected subscription term.
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

    /*
     * [:L152] `if(!arguments.product.hasErrors)` — the whole creation loop is gated, so a product that
     * failed either check above ends this branch having created nothing.
     */
    if (product.hasErrors()) {
      return;
    }

    /*
     * The Hibernate-session identity map, reproduced — see the block comment on
     * {@link SkuAssociationReferenceMap}. Constructed here, once per branch invocation, so every
     * SKU in this batch shares one reference per far-side identifier exactly as one Hibernate session
     * does. Constructing it per SKU, or per `add*` call, would defeat the reference-identity
     * de-duplication inside `../domain/sku/Sku`'s guards; constructing it at module scope would bleed
     * catalog state between warm Lambda invocations (M7 / AAP §0.7.3).
     */
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
     * The three identifier lists are resolved in three boundary calls, not one per element.
     * `[:L158]`, `[:L161]` and `[:L164]` each sit inside a loop, so a product with `t` terms, `b`
     * benefits and `r` renewal benefits crossed this boundary `t + t*b + t*r` times. The two benefit
     * lists are resolved once each here and the terms once, and the loop below then reads what was
     * resolved.
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
      /*
       * [:L155] — the association comes first here, which is why the SKU code computed at [:L159] below
       * already counts this SKU and so starts at 2 rather than 1.
       */
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
      /*
       * [:L158] — read from the batch resolved before the loop, falling through to the per-identifier
       * resolver when this identifier matched no row so that the failure is raised by the untouched
       * resolver, naming this element, at this point in the walk.
       */
      thisSku.setSubscriptionTerm(
        resolvedTerms.get(subscriptionTermID) ??
          (await this.requireSubscriptionTerm(
            subscriptionTermID,
            'model/service/SkuService.cfc:L158',
          )),
      );
      // [:L159]
      thisSku.skuCode = buildSkuCode(product, nextSkuCodeSuffix(product));

      /*
       * [:L160-L162] resolved **and associated**, in source order. The reference used to be
       * resolved and then thrown away. `addSubscriptionBenefit` appends to `SwSkuSubsBenefit`'s owning
       * collection, so the iteration order of `subscriptionBenefits` is the collection order — the
       * legacy `listGetAt(…, b)` walk at [:L161] is ordered the same way.
       */
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
      /*
       * [:L163-L165] — likewise, over the unguarded list, but into the separate
       * `renewalSubscriptionBenefits` collection. The two collections share an element type and an
       * inverse join column and differ only by link table — `SwSkuSubsBenefit` versus
       * `SwSkuRenewalSubsBenefit` [model/entity/Sku.cfc:L78-L79] — so nothing in the type system can
       * catch these two loops being crossed. The ad-hoc verification pins them apart behaviourally.
       */
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
   * Content access — [model/service/SkuService.cfc:L173-L202]. Either one bundled SKU or one per content.
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
    /*
     * `price` is read once here rather than inside each arm at [:L183] and [:L193]. Both arms sit after
     * the gate and each performs at least one read — the gate guarantees a non-empty content list — so a
     * single read raises on exactly the same inputs.
     */
    const creationData: ContentAccessSkuCreationData = {
      price: readRequiredCfmlDecimal(data, PRICE_DATA_KEY, 'model/service/SkuService.cfc:L183'),
      accessContents,
      ...(bundleContentAccess ? { bundleContentAccess } : {}),
    };

    /*
     * The Hibernate-session identity map, reproduced — one instance per branch invocation, for the
     * reasons recorded once on {@link SkuAssociationReferenceMap} and restated at the subscription
     * branch that constructs the other one. Not repeated a third time here.
     */
    const associationReferences = new SkuAssociationReferenceMap();

    /*
     * The content list is resolved in one boundary call, serving both arms.
     * `[:L186]` loops the whole list attaching every row to a single SKU; `[:L196]` creates one SKU per
     * row. Either way the legacy crosses this boundary once per identifier, and both arms read the same
     * list — so one batch here serves whichever arm runs, and neither arm's shape changes.
     */
    associationReferences.prime(
      ACCESS_CONTENT_FAMILY,
      await this.accessContentPort.getContentsByIDs(accessContents),
    );

    if (creationMode === 'bundled') {
      // [:L182-L189]
      const newSku = this.newSku();
      newSku.price = creationData.price;
      // [:L184] — the literal suffix, assigned before the association below.
      newSku.skuCode = buildSkuCode(product, FIRST_SKU_CODE_SUFFIX);
      newSku.setProduct(product);
      /*
       * [:L186-L188] every content is associated with the one bundled SKU, in source order.
       * This is the whole point of the bundled arm: `bundleContentAccess` collapses N contents into one
       * SKU, so this collection is the only place the record of which contents were bundled survives;
       * Discarding the references here would lose it.
       */
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
      /*
       * [:L196] exactly one content per SKU, associated rather than discarded. Contrast the
       * bundled arm above, which puts every content on a single SKU.
       */
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

  /* Collaborator resolution — the unguarded legacy dereferences, made explicit. */

  /** The single definition of "this selected option does not exist". */
  private missingSelectedOptionError(optionID: string, locator: string): DomainError {
    return new DomainError(
      'A selected option does not exist, so the SKU combination cannot resolve it. The legacy ' +
        'code dereferences the lookup result without a guard and raises here too.',
      { context: { optionID, locator } },
    );
  }

  /**
   * `getOptionService().getOption( listGetAt(arguments.data.options, i) )` — [:L74], one identifier.
   */
  private async requireOption(optionID: string, locator: string): Promise<Option> {
    const option = await this.optionService.getOption(optionID);
    if (option === null) {
      throw this.missingSelectedOptionError(optionID, locator);
    }
    return option;
  }

  /**
   * `option.getOptionGroup().getOptionGroupID()` — [:L75], [:L76] and [:L78], three unguarded chains.
   */
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

  /** `getSubscriptionService().getSubscriptionBenefit( … )` — [:L161] and [:L164]. */
  private async requireSubscriptionBenefit(
    subscriptionBenefitID: string,
    locator: string,
  ): Promise<SubscriptionBenefitReference> {
    const subscriptionBenefit =
      await this.subscriptionTermPort.getSubscriptionBenefit(subscriptionBenefitID);
    if (subscriptionBenefit === null) {
      /*
       * — the identifier and the locator are context, not message. Both were previously
       * interpolated into the message text, and `src/handlers/httpResponse.ts` would have had to
       * withhold the whole string to avoid disclosing a caller-supplied identifier and an internal
       * source path. They travel in `context` instead, where the log keeps them and no response can
       * echo them. No `publicMessage` is classified: a missing benefit is an internal failure, not one
       * of the four verbatim legacy strings.
       */
      throw new DomainError(
        'The subscription benefit named in the creation data does not exist, so the SKU cannot be ' +
          'associated with it. The legacy code passes the unchecked lookup result straight to the ' +
          "SKU's benefit collection and raises here too.",
        { context: { subscriptionBenefitID, locator } },
      );
    }
    /*
     * The resolved reference is returned, not discarded. It was previously dropped on the
     * grounds that no collection existed to receive it; `../domain/sku/Sku` now declares all three
     * owning collections, so the caller associates it. Returning rather than associating here keeps
     * the choice between the benefit and the renewal benefit collection at the call site, where the
     * legacy makes it — [:L161] versus [:L164] — because the two share this element type and only the
     * caller knows which list it is iterating.
     */
    return subscriptionBenefit;
  }

  /** `getContentService().getContent( … )` — [:L187] and [:L196]. */
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

  /* M6 — the validation read-back loop. */

  /** Builds the SKU save rule set for one product's creation run. */
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
   * Validates one newly created SKU, in creation order, before the next one is created.
   *
   * TODO(parity) D19 — model/entity/Sku.cfc:L756-L769. an optionless SKU fails `hasUniqueOptions` on
   * any product that already has option-bearing SKUS, and that is carried unrepaired. With no options the
   * selected-option list is empty, and by semantic T5 (AAP §0.6.1.3) the query legitimately degenerates to
   * "every option-bearing SKU of this product" rather than returning nothing. The legacy guard then reads
   * `if(!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()))`, which can only
   * pass when the product has no option-bearing SKUs at all. The rules are not bypassed for optionless
   * SKUs and the case is not special-cased away — both the merchandise no-options branch and the
   * degenerate lone-delimiter path at [:L64] flow through this method unchanged.
   */
  private async validateNewSku(
    sku: SkuWithErrorState,
    ruleSet: ValidationRuleSet<ManagedSku>,
  ): Promise<ValidationError> {
    /*
     * Nothing is minted before this line. Minting the key here — on the reading that the uniqueness
     * rule's self-exclusion clause compares the subject's own key, so the key ought to exist by the time
     * the rules run — inverts the behaviour being ported.
     * `src/ports/UniquePropertyPort.ts` records the legacy reading at `org/Hibachi/HibachiDAO.cfc:L136`
     * and `:L140`: on an INSERT the primary key is still the unsaved sentinel, so "the self-exclusion
     * term consequently excludes nothing on insert" — IR-5's own observation, carried deliberately.
     * Minting first would make that term start excluding a row that does not exist yet, which is a
     * repair, not a translation.
     */
    const findings = await this.validator.validate(sku, ruleSet, SKU_SAVE_CONTEXT);
    if (findings.hasErrors()) {
      sku.addErrors(findings.getErrors());
    }

    /*
     * The identifier is minted here, and the position of this line is the whole of the decision
     * (IR-6).
     */
    if (sku.skuID === SKU_UNSAVED_ID_VALUE) {
      sku.skuID = createSlatwallUUID();
    }

    /* The persist is unconditional, and deliberately not gated on this SKU validating cleanly. */

    await this.skuRepository.persistSku(sku);

    return findings;
  }

  /* The remaining eight declared members — [model/service/SkuService.cfc:L210-L325] */

  /**
   * Saves an uploaded image file against a SKU's image path, and answers with the image-write verdict.
   *
   * TODO(parity) D24 [model/service/SkuService.cfc:L213-L217] — the legacy body departs from its own
   * framework's stated convention, and the port carries that departure. The convention at
   * [org/Hibachi/HibachiService.cfc:L117] is that "all process methods should return an entity"; this body
   * returns a verdict instead. That is an inconsistency inside the legacy, not one this port introduces,
   * and it is annotated by locator rather than repaired (AAP §0.6.7 preserve-and-annotate). `D24` is a
   * correction alias for that observation and not a register entry: AAP §0.6.7 stays frozen at D1–D21, and
   * `src/ports/repositories/SkuRepository.ts` defines the five aliases the port carries — D22–D25 and M9 —
   * with nothing minted beyond them.
   *
   * TODO(parity) [:L213-L217] is a redundant boolean identity — `if(imageSaved) return true; else
   * return false;` is exactly `return imageSaved;`. The port writes the direct form: the dead branching
   * carries no behaviour, and reproducing it would add a statement with no observable effect. The
   * redundancy is recorded here instead.
   *
   * @param sku - The SKU whose composed image path names the file to write, read at [:L211] through
   * `getImagePath`. It is read and never mutated, and it is not what this member answers with.
   *
   * @param imageUploadResult - The upload result struct, passed through to the port opaquely.
   * @returns The image service's own verdict — `true` when the file was stored, `false` when the write
   * was declined — reproducing [:L213-L217] exactly.
   */
  public async processImageUpload(
    sku: Sku,
    imageUploadResult: Record<string, unknown>,
  ): Promise<boolean> {
    /* — the gate, and it stands before the path is composed rather than after. */
    /*
     * An absent column coalesces to the empty string, exactly as the composing members do
     * ({@link Sku.getImagePath} reads `this.imageFile ?? ''`), and the pattern then refuses it because both
     * of its quantifiers are `+`. That refusal is deliberate rather than incidental: an empty segment makes
     * the composed path resolve to the directory `<baseImageURL>/product/default/`, and handing a directory
     * to a member that writes is the same class of hazard as handing it a traversal.
     */
    if (!isGeneratedImageFileName(sku.imageFile ?? '')) {
      return false;
    }

    /*
     * [:L211] — `var imagePath = arguments.Sku.getImagePath;` The composed path, obtained through the
     * same port the entity's own display members use, and passed to the write unchanged. Do not substitute
     * A validated basename here: a basename confines nothing, because it names no destination, and it would
     * change the path the legacy composes. The refusal above is what protects this write.
     */
    const filePath = await sku.getImagePath(this.imagePathPort);

    /* [:L212-L217] — the hidden dependency, through the port, and its verdict forwarded. */
    return this.imagePathPort.saveImageFile({
      uploadResult: imageUploadResult,
      filePath,
      allowedExtensions: IMAGE_UPLOAD_ALLOWED_EXTENSIONS,
    });
  }

  /**
   * Returns a product's SKUs, optionally reordered by the option-group sort ordering.
   *
   * TODO(parity) D13 — model/service/SkuService.cfc:L220-L244. the reorder can fail, and it is left
   * able to fail. See {@link reorderBySortedSkuIds}.
   */
  public async getProductSkus(
    product: Product,
    sorted: boolean,
    fetchOptions = false,
  ): Promise<Sku[]> {
    // [:L222] `getSkuDAO().getProductSkus(product=arguments.product, fetchOptions=arguments.fetchOptions)`
    const skus = await this.skuRepository.findByProduct(product, fetchOptions);

    /*
     * [:L224] — the three-part gate. `firstSku` is bound so the third part can be evaluated under
     * `noUncheckedIndexedAccess`; the binding is a type narrowing only and tests the same SKU
     * `skus[1]` names in the one-based legacy.
     */
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
   * TODO(parity) D13 — model/service/SkuService.cfc:L246-L269. this member is the more exposed of the
   * two, and the annotation is repeated here deliberately rather than cross-referenced, because the
   * exposure differs. [:L250] gates only on `arrayLen(skus) < 2`; there is no equivalent of the
   * first-SKU-has-options test that [:L224] applies. So a product with two SKUs of which one has no
   * options reaches the reorder here, and the sorted-identifier query returns option-bearing SKUs only
   * [model/dao/SkuDAO.cfc:L172-L204] — leaving the optionless SKU with no position. See
   * {@link reorderBySortedSkuIds}.
   */
  public async getSortedProductSkus(product: Product): Promise<Sku[]> {
    // [:L248]
    const skus = readProductSkusAsSkus(product);

    /*
     * [:L250-L252] — the early return. The legacy returns the collection untouched, so a
     * single-SKU or empty product is never reordered.
     */
    if (skus.length < 2) {
      return skus;
    }

    // [:L254] — the positional call, where its sibling at [:L226] uses a named argument.
    const sortedSkuIds = await this.skuRepository.findSortedSkuIdsByProduct(product.productID);
    return reorderBySortedSkuIds(skus, sortedSkuIds, 'model/service/SkuService.cfc:L262');
  }

  /** Searches SKUs by term within a product type. Pure delegation — [:L271-L273]. */
  public async searchSkusByProductType(
    term?: string,
    productTypeID?: string,
  ): Promise<SkuSearchRow[]> {
    return this.skuRepository.searchByProductType(term, productTypeID);
  }

  /**
   * Reports whether a SKU's stock records may be deleted.
   *
   * TODO(parity) D4 — model/service/SkuService.cfc:L281-L283. this member cannot work, and it is
   * preserved as an explicit not-implemented boundary rather than given an answer. [:L282] delegates to
   * `getSkuDAO().getSkuStocksDeletableFlag(…)`, and that DAO member EXISTS nowhere in the repository —
   * `model/dao/SkuDAO.cfc` declares six public members and none of them is it. So the only path that
   * reaches this member, `Sku.getStocksDeletableFlag()` [model/entity/Sku.cfc:L567-L572], has never been
   * able to resolve. `../domain/sku/Sku` makes the same declaration for the same reason.
   *
   * @param skuID - The SKU identifier the legacy would have passed to the absent DAO member.
   * @returns a promise that always rejects; it never resolves.
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
   * TODO(parity) D23 — `model/service/SkuService.cfc:L285` declares an empty parameter list while `:L286`
   * forwards its whole argument scope to the DAO, which is how the two entity call sites scope the probe.
   * TR-1 tightens the signature to that observed contract, so the arguments are declared here in the
   * caller-supplied order while `skuRepository.transactionExists` keeps the DAO's own order.
   *
   * @param skuID - The SKU to scope the probe to, as `model/entity/Sku.cfc:L594` supplies it. First,
   * matching the two entity checker contracts.
   *
   * @param productID - The product to scope the probe to, as `model/entity/Product.cfc:L626` supplies
   * it. Second, for the same reason.
   */
  public async getTransactionExistsFlag(skuID?: string, productID?: string): Promise<boolean> {
    /*
     * `[:L286]` — `return getSkuDAO().getTransactionExistsFlag( argumentCollection=arguments );`
     */
    return this.skuRepository.transactionExists(productID, skuID);
  }

  /**
   * Finds a SKU by its SKU code, falling back to alternate SKU codes. Pure delegation — [:L289-L291].
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

  /** Returns a paginated, filterable SKU smart list — [:L309-L325]. */
  public async getSkuSmartList(
    data?: SmartListInput,
    _currentURL?: string,
  ): Promise<SmartListResult<Sku>> {
    /*
     * `execute`, not `executeRecords`, and the choice is this member's contract rather than a default.
     * `[:L309]` answers the smart list itself, and `org/Hibachi/HibachiSmartList.cfc` exposes three views
     * off one object — the unpaged records `:L751`, the current page `:L759` and the count `:L771` — so a
     * caller of this member may read any of them. Narrowing it to the records alone would change what
     * every existing caller can ask for, which is why the records-only reading lives at the call site
     * that needs it rather than here.
     */
    return this.smartListQueryPort.execute(composeSkuSmartListQuery(data));
  }
}

/*
 * Compile-time guards — both layers must keep accepting both transaction identifiers
 * `Sku.getTransactionExistsFlag` and `Product.getTransactionExistsFlag` each take a checker rather
 * than reaching for a service, because a domain module may not import a service. Both checker
 * interfaces are declared in their own entity module and both are shaped `(skuID?, productID?)`, so
 * each entity can pass the one identifier it owns:
 *
 * `Sku.cfc:L594` -> `skuID = this.getSkuID()` -> first parameter
 * `product.cfc:L626` -> `productID = this.getProductID()` -> second parameter, first left `undefined`
 */

/** Fails to instantiate unless its argument is exactly `true`. */
type SatisfiesContract<TRelation extends true> = TRelation;

/** `true` when a member really does accept both transaction identifiers as strings. */
type AcceptsBothIdentifiers<TMember extends (...args: never[]) => unknown> =
  [string | undefined, string | undefined] extends Parameters<TMember> ? true : false;

/**
 * Whether a SKU-creation batch accumulated any finding — the complete commit gate for `createSkus`.
 *
 * @param product - The product `createSkus` was given, after it has run.
 * @returns True when the product or any SKU attached to it carries a finding.
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
 * @param product - The batch's aggregate root, whose `skus` are the members just written.
 * @returns One merged bag; empty when the batch is clean, in which case {@link skuBatchHasErrors} is
 * false and no caller should be reading this.
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
 */
function readsErrorBag(
  member: ProductSkuMember,
): member is ProductSkuMember & Pick<EntityErrorSurface, 'getErrors'> {
  return typeof (member as Partial<EntityErrorSurface>).getErrors === 'function';
}

/** Whether a collection member exposes an error bag at all. */
function carriesErrorSurface(
  member: ProductSkuMember,
): member is ProductSkuMember & Pick<EntityErrorSurface, 'hasErrors'> {
  return typeof (member as Partial<EntityErrorSurface>).hasErrors === 'function';
}

/**
 * The repository really accepts both identifiers — the guard that keeps the filtered form filtered.
 */
export type SkuRepositoryAcceptsBothTransactionIdentifiers = SatisfiesContract<
  AcceptsBothIdentifiers<SkuRepository['transactionExists']>
>;

/**
 * The service really accepts both identifiers — the guard over the contract `[:L285-L287]` observably has.
 */
export type SkuServiceAcceptsBothTransactionIdentifiers = SatisfiesContract<
  AcceptsBothIdentifiers<SkuService['getTransactionExistsFlag']>
>;
