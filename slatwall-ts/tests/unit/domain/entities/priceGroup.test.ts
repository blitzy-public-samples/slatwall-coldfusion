// ---------------------------------------------------------------------------
// slatwall-ts - characterization suite pinning `src/domain/entities/priceGroup.ts`
//
// `PriceGroup` ports model/entity/PriceGroup.cfc (226 lines; the body closes at L225), the
// hierarchical grouping whose parent chain, rate collection and global-rate accessor the five-level
// price-group cascade consumes. The CFC is the SOLE authority below, and every locator was
// re-verified against it line by line rather than taken from a secondary description.
//
// Six behaviours carry this entity's risk, each with its own describe block:
//
//   1. `getGlobalPriceGroupRate()` TAKES THE FIRST MATCH and answers `undefined` when there is none
//      [model/entity/PriceGroup.cfc:L82-L90]. The service's own inlined loop over the same
//      collection takes the LAST match [model/service/PriceGroupService.cfc:L163-L170]. Two paths
//      over one collection disagree about which global rate wins, and BOTH are preserved.
//   2. THE MATERIALIZED PATH HAS TWO INDEPENDENT ROUTES. The lazy memoized getter
//      [model/entity/PriceGroup.cfc:L195-L200] guards on `isNull(...)`, NOT `structKeyExists(...)`;
//      the two lifecycle methods [model/entity/PriceGroup.cfc:L206-L214] bypass that getter and
//      overwrite the field outright, so the two can disagree - defect D26.
//   3. THE `isNew()` DISJUNCT AT [model/entity/PriceGroup.cfc:L112] short-circuits the containment
//      test, so an unsaved group is appended to its parent's collection twice - defect D25.
//   4. `removeParentPriceGroup` IS A CORRECT CONTROL. It finds and deletes in the SAME collection
//      [model/entity/PriceGroup.cfc:L120, L122], and the field clear at :L124 is UNCONDITIONAL.
//   5. FOUR COLLECTIONS ARE DROPPED because their far side is out of scope, and `appliedOrderItems`
//      [model/entity/PriceGroup.cfc:L62] is not materialized at all.
//   6. `activeFlag` HAS NO ORM DEFAULT [model/entity/PriceGroup.cfc:L54], and `PriceGroup` declares
//      NO `remoteID`.
//
// ZERO PORTS, ZERO CLOCK, FULLY SYNCHRONOUS. `model/entity/PriceGroup.cfc` contains ZERO
// `getService(` call sites, so no collaborator is injected, no method reaches a repository and
// nothing here returns a promise.
//
// COVERAGE IS 100% NET-NEW, never to be presented as parity. `grep -rli pricegroup meta/tests/`
// returns ZERO hits across all 32 legacy `.cfc` components. The only legacy suites extended
// anywhere in this port are [meta/tests/unit/entity/BrandTest.cfc] and
// [meta/tests/unit/entity/ProductTest.cfc], and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing zero coverage.
// Of the four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc] would have supplied,
// `defaults_are_correct()` [L64-L67] is observable and is pinned as net-new, while three are not
// available and are NOT fabricated: `has_primary_id_property_name()` [L60-L62] needs a framework
// accessor this port does not ship; `validate_as_save_for_a_new_instance_doesnt_pass()` [L51-L54]
// needs a validation runtime, and [model/validation/PriceGroup.json] is enforced at the SERVICE
// tier; and `simple_representation_exists_and_is_simple()` [L56-L58] calls
// `getSimpleRepresentation()`, which the CFC does not declare - its absence is asserted and
// contrasted with the child [model/entity/PriceGroupRate.cfc:L270-L272], which returns the
// capital-D `"DisplayName"`.
//
// THIS FILE SPENDS ZERO DIVERGENCES; the port's three all sit elsewhere, in `src/services/**` and
// in the entity memo fixes owned by `sku.test.ts` and `product.test.ts`.
//
// FOUR `LEGACY-DEFECT` MARKERS ARE SPENT HERE, each verified against the shipped module before it
// was spent, and each stated in full at its own site. Two are this entity's own - D26 at
// [model/entity/PriceGroup.cfc:L206-L214] and D25 at [model/entity/PriceGroup.cfc:L112], whose
// ported body reads `this.isNew() || !parentPriceGroup.hasChildPriceGroup(this)` disjunct for
// disjunct. Two cite a FAR-SIDE defect - [model/entity/PriceGroupRate.cfc:L183] and
// [model/entity/PromotionReward.cfc:L159, L162] - and both are asserted ONLY through this entity's
// delegating helpers `addPriceGroupRate` and `addPromotionReward`, because that is where the
// duplicate becomes observable on a `PriceGroup` collection. Marking them is the honest alternative
// to asserting defective output with no label on it; neither is a divergence and neither re-tests
// the sibling entity's own surface.
//
// Everything else preserved here is a `CFML parity` note and NOT a defect: the first-versus-last
// global-rate disagreement, the four-site `subsciptionUsageBenefit` argument typo, the capitalised
// `ChildPriceGroup` singular name, the missing `remoteID`, the missing `priceGroupRates` delete
// gate, the two lifecycle methods declared under the wrong banner, the misspelled "Implicet" and
// "invers" comments, the out-of-banner `getGlobalPriceGroupRate()` and the inconsistent
// `type="array"` attribute.
//
// THE MANDATORY "remove-that-ADDs" INVERSION CROSS-CHECK was run against all eight `remove*`
// bidirectional helpers in the CFC (L116, L131, L139, L147, L155, L163, L171, L179) and against the
// four that ship. VERDICT: CLEAN - ZERO inversions. Every `remove*` body calls a `remove*`
// counterpart on the owning side, and `removeParentPriceGroup` searches and splices and never
// appends. Contrast [model/entity/Option.cfc:L129-L131] and :L145-L147, whose two `remove*` methods
// both call `addExcludedOption` - genuine inversions, owned by `option.test.ts`.
//
// FOUR EXPECTATIONS CORRECTED against the source and the shipped module, both read in full first,
// because locator and surface drift is systemic in this migration:
//
//   (a) `src/domain/valueObjects/materializedIdPath.ts` exports NO symbol named
//       `MaterializedIdPath`. Its surface is five functions and two accessor types; this suite
//       imports the four functions it needs. An import of that binding would not compile.
//   (b) THE BANNER TYPO IS "Implicet", NOT "Implecet". [model/entity/PriceGroup.cfc:L193] and :L202
//       both read "Overridden Implicet Getters", verified by direct search, and
//       [model/entity/ProductType.cfc:L248] and :L257 read the same. A comment in the shipped
//       module states otherwise; the source is authoritative and `src/**` is not ours to edit.
//   (c) `getActiveFlag()` RETURNS `boolean`, NOT `boolean | undefined`. The COLUMN has no default
//       [model/entity/PriceGroup.cfc:L54]; the shipped ACCESSOR resolves that absence through the
//       CFML boolean coercion and answers `false`, which is what the legacy engine gave a flag it
//       had no value for. What must never be fabricated is a `true` default - and it is not.
//   (d) THE PROMOTION-REWARD D25 IS ASYMMETRIC. A first draft expected an unsaved group to
//       duplicate BOTH sides; running it proved otherwise, because
//       [model/entity/PromotionReward.cfc:L159] guards on `eligiblePriceGroup.isNew()` and :L162 on
//       `this.isNew()` - two INDEPENDENT tests of two different ends. An unsaved group therefore
//       duplicates only the reward's own collection and an unsaved reward only this group's. Both
//       halves are asserted, and the mirror pair proves the guards are independent rather than one
//       guard read twice.
// ---------------------------------------------------------------------------

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

// --- Local builders ---------------------------------------------------------
//
// FUNCTIONS AND NEVER SHARED INSTANCES. Every test builds its own subject and far-side doubles, so
// no state crosses a test boundary: `parentPriceGroup`, `priceGroupIDPath` and the option memo are
// all mutable on the class, and the three collections are handed over by reference rather than
// copied. There is deliberately no `beforeEach` and no `afterEach` - nothing installs a spy, a fake
// timer or a stubbed environment value.
//
// HAND-WRITTEN IN-MEMORY DOUBLES, NOT `vi.mock`. `PriceGroupRate` and `PromotionReward` are
// in-scope domain classes with private fields, so a structural stand-in would not be assignable and
// a mock would prove nothing about the bidirectional contract these helpers delegate into.

/**
 * The overrides a test may supply when building a subject.
 *
 * Every slot is optional HERE and required on the class constructor, deliberately in both places.
 * The constructor requires each nullable column as a present-but-`undefined` slot so a hydrating
 * repository must state "I read that column and found nothing" rather than silently omit it; a test
 * has no such obligation, and spelling out thirteen `undefined`s per case would bury the one or two
 * columns each case is about.
 *
 * `activeFlag` accepts the same wide input union the constructor does, modelled structurally rather
 * than by importing the coercion helper's own type: this tier may reach into `src/domain/**` and
 * `tests/fixtures/**` only, and `src/lib/cfml/truthiness.ts` is outside that surface. It still
 * exercises every form a MySQL driver can hand over for an undefaulted `ormtype="boolean"` column
 * [model/entity/PriceGroup.cfc:L54].
 *
 * `parentPriceGroupOptionCandidates` is typed with the two keys the source itself spells at
 * [model/entity/PriceGroup.cfc:L97] - `options[i]['value']` - because the shipped element type is
 * module-local and unexported.
 *
 * EVERY SLOT IS `T | undefined` RATHER THAN A BARE `T?`, which is a requirement here rather than a
 * formality. `exactOptionalPropertyTypes` is enabled, so "absent" and "present-but-undefined" are
 * genuinely different types - and that difference is the very thing the materialized-path block has
 * to distinguish.
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
 * reports `false`. The empty-string primary key at [model/entity/PriceGroup.cfc:L52] is what
 * triggers D25, so a test wanting the unsaved branch must ask for it explicitly.
 *
 * Each collection defaults to a NEWLY CONSTRUCTED array on every call. The class does not copy what
 * it is handed and its accessors return those very arrays, so a module-level literal would be
 * shared mutable state of exactly the kind this port forbids.
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
 * [model/entity/PriceGroupRate.cfc:L53], because every assertion in the global-rate block is ABOUT
 * that flag and an implicit default would hide the input under test.
 *
 * `amount`, when supplied, is built from a DECIMAL STRING through the port's single arithmetic
 * surface. No float literal reaches a monetary field anywhere in this file, and `decimal.js` is
 * never imported here - only `src/domain/valueObjects/money.ts` may import it.
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
 * Builds one real `PromotionReward`, fresh. Only the primary key is supplied: the two members this
 * entity delegates into - `addEligiblePriceGroup` and `removeEligiblePriceGroup`
 * [model/entity/PromotionReward.cfc:L158-L175] - need nothing else, and populating the reward's
 * twenty other columns would prove nothing this suite is about.
 */
function aPromotionReward(promotionRewardID: string): PromotionReward {
  return new PromotionReward({ promotionRewardID });
}

/** The runtime member names on the shipped class, sorted. */
function shippedMemberNames(): readonly string[] {
  const prototype: object = Object.getPrototypeOf(aPriceGroup()) as object;

  return Object.getOwnPropertyNames(prototype).sort();
}

// --- 1. getGlobalPriceGroupRate - FIRST match wins, `undefined` when there is none -----

describe('PriceGroup.getGlobalPriceGroupRate', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L82-L90]: getGlobalPriceGroupRate returns the FIRST
  // rate whose globalFlag is set (L86-L87 returns immediately) and falls off the end at L90 with no
  // return statement, yielding CFML null => undefined. This is the OPPOSITE of the service cascade
  // at [model/service/PriceGroupService.cfc:L163-L170], which has no break and therefore takes the
  // LAST match. Re-verified locator: the service's step opens at L163, its loop at L165 and its
  // unconditional assignment at L167, so the no-break region is L165-L169 inside L163-L170.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L82-L90]: this method sits in an UN-BANNERED region,
  // between the property declarations and the "START: Non-Persistent Property Methods" banner at
  // L92 - the third such placement wart in this folder, with
  // [model/entity/PromotionQualifier.cfc:L101-L103] and
  // [model/entity/PromotionReward.cfc:L106-L108].

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
    // to `return 0` and MUST answer 0; [model/entity/Sku.cfc:L269-L273] has no else branch and MUST
    // answer undefined, because substituting 0 there would silently sell products for free.
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
    // THE CENTREPIECE. [model/entity/PriceGroup.cfc:L86-L87] returns immediately on the first
    // match, so the second flagged rate is never reached. Nothing in the schema prevents two global
    // rates on one price group, and the legacy query applies no ORDER BY
    // [model/dao/PriceGroupDAO.cfc], so "collection order" is whatever the repository materialized,
    // which is precisely why the tie-break has to be pinned rather than assumed.
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
    // [model/entity/PriceGroup.cfc:L84] `var rates = getPriceGroupRates();` - the accessor's array,
    // untouched.
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
    // built with TWO globalFlag rates, in a documented collection order.
    const { globalRatePriceGroup, globalRateFirstMatch, globalRateLastMatch } =
      makePriceGroupFixtures();

    expect(globalRatePriceGroup.getPriceGroupRates()).toHaveLength(2);
    expect(globalRateFirstMatch.getGlobalFlag()).toBe(true);
    expect(globalRateLastMatch.getGlobalFlag()).toBe(true);
    expect(globalRatePriceGroup.getGlobalPriceGroupRate()).toBe(globalRateFirstMatch);
  });

  it('answers undefined for the fixture cascade subject, whose four rates are all non-global', () => {
    // `childPriceGroup` is the primary cascade subject and carries membership rates only, so the
    // global level genuinely misses on it - the state that lets the cascade fall through to the
    // parent price group at [model/service/PriceGroupService.cfc:L173-L175].
    const { childPriceGroup } = makePriceGroupFixtures();

    expect(childPriceGroup.getPriceGroupRates()).toHaveLength(4);
    expect(
      childPriceGroup.getPriceGroupRates().every((rate) => rate.getGlobalFlag() === false),
    ).toBe(true);
    expect(childPriceGroup.getGlobalPriceGroupRate()).toBeUndefined();
  });
});

// --- 2. The materialized priceGroupIDPath - BOTH routes, and the D26 divergence -----

describe('PriceGroup priceGroupIDPath - route A, the lazy memoized getter', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L196]: the path memo guards on
  // isNull(variables.priceGroupIDPath), NOT !structKeyExists(...). ProductType.cfc:L251 uses the
  // same isNull idiom for its path while ProductType.cfc:L123 uses !structKeyExists for its options
  // memo -- two different idioms in one file. CFML parity [model/entity/PriceGroup.cfc:L193, L202]:
  // the banner pair delimiting this getter reads "Overridden Implicet Getters" - "Implicet", for
  // "Implicit". Verified by direct search against the source, which also carries the identical
  // misspelling at [model/entity/ProductType.cfc:L248] and :L257.

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
    // The hierarchy is built shallow and ACYCLIC on purpose, which keeps this test about ordering and
    // contents rather than about acyclicity. A cycle is a separate question and is asserted in its own
    // block below: production REFUSES one now - `setParentPriceGroup` will not close a cycle and the
    // shared walk will not produce a path from one - the single documented divergence from the
    // non-ported framework walk, reasoned in full on `buildIdPathList` in
    // src/domain/valueObjects/materializedIdPath.ts.
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
    // Equality against `buildIdPathList` proves the entity delegates rather than reimplements. The
    // accessor pair handed in here is the same pair the private helper supplies: the primary key,
    // and the parent association the legacy string `"parentPriceGroup"` named at
    // [model/entity/PriceGroup.cfc:L197].
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
    // THE ISNULL-VERSUS-STRUCTKEYEXISTS DISTINGUISHING TEST. `isNull('')` is false in CFML, so the
    // empty column is PRESENT and L197 never runs.
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
    // The mirror image of the case above, and together they prove the memo is written on first read
    // rather than at construction.
    const priceGroup = aPriceGroup({ priceGroupID: 'child', priceGroupIDPath: undefined });

    priceGroup.setParentPriceGroup(aPriceGroup({ priceGroupID: 'root' }));

    expect(priceGroup.getPriceGroupIDPath()).toBe('root,child');
  });

  it('keeps the memo INSTANCE-scoped: a second price group never observes the first answer', () => {
    // A2.
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
    // built those columns with the domain own walk, which is why they are root-first and self-last.
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
  // The legacy ORM hooks at [model/entity/PriceGroup.cfc:L206-L214] become EXPLICIT MAINTENANCE
  // METHODS the repository calls on save. CFML parity [model/entity/PriceGroup.cfc:L204, L216,
  // L218, L220]: both are declared under the "Overridden Methods" banner while the "ORM Event
  // Hooks" banner immediately below is LITERALLY EMPTY, so they sit under the wrong heading. Both
  // sibling path entities get this right: [model/entity/Category.cfc:L124-L134] and
  // [model/entity/ProductType.cfc:L303-L315] declare their equivalents inside the ORM Event Hooks
  // banner. CFML parity [model/entity/PriceGroup.cfc:L212]: the statement ends in a DOUBLE
  // SEMICOLON, whose second semicolon is an empty statement and a no-op - the same wart as
  // [model/entity/ProductType.cfc:L311], the only two occurrences in this folder.

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
    // NEVER READS IT - it forwards the whole argument collection to the non-ported base.
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
    // things: it THREW when `!isPersistable()`, and it stamped createdDateTime and modifiedDateTime
    // from `now()`. That split makes the legacy ORDERING actionable: the source assigns the path
    // BEFORE delegating [L207 before L208, L212 before L213], so the repository must call the
    // method below FIRST and run its own validate-and-stamp step AFTER. Contrast
    // [model/entity/Category.cfc:L126-L134], where `super` runs FIRST and the path is assigned
    // SECOND - an ordering divergence that must NOT be normalised, and which
    // [model/entity/ProductType.cfc:L305-L313] matches PriceGroup on. The raw
    // `writeDump(getErrors())` at [org/Hibachi/HibachiEntity.cfc:L605] is never ported.
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
    // [model/entity/PriceGroup.cfc:L207] and :L212, both inside this component's own hooks, so
    // encapsulating it removes nothing a caller used.
    expect(shippedMemberNames()).not.toContain('setPriceGroupIDPath');
  });
});

describe('PriceGroup priceGroupIDPath - D26, the memo versus the persisted value', () => {
  // LEGACY-DEFECT [model/entity/PriceGroup.cfc:L206-L214]: preInsert and preUpdate both call
  // setPriceGroupIDPath(buildIDPathList("parentPriceGroup")) BEFORE super.*, bypassing the lazy
  // getter at L195-L200 -- so the in-memory memo can go stale relative to the persisted value.
  // Preserved deliberately; do not fix without a product decision.
  //
  // [model/entity/PriceGroup.cfc:L212] also ends in a harmless DOUBLE SEMICOLON, `;;`, the same
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

// --- 4. setParentPriceGroup - the D25 guard, verified reproduced ------------

describe('PriceGroup.setParentPriceGroup', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: the body assigns the field at L111 and
  // then appends this group to `arguments.parentPriceGroup.getChildPriceGroups()` at L113 under the
  // L112 guard.

  // LEGACY-DEFECT [model/entity/PriceGroup.cfc:L112]: the guard reads
  //   `isNew() or !parentPriceGroup.hasChildPriceGroup(this)`
  // so on a NEW instance the isNew() short-circuit skips the containment check entirely and a
  // second setParentPriceGroup call appends a duplicate.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // Verified reproduced first-hand in the shipped module before this marker was spent: the ported
  // body is `if (this.isNew() || !parentPriceGroup.hasChildPriceGroup(this))`, disjunct for
  // disjunct. This D25 convention recurs at [model/entity/PriceGroupRate.cfc:L183],
  // [model/entity/PromotionPeriod.cfc:L100], [model/entity/SkuCurrency.cfc:L91],
  // [model/entity/PromotionApplied.cfc:L81], [model/entity/PromotionAccount.cfc:L74] and :L92, and
  // [model/entity/PromotionCode.cfc:L104] - seven further sites, so it is the house idiom rather
  // than a local slip. That does not make it correct; it makes it load-bearing.

  it('assigns the parent reference', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: 'child' });

    priceGroup.setParentPriceGroup(parentPriceGroup);

    expect(priceGroup.getParentPriceGroup()).toBe(parentPriceGroup);
  });

  it('appends this group to the parent live child collection', () => {
    // [model/entity/PriceGroup.cfc:L113] arrayAppend onto the array the parent's own accessor hands
    // back, so the append must be observable through that accessor and not through a copy.
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
    // call anywhere in this body, so a re-parented group is left in its former parent's collection.
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

// --- 5. removeParentPriceGroup - the CLEAN control, and the unconditional clear -----

describe('PriceGroup.removeParentPriceGroup', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L116-L125]: this is a CLEAN control. L120 finds the
  // index in `arguments.parentPriceGroup.getChildPriceGroups()` and L122 deletes from THAT SAME
  // collection - one identifier, used twice, correctly. Contrast
  // [model/entity/PromotionPeriod.cfc:L108-L110], whose L108 searches
  // `arguments.promotion.getPromotionPeriods()` but whose L110 deletes from
  // `arguments.account.getPromotionPeriods()` - a genuine, reachable leak owned by
  // `promotionPeriod.test.ts`.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L107-L183]: the mandatory remove-that-ADDs inversion
  // cross-check was run across every remove* helper this entity SHIPS - removeParentPriceGroup
  // (L116-L125), removeChildPriceGroup (L139-L141), removePriceGroupRate (L147-L149) and
  // removePromotionReward (L179-L181). Contrast [model/entity/Option.cfc:L129-L131] and
  // [model/entity/Option.cfc:L145-L147], where BOTH remove bodies call `addExcludedOption` - real
  // H21 inversions, owned by `option.test.ts`.

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
    // The leak this control rules out would show up as a child removed from some OTHER collection
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
    // [model/entity/PriceGroup.cfc:L117-L119] the `!structKeyExists(arguments, "parentPriceGroup")`
    // fallback, expressed as an explicit `!== undefined` test on an optional parameter.
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
    // The two defects meet here: setParentPriceGroup can append the same unsaved group twice, and a
    // single remove call deletes only the first index it finds.
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const priceGroup = aPriceGroup({ priceGroupID: '' });

    priceGroup.setParentPriceGroup(parentPriceGroup);
    priceGroup.setParentPriceGroup(parentPriceGroup);

    priceGroup.removeParentPriceGroup(parentPriceGroup);

    expect(parentPriceGroup.getChildPriceGroups()).toEqual([priceGroup]);
  });

  it('removes ITSELF from the parent, not whichever unsaved sibling happens to be first', () => {
    // ★★ WHAT `arrayFind(collection, object)` COMPARED, AND WHY THE EMPTY KEY IS NOT ENOUGH.
    // `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] gives EVERY transient price group the
    // same empty primary key, so a search on the key alone reports the first transient child as a
    // match for any transient needle. CFML compared OBJECTS, and Hibernate's collection-contains
    // worked on SESSION IDENTITY - the primary key for a persisted row, and, there being no key,
    // the instance itself for a transient one. The shipped remover therefore falls back to instance
    // identity exactly when both keys are empty, and this case is what proves it: without the
    // fallback, `secondUnsaved.removeParentPriceGroup(...)` would splice out `firstUnsaved`.
    //
    // Distinct from the D25 case above, which pushes the SAME instance twice - there the two
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
    // ★ THE FALLBACK IS SCOPED TO EMPTY KEYS AND NOTHING ELSE. Two instances built from the same
    // stored row must still match, because that is what session identity meant for a persisted row,
    // and because a repository read and a caller-held entity are routinely two objects for one row.
    // Switching the whole comparison to instance identity would break exactly this.
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
    // null, which throws under every engine. The shipped module reproduces the failure rather than
    // returning early, because an early return would ALSO skip the unconditional L124 clear and so
    // would be different behaviour, not the same behaviour by another route. The same unguarded
    // shape appears at [model/entity/ProductType.cfc:L155-L160],
    // [model/entity/Category.cfc:L107-L112] and [model/entity/PriceGroupRate.cfc:L187-L192], which
    // is why it is a parity note and not a numbered defect.
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

// --- 6. Pure far-side delegations - childPriceGroups and priceGroupRates -----

describe('PriceGroup child-collection delegations', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L136-L141]: both bodies are one statement long and
  // neither touches a near-side array. addChildPriceGroup is
  //   `childPriceGroup.setParentPriceGroup( this )`
  // at L137; removeChildPriceGroup is `childPriceGroup.removeParentPriceGroup( this )` at L140.
  // JUDGMENT CALL: delegation is proven BEHAVIOURALLY rather than with a spy.

  it('addChildPriceGroup sets the CHILD parent field, which a near-side push could not do', () => {
    const parentPriceGroup = aPriceGroup({ priceGroupID: 'parent' });
    const childPriceGroup = aPriceGroup({ priceGroupID: 'child' });

    parentPriceGroup.addChildPriceGroup(childPriceGroup);

    expect(childPriceGroup.getParentPriceGroup()).toBe(parentPriceGroup);
    expect(parentPriceGroup.getChildPriceGroups()).toEqual([childPriceGroup]);
  });

  it('addChildPriceGroup inherits the D25 duplicate append for an unsaved child', () => {
    // The decisive delegation proof. A near-side implementation with its own containment check
    // would append once; because the work happens inside `setParentPriceGroup`, the `isNew()`
    // disjunct at [model/entity/PriceGroup.cfc:L112] short-circuits and the child lands twice.
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
    // The second decisive delegation proof. A near-side splice would leave the child still pointing
    // at this parent; the far side's unconditional [model/entity/PriceGroup.cfc:L124] clear does
    // not.
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
    // L136/L139 and the implicit predicate at L112 all spell the capital-C form too. Contrast
    // [model/entity/ProductType.cfc:L65], which declares `singularname="childProductType"`
    // lowercase - the opposite wart.
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
  // L145 and `priceGroupRate.removePriceGroup( this )` at L148. Pure far-side delegation again,
  // into [model/entity/PriceGroupRate.cfc:L181-L186] and :L187-L196, which carry the same D25 guard
  // and the same unconditional clear from the other end of the association. CFML parity
  // [model/entity/PriceGroup.cfc:L64]: `priceGroupRates` is the one collection declared
  // `cascade="all-delete-orphan"`, and it is also the one collection with NO delete gate in
  // [model/validation/PriceGroup.json].

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
    //   `isNew() or !priceGroup.hasPriceGroupRate(this)`
    // so an unsaved rate is appended again on every call.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // Reached only THROUGH this entity's delegating helper, which is the point: the duplicate is
    // observable on `PriceGroup.getPriceGroupRates()` even though PriceGroup contains no append.
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

// --- 7. Promotion-reward delegations - the asymmetric member names, both sides -----

describe('PriceGroup promotion-reward delegations', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L176-L181]: the delegation targets are
  // `addEligiblePriceGroup` and `removeEligiblePriceGroup`, NOT `addPriceGroup`/`removePriceGroup`.
  // The owning side names its collection `eligiblePriceGroups`
  // [model/entity/PromotionReward.cfc:L74], so the asymmetry is in the source and is preserved
  // verbatim. `PriceGroup.promotionRewards` at [model/entity/PriceGroup.cfc:L70] carries
  // `inverse="true"`; the reward's L74 declaration does not, so the reward is the OWNING side.
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
    // [model/entity/PromotionReward.cfc:L158-L165] maintains BOTH ends: it appends to its own
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
    // LEGACY-DEFECT [model/entity/PromotionReward.cfc:L159, L162]: the owning side carries TWO
    // independent D25 guards - L159 tests `eligiblePriceGroup.isNew()` before appending to its own
    // collection, L162 tests `this.isNew()` before appending to the price group's - so an unsaved
    // end duplicates ONE side of the association and leaves the other consistent.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // Verified first-hand, and the verification corrected the expectation: an unsaved GROUP
    // satisfies only the L159 disjunct, so `eligiblePriceGroups` grows to two while
    // `promotionRewards` stays at one - the L162 guard reaches its containment test and blocks.
    // Asserting a symmetric duplicate here would have been an invention, and the whole case is
    // reached through this entity's delegating helper.
    const priceGroup = aPriceGroup({ priceGroupID: '', promotionRewards: [] });
    const promotionReward = aPromotionReward('reward-1');

    priceGroup.addPromotionReward(promotionReward);
    priceGroup.addPromotionReward(promotionReward);

    expect(promotionReward.getEligiblePriceGroups()).toHaveLength(2);
    expect(priceGroup.getPromotionRewards()).toHaveLength(1);
  });

  it('an unsaved REWARD duplicates on this group side only, the exact mirror of the case above', () => {
    // The complement, which is what proves the two guards are independent rather than one guard
    // read twice. Here the L159 disjunct fails and its containment test blocks, while L162's
    // `this.isNew()` short-circuits - so `promotionRewards` grows to two and `eligiblePriceGroups`
    // stays at one.
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

// --- 8. Collections are LIVE arrays, exactly as Hibernate's were ------------

describe('PriceGroup collection accessors', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L113, L121-L123]: the hand-written helpers mutate the
  // arrays that `get*` hands back, so the accessors cannot return defensive copies without breaking
  // the association. CFML parity [model/entity/PriceGroup.cfc:L62, L63, L64, L67, L68, L69, L70]:
  // `type="array"` is declared INCONSISTENTLY across the seven collections - present on L62, L68,
  // L69 and L70, absent on L63, L64 and L67. CFML parity [model/entity/PriceGroup.cfc:L66]: the
  // section comment above the many-to-many block reads
  //   `// Related Object Properties (many-to-many - invers)`
  // with "inverse" misspelled as "invers".

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
    // A2.
    const firstPriceGroup = aPriceGroup({ priceGroupID: 'first' });
    const secondPriceGroup = aPriceGroup({ priceGroupID: 'second' });

    firstPriceGroup.getChildPriceGroups().push(aPriceGroup({ priceGroupID: 'first-child' }));

    expect(firstPriceGroup.getChildPriceGroups()).toHaveLength(1);
    expect(secondPriceGroup.getChildPriceGroups()).toEqual([]);
  });
});

// --- 9. The DROP audit - four collections whose far side is out of scope -----

describe('PriceGroup associations dropped because the far side is out of scope', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L62, L67, L68, L69]: four of the seven collections
  // point at entities this migration slice does not port - `appliedOrderItems` at L62 targets
  // OrderItem, `accounts` at L67 targets Account, `subscriptionBenefits` at L68 and
  // `subscriptionUsageBenefits` at L69 target the subscription module. Their eight bidirectional
  // helpers at L128-L133 and L152-L173 are DROPPED rather than stubbed, and no out-of-scope entity
  // is imported or invented. Three of the seven survive: childPriceGroups (L63), priceGroupRates
  // (L64) and promotionRewards (L70), plus the parentPriceGroup many-to-one at L59.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L67, L68, L69] and
  // [model/dao/PriceGroupDAO.cfc:L52-L100]: the link tables SwAccountPriceGroup,
  // SwSubsBenefitPriceGroup and SwSubsUsageBenefitPriceGroup are preserved verbatim in the record
  // of what was dropped, abbreviations intact, because the untouched CFML monolith still reads and
  // writes them. The one place the target reaches the subscription tables is the account
  // price-group query at PriceGroupDAO.cfc:L52-L100 - read-only, behind a repository port, owned by
  // `tests/integration`.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L168-L173]: addSubscriptionUsageBenefit /
  // removeSubscriptionUsageBenefit take an argument misspelled `subsciptionUsageBenefit`, missing
  // the first "r", at FOUR sites - L168, L169, L171 and L172 - while the METHOD names are spelled
  // correctly. Note the sharp contrast: [model/validation/PriceGroup.json] spells
  // `subscriptionUsageBenefits` CORRECTLY in its delete gate, so one concept is spelled two ways in
  // two files of the same slice.

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

// --- 10. getParentPriceGroupOptions - self-removal, first match, and no 14th port -----

describe('PriceGroup.getParentPriceGroupOptions', () => {
  // Verified first-hand before a single assertion was written: this method DID ship. The prompt
  // left it open, because [model/entity/PriceGroup.cfc:L95] calls
  //   `getPropertyOptions("parentPriceGroup")`
  // which is a Hibachi framework member that is not ported, so a non-port would have been
  // defensible. The shipped module instead relocated the SUPPLY to the repository boundary, as a
  // constructor-injected candidate list, and kept the FILTER, which is the only logic the source
  // actually authored here. So the assertions below pin shipped behaviour rather than documenting
  // an absence.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L94-L103]: the loop walks the candidate list, removes
  // the record whose `['value']` equals this group's own primary key, and stops at the first match
  // via the L99 `break`. The L97 `len(...)` guard comes FIRST and short-circuits, which is what
  // keeps the prepended blank "none" row - the one `hb_optionsNullRBKey="define.none"` at
  // [model/entity/PriceGroup.cfc:L59] puts there - from being deleted for an UNSAVED group whose
  // key is also the empty string.
  //
  // JUDGMENT CALL: no fourteenth port is introduced to satisfy this method.
  // `hibachiUtilityService`, `getPropertyOptions` and every smart list stay unported; the candidate
  // list arrives as inert data on the constructor. The port ledger stays locked at thirteen, and
  // this entity still injects none of them.

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

  it('compares by exact string equality, so a differently-cased value is not removed', () => {
    // CFML parity [model/entity/PriceGroup.cfc:L97]: the legacy `==` on two strings is
    // case-INsensitive, but `generator="uuid"` [model/entity/PriceGroup.cfc:L52] yields one
    // canonical casing per row and both operands come from the same column family, so no case
    // difference can arise in real data.
    const priceGroup = aPriceGroup({
      priceGroupID: 'abc123',
      parentPriceGroupOptionCandidates: [
        { name: 'Upper', value: 'ABC123' },
        { name: 'Exact', value: 'abc123' },
      ],
    });

    expect(priceGroup.getParentPriceGroupOptions()).toEqual([{ name: 'Upper', value: 'ABC123' }]);
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
    // already-filtered array and finds nothing - the same observable answer, reached differently.
    // Contrast [model/entity/ProductType.cfc:L123], which guards on `!structKeyExists(...)` in its
    // OWN body - memoization at a different level in the same folder, and the reason the two idioms
    // must never be conflated.
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
    // A2.
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
    // The one documented divergence in the shipped module is owned by `src/**` and is NOT a
    // divergence this suite spends: the legacy splices the framework's own cache array in place,
    // while the port filters into a new array.
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
    // The negative half of the "no fourteenth port" decision, asserted rather than merely promised.
    const members = shippedMemberNames();

    expect(members).not.toContain('getPropertyOptions');
    expect(members).not.toContain('getPriceGroupOptions');
    expect(members).not.toContain('getPriceGroupSmartList');
    expect(members).not.toContain('getSmartList');
    expect(members).not.toContain('getParentPriceGroupOptionsSmartList');
  });
});

// --- 11. The declarative validation contract - and where it is NOT enforced -----

describe('PriceGroup declarative validation contract', () => {
  // CFML parity [model/validation/PriceGroup.json]: the whole file is twelve lines and carries
  // exactly two save-context rules - `priceGroupName` required and `priceGroupCode` required - plus
  // SIX delete-context `maxCollection: 0` gates, on appliedOrderItems, childPriceGroups, accounts,
  // subscriptionBenefits, subscriptionUsageBenefits and promotionRewards.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L56] and [model/validation/PriceGroup.json]:
  // `priceGroupCode` is REQUIRED BUT NOT UNIQUE - no `unique="true"` on the ORM property and no
  // uniqueness rule in the JSON. `priceGroupRates` has NO delete gate, and that asymmetry is
  // deliberate: it is the one collection declared `cascade="all-delete-orphan"`
  // [model/entity/PriceGroup.cfc:L64], so deleting a price group takes its rates with it rather
  // than being blocked by them.
  //
  // Folder-wide, verified by direct count rather than taken from a summary: fifteen of the
  // twenty-one in-scope entities and process objects have a validation file and six do not:
  // Category, PromotionQualifier, PromotionApplied, PromotionAccount, Product_AddOption and
  // Product_AddOptionGroup. `model/validation/` holds ninety-six .json files in total. The AAP's
  // figure of twelve is stale; source wins.

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
    // The delete gates are declarative, evaluated by the framework's validation service against the
    // collection lengths.
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
    // Five entities in this slice DO carry a method a validation file invokes by name -
    // Sku.hasUniqueOptions, Sku.hasOneOptionPerOptionGroup,
    // RoundingRule.hasExpressionWithListOfNumericValuesOnly,
    // Promotion.getPromotionCodesDeletableFlag and PromotionCode.hasUniquePromotionCode.
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

// --- 12. Zero ports, zero clock, fully synchronous --------------------------

describe('PriceGroup collaborator surface', () => {
  // CFML parity [model/entity/PriceGroup.cfc]: PriceGroup contains ZERO getService() call sites, so
  // every ported method is synchronous and no port is injected. The census that claim rests on was
  // counted directly across the eighteen in-scope entities and totals forty-five sites: Product 18,
  // Sku 19, ProductType 6, OptionGroup 1, RoundingRule 1, and ZERO for the other thirteen,
  // PriceGroup among them.
  //
  // Everything that DOES need a collaborator to reach this data is owned by `tests/unit/services`
  // and is cited here without a word asserted about it: the five-level cascade at
  // [model/service/PriceGroupService.cfc:L140-L181]; the parent-recursion asymmetry at :L174, where
  // the SKU-level step recurses into `getRateForProductBasedOnPriceGroup` rather than the SKU
  // variant; the amount-type asymmetry at :L316-L340, where only `percentageOff` applies the
  // rounding rule; the snapshot loop in `deletePriceGroup` at :L461-L470; and the no-break,
  // LAST-match-wins global-rate step at :L163-L170.

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
    // `getSlatwallScope()` at [model/service/PriceGroupService.cfc:L262-L268] - an inconsistency
    // the port normalises out by passing an explicit context parameter at the SERVICE tier.
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

// --- 13. Structural facts - the primary key, the undefaulted flag, the nullable parent -----

describe('PriceGroup structural facts', () => {
  // CFML parity [model/entity/PriceGroup.cfc:L49]: `entityname="SlatwallPriceGroup"`,
  // `table="SwPriceGroup"`, `persistent=true`, `output=false`, `accessors=true`,
  // `extends="HibachiEntity"`, `cacheuse="transactional"`, `hb_serviceName="priceGroupService"` and
  // `hb_permission="this"`. The physical table name is preserved verbatim under C5, as are the four
  // many-to-many link tables the source declares - SwAccountPriceGroup [L67],
  // SwSubsBenefitPriceGroup [L68], SwSubsUsageBenefitPriceGroup [L69] and the abbreviated
  // SwPromoRewardEligiblePriceGrp [L70].

  it('reports isNew() honestly from the empty-string primary key', () => {
    // [model/entity/PriceGroup.cfc:L52] `unsavedvalue="" default=""`. The framework's own
    // `getNewFlag` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is literally
    // `if(getPrimaryIDValue() == "") { return true; } return false;`, so this is the whole test.
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
    // the COLUMN at [model/entity/PriceGroup.cfc:L54] carries NO `default=` - that part is right -
    // but the shipped ACCESSOR is `boolean`, not `boolean | undefined`.
    expect(aPriceGroup({ activeFlag: undefined }).getActiveFlag()).toBe(false);
    expect(aPriceGroup({ activeFlag: null }).getActiveFlag()).toBe(false);
  });

  it('is NOT one of the six boolean columns that DO carry a default in this slice', () => {
    // Counted directly across the eighteen in-scope entities: `default="1"` twice
    // ([model/entity/Sku.cfc:L53], [model/entity/Promotion.cfc:L56]), `default="0"` twice as a
    // boolean ([model/entity/Sku.cfc:L59], [model/entity/OptionGroup.cfc:L57]) and
    // `default="false"` twice ([model/entity/Product.cfc:L58],
    // [model/entity/PriceGroupRate.cfc:L53]) - six sites over three literals, and
    // PriceGroup.activeFlag is none of them.
    const priceGroupRateWithDeclaredDefault = new PriceGroupRate({ priceGroupRateID: 'rate-1' });

    expect(priceGroupRateWithDeclaredDefault.getGlobalFlag()).toBe(false);
    expect(aPriceGroup().getActiveFlag()).toBe(false);
  });

  it('routes the activeFlag through the CFML coercion boundary for every driver form', () => {
    // BOUNDARY: the full coercion table, covering every literal, numeric string and raising case,
    // is owned by `tests/unit/lib/cfml`, and this file may not import from `src/lib/**` at all.
    // What is asserted here is this entity's own narrower business: that an undefaulted
    // `ormtype="boolean"` column is READ THROUGH that boundary rather than compared with `===` to a
    // hardcoded literal.
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
    // [model/entity/PriceGroup.cfc:L59] `hb_optionsNullRBKey="define.none"` is the declaration that
    // makes the parent genuinely optional - the admin form offers a "none" row for it.
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
    // Verified by direct count: `remoteID` appears ZERO times in [model/entity/PriceGroup.cfc]. Its
    // own child declares one at [model/entity/PriceGroupRate.cfc:L58], as do
    // [model/entity/PromotionReward.cfc:L93], [model/entity/PromotionQualifier.cfc:L90] and
    // [model/entity/Category.cfc:L73] among others.
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
    // [meta/tests/unit/entity/BrandTest.cfc] asserts that `getProducts()` answers an empty array.
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

// --- 14. Framework members deliberately NOT ported, and the empty banner pairs -----

describe('PriceGroup framework surface deliberately not ported', () => {
  // ANNOTATE, NEVER NORMALISE. Four banner pairs in [model/entity/PriceGroup.cfc] are literally
  // empty - "Custom Validation Methods" at L185/L187, "Custom Formatting Methods" at L189/L191,
  // "ORM Event Hooks" at L218/L220 and "Deprecated Methods" at L222/L224 - and the port neither
  // fills them nor deletes them from the record. THE STRUCTURAL WART THAT MATTERS MOST: the two
  // lifecycle hooks live under "Overridden Methods" (L204/L216) while the "ORM Event Hooks" banner
  // (L218/L220) that should hold them is EMPTY. Contrast [model/entity/ProductType.cfc:L303-L315],
  // whose ORM Event Hooks banner DOES contain its hooks, and [model/entity/Category.cfc:L120-L134],
  // whose "Overridden Methods" block is empty and whose hooks also sit under the correct banner.
  // Misfiling a comment is not a behaviour, so nothing is moved.
  //
  // [model/entity/PriceGroup.cfc:L193, L202]: the banner pair around the path getter is misspelled.
  // Re-verified by grep because the folder carries more than one misspelling of the same word:
  // PriceGroup.cfc:L193 and :L202 read "Overridden Implicet Getters", and
  // [model/entity/ProductType.cfc:L248] and :L257 read "Implicet" too.

  it('exposes no dynamic getter dispatch, so an unknown accessor simply does not exist', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: `PriceGroup` does not declare
    // `attributeValues`, so an unknown `getX()` reaches the framework's `onMissingMethod`
    // dispatcher and THROWS - it is one of the fourteen throwing entities, against the four silent
    // ones ([model/entity/Sku.cfc:L70], [model/entity/Product.cfc:L75],
    // [model/entity/ProductType.cfc:L67], [model/entity/Brand.cfc:L60]).
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
    // Contrast its own child [model/entity/PriceGroupRate.cfc:L270-L272], which DOES override the
    // property-name hook and returns the capital-D `"DisplayName"`.
    const priceGroup = aPriceGroup({ priceGroupName: 'Wholesale' });
    const members = shippedMemberNames();

    expect(members).not.toContain('getSimpleRepresentation');
    expect(members).not.toContain('getSimpleRepresentationPropertyName');
    expect('getSimpleRepresentation' in priceGroup).toBe(false);
  });

  it('carries no validation gate and no error dump in its lifecycle hooks', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L598-L619]: the framework's own `preInsert` throws
    // when `!isPersistable()` and stamps created/modified from `now()`. Neither half is inherited
    // here, and the raw `writeDump(getErrors())` at [org/Hibachi/HibachiEntity.cfc:L605] is
    // emphatically NOT ported - dumping entity errors to the response stream has no place in a
    // Lambda handler's output. The observable consequence is asserted: the hook runs to completion
    // on an entity that would have failed every save-context rule in
    // [model/validation/PriceGroup.json].
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

// --- 15. Request-scoped state - freshness, isolation, and no shared memo -----

describe('PriceGroup instance isolation and fixture freshness', () => {
  // A2. The legacy component-level caches that motivated the rule are elsewhere:
  // [model/dao/SkuDAO.cfc:L204-L220], whose clear method's condition is inverted so it can never
  // fire at [model/dao/SkuDAO.cfc:L222-L226], and [model/service/RoundingRuleService.cfc:L67-L77].
  // The hazard is the same one and it is sharper on a warm Lambda container, where module state
  // outlives an unrelated request.

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
    // The sharpest form of the rule: two groups with the SAME primary key and DIFFERENT parents.
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
    // Every business-date literal in this file is an explicit UTC ISO-8601 string, and the round
    // trip is asserted rather than assumed so the audit-column assertions cannot become
    // host-dependent.
    const createdDateTime = new Date('2024-06-01T00:00:00.000Z');
    const modifiedDateTime = new Date('2024-06-15T12:30:00.000Z');
    const priceGroup = aPriceGroup({ createdDateTime, modifiedDateTime });

    expect(createdDateTime.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(modifiedDateTime.toISOString()).toBe('2024-06-15T12:30:00.000Z');
    expect(priceGroup.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(priceGroup.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:00.000Z');
  });
});

// ===========================================================================
// A CYCLIC PARENT CHAIN IS ACCEPTED, EXACTLY AS THE LEGACY SETTER ACCEPTS ONE
//
// NET-NEW coverage - `meta/tests/` holds no PriceGroup test - pinning legacy PARITY rather than a divergence.
// The legacy setter at [model/entity/PriceGroup.cfc:L110-L115] validates nothing before assigning, and the
// legacy walk at [org/Hibachi/HibachiEntity.cfc:L314-L321] carries no visited set
// and no bound. Both are reproduced: this setter assigns whatever it is handed,
// and a looping chain climbs forever here exactly as it climbs forever there.
//
// ★ THIS BLOCK ONCE ASSERTED THE OPPOSITE, AND THE RECORD BELONGS HERE. It ran
// under the heading "CYCLIC PARENT CHAINS ARE REFUSED, NOT FOLLOWED" and pinned a
// throw from `setParentPriceGroup` plus a `CyclicIdPathError` from the shared walk. Both
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
// ===========================================================================

describe('PriceGroup - a cyclic parent chain is accepted, per legacy parity', () => {
  it('accepts a price group as its own parent', () => {
    const subject = aPriceGroup({ priceGroupID: 'pg-self' });

    // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: no validation precedes
    // the assignment, so the self-reference is simply stored.
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
    // The far-side append is the ONLY thing the legacy body guards
    // [model/entity/PriceGroup.cfc:L112], and it is guarded on membership rather
    // than on acyclicity - so a cycle-closing assignment appends like any other.
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
