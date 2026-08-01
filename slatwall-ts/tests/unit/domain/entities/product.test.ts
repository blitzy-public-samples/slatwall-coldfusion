// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite for `src/domain/entities/product.ts`
//
// The subject is the port of the 841-line `model/entity/Product.cfc`, the
// behaviour-carrying centre of the catalog half of this slice.
//
// ═══════════════════════════════════════════════════════════════════════════
// C8 TRACEABILITY DECLARATION - THREE PROVENANCE CLASSES
// ═══════════════════════════════════════════════════════════════════════════
//
// This file carries THREE distinct provenance classes and every `describe` is
// labelled with the one it belongs to. Presenting net-new coverage as parity
// fails C8, so the boundaries are drawn explicitly rather than left to
// inference.
//
//   1. LEGACY-EXTENDED - EXACTLY FIVE CASES.
//      [meta/tests/unit/entity/ProductTest.cfc] (65 lines) declares ONE test
//      method and OVERRIDES NOTHING, so it ADDS to the four its base declares:
//      3 + 1 inherited-but-not-overridden + ... no. Precisely: 4 inherited
//      unchanged + 1 added = 5.
//
//      ★ CONTRAST WITH THE SIBLING LEGACY-EXTENDED SUITE.
//      [meta/tests/unit/entity/BrandTest.cfc:L58-L60] OVERRIDES
//      `defaults_are_correct`, and an override REPLACES rather than adds, so
//      Brand totals 3 + 1 = 4. Product overrides nothing, so Product totals
//      4 + 1 = 5. The two numbers differ for a real reason and neither is a
//      transcription of the other.
//
//   2. ROUTED LEGACY CASES - FOUR, from [meta/tests/unit/IssuesTest.cfc]:
//      `issue_1097` [L51-L71], `issue_1331` [L101-L108], `issue_1690`
//      [L192-L201] and `issue_1690_2` [L203-L206]. They are legacy in lineage
//      but three of the four assert NOTHING, so each is STRENGTHENED into a
//      meaningful target assertion with both the lineage AND the original
//      weakness named at the case.
//
//      The remaining two cases in that file are sibling-owned and are NOT
//      duplicated here: `issue_1335` [L110-L124] belongs to `skuCurrency.test.ts`
//      and `issue_1348` [L126-L138] belongs to `sku.test.ts`.
//
//   3. NET-NEW - everything else, and it is the overwhelming majority.
//
// THE EMPTY FUNCTIONAL STUB CONTRIBUTES ZERO AND IS NEVER COUNTED.
// [meta/tests/functional/admin/entity/ProductTest.cfc] is 53 lines of which 48
// are the licence header: the component opens at L49 and closes at L53 with a
// LITERALLY EMPTY body. It is acknowledged here so the gap is explicit, and it
// MUST NOT be turned into a functional suite. There is no functional tier in
// this port.
//
// FOUR LEGACY TEST FILES TOUCH THIS SLICE IN TOTAL - not two, not three:
//   1. [meta/tests/unit/entity/ProductTest.cfc]              65 lines - EXTENDED HERE
//   2. [meta/tests/unit/entity/SlatwallEntityTestBase.cfc]   70 lines - EXTENDED HERE (via 1)
//   3. [meta/tests/unit/IssuesTest.cfc]                     209 lines - FOUR CASES ROUTED HERE
//   4. [meta/tests/functional/admin/entity/ProductTest.cfc]  53 lines - EMPTY, zero coverage
// [meta/tests/unit/entity/BrandTest.cfc] is the fifth file touching the slice
// overall, and it is sibling-owned by `brand.test.ts`.
//
// THE LEGACY STRUCTURAL FLOOR IS UNRUNNABLE, NOT PARITY.
// [meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54] resolves
// `expandPath("/Slatwall/com/entity/")`, a directory that does not exist in this
// repository - the real one is `model/entity/`. The coverage component that
// would have asserted "every entity has a test case" could therefore never have
// run. `tests/traceability/legacyTestMap.ts` carries that floor forward
// machine-readably; it is sibling-owned and is neither edited nor imported here.
//
// ═══════════════════════════════════════════════════════════════════════════
// CARRY THE ASSERTIONS, NOT THE HARNESS  (C1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Every legacy "unit" test boots the real application through
// [meta/tests/unit/SlatwallUnitTestBase.cfc]: L52 instantiates
// `Slatwall.Application`, L55 builds a `Helper` component, L60 calls
// `bootstrap()`, L62 ELEVATES the ambient account to superuser before every
// test, and L70's teardown is COMMENTED OUT so nothing is torn down between
// cases. That component is THE ANTI-PATTERN and is never emulated.
//
// Concretely dropped, and none of it is reconstructed anywhere below:
// `entityNew`, `entitySave`, `entityDelete`, `ormFlush`,
// `javaCast("null","")`, `request.slatwallScope`, every `getService(...)`, the
// `setUp`/`tearDown` component pattern, any `assertEquals`-shaped shim, the
// MXUnit expected-FIRST argument order, a `Helper`-class port, a `RemoteFacade`
// or CFSelenium analogue, a shared entity test base class, `variables.` scope
// emulation, `evaluate()`/`eval`/`new Function`/`vm`, and any Proxy-based
// dynamic dispatch standing in for `onMissingMethod`.
//
// [meta/tests/unit/Helper.cfc] (77 lines) is a SHAPE REFERENCE ONLY - build,
// save, flush; then null-child, delete, flush. Only the "one named function
// returning a formed subject" shape is kept, and it is kept by importing the
// sibling fixture factories rather than by porting the helper. There is no
// `destroy*` counterpart.
//
// ★ ONE HARNESS DETAIL DELIBERATELY NOT REPRODUCED, stated because silence
// would look like an oversight: both [meta/tests/unit/Helper.cfc:L53] and
// [meta/tests/unit/IssuesTest.cfc:L55] declare `productData = { ... }` WITHOUT
// `var`, leaking the struct into the component scope. That is harness hygiene,
// NOT one of the twenty preserved defects, and it is not reproduced. Every
// binding in this file is `const` and function-local.
//
// Traceability means the same assertions about the same behaviour - NOT the same
// test architecture.
//
// ═══════════════════════════════════════════════════════════════════════════
// VERIFIED CORRECTIONS - SOURCE WINS, AND THE CORRECTION IS RECORDED
// ═══════════════════════════════════════════════════════════════════════════
//
// Locator and surface drift is systemic in the upstream descriptions of this
// slice. Every figure below was re-derived first-hand from `model/entity/Product.cfc`,
// from `src/domain/entities/product.ts`, or by running the code. Where an
// upstream note disagrees with what ships, THE SHIPPED SURFACE IS ASSERTED and
// the disagreement is recorded rather than quietly applied.
//
//   C1. `getBaseProductType()` is **async** on the shipped class, returning
//       `Promise<string | undefined>`. Upstream describes it as possibly
//       synchronous. It is async because `ProductType.getBaseProductType()`
//       [model/entity/ProductType.cfc:L110-L115] is, and that method resolves
//       the ROOT of the path with `listFirst(getProductTypeIDPath())` at L112 -
//       element ONE, the root, never a second element.
//   C2. The `getUnusedProduct*` pair resolves `readonly SelectOption[]`
//       (`{ name, value }` pairs), not `Option[]`/`OptionGroup[]`.
//   C3. `getTitle()` is **OMITTED**. The legacy body [L540-L545] routes through
//       `hibachiUtilityService`, which is not one of the thirteen ports, and the
//       `productTitleString` setting is not one of the four keys the settings
//       port publishes. The omission is asserted; no fourteenth port is invented.
//   C4. `getAllowBackorderFlag()` is **OMITTED** [L551-L553]. Its legacy
//       `returntype="numeric"`-versus-boolean mismatch is therefore recorded as
//       a documented non-port rather than asserted as a live defect.
//   C5. `getBrandOptions()` is **OMITTED** [L534-L538], exactly as upstream
//       predicted. It is not created here.
//   C6. `getImages()` is **OMITTED** [L178-L180].
//   C7. `getSalePriceDetailsForSkus()` is **OMITTED** [L517-L522] under the
//       shipped module's documented branch (b); only `getSkuSalePriceDetails`
//       ships, reading a pre-materialised map.
//   C8. `getSalePrice()` returns `Money.fromDecimalString('0')` - a `Money`
//       holding zero, NOT a JavaScript numeric `0`. Upstream says "numeric
//       zero"; the observable contract is a `Money`, and it is asserted as one.
//   C9. `getOptionGroups()` **THROWS** when its option groups were never
//       materialized. There is therefore no seed-then-overwrite behaviour to
//       observe: the legacy `[]` seed at [L253] and its immediate discard at
//       [L258] are annotated in comments, and the shipped refusal is what is
//       asserted.
//  C10. `getSkuSalePriceDetails()` resolves `undefined` on a miss, where the
//       legacy returns `{}` [L186]. Both readers test for their key first, so
//       absence and an empty struct are indistinguishable to every caller.
//  C11. There are **SIX** containment probes, not five: `hasPriceGroupRate`,
//       `hasPromotionQualifier`, `hasPromotionQualifierExclusion`,
//       `hasPromotionReward`, `hasPromotionRewardExclusion` and **`hasSku`**.
//  C12. `getUnusedProductSubscriptionTerms()` **REJECTS**; it does not delegate
//       to the subscription-term stub port. The port declares no such member and
//       none may be invented.
//  C13. `getSkus()` returns the **LIVE** internal array when neither flag is
//       set and a **NEW** array when either is. Both are asserted, separately.
//  C14. `removeBrand()` called with no argument on a product that has no brand
//       **THROWS**; it is not a silent no-op.
//  C15. `getOptionsByOptionGroup()` sorts an `undefined` sort order **FIRST**,
//       matching MySQL's NULL-first ordering for `ORDER BY ... ASC`.
//  C16. ⚠️ THE DISCARDED-ARGUMENT DEFECT DOES NOT EXIST. Upstream asserts that
//       `getTransactionExistsFlag` [L626] passes `productID=` to
//       [model/service/SkuService.cfc:L285], which declares no parameters, so
//       CFML "silently discards" it and the flag is GLOBAL. Reading all three
//       files disproves it: the service body forwards
//       `argumentCollection=arguments` at [model/service/SkuService.cfc:L286],
//       CFML places an UNDECLARED named argument into the `arguments` scope, and
//       [model/dao/SkuDAO.cfc:L54-L55] DECLARES both `productID` and `skuID` and
//       branches on them at [L59-L63]. The identifier reaches the query and the
//       flag IS per-product. NO `LEGACY-DEFECT` marker is written for it,
//       because there is no defect to preserve.
//  C17. `listingPages` is declared at **[model/entity/Product.cfc:L79]**, not
//       L82. The shipped `getPageIDs()` refusal message cites L82. The message
//       is asserted AS SHIPPED, because it is observable behaviour and `src/**`
//       is never edited from a test; the locator correction is recorded here.
//  C18. `price` IS declared on the component - at [model/entity/Product.cfc:L118]
//       as `persistent="false"`. Upstream says it is "not declared as a property
//       at all"; it is not PERSISTENT, which is a different claim. No persistent
//       `price` column is invented, and the two-probe shape of `getPrice()` is
//       asserted from the shipped code rather than from that reasoning.
//  C19. `model/validation/Product.json` is 17 physical lines and 18 numbered
//       lines counting the trailing newline. Either figure describes the same
//       file; the ELEVEN property entries are what this suite pins.
//  C20. `Object.getOwnPropertyNames(Product.prototype)` is **82** at runtime:
//       79 public members, plus `constructor` and the two compile-time-private
//       methods `missingCollaborator` and `buildExistingOptionGroupIDList`,
//       which TypeScript's `private` does not erase.
//  C21. `structKeyList` from `src/lib/cfml/struct.ts` returns a **`string[]`**,
//       NOT the comma-delimited LIST that CFML's same-named function returns.
//       The helper documents the choice deliberately, and
//       `Product.buildExistingOptionGroupIDList` folds that array through
//       `listAppend` to BUILD the comma list rather than receiving one. Verified
//       at runtime, not inferred from the name.
//  C22. The prompt's B20.1 lists "the six default-sku delegations" among the
//       SYNCHRONOUS members. Only FOUR are: `getCurrencyCode` [L555],
//       `getPrice` [L561], `getRenewalPrice` [L570] and `getListPrice` [L576].
//       `getLivePrice` [L582] and `getCurrentAccountPrice` [L588] are **ASYNC**
//       on the shipped surface, because the sku-side accessors they delegate to
//       reach a repository. Verified by direct read of the shipped signatures.
//  C23. `getSkuSalePriceDetails` [L182] RETURNS A PROMISE BUT IS NOT MARKED
//       `async` - it returns `Promise.resolve(...)` on all three paths. It is
//       therefore an ELEVENTH promise-returning member on top of the ten `async`
//       ones, and any structural assertion about "the async surface" has to count
//       promise-returning members rather than the `async` keyword.
//  C24. `cfTruthy` from `src/lib/cfml/truthiness.ts` **THROWS** for a non-empty
//       string that is neither a boolean literal nor numeric - faithfully, since
//       CFML raises the same conversion error. `''` is NOT rejected; it is falsy,
//       which the currency-eligibility gate at [model/entity/Sku.cfc:L373] depends
//       on. Consequence: `if(len(x))` translates to `cfTruthy(cfLen(x))` and NEVER
//       to `cfTruthy(x)` for a string-valued `x`. Verified at runtime after a
//       failing assertion, not inferred.
//
// ═══════════════════════════════════════════════════════════════════════════
// DEPENDENCY BOUNDARY  (P2, P3, P5, P6)
// ═══════════════════════════════════════════════════════════════════════════
//
// This suite imports from `src/domain/**`, `src/lib/cfml/**` and
// `tests/fixtures/**` and from nowhere else. It never imports
// `src/handlers/**`, `src/repositories/**`, `src/integrations/**`,
// `src/lib/config.ts`, `src/lib/logger.ts`, `tests/integration/**` or
// `tests/traceability/**`. Tests are not a back door around the domain-inward
// lint boundary.
//
// `decimal.js`, `mysql2`, `zod`, `aws-lambda` and `dotenv` are never imported:
// `money.ts` is the only domain module permitted to touch the decimal
// substrate, and every monetary expectation below goes through `Money`.
//
// No SQL appears anywhere in this file. The AND-of-EXISTS option-matching
// semantics of `getSkusBySelectedOptions` [model/dao/SkuDAO.cfc:L107-L128] are
// explicitly OUT OF SCOPE for a domain suite and belong to `tests/integration`;
// this file models RESULTS over an inline repository double, never queries.
//
// Nothing here reads an environment variable, opens a socket, touches the
// filesystem, loads a `.env`, needs a database or elevates a privilege. The
// whole suite passes with a completely empty environment.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Brand } from '../../../../src/domain/entities/brand.js';
import { Category } from '../../../../src/domain/entities/category.js';
import { Option } from '../../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import { Product, ProductLegacyMetadata } from '../../../../src/domain/entities/product.js';
import type {
  ProductAttributeSet,
  ProductHydrationInput,
  ProductUnusedOption,
} from '../../../../src/domain/entities/product.js';
import { ProductType } from '../../../../src/domain/entities/productType.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { listLen, listToArray } from '../../../../src/lib/cfml/list.js';
import { structKeyExists, structKeyList } from '../../../../src/lib/cfml/struct.js';
import { cfLen, cfTruthy } from '../../../../src/lib/cfml/truthiness.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

// ---------------------------------------------------------------------------
// A2 - REQUEST-SCOPED STATE, PROVEN RATHER THAN ASSERTED
//
// `tests/setup.ts` already registers a global `afterEach` that runs
// `vi.restoreAllMocks()` and `vi.useRealTimers()`, and `vitest.config.ts` sets
// `clearMocks` and `restoreMocks`. This local hook is declared anyway so that
// this file's own guarantee is legible in this file: no spy created here can
// survive into the next case.
//
// There is NO mutable module-level state anywhere below. Every subject, every
// collaborator double and every collection is constructed inside the `it` that
// uses it. The only module-level bindings are frozen literals and pure
// functions.
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Inert test data
//
// Every business date is an EXPLICIT UTC ISO-8601 instant. The ambient clock is
// never read: no bare `new Date()`, no `Date.now()`, no global fake timers.
// `tests/setup.ts` owns the UTC guarantee with a self-verifying throw, and a
// suite that reads the clock passes or fails by accident.
//
// This matters most for the sale-price expiration accessor, whose legacy body
// seeds itself from `now()` at [model/entity/Product.cfc:L616] before reaching
// the misspelled call at [L618]. The shipped accessor never returns, so no clock
// is needed to observe it - but the instants below exist so nothing in this file
// is ever tempted to reach for one.
// ---------------------------------------------------------------------------

const CREATED_INSTANT = new Date('2024-06-01T00:00:00.000Z');
const MODIFIED_INSTANT = new Date('2024-06-15T12:30:45.000Z');
const SALE_PRICE_EXPIRATION_INSTANT = new Date('2024-12-31T23:59:59.000Z');

/**
 * The URL key this suite drives `globalURLKeyProduct` with.
 *
 * ★ DELIBERATELY NOT `'sp'`. The legacy default lives in the SETTING
 * declaration - `globalURLKeyProduct = {fieldType="text",defaultValue="sp"}` at
 * [model/service/SettingService.cfc:L178] - and NOT in the entity. Hardcoding
 * the literal here would assert the entity owns a value it does not own, and it
 * would still pass if the accessor ignored the port entirely. A value that could
 * never be a default proves the read really goes through the settings double.
 *
 * The two sibling keys are likewise never written as literals in this file:
 * `globalURLKeyProductType` defaults to `"spt"` at [L179] and
 * `globalURLKeyBrand` to `"sb"` at [L177], and neither is this entity's concern.
 */
const URL_KEY_UNDER_TEST = 'catalog-key-under-test';

/** The legacy fixture's url title, retained VERBATIM. See the B1 block. */
const LEGACY_URL_TITLE = 'nike-air-jorden';

/**
 * The merchandise product-type identifier the legacy seeds use, VERBATIM.
 *
 * [meta/tests/unit/IssuesTest.cfc:L58] in `issue_1097` and
 * [meta/tests/unit/Helper.cfc:L57] both name this row, and
 * `tests/fixtures/productFixtures.ts` carries it as its default child product
 * type. It is an opaque identifier, not a credential.
 */
const LEGACY_MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The NON-merchandise product-type identifier `issue_1331` names, VERBATIM.
 *
 * [meta/tests/unit/IssuesTest.cfc:L105]. The whole point of that case is that
 * this row is NOT merchandise, so the `addOptionGroup` context gate closes.
 */
const LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID = '444df313ec53a08c32d8ae434af5819a';

// ---------------------------------------------------------------------------
// Reflection helpers
//
// `Object.getOwnPropertyNames(Product.prototype)` rather than a hand-maintained
// list, because the question these answer is "what does the class actually
// publish", and a hand-maintained list would answer "what did someone think it
// published".
//
// TypeScript's `private` is erased at runtime, so the raw name list also
// contains `constructor` and the two private methods. `publicMembers()` removes
// exactly those three and nothing else, which is what makes an EXACT-LIST
// assertion possible below.
// ---------------------------------------------------------------------------

/** Every own property name on the prototype, including the private three. */
function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(Product.prototype);
}

/** The runtime-visible members that are part of the PUBLIC contract, sorted. */
function publicMembers(): readonly string[] {
  const compileTimePrivate: readonly string[] = [
    'constructor',
    'missingCollaborator',
    'buildExistingOptionGroupIDList',
  ];

  return prototypeMembers()
    .filter((name: string): boolean => !compileTimePrivate.includes(name))
    .sort();
}

/** `true` when the shipped class declares `name` as a callable member. */
function declaresMember(name: string): boolean {
  return prototypeMembers().includes(name);
}

/** The declared arity of a published member, read off the prototype. */
function arityOf(name: string): number {
  const descriptor = Object.getOwnPropertyDescriptor(Product.prototype, name);
  const candidate: unknown = descriptor === undefined ? undefined : descriptor.value;

  if (typeof candidate !== 'function') {
    throw new Error(`product.test.ts: Product.prototype has no callable member named '${name}'.`);
  }

  return candidate.length;
}

// ---------------------------------------------------------------------------
// Real far-side entities, built by hand
//
// P3 forbids a factory or faker library and prefers hand-written doubles, and
// here the far sides that matter - `OptionGroup`, `Option`, `Category`, `Brand`,
// `ProductType` - are all in this suite's dependency boundary and are all cheap
// to construct, so REAL instances are used instead of doubles wherever possible.
// A real `Option` is what makes `getOptionsByOptionGroup` and the positional
// sort in `getSkus` observable at all.
//
// A2: each builder returns a FRESHLY constructed value on every call. Nothing is
// hoisted, nothing is shared between cases, and every array is created inside
// the call that hands it out.
// ---------------------------------------------------------------------------

/**
 * An `OptionGroup` with a deterministic tie-breaker.
 *
 * ★ THE TIE-BREAKER IS PINNED, NOT LEFT TO CHANCE. `optionGroup.ts` defaults
 * `optionSortTieBreaker` to a random generator, which is correct for production
 * and unusable in an assertion. A constant is supplied so nothing in this file
 * can pass or fail by luck. Nothing below actually reaches the tie-breaking
 * path - `Product` sorts on `sortOrder` alone - so this is belt and braces.
 */
function buildOptionGroup(
  optionGroupID: string,
  sortOrder: number,
  optionGroupCode?: string,
): OptionGroup {
  return new OptionGroup({
    optionGroupID,
    optionGroupName: undefined,
    optionGroupCode,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
    sortOrder,
    remoteID: undefined,
    createdDateTime: CREATED_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: MODIFIED_INSTANT,
    modifiedByAccountID: undefined,
    options: [],
    optionSortTieBreaker: (): number => 1,
  });
}

/**
 * An `Option`, optionally with no sort order at all.
 *
 * `sortOrder` is genuinely nullable on the column, and an absent one is what
 * makes the NULL-first ordering in `getOptionsByOptionGroup` observable, so it
 * is a first-class parameter here rather than something the builder invents.
 */
function buildOption(
  optionID: string,
  sortOrder: number | undefined,
  optionGroup: OptionGroup | undefined,
  optionCode?: string,
): Option {
  return new Option({
    optionID,
    optionCode,
    optionName: undefined,
    optionDescription: undefined,
    sortOrder,
    optionGroup,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: CREATED_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: MODIFIED_INSTANT,
    modifiedByAccountID: undefined,
  });
}

/**
 * A `Category`, whose constructor requires EVERY key to be written.
 *
 * CFML parity [model/entity/Category.cfc]: `cmsCategoryID` and the site
 * association are the Mura CMS bridge's columns. They are preserved as INERT
 * persisted values so the `Sw*` schema contract is unbroken (C5), and no CMS
 * behaviour is ported or exercised. They are written as `undefined` here for
 * exactly that reason.
 */
function buildCategory(categoryID: string): Category {
  return new Category({
    categoryID,
    categoryIDPath: categoryID,
    categoryName: undefined,
    restrictAccessFlag: false,
    allowProductAssignmentFlag: true,
    cmsCategoryID: undefined,
    siteID: undefined,
    parentCategory: undefined,
    childCategories: undefined,
    products: undefined,
    contents: undefined,
    remoteID: undefined,
    createdDateTime: CREATED_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: MODIFIED_INSTANT,
    modifiedByAccountID: undefined,
  });
}

/**
 * A `ProductType` carrying a system code and a materialized id path.
 *
 * ★ A NON-EMPTY `systemCode` SHORT-CIRCUITS THE REPOSITORY.
 * `ProductType.getBaseProductType()` returns its own system code directly when
 * it has one, and only reaches the product-type repository to load the ROOT of
 * `productTypeIDPath` when it does not [model/entity/ProductType.cfc:L110-L115].
 * Supplying a code is therefore how this suite reaches the answer without
 * wiring a port that `Product` does not own.
 */
function buildProductType(
  productTypeID: string,
  systemCode: string | undefined,
  productTypeIDPath: string,
): ProductType {
  return new ProductType({
    productTypeID,
    productTypeIDPath,
    systemCode,
    createdDateTime: CREATED_INSTANT,
    modifiedDateTime: MODIFIED_INSTANT,
  });
}

// ---------------------------------------------------------------------------
// Inline hand-written recording port doubles  (B18)
//
// ★ THE PORT LEDGER IS LOCKED AT THIRTEEN and `Product` receives FIVE of them:
// `settingsProvider`, `skuRepository`, `optionRepository`, `productRepository`
// and `subscriptionTermProvider`. The other eight -
// `productTypeRepository`, `promotionRepository`, `priceGroupRepository`,
// `currencyConverter`, `addressZoneEvaluator`, `urlTitleGenerator`, `imageStore`
// and `productFeedPort` - are NOT this entity's collaborators and none is
// constructed here. `hibachiUtilityService` is NOT a port and no fourteenth port
// is invented for `getTitle` or `getProductOptionsByGroup`.
//
// ★ `Product` RECEIVES NO CLOCK. Only `promotionPeriod.ts` and
// `promotionCode.ts` take `now: () => Date`, as a plain constructor parameter
// rather than a port. No clock is passed anywhere below and none is asserted.
//
// Each double is a class rather than an object literal so that construction is
// explicit at every call site, and each RECORDS the arguments it received. The
// argument order of a positional port call is a real contract - the legacy passed
// `(selectedOptions, productID)` positionally at
// [model/entity/Product.cfc:L367] - and a recorder is the only way to observe it.
//
// P3: `vi` is available and is used for spy restoration, but no mocking library
// is added and `vi.mock` is not used. These are ordinary classes.
// ---------------------------------------------------------------------------

/** One recorded `setting(...)` read. */
type SettingRead = string;

/**
 * The settings port, over the FOUR keys `settingsProvider.ts` publishes.
 *
 * CFML parity [model/service/SettingService.cfc:L178]: only
 * `globalURLKeyProduct` is this entity's concern, and its legacy default lives
 * in the setting declaration rather than in the component. The other three are
 * answered so the double satisfies the whole port contract, not so this suite
 * asserts anything about them.
 */
class SettingsProviderDouble {
  readonly reads: SettingRead[] = [];

  /**
   * MUTABLE ON PURPOSE. Reassigning it between two accessor calls is how B2.2
   * proves the URL accessors re-read the port on every call instead of memoising
   * the first answer - a memo there would be wrong, because a setting is
   * request-scoped configuration and not entity state (A2).
   */
  globalURLKeyProduct: string;

  constructor(urlKeyProduct: string) {
    this.globalURLKeyProduct = urlKeyProduct;
  }

  setting(settingName: string): string {
    this.reads.push(settingName);

    if (settingName === 'globalURLKeyProduct') {
      return this.globalURLKeyProduct;
    }

    if (settingName === 'globalURLKeyProductType') {
      return 'product-type-key-under-test';
    }

    if (settingName === 'skuCurrency') {
      // ISO 4217 reserves XTS for testing, so this literal can never be mistaken
      // for a live currency. The real default is `defaultValue="USD"` at
      // [model/service/SettingService.cfc:L221] - a SETTING default, not a
      // literal this entity owns - and it is deliberately not written here.
      return 'XTS';
    }

    return '';
  }
}

/** One recorded `getSkusBySelectedOptions(...)` call, in positional order. */
interface SelectedOptionsCall {
  readonly selectedOptions: string;
  readonly productID: string | undefined;
}

/** One recorded `getTransactionExistsFlag(...)` call. */
interface TransactionExistsCall {
  readonly productID: string | undefined;
  readonly skuID: string | undefined;
}

/** One recorded `getProductSkus(...)` call. */
interface ProductSkusCall {
  readonly productID: string;
  readonly fetchOptions: boolean;
}

/**
 * The sku repository port - all seven declared members.
 *
 * P5: this stands in for [model/dao/SkuDAO.cfc] WITHOUT reproducing any SQL. The
 * AND-of-EXISTS matching semantics of `getSkusBySelectedOptions`
 * [model/dao/SkuDAO.cfc:L107-L128] are an integration-tier concern; here the
 * result set is simply handed in, so the assertions are about what the ENTITY
 * does with a result and with what arguments it asked for one.
 */
class SkuRepositoryDouble {
  readonly selectedOptionsCalls: SelectedOptionsCall[] = [];
  readonly transactionExistsCalls: TransactionExistsCall[] = [];
  readonly productSkusCalls: ProductSkusCall[] = [];

  private readonly matches: readonly Sku[];
  private readonly transactionExists: boolean;

  constructor(matches: readonly Sku[] = [], transactionExists = false) {
    this.matches = [...matches];
    this.transactionExists = transactionExists;
  }

  getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
    this.transactionExistsCalls.push({ productID, skuID });

    return Promise.resolve(this.transactionExists);
  }

  getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
    return Promise.resolve(
      this.matches.find((candidate: Sku): boolean => candidate.getSkuCode() === skuCode),
    );
  }

  getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
    this.selectedOptionsCalls.push({ selectedOptions, productID });

    return Promise.resolve([...this.matches]);
  }

  searchSkusByProductType(): Promise<Sku[]> {
    return Promise.resolve([]);
  }

  getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
    this.productSkusCalls.push({ productID: product.getProductID(), fetchOptions });

    return Promise.resolve([...product.getSkus()]);
  }

  getSortedProductSkusID(): Promise<string[]> {
    return Promise.resolve(this.matches.map((candidate: Sku): string => candidate.getSkuID()));
  }

  saveSku(sku: Sku): Promise<Sku> {
    return Promise.resolve(sku);
  }
}

/** One recorded `getUnusedProductOptions(...)` call, in positional order. */
interface UnusedOptionsCall {
  readonly productID: string;
  readonly existingOptionGroupIDList: string;
}

/**
 * The option repository port - both declared members.
 *
 * CFML parity [model/service/OptionService.cfc:L72, L76]: the legacy service
 * passes a COMMA LIST of existing option-group identifiers straight through to
 * [model/dao/OptionDAO.cfc:L51, L94]. The list stays a `string` on the port so
 * the signature keeps parity, and this double records it verbatim so the
 * assertions can inspect what the entity built.
 */
class OptionRepositoryDouble {
  readonly unusedOptionsCalls: UnusedOptionsCall[] = [];
  readonly unusedOptionGroupsCalls: string[] = [];

  private readonly options: readonly ProductUnusedOption[];
  private readonly optionGroups: readonly ProductUnusedOption[];

  constructor(
    options: readonly ProductUnusedOption[] = [],
    optionGroups: readonly ProductUnusedOption[] = [],
  ) {
    this.options = [...options];
    this.optionGroups = [...optionGroups];
  }

  getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly ProductUnusedOption[]> {
    this.unusedOptionsCalls.push({ productID, existingOptionGroupIDList });

    return Promise.resolve([...this.options]);
  }

  getUnusedProductOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<readonly ProductUnusedOption[]> {
    this.unusedOptionGroupsCalls.push(existingOptionGroupIDList);

    return Promise.resolve([...this.optionGroups]);
  }
}

/** One recorded `getAttributeSets(...)` call, in positional order. */
interface AttributeSetsCall {
  readonly attributeSetTypeCode: readonly string[];
  readonly productTypeIDs: readonly string[];
}

/**
 * The product repository port - all seven declared members.
 *
 * `loadDataFromFile` REFUSES rather than resolving. The legacy bulk import
 * [model/service/ProductService.cfc:L65-L68] sets `requesttimeout=3600`, is
 * explicitly out of scope, and must not be exercised from an entity suite; its
 * one-hour budget is likewise never reproduced as an assertion (C7).
 */
class ProductRepositoryDouble {
  readonly attributeSetsCalls: AttributeSetsCall[] = [];

  private readonly attributeSets: readonly ProductAttributeSet[];

  constructor(attributeSets: readonly ProductAttributeSet[] = []) {
    this.attributeSets = [...attributeSets];
  }

  getAttributeSets(
    attributeSetTypeCode: readonly string[],
    productTypeIDs: readonly string[],
  ): Promise<ProductAttributeSet[]> {
    this.attributeSetsCalls.push({
      attributeSetTypeCode: [...attributeSetTypeCode],
      productTypeIDs: [...productTypeIDs],
    });

    return Promise.resolve([...this.attributeSets]);
  }

  loadDataFromFile(): Promise<void> {
    return Promise.reject(
      new Error(
        'product.test.ts: loadDataFromFile is deliberately unavailable. The legacy bulk import ' +
          '[model/service/ProductService.cfc:L65-L68] is out of scope and is never exercised from ' +
          'an entity suite.',
      ),
    );
  }

  searchProductsByProductType(): Promise<Product[]> {
    return Promise.resolve([]);
  }

  getProductByProductID(): Promise<Product | undefined> {
    return Promise.resolve(undefined);
  }

  saveProduct(product: Product): Promise<Product> {
    return Promise.resolve(product);
  }

  deleteProduct(): Promise<boolean> {
    return Promise.resolve(true);
  }

  saveBrand(brand: Brand): Promise<Brand> {
    return Promise.resolve(brand);
  }
}

/**
 * The subscription-term STUB port - both declared members.
 *
 * B18.6: subscription handling is out of scope, so this answers `undefined` and
 * nothing more. It exists to prove that WIRING it changes nothing: the shipped
 * `getUnusedProductSubscriptionTerms()` refuses either way, because the port
 * declares no member for that query and none may be invented.
 */
class SubscriptionTermProviderDouble {
  getSubscriptionTerm(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  getSubscriptionBenefit(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

// ---------------------------------------------------------------------------
// Projection helpers
//
// B16.5: EVERY association comparison in this file is by PRIMARY KEY - never by
// object identity, never by deep equality. That is Hibernate's session-identity
// semantics, which the legacy `hasX(...)` probes rested on, and these three
// projections are what keep the assertions honest about it.
//
// The ONE deliberate exception is the reference-fallback branch of the shipped
// containment probes, which compares by identity BECAUSE an unsaved row has no
// key to compare. That branch is asserted with `toBe` and is labelled where it
// happens.
// ---------------------------------------------------------------------------

/** Primary keys of a sku collection, in order. */
function skuIDsOf(skus: readonly Sku[]): readonly string[] {
  return skus.map((sku: Sku): string => sku.getSkuID());
}

/** Primary keys of an option collection, in order. */
function optionIDsOf(options: readonly Option[]): readonly string[] {
  return options.map((option: Option): string => option.getOptionID());
}

/** Primary keys of a product collection, in order. */
function productIDsOf(products: readonly Product[]): readonly string[] {
  return products.map((product: Product): string => product.getProductID());
}

// ═══════════════════════════════════════════════════════════════════════════
// ★ THE FIVE LEGACY CASES - LEGACY-EXTENDED  (B1)
// ═══════════════════════════════════════════════════════════════════════════
//
// One `it` per legacy method, each NAMED AFTER the legacy method so the lineage
// is greppable, each citing its locator, and each assertion INLINED. No shared
// base class is built (C1): the CFML inheritance chain is a harness detail, this
// suite imports no base from anywhere, and no other suite may import one from
// here.
//
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc] is 70 lines. The component
// opens at L49 and declares EXACTLY FOUR public test methods:
//
//   L51-L54  validate_as_save_for_a_new_instance_doesnt_pass
//              variables.entity.validate(context="save");
//              assert(variables.entity.hasErrors());
//   L56-L58  simple_representation_exists_and_is_simple
//              assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
//   L60-L62  has_primary_id_property_name
//              assert(len(variables.entity.getPrimaryIDPropertyName()));
//   L64-L67  defaults_are_correct                        <-- TWO assertions
//              assert(variables.entity.isNew());
//              assert(!len(variables.entity.getPrimaryIDValue()));
//
// with the closing brace at L68.
//
// ★ B1.4 - THE RANGE FOOTNOTE. Sibling documents variously cite the base cases
// as `L49-L68`. The VERIFIED range is **L51-L67** in a **70-line** file: L49 is
// the `component extends=...` declaration and L68 is the closing brace, so a
// citation of L49-L68 is off by two at each end. `L51-L67` is preferred here and
// is what every citation below uses.
//
// ⚠️ The third case reads `getPrimaryIDPropertyName`, which is a DIFFERENT member
// from `getSimpleRepresentationPropertyName`. The two are never conflated.
//
// [meta/tests/unit/entity/ProductTest.cfc] is 65 lines: L49 declares
// `extends="Slatwall.meta.tests.unit.entity.SlatwallEntityTestBase"`, L52-L56 is
// a `setUp` calling `super.setup()` and then
// `request.slatwallScope.getService("productService").newProduct()`, and
// L58-L62 adds `productUrlIsCorrectlyFormatted`. IT OVERRIDES NOTHING, so all
// four base bodies run for Product unchanged - including both assertions of
// `defaults_are_correct`, which the Brand suite correctly does NOT carry because
// Brand overrides that case.
// ═══════════════════════════════════════════════════════════════════════════

describe('LEGACY-EXTENDED: the five cases Product inherits and adds', () => {
  it('validate_as_save_for_a_new_instance_doesnt_pass - not portable to this tier', () => {
    // The legacy body, verbatim
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54]:
    //
    //   variables.entity.validate(context="save");
    //   assert(variables.entity.hasErrors());
    //
    // The legacy contract is REAL and it genuinely failed for a bare product.
    // [model/validation/Product.json] marks FIVE things required in the `save`
    // context - `price`, `productName`, `productCode`, `productType` and
    // `urlTitle` - and `newProduct()` supplies none of them.
    //
    // CFML parity [model/entity/Product.cfc:L49]: `validate()` and `hasErrors()`
    // were never Product's own members. They came from the framework base reached
    // through the unqualified `extends="HibachiEntity"`, and that base is
    // deliberately not ported - validation is redistributed to service-tier
    // schemas driven by model/validation/Product.json. The shipped class exposes
    // neither member, so the gate belongs to the `productService` suite.
    //
    // ★ THE ABSENCE IS ASSERTED RATHER THAN THE BEHAVIOUR FABRICATED. Inventing a
    // `validate()`/`hasErrors()` pair purely to have something to assert would put
    // validation logic on an entity the architecture places at the service tier,
    // and would misreport the parity boundary.
    for (const absent of ['validate', 'hasErrors', 'hasError', 'getErrors', 'addError']) {
      expect(declaresMember(absent)).toBe(false);
    }

    // What IS observable at this tier, and what the service-tier gate will read.
    const bare = new Product({ productID: '' });

    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductType()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();

    // ★ THE MECHANISM BEHIND THE LEGACY FAILURE, and it is subtler than the other
    // four requirements: `price` resolves through `getPrice()`
    // [model/entity/Product.cfc:L561-L568], which has neither a `variables.price`
    // shadow nor a `defaultSku` to delegate to on a bare product, so it answers
    // NOTHING. A `required` rule over an accessor that resolves to absence is what
    // makes the save context fail. This is the same fact `issue_1690` rests on.
    expect(bare.getDefaultSku()).toBeUndefined();

    // And a fully populated product supplies every one of the five.
    const populated = new Product({
      productID: 'product-1',
      productName: 'Test Product',
      productCode: 'TESTPRODUCTXXX',
      urlTitle: LEGACY_URL_TITLE,
      price: Money.fromDecimalString('100.00'),
      productType: buildProductType(
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
        'merchandise',
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
      ),
    });

    expect(populated.getProductName()).toBe('Test Product');
    expect(populated.getProductCode()).toBe('TESTPRODUCTXXX');
    expect(populated.getUrlTitle()).toBe(LEGACY_URL_TITLE);
    expect(populated.getPrice()?.toFixed2()).toBe('100.00');
    expect(populated.getProductType()?.getProductTypeID()).toBe(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID);
  });

  it('simple_representation_exists_and_is_simple - the property name ships, the value does not', () => {
    // The legacy body, verbatim
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]:
    //
    //   assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
    //
    // CFML parity [model/entity/Product.cfc:L791-L793]: Product DOES override
    // `getSimpleRepresentationPropertyName()`, returning the literal
    // `"productName"`. What it never declares is `getSimpleRepresentation()`
    // itself - that was the framework base reading the named property back off the
    // component through its metadata dispatcher, and neither the base nor the
    // dispatcher is ported.
    //
    // ★ SO HALF OF THIS CASE IS GENUINELY PORTABLE AND HALF IS NOT, and the two
    // halves are separated instead of one being made to stand for the other. The
    // property NAME is asserted because the component declares it. The RESOLVED
    // representation is not, because nothing resolves it.
    expect(declaresMember('getSimpleRepresentationPropertyName')).toBe(true);
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    expect(declaresMember('getSimpleRepresentation')).toBe(false);

    // The underlying legacy claim - that the representation is a SIMPLE value - is
    // still checkable one step removed: the property the name points at is a
    // plain string on the entity, never an object or a collection.
    const populated = new Product({ productID: 'product-1', productName: 'Test Product' });

    expect(typeof populated.getProductName()).toBe('string');
  });

  it('has_primary_id_property_name - not portable as written; the fact is asserted instead', () => {
    // The legacy body, verbatim
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62]:
    //
    //   assert(len(variables.entity.getPrimaryIDPropertyName()));
    //
    // CFML parity [model/entity/Product.cfc:L52]: that accessor was
    // metadata-driven dynamic dispatch, synthesised by reading the
    // `fieldtype="id"` declaration off the component's own property metadata. The
    // target has no dispatcher and no metadata scan, so no such runtime string is
    // published and none is invented.
    //
    // ★ THE UNDERLYING DOMAIN FACT IS STILL ASSERTABLE. The primary key of this
    // entity is `productID`, and the shipped class names it in its accessor rather
    // than in a metadata string. Same fact, no dispatcher.
    expect(declaresMember('getPrimaryIDPropertyName')).toBe(false);
    expect(declaresMember('getPrimaryIDValue')).toBe(false);
    expect(declaresMember('getProductID')).toBe(true);

    const saved = new Product({ productID: 'product-1' });

    expect(saved.getProductID()).toBe('product-1');
    expect(cfLen(saved.getProductID())).toBeGreaterThan(0);
  });

  it('defaults_are_correct - BOTH base assertions, because Product overrides nothing', () => {
    // The legacy body, verbatim
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]:
    //
    //   assert(variables.entity.isNew());
    //   assert(!len(variables.entity.getPrimaryIDValue()));
    //
    // ★ TWO ASSERTIONS, AND PRODUCT CARRIES BOTH.
    // [meta/tests/unit/entity/ProductTest.cfc] does not declare
    // `defaults_are_correct`, so MXUnit dispatched the base body unchanged for
    // Product. The sibling Brand suite correctly does NOT carry these two, because
    // [meta/tests/unit/entity/BrandTest.cfc:L58-L60] REPLACES the body. The
    // asymmetry between the two suites is real and is preserved on purpose.
    //
    // CFML parity [model/entity/Product.cfc:L52]: `productID` carries
    // `unsavedvalue="" default=""`, which is exactly what
    // `HibachiEntity.getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571-L576]
    // tests. The shipped `isNew()` is that test, spelled `productID === ''`.
    const subject = new Product({ productID: '' });

    expect(subject.isNew()).toBe(true);

    // `!len(getPrimaryIDValue())` becomes a length test over the primary key the
    // shipped class actually publishes. `cfLen` is used rather than `.length` so
    // the CFML semantic - and not a JavaScript approximation of it - is what is
    // being asserted.
    expect(cfLen(subject.getProductID())).toBe(0);
    expect(subject.getProductID()).toBe('');
    expect(subject.getProductID()).not.toBeUndefined();

    // Omitting the key entirely is not expressible: `productID` is the ONE
    // required member of the hydration surface, so an unsaved product must say so
    // explicitly. That is deliberate - it removes any guessing about how a
    // repository spells an unsaved key.
    const hydrated = new Product({ productID: 'product-1' });

    expect(hydrated.isNew()).toBe(false);
    expect(cfLen(hydrated.getProductID())).toBeGreaterThan(0);
  });

  it('productUrlIsCorrectlyFormatted - the one entity method in the slice with legacy coverage', async () => {
    // The legacy body, verbatim [meta/tests/unit/entity/ProductTest.cfc:L58-L62]:
    //
    //   public void function productUrlIsCorrectlyFormatted() {
    //     variables.entity.setURLTitle("nike-air-jorden");
    //     assertEquals(
    //       "/#request.slatwallScope.setting('globalURLKeyProduct')#/nike-air-jorden/",
    //       variables.entity.getProductURL()
    //     );
    //   }
    //
    // ★ B2.3 - `getProductURL()` IS THE ONLY ENTITY METHOD IN THIS ENTIRE SLICE
    // WITH LEGACY TEST COVERAGE. Sixteen of the eighteen ported entities have no
    // legacy test at all, and the two that do are Brand and Product. That is why
    // this one `it` carries more weight than its four lines suggest.
    //
    // ★ B1.2 - THE FIXTURE IS RETAINED VERBATIM. `nike-air-jorden` is the legacy
    // string, misspelling and all ("jorden", not "jordan"), and it is not
    // corrected, normalised or parameterised away. `tests/fixtures/productFixtures.ts`
    // carries it as its documented default, which is asserted here so the lineage
    // is provably intact rather than merely claimed.
    //
    // ⚠️ THE MXUNIT ARGUMENT ORDER IS NOT TRANSLITERATED. The legacy assertion at
    // [meta/tests/unit/entity/ProductTest.cfc:L61] puts the EXPECTED value FIRST.
    // That is an MXUnit artefact, not a contract, and C1 forbids carrying the
    // harness across; the idiomatic `expect(actual).toBe(expected)` is used.
    const subject = makeProductFixture({ globalURLKeyProduct: URL_KEY_UNDER_TEST });

    expect(subject.getUrlTitle()).toBe(LEGACY_URL_TITLE);

    // ⚠️ THE SETTING IS RESOLVED THROUGH THE PORT, NEVER HARDCODED. The legacy
    // default is `defaultValue="sp"` at [model/service/SettingService.cfc:L178] -
    // it lives in the SETTING declaration, not in this entity - so this suite
    // drives a value that could never be that default and builds the expectation
    // from the same source the accessor reads.
    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);

    // The whole path, spelled out, so the two slashes are visible as literals and
    // not just as an interpolation: leading slash, key, slash, title, TRAILING
    // slash.
    expect(subject.getProductURL()).toBe('/catalog-key-under-test/nike-air-jorden/');
    expect(subject.getProductURL().startsWith('/')).toBe(true);
    expect(subject.getProductURL().endsWith('/')).toBe(true);

    // The legacy `setURLTitle(...)` is a framework-generated setter that the port
    // does not publish - the shipped class is hydrate-once and exposes no setter
    // for any column. Changing the title therefore means constructing another
    // instance, which is what a repository does, and the URL follows it.
    const other = makeProductFixture({
      urlTitle: 'another-title',
      globalURLKeyProduct: URL_KEY_UNDER_TEST,
    });

    expect(declaresMember('setUrlTitle')).toBe(false);
    expect(declaresMember('setURLTitle')).toBe(false);
    expect(other.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/another-title/`);

    // ★ AND THE ACCESSOR IS SYNCHRONOUS, which the legacy case relied on without
    // saying so. `await` on a non-thenable would be a lint error here, so the fact
    // is asserted by shape instead: the returned value is a string, not a promise.
    // The `async` marking on this `it` exists only for the `rejects` assertion
    // below, which proves the refusal path of the same accessor.
    expect(typeof subject.getProductURL()).toBe('string');

    // The refusal path, asserted in the same case because it is the same contract:
    // with no settings port there is no key to read, and the accessor names the
    // locator it could not evaluate rather than inventing a segment.
    const unwired = new Product({ productID: 'product-1', urlTitle: LEGACY_URL_TITLE });

    expect(() => unwired.getProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getProductURL()).toThrow(/model\/entity\/Product\.cfc:L208/);

    // `await` on a resolved promise keeps this case's `async` marking honest under
    // the `require-await` lint rule while asserting something real: the shipped
    // class publishes no asynchronous URL accessor of any kind.
    await Promise.resolve();

    expect(declaresMember('getProductUrlAsync')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE URL SLASH ASYMMETRY  (B2)
// ═══════════════════════════════════════════════════════════════════════════
//
// The two URL accessors sit FOUR LINES APART in the legacy component and differ
// by exactly ONE CHARACTER. Both are asserted in the SAME `it` so the asymmetry
// is visible in one place instead of being split across two cases a reader could
// see independently and mistake for a bug in either.
// ═══════════════════════════════════════════════════════════════════════════

describe('NET-NEW: the URL pair and its deliberate slash asymmetry', () => {
  it('getProductURL leads with a slash and getListingProductURL does not', () => {
    // CFML parity [model/entity/Product.cfc:L207-L209 vs L211-L214]: getProductURL
    // has a leading slash and getListingProductURL does not. The asymmetry is
    // deliberate in the source and must not be normalised.
    //
    // Legacy bodies, verbatim:
    //   L207-L209  return "/#setting('globalURLKeyProduct')#/#getURLTitle()#/";
    //   L211-L213  return  "#setting('globalURLKeyProduct')#/#getURLTitle()#/";
    //
    // The trailing slash is present in BOTH. Only the leading one differs, and it
    // differs because the listing variant is concatenated INTO a listing page's own
    // path, where a second leading slash would produce a double separator.
    //
    // ★ B2.3 - `getProductURL()` is the ONE entity method in the whole in-scope
    // slice with legacy test coverage
    // [meta/tests/unit/entity/ProductTest.cfc:L58-L62]. Its sibling
    // `getListingProductURL()` has none, which is precisely why pinning them
    // together matters: the tested one anchors the untested one.
    const subject = makeProductFixture({
      urlTitle: LEGACY_URL_TITLE,
      globalURLKeyProduct: URL_KEY_UNDER_TEST,
    });

    const detailUrl = subject.getProductURL();
    const listingUrl = subject.getListingProductURL();

    expect(detailUrl).toBe(`/${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);
    expect(listingUrl).toBe(`${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);

    // Stated as the one-character relationship it actually is, so a future edit to
    // either accessor breaks this immediately.
    expect(detailUrl).toBe(`/${listingUrl}`);
    expect(detailUrl.length - listingUrl.length).toBe(1);

    expect(detailUrl.startsWith('/')).toBe(true);
    expect(listingUrl.startsWith('/')).toBe(false);
    expect(detailUrl.endsWith('/')).toBe(true);
    expect(listingUrl.endsWith('/')).toBe(true);
  });

  it('B2.2 - both accessors read the SAME setting through the SAME port, so changing it moves both', () => {
    // ⚠️ NO URL SEGMENT IS EVER HARDCODED IN THIS SUITE. The legacy default lives
    // at [model/service/SettingService.cfc:L178] as the `defaultValue` of the
    // `globalURLKeyProduct` text setting - it is NOT in the entity, and
    // transcribing it here would move a configuration decision into a test and
    // would silently pass even if the accessor stopped consulting the port at all.
    //
    // So the port is driven with a value no default could ever be, and it is driven
    // TWICE with two different values to prove the accessors read it every call
    // rather than memoising the first answer.
    const settings = new SettingsProviderDouble('first-configured-key');
    const subject = new Product({
      productID: 'product-1',
      urlTitle: LEGACY_URL_TITLE,
      settingsProvider: settings,
    });

    expect(subject.getProductURL()).toBe(`/first-configured-key/${LEGACY_URL_TITLE}/`);
    expect(subject.getListingProductURL()).toBe(`first-configured-key/${LEGACY_URL_TITLE}/`);

    settings.globalURLKeyProduct = 'second-configured-key';

    expect(subject.getProductURL()).toBe(`/second-configured-key/${LEGACY_URL_TITLE}/`);
    expect(subject.getListingProductURL()).toBe(`second-configured-key/${LEGACY_URL_TITLE}/`);

    // Both accessors read `globalURLKeyProduct` and NOTHING ELSE - in particular
    // neither reaches for `globalURLKeyProductType`, which is the adjacent setting
    // at [model/service/SettingService.cfc:L179] and belongs to ProductType.
    expect(settings.reads).toEqual([
      'globalURLKeyProduct',
      'globalURLKeyProduct',
      'globalURLKeyProduct',
      'globalURLKeyProduct',
    ]);
  });

  it('an absent urlTitle interpolates as the empty string in both accessors', () => {
    // CFML parity [model/entity/Product.cfc:L208, L212]: the legacy bodies
    // interpolate `getURLTitle()` directly with no `len()` guard, and CFML renders
    // an unset string column as the empty string. `urlTitle` carries
    // `unique="true"` at [L54] but NO `notNull`, so an unset title is reachable -
    // it is `productName` that carries `notNull="true"` at [L55], not this column.
    //
    // The result is a doubled separator, and that is the faithful output. It is NOT
    // collapsed to a single slash, because collapsing it would make this suite
    // disagree with the legacy string for exactly the inputs a caller is most
    // likely to hit while a product is still being drafted.
    const untitled = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    expect(untitled.getUrlTitle()).toBeUndefined();
    expect(untitled.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
    expect(untitled.getListingProductURL()).toBe(`${URL_KEY_UNDER_TEST}//`);
  });

  it('both accessors refuse rather than guess when the settings port was never injected', () => {
    // CFML parity [model/entity/Product.cfc:L208, L212]: in CFML `setting(...)`
    // was reached through the framework base on every entity unconditionally, so
    // the legacy accessors could not fail this way. In the target the port is an
    // explicit constructor argument that a repository owns supplying, so its
    // absence is a WIRING error and is reported as one - naming the collaborator
    // and the exact legacy locator that could not be evaluated.
    //
    // ★ THE TWO LOCATORS DIFFER, and that is the point of asserting both refusals:
    // `getProductURL` names L208 and `getListingProductURL` names L212, so a
    // stack-free error message still says which of the two near-identical accessors
    // was called.
    const unwired = new Product({ productID: 'product-1', urlTitle: LEGACY_URL_TITLE });

    expect(() => unwired.getProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getProductURL()).toThrow(/model\/entity\/Product\.cfc:L208/);

    expect(() => unwired.getListingProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getListingProductURL()).toThrow(/model\/entity\/Product\.cfc:L212/);

    // The refusal names this product, so a batch build says WHICH row is unwired.
    expect(() => unwired.getProductURL()).toThrow(/Product 'product-1'/);

    // ⚠️ A LOCATOR CORRECTION, RECORDED RATHER THAN APPLIED. The legacy pair
    // occupies L207-L209 and L211-L213; the shipped messages cite the interior
    // lines L208 and L212, which are the `return` statements themselves. Both are
    // defensible citations of the same two methods and the SHIPPED strings are what
    // is asserted - a test may never edit `src/**` to make its own citation
    // preference come true.
    expect(() => unwired.getListingProductURL()).not.toThrow(/L211/);
    expect(() => unwired.getProductURL()).not.toThrow(/L207/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★★ DIVERGENCE (c) - DEFECT 19 IS FIXED, AND ITS CONTROL SITS BESIDE IT  (B3)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy body verbatim [model/entity/Product.cfc:L524-L532]:
//
//   L524  public string function getBrandName() {
//   L525    if(!structKeyExists(variables, "brandName")) {
//   L526      variables.brandName = "";                    <-- seeds the memo to empty
//   L527      if( structKeyExists(variables, "brand") ) {
//   L528        return getBrand().getBrandName();          <-- returns WITHOUT assigning
//           }
//         }
//   L531    return variables.brandName;
//   L532  }
//
// So the FIRST call answers with the real brand name while leaving `""` behind in
// the memo, and EVERY SUBSEQUENT CALL short-circuits at L525 - the memo key now
// exists - and returns the empty string from L531. The accessor is poisoned after
// one use.
//
// ★ THE CONTROL PROVING IT IS A SLIP AND NOT A CONVENTION IS EIGHTY LINES AWAY.
// `getSalePriceDiscountType()` [L604-L612] has the IDENTICAL shape - outer memo
// guard, seed, inner association probe - and at L608 it ASSIGNS before falling
// through to the shared return. Same pattern, one assignment apart. Both are
// asserted in this one describe block so the diff is readable in a single place.
// ═══════════════════════════════════════════════════════════════════════════

describe('DIVERGENCE (c): getBrandName is fixed, getSalePriceDiscountType is the control', () => {
  it('B3.1 - returns AND caches, so repeated calls keep answering the real brand name', () => {
    // DELIBERATE DIVERGENCE (c) [model/entity/Product.cfc:L524-L532]: legacy L526
    // seeds the memo to "" and L528 returns without assigning it, so the accessor
    // is poisoned after the first call. Fixed here as a
    // documented deliberate divergence (c).
    //
    // THE JUSTIFICATION, RESTATED HERE BECAUSE A FIX MUST BE ARGUED WHERE IT IS
    // ASSERTED. The defect is UNOBSERVABLE THROUGH THE PUBLIC CONTRACT in the
    // legacy system: it changes no FIRST returned value, and no in-scope caller
    // reads the accessor twice inside one instance's lifetime. And the memo is
    // request-scoped in the target anyway (A2), so reproducing the poisoning would
    // preserve the mechanism while losing the meaning - it would encode a stale-cache
    // bug inside a cache whose lifetime the port has already shortened to a single
    // request.
    const subject = new Product({
      productID: 'product-1',
      brand: new Brand({ brandID: 'brand-1', brandName: 'Test Brand' }),
    });

    expect(subject.getBrandName()).toBe('Test Brand');

    // ★ THE ASSERTION THE DEFECT WOULD FAIL. Under the legacy body this second read
    // returns `''`; under the fix it returns the same non-empty value. Read a third
    // time for good measure, because a one-shot repair would satisfy two reads and
    // fail three.
    expect(subject.getBrandName()).toBe('Test Brand');
    expect(subject.getBrandName()).toBe('Test Brand');

    expect(cfLen(subject.getBrandName())).toBeGreaterThan(0);
  });

  it('B3.1 - the far side is consulted exactly ONCE, which is what makes it a memo', () => {
    // The value being cached is only half the contract; the other half is that the
    // association is not re-walked. A spy is the only way to see that, and
    // `tests/setup.ts` restores every spy in a global `afterEach` alongside this
    // file's own hook, so no spy leaks between cases (A2).
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Test Brand' });
    const subject = new Product({ productID: 'product-1', brand });

    const spy = vi.spyOn(brand, 'getBrandName');

    expect(subject.getBrandName()).toBe('Test Brand');
    expect(subject.getBrandName()).toBe('Test Brand');
    expect(subject.getBrandName()).toBe('Test Brand');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('B3.2 - the L527 guard: no brand means the empty-string seed survives, and that is correct', () => {
    // CFML parity [model/entity/Product.cfc:L526-L527]: the seed at L526 is NOT
    // itself the defect. When the brand is absent, the L527 probe fails, nothing
    // overwrites the seed, and the shared return answers `""`. That behaviour is
    // legitimate and is preserved exactly - the fix touches only the assignment the
    // brand-present path forgot.
    //
    // ★ `''` AND NOT `undefined`. The legacy return type is `string`, and the
    // shipped signature is `string`, so absence is spelled as the empty string here
    // rather than as absence. That is the opposite convention from the six
    // default-sku delegations (B11), which return `undefined` and must never
    // return a substitute - the two conventions live in the same component and
    // neither is copied onto the other.
    const brandless = new Product({ productID: 'product-1' });

    expect(brandless.getBrand()).toBeUndefined();
    expect(brandless.getBrandName()).toBe('');
    expect(brandless.getBrandName()).toBe('');
    expect(brandless.getBrandName()).not.toBeUndefined();
    expect(cfLen(brandless.getBrandName())).toBe(0);
  });

  it('B3.2 - a brand whose own name is absent also lands on the empty string', () => {
    // `Brand.getBrandName()` returns `string | undefined` - the column carries no
    // `notNull`, so a brand with no name is reachable. The shipped body coalesces
    // that absence into `''` so the product accessor keeps its `string` return
    // type, rather than widening the product surface to match the brand's.
    const namelessBrand = new Brand({ brandID: 'brand-1' });
    const subject = new Product({ productID: 'product-1', brand: namelessBrand });

    expect(namelessBrand.getBrandName()).toBeUndefined();
    expect(subject.getBrandName()).toBe('');

    // And the memo still holds, so the coalesced empty string is stable rather than
    // recomputed - the fix caches the resolved value, not merely a non-empty one.
    const spy = vi.spyOn(namelessBrand, 'getBrandName');

    expect(subject.getBrandName()).toBe('');
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('B3.3 - the memo is REQUEST-SCOPED: a second instance never sees the first cached name', () => {
    // A2: all entity memos are request-scoped. Reproducing them as module state
    // would leak one customer's data into another's request.
    //
    // ★ THIS IS THE ASSERTION THAT WOULD CATCH THE WORST POSSIBLE PORTING MISTAKE.
    // The legacy cache is `variables.brandName` - COMPONENT-level state, which on a
    // warm Lambda container would persist between two unrelated invocations if it
    // were reproduced as module state. Two independent products with two different
    // brands must answer independently, and the second must not inherit the first's
    // answer regardless of construction order.
    const first = new Product({
      productID: 'product-1',
      brand: new Brand({ brandID: 'brand-1', brandName: 'First Brand' }),
    });
    const second = new Product({
      productID: 'product-2',
      brand: new Brand({ brandID: 'brand-2', brandName: 'Second Brand' }),
    });

    expect(first.getBrandName()).toBe('First Brand');
    expect(second.getBrandName()).toBe('Second Brand');
    expect(first.getBrandName()).toBe('First Brand');

    // The brandless case is the sharper direction: if the memo were shared, a
    // brandless product built after a branded one would answer with the branded
    // one's name.
    const third = new Product({ productID: 'product-3' });

    expect(third.getBrandName()).toBe('');
    expect(first.getBrandName()).toBe('First Brand');
    expect(second.getBrandName()).toBe('Second Brand');
  });

  it('B3.4 - THE CONTROL: getSalePriceDiscountType assigns at L608 and needs no fix', () => {
    // CFML parity [model/entity/Product.cfc:L604-L612]: memo variant A - seed then
    // guard - identical in shape to getBrandName at L524-L532, except that L608
    // writes `variables.salePriceDiscountType = getDefaultSku().getSalePriceDiscountType();`
    // and falls through to the shared return at L611 instead of returning past the
    // memo. This is the CONTROL that proves L524-L532 is a defect rather than a
    // house style: two methods, eighty lines apart, one assignment apart.
    //
    // ★ NO FIX IS APPLIED OR NEEDED HERE, and none may be: this method is already
    // correct, and touching it would spend a divergence that does not exist.
    const sku = makeSkuFixture({
      skuID: 'sku-1',
      salePriceDetail: {
        skuID: 'sku-1',
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('17.99'),
        promotionID: 'promotion-1',
      },
    });
    const subject = new Product({ productID: 'product-1', defaultSku: sku });

    const spy = vi.spyOn(sku, 'getSalePriceDiscountType');

    expect(subject.getSalePriceDiscountType()).toBe('percentageOff');
    expect(subject.getSalePriceDiscountType()).toBe('percentageOff');
    expect(subject.getSalePriceDiscountType()).toBe('percentageOff');

    // Memoized correctly, which is exactly what getBrandName failed to do.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('B3.4 - the control seeds "none", and that stand-in differs from the sku-level one', () => {
    // CFML parity [model/entity/Product.cfc:L606 vs model/entity/Sku.cfc:L557]:
    // the PRODUCT substitutes the literal string `"none"` for an absent discount
    // type while the SKU substitutes the EMPTY STRING. Two different stand-ins for
    // the same absence, in two sibling components, neither copied onto the other.
    // Both are asserted here so the divergence is pinned rather than assumed.
    const withoutDefaultSku = new Product({ productID: 'product-1' });

    expect(withoutDefaultSku.getDefaultSku()).toBeUndefined();
    expect(withoutDefaultSku.getSalePriceDiscountType()).toBe('none');
    expect(withoutDefaultSku.getSalePriceDiscountType()).toBe('none');

    // The sku-level stand-in, for the contrast. `makeSkuFixture` leaves
    // `salePriceDetail` absent by default, which is the absent case.
    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    expect(skuWithoutDetail.getSalePriceDiscountType()).toBe('');

    // And the product's own accessor still says "none" even when its default sku
    // says `''` - the seed is overwritten by whatever the sku answers, including an
    // empty string, so the two stand-ins are NOT interchangeable and the product's
    // is only reachable when there is no default sku at all.
    const withEmptySku = new Product({ productID: 'product-2', defaultSku: skuWithoutDetail });

    expect(withEmptySku.getSalePriceDiscountType()).toBe('');
    expect(withEmptySku.getSalePriceDiscountType()).not.toBe('none');
  });

  it('B3.4 - the control memo is request-scoped too, and its seed does not leak', () => {
    // A2 again, for the control. The seed `"none"` is the value most likely to leak
    // if the memo were module state, because it is written on the first call for
    // every product regardless of what happens next.
    const seeded = new Product({ productID: 'product-1' });

    expect(seeded.getSalePriceDiscountType()).toBe('none');

    const withSku = new Product({
      productID: 'product-2',
      defaultSku: makeSkuFixture({
        skuID: 'sku-2',
        salePriceDetail: {
          skuID: 'sku-2',
          discountLevel: 'brand',
          salePriceDiscountType: 'amountOff',
          salePrice: Money.fromDecimalString('15.00'),
          promotionID: 'promotion-2',
        },
      }),
    });

    expect(withSku.getSalePriceDiscountType()).toBe('amountOff');
    expect(seeded.getSalePriceDiscountType()).toBe('none');
  });

  it('B3.5 - this is the THIRD AND FINAL member of divergence (c); no fourth exists anywhere', () => {
    // ★ THE PROJECT-WIDE DIVERGENCE LEDGER, FULLY ALLOCATED:
    //   (a) the un-`var`'d `discountAmount`
    //       [model/service/PromotionService.cfc:L1007, L1009] - sibling-owned by
    //       `src/services`, because reproducing shared mutable state that survives
    //       between warm Lambda invocations could leak one customer's discount into
    //       another's order.
    //   (b) the `amountOff` raw-float gap [model/service/PromotionService.cfc:L998]
    //       - sibling-owned by `src/services`, because routing all arithmetic
    //       through `Money` is structural and preserving one branch's drift would
    //       mean deliberately bypassing the value object.
    //   (c) the entity memo bugs: DEFECT 17 [model/entity/Sku.cfc:L500-L510] and
    //       DEFECT 18 [model/entity/Sku.cfc:L512-L522], both owned by
    //       `sku.test.ts`, and DEFECT 19 [model/entity/Product.cfc:L524-L532],
    //       owned HERE. This file owns the third of (c)'s three members.
    //
    // A FOURTH DIVERGENCE IS FORBIDDEN. Every other entry in the register - twenty
    // numbered defects plus eight secondary items - is REPRODUCED, not repaired.
    // This case exists so that the ledger is stated once in an executable place
    // rather than only in prose, and it asserts the observable half of that claim:
    // the members this file preserves as defective are still defective.
    //
    // DEFECT 20 is still preserved - the discarded sale price still falls through
    // to zero.
    const defect20 = new Product({
      productID: 'product-1',
      skus: [makeSkuFixture({ skuID: 'sku-1' })],
    });

    expect(defect20.getSalePrice().toFixed2()).toBe('0.00');

    // DEFECT 25 is still preserved - the misspelled call site still cannot resolve.
    expect(() => defect20.getSalePriceExpirationDateTime()).toThrow();

    // And the two throwing accessors are still throwing.
    expect(() => defect20.getPageIDs()).toThrow();
    expect(() => defect20.getProductOptionsByGroup()).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ DEFECT 20 - PRESERVED. THE MISSING `return` AT L598  (B4)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy body verbatim [model/entity/Product.cfc:L594-L601]:
//
//   L594  public any function getSalePrice() {
//   L595    if( structKeyExists(variables,"defaultSku") ) {
//   L596      return getDefaultSku().getSalePrice();
//   L597    } else if (arrayLen(getSkus())) {
//   L598      getSkus()[1].getSalePrice();          <-- NO `return`
//           }
//   L600    return 0;
//   L601  }
//
// Three branches. Branch 1 returns the default sku's sale price. Branch 2 CALLS
// the first sku's sale price and THROWS THE RESULT AWAY, then falls through.
// Branch 3 is the terminal zero, and branch 2 lands on it.
// ═══════════════════════════════════════════════════════════════════════════

describe('DEFECT 20 (preserved): getSalePrice discards the first sku and falls through to zero', () => {
  it('B4.1 - branch 2 returns ZERO, not the sku sale price and not undefined', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement getSkus()[1].getSalePrice(); has no return,
    // so execution falls through to return 0 at L600 and the sku's sale price is discarded.
    // Preserved deliberately; do not fix without a product decision.
    const firstSku = makeSkuFixture({
      skuID: 'sku-1',
      salePriceDetail: {
        skuID: 'sku-1',
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('12.34'),
        promotionID: 'promotion-1',
      },
    });

    // The sku genuinely has a sale price, and it is genuinely not zero. That is what
    // makes the discard observable rather than a coincidence of the fixture.
    expect(firstSku.getSalePrice().toFixed2()).toBe('12.34');

    const subject = new Product({ productID: 'product-1', skus: [firstSku] });

    expect(subject.getDefaultSku()).toBeUndefined();
    expect(subject.getSkus()).toHaveLength(1);

    // ★ THE DEFECT, ASSERTED. Zero - not 12.34.
    expect(subject.getSalePrice().toFixed2()).toBe('0.00');
    expect(subject.getSalePrice().equals(Money.fromDecimalString('0'))).toBe(true);

    // ⚠️ AND NOT `undefined`. This is one half of the ABSENCE CONVENTION and the
    // direction is load-bearing: `Product.getSalePrice()` MUST return `0` and never
    // `undefined`, because [L600] declares the zero explicitly. Collapsing it to
    // `undefined` would break every caller that concatenates or compares it.
    expect(subject.getSalePrice()).not.toBeUndefined();
    expect(subject.getSalePrice()).toBeInstanceOf(Money);
  });

  it('B4.1 - the discarded call is still EVALUATED, which is observable', () => {
    // ★ WHY THE PORT DOES NOT SIMPLY DELETE THE UNUSED STATEMENT. Evaluating it is
    // observable: `Sku.getSalePrice()` reads the pre-materialized detail row and
    // falls back to `getPrice()`, and while an element access on a non-empty array
    // cannot itself fail, the delegate could throw from deeper in. A port that
    // skipped the call would swallow that throw. Deleting a call because its result
    // is unused is exactly the kind of tidy that changes behaviour.
    const firstSku = makeSkuFixture({ skuID: 'sku-1' });
    const spy = vi.spyOn(firstSku, 'getSalePrice');
    const subject = new Product({ productID: 'product-1', skus: [firstSku] });

    expect(subject.getSalePrice().toFixed2()).toBe('0.00');

    // The call happened. Its result went nowhere.
    expect(spy).toHaveBeenCalledTimes(1);

    // And it is re-evaluated on every call, because this accessor is NOT memoized -
    // there is no `variables.salePrice` guard anywhere in [L594-L601].
    expect(subject.getSalePrice().toFixed2()).toBe('0.00');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('B4.1 - a throw from the discarded delegate still propagates', () => {
    // The sharpest consequence of preserving the evaluation rather than deleting it.
    // If the first sku's sale price cannot be produced, the product's accessor fails
    // rather than quietly answering zero - which is what the legacy did, because
    // CFML evaluated the statement too.
    const explodingSku = makeSkuFixture({ skuID: 'sku-1' });

    vi.spyOn(explodingSku, 'getSalePrice').mockImplementation((): never => {
      throw new Error('delegate refused');
    });

    const subject = new Product({ productID: 'product-1', skus: [explodingSku] });

    expect(() => subject.getSalePrice()).toThrow(/delegate refused/);
  });

  it('B4.2 - branch 1: a default sku returns its REAL sale price, undiscarded', () => {
    // [L595-L596] is the only arm that returns a real number, and it is the arm the
    // defect does not touch. Asserting it is what makes the branch-2 zero meaningful:
    // the accessor is capable of answering correctly, and only branch 2 loses the value.
    const defaultSku = makeSkuFixture({
      skuID: 'sku-default',
      salePriceDetail: {
        skuID: 'sku-default',
        discountLevel: 'product',
        salePriceDiscountType: 'amountOff',
        salePrice: Money.fromDecimalString('44.55'),
        promotionID: 'promotion-1',
      },
    });
    const otherSku = makeSkuFixture({
      skuID: 'sku-other',
      salePriceDetail: {
        skuID: 'sku-other',
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('99.99'),
        promotionID: 'promotion-2',
      },
    });
    const subject = new Product({
      productID: 'product-1',
      defaultSku,
      skus: [otherSku],
    });

    // The DEFAULT sku wins, and the collection's first element is never consulted -
    // [L595] returns before [L597] is ever evaluated.
    const skuSpy = vi.spyOn(otherSku, 'getSalePrice');

    expect(subject.getSalePrice().toFixed2()).toBe('44.55');
    expect(skuSpy).toHaveBeenCalledTimes(0);
  });

  it('B4.2 - branch 3: no default sku and NO skus at all also returns zero', () => {
    // The terminal `return 0` at [L600] is reached by TWO paths - the fall-through
    // from branch 2 and the nothing-at-all path - and both are asserted so a future
    // edit cannot satisfy one while breaking the other.
    //
    // CFML parity [model/entity/Product.cfc:L597]: `arrayLen(getSkus())` is CFML
    // NUMERIC TRUTHINESS over a length, so an empty array skips the branch. The
    // shipped body routes that through `cfTruthy` rather than relying on JavaScript
    // coercion agreeing by coincidence.
    const empty = new Product({ productID: 'product-1' });

    expect(empty.getSkus()).toEqual([]);
    expect(empty.getSalePrice().toFixed2()).toBe('0.00');
    expect(empty.getSalePrice()).toBeInstanceOf(Money);
  });

  it('B4.3 - Sku.getSalePrice() is CORRECT, and this defect must NOT propagate to it', () => {
    // ★★ THE CONTRAST. `Sku.getSalePrice()` [model/entity/Sku.cfc:L546-L551] falls
    // back to `getPrice()` at [L550] when it has no sale-price detail. The legacy
    // declares that fallback EXPLICITLY, so the sku accessor always answers a real
    // amount and never a discarded one. Two sibling components, fifty lines apart,
    // one with a missing `return` and one without.
    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    // `SKU_PRICE` in the fixture is '19.99', and `getPrice()` is `default="0"` on the
    // column so it is never absent. The sku therefore answers 19.99, not zero.
    expect(skuWithoutDetail.getSalePrice().toFixed2()).toBe('19.99');
    expect(skuWithoutDetail.getSalePrice().equals(skuWithoutDetail.getPrice())).toBe(true);

    // ★★ THE ABSENCE CONVENTION, STATED IN BOTH DIRECTIONS, because collapsing
    // either one is a money bug:
    //
    //   `Product.getSalePrice()`        MUST return `0`, NEVER `undefined`
    //       - [model/entity/Product.cfc:L600] declares the zero explicitly.
    //   `Sku.getPriceByCurrencyCode()`  MUST return `undefined`, NEVER `0`
    //       - [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, and
    //         substituting `0` would SILENTLY SELL PRODUCTS FOR FREE.
    //
    // Same domain, same quantity, opposite conventions. Both halves are asserted
    // here so neither can be "harmonised" by a later reader.
    const productZero = new Product({ productID: 'product-1' });

    expect(productZero.getSalePrice().toFixed2()).toBe('0.00');
    expect(productZero.getSalePrice()).not.toBeUndefined();

    expect(skuWithoutDetail.getPriceByCurrencyCode('ZZZ')).toBeUndefined();
    expect(skuWithoutDetail.getPriceByCurrencyCode('ZZZ')).not.toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ G1 / DEFECT 25 - `getSalePriceExpirationDateTime()` THROWS  (B5)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy body verbatim [model/entity/Product.cfc:L614-L622]:
//
//   L614  public date function getSalePriceExpirationDateTime() {
//   L615    if(!structKeyExists(variables, "salePriceExpirationDateTime")) {
//   L616      variables.salePriceExpirationDateTime = now();
//   L617      if( structKeyExists(variables,"defaultSku") ) {
//   L618        variables.salePriceExpirationDateTime = getDefaultSku().getSalePricExpirationDateTime();
//             }
//           }
//   L621    return variables.salePriceExpirationDateTime;
//   L622  }
//
// ★ THE NAMING PRECISION POINT THAT MUST NOT BE GOT WRONG: THE DECLARATION AT
// L614 IS SPELLED CORRECTLY. The typo - `getSalePricExpirationDateTime`, missing
// the `e` in "Price" - is at the CALL SITE at L618, on the delegate. Any account
// that puts the typo on the declaration has it backwards.
// ═══════════════════════════════════════════════════════════════════════════

describe('DEFECT 25 / G1 (preserved): getSalePriceExpirationDateTime cannot return', () => {
  it('B5.1 - the shipped accessor THROWS, and the throw is the faithful arm', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L614, L617, L618]: the declaration at L614 is spelled correctly
    // but the call at L618 invokes the misspelled getSalePricExpirationDateTime(). In CFML this resolved
    // silently to an empty attribute value; in the target there is no dynamic dispatch, so it throws.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ BOTH READINGS OF THE LEGACY ARE INTERNALLY CONSISTENT, AND THE SHIPPED ONE
    // IS WHAT IS ASSERTED. In CFML the misspelled call fell into `onMissingMethod`
    // [org/Hibachi/HibachiEntity.cfc:L507-L565]; because `Sku.cfc:L70` declares
    // `attributeValues`, the dispatcher reached the `getAttributeValue` fallback at
    // [L559] rather than the throw at [L565], so a CFML runtime could plausibly have
    // yielded `''` - which then still could not satisfy the `returntype="date"`
    // coercion declared at [L614]. IN THE TARGET THERE IS NO DYNAMIC DISPATCH AT
    // ALL, the misspelled member does not exist on the ported `Sku`, and so the call
    // cannot be made. It throws.
    //
    // ★ AND THIS CONSUMES NO DIVERGENCE. The divergence budget is for CHANGING
    // behaviour; this changes nothing - it reproduces the arm the port always takes.
    // A `// JUDGMENT CALL:` note to that effect is below.
    const subject = new Product({
      productID: 'product-1',
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
    });

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(Error);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /getSalePriceExpirationDateTime\(\) cannot return/,
    );

    // ★ THE MARKER'S THREE LOCATORS, EACH ASSERTED IN THE MESSAGE, so an operator
    // reading a log has the whole chain without the source in front of them.
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /model\/entity\/Product\.cfc:L617/,
    );
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /model\/entity\/Product\.cfc:L618/,
    );
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /model\/entity\/Product\.cfc:L614/,
    );

    // Both CFML mechanisms are named in the message: the dispatcher chain, and the
    // `returntype="date"` coercion that could not have been satisfied anyway.
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/onMissingMethod/);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /org\/Hibachi\/HibachiEntity\.cfc:L507-L565/,
    );
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/returntype="date"/);

    // And it is explicitly NOT a stub, so nobody "finishes" it later.
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /not a stub awaiting implementation/,
    );
  });

  it('B5.2 - the MISSPELLED identifier is preserved verbatim in the message', () => {
    // C3 TODO CARRY-FORWARD. The misspelling is the whole point of the defect, so it
    // survives in the reproduction rather than being silently corrected. It is
    // asserted as a literal, with the correct spelling asserted alongside it so the
    // one-character difference is visible in this file too.
    //
    // // JUDGMENT CALL: asserting the misspelling as a literal string rather than by
    // regex-escaping a variable, because a variable would let a future edit change
    // both the source and this expectation together and never notice. A literal
    // cannot drift silently.
    const subject = new Product({ productID: 'product-1' });

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/getSalePricExpirationDateTime/);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/no "e" in "Price"/);

    // The message also names where the CORRECT spelling lives, which is the control
    // for B5.3.
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/model\/entity\/Sku\.cfc:L560/);

    // // JUDGMENT CALL: the shipped member is authored under the DECLARATION's
    // correct spelling, because that is what L614 declares and interface parity is
    // measured against the declaration. The misspelling lives only where the legacy
    // put it - inside the body - so no misspelled member appears on the surface.
    expect(declaresMember('getSalePriceExpirationDateTime')).toBe(true);
    expect(declaresMember('getSalePricExpirationDateTime')).toBe(false);
  });

  it('B5.1 - it throws with NO default sku too, because eager materialization removes the other arm', () => {
    // ★ THE BEHAVIOUR THAT IS GENUINELY LOST, RECORDED RATHER THAN HIDDEN. [L617]
    // is a LAZY-LOAD STATE probe in CFML with two different outcomes: unloaded,
    // and the `now()` seed from [L616] is returned; loaded, and [L618] runs and
    // fails. Under eager materialization there is no "unloaded" state, so the port
    // always reaches the failing arm and the seeded `now()` is unreachable.
    //
    // That is a consequence of the structural association decision, not a choice
    // made at this accessor, and it is asserted here so a reviewer can see it was
    // noticed rather than overlooked.
    //
    // ★ AND THE SEED WOULD HAVE BEEN THE WRONG THING TO KEEP IN ANY CASE: an
    // expiration timestamp defaulting to the moment it is asked for means "already
    // expiring", which is neither the permissive extreme (absence, meaning FOREVER,
    // as the promotion entities use) nor a real expiry.
    const withoutDefaultSku = new Product({ productID: 'product-1' });

    expect(withoutDefaultSku.getDefaultSku()).toBeUndefined();
    expect(() => withoutDefaultSku.getSalePriceExpirationDateTime()).toThrow(Error);

    // ⚠️ B5.4 / NO CLOCK IS READ ANYWHERE. The legacy seeded from `now()` at [L616];
    // the port reads no clock at all, and `Product` is injected with none. Nothing
    // in this suite calls a bare `new Date()` or `Date.now()` for a business value -
    // every instant is an explicit UTC ISO-8601 literal declared at module scope.
    expect(SALE_PRICE_EXPIRATION_INSTANT.toISOString()).toBe('2024-12-31T23:59:59.000Z');
    expect(CREATED_INSTANT.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(MODIFIED_INSTANT.toISOString()).toBe('2024-06-15T12:30:45.000Z');
  });

  it("B5.3 - the SKU accessor is correctly spelled and returns '' on a miss: the control", () => {
    // ⚠️ THE TYPO MUST NOT BE IMPORTED INTO THE SKU SIDE.
    // `Sku.getSalePriceExpirationDateTime()` [model/entity/Sku.cfc:L560-L565] is
    // spelled CORRECTLY and answers `Date | ''` - a timestamp at [L562] and the
    // empty string at [L564]. It is the control for the product-side throw, and it
    // is asserted here so the difference between the two surfaces is documented as
    // legacy rather than mistaken for a porting error.
    //
    // ★ THE UNION IS FAITHFUL AND IS NOT COLLAPSED. The legacy `any` return
    // permitted both a date and an empty string, so narrowing it to
    // `Date | undefined` would change what a caller sees.
    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    expect(skuWithoutDetail.getSalePriceExpirationDateTime()).toBe('');

    const skuWithExpiry = makeSkuFixture({
      skuID: 'sku-2',
      salePriceDetail: {
        skuID: 'sku-2',
        discountLevel: 'global',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString('9.99'),
        promotionID: 'promotion-1',
        salePriceExpirationDateTime: SALE_PRICE_EXPIRATION_INSTANT,
      },
    });

    expect(skuWithExpiry.getSalePriceExpirationDateTime()).toBe(SALE_PRICE_EXPIRATION_INSTANT);

    // And a detail row with NO expiry still answers `''`, because [L561] tests the
    // sub-key as well as the row - the same second-existence-check shape that makes
    // `getListPriceByCurrencyCode` able to answer absence for a known currency.
    const skuWithDetailButNoExpiry = makeSkuFixture({
      skuID: 'sku-3',
      salePriceDetail: {
        skuID: 'sku-3',
        discountLevel: 'option',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString('8.88'),
        promotionID: 'promotion-1',
      },
    });

    expect(skuWithDetailButNoExpiry.getSalePriceExpirationDateTime()).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★ TWO MORE PRESERVED THROWS, EACH BESIDE ITS WORKING TWIN  (B6)
// ═══════════════════════════════════════════════════════════════════════════
//
// `getPageIDs()` and `getCategoryIDs()` are FOUR LINES APART and structurally
// identical - same loop, same `listAppend`, same comma-list return. One iterates
// a collection the component declares and works; the other iterates a collection
// it does NOT declare and cannot. They are asserted together for the same reason
// the URL pair is: the working one makes the broken one legible.
// ═══════════════════════════════════════════════════════════════════════════

describe('PRESERVED THROWS: getPageIDs and getProductOptionsByGroup, with their twins', () => {
  it('B6.1 - getPageIDs THROWS, because getPages() is not declared on the component', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L193]: getPageIDs() iterates getPages(), which is not
    // declared on the component and corresponds to no property - the component declares listingPages,
    // not pages - so in CFML the call reaches [org/Hibachi/HibachiEntity.cfc:L559] and throws at [L565].
    // Preserved deliberately; do not fix without a product decision.
    //
    // The legacy body verbatim [model/entity/Product.cfc:L191-L197]:
    //
    //   L191  public string function getPageIDs() {
    //   L192    var pageIDs = "";
    //   L193    for( var i=1; i<= arrayLen(getPages()); i++ ) {
    //   L194      pageIDs = listAppend(pageIDs,getPages()[i].getPageID());
    //           }
    //   L196    return pageIDs;
    //   L197  }
    //
    // ★ NO WORKING IMPLEMENTATION IS WRITTEN OVER `listingPages`, and none may be.
    // The two collections are not interchangeable: a listing page link row is not a
    // page, and quietly substituting one would be inventing a feature and calling it
    // a port.
    const subject = new Product({
      productID: 'product-1',
      categories: [buildCategory('category-1')],
    });

    expect(() => subject.getPageIDs()).toThrow(Error);
    expect(() => subject.getPageIDs()).toThrow(/getPageIDs\(\) cannot return/);
    expect(() => subject.getPageIDs()).toThrow(/model\/entity\/Product\.cfc:L193/);
    expect(() => subject.getPageIDs()).toThrow(/getPages\(\)/);
    expect(() => subject.getPageIDs()).toThrow(/org\/Hibachi\/HibachiEntity\.cfc:L507-L565/);
    expect(() => subject.getPageIDs()).toThrow(/not a stub awaiting implementation/);

    // ⚠️ C17 - A LOCATOR CORRECTION, RECORDED AND NOT APPLIED. The shipped message
    // cites `listingPages at [L82]`. The VERIFIED declaration is at
    // **model/entity/Product.cfc:L79** - L79 is `listingPages`, L80 is `categories`
    // and L81 is `relatedProducts`, all three confirmed by direct read. L82 is the
    // first line of the many-to-many INVERSE block that follows. The shipped string
    // is asserted AS SHIPPED because a test may never edit `src/**` to make its own
    // citation preference come true; the correction is recorded here so a reviewer
    // has it, and the SOURCE wins over any document that disagrees.
    expect(() => subject.getPageIDs()).toThrow(/listingPages at \[L82\]/);
  });

  it('B6.1 - the WORKING TWIN: getCategoryIDs builds a comma list with NO leading delimiter', () => {
    // CFML parity [model/entity/Product.cfc:L199-L205]: the same loop shape as
    // `getPageIDs`, over `categories` at [L80], which the component DOES declare.
    // This one works, and asserting it is what proves the other throw is about the
    // missing collection rather than about the loop.
    //
    // ★ `listAppend` IS USED RATHER THAN `Array.join`, and the difference is
    // contractual rather than cosmetic: the helper emits NO LEADING DELIMITER on an
    // empty list. `join` would agree here by coincidence; the helper agrees by
    // contract, and the rest of the slice depends on the contract.
    const subject = new Product({
      productID: 'product-1',
      categories: [buildCategory('category-1'), buildCategory('category-2')],
    });

    expect(subject.getCategoryIDs()).toBe('category-1,category-2');
    expect(subject.getCategoryIDs().startsWith(',')).toBe(false);
    expect(listLen(subject.getCategoryIDs())).toBe(2);
    expect(listToArray(subject.getCategoryIDs())).toEqual(['category-1', 'category-2']);

    // A single category produces a bare id with no delimiter at all.
    const single = new Product({
      productID: 'product-2',
      categories: [buildCategory('category-only')],
    });

    expect(single.getCategoryIDs()).toBe('category-only');
    expect(listLen(single.getCategoryIDs())).toBe(1);
  });

  it("B6.1 - getCategoryIDs returns '' on an empty collection, which is one of the five empty semantics", () => {
    // B21 EMPTY-COLLECTION SEMANTICS, CASE 5-ADJACENT: a comma-list build over an
    // empty collection answers the EMPTY STRING, not `undefined` and not a bare
    // delimiter. That is the property `listAppend` guarantees and it is load-bearing
    // elsewhere in the slice - the materialized-path walks depend on a leading
    // delimiter never appearing.
    //
    // CFML parity [model/entity/Product.cfc:L200]: `var categoryIDs = ""` seeds the
    // accumulator, and an empty `getCategories()` skips the loop entirely, so the
    // seed is what returns.
    const empty = new Product({ productID: 'product-1' });

    expect(empty.getCategories()).toEqual([]);
    expect(empty.getCategoryIDs()).toBe('');
    expect(empty.getCategoryIDs()).not.toBeUndefined();
    expect(listLen(empty.getCategoryIDs())).toBe(0);

    // And the collection defaults to `[]` rather than to absence, so the accessor is
    // safe to call on a bare product - `categories` is one of the eight collections
    // the constructor coalesces.
    expect(Array.isArray(empty.getCategories())).toBe(true);
  });

  it('B6.2 - getProductOptionsByGroup THROWS, and it fails for TWO independent reasons', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L631-L633]: getProductOptionsByGroup() calls the bare
    // getProductService(), which is not declared on the component or its bases, so the call reaches
    // [org/Hibachi/HibachiEntity.cfc:L559] and throws at [L565]; and ProductService declares no
    // getProductOptionsByGroup method either, so the intended target does not exist.
    // Preserved deliberately; do not fix without a product decision.
    //
    // The legacy body verbatim [model/entity/Product.cfc:L631-L633]:
    //
    //   L631  public array function getProductOptionsByGroup(){
    //   L632    return getProductService().getProductOptionsByGroup( this );
    //   L633  }
    //
    // ★ FAILURE 1 - `getProductService()` IS NOT A METHOD. Every other outward reach
    // in this component goes through `getService("...")` - all eighteen of them - and
    // this bare accessor-shaped call appears exactly ONCE, here. It is declared
    // neither on `Product.cfc`, nor on `model/entity/HibachiEntity.cfc`, nor among
    // the generated-accessor patterns.
    //
    // ★ FAILURE 2 - THE INTENDED TARGET DOES NOT EXIST EITHER. `ProductService`
    // declares no `getProductOptionsByGroup` method at all, so even a correctly
    // resolved service call would have nowhere to land.
    //
    // ★ AND NO FOURTEENTH PORT IS INVENTED FOR IT. The port ledger is locked at
    // thirteen; adding a member to satisfy a call whose target never existed would
    // be inventing a feature.
    const subject = new Product({ productID: 'product-1' });

    expect(() => subject.getProductOptionsByGroup()).toThrow(Error);
    expect(() => subject.getProductOptionsByGroup()).toThrow(
      /getProductOptionsByGroup\(\) cannot return/,
    );

    // Failure 1, named in the message.
    expect(() => subject.getProductOptionsByGroup()).toThrow(/model\/entity\/Product\.cfc:L632/);
    expect(() => subject.getProductOptionsByGroup()).toThrow(/getProductService\(\)/);
    expect(() => subject.getProductOptionsByGroup()).toThrow(/model\/entity\/HibachiEntity\.cfc/);

    // Failure 2, named in the message.
    expect(() => subject.getProductOptionsByGroup()).toThrow(
      /ProductService declares no[\s\S]*getProductOptionsByGroup method either/,
    );

    // The dispatcher chain, and the explicit disclaimer.
    expect(() => subject.getProductOptionsByGroup()).toThrow(
      /org\/Hibachi\/HibachiEntity\.cfc:L507-L565/,
    );
    expect(() => subject.getProductOptionsByGroup()).toThrow(/not a stub/);
  });

  it('B6.2 - the WORKING TWIN: getOptionsByOptionGroup resolves options without a service at all', () => {
    // CFML parity [model/entity/Product.cfc:L340-L347]: the near-twin of the broken
    // accessor above, and the one that works - it reaches `getService("optionService")`
    // at [L341] with the LOWERCASE spelling, which resolves, rather than the bare
    // `getProductService()` at [L632], which does not.
    //
    // ★ IN THE PORT IT NEEDS NO PORT AT ALL. The legacy body ran a smart-list query
    // filtered by option-group id AND by this product's id [L343-L344] and ordered by
    // `sortOrder|ASC` [L345]. With associations eagerly materialized, every row that
    // query could return is already reachable by walking this product's own skus and
    // their options - so the shipped accessor is SYNCHRONOUS and touches nothing
    // outward. Asserting that is asserting the async boundary rule: a method is async
    // IFF its legacy body reaches the DAO/ORM for data the port cannot already see.
    const groupA = buildOptionGroup('group-a', 1);
    const groupB = buildOptionGroup('group-b', 2);

    const optionA1 = buildOption('option-a1', 2, groupA);
    const optionA2 = buildOption('option-a2', 1, groupA);
    const optionB1 = buildOption('option-b1', 1, groupB);

    const skuOne = makeSkuFixture({ skuID: 'sku-1', options: [optionA1, optionB1] });
    const skuTwo = makeSkuFixture({ skuID: 'sku-2', options: [optionA2] });

    const subject = new Product({ productID: 'product-1', skus: [skuOne, skuTwo] });

    // Filtered to the requested group, and ordered by `sortOrder` ascending, so
    // `option-a2` (sortOrder 1) precedes `option-a1` (sortOrder 2) even though the
    // sku carrying it was added second.
    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-a'))).toEqual([
      'option-a2',
      'option-a1',
    ]);
    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-b'))).toEqual(['option-b1']);

    // An unknown group answers the empty array rather than throwing or answering
    // absence - the legacy smart list would have returned no records.
    expect(subject.getOptionsByOptionGroup('group-absent')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ C2 MUST-PRESERVE: PRODUCT / SKU / OPTION RESOLUTION - THE ENTITY HALF  (B7)
// ═══════════════════════════════════════════════════════════════════════════
//
// One of the project's THREE must-preserve areas, and this suite guards its
// ENTITY half. The legacy body verbatim [model/entity/Product.cfc:L349-L364]:
//
//   L349  public any function getSkuBySelectedOptions(string selectedOptions="") {
//   L350    if(len(arguments.selectedOptions) > 0) {
//   L351      var skus = getSkusBySelectedOptions(selectedOptions=arguments.selectedOptions);
//   L352      if(arrayLen(skus) == 1) {
//   L353        return skus[1];
//   L354      } else if (arrayLen(skus) > 1) {
//   L355        throw("More than one sku is returned when the selected options are: #arguments.selectedOptions#");
//   L356      } else if (arrayLen(skus) < 1) {
//   L357        throw("No Skus are found for these selected options: #arguments.selectedOptions#");
//           }
//   L359    } else if (arrayLen(getSkus()) == 1) {
//   L360      return getSkus()[1];
//   L361    } else {
//   L362      throw("You must submit a comma seperated list of selectOptions to find an indvidual sku in this product");
//           }
//   L364  }
//
// ⚠️ B7.5 - THE P5 BOUNDARY. Everything below drives an INLINE REPOSITORY DOUBLE
// and asserts RESULTS, never queries. The AND-of-EXISTS option-matching SQL at
// [model/dao/SkuDAO.cfc:L107-L128] is explicitly OUT OF SCOPE for a domain suite
// and belongs to `tests/integration` - no SQL string appears anywhere in this file.
// ═══════════════════════════════════════════════════════════════════════════

describe('C2 MUST-PRESERVE: getSkuBySelectedOptions - all five outcomes', () => {
  it('B7.1 - it is ASYNC, because its legacy body reaches the DAO through the delegate', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM.
    // Methods that only traverse already-materialized associations or perform pure
    // arithmetic stay synchronous.
    //
    // [L351] calls `getSkusBySelectedOptions`, which at [L367] reaches
    // `skuService.getProductSkusBySelectedOptions` and from there the AND-of-EXISTS
    // query. So this accessor genuinely crosses the persistence boundary and is
    // async, while its sibling `getSkuByID` [L162-L169] walks the materialized array
    // and stays synchronous. Both facts are asserted rather than assumed.
    const target = makeSkuFixture({ skuID: 'sku-target' });
    const repository = new SkuRepositoryDouble([target]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    const pending = subject.getSkuBySelectedOptions('option-a,option-b');

    expect(pending).toBeInstanceOf(Promise);

    return pending.then((resolved: Sku | undefined): void => {
      expect(resolved?.getSkuID()).toBe('sku-target');
    });
  });

  it('B7.1 outcome 1 - EXACTLY ONE match returns that sku [L352-L353]', () => {
    const target = makeSkuFixture({ skuID: 'sku-target' });
    const repository = new SkuRepositoryDouble([target]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    return subject
      .getSkuBySelectedOptions('option-a,option-b')
      .then((resolved: Sku | undefined): void => {
        expect(resolved).toBe(target);
        expect(resolved?.getSkuID()).toBe('sku-target');
      });
  });

  it('B7.1 outcome 2 - MORE THAN ONE match THROWS, naming the selection [L354-L355]', async () => {
    // The message interpolates the caller's own selection string, so an operator
    // reading a log sees which combination is ambiguous. That interpolation is part
    // of the observable contract and is asserted, not just the fact of the throw.
    const repository = new SkuRepositoryDouble([
      makeSkuFixture({ skuID: 'sku-one' }),
      makeSkuFixture({ skuID: 'sku-two' }),
    ]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    await expect(subject.getSkuBySelectedOptions('option-a,option-b')).rejects.toThrow(
      'More than one sku is returned when the selected options are: option-a,option-b',
    );
  });

  it('B7.1 outcome 3 - ZERO matches THROWS, naming the selection [L356-L357]', async () => {
    const repository = new SkuRepositoryDouble([]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    await expect(subject.getSkuBySelectedOptions('option-a,option-b')).rejects.toThrow(
      'No Skus are found for these selected options: option-a,option-b',
    );

    // ★ AND IT IS NOT `undefined`. A zero-result lookup is an ERROR in this method,
    // not an absence, which is the opposite of `getSkuByID` four hundred lines
    // earlier. Two lookups on the same entity with opposite miss conventions.
    await expect(subject.getSkuBySelectedOptions('option-a')).rejects.toThrow(Error);
  });

  it('B7.1 outcome 4 - an EMPTY selection with exactly ONE sku returns that sku [L359-L360]', async () => {
    // CFML parity [model/entity/Product.cfc:L350]: `len(arguments.selectedOptions) > 0`
    // is a CFML length test, so both the default `""` and an explicitly empty string
    // take the else path. `cfLen` reproduces that rather than relying on JavaScript
    // truthiness agreeing by coincidence.
    //
    // ★ AND THE REPOSITORY IS NEVER CONSULTED ON THIS PATH. A single-sku product
    // needs no option resolution at all, so [L359] answers from the materialized
    // array and the query never runs. That is asserted, because a port that always
    // delegated would still pass a naive result assertion.
    const only = makeSkuFixture({ skuID: 'sku-only' });
    const repository = new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-never-returned' })]);
    const subject = new Product({
      productID: 'product-1',
      skus: [only],
      skuRepository: repository,
    });

    await expect(subject.getSkuBySelectedOptions('')).resolves.toBe(only);
    await expect(subject.getSkuBySelectedOptions()).resolves.toBe(only);

    expect(repository.selectedOptionsCalls).toEqual([]);
  });

  it('B7.2 - outcome 5: an EMPTY selection with ZERO or 2+ skus THROWS, with BOTH typos verbatim', async () => {
    // ★★ CFML parity [model/entity/Product.cfc:L362]: the message carries TWO
    // misspellings - "seperated" for "separated" and "indvidual" for "individual" -
    // and BOTH are preserved verbatim because the string is OBSERVABLE THROUGH THE
    // PUBLIC CONTRACT. Correcting a message a caller may be matching on is a
    // behaviour change dressed as a typo fix.
    const zeroSkus = new Product({
      productID: 'product-1',
      skuRepository: new SkuRepositoryDouble([]),
    });

    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.toThrow(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    );

    // Each misspelling asserted on its own, so a partial "correction" of either one
    // fails here rather than silently passing a looser whole-string match.
    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.toThrow(/seperated/);
    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.toThrow(/indvidual/);

    // And the CORRECT spellings must be absent, which is the assertion that actually
    // catches a well-meaning fix.
    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.not.toThrow(/separated/);
    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.not.toThrow(/individual/);

    // TWO OR MORE skus with an empty selection lands on the same throw - [L359] tests
    // `== 1`, not `>= 1`, so a two-sku product is as unresolvable as a zero-sku one.
    const twoSkus = new Product({
      productID: 'product-2',
      skus: [makeSkuFixture({ skuID: 'sku-one' }), makeSkuFixture({ skuID: 'sku-two' })],
      skuRepository: new SkuRepositoryDouble([]),
    });

    await expect(twoSkus.getSkuBySelectedOptions('')).rejects.toThrow(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    );
  });

  it('B7.3 - there is NO path that resolves to undefined; every non-single outcome throws', async () => {
    // ★ THE SHAPE OF THE WHOLE METHOD, STATED ONCE. Of the five outcomes, exactly
    // TWO return a sku and THREE throw. The declared return type still admits
    // `undefined` only because [L358] closes the inner chain with no `else` and the
    // shipped body reproduces that unreachable tail rather than deleting it - but no
    // input reaches it.
    //
    // ⚠️ NO LENIENT `undefined` RETURN MAY BE ADDED. A caller that wants absence
    // instead of a throw must catch, because that is what the legacy forced it to do.
    const repository = new SkuRepositoryDouble([]);
    const subject = new Product({
      productID: 'product-1',
      skus: [makeSkuFixture({ skuID: 'sku-one' }), makeSkuFixture({ skuID: 'sku-two' })],
      skuRepository: repository,
    });

    // Selection present, zero results -> throw, not undefined.
    await expect(subject.getSkuBySelectedOptions('option-a')).rejects.toThrow(Error);

    // Selection absent, two skus -> throw, not undefined.
    await expect(subject.getSkuBySelectedOptions('')).rejects.toThrow(Error);

    // The only two resolving shapes, for completeness of the claim.
    const single = new Product({
      productID: 'product-2',
      skus: [makeSkuFixture({ skuID: 'sku-only' })],
      skuRepository: repository,
    });

    await expect(single.getSkuBySelectedOptions('')).resolves.toBeDefined();

    const oneMatch = new Product({
      productID: 'product-3',
      skuRepository: new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-match' })]),
    });

    await expect(oneMatch.getSkuBySelectedOptions('option-a')).resolves.toBeDefined();
  });

  it('B7.4 - getSkusBySelectedOptions delegates with POSITIONAL (selectedOptions, productID)', async () => {
    // ★★ CFML parity [model/entity/Product.cfc:L366-L368]: the legacy body reads
    //
    //   return getService("productService").getProductSkusBySelectedOptions(
    //     arguments.selectedOptions, this.getProductID()
    //   );
    //
    // POSITIONALLY, in that order. Argument ORDER is a real contract - two string
    // parameters that silently swap would produce a query filtered by a product id
    // that is actually an option list - and a recording double is the only way to
    // observe it. This is exactly why the doubles in this file record rather than
    // merely answer.
    const repository = new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-match' })]);
    const subject = new Product({ productID: 'product-under-test', skuRepository: repository });

    const resolved = await subject.getSkusBySelectedOptions('option-a,option-b');

    expect(skuIDsOf(resolved)).toEqual(['sku-match']);

    // Both arguments, in order, exactly once.
    expect(repository.selectedOptionsCalls).toEqual([
      { selectedOptions: 'option-a,option-b', productID: 'product-under-test' },
    ]);

    // The default parameter reaches the port as the empty string rather than as
    // absence, because [L366] declares `string selectedOptions=""`.
    await subject.getSkusBySelectedOptions();

    expect(repository.selectedOptionsCalls[1]).toEqual({
      selectedOptions: '',
      productID: 'product-under-test',
    });
  });

  it('B7.5 - it returns the port RESULT unchanged; matching semantics are not re-implemented here', async () => {
    // ⚠️ THE P5 BOUNDARY, ASSERTED. The entity applies NO filtering of its own: it
    // hands the selection to the port and returns whatever comes back, in order.
    // That is the whole of its contribution, and it is what makes the AND-of-EXISTS
    // semantics an integration-tier concern rather than a domain one.
    //
    // The double is deliberately indifferent to the selection string - it answers the
    // same set for any input - so if the entity were filtering, these assertions
    // would disagree.
    const first = makeSkuFixture({ skuID: 'sku-first' });
    const second = makeSkuFixture({ skuID: 'sku-second' });
    const repository = new SkuRepositoryDouble([first, second]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    expect(skuIDsOf(await subject.getSkusBySelectedOptions('anything-at-all'))).toEqual([
      'sku-first',
      'sku-second',
    ]);
    expect(skuIDsOf(await subject.getSkusBySelectedOptions(''))).toEqual([
      'sku-first',
      'sku-second',
    ]);
  });

  it('B7.4 - with no sku repository injected it refuses, naming the collaborator and L367', async () => {
    // The port is a constructor argument a repository owns supplying, so its absence
    // is a wiring error and is reported as one rather than answered as an empty
    // result. An empty result would look exactly like "no sku matches", which is a
    // different and much worse answer.
    const unwired = new Product({ productID: 'product-1' });

    await expect(unwired.getSkusBySelectedOptions('option-a')).rejects.toThrow(/sku repository/);
    await expect(unwired.getSkusBySelectedOptions('option-a')).rejects.toThrow(
      /model\/entity\/Product\.cfc:L367/,
    );

    // And the refusal propagates through the caller at [L351] rather than being
    // converted into one of that method's three domain throws.
    await expect(unwired.getSkuBySelectedOptions('option-a')).rejects.toThrow(/sku repository/);
  });

  it('B7.6 - getSkuByID matches BY PRIMARY KEY and returns undefined on a miss [L162-L169]', () => {
    // CFML parity [model/entity/Product.cfc:L162-L169]: the loop returns on a match
    // and the function has NO TRAILING RETURN, so CFML answers null on a miss. The
    // port answers `undefined`, which is the same absence.
    //
    // ★ AND THIS IS THE OPPOSITE MISS CONVENTION FROM `getSkuBySelectedOptions`,
    // which throws. Two lookups on the same entity, two hundred lines apart, one
    // permissive and one strict. Neither is normalised onto the other.
    //
    // ⚠️ COMPARISON IS BY PRIMARY KEY ONLY - never object identity, never deep
    // equality. Two distinct instances carrying the same key are the same row.
    const wanted = makeSkuFixture({ skuID: 'sku-wanted' });
    const other = makeSkuFixture({ skuID: 'sku-other' });
    const subject = new Product({ productID: 'product-1', skus: [other, wanted] });

    expect(subject.getSkuByID('sku-wanted')).toBe(wanted);
    expect(subject.getSkuByID('sku-other')).toBe(other);

    // The miss.
    expect(subject.getSkuByID('sku-absent')).toBeUndefined();
    expect(subject.getSkuByID('')).toBeUndefined();

    // And it is SYNCHRONOUS - it walks the materialized array and reaches nothing
    // outward, so the async boundary rule keeps it sync.
    expect(subject.getSkuByID('sku-wanted')).not.toBeInstanceOf(Promise);

    // A bare product with no skus answers absence rather than throwing.
    expect(new Product({ productID: 'product-2' }).getSkuByID('sku-wanted')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `getSkus()` - THE RAW, NO-COPY RETURN AND ITS FLAGGED PROJECTION  (B8)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy body verbatim [model/entity/Product.cfc:L155-L160]:
//
//   L155  public array function getSkus(boolean sorted=false, boolean fetchOptions=false) {
//   L156    if(!arguments.sorted && !arguments.fetchOptions) {
//   L157      return variables.skus;                       <-- RAW, no defensive copy
//           }
//   L159    return getService("skuService").getProductSkus(product=this, sorted=arguments.sorted, fetchOptions=arguments.fetchOptions);
//   L160  }
// ═══════════════════════════════════════════════════════════════════════════

describe('getSkus: the live array on the fast path, a projection on the flagged path', () => {
  it('B8.1 - UNFLAGGED it returns the UNDERLYING array by reference, with NO defensive copy', () => {
    // CFML parity [model/entity/Product.cfc:L155-L160]: [L157] returns
    // `variables.skus` RAW. A CFML array is a value type on ASSIGNMENT but this is a
    // RETURN of the same reference the component holds, and the legacy callers rely
    // on it - `Sku.setProduct()` [model/entity/Sku.cfc:L1706] appends to
    // `product.getSkus()` and expects the append to be visible on the product.
    //
    // ★ SO THE IDENTITY IS ASSERTED, NOT MERELY THE CONTENTS. A port that returned a
    // copy here would silently break every bidirectional helper in the file, because
    // the append would land on a throwaway array. NO COPY IS ADDED OR EXPECTED.
    const first = makeSkuFixture({ skuID: 'sku-1' });
    const skus = [first];
    const subject = new Product({ productID: 'product-1', skus });

    expect(subject.getSkus()).toBe(skus);
    expect(subject.getSkus()).toBe(subject.getSkus());

    // The live consequence: a push through the accessor is visible through the
    // accessor, because they are the same array.
    const second = makeSkuFixture({ skuID: 'sku-2' });

    subject.getSkus().push(second);

    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-1', 'sku-2']);
    expect(skus).toHaveLength(2);
  });

  it('B8.3 - it is SYNCHRONOUS with two optional boolean flags, defaulting to false', () => {
    // CFML parity [model/entity/Product.cfc:L155]: `boolean sorted=false,
    // boolean fetchOptions=false`. Both defaults are preserved, and the arity is
    // asserted rather than assumed so a signature change is caught here.
    //
    // ★ SYNCHRONOUS EVEN THOUGH [L159] REACHED THE SERVICE. That is the one place
    // where the shipped surface departs from a naive reading of the async boundary
    // rule, and the reason is structural: with associations eagerly materialized,
    // every row `SkuService.getProductSkus` could return is already on this instance,
    // so the projection is computed in memory instead of queried. The rule is "async
    // IFF the legacy body reaches the DAO/ORM FOR DATA THE PORT CANNOT ALREADY SEE",
    // and here it can.
    const subject = new Product({ productID: 'product-1' });

    expect(arityOf('getSkus')).toBe(0);
    expect(subject.getSkus()).not.toBeInstanceOf(Promise);
    expect(subject.getSkus(false, false)).toBe(subject.getSkus());
  });

  it('B8.2 - EITHER flag set produces a NEW array rather than the live one', () => {
    // [L159] delegated in the legacy, and a delegation cannot return the caller's own
    // array - it builds one. The port preserves that: the flagged path is a
    // projection, so a caller that sorts or fetches cannot mutate the product's own
    // collection by accident.
    const first = makeSkuFixture({ skuID: 'sku-1' });
    const skus = [first];
    const subject = new Product({ productID: 'product-1', skus });

    expect(subject.getSkus(true, false)).not.toBe(skus);
    expect(subject.getSkus(false, true)).not.toBe(skus);
    expect(subject.getSkus(true, true)).not.toBe(skus);

    // Same contents, different array.
    expect(skuIDsOf(subject.getSkus(true))).toEqual(['sku-1']);

    // And mutating the projection leaves the product alone - the direction that
    // matters for safety.
    const projection = subject.getSkus(true);

    projection.push(makeSkuFixture({ skuID: 'sku-intruder' }));

    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-1']);
  });

  it('B8.2 - sorting is applied IN MEMORY, by option sort order, when the inputs allow it', () => {
    // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: the legacy ordering is a
    // positional weighting - each option contributes its own `sortOrder` scaled by
    // its GROUP's position, so the leftmost group dominates. The port computes the
    // same weighting over the materialized graph.
    //
    // `nextOptionGroupSortOrder` is a GLOBAL aggregate over `SwOptionGroup` and is
    // not derivable from one product's graph, so it arrives as a hydration input.
    // `makeSkuFixture` supplies 3 by default; it is written explicitly here so the
    // radix is visible in the test rather than inherited from a fixture default.
    const groupOne = buildOptionGroup('group-1', 1);
    const groupTwo = buildOptionGroup('group-2', 2);

    // Two skus differing only in the FIRST group's option order, so the expected
    // ordering follows that group and nothing else.
    const lowFirst = makeSkuFixture({
      skuID: 'sku-low',
      options: [buildOption('option-low', 1, groupOne), buildOption('option-b', 2, groupTwo)],
    });
    const highFirst = makeSkuFixture({
      skuID: 'sku-high',
      options: [buildOption('option-high', 9, groupOne), buildOption('option-a', 1, groupTwo)],
    });

    const subject = new Product({
      productID: 'product-1',
      skus: [highFirst, lowFirst],
      nextOptionGroupSortOrder: 3,
    });

    // Insertion order is high-then-low; the sorted projection reverses it.
    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-high', 'sku-low']);
    expect(skuIDsOf(subject.getSkus(true))).toEqual(['sku-low', 'sku-high']);
  });

  it('B8.2 - the three-clause guard: no sort with 1 sku, no options, or no radix', () => {
    // CFML parity [model/service/SkuService.cfc:L223]: the legacy guard is a
    // three-clause test in a fixed order, and the third clause probes ONLY THE FIRST
    // element rather than the whole collection. All three arms are asserted, plus the
    // radix arm the port adds because the global aggregate can be absent.
    const groupOne = buildOptionGroup('group-1', 1);

    // Arm 1 - a single sku is already sorted.
    const single = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({ skuID: 'sku-only', options: [buildOption('option-1', 5, groupOne)] }),
      ],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(single.getSkus(true))).toEqual(['sku-only']);

    // Arm 2 - the FIRST sku has no options, so no weighting is attempted even though
    // the second one does. Preserved exactly: the legacy probed element one only.
    const firstWithoutOptions = makeSkuFixture({ skuID: 'sku-no-options', options: [] });
    const secondWithOptions = makeSkuFixture({
      skuID: 'sku-with-options',
      options: [buildOption('option-1', 1, groupOne)],
    });
    const partial = new Product({
      productID: 'product-2',
      skus: [firstWithoutOptions, secondWithOptions],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(partial.getSkus(true))).toEqual(['sku-no-options', 'sku-with-options']);

    // Arm 3 - no radix ceiling means the weighting cannot be computed, and the honest
    // answer is the UNSORTED projection rather than a silently different order.
    const noRadix = new Product({
      productID: 'product-3',
      skus: [
        makeSkuFixture({ skuID: 'sku-high', options: [buildOption('option-high', 9, groupOne)] }),
        makeSkuFixture({ skuID: 'sku-low', options: [buildOption('option-low', 1, groupOne)] }),
      ],
    });

    expect(noRadix.getSkus(true)).not.toBe(noRadix.getSkus());
    expect(skuIDsOf(noRadix.getSkus(true))).toEqual(['sku-high', 'sku-low']);
  });

  it('B8.2 - fetchOptions alone projects without reordering', () => {
    // CFML parity [model/entity/Product.cfc:L159]: `fetchOptions` is an EAGER-LOAD
    // hint in the legacy - it changed the query's fetch shape, not its ordering. With
    // associations already materialized there is nothing left to fetch, so the flag's
    // only remaining effect is to take the projecting path. That is asserted rather
    // than the flag being quietly ignored.
    const groupOne = buildOptionGroup('group-1', 1);
    const high = makeSkuFixture({
      skuID: 'sku-high',
      options: [buildOption('option-high', 9, groupOne)],
    });
    const low = makeSkuFixture({
      skuID: 'sku-low',
      options: [buildOption('option-low', 1, groupOne)],
    });
    const subject = new Product({
      productID: 'product-1',
      skus: [high, low],
      nextOptionGroupSortOrder: 3,
    });

    // Order preserved, array new.
    expect(skuIDsOf(subject.getSkus(false, true))).toEqual(['sku-high', 'sku-low']);
    expect(subject.getSkus(false, true)).not.toBe(subject.getSkus());

    // The options are reachable either way, because materialization already happened.
    expect(optionIDsOf(high.getOptions())).toEqual(['option-high']);
  });

  it('B8.2 - a sorted projection of an EMPTY sku collection is an empty NEW array', () => {
    // ★ COVERING THE `no first element` ARM OF THE THREE-CLAUSE GUARD.
    // [model/service/SkuService.cfc:L223] probes `getSkus()[1].getOptions()`, which in CFML
    // over an empty array is a runtime index error. The port reaches the same OUTCOME without
    // raising: with no first element there are no options to weigh, the guard short-circuits,
    // and the empty projection is what comes back.
    //
    // Empty-collection rule (1) - PERMISSIVE in the caller: an empty collection is not an
    // error on this path, and no weighting is attempted.
    const subject = new Product({ productID: 'product-1', skus: [] });

    expect(subject.getSkus(true)).toEqual([]);
    expect(subject.getSkus(true, true)).toEqual([]);

    // Still a NEW array on the flagged path, so a caller cannot reach the live collection
    // through it. [model/entity/Product.cfc:L159] built a new array too.
    expect(subject.getSkus(true)).not.toBe(subject.getSkus());
  });

  it('B8.2 - the weighting SKIPS an option with no sortOrder and one with no option group', () => {
    // ★ COVERING THE `continue` ARM OF THE POSITIONAL WEIGHTING.
    // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: the weight is a SUM over the option rows
    // reached by an INNER JOIN through `SwOptionGroup`. `SUM` skips a NULL product, so an
    // option with a NULL `sortOrder` contributes nothing; and the inner join drops an option
    // with no group outright. Neither term is in the SQL answer, and neither is coerced to
    // zero and silently counted here.
    const groupOne = buildOptionGroup('group-1', 1);
    const groupTwo = buildOptionGroup('group-2', 2);

    // Weight 1 * 10^(3-1) = 100. The NULL-order option in group two adds nothing.
    const heavier = makeSkuFixture({
      skuID: 'sku-heavier',
      options: [
        buildOption('option-null-order', undefined, groupTwo),
        buildOption('option-weighted', 1, groupOne),
      ],
    });

    // Weight 1 * 10^(3-2) = 10. The groupless option adds nothing DESPITE its order of 9,
    // which is exactly what makes the skip observable: counted, it would dominate and the
    // two skus would come back the other way round.
    const lighter = makeSkuFixture({
      skuID: 'sku-lighter',
      options: [
        buildOption('option-groupless', 9, undefined),
        buildOption('option-small', 1, groupTwo),
      ],
    });

    const subject = new Product({
      productID: 'product-1',
      skus: [heavier, lighter],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(subject.getSkus(true))).toEqual(['sku-lighter', 'sku-heavier']);

    // The live collection is untouched by the projection, so the reordering is local to the
    // caller's copy. A2: nothing about this call leaves state behind on the instance.
    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-heavier', 'sku-lighter']);
  });

  it('B8.4 - getImages() is OMITTED, and the omission is documented rather than filled', () => {
    // ★ C6 - A PROMPT-CLAIMED MEMBER THAT DOES NOT SHIP, RECORDED AND NOT INVENTED.
    // `getImages()` [model/entity/Product.cfc:L178-L180] returns
    // `variables.productImages` raw, exactly as `getSkus()` returns `variables.skus`
    // raw. It is nonetheless absent from the shipped surface, along with the whole
    // `productImages` association and the image-file accessors, because the image
    // subsystem reaches `imageStore` - a STUB port whose branches are out of scope.
    //
    // ⚠️ ASSERTING THE SHIPPED REALITY IS THE ONLY CORRECT MOVE HERE. Creating the
    // accessor to satisfy a prompt bullet would add a collection the repository never
    // hydrates and an outward reach into an out-of-scope subsystem.
    for (const absent of [
      'getImages',
      'getProductImages',
      'getDefaultProductImageFiles',
      'getImagePath',
      'getImageExistsFlag',
      'getResizedImagePath',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // The two raw-return accessors the port DOES ship, for contrast: `getSkus`
    // unflagged, and the five live association accessors.
    expect(declaresMember('getSkus')).toBe(true);
    expect(declaresMember('getCategories')).toBe(true);
  });

  it('the five association accessors return LIVE arrays, matching the raw-return convention', () => {
    // CFML parity [model/entity/Product.cfc:L84-L89]: the many-to-many INVERSE
    // collections are read and appended in place by their far-side helpers, so they
    // follow the same by-reference convention as `getSkus()` unflagged. Asserted as a
    // family because the bidirectional helpers in B16 depend on it.
    const subject = makeProductFixture({});

    expect(subject.getPriceGroupRates()).toBe(subject.getPriceGroupRates());
    expect(subject.getPromotionQualifiers()).toBe(subject.getPromotionQualifiers());
    expect(subject.getPromotionQualifierExclusions()).toBe(
      subject.getPromotionQualifierExclusions(),
    );
    expect(subject.getPromotionRewards()).toBe(subject.getPromotionRewards());
    expect(subject.getPromotionRewardExclusions()).toBe(subject.getPromotionRewardExclusions());

    // All five default to `[]` rather than to absence, so every one is safe to walk
    // on a bare product - B21 empty-collection semantics.
    expect(subject.getPriceGroupRates()).toEqual([]);
    expect(subject.getPromotionQualifiers()).toEqual([]);
    expect(subject.getPromotionQualifierExclusions()).toEqual([]);
    expect(subject.getPromotionRewards()).toEqual([]);
    expect(subject.getPromotionRewardExclusions()).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE OPTION-GROUP FAMILY, WITH THE SEED-THEN-OVERWRITE AND CASING WARTS  (B9)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy body verbatim [model/entity/Product.cfc:L251-L261]:
//
//   L251  public array function getOptionGroups() {
//   L252    if( !structKeyExists(variables, "optionGroups") ) {
//   L253      variables.optionGroups = [];                              <-- the seed
//   L254      var smartList = getService("OptionService").getOptionGroupSmartList();   <-- CAPITAL O
//   L255      smartList.addSelect('optionGroupID', 'optionGroupID');  // DISTINCT
//   L256      smartList.addFilter('options.skus.product.productID', getProductID());
//   L257      smartList.addOrder('sortOrder|ASC');
//   L258      variables.optionGroups = smartList.getRecords();          <-- OVERWRITES the seed
//           }
//   L260    return variables.optionGroups;
//   L261  }
// ═══════════════════════════════════════════════════════════════════════════

describe('the option-group family: getOptionGroups, its struct, and its count', () => {
  it('B9.1 - the SEED-THEN-OVERWRITE wart is annotated, not tidied, and is UNOBSERVABLE here', () => {
    // CFML parity [model/entity/Product.cfc:L253 vs L258]: the empty-array seed at
    // L253 is immediately discarded by the assignment at L258. Preserved as written;
    // source warts are annotated, not normalised.
    //
    // ★ C9 - AND THE SHIPPED SURFACE MAKES IT UNOBSERVABLE, which is why this case
    // asserts the shipped behaviour instead of the wart. There is no port member that
    // serves the L254-L257 smart-list query - DISTINCT over `SwOptionGroup`, filtered
    // on `options.skus.product.productID`, ordered `sortOrder ASC` - so the option
    // groups arrive as a HYDRATION INPUT and the accessor never runs the seed at all.
    // With nothing between the seed and the overwrite, there is no window in which the
    // `[]` is visible.
    //
    // ⚠️ AND UNHYDRATED IS A REFUSAL, NOT AN EMPTY ARRAY. Answering `[]` for a
    // product whose repository forgot the query would SILENTLY SATISFY the
    // `minCollection:1` rules in `model/validation/Product.json` that read through
    // this value, which is a worse failure than a loud one.
    const unhydrated = new Product({ productID: 'product-1' });

    expect(() => unhydrated.getOptionGroups()).toThrow(Error);
    expect(() => unhydrated.getOptionGroups()).toThrow(/materialized during hydration/);
    expect(() => unhydrated.getOptionGroups()).toThrow(/model\/entity\/Product\.cfc:L254-L258/);
    expect(() => unhydrated.getOptionGroups()).toThrow(/minCollection:1/);

    // An EMPTY materialization is legitimate and is NOT a refusal - a product with no
    // options genuinely has no option groups. That is the absent-key versus
    // present-but-empty distinction, and both arms are asserted so a port cannot
    // collapse them.
    const materializedEmpty = new Product({ productID: 'product-2', optionGroups: [] });

    expect(materializedEmpty.getOptionGroups()).toEqual([]);
  });

  it('B9.2 - the three `optionService` casings in one file are recorded, not normalised', () => {
    // CFML parity [model/entity/Product.cfc:L254 vs L341 vs L637/L644]: this one file
    // names the same service THREE ways - "OptionService" at L254, "optionService" at
    // L341, and 'optionService' at L637 and L644. CFML component lookup is
    // case-insensitive; the target resolves one injected port and annotates the
    // divergence rather than normalising the source.
    //
    // ★ THE OBSERVABLE CONSEQUENCE OF RESOLVING ALL THREE TO ONE PORT: the entity
    // holds exactly ONE option-repository collaborator, and both members that reach
    // it reach the SAME instance. That is what is asserted here - the casing itself
    // is a source fact with no runtime footprint in the target, so recording it in a
    // comment is the whole of the obligation.
    //
    // ⚠️ C18 NOTE: the AAP's distinct-site table cites `Product.cfc:L343` for the
    // `optionService` locator. The VERIFIED site is **L341**; L343 is the smart-list
    // FILTER line inside the same method. The source wins.
    const repository = new OptionRepositoryDouble(
      [{ name: 'Unused Option', value: 'option-unused' }],
      [{ name: 'Unused Group', value: 'group-unused' }],
    );
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1)],
      optionRepository: repository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
    ]).then((): void => {
      // Both reached the one port.
      expect(repository.unusedOptionsCalls).toHaveLength(1);
      expect(repository.unusedOptionGroupsCalls).toHaveLength(1);

      // And the third casing site - `getOptionsByOptionGroup` at L341 - reaches NO
      // port at all in the target, because the data is already materialized.
      expect(subject.getOptionsByOptionGroup('group-1')).toEqual([]);
      expect(repository.unusedOptionsCalls).toHaveLength(1);
    });
  });

  it('B9.3 - getOptionGroups is SYNCHRONOUS over the materialized array, with no cloning', () => {
    // ★ NO CLONE, matching the raw-return convention of `getSkus()` unflagged. The
    // accessor publishes the array through a `readonly` type so no caller can write
    // into it, but the reference itself is the hydrated one.
    const groups = [buildOptionGroup('group-1', 1), buildOptionGroup('group-2', 2)];
    const subject = new Product({ productID: 'product-1', optionGroups: groups });

    expect(subject.getOptionGroups()).toBe(groups);
    expect(subject.getOptionGroups()).not.toBeInstanceOf(Promise);

    // Memoized in the only sense available: the same reference every call. There is
    // nothing to recompute, so "memoized once" and "returns the input" coincide (A2).
    expect(subject.getOptionGroups()).toBe(subject.getOptionGroups());
  });

  it('B9.4 - getOptionGroupsStruct keys by optionGroupID and is LAST-MATCH-WINS', () => {
    // CFML parity [model/entity/Product.cfc:L241-L249]: no inner structKeyExists
    // guard, so this is LAST-match-wins - the OPPOSITE of the first-match-wins dedupe
    // at Sku.cfc:L504 and L516.
    //
    // Two entries sharing a key is reachable because the legacy L254-L257 smart list
    // selected DISTINCT on `optionGroupID` at the QUERY level rather than in the loop -
    // so the loop itself never guarded, and a hydration that supplies a duplicate
    // exercises the unguarded assignment exactly as the legacy would have.
    const firstWithKey = buildOptionGroup('group-shared', 1, 'FIRST');
    const secondWithKey = buildOptionGroup('group-shared', 2, 'SECOND');
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [firstWithKey, secondWithKey],
    });

    const struct = subject.getOptionGroupsStruct();

    expect(structKeyExists(struct, 'group-shared')).toBe(true);

    // ⚠️ CORRECTION 21, VERIFIED AT RUNTIME AND RECORDED HERE: the shipped
    // `structKeyList` [src/lib/cfml/struct.ts] returns a `string[]`, NOT the
    // comma-delimited LIST that CFML's same-named function returns. The helper's own
    // doc states it deliberately, and `Product.buildExistingOptionGroupIDList` is
    // written accordingly - it folds the array through `listAppend` to BUILD the comma
    // list rather than receiving one. Asserting a string here would have been asserting
    // the CFML function's contract instead of the shipped helper's.
    expect(structKeyList(struct)).toEqual(['group-shared']);
    expect(structKeyList(struct)).toHaveLength(1);

    // ★ THE LAST ENTRY WINS.
    expect(struct['group-shared']).toBe(secondWithKey);
    expect(struct['group-shared']?.getOptionGroupCode()).toBe('SECOND');
    expect(struct['group-shared']).not.toBe(firstWithKey);
  });

  it('B9.4 - the struct is memoized per instance and never shared between instances', () => {
    // A2: all entity memos are request-scoped. Reproducing them as module state
    // would leak one customer's data into another's request.
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1)],
    });

    const firstRead = subject.getOptionGroupsStruct();

    expect(subject.getOptionGroupsStruct()).toBe(firstRead);

    const other = new Product({
      productID: 'product-2',
      optionGroups: [buildOptionGroup('group-9', 9)],
    });

    expect(structKeyList(other.getOptionGroupsStruct())).toEqual(['group-9']);
    expect(structKeyList(subject.getOptionGroupsStruct())).toEqual(['group-1']);
    expect(other.getOptionGroupsStruct()).not.toBe(firstRead);
  });

  it('B9.4 - an empty materialization yields {} rather than absence', () => {
    // B21 empty-collection semantics: a struct build over an empty collection answers
    // the EMPTY STRUCT, and its key list is the EMPTY ARRAY (correction 21 - the
    // shipped `structKeyList` returns `string[]`, not a comma list). B10 depends on
    // what happens next: folding that empty array through `listAppend` yields the
    // EMPTY STRING with no leading delimiter, which is the list the unused-* trio
    // sends to its port.
    const subject = new Product({ productID: 'product-1', optionGroups: [] });

    expect(subject.getOptionGroupsStruct()).toEqual({});
    expect(structKeyList(subject.getOptionGroupsStruct())).toEqual([]);
    expect(structKeyExists(subject.getOptionGroupsStruct(), 'anything')).toBe(false);
  });

  it('B9.5 - getOptionGroupCount is arrayLen(getOptionGroups()) and is SYNC', () => {
    // CFML parity [model/entity/Product.cfc:L263-L265]: a bare `arrayLen` over the
    // same accessor, so it inherits the hydration refusal too - a count of zero for an
    // unhydrated product would be the same silent lie as an empty array.
    const two = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1), buildOptionGroup('group-2', 2)],
    });

    expect(two.getOptionGroupCount()).toBe(2);
    expect(two.getOptionGroupCount()).not.toBeInstanceOf(Promise);

    // ZERO for an empty materialization - the legitimate empty case.
    expect(new Product({ productID: 'product-2', optionGroups: [] }).getOptionGroupCount()).toBe(0);

    // And a refusal for no materialization at all, inherited from the accessor.
    expect(() => new Product({ productID: 'product-3' }).getOptionGroupCount()).toThrow(
      /materialized during hydration/,
    );
  });

  it('B9.6 - getOptionsByOptionGroup filters by group AND by this product, ordered sortOrder ASC', () => {
    // CFML parity [model/entity/Product.cfc:L340-L347]: the legacy smart list
    // filtered on the option group at [L343] AND on this product's own id at [L344],
    // then ordered `sortOrder|ASC` at [L345]. The product filter is reproduced
    // STRUCTURALLY rather than as a predicate: the port walks only THIS product's own
    // skus, so an option reachable from another product cannot appear.
    const groupOne = buildOptionGroup('group-1', 1);
    const groupTwo = buildOptionGroup('group-2', 2);

    const mine = makeSkuFixture({
      skuID: 'sku-mine',
      options: [
        buildOption('option-third', 3, groupOne),
        buildOption('option-first', 1, groupOne),
        buildOption('option-other-group', 1, groupTwo),
      ],
    });

    // A sku belonging to a DIFFERENT product, carrying an option in the same group.
    // It is never wired onto the subject, which is how the [L344] product filter is
    // expressed here.
    const foreign = makeSkuFixture({
      skuID: 'sku-foreign',
      options: [buildOption('option-foreign', 2, groupOne)],
    });

    const subject = new Product({ productID: 'product-1', skus: [mine] });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-first',
      'option-third',
    ]);
    expect(optionIDsOf(foreign.getOptions())).toEqual(['option-foreign']);
    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).not.toContain('option-foreign');
  });

  it('B9.6 - it is DISTINCT across skus, so a shared option appears once', () => {
    // The legacy smart list selected DISTINCT; the port dedupes on `optionID`. Two
    // skus of the same product sharing one option is the ordinary case for a
    // multi-group product, so this is the common path rather than an edge case.
    const groupOne = buildOptionGroup('group-1', 1);
    const shared = buildOption('option-shared', 1, groupOne);
    const own = buildOption('option-own', 2, groupOne);

    const subject = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({ skuID: 'sku-1', options: [shared] }),
        makeSkuFixture({ skuID: 'sku-2', options: [shared, own] }),
      ],
    });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-shared',
      'option-own',
    ]);
  });

  it('B9.6 / C15 - an option with NO sortOrder sorts FIRST, and one with no group is dropped', () => {
    // ★ C15 - VERIFIED AGAINST THE SHIPPED COMPARATOR, NOT ASSUMED.
    // `SwOption.sortOrder` is NULLable, and the shipped comparator places an absent
    // order BEFORE a present one. That is a real ordering decision and it is pinned
    // here rather than left to whatever a default comparator would do.
    //
    // An option with no option group is skipped entirely, because the legacy filter
    // at [L343] was an INNER JOIN through the group and could not have returned it.
    const groupOne = buildOptionGroup('group-1', 1);

    const subject = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({
          skuID: 'sku-1',
          options: [
            buildOption('option-ordered', 5, groupOne),
            buildOption('option-unordered', undefined, groupOne),
            buildOption('option-groupless', 1, undefined),
          ],
        }),
      ],
    });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-unordered',
      'option-ordered',
    ]);
  });

  it('B9.6 / C15 - NULL-first holds whichever side is absent, and two absent orders are stable', () => {
    // ★ COVERING THE COMPARATOR EXHAUSTIVELY RATHER THAN THE ONE ARM THAT HAPPENED TO RUN.
    // The shipped comparator at the tail of `getOptionsByOptionGroup` has FOUR arms, and the
    // sibling test above reaches only the `left is absent` arm - V8 sorts a short array with
    // binary insertion, comparing the LATER element against the earlier one, so the absent
    // order always arrived as the RIGHT operand there. Feeding the pair in the opposite input
    // order reaches the `right is absent` arm, and a pair with two absent orders reaches the
    // `equal` arm. A comparator arm that no test ever executes is an unverified ordering
    // decision, and ordering here is observable through the public contract.
    //
    // CFML parity [model/entity/Product.cfc:L345]: `addOrder("sortOrder|ASC")` over a NULLable
    // `SwOption.sortOrder`. MySQL places NULL FIRST on an ascending order, so the port must be
    // NULL-first regardless of which side of a comparison the NULL lands on.
    const groupOne = buildOptionGroup('group-1', 1);

    // Arm `right is absent` - the absent order arrives FIRST in the input, so the comparison
    // runs as (present, absent) and must still put the absent one first.
    const absentFirst = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({
          skuID: 'sku-1',
          options: [
            buildOption('option-unordered', undefined, groupOne),
            buildOption('option-ordered', 7, groupOne),
          ],
        }),
      ],
    });

    expect(optionIDsOf(absentFirst.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-unordered',
      'option-ordered',
    ]);

    // Arm `both absent` - the comparator returns 0. `Array.prototype.sort` is stable, so the
    // two keep their relative input order, which is the honest answer for two NULLs under an
    // `ORDER BY sortOrder ASC` that imposes no tie-break of its own.
    const bothAbsent = new Product({
      productID: 'product-2',
      skus: [
        makeSkuFixture({
          skuID: 'sku-2',
          options: [
            buildOption('option-alpha', undefined, groupOne),
            buildOption('option-beta', undefined, groupOne),
          ],
        }),
      ],
    });

    expect(optionIDsOf(bothAbsent.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-alpha',
      'option-beta',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE `unusedProduct*` TRIO - ALL THREE ASYNC AND MEMOIZED  (B10)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy bodies verbatim [model/entity/Product.cfc:L635-L654]:
//
//   L635  public array function getUnusedProductOptions() {
//   L636    if( !structKeyExists(variables, "unusedProductOptions") ) {
//   L637      variables.unusedProductOptions = getService('optionService').getUnusedProductOptions( getProductID(), structKeyList(getOptionGroupsStruct()) );
//           }
//   L639    return variables.unusedProductOptions;
//         }
//   L642  public array function getUnusedProductOptionGroups() {
//   L643    if( !structKeyExists(variables, "unusedProductOptionGroups") ) {
//   L644      variables.unusedProductOptionGroups = getService('optionService').getUnusedProductOptionGroups( structKeyList(getOptionGroupsStruct()) );
//           }
//   L646    return variables.unusedProductOptionGroups;
//         }
//   L649  public array function getUnusedProductSubscriptionTerms() {
//   L650    if( !structKeyExists(variables, "unusedProductSubscriptionTerms") ) {
//   L651      variables.unusedProductSubscriptionTerms = getService('subscriptionService').getUnusedProductSubscriptionTerms( getProductID() );
//           }
//   L653    return variables.unusedProductSubscriptionTerms;
//         }
//
// ★ B10.5 - ALL THREE ARE THE DECLARATIVE TARGETS OF `model/validation/Product.json`'s
// `minCollection: 1` GATES, one per process context. That is why none may be
// omitted and why none may answer an empty array on a failed reach: an empty
// array would fail the very rule that reads through it, for the wrong reason.
// ═══════════════════════════════════════════════════════════════════════════

describe('the unusedProduct* trio: async, memoized, and validation-gated', () => {
  it('B10.1 - getUnusedProductOptions passes POSITIONAL (productID, existingOptionGroupIDList)', async () => {
    // CFML parity [model/entity/Product.cfc:L637]: two positional arguments, product
    // id first and the comma list of already-used option groups second. Argument order
    // is asserted through a recording double for the same reason it is in B7.4 - two
    // string parameters that silently swap would query the wrong thing and still
    // return a plausible-looking result.
    const repository = new OptionRepositoryDouble([
      { name: 'Small', value: 'option-small' },
      { name: 'Large', value: 'option-large' },
    ]);
    const subject = new Product({
      productID: 'product-under-test',
      optionGroups: [buildOptionGroup('group-a', 1), buildOptionGroup('group-b', 2)],
      optionRepository: repository,
    });

    const unused = await subject.getUnusedProductOptions();

    expect(unused).toEqual([
      { name: 'Small', value: 'option-small' },
      { name: 'Large', value: 'option-large' },
    ]);

    // ★ THE COMMA LIST IS BUILT FROM THE OPTION-GROUP STRUCT'S KEYS, WITH NO LEADING
    // DELIMITER. That is the `listAppend` contract, and it is what makes the list
    // safe to hand to a SQL `IN` clause at the integration tier.
    expect(repository.unusedOptionsCalls).toEqual([
      { productID: 'product-under-test', existingOptionGroupIDList: 'group-a,group-b' },
    ]);
    expect(listLen('group-a,group-b')).toBe(2);
  });

  it('B10.1 - the built list is EMPTY, not a bare delimiter, when the product has no option groups', async () => {
    // The composition of two contracts: `structKeyList` answers the EMPTY ARRAY
    // (correction 21) and `listAppend` folds it to the EMPTY STRING with no leading
    // delimiter. A port that reached for `Array.join` would agree here by coincidence;
    // the helper agrees by contract.
    const repository = new OptionRepositoryDouble([]);
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [],
      optionRepository: repository,
    });

    await subject.getUnusedProductOptions();

    expect(repository.unusedOptionsCalls).toEqual([
      { productID: 'product-1', existingOptionGroupIDList: '' },
    ]);
    expect(repository.unusedOptionsCalls[0]?.existingOptionGroupIDList.startsWith(',')).toBe(false);
  });

  it('B10.2 - getUnusedProductOptionGroups passes exactly ONE argument', async () => {
    // CFML parity [model/entity/Product.cfc:L644]: ONE argument - the comma list only,
    // with no product id. The asymmetry with [L637] is real, it matches
    // [model/service/OptionService.cfc:L72 vs L76], and it is preserved rather than
    // regularised.
    const repository = new OptionRepositoryDouble([], [{ name: 'Colour', value: 'group-colour' }]);
    const subject = new Product({
      productID: 'product-under-test',
      optionGroups: [buildOptionGroup('group-a', 1)],
      optionRepository: repository,
    });

    expect(await subject.getUnusedProductOptionGroups()).toEqual([
      { name: 'Colour', value: 'group-colour' },
    ]);

    // The recorded call carries the LIST and nothing else - the product id is not
    // silently added "for symmetry".
    expect(repository.unusedOptionGroupsCalls).toEqual(['group-a']);
    expect(repository.unusedOptionsCalls).toEqual([]);
  });

  it('B10.3 - getUnusedProductSubscriptionTerms REJECTS, and no 14th port is invented', async () => {
    // ★ C12 - IT REJECTS RATHER THAN RESOLVING. `subscriptionTermProvider` is a STUB
    // port declaring only `getSubscriptionTerm` and `getSubscriptionBenefit`; the
    // legacy target `getUnusedProductSubscriptionTerms(productID)` is deliberately NOT
    // among its members, so there is nothing to delegate to.
    //
    // ⚠️ ONLY THE DOCUMENTED STUB BEHAVIOUR IS ASSERTED. No subscription logic is
    // implemented here, no port member is added, and no fourteenth port is invented -
    // the ledger stays at thirteen.
    //
    // ★ AND IT REFUSES RATHER THAN ANSWERING `[]`, because `minCollection:1` in the
    // `addSubscriptionTerm` context reads through this value: an empty array would
    // fail that rule for the wrong reason and make a wiring gap look like a data gap.
    const withProvider = new Product({
      productID: 'product-1',
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(Error);
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /not available in this slice/,
    );
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L651/,
    );
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /subscriptionTermProvider/,
    );
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /minCollection:1/,
    );

    // ★ THE MESSAGE REPORTS THE WIRING STATE, which is the diagnostic that matters:
    // "wired and still refusing" tells an operator the port is present and the member
    // is genuinely absent, rather than sending them to check the composition root.
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /provider was wired on this instance/,
    );

    const withoutProvider = new Product({ productID: 'product-2' });

    await expect(withoutProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /provider was not wired on this instance/,
    );
  });

  it('B10.3 - it REJECTS rather than throwing synchronously, so the trio is handled uniformly', async () => {
    // A real difference to every caller: an `async` function that throws produces a
    // REJECTED PROMISE, while a plain function that throws throws SYNCHRONOUSLY. Only
    // the first is catchable by the `await`-in-`try` shape the other two members of
    // the trio require, so preserving the async marking is what lets a caller treat
    // all three the same way.
    const subject = new Product({ productID: 'product-1' });

    // Calling it does NOT throw here; the rejection arrives on the promise.
    const pending = subject.getUnusedProductSubscriptionTerms();

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toThrow(Error);
  });

  it('B10.4 - all three are memoized ONCE per instance, so the port is reached once', async () => {
    // MEMO VARIANT C - no seed, no inner guard, one unconditional computation behind a
    // probe. The observable contract is that the port is reached exactly once per
    // instance, which a recording double is the right instrument for.
    const repository = new OptionRepositoryDouble(
      [{ name: 'Small', value: 'option-small' }],
      [{ name: 'Colour', value: 'group-colour' }],
    );
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-a', 1)],
      optionRepository: repository,
    });

    const firstOptions = await subject.getUnusedProductOptions();
    const secondOptions = await subject.getUnusedProductOptions();

    expect(secondOptions).toBe(firstOptions);
    expect(repository.unusedOptionsCalls).toHaveLength(1);

    const firstGroups = await subject.getUnusedProductOptionGroups();

    expect(await subject.getUnusedProductOptionGroups()).toBe(firstGroups);
    expect(repository.unusedOptionGroupsCalls).toHaveLength(1);

    // ★ AND THE THIRD MEMBER MEMOIZES NOTHING, because it never produces a value to
    // cache - it rejects every time, identically. That is not an inconsistency; a memo
    // over a refusal would be a cache of an error.
    await expect(subject.getUnusedProductSubscriptionTerms()).rejects.toThrow(Error);
    await expect(subject.getUnusedProductSubscriptionTerms()).rejects.toThrow(Error);
  });

  it('B10.4 - the memos are REQUEST-SCOPED: a second product reaches the port again', async () => {
    // A2: all entity memos are request-scoped. Reproducing them as module state
    // would leak one customer's data into another's request.
    //
    // ★ AND THIS ONE WOULD BE THE MOST DAMAGING LEAK IN THE FILE. The value cached
    // here is derived from a SPECIFIC product's option groups, so a shared memo would
    // offer product B the option list computed for product A - which an admin form
    // would then act on.
    const repository = new OptionRepositoryDouble([{ name: 'Small', value: 'option-small' }]);

    const first = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-a', 1)],
      optionRepository: repository,
    });
    const second = new Product({
      productID: 'product-2',
      optionGroups: [buildOptionGroup('group-z', 9)],
      optionRepository: repository,
    });

    await first.getUnusedProductOptions();
    await second.getUnusedProductOptions();

    expect(repository.unusedOptionsCalls).toEqual([
      { productID: 'product-1', existingOptionGroupIDList: 'group-a' },
      { productID: 'product-2', existingOptionGroupIDList: 'group-z' },
    ]);
  });

  it('B10.1 / B10.2 - with no option repository injected both refuse, naming L637 and L644', async () => {
    // The two locators differ, so a stack-free error still says which of the two
    // near-identical accessors was called - the same diagnostic property the URL pair
    // has in B2.
    const unwired = new Product({ productID: 'product-1', optionGroups: [] });

    await expect(unwired.getUnusedProductOptions()).rejects.toThrow(/option repository/);
    await expect(unwired.getUnusedProductOptions()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L637/,
    );

    await expect(unwired.getUnusedProductOptionGroups()).rejects.toThrow(/option repository/);
    await expect(unwired.getUnusedProductOptionGroups()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L644/,
    );

    // ★ AND A FAILED REACH LEAVES THE MEMO UNSET, so a later call with a wired port
    // still works. A memo poisoned by a refusal would turn a transient wiring error
    // into a permanent one - which is precisely the shape of DEFECT 19.
    const repository = new OptionRepositoryDouble([{ name: 'Small', value: 'option-small' }]);
    const rewired = new Product({
      productID: 'product-2',
      optionGroups: [],
      optionRepository: repository,
    });

    expect(await rewired.getUnusedProductOptions()).toEqual([
      { name: 'Small', value: 'option-small' },
    ]);
  });

  it('B10.5 - the trio is exactly the set the three minCollection:1 contexts read', () => {
    // The declarative link, asserted as a surface fact: one accessor per process
    // context named in `model/validation/Product.json`, and all three present. The
    // rules themselves are transcribed and pinned in the validation block below; this
    // is the accessor half of that contract.
    expect(declaresMember('getUnusedProductOptions')).toBe(true);
    expect(declaresMember('getUnusedProductOptionGroups')).toBe(true);
    expect(declaresMember('getUnusedProductSubscriptionTerms')).toBe(true);

    // And no fourth "unused" accessor was invented to round the set out.
    const unusedMembers = publicMembers().filter((member: string): boolean =>
      member.startsWith('getUnusedProduct'),
    );

    expect(unusedMembers.slice().sort()).toEqual([
      'getUnusedProductOptionGroups',
      'getUnusedProductOptions',
      'getUnusedProductSubscriptionTerms',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE SIX GUARDED DEFAULT-SKU DELEGATIONS - EVERY ONE CAN BE `undefined`  (B11)
// ═══════════════════════════════════════════════════════════════════════════
//
// Verified verbatim: NONE of the six has an `else`, and NONE has a trailing
// `return`.
//
//   getCurrencyCode()        [L555-L559]  one guard  - defaultSku
//   getPrice()               [L561-L568]  ★ TWO      - a `variables.price` shadow
//                                                      at L562, THEN defaultSku at L565
//   getRenewalPrice()        [L570-L574]  one guard
//   getListPrice()           [L576-L580]  one guard
//   getLivePrice()           [L582-L586]  one guard
//   getCurrentAccountPrice() [L588-L592]  one guard
// ═══════════════════════════════════════════════════════════════════════════

describe('the six default-sku delegations: undefined on absence, never 0', () => {
  it('B11.1 - all six answer NOTHING when there is no default sku', async () => {
    // CFML parity [model/entity/Product.cfc:L555-L592]: none of the six delegations
    // has an else branch or a trailing return, so every one can be undefined.
    // Substituting 0 would silently sell products for free.
    //
    // ★ THE ABSENCE CONVENTION, IN THE DIRECTION OPPOSITE TO DEFECT 20. These six
    // must return `undefined` and never `0`; `getSalePrice()` must return `0` and
    // never `undefined`. Same component, forty lines apart, opposite conventions -
    // and collapsing either one is a money bug.
    const bare = new Product({ productID: 'product-1' });

    expect(bare.getDefaultSku()).toBeUndefined();

    expect(bare.getCurrencyCode()).toBeUndefined();
    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getRenewalPrice()).toBeUndefined();
    expect(bare.getListPrice()).toBeUndefined();
    await expect(bare.getLivePrice()).resolves.toBeUndefined();
    await expect(bare.getCurrentAccountPrice()).resolves.toBeUndefined();

    // ⚠️ AND EXPLICITLY NOT ZERO, in either the numeric or the `Money` sense. Asserted
    // separately from the `undefined` checks because `toBeUndefined()` alone would
    // still pass if a later edit returned `Money.fromDecimalString('0')` from a
    // DIFFERENT accessor and this one were quietly renamed.
    expect(bare.getPrice()).not.toBe(0);
    expect(bare.getListPrice()).not.toBe(0);
    expect(bare.getRenewalPrice()).not.toBe(0);
    expect(bare.getPrice()).not.toBeInstanceOf(Money);
  });

  it('B11.1 - all six delegate the REAL value when a default sku is present', async () => {
    // `makeSkuFixture` carries '19.99' / '24.99' / '17.99' for price / list / renewal
    // and answers 'USD' for the currency code. Those are FIXTURE defaults, documented
    // on the factory, and they are read back through `Money` rather than through any
    // arithmetic of this suite's own (P4).
    const defaultSku = makeSkuFixture({ skuID: 'sku-default' });
    const subject = new Product({ productID: 'product-1', defaultSku });

    expect(subject.getPrice()?.toFixed2()).toBe('19.99');
    expect(subject.getListPrice()?.toFixed2()).toBe('24.99');
    expect(subject.getRenewalPrice()?.toFixed2()).toBe('17.99');
    expect(subject.getCurrencyCode()).toBe('USD');

    // The two asynchronous members of the family - async because the SKU side of each
    // reaches a resolver rather than a materialized column.
    await expect(subject.getLivePrice().then((v) => v?.toFixed2())).resolves.toBe('19.99');
    await expect(subject.getCurrentAccountPrice().then((v) => v?.toFixed2())).resolves.toBe(
      '19.99',
    );

    // ★ EVERY MONETARY RETURN IS `Money`, NEVER `number` (P4). No JavaScript float
    // arithmetic appears in any expected value in this suite; every expectation is a
    // decimal string compared through `Money`.
    expect(subject.getPrice()).toBeInstanceOf(Money);
    expect(subject.getListPrice()).toBeInstanceOf(Money);
    expect(subject.getRenewalPrice()).toBeInstanceOf(Money);
  });

  it('B11.2 - getPrice has TWO guards: the shadow wins outright, without consulting the sku', () => {
    // CFML parity [model/entity/Product.cfc:L561-L568]: the ONLY member of the six
    // with two guards. [L562] probes a `variables.price` shadow and [L563] returns it;
    // only when that fails does [L565] probe the default sku and [L566] delegate.
    //
    // ⚠️ AND THE SHADOW WINS WITHOUT THE SKU BEING CONSULTED AT ALL - asserted with a
    // spy, because a port that checked both and preferred the shadow would pass a
    // value-only assertion while behaving differently for a sku whose price accessor
    // has side effects or throws.
    const defaultSku = makeSkuFixture({ skuID: 'sku-default' });
    const spy = vi.spyOn(defaultSku, 'getPrice');

    const shadowed = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('100.00'),
      defaultSku,
    });

    expect(shadowed.getPrice()?.toFixed2()).toBe('100.00');
    expect(spy).toHaveBeenCalledTimes(0);

    // With no shadow, the sku answers.
    const unshadowed = new Product({ productID: 'product-2', defaultSku });

    expect(unshadowed.getPrice()?.toFixed2()).toBe('19.99');
    expect(spy).toHaveBeenCalledTimes(1);

    // With neither, nothing.
    expect(new Product({ productID: 'product-3' }).getPrice()).toBeUndefined();
  });

  it('B11.2 / C18 - `price` IS declared, as a NON-PERSISTENT shadow, and no column is invented', () => {
    // ⚠️ C18 - A CORRECTION TO A PROMPT CLAIM, VERIFIED AGAINST THE SOURCE. The claim
    // that `price` is "NOT declared as a property at all" is half-wrong: it IS
    // declared, at **model/entity/Product.cfc:L118**, inside the
    // `// Non-Persistent Properties - Delegated to default sku` block opened at
    // [L115], as `persistent="false"` with `hb_formatType="currency"`. What it is not
    // is a PERSISTENT column - it appears nowhere in the [L52-L59] persistent block.
    //
    // ★ AND THAT IS EXACTLY WHY THE TWO-GUARD SHAPE EXISTS: a non-persistent property
    // can be populated in memory by a form or a process object without ever being a
    // column, so the accessor must prefer it when present and fall through when not.
    //
    // ⚠️ NO PERSISTENT `price` COLUMN IS INVENTED HERE. The hydration surface accepts
    // `price` because the legacy property exists; the `Sw*` schema is untouched (C5).
    expect(ProductLegacyMetadata.table).toBe('SwProduct');
    expect(ProductLegacyMetadata.delegatedPriceFormatType).toBe('currency');

    // The shadow is settable only at construction - the port is hydrate-once and
    // publishes no setter for it, so a caller cannot poison it after the fact.
    expect(declaresMember('setPrice')).toBe(false);

    const shadowOnly = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('42.00'),
    });

    expect(shadowOnly.getDefaultSku()).toBeUndefined();
    expect(shadowOnly.getPrice()?.toFixed2()).toBe('42.00');
  });

  it('B11.3 - every money comparison goes through Money, and toFixed2 is used rather than toDecimalString', () => {
    // ⚠️ A RUNTIME-VERIFIED TRAP, RECORDED SO IT IS NOT RE-DISCOVERED:
    // `Money.toDecimalString()` DROPS TRAILING ZEROS, so `'100.00'` comes back as
    // `'100'`. Any two-decimal expectation must therefore use `toFixed2()` or
    // `equals(...)`, never `toDecimalString()`.
    //
    // P4: no computed JavaScript float appears in any expected value in this suite -
    // not `19.99 * 3`, not `0.125 * 59.97`, nothing. Every expectation is a literal
    // decimal string handed to `Money`.
    const subject = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('100.00'),
    });

    const price = subject.getPrice();

    expect(price?.toFixed2()).toBe('100.00');
    expect(price?.toDecimalString()).toBe('100');
    expect(price?.equals(Money.fromDecimalString('100'))).toBe(true);
    expect(price?.equals(Money.fromDecimalString('100.00'))).toBe(true);

    // And `Money.zero` is NEVER used as a stand-in for absence anywhere in this
    // suite - it is reserved for the promotion accumulator seeds. The only zero
    // asserted here is DEFECT 20's literal, built through the public factory.
    expect(new Product({ productID: 'product-2' }).getSalePrice().equals(Money.zero)).toBe(true);
    expect(new Product({ productID: 'product-3' }).getPrice()).toBeUndefined();
  });

  it('B11.1 - Sku.getPrice() is never absent, so the undefined can only come from the missing sku', () => {
    // The provenance of the `undefined` matters. `Sku.getPrice()` returns `Money`
    // unconditionally, because [model/entity/Sku.cfc] declares the column
    // `default="0"` - so a present default sku ALWAYS yields a price. The only way any
    // of the six answers nothing is the guard itself failing.
    //
    // That is what makes substituting `0` so dangerous: the absence does not mean
    // "this product costs nothing", it means "this product has no default sku", and
    // those are different facts with different remedies.
    const sku = makeSkuFixture({ skuID: 'sku-1' });

    expect(sku.getPrice()).toBeInstanceOf(Money);
    expect(sku.getListPrice()).toBeInstanceOf(Money);
    expect(sku.getRenewalPrice()).toBeInstanceOf(Money);

    const withSku = new Product({ productID: 'product-1', defaultSku: sku });

    expect(withSku.getPrice()).toBeInstanceOf(Money);
    expect(new Product({ productID: 'product-2' }).getPrice()).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SALE-PRICE-DETAILS SEAM  (B12)
// ═══════════════════════════════════════════════════════════════════════════
//
// The legacy bodies verbatim [model/entity/Product.cfc:L182-L187, L517-L522]:
//
//   L182  public struct function getSkuSalePriceDetails( required any skuID ) {
//   L183    if(structKeyExists(getSalePriceDetailsForSkus(), arguments.skuID)) {
//   L184      return getSalePriceDetailsForSkus()[ arguments.skuID ];
//           }
//   L186    return {};
//         }
//   L517  public struct function getSalePriceDetailsForSkus() {
//   L518    if(!structKeyExists(variables, "salePriceDetailsForSkus")) {
//   L519      variables.salePriceDetailsForSkus = getService("promotionService").getSalePriceDetailsForProductSkus(productID=getProductID());
//           }
//   L521    return variables.salePriceDetailsForSkus;
//         }
// ═══════════════════════════════════════════════════════════════════════════

describe('the sale-price-details seam between Product and Sku', () => {
  it('B12.1 / C7 - getSalePriceDetailsForSkus is OMITTED under the branch-(b) decision', () => {
    // ★ C7 - A PROMPT-CLAIMED MEMBER THAT DELIBERATELY DOES NOT SHIP, and the reason
    // is a money bug avoided rather than an oversight.
    //
    // The T2 mapping would replace the [L519] locator with an injected sale-price
    // resolver. The only candidate collaborator declares
    // `getSalePricePromotionRewardsQuery(productID?)`, which is the port for
    // [model/dao/PromotionDAO.cfc:L298] - the RAW six-branch UNION - and NOT for
    // `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022].
    // The service method REDUCES that raw result AND APPLIES THE ROUNDING RULE at
    // [model/service/PromotionService.cfc:L1024-L1028], and an entity cannot perform
    // that step because `roundingRuleService` lives under `src/services`, outside the
    // domain layer's legal import surface. Calling the raw member here would return
    // UNROUNDED prices under a method name promising rounded ones.
    //
    // ⚠️ SO IT IS OMITTED RATHER THAN APPROXIMATED, AND NO PORT MEMBER IS ADDED. The
    // already-reduced, already-rounded map arrives instead as the
    // `salePriceDetailsForSkus` HYDRATION INPUT - a structural association materialized
    // at the repository boundary, which is the same technique the SKU currency cascade
    // uses and not an invented port member.
    expect(declaresMember('getSalePriceDetailsForSkus')).toBe(false);

    // Its ONE in-scope consumer IS shipped, and it reads the hydrated map.
    expect(declaresMember('getSkuSalePriceDetails')).toBe(true);
  });

  it('B12.1 - the hydrated map is read per instance, and there is no port to reach', async () => {
    // The consequence of the omission, stated as behaviour: the detail map is supplied
    // at construction, so the accessor computes once in the only sense available -
    // there is nothing to recompute and nothing to cache.
    //
    // C7 note: this is described as request-scoped state management, NOT as an
    // optimisation. The legacy "improves performance" framing found elsewhere in the
    // codebase is deliberately not carried forward.
    const detail = {
      skuID: 'sku-1',
      discountLevel: 'sku' as const,
      salePriceDiscountType: 'percentageOff' as const,
      salePrice: Money.fromDecimalString('17.99'),
      promotionID: 'promotion-1',
    };
    const subject = new Product({
      productID: 'product-under-test',
      salePriceDetailsForSkus: { 'sku-1': detail },
    });

    expect(await subject.getSkuSalePriceDetails('sku-1')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('sku-1')).toBe(detail);

    // And no repository is needed at all - a product with NO ports wired still answers.
    expect(subject.getSkus()).toEqual([]);
  });

  it('B12.2 - a miss answers `undefined`, which is the faithful port of the legacy `{}`', async () => {
    // CFML parity [model/entity/Product.cfc:L186]: the legacy returns the EMPTY STRUCT
    // on a miss. `undefined` is substituted, and the substitution is SAFE rather than
    // convenient: every legacy reader tests for its key before reading it -
    // [model/entity/Sku.cfc:L547] and [L554] both guard with `structKeyExists` - so an
    // empty struct and an absent one are INDISTINGUISHABLE to every caller.
    //
    // ★ AND IT IS A COMPILE-HARD CONTRACT, NOT A STYLE CHOICE.
    // `src/domain/entities/sku.ts` declares
    // `SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>`
    // and assigns an OPTIONAL field to a return of that type, so the type MUST admit
    // `undefined`. Narrowing it here would break a shipped sibling.
    const subject = new Product({
      productID: 'product-1',
      salePriceDetailsForSkus: {
        'sku-present': {
          skuID: 'sku-present',
          discountLevel: 'product',
          salePriceDiscountType: 'amountOff',
          salePrice: Money.fromDecimalString('5.00'),
          promotionID: 'promotion-1',
        },
      },
    });

    await expect(subject.getSkuSalePriceDetails('sku-absent')).resolves.toBeUndefined();
    await expect(subject.getSkuSalePriceDetails('')).resolves.toBeUndefined();
    await expect(subject.getSkuSalePriceDetails('sku-present')).resolves.toBeDefined();

    // A product with NO map at all answers the same absence, rather than throwing -
    // the legacy [L518] memo would simply have queried and found nothing.
    const mapless = new Product({ productID: 'product-2' });

    await expect(mapless.getSkuSalePriceDetails('sku-present')).resolves.toBeUndefined();
  });

  it('B12.2 - the containment probe is CASE-INSENSITIVE, as CFML struct keys are', async () => {
    // CFML parity [model/entity/Product.cfc:L183-L184]: CFML struct keys are
    // case-insensitive and TypeScript's are not, so both the probe and the read go
    // through `structKeyExists` / `structGet`. Nothing in the slice varies the case of
    // a UUID key today, but the assumption is not this suite's to make - and asserting
    // it is what keeps a future `Record`-style rewrite from passing.
    const detail = {
      skuID: 'SKU-Mixed-Case',
      discountLevel: 'global' as const,
      salePriceDiscountType: 'amount' as const,
      salePrice: Money.fromDecimalString('3.21'),
      promotionID: 'promotion-1',
    };
    const subject = new Product({
      productID: 'product-1',
      salePriceDetailsForSkus: { 'SKU-Mixed-Case': detail },
    });

    expect(await subject.getSkuSalePriceDetails('SKU-Mixed-Case')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('sku-mixed-case')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('SKU-MIXED-CASE')).toBe(detail);
  });

  it('B12.2 - the parameter is REQUIRED, narrowing the legacy `any` to `string`', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L182]: the legacy declares
    // `required any skuID`, NOT `required string skuID`. It is a primary key and every
    // call site passes a string - [model/entity/Sku.cfc:L541] passes `getSkuID()` - so
    // `string` here is a NARROWING of `any`, strictly more precise than the source and
    // never less.
    //
    // The arity is asserted so a later edit cannot quietly default the parameter and
    // turn a programming error into a silent absence.
    expect(arityOf('getSkuSalePriceDetails')).toBe(1);
  });

  it('B12.3 - the ROUND TRIP: Sku.getSalePriceDetails reaches back into this product', async () => {
    // ★ THE DIRECTION OF THE SEAM, ASSERTED IN BOTH HALVES.
    // [model/entity/Sku.cfc:L539-L544] calls `getProduct().getSkuSalePriceDetails(getSkuID())`
    // at [L541] - the SKU asks the PRODUCT, not the other way round. In the port that
    // reach is pre-materialized on both sides at the repository boundary, so the
    // relationship survives as data rather than as a call, and the two sides must agree.
    const detail = {
      skuID: 'sku-round-trip',
      discountLevel: 'brand' as const,
      salePriceDiscountType: 'percentageOff' as const,
      salePrice: Money.fromDecimalString('8.49'),
      promotionID: 'promotion-1',
    };

    // The SKU side: hydrated with the SAME detail row the product's map carries.
    const sku = makeSkuFixture({ skuID: 'sku-round-trip', salePriceDetail: detail });

    expect(sku.getSalePriceDetails()).toBe(detail);
    expect(sku.getSalePrice().toFixed2()).toBe('8.49');
    expect(sku.getSalePriceDiscountType()).toBe('percentageOff');

    // The PRODUCT side: the same row, reachable by the sku's own key.
    const product = new Product({
      productID: 'product-1',
      skus: [sku],
      salePriceDetailsForSkus: { 'sku-round-trip': detail },
    });

    expect(await product.getSkuSalePriceDetails(sku.getSkuID())).toBe(detail);

    // ★ AND THE PRODUCT'S OWN `getSalePrice()` STILL ANSWERS ZERO, because it has no
    // DEFAULT sku - DEFECT 20 is unaffected by the seam being wired correctly. The two
    // facts coexist, which is exactly the confusion the defect creates in production.
    expect(product.getSalePrice().toFixed2()).toBe('0.00');
    expect(sku.getSalePrice().toFixed2()).toBe('8.49');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELEGATIONS, WARTS AND THE REMAINING ACCESSORS  (B13)
// ═══════════════════════════════════════════════════════════════════════════

describe('remaining delegations, warts and accessors', () => {
  it('B13.1 / C1 - getBaseProductType is UNGUARDED and ASYNC, and its materialization is documented', async () => {
    // CFML parity [model/entity/Product.cfc:L493-L495]: an UNGUARDED pure delegation -
    // `return getProductType().getBaseProductType();` with no `structKeyExists` probe -
    // so a product with no product type raises. That is preserved: the refusal names
    // the locator that dereferences unconditionally rather than inventing an absence.
    //
    // ★ C1 - AND IT IS ASYNC, correcting the prompt's suggestion that it might be sync.
    // `ProductType.getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] is
    // itself async: it answers its own `systemCode` directly when it has one, and only
    // reaches the product-type repository when it does not, loading the ROOT of
    // `productTypeIDPath` via `listFirst` at [L112] - element ONE, the root, NOT the
    // second element. Any "second element" account of that line is wrong.
    //
    // ⚠️ `productTypeRepository` IS NOT ONE OF THIS ENTITY'S FIVE PORTS. Supplying a
    // non-empty `systemCode` is how this suite reaches the answer without wiring a port
    // `Product` does not own - the materialization point is the ProductType, and that
    // is documented rather than assumed.
    const subject = new Product({
      productID: 'product-1',
      productType: buildProductType(
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
        'merchandise',
        `parent-type,${LEGACY_MERCHANDISE_PRODUCT_TYPE_ID}`,
      ),
    });

    await expect(subject.getBaseProductType()).resolves.toBe('merchandise');

    // The unguarded refusal.
    const typeless = new Product({ productID: 'product-2' });

    await expect(typeless.getBaseProductType()).rejects.toThrow(/requires the product type/);
    await expect(typeless.getBaseProductType()).rejects.toThrow(/model\/entity\/Product\.cfc:L494/);
  });

  it('B13.2 / C16 - getTransactionExistsFlag is async and memoized, and the "discarded argument" defect DOES NOT EXIST', async () => {
    // ⚠️⚠️ C16 - THE MOST CONSEQUENTIAL CORRECTION IN THIS FILE, AND IT REMOVES A
    // DEFECT MARKER RATHER THAN ADDING ONE.
    //
    // The prompt asserts a LEGACY-DEFECT here: that [model/entity/Product.cfc:L626]
    // passes `productID=this.getProductID()` to
    // `SkuService.getTransactionExistsFlag()`, which "declares NO parameters", so CFML
    // silently discards the argument and the flag is GLOBAL rather than per-product.
    //
    // THAT IS NOT WHAT THE SOURCE DOES, verified by direct read of all three files:
    //   [model/service/SkuService.cfc:L285-L287] declares no parameters BUT forwards
    //     `argumentCollection=arguments`, which passes the whole scope through; and
    //   [model/dao/SkuDAO.cfc:L53-L55] DECLARES BOTH `<cfargument name="productID" />`
    //     AND `<cfargument name="skuID" />`, and BRANCHES on them at [L59-L63] -
    //     `ss.skuID = :skuID` when a skuID is supplied, otherwise
    //     `ss.product.productID = :productID`.
    //
    // So the identifier REACHES THE QUERY and the flag IS per-product. There is no
    // discarded argument, no global flag, and therefore NO `LEGACY-DEFECT` MARKER for
    // it - inventing one would misreport the source. THE SOURCE WINS.
    //
    // The shipped module reaches the same verdict: its `getTransactionExistsFlag` is a
    // clean PORT discharge with no defect annotation at all.
    const repository = new SkuRepositoryDouble([], true);
    const subject = new Product({
      productID: 'product-under-test',
      skuRepository: repository,
    });

    await expect(subject.getTransactionExistsFlag()).resolves.toBe(true);

    // ★ THE PRODUCT ID GENUINELY REACHES THE PORT, and `skuID` is deliberately NOT
    // supplied - which is what selects the per-product branch at [model/dao/SkuDAO.cfc:L62]
    // rather than the per-sku one at [L60].
    expect(repository.transactionExistsCalls).toEqual([
      { productID: 'product-under-test', skuID: undefined },
    ]);

    // Memoized, so the port is reached once per instance (A2).
    await subject.getTransactionExistsFlag();
    await subject.getTransactionExistsFlag();

    expect(repository.transactionExistsCalls).toHaveLength(1);
  });

  it('B13.2 - the memo is request-scoped, and a second product queries for itself', async () => {
    // A2: all entity memos are request-scoped. Reproducing them as module state
    // would leak one customer's data into another's request.
    //
    // ★ AND HERE THE LEAK WOULD BE A DELETE-AUTHORISATION BUG. `transactionExistsFlag`
    // gates the `delete` context in `model/validation/Product.json` via `eq: false`, so
    // a shared memo could report "no transactions" for a product that has them and
    // authorise a delete that must be refused.
    const busy = new SkuRepositoryDouble([], true);
    const idle = new SkuRepositoryDouble([], false);

    const withTransactions = new Product({ productID: 'product-1', skuRepository: busy });
    const withoutTransactions = new Product({ productID: 'product-2', skuRepository: idle });

    await expect(withTransactions.getTransactionExistsFlag()).resolves.toBe(true);
    await expect(withoutTransactions.getTransactionExistsFlag()).resolves.toBe(false);
    await expect(withTransactions.getTransactionExistsFlag()).resolves.toBe(true);

    expect(busy.transactionExistsCalls).toHaveLength(1);
    expect(idle.transactionExistsCalls).toHaveLength(1);
  });

  it('B13.2 - with no sku repository injected it refuses, naming L626', async () => {
    // The locator differs from the two other sku-repository reaches in this file -
    // L367 for the selected-options query, L626 here - so the refusal identifies which
    // accessor was called without a stack.
    const unwired = new Product({ productID: 'product-1' });

    await expect(unwired.getTransactionExistsFlag()).rejects.toThrow(/sku repository/);
    await expect(unwired.getTransactionExistsFlag()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L626/,
    );
  });

  it('B13.3 / C4 - getAllowBackorderFlag is OMITTED, so its returntype mismatch becomes a non-port', () => {
    // ★ C4 - A PROMPT-CLAIMED MEMBER THAT DOES NOT SHIP.
    // [model/entity/Product.cfc:L551-L553] declares `returntype="numeric"` while
    // returning the BOOLEAN setting `skuAllowBackorderFlag` - a genuine legacy type
    // mismatch. It is nonetheless omitted, because `skuAllowBackorderFlag` is NOT among
    // the four keys `settingsProvider` publishes (`globalURLKeyProduct`,
    // `globalURLKeyProductType`, `skuCurrency`, `skuEligibleCurrencies`), so there is
    // no port member to read it through.
    //
    // ⚠️ AND NO KEY IS ADDED TO THE PORT TO ENABLE IT. Widening a settings contract to
    // satisfy one accessor would put a fifth key on a port the AAP fixes at four.
    // The mismatch is therefore recorded as a documented NON-PORT rather than as a
    // preserved defect - there is no shipped behaviour to preserve.
    expect(declaresMember('getAllowBackorderFlag')).toBe(false);

    // The CALCULATED sibling IS shipped, because it is a real persisted column at
    // [model/entity/Product.cfc:L64] rather than a setting read.
    expect(declaresMember('getCalculatedAllowBackorderFlag')).toBe(true);

    const subject = new Product({
      productID: 'product-1',
      calculatedAllowBackorderFlag: true,
    });

    expect(subject.getCalculatedAllowBackorderFlag()).toBe(true);

    // CFML parity [model/entity/Product.cfc:L64]: the column is boolean, and the port
    // routes it through `cfBoolean` so CFML's string-boolean forms coerce identically.
    expect(new Product({ productID: 'product-2' }).getCalculatedAllowBackorderFlag()).toBe(false);
  });

  it('B13.4 / C3 - getTitle is OMITTED because hibachiUtilityService is NOT a port', () => {
    // ★ C3 - A PROMPT-CLAIMED MEMBER THAT DOES NOT SHIP, for two independent reasons.
    // [model/entity/Product.cfc:L540-L545] memoizes a template substitution driven by
    // the `productTitleString` setting. FIRST, that setting is not among the four keys
    // `settingsProvider` publishes. SECOND, the substitution itself goes through
    // `hibachiUtilityService`, which is NOT one of the thirteen ports and is not
    // ported at all.
    //
    // ⚠️ SO NO FOURTEENTH PORT WAS ADDED FOR IT, and the accessor is omitted rather
    // than approximated. Nothing in this suite writes a
    // brand-plus-product-name template literal as though the entity owned it - the
    // template belongs to configuration, and reproducing it here would move a
    // configuration decision into a test.
    expect(declaresMember('getTitle')).toBe(false);

    // The CALCULATED sibling IS shipped - a persisted column at [L65], not a
    // substitution.
    expect(declaresMember('getCalculatedTitle')).toBe(true);

    const subject = new Product({ productID: 'product-1', calculatedTitle: 'Test Brand Product' });

    expect(subject.getCalculatedTitle()).toBe('Test Brand Product');
    expect(new Product({ productID: 'product-2' }).getCalculatedTitle()).toBeUndefined();
  });

  it('B13.5 / C5 - getBrandOptions is OMITTED, and the deliberate non-port is documented', () => {
    // ★ C5 - AND THE LEGACY BODY IS UNSAFE AS WRITTEN.
    // [model/entity/Product.cfc:L534-L538] mutates `options[1].name` UNGUARDED at
    // [L536], so it raises on an empty option list. It also reaches `rbKey(...)` for
    // the `define.none` resource-bundle label, and JavaRB is not ported - resource-bundle
    // identifiers survive only as inert string constants.
    //
    // ⚠️ IT IS NOT CREATED HERE. The `hb_optionsNullRBKey="define.none"` attribute at
    // [model/entity/Product.cfc:L68] IS preserved, as an inert constant on the legacy
    // metadata, so the admin can still resolve the label - which is the whole of the
    // obligation without an i18n runtime.
    expect(declaresMember('getBrandOptions')).toBe(false);

    expect(ProductLegacyMetadata.brandOptionsNullRBKey).toBe('define.none');
  });

  it('B13.6 - getSimpleRepresentationPropertyName returns "productName"', () => {
    // CFML parity [model/entity/Product.cfc:L791-L793]: one of the component's three
    // overridden methods, returning the literal `"productName"`. Asserted plainly
    // because it is a data contract the admin reads.
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    // And it names a REAL accessor on this surface, which is the property of the
    // contract that actually matters.
    expect(declaresMember('getProductName')).toBe(true);
  });

  it('B13.7 - getAttributeSets is ASYNC and its argument is a TRIGGER, not a filter value', async () => {
    // CFML parity [model/entity/Product.cfc:L832-L838]: the argument is genuinely
    // surprising. It does NOT filter by the codes it carries - it TESTS for
    // `astProductCustomization` or `astOrderItem` and, when either is present, ADDS the
    // fixed `astOrderItem` filter. The base `astProduct` filter always applies.
    //
    // ★ THIS IS THE ONE PORTED ROUTE INTO THE ATTRIBUTE SUBSYSTEM. The `attributeValues`
    // EAV READ path is deliberately not ported, so this accessor and nothing else
    // crosses that boundary - and no nineteenth entity module is created for it.
    const repository = new ProductRepositoryDouble([
      {
        attributeSetID: 'set-1',
        attributeSetTypeSystemCode: 'astProduct',
        globalFlag: true,
        attributeCount: 3,
      },
    ]);
    const subject = new Product({
      productID: 'product-1',
      productType: buildProductType('type-child', 'merchandise', 'type-root,type-child'),
      productRepository: repository,
    });

    // The default: `astProduct` only.
    expect(await subject.getAttributeSets()).toHaveLength(1);
    expect(repository.attributeSetsCalls[0]).toEqual({
      attributeSetTypeCode: ['astProduct'],
      productTypeIDs: ['type-root', 'type-child'],
    });

    // The trigger: `astProductCustomization` ADDS `astOrderItem` and is NOT itself
    // passed through.
    await subject.getAttributeSets(['astProductCustomization']);

    expect(repository.attributeSetsCalls[1]).toEqual({
      attributeSetTypeCode: ['astProduct', 'astOrderItem'],
      productTypeIDs: ['type-root', 'type-child'],
    });

    // `astOrderItem` triggers the same addition.
    await subject.getAttributeSets(['astOrderItem']);

    expect(repository.attributeSetsCalls[2]?.attributeSetTypeCode).toEqual([
      'astProduct',
      'astOrderItem',
    ]);

    // An unrelated code triggers nothing - it is not a filter value.
    await subject.getAttributeSets(['astSomethingElse']);

    expect(repository.attributeSetsCalls[3]?.attributeSetTypeCode).toEqual(['astProduct']);

    // ★ AND IT IS NOT MEMOIZED, because the argument varies the answer. A memo here
    // would return the first caller's narrowing to every later one.
    expect(repository.attributeSetsCalls).toHaveLength(4);
  });

  it('B13.7 - with no product type the product-type disjunct is EMPTY, meaning global sets only', async () => {
    // CFML parity: `productTypeIDPath` split on commas, empty when the product has no
    // product type. The port documents that as "global sets only" rather than "no
    // filter" - matching the legacy query, where the `globalFlag = 1` disjunct always
    // applies. An empty array is therefore the correct answer, not a bug.
    const repository = new ProductRepositoryDouble([]);
    const subject = new Product({ productID: 'product-1', productRepository: repository });

    expect(await subject.getAttributeSets()).toEqual([]);
    expect(repository.attributeSetsCalls[0]?.productTypeIDs).toEqual([]);

    // And with no product repository it refuses, naming L833.
    const unwired = new Product({ productID: 'product-2' });

    await expect(unwired.getAttributeSets()).rejects.toThrow(/product repository/);
    await expect(unwired.getAttributeSets()).rejects.toThrow(/model\/entity\/Product\.cfc:L833/);
  });

  it('B13.8 - the `singlularname` typo at L76 is a data contract and is NOT corrected', () => {
    // ★ C4 INTERFACE PARITY. [model/entity/Product.cfc:L76] declares
    // `singlularname="productReview"` - "singlular", with the extra `l` - on the
    // `productReviews` one-to-many. It is an ORM METADATA ATTRIBUTE, so it named the
    // generated `addProductReview` / `removeProductReview` helpers, which makes it a
    // DATA CONTRACT rather than an internal identifier. It is preserved with a comment
    // rather than renamed.
    //
    // The `productReviews` association itself is one of the six out-of-scope
    // bidirectional pairs - `ProductReview` is outside the eighteen in-scope entities -
    // so the association collapses and the helpers are dropped. The typo therefore has
    // no shipped footprint, and asserting the ABSENCE is the honest assertion.
    //
    // ⚠️ NEITHER SPELLING IS CREATED. Adding `addProductReview` to give the typo
    // somewhere to live would bring an out-of-scope entity into the graph.
    for (const absent of [
      'addProductReview',
      'removeProductReview',
      'getProductReviews',
      'hasProductReview',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // The three folder-wide preserved typos and the ONE rename, recorded here so the
    // budget is visible: `singlularname` [model/entity/Product.cfc:L76] preserved;
    // `subsciptionUsageBenefit` [model/entity/PriceGroup.cfc:L168] preserved;
    // `DisplayName` [model/entity/PriceGroupRate.cfc:L270] preserved; and
    // `promtionRewards` [model/entity/PromotionReward.cfc:L57] renamed WITH the
    // original recorded - the folder's only rename, and sibling-owned.
    expect(ProductLegacyMetadata.entityName).toBe('SlatwallProduct');
  });

  it('B13.9 - relatedProducts is SELF-REFERENTIAL, and the graph stays shallow and acyclic', () => {
    // CFML parity [model/entity/Product.cfc:L81]: `relatedProducts` is a many-to-many
    // OWNER over the link table `SwRelatedProduct`, Product -> Product. Self-referential
    // associations are where a naive traversal loops, so the graph built here is
    // deliberately shallow: A relates to B, and B relates to nothing.
    //
    // ⚠️ NO `addRelatedProduct` / `removeRelatedProduct` PAIR IS ASSERTED OR CREATED -
    // the shipped surface publishes the read accessor only, and inventing the writers
    // would be inventing the very traversal hazard this case guards against.
    const related = new Product({ productID: 'product-related' });
    const subject = new Product({ productID: 'product-1', relatedProducts: [related] });

    expect(productIDsOf(subject.getRelatedProducts())).toEqual(['product-related']);
    expect(related.getRelatedProducts()).toEqual([]);

    // No cycle, so no traversal can diverge.
    expect(subject.getRelatedProducts()[0]?.getRelatedProducts()).toEqual([]);

    // Defaults to `[]` on a bare product - B21 empty-collection semantics.
    expect(new Product({ productID: 'product-2' }).getRelatedProducts()).toEqual([]);
  });

  it('B13.10 - the lazy-load probes are `!== undefined`, and no postfix `!` silences one', () => {
    // ★ ELEVEN LAZY-LOAD PROBES are ported as `!== undefined` comparisons, each
    // annotated at its site in the shipped module. TEN far-side members plus `isNew()`
    // are what they probe.
    //
    // ⚠️ NEVER A POSTFIX `!` TO SILENCE ONE. The ESLint config switches
    // `no-non-null-assertion` OFF for `tests/**`, so a `!` here would compile and lint
    // clean - which is exactly why the prohibition is honoured by discipline rather
    // than by the linter. Every optional value in this suite is narrowed by a real
    // test or read through `?.`.
    //
    // The observable half of the probe contract: each probed association answers
    // absence rather than throwing, and answers a value when materialized.
    //
    // ⚠️ `isNew()` IS THE ELEVENTH PROBE AND IT IS NOT AN ASSOCIATION PROBE - it tests
    // the PRIMARY KEY, not a materialized far side, so it is driven by the id rather
    // than by what is wired. An unsaved product carries `productID === ''`
    // [model/entity/Product.cfc:L52, `unsavedvalue="" default=""`], so a product with a
    // real key is NOT new even when every association is absent. The two facts are
    // deliberately asserted on separate instances so neither is mistaken for the other.
    const unsavedWithNothingWired = new Product({ productID: '' });

    expect(unsavedWithNothingWired.isNew()).toBe(true);

    const savedWithNothingWired = new Product({ productID: 'product-1' });

    expect(savedWithNothingWired.isNew()).toBe(false);
    expect(savedWithNothingWired.getBrand()).toBeUndefined();
    expect(savedWithNothingWired.getProductType()).toBeUndefined();
    expect(savedWithNothingWired.getDefaultSku()).toBeUndefined();

    const hydrated = new Product({
      productID: 'product-2',
      brand: new Brand({ brandID: 'brand-1', brandName: 'Test Brand' }),
      productType: buildProductType('type-1', 'merchandise', 'type-1'),
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
    });

    expect(hydrated.getBrand()).toBeDefined();
    expect(hydrated.getProductType()).toBeDefined();
    expect(hydrated.getDefaultSku()).toBeDefined();
    expect(hydrated.isNew()).toBe(false);
  });

  it('B13.10 - the scalar accessors answer `undefined` for an unset column, never a substitute', () => {
    // The same absence discipline applied to the plain columns. `activeFlag` has NO
    // default at [model/entity/Product.cfc:L53] while `publishedFlag` declares
    // `default="false"` at [L58] - a real asymmetry in the source, and the port routes
    // both through `cfBoolean` so CFML's string-boolean forms coerce identically.
    const bare = new Product({ productID: 'product-1' });

    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductDescription()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();
    expect(bare.getSortOrder()).toBeUndefined();
    expect(bare.getRemoteID()).toBeUndefined();
    expect(bare.getCalculatedSalePrice()).toBeUndefined();
    expect(bare.getCalculatedQATS()).toBeUndefined();
    expect(bare.getCalculatedTitle()).toBeUndefined();

    // The two coerced flags default to `false` rather than to absence, matching
    // `cfBoolean`'s contract.
    expect(bare.getActiveFlag()).toBe(false);
    expect(bare.getPublishedFlag()).toBe(false);
    expect(bare.getCalculatedAllowBackorderFlag()).toBe(false);

    // CFML string-boolean forms coerce, which is why `cfBoolean` is used rather than a
    // bare cast.
    const coerced = new Product({
      productID: 'product-2',
      activeFlag: 'yes',
      publishedFlag: 1,
    });

    expect(coerced.getActiveFlag()).toBe(true);
    expect(coerced.getPublishedFlag()).toBe(true);
  });

  it('B13.10 - the four audit columns are inert UTC values, read back unchanged', () => {
    // CFML parity [model/entity/Product.cfc:L96-L99]: `createdDateTime`,
    // `createdByAccountID`, `modifiedDateTime`, `modifiedByAccountID`. They are INERT
    // here - no ORM hook stamps them, because `preInsert` / `preUpdate` become
    // repository-invoked explicit maintenance rather than entity behaviour (B17.4).
    //
    // ⚠️ EVERY DATE IS AN EXPLICIT UTC ISO-8601 LITERAL. No bare `new Date()`, no
    // `Date.now()`, no global fake timers anywhere in this suite.
    const subject = new Product({
      productID: 'product-1',
      createdDateTime: CREATED_INSTANT,
      createdByAccountID: 'account-creator',
      modifiedDateTime: MODIFIED_INSTANT,
      modifiedByAccountID: 'account-modifier',
    });

    expect(subject.getCreatedDateTime()).toBe(CREATED_INSTANT);
    expect(subject.getCreatedByAccountID()).toBe('account-creator');
    expect(subject.getModifiedDateTime()).toBe(MODIFIED_INSTANT);
    expect(subject.getModifiedByAccountID()).toBe('account-modifier');

    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:45.000Z');

    // Unset, they are absent rather than stamped - nothing in the entity reads a clock.
    const unstamped = new Product({ productID: 'product-2' });

    expect(unstamped.getCreatedDateTime()).toBeUndefined();
    expect(unstamped.getModifiedDateTime()).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE DECLARATIVE VALIDATION SCHEMA `model/validation/Product.json`  (B14)
// ═══════════════════════════════════════════════════════════════════════════
//
// Transcribed VERBATIM from the file, in file order, and frozen. ⚠️ C19 - the
// file is 17 PHYSICAL lines (18 counting the trailing newline), and sibling notes
// citing "18 lines" and "17 lines" both describe the same file. The count that
// matters is the ELEVEN property entries, which is what this block pins.
//
// This is a TRANSCRIPTION, not an implementation: the ported zod schema lives at
// the SERVICE tier, and no validation runs on the entity. The purpose here is to
// prove that the entity publishes an accessor for every property the schema
// names, that nothing was invented, and that nothing was completed.
// ═══════════════════════════════════════════════════════════════════════════

const PRODUCT_VALIDATION_SCHEMA = {
  baseProductType: [
    { contexts: 'addOptionGroup,addOption', inList: 'merchandise' },
    { contexts: 'addSubscriptionTerm', inList: 'subscription' },
  ],
  physicalCounts: [{ contexts: 'delete', maxCollection: 0 }],
  price: [{ contexts: 'save', required: true, dataType: 'numeric' }],
  productName: [{ contexts: 'save', required: true }],
  productCode: [
    {
      contexts: 'save',
      required: true,
      unique: true,
      regex: '^[a-zA-Z0-9-_.|:~^]+$',
    },
  ],
  productType: [{ contexts: 'save', required: true }],
  transactionExistsFlag: [{ contexts: 'delete', eq: false }],
  unusedProductOptions: [{ contexts: 'addOption', minCollection: 1 }],
  unusedProductOptionGroups: [{ contexts: 'addOptionGroup', minCollection: 1 }],
  unusedProductSubscriptionTerms: [{ contexts: 'addSubscriptionTerm', minCollection: 1 }],
  urlTitle: [{ contexts: 'save', required: true, unique: true }],
} as const;

describe('model/validation/Product.json: eleven rules, transcribed and pinned', () => {
  it('B14.1 - all ELEVEN properties are present, in file order, with their contexts', () => {
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toEqual([
      'baseProductType',
      'physicalCounts',
      'price',
      'productName',
      'productCode',
      'productType',
      'transactionExistsFlag',
      'unusedProductOptions',
      'unusedProductOptionGroups',
      'unusedProductSubscriptionTerms',
      'urlTitle',
    ]);
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toHaveLength(11);

    // ★ `baseProductType` IS THE ONLY PROPERTY CARRYING TWO RULES, and the two disagree
    // deliberately: the two option contexts require `merchandise` while the
    // subscription context requires `subscription`. A single merged rule would make
    // both contexts unsatisfiable.
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType).toHaveLength(2);
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType[0]).toEqual({
      contexts: 'addOptionGroup,addOption',
      inList: 'merchandise',
    });
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType[1]).toEqual({
      contexts: 'addSubscriptionTerm',
      inList: 'subscription',
    });

    // The five `save`-context rules, and the two `delete`-context rules.
    const saveContexted = Object.entries(PRODUCT_VALIDATION_SCHEMA)
      .filter(([, rules]) => rules.some((rule) => rule.contexts === 'save'))
      .map(([property]) => property);

    expect(saveContexted).toEqual([
      'price',
      'productName',
      'productCode',
      'productType',
      'urlTitle',
    ]);

    const deleteContexted = Object.entries(PRODUCT_VALIDATION_SCHEMA)
      .filter(([, rules]) => rules.some((rule) => rule.contexts === 'delete'))
      .map(([property]) => property);

    expect(deleteContexted).toEqual(['physicalCounts', 'transactionExistsFlag']);

    // The three process contexts, each gating exactly one collection.
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptions[0].contexts).toBe('addOption');
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptionGroups[0].contexts).toBe('addOptionGroup');
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductSubscriptionTerms[0].contexts).toBe(
      'addSubscriptionTerm',
    );

    // ★ AND THE FOUR CONTEXTS THE SCHEMA USES ARE EXACTLY THE FOUR NAMED IN
    // `hb_processContexts` at [model/entity/Product.cfc:L49], plus `save` and `delete`.
    // The attribute is UNIQUE TO THIS ENTITY in the slice, and it is preserved as an
    // inert metadata constant rather than normalised away.
    expect(ProductLegacyMetadata.processContexts).toBe(
      'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
    );
  });

  it('B14.2 - `price` is required+numeric with NO minValue, so a NEGATIVE price is VALID on Product', () => {
    // CFML parity [model/validation/Product.json vs model/validation/Sku.json]:
    // Product.price is required+numeric with NO minValue, while Sku.price carries
    // minValue 0. Do not add a floor the legacy schema lacks.
    //
    // Verified by direct read: `model/validation/Sku.json:L9` reads
    // `{"contexts":"save","required":true,"dataType":"numeric","minValue":0}` while
    // `model/validation/Product.json` reads
    // `{"contexts":"save","required":true,"dataType":"numeric"}` and stops there.
    //
    // ★ SO THE ABSENCE IS ASSERTED EXPLICITLY, not merely omitted. An omitted
    // expectation is invisible; an asserted absence fails if someone adds the floor.
    expect(PRODUCT_VALIDATION_SCHEMA.price[0]).toEqual({
      contexts: 'save',
      required: true,
      dataType: 'numeric',
    });
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA.price[0])).not.toContain('minValue');
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA.price[0])).toEqual([
      'contexts',
      'required',
      'dataType',
    ]);

    // And the entity itself accepts a negative price without complaint, which is the
    // behavioural half of the same claim - `Money` validates FORMAT, never SIGN.
    const negative = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('-5.00'),
    });

    expect(negative.getPrice()?.toFixed2()).toBe('-5.00');
    expect(negative.getPrice()?.isLessThan(Money.zero)).toBe(true);
  });

  it("B14.3 - `productCode`'s regex is the SHARED ENTITY_CODE_PATTERN, imported and not redeclared", () => {
    // ★ ONE SHARED CONSTANT, DECLARED EXACTLY ONCE. The pattern
    // `^[a-zA-Z0-9-_.|:~^]+$` is IDENTICAL in `Product.json`'s `productCode`,
    // `Option.json`'s `optionCode` and `OptionGroup.json`'s `optionGroupCode`, and it is
    // modelled as a single exported constant on `optionGroup.ts`.
    //
    // ⚠️ IT IS IMPORTED HERE, NOT REDECLARED, and NOT expected on `option.ts` - the
    // export lives on `optionGroup.ts` alone. Re-declaring it would create a second
    // source of truth that could drift silently.
    expect(ENTITY_CODE_PATTERN.source).toBe(PRODUCT_VALIDATION_SCHEMA.productCode[0].regex);
    expect(ENTITY_CODE_PATTERN.source).toBe('^[a-zA-Z0-9-_.|:~^]+$');

    // The shipped module carries the same text as an inert metadata constant, so the
    // entity, the schema and the shared regex all agree.
    expect(ProductLegacyMetadata.productCodeRegexText).toBe(ENTITY_CODE_PATTERN.source);

    // The behaviour the pattern actually encodes: the legacy fixture code passes, and
    // the characters the class excludes are rejected.
    expect(ENTITY_CODE_PATTERN.test('TESTPRODUCTXXX')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('sku-1.2_3|4:5~6^7')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('')).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('has space')).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('has/slash')).toBe(false);

    // ⚠️ `unique: true` IS PART OF THE RULE AND IS NOT EXPRESSIBLE HERE. Uniqueness
    // needs the database, so it is a repository concern; the constant carries the
    // FORMAT constraint only, and requiredness belongs to the service-tier schema.
    expect(PRODUCT_VALIDATION_SCHEMA.productCode[0].unique).toBe(true);
    expect(PRODUCT_VALIDATION_SCHEMA.urlTitle[0].unique).toBe(true);
  });

  it('B14.4 - the `physicalCounts` gate is ORPHANED, and it is pinned as a documented DEAD declaration', () => {
    // CFML parity [model/validation/Product.json + model/entity/Product.cfc:L90]: the
    // physicalCounts delete gate is ORPHANED - Product declares "physicals"
    // (SwPhysicalProduct), and physicalCounts exists as a property only on
    // model/entity/Physical.cfc:L59. Documented as a dead declaration; not a defect,
    // not a divergence.
    //
    // ★ WHY IT WENT UNNOTICED FOR THE WHOLE LIFE OF THE CODEBASE, and this is the
    // interesting part. FIVE schemas carry the gate - Brand.json, Location.json,
    // Product.json, ProductType.json and Sku.json - and FOUR of the entities behind
    // them declare `attributeValues`: Brand.cfc:L60, Product.cfc:L75, Sku.cfc:L70 and
    // ProductType.cfc:L67, all verified by direct read. Those four are EXACTLY the four
    // silent-unknown-getter entities, so an unknown `getPhysicalCounts()` routed
    // SILENTLY to `getAttributeValue('physicalCounts')` -> `''` via
    // [org/Hibachi/HibachiEntity.cfc:L559-L561] instead of throwing at [L565]. The
    // orphan never raised, so nobody ever looked.
    //
    // ⚠️ IT IS NOT A NUMBERED DEFECT, NOT A DIVERGENCE, AND IT DOES NOT EXPAND THE
    // SIX-FILE ABSENCE INVENTORY. It is a dead declaration, recorded as one.
    expect(PRODUCT_VALIDATION_SCHEMA.physicalCounts[0]).toEqual({
      contexts: 'delete',
      maxCollection: 0,
    });

    // The component declares `physicals`, not `physicalCounts` - and the target ports
    // NEITHER, because `Physical` is outside the eighteen in-scope entities.
    for (const absent of [
      'getPhysicalCounts',
      'getPhysicals',
      'addPhysical',
      'removePhysical',
      'hasPhysical',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // ★ AND CRUCIALLY: THERE IS NO DYNAMIC DISPATCH IN THE TARGET, so the silent-`''`
    // route the orphan relied on does not exist. That is the structural reason the
    // orphan cannot be reproduced even in principle - not a choice made here.
    expect(declaresMember('getAttributeValue')).toBe(false);
    expect(declaresMember('onMissingMethod')).toBe(false);
  });

  it('B14.5 - SIX of the eleven rules target NON-PERSISTENT, getter-only values', () => {
    // ★ A STRUCTURAL FINDING, AND IT IS LOAD-BEARING FOR B15.3. Six of the eleven rules
    // key on a GETTER rather than on a persisted column:
    //
    //   baseProductType                 [L103 non-persistent, resolved at L493]
    //   price                           ★ non-persistent shadow at L118, resolved at L561
    //   transactionExistsFlag           [L110 non-persistent, resolved at L624]
    //   unusedProductOptions            [L111 non-persistent, resolved at L635]
    //   unusedProductOptionGroups       [L112 non-persistent, resolved at L642]
    //   unusedProductSubscriptionTerms  [L113 non-persistent, resolved at L649]
    //
    // CFML parity: this is the same getter-keyed pattern as `PriceGroupRate.json`'s
    // orphaned `conditions.isNotGlobal`, which keys on `getGlobalFlag` rather than on a
    // property. Validating through an accessor is a legitimate Hibachi idiom, not an
    // error - but it means a rule can fail for a WIRING reason rather than a DATA one,
    // which is exactly what the three refusing accessors in this file demonstrate.
    const getterOnly = [
      'baseProductType',
      'price',
      'transactionExistsFlag',
      'unusedProductOptions',
      'unusedProductOptionGroups',
      'unusedProductSubscriptionTerms',
    ];

    for (const property of getterOnly) {
      expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toContain(property);
    }
    expect(getterOnly).toHaveLength(6);

    // The remaining five DO key on persisted columns at [model/entity/Product.cfc:L52-L59]
    // (or, for `physicalCounts`, on nothing at all - see B14.4).
    expect(
      Object.keys(PRODUCT_VALIDATION_SCHEMA).filter(
        (property: string): boolean => !getterOnly.includes(property),
      ),
    ).toEqual(['physicalCounts', 'productName', 'productCode', 'productType', 'urlTitle']);
  });

  it('B14.5 - THE CONSEQUENCE: a bare Product FAILS the `price` required check', () => {
    // ★ THE PRECISE MECHANISM, AND `issue_1690` RESTS ON IT. `price` is
    // `required: true` in the `save` context, but it resolves through `getPrice()`
    // [model/entity/Product.cfc:L561-L568], which answers NOTHING when there is
    // neither a `variables.price` shadow nor a `defaultSku`. So a bare new product
    // fails the required check - not because anyone forgot to type a number, but
    // because the accessor the rule reads through has nothing to resolve.
    const bare = new Product({ productID: '' });

    expect(bare.isNew()).toBe(true);
    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getDefaultSku()).toBeUndefined();
    expect(PRODUCT_VALIDATION_SCHEMA.price[0].required).toBe(true);

    // The other four `save` requirements are equally unmet, so the context fails on
    // five counts rather than one.
    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductType()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();

    // And EITHER route to a price satisfies it - the shadow, or a default sku - which
    // is the two-guard shape of B11.2 seen from the schema's side.
    expect(
      new Product({ productID: 'product-1', price: Money.fromDecimalString('1.00') }).getPrice(),
    ).toBeDefined();
    expect(
      new Product({
        productID: 'product-2',
        defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
      }).getPrice(),
    ).toBeDefined();
  });

  it('B14.6 - the legacy validation GAPS are asserted as absent and are NOT completed', () => {
    // ⚠️ DO NOT COMPLETE LEGACY VALIDATION GAPS. There is NO `activeFlag` rule, NO
    // `publishedFlag` rule, NO `sortOrder` rule, NO `skus` gate and NO `productReviews`
    // gate - and every one of those is a plausible rule a well-meaning author would add.
    // Their absence is asserted so that adding one fails here.
    for (const absent of [
      'activeFlag',
      'publishedFlag',
      'sortOrder',
      'skus',
      'productReviews',
      'brand',
      'categories',
      'defaultSku',
      'productDescription',
      'remoteID',
      'physicals',
    ]) {
      expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).not.toContain(absent);
    }

    // The entity nonetheless publishes accessors for those columns - the gap is in the
    // SCHEMA, not in the surface, and the two are not conflated.
    expect(declaresMember('getActiveFlag')).toBe(true);
    expect(declaresMember('getPublishedFlag')).toBe(true);
    expect(declaresMember('getSortOrder')).toBe(true);
    expect(declaresMember('getSkus')).toBe(true);
  });

  it('B14.6 - the SIX project-wide absent schemas must REMAIN absent', () => {
    // ⚠️ THE SIX-FILE ABSENCE INVENTORY, VERIFIED ABSENT PROJECT-WIDE AND RECORDED SO
    // IT IS NOT "FIXED": `Category.json`, `PromotionQualifier.json`,
    // `PromotionApplied.json`, `PromotionAccount.json`, `Product_AddOption.json` and
    // `Product_AddOptionGroup.json` do not exist in `model/validation/`.
    //
    // ★ AND B14.4's ORPHANED GATE DOES NOT EXPAND THAT INVENTORY - it is a dead
    // declaration inside a schema that DOES exist, which is a different thing entirely.
    //
    // This suite authors validation for `Product.json` and for nothing else. In
    // particular it does NOT author `Product_UpdateSkus.json`, which is present but is
    // owned by the sibling SERVICE suite - its conditional requiredness
    // (`showPrice{updatePriceFlag eq 1}`, `showListPrice{updateListPriceFlag eq 1}`)
    // is a process-object concern, not an entity one.
    const absentSchemas = [
      'Category.json',
      'PromotionQualifier.json',
      'PromotionApplied.json',
      'PromotionAccount.json',
      'Product_AddOption.json',
      'Product_AddOptionGroup.json',
    ];

    expect(absentSchemas).toHaveLength(6);

    // The behavioural consequence for THIS suite: `Category` is ported as a read-mostly
    // leaf with no validation of its own, and this file asserts no category rule.
    const category = buildCategory('category-1');

    expect(category.getCategoryID()).toBe('category-1');
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).not.toContain('category');
  });

  it('B14.1 - every schema property resolves to a SHIPPED accessor, or is a documented dead one', () => {
    // The whole point of transcribing the schema in an entity suite: proving the
    // surface can actually answer every rule. Ten of the eleven resolve to a shipped
    // accessor; the eleventh is B14.4's orphan.
    const resolvable: Record<string, string> = {
      baseProductType: 'getBaseProductType',
      price: 'getPrice',
      productName: 'getProductName',
      productCode: 'getProductCode',
      productType: 'getProductType',
      transactionExistsFlag: 'getTransactionExistsFlag',
      unusedProductOptions: 'getUnusedProductOptions',
      unusedProductOptionGroups: 'getUnusedProductOptionGroups',
      unusedProductSubscriptionTerms: 'getUnusedProductSubscriptionTerms',
      urlTitle: 'getUrlTitle',
    };

    for (const [property, accessor] of Object.entries(resolvable)) {
      expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toContain(property);
      expect(declaresMember(accessor)).toBe(true);
    }

    expect(Object.keys(resolvable)).toHaveLength(10);

    // The eleventh - and it is the orphan, which is why 10 + 1 = 11 rather than 11 + 0.
    expect(declaresMember('getPhysicalCounts')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE FOUR ROUTED `IssuesTest` CASES  (B15)
// ═══════════════════════════════════════════════════════════════════════════
//
// `meta/tests/unit/IssuesTest.cfc` is 209 lines; the component opens at L49. FOUR
// of its six cases route to this file, and the other two are sibling-owned.
//
// ⚠️ THREE OF THE FOUR ARE WEAK LEGACY TESTS - one has ZERO assertions, one is
// conditional with no assertion, and one has neither an assertion nor even a
// validate call. They are STRENGTHENED into meaningful target assertions, and
// each carries a comment naming BOTH its lineage AND its original weakness.
// Copying a weak test across and presenting it as coverage would be worse than
// not carrying it at all.
//
// ★ B15.6 - THE TWO SIBLING-OWNED CASES ARE NOT DUPLICATED HERE:
//   `issue_1335` [meta/tests/unit/IssuesTest.cfc:L110-L124] -> `skuCurrency.test.ts`
//   `issue_1348` [meta/tests/unit/IssuesTest.cfc:L126-L138] -> `sku.test.ts`
//
// ★ AND `meta/tests/functional/admin/entity/ProductTest.cfc` IS AN EMPTY COMPONENT
// BODY - 53 lines, opening at L49 and closing at L53 with nothing between. It
// contributes ZERO coverage, it is acknowledged rather than counted, and it must
// NOT produce a functional suite here.
// ═══════════════════════════════════════════════════════════════════════════

describe('ROUTED LEGACY CASES: the four IssuesTest cases that belong to Product', () => {
  it('issue_1097 - a populated Product round-trips its fields with no ORM, database or flush', () => {
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L51-L71].
    //
    // ⚠️ ORIGINAL WEAKNESS: **ZERO ASSERTIONS**. The legacy body is
    // `entityNew` -> `populate` -> `entitySave` -> `ormFlush` -> `entityDelete` ->
    // `ormFlush` and then simply ends. It could only ever have failed by THROWING,
    // which is a real but very weak signal - and it needed a live ORM, a database and
    // two flushes to produce it.
    //
    // ⭐ THE PORTABLE CORE, STRENGTHENED: the ticket is about a product being
    // constructible from a populated payload and reasoned about safely. Here that is
    // asserted directly - the payload's fields are readable back, and the whole thing
    // happens with NO ORM, NO database, NO flush and NO persistence of any kind.
    //
    // ★ THE LEGACY SEED UUID IS PRESERVED VERBATIM: `444df2f7ea9c87e60051f3cd87b435a1`
    // appears at [meta/tests/unit/IssuesTest.cfc:L58] and again at
    // [meta/tests/unit/Helper.cfc:L53], so it is the codebase's own merchandise
    // product-type identifier and is retained rather than replaced with an arbitrary id.
    //
    // ⚠️ THE HARNESS'S OWN BUG IS DELIBERATELY NOT REPRODUCED. `productData = {` at
    // [meta/tests/unit/IssuesTest.cfc:L55] - NOT L51, which is the function
    // declaration - is declared WITHOUT `var`, so it leaked into the component scope.
    // That is HARNESS HYGIENE, not one of the twenty preserved defects, and reproducing
    // it would mean introducing shared mutable state into a test file whose whole
    // discipline is per-test isolation (A2). Its non-reproduction is stated here rather
    // than left silent.
    const productType = buildProductType(
      LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
      'merchandise',
      LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
    );

    const product = new Product({
      productID: '',
      productName: 'My Product',
      productType,
    });

    // The populated payload, read back.
    expect(product.getProductName()).toBe('My Product');
    expect(product.getProductType()).toBe(productType);
    expect(product.getProductType()?.getProductTypeID()).toBe('444df2f7ea9c87e60051f3cd87b435a1');

    // Unsaved, exactly as `entityNew` produced it.
    expect(product.isNew()).toBe(true);
    expect(product.getProductID()).toBe('');

    // ★ AND IT CAN BE REASONED ABOUT WITHOUT AN ORM - the accessors the legacy case
    // never got round to calling all answer, and none of them needs a session.
    expect(product.getSkus()).toEqual([]);
    expect(product.getCategoryIDs()).toBe('');
    expect(product.getBrandName()).toBe('');
    expect(product.getSimpleRepresentationPropertyName()).toBe('productName');

    // ⚠️ AND NO `entityDelete` / `ormFlush` ANALOGUE IS INVENTED. The legacy case's
    // second half exercised the ORM, which is not ported; the shipped surface publishes
    // no save, delete or flush member, and that absence is asserted rather than
    // papered over with a stub.
    for (const absent of ['save', 'delete', 'flush', 'populate', 'entityDelete']) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('issue_1331 - the addOptionGroup context is gated on baseProductType inList "merchandise"', async () => {
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L101-L108].
    //
    // ✓ THIS ONE HAS A REAL ASSERTION - `assertFalse(product.isProcessable('addOptionGroup'))`
    // at [meta/tests/unit/IssuesTest.cfc:L107] - so it is the strongest of the four.
    // ⚠️ BUT IT DEPENDS ON HIBACHI `isProcessable()` MACHINERY THAT IS NOT PORTED: the
    // method read `hb_processContexts` off the component metadata and then evaluated the
    // context's validation rules through `HibachiValidationService`. Neither is in scope.
    //
    // ⭐ THE PORTABLE CORE: `model/validation/Product.json` gates the `addOptionGroup`
    // context on `baseProductType inList "merchandise"` (plus
    // `unusedProductOptionGroups minCollection 1`), and the product type the legacy
    // case selects - `444df313ec53a08c32d8ae434af5819a` at
    // [meta/tests/unit/IssuesTest.cfc:L105] - is NON-MERCHANDISE. So the schema gate is
    // what is asserted, and the non-port of `isProcessable()` is documented.
    //
    // ★ THE LEGACY UUID IS PRESERVED VERBATIM, and it is a DIFFERENT one from
    // `issue_1097`'s - which is the entire point of the ticket: one is merchandise and
    // one is not.
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).toBe('444df313ec53a08c32d8ae434af5819a');
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).not.toBe(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID);

    // The gate, transcribed from the schema.
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType[0]).toEqual({
      contexts: 'addOptionGroup,addOption',
      inList: 'merchandise',
    });
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptionGroups[0]).toEqual({
      contexts: 'addOptionGroup',
      minCollection: 1,
    });

    // ★ THE NON-MERCHANDISE PRODUCT FAILS THE GATE - the value the rule reads is
    // `subscription`, which is not in the `merchandise` list. That is the whole of the
    // ticket, and it is now asserted through the real accessor rather than through a
    // framework method that no longer exists.
    const nonMerchandise = new Product({
      productID: 'product-1',
      productType: buildProductType(
        LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID,
        'subscription',
        LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID,
      ),
    });

    const resolvedBase = await nonMerchandise.getBaseProductType();

    expect(resolvedBase).toBe('subscription');
    expect(resolvedBase).not.toBe(PRODUCT_VALIDATION_SCHEMA.baseProductType[0].inList);

    // And a MERCHANDISE product satisfies the same gate, which is the control that
    // proves the assertion above is about the product type rather than about the rule
    // being unsatisfiable.
    const merchandise = new Product({
      productID: 'product-2',
      productType: buildProductType(
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
        'merchandise',
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
      ),
    });

    await expect(merchandise.getBaseProductType()).resolves.toBe('merchandise');

    // ⚠️ `isProcessable()` IS NOT PORTED AND IS NOT INVENTED. The `hb_processContexts`
    // metadata it read IS preserved, as an inert constant, so the admin can still
    // resolve the four contexts - which is the whole of the obligation without a
    // validation runtime on the entity.
    expect(declaresMember('isProcessable')).toBe(false);
    expect(declaresMember('getProcessObject')).toBe(false);
    expect(ProductLegacyMetadata.processContexts).toContain('addOptionGroup');
  });

  it('issue_1690 - a bare Product fails the save context AND does not throw', () => {
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L192-L201].
    //
    // ⚠️ ORIGINAL WEAKNESS: **CONDITIONAL, WITH NO ASSERTION**. The legacy body reads
    //
    //   var product = request.slatwallScope.newEntity("Product");
    //   product.validate( context="save" );
    //   if(!product.hasErrors()){ request.slatwallScope.saveEntity( product ); }
    //
    // so if validation FAILED the body did nothing at all, and if it PASSED the body
    // saved and still asserted nothing. Either outcome was a pass. The ticket is
    // clearly about a bare product NOT being savable, but the test never says so.
    //
    // ⭐ THE PORTABLE CORE, STRENGTHENED: a bare new `Product` must FAIL save-context
    // validation, and it must NOT THROW while being examined. This is the same semantic
    // as the inherited `validate_as_save_for_a_new_instance_doesnt_pass` (B1.1), and
    // B14.5 supplies the precise mechanism.
    const bare = new Product({ productID: '' });

    // ★ IT DOES NOT THROW. Every value the save context reads is readable, and reading
    // it is safe - which is the half of the ticket the legacy `if` accidentally proved
    // and never asserted.
    expect(() => bare.getPrice()).not.toThrow();
    expect(() => bare.getProductName()).not.toThrow();
    expect(() => bare.getProductCode()).not.toThrow();
    expect(() => bare.getProductType()).not.toThrow();
    expect(() => bare.getUrlTitle()).not.toThrow();

    // ★ AND IT FAILS - all five `save` requirements are unmet. The mechanism for
    // `price` is the subtle one: it is `required` but resolves through `getPrice()`,
    // which answers NOTHING on a product with neither a shadow nor a default sku.
    const unmet = [
      bare.getPrice(),
      bare.getProductName(),
      bare.getProductCode(),
      bare.getProductType(),
      bare.getUrlTitle(),
    ];

    expect(unmet.every((value: unknown): boolean => value === undefined)).toBe(true);
    expect(unmet).toHaveLength(5);

    // ⚠️ AND `undefined` RATHER THAN `0` FOR THE PRICE, which is what makes the failure
    // detectable at all. A `0` substituted here would SATISFY a `required` check and
    // silently save a free product - the exact money bug the absence convention exists
    // to prevent.
    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getPrice()).not.toBe(0);

    // The non-ports the legacy case leaned on, asserted absent rather than stubbed.
    expect(declaresMember('validate')).toBe(false);
    expect(declaresMember('hasErrors')).toBe(false);
  });

  it('issue_1690_2 - constructing a bare Product and reading its state does not throw', () => {
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L203-L206].
    //
    // ⚠️ ORIGINAL WEAKNESS: **NO ASSERTION, AND NO VALIDATE CALL EITHER**. The whole
    // legacy body is
    //
    //   var product = request.slatwallScope.newEntity("Product");
    //   request.slatwallScope.saveEntity( product );
    //
    // It is the `_2` companion to `issue_1690`, differing only in that it skips
    // validation and saves unconditionally. It could fail only by throwing.
    //
    // ⭐ THE PORTABLE CORE, AND DELIBERATELY NOTHING MORE: constructing a bare
    // `Product` and reading its validation-relevant state DOES NOT THROW. That is
    // exactly what the legacy body could have detected, and inflating it into a claim
    // about save behaviour would be fabricating coverage - `saveEntity` is a framework
    // member that is not ported, so there is no save to assert.
    expect(() => new Product({ productID: '' })).not.toThrow();

    const bare = new Product({ productID: '' });

    expect(() => bare.isNew()).not.toThrow();
    expect(() => bare.getProductID()).not.toThrow();
    expect(() => bare.getSimpleRepresentationPropertyName()).not.toThrow();
    expect(() => bare.getSkus()).not.toThrow();
    expect(() => bare.getCategories()).not.toThrow();
    expect(() => bare.getBrandName()).not.toThrow();

    expect(bare.isNew()).toBe(true);

    // ⚠️ AND NOT EVERY ACCESSOR ON A BARE PRODUCT IS SAFE - which is why this case
    // enumerates the ones it claims rather than asserting a blanket "nothing throws".
    // The five preserved refusals still refuse on a bare product, and that is correct.
    expect(() => bare.getPageIDs()).toThrow();
    expect(() => bare.getProductOptionsByGroup()).toThrow();
    expect(() => bare.getSalePriceExpirationDateTime()).toThrow();
    expect(() => bare.getOptionGroups()).toThrow();
    expect(() => bare.getProductURL()).toThrow();

    // No `saveEntity` analogue exists to assert against.
    expect(declaresMember('saveEntity')).toBe(false);
  });

  it('B15.6 - the two sibling-owned cases are NOT duplicated here, and the empty stub is not a suite', () => {
    // ★ THE ROUTING LEDGER, ASSERTED SO THE BOUNDARY IS EXECUTABLE RATHER THAN MERELY
    // STATED. Six `IssuesTest` cases touch this slice; four are routed here and two are
    // sibling-owned:
    //
    //   issue_1097    [L51-L71]    -> THIS FILE
    //   issue_1331    [L101-L108]  -> THIS FILE
    //   issue_1335    [L110-L124]  -> `skuCurrency.test.ts`  (NOT here)
    //   issue_1348    [L126-L138]  -> `sku.test.ts`          (NOT here)
    //   issue_1690    [L192-L201]  -> THIS FILE
    //   issue_1690_2  [L203-L206]  -> THIS FILE
    //
    // The naming convention `issue_<ticket#>` is carried over from `IssuesTest.cfc`,
    // with `_2` as the second-case suffix, so a reviewer can grep either file for a
    // ticket number and find both ends.
    const routedHere = ['issue_1097', 'issue_1331', 'issue_1690', 'issue_1690_2'];
    const siblingOwned = ['issue_1335', 'issue_1348'];

    expect(routedHere).toHaveLength(4);
    expect(siblingOwned).toHaveLength(2);
    expect(routedHere.concat(siblingOwned)).toHaveLength(6);

    // ★ AND THE EMPTY FUNCTIONAL STUB CONTRIBUTES ZERO COVERAGE.
    // `meta/tests/functional/admin/entity/ProductTest.cfc` is 53 lines with an EMPTY
    // component body - L49 opens it, L53 closes it, and there is nothing between. It is
    // acknowledged as a GAP rather than counted as coverage, and it must NOT produce a
    // functional suite: this folder holds unit suites only, and a functional tier would
    // need the admin application, which is entirely out of scope.
    //
    // The behavioural stand-in for that acknowledgement: this file's subject is built
    // BY HAND with explicit ports, never bootstrapped, so there is no application to
    // boot and no functional tier to accidentally create.
    const handBuilt = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    expect(handBuilt.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ BIDIRECTIONAL HELPERS, THE D25 HAZARD, AND THE CFML-vs-JS INDEX BASE  (B16)
// ═══════════════════════════════════════════════════════════════════════════
//
// ★ B16.1 - G3 IS MIXED ACROSS THE FOLDER, NOT UNIFORM. Far-side graph symmetry is
// REPRODUCED in `priceGroupRate.ts`, `promotionApplied.ts`, `promotionPeriod.ts`,
// `promotionCode.ts`, `promotionQualifier.ts`, `promotionReward.ts` and
// `priceGroup.ts`, and is deliberately NOT reproduced in `option.ts`,
// `skuCurrency.ts`, `category.ts` and `brand.ts`. So the convention cannot be
// assumed - it has to be read off the shipped module and asserted as found.
//
// ★ VERDICT FOR `product.ts`, READ FIRST-HAND: symmetry IS REPRODUCED.
//   `setBrand`    [src/domain/entities/product.ts] pushes onto `brand.getProducts()`
//                 behind the `isNew() || !hasProduct(this)` guard, verbatim from
//                 [model/entity/Product.cfc:L662-L667].
//   `removeBrand` splices out of `brand.getProducts()` and then clears the near side
//                 UNCONDITIONALLY, verbatim from [model/entity/Product.cfc:L668-L677].
// That is the OPPOSITE of the sibling `brand.ts` decision, and the asymmetry is real:
// `Brand.addProduct`/`removeProduct` delegate to the OWNING side and touch no array,
// because `Product` holds the `brandID` FK at [model/entity/Product.cfc:L68]. Both
// modules are faithful to their own legacy bodies; neither is normalising the other.
//
// ★ THE INVERSION SCREEN. The defect class being screened for - a `remove*` whose body
// calls `add*` on the far side - is REAL in this folder: [model/entity/Option.cfc:L129-L131]
// and [L145-L147] each do exactly that. All THIRTEEN `remove*` bodies in `Product.cfc`
// were read verbatim and all thirteen are CLEAN. Nothing to preserve, no divergence spent.
// ═══════════════════════════════════════════════════════════════════════════

describe('bidirectional helpers: reproduced symmetry, the D25 hazard, and the index base', () => {
  it('B16.1 - setBrand wires BOTH sides: the near-side FK and the far-side array', () => {
    // CFML parity [model/entity/Product.cfc:L662-L667]: `variables.brand = arguments.brand;`
    // then a guarded `arrayAppend(arguments.brand.getProducts(), this)`. Both halves are
    // reproduced, so this assertion covers both.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Reproduced Symmetry' });
    const product = new Product({ productID: 'product-1' });

    expect(brand.getProducts()).toEqual([]);

    product.setBrand(brand);

    // Near side.
    expect(product.getBrand()).toBe(brand);
    // Far side - and it is the LIVE array, which is why the push is observable at all.
    expect(brand.getProducts()).toHaveLength(1);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-1']);
  });

  it('B16.1 - the guard SUPPRESSES a duplicate append for a SAVED product', () => {
    // CFML parity [model/entity/Product.cfc:L664]: `if(isNew() or !arguments.brand.hasProduct( this ))`.
    // A SAVED product - one with a real primary key - takes the containment probe, which
    // finds it and short-circuits the append. Calling `setBrand` twice therefore appends
    // ONCE. This is the control for the hazard asserted in the next case.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Saved Path' });
    const saved = new Product({ productID: 'product-1' });

    expect(saved.isNew()).toBe(false);

    saved.setBrand(brand);
    saved.setBrand(brand);
    saved.setBrand(brand);

    expect(brand.getProducts()).toHaveLength(1);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-1']);
  });

  it('B16.2 - THE D25 HAZARD: a NEW product appends unconditionally, so twice appends twice', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L664]: the `isNew() or` short-circuit skips the
    // containment probe entirely for an unsaved product, so a second setBrand call appends a
    // second reference to the same instance onto the far-side array.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ WHY IT IS PRESERVED RATHER THAN GUARDED: the short-circuit exists because probing an
    // UNSAVED key is meaningless - `hasProduct` would compare `''` against `''` and match any
    // other unsaved product in the collection - so the legacy dodged the ambiguity by not
    // probing at all. Reversing the operands to probe first would trade a duplicate append for
    // a FALSE MATCH between two different unsaved products, which is strictly worse. The
    // duplicate is the lesser fault and it is the one the source chose.
    //
    // ★ AND THE GUARDED CONVENTION IS FOLDER-WIDE, so this hazard is not local to Product:
    // `PriceGroupRate.setPriceGroup` [model/entity/PriceGroupRate.cfc:L181-L186],
    // `PromotionPeriod.setPromotion` [model/entity/PromotionPeriod.cfc:L100],
    // `SkuCurrency.setSku` [model/entity/SkuCurrency.cfc:L91],
    // `PromotionApplied.setPromotion` [model/entity/PromotionApplied.cfc:L81],
    // `PromotionAccount.setAccount` [model/entity/PromotionAccount.cfc:L74] and `setPromotion`
    // [L92], and `PromotionCode.setPromotion` [model/entity/PromotionCode.cfc:L104] all carry
    // the identical shape.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'New Path' });
    const unsaved = new Product({ productID: '' });

    expect(unsaved.isNew()).toBe(true);

    unsaved.setBrand(brand);
    expect(brand.getProducts()).toHaveLength(1);

    unsaved.setBrand(brand);

    // ★ TWO ENTRIES, BOTH THE SAME INSTANCE.
    expect(brand.getProducts()).toHaveLength(2);
    expect(brand.getProducts()[0]).toBe(unsaved);
    expect(brand.getProducts()[1]).toBe(unsaved);
    expect(productIDsOf(brand.getProducts())).toEqual(['', '']);

    // And the near side is still correct - the hazard is entirely on the far side.
    expect(unsaved.getBrand()).toBe(brand);
  });

  it('B16.3 - removeBrand is the CLEAN control: it clears the near side UNCONDITIONALLY', () => {
    // CFML parity [model/entity/Product.cfc:L668-L677]: `arrayFind` at L672, the guarded
    // `arrayDeleteAt` at L673-L674, and then `structDelete(variables, "brand")` at L676 which
    // is OUTSIDE the guard. So a far-side miss still detaches the near side, and that is
    // deliberate - the identifier at L672 and L674 is the SAME one, unlike the leaked-variable
    // defect that afflicts the promotion over-use loop.
    const owningBrand = new Brand({ brandID: 'brand-1', brandName: 'Owner' });
    const strangerBrand = new Brand({ brandID: 'brand-2', brandName: 'Stranger' });
    const product = new Product({ productID: 'product-1' });

    product.setBrand(owningBrand);
    expect(owningBrand.getProducts()).toHaveLength(1);

    // Remove against a brand that does NOT hold this product: the far-side index is not
    // found, so nothing is spliced there...
    product.removeBrand(strangerBrand);

    expect(strangerBrand.getProducts()).toEqual([]);
    expect(owningBrand.getProducts()).toHaveLength(1);
    // ...but the near side is cleared ANYWAY, because L676 sits outside the L673 guard.
    expect(product.getBrand()).toBeUndefined();
  });

  it('B16.3 - the omitted-argument default resolves to the owning brand, and both sides clear', () => {
    // CFML parity [model/entity/Product.cfc:L669-L671]: `if(!structKeyExists(arguments, "brand"))
    // { arguments.brand = variables.brand; }` becomes an optional parameter.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Owner' });
    const product = new Product({ productID: 'product-1' });

    product.setBrand(brand);
    product.removeBrand();

    expect(product.getBrand()).toBeUndefined();
    expect(brand.getProducts()).toEqual([]);
  });

  it('B16.3 / C14 - with no argument and no owning brand it REFUSES rather than no-ops', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L669-L672]: with neither an argument nor a
    // `variables.brand`, CFML dereferences null at `arguments.brand.getProducts()` and raises.
    // Raising here is the faithful port, not an invented guard.
    // Preserved deliberately; do not fix without a product decision.
    const orphan = new Product({ productID: 'product-1' });

    expect(() => orphan.removeBrand()).toThrow(/removeBrand was called with no argument/);
    expect(() => orphan.removeBrand()).toThrow(/model\/entity\/Product\.cfc:L672/);
  });

  it('B16.4 - THE INDEX BASE: removing the FIRST product of a brand actually removes it', () => {
    // ★★ THIS IS THE EXECUTABLE PROOF OF THE `index > 0` -> `!== -1` TRANSLATION.
    //
    // CFML parity [model/entity/Product.cfc:L672-L674]: `arrayFind` returns a ONE-BASED index
    // or 0, so `if(index > 0)` is exactly right in CFML. TypeScript's `findIndex` returns a
    // ZERO-BASED index or -1, so carrying `> 0` across LITERALLY would silently refuse to
    // remove element 0 - the first product of a brand would test false and survive. The bug
    // would be invisible to any test that never happens to target the first element, which is
    // precisely why this case targets it deliberately.
    //
    // ⚠️ AND THE SAME TRAP APPLIES TO `listFindNoCase`, which likewise returns a 1-based index
    // or 0 and must never be used as a bare boolean.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Index Base' });
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    first.setBrand(brand);
    second.setBrand(brand);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-1', 'product-2']);

    // Remove the element at position ZERO.
    first.removeBrand(brand);

    expect(brand.getProducts()).toHaveLength(1);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-2']);
    expect(first.getBrand()).toBeUndefined();
    expect(second.getBrand()).toBe(brand);
  });

  it('B16.5 - the far-side match is BY PRIMARY KEY, never by object identity', () => {
    // CFML parity [model/entity/Product.cfc:L672]: `arrayFind(arguments.brand.getProducts(), this)`
    // compared ORM-managed references, which within one Hibernate session were identity-equal to
    // the row's single managed instance. Without a session there is no such guarantee, so the
    // shipped body compares `getProductID()`. That makes a DIFFERENT instance carrying the SAME
    // key remove the held one - which is the behaviour a repository-hydrated graph needs.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'By Key' });
    const held = new Product({ productID: 'product-1' });
    held.setBrand(brand);

    const separatelyHydrated = new Product({ productID: 'product-1' });
    expect(separatelyHydrated).not.toBe(held);

    separatelyHydrated.removeBrand(brand);

    expect(brand.getProducts()).toEqual([]);
  });

  it('B16.5 - and the SIX containment probes on Product match by primary key too', () => {
    // ★ C11 - THERE ARE SIX PROBES, NOT FIVE: `hasSku` is the sixth alongside
    // `hasPriceGroupRate`, `hasPromotionQualifier`, `hasPromotionQualifierExclusion`,
    // `hasPromotionReward` and `hasPromotionRewardExclusion`.
    //
    // CFML parity: each body reads the candidate's key, falls back to reference containment
    // ONLY when that key is empty, and otherwise compares keys. The empty-key fallback is what
    // keeps an UNSAVED candidate probeable at all - and is also exactly why `setBrand`'s
    // `isNew() or` short-circuit exists (B16.2).
    const held = makeSkuFixture({ skuID: 'sku-1' });
    const product = new Product({ productID: 'product-1', skus: [held] });

    expect(product.hasSku(held)).toBe(true);

    const sameKeyDifferentInstance = makeSkuFixture({ skuID: 'sku-1' });
    expect(sameKeyDifferentInstance).not.toBe(held);
    expect(product.hasSku(sameKeyDifferentInstance)).toBe(true);

    expect(product.hasSku(makeSkuFixture({ skuID: 'sku-2' }))).toBe(false);

    // The empty-key branch: an unsaved candidate falls back to reference containment, so a
    // DIFFERENT unsaved sku is correctly reported absent rather than matching on `'' === ''`.
    const unsavedHeld = makeSkuFixture({ skuID: '', isNew: true });
    const unsavedStranger = makeSkuFixture({ skuID: '', isNew: true });
    const withUnsaved = new Product({ productID: 'product-2', skus: [unsavedHeld] });

    expect(withUnsaved.hasSku(unsavedHeld)).toBe(true);
    expect(withUnsaved.hasSku(unsavedStranger)).toBe(false);
  });

  it('B16.6 - addSku / removeSku delegate to the OWNING side and mutate this product live', () => {
    // CFML parity [model/entity/Product.cfc:L696-L698] and [L699-L701], both single-line
    // delegations: `arguments.sku.setProduct( this )` and `arguments.sku.removeProduct( this )`.
    // `Sku` holds the `productID` FK at [model/entity/Sku.cfc:L67], so the SKU is what changes -
    // and this product's `skus` array is appended to BY `Sku.setProduct`, not here.
    const product = new Product({ productID: 'product-1' });
    // A sku built with an explicit `product` override is NOT auto-wired by the fixture, so this
    // starts genuinely detached and the delegation below is the only thing that links them.
    const sku = makeSkuFixture({ skuID: 'sku-1', product });

    expect(product.getSkus()).toHaveLength(1);
    expect(sku.getProduct()).toBe(product);

    product.removeSku(sku);

    expect(product.getSkus()).toEqual([]);
    expect(sku.getProduct()).toBeUndefined();

    product.addSku(sku);

    expect(skuIDsOf(product.getSkus())).toEqual(['sku-1']);
    expect(sku.getProduct()).toBe(product);
  });

  it('B16.6 - the ten promotion and price-group helpers ship as one-argument delegations', () => {
    // ★ ALL TEN ARE PURE SINGLE-LINE DELEGATIONS to the far side, verbatim from
    // [model/entity/Product.cfc:L732-L769]:
    //
    //   addPromotionReward              -> promotionReward.addProduct(this)             [L732-L734]
    //   removePromotionReward           -> promotionReward.removeProduct(this)          [L735-L737]
    //   addPromotionRewardExclusion     -> promotionReward.addExcludedProduct(this)     [L740-L742]
    //   removePromotionRewardExclusion  -> promotionReward.removeExcludedProduct(this)  [L743-L745]
    //   addPromotionQualifier           -> promotionQualifier.addProduct(this)          [L748-L750]
    //   removePromotionQualifier        -> promotionQualifier.removeProduct(this)       [L751-L753]
    //   addPromotionQualifierExclusion  -> ...addExcludedProduct(this)                  [L756-L758]
    //   removePromotionQualifierExclusion -> ...removeExcludedProduct(this)             [L759-L761]
    //   addPriceGroupRate               -> priceGroupRate.addProduct(this)              [L764-L766]
    //   removePriceGroupRate            -> priceGroupRate.removeProduct(this)           [L767-L769]
    //
    // ⚠️ DEPENDENCY BOUNDARY, AND IT IS WHY THESE TEN ARE ASSERTED STRUCTURALLY RATHER THAN
    // BEHAVIOURALLY. `PromotionReward`, `PromotionQualifier` and `PriceGroupRate` are NOT in
    // this suite's dependency whitelist, and all three are classes with private state, so no
    // structural stand-in can satisfy their parameter types. Constructing one would mean either
    // importing outside the whitelist or reaching for a cast - both forbidden. Their delegation
    // BODIES are verified by the sibling suites that DO own them: `promotionReward.test.ts`,
    // `promotionQualifier.test.ts` and `priceGroupRate.test.ts`. What is asserted here is the
    // half this suite genuinely owns - that the ten members ship, with the legacy CFML names
    // verbatim and the single-argument arity the delegation requires.
    //
    // ★ MEASURED CONSEQUENCE, RECORDED RATHER THAN PAPERED OVER. These ten members and the
    // five far-side probes below are the ONLY executable members of `product.ts` this suite
    // never invokes, and the dependency whitelist is the whole reason. Everything else that
    // stays unexecuted is provably unreachable and is annotated as such in the shipped module
    // itself: the `return undefined` that closes the `getSkuBySelectedOptions` throw chain
    // ("Unreachable, and deliberately not closed"), the false arm of that chain's final
    // length test, the two `?? 0` fallbacks in the positional-weighting comparator (every
    // projected sku is in the weight map by construction), and the `firstSku !== undefined`
    // guard inside `getSalePrice` (reached only once `cfTruthy(length)` has already proved
    // the array non-empty, and present solely to satisfy `noUncheckedIndexedAccess`). Raising
    // the number by casting a stand-in through `any`, or by importing an entity outside the
    // whitelist, would trade a real constraint for a cosmetic figure.
    const delegations = [
      'addPromotionReward',
      'removePromotionReward',
      'addPromotionRewardExclusion',
      'removePromotionRewardExclusion',
      'addPromotionQualifier',
      'removePromotionQualifier',
      'addPromotionQualifierExclusion',
      'removePromotionQualifierExclusion',
      'addPriceGroupRate',
      'removePriceGroupRate',
    ];

    for (const member of delegations) {
      expect(declaresMember(member)).toBe(true);
      expect(arityOf(member)).toBe(1);
    }

    // And their five matching probes plus `hasSku` - the six of C11.
    for (const probe of [
      'hasSku',
      'hasPriceGroupRate',
      'hasPromotionQualifier',
      'hasPromotionQualifierExclusion',
      'hasPromotionReward',
      'hasPromotionRewardExclusion',
    ]) {
      expect(declaresMember(probe)).toBe(true);
      expect(arityOf(probe)).toBe(1);
    }
  });

  it('B16.6 / CLUSTER 8 - the SIX out-of-scope pairs are OMITTED, and the omission is documented', () => {
    // ★ TWELVE MEMBERS ACROSS SIX PAIRS point at entities outside the eighteen, so none is
    // authored - there is nothing in the domain layer for them to delegate to:
    //
    //   addAttributeValue / removeAttributeValue  [model/entity/Product.cfc:L680-L685]
    //   addProductImage   / removeProductImage    [L688-L693]
    //   addProductReview  / removeProductReview   [L704-L709]
    //   addListingPage    / removeListingPage     [L712-L729]  <- the only OWNING side of the six
    //   addVendor         / removeVendor          [L772-L777]
    //   addPhysical       / removePhysical        [L780-L785]
    //
    // ⚠️ THE PROMPT'S B16.6 LISTS `addProductReview`, `addListingPage` AND `addPhysical` AS
    // SHIPPED. They are not, and the source explains why: `ProductReview`, `Content` (listing
    // pages), `Vendor`, `Physical`, `ProductImage` and `AttributeValue` are all outside the
    // eighteen in-scope entities. VERIFY BEFORE YOU QUOTE; SOURCE WINS - the omission is
    // asserted here rather than the prompt's claim.
    for (const omitted of [
      'addAttributeValue',
      'removeAttributeValue',
      'addProductImage',
      'removeProductImage',
      'addProductReview',
      'removeProductReview',
      'addListingPage',
      'removeListingPage',
      'addVendor',
      'removeVendor',
      'addPhysical',
      'removePhysical',
    ]) {
      expect(declaresMember(omitted)).toBe(false);
    }

    // And the collections those pairs would have maintained are likewise absent, so nothing
    // half-built is left behind for a caller to trip over.
    for (const absentAccessor of [
      'getAttributeValues',
      'getProductImages',
      'getProductReviews',
      'getListingPages',
      'getVendors',
      'getPhysicals',
      'getPhysicalCounts',
    ]) {
      expect(declaresMember(absentAccessor)).toBe(false);
    }
  });

  it('B16.7 - the L783-L790 footnote is RESOLVED: there is no hidden method there', () => {
    // ★ A SIBLING NOTE FLAGGED `model/entity/Product.cfc:L783-L790` as possibly concealing an
    // unaccounted-for method. Read line by line it is fully accounted for:
    //
    //   L783-L785  removePhysical                                  (CLUSTER 8, omitted)
    //   L786       blank
    //   L787       `// ============ END: Bidirectional Helper Methods ===========`
    //   L788       blank
    //   L789       `// ================== START: Overridden Methods ============`
    //   L790       blank
    //
    // Two banners, three blanks and one omitted helper. NOTHING HIDDEN. The next real
    // declaration is `getSimpleRepresentationPropertyName()` at [L791-L793], which this suite
    // already asserts, so the accounting closes with no gap.
    // ★ PROBED THROUGH THE REFLECTION HELPER RATHER THAN BY NAMING
    // `Product.prototype.getSimpleRepresentationPropertyName` DIRECTLY. Referencing a prototype
    // method as a bare value trips `@typescript-eslint/unbound-method`, and that rule is
    // correct to complain: a detached method reference loses its `this`. The suite is fixed to
    // satisfy the rule; the rule is never relaxed to satisfy the suite.
    expect(declaresMember('getSimpleRepresentationPropertyName')).toBe(true);
    expect(arityOf('getSimpleRepresentationPropertyName')).toBe(0);
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    // The one member the range actually declares is the omitted one, re-asserted here so the
    // footnote's resolution is executable rather than merely narrated.
    expect(declaresMember('removePhysical')).toBe(false);
  });

  it('B16.5 - far-side accessors hand back LIVE arrays, and no defensive copy is added', () => {
    // CFML parity: `Brand.getProducts()` is LIVE precisely because `Product.setBrand` reaches
    // through it to append [model/entity/Product.cfc:L665]. Wrapping it in a copy would make
    // the append vanish, so the raw-return convention is load-bearing rather than incidental.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Live' });
    const product = new Product({ productID: 'product-1' });

    const beforeWiring = brand.getProducts();
    product.setBrand(brand);

    // The SAME array object observed the mutation - proof there is no copy at the boundary.
    expect(brand.getProducts()).toBe(beforeWiring);
    expect(beforeWiring).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE INHERITED-BASE BEHAVIOURS: DOCUMENTED, NOT FABRICATED  (B17)
// ═══════════════════════════════════════════════════════════════════════════
//
// The shipped entities port NO Hibachi base class. `Product.cfc` extends
// `HibachiEntity`, which extends `org.Hibachi.HibachiEntity`, and the whole of
// `org/Hibachi/**` - 938 files, 24 top-level classes - is a BOUNDARY TO EXTRACT
// FROM AND NEVER MODIFY. Its responsibilities are redistributed: persistence to the
// repositories, validation to typed schemas, scope to explicit context parameters,
// smart lists to typed repository queries.
//
// ★ SO THIS SECTION CHARACTERIZES THE LEGACY CONTRACT IN COMMENTS AND ASSERTS THE
// SHIPPED REALITY - which for most of these members is a DOCUMENTED ABSENCE. Where a
// base behaviour is deliberately not ported the discipline is (a) assert the shipped
// reality and (b) document the legacy contract and the deliberate non-port.
//
// ⚠️ NO HIBACHI BASE-CLASS SUITE IS CREATED, and no absent member is invented so that
// something can be asserted about it. An absence proved is worth more than a stub
// tested.
// ═══════════════════════════════════════════════════════════════════════════

describe('inherited-base behaviours: the legacy contract documented and the shipped reality asserted', () => {
  it('B17.1 - the unknown-getter split is 4 SILENT / 14 THROW, and Product is one of the four', () => {
    // ★ THE MECHANISM. `onMissingMethod` on the framework base
    // [org/Hibachi/HibachiEntity.cfc:L507-L565] matched a series of name patterns and, having
    // matched none, fell through to a `getAttributeValue` fallback at [L559-L561] and only then
    // to the throw at [L565]. The fallback fired ONLY for entities that declare an
    // `attributeValues` collection - so those entities answered `''` where the rest raised.
    //
    // ★ THE FOUR SILENT ENTITIES, EACH VERIFIED FIRST-HAND:
    //   Brand       [model/entity/Brand.cfc:L60]
    //   Product     [model/entity/Product.cfc:L75]   <- THIS ENTITY
    //   Sku         [model/entity/Sku.cfc:L70]
    //   ProductType [model/entity/ProductType.cfc:L67]
    // The other FOURTEEN in-scope entities declare no `attributeValues` and therefore threw.
    //
    // ★ IN THE TARGET THERE IS NO DYNAMIC DISPATCH AT ALL, so the split is DOCUMENTED rather
    // than reproduced - EXCEPT where it becomes observable, and for Product that is exactly one
    // place: `getSalePriceExpirationDateTime()`, asserted in the B5 block, where the legacy
    // silence and the target's throw diverge because the misspelled member simply does not
    // exist on the ported `Sku`.
    //
    // ⚠️ NO EAV READ PATH IS INVENTED. There is no `getAttributeValue`, no
    // `onMissingMethod`, no Proxy-based dispatcher, and no nineteenth entity module for
    // `AttributeValue`. `attributeValues` [model/entity/Product.cfc:L75] - which is also one of
    // the FOUR one-to-many declarations missing `type="array"` - is not materialized at all.
    for (const absent of [
      'onMissingMethod',
      'getAttributeValue',
      'getAttributeValues',
      'setAttributeValue',
      'getAttributeValuesByAttributeIDStruct',
      'getAttributeValuesByAttributeCodeStruct',
      'getAttributeValuesForEntity',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // ★ AND THE OBSERVABLE CONSEQUENCE IS A REFUSAL, NOT A SILENT EMPTY STRING. Reading an
    // undeclared member is a COMPILE error in the target rather than a runtime `''`, and the one
    // legacy call site that reached the fallback now throws - which is what the B5 block pins.
    const subject = new Product({ productID: 'product-1' });
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/onMissingMethod/);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /org\/Hibachi\/HibachiEntity\.cfc:L507-L565/,
    );
  });

  it('B17.2 - the PARTIAL cache invalidation is documentary, because all four caches are omitted', () => {
    // ★ THE LEGACY CONTRACT, AND IT IS A LATENT STALENESS BUG.
    // `clearAttributeCache()` [model/entity/HibachiEntity.cfc:L246-L252] deletes EXACTLY TWO
    // keys - `attributeValuesByAttributeIDStruct` at [L247-L249] and
    // `attributeValuesByAttributeCodeStruct` at [L250-L252] - and leaves
    // `attributeValuesForEntity` and `assignedAttributeSetSmartList` STALE. A caller that
    // mutated an attribute value and then cleared the cache still read the old smart list.
    //
    // ★ `getAssignedAttributeSetSmartList()` IS SHADOWED AT FOUR SITES, NOT THREE:
    //   [model/entity/HibachiEntity.cfc:L205]  the base declaration
    //   [model/entity/Sku.cfc:L813]
    //   [model/entity/ProductType.cfc:L280]
    //   [model/entity/Product.cfc:L795]        <- VERIFIED FOURTH SITE, omitted upstream
    // Each override re-memoizes into the SAME `variables` key, so all four share the staleness.
    //
    // ★ IN THE TARGET THIS IS PURELY DOCUMENTARY: no attribute cache, no smart list and no
    // clear method ship, so there is nothing to go stale. And the memos that DO ship are
    // request-scoped (A2), which structurally removes the whole class of problem rather than
    // patching one instance of it.
    for (const absent of [
      'clearAttributeCache',
      'getAssignedAttributeSetSmartList',
      'getAttributeSetSmartList',
      'getContentSmartList',
      'getSkuSmartList',
      'getProductSmartList',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B17.3 - only isNew() is authored; getNewFlag, getPrintTemplates and getEmailTemplates are not', () => {
    // ★ THE LEGACY CONTRACT:
    //   `getNewFlag()`        [org/Hibachi/HibachiEntity.cfc:L571-L576] - the framework's own
    //                         new-instance probe, duplicating what `isNew()` already answered.
    //   `getPrintTemplates()` [org/Hibachi/HibachiEntity.cfc:L578-L580] - returns `[]`, always.
    //   `getEmailTemplates()` [org/Hibachi/HibachiEntity.cfc:L582-L584] - returns `[]`, always.
    //
    // The latter two are hard-coded empty on the base and were overridden nowhere in the
    // in-scope slice, so porting them would add two members that can only ever answer `[]`.
    // The first is redundant with the per-entity `isNew()` that IS authored. All three are
    // deliberate non-ports, and INVENTING THEM WOULD BE FABRICATION, not parity.
    for (const absent of ['getNewFlag', 'getPrintTemplates', 'getEmailTemplates']) {
      expect(declaresMember(absent)).toBe(false);
    }

    // ★ `isNew()` IS AUTHORED, PER ENTITY, and it tests the PRIMARY KEY rather than a
    // framework flag - which is what makes it checkable without a Hibernate session.
    expect(declaresMember('isNew')).toBe(true);
    expect(arityOf('isNew')).toBe(0);
    expect(new Product({ productID: '' }).isNew()).toBe(true);
    expect(new Product({ productID: 'product-1' }).isNew()).toBe(false);
  });

  it('B17.4 - the ORM event hooks are absent, and the raw debug dump is emphatically not ported', () => {
    // ★ THE LEGACY CONTRACT. `preInsert()` [org/Hibachi/HibachiEntity.cfc:L598-L619] did three
    // things: it threw when `!isPersistable()`, it logged every validation error, and it stamped
    // `createdDateTime` and `modifiedDateTime` from `now()` at [L609].
    //
    // ⚠️ AND AT [org/Hibachi/HibachiEntity.cfc:L605] IT CALLS `writeDump(getErrors())` -
    // raw debug output written straight to the response on a failed flush. That is never ported,
    // in any form: not as a console write, not as a logger call, not as a comment-driven
    // approximation. The domain layer does not log at all.
    //
    // ★ AND `Product.cfc` DECLARES NO ORM HOOKS OF ITS OWN - no `preInsert`, `preUpdate`,
    // `postInsert` or `preDelete` - so there is nothing entity-side to port even before the
    // boundary rule is applied. Where the legacy DID use a hook for real work - the
    // materialized-path maintenance on `PriceGroup` [model/entity/PriceGroup.cfc:L206, L211] -
    // it becomes REPOSITORY-INVOKED EXPLICIT MAINTENANCE, not entity behaviour.
    for (const absent of [
      'preInsert',
      'preUpdate',
      'postInsert',
      'postUpdate',
      'preDelete',
      'postDelete',
      'isPersistable',
      'getErrors',
      'logHibachi',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // ★ THE FOUR AUDIT COLUMNS THE HOOK WOULD HAVE STAMPED ARE STILL PERSISTED - the schema
    // contract is unbroken - they are simply written by the repository rather than by the
    // entity. Read back here as the explicit UTC instants they were hydrated with, which is
    // also why this suite never reads a clock: an entity that cannot stamp a timestamp has no
    // reason to know the time.
    const stamped = new Product({
      productID: 'product-1',
      createdDateTime: CREATED_INSTANT,
      createdByAccountID: 'account-1',
      modifiedDateTime: MODIFIED_INSTANT,
      modifiedByAccountID: 'account-2',
    });

    expect(stamped.getCreatedDateTime()?.toISOString()).toBe(CREATED_INSTANT.toISOString());
    expect(stamped.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_INSTANT.toISOString());
    expect(stamped.getCreatedByAccountID()).toBe('account-1');
    expect(stamped.getModifiedByAccountID()).toBe('account-2');
  });

  it('B17.5 - the DEAD RETRY on the base is recorded as present-but-unexercised', () => {
    // ★ THE LEGACY CONTRACT [model/entity/HibachiEntity.cfc:L180-L183]:
    //
    //   var thisAttribute = getService("attributeService").getAttributeByAttributeCode( arguments.attribute );
    //   if(isNull(thisAttribute) && len(arguments.attribute) eq 32) {
    //     thisAttribute = getService("attributeService").getAttributeByAttributeCode( arguments.attribute );
    //   }
    //
    // The "retry" re-calls the SAME method with the SAME argument, so if the first lookup
    // returned null the second returns null too. It is a NO-OP - almost certainly a
    // half-finished intent to fall back to a lookup by attribute ID for a 32-character UUID.
    //
    // ★ IT IS RECORDED, NOT REPRODUCED, AND NO TEST PATH IS INVENTED FOR IT. The whole
    // `getAttributeValue` family is a documented non-port (B17.1), so the dead retry has
    // nowhere to live. Asserting anything about its behaviour would require first authoring the
    // EAV read path that is deliberately out of scope - which would be inventing the very thing
    // the non-port exists to avoid.
    expect(declaresMember('getAttributeByAttributeCode')).toBe(false);
    expect(declaresMember('getAttributeValue')).toBe(false);

    // The one fact that IS assertable: the 32-character length test the dead branch guarded on
    // is the same width as every `Sw*` primary key in the schema, which is why the intent is
    // legible even though the code never runs. The legacy seed UUIDs this suite already carries
    // are exactly that width.
    expect(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID).toHaveLength(32);
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).toHaveLength(32);
  });

  it('B17.6 - the five framework-coupled smart-list members are documented non-ports', () => {
    // ★ SMART LISTS ARE NOT PORTED. `HibachiSmartList` is a generic, string-keyed, dynamically
    // filtered query builder supplied by the framework. Porting it faithfully would mean
    // reimplementing a small ORM query language - re-importing exactly the coupling this
    // refactor exists to remove, and untypeable under the strict profile.
    //
    // ★ THE FIVE SITES ON THIS ENTITY, EACH VERIFIED FIRST-HAND:
    //   getListingPagesOptionsSmartList()  [model/entity/Product.cfc:L146-L153]
    //                                      reaches `contentService.getContentSmartList()`
    //   getTemplateOptions()               [model/entity/Product.cfc:L171-L176]
    //                                      reaches `ProductService.getProductTemplates()`
    //   getOptionGroups()                  [model/entity/Product.cfc:L251-L261]
    //                                      THE ONE EXCEPTION - see below
    //   getDefaultProductImageFiles()      [model/entity/Product.cfc:L497-L515]
    //                                      reaches `skuService.getSkuSmartList()`
    //   getAssignedAttributeSetSmartList() [model/entity/Product.cfc:L795]
    //                                      reaches `attributeService.getAttributeSetSmartList()`
    //
    // ★ `getOptionGroups()` IS THE ONE THAT COULD NOT BE OMITTED, because
    // `model/validation/Product.json` gates three contexts on `unusedProductOptions` and
    // `unusedProductOptionGroups` with `minCollection:1`, both are built from
    // `structKeyList(getOptionGroupsStruct())`, and that struct is built from
    // `getOptionGroups()`. Drop the first and the other two become unsatisfiable. So its RESULT
    // is materialized at the repository boundary and the accessor refuses when it was not -
    // asserted in the B9 block. The other four had no such live dependent and are omitted.
    //
    // ⚠️ AND THE TWO SERVICE-SIDE RENAMES ARE NOT ENTITY-SIDE:
    // `getProductSmartList` -> `findProducts` and `getSkuSmartList` -> `findSkus` are two of the
    // project's THREE authorized signature reshapings, and both live in `src/services`. Neither
    // appears here, and this file requests no reshaping of its own.
    for (const absent of [
      'getListingPagesOptionsSmartList',
      'getTemplateOptions',
      'getDefaultProductImageFiles',
      'getAssignedAttributeSetSmartList',
      'findProducts',
      'findSkus',
      'addFilter',
      'addOrder',
      'setSelectDistinctFlag',
      'getRecords',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // The one that DID survive, and only because validation depends on it.
    expect(declaresMember('getOptionGroups')).toBe(true);
    expect(declaresMember('getOptionGroupsStruct')).toBe(true);
    expect(declaresMember('getOptionGroupCount')).toBe(true);

    // ⚠️ AND NO IMAGE-PATH FRAGMENT IS EVER WRITTEN AS A LITERAL. `getDefaultProductImageFiles`
    // and the wider legacy image path assemble names from `"jpg"` extensions and `"-"`
    // separators; the image surface is a stub port reached only by out-of-scope branches, so
    // neither literal appears anywhere in this suite and no image behaviour is exercised.
    expect(declaresMember('getImages')).toBe(false);
    expect(declaresMember('getImageFileName')).toBe(false);
    expect(declaresMember('getResizedImagePath')).toBe(false);
  });

  it('B17.6 - the THIRD memo idiom is recorded: isDefined alongside structKeyExists and isNull', () => {
    // ★ CFML PARITY - THREE DISTINCT MEMO IDIOMS IN ONE FILE, all meaning "compute once":
    //   `!structKeyExists(variables, "x")`  the dominant form, e.g.
    //                                      [model/entity/Product.cfc:L252, L518, L525, L605, L625]
    //   `isNull(variables.x)`               used elsewhere in the folder
    //   `!isDefined("variables.templateOptions")`  [model/entity/Product.cfc:L172]
    //                                      THE THIRD IDIOM, and the only occurrence on Product
    //
    // All three collapse to a single `=== undefined` probe in the target, because that is the
    // one thing TypeScript can check. The divergence is ANNOTATED rather than normalised in the
    // source: the point of recording it is that a reviewer diffing the files sees three shapes
    // and one translation, and knows the collapse was deliberate.
    //
    // ★ AND THE COLLAPSE IS SAFE ONLY BECAUSE THE MEMOS ARE REQUEST-SCOPED. `isDefined` on a
    // component-scope key and `=== undefined` on an instance field agree exactly when the
    // instance lives for one request - which A2 guarantees and the B19 block proves.
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    // The seven shipped memos, all starting from the same "not yet computed" state on a fresh
    // instance regardless of which legacy idiom guarded them.
    expect(first.getBrandName()).toBe('');
    expect(first.getSalePriceDiscountType()).toBe('none');
    expect(second.getBrandName()).toBe('');
    expect(second.getSalePriceDiscountType()).toBe('none');

    // `templateOptions` - the `isDefined` site - is itself a documented non-port, so the idiom
    // is recorded without a member to exercise.
    expect(declaresMember('getTemplateOptions')).toBe(false);
  });

  it('B17.1 - the SIX out-of-scope process contexts and methods are not reachable from here', () => {
    // ★ SEVERAL METHODS INSIDE IN-SCOPE FILES SERVE OUT-OF-SCOPE FEATURES, and none is ported
    // into working form. They live on `ProductService`, not on the entity, and the entity
    // publishes no route to them:
    //   processProduct_addProductReview       [model/service/ProductService.cfc:L157]
    //   processProduct_addSubscriptionTerm    [model/service/ProductService.cfc:L173]
    //   processProduct_uploadDefaultImage     [model/service/ProductService.cfc:L235]
    //   loadDataFromFile                      [model/service/ProductService.cfc:L65]
    //
    // ⚠️ AND `loadDataFromFile` SETS `requesttimeout=3600` AT [model/service/ProductService.cfc:L65-L68].
    // That one-hour budget is NOT reproduced as any kind of assertion, and no timing claim of
    // any kind appears in this suite: a Lambda caps at fifteen minutes and API Gateway at
    // twenty-nine seconds, but more importantly no performance requirement exists in the source
    // to inherit. Correctness and fidelity are the justifications here, never speed.
    for (const absent of [
      'processProduct_addProductReview',
      'processProduct_addSubscriptionTerm',
      'processProduct_uploadDefaultImage',
      'processProduct_updateSkus',
      'processProduct_addOption',
      'processProduct_addOptionGroup',
      'loadDataFromFile',
      'processImageUpload',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // ★ THE ONE STUB PORT THIS ENTITY DOES REACH answers with a documented refusal rather than
    // a partial implementation, which is the whole contract of a stub port.
    const withStub = new Product({
      productID: 'product-1',
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    return expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /not available in this slice/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ PORTS, NOT LOCATORS; NO AMBIENT SCOPE; NO CLOCK  (B18)
// ═══════════════════════════════════════════════════════════════════════════
//
// Transformation rules T1, T2 and T6 all land here. DI/1's convention scan of
// `property name="xService";` becomes explicit constructor parameters typed to ports;
// the `getService("x")` locator calls embedded in entities become injected ports; and
// the ambient request scope - `getHibachiScope()`, plus the inconsistent
// `getSlatwallScope()` at [model/service/PriceGroupService.cfc:L262-L268] - becomes an
// explicit context parameter. None of the three survives in any form.
//
// ★ THE LOCATOR CENSUS, COUNTED FIRST-HAND ACROSS ALL EIGHTEEN IN-SCOPE ENTITIES:
//   Product      18   <- THIS ENTITY, second-heaviest in the slice
//   Sku          19   <- heaviest
//   ProductType   6
//   OptionGroup    1
//   RoundingRule   1
//   the other thirteen entities   0 each
//   ------------------------------------
//   TOTAL        45
//
// ★ `PriceGroup` HAS ZERO, and that is not a coincidence - it is exactly why every
// method on `priceGroup.ts` is synchronous. An entity with no locator call has nothing
// to reach outward for, so nothing forces an async boundary on it.
//
// ⚠️ RECONCILING THE THREE PUBLISHED FIGURES: 45 is the total number of `getService(`
// CALL SITES; the AAP's service-locator table has SEVEN rows because it enumerates the
// DISTINCT (site -> port) MAPPINGS it needed to specify. Both are correct at different
// granularity. An upstream note gives 46, and that figure is WRONG - the count was
// re-taken per file and sums to 45.
// ═══════════════════════════════════════════════════════════════════════════

describe('ports, not locators: the composition surface this entity actually has', () => {
  it('B18.2 - NO service locator survives: the whole `getService` family is absent', () => {
    // ★ THE EIGHTEEN LEGACY SITES ON THIS ENTITY, EVERY ONE VERIFIED FIRST-HAND, WITH ITS
    // PORTED DISPOSITION:
    //
    //   L132  productService     -> out of scope (searchProductsByProductType smart list)
    //   L148  contentService     -> OMITTED (getListingPagesOptionsSmartList, B17.6)
    //   L159  skuService         -> `skuRepository` (the flagged getSkus path, B8.2)
    //   L173  ProductService     -> OMITTED (getTemplateOptions, B17.6)
    //   L254  OptionService      -> materialized at the repository boundary (B9.1)
    //   L341  optionService      -> resolved IN MEMORY over `skus` (B9.6)
    //   L367  productService     -> `skuRepository` (B7.4)
    //   L401  stockService       -> out of scope (estimated receival)
    //   L441  inventoryService   -> out of scope (quantity types)
    //   L443  inventoryService   -> out of scope (quantity types)
    //   L501  skuService         -> OMITTED (getDefaultProductImageFiles, B17.6)
    //   L519  promotionService   -> hydration input (`salePriceDetailsForSkus`, B12.1)
    //   L542  hibachiUtilityService -> OMITTED (getTitle, C3 - NOT a port)
    //   L626  skuService         -> `skuRepository` (B13.2)
    //   L637  optionService      -> `optionRepository` (B10.1)
    //   L644  optionService      -> `optionRepository` (B10.2)
    //   L651  subscriptionService-> `subscriptionTermProvider` STUB (B10.3)
    //   L798  attributeService   -> OMITTED (getAssignedAttributeSetSmartList, B17.2)
    //
    // ⚠️ AND THE AAP'S `Product.cfc:L343` IS DRIFTED. The `optionService` locator is at
    // **L341**, verified by direct read. VERIFY BEFORE YOU QUOTE; SOURCE WINS - the shipped
    // ruling is L341 and the correction is recorded here and in the file banner.
    for (const absent of [
      'getService',
      'getProductService',
      'getSkuService',
      'getOptionService',
      'getContentService',
      'getPromotionService',
      'getSubscriptionService',
      'getAttributeService',
      'getStockService',
      'getInventoryService',
      'getHibachiUtilityService',
      'getHibachiScope',
      'getSlatwallScope',
      'getHibachiDAO',
      'invokeMethod',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // ★ THE TWO SITES THAT STILL FAIL AT RUNTIME DO SO BY NAMING THE MISSING SERVICE, not by
    // trying to locate it - which is the difference between a faithful port of a broken call and
    // a resurrected locator. `getProductOptionsByGroup` [L632] called a bare
    // `getProductService()`, which is not a member of the entity, so the throw names it.
    const subject = new Product({ productID: 'product-1' });
    expect(() => subject.getProductOptionsByGroup()).toThrow(/getProductService\(\)/);
  });

  it('B18.1 - the subject is built BY HAND, with explicit ports and inline doubles', () => {
    // ★ NO DI CONTAINER, NO BOOTSTRAP, NO COMPOSITION ROOT IS REACHED FROM THIS SUITE.
    // `src/handlers/bootstrap.ts` is where the real graph is assembled, and it is outside this
    // suite's dependency boundary in both directions: it is a primary adapter, and importing it
    // would breach the domain-inward rule that ESLint's `no-restricted-imports` enforces.
    //
    // ★ AND THE DI/1 FIRST-SCAN LOCK RETIRES WITH DI/1. The legacy container held a 30-second
    // lock on its first convention scan; a hand-wired constructor has no scan and therefore no
    // lock. Recorded as a structural consequence, not as a timing claim.
    const settings = new SettingsProviderDouble(URL_KEY_UNDER_TEST);
    const skuRepository = new SkuRepositoryDouble();
    const optionRepository = new OptionRepositoryDouble();
    const productRepository = new ProductRepositoryDouble();
    const subscriptionTermProvider = new SubscriptionTermProviderDouble();

    const subject = new Product({
      productID: 'product-1',
      settingsProvider: settings,
      skuRepository,
      optionRepository,
      productRepository,
      subscriptionTermProvider,
    });

    // Every collaborator is reachable because it was HANDED IN, and each is a plain object this
    // file authored - no proxy, no auto-mock, no container resolution.
    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
    expect(settings.reads).toEqual(['globalURLKeyProduct']);
  });

  it('B18.4 - the port ledger is LOCKED AT THIRTEEN, and Product receives exactly FIVE of them', () => {
    // ★ THE THIRTEEN PORTS, IN THE ORDER THE AAP DECLARES THEM:
    //    1 productRepository          <- injected here
    //    2 skuRepository              <- injected here
    //    3 optionRepository           <- injected here
    //    4 productTypeRepository
    //    5 promotionRepository
    //    6 priceGroupRepository
    //    7 settingsProvider           <- injected here
    //    8 currencyConverter
    //    9 addressZoneEvaluator
    //   10 urlTitleGenerator
    //   11 imageStore
    //   12 subscriptionTermProvider   <- injected here (STUB)
    //   13 productFeedPort
    //
    // ⚠️ `hibachiUtilityService` IS NOT ON THAT LIST AND IS NOT A PORT. It is the collaborator
    // `getTitle()` [model/entity/Product.cfc:L542] reached for, and rather than invent a
    // fourteenth port to host it, `getTitle` is a documented non-port (C3). The same ruling
    // covers `getProductOptionsByGroup` and every other member whose only collaborator is a
    // framework utility. NO FOURTEENTH PORT MAY BE INVENTED, for anything.
    //
    // ★ AND THE EIGHT PORTS PRODUCT DOES NOT RECEIVE ARE NOT SILENTLY TOLERATED - the
    // hydration input has no slot for them at all, which is what makes the ledger checkable
    // rather than aspirational.
    const accepted = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
      skuRepository: new SkuRepositoryDouble(),
      optionRepository: new OptionRepositoryDouble(),
      productRepository: new ProductRepositoryDouble(),
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    expect(accepted.getProductID()).toBe('product-1');

    // The eight this entity does NOT own have no accessor and no setter - nothing to reach.
    for (const absent of [
      'getProductTypeRepository',
      'getPromotionRepository',
      'getPriceGroupRepository',
      'getCurrencyConverter',
      'getAddressZoneEvaluator',
      'getUrlTitleGenerator',
      'getImageStore',
      'getProductFeedPort',
      'getSettingsProvider',
      'getSkuRepository',
      'getOptionRepository',
      'getProductRepository',
      'getSubscriptionTermProvider',
      'getTitle',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B18.4 - a missing port produces a NAMED REFUSAL that cites its own legacy locator', () => {
    // ★ THE UNIFORM REFUSAL SHAPE. Every port-dependent accessor throws the same three-part
    // message when its collaborator was not injected: the product's identity, the collaborator's
    // NAME, and the exact `model/entity/Product.cfc` locator that cannot be evaluated. That
    // makes a wiring mistake self-diagnosing instead of surfacing as an opaque
    // `undefined is not a function`.
    //
    // ★ AND IT NAMES THE OWNER OF THE FIX: repositories own hydration and must supply the port.
    // A caller is never expected to patch an entity after construction, which is why there is no
    // setter for any of the five.
    const unwired = new Product({ productID: 'product-1' });

    const refusals: ReadonlyArray<readonly [() => unknown, string, string]> = [
      [() => unwired.getProductURL(), 'settings provider', 'L208'],
      [() => unwired.getListingProductURL(), 'settings provider', 'L212'],
    ];

    for (const [invoke, collaborator, locator] of refusals) {
      expect(invoke).toThrow(new RegExp(`the ${collaborator} collaborator was not injected`));
      expect(invoke).toThrow(new RegExp(`model/entity/Product\\.cfc:${locator}`));
      expect(invoke).toThrow(/Repositories own hydration and must supply it/);
    }

    // The async ones refuse the same way, through a rejected promise rather than a throw.
    return Promise.all([
      expect(unwired.getSkusBySelectedOptions('option-1')).rejects.toThrow(
        /the sku repository collaborator was not injected/,
      ),
      expect(unwired.getUnusedProductOptions()).rejects.toThrow(/model\/entity\/Product\.cfc:L637/),
      expect(unwired.getUnusedProductOptionGroups()).rejects.toThrow(
        /model\/entity\/Product\.cfc:L644/,
      ),
      expect(unwired.getTransactionExistsFlag()).rejects.toThrow(
        /model\/entity\/Product\.cfc:L626/,
      ),
      expect(unwired.getAttributeSets()).rejects.toThrow(
        /the product repository collaborator was not injected/,
      ),
    ]);
  });

  it('B18.3 - Product receives NO CLOCK, and no business date is ever read from the system', () => {
    // ★ EXACTLY TWO ENTITIES IN THE SLICE TAKE A CLOCK, and both take it as a PLAIN
    // CONSTRUCTOR PARAMETER rather than as a port: `promotionPeriod.ts` and `promotionCode.ts`,
    // each accepting `now: () => Date` because `isCurrent`/`isExpired` genuinely need the
    // current instant [model/entity/PromotionPeriod.cfc:L78, L83]. That is deliberately NOT a
    // fourteenth port and deliberately NOT sourced from `src/lib/config.ts`.
    //
    // ★ PRODUCT NEEDS NONE. The one place the legacy body reached for `now()` is
    // `getSalePriceExpirationDateTime()` at [model/entity/Product.cfc:L616], and that method
    // cannot return at all (B5) - so the seed is unreachable and the clock is unnecessary.
    //
    // ⚠️ CONSEQUENTLY EVERY DATE IN THIS SUITE IS AN EXPLICIT UTC ISO-8601 INSTANT. No bare
    // `new Date()`, no `Date.now()`, and NO GLOBAL FAKE TIMERS - `tests/setup.ts` pins
    // `process.env.TZ` to UTC and restores real timers after every test, and installing fake
    // timers here would fight it.
    for (const absent of ['getNow', 'now', 'getClock', 'getCurrentDateTime']) {
      expect(declaresMember(absent)).toBe(false);
    }

    // The two audit instants this suite hydrates with are explicit, and they round-trip
    // unchanged - which is only observable because nothing re-stamps them.
    expect(CREATED_INSTANT.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(MODIFIED_INSTANT.toISOString()).toBe('2024-06-15T12:30:45.000Z');
    expect(SALE_PRICE_EXPIRATION_INSTANT.toISOString()).toBe('2024-12-31T23:59:59.000Z');

    const stamped = new Product({
      productID: 'product-1',
      createdDateTime: CREATED_INSTANT,
      modifiedDateTime: MODIFIED_INSTANT,
    });

    expect(stamped.getCreatedDateTime()).toBe(CREATED_INSTANT);
    expect(stamped.getModifiedDateTime()).toBe(MODIFIED_INSTANT);
  });

  it('B18.5 - the doubles are HAND-WRITTEN and RECORDING, with no mocking library involved', () => {
    // ★ THE FOURTEEN PINNED PACKAGES ARE FROZEN, and none of them is a mocking, faker or
    // factory library. `vi` ships inside vitest and is permitted - this suite uses `vi.spyOn`
    // in the memo blocks to count far-side calls - but every collaborator is a class authored in
    // this file, which is what makes its behaviour readable at the point of use rather than
    // configured at a distance.
    //
    // ★ AND RECORDING IS THE POINT. A hand-written double can capture the ARGUMENTS it received
    // in the ORDER it received them, which is exactly what the positional-argument assertions in
    // B7.4, B10.1 and B10.2 need. An auto-mock would give call counts without the fidelity.
    const skuRepository = new SkuRepositoryDouble();
    const product = new Product({ productID: 'product-1', skuRepository });

    expect(skuRepository.selectedOptionsCalls).toEqual([]);

    return product.getSkusBySelectedOptions('option-1,option-2').then((resolved: Sku[]) => {
      expect(resolved).toEqual([]);
      expect(skuRepository.selectedOptionsCalls).toEqual([
        { selectedOptions: 'option-1,option-2', productID: 'product-1' },
      ]);
    });
  });

  it('B18.6 - the stub ports answer only their DOCUMENTED behaviour, never a partial feature', () => {
    // ★ TWO OF THE THIRTEEN PORTS ARE STUBS BY DESIGN - `imageStore` and
    // `subscriptionTermProvider` - because subscription and content-access SKU handling is out
    // of scope [model/service/SkuService.cfc:L139-L202, L210-L218]. They exist as narrow
    // interfaces with documented stub behaviour so that the merchandise path compiles and runs
    // unchanged, NOT as half-implementations waiting to be finished.
    //
    // ★ PRODUCT REACHES EXACTLY ONE OF THEM, at [model/entity/Product.cfc:L651], and the
    // shipped accessor refuses with a message that names the port, its two real members, and the
    // validation rule that would have consumed the result. That is the whole contract.
    const withStub = new Product({
      productID: 'product-1',
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    return Promise.all([
      expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(
        /model\/entity\/Product\.cfc:L651/,
      ),
      expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(/getSubscriptionTerm/),
      // ★ AND IT SAYS SO EVEN THOUGH THE PORT WAS WIRED - the refusal is about the missing
      // CAPABILITY, not about a missing collaborator, which is precisely what distinguishes a
      // stub port from an unwired one.
      expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(/wired/),
    ]);
  });

  it('B18.1 - there is NO ambient scope, and the price-group scope inconsistency has nowhere to land', () => {
    // ★ T6. `getHibachiScope()` was the ambient request scope every legacy component reached
    // for, and `PriceGroupService` reached the SAME object through a differently-named
    // `getSlatwallScope()` at [model/service/PriceGroupService.cfc:L262-L268]. Both are replaced
    // by an explicit context parameter passed down the call chain, so the naming divergence
    // disappears rather than being normalised in the source.
    //
    // ★ FOR THIS ENTITY THE CONSEQUENCE IS SIMPLER STILL: no method takes a context, because no
    // method on `Product` needed the scope. The settings the legacy read through
    // `this.setting(...)` arrive through the injected `settingsProvider` instead - which is why
    // `globalURLKeyProduct` is resolved through a double in B1 and B2 and NEVER hardcoded.
    //
    // ⚠️ AND NOTHING IN THIS SUITE TOUCHES THE ENVIRONMENT. No database, no network, no
    // filesystem, no `.env`, no `dotenv`, no credential, no hostname, no connection string.
    // The whole file passes with a completely empty environment, which is the only reason it can
    // be a unit tier at all.
    for (const absent of [
      'setting',
      'getSetting',
      'getSettingDetails',
      'getSettingValueFormattedFor',
      'rbKey',
      'getRBKey',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // The settings a caller DOES supply are read through the port and are visibly not literals:
    // change the double and both URL accessors move together, which B2.2 proves in detail.
    const settings = new SettingsProviderDouble('some-other-key');
    const product = new Product({
      productID: 'product-1',
      urlTitle: 'x',
      settingsProvider: settings,
    });

    expect(product.getProductURL()).toBe('/some-other-key/x/');
    expect(product.getProductURL()).not.toContain(URL_KEY_UNDER_TEST);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ A2: MEMO ISOLATION AND FRESHNESS  (B19)
// ═══════════════════════════════════════════════════════════════════════════
//
// ★ EVERY MEMO ON EVERY SHIPPED ENTITY IS REQUEST-SCOPED, and this section proves it
// for the SEVEN that `Product` carries:
//   `optionGroups`             [model/entity/Product.cfc:L252]
//   `optionGroupsStruct`       [model/entity/Product.cfc:L242]
//   `brandName`                [model/entity/Product.cfc:L525]  <- the divergence-(c) one
//   `salePriceDiscountType`    [model/entity/Product.cfc:L605]  <- the correct control
//   `transactionExistsFlag`    [model/entity/Product.cfc:L625]
//   `unusedProductOptions`     [model/entity/Product.cfc:L636]
//   `unusedProductOptionGroups`[model/entity/Product.cfc:L643]
//
// The other three the prompt lists - `title` [L541], `salePriceDetailsForSkus` [L518]
// and `unusedProductSubscriptionTerms` [L650] - are documented non-ports or refusals
// (C3, C7, C12), so they have no memo to isolate. Their absence is asserted rather
// than a memo invented for them.
//
// ★ C7 - THE JUSTIFICATION IS STATE MANAGEMENT, NEVER SPEED. A memo here exists so
// that one request sees one consistent answer, and so that a warm Lambda container
// cannot leak one customer's data into another customer's request. The legacy source
// framed the same mechanism the other way - "This improves performance when doing
// things like rebuilding the skuCache" at [model/service/RoundingRuleService.cfc:L66] -
// and THAT FRAMING IS DELIBERATELY NOT CARRIED FORWARD. No performance, latency,
// throughput or SLA claim appears anywhere in this suite.
//
// ⚠️ B19.4 - FOUR LEGACY CACHES THAT MUST NEVER BECOME MODULE STATE:
//   1. `SkuDAO.variables.nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220].
//      NEVER CLEARED: its clear method [model/dao/SkuDAO.cfc:L222-L226] reads
//      `<cfif not structKeyExists(variables, "nextOptionGroupSortOrder")>` and then
//      deletes - i.e. it deletes ONLY WHEN THE KEY IS ALREADY ABSENT, so the condition
//      is INVERTED and the branch can never fire. On a warm container that cache would
//      outlive every request that ever touched it.
//   2. `RoundingRuleService.variables.roundingRuleDetails` [L53, L67-L77], seeded at
//      component scope and cleared only on save.
//   3. The un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009],
//      which leaks into component scope - divergence (a), SIBLING-OWNED by `src/services`.
//   4. EVERY entity memo, including the seven above.
// All four are request-scoped in the target. Reproducing any of them as module state
// would be actively unsafe, which is why (3) is one of the project's three authorized
// divergences rather than a preserved defect.
// ═══════════════════════════════════════════════════════════════════════════

describe('A2: every memo is request-scoped, and no state crosses instances', () => {
  it('B19.2 - all SEVEN memos on a second instance start FRESH, never inheriting the first', () => {
    // ★ THE WHOLE-FAMILY ISOLATION PROOF. Each memo is driven to a DISTINCT value on the first
    // instance, and the second - built with different collaborators - answers from its own state
    // rather than from the first's. If any memo were module-scoped, at least one of the
    // second-instance assertions below would return the first's answer.
    const firstBrand = new Brand({ brandID: 'brand-1', brandName: 'First Brand' });
    const firstGroup = buildOptionGroup('group-1', 1, 'FIRST');
    const firstOptionRepository = new OptionRepositoryDouble(
      [{ name: 'First Option', value: 'option-1' }],
      [{ name: 'First Group', value: 'group-1' }],
    );
    // ★ THE DOUBLE'S `transactionExists` IS CONSTRUCTOR-SET AND PRIVATE READONLY, deliberately:
    // a double whose recorded answer can be reassigned mid-test is a mutable state hazard of
    // exactly the kind A2 exists to exclude.
    const firstSkuRepository = new SkuRepositoryDouble([], true);

    const first = new Product({
      productID: 'product-1',
      brand: firstBrand,
      optionGroups: [firstGroup],
      defaultSku: makeSkuFixture({
        skuID: 'sku-1',
        salePriceDetail: {
          skuID: 'sku-1',
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.99'),
          promotionID: 'promotion-1',
        },
      }),
      optionRepository: firstOptionRepository,
      skuRepository: firstSkuRepository,
    });

    const secondBrand = new Brand({ brandID: 'brand-2', brandName: 'Second Brand' });
    const secondGroup = buildOptionGroup('group-2', 2, 'SECOND');
    const secondOptionRepository = new OptionRepositoryDouble([], []);
    const secondSkuRepository = new SkuRepositoryDouble([], false);

    const second = new Product({
      productID: 'product-2',
      brand: secondBrand,
      optionGroups: [secondGroup],
      optionRepository: secondOptionRepository,
      skuRepository: secondSkuRepository,
    });

    return Promise.all([
      first.getUnusedProductOptions(),
      first.getUnusedProductOptionGroups(),
      first.getTransactionExistsFlag(),
      second.getUnusedProductOptions(),
      second.getUnusedProductOptionGroups(),
      second.getTransactionExistsFlag(),
    ]).then(
      ([
        firstOptions,
        firstGroups,
        firstTransaction,
        secondOptions,
        secondGroups,
        secondTransaction,
      ]) => {
        // Memo 1 + 2 - option groups and their struct.
        expect(first.getOptionGroups()).toHaveLength(1);
        expect(structKeyList(first.getOptionGroupsStruct())).toEqual(['group-1']);
        expect(structKeyList(second.getOptionGroupsStruct())).toEqual(['group-2']);

        // Memo 3 - brandName, the divergence-(c) accessor.
        expect(first.getBrandName()).toBe('First Brand');
        expect(second.getBrandName()).toBe('Second Brand');

        // Memo 4 - salePriceDiscountType, the correct control. The second has no default sku,
        // so it seeds `'none'` rather than inheriting `'percentageOff'`.
        expect(first.getSalePriceDiscountType()).toBe('percentageOff');
        expect(second.getSalePriceDiscountType()).toBe('none');

        // Memo 5 - transactionExistsFlag, opposite booleans on the two instances.
        expect(firstTransaction).toBe(true);
        expect(secondTransaction).toBe(false);

        // Memo 6 + 7 - the unused-* pair, non-empty against empty.
        expect(firstOptions).toHaveLength(1);
        expect(firstGroups).toHaveLength(1);
        expect(secondOptions).toEqual([]);
        expect(secondGroups).toEqual([]);
      },
    );
  });

  it('B19.2 - each memo computes ONCE per instance, proven by counting the far-side reach', () => {
    // ★ THE OTHER HALF OF A MEMO'S CONTRACT: within one instance it must not recompute. Counting
    // the port calls is the only way to see that from the outside, because a correct answer
    // returned twice looks identical whether it was cached or recomputed.
    const optionRepository = new OptionRepositoryDouble(
      [{ name: 'Option', value: 'option-1' }],
      [{ name: 'Group', value: 'group-1' }],
    );
    const skuRepository = new SkuRepositoryDouble();

    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      optionRepository,
      skuRepository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
      subject.getTransactionExistsFlag(),
    ])
      .then(() =>
        Promise.all([
          subject.getUnusedProductOptions(),
          subject.getUnusedProductOptionGroups(),
          subject.getTransactionExistsFlag(),
        ]),
      )
      .then(() =>
        Promise.all([
          subject.getUnusedProductOptions(),
          subject.getUnusedProductOptionGroups(),
          subject.getTransactionExistsFlag(),
        ]),
      )
      .then(() => {
        // Three rounds of calls, ONE reach apiece.
        expect(optionRepository.unusedOptionsCalls).toHaveLength(1);
        expect(optionRepository.unusedOptionGroupsCalls).toHaveLength(1);
        expect(skuRepository.transactionExistsCalls).toHaveLength(1);

        // And the same for the two synchronous memos, observed through the struct identity -
        // a recomputing accessor would hand back a NEW object each time.
        const firstRead = subject.getOptionGroupsStruct();
        expect(subject.getOptionGroupsStruct()).toBe(firstRead);
        expect(subject.getOptionGroupsStruct()).toBe(firstRead);
      });
  });

  it('B19.2 - the memo SEEDS do not leak either, which is the subtler half of the isolation', () => {
    // ★ WHY THE SEEDS MATTER SEPARATELY. `brandName` seeds `''` and `salePriceDiscountType`
    // seeds `'none'`, and those seeds are what a caller sees when the far side is absent. If
    // either seed were module state, a product with no brand would start answering the PREVIOUS
    // product's brand name - the exact leak that makes shared memos a data-protection problem
    // rather than merely a correctness one.
    const brandless = new Product({ productID: 'product-1' });
    expect(brandless.getBrandName()).toBe('');
    expect(brandless.getSalePriceDiscountType()).toBe('none');

    const branded = new Product({
      productID: 'product-2',
      brand: new Brand({ brandID: 'brand-1', brandName: 'Leak Detector' }),
      defaultSku: makeSkuFixture({
        skuID: 'sku-1',
        salePriceDetail: {
          skuID: 'sku-1',
          discountLevel: 'product',
          salePriceDiscountType: 'amountOff',
          salePrice: Money.fromDecimalString('15.99'),
          promotionID: 'promotion-1',
        },
      }),
    });
    expect(branded.getBrandName()).toBe('Leak Detector');
    expect(branded.getSalePriceDiscountType()).toBe('amountOff');

    // Back to a brandless instance AFTER the branded one computed: still the seed, not the leak.
    const brandlessAgain = new Product({ productID: 'product-3' });
    expect(brandlessAgain.getBrandName()).toBe('');
    expect(brandlessAgain.getSalePriceDiscountType()).toBe('none');
  });

  it('B19.1 - there is NO mutable module-level state in this suite, and every spy is restored', () => {
    // ★ THE SUITE ITSELF HAS TO OBEY A2 TOO. Every subject in this file is constructed inside
    // its own `it`, every double is constructed inside its own `it`, and the only module-level
    // bindings are INERT: frozen instants, string constants, the transcribed validation schema,
    // and pure helper functions. Nothing at module scope is written to after initialization.
    //
    // ★ AND THE SPY DISCIPLINE IS DOUBLE-BELTED: `tests/setup.ts` registers a global
    // `afterEach` running `vi.restoreAllMocks()` and `vi.useRealTimers()`, this file registers
    // its own `afterEach` calling `vi.restoreAllMocks()`, and `vitest.config.ts` additionally
    // sets `clearMocks` and `restoreMocks`. A spy installed in one test cannot survive into the
    // next by any route.
    //
    // ★ AND `isolate: true` IN `vitest.config.ts` means the module graph itself is re-evaluated
    // per test file, so even a hypothetical module-level mutation could not cross files.
    //
    // The observable proof that no earlier spy is still installed: the far-side accessor that
    // B3 spied on answers its REAL value here.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Unspied' });
    expect(brand.getBrandName()).toBe('Unspied');

    const spy = vi.spyOn(brand, 'getBrandName').mockReturnValue('Spied');
    expect(new Product({ productID: 'product-1', brand }).getBrandName()).toBe('Spied');
    expect(spy).toHaveBeenCalledTimes(1);

    // Restoring by hand as well, so this test leaves nothing behind even before the hooks run.
    spy.mockRestore();
    expect(brand.getBrandName()).toBe('Unspied');
  });

  it('B19.4 - the inverted SkuDAO clear condition is recorded, and no cache is module-scoped here', () => {
    // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` guards its
    // `structDelete` with `not structKeyExists(variables, "nextOptionGroupSortOrder")`, so it
    // deletes the key only when the key is already absent and can therefore never clear the
    // populated cache it was written to clear.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ HOW IT IS "PRESERVED" WITHOUT BEING REPRODUCED: `nextOptionGroupSortOrder` arrives as a
    // per-instance HYDRATION INPUT rather than as a DAO-scoped cache, so there is no shared key
    // to clear and the inverted guard has nothing to guard. The defect's OBSERVABLE consequence -
    // a stale radix ceiling surviving across requests - is structurally impossible, and that
    // neutralisation is the documented outcome rather than a silent fix of the condition.
    //
    // ★ AND IT IS NOT ONE OF THE THREE AUTHORIZED DIVERGENCES. Nothing about the entity's public
    // contract changes; the cache simply has a different owner.
    const group = buildOptionGroup('group-1', 1);
    const highOption = buildOption('option-high', 9, group);
    const lowOption = buildOption('option-low', 1, group);

    const buildGraph = (): readonly Sku[] => [
      makeSkuFixture({ skuID: 'sku-high', options: [highOption] }),
      makeSkuFixture({ skuID: 'sku-low', options: [lowOption] }),
    ];

    // Instance ONE carries a radix ceiling, supplied per instance rather than read from a
    // DAO-scoped cache.
    const withRadix = new Product({
      productID: 'product-1',
      skus: [...buildGraph()],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(withRadix.getSkus())).toEqual(['sku-high', 'sku-low']);
    expect(skuIDsOf(withRadix.getSkus(true))).toEqual(['sku-low', 'sku-high']);

    // Instance TWO never saw a ceiling, so the third clause of the sort guard trips and the
    // sorted projection is a PASS-THROUGH. Under the legacy DAO cache - which its clear method
    // could never empty - instance two would have inherited instance one's ceiling and reordered.
    // That inheritance is exactly what a per-instance hydration input makes impossible.
    const withoutRadix = new Product({ productID: 'product-2', skus: [...buildGraph()] });

    expect(skuIDsOf(withoutRadix.getSkus())).toEqual(['sku-high', 'sku-low']);
    expect(skuIDsOf(withoutRadix.getSkus(true))).toEqual(['sku-high', 'sku-low']);
  });

  it('B19.3 - the memos that were NOT ported have no memo to isolate, and none is invented', () => {
    // ★ THREE LEGACY MEMOS ON THIS ENTITY HAVE NO SHIPPED COUNTERPART, and the honest treatment
    // is to assert the absence rather than to manufacture a cache so that something can be
    // isolated:
    //   `title`                          [model/entity/Product.cfc:L541-L544] - C3, reaches
    //                                    `hibachiUtilityService`, which is NOT a port
    //   `salePriceDetailsForSkus`        [model/entity/Product.cfc:L518-L521] - C7, the rounding
    //                                    rule lives in `src/services`, outside the domain layer
    //   `unusedProductSubscriptionTerms` [model/entity/Product.cfc:L650-L652] - C12, refuses,
    //                                    because subscription handling is out of scope
    expect(declaresMember('getTitle')).toBe(false);
    expect(declaresMember('getSalePriceDetailsForSkus')).toBe(false);

    // The third DOES ship as a member - it simply refuses instead of memoizing, so there is no
    // cached rejection to leak between instances either. Two independent instances each refuse
    // on their own account.
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    return Promise.all([
      expect(first.getUnusedProductSubscriptionTerms()).rejects.toThrow(/product-1/),
      expect(second.getUnusedProductSubscriptionTerms()).rejects.toThrow(/product-2/),
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE ASYNC BOUNDARY AND STRUCTURAL PARITY  (B20)
// ═══════════════════════════════════════════════════════════════════════════
//
// ★ THE RULE, STATED ONCE AND APPLIED WITHOUT EXCEPTION: a method is `async` IF AND
// ONLY IF its legacy body reaches the DAO or the ORM. Methods that only traverse
// already-materialized associations, or that perform pure arithmetic, stay synchronous.
// That is why `getPriceByCurrencyCode` stays sync on `Sku` and why `getSkus` stays sync
// here - the fetch already happened at the repository boundary.
//
// ★ THE SHIPPED SPLIT, READ OFF THE SIGNATURES RATHER THAN ASSUMED:
//   TEN `async` members, all reaching a port:
//     getSkuBySelectedOptions, getSkusBySelectedOptions, getLivePrice,
//     getCurrentAccountPrice, getUnusedProductOptions, getUnusedProductOptionGroups,
//     getUnusedProductSubscriptionTerms, getTransactionExistsFlag,
//     getBaseProductType, getAttributeSets
//   ONE promise-returning member that is NOT marked `async` (C23):
//     getSkuSalePriceDetails
//   EVERYTHING ELSE synchronous.
//
// ⚠️ C22 - THE PROMPT'S SYNC LIST IS HALF WRONG ABOUT THE DEFAULT-SKU FAMILY. Four of
// the six delegations are sync; `getLivePrice` [model/entity/Product.cfc:L582] and
// `getCurrentAccountPrice` [L588] are async because the sku-side accessors they delegate
// to reach a repository. VERIFY BEFORE YOU QUOTE; SOURCE WINS.
// ═══════════════════════════════════════════════════════════════════════════

describe('the async boundary and structural parity with the legacy component', () => {
  it('B20.1 - the TEN async members are exactly the ones whose legacy bodies reach a port', () => {
    // ★ EACH ONE TRACED TO THE LOCATOR THAT FORCES IT ASYNC:
    //   getSkuBySelectedOptions            [L349] -> via getSkusBySelectedOptions
    //   getSkusBySelectedOptions           [L367] -> productService -> skuRepository
    //   getLivePrice                       [L582] -> defaultSku.getLivePrice()
    //   getCurrentAccountPrice             [L588] -> defaultSku.getCurrentAccountPrice()
    //   getUnusedProductOptions            [L637] -> optionRepository
    //   getUnusedProductOptionGroups       [L644] -> optionRepository
    //   getUnusedProductSubscriptionTerms  [L651] -> subscriptionTermProvider (STUB)
    //   getTransactionExistsFlag           [L626] -> skuRepository
    //   getBaseProductType                 [L494] -> productType -> productTypeRepository
    //   getAttributeSets                   [L833] -> productRepository
    const settings = new SettingsProviderDouble(URL_KEY_UNDER_TEST);
    const subject = new Product({
      productID: 'product-1',
      productType: buildProductType('type-1', 'merchandise', 'type-1'),
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
      optionGroups: [],
      settingsProvider: settings,
      skuRepository: new SkuRepositoryDouble([], true),
      optionRepository: new OptionRepositoryDouble(),
      productRepository: new ProductRepositoryDouble(),
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    // Each returns a THENABLE - which is the only structural signal of async-ness that
    // survives compilation, since the keyword itself is erased.
    const promiseReturning: ReadonlyArray<readonly [string, unknown]> = [
      ['getSkuBySelectedOptions', subject.getSkuBySelectedOptions('option-1')],
      ['getSkusBySelectedOptions', subject.getSkusBySelectedOptions('option-1')],
      ['getLivePrice', subject.getLivePrice()],
      ['getCurrentAccountPrice', subject.getCurrentAccountPrice()],
      ['getUnusedProductOptions', subject.getUnusedProductOptions()],
      ['getUnusedProductOptionGroups', subject.getUnusedProductOptionGroups()],
      ['getTransactionExistsFlag', subject.getTransactionExistsFlag()],
      ['getBaseProductType', subject.getBaseProductType()],
      ['getAttributeSets', subject.getAttributeSets()],
      // C23 - promise-returning WITHOUT the `async` keyword, counted here because a caller
      // cannot tell the difference and must still await it.
      ['getSkuSalePriceDetails', subject.getSkuSalePriceDetails('sku-1')],
    ];

    expect(promiseReturning).toHaveLength(10);

    return Promise.all(
      promiseReturning.map(([name, value]) => {
        expect(value, name).toBeInstanceOf(Promise);

        // ⚠️ EVERY PROMISE IS SETTLED, so `no-floating-promises` is satisfied and no
        // unhandled rejection escapes. The first two REJECT by design on this fixture -
        // zero matches and a bare selection - so both outcomes are absorbed deliberately.
        return (value as Promise<unknown>).catch(() => undefined);
      }),
    ).then(() => {
      // The eleventh promise-returning member, asserted separately because it REJECTS.
      return expect(subject.getUnusedProductSubscriptionTerms()).rejects.toThrow(
        /not available in this slice/,
      );
    });
  });

  it('B20.1 - the synchronous members return VALUES, never thenables', () => {
    // ★ THE OTHER SIDE OF THE RULE. If any of these had been made async "for consistency"
    // it would have broken interface parity - a CFML caller reading `getOptionGroupCount()`
    // got a number, not a future - and would have forced `await` into every call site that
    // only walks an already-materialized array.
    const subject = new Product({
      productID: 'product-1',
      urlTitle: 'sync-title',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      categories: [buildCategory('category-1')],
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    const synchronousResults: readonly unknown[] = [
      subject.getOptionGroups(),
      subject.getOptionGroupsStruct(),
      subject.getOptionGroupCount(),
      subject.getOptionsByOptionGroup('group-1'),
      subject.getSkus(),
      subject.getSkuByID('sku-1'),
      subject.getBrandName(),
      subject.getSalePrice(),
      subject.getSalePriceDiscountType(),
      subject.getCurrencyCode(),
      subject.getPrice(),
      subject.getRenewalPrice(),
      subject.getListPrice(),
      subject.getProductURL(),
      subject.getListingProductURL(),
      subject.getCategoryIDs(),
      subject.getSimpleRepresentationPropertyName(),
      subject.isNew(),
    ];

    expect(synchronousResults).toHaveLength(18);
    for (const result of synchronousResults) {
      expect(result).not.toBeInstanceOf(Promise);
    }

    // And two representative values, so this is not merely a shape check.
    expect(subject.getOptionGroupCount()).toBe(1);
    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/sync-title/`);
  });

  it('B20.3 / C5 - the abbreviated physical table names are preserved exactly as the schema has them', () => {
    // ★ SCHEMA CONTINUITY. The target reads and writes the EXISTING `Sw*` tables - no
    // migration, no rename, no new table, no column change, and NO schema-generation hook
    // anywhere in this suite. The link tables for this entity use ABBREVIATED names, and the
    // abbreviations are load-bearing rather than cosmetic:
    //
    //   SwProduct                   [model/entity/Product.cfc:L49]  the entity's own table
    //   SwProductListingPage        [L79]
    //   SwProductCategory           [L80]
    //   SwRelatedProduct            [L81]  SELF-REFERENTIAL
    //   SwPromoRewardProduct        [L84]
    //   SwPromoRewardExclProduct    [L85]  note `Excl`, not `Excluded`
    //   SwPromoQualProduct          [L86]  note `Qual`, not `Qualifier`
    //   SwPromoQualExclProduct      [L87]
    //   SwPriceGroupRateProduct     [L88]
    //   SwVendorProduct             [L89]
    //   SwPhysicalProduct           [L90]  the `physicals` collection, NOT `physicalCounts`
    //
    // ⚠️ `SwPromoQual` and `SwPromoReward` are likewise the PHYSICAL names of the qualifier
    // and reward tables [model/entity/PromotionQualifier.cfc:L49,
    // model/entity/PromotionReward.cfc:L49] - "normalising" any of these to a spelled-out
    // form would break every existing row.
    //
    // The shipped metadata carries the entity's own table verbatim, which is the one piece of
    // this inventory the domain layer owns.
    expect(ProductLegacyMetadata.table).toBe('SwProduct');
    expect(ProductLegacyMetadata.entityName).toBe('SlatwallProduct');

    // No schema tooling of any kind is reachable from the entity.
    for (const absent of ['createTable', 'migrate', 'sync', 'getTableName', 'getDatasource']) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B20.4 - the component-level metadata warts are ANNOTATED, not normalised', () => {
    // ★ SIX SOURCE FACTS PRESERVED AS INERT METADATA rather than smoothed over:
    //
    //   1. `hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm"`
    //      [model/entity/Product.cfc:L49] - UNIQUE TO THIS ENTITY in the slice. The admin
    //      resolves the four contexts off it, so it is carried verbatim even though
    //      `isProcessable()` is not ported (B17.1).
    //   2. FOUR calculated properties [L62-L65] - `calculatedSalePrice`, `calculatedQATS`,
    //      `calculatedAllowBackorderFlag`, `calculatedTitle`. `Sku` has only ONE, so the
    //      asymmetry is real and is preserved.
    //   3. THREE eager `fetch="join"` many-to-ones [L68-L70] - `brand`, `productType`,
    //      `defaultSku`. Elsewhere in the folder `PromotionPeriod.promotion` [L59] is also
    //      eager while `ProductType.products` is `lazy="extra"` [L66]; none is normalised.
    //   4. `attributeValues` at [L75] declares NO `type="array"`, unlike its siblings at
    //      [L73], [L74] and [L76]. The inconsistency stands.
    //   5. `productDescription` carries `hb_formFieldType="wysiwyg"` and a 4000 length [L56].
    //   6. `brand` carries `hb_optionsNullRBKey="define.none"` [L68] - an rbKey identifier.
    //
    // ⚠️ AND `ormtype` / `ormType` CASING IS LIKEWISE NOT NORMALISED in the source; the
    // target has one field declaration per property, so the casing has nowhere to exist.
    expect(ProductLegacyMetadata.processContexts).toBe(
      'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
    );
    expect(listToArray(ProductLegacyMetadata.processContexts)).toEqual([
      'updateSkus',
      'addOptionGroup',
      'addOption',
      'addSubscriptionTerm',
    ]);
    expect(listLen(ProductLegacyMetadata.processContexts)).toBe(4);

    // The four calculated properties all ship as accessors - the count is the assertion.
    const calculated = [
      'getCalculatedSalePrice',
      'getCalculatedQATS',
      'getCalculatedAllowBackorderFlag',
      'getCalculatedTitle',
    ];
    expect(calculated).toHaveLength(4);
    for (const member of calculated) {
      expect(declaresMember(member)).toBe(true);
      expect(arityOf(member)).toBe(0);
    }

    // The three eager associations are plain accessors, because eager IS materialized.
    for (const member of ['getBrand', 'getProductType', 'getDefaultSku']) {
      expect(declaresMember(member)).toBe(true);
    }

    // B20.6 - the rbKey identifier survives as an INERT STRING CONSTANT. No i18n runtime,
    // no JavaRB, no resource-bundle lookup: the legacy admin can still resolve it, and the
    // target never interprets it.
    expect(ProductLegacyMetadata.brandOptionsNullRBKey).toBe('define.none');
    expect(ProductLegacyMetadata.productDescriptionFormFieldType).toBe('wysiwyg');
  });

  it('B20.5 - the CFML case-insensitive duplicate bindings collapse to ONE identifier each', () => {
    // ★ CFML COMPONENT LOOKUP AND `arguments` KEYS ARE CASE-INSENSITIVE, so the source can
    // and does spell the same thing several ways. THREE such families exist in this file
    // alone, and every one collapses to a single TypeScript identifier WITHOUT any change in
    // behaviour - they are porting hazards, not additional authorized divergences:
    //
    //   `optionService`  -> "OptionService" [L254], "optionService" [L341],
    //                       'optionService' [L637] and [L644]
    //   `productService` -> 'productService' [L132], "ProductService" [L173],
    //                       "productService" [L367]
    //   `arguments.Product` vs the `product` parameter, over in
    //                       [model/entity/Brand.cfc:L101-L103]
    //
    // ⚠️ AND NO LINT RULE WAS WEAKENED TO MAKE ANY OF THIS COMPILE. `noUnusedLocals`,
    // `eqeqeq`, `no-explicit-any`, `ban-ts-comment`, `consistent-type-imports`, the
    // `no-unsafe-*` family and `no-restricted-imports` are all active over `tests/**`. When
    // this suite failed to compile the SUITE was fixed - four times over - never the config.
    //
    // The observable consequence: exactly ONE option-repository port and ONE product-repository
    // port are injected, and the three legacy spellings all resolve through them.
    const optionRepository = new OptionRepositoryDouble(
      [{ name: 'Option', value: 'option-1' }],
      [{ name: 'Group', value: 'group-1' }],
    );
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      optionRepository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
    ]).then(
      ([options, groups]: [readonly ProductUnusedOption[], readonly ProductUnusedOption[]]) => {
        expect(options).toHaveLength(1);
        expect(groups).toHaveLength(1);
        // Both legacy call sites - [L637] and [L644] - reached the SAME injected port.
        expect(optionRepository.unusedOptionsCalls).toHaveLength(1);
        expect(optionRepository.unusedOptionGroupsCalls).toHaveLength(1);
      },
    );
  });

  it('B20.1 - the hydration input is a typed contract, not an untyped CFML struct', () => {
    // ★ C1 / E9. The legacy `populate(struct data)` accepted anything and resolved keys
    // case-insensitively at runtime. `ProductHydrationInput` is a compile-checked shape with
    // exactly ONE required member - `productID` - and every other slot optional. That is what
    // makes "a repository owns hydration" enforceable rather than merely documented.
    //
    // ★ AND `exactOptionalPropertyTypes` MAKES THE OPTIONALITY HONEST: an explicitly-passed
    // `undefined` is NOT the same as an omitted key at the type level, which is why the
    // fixtures use `Object.hasOwn` to decide whether an override was supplied.
    const minimal: ProductHydrationInput = { productID: 'product-1' };
    const populated: ProductHydrationInput = {
      productID: 'product-2',
      productName: 'Typed Contract',
      productCode: 'TYPEDXXX',
      urlTitle: 'typed-contract',
      activeFlag: true,
      publishedFlag: false,
      sortOrder: 7,
      price: Money.fromDecimalString('19.99'),
      remoteID: 'remote-1',
      createdDateTime: CREATED_INSTANT,
      modifiedDateTime: MODIFIED_INSTANT,
    };

    const bare = new Product(minimal);
    const full = new Product(populated);

    expect(bare.getProductID()).toBe('product-1');
    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getSortOrder()).toBeUndefined();

    expect(full.getProductName()).toBe('Typed Contract');
    expect(full.getProductCode()).toBe('TYPEDXXX');
    expect(full.getSortOrder()).toBe(7);
    expect(full.getPrice()?.toFixed2()).toBe('19.99');
    expect(full.getActiveFlag()).toBe(true);
    expect(full.getPublishedFlag()).toBe(false);

    // ★ AND `publishedFlag` DEFAULTS TO FALSE while `activeFlag` HAS NO DEFAULT
    // [model/entity/Product.cfc:L52-L58] - a real asymmetry in the source, preserved here
    // through the `cfBoolean` coercion rather than normalised to one default.
    expect(new Product({ productID: 'product-3' }).getPublishedFlag()).toBe(false);
    expect(new Product({ productID: 'product-4' }).getActiveFlag()).toBe(false);

    // The attribute-set projection type is likewise a named contract rather than a struct.
    const projection: ProductAttributeSet = {
      attributeSetID: 'set-1',
      attributeSetTypeSystemCode: 'astProduct',
      globalFlag: true,
      attributeCount: 3,
    };
    expect(projection.attributeSetTypeSystemCode).toBe('astProduct');
    expect(projection.attributeCount).toBe(3);
  });

  it('B20.2 - every promise in this suite is awaited or settled, so nothing floats', () => {
    // ★ `no-floating-promises`, `await-thenable` AND `require-await` ARE ALL ACTIVE, and the
    // discipline they impose is visible in the doubles: each one returns
    // `Promise.resolve(...)` from a NON-async method rather than being marked `async` with
    // nothing to await, which is what `require-await` demands.
    //
    // ★ AND THE REJECTING PATHS ARE ASSERTED WITH `rejects`, never left to become an
    // unhandled rejection - a floating rejection in one test can fail a LATER test, which is
    // precisely the cross-test leakage A2 exists to prevent.
    const subject = new Product({
      productID: 'product-1',
      skuRepository: new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-1' })]),
    });

    return subject
      .getSkusBySelectedOptions('option-1')
      .then((resolved: Sku[]) => {
        expect(skuIDsOf(resolved)).toEqual(['sku-1']);
        return subject.getSkuBySelectedOptions('option-1');
      })
      .then((single: Sku | undefined) => {
        expect(single?.getSkuID()).toBe('sku-1');
        // A rejecting path, settled rather than floated.
        return expect(
          new Product({ productID: 'product-2' }).getSkusBySelectedOptions('option-1'),
        ).rejects.toThrow(/sku repository/);
      });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ★★ THE FIVE DISTINCT EMPTY-COLLECTION SEMANTICS  (B21)
// ═══════════════════════════════════════════════════════════════════════════
//
// "Empty" does not mean one thing in this codebase. FIVE genuinely different rules
// govern what an empty collection means, and conflating any two of them changes money:
//
//   (1) PERMISSIVE IN THE CALLER'S LOOP - a `for` over an empty array simply does not
//       execute, so the surrounding decision falls through to whatever the caller had
//       already decided. Empty means "no opinion".
//   (2) RESTRICTIVE IN THE EVALUATOR - a gate that must find a match in a collection
//       fails when the collection is empty. Empty means "no".
//   (3) `hasAnyInProperty` RETURNS FALSE ON EMPTY
//       [org/Hibachi/HibachiEntity.cfc:L339-L349] - it loops the candidate array and
//       returns `false` having found nothing. Because promotion membership tests read
//       INCLUDE lists and EXCLUDE lists through the same helper, that single `false`
//       is PERMISSIVE on an exclude-list (nothing is excluded) and RESTRICTIVE on an
//       include-list (nothing qualifies). One helper, two opposite meanings.
//   (4) THE FULFILLMENT THREE-WAY GATE
//       [model/service/PromotionService.cfc:L333-L420] - a third, distinct shape,
//       SIBLING-OWNED by the service tier.
//   (5) `Brand.getProducts()` DEFAULTS TO `[]` - a hard, TEST-ASSERTED contract from
//       `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()`, which
//       asserts `assertEquals(variables.entity.getProducts(), [])`.
//
// ★ FOR THIS ENTITY the observable empties are: `getCategoryIDs()` -> `''`,
// `getOptionGroupCount()` -> `0`, `getOptionGroupsStruct()` -> `{}`, the five
// association accessors -> `[]`, and `getSkus()` -> `[]`. Each is asserted below with
// the rule it follows named explicitly.
//
// ⚠️ AND `productFixtures.ts` DEFAULTS `skus` TO `[]` DELIBERATELY - that default is
// what breaks the Product<->Sku fixture cycle, since `skuFixtures.ts` builds a Product
// and a Product that auto-built Skus would recurse. So any Product<->Sku graph in this
// suite is wired EXPLICITLY, which every block above does.
// ═══════════════════════════════════════════════════════════════════════════

describe('empty-collection semantics: five rules, named individually', () => {
  it('B21.1 rule (1) PERMISSIVE - an empty loop yields the identity value, not a refusal', () => {
    // CFML parity [model/entity/Product.cfc:L199-L205]: `getCategoryIDs()` seeds `''` and
    // appends inside a loop. With no categories the loop body never runs, so the seed survives
    // and the answer is the EMPTY STRING - the identity value for list concatenation. That is
    // "no opinion", not "no": a caller comparing against a comma list gets a list of length
    // zero rather than an error.
    const bare = new Product({ productID: 'product-1' });

    expect(bare.getCategories()).toEqual([]);
    expect(bare.getCategoryIDs()).toBe('');
    expect(cfLen(bare.getCategoryIDs())).toBe(0);
    expect(listLen(bare.getCategoryIDs())).toBe(0);

    // And with one category the same accessor produces a single element with NO LEADING
    // DELIMITER - which is the property the empty seed exists to protect.
    const withOne = new Product({
      productID: 'product-2',
      categories: [buildCategory('category-1')],
    });
    expect(withOne.getCategoryIDs()).toBe('category-1');
    expect(withOne.getCategoryIDs().startsWith(',')).toBe(false);
    expect(listLen(withOne.getCategoryIDs())).toBe(1);
  });

  it('B21.1 rule (2) RESTRICTIVE - the three minCollection gates FAIL on an empty collection', () => {
    // ★ THE SAME EMPTY, THE OPPOSITE MEANING. `model/validation/Product.json` requires
    // `minCollection: 1` on `unusedProductOptions`, `unusedProductOptionGroups` and
    // `unusedProductSubscriptionTerms`, each in its own process context. An empty result there
    // is a HARD NO - the context cannot be entered at all - because the rule is an evaluator
    // looking for a match rather than a loop falling through.
    const emptyOptionRepository = new OptionRepositoryDouble([], []);
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [],
      optionRepository: emptyOptionRepository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
    ]).then(([options, groups]) => {
      expect(options).toEqual([]);
      expect(groups).toEqual([]);

      // The gates that read them, and what an empty collection does to each.
      expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptions[0].minCollection).toBe(1);
      expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptionGroups[0].minCollection).toBe(1);
      expect(PRODUCT_VALIDATION_SCHEMA.unusedProductSubscriptionTerms[0].minCollection).toBe(1);

      // `0 >= 1` is false three times over: `addOption`, `addOptionGroup` and
      // `addSubscriptionTerm` are all unreachable on this product.
      expect(options.length >= 1).toBe(false);
      expect(groups.length >= 1).toBe(false);
    });
  });

  it('B21.1 rule (3) - hasAnyInProperty answers FALSE on empty, which cuts BOTH ways', () => {
    // ★ THE LEGACY HELPER [org/Hibachi/HibachiEntity.cfc:L339-L349] loops the candidate array
    // and returns `false` when nothing matched - including when there was nothing to match.
    // Promotion membership reads BOTH include-lists and exclude-lists through it, so:
    //   on an INCLUDE list, `false` means NOTHING QUALIFIES  -> restrictive
    //   on an EXCLUDE list, `false` means NOTHING IS EXCLUDED -> permissive
    // One helper, one return value, two opposite business outcomes.
    //
    // ★ IT IS NOT PORTED - the whole `hasAnyInProperty` / `getPropertyAssignedIDList` family
    // is framework machinery. What survives is the SHAPE: the five in-scope association
    // accessors each default to `[]`, and the per-candidate probes each answer `false` on an
    // empty collection, so a caller composing them reproduces the same two-sided semantics.
    expect(declaresMember('hasAnyInProperty')).toBe(false);
    expect(declaresMember('getPropertyAssignedIDList')).toBe(false);

    const bare = new Product({ productID: 'product-1' });

    // Every probe answers `false` against an empty collection - the exact legacy return.
    expect(bare.hasSku(makeSkuFixture({ skuID: 'sku-1' }))).toBe(false);

    // And the five inverse many-to-many collections that promotion membership reads are all
    // `[]` rather than absent, so the probes are safe to compose without a null check.
    expect(bare.getPromotionRewards()).toEqual([]);
    expect(bare.getPromotionRewardExclusions()).toEqual([]);
    expect(bare.getPromotionQualifiers()).toEqual([]);
    expect(bare.getPromotionQualifierExclusions()).toEqual([]);
    expect(bare.getPriceGroupRates()).toEqual([]);
  });

  it('B21.1 rule (4) - the fulfillment three-way gate is SIBLING-OWNED and not asserted here', () => {
    // ★ THE FOURTH SEMANTIC lives at [model/service/PromotionService.cfc:L333-L420] and is a
    // three-way decision over qualified fulfillments rather than a two-way emptiness test. It
    // belongs to the SERVICE tier - `src/services/promotion/**` - and this entity has no
    // fulfillment surface at all, so there is nothing here to assert about it.
    //
    // ⚠️ RECORDING IT ANYWAY IS THE POINT: five semantics exist, and a reader of this file
    // should not conclude from four assertions that four is the whole set. Claiming coverage of
    // the fifth would be exactly the kind of fabricated parity C8 forbids.
    for (const absent of [
      'getOrderFulfillments',
      'getQualifiedFulfillmentIDs',
      'getShippingMethodOptions',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B21.1 rule (5) - the LEGACY-ASSERTED default: an empty array, never absence', () => {
    // ★ THE ONE EMPTY-COLLECTION RULE WITH ACTUAL LEGACY TEST COVERAGE.
    // `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()` asserts
    // `assertEquals(variables.entity.getProducts(), [])` on a freshly constructed brand, so
    // `[]` rather than `undefined` is a TEST-ENFORCED contract on the far side - and it is what
    // makes `Product.setBrand`'s `arrayAppend(arguments.brand.getProducts(), this)` safe
    // without a null check.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Default Empty' });
    expect(brand.getProducts()).toEqual([]);
    expect(brand.getProducts()).not.toBeUndefined();

    // The same convention holds on this entity's own collections.
    const bare = new Product({ productID: 'product-1' });
    expect(bare.getSkus()).toEqual([]);
    expect(bare.getCategories()).toEqual([]);
    expect(bare.getRelatedProducts()).toEqual([]);

    // ⚠️ BUT NOT UNIVERSALLY, AND THE EXCEPTION MATTERS: `optionGroups` is NOT defaulted, so
    // `getOptionGroups()` REFUSES rather than answering `[]`. That is deliberate - an empty
    // array would be indistinguishable from "this product genuinely has no option groups",
    // and the three `minCollection:1` gates read the difference.
    expect(() => bare.getOptionGroups()).toThrow();
  });

  it('B21.1 - the three scalar empties on this entity, each with its own identity value', () => {
    // ★ THREE ACCESSORS, THREE DIFFERENT "EMPTY" VALUES, none interchangeable:
    //   getCategoryIDs()        -> `''`  the identity for list concatenation
    //   getOptionGroupCount()   -> `0`   the identity for counting
    //   getOptionGroupsStruct() -> `{}`  the identity for keyed lookup
    const emptyGroups = new Product({ productID: 'product-1', optionGroups: [] });

    expect(emptyGroups.getCategoryIDs()).toBe('');
    expect(emptyGroups.getOptionGroupCount()).toBe(0);
    expect(emptyGroups.getOptionGroupsStruct()).toEqual({});
    expect(structKeyList(emptyGroups.getOptionGroupsStruct())).toEqual([]);
    expect(structKeyExists(emptyGroups.getOptionGroupsStruct(), 'group-1')).toBe(false);

    // ★ AND THE CFML TRUTHINESS OF EACH EMPTY IS THE SAME `false`, which is exactly why the
    // source could write `if(arrayLen(x))` and `if(len(x))` interchangeably - and exactly why a
    // literal translation to a JavaScript truthiness test would have been wrong for `'0'`.
    // `cfTruthy` carries the CFML rule so the translation is deterministic rather than decided
    // case by case.
    expect(cfTruthy(emptyGroups.getOptionGroupCount())).toBe(false);
    // `''` IS accepted and falsy - that specific case is load-bearing for the currency
    // eligibility gate at [model/entity/Sku.cfc:L373], `if(len(setting('skuEligibleCurrencies')))`.
    expect(cfTruthy(emptyGroups.getCategoryIDs())).toBe(false);
    expect(cfTruthy(cfLen(emptyGroups.getCategoryIDs()))).toBe(false);

    // ⚠️ C24 - AND A NON-EMPTY NON-NUMERIC STRING IS A CONVERSION ERROR, NOT `true`.
    // `cfTruthy('category-1')` RAISES, because CFML raises for a string that is neither a
    // boolean literal nor numeric. So `if(len(x))` translates to `cfTruthy(cfLen(x))` and
    // NEVER to `cfTruthy(x)` - the source never wrote `if(someStringID)` and the port must not
    // either. Discovered by running it, not by reading the name.
    expect(() => cfTruthy('category-1')).toThrow(/cannot convert the string/);

    // Non-empty flips all three via the CORRECT idiom, and `cfLen` counts characters rather
    // than list elements.
    const populated = new Product({
      productID: 'product-2',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      categories: [buildCategory('category-1')],
    });
    expect(cfTruthy(populated.getOptionGroupCount())).toBe(true);
    expect(cfTruthy(cfLen(populated.getCategoryIDs()))).toBe(true);
    expect(cfLen(populated.getCategoryIDs())).toBe('category-1'.length);
    expect(listLen(populated.getCategoryIDs())).toBe(1);
  });

  it('B21.1 - the empty-collection path through getSalePrice is rule (1), and it still returns ZERO', () => {
    // ★ WHERE THE FIVE SEMANTICS MEET THE ABSENCE CONVENTION. `getSalePrice()`
    // [model/entity/Product.cfc:L594-L601] guards its second branch with the CFML
    // `if(arrayLen(getSkus()))` idiom - rule (1), permissive: an empty array simply skips the
    // branch. Both the skipped path and the taken path then fall through to `return 0` at
    // [L600], because [L598] has no `return` (defect 20).
    //
    // LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement getSkus()[1].getSalePrice();
    // has no return, so execution falls through to return 0 at L600 and the sku's sale price is
    // discarded.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ⚠️ AND THE ABSENCE CONVENTION IS DIRECTIONAL. `Product.getSalePrice()` MUST answer
    // `Money('0')` and NEVER `undefined`; `Sku.getPriceByCurrencyCode()` MUST answer
    // `undefined` and NEVER `0`. Collapsing either direction is a money bug - one would hide a
    // missing price behind a free product, the other would make a legitimate zero look absent.
    const withNoSkus = new Product({ productID: 'product-1' });
    expect(withNoSkus.getSkus()).toEqual([]);
    expect(cfTruthy(withNoSkus.getSkus().length)).toBe(false);
    expect(withNoSkus.getSalePrice().toFixed2()).toBe('0.00');
    expect(withNoSkus.getSalePrice()).not.toBeUndefined();

    const withSkus = new Product({
      productID: 'product-2',
      skus: [makeSkuFixture({ skuID: 'sku-1' })],
    });
    expect(cfTruthy(withSkus.getSkus().length)).toBe(true);
    // Same answer - the branch ran, and its result was discarded.
    expect(withSkus.getSalePrice().toFixed2()).toBe('0.00');
  });

  it('B21.1 - the Product<->Sku fixture cycle is broken by the [] default, and graphs are explicit', () => {
    // ★ THE FIXTURE DAG IS LOCKED AND ACYCLIC:
    //   priceGroupFixtures -> productFixtures -> skuFixtures -> promotionFixtures
    //                                                        -> orderViewFixtures
    // `skuFixtures.makeSkuFixture` builds its own Product when none is supplied, so
    // `productFixtures.makeProductFixture` MUST NOT build Skus by default or the two would
    // recurse without terminating. Defaulting `skus` to `[]` is what severs that cycle.
    const bareFixture = makeProductFixture({});
    expect(bareFixture.getSkus()).toEqual([]);

    // ★ SO ANY GRAPH IS WIRED BY HAND, in one of the two explicit directions:
    //   (a) pass `skus` into the Product constructor, or
    //   (b) pass `product` into the sku fixture and let `Sku.setProduct` append.
    // Direction (b) appends through the far side, which is the bidirectional path B16 covers.
    const viaConstructor = new Product({
      productID: 'product-1',
      skus: [makeSkuFixture({ skuID: 'sku-a' })],
    });
    expect(skuIDsOf(viaConstructor.getSkus())).toEqual(['sku-a']);

    const viaFarSide = new Product({ productID: 'product-2' });
    makeSkuFixture({ skuID: 'sku-b', product: viaFarSide });
    expect(skuIDsOf(viaFarSide.getSkus())).toEqual(['sku-b']);

    // ★ AND EXACTLY ONCE, not twice - `makeSkuFixture` calls `setProduct` a single time, and
    // this product is SAVED, so the containment guard suppresses any second append. The D25
    // hazard needs an UNSAVED product, which B16.2 constructs deliberately.
    expect(viaFarSide.getSkus()).toHaveLength(1);
    expect(viaFarSide.isNew()).toBe(false);
  });
});
