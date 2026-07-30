/**
 * Merchandise-product test fixture — the data contract of the legacy MXUnit fixture helper.
 *
 * PROVENANCE: **TRACEABLE** — source `meta/tests/unit/Helper.cfc:L51-L75`, comprising the two
 * fixture members `getTestMerchandiseProduct()` (`L51`-`L67`) and
 * `destroyTestMerchandiseProduct()` (`L69`-`L75`). Every literal in this file is transcribed
 * from that span; none is generated, derived or invented.
 *
 * ★ THE LABEL IS DELIBERATELY SCOPED — READ THE QUALIFICATION BEFORE RELYING ON IT.
 * This is **contract-traceability, NOT exercised-coverage.** The legacy helper component is
 * instantiated at `meta/tests/unit/SlatwallUnitTestBase.cfc:L55`
 * (`variables.helper = createObject("component", "Helper");`) but is **invoked by no legacy
 * test whatsoever.** Verified by repository-wide search: `getTestMerchandiseProduct` and
 * `destroyTestMerchandiseProduct` each resolve to exactly one hit — their own declarations —
 * and `variables.helper` resolves to exactly one hit, the assignment above, never a read.
 * The legacy entity tests build their subjects through the product and brand services
 * instead, and `meta/tests/unit/IssuesTest.cfc:L55` inlines its own struct.
 *
 * What therefore crosses over is the fixture's *declared contract*, not a body of coverage
 * this file inherits. The distinction is stated plainly because the project standard is to
 * flag absent legacy coverage rather than imply parity: a reader must not conclude that the
 * legacy suite ever exercised this data. It did not.
 *
 * TRACEABILITY HERE IS DOCUMENTARY, NOT EMPIRICAL. MXUnit and CFSelenium are not vendored in
 * this repository, and `meta/tests/readme.txt:L4-L5` requires external CFIDE mappings to run
 * the legacy suite; `meta/docker/slatwall-local-dev/`, cited in the project brief, does not
 * exist — `meta/` contains only `eclipse` and `tests`. The legacy suite cannot be executed in
 * this environment at all, so no runtime comparison against the original CFML behaviour was
 * performed. Traceability was established by *reading* the legacy source and transcribing it.
 *
 * Scope of the claim, stated precisely: the enclosing `test/fixtures/` folder is net-new
 * organisation — `meta/tests/readme.txt` documents `/Coverage`, `/core`, `/entity`,
 * `/service`, `/dao`, `/Unit` and `/Functional`, and no fixtures folder. It is this FILE'S
 * CONTENTS that are traceable, not the folder that holds them.
 *
 * Purpose: give every suite under `test/` one authoritative, immutable source of
 * merchandise-product fixture data, importable without booting anything.
 */

/*
 * ---------------------------------------------------------------------------------------
 * LEGACY TESTS WERE INTEGRATION TESTS; TARGET TESTS ARE UNIT TESTS — BY DESIGN
 * ---------------------------------------------------------------------------------------
 * `meta/tests/unit/SlatwallUnitTestBase.cfc` extends `mxunit.framework.TestCase` at `L49`,
 * creates the whole FW/1 application at `L52`, boots it before EVERY test at `L60`
 * (`bootstrap()`), and elevates the acting account to superuser at `L62`. Collaborators are
 * then resolved through the DI/1 container at runtime. Every legacy "unit" test consequently
 * stands up the entire application.
 *
 * The target suite does the opposite: it imports the unit under test directly and constructs
 * it against test doubles. This fixture is the matching shift for fixture data — the CFML
 * `component` with its shared `variables` scope becomes plain exported functions, with no
 * base class, no inheritance, no bootstrap, no superuser concept and no framework of any
 * kind. A reviewer comparing the two suites should read that as an intended structural
 * difference, not as a coverage gap.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT CARRIED ACROSS — AND WHY
 * ---------------------------------------------------------------------------------------
 * The legacy `getTestMerchandiseProduct()` does three things. Only the FIRST crosses into
 * this file:
 *
 *   1. `L53`-`L60` assembles the `productData` struct.
 *      → PORTED, byte-exact, below.
 *
 *   2. `L62` persists it, by resolving the product service BY NAME from the request-scoped
 *      Hibachi scope through the DI/1 container and invoking `saveProduct` on the result.
 *      → NOT PORTED. That is a string-keyed runtime service lookup — exactly the dynamic
 *      service-locator idiom this migration replaces with explicit constructor injection — so
 *      it must not be reproduced in any form, and the call is described here by locator rather
 *      than transcribed so that not even a copy of it survives in this subtree. Persistence is
 *      the caller's concern, wired through the in-memory repository doubles in
 *      `test/support/inMemoryRepositories.ts`.
 *
 *   3. `L64` flushes the ORM session and `L66` returns the persisted entity.
 *      → NOT PORTED. See the mismatch note immediately below.
 *
 * ★ EXECUTION-MODEL MISMATCH M5 — FLAGGED, NOT SILENTLY DROPPED. The `ormFlush()` calls at
 * `L64`, and again in the teardown member at `L74`, depend on the legacy request lifecycle:
 * the application commits implicitly at request end, gated on the ORM reporting no errors.
 * A stateless handler has no request-end hook, so there is no equivalent call to make here.
 * The commit boundary now belongs to `src/adapters/mysql/UnitOfWork.ts`, which makes it
 * explicit per invocation. The omission is recorded rather than passed over, because a reader
 * diffing this file against `Helper.cfc` would otherwise find two missing calls and no
 * explanation.
 *
 * Consequence: this module is PURE. It builds and returns data. It touches no database, no
 * connection pool, no repository, no service, no filesystem, no network, no clock and no
 * environment variable, and importing it produces no observable effect. That purity is what
 * makes it trivially importable from every suite under `test/`.
 *
 * ---------------------------------------------------------------------------------------
 * TODO(parity) — DEFECT D17: THE UNSCOPED `productData` ASSIGNMENT CANNOT BE REPRODUCED
 * ---------------------------------------------------------------------------------------
 * Legacy locator, verified against the file itself: `meta/tests/unit/Helper.cfc:L53`, which
 * reads `productData = {` — an assignment carrying no `var` and no scope prefix. In CFML that
 * leaks the variable into the component's shared `variables` scope, so concurrent callers of
 * `getTestMerchandiseProduct()` would contend over one struct. It is the same defect class as
 * the unscoped loop variables at `model/service/ProductService.cfc:L73` and `:L75` and the
 * instance at `model/service/OptionService.cfc:L58`. The neighbouring legacy fixture at
 * `meta/tests/unit/IssuesTest.cfc:L55` repeats it.
 *
 * ★ LOCATOR CORRECTION. The project defect register records D17 at `Helper.cfc:L52`, and that
 * is off by one. `L52` is `var product = entityNew("SlatwallProduct");`, which IS correctly
 * `var`-scoped; the unscoped assignment is the NEXT line, `L53`. Both locators are named here
 * deliberately: a reviewer following the register alone would open `L52`, find properly
 * scoped code, and lose the evidence chain.
 *
 * DELIBERATE TRANSLATION DECISION. The governing standard is preserve-and-annotate rather
 * than repair — but this defect has no TypeScript expression. The language has no unscoped
 * assignment, and `const`/`let` are block-scoped, so the hazard is removed BY CONSTRUCTION
 * the instant the code is translated; there is no faithful way to carry the behaviour across.
 * This annotation is what preserves the record in its place, which is the same treatment
 * given to D10 and to the option-service instance. Nothing here is silently improved.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DETAILS MOST EASILY GOT WRONG
 * ---------------------------------------------------------------------------------------
 *   - `price` is a NUMBER, never a string. `Helper.cfc:L55` reads `price = 100`, unquoted.
 *   - `productType` is a NESTED object whose only key is `productTypeID`, never a flat
 *     `productTypeID` field hoisted onto the product. `Helper.cfc:L57-L59`.
 *
 * Both are corroborated by the declarative validation contract in
 * `model/validation/Product.json`, which the ported rule set carries: `price` is declared
 * `{"contexts":"save","required":true,"dataType":"numeric"}` and `productType` is declared
 * `{"contexts":"save","required":true}`. Quoting the price or flattening the product type
 * would misrepresent what the validation layer receives, with no compile error to catch it.
 */

/*
 * The single import this module is permitted, and the only one it needs.
 *
 * The merchandise `productTypeID` is imported rather than re-typed so that the 32-character
 * identifier has exactly ONE home in the test tree: `productTypes.ts` transcribes it from
 * `config/dbdata/SlatwallProductType.xml.cfm:L13`, the seed-data row that
 * `meta/tests/unit/Helper.cfc:L58` pins.
 *
 * The specifier is relative and extensionless by project rule — intra-subtree imports use
 * relative paths and never path aliases, so `tsc`, `ts-jest` and `esbuild` resolve it
 * identically and no runtime resolver shim is required. There is no barrel file in this
 * subtree, by design. Nothing under `src/**` imports this module either: `tsconfig.build.json`
 * excludes `test/`, so it never reaches an emitted Lambda artifact. It is development-only.
 */
import { MERCHANDISE_PRODUCT_TYPE_ID } from './productTypes';

/**
 * `productName` of the merchandise fixture — `meta/tests/unit/Helper.cfc:L54`.
 *
 * Transcribed exactly: one ASCII space, capital `T` and capital `P`. Exposed as a named
 * constant so that consuming suites assert against this value rather than re-typing the
 * string, keeping the literal in one place exactly as the product-type identifier is.
 *
 * `model/validation/Product.json` declares `productName` as
 * `{"contexts":"save","required":true}`.
 */
export const TEST_MERCHANDISE_PRODUCT_NAME = 'Test Product';

/**
 * `price` of the merchandise fixture — `meta/tests/unit/Helper.cfc:L55`.
 *
 * ★ A NUMBER, NOT A STRING. The legacy line reads `price = 100` with no quotation marks, and
 * `model/validation/Product.json` declares `price` as
 * `{"contexts":"save","required":true,"dataType":"numeric"}`. The corresponding SKU-side rule
 * in `model/validation/Sku.json` adds a floor, `{"minValue":0}`. Quoting this value would be
 * a silent type change that the compiler could not flag, because the legacy CFML struct is
 * untyped.
 */
export const TEST_MERCHANDISE_PRODUCT_PRICE = 100;

/**
 * `productCode` of the merchandise fixture — `meta/tests/unit/Helper.cfc:L56`.
 *
 * Transcribed exactly, including the uppercase spelling and the triple `X` suffix. The precise
 * characters matter beyond identity: `model/validation/Product.json` constrains `productCode`
 * with `{"contexts":"save","required":true,"unique":true,"regex":"^[a-zA-Z0-9-_.|:~^]+$"}`,
 * and this literal satisfies both the pattern and — as a deliberately implausible catalogue
 * code — the uniqueness rule.
 */
export const TEST_MERCHANDISE_PRODUCT_CODE = 'TESTPRODUCTXXX';

/**
 * The nested product-type reference carried by the fixture — `meta/tests/unit/Helper.cfc:L57-L59`.
 *
 * Modelled as its own type, with `productTypeID` as its ONLY member, because that is exactly
 * what the legacy struct nests. The legacy population path resolves a product type from this
 * identifier alone; nothing else about the type is supplied, so nothing else is modelled here.
 * Adding `systemCode` or `productTypeName` would be inventing data the fixture never carried —
 * a consumer that needs those reads them from `productTypes.ts`, which owns the seeded records.
 */
export interface TestMerchandiseProductTypeReference {
  readonly productTypeID: string;
}

/**
 * Shape of the merchandise fixture data — the four fields of `meta/tests/unit/Helper.cfc:L53-L60`
 * and no others.
 *
 * Every member is `readonly`, and the values returned by
 * {@link createTestMerchandiseProductData} are frozen at runtime to match, so a suite cannot
 * mutate fixture data and leak the change into another. Derive a variant through the factory's
 * `overrides` parameter, or by spreading into a fresh object.
 *
 * Field types are declared as `string` and `number` rather than as the literal types of the
 * defaults. That is intentional: a fixture whose `productName` typed as the literal
 * `'Test Product'` would reject every legitimate override. The exact default literals remain
 * available, with their literal types intact, through the three exported constants above.
 *
 * There is deliberately no identifier member. The legacy struct declares none, and
 * `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64` asserts through
 * `defaults_are_correct()` that a freshly built subject `isNew()` and carries an empty
 * `getPrimaryIDValue()`. Because this factory performs no persistence, the value it returns is
 * new and unsaved by construction — there is no identifier to assign and nothing to strip.
 * Identifier generation belongs to `src/util/uuid.ts` at the point of an actual save.
 */
export interface TestMerchandiseProductData {
  readonly productName: string;
  readonly price: number;
  readonly productCode: string;
  readonly productType: TestMerchandiseProductTypeReference;
}

/**
 * Optional per-call overrides for {@link createTestMerchandiseProductData}.
 *
 * Overriding is an idiomatic-TypeScript addition, not a legacy behaviour: the CFML helper took
 * no arguments and hard-coded its struct. The migration's minimal-change constraint governs
 * functional scope rather than idiom, so an overrides parameter is welcome — while the
 * DEFAULTS stay byte-exact, which is the part that is behaviour.
 *
 * Every member is optional, and each is declared WITHOUT an explicit `| undefined`. Under
 * `exactOptionalPropertyTypes` that distinction is real and load-bearing: a property may be
 * OMITTED, but it may not be present with the value `undefined`. So
 * `createTestMerchandiseProductData({})` is valid and
 * `createTestMerchandiseProductData({ productName: undefined })` is a compile error — which is
 * the behaviour worth having, because an explicit `undefined` almost always signals a bug in
 * the calling test rather than an intent to take the default.
 *
 * `productType` is replaced as a whole when supplied, not deep-merged. With exactly one member
 * on {@link TestMerchandiseProductTypeReference} the two are equivalent, and wholesale
 * replacement keeps the merge rule uniform across all four fields: one rule, no exceptions.
 */
export interface TestMerchandiseProductDataOverrides {
  readonly productName?: string;
  readonly price?: number;
  readonly productCode?: string;
  readonly productType?: TestMerchandiseProductTypeReference;
}

/**
 * Build the merchandise-product fixture data — the ported half of
 * `getTestMerchandiseProduct()` (`meta/tests/unit/Helper.cfc:L51-L67`).
 *
 * Carries the struct assembled at `L53`-`L60` and nothing else: the persistence at `L62` and
 * the ORM flush at `L64` are deliberately absent, for the reasons recorded in the header. The
 * returned value is new and unsaved, holds no identifier, and reaches no collaborator.
 *
 * A FACTORY rather than a shared exported object, so that each call yields an independent
 * value. Two suites can therefore use the fixture concurrently without either observing the
 * other's data — the precise hazard that the unscoped `variables`-scope assignment behind
 * defect D17 created in the legacy helper.
 *
 * @param overrides fields to replace on this call. Omit it, or pass `{}`, for the byte-exact
 *   legacy defaults.
 * @returns a frozen, independent fixture value.
 *
 * @example
 * ```ts
 * const data = createTestMerchandiseProductData();
 * // data.productName === TEST_MERCHANDISE_PRODUCT_NAME
 * // data.price === 100                      (a number)
 * // data.productType.productTypeID          (the seeded merchandise identifier)
 *
 * const dearer = createTestMerchandiseProductData({ price: 250 });
 * ```
 */
export function createTestMerchandiseProductData(
  overrides: TestMerchandiseProductDataOverrides = {},
): TestMerchandiseProductData {
  /*
   * Defaults first, overrides second, so a supplied field wins. Both the outer object and the
   * nested product-type reference are constructed fresh on every call and then frozen, which
   * makes the returned graph immutable at runtime as well as in the type system — the object
   * is shallow apart from that one nested member, so freezing both is a complete deep freeze.
   *
   * Note for maintainers: `productType` is re-spread and frozen AFTER the merge so that a
   * caller-supplied reference is copied rather than aliased. Without that copy, freezing would
   * mutate an object the caller still holds, and two fixture values built from the same
   * override literal would share one nested instance.
   */
  const merged = {
    productName: TEST_MERCHANDISE_PRODUCT_NAME,
    price: TEST_MERCHANDISE_PRODUCT_PRICE,
    productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    productType: { productTypeID: MERCHANDISE_PRODUCT_TYPE_ID },
    ...overrides,
  };

  return Object.freeze({
    ...merged,
    productType: Object.freeze({ productTypeID: merged.productType.productTypeID }),
  });
}

/**
 * The two teardown operations of `destroyTestMerchandiseProduct()`
 * (`meta/tests/unit/Helper.cfc:L69-L75`), supplied by the caller.
 *
 * The callbacks are typed as returning `void`, not `void | Promise<void>`, mirroring the legacy
 * `public void function`. A caller whose repository doubles are asynchronous must therefore
 * sequence the two operations itself rather than handing promises to a synchronous orchestrator.
 *
 * Precisely where that is enforced, since the two tools differ and the difference was measured
 * rather than assumed: `tsc` ACCEPTS a `Promise`-returning function in a `void` return position,
 * because TypeScript treats such a position as "the return value is ignored". The project's
 * type-aware lint rule is what rejects it — `@typescript-eslint/no-misused-promises`, active
 * through `recommendedTypeChecked`, reports "Promise-returning function provided to property
 * where a void return was expected". So the guard is real and is exercised by `npm run lint`,
 * but it is a lint error rather than a compile error; a caller must not rely on the compiler
 * alone to catch a silently unawaited promise here.
 */
export interface TestMerchandiseProductTeardownOperations {
  /**
   * Clear the product's default-SKU reference — `meta/tests/unit/Helper.cfc:L70`,
   * `arguments.product.setDefaultSku( javaCast("null", "") );`.
   */
  readonly clearDefaultSkuReference: () => void;

  /**
   * Delete the product — `meta/tests/unit/Helper.cfc:L72`, `entityDelete(arguments.product);`.
   */
  readonly deleteProduct: () => void;
}

/**
 * Run the fixture teardown in the mandated order — the ported half of
 * `destroyTestMerchandiseProduct()` (`meta/tests/unit/Helper.cfc:L69-L75`).
 *
 * ★ THE ORDERING IS BEHAVIOUR, NOT STYLE, AND IT IS THE WHOLE REASON THIS FUNCTION EXISTS.
 * The legacy member clears the default-SKU reference at `L70` BEFORE deleting the product at
 * `L72`, because `model/validation/Sku.json` declares a delete guard on the default flag —
 * `"defaultFlag": [{"contexts":"delete","eq":false}]` — so a SKU that is still its product's
 * default cannot be deleted. Reversing the two steps trips that guard and the teardown fails.
 * Preserving the sequence is therefore preserving observable behaviour, and this function
 * enforces it rather than merely documenting it.
 *
 * WHY IT TAKES CALLBACKS INSTEAD OF A PRODUCT. This module is pure and owns no persistence, so
 * it cannot delete anything itself, and inventing a persistence mechanism purely to have
 * something to tear down would fabricate behaviour the legacy fixture never had. The caller
 * supplies the two operations — normally closing over the in-memory repository doubles in
 * `test/support/inMemoryRepositories.ts` — and this function guarantees the order in which they
 * run. It performs no I/O of its own.
 *
 * NO FLUSH, AND NO RESET FUNCTION. The `ormFlush()` at `L74` is not carried, per mismatch M5 in
 * the header. Nor is there a companion "reset the fixture" helper: this module holds no
 * module-scope mutable state to reset, because {@link createTestMerchandiseProductData} builds
 * a fresh frozen value on every call. An exported no-op reset would be a placeholder pretending
 * to be an API, so none is offered.
 *
 * @param operations the caller's two teardown operations.
 *
 * @example
 * ```ts
 * tearDownTestMerchandiseProduct({
 *   clearDefaultSkuReference: () => { product.defaultSku = null; },
 *   deleteProduct: () => products.delete(product.productID),
 * });
 * ```
 */
export function tearDownTestMerchandiseProduct(
  operations: TestMerchandiseProductTeardownOperations,
): void {
  operations.clearDefaultSkuReference();
  operations.deleteProduct();
}
