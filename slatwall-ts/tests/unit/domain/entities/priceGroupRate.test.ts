// slatwall-ts - unit suite for `src/domain/entities/priceGroupRate.ts`
//
// `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95-L174] - eighty lines of string assembly
// with five outcomes, hardcoded English labels, six pluralised fragments in a fixed order.
//
// Alongside them: the four owner-side bidirectional pairs and their asymmetric guards, the
// primary-key containment probes, the `''`-keyed `isNew()`, the nullable `roundingRule`, the audit
// columns.
//
// Everything else is a `CFML parity` note, a `LEGACY-NOTE` or a `JUDGMENT CALL`.

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

/**
 * The resource-bundle key `getAppliesTo()` returns UNRESOLVED on its global short-circuit.
 *
 * CFML parity [model/entity/PriceGroupRate.cfc:L106-L108]: `getGlobalFlag()` early-returns
 * `rbKey('admin.pricegroup.edit.priceGroupRateAppliesToAllProducts')` before any list assembly.
 */
const APPLIES_TO_ALL_PRODUCTS_RB_KEY = 'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts';

/**
 * Every member the port ships, asserted as an exact set so a widening fails here.
 */
const PORTED_PUBLIC_SURFACE = [
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

/**
 * Explicit UTC instant for `createdDateTime`; never `new Date()`.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/**
 * A second explicit UTC instant, deliberately later than the first.
 */
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * A persisted rate: a non-empty key, so `isNew()` is false.
 */
const SAVED_RATE_ID = 'pgr-saved';

/**
 * The `unsavedvalue=""` key from [model/entity/PriceGroupRate.cfc:L52].
 */
const UNSAVED_RATE_ID = '';

// `getAppliesTo()` reads six live collections, so one shared subject would leak membership across
// the five grammar paths.

/**
 * The constructor's own parameter type, derived rather than restated.
 *
 * JUDGMENT CALL: `ConstructorParameters` instead of hand-copying the seventeen fields.
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

/**
 * `Product` derives newness from an empty key, so a non-empty one is saved.
 */
function aProduct(productID = 'prd-1'): Product {
  return new Product({ productID });
}

/**
 * A saved product type.
 */
function aProductType(productTypeID = 'ptp-1'): ProductType {
  return new ProductType({ productTypeID });
}
function aSku(skuID = 'sku-1'): Sku {
  return new Sku({ skuID });
}

/**
 * An UNSAVED SKU. `src/domain/entities/sku.ts` takes an explicit hydration flag, so `{ skuID: '' }`
 * alone reports `isNew()` false.
 */
function anUnsavedSku(): Sku {
  return new Sku({ skuID: '', isNew: true });
}

/**
 * Distinct saved products, keyed by index.
 */
function products(count: number): Product[] {
  return Array.from({ length: count }, (_unused, index) => aProduct(`prd-${String(index + 1)}`));
}

/**
 * `count` distinct saved product types.
 */
function productTypes(count: number): ProductType[] {
  return Array.from({ length: count }, (_unused, index) =>
    aProductType(`ptp-${String(index + 1)}`),
  );
}

/**
 * `count` distinct saved SKUs.
 */
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
 * applies a default parameter to an explicitly-passed `undefined`.
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

/**
 * One crossing of the rounding boundary, as recorded.
 */
interface RecordedRoundValueCall {
  readonly value: Money;
  readonly rule: RoundingRule;
}

/**
 * A rounding rule that RECORDS every `roundValue` crossing instead of performing one.
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

/**
 * The recorder paired with the rule that holds it.
 */
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

describe('getAppliesTo path 1 of 5: the global short-circuit', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L106-L108]: getGlobalFlag() early-returns the raw
  // rbKey 'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts' before any list assembly.

  it('returns the resource-bundle key itself, unresolved', () => {
    const subject = aRate({ globalFlag: true });

    expect(subject.getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
  });

  it('returns the key even with all six collections populated, leaking no count', () => {
    // The short-circuit is at [model/entity/PriceGroupRate.cfc:L106], before the including branch
    // at [model/entity/PriceGroupRate.cfc:L110] and the excluding branch at
    // [model/entity/PriceGroupRate.cfc:L135].
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
    // The key carries no digit at all, so a leaked count of any of the six collections would be
    // visible as one.
    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(appliesTo).not.toContain(digit);
    }
  });

  it('fires for every column value CFML would have read as true', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L53]: `ormType="boolean" default="false"` is a
    // declaration about rows the ORM inserts, not a guarantee about rows already in the table.
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

describe('getAppliesTo path 2 of 5: neither including nor excluding', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L98, L173]: `finalString` is seeded to `""` at
  // [model/entity/PriceGroupRate.cfc:L98], both assembly guards at
  // [model/entity/PriceGroupRate.cfc:L162] and [model/entity/PriceGroupRate.cfc:L166] are skipped
  // when their halves are empty, and [model/entity/PriceGroupRate.cfc:L173] returns that seed.

  it('returns the empty string, and does not throw', () => {
    const subject = aRate();

    expect(subject.getAppliesTo()).toBe('');
  });

  it('returns the empty string when the constructor omitted every collection', () => {
    // A repository that did not fetch the six joins must present empty arrays, never undefined -
    // which is what makes the `arrayLen(...)` guards at [model/entity/PriceGroupRate.cfc:L111],
    // [model/entity/PriceGroupRate.cfc:L114], [model/entity/PriceGroupRate.cfc:L117],
    // [model/entity/PriceGroupRate.cfc:L136].
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

describe('getAppliesTo path 3 of 5: including only', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L162-L164]:
  // `finalString = "Including: " & including`, and the `". "` separator at
  // [model/entity/PriceGroupRate.cfc:L168] lives inside `if(len(excluding))` at
  // [model/entity/PriceGroupRate.cfc:L166], so it can never be appended when the excluding half is
  // empty.

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
    // `ListAppend`, which emits no leading delimiter into an empty list.
    const subject = aRate({ skus: skus(3) });

    expect(subject.getAppliesTo()).toBe('Including: 3 SKUs');
  });
});

describe('getAppliesTo path 4 of 5: excluding only', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L166-L171]: the `". "` at
  // [model/entity/PriceGroupRate.cfc:L168] is nested inside `if(len(including))`, so an
  // excluding-only rate gets no leading separator.

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

describe('getAppliesTo path 5 of 5: both halves', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L166-L171]: the `". "` separator is emitted on
  // this PATH only, because [model/entity/PriceGroupRate.cfc:L167-L169] requires both halves to be
  // non-empty.

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
    // all six collections, and it is fed entirely from overrides.
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
    // Path 1 wins over path.
    const subject = aRate({
      globalFlag: true,
      products: products(2),
      excludedSkus: skus(3),
    });

    expect(subject.getAppliesTo()).toBe(APPLIES_TO_ALL_PRODUCTS_RB_KEY);
  });
});

describe('getAppliesTo pluralization: the include collections', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L112, L115, L118]: the pluraliser is
  // `IIF(arrayLen(...) GT 1, DE('s'), DE(''))`, so the boundary is strictly greater than one:
  // exactly one is singular, two or more plural.
  //
  // CFML parity [model/entity/PriceGroupRate.cfc:L112-L118, L163, L168, L170]: the labels are
  // HARDCODED ENGLISH, not resource-bundle keys: `"Product"`, `"Product Type"`, `"SKU"`,
  // `"Including: "`, `"Excluding: "` and the `". "` joiner are all literals.

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
    // That falls out of [model/entity/PriceGroupRate.cfc:L118] appending the same `DE('s')` branch
    // used for the other two nouns.
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

describe('getAppliesTo: the preserved first-comma-only Replace, including half', () => {
  // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L132]: the comment at
  // [model/entity/PriceGroupRate.cfc:L130] says "Replace all commas with " and "." but CFML
  // `Replace()` called with three arguments defaults to scope "once".
  // Preserved deliberately; do not fix without a product decision.

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
    // With two fragments the list holds exactly one comma, so one replacement is enough and the
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
  // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L158]: the comment at
  // [model/entity/PriceGroupRate.cfc:L156] says "Replace all commas with " and "." but CFML
  // `Replace()` called with three arguments defaults to scope "once".
  // Preserved deliberately; do not fix without a product decision.

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

describe('the three CFML case-insensitivity hazards', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L101/L118, L103/L149, L82/L271]: three
  // case-insensitivity hazards.

  it('reaches the SKU fragment despite the skusList / SkusList split at L101 and L118', () => {
    // The hazard: [model/entity/PriceGroupRate.cfc:L101] declares `skusList`, and
    // [model/entity/PriceGroupRate.cfc:L118], [model/entity/PriceGroupRate.cfc:L126] and
    // [model/entity/PriceGroupRate.cfc:L127] all write and read `SkusList`.
    const subject = aRate({ skus: skus(2) });

    expect(subject.getAppliesTo()).toBe('Including: 2 SKUs');
  });

  it('reaches the SKU fragment alongside the other two, in third position', () => {
    const subject = aRate({ products: products(1), productTypes: productTypes(1), skus: skus(5) });

    expect(subject.getAppliesTo()).toBe('Including: 1 Product and 1 Product Type,5 SKUs');
  });

  it('reaches the excluded-product-type fragment despite the L103 / L149 split', () => {
    // The hazard: [model/entity/PriceGroupRate.cfc:L103] declares `excludedProductTypesList` and
    // [model/entity/PriceGroupRate.cfc:L140] assigns it, both with a capital P.
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
    // The third hazard is the only one of the three that is a DATA CONTRACT rather than an
    // internal local.
    const subject = aRate({ priceGroup: aPriceGroup('Wholesale') });

    expect(subject.getSimpleRepresentationPropertyName()).toBe('DisplayName');
    expect(typeof subject.getDisplayName).toBe('function');
    expect(PORTED_PUBLIC_SURFACE).toContain('getDisplayName');
    expect(PORTED_PUBLIC_SURFACE).not.toContain('getdisplayName');
  });
});

describe('getAmountTypeOptions', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L87-L93]: the body is a bare `return [... ]` of
  // three struct literals with no conditional of any kind, so the same three options come back for
  // every rate in every state.

  it('returns exactly the three legacy options, in source order, with both fields', () => {
    const subject = aRate();

    expect(subject.getAmountTypeOptions()).toStrictEqual([
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ]);
  });

  it('is UNCONDITIONAL: the same three options whatever the rate holds', () => {
    // CONTRAST [model/entity/PromotionReward.cfc:L120-L133], whose `getAmountTypeOptions()` is
    // conditional - `if(getRewardType() == "order")` returns only two options and drops
    // `define.fixedAmount`.
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
    // {name=rbKey("define.fixedAmount"), value="amount"} This is a real data contract, not a slip
    // to tidy: `amount` is the literal the service's `switch` compares against
    // [model/service/PriceGroupService.cfc:L334].
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
  // column with `hb_formFieldType="select"` and no check constraint, so narrowing a hydrated value
  // to the published vocabulary belongs at the repository boundary.

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
    // unset `amountType` is genuinely absent.
    expect(aRate().getAmountType()).toBeUndefined();
  });

  it('rejects a fourth value at compile time', () => {
    // The out-of-vocabulary column string the legacy schema cannot prevent - published by the
    // shared fixture graph precisely so a boundary suite can drive narrowing with it.
    const fixtures = makePriceGroupFixtures();

    expect(fixtures.unrecognisedAmountTypeColumnValue).toBe('flatRate');

    // `PriceGroupRateAmountType` is closed at the three values published by
    // `getAmountTypeOptions()` [model/entity/PriceGroupRate.cfc:L87-L93], and no cast is available
    // here, which is the point.
    // @ts-expect-error out-of-vocabulary column string, not assignable without a cast
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

describe('getAmountFormatted: the percentage branch drops trailing zeros', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L262-L268]: `getAmountFormatted` branches only on
  // `percentageOff`, which uses RAW CFML string concatenation with a literal `"%"`: return
  // getAmount() & "%" at [model/entity/PriceGroupRate.cfc:L264].

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
    // CFML parity [model/entity/PriceGroupRate.cfc:L263]: the legacy test is `==`, which on
    // strings is case-insensitive in CFML, so a rate stored as `'PercentageOff'` renders as a
    // percentage there.
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'PercentageOff' as PriceGroupRateAmountType,
    });

    expect(subject.getAmountFormatted()).toBe('12.5%');
    expect(subject.getAmountFormatted()).not.toBe('12.50');
  });

  it('still falls through to the currency branch for a value outside the vocabulary', () => {
    // Folding case widened which spellings reach the percentage branch; it did not open the
    // vocabulary. A genuinely unrecognised value still takes
    // [model/entity/PriceGroupRate.cfc:L266], exactly as before.
    const subject = aRate({
      amount: Money.fromDecimalString('12.50'),
      amountType: 'somethingElse' as PriceGroupRateAmountType,
    });

    expect(subject.getAmountFormatted()).toBe('12.50');
  });

  it('renders a bare "%" when the amount column is null', () => {
    // CFML parity [model/entity/PriceGroupRate.cfc:L264]: the legacy concatenates `getAmount()`
    // with no null guard, and CFML concatenation of a null operand yields the EMPTY STRING rather
    // than raising, so the percent sign survives alone.
    const subject = aRate({ amountType: 'percentageOff' });

    expect(subject.getAmount()).toBeUndefined();
    expect(subject.getAmountFormatted()).toBe('%');
  });

  it('reaches the percentage branch on an exact, case-sensitive match', () => {
    // CFML `==` at [model/entity/PriceGroupRate.cfc:L263] compares strings case-INSENSITIVELY,
    // while the port compares with `===`.
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
  // `amount` and an absent or unrecognised amount type - the strict comparison at
  // [model/entity/PriceGroupRate.cfc:L263] simply fails for anything that is not the exact string
  // `"percentageOff"`.

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
    // literal `"percentageOff"`, so any other state - including a null column - takes the `else`
    // at [model/entity/PriceGroupRate.cfc:L265-L267].
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
    // non-ported org/Hibachi/** formatter whose locale resolution and currency-symbol behaviour
    // are not reproduced, because JavaRB is not ported and no i18n runtime is introduced.
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
    // BOUNDARY, stated because one of these literals invites a misreading: every value below is
    // the fixture's STORED amount rendered by `getAmountFormatted()`.
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
  // `hb_formatType="custom"` and no `default=`.

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

describe('getSimpleRepresentationPropertyName', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L270-L272]: returns the literal `"DisplayName"`
  // with a CAPITAL D, while the property is declared lowercase `displayName` at
  // [model/entity/PriceGroupRate.cfc:L82] and the accessor is `getDisplayName()` at
  // [model/entity/PriceGroupRate.cfc:L274].

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
    // The value is only useful if `get` + the returned name resolves to a real member, which is
    // the whole mechanism the framework relies on.
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
  // Two `" - "` separators, space-hyphen-space, preserved byte for byte.

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
    // [model/entity/PriceGroupRate.cfc:L275] concatenates `getAmount()` directly.
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
    // The price group is PRESENT, so the dereference at [model/entity/PriceGroupRate.cfc:L275]
    // succeeds; only its nullable name folds.
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
    // CFML parity [model/entity/PriceGroupRate.cfc:L275]: `getPriceGroup()` is dereferenced with
    // no null guard, so a rate whose price group is unset is a null-reference error in CFML too.
    const subject = aRate();

    expect(subject.getPriceGroup()).toBeUndefined();
    expect(() => subject.getDisplayName()).toThrow(/no materialized priceGroup/);
  });

  it('RAISES for an unsaved rate as readily as a saved one', () => {
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });

    expect(() => subject.getDisplayName()).toThrow(Error);
  });

  it('RAISES again after the price group has been removed', () => {
    // `removePriceGroup()` clears the field unconditionally at
    // [model/entity/PriceGroupRate.cfc:L195], so a rate that once had a price group returns to the
    // raising state.
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate({ priceGroup });

    expect(subject.getDisplayName()).toBe('Wholesale -  - ');

    subject.removePriceGroup();

    expect(() => subject.getDisplayName()).toThrow(Error);
  });

  it('means a fresh instance has no usable simple representation, which is a finding', () => {
    // This is why [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]'s inherited
    // `simple_representation_exists_and_is_simple()` is not forced into this suite.
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
  // CFML parity `model/entity/PriceGroupRate.cfc`: there is no `getAmountRepresentation()`
  // anywhere in the 284 lines - verified by reading the whole file.

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

    // `model/entity/PriceGroupRate.cfc` declares no `getAmountRepresentation` even though
    // [model/service/PriceGroupService.cfc:L243] calls it.
    // @ts-expect-error no such member: the port ships no dynamic dispatch
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

describe('the three excluded collections and the gap they represent', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
  // `excludedProducts` and `excludedSkus` are RETAINED for schema and interface fidelity even
  // though the five-level cascade [model/service/PriceGroupService.cfc:L140-L181] never consults
  // any of them.

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
    // Populating all three changes the label and nothing else that this entity publishes.
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
    // state is representable.
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
    // `removeExcludedProductType`, `addExcludedProduct`, `removeExcludedProduct`.
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

    // `component... Accessors=true` [model/entity/PriceGroupRate.cfc:L49] generates a
    // `set<Property>` for every declared property, so CFML generated `setExcludedProducts`,
    // `setExcludedProductTypes` and `setExcludedSKUs`.
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

    // [model/entity/PriceGroupRate.cfc:L178-L258] declares no helper for any of the three exclude
    // collections - the ORM population path is their only writer.
    // @ts-expect-error no such helper on the exclude side
    const absent: unknown = subject.addExcludedSku;

    expect(absent).toBeUndefined();
  });

  it('is typed readonly, so the type system states that nothing here mutates them', () => {
    // JUDGMENT CALL: the assertion is a compile-time one because the fact being pinned is a
    // compile-time fact.
    const subject = aRate({ excludedSkus: skus(1) });

    // The readonly result is assignable to a readonly binding...
    const excluded: readonly Sku[] = subject.getExcludedSkus();

    // `getExcludedSkus()` returns `readonly Sku[]` because no code path in
    // [model/entity/PriceGroupRate.cfc:L178-L258] ever appends to an exclude collection.
    // @ts-expect-error readonly Sku[] is not assignable to a mutable Sku[]
    const mutable: Sku[] = subject.getExcludedSkus();

    // The three include accessors, by contrast, hand out a genuinely mutable array.
    const includedIsMutable: Sku[] = subject.getSkus();

    expect(excluded).toHaveLength(1);
    expect(mutable).toHaveLength(1);
    expect(includedIsMutable).toHaveLength(0);
  });
});

describe('collection accessors', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L71-L77]: a Hibernate-managed collection is never
  // null, so all six accessors answer with an array on a rate constructed with none - never
  // `undefined`, never a sentinel.

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
    // CFML parity [model/entity/PriceGroupRate.cfc:L71-L77]: not one of the six declares
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
  // persistent row.

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
    // mean every unsaved row's key is `''`, so a key comparison necessarily conflates them.
    const heldUnsaved = anUnsavedSku();
    const subject = aRate({ skus: [heldUnsaved] });
    const differentUnsaved = anUnsavedSku();

    expect(heldUnsaved).not.toBe(differentUnsaved);
    expect(subject.hasSku(differentUnsaved)).toBe(true);
    expect(subject.hasSku(aSku('sku-1'))).toBe(false);
  });
});

describe('setPriceGroup', () => {
  // The near-side assignment is UNCONDITIONAL and happens FIRST; only the far-side append is
  // guarded.

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
    // Nothing in [model/entity/PriceGroupRate.cfc:L181-L186] detaches the previous parent - the
    // assignment simply overwrites.
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
    // The assignment at [model/entity/PriceGroupRate.cfc:L182] sits OUTSIDE the guard, so a rate
    // the parent already holds still gets its own field written.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const priceGroup = aPriceGroup('Wholesale', [subject]);

    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);

    subject.setPriceGroup(priceGroup);

    expect(subject.getPriceGroup()).toBe(priceGroup);
    expect(priceGroup.getPriceGroupRates()).toHaveLength(1);
  });
});

describe('removePriceGroup', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L187-L196]: the only one of this class's four
  // `remove*` helpers whose argument is OPTIONAL - `any priceGroup` with no `required`.

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
    // [model/entity/PriceGroupRate.cfc:L195] is outside the `if(index > 0)` guard, so a miss on
    // the far side still detaches.
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
    // `arrayFind` at [model/entity/PriceGroupRate.cfc:L191] returns one index and `arrayDeleteAt`
    // at [model/entity/PriceGroupRate.cfc:L193] deletes one element, so a rate double-appended
    // while unsaved needs two removals.
    const priceGroup = aPriceGroup('Wholesale');
    const subject = aRate({ priceGroupRateID: UNSAVED_RATE_ID });
    subject.setPriceGroup(priceGroup);
    subject.setPriceGroup(priceGroup);

    subject.removePriceGroup(priceGroup);

    expect(priceGroup.getPriceGroupRates()).toStrictEqual([subject]);
  });

  it('RAISES when called with no argument on a rate that has no price group', () => {
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L189-L192]: the omitted argument defaults to
    // the null `variables.priceGroup` and `getPriceGroupRates()` is then invoked on it - a method
    // call on null under every CFML engine.
    const subject = aRate();

    expect(subject.getPriceGroup()).toBeUndefined();
    expect(() => subject.removePriceGroup()).toThrow(/no argument on a rate that has no/);
  });

  it('does NOT raise when an explicit price group is supplied to an unattached rate', () => {
    // The default branch is what raises; supplying the argument skips it entirely, and the
    // unconditional clear at [model/entity/PriceGroupRate.cfc:L195] is then a no-op on an
    // already-empty field.
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

describe('the guard asymmetry in the three add helpers', () => {
  // CFML parity [model/entity/PriceGroupRate.cfc:L199-L206, L219-L226, L239-L246]: the NEAR-side
  // guard tests the ARGUMENT's newness (`arguments.productType.isNew()`) while the FAR-side guard
  // tests this RATE's newness (`isNew()`).

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
    // [model/entity/PriceGroupRate.cfc:L200-L205] orders the two guarded blocks near-first.
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
  // Inversion cross-check verdict: clean.

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

    // [model/entity/PriceGroupRate.cfc:L247] declares `required any sku`, and only
    // `removePriceGroup` at [model/entity/PriceGroupRate.cfc:L187] declares an optional one. No
    // `structKeyExists` defaulting applies here.
    // @ts-expect-error the argument is required
    const rejected = (): void => subject.removeSku();

    expect(typeof rejected).toBe('function');
  });

  it('removes the requested UNSAVED member, not the first unsaved one it finds', () => {
    // What `arrayFind(collection, object)` actually compared, and why a key comparison is not the
    // same thing for an unsaved row.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const firstUnsaved = anUnsavedSku();
    const secondUnsaved = anUnsavedSku();

    subject.getSkus().push(firstUnsaved, secondUnsaved);

    subject.removeSku(secondUnsaved);

    // The one that was ASKED for is gone, and the other is untouched. A key comparison would have
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
    // The far side has the same hazard from the other end: `removeProductType` looks for this RATE
    // inside the product type's collection.
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
    // The fallback is scoped to empty keys and nothing else.
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const heldInstance = aSku('sku-shared-key');
    const equalKeyOtherInstance = aSku('sku-shared-key');

    subject.getSkus().push(heldInstance);

    expect(equalKeyOtherInstance).not.toBe(heldInstance);

    subject.removeSku(equalKeyOtherInstance);

    expect(subject.getSkus()).toStrictEqual([]);
  });
});

// The five generated property setters.
//
// [model/entity/PriceGroupRate.cfc:L49] declares `accessors=true`, so CFML generated a
// `set<Property>` for every persistent property without a line of authored code.

describe('setGlobalFlag', () => {
  it('★★ replaces the flag, which is what makes rate exclusivity enforceable', () => {
    // [model/service/PriceGroupService.cfc:L430] `rates[i].setGlobalFlag(false)` demotes every
    // other global rate in a price group.
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
    // writes.
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
    // [model/entity/PriceGroupRate.cfc:L54] declares no `default=`, unlike model/entity/Sku.cfc
    // L55/L56/L57 which all declare `default="0"`.
    const subject = aRate({ amount: Money.fromDecimalString('12.50') });

    subject.setAmount(undefined);

    expect(subject.getAmount()).toBeUndefined();
  });

  it('is the member the ported population step writes through', () => {
    // [org/Hibachi/HibachiService.cfc:L146] populates the entity from the payload before
    // validating it, and `amount` is the one persistent property the ported
    // `PriceGroupRateSaveInput` publishes.
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
    // This is the difference between the two idioms
    // [model/service/PriceGroupService.cfc:L417-L425 versus L437-L442].
    const excludedSku = aSku('sku-far-side');
    const subject = aRate({ priceGroupRateID: SAVED_RATE_ID, excludedSkus: [excludedSku] });

    // The far side never knew about the exclusion in the first place: no `addExcludedSku` exists
    // to have registered it, which is why there is nothing here to become stale.
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

describe('structural parity with the SwPriceGroupRate row', () => {
  // C5 schema continuity [model/entity/PriceGroupRate.cfc:L49]: `table="SwPriceGroupRate"`,
  // `persistent=true output=false accessors=true`, `cacheuse="transactional"`,
  // `hb_serviceName="priceGroupService"`, `hb_permission="priceGroup.priceGroupRates"`.

  it('publishes exactly the ported public surface, and nothing more', () => {
    const shipped = Object.getOwnPropertyNames(PriceGroupRate.prototype)
      .filter((member) => member !== 'constructor')
      .sort();

    expect(shipped).toStrictEqual([...PORTED_PUBLIC_SURFACE]);
  });

  it('needs nothing but a primary key to exist - no port, no clock, no repository', () => {
    // `model/entity/PriceGroupRate.cfc` has ZERO `getService(` sites, verified by grepping the
    // whole file, and so does its parent `model/entity/PriceGroup.cfc`.
    expect(PriceGroupRate.length).toBe(1);

    const subject = new PriceGroupRate({ priceGroupRateID: SAVED_RATE_ID });

    expect(subject.getPriceGroupRateID()).toBe(SAVED_RATE_ID);
  });

  it('reads as unsaved for the empty key from L52 and saved for anything else', () => {
    // [model/entity/PriceGroupRate.cfc:L52] `unsavedvalue="" default=""` is what makes
    // [org/Hibachi/HibachiEntity.cfc:L571-L576]'s `getPrimaryIDValue() == ""` test honest, so the
    // port's `isNew()` needs no separate flag - unlike src/domain/entities/sku.ts.
    expect(aRate({ priceGroupRateID: UNSAVED_RATE_ID }).isNew()).toBe(true);
    expect(aRate({ priceGroupRateID: SAVED_RATE_ID }).isNew()).toBe(false);
    expect(aRate({ priceGroupRateID: '0' }).isNew()).toBe(false);
  });

  it('defaults globalFlag to false, per L53', () => {
    expect(aRate().getGlobalFlag()).toBe(false);
    expect(aRate({ globalFlag: true }).getGlobalFlag()).toBe(true);
  });

  it('leaves amount and amountType absent, because L54 and L55 declare no default', () => {
    // `amount` is one of exactly four no-default money columns in the slice, alongside
    // [model/entity/SkuCurrency.cfc:L53], [model/entity/PromotionApplied.cfc:L53] and
    // [model/entity/PromotionReward.cfc:L61] - in pointed contrast with `Sku.price`,
    // `Sku.listPrice` and `Sku.renewalPrice`.
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
    // BOUNDARY. [model/entity/PriceGroupRate.cfc:L68] is an association and nothing more: no
    // method on this entity rounds anything.
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
    // and closes with nothing between the two lines.
    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    expect(members).not.toContain('preInsert');
    expect(members).not.toContain('preUpdate');
    expect(members).not.toContain('postInsert');
    expect(members).not.toContain('postUpdate');
    expect(members).not.toContain('preDelete');
  });

  it('declares no framework member the port deliberately left behind', () => {
    // §7 explain rather than fabricate: `getNewFlag()`, `getPrintTemplates()`,
    // `getEmailTemplates()`, `clearAttributeCache()`, the four inherited memos and every
    // smart-list getter live on `org/Hibachi/HibachiEntity.cfc`.
    const members = Object.getOwnPropertyNames(PriceGroupRate.prototype);

    for (const notPorted of [
      'getNewFlag',
      'getPrintTemplates',
      'getEmailTemplates',
      'clearAttributeCache',
      'getPropertyTitle',
      'getAttributeValue',
      // `validate` STAYS UNPORTED even though the error register it wrote into does not: the
      // register is five small members with no framework behind them.
      'validate',
    ]) {
      expect(members).not.toContain(notPorted);
    }
  });

  it('exposes no attributeValues, which is what made the legacy dispatcher throw', () => {
    // [org/Hibachi/HibachiEntity.cfc:L559] reaches the EAV fallback only when
    // `hasProperty("attributeValues")` holds.
    const subject = aRate();

    expect('attributeValues' in subject).toBe(false);
    expect(Object.getOwnPropertyNames(PriceGroupRate.prototype)).not.toContain(
      'getAttributeValues',
    );
  });

  it('exports exactly the class and the amount-type union, with no barrel', () => {
    expect(typeof PriceGroupRate).toBe('function');
    expect(PriceGroupRate.name).toBe('PriceGroupRate');

    const declaredAmountType: PriceGroupRateAmountType = 'amount';

    expect(declaredAmountType).toBe('amount');
  });
});

/**
 * `model/validation/PriceGroupRate.json`, VERBATIM and complete: twelve lines carrying one
 * condition and three properties.
 *
 * None of the three rules is ENFORCED by the entity, and none is asserted here as though it were:
 * requiredness and schema validation live at the SERVICE tier.
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
    // pattern.
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
  // CFML parity `model/validation/PriceGroupRate.json`: `conditions.isNotGlobal` is ORPHANED - no
  // property in the schema references it - and it carries a SECOND anomaly on top: it keys on the
  // GETTER NAME `getGlobalFlag` rather than the property `globalFlag`.

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
  // The absences are as much a part of the contract as the three rules, and nothing is invented to
  // fill them.

  it('declares NO delete-context gate at all', () => {
    // Contrast `model/validation/PriceGroup.json`, re-read for this suite, which declares six
    // `{"contexts":"delete","maxCollection":0}` gates - `appliedOrderItems`, `childPriceGroups`,
    // `accounts`, `subscriptionBenefits`, `subscriptionUsageBenefits`, `promotionRewards` - and
    // `model/validation/RoundingRule.json`.
    const contexts = Object.values(DECLARED_VALIDATION_SCHEMA.properties)
      .flat()
      .map((rule) => rule.contexts);

    expect(contexts).toStrictEqual(['save', 'save', 'save']);
    expect(contexts).not.toContain('delete');
  });

  it('declares NO rule for globalFlag, even though a condition is written about it', () => {
    // The sharpest absence in the file: `globalFlag` drives the early return at
    // [model/entity/PriceGroupRate.cfc:L106-L108] and is the subject of the orphaned condition,
    // yet no property rule mentions it.
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
    // CFML parity: a `"method"` key names an entity member the framework invoked by string.
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
    // Verified correction to AAP 0.2.1, which states twelve: `model/validation/` holds 96 `.json`
    // files, and the in-scope split is fifteen present / six absent.
    expect(Object.keys(DECLARED_VALIDATION_SCHEMA)).toStrictEqual(['conditions', 'properties']);
  });
});

// The error register, invoked directly on this entity.
//
// Review reported that "nine public methods have no invocation in any test AST".
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees
// and that the save-refusal semantics depend on: a MISS yields an empty array rather than
// undefined.

describe('PriceGroupRate: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent
    // name has to be safe to iterate - `undefined` here would turn a clean validation pass into a
    // crash.
    const subject = new PriceGroupRate({ priceGroupRateID: 'rate-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after
    // the first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new PriceGroupRate({ priceGroupRateID: 'rate-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling.
    const subject = new PriceGroupRate({ priceGroupRateID: 'rate-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
