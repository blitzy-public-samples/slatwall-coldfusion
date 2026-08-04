/**
 * DomainError — the root of this subtree's error hierarchy, and the single source of truth for the
 * legacy CFML `throw()` message strings that are observable behaviour of the Catalog slice.
 *
 * WHY THE MESSAGE STRINGS LIVE HERE
 * ---------------------------------
 * Four legacy `throw()` messages are behaviour, not cosmetics: the three raised by
 * `Product.getSkuBySelectedOptions` and the discriminator fallthrough in `SkuService.createSkus`.
 * Centralising them means the domain entity and the service consume the identical literal, the test
 * suite asserts message equality against one place instead of re-typing the text, and verbatim
 * fidelity can be checked by reading a single file. The inventory is at the bottom of this module.
 *
 * ARCHITECTURAL POSITION
 * ----------------------
 * `src/errors/` is a dependency-free leaf below every other layer, so this module declares ZERO
 * imports — no sibling module, no Node builtin, no package, no barrel re-export. An error type that
 * imported a domain entity, a port, an adapter, a rule set, a service or a handler would invert the
 * dependency direction and destroy that position. It follows that no AWS type is named here (all AWS
 * coupling is confined to the handler layer), `process.env` is never read here (configuration flows
 * one way through src/config/), and no query text, table or column identifier appears in any message
 * or constant.
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS
 * -----------------------------------------
 * AAP 0.8.2 Guideline 6 requires that every technology-specific translation decision be
 * documented at the file where the judgment is made. The four judgments made here are:
 *
 *   (a) A CFML `throw("...")` raises a bare, untyped string. Under the Minimal Change Clause
 *       (AAP 0.8.1) idiom may change freely — "idiomatic, conventional TypeScript is
 *       expected" — so the construct becomes a typed `Error` subclass plus exported message
 *       factories and constants. The line between the two halves of that clause is behavior:
 *       the message TEXT may not change, because callers and tests can observe it.
 *   (b) The third message carries two legacy misspellings, and both survive byte for byte.
 *       The annotation on that constant explains why correcting them is forbidden.
 *   (c) `Object.setPrototypeOf` is called in the constructor so `instanceof` keeps working
 *       after esbuild bundling and any downlevelling. See the constructor comment.
 *   (d) `NotImplementedError` exists because two in-scope legacy members are provably
 *       unresolvable in the source repository, and because several in-scope members terminate
 *       at an explicitly out-of-scope collaborator. See that class.
 *   (e) Every error in this hierarchy carries a PUBLIC-SAFE PRESENTATION, and it is DENY BY
 *       DEFAULT: {@link DomainError.getPublicError} yields a neutral text and a request-rejected
 *       code unless a subclass explicitly declares otherwise. See PUBLIC-SAFE PRESENTATION
 *       below for why a `message` written for a maintainer must never be the text a caller
 *       receives, and {@link LegacyParityError} for the one family whose text is disclosed.
 *   (f) The service's failure-code vocabulary is declared here, in the dependency-free leaf,
 *       rather than in the response layer. See {@link PUBLIC_ERROR_CODE}.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - The `getQuantity` guard throw at model/entity/Product.cfc:L445 and model/entity/Sku.cfc:L312.
 *     `getQuantity` reaches exclusively into the out-of-scope inventory, stock and location
 *     services, so the method is not ported and its message is not observable behaviour of the
 *     target. The inventory here is exactly four strings — not three, not five.
 *   - The validation resource-bundle keys, which are declared once in `ValidationError.ts`, the
 *     module that owns the error-key structure.
 *   - HTTP status codes and response shaping, which belong to `src/handlers/httpResponse.ts`.
 *     A failure code declared here is an application-level value, never a protocol one: this
 *     module names no status, and the mapping from code to status is written once, exhaustively,
 *     in that sibling.
 *   - Logging, metrics and telemetry emission. Nothing here writes anywhere. The internal detail
 *     stays ON the error object — `message`, `context`, `cause` and `stack` — for whichever
 *     server-side consumer chooses to record it; see PUBLIC-SAFE PRESENTATION below.
 *   - Any retry, timeout, latency, throughput or capacity semantics. The legacy source states
 *     none for this slice, and AAP IR-12 forbids inventing them.
 */

/* ==========================================================================================
 * PUBLIC-SAFE PRESENTATION
 * ==========================================================================================
 *
 * THE PROBLEM THIS SECTION SOLVES
 * ------------------------------
 * `Error.message` in this port is written for a maintainer. Ported members raise messages that
 * deliberately name the legacy locator they reproduce, the defect identifier they carry
 * unrepaired, the entity identifier in play, the database column that could not be read, or the
 * environment variable that was not set. That is exactly the right content for a log line and
 * exactly the wrong content for a response body: it discloses the service's internal structure,
 * its schema and its configuration surface to whoever provoked the failure.
 *
 * Separating the two is therefore not stylistic. Every error in this hierarchy now answers two
 * different questions with two different values:
 *
 *   - `message`, `context`, `cause` and `stack` — the INTERNAL account. Complete, specific, and
 *     retained on the thrown object so a server-side consumer can log it in full. Nothing in
 *     this module strips, truncates or rewrites any of it.
 *   - {@link DomainError.getPublicError} — the EXTERNAL account. A stable code plus a text that
 *     is safe to hand to any caller.
 *
 * DENY BY DEFAULT
 * ---------------
 * The base implementation returns a neutral request-rejected presentation. A subclass discloses its
 * `message` only by overriding the member and saying so, which means a new thrower cannot leak a
 * maintainer-facing message by omission — the unsafe direction requires an explicit act. Exactly
 * one family is disclosed, and it is recognised by TYPE rather than by an override:
 * {@link LegacyParityError}, whose messages are the legacy CFML `throw()` strings the AAP requires
 * be reproduced verbatim, and which are therefore observable behavior rather than internal detail.
 * `src/handlers/httpResponse.ts` tests for that type and forwards `message` untouched; every other
 * `DomainError` reaches the same boundary and is answered with a fixed neutral text.
 *
 * WHY THE CODE VOCABULARY IS DECLARED HERE (judgment (f))
 * ------------------------------------------------------
 * A caller should face ONE closed vocabulary of failure codes, not one from the error hierarchy
 * and a second from the response layer. This module is the only place both layers can reach —
 * it is the dependency-free leaf everything else sits above — so the whole set is declared here
 * and `src/handlers/httpResponse.ts` draws its codes from it rather than declaring rivals.
 *
 * The set is CLOSED at nine members, and none of them is speculative: each corresponds to an
 * outcome the port already distinguishes structurally. AAP 0.7.3 S9 forbids inventing a taxonomy
 * the source does not call for, and this is not one — it is the existing set of branches made
 * machine-readable, which is precisely what a caller needs once the human-readable text stops
 * being specific. Nothing is added "for completeness": there is no sub-code, no numeric code, no
 * problem-detail type or instance identifier, no documentation URI and no severity.
 * ========================================================================================== */

/**
 * The closed set of stable, public-safe failure codes this service emits.
 *
 * A code is the machine-readable half of a failure and is the member a caller or a test should
 * branch on. It is deliberately coarse: it says what KIND of failure occurred and whether the
 * caller or the service is answerable for it, and nothing more. In particular a code never
 * encodes which property, identifier, column, setting, member or file was involved — that detail
 * is the internal account, and it stays on the error object.
 *
 * Frozen so the declaration is provably immutable at runtime as well as in the type system.
 *
 * REQUEST-ATTRIBUTABLE — the caller can act on these:
 *   - `VALIDATION_FAILED` — a declarative validation rule set rejected the submitted values. The
 *     resource-bundle keys travel separately and unmodified; see `./ValidationError`.
 *   - `CATALOG_REQUEST_REJECTED` — a ported Catalog rule refused the request on grounds the caller
 *     can act on. A subclass declares it by overriding {@link DomainError.getPublicError}; the base
 *     does NOT return it by default, because the base is raised overwhelmingly for conditions no
 *     caller can provoke. See the note on the base presentation below.
 *   - `REQUEST_INVALID` — the request itself could not be read: a required parameter was absent,
 *     or the body was absent, unparseable or not an object.
 *   - `RESOURCE_NOT_FOUND` — no route matched, or the addressed record does not exist.
 *
 * SERVICE-ATTRIBUTABLE — the caller cannot act on these, and none of them discloses why:
 *   - `NOT_IMPLEMENTED` — a boundary-stubbed member was invoked. Reported honestly rather than
 *     answered with a fabricated value, per AAP TR-5.
 *   - `CATALOG_STATE_UNEXPECTED` — a ported Catalog rule found the stored data in a state it
 *     cannot proceed from. The legacy message is still disclosed, because it is observable
 *     behavior, but the fault is the service's; see {@link LegacyParityError}.
 *   - `SERVICE_CONFIGURATION` — a value the deployment must supply is missing or unusable.
 *   - `SERVICE_DATA` — stored data or a driver result could not be read as its declared shape.
 *   - `SERVICE_FAULT` — the deny-by-default classification, carried BOTH by a thrown value this
 *     port did not raise and cannot classify, AND by a plain {@link DomainError} the port raised
 *     without classifying further. Both are failures of this service and both answer 500, so the
 *     one-code-one-status rule holds; the response layer keeps them apart in the log rather than in
 *     the status. See the note on the base presentation below.
 *
 * ⭐ EVERY CODE ABOVE MAPS TO EXACTLY ONE HTTP STATUS, AND NO CODE IS EVER SERIALIZED. The mapping
 * lives in one total, exhaustive switch in `../handlers/httpResponse.ts`; this vocabulary exists so
 * that switch has something to be exhaustive over, not so a response body can publish a taxonomy.
 * AAP 0.7.3 S9 forbids inventing a public error-code registry, so the code stays internal and the
 * status carries the machine-readable half of the answer.
 */
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

/**
 * One member of {@link PUBLIC_ERROR_CODE}.
 *
 * Derived from the frozen object rather than written out a second time, so the runtime set and
 * the type can never drift apart, and so a consumer switching over it is checked exhaustively.
 */
export type PublicErrorCode = (typeof PUBLIC_ERROR_CODE)[keyof typeof PUBLIC_ERROR_CODE];

/**
 * The complete external account of a failure: a stable code and a text safe for any caller.
 *
 * Both members are required, so a presentation can never be half-declared. The shape holds
 * exactly these two members and will not be extended with a diagnostic channel — anything that
 * belongs to the internal account stays on the error object, which is the whole point of the
 * separation described above.
 */
export interface PublicErrorPresentation {
  readonly code: PublicErrorCode;
  readonly message: string;
}

/*
 * The public texts.
 *
 * Deliberately NOT exported. The legacy system has no counterpart for any of them, so none
 * carries a parity obligation, and keeping them module-private means no consumer or test can
 * mistake one for legacy behavior. Assert on the CODE, which is stable and exported, and on the
 * absence of disclosure — never on these strings.
 *
 * Each is terse by design and names nothing: no member, no property, no identifier, no column,
 * no setting, no file, no locator, no defect identifier and no reason.
 */
const UNDISCLOSED_FAILURE_PUBLIC_MESSAGE = 'The request could not be completed';
const NOT_IMPLEMENTED_PUBLIC_MESSAGE = 'This operation is not available';
const SERVICE_CONFIGURATION_PUBLIC_MESSAGE = 'The service is not correctly configured';
const SERVICE_DATA_PUBLIC_MESSAGE = 'The request could not be completed from the stored data';

/*
 * The presentations that carry no runtime value, built once and frozen.
 *
 * Shared instances rather than per-throw literals because they are immutable and identical for
 * every occurrence; freezing them means a consumer cannot mutate the presentation another
 * consumer will read. A presentation that interpolates a message — the legacy-message family —
 * cannot be shared and is built in its own accessor instead.
 */
/*
 * ⭐ THE BASE PRESENTATION CLASSIFIES AS A SERVICE FAULT, NOT AS A REQUEST REJECTION, AND THE
 * CLASSIFICATION IS DERIVED FROM WHAT THE THROW SITES ACTUALLY SAY.
 *
 * An earlier revision moved it to `CATALOG_REQUEST_REJECTED` on the reasoning that a `DomainError`
 * raised by this port IS a deliberate refusal of the request, and that keeping `SERVICE_FAULT` here
 * put one code at two statuses — because the response branch answering a plain `DomainError`
 * hard-coded 400 while the code→status map placed `SERVICE_FAULT` at 500. That premise no longer
 * holds: `../handlers/httpResponse.ts` now DERIVES the status from this presentation instead of
 * hard-coding one, so the contradiction it was resolving does not exist, and resolving it by moving
 * the code left every server-side failure reported to callers as though their request were at fault.
 *
 * ⛔ THE THROW SITES DECIDE IT, AND THEY ARE NOT REFUSALS. The base constructor is raised in 142
 * places in this subtree, and the great majority describe conditions no caller can act on or even
 * provoke: blank statement text reaching an execution boundary, a placeholder count that disagrees
 * with the bound values, a bound parameter that is not a scalar the driver accepts, a projected
 * column whose value is not text, a smart list rooted at an entity with no hydration mapping, a
 * property-scoped smart list naming a collection with no inverse association, and a SKU reaching a
 * write before it has an identifier. Those are faults in this service. Answering them with 400 tells
 * a caller to change a request that was never the problem and hides the fault from every monitor
 * watching the 5xx rate — which is the more dangerous of the two misclassifications, because a
 * mislabelled server fault is invisible while a mislabelled client error is merely rude.
 *
 * ⚠️ ONE CODE STILL MAPS TO ONE STATUS, so the invariant the earlier revision was protecting is
 * intact. `SERVICE_FAULT` maps to 500 wherever it appears, whether it arrives from this base
 * presentation or from the unrecognised-value branch, and the two remain distinguishable in the log
 * because those branches record different phrases. What is NOT retained is the claim that
 * `SERVICE_FAULT` is reserved for foreign values only; see {@link PUBLIC_ERROR_CODE}.
 *
 * ⛔ AND THIS IS STILL NOT A WEAKENING OF THE DISCLOSURE RULE. The presentation carries the same
 * neutral text and discloses nothing — not `message`, not `context`, not `cause`, not `stack`. Only
 * the classification changed, and no code is ever serialized into a response body.
 *
 * A subclass whose situation genuinely IS attributable to the caller should override this member and
 * return `CATALOG_REQUEST_REJECTED`, which is what that code remains available for.
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
 * ⭐ THIS ONE IS A REQUEST REJECTION, AND IT IS THE CASE THE BASE PRESENTATION'S CLOSING PARAGRAPH
 * ANTICIPATED. The block above ends by saying that "a subclass whose situation genuinely IS
 * attributable to the caller should override this member and return `CATALOG_REQUEST_REJECTED`".
 * {@link UniqueConstraintViolationError} is that subclass: the value the caller supplied is already
 * held by another row, which is a fact about the request and not a fault in this service. Answering
 * it with 500 would tell every monitor watching the 5xx rate that the service broke when it did
 * exactly what it was asked to do.
 *
 * The text names nothing — not the table, not the column, not the constraint and not the colliding
 * value. Which property collided is internal, and the internal account carries it (see the class).
 */
const UNIQUE_CONSTRAINT_PUBLIC_MESSAGE = 'A value in the request is already in use';

const UNIQUE_CONSTRAINT_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
  message: UNIQUE_CONSTRAINT_PUBLIC_MESSAGE,
});

/*
 * ⭐ THE SECOND REQUEST REJECTION, AND IT SHARES THE ONE ABOVE'S REASONING EXACTLY (review findings
 * F3 and F5, both CWE-400). A request whose cost this deployment will not undertake is a fact about
 * the REQUEST, not a fault in this service: the caller chose the option selection, or chose a title
 * that keeps colliding, and can choose differently. Answering it with 500 would report a broken
 * service to every monitor watching the 5xx rate while the service was working correctly, and would
 * tell the one party who can act — the caller — nothing actionable.
 *
 * The text names no figure. Disclosing the ceiling would publish a deployment's capacity to an
 * arbitrary caller, and the ceiling is exactly what an attacker probing for a denial-of-service
 * threshold wants to learn. Which budget was exhausted, what it was set to and what the request asked
 * for all stay in the internal account (see the class).
 */
const REQUEST_BUDGET_PUBLIC_MESSAGE =
  'The request asks for more work than one operation may perform';

const REQUEST_BUDGET_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.CATALOG_REQUEST_REJECTED,
  message: REQUEST_BUDGET_PUBLIC_MESSAGE,
});

/*
 * ⛔ THERE IS NO THIRD REQUEST REJECTION, AND AN `ImportSourceRejectedError` IN PARTICULAR MUST NOT BE
 * ADDED. A dedicated class would exist to report a refusal this port does not author: no scheme, host or
 * address rule is stated anywhere in the subtree, because the legacy retrieval at
 * `model/dao/ProductDAO.cfc:L87` checks nothing and AAP §0.6.7.7 authorises exactly ONE departure from
 * behavioural preservation (D18, the importer's parameterised SQL), with AAP §0.8.2 Guideline 4 admitting no
 * proportionality test.
 *
 * ⭐ WHAT DOES RUN IS THE OPERATOR'S OWN POLICY, AND IT NEEDS NO CLASS FROM HERE.
 * `ProductImportSourcePolicy` on `../ports/repositories/ProductRepository` is a REQUIRED member of any
 * retrieving reader, and `../adapters/mysql/MySqlProductRepository.ts` consults it before any read member
 * can be reached — so a refusal raises whatever error the operator's implementation chooses, and
 * `../handlers/httpResponse.ts` classifies by `getPublicError().code` on the {@link DomainError} base.
 * The only reader this subtree ships retrieves nothing and declines every member with a
 * {@link NotImplementedError}.
 *
 * ⚠️ THE RESIDUAL CWE-918 SURFACE IS THEREFORE CARRIED AND RECORDED AS MISMATCH M4 RATHER THAN CLOSED BY
 * THIS PORT: what a caller-supplied location is judged against is the policy an operator injects, and this
 * subtree names none of its content.
 */

/**
 * Optional construction payload shared by {@link DomainError} and every subclass of it.
 *
 * `cause` is forwarded to the ES2022 `Error` constructor rather than stored on a field of our
 * own, so `error.cause` behaves exactly as the platform defines it. It is typed `unknown`
 * because a caught value is `unknown` under `useUnknownInCatchVariables`, and because `any` is
 * not permitted anywhere in this port (AAP 0.7.3 S1).
 *
 * `context` carries structured facts already known at throw time — for example the raw
 * argument values a legacy CFML method was invoked with. It is a plain string-keyed record of
 * `unknown` values so a thrower can attach anything without weakening type safety.
 *
 * ⛔ THERE IS DELIBERATELY NO `publicMessage` MEMBER, AND ITS ABSENCE IS THE POINT. A rival design
 * classified a message as client-safe by having the thrower pass the text a SECOND time under this
 * name, and `src/handlers/httpResponse.ts` disclosed a message only when the two agreed. It was
 * default-deny and it worked, but it was silently omittable at exactly the four throw sites that
 * needed it: a new author writing one of the verbatim legacy strings would get a compiling,
 * lint-clean, test-passing throw that quietly lost parity at the boundary. {@link LegacyParityError}
 * makes the same statement in the TYPE, where it cannot be forgotten and where `instanceof` checks
 * it. Reinstating an option here would give the boundary two disclosure channels, and the weaker one
 * would decide whichever case its author happened to reach for.
 *
 * Every member is declared optional, and `exactOptionalPropertyTypes` is enabled, so a caller
 * must omit a member entirely rather than pass it as `undefined`.
 */
export interface DomainErrorOptions {
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
}

/**
 * Base class for every error this service raises from its own domain, service, validation,
 * adapter and integration code.
 *
 * It replaces the legacy CFML idiom of throwing a bare string. Catching code can therefore
 * distinguish a failure this port raised deliberately from a programming fault such as a
 * `TypeError`, which the untyped legacy form made impossible.
 *
 * @example
 * ```ts
 * throw new DomainError(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE, {
 *   context: { productId, baseProductType },
 * });
 * ```
 */
export class DomainError extends Error {
  /**
   * Structured facts attached by the thrower, present only when the thrower supplied them.
   *
   * Declared as an optional member rather than as `Record<string, unknown> | undefined`
   * because `exactOptionalPropertyTypes` is enabled: the field is assigned only when a value
   * actually exists and is never explicitly set to `undefined`.
   */
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
   * caller. See PUBLIC-SAFE PRESENTATION in the module header for the reasoning in full.
   *
   * THIS IMPLEMENTATION IS DENY BY DEFAULT, AND THAT IS THE SECURITY PROPERTY. A plain
   * `DomainError` raised anywhere in the port reports a neutral rejection and discloses
   * nothing at all — not its `message`, not its `context`, not its `cause`, not its `stack`.
   * Ported members raise messages that name legacy locators, defect identifiers, entity
   * identifiers, database columns and environment-variable names, and none of that may reach a
   * caller. Because the safe answer is the inherited one, a thrower cannot leak by omission: a
   * new `throw new DomainError(...)` anywhere in the subtree is sanitised the moment it is
   * written, with no further action by its author.
   *
   * The internal account is not discarded, only withheld. `message`, `context`, `cause` and
   * `stack` all remain on this object exactly as the thrower supplied them, so a server-side
   * consumer can record the complete detail. This module performs no such recording itself: it
   * adds no logging dependency (AAP 0.7.3 S5) and stays a pure value type.
   *
   * Override it only where the situation is genuinely attributable to the caller, or where the
   * message text is observable legacy behavior. Every override in this hierarchy is listed in
   * {@link PUBLIC_ERROR_CODE}, and each one states its own justification.
   *
   * @returns the code and text that may be disclosed
   */
  public getPublicError(): PublicErrorPresentation {
    return SERVICE_FAULT_PRESENTATION;
  }
}

/**
 * Raised when a value the deployment must supply is missing, empty or unusable.
 *
 * WHY THIS TYPE EXISTS, AND WHY A PLAIN `Error` WAS NOT ENOUGH. A configuration fault is not a
 * programming fault and it is not a bad request: the caller did nothing wrong and can do nothing
 * about it. Raised as a bare `Error` it is indistinguishable from a `TypeError`, so the response
 * layer can neither classify it nor sanitise it, and it lands in the catch-all branch that exists
 * for values this port did not raise. Raised as this type it classifies as a service fault, maps
 * to a server status, and discloses nothing — while the setting name, the resolved value and the
 * reason all stay on the error object for a log.
 *
 * The message and `context` should be as specific as a maintainer needs. Name the setting, the
 * key, the expected shape and what was found; none of it is disclosed. Do NOT soften the message
 * for the caller's benefit — the caller never sees it.
 *
 * @example
 * ```ts
 * throw new ConfigurationError(
 *   `Setting ${key} has no deployment-supplied value and no metadata default, so it cannot be ` +
 *     'resolved.',
 *   { context: { key } },
 * );
 * ```
 */
export class ConfigurationError extends DomainError {
  /**
   * Reports a service-configuration fault. The specific message stays internal.
   *
   * @returns the neutral configuration presentation
   */
  public override getPublicError(): PublicErrorPresentation {
    return SERVICE_CONFIGURATION_PRESENTATION;
  }
}

/**
 * Raised when stored data, or a value a driver returned, cannot be read as the shape its
 * declaration promises.
 *
 * It is the counterpart of {@link ConfigurationError} for the data plane: a required column
 * absent from a result set, a result that is not a list of rows, a column holding a value of the
 * wrong type, or a numeric column whose text cannot be carried without loss. In every case the
 * request was well formed and the service is answerable, so it classifies as a service fault.
 *
 * Distinguishing it from a configuration fault is worth a separate type because the two demand
 * different operator responses — one is fixed in a deployment value, the other in the data or the
 * mapping — and the code is the only signal a caller-side operator gets. Nothing beyond that
 * coarse distinction is disclosed: the column name, the expected shape and the value's type
 * belong in `context` and stay there.
 *
 * @example
 * ```ts
 * throw new DataIntegrityError(
 *   `Column "${columnName}" is absent from the result set, so the row cannot be mapped.`,
 *   { context: { columnName } },
 * );
 * ```
 */
export class DataIntegrityError extends DomainError {
  /**
   * Reports a service data fault. The specific message stays internal.
   *
   * @returns the neutral data presentation
   */
  public override getPublicError(): PublicErrorPresentation {
    return SERVICE_DATA_PRESENTATION;
  }
}

/**
 * Raised when the database refuses a write because the value it carries is already held.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — WHY A DISTINCT CLASS EXISTS FOR ONE DRIVER ERROR NUMBER.
 * ------------------------------------------------------------------------------------------------
 * Uniqueness in this slice is decided by an application-side existence probe — `isUniqueProperty` at
 * `org/Hibachi/HibachiDAO.cfc:L130-L146`, ported in `../adapters/mysql/UniquePropertyChecker.ts` — and
 * that probe is a READ followed later by a WRITE, serialized by nothing on any path — the legacy takes no
 * lock there, and neither does the port. The database is therefore the ONLY remaining authority: five of
 * the seven in-scope uniqueness rules stand on a
 * `unique="true"` column (`model/entity/Product.cfc:L54` and `:L56`, `model/entity/Sku.cfc:L54`,
 * `model/entity/ProductType.cfc:L56`, `model/entity/Brand.cfc:L55`), and a write that loses a race
 * against one of those columns comes back as MySQL error 1062 rather than as a validation verdict.
 *
 * WITHOUT THIS CLASS THAT OUTCOME WAS INDISTINGUISHABLE FROM A SERVICE FAULT. The driver's own error
 * reached the caller unclassified, so a collision — a fact about the caller's data — was reported with
 * the same neutral 500-class presentation as a blank statement or an unbindable parameter. Closing that
 * REPORTING gap is what this class does, here and at the two execution boundaries that translate into it.
 *
 * ⛔ THE OTHER HALF — SERIALIZING THE CHECK AGAINST THE WRITE — IS NOT CLOSED, AND WAS DELIBERATELY
 * WITHDRAWN. An earlier revision had `../adapters/mysql/UniquePropertyChecker.ts` take a `FOR UPDATE` when
 * it was transaction-scoped; the current review's finding F4 removes it as an extension of the single
 * declared D18 exception by analogy, which AAP §0.1.2.1 excludes. So the race is CARRIED (AAP IR-9), and
 * this class is the report of its LOSS rather than a means of preventing it. The distinction matters for
 * the two properties with no `unique="true"` column at all — `Option.optionCode` and
 * `OptionGroup.optionGroupCode` — where nothing raises 1062 and therefore nothing raises this: see
 * `../ports/UniquePropertyPort.ts`, which flags that gap rather than claiming it closed.
 *
 * ⭐ WHY THIS IS A CLASSIFICATION CHANGE AND NOT A BEHAVIOUR CHANGE, WHICH IS WHAT LICENSES IT.
 * AAP §0.8.2 Guideline 4 forbids enhancing behaviour beyond what the migration requires, and AAP
 * §0.6.7 governs with "preserve and annotate, do not repair". Neither is engaged: the legacy write
 * ALSO failed on a duplicate key, surfacing a raw CFML database exception out of the middle of the
 * save. The set of writes that succeed is unchanged, the set that fail is unchanged, and the point at
 * which they fail is unchanged. Only the SHAPE of the report differs, and reporting is precisely what
 * the migration must re-express because there is no CFML exception type to carry across. This is the
 * same footing as D18 (AAP §0.6.7.7): a divergence that removes a defect class without changing an
 * outcome for any input the legacy accepted.
 *
 * ⚠️ IT IS NOT A VALIDATION FAILURE, AND MUST NOT BE CONVERTED INTO ONE HERE. A validation failure in
 * this port is a keyed message assembled by `../validation/Validator.ts` — `validate.save.Option.
 * optionCode.unique` and its six siblings — and the key is composed from a context, an entity name and
 * a property identifier that a driver error number does not carry. Fabricating one at the execution
 * boundary would invent a message the legacy engine never emitted for this path, so the boundary
 * raises this instead and leaves the keyed vocabulary to the layer that owns it.
 *
 * ⚠️ WHAT THE INTERNAL ACCOUNT MAY AND MAY NOT CARRY. The driver's message for error 1062 embeds the
 * COLLIDING VALUE — of the form `Duplicate entry '<value>' for key '<table>.<index>'`. That value is
 * caller data and frequently the very field under validation, so the translating boundary records the
 * constraint's NAME and never the value, and attaches the driver error as `cause` so nothing is lost
 * for a server-side reader. See `../adapters/mysql/QueryRunner.ts` for the extraction and the
 * sanitisation it performs.
 */
export class UniqueConstraintViolationError extends DomainError {
  /**
   * Reports a rejected request. Which constraint collided stays internal.
   *
   * @returns the neutral request-rejection presentation
   */
  public override getPublicError(): PublicErrorPresentation {
    return UNIQUE_CONSTRAINT_PRESENTATION;
  }
}

/**
 * Raised when a request exceeds a budget for the work one operation may perform.
 *
 * ⚠️ FOUR BUDGETS ARE IN FORCE IN THIS SUBTREE, AND NONE OF THEM CURRENTLY RAISES THROUGH THIS CLASS.
 * `../adapters/mysql/SmartListQueryBuilder.ts` refuses a materialisation above its
 * `SmartListMaterialisationBudget`; `../services/SkuService.ts` refuses an enumeration above its
 * `SkuCombinationBudget`; `../util/urlTitle.ts` refuses a derivation above its `UrlTitleProbeBudget`; and
 * `../integrations/google/ProductFeedBuilder.ts` refuses a render above its feed budget. Each raises a
 * {@link DomainError} carrying its own diagnostic message, and an unstated figure raises
 * {@link ConfigurationError} naming the variable instead.
 *
 * ⭐ SO THIS CLASS IS A DECLARED PRESENTATION CONTRACT WITH NO RAISE SITE TODAY, AND IT IS RETAINED
 * DELIBERATELY. It is the one presentation for "the request asks for more work than one operation may
 * perform", which `../handlers/httpResponse.ts` maps to 400; a budget refusal that reached the base
 * presentation instead would be reported as a broken service on the 5xx rate. ⛔ A REFUSAL MOVED ONTO THIS
 * CLASS MUST KEEP ITS DIAGNOSTIC INTERNAL — the figure and what was asked for belong in `context`, never in
 * the public message.
 *
 * WHAT THE INTERNAL ACCOUNT SHOULD CARRY, since none of it is disclosed: the budget that was
 * exhausted, the figure it was set to, what the request asked for, and the legacy locator of the
 * unbounded construct being bounded. See the throwing site for what it attaches.
 *
 * @example
 * ```ts
 * throw new RequestBudgetExhaustedError(
 *   'The smart list matched more records than this deployment permits materialising in one request.',
 *   { context: { maximumRecordsPerRequest, matched } },
 * );
 * ```
 */
export class RequestBudgetExhaustedError extends DomainError {
  /**
   * Reports a rejected request. Which budget was exhausted, and its figure, stay internal.
   *
   * @returns the neutral request-rejection presentation
   */
  public override getPublicError(): PublicErrorPresentation {
    return REQUEST_BUDGET_PRESENTATION;
  }
}

/**
 * Raised by a boundary stub for an in-scope member that this port cannot implement.
 *
 * Two distinct categories of member need this signal. The per-site defect ID and the reason a
 * particular member is stubbed belong on the throwing member itself, so this is not an inventory of
 * every stub:
 *
 * 1. Members whose legacy implementation is unresolvable in the source repository, carried across as
 *    this error rather than repaired, because inventing an implementation would add behaviour the
 *    legacy system does not have:
 *      - model/service/SkuService.cfc:L281-L282 declares `getSkuStocksDeletableFlag()` and delegates
 *        it to a `SkuDAO` member of the same name that the data-access layer never defines, so the
 *        legacy call can never have resolved. TODO(parity) D4 — carried, not repaired.
 *      - model/entity/Product.cfc:L631-L632 declares `getProductOptionsByGroup()` and calls a
 *        product-service member the service never defines. TODO(parity) D5 — carried, not repaired.
 *
 * 2. Members whose behaviour terminates at an out-of-scope collaborator reached through a declared
 *    port rather than through converted code — the image-handling members, and the subscription and
 *    content-access branches of the SKU-creation discriminator. Those members stay on the public
 *    surface, because dropping them would break interface parity; they raise this error instead of
 *    silently returning a fabricated value.
 *
 * The retired framework signalled an unresolvable call from `onMissingMethod`
 * (org/Hibachi/HibachiService.cfc:L255-L281, throwing at :L280). That string is deliberately not
 * exported as a constant here: it lies outside the four-string inventory this module owns, and this
 * port replaces runtime method synthesis with explicitly declared, typed methods rather than
 * reproducing it.
 *
 * @example
 * ```ts
 * throw new NotImplementedError(
 *   'SkuService.getSkuStocksDeletableFlag',
 *   'the legacy data-access member it delegates to does not exist in the source repository',
 * );
 * ```
 */
export class NotImplementedError extends DomainError {
  /**
   * The un-portable member, named as `Class.method`.
   *
   * Exposed as a field so a server-side consumer and an in-process test can identify it
   * programmatically instead of parsing {@link Error.message}. It is part of the INTERNAL account
   * and is deliberately absent from {@link getPublicError}: a member name is a map of the
   * service's internal structure, and naming the boundary stubs to an arbitrary caller invites
   * exactly the enumeration a caller has no legitimate use for. The gap stays legible where it
   * matters — in a log, in a test, and in this port's own documentation.
   */
  public readonly member: string;

  /**
   * @param member the un-portable member, named as `Class.method`
   * @param reason why it cannot be implemented; omit it when the throwing member's own doc
   *   comment already records the reason. It is diagnostic only and never reaches a client.
   * @param options optional `cause` and `context` forwarded to {@link DomainError}.
   */
  public constructor(member: string, reason?: string, options?: DomainErrorOptions) {
    /*
     * The reason-free form of the diagnostic message, composed once and then extended when a reason
     * was supplied, so the two spellings cannot drift apart.
     *
     * ⚠️ THIS TEXT WAS ALSO PASSED AS A `publicMessage` CLASSIFICATION, AND IT NO LONGER IS. The
     * option it was passed to is gone — see {@link DomainErrorOptions} for why the disclosure
     * decision moved into the type system — and it had become dead in any case: this subclass
     * overrides {@link NotImplementedError.getPublicError} to return a NEUTRAL presentation, and
     * `src/handlers/httpResponse.ts` answers this family with a fixed text and reads neither the
     * message nor the member. Nothing consumed the classification, so a doc comment claiming the
     * response layer "relies on this text to keep the gap legible" was describing a mechanism that
     * had already been replaced by the 501 status. TR-5 is satisfied by the status and by the member
     * staying on this object for a log, which is where the gap is legible.
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
   * The failure is surfaced honestly — it is never swallowed, never converted into a success and
   * never answered with a fabricated value, per AAP TR-5 — but it is surfaced as a KIND rather
   * than as a description. The member name and the reason stay on this object for a log; see the
   * note on {@link member}.
   *
   * @returns the neutral not-implemented presentation
   */
  public override getPublicError(): PublicErrorPresentation {
    return NOT_IMPLEMENTED_PRESENTATION;
  }
}

/**
 * Raised with one of the four verbatim legacy message strings this module owns, and with nothing
 * else.
 *
 * WHY A SUBCLASS RATHER THAN A FLAG, A CODE OR A STRING TEST
 * ---------------------------------------------------------
 * Two obligations meet at the response boundary and pull in opposite directions:
 *
 *   - The four strings in the inventory below are OBSERVABLE BEHAVIOR. AAP 0.8.2 Guideline 2 and
 *     Guideline 4, and AAP 0.7.3 S7, require them to reach a caller character for character,
 *     misspellings included. `src/handlers/httpResponse.ts` forwards them untouched.
 *   - Every OTHER message raised as a {@link DomainError} anywhere in this deliverable is a
 *     diagnostic authored by this port, not by the legacy system. Those messages routinely name
 *     the thing that failed — a configuration variable, a column, a storage path, a legacy source
 *     locator — because they exist to make a fault legible to whoever is holding the code. None of
 *     them carries a parity obligation, and none of them belongs in a response body.
 *
 * A message-text test cannot separate the two populations honestly. Two of the four strings
 * interpolate a runtime value, so recognition would degrade to prefix matching on a string this
 * port is contractually forbidden to inspect or transform, and it would amount to the error-code
 * registry AAP 0.7.3 S9 rules out. A boolean option on {@link DomainErrorOptions} would separate
 * them, but it would also be silently omittable at any of the throw sites that need it.
 *
 * A subclass makes the distinction STRUCTURAL instead. Disclosure becomes default-deny: the great
 * majority of this deliverable's `DomainError` throw sites need no change and disclose nothing,
 * and the four that carry a legacy string say so in their type. The response boundary then tests a
 * type rather than a string, which the compiler and `instanceof` can check rather than a reviewer
 * having to. This is the same shape of decision already recorded on
 * `src/ports/AccountContextPort.ts`: make the unsafe state inexpressible rather than merely
 * defaulted against.
 *
 * WHAT THIS CLASS DOES NOT DO. It adds no member, no code, no category, no severity and no
 * taxonomy (AAP 0.7.3 S9), and it changes nothing about how an error is raised, caught or logged.
 * It does not validate its own message either — a constructor that checked its argument against
 * the inventory would be the string test this class exists to avoid — so membership is a
 * documented obligation on the four throw sites, exactly as verbatim fidelity is a documented
 * obligation on the inventory itself. It is not a general-purpose "safe to show a caller" error:
 * it means "this text is legacy behavior", and the four strings below are its whole membership.
 *
 * WHY ALL FOUR ANSWER THE SAME STATUS, THOUGH THEY DO NOT SHARE AN ATTRIBUTION. The attribution
 * genuinely differs, and the distinction is worth recording even though it does not change the
 * response: the three raised from `model/entity/Product.cfc:355`, `:357` and `:362` all follow from
 * the caller's own option selection resolving to the wrong number of SKUs, so the caller can change
 * the selection and retry, while the one raised from `model/service/SkuService.cfc:204` is the
 * fallthrough of the three-way base-product-type discriminator and fires when a STORED product type
 * matches none of the three seeded at `config/dbdata/SlatwallProductType.xml.cfm:13-15` — a data
 * state the caller neither caused nor can correct.
 *
 * A rival design carried that attribution as a required constructor argument narrowing
 * {@link PUBLIC_ERROR_CODE} to two members, so the fourth string answered 500 while the other three
 * answered 400. It is not adopted, for two reasons that both point the same way. It would give this
 * class a `code` member, and "adds no member, no code, no category, no severity and no taxonomy" is
 * the property above that makes the class checkable rather than a taxonomy in disguise. And the
 * uniform status is the TESTED one: the four parity cases in `test/services/SkuService.test.ts` —
 * `:1218` (the `createSkus` fallthrough), `:1227` and `:1236` (the two interpolated messages) and
 * `:1246` (both legacy misspellings) — each resolve 400 and each pin the body with
 * `toStrictEqual({ message })`. A status-varying design would have to answer 500 for one of those four
 * while the assertions demand 400 for all of them, so it cannot satisfy them at all.
 *
 * ⚠️ AND THE EMITTED BODY CARRIES NO `code` AT ALL, WHICH STRENGTHENS THE ARGUMENT RATHER THAN
 * WEAKENING IT. An earlier revision of this paragraph claimed the body carried `code` beside
 * `message` and cited assertions to that effect; both are wrong now. `ErrorResponseBody` in
 * `src/handlers/httpResponse.ts` is `{ message; errors? }`, that file's own contract note records why,
 * and `test/services/SkuService.test.ts:1507-1509` walks every error family asserting
 * `Object.keys(body)` is exactly `['message']` and that neither `SERVICE_FAULT` nor
 * `CATALOG_REQUEST_REJECTED` appears anywhere in the serialized text. So the classification never
 * leaves the process: `statusForPublicErrorCode` reads it to CHOOSE a status and nothing publishes it,
 * which is precisely why a rival design giving this class its own `code` member would buy nothing a
 * caller could observe. `CATALOG_STATE_UNEXPECTED` still maps to 500 there, so the internal
 * vocabulary loses nothing.
 *
 * @example
 * ```ts
 * throw new LegacyParityError(moreThanOneSkuReturnedMessage(selectedOptions));
 * ```
 */
export class LegacyParityError extends DomainError {
  /**
   * @param message - one of the four verbatim legacy texts, and nothing else. The parameter is typed
   *   {@link LegacyParityMessage} rather than `string`, so the four exports below are the ONLY values
   *   that satisfy it and an authored diagnostic cannot be passed here at all. See
   *   {@link LegacyParityMessage} for why the narrowing exists and what it caught.
   * @param options - the ordinary diagnostic payload. A parity message may carry a `context` for the
   *   log exactly as any other error may; the payload never reaches a response body.
   */
  public constructor(message: LegacyParityMessage, options?: DomainErrorOptions) {
    super(message, options);
  }
}

/**
 * A string that IS one of the four verbatim legacy texts, as a type the compiler can check.
 *
 * WHY THIS EXISTS. `src/handlers/httpResponse.ts` publishes a thrown message verbatim on exactly one
 * branch, and it selects that branch by TYPE: an error is `LegacyParityError` or it is not. That makes
 * the type a disclosure authorisation, and while the type was satisfied by any `string` the
 * authorisation was effectively "whatever the throw site felt like". It was in fact misused — a
 * maintainer-facing diagnostic in `src/services/ProductService.ts`, naming internal CFML argument
 * names, a legacy source locator and the identifiers of two internal guards, was raised as a
 * `LegacyParityError` and therefore published to the caller word for word (CWE-209). Nothing about
 * that throw was ill-intentioned; the type simply did not say what it meant.
 *
 * So the authorisation is narrowed to the four texts it was always meant to cover. Because the four
 * exports below are the only values of this type, and because {@link LegacyParityError}'s constructor
 * accepts nothing else, "this message is legacy behaviour" is now a claim the compiler verifies rather
 * than a convention a reviewer has to notice.
 *
 * ⚠️ IT IS A BRAND, NOT A VALIDATOR. The type carries no run-time representation whatsoever: a branded
 * message is the same string at run time, so nothing is allocated, nothing is wrapped, and the four
 * texts stay byte-identical to the CFML source — which is the one property this whole section exists to
 * protect. The brand's only effect is at compile time.
 *
 * ⛔ DO NOT WIDEN IT, AND DO NOT ADD AN ESCAPE HATCH. There is deliberately no exported minting
 * function, no `asLegacyParityMessage` helper and no overload taking a plain string. Any of those would
 * restore precisely the hole this closes, and would do so in a form that looks sanctioned. A genuinely
 * new legacy text is added by adding a fifth export to the inventory below, with its file-and-line
 * locator, which is the review step that matters.
 */
export type LegacyParityMessage = string & { readonly [LEGACY_PARITY_BRAND]: true };

/**
 * The brand key. Declared, never defined, and never emitted — it exists only in the type system.
 *
 * A `unique symbol` is used rather than a string literal key so no object type declared anywhere else,
 * by accident or by construction, can be assignable to {@link LegacyParityMessage}.
 */
declare const LEGACY_PARITY_BRAND: unique symbol;

/**
 * Applies the brand. THE ONE PLACE IN THE SUBTREE WHERE THE ASSERTION IS MADE, AND IT IS NOT EXPORTED.
 *
 * The assertion is unavoidable — a brand has no run-time value, so it cannot be produced by any
 * operation — and the whole design consists of making it occur exactly once, in this file, applied only
 * to a literal that carries a legacy locator. Every other file names one of the four exports instead.
 *
 * @param text - a legacy text quoted verbatim from the CFML source, with its locator recorded on the
 *   export that calls this function.
 * @returns the same string, branded.
 */
function legacyParityMessage(text: string): LegacyParityMessage {
  return text as LegacyParityMessage;
}

/* ==========================================================================================
 * VERBATIM LEGACY MESSAGE INVENTORY — exactly four strings, byte-identical to the CFML source
 * ==========================================================================================
 *
 * AAP 0.7.3 S7 ("preserve and annotate, do not repair") and AAP 0.8.2 Guidelines 2 and 4
 * govern this section absolutely. Every string below is reproduced character for character
 * from the legacy source and carries the file and line it came from. Rewording,
 * re-punctuating, prefixing, appending, trimming, re-casing or spell-correcting any of them
 * would change observable behavior and is forbidden. The legacy `throw()` lines themselves are
 * cited by locator and deliberately not quoted in these comments, so that each message text
 * occurs exactly once in this directory and verbatim fidelity stays checkable by a single
 * search per string.
 *
 * The export shape is deliberately MIXED — two factory functions and two plain constants —
 * because two of the four legacy strings interpolate a runtime value and two do not.
 * Homogenising them into four factories or four constants would obscure which strings actually
 * carry a value, and is exactly the kind of unrequested tidying AAP 0.8.2 Guideline 4 forbids.
 *
 * ⚠️ EVERY THROW OF ONE OF THESE FOUR STRINGS MUST RAISE {@link LegacyParityError}, and the converse
 * is now enforced: {@link LegacyParityError} accepts NOTHING BUT one of these four, because its
 * constructor takes {@link LegacyParityMessage}. The obligation below is the half a compiler cannot
 * check, and it is the one a new throw site is most likely to miss. `src/handlers/httpResponse.ts` WITHHOLDS a
 * domain message from the response body unless the error's TYPE says it is legacy behaviour, so a
 * throw that passes one of these strings on a plain {@link DomainError} would keep parity in the log
 * and silently lose it at the boundary — the caller would receive a neutral body where the CFML
 * application returned the legacy text. These four are the ONLY strings in the subtree that may be
 * raised that way.
 *
 * ⛔ AN EARLIER REVISION OF THIS NOTE INSTRUCTED THE OPPOSITE — "bind the value once and pass it
 * twice, as the message and as a `publicMessage` option" — which was correct for a disclosure design
 * that has since been replaced, and would today produce exactly the silent parity loss the paragraph
 * above warns about. The option no longer exists. The correction is recorded rather than quietly
 * applied, because an instruction that used to be right is more dangerous than one that never was.
 *
 * THE CONTROL STRUCTURE THAT SELECTS BETWEEN THE FIRST THREE
 * ---------------------------------------------------------
 * Read from model/entity/Product.cfc:L349-L364. A consumer porting
 * `Product.getSkuBySelectedOptions` must reproduce these branches exactly:
 *
 *   L349  getSkuBySelectedOptions(selectedOptions = "")   <- the default is the EMPTY STRING
 *   L350    if len(selectedOptions) > 0
 *   L351      skus = getSkusBySelectedOptions(selectedOptions)
 *   L352        if      arrayLen(skus) == 1  -> return skus[1]
 *   L354        else if arrayLen(skus)  > 1  -> throw MESSAGE 1
 *   L356        else if arrayLen(skus)  < 1  -> throw MESSAGE 2
 *   L359    else if arrayLen(getSkus()) == 1 -> return getSkus()[1]
 *   L361    else                             -> throw MESSAGE 3
 *
 * MESSAGE 3 IS NOT AN ARGUMENT-VALIDATION GUARD, and mistaking it for one is the single most
 * likely way to wire this inventory up wrongly. It is reached only on the empty-selection
 * branch, and only when the product does not have exactly one SKU. An empty `selectedOptions`
 * is a legal, meaningful input (AAP 0.6.1.3 T5): with an empty list the underlying query
 * legitimately degenerates to every option-bearing SKU of the product, and both
 * `Product.getSkuBySelectedOptions` and `Sku.hasUniqueOptions` depend on that degenerate form.
 * Using MESSAGE 3 to reject an empty input would fire it on the wrong branch and break both
 * callers.
 * ========================================================================================== */

/**
 * MESSAGE 1 — raised when a non-empty option selection resolves to two or more SKUs.
 *
 * Verbatim from model/entity/Product.cfc:L355, the branch taken when the resolved SKU array
 * holds more than one element.
 *
 * The legacy CFML interpolated the caller's `selectedOptions` argument straight into the
 * message, so this factory takes exactly one parameter and appends it unchanged: no prefix, no
 * suffix, no trimming, no normalising, no quoting and no JSON encoding. Pass the raw
 * comma-delimited option list exactly as it was received. Note the single space after the
 * colon, which is part of the legacy text.
 *
 * @param selectedOptions the raw comma-delimited option-ID list exactly as passed in
 * @returns the legacy message text, byte-identical to the CFML original
 */
export function moreThanOneSkuReturnedMessage(selectedOptions: string): LegacyParityMessage {
  return legacyParityMessage(
    `More than one sku is returned when the selected options are: ${selectedOptions}`,
  );
}

/**
 * MESSAGE 2 — raised when a non-empty option selection resolves to no SKU at all.
 *
 * Verbatim from model/entity/Product.cfc:L357, the branch taken when the resolved SKU array is
 * empty.
 *
 * Interpolation rules are identical to {@link moreThanOneSkuReturnedMessage}: exactly one
 * parameter, appended unchanged. Two details of the legacy text are easy to lose and both are
 * preserved — the single space after the colon, and the capitalised plural in the second word.
 *
 * @param selectedOptions the raw comma-delimited option-ID list exactly as passed in
 * @returns the legacy message text, byte-identical to the CFML original
 */
export function noSkusFoundForSelectedOptionsMessage(selectedOptions: string): LegacyParityMessage {
  return legacyParityMessage(`No Skus are found for these selected options: ${selectedOptions}`);
}

/**
 * MESSAGE 3 — raised on the EMPTY-selection branch when the product does not have exactly one
 * SKU. Verbatim from model/entity/Product.cfc:L362.
 *
 * Read this constant's name as a description of the BRANCH it belongs to, not as a description
 * of an argument requirement. See the control-structure note above: this is not a guard
 * against a missing or empty argument, and an empty selection is a legal input.
 *
 * PARITY WARNING — the legacy text contains two misspelled words, and both are carried across
 * deliberately and byte for byte. They are not typos introduced by this port and they must not
 * be corrected: the message is observable behavior, so AAP 0.8.2 Guideline 2 (preserve
 * existing functionality and behavior exactly as-is) and Guideline 4 (do not enhance or
 * optimize beyond what the migration requires) both forbid touching it, and AAP 0.7.3 S7
 * requires it be annotated rather than repaired. Two further details of the legacy text are
 * reproduced just as literally: the argument name embedded in the message does not match the
 * actual parameter name, which is `selectedOptions`, and there is no trailing period.
 *
 * TODO(parity): the two misspellings and the mismatched embedded argument name are retained
 * from the legacy source and are intentionally NOT repaired.
 */
export const NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE: LegacyParityMessage =
  legacyParityMessage(
    'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
  );

/**
 * MESSAGE 4 — the fallthrough of the three-way base-product-type discriminator in
 * `SkuService.createSkus`. Verbatim from model/service/SkuService.cfc:L204.
 *
 * The legacy method branches on the product's base product type over the merchandise,
 * subscription and content-access discriminators seeded at
 * config/dbdata/SlatwallProductType.xml.cfm:L13-L15, and raises this message when the value
 * matches none of them. AAP 0.4.1.8 requires the fallthrough be "preserved verbatim", so the
 * text is reproduced exactly, including the absence of a trailing period.
 *
 * Note that the legacy string says nothing about which discriminator was seen. Enriching it
 * with the offending value would be an enhancement AAP 0.8.2 Guideline 4 forbids; attach the
 * value through the `context` payload of {@link DomainError} instead, which adds diagnostic
 * detail without altering the observable message.
 */
export const UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE: LegacyParityMessage = legacyParityMessage(
  'There was an unexpected error when creating this product',
);
