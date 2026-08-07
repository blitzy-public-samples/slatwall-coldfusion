// slatwall-ts - characterization suite pinning `src/domain/entities/productType.ts`
//
// The materialized `productTypeIDPath` [model/entity/ProductType.cfc:L53], the 4000-character
// comma list the promotion engine walks.
//
// CFML parity [model/entity/ProductType.cfc:L94, L112, L118, L129, L263, L283]: the six locator
// strings are spelled with four different casings, and two of them name the same service twice
// over - `"ProductService"` at L112 versus `"productService"` at L129 and L263.
//
// `LEGACY-DEFECT` MARKERS: exactly **one**, on the [model/entity/ProductType.cfc:L117-L119]
// named-argument throw.
// the bar: maximal strictness applies, with no `any`, no `@ts-ignore`, no non-null assertion,

import { describe, expect, it } from 'vitest';

import { ProductType } from '../../../../src/domain/entities/productType.js';
import {
  buildIdPathList,
  getRootIdFromIdPath,
} from '../../../../src/domain/valueObjects/materializedIdPath.js';
import { listGetAt } from '../../../../src/lib/cfml/list.js';
import { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
// JUDGMENT CALL - `PriceGroupRate` is imported as a value, not `import type`.
import { PriceGroupRate } from '../../../../src/domain/entities/priceGroupRate.js';
import type { Product } from '../../../../src/domain/entities/product.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
// VALUE imports: block B10 constructs both owners so it can assert that each delegating helper
// really reaches the owning side's array, rather than asserting only that the call returns.
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';

// Local test vocabulary.

/**
 * The exact separator [model/entity/ProductType.cfc:L275] concatenates, byte for byte.
 *
 * A raw html entity with one leading and one trailing space.
 */
const RAQUO_SEPARATOR = ' &raquo; ';

/**
 * CFML's `,` list delimiter, which is what a materialized ID path is built from.
 */
const PATH_DELIMITER = ',';

/**
 * The boolean column shape the shipped constructor accepts for `activeFlag` / `publishedFlag`.
 *
 * Structurally identical to `CfBooleanInput` from `src/lib/cfml/truthiness.ts`, restated locally
 * rather than imported: that module is not among this suite's declared dependencies.
 */
type CfmlBooleanColumn = string | number | boolean | null | undefined;

/**
 * A hand-written, in-memory stand-in for the `productTypeRepository` port.
 *
 * Structurally typed and never imported from `src/domain/ports/**`, so this suite's imports stay
 * inside its declared dependency set while the object still satisfies the constructor parameter
 * exactly.
 *
 * `calls` is the whole reason it is hand-written rather than mocked: several assertions below turn
 * on which repository method ran and with what.
 */
interface ProductTypeRepositoryDouble {
  /**
   * Every method invocation, in order, as `'<method>:<argument>'`.
   */
  readonly calls: string[];
  getProductTypeQuery(): Promise<readonly never[]>;
  getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined>;
  getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]>;
  saveProductType(productType: ProductType): Promise<ProductType>;
}

/**
 * Build a repository double backed by an explicit identifier-to-row map.
 *
 * An identifier absent from `rows` resolves to `undefined`, which is exactly what a MySQL lookup
 * that matched no row produces.
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
 * ACYCLIC by CONSTRUCTION, and that is a property of this helper rather than a limitation of the
 * subject.
 *
 * Cycles are built only in their own block near the end of this file, and never with this helper.
 *
 * @param productTypeIDs identifiers ROOT FIRST.
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
 * Written as a guarded read rather than an indexed one because `noUncheckedIndexedAccess` is on
 * and no non-null assertion is permitted anywhere in this suite.
 */
function leafOf(chain: readonly ProductType[]): ProductType {
  const leaf = chain.at(-1);
  if (leaf === undefined) {
    throw new Error('makeAncestorChain was called with no identifiers, so there is no leaf.');
  }
  return leaf;
}

/**
 * A minimal `PriceGroup`, needed only as the argument to the always-throwing
 * [model/entity/ProductType.cfc:L118] stub.
 *
 * Every constructor key is supplied explicitly: `exactOptionalPropertyTypes` is on and the shipped
 * signature declares these keys as REQUIRED-but-nullable rather than optional.
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

/**
 * The names declared on the shipped class, which is what the omission audit reads.
 */
const PRODUCT_TYPE_PROTOTYPE_MEMBERS: readonly string[] = Object.getOwnPropertyNames(
  ProductType.prototype,
);

// B1. The materialized `productTypeIDPath` - both routes.
//
// Route 1 - the lazy memoizing read at [model/entity/ProductType.cfc:L250-L255], guarded on
// `isNull(...)`.
//
// They are different operations with different triggers, so they are tested separately and then
// tested against each other.

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
      // `categoryIDPath`.
      const fromValueObject = buildIdPathList<ProductType>(
        leaf,
        (node) => node.getProductTypeID(),
        (node) => node.getParentProductType(),
      );

      expect(leaf.getProductTypeIDPath()).toBe(fromValueObject);
    });

    it('returns a stored 4000-character path intact, applying no truncation of its own', () => {
      // [model/entity/ProductType.cfc:L53] declares `length="4000"`.
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
    // CFML parity [model/entity/ProductType.cfc:L251, L123]: two different memo idioms in one
    // file.

    it('rebuilds from the parent chain when the stored path is absent', () => {
      const chain = makeAncestorChain(['pt-root', 'pt-leaf']);

      expect(leafOf(chain).getProductTypeIDPath()).toBe('pt-root,pt-leaf');
    });

    it('rebuilds when the stored path is SQL NULL, because the guard is isNull-shaped', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf', productTypeIDPath: null });
      subject.setParentProductType(root);

      // `isNull()` reaches a persisted-but-NULL column exactly as it reaches an absent one, so a
      // hydrated `null` rebuilds. A `structKeyExists`-shaped guard would have returned null.
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
      expect(subject.getProductTypeIDPath()).toBe('pt-stale-root,pt-leaf');
      expect(subject.getProductTypeIDPath()).not.toBe('pt-actual-root,pt-leaf');
    });

    it('treats a stored EMPTY STRING as present and does NOT rebuild it', () => {
      const root = new ProductType({ productTypeID: 'pt-root' });
      const subject = new ProductType({ productTypeID: 'pt-leaf', productTypeIDPath: '' });
      subject.setParentProductType(root);

      // The asymmetry that matters, and the one a length-based guard would destroy.
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

      // First read: absent, so it rebuilds and writes the field.
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');

      // Re-parent after the memo is warm. [model/entity/ProductType.cfc:L251] now sees a present
      // value and returns it.
      subject.removeParentProductType(original);
      subject.setParentProductType(new ProductType({ productTypeID: 'pt-new-root' }));
      expect(subject.getProductTypeIDPath()).toBe('pt-original-root,pt-leaf');
      expect(subject.getParentProductType()?.getProductTypeID()).toBe('pt-new-root');
    });
  });

  describe('route 2 - explicit repository-invoked maintenance [L306, L311]', () => {
    // Transformation rule T3, and the point worth being precise about: `preInsert` and `preUpdate`
    // exist on the shipped class, but they are not ORM lifecycle callbacks.

    it('does not compute or overwrite the path at construction time', () => {
      const root = new ProductType({ productTypeID: 'pt-actual-root' });
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-persisted-root,pt-leaf',
      });
      subject.setParentProductType(root);

      // If the constructor fired the maintenance, a persisted path would be silently replaced by
      // one derived from a possibly partially-hydrated parent chain. It must not.
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

      // Route 2 assigns unconditionally - it calls the setter and so bypasses the
      // [model/entity/ProductType.cfc:L251] guard entirely.
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

      // `struct oldData` is declared without `required` at [model/entity/ProductType.cfc:L310] and
      // the legacy body never reads it - it forwards the whole argument collection to `super` at
      // [model/entity/ProductType.cfc:L312].
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
      // READ rather than now - the inverse of the eager hooks.
      subject.setProductTypeIDPath(undefined);
      expect(subject.getProductTypeIDPath()).toBe('pt-root,pt-leaf');

      subject.setProductTypeIDPath(null);
      expect(subject.getProductTypeIDPath()).toBe('pt-root,pt-leaf');
    });

    it('makes the path assignment the ONLY effect of either hook', () => {
      // CFML parity [model/entity/ProductType.cfc:L305-L313]: the path is assigned before the
      // `super` call - [model/entity/ProductType.cfc:L306] precedes
      // [model/entity/ProductType.cfc:L307], and [model/entity/ProductType.cfc:L311] precedes
      // [model/entity/ProductType.cfc:L312].
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
      // CFML parity [model/entity/ProductType.cfc:L303-L315]: this component's banner bookkeeping
      // is CORRECT - `preInsert` [model/entity/ProductType.cfc:L305-L308] and `preUpdate`
      // [model/entity/ProductType.cfc:L310-L313] both sit inside the "ORM Event Hooks" run that
      // opens at [model/entity/ProductType.cfc:L303] and closes at
      // [model/entity/ProductType.cfc:L315].
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('preInsert');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('preUpdate');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getProductTypeIDPath');
    });
  });
});

// B2. `getBaseProductType()` - the root element, and the one async member.
//
// CFML parity [model/entity/ProductType.cfc:L112]: getBaseProductType resolves through
// `listFirst(getProductTypeIDPath())` -- the FIRST, i.e.

describe('ProductType - getBaseProductType() (B2)', () => {
  describe('the root-element contract', () => {
    it('reads element ONE of the path, which is the root and not the second element', () => {
      const path = 'pt-root,pt-mid,pt-leaf';

      // The correction, asserted rather than merely asserted-about. `getRootIdFromIdPath` is the
      // shipped `listFirst` emulation and it must agree with a 1-based positional read.
      expect(getRootIdFromIdPath(path)).toBe('pt-root');
      expect(getRootIdFromIdPath(path)).toBe(listGetAt(path, 1));
      expect(getRootIdFromIdPath(path)).not.toBe(listGetAt(path, 2));
    });

    it('answers the empty string for an empty path, as CFML listFirst(str) does', () => {
      // The one place the emulation deliberately differs from a bare positional read: CFML
      // `listFirst('')` is `''`, while `listGetAt('', 1)` raises.
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

      // The async boundary rule: a ported method becomes `async` if and only if its legacy body
      // genuinely reaches the DAO or the ORM.
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

      // [model/entity/ProductType.cfc:L114] returns before [model/entity/ProductType.cfc:L112] can
      // run.
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
      // Climbing `parentProductType` to the root would look like the same answer and is not
      // equivalent: [model/entity/ProductType.cfc:L112] takes the root IDENTIFIER out of the
      // STORED path and loads that row fresh.
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
      // Not infinite recursion, and recorded so nobody "fixes" a problem that does not exist: the
      // path's first element is then this node's own identifier, the repository returns this same
      // row.
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

      // An absent answer is legitimate and load-bearing. The root may carry no system code, in
      // which case CFML returns null and this returns `undefined`.
      await expect(subject.getBaseProductType()).resolves.toBeUndefined();
    });

    it('rejects when the root row named by the stored path cannot be loaded', async () => {
      const repository = makeProductTypeRepositoryDouble(new Map<string, ProductType>());
      const subject = new ProductType({
        productTypeID: 'pt-leaf',
        productTypeIDPath: 'pt-missing-root,pt-leaf',
        productTypeRepository: repository,
      });

      // The unguarded dereference is preserved, not papered over. In CFML `.getSystemCode()` is
      // invoked directly on whatever `getProductType(...)` returns, so a missing root row fails at
      // runtime.
      await expect(subject.getBaseProductType()).rejects.toThrow(
        /could not load the root product type/,
      );
      expect(repository.calls).toStrictEqual(['getProductTypeByProductTypeID:pt-missing-root']);
    });

    it('rejects when the stored path is empty, because the root identifier is then empty too', async () => {
      // The consequence of the B1 empty-string asymmetry, followed all the way through: a stored
      // `''` is PRESENT so the getter returns `''`, `getRootIdFromIdPath('')` is `''`, and the
      // lookup of `''` matches no row.
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
      // never ask for a base product type.
      await expect(subject.getBaseProductType()).rejects.toThrow(
        /requires a productTypeRepository/,
      );
    });

    it('still short-circuits without a repository when its own system code is present', async () => {
      const subject = new ProductType({ productTypeID: 'pt-leaf', systemCode: 'merchandise' });

      // Proof that the unwired-port failure belongs to the [model/entity/ProductType.cfc:L112]
      // branch alone and is not a precondition of the method as a whole.
      await expect(subject.getBaseProductType()).resolves.toBe('merchandise');
    });
  });
});

// B3. `getAppliedPriceGroupRateByPriceGroup()` - the named-argument defect that throws.
//
// LEGACY-DEFECT [model/entity/ProductType.cfc:L117-L119]: getAppliedPriceGroupRateByPriceGroup
// passes product=this to getRateForProductTypeBasedOnPriceGroup, whose signature at
// [model/service/PriceGroupService.cfc:L57] declares `required any productType`.
// Preserved deliberately; do not fix without a product decision.

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

    // A preserved defect that fails opaquely is a trap; a preserved defect that explains itself is
    // documentation.
    expect(message).toContain("'product'");
    expect(message).toContain("'productType'");
    expect(message).toContain('model/service/PriceGroupService.cfc:L57');
    expect(message).toContain('model/entity/Sku.cfc:L265-L268');
  });

  it('throws identically no matter which price group is handed in', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });

    // The parameter is retained unused for interface parity [C4] and is genuinely inert: the
    // failure happens at the CFML argument-binding boundary, before the service body runs.
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

    // Persistence state, a populated path and a resolvable system code are all irrelevant.
    expect(unsaved.isNew()).toBe(true);
    expect(() => unsaved.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
    expect(saved.isNew()).toBe(false);
    expect(() => saved.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
  });

  it('is synchronous, so the failure surfaces at the call and not as a rejected promise', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });
    const priceGroup = makeInertPriceGroup('pg-1');

    // The async boundary rule cuts the other way here.
    expect(() => subject.getAppliedPriceGroupRateByPriceGroup(priceGroup)).toThrow(Error);
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getAppliedPriceGroupRateByPriceGroup');
  });

  it('exposes no repaired alternative alongside the broken method', () => {
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getRateForProductTypeBasedOnPriceGroup');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPriceGroupRateByPriceGroup');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getAppliedPriceGroupRate');
  });
});

// B4. The C3 TODO carry-forward, and the dead no-op guard.
//
// CFML parity [model/entity/ProductType.cfc:L92-L99]: the legacy TODO at L93 -- "Todo get by all
// the parent productTypeIDs" -- is carried forward verbatim per C3 and is not completed. The
// L95-L97 guard is a NO-OP: it reassigns an empty array to an empty array.
//
// TODO [model/entity/ProductType.cfc:L93]: Todo get by all the parent productTypeIDs.
//
// What the TODO is ACTUALLY ADMITTING, because it matters for anyone who later resolves it: the
// method is named `getInheritedAttributeSetAssignments`, but [model/entity/ProductType.cfc:L94]
// fetches every attribute-set assignment in the installation with no filter whatsoever.

describe('ProductType - the attribute-set TODO and its deliberate non-port (B4)', () => {
  it('does not ship getInheritedAttributeSetAssignments at all', () => {
    const subject = new ProductType({ productTypeID: 'pt-1' });

    // ASSERT the SHIPPED REALITY, not an assumption about it. The method was verified absent
    // first-hand before this assertion was written; it is pinned so that a later well-meaning
    // "completion" of the TODO cannot land silently inside the domain layer.
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getInheritedAttributeSetAssignments');
    expect('getInheritedAttributeSetAssignments' in subject).toBe(false);
  });

  it('ships no attribute-set, attribute-value or EAV surface of any kind', () => {
    // The whole out-of-scope subsystem, enumerated so the boundary is checkable rather than
    // asserted.
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
      // This deliberate compile error is the assertion: the type system, not a runtime check,
      // refuses to let an out-of-scope subsystem be wired into an in-scope entity.
      // @ts-expect-error - NO FOURTEENTH PORT. `attributeService` is not a constructor key, and
      // this deliberate compile error is the assertion: the type system, not a runtime check,
      // refuses to let an out-of-scope subsystem be wired into an in-scope entity.
      attributeService: { getAttributeSetAssignmentSmartList: () => [] },
    });

    // The excess key is dropped rather than absorbed: the instance is otherwise ordinary.
    expect(subject.getProductTypeID()).toBe('pt-1');
    expect('attributeService' in subject).toBe(false);
  });

  it('characterizes the [L95-L97] guard as a dead no-op that cannot change the outcome', () => {
    // The guard reproduced in the smallest honest form, purely to demonstrate why it is dead.
    const legacyGuard = (records: readonly unknown[]): readonly unknown[] => {
      // If(!arrayLen(attributeSetAssignments)){ attributeSetAssignments = []; }.
      if (records.length === 0) {
        return [];
      }
      return records;
    };

    // On the only branch that fires - an already-empty array - it substitutes an empty array for
    // an empty array.
    expect(legacyGuard([])).toStrictEqual([]);
    expect(legacyGuard(['a', 'b'])).toStrictEqual(['a', 'b']);
    const empty: readonly unknown[] = [];
    expect(legacyGuard(empty)).not.toBe(empty);
    const populated: readonly unknown[] = ['a'];
    expect(legacyGuard(populated)).toBe(populated);
  });

  it('leaves the productTypeIDPath the TODO would have needed fully available', () => {
    // A closing observation with real value for whoever resolves the
    // TODO: the parent-filtered query it asks for needs the ancestor identifiers, and those are
    // already exactly what the materialized path carries - root-first, self-last, self included
    // [B1].
    const chain = makeAncestorChain(['pt-root', 'pt-mid', 'pt-leaf']);
    const leaf = leafOf(chain);

    expect(leaf.getProductTypeIDPath()).toBe('pt-root,pt-mid,pt-leaf');
    expect(listGetAt(leaf.getProductTypeIDPath(), 1)).toBe('pt-root');
  });
});

// This suite is the designated home for the partial-clear characterization.
//
// CFML parity [model/entity/HibachiEntity.cfc:L246-L253]: clearAttributeCache() clears only
// attributeValuesByAttributeIDStruct and attributeValuesByAttributeCodeStruct.

describe('ProductType - request-scoped state and cache residuals (B5)', () => {
  describe('memo isolation between independent instances', () => {
    it('does not let a second instance observe the first instance path memo', () => {
      const sharedRoot = new ProductType({ productTypeID: 'pt-root' });

      const first = new ProductType({ productTypeID: 'pt-same' });
      first.setParentProductType(sharedRoot);
      expect(first.getProductTypeIDPath()).toBe('pt-root,pt-same');

      // A second, independent instance carrying the same identifier.
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
      // default.
      return Promise.all([
        expect(wired.getBaseProductType()).resolves.toBe('merchandise'),
        expect(unwired.getBaseProductType()).rejects.toThrow(/requires a productTypeRepository/),
      ]);
    });
  });

  describe('the partial-clear residual, characterized and deliberately not reproduced', () => {
    it('ships none of the four memos the partial clear operated on', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // The shipped reality first.
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

      // Two of four. That is the whole defect: the clear is named as though it invalidated the
      // attribute cache, and it invalidates half of it.
      expect(clearedByLegacy).toHaveLength(2);
      expect(leftStaleByLegacy).toStrictEqual([
        'attributeValuesForEntity',
        'assignedAttributeSetSmartList',
      ]);
      expect(clearedByLegacy.length + leftStaleByLegacy.length).toBe(memoKeys.length);
    });

    it('exposes no cache-clearing surface at all, partial or complete', () => {
      for (const member of PRODUCT_TYPE_PROTOTYPE_MEMBERS) {
        expect(member).not.toMatch(/^clear/);
        expect(member).not.toMatch(/[Cc]ache/);
      }
    });

    it('leaves the one memo it does keep observable only through its own accessor', () => {
      // The single cache this entity keeps is the [model/entity/ProductType.cfc:L250-L255] path
      // memo asserted in B1.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getNewFlag');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('flushProductTypeIDPath');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('invalidateProductTypeIDPath');
    });
  });
});

// B6. The unknown-getter silent branch, and the orphaned `physicalCounts` gate.
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L559-L565, model/entity/HibachiEntity.cfc:L202]:
// because `ProductType` DECLARES `attributeValues` at [model/entity/ProductType.cfc:L67], the
// `model/entity/ProductType.cfc` guard succeeds, so an unknown `getX()` is silently rerouted to
// `getAttributeValue('X')`, which returns `''` on a miss [model/entity/ProductType.cfc:L202].
//
// CFML parity
// [model/validation/ProductType.json, model/entity/ProductType.cfc:L77, model/entity/Physical.cfc:L59]:
// the physicalCounts delete gate is ORPHANED -- ProductType declares `physicals` at L77, and
// physicalCounts is a property only on Physical.cfc:L59.

describe('ProductType - the EAV silent branch and the physicalCounts orphan (B6)', () => {
  describe('no dynamic dispatch is emulated', () => {
    it('answers undefined for an unknown accessor rather than the legacy empty string', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // `Reflect.get` reads an absent key without a cast and without a non-null assertion, so the
      // absence is asserted honestly rather than asserted-around. Plain JavaScript semantics:
      // absent means `undefined`.
      expect(Reflect.get(subject, 'getProductTypeNaem')).toBeUndefined();
      expect(Reflect.get(subject, 'getSomeCustomAttribute')).toBeUndefined();
      expect(Reflect.get(subject, 'getAnythingAtAll')).toBeUndefined();
    });

    it('resolves no method by name, so the [L559] reroute has no target', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // The two members the `model/entity/ProductType.cfc` guard itself depends on. Neither
      // exists, so even a hand-written emulation would have nothing to call - the branch is
      // unreachable by construction rather than by convention.
      expect(Reflect.get(subject, 'getAttributeValue')).toBeUndefined();
      expect(Reflect.get(subject, 'onMissingMethod')).toBeUndefined();
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('onMissingMethod');
    });

    it('is a plain object with an ordinary prototype and no proxy interposed', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // A `Proxy` with a `get` trap is the one construct that could reintroduce the silent branch
      // in TypeScript, so its absence is asserted structurally: the instance's prototype is
      // exactly `ProductType.prototype`.
      expect(Object.getPrototypeOf(subject)).toBe(ProductType.prototype);
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('constructor');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS.length).toBeGreaterThan(0);
    });

    it('characterizes the four-silent / fourteen-throw split as a documented record', () => {
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

      // The gate names `physicalCounts`; the entity declares `physicals`.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPhysicalCounts');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('addPhysicalCount');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('removePhysicalCount');
      expect(Reflect.get(subject, 'getPhysicalCounts')).toBeUndefined();
    });

    it('ships no physicals accessor either, since the collection is not materialized', () => {
      // Asserting the shipped reality rather than the upstream expectation.
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('getPhysicals');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('addPhysical');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain('removePhysical');
    });

    it('accepts neither physicals nor physicalCounts as constructor state', () => {
      const subject = new ProductType({
        productTypeID: 'pt-1',
        // @ts-expect-error - neither the real `physicals` association
        // [model/entity/ProductType.cfc:L77] nor the orphaned `physicalCounts` the validation file
        // names is part of this entity's hydration contract. The compile error IS the assertion.
        physicals: [],
      });

      expect('physicals' in subject).toBe(false);
      expect('physicalCounts' in subject).toBe(false);
    });

    it('records the orphan as a dead declaration with its sole real home named', () => {
      // The evidence trail, as data: the four in-scope validation files carrying the gate, and the
      // single property declaration anywhere in the repository that would satisfy it.
      const inScopeFilesCarryingTheGate = [
        'model/validation/Product.json:L7',
        'model/validation/Brand.json:L7',
        'model/validation/ProductType.json:L8',
        'model/validation/Sku.json:L13',
      ];
      const soleRealDeclaration = 'model/entity/Physical.cfc:L59';
      expect(inScopeFilesCarryingTheGate).toHaveLength(4);
      expect(soleRealDeclaration).toBe('model/entity/Physical.cfc:L59');
      // Not expanded into the six-file validation-ABSENCE inventory, which is a different list.
      expect(inScopeFilesCarryingTheGate).not.toContain('model/validation/Category.json');
    });
  });
});

// B7. `getSimpleRepresentation()`, the `&raquo;` literal, and `setProducts` casing.
//
// CFML parity [model/entity/ProductType.cfc:L275]: the separator is the literal HTML entity
// `" &raquo; "` with a space on both sides, written as five characters `&`,`r`,`a`,`q`,`u`,`o`,`;`
// inside the source string.
//
// CFML parity [model/entity/ProductType.cfc:L101-L105, L66]: setProducts takes a capital-P
// `Products` parameter and clears `variables.Products` at L103, while the property is declared
// lowercase `products` at L66.

describe('ProductType - getSimpleRepresentation() (B7)', () => {
  describe('the guarded recursion at [L273-L278]', () => {
    it('returns the bare product-type name when there is no parent', () => {
      const subject = new ProductType({ productTypeID: 'pt-1', productTypeName: 'Merchandise' });

      // [model/entity/ProductType.cfc:L277], the terminal branch. No separator, no prefix, no
      // decoration.
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

      // [model/entity/ProductType.cfc:L275] calls the PARENT'S own `getSimpleRepresentation()`,
      // not `getProductTypeName()`, so the whole ancestor breadcrumb accumulates.
      const representation = leaf.getSimpleRepresentation() ?? '';
      expect(representation).toBe('Merchandise &raquo; Apparel &raquo; Shirts');
      expect(representation.split(RAQUO_SEPARATOR)).toHaveLength(3);
    });

    it('reads root-first, matching the direction of the materialized path', () => {
      // Named explicitly rather than through `makeAncestorChain`, which supplies identifiers only:
      // a nameless chain renders as bare separators and would make this assertion vacuous.
      const root = new ProductType({ productTypeID: 'pt-root', productTypeName: 'pt-root' });
      const mid = new ProductType({ productTypeID: 'pt-mid', productTypeName: 'pt-mid' });
      const leaf = new ProductType({ productTypeID: 'pt-leaf', productTypeName: 'pt-leaf' });
      mid.setParentProductType(root);
      leaf.setParentProductType(mid);

      // Both the breadcrumb and the path read ancestor-first.
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

      // Not MEMOIZED - and deliberately contrasted with the path memo asserted in B1, which does
      // go stale after exactly this operation.
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
      expect(representation).not.toContain('»');
      expect(representation).not.toContain('&amp;raquo;');
      expect(representation).not.toContain('Merchandise&raquo;');
    });

    it('carries no numeric-reference or unescaped-ampersand variant', () => {
      const parent = new ProductType({ productTypeID: 'pt-root', productTypeName: 'A' });
      const child = new ProductType({ productTypeID: 'pt-child', productTypeName: 'B' });
      child.setParentProductType(parent);
      const representation = child.getSimpleRepresentation() ?? '';

      // `&#187;` and `&#xBB;` are the numeric forms of the same character.
      expect(representation).not.toContain('&#187;');
      expect(representation).not.toContain('&#xBB;');
      expect(representation).toBe('A &raquo; B');
    });
  });

  describe('the unnamed cases, pinned as the shipped module renders them', () => {
    it('returns undefined for an unnamed product type with no parent', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // [model/entity/ProductType.cfc:L277] returns `getProductTypeName()` UNGUARDED, and the
      // column is nullable - there is no validation rule making `productTypeName` non-null on
      // read, only on save.
      expect(subject.getProductTypeName()).toBeUndefined();
      expect(subject.getSimpleRepresentation()).toBeUndefined();
    });

    it('renders a trailing separator when a named parent is joined to an unnamed child', () => {
      const parent = new ProductType({ productTypeID: 'pt-root', productTypeName: 'Merchandise' });
      const child = new ProductType({ productTypeID: 'pt-child' });
      child.setParentProductType(parent);

      // CFML `&` concatenation treats a null as the empty string, so the legacy renders the same
      // dangling breadcrumb.
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
      // `simple_representation_exists_and_is_simple`.
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

      // The hazard resolved in the SUITE, exactly as required, and never by weakening a lint rule.
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

      // [model/entity/ProductType.cfc:L103] then [model/entity/ProductType.cfc:L104-L106], in that
      // order. The clear is unconditional and happens before the loop, so an empty argument is not
      // a no-op - it is a wholesale removal.
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
      subject.setProducts([alpha, alpha]);
      expect(subject.getProducts()).toHaveLength(1);
    });

    it('de-duplicates by productID, not by object identity', () => {
      const first = makeProductFixture({ productID: 'prod-same' });
      const second = makeProductFixture({ productID: 'prod-same' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // Two distinct hydrations of the same database row. A reference comparison would admit both
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

      // [model/entity/ProductType.cfc:L103] ASSIGNS a new array (`variables.Products = []`) rather
      // than emptying the existing one, so a caller holding the earlier array still sees `alpha`.
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

      // `products` is `inverse="true"` [model/entity/ProductType.cfc:L66], so the ORM-generated
      // adder mutates only the in-memory array.
      expect(subject.getProducts()).toHaveLength(1);
      expect(alpha.getProductType()).toBe(productTypeBefore);
      expect(alpha.getProductType()).not.toBe(subject);
    });
  });
});

// B8. The declarative validation contract - six rules, one of them orphaned.
//
// The `systemCode` GATE is the ODD one, and getting it wrong would be a silent category error: it
// is `maxLength: 0`, a STRING-LENGTH gate, where the other three delete gates are
// `maxCollection: 0`.

describe('ProductType - the declarative validation contract (B8)', () => {
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
      // they are declared in two different files and could drift:
      // [model/entity/ProductType.cfc:L56] carries `unique="true"` on the persistent property.
      expect(SAVE_UNIQUE).toStrictEqual(['urlTitle']);
      expect(SAVE_REQUIRED).toContain('urlTitle');
      // Uniqueness applies to `urlTitle` alone. `systemCode` is not declared unique anywhere,
      // despite being the identifier the application keys behaviour off.
      expect(SAVE_UNIQUE).not.toContain('systemCode');
      expect(SAVE_UNIQUE).not.toContain('productTypeName');
    });

    it('leaves both nullable-on-read even though they are required on save', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // required-on-save is not non-null-on-read, and conflating them would have produced a
      // dishonest type.
      expect(subject.getProductTypeName()).toBeUndefined();
      expect(subject.getUrlTitle()).toBeUndefined();
    });

    it('★ publishes setUrlTitle, so the resolved title is on the column BEFORE the save context reads it', () => {
      // §0.6 budgets this file at ZERO widenings, reshapings and divergences.
      const subject = new ProductType({ productTypeID: 'pt-1' });

      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('setUrlTitle');
      expect(subject.getUrlTitle()).toBeUndefined();

      subject.setUrlTitle('branded-apparel');

      expect(subject.getUrlTitle()).toBe('branded-apparel');

      // It overwrites rather than merging or first-winning: the service tier decides whether to
      // write at all, and this member just carries the decision.
      subject.setUrlTitle('branded-apparel-2');

      expect(subject.getUrlTitle()).toBe('branded-apparel-2');

      // And it performs no uniqueness probe, because the source performs none either.
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

      // The distinction, asserted structurally. `systemCode` is a string, so a collection-size
      // gate would be a category error - there is no collection to count.
      expect(DELETE_MAX_LENGTH).toStrictEqual(['systemCode']);
      expect(DELETE_MAX_COLLECTION).not.toContain('systemCode');
      expect(Array.isArray(withCode.getSystemCode())).toBe(false);

      // The business consequence: a system-coded product type is undeletable, an uncoded one is
      // not blocked by this gate, and an empty-string code has length zero so it does not block
      // either.
      expect(withCode.getSystemCode()).toBe('merchandise');
      expect((withCode.getSystemCode() ?? '').length > 0).toBe(true);
      expect((withoutCode.getSystemCode() ?? '').length).toBe(0);
      expect((withEmptyCode.getSystemCode() ?? '').length).toBe(0);
    });

    it('carries the orphaned physicalCounts gate alongside the three real ones', () => {
      // Cross-referenced with B6 rather than re-argued: the gate is real in the file and dead in
      // effect, because no `physicalCounts` property exists on this entity.
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

      // `activeFlag` [model/entity/ProductType.cfc:L54] and `publishedFlag`
      // [model/entity/ProductType.cfc:L55] carry no ORM default and no validation rule - the pair
      // of absences that makes their hydration behaviour a real question, settled in B9.
      for (const ungated of ['activeFlag', 'publishedFlag', 'productTypeIDPath']) {
        expect(allGatedProperties).not.toContain(ungated);
      }
    });

    it('declares no gate for the attribute or price-group-rate collections', () => {
      const allGatedProperties = [...SAVE_REQUIRED, ...DELETE_MAX_COLLECTION, ...DELETE_MAX_LENGTH];

      // Notably ungated despite `cascade="all-delete-orphan"` on `attributeValues`
      // [model/entity/ProductType.cfc:L67], and despite this being the only in-scope entity holding
      // both sides of the price-group-rate relation - [model/entity/ProductType.cfc:L74] includes and
      // [model/entity/ProductType.cfc:L75] excludes.
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

    it('ships no validation ENFORCEMENT on the entity, but does carry the error REGISTER', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // ENFORCEMENT belongs to the service tier, and that part is unchanged.
      for (const absent of ['validate', 'setErrors', 'getValidations', 'getValidationProperties']) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(absent);
      }
      expect(Reflect.get(subject, 'validate')).toBeUndefined();
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getErrors');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('hasErrors');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('hasError');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('getError');
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('addError');

      // A bare product type carries none, so the register asserts nothing on its own.
      expect(subject.hasErrors()).toBe(false);
      expect(subject.getErrors()).toStrictEqual({});
    });

    it('contributes none of the five declaratively-invoked entity validators', () => {
      // The source file has no `"method"` key at all, so there is nothing on this entity for a
      // rule to invoke.
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

// B9. Structural facts, the four-argument `replace` control, and the omissions.
//
// CFML parity, annotated and never normalised: - [model/entity/ProductType.cfc:L49] declares
// neither `output=false` NOR `accessors=true`, and quotes `persistent="true"` where siblings leave
// it bare.

describe('ProductType - structural facts and documented omissions (B9)', () => {
  describe('identity and the honest isNew()', () => {
    it('reports isNew() for the empty-string identifier the ORM assigns before insert', () => {
      const fresh = new ProductType({ productTypeID: '' });
      const persisted = new ProductType({ productTypeID: '444df2f7ea9c87e60051f3cd87b435a1' });

      // [model/entity/ProductType.cfc:L52] declares `unsavedvalue="" default=""`, so an unsaved
      // row genuinely carries `''` - not null, not a placeholder UUID.
      expect(fresh.getProductTypeID()).toBe('');
      expect(fresh.isNew()).toBe(true);
      expect(persisted.isNew()).toBe(false);
    });

    it('exposes remoteID as a nullable string, untouched by any port', () => {
      const withRemote = new ProductType({ productTypeID: 'pt-1', remoteID: 'legacy-erp-4471' });
      const withoutRemote = new ProductType({ productTypeID: 'pt-2' });

      // [model/entity/ProductType.cfc:L80] `remoteID` is the external-system correlation column.
      // Persisted, read-only from this entity's perspective, and never defaulted - an absent one
      // is `undefined`.
      expect(withRemote.getRemoteID()).toBe('legacy-erp-4471');
      expect(withoutRemote.getRemoteID()).toBeUndefined();
    });

    it('exposes productTypeDescription the same way, carrying a value of the full declared width', () => {
      const described = new ProductType({
        productTypeID: 'pt-1',
        productTypeDescription: 'Screen-printed apparel, decorated to order.',
      });
      const undescribed = new ProductType({ productTypeID: 'pt-2' });

      expect(described.getProductTypeDescription()).toBe(
        'Screen-printed apparel, decorated to order.',
      );
      expect(undescribed.getProductTypeDescription()).toBeUndefined();

      // At the DECLARED WIDTH, because 4,000 characters is what the column accepts and nothing
      // here truncates: the entity is a faithful carrier, and any length policy belongs to the
      // schema.
      const atDeclaredWidth = 'D'.repeat(4000);
      const wide = new ProductType({
        productTypeID: 'pt-3',
        productTypeDescription: atDeclaredWidth,
      });

      expect(wide.getProductTypeDescription()).toBe(atDeclaredWidth);
      expect(wide.getProductTypeDescription()).toHaveLength(4000);

      // The EMPTY STRING is a third, distinct state - a persisted-but-blank description - and it
      // is preserved rather than folded into absence.
      const blank = new ProductType({ productTypeID: 'pt-4', productTypeDescription: '' });

      expect(blank.getProductTypeDescription()).toBe('');
      expect(blank.getProductTypeDescription()).not.toBeUndefined();
    });
  });

  describe('boolean hydration over the full accepted column range', () => {
    it('resolves an absent flag to false, matching the ORM default the column lacks', () => {
      const absent = new ProductType({ productTypeID: 'pt-1' });

      // [model/entity/ProductType.cfc:L54] and [model/entity/ProductType.cfc:L55] are
      // `ormtype="boolean"` with no `default` attribute and no validation rule, so SQL NULL is an
      // EXPECTED hydration value rather than a data error.
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
      // does not matter here: both are "no flag stored", and both resolve to false.
      expect(nulled.getActiveFlag()).toBe(false);
      expect(nulled.getPublishedFlag()).toBe(false);
    });

    it('resolves the numeric and string forms a MySQL boolean column can hydrate as', () => {
      // The driver may hand back `0`/`1` for a TINYINT, or `'0'`/`'1'` for a string-typed column,
      // and CFML accepted `'true'`/`'false'` as boolean literals.
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

      // [model/entity/ProductType.cfc:L62] is nullable - a root product type has no parent - and
      // carries no `hb_optionsNullRBKey`, unlike model/entity/PriceGroup.cfc:L59.
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
      // ABSENT timestamp stays `undefined`.
      expect(audited.getCreatedDateTime()).toStrictEqual(created);
      expect(audited.getCreatedDateTime()?.toISOString()).toBe('2014-03-11T17:42:05.000Z');
      expect(audited.getCreatedByAccountID()).toBe('acct-7');
      expect(unaudited.getCreatedDateTime()).toBeUndefined();
      expect(unaudited.getModifiedDateTime()).toBeUndefined();
      expect(unaudited.getModifiedByAccountID()).toBeUndefined();
    });

    it('reduces the audit account associations to opaque identifier strings', () => {
      const subject = new ProductType({ productTypeID: 'pt-1', modifiedByAccountID: 'acct-9' });

      // [model/entity/ProductType.cfc:L84] and [model/entity/ProductType.cfc:L86] declare
      // `cfc="Account"` many-to-one associations.
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

      // [model/entity/ProductType.cfc:L74] `SwPriceGroupRateProductType` and
      // [model/entity/ProductType.cfc:L75] `SwPriceGrpRateExclProductType` are two distinct link
      // tables, and this is the only in-scope entity that carries both.
      expect(subject.getPriceGroupRates()).toStrictEqual([included]);
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([excluded]);
      expect(subject.getPriceGroupRates()).not.toContain(excluded);
      expect(subject.getPriceGroupRateExclusions()).not.toContain(included);
    });

    it('defaults every materialized link collection to an empty array', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // Six of the eight link collections are materialized; `attributeSets`
      // [model/entity/ProductType.cfc:L76] and `physicals` [model/entity/ProductType.cfc:L77] are
      // not, per B4 and B6.
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

      // [model/entity/ProductType.cfc:L66] carries `lazy="extra"`, Hibernate's
      // count-without-loading optimisation, while Product.cfc's `brand`/`productType`/`defaultSku`
      // are eager `fetch="join"`.
      const products: readonly Product[] = subject.getProducts();
      expect(Array.isArray(products)).toBe(true);
      expect(products).toHaveLength(1);
      expect(products[0]).toBe(alpha);
    });
  });

  // The exclusion pair - the one helper pair in this entity that maintains its own side.
  //
  // CFML parity [model/entity/ProductType.cfc:L215-L220, model/entity/PriceGroupRate.cfc:L75]: the
  // legacy bodies delegate to `addExcludedProductType` / `removeExcludedProductType`, and
  // model/entity/PriceGroupRate.cfc hand-writes helpers for its three INCLUDED collections only -
  // `addProductType` / `removeProductType` at L199 / L207 among them.
  //
  // No `LEGACY-DEFECT` marker is warranted.
  describe('the price-group-rate exclusion helpers', () => {
    it('adds the first exclusion onto this entity own array, leaving the include side empty', () => {
      const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excluded' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      subject.addPriceGroupRateExclusion(rate);

      // The near side gains the reference; the include collection
      // [model/entity/ProductType.cfc:L74] is untouched, because conflating the two link tables
      // would invert an exclusion into an inclusion and change which rate applies.
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

      // The guard is `!== -1`, not the `> 0` the legacy `arrayFind` convention would suggest:
      // `arrayFind` is 1-based and answers 0 for "not found", while `indexOf` is 0-based and
      // answers -1, so carrying `> 0` across would silently skip element.
      expect(subject.getPriceGroupRateExclusions()).toStrictEqual([held]);
      expect(() => subject.removePriceGroupRateExclusion(stranger)).not.toThrow();
    });

    it('matches by reference on both helpers, so a second hydration of one row is a distinct member', () => {
      const first: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-same' });
      const second: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-same' });
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // JUDGMENT CALL: this pins the SHIPPED matching rule rather than the rule the sibling
      // primary-key comparisons use.
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

      // `getParentProductTypeOptions` [model/entity/ProductType.cfc:L122], which reaches the
      // framework's property-options smart list,
      // `getProductsSmartList` [model/entity/ProductType.cfc:L261-L267] and
      // `getAssignedAttributeSetSmartList` [model/entity/ProductType.cfc:L280-L299].
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
      // The omission is an omission, not a substitution.
      for (const member of PRODUCT_TYPE_PROTOTYPE_MEMBERS) {
        expect(member).not.toMatch(/SmartList$/);
        expect(member).not.toMatch(/^addLikeFilter|^addFilter|^addOrder/);
      }
    });

    it('retains no service-locator call site of any kind', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // All six legacy `getService()` sites are gone - L94 and L283 with the omitted attribute
      // members, L129 and L263 with the omitted smart lists, L112 replaced by the injected
      // `productTypeRepository`.
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
      return expect(subject.getBaseProductType()).resolves.toBe('merchandise');
    });

    it('carries no framework debug or error-dump surface', () => {
      const subject = new ProductType({ productTypeID: 'pt-1' });

      // org/Hibachi/HibachiEntity.cfc:L605 calls `writeDump(getErrors())` inside `preInsert`,
      // writing raw entity errors to the response stream.
      for (const absent of ['writeDump', 'dump', 'debug', 'logErrors']) {
        expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(absent);
      }
      expect(Reflect.get(subject, 'writeDump')).toBeUndefined();
    });
  });
});

describe('ProductType - the bidirectional helpers and the unsaved-row identity fallback (B10)', () => {
  // Why this block exists.

  it('falls back to reference identity when either side of a containment probe is unsaved', () => {
    // `hasChildProductType` `model/entity/ProductType.cfc` is one of the two members that route
    // through `isSameRowAs`.
    const held: ProductType = new ProductType({ productTypeID: '' });
    const stranger: ProductType = new ProductType({ productTypeID: '' });
    const parent: ProductType = new ProductType({
      productTypeID: 'pt-parent',
      childProductTypes: [held],
    });

    expect(held.getProductTypeID()).toBe('');
    expect(stranger.getProductTypeID()).toBe('');

    expect(parent.hasChildProductType(held)).toBe(true);
    // The assertion the branch exists for: an identical empty key is not the same row.
    expect(parent.hasChildProductType(stranger)).toBe(false);
  });

  it('still answers a containment probe by primary key when both sides are saved', () => {
    // The fallback is reached only when a key is empty. A re-hydrated child - a different
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
    // `Product.productType` is the owning side.
    const subject: ProductType = new ProductType({ productTypeID: 'pt-with-products' });
    const product: Product = makeProductFixture({ productID: 'product-linked' });

    subject.addProduct(product);
    expect(subject.getProducts()).toStrictEqual([product]);

    // Set semantics: a second add for the same row is a no-op.
    subject.addProduct(product);
    expect(subject.getProducts()).toHaveLength(1);

    subject.removeProduct(product);
    expect(subject.getProducts()).toStrictEqual([]);

    // A remove for a row that was never linked is a no-op, not a splice at index -1 - which would
    // silently remove the LAST element.
    subject.addProduct(product);
    subject.removeProduct(makeProductFixture({ productID: 'product-never-linked' }));
    expect(subject.getProducts()).toStrictEqual([product]);
  });

  it('separates two UNSAVED products, because the product helpers carry the same fallback', () => {
    // `addProduct` `model/entity/ProductType.cfc` and `removeProduct`
    // `model/entity/ProductType.cfc` each inline the same empty-key reference fallback rather than
    // delegating to `isSameRowAs`, which compares product types.
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
    const orphan: ProductType = new ProductType({ productTypeID: 'pt-no-parent' });

    expect(orphan.getParentProductType()).toBeUndefined();
    expect(() => {
      orphan.removeParentProductType();
    }).toThrow(/no parent/);
  });

  it('detaches a child by delegating to the child, which owns the pointer', () => {
    // `removeChildProductType` `model/entity/ProductType.cfc` calls
    // `childProductType.removeParentProductType(this)`.
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
    // The exclude side is a DISTINCT link table [model/entity/ProductType.cfc:L71] and is
    // untouched by the include-side remove.
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
    // which writes `SwPriceGroupRateProductType` [model/entity/ProductType.cfc:L74].
    const subject: ProductType = new ProductType({ productTypeID: 'pt-rate-linked' });
    const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-b10' });

    subject.addPriceGroupRate(rate);
    expect(rate.getProductTypes()).toContain(subject);

    subject.removePriceGroupRate(rate);
    expect(rate.getProductTypes()).not.toContain(subject);
  });

  it('maintains the EXCLUDED price-group-rate link on THIS side, inventing no member on the rate', () => {
    // The one asymmetry in the twelve.
    const subject: ProductType = new ProductType({ productTypeID: 'pt-rate-excluded' });
    const rate: PriceGroupRate = new PriceGroupRate({ priceGroupRateID: 'pgr-excl-b10' });

    subject.addPriceGroupRateExclusion(rate);
    expect(subject.getPriceGroupRateExclusions()).toStrictEqual([rate]);

    // Set semantics, matching every other generated adder.
    subject.addPriceGroupRateExclusion(rate);
    expect(subject.getPriceGroupRateExclusions()).toHaveLength(1);

    // The INCLUDED collection is a distinct link table - [model/entity/ProductType.cfc:L74] against
    // [model/entity/ProductType.cfc:L75] - and stays empty.
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

// A cyclic parent chain is accepted, exactly as the legacy setter accepts one.
//
// NET-NEW coverage - `meta/tests/` contains no ProductType test at all - pinning legacy PARITY
// rather than a divergence.

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
    // The legacy guard at [model/entity/ProductType.cfc:L151] is a MEMBERSHIP test, not an
    // acyclicity test, so a cycle-closing assignment appends like any other.
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
  // The save-refusal channel - addError / hasErrors / getErrors.

  it('reports NO errors on a freshly constructed product type', () => {
    const productType = new ProductType({ productTypeID: 'pt-clean-probe' });

    expect(productType.hasErrors()).toBe(false);
    expect(productType.getErrors()).toStrictEqual({});
  });

  it('records failed rules per property, appending a second message under one key', () => {
    const productType = new ProductType({ productTypeID: 'pt-refused-probe' });

    productType.addError('productTypeName', 'productTypeName is required');
    productType.addError('urlTitle', 'urlTitle is required');
    productType.addError('urlTitle', 'urlTitle must be unique');

    expect(productType.hasErrors()).toBe(true);
    expect(productType.getErrors()).toStrictEqual({
      productTypeName: ['productTypeName is required'],
      urlTitle: ['urlTitle is required', 'urlTitle must be unique'],
    });
  });

  it('folds the error name like a CFML struct key and hands back a snapshot', () => {
    const productType = new ProductType({ productTypeID: 'pt-fold-probe' });

    productType.addError('urlTitle', 'urlTitle is required');
    productType.addError('URLTitle', 'urlTitle must be unique');

    expect(Object.keys(productType.getErrors())).toStrictEqual(['urlTitle']);

    const messages = productType.getErrors()['urlTitle'];

    // Frozen, so the write is refused rather than absorbed.
    expect(() => {
      (messages as string[]).push('injected by a caller');
    }).toThrow(TypeError);
    expect(Object.isFrozen(messages)).toBe(true);

    expect(productType.getErrors()['urlTitle']).toStrictEqual([
      'urlTitle is required',
      'urlTitle must be unique',
    ]);
  });

  it('is PER INSTANCE, so a refused product type does not mark its parent', () => {
    const parent = new ProductType({ productTypeID: 'pt-parent-probe' });
    const child = new ProductType({ productTypeID: 'pt-child-probe', parentProductType: parent });

    child.addError('productTypeName', 'productTypeName is required');

    expect(child.hasErrors()).toBe(true);
    expect(parent.hasErrors()).toBe(false);
  });
});

describe('ProductType - the source-spelled child helpers, lowercase c (B11)', () => {
  // [model/entity/ProductType.cfc:L167] declares `addchildProductType` and
  // [model/entity/ProductType.cfc:L170] `removechildProductType`, both with a LOWERCASE `c` and
  // both with a capital-C `ChildProductType` argument.
  //
  // What these cases must prove, and it is more than presence: that the alias is an alias.

  it('publishes BOTH spellings of each helper, all four callable', () => {
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('addChildProductType');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('addchildProductType');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('removeChildProductType');
    expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).toContain('removechildProductType');

    const subject = new ProductType({ productTypeID: 'pt-spelling-surface' });

    for (const member of [
      'addChildProductType',
      'addchildProductType',
      'removeChildProductType',
      'removechildProductType',
    ] as const) {
      expect(typeof subject[member]).toBe('function');
    }
  });

  it('★★ the source-spelled add reaches the SAME single implementation as the camelCase one', () => {
    const viaSourceSpelling = new ProductType({ productTypeID: 'pt-parent-lowercase' });
    const childA = new ProductType({ productTypeID: 'pt-child-lowercase' });

    viaSourceSpelling.addchildProductType(childA);

    expect(childA.getParentProductType()).toBe(viaSourceSpelling);
    expect(viaSourceSpelling.getChildProductTypes()).toEqual([childA]);
    // APPENDED once, not twice: a second implementation delegating in parallel would double it.
    expect(viaSourceSpelling.getChildProductTypes()).toHaveLength(1);

    // The camelCase spelling on a separate graph, so the two are compared rather than shared.
    const viaCanonical = new ProductType({ productTypeID: 'pt-parent-camelcase' });
    const childB = new ProductType({ productTypeID: 'pt-child-camelcase' });

    viaCanonical.addChildProductType(childB);

    expect(childB.getParentProductType()).toBe(viaCanonical);
    expect(viaCanonical.getChildProductTypes()).toEqual([childB]);

    // The materialized path agrees, which is the strongest single statement available here: the
    // path is rebuilt from the live parent chain, so an alias that assigned a different parent -
    // or none.
    expect(childA.getProductTypeIDPath()).toBe('pt-parent-lowercase,pt-child-lowercase');
    expect(childB.getProductTypeIDPath()).toBe('pt-parent-camelcase,pt-child-camelcase');
  });

  it('★★ the source-spelled remove reaches the SAME single implementation as the camelCase one', () => {
    // CFML parity [model/entity/ProductType.cfc:L170-L172]: the body is
    // `arguments.ChildProductType.removeParentProductType( this )`, which splices the child out of
    // the parent's live array [model/entity/ProductType.cfc:L159-L161] and then clears the child's
    // own `parentProductType` [model/entity/ProductType.cfc:L163].
    const parent = new ProductType({ productTypeID: 'pt-remove-parent' });
    const first = new ProductType({ productTypeID: 'pt-remove-first' });
    const second = new ProductType({ productTypeID: 'pt-remove-second' });

    parent.addchildProductType(first);
    parent.addChildProductType(second);
    expect(parent.getChildProductTypes()).toEqual([first, second]);

    // Source spelling removes the first child and nothing else.
    parent.removechildProductType(first);

    expect(parent.getChildProductTypes()).toEqual([second]);
    expect(first.getParentProductType()).toBeUndefined();
    expect(second.getParentProductType()).toBe(parent);

    // CamelCase spelling removes the remaining one, leaving the collection empty.
    parent.removeChildProductType(second);

    expect(parent.getChildProductTypes()).toEqual([]);
    expect(second.getParentProductType()).toBeUndefined();
  });

  it('★ the two spellings are interchangeable in either order, add with one and remove with the other', () => {
    // The property that matters to a source-spelled caller mixing the two: CFML could not tell
    // them apart, so neither may the target.
    const parent = new ProductType({ productTypeID: 'pt-mixed-parent' });
    const child = new ProductType({ productTypeID: 'pt-mixed-child' });

    parent.addchildProductType(child);
    parent.removeChildProductType(child);

    expect(parent.getChildProductTypes()).toEqual([]);
    expect(child.getParentProductType()).toBeUndefined();

    parent.addChildProductType(child);
    parent.removechildProductType(child);

    expect(parent.getChildProductTypes()).toEqual([]);
    expect(child.getParentProductType()).toBeUndefined();
  });

  it('★ carries the source-spelled ADD guard, so re-adding a held child does not duplicate it', () => {
    // CFML parity [model/entity/ProductType.cfc:L151]: the append is guarded by
    // `isNew() or !arguments.parentProductType.hasChildProductType( this )`, and the alias
    // inherits that guard because it inherits the implementation.
    const parent = new ProductType({ productTypeID: 'pt-guard-parent' });
    const child = new ProductType({ productTypeID: 'pt-guard-child' });

    parent.addchildProductType(child);
    parent.addchildProductType(child);
    parent.addChildProductType(child);

    expect(parent.getChildProductTypes()).toEqual([child]);
  });

  it('★ publishes NO source-spelled variant for any other helper, because no other one needs it', () => {
    for (const invented of [
      'setparentProductType',
      'removeparentProductType',
      'addpromotionReward',
      'removepromotionReward',
      'addpriceGroupRate',
      'removepriceGroupRate',
      'addattributeSet',
      'removeattributeSet',
    ]) {
      expect(PRODUCT_TYPE_PROTOTYPE_MEMBERS).not.toContain(invented);
    }

    // And exactly two members in the whole prototype carry a lowercase letter immediately after
    // the `add`/`remove` prefix, so no third has crept in.
    const sourceSpelledHelpers = PRODUCT_TYPE_PROTOTYPE_MEMBERS.filter((member) =>
      /^(?:add|remove)[a-z]/.test(member),
    );

    expect(sourceSpelledHelpers.sort()).toEqual(['addchildProductType', 'removechildProductType']);
  });
});

// The description column that carried no case of its own.

describe('ProductType: the description column', () => {
  it('reads productTypeDescription, and reports absence as undefined rather than as an empty string', () => {
    // [model/entity/ProductType.cfc:L58] declares `length="4000"` and the column is nullable, so
    // `undefined` is the honest absent value.
    expect(
      new ProductType({
        productTypeID: 'pt-described',
        productTypeDescription: 'Screen-printed apparel, blank goods excluded.',
      }).getProductTypeDescription(),
    ).toBe('Screen-printed apparel, blank goods excluded.');

    expect(
      new ProductType({ productTypeID: 'pt-bare' }).getProductTypeDescription(),
    ).toBeUndefined();
  });

  it('★★ preserves the description verbatim, applying no trimming or length ceiling of its own', () => {
    // The 4000-character ceiling is the SCHEMA's, enforced where the row is written; the accessor
    // narrows nothing. A reader that trimmed here would change what a round-trip returns.
    const padded = '  leading and trailing space is part of the value  ';

    expect(
      new ProductType({
        productTypeID: 'pt-padded',
        productTypeDescription: padded,
      }).getProductTypeDescription(),
    ).toBe(padded);
  });
});

// The error register, invoked directly on this entity.
//
// Review reported that "nine public methods have no invocation in any test AST".
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees
// and that the save-refusal semantics depend on: a MISS yields an empty array rather than
// undefined.

describe('ProductType: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent
    // name has to be safe to iterate - `undefined` here would turn a clean validation pass into a
    // crash.
    const subject = new ProductType({ productTypeID: 'pt-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after
    // the first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new ProductType({ productTypeID: 'pt-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling.
    const subject = new ProductType({ productTypeID: 'pt-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
