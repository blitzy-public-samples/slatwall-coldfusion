// slatwall-ts - unit suite for `src/domain/entities/brand.ts`.
//
// LEGACY-EXTENDED: carries `defaults_are_correct` forward from
// [meta/tests/unit/entity/BrandTest.cfc:L58-L60] together with the cases Brand inherits from
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67]. Every other block is labelled
// NET-NEW at its `describe`, so net-new coverage is never read as parity.
//
// Regression-case traceability: `tests/traceability/legacyTestMap.ts` routes `issue_1097`,
// `issue_1296`, `issue_1329`, `issue_1331`, `issue_1335`, `issue_1348`, `issue_1376`,
// `issue_1604` and `issue_1690` [meta/tests/unit/IssuesTest.cfc] here for the record. Not one of
// them names a brand, so none adds a case to this suite.

import { describe, expect, it } from 'vitest';

import { Brand } from '../../../../src/domain/entities/brand.js';
import type {
  PhysicalBrandLink,
  ProductBrandLink,
  PromotionQualifierBrandLink,
  PromotionRewardBrandLink,
  VendorBrandLink,
} from '../../../../src/domain/entities/brand.js';
import type { Product } from '../../../../src/domain/entities/product.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';

const CREATED_INSTANT = new Date('2024-06-01T00:00:00.000Z');
const MODIFIED_INSTANT = new Date('2024-06-02T12:30:45.000Z');

/**
 * A syntactically well-formed but obviously inert website value.
 *
 * P6 forbids a hostname, an address, a connection string or a credential anywhere in this file,
 * and `brandWebsite` is the one column that invites one.
 */
const INERT_BRAND_WEBSITE = 'https://brand.example.invalid/catalog';

// Hand-written in-memory far-side doubles.

/**
 * Appends a key once, mirroring the far side's `isNew() or !hasX(...)` guard for a SAVED row. A
 * pure function over its argument; it holds no state.
 */
function appendOnce(keys: string[], key: string): void {
  if (!keys.includes(key)) {
    keys.push(key);
  }
}

/**
 * Withdraws a key if present.
 *
 * Uses `!== -1`: CFML's `arrayFind` returns a 1-BASED index or 0, while `indexOf` returns a
 * 0-BASED index or -1, so carrying the legacy `> 0` test across would skip element zero.
 */
function withdraw(keys: string[], key: string): void {
  const index = keys.indexOf(key);
  if (index !== -1) {
    keys.splice(index, 1);
  }
}

/**
 * The far side of the `brandID` many-to-one, recording delegations only.
 */
class ProductLinkDouble implements ProductBrandLink {
  readonly calls: string[] = [];
  readonly owningBrandIDs: string[] = [];

  setBrand(brand: Brand): void {
    this.calls.push('setBrand');
    appendOnce(this.owningBrandIDs, brand.getBrandID());
  }

  removeBrand(brand: Brand): void {
    this.calls.push('removeBrand');
    withdraw(this.owningBrandIDs, brand.getBrandID());
  }
}

/**
 * The far side of `SwPromoRewardBrand` and `SwPromoRewardExclBrand`.
 *
 * Inclusion and exclusion are two distinct link tables sharing one entity type, so this double
 * keeps two independent lists.
 */
class PromotionRewardLinkDouble implements PromotionRewardBrandLink {
  readonly calls: string[] = [];
  private readonly included: string[] = [];
  private readonly excluded: string[] = [];

  addBrand(brand: Brand): void {
    this.calls.push('addBrand');
    appendOnce(this.included, brand.getBrandID());
  }

  removeBrand(brand: Brand): void {
    this.calls.push('removeBrand');
    withdraw(this.included, brand.getBrandID());
  }

  addExcludedBrand(brand: Brand): void {
    this.calls.push('addExcludedBrand');
    appendOnce(this.excluded, brand.getBrandID());
  }

  removeExcludedBrand(brand: Brand): void {
    this.calls.push('removeExcludedBrand');
    withdraw(this.excluded, brand.getBrandID());
  }

  includedBrandIDs(): readonly string[] {
    return [...this.included];
  }

  excludedBrandIDs(): readonly string[] {
    return [...this.excluded];
  }
}

/**
 * The far side of `SwPromoQualBrand` and `SwPromoQualExclBrand`.
 */
class PromotionQualifierLinkDouble implements PromotionQualifierBrandLink {
  readonly calls: string[] = [];
  private readonly included: string[] = [];
  private readonly excluded: string[] = [];

  addBrand(brand: Brand): void {
    this.calls.push('addBrand');
    appendOnce(this.included, brand.getBrandID());
  }

  removeBrand(brand: Brand): void {
    this.calls.push('removeBrand');
    withdraw(this.included, brand.getBrandID());
  }

  addExcludedBrand(brand: Brand): void {
    this.calls.push('addExcludedBrand');
    appendOnce(this.excluded, brand.getBrandID());
  }

  removeExcludedBrand(brand: Brand): void {
    this.calls.push('removeExcludedBrand');
    withdraw(this.excluded, brand.getBrandID());
  }

  includedBrandIDs(): readonly string[] {
    return [...this.included];
  }

  excludedBrandIDs(): readonly string[] {
    return [...this.excluded];
  }
}

/**
 * The far side of `SwVendorBrand`.
 *
 * `model/entity/Vendor.cfc` is out of SCOPE - the plan excludes the vendor module outright and
 * there is no `vendor.ts` in the eighteen-file entity budget.
 */
class VendorLinkDouble implements VendorBrandLink {
  readonly calls: string[] = [];
  private readonly brands: string[] = [];

  addBrand(brand: Brand): void {
    this.calls.push('addBrand');
    appendOnce(this.brands, brand.getBrandID());
  }

  removeBrand(brand: Brand): void {
    this.calls.push('removeBrand');
    withdraw(this.brands, brand.getBrandID());
  }

  brandIDs(): readonly string[] {
    return [...this.brands];
  }
}

/**
 * The far side of `SwPhysicalBrand`.
 */
class PhysicalLinkDouble implements PhysicalBrandLink {
  readonly calls: string[] = [];
  private readonly brands: string[] = [];

  addBrand(brand: Brand): void {
    this.calls.push('addBrand');
    appendOnce(this.brands, brand.getBrandID());
  }

  removeBrand(brand: Brand): void {
    this.calls.push('removeBrand');
    withdraw(this.brands, brand.getBrandID());
  }

  brandIDs(): readonly string[] {
    return [...this.brands];
  }
}

function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(Brand.prototype);
}

function productIDsOf(products: readonly Product[]): readonly string[] {
  return products.map((product: Product) => product.getProductID());
}

// One `it` per legacy method, each NAMED after the legacy method so the lineage is greppable, each
// citing its locator.
//
// `meta/tests/unit/entity/BrandTest.cfc` is 64 lines: L49 extends the base, L52-L56 is a `setUp`
// calling `super.setup()` and then `getService("brandService").newBrand()`.

describe('LEGACY-EXTENDED: the four cases Brand inherits or overrides', () => {
  // C8 LEGACY-EXTENDED [meta/tests/unit/entity/BrandTest.cfc:L58-L60]: overrides
  // SlatwallEntityTestBase.defaults_are_correct `meta/tests/unit/entity/BrandTest.cfc`.
  it('defaults_are_correct - getProducts() equals [] on a freshly built brand', () => {
    // This is the one hard legacy contract in the entire file, and the empty array is the
    // assertion, not a falsy value and not a nullish one.
    //
    // Which EMPTY-COLLECTION SEMANTIC this is, of the five this migration keeps distinct: not a
    // caller's permissive empty list, not an evaluator's restrictive one.
    const subject = new Brand();

    expect(subject.getProducts()).toEqual([]);
    expect(subject.getProducts()).toHaveLength(0);
    expect(subject.getProducts()).not.toBeUndefined();
    expect(subject.getProducts()).not.toBeNull();

    // CFML parity [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]: the base body
    // asserted `isNew()` and `!len(getPrimaryIDValue())`.
  });

  it('validate_as_save_for_a_new_instance_doesnt_pass - the DISPATCHER is not portable, the REGISTER is', () => {
    expect(prototypeMembers()).not.toContain('validate');
    expect(prototypeMembers()).toContain('hasErrors');
    expect(prototypeMembers()).toContain('hasError');
    expect(prototypeMembers()).toContain('getErrors');
    expect(prototypeMembers()).toContain('getError');
    expect(prototypeMembers()).toContain('addError');

    // And A bare entity carries no ERROR, which is the legacy case's actual subject: the CFML test
    // asserted that a NEW brand does not PASS validation, not that it arrives pre-flagged.
    expect(new Brand().hasErrors()).toBe(false);
    expect(new Brand().getErrors()).toStrictEqual({});

    const bare = new Brand();

    expect(bare.getBrandName()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();

    // And a fully-populated one supplies both.
    const populated = new Brand({ brandName: 'Acme', urlTitle: 'acme' });

    expect(populated.getBrandName()).toBe('Acme');
    expect(populated.getUrlTitle()).toBe('acme');
  });

  it('simple_representation_exists_and_is_simple - not portable, and not fabricated', () => {
    // CFML parity [model/entity/Brand.cfc:L157-L159]: the "Overridden Methods" banner pair is
    // LITERALLY EMPTY, L157 opening it and L159 closing it with nothing between.
    expect(prototypeMembers()).not.toContain('getSimpleRepresentation');
    expect(prototypeMembers()).not.toContain('getSimpleRepresentationPropertyName');
  });

  it('has_primary_id_property_name - not portable as written; the fact is asserted instead', () => {
    expect(prototypeMembers()).not.toContain('getPrimaryIDPropertyName');
    expect(prototypeMembers()).not.toContain('getPrimaryIDValue');
    expect(prototypeMembers()).toContain('getBrandID');

    const subject = new Brand({ brandID: 'brand-1' });

    expect(subject.getBrandID()).toBe('brand-1');
    expect(subject.getBrandID().length).toBeGreaterThan(0);
  });
});

describe('NET-NEW: brandID defaults to the empty string, which is what makes isNew() honest', () => {
  it('a bare brand is new and its primary id is the empty string, not undefined', () => {
    const subject = new Brand();

    expect(subject.getBrandID()).toBe('');
    expect(subject.getBrandID()).not.toBeUndefined();
    expect(subject.isNew()).toBe(true);
  });

  it('an explicitly empty brandID is the same unsaved state as omitting it', () => {
    const omitted = new Brand();
    const explicitUndefined = new Brand({ brandID: undefined });
    const explicitEmpty = new Brand({ brandID: '' });

    expect(omitted.isNew()).toBe(true);
    expect(explicitUndefined.isNew()).toBe(true);
    expect(explicitEmpty.isNew()).toBe(true);
    expect(explicitUndefined.getBrandID()).toBe('');
  });

  it('a hydrated brandID makes the entity not new', () => {
    const subject = new Brand({ brandID: 'c0ffee00c0ffee00c0ffee00c0ffee00' });

    expect(subject.getBrandID()).toBe('c0ffee00c0ffee00c0ffee00c0ffee00');
    expect(subject.isNew()).toBe(false);
  });

  it('no uuid is minted at construction, because generator="uuid" fires at INSERT', () => {
    // Two bare constructions are indistinguishable by key.
    const first = new Brand();
    const second = new Brand();

    expect(first.getBrandID()).toBe(second.getBrandID());
    expect(first.getBrandID()).toBe('');
  });

  it('exposes no setter at all, so the id and every column are hydrate-once', () => {
    // CFML parity [model/entity/Brand.cfc:L49]: `accessors=true` generated a getter and a setter
    // per persistent property.
    const setters = prototypeMembers().filter((member: string) => member.startsWith('set'));

    expect(setters).toEqual([]);
  });
});

describe('NET-NEW: activeFlag and publishedFlag declare NO ORM default', () => {
  it('an unset flag reads false - absent, not undefined', () => {
    const subject = new Brand();

    expect(subject.getActiveFlag()).toBe(false);
    expect(subject.getPublishedFlag()).toBe(false);
    expect(typeof subject.getActiveFlag()).toBe('boolean');
    expect(typeof subject.getPublishedFlag()).toBe('boolean');
  });

  it('a SQL NULL column reads false, which is what makes the undefaulted column safe', () => {
    const subject = new Brand({ activeFlag: null, publishedFlag: null });

    expect(subject.getActiveFlag()).toBe(false);
    expect(subject.getPublishedFlag()).toBe(false);
  });

  it('explicit booleans round-trip unchanged', () => {
    const active = new Brand({ activeFlag: true, publishedFlag: false });
    const published = new Brand({ activeFlag: false, publishedFlag: true });

    expect(active.getActiveFlag()).toBe(true);
    expect(active.getPublishedFlag()).toBe(false);
    expect(published.getActiveFlag()).toBe(false);
    expect(published.getPublishedFlag()).toBe(true);
  });

  it('the numeric and string column forms resolve to CFML truthiness', () => {
    expect(new Brand({ activeFlag: 1 }).getActiveFlag()).toBe(true);
    expect(new Brand({ activeFlag: 0 }).getActiveFlag()).toBe(false);
    expect(new Brand({ activeFlag: '1' }).getActiveFlag()).toBe(true);
    expect(new Brand({ activeFlag: '0' }).getActiveFlag()).toBe(false);
    expect(new Brand({ activeFlag: 'true' }).getActiveFlag()).toBe(true);
    expect(new Brand({ activeFlag: 'false' }).getActiveFlag()).toBe(false);
    expect(new Brand({ publishedFlag: 'yes' }).getPublishedFlag()).toBe(true);
    expect(new Brand({ publishedFlag: 'no' }).getPublishedFlag()).toBe(false);
    expect(new Brand({ publishedFlag: '' }).getPublishedFlag()).toBe(false);
  });

  it('the string forms are matched case-insensitively, as CFML matched them', () => {
    expect(new Brand({ activeFlag: 'TRUE' }).getActiveFlag()).toBe(true);
    expect(new Brand({ activeFlag: 'True' }).getActiveFlag()).toBe(true);
    expect(new Brand({ activeFlag: 'FALSE' }).getActiveFlag()).toBe(false);
    expect(new Brand({ publishedFlag: 'YES' }).getPublishedFlag()).toBe(true);
    expect(new Brand({ publishedFlag: 'No' }).getPublishedFlag()).toBe(false);
  });

  it('the two flags are independent of one another', () => {
    const subject = new Brand({ activeFlag: true, publishedFlag: false });

    expect(subject.getActiveFlag()).not.toBe(subject.getPublishedFlag());
  });
});

describe('NET-NEW: brandWebsite is a plain string - hb_formatType="url" is a hint only', () => {
  // CFML parity [model/entity/Brand.cfc:L57]: `hb_formatType="url"` on `brandWebsite` is
  // presentation metadata that told the legacy admin how to render the value.

  it('the value round-trips byte-for-byte, with no normalisation', () => {
    const subject = new Brand({ brandWebsite: INERT_BRAND_WEBSITE });

    expect(subject.getBrandWebsite()).toBe(INERT_BRAND_WEBSITE);
  });

  it('an absent website is undefined and is never coerced to an empty string', () => {
    const absent = new Brand();
    const explicitUndefined = new Brand({ brandWebsite: undefined });
    const blank = new Brand({ brandWebsite: '' });

    expect(absent.getBrandWebsite()).toBeUndefined();
    expect(explicitUndefined.getBrandWebsite()).toBeUndefined();
    expect(blank.getBrandWebsite()).toBe('');
    expect(blank.getBrandWebsite()).not.toBeUndefined();
  });

  it('a value that is not a URL at all is stored and returned unchanged', () => {
    const subject = new Brand({ brandWebsite: 'not a url at all' });

    expect(subject.getBrandWebsite()).toBe('not a url at all');
  });

  it('publishes no URL parsing, formatting or fetching member of any kind', () => {
    for (const absent of [
      'getBrandWebsiteURL',
      'getFormattedBrandWebsite',
      'formatBrandWebsite',
      'validateBrandWebsite',
      'normalizeBrandWebsite',
      'fetchBrandWebsite',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });
});

/**
 * `model/validation/Brand.json` transcribed verbatim from the 8-line source.
 *
 * The file has no `"method"` entry, so Brand contributes no declaratively invoked validator -
 * unlike the five that do exist elsewhere in the folder.
 */
const BRAND_VALIDATION_SCHEMA = {
  brandName: [{ contexts: 'save', required: true }],
  brandWebsite: [{ contexts: 'save', dataType: 'url' }],
  urlTitle: [{ contexts: 'save', required: true, unique: true }],
  products: [{ contexts: 'delete', maxCollection: 0 }],
  physicalCounts: [{ contexts: 'delete', maxCollection: 0 }],
} as const;

describe('NET-NEW: the save-context requirements and the delete gate', () => {
  it('declares exactly five property rules, in source order', () => {
    expect(Object.keys(BRAND_VALIDATION_SCHEMA)).toEqual([
      'brandName',
      'brandWebsite',
      'urlTitle',
      'products',
      'physicalCounts',
    ]);
  });

  it('brandName and urlTitle are the two save-context requirements', () => {
    expect(BRAND_VALIDATION_SCHEMA.brandName[0].contexts).toBe('save');
    expect(BRAND_VALIDATION_SCHEMA.brandName[0].required).toBe(true);
    expect(BRAND_VALIDATION_SCHEMA.urlTitle[0].contexts).toBe('save');
    expect(BRAND_VALIDATION_SCHEMA.urlTitle[0].required).toBe(true);

    const bare = new Brand();

    expect(bare.getBrandName()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();
  });

  it('urlTitle carries the uniqueness contract, which is a database and service concern', () => {
    // CFML parity [model/entity/Brand.cfc:L55]: `unique="true"` on the property and
    // `"unique":true` in the save context are the same fact stated twice.
    expect(BRAND_VALIDATION_SCHEMA.urlTitle[0].unique).toBe(true);
    expect(prototypeMembers()).not.toContain('hasUniqueUrlTitle');
    expect(prototypeMembers()).not.toContain('hasUniqueOrNullUrlTitle');

    const first = new Brand({ brandID: 'brand-1', urlTitle: 'acme' });
    const second = new Brand({ brandID: 'brand-2', urlTitle: 'acme' });

    expect(first.getUrlTitle()).toBe(second.getUrlTitle());
    expect(first.getBrandID()).not.toBe(second.getBrandID());
  });

  it('brandWebsite carries a save-context dataType, enforced at the service tier', () => {
    expect(BRAND_VALIDATION_SCHEMA.brandWebsite[0].contexts).toBe('save');
    expect(BRAND_VALIDATION_SCHEMA.brandWebsite[0].dataType).toBe('url');
    expect(new Brand({ brandWebsite: 'not a url at all' }).getBrandWebsite()).toBe(
      'not a url at all',
    );
  });

  it('the products delete gate is maxCollection 0 - EMPTY passes, NON-EMPTY blocks', () => {
    expect(BRAND_VALIDATION_SCHEMA.products[0].contexts).toBe('delete');
    expect(BRAND_VALIDATION_SCHEMA.products[0].maxCollection).toBe(0);

    const deletable = new Brand({ brandID: 'brand-1', products: [] });

    expect(deletable.getProducts()).toHaveLength(0);
    expect(deletable.getProducts().length).toBeLessThanOrEqual(
      BRAND_VALIDATION_SCHEMA.products[0].maxCollection,
    );

    const blocked = new Brand({
      brandID: 'brand-2',
      products: [makeProductFixture({ productID: 'prod-1' })],
    });

    expect(productIDsOf(blocked.getProducts())).toEqual(['prod-1']);
    expect(blocked.getProducts().length).toBeGreaterThan(
      BRAND_VALIDATION_SCHEMA.products[0].maxCollection,
    );
  });

  it('the delete gate CANNOT be an in-memory length check, and the tension is recorded', () => {
    // A real anti-corruption tension, recorded here and deliberately not resolved by this suite.
    // So the very default [meta/tests/unit/entity/BrandTest.cfc:L58-L60] pins is what makes the
    // delete guard toothless in memory.
    const unmaterialized = new Brand({ brandID: 'brand-1' });

    expect(unmaterialized.getProducts()).toEqual([]);
    expect(unmaterialized.getProducts().length).toBeLessThanOrEqual(
      BRAND_VALIDATION_SCHEMA.products[0].maxCollection,
    );
  });
});

describe('NET-NEW: the orphaned physicalCounts delete gate', () => {
  // CFML parity
  // [model/validation/Brand.json, model/entity/Brand.cfc:L71, model/entity/Physical.cfc:L59]: the
  // delete gate keys on "physicalCounts", a property Brand does not declare -- Brand declares
  // "physicals" at L71.
  //
  // Why it went unnoticed, and the mechanism is specific to Brand.

  it('the orphaned key is present in the schema and is transcribed rather than dropped', () => {
    expect(Object.keys(BRAND_VALIDATION_SCHEMA)).toContain('physicalCounts');
    expect(BRAND_VALIDATION_SCHEMA.physicalCounts[0].contexts).toBe('delete');
    expect(BRAND_VALIDATION_SCHEMA.physicalCounts[0].maxCollection).toBe(0);
  });

  it('no physicalCounts member is invented on the entity to satisfy it', () => {
    for (const absent of [
      'getPhysicalCounts',
      'getPhysicalCount',
      'addPhysicalCount',
      'removePhysicalCount',
      'hasPhysicalCount',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });

  it('nor is the physicals collection materialized, so there is nothing to mistake for it', () => {
    expect(prototypeMembers()).not.toContain('getPhysicals');
    expect(prototypeMembers()).toContain('addPhysical');
    expect(prototypeMembers()).toContain('removePhysical');
  });

  it('this finding does not expand the six-file validation-absence inventory', () => {
    // The six in-scope artefacts with no validation file remain exactly six: Category,
    // PromotionQualifier, PromotionApplied, PromotionAccount, Product_AddOption and
    // Product_AddOptionGroup.
    const IN_SCOPE_VALIDATION_ABSENCES = [
      'Category',
      'PromotionQualifier',
      'PromotionApplied',
      'PromotionAccount',
      'Product_AddOption',
      'Product_AddOptionGroup',
    ] as const;

    expect(IN_SCOPE_VALIDATION_ABSENCES).toHaveLength(6);
    expect(IN_SCOPE_VALIDATION_ABSENCES).not.toContain('Brand');
    expect(Object.keys(BRAND_VALIDATION_SCHEMA).length).toBeGreaterThan(0);
  });
});

describe('NET-NEW: every remove* helper removes - the inversion cross-check verdict', () => {
  // CFML parity [model/entity/Brand.cfc:L118-L120]: `removePromotionRewardExclusion` delegates to
  // the far side's `removeExcludedBrand`, and [model/entity/Brand.cfc:L135-L137] does the same for
  // `removePromotionQualifierExclusion`.

  it('removePromotionRewardExclusion WITHDRAWS the exclusion - the round trip closes', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const reward = new PromotionRewardLinkDouble();

    subject.addPromotionRewardExclusion(reward);
    expect(reward.excludedBrandIDs()).toEqual(['brand-1']);

    subject.removePromotionRewardExclusion(reward);
    expect(reward.excludedBrandIDs()).toEqual([]);

    expect(reward.calls).toEqual(['addExcludedBrand', 'removeExcludedBrand']);
  });

  it('removePromotionQualifierExclusion WITHDRAWS the exclusion - the round trip closes', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const qualifier = new PromotionQualifierLinkDouble();

    subject.addPromotionQualifierExclusion(qualifier);
    expect(qualifier.excludedBrandIDs()).toEqual(['brand-1']);

    subject.removePromotionQualifierExclusion(qualifier);
    expect(qualifier.excludedBrandIDs()).toEqual([]);

    expect(qualifier.calls).toEqual(['addExcludedBrand', 'removeExcludedBrand']);
  });

  it('a remove* on a never-linked pair leaves the far side empty - it CREATES nothing', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const reward = new PromotionRewardLinkDouble();
    const qualifier = new PromotionQualifierLinkDouble();

    subject.removePromotionRewardExclusion(reward);
    subject.removePromotionQualifierExclusion(qualifier);

    expect(reward.excludedBrandIDs()).toEqual([]);
    expect(qualifier.excludedBrandIDs()).toEqual([]);
    expect(reward.calls).toEqual(['removeExcludedBrand']);
    expect(qualifier.calls).toEqual(['removeExcludedBrand']);
  });

  it('inclusion and exclusion are independent link tables and never bleed into each other', () => {
    // CFML parity [model/entity/Brand.cfc:L66-L67]: `promotionRewards` maps to
    // `SwPromoRewardBrand` and `promotionRewardExclusions` to `SwPromoRewardExclBrand`.
    const subject = new Brand({ brandID: 'brand-1' });
    const reward = new PromotionRewardLinkDouble();

    subject.addPromotionReward(reward);
    expect(reward.includedBrandIDs()).toEqual(['brand-1']);
    expect(reward.excludedBrandIDs()).toEqual([]);

    subject.addPromotionRewardExclusion(reward);
    expect(reward.includedBrandIDs()).toEqual(['brand-1']);
    expect(reward.excludedBrandIDs()).toEqual(['brand-1']);

    subject.removePromotionRewardExclusion(reward);
    expect(reward.includedBrandIDs()).toEqual(['brand-1']);
    expect(reward.excludedBrandIDs()).toEqual([]);

    subject.removePromotionReward(reward);
    expect(reward.includedBrandIDs()).toEqual([]);
  });

  it('the qualifier pair behaves identically across its own two tables', () => {
    // CFML parity [model/entity/Brand.cfc:L68-L69]: `SwPromoQualBrand` and `SwPromoQualExclBrand`.
    const subject = new Brand({ brandID: 'brand-1' });
    const qualifier = new PromotionQualifierLinkDouble();

    subject.addPromotionQualifier(qualifier);
    subject.addPromotionQualifierExclusion(qualifier);

    expect(qualifier.includedBrandIDs()).toEqual(['brand-1']);
    expect(qualifier.excludedBrandIDs()).toEqual(['brand-1']);

    subject.removePromotionQualifier(qualifier);

    expect(qualifier.includedBrandIDs()).toEqual([]);
    expect(qualifier.excludedBrandIDs()).toEqual(['brand-1']);
  });

  it('membership is compared by brandID alone - never by identity, never by deep equality', () => {
    // Hibernate's collection-contains rested on SESSION IDENTITY, which for a persistent row is
    // the primary key.
    const original = new Brand({ brandID: 'brand-1', brandName: 'Acme' });
    const rehydratedSameRow = new Brand({ brandID: 'brand-1', brandName: 'Acme Renamed' });
    const differentRowSameData = new Brand({ brandID: 'brand-2', brandName: 'Acme' });
    const reward = new PromotionRewardLinkDouble();

    reward.addBrand(original);
    reward.addBrand(rehydratedSameRow);
    expect(reward.includedBrandIDs()).toEqual(['brand-1']);

    reward.addBrand(differentRowSameData);
    expect(reward.includedBrandIDs()).toEqual(['brand-1', 'brand-2']);

    reward.removeBrand(rehydratedSameRow);
    expect(reward.includedBrandIDs()).toEqual(['brand-2']);
  });
});

describe('NET-NEW: the six many-to-many-inverse link tables, preserved verbatim', () => {
  /**
   * The six `linktable` values live at [model/entity/Brand.cfc:L66-L71], and the requirement is
   * that every abbreviation survives: `Promo` is not `Promotion`, `Qual` is not `Qualifier`,
   * `Excl` is not `Exclusion`.
   *
   * What this block does assert is the part that lives on this class: which collections the entity
   * materializes, and which it deliberately does not.
   */

  it('materializes four of the six collections and, correctly, not the other two', () => {
    // CFML parity [model/entity/Brand.cfc:L70-L71]: `vendors` and `physicals` point at
    // `model/entity/Vendor.cfc` and `model/entity/Physical.cfc`, both out of SCOPE and both absent
    // from the entity budget.
    const subject = new Brand({ brandID: 'brand-1' });

    expect(subject.getPromotionRewards()).toEqual([]);
    expect(subject.getPromotionRewardExclusions()).toEqual([]);
    expect(subject.getPromotionQualifiers()).toEqual([]);
    expect(subject.getPromotionQualifierExclusions()).toEqual([]);

    expect(prototypeMembers()).not.toContain('getVendors');
    expect(prototypeMembers()).not.toContain('getPhysicals');
    expect(prototypeMembers()).not.toContain('getVendorIDs');
    expect(prototypeMembers()).not.toContain('getPhysicalIDs');
  });

  it('the two metadata asymmetries are annotated and NEITHER is normalised', () => {
    // CFML parity [model/entity/Brand.cfc:L60-L71]: two declaration inconsistencies run across
    // this block, both cosmetic in CFML because the engine treats the collections identically, and
    // both recorded rather than silently regularised.
    const subject = new Brand({ brandID: 'brand-1' });

    expect(Array.isArray(subject.getPromotionRewards())).toBe(true);
    expect(Array.isArray(subject.getPromotionRewardExclusions())).toBe(true);
    expect(Array.isArray(subject.getPromotionQualifiers())).toBe(true);
    expect(Array.isArray(subject.getPromotionQualifierExclusions())).toBe(true);

    expect(prototypeMembers().filter((member: string) => member.startsWith('set'))).toEqual([]);
  });
});

describe('NET-NEW: addProduct and removeProduct delegate to the owning side', () => {
  // CFML parity [model/entity/Brand.cfc:L98-L103]: addProduct uses lowercase `arguments.product`
  // (L99) while removeProduct uses capitalized `arguments.Product` (L102).
  //
  // The hazard is real for a porter: had the two spellings been read as two different arguments,
  // `removeProduct` would have been ported against an undefined value.

  it('addProduct calls setBrand on the far side and nothing else', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const product = new ProductLinkDouble();

    subject.addProduct(product);

    expect(product.calls).toEqual(['setBrand']);
    expect(product.owningBrandIDs).toEqual(['brand-1']);
  });

  it('removeProduct calls removeBrand on the far side - the direction is correct', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const product = new ProductLinkDouble();

    subject.addProduct(product);
    subject.removeProduct(product);

    expect(product.calls).toEqual(['setBrand', 'removeBrand']);
    expect(product.owningBrandIDs).toEqual([]);
  });

  it("Brand's own helper body mutates nothing on the brand itself", () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const product = new ProductLinkDouble();

    subject.addProduct(product);
    expect(subject.getProducts()).toEqual([]);

    subject.removeProduct(product);
    expect(subject.getProducts()).toEqual([]);
  });

  it('getProducts() stays [] on a brand with no products - the legacy default, restated', () => {
    const bare = new Brand();
    const hydratedWithoutProducts = new Brand({ brandID: 'brand-1' });
    const hydratedWithEmpty = new Brand({ brandID: 'brand-2', products: [] });

    expect(bare.getProducts()).toEqual([]);
    expect(hydratedWithoutProducts.getProducts()).toEqual([]);
    expect(hydratedWithEmpty.getProducts()).toEqual([]);
  });
});

describe('NET-NEW: the composite behaviour through the REAL far side', () => {
  // CFML parity [model/entity/Brand.cfc:L98-L100]: `Brand.addProduct` delegates straight to
  // `arguments.product.setBrand(this)`, and the owning side [model/entity/Product.cfc:L662-L667]
  // appends into `brand.getProducts()` - so `addProduct` with a real far side mutates the brand's
  // live array rather than a copy.

  it('addProduct with a real Product appends to the brand LIVE array', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const product = makeProductFixture({ productID: 'prod-1' });

    expect(subject.getProducts()).toEqual([]);

    subject.addProduct(product);

    expect(productIDsOf(subject.getProducts())).toEqual(['prod-1']);
    expect(product.getBrand()).toBe(subject);
  });

  it('adding the SAME SAVED product twice does not duplicate it', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const product = makeProductFixture({ productID: 'prod-1' });

    subject.addProduct(product);
    subject.addProduct(product);

    expect(productIDsOf(subject.getProducts())).toEqual(['prod-1']);
  });

  it('adding the same UNSAVED product twice DOES duplicate it - the isNew() short-circuit', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const unsaved = makeProductFixture({ productID: '' });

    expect(unsaved.isNew()).toBe(true);

    subject.addProduct(unsaved);
    subject.addProduct(unsaved);

    expect(subject.getProducts()).toHaveLength(2);
    expect(productIDsOf(subject.getProducts())).toEqual(['', '']);
  });

  it('removeProduct with a real Product withdraws it and clears the near side', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const product = makeProductFixture({ productID: 'prod-1' });

    subject.addProduct(product);
    expect(productIDsOf(subject.getProducts())).toEqual(['prod-1']);

    subject.removeProduct(product);

    expect(subject.getProducts()).toEqual([]);
    expect(product.getBrand()).toBeUndefined();
  });

  it('removeProduct withdraws the FIRST element, so the 1-based/0-based trap is closed', () => {
    const first = makeProductFixture({ productID: 'prod-1' });
    const second = makeProductFixture({ productID: 'prod-2' });
    const subject = new Brand({ brandID: 'brand-1', products: [first, second] });

    subject.removeProduct(first);

    expect(productIDsOf(subject.getProducts())).toEqual(['prod-2']);
  });

  it('removing a product that was never linked is a no-op on the collection', () => {
    const held = makeProductFixture({ productID: 'prod-1' });
    const stranger = makeProductFixture({ productID: 'prod-9' });
    const subject = new Brand({ brandID: 'brand-1', products: [held] });

    subject.removeProduct(stranger);

    expect(productIDsOf(subject.getProducts())).toEqual(['prod-1']);
  });

  it('hasProduct compares by primary key, with a reference fallback for an unsaved row', () => {
    const held = makeProductFixture({ productID: 'prod-1' });
    const twinOfHeldRow = makeProductFixture({ productID: 'prod-1' });
    const otherRow = makeProductFixture({ productID: 'prod-2' });
    const subject = new Brand({ brandID: 'brand-1', products: [held] });

    expect(subject.hasProduct(held)).toBe(true);
    expect(subject.hasProduct(twinOfHeldRow)).toBe(true);
    expect(subject.hasProduct(otherRow)).toBe(false);
  });

  it('hasProduct falls back to identity for an unsaved candidate, as it must', () => {
    const heldUnsaved = makeProductFixture({ productID: '' });
    const otherUnsaved = makeProductFixture({ productID: '' });
    const subject = new Brand({ brandID: 'brand-1', products: [heldUnsaved] });

    expect(subject.hasProduct(heldUnsaved)).toBe(true);
    expect(subject.hasProduct(otherUnsaved)).toBe(false);
  });
});

describe('NET-NEW: the vendor and physical helpers are ported despite out-of-scope far sides', () => {
  // CFML parity [model/entity/Brand.cfc:L140-L153]: `addVendor`/`removeVendor` and
  // `addPhysical`/`removePhysical` are declared on this component, so they are ported in full -
  // unlike the collections they relate to.

  it('addVendor and removeVendor delegate to the far side in the correct direction', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const vendor = new VendorLinkDouble();

    subject.addVendor(vendor);
    expect(vendor.brandIDs()).toEqual(['brand-1']);

    subject.removeVendor(vendor);
    expect(vendor.brandIDs()).toEqual([]);
    expect(vendor.calls).toEqual(['addBrand', 'removeBrand']);
  });

  it('addPhysical and removePhysical delegate to the far side in the correct direction', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const physical = new PhysicalLinkDouble();

    subject.addPhysical(physical);
    expect(physical.brandIDs()).toEqual(['brand-1']);

    subject.removePhysical(physical);
    expect(physical.brandIDs()).toEqual([]);
    expect(physical.calls).toEqual(['addBrand', 'removeBrand']);
  });

  it('neither helper touches any collection on the brand', () => {
    const subject = new Brand({ brandID: 'brand-1' });
    const vendor = new VendorLinkDouble();
    const physical = new PhysicalLinkDouble();

    subject.addVendor(vendor);
    subject.addPhysical(physical);

    expect(subject.getProducts()).toEqual([]);
    expect(subject.getPromotionRewards()).toEqual([]);
    expect(subject.getPromotionRewardExclusions()).toEqual([]);
    expect(subject.getPromotionQualifiers()).toEqual([]);
    expect(subject.getPromotionQualifierExclusions()).toEqual([]);
  });
});

describe('NET-NEW: the attributeValues EAV path and its two helpers are DROPPED', () => {
  // CFML parity [model/entity/Brand.cfc:L60, L90-L95]: the `attributeValues` one-to-many
  // declaration and its two bidirectional helpers, `addAttributeValue`/`removeAttributeValue`,
  // which delegate to `setBrand`/`removeBrand` on the far side.
  //
  // "Dropped" means these members are not authored in TypeScript.

  it('neither attributeValue helper exists, and no collection stands in for them', () => {
    expect(prototypeMembers()).not.toContain('addAttributeValue');
    expect(prototypeMembers()).not.toContain('removeAttributeValue');
    expect(prototypeMembers()).not.toContain('getAttributeValues');
    expect(prototypeMembers()).not.toContain('hasAttributeValue');
  });

  it('no attribute read path, index cache or dynamic attribute getter is invented', () => {
    for (const absent of [
      'getAttributeValue',
      'getAttributeValueByAttributeCode',
      'getAttributeByAttributeCode',
      'clearAttributeCache',
      'getAssignedAttributeSetSmartList',
      'getAttributeSets',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });

  it('exposes fourteen bidirectional helpers - sixteen legacy methods minus the two dropped', () => {
    // `addError` is EXCLUDED by NAME, not by prefix. It begins with `add` and is emphatically not
    // a bidirectional association helper - it is the error register's writer
    // [org/Hibachi/HibachiTransient.cfc:L61-L64].
    const helpers = prototypeMembers().filter(
      (member: string) =>
        member !== 'addError' && (member.startsWith('add') || member.startsWith('remove')),
    );

    expect(helpers).toHaveLength(14);
    expect(helpers).not.toContain('addAttributeValue');
    expect(helpers).not.toContain('removeAttributeValue');
  });
});

describe('NET-NEW: urlTitle is stored here and generated elsewhere', () => {
  // CFML parity [model/entity/Brand.cfc:L55]: `urlTitle` is an `ormtype="string"` declared
  // `unique="true"`.
  //
  // The `dataService` dependency at [model/service/BrandService.cfc:L51] becomes the
  // `urlTitleGenerator` port, one of the thirteen ports in the plan, and there is no fourteenth.

  it('urlTitle round-trips and is absent rather than blank when unset', () => {
    const populated = new Brand({ urlTitle: 'acme-brand' });
    const bare = new Brand();

    expect(populated.getUrlTitle()).toBe('acme-brand');
    expect(bare.getUrlTitle()).toBeUndefined();
  });

  it('getUrlTitle is the only spelling - there is no getURLTitle alias', () => {
    expect(prototypeMembers()).toContain('getUrlTitle');
    expect(prototypeMembers()).not.toContain('getURLTitle');
  });

  it('no URL-title generation lives on the entity, and no port is injected', () => {
    for (const absent of [
      'createUniqueURLTitle',
      'generateUrlTitle',
      'setUrlTitle',
      'getDataService',
      'getUrlTitleGenerator',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });

  it('declares no brand URL method, so no URL segment is hardcoded anywhere', () => {
    expect(prototypeMembers()).not.toContain('getBrandURL');
    expect(prototypeMembers()).not.toContain('getListingBrandURL');
    expect(prototypeMembers()).not.toContain('setting');
    expect(prototypeMembers()).not.toContain('getSettingsProvider');

    const subject = new Brand({ brandID: 'brand-1', urlTitle: 'acme-brand' });

    expect(subject.getUrlTitle()).toBe('acme-brand');
    expect(subject.getBrandID()).toBe('brand-1');
  });
});

describe('NET-NEW: remoteID and the four audit columns', () => {
  // The two account associations point at `model/entity/Account.cfc`, explicitly out of scope, so
  // each collapses to the opaque fk column it is backed by.

  it('remoteID is an inert correlation string with no parsing and no default', () => {
    const populated = new Brand({ remoteID: 'legacy-brand-0042' });
    const bare = new Brand();

    expect(populated.getRemoteID()).toBe('legacy-brand-0042');
    expect(bare.getRemoteID()).toBeUndefined();
  });

  it('the audit timestamps round-trip as Date and are never coerced', () => {
    const subject = new Brand({
      brandID: 'brand-1',
      createdDateTime: CREATED_INSTANT,
      modifiedDateTime: MODIFIED_INSTANT,
    });

    expect(subject.getCreatedDateTime()).toBe(CREATED_INSTANT);
    expect(subject.getModifiedDateTime()).toBe(MODIFIED_INSTANT);
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-02T12:30:45.000Z');
  });

  it('an unstamped audit column is undefined - NEVER the epoch, zero or a clock reading', () => {
    const subject = new Brand();

    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
    expect(subject.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(subject.getModifiedDateTime()).not.toEqual(new Date(0));
  });

  it('the account associations are opaque ids and no Account object is constructed', () => {
    const subject = new Brand({
      brandID: 'brand-1',
      createdByAccountID: 'acct-1',
      modifiedByAccountID: 'acct-2',
    });

    expect(subject.getCreatedByAccountID()).toBe('acct-1');
    expect(subject.getModifiedByAccountID()).toBe('acct-2');
    expect(typeof subject.getCreatedByAccountID()).toBe('string');
    expect(typeof subject.getModifiedByAccountID()).toBe('string');

    expect(prototypeMembers()).not.toContain('getCreatedByAccount');
    expect(prototypeMembers()).not.toContain('getModifiedByAccount');
  });

  it('an absent account id is undefined and not an empty string', () => {
    const subject = new Brand();

    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();
  });
});

describe('NET-NEW: Brand has NO ORM event hook and NO overridden method', () => {
  // CFML parity [model/entity/Brand.cfc:L157-L163]: the "Overridden Methods" pair at L157/L159 and
  // the "ORM Event Hooks" pair at L161/L163 are both present-but-LITERALLY EMPTY, as is the
  // "Non-Persistent Property Methods" pair at L83/L85.

  it('hosts no ORM lifecycle hook of any kind', () => {
    for (const hook of [
      'preInsert',
      'postInsert',
      'preUpdate',
      'postUpdate',
      'preDelete',
      'postDelete',
      'preLoad',
      'postLoad',
    ]) {
      expect(prototypeMembers()).not.toContain(hook);
    }
  });

  it('hosts no materialized path member, unlike PriceGroup, ProductType and Category', () => {
    for (const absent of [
      'getBrandIDPath',
      'getPriceGroupIDPath',
      'getProductTypeIDPath',
      'getCategoryIDPath',
      'updateBrandIDPath',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });

  it('hosts no memoized accessor, so no memo can be poisoned', () => {
    const subject = new Brand({ brandID: 'brand-1', brandName: 'Acme' });

    expect(subject.getBrandName()).toBe('Acme');
    expect(subject.getBrandName()).toBe('Acme');
    expect(prototypeMembers()).not.toContain('clearCache');
    expect(prototypeMembers()).not.toContain('clearAttributeCache');
  });

  it('hosts no smart list, because that is a framework query-builder artifact', () => {
    for (const absent of [
      'getBrandSmartList',
      'getProductsSmartList',
      'getPromotionRewardsSmartList',
      'getSmartList',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });
});

describe('NET-NEW: the framework dynamic-dispatch surface is documented, not reproduced', () => {
  // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: `onMissingMethod` synthesised
  // `hasUniqueOrNullXXX`, `hasUniqueXXX`, `hasAnyXXX`, `getXXXAssignedIDList`, `getXXXID`,
  // `getXXXOptions`, `getXXXOptionsSmartList`, `getXXXSmartList`, `getXXXStruct` and
  // `getXXXCount`.

  it('synthesises none of the eleven dispatcher patterns', () => {
    for (const synthesised of [
      'hasUniqueUrlTitle',
      'hasUniqueOrNullUrlTitle',
      'hasAnyProducts',
      'getProductsAssignedIDList',
      'getProductsOptions',
      'getProductsOptionsSmartList',
      'getProductsStruct',
      'getProductsCount',
      'getAttributeValue',
      'onMissingMethod',
      'getPropertyCount',
    ]) {
      expect(prototypeMembers()).not.toContain(synthesised);
    }
  });

  it('invents none of the framework members the base class would have supplied', () => {
    for (const absent of [
      'getNewFlag',
      'getPrintTemplates',
      'getEmailTemplates',
      'getClassName',
      'getEntityName',
      'getSimpleRepresentation',
      'getPrimaryIDValue',
      'getPrimaryIDPropertyName',
      'populate',
      // `validate` yes, `hasErrors` no longer - see the legacy-extended case above for the full
      // record.
      'validate',
      'setSuperUserFlag',
    ]) {
      expect(prototypeMembers()).not.toContain(absent);
    }

    expect(prototypeMembers()).toContain('isNew');
    expect(new Brand().isNew()).toBe(true);
    expect(new Brand({ brandID: 'brand-1' }).isNew()).toBe(false);
  });

  it('reproduces neither the dead attribute retry nor the raw debug dump', () => {
    // CFML parity [model/entity/HibachiEntity.cfc:L180-L183]: the intermediate base class issues
    // `getService("attributeService").getAttributeByAttributeCode( arguments.attribute )` at L180
    // and then, inside a guard at L181.
    for (const absent of ['getAttributeByAttributeCode', 'logHibachi', 'writeDump']) {
      expect(prototypeMembers()).not.toContain(absent);
    }
    expect(prototypeMembers()).toContain('getErrors');
  });

  it('injects no collaborator port - Brand has ZERO legacy getService() sites', () => {
    const subject = new Brand();

    expect(subject.getBrandID()).toBe('');
    expect(subject.isNew()).toBe(true);
    expect(subject.getProducts()).toEqual([]);
    expect(subject.getActiveFlag()).toBe(false);
    expect(Brand.prototype.constructor.length).toBeLessThanOrEqual(1);
  });
});

/**
 * The 41 public members of the shipped class, in declaration order.
 *
 * Sixteen accessors, `isNew()`, five containment probes, fourteen bidirectional helpers and the
 * five-member error register.
 */
const INTENDED_PUBLIC_SURFACE = [
  'getBrandID',
  'getActiveFlag',
  'getPublishedFlag',
  'getUrlTitle',
  'getBrandName',
  'getBrandWebsite',
  'getProducts',
  'getPromotionRewards',
  'getPromotionRewardExclusions',
  'getPromotionQualifiers',
  'getPromotionQualifierExclusions',
  'getRemoteID',
  'getCreatedDateTime',
  'getCreatedByAccountID',
  'getModifiedDateTime',
  'getModifiedByAccountID',
  'isNew',
  'hasProduct',
  'hasPromotionReward',
  'hasPromotionRewardExclusion',
  'hasPromotionQualifier',
  'hasPromotionQualifierExclusion',
  'addProduct',
  'removeProduct',
  'addPromotionReward',
  'removePromotionReward',
  'addPromotionRewardExclusion',
  'removePromotionRewardExclusion',
  'addPromotionQualifier',
  'removePromotionQualifier',
  'addPromotionQualifierExclusion',
  'removePromotionQualifierExclusion',
  'addVendor',
  'removeVendor',
  'addPhysical',
  'removePhysical',

  // The error register [org/Hibachi/HibachiTransient.cfc:L30-L64]. Listed last because it is the
  // one group that is not a `Brand.cfc` member - it is inherited framework behaviour the ported
  // save contract depends on.
  'getErrors',
  'hasErrors',
  'hasError',
  'getError',
  'addError',
] as const;

const INTERNAL_PROTOTYPE_MEMBERS = ['constructor'] as const;

describe('NET-NEW: the published surface is exactly the ported CFML surface', () => {
  it('exposes every member of the intended public surface as a function', () => {
    const subject = new Brand();

    for (const member of INTENDED_PUBLIC_SURFACE) {
      expect(typeof subject[member]).toBe('function');
    }
  });

  it('exposes exactly 41 public members and not one more', () => {
    const surface = new Set<string>([...INTENDED_PUBLIC_SURFACE, ...INTERNAL_PROTOTYPE_MEMBERS]);
    const unexpected = prototypeMembers().filter((member: string) => !surface.has(member));

    expect(INTENDED_PUBLIC_SURFACE).toHaveLength(41);
    expect(unexpected).toEqual([]);
    expect(prototypeMembers()).toHaveLength(42);
  });

  it('carries the ported CFML member names, with acronym casing normalised', () => {
    expect(prototypeMembers()).toContain('getUrlTitle');
    expect(prototypeMembers()).toContain('addPromotionQualifierExclusion');
    expect(prototypeMembers()).toContain('removePromotionQualifierExclusion');
    expect(prototypeMembers()).not.toContain('products');
    expect(prototypeMembers()).not.toContain('urlTitle');
  });

  it('splits the surface exactly 16 / 1 / 5 / 14 / 5', () => {
    // The register is partitioned out first, by name and not by prefix.
    const register = new Set(['getErrors', 'hasErrors', 'hasError', 'getError', 'addError']);
    const cfmlSurface = INTENDED_PUBLIC_SURFACE.filter((member: string) => !register.has(member));

    const accessors = cfmlSurface.filter((member: string) => member.startsWith('get'));
    const probes = cfmlSurface.filter((member: string) => member.startsWith('has'));
    const helpers = cfmlSurface.filter(
      (member: string) => member.startsWith('add') || member.startsWith('remove'),
    );

    expect(accessors).toHaveLength(16);
    expect(probes).toHaveLength(5);
    expect(helpers).toHaveLength(14);
    expect(INTENDED_PUBLIC_SURFACE).toContain('isNew');
    expect(accessors.length + probes.length + helpers.length + 1).toBe(36);

    // And the register accounts for exactly the remainder, so the 41 is fully attributed.
    expect(INTENDED_PUBLIC_SURFACE).toHaveLength(36 + register.size);
  });

  it('the four promotion containment probes are present, and why they are not invoked here', () => {
    const subject = new Brand({ brandID: 'brand-1' });

    expect(typeof subject.hasPromotionReward).toBe('function');
    expect(typeof subject.hasPromotionRewardExclusion).toBe('function');
    expect(typeof subject.hasPromotionQualifier).toBe('function');
    expect(typeof subject.hasPromotionQualifierExclusion).toBe('function');

    expect(Brand.prototype.hasPromotionReward.length).toBe(1);
    expect(Brand.prototype.hasPromotionRewardExclusion.length).toBe(1);
    expect(Brand.prototype.hasPromotionQualifier.length).toBe(1);
    expect(Brand.prototype.hasPromotionQualifierExclusion.length).toBe(1);

    expect(prototypeMembers()).not.toContain('hasVendor');
    expect(prototypeMembers()).not.toContain('hasPhysical');
  });

  it('records SwBrand and hb_permission="this" as inert metadata, resolved by nothing', () => {
    // CFML parity [model/entity/Brand.cfc:L49]: the table is `SwBrand` and the entity name
    // `SlatwallBrand`, both preserved verbatim - schema continuity is binding and the property
    // metadata is the contract.
    for (const absent of ['getTableName', 'getEntityName', 'getPermission', 'getServiceName']) {
      expect(prototypeMembers()).not.toContain(absent);
    }
  });
});

// The error register, invoked directly on this entity.
//
// Review reported that "nine public methods have no invocation in any test AST".
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees
// and that the save-refusal semantics depend on: a MISS yields an empty array rather than
// undefined.

describe('Brand: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent
    // name has to be safe to iterate - `undefined` here would turn a clean validation pass into a
    // crash.
    const subject = new Brand({ brandID: 'brand-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after
    // the first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new Brand({ brandID: 'brand-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling.
    const subject = new Brand({ brandID: 'brand-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
