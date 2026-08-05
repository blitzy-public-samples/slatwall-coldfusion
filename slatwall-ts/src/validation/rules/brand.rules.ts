/**
 * `brand.rules.ts` — the typed `Brand` rule set of the extracted Catalog slice.
 *
 * AAP §0.4.1.5 makes this file create against `model/validation/Brand.json`: "brandName, URL data type on
 * brandWebsite, urlTitle uniqueness, delete guards". The seven catalog validation documents are an
 * implicit scope addition — AAP §0.2.1.5 records that the prompt names none of them and that they are
 * behavior rather than configuration, "interpreted at runtime by the validation service" and determining
 * "which saves and deletes succeed".
 *
 * The generic evaluation semantics every constraint below relies on — the null verdict per constraint,
 * the error key, context selection, the two deliberate non-ports and the absence of any memoisation — are
 * stated once in `../Validator` and are not repeated here.
 *
 * @see `../Validator` for the evaluation semantics every constraint below relies on.
 */

import type { BrandPropertyName } from '../../domain/product/Brand';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  PropertyValidation,
  UniqueTargetResolver,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/* The subject shape — what these five rules read, and nothing more. */

/** The narrowest object shape these five rules can be evaluated against. */
export interface BrandValidationSubject extends ValidationSubject {
  /**
   * `model/entity/Brand.cfc:L56` — read by the presence rule at `model/validation/Brand.json:L3`.
   */
  readonly brandName?: string;

  /**
   * `model/entity/Brand.cfc:L57` — read by the data-type rule at `model/validation/Brand.json:L4`.
   */
  readonly brandWebsite?: string;

  /**
   * `model/entity/Brand.cfc:L55` — read by both constraints of
   * `model/validation/Brand.json:L5`.
   */
  readonly urlTitle?: string;

  /**
   * `model/entity/Brand.cfc:L61` — read by the live delete guard at
   * `model/validation/Brand.json:L6`.
   */
  readonly products?: readonly unknown[];
}

/**
 * Resolves the entity a `Brand` uniqueness check runs against: the subject itself.
 *
 */
export function resolveBrandUniqueTarget(
  subject: BrandValidationSubject & UniquePropertyEntity,
): UniquePropertyEntity {
  return subject;
}

/* The five property identifiers — four compile-checked as real, one compile-checked as absent. */

/** `model/validation/Brand.json:L3` against `model/entity/Brand.cfc:L56`. */
const BRAND_NAME_IDENTIFIER: Extract<BrandPropertyName, 'brandName'> = 'brandName';

/** `model/validation/Brand.json:L4` against `model/entity/Brand.cfc:L57`. */
const BRAND_WEBSITE_IDENTIFIER: Extract<BrandPropertyName, 'brandWebsite'> = 'brandWebsite';

/** `model/validation/Brand.json:L5` against `model/entity/Brand.cfc:L55`. */
const URL_TITLE_IDENTIFIER: Extract<BrandPropertyName, 'urlTitle'> = 'urlTitle';

/** `model/validation/Brand.json:L6` against `model/entity/Brand.cfc:L61`. */
const PRODUCTS_IDENTIFIER: Extract<BrandPropertyName, 'products'> = 'products';

/** `model/validation/Brand.json:L7` against an entity that declares no such property. */
const PHYSICAL_COUNTS_IDENTIFIER: Exclude<'physicalCounts', BrandPropertyName> = 'physicalCounts';

/** `brandName` must be present when a brand is saved. */
export const brandNamePropertyValidation = Object.freeze({
  propertyIdentifier: BRAND_NAME_IDENTIFIER,
  read: (subject: BrandValidationSubject): unknown => subject.brandName,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'save',
      constraints: Object.freeze([
        Object.freeze({ constraintType: 'required', constraintValue: true } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/** `brandWebsite` must read as a URL when a brand is saved — and may be absent. */
export const brandWebsitePropertyValidation = Object.freeze({
  propertyIdentifier: BRAND_WEBSITE_IDENTIFIER,
  read: (subject: BrandValidationSubject): unknown => subject.brandWebsite,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'save',
      constraints: Object.freeze([
        Object.freeze({
          constraintType: 'dataType',
          constraintValue: 'url',
        } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/**
 * `urlTitle` must be present and unique when a Brand is saved.
 *
 * @param resolveUniqueTarget selects the entity the port checks. Pass
 * {@link resolveBrandUniqueTarget} when the subject is itself that entity, which is the shape all
 * seven single-segment uniqueness rules of the slice take.
 *
 */
export function createUrlTitlePropertyValidation<TSubject extends BrandValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): PropertyValidation<TSubject> {
  return Object.freeze({
    propertyIdentifier: URL_TITLE_IDENTIFIER,
    read: (subject: BrandValidationSubject): unknown => subject.urlTitle,
    rules: Object.freeze([
      Object.freeze({
        contexts: 'save',
        constraints: Object.freeze([
          Object.freeze({ constraintType: 'required', constraintValue: true } as const),
          Object.freeze({
            constraintType: 'unique',
            constraintValue: true,
            uniqueTarget: resolveUniqueTarget,
          } as const),
        ] as const),
      } as const),
    ] as const),
  } as const);
}

/** A brand carrying any product cannot be deleted. */
export const productsPropertyValidation = Object.freeze({
  propertyIdentifier: PRODUCTS_IDENTIFIER,
  read: (subject: BrandValidationSubject): unknown => subject.products,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'delete',
      constraints: Object.freeze([
        Object.freeze({ constraintType: 'maxCollection', constraintValue: 0 } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/** The second delete guard — transcribed verbatim, and inert in the legacy system. */
export const physicalCountsPropertyValidation = Object.freeze({
  propertyIdentifier: PHYSICAL_COUNTS_IDENTIFIER,
  read: (): unknown => undefined,
  rules: Object.freeze([
    Object.freeze({
      contexts: 'delete',
      constraints: Object.freeze([
        Object.freeze({ constraintType: 'maxCollection', constraintValue: 0 } as const),
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<BrandValidationSubject>;

/**
 * The complete `Brand` rule set — the typed equivalent of the whole of
 * `model/validation/Brand.json`.
 *
 * @param resolveUniqueTarget selects the entity the uniqueness port interrogates for `urlTitle`
 * @returns the frozen five-property rule set for `Brand`
 */
export function createBrandValidationRules<TSubject extends BrandValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): ValidationRuleSet<TSubject> {
  return Object.freeze({
    properties: Object.freeze([
      brandNamePropertyValidation,
      brandWebsitePropertyValidation,
      createUrlTitlePropertyValidation(resolveUniqueTarget),
      productsPropertyValidation,
      physicalCountsPropertyValidation,
    ] as const),
  } as const);
}

/**
 * The `Brand` rule set for the common case: a subject that is itself the entity the uniqueness port
 * interrogates.
 */
export const brandValidationRules: ValidationRuleSet<
  BrandValidationSubject & UniquePropertyEntity
> = createBrandValidationRules<BrandValidationSubject & UniquePropertyEntity>(
  resolveBrandUniqueTarget,
);
