// slatwall-ts - characterization suite pinning `src/domain/entities/priceGroup.ts`
//
// `PriceGroup` ports model/entity/PriceGroup.cfc (226 lines; the body closes at L225), the
// hierarchical grouping whose parent chain.
//
// Four `LEGACY-DEFECT` MARKERS are SPENT here, each verified against the shipped module before it
// was spent, and each stated in full at its own site.
//
// Everything else preserved here is a `CFML parity` note and not a defect: the first-versus-last
// global-rate disagreement, the four-site `subsciptionUsageBenefit` argument typo, the capitalised
// `ChildPriceGroup` singular name, the missing `remoteID`, the missing `priceGroupRates` delete
// gate.

import { describe, expect, it } from 'vitest';

import { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../../src/domain/entities/priceGroupRate.js';
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import {
  buildIdPathList,
  getRootIdFromIdPath,
  idPathContainsId,
  resolveIdPath,
} from '../../../../src/domain/valueObjects/materializedIdPath.js';
import { makePriceGroupFixtures } from '../../../fixtures/priceGroupFixtures.js';

/**
 * The overrides a test may supply when building a subject.
 *
 * Every slot is optional here and required on the class constructor, deliberately in both places.
 *
 * `activeFlag` accepts the same wide input union the constructor does, modelled structurally
 * rather than by importing the coercion helper's own type: this tier may reach into
 * `src/domain/**` and `tests/fixtures/**` only.
 */
interface PriceGroupOverrides {
  readonly priceGroupID?: string | undefined;
  readonly priceGroupIDPath?: string | undefined;
  readonly activeFlag?: string | number | boolean | null | undefined;
  readonly priceGroupName?: string | undefined;
  readonly priceGroupCode?: string | undefined;
  readonly parentPriceGroup?: PriceGroup | undefined;
  readonly childPriceGroups?: PriceGroup[] | undefined;
  readonly priceGroupRates?: PriceGroupRate[] | undefined;
  readonly promotionRewards?: PromotionReward[] | undefined;
  readonly parentPriceGroupOptionCandidates?:
    readonly { readonly name: string; readonly value: string }[] | undefined;
  readonly createdDateTime?: Date | undefined;
  readonly createdByAccountID?: string | undefined;
  readonly modifiedDateTime?: Date | undefined;
  readonly modifiedByAccountID?: string | undefined;
}

/**
 * Builds one `PriceGroup`, fresh, from the overrides supplied.
 *
 * `priceGroupID` defaults to a NON-EMPTY value, so the default subject is SAVED and `isNew()`
 * reports `false`.
 *
 * Each collection defaults to a NEWLY CONSTRUCTED array on every call.
 */
function aPriceGroup(overrides: PriceGroupOverrides = {}): PriceGroup {
  return new PriceGroup({
    priceGroupID: overrides.priceGroupID ?? 'pricegroup-subject',
    priceGroupIDPath: overrides.priceGroupIDPath,
    activeFlag: overrides.activeFlag,
    priceGroupName: overrides.priceGroupName,
    priceGroupCode: overrides.priceGroupCode,
    parentPriceGroup: overrides.parentPriceGroup,
    childPriceGroups: overrides.childPriceGroups ?? [],
    priceGroupRates: overrides.priceGroupRates ?? [],
    promotionRewards: overrides.promotionRewards ?? [],
    parentPriceGroupOptionCandidates: overrides.parentPriceGroupOptionCandidates,
    createdDateTime: overrides.createdDateTime,
    createdByAccountID: overrides.createdByAccountID,
    modifiedDateTime: overrides.modifiedDateTime,
    modifiedByAccountID: overrides.modifiedByAccountID,
  });
}

/**
 * Builds one real `PriceGroupRate`, fresh.
 *
 * `globalFlag` is passed explicitly rather than left to the column's own `default="false"`
 * [model/entity/PriceGroupRate.cfc:L53].
 *
 * `amount`, when supplied, is built from a DECIMAL STRING through the port's single arithmetic
 * surface.
 */
function aPriceGroupRate(spec: {
  readonly priceGroupRateID: string;
  readonly globalFlag: boolean;
  readonly amount?: string;
}): PriceGroupRate {
  return new PriceGroupRate({
    priceGroupRateID: spec.priceGroupRateID,
    globalFlag: spec.globalFlag,
    amount: spec.amount === undefined ? undefined : Money.fromDecimalString(spec.amount),
  });
}

/**
 * Builds one real `PromotionReward`, fresh.
 */
function aPromotionReward(promotionRewardID: string): PromotionReward {
  return new PromotionReward({ promotionRewardID });
}

/**
 * The runtime member names on the shipped class, sorted.
 */
function shippedMemberNames(): readonly string[] {
  const prototype: object = Object.getPrototypeOf(aPriceGroup()) as object;

  return Object.getOwnPropertyNames(prototype).sort();
}

describe('PriceGroup.getGlobalPriceGroupRate', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L82-L90]: getGlobalPriceGroupRate returns the FIRST
  // rate whose globalFlag is set (L86-L87 returns immediately) and falls off the end at L90 with
  // no return statement, yielding CFML null => undefined.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L82-L90]: this method sits in an UN-BANNERED region,
  // between the property declarations and the "START: Non-Persistent Property Methods" banner at
  // L92 - the third such placement wart in this folder.

  it('answers undefined when the rate collection is empty', () => {
    // [model/entity/PriceGroup.cfc:L85] ArrayLen(rates) is 0, so the loop body never runs and L90
    // falls off the end.
    const priceGroup = aPriceGroup({ priceGroupRates: [] });

    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();
  });

  it('answers undefined when rates are present but none is global', () => {
    // [model/entity/PriceGroup.cfc:L86] every getGlobalFlag() is false, so no branch returns.
    const priceGroup = aPriceGroup({
      priceGroupRates: [
        aPriceGroupRate({ priceGroupRateID: 'rate-sku', globalFlag: false }),
        aPriceGroupRate({ priceGroupRateID: 'rate-product', globalFlag: false }),
        aPriceGroupRate({ priceGroupRateID: 'rate-producttype', globalFlag: false }),
      ],
    });

    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();
  });

  it('never substitutes a default, a zero or a synthesized rate for an absent global rate', () => {
    // The absence convention belongs to a family of three in this folder whose directions are
    // OPPOSITE and must never be collapsed together: [model/entity/Product.cfc:L598] falls through
    // to `return 0` and must answer.
    const globalPriceGroupRate: PriceGroupRate | undefined = aPriceGroup({
      priceGroupRates: [aPriceGroupRate({ priceGroupRateID: 'rate-only', globalFlag: false })],
    }).getGlobalPriceGroupRate();

    expect(globalPriceGroupRate).toBeUndefined();
    expect(globalPriceGroupRate).not.toBeNull();
    expect(globalPriceGroupRate).not.toBeInstanceOf(PriceGroupRate);
  });

  it('answers the sole global rate when exactly one carries the flag', () => {
    // [model/entity/PriceGroup.cfc:L86-L87] the flagged rate is returned, and its position in the
    // collection is irrelevant when it is the only match.
    const globalRate = aPriceGroupRate({ priceGroupRateID: 'rate-global', globalFlag: true });
    const priceGroup = aPriceGroup({
      priceGroupRates: [
        aPriceGroupRate({ priceGroupRateID: 'rate-sku', globalFlag: false }),
        globalRate,
        aPriceGroupRate({ priceGroupRateID: 'rate-product', globalFlag: false }),
      ],
    });

    expect(priceGroup.getGlobalPriceGroupRate()).toBe(globalRate);
  });

  it('answers the FIRST global rate in collection order when two carry the flag', () => {
    const firstGlobalRate = aPriceGroupRate({
      priceGroupRateID: 'rate-global-1',
      globalFlag: true,
    });
    const secondGlobalRate = aPriceGroupRate({
      priceGroupRateID: 'rate-global-2',
      globalFlag: true,
    });
    const priceGroup = aPriceGroup({ priceGroupRates: [firstGlobalRate, secondGlobalRate] });

    expect(priceGroup.getGlobalPriceGroupRate()).toBe(firstGlobalRate);
    expect(priceGroup.getGlobalPriceGroupRate()).not.toBe(secondGlobalRate);
  });

  it('answers the FIRST global rate when three carry the flag, skipping both later matches', () => {
    // The same selection contract at a wider arity, so "first" cannot be mistaken for "the earlier
    // of two".
    const firstGlobalRate = aPriceGroupRate({
      priceGroupRateID: 'rate-global-1',
      globalFlag: true,
    });
    const priceGroup = aPriceGroup({
      priceGroupRates: [
        aPriceGroupRate({ priceGroupRateID: 'rate-membership', globalFlag: false }),
        firstGlobalRate,
        aPriceGroupRate({ priceGroupRateID: 'rate-global-2', globalFlag: true }),
        aPriceGroupRate({ priceGroupRateID: 'rate-global-3', globalFlag: true }),
      ],
    });

    expect(priceGroup.getGlobalPriceGroupRate()).toBe(firstGlobalRate);
  });

  it('reads the collection as-is, neither sorting nor filtering it first', () => {
    // [model/entity/PriceGroup.cfc:L84] `var rates = getPriceGroupRates();` - the accessor's
    // array, untouched.
    const earlyGlobalRate = aPriceGroupRate({ priceGroupRateID: 'rate-aaa', globalFlag: true });
    const lateGlobalRate = aPriceGroupRate({ priceGroupRateID: 'rate-zzz', globalFlag: true });

    expect(
      aPriceGroup({ priceGroupRates: [earlyGlobalRate, lateGlobalRate] }).getGlobalPriceGroupRate(),
    ).toBe(earlyGlobalRate);
    expect(
      aPriceGroup({ priceGroupRates: [lateGlobalRate, earlyGlobalRate] }).getGlobalPriceGroupRate(),
    ).toBe(lateGlobalRate);
  });

  it('is synchronous and returns a rate rather than a promise', () => {
    // Per the port's async boundary rule a method is async IFF its legacy body reaches the DAO or
    // ORM.
    const globalRate = aPriceGroupRate({ priceGroupRateID: 'rate-global', globalFlag: true });
    const result: unknown = aPriceGroup({
      priceGroupRates: [globalRate],
    }).getGlobalPriceGroupRate();

    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toBe(globalRate);
  });

  it('sees a rate attached afterwards through the bidirectional helper', () => {
    // The collection accessor hands back the LIVE array [model/entity/PriceGroup.cfc:L64], so a
    // rate attached after construction is visible to the scan without rebuilding the entity.
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const globalRate = aPriceGroupRate({ priceGroupRateID: 'rate-global', globalFlag: true });

    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();

    priceGroup.addPriceGroupRate(globalRate);

    expect(priceGroup.getGlobalPriceGroupRate()).toBe(globalRate);
  });

  it('answers the first of the fixture graph two flagged rates', () => {
    // The fixture graph isolates this tie deliberately: `globalRatePriceGroup` is the one member
    // built with two globalFlag rates, in a documented collection order.
    const { globalRatePriceGroup, globalRateFirstMatch, globalRateLastMatch } =
      makePriceGroupFixtures();

    expect(globalRatePriceGroup.getPriceGroupRates()).toHaveLength(2);
    expect(globalRateFirstMatch.getGlobalFlag()).toBe(true);
    expect(globalRateLastMatch.getGlobalFlag()).toBe(true);
    expect(globalRatePriceGroup.getGlobalPriceGroupRate()).toBe(globalRateFirstMatch);
  });

  it('answers undefined for the fixture cascade subject, whose four rates are all non-global', () => {
    // `childPriceGroup` is the primary cascade subject and carries membership rates only, so the
    // global level genuinely misses on it.
    const { childPriceGroup } = makePriceGroupFixtures();

    expect(childPriceGroup.getPriceGroupRates()).toHaveLength(4);
    expect(
      childPriceGroup.getPriceGroupRates().every((rate) => rate.getGlobalFlag() === false),
    ).toBe(true);
    expect(childPriceGroup.getGlobalPriceGroupRate()).toBeUndefined();
  });
});

describe('PriceGroup priceGroupIDPath - route A, the lazy memoized getter', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L196]: the path memo guards on
  // isNull(variables.priceGroupIDPath), not !structKeyExists(...).

  it('computes a single-element path for a root price group with no parent', () => {
    // [model/entity/PriceGroup.cfc:L197] buildIDPathList walks from self upward.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root', priceGroupIDPath: undefined });

    expect(rootPriceGroup.getPriceGroupIDPath()).toBe('root');
  });

  it('computes a two-element root-first path for a child of a root', () => {
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: rootPriceGroup,
    });

    expect(childPriceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('computes a three-element root-first path for a grandchild', () => {
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const middlePriceGroup = aPriceGroup({
      priceGroupID: 'middle',
      parentPriceGroup: rootPriceGroup,
    });
    const leafPriceGroup = aPriceGroup({
      priceGroupID: 'leaf',
      priceGroupIDPath: undefined,
      parentPriceGroup: middlePriceGroup,
    });

    expect(leafPriceGroup.getPriceGroupIDPath()).toBe('root,middle,leaf');
  });

  it('honours the whole path contract: comma-delimited, root first, self last, includes self', () => {
    // The four properties are asserted through the value object that owns them, so the entity and
    // `src/domain/valueObjects/materializedIdPath.ts` cannot drift apart.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const middlePriceGroup = aPriceGroup({
      priceGroupID: 'middle',
      parentPriceGroup: rootPriceGroup,
    });
    const leafPriceGroup = aPriceGroup({
      priceGroupID: 'leaf',
      priceGroupIDPath: undefined,
      parentPriceGroup: middlePriceGroup,
    });

    const idPath: string = leafPriceGroup.getPriceGroupIDPath();

    expect(idPath.split(',')).toStrictEqual(['root', 'middle', 'leaf']);
    expect(getRootIdFromIdPath(idPath)).toBe('root');
    expect(idPath.split(',').at(-1)).toBe('leaf');
    expect(idPathContainsId(idPath, 'leaf')).toBe(true);
    expect(idPath.startsWith(',')).toBe(false);
    expect(idPath.endsWith(',')).toBe(false);
  });

  it('produces exactly what the value object own walk produces for the same chain', () => {
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: rootPriceGroup,
    });

    expect(childPriceGroup.getPriceGroupIDPath()).toBe(
      buildIdPathList<PriceGroup>(
        childPriceGroup,
        (node) => node.getPriceGroupID(),
        (node) => node.getParentPriceGroup(),
      ),
    );
  });

  it('returns a stored path unchanged instead of recomputing it', () => {
    // [model/entity/PriceGroup.cfc:L196] the guard is false when the column is present, so L197
    // never runs and L199 returns the stored value.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: 'persisted,path,from,the,column',
      parentPriceGroup: rootPriceGroup,
    });

    expect(childPriceGroup.getPriceGroupIDPath()).toBe('persisted,path,from,the,column');
  });

  it('treats an explicitly stored EMPTY STRING as present and does NOT recompute it', () => {
    // The isnull-versus-structkeyexists distinguishing test. `isNull('')` is false in CFML, so the
    // empty column is present and L197 never runs.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: '',
      parentPriceGroup: rootPriceGroup,
    });

    expect(childPriceGroup.getPriceGroupIDPath()).toBe('');
    expect(childPriceGroup.getPriceGroupIDPath()).not.toBe('root,child');
    expect(childPriceGroup.getPriceGroupIDPath()).not.toBe('child');
  });

  it('agrees with the value object resolve rule on both the absent and the empty case', () => {
    // The decision itself lives in `resolveIdPath`, and this pins the entity to it: `undefined`
    // computes, `''` flows straight through.
    expect(resolveIdPath(undefined, () => 'computed')).toBe('computed');
    expect(resolveIdPath('', () => 'computed')).toBe('');

    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });

    expect(
      aPriceGroup({
        priceGroupID: 'child',
        priceGroupIDPath: undefined,
        parentPriceGroup: rootPriceGroup,
      }).getPriceGroupIDPath(),
    ).toBe('root,child');
    expect(
      aPriceGroup({
        priceGroupID: 'child',
        priceGroupIDPath: '',
        parentPriceGroup: rootPriceGroup,
      }).getPriceGroupIDPath(),
    ).toBe('');
  });

  it('memoizes the computed path, so a later parent change does not alter the answer', () => {
    // [model/entity/PriceGroup.cfc:L197] writes the computed value back into the field, so the
    // second read takes the present branch.
    const priceGroup = aPriceGroup({ priceGroupID: 'child', priceGroupIDPath: undefined });

    expect(priceGroup.getPriceGroupIDPath()).toBe('child');

    priceGroup.setParentPriceGroup(aPriceGroup({ priceGroupID: 'root' }));

    expect(priceGroup.getParentPriceGroup()?.getPriceGroupID()).toBe('root');
    expect(priceGroup.getPriceGroupIDPath()).toBe('child');
  });

  it('reads the live parent chain when the parent is wired BEFORE the first read', () => {
    // The mirror image of the case above, and together they prove the memo is written on first
    // read rather than at construction.
    const priceGroup = aPriceGroup({ priceGroupID: 'child', priceGroupIDPath: undefined });

    priceGroup.setParentPriceGroup(aPriceGroup({ priceGroupID: 'root' }));

    expect(priceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('keeps the memo INSTANCE-scoped: a second price group never observes the first answer', () => {
    const firstPriceGroup = aPriceGroup({ priceGroupID: 'shared-id', priceGroupIDPath: undefined });

    expect(firstPriceGroup.getPriceGroupIDPath()).toBe('shared-id');

    const secondPriceGroup = aPriceGroup({
      priceGroupID: 'shared-id',
      priceGroupIDPath: undefined,
      parentPriceGroup: aPriceGroup({ priceGroupID: 'root' }),
    });

    expect(secondPriceGroup.getPriceGroupIDPath()).toBe('root,shared-id');
    expect(firstPriceGroup.getPriceGroupIDPath()).toBe('shared-id');
  });

  it('rebuilds the fixture unpathed group path from its live parent chain', () => {
    // The fixture graph supplies one member with the column absent, wired beneath the root, so the
    // rebuilt value has more than one element and root-first ordering is observable rather than
    // degenerate.
    const firstGraph = makePriceGroupFixtures();
    const secondGraph = makePriceGroupFixtures();

    const rebuiltIdPath: string = firstGraph.unpathedPriceGroup.getPriceGroupIDPath();

    expect(rebuiltIdPath.split(',')).toHaveLength(2);
    expect(getRootIdFromIdPath(rebuiltIdPath)).toBe(firstGraph.rootPriceGroup.getPriceGroupID());
    expect(rebuiltIdPath.split(',').at(-1)).toBe(firstGraph.unpathedPriceGroup.getPriceGroupID());
    expect(secondGraph.unpathedPriceGroup.getPriceGroupIDPath()).toBe(rebuiltIdPath);
    expect(secondGraph.unpathedPriceGroup).not.toBe(firstGraph.unpathedPriceGroup);
  });

  it('returns the fixture stored paths unchanged for the three chained groups', () => {
    // These three carry a persisted column, so route A returns each unchanged - and the fixture
    // built those columns with the domain own walk, which is why they are root-first and
    // self-last.
    const { rootPriceGroup, parentPriceGroup, childPriceGroup, priceGroupIDPaths } =
      makePriceGroupFixtures();

    expect(rootPriceGroup.getPriceGroupIDPath()).toBe(priceGroupIDPaths.root);
    expect(parentPriceGroup.getPriceGroupIDPath()).toBe(priceGroupIDPaths.parent);
    expect(childPriceGroup.getPriceGroupIDPath()).toBe(priceGroupIDPaths.child);
    expect(priceGroupIDPaths.child.split(',')).toHaveLength(3);
    expect(getRootIdFromIdPath(priceGroupIDPaths.child)).toBe(rootPriceGroup.getPriceGroupID());
  });

  it('is synchronous and returns a string, never a promise', () => {
    const result: unknown = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
    }).getPriceGroupIDPath();

    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe('string');
  });

  it('stays far inside the 4000-character column budget for a shallow hierarchy', () => {
    // [model/entity/PriceGroup.cfc:L53] declares length="4000".
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: rootPriceGroup,
    });

    expect(childPriceGroup.getPriceGroupIDPath().length).toBeLessThanOrEqual(4000);
  });
});

describe('PriceGroup priceGroupIDPath - route B, repository-invoked maintenance', () => {
  // The legacy ORM hooks at [model/entity/PriceGroup.cfc:L206-L214] become explicit maintenance
  // methods the repository calls on save.

  it('exposes both lifecycle methods under their verbatim legacy names', () => {
    expect(shippedMemberNames()).toContain('preInsert');
    expect(shippedMemberNames()).toContain('preUpdate');
  });

  it('recomputes and stores the path on preInsert', () => {
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: rootPriceGroup,
    });

    childPriceGroup.preInsert();

    expect(childPriceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('recomputes and stores the path on preUpdate', () => {
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const childPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: rootPriceGroup,
    });

    childPriceGroup.preUpdate();

    expect(childPriceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('accepts the optional oldData bag on preUpdate and ignores it, exactly as the source does', () => {
    // [model/entity/PriceGroup.cfc:L211-L213] declares `struct oldData` with no `required` and
    // never READS it - it forwards the whole argument collection to the non-ported base.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const withoutOldData = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: 'stale',
      parentPriceGroup: rootPriceGroup,
    });
    const withOldData = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: 'stale',
      parentPriceGroup: rootPriceGroup,
    });

    withoutOldData.preUpdate();
    withOldData.preUpdate({ priceGroupIDPath: 'stale', priceGroupName: 'previous name' });

    expect(withoutOldData.getPriceGroupIDPath()).toBe('root,child');
    expect(withOldData.getPriceGroupIDPath()).toBe('root,child');
  });

  it('produces a single-element path on a root price group', () => {
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root', priceGroupIDPath: undefined });

    rootPriceGroup.preInsert();

    expect(rootPriceGroup.getPriceGroupIDPath()).toBe('root');
  });

  it('carries the path half ONLY - it neither stamps the audit timestamps nor gates on validity', () => {
    // The legacy `super.preInsert()` at [org/Hibachi/HibachiEntity.cfc:L598-L619] did two further
    // things: it THREW when `!isPersistable()`, and it stamped createdDateTime and
    // modifiedDateTime from `now()`.
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      priceGroupName: undefined,
      priceGroupCode: undefined,
      createdDateTime: undefined,
      modifiedDateTime: undefined,
    });

    expect(() => {
      priceGroup.preInsert();
    }).not.toThrow();
    expect(priceGroup.getCreatedDateTime()).toBeUndefined();
    expect(priceGroup.getModifiedDateTime()).toBeUndefined();
    expect(priceGroup.getPriceGroupIDPath()).toBe('child');
  });

  it('leaves an existing audit timestamp untouched, confirming the stamp half is absent', () => {
    const createdDateTime = new Date('2024-06-01T00:00:00.000Z');
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      createdDateTime,
      modifiedDateTime: undefined,
    });

    priceGroup.preInsert();
    priceGroup.preUpdate();

    expect(priceGroup.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(priceGroup.getModifiedDateTime()).toBeUndefined();
  });

  it('is not fired by the constructor, so a hydrated stored path survives construction', () => {
    // Calling either method during construction would recompute the path from a parent chain the
    // repository may not have finished wiring, and would overwrite the very column the constructor
    // was just handed.
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: 'hydrated,from,the,column',
      parentPriceGroup: aPriceGroup({ priceGroupID: 'root' }),
    });

    expect(priceGroup.getPriceGroupIDPath()).toBe('hydrated,from,the,column');
  });

  it('is not fired by any accessor, so reading the graph never rewrites the path', () => {
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: 'hydrated,path',
      parentPriceGroup: aPriceGroup({ priceGroupID: 'root' }),
      priceGroupRates: [aPriceGroupRate({ priceGroupRateID: 'rate', globalFlag: true })],
    });

    priceGroup.getParentPriceGroup();
    priceGroup.getChildPriceGroups();
    priceGroup.getPriceGroupRates();
    priceGroup.getGlobalPriceGroupRate();
    priceGroup.isNew();

    expect(priceGroup.getPriceGroupIDPath()).toBe('hydrated,path');
  });

  it('is synchronous: both methods return undefined rather than a promise', () => {
    // [model/entity/PriceGroup.cfc:L206, L211] both declare `public void function`.
    const priceGroup = aPriceGroup({ priceGroupID: 'child', priceGroupIDPath: undefined });
    const insertResult: unknown = priceGroup.preInsert();
    const updateResult: unknown = priceGroup.preUpdate();

    expect(insertResult).toBeUndefined();
    expect(updateResult).toBeUndefined();
    expect(insertResult).not.toBeInstanceOf(Promise);
    expect(updateResult).not.toBeInstanceOf(Promise);
  });

  it('ships NO public path setter, so the column cannot be written arbitrarily', () => {
    // The generated `setPriceGroupIDPath(...)` has exactly two call sites in the whole repository,
    // [model/entity/PriceGroup.cfc:L207] and:L212, both inside this component's own hooks.
    expect(shippedMemberNames()).not.toContain('setPriceGroupIDPath');
  });
});

describe('PriceGroup priceGroupIDPath - D26, the memo versus the persisted value', () => {
  // LEGACY-DEFECT [model/entity/PriceGroup.cfc:L206-L214]: preInsert and preUpdate both call
  // setPriceGroupIDPath(buildIDPathList("parentPriceGroup")) before super.*.
  // Preserved deliberately; do not fix without a product decision.
  //
  // [model/entity/PriceGroup.cfc:L212] also ends in a harmless double semicolon, `;;`, the same
  // wart as [model/entity/ProductType.cfc:L311].

  it('serves a stored path that contradicts the live chain, until maintenance overwrites it', () => {
    // Route A returns the stored column forever, because the isNull guard is false.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: 'stale,path',
      parentPriceGroup: rootPriceGroup,
    });

    expect(priceGroup.getPriceGroupIDPath()).toBe('stale,path');
    expect(priceGroup.getPriceGroupIDPath()).toBe('stale,path');

    priceGroup.preInsert();

    expect(priceGroup.getPriceGroupIDPath()).toBe('root,child');
    expect(priceGroup.getPriceGroupIDPath()).not.toBe('stale,path');
  });

  it('goes stale the other way: a memo taken before the parent was wired outlives the wiring', () => {
    // The complementary direction, and the one that actually bites.
    const priceGroup = aPriceGroup({ priceGroupID: 'child', priceGroupIDPath: undefined });

    expect(priceGroup.getPriceGroupIDPath()).toBe('child');

    priceGroup.setParentPriceGroup(aPriceGroup({ priceGroupID: 'root' }));

    expect(priceGroup.getPriceGroupIDPath()).toBe('child');

    priceGroup.preUpdate();

    expect(priceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('overwrites even an explicitly stored empty string, which route A preserves', () => {
    // The two routes disagree most sharply here.
    const rootPriceGroup = aPriceGroup({ priceGroupID: 'root' });
    const routeAPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: '',
      parentPriceGroup: rootPriceGroup,
    });
    const routeBPriceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: '',
      parentPriceGroup: rootPriceGroup,
    });

    routeBPriceGroup.preInsert();

    expect(routeAPriceGroup.getPriceGroupIDPath()).toBe('');
    expect(routeBPriceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('recomputes unconditionally on every maintenance call, never guarding on the stored value', () => {
    // Repeated calls are idempotent in RESULT but unconditional in MECHANISM, which is what makes
    // route B able to correct a stale memo at all.
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: aPriceGroup({ priceGroupID: 'first-root' }),
    });

    priceGroup.preInsert();

    expect(priceGroup.getPriceGroupIDPath()).toBe('first-root,child');

    priceGroup.removeParentPriceGroup();
    priceGroup.setParentPriceGroup(aPriceGroup({ priceGroupID: 'second-root' }));
    priceGroup.preUpdate();

    expect(priceGroup.getPriceGroupIDPath()).toBe('second-root,child');
  });
});

describe('PriceGroup.setParentPriceGroup', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: the body assigns the field at L111 and
  // then appends this group to `arguments.parentPriceGroup.getChildPriceGroups()` at L113 under
  // the L112 guard.

  // Verified reproduced first-hand in the shipped module before this marker was spent: the ported
  // body is `if (this.isNew() || !parentPriceGroup.hasChildPriceGroup(this))`.

  it('assigns the parent reference', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(priceGroup.getParentPriceGroup()).toBe(parentPriceGroup);
  });

  it('appends this group to the parent live child collection', () => {
    // [model/entity/PriceGroup.cfc:L113] arrayAppend onto the array the parent's own accessor
    // hands back, so the append must be observable through that accessor and not through a copy.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([priceGroup]);
  });

  it('appends only ONCE for a SAVED group, because the containment check is reached', () => {
    // The saved branch: `isNew()` is false, so `!hasChildPriceGroup(this)` is evaluated and blocks
    // the second append.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([priceGroup]);
    expect(parentPriceGroup.getChildPriceGroups()).toHaveLength(1);
  });

  it('appends TWICE for an UNSAVED group, because isNew() short-circuits the check away', () => {
    // D25 made observable. `priceGroupID: ''` is the `unsavedvalue="" default=""` pair at
    // [model/entity/PriceGroup.cfc:L52], so `isNew()` is true and the left disjunct wins outright.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: '' });

    expect(priceGroup.isNew()).toBe(true);

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([priceGroup, priceGroup]);
    expect(parentPriceGroup.getChildPriceGroups()).toHaveLength(2);
  });

  it('keeps appending on every further call while the group stays unsaved', () => {
    // Nothing about the guard is once-only: the duplicate is not a first-call artifact, it is the
    // steady state for as long as the primary key is empty.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: '' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toHaveLength(3);
  });

  it('consults the containment check BY PRIMARY KEY, not by reference identity', () => {
    // Two instances hydrated from the same row by two repository calls are the same price group as
    // far as the guard is concerned, so the second one is not appended.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const firstHydration = aPriceGroup({ priceGroupID: 'child' });
    const secondHydration = aPriceGroup({ priceGroupID: 'child' });

    firstHydration.setParentPriceGroup(parentPriceGroup);
    secondHydration.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([firstHydration]);
    expect(secondHydration.getParentPriceGroup()).toBe(parentPriceGroup);
  });

  it('re-parents by assigning the NEW parent and appending there, without unwinding the old one', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: there is no `removeParentPriceGroup`
    // call anywhere in this body, so a re-parented group is left in its former parent's
    // collection.
    const formerParent = aPriceGroup({ priceGroupID: 'former-parent' });
    const newParent = aPriceGroup({ priceGroupID: 'new-parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(formerParent);
    priceGroup.setParentPriceGroup(newParent);

    expect(priceGroup.getParentPriceGroup()).toBe(newParent);
    expect(newParent.getChildPriceGroups()).toEqual([priceGroup]);
    expect(formerParent.getChildPriceGroups()).toEqual([priceGroup]);
  });

  it('appends to the end, preserving the order of children already present', () => {
    const existingChild = aPriceGroup({ priceGroupID: 'existing-child' });
    const parentPriceGroup = aPriceGroup({
      priceGroupID: 'parent',
      childPriceGroups: [existingChild],
    });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([existingChild, priceGroup]);
  });

  it('is synchronous and returns undefined, matching the legacy void declaration', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });
    const result: void = priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(result).toBeUndefined();
    expect(priceGroup.setParentPriceGroup(parentPriceGroup)).not.toBeInstanceOf(Promise);
  });
});

describe('PriceGroup.removeParentPriceGroup', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L116-L125]: this is a CLEAN control. L120 finds the
  // index in `arguments.parentPriceGroup.getChildPriceGroups()` and L122 deletes from that same
  // collection - one identifier, used twice, correctly.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L107-L183]: the mandatory remove-that-ADDs inversion
  // cross-check was run across every remove* helper this entity SHIPS - removeParentPriceGroup
  // (L116-L125), removeChildPriceGroup (L139-L141).

  it('removes this group from the named parent live child collection', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([]);
  });

  it('clears this group own parent field', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(priceGroup.getParentPriceGroup()).toBeUndefined();
  });

  it('finds and deletes in the SAME collection - the clean control, observed on both sides', () => {
    // The leak this control rules out would show up as a child removed from some other collection
    // while the named parent kept it.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const unrelatedPriceGroup = aPriceGroup({ priceGroupID: 'unrelated' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });
    const decoyChild = aPriceGroup({ priceGroupID: 'decoy-child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    decoyChild.setParentPriceGroup(unrelatedPriceGroup);

    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([]);
    expect(unrelatedPriceGroup.getChildPriceGroups()).toEqual([decoyChild]);
  });

  it('defaults the argument from the stored parent when it is omitted', () => {
    // [model/entity/PriceGroup.cfc:L117-L119] the
    // `!structKeyExists(arguments, "parentPriceGroup")` fallback, expressed as an explicit
    // `!== undefined` test on an optional parameter.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.removeParentPriceGroup();

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([]);
    expect(priceGroup.getParentPriceGroup()).toBeUndefined();
  });

  it('clears the parent field UNCONDITIONALLY, even when the far-side index was not found', () => {
    // [model/entity/PriceGroup.cfc:L124] structDelete sits OUTSIDE the `if(index > 0)` guard that
    // ends at L123.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const strangerChild = aPriceGroup({ priceGroupID: 'stranger-child' });
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      parentPriceGroup,
      childPriceGroups: [],
    });

    strangerChild.setParentPriceGroup(parentPriceGroup);

    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(priceGroup.getParentPriceGroup()).toBeUndefined();
    expect(parentPriceGroup.getChildPriceGroups()).toEqual([strangerChild]);
  });

  it('removes at most one entry, leaving a D25 duplicate of the same group behind', () => {
    // The two defects meet here: setParentPriceGroup can append the same unsaved group twice, and
    // a single remove call deletes only the first index it finds.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: '' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);

    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([priceGroup]);
  });

  it('removes ITSELF from the parent, not whichever unsaved sibling happens to be first', () => {
    // Distinct from the D25 case above, which pushes the same instance twice - there the two
    // comparisons agree, so it cannot tell them apart.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const firstUnsaved = aPriceGroup({ priceGroupID: '' });
    const secondUnsaved = aPriceGroup({ priceGroupID: '' });

    firstUnsaved.setParentPriceGroup(parentPriceGroup);
    secondUnsaved.setParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toHaveLength(2);

    secondUnsaved.removeParentPriceGroup(parentPriceGroup);

    const remaining = parentPriceGroup.getChildPriceGroups();

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(firstUnsaved);

    // And the caller's own field is cleared while the sibling's is untouched.
    expect(secondUnsaved.getParentPriceGroup()).toBeUndefined();
    expect(firstUnsaved.getParentPriceGroup()).toBe(parentPriceGroup);
  });

  it('still finds a SAVED child by primary key, across two instances of one row', () => {
    // The fallback is scoped to empty keys and nothing else.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const heldInstance = aPriceGroup({ priceGroupID: 'shared-key' });
    const equalKeyOtherInstance = aPriceGroup({ priceGroupID: 'shared-key' });

    heldInstance.setParentPriceGroup(parentPriceGroup);

    expect(equalKeyOtherInstance).not.toBe(heldInstance);

    equalKeyOtherInstance.removeParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([]);
  });

  it('preserves the order of the siblings it leaves in place', () => {
    const firstSibling = aPriceGroup({ priceGroupID: 'first-sibling' });
    const lastSibling = aPriceGroup({ priceGroupID: 'last-sibling' });
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    firstSibling.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);
    lastSibling.setParentPriceGroup(parentPriceGroup);

    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([firstSibling, lastSibling]);
  });

  it('throws when the argument is omitted AND there is no stored parent', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L116-L122]: with no argument and no stored parent,
    // L118 assigns CFML null and L120 then calls `.getChildPriceGroups()` on it - a method call on
    // null, which throws under every engine.
    const priceGroup = aPriceGroup({ priceGroupID: 'orphan', parentPriceGroup: undefined });

    expect(() => priceGroup.removeParentPriceGroup()).toThrow(
      /model\/entity\/PriceGroup\.cfc:L118-L120/,
    );
  });

  it('does not throw when the argument is omitted on a group that HAS a stored parent', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child', parentPriceGroup });

    expect(() => priceGroup.removeParentPriceGroup()).not.toThrow();
  });

  it('is synchronous and returns undefined, matching the legacy void declaration', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child', parentPriceGroup });
    const result: void = priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(result).toBeUndefined();
  });
});

describe('PriceGroup child-collection delegations', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L136-L141]: both bodies are one statement long and
  // neither touches a near-side array. AddChildPriceGroup is
  // `childPriceGroup.setParentPriceGroup( this )` at L137.

  it('addChildPriceGroup sets the CHILD parent field, which a near-side push could not do', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });

    parentPriceGroup.addChildPriceGroup(childPriceGroup);

    expect(childPriceGroup.getParentPriceGroup()).toBe(parentPriceGroup);
    expect(parentPriceGroup.getChildPriceGroups()).toEqual([childPriceGroup]);
  });

  it('addChildPriceGroup inherits the D25 duplicate append for an unsaved child', () => {
    // The decisive delegation proof.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: '' });

    parentPriceGroup.addChildPriceGroup(childPriceGroup);
    parentPriceGroup.addChildPriceGroup(childPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toHaveLength(2);
  });

  it('addChildPriceGroup appends only once for a SAVED child', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });

    parentPriceGroup.addChildPriceGroup(childPriceGroup);
    parentPriceGroup.addChildPriceGroup(childPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([childPriceGroup]);
  });

  it('removeChildPriceGroup clears the CHILD parent field, not merely the near-side entry', () => {
    // The second decisive delegation proof. A near-side splice would leave the child still
    // pointing at this parent; the far side's unconditional [model/entity/PriceGroup.cfc:L124]
    // clear does not.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });

    parentPriceGroup.addChildPriceGroup(childPriceGroup);
    parentPriceGroup.removeChildPriceGroup(childPriceGroup);

    expect(childPriceGroup.getParentPriceGroup()).toBeUndefined();
    expect(parentPriceGroup.getChildPriceGroups()).toEqual([]);
  });

  it('removeChildPriceGroup passes `this` explicitly, so it never reaches the unguarded-null case', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L140]: `this` is passed even though the far side
    // would fall back to its own stored parent.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const strangerChild = aPriceGroup({ priceGroupID: 'stranger', parentPriceGroup: undefined });

    expect(() => parentPriceGroup.removeChildPriceGroup(strangerChild)).not.toThrow();
    expect(strangerChild.getParentPriceGroup()).toBeUndefined();
  });

  it('round-trips: add then remove returns both sides to their starting state', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });

    parentPriceGroup.addChildPriceGroup(childPriceGroup);
    parentPriceGroup.removeChildPriceGroup(childPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([]);
    expect(childPriceGroup.getParentPriceGroup()).toBeUndefined();
  });

  it('round-trips through the CHILD own helpers to the identical state', () => {
    // `parent.addChildPriceGroup(child)` and `child.setParentPriceGroup(parent)` are the same
    // operation reached from two directions, which is exactly what pure delegation means.
    const viaParent = aPriceGroup({ priceGroupID: 'parent' });
    const viaChild = aPriceGroup({ priceGroupID: 'parent' });
    const childOne = aPriceGroup({ priceGroupID: 'child' });
    const childTwo = aPriceGroup({ priceGroupID: 'child' });

    viaParent.addChildPriceGroup(childOne);
    childTwo.setParentPriceGroup(viaChild);

    expect(viaParent.getChildPriceGroups()).toEqual([childOne]);
    expect(viaChild.getChildPriceGroups()).toEqual([childTwo]);
    expect(childOne.getParentPriceGroup()).toBe(viaParent);
    expect(childTwo.getParentPriceGroup()).toBe(viaChild);
  });

  it('both child helpers are synchronous and return undefined', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });
    const addResult: void = parentPriceGroup.addChildPriceGroup(childPriceGroup);
    const removeResult: void = parentPriceGroup.removeChildPriceGroup(childPriceGroup);

    expect(addResult).toBeUndefined();
    expect(removeResult).toBeUndefined();
  });

  it('exposes the collection under the ORM-canonical camelCase binding', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L63]: the property declares
    // `singularname="ChildPriceGroup"` with a CAPITAL C, while the hand-written helpers at
    // L136/L139 and the implicit predicate at L112 all spell the capital-C form too.
    const priceGroup = aPriceGroup();
    const members = shippedMemberNames();

    expect(members).toContain('addChildPriceGroup');
    expect(members).toContain('removeChildPriceGroup');
    expect(members).toContain('hasChildPriceGroup');
    expect(members).toContain('getChildPriceGroups');
    expect('addChildPriceGroup' in priceGroup).toBe(true);
  });
});

describe('PriceGroup rate-collection delegations', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L144-L149]: `priceGroupRate.setPriceGroup( this )` at
  // L145 and `priceGroupRate.removePriceGroup( this )` at L148.

  it('addPriceGroupRate sets the RATE back-reference, which a near-side push could not do', () => {
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });

    priceGroup.addPriceGroupRate(priceGroupRate);

    expect(priceGroupRate.getPriceGroup()).toBe(priceGroup);
    expect(priceGroup.getPriceGroupRates()).toEqual([priceGroupRate]);
  });

  it('addPriceGroupRate appends only once for a SAVED rate', () => {
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });

    priceGroup.addPriceGroupRate(priceGroupRate);
    priceGroup.addPriceGroupRate(priceGroupRate);

    expect(priceGroup.getPriceGroupRates()).toEqual([priceGroupRate]);
  });

  it('addPriceGroupRate inherits the far side D25 duplicate append for an unsaved rate', () => {
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L183]: the far side's guard reads
    // `isNew() or !priceGroup.hasPriceGroupRate(this)` so an unsaved rate is appended again on
    // every call.
    // Preserved deliberately; do not fix without a product decision.
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: '', globalFlag: false });

    priceGroup.addPriceGroupRate(priceGroupRate);
    priceGroup.addPriceGroupRate(priceGroupRate);

    expect(priceGroup.getPriceGroupRates()).toHaveLength(2);
  });

  it('removePriceGroupRate clears the RATE back-reference, not merely the near-side entry', () => {
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });

    priceGroup.addPriceGroupRate(priceGroupRate);
    priceGroup.removePriceGroupRate(priceGroupRate);

    expect(priceGroupRate.getPriceGroup()).toBeUndefined();
    expect(priceGroup.getPriceGroupRates()).toEqual([]);
  });

  it('removePriceGroupRate leaves the other rates in place, in order', () => {
    const firstRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });
    const middleRate = aPriceGroupRate({ priceGroupRateID: 'rate-2', globalFlag: false });
    const lastRate = aPriceGroupRate({ priceGroupRateID: 'rate-3', globalFlag: false });
    const priceGroup = aPriceGroup({ priceGroupRates: [firstRate, middleRate, lastRate] });

    priceGroup.removePriceGroupRate(middleRate);

    expect(priceGroup.getPriceGroupRates()).toEqual([firstRate, lastRate]);
  });

  it('a removed global rate stops being the answer to getGlobalPriceGroupRate', () => {
    // The two blocks meet: `getGlobalPriceGroupRate` reads the same live array the delegation
    // mutates, so detaching the flagged rate is immediately visible through the accessor.
    const globalRate = aPriceGroupRate({ priceGroupRateID: 'global-rate', globalFlag: true });
    const plainRate = aPriceGroupRate({ priceGroupRateID: 'plain-rate', globalFlag: false });
    const priceGroup = aPriceGroup({ priceGroupRates: [globalRate, plainRate] });

    expect(priceGroup.getGlobalPriceGroupRate()).toBe(globalRate);

    priceGroup.removePriceGroupRate(globalRate);

    expect(priceGroup.getGlobalPriceGroupRate()).toBeUndefined();
  });

  it('round-trips: add then remove returns both sides to their starting state', () => {
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });

    priceGroup.addPriceGroupRate(priceGroupRate);
    priceGroup.removePriceGroupRate(priceGroupRate);

    expect(priceGroup.getPriceGroupRates()).toEqual([]);
    expect(priceGroupRate.getPriceGroup()).toBeUndefined();
  });

  it('carries a Money amount through the delegation untouched, with no float anywhere', () => {
    // P4: any monetary value this suite touches is built from a DECIMAL STRING through the port's
    // single arithmetic surface, and it is read back as a decimal string.
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({
      priceGroupRateID: 'rate-1',
      globalFlag: true,
      amount: '19.99',
    });

    priceGroup.addPriceGroupRate(priceGroupRate);

    const attachedRate = priceGroup.getGlobalPriceGroupRate();

    expect(attachedRate).toBe(priceGroupRate);
    expect(attachedRate?.getAmount()?.toDecimalString()).toBe('19.99');
  });

  it('both rate helpers are synchronous and return undefined', () => {
    const priceGroup = aPriceGroup({ priceGroupRates: [] });
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });
    const addResult: void = priceGroup.addPriceGroupRate(priceGroupRate);
    const removeResult: void = priceGroup.removePriceGroupRate(priceGroupRate);

    expect(addResult).toBeUndefined();
    expect(removeResult).toBeUndefined();
  });
});

describe('PriceGroup promotion-reward delegations', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L176-L181]: the delegation targets are
  // `addEligiblePriceGroup` and `removeEligiblePriceGroup`, not
  // `addPriceGroup`/`removePriceGroup`.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L70] and [model/entity/PromotionReward.cfc:L74]: both
  // ends declare the same abbreviated link table, `SwPromoRewardEligiblePriceGrp`.

  it('addPromotionReward populates the REWARD collection, which a near-side push could not do', () => {
    const priceGroup = aPriceGroup({ promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);

    expect(promotionReward.getEligiblePriceGroups()).toEqual([priceGroup]);
  });

  it('addPromotionReward populates this group own collection as well, through the far side', () => {
    // [model/entity/PromotionReward.cfc:L158-L165] maintains both ends: it appends to its own
    // `eligiblePriceGroups` and then appends itself to `eligiblePriceGroup.getPromotionRewards()`.
    const priceGroup = aPriceGroup({ promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);

    expect(priceGroup.getPromotionRewards()).toEqual([promotionReward]);
    expect(priceGroup.hasPromotionReward(promotionReward)).toBe(true);
  });

  it('addPromotionReward appends only once on each side for a SAVED pair', () => {
    const priceGroup = aPriceGroup({ priceGroupID: 'saved-group', promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);
    priceGroup.addPromotionReward(promotionReward);

    expect(promotionReward.getEligiblePriceGroups()).toEqual([priceGroup]);
    expect(priceGroup.getPromotionRewards()).toEqual([promotionReward]);
  });

  it('an unsaved GROUP duplicates on the reward side only, because the two guards test different ends', () => {
    // LEGACY-DEFECT [model/entity/PromotionReward.cfc:L159, L162]: the owning side carries two
    // independent D25 guards - L159 tests `eligiblePriceGroup.isNew()` before appending to its own
    // collection, L162 tests `this.isNew()` before appending to the price group's.
    // Preserved deliberately; do not fix without a product decision.
    const priceGroup = aPriceGroup({ priceGroupID: '', promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);
    priceGroup.addPromotionReward(promotionReward);

    expect(promotionReward.getEligiblePriceGroups()).toHaveLength(2);
    expect(priceGroup.getPromotionRewards()).toHaveLength(1);
  });

  it('an unsaved REWARD duplicates on this group side only, the exact mirror of the case above', () => {
    const priceGroup = aPriceGroup({ priceGroupID: 'saved-group', promotionRewards: [] });
    const promotionReward = aPromotionReward('');

    expect(promotionReward.isNew()).toBe(true);

    priceGroup.addPromotionReward(promotionReward);
    priceGroup.addPromotionReward(promotionReward);

    expect(priceGroup.getPromotionRewards()).toHaveLength(2);
    expect(promotionReward.getEligiblePriceGroups()).toHaveLength(1);
  });

  it('removePromotionReward unwinds BOTH sides', () => {
    // [model/entity/PromotionReward.cfc:L166-L175] splices its own collection at L167-L170 and the
    // price group's at L171-L174.
    const priceGroup = aPriceGroup({ promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);
    priceGroup.removePromotionReward(promotionReward);

    expect(promotionReward.getEligiblePriceGroups()).toEqual([]);
    expect(priceGroup.getPromotionRewards()).toEqual([]);
    expect(priceGroup.hasPromotionReward(promotionReward)).toBe(false);
  });

  it('removePromotionReward matches by REFERENCE on the owning side, per the ported body', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L167, L172]: the owning side's removal uses
    // arrayFind on the object, which the port expresses as `indexOf` - reference identity, not
    // primary key.
    const priceGroup = aPriceGroup({ priceGroupID: 'group-1', promotionRewards: [] });
    const otherHydration = aPriceGroup({ priceGroupID: 'group-1', promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);
    otherHydration.removePromotionReward(promotionReward);

    expect(promotionReward.getEligiblePriceGroups()).toEqual([priceGroup]);
  });

  it('leaves the other eligible groups and the other rewards in place, in order', () => {
    const firstReward = aPromotionReward('reward-1');
    const middleReward = aPromotionReward('reward-2');
    const lastReward = aPromotionReward('reward-3');
    const priceGroup = aPriceGroup({ priceGroupID: 'group-1', promotionRewards: [] });

    priceGroup.addPromotionReward(firstReward);
    priceGroup.addPromotionReward(middleReward);
    priceGroup.addPromotionReward(lastReward);

    priceGroup.removePromotionReward(middleReward);

    expect(priceGroup.getPromotionRewards()).toEqual([firstReward, lastReward]);
  });

  it('round-trips: add then remove returns both sides to their starting state', () => {
    const priceGroup = aPriceGroup({ promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);
    priceGroup.removePromotionReward(promotionReward);

    expect(priceGroup.getPromotionRewards()).toEqual([]);
    expect(promotionReward.getEligiblePriceGroups()).toEqual([]);
  });

  it('both reward helpers are synchronous and return undefined', () => {
    const priceGroup = aPriceGroup({ promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');
    const addResult: void = priceGroup.addPromotionReward(promotionReward);
    const removeResult: void = priceGroup.removePromotionReward(promotionReward);

    expect(addResult).toBeUndefined();
    expect(removeResult).toBeUndefined();
  });
});

describe('PriceGroup collection accessors', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L113, L121-L123]: the hand-written helpers mutate the
  // arrays that `get*` hands back, so the accessors cannot return defensive copies without
  // breaking the association.

  it('getChildPriceGroups returns the very array handed to the constructor', () => {
    const childPriceGroups: PriceGroup[] = [];
    const priceGroup = aPriceGroup({ childPriceGroups });

    expect(priceGroup.getChildPriceGroups()).toBe(childPriceGroups);
  });

  it('getPriceGroupRates returns the very array handed to the constructor', () => {
    const priceGroupRates = [aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false })];
    const priceGroup = aPriceGroup({ priceGroupRates });

    expect(priceGroup.getPriceGroupRates()).toBe(priceGroupRates);
  });

  it('getPromotionRewards returns the very array handed to the constructor', () => {
    const promotionRewards = [aPromotionReward('reward-1')];
    const priceGroup = aPriceGroup({ promotionRewards });

    expect(priceGroup.getPromotionRewards()).toBe(promotionRewards);
  });

  it('returns the same array instance on repeated reads, never a fresh copy', () => {
    const priceGroup = aPriceGroup();

    expect(priceGroup.getChildPriceGroups()).toBe(priceGroup.getChildPriceGroups());
    expect(priceGroup.getPriceGroupRates()).toBe(priceGroup.getPriceGroupRates());
    expect(priceGroup.getPromotionRewards()).toBe(priceGroup.getPromotionRewards());
  });

  it('surfaces an external mutation of the underlying array immediately', () => {
    // This is what "live" buys, and what the bidirectional helpers depend on: the far side pushes
    // onto the array it was handed by the accessor, and the near side sees it without being told.
    const priceGroupRates: PriceGroupRate[] = [];
    const priceGroup = aPriceGroup({ priceGroupRates });
    const lateGlobalRate = aPriceGroupRate({ priceGroupRateID: 'late-global', globalFlag: true });

    priceGroupRates.push(lateGlobalRate);

    expect(priceGroup.getPriceGroupRates()).toEqual([lateGlobalRate]);
    expect(priceGroup.getGlobalPriceGroupRate()).toBe(lateGlobalRate);
  });

  it('gives two independently built price groups two independent collections', () => {
    const firstPriceGroup = aPriceGroup({ priceGroupID: 'first' });
    const secondPriceGroup = aPriceGroup({ priceGroupID: 'second' });

    firstPriceGroup.getChildPriceGroups().push(aPriceGroup({ priceGroupID: 'first-child' }));

    expect(firstPriceGroup.getChildPriceGroups()).toHaveLength(1);
    expect(secondPriceGroup.getChildPriceGroups()).toEqual([]);
  });
});

describe('PriceGroup associations dropped because the far side is out of scope', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L62, L67, L68, L69]: four of the seven collections
  // point at entities this migration slice does not port - `appliedOrderItems` at L62 targets
  // OrderItem, `accounts` at L67 targets Account.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L67, L68, L69] and
  // [model/dao/PriceGroupDAO.cfc:L52-L100]: the link tables SwAccountPriceGroup,
  // SwSubsBenefitPriceGroup and SwSubsUsageBenefitPriceGroup are preserved verbatim in the record
  // of what was dropped, abbreviations intact.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L168-L173]: addSubscriptionUsageBenefit /
  // removeSubscriptionUsageBenefit take an argument misspelled `subsciptionUsageBenefit`, missing
  // the first "r", at four sites - L168, L169, L171 and L172.

  it('ships no appliedOrderItems accessor and no applied-order-item helpers', () => {
    const priceGroup = aPriceGroup();
    const members = shippedMemberNames();

    expect(members).not.toContain('getAppliedOrderItems');
    expect(members).not.toContain('addAppliedOrderItem');
    expect(members).not.toContain('removeAppliedOrderItem');
    expect(members).not.toContain('hasAppliedOrderItem');
    expect('getAppliedOrderItems' in priceGroup).toBe(false);
  });

  it('does not materialize appliedOrderItems as a field at all', () => {
    // The strongest form of the drop: not an empty array, not a null placeholder, not a lazily
    // resolved proxy - the column-backed collection is simply absent from the instance.
    const fieldNames = Object.keys(aPriceGroup());

    expect(fieldNames).not.toContain('appliedOrderItems');
  });

  it('ships no accounts accessor and no account helpers', () => {
    const priceGroup = aPriceGroup();
    const members = shippedMemberNames();

    expect(members).not.toContain('getAccounts');
    expect(members).not.toContain('addAccount');
    expect(members).not.toContain('removeAccount');
    expect(members).not.toContain('hasAccount');
    expect('getAccounts' in priceGroup).toBe(false);
    expect(Object.keys(priceGroup)).not.toContain('accounts');
  });

  it('ships no subscriptionBenefits accessor and no subscription-benefit helpers', () => {
    const priceGroup = aPriceGroup();
    const members = shippedMemberNames();

    expect(members).not.toContain('getSubscriptionBenefits');
    expect(members).not.toContain('addSubscriptionBenefit');
    expect(members).not.toContain('removeSubscriptionBenefit');
    expect(Object.keys(priceGroup)).not.toContain('subscriptionBenefits');
  });

  it('ships no subscriptionUsageBenefits accessor and no usage-benefit helpers', () => {
    const priceGroup = aPriceGroup();
    const members = shippedMemberNames();

    expect(members).not.toContain('getSubscriptionUsageBenefits');
    expect(members).not.toContain('addSubscriptionUsageBenefit');
    expect(members).not.toContain('removeSubscriptionUsageBenefit');
    expect(Object.keys(priceGroup)).not.toContain('subscriptionUsageBenefits');
  });

  it('ships neither the misspelled nor the corrected form of the usage-benefit helpers', () => {
    // Both spellings are checked deliberately.
    const members = shippedMemberNames();

    expect(members).not.toContain('addSubsciptionUsageBenefit');
    expect(members).not.toContain('removeSubsciptionUsageBenefit');
    expect(members).not.toContain('addSubscriptionUsageBenefit');
    expect(members).not.toContain('removeSubscriptionUsageBenefit');
  });

  it('ships exactly the four bidirectional families whose far sides are in scope', () => {
    // The positive half of the drop audit.
    const members = shippedMemberNames();
    const survivingHelpers = members.filter(
      (name) => name.startsWith('add') || name.startsWith('remove') || name.startsWith('set'),
    );

    expect(survivingHelpers).toEqual([
      'addChildPriceGroup',
      'addPriceGroupRate',
      'addPromotionReward',
      'removeChildPriceGroup',
      'removeParentPriceGroup',
      'removePriceGroupRate',
      'removePromotionReward',
      'setParentPriceGroup',
    ]);
  });

  it('ships exactly the three in-scope collection fields, and no fifth collection', () => {
    const fieldNames = Object.keys(aPriceGroup());
    const collectionFieldNames = fieldNames.filter((name) =>
      ['childPriceGroups', 'priceGroupRates', 'promotionRewards'].includes(name),
    );

    expect(collectionFieldNames.sort()).toEqual([
      'childPriceGroups',
      'priceGroupRates',
      'promotionRewards',
    ]);
    expect(fieldNames).not.toContain('appliedOrderItems');
    expect(fieldNames).not.toContain('accounts');
    expect(fieldNames).not.toContain('subscriptionBenefits');
    expect(fieldNames).not.toContain('subscriptionUsageBenefits');
  });
});

describe('PriceGroup.getParentPriceGroupOptions', () => {
  // Verified first-hand before a single assertion was written: this method did ship.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L94-L103]: the loop walks the candidate list, removes
  // the record whose `['value']` equals this group's own primary key, and stops at the first match
  // via the L99 `break`.
  //
  // JUDGMENT CALL: no fourteenth port is introduced to satisfy this method.
  // `hibachiUtilityService`, `getPropertyOptions` and every smart list stay unported; the
  // candidate list arrives as inert data on the constructor.

  it('removes the record whose value is this group own primary key', () => {
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [
        { name: 'None', value: '' },
        { name: 'Self', value: 'self' },
        { name: 'Other', value: 'other' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'None', value: '' },
      { name: 'Other', value: 'other' },
    ]);
  });

  it('keeps the blank none row, because the length guard is tested first', () => {
    // [model/entity/PriceGroup.cfc:L97] the `len(...)` clause short-circuits before the equality
    // clause is reached, so a blank-valued entry always survives - for a saved group as well as an
    // unsaved one.
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [
        { name: 'None', value: '' },
        { name: 'Self', value: 'self' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([{ name: 'None', value: '' }]);
  });

  it('removes NOTHING for an unsaved group, whose own key is also the empty string', () => {
    // The case the length guard exists for.
    const priceGroup = aPriceGroup({
      priceGroupID: '',
      parentPriceGroupOptionCandidates: [
        { name: 'None', value: '' },
        { name: 'First', value: 'first' },
        { name: 'Second', value: 'second' },
      ],
    });

    expect(priceGroup.isNew()).toBe(true);
    expect(priceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'None', value: '' },
      { name: 'First', value: 'first' },
      { name: 'Second', value: 'second' },
    ]);
  });

  it('removes ONLY THE FIRST match, reproducing the L99 break', () => {
    // A primary-key column cannot really produce two identical values, so the `break` is belt and
    // braces in the source.
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [
        { name: 'Self first copy', value: 'self' },
        { name: 'Self second copy', value: 'self' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'Self second copy', value: 'self' },
    ]);
  });

  it('stops testing after the first match, so a later self record is left untouched', () => {
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [
        { name: 'Alpha', value: 'alpha' },
        { name: 'Self', value: 'self' },
        { name: 'Omega', value: 'omega' },
        { name: 'Self again', value: 'self' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'Alpha', value: 'alpha' },
      { name: 'Omega', value: 'omega' },
      { name: 'Self again', value: 'self' },
    ]);
  });

  it('preserves candidate order among the records it keeps', () => {
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [
        { name: 'Third', value: 'c' },
        { name: 'Self', value: 'self' },
        { name: 'First', value: 'a' },
        { name: 'Second', value: 'b' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions().map((option) => option.value)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('compares WITHOUT REGARD TO CASE, exactly as the legacy `==` on two strings does', () => {
    // This case asserted the opposite until this revision, and its own comment named the reason it
    // was wrong: "the legacy `==` on two strings is case-INsensitive".
    //
    // The consequence of the exact comparison was the single outcome
    // [model/entity/PriceGroup.cfc:L96-L101] exists to prevent: this price group left in its own
    // parent-option list.
    const priceGroup = aPriceGroup({
      priceGroupID: 'abc123',
      parentPriceGroupOptionCandidates: [
        { name: 'Upper', value: 'ABC123' },
        { name: 'Exact', value: 'abc123' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([{ name: 'Exact', value: 'abc123' }]);
  });

  it('is TOTAL: an empty candidate list yields an empty result rather than throwing', () => {
    const priceGroup = aPriceGroup({ parentPriceGroupOptionCandidates: [] });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([]);
  });

  it('defaults to an empty candidate list when the repository supplied none', () => {
    const priceGroup = aPriceGroup({ parentPriceGroupOptionCandidates: undefined });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([]);
  });

  it('yields an empty result when this group is the only candidate', () => {
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [{ name: 'Self', value: 'self' }],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([]);
  });

  it('memoizes, returning the identical array instance on every call', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L95, L102]: the legacy memo lives in the framework
    // accessor's own cache slot, declared `persistent="false"` at
    // [model/entity/PriceGroup.cfc:L79], so a second legacy call re-runs the loop over an
    // already-filtered array and finds nothing - the same observable answer.
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: [
        { name: 'None', value: '' },
        { name: 'Self', value: 'self' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toBe(priceGroup.getParentPriceGroupOptions());
  });

  it('keeps the options memo INSTANCE-scoped, never module-scoped', () => {
    const firstPriceGroup = aPriceGroup({
      priceGroupID: 'first',
      parentPriceGroupOptionCandidates: [
        { name: 'First', value: 'first' },
        { name: 'Second', value: 'second' },
      ],
    });
    const secondPriceGroup = aPriceGroup({
      priceGroupID: 'second',
      parentPriceGroupOptionCandidates: [
        { name: 'First', value: 'first' },
        { name: 'Second', value: 'second' },
      ],
    });

    expect(firstPriceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'Second', value: 'second' },
    ]);
    expect(secondPriceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'First', value: 'first' },
    ]);
    expect(firstPriceGroup.getParentPriceGroupOptions()).not.toBe(
      secondPriceGroup.getParentPriceGroupOptions(),
    );
  });

  it('leaves the candidate list the constructor was handed unmutated', () => {
    // The one documented divergence in the shipped module is owned by `src/**` and is not a
    // divergence this suite spends: the legacy splices the framework's own cache array in place.
    const candidates = [
      { name: 'None', value: '' },
      { name: 'Self', value: 'self' },
      { name: 'Other', value: 'other' },
    ];
    const priceGroup = aPriceGroup({
      priceGroupID: 'self',
      parentPriceGroupOptionCandidates: candidates,
    });

    priceGroup.getParentPriceGroupOptions();

    expect(candidates).toHaveLength(3);
    expect(candidates.map((option) => option.value)).toEqual(['', 'self', 'other']);
  });

  it('is synchronous and returns an array rather than a promise', () => {
    const priceGroup = aPriceGroup({
      parentPriceGroupOptionCandidates: [{ name: 'None', value: '' }],
    });
    const result = priceGroup.getParentPriceGroupOptions();

    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('ships no getPropertyOptions equivalent, no smart list and no options provider', () => {
    // The negative half of the "no fourteenth port" decision, asserted rather than merely
    // promised.
    const members = shippedMemberNames();

    expect(members).not.toContain('getPropertyOptions');
    expect(members).not.toContain('getPriceGroupOptions');
    expect(members).not.toContain('getPriceGroupSmartList');
    expect(members).not.toContain('getSmartList');
    expect(members).not.toContain('getParentPriceGroupOptionsSmartList');
  });
});

describe('PriceGroup declarative validation contract', () => {
  // CFML parity `model/validation/PriceGroup.json`: the whole file is twelve lines and carries
  // exactly two save-context rules - `priceGroupName` required and `priceGroupCode` required -
  // plus six delete-context `maxCollection: 0` gates, on appliedOrderItems, childPriceGroups,
  // accounts, subscriptionBenefits.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L56] and `model/validation/PriceGroup.json`:
  // `priceGroupCode` is required but not unique - no `unique="true"` on the ORM property and no
  // uniqueness rule in the JSON.

  it('exposes both required scalars under their verbatim legacy names', () => {
    const priceGroup = aPriceGroup({
      priceGroupName: 'Wholesale',
      priceGroupCode: 'wholesale',
    });

    expect(priceGroup.getPriceGroupName()).toBe('Wholesale');
    expect(priceGroup.getPriceGroupCode()).toBe('wholesale');
  });

  it('types both required scalars as optional, because the ENTITY tier does not enforce the rule', () => {
    // The requiredness is a save-context rule in a declarative file, not a constructor
    // precondition.
    const priceGroup = aPriceGroup({
      priceGroupName: undefined,
      priceGroupCode: undefined,
    });

    expect(priceGroup.getPriceGroupName()).toBeUndefined();
    expect(priceGroup.getPriceGroupCode()).toBeUndefined();
  });

  it('does not reject a blank required scalar either, leaving that to the service tier', () => {
    const priceGroup = aPriceGroup({ priceGroupName: '', priceGroupCode: '' });

    expect(priceGroup.getPriceGroupName()).toBe('');
    expect(priceGroup.getPriceGroupCode()).toBe('');
  });

  it('permits two price groups to share a priceGroupCode, because it is NOT unique', () => {
    // Neither the ORM property at [model/entity/PriceGroup.cfc:L56] nor the JSON declares
    // uniqueness, so two groups with the same code are legal and this tier must not pretend
    // otherwise.
    const firstPriceGroup = aPriceGroup({ priceGroupID: 'first', priceGroupCode: 'wholesale' });
    const secondPriceGroup = aPriceGroup({ priceGroupID: 'second', priceGroupCode: 'wholesale' });

    expect(firstPriceGroup.getPriceGroupCode()).toBe('wholesale');
    expect(secondPriceGroup.getPriceGroupCode()).toBe('wholesale');
    expect(firstPriceGroup.getPriceGroupCode()).toBe(secondPriceGroup.getPriceGroupCode());
  });

  it('ships no validation machinery at all - no validate, no errors, no deletable flag', () => {
    // The delete gates are declarative, evaluated by the framework's validation service against
    // the collection lengths.
    const members = shippedMemberNames();

    expect(members).not.toContain('validate');
    expect(members).not.toContain('hasErrors');
    expect(members).not.toContain('getErrors');
    expect(members).not.toContain('setErrors');
    expect(members).not.toContain('isDeletable');
    expect(members).not.toContain('isNotDeletable');
    expect(members).not.toContain('getDeletableFlag');
  });

  it('ships none of the five declaratively-invoked entity validators found elsewhere in the slice', () => {
    // Five entities in this slice do carry a method a validation file invokes by name -
    // Sku.hasUniqueOptions, Sku.hasOneOptionPerOptionGroup,
    // RoundingRule.hasExpressionWithListOfNumericValuesOnly.
    const members = shippedMemberNames();

    expect(members).not.toContain('hasUniqueOptions');
    expect(members).not.toContain('hasOneOptionPerOptionGroup');
    expect(members).not.toContain('hasExpressionWithListOfNumericValuesOnly');
    expect(members).not.toContain('getPromotionCodesDeletableFlag');
    expect(members).not.toContain('hasUniquePromotionCode');
    expect(members).not.toContain('hasUniquePriceGroupCode');
  });

  it('leaves the two gated collections that DID ship readable but ungated at this tier', () => {
    // `childPriceGroups` and `promotionRewards` are the only two gated collections that survived
    // the drop.
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });
    const promotionReward = aPromotionReward('reward-1');
    const priceGroup = aPriceGroup({
      priceGroupID: 'gated',
      childPriceGroups: [childPriceGroup],
      promotionRewards: [promotionReward],
    });

    expect(priceGroup.getChildPriceGroups()).toEqual([childPriceGroup]);
    expect(priceGroup.getPromotionRewards()).toEqual([promotionReward]);
  });

  it('leaves the ungated priceGroupRates collection populated without complaint', () => {
    // The missing seventh gate, from the entity's point of view: rates are as freely populated as
    // any other collection, and nothing here encodes the cascade that explains the gate's absence.
    const priceGroupRate = aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false });
    const priceGroup = aPriceGroup({ priceGroupRates: [priceGroupRate] });

    expect(priceGroup.getPriceGroupRates()).toEqual([priceGroupRate]);
  });
});

describe('PriceGroup collaborator surface', () => {
  // CFML parity `model/entity/PriceGroup.cfc`: PriceGroup contains ZERO getService() call sites,
  // so every ported method is synchronous and no port is injected.

  it('takes a single init object, with no port and no clock parameter', () => {
    // A constructor that needed a collaborator could not have arity one over a plain data bag, and
    // a constructor that needed a clock could not leave every timestamp exactly as handed in.
    expect(PriceGroup.length).toBe(1);
  });

  it('holds no port, service, repository, logger, clock or config field', () => {
    const fieldNames = Object.keys(aPriceGroup());
    const collaboratorShapedNames = fieldNames.filter((name) =>
      /service|repository|port|logger|clock|now|config|pool|connection|scope|locator|container/i.test(
        name,
      ),
    );

    expect(collaboratorShapedNames).toEqual([]);
  });

  it('holds exactly the fifteen column-backed and memo fields, and nothing else', () => {
    // The positive half.
    expect(Object.keys(aPriceGroup()).sort()).toEqual([
      'activeFlag',
      'childPriceGroups',
      'createdByAccountID',
      'createdDateTime',
      'modifiedByAccountID',
      'modifiedDateTime',
      'parentPriceGroup',
      'parentPriceGroupOptionCandidates',
      'parentPriceGroupOptions',
      'priceGroupCode',
      'priceGroupID',
      'priceGroupIDPath',
      'priceGroupName',
      'priceGroupRates',
      'promotionRewards',
    ]);
  });

  it('declares NO async member anywhere on its prototype', () => {
    // The async boundary rule states that a method is async if and only if its legacy body reaches
    // the DAO or the ORM.
    const prototype = Object.getPrototypeOf(aPriceGroup()) as Record<string, unknown>;
    const asyncMemberNames = Object.getOwnPropertyNames(prototype).filter((name) => {
      const member: unknown = prototype[name];

      return typeof member === 'function' && member.constructor.name === 'AsyncFunction';
    });

    expect(asyncMemberNames).toEqual([]);
  });

  it('returns a plain value from every no-argument member, never a promise', () => {
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      parentPriceGroup: aPriceGroup({ priceGroupID: 'root' }),
      priceGroupRates: [aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: true })],
      parentPriceGroupOptionCandidates: [{ name: 'None', value: '' }],
    });
    const readers: readonly (() => unknown)[] = [
      () => priceGroup.getPriceGroupID(),
      () => priceGroup.getPriceGroupIDPath(),
      () => priceGroup.getActiveFlag(),
      () => priceGroup.getPriceGroupName(),
      () => priceGroup.getPriceGroupCode(),
      () => priceGroup.getParentPriceGroup(),
      () => priceGroup.getChildPriceGroups(),
      () => priceGroup.getPriceGroupRates(),
      () => priceGroup.getPromotionRewards(),
      () => priceGroup.getGlobalPriceGroupRate(),
      () => priceGroup.getParentPriceGroupOptions(),
      () => priceGroup.getCreatedDateTime(),
      () => priceGroup.getCreatedByAccountID(),
      () => priceGroup.getModifiedDateTime(),
      () => priceGroup.getModifiedByAccountID(),
      () => priceGroup.isNew(),
      () => priceGroup.preInsert(),
      () => priceGroup.preUpdate(),
    ];

    expect(readers).toHaveLength(18);

    for (const read of readers) {
      expect(read()).not.toBeInstanceOf(Promise);
    }
  });

  it('ships no ambient-scope accessor under either legacy name', () => {
    // The codebase reaches request state through `getHibachiScope()` almost everywhere and through
    // `getSlatwallScope()` at [model/service/PriceGroupService.cfc:L262-L268].
    const members = shippedMemberNames();

    expect(members).not.toContain('getHibachiScope');
    expect(members).not.toContain('getSlatwallScope');
    expect(members).not.toContain('getScope');
    expect(members).not.toContain('getRequestContext');
  });

  it('ships no service locator and no DI container hook', () => {
    const members = shippedMemberNames();

    expect(members).not.toContain('getService');
    expect(members).not.toContain('setService');
    expect(members).not.toContain('getBean');
    expect(members).not.toContain('getBeanFactory');
    expect(members).not.toContain('setBeanFactory');
  });

  it('never manufactures a timestamp, so an absent audit column stays absent', () => {
    // The clock test with teeth.
    const priceGroup = aPriceGroup({
      createdDateTime: undefined,
      modifiedDateTime: undefined,
    });

    expect(priceGroup.getCreatedDateTime()).toBeUndefined();
    expect(priceGroup.getModifiedDateTime()).toBeUndefined();
  });

  it('hands back the exact audit instants it was given, unshifted and unrounded', () => {
    // Every business-date literal in this suite is an explicit UTC ISO-8601 string.
    const createdDateTime = new Date('2024-06-01T00:00:00.000Z');
    const modifiedDateTime = new Date('2024-06-15T12:30:00.000Z');
    const priceGroup = aPriceGroup({ createdDateTime, modifiedDateTime });

    expect(priceGroup.getCreatedDateTime()).toBe(createdDateTime);
    expect(priceGroup.getModifiedDateTime()).toBe(modifiedDateTime);
    expect(priceGroup.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(priceGroup.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:00.000Z');
  });

  it('leaves the audit columns untouched across every mutation this entity offers', () => {
    // The legacy stamp happens in the framework base's own preInsert
    // [org/Hibachi/HibachiEntity.cfc:L598-L619], which this component does not inherit here.
    const createdDateTime = new Date('2024-06-01T00:00:00.000Z');
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child', createdDateTime });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.addPriceGroupRate(
      aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: false }),
    );
    priceGroup.addPromotionReward(aPromotionReward('reward-1'));
    priceGroup.preUpdate();
    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(priceGroup.getCreatedDateTime()).toBe(createdDateTime);
    expect(priceGroup.getModifiedDateTime()).toBeUndefined();
  });
});

describe('PriceGroup structural facts', () => {
  it('reports isNew() honestly from the empty-string primary key', () => {
    // [model/entity/PriceGroup.cfc:L52] `unsavedvalue="" default=""`.
    expect(aPriceGroup({ priceGroupID: '' }).isNew()).toBe(true);
    expect(aPriceGroup({ priceGroupID: 'saved' }).isNew()).toBe(false);
  });

  it('treats a whitespace-only primary key as SAVED, because the unsaved value is exactly empty', () => {
    // The `unsavedvalue` is the empty string and nothing else, so a single space is a (nonsensical
    // but) present key.
    expect(aPriceGroup({ priceGroupID: ' ' }).isNew()).toBe(false);
  });

  it('exposes the primary key under its verbatim legacy accessor name', () => {
    // The honest stand-in for the inherited `has_primary_id_property_name` case at
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62].
    const priceGroup = aPriceGroup({ priceGroupID: 'pg-1' });

    expect(shippedMemberNames()).toContain('getPriceGroupID');
    expect(priceGroup.getPriceGroupID()).toBe('pg-1');
    expect(priceGroup.isNew()).toBe(false);
  });

  it('resolves an ABSENT activeFlag to false rather than fabricating true', () => {
    // CORRECTION, verified first-hand and recorded because it contradicts a secondary description:
    // the COLUMN at [model/entity/PriceGroup.cfc:L54] carries no `default=` - that part is right -
    // but the shipped ACCESSOR is `boolean`.
    expect(aPriceGroup({ activeFlag: undefined }).getActiveFlag()).toBe(false);
    expect(aPriceGroup({ activeFlag: null }).getActiveFlag()).toBe(false);
  });

  it('is NOT one of the six boolean columns that DO carry a default in this slice', () => {
    const priceGroupRateWithDeclaredDefault = new PriceGroupRate({ priceGroupRateID: 'rate-1' });

    expect(priceGroupRateWithDeclaredDefault.getGlobalFlag()).toBe(false);
    expect(aPriceGroup().getActiveFlag()).toBe(false);
  });

  it('routes the activeFlag through the CFML coercion boundary for every driver form', () => {
    // BOUNDARY: the full coercion table, covering every literal, numeric string and raising case,
    // is owned by `tests/unit/lib/cfml`, and this file may not import from `src/lib/**` at all.
    expect(aPriceGroup({ activeFlag: true }).getActiveFlag()).toBe(true);
    expect(aPriceGroup({ activeFlag: false }).getActiveFlag()).toBe(false);
    expect(aPriceGroup({ activeFlag: 1 }).getActiveFlag()).toBe(true);
    expect(aPriceGroup({ activeFlag: 0 }).getActiveFlag()).toBe(false);
    expect(aPriceGroup({ activeFlag: '1' }).getActiveFlag()).toBe(true);
    expect(aPriceGroup({ activeFlag: '0' }).getActiveFlag()).toBe(false);
    expect(aPriceGroup({ activeFlag: 'true' }).getActiveFlag()).toBe(true);
    expect(aPriceGroup({ activeFlag: 'false' }).getActiveFlag()).toBe(false);
    expect(aPriceGroup({ activeFlag: '' }).getActiveFlag()).toBe(false);
  });

  it('accepts a nullable parentPriceGroup and works end to end as a root', () => {
    // [model/entity/PriceGroup.cfc:L59] `hb_optionsNullRBKey="define.none"` is the declaration
    // that makes the parent genuinely optional - the admin form offers a "none" row for it.
    const rootPriceGroup = aPriceGroup({
      priceGroupID: 'root',
      priceGroupIDPath: undefined,
      parentPriceGroup: undefined,
    });

    expect(rootPriceGroup.getParentPriceGroup()).toBeUndefined();
    expect(rootPriceGroup.getPriceGroupIDPath()).toBe('root');
    expect(rootPriceGroup.getChildPriceGroups()).toEqual([]);
    expect(rootPriceGroup.getGlobalPriceGroupRate()).toBeUndefined();
    expect(rootPriceGroup.getParentPriceGroupOptions()).toEqual([]);
  });

  it('declares NO remoteID at all, unlike nearly every sibling entity', () => {
    // Verified by direct count: `remoteID` appears ZERO times in `model/entity/PriceGroup.cfc`.
    const priceGroup = aPriceGroup();

    expect(shippedMemberNames()).not.toContain('getRemoteID');
    expect(shippedMemberNames()).not.toContain('setRemoteID');
    expect('getRemoteID' in priceGroup).toBe(false);
    expect(Object.keys(priceGroup)).not.toContain('remoteID');
  });

  it('keeps the two audit account columns as opaque string FKs, not Account objects', () => {
    // [model/entity/PriceGroup.cfc:L74, L76] declare `createdByAccount` and `modifiedByAccount` as
    // many-to-ones onto the OUT-OF-SCOPE Account entity, both `hb_populateEnabled="false"`.
    const priceGroup = aPriceGroup({
      createdByAccountID: 'account-created',
      modifiedByAccountID: 'account-modified',
    });

    expect(priceGroup.getCreatedByAccountID()).toBe('account-created');
    expect(priceGroup.getModifiedByAccountID()).toBe('account-modified');
    expect(shippedMemberNames()).not.toContain('getCreatedByAccount');
    expect(shippedMemberNames()).not.toContain('getModifiedByAccount');
  });

  it('leaves every audit column absent when the repository read none', () => {
    const priceGroup = aPriceGroup({
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    });

    expect(priceGroup.getCreatedDateTime()).toBeUndefined();
    expect(priceGroup.getCreatedByAccountID()).toBeUndefined();
    expect(priceGroup.getModifiedDateTime()).toBeUndefined();
    expect(priceGroup.getModifiedByAccountID()).toBeUndefined();
  });

  it('defaults every shipped collection to an empty array, never to null or undefined', () => {
    // The honest stand-in for the inherited `defaults_are_correct` case, whose Brand form at
    // `meta/tests/unit/entity/BrandTest.cfc` asserts that `getProducts()` answers an empty array.
    const priceGroup = new PriceGroup({
      priceGroupID: '',
      priceGroupIDPath: undefined,
      activeFlag: undefined,
      priceGroupName: undefined,
      priceGroupCode: undefined,
      parentPriceGroup: undefined,
      childPriceGroups: [],
      priceGroupRates: [],
      promotionRewards: [],
      parentPriceGroupOptionCandidates: undefined,
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    });

    expect(priceGroup.getChildPriceGroups()).toEqual([]);
    expect(priceGroup.getPriceGroupRates()).toEqual([]);
    expect(priceGroup.getPromotionRewards()).toEqual([]);
    expect(priceGroup.getParentPriceGroupOptions()).toEqual([]);
  });
});

describe('PriceGroup framework surface deliberately not ported', () => {
  // Annotate, never normalise.
  //
  // [model/entity/PriceGroup.cfc:L193, L202]: the banner pair around the path getter is
  // misspelled.

  it('exposes no dynamic getter dispatch, so an unknown accessor simply does not exist', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: `PriceGroup` does not declare
    // `attributeValues`, so an unknown `getX()` reaches the framework's `onMissingMethod`
    // dispatcher and THROWS.
    const priceGroup = aPriceGroup();

    expect('getSomeUndeclaredAttribute' in priceGroup).toBe(false);
    expect('onMissingMethod' in priceGroup).toBe(false);
    expect(shippedMemberNames()).not.toContain('getAttributeValues');
    expect(shippedMemberNames()).not.toContain('getAttributeValue');
    expect(shippedMemberNames()).not.toContain('clearAttributeCache');
  });

  it('ships none of the framework base members that no call site invokes on a price group', () => {
    // No Hibachi base-class suite is built here and none of these is invented.
    const members = shippedMemberNames();

    expect(members).not.toContain('getNewFlag');
    expect(members).not.toContain('getPrintTemplates');
    expect(members).not.toContain('getEmailTemplates');
    expect(members).not.toContain('getPropertyOptions');
    expect(members).not.toContain('getPropertyOptionsSmartList');
    expect(members).not.toContain('getAssignedAttributeSetSmartList');
    expect(members).not.toContain('getAuditSmartList');
    expect(members).not.toContain('getPrimaryIDValue');
    expect(members).not.toContain('getPrimaryIDPropertyName');
  });

  it('declares no simple representation, and none is fabricated to satisfy a legacy base test', () => {
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] carries a
    // `simple_representation_exists_and_is_simple` case that every legacy entity test inherited.
    const priceGroup = aPriceGroup({ priceGroupName: 'Wholesale' });
    const members = shippedMemberNames();

    expect(members).not.toContain('getSimpleRepresentation');
    expect(members).not.toContain('getSimpleRepresentationPropertyName');
    expect('getSimpleRepresentation' in priceGroup).toBe(false);
  });

  it('carries no validation gate and no error dump in its lifecycle hooks', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L598-L619]: the framework's own `preInsert`
    // throws when `!isPersistable()` and stamps created/modified from `now()`.
    const invalidPriceGroup = aPriceGroup({
      priceGroupID: '',
      priceGroupName: undefined,
      priceGroupCode: undefined,
      priceGroupIDPath: undefined,
    });

    expect(() => invalidPriceGroup.preInsert()).not.toThrow();
    expect(() => invalidPriceGroup.preUpdate()).not.toThrow();
    expect(invalidPriceGroup.getPriceGroupIDPath()).toBe('');
  });

  it('exposes exactly the thirty-one members the port ships, and no thirty-second', () => {
    // The whole surface, pinned once.
    expect(shippedMemberNames()).toEqual([
      'addChildPriceGroup',
      'addPriceGroupRate',
      'addPromotionReward',
      'buildPriceGroupIDPathList',
      'constructor',
      'getActiveFlag',
      'getChildPriceGroups',
      'getCreatedByAccountID',
      'getCreatedDateTime',
      'getGlobalPriceGroupRate',
      'getModifiedByAccountID',
      'getModifiedDateTime',
      'getParentPriceGroup',
      'getParentPriceGroupOptions',
      'getPriceGroupCode',
      'getPriceGroupID',
      'getPriceGroupIDPath',
      'getPriceGroupName',
      'getPriceGroupRates',
      'getPromotionRewards',
      'hasChildPriceGroup',
      'hasPriceGroupRate',
      'hasPromotionReward',
      'isNew',
      'preInsert',
      'preUpdate',
      'removeChildPriceGroup',
      'removeParentPriceGroup',
      'removePriceGroupRate',
      'removePromotionReward',
      'setParentPriceGroup',
    ]);
  });
});

describe('PriceGroup instance isolation and fixture freshness', () => {
  it('builds a distinct subject on every call, never handing back a shared instance', () => {
    const firstPriceGroup = aPriceGroup();
    const secondPriceGroup = aPriceGroup();

    expect(firstPriceGroup).not.toBe(secondPriceGroup);
    expect(firstPriceGroup).toBeInstanceOf(PriceGroup);
    expect(secondPriceGroup).toBeInstanceOf(PriceGroup);
  });

  it('gives every subject its own collections, so a mutation never travels between them', () => {
    const firstPriceGroup = aPriceGroup({ priceGroupID: 'first' });
    const secondPriceGroup = aPriceGroup({ priceGroupID: 'second' });

    firstPriceGroup.addPriceGroupRate(
      aPriceGroupRate({ priceGroupRateID: 'rate-1', globalFlag: true }),
    );
    firstPriceGroup.addPromotionReward(aPromotionReward('reward-1'));
    firstPriceGroup.addChildPriceGroup(aPriceGroup({ priceGroupID: 'first-child' }));

    expect(firstPriceGroup.getPriceGroupRates()).toHaveLength(1);
    expect(firstPriceGroup.getPromotionRewards()).toHaveLength(1);
    expect(firstPriceGroup.getChildPriceGroups()).toHaveLength(1);
    expect(secondPriceGroup.getPriceGroupRates()).toEqual([]);
    expect(secondPriceGroup.getPromotionRewards()).toEqual([]);
    expect(secondPriceGroup.getChildPriceGroups()).toEqual([]);
    expect(firstPriceGroup.getPriceGroupRates()).not.toBe(secondPriceGroup.getPriceGroupRates());
  });

  it('never lets a second price group observe the first path memo, even on an identical key', () => {
    // The sharpest form of the rule: two groups with the same primary key and DIFFERENT parents.
    const firstPriceGroup = aPriceGroup({
      priceGroupID: 'same-key',
      priceGroupIDPath: undefined,
      parentPriceGroup: aPriceGroup({ priceGroupID: 'first-root' }),
    });

    expect(firstPriceGroup.getPriceGroupIDPath()).toBe('first-root,same-key');

    const secondPriceGroup = aPriceGroup({
      priceGroupID: 'same-key',
      priceGroupIDPath: undefined,
      parentPriceGroup: aPriceGroup({ priceGroupID: 'second-root' }),
    });

    expect(secondPriceGroup.getPriceGroupIDPath()).toBe('second-root,same-key');
    expect(firstPriceGroup.getPriceGroupIDPath()).toBe('first-root,same-key');
  });

  it('never lets a second price group observe the first options memo, on an identical key', () => {
    const candidateShape = [
      { name: 'None', value: '' },
      { name: 'Same key', value: 'same-key' },
      { name: 'Other', value: 'other' },
    ];
    const firstPriceGroup = aPriceGroup({
      priceGroupID: 'same-key',
      parentPriceGroupOptionCandidates: candidateShape.map((option) => ({ ...option })),
    });

    expect(firstPriceGroup.getParentPriceGroupOptions()).toHaveLength(2);

    const secondPriceGroup = aPriceGroup({
      priceGroupID: 'other',
      parentPriceGroupOptionCandidates: candidateShape.map((option) => ({ ...option })),
    });

    expect(secondPriceGroup.getParentPriceGroupOptions()).toEqual([
      { name: 'None', value: '' },
      { name: 'Same key', value: 'same-key' },
    ]);
    expect(firstPriceGroup.getParentPriceGroupOptions()).not.toBe(
      secondPriceGroup.getParentPriceGroupOptions(),
    );
  });

  it('resolves both memos independently of each other on the same instance', () => {
    // Reading one memo must not populate or invalidate the other.
    const priceGroup = aPriceGroup({
      priceGroupID: 'child',
      priceGroupIDPath: undefined,
      parentPriceGroup: aPriceGroup({ priceGroupID: 'root' }),
      parentPriceGroupOptionCandidates: [
        { name: 'None', value: '' },
        { name: 'Child', value: 'child' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([{ name: 'None', value: '' }]);
    expect(priceGroup.getPriceGroupIDPath()).toBe('root,child');
    expect(priceGroup.getParentPriceGroupOptions()).toEqual([{ name: 'None', value: '' }]);
  });

  it('returns a freshly built graph from every makePriceGroupFixtures call', () => {
    const firstGraph = makePriceGroupFixtures();
    const secondGraph = makePriceGroupFixtures();

    expect(firstGraph).not.toBe(secondGraph);
    expect(firstGraph.childPriceGroup).not.toBe(secondGraph.childPriceGroup);
    expect(firstGraph.globalRatePriceGroup).not.toBe(secondGraph.globalRatePriceGroup);
    expect(firstGraph.childPriceGroup.getPriceGroupID()).toBe(
      secondGraph.childPriceGroup.getPriceGroupID(),
    );
  });

  it('isolates two fixture graphs, so mutating one leaves the other untouched', () => {
    const firstGraph = makePriceGroupFixtures();
    const secondGraph = makePriceGroupFixtures();
    const rateCountBefore = secondGraph.childPriceGroup.getPriceGroupRates().length;

    firstGraph.childPriceGroup.addPriceGroupRate(
      aPriceGroupRate({ priceGroupRateID: 'intruder-rate', globalFlag: true }),
    );

    expect(firstGraph.childPriceGroup.getGlobalPriceGroupRate()?.getPriceGroupRateID()).toBe(
      'intruder-rate',
    );
    expect(secondGraph.childPriceGroup.getPriceGroupRates()).toHaveLength(rateCountBefore);
    expect(secondGraph.childPriceGroup.getGlobalPriceGroupRate()).toBeUndefined();
  });

  it('exposes the fixture parent chain with root-first stored paths, three levels deep', () => {
    const { rootPriceGroup, parentPriceGroup, childPriceGroup, priceGroupIDPaths } =
      makePriceGroupFixtures();

    expect(rootPriceGroup.getParentPriceGroup()).toBeUndefined();
    expect(parentPriceGroup.getParentPriceGroup()).toBe(rootPriceGroup);
    expect(childPriceGroup.getParentPriceGroup()).toBe(parentPriceGroup);

    expect(rootPriceGroup.getPriceGroupIDPath()).toBe(priceGroupIDPaths.root);
    expect(parentPriceGroup.getPriceGroupIDPath()).toBe(priceGroupIDPaths.parent);
    expect(childPriceGroup.getPriceGroupIDPath()).toBe(priceGroupIDPaths.child);

    expect(priceGroupIDPaths.child.startsWith(`${priceGroupIDPaths.parent},`)).toBe(true);
    expect(priceGroupIDPaths.parent.startsWith(`${priceGroupIDPaths.root},`)).toBe(true);
  });

  it('wires the fixture child collections consistently in both directions', () => {
    const { rootPriceGroup, parentPriceGroup, childPriceGroup, siblingPriceGroup } =
      makePriceGroupFixtures();

    expect(parentPriceGroup.getChildPriceGroups()).toContain(childPriceGroup);
    expect(parentPriceGroup.getChildPriceGroups()).toContain(siblingPriceGroup);
    expect(parentPriceGroup.hasChildPriceGroup(childPriceGroup)).toBe(true);
    expect(parentPriceGroup.hasChildPriceGroup(siblingPriceGroup)).toBe(true);
    expect(rootPriceGroup.getChildPriceGroups()).toContain(parentPriceGroup);
    expect(rootPriceGroup.hasChildPriceGroup(childPriceGroup)).toBe(false);
  });

  it('gives the isolated fixture group no rates, no parent and no children', () => {
    const { isolatedPriceGroup } = makePriceGroupFixtures();

    expect(isolatedPriceGroup.getPriceGroupRates()).toEqual([]);
    expect(isolatedPriceGroup.getParentPriceGroup()).toBeUndefined();
    expect(isolatedPriceGroup.getChildPriceGroups()).toEqual([]);
    expect(isolatedPriceGroup.getGlobalPriceGroupRate()).toBeUndefined();
    expect(isolatedPriceGroup.getPriceGroupIDPath()).toBe(isolatedPriceGroup.getPriceGroupID());
  });

  it('keeps every date in this suite timezone-independent, with no clock read anywhere', () => {
    const createdDateTime = new Date('2024-06-01T00:00:00.000Z');
    const modifiedDateTime = new Date('2024-06-15T12:30:00.000Z');
    const priceGroup = aPriceGroup({ createdDateTime, modifiedDateTime });

    expect(createdDateTime.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(modifiedDateTime.toISOString()).toBe('2024-06-15T12:30:00.000Z');
    expect(priceGroup.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(priceGroup.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:00.000Z');
  });
});

// A cyclic parent chain is accepted, exactly as the legacy setter accepts one.
//
// NET-NEW coverage - `meta/tests/` holds no PriceGroup test - pinning legacy PARITY rather than a
// divergence.

describe('PriceGroup - a cyclic parent chain is accepted, per legacy parity', () => {
  it('accepts a price group as its own parent', () => {
    const subject = aPriceGroup({ priceGroupID: 'pg-self' });

    // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: no validation precedes the assignment,
    // so the self-reference is simply stored.
    subject.setParentPriceGroup(subject);

    expect(subject.getParentPriceGroup()).toBe(subject);
  });

  it('accepts a descendant as its parent, closing a multi-level cycle', () => {
    const root = aPriceGroup({ priceGroupID: 'pg-root' });
    const mid = aPriceGroup({ priceGroupID: 'pg-mid' });
    const leaf = aPriceGroup({ priceGroupID: 'pg-leaf' });
    mid.setParentPriceGroup(root);
    leaf.setParentPriceGroup(mid);

    root.setParentPriceGroup(leaf);

    // The cycle is now closed and observable in both directions.
    expect(root.getParentPriceGroup()).toBe(leaf);
    expect(leaf.getParentPriceGroup()).toBe(mid);
    expect(mid.getParentPriceGroup()).toBe(root);
  });

  it('maintains the far side when it closes a cycle, just as for any other parent', () => {
    // The far-side append is the only thing the legacy body guards
    // [model/entity/PriceGroup.cfc:L112], and it is guarded on membership rather than on
    // acyclicity - so a cycle-closing assignment appends like any other.
    const root = aPriceGroup({ priceGroupID: 'pg-far-root' });
    const leaf = aPriceGroup({ priceGroupID: 'pg-far-leaf' });
    leaf.setParentPriceGroup(root);

    root.setParentPriceGroup(leaf);

    expect(leaf.getChildPriceGroups()).toContain(root);
    expect(root.getChildPriceGroups()).toContain(leaf);
  });

  it('accepts a cycle through addChildPriceGroup too, since it delegates to the setter', () => {
    const root = aPriceGroup({ priceGroupID: 'pg-add-root' });
    const leaf = aPriceGroup({ priceGroupID: 'pg-add-leaf' });
    leaf.setParentPriceGroup(root);

    leaf.addChildPriceGroup(root);

    expect(root.getParentPriceGroup()).toBe(leaf);
  });

  it('still assigns every well-founded reparent, including moving a subtree', () => {
    const oldRoot = aPriceGroup({ priceGroupID: 'pg-old-root' });
    const newRoot = aPriceGroup({ priceGroupID: 'pg-new-root' });
    const movable = aPriceGroup({ priceGroupID: 'pg-movable' });
    movable.setParentPriceGroup(oldRoot);

    movable.setParentPriceGroup(newRoot);

    expect(movable.getParentPriceGroup()).toBe(newRoot);
    // And the path still builds, because this hierarchy is well-founded.
    expect(movable.getPriceGroupIDPath()).toBe('pg-new-root,pg-movable');
  });
});
