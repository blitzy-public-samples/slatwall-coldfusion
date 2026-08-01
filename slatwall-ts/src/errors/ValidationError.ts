/**
 * ValidationError — the ported error-key structure of the Catalog slice, and the single declaration
 * site for the four legacy resource-bundle keys the slice reports failures with.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A legacy validation failure is not a sentence. It is a struct keyed by property name, each key
 * holding an ordered array of resource-bundle KEYS. Two properties of that structure are observable
 * behaviour and are preserved character for character: which KEY a failure is reported under, and
 * the exact key strings stored as its messages. Everything else about the container is idiom.
 * Report a failure under the wrong key, or repair a key's spelling, and validation output silently
 * stops being comparable to the legacy system — with no compile error and no failing test elsewhere.
 *
 * Legacy origins, reference only:
 *   org/Hibachi/HibachiErrors.cfc:L1-L75 — the error bean: a struct of arrays, lazily keyed, with an
 *     empty struct as its initial form, and `addErrors` merging key by key rather than replacing.
 *   org/Hibachi/HibachiTransient.cfc:L29-L68 — the surface the in-scope entities actually expose,
 *     and therefore the shape this class mirrors, including the empty array `getError` returns on a
 *     miss (:L43).
 *   org/Hibachi/HibachiValidationService.cfc:L200-L235 — how a failed constraint becomes a key plus
 *     a message.
 *   model/validation/Sku.json:L5-L8 — the two method-based rules that share one reporting key.
 *   model/service/SkuService.cfc:L143, :L148, :L176 and model/service/ProductService.cfc:L253 — the
 *     four resource-bundle keys declared below, and the only four addError call sites in the slice.
 *
 * THE REPORTING KEY IS THE PROPERTY IDENTIFIER, NEVER THE RULE NAME
 * ----------------------------------------------------------------
 * model/validation/Sku.json:L5-L8 attaches two method-based rules to the single property `options`
 * on the `save` context, and both failures are reported under the key `options`. Neither method name
 * is ever used as an error key. Every branch of the legacy validation service corroborates that:
 * org/Hibachi/HibachiValidationService.cfc:L224, :L228 and :L232 all report against the FULL
 * property identifier, and the shortened name derived at :L208 is used only to build the message.
 *
 * That is also why a key holds an ARRAY rather than a single string: two independent rules target
 * `options` in the same context, so one save can legitimately land two messages under one key, and
 * collapsing the value to a string would silently discard one of them.
 *
 * A STORED MESSAGE IS A RESOURCE-BUNDLE KEY, NOT DISPLAY TEXT
 * ----------------------------------------------------------
 * The legacy validation service composes a failed constraint's message in one of three shapes and
 * then substitutes a small template struct into it:
 *
 *   :L222  method constraint    validate.<context>.<className>.<propertyName>.<constraintValue>
 *   :L226  dataType constraint  validate.<context>.<className>.<propertyName>
 *                                 .<constraintType>.<constraintValue>
 *   :L230  any other type       validate.<context>.<className>.<propertyName>.<constraintType>
 *
 * Composing those strings belongs to src/validation/Validator.ts, not here; the shapes are recorded
 * so it is unambiguous that a stored message is an opaque key rather than a sentence.
 *
 * ARCHITECTURAL POSITION
 * ----------------------
 * src/errors/ is a leaf below every other layer, so ./DomainError is the ONLY import: no domain
 * entity, no port, no adapter, no rule set, no service, no handler, no configuration module, no Node
 * builtin, no package. That is why the `options` key and the two rule names above are documented in
 * prose rather than imported from the SKU rule set. It follows that no cloud type is named here, the
 * process environment is never read, and no query text or column identifier appears in any key or
 * message.
 *
 * Every member is synchronous and allocation-cheap: no I/O, no promise, no cache, no memoisation and
 * no awareness of a transaction or a flush. That last point is load-bearing. `Sku.hasUniqueOptions`
 * (model/entity/Sku.cfc:L756-L769) is a declarative rule that performs a database read, so a batch of
 * SKUs must be able to carry one of these bags across a transaction boundary (mismatch M6).
 * Resolving that ordering belongs to src/adapters/mysql/UnitOfWork.ts; this container stays a plain
 * accumulator and encodes none of that reasoning.
 *
 * TRANSLATION DECISIONS MADE IN THIS FILE
 * ---------------------------------------
 *   (a) The framework's own `getError` is NOT carried. org/Hibachi/HibachiErrors.cfc:L45-L51 guards
 *       correctly at :L46 but then subscripts the struct at :L47 with an argument the function never
 *       declares, so the hit path could not have executed, and the miss path at :L50 raises instead
 *       of returning. That defect lives in framework code being retired for this slice rather than
 *       in the carried in-scope defect register, so it is not reproduced. The in-scope entities reach
 *       their errors through org/Hibachi/HibachiTransient.cfc, whose `getError` returns an empty
 *       array on a miss — that is the observable behaviour of the slice, and what `getError` below
 *       implements.
 *   (b) `getAllErrorsHTML` (org/Hibachi/HibachiErrors.cfc:L64-L74) is NOT ported: it wraps each
 *       message in a paragraph tag, and this is a headless service whose compiler configuration
 *       carries no DOM typings. Presentation belongs above this layer.
 *   (c) The array and struct forms of `addError` are NOT reproduced. No in-scope call site uses
 *       either form — all four legacy sites in the slice pass a simple string, as do the three
 *       framework sites — so building them would be capability beyond what the migration requires.
 *       Merging a whole bag remains available through `addErrors`.
 *   (d) The aggregate error message is NOT legacy-derived and carries NO parity obligation, because
 *       the legacy system has no single "validation failed" text. It is deliberately neutral and NOT
 *       exported, so no consumer or test can mistake it for legacy behaviour. Assert on `getErrors()`
 *       and `getError()` instead.
 *   (e) Resource-bundle keys are opaque and never translated: a key is stored, read and compared
 *       exactly as declared, never sentence-cased, normalised, trimmed, re-cased or resolved against
 *       a bundle here. Resolution was a facility of the retired framework's request scope, and
 *       carrying it would defeat the comparability the key structure exists to provide.
 *   (f) `getErrors()` returns a type-level readonly VIEW of the live bag. The readonly is a
 *       compile-time tightening only — no runtime copy, no freeze, no behaviour change — because the
 *       legacy accessor also returned the live struct by reference
 *       (org/Hibachi/HibachiTransient.cfc:L30-L32). `getError()` is readonly for the same reason.
 *   (g) The bag is stored in a prototype-less record. A CFML struct has no prototype chain, so its
 *       key-existence test is an exact own-key test. A plain object literal would inherit from the
 *       base object prototype, making `hasError('toString')` answer true, making `getError('toString')`
 *       return a function where an array is declared, and turning a write to the '__proto__' key into
 *       a silent prototype mutation. A null prototype restores exact struct semantics. When writing
 *       tests, compare a returned bag with a value-equality matcher or read it through `getError()`,
 *       rather than with a matcher that also compares prototypes.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - Constants for the error KEYS themselves. Each key is documented beside the resource-bundle key
 *     it pairs with, and the inventory this file owns is exactly the four keys below.
 *   - The two `hb_rbKey` annotations at model/process/Product_UpdateSkus.cfc:L56 and :L58. They
 *     follow the same pass-through-unmodified rule as decision (e), but they belong to
 *     src/validation/rules/productUpdateSkus.rules.ts.
 *   - The legacy `throw()` message strings of the slice, which live once in ./DomainError. Restating
 *     any of them here would duplicate a verbatim literal and make fidelity harder to verify.
 *   - The framework messages for an unknown constraint type
 *     (org/Hibachi/HibachiValidationService.cfc:L202) and for the broken accessor's miss path
 *     (org/Hibachi/HibachiErrors.cfc:L50). Both are outside the inventory this file owns.
 *   - HTTP status codes and response shaping, which belong to src/handlers/httpResponse.ts.
 *   - Any retry, timeout, severity, latency, throughput or capacity semantics; the legacy source
 *     states none for this slice.
 */

import {
  DomainError,
  PUBLIC_ERROR_CODE,
  type DomainErrorOptions,
  type PublicErrorPresentation,
} from './DomainError';

/* ==========================================================================================
 * THE FOUR VERBATIM RESOURCE-BUNDLE KEYS
 * ==========================================================================================
 *
 * These four strings are the messages the Catalog slice reports for its four non-declarative
 * validation failures, and they are observable behavior: a consumer comparing this service's
 * output against the legacy system compares these exact keys. Each is reproduced character for
 * character from its legacy call site, each carries that locator and the error key it is paired
 * with, and each literal is written exactly once in this directory so that verbatim fidelity
 * stays checkable with a single search per key.
 *
 * Three asymmetries run through the set. Every one of them is legacy behavior, every one looks
 * like an oversight, and normalising any of them would be a behavior change forbidden by AAP
 * 0.8.2 Guidelines 2 and 4:
 *   - one key misspells a word that its own paired error key spells correctly,
 *   - one key uses a different leading segment from the two keys raised beside it, and
 *   - one key camel-cases its final segment where the other three are entirely lowercase.
 * ========================================================================================== */

/**
 * Reported when a subscription product is created without at least one subscription benefit.
 *
 * Legacy locator: model/service/SkuService.cfc:L143, the subscription branch of createSkus.
 * Paired error key: `subscriptionBenefits`.
 *
 * PARITY WARNING — two spellings of one word sit on that single legacy line and they do NOT
 * agree, so this is the single most likely place in the file for an accidental repair. The
 * error key spells the word Benefits correctly. The key literal below does not: its final
 * segment carries a legacy misspelling of that same word, with an i standing where the second e
 * belongs. Both strings are verbatim and must NOT be harmonised, in either direction. That the
 * misspelling is pervasive legacy spelling rather than a one-off slip is corroborated twice
 * over by the comments at model/service/SkuService.cfc:L138 and :141, which spell it the same
 * way. Repairing either string would change observable behavior, which AAP 0.8.2 Guidelines 2
 * and 4 forbid, and AAP 0.7.3 S7 requires it be annotated rather than repaired.
 *
 * TODO(parity): the misspelling in this key is retained from the legacy source and is
 * intentionally NOT corrected.
 */
export const SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY = 'entity.product.subscriptionbenifitsrequired';

/**
 * Reported when a subscription product is created without at least one subscription term.
 *
 * Legacy locator: model/service/SkuService.cfc:L148, the subscription branch of createSkus,
 * evaluated immediately after the benefit check above so a single save can report both.
 * Paired error key: `subscriptionTerms`.
 *
 * Casing note: the key literal is entirely lowercase, exactly as the legacy source has it. Do
 * not camel-case its final segment to match the shape of the error key beside it.
 */
export const SUBSCRIPTION_TERMS_REQUIRED_RBKEY = 'entity.product.subscriptiontermsrequired';

/**
 * Reported when a content-access product is created without at least one access content.
 *
 * Legacy locator: model/service/SkuService.cfc:L176, the content-access branch of createSkus.
 * Paired error key: `accessContents`.
 *
 * PREFIX WARNING — this key's leading segment is the validate namespace, not the entity
 * namespace used by the two keys above it, even though all three are raised by the same method
 * for the same shape of reason. The asymmetry is legacy behavior. Do not normalise the prefixes
 * to match one another.
 */
export const ACCESS_CONTENTS_REQUIRED_RBKEY = 'validate.product.accesscontentsrequired';

/**
 * Reported when uploading a product's default image fails.
 *
 * Legacy locator: model/service/ProductService.cfc:L253. It is raised from the catch block of
 * the upload, so it reports against the process object rather than against the product, and it
 * is the only one of the four keys not raised by SKU creation.
 * Paired error key: `imageFile`.
 *
 * CASING WARNING — this is the only one of the four keys whose final segment is camel-cased;
 * the other three are entirely lowercase. Carry each key's casing exactly as declared.
 */
export const FILE_UPLOAD_RBKEY = 'validate.fileUpload';

/**
 * The error key an entity records against itself when one of ITS process objects carries findings.
 *
 * Legacy locator: `model/entity/HibachiEntity.cfc:L133-L147`, which OVERRIDES `getErrors()` to walk
 * `variables.processObjects` and, for each process object reporting `hasErrors()`, calls
 * `addError('processObjects', key, true)` — where `key` is the PROCESS CONTEXT name, not a
 * resource-bundle key. So this is the one error key in the inventory whose paired message is a context
 * identifier such as `updateSkus`, and that asymmetry is legacy behaviour rather than an inconsistency
 * to tidy away.
 *
 * ⚠️ WHY IT MATTERS RATHER THAN BEING DECORATIVE, because a reader of `HibachiTransient.cfc` alone will
 * conclude the opposite. `org/Hibachi/HibachiTransient.cfc:L76-L77` and `:L93-L94` FILTER this key out
 * when composing the human-readable error message and the HTML error list, which makes it look like a
 * presentation artefact. It is not: the filtering is display-only, and its very existence proves the key
 * is in the bag. Because the key is in the bag, `hasErrors()` answers true, and
 * `org/Hibachi/HibachiService.cfc:L112` gates the whole process invocation on exactly that answer. An
 * entity whose process object failed validation therefore never reaches its process body in the legacy.
 *
 * ⚠️ THE DUPLICATE GUARD IS PART OF THE BEHAVIOUR. `:L135` tests
 * `!arrayFindNoCase(originalErrors.processObjects, key)` before recording, so the key is recorded AT
 * MOST ONCE PER CONTEXT and the comparison is CASE-INSENSITIVE. A case-sensitive test, or no test at
 * all, would let one context accumulate duplicate entries across repeated reads.
 */
export const PROCESS_OBJECTS_ERROR_KEY = 'processObjects';

/**
 * The error bag: a map from property identifier to the ordered list of resource-bundle keys
 * reported against it.
 *
 * This is the ported shape of the legacy `errors` struct declared at
 * org/Hibachi/HibachiErrors.cfc:L4. Three properties of it are behavior rather than convenience:
 *
 *   - The KEY is a property identifier, never a rule or method name. For a nested identifier
 *     the whole dotted path is the key, because the framework reports against the full
 *     identifier (org/Hibachi/HibachiValidationService.cfc:L224, :228, :232).
 *   - The VALUE is an ordered ARRAY, never a single string, because two rules can report
 *     against one property in one context — as the two method-based rules on `options` do at
 *     model/validation/Sku.json:L5-L8.
 *   - Each element is an opaque resource-bundle KEY, not display text. Nothing in this module
 *     inspects, rewrites or resolves it (decision (f) in the module header).
 *
 * The readonly modifiers are a compile-time tightening with no runtime counterpart, which is
 * what lets {@link ValidationError.getErrors} hand out the live bag without copying it
 * (decision (g)). The same type serves as the parameter of {@link ValidationError.addErrors},
 * so a bag read from one instance can be merged straight into another.
 */
export type ValidationErrors = Readonly<Record<string, readonly string[]>>;

/*
 * Neutral aggregate text for the inherited message property.
 *
 * Deliberately NOT exported — see decision (d) in the module header. The legacy system has no
 * single "validation failed" string, so this text is an invention of the port with no parity
 * obligation whatsoever, and keeping it module-private means no consumer or test can assert
 * equality against it and mistake it for legacy behavior. The parity obligation lives entirely
 * in the error keys and in the four resource-bundle keys above.
 */
const VALIDATION_FAILED_MESSAGE = 'Validation failed';

/*
 * The public-safe presentation every validation failure reports.
 *
 * Built once and frozen, for the same reason the sibling module freezes its own presentations: the
 * value is immutable and identical for every occurrence, so a consumer cannot mutate the
 * presentation another consumer will read.
 *
 * It reuses the neutral aggregate text above rather than introducing a second string, which keeps
 * the module's "one invented text, no parity obligation" position intact — see decision (d) in the
 * module header. The CODE is the stable, exported, assertable half; the text is not.
 */
const VALIDATION_FAILED_PRESENTATION: PublicErrorPresentation = Object.freeze({
  code: PUBLIC_ERROR_CODE.VALIDATION_FAILED,
  message: VALIDATION_FAILED_MESSAGE,
});

/**
 * Accumulates validation failures keyed by property identifier, and can be thrown once
 * accumulation is complete.
 *
 * It is the port of the legacy error bean (org/Hibachi/HibachiErrors.cfc) as reached through the
 * accessors the in-scope entities expose (org/Hibachi/HibachiTransient.cfc:L29-L68). The member
 * names, their argument order and their return shapes are preserved so a converted rule set or
 * service reads the same way it did in CFML; the container underneath them is idiomatic
 * TypeScript (AAP 0.8.1).
 *
 * It extends {@link DomainError} so that a failure raised from a service is catchable as one
 * error family, and so that catching code can distinguish a deliberate validation failure from
 * a programming fault such as a type error — a distinction the legacy idiom of throwing a bare
 * string made impossible.
 *
 * USAGE — accumulate, then gate, exactly as the legacy flow does
 * -------------------------------------------------------------
 * model/service/SkuService.cfc adds every failure it finds and only then checks, at :152 and
 * again at :180, with `if(!arguments.product.hasErrors())`. {@link hasErrors} serves precisely
 * that gate, so a converted service keeps the same accumulate-then-check control flow rather
 * than failing fast on the first problem and changing which messages a caller sees.
 *
 * @example
 * ```ts
 * const errors = new ValidationError();
 *
 * // The subscription branch of createSkus reports both missing collections before gating,
 * // mirroring model/service/SkuService.cfc:L143 and :148.
 * errors.addError('subscriptionBenefits', SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY);
 * errors.addError('subscriptionTerms', SUBSCRIPTION_TERMS_REQUIRED_RBKEY);
 *
 * if (errors.hasErrors()) {
 *   throw errors;
 * }
 * ```
 *
 * @example
 * ```ts
 * // Merging a bag produced elsewhere, the equivalent of the legacy addErrors(struct) form.
 * const errors = new ValidationError({ cause: rejection });
 * errors.addErrors(collected.getErrors());
 * ```
 */
export class ValidationError extends DomainError {
  /**
   * The live bag. Created with a null prototype so that key lookup is an exact own-key test,
   * matching CFML struct semantics — see decision (h) in the module header.
   *
   * `readonly` protects the reference, not the contents: the bag is mutated in place by
   * {@link addError} and {@link addErrors}, which is what makes this object usable as an
   * accumulator that a batch can carry across several validation passes.
   */
  private readonly errors: Record<string, string[]>;

  /**
   * Creates an empty bag, mirroring org/Hibachi/HibachiErrors.cfc:L7-L11, where init() always
   * starts from a new, empty struct. There is deliberately no seeded form: the legacy
   * constructor took no arguments, and a bag produced elsewhere is merged in with
   * {@link addErrors}, which is the member the legacy code used for that purpose.
   *
   * @param options optional `cause` and `context` forwarded to {@link DomainError}. Use
   *   `context` to attach diagnostic facts — the identifier being saved, for instance — without
   *   altering any observable key or message.
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
    // and telemetry. AAP 0.4.1.11 closes this folder at two files and three error classes, so no
    // subclass of ValidationError exists whose own name this literal could mask.
    this.name = 'ValidationError';
  }

  /**
   * Records one failure against a property identifier.
   *
   * Ported from org/Hibachi/HibachiErrors.cfc:L14-L31 as reached through
   * org/Hibachi/HibachiTransient.cfc:L61-L63. Repeated calls with the same identifier append in
   * call order; nothing is de-duplicated, because the legacy bean did not de-duplicate either
   * and two distinct rules reporting against one property is normal (see THE REPORTING KEY in
   * the module header).
   *
   * Only the simple-string form is provided — decision (c) in the module header explains why the
   * legacy array and struct forms are not reproduced.
   *
   * @param propertyName the property identifier to report against; for a nested identifier pass
   *   the whole dotted path, never the trailing segment and never the rule's method name
   * @param message the resource-bundle key to store, passed through unmodified
   */
  public addError(propertyName: string, message: string): void {
    this.bucketFor(propertyName).push(message);
  }

  /**
   * Merges a whole bag in, key by key, appending to any key that is already present.
   *
   * Ported from org/Hibachi/HibachiErrors.cfc:L33-L42 as reached through
   * org/Hibachi/HibachiTransient.cfc:L66-L68. Two details of the legacy loop are reproduced
   * exactly rather than tidied:
   *
   *   - It APPENDS; it never replaces. Merging a key that already holds messages leaves the
   *     existing messages in place and adds the incoming ones after them.
   *   - The legacy guard at :35-37 runs BEFORE the message loop at :38-40, so merging a key
   *     whose incoming list is empty still creates that key — and therefore still makes
   *     {@link hasErrors} answer true. That is faithful legacy behavior, and it is the one way a
   *     key can end up holding an empty array, since {@link addError} always appends a message.
   *
   * @param errors the bag to merge; a bag read from another instance via {@link getErrors} is
   *   accepted directly
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
   * The base class denies disclosure by default, and inheriting that default would misreport this
   * failure twice over: a rejected save is entirely the caller's to correct, and reporting it as
   * an opaque service fault would tell a caller nothing it can act on. The override therefore
   * exists to CLASSIFY, not to disclose — and there is nothing here that needs withholding in the
   * first place, because {@link VALIDATION_FAILED_MESSAGE} is a fixed neutral text that names no
   * property, identifier, column or member.
   *
   * The parity-bearing detail does not travel through this presentation at all. AAP 0.4.1.11
   * requires the "error-key structure preserved so validation failures remain comparable to
   * legacy output", so the keyed structure {@link getErrors} exposes is carried as its own member
   * of the response body, unflattened and unmodified. That separation is deliberate: the code and
   * text here answer "what kind of failure", while the keys answer "what exactly was wrong", and
   * only the second half has a legacy counterpart.
   *
   * @returns the validation code together with the neutral aggregate text
   */
  public override getPublicError(): PublicErrorPresentation {
    return VALIDATION_FAILED_PRESENTATION;
  }

  /**
   * Returns the whole bag as a readonly view of the live object.
   *
   * Ported from org/Hibachi/HibachiTransient.cfc:L30-L32. There is no copy and no freeze: the
   * legacy accessor returned the live struct by reference and this one does the same, with the
   * readonly modifiers acting only at compile time (decision (g)). A caller that needs an
   * independent snapshot must clone the result itself.
   *
   * @returns every reported property identifier mapped to its ordered messages
   */
  public getErrors(): ValidationErrors {
    return this.errors;
  }

  /**
   * Returns the messages reported against one property identifier.
   *
   * Ported from org/Hibachi/HibachiTransient.cfc:L35-L44, including the behavior that matters
   * most: a miss returns an EMPTY ARRAY rather than raising, exactly as :43 does. The broken
   * framework accessor at org/Hibachi/HibachiErrors.cfc:L45-L51, which raises on a miss, is
   * deliberately not carried — decision (a) in the module header records why.
   *
   * @param propertyName the property identifier to read
   * @returns the messages in the order they were reported, or an empty array when nothing was
   *   reported against that identifier
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
   * Ported from org/Hibachi/HibachiTransient.cfc:L56-L58 and
   * org/Hibachi/HibachiErrors.cfc:L54-L56, both of which test only for the key's presence. Because
   * the bag has a null prototype (decision (h)) this is an exact own-key test, so an inherited
   * member name such as `toString` correctly answers false.
   *
   * @param propertyName the property identifier to test
   */
  public hasError(propertyName: string): boolean {
    return this.errors[propertyName] !== undefined;
  }

  /**
   * Returns true when at least one property identifier has been reported against.
   *
   * Ported from org/Hibachi/HibachiTransient.cfc:L47-L53 and
   * org/Hibachi/HibachiErrors.cfc:L59-L61: the test is key PRESENCE, not total message count.
   * The distinction is only observable through {@link addErrors} with an empty incoming list,
   * which creates the key and therefore makes this answer true — see that member. Every
   * {@link addError} call appends a message, so a key it creates is never empty.
   *
   * This is the member that serves the legacy gate `if(!product.hasErrors())` at
   * model/service/SkuService.cfc:L152 and :180.
   */
  public hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /**
   * Returns the live message array for a property identifier, creating it when absent.
   *
   * This is the explicit rendering of the legacy lazy-create guard, which appears twice in the
   * legacy bean — at org/Hibachi/HibachiErrors.cfc:L15-L17 for a single message and again at
   * :35-37 for a merge — and is written once here and shared by both public mutators.
   *
   * The guard is deliberately spelled out rather than assumed. Under `noUncheckedIndexedAccess`
   * an indexed read is typed as possibly absent, which is exactly the question the legacy
   * structKeyExists asked, so the read is narrowed with an explicit comparison; no non-null
   * assertion is used anywhere in this module. It stays private so nothing outside this class can
   * substitute how a bucket is created beneath the two public mutators.
   */
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
