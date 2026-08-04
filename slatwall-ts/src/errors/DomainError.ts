/**
 * DomainError — the root of this subtree's error hierarchy, and the single source of truth for the
 * legacy CFML `throw` message strings that are observable behaviour of the catalog slice.
 *
 * Why the message strings live here
 * Four legacy `throw` messages are behaviour, not cosmetics: the three raised by
 * `Product.getSkuBySelectedOptions` and the discriminator fallthrough in `SkuService.createSkus`.
 * Centralising them means the domain entity and the service consume the identical literal, the test
 * suite asserts message equality against one place instead of re-typing the text, and verbatim
 * fidelity can be checked by reading a single file. The inventory is at the bottom of this module.
 *
 * ARCHITECTURAL position
 * `src/errors/` is a dependency-free leaf below every other layer, so this module declares zero
 * imports — no sibling module, no Node builtin, no package, no barrel re-export. An error type that
 * imported a domain entity, a port, an adapter, a rule set, a service or a handler would invert the
 * dependency direction and destroy that position. It follows that no AWS type is named here (all AWS
 * coupling is confined to the handler layer), `process.env` is never read here (configuration flows
 * one way through src/config/), and no query text, table or column identifier appears in any message
 * or constant.
 */

/* Public-safe presentation. */

/** The closed set of stable, public-safe failure codes this service emits. */
export const PUBLIC_ERROR_CODE = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CATALOG_REQUEST_REJECTED: 'CATALOG_REQUEST_REJECTED',
  REQUEST_INVALID: 'REQUEST_INVALID',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  CATALOG_STATE_UNEXPECTED: 'CATALOG_STATE_UNEXPECTED',
  SERVICE_CONFIGURATION: 'SERVICE_CONFIGURATION',
  SERVICE_DATA: 'SERVICE_DATA',
  SERVICE_FAULT: 'SERVICE_FAULT',
} as const);

/** One member of {@link PUBLIC_ERROR_CODE}. */
export type PublicErrorCode = (typeof PUBLIC_ERROR_CODE)[keyof typeof PUBLIC_ERROR_CODE];

/** The complete external account of a failure: a stable code and a text safe for any caller. */
export interface PublicErrorPresentation {
  readonly code: PublicErrorCode;
  readonly message: string;
}

/* The public texts. */
const UNDISCLOSED_FAILURE_PUBLIC_MESSAGE = 'The request could not be completed';
const NOT_IMPLEMENTED_PUBLIC_MESSAGE = 'This operation is not available';
const SERVICE_CONFIGURATION_PUBLIC_MESSAGE = 'The service is not correctly configured';
const SERVICE_DATA_PUBLIC_MESSAGE = 'The request could not be completed from the stored data';

/* The presentations that carry no runtime value, built once and frozen. */
/*
 * The base presentation classifies as a service fault, not as a request rejection, and the
 * classification is derived from what the throw sites actually say.
 */
const SERVICE_FAULT_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.SERVICE_FAULT,
  message: UNDISCLOSED_FAILURE_PUBLIC_MESSAGE,
});

const NOT_IMPLEMENTED_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.NOT_IMPLEMENTED,
  message: NOT_IMPLEMENTED_PUBLIC_MESSAGE,
});

const SERVICE_CONFIGURATION_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.SERVICE_CONFIGURATION,
  message: SERVICE_CONFIGURATION_PUBLIC_MESSAGE,
});

const SERVICE_DATA_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.SERVICE_DATA,
  message: SERVICE_DATA_PUBLIC_MESSAGE,
});

/*
 * This one is a request rejection, and it is the case the base presentation's closing paragraph
 * anticipated. The block above ends by saying that "a subclass whose situation genuinely is
 * attributable to the caller should override this member and return `CATALOG_REQUEST_REJECTED`".
 * {@link UniqueConstraintViolationError} is that subclass: the value the caller supplied is already
 * held by another row, which is a fact about the request and not a fault in this service. Answering
 * it with 500 would tell every monitor watching the 5xx rate that the service broke when it did
 * exactly what it was asked to do.
 */
const UNIQUE_CONSTRAINT_PUBLIC_MESSAGE = 'A value in the request is already in use';

const UNIQUE_CONSTRAINT_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
  message: UNIQUE_CONSTRAINT_PUBLIC_MESSAGE,
});

/*
 * The second request rejection, which shares the reasoning of the one above (CWE-400). A request whose
 * cost this deployment will not undertake is a fact about
 * the request, not a fault in this service: the caller chose the option selection, or chose a title
 * that keeps colliding, and can choose differently. Answering it with 500 would report a broken
 * service to every monitor watching the 5xx rate while the service was working correctly, and would
 * tell the one party who can act — the caller — nothing actionable.
 */
const REQUEST_BUDGET_PUBLIC_MESSAGE =
  'The request asks for more work than one operation may perform';

const REQUEST_BUDGET_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
  message: REQUEST_BUDGET_PUBLIC_MESSAGE,
});

/*
 * There is no third request rejection, and an `ImportSourceRejectedError` in particular must not be
 * added. A dedicated class would exist to report a refusal this port does not author: no scheme, host or
 * address rule is stated anywhere in the subtree, because the legacy retrieval at
 * `model/dao/ProductDAO.cfc:L87` checks nothing and AAP §0.6.7.7 authorises exactly one departure from
 * behavioural preservation (D18, the importer's parameterised SQL), with AAP §0.8.2 Guideline 4 admitting no
 * proportionality test.
 */

/** Optional construction payload shared by {@link DomainError} and every subclass of it. */
export interface DomainErrorOptions {
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
}

/**
 * Base class for every error this service raises from its own domain, service, validation,
 * adapter and integration code.
 *
 * @example
 * ```ts
 * throw new DomainError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE, {
 * context: { productId, baseProductType },
 * });
 * ```
 */
export class DomainError extends Error {
  /** Structured facts attached by the thrower, present only when the thrower supplied them. */
  public readonly context?: Record<string, unknown>;

  public constructor(message: string, options?: DomainErrorOptions) {
    // `cause` is forwarded only when one was supplied, so the platform `Error` never receives
    // an explicitly `undefined` cause and `'cause' in error` stays meaningful.
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);

    // Re-point the prototype at the constructed class so `instanceof` survives esbuild
    // bundling and any downlevelling: a downlevelled subclass of a built-in returns a plain
    // `Error` from its super call, which silently breaks `instanceof` for this class and for
    // every subclass. `new.target` is the concrete class actually being constructed.
    Object.setPrototypeOf(this, new.target.prototype);

    // Report the concrete class rather than the base, so logs and stack traces name the error
    // the thrower actually raised.
    this.name = new.target.name;

    if (options?.context !== undefined) {
      this.context = options.context;
    }
  }

  /**
   * The public-safe external account of this failure — a stable code and a text safe for any
   * caller. See public-safe presentation in the module header for the reasoning in full.
   *
   */
  public getPublicError(): PublicErrorPresentation {
    return SERVICE_FAULT_PRESENTATION;
  }
}

/**
 * Raised when a value the deployment must supply is missing, empty or unusable.
 *
 * @example
 * ```ts
 * throw new ConfigurationError(
 * `setting ${key} has no deployment-supplied value and no metadata default, so it cannot be ` +
 * 'resolved.',
 * { context: { key } },
 * ```
 */
export class ConfigurationError extends DomainError {
  /**
   * Reports a service-configuration fault. The specific message stays internal.
   *
   * @returns the neutral configuration presentation.
   */
  public override getPublicError(): PublicErrorPresentation {
    return SERVICE_CONFIGURATION_PRESENTATION;
  }
}

/**
 * Raised when stored data, or a value a driver returned, cannot be read as the shape its
 * declaration promises.
 *
 * @example
 * ```ts
 * throw new DataIntegrityError(
 * `column "${columnName}" is absent from the result set, so the row cannot be mapped.`,
 * { context: { columnName } },
 * );
 * ```
 */
export class DataIntegrityError extends DomainError {
  /**
   * Reports a service data fault. The specific message stays internal.
   *
   * @returns the neutral data presentation.
   */
  public override getPublicError(): PublicErrorPresentation {
    return SERVICE_DATA_PRESENTATION;
  }
}

/** Raised when the database refuses a write because the value it carries is already held. */
export class UniqueConstraintViolationError extends DomainError {
  /**
   * Reports a rejected request. Which constraint collided stays internal.
   *
   * @returns the neutral request-rejection presentation.
   */
  public override getPublicError(): PublicErrorPresentation {
    return UNIQUE_CONSTRAINT_PRESENTATION;
  }
}

/**
 * Raised when a request exceeds a budget for the work one operation may perform.
 *
 * @example
 * ```ts
 * throw new RequestBudgetExhaustedError(
 * 'The smart list matched more records than this deployment permits materialising in one request.',
 * { context: { maximumRecordsPerRequest, matched } },
 * );
 * ```
 */
export class RequestBudgetExhaustedError extends DomainError {
  /**
   * Reports a rejected request. Which budget was exhausted, and its figure, stay internal.
   *
   * @returns the neutral request-rejection presentation.
   */
  public override getPublicError(): PublicErrorPresentation {
    return REQUEST_BUDGET_PRESENTATION;
  }
}

/**
 * Raised by a boundary stub for an in-scope member that this port cannot implement.
 *
 * @example
 * ```ts
 * throw new NotImplementedError(
 * 'skuService.getSkuStocksDeletableFlag',
 * 'the legacy data-access member it delegates to does not exist in the source repository',
 * );
 * ```
 */
export class NotImplementedError extends DomainError {
  /** The un-portable member, named as `Class.method`. */
  public readonly member: string;

  /**
   * @param member the un-portable member, named as `Class.method`
   * @param reason why it cannot be implemented; omit it when the throwing member's own doc
   * comment already records the reason. It is diagnostic only and never reaches a client.
   *
   * @param options optional `cause` and `context` forwarded to {@link DomainError}.
   */
  public constructor(member: string, reason?: string, options?: DomainErrorOptions) {
    /*
     * The reason-free form of the diagnostic message, composed once and then extended when a reason
     * was supplied, so the two spellings cannot drift apart.
     */
    const notImplementedMessage = `${member} is not implemented`;

    super(
      reason === undefined ? notImplementedMessage : `${notImplementedMessage}: ${reason}`,
      options,
    );
    this.member = member;
  }

  /**
   * Reports that the operation is unavailable, without naming the member or the reason.
   *
   * @returns the neutral not-implemented presentation.
   */
  public override getPublicError(): PublicErrorPresentation {
    return NOT_IMPLEMENTED_PRESENTATION;
  }
}

/**
 * Raised with one of the four verbatim legacy message strings this module owns, and with nothing
 * else.
 *
 * @example
 * ```ts
 * throw new LegacyParityError(moreThanOneSkuReturnedMessage(selectedOptions));
 * ```
 */
export class LegacyParityError extends DomainError {
  /**
   * @param message - one of the four verbatim legacy texts, and nothing else. The parameter is typed
   * {@link legacyParityMessage} rather than `string`, so the four exports below are the only values
   * that satisfy it and an authored diagnostic cannot be passed here at all. See
   * {@link legacyParityMessage} for why the narrowing exists and what it caught.
   *
   * @param options - the ordinary diagnostic payload. A parity message may carry a `context` for the
   * log exactly as any other error may; the payload never reaches a response body.
   */
  public constructor(message: LegacyParityMessage, options?: DomainErrorOptions) {
    super(message, options);
  }
}

/** A string that is one of the four verbatim legacy texts, as a type the compiler can check. */
export type LegacyParityMessage = string & { readonly [LEGACY_PARITY_BRAND]: true };

/**
 * The brand key. Declared, never defined, and never emitted — it exists only in the type system.
 */
declare const LEGACY_PARITY_BRAND: unique symbol;

/**
 * Applies the brand. The one place in the subtree where the assertion is made, and it is not exported.
 *
 * @param text - a legacy text quoted verbatim from the CFML source, with its locator recorded on the
 * export that calls this function.
 *
 * @returns the same string, branded.
 */
function legacyParityMessage(text: string): LegacyParityMessage {
  return text as LegacyParityMessage;
}

/* Verbatim legacy message inventory — exactly four strings, byte-identical to the CFML source. */

/**
 * Message 1 — raised when a non-empty option selection resolves to two or more SKUs.
 *
 */
export function moreThanOneSkuReturnedMessage(selectedOptions: string): LegacyParityMessage {
  return legacyParityMessage(
    `More than one sku is returned when the selected options are: ${selectedOptions}`,
  );
}

/**
 * Message 2 — raised when a non-empty option selection resolves to no SKU at all.
 *
 */
export function noSkusFoundForSelectedOptionsMessage(selectedOptions: string): LegacyParityMessage {
  return legacyParityMessage(`No Skus are found for these selected options: ${selectedOptions}`);
}

/**
 * Message 3 — raised on the empty-selection branch when the product does not have exactly one
 * SKU. Verbatim from model/entity/Product.cfc:L362.
 *
 * TODO(parity): the two misspellings and the mismatched embedded argument name are retained
 * from the legacy source and are intentionally not repaired.
 */
export const NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE: LegacyParityMessage =
  legacyParityMessage(
    'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
  );

/**
 * Message 4 — the fallthrough of the three-way base-product-type discriminator in
 * `SkuService.createSkus`. Verbatim from model/service/SkuService.cfc:L204.
 */
export const UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE: LegacyParityMessage = legacyParityMessage(
  'There was an unexpected error when creating this product',
);
