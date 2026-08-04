/**
 * Populate — metadata-driven population becomes typed, explicit field assignment.
 *
 * `populate` was the most-invoked behaviour on the legacy save path: every `save*` on every service
 * funnelled through it. It worked by reflecting over component metadata at runtime — walking
 * `getMetaData(this).properties` up the inheritance chain and branching on the `fieldtype`,
 * `hb_populateEnabled`, `hb_populateArray`, `hb_fileUpload`, `hb_sessionDefault` and `notNull`
 * attributes — then assigning through dynamically composed setter names, `this["set" & name]`. This
 * module replaces all of that with a declared, typed property-descriptor model: each entity and
 * process-object module declares its own descriptor table, this file consumes it and performs explicit
 * assignment, and no member is ever reached by name concatenation (TR-3).
 *
 * IR-8 — the primary source is slatwall code, not framework code. `model/entity/HibachiEntity.cfc` is
 * a local base class — `extends="Slatwall.org.Hibachi.HibachiEntity"` at [:L49] — and its `populate`
 * at [:L56] is a local override that calls `super.populate` at [:L59] and then adds behaviour of its
 * own. All six in-scope entities extend that class, so the effective behaviour is local override +
 * framework machinery in that order, and both halves are ported with the ordering preserved: the five
 * branches first, then the extension seam, then the fluent return.
 */

import { DomainError } from '../../errors/DomainError';
import type { PopulationAuthorizationPort } from '../../ports/AccountContextPort';
import type { UniquePropertyMetaData } from '../../ports/UniquePropertyPort';
import { ValidationError } from '../../errors/ValidationError';

import { parseExactDecimal } from '../../util/formatting';
import { isAuditPropertyName } from './AuditableEntity';

/*
 * Data-shape guards — the port of `isSimpleValue`, `isStruct` and `isArray`
 * `data` is `Record<string, unknown>`, never `any`, so under `noUncheckedIndexedAccess` every read
 * out of it is `unknown` and must be narrowed explicitly. These four local guards are that
 * narrowing. They are local by design: the legacy tests were CFML built-ins, so there is no shared
 * module they could sensibly be lifted into, and four guards do not warrant inventing one.
 */

type SimpleDataValue = string | number | boolean;

/**
 * Port of CFML `isSimpleValue`, narrowed to the three scalar shapes an HTTP request collection
 * can actually deliver: the CFML `form` and `url` scopes hold strings exclusively, and a parsed
 * JSON body yields strings, numbers and booleans.
 *
 * @param value - An unnarrowed value read out of the incoming payload.
 * @returns `true` when the value is a string, a number or a boolean.
 */
function isSimpleDataValue(value: unknown): value is SimpleDataValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Port of CFML `isStruct`.
 *
 * @param value - An unnarrowed value read out of the incoming payload.
 * @returns `true` when the value is a non-null, non-array, non-date object.
 */
function isStructDataValue(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/**
 * Port of CFML `isArray`.
 *
 * @param value - An unnarrowed value read out of the incoming payload.
 * @returns `true` when the value is an array.
 */
function isArrayDataValue(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Renders a simple value the way CFML would have rendered it on its way into a setter.
 *
 * @param value - A simple value narrowed by {@link isSimpleDataValue}.
 * @returns The value as a string.
 */
function renderSimpleValue(value: SimpleDataValue): string {
  return String(value);
}

/* Declared value types — why population coerces instead of stringifying. */

/** The legacy `ormtype` of a column property, as a closed union. */
export type ColumnValueType = 'string' | 'boolean' | 'integer' | 'bigDecimal' | 'untyped';

/** Message raised when a payload value cannot be represented in its property's declared type. */
const AMBIGUOUS_POPULATED_VALUE_MESSAGE =
  'A populated value cannot be represented in the declared type of its property';

/** Matches an optionally signed integer with no decimal point and no exponent. */
const INTEGER_TEXT_PATTERN = /^[+-]?\d+$/;

/** Matches an optionally signed decimal with no exponent — `12`, `12.`, `12.34`, `.34`, `-0.5`. */
const DECIMAL_TEXT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** The CFML literal words that cast to boolean true, lower-cased for comparison. */
const TRUE_TEXT_VALUES: readonly string[] = ['true', 'yes'];

/** The CFML literal words that cast to boolean false, lower-cased for comparison. */
const FALSE_TEXT_VALUES: readonly string[] = ['false', 'no'];

/** The outcome of coercing one payload value towards one declared type. */
type CoercionOutcome =
  | { readonly kind: 'assign'; readonly value: NonNullable<unknown> }
  | { readonly kind: 'clear' }
  | { readonly kind: 'ambiguous' };

/**
 * Coerces one trimmed payload value towards a declared boolean destination.
 *
 * @param value - The original payload value, before rendering.
 * @param trimmedText - The same value rendered and trimmed, supplied so it is computed once.
 * @returns The coercion outcome.
 */
function coerceBooleanValue(value: SimpleDataValue, trimmedText: string): CoercionOutcome {
  if (typeof value === 'boolean') {
    return { kind: 'assign', value };
  }

  const loweredText = trimmedText.toLowerCase();

  if (TRUE_TEXT_VALUES.includes(loweredText)) {
    return { kind: 'assign', value: true };
  }

  if (FALSE_TEXT_VALUES.includes(loweredText)) {
    return { kind: 'assign', value: false };
  }

  // Any number is a legal CFML boolean, and its truth is `!= 0`. `Number.isFinite` rejects `NaN`
  // and both infinities, none of which the legacy engine would have cast successfully either.
  if (DECIMAL_TEXT_PATTERN.test(trimmedText)) {
    const numericValue = Number(trimmedText);
    if (Number.isFinite(numericValue)) {
      return { kind: 'assign', value: numericValue !== 0 };
    }
  }

  return { kind: 'ambiguous' };
}

/**
 * Coerces one trimmed payload value towards a declared numeric destination.
 *
 * @param value - The original payload value, before rendering.
 * @param trimmedText - The same value rendered and trimmed.
 * @param wholeNumbersOnly - `true` for `'integer'`, `false` for `'bigDecimal'`.
 * @returns The coercion outcome.
 */
function coerceNumericValue(
  value: SimpleDataValue,
  trimmedText: string,
  wholeNumbersOnly: boolean,
): CoercionOutcome {
  if (typeof value === 'boolean') {
    return { kind: 'ambiguous' };
  }

  const pattern = wholeNumbersOnly ? INTEGER_TEXT_PATTERN : DECIMAL_TEXT_PATTERN;
  if (!pattern.test(trimmedText)) {
    return { kind: 'ambiguous' };
  }

  /*
   * — a `bigDecimal` destination never touches `Number(...)`. The text has already passed
   * {@link DECIMAL_TEXT_PATTERN}, so `parseExactDecimal` only normalises its spelling — supplying the
   * leading zero of `'.34'`, dropping the trailing point of `'12.'` — and cannot widen the accepted set,
   * because the exponent forms it would otherwise expand were rejected by that pattern one branch above.
   * `undefined` is unreachable for text the pattern accepted and is mapped to `ambiguous` rather than
   * asserted away, which is this file's established stance on an impossible-but-checkable state.
   */
  if (!wholeNumbersOnly) {
    const exact = parseExactDecimal(trimmedText);
    return exact === undefined ? { kind: 'ambiguous' } : { kind: 'assign', value: exact };
  }

  const numericValue = Number(trimmedText);
  if (!Number.isFinite(numericValue)) {
    return { kind: 'ambiguous' };
  }

  // A whole-number destination additionally requires the parsed value to survive as an exact
  // integer. `Number.isSafeInteger` rejects a digit string beyond 2^53-1, which would otherwise be
  // silently rounded to a different number than the caller sent.
  if (!Number.isSafeInteger(numericValue)) {
    return { kind: 'ambiguous' };
  }

  return { kind: 'assign', value: numericValue };
}

/**
 * Decides what branch 1 should do with one payload value, given the property's declared type.
 *
 * @param value - A simple value narrowed by {@link isSimpleDataValue}.
 * @param valueType - The property's declared legacy `ormtype`.
 * @param notNull - Whether the legacy declaration carries `notNull="true"`.
 * @returns The coercion outcome branch 1 acts on.
 */
function coerceDeclaredValue(
  value: SimpleDataValue,
  valueType: ColumnValueType,
  notNull: boolean,
): CoercionOutcome {
  const trimmedText = renderSimpleValue(value).trim();

  if (trimmedText === '' && !notNull) {
    return { kind: 'clear' };
  }

  switch (valueType) {
    case 'boolean':
      return coerceBooleanValue(value, trimmedText);
    case 'integer':
      return coerceNumericValue(value, trimmedText, true);
    case 'bigDecimal':
      return coerceNumericValue(value, trimmedText, false);
    case 'string':
    case 'untyped':
      // The legacy behaviour, preserved exactly: a rendered, trimmed string. For `'string'` the
      // destination genuinely is a string column; for `'untyped'` there is no declared destination
      // type at all. Note that a blank value only reaches here when `notNull` is set, which is one
      // property in the entire slice — `productName` [model/entity/Product.cfc:L55] — and the
      // legacy assigns the blank string in exactly that case too.
      return { kind: 'assign', value: trimmedText };
  }
}

/**
 * Counts the keys of a nested payload struct — the port of CFML `structCount()`.
 *
 * @param struct - A nested payload struct.
 * @returns The number of own enumerable keys.
 */
function countStructKeys(struct: Record<string, unknown>): number {
  return Object.keys(struct).length;
}

/**
 * Tests whether the incoming payload carries a key — the port of CFML `structKeyExists`.
 *
 * @param data - The incoming payload.
 * @param key - The key to look for.
 * @returns `true` when the payload carries the key as its own property.
 */
function hasDataKey(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/*
 * The declared model — what the five branches actually test, and nothing more
 * The legacy loop read whatever attributes happened to be present on a property's metadata. The
 * replacement is a closed, typed descriptor: one member per attribute the five branches genuinely
 * consult, and no member for an attribute they do not (AAP §0.7.3). Two attributes that a reader might
 * expect to find here are absent for exactly that reason:
 *
 * - `hb_formatType` — the live assignment at [org/Hibachi/HibachiTransient.cfc:L207] ignores it
 * entirely. See the note on branch 1.
 * - `hb_sessionDefault` — proven unreachable for every in-scope type. See the note on branch 1.
 */

/** The reachable values of the legacy `fieldtype` metadata attribute. */
export type PropertyKind = 'column' | 'many-to-one' | 'one-to-many' | 'many-to-many';

/** The legacy `hb_populateEnabled` attribute — tri-valued, not boolean. */
export type PopulateEnabled = false | 'public';

/** The field surface `populate` writes into. */
export type PopulationTarget<TPropertyName extends string> = {
  [TKey in TPropertyName]?: unknown;
};

/** Loads a related entity — the injected replacement for the legacy service lookup. */
export interface RelatedEntityLoader<TRelated extends object = object> {
  /**
   * Loads the related entity, returning a new transient instance when no such row exists — the
   * `{1=id, 2=true}` form at [org/Hibachi/HibachiTransient.cfc:L239] and [:L291].
   *
   * @param relatedId - The related entity's primary identifier, a 32-character identifier per IR-6.
   * @returns The loaded or newly created related entity. Never absent.
   */
  loadOrCreate(relatedId: string): TRelated;

  /**
   * Loads the related entity, or nothing at all when no such row exists — the `{1=id}` form at
   * [org/Hibachi/HibachiTransient.cfc:L261] and [:L353], where the legacy comment reads "if one
   * doesn't exist... this will be null" and the caller guards with `isNull()`.
   *
   * @param relatedId - The related entity's primary identifier, a 32-character identifier per IR-6.
   * @returns The loaded related entity, or `undefined` when there is none.
   */
  loadExisting(relatedId: string): TRelated | undefined;
}

/** Populates a related entity with its own descriptors — the recursion seam. */
export type SubPropertyPopulator<TRelated extends object = object> = (
  related: TRelated,
  data: Record<string, unknown>,
) => void;

/** Attributes shared by every descriptor, whatever its kind. */
interface PropertyDescriptorBase<TPropertyName extends string> {
  /**
   * The property name, which is also the payload key the master gate looks for
   * [org/Hibachi/HibachiTransient.cfc:L185] and the key the sub-property record is filed under
   * [:L248], [:L303].
   */
  readonly name: TPropertyName;

  /**
   * The public half of the tri-valued `hb_populateEnabled` attribute. Omit it for the ordinary case.
   */
  readonly populateEnabled?: 'public';
}

/**
 * A property the legacy declares `hb_populateEnabled="false"` — never writable from request data.
 */
export interface DisabledPropertyDescriptor<TPropertyName extends string> {
  /**
   * The property name — the payload key the master gate looks for
   * [org/Hibachi/HibachiTransient.cfc:L185], and the key whose presence is then discarded.
   */
  readonly name: TPropertyName;

  /**
   * Pinned to the literal `false`, which both ports `hb_populateEnabled="false"` and discriminates
   * this shape from {@link ColumnPropertyDescriptor}, whose own `populateEnabled` is narrowed to
   * `'public'`.
   */
  readonly populateEnabled: false;
}

/** A simple column property — the target of branch 1 and branch 2. */
export interface ColumnPropertyDescriptor<
  TPropertyName extends string,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind?: 'column';

  /** The property's declared legacy `ormtype`, as a closed union — required. */
  readonly valueType: ColumnValueType;

  /** The legacy `notNull` attribute — the single most consequential asymmetry in branch 1. */
  readonly notNull?: boolean;

  /**
   * The legacy `hb_populateArray` attribute, which opens branch 2
   * [org/Hibachi/HibachiTransient.cfc:L216]. The legacy gate requires the attribute to be present and
   * truthy, so only `populateArray: true` opens the branch. No in-scope type declares it; the member
   * exists because it is what makes that gate expressible, and a documented unreachable branch is
   * stronger than a silently dropped one.
   */
  readonly populateArray?: boolean;

  /**
   * The legacy `hb_fileUpload` attribute, honoured here for one purpose only: it excludes the
   * property from branch 1.
   */
  readonly fileUpload?: boolean;
}

/** A many-to-one relationship — the target of branch 3. */
export interface ManyToOnePropertyDescriptor<
  TPropertyName extends string,
  TRelated extends object = object,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind: 'many-to-one';

  /**
   * The name of the related entity's primary-identifier property — for example `'brandID'` for
   * `model/entity/Product.cfc:L68` `property name="brand" cfc="Brand" fieldtype="many-to-one"`.
   */
  readonly relatedPrimaryIdPropertyName: string;

  readonly loader: RelatedEntityLoader<TRelated>;

  /**
   * Populates the related entity when the nested payload carries more than the identifier —
   * [org/Hibachi/HibachiTransient.cfc:L245]. Declared in method syntax so a descriptor written
   * against a concrete related type stays assignable to the heterogeneous descriptor set without a
   * cast.
   *
   * @param related - The related entity resolved by {@link RelatedEntityLoader.loadOrCreate}.
   * @param data - The nested payload struct, identifier key included, exactly as the legacy passed
   * it.
   */
  populateRelated(related: TRelated, data: Record<string, unknown>): void;
}

/** A one-to-many relationship — the target of branch 4. */
export interface OneToManyPropertyDescriptor<
  TTarget,
  TPropertyName extends string,
  TRelated extends object = object,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind: 'one-to-many';

  readonly relatedPrimaryIdPropertyName: string;

  /**
   * The legacy `singularname` metadata attribute — for example `'sku'` for
   * [model/entity/Product.cfc:L73] and `'product'` for [model/entity/Brand.cfc:L61].
   */
  readonly singularName: string;

  readonly loader: RelatedEntityLoader<TRelated>;

  /**
   * Adds the related entity to this relationship — the injected replacement for
   * `this.invokeMethod("add#currentProperty.singularName#", {1=thisEntity})`
   * [org/Hibachi/HibachiTransient.cfc:L294].
   *
   * @param target - The entity being populated.
   * @param related - The related entity to add.
   */
  addRelated(target: TTarget, related: TRelated): void;

  populateRelated(related: TRelated, data: Record<string, unknown>): void;
}

/**
 * A many-to-many relationship — the target of branch 4 when the payload is an array, and of
 * branch 5 when it is a delimited identifier list. Both are reachable for the same property, and
 * the payload shape alone decides which one runs: [org/Hibachi/HibachiTransient.cfc:L273] versus
 * [:L310].
 */
export interface ManyToManyPropertyDescriptor<
  TTarget,
  TPropertyName extends string,
  TRelated extends object = object,
> extends PropertyDescriptorBase<TPropertyName> {
  readonly kind: 'many-to-many';

  readonly relatedPrimaryIdPropertyName: string;

  readonly singularName: string;

  readonly loader: RelatedEntityLoader<TRelated>;

  addRelated(target: TTarget, related: TRelated): void;

  /** See {@link ManyToOnePropertyDescriptor.populateRelated}; the legacy call is [:L300]. */
  populateRelated(related: TRelated, data: Record<string, unknown>): void;

  /**
   * Removes the related entity from this relationship — the injected replacement for
   * `this.invokeMethod("remove#currentProperty.singularname#", {1=existingRelatedEntities[m]})`
   * [org/Hibachi/HibachiTransient.cfc:L339]. Reached only from branch 5.
   *
   * @param target - The entity being populated.
   * @param related - The related entity whose relationship is being removed.
   */
  removeRelated(target: TTarget, related: TRelated): void;

  /**
   * Reads the currently related entities — the injected replacement for
   * `invokeMethod("get#currentProperty.name#")` [org/Hibachi/HibachiTransient.cfc:L319].
   *
   * @param target - The entity being populated.
   * @returns The currently related entities.
   */
  readRelated(target: TTarget): readonly TRelated[];

  /**
   * Reads a related entity's primary identifier — the injected replacement for
   * `existingRelatedEntities[m].invokeMethod("get#primaryIDPropertyName#")`
   * [org/Hibachi/HibachiTransient.cfc:L329]. (The legacy local holding the result is misspelled
   * `thisPrimrayID`; that is a variable name rather than observable behaviour, so it is cited here
   * and not reproduced.)
   *
   * @param related - A currently related entity.
   * @returns Its primary identifier.
   */
  readRelatedPrimaryId(related: TRelated): string;
}

/** Any one declared property. */
export type PopulatePropertyDescriptor<TTarget, TPropertyName extends string> =
  DisabledPropertyDescriptor<TPropertyName> | EnabledPropertyDescriptor<TTarget, TPropertyName>;

/**
 * Any declared property that population may actually write — everything except a
 * {@link DisabledPropertyDescriptor}.
 */
export type EnabledPropertyDescriptor<TTarget, TPropertyName extends string> =
  | ColumnPropertyDescriptor<TPropertyName>
  | ManyToOnePropertyDescriptor<TPropertyName>
  | OneToManyPropertyDescriptor<TTarget, TPropertyName>
  | ManyToManyPropertyDescriptor<TTarget, TPropertyName>;

/** One type's complete population contract — the declared replacement for `getProperties()`. */
export interface PropertyDescriptorSet<TTarget, TPropertyName extends string> {
  /**
   * The bare class name of the target — the legacy `this.getClassName` operand of arm 3
   * [org/Hibachi/HibachiTransient.cfc:L190].
   */
  readonly entityName: string;

  /**
   * Whether the target is a persistent entity (`true`) or a transient process object (`false`) —
   * the port of `isPersistent()` [org/Hibachi/HibachiObject.cfc:L11-L18], which returns true only
   * when the component metadata declares `persistent` and it is true.
   */
  readonly persistent: boolean;

  /** The declared properties, in the order the legacy loop would have visited them. */
  readonly properties: readonly PopulatePropertyDescriptor<TTarget, TPropertyName>[];
}

/** One entry in the populated-sub-property record. */
export type PopulatedSubPropertyValue = object | readonly object[];

/** Which sub-properties a population pass populated, keyed by property name. */
export type PopulatedSubPropertyRecord<TPropertyName extends string> = Partial<
  Record<TPropertyName, PopulatedSubPropertyValue>
>;

/**
 * The full outcome of a population pass: the target, and the record of what was populated beneath it.
 */
export interface PopulateResult<TTarget, TPropertyName extends string> {
  readonly target: TTarget;

  readonly populatedSubProperties: PopulatedSubPropertyRecord<TPropertyName>;
}

/*
 * The authorisation boundary — declared, consumed, and default-deny
 * The master gate's third condition [org/Hibachi/HibachiTransient.cfc:L186-L190] is a three-way or,
 * and two of its three arms consult the retired framework's request scope. Those two arms are
 * security behaviour, not incidental plumbing: `authenticateEntityPropertyCrudByAccount`
 * [org/Hibachi/HibachiAuthenticationService.cfc:L104-L120] permits a write only when the account is a
 * super user [:L106-L108] or when some permission group grants that entity property explicitly
 * [:L111-L116], and returns false otherwise [:L119]. The legacy default for a persistent entity is
 * therefore deny, and a port that answered "permitted" unconditionally would make every
 *
 * TODO(boundary): the rightful owner of an implementation is the access-control subsystem behind
 * `org/Hibachi/HibachiAuthenticationService.cfc`, which §0.2.2 excludes, together with the composition
 * root that knows a request's identity. Nothing in this subtree implements
 * {@link PopulationAuthorizationPort}, and nothing here fabricates a permissive default in its place.
 */

/** The two optional extension seams, both no-ops by default. */

/** Options for one population pass. */
export interface PopulateOptions<TTarget> {
  /** The per-property authorisation capability the master gate's second and third arms consult. */
  readonly authorization?: PopulationAuthorizationPort;

  /**
   * Runs before any property is examined — the port of the `beforePopulate` call at
   * [org/Hibachi/HibachiTransient.cfc:L172].
   *
   * @param target - The entity or process object about to be populated.
   * @param data - The incoming payload.
   */
  readonly beforePopulate?: (target: TTarget, data: Record<string, unknown>) => void;

  /**
   * Runs after every property has been examined and before the target is returned — the port of the
   * `afterPopulate` call at [org/Hibachi/HibachiTransient.cfc:L396].
   *
   * TODO(parity): this seam's legacy occupant is a declared TR-5 boundary omission. The local
   * Slatwall override at [model/entity/HibachiEntity.cfc:L56] ran the framework machinery first
   * [:L59] and then, in the very position this seam occupies, assigned custom attribute values: it
   * read `getAssignedAttributeSetSmartList().getRecords()` [:L62], lower-cased the entity name
   * [:L64-L65], looped attribute sets and their attributes against the incoming payload [:L68-L93],
   * called `av.invokeMethod("set#attributeType#", {1=this})` [:L80], added new attribute values via
   * `this.addAttributeValue(av)` [:L83-L85] and refreshed two cache structs [:L88-L89]. Every part of
   * that reaches the attribute subsystem, which is explicitly out of scope: §0.2.2.1 excludes the six
   *
   * @param target - The populated entity or process object.
   * @param data - The incoming payload.
   */
  readonly afterPopulate?: (target: TTarget, data: Record<string, unknown>) => void;
}

/*
 * Descriptor narrowing — explicit predicates rather than discriminant inference
 * `kind` is optional on the column descriptor, because a legacy property with no `fieldtype`
 * attribute behaves as a column [org/Hibachi/HibachiTransient.cfc:L193]. An optional discriminant
 * narrows unreliably inside an if/else chain, so each arm is gated by an explicit type predicate
 * instead. Every predicate is a plain comparison — no cast, no assertion, no suppression comment
 * (AAP §0.7.3) — and each reproduces its legacy gate literally.
 */

/**
 * Matches branch 1 and branch 2's shared gate fragment
 * `!structKeyExists(currentProperty, "fieldType") || currentProperty.fieldType == "column"`
 * [org/Hibachi/HibachiTransient.cfc:L193] and [:L216].
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a column or declares no kind at all.
 */
function isColumnDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ColumnPropertyDescriptor<TPropertyName> {
  return descriptor.kind === undefined || descriptor.kind === 'column';
}

/**
 * Matches branch 3's gate fragment `currentProperty.fieldType == "many-to-one"`
 * [org/Hibachi/HibachiTransient.cfc:L221].
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a many-to-one relationship.
 */
function isManyToOneDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ManyToOnePropertyDescriptor<TPropertyName> {
  return descriptor.kind === 'many-to-one';
}

/**
 * Matches branch 4's gate fragment
 * `currentProperty.fieldType == "one-to-many" or currentProperty.fieldType == "many-to-many"`
 * [org/Hibachi/HibachiTransient.cfc:L273]. Both kinds expose the same three members branch 4 uses,
 * so the union is directly usable without further narrowing.
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a one-to-many or many-to-many relationship.
 */
function isCollectionDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is
  | OneToManyPropertyDescriptor<TTarget, TPropertyName>
  | ManyToManyPropertyDescriptor<TTarget, TPropertyName> {
  return descriptor.kind === 'one-to-many' || descriptor.kind === 'many-to-many';
}

/**
 * Matches branch 5's gate fragment `currentProperty.fieldType == "many-to-many"`
 * [org/Hibachi/HibachiTransient.cfc:L310].
 *
 * @param descriptor - Any declared property.
 * @returns `true` when the property is a many-to-many relationship.
 */
function isManyToManyDescriptor<TTarget, TPropertyName extends string>(
  descriptor: EnabledPropertyDescriptor<TTarget, TPropertyName>,
): descriptor is ManyToManyPropertyDescriptor<TTarget, TPropertyName> {
  return descriptor.kind === 'many-to-many';
}

/*
 * The `_setProperty` port — the `exactOptionalPropertyTypes` CRUX, and the riskiest line in this file
 * `org/Hibachi/HibachiTransient.cfc:L806-L819` declares
 * `_setProperty(name, value, formatType='')` and branches on `structKeyExists(arguments, 'value')`:
 * With a value it dispatches through a dynamically composed setter name; without one it calls
 * `structDelete` on the property key, which its own comment describes as setting NULL for a
 * persistent entity.
 */

/**
 * Assigns a value to a declared property — the value-carrying half of `_setProperty`
 * [org/Hibachi/HibachiTransient.cfc:L809-L814].
 *
 * @param target - The field surface being populated.
 * @param propertyName - A name drawn from the declared property-name union.
 * @param value - The value to assign. Cannot be `undefined` or `null`.
 */
export function assignPropertyValue<TPropertyName extends string>(
  target: PopulationTarget<TPropertyName>,
  propertyName: TPropertyName,
  value: NonNullable<unknown>,
): void {
  target[propertyName] = value;
}

/**
 * Sets a declared property to NULL by deleting its key — the value-less half of `_setProperty`
 * [org/Hibachi/HibachiTransient.cfc:L815-L817], whose own comment reads "Remove the key from
 * variables, represents setting as NULL for persistent entities".
 *
 * @param target - The field surface being populated.
 * @param propertyName - A name drawn from the declared property-name union.
 */
export function clearPropertyValue<TPropertyName extends string>(
  target: PopulationTarget<TPropertyName>,
  propertyName: TPropertyName,
): void {
  delete target[propertyName];
}

/**
 * The third condition of the master gate — the three-way authorisation or at
 * [org/Hibachi/HibachiTransient.cfc:L186-L190]:
 *
 * !isPersistent()
 * ||
 * (getHibachiScope().getPublicPopulateFlag && structKeyExists(currentProperty,
 * "hb_populateEnabled") && currentProperty.hb_populateEnabled == "public")
 * ||
 * getHibachiScope().authenticateEntityProperty( crudType="update",
 * entityName=this.getClassName, propertyName=currentProperty.name)
 *
 * @param descriptorSet - The target's declared population contract.
 * @param descriptor - The specific property being considered.
 * @param authorization - The resolved authorisation context for this invocation.
 * @returns `true` when population of this property of this target is permitted.
 */
function isPopulationAuthorized<TTarget, TPropertyName extends string>(
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  descriptor: PopulatePropertyDescriptor<TTarget, TPropertyName>,
  authorization: PopulationAuthorizationPort,
): boolean {
  // arm 1 — `!isPersistent()`. A transient process object short-circuits the or on its first arm,
  // exactly as the legacy does, and never reaches the two arms below.
  if (!descriptorSet.persistent) {
    return true;
  }

  // Arm 2 — `getPublicPopulateFlag && hb_populateEnabled == "public"`. Operand order matches
  // [org/Hibachi/HibachiTransient.cfc:L188]. The legacy `structKeyExists` presence test and the
  // `== "public"` value test collapse into one comparison here because the descriptor member is
  // typed `'public' | undefined`, so absent and not-public are the same check.
  if (authorization.getPublicPopulateFlag() && descriptor.populateEnabled === 'public') {
    return true;
  }

  // Arm 3 — `authenticateEntityProperty( crudType="update", entityName=this.getClassName,
  // propertyName=currentProperty.name )`. Default deny lives in the implementation, whose contract
  // requires `false` whenever permission is absent, unknown or undeterminable; every terminal branch
  // of the legacy ladder returns false too.
  return authorization.authenticateEntityProperty({
    crudType: 'update',
    entityName: descriptorSet.entityName,
    propertyName: descriptor.name,
  });
}

/**
 * Branch 4's per-item kill switch, read out of the incoming payload rather than from a separate
 * argument — the second half of the gate at [org/Hibachi/HibachiTransient.cfc:L285]:
 *
 * (!structKeyExists(arguments.data, "populateSubProperties") || arguments.data.populateSubProperties)
 *
 * @param data - The incoming payload.
 * @returns `true` when sub-properties should be populated.
 */
function shouldPopulateSubProperties(data: Record<string, unknown>): boolean {
  if (!hasDataKey(data, 'populateSubProperties')) {
    return true;
  }
  const flag: unknown = data['populateSubProperties'];
  if (typeof flag === 'boolean') {
    return flag;
  }
  if (typeof flag === 'number') {
    return flag !== 0;
  }
  if (typeof flag === 'string') {
    const normalisedFlag = flag.trim().toLowerCase();
    return !(normalisedFlag === 'false' || normalisedFlag === 'no' || normalisedFlag === '0');
  }
  return true;
}

/**
 * Splits a CFML list into its elements.
 *
 * @param list - A comma-delimited identifier list, as branch 5 receives at
 * [org/Hibachi/HibachiTransient.cfc:L313].
 *
 * @returns The list's elements, in order.
 */
function splitCfmlList(list: string): string[] {
  return list.split(',').filter((element) => element.length > 0);
}

/**
 * Finds an identifier in the pending list, case-sensitively — the port of
 * `listFind( manyToManyIDList, thisPrimrayID )` at [org/Hibachi/HibachiTransient.cfc:L332].
 *
 * @param pendingRelatedIds - The identifiers still awaiting a relationship, split from the payload.
 * @param candidateId - The identifier of an already-related entity.
 * @returns The zero-based index of the match, or -1 when there is none.
 */
function findRelatedId(pendingRelatedIds: readonly string[], candidateId: string): number {
  return pendingRelatedIds.indexOf(candidateId);
}

/*
 * The ENGINE
 * `org/Hibachi/HibachiTransient.cfc:L169-L400` in one function, with the local Slatwall override's
 * ordering from `model/entity/HibachiEntity.cfc:L56-L96` wrapped around it (IR-8): the framework
 * machinery first, then the extension seam, then the fluent return.
 *
 * TODO(parity): the second loop — file upload — is not ported.
 * [org/Hibachi/HibachiTransient.cfc:L364-L393] is a separate second loop over the same property array,
 * running after the main loop closes. Its gate at [:L371] requires `hb_fileUpload` present and truthy,
 * `hb_fileAcceptMIMEType` present, a non-empty value and `structKeyExists(form, currentProperty.name)`
 */

/**
 * Populates a target from a payload and reports which sub-properties were populated.
 *
 * @param target - The entity or process object to populate, mutated in place.
 * @param data - The incoming payload. Keys matching no declared property are silently ignored, and
 * nothing is thrown for them.
 *
 * @param descriptorSet - The target's declared population contract.
 * @param authorization - The resolved authorisation context, supplying arms 2 and 3 of the master
 * gate. Its implementation must deny by default; see `../../ports/AccountContextPort`.
 *
 * @example
 * ```ts
 * // A column property, trimmed on the way in.
 * ```
 */
export function populateWithSubProperties<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(
  target: TTarget,
  data: Record<string, unknown>,
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  authorization: PopulationAuthorizationPort,
  options: PopulateOptions<TTarget> = {},
): PopulateResult<TTarget, TPropertyName> {
  /*
   * Per-call state only (M7). Both locals are created here, inside the invocation, and neither is ever
   * hoisted to module scope, where warm-container state would leak across invocations and therefore
   * across tenants.
   */
  const populatedSubProperties: PopulatedSubPropertyRecord<TPropertyName> = {};

  /*
   * Translation decision — the single widened write view.
   * `fields` is the same object as `target`, held at the supertype {@link PopulationTarget} so that a
   * declared key can be assigned or deleted. This is an ordinary assignment to a wider type, not a
   * cast: there is no `as`, no `any` and no non-null assertion anywhere in this file (AAP §0.7.3). The
   * widening is required because the legacy assignment is genuinely untyped — [:L207] pushes a trimmed
   * string into every simple property whatever its `ormtype` — and narrowing it would mean inventing
   * the coercion layer AAP §0.7.3 forbids. It is also what makes `delete` legal, since every member of the
   * view is optional.
   */
  const fields: PopulationTarget<TPropertyName> = target;

  // [:L172] beforePopulate. A genuine no-op for every in-scope type; see {@link PopulateOptions}.
  options.beforePopulate?.(target, data);

  /*
   * [:L175-L178] the legacy loop iterates declared properties, never payload keys. Declaration order
   * is therefore population order, and an unrecognised payload key is silently ignored. The metadata
   * walk and its application-scope cache have no analogue here; see {@link PropertyDescriptorSet}.
   */
  for (const descriptor of descriptorSet.properties) {
    const propertyName = descriptor.name;

    /*
     * Audit-field exclusion — applied first, unconditionally, ahead of every other check.
     */
    if (isAuditPropertyName(propertyName)) {
      continue;
    }

    /*
     * Master gate — [:L184-L190]. Three ANDed conditions, the third a three-way or.
     * Condition 1 — the payload must carry a key matching the property name.
     * Condition 2 — `hb_populateEnabled` must not be `false`. Tri-valued; see
     * {@link PopulateEnabled}. `'public'` and absent both pass, exactly as `neq false` does.
     */
    if (!hasDataKey(data, propertyName)) {
      continue;
    }
    if (descriptor.populateEnabled === false) {
      continue;
    }
    if (!isPopulationAuthorized(descriptorSet, descriptor, authorization)) {
      continue;
    }

    const rawValue: unknown = data[propertyName];

    if (
      isColumnDescriptor(descriptor) &&
      isSimpleDataValue(rawValue) &&
      descriptor.fileUpload === undefined
    ) {
      /*
       * Branch 1 (column) — [:L192-L213].
       * Gated on all three of: `fieldType` absent or `'column'`; a simple value; and `hb_fileUpload`
       * absent — a presence test, not a truthiness test, per
       * {@link ColumnPropertyDescriptor.fileUpload}.
       */
      /*
       * The declared-type coercion. This replaced an unconditional
       * `renderSimpleValue(rawValue).trim`; the full argument, the census of ORM types it is closed
       * over, the CFML-versus-JavaScript truthiness fact that makes the coercion a parity requirement,
       * the flagged execution-model relocation of the failure point, and the two rejected alternative
       * designs are all recorded in the declared value types block near the top of this file.
       */
      const outcome = coerceDeclaredValue(
        rawValue,
        descriptor.valueType,
        descriptor.notNull === true,
      );

      if (outcome.kind === 'clear') {
        clearPropertyValue(fields, propertyName);
      } else if (outcome.kind === 'assign') {
        assignPropertyValue(fields, propertyName, outcome.value);
      } else {
        /* Ambiguous — the value cannot be represented in the property's declared type. */
        throw new DomainError(AMBIGUOUS_POPULATED_VALUE_MESSAGE, {
          context: {
            entityName: descriptorSet.entityName,
            propertyName,
            valueType: descriptor.valueType,
          },
        });
      }
    } else if (
      isColumnDescriptor(descriptor) &&
      descriptor.populateArray === true &&
      isArrayDataValue(rawValue)
    ) {
      /*
       * Branch 2 (populate-array) — [:L215-L218].
       * No trim and no blank test: the array is assigned whole, exactly as [:L218] does.
       */
      assignPropertyValue(fields, propertyName, rawValue);
    } else if (isManyToOneDescriptor(descriptor) && isStructDataValue(rawValue)) {
      /*
       * Branch 3 (many-to-one, nested struct payload) — [:L220-L270].
       * [:L224] the nested struct; [:L227] the related primary-ID property name, which was a
       * string-keyed service lookup and is now a declaration.
       */
      const manyToOneStructData = rawValue;
      const relatedIdPropertyName = descriptor.relatedPrimaryIdPropertyName;

      /*
       * [:L230] if the primary-id key is absent from the nested struct, the whole branch does nothing
       * at all. Preserved literally.
       */
      if (hasDataKey(manyToOneStructData, relatedIdPropertyName)) {
        const relatedIdRawValue: unknown = manyToOneStructData[relatedIdPropertyName];

        /*
         * The identifier must be renderable. CFML would have handed a non-scalar straight to the DAO
         * and failed there; this file raises nothing (Gate 19), so a non-scalar identifier matches no
         * path and the branch does nothing — recorded rather than smoothed over.
         */
        if (isSimpleDataValue(relatedIdRawValue)) {
          const relatedId = renderSimpleValue(relatedIdRawValue);

          if (countStructKeys(manyToOneStructData) > 1) {
            /*
             * [:l236-l248] more than one key. Load with create-if-missing — [:L239] passes
             * `{1=id, 2=true}`, whose second positional argument is the createNew flag — then assign
             * [:L242], then recursively populate the sub-object with the same nested struct [:L245],
             * then record it [:L248]. The legacy write at [:L248] has no existence guard whatsoever;
             * The record here is initialised up front instead, for the reason given at the top of this
             * function.
             */
            const relatedEntity = descriptor.loader.loadOrCreate(relatedId);
            assignPropertyValue(fields, propertyName, relatedEntity);
            descriptor.populateRelated(relatedEntity, manyToOneStructData);
            populatedSubProperties[propertyName] = relatedEntity;
          } else if (relatedId === '') {
            /*
             * [:L252-L255] exactly one key, and it is empty. `_setProperty(name)` — NULL BY deletion.
             * The legacy comment at [:L251] is explicit that "in this way a null is a valid option".
             * The comparison is `== ""`, and the identifier is a 32-character string per IR-6.
             */
            clearPropertyValue(fields, propertyName);
          } else {
            /*
             * [:L257-L266] exactly one key, and it is an identifier. Load without create-if-missing —
             * [:L261] passes `{1=id}` and the legacy comment says "if one doesn't exist... this will be
             * null" — and assign only if the load returned something [:L263-L266].
             */
            const relatedEntity = descriptor.loader.loadExisting(relatedId);
            if (relatedEntity !== undefined) {
              assignPropertyValue(fields, propertyName, relatedEntity);
            }
          }
        }
      }
    } else if (isCollectionDescriptor(descriptor) && isArrayDataValue(rawValue)) {
      /*
       * Branch 4 (one-to-many / many-to-many, array payload) — [:L272-L308].
       * [:L276] the array; [:L279] the related primary-ID property name; [:L282] a forward loop.
       */
      const oneToManyArrayData = rawValue;
      const relatedIdPropertyName = descriptor.relatedPrimaryIdPropertyName;
      const recordedRelatedEntities: object[] = [];

      for (let itemIndex = 0; itemIndex < oneToManyArrayData.length; itemIndex += 1) {
        const item: unknown = oneToManyArrayData[itemIndex];

        /*
         * A non-struct element would have made CFML's `structKeyExists` at [:L285] fail outright.
         * Nothing is raised here (Gate 19), so such an element is skipped — a strict-typing
         * consequence, recorded rather than hidden.
         */
        if (!isStructDataValue(item)) {
          continue;
        }

        /*
         * [:L285] the per-item gate, and it is a data-level kill switch. Both halves:
         * The element must carry the related primary-ID key, and `populateSubProperties` must not be
         * switched off inside the payload. See {@link shouldPopulateSubProperties}.
         */
        if (!hasDataKey(item, relatedIdPropertyName)) {
          continue;
        }
        if (!shouldPopulateSubProperties(data)) {
          continue;
        }

        const relatedIdRawValue: unknown = item[relatedIdPropertyName];
        if (!isSimpleDataValue(relatedIdRawValue)) {
          continue;
        }

        /*
         * [:L288] re-resolves the entity service inside the loop, once per element. That is a legacy
         * inefficiency, and it is deliberately not "optimised" into anything with different behaviour
         * (AAP §0.7.3): with an injected loader it simply becomes a per-element loader call, which is exactly
         * what it was.
         */
        const relatedEntity = descriptor.loader.loadOrCreate(renderSimpleValue(relatedIdRawValue));

        /*
         * [:L294] the entity is added unconditionally, before the key-count test at [:L297].
         * It happens for every element that passes the gate above, however many keys the element
         * struct has. It looks like an oversight and it is not: moving it inside the key-count test
         * would change which relationships exist after a pass, so §0.8.2 Guideline 4 forbids the
         * change (AAP §0.7.3). The legacy call is
         * `this.invokeMethod("add#currentProperty.singularName#", {1=thisEntity})` — dynamic method
         * synthesis, replaced by the injected {@link OneToManyPropertyDescriptor.addRelated}.
         */
        descriptor.addRelated(target, relatedEntity);

        /*
         * [:L297-L306] only when the element struct has more than one key: recursively populate it
         * [:L300], then record it. The legacy record is an array here, lazily initialised behind a
         * guard at [:L302-L305]; the accumulated array is filed once below, which is observably
         * identical because each declared property is visited exactly once per pass, and the legacy
         * guard existed only because the enclosing struct was never initialised at all.
         */
        if (countStructKeys(item) > 1) {
          descriptor.populateRelated(relatedEntity, item);
          recordedRelatedEntities.push(relatedEntity);
        }
      }

      if (recordedRelatedEntities.length > 0) {
        populatedSubProperties[propertyName] = recordedRelatedEntities;
      }
    } else if (isManyToManyDescriptor(descriptor) && isSimpleDataValue(rawValue)) {
      /*
       * Branch 5 (many-to-many, delimited identifier list) — [:L309-L359]. The diff branch.
       * Net semantics, which must survive intact: this is a SET diff. Intersections are kept, entities
       * no longer listed are removed, identifiers not already related are added, and identifiers that
       * fail to load are silently skipped. It is deliberately not re-implemented as "clear then
       * re-add": that would change which objects survive the pass, and with them their identity and
       * any pending state (AAP §0.7.3).
       */
      const pendingRelatedIds = splitCfmlList(renderSimpleValue(rawValue));
      const existingRelatedEntities = descriptor.readRelated(target);

      /*
       * [:L326] a BACKWARD loop: `for(var m=arrayLen(existingRelatedEntities); m>=1; m--)`.
       * It iterates in reverse because the collection is mutated during iteration by the remove call
       * at [:L339] — the legacy read at [:L319] returns the live array from `variables`. A forward loop
       * with in-place removal skips elements, so the reverse iteration is reproduced. It is also
       * correct if an implementation of `readRelated` hands back a copy.
       */
      for (
        let existingIndex = existingRelatedEntities.length - 1;
        existingIndex >= 0;
        existingIndex -= 1
      ) {
        const existingRelatedEntity = existingRelatedEntities[existingIndex];

        /*
         * `noUncheckedIndexedAccess` types an indexed read as possibly absent. CFML's
         * `existingRelatedEntities[m]` could not be absent within `arrayLen` bounds, so this guard is
         * a strict-mode formality rather than a behavioural change — and it is a guard rather than the
         * non-null assertion `!`, which AAP §0.7.3 forbids.
         */
        if (existingRelatedEntity === undefined) {
          continue;
        }

        // [:L329] the existing relationship's primary identifier.
        const existingRelatedId = descriptor.readRelatedPrimaryId(existingRelatedEntity);

        // [:L332] `listFind` — case-sensitive ; see {@link findRelatedId} for the evidence.
        const matchIndex = findRelatedId(pendingRelatedIds, existingRelatedId);

        if (matchIndex >= 0) {
          /*
           * [:l334-l336] the relationship already EXISTS: drop the identifier from the pending list
           * (`listDeleteAt`) and leave the relationship itself untouched. The 1-based `listFind`
           * position becomes a 0-based index here; `matchIndex >= 0` is the port of CFML's truthy
           * non-zero test.
           */
          pendingRelatedIds.splice(matchIndex, 1);
        } else {
          /*
           * [:l337-l340] the relationship is no longer listed: remove it. The legacy call is
           * `this.invokeMethod("remove#currentProperty.singularname#", …)` — note the lower-case `n`,
           * against the capital `N` at [:L294]; see {@link OneToManyPropertyDescriptor.singularName}.
           */
          descriptor.removeRelated(target, existingRelatedEntity);
        }
      }

      /*
       * [:L343-L359] a forward pass over whatever identifiers remain: load each without
       * create-if-missing ([:L353] passes `{1=id}`) and add it only if the load returned something
       * ([:L355-L358]). Branch 5 records nothing in the populated-sub-property record.
       */
      for (const pendingRelatedId of pendingRelatedIds) {
        const relatedEntity = descriptor.loader.loadExisting(pendingRelatedId);
        if (relatedEntity !== undefined) {
          descriptor.addRelated(target, relatedEntity);
        }
      }
    }
  }

  /*
   * [:L396] afterPopulate, invoked immediately before the return at [:L399] — and, per IR-8, this is
   * also the position the local Slatwall override at [model/entity/HibachiEntity.cfc:L56] used for its
   * custom-attribute assignment, after `super.populate` at [:L59] and before `return this;` at
   * [:L96]. The seam is declared and invoked in exactly that position; its legacy occupant is a flagged
   * TR-5 boundary omission documented on {@link PopulateOptions.afterPopulate}.
   */
  options.afterPopulate?.(target, data);

  return { target, populatedSubProperties };
}

/**
 * Populates a target from a payload and returns the target — the fluent form.
 *
 * @param target - The entity or process object to populate, mutated in place.
 * @param data - The incoming payload. Keys matching no declared property are silently ignored.
 * @param descriptorSet - The target's declared population contract.
 * @param authorization - The resolved authorisation context, supplying arms 2 and 3 of the master
 * gate. Required, with no default; see {@link populateWithSubProperties}.
 *
 * @param options - The optional `beforePopulate` / `afterPopulate` seams.
 *
 * @example
 * ```ts
 * // `Brand` is persistent, so the authorisation context is required in effect: omit it and every
 * // declared property is skipped. `../../services/BaseService` assembles this object per save from
 * // its injected authoriser and the entity's own getClassName, so a service never writes it out.
 *
 * @example
 * ```ts
 * // A transient process object needs no authorisation context: arm 1 of the gate short-circuits, so
 * // this three-argument form is complete and correct for all three in-scope process objects.
 * Const populatedInput = populate(processObject, data, PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS);
 * ```
 * ```
 */
export function populate<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(
  target: TTarget,
  data: Record<string, unknown>,
  descriptorSet: PropertyDescriptorSet<TTarget, TPropertyName>,
  authorization: PopulationAuthorizationPort,
  options?: PopulateOptions<TTarget>,
): TTarget {
  return populateWithSubProperties(target, data, descriptorSet, authorization, options).target;
}

/*
 * The entity metadata surface — the port of "property introspection"
 * why it lives in this file. `org/Hibachi/HibachiTransient.cfc` is one component with two clearly
 * separated sections: "population & validation", which ends at [:L462], and "property
 * introspection", which begins at [:L463]. This module already ports the first. `hasProperty`
 * [:L763-L765], `getPropertyMetaData` [:L738-L747] and `getValueByPropertyIdentifier`
 */

/**
 * The property table one entity declares — the port of `getPropertiesStruct()`
 * [org/Hibachi/HibachiTransient.cfc:L791-L803].
 *
 * @typeParam TPropertyName - The union of property names this port carries as fields on the entity.
 */
export interface EntityMetadataDeclaration<TPropertyName extends string> {
  /**
   * The bare class name — the port of `getClassName`
   * [org/Hibachi/HibachiObject.cfc:L135-L137], which returns `listLast(getClassFullname(), ".")`,
   * i.e. the last dot-separated segment of the component path and nothing more.
   */
  readonly className: string;

  /**
   * The ORM logical entity name — the port of `getEntityName()`
   * [org/Hibachi/HibachiEntity.cfc:L287-L289], which returns `getMetaData(this).entityname`.
   */
  readonly entityName: string;

  /**
   * The name of the primary identifier property — the port of `getPrimaryIDPropertyName`
   * [org/Hibachi/HibachiEntity.cfc:L249-L251], which resolved it through the framework service by
   * entity name rather than declaring it, because the framework could see the `fieldtype="id"`
   * attribute at run time and this port cannot.
   */
  readonly primaryIDPropertyName: TPropertyName;

  /**
   * Every property name the entity declares and this port carries as a field, as an exhaustive
   * key set.
   */
  readonly properties: Readonly<Record<TPropertyName, true>>;

  /** Names the legacy entity declares that this port does not carry as a field. */
  readonly declaredNonFieldProperties?: Readonly<Record<string, true>>;
}

/** The seven framework members every in-scope entity inherited and no in-scope entity declares. */
export interface EntityMetadataSurface {
  /** See {@link EntityMetadataDeclaration.className}. */
  getClassName(): string;

  /** See {@link EntityMetadataDeclaration.entityName}. */
  getEntityName(): string;

  /** See {@link EntityMetadataDeclaration.primaryIDPropertyName}. */
  getPrimaryIDPropertyName(): string;

  /**
   * The entity's primary identifier value — the port of `getPrimaryIDValue`
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which invokes the generated getter for whichever
   * property `getPrimaryIDPropertyName` names. This implementation reads the same named field, so
   * the legacy relationship between the two members is preserved by construction rather than by two
   * independent declarations that could disagree.
   */
  getPrimaryIDValue(): string;

  /**
   * Whether the entity declares the named property — the port of `hasProperty`
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   */
  hasProperty(propertyIdentifier: string): boolean;

  /**
   * The named property's metadata — the port of `getPropertyMetaData`
   * [org/Hibachi/HibachiTransient.cfc:L738-L747].
   */
  getPropertyMetaData(propertyName: string): UniquePropertyMetaData;

  /**
   * The value the identifier currently resolves to — the port of `getValueByPropertyIdentifier`
   * [org/Hibachi/HibachiTransient.cfc:L466-L481], together with the traversal helper it delegates
   * to at [:L483-L491].
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown;
}

/**
 * An entity that has been through {@link manageEntity} — the one name for "entity plus the framework
 * introspection surface".
 *
 * @typeParam TEntity - The domain entity type.
 */
/**
 * The per-entity error state every legacy entity inherits — the port of the errors block at
 * `org/Hibachi/HibachiTransient.cfc:L29-L67`.
 */
export interface EntityErrorSurface {
  /**
   * Records an error against a property name — `addError()`
   * [org/Hibachi/HibachiTransient.cfc:L61-L63].
   */
  addError(errorName: string, errorMessage: string): void;

  /** Merges a whole error struct — `addErrors()` [org/Hibachi/HibachiTransient.cfc:L66-L68]. */
  addErrors(errors: Readonly<Record<string, readonly string[]>>): void;

  /**
   * Every error, keyed by property name — `getErrors` [org/Hibachi/HibachiTransient.cfc:L30-L32].
   */
  getErrors(): Readonly<Record<string, readonly string[]>>;

  /**
   * The messages recorded against one property — `getError()`
   * [org/Hibachi/HibachiTransient.cfc:L35-L44].
   */
  getError(errorName: string): readonly string[];

  /** Whether any error exists — `hasErrors` [org/Hibachi/HibachiTransient.cfc:L47-L53]. */
  hasErrors(): boolean;

  /**
   * Whether one property has an error — `hasError()` [org/Hibachi/HibachiTransient.cfc:L56-L58].
   */
  hasError(errorName: string): boolean;
}

/** An entity plus the two framework surfaces {@link manageEntity} composes onto it. */
export type ManagedEntity<TEntity> = TEntity & EntityMetadataSurface & EntityErrorSurface;

/** Whether a declaration lists the name, narrowing it to a field name when it does. */
function isDeclaredFieldProperty<TPropertyName extends string>(
  declaration: EntityMetadataDeclaration<TPropertyName>,
  propertyIdentifier: string,
): propertyIdentifier is TPropertyName {
  return Object.prototype.hasOwnProperty.call(declaration.properties, propertyIdentifier);
}

/**
 * Whether a declaration lists the name among those the legacy entity declares but this port does not
 * carry as a field. See {@link EntityMetadataDeclaration.declaredNonFieldProperties}.
 */
function isDeclaredNonFieldProperty(
  declaration: EntityMetadataDeclaration<string>,
  propertyIdentifier: string,
): boolean {
  const declaredNonFieldProperties = declaration.declaredNonFieldProperties;

  return (
    declaredNonFieldProperties !== undefined &&
    Object.prototype.hasOwnProperty.call(declaredNonFieldProperties, propertyIdentifier)
  );
}

/**
 * Splits a property identifier the way the legacy traversal does.
 *
 * @param propertyIdentifier - A single property name, or a dotted/underscored path.
 * @returns The non-empty segments, in order.
 */
function splitPropertyIdentifier(propertyIdentifier: string): string[] {
  return propertyIdentifier.split(/[._]/).filter((segment) => segment.length > 0);
}

/**
 * Whether a value can itself resolve a property identifier — the port of the
 * `!isNull(object) && !isSimpleValue(object)` guard at
 * [org/Hibachi/HibachiTransient.cfc:L470], viewed from the traversal's point of view.
 */
function isTraversableValue(
  value: unknown,
): value is Pick<EntityMetadataSurface, 'getValueByPropertyIdentifier'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getValueByPropertyIdentifier' in value &&
    typeof value.getValueByPropertyIdentifier === 'function'
  );
}

/**
 * The empty string every unresolvable read answers with — `return ""` at
 * [org/Hibachi/HibachiTransient.cfc:L480].
 */
const UNRESOLVED_PROPERTY_VALUE = '';

/**
 * Reads a property identifier off one managed entity's fields, following the legacy traversal.
 *
 * @param fields - The entity, viewed at the keyed field surface `populate` writes through.
 * @param declaration - The entity's metadata declaration.
 * @param propertyIdentifier - A single property name, or a dotted/underscored path.
 * @returns The resolved value, or {@link UNRESOLVED_PROPERTY_VALUE} when it cannot be resolved.
 */
function readValueByPropertyIdentifier<TPropertyName extends string>(
  fields: PopulationTarget<TPropertyName>,
  declaration: EntityMetadataDeclaration<TPropertyName>,
  propertyIdentifier: string,
): unknown {
  const segments = splitPropertyIdentifier(propertyIdentifier);
  const firstSegment = segments[0];

  // `listLen(propertyIdentifier, "._") eq 1` at [:L484] cannot be true of an empty identifier, and
  // `invokeMethod("get")` at [:L486] would have failed rather than resolved. The empty-string exit
  // is the honest translation of "nothing was resolved".
  if (firstSegment === undefined) {
    return UNRESOLVED_PROPERTY_VALUE;
  }

  if (segments.length === 1) {
    // [:L484-L485] — a single-element identifier resolves the object to `this`, and [:L474] then
    // reads the named property off it. A name the legacy entity declares but this port does not
    // carry as a field is unreadable here and takes the same exit an unresolved traversal takes;
    // See {@link EntityMetadataDeclaration.declaredNonFieldProperties}.
    if (!isDeclaredFieldProperty(declaration, firstSegment)) {
      return UNRESOLVED_PROPERTY_VALUE;
    }

    const value: unknown = fields[firstSegment];

    // [:L475-L476] — a null value is not returned; execution falls through to `return ""`.
    return value === undefined ? UNRESOLVED_PROPERTY_VALUE : value;
  }

  // [:L486-L490] — resolve the leading segment, then delegate the remainder to the object it
  // yielded, exactly as the legacy helper recurses on the related object. A leading segment that is
  // absent, unreadable or not itself managed fails the [:L470] guard and answers the empty string.
  if (!isDeclaredFieldProperty(declaration, firstSegment)) {
    return UNRESOLVED_PROPERTY_VALUE;
  }

  const relatedValue: unknown = fields[firstSegment];

  if (!isTraversableValue(relatedValue)) {
    return UNRESOLVED_PROPERTY_VALUE;
  }

  return relatedValue.getValueByPropertyIdentifier(segments.slice(1).join('.'));
}

/**
 * Attaches the seven framework introspection members to one entity and returns the same object,
 * typed at the shape its collaborators require.
 *
 * @param entity - The entity to manage, mutated and returned.
 * @param declaration - The entity's frozen metadata declaration, from its own module.
 * @returns The same entity, typed as also carrying {@link EntityMetadataSurface}.
 *
 * @example
 * ```ts
 * const brand = manageEntity(new brand, brand_entity_metadata);
 * ```
 */
export function manageEntity<
  TPropertyName extends string,
  TTarget extends PopulationTarget<TPropertyName>,
>(entity: TTarget, declaration: EntityMetadataDeclaration<TPropertyName>): ManagedEntity<TTarget> {
  /*
   * The same widening assignment {@link populateWithSubProperties} uses, and for the same reason:
   * it turns a keyed read into a legal `unknown`-typed expression with no assertion. See
   * {@link assignPropertyValue}.
   */
  const fields: PopulationTarget<TPropertyName> = entity;

  const surface: EntityMetadataSurface = {
    getClassName: (): string => declaration.className,

    getEntityName: (): string => declaration.entityName,

    getPrimaryIDPropertyName: (): string => declaration.primaryIDPropertyName,

    getPrimaryIDValue: (): string => {
      const value: unknown = fields[declaration.primaryIDPropertyName];

      if (typeof value === 'string') {
        return value;
      }

      /*
       * Unreachable for every entity in this slice — all six declare their primary key as a
       * required `string` initialised to `''` — and surfaced rather than defaulted anyway, because
       * the alternatives both diverge: substituting `''` would report an unsaved entity where the
       * declaration is actually wrong, and a non-null assertion is forbidden outright (AAP §0.7.3). The
       * message is diagnostic only and carries no client-safe classification, so
       * `src/handlers/httpResponse.ts` withholds it from any response.
       */
      throw new DomainError(
        `${declaration.className}.${declaration.primaryIDPropertyName} did not hold a string primary identifier value`,
        {
          context: {
            className: declaration.className,
            primaryIDPropertyName: declaration.primaryIDPropertyName,
            locator: 'org/Hibachi/HibachiEntity.cfc:L244-L246',
          },
        },
      );
    },

    hasProperty: (propertyIdentifier: string): boolean =>
      isDeclaredFieldProperty(declaration, propertyIdentifier) ||
      isDeclaredNonFieldProperty(declaration, propertyIdentifier),

    getPropertyMetaData: (propertyName: string): UniquePropertyMetaData => {
      if (
        !isDeclaredFieldProperty(declaration, propertyName) &&
        !isDeclaredNonFieldProperty(declaration, propertyName)
      ) {
        /*
         * [org/Hibachi/HibachiTransient.cfc:L746] — `throw("No property found with name
         * #propertyName# in #getClassName#")`. The wording is carried because it is the legacy
         * diagnostic, and it is not classified as client-safe: it names a caller-supplied
         * identifier and an internal class name, which is exactly the disclosure
         * `src/errors/DomainError.ts` requires a thrower to withhold.
         */
        throw new DomainError(
          `No property found with name ${propertyName} in ${declaration.className}`,
          {
            context: {
              className: declaration.className,
              propertyName,
              locator: 'org/Hibachi/HibachiTransient.cfc:L738-L747',
            },
          },
        );
      }

      /*
       * [:L742] returns the whole metadata entry, whose `name` attribute — the only one any
       * in-scope caller reads, at [org/Hibachi/HibachiDAO.cfc:L134] — is the key it was stored
       * under at [:L797]. Returning the name itself is therefore exact rather than approximate.
       */
      return { name: propertyName };
    },

    getValueByPropertyIdentifier: (propertyIdentifier: string): unknown =>
      readValueByPropertyIdentifier(fields, declaration, propertyIdentifier),
  };

  /*
   * The error bean, one per entity instance — `getHibachiErrors()`
   * [org/Hibachi/HibachiTransient.cfc:L31, :L62, :L67]. Held in this closure rather than as a field so
   * it cannot collide with a declared property name, and so the six members below are the only way to
   * reach it. `ValidationError` already implements exactly the legacy bean's six operations, including
   * the append-per-key array semantics, so it is reused rather than reimplemented here.
   */
  const errorBean = new ValidationError();

  const errors: EntityErrorSurface = {
    addError: (errorName: string, errorMessage: string): void => {
      errorBean.addError(errorName, errorMessage);
    },

    addErrors: (incoming: Readonly<Record<string, readonly string[]>>): void => {
      errorBean.addErrors(incoming);
    },

    getErrors: (): Readonly<Record<string, readonly string[]>> => errorBean.getErrors(),

    getError: (errorName: string): readonly string[] => errorBean.getError(errorName),

    hasErrors: (): boolean => errorBean.hasErrors(),

    hasError: (errorName: string): boolean => errorBean.hasError(errorName),
  };

  return Object.assign(entity, surface, errors);
}
