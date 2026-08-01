/**
 * The three seeded base product types of Slatwall 3.1.39.
 *
 * Ported from `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` — the three `<Record>` elements of
 * the `SwProductType` seed-data document. They are the only product types that carry a `systemCode`,
 * and that `systemCode` is the value the Catalog branches on: `model/service/SkuService.cfc:L61`
 * (merchandise), `:L139` (subscription) and `:L173` (contentAccess); `model/entity/Sku.cfc:L574-L590`
 * (`getSkuDefinition`); and `model/entity/ProductType.cfc:L109-L115` (`getBaseProductType`), which
 * produces the value.
 *
 * FIXED SEED DATA, NOT TEST DATA AND NOT GENERATED IDENTIFIERS (IR-7). The three `productTypeID`
 * literals are transcribed from that document verbatim — never regenerated through
 * `createSlatwallUUID()` in `src/util/uuid.ts`, never dashed into RFC-4122 form and never re-cased.
 * Per IR-6 a legacy primary key is a 32-character lowercase-hex string with no dashes.
 *
 * A wrong character in an identifier produces no compile error: the compiler checks `systemCode`
 * against the union below, but the identifiers are opaque strings to it. The only defence is a diff
 * against the seed document, so EACH IDENTIFIER LITERAL APPEARS EXACTLY ONCE IN THIS FILE, declared on
 * the record that owns it and read from there by every consumer, with no convenience duplicate
 * exported. `model/validation/ProductType.json` refuses to delete a product type bearing a
 * `systemCode`, so these three rows are permanent platform data rather than a fragile assumption.
 *
 * The same document ends with an XML comment block at
 * `config/dbdata/SlatwallProductType.xml.cfm:L19-L31` holding seven further identifiers, none of them
 * a `<Record>` and none of them seeded; they are excluded from this module. The seeded rows also carry
 * `productTypeIDPath` (equal to the row's own `productTypeID`, so all three are hierarchy roots),
 * `parentProductTypeID` (the literal string `"NULL"` as this seed format renders it, not a null value)
 * and `activeFlag` `"1"`; no in-scope consumer reads those from the discriminator table, so none is
 * modelled here.
 *
 * MODULE SCOPE IS SAFE HERE SPECIFICALLY (M7). Per-request state held at module scope bleeds across
 * warm Lambda invocations, so `src/domain/**` avoids it. This module holds immutable frozen constants
 * only, with nothing per-request and nothing invocation-specific, so module scope is correct here; the
 * general rule points the other way, which is why the exception is stated.
 */

/**
 * The `systemCode` of a seeded product type — the discriminator the Catalog branches on.
 *
 * Declared explicitly as a union of the three literals rather than derived from the data below, so
 * that `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE` can be typed as a total mapping over it: a missing
 * member, an extra key or a mistyped `systemCode` on a record is then a compile error.
 *
 * TRANSLATION DECISION — A UNION, NOT AN ENUM. A TypeScript `enum` emits a runtime object and
 * introduces a nominal type that does not compare cleanly against the raw strings read out of
 * `SwProductType`. These values must be EQUAL to the database strings, so the representation is a
 * string-literal union over `as const` data.
 *
 * ⚠️ THE UNION IS THE CANONICAL SPELLING, NOT THE COMPARISON RULE — READ
 * {@link resolveBaseProductType} BEFORE COMPARING ANYTHING TO A MEMBER OF IT. Earlier prose here
 * asserted that the ported comparison "narrows to case-sensitive" and that this was correct because
 * only the seeded rows can legitimately be seen. Both halves were wrong, and the second was the
 * reason the first looked safe. `model/service/SkuService.cfc:L61`, `:L139` and `:L173` compare with
 * CFML `==`, which is CASE-INSENSITIVE for text operands, so a `SwProductType` row holding
 * `Merchandise` or `MERCHANDISE` entered the merchandise branch in the legacy system. Nothing
 * constrains the column to the seeded casing: `systemCode` is an ordinary `varchar` with no check
 * constraint, `model/validation/ProductType.json` declares no format rule for it, and
 * `model/entity/ProductType.cfc:L110` returns whatever text the row holds — including a value
 * inherited from a hierarchy root. A `===` comparison therefore turned a working legacy product into
 * a thrown `LegacyParityError` at `model/service/SkuService.cfc:L203-L205`, silently changed
 * `getSkuDefinition` from a merchandise definition to the empty string, and silently dropped the
 * fetch-options join in `SkuDAO.getProductSkus`. Branch selection goes through
 * {@link resolveBaseProductType}; `===` against a member of this union is only ever correct on a value
 * that recogniser has already returned.
 */
export type BaseProductType = 'merchandise' | 'subscription' | 'contentAccess';

/**
 * Shape of a seeded product-type record: exactly the four fields carried across from the legacy
 * `<Record>` elements, and no others.
 *
 * Typing `systemCode` as `BaseProductType` rather than `string` is what makes a mistyped code a
 * compile error instead of a silently non-matching branch.
 *
 * Used only in `satisfies` position — never as a variable annotation — because an annotation would
 * widen the literals to `string` and destroy the exhaustiveness checking that is the whole point.
 * Intentionally not exported: the public surface of this module is the union, the data and the
 * guard. Consumers that need to name a record type derive it structurally, for example
 * `(typeof SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE)[BaseProductType]`.
 */
interface SeededProductTypeRecord {
  readonly systemCode: BaseProductType;
  readonly productTypeID: string;
  readonly productTypeName: string;
  readonly urlTitle: string;
}

/**
 * Compile-time contract for the lookup below. A mapped type over `BaseProductType` makes the
 * lookup TOTAL — every discriminator must be present, so a missing entry fails the build — and
 * intersecting each value with `{ readonly systemCode: Code }` requires every key to equal the
 * `systemCode` of the record stored under it, so key and record can never disagree.
 *
 * Totality has a second, practical consequence: because the resulting object type has three
 * declared properties rather than an index signature, reading it with a `BaseProductType`-typed
 * key yields a record and NOT `Record | undefined` under `noUncheckedIndexedAccess`. Consumers
 * therefore never need a non-null assertion to resolve a discriminator they have already narrowed.
 *
 * Local and unexported, for the same reason as `SeededProductTypeRecord`.
 */
type SeededProductTypeRegistry = {
  readonly [Code in BaseProductType]: SeededProductTypeRecord & { readonly systemCode: Code };
};

/**
 * The three seeded product types, keyed by `systemCode`.
 *
 * This is the single source of truth for the seeded identifiers, and the supported way to resolve
 * one: `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.productTypeID` for a literal key, or
 * `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE[code].productTypeID` for any `code: BaseProductType` —
 * neither of which requires narrowing, per the totality note above. Consumers needing to iterate
 * the three take `Object.values(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE)`.
 *
 * `as const` pins the literal types and makes the records readonly to the type checker;
 * `Object.freeze` makes them immutable at run time as well. The records are flat, so freezing each
 * record and the container is a complete, deep freeze. Freezing this module's own freshly created
 * literals is self-contained initialisation — no I/O and no observable side effect at load time.
 *
 * Each `satisfies` clause is applied to a fresh object literal, which is what keeps excess-property
 * checking active: an invented field on a record, or an invented fourth key here, is a compile
 * error rather than a silently accepted addition.
 */
export const SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE = Object.freeze({
  /**
   * The `merchandise` product type — `config/dbdata/SlatwallProductType.xml.cfm:L13`.
   *
   * The first branch of the legacy SKU-combination logic, and the identifier already pinned by the
   * legacy fixtures at `meta/tests/unit/Helper.cfc:L58` and `meta/tests/unit/IssuesTest.cfc:L58`.
   */
  merchandise: Object.freeze({
    systemCode: 'merchandise',
    productTypeID: '444df2f7ea9c87e60051f3cd87b435a1',
    productTypeName: 'Merchandise',
    urlTitle: 'merchandise',
  } as const satisfies SeededProductTypeRecord),

  /**
   * The `subscription` product type — `config/dbdata/SlatwallProductType.xml.cfm:L14`.
   */
  subscription: Object.freeze({
    systemCode: 'subscription',
    productTypeID: '444df2f9c7deaa1582e021e894c0e299',
    productTypeName: 'Subscription',
    urlTitle: 'subscription',
  } as const satisfies SeededProductTypeRecord),

  /**
   * The `contentAccess` product type — `config/dbdata/SlatwallProductType.xml.cfm:L15`.
   *
   * PRESERVED ASYMMETRY — DO NOT "TIDY" THIS RECORD. That one legacy line spells the same concept
   * three different ways, and all three are carried across byte-exact and distinct:
   * `productTypeName` is `'Content Access'` (title case, with a space), `systemCode` is
   * `'contentAccess'` (camelCase — the value production code compares against), and `urlTitle` is
   * `'content-access'` (kebab-case). None is derived from another: there is no slug helper, no
   * `replace` and no case folding in the legacy row. Normalising any one of them to match another
   * would change data the legacy system treats as three independent columns.
   */
  contentAccess: Object.freeze({
    systemCode: 'contentAccess',
    productTypeID: '444df313ec53a08c32d8ae434af5819a',
    productTypeName: 'Content Access',
    urlTitle: 'content-access',
  } as const satisfies SeededProductTypeRecord),
} as const satisfies SeededProductTypeRegistry);

/**
 * Recognises an untrusted value as one of the three seeded discriminators, CFML-fashion, and answers
 * with the CANONICAL spelling — the single supported way to select a base-product-type branch.
 *
 * ⭐ CASE-INSENSITIVE RECOGNITION, CANONICAL ANSWER, ORIGINAL VALUE UNTOUCHED. That triple is the
 * whole contract, and each third of it matters:
 *
 *   - CASE-INSENSITIVE, because the three legacy comparisons are CFML `==` on text operands and CFML
 *     `==` folds case: `model/service/SkuService.cfc:L61`, `:L139` and `:L173`;
 *     `model/entity/Sku.cfc:L577`, `:L579` and `:L584`; and the fetch-options chain at
 *     `model/dao/SkuDAO.cfc:L154-L161`. A row holding `Merchandise` reached the merchandise arm of
 *     every one of them. Reproducing that is preservation (G2), not leniency.
 *   - CANONICAL, so that the value flowing INTO a narrowed branch is a real member of
 *     {@link BaseProductType} and the compiler can still check a `switch` over it exhaustively. This
 *     is what keeps the recognition fix from costing the exhaustiveness the migration buys.
 *   - ORIGINAL VALUE UNTOUCHED, because nothing here writes back, re-cases or normalises the stored
 *     text. Callers that carry the observed value onward — the diagnostic context of the fallthrough
 *     throw in `src/services/SkuService.ts`, for one — must keep carrying the value they read, not the
 *     canonical one, or the diagnostic would misreport what is actually in the row.
 *
 * FOLDING RULE, STATED PRECISELY. Both sides are lowered with `String.prototype.toLowerCase`, which is
 * locale-INDEPENDENT; `toLocaleLowerCase` is deliberately not used, because under a Turkish locale it
 * folds `I` to a dotless `ı` and `Merchandise` would stop matching depending on where the code ran —
 * a behaviour the CFML original never had. The three seeded codes are pure ASCII
 * [config/dbdata/SlatwallProductType.xml.cfm:L13-L15], so the fold cannot collide two of them into one
 * and cannot admit a non-ASCII string by accident.
 *
 * NO TRIMMING, AND THAT IS DELIBERATE. CFML `==` does not trim its operands, so a stored
 * `" merchandise"` did NOT match in the legacy system and must not match here. Adding a `trim` would
 * be an enhancement of exactly the kind Guideline 4 forbids.
 *
 * A NON-STRING, `null`, `undefined` OR THE EMPTY STRING RESOLVES TO `undefined`, NEVER TO AN ARM.
 * `model/entity/ProductType.cfc:L110-L115` walks to the root of the hierarchy when a product type
 * carries no `systemCode` of its own and returns the root's, which may itself be null or empty, so
 * "unrecognised" is a reachable, legitimate outcome rather than a defensive branch. No seeded code is
 * empty, so no empty or absent value can ever select an arm.
 *
 * ⛔ THE THREE CONSUMERS TREAT AN UNRECOGNISED VALUE DIFFERENTLY, AND NONE MAY BE ALIGNED TO ANOTHER.
 * `createSkus` throws the legacy fallthrough message [model/service/SkuService.cfc:L203-L205];
 * `getSkuDefinition` has no fallthrough arm at all and leaves its result the empty string
 * [model/entity/Sku.cfc:L574-L590]; and `SkuDAO.getProductSkus` simply adds no join
 * [model/dao/SkuDAO.cfc:L154-L161]. This recogniser therefore reports recognition and nothing more —
 * it never throws and never substitutes a default.
 *
 * TRANSLATION DECISION — THE UNION AND THIS RECOGNISER ARE COMPLEMENTARY, NOT REDUNDANT. Both exist,
 * and either one alone would be wrong:
 *
 *   - The union alone would be a compile-time fiction. `getBaseProductType()` at
 *     `model/entity/ProductType.cfc:L110` is declared to return `any` and returns whatever string
 *     the `SwProductType` row holds; when a product type has no `systemCode` of its own it walks
 *     to the root of the hierarchy and returns the root's `systemCode`, which may itself be null
 *     or empty. Nothing in the schema, in `model/validation/ProductType.json` or anywhere in the
 *     code constrains that value to the three seeded codes. Typing the producer's return as the
 *     bare union would be an unchecked assertion, and the compiler would then believe the
 *     fallthrough arm is unreachable — inviting a future reader to delete real, observable legacy
 *     behaviour. The fallthrough at `model/service/SkuService.cfc:L203-L204` DOES execute for such
 *     a value, and it throws; its message literal is owned solely by `src/errors/DomainError.ts`
 *     and is deliberately not reproduced here.
 *   - This recogniser alone would lose exhaustiveness checking, which is the benefit the migration
 *     buys for this construct: with the union, a `switch` over the RETURNED discriminator is checked
 *     against all three arms at compile time, replacing an unchecked CFML string comparison.
 *
 * Used together, a consumer passes the untrusted string through this recogniser, gets exhaustive
 * checking inside the narrowed branch, and keeps a genuinely reachable `undefined` case for
 * everything else — which is where the legacy behaviour lives.
 *
 * ⛔ WHY THIS IS NOT A `value is BaseProductType` TYPE PREDICATE, AND MUST NEVER BE TURNED BACK INTO
 * ONE. A predicate narrows the ARGUMENT, so the value inside the guarded block keeps its observed
 * casing while the compiler believes it is one of the three literals — and every `case 'merchandise'`
 * arm inside that block then silently fails to match `Merchandise`. That is precisely the defect this
 * function replaces: the previous `isBaseProductType` predicate compiled, narrowed, and then let a
 * `switch` fall through all three arms. Returning a NEW canonical value is what makes the fold
 * effective rather than cosmetic, and it is why the recogniser is a resolver and not a guard.
 *
 * SOUNDNESS. The answer is derived from `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE` by iteration, so
 * recogniser and data cannot drift: `SeededProductTypeRegistry` forces that object's own keys to be
 * exactly the members of `BaseProductType` — no fewer, no more — and every value returned below is a
 * `systemCode` read off one of those records rather than a literal retyped here.
 *
 * `Object.values` is used rather than `Object.hasOwn` on a folded key. Folding the KEY would require a
 * second, lower-cased copy of the registry to look into, and that copy would be a silently divergeable
 * duplicate of the seeded data (IR-7). Three iterations of a frozen three-member object is the honest
 * implementation of a three-way comparison, which is exactly what the legacy `if`/`else if` chain is.
 *
 * @param value - Any value, typically a `systemCode` read from the database, possibly inherited from a
 *   hierarchy root. `null`, `undefined`, the empty string and non-string values are all handled and
 *   simply resolve to `undefined`; nothing throws.
 * @returns The canonical seeded `systemCode` whose text equals `value` under CFML's case-insensitive
 *   `==`, or `undefined` when no seeded code does. The argument itself is never modified.
 */
export function resolveBaseProductType(value: unknown): BaseProductType | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const foldedValue = value.toLowerCase();

  for (const seededProductType of Object.values(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE)) {
    if (seededProductType.systemCode.toLowerCase() === foldedValue) {
      return seededProductType.systemCode;
    }
  }

  return undefined;
}
