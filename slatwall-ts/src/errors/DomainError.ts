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

  /*
   * The one code that says "ask again" — see {@link TRANSIENT_WRITE_CONFLICT_PRESENTATION} for why it
   * had to be its own member rather than a field on an existing one.
   */
  TRANSIENT_WRITE_CONFLICT: 'TRANSIENT_WRITE_CONFLICT',
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
 * The third request rejection, and it shares the reasoning of the two above. A value the caller supplied —
 * or a value this port derived from one — being longer than the column that stores it is a fact about the
 * request: the caller chose the text and can choose shorter text. `MySqlProductRepository` and
 * `MySqlSkuRepository` already classify the condition precisely, as `data-too-long` from MySQL's errno
 * 1406, and answering it with 500 reported a broken service for a request the service had read correctly
 * and refused correctly.
 *
 * **The message names no column, and that is deliberate rather than an omission.** The overflow is very
 * often on a DERIVED value rather than on the supplied one: a `productCode` of 47 characters overflows
 * `SwSku.imageFile varchar(50)` through `<productCode>.jpg`, and one of 49 overflows `SwSku.skuCode
 * varchar(50)` through `<productCode>-1`. Naming `imageFile` to a caller who sent `productCode` would
 * disclose a schema column AND point at the wrong field. Naming the supplied property instead is not
 * available: the throw happens inside the statement boundary, which by design retains no statement text
 * and no driver message (see {@link DatabaseStatementError}). The message therefore states the condition —
 * including that a derived value may be the one that overflowed, which is the part a caller cannot guess —
 * and the column stays in the internal account, where {@link describeDataTooLongColumn} puts it under the
 * same bounded, charset-checked echo the duplicate-key constraint name already uses.
 */
const DATA_TOO_LONG_PUBLIC_MESSAGE =
  'A value in the request, or a value derived from one, is longer than the field that stores it';

const DATA_TOO_LONG_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
  message: DATA_TOO_LONG_PUBLIC_MESSAGE,
});

/*
 * NOT a request rejection, and that is the whole point of it existing (CWE-544).
 *
 * MySQL rolls a transaction back to break a deadlock (`errno 1213`), and times a lock wait out
 * (`errno 1205`), and `../adapters/mysql/QueryRunner.ts` has classified both correctly as transient
 * since the locking reads were introduced — it computes which of the two happened, records
 * `retryable: true` in the internal context and writes a message saying the identical request may
 * succeed if it is made again. What it then raised was {@link UniqueConstraintViolationError}, whose
 * presentation is the neutral `CATALOG_REQUEST_REJECTED` above, so every one of those correct
 * classifications reached the caller as `400 {"message":"A value in the request is already in use"}`.
 *
 * **Two legitimate concurrent writers of DIFFERENT values were therefore told one of their values was
 * taken.** That answer is wrong in three separate ways, and each of them matters to a different party:
 *
 * * It is wrong to the CALLER, who is told a fact about its request that is false. The value is not in
 * use; nothing was written at all. A caller acting on `400` correctly stops and changes the value —
 * exactly the wrong response to a deadlock, where the correct response is to send the same request
 * again.
 * * It is wrong to the OPERATOR, because the two conditions became indistinguishable at the point where
 * they are counted. `retryable` lived only in the error's `context`, which §7.1's redaction policy keeps
 * out of both the response and the log record, and `failureClass` carried the same class name for both.
 * A rising deadlock rate — the signal that says the port's own locking strategy is misfiring under
 * concurrency — was reported as a rising rate of callers picking taken values.
 * * It is wrong about WHOSE FAULT it is. `4xx` states a fact about the request; `5xx` states a fault in
 * the service. A gap-lock deadlock between two writers who chose different values is neither party's
 * doing: it is a property of the lock ranges this port's uniqueness reads take. The caller chose nothing
 * that led to it and can choose nothing to avoid it, so no `4xx` can be the honest answer, and reusing
 * the request-rejection presentation repeats the original mistake in a new spelling.
 *
 * So the transient pair gets its own code and its own status, and the closed-taxonomy discipline is
 * kept: one more member, frozen, mapped once in `../handlers/httpResponse.ts`, disclosing no `errno`, no
 * table, no constraint name and no driver text. The message states the two things a caller can act on —
 * the write did not happen, and asking again is not futile — and nothing else. Which of the two
 * conditions occurred, and its `errno`, stay in the internal context exactly as before.
 *
 * **`503` rather than `409`, and the choice is deliberate.** `409` would say the request conflicts with
 * the resource's current state, which is what `1062` means and what `UNIQUE_CONSTRAINT_PRESENTATION`
 * already answers; saying it for a deadlock would collapse the very distinction this code exists to
 * draw. `503` says the service could not complete the work now and the condition is temporary, which is
 * what a rolled-back transaction is, and it puts the deadlock rate into the 5xx series where an operator
 * is already watching. No `Retry-After` is emitted with it: the port has no basis for a figure — how
 * long to wait depends on the contending workload, not on anything this module knows — and AAP §0.8.3.5
 * admits no invented one.
 *
 * **No retry is performed here, and that is unchanged.** Whether re-running is correct depends on what
 * the caller was doing, and only the caller knows. This code makes the retryability *visible*; it does
 * not act on it.
 */
const TRANSIENT_WRITE_CONFLICT_PUBLIC_MESSAGE =
  'The write conflicted with another write in progress and was not applied; the request may be retried';

const TRANSIENT_WRITE_CONFLICT_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.TRANSIENT_WRITE_CONFLICT,
  message: TRANSIENT_WRITE_CONFLICT_PUBLIC_MESSAGE,
});

/*
 * There is no third request rejection, and an `ImportSourceRejectedError` in particular must not be
 * added. A dedicated class would exist to report a refusal this port does not author: no scheme, host or
 * address rule is stated anywhere in the subtree, because the legacy retrieval at
 * `model/dao/ProductDAO.cfc:L87` checks nothing and AAP §0.6.7.7 authorises exactly one departure from
 * behavioural preservation (D18, the importer's parameterised SQL), with AAP §0.8.2 Guideline 4 admitting no
 * proportionality test.
 */

/*
 * The invalid-request presentation, and the one place in this module where a public message is composed
 * per instance rather than frozen once.
 *
 * `REQUEST_INVALID` already existed in `PUBLIC_ERROR_CODE` and already mapped to 400 in
 * `../handlers/httpResponse.ts`, but until now only that module used it, and only for a request whose
 * shape it could reject before any domain code ran — an absent, malformed or non-object body. This is the
 * first *thrown* failure to carry it, because it is the first refusal a caller can provoke from inside a
 * domain call whose cause is the request's own text rather than its shape.
 *
 * This is emphatically NOT the third `CATALOG_REQUEST_REJECTED` the block above rules out. That block
 * refuses a class whose *rule* the port would have had to invent; here the rule is the port's own
 * pre-existing, compile-checked identifier whitelist in `../ports/SmartListQueryPort.ts`, which every
 * property path has always had to satisfy before it could reach SQL. Nothing new is being decided about
 * which paths are admissible. What changes is only the answer given to a path that is not: it was
 * silently discarded, and is now reported.
 *
 * That change IS a declared divergence from the legacy, and it is declared here rather than made
 * quietly. `org/Hibachi/HibachiSmartList.cfc:L308-L348` resolves a property identifier through
 * `getAliasedProperty`, which returns an empty string for a path that names neither a property nor an
 * attribute, and every consumer of it — `addFilter` at `:L363`, `addLikeFilter` at `:L394`, `addInFilter`
 * at `:L419`, `addRange` at `:L445`, `addOrder` at `:L473`, `addKeywordProperty` at `:L485` and
 * `addSelect` at `:L352` — guards with `if(len(aliasedProperty))` and then does nothing at all. The
 * legacy therefore answers `F:notARealProperty=ABC` with the entire unfiltered selection. Preserving that
 * exactly would mean preserving a request whose one stated constraint has been discarded, answered `200`,
 * with rows the caller asked not to be given and no signal that anything was ignored. AAP §0.8.2
 * Guideline 6 requires a technology-specific translation decision to be documented where the judgement is
 * made, and this is that record: the divergence is confined to the *answer*, the admissible-path rule is
 * unchanged, and the far larger half of the same finding — that a wrong-case path such as
 * `F:productcode` must resolve, because CFML's struct-key lookup at
 * `org/Hibachi/HibachiService.cfc:L750-L752` is case-insensitive and `:L347` emits the canonical name —
 * is pure parity restoration and is implemented in `../ports/SmartListQueryPort.ts`.
 */

/** How much of a caller-supplied property path may appear in a public message. */
const SMARTLIST_PROPERTY_ECHO_LIMIT = 64;

/**
 * The character set a property path must consist of to be quoted back to the caller. Deliberately
 * narrower than anything a legal identifier needs: letters, digits, and the three punctuation marks a
 * path can legitimately carry (the `.` sub-entity delimiter, plus `_` and `-`, which appear in stored
 * codes). Anything else — a quote, an angle bracket, a semicolon, whitespace, a control character, a
 * non-ASCII code point — makes the value unquotable, and the message then names no value at all rather
 * than reflecting an unknown byte sequence into a response body.
 */
const SMARTLIST_PROPERTY_ECHO_PATTERN = /^[A-Za-z0-9._-]+$/;

const SMARTLIST_PROPERTY_UNRESOLVED_PUBLIC_MESSAGE =
  'The request names a property path that the queried entity does not declare';

/**
 * Composes the public message for one unresolvable property path.
 *
 * The echo is bounded and charset-restricted for the reason
 * `../adapters/mysql/QueryRunner.ts:L1079-L1107` bounds its constraint-name echo: a value that came from
 * the caller may be any length and any bytes, and a response body is not the place to discover that.
 * A path that survives both gates is quoted, because naming it is the entire point of the finding this
 * class answers — a caller told only that "a" path was wrong, on a request carrying six of them, has been
 * told nothing they can act on. A path that fails either gate is dropped from the message entirely; the
 * unabridged value is still on the error's `context` for the log.
 */
function composeUnresolvedPropertyPublicMessage(propertyPath: string): string {
  const echo =
    propertyPath.length > SMARTLIST_PROPERTY_ECHO_LIMIT
      ? propertyPath.slice(0, SMARTLIST_PROPERTY_ECHO_LIMIT)
      : propertyPath;

  return SMARTLIST_PROPERTY_ECHO_PATTERN.test(echo)
    ? `${SMARTLIST_PROPERTY_UNRESOLVED_PUBLIC_MESSAGE}: "${echo}"`
    : SMARTLIST_PROPERTY_UNRESOLVED_PUBLIC_MESSAGE;
}

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

/**
 * The bounded internal classifications a statement failure may expose after driver diagnostics have
 * been stripped.
 */
export type DatabaseStatementFailureClass =
  | 'unknown-column'
  | 'unknown-table'
  | 'permission-denied'
  | 'data-too-long'
  | 'syntax'
  | 'binding'
  | 'driver';

/** Sanitised construction details for {@link DatabaseStatementError}. */
export interface DatabaseStatementErrorDetails {
  readonly failureClass: DatabaseStatementFailureClass;
  readonly parameterCount: number;
  readonly code?: string;
  readonly errno?: number;
  readonly sqlState?: string;

  /**
   * The overflowing column, for a `data-too-long` failure only, already bounded and charset-checked by
   * `../adapters/mysql/QueryRunner.ts`'s `describeDataTooLongColumn`. Diagnostic: it reaches this error's
   * `context` and nothing a caller can observe. See the block beside `DATA_TOO_LONG_PRESENTATION`.
   */
  readonly columnName?: string;
}

/**
 * Raised when the database driver rejects a statement for a reason that is neither a duplicate key
 * nor a transient lock failure.
 *
 * The original driver error is deliberately not retained as `cause`: mysql2 attaches the statement
 * text and server-authored message to that object, and retaining it would preserve the disclosure this
 * class exists to close. Only the bounded class and stable scalar identifiers survive.
 */
export class DatabaseStatementError extends DomainError {
  public readonly failureClass: DatabaseStatementFailureClass;
  public readonly parameterCount: number;
  public readonly code?: string;
  public readonly errno?: number;
  public readonly sqlState?: string;

  /** See {@link DatabaseStatementErrorDetails.columnName}. Present only for a `data-too-long` failure. */
  public readonly columnName?: string;

  public constructor(details: DatabaseStatementErrorDetails) {
    const context = {
      failureClass: details.failureClass,
      parameterCount: details.parameterCount,
      ...(details.code !== undefined ? { code: details.code } : {}),
      ...(details.errno !== undefined ? { errno: details.errno } : {}),
      ...(details.sqlState !== undefined ? { sqlState: details.sqlState } : {}),
      ...(details.columnName !== undefined ? { columnName: details.columnName } : {}),
    };

    super('A database statement could not be executed.', { context });

    this.failureClass = details.failureClass;
    this.parameterCount = details.parameterCount;
    if (details.code !== undefined) {
      this.code = details.code;
    }
    if (details.errno !== undefined) {
      this.errno = details.errno;
    }
    if (details.sqlState !== undefined) {
      this.sqlState = details.sqlState;
    }
    if (details.columnName !== undefined) {
      this.columnName = details.columnName;
    }
  }

  /**
   * Reports a statement failure, distinguishing the one class of it that is the caller's to fix.
   *
   * `data-too-long` is answered as a request rejection: the value supplied, or one derived from it, does
   * not fit the field that stores it, and only the caller can change that. Every other class —
   * `unknown-column`, `unknown-table`, `permission-denied`, `syntax`, `binding` and the catch-all
   * `driver` — describes a statement this port composed or a grant this deployment holds, none of which a
   * caller chose or can influence, so each keeps the neutral service-fault presentation. Neither message
   * carries the column, the statement, the driver text or the figure; see the block beside
   * {@link DATA_TOO_LONG_PRESENTATION} for why naming the column would be both disclosive and misleading.
   *
   * @returns the request-rejection presentation for an overflow, the service-fault presentation otherwise.
   */
  public override getPublicError(): PublicErrorPresentation {
    return this.failureClass === 'data-too-long'
      ? DATA_TOO_LONG_PRESENTATION
      : SERVICE_FAULT_PRESENTATION;
  }
}

/**
 * Raised when the database refuses a write because the value it carries is already held.
 *
 * Permanent by definition: the value is taken, so asking again gets the same answer. Its transient
 * sibling is {@link TransientWriteConflictError}, and the two are separate classes rather than one class
 * carrying a `retryable` flag — read the block beside {@link TRANSIENT_WRITE_CONFLICT_PRESENTATION}
 * before merging them, because a flag on this class is exactly what produced the defect that split them.
 */
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
 * Raised when the database could not apply a write because of a transient lock conflict — a deadlock it
 * rolled the transaction back to break, or a lock wait that timed out (CWE-544).
 *
 * The distinction from {@link UniqueConstraintViolationError} is not cosmetic and not internal: it
 * changes the answer a caller receives from "your value is taken, change it" to "nothing was written,
 * ask again", and it changes the status from `400` to `503`. See the long block beside
 * {@link TRANSIENT_WRITE_CONFLICT_PRESENTATION} for the three separate ways the previous answer was
 * wrong.
 *
 * @example
 * ```ts
 * throw new TransientWriteConflictError(
 * 'The database rolled this transaction back to break a deadlock with another writer, so no part ' +
 * 'of it was applied. The identical request may succeed if it is made again.',
 * { cause, context: { parameterCount, errno: MYSQL_LOCK_DEADLOCK_ERRNO, retryable: true } },
 * );
 * ```
 */
export class TransientWriteConflictError extends DomainError {
  /**
   * Reports a temporary service condition, not a fault in the request.
   *
   * Which of the two lock conditions occurred, its `errno` and the failing statement's parameter count
   * all stay in {@link DomainError.context}, where the throw site puts them.
   *
   * @returns the retryable transient-conflict presentation.
   */
  public override getPublicError(): PublicErrorPresentation {
    return TRANSIENT_WRITE_CONFLICT_PRESENTATION;
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
 * Raised when a smart-list request names a property path the queried entity's declared identifier set
 * does not admit — a misspelling, a property of some other entity, or a path through a relationship the
 * extracted Catalog graph does not carry.
 *
 * Read the long note beside {@link composeUnresolvedPropertyPublicMessage} before changing anything here:
 * the refusal itself is a documented divergence from the legacy's silent discard, and the reasoning for
 * it, the legacy locators, and the parity half of the same finding are all recorded there.
 *
 * @example
 * ```ts
 * throw new SmartListPropertyUnresolvedError('notARealProperty', {
 * context: { entityName, dataKey: 'F:notARealProperty' },
 * });
 * ```
 */
export class SmartListPropertyUnresolvedError extends DomainError {
  /** The path exactly as the caller supplied it, unbounded and unsanitised. Diagnostic only. */
  public readonly propertyPath: string;

  /** Composed once, in the constructor, so a later edit to {@link Error.message} cannot leak into it. */
  private readonly presentation: PublicErrorPresentation;

  /**
   * @param propertyPath the path as supplied. Stored verbatim for the log; only a bounded,
   * charset-checked form of it can ever reach a caller.
   * @param options optional `cause` and `context`. Callers attach the entity name and the request key
   * the path arrived on, both of which stay server-side.
   */
  public constructor(propertyPath: string, options?: DomainErrorOptions) {
    super(
      `A smart-list request named the property path ${JSON.stringify(propertyPath)}, which the queried ` +
        "entity's declared identifier set does not admit, so the request was refused rather than " +
        'answered with the predicate silently dropped and the selection silently widened.',
      options,
    );

    this.propertyPath = propertyPath;
    this.presentation = Object.freeze({
      code: PUBLIC_ERROR_CODE.REQUEST_INVALID,
      message: composeUnresolvedPropertyPublicMessage(propertyPath),
    });
  }

  /**
   * Reports the invalid request, naming the offending path when it is safe to quote.
   *
   * @returns the per-instance presentation composed in the constructor.
   */
  public override getPublicError(): PublicErrorPresentation {
    return this.presentation;
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
