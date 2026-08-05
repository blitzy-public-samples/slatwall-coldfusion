/**
 * `product.rules.ts` — the typed transliteration of `model/validation/Product.json`, and the sole owner
 * of the code-format pattern the catalog's three code properties share.
 *
 * AAP §0.4.1.5 validation Layer row 2 makes this file create against that document: "required fields, the
 * `productCode` regex and uniqueness, per-context `baseProductType` gates, minimum-collection gates,
 * delete guards".
 *
 * The generic evaluation semantics every constraint below relies on — null verdicts per constraint,
 * CFML loose equality, the error key, context selection, the deliberate non-ports and the absence of any
 * memoisation — are stated once in `../Validator` and are not repeated here. What this header carries is
 * what is specific to this document.
 *
 */

import type { Product, ProductPropertyName } from '../../domain/product/Product';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type { ExactDecimal } from '../../util/formatting';
import type {
  DataTypeConstraint,
  EqualityConstraint,
  InListConstraint,
  MaxCollectionConstraint,
  MinCollectionConstraint,
  PropertyValidation,
  RegexConstraint,
  RequiredConstraint,
  UniqueConstraint,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/* Section 1 — the shared code-format pattern. */

/**
 * The code-format pattern shared by the catalog's three code properties, transcribed character for
 * character from `model/validation/Product.json:L10`.
 */
export const CODE_FORMAT_REGEX = '^[a-zA-Z0-9-_.|:~^]+$';

/** What this rule set requires of the object being validated, and nothing more. */
export type ProductValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /**
     * The derived base product type — `property name="baseProductType" type="string"
     * persistent="false"` [`model/entity/Product.cfc:L103`].
     */
    readonly baseProductType?: string;

    /**
     * Named by the document, declared by no entity — the inertness finding recorded in full at
     * {@link physicalCountsMaxCollectionConstraint}.
     */
    readonly physicalCounts?: unknown;

    /**
     * The price delegated to the default SKU — `property name="price" hb_formatType="currency"
     * persistent="false"` [`model/entity/Product.cfc:L118`]. See the `price` rule at
     * {@link priceRequiredConstraint}, including the boundary note about how it is resolved.
     *
     * `string` as well as {@link ExactDecimal}, because a payload value that no exact decimal can hold is
     * what {@link priceDataTypeConstraint} exists to refuse. CFML assigned `"abc"` to the property
     * [org/Hibachi/HibachiTransient.cfc:L207] and let `dataType="numeric"` reject it; a typed field cannot
     * hold it, so whoever assembles the subject carries the raw text instead and this rule reaches the same
     * verdict. Widening the SLOT rather than the entity keeps `Product.price` exact everywhere else.
     */
    readonly price?: ExactDecimal | string;

    /**
     * `property name="productName" ormtype="string" notnull="true";` [`model/entity/Product.cfc:L55`]
     */
    readonly productName?: string;

    /**
     * `property name="productCode" ormtype="string" unique="true";`
     * [`model/entity/Product.cfc:L56`] — carries all three of this document's densest constraints.
     */
    readonly productCode?: string;

    /**
     * The required product-type reference —
     * `property name="productType" cfc="ProductType" fieldtype="many-to-one" fkcolumn="productTypeID"
     * fetch="join";` [`model/entity/Product.cfc:L69`].
     */
    readonly productType?: unknown;

    /**
     * `property name="transactionExistsFlag" type="boolean" persistent="false"`
     * [`model/entity/Product.cfc:L110`] — the delete guard's subject.
     */
    readonly transactionExistsFlag?: boolean;

    /**
     * `property name="unusedProductOptions" type="array" persistent="false"`
     * [`model/entity/Product.cfc:L111`], resolved by the lazily memoised getter at
     * [`model/entity/Product.cfc:L635-L640`]. Measured, never inspected.
     */
    readonly unusedProductOptions?: readonly unknown[];

    /**
     * `property name="unusedProductOptionGroups" type="array" persistent="false"`
     * [`model/entity/Product.cfc:L112`], resolved at [`model/entity/Product.cfc:L642-L647`]. Measured,
     * never inspected.
     */
    readonly unusedProductOptionGroups?: readonly unknown[];

    /**
     * `property name="unusedProductSubscriptionTerms" type="array" persistent="false"`
     * [`model/entity/Product.cfc:L113`], resolved at [`model/entity/Product.cfc:L649-L654`] through the
     * out-of-scope subscription service. Measured, never inspected. See the boundary note at
     * {@link unusedProductSubscriptionTermsMinCollectionConstraint}.
     */
    readonly unusedProductSubscriptionTerms?: readonly unknown[];

    /**
     * `property name="urlTitle" ormtype="string" unique="true";` [`model/entity/Product.cfc:L54`]
     */
    readonly urlTitle?: string;
  };

/* Section 3 — contexts. */

const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

const ADD_OPTION_CONTEXT = 'addOption';

const ADD_OPTION_GROUP_CONTEXT = 'addOptionGroup';

const ADD_SUBSCRIPTION_TERM_CONTEXT = 'addSubscriptionTerm';

/**
 * The one two-element context list in the document — `"addOptionGroup,addOption"` at
 * `model/validation/Product.json:L4`.
 */
const ADD_OPTION_GROUP_OR_ADD_OPTION_CONTEXTS = `${ADD_OPTION_GROUP_CONTEXT},${ADD_OPTION_CONTEXT}`;

/* Section 4 — property identifiers. */

/** `model/validation/Product.json:L9`, `model/entity/Product.cfc:L55`. */
const PRODUCT_NAME_PROPERTY = 'productName' satisfies ProductPropertyName;

/** `model/validation/Product.json:L10`, `model/entity/Product.cfc:L56`. */
const PRODUCT_CODE_PROPERTY = 'productCode' satisfies ProductPropertyName;

/** `model/validation/Product.json:L11`, `model/entity/Product.cfc:L69`. */
const PRODUCT_TYPE_PROPERTY = 'productType' satisfies ProductPropertyName;

/** `model/validation/Product.json:L16`, `model/entity/Product.cfc:L54`. */
const URL_TITLE_PROPERTY = 'urlTitle' satisfies ProductPropertyName;

/** `model/validation/Product.json:L8`, `model/entity/Product.cfc:L118`. */
const PRICE_PROPERTY = 'price' satisfies keyof Product;

/** `model/validation/Product.json:L12`, `model/entity/Product.cfc:L110`. Non-persistent. */
const TRANSACTION_EXISTS_FLAG_PROPERTY = 'transactionExistsFlag' satisfies keyof Product;

/** `model/validation/Product.json:L13`, `model/entity/Product.cfc:L111`. Non-persistent. */
const UNUSED_PRODUCT_OPTIONS_PROPERTY = 'unusedProductOptions' satisfies keyof Product;

/** `model/validation/Product.json:L14`, `model/entity/Product.cfc:L112`. Non-persistent. */
const UNUSED_PRODUCT_OPTION_GROUPS_PROPERTY = 'unusedProductOptionGroups' satisfies keyof Product;

/**
 * Resolves to the document's property name while the ported `Product` exposes the accessor that
 * produces that property's value, and to the empty type as soon as it does not.
 */
type NameResolvedByProductAccessor<
  TName extends string,
  TAccessor extends keyof Product,
> = TAccessor extends keyof Product ? TName : never;

/**
 * `model/validation/Product.json:L4` and `:L5`, `model/entity/Product.cfc:L103`, resolved by the accessor
 * at [`model/entity/Product.cfc:L493-L495`].
 */
const BASE_PRODUCT_TYPE_PROPERTY: NameResolvedByProductAccessor<
  'baseProductType',
  'getBaseProductType'
> = 'baseProductType';

/**
 * `model/validation/Product.json:L15`, `model/entity/Product.cfc:L113`, resolved by the accessor at
 * [`model/entity/Product.cfc:L649-L654`] through the out-of-scope subscription service.
 */
const UNUSED_PRODUCT_SUBSCRIPTION_TERMS_PROPERTY: NameResolvedByProductAccessor<
  'unusedProductSubscriptionTerms',
  'getUnusedProductSubscriptionTerms'
> = 'unusedProductSubscriptionTerms';

/**
 * Resolves to the name itself while the ported `Product` declares no member of that name, and to the
 * empty type as soon as it declares one.
 */
type NameNotDeclaredByProduct<TName extends string> = TName extends keyof Product ? never : TName;

/**
 * `model/validation/Product.json:L7` — transcribed verbatim from the document and deliberately not
 * checked against any positive census, because it is in none of them. See
 * {@link physicalCountsMaxCollectionConstraint} for the full finding; the annotation here is what makes
 * the absence enforced rather than merely described.
 */
const PHYSICAL_COUNTS_PROPERTY: NameNotDeclaredByProduct<'physicalCounts'> = 'physicalCounts';

/* Section 5 — the sixteen constraints. */

/** Gate 1 of 2 on the derived base product type: the two option contexts require merchandise. */
export const baseProductTypeInListMerchandise = Object.freeze({
  constraintType: 'inList',
  constraintValue: 'merchandise',
} as const) satisfies InListConstraint;

/** Gate 2 of 2 on the derived base product type: the term context requires subscription. */
export const baseProductTypeInListSubscription = Object.freeze({
  constraintType: 'inList',
  constraintValue: 'subscription',
} as const) satisfies InListConstraint;

/** Delete guard 1 of 2 — and it is inert at run time. Declare it anyway; do not retarget it. */
export const physicalCountsMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/** `price` is required on save, and it is easy to miss. */
export const priceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/** `price` must additionally be numeric on save — the second constraint of the same rule object. */
export const priceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/** `productName` is required on save. */
export const productNameRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `productCode` is required on save — the first of three constraints flattened from one rule object.
 */
export const productCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `productCode` must be unique on save — and this declaration is the folder’s canonical uniqueness
 * declaration, because this is where the constraint lives.
 */
export const productCodeUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: ProductValidationSubject): UniquePropertyEntity => subject,
} as const) satisfies UniqueConstraint<ProductValidationSubject>;

/**
 * `productCode` must match the shared code format on save — the third constraint of the same rule object.
 */
export const productCodeRegexConstraint = Object.freeze({
  constraintType: 'regex',
  constraintValue: CODE_FORMAT_REGEX,
} as const) satisfies RegexConstraint;

/**
 * `productType` is required on save — and this declaration is the only thing enforcing the
 * Relationship anywhere in the system.
 */
export const productTypeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/** Delete guard 2 of 2 — a product with transaction history cannot be deleted. This one is live. */
export const transactionExistsFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: false,
} as const) satisfies EqualityConstraint;

/**
 * The add-option context requires at least one unused option — gate 1 of the three collection floors.
 */
export const unusedProductOptionsMinCollectionConstraint = Object.freeze({
  constraintType: 'minCollection',
  constraintValue: 1,
} as const) satisfies MinCollectionConstraint;

/** The add-option-group context requires at least one unused option group — gate 2 of three. */
export const unusedProductOptionGroupsMinCollectionConstraint = Object.freeze({
  constraintType: 'minCollection',
  constraintValue: 1,
} as const) satisfies MinCollectionConstraint;

/** The add-subscription-term context requires at least one unused term — gate 3 of three. */
export const unusedProductSubscriptionTermsMinCollectionConstraint = Object.freeze({
  constraintType: 'minCollection',
  constraintValue: 1,
} as const) satisfies MinCollectionConstraint;

/** `urlTitle` is required on save — the first of two constraints flattened from one rule object. */
export const urlTitleRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `urlTitle` must be unique on save — the second of the document's two uniqueness rules, and the one the
 * sibling port's brief wrongly denies exists.
 */
export const urlTitleUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: ProductValidationSubject): UniquePropertyEntity => subject,
} as const) satisfies UniqueConstraint<ProductValidationSubject>;

/* Section 6 — the two base-product-type rule objects. */

/**
 * The `Product.json:L4` gate: under either option context, the base product type must be merchandise.
 */
export const baseProductTypeMerchandiseRule = Object.freeze({
  contexts: ADD_OPTION_GROUP_OR_ADD_OPTION_CONTEXTS,
  constraints: Object.freeze([baseProductTypeInListMerchandise] as const),
} as const) satisfies ValidationRule<ProductValidationSubject>;

/**
 * The `Product.json:L5` gate: under the term context, the base product type must be subscription.
 */
export const baseProductTypeSubscriptionRule = Object.freeze({
  contexts: ADD_SUBSCRIPTION_TERM_CONTEXT,
  constraints: Object.freeze([baseProductTypeInListSubscription] as const),
} as const) satisfies ValidationRule<ProductValidationSubject>;

/* Section 7 — the eleven property rule sets. */

/** `baseProductType` — two context gates, the only multi-rule property in the document. */
export const baseProductTypeValidation = Object.freeze({
  propertyIdentifier: BASE_PRODUCT_TYPE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.baseProductType,
  rules: Object.freeze([baseProductTypeMerchandiseRule, baseProductTypeSubscriptionRule] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `physicalCounts` — declared verbatim, inert by construction. See
 * {@link physicalCountsMaxCollectionConstraint} for the full finding and the three prohibitions.
 */
export const physicalCountsValidation = Object.freeze({
  propertyIdentifier: PHYSICAL_COUNTS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.physicalCounts,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([physicalCountsMaxCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `price` — required and numeric on save. The easily-missed rule, and it carries no numeric floor.
 */
export const priceValidation = Object.freeze({
  propertyIdentifier: PRICE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.price,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([priceRequiredConstraint, priceDataTypeConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/** `productName` — required on save. See {@link productNameRequiredConstraint}. */
export const productNameValidation = Object.freeze({
  propertyIdentifier: PRODUCT_NAME_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.productName,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([productNameRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/** `productCode` — the densest property in the document: one rule object, three constraints. */
export const productCodeValidation = Object.freeze({
  propertyIdentifier: PRODUCT_CODE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.productCode,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([
        productCodeRequiredConstraint,
        productCodeUniqueConstraint,
        productCodeRegexConstraint,
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `productType` — required on save, and the sole enforcement of the relationship. See
 * {@link productTypeRequiredConstraint}.
 */
export const productTypeValidation = Object.freeze({
  propertyIdentifier: PRODUCT_TYPE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.productType,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([productTypeRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `transactionExistsFlag` — the document's one live delete guard. See
 * {@link transactionExistsFlagEqualityConstraint}, which also records that there is deliberately no SKU delete
 * guard anywhere in this file.
 */
export const transactionExistsFlagValidation = Object.freeze({
  propertyIdentifier: TRANSACTION_EXISTS_FLAG_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.transactionExistsFlag,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([transactionExistsFlagEqualityConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `unusedProductOptions` — the add-option collection floor. See
 * {@link unusedProductOptionsMinCollectionConstraint} for the absence-versus-empty asymmetry.
 */
export const unusedProductOptionsValidation = Object.freeze({
  propertyIdentifier: UNUSED_PRODUCT_OPTIONS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.unusedProductOptions,
  rules: Object.freeze([
    Object.freeze({
      contexts: ADD_OPTION_CONTEXT,
      constraints: Object.freeze([unusedProductOptionsMinCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `unusedProductOptionGroups` — the add-option-group collection floor. See
 * {@link unusedProductOptionGroupsMinCollectionConstraint}.
 */
export const unusedProductOptionGroupsValidation = Object.freeze({
  propertyIdentifier: UNUSED_PRODUCT_OPTION_GROUPS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.unusedProductOptionGroups,
  rules: Object.freeze([
    Object.freeze({
      contexts: ADD_OPTION_GROUP_CONTEXT,
      constraints: Object.freeze([unusedProductOptionGroupsMinCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/**
 * `unusedProductSubscriptionTerms` — the add-subscription-term collection floor, carried across the scope
 * boundary under TR-5. See {@link unusedProductSubscriptionTermsMinCollectionConstraint} for the boundary
 * note, which is stated and deliberately not resolved.
 */
export const unusedProductSubscriptionTermsValidation = Object.freeze({
  propertyIdentifier: UNUSED_PRODUCT_SUBSCRIPTION_TERMS_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.unusedProductSubscriptionTerms,
  rules: Object.freeze([
    Object.freeze({
      contexts: ADD_SUBSCRIPTION_TERM_CONTEXT,
      constraints: Object.freeze([unusedProductSubscriptionTermsMinCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/** `urlTitle` — required and unique on save. */
export const urlTitleValidation = Object.freeze({
  propertyIdentifier: URL_TITLE_PROPERTY,
  read: (subject: ProductValidationSubject): unknown => subject.urlTitle,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([urlTitleRequiredConstraint, urlTitleUniqueConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<ProductValidationSubject>;

/** The transliterated `model/validation/Product.json`, ready to be handed to `../Validator`. */
export const productValidationRuleSet = Object.freeze({
  properties: Object.freeze([
    baseProductTypeValidation,
    physicalCountsValidation,
    priceValidation,
    productNameValidation,
    productCodeValidation,
    productTypeValidation,
    transactionExistsFlagValidation,
    unusedProductOptionsValidation,
    unusedProductOptionGroupsValidation,
    unusedProductSubscriptionTermsValidation,
    urlTitleValidation,
  ] as const),
} as const) satisfies ValidationRuleSet<ProductValidationSubject>;
