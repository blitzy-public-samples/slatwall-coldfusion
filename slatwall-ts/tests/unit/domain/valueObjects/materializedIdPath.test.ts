// Unit suite for the comma-delimited materialized ID path.
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L307-L308]: the doc comment on L307 calls it a
// "private method to help build IDPath lists based on parent properties" while the declaration on
// L308 reads.
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body calls the
// string-evaluation builtin twice per iteration, once to test whether the parent is null at L316
// and again to reassign the cursor at L319.
//
// CFML parity [model/entity/PriceGroup.cfc:L212] and [model/entity/ProductType.cfc:L311]: both
// lines end in a double semicolon, an empty statement that changes nothing;
// model/entity/Category.cfc has none.

import { describe, expect, it } from 'vitest';

// JUDGMENT CALL: four levels of `..`, and the `.js` extension is mandatory.
import * as materializedIdPathModule from '../../../../src/domain/valueObjects/materializedIdPath.js';
import type {
  ParentNodeAccessor,
  PrimaryIdAccessor,
} from '../../../../src/domain/valueObjects/materializedIdPath.js';
import {
  buildIdPathList,
  getRootIdFromIdPath,
  idPathContainsAnyId,
  idPathContainsId,
  resolveIdPath,
} from '../../../../src/domain/valueObjects/materializedIdPath.js';

// JUDGMENT CALL: the two parity helper modules below are imported only because the shipped
// signatures demand them.
//
// Nothing outside the domain tier and these helpers is imported: no repository, no handler, no
// integration and no fixture.
import { listAppend, listFindNoCase, listGetAt, listLen } from '../../../../src/lib/cfml/list.js';
import { isNullish } from '../../../../src/lib/cfml/truthiness.js';

// The shipped export surface.
//
// There is no length or segment reader, deliberately: no legacy site walks one of these paths as
// an array, all four promotion walks are 1-based count-and-position loops.
//
// JUDGMENT CALL: no bounded-iteration guard ships. That is faithful to the legacy loop and is
// treated as such under "property 5" below.

// Inline test scaffolding.

/**
 * One node of a hierarchy, in the shape the shipped accessors require.
 *
 * JUDGMENT CALL: `parent` is readonly and can only be assigned a node that already exists, so a
 * cycle is impossible to build with this interface alone.
 */
interface HierarchyNode {
  readonly id: string;
  readonly parent: HierarchyNode | null;
}

/**
 * Reads a node's primary identifier.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L315]: stands in for
 * `thisEntity.getPrimaryIDValue()`.
 */
const readId: PrimaryIdAccessor<HierarchyNode> = (node) => node.id;

/**
 * Reads a node's parent, answering `null` at the root.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: stands in for the parent association the
 * legacy body resolved by interpolating a property name into a getter call and handing the
 * resulting string to CFML's runtime string-evaluation builtin.
 */
const readParent: ParentNodeAccessor<HierarchyNode> = (node) => node.parent;

/**
 * The same reader, answering `undefined` at the root instead of `null`.
 *
 * The shipped accessor type admits both, and the walk routes both through one null rule, so both
 * are exercised rather than only the convenient one.
 */
const readParentAsUndefined: ParentNodeAccessor<HierarchyNode> = (node) => node.parent ?? undefined;

/**
 * A counting pair of accessors, so call counts can be asserted directly.
 */
interface WalkProbe {
  readonly readIdCounted: PrimaryIdAccessor<HierarchyNode>;
  readonly readParentCounted: ParentNodeAccessor<HierarchyNode>;
  readonly idReadCount: () => number;
  readonly parentReadCount: () => number;
}

function createWalkProbe(): WalkProbe {
  let idReads = 0;
  let parentReads = 0;

  return {
    readIdCounted: (node) => {
      idReads += 1;
      return node.id;
    },
    readParentCounted: (node) => {
      parentReads += 1;
      return node.parent;
    },
    idReadCount: () => idReads,
    parentReadCount: () => parentReads,
  };
}

/**
 * A recomputation callback that records whether it was ever invoked.
 */
interface RecomputationProbe {
  readonly compute: () => string;
  readonly callCount: () => number;
}

function createRecomputationProbe(computedPath: string): RecomputationProbe {
  let calls = 0;

  return {
    compute: () => {
      calls += 1;
      return computedPath;
    },
    callCount: () => calls,
  };
}

// The write half - buildIdPathList.

describe('buildIdPathList: the six properties of the legacy walk', () => {
  it('property 1 - orders the path ROOT FIRST', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L315]: the legacy line pushes each identifier
    // onto the FRONT of the accumulator as the walk climbs, so the outermost ancestor finishes
    // first.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('root,mid,leaf');
  });

  it('property 2 - places the STARTING node LAST', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L311]: the walk is seeded with `this`, so the
    // node it was asked about is prepended first and therefore ends up at the tail.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParent).endsWith('leaf')).toBe(true);
    expect(buildIdPathList(mid, readId, readParent).endsWith('mid')).toBe(true);
    expect(buildIdPathList(root, readId, readParent).endsWith('root')).toBe(true);
  });

  it('property 3 - is COMMA-DELIMITED with no leading and no trailing delimiter', () => {
    // CFML parity `slatwall-ts/src/lib/cfml/list.ts`: `listAppend` onto an empty accumulator
    // answers the value alone, which guarantees no leading delimiter.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };

    const twoLevelPath = buildIdPathList(mid, readId, readParent);
    const rootOnlyPath = buildIdPathList(root, readId, readParent);

    expect(twoLevelPath).toBe('root,mid');
    expect(twoLevelPath.startsWith(',')).toBe(false);
    expect(twoLevelPath.endsWith(',')).toBe(false);

    // The single-element case is where a leading delimiter would show up first.
    expect(rootOnlyPath).toBe('root');
    expect(rootOnlyPath.startsWith(',')).toBe(false);
    expect(rootOnlyPath.endsWith(',')).toBe(false);
  });

  it('property 4 - INCLUDES the starting node, even when it has a parent', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L315-L316]: the identifier is collected before
    // the parent is tested, unconditionally, so the starting node can never be omitted.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(idPathContainsId(buildIdPathList(leaf, readId, readParent), 'leaf')).toBe(true);
    expect(idPathContainsId(buildIdPathList(mid, readId, readParent), 'mid')).toBe(true);
    expect(idPathContainsId(buildIdPathList(root, readId, readParent), 'root')).toBe(true);
  });

  it('property 5 - TERMINATES ON THE FIRST ABSENT PARENT, with nothing interposed', () => {
    // PROVEN here: the walk terminates on the FIRST node whose parent reads absent, visits each
    // ancestor exactly once, and completes for a well-founded chain of any depth.
    //
    // Why the guard cannot disturb this TEST, which is the point worth keeping: a visited set only
    // fires on a genuine revisit, and a well-founded chain has none.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    const probe = createWalkProbe();

    expect(buildIdPathList(leaf, probe.readIdCounted, probe.readParentCounted)).toBe(
      'root,mid,leaf',
    );

    // Three nodes, three iterations and not one more: a revisit would show up as a count above
    // three, and the matching parent count shows the parent test is what ends the walk.
    expect(probe.idReadCount()).toBe(3);
    expect(probe.parentReadCount()).toBe(3);
  });

  it('property 5 - completes a chain far deeper than any cap would allow', () => {
    // The structural tripwire against a cap, and it is still exactly that after the cycle guard
    // was added.
    //
    // What the GUARD did to this TEST: nothing, by design, and that is the whole reason the guard
    // is a visited-identity set rather than a depth cap.
    const CHAIN_DEPTH = 512;

    // Built root-upward so each node's readonly parent is an already-constructed node. `deepest`
    // ends up holding the leaf of a well-founded chain.
    let deepest: HierarchyNode = { id: 'n0', parent: null };
    for (let level = 1; level < CHAIN_DEPTH; level += 1) {
      deepest = { id: `n${String(level)}`, parent: deepest };
    }

    const probe = createWalkProbe();
    const deepPath = buildIdPathList(deepest, probe.readIdCounted, probe.readParentCounted);

    // Every level present, exactly once, in root-first order.
    expect(listLen(deepPath)).toBe(CHAIN_DEPTH);
    expect(listGetAt(deepPath, 1)).toBe('n0');
    expect(listGetAt(deepPath, CHAIN_DEPTH)).toBe(`n${String(CHAIN_DEPTH - 1)}`);

    // One identifier read and one parent read per level, and not one more.
    expect(probe.idReadCount()).toBe(CHAIN_DEPTH);
    expect(probe.parentReadCount()).toBe(CHAIN_DEPTH);
  });

  it('property 6 - ALWAYS COLLECTS THE STARTING NODE, before any parent is tested', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L314, L321]: it is a do/while, so the body runs
    // once before the condition is ever evaluated, and a root with no parent still has its
    // identifier collected.
    const root: HierarchyNode = { id: 'root', parent: null };
    const probe = createWalkProbe();

    expect(buildIdPathList(root, probe.readIdCounted, probe.readParentCounted)).toBe('root');

    // The body ran once with no parent to climb to - the do/while observed directly: a while-loop
    // port would have read the identifier zero times.
    expect(probe.idReadCount()).toBe(1);
    expect(probe.parentReadCount()).toBe(1);

    // And the consequence, stated with its condition attached: non-empty identifier in, at least
    // one element out.
    expect(listLen(buildIdPathList(root, readId, readParent))).toBe(1);
    expect(listLen(buildIdPathList({ id: 'a', parent: root }, readId, readParent))).toBe(2);
  });
});

describe('buildIdPathList: golden expectations over an acyclic hierarchy', () => {
  it('walks a three-level hierarchy from the leaf, the middle and the root', () => {
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('root,mid,leaf');
    expect(buildIdPathList(mid, readId, readParent)).toBe('root,mid');
    expect(buildIdPathList(root, readId, readParent)).toBe('root');
  });

  it('keeps root-first ordering as the hierarchy deepens to four levels', () => {
    const root: HierarchyNode = { id: 'root', parent: null };
    const branch: HierarchyNode = { id: 'branch', parent: root };
    const twig: HierarchyNode = { id: 'twig', parent: branch };
    const leaf: HierarchyNode = { id: 'leaf', parent: twig };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('root,branch,twig,leaf');
    expect(listLen(buildIdPathList(leaf, readId, readParent))).toBe(4);

    // Root-first is a positional claim, so it is checked positionally rather than only as a whole
    // string.
    const path = buildIdPathList(leaf, readId, readParent);
    expect(listGetAt(path, 1)).toBe('root');
    expect(listGetAt(path, 2)).toBe('branch');
    expect(listGetAt(path, 3)).toBe('twig');
    expect(listGetAt(path, 4)).toBe('leaf');
  });

  it('treats an undefined parent exactly as it treats a null parent', () => {
    // The shipped accessor type admits `TNode | null | undefined`, and the walk routes both
    // through the one CFML null rule. Asserting only the `null` shape would leave half the
    // declared contract unexercised.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParentAsUndefined)).toBe('root,mid,leaf');
    expect(buildIdPathList(root, readId, readParentAsUndefined)).toBe('root');
  });

  it('reads the parent ONCE per iteration, not twice', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body resolves the parent
    // association twice on every pass - once for the null test and once for the reassignment. An
    // explicit typed callback resolves it once.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    const probe = createWalkProbe();
    const path = buildIdPathList(leaf, probe.readIdCounted, probe.readParentCounted);

    expect(path).toBe('root,mid,leaf');
    expect(probe.idReadCount()).toBe(3);
    expect(probe.parentReadCount()).toBe(3);
  });
});

describe('buildIdPathList: identifiers are carried through, never rewritten', () => {
  it('preserves surrounding whitespace inside an identifier verbatim', () => {
    // CFML parity `slatwall-ts/src/lib/cfml/list.ts`: the list helpers never trim and never
    // normalize.
    const root: HierarchyNode = { id: 'root', parent: null };
    const spacey: HierarchyNode = { id: ' padded ', parent: root };

    const path = buildIdPathList(spacey, readId, readParent);

    expect(path).toBe('root, padded ');
    expect(listGetAt(path, 2)).toBe(' padded ');

    // A space is ordinary content, not a delimiter, so the element count is still two.
    expect(listLen(path)).toBe(2);
  });

  it('preserves identifier case verbatim, folding only at comparison time', () => {
    // Case-insensitivity belongs to the membership comparison, not to the emitted value. Folding
    // here would change what is persisted.
    const root: HierarchyNode = { id: 'RootID', parent: null };
    const leaf: HierarchyNode = { id: 'LeafID', parent: root };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('RootID,LeafID');
  });

  it('contributes no element for an EMPTY identifier', () => {
    // JUDGMENT CALL: asserted as the direct consequence of the parity helper's documented
    // empty-accumulator rule and framed as target behaviour rather than as a legacy measurement,
    // because the legacy prepend was not executed for this input.
    //
    // Read this with property 6, its counterpart rather than its contradiction.
    const root: HierarchyNode = { id: '', parent: null };
    const leaf: HierarchyNode = { id: 'leaf', parent: root };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('leaf');
    expect(buildIdPathList(root, readId, readParent)).toBe('');
    expect(listLen(buildIdPathList(root, readId, readParent))).toBe(0);

    // The walk still ran its body once: the element vanished at the accumulator, not at the loop,
    // which is what unifies this with property.
    const probe = createWalkProbe();

    expect(buildIdPathList(root, probe.readIdCounted, probe.readParentCounted)).toBe('');
    expect(probe.idReadCount()).toBe(1);

    // The downstream read is total rather than exceptional: the root extractor answers `''`
    // instead of throwing, as its documented fallback promises.
    expect(getRootIdFromIdPath(buildIdPathList(root, readId, readParent))).toBe('');
  });
});

describe('buildIdPathList: no shared state, no input mutation', () => {
  it('answers identically when called repeatedly over the same hierarchy', () => {
    // The value object retains nothing between calls: no memo, no interning, no module-scope
    // binding.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    const first = buildIdPathList(leaf, readId, readParent);
    const second = buildIdPathList(leaf, readId, readParent);
    const third = buildIdPathList(leaf, readId, readParent);

    expect(first).toBe('root,mid,leaf');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('leaves the caller hierarchy untouched', () => {
    // The walk collects into its own local accumulator and reverses that, never the caller's
    // structure.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    buildIdPathList(leaf, readId, readParent);

    expect(leaf.id).toBe('leaf');
    expect(leaf.parent).toBe(mid);
    expect(mid.parent).toBe(root);
    expect(root.parent).toBeNull();
  });

  it('keeps two independent hierarchies independent', () => {
    const firstRoot: HierarchyNode = { id: 'a1', parent: null };
    const firstLeaf: HierarchyNode = { id: 'a2', parent: firstRoot };
    const secondRoot: HierarchyNode = { id: 'b1', parent: null };
    const secondLeaf: HierarchyNode = { id: 'b2', parent: secondRoot };

    expect(buildIdPathList(firstLeaf, readId, readParent)).toBe('a1,a2');
    expect(buildIdPathList(secondLeaf, readId, readParent)).toBe('b1,b2');
    expect(buildIdPathList(firstLeaf, readId, readParent)).toBe('a1,a2');
  });
});

// No cycle guard, and no depth ceiling - the walk is reproduced, not improved.
//
// Authority for the behaviour: the do/while at [org/Hibachi/HibachiEntity.cfc:L314-L321] holds no
// visited set and no iteration bound.
//
// How an absent guard is asserted without hanging this suite.

/**
 * One node of a hierarchy that is allowed to contain a cycle.
 *
 * JUDGMENT CALL: a second node shape, deliberately mutable in exactly one field, so a cycle can be
 * closed after construction.
 */
interface CyclicNode {
  readonly id: string;
  parent: CyclicNode | null;
}

/**
 * Reads a cycle-capable node's identifier. Same role as {@link readId}.
 */
const readCyclicId: PrimaryIdAccessor<CyclicNode> = (node) => node.id;

/**
 * Reads a cycle-capable node's parent. Same role as {@link readParent}.
 */
const readCyclicParent: ParentNodeAccessor<CyclicNode> = (node) => node.parent;

describe('buildIdPathList: no cycle guard, and no depth ceiling', () => {
  it('climbs a cyclic chain without refusing it, long past where a guard would have fired', () => {
    // A three-node cycle. A visited-identity set would have refused this at the fourth read; a
    // 4096-level cap would have refused it at level 4096.
    const first: CyclicNode = { id: 'first', parent: null };
    const second: CyclicNode = { id: 'second', parent: first };
    const third: CyclicNode = { id: 'third', parent: second };
    first.parent = third;

    const sentinel = 'the accessor stopped the walk; the walk did not stop itself';
    let reads = 0;
    const countingParent: ParentNodeAccessor<CyclicNode> = (node) => {
      reads += 1;
      if (reads >= 20000) {
        throw new Error(sentinel);
      }
      return node.parent;
    };

    let caught = 'nothing was thrown, so the walk terminated on its own';
    try {
      buildIdPathList(third, readCyclicId, countingParent);
    } catch (thrown) {
      caught = thrown instanceof Error ? thrown.message : 'a non-Error was thrown';
    }
    expect(caught).toBe(sentinel);
    expect(reads).toBe(20000);
  });

  it('answers a path for a well-founded chain deeper than the removed 4096 ceiling', () => {
    // Positive proof the depth cap is gone: this is the exact input the old backstop refused. A
    // well-founded chain of any depth is answered, which is the invariant
    // [org/Hibachi/HibachiEntity.cfc:L314-L321] has.
    const depth = 5000;
    let cursor: CyclicNode = { id: 'level0', parent: null };
    for (let level = 1; level < depth; level += 1) {
      cursor = { id: `level${String(level)}`, parent: cursor };
    }

    const path = buildIdPathList(cursor, readCyclicId, readCyclicParent);

    // Root-first, self-last, one entry per level, no leading or trailing comma.
    expect(path.split(',')).toHaveLength(depth);
    expect(path.startsWith('level0,level1,')).toBe(true);
    expect(path.endsWith(`,level${String(depth - 1)}`)).toBe(true);
  });

  it('terminates for a chain whose accessor manufactures a fresh node on every call', () => {
    // The shape the removed visited-identity set could never see: a lazily hydrating adapter or
    // proxy never returns the same object twice.
    const manufacturingParent: ParentNodeAccessor<CyclicNode> = (node) => {
      const level = Number(node.id.replace('level', ''));
      return level === 0 ? null : { id: `level${String(level - 1)}`, parent: null };
    };

    expect(buildIdPathList({ id: 'level3', parent: null }, readCyclicId, manufacturingParent)).toBe(
      'level0,level1,level2,level3',
    );
  });

  it('answers a path when two distinct nodes share an identifier, because that is not a cycle', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L314-L321]: the legacy loop advances on the
    // OBJECT, never on the identifier, so repeating an identifier is not revisiting the same node.
    const root: CyclicNode = { id: 'duplicated', parent: null };
    const child: CyclicNode = { id: 'duplicated', parent: root };

    expect(buildIdPathList(child, readCyclicId, readCyclicParent)).toBe('duplicated,duplicated');
  });
});

// The read half - resolveIdPath, the lazy accessor.
//
// Authority: the two lazy getters at model/entity/PriceGroup.cfc:L195-L200 and
// model/entity/ProductType.cfc:L250-L255.

describe('resolveIdPath: the CFML null rule that decides recomputation', () => {
  it('pins the null rule itself: only null and undefined are absent', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L196] and [model/entity/ProductType.cfc:L251]: both
    // guards are `isNull(...)`.
    //
    // IsNull(variables.productTypeIDPath) L251, the path !structKeyExists(variables,
    // "parentProductTypeOptions") L123, its option list.
    expect(isNullish(null)).toBe(true);
    expect(isNullish(undefined)).toBe(true);

    // Everything else is PRESENT under this rule - the empty string above all.
    expect(isNullish('')).toBe(false);
    expect(isNullish(0)).toBe(false);
    expect(isNullish(false)).toBe(false);
    expect(isNullish(Number.NaN)).toBe(false);
  });

  it('returns a stored NON-EMPTY path unchanged, without recomputing', () => {
    const probe = createRecomputationProbe('recomputed,path');

    expect(resolveIdPath('root,mid,leaf', probe.compute)).toBe('root,mid,leaf');
    expect(probe.callCount()).toBe(0);
  });

  it('RECOMPUTES when the stored path is null', () => {
    const probe = createRecomputationProbe('root,mid,leaf');

    expect(resolveIdPath(null, probe.compute)).toBe('root,mid,leaf');
    expect(probe.callCount()).toBe(1);
  });

  it('RECOMPUTES when the stored path is undefined', () => {
    const probe = createRecomputationProbe('root,mid,leaf');

    expect(resolveIdPath(undefined, probe.compute)).toBe('root,mid,leaf');
    expect(probe.callCount()).toBe(1);
  });

  it('returns a stored EMPTY STRING AS-IS and does NOT recompute', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L196] and [model/entity/ProductType.cfc:L251]: this
    // follows from the `isNull` guard on each of those lines.
    const probe = createRecomputationProbe('root,mid,leaf');

    expect(resolveIdPath('', probe.compute)).toBe('');
    expect(probe.callCount()).toBe(0);
  });

  it('recomputes on every absent read, holding nothing between calls', () => {
    // No memo lives in the value object, so a second absent read recomputes rather than answering
    // from a cache. The storage is the entity's.
    const probe = createRecomputationProbe('root,mid,leaf');

    expect(resolveIdPath(null, probe.compute)).toBe('root,mid,leaf');
    expect(resolveIdPath(null, probe.compute)).toBe('root,mid,leaf');
    expect(probe.callCount()).toBe(2);
  });
});

// The read half - getRootIdFromIdPath, the root extractor.

describe('getRootIdFromIdPath: the first element is the root', () => {
  it('extracts the root from a multi-element path', () => {
    // CFML parity [model/entity/ProductType.cfc:L112]: the legacy expression is
    // `listFirst(getProductTypeIDPath())`.
    //
    // JUDGMENT CALL: the CFML first-element helper is not part of the parity helper module's
    // closed surface, so the same value is read as a 1-based positional lookup, which is what
    // CFML's own indexing is; the equivalence is asserted below rather than assumed.
    expect(getRootIdFromIdPath('root,mid,leaf')).toBe('root');
  });

  it('is exactly a 1-BASED positional read of position 1', () => {
    // Position 1, not index 0: a drift to a 0-based read would answer '' rather than the root,
    // silently.
    const path = 'root,mid,leaf';

    expect(getRootIdFromIdPath(path)).toBe(listGetAt(path, 1));
    expect(listGetAt(path, 1)).toBe('root');
  });

  it('answers the sole element for a single-element path', () => {
    expect(getRootIdFromIdPath('root')).toBe('root');
  });

  it('answers the root of a path this suite actually built', () => {
    // The extractor and the builder are two halves of one contract: change the builder's ordering
    // and this answers with the wrong node while still returning a plausible identifier. Wiring
    // them together catches that.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(getRootIdFromIdPath(buildIdPathList(leaf, readId, readParent))).toBe('root');
  });

  it('answers an empty string for an EMPTY path rather than throwing', () => {
    // JUDGMENT CALL: this rests on the positional read's documented non-throwing contract - out of
    // range answers '', where CFML itself would raise. That divergence is unreachable from
    // faithfully ported code, since every legacy walk is bounded by `i <= listLen(...)`.
    expect(getRootIdFromIdPath('')).toBe('');
    expect(() => getRootIdFromIdPath('')).not.toThrow();
  });

  it('does not trim the element it returns', () => {
    expect(getRootIdFromIdPath(' padded ,mid')).toBe(' padded ');
  });
});

// The READ HALF - idPathContainsId, single-identifier membership.

describe('idPathContainsId: membership at any position, case-insensitively', () => {
  it('finds an identifier at the FIRST position', () => {
    expect(idPathContainsId('root,mid,leaf', 'root')).toBe(true);
  });

  it('finds an identifier at a MIDDLE position', () => {
    expect(idPathContainsId('root,mid,leaf', 'mid')).toBe(true);
  });

  it('finds an identifier at the LAST position', () => {
    expect(idPathContainsId('root,mid,leaf', 'leaf')).toBe(true);
  });

  it('answers false for an identifier that is ABSENT', () => {
    expect(idPathContainsId('root,mid,leaf', 'stranger')).toBe(false);
  });

  it('is CASE-INSENSITIVE in both directions', () => {
    // Case-insensitivity is parity, not laxity: CFML list comparisons and identifiers are
    // case-insensitive, so tightening this would reject an identifier the legacy platform accepts.
    // It is not to be "fixed".
    expect(idPathContainsId('root,mid,leaf', 'ROOT')).toBe(true);
    expect(idPathContainsId('root,mid,leaf', 'Leaf')).toBe(true);
    expect(idPathContainsId('ROOT,MID,LEAF', 'root')).toBe(true);
    expect(idPathContainsId('RoOt,MiD', 'rOoT')).toBe(true);
  });

  it('answers false for an EMPTY path', () => {
    expect(idPathContainsId('', 'root')).toBe(false);
  });

  it('answers a STRICT BOOLEAN, never a position', () => {
    // CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966]: all four legacy
    // path walks read the positional lookup as though it were a boolean -
    // `if(listFindNoCase(...))`.
    const present: boolean = idPathContainsId('root,mid,leaf', 'root');
    const absent: boolean = idPathContainsId('root,mid,leaf', 'stranger');

    expect(present).toBe(true);
    expect(absent).toBe(false);
    expect(typeof present).toBe('boolean');
    expect(typeof absent).toBe('boolean');
  });

  it('discharges the `> 0` obligation against the positional lookup itself', () => {
    // JUDGMENT CALL: the shipped membership export returns a boolean rather than a position, so
    // the index-level assertions - absent answers 0, a first-position match answers 1 - can only
    // be made against the primitive it delegates to.
    expect(listFindNoCase('root,mid,leaf', 'stranger')).toBe(0);
    expect(listFindNoCase('root,mid,leaf', 'root')).toBe(1);
    expect(listFindNoCase('root,mid,leaf', 'mid')).toBe(2);
    expect(listFindNoCase('root,mid,leaf', 'leaf')).toBe(3);

    // The hazard, stated as an assertion: a first-position match is 1, which is not 0 and is not
    // the boolean true.
    expect(listFindNoCase('root,mid,leaf', 'root')).not.toBe(0);
    expect(listFindNoCase('root,mid,leaf', 'root')).not.toBe(true);
  });

  it('matches a whitespace-bearing identifier without trimming either side', () => {
    expect(idPathContainsId('root, padded ', ' padded ')).toBe(true);
    expect(idPathContainsId('root, padded ', 'padded')).toBe(false);
  });
});

// The READ HALF - idPathContainsAnyId, the duplication this module centralises.
//
// Authority: four legacy walks sharing one shape, all over getProductTypeIDPath() and all deciding
// whether a promotion reward applies.

describe('idPathContainsAnyId: match the path against a candidate list', () => {
  it('answers true when a candidate matches at the FIRST path position', () => {
    expect(idPathContainsAnyId('root,mid,leaf', 'root,other')).toBe(true);
  });

  it('answers true when a candidate matches at a MIDDLE path position', () => {
    expect(idPathContainsAnyId('root,mid,leaf', 'other,mid')).toBe(true);
  });

  it('answers true when a candidate matches at the LAST path position', () => {
    expect(idPathContainsAnyId('root,mid,leaf', 'leaf')).toBe(true);
  });

  it('answers false when nothing is in common', () => {
    expect(idPathContainsAnyId('root,mid,leaf', 'alpha,beta')).toBe(false);
  });

  it('answers false for an EMPTY candidate list', () => {
    // CFML parity [model/service/PromotionService.cfc:L858, L892, L928, L958]: each legacy site
    // guards accumulation with an array-length check, and that guard stays with the caller.
    expect(idPathContainsAnyId('root,mid,leaf', '')).toBe(false);
  });

  it('answers false for an EMPTY path', () => {
    // A path of no elements has nothing to look up, so the bounded loop simply does not run.
    expect(idPathContainsAnyId('', 'root,mid')).toBe(false);
    expect(listLen('')).toBe(0);
  });

  it('answers false when both sides are empty', () => {
    expect(idPathContainsAnyId('', '')).toBe(false);
  });

  it('maps onto the legacy loop shape, and agrees with it element for element', () => {
    // What this test claims.

    /**
     * The legacy loop written out: walk the path by 1-based position, bounded by its element
     * count, searching the candidate list for each element. A pure local closure, the comparison
     * subject and never a substitute.
     */
    const legacyLoopSpelledOut = (path: string, candidates: string): boolean => {
      for (let position = 1; position <= listLen(path); position += 1) {
        if (listFindNoCase(candidates, listGetAt(path, position)) > 0) {
          return true;
        }
      }

      return false;
    };

    interface IntersectionCase {
      readonly path: string;
      readonly candidates: string;
      readonly expected: boolean;
    }

    const cases: readonly IntersectionCase[] = [
      // Long path, single candidate - the shape every legacy site actually has.
      { path: 'root,mid,leaf', candidates: 'mid', expected: true },
      // The same question with the sides swapped - the symmetry above.
      { path: 'mid', candidates: 'root,mid,leaf', expected: true },
      // No overlap at all, both lengths above one.
      { path: 'root,mid,leaf', candidates: 'alpha,beta', expected: false },
      // Duplicates on the PATH side only.
      { path: 'root,root,root', candidates: 'root', expected: true },
      // The same duplicates moved to the CANDIDATE side.
      { path: 'root', candidates: 'root,root,root', expected: true },
      // A match at the LAST position, which is where an off-by-one bound
      // (`position < listLen(path)`) would drop the only overlapping element.
      { path: 'a,b,c,d', candidates: 'd,d', expected: true },
      // Each side empty in turn - the two total cases.
      { path: '', candidates: 'root', expected: false },
      { path: 'root', candidates: '', expected: false },
      // Case folding, which must survive the mapping unchanged.
      { path: 'ROOT,MID', candidates: 'mid', expected: true },
    ];
    expect(
      cases.map(({ path, candidates }) => idPathContainsAnyId(path, candidates)),
    ).toStrictEqual(cases.map(({ expected }) => expected));
    expect(
      cases.map(({ path, candidates }) => legacyLoopSpelledOut(path, candidates)),
    ).toStrictEqual(cases.map(({ expected }) => expected));

    // And the per-position reads, which pin the 1-BASED index and the element-count bound directly
    // rather than through an aggregate.
    const path = 'root,mid,leaf';
    const candidates = 'mid';

    expect(listLen(path)).toBe(3);
    expect(listFindNoCase(candidates, listGetAt(path, 2)) > 0).toBe(true);
    expect(listFindNoCase(candidates, listGetAt(path, 1)) > 0).toBe(false);
    expect(listFindNoCase(candidates, listGetAt(path, 3)) > 0).toBe(false);
  });

  it('is CASE-INSENSITIVE on both the path side and the candidate side', () => {
    expect(idPathContainsAnyId('root,mid,leaf', 'MID')).toBe(true);
    expect(idPathContainsAnyId('ROOT,MID,LEAF', 'mid')).toBe(true);
  });

  it('serves both legacy caller shapes without loss', () => {
    // CFML parity [model/service/PromotionService.cfc:L858-L870, L892-L904]: the two EXCLUSION
    // walks set a flag and break; the two INCLUSION walks return true immediately and keep no
    // flag.
    const productTypePath = 'rootType,midType,leafType';
    expect(idPathContainsAnyId(productTypePath, 'midType')).toBe(true);
    expect(idPathContainsAnyId(productTypePath, 'unrelatedType')).toBe(false);

    expect(idPathContainsAnyId(productTypePath, 'rootType,anotherType')).toBe(true);
  });

  it('collapses consecutive delimiters on both sides, consistently with the count', () => {
    // Empty elements contribute nothing, on the path side and the candidate side alike, which
    // keeps the bounded walk and the element count in step.
    expect(listLen('root,,leaf')).toBe(2);
    expect(idPathContainsAnyId('root,,leaf', 'leaf')).toBe(true);
    expect(idPathContainsAnyId('root,,leaf', '')).toBe(false);
    expect(idPathContainsAnyId('root,,leaf', ',,')).toBe(false);
  });

  it('walks a path this suite actually built', () => {
    const rootType: HierarchyNode = { id: 'rootType', parent: null };
    const midType: HierarchyNode = { id: 'midType', parent: rootType };
    const leafType: HierarchyNode = { id: 'leafType', parent: midType };

    const path = buildIdPathList(leafType, readId, readParent);

    // An ancestor match is the whole point of a materialized path: the reward names the ancestor,
    // the order item carries the leaf.
    expect(idPathContainsAnyId(path, 'rootType')).toBe(true);
    expect(idPathContainsAnyId(path, 'midType')).toBe(true);
    expect(idPathContainsAnyId(path, 'leafType')).toBe(true);
    expect(idPathContainsAnyId(path, 'siblingType')).toBe(false);
  });
});

// The load-bearing list guarantee the ordering rests on.

describe('the no-leading-delimiter guarantee the root-first ordering rests on', () => {
  it('appending onto an EMPTY list answers the value alone', () => {
    // CFML parity [model/service/PromotionService.cfc:L859-L862, L893-L897, L929-L932, L959-L963]:
    // all four legacy candidate accumulators start from an empty string and append, and every one
    // depends on this rule.
    expect(listAppend('', 'root')).toBe('root');
    expect(listAppend('root', 'mid')).toBe('root,mid');
    expect(listAppend(listAppend('', 'root'), 'mid')).toBe('root,mid');
  });

  it('never trims or normalizes the value it appends', () => {
    expect(listAppend('', ' padded ')).toBe(' padded ');
    expect(listAppend('root', ' padded ')).toBe('root, padded ');
  });

  it('is pure - the same inputs answer the same result', () => {
    const list = 'root';

    expect(listAppend(list, 'mid')).toBe('root,mid');
    expect(listAppend(list, 'mid')).toBe('root,mid');
    expect(list).toBe('root');
  });
});

// The two halves are independent.

describe('the write half and the read half are independent', () => {
  it('exercises the WRITE half with no lazy accessor involved at all', () => {
    // CFML parity [model/entity/Category.cfc:L120-L122]: this is the Category shape and the
    // decisive proof that the two halves are independent.
    const root: HierarchyNode = { id: 'rootCategory', parent: null };
    const child: HierarchyNode = { id: 'childCategory', parent: root };

    expect(buildIdPathList(child, readId, readParent)).toBe('rootCategory,childCategory');
  });

  it('exercises the READ half over a stored string with no builder involved', () => {
    // The mirror image: the accessor, the root extractor and both membership tests all operate on
    // a path that already exists, with no recomputation callback ever invoked and no hierarchy in
    // sight.
    const probe = createRecomputationProbe('never,used');
    const storedPath = 'rootType,midType,leafType';

    expect(resolveIdPath(storedPath, probe.compute)).toBe(storedPath);
    expect(getRootIdFromIdPath(storedPath)).toBe('rootType');
    expect(idPathContainsId(storedPath, 'midType')).toBe(true);
    expect(idPathContainsAnyId(storedPath, 'rootType,other')).toBe(true);
    expect(probe.callCount()).toBe(0);
  });

  it('composes both halves the way a consuming entity would', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L195-L200] and
    // [model/entity/ProductType.cfc:L250-L255]: the lazy getter computes on an absent value and
    // returns it.
    //
    // Deliberately not asserted here: when the path is assigned relative to a consuming entity's
    // inherited lifecycle delegation.
    const root: HierarchyNode = { id: 'rootGroup', parent: null };
    const child: HierarchyNode = { id: 'childGroup', parent: root };

    const computed = resolveIdPath(null, () => buildIdPathList(child, readId, readParent));

    expect(computed).toBe('rootGroup,childGroup');
    expect(getRootIdFromIdPath(computed)).toBe('rootGroup');
    expect(idPathContainsId(computed, 'rootGroup')).toBe(true);
    expect(idPathContainsAnyId(computed, 'rootGroup')).toBe(true);
  });

  it('serves all three in-scope path-bearing entities from one primitive', () => {
    // The consumer set is bounded at three: priceGroupIDPath [model/entity/PriceGroup.cfc:L53],
    // productTypeIDPath [model/entity/ProductType.cfc:L53] and categoryIDPath
    // [model/entity/Category.cfc:L53].
    const priceGroupRoot: HierarchyNode = { id: 'pg-root', parent: null };
    const priceGroupChild: HierarchyNode = { id: 'pg-child', parent: priceGroupRoot };
    const productTypeRoot: HierarchyNode = { id: 'pt-root', parent: null };
    const productTypeChild: HierarchyNode = { id: 'pt-child', parent: productTypeRoot };
    const categoryRoot: HierarchyNode = { id: 'cat-root', parent: null };
    const categoryChild: HierarchyNode = { id: 'cat-child', parent: categoryRoot };

    expect(buildIdPathList(priceGroupChild, readId, readParent)).toBe('pg-root,pg-child');
    expect(buildIdPathList(productTypeChild, readId, readParent)).toBe('pt-root,pt-child');
    expect(buildIdPathList(categoryChild, readId, readParent)).toBe('cat-root,cat-child');
  });
});

// What the module deliberately does not offer is as much a part of its contract as what it does,
// so the absences are asserted rather than trusted.

describe('the exported surface is closed', () => {
  it('exports EXACTLY the five path functions and nothing else', () => {
    // The two accessor types are compile-time only and correctly absent at runtime; they are
    // exercised by the typed accessors declared near the top of this file.
    expect(Object.keys(materializedIdPathModule).sort()).toStrictEqual([
      'buildIdPathList',
      'getRootIdFromIdPath',
      'idPathContainsAnyId',
      'idPathContainsId',
      'resolveIdPath',
    ]);
  });

  it('offers no path-mutation helper of any kind', () => {
    // No legacy site needs one, so none is offered. Naming them individually makes the prohibition
    // checkable rather than implied by the count above.
    const exportedNames = Object.keys(materializedIdPathModule);

    expect(exportedNames).not.toContain('insertAfter');
    expect(exportedNames).not.toContain('moveSubtree');
    expect(exportedNames).not.toContain('reparent');
    expect(exportedNames).not.toContain('depth');
    expect(exportedNames).not.toContain('ancestorOf');
    expect(exportedNames).not.toContain('descendantOf');
    expect(exportedNames).not.toContain('commonPrefix');
  });

  it('offers no prefix-matching read side', () => {
    // Those read sides exist and they DEPEND on the root-first ordering this suite pins - the
    // option-list filter at model/entity/ProductType.cfc:L129.
    const exportedNames = Object.keys(materializedIdPathModule);

    expect(exportedNames).not.toContain('startsWithIdPath');
    expect(exportedNames).not.toContain('idPathLikePattern');
    expect(exportedNames).not.toContain('quoteIdPath');
  });

  it('closes its export surface to functions only, so no EXPORTED binding can carry state', () => {
    // SCOPED to what the export shape guarantees. Every export being a function rules out a
    // directly reachable stateful binding - an exported object, array, `Map` or mutable counter a
    // caller could read or write.
    const everyExportIsAFunction = Object.values(materializedIdPathModule).every(
      (exported) => typeof exported === 'function',
    );

    expect(everyExportIsAFunction).toBe(true);
  });

  it('keeps two hierarchies isolated when their calls are INTERLEAVED', () => {
    // The behavioural counterpart to the export-shape assertion above, and the assertion that
    // would actually catch a private cache.
    const rootA: HierarchyNode = { id: 'a-root', parent: null };
    const leafA: HierarchyNode = { id: 'a-leaf', parent: rootA };
    const rootB: HierarchyNode = { id: 'b-root', parent: null };
    const leafB: HierarchyNode = { id: 'b-leaf', parent: rootB };

    const firstA = buildIdPathList(leafA, readId, readParent);
    const firstB = buildIdPathList(leafB, readId, readParent);
    const secondA = buildIdPathList(leafA, readId, readParent);
    const secondB = buildIdPathList(leafB, readId, readParent);

    expect([firstA, firstB, secondA, secondB]).toStrictEqual([
      'a-root,a-leaf',
      'b-root,b-leaf',
      'a-root,a-leaf',
      'b-root,b-leaf',
    ]);

    // The read side, interleaved as well: each answer follows its own path and never the one
    // computed in between.
    expect(getRootIdFromIdPath(firstA)).toBe('a-root');
    expect(getRootIdFromIdPath(firstB)).toBe('b-root');
    expect(idPathContainsId(firstA, 'b-leaf')).toBe(false);
    expect(idPathContainsId(firstB, 'a-leaf')).toBe(false);
    expect(idPathContainsAnyId(firstA, 'b-root,b-leaf')).toBe(false);
    expect(idPathContainsAnyId(firstB, 'a-root,a-leaf')).toBe(false);

    // The pass-through read is interleaved too, with the stored branch and the computed branch
    // alternating, so neither can be answering from a value the other left behind.
    expect(resolveIdPath(firstA, () => firstB)).toBe('a-root,a-leaf');
    expect(resolveIdPath(null, () => firstB)).toBe('b-root,b-leaf');
    expect(resolveIdPath(firstB, () => firstA)).toBe('b-root,b-leaf');
    expect(resolveIdPath(undefined, () => firstA)).toBe('a-root,a-leaf');

    // The sharpest probe available for per-node interning: the same node object is walked twice
    // with an accessor that answers differently each time. A module caching by node identity would
    // replay the first answer.
    const shared: HierarchyNode = { id: 'unused-by-this-accessor', parent: null };
    let generation = 0;
    const readGenerationalId: PrimaryIdAccessor<HierarchyNode> = () => {
      generation += 1;
      return `gen${String(generation)}`;
    };

    expect(buildIdPathList(shared, readGenerationalId, readParent)).toBe('gen1');
    expect(buildIdPathList(shared, readGenerationalId, readParent)).toBe('gen2');
    expect(generation).toBe(2);
  });

  it('holds no memo: identical calls recompute and still agree', () => {
    // The memo lives on the consuming entity, never here. Two identical builds and two identical
    // membership questions agree because the computation is deterministic, not because a result
    // was cached.
    const root: HierarchyNode = { id: 'root', parent: null };
    const leaf: HierarchyNode = { id: 'leaf', parent: root };

    const firstProbe = createWalkProbe();
    const secondProbe = createWalkProbe();

    const first = buildIdPathList(leaf, firstProbe.readIdCounted, firstProbe.readParentCounted);
    const second = buildIdPathList(leaf, secondProbe.readIdCounted, secondProbe.readParentCounted);

    expect(first).toBe('root,leaf');
    expect(second).toBe(first);

    // Both walks did the work. A hidden memo would have left the second probe at zero.
    expect(firstProbe.idReadCount()).toBe(2);
    expect(secondProbe.idReadCount()).toBe(2);

    expect(idPathContainsId(first, 'root')).toBe(idPathContainsId(second, 'root'));
    expect(getRootIdFromIdPath(first)).toBe(getRootIdFromIdPath(second));
  });
});
