/**
 * `optionGroup.rules.ts` — the typed transliteration of `model/validation/OptionGroup.json`.
 *
 * AAP §0.4.1.5 makes this file create against that document: "Name and code requirements, option delete
 * guard". AAP §0.2.1.5 adds the detail — "`optionGroupName` required, `optionGroupCode`
 * required/unique/regex; delete guard on options".
 *
 * The generic evaluation semantics every constraint below depends on — the null verdict per constraint,
 * the error key, context selection, the uniqueness polarity and the deliberate non-ports — are stated once
 * in `../Validator` and are not repeated here.
 *
 */

import type { OptionGroupPropertyName } from '../../domain/option/OptionGroup';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import { CODE_FORMAT_REGEX } from './product.rules';
import type {
  MaxCollectionConstraint,
  PropertyValidation,
  RegexConstraint,
  RequiredConstraint,
  UniqueConstraint,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/** What this rule set requires of the object being validated, and nothing more. */
export type OptionGroupValidationSubject = ValidationSubject &
  UniquePropertyEntity & {
    /**
     * `property name="optionGroupName" ormtype="string";`
     * [`model/entity/OptionGroup.cfc:L53`] — read by the presence rule at
     * [`model/validation/OptionGroup.json:L3`].
     */
    readonly optionGroupName?: string;

    /**
     * `property name="optionGroupCode" ormtype="string";`
     * [`model/entity/OptionGroup.cfc:L54`] — read by all three constraints of
     * [`model/validation/OptionGroup.json:L4`].
     */
    readonly optionGroupCode?: string;

    /**
     * The one-to-many option collection [`model/entity/OptionGroup.cfc:L70`] — read by the delete
     * guard at [`model/validation/OptionGroup.json:L5`].
     */
    readonly options?: readonly unknown[];
  };

/* Section 2 — the two contexts. */

/** The save context, as [`model/validation/OptionGroup.json:L3`] and [`:L4`] spell it. */
const SAVE_CONTEXT = 'save';

const DELETE_CONTEXT = 'delete';

/* Section 3 — the three property identifiers, and the ten names that get no rule. */

/** The error key for the name rule. [`model/validation/OptionGroup.json:L3`] */
const OPTION_GROUP_NAME_PROPERTY = 'optionGroupName' satisfies OptionGroupPropertyName;

/** The error key shared by all three code constraints. [`model/validation/OptionGroup.json:L4`] */
const OPTION_GROUP_CODE_PROPERTY = 'optionGroupCode' satisfies OptionGroupPropertyName;

/** The error key for the delete guard. [`model/validation/OptionGroup.json:L5`] */
const OPTIONS_PROPERTY = 'options' satisfies OptionGroupPropertyName;

/* The `sortOrder` non-declaration — a mandated omission, and the sharpest trap in this file. */

/* The other nine unconstrained properties — AAP §0.7.3, invent nothing. */

/* Section 4 — the five constraints. */

/** `optionGroupName` must be present on save. */
export const optionGroupNameRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `optionGroupCode` must be present on save — the first of three constraints on one rule object.
 */
export const optionGroupCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `optionGroupCode` must be unique on save — the second of three constraints on the same rule object.
 */
export const optionGroupCodeUniqueConstraint = Object.freeze({
  constraintType: 'unique',
  constraintValue: true,
  uniqueTarget: (subject: OptionGroupValidationSubject): UniquePropertyEntity => subject,
} as const) satisfies UniqueConstraint<OptionGroupValidationSubject>;

/**
 * `optionGroupCode` must match the shared code format on save — the third constraint of the same
 * rule object.
 */
export const optionGroupCodeRegexConstraint = Object.freeze({
  constraintType: 'regex',
  constraintValue: CODE_FORMAT_REGEX,
} as const) satisfies RegexConstraint;

/** The delete guard — an option group that still has options cannot be deleted. */
export const optionsMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

/* Section 5 — the three property rule sets. */

/** `optionGroupName` — presence on save. See {@link optionGroupNameRequiredConstraint}. */
export const optionGroupNameValidation = Object.freeze({
  propertyIdentifier: OPTION_GROUP_NAME_PROPERTY,
  read: (subject: OptionGroupValidationSubject): unknown => subject.optionGroupName,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([optionGroupNameRequiredConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionGroupValidationSubject>;

/**
 * `optionGroupCode` — the densest property in the document: one rule object, three independent
 * constraints, one error KEY.
 */
export const optionGroupCodeValidation = Object.freeze({
  propertyIdentifier: OPTION_GROUP_CODE_PROPERTY,
  read: (subject: OptionGroupValidationSubject): unknown => subject.optionGroupCode,
  rules: Object.freeze([
    Object.freeze({
      contexts: SAVE_CONTEXT,
      constraints: Object.freeze([
        optionGroupCodeRequiredConstraint,
        optionGroupCodeUniqueConstraint,
        optionGroupCodeRegexConstraint,
      ] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionGroupValidationSubject>;

/** `options` — the delete guard. See {@link optionsMaxCollectionConstraint}. */
export const optionsValidation = Object.freeze({
  propertyIdentifier: OPTIONS_PROPERTY,
  read: (subject: OptionGroupValidationSubject): unknown => subject.options,
  rules: Object.freeze([
    Object.freeze({
      contexts: DELETE_CONTEXT,
      constraints: Object.freeze([optionsMaxCollectionConstraint] as const),
    } as const),
  ] as const),
} as const) satisfies PropertyValidation<OptionGroupValidationSubject>;

/** The whole of `model/validation/OptionGroup.json`, as one typed value. */
export const optionGroupValidationRuleSet = Object.freeze({
  properties: Object.freeze([
    optionGroupNameValidation,
    optionGroupCodeValidation,
    optionsValidation,
  ] as const),
} as const) satisfies ValidationRuleSet<OptionGroupValidationSubject>;
