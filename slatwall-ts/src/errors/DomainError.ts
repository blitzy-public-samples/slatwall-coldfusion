/**
 * DomainError — the root of the slatwall-ts error hierarchy, and the single source of truth
 * for the legacy CFML `throw()` message strings that are observable behavior of the Catalog
 * slice.
 *
 * Authority: AAP 0.4.1.11 "Errors and Utilities" — "Base error type; carries the legacy
 * `throw()` message strings verbatim where they are observable behavior."
 *
 * WHY THE MESSAGE STRINGS LIVE HERE
 * ---------------------------------
 * Four legacy `throw()` messages are behavior, not cosmetics. AAP 0.6.1.4 requires that all
 * three messages raised by `Product.getSkuBySelectedOptions` be "reproduced verbatim because
 * they are observable behavior", and AAP 0.4.1.8 requires the `SkuService.createSkus`
 * discriminator fallthrough be "preserved verbatim". Centralising them here means
 * `src/domain/product/Product.ts` and `src/services/SkuService.ts` consume the identical
 * literal, the `test/` suite asserts message equality against one place instead of re-typing
 * the text, and a reviewer can verify verbatim fidelity by reading a single file. See the
 * VERBATIM LEGACY MESSAGE INVENTORY section at the bottom of this module.
 *
 * ARCHITECTURAL POSITION (AAP 0.7.3 S4 — hexagonal separation)
 * -----------------------------------------------------------
 * `src/errors/` is a foundational, dependency-free leaf that sits below every other layer.
 * This module therefore declares ZERO imports — no sibling module, no Node builtin, no
 * package, and no barrel re-export. An error type that imported a domain entity, a port, an
 * adapter, a validation rule set, a service or a handler would invert the dependency
 * direction and destroy that leaf position. Consequences that follow, all deliberate:
 *   - No AWS event, result, handler or invocation-context type is named here. All AWS coupling
 *     is confined to `src/handlers/` (AAP 0.7.3 S4).
 *   - `process.env` is never read here. Configuration flows one way through `src/config/`
 *     (AAP 0.4.3.5), and nothing below the config layer reads the environment.
 *   - No database driver, no query text, no table or column identifier appears in any message
 *     or constant (AAP 0.7.3 S2).
 *   - No dependency of any kind is introduced. Only the built-in `Error` and the language are
 *     used (AAP 0.7.3 S5 — the deliverable's dependency set is frozen).
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
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - The `getQuantity` guard throw at model/entity/Product.cfc:445 and
 *     model/entity/Sku.cfc:312. `getQuantity` reaches exclusively into the inventory, stock
 *     and location services, every one of which is explicitly out of scope (AAP 0.2.2.6), so
 *     the method is not ported and its message is not observable behavior of the target. The
 *     mandated inventory is exactly four strings — not three, not five.
 *   - The validation resource-bundle keys. Those are declared once, in `ValidationError.ts`,
 *     which owns the error-key structure that keeps validation failures comparable to legacy
 *     output (AAP 0.4.1.11).
 *   - HTTP status codes and response shaping, which belong to `src/handlers/httpResponse.ts`.
 *   - Any retry, timeout, latency, throughput or capacity semantics. The legacy source states
 *     none for this slice, and AAP IR-12 forbids inventing them.
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
 * Both members are declared optional, and `exactOptionalPropertyTypes` is enabled, so a caller
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
}

/**
 * Raised by a boundary stub for an in-scope member that this port cannot implement.
 *
 * Two distinct categories of member need this signal. Both are recorded here because *why the
 * class exists* is a file-level judgment (AAP 0.8.2 Guideline 6); the per-site defect IDs and
 * the reason a particular member is stubbed belong in the doc comment of the throwing member,
 * not in this file, so this list is intentionally not an inventory of every stub.
 *
 * 1. Members whose legacy implementation is provably unresolvable in the source repository.
 *    Two were confirmed by repository-wide search, and both are carried across as this error
 *    rather than repaired, because inventing an implementation would add behavior the legacy
 *    system does not have (AAP 0.7.3 S7 — preserve and annotate, do not repair):
 *      - model/service/SkuService.cfc:281-282 declares `getSkuStocksDeletableFlag()` and
 *        delegates it to a `SkuDAO` member of the same name. The only three occurrences of
 *        that name anywhere in the repository are the declaration, the delegation and the
 *        caller at model/entity/Sku.cfc:569. The data-access member itself does not exist, so
 *        the legacy call can never have resolved. TODO(parity): carried, not repaired (D4).
 *      - model/entity/Product.cfc:631-632 declares `getProductOptionsByGroup()` and calls a
 *        product-service member of the same name. The only two occurrences anywhere are those
 *        two lines; the service never defines it. TODO(parity): carried, not repaired (D5).
 *
 * 2. Members whose behavior terminates at an explicitly out-of-scope collaborator, reached
 *    through a declared port rather than through converted code (AAP 0.2.2.6 and TR-5) — the
 *    image-handling members, and the subscription and content-access branches of the
 *    SKU-creation discriminator. Those members stay on the public surface, because dropping
 *    them would break interface parity; they raise this error instead of silently returning a
 *    fabricated value.
 *
 * Provenance note on the message shape, cited rather than reproduced. The retired Hibachi
 * framework signalled an unresolvable call from `onMissingMethod`
 * (org/Hibachi/HibachiService.cfc:255-281, throwing at :280, with the legacy grammar "does not
 * exists"). That string is deliberately not exported as a constant here: it lies outside the
 * mandated four-string inventory, and this port does not reproduce `onMissingMethod` at all —
 * AAP IR-1 and TR-3 replace runtime method synthesis with explicitly declared, typed methods.
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
   * The un-portable member, named as `Class.method`, exposed as a field so callers and tests
   * can identify it programmatically instead of parsing {@link Error.message}.
   */
  public readonly member: string;

  /**
   * @param member the un-portable member, named as `Class.method`
   * @param reason why it cannot be implemented; omit it when the throwing member's own doc
   *   comment already records the reason
   * @param options optional `cause` and `context` forwarded to {@link DomainError}
   */
  public constructor(member: string, reason?: string, options?: DomainErrorOptions) {
    super(
      reason === undefined
        ? `${member} is not implemented`
        : `${member} is not implemented: ${reason}`,
      options,
    );
    this.member = member;
  }
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
 * THE CONTROL STRUCTURE THAT SELECTS BETWEEN THE FIRST THREE
 * ---------------------------------------------------------
 * Read from model/entity/Product.cfc:349-364. A consumer porting
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
 * Verbatim from model/entity/Product.cfc:355, the branch taken when the resolved SKU array
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
export function moreThanOneSkuReturnedMessage(selectedOptions: string): string {
  return `More than one sku is returned when the selected options are: ${selectedOptions}`;
}

/**
 * MESSAGE 2 — raised when a non-empty option selection resolves to no SKU at all.
 *
 * Verbatim from model/entity/Product.cfc:357, the branch taken when the resolved SKU array is
 * empty.
 *
 * Interpolation rules are identical to {@link moreThanOneSkuReturnedMessage}: exactly one
 * parameter, appended unchanged. Two details of the legacy text are easy to lose and both are
 * preserved — the single space after the colon, and the capitalised plural in the second word.
 *
 * @param selectedOptions the raw comma-delimited option-ID list exactly as passed in
 * @returns the legacy message text, byte-identical to the CFML original
 */
export function noSkusFoundForSelectedOptionsMessage(selectedOptions: string): string {
  return `No Skus are found for these selected options: ${selectedOptions}`;
}

/**
 * MESSAGE 3 — raised on the EMPTY-selection branch when the product does not have exactly one
 * SKU. Verbatim from model/entity/Product.cfc:362.
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
export const NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE =
  'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product';

/**
 * MESSAGE 4 — the fallthrough of the three-way base-product-type discriminator in
 * `SkuService.createSkus`. Verbatim from model/service/SkuService.cfc:204.
 *
 * The legacy method branches on the product's base product type over the merchandise,
 * subscription and content-access discriminators seeded at
 * config/dbdata/SlatwallProductType.xml.cfm:13-15, and raises this message when the value
 * matches none of them. AAP 0.4.1.8 requires the fallthrough be "preserved verbatim", so the
 * text is reproduced exactly, including the absence of a trailing period.
 *
 * Note that the legacy string says nothing about which discriminator was seen. Enriching it
 * with the offending value would be an enhancement AAP 0.8.2 Guideline 4 forbids; attach the
 * value through the `context` payload of {@link DomainError} instead, which adds diagnostic
 * detail without altering the observable message.
 */
export const UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE =
  'There was an unexpected error when creating this product';
