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
 * WHY THESE ARE FIXED DATA, NOT TEST DATA (IR-7)
 * ----------------------------------------------
 * These values are hard-coded rather than generated, and that is the faithful choice:
 *
 *  1. The `systemCode` strings are literal BRANCH KEYS of production logic. The legacy
 *     `SkuService.createSkus` discriminates three ways on
 *     `product.getProductType().getBaseProductType()` at model/service/SkuService.cfc:L61
 *     (merchandise), :L139 (subscription) and :L173 (contentAccess). A single wrong character
 *     silently stops a branch from ever matching, with no compile error and no obvious failure.
 *
 *  2. The identifiers already predate this port inside the legacy suite: meta/tests/unit/Helper.cfc:L58
 *     and meta/tests/unit/IssuesTest.cfc:L58 both pin the merchandise `productTypeID`, and
 *     meta/tests/unit/IssuesTest.cfc:L105 pins the contentAccess one.
 *
 *  3. The seeded rows are protected from deletion by a declarative guard: model/validation/ProductType.json
 *     declares `"systemCode": [{"contexts":"delete","maxLength":0}]`, so a row bearing a `systemCode`
 *     cannot be deleted. The rows are stable platform data, which is what makes hard-coding correct.
 *
 * The values are therefore transcribed, never regenerated, dashed, re-cased or derived from one
 * another. Their format follows IR-6: 32 lowercase hexadecimal characters with no dashes, matching
 * the identifiers `createSlatwallUUID()` produces.
 *
 * THIS MODULE IS A PURE LEAF — IT IMPORTS NOTHING
 * ----------------------------------------------
 * There is deliberately no `import` of any kind here, not even `import type`. The fixture exists so
 * tests can reference the discriminators without reaching into production code, so it must not couple
 * itself to src/**. Its agreement with src/domain/BaseProductType.ts comes from independent
 * transcription of the same authoritative legacy lines rather than from module coupling.
 *
 * Correspondingly nothing under src/** imports this module, and tsconfig.build.json excludes test/,
 * so this file is absent from any emitted artifact. It is development-only.
 *
 * DELIBERATE EXCLUSION — THE DEVELOPER SCRATCH IDENTIFIERS
 * -------------------------------------------------------
 * config/dbdata/SlatwallProductType.xml.cfm:L19-L31 carries an XML comment block of unused developer
 * scratch identifiers, introduced by a note telling the reader to delete them after use. None is a
 * `<Record>` and none has a consumer, so they are not seeded rows and not fixed data. They are
 * excluded here entirely — not as constants, not as a "reserved" list, and not reproduced in any
 * comment. This module exposes exactly the three seeded discriminators.
 *
 * WHAT THESE LITERALS ARE FOR — AND THE COMPARISON RULE THEY ARE *NOT*
 * -------------------------------------------------------------------
 * These are the CANONICAL SPELLINGS of the seeded rows, transcribed so a test can name a
 * discriminator without reaching into production code. They are not a comparison rule, and this
 * module deliberately states none.
 *
 * An earlier revision of this block claimed a behavioural divergence here: that CFML `==` at
 * model/service/SkuService.cfc:L61 is case-insensitive while a ported `===` is not, so the port was
 * "strictly stricter than the original". THAT CLAIM IS WITHDRAWN, because the port does not compare
 * with `===`. src/domain/BaseProductType.ts carries a recogniser, `resolveBaseProductType`, which
 * case-folds both operands before matching and answers the canonical spelling — so a `SwProductType`
 * row holding `Merchandise` or `MERCHANDISE` reaches the merchandise branch exactly as it did in the
 * legacy system, and there is no divergence left to flag. That file also records why a narrowing
 * would have been a defect rather than a tightening: `systemCode` is an ordinary `varchar` with no
 * check constraint, model/validation/ProductType.json declares no format rule for it, and
 * model/entity/ProductType.cfc:L110 returns whatever text the row holds, including a value inherited
 * from a hierarchy root.
 *
 * The consequence for a reader of THIS file is narrow and worth stating plainly: compare a
 * `systemCode` read from a row by passing it through `resolveBaseProductType` first, and use `===`
 * against a literal below only on a value that recogniser has already returned. Nothing about the
 * literals themselves changes — they stay exactly as the seed data spells them.
 *
 * MODULE SCOPE IS SAFE HERE SPECIFICALLY (M7)
 * ------------------------------------------
 * Nothing survives between Lambda invocations except module-scope state, so module-scope caching and
 * memoization are avoided almost everywhere in this subtree to stop state bleeding across warm
 * invocations. This module is the documented exception: it holds immutable compile-time constants
 * only — no per-request data, no memoized results, nothing invocation-specific. The general rule
 * points the other way, which is why this exception is stated rather than assumed.
 */

/**
 * Shape of a seeded product-type record: EVERY column the legacy `<Record>` elements carry,
 * and no others.
 *
 * The legacy `<Columns>` block declares exactly seven columns at
 * `config/dbdata/SlatwallProductType.xml.cfm:L4`-`L10`, and each of the three `<Record>`
 * elements at `:L13`-`L15` supplies a value for all seven. This interface therefore declares
 * seven members, one per column, so the module IS the exact seeded-row fixture rather than a
 * partial projection of it: a consumer asserting against a seeded row can read any column the
 * legacy document defines, and no column exists only in prose.
 *
 * Members are grouped for the reader rather than ordered to mirror the document: the four
 * columns production logic reads come first, then the three that complete the row. The
 * physical attribute order inside each `<Record>` element differs from the `<Columns>`
 * declaration order anyway — `productTypeIDPath` and `parentProductTypeID` are swapped — and
 * attribute order is cosmetic in XML, so no ordering is reproduced for its own sake.
 *
 * Used only in `satisfies` position, which gives two guarantees at compile time: excess
 * property checking rejects any invented field, and — unlike a type annotation — the
 * literal types survive instead of widening to `string`. Because `satisfies` also demands
 * every declared member be present, adding a column here forces all three records to carry
 * it; the interface and the records cannot drift out of agreement.
 *
 * Intentionally NOT exported. The public surface of this module is data, not types: the
 * `BaseProductType` union is owned by `src/domain/BaseProductType.ts`, and declaring a
 * competing exported type here would create two definitions of one concept. Consumers that
 * need a type derive it structurally, e.g. `typeof MERCHANDISE_PRODUCT_TYPE` or
 * `(typeof ALL_SEEDED_PRODUCT_TYPES)[number]`.
 *
 * ⚠️ `src/domain/BaseProductType.ts` deliberately models a NARROWER record — the four members
 * production code branches on. That is not a drift to reconcile: that module is the domain
 * discriminator surface, whereas this one is the seeded-ROW fixture, and only the fixture is
 * required to reproduce the row in full. The consistency gate between the two files is over the
 * three `productTypeID` literals, and those remain byte-identical.
 */
interface SeededProductTypeRecord {
  /** `config/dbdata/SlatwallProductType.xml.cfm:L8` — the value production logic branches on. */
  readonly systemCode: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L4` — `fieldtype="id"`, 32-char lowercase hex. */
  readonly productTypeID: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L7` — declared `update="false"`. */
  readonly productTypeName: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L9` — declared `update="false"`. */
  readonly urlTitle: string;

  /**
   * `config/dbdata/SlatwallProductType.xml.cfm:L6` — the materialised hierarchy path.
   *
   * Equal to the row's own `productTypeID` on all three seeded records, because all three are
   * ROOTS of the product-type hierarchy. Each record below takes this value FROM the
   * corresponding `*_PRODUCT_TYPE_ID` constant rather than repeating the literal, so the
   * identity is structural and cannot be broken by an edit to one of the two.
   */
  readonly productTypeIDPath: string;

  /**
   * `config/dbdata/SlatwallProductType.xml.cfm:L5` — the parent reference.
   *
   * ⚠️ TRANSCRIBED AS THE LITERAL FOUR-CHARACTER STRING `'NULL'`, which is what the seed
   * document actually renders on all three records: this format spells SQL NULL as that
   * literal rather than omitting the attribute. It is deliberately NOT modelled as `null`, as
   * `undefined`, or as an absent member — every one of those would be a representation the
   * source does not carry, and the whole point of this fixture is that a reviewer diffing it
   * against `:L13`-`L15` finds the source's own characters.
   */
  readonly parentProductTypeID: string;

  /**
   * `config/dbdata/SlatwallProductType.xml.cfm:L10` — active on all three seeded records.
   *
   * ⚠️ TRANSCRIBED AS THE LITERAL STRING `'1'`, the value the seed document renders, even
   * though `:L10` declares the column `datatype="bit"` (and `update="false"`). The column's
   * eventual storage type is a fact about the schema; the fixture's job is to reproduce the
   * ROW as written, so the rendered characters are what is carried. Coercing to `true` or to
   * the number `1` would substitute a representation the document does not contain, and a
   * consumer that wants a boolean can derive one at its own call site with an explicitly
   * documented comparison.
   */
  readonly activeFlag: string;
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
 * ALL SEVEN COLUMNS ARE MODELLED AS FIELDS, and the three completing ones carry facts a
 * reader would otherwise have to take on trust from a comment:
 *   - `productTypeIDPath` equals the row's own `productTypeID` on all three records — that
 *     is, all three seeded product types are ROOTS of the hierarchy. Each record takes the
 *     value from its own `*_PRODUCT_TYPE_ID` constant, so the equality is structural.
 *   - `parentProductTypeID` is the literal four-character string `'NULL'` on all three, as
 *     rendered by this seed-data format — NOT a null value, and not an absent member.
 *   - `activeFlag` is the literal `'1'` on all three, transcribed as rendered even though
 *     `config/dbdata/SlatwallProductType.xml.cfm:L10` declares the column `datatype="bit"`.
 *
 * Each of the three carries its full rationale on its declaration in
 * {@link SeededProductTypeRecord} above; the summary here exists so the record constants can
 * be read without scrolling back.
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
  productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
  parentProductTypeID: 'NULL',
  activeFlag: '1',
} as const satisfies SeededProductTypeRecord);

/**
 * The `subscription` product type — `config/dbdata/SlatwallProductType.xml.cfm:L14`.
 */
export const SUBSCRIPTION_PRODUCT_TYPE = Object.freeze({
  systemCode: 'subscription',
  productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
  productTypeName: 'Subscription',
  urlTitle: 'subscription',
  productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
  parentProductTypeID: 'NULL',
  activeFlag: '1',
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
  productTypeIDPath: CONTENT_ACCESS_PRODUCT_TYPE_ID,
  parentProductTypeID: 'NULL',
  activeFlag: '1',
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
