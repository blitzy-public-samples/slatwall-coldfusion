/**
 * AuditableEntity — the audit-field block of the Catalog, extracted from a retired ORM lifecycle.
 *
 * Four fields — `createdDateTime`, `createdByAccount`, `modifiedDateTime`, `modifiedByAccount` — are
 * declared identically on all six in-scope Catalog entities, and none was ever written by application
 * code: the CFML engine's Hibernate hooks `preInsert()` [org/Hibachi/HibachiEntity.cfc:L598-L649] and
 * `preUpdate(struct oldData)` [org/Hibachi/HibachiEntity.cfc:L651-L680] stamped them. A stateless
 * invocation has no ORM session and no lifecycle hooks, so that behaviour lives here instead: an
 * explicit type plus explicit functions, invoked by whoever owns the write — in practice
 * `src/adapters/mysql/UnitOfWork.ts`, which owns the transaction boundary that replaced the implicit
 * request-end commit (M5).
 *
 * This module is a type plus free functions and never an inheritance root: entities satisfy the
 * interface structurally and pass themselves to the functions (AAP §0.3.3, composition over
 * inheritance). It performs no lookup, no data access and no logging, and the resolved actor arrives
 * as a parameter rather than through the ambient `getHibachiScope()`
 * [org/Hibachi/HibachiObject.cfc:L73-L76] plus `getAccount()` [org/Hibachi/HibachiScope.cfc:L134] pair
 * the legacy gates were written around (AAP §0.7.3).
 */

import { DomainError } from '../../errors/DomainError';

import type { AccountReference } from '../../ports/AccountContextPort';

/** The audit-field block, as an explicit structural contract. */
export interface AuditableEntity {
  /** First-write timestamp. Absent until `applyPreInsertAudit`. Never rewritten afterwards. */
  createdDateTime?: Date;

  /**
   * Identifier of the administrative account that created the record. Absent unless gate 2 and
   * gate 3 both held at insert time. Never rewritten afterwards.
   */
  createdByAccount?: string;

  /** Last-write timestamp. Written on insert as well as on update — asymmetry 2. */
  modifiedDateTime?: Date;

  /**
   * Identifier of the administrative account that last wrote the record. Written on insert as well
   * as on update, and absent unless gate 2 and gate 3 both held at that moment.
   */
  modifiedByAccount?: string;
}

/** The four legacy audit property names, frozen and closed. */
export const AUDIT_PROPERTY_NAMES = Object.freeze([
  'createdDateTime',
  'createdByAccount',
  'modifiedDateTime',
  'modifiedByAccount',
] as const);

/** The name of one audit property. */
export type AuditPropertyName = (typeof AUDIT_PROPERTY_NAMES)[number];

/**
 * Narrows an arbitrary property key to one of the four audit property names.
 *
 * @param value - A candidate property key.
 * @returns `true` when `value` is one of the four audit property names.
 */
export function isAuditPropertyName(value: string): value is AuditPropertyName {
  return AUDIT_PROPERTY_NAMES.some((auditPropertyName) => auditPropertyName === value);
}

/*
 * The four accessors — two overridden in the legacy source, two not (asymmetry 1)
 * These reproduce the read side of the audit block exactly as the legacy source exposed it, and the
 * difference between the two pairs is the single most important thing in this module not to tidy up.
 */

/**
 * Reads `createdDateTime`, reproducing the legacy overridden getter.
 *
 * @param entity - The entity to read.
 * @returns The creation timestamp, or the empty string when it has never been stamped —
 * [org/Hibachi/HibachiEntity.cfc:L291-L297].
 */
export function getCreatedDateTime(entity: AuditableEntity): Date | '' {
  if (entity.createdDateTime === undefined) {
    return '';
  }
  return entity.createdDateTime;
}

/**
 * Reads `modifiedDateTime`, reproducing the legacy overridden getter.
 *
 * @param entity - The entity to read.
 * @returns The last-modified timestamp, or the empty string when it has never been stamped —
 * [org/Hibachi/HibachiEntity.cfc:L299-L305].
 */
export function getModifiedDateTime(entity: AuditableEntity): Date | '' {
  if (entity.modifiedDateTime === undefined) {
    return '';
  }
  return entity.modifiedDateTime;
}

/**
 * Reads `createdByAccount`.
 *
 * @param entity - The entity to read.
 * @returns The creating administrative account's identifier, or `undefined` when unattributed.
 */
export function getCreatedByAccount(entity: AuditableEntity): string | undefined {
  return entity.createdByAccount;
}

/**
 * Reads `modifiedByAccount`.
 *
 * @param entity - The entity to read.
 * @returns The last-writing administrative account's identifier, or `undefined` when unattributed.
 */
export function getModifiedByAccount(entity: AuditableEntity): string | undefined {
  return entity.modifiedByAccount;
}

/**
 * Gate 2 and gate 3 — whether an actor may be recorded as an audit attribution.
 *
 * @param auditActor - The resolved current-account context, or `undefined` when there is none.
 * @returns `true` when the actor is present, persisted (gate 2) and administrative (gate 3).
 */
export function isAuditAttributableAccount(
  auditActor: AccountReference | undefined,
): auditActor is AccountReference {
  return auditActor !== undefined && !auditActor.newFlag && auditActor.adminAccountFlag;
}

/**
 * Stamps the audit block for a first write — the port of `preInsert()`
 * [org/Hibachi/HibachiEntity.cfc:L598-L649].
 *
 * @param entity - The entity being written for the first time. Mutated in place.
 * @param auditActor - The resolved current-account context, or `undefined`/omitted when there is
 * none. When it is absent, or fails gate 2 or gate 3, both timestamps are still stamped and both
 * account fields are left absent — matching the legacy behaviour for a new or non-administrative
 * actor.
 *
 * @returns The same entity instance that was passed in.
 */
export function applyPreInsertAudit<TEntity extends AuditableEntity>(
  entity: TEntity,
  auditActor?: AccountReference,
): TEntity {
  const timestamp = new Date();

  entity.createdDateTime = timestamp;

  entity.modifiedDateTime = timestamp;

  if (isAuditAttributableAccount(auditActor)) {
    entity.createdByAccount = auditActor.accountID;

    entity.modifiedByAccount = auditActor.accountID;
  }

  return entity;
}

/**
 * Stamps the audit block for a subsequent write — the port of `preUpdate(struct oldData)`
 * [org/Hibachi/HibachiEntity.cfc:L651-L680]. `modifiedDateTime` is written unconditionally from a
 * freshly read timestamp [:L662 and :L664-L667]; `modifiedByAccount` only when gate 2 and gate 3 both
 * hold [:L675-L678]. The created pair is written once, on insert, and is never touched on this path.
 *
 * @param entity - The entity being updated. Mutated in place.
 * @param auditActor - The resolved current-account context, or `undefined`/omitted when there is none.
 * When it is absent, or fails gate 2 or gate 3, `modifiedDateTime` is still stamped and
 * `modifiedByAccount` is left exactly as it was.
 *
 * @returns The same entity instance that was passed in.
 */
export function applyPreUpdateAudit<TEntity extends AuditableEntity>(
  entity: TEntity,
  auditActor?: AccountReference,
): TEntity {
  const timestamp = new Date();

  entity.modifiedDateTime = timestamp;

  if (isAuditAttributableAccount(auditActor)) {
    entity.modifiedByAccount = auditActor.accountID;
  }

  return entity;
}

/*
 * What this module deliberately does not port
 * The two legacy hooks contain three further blocks. None is an audit concern, and each is omitted
 * for a stated reason rather than overlooked. AAP §0.4.1.4 scopes this file precisely to "the
 * `createdDateTime` / `createdByAccount` / `modifiedDateTime` / `modifiedByAccount` block".
 */

/* The managed-entity contract — seven members every legacy entity had by inheritance. */

/** The metadata this port carries for one declared property. */
export interface EntityPropertyMetaData {
  /** The property's declared name, exactly as the entity declares it. */
  readonly name: string;
}

/** An entity's complete set of declared property names, as a keyed set. */
export type DeclaredPropertyNameSet<TPropertyName extends string> = Readonly<
  Record<TPropertyName, true>
>;

/** The seven inherited members, as one explicit structural contract. */
export interface ManagedEntity {
  /**
   * The entity's bare class name — [org/Hibachi/HibachiObject.cfc:L135-L137], which returns the last
   * dot-delimited segment of the fully qualified component name.
   */
  getClassName(): string;

  /**
   * The entity's mapped ORM entity name — [org/Hibachi/HibachiEntity.cfc:L287-L289], which reads it
   * from live component metadata.
   */
  getEntityName(): string;

  /**
   * Whether this entity declares the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765], an own-key test over the property structure.
   */
  hasProperty(propertyIdentifier: string): boolean;

  /**
   * Resolves the metadata for a declared property, raising when the name is not declared —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747].
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData;

  /**
   * The value currently held by the entity's primary identifier —
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to the generated getter for whichever
   * property {@link getPrimaryIDPropertyName} names.
   */
  getPrimaryIDValue(): string;

  /**
   * The name of the entity's primary identifier property —
   * [org/Hibachi/HibachiEntity.cfc:L249-L251].
   */
  getPrimaryIDPropertyName(): string;

  /**
   * Reads a value by property identifier, walking a dotted or underscored path —
   * [org/Hibachi/HibachiTransient.cfc:L466-L481].
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown;
}

/**
 * Port of `hasProperty` — [org/Hibachi/HibachiTransient.cfc:L763-L765].
 *
 * @param declaredProperties - The entity's declared-property set.
 * @param propertyIdentifier - The name to test, in its declared casing.
 * @returns `true` when the entity declares a property of that name.
 */
export function hasDeclaredProperty<TPropertyName extends string>(
  declaredProperties: DeclaredPropertyNameSet<TPropertyName>,
  propertyIdentifier: string,
): boolean {
  return Object.hasOwn(declaredProperties, propertyIdentifier);
}

/* The failure text of `getPropertyMetaData` — [org/Hibachi/HibachiTransient.cfc:L746]. */
function missingPropertyMessage(propertyName: string, className: string): string {
  return `No property found with name ${propertyName} in ${className}`;
}

/**
 * Port of `getPropertyMetaData` — [org/Hibachi/HibachiTransient.cfc:L738-L747].
 *
 * @param declaredProperties - The entity's declared-property set.
 * @param propertyName - The name to resolve.
 * @param className - The entity's class name, interpolated into the failure exactly as the legacy
 * interpolates `getClassName`.
 *
 * @returns The metadata for the named property.
 */
export function requireDeclaredPropertyMetaData<TPropertyName extends string>(
  declaredProperties: DeclaredPropertyNameSet<TPropertyName>,
  propertyName: string,
  className: string,
): EntityPropertyMetaData {
  if (!hasDeclaredProperty(declaredProperties, propertyName)) {
    throw new DomainError(missingPropertyMessage(propertyName, className), {
      context: { propertyName, className },
    });
  }

  return { name: propertyName };
}

/**
 * Narrows an arbitrary value to something whose string keys can be read.
 *
 * @param value - Any value.
 * @returns `true` when the value is a non-null object.
 */
function isPropertyBag(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads one member of an object the way the legacy `invokeMethod("get#name#")` did.
 *
 * @param subject - The object to read from.
 * @param name - The member name in its declared casing.
 * @returns The value, or `undefined` when neither form resolves.
 */
function readEntityMember(subject: Readonly<Record<string, unknown>>, name: string): unknown {
  if (Object.hasOwn(subject, name)) {
    return subject[name];
  }

  const accessorName = `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const accessor = subject[accessorName];

  if (typeof accessor === 'function') {
    const invoke = accessor as () => unknown;

    return invoke.call(subject);
  }

  return undefined;
}

/**
 * Port of `getValueByPropertyIdentifier` — [org/Hibachi/HibachiTransient.cfc:L466-L481], together
 * with the recursive walk it delegates to at [:L483-L491].
 *
 * @param subject - The entity to read from, normally `this`.
 * @param propertyIdentifier - A single property name, or a path delimited by `.` or `_`.
 * @returns The resolved value, or `''` when the path cannot be resolved.
 */
export function readValueByPropertyIdentifier(
  subject: object,
  propertyIdentifier: string,
): unknown {
  // Rules 1 and 2: split on either delimiter, then discard empties as CFML list functions do.
  const segments = propertyIdentifier.split(/[._]/).filter((segment) => segment.length > 0);

  const finalSegment = segments[segments.length - 1];

  if (finalSegment === undefined) {
    // An identifier consisting only of delimiters, or none at all, names nothing. Rule 4.
    return '';
  }

  let current: unknown = subject;

  // Rule 3: hop through every segment but the last, stopping at anything that is not an object.
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (segment === undefined || !isPropertyBag(current)) {
      return '';
    }

    current = readEntityMember(current, segment);
  }

  if (!isPropertyBag(current)) {
    // [:L470] — the resolved object must be present and must not be a simple value.
    return '';
  }

  const value = readEntityMember(current, finalSegment);

  // Rule 4: [:L474-L476] returns the raw value only when it is non-null; otherwise [:L480] wins.
  return value ?? '';
}

/**
 * The framework-default simple-representation property name —
 * [org/Hibachi/HibachiEntity.cfc:L74-L88].
 *
 * @param className - The entity's bare class name, from {@link ManagedEntity.getClassName}.
 * @param declaredProperties - The entity's declared property-name set.
 * @returns The name of the property whose value represents the entity.
 * @throws DomainError when no declared property satisfies the convention, reproducing [:L87].
 */
export function resolveSimpleRepresentationPropertyName<TPropertyName extends string>(
  className: string,
  declaredProperties: DeclaredPropertyNameSet<TPropertyName>,
): string {
  const conventionalName = `${className}name`.toLowerCase();

  for (const propertyName of Object.keys(declaredProperties)) {
    if (propertyName.toLowerCase() === conventionalName) {
      return propertyName;
    }
  }

  // [:L87] — carried verbatim, including the three source typos ("propety", "simpleRepresentaition",
  // "iside", "sectin"), because a throw message is observable behaviour and AAP §0.8.2 Guideline 4
  // forbids repairing it.
  throw new DomainError(
    `There is no Simple Representation Property Name for ${className}.  You can either override ` +
      `getSimpleRepresentation() or override getSimpleRepresentationPropertyName() in the entity, ` +
      `but be sure to do it at the bottom iside of commented sectin for overrides.`,
    { context: { className, conventionalName } },
  );
}

/**
 * The framework-default simple representation of an entity — [org/Hibachi/HibachiEntity.cfc:L59-L71].
 *
 * @param subject - The entity to represent, normally `this`.
 * @param propertyName - The property resolved by {@link resolveSimpleRepresentationPropertyName}.
 * @returns The property's value when it is a simple value, otherwise the legacy blank fallthrough.
 */
export function readSimpleRepresentation(subject: object, propertyName: string): string {
  if (!isPropertyBag(subject)) {
    return '';
  }

  const value = subject[propertyName];

  return typeof value === 'string' ? value : '';
}
