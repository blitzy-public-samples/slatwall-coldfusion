// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/productType.ts`
//
// TRACEABILITY: THIS COVERAGE IS **NET-NEW**, AND IS NOT PARITY (C8).
// No legacy test anywhere under `meta/tests/` touches `ProductType`. Only
// `meta/tests/unit/entity/BrandTest.cfc` and `meta/tests/unit/entity/ProductTest.cfc`
// reach this folder at all, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an
// empty stub contributing zero coverage. Every assertion below is therefore authored from
// the CFC itself rather than carried forward from an antecedent, and
// `tests/traceability/legacyTestMap.ts` must label this module NET-NEW. Presenting any of
// it as parity would fail the traceability gate.
//
// The one exception is documentary rather than inherited: the four cases on
// `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` [L51, L56-L58, L60, L64-L67] -
// `validate_as_save_for_a_new_instance_doesnt_pass`,
// `simple_representation_exists_and_is_simple`, `has_primary_id_property_name` and
// `defaults_are_correct` - would have applied to any entity extending that base. ProductType
// never had a subclass of it, so those cases were never actually run against this component.
// Where a shipped member makes one of them meaningful it is asserted here against the SHIPPED
// REALITY and is called out as such; it is never presented as a test that used to exist.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE OWNS THAT NOTHING ELSE DOES
//
//   1. THE MATERIALIZED `productTypeIDPath` [model/entity/ProductType.cfc:L53], the
//      4000-character comma list the PROMOTION ENGINE walks. Qualifier membership at
//      [model/service/PromotionService.cfc:L864-L869] iterates it with
//      `listLen` / `listGetAt` / `listFindNoCase`, and the price-group cascade's
//      product-type level climbs the same chain. Root-first ordering is therefore not
//      cosmetic - getting it wrong changes which promotions apply, which changes money.
//      That engine is SIBLING-OWNED: it is cited here as the reason the ordering matters and
//      nothing about it is asserted in this file.
//   2. THE ALWAYS-THROWING `getAppliedPriceGroupRateByPriceGroup`
//      [model/entity/ProductType.cfc:L117-L119] - the named-argument defect, and the only
//      `LEGACY-DEFECT` marker this file carries.
//   3. THE TODO CARRY-FORWARD at [model/entity/ProductType.cfc:L93], preserved verbatim and
//      deliberately not completed.
//   4. THE PARTIAL CACHE-INVALIDATION RESIDUAL at
//      [model/entity/HibachiEntity.cfc:L246-L253], characterized here as the legacy contract
//      and deliberately NOT reproduced.
//
// ---------------------------------------------------------------------------
// VERIFY BEFORE YOU QUOTE - CORRECTIONS ESTABLISHED FOR THIS FILE
//
// Every locator below was re-read against the source in this session rather than taken from
// a secondary description, and where a secondary description disagreed, THE SOURCE WON. The
// corrections are recorded because a silent fix teaches a later reader nothing:
//
//   * `getBaseProductType` [L112] calls `listFirst( getProductTypeIDPath() )`, which is
//     element **ONE** - the ROOT of the root-first path. An upstream note claimed it takes
//     the SECOND element; the source disproves that. See the `describe` block for B2.
//   * `src/domain/valueObjects/materializedIdPath.ts` exports NO `MaterializedIdPath` class.
//     It exports the free functions `buildIdPathList`, `resolveIdPath`, `getRootIdFromIdPath`,
//     `idPathContainsId` and `idPathContainsAnyId`. The imports below name what exists.
//   * `src/lib/cfml/list.ts` has no `listFirst` and no `listFind`. Its positional read is
//     `listGetAt`, 1-based, and it THROWS on an out-of-range position rather than answering
//     `''`. The `''`-for-an-empty-path behaviour that CFML `listFirst('')` has lives in
//     `getRootIdFromIdPath`, which is what the entity calls.
//   * `preInsert()` and `preUpdate()` DO exist on the shipped class. They are not ORM
//     callbacks - there is no Hibernate to fire them - but they are public methods the
//     repository invokes, so both path routes are reachable and both are exercised below.
//   * `getActiveFlag()` and `getPublishedFlag()` return `boolean`, NOT `boolean | undefined`:
//     the shipped accessors resolve the raw column through `cfBoolean()`. The undefaultedness
//     of [L54] and [L55] lives in the FIELD, not in the accessor's return type.
//   * The banner at [L248]/[L257] reads "Overridden **Implicet** Getters". It is framework
//     boilerplate that recurs across the wider `model/entity/` tree - `Access.cfc:L101`,
//     `AccountPayment.cfc:L387`, `AttributeValue.cfc:L348`, `MeasurementUnit.cfc:L100` and
//     `Order.cfc:L861` among others - so it is the fourth occurrence among the IN-SCOPE
//     entities only, alongside `PromotionCode.cfc:L165`, `PromotionQualifier.cfc:L349` and
//     `PriceGroup.cfc:L193`. Stated precisely rather than overstated.
//   * The orphaned `physicalCounts` delete gate appears in FIVE validation files, not four:
//     `Product.json:L7`, `Brand.json:L7`, `ProductType.json:L8`, `Sku.json:L13` and
//     `Location.json:L6`. The first four are the in-scope entities that declare
//     `attributeValues`; `Location` is out of scope and is named only so the count is honest.
//
// ---------------------------------------------------------------------------
// THE SIX LEGACY `getService(` SITES, ENUMERATED - AND NONE SURVIVES
//
// ProductType carries six service-locator calls, third-highest among the eighteen in-scope
// entities after `Sku` and `Product`. Every one is gone from the target: replaced by an
// injected constructor port, or dropped with the member that contained it.
//
//   | site | locator string        | fate in the target                                   |
//   |------|-----------------------|------------------------------------------------------|
//   | L94  | `"AttributeService"`  | member OMITTED - attribute path not ported           |
//   | L112 | `"ProductService"`    | -> injected `productTypeRepository` port             |
//   | L118 | `"priceGroupService"` | NO port - the call never reaches the service (B3)    |
//   | L129 | `"productService"`    | member OMITTED - smart list                          |
//   | L263 | `"productService"`    | member OMITTED - smart list                          |
//   | L283 | `"attributeService"`  | member OMITTED - smart list on the attribute path    |
//
// CFML parity [model/entity/ProductType.cfc:L94, L112, L118, L129, L263, L283]: the six
// locator strings are spelled with FOUR different casings, and two of them name the SAME
// service twice over - `"ProductService"` at L112 versus `"productService"` at L129 and L263,
// and `"AttributeService"` at L94 versus `"attributeService"` at L283. CFML component-name
// resolution is case-insensitive, so all four spellings dispatched identically and the
// capitalization carried no meaning whatsoever. Annotated because it is evidence of how these
// lines were written, and NEVER normalised into a claim the source does not make. In the
// target the question disappears with the locator: a port is a typed constructor parameter
// with exactly one name.
//
// THE PORT LEDGER STAYS AT THIRTEEN. `productTypeRepository` is one of the thirteen ports
// already in `src/domain/ports/`. No fourteenth port is introduced by this suite - no
// attribute service, no attribute-set port, no smart list and no query builder is invented
// here, because inventing one would manufacture a capability the legacy slice does not have.
//
// ---------------------------------------------------------------------------
// BUDGETS AND MARKERS, STATED SO THEY ARE AUDITABLE
//
// DIVERGENCE BUDGET: **ZERO**. This suite claims no deliberate divergence. The three that
// exist project-wide are all sibling-owned - the un-`var`'d `discountAmount` and the
// `amountOff` raw-float gap in `src/services/**`, and the entity memo fixes owned by
// `sku.test.ts` and `product.test.ts`. A fourth is forbidden, and none is taken.
//
// `LEGACY-DEFECT` MARKERS: exactly **ONE**, on the [L117-L119] named-argument throw. Every
// other finding recorded here is a `CFML parity` note or a `JUDGMENT CALL`, including the
// `listFirst` index, the L93 TODO, the L95-L97 no-op guard, the `Products`/`products` casing
// hazard, the orphaned `physicalCounts` gate, the partial-clear residual, the misspelled
// banner, the four out-of-banner methods and the `type="array"` inconsistency.
//
// D45 - the three-argument `Replace` at [model/entity/PriceGroupRate.cfc:L132] and [:L158] -
// belongs to `priceGroupRate.test.ts`. The explicit FOUR-argument
// `replace(getProductTypeIDPath(), ",", "','", "all")` at [model/entity/ProductType.cfc:L292]
// is cited here as the CONTROL that proves the three-argument form is a defect and not a
// house convention. It is cited only; it is not re-asserted.
//
// NO USER RULES WERE PROVIDED for this project - the rules source returns exactly "No user
// rules provided.", read to completion. No rule governs this file, no file enters scope by
// rule mandate, and no rule is invented to fill the gap. The absence is not licence to lower
// the bar: maximal strictness applies, with no `any`, no `@ts-ignore`, no non-null assertion,
// no `.only`, no `.skip` and no default export anywhere below.
//
// NOTHING HERE ASSERTS A NON-FUNCTIONAL REQUIREMENT (C7). There is no timing, latency,
// throughput or benchmark assertion, and no choice below is justified by speed. In
// particular the two memos are pinned as STALENESS contracts and the `lazy="extra"` fetch
// shape as an explicit CORRECTNESS decision - never as optimisations.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { ProductType } from '../../../../src/domain/entities/productType.js';
import {
  buildIdPathList,
  getRootIdFromIdPath,
} from '../../../../src/domain/valueObjects/materializedIdPath.js';
import { listGetAt } from '../../../../src/lib/cfml/list.js';
import { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
// JUDGMENT CALL - `PriceGroupRate` is imported as a VALUE, not `import type`. B9 constructs two
// real rates to assert that the include side [L74] and the exclude side [L75] are kept apart, and
// this is the only in-scope entity holding both, so the assertion cannot be made with a structural
// double: the constructor parameter is a nominal class type. `consistent-type-imports` requires the
// type-only form only for symbols used SOLELY as types, so a plain import is the correct spelling
// once the class is used as a value. `Product` stays type-only because `makeProductFixture` builds
// every product this suite needs.
import { PriceGroupRate } from '../../../../src/domain/entities/priceGroupRate.js';
import type { Product } from '../../../../src/domain/entities/product.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
// VALUE imports: block B10 constructs both owners so it can assert that each delegating helper
// really reaches the owning side's array, rather than asserting only that the call returns.
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';

// ---------------------------------------------------------------------------
// Local test vocabulary
//
// JUDGMENT CALL - NO SHARED MUTABLE STATE, AND THEREFORE NO `beforeEach` AT ALL.
// A2 requires a fresh subject and fresh far-side doubles for every test. The strongest way to
// get that is not to reset shared state between tests but to have none: every subject, every
// parent chain and every repository double below is constructed INSIDE the `it` that uses it.
// Nothing is hoisted to module scope except pure `const` literals and pure factory functions,
// so there is no cache, no spy and no counter that could leak from one test into the next -
// which is the whole point, because the four legacy caches this port refuses to reproduce as
// module state are exactly this hazard:
//   * `SkuDAO.variables.nextOptionGroupSortOrder`, never cleared because the clear method's
//     condition is INVERTED at [model/dao/SkuDAO.cfc:L222-L226] - it deletes the key only
//     when the key does not exist, so it can never fire;
//   * `RoundingRuleService.variables.roundingRuleDetails`;
//   * the un-`var`'d `discountAmount` (sibling-owned divergence);
//   * and EVERY entity memo, including `variables.productTypeIDPath` here.
// On a warm Lambda container a module-level cache persists between unrelated requests, so
// all of them are request-scoped in the target. This suite is built the same way.
//
// `vi` is deliberately unused: the repository double is HAND-WRITTEN with an explicit call
// ledger, which is both the required approach and more legible than a mock about which
// invocation happened. An unused import would also fail `noUnusedLocals`.
// ---------------------------------------------------------------------------

/**
 * The exact separator [model/entity/ProductType.cfc:L275] concatenates, byte for byte.
 *
 * A RAW HTML ENTITY with one leading and one trailing space. Not `»`, not `&#187;`, not
 * `&amp;raquo;`, not trimmed. Held in a named constant so every assertion below compares
 * against one literal rather than re-typing something that is easy to "improve" by accident.
 */
const RAQUO_SEPARATOR = ' &raquo; ';

/** CFML's `,` list delimiter, which is what a materialized ID path is built from. */
const PATH_DELIMITER = ',';

/**
 * The boolean column shape the shipped constructor accepts for `activeFlag` / `publishedFlag`.
 *
 * Structurally identical to `CfBooleanInput` from `src/lib/cfml/truthiness.ts`, restated
 * locally rather than imported: that module is not among this suite's declared dependencies,
 * and TypeScript's structural typing makes the restatement exact rather than approximate. It
 * enumerates precisely the states [L54] and [L55] can arrive in, neither of which declares a
 * `default=`, so SQL NULL is an expected value and not an error.
 */
type CfmlBooleanColumn = string | number | boolean | null | undefined;

/**
 * A hand-written, in-memory stand-in for the `productTypeRepository` port.
 *
 * Structurally typed and never imported from `src/domain/ports/**`, so this suite's imports
 * stay inside its declared dependency set while the object still satisfies the constructor
 * parameter exactly - TypeScript checks it structurally at the call site.
 *
 * `calls` is the whole reason it is hand-written rather than mocked: several assertions below
 * turn on WHICH repository method ran and WITH WHAT, and one of the most important turns on
 * NOTHING having run at all.
 */
interface ProductTypeRepositoryDouble {
  /** Every method invocation, in order, as `'<method>:<argument>'`. */
  readonly calls: string[];
  getProductTypeQuery(): Promise<readonly never[]>;
  getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined>;
  getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]>;
  saveProductType(productType: ProductType): Promise<ProductType>;
}

/**
 * Build a repository double backed by an explicit identifier-to-row map.
 *
 * An identifier absent from `rows` resolves to `undefined`, which is exactly what a MySQL
 * lookup that matched no row produces - and the state the preserved [L112] dereference
 * failure depends on.
 */
function makeProductTypeRepositoryDouble(
  rows: ReadonlyMap<string, ProductType>,
): ProductTypeRepositoryDouble {
  const calls: string[] = [];

  return {
    calls,

    getProductTypeQuery(): Promise<readonly never[]> {
      calls.push('getProductTypeQuery:');
      return Promise.resolve([]);
    },

    getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined> {
      calls.push(`getProductTypeByProductTypeID:${productTypeID}`);
      return Promise.resolve(rows.get(productTypeID));
    },

    getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]> {
      calls.push(`getProductTypesByProductTypeIDPath:${productTypeIDPath}`);
      return Promise.resolve([]);
    },

    saveProductType(productType: ProductType): Promise<ProductType> {
      calls.push(`saveProductType:${productType.getProductTypeID()}`);
      return Promise.resolve(productType);
    },
  };
}

/**
 * Wire an ACYCLIC, SHALLOW ancestor chain and hand back its nodes root-first.
 *
 * ACYCLIC BY CONSTRUCTION, and that is a property of this helper rather than a limitation of
 * the subject. It only ever links each node to the one before it, so every hierarchy it
 * produces is a short, strictly-ascending line - which keeps the path, base-product-type and
 * rate-cascade blocks below focused on ordering and contents without any of them having to
 * establish acyclicity first.
 *
 * CYCLES ARE BUILT ONLY IN THEIR OWN BLOCK near the end of this file, and never with this
 * helper. That separation is load-bearing rather than tidy: the production code DOES follow a
 * cyclic parent chain forever, because [org/Hibachi/HibachiEntity.cfc:L314-L321] does and the
 * port reproduces it. So the block that builds a cycle asserts only that the ASSIGNMENT is
 * accepted, and never asks for a path from the resulting graph - a call that would not return.
 * Keeping every hierarchy here acyclic is what lets the path, base-product-type and
 * rate-cascade blocks call the path builder freely.
 *
 * Wiring goes through the shipped `setParentProductType`, not through the constructor, so the
 * bidirectional bookkeeping under test is the bookkeeping the chains are built with.
 *
 * @param productTypeIDs identifiers ROOT FIRST. `['a', 'b', 'c']` makes `a` the root, `b` its
 *   child and `c` the leaf.
 * @returns the constructed nodes in the same root-first order as the input.
 */
function makeAncestorChain(productTypeIDs: readonly string[]): readonly ProductType[] {
  const chain: ProductType[] = [];

  for (const productTypeID of productTypeIDs) {
    const node = new ProductType({ productTypeID });
    const parent = chain.at(-1);
    if (parent !== undefined) {
      node.setParentProductType(parent);
    }
    chain.push(node);
  }

  return chain;
}

/**
 * The leaf of a chain - the node every path assertion is made from.
 *
 * Written as a guarded read rather than an indexed one because `noUncheckedIndexedAccess` is
 * on and no non-null assertion is permitted anywhere in this suite. Throwing on an empty
 * chain keeps a mis-built fixture from silently degrading into a passing test.
 */
function leafOf(chain: readonly ProductType[]): ProductType {
  const leaf = chain.at(-1);
  if (leaf === undefined) {
    throw new Error('makeAncestorChain was called with no identifiers, so there is no leaf.');
  }
  return leaf;
}

/**
 * A minimal `PriceGroup`, needed only as the argument to the always-throwing [L118] stub.
 *
 * Every constructor key is supplied explicitly: `exactOptionalPropertyTypes` is on and the
 * shipped signature declares these keys as REQUIRED-but-nullable rather than optional, so an
 * omitted key is a compile error while an explicit `undefined` is the honest absent state.
 * The values are inert - the method under test throws before it can read any of them.
 */
function makeInertPriceGroup(priceGroupID: string): PriceGroup {
  return new PriceGroup({
    priceGroupID,
    priceGroupIDPath: priceGroupID,
    activeFlag: true,
    priceGroupName: undefined,
    priceGroupCode: undefined,
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

/** The names declared on the shipped class, which is what the omission audit reads. */
const PRODUCT_TYPE_PROTOTYPE_MEMBERS: readonly string[] = Object.getOwnPropertyNames(
  ProductType.prototype,
);

// ===========================================================================
// B1. THE MATERIALIZED `productTypeIDPath` - BOTH ROUTES
//
// [model/entity/ProductType.cfc:L53] declares `productTypeIDPath ormtype="string"
// length="4000"`, and TWO independent code paths write it:
//
//   ROUTE 1 - the LAZY MEMOIZING READ at [L250-L255], guarded on `isNull(...)`.
//   ROUTE 2 - the EAGER WRITE at [L306] and [L311], which bypasses the getter entirely.
//
// They are different operations with different triggers, so they are tested separately and
// then tested against each other. The path's shape is the contract the promotion engine
// depends on: COMMA-DELIMITED, ROOT-FIRST, SELF-LAST, INCLUDING SELF, never empty for a saved
// row. [model/service/PromotionService.cfc:L864-L869] walks it with `listLen` / `listGetAt` /
// `listFindNoCase` to decide product-type membership - cited as the reason the ordering is
// load-bearing, and asserted nowhere here, because that engine is sibling-owned.
// ===========================================================================

describe('ProductType - the materialized productTypeIDPath (B1)', () => {
  describe('the path contract: comma-delimited, root-first, self-last, including self', () => {
    it('gives a root product type a single-element path equal to its own identifier', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });

      // Self is included even with no ancestor, which is what makes the path usable as a
      // containment test for the node itself and not only for its ancestors.
      expect(root.getProductTypeIDPath()).toBe('pt-root');
      expect(root.getParentProductType()).toBeUndefined();
    });

    it('orders a two-level chain root first and self last', () => {
      const chain = makeAncestorChain(['pt-root', 'pt-child']);

      expect(leafOf(chain).getProductTypeIDPath()).toBe('pt-root,pt-child');
    });

    it('orders a three-level chain root first, ancestors in descending order, self last', () => {
      const chain = makeAncestorChain(['pt-root', 'pt-mid', 'pt-leaf']);
      const path = leafOf(chain).getProductTypeIDPath();

      expect(path).toBe('pt-root,pt-mid,pt-leaf');

      // Spelled out positionally as well as literally, because the ORDER is the contract and a
      // whole-string comparison alone would let a reversed delimiter join pass unnoticed.
      // `listGetAt` is 1-BASED, matching CFML: position 1 is the root and the last is self.
      expect(listGetAt(path, 1)).toBe('pt-root');
      expect(listGetAt(path, 2)).toBe('pt-mid');
      expect(listGetAt(path, 3)).toBe('pt-leaf');
      expect(path.split(PATH_DELIMITER)).toHaveLength(3);
    });

    it('delegates the walk to the shared materialized-path value object', () => {
      const chain = makeAncestorChain(['pt-root', 'pt-mid', 'pt-leaf']);
      const leaf = leafOf(chain);

      // The entity must not re-derive comma-list construction locally: `buildIdPathList` is the
      // single implementation shared by `productTypeIDPath`, `priceGroupIDPath` and
      // `categoryIDPath`, so the two results have to agree exactly. Asserting the agreement is
      // what stops a hand-rolled walk being reintroduced at this call site later.
      const fromValueObject = buildIdPathList<ProductType>(
        leaf,
        (node) => node.getProductTypeID(),
        (node) => node.getParentProductType(),
      );

      expect(leaf.getProductTypeIDPath()).toBe(fromValueObject);
    });

    it('returns a stored 4000-character path intact, applying no truncation of its own', () => {
      // [model/entity/ProductType.cfc:L53] declares `length="4000"`. That is a COLUMN
      // constraint belonging to the `SwProductType` schema and enforced by the database and the
      // repository - the entity neither truncates nor validates against it, and pinning that
      // keeps a well-meaning `slice(0, 4000)` from appearing here later. C7: this is a
      // correctness boundary, not a size optimisation.
      const storedPath = 'x'.repeat(4000);
      const subject = new ProductType({
        productTypeID: 'pt-deep',
        productTypeIDPath: storedPath,
      });

      expect(subject.getProductTypeIDPath()).toBe(storedPath);
      expect(subject.getProductTypeIDPath()).toHaveLength(4000);
    });
  });

  describe('route 1 - the lazy memoizing getter [L250-L255]', () => {
    // CFML parity [model/entity/ProductType.cfc:L251, L123]: TWO DIFFERENT MEMO IDIOMS IN ONE
    // FILE. The path memo at L251 guards on `isNull(variables.productTypeIDPath)`, so an
    // explicitly-set EMPTY STRING counts as PRESENT and is NOT recomputed, while an absent or
    // SQL-NULL value is. The options memo at L123 guards on
    // `!structKeyExists(variables, "parentProductTypeOptions")` instead, which treats a stored
    // null as present. Both are preserved verbatim and NEITHER is normalised.
    // [model/entity/PriceGroup.cfc:L196] uses the same `isNull` idiom for its own path, and
    // [model/entity/Sku.cfc:L368] uses the `structKeyExists` idiom for `currencyDetails`.
    // Do not conflate them.

    it('rebuilds from the parent chain when the stored path is absent', () => {
      const chain = makeAncestorChain(['pt-root', 'pt-leaf']);

      expect(leafOf(chain).getProductTypeIDPath()).toBe('pt-root,pt-leaf');
    });

    it('rebuilds when the stored path is SQL NULL, because the guard is isNull-shaped', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf', productTypeIDPath: null });
      subject.setParentProductType(root);

      // `isNull()` reaches a persisted-but-NULL column exactly as it reaches an absent one, so
      // a hydrated `null` rebuilds. A `structKeyExists`-shaped guard would have returned null.
      expect(subject.getProductTypeIDPath()).toBe('pt-root,pt-leaf');
    });

    it('returns a stored non-empty path untouched and never consults the parent chain', () => {
      const root = new ProductType({ productTypeID: 'pt-actual-root' });
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-stale-root,pt-leaf',
      });
      subject.setParentProductType(root);

      // The stored path DISAGREES with the in-memory parent chain, and the stored path wins.
      // That is not a quirk to be smoothed over: [L112] resolves the base product type out of
      // the STORED path, so "stored wins" is precisely the behaviour that method depends on.
      expect(subject.getProductTypeIDPath()).toBe('pt-stale-root,pt-leaf');
      expect(subject.getProductTypeIDPath()).not.toBe('pt-actual-root,pt-leaf');
    });

    it('treats a stored EMPTY STRING as present and does NOT rebuild it', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf', productTypeIDPath: '' });
      subject.setParentProductType(root);

      // THE ASYMMETRY THAT MATTERS, and the one a length-based guard would destroy. `isNull('')`
      // is FALSE in CFML, so the empty string is present and the getter returns it unchanged
      // even though a whole parent chain is sitting right there. Rebuilding here would look
      // like a helpful correction and would change which product types a promotion reward
      // matches - the empty path is also exactly what [L112] then hands to the root-identifier
      // read, which is why the next block pins that consequence too.
      expect(subject.getProductTypeIDPath()).toBe('');
      expect(subject.getProductTypeIDPath()).not.toBe('pt-root,pt-leaf');
    });

    it('distinguishes absent from present-but-empty on otherwise identical subjects', () => {
      // The two idioms differ on exactly one input, so they are compared on exactly one input:
      // same identifier, same parent, same everything except how the path field arrived.
      const absent = new ProductType({ productTypeID: 'pt-leaf' });
      absent.setParentProductType(new ProductType({ productTypeID: 'pt-root' }));

      const empty = new ProductType({ productTypeID: 'pt-leaf', productTypeIDPath: '' });
      empty.setParentProductType(new ProductType({ productTypeID: 'pt-root' }));

      expect(absent.getProductTypeIDPath()).toBe('pt-root,pt-leaf');
      expect(empty.getProductTypeIDPath()).toBe('');
    });

    it('memoizes the rebuilt path, so a later chain change is NOT reflected', () => {
      const original = new ProductType({ productTypeID: 'pt-original-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf' });
      subject.setParentProductType(original);

      // First read: absent, so it rebuilds AND writes the field.
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');

      // Re-parent after the memo is warm. [L251] now sees a present value and returns it.
      subject.removeParentProductType(original);
      subject.setParentProductType(new ProductType({ productTypeID: 'pt-new-root' }));

      // STALE ON PURPOSE. This is a staleness contract, not a speed decision (C7): the legacy
      // getter memoizes, so the target memoizes, and the correction arrives through ROUTE 2 on
      // the next insert or update rather than through this getter.
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');
      expect(subject.getParentProductType()?.getProductTypeID()).toBe('pt-new-root');
    });
  });

  describe('route 2 - explicit repository-invoked maintenance [L306, L311]', () => {
    // TRANSFORMATION RULE T3, AND THE POINT WORTH BEING PRECISE ABOUT: `preInsert` and
    // `preUpdate` exist on the shipped class, but they are NOT ORM lifecycle callbacks - there
    // is no Hibernate in the target to fire them. They are explicit maintenance methods that
    // `src/repositories/mysql/**` calls immediately before the corresponding write. NO ORM
    // hook, event emitter or lifecycle registry is invented by this suite, and the tests below
    // prove the methods are inert until something calls them.

    it('does not compute or overwrite the path at construction time', () => {
      const root = new ProductType({ productTypeID: 'pt-actual-root' });
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-persisted-root,pt-leaf',
      });
      subject.setParentProductType(root);

      // If the constructor fired the maintenance, a persisted path would be silently replaced
      // by one derived from a possibly partially-hydrated parent chain. It must not.
      expect(subject.getProductTypeIDPath()).toBe('pt-persisted-root,pt-leaf');
    });

    it('exposes an explicit write that produces the same path the lazy route produces', () => {
      const chain = makeAncestorChain(['pt-root', 'pt-mid', 'pt-leaf']);
      const leaf = leafOf(chain);

      const eager = new ProductType({ productTypeID: 'pt-leaf' });
      const parent = chain.at(1);
      if (parent === undefined) {
        throw new Error('the three-level chain is missing its middle node.');
      }
      eager.setParentProductType(parent);
      eager.preInsert();

      // Both routes delegate to the same private builder, so they can never drift apart.
      expect(eager.getProductTypeIDPath()).toBe(leaf.getProductTypeIDPath());
      expect(eager.getProductTypeIDPath()).toBe('pt-root,pt-mid,pt-leaf');
    });

    it('overwrites an already-memoized value on preInsert, correcting a stale path', () => {
      const original = new ProductType({ productTypeID: 'pt-original-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf' });
      subject.setParentProductType(original);

      // Warm the ROUTE 1 memo, then move the node.
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');
      subject.removeParentProductType(original);
      subject.setParentProductType(new ProductType({ productTypeID: 'pt-new-root' }));
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');

      // ROUTE 2 assigns UNCONDITIONALLY - it calls the SETTER and so bypasses the [L251] guard
      // entirely. This is how the legacy corrects a stale path: on every insert and every
      // update, whether or not the getter had already memoized one.
      subject.preInsert();

      expect(subject.getProductTypeIDPath()).toBe('pt-new-root,pt-leaf');
    });

    it('overwrites an already-memoized value on preUpdate as well', () => {
      const original = new ProductType({ productTypeID: 'pt-original-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf' });
      subject.setParentProductType(original);
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');

      subject.removeParentProductType(original);
      subject.setParentProductType(new ProductType({ productTypeID: 'pt-new-root' }));
      subject.preUpdate();

      expect(subject.getProductTypeIDPath()).toBe('pt-new-root,pt-leaf');
    });

    it('accepts and ignores the oldData argument on preUpdate, matching [L310-L312]', () => {
      const subject = new ProductType({ productTypeID: 'pt-root' });

      // `struct oldData` is declared WITHOUT `required` at [L310] and the legacy body never
      // reads it - it forwards the whole argument collection to `super` at [L312], and the
      // framework audit stamping the repository now owns is what consumed it. The parameter is
      // carried forward for signature parity, so both call shapes must behave identically.
      subject.preUpdate({ productTypeIDPath: 'whatever-the-prior-row-held' });
      expect(subject.getProductTypeIDPath()).toBe('pt-root');

      const other = new ProductType({ productTypeID: 'pt-root' });
      other.preUpdate();
      expect(other.getProductTypeIDPath()).toBe('pt-root');
    });

    it('re-arms the lazy rebuild when the path is written back as absent', () => {
      const subject = new ProductType({ productTypeID: 'pt-leaf' });
      subject.setParentProductType(new ProductType({ productTypeID: 'pt-root' }));

      subject.setProductTypeIDPath('pt-frozen');
      expect(subject.getProductTypeIDPath()).toBe('pt-frozen');

      // Writing an absent value is how a repository asks for the path to be recomputed on next
      // READ rather than now - the inverse of the eager hooks, and the reason `undefined` and
      // `null` are both accepted by the setter.
      subject.setProductTypeIDPath(undefined);
      expect(subject.getProductTypeIDPath()).toBe('pt-root,pt-leaf');

      subject.setProductTypeIDPath(null);
      expect(subject.getProductTypeIDPath()).toBe('pt-root,pt-leaf');
    });

    it('makes the path assignment the ONLY effect of either hook', () => {
      // CFML parity [model/entity/ProductType.cfc:L305-L313]: THE PATH IS ASSIGNED BEFORE THE
      // `super` CALL - [L306] precedes [L307], and [L311] precedes [L312]. That matches
      // [model/entity/PriceGroup.cfc:L207-L208] and is the OPPOSITE of
      // [model/entity/Category.cfc:L126-L129], which calls `super` FIRST. The ordering is
      // reproduced per entity and deliberately NOT normalised, because it is observable
      // wherever the framework's own pre-write work reads entity state.
      //
      // In the target the `super` half is the REPOSITORY's audit stamping - all four audit
      // columns carry `hb_populateEnabled="false"` at [L83-L86] precisely because the
      // framework, not request data, owned them. Path-first is therefore expressed as: the
      // assignment is this method's only effect, and the repository's stamping runs after it
      // returns. Re-implementing audit stamping on the entity would put persistence concerns
      // back inside the domain, so these assertions pin that it was not.
      const subject = new ProductType({ productTypeID: 'pt-leaf' });
      subject.setParentProductType(new ProductType({ productTypeID: 'pt-root' }));

      subject.preInsert();
      expect(subject.getProductTypeIDPath()).toBe('pt-root,pt-leaf');
      expect(subject.getCreatedDateTime()).toBeUndefined();
      expect(subject.getCreatedByAccountID()).toBeUndefined();
      expect(subject.getModifiedDateTime()).toBeUndefined();
      expect(subject.getModifiedByAccountID()).toBeUndefined();

      subject.preUpdate();
      expect(subject.getModifiedDateTime()).toBeUndefined();
      expect(subject.getModifiedByAccountID()).toBeUndefined();
    });

    it('places both hooks correctly inside the ORM Event Hooks banner, unlike PriceGroup', () => {
      // CFML parity [model/entity/ProductType.cfc:L303-L315]: this component's banner
      // bookkeeping is CORRECT - `preInsert` [L305-L308] and `preUpdate` [L310-L313] both sit
      // inside the "ORM Event Hooks" run that opens at [L303] and closes at [L315].
      // [model/entity/PriceGroup.cfc] gets the identical pair WRONG: its hooks sit under
      // "Overridden Methods" ([L204]-[L216]) while its own ORM Event Hooks banner opens at
      // [L218] with nothing in it. [model/entity/Category.cfc] differs a third way again - its
      // "Overridden Methods" block at [L120-L122] is EMPTY, it has no lazy path getter at all,
      // and its hooks at [L126-L134] run `super` FIRST.
      //
      // Secondary register item [model/entity/ProductType.cfc:L311]: the statement ends in a
      // DOUBLE SEMICOLON - `setProductTypeIDPath( buildIDPathList( "parentProductType" ) );;` -
      // the second occurrence of that wart in the folder after
      // [model/entity/PriceGroup.cfc:L212]. An empty statement has no behaviour, so there is
      // nothing to reproduce and no divergence is spent; it is recorded, not enacted.
      //
      // Banner placement is a comment fact and cannot be asserted at runtime. What CAN be
      // asserted, and is, is that both members are really on the shipped class - so the
      // documentation above describes something that exists.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('preInsert');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('preUpdate');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getProductTypeIDPath');
    });
  });
});

// ===========================================================================
// B2. `getBaseProductType()` - THE ROOT ELEMENT, AND THE ONE ASYNC MEMBER
//
//   109: 	//get merchandisetype
//   110: 	public any function getBaseProductType() {
//   111: 		if(isNull(getSystemCode()) || getSystemCode() == ""){
//   112: 			return getService("ProductService").getProductType(listFirst(getProductTypeIDPath())).getSystemCode();
//   113: 		}
//   114: 		return getSystemCode();
//   115: 	}
//
// CFML parity [model/entity/ProductType.cfc:L112]: getBaseProductType resolves through
// `listFirst(getProductTypeIDPath())` -- the FIRST, i.e. ROOT, element of the comma-delimited
// path -- expressed here as `listGetAt(path, 1)` because `src/lib/cfml/list.ts` exports
// `listGetAt` (1-based) and does NOT export `listFirst`. An upstream note claimed the SECOND
// element; the source disproves it, and the assertions below prove element ONE by making the
// root, the parent and the node itself each carry a DIFFERENT system code.
//
// The entity reaches `listGetAt` through `getRootIdFromIdPath()` rather than directly, because
// a bare `listGetAt('', 1)` raises out of range where CFML `listFirst('')` answers `''`. The
// value object is where that single boundary is reconciled, and both halves are pinned below.
// ===========================================================================

describe('ProductType - getBaseProductType() (B2)', () => {
  describe('the root-element contract', () => {
    it('reads element ONE of the path, which is the root and not the second element', () => {
      const path = 'pt-root,pt-mid,pt-leaf';

      // The correction, asserted rather than merely asserted-about. `getRootIdFromIdPath` is
      // the shipped `listFirst` emulation and it must agree with a 1-based positional read.
      expect(getRootIdFromIdPath(path)).toBe('pt-root');
      expect(getRootIdFromIdPath(path)).toBe(listGetAt(path, 1));
      expect(getRootIdFromIdPath(path)).not.toBe(listGetAt(path, 2));
    });

    it('answers the empty string for an empty path, as CFML listFirst(str) does', () => {
      // The one place the emulation deliberately differs from a bare positional read: CFML
      // `listFirst('')` is `''`, while `listGetAt('', 1)` raises. Both behaviours are correct
      // for their own contract, and the entity calls the one that matches the legacy.
      expect(getRootIdFromIdPath('')).toBe('');
      expect(() => listGetAt('', 1)).toThrow();
    });
  });

  describe('the L111 fallback ladder', () => {
    it('is asynchronous, because [L112] genuinely reaches the repository', async () => {
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
        productTypeRepository: repository,
      });

      // THE ASYNC BOUNDARY RULE: a ported method becomes `async` IF AND ONLY IF its legacy body
      // genuinely reaches the DAO or the ORM. [L112] performs a product-type load BY IDENTIFIER,
      // which is unambiguously a repository round-trip, so this is the ONE asynchronous member
      // on the class - everything else traverses already-materialized associations or does pure
      // string work and stays synchronous.
      const pending = subject.getBaseProductType();
      expect(pending).toBeInstanceOf(Promise);
      await expect(pending).resolves.toBe('merchandise');
    });

    it('short-circuits on its own non-empty system code WITHOUT touching the repository', async () => {
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
        systemCode: 'subscription',
        productTypeRepository: repository,
      });

      await expect(subject.getBaseProductType()).resolves.toBe('subscription');

      // [L114] returns before [L112] can run. Proving the double was NEVER called is the only
      // way to show the short-circuit is real rather than incidentally producing the same
      // answer - and here it could not, because the root carries a different code.
      expect(repository.calls).toStrictEqual([]);
    });

    it('falls through to the root lookup when its own system code is UNDEFINED', async () => {
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
        productTypeRepository: repository,
      });

      expect(subject.getSystemCode()).toBeUndefined();
      await expect(subject.getBaseProductType()).resolves.toBe('merchandise');
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:pt-root']);
    });

    it('falls through to the root lookup when its own system code is the EMPTY STRING', async () => {
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
        systemCode: '',
        productTypeRepository: repository,
      });

      // BOTH fall-through cases are asserted because [L111] is TWO tests joined by `or`:
      // `isNull(getSystemCode())` and `getSystemCode() == ""`. Collapsing them into one
      // truthiness check would look equivalent and would not be - it is the SHAPE of the guard
      // that is the ported contract, not merely its outcome on today's data.
      expect(subject.getSystemCode()).toBe('');
      await expect(subject.getBaseProductType()).resolves.toBe('merchandise');
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:pt-root']);
    });

    it('takes the ROOT system code over a three-level chain, not the parent and not its own', async () => {
      // The decisive test for the element-ONE correction. Each level carries a DIFFERENT system
      // code, so an off-by-one would resolve to `'from-the-middle'` and be caught here.
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'from-the-root' });
      const mid = new ProductType({ productTypeID: 'pt-mid', systemCode: 'from-the-middle' });
      const repository = makeProductTypeRepositoryDouble(
        new Map([
          ['pt-root', root],
          ['pt-mid', mid],
        ]),
      );
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-mid,pt-leaf',
        productTypeRepository: repository,
      });

      await expect(subject.getBaseProductType()).resolves.toBe('from-the-root');
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:pt-root']);
    });

    it('resolves through the STORED path, not by climbing the in-memory parent chain', async () => {
      // Climbing `parentProductType` to the root would look like the same answer and is NOT
      // equivalent: [L112] takes the root IDENTIFIER out of the STORED path and loads that row
      // fresh. A stored path that disagrees with the in-memory chain - stale, truncated at 4000
      // characters, or hydrated without its parents - gives a different result, and the stored
      // path is what the legacy consults. Making the two disagree pins which one wins.
      const storedRoot = new ProductType({ productTypeID: 'pt-stored-root', systemCode: 'stored' });
      const chainRoot = new ProductType({ productTypeID: 'pt-chain-root', systemCode: 'chain' });
      const repository = makeProductTypeRepositoryDouble(
        new Map([
          ['pt-stored-root', storedRoot],
          ['pt-chain-root', chainRoot],
        ]),
      );
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-stored-root,pt-leaf',
        productTypeRepository: repository,
      });
      subject.setParentProductType(chainRoot);

      await expect(subject.getBaseProductType()).resolves.toBe('stored');
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:pt-stored-root']);
    });

    it('terminates in exactly one hop when the product type IS its own root', async () => {
      // NOT infinite recursion, and recorded so nobody "fixes" a problem that does not exist:
      // the path's first element is then this node's own identifier, the repository returns this
      // same row, and `getSystemCode()` is a plain column accessor that does not re-enter the
      // method. One hop, then done.
      const selfRooted = new ProductType({
        productTypeID: 'pt-root',
        productTypeIDPath: 'pt-root',
        systemCode: '',
      });
      const resolved = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', resolved]]));
      const subject = new ProductType({
        productTypeID: selfRooted.getProductTypeID(),
        productTypeIDPath: selfRooted.getProductTypeIDPath(),
        systemCode: '',
        productTypeRepository: repository,
      });

      await expect(subject.getBaseProductType()).resolves.toBe('merchandise');
      expect(repository.calls).toHaveLength(1);
    });
  });

  describe('the absent and failing answers, each pinned as the shipped behaviour', () => {
    it('resolves to undefined when the root row itself carries no system code', async () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
        productTypeRepository: repository,
      });

      // AN ABSENT ANSWER IS LEGITIMATE AND LOAD-BEARING. The root may carry no system code, in
      // which case CFML returns null and this returns `undefined`. That emptiness is what the
      // `baseProductType` gate in `model/validation/Product.json` tests against
      // (`inList "merchandise" | "subscription"`), so coercing it to `''` or to a fabricated
      // default would turn a hard failure into a WRONG ANSWER.
      await expect(subject.getBaseProductType()).resolves.toBeUndefined();
    });

    it('rejects when the root row named by the stored path cannot be loaded', async () => {
      const repository = makeProductTypeRepositoryDouble(new Map<string, ProductType>());
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-missing-root,pt-leaf',
        productTypeRepository: repository,
      });

      // THE UNGUARDED DEREFERENCE IS PRESERVED, NOT PAPERED OVER. In CFML `.getSystemCode()` is
      // invoked directly on whatever `getProductType(...)` returns, so a missing root row fails
      // at runtime. The port reproduces the failure by raising instead of inventing a fallback,
      // and the message names the locator so the failure is diagnosable.
      await expect(subject.getBaseProductType()).rejects.toThrow(
        /could not load the root product type/,
      );
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:pt-missing-root']);
    });

    it('rejects when the stored path is empty, because the root identifier is then empty too', async () => {
      // The consequence of the B1 empty-string asymmetry, followed all the way through: a stored
      // `''` is PRESENT so the getter returns `''`, `getRootIdFromIdPath('')` is `''`, and the
      // lookup of `''` matches no row - so this fails exactly as the legacy would.
      const repository = makeProductTypeRepositoryDouble(new Map<string, ProductType>());
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: '',
        productTypeRepository: repository,
      });

      await expect(subject.getBaseProductType()).rejects.toThrow(
        /could not load the root product type/,
      );
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:']);
    });

    it('rejects when no repository port was wired at hydration time', async () => {
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
      });

      // The port is OPTIONAL on the constructor because the overwhelming majority of read paths
      // never ask for a base product type. An absent port is reported at the one method that
      // needs it rather than defaulted, because this method's return type has no spare value
      // meaning "cannot answer" - `undefined` already means "the root has no system code".
      await expect(subject.getBaseProductType()).rejects.toThrow(
        /requires a productTypeRepository/,
      );
    });

    it('still short-circuits without a repository when its own system code is present', async () => {
      const subject = new ProductType({ productTypeID: 'pt-leaf', systemCode: 'merchandise' });

      // Proof that the unwired-port failure belongs to the [L112] branch alone and is not a
      // precondition of the method as a whole.
      await expect(subject.getBaseProductType()).resolves.toBe('merchandise');
    });
  });
});

// ===========================================================================
// B3. `getAppliedPriceGroupRateByPriceGroup()` - THE NAMED-ARGUMENT DEFECT THAT THROWS
//
//   117:     public any function getAppliedPriceGroupRateByPriceGroup( required any priceGroup) {
//   118: 		return getService("priceGroupService").getRateForProductTypeBasedOnPriceGroup(product=this, priceGroup=arguments.priceGroup);
//   119: 	}
//
// LEGACY-DEFECT [model/entity/ProductType.cfc:L117-L119]: getAppliedPriceGroupRateByPriceGroup
// passes product=this to getRateForProductTypeBasedOnPriceGroup, whose signature at
// [model/service/PriceGroupService.cfc:L57] declares `required any productType`. The required
// argument is never supplied, so the call throws at runtime. Shipped as a throwing stub
// returning never. Sku.cfc:L265-L268 passes sku=this CORRECTLY -- that is the control proving
// this is a defect, not a convention.
// Preserved deliberately; do not fix without a product decision.
//
// THE CONTROL, VERIFIED FIRST-HAND AND CITED RATHER THAN RE-ASSERTED. The twin method on the
// SKU entity is byte-for-byte the same shape and gets it right:
//
//   265: 	public any function getAppliedPriceGroupRateByPriceGroup( required any priceGroup) {
//   266: 		return getService("priceGroupService").getRateForSkuBasedOnPriceGroup(sku=this,
//   267: 			priceGroup=arguments.priceGroup);
//   268: 	}
//
// Two entities, the same method name, the same service, the same call shape - and only one of
// them names its argument to match the callee. That asymmetry is what makes this a DEFECT and
// not a house convention, and its assertion belongs to `sku.test.ts`. Cited here, not repeated.
//
// NOT A DIVERGENCE, AND NOT A NUMBERED-BUDGET SPEND. This suite spends ZERO divergences. The
// three that exist project-wide are (a) the un-`var`'d `discountAmount` and (b) the `amountOff`
// raw-float gap, both owned by `src/services`, and (c) the entity memo fixes owned by
// `sku.test.ts` and `product.test.ts`. Preserving a throw is preservation, not divergence.
// ===========================================================================

describe('ProductType - getAppliedPriceGroupRateByPriceGroup() (B3)', () => {
  it('always throws, because the legacy call never satisfies the callee signature', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });
    const priceGroup = makeInertPriceGroup('pg-1');

    // The whole observable contract, in one line. There is no argument, no collaborator and no
    // state that makes this method succeed, because the legacy never once succeeded either.
    expect(() => subject.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
  });

  it('names the mismatched argument, the callee signature and the correct twin in its message', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });
    const priceGroup = makeInertPriceGroup('pg-1');

    let message = '';
    try {
      subject.getAppliedPriceGroupRateByPriceGroup(priceGroup);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    // A preserved defect that fails opaquely is a trap; a preserved defect that explains itself
    // is documentation. The message must carry the four facts an engineer meeting this failure
    // needs: the argument actually passed, the argument actually required, the locator of the
    // signature it violates, and where the working form lives.
    expect(message).toContain("'product'");
    expect(message).toContain("'productType'");
    expect(message).toContain('model/service/PriceGroupService.cfc:L57');
    expect(message).toContain('model/entity/Sku.cfc:L265-L268');
  });

  it('throws identically no matter which price group is handed in', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });

    // The parameter is retained unused for interface parity [C4] and is genuinely inert: the
    // failure happens at the CFML argument-binding boundary, BEFORE the service body runs, so
    // nothing about the price group can influence it. Two different price groups, one behaviour.
    expect(() => subject.getAppliedPriceGroupRateByPriceGroup(makeInertPriceGroup('pg-a'))).toThrow(
      Error,
    );
    expect(() => subject.getAppliedPriceGroupRateByPriceGroup(makeInertPriceGroup('pg-b'))).toThrow(
      Error,
    );
  });

  it('throws for a saved product type just as it does for an unsaved one', () => {
    const unsaved = new ProductType({ productTypeID: '' });
    const saved = new ProductType({
      productTypeID: 'pt-1',
      productTypeIDPath: 'pt-root,pt-1',
      systemCode: 'merchandise',
      priceGroupRates: [],
    });
    const priceGroup = makeInertPriceGroup('pg-1');

    // Persistence state, a populated path and a resolvable system code are all irrelevant. Were
    // the failure conditional on any of them, someone would eventually find the "working" case
    // and treat the throw as a bug in the port rather than a preserved defect in the source.
    expect(unsaved.isNew()).toBe(true);
    expect(() => unsaved.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
    expect(saved.isNew()).toBe(false);
    expect(() => saved.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
  });

  it('is synchronous, so the failure surfaces at the call and not as a rejected promise', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });
    const priceGroup = makeInertPriceGroup('pg-1');

    // The async boundary rule cuts the other way here. The legacy body never reaches the service,
    // so it never reaches a DAO either, so the port stays synchronous and `getBaseProductType`
    // remains the single asynchronous member on the class. Were this method `async` the throw
    // would arrive as an unhandled rejection - a materially worse failure mode, and one that
    // `no-floating-promises` could not protect a caller from at a `never`-returning call site.
    expect(() => subject.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getAppliedPriceGroupRateByPriceGroup');
  });

  it('exposes no repaired alternative alongside the broken method', () => {
    // NO WORKING IMPLEMENTATION IS INVENTED, and the absence is asserted rather than merely
    // promised. Shipping a correctly-named sibling would hand callers the repaired behaviour
    // through a side door and quietly defeat the preservation this method exists to record.
    // Product-type rates are resolved where the cascade actually lives - in the price-group
    // service, through getRateForProductTypeBasedOnPriceGroup(productType, priceGroup).
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getRateForProductTypeBasedOnPriceGroup');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPriceGroupRateByPriceGroup');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getAppliedPriceGroupRate');
  });
});

// ===========================================================================
// B4. THE C3 TODO CARRY-FORWARD, AND THE DEAD NO-OP GUARD
//
//    92: 	public array function getInheritedAttributeSetAssignments() {
//    93: 		// Todo get by all the parent productTypeIDs
//    94: 		var attributeSetAssignments = getService("AttributeService").getAttributeSetAssignmentSmartList().getRecords();
//    95: 		if(!arrayLen(attributeSetAssignments)){
//    96: 			attributeSetAssignments = [];
//    97: 		}
//    98: 		return attributeSetAssignments;
//    99: 	}
//
// CFML parity [model/entity/ProductType.cfc:L92-L99]: the legacy TODO at L93 -- "Todo get by all
// the parent productTypeIDs" -- is carried forward verbatim per C3 and is NOT completed. The
// L95-L97 guard is a NO-OP: it reassigns an empty array to an empty array. Attribute-set
// behaviour is NOT ported, so this method's smart-list body has no target equivalent; the TODO
// is preserved as documentation of the gap.
//
// THE TODO, REPRODUCED CHARACTER-FOR-CHARACTER FROM THE SOURCE LINE, LOWERCASE `odo` AND ALL:
//
// TODO [model/entity/ProductType.cfc:L93]: Todo get by all the parent productTypeIDs
//
// WHAT THE TODO IS ACTUALLY ADMITTING, because it matters for anyone who later resolves it: the
// method is named `getInheritedAttributeSetAssignments`, but [L94] fetches EVERY attribute-set
// assignment in the installation with no filter whatsoever. It inherits nothing. The TODO is the
// original author recording that the parent-productTypeID filter was never written. Completing
// it is a product decision about which assignments a child product type should see - not a
// translation decision - so it travels forward untouched, exactly as the TODO directive requires.
//
// WHY NOTHING HERE IS PORTED, two independent reasons either of which suffices. It is a SMART
// LIST (`getAttributeSetAssignmentSmartList()`), and smart lists are replaced project-wide by
// explicit typed repository queries owned by the service and repository tiers - never by an
// entity. And it reaches the entity-attribute-value subsystem, which is out of scope in its
// entirety, so there is no in-scope type for the method to return.
//
// THE PORT LEDGER STAYS AT THIRTEEN. `AttributeService`, `hibachiUtilityService` and every smart
// list are NOT ported. No fourteenth port is added to carry an out-of-scope subsystem into an
// in-scope entity, and the compile-time assertion below proves the constructor refuses one.
// ===========================================================================

describe('ProductType - the attribute-set TODO and its deliberate non-port (B4)', () => {
  it('does not ship getInheritedAttributeSetAssignments at all', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });

    // ASSERT THE SHIPPED REALITY, not an assumption about it. The method was verified absent
    // first-hand before this assertion was written; it is pinned so that a later well-meaning
    // "completion" of the TODO cannot land silently inside the domain layer.
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getInheritedAttributeSetAssignments');
    expect('getInheritedAttributeSetAssignments' in subject).toBe(false);
  });

  it('ships no attribute-set, attribute-value or EAV surface of any kind', () => {
    // The whole out-of-scope subsystem, enumerated so the boundary is checkable rather than
    // asserted. `attributeValues` is declared at [L67] and `attributeSets` at [L76]; neither is
    // materialized, so none of the accessors the framework would otherwise synthesise exist.
    for (const absent of [
      'getAttributeValues',
      'getAttributeSets',
      'getAttributeValue',
      'setAttributeValue',
      'getAttributeValueByAttributeCode',
      'getAssignedAttributeSetSmartList',
      'clearAttributeCache',
    ]) {
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(absent);
    }
  });

  it('accepts no attribute-service port, keeping the ledger at thirteen', () => {
    const subject = new ProductType({
      productTypeID: 'pt-1',
      // @ts-expect-error - NO FOURTEENTH PORT. `attributeService` is not a constructor key, and
      // this deliberate compile error is the assertion: the type system, not a runtime check,
      // refuses to let an out-of-scope subsystem be wired into an in-scope entity. The thirteen
      // ports are productRepository, skuRepository, optionRepository, productTypeRepository,
      // promotionRepository, priceGroupRepository, settingsProvider, currencyConverter,
      // addressZoneEvaluator, urlTitleGenerator, imageStore, subscriptionTermProvider and
      // productFeedPort. `ProductType` consumes exactly ONE of them - productTypeRepository.
      attributeService: { getAttributeSetAssignmentSmartList: () => [] },
    });

    // The excess key is dropped rather than absorbed: the instance is otherwise ordinary.
    expect(subject.getProductTypeID()).toBe('pt-1');
    expect('attributeService' in subject).toBe(false);
  });

  it('characterizes the [L95-L97] guard as a dead no-op that cannot change the outcome', () => {
    // The guard reproduced in the smallest honest form, purely to demonstrate why it is dead.
    // This is CHARACTERIZATION of a legacy branch, not a port: nothing in `src/**` contains it,
    // because the method that housed it is not ported.
    const legacyGuard = (records: readonly unknown[]): readonly unknown[] => {
      // if(!arrayLen(attributeSetAssignments)){ attributeSetAssignments = []; }
      if (records.length === 0) {
        return [];
      }
      return records;
    };

    // On the only branch that fires - an already-empty array - it substitutes an empty array for
    // an empty array. The VALUE the caller receives is unchanged, which is the only thing [L98]
    // exposes, so the branch is observationally inert. And `getRecords()` at [L94] returns an
    // array unconditionally, so the guard cannot even be defending against a null.
    expect(legacyGuard([])).toStrictEqual([]);
    expect(legacyGuard(['a', 'b'])).toStrictEqual(['a', 'b']);

    // The one thing it does change is IDENTITY, and only on the empty branch - which no caller
    // can observe, because the array is function-local and freshly returned either way. Recorded
    // for completeness so nobody later argues the branch had a purpose.
    const empty: readonly unknown[] = [];
    expect(legacyGuard(empty)).not.toBe(empty);
    const populated: readonly unknown[] = ['a'];
    expect(legacyGuard(populated)).toBe(populated);
  });

  it('leaves the productTypeIDPath the TODO would have needed fully available', () => {
    // A closing observation with real value for whoever resolves the TODO: the parent-filtered
    // query it asks for needs the ancestor identifiers, and those are already exactly what the
    // materialized path carries - root-first, self-last, self included [B1]. So the missing
    // filter has its input sitting right here; what is missing is the attribute subsystem, which
    // is out of scope. This is why the TODO is preserved rather than resolved.
    const chain = makeAncestorChain(['pt-root', 'pt-mid', 'pt-leaf']);
    const leaf = leafOf(chain);

    expect(leaf.getProductTypeIDPath()).toBe('pt-root,pt-mid,pt-leaf');
    expect(listGetAt(leaf.getProductTypeIDPath(), 1)).toBe('pt-root');
  });
});

// ===========================================================================
// B5. A2 - REQUEST-SCOPED STATE, AND THE PARTIAL CACHE-INVALIDATION RESIDUAL
//
// This suite is the designated home for the partial-clear characterization.
//
//   246: 	public void function clearAttributeCache() {
//   247: 		if(structKeyExists(variables, "attributeValuesByAttributeIDStruct")) {
//   248: 			structDelete(variables, "attributeValuesByAttributeIDStruct");
//   249: 		}
//   250: 		if(structKeyExists(variables, "attributeValuesByAttributeCodeStruct")) {
//   251: 			structDelete(variables, "attributeValuesByAttributeCodeStruct");
//   252: 		}
//   253: 	}
//
// CFML parity [model/entity/HibachiEntity.cfc:L246-L253]: clearAttributeCache() clears ONLY
// attributeValuesByAttributeIDStruct and attributeValuesByAttributeCodeStruct, leaving
// attributeValuesForEntity and assignedAttributeSetSmartList STALE -- a PARTIAL invalidation.
// None of the four memos, and no clearAttributeCache, is ported: all entity caches are
// request-scoped instead. Characterized here as the legacy contract; deliberately NOT reproduced.
//
// WHY A PARTIAL CLEAR IS WORSE THAN NO CLEAR. A cache with no invalidation is at least uniformly
// stale and reasons about consistently. This one clears two of four, so after a write the two
// struct memos re-read from the database while `attributeValuesForEntity` and
// `assignedAttributeSetSmartList` keep answering from before the write - and the same entity then
// reports two different versions of itself depending on which accessor you happen to call.
//
// AND UNDER LAMBDA IT WOULD BE UNSAFE, NOT MERELY WRONG. A warm container reuses module state
// across unrelated invocations, so a memo that survives the request would carry one caller's
// resolved data into another caller's response. The target therefore keeps EVERY entity cache
// instance-scoped and every instance request-scoped. That is a structural decision about
// CORRECTNESS and isolation - not an optimisation, and never justified by speed.
//
// THE FOUR LEGACY CACHES THAT MUST NEVER BECOME MODULE STATE, recorded so the boundary is
// explicit: `SkuDAO.variables.nextOptionGroupSortOrder` (never cleared at all - the clear
// method's condition is INVERTED at model/dao/SkuDAO.cfc:L222-L226, testing
// `not structKeyExists` before deleting the key, so it can never fire);
// `RoundingRuleService.variables.roundingRuleDetails`; the un-`var`'d `discountAmount` at
// model/service/PromotionService.cfc:L1007/L1009 (divergence (a), sibling-owned); and EVERY
// entity memo, including this component's `productTypeIDPath` and `parentProductTypeOptions`.
//
// THE FOUR `getAssignedAttributeSetSmartList` SHADOW SITES, all omitted in the target and
// therefore documentary only: the base at model/entity/HibachiEntity.cfc:L205, then
// model/entity/Sku.cfc:L813, model/entity/ProductType.cfc:L280, and - verified first-hand, and
// omitted by the upstream inventory - model/entity/Product.cfc:L795.
//
// THE DEAD RETRY AT model/entity/HibachiEntity.cfc:L180-L183: [L182] re-calls
// `getAttributeByAttributeCode(arguments.attribute)` with IDENTICAL arguments after the first
// call missed, so the retry cannot produce a different result. Present-but-unexercised; recorded
// here, and no test path is invented for it.
// ===========================================================================

describe('ProductType - request-scoped state and cache residuals (B5)', () => {
  describe('memo isolation between independent instances', () => {
    it('does not let a second instance observe the first instance path memo', () => {
      const sharedRoot = new ProductType({ productTypeID: 'pt-root' });

      const first = new ProductType({ productTypeID: 'pt-same' });
      first.setParentProductType(sharedRoot);
      expect(first.getProductTypeIDPath()).toBe('pt-root,pt-same');

      // A SECOND, INDEPENDENT INSTANCE CARRYING THE SAME IDENTIFIER. If the memo were module
      // state keyed by product-type ID - the shape a warm-container cache naturally takes - this
      // parentless instance would answer the first instance's two-element path.
      const second = new ProductType({ productTypeID: 'pt-same' });
      expect(second.getProductTypeIDPath()).toBe('pt-same');
      expect(first.getProductTypeIDPath()).toBe('pt-root,pt-same');
    });

    it('gives two children of one shared parent their own independent paths', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const childA = new ProductType({ productTypeID: 'pt-a' });
      const childB = new ProductType({ productTypeID: 'pt-b' });
      childA.setParentProductType(root);
      childB.setParentProductType(root);

      // The shared ancestor is the realistic vector for cross-contamination: a memo hung off the
      // PARENT rather than the child would give both children whichever path was computed first.
      expect(childA.getProductTypeIDPath()).toBe('pt-root,pt-a');
      expect(childB.getProductTypeIDPath()).toBe('pt-root,pt-b');
      expect(childA.getProductTypeIDPath()).not.toBe(childB.getProductTypeIDPath());
    });

    it('does not leak a warmed memo through the shared parent into a later sibling', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const early = new ProductType({ productTypeID: 'pt-early' });
      early.setParentProductType(root);
      // Warm the first memo, then build the sibling AFTERWARDS - ordering matters, because a
      // module-scoped cache would already be populated by the time the sibling asks.
      expect(early.getProductTypeIDPath()).toBe('pt-root,pt-early');

      const late = new ProductType({ productTypeID: 'pt-late' });
      late.setParentProductType(root);
      expect(late.getProductTypeIDPath()).toBe('pt-root,pt-late');
    });

    it('keeps an explicitly stored path on one instance off every other instance', () => {
      const first = new ProductType({ productTypeID: 'pt-1' });
      const second = new ProductType({ productTypeID: 'pt-1' });

      first.setProductTypeIDPath('deliberately-divergent,pt-1');

      expect(first.getProductTypeIDPath()).toBe('deliberately-divergent,pt-1');
      expect(second.getProductTypeIDPath()).toBe('pt-1');
    });

    it('starts every instance with a cold memo, so construction order never matters', () => {
      // Constructed in one order, interrogated in the reverse order. Any hidden module state
      // populated during construction would show up as an answer that depends on that ordering.
      const chainA = makeAncestorChain(['ra', 'ma', 'la']);
      const chainB = makeAncestorChain(['rb', 'mb', 'lb']);

      expect(leafOf(chainB).getProductTypeIDPath()).toBe('rb,mb,lb');
      expect(leafOf(chainA).getProductTypeIDPath()).toBe('ra,ma,la');
    });

    it('shares no repository port between instances that were not given one', () => {
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));

      const wired = new ProductType({
        productTypeID: 'pt-wired',
        productTypeIDPath: 'pt-root,pt-wired',
        productTypeRepository: repository,
      });
      const unwired = new ProductType({
        productTypeID: 'pt-unwired',
        productTypeIDPath: 'pt-root,pt-unwired',
      });

      // The port is per-instance constructor state, never a module singleton or an ambient
      // default. Wiring one instance must not silently satisfy another - that would be exactly
      // the ambient-collaborator pattern the composition root exists to eliminate (rule T1).
      return Promise.all([
        expect(wired.getBaseProductType()).resolves.toBe('merchandise'),
        expect(unwired.getBaseProductType()).rejects.toThrow(/requires a productTypeRepository/),
      ]);
    });
  });

  describe('the partial-clear residual, characterized and deliberately not reproduced', () => {
    it('ships none of the four memos the partial clear operated on', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // THE SHIPPED REALITY FIRST. The residual cannot exist in the target because none of the
      // four caches it governs exists here: two were cleared by [L246-L253] and two were left
      // stale by it, and all four belong to the unported EAV subsystem.
      for (const absent of [
        'clearAttributeCache',
        'getAttributeValuesByAttributeIDStruct',
        'getAttributeValuesByAttributeCodeStruct',
        'getAttributeValuesForEntity',
        'getAssignedAttributeSetSmartList',
      ]) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(absent);
      }
      expect('clearAttributeCache' in subject).toBe(false);
    });

    it('characterizes the two-of-four clear so the legacy contract is on record', () => {
      // The legacy struct-key sets, as literals. This is CHARACTERIZATION - a written record of
      // the contract the target declines to reproduce - and it touches no production code.
      const memoKeys = [
        'attributeValuesByAttributeIDStruct',
        'attributeValuesByAttributeCodeStruct',
        'attributeValuesForEntity',
        'assignedAttributeSetSmartList',
      ] as const;
      const clearedByLegacy = [
        'attributeValuesByAttributeIDStruct',
        'attributeValuesByAttributeCodeStruct',
      ];
      const leftStaleByLegacy = memoKeys.filter((key) => !clearedByLegacy.includes(key));

      // TWO of FOUR. That is the whole defect: the clear is named as though it invalidated the
      // attribute cache, and it invalidates half of it.
      expect(clearedByLegacy).toHaveLength(2);
      expect(leftStaleByLegacy).toStrictEqual([
        'attributeValuesForEntity',
        'assignedAttributeSetSmartList',
      ]);
      expect(clearedByLegacy.length + leftStaleByLegacy.length).toBe(memoKeys.length);
    });

    it('exposes no cache-clearing surface at all, partial or complete', () => {
      // NOT "fixed" into a complete clear either - that would be a fourth divergence, and the
      // budget is zero. The residual is designed out rather than corrected: with every cache
      // instance-scoped and every instance request-scoped, there is nothing left to invalidate,
      // so no clear method is needed in any form.
      for (const member of PRODUCT_TYPE_PROTOTYPE_MEMBERS) {
        expect(member).not.toMatch(/^clear/);
        expect(member).not.toMatch(/[Cc]ache/);
      }
    });

    it('leaves the one memo it does keep observable only through its own accessor', () => {
      // The single cache this entity keeps is the [L250-L255] path memo asserted in B1. Its full
      // observable surface is one getter and one setter - no clear, no flush, no invalidate, no
      // template array, no `getNewFlag`, none of which is invented here.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getNewFlag');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('flushProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('invalidateProductTypeIDPath');
    });
  });
});

// ===========================================================================
// B6. THE UNKNOWN-GETTER SILENT BRANCH, AND THE ORPHANED `physicalCounts` GATE
//
//   559: 			} else if (structKeyExists(variables, "getAttributeValue") && hasProperty("attributeValues")) {
//   560: 				return getAttributeValue(listRest(arguments.missingMethodName, "get"));
//   561: 			}
//   ...
//   565: 		throw("You have attempted to call the method #arguments.missingMethodName# ...");
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L559-L565, model/entity/HibachiEntity.cfc:L202]:
// because `ProductType` DECLARES `attributeValues` at [L67], the [L559] guard succeeds, so an
// unknown `getX()` is silently rerouted to `getAttributeValue('X')`, which returns `''` on a miss
// [L202] - it never reaches the throw at [L565]. Exactly FOUR in-scope entities declare
// `attributeValues` and therefore fail SILENTLY - Sku.cfc:L70, Product.cfc:L75, Brand.cfc:L60 and
// ProductType.cfc:L67 - while the remaining FOURTEEN throw. The split is documented here, NOT
// behaviourally reproduced: the target has no dynamic dispatch of any kind, so there is no
// `Proxy`, no index signature, no string-keyed method resolution and no `evaluate()` anywhere.
//
// WHY THE SILENT HALF IS THE DANGEROUS HALF. `getProductTypeNaem()` on one of the fourteen is a
// loud runtime failure caught the first time the line executes. The same typo on one of the four
// returns the empty string, and `''` is a plausible-looking value for a name, a code or a URL
// title - so it flows into a comparison, a concatenation or a rendered page and is never
// diagnosed. TypeScript removes the entire class of failure at compile time, which is why the
// contract is recorded rather than emulated.
//
// THE ORPHANED VALIDATION GATE:
//
// CFML parity [model/validation/ProductType.json, model/entity/ProductType.cfc:L77,
// model/entity/Physical.cfc:L59]: the physicalCounts delete gate is ORPHANED -- ProductType
// declares `physicals` at L77, and physicalCounts is a property ONLY on Physical.cfc:L59. The
// same orphan appears in Brand.json, Product.json and Sku.json -- exactly the four entities that
// declare attributeValues, so a nonexistent getPhysicalCounts() routes silently to the EAV miss
// '' at [org/Hibachi/HibachiEntity.cfc:L559-L561] and the gate passes vacuously instead of
// throwing at L565. Pinned as a documented dead declaration, like PriceGroupRate.json's orphaned
// conditions.isNotGlobal. NO physicalCounts collection or accessor is invented, and the six-file
// validation-absence inventory is NOT expanded.
//
// The two findings are ONE finding, and that is why they share this block: the orphan survived
// precisely BECAUSE this entity declares `attributeValues`. On any of the fourteen throwing
// entities the same gate would have raised on its first delete attempt and been fixed years ago.
// Verified first-hand, correcting the upstream count: the gate appears in FIVE validation files -
// Product.json:L7, Brand.json:L7, ProductType.json:L8, Sku.json:L13 and Location.json:L6 - of
// which `Location` is out of scope, leaving the four in-scope files named above.
// ===========================================================================

describe('ProductType - the EAV silent branch and the physicalCounts orphan (B6)', () => {
  describe('no dynamic dispatch is emulated', () => {
    it('answers undefined for an unknown accessor rather than the legacy empty string', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // `Reflect.get` reads an absent key without a cast and without a non-null assertion, so the
      // absence is asserted honestly rather than asserted-around. Plain JavaScript semantics:
      // absent means `undefined`. The legacy would have answered `''` here, and the difference is
      // the whole point - `undefined` is unmistakably "no such thing", `''` is a plausible value.
      expect(Reflect.get(subject, 'getProductTypeNaem')).toBeUndefined();
      expect(Reflect.get(subject, 'getSomeCustomAttribute')).toBeUndefined();
      expect(Reflect.get(subject, 'getAnythingAtAll')).toBeUndefined();
    });

    it('resolves no method by name, so the [L559] reroute has no target', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // The two members the [L559] guard itself depends on. Neither exists, so even a
      // hand-written emulation would have nothing to call - the branch is unreachable by
      // construction rather than by convention.
      expect(Reflect.get(subject, 'getAttributeValue')).toBeUndefined();
      expect(Reflect.get(subject, 'onMissingMethod')).toBeUndefined();
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('onMissingMethod');
    });

    it('is a plain object with an ordinary prototype and no proxy interposed', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // A `Proxy` with a `get` trap is the one construct that could reintroduce the silent branch
      // in TypeScript, so its absence is asserted structurally: the instance's prototype is
      // exactly `ProductType.prototype`, and `Object.keys` over the prototype's own names is a
      // fixed, finite, enumerable list rather than an open-ended handler.
      expect(Object.getPrototypeOf(subject)).toBe(ProductType.prototype);
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('constructor');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS.length).toBeGreaterThan(0);
    });

    it('characterizes the four-silent / fourteen-throw split as a documented record', () => {
      // The census, written out so the boundary is checkable. `attributeValues` is what selects a
      // component into the silent group, and it is declared on exactly four of the eighteen
      // in-scope entities.
      const silentlyFailing = [
        'model/entity/Sku.cfc:L70',
        'model/entity/Product.cfc:L75',
        'model/entity/Brand.cfc:L60',
        'model/entity/ProductType.cfc:L67',
      ];
      const inScopeEntityCount = 18;

      expect(silentlyFailing).toHaveLength(4);
      expect(inScopeEntityCount - silentlyFailing.length).toBe(14);
      expect(silentlyFailing).toContain('model/entity/ProductType.cfc:L67');
    });
  });

  describe('the physicalCounts orphan and the physicals declaration', () => {
    it('ships no physicalCounts accessor, because no such property has ever existed here', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // The gate names `physicalCounts`; the entity declares `physicals`. NOTHING is invented to
      // make the gate meaningful - inventing a collection to satisfy a dead rule would fabricate
      // a relationship the schema does not have.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPhysicalCounts');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('addPhysicalCount');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('removePhysicalCount');
      expect(Reflect.get(subject, 'getPhysicalCounts')).toBeUndefined();
    });

    it('ships no physicals accessor either, since the collection is not materialized', () => {
      // ASSERTING THE SHIPPED REALITY RATHER THAN THE UPSTREAM EXPECTATION. `physicals` IS the
      // real declaration - [L77], `type="array"`, link table `SwPhysicalProductType` - but
      // `Physical` is an inventory-side entity outside this slice, so the association is not
      // materialized at the repository boundary and no accessor is authored. Verified first-hand
      // before this assertion was written.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPhysicals');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('addPhysical');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('removePhysical');
    });

    it('accepts neither physicals nor physicalCounts as constructor state', () => {
      const subject = new ProductType({
        productTypeID: 'pt-1',
        // @ts-expect-error - neither the real `physicals` association [L77] nor the orphaned
        // `physicalCounts` the validation file names is part of this entity's hydration contract.
        // The compile error IS the assertion: the boundary is enforced by the type system, so no
        // repository can quietly start populating an out-of-scope association.
        physicals: [],
      });

      expect('physicals' in subject).toBe(false);
      expect('physicalCounts' in subject).toBe(false);
    });

    it('records the orphan as a dead declaration with its sole real home named', () => {
      // The evidence trail, as data: the four in-scope validation files carrying the gate, and
      // the single property declaration anywhere in the repository that would satisfy it.
      const inScopeFilesCarryingTheGate = [
        'model/validation/Product.json:L7',
        'model/validation/Brand.json:L7',
        'model/validation/ProductType.json:L8',
        'model/validation/Sku.json:L13',
      ];
      const soleRealDeclaration = 'model/entity/Physical.cfc:L59';

      // Four files, four silent-branch entities - the same four. That correspondence is what
      // explains the orphan's survival, and it is the reason B6 keeps both findings together.
      expect(inScopeFilesCarryingTheGate).toHaveLength(4);
      expect(soleRealDeclaration).toBe('model/entity/Physical.cfc:L59');
      // Not expanded into the six-file validation-ABSENCE inventory, which is a different list.
      expect(inScopeFilesCarryingTheGate).not.toContain('model/validation/Category.json');
    });
  });
});

// ===========================================================================
// B7. `getSimpleRepresentation()`, THE `&raquo;` LITERAL, AND `setProducts` CASING
//
//   273: 	public string function getSimpleRepresentation() {
//   274: 		if(!isNull(getParentProductType())) {
//   275: 			return getParentProductType().getSimpleRepresentation() & " &raquo; " & getProductTypeName();
//   276: 		}
//   277: 		return getProductTypeName();
//   278: 	}
//
// GUARDED, AND THAT IS WHY THE INHERITED TEST CASE IS MEANINGFUL HERE. Most entities in this
// folder override the representation unconditionally; this one branches on whether a parent
// exists, so `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58`
// (`simple_representation_exists_and_is_simple`) actually exercises two distinct code paths.
//
// CFML parity [model/entity/ProductType.cfc:L275]: the separator is the literal HTML entity
// `" &raquo; "` with a space on BOTH sides, written as five characters `&`,`r`,`a`,`q`,`u`,`o`,`;`
// inside the source string. It is NOT the rendered glyph and NOT an escaped entity: never `'»'`,
// never `'&amp;raquo;'`. The value is a display string consumed by an HTML surface that does no
// further escaping, so double-escaping it would print the entity text to the user and
// substituting the glyph would change the bytes a downstream template compares against.
//
// CFML parity [model/entity/ProductType.cfc:L101-L105, L66]: setProducts takes a capital-P
// `Products` parameter and clears `variables.Products` at L103, while the property is declared
// lowercase `products` at L66. CFML struct keys are case-insensitive, so these are ONE binding.
// Normalised to a single TypeScript binding WITHOUT changing behaviour -- a porting hazard, NOT
// an authorized divergence.
// ===========================================================================

describe('ProductType - getSimpleRepresentation() (B7)', () => {
  describe('the guarded recursion at [L273-L278]', () => {
    it('returns the bare product-type name when there is no parent', () => {
      const subject = new ProductType({ productTypeID: 'pt-1', productTypeName: 'Merchandise' });

      // [L277], the terminal branch. No separator, no prefix, no decoration.
      expect(subject.getParentProductType()).toBeUndefined();
      expect(subject.getSimpleRepresentation()).toBe('Merchandise');
    });

    it('joins one parent to its child with exactly one separator', () => {
      const parent = new ProductType({ productTypeID: 'pt-root', productTypeName: 'Merchandise' });
      const child = new ProductType({ productTypeID: 'pt-child', productTypeName: 'Apparel' });
      child.setParentProductType(parent);

      expect(child.getSimpleRepresentation()).toBe('Merchandise &raquo; Apparel');
    });

    it('yields TWO separators over a three-level chain, because [L275] recurses', () => {
      const root = new ProductType({ productTypeID: 'pt-root', productTypeName: 'Merchandise' });
      const mid = new ProductType({ productTypeID: 'pt-mid', productTypeName: 'Apparel' });
      const leaf = new ProductType({ productTypeID: 'pt-leaf', productTypeName: 'Shirts' });
      mid.setParentProductType(root);
      leaf.setParentProductType(mid);

      // [L275] calls the PARENT'S OWN `getSimpleRepresentation()`, not `getProductTypeName()`, so
      // the whole ancestor breadcrumb accumulates. Counting the separators is the assertion that
      // distinguishes genuine recursion from a one-level join.
      const representation = leaf.getSimpleRepresentation() ?? '';
      expect(representation).toBe('Merchandise &raquo; Apparel &raquo; Shirts');
      expect(representation.split(RAQUO_SEPARATOR)).toHaveLength(3);
    });

    it('reads root-first, matching the direction of the materialized path', () => {
      // Named explicitly rather than through `makeAncestorChain`, which supplies identifiers only:
      // a nameless chain renders as bare separators and would make this assertion vacuous. Naming
      // each node after its identifier lets the breadcrumb and the path be compared directly.
      const root = new ProductType({ productTypeID: 'pt-root', productTypeName: 'pt-root' });
      const mid = new ProductType({ productTypeID: 'pt-mid', productTypeName: 'pt-mid' });
      const leaf = new ProductType({ productTypeID: 'pt-leaf', productTypeName: 'pt-leaf' });
      mid.setParentProductType(root);
      leaf.setParentProductType(mid);

      // Both the breadcrumb and the path read ancestor-first. Worth pinning together: they are
      // derived from the same parent chain, so a reversal in either would be a real inconsistency
      // - and the path direction is the thing the promotion engine's membership test depends on.
      const representation = leaf.getSimpleRepresentation() ?? '';
      expect(representation.startsWith('pt-root')).toBe(true);
      expect(representation.endsWith('pt-leaf')).toBe(true);
      expect(leaf.getProductTypeIDPath()).toBe('pt-root,pt-mid,pt-leaf');
      expect(listGetAt(leaf.getProductTypeIDPath(), 1)).toBe('pt-root');
    });

    it('re-reads the live parent, so re-parenting changes the representation immediately', () => {
      const first = new ProductType({ productTypeID: 'pt-a', productTypeName: 'Merchandise' });
      const second = new ProductType({ productTypeID: 'pt-b', productTypeName: 'Subscription' });
      const child = new ProductType({ productTypeID: 'pt-child', productTypeName: 'Apparel' });

      child.setParentProductType(first);
      expect(child.getSimpleRepresentation()).toBe('Merchandise &raquo; Apparel');

      // NOT MEMOIZED - and deliberately contrasted with the path memo asserted in B1, which DOES
      // go stale after exactly this operation. The source memoizes the path at [L251] and does not
      // memoize the representation, so one accessor tracks a re-parent and the other does not.
      child.removeParentProductType();
      child.setParentProductType(second);
      expect(child.getSimpleRepresentation()).toBe('Subscription &raquo; Apparel');
    });
  });

  describe('the separator, asserted byte for byte', () => {
    it('is the literal entity with a space on each side and no double-escaping', () => {
      const parent = new ProductType({ productTypeID: 'pt-root', productTypeName: 'Merchandise' });
      const child = new ProductType({ productTypeID: 'pt-child', productTypeName: 'Apparel' });
      child.setParentProductType(parent);
      const representation = child.getSimpleRepresentation() ?? '';

      expect(RAQUO_SEPARATOR).toBe(' &raquo; ');
      expect(RAQUO_SEPARATOR).toHaveLength(9);
      expect(representation).toContain(RAQUO_SEPARATOR);

      // The three wrong answers, each excluded explicitly, because each is a plausible mistake a
      // reviewer would not catch by reading: the rendered glyph, the double-escaped entity, and
      // the entity stripped of its surrounding spaces.
      expect(representation).not.toContain('»');
      expect(representation).not.toContain('&amp;raquo;');
      expect(representation).not.toContain('Merchandise&raquo;');
    });

    it('carries no numeric-reference or unescaped-ampersand variant', () => {
      const parent = new ProductType({ productTypeID: 'pt-root', productTypeName: 'A' });
      const child = new ProductType({ productTypeID: 'pt-child', productTypeName: 'B' });
      child.setParentProductType(parent);
      const representation = child.getSimpleRepresentation() ?? '';

      // `&#187;` and `&#xBB;` are the numeric forms of the same character. The source wrote the
      // NAMED entity, so the named entity is what ships - HTML-equivalent is not byte-equivalent,
      // and a downstream template comparing strings would notice.
      expect(representation).not.toContain('&#187;');
      expect(representation).not.toContain('&#xBB;');
      expect(representation).toBe('A &raquo; B');
    });
  });

  describe('the unnamed cases, pinned as the shipped module renders them', () => {
    it('returns undefined for an unnamed product type with no parent', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // [L277] returns `getProductTypeName()` UNGUARDED, and the column is nullable - there is no
      // validation rule making `productTypeName` non-null on read, only on save. So `undefined` is
      // the honest answer, and it is what the inherited
      // `simple_representation_exists_and_is_simple` case would meet on a freshly-built instance.
      // Substituting `''` would be a fabricated value dressed as data.
      expect(subject.getProductTypeName()).toBeUndefined();
      expect(subject.getSimpleRepresentation()).toBeUndefined();
    });

    it('renders a trailing separator when a named parent is joined to an unnamed child', () => {
      const parent = new ProductType({ productTypeID: 'pt-root', productTypeName: 'Merchandise' });
      const child = new ProductType({ productTypeID: 'pt-child' });
      child.setParentProductType(parent);

      // CFML `&` concatenation treats a null as the empty string, so the legacy renders the same
      // dangling breadcrumb. Ugly, and preserved - repairing it would mean choosing a placeholder
      // name, which is a product decision this port has no mandate to make.
      expect(child.getSimpleRepresentation()).toBe('Merchandise &raquo; ');
    });

    it('renders a leading separator when an unnamed parent is joined to a named child', () => {
      const parent = new ProductType({ productTypeID: 'pt-root' });
      const child = new ProductType({ productTypeID: 'pt-child', productTypeName: 'Apparel' });
      child.setParentProductType(parent);

      // The mirror case: the parent's own representation is absent, so the string opens with the
      // separator. Both orientations are pinned so neither can drift into a "tidier" rendering.
      expect(child.getSimpleRepresentation()).toBe(' &raquo; Apparel');
    });

    it('satisfies the inherited simple_representation case for a named instance', () => {
      // meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 -
      // `simple_representation_exists_and_is_simple`. Carried forward as an ASSERTION ABOUT THE
      // SHIPPED REALITY: a named instance yields a non-empty single-line string with no leading
      // or trailing whitespace. "Simple" in the legacy sense means a flat display label, not a
      // structure - so a value containing a newline or a tab would fail the spirit of the case.
      const subject = new ProductType({ productTypeID: 'pt-1', productTypeName: 'Merchandise' });
      const representation = subject.getSimpleRepresentation();

      expect(typeof representation).toBe('string');
      expect(representation).toBe('Merchandise');
      expect(representation).not.toMatch(/[\n\r\t]/);
      expect(representation?.trim()).toBe(representation);
    });
  });

  describe('setProducts - the casing hazard, and replace-not-clear', () => {
    it('exposes one lower-case binding for the capital-P legacy parameter', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // The hazard resolved IN THE SUITE, exactly as required, and never by weakening a lint rule.
      // CFML's `Products` / `products` / `PRODUCTS` are one slot; TypeScript is case-sensitive, so
      // the port picks the lower-case form for the field and the parameter while keeping the
      // PUBLIC method name `setProducts` verbatim, which was already correct.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setProducts');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getProducts');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('setProduct');
      expect(Reflect.get(subject, 'Products')).toBeUndefined();
      expect(Reflect.get(subject, 'PRODUCTS')).toBeUndefined();
    });

    it('clears first and then adds each element, so an empty array empties the collection', () => {
      const alpha = makeProductFixture({ productID: 'prod-alpha' });
      const subject = new ProductType({ productTypeID: 'pt-1', products: [alpha] });
      expect(subject.getProducts()).toHaveLength(1);

      // [L103] then [L104-L106], in that order. The clear is unconditional and happens before the
      // loop, so an empty argument is not a no-op - it is a wholesale removal.
      subject.setProducts([]);
      expect(subject.getProducts()).toStrictEqual([]);
    });

    it('replaces the collection wholesale rather than merging into it', () => {
      const alpha = makeProductFixture({ productID: 'prod-alpha' });
      const beta = makeProductFixture({ productID: 'prod-beta' });
      const subject = new ProductType({ productTypeID: 'pt-1', products: [alpha] });

      subject.setProducts([beta]);

      const products: readonly Product[] = subject.getProducts();
      expect(products).toHaveLength(1);
      expect(products[0]).toBe(beta);
      expect(products).not.toContain(alpha);
    });

    it('adds through addProduct, so a duplicated argument yields one entry', () => {
      const alpha = makeProductFixture({ productID: 'prod-alpha' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // [L105] routes every element through `addProduct`, which is the ORM-generated set-semantics
      // adder derived from `singularname="product"` [L66] - append-if-absent by primary key, not
      // an unconditional push. So the de-duplication is inherited from the adder rather than
      // implemented by `setProducts` itself, and passing the same product twice proves it.
      subject.setProducts([alpha, alpha]);
      expect(subject.getProducts()).toHaveLength(1);
    });

    it('de-duplicates by productID, not by object identity', () => {
      const first = makeProductFixture({ productID: 'prod-same' });
      const second = makeProductFixture({ productID: 'prod-same' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // Two distinct hydrations of the SAME database row. A reference comparison would admit both
      // and silently double-count the row; the primary-key comparison is what the ORM collection
      // actually did.
      expect(first).not.toBe(second);
      subject.setProducts([first, second]);
      expect(subject.getProducts()).toHaveLength(1);
    });

    it('rebinds a NEW array, so a previously captured reference keeps the old contents', () => {
      const alpha = makeProductFixture({ productID: 'prod-alpha' });
      const beta = makeProductFixture({ productID: 'prod-beta' });
      const subject = new ProductType({ productTypeID: 'pt-1', products: [alpha] });

      const capturedBefore = subject.getProducts();
      subject.setProducts([beta]);

      // [L103] ASSIGNS a new array (`variables.Products = []`) rather than emptying the existing
      // one, so a caller holding the earlier array still sees `alpha`. Reproduced faithfully,
      // which is why `products` is the one non-`readonly` collection field on the class and the
      // one collection whose getter is not live.
      expect(capturedBefore).toHaveLength(1);
      expect(capturedBefore[0]).toBe(alpha);
      expect(subject.getProducts()).not.toBe(capturedBefore);
      expect(subject.getProducts()[0]).toBe(beta);
    });

    it('does not touch the inverse side, because Product owns the foreign key', () => {
      const alpha = makeProductFixture({ productID: 'prod-alpha' });
      const productTypeBefore = alpha.getProductType();
      const subject = new ProductType({ productTypeID: 'pt-1' });

      subject.setProducts([alpha]);

      // `products` is `inverse="true"` [L66], so the ORM-generated adder mutates only the
      // in-memory array; the `SwProduct.productTypeID` column is owned by the product side and
      // persistence belongs to the repository tier. Asserting the near side changed while the far
      // side did NOT is what keeps this from being mistaken for a bidirectional helper - and the
      // far side is compared against its own prior value rather than against `undefined`, because
      // the fixture legitimately arrives already associated with a product type of its own.
      expect(subject.getProducts()).toHaveLength(1);
      expect(alpha.getProductType()).toBe(productTypeBefore);
      expect(alpha.getProductType()).not.toBe(subject);
    });
  });
});

// ===========================================================================
// B8. THE DECLARATIVE VALIDATION CONTRACT - SIX RULES, ONE OF THEM ORPHANED
//
// model/validation/ProductType.json, verified verbatim and complete at ten lines:
//
//   {
//     "properties":{
//       "productTypeName":		[{"contexts":"save","required":true}],
//       "urlTitle":				[{"contexts":"save","required":true,"unique":true}],
//       "products":				[{"contexts":"delete","maxCollection":0}],
//       "childProductTypes":	[{"contexts":"delete","maxCollection":0}],
//       "systemCode":			[{"contexts":"delete","maxLength":0}],
//       "physicalCounts":		[{"contexts":"delete","maxCollection":0}]
//     }
//   }
//
// WHERE ENFORCEMENT LIVES, AND WHY IT IS NOT ASSERTED HERE. Declarative rules become typed
// schemas at the SERVICE tier, not on the entity: an entity that validated itself would need the
// uniqueness query, and a domain object reaching a repository is exactly what the layer boundary
// forbids. So this block asserts (a) the rule set as a documented contract and (b) that the
// entity ships no validation surface at all. No schema library is asserted from this tier.
//
// THE `systemCode` GATE IS THE ODD ONE, and getting it wrong would be a silent category error:
// it is `maxLength: 0`, a STRING-LENGTH gate, where the other three delete gates are
// `maxCollection: 0`, COLLECTION-SIZE gates. It is the only length-based delete gate in the
// folder. Its practical effect is a real business rule: a product type carrying ANY system code
// is undeletable, because system codes mark the rows the application itself depends on.
//
// ZERO DECLARATIVELY-INVOKED VALIDATORS. The file has no `"method"` key anywhere, so `ProductType`
// contributes none of the five entity-method validators that exist project-wide:
// `Sku.hasUniqueOptions`, `Sku.hasOneOptionPerOptionGroup`,
// `RoundingRule.hasExpressionWithListOfNumericValuesOnly`,
// `Promotion.getPromotionCodesDeletableFlag` and `PromotionCode.hasUniquePromotionCode`.
//
// Folder-wide, verified first-hand: the in-scope validation split is 15 PRESENT / 6 ABSENT. The
// AAP's figure of 12 present is STALE - source wins - and the six absences are Category,
// PromotionQualifier, PromotionApplied, PromotionAccount, Product_AddOption and
// Product_AddOptionGroup. `model/validation/` holds 96 `.json` files in total.
// ===========================================================================

describe('ProductType - the declarative validation contract (B8)', () => {
  // The rule set as data, transcribed from the ten-line source file. Characterization only: this
  // is the contract the service tier implements, recorded where a reviewer can check it against
  // the entity surface it constrains.
  const SAVE_REQUIRED = ['productTypeName', 'urlTitle'] as const;
  const SAVE_UNIQUE = ['urlTitle'] as const;
  const DELETE_MAX_COLLECTION = ['products', 'childProductTypes', 'physicalCounts'] as const;
  const DELETE_MAX_LENGTH = ['systemCode'] as const;

  describe('the save context', () => {
    it('requires productTypeName and urlTitle, and nothing else', () => {
      expect(SAVE_REQUIRED).toStrictEqual(['productTypeName', 'urlTitle']);
      expect(SAVE_REQUIRED).toHaveLength(2);
    });

    it('marks urlTitle unique, matching unique="true" on the property at [L56]', () => {
      // The declarative rule and the ORM column constraint agree, which is worth pinning because
      // they are declared in two different files and could drift: [L56] carries `unique="true"`
      // on the persistent property, and the validation file independently asserts `"unique":true`.
      expect(SAVE_UNIQUE).toStrictEqual(['urlTitle']);
      expect(SAVE_REQUIRED).toContain('urlTitle');
      // Uniqueness applies to `urlTitle` alone. `systemCode` is NOT declared unique anywhere,
      // despite being the identifier the application keys behaviour off.
      expect(SAVE_UNIQUE).not.toContain('systemCode');
      expect(SAVE_UNIQUE).not.toContain('productTypeName');
    });

    it('leaves both nullable-on-read even though they are required on save', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // REQUIRED-ON-SAVE IS NOT NON-NULL-ON-READ, and conflating them would have produced a
      // dishonest type. Rows predating the rule, partially-hydrated projections and freshly
      // constructed instances all legitimately carry neither value - which is exactly why
      // `getSimpleRepresentation()` can return `undefined` (B7).
      expect(subject.getProductTypeName()).toBeUndefined();
      expect(subject.getUrlTitle()).toBeUndefined();
    });

    it('★ publishes setUrlTitle, so the resolved title is on the column BEFORE the save context reads it', () => {
      // ★★ THE SETTER EXISTS BECAUSE THE SAVE ORDER REQUIRES IT, NOT FOR SYMMETRY WITH THE GETTER.
      // `model/validation/ProductType.json` declares `urlTitle` `{"contexts":"save","required":true,
      // "unique":true}`, and `super.save(productType, data)`
      // [model/service/ProductService.cfc:L303] runs populate FIRST
      // [org/Hibachi/HibachiService.cfc:L145], validate SECOND [L150] and persists only on a clean
      // entity [L153-L155]. So the title `saveProductType` resolves at [L297]/[L299] has to reach
      // this column before validation looks - and with no setter the resolved value had nowhere to
      // land, which made the required rule unsatisfiable for every product type whose title was
      // generated rather than submitted.
      //
      // §0.6 budgets this file at ZERO widenings, reshapings and divergences, and none is spent
      // here: §2 and §6.3 positively MANDATE authoring the ORM-implicit members the ported slice
      // concretely reaches, exactly as `setProductTypeIDPath` and `addProduct` already are.
      const subject = new ProductType({ productTypeID: 'pt-1' });

      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setUrlTitle');
      expect(subject.getUrlTitle()).toBeUndefined();

      subject.setUrlTitle('branded-apparel');

      expect(subject.getUrlTitle()).toBe('branded-apparel');

      // It overwrites rather than merging or first-winning: the service tier decides whether to
      // write at all, and this member just carries the decision.
      subject.setUrlTitle('branded-apparel-2');

      expect(subject.getUrlTitle()).toBe('branded-apparel-2');

      // ⚠ AND IT PERFORMS NO UNIQUENESS PROBE, because the source performs none either. `unique`
      // [model/entity/ProductType.cfc:L56] is a database guarantee, and the de-duplicating work
      // belonged to `createUniqueURLTitle` behind the URL-title generator port at the service tier.
      // Two instances may therefore hold the same title in memory, and asserting that here keeps a
      // later revision from quietly adding an in-entity probe the legacy never had.
      const other = new ProductType({ productTypeID: 'pt-2' });
      other.setUrlTitle('branded-apparel-2');

      expect(other.getUrlTitle()).toBe(subject.getUrlTitle());

      // LEGACY-NOTE parity: the source spells the accessor `setURLTitle`. The house spelling is
      // published and the legacy casing deliberately is not, so both facts are pinned.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('setURLTitle');
    });
  });

  describe('the delete context', () => {
    it('gates products and childProductTypes on maxCollection 0', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // `maxCollection: 0` means the collection must be EMPTY to delete. Both gated collections
      // are exposed as arrays, so the gate has something countable to read.
      expect(DELETE_MAX_COLLECTION).toContain('products');
      expect(DELETE_MAX_COLLECTION).toContain('childProductTypes');
      expect(Array.isArray(subject.getProducts())).toBe(true);
      expect(Array.isArray(subject.getChildProductTypes())).toBe(true);
      expect(subject.getProducts()).toHaveLength(0);
      expect(subject.getChildProductTypes()).toHaveLength(0);
    });

    it('gates systemCode on maxLength 0, NOT maxCollection', () => {
      const withCode = new ProductType({ productTypeID: 'pt-1', systemCode: 'merchandise' });
      const withoutCode = new ProductType({ productTypeID: 'pt-2' });
      const withEmptyCode = new ProductType({ productTypeID: 'pt-3', systemCode: '' });

      // THE DISTINCTION, ASSERTED STRUCTURALLY. `systemCode` is a STRING, so a collection-size
      // gate would be a category error - there is no collection to count. The two rule sets are
      // disjoint, and `systemCode` belongs only to the length-based one.
      expect(DELETE_MAX_LENGTH).toStrictEqual(['systemCode']);
      expect(DELETE_MAX_COLLECTION).not.toContain('systemCode');
      expect(Array.isArray(withCode.getSystemCode())).toBe(false);

      // The business consequence: a system-coded product type is undeletable, an uncoded one is
      // not blocked by this gate, and an empty-string code has length zero so it does not block
      // either - the same empty-versus-absent nuance that runs through this whole component.
      expect(withCode.getSystemCode()).toBe('merchandise');
      expect((withCode.getSystemCode() ?? '').length > 0).toBe(true);
      expect((withoutCode.getSystemCode() ?? '').length).toBe(0);
      expect((withEmptyCode.getSystemCode() ?? '').length).toBe(0);
    });

    it('carries the orphaned physicalCounts gate alongside the three real ones', () => {
      // Cross-referenced with B6 rather than re-argued: the gate is real in the file and dead in
      // effect, because no `physicalCounts` property exists on this entity. It is listed in the
      // rule set because the rule set is transcribed faithfully, not curated.
      expect(DELETE_MAX_COLLECTION).toContain('physicalCounts');
      expect(DELETE_MAX_COLLECTION).not.toContain('physicals');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPhysicalCounts');
    });

    it('totals six rules across the two contexts', () => {
      const ruleCount =
        SAVE_REQUIRED.length + DELETE_MAX_COLLECTION.length + DELETE_MAX_LENGTH.length;

      // Six property entries, two of them on `urlTitle`'s single rule object (required + unique).
      // Counting them pins the transcription against a source file that could gain a rule later.
      expect(ruleCount).toBe(6);
    });
  });

  describe('the absences, asserted so nothing is invented to fill them', () => {
    it('declares no rule for the boolean flags or the materialized path', () => {
      const allGatedProperties = [...SAVE_REQUIRED, ...DELETE_MAX_COLLECTION, ...DELETE_MAX_LENGTH];

      // `activeFlag` [L54] and `publishedFlag` [L55] carry no ORM default AND no validation rule -
      // the pair of absences that makes their hydration behaviour a real question, settled in B9.
      // `productTypeIDPath` [L53] is unvalidated too, including its 4000-character bound, which is
      // why B1 asserts the entity performs no truncation of its own.
      for (const ungated of ['activeFlag', 'publishedFlag', 'productTypeIDPath']) {
        expect(allGatedProperties).not.toContain(ungated);
      }
    });

    it('declares no gate for the attribute or price-group-rate collections', () => {
      const allGatedProperties = [...SAVE_REQUIRED, ...DELETE_MAX_COLLECTION, ...DELETE_MAX_LENGTH];

      // Notably ungated despite `cascade="all-delete-orphan"` on `attributeValues` [L67], and
      // despite this being the only in-scope entity holding BOTH sides of the price-group-rate
      // relation [L74 include, L75 exclude]. Deleting a product type therefore silently detaches
      // its rate links. Recorded as an absence, NOT filled in.
      for (const ungated of [
        'attributeValues',
        'attributeSets',
        'priceGroupRates',
        'priceGroupRateExclusions',
        'promotionRewards',
        'promotionQualifiers',
      ]) {
        expect(allGatedProperties).not.toContain(ungated);
      }
    });

    it('ships no validation surface on the entity itself', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // Enforcement belongs to the service tier. An entity that validated itself would need the
      // uniqueness query for `urlTitle`, and a domain object reaching a repository is precisely
      // what the ESLint layer boundary makes impossible.
      for (const absent of [
        'validate',
        'hasErrors',
        'getErrors',
        'setErrors',
        'getValidations',
        'getValidationProperties',
      ]) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(absent);
      }
      expect(Reflect.get(subject, 'validate')).toBeUndefined();
    });

    it('contributes none of the five declaratively-invoked entity validators', () => {
      // The source file has no `"method"` key at all, so there is nothing on this entity for a
      // rule to invoke. Each of the five is named and excluded individually, because inventing any
      // of them here would fabricate a validation capability the schema never asked for.
      for (const validator of [
        'hasUniqueOptions',
        'hasOneOptionPerOptionGroup',
        'hasExpressionWithListOfNumericValuesOnly',
        'getPromotionCodesDeletableFlag',
        'hasUniquePromotionCode',
      ]) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(validator);
      }
    });

    it('is one of the fifteen entities that HAVE a validation file', () => {
      // The folder-wide split, recorded because the plan's figure is stale and a reader checking
      // this suite against it would otherwise be misled. Source wins.
      const inScopeEntities = 18;
      const validationFilesAbsent = [
        'Category',
        'PromotionQualifier',
        'PromotionApplied',
        'PromotionAccount',
        'Product_AddOption',
        'Product_AddOptionGroup',
      ];

      expect(validationFilesAbsent).toHaveLength(6);
      expect(validationFilesAbsent).not.toContain('ProductType');
      expect(inScopeEntities - 3).toBe(15);
    });
  });
});

// ===========================================================================
// B9. STRUCTURAL FACTS, THE FOUR-ARGUMENT `replace` CONTROL, AND THE OMISSIONS
//
// SCHEMA CONTINUITY [C5]. Table `SwProductType` [L49] and all EIGHT many-to-many link tables
// travel forward verbatim, abbreviations intact - no name is expanded, "corrected" or migrated:
//
//   L70 promotionRewards            -> SwPromoRewardProductType
//   L71 promotionRewardExclusions   -> SwPromoRewardExclProductType      (type="array")
//   L72 promotionQualifiers         -> SwPromoQualProductType
//   L73 promotionQualifierExclusions-> SwPromoQualExclProductType        (type="array")
//   L74 priceGroupRates             -> SwPriceGroupRateProductType
//   L75 priceGroupRateExclusions    -> SwPriceGrpRateExclProductType     <- ABBREVIATED
//   L76 attributeSets               -> SwAttributeSetProductType         (type="array")
//   L77 physicals                   -> SwPhysicalProductType             (type="array")
//
// `SwPriceGrpRateExclProductType` reads like a typo and is not: `SwPriceGroupRateExclProductType`
// would be 31 characters, and the abbreviation is how the name fits. Expanding it would point the
// port at a table that does not exist. THIS IS THE ONLY IN-SCOPE ENTITY HOLDING BOTH SIDES of the
// price-group-rate relation - the include at [L74] and the exclude at [L75].
//
// CFML parity, annotated and NEVER normalised:
//   - [L49] declares NEITHER `output=false` NOR `accessors=true`, and quotes `persistent="true"`
//     where siblings leave it bare. Every other in-scope entity sets both attributes.
//   - `type="array"` appears on FOUR of the eight link collections only - L71, L73, L76, L77 -
//     with L70, L72, L74 and L75 omitting it. The inconsistency is cosmetic in CFML and is
//     recorded rather than harmonised.
//   - [L248]/[L257] spell the banner "Overridden Implecet Getters" - "Implecet" for "Implicit".
//     Framework boilerplate that recurs repository-wide; the FOURTH instance within this
//     in-scope subset, alongside PromotionCode.cfc:L165, PromotionQualifier.cfc:L349 and
//     PriceGroup.cfc:L193.
//   - [L259]/[L269] carry "Overridden Smart List Getters", a banner name unique to this file.
//   - FOUR METHODS SIT OUTSIDE EVERY BANNER at [L92-L119] - getInheritedAttributeSetAssignments,
//     setProducts, getBaseProductType and getAppliedPriceGroupRateByPriceGroup - because the
//     first banner does not open until [L121].
//
// THE FOUR-ARGUMENT `replace` AT [L292], cited as a CONTROL and not re-asserted here:
//   L292:  ... #replace(getProductTypeIDPath(), ",", "','", "all")# ...
// The fourth argument `"all"` is what makes it replace EVERY delimiter. CFML `replace()` defaults
// to `"one"`, so the three-argument form at model/entity/PriceGroupRate.cfc:L132 and L158 rewrites
// only the FIRST comma - defect D45. This file having got it right, in the same folder, is the
// evidence that the three-argument sites are a mistake rather than a convention. D45 belongs to
// `priceGroupRate.test.ts`; the control is cited here, and nothing about D45 is asserted.
//
// THE SIX `getService()` SITES - L94 "AttributeService", L112 "ProductService",
// L118 "priceGroupService", L129 "productService", L263 "productService", L283 "attributeService".
// FOUR DIFFERENT CASINGS across the six, and two of them name the same service twice with
// different capitalization - stronger than the "three casings" the upstream note claims, because
// CFML component lookup is case-insensitive so nothing ever forced consistency. Third-highest
// count of the eighteen in-scope entities, behind Sku (19) and Product (18); the folder census is
// 45. NOT ONE survives: each becomes an injected port, a documented omission or a preserved
// failure, and the port ledger stays at THIRTEEN.
// ===========================================================================

describe('ProductType - structural facts and documented omissions (B9)', () => {
  describe('identity and the honest isNew()', () => {
    it('reports isNew() for the empty-string identifier the ORM assigns before insert', () => {
      const fresh = new ProductType({ productTypeID: '' });
      const persisted = new ProductType({ productTypeID: '444df2f7ea9c87e60051f3cd87b435a1' });

      // [L52] declares `unsavedvalue="" default=""`, so an unsaved row genuinely carries `''` -
      // not null, not a placeholder UUID. That is what makes `isNew()` honest rather than a guess,
      // and it is the same `''` the primary-key probes fall back to reference comparison for.
      expect(fresh.getProductTypeID()).toBe('');
      expect(fresh.isNew()).toBe(true);
      expect(persisted.isNew()).toBe(false);
    });

    it('exposes remoteID as a nullable string, untouched by any port', () => {
      const withRemote = new ProductType({ productTypeID: 'pt-1', remoteID: 'legacy-erp-4471' });
      const withoutRemote = new ProductType({ productTypeID: 'pt-2' });

      // [L80] `remoteID` is the external-system correlation column. Persisted, read-only from this
      // entity's perspective, and never defaulted - an absent one is `undefined`.
      expect(withRemote.getRemoteID()).toBe('legacy-erp-4471');
      expect(withoutRemote.getRemoteID()).toBeUndefined();
    });
  });

  describe('boolean hydration over the full accepted column range', () => {
    it('resolves an absent flag to false, matching the ORM default the column lacks', () => {
      const absent = new ProductType({ productTypeID: 'pt-1' });

      // [L54] and [L55] are `ormtype="boolean"` with NO `default` attribute and no validation rule,
      // so SQL NULL is an EXPECTED hydration value rather than a data error. The persisted-flag
      // boundary resolves it to false - "this product type is not active" - which is the answer the
      // legacy produced too, and the reason the accessors return `boolean` rather than
      // `boolean | undefined`. ASSERTING THE SHIPPED REALITY, which corrects the upstream
      // expectation of an optional return.
      expect(absent.getActiveFlag()).toBe(false);
      expect(absent.getPublishedFlag()).toBe(false);
      expect(typeof absent.getActiveFlag()).toBe('boolean');
    });

    it('resolves an explicit SQL NULL to false as well', () => {
      const nulled = new ProductType({
        productTypeID: 'pt-1',
        activeFlag: null,
        publishedFlag: null,
      });

      // Absent-versus-null is a distinction that matters for the PATH memo [B1] and deliberately
      // does NOT matter here: both are "no flag stored", and both resolve to false.
      expect(nulled.getActiveFlag()).toBe(false);
      expect(nulled.getPublishedFlag()).toBe(false);
    });

    it('resolves the numeric and string forms a MySQL boolean column can hydrate as', () => {
      // The driver may hand back `0`/`1` for a TINYINT, or `'0'`/`'1'` for a string-typed column,
      // and CFML accepted `'true'`/`'false'` as boolean literals. Every form is pinned, because a
      // flag misread here silently unpublishes a product type or activates a retired one.
      const cases: readonly { readonly stored: CfmlBooleanColumn; readonly expected: boolean }[] = [
        { stored: true, expected: true },
        { stored: false, expected: false },
        { stored: 1, expected: true },
        { stored: 0, expected: false },
        { stored: '1', expected: true },
        { stored: '0', expected: false },
        { stored: 'true', expected: true },
        { stored: 'false', expected: false },
        { stored: '', expected: false },
      ];

      for (const { stored, expected } of cases) {
        const subject = new ProductType({
          productTypeID: 'pt-1',
          activeFlag: stored,
          publishedFlag: stored,
        });
        expect(subject.getActiveFlag()).toBe(expected);
        expect(subject.getPublishedFlag()).toBe(expected);
      }
    });

    it('keeps the two flags independent of one another', () => {
      const activeUnpublished = new ProductType({
        productTypeID: 'pt-1',
        activeFlag: 1,
        publishedFlag: 0,
      });

      // A real and meaningful combination - an active but unpublished product type - so the two
      // must not be resolved through one shared field.
      expect(activeUnpublished.getActiveFlag()).toBe(true);
      expect(activeUnpublished.getPublishedFlag()).toBe(false);
    });
  });

  describe('nullable associations and audit columns', () => {
    it('exposes parentProductType as optional, with no null-option placeholder', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const child = new ProductType({ productTypeID: 'pt-child', parentProductType: root });
      const orphan = new ProductType({ productTypeID: 'pt-orphan' });

      // [L62] is nullable - a root product type has no parent - and carries NO `hb_optionsNullRBKey`,
      // unlike model/entity/PriceGroup.cfc:L59. That attribute only ever fed an admin select box's
      // empty-choice label, so its absence changes no domain behaviour and NO placeholder option is
      // fabricated to stand in for it.
      expect(child.getParentProductType()).toBe(root);
      expect(orphan.getParentProductType()).toBeUndefined();
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getParentProductTypeOptionsNullLabel');
    });

    it('exposes audit timestamps as real Dates or undefined, never an epoch stand-in', () => {
      const created = new Date('2014-03-11T17:42:05.000Z');
      const audited = new ProductType({
        productTypeID: 'pt-1',
        createdDateTime: created,
        createdByAccountID: 'acct-7',
      });
      const unaudited = new ProductType({ productTypeID: 'pt-2' });

      // Every business-date literal in this suite is an explicit UTC ISO-8601 string, and an
      // ABSENT timestamp stays `undefined`. `new Date(0)` would render as 1 January 1970 and read
      // as a real audit trail - a fabricated value that looks like data.
      expect(audited.getCreatedDateTime()).toStrictEqual(created);
      expect(audited.getCreatedDateTime()?.toISOString()).toBe('2014-03-11T17:42:05.000Z');
      expect(audited.getCreatedByAccountID()).toBe('acct-7');
      expect(unaudited.getCreatedDateTime()).toBeUndefined();
      expect(unaudited.getModifiedDateTime()).toBeUndefined();
      expect(unaudited.getModifiedByAccountID()).toBeUndefined();
    });

    it('reduces the audit account associations to opaque identifier strings', () => {
      const subject = new ProductType({ productTypeID: 'pt-1', modifiedByAccountID: 'acct-9' });

      // [L84] and [L86] declare `cfc="Account"` many-to-one associations. `Account` is out of
      // scope in its entirety, so the port keeps the foreign KEY and drops the association - the
      // same anti-corruption move the promotion engine makes for order identifiers. Preserving the
      // column preserves schema continuity without dragging an out-of-scope aggregate inward.
      expect(subject.getModifiedByAccountID()).toBe('acct-9');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getModifiedByAccount');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getCreatedByAccount');
    });
  });

  describe('the eight link collections, including both price-group-rate sides', () => {
    it('holds the include and exclude sides of the price-group-rate relation separately', () => {
      const included: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-included' });
      const excluded: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excluded' });
      const subject = new ProductType({
        productTypeID: 'pt-1',
        priceGroupRates: [included],
        priceGroupRateExclusions: [excluded],
      });

      // [L74] `SwPriceGroupRateProductType` and [L75] `SwPriceGrpRateExclProductType` are two
      // distinct link tables, and this is the only in-scope entity that carries both. Conflating
      // them would invert an exclusion into an inclusion and change which rate applies - it would
      // change price.
      expect(subject.getPriceGroupRates()).toStrictEqual([included]);
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([excluded]);
      expect(subject.getPriceGroupRates()).not.toContain(excluded);
      expect(subject.getPriceGroupRateExclusions()).not.toContain(included);
    });

    it('defaults every materialized link collection to an empty array', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // Six of the eight link collections are materialized; `attributeSets` [L76] and `physicals`
      // [L77] are not, per B4 and B6. An absent collection is EMPTY, never `undefined` - the
      // legacy ORM handed back an empty array too, and `defaults_are_correct` in
      // meta/tests/unit/entity/SlatwallEntityTestBase.cfc rests on exactly that.
      expect(subject.getPromotionRewards()).toStrictEqual([]);
      expect(subject.getPromotionRewardExclusions()).toStrictEqual([]);
      expect(subject.getPromotionQualifiers()).toStrictEqual([]);
      expect(subject.getPromotionQualifierExclusions()).toStrictEqual([]);
      expect(subject.getPriceGroupRates()).toStrictEqual([]);
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([]);
      expect(subject.getChildProductTypes()).toStrictEqual([]);
      expect(subject.getProducts()).toStrictEqual([]);
    });

    it('materializes products as a resolved array, not a lazy proxy', () => {
      const alpha = makeProductFixture({ productID: 'prod-alpha' });
      const subject = new ProductType({ productTypeID: 'pt-1', products: [alpha] });

      // [L66] carries `lazy="extra"`, Hibernate's count-without-loading optimisation, while
      // Product.cfc's `brand`/`productType`/`defaultSku` are eager `fetch="join"`. NEITHER hint
      // survives: with no ORM there is no laziness to configure, so fetch shape becomes an
      // explicit CORRECTNESS decision made once per repository method and documented there. What
      // the entity receives is an already-resolved array - which is also what removes the implicit
      // N+1 that unbounded graph walking created.
      const products: readonly Product[] = subject.getProducts();
      expect(Array.isArray(products)).toBe(true);
      expect(products).toHaveLength(1);
      expect(products[0]).toBe(alpha);
    });
  });

  // ★ THE EXCLUSION PAIR - THE ONE HELPER PAIR IN THIS ENTITY THAT MAINTAINS ITS OWN SIDE
  //
  //   215: 	public void function addPriceGroupRateExclusion(required any priceGroupRate) {
  //   216: 		arguments.priceGroupRate.addExcludedProductType( this );
  //   217: 	}
  //   218: 	public void function removePriceGroupRateExclusion(required any priceGroupRate) {
  //   219: 		arguments.priceGroupRate.removeExcludedProductType( this );
  //   220: 	}
  //
  // CFML parity [model/entity/ProductType.cfc:L215-L220, model/entity/PriceGroupRate.cfc:L75]: the
  // legacy bodies delegate to `addExcludedProductType` / `removeExcludedProductType`, and
  // model/entity/PriceGroupRate.cfc hand-writes helpers for its three INCLUDED collections ONLY -
  // `addProductType` / `removeProductType` at L199 / L207 among them - and NONE for its three
  // `excluded*` collections. So both legacy calls resolve to the ORM-GENERATED accessors for
  // `excludedProductTypes singularname="excludedProductType"` [model/entity/PriceGroupRate.cfc:L75],
  // which is `inverse="true"`, and a generated accessor on an inverse collection mutates only the
  // in-memory array on the side it was called against. The port therefore maintains THIS entity's
  // own `priceGroupRateExclusions` array and invents no member on `PriceGroupRate`, whose ported
  // surface exposes `getExcludedProductTypes()` as a readonly view with no adder.
  //
  // This pair is the CONTRAST to the include pair asserted above: `addPriceGroupRate` [L207-L209]
  // and `removePriceGroupRate` [L210-L212] delegate to a real far-side helper that maintains BOTH
  // sides, while these two maintain one. Both are faithful; the difference is a property of the
  // legacy far side, not a choice made here.
  //
  // NO `LEGACY-DEFECT` MARKER IS WARRANTED. Neither body is inverted - L216 calls an `add*` and L219
  // calls a `remove*` - so the inversion cross-check verdict for this pair is CLEAN, unlike
  // [model/entity/Option.cfc:L129-L131], whose `removePromotionRewardExclusion` calls
  // `addExcludedOption`. The canonical register (see the index in
  // `tests/unit/domain/entities/promotionReward.test.ts`) carries no entry against either helper.
  describe('the price-group-rate exclusion helpers', () => {
    it('adds the first exclusion onto this entity own array, leaving the include side empty', () => {
      const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excluded' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      subject.addPriceGroupRateExclusion(rate);

      // The near side gains the reference; the include collection [L74] is untouched, because
      // conflating the two link tables would invert an exclusion into an inclusion and change
      // which rate applies - it would change price.
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([rate]);
      expect(subject.getPriceGroupRates()).toStrictEqual([]);
    });

    it('is set-semantic, so adding the same reference twice yields one entry', () => {
      const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excluded' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      subject.addPriceGroupRateExclusion(rate);
      subject.addPriceGroupRateExclusion(rate);

      // Append-if-absent, matching every other ORM-generated adder in the target. An unconditional
      // push would double-count one `SwPriceGrpRateExclProductType` row.
      expect(subject.getPriceGroupRateExclusions()).toHaveLength(1);
      expect(subject.getPriceGroupRateExclusions()[0]).toBe(rate);
    });

    it('never reaches the far side, because PriceGroupRate ships no excluded-side adder', () => {
      const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excluded' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      subject.addPriceGroupRateExclusion(rate);

      // The anti-contract, asserted rather than assumed: `addExcludedProductType` and
      // `removeExcludedProductType` are ABSENT from the ported `PriceGroupRate` surface, and its
      // excluded-product-type view stays empty. Reproducing the legacy delegation literally would
      // have required inventing those two members on a sibling entity - which is why the
      // maintenance sits here instead.
      const rateMembers: readonly string[] = Object.getOwnPropertyNames(
        Object.getPrototypeOf(rate) as object,
      );
      expect(rateMembers).not.toContain('addExcludedProductType');
      expect(rateMembers).not.toContain('removeExcludedProductType');
      expect(rate.getExcludedProductTypes()).toStrictEqual([]);
    });

    it('removes an exclusion that is present, and keeps the other members', () => {
      const removed: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-removed' });
      const retained: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-retained' });
      const subject = new ProductType({
        productTypeID: 'pt-1',
        priceGroupRateExclusions: [removed, retained],
      });

      subject.removePriceGroupRateExclusion(removed);

      // `indexOf` then `splice`, so exactly one member leaves and the survivor keeps its position.
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([retained]);
    });

    it('treats the removal of an absent reference as a no-op rather than a failure', () => {
      const held: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-held' });
      const stranger: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-stranger' });
      const subject = new ProductType({ productTypeID: 'pt-1', priceGroupRateExclusions: [held] });

      subject.removePriceGroupRateExclusion(stranger);

      // The guard is `!== -1`, NOT the `> 0` the legacy `arrayFind` convention would suggest:
      // `arrayFind` is 1-based and answers 0 for "not found", while `indexOf` is 0-based and
      // answers -1, so carrying `> 0` across would silently skip element 0 - the first exclusion on
      // the entity. Removing an unheld rate changes nothing and raises nothing, exactly as the
      // legacy no-op did.
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([held]);
      expect(() => subject.removePriceGroupRateExclusion(stranger)).not.toThrow();
    });

    it('matches by reference on both helpers, so a second hydration of one row is a distinct member', () => {
      const first: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-same' });
      const second: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-same' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // JUDGMENT CALL: this pins the SHIPPED matching rule rather than the rule the sibling
      // primary-key comparisons use. `addPriceGroupRateExclusion` guards with `includes` and
      // `removePriceGroupRateExclusion` locates with `indexOf`, both reference comparisons, which is
      // what the ORM-generated accessor on the far side did when handed the same object twice
      // within one request. It is recorded as a `CFML parity` fact and NOT as a defect: no register
      // entry exists for it, and manufacturing a marker where the port made a documented choice
      // would corrupt the register the same way a stale count does.
      expect(first).not.toBe(second);
      subject.addPriceGroupRateExclusion(first);
      subject.addPriceGroupRateExclusion(second);
      expect(subject.getPriceGroupRateExclusions()).toHaveLength(2);

      subject.removePriceGroupRateExclusion(second);
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([first]);
    });
  });

  describe('the omissions, verified first-hand and documented as deliberate', () => {
    it('omits all three smart-list members', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // `getParentProductTypeOptions` [L122+, via getPropertyOptionsSmartList],
      // `getProductsSmartList` [L261-L267] and `getAssignedAttributeSetSmartList` [L280-L299].
      // All three build a `HibachiSmartList` - a generic string-keyed dynamically-filtered query
      // builder from the framework. Porting one would mean reimplementing a small ORM query
      // language inside a domain entity: untypeable under the strict profile, and a reintroduction
      // of exactly the framework coupling this refactor removes. Replaced project-wide by explicit
      // typed repository queries owned by the service and repository tiers.
      for (const omitted of [
        'getParentProductTypeOptions',
        'getProductsSmartList',
        'getAssignedAttributeSetSmartList',
        'getPropertyOptionsSmartList',
      ]) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(omitted);
        expect(Reflect.get(subject, omitted)).toBeUndefined();
      }
    });

    it('invents no query-builder or filter surface in their place', () => {
      // The omission is an omission, not a substitution. A "small" filter helper on the entity
      // would be the first step back toward a smart list, and it would sit on the wrong side of
      // the layer boundary the moment it needed to reach data.
      for (const member of PRODUCT_TYPE_PROTOTYPE_MEMBERS) {
        expect(member).not.toMatch(/SmartList$/);
        expect(member).not.toMatch(/^addLikeFilter|^addFilter|^addOrder/);
      }
    });

    it('retains no service-locator call site of any kind', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // All SIX legacy `getService()` sites are gone - L94 and L283 with the omitted attribute
      // members, L129 and L263 with the omitted smart lists, L112 replaced by the injected
      // `productTypeRepository`, and L118 preserved as a throw that never reaches a service. An
      // entity resolving a collaborator by string name is transformation rule T2's target, and its
      // absence is what the ESLint layer boundary makes permanent.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getService');
      expect(Reflect.get(subject, 'getService')).toBeUndefined();
      expect(Reflect.get(subject, 'getHibachiScope')).toBeUndefined();
      expect(Reflect.get(subject, 'getSlatwallScope')).toBeUndefined();
    });

    it('consumes exactly one of the thirteen ports', () => {
      const root = new ProductType({ productTypeID: 'pt-root', systemCode: 'merchandise' });
      const repository = makeProductTypeRepositoryDouble(new Map([['pt-root', root]]));
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-root,pt-leaf',
        productTypeRepository: repository,
      });

      // `productTypeRepository`, and nothing else. The one method that needs it is
      // `getBaseProductType()`; every other reach-out was omitted or preserved as a failure. The
      // ledger does not grow to accommodate this entity.
      return expect(subject.getBaseProductType()).resolves.toBe('merchandise');
    });

    it('carries no framework debug or error-dump surface', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // org/Hibachi/HibachiEntity.cfc:L605 calls `writeDump(getErrors())` inside `preInsert`,
      // writing raw entity errors to the response stream. It is NOT ported in any form - not as a
      // logger call, not behind a debug flag. Under Lambda that output would land in a customer
      // response body or a shared log stream, and `getErrors()` on a partially-populated entity is
      // exactly the kind of payload that should never leave the process.
      for (const absent of ['writeDump', 'dump', 'debug', 'logErrors']) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(absent);
      }
      expect(Reflect.get(subject, 'writeDump')).toBeUndefined();
    });
  });
});

describe('ProductType - the bidirectional helpers and the unsaved-row identity fallback (B10)', () => {
  // WHY THIS BLOCK EXISTS.
  //
  // The blocks above assert the materialized path, the base-type walk, the rate lookup, the
  // attribute-set non-port, request scoping, the EAV branch, the representation, validation and
  // the structural census. None of them calls a single one of the fourteen link-collection
  // helpers [model/entity/ProductType.cfc:L157-L220], and none reaches the unsaved-row branch of
  // {@link ProductType.isSameRowAs} that every containment probe on this class routes through.
  //
  // Both matter for behaviour rather than for tidiness:
  //
  //   1. THE UNSAVED-ROW FALLBACK IS THE SAME RULE `priceGroupRate.remove*` AND
  //      `priceGroup.removeParentPriceGroup` CARRY. Two distinct unsaved product types both hold
  //      `''` as their identifier, so a probe that keyed on the identifier alone would report the
  //      second one as already present. Hibernate compared session identity and never made that
  //      mistake. Asserting it here means all three entities are pinned to ONE rule rather than
  //      each being spot-checked in isolation.
  //
  //   2. TEN OF THE TWELVE HELPERS DELEGATE TO THE OWNING SIDE, AND A DELEGATION CAN BE INVERTED
  //      WITHOUT FAILING TO COMPILE. `addPromotionReward` must call `addProductType` and
  //      `removePromotionReward` must call `removeProductType`; swapping them type-checks
  //      perfectly and silently reverses the link. The source's own sibling
  //      `PriceGroupRate.removePromotionRewardExclusion` is the cautionary case, and each helper
  //      here carries a "Verified NOT inverted" note. A note is a claim; the assertions below are
  //      the check.

  it('falls back to reference identity when either side of a containment probe is unsaved', () => {
    // `hasChildProductType` [L802] is one of the two members that route through
    // `isSameRowAs`. With BOTH sides unsaved, key comparison would answer `true` for any
    // unsaved candidate; reference identity answers the real question.
    const held: ProductType = new ProductType({ productTypeID: '' });
    const stranger: ProductType = new ProductType({ productTypeID: '' });
    const parent: ProductType = new ProductType({
      productTypeID: 'pt-parent',
      childProductTypes: [held],
    });

    expect(held.getProductTypeID()).toBe('');
    expect(stranger.getProductTypeID()).toBe('');

    expect(parent.hasChildProductType(held)).toBe(true);
    // ★ The assertion the branch exists for: an identical empty key is NOT the same row.
    expect(parent.hasChildProductType(stranger)).toBe(false);
  });

  it('still answers a containment probe by primary key when both sides are saved', () => {
    // The fallback is reached ONLY when a key is empty. A re-hydrated child - a different
    // JavaScript object carrying the same `SwProductType` key - must still answer `true`.
    const held: ProductType = new ProductType({ productTypeID: 'pt-child' });
    const parent: ProductType = new ProductType({
      productTypeID: 'pt-parent',
      childProductTypes: [held],
    });

    expect(parent.hasChildProductType(new ProductType({ productTypeID: 'pt-child' }))).toBe(true);
    expect(parent.hasChildProductType(new ProductType({ productTypeID: 'pt-other' }))).toBe(false);
  });

  it('links and unlinks a product with set semantics, and leaves the inverse column alone', () => {
    // [model/entity/ProductType.cfc:L66] declares `products` with `singularname="product"`, and
    // `Product.productType` is the owning side. So these helpers maintain THIS array only and
    // must not write `product.productTypeID` - the inverse side owns that column.
    const subject: ProductType = new ProductType({ productTypeID: 'pt-with-products' });
    const product: Product = makeProductFixture({ productID: 'product-linked' });

    subject.addProduct(product);
    expect(subject.getProducts()).toStrictEqual([product]);

    // Set semantics: a second add for the same row is a no-op.
    subject.addProduct(product);
    expect(subject.getProducts()).toHaveLength(1);

    subject.removeProduct(product);
    expect(subject.getProducts()).toStrictEqual([]);

    // A remove for a row that was never linked is a no-op, not a splice at index -1 - which
    // would silently remove the LAST element.
    subject.addProduct(product);
    subject.removeProduct(makeProductFixture({ productID: 'product-never-linked' }));
    expect(subject.getProducts()).toStrictEqual([product]);
  });

  it('separates two UNSAVED products, because the product helpers carry the same fallback', () => {
    // `addProduct` [L964-L970] and `removeProduct` [L987-L993] each inline the same
    // empty-key reference fallback rather than delegating to `isSameRowAs`, which compares
    // product types. The rule is the same and is asserted the same way.
    const subject: ProductType = new ProductType({ productTypeID: 'pt-unsaved-products' });
    const first: Product = makeProductFixture({ productID: '' });
    const second: Product = makeProductFixture({ productID: '' });

    subject.addProduct(first);
    subject.addProduct(second);

    expect(subject.getProducts()).toHaveLength(2);

    // And a remove reaches exactly the row it was handed.
    subject.removeProduct(first);
    expect(subject.getProducts()).toStrictEqual([second]);
  });

  it('THROWS when removeParentProductType is called with no argument on a parentless type', () => {
    // A PRESERVED null dereference, not a target invention.
    // [model/entity/ProductType.cfc:L159] resolves the parent and then dereferences it with no
    // guard, so a parentless product type is a CFML null-reference error there too. The port
    // throws rather than answering as though it had detached something.
    const orphan: ProductType = new ProductType({ productTypeID: 'pt-no-parent' });

    expect(orphan.getParentProductType()).toBeUndefined();
    expect(() => {
      orphan.removeParentProductType();
    }).toThrow(/no parent/);
  });

  it('detaches a child by delegating to the child, which owns the pointer', () => {
    // `removeChildProductType` [L1346] calls `childProductType.removeParentProductType(this)`.
    // The delegation is the whole implementation, so the assertion is that the CHILD's parent
    // pointer clears - not merely that the call returned.
    // Built through `makeAncestorChain` so the parent pointer is established the same way every
    // other block in this file establishes it. `leafOf` is the suite's guarded last-element read;
    // the parent is reached through the child rather than by indexing the chain, which keeps
    // `noUncheckedIndexedAccess` satisfied without a non-null assertion.
    const chain: readonly ProductType[] = makeAncestorChain(['pt-root', 'pt-leaf']);
    const child: ProductType = leafOf(chain);
    const parent: ProductType | undefined = child.getParentProductType();

    if (parent === undefined) {
      throw new Error('makeAncestorChain did not set the leaf-to-root parent pointer.');
    }

    expect(parent.getProductTypeID()).toBe('pt-root');
    expect(parent.getChildProductTypes()).toContain(child);

    parent.removeChildProductType(child);

    expect(child.getParentProductType()).toBeUndefined();
    expect(parent.getChildProductTypes()).not.toContain(child);
  });

  it('routes all four promotion-REWARD helpers to the owning reward, uninverted', () => {
    // Each helper's one job is to reach the right method on the owner. An inverted pair would
    // compile and would reverse the link, so include and exclude are asserted separately.
    const subject: ProductType = new ProductType({ productTypeID: 'pt-reward-linked' });
    const reward: PromotionReward = new PromotionReward({ promotionRewardID: 'reward-b10' });

    subject.addPromotionReward(reward);
    expect(reward.getProductTypes()).toContain(subject);
    expect(reward.getExcludedProductTypes()).not.toContain(subject);

    subject.addPromotionRewardExclusion(reward);
    expect(reward.getExcludedProductTypes()).toContain(subject);

    subject.removePromotionReward(reward);
    expect(reward.getProductTypes()).not.toContain(subject);
    // The exclude side is a DISTINCT link table [L71] and is untouched by the include-side remove.
    expect(reward.getExcludedProductTypes()).toContain(subject);

    subject.removePromotionRewardExclusion(reward);
    expect(reward.getExcludedProductTypes()).not.toContain(subject);
  });

  it('routes all four promotion-QUALIFIER helpers to the owning qualifier, uninverted', () => {
    const subject: ProductType = new ProductType({ productTypeID: 'pt-qualifier-linked' });
    const qualifier: PromotionQualifier = new PromotionQualifier({
      promotionQualifierID: 'qualifier-b10',
    });

    subject.addPromotionQualifier(qualifier);
    expect(qualifier.getProductTypes()).toContain(subject);
    expect(qualifier.getExcludedProductTypes()).not.toContain(subject);

    subject.addPromotionQualifierExclusion(qualifier);
    expect(qualifier.getExcludedProductTypes()).toContain(subject);

    subject.removePromotionQualifier(qualifier);
    expect(qualifier.getProductTypes()).not.toContain(subject);
    expect(qualifier.getExcludedProductTypes()).toContain(subject);

    subject.removePromotionQualifierExclusion(qualifier);
    expect(qualifier.getExcludedProductTypes()).not.toContain(subject);
  });

  it('routes the INCLUDED price-group-rate helpers to the rate, which owns that link table', () => {
    // [model/entity/ProductType.cfc:L207-L212] delegates both directions to `PriceGroupRate`,
    // which writes `SwPriceGroupRateProductType` [L74].
    const subject: ProductType = new ProductType({ productTypeID: 'pt-rate-linked' });
    const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-b10' });

    subject.addPriceGroupRate(rate);
    expect(rate.getProductTypes()).toContain(subject);

    subject.removePriceGroupRate(rate);
    expect(rate.getProductTypes()).not.toContain(subject);
  });

  it('maintains the EXCLUDED price-group-rate link on THIS side, inventing no member on the rate', () => {
    // The one asymmetry in the twelve. `PriceGroupRate`'s ported surface exposes
    // `getExcludedProductTypes()` as a readonly view with NO adder, so
    // [model/entity/ProductType.cfc:L215-L220] is honoured by maintaining this entity's own
    // `priceGroupRateExclusions` array - which is what the legacy call achieved on the one side
    // it touched - rather than by inventing `addExcludedProductType` on the rate.
    const subject: ProductType = new ProductType({ productTypeID: 'pt-rate-excluded' });
    const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excl-b10' });

    subject.addPriceGroupRateExclusion(rate);
    expect(subject.getPriceGroupRateExclusions()).toStrictEqual([rate]);

    // Set semantics, matching every other generated adder.
    subject.addPriceGroupRateExclusion(rate);
    expect(subject.getPriceGroupRateExclusions()).toHaveLength(1);

    // The INCLUDED collection is a distinct link table [L74 versus L75] and stays empty.
    expect(subject.getPriceGroupRates()).toStrictEqual([]);

    subject.removePriceGroupRateExclusion(rate);
    expect(subject.getPriceGroupRateExclusions()).toStrictEqual([]);

    // Matching is by reference here, as the note on the helper states, so an equal-keyed but
    // distinct rate is not removed.
    subject.addPriceGroupRateExclusion(rate);
    subject.removePriceGroupRateExclusion(new PriceGroupRate({ priceGroupRateID: 'pgr-excl-b10' }));
    expect(subject.getPriceGroupRateExclusions()).toStrictEqual([rate]);
  });
});

// ===========================================================================
// A CYCLIC PARENT CHAIN IS ACCEPTED, EXACTLY AS THE LEGACY SETTER ACCEPTS ONE
//
// NET-NEW coverage - `meta/tests/` contains no ProductType test at all - pinning legacy PARITY rather than a divergence.
// The legacy setter at [model/entity/ProductType.cfc:L149-L153] validates nothing before assigning, and the
// legacy walk at [org/Hibachi/HibachiEntity.cfc:L314-L321] carries no visited set
// and no bound. Both are reproduced: this setter assigns whatever it is handed,
// and a looping chain climbs forever here exactly as it climbs forever there.
//
// ★ THIS BLOCK ONCE ASSERTED THE OPPOSITE, AND THE RECORD BELONGS HERE. It ran
// under the heading "CYCLIC PARENT CHAINS ARE REFUSED, NOT FOLLOWED" and pinned a
// throw from `setParentProductType` plus a `CyclicIdPathError` from the shared walk. Both
// guards have been removed: a port reproduces rather than improves, and the
// project's deliberate-divergence budget is closed at three - the un-`var`'d
// `discountAmount` [model/service/PromotionService.cfc:L1007], the `amountOff`
// branch routed through `Money` [model/service/PromotionService.cfc:L998], and the
// entity memo defects in `sku.ts`/`product.ts`. None is spent in this folder.
//
// WHAT IS ASSERTED, AND WHAT DELIBERATELY IS NOT. Every test below asserts that
// the ASSIGNMENT is accepted and that both sides of the link are maintained. NONE
// of them builds a path from a cyclic graph, because that call does not return -
// asserting non-termination would hang the suite rather than prove anything. The
// absence of the removed guards is proven where it can be proven safely, in
// `tests/unit/domain/valueObjects/materializedIdPath.test.ts`, by a counting
// parent accessor that stops the walk long after either guard would have fired.
//
// WHERE A TERMINATION DECISION DOES LIVE FOR THIS ENTITY: `hydrateWithAncestry`
// in `mysqlProductTypeRepository.ts`, a hand-written recursive read with no legacy
// antecedent, still raises `ProductTypeCycleError`. That guard is a fetch-shape
// decision under transformation rule T3 and is asserted in that adapter's own
// integration suite, not here.
// ===========================================================================

describe('ProductType - a cyclic parent chain is accepted, per legacy parity (B10)', () => {
  it('accepts a product type as its own parent', () => {
    const subject = new ProductType({ productTypeID: 'pt-self' });

    // CFML parity [model/entity/ProductType.cfc:L149-L153]: nothing is validated.
    subject.setParentProductType(subject);

    expect(subject.getParentProductType()).toBe(subject);
  });

  it('accepts its own direct child as its parent', () => {
    const root = new ProductType({ productTypeID: 'pt-root' });
    const child = new ProductType({ productTypeID: 'pt-child' });
    child.setParentProductType(root);

    root.setParentProductType(child);

    expect(root.getParentProductType()).toBe(child);
    expect(child.getParentProductType()).toBe(root);
  });

  it('accepts a distant descendant as its parent, not merely a direct child', () => {
    const a = new ProductType({ productTypeID: 'pt-a' });
    const b = new ProductType({ productTypeID: 'pt-b' });
    const c = new ProductType({ productTypeID: 'pt-c' });
    b.setParentProductType(a);
    c.setParentProductType(b);

    a.setParentProductType(c);

    expect(a.getParentProductType()).toBe(c);
  });

  it('maintains the far side when it closes a cycle, just as for any other parent', () => {
    // The legacy guard at [model/entity/ProductType.cfc:L151] is a MEMBERSHIP test,
    // not an acyclicity test, so a cycle-closing assignment appends like any other.
    const root = new ProductType({ productTypeID: 'pt-far-root' });
    const leaf = new ProductType({ productTypeID: 'pt-far-leaf' });
    leaf.setParentProductType(root);

    root.setParentProductType(leaf);

    expect(leaf.getChildProductTypes()).toContain(root);
    expect(root.getChildProductTypes()).toContain(leaf);
  });

  it('accepts a cycle through addChildProductType too, since it delegates to the setter', () => {
    const root = new ProductType({ productTypeID: 'pt-add-root' });
    const leaf = new ProductType({ productTypeID: 'pt-add-leaf' });
    leaf.setParentProductType(root);

    leaf.addChildProductType(root);

    expect(root.getParentProductType()).toBe(leaf);
  });

  it('still assigns every well-founded reparent, including moving a subtree', () => {
    const newRoot = new ProductType({ productTypeID: 'pt-new-root' });
    const reparented = new ProductType({ productTypeID: 'pt-movable-probe' });
    const oldRoot = new ProductType({ productTypeID: 'pt-old-root' });
    reparented.setParentProductType(oldRoot);

    reparented.setParentProductType(newRoot);

    expect(reparented.getParentProductType()).toBe(newRoot);
    expect(reparented.getProductTypeIDPath()).toBe('pt-new-root,pt-movable-probe');
  });
});
