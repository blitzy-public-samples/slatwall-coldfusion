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
// NO CYCLE GUARD, AND NO DEPTH CEILING - THE WALK IS REPRODUCED, NOT IMPROVED
//
// Authority for the behaviour: the do/while at
// [org/Hibachi/HibachiEntity.cfc:L314-L321] holds no visited set and no
// iteration bound, so a `parentProductType` chain that returns to a node it has
// already passed is followed forever. The port reproduces that, so a cyclic
// chain does not terminate here either.
//
// ★ THIS BLOCK ONCE ASSERTED THE OPPOSITE, AND THE RECORD BELONGS HERE. It ran
// under the banner "THE ONE DECLARED DIVERGENCE - a cyclic or unbounded parent
// chain is REFUSED" and pinned a `CyclicIdPathError` thrown by a visited-identity
// set with a 4096-level depth backstop behind it, plus a `wouldCreateIdPathCycle`
// export that let three entity setters refuse a reparent. All of it is gone,
// because a port reproduces rather than improves and because the project's
// deliberate-divergence budget is closed at three - none of which is spent here.
// Where termination genuinely had to be decided, it is decided at the MySQL
// adapters that materialize an ancestry, as a fetch-shape decision under
// transformation rule T3.
//
// HOW AN ABSENT GUARD IS ASSERTED WITHOUT HANGING THIS SUITE. A test cannot walk
// a cyclic chain to completion, because there is no completion. So the absence is
// proven from the other side: the parent accessor itself counts its reads and
// throws a sentinel far beyond the point at which either removed guard would have
// fired. Observing the sentinel - rather than a refusal at read 4, or at level
// 4096 - is the proof that neither guard survives. The walk is never left running.
// ---------------------------------------------------------------------------

/**
 * One node of a hierarchy that is allowed to contain a cycle.
 *
 * JUDGMENT CALL: a second node shape, deliberately mutable in exactly one field,
 * so a cycle can be closed after construction. `HierarchyNode` above is fully
 * readonly precisely so that a cycle cannot be built by accident in the blocks
 * that are not about cycles; this shape is confined to the block that is.
 */
interface CyclicNode {
  readonly id: string;
  parent: CyclicNode | null;
}

/** Reads a cycle-capable node's identifier. Same role as {@link readId}. */
const readCyclicId: PrimaryIdAccessor<CyclicNode> = (node) => node.id;

/** Reads a cycle-capable node's parent. Same role as {@link readParent}. */
const readCyclicParent: ParentNodeAccessor<CyclicNode> = (node) => node.parent;

describe('buildIdPathList: no cycle guard, and no depth ceiling', () => {
  it('climbs a cyclic chain without refusing it, long past where a guard would have fired', () => {
    // A three-node cycle. A visited-identity set would have refused this at the
    // fourth read; a 4096-level cap would have refused it at level 4096. Neither
    // happens: the accessor's own sentinel is what stops the walk, at 20000 reads.
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

    // The sentinel, not a refusal - and the read count proves the walk went far
    // beyond both removed guards rather than being stopped early by either.
    expect(caught).toBe(sentinel);
    expect(reads).toBe(20000);
  });

  it('answers a path for a well-founded chain deeper than the removed 4096 ceiling', () => {
    // Positive proof the depth cap is gone: this is the exact input the old
    // backstop refused. A well-founded chain of any depth is answered, which is
    // the invariant [org/Hibachi/HibachiEntity.cfc:L314-L321] has.
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
    // The shape the removed visited-identity set could never see: a lazily
    // hydrating adapter or proxy never returns the same object twice. With no
    // visited set to fill, nothing here depends on object identity at all - a
    // well-founded chain simply terminates when the accessor answers null.
    const manufacturingParent: ParentNodeAccessor<CyclicNode> = (node) => {
      const level = Number(node.id.replace('level', ''));
      return level === 0 ? null : { id: `level${String(level - 1)}`, parent: null };
    };

    expect(buildIdPathList({ id: 'level3', parent: null }, readCyclicId, manufacturingParent)).toBe(
      'level0,level1,level2,level3',
    );
  });

  it('answers a path when two distinct nodes share an identifier, because that is not a cycle', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L314-L321]: the legacy loop
    // advances on the OBJECT, never on the identifier, so repeating an identifier
    // is not revisiting the same node. Two DISTINCT product types sharing an
    // identifier is malformed data, but it terminates and the legacy walk answers
    // a path for it - so this port answers one too.
    const root: CyclicNode = { id: 'duplicated', parent: null };
    const child: CyclicNode = { id: 'duplicated', parent: root };

    expect(buildIdPathList(child, readCyclicId, readCyclicParent)).toBe('duplicated,duplicated');
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
  it('exports EXACTLY the five path functions and nothing else', () => {
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
    // ★ THE SET IS FIVE, AND IT WAS BRIEFLY SIX. A `wouldCreateIdPathCycle`
    // export was added here so three entity setters could refuse a reparent that
    // would close a cycle. It has been removed along with the refusal itself: the
    // legacy setters validate nothing, a port reproduces rather than improves, and
    // the project's deliberate-divergence budget is closed at three - none of them
    // spent in this folder. The number in this expectation is the control that
    // makes any widening a decision someone has to take on purpose, so it is
    // asserted exactly rather than as a lower bound.
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
