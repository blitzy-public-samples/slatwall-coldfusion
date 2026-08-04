/**
 * `productUpdateSkus.rules.ts` — the typed transliteration of
 * `model/validation/Product_UpdateSkus.json` (13 lines, reference-only).
 *
 * AAP §0.4.1.5 makes this file create against it: "The two conditional rule groups keyed on the update
 * flags", detailed at AAP §0.2.1.5 as "`price` required only when `updatePriceFlag eq 1`, `listPrice`
 * only when `updateListPriceFlag eq 1`". It is the seventh rule file in this folder and the only one
 * that selects rules by condition rather than by context.
 *
 * Selection semantics `../Validator` implements, and which this file must not reimplement: a rule's
 * condition list is comma-delimited; or across conditions, one satisfied condition being enough
 * [`org/Hibachi/HibachiValidationService.cfc:L124-L126`]; and within a condition, every predicate
 * having to hold [:L110-L121] with no short-circuit, since [:L118] records the failure and keeps
 * looping; and an undeclared name is skipped [:L108], so if it was the only name listed the gate
 * evaluates false [:L130]. An unrecognised constraint kind inside a condition is silently ignored
 * ([:L117] tests for the evaluator first), while in the main rule path it raises at [:L202].
 *
 */

import type {
  ProductUpdateSkus,
  ProductUpdateSkusPropertyName,
} from '../../domain/process/ProductUpdateSkus';
import type {
  EqualityConstraint,
  NumericDataTypeConstraint,
  PropertyValidation,
  RequiredConstraint,
  ValidationCondition,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

export type ProductUpdateSkusValidationSubject = ValidationSubject &
  Readonly<
    Pick<ProductUpdateSkus, 'updatePriceFlag' | 'price' | 'updateListPriceFlag' | 'listPrice'>
  >;

export const PRODUCT_UPDATE_SKUS_PRICE_RB_KEY = 'entity.sku.price';

export const PRODUCT_UPDATE_SKUS_LIST_PRICE_RB_KEY = 'entity.sku.listPrice';

const UPDATE_SKUS_MESSAGE_SEGMENT = 'updateSkus';

const PROCESS_OBJECT_CLASS_NAME = 'Product_UpdateSkus';

export const PRICE_REQUIRED_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.price.required` as const;

export const PRICE_DATA_TYPE_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.price.dataType.numeric` as const;

export const LIST_PRICE_REQUIRED_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.listPrice.required` as const;

export const LIST_PRICE_DATA_TYPE_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.listPrice.dataType.numeric` as const;

const PRICE_PROPERTY = 'price' satisfies ProductUpdateSkusPropertyName;

const LIST_PRICE_PROPERTY = 'listPrice' satisfies ProductUpdateSkusPropertyName;

const UPDATE_PRICE_FLAG_PROPERTY = 'updatePriceFlag' satisfies ProductUpdateSkusPropertyName;

const UPDATE_LIST_PRICE_FLAG_PROPERTY =
  'updateListPriceFlag' satisfies ProductUpdateSkusPropertyName;

export const SHOW_PRICE_CONDITION_NAME = 'showPrice';

export const SHOW_LIST_PRICE_CONDITION_NAME = 'showListPrice';

export const updatePriceFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: 1,
} as const) satisfies EqualityConstraint;

export const updateListPriceFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: 1,
} as const) satisfies EqualityConstraint;

/**
 * `showPrice` — met when the update-price flag equals one.
 * [`model/validation/Product_UpdateSkus.json:L3-L5`]
 */
export const showPriceCondition = Object.freeze({
  name: SHOW_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    Object.freeze({
      propertyIdentifier: UPDATE_PRICE_FLAG_PROPERTY,
      read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.updatePriceFlag,
      constraint: updatePriceFlagEqualityConstraint,
    } as const),
  ] as const),
} as const) satisfies ValidationCondition<ProductUpdateSkusValidationSubject>;

/**
 * `showListPrice` — met when the update-list-price flag equals one.
 * [`model/validation/Product_UpdateSkus.json:L6-L8`]
 */
export const showListPriceCondition = Object.freeze({
  name: SHOW_LIST_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    Object.freeze({
      propertyIdentifier: UPDATE_LIST_PRICE_FLAG_PROPERTY,
      read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.updateListPriceFlag,
      constraint: updateListPriceFlagEqualityConstraint,
    } as const),
  ] as const),
} as const) satisfies ValidationCondition<ProductUpdateSkusValidationSubject>;

export const productUpdateSkusConditions = Object.freeze([
  showPriceCondition,
  showListPriceCondition,
] as const);

/** `price` must be present — when, and only when, its condition is met. */
export const updateSkusPriceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `price` must additionally be numeric — the second constraint of the same rule object.
 * [`model/validation/Product_UpdateSkus.json:L11`]
 */
export const updateSkusPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies NumericDataTypeConstraint;

/** `listPrice` must be present — when, and only when, its own condition is met. */
export const updateSkusListPriceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `listPrice` must additionally be numeric — the second constraint of its rule object.
 * [`model/validation/Product_UpdateSkus.json:L12`]
 */
export const updateSkusListPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies NumericDataTypeConstraint;

/**
 * The price rule — gated on `showPrice`, ungated by context.
 * [`model/validation/Product_UpdateSkus.json:L11`]
 */
export const priceConditionalRule = Object.freeze({
  conditions: SHOW_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    updateSkusPriceDataTypeConstraint,
    updateSkusPriceRequiredConstraint,
  ] as const),
} as const) satisfies ValidationRule<ProductUpdateSkusValidationSubject>;

/**
 * The list-price rule — gated on `showListPrice`, ungated by context.
 * [`model/validation/Product_UpdateSkus.json:L12`]
 */
export const listPriceConditionalRule = Object.freeze({
  conditions: SHOW_LIST_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    updateSkusListPriceDataTypeConstraint,
    updateSkusListPriceRequiredConstraint,
  ] as const),
} as const) satisfies ValidationRule<ProductUpdateSkusValidationSubject>;

export const updateSkusPriceValidation = Object.freeze({
  propertyIdentifier: PRICE_PROPERTY,
  read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.price,
  rules: Object.freeze([priceConditionalRule] as const),
} as const) satisfies PropertyValidation<ProductUpdateSkusValidationSubject>;

export const updateSkusListPriceValidation = Object.freeze({
  propertyIdentifier: LIST_PRICE_PROPERTY,
  read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.listPrice,
  rules: Object.freeze([listPriceConditionalRule] as const),
} as const) satisfies PropertyValidation<ProductUpdateSkusValidationSubject>;

/* Section 9 — the complete rule set. */

/**
 * The complete transliterated document — the typed replacement for
 * `model/validation/Product_UpdateSkus.json`.
 */
export const productUpdateSkusValidationRuleSet = Object.freeze({
  conditions: productUpdateSkusConditions,
  properties: Object.freeze([updateSkusPriceValidation, updateSkusListPriceValidation] as const),
} as const) satisfies ValidationRuleSet<ProductUpdateSkusValidationSubject>;
