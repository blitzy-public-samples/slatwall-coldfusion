/**
 * ValidationError — the ported error-key structure of the Catalog slice, and the single declaration
 * site for the four legacy resource-bundle keys the slice reports failures with.
 *
 * Why this file EXISTS
 * A legacy validation failure is not a sentence. It is a struct keyed by property name, each key
 * holding an ordered array of resource-bundle keys. Two properties of that structure are observable
 * behaviour and are preserved character for character: which key a failure is reported under, and
 * the exact key strings stored as its messages. Everything else about the container is idiom.
 * Report a failure under the wrong key, or repair a key's spelling, and validation output silently
 * stops being comparable to the legacy system — with no compile error and no failing test elsewhere.
 *
 * Legacy origins, reference only:
 * Org/Hibachi/HibachiErrors.cfc:L1-L75 — the error bean: a struct of arrays, lazily keyed, with an
 * empty struct as its initial form, and `addErrors` merging key by key rather than replacing.
 * Org/Hibachi/HibachiTransient.cfc:L29-L68 — the surface the in-scope entities actually expose,
 * and therefore the shape this class mirrors, including the empty array `getError` returns on a
 * miss (:L43).
 * Org/Hibachi/HibachiValidationService.cfc:L200-L235 — how a failed constraint becomes a key plus
 * a message.
 */

import {
  DomainError,
  PUBLIC_ERROR_CODE,
  type DomainErrorOptions,
  type PublicErrorPresentation,
} from './DomainError';

/* The four verbatim resource-bundle keys. */

/**
 * Reported when a subscription product is created without at least one subscription benefit.
 *
 * TODO(parity): the misspelling in this key is retained from the legacy source and is
 * intentionally not corrected.
 */
export const SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY = 'entity.product.subscriptionbenifitsrequired';

/** Reported when a subscription product is created without at least one subscription term. */
export const SUBSCRIPTION_TERMS_REQUIRED_RBKEY = 'entity.product.subscriptiontermsrequired';

/** Reported when a content-access product is created without at least one access content. */
export const ACCESS_CONTENTS_REQUIRED_RBKEY = 'validate.product.accesscontentsrequired';

/** Reported when uploading a product's default image fails. */
export const FILE_UPLOAD_RBKEY = 'validate.fileUpload';

/**
 * The error key an entity records against itself when one of its process objects carries findings.
 */
export const PROCESS_OBJECTS_ERROR_KEY = 'processObjects';

/**
 * The error key an entity records against itself when a related entity that a nested payload struct
 * populated carries findings — `org/Hibachi/HibachiTransient.cfc:L436` and `:L448`, both of which call
 * `getHibachiErrors().addError('populate', propertyName)`.
 *
 * The message recorded under this key is the **property name**, not a resource-bundle key: the legacy
 * passes `propertyName` as the second argument, so a nested brand that fails its own rules reports
 * `{"populate":["brand"]}`. That shape is the observable contract and is reproduced exactly.
 */
export const POPULATED_SUB_PROPERTY_ERROR_KEY = 'populate';

/**
 * The error bag: a map from property identifier to the ordered list of resource-bundle keys
 * reported against it.
 */
export type ValidationErrors = Readonly<Record<string, readonly string[]>>;

/* Neutral aggregate text for the inherited message property. */
const VALIDATION_FAILED_MESSAGE = 'Validation failed';

/* The public-safe presentation every validation failure reports. */
const VALIDATION_FAILED_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.VALIDATION_FAILED,
  message: VALIDATION_FAILED_MESSAGE,
});

/**
 * Accumulates validation failures keyed by property identifier, and can be thrown once
 * accumulation is complete.
 *
 * @example
 * ```ts
 * const errors = new ValidationError;
 *
 * @example
 * ```ts
 * // Merging a bag produced elsewhere, the equivalent of the legacy addErrors(struct) form.
 * Const errors = new ValidationError({ cause: rejection });
 * errors.addErrors(collected.getErrors);
 * ```
 * ```
 */
export class ValidationError extends DomainError {
  /**
   * The live bag. Created with a null prototype so that key lookup is an exact own-key test,
   * matching CFML struct semantics — see decision (h) in the module header.
   */
  private readonly errors: Record<string, string[]>;

  /**
   * Creates an empty bag, mirroring org/Hibachi/HibachiErrors.cfc:L7-L11, where init() always
   * starts from a new, empty struct. There is deliberately no seeded form: the legacy
   * constructor took no arguments, and a bag produced elsewhere is merged in with
   * {@link addErrors}, which is the member the legacy code used for that purpose.
   *
   * @param options optional `cause` and `context` forwarded to {@link DomainError}. Use
   * `context` to attach diagnostic facts — the identifier being saved, for instance — without
   * altering any observable key or message.
   */
  public constructor(options?: DomainErrorOptions) {
    super(VALIDATION_FAILED_MESSAGE, options);

    // A null prototype is the exact structural analogue of a CFML struct: no inherited members,
    // so a lookup can never resolve to something the type does not describe, and '__proto__' is
    // an ordinary key rather than an accessor that would silently reset this object's prototype.
    this.errors = Object.create(null) as Record<string, string[]>;

    // DomainError already derives the reported name from the class being constructed, so this
    // assignment is not correcting the base. It pins the value to a literal so the name stays
    // stable even if the bundler's name preservation is ever turned off, which matters for logs
    // and telemetry. AAP §0.4.1.11 closes this folder at two files and three error classes, so no
    // subclass of ValidationError exists whose own name this literal could mask.
    this.name = 'ValidationError';
  }

  /**
   * Records one failure against a property identifier.
   *
   *
   */
  public addError(propertyName: string, message: string): void {
    this.bucketFor(propertyName).push(message);
  }

  /**
   * Merges a whole bag in, key by key, appending to any key that is already present.
   *
   */
  public addErrors(errors: ValidationErrors): void {
    for (const [propertyName, messages] of Object.entries(errors)) {
      // The bucket is materialised before the append loop, so an empty incoming list still
      // creates the key — see the second bullet above.
      const bucket = this.bucketFor(propertyName);
      for (const message of messages) {
        bucket.push(message);
      }
    }
  }

  /**
   * Reports a validation failure as request-attributable, carrying the neutral aggregate text.
   *
   * @returns the validation code together with the neutral aggregate text.
   */
  public override getPublicError(): PublicErrorPresentation {
    return VALIDATION_FAILED_PRESENTATION;
  }

  /**
   * Returns the whole bag as a readonly view of the live object.
   *
   * @returns every reported property identifier mapped to its ordered messages.
   */
  public getErrors(): ValidationErrors {
    return this.errors;
  }

  /**
   * Returns the messages reported against one property identifier.
   *
   */
  public getError(propertyName: string): readonly string[] {
    const messages = this.errors[propertyName];

    if (messages === undefined) {
      return [];
    }

    return messages;
  }

  /**
   * Returns true when anything at all has been reported against the given property identifier.
   *
   * @param propertyName the property identifier to test.
   */
  public hasError(propertyName: string): boolean {
    return this.errors[propertyName] !== undefined;
  }

  /** Returns true when at least one property identifier has been reported against. */
  public hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /** Returns the live message array for a property identifier, creating it when absent. */
  private bucketFor(propertyName: string): string[] {
    const existing = this.errors[propertyName];

    if (existing !== undefined) {
      return existing;
    }

    const created: string[] = [];
    this.errors[propertyName] = created;

    return created;
  }
}
