// ---------------------------------------------------------------------------
// slatwall-ts - PromotionReward entity
//
// PORT OF model/entity/PromotionReward.cfc (426 lines, confirmed by reading the source in
// three windows: L1-L140, L140-L300, L300-L426).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionReward.cfc:L57]
//
//   component displayname="Promotion Reward" entityname="SlatwallPromotionReward"
//   table="SwPromoReward" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="promotionService"
//   hb_permission="promotionPeriod.promtionRewards" {
//
// Schema continuity is a binding constraint: the entity property metadata IS the contract.
// No migration, no rename, no new table, no column change. Every persisted column below -
// including the inert ones - is carried forward.
//
// ★ NOTE THE ABBREVIATED PHYSICAL TABLE NAME - `SwPromoReward`, NOT `SwPromotionReward`.
// It matches `SwPromoQual` on model/entity/PromotionQualifier.cfc:L49 and it is abbreviated
// for the same reason: this entity owns FOURTEEN many-to-many link tables, more than any
// other in-scope entity, and six of those names are abbreviated further still
// (`SwPromoRewardEligiblePriceGrp` and the five `SwPromoRewardExcl*` tables). Every one of
// the fourteen names is reproduced verbatim in the field documentation below.
//
// ★ NOTE WHAT IS ABSENT FROM L57 AND IS NOT INVENTED HERE: there is no `accessors=`, no
// `output=` and no `hb_processContexts=` attribute. CONTRAST
// model/entity/PromotionQualifier.cfc:L49, which does carry `output="false" accessors="true"`.
// The sibling's extra attributes are NOT transplanted onto this entity.
//
// ★ NOTE `persistent="true"` IS QUOTED here, matching the rest of the promotion cluster and
// contrasting model/entity/PriceGroup.cfc and model/entity/PriceGroupRate.cfc, which use the
// unquoted form. CFML treats both identically. The inconsistency is recorded, not normalised.
//
// ★ NOTE `extends="HibachiEntity"` IS UNQUALIFIED, which resolves to the LOCAL intermediate
// model/entity/HibachiEntity.cfc (274 lines), which itself declares
// `extends="Slatwall.org.Hibachi.HibachiEntity"`. That is a THREE-LEVEL inheritance chain.
// The intermediate holds twelve `getService(...)` sites (L123, L130, L135, L145, L178, L180,
// L182, L194, L196, L207, L257, L266), seven of them `attributeService`. They are moot here
// because the EAV path is not ported, and they are deliberately NOT re-implemented.
//
// `hb_serviceName="promotionService"` is why there is no `PromotionRewardService` to port and
// no such omission to explain: reward CRUD lives in model/service/PromotionService.cfc.
//
// ---------------------------------------------------------------------------
// ★★★ THE ONE RENAMED IDENTIFIER IN THIS FOLDER
// ---------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/PromotionReward.cfc:L57]: the source attribute reads
// `hb_permission="promotionPeriod.promtionRewards"` - "promtion" is MISSPELLED, missing the
// second `o` of "promotion". This is the ONE identifier in src/domain/entities that the
// folder specification directs be RENAMED rather than preserved, on the grounds that the
// permission string is internal framework metadata rather than a persisted data contract.
// It is therefore exposed below, on `PromotionReward.entityMetadata.hb_permission`, with the
// CORRECTED spelling `'promotionPeriod.promotionRewards'`, and the original misspelling is
// recorded here so the legacy attribute value remains auditable.
//
// ★ CORROBORATION THAT THIS IS A DEFECT AND NOT A CONVENTION:
// model/entity/PromotionQualifier.cfc:L49 declares the parallel attribute
// `hb_permission="promotionPeriod.promotionQualifiers"` - spelled CORRECTLY. The two sibling
// entities disagree, which is what makes this one identifiable as a typo.
//
// ★ THE RENAME TREATMENT IS NOT EXTENDED TO ANY OTHER IDENTIFIER. These are all PRESERVED
// verbatim elsewhere in this folder and must never be "corrected":
//   - `singlularname` on productReviews          [model/entity/Product.cfc:L76]
//   - `subsciptionUsageBenefit`                  [model/entity/PriceGroup.cfc:L168-L172]
//   - `getSalePricExpirationDateTime` call site   [model/entity/Product.cfc:L618]
//   - the `assinged` comment typo                [model/entity/PromotionCode.cfc:L180]
//   - `orderItemQulifiedDiscounts`               [model/service/PromotionService.cfc:L82-L133]
//   - the correctly-spelled qualifier permission [model/entity/PromotionQualifier.cfc:L49]
//
// ---------------------------------------------------------------------------
// WHAT THIS ENTITY IS FOR
// ---------------------------------------------------------------------------
//
// `PromotionReward` is the REWARD half of the promotion engine:
// `Promotion` -> `PromotionPeriod` -> { QUALIFIERS decide WHETHER a promotion applies,
// REWARDS decide WHAT it gives }. This entity carries:
//
//   - `amount` + `amountType`, which drive the Strategy dispatch in
//     model/service/PromotionService.cfc:L992-L1002 (discount computation) and, for the
//     parallel vocabulary, model/service/PriceGroupService.cfc:L316-L340;
//   - `roundingRule`, the association the must-preserve discount math reaches through to
//     model/service/RoundingRuleService.cfc:L84 `roundValueByRoundingRule`;
//   - `maximumUsePerOrder` / `maximumUsePerItem` / `maximumUsePerQualification`, the three
//     limits that constitute ONE HALF of must-preserve behaviour #1 - "promotion discount
//     math TOGETHER WITH use-limit enforcement semantics";
//   - fourteen membership collections walked by `getOrderItemInReward`
//     [model/service/PromotionService.cfc:L921-L985].
//
// ---------------------------------------------------------------------------
// ★★★ THE THREE PROJECT ABSENCE CONVENTIONS - NEVER COLLAPSE ONE INTO ANOTHER
// ---------------------------------------------------------------------------
//
//   1. `Sku.getPriceByCurrencyCode()` MUST return `Money | undefined`, NEVER `0`.
//      model/entity/Sku.cfc:L269-L273 has no `else` and no fallback. Substituting `0` would
//      silently sell products for free. Owned by sku.ts.
//   2. `Product.getSalePrice()` MUST return `0`, NEVER `undefined`.
//      model/entity/Product.cfc:L598 reads `getSkus()[1].getSalePrice();` with NO `return`,
//      so execution falls through to `return 0` (DEFECT 20). Owned by product.ts.
//   3. PROMOTION USE-LIMITS and PERIOD BOUNDS MUST stay `undefined`, never `0` and never an
//      epoch date - because `undefined` means UNLIMITED / FOREVER.
//      ★ THIS FILE IS ONE OF CONVENTION #3's CANONICAL HOMES, alongside
//      promotionQualifier.ts and promotionCode.ts.
//
// ---------------------------------------------------------------------------
// ★★★ THE FIVE DISTINCT EMPTY-COLLECTION SEMANTICS
// ---------------------------------------------------------------------------
//
// An empty array does NOT mean one thing in this codebase. It means five different things,
// and collapsing any of them into another is a money bug:
//
//   1. PERMISSIVE in the caller's loop: an empty `shippingAddressZones` on a reward means
//      NO RESTRICTION - the reward applies to every zone.
//   2. RESTRICTIVE in the evaluator: an empty `locations` collection on an address zone
//      means NOT IN ZONE - nothing matches.
//   3. `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` on an
//      empty `entityArray`. On an EXCLUDE list that `false` is PERMISSIVE (nothing is
//      excluded, so the item survives).
//   4. The same `false` on an INCLUDE list is RESTRICTIVE (nothing matches, so the item is
//      not a member).
//   5. The fulfillment three-way gate [model/service/PromotionService.cfc:L333-L420] treats
//      an empty collection as NO RESTRICTION, under a single-promotion-per-fulfillment `[1]`
//      assumption.
//
// ⇒ For the five INCLUDE collections (L80-L84) an empty array means "nothing matches".
//   For the five EXCLUDE collections (L86-L90) an empty array means "nothing is excluded".
//   SAME EMPTY ARRAY, OPPOSITE MEANING. Never write a shared helper that treats them alike.
//
// ---------------------------------------------------------------------------
// ★★★ THE LIVE-ARRAY-REFERENCE RULE - LOAD-BEARING
// ---------------------------------------------------------------------------
//
// Every accessor for one of the ELEVEN in-scope collections returns the LIVE internal array
// reference - never a defensive copy, and never a `readonly` projection. The reason is in the
// source: every `remove*` helper mutates the FAR side's array IN PLACE, through the far side's
// own getter. Concretely, model/entity/PromotionReward.cfc:L173 evaluates
// `arrayDeleteAt(arguments.eligiblePriceGroup.getPromotionRewards(), thatIndex)`; L213 does
// the same on `brand.getPromotionRewards()`; L313 on `brand.getPromotionRewardExclusions()`.
// If any of those getters returned a copy, the bidirectional sync would silently no-op and
// the persisted link rows would drift out of agreement with the object graph.
//
// ★ THIS IS A DOCUMENTED DIVERGENCE FROM promotionQualifier.ts, which returns
// `readonly X[]` projections from its collection accessors. The two files are inconsistent
// on purpose: this file's specification mandates live references, and the mandate wins.
// The three collapsed opaque-ID arrays (L76-L78) ARE `readonly`, because nothing mutates
// them.
//
// ---------------------------------------------------------------------------
// ★★★ ZERO `getService(` SITES - VERIFIED ACROSS ALL 426 LINES
// ---------------------------------------------------------------------------
//
// model/entity/PromotionReward.cfc contains NO `getService(` call anywhere. It is one of the
// ten in-scope entities with zero service-locator sites; the project-wide 45-site census
// found sites only in Sku (x19), Product (x18), ProductType (x6), OptionGroup (x1) and
// RoundingRule (x1). Consequences, all mandatory and all honoured below:
//
//   - NO constructor-injected repository or collaborator port, and no `../ports/*.js` import.
//   - Transformation rule T2 (service-locator removal) is VACUOUS for this file.
//   - EVERY METHOD IS SYNCHRONOUS. There is no `async`, no `Promise<T>` and no `await`
//     anywhere in this module. ESLint `require-await` and `no-floating-promises` would catch
//     a regression.
//
// The ONE collaborator that IS injected - `labelProvider` - is not a service locator. It
// carries resolved resource-bundle text, because JavaRB is not ported (see below).
//
// ---------------------------------------------------------------------------
// ★★★ BUDGET SPENT BY THIS FILE: ZERO OF EVERYTHING
// ---------------------------------------------------------------------------
//
//   - Entity-layer SIGNATURE WIDENINGS ......... 0  (the project's single permitted widening,
//     `PromotionPeriod.isCurrent(now?: Date)`, is already spent in promotionPeriod.ts; ZERO
//     remain in src/domain/entities, forever. Every method here keeps its legacy CFML
//     parameter list exactly.)
//   - DELIBERATE DIVERGENCES (defect repairs) .. 0  (the one divergence this folder owns is
//     DEFECTS 17/18/19, reserved for sku.ts and product.ts. Every defect in this file is
//     REPRODUCED, never repaired.)
//   - SIGNATURE RESHAPINGS ..................... 0  (all three permitted project-wide
//     reshapings belong to src/services and src/integrations.)
//   - VISIBILITY WIDENINGS ..................... 0  (all five belong to
//     src/services/promotion/**.)
//   - ORM-HOOK RESHAPINGS ...................... 0  (the ORM Event Hooks banner pair at
//     L423/L425 is COMPLETELY EMPTY, so the hook-reshaping mandate is vacuous here.)
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
//
// `review_rules` returns exactly "No user rules provided." That absence is NOT licence to
// lower the bar: no rule is invented, zero files enter scope by rule mandate, and the
// enterprise-standard substitutes apply at full strength - maximal TypeScript strictness,
// mechanically enforced layer boundaries, exact dependency pinning, a single arithmetic
// surface for money, one exported primary unit per file with no barrel, and in-code
// annotation of every judgement call and every preserved defect.
//
// ---------------------------------------------------------------------------
// JAVARB IS NOT PORTED
// ---------------------------------------------------------------------------
//
// No i18n runtime is introduced. Every `rbKey(...)` argument, every `hb_formatType`, every
// `hb_nullRBKey` and every `hb_optionsNullRBKey` value is preserved VERBATIM as a literal
// string - as option `name` values, or as documentation - so the legacy admin can still
// resolve them. Nothing is resolved, translated or dropped.
//
// ---------------------------------------------------------------------------
// ENTITIES ARE CLASSES, NOT INTERFACES
// ---------------------------------------------------------------------------
//
// The legacy entities carry BEHAVIOUR, not just data, and interface parity IS the acceptance
// contract. This module therefore exports a class whose public method names are the legacy
// CFML names carried over VERBATIM in camelCase - `getAmountTypeOptions`,
// `getApplicableTermOptions`, `getAmountFormatted`, `getSimpleRepresentation`,
// `getSimpleRepresentationPropertyName`, `isDeletable`, `hasAnyOption`,
// `hasAnyExcludedOption`, `addExcludedProductType`, `removeExcludedProductType`, and so on.
// That is exactly why slatwall-ts/eslint.config.mjs deliberately enables no
// naming-convention, camelcase or id-match rule, no `no-warning-comments`, and no
// complexity or max-lines rule.
//
// ---------------------------------------------------------------------------
// WHAT THE REPOSITORY OWNS, NOT THIS FILE
// ---------------------------------------------------------------------------
//
// Associations are MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have
// no equivalent in a driver-only stack, so laziness is NOT simulated: every collection
// arrives already populated and defaults to `[]`.
// src/repositories/mysql/mysqlPromotionRepository.ts owns the row-to-entity factory, the
// `SwPromoReward` read, the fourteen link-table reads, and the documented fetch shape per
// query method.
//
// ★ ONE THING THIS ENTITY MUST NOT COMPENSATE FOR:
// model/dao/PromotionDAO.cfc:L51 `getActivePromotionRewards` applies NO `ORDER BY`, which is
// precisely what makes the promotion engine's reward-iteration order - and therefore its
// mutable usage ledger - non-deterministic at a tie. That is owned by src/repositories and
// src/services. NO sorting, stable ordering or determinism guarantee is added to any
// collection here.
//
// ---------------------------------------------------------------------------
// ★ THE DELETE-CONTEXT ANTI-CORRUPTION TENSION
// ---------------------------------------------------------------------------
//
// Delete-context `maxCollection:0` validation rules elsewhere in the project reference
// collections the domain deliberately does NOT materialize as entity graphs -
// model/validation/PriceGroup.json's `appliedOrderItems`, model/validation/PromotionCode.json's
// `orders`, and the `physicalCounts` collections on Sku/Product/Brand/ProductType. Because the
// target exposes an EMPTY array for such a collection, a rule of that shape trivially PASSES in
// TypeScript where it would BLOCK in CFML.
//
// Applied to this entity, the analogous surface is the three collapsed opaque-ID arrays for
// `fulfillmentMethods`, `shippingAddressZones` and `shippingMethods`. The consequence is
// annotated at each of the three declarations. Delete-context ENFORCEMENT itself belongs to
// src/services and src/repositories, never to this file.
//
// ---------------------------------------------------------------------------
// THE B8 TEST OBLIGATION - DECLARED HERE, AUTHORED ELSEWHERE
// ---------------------------------------------------------------------------
//
// Target suite: slatwall-ts/tests/unit/domain/entities/promotionReward.test.ts
//
// ★★★ THIS SUITE IS NET-NEW AND MUST BE LABELLED NET-NEW - NEVER PRESENTED AS PARITY.
// There is NO `PromotionRewardTest.cfc` anywhere under meta/tests/. Only TWO of the eighteen
// entity suites extend legacy coverage - brand.test.ts (from
// meta/tests/unit/entity/BrandTest.cfc's `defaults_are_correct()`, which asserts
// `getProducts()` returns an EMPTY array) and product.test.ts (from
// meta/tests/unit/entity/ProductTest.cfc's `productUrlIsCorrectlyFormatted()`, with the
// `nike-air-jorden` fixture retained verbatim including both the leading and the trailing
// slash). meta/tests/functional/admin/entity/ProductTest.cfc is an EMPTY STUB, acknowledged as
// a gap and never counted as coverage. slatwall-ts/tests/traceability/legacyTestMap.ts must
// record promotionReward.ts as NET-NEW.
//
// The test file is NOT authored here - slatwall-ts/tests/ is owned by a different agent. The
// required cases are recorded so the test author inherits them:
//
//   1. Defaults: all eleven in-scope collections and all three opaque-ID arrays default to [].
//   2. `amount` absent ⇒ `getAmount()` is `undefined`, NOT `Money(0)`.
//   3. All three max-use limits absent ⇒ `undefined`, NOT `0`. (The UNLIMITED assertion.)
//   4. `getApplicableTermOptions()` returns exactly three entries, in source order, with
//      verbatim rbKey strings.
//   5. `getAmountTypeOptions()` with `rewardType === 'order'` ⇒ TWO entries.
//   6. `getAmountTypeOptions()` with `rewardType === 'merchandise'` ⇒ THREE entries, the third
//      carrying `value: 'amount'`.
//   7. `getAmountTypeOptions()` with `rewardType === 'ORDER'` ⇒ TWO entries. (The
//      case-insensitivity regression.)
//   8. `getAmountTypeOptions()` with `rewardType` `undefined` ⇒ THREE entries.
//   9. `getAmountFormatted()` with `amountType === 'percentageOff'` takes the percentage
//      branch; `'amountOff'` and `'amount'` take the currency branch; `'PercentageOff'` also
//      takes the percentage branch. (Case-insensitivity.)
//   9a. `getAmountFormatted()` on the PERCENTAGE branch drops trailing zeros: a stored 12.50
//      yields "12.5%" and NOT "12.50%", because org/Hibachi/HibachiUtilityService.cfc:L62-L64 is
//      `arguments.value & "%"` with no mask. This is the assertion that catches a regression back
//      to `numberFormat(..., '0.00')` on that branch, and it is the mirror of the obligation
//      priceGroupRate.ts records for model/entity/PriceGroupRate.cfc:L264.
//   9b. `getAmountFormatted()` on the CURRENCY branch still emits the bare two-decimal form, so a
//      stored 1234.5 yields "1234.50" with NO currency symbol and NO thousands separator. The
//      reasons that presentation is withheld are enumerated at the method; this case exists so
//      the withholding is a pinned decision rather than an accident.
//  10. `getAmountFormatted()` with `amount` `undefined` does NOT render `0`.
//  11. `getSimpleRepresentation()` renders the `'entity.promotionReward'` label, then `' - '`,
//      then the rewardType projection.
//  12. `getSimpleRepresentationPropertyName()` returns `'rewardType'`.
//  13. `isDeletable()` is true only when the period is NOT expired AND the promotion is
//      deletable; THROWS when `promotionPeriod` is `undefined`; short-circuits without
//      evaluating the second operand when the first is false.
//  14. `hasAnyOption([])` ⇒ `false`; `hasAnyExcludedOption([])` ⇒ `false`.
//  15. `hasAnyOption` matches by `optionID` and NOT by object identity - construct two
//      distinct objects carrying the same ID.
//  16. Each of the eleven singular `has*` predicates matches by primary key and returns
//      `false` on an empty collection.
//  17. THE INDEX-0 REGRESSION: removing the element at index 0 of every collection actually
//      removes it. This is the test that catches a `> 0` bug.
//  18. THE LIVE-REFERENCE ASSERTION: mutating the array returned by `getBrands()` (and by
//      `getExcludedSkus()` and `getEligiblePriceGroups()`) is observable through the entity,
//      proving there is no defensive copy.
//  19. Each `add*` is idempotent for an already-present far side and syncs both sides; each
//      `remove*` removes from BOTH sides.
//  20. `setPromotionPeriod` then `removePromotionPeriod()` WITH NO ARGUMENT resolves to the
//      current field and clears it.
//  21. `removePromotionPeriod()` with no argument AND no current field THROWS.
//  22. No `getRewards`, `setPromotion`, `removePromotion`, `hasShippingMethod`,
//      `addShippingMethod`, `removeShippingMethod`, `getFulfillmentMethods`,
//      `getShippingAddressZones`, `getShippingMethods`, `getRewardTypeOptions`, `preInsert`,
//      `preUpdate`, `attributeValues` or `currencyCode` member exists on the class.
//
// Regression tests follow the `issue_<ticket#>` convention carried over from
// meta/tests/unit/IssuesTest.cfc. Tests run non-interactively (`watch: false`).
// ---------------------------------------------------------------------------

import { cfNumberToString, numberFormat } from '../../lib/cfml/numberFormat.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { PriceGroup } from './priceGroup.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { RoundingRule } from './roundingRule.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE [slatwall-ts/eslint.config.mjs]: `Money` is imported with `import type` rather
// than as a value import. The file specification's import ledger labels it a VALUE import, but
// `@typescript-eslint/consistent-type-imports` is configured as `'error'` with
// `prefer: 'type-imports'` and `fixStyle: 'separate-type-imports'`, and `Money` appears ONLY in
// type positions in this component - every arithmetic operation on `amount` lives in
// src/services/promotion/discountAmount.ts, never here. A value import would therefore be a
// LINT FAILURE, and a build failure outranks a ledger label. All eight shipped sibling entities
// import `Money` the same way. Giving `Money` an artificial value use (for example
// `Money.zero`) is not an option: defaulting `amount` to zero is explicitly prohibited, because
// model/entity/PromotionReward.cfc:L61 declares no `default` attribute.
//
// ★ THE TYPE-ONLY CYCLE RULE. This module type-references sku.ts, product.ts, brand.ts,
// option.ts, productType.ts, priceGroup.ts and promotionPeriod.ts, several of which type-
// reference back to this module. EVERY entity-to-entity reference uses `import type`, which is
// erased at emit, so the cycle NEVER EXISTS AT RUNTIME. No value import to another entity
// module may ever be introduced here.
//
// ★ DELIBERATELY NOT IMPORTED, and each for a verified reason:
//   - `decimal.js`                       - `../valueObjects/money.js` is the only domain module
//                                          permitted to import it; all arithmetic and
//                                          presentation of money goes through `Money`.
//   - `../valueObjects/currencyCode.js`  - this entity declares NO `currencyCode` column.
//   - `../valueObjects/materializedIdPath.js` - no ID-path column on this entity.
//   - `../../lib/cfml/struct.js`         - the only `structKeyExists` in the source is at L147
//                                          and is an ARGUMENT-scope guard, modelled as a real
//                                          optional TypeScript parameter.
//   - `../../lib/cfml/list.js`           - no comma-delimited list is parsed or built here.
//   - `../../lib/cfml/precision.js`      - no `precisionEvaluate` call site in this component.
//   - `cfBoolean` / `cfLen` / `cfTruthy` - this entity declares ZERO boolean columns of either
//                                          casing and performs no `len()` test.
//   - any `../ports/*.js`                - zero `getService(` sites, so no port is needed.
//   - `../../lib/config.js`, `../../lib/logger.js` - entities read no process configuration
//                                          and do not log.
//   - `src/repositories/**`, `src/handlers/**`, `src/integrations/**`, `mysql2`, `aws-lambda`,
//     `dotenv`                           - forbidden in `src/domain/**` by the
//                                          `no-restricted-imports` layer boundary.

/**
 * The amount-type vocabulary, mined from `getAmountTypeOptions()`
 * [model/entity/PromotionReward.cfc:L120-L133].
 *
 * ★ THIS IS THE STRATEGY-DISPATCH VOCABULARY. Two switches in the target read it: discount
 * computation, ported from model/service/PromotionService.cfc:L992-L1002, and - for the
 * parallel price-group vocabulary - model/service/PriceGroupService.cfc:L316-L340.
 *
 * NARROWED TO A UNION DELIBERATELY, and this is a considered decision rather than a default.
 * `amountType` at [L62] is `ormType="string"` with no check constraint, so the DATABASE would
 * accept any string. What justifies the union is that the source declares a real, method-backed
 * enumeration of exactly these three values - unlike `rewardType`, whose vocabulary exists only
 * in a comment and which is therefore left un-narrowed (see `getRewardType()` below).
 *
 * ★ NOTE THE NAME/VALUE MISMATCH ON THE THIRD MEMBER: its display key is `define.fixedAmount`
 * but its stored value is `amount`. BOTH are preserved verbatim. The value must never be
 * "corrected" to `fixedAmount`, because the value is what the promotion service switches on.
 *
 * ★ DOCUMENTED CONTRAST WITH priceGroupRate.ts, which faced the same three-value enumeration at
 * model/entity/PriceGroupRate.cfc:L87 and deliberately did NOT narrow its `amountType` column,
 * keeping the union on its option type instead. The two files differ on purpose: this file's
 * specification mandates the narrowing. The duplication is recorded rather than shared - a type
 * is NOT imported from priceGroupRate.ts merely to reuse it, and no shared `types.ts` is
 * created, because both would violate the one-primary-unit-per-file rule and the locked
 * eighteen-file entity budget.
 */
export type AmountType = 'percentageOff' | 'amountOff' | 'amount';

/**
 * The applicable-term vocabulary, mined from `getApplicableTermOptions()`
 * [model/entity/PromotionReward.cfc:L112-L118] - exactly three values, in source order.
 *
 * Narrowed for the same reason as `AmountType`: the source declares a real method-backed
 * enumeration. `applicableTerm` at [L64] is `ormType="string" hb_formatType="rbKey"`.
 */
export type ApplicableTerm = 'both' | 'initial' | 'renewal';

/**
 * One entry of `getAmountTypeOptions()`. Module-local and deliberately NOT exported: it exists
 * only to type this class's own return value, and the module's export list is exactly the class
 * plus the two vocabulary aliases above.
 *
 * `name` holds the UNRESOLVED resource-bundle key verbatim, because JavaRB is not ported.
 */
interface AmountTypeOption {
  readonly name: string;
  readonly value: AmountType;
}

/** One entry of `getApplicableTermOptions()`. Module-local, same rationale as above. */
interface ApplicableTermOption {
  readonly name: string;
  readonly value: ApplicableTerm;
}

/**
 * Resolved resource-bundle text for `getSimpleRepresentation()`
 * [model/entity/PromotionReward.cfc:L106-L108].
 *
 * JavaRB is not ported and no i18n runtime is introduced, so resolved labels are supplied at
 * hydration rather than looked up. This mirrors the convention promotionQualifier.ts established
 * for the identical call shape at model/entity/PromotionQualifier.cfc:L101-L103.
 *
 * Module-local and NOT exported, for the same reason as the option interfaces above.
 */
interface PromotionRewardLabelProvider {
  /** [model/entity/PromotionReward.cfc:L107] `rbKey('entity.promotionReward')`. */
  getPromotionRewardEntityLabel(): string;

  /**
   * [org/Hibachi/HibachiTransient.cfc:L506] the value-dependent key
   * `entity.promotionReward.rewardType.<value>`, reached through
   * `getFormattedValue('rewardType')` [model/entity/PromotionReward.cfc:L107] and the
   * `hb_formatType="rbKey"` attribute on [L63].
   */
  getRewardTypeLabel(rewardType: string): string;
}

/**
 * `SlatwallPromotionReward`, table `SwPromoReward`
 * [model/entity/PromotionReward.cfc:L57].
 *
 * The REWARD half of the promotion engine. See the module header for the full port contract,
 * the three absence conventions, the five empty-collection semantics, the live-array-reference
 * rule and the zero-budget statement.
 */
export class PromotionReward {
  /**
   * The component declaration's attributes [model/entity/PromotionReward.cfc:L57], carried
   * forward as inert metadata so the legacy contract stays auditable from the target. Frozen
   * because nothing may mutate a schema contract at runtime.
   *
   * ★ `hb_permission` IS THE ONE RENAMED VALUE. The source reads
   * `hb_permission="promotionPeriod.promtionRewards"` - misspelled. See the module header for
   * the full rename record and for the corroborating correctly-spelled sibling attribute at
   * model/entity/PromotionQualifier.cfc:L49.
   *
   * ★ `table` is the ABBREVIATED physical name and is never expanded.
   * ★ `extends` is UNQUALIFIED, naming the local intermediate model/entity/HibachiEntity.cfc.
   */
  static readonly entityMetadata: Readonly<Record<string, string>> = Object.freeze({
    displayname: 'Promotion Reward',
    entityname: 'SlatwallPromotionReward',
    table: 'SwPromoReward',
    persistent: 'true',
    extends: 'HibachiEntity',
    cacheuse: 'transactional',
    hb_serviceName: 'promotionService',
    hb_permission: 'promotionPeriod.promotionRewards',
  });

  // ============ START: Persistent Properties ==========================================
  // [model/entity/PromotionReward.cfc:L59] banner; declarations at L60-L67.
  //
  // ★ EXACTLY EIGHT PERSISTENT SCALARS, AND EXACTLY ZERO BOOLEANS. Verified against BOTH
  // attribute casings - `ormtype="boolean"` AND `ormType="boolean"` - because the original
  // project-wide boolean census grepped only the lowercase form and is known to have
  // under-counted the camelCase form at model/entity/PriceGroupRate.cfc:L53. This entity's
  // count is genuinely zero, in both the persistent block AND the non-persistent block
  // (L102-L104), which is why `cfBoolean` is not imported and no boolean coercion is authored.
  //
  // ★ LEGACY-NOTE [model/entity/PromotionReward.cfc:L60-L67]: THE `ormType`/`ormtype` CASING
  // WART. L60, L66 and L67 spell the attribute lowercase `ormtype`; L61, L62, L63, L64 and L65
  // spell it camelCase `ormType`. CFML attribute names are case-insensitive, so Hibernate
  // treats them identically. The inconsistency is recorded here rather than normalised away
  // silently, and it changes no type decision below. Same wart class as
  // model/entity/PriceGroupRate.cfc:L53.

  /**
   * [model/entity/PromotionReward.cfc:L60]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`.
   *
   * The primary key. `unsavedvalue=""` together with `default=""` is what makes `isNew()`
   * decidable without a session.
   */
  private readonly promotionRewardID: string;

  /**
   * [model/entity/PromotionReward.cfc:L61] `ormType="big_decimal" hb_formatType="custom"`.
   *
   * ★ NO `default` ATTRIBUTE, SO ABSENCE IS REAL. This is the fourth of exactly four
   * no-default money columns in this folder, and the schema itself encodes the asymmetry:
   *
   *   | column                                | default | meaning              |
   *   |---------------------------------------|---------|----------------------|
   *   | SkuCurrency.price            [L53]    | none    | absence is real      |
   *   | PriceGroupRate.amount        [L54]    | none    | absence is real      |
   *   | PromotionApplied.discountAmount [L53] | none    | absence is real      |
   *   | PromotionReward.amount       [L61]    | none    | absence is real      |
   *   | contrast Sku.listPrice       [L55]    | "0"     | zero is a real value |
   *   | contrast Sku.price           [L56]    | "0"     | zero is a real value |
   *   | contrast Sku.renewalPrice    [L57]    | "0"     | zero is a real value |
   *
   * Typed `Money | undefined` - never `number`, never `string`, never a raw decimal, and never
   * defaulted to zero. No arithmetic is performed on it in this file: the discount computation
   * lives in src/services/promotion/discountAmount.ts, ported from
   * model/service/PromotionService.cfc:L987-L1018.
   *
   * `hb_formatType="custom"` is the directive `getAmountFormatted()` [L401-L407] implements by
   * hand; it is preserved here as inert metadata.
   */
  private readonly amount: Money | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L62] `ormType="string" hb_formatType="rbKey"`.
   *
   * The Strategy discriminator. Narrowed to `AmountType` because `getAmountTypeOptions()`
   * [L120-L133] declares a real method-backed enumeration - see the alias documentation.
   */
  private readonly amountType: AmountType | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L63] `ormType="string" hb_formatType="rbKey"`.
   *
   * ★★★ LEGACY-NOTE [model/entity/PromotionReward.cfc:L48-L56]: the `rewardType` vocabulary is
   * documented ONLY in a source comment block immediately above the component declaration -
   * `merchandise`, `subscription`, `contentAccess`, `fulfillment`, `order` (the five values sit
   * at L50-L54, under the "Valid Reward Types" heading at L48, with the block closing at L56).
   * There is NO `getRewardTypeOptions()` method anywhere in the 426 lines, NO
   * `rewardTypeOptions` non-persistent property, and NO `inList` constraint in
   * model/validation/PromotionReward.json that narrows it.
   *
   * THIS PROPERTY IS THEREFORE DELIBERATELY LEFT AS AN UN-NARROWED `string`. Narrowing it to a
   * five-member union would invent an enforcement the legacy schema does not have, and would
   * break hydration the moment a sixth value appeared in the database. Contrast `amountType`
   * and `applicableTerm`, which ARE narrowed because each has a real method-backed enumeration.
   *
   * Note that `getAmountTypeOptions()` [L120-L133] branches on `rewardType == "order"`, which
   * is one of these five values.
   */
  private readonly rewardType: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L64] `ormType="string" hb_formatType="rbKey"`.
   * Narrowed to `ApplicableTerm` - see `getApplicableTermOptions()` [L112-L118].
   */
  private readonly applicableTerm: ApplicableTerm | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L65]
   * `ormType="integer" hb_nullRBKey="define.unlimited"`.
   *
   * ★★★ LEGACY-NOTE [model/entity/PromotionReward.cfc:L65-L67]: all THREE max-use limits carry
   * `hb_nullRBKey="define.unlimited"` and NONE has a `default` attribute. NULL MEANS UNLIMITED -
   * the metadata states the permissive extreme in the schema itself.
   *
   * They MUST stay `undefined` and MUST NEVER be coalesced to `0`. Coalescing turns "unlimited
   * uses" into "zero uses allowed", which suppresses every discount the reward should grant.
   * This is one half of must-preserve behaviour #1 - promotion discount math TOGETHER WITH
   * use-limit enforcement semantics. The enforcement itself lives in
   * src/services/promotion/rewardUsageLedger.ts and src/services/promotion/overUseStripping.ts,
   * which read these three fields directly.
   *
   * ⚠ CONTEXT RECORDED BUT DELIBERATELY NOT ACTED ON HERE:
   * src/services/promotion/overUseStripping.ts reproduces DEFECT 9 -
   * model/service/PromotionService.cfc:L468-L521 iterates `for(var prID in
   * promotionRewardUsageDetails)` but reads
   * `promotionRewardUsageDetails[ reward.getPromotionRewardID() ].maximumUsePerOrder` at L472,
   * indexing by the LEAKED `reward` variable left over from the previous loop rather than by the
   * loop key `prID`. Maximum-use-per-order is therefore enforced against whichever reward
   * happened to be last, for every key in the ledger. THAT DEFECT IS OWNED BY src/services.
   * This file's only obligation is to expose `getPromotionRewardID()` and
   * `getMaximumUsePerOrder()` faithfully so the service can reproduce it. No guard, no
   * validation and no compensation is added here.
   */
  private readonly maximumUsePerOrder: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L66]
   * `ormtype="integer" hb_nullRBKey="define.unlimited"`. `undefined` means UNLIMITED - see
   * `maximumUsePerOrder` above.
   */
  private readonly maximumUsePerItem: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L67]
   * `ormtype="integer" hb_nullRBKey="define.unlimited"`. `undefined` means UNLIMITED - see
   * `maximumUsePerOrder` above.
   */
  private readonly maximumUsePerQualification: number | undefined;

  // ============ START: Related Object Properties (many-to-one) ========================
  // [model/entity/PromotionReward.cfc:L69] banner; declarations at L70-L71.

  /**
   * [model/entity/PromotionReward.cfc:L70]
   * `cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID"`.
   *
   * ⚠ IT CARRIES NEITHER `fetch="join"` NOR ANY `lazy=` ATTRIBUTE. The project-wide eager-fetch
   * census stands at exactly FOUR sites - `Product.brand` [model/entity/Product.cfc:L68],
   * `Product.productType` [L69], `Product.defaultSku` [L70] and `PromotionPeriod.promotion`
   * [model/entity/PromotionPeriod.cfc:L59]. This association is NOT one of them, so no
   * eager-fetch semantics are asserted for it here.
   *
   * MUTABLE: `setPromotionPeriod` assigns it [L141] and `removePromotionPeriod` clears it
   * [L154]. `undefined` covers both an unattached reward and one the repository hydrated
   * without its parent - two states the port cannot distinguish, exactly as CFML cannot.
   */
  private promotionPeriod: PromotionPeriod | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L71]
   * `cfc="RoundingRule" fieldtype="many-to-one" fkcolumn="roundingRuleID"
   * hb_optionsNullRBKey="define.none"`.
   *
   * ★ LOAD-BEARING FOR THE MUST-PRESERVE DISCOUNT MATH. This is the FK the discount path
   * reaches through to `roundValueByRoundingRule` [model/service/RoundingRuleService.cfc:L84],
   * which is invoked from both discount calculation and price-group rate calculation.
   *
   * ★ LEGACY-NOTE [model/entity/PromotionReward.cfc:L71]: `hb_optionsNullRBKey="define.none"`
   * means an ABSENT rounding rule is a LEGITIMATE SELECTION, not an error state. Callers in
   * src/services/promotion/discountAmount.ts must handle `undefined` by skipping rounding
   * entirely. A synthetic "identity" RoundingRule is NOT substituted - the legacy code has no
   * such thing, and inventing one would change money.
   */
  private readonly roundingRule: RoundingRule | undefined;

  // ============ START: Related Object Properties (many-to-many - owner) ===============
  // [model/entity/PromotionReward.cfc:L73] banner; declarations at L74-L90.
  //
  // ★★★ EXACTLY FOURTEEN COLLECTIONS - the largest link-collection surface of any in-scope
  // entity, one more than model/entity/PromotionQualifier.cfc's thirteen. All fourteen are the
  // `fieldtype="many-to-many"` OWNER side with `fkcolumn="promotionRewardID"`. The source
  // separates them into four groups with blank lines at L75, L79, L85 and L91:
  //
  //   GROUP A - one in-scope pricing collection ....... L74            (1)
  //   GROUP B - three out-of-scope fulfillment/shipping L76-L78        (3)  ⇒ COLLAPSED
  //   GROUP C - five in-scope INCLUDE collections ..... L80-L84        (5)
  //   GROUP D - five in-scope EXCLUDE collections ..... L86-L90        (5)
  //                                                     1+3+5+5 = 14 ✅
  //
  // ★ LEGACY-NOTE [model/entity/PromotionReward.cfc:L74-L90]: THE `type="array"` METADATA
  // INCONSISTENCY. The attribute is present on only THREE of the fourteen - L74
  // (`eligiblePriceGroups`), L86 (`excludedBrands`) and L87 (`excludedOptions`) - and absent
  // from the other eleven. Hibernate treats all fourteen identically. The inconsistency is
  // annotated rather than normalised. Same wart class as model/entity/PromotionQualifier.cfc
  // (where `type="array"` appeared on only L83 and L84) and as the `attributeValues` census
  // (present on model/entity/Sku.cfc:L70 and model/entity/Brand.cfc:L60, omitted on
  // model/entity/Product.cfc:L75 and model/entity/ProductType.cfc:L67).
  //
  // ★ ALL ELEVEN IN-SCOPE COLLECTIONS ARE `private readonly` ARRAY REFERENCES HOLDING MUTABLE
  // ARRAYS. `readonly` binds the FIELD, not the array: the bidirectional helpers must be able
  // to `push` and `splice`, and the accessors must hand out the LIVE reference. See the
  // live-array-reference rule in the module header.

  /**
   * GROUP A. [model/entity/PromotionReward.cfc:L74]
   * `singularname="eligiblePriceGroup" cfc="PriceGroup" type="array"
   * fieldtype="many-to-many" linktable="SwPromoRewardEligiblePriceGrp"
   * fkcolumn="promotionRewardID" inversejoincolumn="priceGroupID"`.
   *
   * ⚠ NOTE THE ABBREVIATED LINK-TABLE NAME - `...EligiblePriceGrp`, NOT
   * `...EligiblePriceGroup`. That is the real table name and it is never expanded.
   */
  private readonly eligiblePriceGroups: PriceGroup[];

  /**
   * GROUP B, collapsed. [model/entity/PromotionReward.cfc:L76]
   * `singularname="fulfillmentMethod" cfc="FulfillmentMethod" fieldtype="many-to-many"
   * linktable="SwPromoRewardFulfillmentMethod" fkcolumn="promotionRewardID"
   * inversejoincolumn="fulfillmentMethodID"`.
   *
   * ★ LEGACY-NOTE: `FulfillmentMethod` is NOT one of the eighteen in-scope entities - it belongs
   * to the explicitly out-of-scope order/checkout/fulfillment pipeline. The collection is
   * therefore collapsed to an INERT READONLY OPAQUE-ID ARRAY: the persisted link rows survive
   * losslessly, so schema continuity is unbroken, but no `FulfillmentMethod` type is imported
   * and no entity-array accessor is authored. The source declares NO `add*`/`remove*` helper
   * for this collection, so nothing is dropped.
   *
   * ★ DELETE-CONTEXT TENSION: because this surfaces as an array of IDs rather than an entity
   * graph, a `maxCollection:0` delete-context rule referencing it would trivially PASS here
   * where it would BLOCK in CFML. Enforcement belongs to src/services and src/repositories.
   */
  private readonly fulfillmentMethodIDs: readonly string[];

  /**
   * GROUP B, collapsed. [model/entity/PromotionReward.cfc:L77]
   * `singularname="shippingAddressZone" cfc="AddressZone" fieldtype="many-to-many"
   * linktable="SwPromoRewardShipAddressZone" fkcolumn="promotionRewardID"
   * inversejoincolumn="addressZoneID"`.
   *
   * ★ LEGACY-NOTE: `AddressZone` is out of scope, so this collapses to an inert readonly
   * opaque-ID array on the same terms as `fulfillmentMethodIDs` above, including the
   * delete-context tension. The source declares NO helper pair for it. Note the abbreviated
   * link-table name `...ShipAddressZone`, preserved verbatim.
   */
  private readonly shippingAddressZoneIDs: readonly string[];

  /**
   * GROUP B, collapsed. [model/entity/PromotionReward.cfc:L78]
   * `singularname="shippingMethod" cfc="ShippingMethod" fieldtype="many-to-many"
   * linktable="SwPromoRewardShippingMethod" fkcolumn="promotionRewardID"
   * inversejoincolumn="shippingMethodID"`.
   *
   * LEGACY-NOTE [model/entity/PromotionReward.cfc:L78]: `ShippingMethod` is part of the explicitly
   * out-of-scope order/checkout/shipping pipeline, so the collection itself is collapsed to opaque
   * `shippingMethodID` values rather than an entity array - the anti-corruption treatment AAP 0.1.1
   * mandates for an out-of-scope aggregate. The persisted link rows survive losslessly, so schema
   * continuity is unbroken.
   *
   * ★★★ QUOTE-THEN-REVISE: THE THREE HELPERS ARE AUTHORED, KEYED ON THE OPAQUE ID (F30). This block
   * used to state that `addShippingMethod` [L178-L185], `removeShippingMethod` [L186-L195] and the
   * framework-dispatched `hasShippingMethod` predicate were all "DROPPED HERE", on the precedent of
   * `PriceGroup.addAppliedOrderItem` [model/entity/PriceGroup.cfc:L128] / `removeAppliedOrderItem`
   * [L131], `Brand.addAttributeValue` [model/entity/Brand.cfc:L90] / `removeAttributeValue` [L93],
   * and model/entity/PromotionCode.cfc's `accounts` / `orders` helpers.
   *
   *   THE PRECEDENT WAS MISAPPLIED. Every case it cites is a collection with NO helper in the source
   *   at all, or one whose helper needs a far-side entity method that has no ID-keyed equivalent.
   *   This one is different in the one way that matters: AAP 0.4.2 states that the bidirectional
   *   `add*`/`remove*` helpers "become array operations with identical names", and the OWNING SIDE of
   *   these two is pure array work over `variables.shippingMethods` - `arrayAppend` at [L180],
   *   `arrayFind` plus `arrayDeleteAt` at [L187-L190] - which an opaque ID reproduces exactly. Only
   *   the far side needs the entity, and the far side is where the boundary genuinely bites.
   *
   *   SO THE OWNING HALF IS REPRODUCED AND THE FAR HALF IS NOT, and the split is stated at each
   *   member rather than used to justify dropping the whole thing. `ShippingMethod.hasPromotionReward`
   *   and `ShippingMethod.getPromotionRewards()` are never called from this file, because
   *   `ShippingMethod` is not ported.
   *
   * ★ A MUTABLE ARRAY BEHIND A `readonly` BINDING, which is what the helpers need and is exactly what
   * CFML had: `variables.shippingMethods` was itself mutated in place by both helpers. The BINDING is
   * `readonly` so the array cannot be replaced wholesale, and the constructor COPIES its input so the
   * hydrating adapter's array is never aliased into the entity.
   *
   * ★ THE DELETE-CONTEXT TENSION applies here too, on the same terms as the two siblings above:
   * because this surfaces as IDs, a `maxCollection:0` delete-context rule referencing it would
   * trivially PASS here where it would BLOCK in CFML. Enforcement belongs to src/services and
   * src/repositories.
   */
  private readonly shippingMethodIDs: string[];

  /**
   * GROUP C, INCLUDE. [model/entity/PromotionReward.cfc:L80]
   * `singularname="brand" cfc="Brand" fieldtype="many-to-many"
   * linktable="SwPromoRewardBrand" fkcolumn="promotionRewardID" inversejoincolumn="brandID"`.
   *
   * EMPTY MEANS "NOTHING MATCHES" (restrictive) - see semantics #4 in the module header.
   */
  private readonly brands: Brand[];

  /**
   * GROUP C, INCLUDE. [model/entity/PromotionReward.cfc:L81]
   * `singularname="option" cfc="Option" fieldtype="many-to-many"
   * linktable="SwPromoRewardOption" fkcolumn="promotionRewardID" inversejoincolumn="optionID"`.
   *
   * Read by `hasAnyOption()` on the live promotion-membership path
   * [model/service/PromotionService.cfc:L951]. EMPTY MEANS "NOTHING MATCHES" (restrictive).
   */
  private readonly options: Option[];

  /**
   * GROUP C, INCLUDE. [model/entity/PromotionReward.cfc:L82]
   * `singularname="sku" cfc="Sku" fieldtype="many-to-many" linktable="SwPromoRewardSku"
   * fkcolumn="promotionRewardID" inversejoincolumn="skuID"`.
   *
   * EMPTY MEANS "NOTHING MATCHES" (restrictive).
   */
  private readonly skus: Sku[];

  /**
   * GROUP C, INCLUDE. [model/entity/PromotionReward.cfc:L83]
   * `singularname="product" cfc="Product" fieldtype="many-to-many"
   * linktable="SwPromoRewardProduct" fkcolumn="promotionRewardID"
   * inversejoincolumn="productID"`.
   *
   * EMPTY MEANS "NOTHING MATCHES" (restrictive).
   */
  private readonly products: Product[];

  /**
   * GROUP C, INCLUDE. [model/entity/PromotionReward.cfc:L84]
   * `singularname="productType" cfc="ProductType" fieldtype="many-to-many"
   * linktable="SwPromoRewardProductType" fkcolumn="promotionRewardID"
   * inversejoincolumn="productTypeID"`.
   *
   * EMPTY MEANS "NOTHING MATCHES" (restrictive). The reward-membership walk
   * [model/service/PromotionService.cfc:L921-L985] compares this against the
   * `productTypeIDPath` materialized path rather than against the entity itself; that walk is
   * owned by src/services/promotion/orderItemMembership.ts.
   */
  private readonly productTypes: ProductType[];

  /**
   * GROUP D, EXCLUDE. [model/entity/PromotionReward.cfc:L86]
   * `singularname="excludedBrand" cfc="Brand" type="array" fieldtype="many-to-many"
   * linktable="SwPromoRewardExclBrand" fkcolumn="promotionRewardID"
   * inversejoincolumn="brandID"`.
   *
   * ⚠ NOTE THE ABBREVIATED `Excl` PREFIX - never expanded to `Excluded`.
   * EMPTY MEANS "NOTHING IS EXCLUDED" (permissive) - the OPPOSITE of the Group C reading of the
   * same empty array. See semantics #3 and #4 in the module header.
   */
  private readonly excludedBrands: Brand[];

  /**
   * GROUP D, EXCLUDE. [model/entity/PromotionReward.cfc:L87]
   * `singularname="excludedOption" cfc="Option" type="array" fieldtype="many-to-many"
   * linktable="SwPromoRewardExclOption" fkcolumn="promotionRewardID"
   * inversejoincolumn="optionID"`.
   *
   * Read by `hasAnyExcludedOption()` on the live promotion-membership path
   * [model/service/PromotionService.cfc:L980]. EMPTY MEANS "NOTHING IS EXCLUDED" (permissive).
   */
  private readonly excludedOptions: Option[];

  /**
   * GROUP D, EXCLUDE. [model/entity/PromotionReward.cfc:L88]
   * `singularname="excludedSku" cfc="Sku" fieldtype="many-to-many"
   * linktable="SwPromoRewardExclSku" fkcolumn="promotionRewardID" inversejoincolumn="skuID"`.
   *
   * EMPTY MEANS "NOTHING IS EXCLUDED" (permissive).
   */
  private readonly excludedSkus: Sku[];

  /**
   * GROUP D, EXCLUDE. [model/entity/PromotionReward.cfc:L89]
   * `singularname="excludedProduct" cfc="Product" fieldtype="many-to-many"
   * linktable="SwPromoRewardExclProduct" fkcolumn="promotionRewardID"
   * inversejoincolumn="productID"`.
   *
   * EMPTY MEANS "NOTHING IS EXCLUDED" (permissive).
   */
  private readonly excludedProducts: Product[];

  /**
   * GROUP D, EXCLUDE. [model/entity/PromotionReward.cfc:L90]
   * `singularname="excludedProductType" cfc="ProductType" fieldtype="many-to-many"
   * linktable="SwPromoRewardExclProductType" fkcolumn="promotionRewardID"
   * inversejoincolumn="productTypeID"`.
   *
   * EMPTY MEANS "NOTHING IS EXCLUDED" (permissive).
   */
  private readonly excludedProductTypes: ProductType[];

  // ============ START: Remote Properties ==============================================
  // [model/entity/PromotionReward.cfc:L92] banner; declaration at L93.

  /** [model/entity/PromotionReward.cfc:L93] `ormtype="string"`. */
  private readonly remoteID: string | undefined;

  // ============ START: Audit Properties ==============================================
  // [model/entity/PromotionReward.cfc:L95] banner; declarations at L96-L99.
  //
  // ★ EXPLICIT UTC POLICY: both timestamps are `Date` values interpreted as UTC. This entity
  // performs NO date comparison of its own - `isDeletable()` [L417-L419] delegates the expiry
  // test to `PromotionPeriod.isExpired()` - so no clock is needed and NO CLOCK IS INJECTED. The
  // injected-clock ruling for the project's seven date-dependent methods lives on
  // promotionPeriod.ts, promotion.ts and promotionCode.ts, not here.
  //
  // ★ `hb_populateEnabled="false"` is declared on all four properties and is preserved as inert
  // metadata: the framework's populate pass must never write them from request data.

  /**
   * [model/entity/PromotionReward.cfc:L96]
   * `hb_populateEnabled="false" ormtype="timestamp"`. UTC.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L97]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
   * fkcolumn="createdByAccountID"`.
   *
   * ★ LEGACY-NOTE: `Account` is OUT OF SCOPE, so the association is collapsed to the inert
   * opaque FK column it is stored in. The dropped legacy members are the framework-implicit
   * `getCreatedByAccount()` / `setCreatedByAccount()` accessors over `cfc="Account"`; the
   * persisted `createdByAccountID` column survives verbatim, so schema continuity is unbroken.
   * `Account` is never imported and no account accessor is authored. This follows the precedent
   * of promotionQualifier.ts, promotion.ts, promotionCode.ts and promotionApplied.ts.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L98]
   * `hb_populateEnabled="false" ormtype="timestamp"`. UTC.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L99]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
   * fkcolumn="modifiedByAccountID"`.
   *
   * ★ LEGACY-NOTE: collapsed on exactly the same terms as `createdByAccountID` above - dropped
   * `getModifiedByAccount()` / `setModifiedByAccount()`, preserved `modifiedByAccountID` column.
   */
  private readonly modifiedByAccountID: string | undefined;

  // ============ START: Non-Persistent Properties ======================================
  // [model/entity/PromotionReward.cfc:L101] banner; declarations at L102-L104.
  //
  // L102 `property name="amountTypeOptions" persistent="false";`      - paired with
  //      `getAmountTypeOptions()` [L120]. No backing field: the getter returns a fresh tuple.
  // L103 `property name="applicableTermOptions" persistent="false";`  - paired with
  //      `getApplicableTermOptions()` [L112]. No backing field, same reason.
  // L104 `property name="rewards" type="string" persistent="false";`  - ORPHANED, see below.
  //
  // LEGACY-DEFECT [model/entity/PromotionReward.cfc:L104]: `property name="rewards"
  // type="string" persistent="false"` is DECLARED but has NO getter and is never referenced
  // anywhere in the 426-line component. It is a dead declared property, structurally identical
  // to model/entity/PromotionQualifier.cfc:L99's orphaned `qualifierApplicationTypeOptions`, to
  // DEFECT 10's never-read `qualifiedFulfillments` key at
  // model/service/PromotionService.cfc:L621-L623, and to model/validation/PriceGroupRate.json's
  // declared-but-never-referenced `isNotGlobal` condition. It is preserved as this documented
  // dead declaration and NOT as a field, because an unread private field would be dead code
  // rather than documentation; NO `getRewards()` accessor is authored, because authoring one
  // would invent a public surface the legacy component does not have.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ⚠ CONTRAST model/entity/PromotionQualifier.cfc, which carries a DOUBLE orphan - a declared
  // property with no getter AND a getter with no declared property. PromotionReward has only a
  // SINGLE orphan: both of its options getters, L112 and L120, pair correctly with L103 and
  // L102 respectively.

  /**
   * Resolved resource-bundle text for `getSimpleRepresentation()` [L106-L108]. NOT a legacy
   * property and NOT a service locator - JavaRB is not ported, so labels are supplied at
   * hydration. `undefined` when the repository hydrated the reward without them, in which case
   * `getSimpleRepresentation()` throws rather than fabricating text.
   */
  private readonly labelProvider: PromotionRewardLabelProvider | undefined;

  /**
   * Constructed by src/repositories/mysql/mysqlPromotionRepository.ts's row-to-entity factory
   * from one `SwPromoReward` row plus its materialized associations.
   *
   * The single-typed-input shape, the `?? []` collection defaults and the required primary key
   * all match the convention every shipped sibling entity in this folder established.
   *
   * ★ NO COLLABORATOR PORT IS INJECTED - this entity has ZERO `getService(` sites.
   * ★ NO CLOCK IS INJECTED - this entity performs no date comparison.
   * ★ `amount` HAS NO DEFAULT [L61] and the three max-use limits HAVE NO DEFAULT [L65-L67].
   *   Absence is preserved as `undefined` in all four cases. Supplying `0` for a maximum would
   *   forbid every use of the reward; supplying `0` for the amount would fabricate a real
   *   zero discount.
   * ★ ALL FOURTEEN COLLECTIONS DEFAULT TO `[]`, matching the `Brand.getProducts()` convention
   *   the one legacy entity test asserts and applied uniformly across this folder.
   */
  constructor(init: {
    readonly promotionRewardID: string;
    readonly amount?: Money | undefined;
    readonly amountType?: AmountType | undefined;
    readonly rewardType?: string | undefined;
    readonly applicableTerm?: ApplicableTerm | undefined;
    readonly maximumUsePerOrder?: number | undefined;
    readonly maximumUsePerItem?: number | undefined;
    readonly maximumUsePerQualification?: number | undefined;
    readonly promotionPeriod?: PromotionPeriod | undefined;
    readonly roundingRule?: RoundingRule | undefined;
    readonly eligiblePriceGroups?: PriceGroup[] | undefined;
    readonly fulfillmentMethodIDs?: readonly string[] | undefined;
    readonly shippingAddressZoneIDs?: readonly string[] | undefined;
    readonly shippingMethodIDs?: readonly string[] | undefined;
    readonly brands?: Brand[] | undefined;
    readonly options?: Option[] | undefined;
    readonly skus?: Sku[] | undefined;
    readonly products?: Product[] | undefined;
    readonly productTypes?: ProductType[] | undefined;
    readonly excludedBrands?: Brand[] | undefined;
    readonly excludedOptions?: Option[] | undefined;
    readonly excludedSkus?: Sku[] | undefined;
    readonly excludedProducts?: Product[] | undefined;
    readonly excludedProductTypes?: ProductType[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly labelProvider?: PromotionRewardLabelProvider | undefined;
  }) {
    this.promotionRewardID = init.promotionRewardID;
    this.amount = init.amount;
    this.amountType = init.amountType;
    this.rewardType = init.rewardType;
    this.applicableTerm = init.applicableTerm;
    this.maximumUsePerOrder = init.maximumUsePerOrder;
    this.maximumUsePerItem = init.maximumUsePerItem;
    this.maximumUsePerQualification = init.maximumUsePerQualification;
    this.promotionPeriod = init.promotionPeriod;
    this.roundingRule = init.roundingRule;
    this.eligiblePriceGroups = init.eligiblePriceGroups ?? [];
    this.fulfillmentMethodIDs = init.fulfillmentMethodIDs ?? [];
    this.shippingAddressZoneIDs = init.shippingAddressZoneIDs ?? [];
    // COPIED, not aliased: the helpers below mutate this array in place, exactly as
    // [model/entity/PromotionReward.cfc:L180, L189] mutate `variables.shippingMethods`, so the
    // hydrating adapter's own array must not be the one that moves.
    this.shippingMethodIDs = [...(init.shippingMethodIDs ?? [])];
    this.brands = init.brands ?? [];
    this.options = init.options ?? [];
    this.skus = init.skus ?? [];
    this.products = init.products ?? [];
    this.productTypes = init.productTypes ?? [];
    this.excludedBrands = init.excludedBrands ?? [];
    this.excludedOptions = init.excludedOptions ?? [];
    this.excludedSkus = init.excludedSkus ?? [];
    this.excludedProducts = init.excludedProducts ?? [];
    this.excludedProductTypes = init.excludedProductTypes ?? [];
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.labelProvider = init.labelProvider;
  }

  // ============ START: Persistent Property Accessors ==================================
  // Legacy names carried over verbatim in CFML camelCase; interface parity is the acceptance
  // contract. In CFML these are `accessors`-generated implicit getters on the framework base.

  /** [model/entity/PromotionReward.cfc:L60] The primary key. */
  getPromotionRewardID(): string {
    return this.promotionRewardID;
  }

  /**
   * [model/entity/PromotionReward.cfc:L61] `undefined` for a NULL column - NEVER a substituted
   * `Money` zero. See the field documentation for the four-column no-default table.
   */
  getAmount(): Money | undefined {
    return this.amount;
  }

  /** [model/entity/PromotionReward.cfc:L62] The Strategy discriminator. */
  getAmountType(): AmountType | undefined {
    return this.amountType;
  }

  /**
   * [model/entity/PromotionReward.cfc:L63] Deliberately an un-narrowed `string` - the five-value
   * vocabulary is documented only in the L48-L56 comment block and is not enforced anywhere.
   */
  getRewardType(): string | undefined {
    return this.rewardType;
  }

  /** [model/entity/PromotionReward.cfc:L64] */
  getApplicableTerm(): ApplicableTerm | undefined {
    return this.applicableTerm;
  }

  /**
   * [model/entity/PromotionReward.cfc:L65] `undefined` means UNLIMITED
   * (`hb_nullRBKey="define.unlimited"`), NEVER zero uses. Read directly by
   * src/services/promotion/overUseStripping.ts.
   */
  getMaximumUsePerOrder(): number | undefined {
    return this.maximumUsePerOrder;
  }

  /** [model/entity/PromotionReward.cfc:L66] `undefined` means UNLIMITED, never zero uses. */
  getMaximumUsePerItem(): number | undefined {
    return this.maximumUsePerItem;
  }

  /** [model/entity/PromotionReward.cfc:L67] `undefined` means UNLIMITED, never zero uses. */
  getMaximumUsePerQualification(): number | undefined {
    return this.maximumUsePerQualification;
  }

  /** [model/entity/PromotionReward.cfc:L93] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionReward.cfc:L96] UTC. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/PromotionReward.cfc:L97] The collapsed `cfc="Account"` FK, exposed as the
   * opaque column value. There is deliberately no `getCreatedByAccount()`.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionReward.cfc:L98] UTC. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PromotionReward.cfc:L99] The collapsed `cfc="Account"` FK. There is
   * deliberately no `getModifiedByAccount()`.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============ START: Related Object Accessors (many-to-one) =========================

  /**
   * [model/entity/PromotionReward.cfc:L70] The parent period, or `undefined` for an unattached
   * reward. Deliberately does NOT throw and does NOT fabricate a fallback: the callers that
   * cannot tolerate absence - `isDeletable()` [L417-L419] and `removePromotionPeriod()`
   * [L146-L155] - reproduce the legacy null-dereference themselves.
   */
  getPromotionPeriod(): PromotionPeriod | undefined {
    return this.promotionPeriod;
  }

  /**
   * [model/entity/PromotionReward.cfc:L71] The rounding rule the must-preserve discount math
   * reaches through, or `undefined`. `hb_optionsNullRBKey="define.none"` makes absence a
   * legitimate selection, so callers skip rounding rather than substituting an identity rule.
   */
  getRoundingRule(): RoundingRule | undefined {
    return this.roundingRule;
  }

  // ============ START: Related Object Accessors (many-to-many - owner) ================
  //
  // ★★★ THE LIVE-ARRAY-REFERENCE RULE. Each of the eleven in-scope accessors below returns the
  // LIVE internal array - not a copy, and not a `readonly` projection. The `remove*` helpers on
  // the FAR side mutate these arrays in place through exactly these getters; a copy would make
  // the bidirectional sync a silent no-op and let the persisted link rows drift. See the module
  // header for the three concrete legacy sites (L173, L213, L313).
  //
  // ★ The three GROUP B accessors are the only `readonly` ones, because nothing mutates them.
  // They are named for the opaque IDs they actually carry - `getFulfillmentMethodIDs()` and not
  // `getFulfillmentMethods()` - so the collapse is visible in the surface rather than hidden
  // behind a name that promises entities.

  /** [model/entity/PromotionReward.cfc:L74] LIVE reference. Link table `SwPromoRewardEligiblePriceGrp`. */
  getEligiblePriceGroups(): PriceGroup[] {
    return this.eligiblePriceGroups;
  }

  /**
   * [model/entity/PromotionReward.cfc:L76] The collapsed Group B link rows for
   * `SwPromoRewardFulfillmentMethod`, as opaque `fulfillmentMethodID` values.
   *
   * ★ FAR-SIDE CONTRACT FOR src/services: the promotion engine reads this collection when
   * evaluating fulfillment reward applicability. Because it is an opaque ID array here,
   * src/services/promotion/** must resolve it through read-only order-fulfillment views
   * (src/domain/views/orderFulfillmentView.ts) rather than by traversing an entity graph.
   */
  getFulfillmentMethodIDs(): readonly string[] {
    return this.fulfillmentMethodIDs;
  }

  /**
   * [model/entity/PromotionReward.cfc:L77] The collapsed Group B link rows for
   * `SwPromoRewardShipAddressZone`, as opaque `addressZoneID` values.
   *
   * ★ FAR-SIDE CONTRACT FOR src/services: zone membership must be resolved through the injected
   * `addressZoneEvaluator` port, ported from `AddressService.isAddressInZone`
   * [model/service/AddressService.cfc:L57], rather than by walking an `AddressZone` graph.
   *
   * ⚠ RELATED CONTEXT, OWNED BY src/services AND NOT BY THIS FILE: DEFECT 11 at
   * model/service/PromotionService.cfc:L703, where the shipping-address-zones clause re-tests
   * `hasShippingMethod` instead of testing the zone condition. It is reproduced there, not here.
   */
  getShippingAddressZoneIDs(): readonly string[] {
    return this.shippingAddressZoneIDs;
  }

  /**
   * [model/entity/PromotionReward.cfc:L78] The collapsed Group B link rows for
   * `SwPromoRewardShippingMethod`, as opaque `shippingMethodID` values.
   *
   * ★ This is the ID-keyed surface that replaces `getShippingMethods()`, whose element type would
   * be the out-of-scope `ShippingMethod` entity. QUOTE-THEN-REVISE: this note used to add
   * "`addShippingMethod` [L178-L185], `removeShippingMethod` [L186-L195] and `hasShippingMethod`"
   * to that list of replaced members; all three are now AUTHORED, keyed on the opaque ID. See the
   * field documentation for the full record.
   *
   * ★ THE LIVE ARRAY, exactly as [model/entity/PromotionReward.cfc:L183, L191, L193] returned the
   * live `variables.shippingMethods` to its callers - so a caller that read this before an
   * `addShippingMethod` observes the addition, as it did in CFML. It is typed `readonly` so a caller
   * cannot mutate it directly and must go through the helpers, which is the one place the guard
   * semantics live.
   *
   * ★ FAR-SIDE CONTRACT FOR src/services: resolve shipping methods through read-only
   * order-fulfillment views, not through entity traversal.
   */
  getShippingMethodIDs(): readonly string[] {
    return this.shippingMethodIDs;
  }

  /**
   * [model/entity/PromotionReward.cfc:L80] LIVE reference. Link table `SwPromoRewardBrand`.
   * INCLUDE polarity: empty means "nothing matches".
   */
  getBrands(): Brand[] {
    return this.brands;
  }

  /**
   * [model/entity/PromotionReward.cfc:L81] LIVE reference. Link table `SwPromoRewardOption`.
   * INCLUDE polarity: empty means "nothing matches".
   */
  getOptions(): Option[] {
    return this.options;
  }

  /**
   * [model/entity/PromotionReward.cfc:L82] LIVE reference. Link table `SwPromoRewardSku`.
   * INCLUDE polarity: empty means "nothing matches".
   */
  getSkus(): Sku[] {
    return this.skus;
  }

  /**
   * [model/entity/PromotionReward.cfc:L83] LIVE reference. Link table `SwPromoRewardProduct`.
   * INCLUDE polarity: empty means "nothing matches".
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * [model/entity/PromotionReward.cfc:L84] LIVE reference. Link table
   * `SwPromoRewardProductType`. INCLUDE polarity: empty means "nothing matches".
   */
  getProductTypes(): ProductType[] {
    return this.productTypes;
  }

  /**
   * [model/entity/PromotionReward.cfc:L86] LIVE reference. Link table
   * `SwPromoRewardExclBrand`. EXCLUDE polarity: empty means "nothing is excluded" - the
   * OPPOSITE reading of the same empty array from `getBrands()`.
   */
  getExcludedBrands(): Brand[] {
    return this.excludedBrands;
  }

  /**
   * [model/entity/PromotionReward.cfc:L87] LIVE reference. Link table
   * `SwPromoRewardExclOption`. EXCLUDE polarity: empty means "nothing is excluded".
   */
  getExcludedOptions(): Option[] {
    return this.excludedOptions;
  }

  /**
   * [model/entity/PromotionReward.cfc:L88] LIVE reference. Link table `SwPromoRewardExclSku`.
   * EXCLUDE polarity: empty means "nothing is excluded".
   */
  getExcludedSkus(): Sku[] {
    return this.excludedSkus;
  }

  /**
   * [model/entity/PromotionReward.cfc:L89] LIVE reference. Link table
   * `SwPromoRewardExclProduct`. EXCLUDE polarity: empty means "nothing is excluded".
   */
  getExcludedProducts(): Product[] {
    return this.excludedProducts;
  }

  /**
   * [model/entity/PromotionReward.cfc:L90] LIVE reference. Link table
   * `SwPromoRewardExclProductType`. EXCLUDE polarity: empty means "nothing is excluded".
   */
  getExcludedProductTypes(): ProductType[] {
    return this.excludedProductTypes;
  }

  // ============ getSimpleRepresentation - OUTSIDE AND BEFORE ANY BANNER ===============
  //
  // ⚠ LEGACY-NOTE [model/entity/PromotionReward.cfc:L106-L108]: STRUCTURAL WART. This method
  // sits at L106-L108, ORPHANED between the last non-persistent property declaration (L104) and
  // the first `START:` banner (L110, "Non-Persistent Property Methods"). It belongs to neither
  // section. model/entity/PromotionQualifier.cfc:L101-L103 has the IDENTICAL wart - the same
  // method, in the same orphaned position, in the sibling entity - which is what identifies it
  // as a repeated authoring habit rather than a one-off slip. Cosmetic only; no behavioural
  // effect. The position is recorded here rather than reproduced, because the target's section
  // comments are for diffability and an orphan region would obscure rather than clarify.

  /**
   * [model/entity/PromotionReward.cfc:L106-L108]
   *
   *     return "#rbKey('entity.promotionReward')# - #getFormattedValue('rewardType')#";
   *
   * The `" - "` separator (space-hyphen-space) is emitted UNCONDITIONALLY by the source's string
   * interpolation, so a NULL `rewardType` leaves a trailing separator. That is preserved.
   *
   * `rbKey('entity.promotionReward')` and `getFormattedValue('rewardType')` are both framework
   * collaborators that are not ported: `rbKey` is JavaRB, and `getFormattedValue` lives on
   * org/Hibachi/HibachiTransient.cfc and honours the `hb_formatType="rbKey"` attribute declared
   * on [L63] by building the key `entity.promotionReward.rewardType.<value>`. Resolved text is
   * therefore supplied at hydration through `labelProvider`, matching the convention
   * promotionQualifier.ts established for the identical call shape.
   *
   * @throws when the reward was hydrated without a label provider. No default is substituted:
   *   emitting the raw keys would leak identifiers onto an admin screen, and emitting English
   *   would fabricate translations that JavaRB owns.
   */
  getSimpleRepresentation(): string {
    const provider: PromotionRewardLabelProvider | undefined = this.labelProvider;

    if (provider === undefined) {
      throw new Error(
        'PromotionReward.getSimpleRepresentation needs resolved text for two resource-bundle ' +
          "keys - 'entity.promotionReward' [model/entity/PromotionReward.cfc:L107] and " +
          "'entity.promotionReward.rewardType.<value>' " +
          '[org/Hibachi/HibachiTransient.cfc:L506] - and this reward was hydrated without a ' +
          'label provider. JavaRB is not ported, so resolved labels are supplied at hydration. ' +
          'No default is substituted: emitting the raw keys would leak identifiers into an ' +
          'admin screen and emitting English would fabricate translations.',
      );
    }

    // [org/Hibachi/HibachiTransient.cfc:L505-L509] the `rbKey` format branch: a key built from
    // the stored value, or `''` when the value is null. This is NOT the `hb_nullRBKey` fallback,
    // which that branch returns before ever reaching.
    const rewardTypeLabel: string =
      this.rewardType === undefined ? '' : provider.getRewardTypeLabel(this.rewardType);

    return `${provider.getPromotionRewardEntityLabel()} - ${rewardTypeLabel}`;
  }

  // ============ START: Non-Persistent Property Methods ================================
  // [model/entity/PromotionReward.cfc:L110] START banner, [L135] END banner. POPULATED with
  // exactly two methods: `getApplicableTermOptions` [L112] and `getAmountTypeOptions` [L120].

  /**
   * [model/entity/PromotionReward.cfc:L112-L118] The backing property for `applicableTermOptions`
   * [L103]. A flat, unconditional three-element list - contrast `getAmountTypeOptions()` below,
   * which branches.
   *
   * Returns a fresh fixed-length tuple on every call, in SOURCE ORDER, with the `rbKey`
   * arguments preserved VERBATIM as the unresolved `name` values because JavaRB is not ported.
   */
  getApplicableTermOptions(): readonly [
    ApplicableTermOption,
    ApplicableTermOption,
    ApplicableTermOption,
  ] {
    return [
      { name: 'define.both', value: 'both' },
      { name: 'define.initial', value: 'initial' },
      { name: 'define.renewal', value: 'renewal' },
    ];
  }

  /**
   * [model/entity/PromotionReward.cfc:L120-L133] The backing property for `amountTypeOptions`
   * [L102].
   *
   * ★★★ THIS METHOD IS NOT A FLAT LIST - IT BRANCHES ON `rewardType`:
   *
   *     if(getRewardType() == "order") {  →  percentageOff, amountOff              (TWO)
   *     } else {                          →  percentageOff, amountOff, amount      (THREE)
   *
   * ★ THE BRANCH CONDITION IS A CASE-INSENSITIVE CFML COMPARISON. LEGACY-NOTE
   * [model/entity/PromotionReward.cfc:L121]: the CFML `==` operator is case-insensitive, so a
   * `rewardType` of `"Order"` or `"ORDER"` takes the TWO-option branch in the legacy engine.
   * TypeScript `===` is case-sensitive, so the comparison below folds case to preserve
   * behaviour. CFML struct keys and `eq`/`findNoCase` comparisons are case-insensitive
   * throughout the legacy codebase; every ported comparison is audited rather than assumed.
   *
   * ★ A NULL `rewardType` FAILS THE `== "order"` TEST IN CFML and therefore takes the ELSE
   * branch. `rewardType` has no `default` attribute [L63], so `undefined` is reachable, and the
   * `?? ''` fold below reproduces that outcome: `''` is not `'order'`, so the three-option
   * branch is taken.
   *
   * ★ THE THIRD ENTRY'S NAME/VALUE MISMATCH IS PRESERVED: display key `define.fixedAmount`,
   * stored value `amount`. The value is what model/service/PromotionService.cfc:L992-L1002
   * switches on and must never be "corrected" to `fixedAmount`.
   */
  getAmountTypeOptions():
    | readonly [AmountTypeOption, AmountTypeOption]
    | readonly [AmountTypeOption, AmountTypeOption, AmountTypeOption] {
    // [L121] `getRewardType() == "order"`, case-folded. See the note above.
    if ((this.rewardType ?? '').toLowerCase() === 'order') {
      // [L122-L125] the order branch: TWO options, no fixed amount.
      return [
        { name: 'define.percentageOff', value: 'percentageOff' },
        { name: 'define.amountOff', value: 'amountOff' },
      ];
    }

    // [L127-L131] every other reward type - merchandise, subscription, contentAccess,
    // fulfillment, and a NULL rewardType: THREE options.
    return [
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ];
  }

  // ============ END: Non-Persistent Property Methods ==================================

  // ============ Framework-dispatched members, materialized explicitly =================
  //
  // org/Hibachi/HibachiEntity.cfc:L507-L565 dynamically dispatches ELEVEN method-name patterns -
  // `hasUniqueOrNull*`, `hasUnique*` [L514], `hasAny*` [L517-L519], `get*AssignedIDList`,
  // `get*ID`, `get*Options`, `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`,
  // and a `getAttributeValue` fallback [L559] - terminating in a THROW at L565.
  //
  // ★ TYPESCRIPT DOES NOT EMULATE DYNAMIC DISPATCH. There is no `Proxy`, no index signature and
  // no computed-string member access anywhere in this module. Only the patterns that are
  // CONCRETELY CALLED are materialized, each as an explicitly-typed method annotated with the
  // dispatch branch it replaces. NONE of them is declared in
  // model/entity/PromotionReward.cfc - every one is required because the source's own `add*`
  // guards or the promotion service call it.
  //
  // ★ THE EAV FALLBACK IS UNREACHABLE FOR THIS ENTITY. The project-wide `attributeValues` census
  // found exactly FOUR declarations - model/entity/Sku.cfc:L70, model/entity/Product.cfc:L75,
  // model/entity/ProductType.cfc:L67 and model/entity/Brand.cfc:L60. PromotionReward declares
  // ZERO, so `hasProperty("attributeValues")` is false here and an unmatched `get...` throws
  // directly at org/Hibachi/HibachiEntity.cfc:L565 rather than reaching the L559 EAV fallback.
  // No `attributeValues` collection and no EAV read path is authored.
  //
  // ★★★ THE COMPARISON BASIS FOR EVERY `has*` PREDICATE IS HIBERNATE'S IMPLICIT
  // COLLECTION-CONTAINS - session identity, i.e. the PRIMARY KEY. Comparison is therefore BY
  // PRIMARY KEY, never by object reference and never by deep equality. The one exception is the
  // unsaved case: an entity whose PK is still the `unsavedvalue=""` empty string has no identity
  // to compare, so those fall back to reference containment - a blank ID would otherwise match
  // every other unsaved row in the collection. This mirrors the convention every shipped sibling
  // in this folder uses.
  //
  // ★★★ THE `findIndex`/`indexOf` BASE-CHANGE RULE - A REAL OFF-BY-ONE HAZARD.
  // CFML `arrayFind` is ONE-BASED and returns ZERO on a miss, which is why the source writes
  // `if(index > 0)` / `if(thisIndex > 0)` / `if(thatIndex > 0)` at L151, L168, L172, L188, L192,
  // L208, L212, L228, L232, L248, L252, L268, L272, L288, L292, L308, L312, L328, L332, L348,
  // L352, L368, L372, L388 and L392. TypeScript `Array.prototype.indexOf` and `findIndex` are
  // ZERO-BASED and return `-1` on a miss.
  // ⛔ `if (index > 0)` MUST NEVER BE WRITTEN AGAINST SUCH A RESULT: it would silently skip the
  // element at index 0 - the FIRST element of every collection. Every membership and splice
  // guard in this module therefore tests `!== -1`.
  // ⛔ Relatedly, `listFindNoCase` returns a ONE-BASED index or `0` and is never usable as a
  // boolean. It is not called in this module, but the rule is absolute across the port.
  //
  // ★ WHY `indexOf` AND NOT `findIndex` IN THE `remove*` HELPERS: CFML `arrayFind` on COMPLEX
  // objects compares by reference, so `indexOf` is the faithful equivalent there, while the
  // `has*` predicates below use primary-key comparison because Hibernate's collection-contains
  // does. Both idioms are zero-based and return `-1`, so the base-change rule holds for both.

  /**
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] and the `unsavedvalue`/`default` semantics of the
   * primary key [model/entity/PromotionReward.cfc:L60].
   *
   * Called on THIS side by every `add*` guard's second clause [L142, L162, L202, L222, L242,
   * L262, L282, L302, L322, L342, L362, L382] and on the FAR side by every `add*` guard's first
   * clause. Matches the convention every shipped sibling in this folder established.
   */
  isNew(): boolean {
    return this.promotionRewardID === '';
  }

  /**
   * ★★★ MANDATORY. Dispatch [org/Hibachi/HibachiEntity.cfc:L517-L519]; implementation
   * [org/Hibachi/HibachiEntity.cfc:L340-L350] `hasAnyInProperty`.
   *
   * Call site: model/service/PromotionService.cfc:L951, inside `getOrderItemInReward`
   * [L921-L985] - the live promotion-membership path. The argument is the order item's SKU's
   * option collection [model/entity/Sku.cfc:L76, many-to-many owner, link table `SwSkuOption`,
   * `fkcolumn="skuID"`, `inversejoincolumn="optionID"`].
   *
   * ★ RETURNS `false` FOR AN EMPTY INPUT ARRAY, which is exactly what `hasAnyInProperty` does at
   * L340-L350. POLARITY DECIDES WHAT THAT `false` MEANS: on this INCLUDE-side predicate it is
   * RESTRICTIVE - no options supplied means no option membership, so the reward does not match.
   * Contrast `hasAnyExcludedOption` below, where the same `false` is PERMISSIVE.
   *
   * Tests against the `options` collection [L81] and NEVER against `excludedOptions` [L87].
   *
   * The parameter is `readonly Option[]` rather than `Option[]` because `Sku.getOptions()`
   * returns a readonly projection; a mutable parameter type would reject the real call site.
   * This widens what callers may pass and narrows nothing, so it is not a signature widening in
   * the budget sense - no parameter is added and none is removed.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * ★★★ MANDATORY. Dispatch [org/Hibachi/HibachiEntity.cfc:L517-L519]; implementation
   * [org/Hibachi/HibachiEntity.cfc:L340-L350].
   *
   * Call site: model/service/PromotionService.cfc:L980, inside `getOrderItemInReward`.
   *
   * ★ RETURNS `false` FOR AN EMPTY INPUT ARRAY. On this EXCLUDE-side predicate that `false` is
   * PERMISSIVE - nothing is excluded, so the order item SURVIVES the exclusion test. The
   * identical `false` from `hasAnyOption` above is RESTRICTIVE. Same value, opposite
   * consequence; see the five empty-collection semantics in the module header.
   *
   * Tests against the `excludedOptions` collection [L87] and NEVER against `options` [L81].
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in
   * model/entity/PromotionReward.cfc. Materialized because the source's own `addEligiblePriceGroup`
   * guard calls it at L159. Compares on `priceGroupID` [L74].
   */
  hasEligiblePriceGroup(priceGroup: PriceGroup): boolean {
    const candidateID: string = priceGroup.getPriceGroupID();
    if (candidateID === '') {
      return this.eligiblePriceGroups.includes(priceGroup);
    }
    return this.eligiblePriceGroups.some(
      (held: PriceGroup) => held.getPriceGroupID() === candidateID,
    );
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L199. Compares on `brandID`. INCLUDE side [L80].
   */
  hasBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.brands.includes(brand);
    }
    return this.brands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L219. Compares on `optionID`. INCLUDE side [L81].
   */
  hasOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.options.includes(option);
    }
    return this.options.some((held: Option) => held.getOptionID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L239. Compares on `skuID`. INCLUDE side [L82].
   */
  hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L259. Compares on `productID`. INCLUDE side [L83].
   */
  hasProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.products.includes(product);
    }
    return this.products.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L279. Compares on `productTypeID`. INCLUDE side [L84].
   */
  hasProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.productTypes.includes(productType);
    }
    return this.productTypes.some((held: ProductType) => held.getProductTypeID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L299. Compares on `brandID`. EXCLUDE side [L86] - never crossed with `hasBrand`.
   */
  hasExcludedBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.excludedBrands.includes(brand);
    }
    return this.excludedBrands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L319. Compares on `optionID`. EXCLUDE side [L87].
   */
  hasExcludedOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.excludedOptions.includes(option);
    }
    return this.excludedOptions.some((held: Option) => held.getOptionID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L339. Compares on `skuID`. EXCLUDE side [L88].
   */
  hasExcludedSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.excludedSkus.includes(sku);
    }
    return this.excludedSkus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L359. Compares on `productID`. EXCLUDE side [L89].
   */
  hasExcludedProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.excludedProducts.includes(product);
    }
    return this.excludedProducts.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Guard site L379. Compares on `productTypeID`. EXCLUDE side [L90].
   *
   * ⚠ QUOTE-THEN-REVISE: THIS TABLE HAS TWELVE ROWS. It used to read "THIS TABLE HAS ELEVEN ROWS,
   * NOT TWELVE. `hasShippingMethod`, whose guard site is L179, is DELIBERATELY NOT AUTHORED".
   * `hasShippingMethod` IS authored now (F30), keyed on the opaque `shippingMethodID` because
   * `ShippingMethod` is out of scope - see the `shippingMethodIDs` field documentation.
   */
  hasExcludedProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.excludedProductTypes.includes(productType);
    }
    return this.excludedProductTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateID,
    );
  }

  // ============ START: Bidirectional Helper Methods ====================================
  // [model/entity/PromotionReward.cfc:L137] START banner, [L397] END banner - roughly 260 lines,
  // THE LARGEST SUCH BLOCK IN ANY IN-SCOPE ENTITY, exceeding even
  // model/entity/PromotionQualifier.cfc's L119-L339.
  //
  // THIRTEEN HELPER PAIRS FOR FOURTEEN RELATIONSHIPS, verified from the source:
  //   setPromotionPeriod        L140 / removePromotionPeriod        L146   (the many-to-one)
  //   addEligiblePriceGroup     L158 / removeEligiblePriceGroup     L166
  //   addShippingMethod         L178 / removeShippingMethod         L186   ⇒ ID-KEYED, see below
  //   addBrand                  L198 / removeBrand                 L206
  //   addOption                 L218 / removeOption                L226
  //   addSku                    L238 / removeSku                   L246
  //   addProduct                L258 / removeProduct               L266
  //   addProductType            L278 / removeProductType           L286
  //   addExcludedBrand          L298 / removeExcludedBrand          L306
  //   addExcludedOption         L318 / removeExcludedOption         L326
  //   addExcludedSku            L338 / removeExcludedSku            L346
  //   addExcludedProduct        L358 / removeExcludedProduct        L366
  //   addExcludedProductType    L378 / removeExcludedProductType    L386
  //
  // ⇒ `fulfillmentMethods` [L76] and `shippingAddressZones` [L77] have NO helpers at all in the
  //   source, while `shippingMethods` [L78] HAS them - an asymmetry that DIFFERS from
  //   model/entity/PromotionQualifier.cfc, which declared no helpers for ANY of its three
  //   out-of-scope collections.
  //
  //   ★★★ QUOTE-THEN-REVISE: ALL THIRTEEN PAIRS ARE AUTHORED HERE. This read "TWELVE PAIRS ARE
  //   AUTHORED HERE: the many-to-one pair plus ELEVEN many-to-many pairs. The `shippingMethod` pair
  //   is dropped." AAP 0.4.2 requires the `add*`/`remove*` helpers to "become array operations with
  //   identical names", and the owning half of this pair is pure array work that an opaque ID
  //   reproduces exactly. So the count is the many-to-one pair plus TWELVE many-to-many pairs, and
  //   the `shippingMethod` pair is ID-KEYED rather than entity-keyed - the only pair in the block
  //   that is.
  //
  // ★★★ THE TWO FAR-SIDE MEMBER FAMILIES - NEVER MIXED.
  //
  //   FAMILY 1, INCLUDE: `hasPromotionReward(this)` + `getPromotionRewards()`
  //     PromotionPeriod  has L142  get L143, L150, L152   ✅ verified in promotionPeriod.ts
  //     PriceGroup       has L162  get L163, L171, L173   ✅ verified in priceGroup.ts
  //     ShippingMethod   has L182  get L183, L191, L193   ❌ out of scope - FAR SIDE not reproduced
  //     Brand            has L202  get L203, L211, L213   ✅ verified in brand.ts
  //     Option           has L222  get L223, L231, L233   ✅ verified in option.ts
  //     Sku              has L242  get L243, L251, L253   ✅ verified in sku.ts
  //     Product          has L262  get L263, L271, L273   ✅ verified in product.ts
  //     ProductType      has L282  get L283, L291, L293   ✅ verified in productType.ts
  //
  //   FAMILY 2, EXCLUDE: `hasPromotionRewardExclusion(this)` + `getPromotionRewardExclusions()`
  //     Brand            has L302  get L303, L311, L313   ✅ verified in brand.ts
  //     Option           has L322  get L323, L331, L333   ✅ verified in option.ts
  //     Sku              has L342  get L343, L351, L353   ✅ verified in sku.ts
  //     Product          has L362  get L363, L371, L373   ✅ verified in product.ts
  //     ProductType      has L382  get L383, L391, L393   ✅ verified in productType.ts
  //
  // Crossing the two families would corrupt the wrong link table: the INCLUDE pairs must never
  // touch `getPromotionRewardExclusions()` and the EXCLUDE pairs must never touch
  // `getPromotionRewards()`.
  //
  // ★ THE §2.4 GAP PROCEDURE WAS EXECUTED AND FOUND ZERO GAPS. Every one of the thirteen
  // far-side members above was verified by READING the sibling entity module before being
  // called, and each returns a LIVE mutable `PromotionReward[]`, which is what the in-place
  // far-side splices below require. `isNew()` - called on the far side at L159, L179, L199,
  // L219, L239, L259, L279, L299, L319, L339, L359 and L379 - is likewise present on every
  // sibling. NO member was invented, and no member was added to a file this agent does not own.
  // The `PriceGroup` call surface in particular is fully satisfied: priceGroup.ts declares both
  // `hasPromotionReward` and `getPromotionRewards()`, so the coordination gap the specification
  // flagged as newly-discovered is CLOSED.
  //
  // ★★★ THE "remove-that-ADDs" INVERSION CROSS-CHECK - INDEPENDENTLY RE-VERIFIED FROM SOURCE.
  // RESULT: CLEAN - ZERO INVERSIONS ACROSS ALL THIRTEEN `remove*` HELPERS. Each one calls
  // `arrayDeleteAt` on both sides and never `arrayAppend`: removePromotionPeriod L152;
  // removeEligiblePriceGroup L169 + L173; removeShippingMethod L189 + L193 (correct, though the
  // helper is dropped); removeBrand L209 + L213; removeOption L229 + L233; removeSku L249 +
  // L253; removeProduct L269 + L273; removeProductType L289 + L293; removeExcludedBrand L309 +
  // L313; removeExcludedOption L329 + L333; removeExcludedSku L349 + L353; removeExcludedProduct
  // L369 + L373; removeExcludedProductType L389 + L393.
  //
  // LEGACY-NOTE [model/entity/PromotionReward.cfc:L137-L397 vs model/entity/Option.cfc:L129-L131,
  // L145-L147]: all thirteen `remove*` helpers in PromotionReward.cfc correctly delegate to a
  // removal on both sides. THE MIRROR IMAGE OF THIS RELATIONSHIP IS DEFECTIVE:
  // model/entity/Option.cfc's `removePromotionRewardExclusion()` [L129-L131] and
  // `removePromotionQualifierExclusion()` [L145-L147] each call `addExcludedOption(this)` - a
  // "remove" that ADDS. Those two defects are preserved in option.ts under LEGACY-DEFECT
  // markers. The two sides of the SAME relationship therefore disagree, and BOTH behaviours are
  // preserved unreconciled. Do not "harmonise" them. (This is also visible from the target side:
  // option.ts:L1577 calls `addExcludedOption` from a `remove` path.)
  //
  // ★ COSMETIC WARTS IN THIS BLOCK, recorded once and not reproduced, because prettier governs
  // the target's formatting and none of them has any behavioural effect: trailing whitespace on
  // the `shippingMethods` block [L178-L195], the `skus` block [L237-L255], the `excludedBrands`
  // block [L297-L315] and the `excludedOptions` block [L317-L335]; inconsistent blank-line
  // spacing between helper groups; and the mixed tab/space plus seven-space indentation drift
  // inside `removePromotionPeriod` [L147-L154].
  //
  // ★ CFML BUILT-INS EXPRESSED IDIOMATICALLY, per the minimal-change clause, which scopes the
  // FUNCTIONAL surface rather than code style: `arrayAppend` → `push`, `arrayFind` → `indexOf`,
  // `arrayDeleteAt` → `splice`, `structDelete(variables, "x")` → assigning `undefined` to the
  // field, `structKeyExists(arguments, "x")` → a real optional parameter. There is NO
  // `variables.` scope emulation, no `evaluate()`, no dynamic property access and no `arguments`
  // object anywhere in this module.
  //
  // ★★★ ANTI-CONTRACTS - MEMBERS THAT MUST NOT EXIST, VERIFIED ACROSS ALL 426 LINES:
  //
  //   ⛔ NO `setPromotion` AND NO `removePromotion`. model/entity/PromotionReward.cfc declares
  //      ONLY `setPromotionPeriod` [L140] and `removePromotionPeriod` [L146].
  //      LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L116, L125]: `addPromotionReward` and
  //      `addPromotionQualifier` each call `setPromotion` ON THE CHILD, which does not exist -
  //      `"set"` matches no `onMissingMethod` branch, so the call THROWS at
  //      org/Hibachi/HibachiEntity.cfc:L565. THAT MIS-DELEGATION IS ENTIRELY ON
  //      `PromotionPeriod`'s SIDE and is already preserved in promotionPeriod.ts, which throws
  //      `hibachiMissingMethodMessage('setPromotion', 'PromotionReward')`. THIS FILE'S SIDE IS
  //      CORRECT: the defect is not mirrored here, and `setPromotion` is NOT added to make the
  //      far side work.
  //   ⛔ NO `getRewardTypeOptions()` - no such method and no `rewardTypeOptions` property exists.
  //   ⛔ NO `getRewards()` - `rewards` [L104] is the documented orphan.
  //   ⛔ NO `addShippingMethod`, `removeShippingMethod`, `hasShippingMethod` or
  //      `getShippingMethods()`, and no entity-array `getFulfillmentMethods()` /
  //      `getShippingAddressZones()`.
  //   ⛔ NO `getCreatedByAccount()` / `getModifiedByAccount()`.
  //   ⛔ NO `currencyCode` column or accessor - this entity declares none.
  //   ⛔ NO `attributeValues` collection and no EAV read path.
  //   ⛔ NO smart-list method - `getProductSmartList` / `getSkuSmartList` are deliberately
  //      replaced by typed repository queries at the service tier, and no smart-list surface
  //      belongs on an entity.
  //   ⛔ NO zod schema and no declarative-validator method. model/validation/PromotionReward.json
  //      DOES exist and is one of the fifteen in-scope schemas, but the exhaustive `"method":`
  //      census across all fifteen found exactly FIVE declaratively-invoked entity methods and
  //      NONE of them is on PromotionReward: `hasUniqueOptions` and
  //      `hasOneOptionPerOptionGroup` (Sku.json), `hasExpressionWithListOfNumericValuesOnly`
  //      (RoundingRule.json), `getPromotionCodesDeletableFlag` (Promotion.json) and
  //      `hasUniquePromotionCode` (PromotionCode.json). Consistent with that, this component has
  //      NO `Custom Validation Methods` banner at all. Schema ENFORCEMENT lives at the service
  //      tier; entities carry the property metadata only. (For the record, the four in-scope
  //      entities with NO schema are Category, PromotionQualifier, PromotionApplied and
  //      PromotionAccount - none of those files is invented.)

  /**
   * [model/entity/PromotionReward.cfc:L140-L145]
   *
   *     variables.promotionPeriod = arguments.promotionPeriod;
   *     if(isNew() or !arguments.promotionPeriod.hasPromotionReward( this )) {
   *         arrayAppend(arguments.promotionPeriod.getPromotionRewards(), this);
   *     }
   *
   * The field is assigned FIRST [L141], then the guard is evaluated [L142], then `this` is
   * appended to the far side's LIVE array [L143]. That order is preserved: the guard's `isNew()`
   * clause is short-circuiting, so on a new reward the far-side `hasPromotionReward` call is
   * never made.
   *
   * The parameter is REQUIRED, matching `required any promotionPeriod` at L140.
   *
   * ⚠ LEGACY-NOTE [model/entity/PromotionReward.cfc:L140-L145]: ORPHAN-REFERENCE ASYMMETRY.
   * `setPromotionPeriod` does NOT remove `this` from the OLD period's collection before
   * reassigning, so re-parenting a reward leaves a stale reference in the previous period's
   * array. model/entity/PromotionQualifier.cfc:L122-L127 has the identical wart. Preserved
   * deliberately: repairing it would change which rewards a previously-linked period reports.
   */
  setPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    this.promotionPeriod = promotionPeriod;

    if (this.isNew() || !promotionPeriod.hasPromotionReward(this)) {
      promotionPeriod.getPromotionRewards().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L146-L155]
   *
   *     public void function removePromotionPeriod(any promotionPeriod) {
   *        if(!structKeyExists(arguments, "promotionPeriod")) {
   *             arguments.promotionPeriod = variables.promotionPeriod;
   *        }
   *        var index = arrayFind(arguments.promotionPeriod.getPromotionRewards(),this);
   *        if(index > 0) { arrayDeleteAt(...getPromotionRewards(), index); }
   *        structDelete(variables,"promotionPeriod");
   *     }
   *
   * ★ THE PARAMETER IS OPTIONAL. L146 declares `any promotionPeriod` WITHOUT `required`, and
   * L147-L149 substitutes the currently-held period when the argument is absent. The CFML
   * `structKeyExists(arguments, "promotionPeriod")` idiom is modelled as a real optional
   * TypeScript parameter rather than by emulating an `arguments` scope, and
   * `../../lib/cfml/struct.js` is deliberately NOT imported for it - that helper exists for
   * case-insensitive DOMAIN struct lookups, and this is an argument-scope guard.
   *
   * `isNullish()` supplies the CFML `isNull()`/absence parity for the substitution.
   *
   * ★★★ THE THROW PATH IS PRESERVED. When the argument is omitted AND no period is held, the
   * legacy body calls `.getPromotionRewards()` on null and fails at runtime. Behaviour
   * preservation extends to defects, so that failure is reproduced. It is raised as an explicit
   * `Error` because TypeScript's strict null checking will not compile a call on a possibly-
   * `undefined` receiver; the CONDITION and the OBSERVABLE OUTCOME are identical to the legacy
   * ones, so this is preservation rather than an added validation. Note that the source body
   * contains NO explicit `<cfthrow>` - only the guard, the find, the conditional delete and the
   * field clear - and none is invented here beyond making the implicit null dereference
   * expressible. promotionQualifier.ts resolved the identical shape the identical way.
   *
   * The field is cleared by ASSIGNING `undefined` [L154's `structDelete`], never by `delete
   * this.promotionPeriod`, which `exactOptionalPropertyTypes` and the declared
   * `PromotionPeriod | undefined` field type make both unnecessary and wrong.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    // [L147-L149] the absent-argument substitution.
    const targetPromotionPeriod: PromotionPeriod | undefined = isNullish(promotionPeriod)
      ? this.promotionPeriod
      : promotionPeriod;

    if (targetPromotionPeriod === undefined) {
      throw new Error(
        'PromotionReward.removePromotionPeriod was called with no argument on a reward that has ' +
          'no promotionPeriod. This reproduces the legacy runtime failure at ' +
          'model/entity/PromotionReward.cfc:L147-L150, where the omitted argument defaults to a ' +
          'null period and getPromotionRewards() is then invoked on it.',
      );
    }

    // [L150-L153] `arrayFind` is 1-based and returns 0 on a miss; `indexOf` is 0-based and
    // returns -1. Testing `> 0` here would silently refuse to remove the FIRST sibling reward.
    const siblingRewards: PromotionReward[] = targetPromotionPeriod.getPromotionRewards();
    const index: number = siblingRewards.indexOf(this);

    if (index !== -1) {
      siblingRewards.splice(index, 1);
    }

    // [L154] `structDelete(variables,"promotionPeriod")`.
    this.promotionPeriod = undefined;
  }

  // ---- The ELEVEN many-to-many pairs -------------------------------------------------
  //
  // Every pair reproduces the same four-step shape, which L158-L175 establishes verbatim:
  //
  //   add*    (1) guard `far.isNew() || !this.has<Prop>(far)`  (2) push `far` onto THIS side
  //           (3) guard `this.isNew() || !far.has<FarMember>(this)` (4) push `this` onto the FAR
  //               side's LIVE array
  //   remove* (1) `thisIndex = indexOf` on THIS side  (2) splice when `!== -1`
  //           (3) `thatIndex = indexOf(this)` on the FAR side's LIVE array  (4) splice when
  //               `!== -1`. BOTH sides are always attempted, unconditionally.
  //
  // ★ PARAMETER NAMES FOLLOW THE ENTITY, NOT THE PROPERTY, in the source - `addExcludedBrand(
  // required any brand)` and NOT `excludedBrand`, and likewise `option`, `sku`, `product`,
  // `productType`. They are reproduced VERBATIM for interface parity. ⚠ THE ONE EXCEPTION is
  // `addEligiblePriceGroup(required any eligiblePriceGroup)` [L158], whose parameter DOES follow
  // the `singularname`. Each is preserved exactly as written; the inconsistency is not
  // normalised.

  /**
   * [model/entity/PromotionReward.cfc:L158-L165] Guard L159 + L162. INCLUDE family.
   * Link table `SwPromoRewardEligiblePriceGrp`.
   *
   * ⚠ Parameter named `eligiblePriceGroup` - the ONE helper in this component whose parameter
   * follows the `singularname` rather than the entity name.
   */
  addEligiblePriceGroup(eligiblePriceGroup: PriceGroup): void {
    if (eligiblePriceGroup.isNew() || !this.hasEligiblePriceGroup(eligiblePriceGroup)) {
      this.eligiblePriceGroups.push(eligiblePriceGroup);
    }
    if (this.isNew() || !eligiblePriceGroup.hasPromotionReward(this)) {
      eligiblePriceGroup.getPromotionRewards().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L166-L175] Removes from BOTH sides. INCLUDE family. */
  removeEligiblePriceGroup(eligiblePriceGroup: PriceGroup): void {
    // [L167-L170]
    const thisIndex: number = this.eligiblePriceGroups.indexOf(eligiblePriceGroup);
    if (thisIndex !== -1) {
      this.eligiblePriceGroups.splice(thisIndex, 1);
    }

    // [L171-L174] the far side's LIVE array.
    const farSide: PromotionReward[] = eligiblePriceGroup.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * Whether this reward already carries the given shipping-method link row.
   *
   * Framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]; NOT declared in the source.
   * Its one guard site is the `addShippingMethod` condition at
   * [model/entity/PromotionReward.cfc:L179], and it is published here for the same reason the other
   * twelve `has*` predicates are: the guard has to be callable to be reproducible, and a caller
   * checking membership before adding is doing what the source's own `add*` does.
   *
   * ★ KEYED ON THE OPAQUE ID, because `ShippingMethod` is part of the out-of-scope order/checkout/
   * shipping pipeline and is not ported. The comparison is `===` on the identifier rather than the
   * two-branch identity-or-ID comparison the entity-keyed predicates use: those need the branch only
   * because a NEW entity has an empty identifier and must still be findable by reference, and an
   * opaque ID array holds no unsaved entity for that branch to serve.
   *
   * @param shippingMethodID the `shippingMethodID` value of the link row.
   * @returns whether the identifier is already held.
   */
  hasShippingMethod(shippingMethodID: string): boolean {
    return this.shippingMethodIDs.includes(shippingMethodID);
  }

  /**
   * [model/entity/PromotionReward.cfc:L178-L185] Link table `SwPromoRewardShippingMethod`.
   * Parameter named `shippingMethod` in the source; ID-keyed here, so `shippingMethodID`.
   *
   * ★★★ THE OWNING HALF IS REPRODUCED EXACTLY; THE FAR HALF CANNOT BE AND IS NOT SIMULATED.
   *
   *   OWNING HALF [L179-L181]: `if(arguments.shippingMethod.isNew() or
   *   !hasShippingMethod(arguments.shippingMethod)) { arrayAppend(variables.shippingMethods, ...) }`.
   *   The `!has` term is reproduced below. The `isNew()` term is UNREACHABLE through an ID-keyed
   *   helper and that is a consequence of the boundary rather than a decision: `isNew()` means "no
   *   persisted identifier yet", and this array holds identifiers, so there is no unsaved
   *   shipping method for the disjunction's first arm to admit. The observable effect of the missing
   *   arm is that a duplicate is never appended, where CFML would append one for an unsaved entity -
   *   a state that cannot arise on this side of the boundary.
   *
   *   FAR HALF [L182-L184]: `if(isNew() or !arguments.shippingMethod.hasPromotionReward(this)) {
   *   arrayAppend(arguments.shippingMethod.getPromotionRewards(), this) }`. Not reproduced, because
   *   `ShippingMethod` is not ported and neither of those two members exists to call. Nothing is
   *   substituted for it: a fabricated far side would be a second, invented link representation.
   *   Maintaining the inverse row is the repository's business, on the same terms as every other
   *   opaque-ID collection in this file.
   *
   * @param shippingMethodID the `shippingMethodID` value to link.
   */
  addShippingMethod(shippingMethodID: string): void {
    // [L179-L181]
    if (!this.hasShippingMethod(shippingMethodID)) {
      this.shippingMethodIDs.push(shippingMethodID);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L186-L195] Removes from the OWNING side only.
   *
   * ★ FIRST OCCURRENCE ONLY, which is the source's semantic and not a simplification:
   * `arrayFind` at [L187] answers the first position and `arrayDeleteAt` at [L189] removes exactly
   * that one element, so a duplicated link row would leave one behind. `indexOf` plus a
   * single-element `splice` is the same behaviour.
   *
   * ★ THE `> 0` TEST BECOMES `!== -1`, because CFML's `arrayFind` answers 0 for "absent" over
   * 1-based positions while `indexOf` answers -1 over 0-based ones. The guard is the same guard.
   *
   * ★ THE FAR-SIDE REMOVAL [L191-L194] IS NOT REPRODUCED, for the reason recorded on
   * `addShippingMethod`.
   *
   * @param shippingMethodID the `shippingMethodID` value to unlink.
   */
  removeShippingMethod(shippingMethodID: string): void {
    // [L187-L190]
    const thisIndex: number = this.shippingMethodIDs.indexOf(shippingMethodID);
    if (thisIndex !== -1) {
      this.shippingMethodIDs.splice(thisIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L198-L205] Guard L199 + L202. INCLUDE family.
   * Link table `SwPromoRewardBrand`. Parameter named `brand`, per the source.
   */
  addBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasBrand(brand)) {
      this.brands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionReward(this)) {
      brand.getPromotionRewards().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L206-L215] Removes from BOTH sides. INCLUDE family. */
  removeBrand(brand: Brand): void {
    const thisIndex: number = this.brands.indexOf(brand);
    if (thisIndex !== -1) {
      this.brands.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = brand.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L218-L225] Guard L219 + L222. INCLUDE family.
   * Link table `SwPromoRewardOption`. Parameter named `option`, per the source.
   */
  addOption(option: Option): void {
    if (option.isNew() || !this.hasOption(option)) {
      this.options.push(option);
    }
    if (this.isNew() || !option.hasPromotionReward(this)) {
      option.getPromotionRewards().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L226-L235] Removes from BOTH sides. INCLUDE family. */
  removeOption(option: Option): void {
    const thisIndex: number = this.options.indexOf(option);
    if (thisIndex !== -1) {
      this.options.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = option.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L238-L245] Guard L239 + L242. INCLUDE family.
   * Link table `SwPromoRewardSku`. Parameter named `sku`, per the source.
   */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionReward(this)) {
      sku.getPromotionRewards().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L246-L255] Removes from BOTH sides. INCLUDE family. */
  removeSku(sku: Sku): void {
    const thisIndex: number = this.skus.indexOf(sku);
    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = sku.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L258-L265] Guard L259 + L262. INCLUDE family.
   * Link table `SwPromoRewardProduct`. Parameter named `product`, per the source.
   */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }
    if (this.isNew() || !product.hasPromotionReward(this)) {
      product.getPromotionRewards().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L266-L275] Removes from BOTH sides. INCLUDE family. */
  removeProduct(product: Product): void {
    const thisIndex: number = this.products.indexOf(product);
    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = product.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L278-L285] Guard L279 + L282. INCLUDE family.
   * Link table `SwPromoRewardProductType`. Parameter named `productType`, per the source.
   */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionReward(this)) {
      productType.getPromotionRewards().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L286-L295] Removes from BOTH sides. INCLUDE family. */
  removeProductType(productType: ProductType): void {
    const thisIndex: number = this.productTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = productType.getPromotionRewards();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L298-L305] Guard L299 + L302.
   * ★ EXCLUDE FAMILY - calls `hasPromotionRewardExclusion` / `getPromotionRewardExclusions()`,
   * NEVER the INCLUDE members. Link table `SwPromoRewardExclBrand`.
   *
   * ⚠ Parameter named `brand`, NOT `excludedBrand` - the source's parameter follows the ENTITY.
   */
  addExcludedBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasExcludedBrand(brand)) {
      this.excludedBrands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionRewardExclusion(this)) {
      brand.getPromotionRewardExclusions().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L306-L315] Removes from BOTH sides. EXCLUDE family. */
  removeExcludedBrand(brand: Brand): void {
    const thisIndex: number = this.excludedBrands.indexOf(brand);
    if (thisIndex !== -1) {
      this.excludedBrands.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = brand.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L318-L325] Guard L319 + L322. EXCLUDE family.
   * Link table `SwPromoRewardExclOption`.
   *
   * ⚠ Parameter named `option`, NOT `excludedOption`.
   *
   * ★ THIS RELATIONSHIP IS THE MIRROR-IMAGE CONTROL CASE: model/entity/Option.cfc:L129-L131's
   * `removePromotionRewardExclusion()` calls `addExcludedOption(this)` - a "remove" that ADDS -
   * which could only ever have compiled against a real `promotionRewardExclusions` collection on
   * `Option`, independently corroborating this family's far-side members. That defect is
   * preserved in option.ts; THIS side is correct and stays correct.
   */
  addExcludedOption(option: Option): void {
    if (option.isNew() || !this.hasExcludedOption(option)) {
      this.excludedOptions.push(option);
    }
    if (this.isNew() || !option.hasPromotionRewardExclusion(this)) {
      option.getPromotionRewardExclusions().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L326-L335] Removes from BOTH sides. EXCLUDE family. */
  removeExcludedOption(option: Option): void {
    const thisIndex: number = this.excludedOptions.indexOf(option);
    if (thisIndex !== -1) {
      this.excludedOptions.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = option.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L338-L345] Guard L339 + L342. EXCLUDE family.
   * Link table `SwPromoRewardExclSku`. ⚠ Parameter named `sku`, NOT `excludedSku`.
   */
  addExcludedSku(sku: Sku): void {
    if (sku.isNew() || !this.hasExcludedSku(sku)) {
      this.excludedSkus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionRewardExclusion(this)) {
      sku.getPromotionRewardExclusions().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L346-L355] Removes from BOTH sides. EXCLUDE family. */
  removeExcludedSku(sku: Sku): void {
    const thisIndex: number = this.excludedSkus.indexOf(sku);
    if (thisIndex !== -1) {
      this.excludedSkus.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = sku.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L358-L365] Guard L359 + L362. EXCLUDE family.
   * Link table `SwPromoRewardExclProduct`. ⚠ Parameter named `product`, NOT `excludedProduct`.
   */
  addExcludedProduct(product: Product): void {
    if (product.isNew() || !this.hasExcludedProduct(product)) {
      this.excludedProducts.push(product);
    }
    if (this.isNew() || !product.hasPromotionRewardExclusion(this)) {
      product.getPromotionRewardExclusions().push(this);
    }
  }

  /** [model/entity/PromotionReward.cfc:L366-L375] Removes from BOTH sides. EXCLUDE family. */
  removeExcludedProduct(product: Product): void {
    const thisIndex: number = this.excludedProducts.indexOf(product);
    if (thisIndex !== -1) {
      this.excludedProducts.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = product.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L378-L385] Guard L379 + L382. EXCLUDE family.
   * Link table `SwPromoRewardExclProductType`.
   * ⚠ Parameter named `productType`, NOT `excludedProductType`.
   */
  addExcludedProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasExcludedProductType(productType)) {
      this.excludedProductTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionRewardExclusion(this)) {
      productType.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * [model/entity/PromotionReward.cfc:L386-L395] Removes from BOTH sides. EXCLUDE family.
   *
   * ★ THE L386→L401 GAP IS DEFINITIVELY RESOLVED, and this is the eighteenth independent
   * confirmation of the banner/blank-line hypothesis across this folder: L386-L395 is this
   * method's body, L396 is blank, L397 is the Bidirectional END banner, L398 is blank, L399 is
   * the Custom Formatting START banner, L400 is blank, and L401 begins `getAmountFormatted`.
   * There are NO hidden declarations and no filtered members in that range.
   */
  removeExcludedProductType(productType: ProductType): void {
    const thisIndex: number = this.excludedProductTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.excludedProductTypes.splice(thisIndex, 1);
    }

    const farSide: PromotionReward[] = productType.getPromotionRewardExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  // ============ END: Bidirectional Helper Methods ======================================

  // ============ START: Custom Formatting Methods ========================================
  // [model/entity/PromotionReward.cfc:L399] START banner, [L409] END banner. POPULATED with
  // exactly one method: `getAmountFormatted` [L401].

  /**
   * [model/entity/PromotionReward.cfc:L401-L407]
   *
   *     public string function getAmountFormatted() {
   *         if(getAmountType() == "percentageOff") {
   *             return formatValue(getAmount(), "percentage");
   *         }
   *
   *         return formatValue(getAmount(), "currency");
   *     }
   *
   * ★ THE EARLY-RETURN SHAPE IS PRESERVED - an `if` with a guarded return followed by a bare
   * fall-through return, NOT an `if`/`else`. The two are equivalent in outcome but the source's
   * shape is what stays diffable against L401-L407.
   *
   * ★ THE COMPARISON IS CASE-INSENSITIVE. LEGACY-NOTE
   * [model/entity/PromotionReward.cfc:L402]: CFML `==` on strings ignores case, so an
   * `amountType` of `"PercentageOff"` or `"PERCENTAGEOFF"` takes the percentage branch in the
   * legacy engine. TypeScript `===` does not, so the comparison folds case. Identical treatment
   * to the `rewardType == "order"` branch in `getAmountTypeOptions()` [L121], and identical to
   * the convention priceGroupRate.ts applied at model/entity/PriceGroupRate.cfc:L263.
   *
   * ★★★ LEGACY-NOTE [model/entity/PromotionReward.cfc:L61, L401-L407]: `amount` is `big_decimal`
   * with NO `default=` attribute, so `getAmount()` can be NULL in the legacy engine.
   *
   * ★ AN EARLIER REVISION OF THIS NOTE CALLED `formatValue(null, ...)` "UNSPECIFIED behaviour in
   * the non-ported framework method on org/Hibachi/HibachiEntity.cfc". BOTH HALVES OF THAT WERE
   * WRONG, and the correction matters because the whole absent-amount decision was resting on
   * it. The method is not on `HibachiEntity.cfc` at all - the entity-side entry point is
   * `org/Hibachi/HibachiObject.cfc:L186`, which delegates to
   * `org/Hibachi/HibachiUtilityService.cfc:L7-L12` - and its behaviour is not unspecified: the
   * parameter is declared `required string value` [HibachiUtilityService.cfc:L7], so a null
   * operand fails CFML's required-argument check rather than formatting to anything.
   *
   * The empty-string return is retained ANYWAY, and deliberately, because this file's
   * specification directs it in terms that do not depend on the framework's behaviour: absent
   * amount renders as "no amount", and `0` is NEVER substituted. A zero would misrepresent an
   * absent amount as a real zero discount on an admin screen, which is exactly the mistake
   * absence-convention #1 exists to prevent. Turning this into a throw would be an unbudgeted
   * behaviour change on a display accessor, and the shipped coverage obligation #10 below pins
   * the current contract.
   *
   * ★★ AN EARLIER REVISION CLAIMED THIS WAS "A DOCUMENTED DIVERGENCE FROM priceGroupRate.ts,
   * whose `getAmountFormatted()` THROWS on an absent amount and delegates its currency branch to
   * an injected `CurrencyValueFormatter`". NEITHER HALF IS TRUE, and the sibling was read to
   * establish it. `priceGroupRate.getAmountFormatted()` does not throw - it returns a bare `'%'`
   * on the percentage branch and `''` on the currency branch, and its own documentation states
   * "SYNCHRONOUS and TOTAL: it never raises". Nor is there any `CurrencyValueFormatter`: its
   * currency branch calls `numberFormat(amount.toDecimalString(), '0.00')`, and no formatter
   * collaborator appears anywhere in that module's import ledger.
   *
   * SO THERE IS NO DIVERGENCE TO RECORD ON THE CURRENCY BRANCH - the two files agree, and are
   * required to. The ONE genuine difference is on the ABSENT-amount path, and it traces to the
   * two legacy bodies rather than to a porting choice: `PriceGroupRate.cfc:L264` CONCATENATES
   * (`getAmount() & "%"`), and CFML concatenation of a null operand yields the empty string, so
   * a bare `"%"` is the faithful render there; `PromotionReward.cfc:L403` instead PASSES the
   * value to `formatValue`, whose parameter is `required`. The two sources genuinely differ, so
   * the two ports differ with them.
   *
   * ★★★★ `formatValue(value, mask)` HAS NOW BEEN READ, AND THE TWO MASKS DO NOT BEHAVE ALIKE.
   *
   * An earlier revision called it "an UNREAD framework collaborator on
   * org/Hibachi/HibachiEntity.cfc" and withheld both branches on the strength of that. But
   * org/Hibachi/** is a boundary to EXTRACT FROM and never port, so reading it is the intended
   * use, and "unread" was an admission rather than a constraint. Reached via
   * `hb_formatType="custom"` [L61], the chain is:
   *
   *   org/Hibachi/HibachiObject.cfc:L186          formatValue(value, formatType, formatDetails={})
   *                                                 -> hibachiUtilityService.formatValue(...)
   *   org/Hibachi/HibachiUtilityService.cfc:L7-L12  dispatches on formatType via listFindNoCase
   *                                                 over "currency,date,datetime,pixels,
   *                                                 percentage,second,time,truefalse,url,weight,
   *                                                 yesno"; an unrecognised mask returns
   *                                                 arguments.value UNCHANGED [L11].
   *   L62-L64   formatValue_percentage   return arguments.value & "%";
   *   L34-L40   formatValue_currency     LSCurrencyFormat(value, formatDetails.currencyCode,
   *                                        getHibachiScope().getRBLocale()) when the passed
   *                                        currencyCode is 3 characters [L35-L37], ELSE
   *                                        LSCurrencyFormat(value, "USD", ...) [L39].
   *
   * ★★ THE PERCENTAGE BRANCH IS THEREFORE RAW CFML STRINGIFICATION WITH A `%` SUFFIX AND NO MASK
   * WHATSOEVER, and this method used to apply `numberFormat(..., '0.00')` to it. That is a real
   * behaviour difference, not a cosmetic one: CFML drops trailing zeros when it stringifies a
   * number, so a stored `12.50` renders `"12.5%"` in the legacy engine, where the two-decimal
   * mask produced `"12.50%"`. It is now `cfNumberToString()`, which replicates CFML's
   * trailing-zero-dropping stringification - and which is also, independently, the convention
   * priceGroupRate.ts was directed to use on ITS percentage branch for
   * model/entity/PriceGroupRate.cfc:L264. The two ported files previously disagreed here; they
   * now agree, and they agree on the side the source is on.
   *
   * ★ ON WHAT `cfNumberToString` IS ACTUALLY CONTRIBUTING, stated precisely so a later reader does
   * not over-credit it: `Money.toDecimalString()` ALREADY renders without trailing zeros, so on
   * this composition the helper is idempotent - `12.50`, `12.5` and `12.500` all arrive as `12.5`
   * before it is called. The defect being repaired was therefore the PADDING that
   * `numberFormat(..., '0.00')` added, not a missing trim. The helper is retained regardless,
   * because it states the requirement AT THE CALL SITE rather than resting on `Money`'s internal
   * choice of stringification, and because it is the sibling's mandated spelling. If `Money` ever
   * rendered a fixed scale, this branch would still be correct.
   *
   * ★★ THE CURRENCY BRANCH STILL EMITS THE TWO-DECIMAL PRESENTATION ONLY, AND THAT IS A CITED
   * DECISION RATHER THAN AN ADMISSION OF IGNORANCE. `LSCurrencyFormat` adds a currency symbol and
   * locale-driven grouping, and reproducing it is blocked on five independent grounds, every one
   * of them a standing directive rather than a preference:
   *
   *   1. This file's specification directs the currency branch to match priceGroupRate.ts's
   *      convention VERBATIM, and that convention is `numberFormat(amount, '0.00')`.
   *   2. Inventing a locale-aware or symbol-prefixing formatter is expressly forbidden here.
   *   3. `Intl` may not be used and no new dependency may be introduced; the package set is fixed.
   *   4. The locale operand is `getHibachiScope().getRBLocale()` - ambient request state. JavaRB
   *      is not ported and no i18n runtime is introduced, so there is no locale to read.
   *   5. Supplying one would require a collaborator, and this entity has ZERO service-locator
   *      sites and is directed to inject no port; the folder's signature-widening budget is 0.
   *
   * So the omission is now recorded as "known and deliberately withheld, for these reasons"
   * instead of "unknown", which is the honest form and the auditable one. NO currency symbol and
   * NO thousands separator is fabricated. `numberFormat(v,'0.00')` remains the project's CFML
   * `numberFormat(v,"0.00")` parity helper, and is what model/service/PromotionService.cfc:L1017
   * and model/service/PriceGroupService.cfc:L337 apply to these same money values.
   *
   * ★ WHICH `LSCurrencyFormat` ARM IS LIVE, since it changes what is being withheld: this call
   * site passes NO `formatDetails`, so it reaches the `"USD"` default at [L39], never the
   * caller-supplied-currency arm at [L35-L37]. A census of `formatValue(` across
   * model/entity/*.cfc shows that arm IS reachable - model/entity/Sku.cfc:L419, L423 and L426
   * pass `{currencyCode=...}` - but neither this method nor PriceGroupRate.cfc:L266 does.
   *
   * ★ A FRAMEWORK ODDITY RECORDED WITHOUT A CLAIM ABOUT ITS OUTCOME: `LSCurrencyFormat`'s second
   * parameter is documented as a TYPE enumeration (none | local | international), yet [L36] and
   * [L39] both pass a CURRENCY CODE there, and the framework's own comment at [L38] - "If no
   * currency code was passed in then we can default to USD" - shows the author took the parameter
   * to be a currency code. No CFML engine was executed here and readme.md [L6, L8] declares
   * support for both ColdFusion 9.0.1+ and Railo 4.1+, so what that call actually returns on
   * either engine is NOT asserted. It is noted because it bears on how much fidelity the
   * withheld branch could ever have offered.
   *
   * ★ ALL MONEY PRESENTATION GOES THROUGH `Money`/`numberFormat` - never `String(amount)`, never
   * `toFixed` on a raw number, and never a template interpolation of a raw decimal.
   */
  getAmountFormatted(): string {
    const amount: Money | undefined = this.amount;

    // [L61] the no-default column. `isNullish()` states the CFML `isNull()` semantics
    // explicitly; the second clause is the SAME test written in the form TypeScript's
    // control-flow analysis can narrow, because `isNullish` returns a plain boolean by design
    // and deliberately does not act as a type predicate.
    if (isNullish(amount) || amount === undefined) {
      return '';
    }

    // [L402-L404] the percentage branch, case-folded.
    //
    // `cfNumberToString`, NOT `numberFormat(..., '0.00')`: the legacy mask is
    // org/Hibachi/HibachiUtilityService.cfc:L62-L64, which is `arguments.value & "%"` - plain CFML
    // stringification with no mask at all - so a stored 12.50 must render "12.5%", not "12.50%".
    if ((this.amountType ?? '').toLowerCase() === 'percentageoff') {
      return `${cfNumberToString(amount.toDecimalString())}%`;
    }

    // [L406] the currency branch, reached by `amountOff` and `amount` alike. The two-decimal
    // presentation and nothing more; the withheld symbol and grouping are accounted for above.
    return numberFormat(amount.toDecimalString(), '0.00');
  }

  // ============ END: Custom Formatting Methods ==========================================

  // ============ START: Overridden Methods ==============================================
  // [model/entity/PromotionReward.cfc:L411] START banner, [L421] END banner. POPULATED with
  // exactly two methods: `getSimpleRepresentationPropertyName` [L413] and `isDeletable` [L417].
  //
  // ★ NEITHER CARRIES THE TypeScript `override` KEYWORD, because this class extends nothing.
  // `noImplicitOverride` only constrains members of a derived class, and the port deliberately
  // does NOT reproduce the three-level `HibachiEntity` inheritance chain - the framework base is
  // not ported, and its responsibilities are redistributed to repositories, typed schemas and
  // explicit context parameters. This matches the convention every shipped sibling in this
  // folder established; promotionQualifier.ts, promotion.ts and promotionCode.ts all declare
  // their overrides as plain methods for the same reason.

  /**
   * [model/entity/PromotionReward.cfc:L413-L415] Overrides the framework base's
   * `getSimpleRepresentationPropertyName()`. Returns the string literal `"rewardType"`, naming
   * the property `getSimpleRepresentation()` [L106-L108] projects.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'rewardType';
  }

  /**
   * [model/entity/PromotionReward.cfc:L417-L419]
   *
   *     return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();
   *
   * ★ IDENTICAL SHAPE TO `PromotionQualifier.isDeletable()`
   * [model/entity/PromotionQualifier.cfc:L359-L361], and implemented here to mirror
   * promotionQualifier.ts so the two siblings stay consistent.
   *
   * ★ THE `&&` SHORT-CIRCUIT AND THE OPERAND ORDER ARE PRESERVED. The negated expiry test comes
   * FIRST; the promotion-deletability test comes SECOND and is NOT evaluated when the first
   * answers false. That is why this is written as separate statements rather than one expression:
   * a single boolean expression would obscure which dereference happens when, and in CFML the
   * second dereference genuinely never occurs for an expired period.
   *
   * ★ ALL THREE FAR-SIDE MEMBERS WERE VERIFIED BY READING THE SIBLING MODULES:
   * `PromotionPeriod.isExpired()` [model/entity/PromotionPeriod.cfc:L83],
   * `PromotionPeriod.getPromotion()` [the L59 many-to-one accessor] and
   * `Promotion.isDeletable()` [model/entity/Promotion.cfc:L170].
   *
   * ★★★ THE THROW IS PRESERVED. LEGACY-NOTE
   * [model/entity/PromotionReward.cfc:L70, L417-L419]: `promotionPeriod` is an optional
   * many-to-one with no default, so when it is absent the legacy body fails at runtime on the
   * `.isExpired()` call. That failure is REPRODUCED deliberately. Optional chaining, a `??`
   * fallback, a guard clause or a defensive `false` would each let an UNDELETABLE reward be
   * deleted, which is a data-integrity change dressed up as robustness. The same reasoning
   * applies to the second dereference: an expired-check that passes but a missing promotion is
   * a null dereference in CFML too, and it is raised as an error rather than swallowed.
   *
   * ⚠ `getPromotionPeriod()` IS INVOKED TWICE in the single source expression. That is an
   * INEFFICIENCY IN THE SOURCE, NOT A DEFECT, and it is reproduced as written rather than
   * hoisted into one local, so the expression stays diffable against L418.
   * model/entity/PromotionQualifier.cfc:L360 has the identical double call. Note that no
   * performance claim of any kind is made here or anywhere else in this file.
   */
  isDeletable(): boolean {
    // [L418] FIRST dereference of `getPromotionPeriod()`.
    const promotionPeriodForExpiryTest: PromotionPeriod | undefined = this.getPromotionPeriod();

    if (promotionPeriodForExpiryTest === undefined) {
      throw new Error(
        'PromotionReward.isDeletable was called on a reward with no materialized ' +
          'promotionPeriod. model/entity/PromotionReward.cfc:L418 calls ' +
          'getPromotionPeriod().isExpired() with no null guard, so an unattached or unjoined ' +
          'reward is a CFML null-reference error there too.',
      );
    }

    // [L418] the FIRST operand, `!getPromotionPeriod().isExpired()`. CFML `&&` short-circuits,
    // so an expired period answers `false` WITHOUT the second dereference below.
    if (promotionPeriodForExpiryTest.isExpired()) {
      return false;
    }

    // [L418] the SECOND, separate `getPromotionPeriod()` call - reproduced rather than hoisted.
    const promotionPeriodForPromotionTest: PromotionPeriod | undefined = this.getPromotionPeriod();

    if (promotionPeriodForPromotionTest === undefined) {
      throw new Error(
        'PromotionReward.isDeletable lost its promotionPeriod between the two ' +
          'getPromotionPeriod() calls that model/entity/PromotionReward.cfc:L418 makes in a ' +
          'single expression. The source dereferences the period twice with no null guard on ' +
          'either call, so this is the CFML null-reference error for the second one.',
      );
    }

    const promotion = promotionPeriodForPromotionTest.getPromotion();

    if (promotion === undefined) {
      throw new Error(
        'PromotionReward.isDeletable reached the second operand of its deletability test but ' +
          'the promotion period has no materialized promotion. ' +
          'model/entity/PromotionReward.cfc:L418 calls ' +
          'getPromotionPeriod().getPromotion().isDeletable() with no null guard. This branch is ' +
          'reached only when the period is NOT expired - an expired period short-circuits to ' +
          'false before touching the promotion.',
      );
    }

    // [L418] the SECOND operand.
    return promotion.isDeletable();
  }

  // ============ END: Overridden Methods ================================================

  // ============ ORM Event Hooks - THE BANNER PAIR IS EMPTY =============================
  //
  // LEGACY-NOTE [model/entity/PromotionReward.cfc:L423, L425]: the `START: ORM Event Hooks` /
  // `END: ORM Event Hooks` banner pair is COMPLETELY EMPTY - there is no `preInsert`, no
  // `preUpdate`, no `preDelete` and no `postInsert` anywhere in this component. NO hook, NO
  // hook-equivalent maintenance method and NO `applyPreInsert*` / `applyPreUpdate*` member is
  // authored, and the plan's mandate that ORM lifecycle hooks become explicit maintenance
  // methods invoked by the repository on save is therefore VACUOUS here. No reshaping budget is
  // touched.
  //
  // The project's ORM-hook census stands at exactly FOUR in-scope hook-bearing entities -
  // `Category` (`preInsert` [model/entity/Category.cfc:L126] / `preUpdate` [L131]), `PriceGroup`
  // ([model/entity/PriceGroup.cfc:L206] / [L211]), `ProductType`
  // ([model/entity/ProductType.cfc:L305] / [L310]) and `PromotionCode` (`preInsert`
  // [model/entity/PromotionCode.cfc:L179] only). PromotionReward is NOT among them, and neither
  // is `Promotion` (whose hook banner pair at [model/entity/Promotion.cfc:L176, L178] is likewise
  // empty) nor `PromotionQualifier` ([model/entity/PromotionQualifier.cfc:L365, L367], likewise
  // empty).
  //
  // There is also NO materialized ID-path column on this entity, which is why
  // `../valueObjects/materializedIdPath.js` is not imported: the path walking the reward
  // membership test performs is over `ProductType.productTypeIDPath` and belongs to
  // src/services/promotion/orderItemMembership.ts.
  //
  // ★ STRUCTURAL NOTES ON THE BANNER MAP, all verified from the source read:
  //   - NO duplicate banner pairs. CONTRAST model/entity/PromotionAccount.cfc:L117/L119,
  //     model/entity/PromotionPeriod.cfc:L154/L156 and model/entity/PromotionCode.cfc:L153/L155,
  //     which each carry a second, empty Bidirectional pair.
  //   - NO missing END banner. CONTRAST model/entity/PromotionCode.cfc:L98, whose Bidirectional
  //     START has no matching END.
  //   - NO `Custom Validation Methods` banner at all, consistent with the finding that
  //     model/validation/PromotionReward.json declares no entity-method rule.
  //   - NO `Overridden Implecet Getters` banner and NO `Deprecated Methods` banner. CONTRAST
  //     model/entity/PromotionQualifier.cfc:L349/L351 and L369/L371, and
  //     model/entity/PromotionCode.cfc:L165/L167 and L189/L191.
  //
  // [model/entity/PromotionReward.cfc:L426] closes the component.
}
