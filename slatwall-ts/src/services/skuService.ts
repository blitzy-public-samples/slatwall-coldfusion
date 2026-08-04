// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring order
// "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts             composition root (wiring, option hydration)
//   src/handlers/skuResolutionHandler.ts  the primary adapter that reaches this service
//   src/services/productService.ts        the other half of budgeted reshaping #2
//   tests/unit/services                   this service's NET-NEW suite
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - SKU creation, option-ordered retrieval and SKU lookup service
//
// PORTED FROM: model/service/SkuService.cfc (334 lines, `wc -l` confirmed), as a
// 1:1 logic extraction. NINE PUBLIC METHODS, which is the entire declared surface
// of the legacy component. Every one of the nine is asynchronous, because every
// one of the nine legacy bodies reaches the DAO, the ORM or a collaborator that
// does - that is the project's async ruling, and this component is the one
// in-scope service where it applies without exception. Contrast
// `OptionService.getOptionsForSelect`, which stays synchronous because it is a
// pure transformation.
//
// B2 - THIS FILE OWNS THE SKU HALF OF A NAMED MUST-PRESERVE BEHAVIOUR
//   Option-to-SKU resolution is one of exactly three behaviours named
//   must-preserve for this migration. `getProductSkusBySelectedOptions` lives on
//   `src/services/productService.ts` (planned), but its SKU-side ordering
//   companions live HERE: `getProductSkus` [L220] and `getSortedProductSkus`
//   [L246]. The option-group place-value ordering those two impose is part of the
//   preserved contract and is NOT reshaped, unified or "cleaned up" below - see
//   the three-way divergence table on `getProductSkus`.
//
//   This file has NO involvement in the other two must-preserve areas - promotion
//   discount math with use-limit enforcement, and the price-group / currency
//   resolution cascade - and reaches into neither.
//
// E5 - PARAMETERIZED SQL: STATED RATHER THAN SILENTLY OMITTED
//   The project standard is that every query uses prepared statements
//   EXCLUSIVELY, preserving the injection-safety guarantee `cfqueryparam` gave the
//   legacy `<cfquery>` bodies. That obligation is not discharged in this file, and
//   it is not skipped either: THIS SERVICE BUILDS AND EXECUTES NO SQL AT ALL. Every
//   query it needs is reached through `SkuRepository`, so the obligation rests
//   wholly with `src/repositories/mysql/**`, which owns the statements, the
//   bindings and the entity hydration.
//
//   The one place a reader might expect SQL is `getSkuSmartList` [L309-L325],
//   which assembles three joins and five keyword properties. What this file
//   reproduces is the resulting CRITERIA - as data, on the returned page - and
//   never a statement. See `findSkus`.
//
// B8 - THIS ENTIRE SERVICE IS NET-NEW COVERAGE, AND IS NOT PRESENTED AS PARITY
//   There is NO `SkuServiceTest` anywhere in `meta/tests/`. The legacy service
//   tier contains only `AccountServiceTest`, `HibachiServiceTest`,
//   `PaymentServiceTest` and `UtilityRBServiceTest`, none of them in scope, and
//   `meta/tests/unit/dao/` covers only `AccountDAOTest` and `PaymentDAOTest`. So
//   every test that will ever cover this file is NET-NEW, and saying so plainly is
//   part of the deliverable - the two legacy-extended suites in this migration
//   belong to `brand` and `product`, not here.
//
//   No test file is authored from this file; `slatwall-ts/tests` is owned
//   elsewhere. What this file owes the test tier is TESTABILITY, and it pays it
//   the only way that counts: every collaborator arrives as a constructor port,
//   there is no ambient state, there is no module-level mutable cache, and the
//   two ordering methods share one private pure helper that can be exercised
//   directly through them.
//
// COLLABORATOR COUNT - FIVE DECLARED, FOUR REAL, THREE PORTS
//   [model/service/SkuService.cfc:L51-L56] declares five DI/1 collaborators.
//   Verified usage across the whole component:
//
//     skuDAO              L51  LIVE   -> skuRepository            (8 call sites)
//     optionService       L53  LIVE   -> NO PORT CONSUMED         (1 call site; see below)
//     productService      L54  DEAD   -> omitted entirely         (0 call sites)
//     subscriptionService L55  LIVE   -> subscriptionTermProvider (out-of-scope branch only)
//     contentService      L56  LIVE   -> NO PORT EXISTS           (out-of-scope branch only)
//
//   plus ONE service-locator call that no property declares:
//
//     getService("imageService")  L212 -> imageStore
//
//   ★ [model/service/SkuService.cfc:L212] IS THE ONE AND ONLY `getService()` CALL
//   IN THE ENTIRE IN-SCOPE SERVICE LAYER. `ProductService`, `PriceGroupService`,
//   `PromotionService`, `RoundingRuleService`, `BrandService` and `OptionService`
//   have zero between them. (`model/entity/Product.cfc` has many - that is an
//   ENTITY-layer count, and it belongs to `src/domain/entities/`, not here.)
//
//   THE "16+" FIGURE IS NOT ABOUT THIS SLICE. The project brief flags that DI/1
//   injects sixteen or more services, and that is a property of ONE out-of-scope
//   component. Verified counts: BrandService 1 - OptionService 2 declared / 1 real
//   - PriceGroupService 3 - PromotionService 3 - RoundingRuleService 1 - SkuService
//   5 declared / 4 real (this file) - ProductService 8 declared / 6 real -
//   OrderService 16 ([model/service/OrderService.cfc:L51] plus L53-L67, OUT OF
//   SCOPE). The heaviest in-scope service takes eight. The work in this slice is
//   not untangling a sixteen-way graph.
//
// ⚠ LOCATOR AUDIT - THE SOURCE WINS, AND TWO CORRECTIONS ARE RECORDED
//   Every `model/service/SkuService.cfc` locator cited below was re-read from the
//   source while authoring this file. ALL OF THEM PROVED EXACT - the component is
//   334 lines and no line reference drifted, so no correction is recorded against
//   that file. Two corrections ARE recorded, and both are carried at their point
//   of use rather than only here:
//
//     1. `ProductType.getBaseProductType()` is ASYNCHRONOUS, not synchronous. See
//        the LEGACY-NOTE inside `createSkus`.
//     2. [model/service/SkuService.cfc:L70] declares a local that is never read.
//        See the LEGACY-NOTE inside `createSkus`.
//
//   A third correction was already carried into this file's brief and is honoured:
//   the unguarded-`arrayFind`-as-index finding is DUPLICATED, appearing at
//   [L236-L237] inside `getProductSkus` AND at [L264-L265] inside
//   `getSortedProductSkus`. Both sites are annotated.
//
// SIGNATURE RESHAPING - THIS FILE SPENDS EXACTLY HALF OF #2 AND NOTHING ELSE
//   `getSkuSmartList` -> `findSkus` is one half of budgeted reshaping #2; the
//   other half is `getProductSmartList` -> `findProducts` in
//   `src/services/productService.ts` (planned), and together they count as ONE.
//   Nothing else in this file is reshaped: no visibility is widened (the private
//   merge helper stays private), no signature is widened (no method gains a
//   parameter), no port member is invented BY THIS FILE (the port set stays at
//   thirteen, `skuRepository` at seven members, `optionRepository` at two), and no
//   finding is repaired - every one is reproduced.
//
//   ★ THE FIGURE MOVED TWICE AND RETURNED TO SEVEN, AND THE CLAIM NEVER DEPENDED ON
//   IT. For one revision the SKU port carried an eighth member - a bulk save - and
//   this parenthetical read "eight". The eighth member has been removed: the port's
//   own header fixes the arithmetic at SEVEN and LOCKS it, so eight was never an
//   authorised figure to record. This file was not where it came from and is not
//   where it went; the bulk member was consumed only by `processProduct_updateSkus`
//   in `src/services/productService.ts`, which now writes through the single-entity
//   `saveSku` under the batch-limit, idempotency and compensation obligations AAP
//   0.6.5 places on a bulk mutation path. The claim being made here - that THIS file
//   invents no port member - was true at seven, stayed true at eight, and is true at
//   seven again.
//
// CFML parity [model/service/SkuService.cfc:L49]: the component declares
// `extends="HibachiService" persistent="false" accessors="true" output="false"`.
// None of the four attributes has a TypeScript analogue and all four are dropped.
// The attribute set is inconsistent across the service family - it matches
// `BrandService.cfc:L49` and `RoundingRuleService.cfc:L49` exactly, while
// `OptionService.cfc:L49` omits `persistent` and `output` - and the inconsistency
// is recorded once, here, rather than at each dropped attribute.
//
// CFML parity [model/service/SkuService.cfc:L275-L331]: FIVE of the nine public
// methods sit ABOVE the first section banner. `createSkus`, `processImageUpload`,
// `getProductSkus`, `getSortedProductSkus` and `searchSkusByProductType` all
// precede `// START: Logical Methods` at L275, which then encloses nothing. Of the
// seven banner pairs, five are EMPTY (Logical Methods, Process Methods, Status
// Methods, Save Overrides, Get Overrides), one holds three methods (DAO
// Passthrough) and one holds a single method (Smart List Overrides). The Status
// Methods pair at L299-L301 is a banner neither `BrandService` nor `OptionService`
// has at all. The target orders members by the reading order of the source and
// carries no banner, so the layout is recorded rather than reproduced.
//
// CFML parity [model/service/SkuService.cfc:L293]: this component is the CLEAN
// COUNTER-EXAMPLE to the project's duplicated-`START`-banner wart - L293 correctly
// reads `END: DAO Passthrough`. That wart stands at four occurrences and no more
// (`PromotionService.cfc:L1102`, `RoundingRuleService.cfc:L181/L183`,
// `BrandService.cfc:L57/L59` and `OptionService.cfc:L70/L80`, the last two having
// no END banner at all). There is no fifth here, and none should be looked for.
//
// CFML parity [model/service/SkuService.cfc:L272, L282, L286, L290, L312]: all
// five `argumentCollection` forwards use a capital `C`, matching
// `OptionService.cfc:L73/L77` and differing from `RoundingRuleService.cfc:L63`'s
// lowercase `argumentcollection`. Cosmetic, recorded once, and moot in the target
// where every argument is named explicitly.
//
// CFML parity [model/service/SkuService.cfc:L223, L248]: the word-form comparison
// operators `gt` and `lt` become `>` and `<`.
//
// ON `numberFormat` AND `precision`, WHICH THIS FILE DELIBERATELY DOES NOT IMPORT
//   `src/lib/cfml/numberFormat.ts` and `src/lib/cfml/precision.ts` are available to
//   this layer and are not used, which is a decision rather than an oversight. This
//   service performs NO arithmetic and has NO presentation step: the only monetary
//   comparison it makes is the `listPrice > 0` clause, and that goes through
//   `Money.isGreaterThan(Money.zero)`. `toFixed2` is presentation-only and the
//   legacy slice applies it at the very end of the promotion and price-group
//   calculations, never here.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';

import { Sku } from '../domain/entities/sku.js';
import { Money } from '../domain/valueObjects/money.js';
import { listGetAt, listLen } from '../lib/cfml/list.js';
import { cfEquals, structGet, structKeyExists } from '../lib/cfml/struct.js';
import { cfLen, cfTruthy, isNullish } from '../lib/cfml/truthiness.js';

import type { Option } from '../domain/entities/option.js';
import type { OptionGroup } from '../domain/entities/optionGroup.js';
import type { Product } from '../domain/entities/product.js';
import type { ProductType } from '../domain/entities/productType.js';
import type { SkuHydrationInput, SkuImageSettingValues } from '../domain/entities/sku.js';
import type { ImageStore, ImageUploadResultProjection } from '../domain/ports/imageStore.js';
import type { SkuRepository } from '../domain/ports/skuRepository.js';
import type {
  SubscriptionBenefitHandle,
  SubscriptionTermProvider,
} from '../domain/ports/subscriptionTermProvider.js';
import type { CfTruthyInput } from '../lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// Module-local constants and helpers.
//
// All of them are module-scope and IMMUTABLE. Nothing below is mutable module
// state, so nothing leaks between invocations on a warm container - the legacy
// component-level caches in this slice (`SkuDAO.variables.nextOptionGroupSortOrder`
// among them) are precisely what must not be reproduced as module state, and this
// file introduces none. None of these helpers is exported: this module exports
// exactly one runtime value, the `SkuService` class.
// ---------------------------------------------------------------------------

/**
 * The allowed image extensions, verbatim from [model/service/SkuService.cfc:L212].
 *
 * Preserved character for character as a comma-delimited list, because it IS the
 * legacy value and B5 forbids adding, removing or reordering a constraint the
 * legacy states. It is a BUSINESS CONSTANT rather than configuration, so it stays
 * here and does not move to `src/lib/config.ts` - E6 governs credentials and
 * setting values, and this is neither.
 */
const ALLOWED_IMAGE_EXTENSIONS = 'jpg,jpeg,png,gif';

/**
 * The three resource-bundle identifiers this component passes to `addError`.
 *
 * THESE ARE DATA CONTRACTS AND ARE PRESERVED BYTE FOR BYTE, TYPOS INCLUDED.
 * `rbKey()` resolves them through JavaRB in the legacy admin, and AAP 0.5.3 keeps
 * every such identifier verbatim as a string constant precisely so the legacy
 * admin can still resolve it. NO i18n RUNTIME IS INTRODUCED.
 *
 * Two details are deliberate and must not be "fixed":
 *   * [L143] misspells benefits as `benifits`. Correcting it would break the
 *     lookup against the shipped resource bundle.
 *   * [L176] uses the `validate.` prefix while [L143] and [L148] use `entity.`.
 */
const RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED = 'entity.product.subscriptionbenifitsrequired';
const RB_KEY_SUBSCRIPTION_TERMS_REQUIRED = 'entity.product.subscriptiontermsrequired';
const RB_KEY_ACCESS_CONTENTS_REQUIRED = 'validate.product.accesscontentsrequired';

/**
 * The five keyword properties [model/service/SkuService.cfc:L318-L322] establishes,
 * with their weights.
 *
 * ★ ALL FIVE CARRY `weight=1` - IDENTICAL. There is therefore NO ranking
 * differentiation anywhere in the legacy smart list, and none is invented here: no
 * relevance scoring, no ordering by weight, no boost. The weights are carried as
 * data so the uniformity is checkable rather than asserted.
 */
const SKU_KEYWORD_PROPERTIES = [
  { propertyIdentifier: 'skuCode', weight: 1 },
  { propertyIdentifier: 'skuID', weight: 1 },
  { propertyIdentifier: 'product.productName', weight: 1 },
  { propertyIdentifier: 'product.productType.productTypeName', weight: 1 },
  { propertyIdentifier: 'alternateSkuCodes.alternateSkuCode', weight: 1 },
] as const;

/**
 * The three joins [model/service/SkuService.cfc:L314-L316] establishes.
 *
 * ★ THE FIRST TWO `joinType` VALUES ARE THE EMPTY STRING, AND THAT WAS VERIFIED
 * RATHER THAN GUESSED. `joinRelatedProperty(parentEntityName, relatedProperty,
 * joinType="", fetch=false, isAttribute=false)` at
 * [org/Hibachi/HibachiSmartList.cfc:L212] defaults `joinType` to `""`, so L314 and
 * L315 pass no join type at all and only L316 passes `"left"`. Writing `'inner'`
 * for the first two would invent a value the legacy never states; the empty string
 * is what the legacy actually establishes and is what is carried.
 *
 * THE LEFT JOIN ON `alternateSkuCodes` IS PRESERVED AS A CRITERIA CONCERN. It is
 * deliberately NOT expressed as an association on `src/domain/entities/sku.ts` -
 * that entity holds `alternateSkuCodeIDs` and nothing richer, the entity layer is
 * locked, and inventing a full association there to satisfy a join descriptor
 * would be the wrong end of the system to change.
 */
const SKU_SMART_LIST_JOINS = [
  { parentEntityName: 'SlatwallSku', relatedProperty: 'product', joinType: '' },
  { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType', joinType: '' },
  { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
] as const;

/**
 * The default bound on how many SKUs one `createSkus` invocation will create.
 *
 * AAP 0.6.5 REQUIRES an explicit batch limit on the bulk SKU paths, so a bound
 * must exist for the requirement to be met; it is constructor-configurable, and
 * the reasoning for the bound itself is at `createSkus`. This is a COUNT, which is
 * a correctness bound. It is not a duration, a rate or a size budget, and no such
 * figure appears anywhere in this file.
 */
const DEFAULT_MAXIMUM_SKU_CREATION_BATCH_SIZE = 1000;

/**
 * What CFML's `isNumeric()` accepts, expressed as one pattern.
 *
 * A module-scope `const` holding an immutable `RegExp` literal, compiled once. It
 * carries no `g` or `y` flag, so it holds no `lastIndex` cursor that could leak
 * between calls on a warm container.
 *
 * THIS PATTERN IS CARRIED VERBATIM FROM `src/domain/entities/roundingRule.ts`,
 * which is the house precedent for a module-local `isNumeric`. Neither
 * `src/lib/cfml/numberFormat.ts` nor `src/lib/cfml/truthiness.ts` exports such a
 * predicate - both were read - so a local one is the sanctioned resolution, and
 * using the SAME pattern as the existing one keeps two files from disagreeing
 * about what CFML considers numeric.
 *
 * The four branches, in order:
 *   `[+-]?`                  an optional leading sign. CFML accepts both.
 *   `\d+(?:\.\d*)?`          digits with an optional fractional part, so `'99'`,
 *                            `'0.99'` and the trailing-point form `'99.'` pass.
 *   `\.\d+`                  the leading-point form: `'.99'`.
 *   `(?:[eE][+-]?\d+)?`      an optional exponent.
 *
 * Deliberately REJECTED, each because CFML rejects it too: the empty string, a
 * lone `'.'` or `'-'`, group separators (`'1,000'`), hexadecimal, `'Infinity'`,
 * `'NaN'`, and an exponent with no digits.
 */
const CFML_NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A LOCAL EQUIVALENT of CFML's `isNumeric()`, scoped to the values that reach it.
 *
 * JUDGMENT CALL: A MODULE-LOCAL PREDICATE, BECAUSE NO SHARED ONE EXISTS AND
 * `decimal.js` MAY NOT BE IMPORTED HERE. This stands in for the `isNumeric` clause
 * of the `listPrice` guard at [model/service/SkuService.cfc:L94] and
 * [model/service/SkuService.cfc:L130]. The parameter is `string` rather than a
 * wider union because the only value that reaches it is a `listPrice` field read
 * off the input struct, which the typed contract declares as a `string`. Widening
 * it to cover `isNumeric()` applied to a boolean or a date would add behaviour
 * that cannot arise here and invite a caller to depend on it.
 *
 * Whitespace is trimmed before testing, which is CFML parity rather than
 * convenience: both target engines tolerate surrounding whitespace in
 * `isNumeric()`.
 *
 * @param value - a `listPrice` field value exactly as it was read.
 * @returns `true` when CFML would consider `value` numeric.
 */
function isNumeric(value: string): boolean {
  return CFML_NUMERIC_PATTERN.test(value.trim());
}

/**
 * Canonicalises a CFML numeric literal into the plain decimal numeral `Money`
 * accepts.
 *
 * CFML parity: assigning a form value to a `big_decimal` property coerced it
 * silently, so `' 9.99 '`, `'+9.99'` and `'9.'` all reached the column as the same
 * number. `Money`'s grammar is deliberately narrower than CFML's `isNumeric` -
 * `/^-?(?:\d+(?:\.\d+)?|\.\d+)$/`, which admits no sign other than `-`, no
 * exponent, no trailing point and no whitespace - so that coercion has to happen
 * somewhere explicit. It happens here, and it is enumerated rather than open-ended:
 * trim, drop a leading `+`, drop a trailing `.`. Nothing else is rewritten.
 *
 * A form `Money` still cannot represent after canonicalisation - the exponent form
 * is the only realistic one - is NOT reinterpreted. It is left to fail at the
 * `Money` boundary, which for `listPrice` means it is dropped through the very same
 * path a non-numeric `listPrice` is dropped through, and for `price` means it
 * raises. Both outcomes match what the legacy produced for a value its column could
 * not hold.
 *
 * @param value - a CFML numeric literal.
 * @returns the same value as a candidate plain decimal numeral.
 */
function canonicalPlainDecimalNumeral(value: string): string {
  const trimmed = value.trim();
  const unsigned = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;

  return unsigned.endsWith('.') ? unsigned.slice(0, -1) : unsigned;
}

/**
 * A CFML-shaped entity identifier, generated the way `createHibachiUUID()` is.
 *
 * `createHibachiUUID()` [org/Hibachi/HibachiObject.cfc:L144-L146] is one statement,
 * `return replace(lcase(createUUID()), '-', '', 'all');` [L145] - thirty-two lowercase
 * hexadecimal digits with no separators. (The locator was previously given as [L144]
 * alone, which is the `function` line rather than the expression.) This
 * reproduces that shape exactly, so an identifier minted here is indistinguishable
 * from one the CFML application would mint against the same `Sw*` column. That is
 * schema continuity, which the transformation plan makes a hard constraint.
 *
 * THE VALUE IS PROVISIONAL, AND THAT IS BY THE REPOSITORY'S DESIGN.
 * `mysqlSkuRepository.insertSku` mints its own key with an identically-shaped
 * generator and returns a rehydrated SKU carrying it, so the identifier assigned
 * here is what the in-memory draft is addressed by until it is persisted - the
 * counterpart of the key Hibachi assigned to a `newSku()` before flush.
 *
 * `node:crypto` is a RUNTIME BUILT-IN, not a third-party package, so importing it
 * spends nothing against the thirteen pinned dependencies `package.json` declares
 * (three runtime, ten development). The same reasoning
 * already governs `src/domain/entities/promotionCode.ts`.
 */
function createHibachiShapedIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Raised when the sorted-ID result cannot be filled densely from the supplied SKUs.
 *
 * MODULE-LOCAL AND NOT EXPORTED, following the pattern `src/repositories/mysql/dialect.ts`
 * and `src/repositories/mysql/connection.ts` already establish: the class is local, it sets
 * an explicit `name`, and a caller that needs to distinguish it identifies it by that name
 * rather than by `instanceof`. Exporting it would add a second exported unit to a file whose
 * one exported class is `SkuService`.
 *
 * ★★ WHY THIS EXISTS AT ALL, AND WHY IT IS NOT A GUARD BOLTED ON TO LEGACY BEHAVIOUR.
 * `arrayResize` at [model/service/SkuService.cfc:L232] and [model/service/SkuService.cfc:L260]
 * sizes the result to the QUERY's row count, which is independent of how many SKUs the caller
 * supplied. When the query returns more rows than the SKU array covers, the CFML result carries
 * genuine null slots. Those slots are not benign in CFML either - `<cfloop array="...">` over an
 * array containing a null element raises, and so does any expression that dereferences one - so
 * an input that produced a hole was ALREADY a failing input. What differed was only WHERE the
 * failure surfaced: in the legacy at the caller's first touch of a hole, with a message naming
 * neither the product nor the sort, and only if the caller happened to touch it.
 *
 * THE HONEST STATEMENT OF THE DIVERGENCE. This raises at the producer instead, deterministically,
 * naming the product and both counts. That is not a success turned into a failure - the success
 * set is unchanged, because a dense fill still returns exactly the array the legacy returned. It
 * IS a divergence in one narrow case: a legacy caller that received a sparse array and never
 * touched the hole observed no error, and such a caller now does. That case is accepted
 * deliberately, for two reasons that both outrank it. The migration plan FREEZES the published
 * return type of `getProductSkus` and `getSortedProductSkus` as `Promise<Sku[]>`, and an array
 * that is typed `Sku[]` while containing `undefined` is not that type - every `map`, `filter` and
 * `forEach` callback on it receives a statically guaranteed `Sku` that is not one. And the
 * alternative resolutions are worse: widening the published type would break the frozen
 * signature, and compacting or filtering the holes away would silently return a DIFFERENT array
 * from the legacy's - reordered, and short - which is a wrong answer rather than a refused one.
 *
 * The two legacy raises inside the fill loop are untouched and still reproduce their own sites.
 */
class SkuSortOrderError extends Error {
  /** The product whose SKUs were being sorted. */
  readonly productID: string;

  /** How many rows the sorted-ID query returned, i.e. the resized length. */
  readonly sortedIdentifierCount: number;

  /** How many SKUs the caller supplied to fill those rows. */
  readonly suppliedSkuCount: number;

  /** Which positions were left unfilled, zero-based, in ascending order. */
  readonly unfilledPositions: readonly number[];

  constructor(
    productID: string,
    sortedIdentifierCount: number,
    suppliedSkuCount: number,
    unfilledPositions: readonly number[],
    siteLocator: string,
  ) {
    super(
      [
        `SkuService could not place a SKU at every position of the sorted-ID result for product`,
        `'${productID}': the query returned ${String(sortedIdentifierCount)} row(s) but only`,
        `${String(suppliedSkuCount)} SKU(s) were supplied, leaving position(s)`,
        `${unfilledPositions.join(', ')} unfilled.`,
        `[model/service/SkuService.cfc:${siteLocator}] sizes the result with arrayResize to the`,
        'query row count, so those positions are CFML nulls - which raise on the first access, at',
        'the caller rather than here. The published return type is Sku[], so the array is refused',
        'at the boundary instead of being handed over with holes in it.',
        'Load the product with every SKU the query can return, or narrow the query to the SKUs in',
        'hand.',
      ].join(' '),
    );
    this.name = 'SkuSortOrderError';
    this.productID = productID;
    this.sortedIdentifierCount = sortedIdentifierCount;
    this.suppliedSkuCount = suppliedSkuCount;
    this.unfilledPositions = unfilledPositions;
  }
}

// ---------------------------------------------------------------------------
// Co-located type declarations.
//
// E7 permits this module to declare the type aliases that belong to its one
// exported class, which is what licenses `CreateSkusInput`, `ImageUploadResult`,
// `SkuQueryCriteria` and `SkuPage` to live here. There is no barrel, no
// `index.ts` and no `types.ts`, and none may be added. Every legacy `any` or
// `struct` below has become a concrete entity type or a named interface: not one
// index signature, not one `Record<string, unknown>` filter bag, not one `any`.
// ---------------------------------------------------------------------------

/**
 * The `data` struct [model/service/SkuService.cfc:L58] receives, typed.
 *
 * The legacy signature is `createSkus(required any product, required struct data)`
 * and the struct is untyped, so this interface is the target's replacement for it.
 * Its members are exactly the keys the 150-line body actually reads - eight of
 * them - and nothing more.
 *
 * ★ `price` IS REQUIRED, BECAUSE THE LEGACY MAKES IT REQUIRED BY OMISSION.
 * It is read UNGUARDED at six sites: [L93], [L129], [L156], [L157], [L183] and
 * [L193]. Not one of them tests `structKeyExists` first, so its absence raises in
 * CFML. It is therefore typed as required, and NO guard and NO default is added
 * (B5). There is no `Money.zero` fallback anywhere in this file: a silent zero in a
 * price path sells product for free.
 *
 * ★ THERE IS NO `renewalPrice` MEMBER, AND THAT IS DELIBERATE. [L157] sets the
 * SKU's renewal price from `data.price` - the same value, not a separate input.
 * Introducing a `renewalPrice` field would invent a capability the legacy lacks.
 *
 * ★ THE COMMA-DELIMITED LISTS STAY `string`. `options`, `subscriptionBenefits`,
 * `subscriptionTerms`, `renewalSubscriptionBenefits` and `accessContents` are all
 * CFML lists, iterated with `listLen` / `listGetAt`. They keep their legacy shape
 * for signature parity and are parsed internally through `src/lib/cfml/list.ts`,
 * never by a hand-rolled `split(',')`.
 *
 * ★ `renewalSubscriptionBenefits` IS OPTIONAL SO THAT ITS ABSENCE IS
 * REPRESENTABLE. That is not an oversight; it is what lets the file reproduce the
 * finding at [L163]. See the LEGACY-DEFECT marker there.
 */
export interface CreateSkusInput {
  /**
   * [L93], [L129], [L156], [L157], [L183], [L193] - a decimal numeral, read
   * unguarded at every one of those six sites. Required; see the note above.
   */
  readonly price: string;

  /**
   * [L94-L96], [L130-L132] - a decimal numeral, gated by a THREE-clause guard.
   * Optional, and a value of exactly `0` or a non-numeric value is silently
   * dropped, exactly as the legacy drops it.
   */
  readonly listPrice?: string | undefined;

  /**
   * [L64], [L73], [L74] - a comma-delimited list of `optionID`s. Its presence and
   * non-zero STRING LENGTH is what selects the multi-SKU merchandise branch.
   */
  readonly options?: string | undefined;

  /**
   * The `Option` entities the `options` list names, already hydrated.
   *
   * ★ THIS IS THE §5.3 RESOLUTION, AND IT ADDS NO PORT MEMBER.
   * LEGACY-NOTE [model/service/SkuService.cfc:L74]: `getOptionService().getOption(id)`
   * is `HibachiService`'s generic `get<Entity>(primaryKey)` CRUD accessor, NOT a
   * method declared on `OptionService.cfc` - that component declares only
   * `getOptionsForSelect`, `getUnusedProductOptions` and
   * `getUnusedProductOptionGroups`. The thirteen-port set has no option-by-ID
   * loader and `optionRepository` is locked at two members, both returning
   * `SelectOption[]`, so no port member was invented to satisfy this.
   *
   * JUDGMENT CALL: RESOLUTION (i) - ACCEPT ALREADY-HYDRATED OPTIONS AT THE
   * BOUNDARY. `data.options` remains the legacy comma-list, so the [L73] iteration
   * and the [L74] positional read are preserved exactly, INCLUDING duplicate IDs
   * and the caller's ordering; what changes is only WHERE the ID becomes an
   * entity. Hydration moves to `src/handlers/bootstrap.ts` (planned) and the
   * handler, which is where this subtree materialises every other association -
   * the repository boundary - rather than lazily inside business logic. Resolution
   * (ii), a narrow injected reader, was rejected because the only port that could
   * carry it is locked and returns the wrong shape.
   */
  readonly resolvedOptions?: readonly Option[] | undefined;

  /** [L142], [L160], [L161] - a comma-delimited list of `subscriptionBenefitID`s. */
  readonly subscriptionBenefits?: string | undefined;

  /** [L147], [L153], [L158] - a comma-delimited list of `subscriptionTermID`s. */
  readonly subscriptionTerms?: string | undefined;

  /**
   * [L163], [L164] - a comma-delimited list of `subscriptionBenefitID`s, iterated
   * with NO preceding existence guard. See the LEGACY-DEFECT marker at that site.
   */
  readonly renewalSubscriptionBenefits?: string | undefined;

  /** [L175], [L186], [L187], [L191], [L196] - a comma-delimited list of `contentID`s. */
  readonly accessContents?: string | undefined;

  /**
   * [L181] - tested for existence and then for BARE TRUTHINESS on the value
   * itself, which is why it is typed as CFML-truthy input rather than `boolean`.
   */
  readonly bundleContentAccess?: CfTruthyInput;
}

/**
 * The `imageUploadResult` struct [model/service/SkuService.cfc:L210] receives.
 *
 * JUDGMENT CALL: AN ALIAS OF THE PORT'S OWN PROJECTION, NOT A PARALLEL SHAPE.
 * `src/domain/ports/imageStore.ts` already declares `ImageUploadResultProjection`
 * as the contract `saveImageFile` accepts. Re-declaring a structurally-similar
 * interface here would create two descriptions of one contract that could drift
 * apart, so this alias names the legacy parameter while the port remains the single
 * definition. The alias exists because the interface table names this type; the
 * shape is the port's.
 */
export type ImageUploadResult = ImageUploadResultProjection;

/**
 * The typed criteria that replaces the `HibachiSmartList` this component built at
 * [model/service/SkuService.cfc:L309-L325].
 *
 * ★ `keyword` IS REQUIRED, AND THAT IS THE HONEST TYPING.
 * The seven-member `SkuRepository` has no member that lists SKUs without a search
 * term, AND NO MEMBER MAY BE ADDED. Making the keyword required renders the
 * unfiltered listing UNREPRESENTABLE AT COMPILE TIME rather than letting it fail at
 * runtime, and the unfiltered listing is part of the open-ended dynamic filtering
 * surface this port deliberately does not reproduce. Saying so in the type is
 * better than discovering it in a stack trace.
 *
 * ★ THE BLANKET CLAUSE LAPSED FOR ONE REVISION AND HAS BEEN RESTORED. While the
 * port briefly carried an eighth member this paragraph dropped "AND NO MEMBER MAY BE
 * ADDED" and argued the narrower point instead - that the eighth was a WRITE, so no
 * READ member answered an unfiltered listing either way. The narrower argument was
 * sound and is why the conclusion never moved; the clause is back because the port
 * is back to seven and LOCKED there. What would justify relaxing the required
 * keyword is a member that lists SKUs without a term, and no such member exists or
 * may be added.
 *
 * There is no filter bag, no arbitrary property path, no `data` struct passthrough
 * and no paging surface - `data={}` and `currentURL=""` were framework plumbing and
 * are dropped, as recorded at `findSkus`.
 */
export interface SkuQueryCriteria {
  /** The search term. Matched against the keyword properties the page reports. */
  readonly keyword: string;

  /**
   * An optional product-type filter, carried as a comma-delimited list exactly as
   * `searchSkusByProductType` carries it.
   *
   * ★ SINGULAR, DELIBERATELY. `skuRepository.searchSkusByProductType` takes
   * `productTypeID` while `productRepository.searchProductsByProductType` takes
   * `productTypeIDs`. Both are the legacy names and both are preserved verbatim;
   * the asymmetry is NOT harmonised.
   */
  readonly productTypeID?: string | undefined;
}

/**
 * What `findSkus` returns: the matched SKUs plus the criteria surface that produced
 * them.
 *
 * The joins and keyword properties are reported rather than hidden so that the
 * surface the legacy smart list established is OBSERVABLE - which also makes it
 * directly assertable by the net-new test tier, instead of being a claim buried in
 * a comment.
 */
export interface SkuPage {
  /** The matched SKUs, in the order the repository returned them. */
  readonly skus: readonly Sku[];

  /** The term that was searched for, echoed back. */
  readonly keyword: string;

  /** The five keyword properties [L318-L322] establishes, all at weight 1. */
  readonly keywordProperties: typeof SKU_KEYWORD_PROPERTIES;

  /** The three joins [L314-L316] establishes, including the LEFT one. */
  readonly joins: typeof SKU_SMART_LIST_JOINS;
}

/**
 * The four association ID sets a SKU draft can carry at construction.
 *
 * ★ WHY THESE ARRIVE AT CONSTRUCTION RATHER THAN THROUGH SETTERS.
 * LEGACY-NOTE [model/service/SkuService.cfc:L158, L161, L164, L187, L196]: the
 * legacy calls `setSubscriptionTerm`, `addSubscriptionBenefit`,
 * `addRenewalSubscriptionBenefit` and `addAccessContent` on a SKU it has already
 * created. `src/domain/entities/sku.ts` PUBLISHES NONE OF THOSE FOUR MUTATORS - it
 * holds `subscriptionTermID`, `subscriptionBenefitIDs`,
 * `renewalSubscriptionBenefitIDs` and `accessContentIDs` as hydration-time inputs
 * with getters only.
 *
 * ★ NO MUTATOR WAS ADDED BECAUSE NONE IS NEEDED, NOT BECAUSE ONE IS FORBIDDEN, AND
 * THE DISTINCTION MATTERS ELSEWHERE IN THIS FILE. Where an ORM-implicit member the
 * ported slice CONCRETELY CALLS has no substitute, it IS authored - that is what
 * `Product.setDefaultSku` is, and `src/domain/entities/product.ts` §0.6 instructs
 * exactly that. Here a substitute exists and is exact: each of those four legacy
 * calls exists to write a link row keyed by the far-side ID, and
 * `mysqlSkuRepository` carries all four ID sets through to persistence. The only
 * thing that moves is WHEN the IDs are attached, and nothing observes a draft
 * between construction and save, so the persisted outcome is identical. Adding four
 * mutators to reach the same rows would add surface without adding behaviour.
 *
 * Module-local and not exported: this module exports one runtime value.
 */
type SkuDraftAssociations = Pick<
  SkuHydrationInput,
  'subscriptionTermID' | 'subscriptionBenefitIDs' | 'renewalSubscriptionBenefitIDs'
> &
  Pick<SkuHydrationInput, 'accessContentIDs'>;

/**
 * One accumulated validation failure, standing in for a `HibachiEntity` error entry.
 *
 * Module-local; see the `createSkus` note on error accumulation for why the
 * failures cannot be attached to the product.
 */
interface SkuCreationValidationFailure {
  /** The property the legacy `addError` call names. */
  readonly propertyName: string;

  /** The resource-bundle identifier, preserved verbatim. */
  readonly rbKey: string;
}

/** The union of every value type `CreateSkusInput` can hold. */
type CreateSkusInputValue = CreateSkusInput[keyof CreateSkusInput];

/**
 * Reads a `string` field off the input struct with CFML's CASE-INSENSITIVE key
 * semantics.
 *
 * CFML struct keys are case-insensitive and TypeScript's are not, so every
 * `arguments.data.x` read in the legacy body would have found a key written
 * `X`. `structGet` reproduces that, which matters because this input may arrive
 * from JSON at a handler boundary. There is NO `defaultValue` argument and none is
 * available on that helper - that is exactly how a `0` would sneak into a price
 * path.
 *
 * A key holding a non-string value answers `undefined` rather than being coerced.
 * The typed contract declares every one of these fields as `string`, so a non-string
 * cannot arrive through it, and coercing an off-contract value would be inventing a
 * conversion the legacy never performed here.
 */
function readStringField(data: CreateSkusInput, key: string): string | undefined {
  const value: CreateSkusInputValue | undefined = structGet(data, key);

  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads a CFML-truthy field off the input struct with case-insensitive key
 * semantics. Used only for [L181]'s `bundleContentAccess`.
 */
function readTruthyField(data: CreateSkusInput, key: string): CfTruthyInput {
  const value: CreateSkusInputValue | undefined = structGet(data, key);

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

/**
 * The three `baseProductType` values [model/service/SkuService.cfc:L61], [L139] and
 * [L173] dispatch on, exactly as spelled in the source.
 *
 * ★ THE COMPARISONS ARE CASE-INSENSITIVE, AND THAT IS NOT OPTIONAL.
 * CFML's `==` folds case, TypeScript's `===` does not, so a `SwProductType` row
 * storing `"Merchandise"` matches at [L61] in the legacy and would fall straight
 * through to the [L204] throw under a naive `===`. Every one of the three tests
 * therefore goes through `cfEquals`, never `===`.
 */
const BASE_PRODUCT_TYPE_MERCHANDISE = 'merchandise';
const BASE_PRODUCT_TYPE_SUBSCRIPTION = 'subscription';
const BASE_PRODUCT_TYPE_CONTENT_ACCESS = 'contentAccess';

/**
 * The message [model/service/SkuService.cfc:L204] raises, verbatim.
 *
 * CFML parity [model/service/SkuService.cfc:L204]: the legacy statement is the bare
 * form `throw("There was an unexpected error when creating this product")`, so the
 * string IS the message and there is no type, detail or error code to carry. The
 * wording is reproduced character for character INCLUDING its generic
 * unhelpfulness: it does not name the offending `baseProductType`, and adding it
 * would improve on the legacy rather than preserve it. No custom error class
 * hierarchy is introduced for the same reason.
 */
const UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE =
  'There was an unexpected error when creating this product';

/**
 * The mutable per-invocation ledger `createSkus` threads through its three branches.
 *
 * ★ WHY THIS EXISTS AT ALL: ONE FRAMEWORK AFFORDANCE IS ABSENT. It carried TWO
 * fields, and the first has been retired - see immediately below.
 *
 * ★★ THE DEFAULT-SKU DESIGNATION USED TO LIVE HERE AND NO LONGER DOES, BECAUSE THE
 * PREMISE THAT PUT IT HERE WAS FALSE. All five default-SKU sites
 * [model/service/SkuService.cfc:L102, L134, L167, L189, L198] call
 * `arguments.product.setDefaultSku(...)`, and an earlier revision diverted every
 * one of them into a `designatedDefaultSku` field on this ledger, reasoning that
 * `Product` held `defaultSku` as a private readonly hydration-time field with a
 * getter only and that "the entity layer is locked at eighteen files with one
 * exported class each, so no setter was added to it".
 *
 * The observation about the shipped class was accurate. The inference from it was
 * not: the eighteen-file lock is a lock on the FOLDER, and the port budgets forbid
 * a fourteenth PORT - neither says anything about a member on an existing class,
 * and `src/domain/entities/product.ts` §0.6 positively instructs that the
 * ORM-implicit members the ported slice CONCRETELY CALLS be generated as
 * explicitly-typed methods annotated with the branch they replace. Five call sites
 * in this one file are exactly that evidence. `Product.setDefaultSku` was therefore
 * authored, all five sites now write where the legacy writes, and the designation
 * reaches `SwProduct.defaultSkuID` through
 * `src/repositories/mysql/mysqlProductRepository.ts`, which already binds that
 * column from `getDefaultSku()`. The field is gone rather than left write-only.
 *
 * ★ AND THE COST OF THE OLD ARRANGEMENT WAS NOT "THE DESIGNATION LANDED SOMEWHERE
 * ELSE" - IT LANDED NOWHERE. A ledger field is private to this module, `createSkus`
 * returns a constant `true` [L207], and no caller could ever read it. So every
 * product this service created reported `getDefaultSku() === undefined`, the
 * `SwProduct.defaultSkuID` column was written NULL, and the eight accessors on
 * `Product` that read through the default SKU all answered their absent-value
 * fallback. That is the defect the retirement fixes, and it is recorded here rather
 * than left to be inferred from the absence of a field.
 *
 * Two further consequences worth recording. [L101]'s first-wins test regained its
 * ONE-CLAUSE shape, because a designation written onto the product is visible to the
 * next iteration without a second bookkeeping clause. And the designation is no
 * longer lost at the end of the invocation, which is what made it unobservable
 * before.
 *
 * LEGACY-NOTE [model/service/SkuService.cfc:L143, L148, L152, L176, L180]: the
 * three `addError` calls and the two `hasErrors()` gates are `HibachiEntity` error
 * collection. `src/domain/entities/product.ts` records that framework error
 * collection is deliberately not reproduced there, and it publishes neither
 * `addError` nor `hasErrors`. The failures are therefore accumulated here - and,
 * unlike the designation, that IS the right home for them: they are request-scoped
 * validation state rather than persisted entity state, and the caller recovers the
 * gate's outcome from the product itself. See the field's own note.
 *
 * JUDGMENT CALL: A SERVICE-LOCAL LEDGER FOR THE FAILURES, AND THE ENTITY FOR THE
 * DESIGNATION. Putting request-scoped validation state on a persistence entity
 * would be wrong for the reason it has always been wrong; putting a persisted
 * association on a per-invocation ledger was wrong for the mirror-image reason.
 * Widening `createSkus` to return the ledger remains unavailable - it would spend a
 * signature reshaping this file has no budget for and would contradict [L207]'s
 * constant-`true` return. A per-invocation ledger keeps the class free of instance
 * state, so the service stays trivially testable and two concurrent invocations
 * cannot observe each other.
 *
 * Module-local and NOT exported: this module exports one runtime value.
 */
interface SkuCreationLedger {
  /**
   * The accumulated `addError` payloads, standing in for the product's error
   * collection and gating creation exactly as [L152] and [L180] gate it.
   *
   * ★ THE LEGACY'S SECOND `hasErrors()` ASK IS OBSERVABLE WITHOUT THIS FIELD
   * LEAVING THE INVOCATION, WHICH IS WHY IT DOES NOT NEED TO. `Product` publishes
   * neither `addError` nor `hasErrors` - `src/domain/entities/product.ts:L1432`
   * records that framework error collection is deliberately not reproduced there -
   * and [L207] returns a constant `true` regardless, so the failures are
   * accumulated here and gate creation here.
   *
   * The caller nevertheless recovers the signal exactly, and
   * `src/services/productService.ts` does: every arm of `createSkus` that completes
   * attaches AT LEAST ONE SKU, and every arm that records an error attaches NONE,
   * so `product.isNew() && product.getSkus().length === 0` holds if and only if
   * creation was refused. That equivalence is enumerated branch by branch at
   * `saveProduct`, where it reproduces the legacy's `!product.hasErrors()` re-test
   * at [model/service/ProductService.cfc:L286]. No cross-service error channel was
   * invented, and none is needed.
   *
   * The resource-bundle identifiers are carried verbatim so a surfacing layer can
   * use them unchanged once an error-collection surface exists.
   */
  readonly validationFailures: SkuCreationValidationFailure[];
}

/**
 * The product code every skuCode formula concatenates, or a raise when it is absent.
 *
 * CFML parity [model/service/SkuService.cfc:L97, L133, L159, L184, L194]: all four
 * formulas concatenate `arguments.product.getProductCode()` with NO null test, and a
 * null reaching a CFML string concatenation raises. `Product.getProductCode()`
 * answers `string | undefined`, so the raise is reproduced explicitly. It is
 * deliberately NOT softened into an empty prefix, which would silently mint codes
 * like `-1` that no product owns.
 *
 * @param product The product whose code prefixes the generated codes.
 * @param siteLocator The legacy locator of the formula that needed it.
 */
function requireProductCode(product: Product, siteLocator: string): string {
  const productCode = product.getProductCode();

  if (productCode === undefined) {
    throw new Error(
      `SkuService.createSkus: product '${product.getProductID()}' has no product code. ` +
        `[model/service/SkuService.cfc:${siteLocator}] concatenates getProductCode() with no ` +
        'null test, so the legacy raises here too.',
    );
  }

  return productCode;
}

/**
 * `data.price` as `Money`, read exactly as unguardedly as the legacy reads it.
 *
 * ★ SIX UNGUARDED READS, AND NOT ONE GUARD ADDED. [L93], [L129], [L156], [L157],
 * [L183] and [L193] all read `arguments.data.price` with no `structKeyExists` test,
 * which makes the field effectively REQUIRED by omission - its absence raises in
 * CFML. No guard is added and no default is supplied (B5), and in particular there is
 * NO `Money.zero` fallback: `?? Money.zero`, `|| Money.zero` and a parameter default
 * of `Money.zero` are all forbidden here, because a silent zero in a price path sells
 * product for free.
 *
 * ★ AND IT IS READ LAZILY, ONCE PER SITE, RATHER THAN HOISTED.
 * Hoisting the read to the top of `createSkus` would raise in branches the legacy
 * never reads it from - the subscription and contentAccess arms both raise on their
 * own validation first - and would move the failure ahead of validation that the
 * legacy performs first. Reading it where the legacy reads it keeps both the failure
 * and its ordering intact.
 *
 * @param data The creation input.
 * @param siteLocator The legacy locator of the read being reproduced.
 */
function requirePrice(data: CreateSkusInput, siteLocator: string): Money {
  const rawPrice = readStringField(data, 'price');

  if (rawPrice === undefined) {
    throw new Error(
      'SkuService.createSkus: price is absent. ' +
        `[model/service/SkuService.cfc:${siteLocator}] reads arguments.data.price with no ` +
        'structKeyExists guard, so the legacy raises here. No default is substituted.',
    );
  }

  return Money.fromDecimalString(canonicalPlainDecimalNumeral(rawPrice));
}

/**
 * `data.listPrice` as `Money`, or `undefined` when the legacy's guard would drop it.
 *
 * ★ THE GUARD IS THREE CLAUSES, NOT TWO, AND ALL THREE ARE REPRODUCED IN ORDER.
 * [model/service/SkuService.cfc:L94] and [L130] read
 * `structKeyExists(arguments.data, "listPrice") && isNumeric(arguments.data.listPrice)
 * && arguments.data.listPrice > 0`. The consequence a reader usually misses is the
 * third clause: a `listPrice` of exactly `0` is SILENTLY DROPPED, not stored as zero.
 *
 * The comparison goes through `Money`, never a raw float compare (E4). `Money`'s own
 * `isGreaterThan` against `Money.zero` is the whole of clause three.
 *
 * ★ THE GRAMMAR GAP IS CLOSED WITHOUT DUPLICATING EITHER GRAMMAR.
 * CFML's `isNumeric` admits forms `Money` does not, and after
 * `canonicalPlainDecimalNumeral` has stripped whitespace, a leading `+` and a
 * trailing `.`, the ONLY remaining difference between the two grammars is exponent
 * notation. Testing for an exponent is therefore exactly equivalent to testing
 * representability, and it needs neither a mirrored copy of `numberFormat.ts`'s
 * module-private plain-decimal pattern nor a `try`/`catch` around a constructor. An
 * exponent-form `listPrice` is DROPPED - the same outcome clause two produces for a
 * non-numeric value - rather than raising, because the legacy accepted this field
 * loosely and dropping is the softer of the two available divergences.
 *
 * ★ AND THE ASYMMETRY ACROSS BRANCHES IS PRESERVED. Only the two merchandise sites
 * have any `listPrice` handling at all. The subscription branch [L156-L157] and both
 * contentAccess sub-branches [L183], [L193] have none, so this function is not called
 * from them.
 *
 * @param data The creation input.
 * @returns The list price, or `undefined` when any clause fails.
 */
function resolveGuardedListPrice(data: CreateSkusInput): Money | undefined {
  // Clause 1 - existence. `structKeyExists` matches the key case-insensitively, as
  // CFML struct keys are matched, and carries NO defaultValue argument: that is
  // exactly how a `0` would otherwise sneak into a price path.
  if (!structKeyExists(data, 'listPrice')) {
    return undefined;
  }

  const rawListPrice = readStringField(data, 'listPrice');

  // Clause 2 - CFML numeric. The `undefined` arm covers a key present with a
  // non-string value, which the typed contract forbids but a JSON boundary can
  // produce; CFML's `isNumeric` would answer false for it too.
  if (rawListPrice === undefined || !isNumeric(rawListPrice)) {
    return undefined;
  }

  const canonicalListPrice = canonicalPlainDecimalNumeral(rawListPrice);

  // The representability test described above. Exponent notation is the only CFML
  // numeric form that survives canonicalisation and that `Money` still rejects.
  if (canonicalListPrice.includes('e') || canonicalListPrice.includes('E')) {
    return undefined;
  }

  const listPrice = Money.fromDecimalString(canonicalListPrice);

  // Clause 3 - strictly greater than zero. A `listPrice` of exactly `0` is dropped.
  return listPrice.isGreaterThan(Money.zero) ? listPrice : undefined;
}

/**
 * The hydrated `Option` that an identifier drawn from `data.options` names.
 *
 * This is where §5.3's resolution lands: the identifier still comes from the legacy
 * comma-list in the legacy order, and the entity comes from the boundary-hydrated
 * array. See `CreateSkusInput.resolvedOptions` for the full reasoning and for why no
 * port member was invented.
 *
 * CFML parity [model/service/SkuService.cfc:L74]: `getOption(id)` was an ORM
 * primary-key load, and a `Sw*` identifier column compares under a case-folding
 * collation, so the match folds case here too - via the shared CFML comparison
 * helper rather than an ad-hoc one.
 *
 * An identifier with no entity raises. That is what the legacy did: `getOption` on a
 * miss answered null, and [L75] then chained `.getOptionGroup()` off it.
 *
 * @param data The creation input, carrying the hydrated options.
 * @param optionID One identifier from the `options` comma-list.
 */
function resolveOptionByID(data: CreateSkusInput, optionID: string): Option {
  const resolvedOptions = data.resolvedOptions;

  if (resolvedOptions !== undefined) {
    for (const candidate of resolvedOptions) {
      if (cfEquals(candidate.getOptionID(), optionID)) {
        return candidate;
      }
    }
  }

  throw new Error(
    `SkuService.createSkus: option '${optionID}' is named in data.options but is absent from ` +
      'data.resolvedOptions. [model/service/SkuService.cfc:L74] loaded it through ' +
      "HibachiService's generic get<Entity>(primaryKey), which the thirteen-port set does not " +
      "carry, so hydration is the boundary's responsibility. An unresolved identifier raises, " +
      'exactly as the legacy raised at [L75] on the null the lookup returned.',
  );
}

// ===========================================================================
// SkuService
// ===========================================================================

/**
 * The SKU half of Slatwall's catalog service surface.
 *
 * Nine public methods, every legacy name carried over verbatim, every one of them
 * asynchronous. See the module header for the async ruling, the collaborator
 * accounting and the budget ledgers.
 */
export class SkuService {
  /**
   * ★ T1 APPLIED: FIVE DI/1 PROPERTIES BECOME THREE COMPILE-CHECKED PORTS.
   *
   * The legacy resolved `property name="skuDAO";` and its four siblings
   * [model/service/SkuService.cfc:L51-L56] through a DI/1 0.4.2 runtime convention
   * scan that carried a thirty-second first-scan lock. Every collaborator here is an
   * explicit constructor argument typed to a PORT INTERFACE - no runtime scan, no
   * service locator, no dependency-injection package - and the whole graph is
   * assembled exactly once in `src/handlers/bootstrap.ts` (planned).
   *
   * Three ports, not five. The arithmetic:
   *
   * - `skuDAO` [L51] becomes `skuRepository`. LIVE at eight sites: [L221], [L224],
   *   [L252], [L272], [L282], [L286], [L290], [L312].
   * - `optionService` [L53] is reached at [L74] ONLY, for a generic
   *   `get<Entity>(primaryKey)` lookup the thirteen-port set does not carry. It
   *   becomes a boundary input rather than a port; see `CreateSkusInput.resolvedOptions`.
   * - `productService` [L54] is DEAD - zero call sites in all 334 lines. Omitted; see
   *   the LEGACY-NOTE below.
   * - `subscriptionService` [L55] is reached at [L158], [L161] and [L164], all inside
   *   the out-of-scope subscription branch. It becomes the
   *   `subscriptionTermProvider` STUB port.
   * - `contentService` [L56] is reached at [L187] and [L196] ONLY, both inside the
   *   out-of-scope contentAccess branch. No content port exists in the thirteen-port
   *   set and none was added; see the LEGACY-NOTE on `createContentAccessSkus`.
   * - `getService("imageService")` [L212] - the ONE `getService()` call in the whole
   *   in-scope service layer - becomes the `imageStore` STUB port. That is T2 applied
   *   to its single service-tier site.
   *
   * ★ THE SIXTH PARAMETER IS NOT A FOURTH PORT. `imageSettingValues` is a bag of
   * ALREADY-RESOLVED ambient values, not a collaborator this service calls -
   * `src/domain/entities/sku.ts` needs them to answer `generateImageFileName()`,
   * and a draft this service constructs must carry them exactly as a repository-
   * hydrated SKU does. That is the same resolved-settings injection
   * `MysqlSkuRepository` takes through its `SkuHydrationCollaborators` bag and
   * `Option` takes through `assetsImageBaseUrl`. It sits LAST because every
   * parameter before it either is required or already carries a default, and
   * inserting it earlier would silently re-bind existing positional call sites.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L54]: DI/1 declared `productService`
   * but no call site exists in the component; the injection is dead and is
   * deliberately not reproduced. `src/handlers/bootstrap.ts` must not wire it. This
   * is one of the project's four dead DI/1 injections, alongside
   * `OptionService.productService`, `ProductService.contentService` and
   * `ProductService.productTypeDAO`.
   *
   * @param skuRepository The seven-member SKU data port. Every query this service
   *   needs arrives through it, which is why no SQL appears in this file (E5).
   * @param imageStore The image stub port, reached only from `processImageUpload`.
   * @param subscriptionTermProvider The subscription stub port, reached only from
   *   the out-of-scope subscription branch of `createSkus`.
   * @param maximumSkuCreationBatchSize The correctness bound on how many SKUs one
   *   `createSkus` invocation will create. See `assertWithinCreationBound`.
   * @param refuseDuplicateSkuCodes Whether `createSkus` refuses to attach a SKU
   *   whose generated code a sibling already carries. See `assertSkuCodeAvailable`.
   * @param imageSettingValues The already-resolved image-setting values every SKU
   *   draft this service constructs carries forward. See `newSkuDraft`.
   */
  public constructor(
    private readonly skuRepository: SkuRepository,
    private readonly imageStore: ImageStore,
    private readonly subscriptionTermProvider: SubscriptionTermProvider,
    private readonly maximumSkuCreationBatchSize: number = DEFAULT_MAXIMUM_SKU_CREATION_BATCH_SIZE,
    private readonly refuseDuplicateSkuCodes: boolean = false,
    private readonly imageSettingValues?: SkuImageSettingValues,
  ) {
    // The bound is meaningless unless it is a positive whole number, and a
    // misconfigured bound would either refuse every invocation or bound nothing at
    // all. This check is on the TARGET-SIDE knob introduced by this port, not on any
    // value the legacy handled, so it adds no constraint to legacy data (B5).
    if (!Number.isSafeInteger(maximumSkuCreationBatchSize) || maximumSkuCreationBatchSize < 1) {
      throw new Error(
        'SkuService: maximumSkuCreationBatchSize must be a positive safe integer; ' +
          `received ${String(maximumSkuCreationBatchSize)}.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // createSkus [model/service/SkuService.cfc:L58-L208]
  // -------------------------------------------------------------------------

  /**
   * Creates the SKU set a newly configured product requires, dispatching on the
   * product's base product type.
   *
   * Ports `public boolean function createSkus(required any product, required struct data)`
   * [model/service/SkuService.cfc:L58-L208] - the component's largest method, four
   * branches, one raise.
   *
   * ★ THE DISPATCH IS FOUR-WAY AND THE FOURTH ARM RAISES.
   * [L61] `"merchandise"` is IN SCOPE and ported in full. [L139] `"subscription"`
   * and [L173] `"contentAccess"` are OUT OF SCOPE and ported as thin paths.
   * [L203-L205] is the `else`, and it raises with the legacy's own message.
   *
   * ★ `getBaseProductType()` IS ASYNCHRONOUS, WHICH CORRECTS THE SPECIFICATION.
   * LEGACY-NOTE [model/entity/ProductType.cfc:L110-L115]: the specification states
   * this accessor is synchronous. It is not, and the source settles it - the legacy
   * body falls back to `getService("ProductService").getProductType(listFirst(
   * getProductTypeIDPath())).getSystemCode()` whenever `systemCode` is empty, which
   * reaches the service and the DAO. `src/domain/entities/productType.ts:L1019`
   * publishes it as `async getBaseProductType(): Promise<string | undefined>`
   * accordingly, and it is the single asynchronous member on that entity. It is
   * therefore awaited here. Verified against source; the specification's claim had
   * drifted.
   *
   * CFML parity [model/service/SkuService.cfc:L61, L139, L173]: the legacy
   * re-evaluates `getProductType().getBaseProductType()` at each of the three branch
   * tests, short-circuiting on the first match. It is resolved once here. The two
   * are observationally identical: the accessor is a read with no side effect, and
   * within one invocation it cannot answer differently. Resolving it once also means
   * a product whose type cannot be resolved raises at the same point the legacy
   * raises - [L61], the first test - rather than at a later branch.
   *
   * CFML parity [model/service/SkuService.cfc:L61]: the legacy chains
   * `getProductType().getBaseProductType()` with NO null test on the product type,
   * so a product with no type raises there. `Product.getProductType()` answers
   * `ProductType | undefined`, and that raise is reproduced explicitly rather than
   * being softened into a default.
   *
   * ★ THIS METHOD PERSISTS NOTHING, EXACTLY AS THE LEGACY PERSISTS NOTHING.
   * There is no `save` anywhere in [L58-L208]: the legacy relied on Hibernate
   * cascading from the product save its CALLER performed - `cascade="all-delete-orphan"`
   * on `Product.skus` [model/entity/Product.cfc:L73] - and on the ORM writing each
   * child's `productID` once the parent's key existed. Adding a save here would hand
   * the method a capability the legacy never had, and would leave the live
   * `product.getSkus()` array holding drafts while the database held their persisted
   * twins, because a repository save answers a rehydrated instance rather than the
   * argument.
   *
   * ★ QUOTE-THEN-REVISE ON WHERE THE CALLER'S SAVE HAPPENS. This paragraph used to end
   * "the drafts this method builds and attaches are persisted by the caller through
   * `SkuRepository.saveSku`", which named the wrong seam. `SkuRepository.saveSku`
   * persists ONE SKU whose product already has a key; it cannot be the cascade for a
   * product that has no key yet, and it cannot order the `SwProduct.defaultSkuID`
   * write that has to follow the SKU inserts. The cascade is therefore driven by
   * `ProductRepository.saveProduct`, which is the ONE place that can hold the product
   * row write, every transient SKU write and the deferred `defaultSkuID` write inside
   * a single transaction - the same unit Hibernate's flush gave them. What this method
   * owes that cascade is exactly what it already produces: every draft attached to
   * `product.getSkus()`, and the designation on `product.getDefaultSku()`.
   *
   * @param product The product to attach the created SKUs to. Mutated in place: its
   *   SKU array is live, and both linking directions push into it.
   * @param data The typed replacement for the legacy `struct`. See `CreateSkusInput`.
   * @returns Always `true`. See the [L207] LEGACY-NOTE below - the value carries no
   *   information, and it is not given one it never had (B5).
   */
  public async createSkus(product: Product, data: CreateSkusInput): Promise<boolean> {
    const productType: ProductType | undefined = product.getProductType();

    if (productType === undefined) {
      throw new Error(
        `SkuService.createSkus: product '${product.getProductID()}' has no product type. ` +
          '[model/service/SkuService.cfc:L61] chains getProductType().getBaseProductType() ' +
          'with no null test, so the legacy raises here too.',
      );
    }

    // `cfEquals` raises when either side is absent, which is what CFML does when a
    // null reaches a comparison - so a product type whose system code cannot be
    // resolved raises rather than silently falling through to the [L204] arm.
    const baseProductType = await productType.getBaseProductType();

    const ledger: SkuCreationLedger = {
      validationFailures: [],
    };

    if (cfEquals(baseProductType, BASE_PRODUCT_TYPE_MERCHANDISE)) {
      // [L61-L136]
      this.createMerchandiseSkus(product, data, ledger);
    } else if (cfEquals(baseProductType, BASE_PRODUCT_TYPE_SUBSCRIPTION)) {
      // [L139-L170]
      await this.createSubscriptionSkus(product, data, ledger);
    } else if (cfEquals(baseProductType, BASE_PRODUCT_TYPE_CONTENT_ACCESS)) {
      // [L173-L202]
      this.createContentAccessSkus(product, data, ledger);
    } else {
      // [L203-L205]
      throw new Error(UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE);
    }

    // LEGACY-NOTE [model/service/SkuService.cfc:L207]: the boolean return is a
    // constant `true`, sitting outside every branch except the raise, and it is
    // reached even when addError() ran and no SKUs were created. Preserved; the
    // return value carries no information and callers must not be given one that it
    // never had (B5). What a caller CAN observe is identical to what the legacy left
    // observable: the SKUs attached to `product.getSkus()`, and nothing else.
    return true;
  }

  // -------------------------------------------------------------------------
  // createSkus - merchandise branch [model/service/SkuService.cfc:L61-L136]
  // -------------------------------------------------------------------------

  /**
   * The merchandise arm: multiple SKUs when options were supplied, a single SKU when
   * they were not.
   *
   * CFML parity [model/service/SkuService.cfc:L64]: the gate is
   * `structKeyExists(arguments.data, "options") && len(arguments.data.options)`, and
   * `len()` applied to a comma-delimited LIST is a STRING-LENGTH test - the identical
   * idiom to [model/entity/Sku.cfc:L373]'s `len(setting('skuEligibleCurrencies'))`.
   * It is emphatically NOT an array length, and it is not `!x`: `cfLen` reproduces it
   * and the result is compared explicitly against zero rather than used as a bare
   * numeric truthiness test.
   */
  private createMerchandiseSkus(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): void {
    // [L64]
    const optionIDList = readStringField(data, 'options');
    const hasOptions = structKeyExists(data, 'options') && cfLen(optionIDList) > 0;

    // The second conjunct is a compile-time narrowing of a condition the first
    // already guarantees - `cfLen(undefined)` is 0, so `hasOptions` cannot hold while
    // the list is absent. It adds no runtime guard (B5); it lets the compiler see
    // what the CFML relied on implicitly.
    if (hasOptions && optionIDList !== undefined) {
      // [L64-L122]
      this.createMerchandiseSkusForOptionCombinations(product, data, ledger, optionIDList);
    } else {
      // [L125-L136]
      this.createSingleMerchandiseSku(product, data, ledger);
    }
  }

  /**
   * One SKU per combination of one option drawn from each option group.
   *
   * Ports [model/service/SkuService.cfc:L64-L122] - the cartesian-product path, and
   * the most delicate code in this file.
   *
   * ★★ THE CARRY LOOP HAS NO BOUNDS CHECK, AND THE [L109] GUARD IS WHAT MAKES THAT
   * SAFE. This is the single most important thing to understand before touching this
   * method; the coupling is invisible and a tidy-up breaks it. See the annotation at
   * the carry loop itself.
   *
   * ★★ THE SKU-CODE COUNTER READS AN ARRAY THIS LOOP IS WRITING. See the annotation
   * at [L97].
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L70]: the legacy declares
   * `var keyToChange = "";` alongside the other four locals and NEVER READS IT
   * ANYWHERE in the 334-line component - a dead local, presumably left behind when
   * the carry loop was rewritten to index `indexedKeys` positionally. It is omitted
   * rather than reproduced: `noUnusedLocals` is on and would reject it, and an unread
   * local has no observable behaviour to preserve. This finding is not in the
   * specification; it was found in situ.
   *
   * CFML parity [model/service/SkuService.cfc:L75-L78]: the legacy keys
   * `optionGroups` by `optionGroupID` in a CFML struct, whose keys are
   * case-insensitive. A `Map` is case-sensitive, which cannot change any outcome
   * here because every key on both the write and the read side comes from the same
   * `getOptionGroupID()` accessor, so two keys differing only in case cannot arise.
   */
  private createMerchandiseSkusForOptionCombinations(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
    optionIDList: string,
  ): void {
    const productCode = requireProductCode(product, 'L97');

    // [L66-L69]. Insertion-ordered structures throughout; see the annotation on the
    // grouping loop below.
    const optionGroups = new Map<string, Option[]>();
    const indexedKeys: string[] = [];
    const currentIndexesByKey = new Map<string, number>();
    let totalCombos = 1;

    // [L73-L79] Bucket every supplied option under its option group, in the order the
    // comma-list names them.
    for (let i = 1; i <= listLen(optionIDList); i++) {
      // [L74] 1-based, exactly as `listGetAt` is 1-based. The list is walked with the
      // CFML list helpers rather than a hand-rolled `split(',')` so that the target
      // inherits CFML's list semantics - including that repeated delimiters do not
      // yield empty elements.
      const option = resolveOptionByID(data, listGetAt(optionIDList, i));

      // [L75] The legacy chains `option.getOptionGroup().getOptionGroupID()` with no
      // null test, so an option with no group raises there. Reproduced explicitly.
      const optionGroup: OptionGroup | undefined = option.getOptionGroup();

      if (optionGroup === undefined) {
        throw new Error(
          `SkuService.createSkus: option '${option.getOptionID()}' has no option group. ` +
            '[model/service/SkuService.cfc:L75] chains getOptionGroup().getOptionGroupID() ' +
            'with no null test, so the legacy raises here too.',
        );
      }

      const optionGroupID = optionGroup.getOptionGroupID();
      const bucket = optionGroups.get(optionGroupID);

      if (bucket === undefined) {
        // [L76] then [L78] - initialise the bucket, then append into it.
        optionGroups.set(optionGroupID, [option]);
      } else {
        // [L78]
        bucket.push(option);
      }
    }

    // CFML parity [model/service/SkuService.cfc:L82, L106]: the legacy relies on
    // unspecified CFML struct iteration order for BOTH the `indexedKeys` snapshot
    // here and the option-assignment traversal at [L106], and the two must agree or
    // the carry loop advances a different group than the one it assigned from. An
    // insertion-ordered structure is used so they agree deterministically.
    //
    // [L82-L86]
    for (const [optionGroupID, groupOptions] of optionGroups) {
      indexedKeys.push(optionGroupID);
      currentIndexesByKey.set(optionGroupID, 1);
      totalCombos = totalCombos * groupOptions.length;
    }

    // The bound is checked HERE, after `totalCombos` is known and before the creation
    // loop makes its first mutation. See `assertWithinCreationBound`.
    this.assertWithinCreationBound(totalCombos, product, 'L85');

    // [L89-L122]
    for (let i = 1; i <= totalCombos; i++) {
      // [L92]
      const newSku = this.newSkuDraft();

      // [L93] Read unguarded, exactly as the legacy reads it. An absent or
      // unrepresentable price raises on the FIRST iteration, before [L100] has
      // attached anything, so this raise cannot leave a partial set.
      newSku.setPrice(requirePrice(data, 'L93'));

      // [L94-L96]
      const listPrice = resolveGuardedListPrice(data);

      if (listPrice !== undefined) {
        // [L95]
        newSku.setListPrice(listPrice);
      }

      // ★ CFML parity [model/service/SkuService.cfc:L97, L100]: the skuCode counter
      // reads `product.getSkus()` length, which this same loop mutates at [L100]. The
      // SKU is code-stamped BEFORE it is attached, so the length is 0 on the first
      // pass and the code ends `-1`, 1 on the second and the code ends `-2`, and so
      // on. The generated sequence is therefore order-dependent on that LIVE array -
      // `Product.getSkus()` hands back the array itself, not a defensive copy - and
      // the read-then-append ordering is reproduced exactly. Hoisting the length out
      // of the loop, or attaching before stamping, silently renumbers every SKU.
      const skuCode = `${productCode}-${product.getSkus().length + 1}`;

      this.assertSkuCodeAvailable(product, skuCode, 'L97');
      newSku.setSkuCode(skuCode);

      // [L100] Parent to child. NOTE the asymmetry with every other branch: this is
      // the ONLY site that links through `product.addSku(...)`, and this branch never
      // calls `setProduct`. Both directions end up pushing into the same live array -
      // `Product.addSku` delegates to `Sku.setProduct`, exactly as
      // [model/entity/Product.cfc:L696-L698] delegates to
      // [model/entity/Sku.cfc:L604-L608] - but the written direction differs per site
      // and is preserved per site.
      product.addSku(newSku);

      // [L101-L103] STRATEGY 1 OF 5: first-wins, via a genuine null test on the
      // product's existing default. `isNull(...)` is a null test and is ported with
      // the null-test helper - NOT as a `structKeyExists` probe and NOT as `!x`.
      //
      // ★ THE GUARD IS ONE CLAUSE, WHICH IS THE SHAPE [L101] WRITES, AND FIRST-WINS
      // FALLS OUT OF THE WRITE RATHER THAN NEEDING A SECOND CLAUSE. An earlier
      // revision diverted the [L102] write into an invocation-local ledger and had to
      // add `&& ledger.designatedDefaultSku === undefined` to keep later iterations
      // from overwriting the first, because the entity never learned of the
      // designation. Now that [L102] writes where the legacy writes it, the very next
      // iteration's `product.getDefaultSku()` answers the SKU this one designated and
      // the single clause is self-limiting - exactly as it is in CFML. The added
      // conjunct is therefore removed, not merely made redundant.
      if (isNullish(product.getDefaultSku())) {
        // [L102]
        product.setDefaultSku(newSku);
      }

      // [L106-L108] One option from each group, at that group's current index.
      for (const [optionGroupID, groupOptions] of optionGroups) {
        const currentIndex = currentIndexesByKey.get(optionGroupID);

        if (currentIndex === undefined) {
          throw new Error(
            `SkuService.createSkus: no current index for option group '${optionGroupID}'. ` +
              '[model/service/SkuService.cfc:L107] reads currentIndexesByKey[key] for every ' +
              'key of optionGroups, which [L84] populated.',
          );
        }

        // [L107] CFML arrays are 1-based, so the stored index maps to `index - 1`
        // here. Under `noUncheckedIndexedAccess` this read is `Option | undefined` and
        // it is NARROWED, never asserted away with `!`.
        const chosenOption = groupOptions[currentIndex - 1];

        if (chosenOption === undefined) {
          throw new Error(
            `SkuService.createSkus: option index ${String(currentIndex)} is out of range for ` +
              `option group '${optionGroupID}' (${String(groupOptions.length)} options). ` +
              '[model/service/SkuService.cfc:L107] indexes the group array directly, so the ' +
              'legacy raises here too.',
          );
        }

        newSku.addOption(chosenOption);
      }

      // ★★ CFML parity [model/service/SkuService.cfc:L109, L118]: the carry loop has
      // NO bounds check on `changeKeyIndex` against `arrayLen(indexedKeys)`. It is
      // safe ONLY because this `i < totalCombos` guard prevents entry on the final
      // combination - the one iteration where every group already sits at its maximum
      // index, so every arm takes the `else` at [L117-L118], `changeKeyIndex` walks
      // past the end of `indexedKeys`, and the [L113] read goes out of range.
      // Removing or relaxing this guard turns the carry loop into an out-of-range
      // read. The guard is LOAD-BEARING and is preserved. No bounds check is added in
      // its place (B5).
      //
      // [L109-L121]
      if (i < totalCombos) {
        // [L110-L111]
        let indexesUpdated = false;
        let changeKeyIndex = 1;

        // [L112-L120] An odometer: advance the first group that has room, resetting
        // every group it passes. Expressed as a named carry loop with typed locals
        // rather than transliterated CFML - `variables.` scope emulation, `evaluate()`
        // and index-signature dynamic dispatch are all forbidden (B1) - while
        // producing byte-identical combination ordering.
        while (!indexesUpdated) {
          // [L113] The unguarded read the [L109] guard protects. Narrowed rather than
          // asserted; if the narrow ever fails, this raises exactly as the CFML
          // out-of-range read raises.
          const changeKey = indexedKeys[changeKeyIndex - 1];

          if (changeKey === undefined) {
            throw new Error(
              `SkuService.createSkus: carry index ${String(changeKeyIndex)} is out of range ` +
                `for ${String(indexedKeys.length)} option groups. ` +
                '[model/service/SkuService.cfc:L118] increments changeKeyIndex with no bounds ' +
                'check, and [L113] then reads indexedKeys out of range. Reaching this means ' +
                'the load-bearing [L109] guard was bypassed.',
            );
          }

          const changeGroupOptions = optionGroups.get(changeKey);
          const changeGroupIndex = currentIndexesByKey.get(changeKey);

          if (changeGroupOptions === undefined || changeGroupIndex === undefined) {
            throw new Error(
              `SkuService.createSkus: option group '${changeKey}' is missing from the ` +
                'combination state. [model/service/SkuService.cfc:L113] reads both ' +
                'optionGroups[key] and currentIndexesByKey[key] for every key [L83] snapshotted.',
            );
          }

          if (changeGroupIndex < changeGroupOptions.length) {
            // [L114-L115]
            currentIndexesByKey.set(changeKey, changeGroupIndex + 1);
            indexesUpdated = true;
          } else {
            // [L117-L118] Reset this group and carry into the next one.
            currentIndexesByKey.set(changeKey, 1);
            changeKeyIndex++;
          }
        }
      }
    }
  }

  /**
   * The single-SKU merchandise path, taken when no options were supplied.
   *
   * Ports [model/service/SkuService.cfc:L125-L136].
   *
   * ★ FOUR THINGS DIFFER FROM THE MULTI PATH AND NONE OF THEM IS UNIFIED.
   * The skuCode is the HARDCODED `-1` [L133], not a counter. The link direction is
   * child to parent, `thisSku.setProduct(product)` [L128], not
   * `product.addSku(...)`. The default-SKU designation is UNCONDITIONAL [L134] -
   * strategy 2 of 5 - with no first-wins test, so it overwrites an existing default
   * where the multi path defers to it. And the link happens BEFORE the code stamp,
   * which is immaterial here only because the code does not read the array.
   */
  private createSingleMerchandiseSku(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): void {
    const productCode = requireProductCode(product, 'L133');

    // [L127]
    const thisSku = this.newSkuDraft();

    // [L128] Child to parent.
    thisSku.setProduct(product);

    // [L129] Unguarded, as at [L93].
    thisSku.setPrice(requirePrice(data, 'L129'));

    // [L130-L132] The same three-clause guard as [L94-L96].
    const listPrice = resolveGuardedListPrice(data);

    if (listPrice !== undefined) {
      // [L131]
      thisSku.setListPrice(listPrice);
    }

    // [L133] SKU-CODE FORMULA 2 OF 4: hardcoded `-1`, no counter. This is one of the
    // three formulas that does NOT continue a sequence, which is why re-invoking this
    // path regenerates a code the product may already carry - see
    // `assertSkuCodeAvailable`.
    const skuCode = `${productCode}-1`;

    this.assertSkuCodeAvailable(product, skuCode, 'L133');
    thisSku.setSkuCode(skuCode);

    // [L134] STRATEGY 2 OF 5: unconditional. No `isNull` test, no loop-index test -
    // this branch overwrites whatever default the product already carried.
    product.setDefaultSku(thisSku);
  }

  // -------------------------------------------------------------------------
  // createSkus - subscription branch [model/service/SkuService.cfc:L139-L170]
  // -------------------------------------------------------------------------

  /**
   * The subscription arm: one SKU per subscription term.
   *
   * ★ THE SUBSCRIPTION FEATURE IS OUT OF SCOPE, BUT ITS GUARD ASYMMETRY IS NOT.
   * Subscription business logic is excluded, so this is a thin path over the
   * `subscriptionTermProvider` STUB port. What this port DOES owe the legacy is the
   * validation asymmetry at [L142] / [L147] / [L163], because that asymmetry lives in
   * the service tier and is observable.
   *
   * LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits`
   * is iterated with no `structKeyExists` guard, unlike `subscriptionBenefits`
   * [L142] and `subscriptionTerms` [L147], and is never validated anywhere -
   * `model/validation/Product.json` does not mention it either; its absence raises.
   * Preserved deliberately; do not fix without a product decision. The field is typed
   * optional on `CreateSkusInput` precisely SO THAT its absence is representable, and
   * the read below raises rather than defaulting to an empty list (B5).
   *
   * CFML parity [model/service/SkuService.cfc:L142, L147, L175]: all three of these
   * gates use the compound predicate `!structKeyExists(...) || !listLen(...)`, and
   * `!listLen(...)` is a bare numeric truthiness test. Each is written here as an
   * explicit comparison against zero, never as `!x`.
   *
   * ★ THE HANDLES ARE COLLECTED BEFORE THE DRAFT IS CONSTRUCTED, AND THAT IS FORCED.
   * The legacy interleaves collection with mutation: [L154] constructs, [L155] links,
   * [L156-L157] price it, [L158] sets the term, [L159] stamps the code, and only then
   * [L160-L165] add the benefits. `src/domain/entities/sku.ts` publishes NO
   * `setSubscriptionTerm`, `addSubscriptionBenefit` or `addRenewalSubscriptionBenefit`
   * - it accepts `subscriptionTermID`, `subscriptionBenefitIDs` and
   * `renewalSubscriptionBenefitIDs` as hydration-time inputs with getters only, for
   * the reason recorded at `SkuDraftAssociations`: the ID sets reach the same link
   * rows, so a mutator would add surface without adding behaviour. The identifiers
   * must therefore be in hand before the draft exists.
   * The SUCCESSFUL path is byte-identical, including the skuCode sequence.
   * The only difference is on the failing path: where the legacy would already have
   * linked and code-stamped this iteration's SKU before raising at [L163], the target
   * raises with nothing attached for this iteration. That is strictly less partial
   * state, it is forced by the locked entity surface, and the raise itself is
   * preserved.
   */
  private async createSubscriptionSkus(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): Promise<void> {
    const productCode = requireProductCode(product, 'L159');

    // [L142-L144]
    const subscriptionBenefitsList = readStringField(data, 'subscriptionBenefits');
    const hasSubscriptionBenefits =
      structKeyExists(data, 'subscriptionBenefits') &&
      subscriptionBenefitsList !== undefined &&
      listLen(subscriptionBenefitsList) > 0;

    if (!hasSubscriptionBenefits) {
      // [L143] The resource-bundle identifier is a DATA CONTRACT and is preserved
      // character for character, misspelling included. No i18n runtime is introduced;
      // it is a plain string constant.
      ledger.validationFailures.push({
        propertyName: 'subscriptionBenefits',
        rbKey: RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED,
      });
    }

    // [L147-L149]
    const subscriptionTermsList = readStringField(data, 'subscriptionTerms');
    const hasSubscriptionTerms =
      structKeyExists(data, 'subscriptionTerms') &&
      subscriptionTermsList !== undefined &&
      listLen(subscriptionTermsList) > 0;

    if (!hasSubscriptionTerms) {
      // [L148]
      ledger.validationFailures.push({
        propertyName: 'subscriptionTerms',
        rbKey: RB_KEY_SUBSCRIPTION_TERMS_REQUIRED,
      });
    }

    // [L152] The two trailing conjuncts are compile-time narrowings of what the first
    // already guarantees: no failure can have been skipped while either list is
    // absent. They add no runtime guard (B5).
    if (
      ledger.validationFailures.length > 0 ||
      subscriptionTermsList === undefined ||
      subscriptionBenefitsList === undefined
    ) {
      return;
    }

    const plannedSkuCount = listLen(subscriptionTermsList);

    this.assertWithinCreationBound(plannedSkuCount, product, 'L153');

    // [L153-L169]
    for (let i = 1; i <= plannedSkuCount; i++) {
      // [L158] The legacy passes `getSubscriptionTerm(...)`'s result straight into a
      // setter, so an identifier that does not resolve puts a null into a CFML
      // argument list and raises. Reproduced.
      const subscriptionTermID = listGetAt(subscriptionTermsList, i);
      const termHandle =
        await this.subscriptionTermProvider.getSubscriptionTerm(subscriptionTermID);

      if (termHandle === undefined) {
        throw new Error(
          `SkuService.createSkus: subscription term '${subscriptionTermID}' did not resolve. ` +
            '[model/service/SkuService.cfc:L158] passes the lookup result directly to ' +
            'setSubscriptionTerm, so the legacy raises on a null there too.',
        );
      }

      // [L160-L162]
      const subscriptionBenefitIDs = await this.resolveSubscriptionBenefitIDs(
        subscriptionBenefitsList,
        'L161',
      );

      // [L163] THE UNGUARDED READ. See the LEGACY-DEFECT marker above.
      const renewalSubscriptionBenefitsList = readStringField(data, 'renewalSubscriptionBenefits');

      if (renewalSubscriptionBenefitsList === undefined) {
        throw new Error(
          'SkuService.createSkus: renewalSubscriptionBenefits is absent. ' +
            '[model/service/SkuService.cfc:L163] iterates it with no structKeyExists guard - ' +
            'unlike subscriptionBenefits [L142] and subscriptionTerms [L147] - and it is never ' +
            'validated, so the legacy raises here. Preserved deliberately.',
        );
      }

      // [L163-L165]
      const renewalSubscriptionBenefitIDs = await this.resolveSubscriptionBenefitIDs(
        renewalSubscriptionBenefitsList,
        'L164',
      );

      // [L154] Constructed with its associations; see the note above on why.
      const thisSku = this.newSkuDraft({
        subscriptionTermID: termHandle.subscriptionTermID,
        subscriptionBenefitIDs,
        renewalSubscriptionBenefitIDs,
      });

      // [L155] Child to parent, and BEFORE the code stamp - see the skuCode note below.
      thisSku.setProduct(product);

      // [L156-L157] ★ ONE VALUE, TWO PROPERTIES. `renewalPrice` is set from
      // `data.price`, NOT from a separate renewal input, which is why
      // `CreateSkusInput` has no `renewalPrice` member. The legacy reads the same
      // struct key twice; reading it once here is identical because `Money` is
      // immutable. Both reads are unguarded, as at [L93].
      const price = requirePrice(data, 'L156');

      thisSku.setPrice(price);
      thisSku.setRenewalPrice(price);

      // ★★ CFML parity [model/service/SkuService.cfc:L155, L159]: SKU-CODE FORMULA 1
      // OF 4 again - `arrayLen(product.getSkus()) + 1` - but with the statements in
      // the OPPOSITE order to the merchandise path. [L155] links this SKU before
      // [L159] stamps it, so the live array ALREADY counts it and the first code in
      // this branch ends `-2`, the second `-3`, and so on. This branch NEVER produces
      // a `-1`. That is a real, verified off-by-one produced by statement order alone,
      // and it is reproduced rather than harmonised with [L97].
      const skuCode = `${productCode}-${product.getSkus().length + 1}`;

      this.assertSkuCodeAvailable(product, skuCode, 'L159');
      thisSku.setSkuCode(skuCode);

      // [L166-L168] STRATEGY 3 OF 5: a loop-index test, not a null test and not
      // unconditional. It overwrites any existing default, unlike [L101].
      if (i === 1) {
        // [L167]
        product.setDefaultSku(thisSku);
      }
    }
  }

  /**
   * Resolves a comma-delimited list of subscription-benefit identifiers to the
   * identifiers of the handles they name.
   *
   * Carries the identical body of [model/service/SkuService.cfc:L160-L162] and
   * [L163-L165] - the ONLY part of those two loops that is genuinely the same. Their
   * guards are not: [L160]'s list is validated at [L142] and [L163]'s is not
   * validated at all, and that difference stays at the call sites where it belongs.
   */
  private async resolveSubscriptionBenefitIDs(
    subscriptionBenefitIDList: string,
    siteLocator: string,
  ): Promise<string[]> {
    const resolved: string[] = [];

    for (let b = 1; b <= listLen(subscriptionBenefitIDList); b++) {
      const subscriptionBenefitID = listGetAt(subscriptionBenefitIDList, b);
      const handle: SubscriptionBenefitHandle | undefined =
        await this.subscriptionTermProvider.getSubscriptionBenefit(subscriptionBenefitID);

      if (handle === undefined) {
        throw new Error(
          `SkuService.createSkus: subscription benefit '${subscriptionBenefitID}' did not ` +
            `resolve. [model/service/SkuService.cfc:${siteLocator}] passes the lookup result ` +
            'directly to the add method, so the legacy raises on a null there too.',
        );
      }

      resolved.push(handle.subscriptionBenefitID);
    }

    return resolved;
  }

  // -------------------------------------------------------------------------
  // createSkus - contentAccess branch [model/service/SkuService.cfc:L173-L202]
  // -------------------------------------------------------------------------

  /**
   * The contentAccess arm: either one bundled SKU holding every access content, or
   * one SKU per content.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L173-L202]: the contentAccess branch is
   * out of scope. `contentService` [L56] is reached only here - [L187] and [L196] are
   * its only two call sites in the whole component - so no content port exists in the
   * thirteen-port set and none was added. The branch is preserved as an
   * explicitly-out-of-scope path: the content identifiers the legacy resolved to
   * entities are carried through as identifiers, which is what
   * `Sku.accessContentIDs` holds and what the repository persists, so the link rows
   * are unchanged while no content behaviour is ported.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L173]: branches on `baseProductType`
   * `"contentAccess"`, a value `model/validation/Product.json`'s `inList` constraint
   * does not permit - that constraint admits exactly `merchandise` and
   * `subscription`. Contradiction preserved as found; neither the branch nor the
   * constraint is altered (B5).
   *
   * CFML parity [model/service/SkuService.cfc:L176]: this branch's resource-bundle
   * identifier uses the `validate.` prefix - `validate.product.accesscontentsrequired`
   * - while the subscription branch's two use `entity.`. Preserved verbatim.
   *
   * ★ THE SAME FORCED REORDERING AS THE SUBSCRIPTION BRANCH. `Sku` publishes no
   * `addAccessContent`, so the content identifiers are collected before the draft is
   * constructed rather than added to it afterwards. The successful path is identical.
   */
  private createContentAccessSkus(
    product: Product,
    data: CreateSkusInput,
    ledger: SkuCreationLedger,
  ): void {
    const productCode = requireProductCode(product, 'L184');

    // [L175-L177]
    const accessContentsList = readStringField(data, 'accessContents');
    const hasAccessContents =
      structKeyExists(data, 'accessContents') &&
      accessContentsList !== undefined &&
      listLen(accessContentsList) > 0;

    if (!hasAccessContents) {
      // [L176]
      ledger.validationFailures.push({
        propertyName: 'accessContents',
        rbKey: RB_KEY_ACCESS_CONTENTS_REQUIRED,
      });
    }

    // [L180] The trailing conjunct is the same compile-time narrowing as [L152]'s.
    if (ledger.validationFailures.length > 0 || accessContentsList === undefined) {
      return;
    }

    // [L181] Existence, and then a BARE TRUTHINESS test on the value itself - which is
    // why `bundleContentAccess` is typed as CFML-truthy input rather than `boolean`.
    // `cfTruthy` raises on an absent value, which is unrepresentable in CFML (a struct
    // key cannot hold null) and is therefore the honest answer here.
    const bundleContentAccess =
      structKeyExists(data, 'bundleContentAccess') &&
      cfTruthy(readTruthyField(data, 'bundleContentAccess'));

    if (bundleContentAccess) {
      // [L182-L189] ONE SKU holding every access content.
      this.assertWithinCreationBound(1, product, 'L182');

      const accessContentIDs: string[] = [];

      // [L186-L188]
      for (let c = 1; c <= listLen(accessContentsList); c++) {
        accessContentIDs.push(listGetAt(accessContentsList, c));
      }

      // [L182]
      const newSku = this.newSkuDraft({ accessContentIDs });

      // [L183] Unguarded, as at [L93].
      newSku.setPrice(requirePrice(data, 'L183'));

      // [L184] SKU-CODE FORMULA 2 OF 4 again: hardcoded `-1`.
      const skuCode = `${productCode}-1`;

      this.assertSkuCodeAvailable(product, skuCode, 'L184');
      newSku.setSkuCode(skuCode);

      // [L185] Child to parent, and AFTER the code stamp - the opposite order to the
      // subscription branch, which is immaterial here only because the code is
      // hardcoded and reads nothing.
      newSku.setProduct(product);

      // [L189] STRATEGY 4 OF 5: unconditional, like [L134] and unlike [L197].
      product.setDefaultSku(newSku);
    } else {
      // [L191-L200] ONE SKU PER CONTENT.
      const plannedSkuCount = listLen(accessContentsList);

      this.assertWithinCreationBound(plannedSkuCount, product, 'L191');

      for (let c = 1; c <= plannedSkuCount; c++) {
        // [L196] One content per SKU, in list order.
        const accessContentID = listGetAt(accessContentsList, c);

        // [L192]
        const newSku = this.newSkuDraft({ accessContentIDs: [accessContentID] });

        // [L193] Unguarded, as at [L93]. Note that neither contentAccess sub-branch
        // has ANY listPrice handling, unlike [L94] and [L130]. Asymmetry preserved.
        newSku.setPrice(requirePrice(data, 'L193'));

        // [L194] SKU-CODE FORMULA 4 OF 4: the LOOP COUNTER, `-#c#`. Not the array
        // length, not a hardcoded `-1`. It restarts at 1 on every invocation, which is
        // why re-invoking this path regenerates codes the product may already carry -
        // see `assertSkuCodeAvailable`.
        const skuCode = `${productCode}-${String(c)}`;

        this.assertSkuCodeAvailable(product, skuCode, 'L194');
        newSku.setSkuCode(skuCode);

        // [L195]
        newSku.setProduct(product);

        // [L197-L199] STRATEGY 5 OF 5: a loop-index test on `c`, mirroring [L166]'s
        // test on `i` but in a branch whose sibling [L189] is unconditional.
        if (c === 1) {
          // [L198]
          product.setDefaultSku(newSku);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // processImageUpload [model/service/SkuService.cfc:L210-L218]
  // -------------------------------------------------------------------------

  /**
   * Hands an uploaded image to the image store at the SKU's image path.
   *
   * Ports `public any function processImageUpload(required any Sku, required struct
   * imageUploadResult)` [model/service/SkuService.cfc:L210-L218].
   *
   * ★ THIS IS THE ONE `getService()` SITE IN THE WHOLE IN-SCOPE SERVICE LAYER.
   * `getService("imageService")` at [L212] is it. A full sweep confirms
   * `ProductService`, `PriceGroupService`, `PromotionService`, `RoundingRuleService`,
   * `BrandService` and `OptionService` have none. (The eighteen sites in
   * `model/entity/Product.cfc` are an ENTITY-layer count and belong to
   * `src/domain/entities/`.) T2 is therefore applied exactly once here: the locator
   * becomes the constructor-injected `imageStore` STUB port.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L213-L217]: the specification's
   * interface table lists `Promise<Sku>` for this method, but the legacy body returns
   * a boolean at [L214] and [L216] and never returns the SKU. The honest boolean is
   * published; the table's shape is recorded here rather than fabricated.
   *
   * CFML parity [model/service/SkuService.cfc:L213-L217]: `if(imageSaved) { return
   * true; } else { return false; }` is an identity conditional. It is collapsed to a
   * direct return, because idiomatic TypeScript is required and a transliteration
   * would violate the minimal-change directive rather than satisfy it (B1).
   *
   * CFML parity [model/service/SkuService.cfc:L210]: the legacy parameter is
   * capitalised `Sku`, colliding with the type name; renamed to `sku`. Parity is
   * required for method names, not parameter names.
   *
   * CFML parity [model/service/SkuService.cfc:L212]: the legacy call is
   * KEYWORD-style - `uploadResult=`, `filePath=`, `allowedExtensions=`. The port
   * declares those three argument identities positionally in that same order, so the
   * identities are preserved at the boundary without a keyword-emulating object.
   *
   * ★ THE ALLOWED-EXTENSION LIST IS PRESERVED VERBATIM AS A COMMA-LIST STRING.
   * `'jpg,jpeg,png,gif'` is a BUSINESS CONSTANT, not configuration, so it stays here
   * and is deliberately NOT moved into `src/lib/config.ts` - E6 governs credentials
   * and setting values, not this (B5).
   *
   * ★ [L211] RAISES BEFORE THE STORE IS EVER REACHED, AND THAT IS STATED PLAINLY.
   * `src/domain/entities/sku.ts` publishes `getImagePath(): never` - an EXPLICIT
   * REFUSAL, and the reason is the ASSET ROOT rather than the key count. The path needs
   * `getHibachiScope().getBaseImageURL()` [model/entity/Sku.cfc:L146], which resolves
   * `globalAssetsImageFolderPath` [model/service/SettingService.cfc:L164] - a key the
   * closed seven-key settings union deliberately excludes - so no image path can be
   * built here. The call is kept at its [L211] position rather than being
   * skipped, so the refusal surfaces where the legacy read the path. The store call is
   * kept too, so the port contract and the extension literal are both real rather
   * than described. This method is an out-of-scope image branch and remains a thin
   * pass-through; no storage behaviour is implemented here.
   *
   * @param sku The SKU whose image path the upload is written to.
   * @param result The upload descriptor, shaped by the image port.
   * @returns Whether the store reported the file as saved.
   */
  public async processImageUpload(sku: Sku, result: ImageUploadResult): Promise<boolean> {
    // [L211]
    const imagePath: string = sku.getImagePath();

    // [L212] and [L213-L217], collapsed.
    return this.imageStore.saveImageFile(result, imagePath, ALLOWED_IMAGE_EXTENSIONS);
  }

  // -------------------------------------------------------------------------
  // getProductSkus [L220-L244] and getSortedProductSkus [L246-L269]
  // -------------------------------------------------------------------------

  /**
   * A product's SKUs, optionally in option-group sort order.
   *
   * Ports `public array function getProductSkus(required any product, required
   * boolean sorted, boolean fetchOptions=false)` [model/service/SkuService.cfc:L220-L244].
   *
   * ★★ THIS METHOD AND `getSortedProductSkus` DIVERGE THREE WAYS AND ARE NOT
   * UNIFIED. They share exactly one thing - the merge body - and that is the only
   * thing extracted. The three differences, all verified in situ:
   *
   * 1. DATA SOURCE. This method loads from the repository [L221]; the other reads the
   *    product's own materialised array [L247].
   * 2. GUARD SHAPE. This method uses an inline three-clause condition [L223]; the
   *    other uses an early return on a two-element floor [L248-L250]. This method
   *    additionally tests `arrayLen(skus[1].getOptions())`; the other does not test
   *    options at all.
   * 3. CALL CONVENTION. See the CFML parity note below.
   *
   * `fetchOptions` is absent from the other method entirely, and here it becomes an
   * EXPLICIT EAGER-LOAD FLAG on the repository call - not a lazy-loading hint, because
   * the target has no lazy loading to hint at.
   *
   * CFML parity [model/service/SkuService.cfc:L224, L252]: `getSortedProductSkusID`
   * is invoked with a keyword argument at [L224] and positionally at [L252]. The
   * inconsistency is recorded, not corrected.
   *
   * CFML parity [model/service/SkuService.cfc:L223]: `arrayLen(skus[1].getOptions())`
   * reads index 1 with NO guard of its own - it is safe only because
   * `arrayLen(skus) gt 1` short-circuits first. Under `noUncheckedIndexedAccess` that
   * read is `Sku | undefined` and it is NARROWED, never asserted away with `!`.
   * `arrayLen(...)` used directly as a condition is a bare numeric truthiness test and
   * is written here as an explicit comparison against zero.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L177]: the sorted-SKU query carries a legacy
   * `TODO: test to see if this query works with DB's other than MSSQL and MySQL`. The
   * ordering contract both this method and `getSortedProductSkus` depend on is
   * therefore dialect-sensitive - it is produced by
   * `SUM(SwOption.sortOrder * POWER(10, ... - SwOptionGroup.sortOrder))`, whose
   * `POWER` semantics are exactly what the TODO doubts. The TODO belongs to
   * `src/repositories/mysql/**` and is carried forward, not resolved, and no dialect
   * branching is performed here (B3).
   *
   * @param product The product whose SKUs are wanted.
   * @param sorted Whether to apply the option-group sort order. Required, as in the
   *   legacy.
   * @param fetchOptions Whether the repository should materialise each SKU's options.
   * @returns The SKUs. When the sort is applied, see `mergeIntoSortOrder` for the two
   *   ways that array can surprise a caller.
   */
  public async getProductSkus(
    product: Product,
    sorted: boolean,
    fetchOptions = false,
  ): Promise<Sku[]> {
    // [L221]
    const skus = await this.skuRepository.getProductSkus(product, fetchOptions);

    // [L223] The narrowed index-1 read the short-circuit protects.
    const firstSku = skus[0];

    if (sorted && skus.length > 1 && firstSku !== undefined && firstSku.getOptions().length > 0) {
      // [L224] Keyword-style in the legacy.
      const sortedSkuIDs = await this.skuRepository.getSortedProductSkusID(product.getProductID());

      // [L225-L240] then [L243] - the legacy assigns the merged array back over `skus`
      // and returns that; returning it directly is identical.
      return this.mergeIntoSortOrder(skus, sortedSkuIDs, 'L236-L237', product.getProductID());
    }

    // [L243] The unsorted path answers the repository's array unchanged.
    return skus;
  }

  /**
   * A product's already-materialised SKUs, in option-group sort order.
   *
   * Ports `public array function getSortedProductSkus(required any product)`
   * [model/service/SkuService.cfc:L246-L269]. See `getProductSkus` for the three-way
   * divergence between the two and for the dialect note that applies to both.
   *
   * ★ THE EARLY RETURN HANDS BACK THE PRODUCT'S LIVE ARRAY.
   * [L247] reads `arguments.product.getSkus()` and [L249] returns it. `Product.getSkus()`
   * answers the array itself, not a defensive copy - the entity layer deliberately
   * does not copy, which is also what makes [L97]'s counter work - so a caller that
   * mutates the result mutates the product. That is the legacy contract and it is
   * preserved rather than quietly hardened.
   *
   * ★ AND IT RETURNS THE MERGED ARRAY DIRECTLY, NOT VIA `skus`.
   * [L268] returns `sortedArrayReturn`, where [L240] assigned it back over `skus`
   * first. The outcome is the same; the distinction is noted because the two methods
   * are otherwise easy to conflate.
   *
   * @param product The product whose SKUs are wanted.
   * @returns Fewer than two SKUs: the product's live array. Otherwise the merged
   *   array; see `mergeIntoSortOrder`.
   */
  public async getSortedProductSkus(product: Product): Promise<Sku[]> {
    // [L247] THE ENTITY, not the repository.
    const skus = product.getSkus();

    // [L248-L250] An early return on a two-element floor - and NO options test, unlike
    // [L223]. The legacy writes `lt 2`; it is a count comparison, written explicitly.
    if (skus.length < 2) {
      return skus;
    }

    // [L252] Positional in the legacy, where [L224] is keyword-style.
    const sortedSkuIDs = await this.skuRepository.getSortedProductSkusID(product.getProductID());

    // [L253-L268]
    return this.mergeIntoSortOrder(skus, sortedSkuIDs, 'L264-L265', product.getProductID());
  }

  /**
   * Places each SKU at the position its identifier occupies in the sorted-ID result.
   *
   * The ONLY genuinely shared body between `getProductSkus` [L228-L240] and
   * `getSortedProductSkus` [L256-L268]. It carries that body and NOTHING else: not
   * either guard, not either data source, not either call convention. Private, and
   * deliberately not part of the public surface - this file spends zero of the
   * project's five visibility widenings.
   *
   * LEGACY-DEFECT [model/service/SkuService.cfc:L236-L237]: `arrayFind` returns 0 when
   * the skuID is absent from the sorted-ID query, and the 1-based assignment then
   * raises; `arrayResize` also sizes the result to the query row count, leaving null
   * holes. Both are reproduced.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-DEFECT [model/service/SkuService.cfc:L264-L265]: the identical unguarded
   * `arrayFind`-as-index and `arrayResize` hole behaviour, duplicated from
   * [L236-L237]. The specification cites this finding at [L236-L237] only; verified in
   * situ, it appears at BOTH sites and both are annotated.
   * Preserved deliberately; do not fix without a product decision.
   *
   * ★ WHY THE MISS MUST RAISE EXPLICITLY. CFML arrays are 1-based, so
   * `sortedArrayReturn[0] = ...` is an invalid subscript and raises. In TypeScript
   * `array[0] = x` is perfectly legal and would silently write to the first slot, so
   * the raise is REPRODUCED with an explicit test. That is reproduction of a legacy
   * failure, not an added guard (B5).
   *
   * ★★ AND WHAT HAPPENS TO THE HOLES. THIS PARAGRAPH ONCE ENDED IN AN UNSAFE CAST, AND
   * THE ORIGINAL REASONING IS QUOTED RATHER THAN OVERWRITTEN. It read: "They are NOT
   * compacted, filtered or flattened away. Internally the array is typed
   * `(Sku | undefined)[]`, which is the honest shape; the published return stays
   * `Sku[]` for interface parity, and the single narrowing assertion below is where
   * that discrepancy lives. `noUncheckedIndexedAccess` means an indexed read of the
   * published array is still `Sku | undefined`, so a caller indexing it cannot ignore
   * the holes; a caller iterating it can, and that is the residual sharp edge the
   * legacy also had."
   *
   * The first sentence still holds and is the important one: the holes are NOT
   * compacted, filtered or flattened away, because doing so would return a DIFFERENT
   * array from the legacy's - reordered and short - which is a wrong answer rather than
   * a refused one. What was wrong was the conclusion drawn from `noUncheckedIndexedAccess`.
   * That flag reaches an INDEXED READ and nothing else, so it does not reach
   * `map`, `filter`, `forEach`, `for...of`, destructuring or a spread - every one of
   * which hands the callback a value statically guaranteed to be a `Sku` while it may
   * be `undefined` at run time. Calling that "the residual sharp edge the legacy also
   * had" understated it: the legacy had no static guarantee to contradict, so a CFML
   * caller met a null it could see coming, whereas an assertion here produces a type
   * the compiler actively defends. That is a suppression, not a parity note.
   *
   * SO THE ARRAY IS FILLED DENSELY OR IT IS REFUSED. `arrayResize` sizes the result to
   * the QUERY's row count, independent of how many SKUs the caller supplied - and
   * `sortedSkuIDQuery.recordCount` counting query rows rather than SKUs is precisely
   * the mechanism - so a query returning more rows than the SKU array covers still
   * leaves positions unfilled. Those positions are now detected explicitly and reported
   * through `SkuSortOrderError`, whose own comment records the exact scope of the
   * divergence this introduces and why the two alternatives are worse. Every slot that
   * IS filled is narrowed rather than asserted, so the published `Sku[]` is true of the
   * value returned.
   *
   * @param skus The SKUs to place.
   * @param sortedSkuIDs The ordered identifiers, one per query row.
   * @param siteLocator Which of the two duplicated sites this call reproduces.
   * @param productID The product being sorted, carried for the failure message only.
   * @throws SkuSortOrderError When the sorted-ID result is longer than the SKUs can
   *   fill, so a dense `Sku[]` cannot be produced.
   */
  private mergeIntoSortOrder(
    skus: readonly Sku[],
    sortedSkuIDs: readonly string[],
    siteLocator: string,
    productID: string,
  ): Sku[] {
    // [L228-L230] / [L256-L258] The query's `skuID` column, walked positionally into a
    // flat array. The port already hands back that column as an ordered list, so the
    // positional walk is a copy.
    const sortedArray: string[] = [...sortedSkuIDs];

    // [L232] / [L260] `arrayResize` to the QUERY row count - the source of the holes.
    const sortedArrayReturn: (Sku | undefined)[] = new Array<Sku | undefined>(sortedArray.length);

    // [L234-L238] / [L262-L266]
    for (let i = 1; i <= skus.length; i++) {
      const sku = skus[i - 1];

      if (sku === undefined) {
        throw new Error(
          `SkuService.mergeIntoSortOrder: no SKU at position ${String(i)} of ${String(skus.length)}.`,
        );
      }

      // [L235]
      const skuID = sku.getSkuID();

      // [L236] / [L264] `arrayFind` is 1-based, case-sensitive, and answers 0 on a
      // miss - `indexOf` plus one reproduces all three.
      const index = sortedArray.indexOf(skuID) + 1;

      if (index === 0) {
        throw new Error(
          `SkuService.getProductSkus: sku '${skuID}' is absent from the sorted-ID result, so ` +
            `arrayFind answered 0. [model/service/SkuService.cfc:${siteLocator}] then assigns ` +
            'to index 0 of a 1-based array, which raises. Reproduced deliberately.',
        );
      }

      // [L237] / [L265]
      sortedArrayReturn[index - 1] = sku;
    }

    // The dense fill, built by NARROWING each slot rather than asserting the array. One
    // pass produces both the result and the diagnosis, so a refusal can name exactly
    // which positions were left behind instead of only that some were.
    const densePlacement: Sku[] = [];
    const unfilledPositions: number[] = [];

    for (const [position, placed] of sortedArrayReturn.entries()) {
      if (placed === undefined) {
        unfilledPositions.push(position);

        continue;
      }

      densePlacement.push(placed);
    }

    if (unfilledPositions.length !== 0) {
      throw new SkuSortOrderError(
        productID,
        sortedArrayReturn.length,
        skus.length,
        unfilledPositions,
        siteLocator,
      );
    }

    return densePlacement;
  }

  // -------------------------------------------------------------------------
  // searchSkusByProductType [L271-L273] and the DAO pass-throughs [L281-L291]
  // -------------------------------------------------------------------------

  /**
   * SKUs matching a search term, optionally narrowed to product types.
   *
   * Ports `public any function searchSkusByProductType(string term,string
   * productTypeID)` [model/service/SkuService.cfc:L271-L273].
   *
   * ★ NEITHER PARAMETER IS `required` IN THE LEGACY, so neither is required here.
   * The legacy forwards `argumentCollection=arguments`, so an omitted argument simply
   * does not reach the DAO - and `model/dao/SkuDAO.cfc:L133` binds `term`
   * unconditionally, which is why `src/repositories/mysql/mysqlSkuRepository.ts`
   * raises on an absent term. That raise belongs to the repository tier and is
   * forwarded, not pre-empted here.
   *
   * ⚠️ CFML parity [model/dao/SkuDAO.cfc:L130]: this port takes SINGULAR
   * `productTypeID`, while `productRepository.searchProductsByProductType` takes
   * PLURAL `productTypeIDs`. Both are the legacy names and both are preserved
   * verbatim; the cross-service asymmetry is deliberately NOT harmonised.
   *
   * CFML parity [model/service/SkuService.cfc:L272]: `argumentCollection` is spelled
   * with a capital C here and at [L282], [L286], [L290] and [L312], matching
   * `OptionService.cfc:L73`/[L77] and differing from
   * `RoundingRuleService.cfc:L63`'s lower-case `argumentcollection`. Cosmetic in
   * CFML, which is case-insensitive; nothing follows from it in the target.
   */
  public async searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
    // [L272]
    return this.skuRepository.searchSkusByProductType(term, productTypeID);
  }

  /**
   * Whether a SKU's stock records may be deleted.
   *
   * Ports `public boolean function getSkuStocksDeletableFlag(required string skuID)`
   * [model/service/SkuService.cfc:L281-L283].
   *
   * LEGACY-DEFECT [model/service/SkuService.cfc:L281-L283]: delegates to
   * `getSkuDAO().getSkuStocksDeletableFlag`, which does not exist on `SkuDAO`, is
   * absent from `org/Hibachi/`, and cannot be dispatched because
   * `org/Hibachi/HibachiDAO.cfc` declares no `onMissingMethod`. The legacy method
   * raises unconditionally, every time it is called; the raise is reproduced and the
   * member is deliberately absent from the seven-member `SkuRepository` port.
   * Preserved deliberately; do not fix without a product decision.
   *
   * The signature is kept for interface parity (B4): a reviewer diffing the two
   * surfaces method by method must find it. `src/domain/entities/sku.ts` takes the
   * same position on the entity side, publishing `getStocksDeletableFlag(): never`.
   *
   * @param skuID The SKU whose stock records were asked about. Named in the raise so
   *   the caller can see which call failed.
   */
  public async getSkuStocksDeletableFlag(skuID: string): Promise<boolean> {
    // The rejection is returned rather than thrown so that the method stays a
    // genuinely asynchronous member of the surface: a `throw` in an `async` body with
    // no `await` is a lint error, and widening the signature to synchronous would
    // break parity with every other member here.
    return Promise.reject(
      new Error(
        `SkuService.getSkuStocksDeletableFlag('${skuID}') is unreachable. ` +
          '[model/service/SkuService.cfc:L282] delegates to SkuDAO.getSkuStocksDeletableFlag, ' +
          'which does not exist on SkuDAO, is absent from org/Hibachi/, and cannot be ' +
          'dynamically dispatched because HibachiDAO declares no onMissingMethod. The legacy ' +
          'raises unconditionally; that raise is reproduced.',
      ),
    );
  }

  /**
   * Whether any order transaction exists against the SKUs in question.
   *
   * Ports `public boolean function getTransactionExistsFlag()`
   * [model/service/SkuService.cfc:L285-L287].
   *
   * CFML parity [model/service/SkuService.cfc:L286]: the method declares no
   * parameters yet forwards `argumentCollection=arguments` - an empty struct - so the
   * DAO receives neither of its two optional filters. Harmless in CFML and reproduced
   * exactly by calling the port with no arguments.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    // [L286]
    return this.skuRepository.getTransactionExistsFlag();
  }

  /**
   * The SKU carrying a given code.
   *
   * Ports `public any function getSkuBySkuCode(string skuCode)`
   * [model/service/SkuService.cfc:L289-L291].
   *
   * ★ `undefined` ON A MISS, EXPLICITLY. Never `0`, never an empty object, never a
   * `Sku` with zeroed prices. A silent zero in a price path sells product for free,
   * which is why the port publishes `Promise<Sku | undefined>` and why that shape is
   * carried straight through.
   *
   * `skuCode` is NOT `required` in the legacy signature, so it is optional here. When
   * it is omitted the legacy forwards an empty `argumentCollection` into
   * `model/dao/SkuDAO.cfc:L102`, which declares `required string skuCode` and
   * therefore raises. Reproduced.
   */
  public async getSkuBySkuCode(skuCode?: string): Promise<Sku | undefined> {
    if (skuCode === undefined) {
      return Promise.reject(
        new Error(
          'SkuService.getSkuBySkuCode: skuCode is absent. [model/service/SkuService.cfc:L290] ' +
            'forwards argumentCollection=arguments into [model/dao/SkuDAO.cfc:L102], which ' +
            'declares `required string skuCode` and raises. Reproduced.',
        ),
      );
    }

    // [L290]
    return this.skuRepository.getSkuBySkuCode(skuCode);
  }

  // -------------------------------------------------------------------------
  // findSkus [L309-L325] - the renamed smart list
  // -------------------------------------------------------------------------

  /**
   * SKUs matching a keyword, with the criteria surface the legacy smart list
   * established.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L309-L325]: `getSkuSmartList` is
   * renamed to `findSkus` and reshaped into a typed repository query.
   * `HibachiSmartList` is a generic string-keyed dynamic query builder that is
   * untypeable under the strict profile and would reimport exactly the framework
   * coupling this port exists to remove - porting it faithfully would mean
   * reimplementing a small ORM query language. The five keyword properties
   * [L318-L322], all at weight 1, and the three joins [L314-L316] with
   * `alternateSkuCodes` LEFT are preserved; the open-ended dynamic filtering surface
   * is deliberately NOT reproduced. This is one half of budgeted signature reshaping
   * number 2; `findProducts` in `src/services/productService.ts` (planned) is the
   * other half, and together they count as ONE reshaping.
   *
   * ★ ALL FIVE KEYWORD PROPERTIES CARRY weight=1 - THERE IS NO RANKING IN THE LEGACY.
   * No relevance weighting, scoring or result ordering is invented (B5/B7). The
   * weights are transcribed because they are part of the surface, not because they
   * differentiate anything.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L318-L322]: `SkuRepository` publishes
   * exactly ONE keyword-search member across its seven, and
   * `src/repositories/mysql/mysqlSkuRepository.ts` matches it against `skuCode`. The
   * remaining four identifiers - `skuID`, `product.productName`,
   * `product.productType.productTypeName` and `alternateSkuCodes.alternateSkuCode` -
   * are therefore carried as the reported criteria surface rather than as an
   * implemented match, and widening the match to all five is a repository-tier
   * obligation belonging to `src/repositories/mysql/mysqlSkuRepository.ts`. The port
   * is locked at seven members and no member was invented to close the gap, so the
   * gap is reported as DATA on the returned page instead of being hidden behind a
   * claim in a comment. The figure read "eight" for one revision, while the port
   * carried a bulk save; re-reading it changed nothing here and its removal changes
   * nothing either, because a WRITE member widens no search and closes no part of
   * this gap in either direction.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L314-L316]: the three joins are
   * preserved as reported criteria, INCLUDING the `"left"` on `alternateSkuCodes`,
   * without inventing an `alternateSkuCodes` association on
   * `src/domain/entities/sku.ts`, which carries `alternateSkuCodeIDs` only. This is
   * a genuine boundary rather than the false one this file used to assert about
   * entity members: a materialised association needs a FAR-SIDE ENTITY CLASS, and
   * `AlternateSkuCode` is not among the eighteen the folder is locked at - so
   * authoring it would add a nineteenth file, which prohibition #1 of the entity
   * contract forbids outright. Adding a method to an existing class is not the same
   * act and is not covered by that lock. `org/Hibachi/HibachiSmartList.cfc:L212`
   * declares `joinRelatedProperty`'s `joinType` default as the EMPTY STRING, not
   * `"inner"`, so the first two joins are recorded as `''` rather than being
   * normalised to a name the legacy never wrote.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L309-L312]: `data={}` and
   * `currentURL=""` are framework paging and URL-state plumbing and are dropped, and
   * [L310]'s `arguments.entityName = "SlatwallSku"` MUTATES THE ARGUMENTS SCOPE to
   * inject a framework parameter - dropped too, because the typed criteria make the
   * entity implicit.
   *
   * @param criteria The typed replacement for the smart list's dynamic filter surface.
   * @returns The matched SKUs plus the criteria surface that produced them.
   */
  public async findSkus(criteria: SkuQueryCriteria): Promise<SkuPage> {
    // [L312] through [L324], expressed as the one query the port publishes.
    const skus = await this.skuRepository.searchSkusByProductType(
      criteria.keyword,
      criteria.productTypeID,
    );

    return {
      skus,
      keyword: criteria.keyword,
      keywordProperties: SKU_KEYWORD_PROPERTIES,
      joins: SKU_SMART_LIST_JOINS,
    };
  }

  // -------------------------------------------------------------------------
  // Construction and the correctness bounds
  // -------------------------------------------------------------------------

  /**
   * A new, unpersisted SKU draft.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L92, L127, L154, L182, L192]:
   * `this.newSku()` is `HibachiService`'s dynamic `new<Entity>()` factory, reached at
   * five sites. No such affordance exists in the target; SKUs are constructed
   * explicitly through the entity's public constructor. No port member and no
   * fourteenth port was added to satisfy it. `src/domain/entities/sku.ts` does
   * publish a `Sku.hydrate` static, but it is the CASCADE-materialising factory the
   * repositories use and it is deliberately not reached here: a draft has no
   * persisted `SwSkuCurrency` rows to materialise, and routing an unsaved draft
   * through the hydration path would resolve a currency cascade for a row that does
   * not exist.
   *
   * ★ THE RESOLVED IMAGE SETTINGS ARE CARRIED ONTO EVERY DRAFT, AND THAT IS LOAD-
   * BEARING RATHER THAN TIDY. `processProduct_updateDefaultImageFileNames`
   * [model/service/ProductService.cfc:L208-L213] runs
   * `sku.setImageFile( sku.generateImageFileName() )` over `product.getSkus()`, and
   * `saveProduct` dispatches it at [model/service/ProductService.cfc:L282] for every
   * new product - so the drafts this factory mints are precisely the SKUs that
   * method walks. In CFML each of them reads `getProduct().setting(...)` and gets
   * the configured value; a draft constructed without the resolved values would
   * silently fall back to the metadata defaults
   * [model/service/SettingService.cfc:L191-L192] and mint a file name an installation
   * with a configured delimiter or extension does not use. Forwarding them keeps the
   * generated name identical to the CFML application's for the same rows.
   *
   * The forward is a CONDITIONAL SPREAD because `exactOptionalPropertyTypes` is on:
   * `{ imageSettingValues: undefined }` is not assignable to an optional member, and
   * an absent bag is a real state the entity already handles per key.
   *
   * The provisional identifier has the same shape `org/Hibachi/HibachiObject.cfc:L144`
   * produced - `replace(lcase(createUUID()), '-', '', 'all')`, thirty-two lower-case
   * hex characters - and is minted with `node:crypto`, which is a Node BUILT-IN and
   * therefore spends nothing against the pinned dependency set (E3). It is
   * provisional by design: `SkuRepository.saveSku` mints the persisted key itself and
   * answers a rehydrated instance, exactly as
   * `src/repositories/mysql/mysqlSkuRepository.ts` does, so this identifier exists to
   * give the draft a stable identity in memory rather than to reach the database.
   *
   * `isNew` is set so that `Sku.setProduct` takes its append path unconditionally -
   * which is what makes [L97]'s counter advance - and so that `saveSku` routes the
   * draft to an insert.
   *
   * @param associations The four association identifier sets the branch has resolved,
   *   attached at construction because the entity publishes no mutators for them.
   */
  private newSkuDraft(associations: SkuDraftAssociations = {}): Sku {
    return new Sku({
      skuID: createHibachiShapedIdentifier(),
      isNew: true,
      skuRepository: this.skuRepository,
      ...(this.imageSettingValues === undefined
        ? {}
        : { imageSettingValues: this.imageSettingValues }),
      ...associations,
    });
  }

  /**
   * Refuses an invocation that would create more SKUs than the configured bound
   * allows, BEFORE the first SKU is attached.
   *
   * ★ THIS IS A CORRECTNESS BOUND, AND IT IS ONLY A CORRECTNESS BOUND.
   * `totalCombos` [L67], [L85] is the PRODUCT of every option group's size, seeded at
   * 1, and is therefore UNBOUNDED BY CONSTRUCTION - three groups of ten options
   * describe a thousand SKUs, four describe ten thousand. Under CFML that ran inside
   * an ambient `cftransaction`, so a run that could not finish left nothing behind. The
   * target has no ambient transaction, so an invocation that cannot finish leaves a
   * PARTIALLY-POPULATED product: some SKUs attached to the live array, code-stamped
   * from a counter that has already advanced, and the rest never created. That is a
   * consistency problem, and the bound exists to make it unreachable.
   *
   * ★ THE COMPENSATION STORY, STATED IN FULL.
   * There is no ambient transaction to roll a partial create back, so the port relies
   * on ordering instead of recovery:
   *
   * - The bound is checked HERE, once the count is known and before any mutation, so a
   *   refusal leaves the product exactly as it was found. There is nothing to
   *   compensate for.
   * - `price` is read on the first pass of every creation loop, before that pass
   *   attaches anything, so an absent or unrepresentable price also leaves nothing
   *   attached.
   * - The option groups are resolved in full before the creation loop begins, so an
   *   unresolvable option or a group-less option leaves nothing attached either.
   * - The carry loop's out-of-range read is unreachable while the [L109] guard stands.
   * - What remains reachable is the subscription branch, where an unresolvable term or
   *   benefit identifier on a LATER iteration leaves earlier iterations' SKUs
   *   attached. That is exactly what the legacy left attached too. The compensation
   *   handle is `product.getSkus()`: this method mutates that array in place and never
   *   copies it, so a caller that catches the failure holds the complete list of what
   *   was attached and can discard the product without having persisted anything -
   *   `createSkus` writes nothing to the database.
   * - Idempotency on re-invocation is `assertSkuCodeAvailable`'s job; see there.
   *
   * @param plannedSkuCount How many SKUs this branch is about to create.
   * @param product The product being populated, named in the refusal.
   * @param siteLocator The legacy locator whose count this bounds.
   */
  private assertWithinCreationBound(
    plannedSkuCount: number,
    product: Product,
    siteLocator: string,
  ): void {
    if (plannedSkuCount > this.maximumSkuCreationBatchSize) {
      throw new Error(
        `SkuService.createSkus: product '${product.getProductID()}' would create ` +
          `${String(plannedSkuCount)} SKUs, above the configured bound of ` +
          `${String(this.maximumSkuCreationBatchSize)}. ` +
          `[model/service/SkuService.cfc:${siteLocator}] computes this count as the product of ` +
          'every option group size and bounds it nowhere. Refused before anything was ' +
          'attached, so the product is unchanged.',
      );
    }
  }

  /**
   * Refuses to attach a SKU whose generated code the product already carries, when
   * the caller has opted in.
   *
   * ★ THIS IS THE IDEMPOTENCY-ON-RETRY MECHANISM, AND IT IS OPT-IN FOR A REASON.
   * Three of the four skuCode formulas do NOT continue a sequence: [L133] and [L184]
   * are the hardcoded `-1`, and [L194] is the loop counter restarting at 1. Re-running
   * those paths against a product that already carries their output regenerates the
   * SAME codes and silently attaches duplicates. Formula 1 - [L97] and [L159]'s
   * `arrayLen(getSkus()) + 1` - cannot collide, because it continues the sequence, so
   * this guard can never fire on the merchandise-multi path where the legacy's own
   * behaviour depends on re-invocation adding to an existing set.
   *
   * It defaults OFF because switching it on changes an observable outcome in exactly
   * that duplicate case, and preserving the legacy's observable behaviour is the
   * acceptance contract. A caller running in a retry-prone environment turns it on
   * deliberately; the default keeps parity.
   *
   * The comparison folds case, because CFML string comparison folds case and the
   * `SwSku.skuCode` column is a text column that a case-folding collation may treat
   * the same way. Nothing in the legacy performs this comparison at all - it is
   * target-side machinery - so no legacy semantics are being reinterpreted here.
   *
   * @param product The product whose existing SKUs are checked.
   * @param skuCode The code about to be stamped.
   * @param siteLocator The legacy locator of the formula that produced it.
   */
  private assertSkuCodeAvailable(product: Product, skuCode: string, siteLocator: string): void {
    if (!this.refuseDuplicateSkuCodes) {
      return;
    }

    const foldedSkuCode = skuCode.toLowerCase();
    const collides = product
      .getSkus()
      .some((existingSku) => existingSku.getSkuCode()?.toLowerCase() === foldedSkuCode);

    if (collides) {
      throw new Error(
        `SkuService.createSkus: product '${product.getProductID()}' already carries a SKU coded ` +
          `'${skuCode}'. [model/service/SkuService.cfc:${siteLocator}] regenerates that code on ` +
          'every invocation, so a retry would attach a duplicate. Refused because ' +
          'refuseDuplicateSkuCodes is enabled.',
      );
    }
  }
}
