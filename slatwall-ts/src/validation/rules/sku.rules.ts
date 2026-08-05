/**
 * `sku.rules.ts` — the typed transliteration of `model/validation/Sku.json`, and the only one of the
 * seven documents that carries executable code.
 *
 * AAP §0.4.1.5 Validation Layer makes this file create against that document: "Numeric minimums,
 * skuCode uniqueness, and the two method rules wired to the domain methods rather than to strings".
 *
 * The generic evaluation semantics every constraint below relies on — the null verdict per constraint,
 * CFML loose equality, the error key, context selection, the two deliberate non-ports and the absence of
 * any memoisation — are stated once in `../Validator` and are not repeated here. AAP IR-4 singles this
 * document out: "Two `Sku` rules are method-based and execute real queries", and those two are the rules
 * at `model/validation/Sku.json:L5-L8` transcribed below.
 *
 */

import type {
  SkuNonPersistentPropertyName,
  SkuPropertyName,
  SkuValidatedPropertyName,
  SkusBySelectedOptionsLookup,
} from '../../domain/sku/Sku';
import type { UniquePropertyEntity } from '../../ports/UniquePropertyPort';
import type {
  DataTypeConstraint,
  EqualityConstraint,
  MaxCollectionConstraint,
  MethodConstraint,
  MinValueConstraint,
  PropertyValidation,
  RequiredConstraint,
  UniqueConstraint,
  UniqueTargetResolver,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

/** The validation view of a SKU that this rule set reads. */
export interface SkuValidationSubject extends ValidationSubject {
  /** Resolved ahead of validation; non-persistent at `model/entity/Sku.cfc:L105`. */
  readonly defaultFlag?: unknown;

  /** `model/entity/Sku.cfc:L55` — `ormtype="big_decimal"`, ORM `default="0"`. */
  readonly listPrice?: unknown;

  /** `model/entity/Sku.cfc:L76` — the many-to-many collection this SKU owns. */
  readonly options?: unknown;

  /** `model/entity/Sku.cfc:L56` — `ormtype="big_decimal"`, ORM `default="0"`. */
  readonly price?: unknown;

  /** `model/entity/Sku.cfc:L57` — `ormtype="big_decimal"`, ORM `default="0"`. */
  readonly renewalPrice?: unknown;

  /** `model/entity/Sku.cfc:L54` — `unique="true" length="50"`. */
  readonly skuCode?: unknown;

  /** Resolved ahead of validation; non-persistent at `model/entity/Sku.cfc:L121`. */
  readonly transactionExistsFlag?: unknown;

  /** Constrained by `model/validation/Sku.json:L13` but declared by no entity property. */
  readonly physicalCounts?: unknown;

  /**
   * `model/entity/Sku.cfc:L756-L769`. asynchronous — it reaches the database. The `lookup` parameter
   * is the injected replacement for the legacy `getProduct().getSkusBySelectedOptions(...)` reach at
   * `:L763`; see {@link createHasUniqueOptionsConstraint} for why it is supplied per invocation.
   */
  hasUniqueOptions(lookup: SkusBySelectedOptionsLookup): Promise<boolean>;

  /**
   * `model/entity/Sku.cfc:L772-L784`. synchronous, pure and in-memory, and takes no argument in the
   * legacy source or here.
   */
  hasOneOptionPerOptionGroup(): boolean;
}

/** A SKU whose three delete-context guard values have actually been resolved. */
export interface ResolvedSkuDeleteSubject extends SkuValidationSubject {
  /** `model/validation/Sku.json:3` — `eq false`. Resolved, so the guard compares a real value. */
  readonly defaultFlag: boolean;

  /**
   * `model/validation/Sku.json:12` — `eq false`. Resolved from the existence query at
   * `model/dao/SkuDAO.cfc:L53`, which is why the resolution step is asynchronous.
   */
  readonly transactionExistsFlag: boolean;

  /** `model/validation/Sku.json:13` — `maxCollection 0`. See the note above. */
  readonly physicalCounts: readonly unknown[];
}

/** The eight property identifiers this rule set declares. */
export type SkuValidationPropertyIdentifier =
  SkuValidatedPropertyName | typeof PHYSICAL_COUNTS_IDENTIFIER;

/** Hands the subject to the uniqueness port unchanged. */
export function resolveSkuUniqueTarget(
  subject: SkuValidationSubject & UniquePropertyEntity,
): UniquePropertyEntity {
  return subject;
}

/** `save` — `model/validation/Sku.json:L4`, `:L6`, `:L7`, `:L9`, `:L10`, `:L11`. */
const SAVE_CONTEXT = 'save';

/** `delete` — `model/validation/Sku.json:L3`, `:L12`, `:L13`. */
const DELETE_CONTEXT = 'delete';

/** `defaultFlag` — `model/validation/Sku.json:L3`. */
const DEFAULT_FLAG_IDENTIFIER: Extract<SkuNonPersistentPropertyName, 'defaultFlag'> = 'defaultFlag';

/** `listPrice` — `model/validation/Sku.json:L4`; persistent at `model/entity/Sku.cfc:L55`. */
const LIST_PRICE_IDENTIFIER: Extract<SkuPropertyName, 'listPrice'> = 'listPrice';

/** `options` — `model/validation/Sku.json:L5-L8`; persistent at `model/entity/Sku.cfc:L76`. */
const OPTIONS_IDENTIFIER: Extract<SkuPropertyName, 'options'> = 'options';

/** `price` — `model/validation/Sku.json:L9`; persistent at `model/entity/Sku.cfc:L56`. */
const PRICE_IDENTIFIER: Extract<SkuPropertyName, 'price'> = 'price';

/** `renewalPrice` — `model/validation/Sku.json:L10`; persistent at `model/entity/Sku.cfc:L57`. */
const RENEWAL_PRICE_IDENTIFIER: Extract<SkuPropertyName, 'renewalPrice'> = 'renewalPrice';

/** `skuCode` — `model/validation/Sku.json:L11`; persistent at `model/entity/Sku.cfc:L54`. */
const SKU_CODE_IDENTIFIER: Extract<SkuPropertyName, 'skuCode'> = 'skuCode';

/** `transactionExistsFlag` — `model/validation/Sku.json:L12`. */
const TRANSACTION_EXISTS_FLAG_IDENTIFIER: Extract<
  SkuNonPersistentPropertyName,
  'transactionExistsFlag'
> = 'transactionExistsFlag';

/** `physicalCounts` — `model/validation/Sku.json:L13`. */
const PHYSICAL_COUNTS_IDENTIFIER: Exclude<
  'physicalCounts',
  SkuPropertyName | SkuNonPersistentPropertyName
> = 'physicalCounts';

/** The method name carried by the rule at `model/validation/Sku.json:L6`. */
const HAS_UNIQUE_OPTIONS_METHOD_NAME: Extract<keyof SkuValidationSubject, 'hasUniqueOptions'> =
  'hasUniqueOptions';

/** The method name carried by the rule at `model/validation/Sku.json:L7`. */
const HAS_ONE_OPTION_PER_OPTION_GROUP_METHOD_NAME: Extract<
  keyof SkuValidationSubject,
  'hasOneOptionPerOptionGroup'
> = 'hasOneOptionPerOptionGroup';

/*
 * Property 1 of 8 — `defaultFlag`, delete guard `model/validation/Sku.json:L3`
 */

/** `eq false` on `defaultFlag` — `model/validation/Sku.json:L3`. */
export const defaultFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: false,
} as const) satisfies EqualityConstraint;

export const defaultFlagDeleteRule = Object.freeze({
  contexts: DELETE_CONTEXT,
  constraints: Object.freeze([defaultFlagEqualityConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `defaultFlag` — the first of three delete guards. */
export const defaultFlagPropertyValidation = Object.freeze({
  propertyIdentifier: DEFAULT_FLAG_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.defaultFlag,
  rules: Object.freeze([defaultFlagDeleteRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/*
 * Property 2 of 8 — `listPrice`, save `model/validation/Sku.json:L4`
 */

/** `dataType numeric` on `listPrice` — `model/validation/Sku.json:L4`. */
export const listPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/** `minValue 0` on `listPrice` — `model/validation/Sku.json:L4`. */
export const listPriceMinValueConstraint = Object.freeze({
  constraintType: 'minValue',
  constraintValue: 0,
} as const) satisfies MinValueConstraint;

/** The sole rule on `listPrice` — `model/validation/Sku.json:L4`. */
export const listPriceSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([listPriceDataTypeConstraint, listPriceMinValueConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `listPrice` — `model/validation/Sku.json:L4`; persistent at `model/entity/Sku.cfc:L55`. */
export const listPricePropertyValidation = Object.freeze({
  propertyIdentifier: LIST_PRICE_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.listPrice,
  rules: Object.freeze([listPriceSaveRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/*
 * Property 3 of 8 — `options`, two method rules `model/validation/Sku.json:L5-L8`
 */

/**
 * `method hasUniqueOptions` — `model/validation/Sku.json:L6`. asynchronous: it queries the database.
 *
 * TODO(parity) D19 — model/entity/Sku.cfc:L764 — AAP §0.6.2. an option-less SKU fails this rule
 * whenever its product already has option-bearing SKUS, and that defect is carried, not repaired.
 */
export function createHasUniqueOptionsConstraint(
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): MethodConstraint<SkuValidationSubject> {
  const constraint: MethodConstraint<SkuValidationSubject> = {
    constraintType: 'method',
    constraintValue: HAS_UNIQUE_OPTIONS_METHOD_NAME,
    invoke: (subject: SkuValidationSubject): Promise<boolean> =>
      subject.hasUniqueOptions(selectedOptionsLookup),
  };

  return Object.freeze(constraint);
}

/**
 * `method hasOneOptionPerOptionGroup` — `model/validation/Sku.json:L7`. synchronous, pure, in-memory.
 */
export const hasOneOptionPerOptionGroupMethodConstraint = Object.freeze({
  constraintType: 'method',
  constraintValue: HAS_ONE_OPTION_PER_OPTION_GROUP_METHOD_NAME,
  invoke: (subject: SkuValidationSubject): boolean => subject.hasOneOptionPerOptionGroup(),
} as const) satisfies MethodConstraint<SkuValidationSubject>;

/** The first rule object on `options` — `model/validation/Sku.json:L6`, save context. */
export function createHasUniqueOptionsSaveRule(
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): ValidationRule<SkuValidationSubject> {
  const rule: ValidationRule<SkuValidationSubject> = {
    contexts: SAVE_CONTEXT,
    constraints: Object.freeze([createHasUniqueOptionsConstraint(selectedOptionsLookup)]),
  };

  return Object.freeze(rule);
}

export const hasOneOptionPerOptionGroupSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([hasOneOptionPerOptionGroupMethodConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `options` — two rule objects, in source-document order. */
export function createOptionsPropertyValidation(
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): PropertyValidation<SkuValidationSubject> {
  const propertyValidation: PropertyValidation<SkuValidationSubject> = {
    propertyIdentifier: OPTIONS_IDENTIFIER,
    read: (subject: SkuValidationSubject): unknown => subject.options,
    rules: Object.freeze([
      createHasUniqueOptionsSaveRule(selectedOptionsLookup),
      hasOneOptionPerOptionGroupSaveRule,
    ]),
  };

  return Object.freeze(propertyValidation);
}

/*
 * Property 4 of 8 — `price`, save `model/validation/Sku.json:L9`
 */

/** `required` on `price` — `model/validation/Sku.json:L9`. the only required price of the three. */
export const priceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/** `dataType numeric` on `price` — `model/validation/Sku.json:L9`. */
export const priceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/** `minValue 0` on `price` — `model/validation/Sku.json:L9`. */
export const priceMinValueConstraint = Object.freeze({
  constraintType: 'minValue',
  constraintValue: 0,
} as const) satisfies MinValueConstraint;

/**
 * The sole rule on `price` — `model/validation/Sku.json:L9`, three constraints in source key order.
 */
export const priceSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([
    priceRequiredConstraint,
    priceDataTypeConstraint,
    priceMinValueConstraint,
  ]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `price` — `model/validation/Sku.json:L9`; persistent at `model/entity/Sku.cfc:L56`. */
export const pricePropertyValidation = Object.freeze({
  propertyIdentifier: PRICE_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.price,
  rules: Object.freeze([priceSaveRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/*
 * Property 5 of 8 — `renewalPrice`, save `model/validation/Sku.json:L10`
 */

/** `dataType numeric` on `renewalPrice` — `model/validation/Sku.json:L10`. */
export const renewalPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies DataTypeConstraint;

/** `minValue 0` on `renewalPrice` — `model/validation/Sku.json:L10`. */
export const renewalPriceMinValueConstraint = Object.freeze({
  constraintType: 'minValue',
  constraintValue: 0,
} as const) satisfies MinValueConstraint;

export const renewalPriceSaveRule = Object.freeze({
  contexts: SAVE_CONTEXT,
  constraints: Object.freeze([renewalPriceDataTypeConstraint, renewalPriceMinValueConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `renewalPrice` — `model/validation/Sku.json:L10`; persistent at `model/entity/Sku.cfc:L57`. */
export const renewalPricePropertyValidation = Object.freeze({
  propertyIdentifier: RENEWAL_PRICE_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.renewalPrice,
  rules: Object.freeze([renewalPriceSaveRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/*
 * Property 6 of 8 — `skuCode`, save `model/validation/Sku.json:L11`
 */

/** `required` on `skuCode` — `model/validation/Sku.json:L11`. */
export const skuCodeRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `unique` on `skuCode` — `model/validation/Sku.json:L11`. the only uniqueness rule in this document.
 */
export function createSkuCodeUniqueConstraint<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): UniqueConstraint<TSubject> {
  const constraint: UniqueConstraint<TSubject> = {
    constraintType: 'unique',
    constraintValue: true,
    uniqueTarget: resolveUniqueTarget,
  };

  return Object.freeze(constraint);
}

/**
 * The sole rule on `skuCode` — `model/validation/Sku.json:L11`, two constraints in source key order.
 */
export function createSkuCodeSaveRule<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): ValidationRule<TSubject> {
  const rule: ValidationRule<TSubject> = {
    contexts: SAVE_CONTEXT,
    constraints: Object.freeze([
      skuCodeRequiredConstraint,
      createSkuCodeUniqueConstraint(resolveUniqueTarget),
    ]),
  };

  return Object.freeze(rule);
}

/**
 * `skuCode` — `model/validation/Sku.json:L11`; persistent and column-unique at `model/entity/Sku.cfc:L54`.
 */
export function createSkuCodePropertyValidation<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
): PropertyValidation<TSubject> {
  const propertyValidation: PropertyValidation<TSubject> = {
    propertyIdentifier: SKU_CODE_IDENTIFIER,
    read: (subject: TSubject): unknown => subject.skuCode,
    rules: Object.freeze([createSkuCodeSaveRule(resolveUniqueTarget)]),
  };

  return Object.freeze(propertyValidation);
}

/*
 * Property 7 of 8 — `transactionExistsFlag`, delete guard `model/validation/Sku.json:L12`
 */

/** `eq false` on `transactionExistsFlag` — `model/validation/Sku.json:L12`. */
export const transactionExistsFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: false,
} as const) satisfies EqualityConstraint;

export const transactionExistsFlagDeleteRule = Object.freeze({
  contexts: DELETE_CONTEXT,
  constraints: Object.freeze([transactionExistsFlagEqualityConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/**
 * `transactionExistsFlag` — the second of three delete guards, and the second that reads no column.
 */
export const transactionExistsFlagPropertyValidation = Object.freeze({
  propertyIdentifier: TRANSACTION_EXISTS_FLAG_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.transactionExistsFlag,
  rules: Object.freeze([transactionExistsFlagDeleteRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/*
 * Property 8 of 8 — `physicalCounts`, delete guard `model/validation/Sku.json:L13`
 */

/** `maxCollection 0` on `physicalCounts` — `model/validation/Sku.json:L13`. */
export const physicalCountsMaxCollectionConstraint = Object.freeze({
  constraintType: 'maxCollection',
  constraintValue: 0,
} as const) satisfies MaxCollectionConstraint;

export const physicalCountsDeleteRule = Object.freeze({
  contexts: DELETE_CONTEXT,
  constraints: Object.freeze([physicalCountsMaxCollectionConstraint]),
}) satisfies ValidationRule<SkuValidationSubject>;

/** `physicalCounts` — declared verbatim, and inert at run time. */
export const physicalCountsPropertyValidation = Object.freeze({
  propertyIdentifier: PHYSICAL_COUNTS_IDENTIFIER,
  read: (subject: SkuValidationSubject): unknown => subject.physicalCounts,
  rules: Object.freeze([physicalCountsDeleteRule]),
}) satisfies PropertyValidation<SkuValidationSubject>;

/*
 * What this document does not declare — AAP §0.7.3, invent nothing.
 */

/**
 * Assembles the complete `Sku` rule set — the transliteration of `model/validation/Sku.json` as a whole.
 *
 * @param resolveUniqueTarget exposes the entity being saved to the uniqueness port; pass
 * {@link resolveSkuUniqueTarget} unless a caller has a genuine reason to adapt it.
 *
 * @param selectedOptionsLookup resolves the SKUs matching an option selection, for the request currently
 * in flight. Must be scoped to the active transaction so `hasUniqueOptions` observes sibling SKUs
 * already written by the same combination batch.
 */
export function createSkuValidationRules<TSubject extends SkuValidationSubject>(
  resolveUniqueTarget: UniqueTargetResolver<TSubject>,
  selectedOptionsLookup: SkusBySelectedOptionsLookup,
): ValidationRuleSet<TSubject> {
  const ruleSet: ValidationRuleSet<TSubject> = {
    properties: Object.freeze([
      defaultFlagPropertyValidation,
      listPricePropertyValidation,
      createOptionsPropertyValidation(selectedOptionsLookup),
      pricePropertyValidation,
      renewalPricePropertyValidation,
      createSkuCodePropertyValidation(resolveUniqueTarget),
      transactionExistsFlagPropertyValidation,
      physicalCountsPropertyValidation,
    ]),
  };

  return Object.freeze(ruleSet);
}
