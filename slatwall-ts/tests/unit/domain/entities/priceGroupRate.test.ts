// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/priceGroupRate.ts`
//
// The `SwPriceGroupRate` row [model/entity/PriceGroupRate.cfc:L49] and every behaviour the 284-line
// component declares over it. Four carry real risk and take most of the space:
//
//   1. `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95-L174] - eighty lines of string
//      assembly with FIVE outcomes, hardcoded English labels, six pluralised fragments in a fixed
//      order, and a `Replace` that only ever replaces the FIRST comma. This suite's centrepiece.
//   2. `getAmountFormatted()` [L262-L268] - a two-branch formatter whose percentage branch is RAW
//      CFML concatenation, so trailing zeros are DROPPED and a stored `12.50` renders `"12.5%"`.
//   3. `getDisplayName()` [L274-L276] with `getSimpleRepresentationPropertyName()` [L270-L272]:
//      two `" - "` separators, three nullable reads, one raise, two empty-string folds, and a
//      returned property name spelled with a CAPITAL D.
//   4. `getAmountTypeOptions()` [L87-L93] - UNCONDITIONAL, always exactly three, and the third
//      row's display key disagrees with its stored value on purpose.
//
// Alongside them: the four owner-side bidirectional pairs and their asymmetric guards, the
// primary-key containment probes, the `''`-keyed `isNew()`, the nullable `roundingRule`, the audit
// columns, the three exclusion collections nothing reads, and the framework members not shipped.
//
// HARD BOUNDARY - THE CASCADE AND THE ROUNDING ALGORITHM ARE NOT TESTED HERE. This entity is the
// LEAF the cascade resolves to, so it is easy to reach one tier out. Two bodies of behaviour are
// cited below and asserted NOWHERE in this file:
//
//   * THE FIVE-LEVEL CASCADE [model/service/PriceGroupService.cfc:L140-L181], re-read in full: it
//     consults `hasSku()` and `getGlobalFlag()` on a rate, delegates to the product and
//     product-type variants, and recurses into the parent at [L174] through the PRODUCT variant
//     rather than the SKU one. Owned by `tests/unit/services`.
//   * THE AMOUNT-TYPE STRATEGY [model/service/PriceGroupService.cfc:L316-L340], where ONLY the
//     `percentageOff` branch applies the rounding rule [L321-L330] while `amountOff` [L331] and
//     `amount` [L334] skip it, and the `switch` has no `default:` case at all. Also owned there.
//
// NO ASSERTION BELOW COMPUTES OR EXPECTS A ROUNDED AMOUNT; the ten-row characterization table for
// `roundValue` belongs to `tests/unit/services/roundingRuleService`. The one rounding-adjacent
// assertion proves the opposite of rounding: that holding a `roundingRule` does not invoke it. SQL
// is likewise out - `model/dao/PriceGroupDAO.cfc:L52-L100`, the subscription-table reach-through
// behind account price-group resolution, belongs to `tests/integration`.
//
// COVERAGE IS 100% NET-NEW, never to be presented as parity. Measured: a case-insensitive search of
// all 32 `.cfc` files under `meta/tests/` for `priceGroupRate` returns ZERO hits, and one for
// `appliesTo` returns ZERO hits. The only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc], neither of
// which touches this entity, and [meta/tests/functional/admin/entity/ProductTest.cfc] is an EMPTY
// STUB contributing zero coverage, so there is nothing here to extend. Of the four cases
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] gave every legacy entity suite for
// free, two rest on framework members this port does not ship on an entity; one is INAPPLICABLE
// HERE - `simple_representation_exists_and_is_simple` [L56-L58] asserts
// `isSimpleValue(getSimpleRepresentation())`, but this entity's simple representation resolves
// through `getDisplayName()`, which dereferences `getPriceGroup()` with NO null guard [L275], so on
// a fresh instance it RAISES and the throw is asserted instead; and one, `defaults_are_correct`
// [L64-L67], has its `isNew()` half authored below.
//
// VERIFIED CORRECTIONS - WHERE THE SOURCE DISAGREED, THE SOURCE WON. Every locator quoted here was
// re-read against the CFC and every expectation measured against the shipped module. Six:
//
//   1. `getAmountFormatted()` [model/entity/PriceGroupRate.cfc:L262-L268] uses RAW CONCATENATION
//      `getAmount() & "%"`, NOT `formatValue(..., "percentage")` - that is what makes trailing
//      zeros disappear. The sibling [model/entity/PromotionReward.cfc:L401-L407] is the one calling
//      `formatValue` with `"percentage"`; the two must not be conflated.
//   2. Only ONE of the three exclusion link tables is abbreviated:
//      `SwPriceGrpRateExclProductType` [L75]. `SwPriceGroupRateExclProduct` [L76] and
//      `SwPriceGroupRateExclSku` [L77] are spelled out in full.
//   3. NONE of the six many-to-many collections declares `type="array"` [L71-L77], unlike
//      [model/entity/PromotionReward.cfc:L74, L86, L87] and
//      [model/entity/PromotionQualifier.cfc:L83, L84], which do.
//   4. `amountType` [L55] carries `hb_formFieldType="select"` and NO `hb_formatType="rbKey"`,
//      unlike [model/entity/PromotionReward.cfc:L62].
//   5. `getAmountRepresentation()` DOES NOT EXIST on this component - confirmed by reading all 284
//      lines - even though [model/service/PriceGroupService.cfc:L243] calls it.
//   6. `Sku` NEWNESS IS NOT DERIVED FROM AN EMPTY KEY in the shipped port:
//      `src/domain/entities/sku.ts` takes an explicit `isNew` hydration flag, so
//      `new Sku({ skuID: '' }).isNew()` is `false` and an unsaved SKU needs
//      `{ skuID: '', isNew: true }`. `Product` and `ProductType` DO derive newness from an empty
//      key. Measured directly; the guard-polarity assertions depend on it.
//
// Two import corrections against this file's own brief, for the same reason. `PriceGroup`,
// `Product`, `ProductType`, `RoundingRule` and `Sku` are imported AS VALUES: each is a class with
// private fields, so it is nominally typed, and the far side of every bidirectional helper has to
// be a real instance whose live `getPriceGroupRates()` array the assertion can inspect. And
// `src/lib/cfml/numberFormat.ts` is deliberately NOT imported though it would be permitted - every
// formatting expectation is a LITERAL string, because re-deriving one with the helper the subject
// uses would assert only that the helper equals itself.
//
// No database, network, filesystem, environment variable, credential, clock or timer. Every subject
// and far side is built fresh inside the test that uses it: no module-level mutable value, no
// shared subject, no `beforeEach`, no spy to restore. That discipline is load-bearing rather than
// ceremonial - `getAppliesTo()` reads SIX live collections, so a shared subject would leak
// membership from one grammar path into the next. `tests/setup.ts` pins the process to UTC, every
// date literal is an explicit UTC ISO-8601 string, and no epoch value appears. Every monetary value
// is constructed through `Money`, the only literals in a monetary position are decimal strings, and
// `decimal.js` is never imported.
//
// THIS SUITE SPENDS ZERO OF THE MIGRATION'S DELIBERATE DIVERGENCES. Two defects carry the two-line
// `LEGACY-DEFECT` marker:
//
//   D45 - the first-comma-only `Replace` at [model/entity/PriceGroupRate.cfc:L132] and [L158], the
//         one this suite is required to mark, reproduced on BOTH halves of the grammar; and
//   D25 - the duplicate far-side append that [L183]'s `isNew() or !hasPriceGroupRate(this)` guard
//         performs for an unsaved rate, marked because the suite reproduces its consequence.
//
// Everything else is a `CFML parity` note, a `LEGACY-NOTE` or a `JUDGMENT CALL`. The three casing
// hazards (`skusList`/`SkusList`, `excludedProductTypesList`/`excludedproductTypesList`,
// `displayName`/`DisplayName`) are PORTING HAZARDS, NOT authorized divergences: each resolves to a
// single TypeScript binding with behaviour unchanged. The three project-wide divergences are all
// sibling-owned - the un-`var`'d `discountAmount` and the `amountOff` raw-float gap in
// `src/services`, and the entity memo fixes in `sku.test.ts` and `product.test.ts`. A fourth is
// forbidden and none is taken here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../../src/domain/entities/priceGroupRate.js';
import type { PriceGroupRateAmountType } from '../../../../src/domain/entities/priceGroupRate.js';
import { Product } from '../../../../src/domain/entities/product.js';
import { ProductType } from '../../../../src/domain/entities/productType.js';
import { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';
import { Sku } from '../../../../src/domain/entities/sku.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { makePriceGroupFixtures } from '../../../fixtures/priceGroupFixtures.js';

// --- Documented contract constants -----------------------------------------

/**
 * The resource-bundle key `getAppliesTo()` returns UNRESOLVED on its global short-circuit.
 *
 * CFML parity [model/entity/PriceGroupRate.cfc:L106-L108]: `getGlobalFlag()` early-returns
 * `rbKey('admin.pricegroup.edit.priceGroupRateAppliesToAllProducts')` BEFORE any list assembly.
 * JavaRB is not ported per AAP 0.5.3, so the key is emitted verbatim as an inert string and NO
 * English substitute is invented - that would fabricate a translation the legacy looks up itself.
 */
const APPLIES_TO_ALL_PRODUCTS_RB_KEY = 'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts';

// C5 SCHEMA CONTINUITY: the six physical link-table names from
// [model/entity/PriceGroupRate.cfc:L71-L77] ARE the schema contract - including that ONLY
// `excludedProductTypes` [L75] abbreviates `Group` to `Grp` while [L76] and [L77] spell it in full.
// They are deliberately NOT held in a constant here: a constant declared in this file can only ever
// be compared with the same literals, which says nothing about the port. The contract is checked
// against the frozen declarations AND the shipped source in tests/traceability/legacyTestMap.ts
// block A20, which also proves each of the six collections is published as an accessor.

/**
 * Every member the port ships, asserted as an exact set so a widening fails here.
 *
 * ★ THE ELEVEN `set*` MEMBERS ARE FRAMEWORK-GENERATED, NOT HAND-WRITTEN. `accessors=true`
 * [model/entity/PriceGroupRate.cfc:L49] makes the CFML engine emit a `set<Property>` for every
 * declared property, and each one below is published because a line of `savePriceGroupRate`
 * [model/service/PriceGroupService.cfc:L404, L430, L437-L442] invokes it - INCLUDING [L404], whose
 * `super.save(entity=..., data=...)` populates every submitted persistent property before validating
 * [org/Hibachi/HibachiService.cfc:L145, L150].
 *
 * ★★ THREE OF THEM ARRIVED IN ONE REVISION AND THE REASON IS RECORDED HERE. This note used to read:
 * "The generated setters with NO in-scope caller - `setAmountType`, `setRemoteID`, `setRoundingRule`
 * and the four audit setters - are deliberately absent." That was wrong about the first three,
 * because [L404]'s populate step IS an in-scope caller of every populatable setter, and code review
 * measured the consequence: `amountType` carries `{"contexts":"save","required":true}`
 * [model/validation/PriceGroupRate.json], so with no setter for it NO PAYLOAD COULD EVER PRODUCE A
 * VALID RATE. The FOUR AUDIT SETTERS remain absent, and correctly so: each of those properties
 * declares `hb_populateEnabled="false"` [model/entity/PriceGroupRate.cfc:L61-L64], which is the
 * framework's own instruction that populate must skip them.
 */
const PORTED_PUBLIC_SURFACE = [
  // ★★ THE FIVE-MEMBER ERROR REGISTER, ported from [org/Hibachi/HibachiTransient.cfc:L30-L64].
  // `savePriceGroupRate` [model/service/PriceGroupService.cfc:L397-L459] reaches persistence, and
  // `HibachiService.save` [org/Hibachi/HibachiService.cfc:L151-L167] records a refused save's rules on
  // the ENTITY, skips the flush, and returns that entity - so a port with no register could not report
  // a refusal at all. Code review recorded that silence across this whole save tier.
  'addError',
  'addProduct',
  'addProductType',
  'addSku',
  'getAmount',
  'getAmountFormatted',
  'getAmountType',
  'getAmountTypeOptions',
  'getAppliesTo',
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getDisplayName',
  'getError',
  'getErrors',
  'getExcludedProductTypes',
  'getExcludedProducts',
  'getExcludedSkus',
  'getGlobalFlag',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getPriceGroup',
  'getPriceGroupRateID',
  'getProductTypes',
  'getProducts',
  'getRemoteID',
  'getRoundingRule',
  'getSimpleRepresentationPropertyName',
  'getSkus',
  'hasError',
  'hasErrors',
  'hasProduct',
  'hasProductType',
  'hasSku',
  'isNew',
  'removePriceGroup',
  'removeProduct',
  'removeProductType',
  'removeSku',
  'setAmount',
  'setAmountType',
  'setExcludedProductTypes',
  'setExcludedProducts',
  'setExcludedSkus',
  'setGlobalFlag',
  'setPriceGroup',
  'setProductTypes',
  'setProducts',
  'setRemoteID',
  'setRoundingRule',
  'setSkus',
] as const;

/** Explicit UTC instant for `createdDateTime`; never `new Date()`. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/** A second explicit UTC instant, deliberately later than the first. */
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/** A persisted rate: a non-empty key, so `isNew()` is false. */
const SAVED_RATE_ID = 'pgr-saved';

/** The `unsavedvalue=""` key from [model/entity/PriceGroupRate.cfc:L52]. */
const UNSAVED_RATE_ID = '';

// --- Fresh subjects and fresh far sides - functions, never shared literals -----
//
// `getAppliesTo()` reads six live collections, so one shared subject would leak membership across
// the five grammar paths.

/**
 * The constructor's own parameter type, derived rather than restated.
 *
 * JUDGMENT CALL: `ConstructorParameters` instead of hand-copying the seventeen fields. A copy would
 * rot silently the day the module gains or renames one; this becomes a compile error at exactly
 * that moment, and `tests/fixtures/priceGroupFixtures.ts` already uses the technique.
 */
type PriceGroupRateInit = ConstructorParameters<typeof PriceGroupRate>[0];

/**
 * A rate defaulting to the saved key, so guard polarity is opt-in per test.
 */
function aRate(overrides: Partial<PriceGroupRateInit> = {}): PriceGroupRate {
  return new PriceGroupRate({
    ...overrides,
    priceGroupRateID: overrides.priceGroupRateID ?? SAVED_RATE_ID,
  });
}

/** `Product` derives newness from an empty key, so a non-empty one is saved. */
function aProduct(productID = 'prd-1'): Product {
  return new Product({ productID });
}

/** A saved product type. */
function aProductType(productTypeID = 'ptp-1'): ProductType {
  return new ProductType({ productTypeID });
}

/** A saved SKU. */
function aSku(skuID = 'sku-1'): Sku {
  return new Sku({ skuID });
}

/**
 * An UNSAVED SKU. Correction 6: `src/domain/entities/sku.ts` takes an explicit hydration flag, so
 * `{ skuID: '' }` alone would report `isNew()` false. The flag is what makes it unsaved.
 */
function anUnsavedSku(): Sku {
  return new Sku({ skuID: '', isNew: true });
}

/** Distinct saved products, keyed by index. */
function products(count: number): Product[] {
  return Array.from({ length: count }, (_unused, index) => aProduct(`prd-${String(index + 1)}`));
}

/** `count` distinct saved product types. */
function productTypes(count: number): ProductType[] {
  return Array.from({ length: count }, (_unused, index) =>
    aProductType(`ptp-${String(index + 1)}`),
  );
}

/** `count` distinct saved SKUs. */
function skus(count: number): Sku[] {
  return Array.from({ length: count }, (_unused, index) => aSku(`sku-${String(index + 1)}`));
}

/**
 * A real `PriceGroup` - nominally typed, so no structural stand-in would satisfy the parameter and
 * no stand-in could expose the live `getPriceGroupRates()` array the far-side assertions inspect.
 */
function aPriceGroup(
  priceGroupName: string = 'Wholesale',
  priceGroupRates: PriceGroupRate[] = [],
): PriceGroup {
  return new PriceGroup({
    priceGroupID: 'pgp-1',
    priceGroupIDPath: undefined,
    activeFlag: true,
    priceGroupName,
    priceGroupCode: 'WHOLESALE',
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates,
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/**
 * A price group PRESENT on the rate but whose own nullable name is genuinely absent.
 *
 * JUDGMENT CALL: a separate factory rather than `aPriceGroup(undefined)`, because JavaScript
 * applies a default parameter to an explicitly-passed `undefined`, so `aPriceGroup(undefined)`
 * would quietly hand back the NAMED group and the empty-string fold at
 * [model/entity/PriceGroupRate.cfc:L275] would never be exercised. That separates the ONE
 * dereferenced null that raises from the three concatenated nulls that fold.
 */
function aPriceGroupWithNoName(): PriceGroup {
  return new PriceGroup({
    priceGroupID: 'pgp-nameless',
    priceGroupIDPath: undefined,
    activeFlag: true,
    priceGroupName: undefined,
    priceGroupCode: 'NAMELESS',
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/** One crossing of the rounding boundary, as recorded. */
interface RecordedRoundValueCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

/**
 * A rounding rule that RECORDS every `roundValue` crossing instead of performing one. The count
 * staying at zero across the entity's whole surface is what turns "this entity never rounds" from a
 * claim into a measurement.
 */
function aRecordingValueRounder(): {
  readonly calls: readonly RecordedRoundValueCall[];
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
} {
  const calls: RecordedRoundValueCall[] = [];

  return {
    calls,
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      calls.push({ value, rule });

      return Money.fromDecimalString('77.77');
    },
  };
}

/** The recorder paired with the rule that holds it. */
function aRoundingRuleWithRecorder(): {
  readonly rule: RoundingRule;
  readonly recorder: ReturnType<typeof aRecordingValueRounder>;
} {
  const recorder = aRecordingValueRounder();
  const rule = new RoundingRule(
    {
      roundingRuleID: 'rrl-1',
      roundingRuleName: 'Closest ninety-nine',
      roundingRuleExpression: '.99',
      roundingRuleDirection: 'Closest',
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
      priceGroupRates: [],
    },
    recorder,
  );

  return { rule, recorder };
}

// --- getAppliesTo path 1 of 5: the global short-circuit ---------------------

describe('getAppliesTo path 1 of 5: the global short-circuit', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L106-L108]: getGlobalFlag() early-returns the raw
  // rbKey 'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts' BEFORE any list assembly. This
  // is a BEHAVIOURAL early return, not a shortcut taken to save work: it is the branch that decides
  // what an administrator reads about a global rate, and the nine locals seeded at [L96-L104] are
  // abandoned unread when it fires.

  it('returns the resource-bundle key itself, unresolved', () => {
    const subject = aRate({ globalFlag: true });

    expect(subject.getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
  });

  it('returns the key even with all six collections populated, leaking no count', () => {
    // The short-circuit is at [L106], BEFORE the including branch at [L110] and the excluding
    // branch at [L135].
    const subject = aRate({
      globalFlag: true,
      products: products(2),
      productTypes: productTypes(3),
      skus: skus(4),
      excludedProducts: products(5),
      excludedProductTypes: productTypes(6),
      excludedSkus: skus(7),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
    expect(appliesTo).not.toContain('Including');
    expect(appliesTo).not.toContain('Excluding');
    expect(appliesTo).not.toContain('Product Type');
    expect(appliesTo).not.toContain('SKU');
    expect(appliesTo).not.toContain(',');
    expect(appliesTo).not.toContain(' and ');
    // The key carries no digit at all, so a leaked count of ANY of the six collections would be
    // visible as one.
    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(appliesTo).not.toContain(digit);
    }
  });

  it('fires for every column value CFML would have read as true', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L53]: `ormType="boolean" default="false"` is a
    // declaration about rows the ORM inserts, NOT a guarantee about rows already in the table, so
    // the port resolves the column through the CFML boolean coercion rather than through a bare
    // truthiness test.
    for (const globalFlag of [true, 1, '1', 'true', 'TRUE', 'yes'] as const) {
      expect(aRate({ globalFlag }).getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
    }
  });

  it('does not fire for any column value CFML would have read as false', () => {
    for (const globalFlag of [false, 0, '0', 'false', 'no', null, undefined] as const) {
      const subject = aRate({ globalFlag, products: products(1) });

      expect(subject.getAppliesTo()).toBe('Including: 1 Product');
    }
  });

  it('does not fire on the column default, which is false', () => {
    const subject = aRate({ products: products(1) });

    expect(subject.getGlobalFlag()).toBe(false);
    expect(subject.getAppliesTo()).toBe('Including: 1 Product');
  });
});

// --- getAppliesTo path 2 of 5: neither half ---------------------------------

describe('getAppliesTo path 2 of 5: neither including nor excluding', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L98, L173]: `finalString` is seeded to `""` at
  // [L98], both assembly guards at [L162] and [L166] are skipped when their halves are empty, and
  // [L173] returns that seed.

  it('returns the empty string, and does not throw', () => {
    const subject = aRate();

    expect(subject.getAppliesTo()).toBe('');
  });

  it('returns the empty string when the constructor omitted every collection', () => {
    // A repository that did not fetch the six joins must present empty arrays, never undefined -
    // which is what makes the `arrayLen(...)` guards at [L111], [L114], [L117], [L136], [L139] and
    // [L142] safe to reproduce as plain length reads.
    const subject = aRate();

    expect(subject.getProducts()).toStrictEqual([]);
    expect(subject.getProductTypes()).toStrictEqual([]);
    expect(subject.getSkus()).toStrictEqual([]);
    expect(subject.getExcludedProducts()).toStrictEqual([]);
    expect(subject.getExcludedProductTypes()).toStrictEqual([]);
    expect(subject.getExcludedSkus()).toStrictEqual([]);
    expect(subject.getAppliesTo()).toBe('');
  });

  it('returns the empty string for an unsaved rate as readily as a saved one', () => {
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });

    expect(subject.isNew()).toBe(true);
    expect(subject.getAppliesTo()).toBe('');
  });
});

// --- getAppliesTo path 3 of 5: including only -------------------------------

describe('getAppliesTo path 3 of 5: including only', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L162-L164]:
  //   `finalString = "Including: " & including`,
  // and the `". "` separator at [L168] lives inside `if(len(excluding))` at [L166], so it can never
  // be appended when the excluding half is empty.

  it('prefixes exactly "Including: " with no trailing separator', () => {
    const subject = aRate({ products: products(2) });

    expect(subject.getAppliesTo()).toBe('Including: 2 Products');
  });

  it('never mentions the excluding half', () => {
    const subject = aRate({ productTypes: productTypes(1), skus: skus(3) });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Including: 1 Product Type and 3 SKUs');
    expect(appliesTo).not.toContain('Excluding');
    expect(appliesTo).not.toContain('. ');
    expect(appliesTo.endsWith('.')).toBe(false);
  });

  it('reports each include collection on its own, in the source order', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L111-L128]: products first, then product types,
    // then SKUs - a FIXED order, never sorted, and observable in the returned string.
    expect(aRate({ products: products(1) }).getAppliesTo()).toBe('Including: 1 Product');
    expect(aRate({ productTypes: productTypes(1) }).getAppliesTo()).toBe(
      'Including: 1 Product Type',
    );
    expect(aRate({ skus: skus(1) }).getAppliesTo()).toBe('Including: 1 SKU');
  });

  it('keeps products ahead of product types, and product types ahead of SKUs', () => {
    const subject = aRate({
      products: products(1),
      productTypes: productTypes(2),
      skus: skus(3),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo.indexOf('1 Product and')).toBeLessThan(appliesTo.indexOf('2 Product Types'));
    expect(appliesTo.indexOf('2 Product Types')).toBeLessThan(appliesTo.indexOf('3 SKUs'));
  });

  it('emits no stray leading delimiter before the first fragment', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L120-L128]: accumulation goes through
    // `ListAppend`, which emits NO leading delimiter into an empty list.
    const subject = aRate({ skus: skus(3) });

    expect(subject.getAppliesTo()).toBe('Including: 3 SKUs');
  });
});

// --- getAppliesTo path 4 of 5: excluding only -------------------------------

describe('getAppliesTo path 4 of 5: excluding only', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L166-L171]: the `". "` at [L168] is nested inside
  // `if(len(including))`, so an excluding-only rate gets NO leading separator.

  it('prefixes exactly "Excluding: " with no leading separator', () => {
    const subject = aRate({ excludedProducts: products(1) });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Excluding: 1 Product');
    expect(appliesTo.startsWith('. ')).toBe(false);
    expect(appliesTo.startsWith('Excluding: ')).toBe(true);
  });

  it('never mentions the including half', () => {
    const subject = aRate({ excludedProductTypes: productTypes(2), excludedSkus: skus(1) });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Excluding: 2 Product Types and 1 SKU');
    expect(appliesTo).not.toContain('Including');
    expect(appliesTo).not.toContain('. ');
  });

  it('reports each exclude collection on its own, in the same fixed order', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L136-L154]: excluded products, then excluded
    // product types, then excluded SKUs - the same order the including half uses.
    expect(aRate({ excludedProducts: products(1) }).getAppliesTo()).toBe('Excluding: 1 Product');
    expect(aRate({ excludedProductTypes: productTypes(1) }).getAppliesTo()).toBe(
      'Excluding: 1 Product Type',
    );
    expect(aRate({ excludedSkus: skus(1) }).getAppliesTo()).toBe('Excluding: 1 SKU');
  });

  it('keeps excluded products ahead of excluded product types, and those ahead of SKUs', () => {
    const subject = aRate({
      excludedProducts: products(3),
      excludedProductTypes: productTypes(2),
      excludedSkus: skus(1),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo.indexOf('3 Products and')).toBeLessThan(appliesTo.indexOf('2 Product Types'));
    expect(appliesTo.indexOf('2 Product Types')).toBeLessThan(appliesTo.indexOf('1 SKU'));
  });
});

// --- getAppliesTo path 5 of 5: both halves ----------------------------------

describe('getAppliesTo path 5 of 5: both halves', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L166-L171]: the `". "` separator is emitted on
  // THIS PATH ONLY, because [L167-L169] requires BOTH halves to be non-empty.

  it('joins the two clauses with exactly one ". " separator, in that order', () => {
    const subject = aRate({ products: products(2), excludedSkus: skus(3) });

    expect(subject.getAppliesTo()).toBe('Including: 2 Products. Excluding: 3 SKUs');
  });

  it('emits the separator exactly once, between the clauses and nowhere else', () => {
    const subject = aRate({ productTypes: productTypes(1), excludedProducts: products(1) });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Including: 1 Product Type. Excluding: 1 Product');
    expect(appliesTo.split('. ')).toHaveLength(2);
    expect(appliesTo.indexOf('Including: ')).toBeLessThan(appliesTo.indexOf('. '));
    expect(appliesTo.indexOf('. ')).toBeLessThan(appliesTo.indexOf('Excluding: '));
  });

  it('carries all six collections at once, with both halves fully assembled', () => {
    // The golden string for this method.
    const subject = aRate({
      products: products(2),
      productTypes: productTypes(1),
      skus: skus(2),
      excludedProducts: products(1),
      excludedProductTypes: productTypes(2),
      excludedSkus: skus(1),
    });

    expect(subject.getAppliesTo()).toBe(
      'Including: 2 Products and 1 Product Type,2 SKUs. ' +
        'Excluding: 1 Product and 2 Product Types,1 SKU',
    );
  });

  it('produces the same golden string through the shared price-group fixture graph', () => {
    // The fixture's `appliesToIncludingAndExcludingRate` is the only rate in that graph carrying
    // all six collections, and it is fed entirely from overrides - so this is an independent
    // construction route to the same contract.
    const fixtures = makePriceGroupFixtures({
      productLevelRateProducts: products(2),
      productTypeLevelRateProductTypes: productTypes(1),
      skuLevelRateSkus: skus(2),
      excludedProducts: products(1),
      excludedProductTypes: productTypes(2),
      excludedSkus: skus(1),
    });

    expect(fixtures.appliesToIncludingAndExcludingRate.getAppliesTo()).toBe(
      'Including: 2 Products and 1 Product Type,2 SKUs. ' +
        'Excluding: 1 Product and 2 Product Types,1 SKU',
    );
  });

  it('reports nothing about the two halves when the global flag is set as well', () => {
    // Path 1 wins over path 5.
    const subject = aRate({
      globalFlag: true,
      products: products(2),
      excludedSkus: skus(3),
    });

    expect(subject.getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
  });
});

// --- getAppliesTo: the hardcoded English labels and the plural boundary -----

describe('getAppliesTo pluralization: the include collections', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L112, L115, L118]: the pluraliser is
  // `IIF(arrayLen(...) GT 1, DE('s'), DE(''))`, so the boundary is STRICTLY GREATER THAN ONE:
  // exactly one is singular, two or more plural. `DE()` exists only because `IIF` evaluates its
  // branches as expressions, so what is asserted is the resulting STRING.
  //
  // CFML parity [model/entity/PriceGroupRate.cfc:L112-L118, L163, L168, L170]: the labels are
  // HARDCODED ENGLISH, not resource-bundle keys: `"Product"`, `"Product Type"`, `"SKU"`,
  // `"Including: "`, `"Excluding: "` and the `". "` joiner are all literals. Only the global branch
  // at [L107] localises. Introducing keys for these would fabricate a mechanism this method does
  // not have, so every expectation below is the literal English, verbatim.

  it('says "1 Product" for one product and "2 Products" for two', () => {
    expect(aRate({ products: products(1) }).getAppliesTo()).toBe('Including: 1 Product');
    expect(aRate({ products: products(2) }).getAppliesTo()).toBe('Including: 2 Products');
  });

  it('says "1 Product Type" for one product type and "2 Product Types" for two', () => {
    expect(aRate({ productTypes: productTypes(1) }).getAppliesTo()).toBe(
      'Including: 1 Product Type',
    );
    expect(aRate({ productTypes: productTypes(2) }).getAppliesTo()).toBe(
      'Including: 2 Product Types',
    );
  });

  it('says "1 SKU" for one SKU and "2 SKUs" for two, pluralising with a lowercase s', () => {
    // The noun is UPPERCASE and the plural marker is a LOWERCASE `s` - `"SKUs"`, never `"SKUS"`.
    // That falls out of [L118] appending the same `DE('s')` branch used for the other two nouns.
    expect(aRate({ skus: skus(1) }).getAppliesTo()).toBe('Including: 1 SKU');
    expect(aRate({ skus: skus(2) }).getAppliesTo()).toBe('Including: 2 SKUs');
    expect(aRate({ skus: skus(2) }).getAppliesTo()).not.toContain('SKUS');
  });

  it('stays plural well past two', () => {
    expect(aRate({ products: products(11) }).getAppliesTo()).toBe('Including: 11 Products');
    expect(aRate({ productTypes: productTypes(7) }).getAppliesTo()).toBe(
      'Including: 7 Product Types',
    );
    expect(aRate({ skus: skus(4) }).getAppliesTo()).toBe('Including: 4 SKUs');
  });

  it('joins two fragments with " and ", carrying a space on each side', () => {
    const subject = aRate({ products: products(1), skus: skus(1) });

    expect(subject.getAppliesTo()).toBe('Including: 1 Product and 1 SKU');
    expect(subject.getAppliesTo()).toContain('Product and 1');
    expect(subject.getAppliesTo()).not.toContain('Productand');
    expect(subject.getAppliesTo()).not.toContain('and1');
  });
});

describe('getAppliesTo pluralization: the exclude collections', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L137, L140, L143]: the excluding half repeats the
  // identical `GT 1` pluraliser over the three excluded collections, so both sides of the grammar
  // are pinned.

  it('says "1 Product" for one excluded product and "2 Products" for two', () => {
    expect(aRate({ excludedProducts: products(1) }).getAppliesTo()).toBe('Excluding: 1 Product');
    expect(aRate({ excludedProducts: products(2) }).getAppliesTo()).toBe('Excluding: 2 Products');
  });

  it('says "1 Product Type" for one excluded product type and "2 Product Types" for two', () => {
    expect(aRate({ excludedProductTypes: productTypes(1) }).getAppliesTo()).toBe(
      'Excluding: 1 Product Type',
    );
    expect(aRate({ excludedProductTypes: productTypes(2) }).getAppliesTo()).toBe(
      'Excluding: 2 Product Types',
    );
  });

  it('says "1 SKU" for one excluded SKU and "2 SKUs" for two', () => {
    expect(aRate({ excludedSkus: skus(1) }).getAppliesTo()).toBe('Excluding: 1 SKU');
    expect(aRate({ excludedSkus: skus(2) }).getAppliesTo()).toBe('Excluding: 2 SKUs');
  });

  it('joins two excluded fragments with " and " on the same spacing', () => {
    const subject = aRate({ excludedProductTypes: productTypes(1), excludedSkus: skus(5) });

    expect(subject.getAppliesTo()).toBe('Excluding: 1 Product Type and 5 SKUs');
  });

  it('pluralises the two halves independently of each other', () => {
    const subject = aRate({ products: products(1), excludedProducts: products(3) });

    expect(subject.getAppliesTo()).toBe('Including: 1 Product. Excluding: 3 Products');
  });
});

// --- getAppliesTo: the preserved first-comma-only Replace (defect D45) ------

describe('getAppliesTo: the preserved first-comma-only Replace, including half', () => {
  // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L132]: the comment at [L130] says "Replace all
  // commas with " and "." but CFML `Replace()` called with THREE arguments defaults to scope
  // "once", so only the FIRST comma becomes " and " and a three-collection phrase keeps its second
  // comma.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // THE DIRECT CONTROL PROVING INTENT: [model/entity/ProductType.cfc:L292] writes
  // `replace(getProductTypeIDPath(),",","','","all")` with the fourth argument SPELLED OUT, which
  // would be unnecessary if the default were already "all". Two more sites do the same:
  //   `Replace(urlTitle, "[ ]+", "-", "all")` in model/service/BrandService.cfc and in
  //   model/service/ProductService.cfc.
  //
  // THE IMPLEMENTATION CHOICE IS THE DEFECT. The port reproduces it with a STRING pattern,
  //   `String.prototype.replace(',', ' and ')`
  // which is also first-occurrence-only, so the assertions below pin the surviving comma
  // POSITIVELY. A test expecting " and " twice would be asserting the repaired behaviour and must
  // never be written.

  it('leaves the second comma in place when all three include collections are populated', () => {
    const subject = aRate({
      products: products(3),
      productTypes: productTypes(2),
      skus: skus(1),
    });

    expect(subject.getAppliesTo()).toBe('Including: 3 Products and 2 Product Types,1 SKU');
  });

  it('converts exactly one comma and leaves exactly one behind', () => {
    const subject = aRate({
      products: products(2),
      productTypes: productTypes(2),
      skus: skus(2),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Including: 2 Products and 2 Product Types,2 SKUs');
    expect(appliesTo.split(' and ')).toHaveLength(2);
    expect(appliesTo.split(',')).toHaveLength(2);
  });

  it('leaves the surviving comma unspaced, so it cannot be mistaken for the joiner', () => {
    const subject = aRate({
      products: products(1),
      productTypes: productTypes(1),
      skus: skus(1),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Including: 1 Product and 1 Product Type,1 SKU');
    expect(appliesTo).toContain('Type,1');
    expect(appliesTo).not.toContain(', ');
    expect(appliesTo).not.toContain(' ,');
  });

  it('looks entirely correct with only two collections, which is how the defect survived', () => {
    // With two fragments the list holds exactly ONE comma, so one replacement is enough and the
    // output is indistinguishable from a correct implementation.
    expect(aRate({ products: products(2), productTypes: productTypes(3) }).getAppliesTo()).toBe(
      'Including: 2 Products and 3 Product Types',
    );
    expect(aRate({ products: products(2), skus: skus(3) }).getAppliesTo()).toBe(
      'Including: 2 Products and 3 SKUs',
    );
    expect(aRate({ productTypes: productTypes(2), skus: skus(3) }).getAppliesTo()).toBe(
      'Including: 2 Product Types and 3 SKUs',
    );
  });

  it('has no comma at all with a single collection', () => {
    expect(aRate({ products: products(4) }).getAppliesTo()).not.toContain(',');
    expect(aRate({ productTypes: productTypes(4) }).getAppliesTo()).not.toContain(',');
    expect(aRate({ skus: skus(4) }).getAppliesTo()).not.toContain(',');
  });
});

describe('getAppliesTo: the preserved first-comma-only Replace, excluding half', () => {
  // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L158]: the comment at [L156] says "Replace all
  // commas with " and "." but CFML `Replace()` called with THREE arguments defaults to scope
  // "once", so only the FIRST comma becomes " and " and a three-collection phrase keeps its second
  // comma. This is character-for-character the same code as the including half at [L132] and it
  // fails identically.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // Asserted separately rather than assumed to follow, because a port that repaired one site and
  // not the other would still pass a test that only looked at the other.

  it('leaves the second comma in place when all three exclude collections are populated', () => {
    const subject = aRate({
      excludedProducts: products(3),
      excludedProductTypes: productTypes(2),
      excludedSkus: skus(1),
    });

    expect(subject.getAppliesTo()).toBe('Excluding: 3 Products and 2 Product Types,1 SKU');
  });

  it('converts exactly one comma and leaves exactly one behind', () => {
    const subject = aRate({
      excludedProducts: products(1),
      excludedProductTypes: productTypes(1),
      excludedSkus: skus(1),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe('Excluding: 1 Product and 1 Product Type,1 SKU');
    expect(appliesTo.split(' and ')).toHaveLength(2);
    expect(appliesTo.split(',')).toHaveLength(2);
  });

  it('looks entirely correct with only two exclude collections', () => {
    expect(aRate({ excludedProducts: products(2), excludedSkus: skus(1) }).getAppliesTo()).toBe(
      'Excluding: 2 Products and 1 SKU',
    );
    expect(
      aRate({
        excludedProductTypes: productTypes(2),
        excludedSkus: skus(1),
      }).getAppliesTo(),
    ).toBe('Excluding: 2 Product Types and 1 SKU');
  });

  it('carries the surviving comma in BOTH halves of one string', () => {
    // The strongest single statement of the defect: six populated collections, two independent
    // `Replace` calls, two surviving commas, and exactly two ` and ` joiners.
    const subject = aRate({
      products: products(3),
      productTypes: productTypes(2),
      skus: skus(1),
      excludedProducts: products(1),
      excludedProductTypes: productTypes(2),
      excludedSkus: skus(3),
    });

    const appliesTo = subject.getAppliesTo();

    expect(appliesTo).toBe(
      'Including: 3 Products and 2 Product Types,1 SKU. ' +
        'Excluding: 1 Product and 2 Product Types,3 SKUs',
    );
    expect(appliesTo.split(',')).toHaveLength(3);
    expect(appliesTo.split(' and ')).toHaveLength(3);
  });
});

// --- The three case-insensitivity hazards -----------------------------------

describe('the three CFML case-insensitivity hazards', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L101/L118, L103/L149, L82/L271]: three
  // case-insensitivity hazards. `skusList`/`SkusList` and
  // `excludedProductTypesList`/`excludedproductTypesList` are ONE variable each in CFML, whose
  // identifiers are case-insensitive; the non-persistent property is declared lowercase
  // `displayName` at [L82] while `getSimpleRepresentationPropertyName()` returns the capital-D
  // `"DisplayName"` at [L271]. Also recorded, and likewise never normalised:
  // [model/entity/PriceGroupRate.cfc] spells the ORM type attribute `ormType` with a capital T on
  // [L53], [L54] and [L55] but `ormtype` in lowercase on [L52], [L58], [L61] and [L63].

  it('reaches the SKU fragment despite the skusList / SkusList split at L101 and L118', () => {
    // The hazard: [L101] declares `skusList`, and [L118], [L126] and [L127] all write and read
    // `SkusList`. Had the port carried both spellings, the [L126] guard would have tested an
    // always-empty second binding and the SKU fragment would never have been appended.
    const subject = aRate({ skus: skus(2) });

    expect(subject.getAppliesTo()).toBe('Including: 2 SKUs');
  });

  it('reaches the SKU fragment alongside the other two, in third position', () => {
    const subject = aRate({ products: products(1), productTypes: productTypes(1), skus: skus(5) });

    expect(subject.getAppliesTo()).toBe('Including: 1 Product and 1 Product Type,5 SKUs');
  });

  it('reaches the excluded-product-type fragment despite the L103 / L149 split', () => {
    // The hazard: [L103] declares `excludedProductTypesList` and [L140] assigns it, both with a
    // capital P, while the [L149] guard reads `excludedproductTypesList` with a LOWERCASE p and
    // [L150] appends the capital-P spelling again.
    const subject = aRate({ excludedProductTypes: productTypes(2) });

    expect(subject.getAppliesTo()).toBe('Excluding: 2 Product Types');
  });

  it('reaches the excluded-product-type fragment in second position among all three', () => {
    const subject = aRate({
      excludedProducts: products(1),
      excludedProductTypes: productTypes(4),
      excludedSkus: skus(1),
    });

    expect(subject.getAppliesTo()).toBe('Excluding: 1 Product and 4 Product Types,1 SKU');
  });

  it('returns the capital-D property name while the accessor is spelled getDisplayName', () => {
    // The third hazard is the only one of the three that is a DATA CONTRACT rather than an internal
    // local, which is why it is preserved verbatim instead of normalised: the framework builds a
    // method name out of the returned string, so `"DisplayName"` is what resolves to
    // `getDisplayName()`.
    const subject = aRate({ priceGroup: aPriceGroup('Wholesale') });

    expect(subject.getSimpleRepresentationPropertyName()).toBe('DisplayName');
    expect(typeof subject.getDisplayName).toBe('function');
    expect(PORTED_PUBLIC_SURFACE).toContain('getDisplayName');
    expect(PORTED_PUBLIC_SURFACE).not.toContain('getdisplayName');
  });
});

// --- getAmountTypeOptions and the closed amount-type vocabulary -------------

describe('getAmountTypeOptions', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L87-L93]: the body is a bare `return [ ... ]` of
  // three struct literals with NO conditional of any kind, so the same three options come back for
  // every rate in every state. CFML parity [model/entity/PriceGroupRate.cfc:L89-L91]: the three
  // `name` values are RESOURCE-BUNDLE KEYS, not display text - `rbKey("define.percentageOff")` and
  // its two siblings.

  it('returns exactly the three legacy options, in source order, with both fields', () => {
    const subject = aRate();

    expect(subject.getAmountTypeOptions()).toStrictEqual([
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ]);
  });

  it('is UNCONDITIONAL: the same three options whatever the rate holds', () => {
    // CONTRAST [model/entity/PromotionReward.cfc:L120-L133], whose `getAmountTypeOptions()` IS
    // conditional - `if(getRewardType() == "order")` returns only TWO options and drops
    // `define.fixedAmount`, while every other reward type returns all three.
    const states: readonly PriceGroupRate[] = [
      aRate(),
      aRate({ amountType: 'percentageOff' }),
      aRate({ amountType: 'amountOff' }),
      aRate({ amountType: 'amount' }),
      aRate({ globalFlag: true }),
      aRate({ priceGroupRateID: UNSAVED_RATE_ID }),
      aRate({ amount: Money.fromDecimalString('42.00'), products: products(3) }),
    ];

    for (const subject of states) {
      expect(subject.getAmountTypeOptions()).toHaveLength(3);
      expect(subject.getAmountTypeOptions().map((option) => option.value)).toStrictEqual([
        'percentageOff',
        'amountOff',
        'amount',
      ]);
    }
  });

  it('carries a third row whose display key disagrees with its stored value', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L91]: the third row is
    //   {name=rbKey("define.fixedAmount"), value="amount"}
    // This is a REAL DATA CONTRACT, not a slip to tidy: `amount` is the literal the service's
    // `switch` compares against [model/service/PriceGroupService.cfc:L334], so renaming the value
    // to agree with its own label would silently break the pricing dispatch.
    const [, , fixedAmount] = aRate().getAmountTypeOptions();

    expect(fixedAmount.name).toBe('define.fixedAmount');
    expect(fixedAmount.value).toBe('amount');
    expect(fixedAmount.value).not.toBe('fixedAmount');
  });

  it('carries resource-bundle keys rather than English labels', () => {
    const names = aRate()
      .getAmountTypeOptions()
      .map((option) => option.name);

    expect(names).toStrictEqual(['define.percentageOff', 'define.amountOff', 'define.fixedAmount']);
    for (const name of names) {
      expect(name.startsWith('define.')).toBe(true);
    }
    expect(names).not.toContain('Percentage Off');
    expect(names).not.toContain('Fixed Amount');
  });

  it('returns a fresh array on every call, so no caller can mutate a shared list', () => {
    // The CFML literal was re-evaluated on every call, so no caller could ever have mutated a
    // shared instance.
    const subject = aRate();

    const first = subject.getAmountTypeOptions();
    const second = subject.getAmountTypeOptions();

    expect(first).not.toBe(second);
    expect(first).toStrictEqual(second);
  });

  it('offers exactly the values the exported union admits, and no fourth', () => {
    const offered: readonly string[] = aRate()
      .getAmountTypeOptions()
      .map((option) => option.value);
    const union: readonly PriceGroupRateAmountType[] = ['percentageOff', 'amountOff', 'amount'];

    expect(offered).toStrictEqual(union);
  });
});

describe('PriceGroupRateAmountType is a closed union of exactly three values', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L55]: `amountType` is a plain `ormType="string"`
  // column with `hb_formFieldType="select"` and NO check constraint, so narrowing a hydrated value
  // to the published vocabulary belongs at the repository boundary. CFML parity
  // [model/entity/PriceGroupRate.cfc:L55]: note the asymmetry with
  // [model/entity/PromotionReward.cfc:L62], which declares `hb_formatType="rbKey"` on ITS
  // `amountType` while this one declares only `hb_formFieldType="select"`.

  it('names the three values, in source order', () => {
    const fixtures = makePriceGroupFixtures();

    expect(fixtures.recognisedAmountTypes).toStrictEqual(['percentageOff', 'amountOff', 'amount']);
  });

  it('round-trips each of the three unchanged, without normalising case', () => {
    for (const amountType of ['percentageOff', 'amountOff', 'amount'] as const) {
      expect(aRate({ amountType }).getAmountType()).toBe(amountType);
    }
  });

  it('reports undefined for a null column rather than substituting a default', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L55]: the column declares no `default=`, so an
    // unset `amountType` is genuinely absent. Substituting one of the three would hand the
    // service's defaultless `switch` [model/service/PriceGroupService.cfc:L321-L336] a branch the
    // row never chose.
    expect(aRate().getAmountType()).toBeUndefined();
  });

  it('rejects a fourth value at compile time', () => {
    // The out-of-vocabulary column string the legacy schema cannot prevent - published by the
    // shared fixture graph precisely so a boundary suite can drive narrowing with it.
    const fixtures = makePriceGroupFixtures();

    expect(fixtures.unrecognisedAmountTypeColumnValue).toBe('flatRate');

    // @ts-expect-error out-of-vocabulary column string, not assignable without a cast
    // `PriceGroupRateAmountType` is closed at the three values published by
    // `getAmountTypeOptions()` [model/entity/PriceGroupRate.cfc:L87-L93], and no cast is available
    // here, which is the point.
    const rejected: PriceGroupRateAmountType = fixtures.unrecognisedAmountTypeColumnValue;

    expect(rejected).toBe('flatRate');
  });

  it('models an out-of-vocabulary row as an ABSENT amount type, never as a cast', () => {
    // JUDGMENT CALL: the closed union leaves exactly one in-type representation for a row the
    // vocabulary does not admit - an absent amount type - and the shared fixture graph takes it.
    const fixtures = makePriceGroupFixtures();

    expect(fixtures.unrecognisedAmountTypeRate.getAmountType()).toBeUndefined();
  });
});

// --- getAmountFormatted -----------------------------------------------------

describe('getAmountFormatted: the percentage branch drops trailing zeros', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L262-L268]: `getAmountFormatted` branches ONLY on
  // `percentageOff`, which uses RAW CFML string concatenation with a literal `"%"`:
  //   return getAmount() & "%"
  // at [L264], so trailing zeros are DROPPED and a stored `12.50` renders `"12.5%"`. `amountOff`
  // and `amount` both fall through to `formatValue(getAmount(),"currency")` at [L266] and keep two
  // decimal places. CONTRAST [model/entity/PromotionReward.cfc:L401-L407], which calls
  // `formatValue(getAmount(), "percentage")` on its percentage branch instead - a different
  // mechanism with different rounding. The two must never be conflated, and this entity's method
  // sits inside the "Overridden Methods" banner [L260/L278] rather than under a "Custom Formatting
  // Methods" banner of its own, unlike [model/entity/PromotionReward.cfc:L399/L409]. JUDGMENT CALL:
  // every expectation below is a LITERAL string rather than a value re-derived by importing
  // `cfNumberToString()` and calling it here.

  it('renders a stored 12.50 as "12.5%", not "12.50%"', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'percentageOff',
    });

    expect(subject.getAmountFormatted()).toBe('12.5%');
    expect(subject.getAmountFormatted()).not.toBe('12.50%');
  });

  it('drops both trailing zeros of a stored 20.00', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('20.00'),
      amountType: 'percentageOff',
    });

    expect(subject.getAmountFormatted()).toBe('20%');
  });

  it('keeps a significant final digit', () => {
    expect(
      aRate({
        amount: Money.fromDecimalString('12.25'),
        amountType: 'percentageOff',
      }).getAmountFormatted(),
    ).toBe('12.25%');
    expect(
      aRate({
        amount: Money.fromDecimalString('0.5'),
        amountType: 'percentageOff',
      }).getAmountFormatted(),
    ).toBe('0.5%');
    expect(
      aRate({
        amount: Money.fromDecimalString('100'),
        amountType: 'percentageOff',
      }).getAmountFormatted(),
    ).toBe('100%');
  });

  it('appends the literal percent sign and nothing else', () => {
    const formatted = aRate({
      amount: Money.fromDecimalString('7.5'),
      amountType: 'percentageOff',
    }).getAmountFormatted();

    expect(formatted).toBe('7.5%');
    expect(formatted.endsWith('%')).toBe(true);
    expect(formatted).not.toContain(' ');
    expect(formatted).not.toContain('%%');
  });

  it('takes the percentage branch for a mis-cased stored amountType', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L263]: the legacy test is `==`, which on strings
    // is CASE-INSENSITIVE in CFML, so a rate stored as `'PercentageOff'` renders as a PERCENTAGE
    // there. `SwPriceGroupRate.amountType` is a plain `ormType="string"` column with no check
    // constraint, so that spelling is a state the column can genuinely hold - and the repository
    // reader hands back the PERSISTED BYTES rather than a canonical member, precisely so that saving
    // a loaded rate cannot rewrite the column. `PriceGroupRateAmountType` therefore promises
    // membership up to case, NOT an exact spelling, and this case pins that the formatter agrees.
    //
    // An exact comparison sent this to the CURRENCY branch instead, rendering `"12.50"` where the
    // legacy renders `"12.5%"` - a percentage silently presented as an amount of money.
    //
    // The cast is what lets the test supply the spelling the DATABASE can hold rather than only the
    // spellings the union spells; it stands in for the repository boundary, which is the only
    // production path that can produce such a value.
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'PercentageOff' as PriceGroupRateAmountType,
    });

    expect(subject.getAmountFormatted()).toBe('12.5%');
    expect(subject.getAmountFormatted()).not.toBe('12.50');
  });

  it('still falls through to the currency branch for a value outside the vocabulary', () => {
    // Folding case widened WHICH spellings reach the percentage branch; it did not open the
    // vocabulary. A genuinely unrecognised value still takes [L266], exactly as before.
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'somethingElse' as PriceGroupRateAmountType,
    });

    expect(subject.getAmountFormatted()).toBe('12.50');
  });

  it('renders a bare "%" when the amount column is null', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L264]: the legacy concatenates `getAmount()`
    // with no null guard, and CFML concatenation of a null operand yields the EMPTY STRING rather
    // than raising, so the percent sign survives alone. `0` is never substituted: `amount` declares
    // no default at [L54], and a zero would read as a real zero-percent discount.
    const subject = aRate({ amountType: 'percentageOff' });

    expect(subject.getAmount()).toBeUndefined();
    expect(subject.getAmountFormatted()).toBe('%');
  });

  it('reaches the percentage branch on an exact, case-sensitive match', () => {
    // CFML `==` at [L263] compares strings case-INSENSITIVELY, while the port compares with `===`.
    expect(
      aRate({
        amount: Money.fromDecimalString('9'),
        amountType: 'percentageOff',
      }).getAmountFormatted(),
    ).toBe('9%');
  });
});

describe('getAmountFormatted: every other branch is two-decimal currency', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L265-L267]: the `else` covers `amountOff`,
  // `amount` AND an absent or unrecognised amount type - the strict comparison at [L263] simply
  // fails for anything that is not the exact string `"percentageOff"`.

  it('renders amountOff with two decimal places', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('12.5'),
      amountType: 'amountOff',
    });

    expect(subject.getAmountFormatted()).toBe('12.50');
  });

  it('renders the fixed amount type with two decimal places', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('9.9'),
      amountType: 'amount',
    });

    expect(subject.getAmountFormatted()).toBe('9.90');
  });

  it('pads a whole number to two decimal places on both currency branches', () => {
    expect(
      aRate({
        amount: Money.fromDecimalString('30'),
        amountType: 'amountOff',
      }).getAmountFormatted(),
    ).toBe('30.00');
    expect(
      aRate({ amount: Money.fromDecimalString('30'), amountType: 'amount' }).getAmountFormatted(),
    ).toBe('30.00');
  });

  it('falls through to the currency branch when the amount type is absent', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L263]: the comparison is against the single
    // literal `"percentageOff"`, so ANY other state - including a null column - takes the `else` at
    // [L265-L267].
    const subject = aRate({ amount: Money.fromDecimalString('12.5') });

    expect(subject.getAmountType()).toBeUndefined();
    expect(subject.getAmountFormatted()).toBe('12.50');
  });

  it('renders the empty string when both the amount and the amount type are absent', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L266]: `formatValue(null,"currency")` yields no
    // digits, so the currency branch folds an absent amount to `''` - the counterpart of the bare
    // `"%"` the percentage branch produces.
    const subject = aRate();

    expect(subject.getAmountFormatted()).toBe('');
  });

  it('renders the empty string for an absent amount on the amountOff branch too', () => {
    expect(aRate({ amountType: 'amountOff' }).getAmountFormatted()).toBe('');
    expect(aRate({ amountType: 'amount' }).getAmountFormatted()).toBe('');
  });

  it('invents no currency symbol and no thousands separator', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L266]: `formatValue(v,"currency")` is a
    // non-ported org/Hibachi/** formatter whose locale resolution and currency-symbol behaviour are
    // NOT reproduced, because JavaRB is not ported and no i18n runtime is introduced.
    const formatted = aRate({
      amount: Money.fromDecimalString('1234.5'),
      amountType: 'amountOff',
    }).getAmountFormatted();

    expect(formatted).toBe('1234.50');
    expect(formatted).not.toContain('$');
    expect(formatted).not.toContain(',');
    expect(formatted).not.toContain('USD');
    expect(formatted).not.toContain('%');
  });

  it('never raises, on any combination of amount and amount type', () => {
    const amounts: readonly (Money | undefined)[] = [
      undefined,
      Money.fromDecimalString('0'),
      Money.fromDecimalString('12.50'),
    ];
    const amountTypes: readonly (PriceGroupRateAmountType | undefined)[] = [
      undefined,
      'percentageOff',
      'amountOff',
      'amount',
    ];

    for (const amount of amounts) {
      for (const amountType of amountTypes) {
        expect(typeof aRate({ amount, amountType }).getAmountFormatted()).toBe('string');
      }
    }
  });

  it('renders a stored zero as a real zero on both kinds of branch', () => {
    expect(
      aRate({
        amount: Money.fromDecimalString('0'),
        amountType: 'percentageOff',
      }).getAmountFormatted(),
    ).toBe('0%');
    expect(
      aRate({ amount: Money.fromDecimalString('0'), amountType: 'amount' }).getAmountFormatted(),
    ).toBe('0.00');
  });

  it('agrees with the shared fixture graph on all three recognised branches', () => {
    // BOUNDARY, stated because one of these literals invites a misreading: every value below is the
    // fixture's STORED amount rendered by `getAmountFormatted()`.
    const fixtures = makePriceGroupFixtures();

    expect(fixtures.percentageOffRateWithRoundingRule.getAmount()?.toDecimalString()).toBe('12.5');
    expect(fixtures.percentageOffRateWithRoundingRule.getAmountFormatted()).toBe('12.5%');
    expect(fixtures.amountOffRateWithRoundingRule.getAmount()?.toDecimalString()).toBe('5');
    expect(fixtures.amountOffRateWithRoundingRule.getAmountFormatted()).toBe('5.00');
    expect(fixtures.fixedAmountRateWithRoundingRule.getAmount()?.toDecimalString()).toBe('9.99');
    expect(fixtures.fixedAmountRateWithRoundingRule.getAmountFormatted()).toBe('9.99');
    expect(fixtures.unrecognisedAmountTypeRate.getAmountFormatted()).toBe('7.50');
  });
});

describe('the amount column itself', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L54]: `ormType="big_decimal"` with
  // `hb_formatType="custom"` and NO `default=`. The `custom` format type is the attribute that
  // routes the admin's display of this column to `getAmountFormatted()` [L262-L268]; the two are
  // halves of one mechanism and both are preserved. CFML parity: this is one of exactly FOUR
  // no-default money columns in the in-scope slice - alongside [model/entity/SkuCurrency.cfc:L53],
  // [model/entity/PromotionApplied.cfc:L53] and [model/entity/PromotionReward.cfc:L61] - in
  // deliberate contrast with `Sku.price`, `listPrice` and `renewalPrice`, which all declare
  // `default="0"`.

  it('is undefined when the column is null, never zero', () => {
    const subject = aRate();

    expect(subject.getAmount()).toBeUndefined();
  });

  it('round-trips a Money value unchanged', () => {
    const amount = Money.fromDecimalString('19.99');
    const subject = aRate({ amount });

    expect(subject.getAmount()).toBe(amount);
    expect(subject.getAmount()?.toDecimalString()).toBe('19.99');
  });

  it('carries a value the arbitrary-precision substrate keeps exactly', () => {
    // P4: money is only ever constructed from decimal strings, so no IEEE-754 drift can enter an
    // expectation.
    const subject = aRate({ amount: Money.fromDecimalString('7.49625') });

    expect(subject.getAmount()?.toDecimalString()).toBe('7.49625');
  });
});

// --- getSimpleRepresentationPropertyName and getDisplayName -----------------

describe('getSimpleRepresentationPropertyName', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L270-L272]: returns the literal `"DisplayName"`
  // with a CAPITAL D, while the property is declared lowercase `displayName` at [L82] and the
  // accessor is `getDisplayName()` at [L274]. Compare, all re-read for this suite:
  // [model/entity/PromotionQualifier.cfc:L355-L357] -> "qualifierType";
  // [model/entity/PromotionReward.cfc:L413-L415] -> "rewardType";
  // [model/entity/PromotionCode.cfc:L171-L173] -> "promotionCode";
  // [model/entity/Product.cfc:L791-L793] -> "productName".

  it('returns exactly "DisplayName", with the capital D', () => {
    const subject = aRate();

    expect(subject.getSimpleRepresentationPropertyName()).toBe('DisplayName');
  });

  it('is not lowercased to match the property declaration at L82', () => {
    const returned = aRate().getSimpleRepresentationPropertyName();

    expect(returned).not.toBe('displayName');
    expect(returned.charAt(0)).toBe('D');
  });

  it('names a property whose accessor the port really does ship', () => {
    // The value is only useful if `get` + the returned name resolves to a real member, which is the
    // whole mechanism the framework relies on.
    const subject = aRate({ priceGroup: aPriceGroup('Wholesale') });
    const accessorName = `get${subject.getSimpleRepresentationPropertyName()}`;

    expect(accessorName).toBe('getDisplayName');
    expect(PORTED_PUBLIC_SURFACE).toContain(accessorName);
    expect(typeof subject.getDisplayName).toBe('function');
  });

  it('answers the same for every rate, saved or not, global or not', () => {
    expect(aRate({ priceGroupRateID: UNSAVED_RATE_ID }).getSimpleRepresentationPropertyName()).toBe(
      'DisplayName',
    );
    expect(aRate({ globalFlag: true }).getSimpleRepresentationPropertyName()).toBe('DisplayName');
  });

  it('does not also declare the override variant of the same mechanism', () => {
    // CFML parity: this component supplies the PROPERTY-NAME form. Contrast
    // [model/entity/ProductType.cfc:L273], which overrides `getSimpleRepresentation()` itself.
    const subject = aRate();

    expect('getSimpleRepresentation' in subject).toBe(false);
    expect(PORTED_PUBLIC_SURFACE).not.toContain('getSimpleRepresentation');
  });
});

describe('getDisplayName', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L274-L276]:
  //
  //   return getPriceGroup().getPriceGroupName() & " - " & getAmount() & " - " & getAmountType();
  //
  // TWO `" - "` separators, space-hyphen-space, preserved byte for byte. THREE NULLABLE READS with
  // TWO DIFFERENT OUTCOMES, and the difference is CFML's rather than a choice made here:
  // `getPriceGroup()` is DEREFERENCED, so a null there is a method call on null and the legacy
  // throws, while `getAmount()` and `getAmountType()` are merely CONCATENATED and CFML folds a null
  // operand to the empty string. The far side's `getPriceGroupName()` is itself nullable and is
  // likewise concatenated, so it folds too.

  it('joins the price group name, the amount and the amount type with " - " twice', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'percentageOff',
      priceGroup: aPriceGroup('Wholesale'),
    });

    expect(subject.getDisplayName()).toBe('Wholesale - 12.5 - percentageOff');
    expect(subject.getDisplayName().split(' - ')).toHaveLength(3);
  });

  it('interpolates the amount RAW, not through getAmountFormatted', () => {
    // [L275] concatenates `getAmount()` directly.
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'percentageOff',
      priceGroup: aPriceGroup('Wholesale'),
    });

    expect(subject.getDisplayName()).not.toContain('%');
    expect(subject.getDisplayName()).toContain(' - 12.5 - ');
    expect(subject.getAmountFormatted()).toBe('12.5%');
  });

  it('pads nothing on a currency-typed rate either', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('5.00'),
      amountType: 'amountOff',
      priceGroup: aPriceGroup('Trade'),
    });

    expect(subject.getDisplayName()).toBe('Trade - 5 - amountOff');
    expect(subject.getAmountFormatted()).toBe('5.00');
  });

  it('folds an absent amount to the empty string, keeping both separators', () => {
    const subject = aRate({
      amountType: 'percentageOff',
      priceGroup: aPriceGroup('Wholesale'),
    });

    expect(subject.getDisplayName()).toBe('Wholesale -  - percentageOff');
  });

  it('folds an absent amount type to the empty string, keeping both separators', () => {
    const subject = aRate({
      amount: Money.fromDecimalString('12.5'),
      priceGroup: aPriceGroup('Wholesale'),
    });

    expect(subject.getDisplayName()).toBe('Wholesale - 12.5 - ');
  });

  it('folds an absent price group NAME to the empty string without raising', () => {
    // The price group is PRESENT, so the dereference at [L275] succeeds; only its nullable name
    // folds.
    const subject = aRate({
      amount: Money.fromDecimalString('12.5'),
      amountType: 'amount',
      priceGroup: aPriceGroupWithNoName(),
    });

    expect(subject.getPriceGroup()).toBeDefined();
    expect(subject.getDisplayName()).toBe(' - 12.5 - amount');
  });

  it('folds all three absences at once, leaving just the two separators', () => {
    const subject = aRate({ priceGroup: aPriceGroupWithNoName() });

    expect(subject.getDisplayName()).toBe(' -  - ');
  });

  it('RAISES when the rate has no materialized price group', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L275]: `getPriceGroup()` is dereferenced with NO
    // null guard, so a rate whose price group is unset is a null-reference error in CFML too.
    const subject = aRate();

    expect(subject.getPriceGroup()).toBeUndefined();
    expect(() => subject.getDisplayName()).toThrow(/no materialized priceGroup/);
  });

  it('RAISES for an unsaved rate as readily as a saved one', () => {
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });

    expect(() => subject.getDisplayName()).toThrow(Error);
  });

  it('RAISES again after the price group has been removed', () => {
    // `removePriceGroup()` clears the field unconditionally at [L195], so a rate that once had a
    // price group returns to the raising state.
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate({ priceGroup });

    expect(subject.getDisplayName()).toBe('Wholesale -  - ');

    subject.removePriceGroup();

    expect(() => subject.getDisplayName()).toThrow(Error);
  });

  it('means a fresh instance has no usable simple representation, which is a finding', () => {
    // This is why [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]'s inherited
    // `simple_representation_exists_and_is_simple()` is NOT forced into this suite.
    const fresh = aRate({ priceGroupRateID: UNSAVED_RATE_ID });

    expect(fresh.getSimpleRepresentationPropertyName()).toBe('DisplayName');
    expect(() => fresh.getDisplayName()).toThrow(Error);
  });

  it('reports the price group name the fixture graph wired in', () => {
    const fixtures = makePriceGroupFixtures();

    expect(fixtures.productTypeLevelRate.getDisplayName()).toBe(
      'Child price group - 30 - percentageOff',
    );
  });
});

describe('getAmountRepresentation does not exist', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc]: there is NO `getAmountRepresentation()` anywhere
  // in the 284 lines - verified by reading the whole file - yet
  // [model/service/PriceGroupService.cfc:L243] calls exactly that on a rate while building the
  // admin's price-group JSON. In CFML the call falls through the runtime dispatcher and terminates
  // in the throw at [org/Hibachi/HibachiEntity.cfc:L565], because this entity declares no
  // `attributeValues` property and so cannot even reach the EAV fallback at [L559]. The consumer's
  // behaviour at [model/service/PriceGroupService.cfc:L230-L246], which also contains the separate
  // `local.i` slip at [L236], is pinned by ITS OWN service suite.

  it('is absent from the prototype and from the instance', () => {
    const subject = aRate();

    expect(Object.getOwnPropertyNames(PriceGroupRate.prototype)).not.toContain(
      'getAmountRepresentation',
    );
    expect('getAmountRepresentation' in subject).toBe(false);
    expect(PORTED_PUBLIC_SURFACE).not.toContain('getAmountRepresentation');
  });

  it('is a compile error as well as a runtime absence', () => {
    const subject = aRate();

    // @ts-expect-error no such member: the port ships no dynamic dispatch
    // [model/entity/PriceGroupRate.cfc] declares no `getAmountRepresentation` even though
    // [model/service/PriceGroupService.cfc:L243] calls it. Porting no dispatcher is what turns that
    // legacy runtime throw into a type error here.
    const absent: unknown = subject.getAmountRepresentation;

    expect(absent).toBeUndefined();
  });

  it('is not silently satisfied by any similarly-named member', () => {
    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    expect(members).toContain('getAmountFormatted');
    expect(members).toContain('getAmount');
    expect([...members.filter((member) => member.startsWith('getAmount'))].sort()).toStrictEqual([
      'getAmount',
      'getAmountFormatted',
      'getAmountType',
      'getAmountTypeOptions',
    ]);
  });
});

// --- The three excluded collections, and the cascade that never reads them -----

describe('the three excluded collections and the gap they represent', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
  // `excludedProducts` and `excludedSkus` are RETAINED for schema and interface fidelity even
  // though the five-level cascade [model/service/PriceGroupService.cfc:L140-L181] NEVER consults
  // any of them, and the global short-circuit at [L106-L108] bypasses them too. Re-read for this
  // suite: the cascade's only membership question is `hasSku()` at [L142], its only flag read is
  // `getGlobalFlag()`, and its parent recursion at [L174] calls the PRODUCT variant rather than the
  // SKU one, so at no point does it ask whether anything is EXCLUDED. Their ONLY reader anywhere in
  // the in-scope slice is `getAppliesTo()`'s display prose.
  //
  // The gap is FLAGGED per AAP 0.4.1 and the columns are NOT removed: dropping them would break the
  // `Sw*` schema contract, and inventing a filtering step the legacy cascade does not perform would
  // change which price a customer is charged. This is a `CFML parity` note rather than a defect
  // marker, because the source is internally consistent: it simply never wired the exclusions to
  // anything but a label.

  it('ships an accessor for each of the three, and they default to empty', () => {
    const subject = aRate();

    expect(subject.getExcludedProductTypes()).toStrictEqual([]);
    expect(subject.getExcludedProducts()).toStrictEqual([]);
    expect(subject.getExcludedSkus()).toStrictEqual([]);
  });

  it('hands back exactly what the repository materialized, in order', () => {
    const excludedProductTypes = productTypes(2);
    const excludedProducts = products(3);
    const excludedSkus = skus(1);
    const subject = aRate({ excludedProductTypes, excludedProducts, excludedSkus });

    expect(subject.getExcludedProductTypes()).toStrictEqual(excludedProductTypes);
    expect(subject.getExcludedProducts()).toStrictEqual(excludedProducts);
    expect(subject.getExcludedSkus()).toStrictEqual(excludedSkus);
  });

  it('feeds getAppliesTo, which is their ONLY reader', () => {
    // Populating all three changes the label and NOTHING else that this entity publishes.
    const subject = aRate({
      amount: Money.fromDecimalString('12.5'),
      amountType: 'percentageOff',
      excludedProductTypes: productTypes(1),
      excludedProducts: products(2),
      excludedSkus: skus(3),
      priceGroup: aPriceGroup('Wholesale'),
    });

    expect(subject.getAppliesTo()).toBe('Excluding: 2 Products and 1 Product Type,3 SKUs');

    // Everything else is untouched by the exclusions.
    expect(subject.getAmountFormatted()).toBe('12.5%');
    expect(subject.getDisplayName()).toBe('Wholesale - 12.5 - percentageOff');
    expect(subject.getAmountTypeOptions()).toHaveLength(3);
    expect(subject.getGlobalFlag()).toBe(false);
    expect(subject.isNew()).toBe(false);
  });

  it('is invisible to the three containment probes, which only ever read the include side', () => {
    // The probes at [model/entity/PriceGroupRate.cfc:L200, L220, L240] interrogate
    // `variables.productTypes` / `products` / `skus`.
    const excludedProductType = aProductType('ptp-excluded');
    const excludedProduct = aProduct('prd-excluded');
    const excludedSku = aSku('sku-excluded');
    const subject = aRate({
      excludedProductTypes: [excludedProductType],
      excludedProducts: [excludedProduct],
      excludedSkus: [excludedSku],
    });

    expect(subject.hasProductType(excludedProductType)).toBe(false);
    expect(subject.hasProduct(excludedProduct)).toBe(false);
    expect(subject.hasSku(excludedSku)).toBe(false);
  });

  it('lets the same entity sit on both sides at once, with each side reported separately', () => {
    // Nothing in the legacy component forbids it - there is no cross-collection validation rule in
    // model/validation/PriceGroupRate.json and no guard in the helper block - so the contradictory
    // state is representable, and the label reports both halves without complaint.
    const sku = aSku('sku-on-both-sides');
    const subject = aRate({ skus: [sku], excludedSkus: [sku] });

    expect(subject.hasSku(sku)).toBe(true);
    expect(subject.getAppliesTo()).toBe('Including: 1 SKU. Excluding: 1 SKU');
  });

  it('is bypassed entirely by the global short-circuit', () => {
    const subject = aRate({
      globalFlag: true,
      excludedProductTypes: productTypes(2),
      excludedProducts: products(2),
      excludedSkus: skus(2),
    });

    expect(subject.getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
    // The collections are still materialized and still readable - only the label ignores them.
    expect(subject.getExcludedSkus()).toHaveLength(2);
  });

  it('ships NO add or remove helper for any of the three, and none is invented', () => {
    // Verified first-hand by reading the whole helper block
    // [model/entity/PriceGroupRate.cfc:L178-L258]: there is no `addExcludedProductType`,
    // `removeExcludedProductType`, `addExcludedProduct`, `removeExcludedProduct`, `addExcludedSku`
    // or `removeExcludedSku` anywhere in the 284 lines. The include side has all six helpers; the
    // exclude side has none. Authoring even one would be a signature widening this file has no
    // budget for - and it would make a PER-MEMBER change to what a rate covers reachable, which is
    // the thing the source never exposes. The generated WHOLE-COLLECTION setter is a different
    // member and is asserted present below.
    const subject = aRate();
    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    for (const forbidden of [
      'addExcludedProductType',
      'removeExcludedProductType',
      'addExcludedProduct',
      'removeExcludedProduct',
      'addExcludedSku',
      'removeExcludedSku',
    ]) {
      expect(members).not.toContain(forbidden);
      expect(forbidden in subject).toBe(false);
    }

    // ★ THE WHOLE-COLLECTION SETTERS *ARE* SHIPPED, AND THE DISTINCTION IS THE POINT OF THIS TEST.
    // `component ... accessors=true` [model/entity/PriceGroupRate.cfc:L49] generates a
    // `set<Property>` for every declared property, so CFML generated `setExcludedProducts`,
    // `setExcludedProductTypes` and `setExcludedSKUs`, and `savePriceGroupRate` calls all three at
    // [model/service/PriceGroupService.cfc:L440-L442] to clear a rate that has just been made
    // global. What the exclude side genuinely lacks is the PER-MEMBER `add*`/`remove*` pair,
    // asserted above - and a whole-collection replace is not a per-member mutation, which is why the
    // cascade can never grow one member at a time and why the collections are handed out `readonly`.
    expect(members.filter((member) => member.includes('Excluded')).sort()).toStrictEqual([
      'getExcludedProductTypes',
      'getExcludedProducts',
      'getExcludedSkus',
      'setExcludedProductTypes',
      'setExcludedProducts',
      'setExcludedSkus',
    ]);
  });

  it('rejects a mutating helper at compile time as well as at runtime', () => {
    const subject = aRate();

    // @ts-expect-error no such helper on the exclude side
    // [model/entity/PriceGroupRate.cfc:L178-L258] declares no helper for any of the three exclude
    // collections - the ORM population path is their only writer.
    const absent: unknown = subject.addExcludedSku;

    expect(absent).toBeUndefined();
  });

  it('is typed readonly, so the type system states that nothing here mutates them', () => {
    // JUDGMENT CALL: the assertion is a compile-time one because the fact being pinned is a
    // compile-time fact. The three include accessors return a mutable `T[]` because this class's own
    // helpers splice them, so a caller holding one may empty it - which is exactly how
    // [model/service/PriceGroupService.cfc:L437-L439] is ported. The three exclude accessors return
    // `readonly T[]` because NO CALLER may write them: the only writer is the class's own generated
    // setter. A runtime `Object.isFrozen` check would assert something different and false.
    //
    // ★ `readonly` HERE MEANS "NOT WRITABLE THROUGH THIS REFERENCE", NOT "NEVER EMPTIED".
    // `setExcludedSkus` exists and is called at [model/service/PriceGroupService.cfc:L442]. What it
    // does is splice the held array to the incoming contents rather than swap in a new one, so a
    // caller holding an earlier result observes the emptying - the same thing a caller holding the
    // legacy Hibernate bag observed when `setExcludedSKUs([])` cleared it. This return type states
    // that such a caller cannot perform that emptying itself.
    const subject = aRate({ excludedSkus: skus(1) });

    // The readonly result is assignable to a readonly binding...
    const excluded: readonly Sku[] = subject.getExcludedSkus();

    // @ts-expect-error readonly Sku[] is not assignable to a mutable Sku[]
    // `getExcludedSkus()` returns `readonly Sku[]` because no code path in
    // [model/entity/PriceGroupRate.cfc:L178-L258] ever appends to an exclude collection. The three
    // INCLUDE accessors are deliberately mutable, and the contrast below is the point.
    const mutable: Sku[] = subject.getExcludedSkus();

    // The three include accessors, by contrast, hand out a genuinely mutable array.
    const includedIsMutable: Sku[] = subject.getSkus();

    expect(excluded).toHaveLength(1);
    expect(mutable).toHaveLength(1);
    expect(includedIsMutable).toHaveLength(0);
  });
});

// --- Collection accessors, containment probes, and the link-table contract -----

describe('collection accessors', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L71-L77]: a Hibernate-managed collection is never
  // null, so all six accessors answer with an array on a rate constructed with none - never
  // `undefined`, never a sentinel. THE THREE INCLUDE ARRAYS ARE HANDED OUT LIVE because this
  // class's own helpers at [L201, L208-L210, L221, L228-L230, L241, L248-L250] mutate the very
  // array the accessor returns; a defensive copy would make `addSku()` invisible to a caller
  // holding an earlier `getSkus()` result, which is not how the legacy `variables.skus` behaves.

  it('answers with a real array for all six, even when the constructor supplied none', () => {
    const subject = aRate();

    for (const collection of [
      subject.getProductTypes(),
      subject.getProducts(),
      subject.getSkus(),
      subject.getExcludedProductTypes(),
      subject.getExcludedProducts(),
      subject.getExcludedSkus(),
    ]) {
      expect(Array.isArray(collection)).toBe(true);
      expect(collection).toHaveLength(0);
    }
  });

  it('never hands out undefined for a collection', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L71-L77]: NOT ONE of the six declares
    // `type="array"`, unlike [model/entity/PromotionReward.cfc:L74, L86, L87] and
    // [model/entity/PromotionQualifier.cfc:L83, L84], which do.
    const subject = aRate();

    expect(subject.getProductTypes()).not.toBeUndefined();
    expect(subject.getProducts()).not.toBeUndefined();
    expect(subject.getSkus()).not.toBeUndefined();
    expect(subject.getExcludedProductTypes()).not.toBeUndefined();
    expect(subject.getExcludedProducts()).not.toBeUndefined();
    expect(subject.getExcludedSkus()).not.toBeUndefined();
  });

  it('hands out the LIVE include arrays, not defensive copies', () => {
    const productTypeList = productTypes(1);
    const productList = products(1);
    const skuList = skus(1);
    const subject = aRate({
      productTypes: productTypeList,
      products: productList,
      skus: skuList,
    });

    expect(subject.getProductTypes()).toBe(productTypeList);
    expect(subject.getProducts()).toBe(productList);
    expect(subject.getSkus()).toBe(skuList);
  });

  it('lets a caller observe a later add through an accessor result captured earlier', () => {
    // This is the behaviour a defensive copy would silently destroy, so it is asserted directly
    // rather than inferred from the identity check above.
    const subject = aRate();
    const capturedEarly: Sku[] = subject.getSkus();

    subject.addSku(aSku('sku-added-later'));

    expect(capturedEarly).toHaveLength(1);
    expect(subject.getSkus()).toBe(capturedEarly);
  });

  it('hands out the materialized exclude arrays without copying them either', () => {
    const excludedSkuList = skus(2);
    const subject = aRate({ excludedSkus: excludedSkuList });

    expect(subject.getExcludedSkus()).toBe(excludedSkuList);
  });

  it('keeps the collections of two separate rates completely separate', () => {
    // A2: a shared array literal hoisted to module scope would let one test's membership leak into
    // another's.
    const first = aRate({ skus: skus(1) });
    const second = aRate();

    second.addSku(aSku('sku-only-on-second'));

    expect(first.getSkus()).toHaveLength(1);
    expect(second.getSkus()).toHaveLength(1);
    expect(first.getSkus()).not.toBe(second.getSkus());
    expect(first.getSkus()[0]?.getSkuID()).toBe('sku-1');
    expect(second.getSkus()[0]?.getSkuID()).toBe('sku-only-on-second');
  });
});

describe('hasProductType, hasProduct and hasSku compare by primary key only', () => {
  // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: the framework's generated `has*` is
  // Hibernate's collection-contains, which resolves on session identity - the primary key for a
  // persistent row. The three probes exist here ONLY because this class's own helpers call them, at
  // [model/entity/PriceGroupRate.cfc:L200, L220, L240].

  it('matches a DIFFERENT instance carrying the same key', () => {
    const subject = aRate({ skus: [aSku('sku-42')] });
    const equivalentButDistinct = aSku('sku-42');

    expect(subject.getSkus()[0]).not.toBe(equivalentButDistinct);
    expect(subject.hasSku(equivalentButDistinct)).toBe(true);
  });

  it('does not match on object identity when the keys differ', () => {
    const held = aSku('sku-42');
    const subject = aRate({ skus: [held] });

    expect(subject.hasSku(aSku('sku-43'))).toBe(false);
  });

  it('applies the same rule to product types and to products', () => {
    const subject = aRate({
      productTypes: [aProductType('ptp-9')],
      products: [aProduct('prd-9')],
    });

    expect(subject.hasProductType(aProductType('ptp-9'))).toBe(true);
    expect(subject.hasProductType(aProductType('ptp-8'))).toBe(false);
    expect(subject.hasProduct(aProduct('prd-9'))).toBe(true);
    expect(subject.hasProduct(aProduct('prd-8'))).toBe(false);
  });

  it('answers false on an empty collection rather than raising', () => {
    const subject = aRate();

    expect(subject.hasProductType(aProductType())).toBe(false);
    expect(subject.hasProduct(aProduct())).toBe(false);
    expect(subject.hasSku(aSku())).toBe(false);
  });

  it('finds a key held at any position, not just the first', () => {
    const subject = aRate({ skus: skus(4) });

    expect(subject.hasSku(aSku('sku-1'))).toBe(true);
    expect(subject.hasSku(aSku('sku-4'))).toBe(true);
    expect(subject.hasSku(aSku('sku-5'))).toBe(false);
  });

  it('does not confuse the three collections with one another', () => {
    // The keys are deliberately identical strings across the three types, so a probe that compared
    // raw key text without regard to which collection it was reading would pass wrongly.
    const subject = aRate({ productTypes: [aProductType('shared-key')] });

    expect(subject.hasProductType(aProductType('shared-key'))).toBe(true);
    expect(subject.hasProduct(aProduct('shared-key'))).toBe(false);
    expect(subject.hasSku(aSku('shared-key'))).toBe(false);
  });

  it('cannot tell two unsaved rows apart, which is why every call site guards first', () => {
    // CFML parity: `unsavedvalue=""` at [model/entity/PriceGroupRate.cfc:L52] and its equivalents
    // mean every unsaved row's key is `''`, so a key comparison necessarily conflates them. That is
    // never reached in practice because the near-side guards at [L200, L220, L240] short-circuit on
    // `arguments.<x>.isNew()` BEFORE the probe runs.
    const heldUnsaved = anUnsavedSku();
    const subject = aRate({ skus: [heldUnsaved] });
    const differentUnsaved = anUnsavedSku();

    expect(heldUnsaved).not.toBe(differentUnsaved);
    expect(subject.hasSku(differentUnsaved)).toBe(true);
    expect(subject.hasSku(aSku('sku-1'))).toBe(false);
  });
});

// --- setPriceGroup and removePriceGroup: the many-to-one pair ---------------

describe('setPriceGroup', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L181-L186]:
  //
  //   variables.priceGroup = arguments.priceGroup;
  //   if(isNew() or !arguments.priceGroup.hasPriceGroupRate( this )) {
  //     arrayAppend(arguments.priceGroup.getPriceGroupRates(), this);
  //   }
  //
  // The near-side assignment is UNCONDITIONAL and happens FIRST; only the far-side append is
  // guarded. `isNew()` is evaluated first and CFML's `or` short-circuits, which `||` reproduces
  // exactly, so an unsaved rate never asks the far side whether it already holds this rate. This is
  // the method [model/entity/PriceGroup.cfc:L144-L146] delegates to - `addPriceGroupRate` is
  // `arguments.priceGroupRate.setPriceGroup( this )`, so the near side of the parent's helper is
  // this method's far side.

  it('stores the price group on the rate', () => {
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate();

    expect(subject.getPriceGroup()).toBeUndefined();

    subject.setPriceGroup(priceGroup);

    expect(subject.getPriceGroup()).toBe(priceGroup);
  });

  it('appends the rate to the price group, on the live far-side array', () => {
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate();

    subject.setPriceGroup(priceGroup);

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([subject]);
  });

  it('does not append twice for a SAVED rate, because the far-side probe short-circuits it', () => {
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });

    subject.setPriceGroup(priceGroup);
    subject.setPriceGroup(priceGroup);

    expect(subject.isNew()).toBe(false);
    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);
  });

  it('DOES append twice for an UNSAVED rate - defect D25, reproduced', () => {
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L183]: the guard is
    //   `isNew() or !arguments.priceGroup.hasPriceGroupRate(this)`,
    // so for an unsaved rate the first disjunct is true and the containment probe is NEVER
    // consulted: two calls with the same price group append the same rate twice. Reproduced
    // exactly, because reordering the disjuncts or adding a containment check for the unsaved case
    // would change which appends happen, and the parent's collection is what ends up persisted.
    //
    // Preserved deliberately; do not fix without a product decision.
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });

    subject.setPriceGroup(priceGroup);
    subject.setPriceGroup(priceGroup);

    expect(subject.isNew()).toBe(true);
    expect(priceGroup.getPriceGroupRates()).toHaveLength(2);
    expect(priceGroup.getPriceGroupRates()[0]).toBe(subject);
    expect(priceGroup.getPriceGroupRates()[1]).toBe(subject);
  });

  it('replaces an earlier price group on the near side without unlinking the old far side', () => {
    // Nothing in [L181-L186] detaches the previous parent - the assignment simply overwrites.
    const first = aPriceGroup('Wholesale');
    const second = aPriceGroup('Trade');
    const subject = aRate();

    subject.setPriceGroup(first);
    subject.setPriceGroup(second);

    expect(subject.getPriceGroup()).toBe(second);
    expect(first.getPriceGroupRates()).toStrictEqual([subject]);
    expect(second.getPriceGroupRates()).toStrictEqual([subject]);
  });

  it('assigns the near side even when the far-side append is skipped', () => {
    // The assignment at [L182] sits OUTSIDE the guard, so a rate the parent already holds still
    // gets its own field written.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale', [subject]);

    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);

    subject.setPriceGroup(priceGroup);

    expect(subject.getPriceGroup()).toBe(priceGroup);
    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);
  });
});

describe('removePriceGroup', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L187-L196]: the ONLY one of this class's four
  // `remove*` helpers whose argument is OPTIONAL - `any priceGroup` with no `required`.
  // `structDelete(variables, "priceGroup")` at [L195] runs UNCONDITIONALLY, outside the index
  // guard.

  it('splices the rate out of the far-side collection and clears the near side', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale');
    subject.setPriceGroup(priceGroup);

    subject.removePriceGroup(priceGroup);

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(subject.getPriceGroup()).toBeUndefined();
  });

  it('defaults to the stored price group when called with no argument', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale');
    subject.setPriceGroup(priceGroup);

    subject.removePriceGroup();

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(subject.getPriceGroup()).toBeUndefined();
  });

  it('clears the near side even when the far side did not hold the rate', () => {
    // [L195] is outside the `if(index > 0)` guard, so a miss on the far side still detaches.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale');
    const unrelated = aPriceGroup('Trade');
    subject.setPriceGroup(priceGroup);

    subject.removePriceGroup(unrelated);

    expect(unrelated.getPriceGroupRates()).toStrictEqual([]);
    expect(priceGroup.getPriceGroupRates()).toStrictEqual([subject]);
    expect(subject.getPriceGroup()).toBeUndefined();
  });

  it('leaves the far-side siblings of other rates untouched', () => {
    const sibling = aRate({ priceGroupRateID: 'pgr-sibling' });
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale', [sibling]);
    subject.setPriceGroup(priceGroup);

    expect(priceGroup.getPriceGroupRates()).toHaveLength(2);

    subject.removePriceGroup();

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([sibling]);
  });

  it('removes only the FIRST match, leaving a duplicate from defect D25 behind', () => {
    // `arrayFind` at [L191] returns one index and `arrayDeleteAt` at [L193] deletes one element, so
    // a rate double-appended while unsaved needs two removals.
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });
    subject.setPriceGroup(priceGroup);
    subject.setPriceGroup(priceGroup);

    subject.removePriceGroup(priceGroup);

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([subject]);
  });

  it('RAISES when called with no argument on a rate that has no price group', () => {
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L189-L192]: the omitted argument defaults to the
    // null `variables.priceGroup` and `getPriceGroupRates()` is then invoked on it - a method call
    // on null under every CFML engine. Reproduced rather than smoothed into an early return,
    // because an early return would ALSO skip the unconditional field clear at [L195] and so would
    // not be the same behaviour reached another way. The identical unguarded shape recurs at
    // [model/entity/PriceGroup.cfc:L116-L122], [model/entity/Category.cfc:L107-L112] and
    // [model/entity/ProductType.cfc:L155-L159], so it is the framework-wide idiom, not a local
    // slip.
    const subject = aRate();

    expect(subject.getPriceGroup()).toBeUndefined();
    expect(() => subject.removePriceGroup()).toThrow(/no argument on a rate that has no/);
  });

  it('does NOT raise when an explicit price group is supplied to an unattached rate', () => {
    // The default branch is what raises; supplying the argument skips it entirely, and the
    // unconditional clear at [L195] is then a no-op on an already-empty field.
    const subject = aRate();
    const priceGroup = aPriceGroup('Wholesale');

    expect(() => subject.removePriceGroup(priceGroup)).not.toThrow();
    expect(subject.getPriceGroup()).toBeUndefined();
  });

  it('is idempotent on the near side but raises on a second bare call', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale');
    subject.setPriceGroup(priceGroup);

    subject.removePriceGroup();

    expect(subject.getPriceGroup()).toBeUndefined();
    expect(() => subject.removePriceGroup()).toThrow(Error);
  });
});

// --- The three owner-side many-to-many pairs, and the guard asymmetry -------

describe('the guard asymmetry in the three add helpers', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L199-L206, L219-L226, L239-L246]: the NEAR-side
  // guard tests THE ARGUMENT's newness (`arguments.productType.isNew()`) while the FAR-side guard
  // tests THIS RATE's newness (`isNew()`).

  it('saved rate plus saved argument: neither side duplicates', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const productType = aProductType('ptp-1');

    subject.addProductType(productType);
    subject.addProductType(productType);

    expect(subject.getProductTypes()).toHaveLength(1);
    expect(productType.getPriceGroupRates()).toHaveLength(1);
  });

  it('saved rate plus NEW argument: the NEAR side duplicates, the far side does not', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const newSku = anUnsavedSku();

    subject.addSku(newSku);
    subject.addSku(newSku);

    expect(newSku.isNew()).toBe(true);
    expect(subject.getSkus()).toHaveLength(2);
    expect(newSku.getPriceGroupRates()).toHaveLength(1);
  });

  it('NEW rate plus saved argument: the FAR side duplicates, the near side does not', () => {
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });
    const productType = aProductType('ptp-1');

    subject.addProductType(productType);
    subject.addProductType(productType);

    expect(subject.isNew()).toBe(true);
    expect(subject.getProductTypes()).toHaveLength(1);
    expect(productType.getPriceGroupRates()).toHaveLength(2);
  });

  it('NEW rate plus NEW argument: BOTH sides duplicate', () => {
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });
    const newSku = anUnsavedSku();

    subject.addSku(newSku);
    subject.addSku(newSku);

    expect(subject.getSkus()).toHaveLength(2);
    expect(newSku.getPriceGroupRates()).toHaveLength(2);
  });

  it('applies the same asymmetry to products as to product types and SKUs', () => {
    const savedRate = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const product = aProduct('prd-1');

    savedRate.addProduct(product);
    savedRate.addProduct(product);

    expect(savedRate.getProducts()).toHaveLength(1);
    expect(product.getPriceGroupRates()).toHaveLength(1);
  });

  it('writes the near side before the far side', () => {
    // [L200-L205] orders the two guarded blocks near-first.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const productType = aProductType('ptp-1');

    subject.addProductType(productType);

    expect(subject.getProductTypes()).toStrictEqual([productType]);
    expect(productType.getPriceGroupRates()).toStrictEqual([subject]);
  });

  it('appends distinct arguments in call order', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });

    subject.addSku(aSku('sku-b'));
    subject.addSku(aSku('sku-a'));

    expect(subject.getSkus().map((sku) => sku.getSkuID())).toStrictEqual(['sku-b', 'sku-a']);
  });
});

describe('the three remove helpers, and the inversion cross-check', () => {
  // INVERSION CROSS-CHECK VERDICT: CLEAN. Every one of this class's four `remove*` helpers -
  // `removePriceGroup` [L187-L196], `removeProductType` [L207-L216], `removeProduct` [L227-L236]
  // and `removeSku` [L247-L256] - calls `arrayDeleteAt`, never `arrayAppend`, and every index guard
  // reads `if(<index> > 0)`, never the inverted `<= 0`. The direct counter-example is
  // [model/entity/Option.cfc:L129-L131], where `removePromotionRewardExclusion` calls
  // `arguments.promotionReward.addExcludedOption( this )` - a remove that ADDS - and
  // [model/entity/Option.cfc:L145-L147], where `removePromotionQualifierExclusion` does the same.

  it('splices the argument off the near side and the rate off the far side', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const productType = aProductType('ptp-1');
    subject.addProductType(productType);

    subject.removeProductType(productType);

    expect(subject.getProductTypes()).toStrictEqual([]);
    expect(productType.getPriceGroupRates()).toStrictEqual([]);
  });

  it('removes from the near side even when only the near side held the needle', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L208-L215]: the two index guards are
    // INDEPENDENT, so a one-sided link is still cleaned up on the side that has it.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const sku = aSku('sku-near-only');
    subject.getSkus().push(sku);

    expect(sku.getPriceGroupRates()).toStrictEqual([]);

    subject.removeSku(sku);

    expect(subject.getSkus()).toStrictEqual([]);
  });

  it('removes from the far side even when only the far side held the rate', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const product = aProduct('prd-far-only');
    product.getPriceGroupRates().push(subject);

    expect(subject.getProducts()).toStrictEqual([]);

    subject.removeProduct(product);

    expect(product.getPriceGroupRates()).toStrictEqual([]);
  });

  it('is a silent no-op when neither side holds anything', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const sku = aSku('sku-unlinked');

    expect(() => subject.removeSku(sku)).not.toThrow();
    expect(subject.getSkus()).toStrictEqual([]);
    expect(sku.getPriceGroupRates()).toStrictEqual([]);
  });

  it('removes only the matching key, leaving every sibling in place and in order', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID, skus: skus(3) });

    subject.removeSku(aSku('sku-2'));

    expect(subject.getSkus().map((sku) => sku.getSkuID())).toStrictEqual(['sku-1', 'sku-3']);
  });

  it('removes the element at index zero, which an inverted guard would have skipped', () => {
    // THE DIRECT TEST FOR AN INVERTED PORT. CFML arrays are 1-based, so `if(index > 0)` means
    // "found"; a JavaScript port that carried `> 0` across verbatim against a zero-based
    // `findIndex` would silently refuse to remove the FIRST element. The shipped module tests `!==`
    // against the zero-based sentinel `-1`, and this case is what proves it.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID, skus: skus(2) });

    subject.removeSku(aSku('sku-1'));

    expect(subject.getSkus().map((sku) => sku.getSkuID())).toStrictEqual(['sku-2']);
  });

  it('removes the rate at far-side index zero too', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const productType = aProductType('ptp-1');
    subject.addProductType(productType);
    productType.getPriceGroupRates().push(aRate({ priceGroupRateID: 'pgr-other' }));

    expect(productType.getPriceGroupRates()).toHaveLength(2);

    subject.removeProductType(productType);

    expect(
      productType.getPriceGroupRates().map((rate) => rate.getPriceGroupRateID()),
    ).toStrictEqual(['pgr-other']);
  });

  it('takes a REQUIRED argument, unlike removePriceGroup', () => {
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });

    // @ts-expect-error the argument is required
    // [model/entity/PriceGroupRate.cfc:L247] declares `required any sku`, and only
    // `removePriceGroup` at [L187] declares an optional one. No `structKeyExists` defaulting
    // applies here.
    const rejected = (): void => subject.removeSku();

    expect(typeof rejected).toBe('function');
  });

  it('removes the requested UNSAVED member, not the first unsaved one it finds', () => {
    // ★★ WHAT `arrayFind(collection, object)` ACTUALLY COMPARED, AND WHY A KEY COMPARISON IS NOT
    // THE SAME THING FOR AN UNSAVED ROW. `unsavedvalue=""` [model/entity/PriceGroupRate.cfc:L52]
    // means every transient row carries the SAME empty key, so a comparison on the key alone
    // reports the first transient member as a match for any transient needle. CFML compared
    // OBJECTS, and Hibernate's collection-contains worked on SESSION IDENTITY - which for a
    // persisted row is its primary key, and for a transient row, having no key, is the instance
    // itself. So a key comparison is faithful for saved rows and wrong for unsaved ones, and the
    // shipped module falls back to instance identity exactly when the keys are empty.
    //
    // ★ THE SOURCE ITSELF CORROBORATES THE READING. The ADD path already branches on newness for
    // precisely this reason - [model/entity/PriceGroupRate.cfc:L200/L203, L220/L223, L240/L243] -
    // while the remove path carries no such guard, which is why the distinction has to be made
    // here rather than inherited.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const firstUnsaved = anUnsavedSku();
    const secondUnsaved = anUnsavedSku();

    subject.getSkus().push(firstUnsaved, secondUnsaved);

    subject.removeSku(secondUnsaved);

    // The one that was ASKED FOR is gone, and the other is untouched. A key comparison would have
    // removed `firstUnsaved` instead, silently detaching a different row.
    expect(subject.getSkus()).toStrictEqual([firstUnsaved]);
    expect(subject.getSkus()[0]).toBe(firstUnsaved);
  });

  it('leaves an unsaved member alone when a DIFFERENT unsaved member is removed', () => {
    // The complementary direction: an unsaved needle that is in neither collection must not match
    // an unsaved member that happens to share its empty key.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const held = anUnsavedSku();
    const strangerNotHeld = anUnsavedSku();

    subject.getSkus().push(held);

    subject.removeSku(strangerNotHeld);

    expect(subject.getSkus()).toStrictEqual([held]);
  });

  it('removes the requested unsaved rate from the far side of an unsaved product type', () => {
    // The far side has the same hazard from the other end: `removeProductType` looks for THIS RATE
    // inside the product type's collection, so an unsaved rate sharing its empty key with another
    // unsaved rate would splice the wrong one out.
    const unsavedSubject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });
    const otherUnsavedRate = aRate({ priceGroupRateID: UNSAVED_RATE_ID });
    const productType = aProductType('ptp-unsaved-far');

    productType.getPriceGroupRates().push(otherUnsavedRate, unsavedSubject);
    unsavedSubject.getProductTypes().push(productType);

    unsavedSubject.removeProductType(productType);

    expect(productType.getPriceGroupRates()).toStrictEqual([otherUnsavedRate]);
    expect(productType.getPriceGroupRates()[0]).toBe(otherUnsavedRate);
  });

  it('still compares SAVED members by primary key, not by instance', () => {
    // ★ THE FALLBACK IS SCOPED TO EMPTY KEYS AND NOTHING ELSE. Two distinct instances built from
    // the same stored row must still match, because that is what session identity meant for a
    // persisted row - and because a repository read and a caller-held entity are routinely two
    // objects for one row. Switching the whole comparison to instance identity would break this.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const heldInstance = aSku('sku-shared-key');
    const equalKeyOtherInstance = aSku('sku-shared-key');

    subject.getSkus().push(heldInstance);

    expect(equalKeyOtherInstance).not.toBe(heldInstance);

    subject.removeSku(equalKeyOtherInstance);

    expect(subject.getSkus()).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The five generated property setters
//
// [model/entity/PriceGroupRate.cfc:L49] declares `accessors=true`, so CFML generated a
// `set<Property>` for every persistent property without a line of authored code. The port authors
// the five that ported call sites invoke, and this group pins each one plus the two things that are
// easy to get wrong about them: a generated setter does NOT maintain the far side of an association,
// and `setAmount(undefined)` means SQL NULL rather than zero.
//
// NET-NEW COVERAGE (AAP 0.6.6): `meta/tests/` contains no PriceGroupRate suite at all - the only two
// legacy entity suites are BrandTest.cfc and ProductTest.cfc.
// ---------------------------------------------------------------------------

describe('setGlobalFlag', () => {
  it('★★ replaces the flag, which is what makes rate exclusivity enforceable', () => {
    // [model/service/PriceGroupService.cfc:L430] `rates[i].setGlobalFlag(false)` demotes every other
    // global rate in a price group. Without this member two global rates can coexist, and
    // `getGlobalPriceGroupRate()` [model/entity/PriceGroup.cfc:L83-L90] then returns whichever the
    // association happens to yield first - a nondeterministic price.
    const subject = aRate({ globalFlag: true });

    expect(subject.getGlobalFlag()).toBe(true);

    subject.setGlobalFlag(false);

    expect(subject.getGlobalFlag()).toBe(false);
  });

  it('promotes as well as demotes, since the generated setter is not one-way', () => {
    const subject = aRate({ globalFlag: false });

    subject.setGlobalFlag(true);

    expect(subject.getGlobalFlag()).toBe(true);
  });

  it('accepts only a boolean, so CFML truthiness cannot re-enter through the writer', () => {
    // The FIELD admits `CfBooleanInput` because a persisted row can deliver SQL NULL or the string
    // `'false'` - [model/entity/PriceGroupRate.cfc:L53] `default="false"` constrains what the ORM
    // writes, not what the column already holds. A caller inside this process is a different
    // boundary, and [L430] passes the CFML boolean literal.
    const subject = aRate();

    // @ts-expect-error setGlobalFlag takes boolean, not the CfBooleanInput the field admits: the wider type exists for hydration from a row [model/entity/PriceGroupRate.cfc:L53], and widening the writer would readmit CFML truthiness at a boundary the source never exposes to it.
    const rejected = (): void => subject.setGlobalFlag('false');

    expect(typeof rejected).toBe('function');
  });
});

describe('setAmount', () => {
  it('replaces the amount', () => {
    const subject = aRate({ amount: Money.fromDecimalString('10.00') });

    subject.setAmount(Money.fromDecimalString('12.50'));

    expect(subject.getAmount()?.toFixed2()).toBe('12.50');
  });

  it('★★ clears to undefined, and never to zero', () => {
    // [model/entity/PriceGroupRate.cfc:L54] declares NO `default=`, unlike
    // model/entity/Sku.cfc L55/L56/L57 which all declare `default="0"`. The schema encodes the
    // asymmetry, so substituting `0` here would persist a rate that discounts nothing as a rate
    // that discounts everything.
    const subject = aRate({ amount: Money.fromDecimalString('12.50') });

    subject.setAmount(undefined);

    expect(subject.getAmount()).toBeUndefined();
  });

  it('is the member the ported population step writes through', () => {
    // [org/Hibachi/HibachiService.cfc:L146] populates the entity from the payload before validating
    // it, and `amount` is the one persistent property the ported
    // `PriceGroupRateSaveInput` publishes. Without this member a submitted amount is silently
    // dropped, which is half of what [model/service/PriceGroupService.cfc:L404] does.
    const subject = aRate({ amount: undefined });

    subject.setAmount(Money.fromDecimalString('7.25'));

    expect(subject.getAmount()?.toFixed2()).toBe('7.25');
    expect(subject.getAmountFormatted()).toBe('7.25');
  });
});

describe('the three excluded-collection setters', () => {
  it('★★ empties all three, which is what a global rate save does', () => {
    // [model/service/PriceGroupService.cfc:L440-L442] calls all three with `[]`. Until these
    // members existed a global rate kept exclusion rows the legacy save removed.
    const subject = aRate({
      excludedProductTypes: productTypes(2),
      excludedProducts: products(2),
      excludedSkus: skus(2),
    });

    subject.setExcludedProductTypes([]);
    subject.setExcludedProducts([]);
    subject.setExcludedSkus([]);

    expect(subject.getExcludedProductTypes()).toStrictEqual([]);
    expect(subject.getExcludedProducts()).toStrictEqual([]);
    expect(subject.getExcludedSkus()).toStrictEqual([]);
  });

  it('replaces membership wholesale rather than appending to it', () => {
    const replacement = aSku('sku-replacement');
    const subject = aRate({ excludedSkus: skus(3) });

    subject.setExcludedSkus([replacement]);

    expect(subject.getExcludedSkus().map((sku) => sku.getSkuID())).toStrictEqual([
      'sku-replacement',
    ]);
  });

  it('★★ does NOT notify the far side, exactly as a generated CFML setter does not', () => {
    // THIS IS THE DIFFERENCE BETWEEN THE TWO IDIOMS [model/service/PriceGroupService.cfc:L417-L425
    // versus L437-L442]. The `remove*` helpers maintain the inverse side; the generated setters
    // leave it stale until reload. Both coexist inside one legacy method, so unifying them would
    // change behaviour - and the exclude collections have no helper at all, only this setter.
    const excludedSku = aSku('sku-far-side');
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID, excludedSkus: [excludedSku] });

    // The far side never knew about the exclusion in the first place: no `addExcludedSku` exists to
    // have registered it, which is why there is nothing here to become stale.
    expect(excludedSku.getPriceGroupRates()).toStrictEqual([]);

    subject.setExcludedSkus([]);

    expect(excludedSku.getPriceGroupRates()).toStrictEqual([]);
  });

  it('accepts a readonly array, so a caller need not hand over a mutable one', () => {
    const frozen: readonly Sku[] = Object.freeze([aSku('sku-frozen')]);
    const subject = aRate();

    subject.setExcludedSkus(frozen);

    expect(subject.getExcludedSkus()).toHaveLength(1);
  });

  it('does not let the caller keep writing through the array it supplied', () => {
    // The held collection is spliced from the supplied one rather than aliased to it, so a caller
    // that mutates its own array afterwards does not reach inside the entity.
    const supplied = [aSku('sku-a')];
    const subject = aRate();

    subject.setExcludedSkus(supplied);
    supplied.push(aSku('sku-b'));

    expect(subject.getExcludedSkus()).toHaveLength(1);
  });
});

// --- Structural parity with one SwPriceGroupRate row ------------------------

describe('structural parity with the SwPriceGroupRate row', () => {
  // C5 schema continuity [model/entity/PriceGroupRate.cfc:L49]: `table="SwPriceGroupRate"`,
  // `persistent=true output=false accessors=true`, `cacheuse="transactional"`,
  // `hb_serviceName="priceGroupService"`, `hb_permission="priceGroup.priceGroupRates"`. CFML parity
  // [L49]: `persistent` is UNQUOTED here (`persistent=true`) and BOTH `output=false` and
  // `accessors=true` are present - unlike the four `Promotion*` entities, which quote the first and
  // omit at least one of the other two. CFML parity [L58, L61-L64 versus L67-L68]: THE SECTION
  // ORDER IS REVERSED relative to every other in-scope entity.

  it('publishes exactly the ported public surface, and nothing more', () => {
    const shipped = Object.getOwnPropertyNames(PriceGroupRate.prototype)
      .filter((member) => member !== 'constructor')
      .sort();

    expect(shipped).toStrictEqual([...PORTED_PUBLIC_SURFACE]);
  });

  it('needs nothing but a primary key to exist - no port, no clock, no repository', () => {
    // [model/entity/PriceGroupRate.cfc] has ZERO `getService(` sites, verified by grepping the
    // whole file, and so does its parent [model/entity/PriceGroup.cfc]. Of the forty-five
    // entity-internal service-locator sites in the slice - Product 18, Sku 19, ProductType 6,
    // OptionGroup 1, RoundingRule 1 - not one is here. So the constructor injects NO collaborator
    // port and NO clock, and a single argument is enough to build a valid rate.
    expect(PriceGroupRate.length).toBe(1);

    const subject = new PriceGroupRate({ priceGroupRateID: SAVED_RATE_ID });

    expect(subject.getPriceGroupRateID()).toBe(SAVED_RATE_ID);
  });

  it('reads as unsaved for the empty key from L52 and saved for anything else', () => {
    // [model/entity/PriceGroupRate.cfc:L52] `unsavedvalue="" default=""` is what makes
    // [org/Hibachi/HibachiEntity.cfc:L571-L576]'s `getPrimaryIDValue() == ""` test honest, so the
    // port's `isNew()` needs no separate flag - unlike src/domain/entities/sku.ts, which carries an
    // explicit hydration flag and is why `anUnsavedSku()` exists here at all.
    expect(aRate({ priceGroupRateID: UNSAVED_RATE_ID }).isNew()).toBe(true);
    expect(aRate({ priceGroupRateID: SAVED_RATE_ID }).isNew()).toBe(false);
    expect(aRate({ priceGroupRateID: '0' }).isNew()).toBe(false);
  });

  it('defaults globalFlag to false, per L53', () => {
    expect(aRate().getGlobalFlag()).toBe(false);
    expect(aRate({ globalFlag: true }).getGlobalFlag()).toBe(true);
  });

  it('leaves amount and amountType absent, because L54 and L55 declare no default', () => {
    // `amount` is one of exactly FOUR no-default money columns in the slice, alongside
    // [model/entity/SkuCurrency.cfc:L53], [model/entity/PromotionApplied.cfc:L53] and
    // [model/entity/PromotionReward.cfc:L61] - in pointed contrast with `Sku.price`,
    // `Sku.listPrice` and `Sku.renewalPrice`, which all declare `default="0"`.
    const subject = aRate();

    expect(subject.getAmount()).toBeUndefined();
    expect(subject.getAmountType()).toBeUndefined();
  });

  it('carries remoteID from L58 as an optional string', () => {
    expect(aRate().getRemoteID()).toBeUndefined();
    expect(aRate({ remoteID: 'legacy-pgr-77' }).getRemoteID()).toBe('legacy-pgr-77');
  });

  it('carries the four audit columns from L61-L64, with dates as Date | undefined', () => {
    // Every business-date literal in this suite is an explicit UTC ISO-8601 string.
    const subject = aRate({
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: 'acct-created',
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: 'acct-modified',
    });

    expect(subject.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(subject.getCreatedByAccountID()).toBe('acct-created');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_DATE_TIME_UTC);
    expect(subject.getModifiedByAccountID()).toBe('acct-modified');
  });

  it('leaves all four audit columns absent when the row did not carry them', () => {
    const subject = aRate();

    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();
  });

  it('treats roundingRule as NULLABLE, per the hb_optionsNullRBKey on L68', () => {
    const subject = aRate();

    expect(subject.getRoundingRule()).toBeUndefined();
  });

  it('HOLDS its rounding rule and never applies it', () => {
    // BOUNDARY. [model/entity/PriceGroupRate.cfc:L68] is an association and nothing more: no method
    // on this entity rounds anything. Applying the rule is the service's job at
    // [model/service/PriceGroupService.cfc:L316-L340], where - defect 8 - ONLY the `percentageOff`
    // branch consults it and there is no `default:` case at all.
    const { rule, recorder } = aRoundingRuleWithRecorder();
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'percentageOff',
      priceGroup: aPriceGroup('Wholesale'),
      roundingRule: rule,
      skus: skus(2),
      excludedSkus: skus(1),
    });

    expect(subject.getRoundingRule()).toBe(rule);

    // Exercise every member that could plausibly have reached for the rule.
    expect(subject.getAmountFormatted()).toBe('12.5%');
    expect(subject.getAmount()?.toDecimalString()).toBe('12.5');
    expect(subject.getAppliesTo()).toBe('Including: 2 SKUs. Excluding: 1 SKU');
    expect(subject.getDisplayName()).toBe('Wholesale - 12.5 - percentageOff');
    expect(subject.getAmountTypeOptions()).toHaveLength(3);

    expect(recorder.calls).toStrictEqual([]);
  });

  it('does not round even for the amount types the service would have rounded', () => {
    const { rule, recorder } = aRoundingRuleWithRecorder();

    for (const amountType of ['percentageOff', 'amountOff', 'amount'] as const) {
      const subject = aRate({
        amount: Money.fromDecimalString('12.3456'),
        amountType,
        roundingRule: rule,
      });

      // 12.3456 with the `.99` expression rounds to 11.99 in the service tier.
      expect(subject.getAmount()?.toDecimalString()).toBe('12.3456');
    }

    expect(recorder.calls).toHaveLength(0);
  });

  it('declares NO ORM event hook, because the L280/L282 banner is empty', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L280, L282]: the "ORM Event Hooks" banner opens
    // and closes with NOTHING between the two lines. So this entity maintains no materialized path
    // and runs no pre-persist logic - a pointed contrast with its own parent
    // [model/entity/PriceGroup.cfc:L206-L214], which sets the path BEFORE calling `super` and
    // carries a harmless `;;`, and with [model/entity/Category.cfc:L126-L134], which calls `super`
    // FIRST.
    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    expect(members).not.toContain('preInsert');
    expect(members).not.toContain('preUpdate');
    expect(members).not.toContain('postInsert');
    expect(members).not.toContain('postUpdate');
    expect(members).not.toContain('preDelete');
  });

  it('declares no framework member the port deliberately left behind', () => {
    // §7 explain rather than fabricate: `getNewFlag()`, `getPrintTemplates()`,
    // `getEmailTemplates()`, `clearAttributeCache()`, the four inherited memos and every smart-list
    // getter live on [org/Hibachi/HibachiEntity.cfc], which AAP 0.5.3 replaces rather than ports.
    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    for (const notPorted of [
      'getNewFlag',
      'getPrintTemplates',
      'getEmailTemplates',
      'clearAttributeCache',
      'getPropertyTitle',
      'getAttributeValue',
      // `validate` STAYS UNPORTED even though the error register it wrote into does not: the register
      // is five small members with no framework behind them, whereas `validate` is metadata-driven
      // dispatch over `model/validation/*.json` through `HibachiValidationService`. The RULES are
      // transcribed by the service that needs them; the DISPATCHER is not ported.
      'validate',
    ]) {
      expect(members).not.toContain(notPorted);
    }
  });

  it('exposes no attributeValues, which is what made the legacy dispatcher throw', () => {
    // [org/Hibachi/HibachiEntity.cfc:L559] reaches the EAV fallback only when
    // `hasProperty("attributeValues")` holds. PriceGroupRate declares no such property, so it is
    // one of the FOURTEEN entities whose unmatched `get…` terminates in the throw at [L565] -
    // versus the four silent ones, [model/entity/Sku.cfc:L70], [model/entity/Product.cfc:L75],
    // [model/entity/ProductType.cfc:L67] and [model/entity/Brand.cfc:L60]. The port has no dynamic
    // dispatch, so the throw is DOCUMENTED and not reproduced - and the raw
    // `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is not ported
    // either.
    const subject = aRate();

    expect('attributeValues' in subject).toBe(false);
    expect(Object.getOwnPropertyNames(PriceGroupRate.prototype)).not.toContain(
      'getAttributeValues',
    );
  });

  it('exports exactly the class and the amount-type union, with no barrel', () => {
    // P7 one unit per file, no barrels: the module's whole public API is the class plus the type.
    expect(typeof PriceGroupRate).toBe('function');
    expect(PriceGroupRate.name).toBe('PriceGroupRate');

    const declaredAmountType: PriceGroupRateAmountType = 'amount';

    expect(declaredAmountType).toBe('amount');
  });
});

// --- The declarative validation schema, and its orphaned condition ----------

/**
 * [model/validation/PriceGroupRate.json], VERBATIM and complete: twelve lines carrying one
 * condition and three properties.
 *
 *   {
 *     "conditions":{
 *         "isNotGlobal":{
 *             "getGlobalFlag":{"eq":0}
 *         }
 *     },
 *     "properties":{
 *       "priceGroup":  [{"contexts":"save","required":true}],
 *       "amountType":  [{"contexts":"save","required":true}],
 *       "amount":      [{"contexts":"save","required":true,"dataType":"numeric"}]
 *     }
 *   }
 *
 * P6 empty environment: the schema is a LITERAL here, never read from disk. Opening the `.json`
 * would be a filesystem test wearing a unit test's clothes, and would reach outside `slatwall-ts/`
 * for its input. Transcribed so a reviewer can diff twelve lines against twelve.
 *
 * NONE of the three rules is ENFORCED by the entity, and none is asserted here as though it were:
 * requiredness and schema validation live at the SERVICE tier, so NO zod schema is exercised in
 * this file. What the entity owes the schema is that the three named columns exist and are carried
 * faithfully and unvalidated.
 */
const DECLARED_VALIDATION_SCHEMA = {
  conditions: {
    isNotGlobal: { getGlobalFlag: { eq: 0 } },
  },
  properties: {
    priceGroup: [{ contexts: 'save', required: true }],
    amountType: [{ contexts: 'save', required: true }],
    amount: [{ contexts: 'save', required: true, dataType: 'numeric' }],
  },
} as const;

describe('the declarative validation schema', () => {
  it('declares exactly three properties, all of them save-context and all required', () => {
    expect(Object.keys(DECLARED_VALIDATION_SCHEMA.properties).sort()).toStrictEqual([
      'amount',
      'amountType',
      'priceGroup',
    ]);

    for (const rules of Object.values(DECLARED_VALIDATION_SCHEMA.properties)) {
      expect(rules).toHaveLength(1);
      expect(rules[0].contexts).toBe('save');
      expect(rules[0].required).toBe(true);
    }
  });

  it('constrains only amount by data type, leaving amountType value-unconstrained', () => {
    // `amountType` is REQUIRED but its VALUE is unconstrained: no `dataType`, no `inList`, no
    // pattern - even though [model/entity/PriceGroupRate.cfc:L87-L93] enumerates exactly three
    // legal values and [model/service/PriceGroupService.cfc:L316-L340] switches on them with no
    // `default:` case.
    expect(DECLARED_VALIDATION_SCHEMA.properties.amount.at(0)?.dataType).toBe('numeric');
    expect('dataType' in DECLARED_VALIDATION_SCHEMA.properties.amountType[0]).toBe(false);
    expect('dataType' in DECLARED_VALIDATION_SCHEMA.properties.priceGroup[0]).toBe(false);
  });

  it('carries all three save-context columns without validating any of them', () => {
    // The entity is not the requiredness gate: a rate missing all three is constructible and
    // reports each as absent rather than refusing the row or substituting a default.
    const subject = aRate();

    expect(subject.getPriceGroup()).toBeUndefined();
    expect(subject.getAmountType()).toBeUndefined();
    expect(subject.getAmount()).toBeUndefined();
  });

  it('reports amount exactly as persisted, with no rounding and no padding', () => {
    // `dataType: "numeric"` is a service-tier assertion about the column, not an instruction to
    // normalize it.
    const subject = aRate({ amount: Money.fromDecimalString('12.3456') });

    expect(subject.getAmount()?.toDecimalString()).toBe('12.3456');
  });

  it('accepts an amount the numeric rule would already have satisfied by construction', () => {
    // P4: the amount arrives as `Money`, so it cannot be non-numeric in the first place - the port
    // makes the schema's `dataType` rule structurally unreachable rather than enforcing it twice.
    const subject = aRate({ amount: Money.fromDecimalString('0') });

    expect(subject.getAmount()?.toDecimalString()).toBe('0');
    // A stored zero is a VALUE, not an absence: it formats as `'0.00'` on the currency path,
    // whereas a genuinely absent amount formats as `''`.
    expect(subject.getAmountFormatted()).toBe('0.00');
    expect(aRate().getAmountFormatted()).toBe('');
  });
});

describe('the ORPHANED isNotGlobal condition', () => {
  // CFML parity [model/validation/PriceGroupRate.json]: `conditions.isNotGlobal` is ORPHANED - NO
  // property in the schema references it - and it carries a SECOND anomaly on top: it keys on the
  // GETTER NAME `getGlobalFlag` rather than the property `globalFlag`. The parallel is measured,
  // not asserted here: those four schemas each declare a `physicalCounts` delete rule while the
  // entities themselves declare `physicals`; `physicalCounts` exists only on
  // [model/entity/Physical.cfc:L59]. The condition would have been legible if wired: a test of
  // `globalFlag` against 0 is the negation of the short-circuit at
  // [model/entity/PriceGroupRate.cfc:L106-L108], so a rule guarded by it would have read "these
  // columns matter only when the rate is not global".

  it('is declared', () => {
    expect(Object.keys(DECLARED_VALIDATION_SCHEMA.conditions)).toStrictEqual(['isNotGlobal']);
    expect(DECLARED_VALIDATION_SCHEMA.conditions.isNotGlobal).toStrictEqual({
      getGlobalFlag: { eq: 0 },
    });
  });

  it('is referenced by NOTHING, which is what makes it dead', () => {
    // A wired condition appears in a property rule as a `conditions` key.
    const declaredConditionNames = Object.keys(DECLARED_VALIDATION_SCHEMA.conditions);
    const referencedConditionNames = Object.values(DECLARED_VALIDATION_SCHEMA.properties)
      .flat()
      .flatMap((rule) => ('conditions' in rule ? [String(rule.conditions)] : []));

    expect(declaredConditionNames).toStrictEqual(['isNotGlobal']);
    expect(referencedConditionNames).toStrictEqual([]);
  });

  it('keys on the GETTER name rather than the property name', () => {
    // The second anomaly, and the one most easily lost.
    const conditionKeys = Object.keys(DECLARED_VALIDATION_SCHEMA.conditions.isNotGlobal);

    expect(conditionKeys).toStrictEqual(['getGlobalFlag']);
    expect(conditionKeys).not.toContain('globalFlag');
  });

  it('describes a flag the entity really does publish, under both spellings', () => {
    // The condition is dead, not nonsensical: `getGlobalFlag` names a real member, and the `eq: 0`
    // comparison is against the boolean column at [model/entity/PriceGroupRate.cfc:L53] whose
    // default is `false`.
    const subject = aRate();

    expect(typeof subject.getGlobalFlag).toBe('function');
    expect(subject.getGlobalFlag()).toBe(false);
    expect(aRate({ globalFlag: true }).getGlobalFlag()).toBe(true);
  });

  it('is not silently implemented as a conditional requirement anywhere on the entity', () => {
    // The dead condition stays dead.
    const globalRate = aRate({ globalFlag: true });

    expect(globalRate.getGlobalFlag()).toBe(true);
    expect(globalRate.getAmount()).toBeUndefined();
    expect(globalRate.getAmountType()).toBeUndefined();
    expect(globalRate.getPriceGroup()).toBeUndefined();
    expect(globalRate.getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
  });
});

describe('what the validation schema does NOT declare', () => {
  // The absences are as much a part of the contract as the three rules, and NOTHING is invented to
  // fill them.

  it('declares NO delete-context gate at all', () => {
    // Contrast [model/validation/PriceGroup.json], re-read for this suite, which declares SIX
    // `{"contexts":"delete","maxCollection":0}` gates - `appliedOrderItems`, `childPriceGroups`,
    // `accounts`, `subscriptionBenefits`, `subscriptionUsageBenefits`, `promotionRewards` - and
    // [model/validation/RoundingRule.json], which gates on `priceGroupRates`.
    const contexts = Object.values(DECLARED_VALIDATION_SCHEMA.properties)
      .flat()
      .map((rule) => rule.contexts);

    expect(contexts).toStrictEqual(['save', 'save', 'save']);
    expect(contexts).not.toContain('delete');
  });

  it('declares NO rule for globalFlag, even though a condition is written about it', () => {
    // The sharpest absence in the file: `globalFlag` drives the early return at
    // [model/entity/PriceGroupRate.cfc:L106-L108] AND is the subject of the orphaned condition, yet
    // no property rule mentions it.
    expect('globalFlag' in DECLARED_VALIDATION_SCHEMA.properties).toBe(false);
  });

  it('declares NO rule for any of the six collections', () => {
    for (const collection of [
      'productTypes',
      'products',
      'skus',
      'excludedProductTypes',
      'excludedProducts',
      'excludedSkus',
    ]) {
      expect(collection in DECLARED_VALIDATION_SCHEMA.properties).toBe(false);
    }
  });

  it('declares NO rule for roundingRule, remoteID or any audit column', () => {
    for (const property of [
      'roundingRule',
      'remoteID',
      'createdDateTime',
      'createdByAccountID',
      'modifiedDateTime',
      'modifiedByAccountID',
    ]) {
      expect(property in DECLARED_VALIDATION_SCHEMA.properties).toBe(false);
    }
  });

  it('names NO custom validator method, so this entity declares none', () => {
    // CFML parity: a `"method"` key names an entity member the framework invoked by string. There
    // are exactly FIVE such declaratively-invoked validators across the in-scope slice -
    // `hasUniqueOptions` and `hasOneOptionPerOptionGroup` [model/validation/Sku.json],
    // `hasExpressionWithListOfNumericValuesOnly` [model/validation/RoundingRule.json],
    // `getPromotionCodesDeletableFlag` [model/validation/Promotion.json] and
    // `hasUniquePromotionCode` [model/validation/PromotionCode.json] - and NOT ONE of them belongs
    // to PriceGroupRate.
    const rulesWithMethods = Object.values(DECLARED_VALIDATION_SCHEMA.properties)
      .flat()
      .filter((rule) => 'method' in rule);

    expect(rulesWithMethods).toStrictEqual([]);

    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    for (const foreignValidator of [
      'hasUniqueOptions',
      'hasOneOptionPerOptionGroup',
      'hasExpressionWithListOfNumericValuesOnly',
      'getPromotionCodesDeletableFlag',
      'hasUniquePromotionCode',
    ]) {
      expect(members).not.toContain(foreignValidator);
    }
  });

  it('is one of the fifteen in-scope schemas that exist, not one of the six that do not', () => {
    // VERIFIED CORRECTION to AAP 0.2.1, which states twelve: `model/validation/` holds 96 `.json`
    // files, and the in-scope split is FIFTEEN PRESENT / SIX ABSENT.
    expect(Object.keys(DECLARED_VALIDATION_SCHEMA)).toStrictEqual(['conditions', 'properties']);
  });
});

// ===========================================================================
// The error register, invoked directly on this entity
// ===========================================================================
//
// ★★★ ADDED BECAUSE A MECHANICAL INVENTORY FOUND THESE MEMBERS NAMED BUT NEVER CALLED HERE. A code
// review reported that "nine public methods have no invocation in any test AST", which is a sharper
// question than whether a name appears somewhere: a method mentioned only in a comment is a method
// nothing exercises. The register's behaviour WAS covered - through the service suites, where a refused
// save is observed - but not at the entity that declares it, so the per-entity contract rested on
// another tier's assertions. Gate `A24` now requires an actual invocation.
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees and
// that the save-refusal semantics depend on: a MISS yields an empty array rather than undefined,
// messages ACCUMULATE under one name rather than replacing, and lookup is CASE-INSENSITIVE while the
// key remembers the case it was FIRST written with.

describe('PriceGroupRate: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent name
    // has to be safe to iterate - `undefined` here would turn a clean validation pass into a crash.
    const subject = new PriceGroupRate({ priceGroupRateID: 'rate-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after the
    // first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new PriceGroupRate({ priceGroupRateID: 'rate-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling, so the published key is the one the first write used.
    const subject = new PriceGroupRate({ priceGroupRateID: 'rate-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
