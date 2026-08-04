/**
 * `productType.rules.ts` — the typed transliteration of `model/validation/ProductType.json`.
 *
 * AAP §0.4.1.5 makes this file create against that document: "Name and `urlTitle` requirements, four
 * delete guards including the `systemCode` max-length guard". The seven validation documents are an
 * entirely implicit scope addition (AAP §0.2.1.5) — the prompt names none of them — because they are
 * behavior rather than configuration and "determine which saves and deletes succeed".
 *
 * The generic evaluation semantics every constraint below depends on — the null verdict per constraint,
 * the error key, context selection, the uniqueness polarity, the dry-run pass and the deliberate
 * non-ports of the engine — are stated once in `../Validator` and are not repeated here.
 *
 */

import type { ProductTypePropertyName } from '../../domain/product/ProductType';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  MaxCollectionConstraint,
  MaxLengthConstraint,
  PropertyValidation,
  RequiredConstraint,
  UniqueConstraint,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/** What this rule set requires of the object being validated, and nothing more. */
export type ProductTypeValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /** `property name="productTypeName" ormtype="string";` [`model/entity/ProductType.cfc:L57`] */
    readonly productTypeName?: string;

    /**
     * `property name="urlTitle" ormtype="string" unique="true" hint="…";`
     * [`model/entity/ProductType.cfc:L56`]
     */
    readonly urlTitle?: string;

    /** `property name="systemCode" ormtype="string";` [`model/entity/ProductType.cfc:L59`] */
    readonly systemCode?: string;

    /**
     * The one-to-many product collection [`model/entity/ProductType.cfc:L66`]. Measured, never
     * inspected — see the note on element typing above.
     */
    readonly products?: readonly unknown[];

    /**
     * The self-referencing child collection [`model/entity/ProductType.cfc:L65`]. The key is
     * `childProductTypes`; see the module header.
     */
    readonly childProductTypes?: readonly unknown[];

    /**
     * Named by the document, declared by no entity — the whole point of the inertness finding
     * recorded at the `physicalCounts` guard below.
     */
    readonly physicalCounts?: unknown;
  };

/* Section 2 — contexts. */

const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

/* Section 3 — property identifiers. */

/** A property name this document constrains that the entity genuinely declares. */
const PRODUCT_TYPE_NAME_PROPERTY = 'productTypeName' satisfies ProductTypePropertyName;

/** [`model/validation/ProductType.json:L4`], [`model/entity/ProductType.cfc:L56`] */
const URL_TITLE_PROPERTY = 'urlTitle' satisfies ProductTypePropertyName;

/** [`model/validation/ProductType.json:L5`], [`model/entity/ProductType.cfc:L66`] */
const PRODUCTS_PROPERTY = 'products' satisfies ProductTypePropertyName;

/**
 * [`model/validation/ProductType.json:L6`], [`model/entity/ProductType.cfc:L65`] — and the correction
 * The key is `childProductTypes`, never `productTypes`. The `satisfies` check is what
 * makes that claim machine-verified rather than asserted, since `productTypes` is not a member of
 * the entity's property union and would not compile here.
 */
const CHILD_PRODUCT_TYPES_PROPERTY = 'childProductTypes' satisfies ProductTypePropertyName;

/** [`model/validation/ProductType.json:L7`], [`model/entity/ProductType.cfc:L59`] */
const SYSTEM_CODE_PROPERTY = 'systemCode' satisfies ProductTypePropertyName;

/**
 * Resolves to the name itself while the name is not a declared property of the entity, and to the
 * empty type as soon as it becomes one.
 */
type NameNotDeclaredByProductType<TName extends string> = TName extends ProductTypePropertyName
  ? never
  : TName;

/**
 * [`model/validation/ProductType.json:L8`] — transcribed verbatim from the document and deliberately
 * not checked against the entity's property union, because it is not in it. See the guard's own
 * declaration for the full finding; the annotation here is what makes the absence enforced rather
 * than merely described.
 */
const PHYSICAL_COUNTS_PROPERTY: NameNotDeclaredByProductType<'physicalCounts'> = 'physicalCounts';

/* Section 4 — the seven constraints. */

/** `productTypeName` is required on save — and this declaration is the only thing enforcing it. */
export const productTypeNameRequiredConstraint = {
  constraintType: 'required',
  constraintValue: true,
} as const satisfies RequiredConstraint;

/** `urlTitle` is required on save. */
export const urlTitleRequiredConstraint = {
  constraintType: 'required',
  constraintValue: true,
} as const satisfies RequiredConstraint;

/**
 * `urlTitle` must be unique on save — the seventh of the slice's seven uniqueness rules, and the one
 * every upstream count of them misses.
 */
export const urlTitleUniqueConstraint = {
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: ProductTypeValidationSubject): UniquePropertyEntity => subject,
} as const satisfies UniqueConstraint<ProductTypeValidationSubject>;

/** Delete guard 1 of 4 — a product type that still has products cannot be deleted. */
export const productsMaxCollectionConstraint = {
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const satisfies MaxCollectionConstraint;

/** Delete guard 2 of 4 — a product type that still has child product types cannot be deleted. */
export const childProductTypesMaxCollectionConstraint = {
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const satisfies MaxCollectionConstraint;

/** Delete guard 3 of 4 — **the guard rail. The most consequential declaration in this file.**. */
export const systemCodeMaxLengthConstraint = {
  constraintType: 'maxLength',
  constraintValue: 0,
} as const satisfies MaxLengthConstraint;

/**
 * DELETE guard 4 of 4 — declared verbatim from the document, and inert. It never fires in the legacy
 * system, and it must not fire here either.
 */
export const physicalCountsMaxCollectionConstraint = {
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const satisfies MaxCollectionConstraint;

/* Section 5 — the six property rule sets. */

/** `productTypeName` — required on save. See {@link productTypeNameRequiredConstraint}. */
export const productTypeNameValidation = {
  propertyIdentifier: PRODUCT_TYPE_NAME_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.productTypeName,
  rules: [
    {
      contexts: SAVE_CONTEXT,
      constraints: [productTypeNameRequiredConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `urlTitle` — required and unique on save. */
export const urlTitleValidation = {
  propertyIdentifier: URL_TITLE_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.urlTitle,
  rules: [
    {
      contexts: SAVE_CONTEXT,
      constraints: [urlTitleRequiredConstraint, urlTitleUniqueConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `products` — delete guard. See {@link productsMaxCollectionConstraint}. */
export const productsValidation = {
  propertyIdentifier: PRODUCTS_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.products,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [productsMaxCollectionConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `childProductTypes` — delete guard. See {@link childProductTypesMaxCollectionConstraint}. */
export const childProductTypesValidation = {
  propertyIdentifier: CHILD_PRODUCT_TYPES_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.childProductTypes,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [childProductTypesMaxCollectionConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** `systemCode` — the guard rail. See {@link systemCodeMaxLengthConstraint}. */
export const systemCodeValidation = {
  propertyIdentifier: SYSTEM_CODE_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.systemCode,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [systemCodeMaxLengthConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/**
 * `physicalCounts` — declared verbatim, inert by construction. See
 * {@link physicalCountsMaxCollectionConstraint} for the full finding.
 */
export const physicalCountsValidation = {
  propertyIdentifier: PHYSICAL_COUNTS_PROPERTY,
  read: (subject: ProductTypeValidationSubject): unknown => subject.physicalCounts,
  rules: [
    {
      contexts: DELETE_CONTEXT,
      constraints: [physicalCountsMaxCollectionConstraint],
    },
  ],
} as const satisfies PropertyValidation<ProductTypeValidationSubject>;

/** The transliterated `model/validation/ProductType.json`, ready to be handed to `../Validator`. */
export const productTypeValidationRuleSet = {
  properties: [
    productTypeNameValidation,
    urlTitleValidation,
    productsValidation,
    childProductTypesValidation,
    systemCodeValidation,
    physicalCountsValidation,
  ],
} as const satisfies ValidationRuleSet<ProductTypeValidationSubject>;
