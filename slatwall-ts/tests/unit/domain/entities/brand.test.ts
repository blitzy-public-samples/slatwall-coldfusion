// slatwall-ts - unit suite for `src/domain/entities/brand.ts`.
//
// LEGACY-EXTENDED: carries `defaults_are_correct` forward from
// [meta/tests/unit/entity/BrandTest.cfc:L58-L60] together with the cases Brand inherits from
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc]. Every other block is labelled NET-NEW at its
// `describe`, so net-new coverage is never read as parity.
//
// Regression-case traceability: `tests/traceability/legacyTestMap.ts` routes `issue_1097`,
// `issue_1296`, `issue_1329`, `issue_1331`, `issue_1335`, `issue_1348`, `issue_1376`, `issue_1604`
// and `issue_1690` [meta/tests/unit/IssuesTest.cfc] here for the record. Not one of them names a
// brand, so none adds a case to this suite.

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
 * P6 forbids a hostname, an address, a connection string or a credential anywhere in this file, and
 * `brandWebsite` is the one column that invites one. `.invalid` is reserved by RFC 2606 precisely
 * so it can never resolve, so this literal cannot become a live reference by accident - and nothing
 * in the suite parses it in any case.
 */
const INERT_BRAND_WEBSITE = 'https://brand.example.invalid/catalog';

// ---------------------------------------------------------------------------
// Hand-written in-memory far-side doubles
//
// P3 prefers hand-written doubles over a mocking framework, and here that is also the more faithful
// choice: the assertions that matter are about DIRECTION (does `remove*` remove?) and about
// MEMBERSHIP BY PRIMARY KEY, and a recorder that maintains real key lists can express both.

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
 * Uses `!== -1`: CFML's `arrayFind` returns a 1-BASED index or 0, while `indexOf` returns a 0-BASED
 * index or -1, so carrying the legacy `> 0` test across would skip element zero.
 */
function withdraw(keys: string[], key: string): void {
  const index = keys.indexOf(key);
  if (index !== -1) {
    keys.splice(index, 1);
  }
}

/**
 * The far side of the `brandID` many-to-one, recording delegations only.
 *
 * Deliberately does NOT reproduce `Product.setBrand`'s reciprocal append. Its whole purpose is to
 * isolate what `Brand`'s OWN helper body does, which is a single outward call and nothing else. The
 * composite behaviour with the real far side is asserted separately using `makeProductFixture`.
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
 * Inclusion and exclusion are TWO DISTINCT LINK TABLES sharing one entity type, so this double
 * keeps two independent lists. A brand may be included by one reward and excluded by another, and
 * neither list implies the other.
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
 *
 * Structurally identical to {@link PromotionRewardLinkDouble} and declared separately on purpose:
 * these are different link tables owned by a different entity, and collapsing the two would erase
 * which locator a reviewer should check. The shipped module makes the same choice for the same
 * reason.
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
 * `model/entity/Vendor.cfc` is OUT OF SCOPE - the plan excludes the vendor module outright and
 * there is no `vendor.ts` in the eighteen-file entity budget - so no vendor entity is imported and
 * none is invented. The exported `VendorBrandLink` contract is the whole of what `Brand` depends
 * on, and this double implements exactly that.
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
 *
 * `model/entity/Physical.cfc` is out of scope on the same footing as Vendor. Kept separate from
 * {@link VendorLinkDouble} despite being structurally identical, because it stands for a different
 * table.
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

// === The four legacy cases - LEGACY-EXTENDED ===
//
// One `it` per legacy method, each NAMED AFTER the legacy method so the lineage is greppable, each
// citing its locator. The assertions are inlined; no shared base class is built, because the CFML
// inheritance chain is a harness detail.
//
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc] is 70 lines, opening at L49, and its four
// public test methods are:
//
//   L51-L54  validate_as_save_for_a_new_instance_doesnt_pass
//              variables.entity.validate(context="save");
//              assert(variables.entity.hasErrors());
//   L56-L58  simple_representation_exists_and_is_simple
//              assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
//   L60-L62  has_primary_id_property_name
//              assert(len(variables.entity.getPrimaryIDPropertyName()));
//   L64-L67  defaults_are_correct           <-- OVERRIDDEN by BrandTest.cfc
//              assert(variables.entity.isNew());
//              assert(!len(variables.entity.getPrimaryIDValue()));
//
// with the closing brace at L68. The range is L51-L67; any citation of L49-L68 is off by two at
// each end and is rejected in favour of the source. The third case names
// `getPrimaryIDPropertyName`, a DIFFERENT member from `getSimpleRepresentationPropertyName`; the
// two are not conflated.
//
// [meta/tests/unit/entity/BrandTest.cfc] is 64 lines: L49 extends the base, L52-L56 is a `setUp`
// calling `super.setup()` and then `getService("brandService").newBrand()`, and L58-L60 is the
// override.

describe('LEGACY-EXTENDED: the four cases Brand inherits or overrides', () => {
  // C8 LEGACY-EXTENDED [meta/tests/unit/entity/BrandTest.cfc:L58-L60]: overrides
  // SlatwallEntityTestBase.defaults_are_correct [L64-L67].
  it('defaults_are_correct - getProducts() equals [] on a freshly built brand', () => {
    // The overriding body in full, and it is one line:
    //
    //   public void function defaults_are_correct() {
    //     assertEquals(variables.entity.getProducts(), []);
    //   }
    //
    // THIS IS THE ONE HARD LEGACY CONTRACT IN THE ENTIRE FILE, and the empty ARRAY is the
    // assertion, not a falsy value and not a nullish one. `undefined` and `null` both fail it,
    // which is why the shipped accessor is typed `Product[]` rather than `Product[] | undefined`.
    //
    // WHICH EMPTY-COLLECTION SEMANTIC THIS IS, of the five this migration keeps distinct: not a
    // caller's permissive empty list, not an evaluator's restrictive one, not either of
    // `hasAnyInProperty`'s two opposite include/exclude readings and not the fulfillment three-way
    // gate, but a plain construction default carrying no qualification meaning at all - and the
    // only one of the five a legacy test asserts.
    //
    // `new Brand()` with no argument is the faithful translation of
    // `getService("brandService").newBrand()` at [meta/tests/unit/entity/BrandTest.cfc:L55]: the
    // factory supplied no data, and the shipped constructor defaults its whole parameter object to
    // `{}`.
    const subject = new Brand();

    expect(subject.getProducts()).toEqual([]);
    expect(subject.getProducts()).toHaveLength(0);
    expect(subject.getProducts()).not.toBeUndefined();
    expect(subject.getProducts()).not.toBeNull();

    // CFML parity [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]: the base body
    // asserted `isNew()` and `!len(getPrimaryIDValue())`.
  });

  it('validate_as_save_for_a_new_instance_doesnt_pass - the DISPATCHER is not portable, the REGISTER is', () => {
    // ★★★ QUOTE-THEN-REVISE. This case asserted the ABSENCE of all four members, on the reading that
    // the whole validation affordance was unportable. Half of that was right and half was a defect
    // code review recorded: `validate` IS the unportable half - metadata-driven dispatch over
    // `model/validation/*.json` through `HibachiValidationService`, replaced by the rules
    // `src/services/brandService.ts` transcribes - but the ERROR REGISTER
    // [org/Hibachi/HibachiTransient.cfc:L30-L64] is five small members with no framework behind them,
    // and `HibachiService.save` [org/Hibachi/HibachiService.cfc:L151-L167] carries a refused save's
    // rules on the entity through exactly those members. Without them `saveBrand` had no way to report
    // a refusal and threw instead, which broke the return contract of
    // [model/service/BrandService.cfc:L76].
    expect(prototypeMembers()).not.toContain('validate');
    expect(prototypeMembers()).toContain('hasErrors');
    expect(prototypeMembers()).toContain('hasError');
    expect(prototypeMembers()).toContain('getErrors');
    expect(prototypeMembers()).toContain('getError');
    expect(prototypeMembers()).toContain('addError');

    // ★ AND A BARE ENTITY CARRIES NO ERROR, which is the legacy case's actual subject: the CFML test
    // asserted that a NEW brand does not PASS validation, not that it arrives pre-flagged. Errors
    // appear only once something records them.
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
    // The legacy body, verbatim [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]:
    //
    //   assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
    //
    // CFML parity [model/entity/Brand.cfc:L157-L159]: the "Overridden Methods" banner pair is
    // LITERALLY EMPTY, L157 opening it and L159 closing it with nothing between. So Brand never
    // declared `getSimpleRepresentation()`, never declared an `hb_simpleRepresentationProperty` and
    // never overrode anything: what the legacy case observed came ENTIRELY from the framework base,
    // which is not ported. The absence is EXPLAINED rather than forced.
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

// --- NET-NEW: brandID, isNew() and the two undefaulted boolean flags --------

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
    // CFML parity [model/entity/Brand.cfc:L49]: `accessors=true` generated a getter AND a setter
    // per persistent property, and `hb_populateEnabled="false"` on the audit run and on five of the
    // six inverse collections is how the framework excluded those from mass assignment. The target
    // needs no such mechanism: every field is `readonly` and no setter is published, which closes
    // the gap uniformly - including the one the legacy left open at L70.
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

// --- NET-NEW: brandWebsite is an inert string and is never fetched ----------

describe('NET-NEW: brandWebsite is a plain string - hb_formatType="url" is a hint only', () => {
  // CFML parity [model/entity/Brand.cfc:L57]: `hb_formatType="url"` on `brandWebsite` is
  // presentation metadata that told the legacy admin how to render the value, whereas the `url`
  // dataType declared for the `save` context in [model/validation/Brand.json] is a constraint
  // enforced at the service tier. The entity applies no URL validation of its own.

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

// --- NET-NEW: model/validation/Brand.json, including its orphan -------------

/**
 * [model/validation/Brand.json] transcribed verbatim from the 8-line source.
 *
 * INERT DATA, frozen by `as const`, holding no state and mutated by nothing. It exists so the
 * schema contract is a checkable artefact in this suite rather than a claim in a comment: a
 * reviewer diffs these five entries against the file, and the assertions below then relate each
 * entry to what the ENTITY actually exposes.
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
    // CFML parity [model/entity/Brand.cfc:L55]: `unique="true"` on the property and `"unique":true`
    // in the save context are the same fact stated twice.
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
    // A REAL ANTI-CORRUPTION TENSION, recorded here and deliberately NOT resolved by this suite. So
    // the very default [meta/tests/unit/entity/BrandTest.cfc:L58-L60] pins is what makes the delete
    // guard toothless in memory. CFML parity [model/entity/Brand.cfc:L61]: `inverse="true"` means
    // `Product` owns the `brandID` FK, so the brand never writes the link.
    const unmaterialized = new Brand({ brandID: 'brand-1' });

    expect(unmaterialized.getProducts()).toEqual([]);
    expect(unmaterialized.getProducts().length).toBeLessThanOrEqual(
      BRAND_VALIDATION_SCHEMA.products[0].maxCollection,
    );
  });
});

describe('NET-NEW: the orphaned physicalCounts delete gate', () => {
  // CFML parity [model/validation/Brand.json, model/entity/Brand.cfc:L71,
  // model/entity/Physical.cfc:L59]: the delete gate keys on "physicalCounts", a property Brand does
  // not declare -- Brand declares "physicals" at L71, and physicalCounts exists only on
  // Physical.cfc:L59. An ORPHANED declaration. Documented dead; no physicalCounts member is
  // invented to satisfy it.
  //
  // Verified by census, not inferred: `name="physicalCounts"` across `model/entity/` returns
  // EXACTLY ONE hit, [model/entity/Physical.cfc:L59], a one-to-many with
  // `singularname="physicalCount"`. What Brand declares at [model/entity/Brand.cfc:L71] is
  // `physicals`, a many-to-many over `linktable="SwPhysicalBrand"` with
  // `hb_populateEnabled="false"`. Different name, fieldtype and table. The same orphan appears in
  // FIVE validation files - Brand.json, Product.json, Sku.json, ProductType.json and the
  // out-of-scope Location.json, the likely copy-paste origin since `Location` is nearest to
  // physical inventory - and Product, Sku and ProductType all declare `physicals` too, exactly as
  // Brand does.
  //
  // WHY IT WENT UNNOTICED, and the mechanism is specific to Brand. Brand is one of exactly FOUR
  // in-scope entities that declare `attributeValues`, the others being Sku, Product and
  // ProductType, and that declaration unlocks the EAV fallback at
  // [org/Hibachi/HibachiEntity.cfc:L559-L561], whose guard conjoins
  // `left(missingMethodName,3)=="get"`, `structKeyExists(variables,"getAttributeValue")` and
  // `hasProperty("attributeValues")`. A call dispatched through a nonexistent `getPhysicalCounts()`
  // does not match the `get*Count` branch at [L553-L557] either, the name ending `ounts` and not
  // `Count`, so it falls through to L559 and becomes `getAttributeValue("PhysicalCounts")`, an
  // attribute lookup returning the empty string: the gate passes vacuously instead of throwing at
  // [L565]. On the fourteen entities that do NOT declare `attributeValues` the identical rule would
  // have thrown immediately. That 4-silent / 14-throw split is the mechanism that hides this
  // orphan. In the target NEITHER path exists - no dispatcher and no EAV - so the rule is inert.

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
    // The six in-scope artefacts with NO validation file remain exactly six: Category,
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
  // `removePromotionQualifierExclusion`, so each round trip asserted below closes.

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
    // CFML parity [model/entity/Brand.cfc:L66-L67]: `promotionRewards` maps to `SwPromoRewardBrand`
    // and `promotionRewardExclusions` to `SwPromoRewardExclBrand`.
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
    // Hibernate's collection-contains rested on SESSION IDENTITY, which for a persistent row is the
    // primary key.
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
   * that EVERY ABBREVIATION SURVIVES: `Promo` is not `Promotion`, `Qual` is not `Qualifier`, `Excl`
   * is not `Exclusion`. These are physical table names in a live schema this port keeps reading and
   * writing unchanged (AAP 0.8.1), so "tidying" one would be a migration.
   *
   * That claim is NOT asserted here. Restating the six literals in this file and comparing them
   * with themselves would prove only that a test-owned array holds what it was written to hold - it
   * cannot notice a target module misspelling a table. The contract is checked where the shipped
   * text can actually be read: tests/traceability/legacyTestMap.ts, block A20, derives all 53
   * in-scope `linktable` declarations from the frozen legacy entities and holds `src/` to them,
   * including the four of Brand's six that reach real SQL and the two that stay commentary.
   *
   * What this block does assert is the part that lives on THIS class: which collections the entity
   * materializes, and which it deliberately does not.
   */

  it('materializes four of the six collections and, correctly, not the other two', () => {
    // CFML parity [model/entity/Brand.cfc:L70-L71]: `vendors` and `physicals` point at
    // `model/entity/Vendor.cfc` and `model/entity/Physical.cfc`, both OUT OF SCOPE and both absent
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
    // CFML parity [model/entity/Brand.cfc:L60-L71]: two declaration inconsistencies run across this
    // block, both cosmetic in CFML because the engine treats the collections identically, and both
    // recorded rather than silently regularised. `type="array"` is PRESENT on L60, L61, L67, L69
    // and L71 and OMITTED on L66 promotionRewards, L68 promotionQualifiers and L70 vendors, so both
    // `*Exclusions` carry it and neither non-exclusion twin does - copy-paste drift rather than
    // intent. And `hb_populateEnabled="false"` is present on L66, L67, L68, L69 and L71 but ABSENT
    // on L70 `vendors`, the single inverse collection the legacy left open to mass assignment.
    //
    // Neither has any expression in the target: all four materialized collections are modelled
    // uniformly, and since every field is `readonly` with no setter published, the L70 gap cannot
    // be exercised through this class at all.
    // The line numbers above are the record of what the legacy declares; they are NOT restated as
    // arrays and compared with themselves, because that would assert only that this file can hold
    // its own literals. What is checkable from here is the target's side of the claim: all four
    // materialized collections behave identically, and the L70 mass-assignment gap has nowhere to
    // exist because NO setter is published at all.
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
  // (L99) while removeProduct uses capitalized `arguments.Product` (L102). CFML scope keys are
  // case-insensitive, so both resolve; the target normalises to ONE binding without changing
  // behaviour.
  //
  // The one line that carries the wart, verbatim:
  //
  //   L102     arguments.Product.removeBrand(this);      <-- CAPITAL P
  //
  // The parameter is declared `product` in lower case on BOTH L098 and L101; only the BODY of
  // `removeProduct` capitalises it. CFML's `arguments` scope is a case-insensitive struct, so both
  // spellings resolve to the same single argument and there is NO behavioural consequence.
  // TypeScript has one parameter identifier, so the wart has nowhere to exist in the target, which
  // is why this is a parity note rather than a defect.
  //
  // The hazard is real for a porter: had the two spellings been read as two different arguments,
  // `removeProduct` would have been ported against an undefined value. `noUnusedLocals` was NOT
  // weakened to accommodate it.

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
  // The reciprocal bookkeeping lives on the owning side: `src/domain/entities/product.ts`
  // reproduces [model/entity/Product.cfc:L662-L667], whose guard `isNew() or
  // !brand.hasProduct(this)` appends the product into `brand.getProducts()`. So `addProduct` with a
  // REAL `Product` DOES change `getProducts()`, which is why the accessor hands back a live
  // `Product[]`; the recording double used in the block above observes the outward delegation only.

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
  // `addPhysical`/`removePhysical` are declared on THIS component, so they are ported in full -
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
  // The whole EAV read path is out of scope, so the collection is not materialized and both helpers
  // are DROPPED, which is why the sixteen legacy methods become fourteen in the target.
  //
  // "Dropped" means these members are not authored in TypeScript. It does NOT mean anything was
  // removed from the legacy tree: [model/entity/Brand.cfc] is REFERENCE ONLY, remains byte-for-byte
  // unchanged, and the CFML monolith keeps running with the EAV subsystem intact.
  //
  // The L60 `cascade="all-delete-orphan"` is an obligation an entity cannot honour in this
  // architecture, because deletion is an explicit repository operation. It belongs to the
  // repository tier and is not simulated here.

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
    // ★ `addError` IS EXCLUDED BY NAME, not by prefix. It begins with `add` and is emphatically not a
    // bidirectional association helper - it is the error register's writer
    // [org/Hibachi/HibachiTransient.cfc:L61-L64]. Filtering on the prefix alone would have counted it
    // as a fifteenth helper and made this case a statement about spelling rather than about
    // associations.
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
  // The value is what [model/service/BrandService.cfc:L67-L77] feeds through the URL-title
  // generator. That is the ONLY method the legacy service declares, everything else having been
  // inherited from the framework base, and it generates only when BOTH the entity's own title and
  // any incoming `data.urlTitle` are absent or empty:
  //
  //   getDataService().createUniqueURLTitle(titleString=..., tableName="SwBrand");
  //
  // The `dataService` dependency at [model/service/BrandService.cfc:L51] becomes the
  // `urlTitleGenerator` port, one of the thirteen ports in the plan, and there is no fourteenth.
  // Generation is a SERVICE concern: it needs a uniqueness query against `SwBrand`, which an entity
  // cannot issue.
  //
  // A CASING HAZARD WORTH NAMING. [model/service/BrandService.cfc:L68] reads the value back as
  // `arguments.brand.getURLTitle()` with a capital `URL` while the property is spelled `urlTitle`.
  // CFML method names are case-insensitive so both resolve to one generated accessor; TypeScript is
  // not, so exactly one spelling can exist. The shipped accessor is `getUrlTitle()`, matching the
  // property, and NO alias is added.

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

// --- NET-NEW: structural facts, and the framework surface not ported --------

describe('NET-NEW: remoteID and the four audit columns', () => {
  // CFML parity [model/entity/Brand.cfc:L74, L77-L80]:
  //
  //   L74  property name="remoteID" ormtype="string";
  //   L77  property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";
  //   L78  property name="createdByAccount" hb_populateEnabled="false" cfc="Account"
  //        fieldtype="many-to-one" fkcolumn="createdByAccountID";
  //   L79  property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";
  //   L80  property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
  //        fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
  //
  // The two account associations point at `model/entity/Account.cfc`, explicitly out of scope, so
  // each collapses to the OPAQUE FK COLUMN it is backed by. That collapse is legitimate here
  // precisely because these ARE real columns on `SwBrand` - contrast `vendors`/`physicals`, whose
  // keys live in link tables and for which an id member would have invented a column.

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
  // the "ORM Event Hooks" pair at L161/L163 are BOTH present-but-LITERALLY EMPTY, as is the
  // "Non-Persistent Property Methods" pair at L83/L85. Only the "Bidirectional Helper Methods" pair
  // at L87/L155 contains anything, and the component closes at L164.
  //
  // NEVER NORMALISE A BANNER: an empty banner implies nothing on its own and is not evidence that a
  // member was dropped. Two consequences are real and assertable. No materialized-path maintenance,
  // so a repository has nothing to invoke on save - contrast
  // [model/entity/PriceGroup.cfc:L206-L214] and [model/entity/ProductType.cfc:L305-L313], which
  // assign their path BEFORE calling `super`, and [model/entity/Category.cfc:L126-L134], which
  // calls `super` FIRST and assigns SECOND; those three are CITED, not re-tested. And no memoized
  // accessor, hence none of the memo defects that afflict `Sku` and `Product`.

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
  // `getXXXOptions`, `getXXXOptionsSmartList`, `getXXXSmartList`, `getXXXStruct` and `getXXXCount`,
  // and THREW at [L565] for anything it could not match. Because it declares `attributeValues` at
  // [model/entity/Brand.cfc:L60] - as do Sku [L70], Product [L75] and ProductType [L67], and no
  // other in-scope entity - an unmatched `get...` on a Brand did NOT throw. It fell through to the
  // EAV branch at [L559-L561] and became `getAttributeValue(...)`, returning the empty string. The
  // other fourteen in-scope entities threw at [L565] instead.

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
      // `validate` YES, `hasErrors` NO LONGER - see the LEGACY-EXTENDED case above for the full
      // record. The dispatcher is not ported; the five-member error register it wrote into is,
      // because `HibachiService.save` [org/Hibachi/HibachiService.cfc:L151-L167] delivers a refused
      // save through it and `saveBrand` inherits that contract.
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
    // and then, inside a guard at L181, issues the IDENTICAL call with the IDENTICAL argument at
    // L182. CFML parity [org/Hibachi/HibachiEntity.cfc:L605]: the base class calls
    // `writeDump(getErrors())` on a failed ORM flush, writing raw entity state to the response.
    for (const absent of ['getAttributeByAttributeCode', 'logHibachi', 'writeDump']) {
      expect(prototypeMembers()).not.toContain(absent);
    }

    // ★ `getErrors` USED TO BE IN THAT LIST, AND IT NO LONGER BELONGS THERE. What this case is about
    // is the DEBUG DUMP - `writeDump(getErrors())` [org/Hibachi/HibachiEntity.cfc:L605] writing raw
    // entity state into the HTTP response - not about the register the dump happened to read. The
    // register is ported [org/Hibachi/HibachiTransient.cfc:L30-L32]; the dump is not, and the
    // distinction is asserted rather than blurred.
    expect(prototypeMembers()).toContain('getErrors');
  });

  it('injects no collaborator port - Brand has ZERO legacy getService() sites', () => {
    // Verified by census: a search for `getService(` across [model/entity/Brand.cfc] returns ZERO
    // hits, so this entity never reached a service locator and there is nothing to convert into a
    // constructor port.
    const subject = new Brand();

    expect(subject.getBrandID()).toBe('');
    expect(subject.isNew()).toBe(true);
    expect(subject.getProducts()).toEqual([]);
    expect(subject.getActiveFlag()).toBe(false);
    expect(Brand.prototype.constructor.length).toBeLessThanOrEqual(1);
  });
});

// --- NET-NEW: the published surface is exactly the ported CFML surface ------

/**
 * The 41 public members of the shipped class, in declaration order.
 *
 * Sixteen accessors, `isNew()`, five containment probes, fourteen bidirectional helpers and the
 * five-member error register. These are the ported CFML member names with ACRONYM CASING NORMALISED to
 * the property spelling, not verbatim spellings: the legacy code calls `getURLTitle()`
 * [model/service/BrandService.cfc:L68] whereas this class exposes `getUrlTitle()`. CFML method names
 * are case-insensitive, so both forms resolved to one generated accessor there; TypeScript is
 * case-sensitive, so exactly one spelling can exist here.
 *
 * ★★ THE FIVE-MEMBER REGISTER WAS ADDED IN ONE REVISION AND THE REASON IS RECORDED HERE. This surface
 * used to be 36, and the five absences were asserted deliberately - the LEGACY-EXTENDED case above
 * carries the full argument. Briefly: `HibachiService.save`
 * [org/Hibachi/HibachiService.cfc:L151-L167] delivers a refused save by leaving its rules ON THE
 * ENTITY, skipping the flush and returning that same entity, and `saveBrand`
 * [model/service/BrandService.cfc:L76] inherits exactly that. With no register the ported service
 * had nowhere to put a refusal and threw instead, which is the divergence code review recorded. The
 * five are [org/Hibachi/HibachiTransient.cfc:L30-L64] verbatim; the `validate` DISPATCHER that wrote
 * into them is still not ported.
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

  // The error register [org/Hibachi/HibachiTransient.cfc:L30-L64]. Listed last because it is the one
  // group that is NOT a `Brand.cfc` member - it is inherited framework behaviour the ported save
  // contract depends on.
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
    // ★ THE REGISTER IS PARTITIONED OUT FIRST, BY NAME AND NOT BY PREFIX. Its five members would
    // otherwise scatter across all three prefix groups - `getErrors`/`getError` read as accessors,
    // `hasErrors`/`hasError` as containment probes and `addError` as a bidirectional helper - which
    // would make every count below a statement about spelling rather than about the CFML surface.
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
    // metadata IS the contract. `hb_permission="this"` is the literal four-character string `this`,
    // NOT a resolved path; the same literal appears at [model/entity/Category.cfc:L49].
    //
    // `SwBrand` and `SlatwallBrand` are NOT restated here as local constants and compared with
    // themselves; tests/traceability/legacyTestMap.ts block A20 derives both from the frozen
    // `table=` / `entityname=` attributes and holds the shipped source to them, for all 18
    // entities. `hb_permission` and `hb_serviceName` have no target expression at all, which is
    // itself the assertion below: not one of the four metadata accessors is published.
    for (const absent of ['getTableName', 'getEntityName', 'getPermission', 'getServiceName']) {
      expect(prototypeMembers()).not.toContain(absent);
    }
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

describe('Brand: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent name
    // has to be safe to iterate - `undefined` here would turn a clean validation pass into a crash.
    const subject = new Brand({ brandID: 'brand-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after the
    // first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new Brand({ brandID: 'brand-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling, so the published key is the one the first write used.
    const subject = new Brand({ brandID: 'brand-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
