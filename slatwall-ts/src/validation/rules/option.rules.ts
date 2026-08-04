/**
 * `option.rules.ts` — the typed transliteration of `model/validation/Option.json`.
 *
 * AAP §0.4.1.5 makes this file create against that document: "Code regex and uniqueness, required option
 * group, SKU delete guard". The seven validation documents are an entirely implicit scope addition
 * (AAP §0.2.1.5) — the prompt names none of them, and they enter scope because they are behavior rather
 * than configuration, "interpreted at runtime by the validation service" and determining "which saves and
 * deletes succeed".
 *
 * The generic evaluation semantics every constraint below depends on — the null verdict per constraint,
 * the error key, context selection, the uniqueness polarity, the two deliberate non-ports — are stated
 * once in `../Validator` and are not repeated here.
 *
 */

import type { OptionPropertyName } from '../../domain/option/Option';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  MaxCollectionConstraint,
  PropertyValidation,
  RegexConstraint,
  RequiredConstraint,
  UniqueConstraint,
  UniqueTargetResolver,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';
import { CODE_FORMAT_REGEX } from './product.rules';

/* The subject shape — what these four rules read, and nothing more. */

/** The narrowest object shape this rule set can be evaluated against. */
export type OptionValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /**
     * `property name="optionCode" ormtype="string";` [`model/entity/Option.cfc:L53`] — read by all
     * three constraints of `model/validation/Option.json:L3`.
     */
    readonly optionCode?: string;

    /**
     * `property name="optionName" ormtype="string";` [`model/entity/Option.cfc:L54`] — read by the
     * presence rule at `model/validation/Option.json:L4`.
     */
    readonly optionName?: string;

    /**
     * `property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one"
     * fkcolumn="optionGroupID";` [`model/entity/Option.cfc:L59`] — read by the presence rule at
     * `model/validation/Option.json:L5`, which is its sole enforcement. See
     * {@link optionGroupRequiredConstraint}.
     */
    readonly optionGroup?: unknown;

    /**
     * `property name="skus" singularname="sku" cfc="Sku" fieldtype="many-to-many"
     * linktable="SwSkuOption" fkcolumn="optionID" inversejoincolumn="skuID" inverse="true";`
     * [`model/entity/Option.cfc:L66`] — read by the delete guard at `model/validation/Option.json:L6`.
     */
    readonly skus?: readonly unknown[];
  };

/**
 * Resolves the entity an `optionCode` uniqueness check runs against: the subject itself.
 *
 */
export const resolveOptionUniqueTarget: UniqueTargetResolver<OptionValidationSubject> = (
  subject: OptionValidationSubject,
): UniquePropertyEntity => subject;

/* The four property identifiers — all four compile-checked as real. */

const OPTION_CODE_PROPERTY: Extract<OptionPropertyName, 'optionCode'> = 'optionCode';

const OPTION_NAME_PROPERTY: Extract<OptionPropertyName, 'optionName'> = 'optionName';

const OPTION_GROUP_PROPERTY: Extract<OptionPropertyName, 'optionGroup'> = 'optionGroup';

const SKUS_PROPERTY: Extract<OptionPropertyName, 'skus'> = 'skus';

/* The two contexts. */

const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

/* Rule 1 of 4 — `model/validation/Option.json:L3` */

/** `optionCode` must be present when an option is saved. */
export const optionCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/** `optionCode` must not already be in use when an option is saved. */
export const optionCodeUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: resolveOptionUniqueTarget,
} as const) satisfies UniqueConstraint<OptionValidationSubject>;

/** `optionCode` must match the catalog code format when an option is saved. */
export const optionCodeRegexConstraint = Object.freeze({
  constraintType: 'regex',
  constraintValue: CODE_FORMAT_REGEX,
} as const) satisfies RegexConstraint;

/** `optionName` must be present when an option is saved. */
export const optionNameRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/** `optionGroup` must be present when an option is saved. */
export const optionGroupRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/* Rule 4 of 4 — `model/validation/Option.json:L6` (the document's only delete guard) */

/** An option still carried by any SKU cannot be deleted. */
export const skusMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/* The four property validations. */

/** `optionCode` — presence, uniqueness and format, in the source document's own key order. */
export const optionCodeValidation = Object.freeze({
  propertyIdentifier: OPTION_CODE_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.optionCode,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([
        optionCodeRequiredConstraint,
        optionCodeUniqueConstraint,
        optionCodeRegexConstraint,
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/** `optionName` — presence only. See {@link optionNameRequiredConstraint}. */
export const optionNameValidation = Object.freeze({
  propertyIdentifier: OPTION_NAME_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.optionName,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([optionNameRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/**
 * `optionGroup` — presence only, and the sole live enforcement of the required relationship. See
 * {@link optionGroupRequiredConstraint}.
 */
export const optionGroupValidation = Object.freeze({
  propertyIdentifier: OPTION_GROUP_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.optionGroup,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([optionGroupRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/**
 * `skus` — the delete guard, and the document's only rule outside the save context. See
 * {@link skusMaxCollectionConstraint}.
 */
export const skusValidation = Object.freeze({
  propertyIdentifier: SKUS_PROPERTY,
  read: (subject: OptionValidationSubject): unknown => subject.skus,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([skusMaxCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionValidationSubject>;

/**
 * The complete `Option` rule set — the typed equivalent of the whole of `model/validation/Option.json`.
 */
export const optionValidationRuleSet = Object.freeze({
  properties: Object.freeze([
    optionCodeValidation,
    optionNameValidation,
    optionGroupValidation,
    skusValidation,
  ] as const),
} as const) satisfies ValidationRuleSet<OptionValidationSubject>;

/* The properties this document does not constrain — AAP §0.7.3 / IR-12. */
