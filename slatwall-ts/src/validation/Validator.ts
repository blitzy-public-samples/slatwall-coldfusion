/**
 * `Validator` — the typed rule-set evaluation engine of the extracted Catalog slice.
 *
 * Ported from `org/Hibachi/HibachiValidationService.cfc`. AAP §0.4.1.5 row 1 makes this file create and
 * that component reference: "Runtime JSON interpretation becomes typed rule-set evaluation with context
 * selection", over the seven transliterated documents in `./rules/`. Because those rule sets point here
 * for evaluation semantics, the generic semantics live in this header and theirs carry only
 * property-specific asymmetries.
 *
 * Six behaviours carry this engine's contract and each is named at the declaration that discharges it:
 * The dry-run switch, the open context string, the two-object process flow, the absence of any global
 * error flag, the two documented non-ports and the two-argument error call.
 */

import { ValidationError } from '../errors/ValidationError';
import type { UniquePropertyEntity, UniquePropertyPort } from '../ports/UniquePropertyPort';

/* Section 1 — CFML value semantics. */

/** The one absent value of CFML, expressed over the two of TypeScript. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

/** Whether `value` is what CFML calls a simple value: a string, a number, a boolean or a date. */
function isCfSimpleValue(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
}

/** The string form CFML would measure or compare a simple value by. */
function cfToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return '';
}

/** CFML's numeric test. */
function isCfNumeric(value: unknown): boolean {
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

/** The number CFML would compare a value as, or `undefined` when it would not compare it as one. */
function toCfNumber(value: unknown): number | undefined {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!isCfNumeric(value)) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number(value.trim());
  }
  return undefined;
}

/** The boolean CFML would cast a value to, or `undefined` when the value is not castable. */
function toCfBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (normalised === 'true' || normalised === 'yes') {
    return true;
  }
  if (normalised === 'false' || normalised === 'no') {
    return false;
  }
  if (isCfNumeric(normalised)) {
    return Number(normalised) !== 0;
  }
  return undefined;
}

/**
 * The legacy context gate — `org/Hibachi/HibachiValidationService.cfc:L162`, preserved verbatim in
 * behaviour and provably unreachable in effect.
 *
 * TODO(parity): `org/Hibachi/HibachiValidationService.cfc:L162` reads
 * `if(!isBoolean(arguments.context) || arguments.context)`, whose own comment is "If the context was
 * 'false' then we don't do any validation". A boolean-castable-false context therefore skips every
 * rule and returns an empty bag. That behaviour is carried across rather than repaired, per AAP
 * §0.6.7 "preserve and annotate, do not repair", and this is the annotation.
 */
function legacyContextDisablesValidation(context: ValidationContext): boolean {
  return toCfBoolean(context) === false;
}

/** CFML's loose equality, reproduced as the ladder that satisfies every observed case. */
function isCfLooseEqual(left: unknown, right: unknown): boolean {
  const leftNumber = toCfNumber(left);
  const rightNumber = toCfNumber(right);
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return leftNumber === rightNumber;
  }

  const leftBoolean = toCfBoolean(left);
  const rightBoolean = toCfBoolean(right);
  if (leftBoolean !== undefined && rightBoolean !== undefined) {
    return leftBoolean === rightBoolean;
  }

  if (!isCfSimpleValue(left) || !isCfSimpleValue(right)) {
    return false;
  }
  return cfToString(left).toLowerCase() === cfToString(right).toLowerCase();
}

/** Splits a CFML comma-delimited list into its elements. */
function cfListToArray(list: string): string[] {
  return list.split(',').filter((element) => element.length > 0);
}

/** CFML's case-insensitive list search, as a predicate. */
function cfListContainsNoCase(list: string, needle: unknown): boolean {
  if (!isCfSimpleValue(needle)) {
    return false;
  }
  const target = cfToString(needle).toLowerCase();
  if (target.length === 0) {
    return false;
  }
  return cfListToArray(list).some((element) => element.toLowerCase() === target);
}

/** The trailing segment of a property identifier, splitting on both the dot and the underscore. */
function cfLastSegment(propertyIdentifier: string): string {
  const segments = propertyIdentifier.split(/[._]/).filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1];
  return last ?? propertyIdentifier;
}

/** Whether `value` is what CFML would treat as a struct rather than as a component instance. */
function isCfStruct(value: unknown): value is object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The number of keys CFML would count in a struct. */
function cfStructCount(value: object): number {
  return Object.keys(value).length;
}

/** CFML's URL validity test, reproduced over its six documented protocols. */
function isCfUrlAnyProtocol(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const candidate = value.trim();
  if (candidate.length === 0 || /\s/.test(candidate)) {
    return false;
  }

  return /^(?:(?:https?|ftp|file):\/\/|(?:mailto|news):)[^\s]+$/i.test(candidate);
}

/* Section 2 — the typed constraint model. */

/** What this engine requires of the object being validated, and nothing more. */
export interface ValidationSubject {
  /** The subject's class name, used to compose the reported message. */
  getClassName(): string;

  /** Whether this subject actually has the named property. */
  hasProperty(propertyIdentifier: string): boolean;
}

/** Reads one property's current value off the subject. */
export type PropertyValueReader<TSubject extends ValidationSubject> = (
  subject: TSubject,
) => unknown;

/** Resolves the entity a uniqueness check should be performed against. */
export type UniqueTargetResolver<TSubject extends ValidationSubject> = (
  subject: TSubject,
) => UniquePropertyEntity;

/** Invokes a method-based validation rule against the subject. */
export type MethodRuleInvocation<TSubject extends ValidationSubject> = (
  subject: TSubject,
) => unknown;

/** The only two `dataType` values the seven in-scope documents declare. */
export type DataTypeConstraintValue = 'numeric' | 'url';

/** The value an equality constraint compares against. */
export type EqualityConstraintValue = string | number | boolean;

/**
 * Presence. The most-used constraint in the slice, at eighteen rules.
 *
 * TODO(parity): the legacy evaluator declares a constraint value
 * (`org/Hibachi/HibachiValidationService.cfc:L240`) and then never reads it, so presence is
 * enforced whatever the value says — a rule written with a false value would still require the
 * property. All eighteen in-scope rules declare true, so the quirk is unobservable here; it is
 * carried rather than repaired, and the field is kept so a rule set can transcribe its document
 * faithfully.
 */
export interface RequiredConstraint {
  readonly constraintType: 'required';
  readonly constraintValue: boolean;
}

/**
 * Application-side uniqueness, evaluated exclusively through the injected port.
 *
 * TODO(parity): as with presence, the legacy evaluator declares a constraint value at
 * `org/Hibachi/HibachiValidationService.cfc:L467` and never reads it, so the check always runs.
 * All seven in-scope rules declare true. Carried, not repaired.
 */
export interface UniqueConstraint<TSubject extends ValidationSubject> {
  readonly constraintType: 'unique';
  readonly constraintValue: boolean;

  /** Resolves the entity the port should check. See {@link UniqueTargetResolver}. */
  readonly uniqueTarget: UniqueTargetResolver<TSubject>;
}

/*
 * The six-protocol URL check is the whole check: `org/Hibachi/HibachiValidationService.cfc:L259`
 * performs one check, so this performs one check.
 */

/** The `numeric` arm of `dataType`. Six of the seven in-scope `dataType` rules are this one. */
export interface NumericDataTypeConstraint {
  readonly constraintType: 'dataType';
  readonly constraintValue: 'numeric';
}

/**
 * The `url` arm of `dataType`. Exactly one in-scope rule is this one, at
 * `model/validation/Brand.json:L4`.
 */
export interface UrlDataTypeConstraint {
  readonly constraintType: 'dataType';
  readonly constraintValue: 'url';
}

/**
 * Format checking, restricted to the two types the seven documents use, discriminated on
 * {@link DataTypeConstraintValue}.
 */
export type DataTypeConstraint = NumericDataTypeConstraint | UrlDataTypeConstraint;

/** A numeric floor. All three in-scope rules declare zero, on the SKU money properties. */
export interface MinValueConstraint {
  readonly constraintType: 'minValue';
  readonly constraintValue: number;
}

/**
 * A trimmed-length ceiling. Exactly one in-scope rule, the system-code delete guard at
 * `model/validation/ProductType.json:L7`, which declares zero.
 */
export interface MaxLengthConstraint {
  readonly constraintType: 'maxLength';
  readonly constraintValue: number;
}

/**
 * A collection floor. Three in-scope rules, all declaring one, all on the unused-option collections
 * of `model/validation/Product.json:L13-L15`.
 */
export interface MinCollectionConstraint {
  readonly constraintType: 'minCollection';
  readonly constraintValue: number;
}

/**
 * A collection ceiling — the delete-guard workhorse, at nine of the slice's rules, every one
 * declaring zero. It is how "this record still has dependants, so refuse to delete it" is
 * expressed for physical counts, products, child product types, options and SKUs.
 */
export interface MaxCollectionConstraint {
  readonly constraintType: 'maxCollection';
  readonly constraintValue: number;
}

/**
 * A pattern check. Three in-scope rules share one pattern, on the three code properties at
 * `model/validation/Product.json:L10`, `model/validation/Option.json:L3` and
 * `model/validation/OptionGroup.json:L4`.
 */
export interface RegexConstraint {
  readonly constraintType: 'regex';
  readonly constraintValue: string;
}

/**
 * Loose equality — the other delete-guard idiom, and the one whose comparison rules matter most.
 */
export interface EqualityConstraint {
  readonly constraintType: 'eq';
  readonly constraintValue: EqualityConstraintValue;
}

/** Membership in a comma-delimited list, matched case-insensitively. */
export interface InListConstraint {
  readonly constraintType: 'inList';
  readonly constraintValue: string;
}

/**
 * A method-based rule: the subject decides for itself, and may query the database to do it.
 *
 * TODO(parity): the hint comment at `model/entity/Sku.cfc:L771` is a verbatim copy of the one at
 * `model/entity/Sku.cfc:L755` and therefore misdescribes `hasOneOptionPerOptionGroup` as checking
 * option-combination uniqueness, which is what its neighbour checks. Recorded, not corrected: the
 * comment is legacy source text and no register entry is invented for it.
 */
export interface MethodConstraint<TSubject extends ValidationSubject> {
  readonly constraintType: 'method';
  readonly constraintValue: string;
  readonly invoke: MethodRuleInvocation<TSubject>;
}

/** The eleven constraint kinds, as a discriminated union over `constraintType`. */
export type Constraint<TSubject extends ValidationSubject> =
  | RequiredConstraint
  | UniqueConstraint<TSubject>
  | DataTypeConstraint
  | MinValueConstraint
  | MaxLengthConstraint
  | MinCollectionConstraint
  | MaxCollectionConstraint
  | RegexConstraint
  | EqualityConstraint
  | InListConstraint
  | MethodConstraint<TSubject>;

/* Section 3 — rules, conditions and rule sets. */

/**
 * One rule of a property: an optional context gate, an optional condition gate, and the constraints
 * the rule imposes when both gates pass.
 */
export interface ValidationRule<TSubject extends ValidationSubject> {
  /** The comma-delimited context list this rule applies to, matched case-insensitively. */
  readonly contexts?: string;

  /**
   * The comma-delimited list of condition names that gate this rule, resolved against the rule set's
   * own conditions.
   */
  readonly conditions?: string;

  readonly constraints: readonly Constraint<TSubject>[];
}

/**
 * One constraint inside a named condition: which property to read, how to read it, and what to
 * require of it.
 */
export interface ConditionConstraint<TSubject extends ValidationSubject> {
  readonly propertyIdentifier: string;

  readonly read: PropertyValueReader<TSubject>;

  readonly constraint: Constraint<TSubject>;
}

/** A named condition: all of its constraints must hold for the condition to be met. */
export interface ValidationCondition<TSubject extends ValidationSubject> {
  readonly name: string;

  readonly constraints: readonly ConditionConstraint<TSubject>[];
}

/**
 * All the rules for one property: the identifier failures are reported under, how to read the
 * value, and the rules themselves.
 */
export interface PropertyValidation<TSubject extends ValidationSubject> {
  /**
   * The property identifier, exactly as the legacy document keys it — `productCode`, `options`,
   * `physicalCounts`, `baseProductType` and so on. This is the error key.
   */
  readonly propertyIdentifier: string;

  readonly read: PropertyValueReader<TSubject>;

  readonly rules: readonly ValidationRule<TSubject>[];
}

/**
 * One transliterated validation document: the typed replacement for a `model/validation/*.json`
 * file.
 */
export interface ValidationRuleSet<TSubject extends ValidationSubject> {
  readonly properties: readonly PropertyValidation<TSubject>[];

  /** The document's named conditions, if it declares any. */
  readonly conditions?: readonly ValidationCondition<TSubject>[];
}

/** How to run one validation pass. */
/**
 * The nine validation contexts this slice can select — a closed union. The open context
 * string the legacy accepts is narrowed here to the nine this slice can reach.
 */
export type ValidationContext =
  | ''
  | 'save'
  | 'delete'
  | 'edit'
  | 'process'
  | 'addOptionGroup'
  | 'addOption'
  | 'addSubscriptionTerm'
  | 'updateSkus';

export interface ValidateOptions {
  /** The bag to accumulate into. Omit for a dry run. */
  readonly errors?: ValidationError;
}

/**
 * The process object half of a two-object process validation. See {@link ProcessValidationRequest}.
 */
export interface ProcessObjectValidationTarget<TProcessObject extends ValidationSubject> {
  readonly subject: TProcessObject;

  /**
   * Its transliterated rule set, for example the one for `model/validation/Product_UpdateSkus.json`.
   */
  readonly ruleSet: ValidationRuleSet<TProcessObject>;

  readonly errors?: ValidationError;
}

/** The inputs of the two-object, single-context process flow — the engine contract. */
export interface ProcessValidationRequest<
  TEntity extends ValidationSubject,
  TProcessObject extends ValidationSubject,
> {
  readonly entity: TEntity;

  readonly entityRuleSet: ValidationRuleSet<TEntity>;

  /** The single context string used for both passes. */
  readonly processContext: ValidationContext;

  readonly entityErrors?: ValidationError;

  readonly processObject?: ProcessObjectValidationTarget<TProcessObject>;
}

/** The outcome of a two-object process validation. */
export interface ProcessValidationResult {
  readonly entityErrors: ValidationError;

  /** The process object's bag. */
  readonly processObjectErrors: ValidationError;

  /** Whether the process object was actually validated. */
  readonly processObjectRan: boolean;
}

/* Section 4 — message construction. */

/**
 * Composes the resource-bundle key a failed constraint is reported with.
 *
 */
export function buildValidationMessage<TSubject extends ValidationSubject>(
  context: ValidationContext,
  className: string,
  propertyIdentifier: string,
  constraint: Constraint<TSubject>,
): string {
  const propertyName = cfLastSegment(propertyIdentifier);
  const prefix = `validate.${context}.${className}.${propertyName}`;

  if (constraint.constraintType === 'method') {
    return `${prefix}.${constraint.constraintValue}`;
  }
  if (constraint.constraintType === 'dataType') {
    return `${prefix}.dataType.${constraint.constraintValue}`;
  }
  return `${prefix}.${constraint.constraintType}`;
}

/**
 * Renders an unknown value as a diagnostic token, or a neutral placeholder when it is not a usable
 * string.
 */
function describeToken(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'unrecognised';
}

/**
 * Describes an unrecognised constraint for the raise below, without reading a typed member off a
 * value the type system has already ruled out.
 */
function describeConstraintType(constraint: unknown): string {
  if (typeof constraint === 'object' && constraint !== null && 'constraintType' in constraint) {
    const { constraintType } = constraint;
    return describeToken(constraintType);
  }
  return 'unrecognised';
}

/** The outcome of evaluating one constraint. */
type ConstraintVerdict = 'pass' | 'fail' | 'unevaluable';

/** Lifts a legacy `validate_*` boolean into a {@link ConstraintVerdict}. */
function verdictOf(passed: boolean): ConstraintVerdict {
  return passed ? 'pass' : 'fail';
}

/** Raised for a constraint kind this engine does not evaluate. */
function unevaluableConstraint(
  className: string,
  propertyIdentifier: string,
  constraint: unknown,
): TypeError {
  return new TypeError(
    `Rule set for ${className} declares a constraint on '${propertyIdentifier}' of kind ` +
      `'${describeConstraintType(constraint)}', which this validator does not evaluate.`,
  );
}

/** Raised for a `dataType` value outside the two this engine evaluates. */
function unevaluableDataType(className: string, dataType: unknown): TypeError {
  return new TypeError(
    `Rule set for ${className} declares a dataType constraint of '${describeToken(dataType)}', ` +
      `which this validator does not evaluate.`,
  );
}

/**
 * Raised when a method-based rule resolves to something that cannot be read as a pass-or-fail
 * verdict.
 */
function uncoercibleMethodResult(className: string, methodName: string): TypeError {
  return new TypeError(
    `Method rule '${methodName}' on ${className} resolved to a value that cannot be read as a ` +
      `boolean verdict.`,
  );
}

/* Section 5 — the engine. */

/**
 * Evaluates typed rule sets against a subject and accumulates the failures.
 *
 * @example
 * ```ts
 * const validator = new Validator(uniquePropertyChecker);
 * Const errors = new ValidationError;
 * Await validator.validate(sku, skuRules, 'save', { errors });
 *
 * @example
 * ```ts
 * // A dry run — the equivalent of the deletability check at
 * // org/Hibachi/HibachiEntity.cfc:L205. No bag is supplied, so nothing the caller holds changes.
 * Const isDeletable = !(await validator.validate(product, productRules, 'delete')).hasErrors();
 * ```
 * ```
 */
export class Validator {
  /**
   * The uniqueness boundary, injected per AAP §0.7.3 and imported type-only so no runtime edge is
   * created from this layer to any adapter.
   */
  private readonly uniquePropertyPort: UniquePropertyPort;

  /**
   * @param uniquePropertyPort the application-side uniqueness check. Required rather than optional:
   * Seven in-scope rules depend on it, and for two of them — the option and option-group code
   * rules at `model/validation/Option.json:L3` and `model/validation/OptionGroup.json:L4` — no
   * database constraint exists behind it, so a validator without it would silently stop enforcing
   * uniqueness rather than degrade to a weaker guarantee.
   */
  public constructor(uniquePropertyPort: UniquePropertyPort) {
    this.uniquePropertyPort = uniquePropertyPort;
  }

  /**
   * Validates one subject against one rule set under one context, and returns the error bag.
   *
   * @param subject the object to validate
   * @param ruleSet its transliterated rule set, from `src/validation/rules/`
   */
  public async validate<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    options?: ValidateOptions,
  ): Promise<ValidationError> {
    const errors = options?.errors ?? new ValidationError();

    /*
     * `org/Hibachi/HibachiValidationService.cfc:L162` — the legacy context gate, preserved. See
     * {@link legacyContextDisablesValidation} for the locator, the TODO(parity) annotation and the
     * per-member proof that no value of {@link ValidationContext} can select it. That proof holds in
     * the type system only: no runtime guard stands in front of this branch, so a caller that arrives
     * past the type reaches it and switches validation off.
     */
    if (legacyContextDisablesValidation(context)) {
      return errors;
    }

    const className = subject.getClassName();

    for (const property of ruleSet.properties) {
      // `:L171` — silently skip a rule whose property the subject does not carry.
      if (!subject.hasProperty(property.propertyIdentifier)) {
        continue;
      }

      for (const rule of property.rules) {
        // `:L71` — the context gate. An absent context list means every context.
        if (!ruleAppliesToContext(rule, context)) {
          continue;
        }

        for (const constraint of rule.constraints) {
          // `:L177-L180` — the condition gate is re-evaluated for every constraint of the rule,
          // exactly as the legacy engine does, because it copied the rule's condition list onto each
          // flattened constraint record (`:L83-L85`) and then tested it per record. Hoisting the
          // check out of this loop would be a caching decision, and M7 forbids caching here.
          if (rule.conditions !== undefined) {
            const conditionsMet = await this.conditionsAreMet(subject, ruleSet, rule.conditions);
            if (!conditionsMet) {
              continue;
            }
          }

          const verdict = await this.evaluateConstraint(
            subject,
            property.propertyIdentifier,
            property.read,
            constraint,
            className,
          );

          // `:L201-L203` — in the main path an unrecognised constraint kind raises. Inside a
          // conditions block the same input is ignored instead; the two are not harmonised.
          if (verdict === 'unevaluable') {
            throw unevaluableConstraint(className, property.propertyIdentifier, constraint);
          }

          if (verdict === 'fail') {
            // `:L224`, `:L228`, `:L232` — reported against the full property identifier, with
            // exactly two arguments. The three-argument override at
            // `org/Hibachi/HibachiEntity.cfc:L151` is an entity concern and is never used from here.
            errors.addError(
              property.propertyIdentifier,
              buildValidationMessage(context, className, property.propertyIdentifier, constraint),
            );
          }
        }
      }
    }

    return errors;
  }

  /**
   * Runs the two-object, single-context process flow — the engine contract.
   *
   */
  public async validateProcess<
    TEntity extends ValidationSubject,
    TProcessObject extends ValidationSubject,
  >(request: ProcessValidationRequest<TEntity, TProcessObject>): Promise<ProcessValidationResult> {
    // `:L96` — the entity is validated first, under the process context.
    const entityErrors = await this.validate(
      request.entity,
      request.entityRuleSet,
      request.processContext,
      request.entityErrors === undefined ? undefined : { errors: request.entityErrors },
    );

    const target = request.processObject;

    // `:L99` — both halves of the gate: no entity errors, and a process object for this context.
    if (target === undefined || entityErrors.hasErrors()) {
      return {
        entityErrors,
        processObjectErrors: target?.errors ?? new ValidationError(),
        processObjectRan: false,
      };
    }

    // `:L108` — the process object is validated under the same context string.
    const processObjectErrors = await this.validate(
      target.subject,
      target.ruleSet,
      request.processContext,
      target.errors === undefined ? undefined : { errors: target.errors },
    );

    return { entityErrors, processObjectErrors, processObjectRan: true };
  }

  /** Evaluates a rule's condition list — `org/Hibachi/HibachiValidationService.cfc:L97-L131`. */
  private async conditionsAreMet<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    conditions: string,
  ): Promise<boolean> {
    const declared = ruleSet.conditions ?? [];

    for (const name of cfListToArray(conditions)) {
      // `:L108` — CFML struct keys are case-insensitive, so the name lookup is too.
      const condition = declared.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      );
      if (condition === undefined) {
        continue;
      }

      let allConstraintsMet = true;

      for (const conditionConstraint of condition.constraints) {
        const verdict = await this.evaluateConstraint(
          subject,
          conditionConstraint.propertyIdentifier,
          conditionConstraint.read,
          conditionConstraint.constraint,
          subject.getClassName(),
        );

        // `:L117` — an unrecognised constraint kind inside a conditions block is silently ignored,
        // because the legacy existence test short-circuits the conjunction before any evaluator
        // runs and so never clears the all-met flag. Skipping without recording a failure is what
        // reproduces that. Note what is not skipped: a raise from inside an evaluator that does
        // exist — the `dataType` whitelist raise at `:L263`, or a method result that cannot be read
        // as a verdict — still propagates out of this loop, exactly as it would in CFML.
        if (verdict === 'unevaluable') {
          continue;
        }

        // `:L118` — record and keep going. Deliberately not a break.
        if (verdict === 'fail') {
          allConstraintsMet = false;
        }
      }

      // `:L124-L126` — one met condition is enough for the whole list.
      if (allConstraintsMet) {
        return true;
      }
    }

    // `:L130` — no condition met, including the case of an empty list.
    return false;
  }

  /**
   * Dispatches one constraint to its evaluator — the typed replacement for
   * `org/Hibachi/HibachiValidationService.cfc:L200-L235`'s name-composed dynamic invocation.
   */
  private async evaluateConstraint<TSubject extends ValidationSubject>(
    subject: TSubject,
    propertyIdentifier: string,
    read: PropertyValueReader<TSubject>,
    constraint: Constraint<TSubject>,
    className: string,
  ): Promise<ConstraintVerdict> {
    switch (constraint.constraintType) {
      case 'required':
        return verdictOf(isPresent(read(subject)));

      case 'dataType':
        return verdictOf(satisfiesDataType(read(subject), constraint, className));

      case 'minValue':
        return verdictOf(satisfiesMinValue(read(subject), constraint.constraintValue));

      case 'maxLength':
        return verdictOf(satisfiesMaxLength(read(subject), constraint.constraintValue));

      case 'minCollection':
        return verdictOf(satisfiesMinCollection(read(subject), constraint.constraintValue));

      case 'maxCollection':
        return verdictOf(satisfiesMaxCollection(read(subject), constraint.constraintValue));

      case 'regex':
        return verdictOf(satisfiesRegex(read(subject), constraint.constraintValue));

      case 'eq':
        return verdictOf(satisfiesEquality(read(subject), constraint.constraintValue));

      case 'inList':
        return verdictOf(satisfiesInList(read(subject), constraint.constraintValue));

      case 'method':
        return verdictOf(await evaluateMethodRule(subject, constraint, className));

      case 'unique':
        // `:L467-L470` — the whole check is delegated, and the port's verdict is returned
        // unmodified. `true` means unique and therefore savable, and the polarity is the port’s. The property name
        // handed over is the trailing segment of the identifier, per `:L469`, while the error this
        // failure produces is still keyed by the full identifier.
        return verdictOf(
          await this.uniquePropertyPort.isUniqueProperty(
            cfLastSegment(propertyIdentifier),
            constraint.uniqueTarget(subject),
          ),
        );

      default:
        // Unreachable while the union holds. Reported rather than raised so the caller decides —
        // see the note on {@link ConstraintVerdict}.
        return 'unevaluable';
    }
  }
}

/* Section 6 — the eleven evaluators. */

/** The context gate — `org/Hibachi/HibachiValidationService.cfc:L71`. */
function ruleAppliesToContext<TSubject extends ValidationSubject>(
  rule: ValidationRule<TSubject>,
  context: ValidationContext,
): boolean {
  if (rule.contexts === undefined) {
    return true;
  }
  return cfListContainsNoCase(rule.contexts, context);
}

/** `required` — `org/Hibachi/HibachiValidationService.cfc:L240-L246`. */
function isPresent(value: unknown): boolean {
  if (isAbsent(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isCfSimpleValue(value)) {
    return cfToString(value).trim().length > 0;
  }
  if (isCfStruct(value)) {
    return cfStructCount(value) > 0;
  }
  // Anything object-like that is left is a component instance in CFML terms, and `:L242` passes any
  // component outright without inspecting it — which is exactly what makes a required entity
  // reference satisfiable by presence alone. The remaining primitive kinds JavaScript has and CFML
  // does not — symbols and arbitrary-precision integers — have no legacy counterpart to be faithful
  // to, and no reader in this slice can produce one, so they are not modelled as present.
  return typeof value === 'object' || typeof value === 'function';
}

/** `dataType` — `org/Hibachi/HibachiValidationService.cfc:L256-L267`. */
function satisfiesDataType(
  value: unknown,
  constraint: DataTypeConstraint,
  className: string,
): boolean {
  /*
   * Read the discriminant once, before any narrowing, so the unreachable branch below can still
   * name it. Narrowing `constraint` down to `never` also narrows any later read through it, which is
   * why this is a separate binding rather than a widening assignment or an `as` cast at the throw.
   */
  const dataType: DataTypeConstraintValue = constraint.constraintValue;

  if (isAbsent(value)) {
    return true;
  }
  if (constraint.constraintValue === 'numeric') {
    return isCfNumeric(value);
  }
  if (constraint.constraintValue === 'url') {
    /*
     * There is no policy selection here: `org/Hibachi/HibachiValidationService.cfc:L259` performs one
     * check, so this performs one check — the legacy six-protocol approximation, with the two
     * unconditional syntactic rules that check implies.
     */
    return isCfUrlAnyProtocol(value);
  }
  /*
   * exhaustiveness. Both arms of `DataTypeConstraint` are handled above, so this branch is
   * unreachable through the type system — the guarantee the legacy engine lacked, since it dispatched
   * on a string read out of a JSON document. It is retained as the runtime counterpart of the
   * whitelist raise at `org/Hibachi/HibachiValidationService.cfc:L263`, reachable only by a rule set
   * assembled outside the type system.
   */
  throw unevaluableDataType(className, dataType);
}

/** `minValue` — `org/Hibachi/HibachiValidationService.cfc:L269-L275`. */
function satisfiesMinValue(value: unknown, minimum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (!isCfNumeric(value)) {
    return false;
  }
  const numeric = toCfNumber(value);
  return numeric !== undefined && numeric >= minimum;
}

/** `maxLength` — `org/Hibachi/HibachiValidationService.cfc:L293-L299`. */
function satisfiesMaxLength(value: unknown, maximum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (!isCfSimpleValue(value)) {
    return false;
  }
  return cfToString(value).trim().length <= maximum;
}

/** `minCollection` — `org/Hibachi/HibachiValidationService.cfc:L301-L307`. */
function satisfiesMinCollection(value: unknown, minimum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length >= minimum;
  }
  if (isCfStruct(value)) {
    return cfStructCount(value) >= minimum;
  }
  return false;
}

/** `maxCollection` — `org/Hibachi/HibachiValidationService.cfc:L309-L315`. */
function satisfiesMaxCollection(value: unknown, maximum: number): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length <= maximum;
  }
  if (isCfStruct(value)) {
    return cfStructCount(value) <= maximum;
  }
  return false;
}

/** `regex` — `org/Hibachi/HibachiValidationService.cfc:L481-L487`. */
function satisfiesRegex(value: unknown, pattern: string): boolean {
  if (isAbsent(value)) {
    return true;
  }
  if (!isCfSimpleValue(value)) {
    return false;
  }
  return new RegExp(pattern).test(cfToString(value));
}

/** `eq` — `org/Hibachi/HibachiValidationService.cfc:L385-L395`. */
function satisfiesEquality(value: unknown, expected: EqualityConstraintValue): boolean {
  if (isAbsent(value)) {
    return false;
  }
  return isCfLooseEqual(value, expected);
}

/** `inList` — `org/Hibachi/HibachiValidationService.cfc:L459-L465`. */
function satisfiesInList(value: unknown, list: string): boolean {
  if (isAbsent(value)) {
    return false;
  }
  return cfListContainsNoCase(list, value);
}

/** `method` — `org/Hibachi/HibachiValidationService.cfc:L333-L335`. */
async function evaluateMethodRule<TSubject extends ValidationSubject>(
  subject: TSubject,
  constraint: MethodConstraint<TSubject>,
  className: string,
): Promise<boolean> {
  const resolved: unknown = await constraint.invoke(subject);
  const verdict = toCfBoolean(resolved);
  if (verdict === undefined) {
    throw uncoercibleMethodResult(className, constraint.constraintValue);
  }
  return verdict;
}
