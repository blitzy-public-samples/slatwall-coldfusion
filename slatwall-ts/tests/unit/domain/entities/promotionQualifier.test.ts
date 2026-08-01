// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/promotionQualifier.ts`
//
// WHAT THIS SUITE PINS
// `PromotionQualifier` is the `SwPromoQual` row, and it is the GATE half of the promotion
// engine: `Promotion` -> `PromotionPeriod` -> { QUALIFIERS decide WHETHER a promotion
// applies, REWARDS decide WHAT it gives }. Everything this entity carries is therefore an
// eligibility INPUT to a must-preserve money path -
// `getQualifierQualificationDetails()` [model/service/PromotionService.cfc:L629-L750] reads
// the ten numeric gates, and `getOrderItemInQualifier()`
// [model/service/PromotionService.cfc:L852-L919] walks the membership collections.
//
// Three properties of the row do the load bearing, and the suite is organised around them:
//
//   1. TEN NUMERIC GATES WITH ASYMMETRIC ABSENCE SEMANTICS
//      [model/entity/PromotionQualifier.cfc:L55-L64]. Every `minimum*` declares
//      `hb_nullRBKey="define.0"` and every `maximum*` declares
//      `hb_nullRBKey="define.unlimited"`. Both are modelled as `undefined`, and coercing a
//      `maximum*` to `0` would forbid every order rather than permit every order.
//   2. THIRTEEN MANY-TO-MANY OWNER COLLECTIONS [L73-L87] - one FEWER than
//      `PromotionReward`'s fourteen, because the qualifier has no `eligiblePriceGroups`.
//      Three of the thirteen point at out-of-scope entities and collapse to opaque
//      identifier arrays, so only ten materialize as entity arrays.
//   3. AN `isDeletable()` THAT CLIMBS TWO LEVELS OF PARENT WITH NO NULL GUARD [L359-L361],
//      which makes two distinct raises reachable rather than theoretical.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and that was MEASURED rather than
// assumed: no file under `meta/tests/` mentions `PromotionQualifier`, `qualifierType` or
// `rewardMatchingType`. The only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc],
// neither of which touches this entity, and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing zero
// coverage. There is nothing here to extend, so this file is one of the sixteen NET-NEW
// entity suites and is labelled as such. Presenting it as parity would fail the coverage
// gate.
//
// The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed every
// legacy entity suite for free are NOT inherited, and NO shared base class is introduced to
// imitate them - carrying the assertions is the goal, carrying the harness is not:
//   * `validate_as_save_for_a_new_instance_doesnt_pass` [L51-L54] rests on `validate()` and
//     `hasErrors()`, framework members the port does not ship, and on a validation schema
//     that DOES NOT EXIST for this entity. Not portable. Its absence is asserted instead.
//   * `simple_representation_exists_and_is_simple` [L56-L58] is NOT forced blindly. The
//     shipped `getSimpleRepresentation()` is total, and what a BARE instance actually
//     produces was measured rather than guessed - see the block on it below. The measured
//     reality is asserted; the framework's `isSimpleValue()` is not imitated.
//   * `has_primary_id_property_name` [L60-L62] rests on `getPrimaryIDPropertyName()`, not
//     ported. Its absence is asserted.
//   * `defaults_are_correct` [L64-L67] survives in ONE half only - the `isNew()` assertion -
//     authored below against the member the port does ship, and authored net-new.
//
// ---------------------------------------------------------------------------
// !! HARD BOUNDARY - THE ENGINE'S BEHAVIOUR IS NOT TESTED HERE !!
// ---------------------------------------------------------------------------
// This entity DECLARES the gates; it does not COMPARE them. Nothing below asserts how a
// qualification is decided. Concretely out of bounds here, with the owner of each:
//
//   * Gate comparison and the qualification cascade
//     [model/service/PromotionService.cfc:L629-L750] - owned by
//     `tests/unit/services/promotion/qualifierQualification.ts`'s suite.
//   * `productTypeIDPath` membership walking
//     [model/service/PromotionService.cfc:L852-L919] - owned by the
//     `orderItemMembership` suite.
//   * The mutable usage ledger, the two-pass reward iteration and its empty-collection
//     guard, the over-use stripping loop, and `getDiscountAmount`'s arithmetic - all
//     service-tier.
//   * The requirement that the price-group pass precede the promotion pass.
//   * The `issue_1766` return/exchange no-op - sibling-owned, deliberately not carried here.
//
// No assertion below computes a discount, and no SQL appears in this file: the qualifier's
// link-table reads belong to `tests/integration/repositories/**`. The thirteen physical
// link-table names ARE asserted, because they are a schema contract this row owns, not a
// query.
//
// ---------------------------------------------------------------------------
// NO DEFECT BELONGS TO THIS ENTITY, AND NO DIVERGENCE IS SPENT
// ---------------------------------------------------------------------------
// The register of twenty numbered legacy defects contains NOT ONE entry against
// `model/entity/PromotionQualifier.cfc`. Every wart this suite pins is therefore recorded as
// a `CFML parity` fact and never as a numbered defect:
//
//   * the property/accessor DOUBLE ORPHAN at [L99] and [L107-L115];
//   * `type="array"` declared on [L83] and [L84] only, omitted on the other eleven;
//   * `qualifierType` [L53] left un-narrowed while `rewardMatchingType` [L65] is narrowed;
//   * the misspelled "Overridden Implicet Getters" banner at [L349]/[L351];
//   * `getSimpleRepresentation()` [L101-L103] floating outside every banner;
//   * `getPromotionPeriod()` invoked twice in one expression at [L360];
//   * the absent validation schema.
//
// The shipped module classifies the double orphan with a marker of its own; this suite
// records the same two facts as parity and claims no finding. THE DIVERGENCE BUDGET SPENT BY
// THIS FILE IS ZERO. The project's three divergences are the un-`var`'d `discountAmount` and
// the `amountOff` float gap (both `src/services`, sibling-owned) and the entity memo fixes
// (owned by `sku.test.ts` and `product.test.ts`). A fourth is forbidden, and this entity
// declares no non-persistent memo for one to live in.
//
// Two runtime failures ARE pinned below, in the `isDeletable()` block. Both are faithful
// reproduction rather than a finding: [L360] dereferences `getPromotionPeriod()` and then
// `getPromotion()` with no guard, both foreign keys are nullable ([L68] and
// [model/entity/PromotionPeriod.cfc:L59] each declare no `notnull`), and CFML raises rather
// than answering `false`. The shipped module is where that is classified; this file pins the
// outcome.
//
// ---------------------------------------------------------------------------
// RULES, FRESHNESS, DATES
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES EXIST FOR THIS PROJECT. `review_rules` was read to completion and
// returns, byte-identically on every probe, `No user rules provided.` No rule governs this
// file, no file enters scope by rule mandate, and none is invented. That absence is not
// licence to lower the bar - the enterprise-standard practices this port commits to apply
// instead, and this suite is held to the same strictness as the module it guards.
//
// EVERY TEST BUILDS ITS OWN SUBJECT AND ITS OWN FAR SIDE. There is deliberately no
// `beforeEach` and no module-level mutable binding: the ten collection accessors hand out
// LIVE arrays, so a shared subject would leak membership across test boundaries. Every
// module-level helper is a FUNCTION returning fresh objects, and every fixture graph is
// built inside the test that reads it.
//
// Every business-date literal is an explicit UTC ISO-8601 string. Nothing here calls
// `new Date()` with no argument, `Date.now()` or `new Date(0)`, and no global fake timer is
// installed: the only clock-dependent branch reachable from this entity is
// `PromotionPeriod.isExpired()`, and the clock is INJECTED into each period double instead.
// `tests/setup.ts` pins the process to UTC before any suite loads.
//
// `afterEach` restores spies. `tests/setup.ts` already does this globally; it is restated so
// the file is self-contained and a reader can see the far-side spies cannot leak.
//
// No assertion below touches a database, the network, the filesystem, an environment
// variable, a credential or a live clock. No non-functional requirement is asserted
// anywhere, because none exists in the source.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { RewardMatchingType } from '../../../../src/domain/entities/promotionQualifier.js';
import { Brand } from '../../../../src/domain/entities/brand.js';
import { Option } from '../../../../src/domain/entities/option.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// FOUR LEVELS UP TO `src`, THREE TO `tests/fixtures`, AND EVERY SPECIFIER ENDS IN `.js`.
// `tsconfig.json` sets `module`/`moduleResolution` to NodeNext and declares no `paths` and no
// `baseUrl`, so extensionless or three-level specifiers would resolve to the nonexistent
// `tests/src/...`. `import type` is a SEPARATE statement rather than an inline `{ type X }`
// qualifier, because `@typescript-eslint/consistent-type-imports` is configured with
// `fixStyle: 'separate-type-imports'` and `no-import-type-side-effects` is an error.
//
// `Brand`, `Option` and `PromotionPeriod` are VALUE imports because this suite constructs
// far-side doubles from them; `RewardMatchingType` is type-only because it is a union alias
// with no runtime existence.
//
// DELIBERATELY ABSENT, each for a stated reason:
//   * `FulfillmentMethod`, `ShippingMethod`, `AddressZone` - the Group A far sides
//     [model/entity/PromotionQualifier.cfc:L73-L75] are OUT OF SCOPE and are not ported.
//     They are opaque identifier strings in the shipped module and are treated as such here.
//     Importing or inventing one would breach the scope boundary.
//   * `Sku`, `Product`, `ProductType` - not in this file's declared dependency set. The three
//     far sides they provide are reached through the fixture graph instead, which is exactly
//     what the fixture module exists for.
//   * `decimal.js` - only the arithmetic surface may import it. Every monetary expectation
//     below is a `Money` or a decimal STRING; no computed JavaScript float appears anywhere.
//   * `src/repositories/**`, `src/handlers/**`, `src/integrations/**`, `src/lib/config.ts`,
//     `src/lib/logger.ts` - a test is not a back door around the domain-inward layer
//     boundary.
//   * any mocking, faker, DOM or AWS package - `vi` from the pinned runner is sufficient, and
//     the two doubles this file spies on are hand-written.

// ---------------------------------------------------------------------------
// TYPES DERIVED FROM THE MODULES UNDER TEST, NEVER RESTATED BY HAND
// ---------------------------------------------------------------------------

/**
 * The subject's constructor parameter object.
 *
 * `src/domain/entities/promotionQualifier.ts` declares its init shape INLINE and exports only
 * the class and the `RewardMatchingType` union, so there is no init type to import. Deriving
 * it keeps this suite honest: if a column is added, removed or retyped upstream, the builders
 * below stop compiling instead of silently drifting past the change.
 */
// JUDGMENT CALL: derive the init shapes with `ConstructorParameters` rather than hand-declaring a
// parallel `type` per entity. Re-declaring would compile today and rot silently the moment a column
// changes upstream, which is the exact failure a characterization suite must not have. Deriving
// costs one extra indirection and buys a compile error instead of a false pass.
type PromotionQualifierInit = ConstructorParameters<typeof PromotionQualifier>[0];

/** The period double's constructor parameter object, derived for the same reason. */
type PromotionPeriodInit = ConstructorParameters<typeof PromotionPeriod>[0];

/** The option double's constructor parameter object, derived for the same reason. */
type OptionInit = ConstructorParameters<typeof Option>[0];

/**
 * The fixture graph, and the ten-gate metadata table it already carries.
 *
 * `tests/fixtures/promotionFixtures.ts` exports exactly one symbol - the factory - and keeps
 * its graph interface module-local, so the shapes are derived from the factory's return type
 * rather than re-declared. `QualifierGateName` in particular is derived from the table's own
 * `gate` field, which is what makes the gate sweeps below exhaustive BY CONSTRUCTION: adding
 * an eleventh gate upstream without adding a reader here is a compile error, not a silent
 * coverage hole.
 */
type PromotionFixtures = ReturnType<typeof makePromotionFixtures>;
type QualifierGateSpec = PromotionFixtures['qualifierGateNullDefaults'][number];
type QualifierGateName = QualifierGateSpec['gate'];

/** One `add*` / `remove*` / `has*` triple, with both sides of its link already bound. */
type MembershipPairProbe = {
  /** The property name as [model/entity/PromotionQualifier.cfc:L77-L87] declares it. */
  readonly property: string;
  /** The physical link table, verbatim and abbreviated. */
  readonly linkTable: string;
  /** Whether the far side is reached through the include family or the exclude family. */
  readonly family: 'include' | 'exclude';
  readonly add: () => void;
  readonly remove: () => void;
  readonly has: () => boolean;
  /** The subject's own collection for this link. */
  readonly nearSide: () => readonly unknown[];
  /** The far side's collection of qualifiers for this link. */
  readonly farSide: () => readonly PromotionQualifier[];
};

// ---------------------------------------------------------------------------
// THE SCHEMA AND SURFACE CONTRACTS, STATED ONCE
// ---------------------------------------------------------------------------

/**
 * The physical table, verbatim.
 *
 * SCHEMA CONTINUITY IS BINDING [model/entity/PromotionQualifier.cfc:L49]: the port reads and
 * writes `SwPromoQual` unchanged - no migration, no rename, no new table, no column change.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L49]: the name is ABBREVIATED - `SwPromoQual`
 * and not `SwPromotionQualifier` - matching `PromotionReward`'s `SwPromoReward`. The
 * abbreviation is carried forward exactly and is never expanded; the assertion below exists so
 * that a well-meaning "correction" fails here rather than at a database.
 */
const LEGACY_TABLE = 'SwPromoQual';

/**
 * All thirteen many-to-many link tables, verbatim, keyed by the property that declares each.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L73-L87]: THIRTEEN owner collections, none
 * marked `inverse="true"`. That is exactly ONE FEWER than `PromotionReward`'s fourteen
 * [model/entity/PromotionReward.cfc:L74 declares `eligiblePriceGroups`, which this entity has
 * no equivalent of]. The single missing collection IS the structural difference between the
 * two entities, and none is invented to close it.
 *
 * Five of the thirteen abbreviate further still - `SwPromoQualExcl*` rather than
 * `SwPromoQualExcluded*` - and `shippingAddressZones` abbreviates differently again, to
 * `SwPromoQualShipAddressZone`. Every abbreviation is preserved.
 */
const LEGACY_LINK_TABLES = {
  fulfillmentMethods: 'SwPromoQualFulfillmentMethod',
  shippingMethods: 'SwPromoQualShippingMethod',
  shippingAddressZones: 'SwPromoQualShipAddressZone',
  brands: 'SwPromoQualBrand',
  options: 'SwPromoQualOption',
  skus: 'SwPromoQualSku',
  products: 'SwPromoQualProduct',
  productTypes: 'SwPromoQualProductType',
  excludedBrands: 'SwPromoQualExclBrand',
  excludedOptions: 'SwPromoQualExclOption',
  excludedSkus: 'SwPromoQualExclSku',
  excludedProducts: 'SwPromoQualExclProduct',
  excludedProductTypes: 'SwPromoQualExclProductType',
} as const;

/**
 * The three Group A properties [model/entity/PromotionQualifier.cfc:L73-L75].
 *
 * CFML parity: `fulfillmentMethods`, `shippingMethods` and `shippingAddressZones` reference
 * `FulfillmentMethod`, `ShippingMethod` and `AddressZone` - all three OUT OF SCOPE and none
 * ported - so they collapse to `readonly string[]` opaque identifiers. That collapse is
 * LOSSLESS with respect to authored logic rather than merely convenient: these are precisely
 * the three of the fourteen relationships for which the component hand-writes NO `add*` and NO
 * `remove*` anywhere in its 373 lines, relying entirely on framework-generated accessors.
 */
const GROUP_A_PROPERTIES = [
  'fulfillmentMethods',
  'shippingMethods',
  'shippingAddressZones',
] as const;

/**
 * The `rewardMatchingType` vocabulary, in the source's own order.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: these are not five plausible
 * values, they are the exact five rows `getRewardMatchingTypeOptions()` returns, and
 * [L65] declares `hb_formFieldType="select"`, so the option list IS the admin form's domain.
 * No sixth member, none renamed, none reordered.
 *
 * Typed as `readonly RewardMatchingType[]` rather than as bare strings, so the union itself is
 * exercised: a typo here is a compile error.
 */
const REWARD_MATCHING_TYPES: readonly RewardMatchingType[] = [
  'any',
  'sku',
  'product',
  'productType',
  'brand',
];

/**
 * The five option `name` fields, verbatim and UNRESOLVED.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: each name is
 * `rbKey('entity.promotionQualifier.rewardMatchingType.<value>')`. JavaRB IS NOT PORTED and no
 * i18n runtime is introduced, so every resource-bundle identifier is preserved verbatim as an
 * INERT STRING CONSTANT and the legacy admin can still resolve it. Nothing below asserts a
 * translated label, because producing one would require a resolver this port does not have.
 */
const REWARD_MATCHING_TYPE_OPTION_KEYS: readonly string[] = [
  'entity.promotionQualifier.rewardMatchingType.any',
  'entity.promotionQualifier.rewardMatchingType.sku',
  'entity.promotionQualifier.rewardMatchingType.product',
  'entity.promotionQualifier.rewardMatchingType.productType',
  'entity.promotionQualifier.rewardMatchingType.brand',
];

/**
 * The `hb_permission` attribute, verbatim.
 *
 * ★ CFML parity [model/entity/PromotionQualifier.cfc:L49]: THIS SPELLING IS CORRECT, and that
 * is worth an assertion of its own. The direct contrast is
 * [model/entity/PromotionReward.cfc:L57], whose equivalent attribute reads
 * `hb_permission="promotionPeriod.promtionRewards"` - missing the `o` in "promotion". The
 * sibling's misspelling is the ONE identifier in that file requiring a documented rename; THIS
 * FILE REQUIRES NONE, and this correctly-spelled control is what proves the sibling's is a
 * typo rather than a convention. (Locator note: the reward's component declaration is at
 * `PromotionReward.cfc:L57`, not the L49 an upstream summary cites - verified by reading the
 * source. Source wins.)
 */
const QUALIFIER_PERMISSION = 'promotionPeriod.promotionQualifiers';

/**
 * Every member the port authors on the prototype, sorted - interface parity in executable form.
 *
 * SEVENTY-ONE names, and every one is a legacy CFML name VERBATIM in camelCase except the three
 * Group A readers, which are renamed to their identifier form (`getFulfillmentMethodIDs` for
 * `fulfillmentMethods`, and so on) because the far sides are opaque strings rather than
 * entities. Nothing is "improved": `getSimpleRepresentationPropertyName`,
 * `hasAnyExcludedOption` and the eleven `add*`/`remove*` pairs all keep their source spelling.
 *
 * `indexOfEntity` is `private static` in the shipped module, so it lives on the constructor and
 * not on the prototype - it adds no instance surface at all, which is asserted below rather
 * than assumed.
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  'addBrand',
  'addExcludedBrand',
  'addExcludedOption',
  'addExcludedProduct',
  'addExcludedProductType',
  'addExcludedSku',
  'addOption',
  'addProduct',
  'addProductType',
  'addSku',
  'getBrands',
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getExcludedBrands',
  'getExcludedOptions',
  'getExcludedProductTypes',
  'getExcludedProducts',
  'getExcludedSkus',
  'getFulfillmentMethodIDs',
  'getMaximumFulfillmentWeight',
  'getMaximumItemPrice',
  'getMaximumItemQuantity',
  'getMaximumOrderQuantity',
  'getMaximumOrderSubtotal',
  'getMinimumFulfillmentWeight',
  'getMinimumItemPrice',
  'getMinimumItemQuantity',
  'getMinimumOrderQuantity',
  'getMinimumOrderSubtotal',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getOptions',
  'getProductTypes',
  'getProducts',
  'getPromotionPeriod',
  'getPromotionQualifierID',
  'getQualifierType',
  'getRemoteID',
  'getRewardMatchingType',
  'getRewardMatchingTypeOptions',
  'getShippingAddressZoneIDs',
  'getShippingMethodIDs',
  'getSimpleRepresentation',
  'getSimpleRepresentationPropertyName',
  'getSkus',
  'hasAnyExcludedOption',
  'hasAnyOption',
  'hasBrand',
  'hasExcludedBrand',
  'hasExcludedOption',
  'hasExcludedProduct',
  'hasExcludedProductType',
  'hasExcludedSku',
  'hasOption',
  'hasProduct',
  'hasProductType',
  'hasSku',
  'isDeletable',
  'isNew',
  'removeBrand',
  'removeExcludedBrand',
  'removeExcludedOption',
  'removeExcludedProduct',
  'removeExcludedProductType',
  'removeExcludedSku',
  'removeOption',
  'removeProduct',
  'removeProductType',
  'removePromotionPeriod',
  'removeSku',
  'setPromotionPeriod',
];

/**
 * The two period-side helpers `PromotionPeriod` calls but this entity does not declare.
 *
 * ⚠️ CFML parity [model/entity/PromotionQualifier.cfc:L121-L137]: the ONLY period-side helpers
 * this component declares are `setPromotionPeriod` [L122-L127] and `removePromotionPeriod`
 * [L128-L137]. There is no `setPromotion` and no `removePromotion` anywhere in its 373 lines.
 *
 * That absence is precisely why [model/entity/PromotionPeriod.cfc:L125-L127]
 * `addPromotionQualifier` - which calls `arguments.promotionQualifier.setPromotion( this )` -
 * and [L128-L130] `removePromotionQualifier` - which calls
 * `arguments.PromotionQualifier.removePromotion( this )` - both THROW. The throws themselves
 * belong to `promotionPeriod.test.ts` and are cited, not re-asserted. What this suite owns is
 * the other half of the explanation: the members really are not here.
 */
const ABSENT_PERIOD_SIDE_HELPERS: readonly string[] = ['setPromotion', 'removePromotion'];

/**
 * Members that would exist if the port had "completed" one of the gaps it deliberately keeps.
 *
 * Four independent scope rulings, asserted rather than merely documented, because a later
 * well-meaning addition would silently undo each one:
 *
 *   * `getQualifierApplicationTypeOptions` - the reader half of the double orphan. [L99]
 *     declares the property; no method for it exists in the source, so none is authored.
 *   * `getQualifierTypeOptions` - `qualifierType` [L53] has NO option list anywhere in the
 *     component, which is exactly why the shipped module leaves that column un-narrowed.
 *   * the four `eligiblePriceGroups` members - `PromotionReward` has that collection
 *     [model/entity/PromotionReward.cfc:L74]; the qualifier does not, and none is invented.
 *   * the nine Group A helpers - no `add*`, `remove*` or `has*` exists for an out-of-scope far
 *     side, matching the source's own silence on all three of those relationships.
 */
const ABSENT_BY_SCOPE_RULING: readonly string[] = [
  'getQualifierApplicationTypeOptions',
  'getQualifierTypeOptions',
  'getEligiblePriceGroups',
  'addEligiblePriceGroup',
  'removeEligiblePriceGroup',
  'hasEligiblePriceGroup',
  'getFulfillmentMethods',
  'addFulfillmentMethod',
  'removeFulfillmentMethod',
  'hasFulfillmentMethod',
  'getShippingMethods',
  'addShippingMethod',
  'removeShippingMethod',
  'hasShippingMethod',
  'getShippingAddressZones',
  'addShippingAddressZone',
  'removeShippingAddressZone',
  'hasShippingAddressZone',
];

/**
 * Framework members the legacy base chain supplied and this port deliberately does not.
 *
 * `extends="HibachiEntity"` [model/entity/PromotionQualifier.cfc:L49] is UNQUALIFIED, so it
 * resolves to the local `model/entity/HibachiEntity.cfc`, which itself extends
 * `Slatwall.org.Hibachi.HibachiEntity`. Neither base level is ported and no Hibachi base-class
 * suite is built here.
 *
 * ★ THE DYNAMIC DISPATCHER IS NOT REPRODUCED. [org/Hibachi/HibachiEntity.cfc:L507-L565] is an
 * `onMissingMethod` dispatcher that terminates in a THROW at L565, and
 * `hasAnyInProperty` [L340-L350] reaches its predicates through `evaluate()` at L344. TypeScript
 * must not emulate that: there is no `Proxy`, no index signature, no `variables.` scope object,
 * no tokenizer and no `eval` anywhere in the port. Only concretely-called members are authored,
 * which is why the shipped module hand-writes ten `has*` predicates plus `hasAnyOption` and
 * `hasAnyExcludedOption` instead.
 *
 * `PromotionQualifier` declares NO `attributeValues` collection [L52-L99 re-read line by line],
 * so the EAV fallback at [org/Hibachi/HibachiEntity.cfc:L559] is unreachable and in CFML an
 * unknown `getX()` on this component throws directly at L565. It is one of the fourteen
 * throwing entities rather than one of the four silent ones. That is documented, not reproduced.
 *
 * The raw `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is
 * likewise not ported.
 */
const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = [
  'getNewFlag',
  'getPrimaryIDValue',
  'getPrimaryIDPropertyName',
  'getPrintTemplates',
  'getEmailTemplates',
  'getAttributeValue',
  'getAttributeValues',
  'clearAttributeCache',
  'hasAnyInProperty',
  'getPropertyAssignedIDList',
  'getFormattedValue',
  'onMissingMethod',
  'preInsert',
  'preUpdate',
  'postInsert',
  'postUpdate',
  'preDelete',
  'postDelete',
];

/**
 * The validation surface that does not exist, and the five declarative validators this entity
 * does not declare.
 *
 * ⚠️ CFML parity [model/validation/]: THERE IS NO `PromotionQualifier.json`. Verified by
 * listing the folder - it holds 96 `.json` files and that is not one of them.
 * `PromotionQualifier` is one of EXACTLY SIX in-scope artefacts with no validation schema,
 * alongside `Category`, `PromotionApplied`, `PromotionAccount`, `Product_AddOption` and
 * `Product_AddOptionGroup`. Measured folder-wide split for the in-scope set: 15 PRESENT,
 * 6 ABSENT (an upstream summary's "12 present" is stale - source wins). THE SIX MUST REMAIN
 * ABSENT: legacy validation gaps are carried as-is and never completed.
 *
 * The five validators listed last are the only entity methods any in-scope schema invokes
 * declaratively - `Sku.hasUniqueOptions`, `Sku.hasOneOptionPerOptionGroup`,
 * `RoundingRule.hasExpressionWithListOfNumericValuesOnly`,
 * `Promotion.getPromotionCodesDeletableFlag` and `PromotionCode.hasUniquePromotionCode`. Not
 * one of them belongs to this entity, and `model/validation/Promotion.json` - read as the
 * reference for what a populated schema looks like - names none of this entity's members.
 *
 * Schema enforcement lives at the service tier in this port, so no zod schema is asserted here.
 */
const ABSENT_VALIDATION_SURFACE: readonly string[] = [
  'validate',
  'hasErrors',
  'getErrors',
  'getValidations',
  'setValidations',
  'populate',
  'hasUniqueOptions',
  'hasOneOptionPerOptionGroup',
  'hasExpressionWithListOfNumericValuesOnly',
  'getPromotionCodesDeletableFlag',
  'hasUniquePromotionCode',
];

// ---------------------------------------------------------------------------
// GATE READERS - one per gate, keyed by the fixture table's own `gate` field
// ---------------------------------------------------------------------------

/**
 * Every gate's accessor, keyed by property name.
 *
 * EXHAUSTIVE BY CONSTRUCTION: `QualifierGateName` is derived from the fixture table's `gate`
 * field, and `Record<QualifierGateName, ...>` therefore fails to compile if a gate is added
 * upstream and not given a reader here. The value type is the honest union of the two shipped
 * return shapes - `Money | number | undefined` - and is narrowed at each assertion site rather
 * than being widened away.
 */
const GATE_READERS: Readonly<
  Record<QualifierGateName, (subject: PromotionQualifier) => Money | number | undefined>
> = {
  minimumOrderQuantity: (subject) => subject.getMinimumOrderQuantity(),
  maximumOrderQuantity: (subject) => subject.getMaximumOrderQuantity(),
  minimumOrderSubtotal: (subject) => subject.getMinimumOrderSubtotal(),
  maximumOrderSubtotal: (subject) => subject.getMaximumOrderSubtotal(),
  minimumItemQuantity: (subject) => subject.getMinimumItemQuantity(),
  maximumItemQuantity: (subject) => subject.getMaximumItemQuantity(),
  minimumItemPrice: (subject) => subject.getMinimumItemPrice(),
  maximumItemPrice: (subject) => subject.getMaximumItemPrice(),
  minimumFulfillmentWeight: (subject) => subject.getMinimumFulfillmentWeight(),
  maximumFulfillmentWeight: (subject) => subject.getMaximumFulfillmentWeight(),
};

/**
 * The accessor NAME for each gate, so the surface can be checked as well as the value.
 *
 * Composed mechanically from the property name rather than restated, which is the point: the
 * shipped module derives each accessor from its column, so a hand-written list could agree with
 * itself while disagreeing with the entity.
 *
 * @param gate - the property name as [model/entity/PromotionQualifier.cfc:L55-L64] declares it.
 * @returns the camelCase getter name the port authors for it.
 */
function gateAccessorName(gate: QualifierGateName): string {
  return `get${gate.charAt(0).toUpperCase()}${gate.slice(1)}`;
}

// ---------------------------------------------------------------------------
// INSTANTS - every one an explicit UTC ISO-8601 literal
// ---------------------------------------------------------------------------
//
// These deliberately coincide with the instants `tests/fixtures/promotionFixtures.ts` uses, so
// a period double built here and a period taken from the fixture graph are read against the
// SAME clock and can never silently disagree about expiry. Nothing below reads a live clock:
// there is no no-argument `new Date()`, no `Date.now()`, no `new Date(0)` and no fake timer.

/** The single "current" instant every assertion in this file is evaluated at. */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/** A period bound that has not yet been reached at `NOW_UTC`. */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/** A period bound already passed at `NOW_UTC`, so `isExpired()` answers true. */
const EXPIRED_PERIOD_END_UTC = '2024-02-01T00:00:00.000Z';

/** The audit instants, used to prove the columns are real dates and never an epoch stand-in. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * A deterministic clock, injected rather than installed.
 *
 * `PromotionPeriod` takes `now: () => Date` as a constructor argument, which is the port's
 * replacement for CFML's ambient `now()` [model/entity/PromotionPeriod.cfc:L84]. Injecting is
 * what lets `isDeletable()`'s expiry branch be exercised without a global fake timer. A FRESH
 * `Date` is returned on every call so no mutable instant escapes into a subject.
 *
 * @param instantUTC - an explicit UTC ISO-8601 literal.
 * @returns a clock that always reports that instant.
 */
function fixedClock(instantUTC: string): () => Date {
  const epochMilliseconds: number = new Date(instantUTC).getTime();
  return () => new Date(epochMilliseconds);
}

// ---------------------------------------------------------------------------
// FRESH SUBJECTS AND FRESH FAR SIDES - functions, never shared literals
// ---------------------------------------------------------------------------

/**
 * The columns of an unsaved qualifier, all thirty-three slots explicit.
 *
 * A FUNCTION rather than a shared literal, so every subject is built from a fresh object and no
 * test can reach another test's data. That matters more here than on most entities: the ten
 * entity-collection accessors hand out LIVE arrays, so one shared subject would leak membership
 * across test boundaries.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L52]: `promotionQualifierID` starts `''`
 * rather than absent, because `unsavedvalue="" default=""` is what makes the empty string the
 * honest answer for a row that has never been saved - and what makes `isNew()` a simple
 * emptiness test.
 *
 * Every nullable column starts `undefined`. For the ten gates that is the WHOLE POINT: [L55-L64]
 * declares no `default=` on any of them, so a fresh qualifier gates nothing.
 *
 * @returns a fresh, fully-populated init object for an unsaved row.
 */
function unsavedRowColumns(): PromotionQualifierInit {
  return {
    promotionQualifierID: '',
    qualifierType: undefined,
    minimumOrderQuantity: undefined,
    maximumOrderQuantity: undefined,
    minimumOrderSubtotal: undefined,
    maximumOrderSubtotal: undefined,
    minimumItemQuantity: undefined,
    maximumItemQuantity: undefined,
    minimumItemPrice: undefined,
    maximumItemPrice: undefined,
    minimumFulfillmentWeight: undefined,
    maximumFulfillmentWeight: undefined,
    rewardMatchingType: undefined,
    promotionPeriod: undefined,
    fulfillmentMethodIDs: undefined,
    shippingMethodIDs: undefined,
    shippingAddressZoneIDs: undefined,
    brands: undefined,
    options: undefined,
    skus: undefined,
    products: undefined,
    productTypes: undefined,
    excludedBrands: undefined,
    excludedOptions: undefined,
    excludedSkus: undefined,
    excludedProducts: undefined,
    excludedProductTypes: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  };
}

/**
 * Builds one qualifier, overriding only what a test is about.
 *
 * @param overrides - the columns this test cares about; everything else stays unsaved-default.
 * @returns a fresh `PromotionQualifier`.
 */
function aQualifier(overrides: Partial<PromotionQualifierInit> = {}): PromotionQualifier {
  return new PromotionQualifier({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds a SAVED qualifier - one whose primary key is non-empty.
 *
 * The distinction is load-bearing rather than cosmetic. `isNew()` is the left operand of every
 * far-side guard in this component [L124, L144, L164, ...], CFML `or` short-circuits, and the
 * containment fallback in the shipped module switches from primary-key comparison to reference
 * identity when a key is empty. A test that means "a persisted row" must say so explicitly.
 *
 * @param promotionQualifierID - the non-empty key to give it.
 * @param overrides - any further columns.
 * @returns a fresh, saved `PromotionQualifier`.
 */
function aSavedQualifier(
  promotionQualifierID: string,
  overrides: Partial<PromotionQualifierInit> = {},
): PromotionQualifier {
  return aQualifier({ ...overrides, promotionQualifierID });
}

/**
 * Builds a brand double.
 *
 * `Brand`'s constructor is entirely optional and defaults `brandID` to `''`, so omitting the
 * argument yields a TRANSIENT brand - which is exactly the input the `arguments.brand.isNew()`
 * half of the near-side guard [model/entity/PromotionQualifier.cfc:L141] needs.
 *
 * @param brandID - the key, or omitted for a transient brand.
 * @returns a fresh `Brand` holding no qualifiers on either far-side collection.
 */
function aBrand(brandID?: string): Brand {
  return brandID === undefined ? new Brand() : new Brand({ brandID });
}

/**
 * Builds an option double, all twelve required slots explicit.
 *
 * `optionGroup` is `undefined`, which is deliberate and not laziness: it keeps `OptionGroup` out
 * of this file's import set, and this suite asserts nothing about option grouping - the
 * `sortContext="optionGroup"` ordering belongs to `optionGroup.test.ts`.
 *
 * @param optionID - the key, or `''` for a transient option.
 * @returns a fresh `Option` holding no qualifiers on either far-side collection.
 */
function anOption(optionID: string): Option {
  const columns: OptionInit = {
    optionID,
    optionCode: undefined,
    optionName: undefined,
    optionDescription: undefined,
    sortOrder: undefined,
    optionGroup: undefined,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  };
  return new Option(columns);
}

/**
 * The `promotion` slot's type, derived rather than imported.
 *
 * `Promotion` is NOT in this file's declared dependency set, and it does not need to be: the
 * only promotions this suite uses come from the fixture graph, and the only place the type is
 * needed is this one parameter. Deriving it from the period's own init shape keeps the import
 * ledger closed without resorting to a widened parameter.
 */
type PromotionForPeriod = PromotionPeriodInit['promotion'];

/**
 * Builds a promotion-period double with an injected clock.
 *
 * Written with an EXPLICIT spec rather than a `Partial` spread, because two of
 * `PromotionPeriod`'s optional init keys are declared without `| undefined` and
 * `exactOptionalPropertyTypes` makes passing `undefined` for them an error. Naming the four
 * things a test actually varies is clearer than working around that.
 *
 * `startDateTime` is fixed and never varied: `isExpired()`
 * [model/entity/PromotionPeriod.cfc:L83-L85] reads only the END bound, and the START bound
 * belongs to `isCurrent()` [L78-L81], which `promotionPeriod.test.ts` owns.
 *
 * @param spec.promotionPeriodID - the period's key.
 * @param spec.endDateTimeUTC - the end bound, or `undefined` to make `isExpired()` answer false
 *   through its guarded branch.
 * @param spec.promotion - the parent promotion, or `undefined` to leave the many-to-one
 *   unmaterialized.
 * @returns a fresh `PromotionQualifier`-free `PromotionPeriod` reading the `NOW_UTC` clock.
 */
// JUDGMENT CALL: an explicit three-field spec instead of `Partial<PromotionPeriodInit>`.
// `PromotionPeriod` declares `promotionRewards?` and `promotionQualifiers?` WITHOUT `| undefined`,
// so under `exactOptionalPropertyTypes` a spread that forwards `undefined` for them fails to
// compile. Omitting the keys is the correct fix, and naming only the three fields a test actually
// varies is clearer than a `Partial` plus a comment explaining what may not be put in it.
function aPromotionPeriod(spec: {
  readonly promotionPeriodID: string;
  readonly endDateTimeUTC: string | undefined;
  readonly promotion: PromotionForPeriod;
}): PromotionPeriod {
  return new PromotionPeriod({
    promotionPeriodID: spec.promotionPeriodID,
    startDateTime: new Date(CREATED_DATE_TIME_UTC),
    endDateTime: spec.endDateTimeUTC === undefined ? undefined : new Date(spec.endDateTimeUTC),
    maximumUseCount: undefined,
    maximumAccountUseCount: undefined,
    promotion: spec.promotion,
    promotionID: undefined,
    remoteID: undefined,
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: fixedClock(NOW_UTC),
  });
}

/**
 * A fresh fixture graph.
 *
 * Called INSIDE each test that needs one rather than hoisted, so the entities it hands out -
 * whose collections are live arrays - can never be shared across a test boundary.
 *
 * @returns a fresh graph built at the fixture module's own default instant.
 */
function freshFixtures(): PromotionFixtures {
  return makePromotionFixtures();
}

/**
 * The first promotion period of a fixture promotion, without a non-null assertion.
 *
 * `noUncheckedIndexedAccess` makes `periods[0]` a `PromotionPeriod | undefined`, and a postfix
 * `!` is not used anywhere in this file. Raising on an empty array turns a broken fixture
 * invariant into a legible failure instead of a confusing `undefined` three assertions later.
 *
 * @param periods - the promotion's materialized period collection.
 * @param label - what the caller was reaching for, for the failure message.
 * @returns the first period.
 * @throws Error when the collection is empty.
 */
function firstPeriodOf(periods: readonly PromotionPeriod[], label: string): PromotionPeriod {
  const [period] = periods;
  if (period === undefined) {
    throw new Error(`fixture invariant broken: ${label} exposes no promotion period`);
  }
  return period;
}

/**
 * The prototype's own members, minus the constructor, sorted.
 *
 * @returns every member name the class installs on instances.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionQualifier.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  // A2: the far-side spies below must not outlive their test. `tests/setup.ts` already restores
  // globally; restating it keeps the guarantee local and visible.
  vi.restoreAllMocks();
});

/**
 * All ten entity-collection helper triples, each with both sides of its link already bound.
 *
 * Ten rows, not thirteen: Group A [model/entity/PromotionQualifier.cfc:L73-L75] has no helpers
 * to probe. The `Brand` and `Option` far sides are built here; the `Sku`, `Product` and
 * `ProductType` far sides come from the fixture graph, because those three modules are outside
 * this file's declared dependency set and reaching them through the fixture is exactly what the
 * fixture exists for.
 *
 * The include row and the exclude row of a given far side may safely share one object: they
 * touch DIFFERENT collections on it - `getPromotionQualifiers()` versus
 * `getPromotionQualifierExclusions()` - which is itself one of the invariants asserted below.
 *
 * @param subject - the qualifier under test; every closure is bound to it.
 * @param fixtures - a fresh graph, supplying the three far sides not constructed here.
 * @returns ten probes in declaration order [L77-L87].
 */
// JUDGMENT CALL: build the `Brand` and `Option` far sides locally but take `Sku`, `Product` and
// `ProductType` from the fixture graph. Those three modules are NOT in this file's declared
// dependency set, and reaching for them directly would widen the import ledger past what the schema
// permits; the fixture is the sanctioned channel for exactly that. The cost is that three of the ten
// probes carry pre-built entities rather than minimal ones, which is why every sweep asserts the far
// side is CLEAN before it acts rather than assuming an empty starting state.
function membershipPairProbes(
  subject: PromotionQualifier,
  fixtures: PromotionFixtures,
): readonly MembershipPairProbe[] {
  const brand: Brand = aBrand('probe-brand');
  const excludedBrand: Brand = aBrand('probe-excluded-brand');
  const option: Option = anOption('probe-option');
  const excludedOption: Option = anOption('probe-excluded-option');
  const { sku, product, productType, excludedProductType } = fixtures;

  return [
    {
      property: 'brands',
      linkTable: LEGACY_LINK_TABLES.brands,
      family: 'include',
      add: () => {
        subject.addBrand(brand);
      },
      remove: () => {
        subject.removeBrand(brand);
      },
      has: () => subject.hasBrand(brand),
      nearSide: () => subject.getBrands(),
      farSide: () => brand.getPromotionQualifiers(),
    },
    {
      property: 'options',
      linkTable: LEGACY_LINK_TABLES.options,
      family: 'include',
      add: () => {
        subject.addOption(option);
      },
      remove: () => {
        subject.removeOption(option);
      },
      has: () => subject.hasOption(option),
      nearSide: () => subject.getOptions(),
      farSide: () => option.getPromotionQualifiers(),
    },
    {
      property: 'skus',
      linkTable: LEGACY_LINK_TABLES.skus,
      family: 'include',
      add: () => {
        subject.addSku(sku);
      },
      remove: () => {
        subject.removeSku(sku);
      },
      has: () => subject.hasSku(sku),
      nearSide: () => subject.getSkus(),
      farSide: () => sku.getPromotionQualifiers(),
    },
    {
      property: 'products',
      linkTable: LEGACY_LINK_TABLES.products,
      family: 'include',
      add: () => {
        subject.addProduct(product);
      },
      remove: () => {
        subject.removeProduct(product);
      },
      has: () => subject.hasProduct(product),
      nearSide: () => subject.getProducts(),
      farSide: () => product.getPromotionQualifiers(),
    },
    {
      property: 'productTypes',
      linkTable: LEGACY_LINK_TABLES.productTypes,
      family: 'include',
      add: () => {
        subject.addProductType(productType);
      },
      remove: () => {
        subject.removeProductType(productType);
      },
      has: () => subject.hasProductType(productType),
      nearSide: () => subject.getProductTypes(),
      farSide: () => productType.getPromotionQualifiers(),
    },
    {
      property: 'excludedBrands',
      linkTable: LEGACY_LINK_TABLES.excludedBrands,
      family: 'exclude',
      add: () => {
        subject.addExcludedBrand(excludedBrand);
      },
      remove: () => {
        subject.removeExcludedBrand(excludedBrand);
      },
      has: () => subject.hasExcludedBrand(excludedBrand),
      nearSide: () => subject.getExcludedBrands(),
      farSide: () => excludedBrand.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedOptions',
      linkTable: LEGACY_LINK_TABLES.excludedOptions,
      family: 'exclude',
      add: () => {
        subject.addExcludedOption(excludedOption);
      },
      remove: () => {
        subject.removeExcludedOption(excludedOption);
      },
      has: () => subject.hasExcludedOption(excludedOption),
      nearSide: () => subject.getExcludedOptions(),
      farSide: () => excludedOption.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedSkus',
      linkTable: LEGACY_LINK_TABLES.excludedSkus,
      family: 'exclude',
      add: () => {
        subject.addExcludedSku(sku);
      },
      remove: () => {
        subject.removeExcludedSku(sku);
      },
      has: () => subject.hasExcludedSku(sku),
      nearSide: () => subject.getExcludedSkus(),
      farSide: () => sku.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedProducts',
      linkTable: LEGACY_LINK_TABLES.excludedProducts,
      family: 'exclude',
      add: () => {
        subject.addExcludedProduct(product);
      },
      remove: () => {
        subject.removeExcludedProduct(product);
      },
      has: () => subject.hasExcludedProduct(product),
      nearSide: () => subject.getExcludedProducts(),
      farSide: () => product.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedProductTypes',
      linkTable: LEGACY_LINK_TABLES.excludedProductTypes,
      family: 'exclude',
      add: () => {
        subject.addExcludedProductType(excludedProductType);
      },
      remove: () => {
        subject.removeExcludedProductType(excludedProductType);
      },
      has: () => subject.hasExcludedProductType(excludedProductType),
      nearSide: () => subject.getExcludedProductTypes(),
      farSide: () => excludedProductType.getPromotionQualifierExclusions(),
    },
  ];
}

// ===========================================================================
// 1. THE PORTED SURFACE, AND WHAT IS DELIBERATELY ABSENT
// ===========================================================================

describe('the ported surface is the legacy surface, and four scope rulings hold', () => {
  it('installs exactly the seventy-one authored members and nothing else', () => {
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(71);
  });

  it('keeps every legacy method name verbatim, including the ones that read oddly', () => {
    // C4 interface parity: the acceptance contract is a name-for-name diff against the CFC, so
    // `hasAnyExcludedOption` is not "improved" to `hasAnyOptionExclusion`, and
    // `getSimpleRepresentationPropertyName` keeps all five words.
    for (const legacyName of [
      'getRewardMatchingTypeOptions',
      'getSimpleRepresentation',
      'getSimpleRepresentationPropertyName',
      'hasAnyOption',
      'hasAnyExcludedOption',
      'setPromotionPeriod',
      'removePromotionPeriod',
      'isDeletable',
      'isNew',
    ]) {
      expect(PORTED_PUBLIC_SURFACE).toContain(legacyName);
    }
  });

  it('exposes eleven bidirectional helper pairs and not one more', () => {
    // CFML parity [model/entity/PromotionQualifier.cfc:L119-L339]: the largest section of the
    // component, 221 lines, holds ELEVEN pairs - one many-to-one plus ten many-to-many - for
    // FOURTEEN relationships. The three with no hand-written helper anywhere are exactly Group A.
    const helpers = prototypeMembers().filter(
      (name: string) =>
        name.startsWith('add') || name.startsWith('remove') || name.startsWith('set'),
    );

    expect(helpers).toHaveLength(22);
    expect(helpers.filter((name: string) => name.startsWith('add'))).toHaveLength(10);
    expect(helpers.filter((name: string) => name.startsWith('remove'))).toHaveLength(11);
    expect(helpers.filter((name: string) => name.startsWith('set'))).toHaveLength(1);
  });

  it('declares no setPromotion and no removePromotion, which is why the period helpers throw', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of ABSENT_PERIOD_SIDE_HELPERS) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }

    // The two members that DO exist, and are the only period-side helpers [L122, L128].
    expect(members).toContain('setPromotionPeriod');
    expect(members).toContain('removePromotionPeriod');
  });

  it('widens no signature, so every member keeps its legacy arity', () => {
    // ★ INTERFACE PARITY IS THE ACCEPTANCE CONTRACT, AND ARITY IS HALF OF IT. A reviewer diffing
    // the two surfaces checks names AND parameter counts, so arity is asserted mechanically here
    // rather than left to a comment.
    //
    // THE ENTITY-LAYER WIDENING BUDGET IS ALREADY SPENT, AND NOT BY THIS FILE. The one permitted
    // widening across the whole port is `PromotionPeriod.isCurrent(now)`
    // [model/entity/PromotionPeriod.cfc:L78], which takes an injected clock so the UTC policy is
    // explicit - and `promotionPeriod.test.ts` owns it. A SECOND WIDENING IS FORBIDDEN.
    //
    // `isDeletable()` is exactly where a second one would have been tempting: its chain reaches a
    // clock through `PromotionPeriod.isExpired()`, so accepting a `now` parameter would have looked
    // like consistency. It must NOT, because the clock belongs to the period that owns the date
    // column, and this entity has none. Asserted at zero parameters.
    const prototype: object = PromotionQualifier.prototype;
    const legacyArity: Readonly<Record<string, number>> = {
      // Zero-argument members - readers, the two overrides, and the option list.
      getPromotionQualifierID: 0,
      getQualifierType: 0,
      getRewardMatchingType: 0,
      getRewardMatchingTypeOptions: 0,
      getPromotionPeriod: 0,
      getSimpleRepresentation: 0,
      getSimpleRepresentationPropertyName: 0,
      isNew: 0,
      // ★ ZERO, NOT ONE. No clock is threaded into this entity.
      isDeletable: 0,
      // One-argument members - the predicates and the helpers.
      hasBrand: 1,
      hasExcludedBrand: 1,
      hasAnyOption: 1,
      hasAnyExcludedOption: 1,
      addBrand: 1,
      removeBrand: 1,
      addExcludedOption: 1,
      removeExcludedOption: 1,
      setPromotionPeriod: 1,
      // `removePromotionPeriod(promotionPeriod?)` reports 1, and MEASURING THAT CORRECTED A WRONG
      // ASSUMPTION OF MINE: `Function.prototype.length` excludes only parameters carrying a DEFAULT
      // VALUE (and a rest parameter). A TypeScript `?` is a type-level annotation that compiles to
      // an ordinary parameter, so an optional-but-undefaulted parameter still counts. 1 is also the
      // parity-correct number - the legacy declares
      // `removePromotionPeriod(required any promotionPeriod)` and `PromotionPeriod` calls it with
      // no argument [model/entity/PromotionPeriod.cfc:L129-L132], which is precisely why the port
      // made the parameter optional while keeping the arity.
      removePromotionPeriod: 1,
    };

    for (const [member, arity] of Object.entries(legacyArity)) {
      const implementation: unknown = (prototype as Record<string, unknown>)[member];

      expect(typeof implementation, `${member} must be a method`).toBe('function');
      expect((implementation as (...args: never[]) => unknown).length, `${member} arity`).toBe(
        arity,
      );
    }

    // And the ten gate readers all take nothing - a gate is a column, not a query.
    for (const gate of Object.keys(GATE_READERS) as readonly QualifierGateName[]) {
      const reader: unknown = (prototype as Record<string, unknown>)[gateAccessorName(gate)];
      expect((reader as (...args: never[]) => unknown).length, `${gate} reader arity`).toBe(0);
    }
  });

  it('completes none of the four gaps it deliberately keeps', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of ABSENT_BY_SCOPE_RULING) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }

    expect(ABSENT_BY_SCOPE_RULING).toHaveLength(18);
  });

  it('ports no framework member and reproduces no dynamic dispatch', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(absent);
    }

    // ★ NO `Proxy`, AND THIS IS THE ASSERTION THAT PROVES IT. A proxy carrying a `has` trap - the
    // only way to emulate [org/Hibachi/HibachiEntity.cfc:L507-L565]'s `onMissingMethod` in
    // TypeScript - would answer `true` here. The port answers `false`, so an unknown member is
    // simply absent rather than dynamically synthesised or dynamically thrown.
    expect('getSomeMemberThatWasNeverDeclared' in subject).toBe(false);
    expect(Object.getPrototypeOf(subject)).toBe(PromotionQualifier.prototype);
  });

  it('adds no instance surface through its private comparison helper', () => {
    const subject = aQualifier();

    // `indexOfEntity` is `private static` in the shipped module, so it lives on the constructor.
    // It is the port's own primary-key comparison, standing in for the CFML `arrayFind`
    // object-reference searches at [model/entity/PromotionQualifier.cfc:L132, L149, L169];
    // it is not part of the interface-parity contract and must not appear on an instance.
    expect(prototypeMembers()).not.toContain('indexOfEntity');
    expect('indexOfEntity' in subject).toBe(false);
    expect(Object.getOwnPropertyNames(PromotionQualifier)).toContain('indexOfEntity');
  });

  it('injects no collaborator port and no clock', () => {
    // CFML parity: a full read of all 373 lines finds ZERO `getService(` sites in this component,
    // so nothing is injected and the constructor takes DATA ONLY. (Verified census across the
    // eighteen in-scope entities: 45 sites in total - Product 18, Sku 19, ProductType 6,
    // OptionGroup 1, RoundingRule 1 - and this entity contributes none.) The consequence is that
    // every member is synchronous and total with respect to I/O: no `async`, no `await`, no
    // `Promise` is reachable from here.
    const subject = aQualifier({ promotionQualifierID: 'q-no-collaborators' });

    expect(subject.getPromotionQualifierID()).toBe('q-no-collaborators');

    // @ts-expect-error - the constructor accepts columns and materialized associations only; a
    // clock is not one of its slots, and `PromotionPeriod` is the entity that takes one.
    const withClock = aQualifier({ now: fixedClock(NOW_UTC) });
    expect(withClock.getPromotionQualifierID()).toBe('');
  });
});

// ===========================================================================
// 2. ★ THE TEN NUMERIC GATES AND THEIR ASYMMETRIC ABSENCE SEMANTICS
// ===========================================================================
//
// ★ CFML parity [model/entity/PromotionQualifier.cfc:L55-L64]: the ten gates carry ASYMMETRIC
// null semantics -- every minimum* declares hb_nullRBKey="define.0" (absent means zero, i.e. no
// lower bound) while every maximum* declares hb_nullRBKey="define.unlimited" (absent means no
// upper bound). Both are modelled as undefined; coercing a maximum to 0 would forbid every
// order.
//
// The asymmetry is systematic rather than incidental - it holds for all five pairs, across all
// three type families - and there is NO `default=` attribute on any of the ten, so a freshly
// constructed qualifier gates nothing at all. `hb_nullRBKey` is a DISPLAY hint naming the label
// the admin shows for an empty column; it is not an ORM default and must never be materialised
// into one. Coalescing a `minimum*` to `0` would be wrong for the same reason even though it
// looks harmless: it would turn "no lower bound configured" into "a lower bound of zero was
// configured", and the two are different rows.
//
// WHAT THIS BLOCK DOES NOT DO: it asserts nothing about how the gates are COMPARED. The
// comparison cascade [model/service/PromotionService.cfc:L629-L750] is sibling-owned. Only the
// accessors' shapes and their absence semantics are pinned here.
//
// JUDGMENT CALL: sweep the ten gates through a derived reader table rather than writing ten
// hand-rolled assertions per property. The table's key type comes from the fixture's own gate list,
// so an eleventh gate added upstream is a COMPILE ERROR here rather than a silent coverage hole -
// which a hand-rolled set of assertions could never give. Where a sweep would obscure the point,
// the individual gates are still named explicitly: the type-family block spells all ten out.

describe('the ten numeric gates carry asymmetric absence semantics', () => {
  it('declares exactly ten gates, five lower bounds and five upper bounds', () => {
    const gates: readonly QualifierGateSpec[] = freshFixtures().qualifierGateNullDefaults;

    expect(gates).toHaveLength(10);
    expect(Object.keys(GATE_READERS)).toHaveLength(10);
    expect(gates.filter((gate) => gate.bound === 'minimum')).toHaveLength(5);
    expect(gates.filter((gate) => gate.bound === 'maximum')).toHaveLength(5);
  });

  it('gives every minimum define.0 and every maximum define.unlimited', () => {
    const gates: readonly QualifierGateSpec[] = freshFixtures().qualifierGateNullDefaults;

    for (const gate of gates) {
      if (gate.bound === 'minimum') {
        expect(gate.gate.startsWith('minimum')).toBe(true);
        expect(gate.nullRBKey).toBe('define.0');
      } else {
        expect(gate.gate.startsWith('maximum')).toBe(true);
        expect(gate.nullRBKey).toBe('define.unlimited');
      }
    }

    // Stated once more as a whole-table claim, so a single row drifting fails loudly.
    expect(gates.filter((gate) => gate.nullRBKey === 'define.0').map((gate) => gate.gate)).toEqual([
      'minimumOrderQuantity',
      'minimumOrderSubtotal',
      'minimumItemQuantity',
      'minimumItemPrice',
      'minimumFulfillmentWeight',
    ]);
    expect(
      gates.filter((gate) => gate.nullRBKey === 'define.unlimited').map((gate) => gate.gate),
    ).toEqual([
      'maximumOrderQuantity',
      'maximumOrderSubtotal',
      'maximumItemQuantity',
      'maximumItemPrice',
      'maximumFulfillmentWeight',
    ]);
  });

  it('authors one accessor per gate, named from the column', () => {
    const members = prototypeMembers();

    for (const gate of Object.keys(GATE_READERS) as readonly QualifierGateName[]) {
      expect(members).toContain(gateAccessorName(gate));
    }
  });

  it('resolves every gate to undefined when the column is absent', () => {
    const subject = aQualifier();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      const value: Money | number | undefined = read(subject);

      expect(value, `${gate} must be undefined when absent`).toBeUndefined();
    }
  });

  it('never coerces an absent gate to zero, on either bound', () => {
    // ★ THE HIGHEST-CONSEQUENCE ASSERTION IN THIS BLOCK. For a `maximum*`, substituting `0` for
    // absence inverts the rule from "no upper bound" to "an upper bound of nothing", which would
    // reject every order the promotion was meant to reward. For a `minimum*` it is a quieter but
    // equally real error: it fabricates a configured floor where the row has none.
    const subject = aQualifier();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      const value: Money | number | undefined = read(subject);

      expect(value, `${gate} must not be numeric zero`).not.toBe(0);
      expect(value, `${gate} must not be a Money zero`).not.toBeInstanceOf(Money);
      expect(typeof value, `${gate} must not be a number at all`).not.toBe('number');
    }
  });

  it('reads every gate as undefined on the fixture graph permissive qualifier too', () => {
    // A second, independently constructed witness: the fixture module builds this exhibit with
    // all ten columns omitted, which is the shape a repository hands back for a row that gates
    // nothing. Two witnesses rather than one, because the absence semantics are the whole point.
    const { permissivePromotionQualifier } = freshFixtures();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      expect(
        read(permissivePromotionQualifier),
        `${gate} on the permissive qualifier`,
      ).toBeUndefined();
    }
  });

  it('keeps an explicit zero distinguishable from absence on a lower bound', () => {
    const configured = aQualifier({
      minimumOrderQuantity: 0,
      minimumOrderSubtotal: Money.fromDecimalString('0'),
    });
    const absent = aQualifier();

    expect(configured.getMinimumOrderQuantity()).toBe(0);
    expect(configured.getMinimumOrderQuantity()).not.toBeUndefined();
    expect(absent.getMinimumOrderQuantity()).toBeUndefined();

    // P4: the monetary bound is compared through `Money`, never through a JavaScript number.
    expect(configured.getMinimumOrderSubtotal()?.toFixed2()).toBe('0.00');
    expect(configured.getMinimumOrderSubtotal()?.equals(Money.zero)).toBe(true);
    expect(absent.getMinimumOrderSubtotal()).toBeUndefined();
  });

  it('keeps an explicit zero distinguishable from absence on an upper bound', () => {
    // A `maximumOrderQuantity` of 0 is a REAL, restrictive configuration: nothing qualifies. An
    // ABSENT `maximumOrderQuantity` is its opposite: everything qualifies. The two must never
    // collapse into one another, which is exactly what a `?? 0` anywhere in the port would do.
    const configured = aQualifier({
      maximumOrderQuantity: 0,
      maximumItemPrice: Money.fromDecimalString('0'),
    });
    const absent = aQualifier();

    expect(configured.getMaximumOrderQuantity()).toBe(0);
    expect(absent.getMaximumOrderQuantity()).toBeUndefined();
    expect(configured.getMaximumOrderQuantity()).not.toBe(absent.getMaximumOrderQuantity());

    expect(configured.getMaximumItemPrice()?.toFixed2()).toBe('0.00');
    expect(absent.getMaximumItemPrice()).toBeUndefined();
  });

  it('hands every configured gate straight back, unmodified', () => {
    // The entity is a CARRIER for these ten columns: no clamping, no normalisation, no reordering
    // of a min/max pair, and no rejection of a maximum below its minimum. Anything that decides
    // what an inconsistent pair MEANS is the engine's, and is not here.
    const subject = aQualifier({
      minimumOrderQuantity: 9,
      maximumOrderQuantity: 2,
      minimumOrderSubtotal: Money.fromDecimalString('500.00'),
      maximumOrderSubtotal: Money.fromDecimalString('25.00'),
      minimumItemQuantity: -4,
      maximumItemQuantity: 10,
      minimumItemPrice: Money.fromDecimalString('199.99'),
      maximumItemPrice: Money.fromDecimalString('9.99'),
      minimumFulfillmentWeight: 50,
      maximumFulfillmentWeight: 1,
    });

    expect(subject.getMinimumOrderQuantity()).toBe(9);
    expect(subject.getMaximumOrderQuantity()).toBe(2);
    expect(subject.getMinimumOrderSubtotal()?.toFixed2()).toBe('500.00');
    expect(subject.getMaximumOrderSubtotal()?.toFixed2()).toBe('25.00');
    expect(subject.getMinimumItemQuantity()).toBe(-4);
    expect(subject.getMaximumItemQuantity()).toBe(10);
    expect(subject.getMinimumItemPrice()?.toFixed2()).toBe('199.99');
    expect(subject.getMaximumItemPrice()?.toFixed2()).toBe('9.99');
    expect(subject.getMinimumFulfillmentWeight()).toBe(50);
    expect(subject.getMaximumFulfillmentWeight()).toBe(1);
  });
});

// ===========================================================================
// 3. ⚠️ THREE TYPE FAMILIES ACROSS TEN GATES - AND WEIGHT IS NOT MONEY
// ===========================================================================
//
// CFML parity [model/entity/PromotionQualifier.cfc:L63-L64]: minimumFulfillmentWeight and
// maximumFulfillmentWeight are ormtype="big_decimal" like the currency gates, but
// hb_formatType="weight" -- they are WEIGHTS, not money, and must NOT be modelled as Money.
// Verified against the shipped surface.
//
// So `ormtype` alone does NOT decide the target type; `hb_formatType` does. Four gates are
// `currency` [L57, L58, L61, L62] and become `Money`. Four are `ormtype="integer"` with no format
// type at all [L55, L56, L59, L60] and become `number`. Two are `big_decimal` + `weight`
// [L63, L64] and become `number` as well - typing a shipping weight as `Money` would assert a
// currency the column does not have and would hand the value currency formatting it must never
// receive. THIS ENTITY HAS NO `currencyCode` COLUMN, so even the four monetary gates carry no
// currency of their own; they are compared against amounts whose currency is resolved elsewhere.
//
// P4 is honoured throughout: every monetary expectation is a `Money` or a decimal STRING, and no
// computed JavaScript float appears anywhere - not even for the two weight gates.

describe('the ten gates split into three type families, and weight is never Money', () => {
  it('classifies exactly four gates as monetary and six as plain numbers', () => {
    const gates: readonly QualifierGateSpec[] = freshFixtures().qualifierGateNullDefaults;

    expect(gates.filter((gate) => gate.isMonetary).map((gate) => gate.gate)).toEqual([
      'minimumOrderSubtotal',
      'maximumOrderSubtotal',
      'minimumItemPrice',
      'maximumItemPrice',
    ]);
    expect(gates.filter((gate) => gate.formatType === 'currency')).toHaveLength(4);
    expect(gates.filter((gate) => gate.formatType === 'weight')).toHaveLength(2);
    expect(gates.filter((gate) => gate.formatType === 'none')).toHaveLength(4);
  });

  it('returns Money from all four currency gates', () => {
    const subject = aQualifier({
      minimumOrderSubtotal: Money.fromDecimalString('25.00'),
      maximumOrderSubtotal: Money.fromDecimalString('500.00'),
      minimumItemPrice: Money.fromDecimalString('9.99'),
      maximumItemPrice: Money.fromDecimalString('199.99'),
    });

    for (const value of [
      subject.getMinimumOrderSubtotal(),
      subject.getMaximumOrderSubtotal(),
      subject.getMinimumItemPrice(),
      subject.getMaximumItemPrice(),
    ]) {
      expect(value).toBeInstanceOf(Money);
      expect(typeof value).not.toBe('number');
    }

    // Decimal STRINGS, never floats. `toFixed2()` is the port's `numberFormat(v,"0.00")` parity
    // surface; `toDecimalString()` reproduces CFML's trailing-zero dropping, which is why the two
    // answers legitimately differ for the same value.
    expect(subject.getMinimumOrderSubtotal()?.toFixed2()).toBe('25.00');
    expect(subject.getMinimumOrderSubtotal()?.toDecimalString()).toBe('25');
    expect(subject.getMinimumItemPrice()?.toFixed2()).toBe('9.99');
    expect(subject.getMaximumItemPrice()?.toFixed2()).toBe('199.99');
  });

  it('returns plain numbers from the four integer quantity gates', () => {
    const subject = aQualifier({
      minimumOrderQuantity: 2,
      maximumOrderQuantity: 20,
      minimumItemQuantity: 1,
      maximumItemQuantity: 10,
    });

    for (const value of [
      subject.getMinimumOrderQuantity(),
      subject.getMaximumOrderQuantity(),
      subject.getMinimumItemQuantity(),
      subject.getMaximumItemQuantity(),
    ]) {
      expect(typeof value).toBe('number');
      expect(value).not.toBeInstanceOf(Money);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('returns plain numbers - never Money - from the two weight gates', () => {
    // ⚠️ THE ASSERTION THIS BLOCK EXISTS FOR. `big_decimal` on [L63-L64] makes these look exactly
    // like the currency gates in the ORM metadata, and `hb_formatType="weight"` is the only thing
    // that distinguishes them. A `Money` here would be a category error.
    const subject = aQualifier({
      minimumFulfillmentWeight: 1,
      maximumFulfillmentWeight: 50,
    });

    expect(subject.getMinimumFulfillmentWeight()).toBe(1);
    expect(subject.getMaximumFulfillmentWeight()).toBe(50);
    expect(subject.getMinimumFulfillmentWeight()).not.toBeInstanceOf(Money);
    expect(subject.getMaximumFulfillmentWeight()).not.toBeInstanceOf(Money);
    expect(typeof subject.getMinimumFulfillmentWeight()).toBe('number');
    expect(typeof subject.getMaximumFulfillmentWeight()).toBe('number');
  });

  it('rejects Money in a weight slot and a number in a currency slot at compile time', () => {
    // @ts-expect-error - `minimumFulfillmentWeight` [L63] is a weight and is typed `number`;
    // handing it a `Money` would assert a currency the column does not have.
    const weightAsMoney = aQualifier({ minimumFulfillmentWeight: Money.fromDecimalString('1') });
    expect(weightAsMoney.getMinimumFulfillmentWeight()).toBeInstanceOf(Money);

    // @ts-expect-error - `minimumOrderSubtotal` [L57] is `hb_formatType="currency"` and is typed
    // `Money`; a raw number would put currency arithmetic outside the single arithmetic surface.
    const moneyAsNumber = aQualifier({ minimumOrderSubtotal: 25 });
    expect(moneyAsNumber.getMinimumOrderSubtotal()).toBe(25);
  });

  it('carries a fractional weight without rounding it', () => {
    // `big_decimal` [L63] is not an integer column, so a fractional weight is legitimate data.
    // The value is written as a decimal literal and read straight back; the entity performs no
    // arithmetic on it, which is why no precision helper is involved on this path.
    const subject = aQualifier({ minimumFulfillmentWeight: 2.5, maximumFulfillmentWeight: 47.5 });

    expect(subject.getMinimumFulfillmentWeight()).toBe(2.5);
    expect(subject.getMaximumFulfillmentWeight()).toBe(47.5);
  });
});

// ===========================================================================
// 4. ⚠️ THE PROPERTY / ACCESSOR DOUBLE ORPHAN - BOTH HALVES PRESERVED
// ===========================================================================
//
// CFML parity [model/entity/PromotionQualifier.cfc:L99,L107-L115]: a DOUBLE ORPHAN.
// qualifierApplicationTypeOptions is declared as a non-persistent property at L99 but has no
// getter, while getRewardMatchingTypeOptions at L107-L115 is a getter with no declared property.
// Both halves preserved as-written; neither is completed.
//
// The two sit FIVE LINES APART and are exact mirror images, which is what makes them a single
// finding rather than two coincidences:
//
//   * L99 declares `property name="qualifierApplicationTypeOptions" type="array"
//     persistent="false";` - a DECLARED PROPERTY WITH NO PROVIDER. Nothing in the component's
//     373 lines reads it, writes it, or offers a `getQualifierApplicationTypeOptions()`. In the
//     legacy runtime the framework's dispatcher would synthesise an accessor that resolves to
//     nothing; in a driver-only port there is no dispatcher, so the honest port authors NO
//     member at all.
//   * L107-L115 declares `getRewardMatchingTypeOptions()` - A PROVIDER WITH NO DECLARED
//     PROPERTY. It serves `rewardMatchingType` [L65], which IS declared, so the method is
//     genuinely live: `hb_formFieldType="select"` on L65 means the admin form consumes it.
//
// ★ AUTHORING ONE AND NOT THE OTHER IS FIDELITY, NOT REPAIR. Completing either half would
// invent surface the legacy component does not have - and the ports the plan permits are all in
// src/services, none here. There is NO numbered legacy defect for this: the orphan pair costs
// nothing at runtime and changes no money, so it is a `CFML parity` note and the divergence
// budget stays at zero.

describe('the double orphan is preserved on both halves and completed on neither', () => {
  it('records both halves of the mismatch with their verified locators', () => {
    const { qualifierOptionListMismatch } = freshFixtures();

    expect(qualifierOptionListMismatch.declaredPropertyWithoutProvider).toBe(
      'qualifierApplicationTypeOptions',
    );
    expect(qualifierOptionListMismatch.declaredPropertyLocator).toBe(
      'model/entity/PromotionQualifier.cfc:L99',
    );
    expect(qualifierOptionListMismatch.providerWithoutDeclaredProperty).toBe(
      'getRewardMatchingTypeOptions',
    );
    expect(qualifierOptionListMismatch.providerLocator).toBe(
      'model/entity/PromotionQualifier.cfc:L107-L115',
    );
    // The provider is not orphaned in the sense of being dead - it serves a REAL column.
    expect(qualifierOptionListMismatch.providerServesProperty).toBe('rewardMatchingType');
  });

  it('authors no accessor for the declared property that has no provider', () => {
    // HALF ONE. `qualifierApplicationTypeOptions` [L99] is `persistent="false"` and unreachable
    // in the source; the port therefore exposes nothing for it, under any spelling.
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const spelling of [
      'getQualifierApplicationTypeOptions',
      'qualifierApplicationTypeOptions',
      'getQualifierApplicationType',
      'getQualifierTypeOptions',
    ]) {
      expect(members, `${spelling} must not be authored`).not.toContain(spelling);
      expect(spelling in subject, `${spelling} must not resolve on an instance`).toBe(false);
    }
  });

  it('authors the provider that has no declared property', () => {
    // HALF TWO. The mirror image is live and must exist.
    const subject = aQualifier();

    expect(prototypeMembers()).toContain('getRewardMatchingTypeOptions');
    expect(typeof subject.getRewardMatchingTypeOptions).toBe('function');
    expect(subject.getRewardMatchingTypeOptions()).toHaveLength(5);
  });

  it('serves the option list from a bare instance, with no column set', () => {
    // The list is a CONSTANT of the class, not a projection of the row: an unsaved qualifier with
    // no `rewardMatchingType` still offers all five modes, because the admin form needs the
    // domain before the user has chosen from it.
    const bare = aQualifier();

    expect(bare.getRewardMatchingType()).toBeUndefined();
    expect(bare.getRewardMatchingTypeOptions().map((option) => option.value)).toEqual(
      REWARD_MATCHING_TYPES,
    );
  });

  it('serves the same option list from every instance, whatever the column holds', () => {
    // Two independently built subjects - one saved with a chosen mode, one transient with none -
    // must offer identical vocabularies. The option list is never filtered by current state.
    const chosen = aSavedQualifier('qualifier-with-mode', { rewardMatchingType: 'productType' });
    const bare = aQualifier();

    expect(chosen.getRewardMatchingTypeOptions()).toEqual(bare.getRewardMatchingTypeOptions());
    expect(chosen.getRewardMatchingType()).toBe('productType');
  });
});

// ===========================================================================
// 5. ★ THE MATCHING VOCABULARY, THE INERT rbKeys, AND THE UN-NARROWED qualifierType
// ===========================================================================
//
// CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: five values in the source's own
// order - `any`, `sku`, `product`, `productType`, `brand`. `RewardMatchingType` is a CLOSED union
// of exactly those five, and the option list's `value` fields match them one-for-one IN THAT
// ORDER. Order is asserted rather than membership alone because L65 declares
// `hb_formFieldType="select"`: the list IS the admin dropdown, and reordering it reorders what a
// merchandiser sees.
//
// ★ A SHIPPED-SURFACE FINDING WORTH STATING PLAINLY, BECAUSE IT INVERTS AN EXPECTATION. The
// agent contract anticipated that `rewardMatchingType` [L65] would stay an un-narrowed `string`
// at the property level. The shipped module narrows it and leaves `qualifierType` [L53] as the
// un-narrowed one, and that asymmetry is EVIDENCE-DRIVEN rather than stylistic:
//
//   * `rewardMatchingType` has a SELF-DECLARED option list on the entity [L107-L115] and
//     `hb_formFieldType="select"` [L65]. The component itself states the closed domain, so the
//     union reproduces a constraint the source already asserts.
//   * `qualifierType` has NO option list - there is no `getQualifierTypeOptions()` anywhere in
//     the 373 lines - and the engine tests it with a CASE-INSENSITIVE COMMA-LIST MEMBERSHIP
//     CHECK [model/service/PromotionService.cfc:L714]. Narrowing it would reject rows the legacy
//     schema accepts, which is a behaviour change dressed as a type improvement.
//
// This suite PINS THE SHIPPED REALITY and does not narrow `qualifierType`. Verify before you
// quote: the source, then the shipped module, then everything else.

describe('the matching vocabulary is closed and ordered, and qualifierType stays open', () => {
  it('closes RewardMatchingType over exactly the five source values', () => {
    expect(REWARD_MATCHING_TYPES).toEqual(['any', 'sku', 'product', 'productType', 'brand']);
    expect(REWARD_MATCHING_TYPES).toHaveLength(5);

    // Every member of the union is accepted by the constructor and read straight back.
    for (const matchingType of REWARD_MATCHING_TYPES) {
      expect(aQualifier({ rewardMatchingType: matchingType }).getRewardMatchingType()).toBe(
        matchingType,
      );
    }
  });

  it('rejects a sixth matching type at compile time', () => {
    // @ts-expect-error - `sixthMode` is not one of the five [L109-L113]; the union is closed and
    // no member may be added, renamed or reordered.
    const invented = aQualifier({ rewardMatchingType: 'sixthMode' });

    // The value still round-trips at runtime, because the entity is a carrier and performs no
    // validation - there is no PromotionQualifier.json to reject it. The type is the only gate.
    expect(invented.getRewardMatchingType()).toBe('sixthMode');
  });

  it('rejects a plausible near-miss spelling at compile time', () => {
    // @ts-expect-error - the source writes `productType` [L112], not `producttype`. Case matters
    // in TypeScript where it did not in CFML, so the union is the place the casing is pinned.
    const nearMiss = aQualifier({ rewardMatchingType: 'producttype' });
    expect(nearMiss.getRewardMatchingType()).toBe('producttype');
  });

  it('matches the option list values to the union one-for-one, in source order', () => {
    const options = aQualifier().getRewardMatchingTypeOptions();

    expect(options.map((option) => option.value)).toEqual(REWARD_MATCHING_TYPES);
    expect(freshFixtures().rewardMatchingTypeVocabulary).toEqual(REWARD_MATCHING_TYPES);

    // Positionally, not just as a set - `any` FIRST is the source's own ordering [L109].
    const [first, second, third, fourth, fifth] = options;
    expect(first.value).toBe('any');
    expect(second.value).toBe('sku');
    expect(third.value).toBe('product');
    expect(fourth.value).toBe('productType');
    expect(fifth.value).toBe('brand');
  });

  it('keeps every option name an inert resource-bundle key, never a translated label', () => {
    // JavaRB is not ported and no i18n runtime is introduced, so the keys are preserved verbatim
    // as strings the legacy admin can still resolve. NOTHING here asserts English text; a
    // translated label would mean a resolver had been invented.
    const options = aQualifier().getRewardMatchingTypeOptions();

    expect(options.map((option) => option.name)).toEqual(REWARD_MATCHING_TYPE_OPTION_KEYS);

    for (const option of options) {
      expect(option.name).toBe(`entity.promotionQualifier.rewardMatchingType.${option.value}`);
      expect(option.name.startsWith('entity.promotionQualifier.rewardMatchingType.')).toBe(true);
    }
  });

  it('exposes only name and value on an option row', () => {
    // No `selected`, no `disabled`, no display text - the legacy struct carries exactly two keys
    // [L110-L113] and the port carries exactly two.
    for (const option of aQualifier().getRewardMatchingTypeOptions()) {
      expect(Object.keys(option).sort()).toEqual(['name', 'value']);
    }
  });

  it('leaves qualifierType an un-narrowed string, as the shipped surface has it', () => {
    // ★ [L53] declares `ormtype="string"` with `hb_formatType="rbKey"` and NO option list and NO
    // length constraint. The three values the engine actually tests for
    // [model/service/PromotionService.cfc:L714] are asserted here as DATA the column accepts -
    // NOT as a closed domain, and NOT as engine behaviour, which is sibling-owned.
    for (const qualifierType of ['merchandise', 'contentAccess', 'subscription']) {
      expect(aQualifier({ qualifierType }).getQualifierType()).toBe(qualifierType);
    }

    // And a value outside that trio is accepted without complaint, at compile time and at run
    // time - which is precisely what "un-narrowed" means and why narrowing it would be a
    // behaviour change. Casing is preserved verbatim: CFML compared case-insensitively, the port
    // stores exactly what the row held.
    const unexpected = aQualifier({ qualifierType: 'somethingTheAdminTyped' });
    expect(unexpected.getQualifierType()).toBe('somethingTheAdminTyped');
    expect(aQualifier({ qualifierType: 'MERCHANDISE' }).getQualifierType()).toBe('MERCHANDISE');
    expect(aQualifier({ qualifierType: '' }).getQualifierType()).toBe('');
  });

  it('resolves an absent qualifierType to undefined rather than to an empty string', () => {
    // A NULL column and a column holding `''` are different rows, and the port keeps them
    // different - the same discipline the ten gates get, applied to the string column.
    expect(aQualifier().getQualifierType()).toBeUndefined();
    expect(aQualifier({ qualifierType: '' }).getQualifierType()).not.toBeUndefined();
  });

  it('resolves an absent rewardMatchingType to undefined rather than to the first option', () => {
    // The narrowed union does NOT imply a default. [L65] declares no `default=`, so an unset
    // column reads `undefined`; defaulting it to `'any'` would silently widen every qualifier
    // that had never been configured into one that matches everything.
    const bare = aQualifier();

    expect(bare.getRewardMatchingType()).toBeUndefined();
    expect(bare.getRewardMatchingType()).not.toBe('any');
  });
});

// ===========================================================================
// 6. THE THIRTEEN ASSOCIATIONS, THE GROUP A / B / C SPLIT, AND THE LINK TABLES
// ===========================================================================
//
// CFML parity [model/entity/PromotionQualifier.cfc:L73-L87]: thirteen many-to-many OWNER
// collections, one fewer than PromotionReward's fourteen -- the qualifier has NO
// eligiblePriceGroups. Do not invent one.
//
// That single missing collection IS the structural difference between the two entities.
// `PromotionReward` declares `eligiblePriceGroups` -> `SwPromoRewardEligiblePriceGrp` at
// [model/entity/PromotionReward.cfc:L74]; nothing in this component corresponds to it, under any
// spelling, because a qualifier decides WHETHER a period applies while a reward decides WHAT the
// discount is - and only the latter has a price-group dimension.
//
// The thirteen split three ways, and only TEN materialize as entity arrays:
//
//   * GROUP A [L73-L75] - `fulfillmentMethods`, `shippingMethods`, `shippingAddressZones`.
//     Their far sides (`FulfillmentMethod`, `ShippingMethod`, `AddressZone`) are OUT OF SCOPE and
//     NOT PORTED, so they collapse to `readonly string[]` opaque identifiers with NO add, NO
//     remove and NO has. That collapse is LOSSLESS with respect to authored logic rather than
//     merely convenient: these three are exactly the relationships for which the component
//     hand-writes no helper anywhere in its 373 lines.
//   * GROUP B [L77-L81] - the five INCLUDE lists, real entity arrays.
//   * GROUP C [L83-L87] - the five EXCLUDE lists, real entity arrays.
//
// NONE of the thirteen is marked `inverse="true"`, so this entity OWNS every link table - which
// is why both sides of every helper are synchronised by hand rather than by the ORM.

describe('the thirteen associations split three ways, and the fourteenth is not invented', () => {
  it('counts exactly thirteen many-to-many collections', () => {
    const { qualifierManyToManyCollectionCount } = freshFixtures();

    expect(qualifierManyToManyCollectionCount).toBe(13);
    expect(Object.keys(LEGACY_LINK_TABLES)).toHaveLength(13);
  });

  it('declares no eligiblePriceGroups, under any spelling', () => {
    // ★ The one-collection difference from `PromotionReward` [model/entity/PromotionReward.cfc:L74].
    // Completing it would invent a price-group dimension the qualifier has never had.
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const spelling of [
      'getEligiblePriceGroups',
      'addEligiblePriceGroup',
      'removeEligiblePriceGroup',
      'hasEligiblePriceGroup',
      'getPriceGroups',
      'getEligiblePriceGroupIDs',
    ]) {
      expect(members, `${spelling} must not exist on the qualifier`).not.toContain(spelling);
      expect(spelling in subject, `${spelling} must not resolve on an instance`).toBe(false);
    }
  });

  it('collapses the three Group A relationships to opaque identifier arrays', () => {
    // The renamed readers are the ONE place this file departs from verbatim CFML naming, and the
    // rename is what makes the departure honest: `getFulfillmentMethodIDs()` says "strings", where
    // `getFulfillmentMethods()` would have promised entities that do not exist in this port.
    const subject = aQualifier({
      fulfillmentMethodIDs: ['fulfillment-method-one', 'fulfillment-method-two'],
      shippingMethodIDs: ['shipping-method-one'],
      shippingAddressZoneIDs: ['address-zone-one'],
    });

    expect(subject.getFulfillmentMethodIDs()).toEqual([
      'fulfillment-method-one',
      'fulfillment-method-two',
    ]);
    expect(subject.getShippingMethodIDs()).toEqual(['shipping-method-one']);
    expect(subject.getShippingAddressZoneIDs()).toEqual(['address-zone-one']);

    for (const identifiers of [
      subject.getFulfillmentMethodIDs(),
      subject.getShippingMethodIDs(),
      subject.getShippingAddressZoneIDs(),
    ]) {
      for (const identifier of identifiers) {
        expect(typeof identifier).toBe('string');
      }
    }
  });

  it('gives Group A no add, no remove and no has helper', () => {
    // ⚠️ The absence is the assertion. Authoring a helper for any of these three would require
    // importing an out-of-scope entity, which is forbidden, or inventing one, which is worse.
    const members = prototypeMembers();

    for (const property of GROUP_A_PROPERTIES) {
      const singular: string = property.endsWith('s') ? property.slice(0, -1) : property;
      const capitalised: string = `${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;

      expect(members).not.toContain(`add${capitalised}`);
      expect(members).not.toContain(`remove${capitalised}`);
      expect(members).not.toContain(`has${capitalised}`);
      // Nor the un-renamed entity-shaped reader.
      expect(members).not.toContain(`get${capitalised}s`);
    }

    // And exactly three renamed readers exist in their place.
    expect(members.filter((name: string) => name.endsWith('IDs'))).toEqual([
      'getFulfillmentMethodIDs',
      'getShippingAddressZoneIDs',
      'getShippingMethodIDs',
    ]);
  });

  it('defaults every Group A array to empty, never to undefined', () => {
    // An unset link table is an EMPTY set of identifiers, not an absent one - the opposite ruling
    // from the ten gates, and correct for the opposite reason: a collection's emptiness is
    // knowable from the link table itself, whereas a NULL numeric column is genuinely unset.
    const subject = aQualifier();

    expect(subject.getFulfillmentMethodIDs()).toEqual([]);
    expect(subject.getShippingMethodIDs()).toEqual([]);
    expect(subject.getShippingAddressZoneIDs()).toEqual([]);
  });

  it('materializes the ten Group B and Group C collections as entity arrays', () => {
    const subject = aQualifier();
    const probes = membershipPairProbes(subject, freshFixtures());

    expect(probes).toHaveLength(10);
    expect(probes.filter((probe) => probe.family === 'include')).toHaveLength(5);
    expect(probes.filter((probe) => probe.family === 'exclude')).toHaveLength(5);

    // Ten of the thirteen, in declaration order [L77-L87].
    expect(probes.map((probe) => probe.property)).toEqual([
      'brands',
      'options',
      'skus',
      'products',
      'productTypes',
      'excludedBrands',
      'excludedOptions',
      'excludedSkus',
      'excludedProducts',
      'excludedProductTypes',
    ]);
  });

  it('defaults every Group B and Group C collection to empty', () => {
    const subject = aQualifier();

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      expect(probe.nearSide(), `${probe.property} must default to empty`).toEqual([]);
    }
  });

  it('preserves all thirteen link-table names verbatim and abbreviated', () => {
    // C5 SCHEMA CONTINUITY. Every one of these is read and written unchanged, so an "improved"
    // name here is a production outage there. Five abbreviate `Excluded` to `Excl`, and
    // `shippingAddressZones` abbreviates differently again to `ShipAddressZone` - preserved as
    // written rather than regularised.
    expect(LEGACY_TABLE).toBe('SwPromoQual');
    expect(LEGACY_TABLE).not.toBe('SwPromotionQualifier');

    expect(LEGACY_LINK_TABLES).toEqual({
      fulfillmentMethods: 'SwPromoQualFulfillmentMethod',
      shippingMethods: 'SwPromoQualShippingMethod',
      shippingAddressZones: 'SwPromoQualShipAddressZone',
      brands: 'SwPromoQualBrand',
      options: 'SwPromoQualOption',
      skus: 'SwPromoQualSku',
      products: 'SwPromoQualProduct',
      productTypes: 'SwPromoQualProductType',
      excludedBrands: 'SwPromoQualExclBrand',
      excludedOptions: 'SwPromoQualExclOption',
      excludedSkus: 'SwPromoQualExclSku',
      excludedProducts: 'SwPromoQualExclProduct',
      excludedProductTypes: 'SwPromoQualExclProductType',
    });

    // Every link table is prefixed by the owning table's own abbreviated name.
    for (const linkTable of Object.values(LEGACY_LINK_TABLES)) {
      expect(linkTable.startsWith(LEGACY_TABLE)).toBe(true);
    }

    // The five exclude tables abbreviate; none spells `Excluded` out.
    for (const property of [
      'excludedBrands',
      'excludedOptions',
      'excludedSkus',
      'excludedProducts',
      'excludedProductTypes',
    ] as const) {
      expect(LEGACY_LINK_TABLES[property]).toContain('Excl');
      expect(LEGACY_LINK_TABLES[property]).not.toContain('Excluded');
    }
  });

  it('carries the type="array" declaration inconsistency forward without normalising it', () => {
    // CFML parity [model/entity/PromotionQualifier.cfc:L83-L84]: ONLY `excludedBrands` and
    // `excludedOptions` declare `type="array"`; the other ELEVEN many-to-many declarations omit
    // it. The attribute is inert in the legacy - Hibernate materialises an array either way - so
    // the inconsistency is a source wart with no behavioural consequence.
    //
    // ANNOTATED, NEVER NORMALISED, and in either direction: the port neither adds the attribute
    // to the eleven that lack it nor strips it from the two that have it, and it certainly does
    // not give those two a different runtime shape. All ten entity collections behave IDENTICALLY,
    // which is the assertion that proves the wart was carried and not acted upon.
    const subject = aQualifier();
    const probes = membershipPairProbes(subject, freshFixtures());
    const declaredWithTypeArray: readonly string[] = ['excludedBrands', 'excludedOptions'];

    for (const probe of probes) {
      expect(Array.isArray(probe.nearSide())).toBe(true);
      expect(probe.nearSide()).toEqual([]);
      expect(probe.has()).toBe(false);
    }

    // The two that declare it are ordinary members of the same ten, distinguished by nothing.
    const distinguished = probes.filter((probe) => declaredWithTypeArray.includes(probe.property));
    expect(distinguished).toHaveLength(2);
    for (const probe of distinguished) {
      expect(probe.family).toBe('exclude');
      expect(Array.isArray(probe.nearSide())).toBe(true);
    }
  });
});

// ===========================================================================
// 7. MEMBERSHIP, THE LIVE ARRAYS, AND THE FAR-SIDE GUARD
// ===========================================================================
//
// Three separate rulings meet in this block, and each is pinned to the shipped module rather than
// assumed from the CFC.
//
// (a) COMPARISON IS BY PRIMARY KEY FOR A PERSISTED CANDIDATE - never object identity, never deep
//     equality. Two distinct objects bearing the same key are the same row and the predicate says
//     so. ★ BUT THE SHIPPED RULE IS MIXED, NOT UNIFORM: when the candidate's key is still the
//     `unsavedvalue=""` empty string, `indexOfEntity` falls back to REFERENCE IDENTITY, because
//     every transient entity shares the key `''` and comparing by it would make all of them equal
//     to one another. Both halves are asserted.
//
// (b) THE COLLECTION ACCESSORS RETURN LIVE ARRAYS, not defensive copies. That is required rather
//     than tolerated: `add*`/`remove*` reach the FAR side through the far side's own accessor
//     (`brand.getPromotionQualifiers().push(this)`), so a defensive copy anywhere in that chain
//     would silently discard half of every bidirectional update. It also makes A2 freshness
//     non-negotiable - a shared subject would leak membership between tests - which is why every
//     test below builds its own.
//
// (c) THE FAR-SIDE GUARD IS `this.isNew() || !far.hasPromotionQualifier(this)`, reproduced from
//     [model/entity/PromotionQualifier.cfc:L144] and its nine siblings. CFML `or` short-circuits,
//     so on a TRANSIENT qualifier the containment probe never runs and a repeated `add*` APPENDS A
//     DUPLICATE to the far side. That consequence is reproduced deliberately, and it is a
//     `CFML parity` fact rather than a numbered defect: no in-scope caller adds the same pair
//     twice, and "fixing" it would change what the legacy writes.
//
// INVERSION CROSS-CHECK - VERDICT: ALL ELEVEN `remove*` HELPERS IN THIS COMPONENT ARE CORRECT.
// Every one of the twenty-two guarded deletions removes from the collection it should, on both the
// near and the far side; not one calls an `add*` where a `remove*` belongs. The contrast is
// [model/entity/Option.cfc:L145-L147], whose `removePromotionQualifierExclusion` calls
// `addExcludedOption(this)` at L146 - a genuine inversion on the FAR side of this same link, OWNED
// AND ASSERTED BY `option.test.ts`. It is cited here and deliberately NOT re-asserted, and the two
// behaviours are preserved without being reconciled: `PromotionQualifier.removeExcludedOption()`
// removes correctly, `Option.removePromotionQualifierExclusion()` does not, and both stay as
// written.

describe('membership compares by primary key, and the collections are live', () => {
  it('matches a persisted far side by primary key across distinct objects', () => {
    // (a) FIRST HALF. Two independently constructed brands, one key: the predicate must see one
    // row. A reference-identity comparison would answer `false` here and silently duplicate the
    // link on the next `add*`.
    const subject = aSavedQualifier('qualifier-membership');
    const held = aBrand('brand-shared-key');
    const twin = aBrand('brand-shared-key');

    subject.addBrand(held);

    expect(subject.hasBrand(held)).toBe(true);
    expect(subject.hasBrand(twin)).toBe(true);
    expect(twin).not.toBe(held);
    expect(subject.getBrands()).toHaveLength(1);

    // And removal by the TWIN removes the held row, because the key is what identifies it.
    subject.removeBrand(twin);
    expect(subject.getBrands()).toEqual([]);
    expect(subject.hasBrand(held)).toBe(false);
  });

  it('does not match a different key, however similar the object', () => {
    const subject = aSavedQualifier('qualifier-membership');
    const held = aBrand('brand-one');

    subject.addBrand(held);

    expect(subject.hasBrand(aBrand('brand-two'))).toBe(false);
    expect(subject.hasBrand(aBrand('BRAND-ONE'))).toBe(false);
  });

  it('falls back to reference identity for a transient far side', () => {
    // ★ (a) SECOND HALF - THE MIXED RULE. Both brands carry the `unsavedvalue=""` key, so a
    // key comparison would call them equal and a second, genuinely different unsaved brand would
    // be swallowed. The shipped `indexOfEntity` switches to `indexOf` precisely to avoid that.
    const subject = aSavedQualifier('qualifier-membership');
    const firstTransient = aBrand();
    const secondTransient = aBrand();

    expect(firstTransient.getBrandID()).toBe('');
    expect(secondTransient.getBrandID()).toBe('');

    subject.addBrand(firstTransient);

    expect(subject.hasBrand(firstTransient)).toBe(true);
    expect(subject.hasBrand(secondTransient)).toBe(false);

    subject.addBrand(secondTransient);
    expect(subject.getBrands()).toEqual([firstTransient, secondTransient]);

    // Removal likewise targets the identity handed in, not the first empty-keyed row it finds.
    subject.removeBrand(firstTransient);
    expect(subject.getBrands()).toEqual([secondTransient]);
  });

  it('removes a first-position member rather than skipping it', () => {
    // THE `findIndex` BASE-CHANGE TRAP, asserted rather than trusted. CFML `arrayFind` is 1-based
    // and returns 0 for "absent", so all eleven source bodies guard with `if(index > 0)`;
    // `findIndex` is 0-based and returns -1, so the port guards with `!== -1`. Had the `> 0` been
    // carried over literally, the FIRST element of every collection would have become unremovable.
    const subject = aSavedQualifier('qualifier-membership');
    const first = aBrand('brand-first');
    const second = aBrand('brand-second');

    subject.addBrand(first);
    subject.addBrand(second);
    expect(subject.getBrands()).toEqual([first, second]);

    subject.removeBrand(first);

    expect(subject.getBrands()).toEqual([second]);
    expect(subject.hasBrand(first)).toBe(false);
  });

  it('ignores a removal of something that was never a member', () => {
    // Both guarded deletions simply do not fire. No raise, no silent removal of a neighbour.
    const subject = aSavedQualifier('qualifier-membership');
    const held = aBrand('brand-held');
    const stranger = aBrand('brand-stranger');

    subject.addBrand(held);

    expect(() => {
      subject.removeBrand(stranger);
    }).not.toThrow();
    expect(subject.getBrands()).toEqual([held]);
  });

  it('returns the live collection, not a defensive copy, on all ten accessors', () => {
    // (b). Pushing through the returned reference is observable on the entity - which is exactly
    // what the far-side half of every `add*` relies on.
    const subject = aQualifier();

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      const before: readonly unknown[] = probe.nearSide();
      expect(probe.nearSide(), `${probe.property} must hand back one reference`).toBe(before);

      probe.add();
      expect(before, `${probe.property} must be observably mutated`).toHaveLength(1);
      expect(probe.nearSide()).toBe(before);
    }
  });

  it('keeps the include and exclude lists of one far side independent', () => {
    // Ten collections, ten link tables: adding to `excludedBrands` must not touch `brands`, and a
    // brand may legitimately appear on both lists of the same qualifier - the legacy schema has no
    // constraint forbidding it, and nothing here invents one.
    const subject = aSavedQualifier('qualifier-membership');
    const brand = aBrand('brand-on-both-lists');

    subject.addBrand(brand);
    expect(subject.getBrands()).toEqual([brand]);
    expect(subject.getExcludedBrands()).toEqual([]);
    expect(subject.hasExcludedBrand(brand)).toBe(false);

    subject.addExcludedBrand(brand);
    expect(subject.getBrands()).toEqual([brand]);
    expect(subject.getExcludedBrands()).toEqual([brand]);
    expect(subject.hasBrand(brand)).toBe(true);
    expect(subject.hasExcludedBrand(brand)).toBe(true);

    // And the far side keeps them apart too, on two different collections.
    expect(brand.getPromotionQualifiers()).toEqual([subject]);
    expect(brand.getPromotionQualifierExclusions()).toEqual([subject]);

    subject.removeExcludedBrand(brand);
    expect(subject.getExcludedBrands()).toEqual([]);
    expect(subject.getBrands()).toEqual([brand]);
    expect(brand.getPromotionQualifiers()).toEqual([subject]);
    expect(brand.getPromotionQualifierExclusions()).toEqual([]);
  });

  it('synchronises both sides of all ten links on add and on remove', () => {
    // (c) far-side symmetry, swept across every helper pair rather than sampled. The subject is
    // SAVED, so the `this.isNew()` short-circuit does not fire and the containment probe runs.
    const subject = aSavedQualifier('qualifier-symmetry');

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      expect(probe.farSide(), `${probe.property} far side must start clean`).toEqual([]);

      probe.add();
      expect(probe.nearSide(), `${probe.property} near side after add`).toHaveLength(1);
      expect(probe.farSide(), `${probe.property} far side after add`).toEqual([subject]);
      expect(probe.has(), `${probe.property} predicate after add`).toBe(true);

      probe.remove();
      expect(probe.nearSide(), `${probe.property} near side after remove`).toEqual([]);
      expect(probe.farSide(), `${probe.property} far side after remove`).toEqual([]);
      expect(probe.has(), `${probe.property} predicate after remove`).toBe(false);
    }
  });

  it('appends nothing twice when both sides are already persisted', () => {
    // The saved-and-saved case: BOTH `isNew()` short-circuits are false, both containment probes
    // run, and a repeated `add*` is idempotent on both sides.
    const subject = aSavedQualifier('qualifier-idempotent');

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      probe.add();
      probe.add();
      probe.add();

      expect(probe.nearSide(), `${probe.property} near side must not duplicate`).toHaveLength(1);
      expect(probe.farSide(), `${probe.property} far side must not duplicate`).toEqual([subject]);
    }
  });

  it('appends a duplicate to the far side when the qualifier itself is transient', () => {
    // ★ (c) THE SHORT-CIRCUIT CONSEQUENCE, REPRODUCED DELIBERATELY.
    // CFML parity [model/entity/PromotionQualifier.cfc:L144]: the far-side guard reads
    // `if(isNew() OR NOT arguments.brand.hasPromotionQualifier(this))`, CFML `or`
    // short-circuits, and `isNew()` is TRUE for an unsaved qualifier - so the containment probe
    // is never reached and the far side receives a second copy.
    //
    // Preserved as written. No in-scope caller adds the same pair twice before saving, so the
    // legacy outcome is unobservable in practice; guarding it would nonetheless change what the
    // port writes relative to the source, and this file spends no divergence.
    const transient = aQualifier();
    const brand = aBrand('brand-far-duplicate');

    expect(transient.isNew()).toBe(true);

    transient.addBrand(brand);
    transient.addBrand(brand);

    // NEAR side stays clean - its guard tests the ARGUMENT's newness, and the brand is persisted.
    expect(transient.getBrands()).toEqual([brand]);
    // FAR side does not, because the qualifier's own newness short-circuited the probe.
    expect(brand.getPromotionQualifiers()).toEqual([transient, transient]);
  });

  it('appends a duplicate to the near side when the far side is transient', () => {
    // The mirror image, from [model/entity/PromotionQualifier.cfc:L141]: the NEAR-side guard tests
    // `arguments.brand.isNew()`, so a transient brand bypasses `hasBrand()` and lands twice.
    // Same ruling, same reason, opposite side.
    const subject = aSavedQualifier('qualifier-near-duplicate');
    const transientBrand = aBrand();

    subject.addBrand(transientBrand);
    subject.addBrand(transientBrand);

    expect(subject.getBrands()).toEqual([transientBrand, transientBrand]);
    // The far side's probe DID run - the qualifier is saved - so it holds one entry.
    expect(transientBrand.getPromotionQualifiers()).toEqual([subject]);
  });

  it('leaks no membership between tests, because every subject is fresh', () => {
    // A2 FRESHNESS, proven rather than promised. Two subjects built by the same helper, in the
    // same test, must not share an array - the live-reference ruling makes this the one place a
    // hoisted subject would have produced order-dependent failures.
    const first = aSavedQualifier('qualifier-fresh-one');
    const second = aSavedQualifier('qualifier-fresh-two');
    const brand = aBrand('brand-not-shared');

    first.addBrand(brand);

    expect(first.getBrands()).toEqual([brand]);
    expect(second.getBrands()).toEqual([]);
    expect(second.getBrands()).not.toBe(first.getBrands());
    expect(second.hasBrand(brand)).toBe(false);
  });

  it('keeps every remove helper a removal, on both sides', () => {
    // THE INVERSION CROSS-CHECK, EXECUTED. Twenty-two guarded deletions across eleven pairs: after
    // a removal, neither side may have GROWN. The verdict recorded above the block - all eleven
    // correct - is what this sweep establishes, and it is the reason `Option.cfc:L145-L147`'s
    // inversion is identifiable as a defect of that file rather than a convention of this one.
    const subject = aSavedQualifier('qualifier-inversion');

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      probe.add();
      const nearBefore: number = probe.nearSide().length;
      const farBefore: number = probe.farSide().length;

      probe.remove();

      expect(probe.nearSide().length, `${probe.property} near side must shrink`).toBeLessThan(
        nearBefore,
      );
      expect(probe.farSide().length, `${probe.property} far side must shrink`).toBeLessThan(
        farBefore,
      );
      expect(probe.nearSide()).toEqual([]);
      expect(probe.farSide()).toEqual([]);

      // A second removal is a no-op, not a raise and not a re-add.
      probe.remove();
      expect(probe.nearSide()).toEqual([]);
      expect(probe.farSide()).toEqual([]);
    }
  });

  it('sets and clears the one many-to-one, and raises when there is nothing to clear', () => {
    // The period side is the eleventh pair, and the only one that is not many-to-many
    // [model/entity/PromotionQualifier.cfc:L68, helpers at L123-L137].
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-period-side');
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );

    expect(subject.getPromotionPeriod()).toBeUndefined();

    subject.setPromotionPeriod(period);
    expect(subject.getPromotionPeriod()).toBe(period);
    expect(period.getPromotionQualifiers()).toContain(subject);

    subject.removePromotionPeriod(period);
    expect(subject.getPromotionPeriod()).toBeUndefined();
    expect(period.getPromotionQualifiers()).not.toContain(subject);

    // CFML parity [model/entity/PromotionQualifier.cfc:L129-L132]: the source dereferences
    // `arguments.promotionPeriod` / `getPromotionPeriod()` unguarded, so clearing a period that is
    // neither supplied nor stored raises. Reproduced, with a message that names the locator.
    expect(() => {
      subject.removePromotionPeriod();
    }).toThrow(/promotionPeriod/i);
  });
});

// ===========================================================================
// 8. ★ hasAnyOption / hasAnyExcludedOption, AND THE EMPTY-COLLECTION POLARITY
// ===========================================================================
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: hasAnyInProperty dispatches via
// evaluate() (not ported) and returns false at L348 for an empty array. That false is PERMISSIVE
// when read against an exclude-list (nothing excluded) and RESTRICTIVE when read against an
// include-list (nothing qualifies) -- two of the five distinct empty-collection semantics in this
// migration. Collapsing any of them is a money bug.
//
// The remaining three are NOTED HERE AND DELIBERATELY NOT RE-TESTED, because each is owned
// elsewhere and duplicating an assertion is how two suites end up disagreeing:
//
//   3. RESTRICTIVE in the address-zone evaluator - an address zone with an EMPTY `locations`
//      collection reports "not in zone", so a qualifier gated on it never fires. Owned by the
//      address-zone port's own suite; this entity holds only opaque zone identifiers.
//   4. THE FULFILLMENT THREE-WAY GATE [model/service/PromotionService.cfc:L333-L420] - an empty
//      fulfillment-method set, an empty shipping-method set and an empty address-zone set are read
//      with three DIFFERENT polarities inside one method. Owned by
//      `tests/unit/services/promotion/**`; nothing about it is asserted here.
//   5. `Brand.getProducts()` DEFAULTING TO `[]` - the one empty-collection semantic with genuine
//      legacy coverage, asserted by `meta/tests/unit/entity/BrandTest.cfc:L58-L60` and carried
//      forward by `brand.test.ts`. Cited, not re-asserted.
//
// ⚠️ THE `evaluate()`-BASED DYNAMIC DISPATCH IS NOT PORTED, AND ITS ABSENCE IS A FEATURE.
// [org/Hibachi/HibachiEntity.cfc:L344] builds a method name as a STRING and evaluates it, so in
// the legacy runtime `hasAnyOption` and `hasAnyExcludedOption` are synthesised at call time rather
// than declared. The port authors both explicitly: no `evaluate`, no `eval`, no `new Function`, no
// `vm`, no tokenizer, no parser, and no `Proxy` dispatch. The BEHAVIOUR is reproduced exactly -
// primary-key comparison, `false` on an empty array, short-circuit on first match - while the
// MECHANISM is replaced by two ordinary methods a compiler can check.

describe('the any-of predicates keep their polarity, on both an include and an exclude list', () => {
  it('authors both predicates explicitly, with no dynamic dispatch behind them', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    expect(members).toContain('hasAnyOption');
    expect(members).toContain('hasAnyExcludedOption');
    expect(typeof subject.hasAnyOption).toBe('function');
    expect(typeof subject.hasAnyExcludedOption).toBe('function');

    // The legacy synthesises ANY `hasAny<Property>` name [org/Hibachi/HibachiEntity.cfc:L517-L519].
    // The port synthesises none, so the eight properties the source never asks about stay absent.
    for (const notAuthored of [
      'hasAnyBrand',
      'hasAnyExcludedBrand',
      'hasAnySku',
      'hasAnyExcludedSku',
      'hasAnyProduct',
      'hasAnyExcludedProduct',
      'hasAnyProductType',
      'hasAnyExcludedProductType',
      'hasAnyInProperty',
    ]) {
      expect(members, `${notAuthored} must not be synthesised`).not.toContain(notAuthored);
      expect(notAuthored in subject).toBe(false);
    }
  });

  it('finds an option on the include list by primary key across distinct objects', () => {
    // Comparison is by `optionID` only. The twin carries the same key and a different identity, and
    // the predicate must see one row - exactly as `hasOption` does, because `hasAnyOption`
    // delegates to it rather than re-implementing the rule.
    const subject = aSavedQualifier('qualifier-any-option');
    const held = anOption('option-shared-key');
    const twin = anOption('option-shared-key');

    subject.addOption(held);

    expect(subject.hasAnyOption([held])).toBe(true);
    expect(subject.hasAnyOption([twin])).toBe(true);
    expect(twin).not.toBe(held);
  });

  it('finds an option on the exclude list without consulting the include list', () => {
    // The two predicates read two different collections [L78 versus L84]. A qualifier that
    // INCLUDES an option has not EXCLUDED it, and vice versa.
    const subject = aSavedQualifier('qualifier-any-excluded-option');
    const included = anOption('option-included');
    const excluded = anOption('option-excluded');

    subject.addOption(included);
    subject.addExcludedOption(excluded);

    expect(subject.hasAnyOption([included])).toBe(true);
    expect(subject.hasAnyOption([excluded])).toBe(false);
    expect(subject.hasAnyExcludedOption([excluded])).toBe(true);
    expect(subject.hasAnyExcludedOption([included])).toBe(false);
  });

  it('answers true when any one of several supplied options matches', () => {
    // "Any", not "all": one hit in the middle of a miss on either side is enough.
    const subject = aSavedQualifier('qualifier-any-of-many');
    const held = anOption('option-held');

    subject.addOption(held);
    subject.addExcludedOption(held);

    const supplied = [anOption('option-miss-one'), held, anOption('option-miss-two')];

    expect(subject.hasAnyOption(supplied)).toBe(true);
    expect(subject.hasAnyExcludedOption(supplied)).toBe(true);
  });

  it('answers false when none of several supplied options matches', () => {
    const subject = aSavedQualifier('qualifier-any-of-none');

    subject.addOption(anOption('option-held'));
    subject.addExcludedOption(anOption('option-excluded'));

    const strangers = [anOption('option-stranger-one'), anOption('option-stranger-two')];

    expect(subject.hasAnyOption(strangers)).toBe(false);
    expect(subject.hasAnyExcludedOption(strangers)).toBe(false);
  });

  it('answers false for an empty supplied array on the include list - RESTRICTIVE', () => {
    // ★ EMPTY CASE ONE, RESTRICTIVE POLARITY. [org/Hibachi/HibachiEntity.cfc:L348] falls straight
    // through to `return false` when there is nothing to iterate. Read against an INCLUDE list
    // that `false` means "this item does not qualify", so an order item carrying no options is
    // gated OUT by an option-based qualifier. Substituting `true` here would hand a discount to
    // every optionless item in the catalogue.
    const subject = aSavedQualifier('qualifier-empty-input');

    subject.addOption(anOption('option-held'));

    expect(subject.getOptions()).toHaveLength(1);
    expect(subject.hasAnyOption([])).toBe(false);
  });

  it('answers false for an empty supplied array on the exclude list - PERMISSIVE', () => {
    // ★ EMPTY CASE TWO, PERMISSIVE POLARITY - THE SAME `false` FROM THE SAME LINE, MEANING THE
    // OPPOSITE THING. Read against an EXCLUDE list, `false` means "nothing about this item is
    // excluded", so the item survives the exclusion test and remains eligible.
    //
    // ONE RETURN VALUE, TWO OPPOSED CONSEQUENCES. That is why the polarity is annotated at every
    // call rather than reasoned about once: a helper that "normalised" empty-array handling would
    // have to break one of these two, and either break moves money.
    const subject = aSavedQualifier('qualifier-empty-input');

    subject.addExcludedOption(anOption('option-excluded'));

    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.hasAnyExcludedOption([])).toBe(false);
  });

  it('answers false when the qualifier collection itself is empty, on both lists', () => {
    // The other emptiness: a populated input against an EMPTY near-side collection. Same `false`,
    // same two polarities - an option-gated qualifier that lists no options excludes every item
    // from qualifying, while an exclusion list holding nothing excludes nobody.
    const subject = aSavedQualifier('qualifier-empty-collections');
    const supplied = [anOption('option-one'), anOption('option-two')];

    expect(subject.getOptions()).toEqual([]);
    expect(subject.getExcludedOptions()).toEqual([]);
    expect(subject.hasAnyOption(supplied)).toBe(false);
    expect(subject.hasAnyExcludedOption(supplied)).toBe(false);
  });

  it('answers false on both counts when everything is empty', () => {
    const bare = aQualifier();

    expect(bare.hasAnyOption([])).toBe(false);
    expect(bare.hasAnyExcludedOption([])).toBe(false);
  });

  it('accepts a readonly array without forcing the caller to copy it', () => {
    // The parameter is `readonly Option[]` because the documented call site hands over
    // `Sku.getOptions()`, which is itself `readonly`. A mutable array is accepted too, so the
    // arity and the call sites are unchanged from the legacy - only the type is honest.
    const subject = aSavedQualifier('qualifier-readonly-input');
    const held = anOption('option-readonly');
    const frozen: readonly Option[] = Object.freeze([held]);

    subject.addOption(held);
    subject.addExcludedOption(held);

    expect(subject.hasAnyOption(frozen)).toBe(true);
    expect(subject.hasAnyExcludedOption(frozen)).toBe(true);
  });

  it('does not mutate either collection while answering', () => {
    // Both predicates are READ-ONLY, and the live-array ruling makes that worth proving: a probe
    // that appended a miss while searching would corrupt the very membership the engine is about
    // to consult for the next order item.
    const subject = aSavedQualifier('qualifier-read-only-probe');
    const held = anOption('option-held');
    const stranger = anOption('option-stranger');

    subject.addOption(held);
    subject.addExcludedOption(held);

    subject.hasAnyOption([stranger, held]);
    subject.hasAnyExcludedOption([stranger, held]);

    expect(subject.getOptions()).toEqual([held]);
    expect(subject.getExcludedOptions()).toEqual([held]);
  });

  it('treats a transient option by identity, on both predicates', () => {
    // The mixed comparison rule reaches the any-of predicates too, because they delegate. Two
    // unsaved options both key `''`; only the one actually held may match.
    const subject = aSavedQualifier('qualifier-transient-any');
    const heldTransient = anOption('');
    const otherTransient = anOption('');

    subject.addOption(heldTransient);
    subject.addExcludedOption(heldTransient);

    expect(subject.hasAnyOption([heldTransient])).toBe(true);
    expect(subject.hasAnyOption([otherTransient])).toBe(false);
    expect(subject.hasAnyExcludedOption([heldTransient])).toBe(true);
    expect(subject.hasAnyExcludedOption([otherTransient])).toBe(false);
  });
});

// ===========================================================================
// 9. THE SIMPLE REPRESENTATION, ITS PROPERTY NAME, AND THE FORMATTER BOUNDARY
// ===========================================================================
//
// CFML parity [model/entity/PromotionQualifier.cfc:L101-L103], the body verbatim:
//
//   return "#rbKey('entity.promotionQualifier')# - #getFormattedValue('qualifierType')#";
//
// Two resource-bundle lookups and a literal `" - "` separator. NEITHER LOOKUP RESOLVES IN THE
// TARGET, and that is the ruling rather than an omission: JavaRB is not ported, no i18n runtime is
// introduced, and this entity has ZERO `getService(` sites, so injecting a label provider would add
// a collaborator the source does not have. Both keys are emitted as INERT STRINGS the admin tier
// can still resolve, and the method is therefore TOTAL - it cannot fail.
//
// ★ A CASING DISAGREEMENT THAT IS CARRIED, NOT CORRECTED. The first key is hand-written in the
// source and is lower-camel - `entity.promotionQualifier`. The second is composed by the framework
// from `getEntityName()` [org/Hibachi/HibachiTransient.cfc:L504-L510] and therefore carries an
// INITIAL CAPITAL - `entity.PromotionQualifier.qualifierType.<value>`. Normalising either would
// change a bundle lookup, so both are reproduced exactly as the legacy produces them.
//
// ⚠️ THE INHERITED LEGACY ASSERTION IS NOT FORCED. `simple_representation_exists_and_is_simple`
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] is one of four cases every legacy
// entity test inherits, and `PromotionQualifier` HAS NO LEGACY TEST AT ALL, so it inherits nothing
// - this block is net-new like the rest of the file. Rather than assume what a bare instance
// produces, the shipped reality was MEASURED: an unset `qualifierType` yields the formatter's empty
// string, so the value is `'entity.promotionQualifier - '` WITH A TRAILING SPACE. That is odd
// looking and still perfectly simple - one line, no markup, no raise - and it is asserted as it is
// rather than tidied into something the port does not do.
//
// BANNER-PLACEMENT WART, ANNOTATED AND NEVER NORMALISED: `getSimpleRepresentation()` sits at
// L101-L103, OUTSIDE every banner section - the "START: Non-Persistent Property Methods" banner
// does not open until L105 - while its partner `getSimpleRepresentationPropertyName()` sits
// properly inside "Overridden Methods" at L353-L363. The two members belong together and the source
// files them apart. The port records the fact once and reproduces the members, not the banners.

describe('the simple representation composes two inert keys around a literal separator', () => {
  it('composes the entity key, the separator and the formatted qualifier type', () => {
    const subject = aQualifier({ qualifierType: 'merchandise' });

    expect(subject.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.merchandise',
    );
  });

  it('keeps the separator exactly space-hyphen-space', () => {
    // The literal is `" - "` in the source, not `" | "` and not `": "`. Asserted on its own because
    // it is the one part of the string neither key contributes.
    const subject = aQualifier({ qualifierType: 'subscription' });
    const representation: string = subject.getSimpleRepresentation();

    expect(representation).toContain(' - ');
    expect(representation.split(' - ')).toHaveLength(2);
    expect(representation.startsWith('entity.promotionQualifier - ')).toBe(true);
  });

  it('resolves neither key, and emits no translated text', () => {
    // ⚠️ THE RULING THIS TEST EXISTS FOR. `getFormattedValue('qualifierType')` would resolve a
    // bundle key in the legacy because [L53] declares `hb_formatType="rbKey"`. In the target it
    // does NOT resolve - it composes the key and stops. Anything English here would mean a
    // resolver had been invented.
    const representation: string = aQualifier({
      qualifierType: 'merchandise',
    }).getSimpleRepresentation();

    expect(representation).toContain('entity.promotionQualifier');
    expect(representation).toContain('entity.PromotionQualifier.qualifierType.');
    expect(representation).not.toContain('Merchandise ');
    expect(representation).not.toMatch(/promotion qualifier/i);
  });

  it('carries the framework casing on the composed key and the hand-written casing on the first', () => {
    // ★ Both spellings in one string, side by side, so the disagreement cannot be quietly
    // regularised in either direction.
    const representation: string = aQualifier({
      qualifierType: 'contentAccess',
    }).getSimpleRepresentation();
    const [entityKey, formattedValue] = representation.split(' - ');

    expect(entityKey).toBe('entity.promotionQualifier');
    expect(formattedValue).toBe('entity.PromotionQualifier.qualifierType.contentAccess');
    expect(entityKey).not.toBe('entity.PromotionQualifier');
    expect(formattedValue?.startsWith('entity.PromotionQualifier.')).toBe(true);
  });

  it('emits the measured shipped value for a bare instance, trailing space and all', () => {
    // ⚠️ MEASURED, NOT ASSUMED. The formatter's empty-value branch contributes nothing after the
    // separator, so the representation ends in a space. Still simple - one line, no markup, no
    // raise - which is what the inherited legacy case would have been checking had one existed.
    const bare = aQualifier();
    const representation: string = bare.getSimpleRepresentation();

    expect(bare.getQualifierType()).toBeUndefined();
    expect(representation).toBe('entity.promotionQualifier - ');
    expect(representation.endsWith(' ')).toBe(true);
    expect(representation).not.toContain('undefined');
    expect(representation).not.toContain('null');
    expect(representation.split('\n')).toHaveLength(1);
  });

  it('distinguishes an empty-string qualifier type from an absent one', () => {
    // ★ MEASURED, AND IT CORRECTS A PLAUSIBLE ASSUMPTION. The presence test in the shipped body is
    // `isNullish(...)`, which carries CFML `isNull()` semantics - `null` or `undefined` only - and
    // is DELIBERATELY NOT `len()`. In CFML an empty string is not null, so
    // `getFormattedValue('qualifierType')` composes the rbKey with an EMPTY SUFFIX rather than
    // short-circuiting to nothing.
    //
    // So a row holding `''` and a row holding NULL produce DIFFERENT representations, and the
    // difference is exactly the composed key with nothing after its final dot. That is what the
    // legacy does; guessing that `''` and NULL collapse together would have been the easy,
    // plausible, wrong answer - which is why the value was measured before it was asserted.
    //
    // JUDGMENT CALL: assert the measured string rather than the tidier one this test originally
    // expected. The first draft asserted that `''` and NULL collapse to the same representation; it
    // FAILED, and the failure was correct - `isNullish` is `null || undefined` only. The assertion
    // was corrected to the shipped reality instead of the port being changed to match the guess.
    const emptyString = aQualifier({ qualifierType: '' });
    const absent = aQualifier();

    expect(emptyString.getQualifierType()).toBe('');
    expect(emptyString.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.',
    );
    expect(absent.getSimpleRepresentation()).toBe('entity.promotionQualifier - ');
    expect(emptyString.getSimpleRepresentation()).not.toBe(absent.getSimpleRepresentation());
  });

  it('never raises, whatever the row holds', () => {
    // TOTAL. The two throwing members of this class are `isDeletable()` and
    // `removePromotionPeriod()`; the representation resolves nothing and therefore cannot fail -
    // not on an unsaved row, not on a row with no period, not on an unexpected qualifier type.
    for (const subject of [
      aQualifier(),
      aQualifier({ qualifierType: 'somethingTheAdminTyped' }),
      aSavedQualifier('qualifier-total', { promotionPeriod: undefined }),
    ]) {
      expect(() => subject.getSimpleRepresentation()).not.toThrow();
      expect(typeof subject.getSimpleRepresentation()).toBe('string');
    }
  });

  it('is independent of every collection and every gate', () => {
    // The representation reads ONE column. Populating the thirteen associations and all ten gates
    // must not change it, which is what makes it usable as an admin label for an unsaved row.
    const fixtures = freshFixtures();
    const populated = fixtures.promotionQualifier;
    const bareWithSameType = aQualifier({ qualifierType: populated.getQualifierType() });

    expect(populated.getOptions().length).toBeGreaterThan(0);
    expect(populated.getMinimumOrderQuantity()).not.toBeUndefined();
    expect(populated.getSimpleRepresentation()).toBe(bareWithSameType.getSimpleRepresentation());
    expect(populated.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.merchandise',
    );
  });

  it('names qualifierType as the simple-representation property', () => {
    // [model/entity/PromotionQualifier.cfc:L355-L357], return at L356. Exactly that string - not
    // `'QualifierType'`, not `'qualifierTypes'`, not the ID column.
    //
    // LOCATOR CORRECTION, RECORDED: an upstream summary cites `L355-L356` for this member. Read
    // first-hand it spans L355-L357 with its `return` on L356. Source wins.
    const subject = aQualifier();

    expect(subject.getSimpleRepresentationPropertyName()).toBe('qualifierType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('QualifierType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('promotionQualifierID');
  });

  it('names the same property the representation actually formats', () => {
    // The two overridden members agree in the source, and the agreement is the point: the property
    // NAMED here is the property FORMATTED there. A drift between them would make the admin sort a
    // column it is not displaying.
    const subject = aQualifier({ qualifierType: 'merchandise' });
    const named: string = subject.getSimpleRepresentationPropertyName();

    expect(named).toBe('qualifierType');
    expect(subject.getSimpleRepresentation()).toContain(
      `entity.PromotionQualifier.${named}.merchandise`,
    );
  });

  it('returns the same property name for every instance, saved or not', () => {
    // A CONSTANT of the class, not a projection of state - the same ruling the option list gets.
    //
    // SIBLING COMPARISON, FOR CONTEXT ONLY AND ASSERTED NOWHERE HERE: the other overriding
    // in-scope entities name `'promotionCode'` [model/entity/PromotionCode.cfc:L171-L173], the
    // reward type [model/entity/PromotionReward.cfc:L414], the CAPITAL-D `'DisplayName'`
    // [model/entity/PriceGroupRate.cfc:L270-L271] - a wart owned by `priceGroupRate.test.ts` - and
    // `'productName'` [model/entity/Product.cfc:L791-L793]. Each sibling suite owns its own.
    expect(aQualifier().getSimpleRepresentationPropertyName()).toBe(
      aSavedQualifier('qualifier-constant', {
        qualifierType: 'merchandise',
      }).getSimpleRepresentationPropertyName(),
    );
    expect(freshFixtures().promotionQualifier.getSimpleRepresentationPropertyName()).toBe(
      'qualifierType',
    );
  });
});

// ===========================================================================
// 10. ★ isDeletable() - A THREE-LEVEL CHAIN WITH TWO UNGUARDED DEREFERENCES
// ===========================================================================
//
// CFML parity [model/entity/PromotionQualifier.cfc:L359-L361]: isDeletable chains three levels
// (qualifier -> period -> promotion) and calls getPromotionPeriod() TWICE in one expression, so an
// absent period or an absent promotion both throw. PromotionReward.isDeletable follows the
// identical double-call throw pattern.
//
// The source body, verbatim:
//
//   return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();
//
// FIVE OUTCOMES, and every one of them is reachable rather than theoretical:
//
//   1. ABSENT PERIOD                        -> THROWS. [L68] declares no `notnull`, so the foreign
//                                              key is nullable, and `removePromotionPeriod()`
//                                              clears it outright.
//   2. EXPIRED PERIOD                       -> false, by short-circuit. The promotion is NEVER
//                                              reached on this arm, so it cannot raise even when
//                                              it is absent.
//   3. UNEXPIRED PERIOD, ABSENT PROMOTION   -> THROWS. `PromotionPeriod.isExpired()` IS guarded
//                                              [model/entity/PromotionPeriod.cfc:L84 tests
//                                              `isDate()`], but `getPromotion()` is NOT, so the
//                                              second dereference is where the chain breaks.
//   4. UNEXPIRED PERIOD, UNDELETABLE PROMO  -> false, delegated.
//   5. UNEXPIRED PERIOD, DELETABLE PROMO    -> true, delegated.
//
// ★ THE DOUBLE `getPromotionPeriod()` CALL IS A DEREFERENCE-SURFACE FACT, NOT A PERFORMANCE ONE.
// It matters solely because it names the SAME nullable link twice in one expression, which is why
// outcome 1 raises on the FIRST call - before `isExpired()` can be consulted - and outcome 3 raises
// on the SECOND. Nothing here is framed in terms of speed, cost or call count; the port reads the
// link once into a local because that is the idiomatic way to express the same behaviour, and the
// behaviour is what is asserted.
//
// THE THROWS ARE REPRODUCED, NOT REPAIRED. Answering `false` for an absent period would invent a
// permissive rule the legacy does not have; answering `true` would invent the opposite. Raising is
// the parity-correct outcome, and it costs no divergence. `PromotionReward.isDeletable()` follows
// the identical pattern - cited here, asserted by `promotionReward.test.ts`.
//
// DATES: every instant below is an explicit UTC ISO-8601 string handed to an injected clock. No
// no-argument `new Date()`, no `Date.now()`, no `new Date(0)`, and no global fake timers.

describe('isDeletable climbs three levels, and raises where the legacy raises', () => {
  it('raises when the qualifier has no promotion period', () => {
    // OUTCOME 1. The first dereference [L360] is unguarded, so there is nothing to short-circuit.
    const orphan = aSavedQualifier('qualifier-no-period', { promotionPeriod: undefined });

    expect(orphan.getPromotionPeriod()).toBeUndefined();
    expect(() => orphan.isDeletable()).toThrow(/promotion period/i);
    expect(() => orphan.isDeletable()).toThrow(/L360/);
  });

  it('raises after its period has been cleared, which is how the absence is reached', () => {
    // The nullable link is not merely nullable in theory - `removePromotionPeriod()` sets it back to
    // `undefined`, so a qualifier that WAS deletable becomes a raising one.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-cleared-period');
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );

    subject.setPromotionPeriod(period);
    expect(subject.isDeletable()).toBe(true);

    subject.removePromotionPeriod(period);

    expect(subject.getPromotionPeriod()).toBeUndefined();
    expect(() => subject.isDeletable()).toThrow(/promotion period/i);
  });

  it('answers false for an expired period, without reaching the promotion', () => {
    // OUTCOME 2. `endDateTime` precedes the injected clock, so `isExpired()` is true and CFML `&&`
    // short-circuits. The period deliberately carries NO promotion: if the right-hand operand were
    // evaluated this test would raise instead of answering, so the short-circuit is what is really
    // being asserted here.
    const expiredWithNoPromotion = aPromotionPeriod({
      promotionPeriodID: 'period-expired',
      endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
      promotion: undefined,
    });
    const subject = aSavedQualifier('qualifier-expired-period');

    subject.setPromotionPeriod(expiredWithNoPromotion);

    expect(expiredWithNoPromotion.isExpired()).toBe(true);
    expect(expiredWithNoPromotion.getPromotion()).toBeUndefined();
    expect(subject.isDeletable()).toBe(false);
  });

  it('raises when the period is present and unexpired but its promotion is not', () => {
    // OUTCOME 3, AND THE SUBTLEST OF THE FIVE. `isExpired()` is GUARDED
    // [model/entity/PromotionPeriod.cfc:L84] and answers false for an absent end bound, so the
    // chain proceeds past the first link and breaks on the second, which has no guard at all.
    const unexpiredWithNoPromotion = aPromotionPeriod({
      promotionPeriodID: 'period-open-ended',
      endDateTimeUTC: undefined,
      promotion: undefined,
    });
    const subject = aSavedQualifier('qualifier-promotionless-period');

    subject.setPromotionPeriod(unexpiredWithNoPromotion);

    expect(unexpiredWithNoPromotion.isExpired()).toBe(false);
    expect(unexpiredWithNoPromotion.getPromotion()).toBeUndefined();
    expect(() => subject.isDeletable()).toThrow(/no\s+promotion/i);
    expect(() => subject.isDeletable()).toThrow(/L360/);
  });

  it('distinguishes the two raises by their message', () => {
    // Two different broken links, two different diagnostics. A single opaque failure would leave a
    // caller unable to tell which level of the chain was unmaterialized.
    const orphan = aSavedQualifier('qualifier-first-link');
    const promotionlessPeriod = aPromotionPeriod({
      promotionPeriodID: 'period-second-link',
      endDateTimeUTC: undefined,
      promotion: undefined,
    });
    const secondLinkBroken = aSavedQualifier('qualifier-second-link');
    secondLinkBroken.setPromotionPeriod(promotionlessPeriod);

    let firstMessage = '';
    let secondMessage = '';
    try {
      orphan.isDeletable();
    } catch (raised: unknown) {
      firstMessage = raised instanceof Error ? raised.message : String(raised);
    }
    try {
      secondLinkBroken.isDeletable();
    } catch (raised: unknown) {
      secondMessage = raised instanceof Error ? raised.message : String(raised);
    }

    expect(firstMessage).not.toBe('');
    expect(secondMessage).not.toBe('');
    expect(firstMessage).not.toBe(secondMessage);
    expect(firstMessage).toContain('cannot reach its promotion period');
    expect(secondMessage).toContain('the period has no');
  });

  it('answers false for an unexpired period whose promotion is not deletable', () => {
    // OUTCOME 4, delegated. The fixture promotion carries an applied promotion, which is what makes
    // it undeletable - and WHY it is undeletable belongs to `promotion.test.ts`, not here. This
    // block asserts only that the qualifier DELEGATES and returns what it is told.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-undeletable-promotion');
    const period = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');

    subject.setPromotionPeriod(period);

    expect(period.isExpired()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('answers true for an unexpired period whose promotion is deletable', () => {
    // OUTCOME 5, delegated. The only arm that answers true, and it requires BOTH conditions - an
    // unexpired period AND a deletable promotion.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-deletable-promotion');
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );

    subject.setPromotionPeriod(period);

    expect(period.isExpired()).toBe(false);
    expect(fixtures.codelessPromotion.isDeletable()).toBe(true);
    expect(subject.isDeletable()).toBe(true);
  });

  it('lets an expired period veto a deletable promotion', () => {
    // The two conditions are ANDed, so either one alone is not enough. A deletable promotion behind
    // an EXPIRED period still answers false - the left operand decides first.
    const fixtures = freshFixtures();
    const expiredPeriodOverDeletablePromotion = aPromotionPeriod({
      promotionPeriodID: 'period-expired-over-deletable',
      endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
      promotion: fixtures.codelessPromotion,
    });
    const subject = aSavedQualifier('qualifier-veto');

    subject.setPromotionPeriod(expiredPeriodOverDeletablePromotion);

    expect(fixtures.codelessPromotion.isDeletable()).toBe(true);
    expect(expiredPeriodOverDeletablePromotion.isExpired()).toBe(true);
    expect(subject.isDeletable()).toBe(false);
  });

  it('reads the period boundary against the injected clock, never a wall clock', () => {
    // Two periods identical but for their end bound, read through the SAME fixed instant. The
    // boundary that has passed expires; the boundary that has not does not. `NOW_UTC` is
    // `2024-06-15T12:00:00.000Z` and both bounds are explicit UTC ISO-8601 strings, so this test
    // answers the same way on every machine, in every timezone, forever.
    const fixtures = freshFixtures();
    const alreadyEnded = aPromotionPeriod({
      promotionPeriodID: 'period-already-ended',
      endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
      promotion: fixtures.codelessPromotion,
    });
    const endsLater = aPromotionPeriod({
      promotionPeriodID: 'period-ends-later',
      endDateTimeUTC: PERIOD_END_UTC,
      promotion: fixtures.codelessPromotion,
    });

    const vetoed = aSavedQualifier('qualifier-clock-vetoed');
    const permitted = aSavedQualifier('qualifier-clock-permitted');
    vetoed.setPromotionPeriod(alreadyEnded);
    permitted.setPromotionPeriod(endsLater);

    expect(new Date(EXPIRED_PERIOD_END_UTC).getTime()).toBeLessThan(new Date(NOW_UTC).getTime());
    expect(new Date(PERIOD_END_UTC).getTime()).toBeGreaterThan(new Date(NOW_UTC).getTime());
    expect(vetoed.isDeletable()).toBe(false);
    expect(permitted.isDeletable()).toBe(true);
  });

  it('answers the same way however many times it is asked', () => {
    // No memo, no cached verdict: the chain is walked afresh each time, so a period that becomes
    // undeletable between two calls is reported honestly rather than from a stale answer. This is
    // the request-scoped-state discipline applied to a derived predicate.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-no-memo');
    const deletablePeriod = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );
    const undeletablePeriod = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');

    subject.setPromotionPeriod(deletablePeriod);
    expect(subject.isDeletable()).toBe(true);
    expect(subject.isDeletable()).toBe(true);

    subject.setPromotionPeriod(undeletablePeriod);
    expect(subject.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('does not depend on the qualifier being saved', () => {
    // `isDeletable()` reads the PERIOD chain and nothing about the qualifier's own key, so a
    // transient qualifier answers exactly as a persisted one does. The legacy body never consults
    // `isNew()`, and neither does the port.
    const fixtures = freshFixtures();
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );
    const transient = aQualifier();

    transient.setPromotionPeriod(period);

    expect(transient.isNew()).toBe(true);
    expect(transient.isDeletable()).toBe(true);
  });
});

// ===========================================================================
// 11. ⚠️ NO VALIDATION SCHEMA - THE ABSENCE IS ASSERTED, AND NOTHING IS INVENTED
// ===========================================================================
//
// CFML parity [model/validation/]: there is NO PromotionQualifier.json. PromotionQualifier is one
// of exactly six in-scope entities with no validation schema (with Category, PromotionApplied,
// PromotionAccount, Product_AddOption, Product_AddOptionGroup). The absence is deliberate and is
// NOT completed here.
//
// Verified by listing the folder rather than inferred: `model/validation/` holds 96 `.json` files
// and `PromotionQualifier.json` is not among them. The measured in-scope split is 15 PRESENT / 6
// ABSENT; an upstream summary's "12 present" is stale, and the source wins.
//
// ★ WHAT FOLLOWS FROM THE ABSENCE, STATED AS CONSEQUENCES RATHER THAN AS GAPS TO FILL:
//
//   * NO required-field rule. A qualifier with no `qualifierType`, no period and no gates is
//     acceptable data - the ten-gate block already pins that all ten read `undefined`.
//   * NO `dataType`, NO `minValue`, NO `maxValue`. Nothing rejects a NEGATIVE minimum, and nothing
//     rejects a maximum BELOW its own minimum. The gate block asserts that inverted pair round-trips
//     untouched, which is the same finding seen from the validation side.
//   * NO length constraint on `qualifierType` [L53], because L53 declares none.
//   * ★ NO DELETE GATE, DESPITE `isDeletable()` EXISTING IN CODE. That asymmetry is the sharpest
//     consequence: `model/validation/Promotion.json` - read as the reference for what a populated
//     schema looks like - wires a `"method"` validator into its delete context, so the framework
//     consults it before a delete. This entity has no schema to wire anything into, so its
//     `isDeletable()` is advisory: it exists, callers may consult it, and NOTHING enforces it.
//   * NONE of the five declaratively-invoked entity validators. The exhaustive `"method"` census
//     across the in-scope schemas yields exactly five - `Sku.hasUniqueOptions`,
//     `Sku.hasOneOptionPerOptionGroup`, `RoundingRule.hasExpressionWithListOfNumericValuesOnly`,
//     `Promotion.getPromotionCodesDeletableFlag`, `PromotionCode.hasUniquePromotionCode` - and not
//     one belongs here.
//
// NO ZOD SCHEMA IS ASSERTED IN THIS FILE. Schema enforcement lives at the service tier in this
// port; entities carry property metadata. Authoring one here would both invent a rule the legacy
// lacks and put it at the wrong layer.

describe('there is no validation surface, and none is invented', () => {
  it('authors no validation member of any kind', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of ABSENT_VALIDATION_SURFACE) {
      expect(members, `${absent} must not be authored`).not.toContain(absent);
      expect(absent in subject, `${absent} must not resolve on an instance`).toBe(false);
    }
  });

  it('accepts a row that any invented schema would have rejected', () => {
    // ⚠️ THE ABSENCE, EXERCISED RATHER THAN MERELY STATED. Every field a plausible schema would
    // have made required is empty, and every numeric a plausible schema would have bounded is
    // hostile - a negative floor, and a ceiling beneath it. Construction succeeds, all reads succeed,
    // and nothing raises. That IS the legacy behaviour.
    const hostile = aQualifier({
      qualifierType: undefined,
      rewardMatchingType: undefined,
      promotionPeriod: undefined,
      minimumOrderQuantity: -10,
      maximumOrderQuantity: -20,
      minimumOrderSubtotal: Money.fromDecimalString('-500.00'),
      maximumOrderSubtotal: Money.fromDecimalString('-1000.00'),
      minimumFulfillmentWeight: -1,
    });

    expect(hostile.getQualifierType()).toBeUndefined();
    expect(hostile.getRewardMatchingType()).toBeUndefined();
    expect(hostile.getMinimumOrderQuantity()).toBe(-10);
    expect(hostile.getMaximumOrderQuantity()).toBe(-20);
    expect(hostile.getMinimumOrderSubtotal()?.toFixed2()).toBe('-500.00');
    expect(hostile.getMaximumOrderSubtotal()?.toFixed2()).toBe('-1000.00');
    expect(hostile.getMinimumFulfillmentWeight()).toBe(-1);
    expect(() => hostile.getSimpleRepresentation()).not.toThrow();
  });

  it('leaves isDeletable advisory, with nothing enforcing it', () => {
    // ★ THE DELETE-GATE ASYMMETRY. The predicate exists and answers correctly; there is simply no
    // schema context that consults it. Asserted by showing that a qualifier reporting `false` is
    // otherwise entirely unimpeded - every accessor still answers, every helper still mutates.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-advisory-gate');
    const period = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');
    const brand = aBrand('brand-after-veto');

    subject.setPromotionPeriod(period);
    expect(subject.isDeletable()).toBe(false);

    // Nothing about that `false` is enforced anywhere on the entity.
    expect(() => {
      subject.addBrand(brand);
    }).not.toThrow();
    expect(subject.getBrands()).toEqual([brand]);
    expect(() => {
      subject.removeBrand(brand);
    }).not.toThrow();
    expect(subject.getSimpleRepresentationPropertyName()).toBe('qualifierType');
  });
});

// ===========================================================================
// 12. STRUCTURAL FACTS, AND THE FRAMEWORK BASE CLASS THAT IS NOT PORTED
// ===========================================================================
//
// ★ CFML parity [model/entity/PromotionQualifier.cfc:L49]: `hb_permission` IS CORRECTLY SPELLED
// here - `promotionPeriod.promotionQualifiers`. The direct contrast is
// [model/entity/PromotionReward.cfc:L57], whose equivalent reads
// `hb_permission="promotionPeriod.promtionRewards"`, missing the `o` in "promotion". THE SIBLING'S
// MISSPELLING IS THE PROMOTION FOLDER'S SINGLE RENAME; THIS FILE REQUIRES NONE, and this
// correctly-spelled control is what makes the sibling's identifiable as a typo rather than a
// convention. `promotionReward.test.ts` owns the rename; it is cited here, not re-asserted.
//
// LOCATOR CORRECTION, RECORDED: the reward's component declaration - and therefore its `hb_permission`
// - is at `PromotionReward.cfc:L57`, not the L49 an upstream summary cites. Verified by reading the
// source. Source wins.
//
// FOUR MORE WARTS, ANNOTATED AND NEVER NORMALISED:
//
//   * [L49] declares NEITHER `output="false"` NOR `accessors="true"`, unlike several siblings. Both
//     are CFML-engine directives with no target analogue, so there is nothing to reproduce and
//     nothing to add.
//   * [L83-L84] carry `type="array"` while the other eleven many-to-many declarations omit it -
//     asserted in the association block, in both directions.
//   * [L349]/[L351] spell the tail banner "Overridden Implicet Getters" - the same misspelling as
//     [model/entity/PromotionCode.cfc:L165]/[L167]. The banner is EMPTY, so there is no member to
//     port; the wart is recorded and the banner is not reproduced as decoration.
//   * [L101-L103] files `getSimpleRepresentation()` outside every banner - recorded in block 9.
//
// [L365]/[L367] IS AN EMPTY ORM EVENT HOOKS PAIR, SO THIS ENTITY HAS NO HOOKS. Contrast
// [model/entity/PriceGroup.cfc:L206-L214] and [model/entity/ProductType.cfc:L305-L313], which
// maintain a materialized path BEFORE calling `super`, and [model/entity/Category.cfc:L126-L134],
// which calls `super` FIRST. This entity has no path column of any kind, so there is nothing to
// maintain and no hook to reshape into a repository call.
//
// THE HIBACHI BASE CLASS IS DOCUMENTED, NOT PORTED. `PromotionQualifier` does not declare
// `attributeValues`, so in CFML an unknown `getX()` THROWS through
// [org/Hibachi/HibachiEntity.cfc:L565] - it is one of the fourteen throwing entities, against the
// four silent ones (`Sku.cfc:L70`, `Product.cfc:L75`, `ProductType.cfc:L67`, `Brand.cfc:L60`). The
// target has NO dynamic dispatch at all, so an unknown member is simply `undefined` and the
// distinction is moot; it is recorded rather than reproduced. No Hibachi base-class suite is built,
// no `getNewFlag()`, `getPrintTemplates()`, `getEmailTemplates()` or `clearAttributeCache()` is
// invented, no inherited memo is simulated, no smart list is authored, and the raw
// `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is NOT ported.

describe('the structural facts hold, and the framework base class stays unported', () => {
  it('spells hb_permission correctly, unlike its sibling', () => {
    // ★ The control that proves the reward's spelling is a typo.
    const { permissionAttributeContrast } = freshFixtures();

    expect(QUALIFIER_PERMISSION).toBe('promotionPeriod.promotionQualifiers');
    expect(permissionAttributeContrast.qualifierPermissionAsWritten).toBe(QUALIFIER_PERMISSION);
    expect(permissionAttributeContrast.qualifierPermissionLocator).toBe(
      'model/entity/PromotionQualifier.cfc:L49',
    );

    // The sibling's typo, recorded for contrast and asserted by `promotionReward.test.ts`.
    expect(permissionAttributeContrast.rewardPermissionAsWritten).toBe(
      'promotionPeriod.promtionRewards',
    );
    expect(permissionAttributeContrast.rewardPermissionCorrected).toBe(
      'promotionPeriod.promotionRewards',
    );
    expect(permissionAttributeContrast.rewardPermissionLocator).toBe(
      'model/entity/PromotionReward.cfc:L57',
    );
    // The locator correction itself, kept visible rather than silently applied.
    expect(permissionAttributeContrast.rewardPermissionLocatorPerPlan).toBe(
      'model/entity/PromotionReward.cfc:L49',
    );
    expect(permissionAttributeContrast.rewardPermissionLocator).not.toBe(
      permissionAttributeContrast.rewardPermissionLocatorPerPlan,
    );

    // And this entity's own spelling contains no truncation of any kind.
    expect(QUALIFIER_PERMISSION).toContain('promotion');
    expect(QUALIFIER_PERMISSION).not.toContain('promtion');
  });

  it('reports a fresh instance as new, because the key default is honest', () => {
    // [L52] declares `unsavedvalue="" default=""`, so an unsaved row's key is the empty string and
    // `isNew()` can answer truthfully without a separate flag. That honesty is load-bearing: it is
    // the left operand of every far-side guard, and it selects the reference-identity branch of the
    // containment rule.
    const fresh = aQualifier();

    expect(fresh.getPromotionQualifierID()).toBe('');
    expect(fresh.isNew()).toBe(true);
    expect(aSavedQualifier('qualifier-persisted').isNew()).toBe(false);
    expect(aSavedQualifier('qualifier-persisted').getPromotionQualifierID()).toBe(
      'qualifier-persisted',
    );
  });

  it('carries remoteID as an optional string', () => {
    // [L90]. An integration key, nullable, with no format constraint and no generation.
    expect(aQualifier().getRemoteID()).toBeUndefined();
    expect(aQualifier({ remoteID: 'legacy-system-key-42' }).getRemoteID()).toBe(
      'legacy-system-key-42',
    );
  });

  it('carries the four audit columns as dates or undefined, never an epoch stand-in', () => {
    // [L93-L96]. ⚠️ `new Date(0)` is forbidden as a substitute for absence: it is a REAL instant -
    // 1970-01-01T00:00:00.000Z - and a repository that wrote it would be asserting the row was
    // created then. Absence is `undefined`, exactly as with the ten gates.
    const unaudited = aQualifier();

    expect(unaudited.getCreatedDateTime()).toBeUndefined();
    expect(unaudited.getModifiedDateTime()).toBeUndefined();
    expect(unaudited.getCreatedByAccountID()).toBeUndefined();
    expect(unaudited.getModifiedByAccountID()).toBeUndefined();
    expect(unaudited.getCreatedDateTime()).not.toEqual(new Date(0));

    const audited = aQualifier({
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: 'account-author',
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: 'account-editor',
    });

    expect(audited.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(audited.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_DATE_TIME_UTC);
    expect(audited.getCreatedByAccountID()).toBe('account-author');
    expect(audited.getModifiedByAccountID()).toBe('account-editor');
    expect(audited.getCreatedDateTime()).toBeInstanceOf(Date);
  });

  it('authors no ORM lifecycle hook, because the source banner is empty', () => {
    // [L365]/[L367]. No path column, no hook, nothing for a repository to invoke on save.
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const hook of [
      'preInsert',
      'preUpdate',
      'postInsert',
      'postUpdate',
      'preDelete',
      'postDelete',
      'setPromotionQualifierIDPath',
      'getPromotionQualifierIDPath',
    ]) {
      expect(members, `${hook} must not be authored`).not.toContain(hook);
      expect(hook in subject, `${hook} must not resolve on an instance`).toBe(false);
    }
  });

  it('resolves an unknown member to undefined rather than dispatching for it', () => {
    // The base-class distinction, DOCUMENTED and not reproduced. In CFML an unknown `getX()` on this
    // entity THROWS [org/Hibachi/HibachiEntity.cfc:L565] because it declares no `attributeValues`;
    // in the target there is no dispatcher, no `Proxy` and no evaluated method name, so an unknown
    // member is plainly absent. Nothing here simulates either behaviour.
    const subject: unknown = aQualifier();
    const asRecord = subject as Record<string, unknown>;

    expect(asRecord['getSomeAttributeThatNeverExisted']).toBeUndefined();
    expect('getSomeAttributeThatNeverExisted' in asRecord).toBe(false);
    expect(asRecord['attributeValues']).toBeUndefined();
    expect(asRecord['getAttributeValue']).toBeUndefined();
  });

  it('builds without a collaborator port and without a clock', () => {
    // ZERO `getService(` SITES IN THE SOURCE. The verified census across the eighteen in-scope
    // entities is 45 sites - Product 18, Sku 19, ProductType 6, OptionGroup 1, RoundingRule 1, and
    // every other entity 0 - so this one genuinely needs no injection. Its `isDeletable()` reads the
    // clock only THROUGH the period it was handed, which is where the clock belongs.
    const subject = aQualifier();
    const asRecord = subject as unknown as Record<string, unknown>;

    for (const collaborator of [
      'now',
      'clock',
      'promotionService',
      'settingsProvider',
      'currencyConverter',
      'priceGroupRepository',
      'salePriceResolver',
    ]) {
      expect(asRecord[collaborator], `${collaborator} must not be injected`).toBeUndefined();
    }

    // The one clock in the chain is the period's, injected there and never here.
    const period = aPromotionPeriod({
      promotionPeriodID: 'period-owns-the-clock',
      endDateTimeUTC: PERIOD_END_UTC,
      promotion: freshFixtures().codelessPromotion,
    });
    subject.setPromotionPeriod(period);
    expect(subject.isDeletable()).toBe(true);
  });

  it('exposes the fixture graph qualifier as a fully materialized row', () => {
    // A LAST WHOLE-ROW WITNESS, so the shipped surface is checked once against a realistic row
    // rather than only against hand-built minimal ones. Every gate populated, every collection
    // materialized, and the qualifier bound to its period on both sides.
    const fixtures = freshFixtures();
    const populated = fixtures.promotionQualifier;

    expect(populated.isNew()).toBe(false);
    expect(populated.getQualifierType()).toBe('merchandise');
    expect(populated.getRewardMatchingType()).toBe('sku');

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      expect(read(populated), `${gate} must be populated on the fixture row`).not.toBeUndefined();
    }

    expect(populated.getMinimumOrderSubtotal()?.toFixed2()).toBe('25.00');
    expect(populated.getMaximumOrderSubtotal()?.toFixed2()).toBe('500.00');
    expect(populated.getMinimumItemPrice()?.toFixed2()).toBe('9.99');
    expect(populated.getMaximumItemPrice()?.toFixed2()).toBe('199.99');
    expect(populated.getMinimumFulfillmentWeight()).toBe(1);
    expect(populated.getMaximumFulfillmentWeight()).toBe(50);

    for (const collection of [
      populated.getBrands(),
      populated.getOptions(),
      populated.getSkus(),
      populated.getProducts(),
      populated.getProductTypes(),
      populated.getExcludedBrands(),
      populated.getExcludedOptions(),
      populated.getExcludedSkus(),
      populated.getExcludedProducts(),
      populated.getExcludedProductTypes(),
    ]) {
      expect(collection.length).toBeGreaterThan(0);
    }

    expect(populated.getFulfillmentMethodIDs()).toEqual(['promofx-fulfillment-method']);
    expect(populated.getPromotionPeriod()).toBe(fixtures.promotionPeriod);
    expect(fixtures.promotionPeriod.getPromotionQualifiers()).toContain(populated);
  });

  it('hands out an independent graph on every fixture call', () => {
    // A2, PROVEN AT THE FIXTURE BOUNDARY TOO. The factory is called inside each test rather than
    // hoisted, and two calls must share no live array - otherwise the live-collection ruling would
    // let one test's membership become the next test's starting state.
    const first = freshFixtures();
    const second = freshFixtures();

    expect(second.promotionQualifier).not.toBe(first.promotionQualifier);
    expect(second.promotionQualifier.getOptions()).not.toBe(first.promotionQualifier.getOptions());

    first.promotionQualifier.addBrand(aBrand('brand-only-in-the-first-graph'));

    expect(first.promotionQualifier.getBrands().length).toBe(
      second.promotionQualifier.getBrands().length + 1,
    );
  });
});
