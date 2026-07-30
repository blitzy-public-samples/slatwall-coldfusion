/**
 * ValidationError — the ported error-key structure of the Catalog slice, and the single
 * declaration site for the four legacy resource-bundle keys the slice reports failures with.
 *
 * Authority: AAP 0.4.1.11 "Errors and Utilities" — "REFERENCE org/Hibachi/HibachiErrors.cfc |
 * Error-key structure preserved so validation failures remain comparable to legacy output."
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A legacy validation failure is not a sentence. It is a struct keyed by property name, each
 * key holding an ordered array of resource-bundle KEYS. Two properties of that structure are
 * observable behavior and are therefore preserved here character for character:
 *
 *   1. which KEY a failure is reported under, and
 *   2. the exact resource-bundle key strings stored as its messages.
 *
 * Everything else about the container — that it is a class rather than a CFML component, that
 * it extends an error type, that its read accessors are typed readonly — is idiom, and idiom
 * may change freely under the Minimal Change Clause (AAP 0.8.1): "It does not mean preserving
 * CFML idioms in TypeScript; idiomatic, conventional TypeScript is expected." The line between
 * the two halves of that clause is behavior. Report a failure under the wrong key, or repair a
 * key's spelling, and validation output silently stops being comparable to the legacy system —
 * with no compile error and no failing test anywhere else in the port.
 *
 * LEGACY ORIGINS (reference only, never modified — AAP 0.4.1.1 / TR-6)
 * -------------------------------------------------------------------
 *   org/Hibachi/HibachiErrors.cfc:1-75 — the error bean; a struct of arrays, lazily keyed:
 *     :7-11   init() sets the struct to a new, EMPTY struct. There is no seeded form.
 *     :14-31  addError(errorName, errorMessage) — creates errorName as an empty array when it
 *             is absent (:15-17), then appends.
 *     :33-42  addErrors(errors) — merges key by key: creates each absent key (:35-37) and then
 *             appends every message under it (:38-40). It never replaces an existing array.
 *     :45-51  getError(errorName) — see decision (a); deliberately not carried in this form.
 *     :54-56  hasError(errorName) — a plain key-existence test.
 *     :59-61  hasErrors() — true when the struct is not empty.
 *     :64-74  getAllErrorsHTML() — see decision (b); deliberately not ported.
 *   org/Hibachi/HibachiTransient.cfc:29-68 — the surface the in-scope entities actually expose,
 *     and therefore the shape this class mirrors: getErrors() :30-32, getError() :35-44 with an
 *     empty array as the miss default at :43, hasErrors() :47-53, hasError() :56-58,
 *     addError() :61-63, addErrors() :66-68.
 *   org/Hibachi/HibachiValidationService.cfc:200-235 — how a failed constraint becomes a key
 *     plus a message. See THE REPORTING KEY below.
 *   model/validation/Sku.json:5-8 — the two method-based rules that share one reporting key.
 *   model/service/SkuService.cfc:143, :148, :176 and model/service/ProductService.cfc:253 —
 *     the four resource-bundle keys declared below, and the only four addError call sites in
 *     the slice. An exhaustive scan of the four in-scope services, the six in-scope entities
 *     and the three in-scope process objects returns exactly those four: the inventory is
 *     complete and closed at four, not three and not five.
 *
 * THE REPORTING KEY IS THE PROPERTY IDENTIFIER, NEVER THE RULE NAME
 * ----------------------------------------------------------------
 * model/validation/Sku.json:5-8 attaches TWO method-based rules to the single property
 * `options` on the `save` context — one named `hasUniqueOptions`, one named
 * `hasOneOptionPerOptionGroup`. Both failures are reported under the key `options`. Neither
 * method name is ever used as an error key, here or anywhere else in the port.
 *
 * org/Hibachi/HibachiValidationService.cfc corroborates that in every branch: :224 (a method
 * constraint), :228 (a dataType constraint) and :232 (every other constraint type) all call
 * addError(propertyIdentifier, errorMessage), so the outer key is the FULL property identifier.
 * The shortened name derived at :208 by listLast(propertyIdentifier, '._') is used only to
 * build the message, never as the key.
 *
 * This is also precisely why a key holds an ARRAY rather than a single string: two independent
 * rules target `options` in the same context, so one save can legitimately land two messages
 * under one key. Collapsing the value to a string would silently discard one of them.
 *
 * WHAT THE STORED MESSAGES LOOK LIKE — they are KEYS, not display text
 * -------------------------------------------------------------------
 * org/Hibachi/HibachiValidationService.cfc composes a failed constraint's message in one of
 * three shapes and then substitutes a small template struct into it. The substitution is
 * performed by org/Hibachi/HibachiUtilityService.cfc:70-95, which replaces occurrences of the
 * placeholder pattern ${...} with propertyName, className and constraintValue:
 *
 *   :222  method constraint   validate.<context>.<className>.<propertyName>.<constraintValue>
 *                             for example validate.save.Sku.options.hasUniqueOptions
 *   :226  dataType constraint validate.<context>.<className>.<propertyName>
 *                               .<constraintType>.<constraintValue>
 *   :230  any other type      validate.<context>.<className>.<propertyName>.<constraintType>
 *                             for example validate.save.Sku.price.required
 *
 * Composing those strings is the job of src/validation/Validator.ts, not of this file. They are
 * recorded here so a reader can see what kind of opaque value flows through the bag, and so it
 * is unambiguous that a stored message is a resource-bundle KEY rather than a sentence.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4 — hexagonal separation)
 * -----------------------------------------------------------
 * src/errors/ is a foundational leaf that sits below every other layer, so ./DomainError is the
 * ONLY import in this module: no domain entity, no port, no adapter, no rule set, no service,
 * no handler, no integration, no configuration module, no sibling utility, no Node builtin, no
 * package and no barrel re-export. An error type that imported a domain entity would invert the
 * dependency direction and destroy that leaf position — which is why the `options` key and the
 * two rule names above are documented in prose rather than imported from the Sku rule set.
 * Consequences that follow, all deliberate:
 *   - No cloud event, result, handler or invocation-context type is named here. That coupling
 *     is confined to src/handlers/ (AAP 0.7.3 S4).
 *   - The process environment is never read here. Configuration flows one way through
 *     src/config/ (AAP 0.4.3.5), and nothing below the config layer reads it.
 *   - No database driver, no query text and no table or column identifier appears in any key,
 *     message or comment (AAP 0.7.3 S2).
 *   - No dependency of any kind is introduced. Only the built-in error type and the language
 *     are used, and the deliverable's dependency set stays frozen (AAP 0.7.3 S5).
 *   - Every member is synchronous and allocation-cheap. There is no I/O, no promise, no cache,
 *     no memoisation and no awareness of a transaction or a flush. That last point is load
 *     bearing rather than incidental: AAP 0.6.2 / M6 records that Sku.hasUniqueOptions
 *     (model/entity/Sku.cfc:756-769) is a declarative validation rule which performs a database
 *     read, so a batch of SKUs must be able to carry one of these bags across a transaction
 *     boundary. Resolving that ordering is the job of src/adapters/mysql/UnitOfWork.ts; this
 *     container stays a plain accumulator and encodes none of that reasoning (AAP 0.7.3 S8).
 *
 * TECHNOLOGY-SPECIFIC TRANSLATION DECISIONS
 * -----------------------------------------
 * AAP 0.8.2 Guideline 6 requires that every technology-specific translation decision be
 * documented at the file where the judgment is made. The judgments made here are:
 *
 *   (a) The framework's own getError is NOT carried. org/Hibachi/HibachiErrors.cfc:45-51 guards
 *       correctly at :46 but then subscripts the struct at :47 with an argument the function
 *       never declares — the declared parameter is errorName, the subscript names something
 *       else — so the hit path could not have executed, and the miss path at :50 raises instead
 *       of returning. That defect is not reproduced, and neither is the string it raises. The
 *       reason is structural rather than a matter of taste: the defect lives in org/Hibachi/**,
 *       framework code that AAP 0.8.3.2 describes as "being retired for this slice, not carried
 *       forward", and it is not one of the twenty-one catalogued in-scope defects D1-D21 that
 *       the preserve-and-annotate standard (AAP 0.7.3 S7) governs. The in-scope entities reach
 *       their errors through org/Hibachi/HibachiTransient.cfc, whose getError returns an empty
 *       array on a miss (:43). That is the observable behavior of the slice, and that is what
 *       getError below implements.
 *   (b) getAllErrorsHTML (org/Hibachi/HibachiErrors.cfc:64-74) is NOT ported. It is a view
 *       concern: it wraps each message in a paragraph tag. The target is a headless service
 *       with no rendering layer (AAP 0.3.4), the repository's only view layers are out of scope,
 *       and the compiler configuration pins lib to ES2022 with no DOM typings, so markup
 *       assembly has no home here. Presentation belongs above this layer.
 *   (c) The array and struct forms of addError are NOT reproduced.
 *       org/Hibachi/HibachiErrors.cfc:20-23 also accepted an array of messages and :24-30 a
 *       struct, which it flattened by appending every nested message under the OUTER key. No
 *       in-scope call site uses either form: all four legacy call sites in the slice pass a
 *       simple string, and so do all three framework call sites at
 *       org/Hibachi/HibachiValidationService.cfc:224, :228 and :232. Building the unused forms
 *       would be capability beyond what the migration requires, which AAP 0.8.2 Guideline 4
 *       forbids. Merging a whole bag remains available through addErrors, which is the member
 *       the legacy code actually used for that purpose.
 *   (d) The aggregate error message is NOT legacy-derived and carries NO parity obligation. The
 *       legacy system has no single "validation failed" text — it has only the keyed struct.
 *       The parity obligation is on the error-key structure and on the four resource-bundle
 *       keys, never on a summary line. The aggregate text is therefore deliberately neutral,
 *       minimal and NOT exported, so that no consumer or test can mistake it for legacy
 *       behavior or assert equality against it. Assert on getErrors() and getError() instead.
 *   (e) The reporting key is the property identifier and not the rule name — see THE REPORTING
 *       KEY above, which is the highest-risk detail in this file.
 *   (f) Resource-bundle keys are opaque and are never translated. A key is stored, read and
 *       compared exactly as declared: never sentence-cased, normalised, trimmed, re-cased or
 *       resolved against a bundle by this module. Resolution was a facility of the retired
 *       framework's request scope; carrying it here would defeat the comparability the key
 *       structure exists to provide.
 *   (g) getErrors() returns a type-level readonly VIEW of the live bag. The readonly is a
 *       compile-time tightening only: there is no runtime copy, no freeze and no behavior
 *       change, because the legacy accessor also returned the live struct by reference
 *       (org/Hibachi/HibachiTransient.cfc:30-32). getError() is readonly for the same reason.
 *   (h) The bag is stored in a prototype-less record. A CFML struct has no prototype chain, so
 *       structKeyExists is an exact own-key test. A plain object literal would inherit from the
 *       base object prototype, which would make hasError('toString') answer true, make
 *       getError('toString') return a function where an array is declared, and turn a write to
 *       the '__proto__' key into a silent prototype mutation instead of an entry. Creating the
 *       store with a null prototype restores exact struct semantics. One consequence worth
 *       knowing when writing tests: compare a returned bag with a value-equality matcher, or
 *       read it through getError(), rather than with a matcher that also compares prototypes.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - Constants for the error KEYS themselves. Each key is documented beside the resource-bundle
 *     key it pairs with, because the mandated inventory for this file is exactly the four keys
 *     below; exporting more would add surface the AAP does not call for.
 *   - The two hb_rbKey property annotations declared at model/process/Product_UpdateSkus.cfc:56
 *     and :58, entity.sku.price and entity.sku.listPrice. They illustrate the same
 *     pass-through-unmodified rule as decision (f), so they are named here for the reader, but
 *     they belong to src/validation/rules/productUpdateSkus.rules.ts and are deliberately not
 *     declared as constants in this folder.
 *   - The legacy throw() message strings of the slice. Those live once, in ./DomainError, which
 *     owns them; restating any of them here would duplicate a verbatim literal and make
 *     fidelity harder to verify by search.
 *   - The message the retired framework raises for an unknown constraint type
 *     (org/Hibachi/HibachiValidationService.cfc:202) and the message its broken accessor raises
 *     on a miss (org/Hibachi/HibachiErrors.cfc:50). Both are framework strings outside the
 *     mandated inventory, and decision (a) explains why the second is not carried at all.
 *   - HTTP status codes and response shaping, which belong to src/handlers/httpResponse.ts.
 *   - Any retry, timeout, severity, latency, throughput or capacity semantics. The legacy source
 *     states none for this slice and AAP IR-12 forbids inventing them.
 */

import { DomainError, type DomainErrorOptions } from './DomainError';

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
 * Legacy locator: model/service/SkuService.cfc:143, the subscription branch of createSkus.
 * Paired error key: `subscriptionBenefits`.
 *
 * PARITY WARNING — two spellings of one word sit on that single legacy line and they do NOT
 * agree, so this is the single most likely place in the file for an accidental repair. The
 * error key spells the word Benefits correctly. The key literal below does not: its final
 * segment carries a legacy misspelling of that same word, with an i standing where the second e
 * belongs. Both strings are verbatim and must NOT be harmonised, in either direction. That the
 * misspelling is pervasive legacy spelling rather than a one-off slip is corroborated twice
 * over by the comments at model/service/SkuService.cfc:138 and :141, which spell it the same
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
 * Legacy locator: model/service/SkuService.cfc:148, the subscription branch of createSkus,
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
 * Legacy locator: model/service/SkuService.cfc:176, the content-access branch of createSkus.
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
 * Legacy locator: model/service/ProductService.cfc:253. It is raised from the catch block of
 * the upload, so it reports against the process object rather than against the product, and it
 * is the only one of the four keys not raised by SKU creation.
 * Paired error key: `imageFile`.
 *
 * CASING WARNING — this is the only one of the four keys whose final segment is camel-cased;
 * the other three are entirely lowercase. Carry each key's casing exactly as declared.
 */
export const FILE_UPLOAD_RBKEY = 'validate.fileUpload';

/**
 * The error bag: a map from property identifier to the ordered list of resource-bundle keys
 * reported against it.
 *
 * This is the ported shape of the legacy `errors` struct declared at
 * org/Hibachi/HibachiErrors.cfc:4. Three properties of it are behavior rather than convenience:
 *
 *   - The KEY is a property identifier, never a rule or method name. For a nested identifier
 *     the whole dotted path is the key, because the framework reports against the full
 *     identifier (org/Hibachi/HibachiValidationService.cfc:224, :228, :232).
 *   - The VALUE is an ordered ARRAY, never a single string, because two rules can report
 *     against one property in one context — as the two method-based rules on `options` do at
 *     model/validation/Sku.json:5-8.
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

/**
 * Accumulates validation failures keyed by property identifier, and can be thrown once
 * accumulation is complete.
 *
 * It is the port of the legacy error bean (org/Hibachi/HibachiErrors.cfc) as reached through the
 * accessors the in-scope entities expose (org/Hibachi/HibachiTransient.cfc:29-68). The member
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
 * // mirroring model/service/SkuService.cfc:143 and :148.
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
   * Creates an empty bag, mirroring org/Hibachi/HibachiErrors.cfc:7-11, where init() always
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
   * Ported from org/Hibachi/HibachiErrors.cfc:14-31 as reached through
   * org/Hibachi/HibachiTransient.cfc:61-63. Repeated calls with the same identifier append in
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
   * Ported from org/Hibachi/HibachiErrors.cfc:33-42 as reached through
   * org/Hibachi/HibachiTransient.cfc:66-68. Two details of the legacy loop are reproduced
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
   * Returns the whole bag as a readonly view of the live object.
   *
   * Ported from org/Hibachi/HibachiTransient.cfc:30-32. There is no copy and no freeze: the
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
   * Ported from org/Hibachi/HibachiTransient.cfc:35-44, including the behavior that matters
   * most: a miss returns an EMPTY ARRAY rather than raising, exactly as :43 does. The broken
   * framework accessor at org/Hibachi/HibachiErrors.cfc:45-51, which raises on a miss, is
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
   * Ported from org/Hibachi/HibachiTransient.cfc:56-58 and
   * org/Hibachi/HibachiErrors.cfc:54-56, both of which test only for the key's presence. Because
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
   * Ported from org/Hibachi/HibachiTransient.cfc:47-53 and
   * org/Hibachi/HibachiErrors.cfc:59-61: the test is key PRESENCE, not total message count.
   * The distinction is only observable through {@link addErrors} with an empty incoming list,
   * which creates the key and therefore makes this answer true — see that member. Every
   * {@link addError} call appends a message, so a key it creates is never empty.
   *
   * This is the member that serves the legacy gate `if(!product.hasErrors())` at
   * model/service/SkuService.cfc:152 and :180.
   */
  public hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /**
   * Returns the live message array for a property identifier, creating it when absent.
   *
   * This is the explicit rendering of the legacy lazy-create guard, which appears twice in the
   * legacy bean — at org/Hibachi/HibachiErrors.cfc:15-17 for a single message and again at
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
