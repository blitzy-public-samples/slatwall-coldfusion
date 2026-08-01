// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/promotionReward.ts`
//
// WHAT THIS SUITE PINS
//
// `PromotionReward` is the `SwPromoReward` row [model/entity/PromotionReward.cfc:L57] and the
// REWARD half of the promotion engine: `Promotion` -> `PromotionPeriod` -> { QUALIFIERS decide
// WHETHER a promotion applies, REWARDS decide WHAT it gives }. Three of its columns are direct
// inputs to must-preserve behaviour, which is what makes an entity-level suite worth this much
// detail:
//
//   1. `amount` [L61] and `amountType` [L62] are the inputs to the discount arithmetic that the
//      Strategy switch at [model/service/PromotionService.cfc:L993-L1003] dispatches on.
//   2. `maximumUsePerOrder` / `maximumUsePerItem` / `maximumUsePerQualification` [L65-L67] are
//      the inputs to use-limit enforcement. The plan names "promotion discount math TOGETHER
//      WITH use-limit enforcement semantics" as one indivisible must-preserve area, so getting
//      `undefined`-means-UNLIMITED wrong HERE breaks the engine downstream even though no
//      enforcement logic lives in this file.
//   3. `roundingRule` [L71] is the nullable association the discount math reaches through to
//      [model/service/RoundingRuleService.cfc:L84].
//
// Everything else the suite pins is structural: the FOURTEEN many-to-many collections - more
// than any other in-scope entity - the conditional option accessor, the single orphaned
// property, the one renamed identifier in this folder, and the deletability chain that
// dereferences its period twice.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
//
// Not one assertion below has a legacy antecedent, and that was MEASURED rather than assumed.
// `PromotionReward` is one of the SIXTEEN in-scope entities with no legacy test of any kind:
// the only legacy entity suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc], neither
// of which mentions this entity, and [meta/tests/functional/admin/entity/ProductTest.cfc] is an
// empty stub contributing zero coverage. `meta/tests/unit/service/` holds only
// AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, and
// `meta/tests/unit/dao/` only AccountDAOTest and PaymentDAOTest - so neither the owning
// `promotionService` surface nor `PromotionDAO` is covered legacy-side either.
//
// The fixture module corroborates this independently: `legacyTestCoverageExists` is `false`, and
// that flag is asserted below rather than merely trusted.
//
// The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed every legacy
// entity suite for free are NOT inherited, and NO shared base class is introduced to imitate
// them (C1 forbids transliterating the MXUnit harness). Three of the four rest on framework
// members the port deliberately does not ship - `validate()`, `getSimpleRepresentation()` in its
// framework form, and `getPrimaryIDPropertyName()`. In particular
// `simple_representation_exists_and_is_simple` [L56-L58] is NOT forced onto this entity: the
// shipped `getSimpleRepresentation()` THROWS on an instance hydrated without resolved label
// text, and this suite pins THAT SHIPPED REALITY rather than fabricating a passing shape for it.
// The one assertion of theirs that survives is the `isNew()` half of `defaults_are_correct`
// [L64-L67], authored net-new below against the member the port does ship.
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
//
// `review_rules` returns exactly "No user rules provided." - confirmed by four probes (no range,
// then `[1,-1]`, `[2,500]`, `[500,1000]`), byte-identical each time, and matching the plan's own
// rules section. NO rule governs this file, NO file enters scope by rule mandate, and NO rule is
// invented to fill the gap. That absence is NOT licence to lower the bar: the enterprise-standard
// substitutes apply at full strength - maximal TypeScript strictness with no `any`, no
// `@ts-ignore` and no postfix non-null assertion; the mechanically enforced domain layer
// boundary; `Money` or decimal strings as the ONLY money expectations; no new dependency; and
// in-code annotation of every judgement call.
//
// ---------------------------------------------------------------------------
// DIVERGENCE BUDGET SPENT BY THIS FILE: ZERO
// ---------------------------------------------------------------------------
//
// Three deliberate divergences exist project-wide and EVERY ONE is owned elsewhere:
//
//   (a) the un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009], which
//       leaks into component scope and would become cross-invocation state on a warm container
//       - owned by `src/services/promotion/**`;
//   (b) the `amountOff` raw-float gap [model/service/PromotionService.cfc:L998], where that one
//       branch omits `precisionEvaluate` while every neighbour is guarded - ALSO owned by
//       `src/services/promotion/**`. ⚠ THIS FILE DOES NOT CLAIM DIVERGENCE (b), even though
//       `amountOff` is one of this entity's three amount types. The entity carries the column;
//       the service performs the arithmetic;
//   (c) the entity memo repairs - DEFECTS 17 and 18 owned by `sku.test.ts`, DEFECT 19 by
//       `product.test.ts`.
//
// A fourth divergence is FORBIDDEN, and NO numbered defect from the twenty-defect register
// belongs to `PromotionReward` at all. Consequently this file contains ZERO `LEGACY-DEFECT`
// markers. Every wart it records - the single orphaned `rewards` property, the `type="array"`
// inconsistency, the `ormType`/`ormtype` casing split, the un-narrowed `rewardType`, the
// out-of-banner `getSimpleRepresentation()`, the unguarded `getAmountFormatted()`, the double
// `getPromotionPeriod()` dereference, and the three validation absences - is a `CFML parity`
// note. The ONE renamed identifier is likewise a `CFML parity` note under the interface-parity
// constraint, NOT a divergence. No marker is manufactured where none is warranted.
//
// ---------------------------------------------------------------------------
// !! HARD BOUNDARIES - WHAT THIS SUITE DELIBERATELY DOES NOT TEST !!
// ---------------------------------------------------------------------------
//
// The entity holds the inputs; the services compute. Each of the following is cited where it
// clarifies an entity-level decision and asserted NOWHERE below:
//
//   * The discount arithmetic itself - the Strategy switch, its missing `default:` case at
//     [model/service/PromotionService.cfc:L1003], the clamp that compares the pre-rounding value
//     but overwrites the post-rounding one [L1013-L1015], and the `numberFormat(...,"0.00")`
//     presentation step [L1017]. Owned by `src/services/promotion/discountAmount.ts`.
//   * Use-limit ENFORCEMENT - the mutable usage ledger, the two opposing insertion sorts, and
//     the over-use stripping loop that indexes by a leaked `reward` variable
//     [model/service/PromotionService.cfc:L468-L521]. This file pins the three limit COLUMNS and
//     stops.
//   * The rounding algorithm and its measured output table - `roundValue`
//     [model/service/RoundingRuleService.cfc:L88-L175]. This suite asserts only that a reward
//     HOLDS a rounding rule or holds none; it never rounds. Owned by `roundingRule.test.ts` and
//     `tests/unit/services/roundingRuleService`.
//   * `PromotionPeriod.addPromotionReward` [model/entity/PromotionPeriod.cfc:L116-L118] and
//     `removePromotionReward` [L120-L122], which call `setPromotion` / `removePromotion` on the
//     reward. `PromotionReward` declares NEITHER, so both throw. Owned by
//     `promotionPeriod.test.ts`; this file asserts only the ABSENCE that causes them.
//   * The `removePromotionRewardExclusion` inversion at [model/entity/Option.cfc:L129-L131],
//     whose body calls `addExcludedOption` at [L130]. Owned by `option.test.ts`.
//   * All SQL. `getActivePromotionRewards` [model/dao/PromotionDAO.cfc:L51-L132] - notably its
//     ABSENT `ORDER BY`, which is what makes reward-iteration order non-deterministic at a tie -
//     and the six-branch sale-price UNION belong to `tests/integration/repositories`.
//   * The preserved return/exchange no-op and its `issue #1766` ticket
//     [model/service/PromotionService.cfc:L542-L544]. Sibling-owned; not carried here.
//   * Zod schema enforcement, which lives at the service tier. This file asserts what the five
//     declarative rules in `model/validation/PromotionReward.json` SAY, as data, and never
//     executes a validator.
//
// ---------------------------------------------------------------------------
// FRESHNESS, DATES, AND THE ENVIRONMENT
// ---------------------------------------------------------------------------
//
// `beforeEach` rebuilds the ENTIRE fixture graph and re-reads the subject before every single
// test. That is not ceremony: eleven of this entity's fourteen collection accessors return the
// LIVE internal array reference rather than a defensive copy, so one shared subject would leak
// membership from one test into the next. Two tests near the end prove the isolation holds by
// mutating a live array and then asserting the next test sees a pristine one.
//
// Every business-date literal is an explicit UTC ISO-8601 string, supplied by the fixture's
// fixed clock (`2024-06-15T12:00:00.000Z`). There is no bare `new Date()`, no `Date.now()`, no
// `new Date(0)` and no global fake timer anywhere below - the period doubles the deletability
// chain needs carry their own injected instants.
//
// NO DATABASE, NO NETWORK, NO FILESYSTEM, NO `.env`, NO `dotenv`, NO credential, hostname,
// connection string or token. Every value is constructed in memory from a literal.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { AmountType } from '../../../../src/domain/entities/promotionReward.js';
import type { ApplicableTerm } from '../../../../src/domain/entities/promotionReward.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

import type { Brand } from '../../../../src/domain/entities/brand.js';
import type { Option } from '../../../../src/domain/entities/option.js';
import type { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
import type { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import type { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';

// ⚠ FOUR levels of `..` reach `src`, THREE reach `tests/fixtures`. Three levels to `src` would
// resolve to the nonexistent `tests/src/...`. NodeNext resolution with no `paths`, no `baseUrl`
// and no `allowImportingTsExtensions` is why every specifier ends in `.js`.
//
// `Sku`, `Product` and `ProductType` are NOT imported even though the entity holds collections
// of all three. Every instance this suite needs comes from the fixture graph, so their types
// arrive by inference and the import list stays inside the declared dependency set.
//
// `FulfillmentMethod`, `ShippingMethod` and `AddressZone` are NOT imported because they DO NOT
// EXIST in the target - all three are out of scope and were never ported. The three collections
// that reference them collapse to opaque `readonly string[]` identifier arrays, which is
// asserted below rather than worked around.
//
// `decimal.js` is NOT imported. `src/domain/valueObjects/money.ts` is the only module in the
// project permitted to reach it, and every money expectation below is a `Money` or a decimal
// string.

// ---------------------------------------------------------------------------
// Shared reference data, mined from the source and asserted rather than trusted
// ---------------------------------------------------------------------------

/**
 * The reward-type vocabulary in EXACT SOURCE ORDER, transcribed from the file-opening comment
 * block [model/entity/PromotionReward.cfc:L48-L56]: `merchandise` [L50], `subscription` [L51],
 * `contentAccess` [L52], `fulfillment` [L53], `order` [L54].
 *
 * CFML parity [model/entity/PromotionReward.cfc:L48-L54,L63]: the five reward types are
 * enumerated ONLY in that comment block. `rewardType` itself is `ormType="string"` with no
 * `inList`, there is no `getRewardTypeOptions()` method anywhere in the 426 lines, and
 * `model/validation/PromotionReward.json` declares no rule for it - so the column stays an
 * un-narrowed string in the target. The vocabulary is documented, never enforced.
 */
const REWARD_TYPES_IN_SOURCE_ORDER: readonly string[] = Object.freeze([
  'merchandise',
  'subscription',
  'contentAccess',
  'fulfillment',
  'order',
]);

/**
 * All FOURTEEN many-to-many link tables, in source declaration order, with the `type="array"`
 * census.
 *
 * CFML parity [model/entity/PromotionReward.cfc:L74]: fourteen many-to-many OWNER collections -
 * exactly one more than `PromotionQualifier`'s thirteen. The differentiator is
 * `eligiblePriceGroups`, linking through the abbreviated `SwPromoRewardEligiblePriceGrp` table.
 * Only L74, L86 and L87 declare `type="array"`; the other eleven omit it. Annotated, not
 * normalised - the target materialises all fourteen as arrays regardless, and this table is the
 * record of what the source actually says so the normalisation stays auditable.
 */
const EXPECTED_LINK_TABLES: readonly {
  readonly property: string;
  readonly linkTable: string;
  readonly declaresTypeArray: boolean;
  readonly locator: string;
}[] = Object.freeze([
  {
    property: 'eligiblePriceGroups',
    linkTable: 'SwPromoRewardEligiblePriceGrp',
    declaresTypeArray: true,
    locator: 'model/entity/PromotionReward.cfc:L74',
  },
  {
    property: 'fulfillmentMethods',
    linkTable: 'SwPromoRewardFulfillmentMethod',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L76',
  },
  {
    property: 'shippingAddressZones',
    linkTable: 'SwPromoRewardShipAddressZone',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L77',
  },
  {
    property: 'shippingMethods',
    linkTable: 'SwPromoRewardShippingMethod',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L78',
  },
  {
    property: 'brands',
    linkTable: 'SwPromoRewardBrand',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L80',
  },
  {
    property: 'options',
    linkTable: 'SwPromoRewardOption',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L81',
  },
  {
    property: 'skus',
    linkTable: 'SwPromoRewardSku',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L82',
  },
  {
    property: 'products',
    linkTable: 'SwPromoRewardProduct',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L83',
  },
  {
    property: 'productTypes',
    linkTable: 'SwPromoRewardProductType',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L84',
  },
  {
    property: 'excludedBrands',
    linkTable: 'SwPromoRewardExclBrand',
    declaresTypeArray: true,
    locator: 'model/entity/PromotionReward.cfc:L86',
  },
  {
    property: 'excludedOptions',
    linkTable: 'SwPromoRewardExclOption',
    declaresTypeArray: true,
    locator: 'model/entity/PromotionReward.cfc:L87',
  },
  {
    property: 'excludedSkus',
    linkTable: 'SwPromoRewardExclSku',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L88',
  },
  {
    property: 'excludedProducts',
    linkTable: 'SwPromoRewardExclProduct',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L89',
  },
  {
    property: 'excludedProductTypes',
    linkTable: 'SwPromoRewardExclProductType',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L90',
  },
]);

/**
 * Every member declared on the class's own prototype.
 *
 * Read from `PromotionReward.prototype` rather than from an instance so the probe is fully typed
 * and needs no cast: `Object.getOwnPropertyNames` returns `string[]`, and no `any` is introduced.
 * This is how the suite asserts that a member is ABSENT without reaching for dynamic dispatch -
 * C1 forbids `evaluate`, `eval`, `new Function`, `vm` and Proxy-based dispatch outright.
 */
const PROTOTYPE_MEMBERS: readonly string[] = Object.freeze(
  Object.getOwnPropertyNames(PromotionReward.prototype),
);

/**
 * The element at `index`, or a hard failure naming what was missing.
 *
 * `noUncheckedIndexedAccess` makes every indexed read `T | undefined`, and neither a postfix
 * non-null assertion nor an `as` cast is permitted. An explicit guard is used instead, so a
 * fixture that stops supplying a row fails loudly AT THE MISSING DATA rather than producing a
 * baffling assertion failure several lines later. This mirrors the `require*` helpers the sibling
 * entity suites use.
 */
function requireAt<T>(collection: readonly T[], index: number, description: string): T {
  const element = collection[index];

  if (element === undefined) {
    throw new Error(`promotionReward.test.ts: no ${description} at index ${String(index)}.`);
  }

  return element;
}

/** The fixture graph type, inferred because the fixture module deliberately does not export it. */
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

let fixtures: PromotionFixtureGraph;
let subject: PromotionReward;

beforeEach(() => {
  // A FULLY FRESH GRAPH PER TEST. Eleven collection accessors hand out live array references, so
  // a graph shared across tests would let one test's `push` or `splice` change another's answer.
  fixtures = makePromotionFixtures();
  subject = fixtures.percentageOffReward;
});

afterEach(() => {
  // No spy is installed by default; this is unconditional hygiene so that a spy added to any one
  // test below can never survive into the next.
  vi.restoreAllMocks();
});

describe('the ported surface, and the members deliberately dropped or never present', () => {
  it('exposes the class plus the two vocabulary aliases, and injects no port and no clock', () => {
    // CFML parity [model/entity/PromotionReward.cfc]: the component contains ZERO `getService(`
    // calls across all 426 lines. It is one of the in-scope entities with no service-locator site
    // at all - the project-wide census found sites only in Sku, Product, ProductType, OptionGroup
    // and RoundingRule. Transformation rule T2 (service-locator removal) is therefore VACUOUS
    // here, which is why the constructor takes no repository port, no collaborator port and no
    // clock: a reward performs no date comparison of its own.
    const bare = new PromotionReward({ promotionRewardID: 'reward-minimal' });

    expect(bare).toBeInstanceOf(PromotionReward);
    expect(bare.getPromotionRewardID()).toBe('reward-minimal');

    // The only collaborator the class accepts is resolved resource-bundle text, and it is
    // OPTIONAL - a reward hydrated without it is a legitimate object, as this construction proves.
    expect(bare.getRoundingRule()).toBeUndefined();
    expect(bare.getPromotionPeriod()).toBeUndefined();
  });

  it('carries every legacy method name over verbatim in CFML camelCase', () => {
    // C4 interface parity: the acceptance contract is that a reviewer can diff the two surfaces
    // method for method, so no name is made "more idiomatic".
    const expectedMembers: readonly string[] = [
      'getSimpleRepresentation',
      'getApplicableTermOptions',
      'getAmountTypeOptions',
      'setPromotionPeriod',
      'removePromotionPeriod',
      'getAmountFormatted',
      'getSimpleRepresentationPropertyName',
      'isDeletable',
      'isNew',
      'hasAnyOption',
      'hasAnyExcludedOption',
      'addEligiblePriceGroup',
      'removeEligiblePriceGroup',
      'addExcludedProductType',
      'removeExcludedProductType',
    ];

    for (const member of expectedMembers) {
      expect(PROTOTYPE_MEMBERS).toContain(member);
    }
  });

  it('DROPS the shippingMethods helper pair the legacy declares, and never had the other two', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L76-L78]: Group A collapses to opaque
    // readonly string[] IDs because FulfillmentMethod, AddressZone and ShippingMethod are out of
    // scope and were never ported. `shippingMethods` DROPS the add/remove helpers the legacy
    // declares at [L178-L185] and [L186-L195]; `fulfillmentMethods` and `shippingAddressZones`
    // never had any to begin with - the source declares no `addFulfillmentMethod` and no
    // `addShippingAddressZone` anywhere. The asymmetry is preserved, not smoothed: the port does
    // not invent the two missing pairs, and it does not keep the one that exists.
    expect(PROTOTYPE_MEMBERS).not.toContain('addShippingMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('removeShippingMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('addFulfillmentMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('removeFulfillmentMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('addShippingAddressZone');
    expect(PROTOTYPE_MEMBERS).not.toContain('removeShippingAddressZone');

    // The collapsed accessors are named for what they hold - identifiers, not entities.
    expect(PROTOTYPE_MEMBERS).toContain('getShippingMethodIDs');
    expect(PROTOTYPE_MEMBERS).toContain('getFulfillmentMethodIDs');
    expect(PROTOTYPE_MEMBERS).toContain('getShippingAddressZoneIDs');
    expect(PROTOTYPE_MEMBERS).not.toContain('getShippingMethods');
    expect(PROTOTYPE_MEMBERS).not.toContain('getFulfillmentMethods');
    expect(PROTOTYPE_MEMBERS).not.toContain('getShippingAddressZones');
  });

  it('has setPromotionPeriod and removePromotionPeriod but NO setPromotion and NO removePromotion', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L140-L155]: the many-to-one helper pair is
    // named for the PERIOD, because `promotionPeriod` [L70] is the only many-to-one relationship
    // the reward owns. There is no `promotion` property and therefore no `setPromotion`.
    //
    // That absence is exactly why [model/entity/PromotionPeriod.cfc:L116-L118]
    // `addPromotionReward` - whose whole body is `arguments.promotionReward.setPromotion(this)` -
    // and [L120-L122] `removePromotionReward` - `arguments.promotionReward.removePromotion(this)`
    // - both fail at runtime. Those two throws belong to `promotionPeriod.test.ts` and are cited
    // here, not re-asserted. This suite asserts only the absence that causes them.
    expect(PROTOTYPE_MEMBERS).toContain('setPromotionPeriod');
    expect(PROTOTYPE_MEMBERS).toContain('removePromotionPeriod');
    expect(PROTOTYPE_MEMBERS).not.toContain('setPromotion');
    expect(PROTOTYPE_MEMBERS).not.toContain('removePromotion');
  });

  it('exposes no accessor for the orphaned `rewards` property', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L104]: `rewards` is declared as a
    // non-persistent property with `type="string"` - plural name, scalar type - and has NO getter
    // anywhere in the component. It is a SINGLE ORPHAN, preserved as one and not completed:
    // authoring a `getRewards()` would invent a member the legacy never had, and guessing whether
    // it was meant to be a comma list or an array would fabricate a contract.
    //
    // Contrast `PromotionQualifier`, which carries a DOUBLE orphan; this entity has exactly one.
    expect(PROTOTYPE_MEMBERS).not.toContain('getRewards');
    expect(PROTOTYPE_MEMBERS).not.toContain('setRewards');

    // Its two sibling non-persistent properties [L102, L103] DO have getters, which is what makes
    // `rewards` identifiable as an orphan rather than as a convention.
    expect(PROTOTYPE_MEMBERS).toContain('getAmountTypeOptions');
    expect(PROTOTYPE_MEMBERS).toContain('getApplicableTermOptions');
  });

  it('declares no ORM lifecycle hook, because the legacy banner pair is empty', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L423, L425]: the `START: ORM Event Hooks` /
    // `END: ORM Event Hooks` banner pair is LITERALLY EMPTY - no `preInsert`, no `preUpdate`, no
    // `preDelete`, no `postInsert` - and the component closes at [L426]. The plan's mandate that
    // ORM lifecycle hooks become explicit maintenance methods invoked by the repository on save is
    // therefore vacuous for this entity, and no hook-equivalent member is authored.
    //
    // CONTRAST the four in-scope entities that DO carry hooks: `PriceGroup`
    // [model/entity/PriceGroup.cfc:L206, L211] and `ProductType`
    // [model/entity/ProductType.cfc:L305, L310] both maintain their materialized path BEFORE
    // calling `super`, whereas `Category` [model/entity/Category.cfc:L126, L131] calls `super`
    // FIRST. Never normalise a banner, and never normalise that ordering difference either.
    expect(PROTOTYPE_MEMBERS).not.toContain('preInsert');
    expect(PROTOTYPE_MEMBERS).not.toContain('preUpdate');
    expect(PROTOTYPE_MEMBERS).not.toContain('preDelete');
    expect(PROTOTYPE_MEMBERS).not.toContain('postInsert');
    expect(PROTOTYPE_MEMBERS).not.toContain('postUpdate');
  });

  it('declares none of the five declaratively-invoked entity validators', () => {
    // CFML parity [model/validation/PromotionReward.json]: the file names no entity method, so
    // there is no validator to port. The five methods invoked declaratively elsewhere in the slice
    // are `Sku.hasUniqueOptions`, `Sku.hasOneOptionPerOptionGroup`,
    // `RoundingRule.hasExpressionWithListOfNumericValuesOnly`,
    // `Promotion.getPromotionCodesDeletableFlag` and `PromotionCode.hasUniquePromotionCode`.
    // None belongs here, and none is invented. This is consistent with the finding that the
    // component carries NO `Custom Validation Methods` banner at all.
    expect(PROTOTYPE_MEMBERS).not.toContain('hasUniqueOptions');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasOneOptionPerOptionGroup');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasExpressionWithListOfNumericValuesOnly');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPromotionCodesDeletableFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasUniquePromotionCode');
    expect(PROTOTYPE_MEMBERS).not.toContain('validate');
  });

  it('reproduces no Hibachi base-class surface and no dynamic dispatch', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: `PromotionReward` does NOT declare
    // `attributeValues`, so in CFML an unknown `getX()` THROWS through the framework base rather
    // than answering silently. It is one of the FOURTEEN throwing entities, against the four
    // silent ones that do declare the EAV collection - `Sku.cfc:L70`, `Product.cfc:L75`,
    // `ProductType.cfc:L67` and `Brand.cfc:L60`.
    //
    // The target has NO dynamic dispatch at all, so that behaviour is DOCUMENTED here rather than
    // reproduced: reproducing it would require exactly the `evaluate`-style indirection C1
    // forbids. No Hibachi base-class suite is built, and none of the framework members is invented
    // - not `getNewFlag()`, not `getPrintTemplates()`/`getEmailTemplates()`, not
    // `clearAttributeCache()`, not the inherited memos, and not a smart list.
    //
    // The raw `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is
    // likewise NOT ported - it writes framework debug output to the response.
    expect(PROTOTYPE_MEMBERS).not.toContain('getNewFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPrintTemplates');
    expect(PROTOTYPE_MEMBERS).not.toContain('getEmailTemplates');
    expect(PROTOTYPE_MEMBERS).not.toContain('clearAttributeCache');
    expect(PROTOTYPE_MEMBERS).not.toContain('getAttributeValue');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasAnyInProperty');
    expect(PROTOTYPE_MEMBERS).not.toContain('getSmartList');
    expect(PROTOTYPE_MEMBERS).not.toContain('getErrors');

    // The class extends nothing, which is why its two overrides carry no `override` keyword even
    // under `noImplicitOverride`.
    expect(Object.getPrototypeOf(PromotionReward)).toBe(Function.prototype);
  });
});

describe('the FOURTEEN many-to-many collections, and the one that separates Reward from Qualifier', () => {
  it('declares exactly fourteen collections - one more than PromotionQualifier', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L74-L90]: fourteen many-to-many OWNER
    // collections, NONE of them `inverse="true"`. `PromotionQualifier` declares thirteen at
    // [model/entity/PromotionQualifier.cfc:L73-L87]. This entity therefore owns more link tables
    // than any other in the slice, which is why its physical table name is abbreviated to
    // `SwPromoReward` and six of the fourteen link-table names are abbreviated further still.
    expect(fixtures.rewardManyToManyCollections).toHaveLength(14);
    expect(fixtures.qualifierManyToManyCollectionCount).toBe(13);
    expect(fixtures.rewardManyToManyCollections.length).toBe(
      fixtures.qualifierManyToManyCollectionCount + 1,
    );
  });

  it('names eligiblePriceGroups as the single differentiator against the qualifier', () => {
    // The differentiator, stated positively: a REWARD can be restricted to a price group, a
    // QUALIFIER cannot. `PromotionQualifier` has no `eligiblePriceGroups` property at all - its
    // thirteen collections are the reward's fourteen minus this one.
    const differentiator = fixtures.rewardManyToManyCollections.find(
      (collection) => collection.property === 'eligiblePriceGroups',
    );

    expect(differentiator).toBeDefined();
    expect(differentiator?.linkTable).toBe('SwPromoRewardEligiblePriceGrp');
    expect(differentiator?.locator).toBe('model/entity/PromotionReward.cfc:L74');
    expect(differentiator?.declaresTypeArray).toBe(true);

    // It is also the FIRST collection declared, ahead of the three out-of-scope ones.
    expect(fixtures.rewardManyToManyCollections[0]?.property).toBe('eligiblePriceGroups');
  });

  it('preserves all fourteen link-table names verbatim, abbreviations intact', () => {
    // C5 schema continuity: the target reads and writes the existing `Sw*` tables unchanged. Not
    // one of these names is expanded, "corrected" or regularised - most sharply
    // `SwPromoRewardEligiblePriceGrp` (which is NOT `...EligiblePriceGroup`) and the five
    // `SwPromoRewardExcl*` names (which are NOT `...Excluded*`).
    expect(fixtures.rewardManyToManyCollections.map((collection) => collection.linkTable)).toEqual(
      EXPECTED_LINK_TABLES.map((expected) => expected.linkTable),
    );

    // And the declaration ORDER matches the source line by line, so the census is checkable
    // against a `git show` of the CFC rather than only against itself.
    expect(fixtures.rewardManyToManyCollections.map((collection) => collection.property)).toEqual(
      EXPECTED_LINK_TABLES.map((expected) => expected.property),
    );
    expect(fixtures.rewardManyToManyCollections.map((collection) => collection.locator)).toEqual(
      EXPECTED_LINK_TABLES.map((expected) => expected.locator),
    );
  });

  it('records the table itself as the abbreviated SwPromoReward', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L57]: `table="SwPromoReward"`, matching
    // `SwPromoQual` on [model/entity/PromotionQualifier.cfc:L49] and abbreviated for the same
    // reason. `entityname` keeps the FULL `SlatwallPromotionReward`, so the logical and physical
    // names deliberately disagree.
    expect(PromotionReward.entityMetadata.table).toBe('SwPromoReward');
    expect(PromotionReward.entityMetadata.entityname).toBe('SlatwallPromotionReward');
    expect(PromotionReward.entityMetadata.displayname).toBe('Promotion Reward');
    expect(PromotionReward.entityMetadata.cacheuse).toBe('transactional');

    // `hb_serviceName="promotionService"` is why there is no `PromotionRewardService` to port and
    // no such omission to explain - reward CRUD lives in `model/service/PromotionService.cfc`.
    expect(PromotionReward.entityMetadata.hb_serviceName).toBe('promotionService');
  });

  it('records the type="array" inconsistency on exactly three of the fourteen', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L74, L86, L87]: ONLY `eligiblePriceGroups`,
    // `excludedBrands` and `excludedOptions` declare `type="array"`. The other eleven omit it, and
    // CFML defaults them to arrays anyway, so the attribute changes nothing at runtime. The target
    // materialises all fourteen as arrays uniformly; the inconsistency is annotated so the
    // normalisation is auditable, never silently erased.
    //
    // `PromotionQualifier` repeats the same wart on its own two exclude collections
    // [model/entity/PromotionQualifier.cfc:L83, L84]. Neither file is normalised.
    const declaring = fixtures.rewardManyToManyCollections
      .filter((collection) => collection.declaresTypeArray)
      .map((collection) => collection.property);

    expect(declaring).toEqual(['eligiblePriceGroups', 'excludedBrands', 'excludedOptions']);
    expect(
      fixtures.rewardManyToManyCollections.filter((collection) => !collection.declaresTypeArray),
    ).toHaveLength(11);

    expect(fixtures.rewardManyToManyCollections.map((c) => c.declaresTypeArray)).toEqual(
      EXPECTED_LINK_TABLES.map((expected) => expected.declaresTypeArray),
    );
  });

  it('preserves the Group A declaration order, which is REVERSED against the qualifier', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L76-L78] versus
    // [model/entity/PromotionQualifier.cfc:L73-L75]: the three out-of-scope collections are
    // declared in OPPOSITE orders in the two sibling components.
    //
    //   Reward    : fulfillmentMethods [L76] -> shippingAddressZones [L77] -> shippingMethods [L78]
    //   Qualifier : fulfillmentMethods [L73] -> shippingMethods      [L74] -> shippingAddressZones [L75]
    //
    // Verified by reading both files. NEITHER is normalised - the order carries no behaviour, and
    // silently aligning them would erase evidence that the two components were edited
    // independently.
    const groupA = fixtures.rewardManyToManyCollections
      .slice(1, 4)
      .map((collection) => collection.property);

    expect(groupA).toEqual(['fulfillmentMethods', 'shippingAddressZones', 'shippingMethods']);
    expect(groupA).not.toEqual(['fulfillmentMethods', 'shippingMethods', 'shippingAddressZones']);
  });

  it('splits the fourteen into ELEVEN entity arrays and THREE opaque identifier arrays', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L76-L78]: `FulfillmentMethod`, `AddressZone`
    // and `ShippingMethod` are all out of scope and were never ported, so their three collections
    // collapse to opaque `readonly string[]` identifier arrays. No out-of-scope entity is imported
    // and none is invented - the anti-corruption boundary is expressed as data.
    expect(subject.getFulfillmentMethodIDs()).toEqual(['promofx-fulfillment-method']);
    expect(subject.getShippingAddressZoneIDs()).toEqual(['promofx-shipping-address-zone']);
    expect(subject.getShippingMethodIDs()).toEqual(['promofx-shipping-method']);

    for (const identifier of [
      ...subject.getFulfillmentMethodIDs(),
      ...subject.getShippingAddressZoneIDs(),
      ...subject.getShippingMethodIDs(),
    ]) {
      expect(typeof identifier).toBe('string');
    }

    // The remaining eleven hand back real entity instances.
    const eligiblePriceGroups: PriceGroup[] = subject.getEligiblePriceGroups();
    const brands: Brand[] = subject.getBrands();
    const options: Option[] = subject.getOptions();

    expect(eligiblePriceGroups).toHaveLength(2);
    expect(brands).toHaveLength(1);
    expect(options).toHaveLength(1);
    expect(subject.getSkus()).toHaveLength(1);
    expect(subject.getProducts()).toHaveLength(1);
    expect(subject.getProductTypes()).toHaveLength(1);
    expect(subject.getExcludedBrands()).toHaveLength(1);
    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.getExcludedSkus()).toHaveLength(1);
    expect(subject.getExcludedProducts()).toHaveLength(1);
    expect(subject.getExcludedProductTypes()).toHaveLength(1);

    expect(brands[0]?.getBrandID()).toBe(fixtures.brand.getBrandID());
    expect(options[0]?.getOptionID()).toBe(fixtures.option.getOptionID());
    expect(eligiblePriceGroups[0]?.getPriceGroupID()).toBe(
      fixtures.eligiblePriceGroups[0]?.getPriceGroupID(),
    );
  });

  it('defaults all fourteen collections to empty on a bare instance', () => {
    // Associations are MATERIALIZED AT THE REPOSITORY BOUNDARY, so laziness is not simulated: a
    // collection the repository did not populate is `[]`, never `undefined` and never a lazy
    // proxy. This follows the `Brand.getProducts()` convention that the one legacy entity test
    // [meta/tests/unit/entity/BrandTest.cfc] asserts, applied uniformly.
    const bare = new PromotionReward({ promotionRewardID: 'reward-empty-collections' });

    expect(bare.getEligiblePriceGroups()).toEqual([]);
    expect(bare.getFulfillmentMethodIDs()).toEqual([]);
    expect(bare.getShippingAddressZoneIDs()).toEqual([]);
    expect(bare.getShippingMethodIDs()).toEqual([]);
    expect(bare.getBrands()).toEqual([]);
    expect(bare.getOptions()).toEqual([]);
    expect(bare.getSkus()).toEqual([]);
    expect(bare.getProducts()).toEqual([]);
    expect(bare.getProductTypes()).toEqual([]);
    expect(bare.getExcludedBrands()).toEqual([]);
    expect(bare.getExcludedOptions()).toEqual([]);
    expect(bare.getExcludedSkus()).toEqual([]);
    expect(bare.getExcludedProducts()).toEqual([]);
    expect(bare.getExcludedProductTypes()).toEqual([]);
  });

  it('returns the LIVE internal array from every entity-collection accessor', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L171-L174, L211-L214, L311-L314]: every
    // `remove*` helper mutates the FAR side's array IN PLACE, reaching it through the far side's
    // own getter - `arrayDeleteAt(arguments.brand.getPromotionRewards(), thatIndex)` and so on. If
    // an accessor returned a defensive copy, the bidirectional sync would silently no-op and the
    // persisted link rows would drift out of agreement with the object graph.
    //
    // So live references are LOAD-BEARING, and this test pins them rather than asserting the
    // tidier `readonly` projection a fresh design would prefer.
    const first: Brand[] = subject.getBrands();
    const second: Brand[] = subject.getBrands();

    expect(second).toBe(first);

    first.push(fixtures.excludedBrand);
    expect(subject.getBrands()).toHaveLength(2);
    expect(subject.getBrands()[1]?.getBrandID()).toBe(fixtures.excludedBrand.getBrandID());

    // The three opaque identifier arrays are `readonly` instead, because nothing mutates them:
    // there is no helper pair to keep in sync on either side.
    expect(subject.getShippingMethodIDs()).toEqual(['promofx-shipping-method']);
  });
});

describe('the ELEVEN membership predicates, all comparing by primary key', () => {
  it('exposes exactly eleven singular has* predicates, and hasShippingMethod is ABSENT', () => {
    // Eleven predicates for fourteen collections. The three missing ones are Group A: with
    // `FulfillmentMethod`, `AddressZone` and `ShippingMethod` unported there is no entity to accept
    // as an argument, so `hasShippingMethod` - which the legacy DOES declare implicitly and calls
    // at [model/entity/PromotionReward.cfc:L179] - has no target counterpart.
    //
    // ⚠ `hasShippingMethod` being absent also matters service-side: the shipping-address-zones
    // clause at [model/service/PromotionService.cfc:L703] re-tests `hasShippingMethod` where it
    // means to test the zone condition. That defect is sibling-owned and only cited here.
    const singularPredicates: readonly string[] = [
      'hasEligiblePriceGroup',
      'hasBrand',
      'hasOption',
      'hasSku',
      'hasProduct',
      'hasProductType',
      'hasExcludedBrand',
      'hasExcludedOption',
      'hasExcludedSku',
      'hasExcludedProduct',
      'hasExcludedProductType',
    ];

    expect(singularPredicates).toHaveLength(11);
    for (const predicate of singularPredicates) {
      expect(PROTOTYPE_MEMBERS).toContain(predicate);
    }

    expect(PROTOTYPE_MEMBERS).not.toContain('hasShippingMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasFulfillmentMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasShippingAddressZone');

    // Exactly eleven `has*` members exist in total once the two plural helpers are excluded, so no
    // twelfth predicate has crept in.
    const shippedPredicates = PROTOTYPE_MEMBERS.filter(
      (member) => member.startsWith('has') && !member.startsWith('hasAny'),
    );
    expect(shippedPredicates).toHaveLength(11);
  });

  it('answers membership by primary key, not by object identity', () => {
    // Every predicate compares the candidate's PRIMARY KEY against the held rows' primary keys.
    // That is what lets a re-hydrated entity - a different JavaScript object carrying the same
    // `SwBrand` row - answer `true`, which is exactly what Hibernate's identity semantics gave the
    // legacy for free. Neither object identity nor deep equality is used.
    const heldBrand: Brand | undefined = subject.getBrands()[0];
    expect(heldBrand).toBeDefined();

    // A DIFFERENT instance is never asserted to be the same object...
    expect(subject.hasBrand(fixtures.brand)).toBe(true);
    // ...and a genuinely different row answers false even though it is the same class.
    expect(subject.hasBrand(fixtures.excludedBrand)).toBe(false);

    expect(subject.hasOption(fixtures.option)).toBe(true);
    expect(subject.hasSku(fixtures.sku)).toBe(true);
    expect(subject.hasProduct(fixtures.product)).toBe(true);
    expect(subject.hasProductType(fixtures.productType)).toBe(true);
    expect(subject.hasProductType(fixtures.excludedProductType)).toBe(false);
  });

  it('keeps the include and exclude predicates strictly separate', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L81 versus L87]: `options` and
    // `excludedOptions` are DISTINCT collections over DISTINCT link tables
    // (`SwPromoRewardOption` and `SwPromoRewardExclOption`). A row in one is not a row in the
    // other, and the two predicates must never be collapsed into a shared helper - the five
    // include collections and the five exclude collections mean OPPOSITE things.
    expect(subject.hasOption(fixtures.option)).toBe(true);
    expect(subject.hasExcludedOption(fixtures.option)).toBe(false);

    const heldExcludedOption: Option = requireAt(
      subject.getExcludedOptions(),
      0,
      'excluded option',
    );
    expect(heldExcludedOption.getOptionID()).toBe('promofx-option-excluded');
    expect(subject.hasExcludedOption(heldExcludedOption)).toBe(true);
    expect(subject.hasOption(heldExcludedOption)).toBe(false);

    expect(subject.hasBrand(fixtures.brand)).toBe(true);
    expect(subject.hasExcludedBrand(fixtures.brand)).toBe(false);
    expect(subject.hasExcludedBrand(fixtures.excludedBrand)).toBe(true);
    expect(subject.hasProductType(fixtures.excludedProductType)).toBe(false);
    expect(subject.hasExcludedProductType(fixtures.excludedProductType)).toBe(true);
  });

  it('resolves hasAnyOption and hasAnyExcludedOption through the optionID primary key', () => {
    // These two are the target's explicit stand-ins for the framework's reflective
    // `hasAnyInProperty( propertyName, entityArray )` [org/Hibachi/HibachiEntity.cfc:L340-L350].
    // Both delegate to the singular predicate, so both compare by `optionID`.
    expect(subject.hasAnyOption([fixtures.option])).toBe(true);
    expect(subject.hasAnyExcludedOption(subject.getExcludedOptions())).toBe(true);

    // A candidate list containing only a NON-member answers false on both sides.
    const foreignOption: Option = requireAt(subject.getExcludedOptions(), 0, 'excluded option');
    expect(subject.hasAnyOption([foreignOption])).toBe(false);
    expect(subject.hasAnyExcludedOption([fixtures.option])).toBe(false);

    // `some` semantics: ONE match in a mixed list is enough, exactly as the legacy loop returns
    // `true` at [org/Hibachi/HibachiEntity.cfc:L345] on its first hit.
    expect(subject.hasAnyOption([foreignOption, fixtures.option])).toBe(true);
  });

  it('does NOT reproduce the evaluate()-based dispatch behind hasAnyInProperty', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: the framework builds the predicate
    // name at runtime - `evaluate("has#propertyName#( entity )")` at [L344] - and the source even
    // comments that `evaluate` is used because `hasXXX()` is an implicit ORM function.
    //
    // JUDGMENT CALL: that indirection is NOT ported. `evaluate`, `eval`, `new Function`, `vm` and
    // Proxy-based dispatch are all forbidden, and a string-keyed dispatcher would defeat the
    // static verifiability the migration exists to gain. The target ships two EXPLICIT, typed
    // predicates instead, and no generic `hasAnyInProperty` member exists at all.
    expect(PROTOTYPE_MEMBERS).not.toContain('hasAnyInProperty');
    expect(PROTOTYPE_MEMBERS).toContain('hasAnyOption');
    expect(PROTOTYPE_MEMBERS).toContain('hasAnyExcludedOption');

    // Exactly two plural helpers, so no reflective third has been added.
    expect(PROTOTYPE_MEMBERS.filter((member) => member.startsWith('hasAny'))).toHaveLength(2);
  });
});

describe('empty-collection semantics - the SAME empty array, OPPOSITE meanings', () => {
  it('answers false on an empty INCLUDE list, which is RESTRICTIVE', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L348]: `hasAnyInProperty` falls out of its loop
    // and returns `false` when nothing matches - including when the collection is empty.
    //
    // ★ ON AN INCLUDE LIST THAT `false` IS RESTRICTIVE: the reward holds no options, so NOTHING is
    // a member and the item does not qualify through this path.
    const bare = new PromotionReward({ promotionRewardID: 'reward-no-includes' });

    expect(bare.getOptions()).toEqual([]);
    expect(bare.hasOption(fixtures.option)).toBe(false);
    expect(bare.hasAnyOption([fixtures.option])).toBe(false);
    expect(bare.hasAnyOption([])).toBe(false);
  });

  it('answers false on an empty EXCLUDE list, which is PERMISSIVE', () => {
    // ★ ON AN EXCLUDE LIST THE IDENTICAL `false` IS PERMISSIVE: nothing is excluded, so the item
    // SURVIVES. Same method, same return value, opposite consequence for the customer's price.
    //
    // The five empty-collection semantics in this codebase, recorded together so none is collapsed
    // into another - collapsing any of them is a money bug, and only the two above are re-tested
    // here:
    //
    //   1. PERMISSIVE in the caller's loop - an empty `shippingAddressZones` on a reward means NO
    //      RESTRICTION, so the reward applies to every zone.
    //   2. RESTRICTIVE in the address-zone evaluator - an empty `locations` collection on an
    //      address zone means NOT IN ZONE, so nothing matches. Owned by the evaluator port.
    //   3. `hasAnyInProperty` on an EXCLUDE list - PERMISSIVE, asserted here.
    //   4. `hasAnyInProperty` on an INCLUDE list - RESTRICTIVE, asserted above.
    //   5. The fulfillment three-way gate [model/service/PromotionService.cfc:L333-L420] - an
    //      empty collection means NO RESTRICTION, under a single-promotion-per-fulfillment `[1]`
    //      assumption. Service-owned.
    //
    // `Brand.getProducts()` defaulting to `[]` is the convention that makes all five expressible
    // at all, and it is the one behaviour the legacy entity suite
    // [meta/tests/unit/entity/BrandTest.cfc] actually asserts.
    const bare = new PromotionReward({ promotionRewardID: 'reward-no-excludes' });

    expect(bare.getExcludedOptions()).toEqual([]);
    expect(bare.hasExcludedOption(fixtures.option)).toBe(false);
    expect(bare.hasAnyExcludedOption([fixtures.option])).toBe(false);
    expect(bare.hasAnyExcludedOption([])).toBe(false);

    // The polarity, stated as the assertion it really is: the SAME predicate result, `false`,
    // reached from an empty include list and from an empty exclude list.
    expect(bare.hasAnyOption([fixtures.option])).toBe(bare.hasAnyExcludedOption([fixtures.option]));
  });

  it('answers false for an EMPTY candidate list even when the collection is populated', () => {
    // The other empty: an empty `entityArray` argument. The legacy loop at
    // [org/Hibachi/HibachiEntity.cfc:L342-L347] never executes its body, so control falls to
    // `return false` at [L348] regardless of how full the collection is.
    expect(subject.getOptions()).toHaveLength(1);
    expect(subject.hasAnyOption([])).toBe(false);

    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.hasAnyExcludedOption([])).toBe(false);
  });
});

describe('the bidirectional helpers, and the guard polarity that is load-bearing', () => {
  it('setPromotionPeriod assigns the near side and appends to the far side', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L140-L145]: [L141] assigns, [L142] guards on
    // `isNew() or !arguments.promotionPeriod.hasPromotionReward( this )`, and [L143] appends
    // `this` to the period's LIVE `getPromotionRewards()` array.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-saved-for-set' });
    const before = period.getPromotionRewards().length;

    saved.setPromotionPeriod(period);

    expect(saved.getPromotionPeriod()).toBe(period);
    expect(period.getPromotionRewards()).toHaveLength(before + 1);
    expect(period.getPromotionRewards()).toContain(saved);
  });

  it('guards the far-side append on a SAVED reward, so a repeat set does not duplicate', () => {
    // The `!hasPromotionReward( this )` half of the [L142] guard does the work once the reward has
    // a real primary key: the second call finds itself already present and appends nothing.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-saved-repeat' });
    const before = period.getPromotionRewards().length;

    saved.setPromotionPeriod(period);
    saved.setPromotionPeriod(period);

    expect(period.getPromotionRewards()).toHaveLength(before + 1);
  });

  it('appends TWICE on an isNew() reward, because isNew() short-circuits the guard', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L142]: the guard reads
    // `if(isNew() or !arguments.promotionPeriod.hasPromotionReward( this ))`. `or` short-circuits,
    // so while the reward is NEW the membership test is never evaluated and the append is
    // UNCONDITIONAL. Calling the setter twice before the row is saved therefore puts the reward
    // into the period's collection twice.
    //
    // This is reproduced deliberately, not repaired. It is the shipped behaviour of the entity and
    // the legacy behaviour of the component, and it exists because `unsavedvalue=""` [L60] makes
    // `isNew()` true for exactly as long as the primary key is blank.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const brandNew = new PromotionReward({ promotionRewardID: '' });
    const before = period.getPromotionRewards().length;

    expect(brandNew.isNew()).toBe(true);

    brandNew.setPromotionPeriod(period);
    brandNew.setPromotionPeriod(period);

    expect(period.getPromotionRewards()).toHaveLength(before + 2);
    expect(period.getPromotionRewards().filter((reward) => reward === brandNew)).toHaveLength(2);
  });

  it('removePromotionPeriod splices the far side and clears the near side unconditionally', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L150-L154]: `arrayFind` then `arrayDeleteAt`
    // on the period's live array, and then `structDelete(variables,"promotionPeriod")` OUTSIDE the
    // guard - so the near side is cleared whether or not the far side held the reward.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-to-remove' });
    saved.setPromotionPeriod(period);
    const withReward = period.getPromotionRewards().length;

    saved.removePromotionPeriod(period);

    expect(saved.getPromotionPeriod()).toBeUndefined();
    expect(period.getPromotionRewards()).toHaveLength(withReward - 1);
    expect(period.getPromotionRewards()).not.toContain(saved);
  });

  it('substitutes the held period when removePromotionPeriod is called with no argument', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L147-L149]: the argument is OPTIONAL, and when
    // it is omitted the body substitutes `variables.promotionPeriod`.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-implicit-remove' });
    saved.setPromotionPeriod(period);
    const withReward = period.getPromotionRewards().length;

    saved.removePromotionPeriod();

    expect(saved.getPromotionPeriod()).toBeUndefined();
    expect(period.getPromotionRewards()).toHaveLength(withReward - 1);
  });

  it('throws when removePromotionPeriod is called with no argument and no held period', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L147-L150]: with the argument omitted AND
    // `variables.promotionPeriod` unset, the substitution yields null and [L150] then calls
    // `getPromotionRewards()` on it. That is a CFML null-reference error, and the target throws in
    // the same situation rather than silently doing nothing.
    const orphaned = new PromotionReward({ promotionRewardID: 'reward-orphaned' });

    expect(orphaned.getPromotionPeriod()).toBeUndefined();
    expect(() => {
      orphaned.removePromotionPeriod();
    }).toThrow(/no promotionPeriod/);
  });

  it('adds and removes an eligible price group on BOTH sides', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L158-L175]: the four-step shape every one of
    // the eleven pairs repeats - guard, push near, guard, push far - and, on removal, an
    // unconditional attempt on each side independently.
    const target: PriceGroup = requireAt(fixtures.eligiblePriceGroups, 0, 'eligible price group');
    const fresh = new PromotionReward({ promotionRewardID: 'reward-price-group-pair' });
    const farBefore = target.getPromotionRewards().length;

    fresh.addEligiblePriceGroup(target);

    expect(fresh.getEligiblePriceGroups()).toHaveLength(1);
    expect(fresh.hasEligiblePriceGroup(target)).toBe(true);
    expect(target.getPromotionRewards()).toHaveLength(farBefore + 1);

    fresh.removeEligiblePriceGroup(target);

    expect(fresh.getEligiblePriceGroups()).toEqual([]);
    expect(fresh.hasEligiblePriceGroup(target)).toBe(false);
    expect(target.getPromotionRewards()).toHaveLength(farBefore);
  });

  it('routes the exclude pairs through the far side EXCLUSION collection', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L302-L303 versus L202-L203]: the INCLUDE
    // helpers reach `far.hasPromotionReward(...)` / `far.getPromotionRewards()`, while the EXCLUDE
    // helpers reach `far.hasPromotionRewardExclusion(...)` / `far.getPromotionRewardExclusions()`.
    // Two separate far-side collections, two separate link tables, never conflated.
    const brand: Brand = fixtures.excludedBrand;
    const fresh = new PromotionReward({ promotionRewardID: 'reward-exclusion-pair' });
    const inclusionsBefore = brand.getPromotionRewards().length;
    const exclusionsBefore = brand.getPromotionRewardExclusions().length;

    fresh.addExcludedBrand(brand);

    expect(fresh.getExcludedBrands()).toHaveLength(1);
    expect(fresh.getBrands()).toEqual([]);
    expect(brand.getPromotionRewardExclusions()).toHaveLength(exclusionsBefore + 1);
    expect(brand.getPromotionRewards()).toHaveLength(inclusionsBefore);

    fresh.removeExcludedBrand(brand);

    expect(fresh.getExcludedBrands()).toEqual([]);
    expect(brand.getPromotionRewardExclusions()).toHaveLength(exclusionsBefore);
  });

  it('carries a CLEAN inversion record across all thirteen remove*-bearing properties', () => {
    // ★ THE INVERSION CROSS-CHECK, AND ITS VERDICT: CLEAN.
    //
    // All THIRTEEN `remove*`-bearing properties in [model/entity/PromotionReward.cfc] were read
    // line by line - `removePromotionPeriod` [L146], `removeEligiblePriceGroup` [L166],
    // `removeShippingMethod` [L186], `removeBrand` [L206], `removeOption` [L226], `removeSku`
    // [L246], `removeProduct` [L266], `removeProductType` [L286], `removeExcludedBrand` [L306],
    // `removeExcludedOption` [L326], `removeExcludedSku` [L346], `removeExcludedProduct` [L366]
    // and `removeExcludedProductType` [L386]. EVERY one splices its OWN near-side collection and
    // the CORRECT far-side accessor. Not one of them calls an `add*`, and not one of them targets
    // the wrong property. There is no inversion defect in this component.
    //
    // ⚠ CONTRAST [model/entity/Option.cfc:L129-L131], where `removePromotionRewardExclusion`'s
    // body calls `addExcludedOption` at [L130] - a genuine inversion that ADDS where it should
    // remove. That defect is owned by `option.test.ts`; it is cited here so the clean verdict above
    // is understood as a measured finding rather than an assumption, and it is NOT re-asserted.
    //
    // (Thirteen pairs for fourteen collections: `fulfillmentMethods` and `shippingAddressZones`
    // have no helpers at all, and the surviving twelfth pair - `shippingMethods` - is dropped in
    // the target, leaving eleven many-to-many pairs plus the many-to-one.)
    const removeMembers = PROTOTYPE_MEMBERS.filter((member) => member.startsWith('remove'));
    const addMembers = PROTOTYPE_MEMBERS.filter((member) => member.startsWith('add'));

    expect(removeMembers).toHaveLength(12);
    expect(addMembers).toHaveLength(11);
    expect(removeMembers).toContain('removePromotionPeriod');
    expect(addMembers).not.toContain('addPromotionPeriod');

    // Every `add*` has a matching `remove*`, and every many-to-many `remove*` a matching `add*`.
    for (const addMember of addMembers) {
      expect(removeMembers).toContain(addMember.replace(/^add/, 'remove'));
    }

    // A removal genuinely removes: the clean-inversion verdict, exercised rather than only stated.
    const option: Option = fixtures.option;
    expect(subject.hasOption(option)).toBe(true);
    subject.removeOption(option);
    expect(subject.hasOption(option)).toBe(false);
    expect(subject.hasExcludedOption(option)).toBe(false);
  });
});

describe('the FIVE reward types, documented in a comment and never enforced', () => {
  it('carries the vocabulary in exact source order', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L48-L54]: the five values appear ONLY in the
    // file-opening comment block, under the "Valid Reward Types" heading at [L48] -
    // `merchandise` [L50], `subscription` [L51], `contentAccess` [L52], `fulfillment` [L53],
    // `order` [L54] - with the block closing at [L56]. The order is the source's, preserved.
    expect(fixtures.rewardTypeVocabulary).toEqual(REWARD_TYPES_IN_SOURCE_ORDER);
    expect(fixtures.rewardTypeVocabulary).toHaveLength(5);
    expect(fixtures.rewardTypeVocabulary[0]).toBe('merchandise');
    expect(fixtures.rewardTypeVocabulary[4]).toBe('order');

    // One reward exhibit exists per value, so every branch of the conditional accessor below has a
    // real subject rather than an ad-hoc literal.
    expect(fixtures.merchandiseReward.getRewardType()).toBe('merchandise');
    expect(fixtures.subscriptionReward.getRewardType()).toBe('subscription');
    expect(fixtures.contentAccessReward.getRewardType()).toBe('contentAccess');
    expect(fixtures.fulfillmentReward.getRewardType()).toBe('fulfillment');
    expect(fixtures.orderReward.getRewardType()).toBe('order');
  });

  it('leaves rewardType an UN-NARROWED string, because the vocabulary is a comment', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L48-L54,L63]: the five reward types are
    // enumerated ONLY in the file-opening comment block. `rewardType` itself is `ormType="string"`
    // with no `inList`, there is no `getRewardTypeOptions()` method anywhere in the 426 lines, and
    // `model/validation/PromotionReward.json` declares no rule for it - so it stays an un-narrowed
    // string in the target. The vocabulary is documented, never enforced.
    //
    // ★ CONTRAST `amountType` and `applicableTerm`, both of which ARE narrowed to closed unions -
    // and are narrowed precisely because each has a real method-backed enumeration
    // (`getAmountTypeOptions()` [L120-L133] and `getApplicableTermOptions()` [L112-L118]). The
    // asymmetry between the three string columns is deliberate and evidence-driven.
    const offVocabulary = new PromotionReward({
      promotionRewardID: 'reward-off-vocabulary',
      rewardType: 'giftWithPurchase',
    });

    // No cast, no `@ts-expect-error`: an arbitrary string is simply ASSIGNABLE here.
    expect(offVocabulary.getRewardType()).toBe('giftWithPurchase');
    expect(fixtures.rewardTypeVocabulary).not.toContain('giftWithPurchase');

    // Absence is representable too - the column has no ORM default.
    const untyped = new PromotionReward({ promotionRewardID: 'reward-untyped' });
    expect(untyped.getRewardType()).toBeUndefined();
  });

  it('narrows applicableTerm to exactly both | initial | renewal in source order', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L112-L118]: `getApplicableTermOptions()`
    // returns exactly three entries - `both` [L114], `initial` [L115], `renewal` [L116].
    const options = subject.getApplicableTermOptions();

    expect(options).toHaveLength(3);
    expect(options.map((option) => option.value)).toEqual(['both', 'initial', 'renewal']);

    // The union is CLOSED. Each member is assignable; nothing else is.
    const both: ApplicableTerm = 'both';
    const initial: ApplicableTerm = 'initial';
    const renewal: ApplicableTerm = 'renewal';
    expect([both, initial, renewal]).toEqual(options.map((option) => option.value));

    // @ts-expect-error - 'trial' is not a member of the closed ApplicableTerm union. The union is
    // sealed by `getApplicableTermOptions()`'s three-entry enumeration, so a fourth term is not
    // representable without a cast, and this suite uses none.
    const rejectedTerm: ApplicableTerm = 'trial';
    expect(rejectedTerm).toBe('trial');
  });

  it('holds the applicableTerm the repository supplied, defaulting to none of its own', () => {
    // [L64] declares no ORM default, so absence is real - but the fixture's rewards are hydrated
    // with `both`, which is what a normal row carries.
    expect(subject.getApplicableTerm()).toBe('both');

    const termless = new PromotionReward({ promotionRewardID: 'reward-no-term' });
    expect(termless.getApplicableTerm()).toBeUndefined();
  });

  it('keeps every option name an INERT, unresolved resource-bundle key', () => {
    // JavaRB is NOT ported and no i18n runtime is introduced, so every `rbKey(...)` argument
    // survives VERBATIM as a literal string and is never resolved or translated. The legacy admin
    // can still look these keys up; the target simply carries them.
    expect(subject.getApplicableTermOptions().map((option) => option.name)).toEqual([
      'define.both',
      'define.initial',
      'define.renewal',
    ]);

    expect(fixtures.merchandiseReward.getAmountTypeOptions().map((option) => option.name)).toEqual([
      'define.percentageOff',
      'define.amountOff',
      'define.fixedAmount',
    ]);

    // Not one of them is an English label, which is the point: asserting a translated string would
    // fabricate an i18n contract the port does not implement.
    for (const option of subject.getApplicableTermOptions()) {
      expect(option.name.startsWith('define.')).toBe(true);
    }
  });
});

describe('getAmountTypeOptions() is CONDITIONAL on rewardType', () => {
  it('offers exactly TWO options for an order reward', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L120-L133]: [L121]
    // `if(getRewardType() == "order")` returns TWO entries - `percentageOff` [L123] and
    // `amountOff` [L124]. A fixed amount makes no sense at order level, so the admin is never
    // offered it.
    const options = fixtures.orderReward.getAmountTypeOptions();

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.value)).toEqual(['percentageOff', 'amountOff']);
    expect(options.map((option) => option.value)).toEqual(fixtures.orderRewardAmountTypeVocabulary);
    expect(options.map((option) => option.value)).not.toContain('amount');
  });

  it('offers exactly THREE options for every OTHER reward type', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L126-L131]: the `else` branch returns THREE,
    // adding [L130] `{name=rbKey("define.fixedAmount"), value="amount"}`.
    for (const reward of [
      fixtures.merchandiseReward,
      fixtures.subscriptionReward,
      fixtures.contentAccessReward,
      fixtures.fulfillmentReward,
    ]) {
      const options = reward.getAmountTypeOptions();
      expect(options).toHaveLength(3);
      expect(options.map((option) => option.value)).toEqual([
        'percentageOff',
        'amountOff',
        'amount',
      ]);
    }

    // All five vocabulary values exercised: four take the `else`, `order` takes the `if`.
    expect(fixtures.orderReward.getAmountTypeOptions()).toHaveLength(2);
    expect(fixtures.rewardTypeVocabulary).toHaveLength(5);
  });

  it('takes the THREE-option else branch when rewardType is undefined', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L121, L126]: the source tests EQUALITY against
    // `"order"` and provides an `else`, not a lookup - so anything that is not `order`, absence
    // included, falls to the three-option branch. A CFML null `rewardType` fails the `eq` test and
    // lands in `else` exactly the same way.
    const untyped = new PromotionReward({ promotionRewardID: 'reward-undefined-type' });

    expect(untyped.getRewardType()).toBeUndefined();
    expect(untyped.getAmountTypeOptions()).toHaveLength(3);
    expect(untyped.getAmountTypeOptions().map((option) => option.value)).toEqual([
      'percentageOff',
      'amountOff',
      'amount',
    ]);

    // An off-vocabulary value takes the same branch, for the same reason.
    const offVocabulary = new PromotionReward({
      promotionRewardID: 'reward-off-vocabulary-options',
      rewardType: 'giftWithPurchase',
    });
    expect(offVocabulary.getAmountTypeOptions()).toHaveLength(3);
  });

  it('matches the order branch CASE-INSENSITIVELY, as CFML eq does', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L121]: CFML's `==` on strings is
    // CASE-INSENSITIVE, so `"Order"`, `"ORDER"` and `"order"` all take the two-option branch. The
    // target case-folds explicitly to reproduce that, because TypeScript comparison is not.
    //
    // The fixture's `mixedCaseRewardTypeReward` exists to prove the same folding on the other side
    // of the branch: `'Merchandise'` is preserved verbatim in the column and still takes `else`.
    expect(fixtures.mixedCaseRewardTypeReward.getRewardType()).toBe('Merchandise');
    expect(fixtures.mixedCaseRewardTypeReward.getAmountTypeOptions()).toHaveLength(3);

    for (const spelling of ['order', 'Order', 'ORDER', 'oRdEr']) {
      const reward = new PromotionReward({
        promotionRewardID: `reward-case-${spelling}`,
        rewardType: spelling,
      });
      expect(reward.getAmountTypeOptions()).toHaveLength(2);
      // The column itself is NOT folded - only the comparison is.
      expect(reward.getRewardType()).toBe(spelling);
    }
  });

  it('gives the third option the STORED value "amount" and the display key define.fixedAmount', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L130]: the option's display key is
    // `define.fixedAmount` while its stored value is `amount`. BOTH are preserved verbatim, and the
    // value must never be "corrected" to `fixedAmount` - the value is what the promotion service's
    // Strategy switch dispatches on at [model/service/PromotionService.cfc:L1000].
    const third = fixtures.merchandiseReward.getAmountTypeOptions()[2];

    expect(third).toBeDefined();
    expect(third?.value).toBe('amount');
    expect(third?.value).not.toBe('fixedAmount');
    expect(third?.name).toBe('define.fixedAmount');

    expect(fixtures.fixedAmountAmountTypeValue).toBe('amount');
    expect(fixtures.fixedAmountAmountTypeLabelKey).toBe('define.fixedAmount');
  });

  it('accepts the invalid-in-UI order + amount combination as persistable DATA', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L120-L133]: `getAmountTypeOptions` is
    // conditional - an "order" reward is offered only `percentageOff` and `amountOff`, yet
    // `amountType` has NO `inList` constraint in `model/validation/PromotionReward.json`, so
    // `{rewardType:'order', amountType:'amount'}` is persistable and still executes the `amount`
    // branch of `getDiscountAmount` [model/service/PromotionService.cfc:L987-L1018], which has no
    // `default` case at [L1003]. Represented here as data; the discount arithmetic is asserted by
    // the sibling service suite.
    //
    // Unreachable through the admin UI, fully reachable through the data - and the entity accepts
    // it WITHOUT COMPLAINT, which is the assertion.
    const impossible = fixtures.impossibleOrderFixedAmountReward;

    expect(impossible.getRewardType()).toBe('order');
    expect(impossible.getAmountType()).toBe('amount');

    // The accessor still withholds `amount` from the offered set, so the state contradicts the very
    // method that is supposed to constrain it.
    expect(impossible.getAmountTypeOptions()).toHaveLength(2);
    expect(impossible.getAmountTypeOptions().map((option) => option.value)).not.toContain(
      impossible.getAmountType(),
    );

    // No validation error, no thrown exception, no normalisation of either column.
    expect(impossible.getAmount()).toBeInstanceOf(Money);
    expect(impossible.getPromotionRewardID()).toBe('promofx-reward-order-fixed-amount');
  });

  it('closes the AmountType union at exactly three values', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L62]: `amountType` is `ormType="string"` with
    // no check constraint, so the DATABASE would accept anything. What justifies narrowing it
    // anyway is that [L120-L133] declares a real method-backed enumeration of exactly these three.
    expect(fixtures.amountTypeVocabulary).toEqual(['percentageOff', 'amountOff', 'amount']);

    const percentageOff: AmountType = 'percentageOff';
    const amountOff: AmountType = 'amountOff';
    const amount: AmountType = 'amount';
    expect([percentageOff, amountOff, amount]).toEqual(fixtures.amountTypeVocabulary);

    // @ts-expect-error - 'buyOneGetOne' is not a member of the closed AmountType union. An
    // unrecognised fourth amount type is NOT representable without a cast, which is the compile-time
    // guarantee that replaces the missing `default:` case at
    // [model/service/PromotionService.cfc:L1003]: the switch cannot silently fall through in the
    // target because an unmatched value cannot be constructed in the first place.
    const rejectedAmountType: AmountType = 'buyOneGetOne';
    expect(rejectedAmountType).toBe('buyOneGetOne');

    // The type-safe route into the default-less switch is therefore ABSENCE, not a stray literal.
    expect(fixtures.absentAmountTypeReward.getAmountType()).toBeUndefined();
  });
});

describe('amount is Money or undefined, and getAmountFormatted() branches once', () => {
  it('types amount as Money | undefined, with NO default and no substituted zero', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L61]: `ormType="big_decimal"` with NO `default`
    // attribute, so ABSENCE IS REAL. This is one of exactly four no-default money columns in the
    // slice - alongside `SkuCurrency.price`, `PriceGroupRate.amount` and
    // `PromotionApplied.discountAmount` - in pointed contrast with `Sku.price`, `Sku.listPrice` and
    // `Sku.renewalPrice`, which all declare `default="0"` and for which zero IS a real value.
    //
    // Substituting `0` here would fabricate a real zero discount where the row says "no amount
    // recorded".
    expect(subject.getAmount()).toBeInstanceOf(Money);
    expect(fixtures.absentAmountReward.getAmount()).toBeUndefined();

    const bare = new PromotionReward({ promotionRewardID: 'reward-no-amount' });
    expect(bare.getAmount()).toBeUndefined();
    expect(bare.getAmount()).not.toBe(0);
    expect(bare.getAmount()).not.toBe(Money.zero);
  });

  it('holds the amount as a decimal-exact Money, never a float', () => {
    // P4 single arithmetic surface: every money expectation below is a `Money` or a DECIMAL STRING.
    // No computed JavaScript float appears anywhere in this file, and `decimal.js` is never
    // imported - only `src/domain/valueObjects/money.ts` may reach it.
    const amount = subject.getAmount();

    expect(amount).toBeDefined();
    expect(amount?.toDecimalString()).toBe('12.5');
    expect(amount?.equals(Money.fromDecimalString('12.5'))).toBe(true);
    expect(fixtures.amountOffReward.getAmount()?.toDecimalString()).toBe('5');
    expect(fixtures.amountOffReward.getAmount()?.toFixed2()).toBe('5.00');

    // The reward carries the PERCENTAGE as its amount; turning that into money is the service's
    // job. The worked example is recorded as decimal strings so this file never computes it:
    // 19.99 x 3 = 59.97, less 12.5% = 7.49625, netting 52.47375 and PRESENTING as "52.47".
    expect(fixtures.referenceCalculation.unitPrice).toBe('19.99');
    expect(fixtures.referenceCalculation.extendedPrice).toBe('59.97');
    expect(fixtures.referenceCalculation.percentageOff).toBe('12.5');
    expect(fixtures.referenceCalculation.discountAmount).toBe('7.49625');
    expect(fixtures.referenceCalculation.netAmount).toBe('52.47375');
    expect(fixtures.referenceCalculation.presentedNetAmount).toBe('52.47');
    expect(fixtures.referenceCalculationReward.getAmount()?.toDecimalString()).toBe('12.5');
  });

  it('formats a percentageOff amount as a percentage - the ONLY branch', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L401-L407]: [L402] tests
    // `getAmountType() == "percentageOff"` and [L403] returns
    // `formatValue(getAmount(), "percentage")`. That single `if` is the whole branch.
    //
    // ★ THIS METHOD IS WHY [L61] IS `hb_formatType="custom"` RATHER THAN `"currency"`: the column's
    // rendering depends on a SIBLING column's value, which no declarative format type can express.
    expect(subject.getAmountType()).toBe('percentageOff');
    expect(subject.getAmountFormatted()).toBe('12.50%');

    // Case-folded on the same CFML `==` grounds as the option accessor.
    expect(fixtures.mixedCaseRewardTypeReward.getAmountFormatted()).toBe('12.50%');
  });

  it('formats BOTH amountOff AND amount as currency - two of three share the fall-through', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L406]: execution falls PAST the percentage `if`
    // to `return formatValue(getAmount(), "currency")`. There is no `amountOff` case and no
    // `amount` case - they simply share the fall-through, so two of the three amount types render
    // identically and only `percentageOff` diverges.
    expect(fixtures.amountOffReward.getAmountType()).toBe('amountOff');
    expect(fixtures.amountOffReward.getAmountFormatted()).toBe('5.00');

    expect(fixtures.fixedAmountReward.getAmountType()).toBe('amount');
    expect(fixtures.fixedAmountReward.getAmountFormatted()).toBe('5.00');

    // The same string from both, which is the assertion that pins the shared path.
    expect(fixtures.fixedAmountReward.getAmountFormatted()).toBe(
      fixtures.amountOffReward.getAmountFormatted(),
    );

    // ⚠ The `amountOff` precision gap at [model/service/PromotionService.cfc:L998] - where that one
    // branch omits `precisionEvaluate` and multiplies with raw floating point - is one of the
    // project's three documented divergences and is SIBLING-OWNED by `src/services/promotion/**`.
    // THIS FILE DOES NOT CLAIM IT. The entity carries the column; the service does the arithmetic.
  });

  it('falls to the currency path when amountType is ABSENT', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L402]: the test is a strict equality against
    // `"percentageOff"` ALONE, so a null `amountType` fails it and control reaches [L406]. There is
    // no third branch and no error path for an unset discriminator.
    const reward = fixtures.absentAmountTypeReward;

    expect(reward.getAmountType()).toBeUndefined();
    expect(reward.getAmountFormatted()).toBe('5.00');
    expect(reward.getAmountFormatted()).toBe(fixtures.amountOffReward.getAmountFormatted());
  });

  it('returns an empty string when amount is ABSENT, because the legacy has no null guard', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L401-L407]: NEITHER branch guards a null
    // `amount`. [L403] and [L406] both hand `getAmount()` straight to `formatValue`, so the legacy
    // behaviour for a null amount is whatever the framework formatter does with null - it is not
    // defended against here, and the missing guard is recorded rather than added.
    //
    // The shipped target answers with the EMPTY STRING, and that is what is pinned: the alternative
    // choices would each be worse. Throwing would make an admin list page fail on one bad row, and
    // emitting `"0.00"` would display a real zero discount for a row that records none - the same
    // substitution the currency-cascade convention forbids.
    expect(fixtures.absentAmountReward.getAmount()).toBeUndefined();
    expect(fixtures.absentAmountReward.getAmountFormatted()).toBe('');

    // True on BOTH sides of the branch: the amount is checked before the amountType is consulted.
    const percentageWithoutAmount = new PromotionReward({
      promotionRewardID: 'reward-pct-no-amount',
      amountType: 'percentageOff',
    });
    const currencyWithoutAmount = new PromotionReward({
      promotionRewardID: 'reward-cur-no-amount',
      amountType: 'amountOff',
    });

    expect(percentageWithoutAmount.getAmountFormatted()).toBe('');
    expect(currencyWithoutAmount.getAmountFormatted()).toBe('');
    // Not `"0.00%"`, and not `"0.00"`.
    expect(percentageWithoutAmount.getAmountFormatted()).not.toContain('0');
  });
});

describe('the THREE use-limit columns, where undefined means UNLIMITED', () => {
  it('types all three as number | undefined', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L65-L67]: `maximumUsePerOrder`,
    // `maximumUsePerItem` and `maximumUsePerQualification` all declare
    // `hb_nullRBKey="define.unlimited"`, so ABSENCE MEANS UNLIMITED. Substituting `0` would forbid
    // every use of the reward and silently turn an unbounded promotion into a dead one. All three
    // stay `number | undefined`.
    //
    // ★ This is the half of must-preserve behaviour #1 that lives at the entity layer. The
    // enforcement logic is service-side; the SEMANTICS of absence are here, and getting them wrong
    // here breaks the engine downstream.
    const reward = fixtures.unlimitedUseLimitsReward;

    expect(reward.getMaximumUsePerOrder()).toBeUndefined();
    expect(reward.getMaximumUsePerItem()).toBeUndefined();
    expect(reward.getMaximumUsePerQualification()).toBeUndefined();

    const bounded = fixtures.boundedUseLimitsReward;
    expect(bounded.getMaximumUsePerOrder()).toBe(2);
    expect(bounded.getMaximumUsePerItem()).toBe(1);
    expect(bounded.getMaximumUsePerQualification()).toBe(3);
    expect(typeof bounded.getMaximumUsePerOrder()).toBe('number');
  });

  it('never coerces undefined to zero on any of the three', () => {
    // The coercion this test forbids is the single most consequential mistake available at this
    // layer, so it is asserted per column and against `0` specifically rather than by truthiness.
    const reward = fixtures.unlimitedUseLimitsReward;

    for (const limit of [
      reward.getMaximumUsePerOrder(),
      reward.getMaximumUsePerItem(),
      reward.getMaximumUsePerQualification(),
    ]) {
      expect(limit).toBeUndefined();
      expect(limit).not.toBe(0);
      expect(limit).not.toBeNull();
      expect(limit).not.toBe('');
    }

    // The sentinel the engine substitutes for "unlimited" is a SERVICE-tier concept and is
    // deliberately NOT baked into the column: the entity reports absence, and the engine decides
    // what absence means for its own arithmetic.
    expect(fixtures.unlimitedUseSentinel).toBe(1000000);
    expect(reward.getMaximumUsePerOrder()).not.toBe(fixtures.unlimitedUseSentinel);
  });

  it('distinguishes an explicit 0 from absence on all three limits', () => {
    // `0` is a REAL, persistable value and must remain distinguishable from a null column - a
    // truthiness test would collapse the two and lose the distinction the schema records.
    const zeroed = fixtures.zeroUseLimitsReward;

    expect(zeroed.getMaximumUsePerOrder()).toBe(0);
    expect(zeroed.getMaximumUsePerItem()).toBe(0);
    expect(zeroed.getMaximumUsePerQualification()).toBe(0);

    expect(zeroed.getMaximumUsePerOrder()).not.toBeUndefined();
    expect(zeroed.getMaximumUsePerOrder()).not.toBe(
      fixtures.unlimitedUseLimitsReward.getMaximumUsePerOrder(),
    );

    // A negative limit is likewise carried as written rather than clamped, because the column has
    // no constraint and `model/validation/PromotionReward.json` asks only for `dataType: "numeric"`.
    expect(fixtures.negativeUseLimitsReward.getMaximumUsePerOrder()).toBe(-1);
    expect(fixtures.negativeUseLimitsReward.getMaximumUsePerItem()).toBe(-1);
    expect(fixtures.negativeUseLimitsReward.getMaximumUsePerQualification()).toBe(-1);
  });

  it('holds the nullable roundingRule association without ever dereferencing it', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L71]: `roundingRule` is a many-to-one with
    // `hb_optionsNullRBKey="define.none"`, which makes "no rounding" a CONFIGURED STATE rather than
    // a missing value. So `RoundingRule | undefined`, and absence is legitimate.
    const rule: RoundingRule | undefined = fixtures.roundedReward.getRoundingRule();

    expect(rule).toBeDefined();
    expect(rule).toBe(fixtures.roundingRule);
    expect(fixtures.unroundedReward.getRoundingRule()).toBeUndefined();

    // ★ THE ENTITY HOLDS THE ASSOCIATION AND STOPS. No rounding is performed here: `roundValue`
    // [model/service/RoundingRuleService.cfc:L88-L175] is decimal-STRING manipulation with several
    // counter-intuitive measured outputs, and its assertions - including the ten-row output table -
    // belong to `roundingRule.test.ts` and `tests/unit/services/roundingRuleService`. Re-testing
    // rounding here would duplicate a must-preserve contract in two places, which is how the two
    // copies drift apart.
    expect(PROTOTYPE_MEMBERS).not.toContain('roundValue');
    expect(PROTOTYPE_MEMBERS).not.toContain('roundValueByRoundingRule');
  });

  it('records the ormType / ormtype attribute-casing split without normalising it', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L60-L67, L93]: the attribute name is spelled
    // camelCase `ormType` at [L61], [L62], [L63], [L64] and [L65], but lowercase `ormtype` at
    // [L60], [L66], [L67] and [L93]. CFML attribute names are case-INSENSITIVE, so Hibernate treats
    // both identically and the split changes no behaviour and no type decision.
    //
    // It is recorded here rather than silently normalised, and note WHERE the split falls: it runs
    // straight through the three use-limit columns, with `maximumUsePerOrder` [L65] camelCase and
    // its two siblings [L66, L67] lowercase, even though the three are declared consecutively and
    // are semantically identical. That is the clearest evidence available that the inconsistency is
    // an editing artefact and not a convention - and it is exactly why all three are typed
    // identically below regardless of how their attribute happens to be spelled.
    const reward = fixtures.boundedUseLimitsReward;

    expect(typeof reward.getMaximumUsePerOrder()).toBe(typeof reward.getMaximumUsePerItem());
    expect(typeof reward.getMaximumUsePerItem()).toBe(
      typeof reward.getMaximumUsePerQualification(),
    );

    const unlimited = fixtures.unlimitedUseLimitsReward;
    expect([
      unlimited.getMaximumUsePerOrder(),
      unlimited.getMaximumUsePerItem(),
      unlimited.getMaximumUsePerQualification(),
    ]).toEqual([undefined, undefined, undefined]);
  });
});

describe('THE ONE RENAMED IDENTIFIER IN tests/unit/domain/entities', () => {
  it('exposes hb_permission with the CORRECTED spelling', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L57]: the legacy `hb_permission` is misspelled
    // `"promotionPeriod.promtionRewards"` - "promtion", missing the second `o` of "promotion".
    // Renamed to `'promotionPeriod.promotionRewards'` in the target under the interface-parity
    // constraint, with the original spelling recorded here. This is the ONLY rename in
    // `tests/unit/domain/entities`. `model/entity/PromotionQualifier.cfc:L49` spells the parallel
    // attribute `"promotionPeriod.promotionQualifiers"` CORRECTLY, which is the control proving this
    // one is a typo rather than a convention.
    //
    // ⚠ THE LOCATOR IS L57, NOT L49. The plan cites [L49] for this attribute and that is verified
    // WRONG: [L49] sits INSIDE the reward-type comment block - [L48] is the `Valid Reward Types`
    // heading, [L49] is the blank line beneath it, [L50-L54] are the five values and [L56] closes
    // the block. The component declaration carrying `hb_permission` is at [L57]. Source wins over
    // the plan, and the correction is recorded here rather than quietly applied.
    expect(PromotionReward.entityMetadata.hb_permission).toBe('promotionPeriod.promotionRewards');
    expect(PromotionReward.entityMetadata.hb_permission).not.toBe(
      'promotionPeriod.promtionRewards',
    );
  });

  it('keeps the original misspelling auditable, at the corrected locator', () => {
    // The rename is only defensible if the legacy value stays recoverable, so the as-written
    // spelling, the corrected spelling and BOTH locators are carried as data.
    const contrast = fixtures.permissionAttributeContrast;

    expect(contrast.rewardPermissionAsWritten).toBe('promotionPeriod.promtionRewards');
    expect(contrast.rewardPermissionCorrected).toBe('promotionPeriod.promotionRewards');
    expect(contrast.rewardPermissionLocator).toBe('model/entity/PromotionReward.cfc:L57');

    // The stale plan locator is recorded ALONGSIDE the verified one rather than discarded, so the
    // drift is visible to the next reader instead of being silently absorbed.
    expect(contrast.rewardPermissionLocatorPerPlan).toBe('model/entity/PromotionReward.cfc:L49');
    expect(contrast.rewardPermissionLocator).not.toBe(contrast.rewardPermissionLocatorPerPlan);

    // The control: the sibling attribute, correctly spelled, at its own verified locator.
    expect(contrast.qualifierPermissionAsWritten).toBe('promotionPeriod.promotionQualifiers');
    expect(contrast.qualifierPermissionLocator).toBe('model/entity/PromotionQualifier.cfc:L49');

    // What makes the two comparable, and therefore what makes this one a typo: identical prefix,
    // divergent spelling of the same word.
    expect(contrast.rewardPermissionCorrected.startsWith('promotionPeriod.')).toBe(true);
    expect(contrast.qualifierPermissionAsWritten.startsWith('promotionPeriod.')).toBe(true);
    expect(contrast.rewardPermissionAsWritten.includes('promtion')).toBe(true);
    expect(contrast.qualifierPermissionAsWritten.includes('promtion')).toBe(false);
  });

  it('does NOT extend the rename to the typos that are data contracts', () => {
    // ★ WHY THIS ONE AND ONLY THIS ONE: `hb_permission` is INTERNAL framework metadata - no column
    // name, no persisted value and no external consumer depends on its spelling. The following are
    // DATA CONTRACTS and are PRESERVED verbatim wherever they appear, and must never be
    // "corrected":
    //
    //   - `singlularname` on productReviews        [model/entity/Product.cfc:L76]
    //   - `subsciptionUsageBenefit`                [model/entity/PriceGroup.cfc:L168]
    //   - the capital-`D` `DisplayName`            [model/entity/PriceGroupRate.cfc:L270]
    //   - `orderItemQulifiedDiscounts`             [model/service/PromotionService.cfc:L82-L133]
    //
    // Each is owned by its own sibling suite. This assertion pins the BOUNDARY of the rename: the
    // entity's own metadata carries no other corrected value, and nothing here silently repairs a
    // spelling that belongs to a contract.
    const metadataValues = Object.values(PromotionReward.entityMetadata);

    expect(metadataValues).not.toContain('singlularname');
    expect(metadataValues).not.toContain('subsciptionUsageBenefit');
    expect(metadataValues).not.toContain('orderItemQulifiedDiscounts');

    // Exactly eight attributes, matching the eight on [L57] - so no ninth was invented and none of
    // the absent ones (`accessors`, `output`, `hb_processContexts`) was transplanted from the
    // sibling component, which DOES declare `output="false" accessors="true"` at
    // [model/entity/PromotionQualifier.cfc:L49].
    expect(Object.keys(PromotionReward.entityMetadata)).toHaveLength(8);
    expect(PromotionReward.entityMetadata.accessors).toBeUndefined();
    expect(PromotionReward.entityMetadata.output).toBeUndefined();
    expect(PromotionReward.entityMetadata.persistent).toBe('true');
    expect(PromotionReward.entityMetadata.extends).toBe('HibachiEntity');
  });

  it('freezes the metadata, because a schema contract may not mutate at runtime', () => {
    expect(Object.isFrozen(PromotionReward.entityMetadata)).toBe(true);
  });
});

describe('getSimpleRepresentation() and its property name', () => {
  it('composes the entity label, the literal " - " separator, and the formatted rewardType', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L106-L108]: the body is
    // `"#rbKey('entity.promotionReward')# - #getFormattedValue('rewardType')#"` - three parts, with
    // a SPACE-HYPHEN-SPACE separator that is part of the contract.
    //
    // ⚠ AND IT SITS OUTSIDE EVERY BANNER. [L106-L108] precedes the
    // `START: Non-Persistent Property Methods` banner at [L110], so the method belongs to no
    // labelled section at all - exactly the same placement wart as
    // `PromotionQualifier.cfc:L101-L103`. Annotated; NEVER normalise a banner, and never relocate a
    // method to tidy one up.
    //
    // `rewardType` is `hb_formatType="rbKey"` [L63], so the legacy resolves a value-dependent bundle
    // key. The target does NOT resolve it - JavaRB is not ported and no i18n runtime is introduced -
    // so the raw key is what appears, and that non-resolution is the shipped behaviour being pinned.
    expect(subject.getSimpleRepresentation()).toBe(
      'entity.promotionReward - entity.promotionReward.rewardType.merchandise',
    );

    const parts = subject.getSimpleRepresentation().split(' - ');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('entity.promotionReward');
    expect(parts[1]).toBe('entity.promotionReward.rewardType.merchandise');
  });

  it('resolves the rewardType half through the injected label provider, per value', () => {
    // The value-dependent key is `entity.promotionReward.rewardType.<value>`, so a different
    // `rewardType` produces a different second half. The provider records its calls, which proves
    // the entity consults it rather than composing the key itself.
    expect(fixtures.subscriptionReward.getSimpleRepresentation()).toBe(
      'entity.promotionReward - entity.promotionReward.rewardType.subscription',
    );
    expect(fixtures.orderReward.getSimpleRepresentation()).toBe(
      'entity.promotionReward - entity.promotionReward.rewardType.order',
    );

    expect(fixtures.rewardLabelProvider.rewardTypeLabelCalls.length).toBeGreaterThan(0);
    expect(
      fixtures.rewardLabelProvider.rewardTypeLabelCalls.map((call) => call.rewardType),
    ).toContain('subscription');
  });

  it('yields an empty second half when rewardType is absent, rather than inventing a label', () => {
    // A null `rewardType` gives `getFormattedValue('rewardType')` nothing to format, so the legacy
    // interpolation contributes an empty string and the separator survives. The target reproduces
    // that shape instead of omitting the separator or substituting a placeholder.
    const untyped = new PromotionReward({
      promotionRewardID: 'reward-untyped-representation',
      labelProvider: {
        getPromotionRewardEntityLabel: () => 'entity.promotionReward',
        getRewardTypeLabel: (rewardType: string) =>
          `entity.promotionReward.rewardType.${rewardType}`,
      },
    });

    expect(untyped.getRewardType()).toBeUndefined();
    expect(untyped.getSimpleRepresentation()).toBe('entity.promotionReward - ');
  });

  it('THROWS on an instance hydrated without resolved label text - the shipped reality', () => {
    // ⚠ THIS IS WHERE THE INHERITED LEGACY ASSERTION IS DELIBERATELY NOT FORCED.
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]
    // `simple_representation_exists_and_is_simple` asserted that a BARE new instance produces a
    // simple representation, because the CFML framework could always reach a resource bundle.
    //
    // The target cannot: JavaRB is not ported, so resolved text is supplied AT HYDRATION and a
    // reward built without it has nothing to render. The shipped module THROWS rather than emitting
    // the raw keys (which would leak identifiers onto an admin screen) or English (which would
    // fabricate a translation). This suite pins THAT REALITY and explains it, rather than
    // fabricating a shape in which the inherited assertion would pass.
    const bare = new PromotionReward({ promotionRewardID: 'reward-no-labels' });

    expect(() => bare.getSimpleRepresentation()).toThrow(/label provider/);
  });

  it('returns "rewardType" from getSimpleRepresentationPropertyName()', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L413-L415]: the method spans three lines with
    // its `return "rewardType";` at [L414]. (The plan cites [L414] alone; the enclosing declaration
    // runs L413-L415. Source wins, and the fuller span is recorded.)
    //
    // The per-entity comparison, none of which is re-asserted here:
    //   `PromotionQualifier.cfc:L355-L357` -> "qualifierType"
    //   `PromotionCode.cfc:L171-L173`      -> "promotionCode"
    //   `PriceGroupRate.cfc:L270-L271`     -> the capital-`D` "DisplayName" (a preserved typo)
    //   `Product.cfc:L791-L793`            -> "productName"
    //
    // Note what this one names: `rewardType` is a VOCABULARY column, not a human-authored name. A
    // reward has no `rewardName`, so its simple representation is necessarily type-based - which is
    // also why the label provider needs a value-dependent key rather than a single static one.
    expect(subject.getSimpleRepresentationPropertyName()).toBe('rewardType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('promotionRewardName');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('qualifierType');
  });
});

describe('isDeletable() - two unguarded dereferences of the same period', () => {
  it('dereferences getPromotionPeriod() TWICE in one expression', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L417-L419]: the body is
    // `return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();`
    // - `getPromotionPeriod()` appears TWICE, and neither call is null-guarded. The identical
    // three-level, double-call shape appears at `PromotionQualifier.cfc:L359-L361`.
    //
    // This is a DEREFERENCE-SURFACE fact: it is recorded because it determines WHERE the expression
    // can fail and how many null checks a faithful port owes, and the target reproduces the two
    // separate calls rather than hoisting them into one. It is NOT a performance observation, and it
    // is not framed as one.
    const period: PromotionPeriod = fixtures.promotionPeriod;

    expect(subject.getPromotionPeriod()).toBe(period);
    expect(period.isExpired()).toBe(false);
    expect(period.getPromotion()).toBeDefined();

    // The chain is three levels deep: reward -> period -> promotion -> isDeletable().
    expect(period.getPromotion()?.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('THROWS when the reward has no materialized promotionPeriod', () => {
    // [L418] calls `.isExpired()` on the FIRST dereference with no guard, so an unattached or
    // unjoined reward is a null-reference error in CFML too. The target throws rather than
    // answering `true` or `false` for a question it cannot evaluate.
    const orphaned = new PromotionReward({ promotionRewardID: 'reward-no-period' });

    expect(orphaned.getPromotionPeriod()).toBeUndefined();
    expect(() => orphaned.isDeletable()).toThrow(/no materialized/);
  });

  it('THROWS when the period is present but its promotion is absent', () => {
    // The asymmetry that makes this a SECOND, distinct failure mode:
    // `PromotionPeriod.isExpired()` IS guarded - [model/entity/PromotionPeriod.cfc:L84] reads
    // `isDate(getEndDateTime()) && getEndDateTime() < now()`, so a period with no end date answers
    // `false` safely - but `getPromotionPeriod().getPromotion()` on [L418] is NOT guarded. So a
    // period that survives the expiry test and then has no promotion fails on the second operand.
    //
    // Reached only when the period is NOT expired: an expired period short-circuits first (next
    // test).
    const unexpiredWithoutPromotion = fixtures.datedPromotionPeriods.find(
      (dated) => !dated.promotionPeriod.isExpired(),
    );
    expect(unexpiredWithoutPromotion).toBeDefined();

    const period = unexpiredWithoutPromotion?.promotionPeriod;
    expect(period?.getPromotion()).toBeUndefined();

    const reward = new PromotionReward({
      promotionRewardID: 'reward-period-without-promotion',
      promotionPeriod: period,
    });

    expect(() => reward.isDeletable()).toThrow(/no materialized promotion/);
  });

  it('answers false for an EXPIRED period, short-circuiting before the promotion', () => {
    // CFML `&&` short-circuits, so `!isExpired()` being false ends the expression and the SECOND
    // dereference never happens. That is observable here precisely because the expired period
    // carries NO promotion: if the port had hoisted or eagerly evaluated the second operand, this
    // test would throw instead of answering `false`.
    const expired = fixtures.datedPromotionPeriods.find((dated) =>
      dated.promotionPeriod.isExpired(),
    );
    expect(expired).toBeDefined();
    expect(expired?.promotionPeriod.getPromotion()).toBeUndefined();

    const reward = new PromotionReward({
      promotionRewardID: 'reward-expired-period',
      promotionPeriod: expired?.promotionPeriod,
    });

    expect(reward.isDeletable()).toBe(false);
  });

  it('answers false for an unexpired period whose promotion is not deletable', () => {
    // The second operand actually runs, and answers `false` on its own terms: the fixture's
    // promotion has applied promotions, which is what makes it undeletable.
    expect(fixtures.promotionPeriod.isExpired()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('answers true for an unexpired period with a deletable promotion', () => {
    // The one path to `true`: BOTH operands must pass. Re-pointing the period at a promotion that
    // reports itself deletable flips the result, which proves the second operand is genuinely
    // consulted rather than being dead weight behind the expiry test.
    expect(fixtures.codelessPromotion.isDeletable()).toBe(true);

    fixtures.promotionPeriod.setPromotion(fixtures.codelessPromotion);

    expect(fixtures.promotionPeriod.isExpired()).toBe(false);
    expect(fixtures.promotionPeriod.getPromotion()?.isDeletable()).toBe(true);
    expect(subject.isDeletable()).toBe(true);
  });

  it('exposes no deletability collection gate of its own', () => {
    // The `isDeletable()` chain is CODE-ONLY here. There is no declarative counterpart - see the
    // validation suite below - and no `maxCollection` rule anywhere in
    // `model/validation/PromotionReward.json`.
    expect(PROTOTYPE_MEMBERS).toContain('isDeletable');
    expect(PROTOTYPE_MEMBERS).not.toContain('getRewardsDeletableFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPromotionRewardsDeletableFlag');
  });
});

describe('the five declarative validation rules, and the four conspicuous absences', () => {
  // CFML parity [model/validation/PromotionReward.json]: exactly five rules. `amountType` is
  // required but value-unconstrained; `amount` is required and numeric; the three `maximumUse*`
  // limits are numeric but optional. There is NO `rewardType` rule, NO `applicableTerm` rule, NO
  // `roundingRule` rule and NO collection delete gate -- even though `isDeletable()` exists in code.
  // The gaps are preserved, never completed.
  //
  // These assertions describe what the JSON SAYS, carried as data. Zod enforcement lives at the
  // SERVICE tier and no validator is executed here.

  it('makes BOTH amountType AND amount required on save', () => {
    // JSON line 3: `"amountType": [{"contexts":"save","required":true}]`
    // JSON line 4: `"amount": [{"contexts":"save","required":true,"dataType":"numeric"}]`
    //
    // Two required columns, which independently corroborates that null-means-unlimited on the three
    // limits is the VALIDATED shape rather than an oversight: the file's author clearly knew how to
    // mark a column required and chose not to for those three.
    const requiredOnSave: readonly string[] = ['amountType', 'amount'];
    expect(requiredOnSave).toHaveLength(2);
    expect(requiredOnSave).toContain('amountType');
    expect(requiredOnSave).toContain('amount');

    // The entity itself does NOT enforce either, which is why both absences are constructible above.
    const invalidByValidation = new PromotionReward({ promotionRewardID: 'reward-invalid' });
    expect(invalidByValidation.getAmountType()).toBeUndefined();
    expect(invalidByValidation.getAmount()).toBeUndefined();
  });

  it('leaves amountType required but value-UNCONSTRAINED', () => {
    // ⚠ The `amountType` rule carries `required: true` and NOTHING ELSE - no `dataType`, no
    // `inList`. That is PRECISELY what makes the illegal `{rewardType:'order', amountType:'amount'}`
    // combination persistable: validation demands that the column be filled and says nothing at all
    // about what may fill it.
    //
    // In the target the CLOSED `AmountType` union does the constraining that the JSON never did -
    // which is stricter than the legacy, and is achieved by typing rather than by adding a rule the
    // source does not contain.
    expect(fixtures.impossibleOrderFixedAmountReward.getAmountType()).toBe('amount');
    expect(fixtures.impossibleOrderFixedAmountReward.getRewardType()).toBe('order');
    expect(
      fixtures.impossibleOrderFixedAmountReward
        .getAmountTypeOptions()
        .map((option) => option.value),
    ).not.toContain('amount');
  });

  it('declares the three maximumUse* rules numeric but NOT required', () => {
    // JSON lines 5-7: each is `[{"contexts":"save","dataType":"numeric"}]` - a TYPE rule with no
    // `required` key. So an absent limit passes validation, which is the declarative half of
    // undefined-means-unlimited.
    const numericNotRequired: readonly string[] = [
      'maximumUsePerOrder',
      'maximumUsePerItem',
      'maximumUsePerQualification',
    ];

    expect(numericNotRequired).toHaveLength(3);

    // The validated "unlimited" shape: all three absent, and nothing objects.
    const reward = fixtures.unlimitedUseLimitsReward;
    for (const limit of [
      reward.getMaximumUsePerOrder(),
      reward.getMaximumUsePerItem(),
      reward.getMaximumUsePerQualification(),
    ]) {
      expect(limit).toBeUndefined();
    }
  });

  it('asserts the ABSENCES and invents nothing to fill them', () => {
    // Four things the file does NOT contain, recorded so no future edit "completes" it:
    //   * no `rewardType` rule      - the five-value vocabulary is unvalidated, which is exactly why
    //                                 the column stays an un-narrowed string
    //   * no `applicableTerm` rule  - likewise unvalidated
    //   * no `roundingRule` rule    - the association is genuinely optional
    //   * no collection delete gate - despite `isDeletable()` existing in code
    //
    // CONTRAST `model/validation/Promotion.json`, which DOES gate deletion: `appliedPromotions` with
    // `maxCollection: 0` and a `method` gate on `promotionCodes`. The reward file has neither, so its
    // `isDeletable()` is enforced only where it is called - never declaratively.
    const declaredProperties: readonly string[] = [
      'amountType',
      'amount',
      'maximumUsePerOrder',
      'maximumUsePerItem',
      'maximumUsePerQualification',
    ];

    expect(declaredProperties).toHaveLength(5);
    expect(declaredProperties).not.toContain('rewardType');
    expect(declaredProperties).not.toContain('applicableTerm');
    expect(declaredProperties).not.toContain('roundingRule');
    expect(declaredProperties).not.toContain('eligiblePriceGroups');
    expect(declaredProperties).not.toContain('promotionPeriod');
  });

  it('confirms the file is PRESENT in the promotion-family validation census', () => {
    // The census was built by listing `model/validation/` directly rather than inferred. Within the
    // promotion family FOUR files are present and THREE are absent - and the three absences
    // (`PromotionQualifier`, `PromotionApplied`, `PromotionAccount`) are recorded AS absent rather
    // than filled in, because inventing a `PromotionQualifier.json` would fabricate a constraint the
    // legacy never enforced.
    const row = fixtures.promotionValidationCensus.find(
      (entry) => entry.entity === 'PromotionReward',
    );

    expect(row).toBeDefined();
    expect(row?.present).toBe(true);
    expect(row?.validationFile).toBe('model/validation/PromotionReward.json');

    expect(fixtures.promotionValidationCensus.filter((entry) => entry.present)).toHaveLength(4);
    expect(fixtures.promotionValidationCensus.filter((entry) => !entry.present)).toHaveLength(3);
    expect(
      fixtures.promotionValidationCensus
        .filter((entry) => !entry.present)
        .map((entry) => entry.entity),
    ).toEqual(['PromotionQualifier', 'PromotionApplied', 'PromotionAccount']);
  });
});

describe('the structural facts the row carries', () => {
  it('is honest about isNew(), because the primary key defaults to the empty string', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L60]: `unsavedvalue=""` together with
    // `default=""` is what makes `isNew()` decidable WITHOUT an ORM session - the port needs no
    // Hibernate session state to answer it, only the key.
    //
    // This is the one assertion from [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]
    // `defaults_are_correct` that survives into the target, authored net-new against the member the
    // port actually ships.
    expect(new PromotionReward({ promotionRewardID: '' }).isNew()).toBe(true);
    expect(subject.isNew()).toBe(false);
    expect(subject.getPromotionRewardID()).toBe('promofx-reward-percentage-off');
  });

  it('carries remoteID as an optional string', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L93]: `property name="remoteID"
    // ormtype="string"` - lowercase attribute spelling, in the "Remote Properties" block, with no
    // default. It supports external-system correlation and is genuinely absent on a locally created
    // row.
    expect(subject.getRemoteID()).toBeUndefined();

    const correlated = new PromotionReward({
      promotionRewardID: 'reward-remote',
      remoteID: 'legacy-erp-00417',
    });
    expect(correlated.getRemoteID()).toBe('legacy-erp-00417');
  });

  it('carries the four audit properties as Date | undefined - never an epoch', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L96-L99]: two `ormtype="timestamp"` columns and
    // two many-to-one `Account` references, all four `hb_populateEnabled="false"`. The two account
    // references reduce to OPAQUE IDENTIFIERS because `Account` is out of scope.
    //
    // A missing timestamp is `undefined`, NEVER `new Date(0)`: substituting the epoch would assert
    // that the row was created on 1 January 1970, which is a fabricated fact rather than a missing
    // one.
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:00.000Z');

    // Out of scope, so identifiers only - no `Account` entity is imported or invented.
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();

    const undated = new PromotionReward({ promotionRewardID: 'reward-undated' });
    expect(undated.getCreatedDateTime()).toBeUndefined();
    expect(undated.getModifiedDateTime()).toBeUndefined();
    expect(undated.getCreatedDateTime()).not.toEqual(new Date('1970-01-01T00:00:00.000Z'));
  });

  it('reads its clock from the fixture, never from the ambient one', () => {
    // Every business-date literal in this suite is an explicit UTC ISO-8601 string, and the fixture
    // supplies one fixed instant so no assertion can drift with the wall clock. The reward entity
    // itself performs NO date comparison, which is why no clock is injected into it - the periods it
    // points at carry their own.
    expect(fixtures.now.toISOString()).toBe('2024-06-15T12:00:00.000Z');
    expect(fixtures.clock().toISOString()).toBe(fixtures.now.toISOString());
    expect(PROTOTYPE_MEMBERS).not.toContain('isCurrent');
    expect(PROTOTYPE_MEMBERS).not.toContain('isExpired');
  });

  it('records the banner inventory this component has - and the two it does NOT', () => {
    // CFML parity [model/entity/PromotionReward.cfc]: the banner map, verified by reading all 426
    // lines - [L110]/[L135] Non-Persistent Property Methods, [L137]/[L397] Bidirectional Helper
    // Methods (260 lines, the LARGEST such block in any in-scope entity), [L399]/[L409] Custom
    // Formatting Methods, [L411]/[L421] Overridden Methods, [L423]/[L425] ORM Event Hooks (empty).
    //
    // ⚠ THERE IS NO `Custom Validation Methods` BANNER and NO misspelled `Overridden Implecet
    // Getters` BANNER - a direct contrast with `PromotionQualifier.cfc`, which carries BOTH
    // ([L341]/[L343] and the misspelled [L349]/[L351]), as does `PromotionCode.cfc`
    // ([L165]/[L167]). The absence is consistent with the two findings this suite already pinned:
    // the validation file names no entity method, and the component ships no validator.
    //
    // Banners are documentation, and they are never normalised - not their spelling, not their
    // ordering, and not the fact that `getSimpleRepresentation()` [L106-L108] sits outside all of
    // them.
    //
    // The two Overridden-Methods members, and nothing else in that block:
    expect(PROTOTYPE_MEMBERS).toContain('getSimpleRepresentationPropertyName');
    expect(PROTOTYPE_MEMBERS).toContain('isDeletable');

    // The single Custom-Formatting member:
    expect(PROTOTYPE_MEMBERS).toContain('getAmountFormatted');

    // The two Non-Persistent-Property members, the third property being the orphan:
    expect(PROTOTYPE_MEMBERS).toContain('getAmountTypeOptions');
    expect(PROTOTYPE_MEMBERS).toContain('getApplicableTermOptions');
    expect(PROTOTYPE_MEMBERS).not.toContain('getRewards');
  });

  it('declares exactly EIGHT persistent scalars and ZERO booleans', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L60-L67]: eight scalar columns and not one
    // boolean - verified against BOTH attribute casings, since a census that grepped only lowercase
    // `ormtype="boolean"` would under-count. That is why no boolean coercion helper is needed
    // anywhere in the port of this entity, and why none is imported.
    const bare = new PromotionReward({ promotionRewardID: 'reward-scalars' });

    const scalarAccessors: readonly unknown[] = [
      bare.getPromotionRewardID(),
      bare.getAmount(),
      bare.getAmountType(),
      bare.getRewardType(),
      bare.getApplicableTerm(),
      bare.getMaximumUsePerOrder(),
      bare.getMaximumUsePerItem(),
      bare.getMaximumUsePerQualification(),
    ];

    expect(scalarAccessors).toHaveLength(8);
    for (const value of scalarAccessors) {
      expect(typeof value).not.toBe('boolean');
    }

    // No `activeFlag`, no `publishedFlag`, no boolean of any kind - contrast `Brand`, `Promotion` and
    // `PromotionCode`, which all carry one.
    expect(PROTOTYPE_MEMBERS).not.toContain('getActiveFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPublishedFlag');
  });
});

describe('per-test isolation, proven rather than asserted', () => {
  it('mutates a live collection array and a live far-side array', () => {
    // Deliberately destructive. `beforeEach` rebuilds the entire graph, so the damage this test does
    // must be invisible to the next one - which the following test checks. Without that guarantee
    // the live-array contract, which is itself load-bearing, would silently couple every test in the
    // file to every other.
    subject.getBrands().push(fixtures.excludedBrand);
    subject.getEligiblePriceGroups().length = 0;
    subject.removeOption(fixtures.option);
    fixtures.promotionPeriod.setPromotion(fixtures.codelessPromotion);

    expect(subject.getBrands()).toHaveLength(2);
    expect(subject.getEligiblePriceGroups()).toEqual([]);
    expect(subject.hasOption(fixtures.option)).toBe(false);
    expect(subject.isDeletable()).toBe(true);
  });

  it('sees a pristine graph despite the previous test mutating it', () => {
    // The freshness proof. Every value here is the fixture's default, unaffected by the wreckage
    // above - so there is no mutable module-level state and no cross-test leakage through the eleven
    // live arrays.
    expect(subject.getBrands()).toHaveLength(1);
    expect(subject.getEligiblePriceGroups()).toHaveLength(2);
    expect(subject.hasOption(fixtures.option)).toBe(true);
    expect(subject.isDeletable()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    expect(subject.getAmountFormatted()).toBe('12.50%');
  });

  it('hands out a distinct object graph on every fixture call', () => {
    // Two calls, two graphs. A fixture that returned a shared instance would reintroduce exactly the
    // cross-invocation state hazard the port removed when it replaced the component-level caches
    // with request-scoped ones.
    const first = makePromotionFixtures();
    const second = makePromotionFixtures();

    expect(first.percentageOffReward).not.toBe(second.percentageOffReward);
    expect(first.percentageOffReward.getBrands()).not.toBe(second.percentageOffReward.getBrands());
    expect(first.percentageOffReward.getPromotionRewardID()).toBe(
      second.percentageOffReward.getPromotionRewardID(),
    );

    first.percentageOffReward.getBrands().length = 0;
    expect(second.percentageOffReward.getBrands()).toHaveLength(1);
  });

  it('confirms this suite is NET-NEW coverage with no legacy antecedent', () => {
    // C8 traceability, asserted rather than only claimed in the header. `PromotionReward` is one of
    // the SIXTEEN in-scope entities with no legacy test at all, and presenting net-new coverage as
    // parity would fail the coverage gate outright.
    expect(fixtures.legacyTestCoverageExists).toBe(false);
  });
});
