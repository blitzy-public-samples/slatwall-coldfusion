/**
 * Base product types of Slatwall 3.1.39 — the three seeded discriminators.
 *
 * PORT OF `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` — the three `<Record>` elements of
 * the `SwProductType` seed-data document. Those rows are the only product types in the system
 * that carry a `systemCode`, and that `systemCode` is the value the Catalog's business logic
 * branches on:
 *
 *   - `model/service/SkuService.cfc` discriminates three ways in `createSkus` — `:L61`
 *     (merchandise), `:L139` (subscription), `:L173` (contentAccess).
 *   - `model/entity/Sku.cfc:L574-L590` (`getSkuDefinition`) discriminates the same three ways.
 *   - `model/entity/ProductType.cfc:L109-L115` (`getBaseProductType`) produces the value.
 *
 * ---------------------------------------------------------------------------------------------
 * FIXED SEED DATA, NOT TEST DATA, AND NOT GENERATED IDENTIFIERS (IR-7)
 * ---------------------------------------------------------------------------------------------
 * The three `productTypeID` literals below are transcribed from the legacy seed document. They
 * are never regenerated, never routed through `createSlatwallUUID()` in `src/util/uuid.ts`,
 * never dashed into RFC-4122 form and never re-cased. Per IR-6 the legacy primary key is a
 * 32-character lowercase-hex string with no dashes, and all three values below are exactly that.
 *
 * WHY BYTE-EXACTNESS IS THE ENTIRE POINT OF THIS FILE. A wrong character in one of these
 * identifiers, or in one of the `systemCode` strings, produces NO compile error and NO obvious
 * test failure. It simply means a branch stops matching: the merchandise arm of `createSkus`
 * never runs, no SKUs are generated, and the legacy fixtures stop being traceable. The compiler
 * can protect the `systemCode` values — they are typed against the union below, so a typo is a
 * compile error — but it cannot protect the identifiers, which are opaque strings to it. They are
 * therefore verified the only way they can be: by diffing them against
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`.
 *
 * TO KEEP THAT DIFF MEANINGFUL, EACH IDENTIFIER LITERAL APPEARS EXACTLY ONCE IN THIS FILE. It is
 * declared on the record that owns it and read from there by every consumer. No convenience
 * duplicate is exported, because a second copy of a literal is precisely the drift this file
 * exists to prevent.
 *
 * These rows can be relied upon as permanent platform data rather than as a fragile assumption:
 * `model/validation/ProductType.json` declares `"systemCode": [{"contexts":"delete",
 * "maxLength":0}]`, a delete guard that refuses to delete any product type bearing a
 * `systemCode` — which is exactly these three rows and no others.
 *
 * ---------------------------------------------------------------------------------------------
 * DELIBERATE EXCLUSION — THE DEVELOPER SCRATCH IDENTIFIERS
 * ---------------------------------------------------------------------------------------------
 * The same legacy document ends with an XML comment block at `L19`-`L31` holding seven further
 * identifiers, introduced by a note telling the reader to delete them once used. None of them is
 * a `<Record>`, and a repository-wide search finds each one only inside that comment block, with
 * zero consumers. They are not seeded rows, so they are excluded from this module entirely — not
 * as constants, not as a "reserved" list, and not reproduced in any comment here. This module
 * declares exactly the three seeded discriminators and nothing else; there is no fourth member,
 * and no placeholder or unknown member, because the source admits none.
 *
 * The three seeded rows carry three further attributes that are deliberately NOT modelled as
 * fields, recorded here so their absence reads as a decision rather than a loss:
 * `productTypeIDPath` equals the row's own `productTypeID` on all three (so all three are roots
 * of the hierarchy), `parentProductTypeID` is the literal four-character string `"NULL"` as
 * rendered by this seed-data format rather than a null value, and `activeFlag` is `"1"`.
 *
 * ---------------------------------------------------------------------------------------------
 * EXECUTION-MODEL NOTE (M7) — MODULE SCOPE IS SAFE *HERE SPECIFICALLY*
 * ---------------------------------------------------------------------------------------------
 * 111 of the 113 legacy entities declare `cacheuse="transactional"` and memoize derived values in
 * per-request scope; nothing in the target survives between Lambda invocations except module-scope
 * state. Module-scope caching and memoization are therefore avoided almost everywhere under
 * `src/domain/**` — a memoized per-entity value held at module scope would bleed across warm
 * invocations. This module is the documented exception: it holds immutable, frozen compile-time
 * constants only, with no per-request data and nothing invocation-specific, so module scope is
 * both correct and safe. The general rule points the other way, which is why the exception is
 * stated rather than assumed.
 *
 * Nothing here performs I/O, opens a connection, reads an environment variable or logs, so loading
 * this module is free of side effects and it can be used from any context, test included.
 */

/**
 * The `systemCode` of a seeded product type — the discriminator the Catalog branches on.
 *
 * Declared explicitly, as a union of the three literals, rather than derived from the data below.
 * The explicit form is greppable and countable: a reviewer can see at a glance that there are
 * exactly three members and compare them against the seed document. Agreement with the data is
 * not left to convention — `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE` is typed as a total mapping over
 * this union, so a member missing from the data, an extra key, or a mistyped `systemCode` on a
 * record are all compile errors.
 *
 * TRANSLATION DECISION — WHY A UNION AND NOT AN ENUM. A TypeScript `enum` would emit a runtime
 * object and introduce a nominal type that does not compare cleanly against the raw strings read
 * out of the `SwProductType` table. These values must be *equal* to the database strings, so the
 * idiomatic representation is a string-literal union over `as const` data.
 *
 * TRANSLATION DECISION — CFML `==` IS CASE-INSENSITIVE, TYPESCRIPT `===` IS NOT. The legacy
 * comparison at `model/service/SkuService.cfc:L61` uses CFML `==`, which would also have matched
 * `"Merchandise"` or `"MERCHANDISE"`. The ported comparison is case-SENSITIVE, and that is the
 * correct translation because the seeded rows are the only values the comparison can legitimately
 * see. It is nonetheless a real behavioural narrowing, flagged here rather than hidden: a row
 * whose `systemCode` had been hand-edited to a different case would have matched in CFML and will
 * not match here.
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
 * Narrows an untrusted value to {@link BaseProductType}.
 *
 * TRANSLATION DECISION — THE UNION AND THIS GUARD ARE COMPLEMENTARY, NOT REDUNDANT. Both exist,
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
 *   - This guard alone would lose exhaustiveness checking, which is the benefit the migration buys
 *     for this construct: with the union, a `switch` over a narrowed discriminator is checked
 *     against all three arms at compile time, replacing an unchecked CFML string comparison.
 *
 * Used together, a consumer passes the untrusted string through this guard, gets exhaustive
 * checking inside the narrowed branch, and keeps a genuinely reachable `else` for everything else
 * — which is where the legacy behaviour lives. Note that the two legacy consumers treat that
 * `else` DIFFERENTLY, and neither may be aligned to the other: `createSkus` throws, whereas
 * `getSkuDefinition` at `model/entity/Sku.cfc:L574-L590` has no fallthrough arm at all and
 * silently leaves its result as the empty string.
 *
 * SOUNDNESS. The predicate is derived from `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE`, so guard and
 * data cannot drift: `SeededProductTypeRegistry` forces that object's own keys to be exactly the
 * members of `BaseProductType` — no fewer, no more — making own-key membership equivalent to
 * membership of the union.
 *
 * `Object.hasOwn` is used rather than the `in` operator on purpose. `in` also walks the prototype
 * chain, so it would report `'toString'` and `'constructor'` as members and quietly widen the
 * guard to accept values that are not product types at all.
 *
 * @param value - Any value, typically a `systemCode` read from the database. `null`, `undefined`
 *                and non-string values are handled and simply return `false`; nothing throws.
 * @returns `true` only for the three seeded `systemCode` strings, compared case-sensitively.
 */
export function isBaseProductType(value: unknown): value is BaseProductType {
  return typeof value === 'string' && Object.hasOwn(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE, value);
}
