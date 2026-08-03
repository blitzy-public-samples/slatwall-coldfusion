// ---------------------------------------------------------------------------
// Unit suite for the comma-delimited materialized ID path
//
// SUBJECT: src/domain/valueObjects/materializedIdPath.ts in isolation. That module carries both
// halves of the idiom - the write/recompute walk and the read accessors - and serves exactly three
// in-scope entities: PriceGroup, ProductType and Category. It holds no query, and neither does this
// suite. Get the ordering or the null rule wrong and the wrong promotion reward matches an order
// item.
//
// COVERAGE CLASSIFICATION: NET-NEW, not parity. A repository-wide search of the 32 .cfc files under
// meta/tests/** for money, currencyCode, idPath, materialized, precisionEvaluate and roundValue
// matches ZERO of them: the idiom lived inline in the framework base rather than in an extracted
// primitive. The four shared cases every legacy entity suite inherits from
// meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67 are inapplicable too - a value object
// has no validate(context), no getSimpleRepresentation(), no primary ID property and no isNew() -
// and the legacy structural coverage floor could not have caught the gap either, because it does
// not run and would not work if it did: meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54
// resolves expandPath("/Slatwall/com/entity/"), a directory that does not exist (the real one is
// model/entity/), and meta/tests/coverage/EntityCoverageTest.cfc:L51-L70,
// all_entities_have_test_cases(), compares bare filenames - asking whether Brand.cfc is among the
// test filenames rather than BrandTest.cfc - so its arrayFind at L64 can never match.
//
// org/Hibachi/** is a boundary to extract from and never modify. Exactly one algorithm is
// reproduced from it, the path builder at org/Hibachi/HibachiEntity.cfc:L307-L324, and it is
// reproduced by reading it.
//
// THREE PARITY NOTES, ALL VERIFIED AGAINST THE SOURCE
//
//   CFML parity [org/Hibachi/HibachiEntity.cfc:L307-L308]: the doc comment on
//   L307 calls it a "private method to help build IDPath lists based on parent
//   properties" while the declaration on L308 reads
//
//       public string function buildIDPathList(required string parentPropertyName)
//
//   The public shape is the real one - all three in-scope entities call it -
//   and this suite exercises it. Recorded, not resolved.
//
//   CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body
//   calls the string-evaluation builtin TWICE per iteration, once to test
//   whether the parent is null at L316 and again to reassign the cursor at
//   L319. The target collapses that into ONE parent-accessor call; both legacy
//   calls resolve the same association on the same node, so the path cannot
//   differ, and the collapsed count is asserted below.
//
//   CFML parity [model/entity/PriceGroup.cfc:L212] and
//   [model/entity/ProductType.cfc:L311]: both lines end in a double semicolon,
//   an empty statement that changes nothing; model/entity/Category.cfc has
//   none. Those lines are entity-owned, so the typo is neither reproduced nor
//   asserted here - it is noted so a reviewer meeting it knows it was seen.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

// JUDGMENT CALL: FOUR levels of `..`, and the `.js` extension is mandatory. From
// tests/unit/domain/valueObjects/, `../../../..` is the slatwall-ts root. tsconfig.json sets module
// and moduleResolution to NodeNext with no `paths`, no `baseUrl` and no allowImportingTsExtensions,
// so an extensionless specifier does not resolve and a `.ts` specifier does not compile. The
// sibling suite at tests/unit/lib/cfml/list.test.ts uses the same form.
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
  wouldCreateIdPathCycle,
} from '../../../../src/domain/valueObjects/materializedIdPath.js';

// JUDGMENT CALL: the two parity helper modules below are imported only because the shipped
// signatures demand them. `listFindNoCase` is the primitive the boolean membership export delegates
// to, so the "a position is not a boolean" obligation can only be discharged against it;
// `listAppend` owns the no-leading-delimiter guarantee the root-first ordering rests on;
// `listGetAt` is the 1-based positional read the root extractor is, with the non-throwing
// out-of-range contract; `listLen` is the bound of the any-match walk; and `isNullish` is the null
// rule the lazy accessor turns on, which the module wraps in a local helper it deliberately does
// not export.
//
// Nothing outside the domain tier and these helpers is imported: no repository, no handler, no
// integration and no fixture. A test is not a back door around the domain-inward boundary.
import { listAppend, listFindNoCase, listGetAt, listLen } from '../../../../src/lib/cfml/list.js';
import { isNullish } from '../../../../src/lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// THE SHIPPED EXPORT SURFACE
//
// Every name below was read off the shipped module rather than assumed. The membership test is
// `idPathContainsId` and the root extractor is `getRootIdFromIdPath`; the lazy accessor is
// `resolveIdPath` and the any-match test is `idPathContainsAnyId`, the second being the
// centralisation of the four legacy promotion walks.
//
// There is NO length or segment reader, deliberately: no legacy site walks one of these paths as an
// array, all four promotion walks are 1-based count-and-position loops, and an unused import is a
// compile error here, so a segments accessor would be a speculative export. Nothing returns an
// array, so element counts and positions are asserted through the count and positional helpers
// instead - which is what the module itself uses.
//
// JUDGMENT CALL: no bounded-iteration guard ships. That is faithful to the legacy loop and is
// treated as such under "property 5" below.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inline test scaffolding
//
// Plain object literals and hand-written counters only. No fixture module is imported: fixtures
// build entities, the layer ABOVE a value object, so importing one would invert the layering this
// suite respects. tests/setup.ts already forces UTC and restores mocks and real timers, and nothing
// below reads the clock at all - a materialized path has no date in it.
// ---------------------------------------------------------------------------

/**
 * One node of a hierarchy, in the shape the shipped accessors require.
 *
 * JUDGMENT CALL: `parent` is readonly and can only be assigned a node that
 * already exists, so a cycle is impossible to build with this interface alone.
 * That is deliberate and it is kept: it makes every hierarchy in the
 * well-founded blocks below provably acyclic without any assertion having to
 * say so, and it means an accidental cycle cannot be introduced by a later
 * edit to those blocks.
 *
 * It is NOT how the cyclic cases are built. The module under test now REFUSES a
 * cyclic parent chain by throwing - the divergence recorded on
 * `buildIdPathList` - so a cycle no longer hangs this suite and can be asserted
 * on directly. The cyclic block near the end of this file therefore uses a
 * separate, deliberately mutable node shape of its own, `CyclicNode`, so that
 * the ability to build a cycle is confined to the block that needs it and does
 * not leak into any other test here.
 */
interface HierarchyNode {
  readonly id: string;
  readonly parent: HierarchyNode | null;
}

/**
 * Reads a node's primary identifier.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L315]: stands in for `thisEntity.getPrimaryIDValue()`.
 */
const readId: PrimaryIdAccessor<HierarchyNode> = (node) => node.id;

/**
 * Reads a node's parent, answering `null` at the root.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: stands in for the parent association the
 * legacy body resolved by interpolating a property name into a getter call and handing the
 * resulting string to CFML's runtime string-evaluation builtin. It is a typed callback here; every
 * mention of that builtin in this file is prose about the legacy, never an emulation of it.
 */
const readParent: ParentNodeAccessor<HierarchyNode> = (node) => node.parent;

/**
 * The same reader, answering `undefined` at the root instead of `null`.
 *
 * The shipped accessor type admits both, and the walk routes both through one null rule, so both
 * are exercised rather than only the convenient one.
 */
const readParentAsUndefined: ParentNodeAccessor<HierarchyNode> = (node) => node.parent ?? undefined;

/** A counting pair of accessors, so call counts can be asserted directly. */
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

/** A recomputation callback that records whether it was ever invoked. */
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

// ---------------------------------------------------------------------------
// THE WRITE HALF - buildIdPathList
//
// Authority: org/Hibachi/HibachiEntity.cfc:L307-L324, body at L308-L323. Six
// properties, each with its own named assertion below.
// ---------------------------------------------------------------------------

describe('buildIdPathList: the six properties of the legacy walk', () => {
  it('property 1 - orders the path ROOT FIRST', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L315]: the legacy line pushes each identifier onto
    // the FRONT of the accumulator as the walk climbs, so the outermost ancestor finishes first.
    // That CFML prepend helper has no counterpart in the target and must not be added, so
    // root-first order is produced by collecting the ancestor chain while climbing and emitting it
    // from an EMPTY accumulator - which this assertion proves equivalent.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('root,mid,leaf');
  });

  it('property 2 - places the STARTING node LAST', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L311]: the walk is seeded with `this`, so the node
    // it was asked about is prepended first and therefore ends up at the tail.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParent).endsWith('leaf')).toBe(true);
    expect(buildIdPathList(mid, readId, readParent).endsWith('mid')).toBe(true);
    expect(buildIdPathList(root, readId, readParent).endsWith('root')).toBe(true);
  });

  it('property 3 - is COMMA-DELIMITED with no leading and no trailing delimiter', () => {
    // CFML parity [slatwall-ts/src/lib/cfml/list.ts]: `listAppend` onto an empty accumulator
    // answers the value alone, which guarantees no leading delimiter. That guarantee is
    // load-bearing: it is the identical property the four promotion accumulators at
    // model/service/PromotionService.cfc:L859-L862, L893-L897, L929-L932 and L959-L963 all depend
    // on.
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
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L315-L316]: the identifier is collected BEFORE the
    // parent is tested, unconditionally, so the starting node can never be omitted.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(idPathContainsId(buildIdPathList(leaf, readId, readParent), 'leaf')).toBe(true);
    expect(idPathContainsId(buildIdPathList(mid, readId, readParent), 'mid')).toBe(true);
    expect(idPathContainsId(buildIdPathList(root, readId, readParent), 'root')).toBe(true);
  });

  it('property 5 - TERMINATES ON THE FIRST ABSENT PARENT, with nothing interposed', () => {
    // WHAT THIS TEST PROVES, AND WHAT IT DOES NOT. Stated plainly, because the
    // distinction is easy to blur.
    //
    // PROVEN HERE: the walk terminates on the FIRST node whose parent reads
    // absent, visits each ancestor exactly once, and completes for a
    // well-founded chain of any depth. That is the invariant the legacy
    // do/while at [org/Hibachi/HibachiEntity.cfc:L314-L321] has and that the
    // port keeps unchanged, and it is asserted twice: at the shallow depth the
    // rest of this suite uses, and - in the test immediately following - at a
    // depth far beyond anything a bounded cap would accommodate.
    //
    // NOT PROVEN HERE: anything at all about cyclic input. No walk over a
    // well-founded hierarchy can say what happens to a cycle, in either
    // direction. That is asserted directly instead, in its own block near the
    // end of this file, and the answer is that the shipped module THROWS: a
    // visited-identity set refuses a revisited node before it is collected, so
    // no path is produced at all. That is a declared divergence from the legacy
    // loop, which carried no visited set and no bound, and the full reasoning
    // for it lives on `buildIdPathList` rather than being re-argued here.
    //
    // WHY THE GUARD CANNOT DISTURB THIS TEST, which is the point worth keeping:
    // a visited set only fires on a genuine revisit, and a well-founded chain
    // has none. The ordering, the delimiter and the contents of every path in
    // this block are therefore identical with the guard and without it - which
    // is exactly the property the deep-chain test below is built to keep
    // honest.
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
    // THE STRUCTURAL TRIPWIRE AGAINST A CAP, and it is still exactly that after
    // the cycle guard was added. The test immediately preceding this one cannot
    // fail if a bounded-iteration cap were introduced, because three iterations
    // sit under any plausible bound. This one is built to fail in that case.
    //
    // A cap can only be enforced two ways, and this test defeats both. If it
    // TRUNCATED, the element count and the first element would both change - the
    // path would no longer start at the true root, which is precisely the read
    // that `getBaseProductType()` depends on. If it THREW, the call would not
    // return at all. Either way this test goes red, which is the alarm wanted:
    // a cap on a legitimate hierarchy is a behavioural change, not a hardening.
    //
    // WHAT THE GUARD DID TO THIS TEST: nothing, by design, and that is the whole
    // reason the guard is a visited-identity set rather than a depth cap. A
    // visited set fires only on a genuine revisit, and 512 distinct nodes
    // contain none, so all 512 levels are walked and the full path is produced
    // unchanged. The depth value that does exist alongside it - a backstop for a
    // parent accessor that manufactures a fresh node on every call, so that a
    // visited set can never fill - is set at 4096, an order of magnitude above
    // this chain and 34 times the deepest path the `length="4000"` column can
    // physically hold. This test passing UNMODIFIED is the evidence that the
    // guard cost nothing at the boundary it was most at risk of disturbing.
    //
    // Five hundred and twelve levels is chosen to sit comfortably above any cap
    // a well-meaning contributor would reach for while staying trivially cheap -
    // the whole walk is 512 identifier reads and 512 parent reads. It is not a
    // performance assertion and no timing of any kind is claimed here; the
    // numbers below are counts, not budgets.
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
    //
    // THE INVARIANT IS ABOUT THE WALK, NOT ABOUT THE EMITTED LIST, and the two are not the same
    // claim. "The starting node's identifier is always collected" holds for every input. "The
    // emitted path always holds at least one element" does NOT: an identifier that is itself the
    // empty string is collected and then contributes no element, because CFML list semantics ignore
    // empty elements. That case is asserted in `contributes no element for an EMPTY identifier`
    // further down - read the two together. So what is pinned here is ONE ITERATION MINIMUM, and
    // therefore at least one element WHENEVER THE IDENTIFIER IS NON-EMPTY.
    //
    // So what is pinned here is the precise consequence: ONE iteration minimum,
    // and therefore at least one element WHENEVER THE IDENTIFIER IS NON-EMPTY.
    //
    // JUDGMENT CALL - the shipped module's PROSE over-claims this, and the
    // over-claim is recorded here rather than edited away, because it is a
    // documentation imprecision in prose that no finding raised and that no fix
    // in this pass touches; correcting it would be an unrequested edit to a file
    // whose only sanctioned change is the cycle guard. Four places say it too
    // strongly: the header property table calls the property "never empty" and
    // concludes "the result therefore always holds at least one element"; the
    // `buildIdPathList` docstring summary lists "never empty" among the
    // properties it reproduces; an in-body comment calls it "both the 'includes
    // self' and the 'never empty' property"; and `getRootIdFromIdPath` reasons
    // from "`buildIdPathList` can never produce an empty path".
    //
    // The module's BEHAVIOUR is not affected and needs no change. Its
    // empty-identifier result is `''`, which is correct for a brand-new entity,
    // and `getRootIdFromIdPath('')` already answers `''` without throwing - its
    // own `@returns` documents that fallback, so the code handles the case its
    // prose says cannot arise. This is a documentation imprecision, not a
    // defect, and the suite asserts the precise invariant so no reader has to
    // choose between two conflicting tests.
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
    // The shipped accessor type admits `TNode | null | undefined`, and the walk routes both through
    // the one CFML null rule. Asserting only the `null` shape would leave half the declared
    // contract unexercised.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };

    expect(buildIdPathList(leaf, readId, readParentAsUndefined)).toBe('root,mid,leaf');
    expect(buildIdPathList(root, readId, readParentAsUndefined)).toBe('root');
  });

  it('reads the parent ONCE per iteration, not twice', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body resolves the parent
    // association twice on every pass - once for the null test and once for the reassignment. An
    // explicit typed callback resolves it once. Both legacy calls read the same association on the
    // same node, so the emitted path is identical; this test pins the collapsed count.
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
    // CFML parity [slatwall-ts/src/lib/cfml/list.ts]: the list helpers never trim and never
    // normalize. This module must not contradict them, because what it emits is persisted into a
    // 4000-character column - priceGroupIDPath [model/entity/PriceGroup.cfc:L53], productTypeIDPath
    // [model/entity/ProductType.cfc:L53] and categoryIDPath [model/entity/Category.cfc:L53].
    // Trimming would rewrite stored data.
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
    // because the legacy prepend was not executed for this input. The case is reachable rather than
    // hypothetical: a brand-new entity's primary identifier really is empty, which the legacy suite
    // asserts at meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L66
    // (`assert(!len(variables.entity.getPrimaryIDValue()));`).
    //
    // READ THIS WITH PROPERTY 6, its counterpart rather than its contradiction. Property 6 pins
    // that the walk ALWAYS COLLECTS the starting node's identifier; this pins what happens when
    // that identifier is empty - it contributes no ELEMENT, so a single-node walk emits `''` and a
    // count of zero. Both hold because "collected" and "emitted" are different steps.
    const root: HierarchyNode = { id: '', parent: null };
    const leaf: HierarchyNode = { id: 'leaf', parent: root };

    expect(buildIdPathList(leaf, readId, readParent)).toBe('leaf');
    expect(buildIdPathList(root, readId, readParent)).toBe('');
    expect(listLen(buildIdPathList(root, readId, readParent))).toBe(0);

    // The walk still ran its body once: the element vanished at the accumulator, not at the loop,
    // which is what unifies this with property 6.
    const probe = createWalkProbe();

    expect(buildIdPathList(root, probe.readIdCounted, probe.readParentCounted)).toBe('');
    expect(probe.idReadCount()).toBe(1);

    // The downstream read is total rather than exceptional: the root extractor answers `''` instead
    // of throwing, as its documented fallback promises.
    expect(getRootIdFromIdPath(buildIdPathList(root, readId, readParent))).toBe('');
  });
});

describe('buildIdPathList: no shared state, no input mutation', () => {
  it('answers identically when called repeatedly over the same hierarchy', () => {
    // The value object retains nothing between calls: no memo, no interning, no module-scope
    // binding. The memo belongs to the consuming entity, at model/entity/PriceGroup.cfc:L195-L200
    // and model/entity/ProductType.cfc:L250-L255.
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

// ---------------------------------------------------------------------------
// THE ONE DECLARED DIVERGENCE - a cyclic or unbounded parent chain is REFUSED
//
// Authority for the legacy behaviour: the do/while at
// [org/Hibachi/HibachiEntity.cfc:L314-L321] holds no visited set and no
// iteration bound, so a `parentProductType` chain that returns to a node it has
// already passed is followed forever. Authority for the divergence: it is not an
// entry in the AAP defect register - the closed set of twenty entries plus eight
// secondary items does not contain it - the preserve-exactly mandate names
// promotion discount math, the price-group and currency cascade and
// option-to-SKU resolution rather than the framework path builder, and
// `org/Hibachi/**` is explicitly a boundary to REPLACE rather than reproduce.
//
// WHY IT IS A SECURITY PROPERTY AND NOT A TIDY-UP. The legacy non-termination
// occupied one CFML request thread. The same chain on `nodejs20.x` occupies the
// single-threaded event loop of an invocation until the Lambda timeout, and the
// platform then RETRIES, so one malformed row denies the capability repeatedly
// for as long as it is reachable. `parentProductType`, `parentPriceGroup` and
// `parentCategory` are all operator-writable, and the guard sits on the write
// half, so the refusal happens before an entity field is assigned and before a
// repository binds a parameter.
//
// EVERY ASSERTION BELOW IS ABOUT REFUSAL, NEVER ABOUT TRUNCATION. Truncation was
// rejected outright: a silently shortened path changes which promotion rewards
// and which price-group rate apply, which is money. The contract is that NO PATH
// IS PRODUCED - so each test proves a throw and none of them accepts a shorter
// string as an acceptable answer.
// ---------------------------------------------------------------------------

/**
 * One node of a hierarchy that is allowed to contain a cycle.
 *
 * JUDGMENT CALL: a second node shape, deliberately mutable in exactly one field,
 * rather than relaxing `HierarchyNode.parent`. `HierarchyNode` is readonly and
 * assignable only from an already-constructed node, which makes every hierarchy
 * in the well-founded blocks above provably acyclic without any assertion
 * saying so, and that guarantee is worth keeping intact. Confining mutability to
 * the block that needs it means a later edit cannot accidentally introduce a
 * cycle into a test that is not about cycles.
 */
interface CyclicNode {
  readonly id: string;
  parent: CyclicNode | null;
}

/** Reads a cycle-capable node's identifier. Same role as {@link readId}. */
const readCyclicId: PrimaryIdAccessor<CyclicNode> = (node) => node.id;

/** Reads a cycle-capable node's parent. Same role as {@link readParent}. */
const readCyclicParent: ParentNodeAccessor<CyclicNode> = (node) => node.parent;

/**
 * How a walk failed, in the only two terms a caller can rely on.
 *
 * The module's error class is deliberately NOT exported - the export surface is
 * a closed set of five functions, asserted as such at the end of this file, and
 * widening it is a product decision. A caller therefore discriminates on the
 * stable `name`, exactly as `src/lib/cfml/precision.ts` requires of its own
 * callers, and so does this suite. No `instanceof` appears here and none can.
 */
interface CapturedWalkFailure {
  readonly name: string;
  readonly message: string;
}

/**
 * Runs a walk expected to be refused and reports how it was refused.
 *
 * If the walk RETURNS, this throws instead. That matters more here than in most
 * places: a subject that quietly answered a truncated path would otherwise look
 * like a passing expectation, and a truncated path is the single outcome this
 * whole block exists to rule out.
 */
const captureWalkFailure = (walk: () => unknown): CapturedWalkFailure => {
  try {
    walk();
  } catch (thrown) {
    return thrown instanceof Error
      ? { name: thrown.name, message: thrown.message }
      : { name: 'NotAnError', message: 'a value that is not an Error was thrown' };
  }

  throw new Error(
    'the walk under test was expected to be refused, but it returned a path. A cyclic parent ' +
      'chain must produce NO path - a truncated one silently changes which promotion rewards and ' +
      'price-group rates apply.',
  );
};

describe('buildIdPathList: a cyclic parent chain is refused, not followed', () => {
  it('refuses a node that is its own parent', () => {
    // The tightest possible cycle, and the one an operator produces by choosing
    // a product type as its own parent in a single edit. The guard is checked
    // BEFORE the identifier is collected, so the second visit is refused rather
    // than being allowed to contribute a duplicate segment first.
    const selfParenting: CyclicNode = { id: 'self', parent: null };
    selfParenting.parent = selfParenting;

    const failure = captureWalkFailure(() =>
      buildIdPathList(selfParenting, readCyclicId, readCyclicParent),
    );

    expect(failure.name).toBe('CyclicIdPathError');
    expect(failure.message).toContain("revisited node 'self' after 1 level(s)");
  });

  it('refuses a two-node cycle', () => {
    const first: CyclicNode = { id: 'a', parent: null };
    const second: CyclicNode = { id: 'b', parent: first };
    first.parent = second;

    // Refused from either entry point: the cycle is a property of the chain, not
    // of where the climb happens to start.
    //
    // The REASON is asserted alongside the name, not just the name. Both of this
    // module's refusals carry the same `name`, so a name-only assertion would
    // still pass if the identity guard were removed and the depth backstop caught
    // the walk 4096 levels later instead - a materially worse outcome that this
    // block must not certify as correct.
    const fromFirst = captureWalkFailure(() =>
      buildIdPathList(first, readCyclicId, readCyclicParent),
    );
    const fromSecond = captureWalkFailure(() =>
      buildIdPathList(second, readCyclicId, readCyclicParent),
    );

    expect(fromFirst.name).toBe('CyclicIdPathError');
    expect(fromFirst.message).toContain("revisited node 'a' after 2 level(s)");
    expect(fromSecond.name).toBe('CyclicIdPathError');
    expect(fromSecond.message).toContain("revisited node 'b' after 2 level(s)");
  });

  it('refuses a three-node cycle, and reports the node it returned to', () => {
    const bottom: CyclicNode = { id: 'x', parent: null };
    const middle: CyclicNode = { id: 'y', parent: bottom };
    const top: CyclicNode = { id: 'z', parent: middle };
    bottom.parent = top;

    const failure = captureWalkFailure(() =>
      buildIdPathList(bottom, readCyclicId, readCyclicParent),
    );

    expect(failure.name).toBe('CyclicIdPathError');
    // Three levels were climbed - x, z, y - and the fourth visit landed back on
    // x. The identifier named is the node the walk RETURNED TO, which is the one
    // an operator has to unlink.
    expect(failure.message).toContain("revisited node 'x' after 3 level(s)");
  });

  it('refuses a well-founded leaf that hangs off a cycle further up', () => {
    // The starting node is NOT part of the cycle, which is the realistic shape:
    // a leaf category is fine, and the loop is two levels above it. The walk
    // must still be refused, because it can never reach a root.
    const loopLower: CyclicNode = { id: 'loop-lower', parent: null };
    const loopUpper: CyclicNode = { id: 'loop-upper', parent: loopLower };
    loopLower.parent = loopUpper;
    const leaf: CyclicNode = { id: 'leaf', parent: loopLower };

    const failure = captureWalkFailure(() => buildIdPathList(leaf, readCyclicId, readCyclicParent));

    expect(failure.name).toBe('CyclicIdPathError');
    expect(failure.message).toContain("revisited node 'loop-lower'");
  });

  it('produces NO path at all, and stops climbing at the revisit', () => {
    // The contract is refusal, not a shorter answer. Two things are pinned:
    // that no string is returned - `captureWalkFailure` throws if one is - and
    // that the walk does not keep reading the chain after it has decided. A
    // counting accessor is used for the second, so a guard that detected the
    // cycle but carried on regardless would show up as a read count above the
    // cycle length.
    const first: CyclicNode = { id: 'p', parent: null };
    const second: CyclicNode = { id: 'q', parent: first };
    first.parent = second;

    let parentReads = 0;
    const countingParent: ParentNodeAccessor<CyclicNode> = (node) => {
      parentReads += 1;
      return node.parent;
    };

    expect(
      captureWalkFailure(() => buildIdPathList(first, readCyclicId, countingParent)).name,
    ).toBe('CyclicIdPathError');

    // p and q were each climbed from exactly once; the third visit was refused
    // before any further parent read.
    expect(parentReads).toBe(2);
  });

  it('explains what to do and discloses nothing beyond the offending identifier', () => {
    // The message names the identifier, the depth reached and the remedy, and
    // says why no path was produced. It is diagnostic text over caller-supplied
    // structural input: this module reads no environment, holds no connection
    // detail and sees no monetary value, so it has nothing sensitive available
    // to disclose.
    const selfParenting: CyclicNode = { id: 'pt-8001', parent: null };
    selfParenting.parent = selfParenting;

    expect(
      captureWalkFailure(() => buildIdPathList(selfParenting, readCyclicId, readCyclicParent))
        .message,
    ).toBe(
      "Materialized ID path walk revisited node 'pt-8001' after 1 level(s): the parent chain " +
        'contains a cycle. No path was produced, because a truncated path would silently change ' +
        'which promotion rewards and price-group rates apply. Break the cycle in the parent ' +
        'hierarchy.',
    );
  });

  it('leaves the cyclic hierarchy exactly as the caller built it', () => {
    // Refusing is not repairing. The guard does not unlink the parent, blank an
    // identifier or otherwise edit the caller's structure - it declines to
    // answer, and the malformed data stays visible for an operator to fix.
    const first: CyclicNode = { id: 'a', parent: null };
    const second: CyclicNode = { id: 'b', parent: first };
    first.parent = second;

    captureWalkFailure(() => buildIdPathList(first, readCyclicId, readCyclicParent));

    expect(first.id).toBe('a');
    expect(first.parent).toBe(second);
    expect(second.parent).toBe(first);
  });

  it('retains nothing between calls: a well-founded walk after a refused one is unaffected', () => {
    // The visited set is local to one call. If it were module-scoped it would
    // survive between unrelated invocations on a warm Lambda container - the
    // exact hazard that puts four legacy component-level caches into request
    // scope in this port - and the second walk here would be refused for
    // revisiting a node the FIRST walk saw.
    const shared: CyclicNode = { id: 'shared', parent: null };
    shared.parent = shared;

    const firstRefusal = captureWalkFailure(() =>
      buildIdPathList(shared, readCyclicId, readCyclicParent),
    );

    expect(firstRefusal.name).toBe('CyclicIdPathError');
    expect(firstRefusal.message).toContain("revisited node 'shared' after 1 level(s)");

    const root: CyclicNode = { id: 'root', parent: null };
    const leaf: CyclicNode = { id: 'leaf', parent: root };

    expect(buildIdPathList(leaf, readCyclicId, readCyclicParent)).toBe('root,leaf');

    // And the refused walk is still refused IDENTICALLY after a successful one -
    // same reason and same reported depth, not merely the same error name. A
    // visited set that leaked across calls would show up here as a different
    // depth, because the second refusal would have inherited the first walk's
    // nodes.
    const secondRefusal = captureWalkFailure(() =>
      buildIdPathList(shared, readCyclicId, readCyclicParent),
    );

    expect(secondRefusal.name).toBe('CyclicIdPathError');
    expect(secondRefusal.message).toBe(firstRefusal.message);
  });

  it('tracks node IDENTITY, so a repeated identifier on distinct nodes is still a valid path', () => {
    // The guard cannot be identifier-based. This suite already pins that an
    // accessor may answer a different identifier on successive calls for the
    // same node, and identifiers are carried through verbatim rather than being
    // treated as unique keys. Two DISTINCT product types sharing an identifier
    // is malformed data, but it is not a cycle, it terminates, and the legacy
    // walk answers a path for it - so this port answers one too.
    const root: CyclicNode = { id: 'duplicated', parent: null };
    const child: CyclicNode = { id: 'duplicated', parent: root };

    expect(buildIdPathList(child, readCyclicId, readCyclicParent)).toBe('duplicated,duplicated');
  });
});

describe('buildIdPathList: the depth backstop behind the identity guard', () => {
  // WHY A SECOND GUARD EXISTS AT ALL. Identity tracking is exact and cannot
  // false-positive, but it can only see nodes that are the SAME OBJECT. A parent
  // accessor that manufactures a fresh node on every call - a lazily-hydrating
  // adapter, or a proxy - never repeats an object, so the visited set never
  // fills and the walk climbs forever. The depth value is the backstop for that
  // one shape, and it is deliberately set where no legitimate hierarchy can
  // reach it.

  it('refuses a parent chain that manufactures a fresh node on every read', () => {
    const manufacturingParent: ParentNodeAccessor<CyclicNode> = (node) => ({
      id: `${node.id}-up`,
      parent: null,
    });

    const failure = captureWalkFailure(() =>
      buildIdPathList({ id: 'start', parent: null }, readCyclicId, manufacturingParent),
    );

    expect(failure.name).toBe('CyclicIdPathError');
    expect(failure.message).toContain('exceeded 4096 levels');
    expect(failure.message).toContain('the parent chain is unbounded');
    // The two reasons are distinguishable from the message alone, which is what a
    // caller needs: a cycle is fixed by unlinking a parent, an unbounded chain by
    // fixing the accessor.
    expect(failure.message).not.toContain('contains a cycle');
  });

  it('accepts a chain of exactly 4096 levels and refuses one of 4097', () => {
    // THE EXACT BOUNDARY, asserted rather than approximated. The limit is a count
    // of LEVELS: 4096 of them are walked and produce a path, and the 4097th is
    // refused.
    //
    // Both numbers are far beyond anything persistable, which is the point of
    // choosing them. All three path columns are declared
    // `ormtype="string" length="4000"` - [model/entity/ProductType.cfc:L53],
    // [model/entity/PriceGroup.cfc:L53] and [model/entity/Category.cfc:L53] - and
    // a 32-character identifier plus its delimiter is 33 characters, so at most
    // 121 levels can be stored. The backstop sits 34 times above that.
    const buildChain = (depth: number): CyclicNode => {
      let cursor: CyclicNode = { id: 'n0', parent: null };

      for (let level = 1; level < depth; level += 1) {
        cursor = { id: `n${String(level)}`, parent: cursor };
      }

      return cursor;
    };

    const accepted = buildIdPathList(buildChain(4096), readCyclicId, readCyclicParent);

    expect(listLen(accepted)).toBe(4096);
    expect(listGetAt(accepted, 1)).toBe('n0');
    expect(listGetAt(accepted, 4096)).toBe('n4095');

    const failure = captureWalkFailure(() =>
      buildIdPathList(buildChain(4097), readCyclicId, readCyclicParent),
    );

    expect(failure.name).toBe('CyclicIdPathError');
    expect(failure.message).toContain('exceeded 4096 levels');
  });
});

// ---------------------------------------------------------------------------
// THE SETTER-BOUNDARY HALF OF THE SAME DIVERGENCE
//
// `buildIdPathList` refuses to PRODUCE a path from a cyclic chain, which is what
// keeps a save from hanging. `wouldCreateIdPathCycle` lets the three path-bearing
// entities refuse to CREATE the cycle, which is what protects the walks over the
// same parent chain that never build a path at all - the price-group cascade's
// read-path ancestor climb [model/service/PriceGroupService.cfc:L68-L77] and
// `ProductType.getSimpleRepresentation()`'s recursion
// [model/entity/ProductType.cfc:L273-L278]. Both are needed; neither subsumes the
// other.
//
// IT ANSWERS A QUESTION AND NEVER THROWS ONE. Every entity raises its own error
// naming its own identifiers and its own association, which is more useful to an
// operator than one generic message - and it keeps this module free of any opinion
// about how a caller should fail. So every assertion below is on a boolean.
// ---------------------------------------------------------------------------

describe('wouldCreateIdPathCycle: refusing the assignment rather than the path', () => {
  it('reports the tightest cycle - a node proposed as its own parent', () => {
    const node: HierarchyNode = { id: 'self', parent: null };

    expect(wouldCreateIdPathCycle(node, node, readParent)).toBe(true);
  });

  it('reports a direct child proposed as a parent', () => {
    const parent: HierarchyNode = { id: 'parent', parent: null };
    const child: HierarchyNode = { id: 'child', parent: parent };

    expect(wouldCreateIdPathCycle(parent, child, readParent)).toBe(true);
  });

  it('WALKS rather than comparing one level, so a distant descendant is reported too', () => {
    // A one-level comparison would miss this, and a cycle closed four levels down
    // is exactly as fatal as a self-parent while being far easier to create by
    // accident.
    const a: HierarchyNode = { id: 'a', parent: null };
    const b: HierarchyNode = { id: 'b', parent: a };
    const c: HierarchyNode = { id: 'c', parent: b };
    const d: HierarchyNode = { id: 'd', parent: c };
    const e: HierarchyNode = { id: 'e', parent: d };

    expect(wouldCreateIdPathCycle(a, e, readParent)).toBe(true);
    // Every intermediate level is reported as well, not just the deepest.
    expect(wouldCreateIdPathCycle(a, d, readParent)).toBe(true);
    expect(wouldCreateIdPathCycle(a, c, readParent)).toBe(true);
    expect(wouldCreateIdPathCycle(a, b, readParent)).toBe(true);
  });

  it('accepts every well-founded assignment, so a legitimate move is not penalised', () => {
    // The whole hierarchy is one chain plus one unrelated branch. Assignments that
    // move a node UP, SIDEWAYS or onto an unrelated root are all sound, and a
    // guard that rejected any of them would be a regression rather than a fix.
    const root: HierarchyNode = { id: 'root', parent: null };
    const mid: HierarchyNode = { id: 'mid', parent: root };
    const leaf: HierarchyNode = { id: 'leaf', parent: mid };
    const unrelatedRoot: HierarchyNode = { id: 'other-root', parent: null };
    const unrelatedLeaf: HierarchyNode = { id: 'other-leaf', parent: unrelatedRoot };

    // Upward: the leaf reparented onto its own grandparent.
    expect(wouldCreateIdPathCycle(leaf, root, readParent)).toBe(false);
    // Sideways: onto an unrelated branch.
    expect(wouldCreateIdPathCycle(leaf, unrelatedLeaf, readParent)).toBe(false);
    expect(wouldCreateIdPathCycle(mid, unrelatedRoot, readParent)).toBe(false);
    // And a root taking a parent for the first time.
    expect(wouldCreateIdPathCycle(unrelatedRoot, leaf, readParent)).toBe(false);
  });

  it('reports IDENTITY, so two distinct nodes sharing an identifier are still sound', () => {
    // The check cannot be identifier-based. Identifiers are carried into the path
    // verbatim and are not unique keys anywhere in this module, so two DISTINCT
    // nodes with the same identifier are malformed data but not a cycle: the chain
    // still terminates and the legacy answers a path for it.
    const first: CyclicNode = { id: 'duplicated', parent: null };
    const second: CyclicNode = { id: 'duplicated', parent: null };

    expect(wouldCreateIdPathCycle(second, first, readCyclicParent)).toBe(false);
    expect(buildIdPathList(second, readCyclicId, readCyclicParent)).toBe('duplicated');
  });

  it('reports a candidate whose OWN chain is already cyclic, rather than looping on it', () => {
    // A graph assembled before this guard existed, or by a caller that bypasses
    // the setters, can already be cyclic. Walking it must terminate: no assignment
    // onto a chain that never reaches a root can be sound, so this answers `true`
    // instead of following it forever.
    const loopLower: CyclicNode = { id: 'loop-lower', parent: null };
    const loopUpper: CyclicNode = { id: 'loop-upper', parent: loopLower };
    loopLower.parent = loopUpper;

    const outsider: CyclicNode = { id: 'outsider', parent: null };

    expect(wouldCreateIdPathCycle(outsider, loopLower, readCyclicParent)).toBe(true);
    expect(wouldCreateIdPathCycle(outsider, loopUpper, readCyclicParent)).toBe(true);
  });

  it('reports an unbounded candidate chain that manufactures a fresh node per read', () => {
    // The shape identity tracking cannot see: a lazily-hydrating accessor or a
    // proxy never repeats an object, so the visited set never fills. The same
    // depth backstop the path walk uses bounds this one, at the same limit and for
    // the same reason.
    const manufacturingParent: ParentNodeAccessor<CyclicNode> = (node) => ({
      id: `${node.id}-up`,
      parent: null,
    });

    expect(
      wouldCreateIdPathCycle(
        { id: 'start', parent: null },
        { id: 'candidate', parent: null },
        manufacturingParent,
      ),
    ).toBe(true);
  });

  it('accepts a candidate chain of 4095 levels and reports one of 4096', () => {
    // THE EXACT BOUNDARY, asserted rather than approximated, and it is one level
    // tighter than the path walk's because this walk starts at the CANDIDATE
    // rather than at the node: the candidate's own chain contributes every level.
    //
    // Both numbers are far beyond anything persistable, which is why they are
    // safe. All three path columns are declared `ormtype="string" length="4000"`
    // and a 32-character identifier plus its delimiter is 33 characters, so at
    // most 121 levels can be stored.
    const buildChain = (depth: number): CyclicNode => {
      let cursor: CyclicNode = { id: 'n0', parent: null };

      for (let level = 1; level < depth; level += 1) {
        cursor = { id: `n${String(level)}`, parent: cursor };
      }

      return cursor;
    };

    const node: CyclicNode = { id: 'assignee', parent: null };

    expect(wouldCreateIdPathCycle(node, buildChain(4095), readCyclicParent)).toBe(false);
    expect(wouldCreateIdPathCycle(node, buildChain(4096), readCyclicParent)).toBe(true);
  });

  it('retains nothing between calls', () => {
    // The visited set is local to one call. Module-scoped, it would outlive an
    // invocation on a warm container - the hazard that puts four legacy
    // component-level caches into request scope in this port - and the second
    // sound assignment below would be reported as a cycle because the first call
    // had already seen its nodes.
    const root: CyclicNode = { id: 'root', parent: null };
    const leaf: CyclicNode = { id: 'leaf', parent: root };
    const outsider: CyclicNode = { id: 'outsider', parent: null };

    expect(wouldCreateIdPathCycle(root, leaf, readCyclicParent)).toBe(true);
    expect(wouldCreateIdPathCycle(outsider, leaf, readCyclicParent)).toBe(false);
    expect(wouldCreateIdPathCycle(outsider, leaf, readCyclicParent)).toBe(false);
    expect(wouldCreateIdPathCycle(root, leaf, readCyclicParent)).toBe(true);
  });

  it('treats null and undefined parents identically, under the same CFML absent rule', () => {
    // `ParentNodeAccessor` accepts both, and the module routes both through one
    // `isNull()`-equivalent test. A root reported as `undefined` must terminate the
    // walk exactly as a `null` one does, or the answer would depend on which
    // absent value an accessor happened to return.
    const nullRoot: HierarchyNode = { id: 'null-root', parent: null };
    const child: HierarchyNode = { id: 'child', parent: nullRoot };
    const undefinedParent: ParentNodeAccessor<HierarchyNode> = (node) =>
      node.parent === null ? undefined : node.parent;

    // The CYCLE direction: the root taking its own child as a parent. Reported
    // identically whichever absent value the accessor uses for the top of the
    // chain, because the walk reaches `node` before it ever reaches the root.
    expect(wouldCreateIdPathCycle(nullRoot, child, readParent)).toBe(true);
    expect(wouldCreateIdPathCycle(nullRoot, child, undefinedParent)).toBe(true);

    // The SOUND direction, which is where the absent value actually decides the
    // answer: the walk has to reach the top of the chain and recognise it as a
    // root. A `null` root and an `undefined` root must both end it.
    const outsider: HierarchyNode = { id: 'outsider', parent: null };
    expect(wouldCreateIdPathCycle(outsider, child, readParent)).toBe(false);
    expect(wouldCreateIdPathCycle(outsider, child, undefinedParent)).toBe(false);

    // And re-assigning a node's EXISTING parent is sound, not a cycle: `child`
    // already sits under `nullRoot`, and setting the same link again changes
    // nothing about reachability.
    expect(wouldCreateIdPathCycle(child, nullRoot, readParent)).toBe(false);
    expect(wouldCreateIdPathCycle(child, nullRoot, undefinedParent)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE READ HALF - resolveIdPath, the lazy accessor
//
// Authority: the two lazy getters at model/entity/PriceGroup.cfc:L195-L200 and
// model/entity/ProductType.cfc:L250-L255. Both guard with isNull(...), and that
// choice - not the structKeyExists(...) form used elsewhere - decides the
// behaviour asserted below.
// ---------------------------------------------------------------------------

describe('resolveIdPath: the CFML null rule that decides recomputation', () => {
  it('pins the null rule itself: only null and undefined are absent', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L196] and [model/entity/ProductType.cfc:L251]: both
    // guards are `isNull(...)`.
    //
    // CFML parity [model/entity/ProductType.cfc:L251, L123]: the SAME FILE uses two memo idioms,
    //
    //       isNull(variables.productTypeIDPath)                    L251, the path
    //       !structKeyExists(variables, "parentProductTypeOptions") L123, its option list
    //
    // and model/entity/Sku.cfc uses the structKeyExists form throughout, including currencyDetails
    // at L368. The path getters are the exception, the two forms are not interchangeable, and the
    // exception is reproduced deliberately rather than tidied into the majority idiom. The module
    // wraps the rule in an unexported local helper, so it is pinned here at its origin.
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
    // follows from the `isNull` guard on each of those lines. An empty string is a PRESENT value
    // under that rule, so the legacy getter returns it untouched instead of rebuilding the path,
    // and so does the target. Treating '' as missing looks like a helpful correction and is not
    // one: it would rebuild a path the legacy platform returned empty, and the product-type path
    // decides which order items a promotion reward matches. A caller wanting a rebuild passes null.
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

// ---------------------------------------------------------------------------
// THE READ HALF - getRootIdFromIdPath, the root extractor
//
// Authority: model/entity/ProductType.cfc:L110-L115. `getBaseProductType()` reads the FIRST element
// of getProductTypeIDPath() at L112 to resolve a product type and take its system code, guarded at
// L111 by `isNull(getSystemCode()) || getSystemCode() == ""`.
// ---------------------------------------------------------------------------

describe('getRootIdFromIdPath: the first element is the root', () => {
  it('extracts the root from a multi-element path', () => {
    // CFML parity [model/entity/ProductType.cfc:L112]: the legacy expression is
    // `listFirst(getProductTypeIDPath())`.
    //
    // JUDGMENT CALL: the CFML first-element helper is not part of the parity helper module's closed
    // surface, so the same value is read as a 1-based positional lookup, which is what CFML's own
    // indexing is; the equivalence is asserted below rather than assumed.
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
    // faithfully ported code, since every legacy walk is bounded by `i <= listLen(...)`. Answering
    // '' keeps the return type honestly `string`, and the two ways to arrive here with an empty
    // path are a stored empty string and a single empty identifier.
    expect(getRootIdFromIdPath('')).toBe('');
    expect(() => getRootIdFromIdPath('')).not.toThrow();
  });

  it('does not trim the element it returns', () => {
    expect(getRootIdFromIdPath(' padded ,mid')).toBe(' padded ');
  });
});

// ---------------------------------------------------------------------------
// THE READ HALF - idPathContainsId, single-identifier membership
// ---------------------------------------------------------------------------

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
    // CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966]: all FOUR legacy path
    // walks read the positional lookup AS THOUGH IT WERE A BOOLEAN - `if(listFindNoCase(...))`.
    // There is a fifth lookup over a literal list at L794, but that is not a path walk. Reproducing
    // the anti-pattern literally would be a bug waiting to happen in TypeScript: it only appears to
    // work because 0 is falsy and 1 truthy by coincidence, and the bare form breaks the moment the
    // result is stored in a boolean or compared against true. The shipped export performs the `> 0`
    // conversion exactly once, and toBe rejects a number where toBeTruthy accepts 1.
    const present: boolean = idPathContainsId('root,mid,leaf', 'root');
    const absent: boolean = idPathContainsId('root,mid,leaf', 'stranger');

    expect(present).toBe(true);
    expect(absent).toBe(false);
    expect(typeof present).toBe('boolean');
    expect(typeof absent).toBe('boolean');
  });

  it('discharges the `> 0` obligation against the positional lookup itself', () => {
    // JUDGMENT CALL: the shipped membership export returns a boolean rather than a position, so the
    // index-level assertions - absent answers 0, a first-position match answers 1 - can only be
    // made against the primitive it delegates to; pinning them here is what makes the boolean
    // conversion above meaningful rather than circular. The LIST argument comes first.
    expect(listFindNoCase('root,mid,leaf', 'stranger')).toBe(0);
    expect(listFindNoCase('root,mid,leaf', 'root')).toBe(1);
    expect(listFindNoCase('root,mid,leaf', 'mid')).toBe(2);
    expect(listFindNoCase('root,mid,leaf', 'leaf')).toBe(3);

    // The hazard, stated as an assertion: a first-position match is 1, which is NOT 0 and is NOT
    // the boolean true.
    expect(listFindNoCase('root,mid,leaf', 'root')).not.toBe(0);
    expect(listFindNoCase('root,mid,leaf', 'root')).not.toBe(true);
  });

  it('matches a whitespace-bearing identifier without trimming either side', () => {
    expect(idPathContainsId('root, padded ', ' padded ')).toBe(true);
    expect(idPathContainsId('root, padded ', 'padded')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE READ HALF - idPathContainsAnyId, the duplication this module centralises
//
// Authority: four legacy walks sharing one shape, all over
// getProductTypeIDPath() and all deciding whether a promotion reward applies -
// qualifier exclusion at model/service/PromotionService.cfc:L858-L870, qualifier
// inclusion at L892-L904, reward exclusion at L928-L940 and reward inclusion at
// L958-L970.
// ---------------------------------------------------------------------------

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
    // guards accumulation with an array-length check, and that guard stays with the caller. An
    // empty candidate list answering false is what skipping the guarded block achieves, so this
    // function needs no guard.
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
    // WHAT THIS TEST CLAIMS. The legacy orientation is real and cited: at
    // [model/service/PromotionService.cfc:L864-L865] the loop walks the PATH with a 1-based index
    // bounded by its element count and searches the CANDIDATE LIST for each element, not the other
    // way round, and the shipped function reproduces that shape.
    //
    // BUT NO ASSERTION HERE CAN PROVE THE ORIENTATION. The function answers one boolean, and "do
    // these two lists share an element?" is SET INTERSECTION, which is symmetric: walking the
    // candidates and searching the path would return the same boolean for every input below.
    // Orientation is therefore a SOURCE MAPPING established by reading, and the claim is narrowed
    // to BEHAVIOURAL EQUIVALENCE with the legacy loop spelled out against the primitives, over
    // inputs deliberately asymmetric in length and duplicates.

    /**
     * The legacy loop written out: walk the path by 1-based position, bounded by its element count,
     * searching the candidate list for each element. A pure local closure, the comparison subject
     * and never a substitute.
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

    // Both subjects asserted against the SAME expected column: agreeing with a spelled-out loop
    // proves nothing if the loop itself is wrong.
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
    // walks set a flag and break; the two INCLUSION walks return true immediately and keep no flag.
    // Neither observes anything beyond "was a common element found", so one boolean serves both -
    // the exclusion shape first, then the inclusion shape asking the same question.
    const productTypePath = 'rootType,midType,leafType';
    expect(idPathContainsAnyId(productTypePath, 'midType')).toBe(true);
    expect(idPathContainsAnyId(productTypePath, 'unrelatedType')).toBe(false);

    expect(idPathContainsAnyId(productTypePath, 'rootType,anotherType')).toBe(true);
  });

  it('collapses consecutive delimiters on both sides, consistently with the count', () => {
    // Empty elements contribute nothing, on the path side and the candidate side alike, which keeps
    // the bounded walk and the element count in step.
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

// ---------------------------------------------------------------------------
// THE LOAD-BEARING LIST GUARANTEE THE ORDERING RESTS ON
// ---------------------------------------------------------------------------

describe('the no-leading-delimiter guarantee the root-first ordering rests on', () => {
  it('appending onto an EMPTY list answers the value alone', () => {
    // CFML parity [model/service/PromotionService.cfc:L859-L862, L893-L897, L929-L932, L959-L963]:
    // all four legacy candidate accumulators start from an empty string and append, and every one
    // depends on this rule - without it each accumulated list would carry a leading comma and the
    // lookup would compare against a phantom empty element. The shipped builder relies on the same
    // rule to emit a root-first path with no leading delimiter.
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

// ---------------------------------------------------------------------------
// THE TWO HALVES ARE INDEPENDENT
//
// The three path-bearing entities reach the same value by three different
// routes, so no single half serves all three:
//
//   PriceGroup   lazy getter model/entity/PriceGroup.cfc:L195-L200, PLUS eager
//                assignment in both persistence hooks at L206-L214
//   ProductType  the same three-part shape, at L250-L255 and L305-L313
//   Category     NO lazy getter at all - its "Overridden Methods" block at
//                model/entity/Category.cfc:L120-L122 is LITERALLY EMPTY and a
//                memo-guard search across that file returns ZERO; its only
//                route is the two hooks at L126-L134.
// ---------------------------------------------------------------------------

describe('the write half and the read half are independent', () => {
  it('exercises the WRITE half with no lazy accessor involved at all', () => {
    // CFML parity [model/entity/Category.cfc:L120-L122]: this is the Category shape and the
    // decisive proof that the two halves are independent. That entity has no overridden getter and
    // no memo guard anywhere, so it computes the path in its hooks and never reaches the lazy
    // accessor.
    const root: HierarchyNode = { id: 'rootCategory', parent: null };
    const child: HierarchyNode = { id: 'childCategory', parent: root };

    expect(buildIdPathList(child, readId, readParent)).toBe('rootCategory,childCategory');
  });

  it('exercises the READ half over a stored string with no builder involved', () => {
    // The mirror image: the accessor, the root extractor and both membership tests all operate on a
    // path that already exists, with no recomputation callback ever invoked and no hierarchy in
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
    // returns it. The ASSIGNMENT back onto the entity stays with the entity; this module supplies
    // the decision and the value, never the storage.
    //
    // Deliberately NOT asserted here: WHEN the path is assigned relative to a consuming entity's
    // inherited lifecycle delegation. The three entities do not agree - PriceGroup and ProductType
    // assign before delegating, Category delegates first and assigns after - so it is reproduced in
    // the sibling entity modules; this module encodes no ordering at all.
    const root: HierarchyNode = { id: 'rootGroup', parent: null };
    const child: HierarchyNode = { id: 'childGroup', parent: root };

    const computed = resolveIdPath(null, () => buildIdPathList(child, readId, readParent));

    expect(computed).toBe('rootGroup,childGroup');
    expect(getRootIdFromIdPath(computed)).toBe('rootGroup');
    expect(idPathContainsId(computed, 'rootGroup')).toBe(true);
    expect(idPathContainsAnyId(computed, 'rootGroup')).toBe(true);
  });

  it('serves all three in-scope path-bearing entities from one primitive', () => {
    // The consumer set is bounded at THREE: priceGroupIDPath [model/entity/PriceGroup.cfc:L53],
    // productTypeIDPath [model/entity/ProductType.cfc:L53] and categoryIDPath
    // [model/entity/Category.cfc:L53]. The legacy framework builder is also called from
    // model/entity/Content.cfc and model/entity/Type.cfc, both out of scope and mentioned only to
    // bound the set. The primitive is generic over the node type so one implementation covers all
    // three.
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

// ---------------------------------------------------------------------------
// SURFACE PROHIBITIONS
//
// What the module deliberately does NOT offer is as much a part of its contract as what it does, so
// the absences are asserted rather than trusted.
// ---------------------------------------------------------------------------

describe('the exported surface is closed', () => {
  it('exports EXACTLY the six path functions and nothing else', () => {
    // One assertion discharges several obligations at once. It proves there is
    // no path-mutation surface, no default export, and no exported mutable
    // binding that could carry state between calls.
    //
    // The two accessor types are compile-time only and correctly absent at
    // runtime; they are exercised by the typed accessors declared near the top
    // of this file. The module's own null-rule wrapper is module-local and
    // correctly absent too, which is why the rule itself is pinned against the
    // parity helper instead.
    //
    // WHY THE SET IS SIX AND WAS FIVE. `wouldCreateIdPathCycle` is the
    // setter-boundary half of the cycle divergence: `buildIdPathList` refuses to
    // PRODUCE a path from a cyclic chain, and this one lets the three
    // path-bearing entities refuse to CREATE the cycle, which is what protects
    // the walks over the same parent chain that never build a path at all - the
    // price-group cascade's read-path ancestor climb
    // [model/service/PriceGroupService.cfc:L68-L77] and
    // `getSimpleRepresentation()`'s recursion
    // [model/entity/ProductType.cfc:L273-L278]. It belongs HERE rather than
    // being hand-rolled three times because parent-chain walking is this
    // module's whole responsibility - `productType.ts` states that rule
    // explicitly - and a shared implementation is one place to audit instead of
    // three to keep in step.
    //
    // The widening is deliberate and asserted rather than accommodated: the
    // number in this expectation is the control that makes any FURTHER widening
    // a decision someone has to take on purpose.
    expect(Object.keys(materializedIdPathModule).sort()).toStrictEqual([
      'buildIdPathList',
      'getRootIdFromIdPath',
      'idPathContainsAnyId',
      'idPathContainsId',
      'resolveIdPath',
      'wouldCreateIdPathCycle',
    ]);
  });

  it('the added export is a QUESTION, not a mutation: it cannot reparent anything', () => {
    // `wouldCreateIdPathCycle` widens the surface, so the prohibition the next
    // test names has to be re-established for it specifically. It takes an
    // accessor that READS a parent and never one that writes, it answers a
    // boolean, and it is the only member of the surface that could plausibly be
    // mistaken for a graph-editing helper.
    const root: HierarchyNode = { id: 'root', parent: null };
    const leaf: HierarchyNode = { id: 'leaf', parent: root };

    expect(wouldCreateIdPathCycle(root, leaf, readParent)).toBe(true);

    // The hierarchy is exactly as it was: nothing was unlinked, relinked or
    // blanked in order to answer.
    expect(leaf.parent).toBe(root);
    expect(root.parent).toBeNull();
    expect(root.id).toBe('root');
    expect(leaf.id).toBe('leaf');
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
    // option-list filter at model/entity/ProductType.cfc:L129, the prefix comparison at L264 and
    // the quoted-list rewrite at L292. All three belong to other folders, as does the
    // engine-specific path assembly at model/dao/PromotionDAO.cfc:L482-L488, which is
    // repository-tier: no query text appears in this folder, and the obligation to bind parameters
    // rather than concatenate them rests wholly with that tier.
    const exportedNames = Object.keys(materializedIdPathModule);

    expect(exportedNames).not.toContain('startsWithIdPath');
    expect(exportedNames).not.toContain('idPathLikePattern');
    expect(exportedNames).not.toContain('quoteIdPath');
  });

  it('closes its export surface to functions only, so no EXPORTED binding can carry state', () => {
    // SCOPED TO WHAT THE EXPORT SHAPE GUARANTEES. Every export being a function rules out a
    // directly reachable stateful binding - an exported object, array, `Map` or mutable counter a
    // caller could read or write. It does NOT establish the absence of module-PRIVATE mutable
    // state: a module-level cache behind a function export would satisfy this shape exactly, and on
    // a warm Lambda container it would outlive an invocation and let one request observe another's
    // path - the same hazard that makes four legacy component-level caches request-scoped in this
    // port. Behavioural isolation is therefore asserted separately, in the test below and in
    // `holds no memo: identical calls recompute and still agree`.
    const everyExportIsAFunction = Object.values(materializedIdPathModule).every(
      (exported) => typeof exported === 'function',
    );

    expect(everyExportIsAFunction).toBe(true);
  });

  it('keeps two hierarchies isolated when their calls are INTERLEAVED', () => {
    // The behavioural counterpart to the export-shape assertion above, and the assertion that would
    // actually catch a private cache. Two unrelated hierarchies are walked in alternation with the
    // read side interleaved, so a cache keyed on nothing - or on the wrong thing - would surface as
    // one hierarchy's answer appearing in the other's. On a warm container two invocations share a
    // module instance, and the second walk here plays the part of the second invocation.
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

    // The sharpest probe available for per-node interning: the SAME node object is walked twice
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
    // membership questions agree because the computation is deterministic, not because a result was
    // cached.
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
