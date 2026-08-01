/**
 * `productUpdateSkus.rules.ts` — the typed transliteration of
 * `model/validation/Product_UpdateSkus.json` (13 lines, REFERENCE-ONLY).
 *
 * AAP 0.4.1.5 makes this file CREATE against it: "The two conditional rule groups keyed on the update
 * flags", detailed at AAP 0.2.1.5 as "`price` required only when `updatePriceFlag eq 1`, `listPrice`
 * only when `updateListPriceFlag eq 1`". It is the seventh rule file in this folder and the only one
 * that selects rules by CONDITION rather than by CONTEXT.
 *
 * SELECTION SEMANTICS `../Validator` implements, and which this file must not reimplement: a rule's
 * condition list is comma-delimited; OR ACROSS conditions, one satisfied condition being enough
 * [`org/Hibachi/HibachiValidationService.cfc:L124-L126`]; AND WITHIN a condition, every predicate
 * having to hold [:L110-L121] with NO short-circuit, since [:L118] records the failure and keeps
 * looping; and an undeclared name is SKIPPED [:L108], so if it was the only name listed the gate
 * evaluates false [:L130]. An unrecognised constraint kind INSIDE A CONDITION is SILENTLY IGNORED
 * ([:L117] tests for the evaluator first), while in the MAIN RULE PATH it RAISES at [:L202].
 *
 * ⚠️ STALE-LOCATOR CORRECTION, recorded here because editing another module is out of this file's
 * hands: `../Validator`'s prose cites that raise at `L212`. It is at **L202**; `L212-L218` is the
 * persistence branch choosing between the two class-name prefixes — the branch that gives THIS document
 * its process-object prefix. The off-list type-value raise is at **L263**. `../Validator`'s
 * implementation cites `:L201-L203` and `:L263` correctly; only its prose carries the stale number.
 *
 * ⭐⭐ NO CONTEXT LIST IS DECLARED, AND THAT IS DECISIVE. The legacy gate reads
 * `if(!structKeyExists(rule,"contexts") || listFindNoCase(rule.contexts, arguments.context))` at
 * [`org/Hibachi/HibachiValidationService.cfc:L71`], so A RULE WITH NO CONTEXT LIST APPLIES IN EVERY
 * CONTEXT. Four of the nine reachable contexts are runtime-only and appear in no document at all — the
 * empty default [:L153, via `org/Hibachi/HibachiTransient.cfc:L408`], `edit`
 * [`org/Hibachi/HibachiEntity.cfc:L215`], `process` [:L224] and `updateSkus`
 * [`org/Hibachi/HibachiService.cfc:L114`] — and under any of those ONLY rules lacking a context list
 * fire, which across all seven documents means only the two declared here. ⛔ DO NOT ADD A CONTEXT LIST
 * "FOR CLARITY": pinning these to `updateSkus` would stop them firing in six of the nine contexts.
 *
 * ⭐ THE TWO-PASS PROCESS FLOW, invisible from the document itself.
 * `org/Hibachi/HibachiService.cfc` validates TWICE on a process call: [:L96] validates THE ENTITY under
 * the process context and [:L108] validates THE PROCESS OBJECT under the same context string. So under
 * `updateSkus` the ENTITY pass validates `Product` and ZERO RULES FIRE, every rule in
 * `model/validation/Product.json` declaring a context list; the PROCESS-OBJECT pass validates
 * `Product_UpdateSkus` and BOTH rules here fire, gated solely by their conditions.
 *
 * ⭐⭐⭐ THE ABSENCE CHAIN — THE MOST IMPORTANT BEHAVIOURAL FINDING IN THIS FILE. When
 * `updatePriceFlag` is ABSENT, loose equality FAILS on an absent value
 * [`org/Hibachi/HibachiValidationService.cfc:L385-L395`, null guard at :L387-L390], so the price
 * condition is UNMET; and because the legacy flattening copies a rule's condition list onto each of its
 * flattened constraint records [:L83-L85], NEITHER the presence constraint NOR the numeric constraint
 * fires. ⇒ AN ABSENT `updatePriceFlag` MEANS `price` IS NOT MERELY UN-REQUIRED BUT ENTIRELY
 * UNVALIDATED: non-numeric garbage passes completely, and the chain applies symmetrically to
 * `updateListPriceFlag` and `listPrice`. An unmet condition produces NO ERROR AT ALL but silence.
 * ⛔ Per AAP 0.8.2 Guideline 4, do not add an unconditional numeric constraint "as a safety net", do not
 * add any rule to either flag (they carry none and are only condition predicates), and do not default an
 * absent flag. Absence must stay OBSERVABLE — which is why
 * `../../domain/process/ProductUpdateSkus` models the process object as an INTERFACE WITH ALL-OPTIONAL
 * FIELDS rather than a class: under ES2022 class-field semantics a class would emit undefined-valued own
 * properties and destroy the distinction this chain depends on.
 *
 * ⭐ AAP 0.2.1.5's subtlety that must not be mistaken for an omission: THERE IS NO
 * `Product_AddOption.json` AND NO `Product_AddOptionGroup.json` — verified first-hand. Those two
 * process contexts are governed by context-scoped rules inside `Product.json` (the `:L4` `inList` gate
 * on `baseProductType`, the `:L14` `minCollection` on unused option GROUPS and the `:L13`
 * `minCollection` on unused OPTIONS), declared in `./product.rules`, not here. ⛔ SEVEN RULE FILES, NOT
 * NINE: do not create `productAddOption.rules.ts` or `productAddOptionGroup.rules.ts`, and do not move
 * these two rules into `./product.rules`.
 *
 * ⭐ THIS FILE'S RULES REFERENCE NO PERSISTENT COLUMN — uniquely among the seven. The subject is a
 * TRANSIENT process object (`model/process/Product_UpdateSkus.cfc:L49` declares no persistence, no
 * entity name and no table), so there is NO SCHEMA-LEVEL BACKSTOP OF ANY KIND: no unique index, no
 * column length, no not-null attribute, no cascade. THE DECLARATIONS BELOW ARE THE COMPLETE AND SOLE
 * ENFORCEMENT MECHANISM, there is no delete guard here at all, and nothing is memoised (M7 requires
 * request-scoped rather than module-scoped caching, and caching nothing is the simplest compliance).
 *
 * @see model/validation/Product_UpdateSkus.json — the transliterated source document
 * @see model/process/Product_UpdateSkus.cfc — the process object whose properties these rules name
 * @see `../Validator` — the evaluation semantics every declaration below relies on
 */

import type {
  ProductUpdateSkus,
  ProductUpdateSkusPropertyName,
} from '../../domain/process/ProductUpdateSkus';
import type {
  EqualityConstraint,
  NumericDataTypeConstraint,
  PropertyValidation,
  RequiredConstraint,
  ValidationCondition,
  ValidationRule,
  ValidationRuleSet,
  ValidationSubject,
} from '../Validator';

export type ProductUpdateSkusValidationSubject = ValidationSubject &
  Readonly<
    Pick<ProductUpdateSkus, 'updatePriceFlag' | 'price' | 'updateListPriceFlag' | 'listPrice'>
  >;

export const PRODUCT_UPDATE_SKUS_PRICE_RB_KEY = 'entity.sku.price';

export const PRODUCT_UPDATE_SKUS_LIST_PRICE_RB_KEY = 'entity.sku.listPrice';

const UPDATE_SKUS_MESSAGE_SEGMENT = 'updateSkus';

const PROCESS_OBJECT_CLASS_NAME = 'Product_UpdateSkus';

export const PRICE_REQUIRED_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.price.required` as const;

export const PRICE_DATA_TYPE_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.price.dataType.numeric` as const;

export const LIST_PRICE_REQUIRED_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.listPrice.required` as const;

export const LIST_PRICE_DATA_TYPE_MESSAGE_KEY =
  `validate.${UPDATE_SKUS_MESSAGE_SEGMENT}.${PROCESS_OBJECT_CLASS_NAME}.listPrice.dataType.numeric` as const;

const PRICE_PROPERTY = 'price' satisfies ProductUpdateSkusPropertyName;

const LIST_PRICE_PROPERTY = 'listPrice' satisfies ProductUpdateSkusPropertyName;

const UPDATE_PRICE_FLAG_PROPERTY = 'updatePriceFlag' satisfies ProductUpdateSkusPropertyName;

const UPDATE_LIST_PRICE_FLAG_PROPERTY =
  'updateListPriceFlag' satisfies ProductUpdateSkusPropertyName;

export const SHOW_PRICE_CONDITION_NAME = 'showPrice';

export const SHOW_LIST_PRICE_CONDITION_NAME = 'showListPrice';

export const updatePriceFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: 1,
} as const) satisfies EqualityConstraint;

export const updateListPriceFlagEqualityConstraint = Object.freeze({
  constraintType: 'eq',
  constraintValue: 1,
} as const) satisfies EqualityConstraint;

/**
 * `showPrice` — met when the update-price flag equals one.
 * [`model/validation/Product_UpdateSkus.json:L3-L5`]
 */
export const showPriceCondition = Object.freeze({
  name: SHOW_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    Object.freeze({
      propertyIdentifier: UPDATE_PRICE_FLAG_PROPERTY,
      read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.updatePriceFlag,
      constraint: updatePriceFlagEqualityConstraint,
    } as const),
  ] as const),
} as const) satisfies ValidationCondition<ProductUpdateSkusValidationSubject>;

/**
 * `showListPrice` — met when the update-list-price flag equals one.
 * [`model/validation/Product_UpdateSkus.json:L6-L8`]
 *
 * INDEPENDENT OF ITS SIBLING: one flag being met has no effect on the other price's rule.
 */
export const showListPriceCondition = Object.freeze({
  name: SHOW_LIST_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    Object.freeze({
      propertyIdentifier: UPDATE_LIST_PRICE_FLAG_PROPERTY,
      read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.updateListPriceFlag,
      constraint: updateListPriceFlagEqualityConstraint,
    } as const),
  ] as const),
} as const) satisfies ValidationCondition<ProductUpdateSkusValidationSubject>;

export const productUpdateSkusConditions = Object.freeze([
  showPriceCondition,
  showListPriceCondition,
] as const);

/**
 * `price` must be PRESENT — when, and only when, its condition is met.
 *
 * [`model/validation/Product_UpdateSkus.json:L11`]
 * `"price": [{"conditions":"showPrice","dataType":"numeric","required":true}]`
 *
 * PRESENCE SEMANTICS (`org/Hibachi/HibachiValidationService.cfc:L240-L246`): absent FAILS; the EMPTY
 * STRING FAILS, because the trimmed-length test sits inside the predicate; whitespace-only FAILS for
 * the same reason; and ⭐ ZERO PASSES in both its numeric and its string form, being a non-empty simple
 * value — A PRICE OF ZERO IS VALID. ⛔ Do NOT add a falsy, positivity or truthiness guard: on a price
 * field that is the most tempting "improvement" available and it would reject zero-priced SKUs.
 */
export const updateSkusPriceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `price` must additionally be NUMERIC — the second constraint of the same rule object.
 * [`model/validation/Product_UpdateSkus.json:L11`]
 *
 * ⭐ IT PASSES ON AN ABSENT VALUE (`org/Hibachi/HibachiValidationService.cfc:L256-L266` short-circuits
 * on absence at `:L259`), SO THE NULL PATH IS GUARDED BY THE PRESENCE CONSTRAINT ALONE. That division
 * of labour is why the document pairs the two on one property: presence admits any non-empty simple
 * value including a word, and the type check admits nothing at all when the value is missing.
 *
 * An off-whitelist type value raises at `:L263` — a DIFFERENT raise from the unknown-constraint one at
 * `:L202`. `../Validator` closes the same door at COMPILE time by narrowing the type value.
 */
export const updateSkusPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies NumericDataTypeConstraint;

/**
 * `listPrice` must be PRESENT — when, and only when, its own condition is met.
 *
 * [`model/validation/Product_UpdateSkus.json:L12`]
 * `"listPrice": [{"conditions":"showListPrice","dataType":"numeric","required":true}]`
 *
 * ⭐ CONTRAST WITH THE SKU DOCUMENT: the SKU list price is NOT required
 * (`model/validation/Sku.json:L4` declares only a numeric check and a floor), whereas this one IS. The
 * divergence is transcribed rather than harmonised.
 */
export const updateSkusListPriceRequiredConstraint = Object.freeze({
  constraintType: 'required',
  constraintValue: true,
} as const) satisfies RequiredConstraint;

/**
 * `listPrice` must additionally be NUMERIC — the second constraint of its rule object.
 * [`model/validation/Product_UpdateSkus.json:L12`]
 *
 * Passes on an absent value, exactly as {@link updateSkusPriceDataTypeConstraint} does, and is
 * therefore inert on the null path.
 */
export const updateSkusListPriceDataTypeConstraint = Object.freeze({
  constraintType: 'dataType',
  constraintValue: 'numeric',
} as const) satisfies NumericDataTypeConstraint;

/**
 * The price rule — gated on `showPrice`, ungated by context.
 * [`model/validation/Product_UpdateSkus.json:L11`]
 */
export const priceConditionalRule = Object.freeze({
  conditions: SHOW_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    updateSkusPriceDataTypeConstraint,
    updateSkusPriceRequiredConstraint,
  ] as const),
} as const) satisfies ValidationRule<ProductUpdateSkusValidationSubject>;

/**
 * The list-price rule — gated on `showListPrice`, ungated by context.
 * [`model/validation/Product_UpdateSkus.json:L12`]
 */
export const listPriceConditionalRule = Object.freeze({
  conditions: SHOW_LIST_PRICE_CONDITION_NAME,
  constraints: Object.freeze([
    updateSkusListPriceDataTypeConstraint,
    updateSkusListPriceRequiredConstraint,
  ] as const),
} as const) satisfies ValidationRule<ProductUpdateSkusValidationSubject>;

export const updateSkusPriceValidation = Object.freeze({
  propertyIdentifier: PRICE_PROPERTY,
  read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.price,
  rules: Object.freeze([priceConditionalRule] as const),
} as const) satisfies PropertyValidation<ProductUpdateSkusValidationSubject>;

export const updateSkusListPriceValidation = Object.freeze({
  propertyIdentifier: LIST_PRICE_PROPERTY,
  read: (subject: ProductUpdateSkusValidationSubject): unknown => subject.listPrice,
  rules: Object.freeze([listPriceConditionalRule] as const),
} as const) satisfies PropertyValidation<ProductUpdateSkusValidationSubject>;

/* ==============================================================================================
 * SECTION 9 — THE COMPLETE RULE SET
 *
 * ⛔ WHAT THIS DOCUMENT DOES NOT DECLARE. Only TWO of the process object's five properties carry rules.
 * Nothing is declared for the other three, and nothing may be added for them:
 *   - `product` [`model/process/Product_UpdateSkus.cfc:L52`] — the INJECTED ENTITY. NO RULE WHATSOEVER,
 *     not even a presence check, although the whole operation is meaningless without it. Do not add one.
 *   - `updatePriceFlag` [`:L55`] — appears ONLY as a condition predicate, at
 *     [`model/validation/Product_UpdateSkus.json:L4`]. No presence check, no type check, no rule-level
 *     equality check.
 *   - `updateListPriceFlag` [`:L57`] — likewise, a predicate subject only, at [`:L7`].
 * And there is nothing else to constrain: the component has no further property, no method, no
 * initialiser, no default and no validation hook. `model/process/Product_UpdateSkus.cfc:L49-L60` is the
 * component in its entirety.
 *
 * ==============================================================================================
 * THE CENSUS — THIS DOCUMENT'S SHARE OF THE THIRTEEN KEYS
 * ==============================================================================================
 * Measured across the seven in-scope documents, and every figure re-counted rather than recalled:
 *
 *   | key                     | kind      | folder-wide | HERE                                   |
 *   |-------------------------|-----------|-------------|----------------------------------------|
 *   | context list            | selection | 39          | 0 — ⭐ the ONLY document with none      |
 *   | condition list + block  | selection | 3           | 3 — ⭐ the SOLE user, all three         |
 *   | presence                | constraint| 18          | 2                                      |
 *   | collection ceiling      | constraint| 9           | 0                                      |
 *   | uniqueness              | constraint| 7           | 0                                      |
 *   | type check              | constraint| 7           | 2, both numeric                        |
 *   | equality                | constraint| 5           | 2, both against 1, both in conditions  |
 *   | pattern                 | constraint| 3           | 0                                      |
 *   | numeric floor           | constraint| 3           | 0 — ⭐ X3                               |
 *   | collection floor        | constraint| 3           | 0                                      |
 *   | method rule             | constraint| 2           | 0                                      |
 *   | list membership         | constraint| 2           | 0                                      |
 *   | trimmed-length ceiling  | constraint| 1           | 0                                      |
 *
 * So this document uses exactly THREE of the eleven constraint kinds — presence, type and equality —
 * plus the condition selection key, of which it is the folder's only user. The kinds are a discriminated
 * union in `../Validator`, so anything else is a compile error: the typed analogue of the legacy engine's
 * runtime raise at `org/Hibachi/HibachiValidationService.cfc:L202`.
 *
 * ⭐ X8, RECORDED FOR CROSS-FILE CONSISTENCY EVEN THOUGH THIS DOCUMENT CONTRIBUTES NOTHING TO IT. There
 * are SEVEN uniqueness constraints across the seven documents — not six and not five — distributed two
 * in `model/validation/Product.json` and one each in the SKU, brand, option, option-group and
 * product-type documents, with ZERO here. Measured directly. The `../../ports/UniquePropertyPort`
 * specification undercounts at six, denies the product URL-title constraint that
 * `model/validation/Product.json:L16` plainly declares, and omits the product-type document altogether;
 * `../Validator` independently carries the same correction, so the two agree and there is no cross-folder
 * conflict. C1.0 forbids editing either sibling, so the correction is recorded here and nowhere else.
 *
 * ==============================================================================================
 * ⭐ S8 — THE ACTION GATE DISAGREES WITH THE VALIDATION GATE
 * ==============================================================================================
 * The consumer decides whether to WRITE each price with a bare truthiness test on the accessor —
 * `if(arguments.processObject.getUpdatePriceFlag())` at `model/service/ProductService.cfc:L222` and the
 * list-price equivalent at `:L226` — whereas validation decides whether the price was CHECKED with the
 * equality predicate declared above. With the property unset the generated accessor returns null, and a
 * CFML truthiness test on null is ENGINE-DEPENDENT. So whether the price is written and whether the price
 * was validated are settled by TWO DIFFERENT PREDICATES that can disagree.
 *
 * This is recorded as an observation, deliberately NOT reconciled (guideline 4) and deliberately NOT
 * annotated as a parity defect: no identifier is invented for it, and the register is stated
 * canonically, and only once, in the header of `src/ports/repositories/SkuRepository.ts` (AAP
 * 0.6.7's frozen source range D1-D21, plus the source extension D22 and the three contract
 * corrections D23, D24 and D25, with no D26 or beyond; and AAP 0.6.6's M1-M8 plus M9, with no M10
 * or beyond). Also noted in passing, and equally not given a NEW identifier: the loop counter at
 * `model/service/ProductService.cfc:L220` is UNSCOPED — the second such site, the first being
 * `:L118` — and TypeScript block scoping removes that hazard by construction. That is not a fresh
 * finding but the SAME deliberate translation decision the register ALREADY carries as D10 against
 * `ProductService.getFormattedOptionGroups`, so D10 is cited rather than duplicated under a new
 * number. Both observations belong to `src/services/ProductService.ts` to act on, if anything is
 * ever to be acted on; this file only records them where the disagreeing predicate is declared.
 *
 * NO EXECUTION-MODEL MISMATCH ARISES HERE. These rules are pure, synchronous, in-memory predicate
 * evaluation with no data access whatsoever — no query, no transaction, no flush awareness, no timeout
 * and no retry. The mismatch inventory is fully allocated and none of it belongs to this file.
 *
 * ==============================================================================================
 * ⭐ WHY THIS FILE MATTERS ON A LIVE PATH
 * ==============================================================================================
 * AAP §0.4.2.1 records the update-skus process member as "Fully ported" — the ONLY process member in the
 * slice that is not boundary-stubbed. So unlike some rules in this folder, these two genuinely execute.
 * Getting them wrong does not fail loudly: the port would compile cleanly and then either demand a price
 * the legacy system never asked for, or silently accept a bulk SKU price update with no price at all.
 * ============================================================================================== */

/**
 * The complete transliterated document — the typed replacement for
 * `model/validation/Product_UpdateSkus.json`.
 *
 * Both halves of the document's own top-level structure are preserved: the properties container, and —
 * uniquely among the seven — the conditions block. Properties appear in source order, the price rule at
 * [`model/validation/Product_UpdateSkus.json:L11`] before the list-price rule at [`:L12`].
 */
export const productUpdateSkusValidationRuleSet = Object.freeze({
  conditions: productUpdateSkusConditions,
  properties: Object.freeze([updateSkusPriceValidation, updateSkusListPriceValidation] as const),
} as const) satisfies ValidationRuleSet<ProductUpdateSkusValidationSubject>;
