/**
 * Seeded product-type discriminators of Slatwall 3.1.39 — shared test fixture.
 *
 * PROVENANCE: **TRACEABLE** — source `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`
 * (the `<Record>` elements of the `SwProductType` seed-data document). Every literal in
 * this file is transcribed verbatim from that span.
 *
 * Purpose: give every suite under `test/` one authoritative place to reference the three
 * product-type discriminators *without importing production code paths*.
 *
 * TRACEABILITY HERE IS DOCUMENTARY, NOT EMPIRICAL. MXUnit and CFSelenium are not vendored
 * in this repository, and `meta/tests/readme.txt:L4-L5` requires external CFIDE mappings to
 * run the legacy suite — so that suite cannot be executed in this environment at all. No
 * runtime comparison against the original CFML behaviour was performed. Traceability was
 * established by *reading* the legacy source and transcribing it.
 *
 * The label is deliberately scoped so it is not overclaimed: the enclosing `test/fixtures/`
 * folder is net-new organisation — `meta/tests/readme.txt` documents `/Coverage`, `/core`,
 * `/entity`, `/service`, `/dao`, `/Unit` and `/Functional`, and no fixtures folder. It is
 * this FILE'S CONTENTS that are traceable, not the folder that holds them.
 */

/*
 * ---------------------------------------------------------------------------------------
 * WHY THESE ARE FIXED DATA, NOT TEST DATA (IR-7)
 * ---------------------------------------------------------------------------------------
 * These values are hard-coded rather than generated, and that is the faithful choice, not
 * a fragile one. Three independent pieces of evidence:
 *
 *  1. The `systemCode` strings are literal BRANCH KEYS of production logic. The legacy
 *     `SkuService.createSkus` discriminates three ways on
 *     `product.getProductType().getBaseProductType()` at
 *     `model/service/SkuService.cfc:L61` (merchandise), `:L139` (subscription) and
 *     `:L173` (contentAccess). A single wrong character silently stops a branch from ever
 *     matching — it produces no compile error and no obvious failure.
 *
 *  2. The identifiers already predate this port inside the legacy suite itself:
 *     `meta/tests/unit/Helper.cfc:L58` and `meta/tests/unit/IssuesTest.cfc:L58` both pin
 *     the merchandise `productTypeID`, and `meta/tests/unit/IssuesTest.cfc:L105` pins the
 *     contentAccess one.
 *
 *  3. The seeded rows are PROTECTED FROM DELETION by a declarative validation guard:
 *     `model/validation/ProductType.json` declares
 *     `"systemCode": [{"contexts":"delete","maxLength":0}]`, so a row bearing a
 *     `systemCode` cannot be deleted. The rows are therefore stable platform data, which
 *     is precisely what makes hard-coding them correct.
 *
 * Consequence: these values are transcribed. They are never regenerated, dashed,
 * re-cased or derived from one another.
 *
 * ---------------------------------------------------------------------------------------
 * IDENTIFIER FORMAT (IR-6)
 * ---------------------------------------------------------------------------------------
 * Legacy primary keys are 32-character lowercase-hex strings produced in application code
 * by `createSlatwallUUID()`, never dashed RFC-4122 values. The three `productTypeID`
 * literals below are exactly that shape: 32 characters, lowercase hex, no dashes.
 *
 * ---------------------------------------------------------------------------------------
 * THIS MODULE IS A PURE LEAF — IT IMPORTS NOTHING
 * ---------------------------------------------------------------------------------------
 * There is deliberately no `import` of any kind here, not even `import type`. The fixture
 * exists so tests can reference the discriminators without reaching into production code,
 * so it must not couple itself to `src/**`. Its agreement with the literals declared in
 * `src/domain/BaseProductType.ts` is guaranteed by independent transcription from the same
 * authoritative legacy lines and verified by a grep comparison — not by module coupling.
 * There is no barrel file in this subtree, by design.
 *
 * Correspondingly, nothing under `src/**` imports this module: `tsconfig.build.json`
 * excludes `test/`, so this file is intentionally absent from any emitted Lambda artifact.
 * It is a development-only artifact.
 *
 * ---------------------------------------------------------------------------------------
 * DELIBERATE EXCLUSION — THE DEVELOPER SCRATCH IDENTIFIERS
 * ---------------------------------------------------------------------------------------
 * The same legacy document carries an XML comment block at `L19`-`L31` holding unused
 * developer scratch identifiers, introduced by a note telling the reader to delete them
 * after use. None of them is a `<Record>`; a repository-wide search finds each one only
 * inside that comment block, with zero consumers anywhere. They are not seeded rows and
 * not fixed data, so they are excluded here entirely — not as constants, not as a
 * "reserved" list, and not reproduced in any comment. This module exposes exactly the
 * three seeded discriminators and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * TRANSLATION DECISION — CFML `==` IS CASE-INSENSITIVE, TYPESCRIPT `===` IS NOT
 * ---------------------------------------------------------------------------------------
 * The legacy discriminator comparison at `model/service/SkuService.cfc:L61` uses CFML
 * `==`, which compares strings case-insensitively: it would also have matched
 * `"Merchandise"` or `"MERCHANDISE"`. A TypeScript `===` comparison will not. Keeping the
 * exact-case literals from the seed data is the correct translation — the seeded rows are
 * the only values the comparison can legitimately see — but the narrowing is a real
 * behavioural divergence and is flagged here so any consumer comparing `systemCode` values
 * understands that the ported check is strictly stricter than the original.
 *
 * ---------------------------------------------------------------------------------------
 * EXECUTION-MODEL NOTE (M7) — MODULE SCOPE IS SAFE *HERE SPECIFICALLY*
 * ---------------------------------------------------------------------------------------
 * The legacy entities declare `cacheuse="transactional"` (a Hibernate second-level cache),
 * and in the target model nothing survives between Lambda invocations except module-scope
 * state. Module-scope caching and memoization are therefore avoided almost everywhere in
 * this subtree, to prevent state from bleeding across warm invocations. This module is the
 * documented exception: it holds immutable compile-time constants only — no per-request
 * data, no memoized query results, nothing invocation-specific — so declaring them at
 * module scope is both correct and safe. The general rule points the other way, which is
 * exactly why this exception is stated rather than assumed.
 */

/**
 * Shape of a seeded product-type record: exactly the four fields carried across from the
 * legacy `<Record>` elements, and no others.
 *
 * Used only in `satisfies` position, which gives two guarantees at compile time: excess
 * property checking rejects any invented field, and — unlike a type annotation — the
 * literal types survive instead of widening to `string`.
 *
 * Intentionally NOT exported. The public surface of this module is data, not types: the
 * `BaseProductType` union is owned by `src/domain/BaseProductType.ts`, and declaring a
 * competing exported type here would create two definitions of one concept. Consumers that
 * need a type derive it structurally, e.g. `typeof MERCHANDISE_PRODUCT_TYPE` or
 * `(typeof ALL_SEEDED_PRODUCT_TYPES)[number]`.
 */
interface SeededProductTypeRecord {
  readonly systemCode: string;
  readonly productTypeID: string;
  readonly productTypeName: string;
  readonly urlTitle: string;
}

/**
 * `productTypeID` of the `merchandise` product type.
 * Transcribed from `config/dbdata/SlatwallProductType.xml.cfm:L13`.
 */
export const MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * `productTypeID` of the `subscription` product type.
 * Transcribed from `config/dbdata/SlatwallProductType.xml.cfm:L14`.
 */
export const SUBSCRIPTION_PRODUCT_TYPE_ID = '444df2f9c7deaa1582e021e894c0e299';

/**
 * `productTypeID` of the `contentAccess` product type.
 * Transcribed from `config/dbdata/SlatwallProductType.xml.cfm:L15`.
 */
export const CONTENT_ACCESS_PRODUCT_TYPE_ID = '444df313ec53a08c32d8ae434af5819a';

/*
 * The three record constants below.
 *
 * Each takes its `productTypeID` from the corresponding constant above, so the standalone
 * identifier and the record can never drift apart.
 *
 * `as const` pins the literal types and makes each record readonly to the type checker;
 * `Object.freeze` makes it immutable at runtime as well, so a suite cannot mutate shared
 * fixture state and leak it into another. The records are flat, so freezing each record
 * and each container is a complete, deep freeze. Freezing the module's own freshly created
 * literals is self-contained initialisation — there is no I/O, no global mutation and no
 * other observable side effect at import time.
 *
 * VERIFIED LEGACY FACTS THAT ARE DELIBERATELY *NOT* MODELLED AS FIELDS. All three are real
 * properties of the seeded rows, recorded here because materialising unused fields would
 * exceed this fixture's stated four-field scope:
 *   - `productTypeIDPath` equals the row's own `productTypeID` on all three records — that
 *     is, all three seeded product types are roots of the hierarchy.
 *   - `parentProductTypeID` is the literal four-character string `"NULL"` on all three, as
 *     rendered by this seed-data format — not a null value.
 *   - `activeFlag` is `"1"` on all three.
 */

/**
 * The `merchandise` product type — `config/dbdata/SlatwallProductType.xml.cfm:L13`.
 *
 * This is the discriminator the legacy SKU-combination logic branches on first, and the one
 * the legacy fixtures at `meta/tests/unit/Helper.cfc:L58` and
 * `meta/tests/unit/IssuesTest.cfc:L58` already pin.
 */
export const MERCHANDISE_PRODUCT_TYPE = Object.freeze({
  systemCode: 'merchandise',
  productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
  productTypeName: 'Merchandise',
  urlTitle: 'merchandise',
} as const satisfies SeededProductTypeRecord);

/**
 * The `subscription` product type — `config/dbdata/SlatwallProductType.xml.cfm:L14`.
 */
export const SUBSCRIPTION_PRODUCT_TYPE = Object.freeze({
  systemCode: 'subscription',
  productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
  productTypeName: 'Subscription',
  urlTitle: 'subscription',
} as const satisfies SeededProductTypeRecord);

/**
 * The `contentAccess` product type — `config/dbdata/SlatwallProductType.xml.cfm:L15`.
 *
 * PRESERVED ASYMMETRY — DO NOT "TIDY" THIS RECORD. That single legacy line renders the same
 * concept three different ways, and all three are carried across byte-exact and distinct:
 *   - `productTypeName` is `'Content Access'` — title case, containing a space
 *   - `systemCode`      is `'contentAccess'`  — camelCase, and the value production code
 *                                               compares against
 *   - `urlTitle`        is `'content-access'` — kebab-case
 *
 * None of the three is derived from another: there is no slug helper, no `replace`, no
 * case folding. Normalising any one of them to match another would change data that the
 * legacy system treats as three independent columns, so the inconsistency is preserved
 * deliberately rather than repaired. The legacy fixture at
 * `meta/tests/unit/IssuesTest.cfc:L105` pins this record's `productTypeID`.
 */
export const CONTENT_ACCESS_PRODUCT_TYPE = Object.freeze({
  systemCode: 'contentAccess',
  productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
  productTypeName: 'Content Access',
  urlTitle: 'content-access',
} as const satisfies SeededProductTypeRecord);

/**
 * All three seeded product types, in the order they are declared in the legacy seed-data
 * document (`config/dbdata/SlatwallProductType.xml.cfm:L13-L15`).
 *
 * For suites that need to iterate the discriminators — for example, asserting that SKU
 * creation handles every branch. Typed as a readonly tuple, so indexing a known position
 * stays free of `undefined` under `noUncheckedIndexedAccess` and `.length` keeps its
 * literal type.
 */
export const ALL_SEEDED_PRODUCT_TYPES = Object.freeze([
  MERCHANDISE_PRODUCT_TYPE,
  SUBSCRIPTION_PRODUCT_TYPE,
  CONTENT_ACCESS_PRODUCT_TYPE,
] as const);

/**
 * Compile-time guard for the lookup below: requires every key to be exactly the
 * `systemCode` of the record stored under it, so the two can never drift apart. Key
 * remapping over the tuple derives the required keys from the records themselves rather
 * than restating them, which is what makes the agreement machine-checked.
 *
 * Local and unexported for the same reason as `SeededProductTypeRecord`.
 */
type SeededProductTypesBySystemCode = {
  readonly [Seeded in (typeof ALL_SEEDED_PRODUCT_TYPES)[number] as Seeded['systemCode']]: Seeded;
};

/**
 * The three seeded product types keyed by `systemCode`, for resolving a record from the
 * code that legacy production logic branches on.
 *
 * Reading a literal key (`SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise`) yields the
 * record directly. Note that indexing this object with a value of type `string` yields
 * `Record | undefined` under `noUncheckedIndexedAccess`; that is intentional, and it is why
 * the three standalone `*_PRODUCT_TYPE_ID` constants above exist — a consumer that just
 * needs an identifier takes it from those and never needs a non-null assertion.
 */
export const SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE = Object.freeze({
  merchandise: MERCHANDISE_PRODUCT_TYPE,
  subscription: SUBSCRIPTION_PRODUCT_TYPE,
  contentAccess: CONTENT_ACCESS_PRODUCT_TYPE,
} as const satisfies SeededProductTypesBySystemCode);
