// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/promotionQualifier.ts`
//
// `PromotionQualifier` is the `SwPromoQual` row and the GATE half of the promotion engine:
// QUALIFIERS decide WHETHER a promotion applies, REWARDS decide WHAT it gives. Everything it
// carries is an eligibility INPUT to a must-preserve money path -
// `getQualifierQualificationDetails()` [model/service/PromotionService.cfc:L629-L750] reads the ten
// numeric gates and `getOrderItemInQualifier()` [model/service/PromotionService.cfc:L852-L919]
// walks the membership collections. Three properties do the load bearing: the TEN NUMERIC GATES
// with asymmetric absence semantics [model/entity/PromotionQualifier.cfc:L55-L64], where every
// `minimum*` declares `hb_nullRBKey="define.0"` and every `maximum*` `define.unlimited`, both
// modelled `undefined` because coercing a `maximum*` to `0` would forbid every order; the THIRTEEN
// MANY-TO-MANY OWNER COLLECTIONS [L73-L87], one FEWER than `PromotionReward`'s fourteen because the
// qualifier has no `eligiblePriceGroups`, three of which point at out-of-scope entities and
// collapse to opaque identifier arrays so only ten materialize; and an `isDeletable()` that CLIMBS
// TWO LEVELS OF PARENT WITH NO NULL GUARD [L359-L361].
//
// COVERAGE IS 100% NET-NEW, MEASURED: no file under `meta/tests/` mentions `PromotionQualifier`,
// `qualifierType` or `rewardMatchingType`. The only legacy suites extended anywhere in this port
// are [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc], neither
// of which touches this entity, and [meta/tests/functional/admin/entity/ProductTest.cfc] is an
// empty stub. The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed
// every legacy entity suite for free are NOT inherited and nothing imitates them:
// `validate_as_save_for_a_new_instance` [L51-L54] rests on `validate()`/`hasErrors()` and on a
// schema that DOES NOT EXIST here, `simple_representation_exists_and_is_simple` [L56-L58] is
// MEASURED rather than forced blindly, `has_primary_id_property_name` [L60-L62] rests on the
// unported `getPrimaryIDPropertyName()`, and `defaults_are_correct` [L64-L67] survives in its
// `isNew()` half only.
//
// HARD BOUNDARY: this entity DECLARES the gates, it does not COMPARE them. Gate comparison
// [model/service/PromotionService.cfc:L629-L750], `productTypeIDPath` membership walking
// [model/service/PromotionService.cfc:L852-L919], the mutable usage ledger, the two-pass reward
// iteration and its empty-collection guard, the over-use stripping loop, `getDiscountAmount`'s
// arithmetic, the price-group-before-promotion ordering and the `issue_1766` return/exchange no-op
// are all sibling-owned under `tests/unit/services/promotion/**`. No assertion computes a discount
// and no SQL appears here - link-table reads belong to `tests/integration/repositories/**` - but
// the thirteen physical link-table names ARE asserted, because they are a schema contract this row
// owns rather than a query.
//
// NO DEFECT BELONGS TO THIS ENTITY AND THE DIVERGENCE BUDGET SPENT HERE IS ZERO. The register of
// thirty numbered legacy defects has NOT ONE entry against `model/entity/PromotionQualifier.cfc`,
// so every wart below is a `CFML parity` fact and never a numbered defect: the property/accessor
// DOUBLE ORPHAN at [L99] and [L107-L115]; `type="array"` declared on [L83] and [L84] only;
// `qualifierType` [L53] left un-narrowed while `rewardMatchingType` [L65] is narrowed; the
// misspelled "Overridden Implicet Getters" banner at [L349]/[L351]; `getSimpleRepresentation()`
// [L101-L103] floating outside every banner; `getPromotionPeriod()` invoked twice in one expression
// at [L360]; and the absent validation schema. A fourth project divergence is forbidden, and this
// entity declares no non-persistent memo for one to live in. Two runtime failures ARE pinned below,
// in the `isDeletable()` block, as faithful reproduction: [L360] dereferences
// `getPromotionPeriod()` and then `getPromotion()` with no guard, both foreign keys are nullable
// ([L68] and [model/entity/PromotionPeriod.cfc:L59] each declare no `notnull`), and CFML raises
// rather than answering `false`.
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
// The register of thirty numbered legacy defects contains NOT ONE entry against
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
//   fixStyle: 'separate-type-imports'
// and `no-import-type-side-effects` is an error. `Brand`, `Option` and `PromotionPeriod` are VALUE
// imports because this suite constructs far-side doubles; `RewardMatchingType` is type-only.
//
// DELIBERATELY ABSENT: `FulfillmentMethod`, `ShippingMethod` and `AddressZone`, because the Group A
// far sides [model/entity/PromotionQualifier.cfc:L73-L75] are OUT OF SCOPE and not ported; `Sku`,
// `Product` and `ProductType`, reached through the fixture graph instead because they are not in
// this file's declared dependency set; `decimal.js`, because only the arithmetic surface may import
// it; and `src/repositories/**`, `src/handlers/**`, `src/integrations/**`, `src/lib/config.ts` and
// `src/lib/logger.ts`, because a test is not a back door around the domain-inward layer boundary.

// --- Types derived from the modules under test, never restated by hand ---------------------------

/**
 * The subject's constructor parameter object. `src/domain/entities/promotionQualifier.ts` declares
 * its init shape INLINE and exports only the class and the `RewardMatchingType` union, so there is
 * no init type to import.
 */
// JUDGMENT CALL: derive the init shapes with `ConstructorParameters` rather than hand-declaring a
// parallel `type` per entity. Re-declaring would compile today and rot silently the moment a column
// changes upstream, which is the exact failure a characterization suite must not have.
type PromotionQualifierInit = ConstructorParameters<typeof PromotionQualifier>[0];

/** The period double's constructor parameter object, derived for the same reason. */
type PromotionPeriodInit = ConstructorParameters<typeof PromotionPeriod>[0];

/** The option double's constructor parameter object, derived for the same reason. */
type OptionInit = ConstructorParameters<typeof Option>[0];

/**
 * The fixture graph, and the ten-gate metadata table it already carries. `QualifierGateName` is
 * derived from the table's own `gate` field, which is what makes the gate sweeps below exhaustive
 * BY CONSTRUCTION: adding an eleventh gate upstream without adding a reader here is a compile
 * error, not a silent coverage hole.
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

// --- The schema and surface contracts, stated once ---------------------------------------------

/**
 * The physical table, verbatim. SCHEMA CONTINUITY IS BINDING
 * [model/entity/PromotionQualifier.cfc:L49]: the port reads and writes `SwPromoQual` unchanged.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L49]: the name is ABBREVIATED - `SwPromoQual`
 * and not `SwPromotionQualifier` - matching `PromotionReward`'s `SwPromoReward`. Carried forward
 * exactly and never expanded, so a well-meaning "correction" fails here rather than at a database.
 */
const LEGACY_TABLE = 'SwPromoQual';

/**
 * All thirteen many-to-many link tables, verbatim, keyed by the property that declares each.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L73-L87]: THIRTEEN owner collections, none
 * marked `inverse="true"` - exactly ONE FEWER than `PromotionReward`'s fourteen
 * [model/entity/PromotionReward.cfc:L74 declares `eligiblePriceGroups`, which this entity has no
 * equivalent of]. That missing collection IS the structural difference between the two entities,
 * and none is invented to close it. Five of the thirteen abbreviate further still -
 * `SwPromoQualExcl*` rather than `SwPromoQualExcluded*` - and `shippingAddressZones` abbreviates
 * differently again, to `SwPromoQualShipAddressZone`. Every abbreviation is preserved.
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
 * `FulfillmentMethod`, `ShippingMethod` and `AddressZone`, all three OUT OF SCOPE and none ported,
 * so they collapse to `readonly string[]` opaque identifiers. That collapse is LOSSLESS with
 * respect to authored logic: these are precisely the three of the fourteen relationships for which
 * the component hand-writes NO `add*` and NO `remove*` anywhere in its 373 lines.
 */
const GROUP_A_PROPERTIES = [
  'fulfillmentMethods',
  'shippingMethods',
  'shippingAddressZones',
] as const;

/**
 * The `rewardMatchingType` vocabulary, in the source's own order.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: not five plausible values but the
 * exact five rows `getRewardMatchingTypeOptions()` returns, and [L65] declares
 * `hb_formFieldType="select"`, so the option list IS the admin form's domain. No sixth member, none
 * renamed, none reordered. Typed as `readonly RewardMatchingType[]`, so a typo is a compile error.
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
 * `rbKey('entity.promotionQualifier.rewardMatchingType.<value>')`. JavaRB IS NOT PORTED and no i18n
 * runtime is introduced, so every resource-bundle identifier is preserved verbatim as an INERT
 * STRING CONSTANT and the legacy admin can still resolve it. Nothing asserts a translated label.
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
 * CFML parity [model/entity/PromotionQualifier.cfc:L49]: THIS SPELLING IS CORRECT, and that is
 * worth an assertion of its own. The direct contrast is [model/entity/PromotionReward.cfc:L57],
 * whose equivalent reads `hb_permission="promotionPeriod.promtionRewards"` - missing the `o` in
 * "promotion". The sibling's misspelling is the ONE identifier in that file requiring a documented
 * rename; THIS FILE REQUIRES NONE, and this correctly-spelled control is what proves the sibling's
 * is a typo rather than a convention. (Locator note: the reward's component declaration is at
 * `PromotionReward.cfc:L57`, not the L49 an upstream summary cites. Source wins.)
 */
const QUALIFIER_PERMISSION = 'promotionPeriod.promotionQualifiers';

/**
 * Every member the port authors on the prototype, sorted - interface parity in executable form.
 *
 * SEVENTY-ONE names, each a legacy CFML name VERBATIM in camelCase except the three Group A
 * readers, renamed to their identifier form (`getFulfillmentMethodIDs` for `fulfillmentMethods`,
 * and so on) because the far sides are opaque strings rather than entities. Nothing is "improved":
 * `getSimpleRepresentationPropertyName`, `hasAnyExcludedOption` and the eleven `add*`/`remove*`
 * pairs all keep their source spelling. `indexOfEntity` is `private static` in the shipped module,
 * so it lives on the constructor and adds no instance surface - asserted below, not assumed.
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
 * CFML parity [model/entity/PromotionQualifier.cfc:L121-L137]: the ONLY period-side helpers this
 * component declares are `setPromotionPeriod` [L122-L127] and `removePromotionPeriod` [L128-L137];
 * there is no `setPromotion` and no `removePromotion` anywhere in its 373 lines. That absence is
 * precisely why [model/entity/PromotionPeriod.cfc:L125-L127] `addPromotionQualifier`, which calls
 * `arguments.promotionQualifier.setPromotion( this )`, and [L128-L130] `removePromotionQualifier`,
 * which calls `arguments.PromotionQualifier.removePromotion( this )`, both THROW. The throws belong
 * to `promotionPeriod.test.ts`; this suite owns the other half of the explanation, that the members
 * really are not here.
 */
const ABSENT_PERIOD_SIDE_HELPERS: readonly string[] = ['setPromotion', 'removePromotion'];

/**
 * Members that would exist if the port had "completed" one of the gaps it deliberately keeps. Four
 * independent scope rulings, asserted rather than merely documented:
 *
 *   * `getQualifierApplicationTypeOptions` - the reader half of the double orphan. [L99] declares
 *     the property; no method for it exists in the source.
 *   * `getQualifierTypeOptions` - `qualifierType` [L53] has NO option list anywhere in the
 *     component, which is why the shipped module leaves that column un-narrowed.
 *   * the four `eligiblePriceGroups` members - `PromotionReward` has that collection
 *     [model/entity/PromotionReward.cfc:L74]; the qualifier does not.
 *   * the nine Group A helpers - no `add*`, `remove*` or `has*` exists for an out-of-scope far
 *     side, matching the source's own silence on all three relationships.
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
 * `Slatwall.org.Hibachi.HibachiEntity`. Neither base level is ported.
 *
 * THE DYNAMIC DISPATCHER IS NOT REPRODUCED. [org/Hibachi/HibachiEntity.cfc:L507-L565] is an
 * `onMissingMethod` dispatcher terminating in a THROW at L565, and `hasAnyInProperty` [L340-L350]
 * reaches its predicates through `evaluate()` at L344. There is no `Proxy`, no index signature, no
 * `variables.` scope object, no tokenizer and no `eval` anywhere in the port, which is why the
 * shipped module hand-writes ten `has*` predicates plus `hasAnyOption` and `hasAnyExcludedOption`.
 * `PromotionQualifier` declares NO `attributeValues` collection [L52-L99], so the EAV fallback at
 * [org/Hibachi/HibachiEntity.cfc:L559] is unreachable and an unknown `getX()` throws directly at
 * L565 - one of the fourteen throwing entities rather than one of the four silent ones. The raw
 * `writeDump(getErrors())` debug output at [org/Hibachi/HibachiEntity.cfc:L605] is likewise not
 * ported.
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
 * The validation surface that does not exist, and the five declarative validators this entity does
 * not declare.
 *
 * CFML parity [model/validation/]: THERE IS NO `PromotionQualifier.json`. Verified by listing the
 * folder - it holds 96 `.json` files and that is not one of them. `PromotionQualifier` is one of
 * EXACTLY SIX in-scope artefacts with no validation schema, alongside `Category`,
 * `PromotionApplied`, `PromotionAccount`, `Product_AddOption` and `Product_AddOptionGroup`.
 * Measured in-scope split: 15 PRESENT, 6 ABSENT (an upstream summary's "12 present" is stale -
 * source wins). THE SIX MUST REMAIN ABSENT: legacy validation gaps are carried as-is.
 *
 * The five validators listed last are the only entity methods any in-scope schema invokes
 * declaratively - `Sku.hasUniqueOptions`, `Sku.hasOneOptionPerOptionGroup`,
 * `RoundingRule.hasExpressionWithListOfNumericValuesOnly`,
 * `Promotion.getPromotionCodesDeletableFlag` and `PromotionCode.hasUniquePromotionCode` - and none
 * belongs here.
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

// --- Gate readers - one per gate, keyed by the fixture table's own `gate` field ------------------

/**
 * Every gate's accessor, keyed by property name. EXHAUSTIVE BY CONSTRUCTION: `QualifierGateName` is
 * derived from the fixture table's `gate` field, so `Record<QualifierGateName, ...>` fails to
 * compile if a gate is added upstream and not given a reader here. The value type is the honest
 * union of the two shipped return shapes - `Money | number | undefined` - narrowed at each
 * assertion site rather than widened away.
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
 * The accessor NAME for each gate, so the surface can be checked as well as the value. Composed
 * mechanically rather than restated: the shipped module derives each accessor from its column, so a
 * hand-written list could agree with itself while disagreeing with the entity.
 *
 * @param gate - the property name as [model/entity/PromotionQualifier.cfc:L55-L64] declares it.
 * @returns the camelCase getter name the port authors for it.
 */
function gateAccessorName(gate: QualifierGateName): string {
  return `get${gate.charAt(0).toUpperCase()}${gate.slice(1)}`;
}

// --- Instants - every one an explicit UTC ISO-8601 literal ---------------------------------------
//
// These deliberately coincide with the instants `tests/fixtures/promotionFixtures.ts` uses, so a
// period double built here and one taken from the fixture graph are read against the SAME clock and
// can never silently disagree about expiry. Nothing below reads a live clock.

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
 * A deterministic clock, injected rather than installed. `PromotionPeriod` takes `now: () => Date`
 * as a constructor argument, which is the port's replacement for CFML's ambient `now()`
 * [model/entity/PromotionPeriod.cfc:L84], and injecting is what lets `isDeletable()`'s expiry
 * branch be exercised without a global fake timer. A FRESH `Date` is returned on every call.
 *
 * @param instantUTC - an explicit UTC ISO-8601 literal.
 * @returns a clock that always reports that instant.
 */
function fixedClock(instantUTC: string): () => Date {
  const epochMilliseconds: number = new Date(instantUTC).getTime();
  return () => new Date(epochMilliseconds);
}

// --- Fresh subjects and fresh far sides - functions, never shared literals -----------------------

/**
 * The columns of an unsaved qualifier, all thirty-three slots explicit. A FUNCTION rather than a
 * shared literal, so no test can reach another test's data - which matters more here than on most
 * entities, because the ten entity-collection accessors hand out LIVE arrays.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L52]: `promotionQualifierID` starts `''` rather
 * than absent, because `unsavedvalue="" default=""` is what makes the empty string the honest
 * answer for a row that has never been saved - and what makes `isNew()` a simple emptiness test.
 * Every nullable column starts `undefined`, and for the ten gates that is the WHOLE POINT:
 * [L55-L64] declares no `default=` on any of them, so a fresh qualifier gates nothing.
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
 * @param overrides - the columns this test cares about; the rest stays unsaved-default.
 * @returns a fresh `PromotionQualifier`.
 */
function aQualifier(overrides: Partial<PromotionQualifierInit> = {}): PromotionQualifier {
  return new PromotionQualifier({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds a SAVED qualifier - one whose primary key is non-empty. The distinction is load-bearing:
 * `isNew()` is the left operand of every far-side guard in this component [L124, L144, L164, ...],
 * CFML `or` short-circuits, and the containment fallback in the shipped module switches from
 * primary-key comparison to reference identity when a key is empty.
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
 * Builds a brand double. `Brand`'s constructor is entirely optional and defaults `brandID` to `''`,
 * so omitting the argument yields a TRANSIENT brand - exactly the input the
 * `arguments.brand.isNew()` half of the near-side guard [model/entity/PromotionQualifier.cfc:L141]
 * needs.
 *
 * @param brandID - the key, or omitted for a transient brand.
 * @returns a fresh `Brand` holding no qualifiers on either far-side collection.
 */
function aBrand(brandID?: string): Brand {
  return brandID === undefined ? new Brand() : new Brand({ brandID });
}

/**
 * Builds an option double, all twelve required slots explicit. `optionGroup` is `undefined`
 * deliberately: it keeps `OptionGroup` out of this file's import set, and the
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
 * The `promotion` slot's type, derived rather than imported. `Promotion` is NOT in this file's
 * declared dependency set and does not need to be: the only promotions this suite uses come from
 * the fixture graph, and the only place the type is needed is this one parameter.
 */
type PromotionForPeriod = PromotionPeriodInit['promotion'];

/**
 * Builds a promotion-period double with an injected clock. `startDateTime` is fixed and never
 * varied: `isExpired()` [model/entity/PromotionPeriod.cfc:L83-L85] reads only the END bound, and
 * the START bound belongs to `isCurrent()` [L78-L81], which `promotionPeriod.test.ts` owns.
 *
 * @param spec.promotionPeriodID - the period's key.
 * @param spec.endDateTimeUTC - the end bound, or `undefined` to make `isExpired()` answer false
 *   through its guarded branch.
 * @param spec.promotion - the parent promotion, or `undefined` to leave the many-to-one
 *   unmaterialized.
 * @returns a fresh `PromotionPeriod` reading the `NOW_UTC` clock.
 */
// JUDGMENT CALL: an explicit three-field spec instead of `Partial<PromotionPeriodInit>`, because
// `PromotionPeriod` declares `promotionRewards?` and `promotionQualifiers?` WITHOUT `| undefined`
// and under `exactOptionalPropertyTypes` a spread forwarding `undefined` for them fails to compile.
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
 * A fresh fixture graph, called INSIDE each test that needs one rather than hoisted, so the
 * entities it hands out - whose collections are live arrays - can never cross a test boundary.
 *
 * @returns a fresh graph built at the fixture module's own default instant.
 */
function freshFixtures(): PromotionFixtures {
  return makePromotionFixtures();
}

/**
 * The first promotion period of a fixture promotion, without a non-null assertion.
 * `noUncheckedIndexedAccess` makes `periods[0]` a `PromotionPeriod | undefined`, and a postfix `!`
 * is not used anywhere in this file.
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
  // A2: the far-side spies below must not outlive their test.
  vi.restoreAllMocks();
});

/**
 * All ten entity-collection helper triples, each with both sides of its link already bound. Ten
 * rows, not thirteen: Group A [model/entity/PromotionQualifier.cfc:L73-L75] has no helpers to
 * probe. The include row and the exclude row of a given far side may share one object because they
 * touch DIFFERENT collections on it - `getPromotionQualifiers()` versus
 * `getPromotionQualifierExclusions()` - itself an invariant asserted below.
 *
 * @param subject - the qualifier under test; every closure is bound to it.
 * @param fixtures - a fresh graph, supplying the three far sides not constructed here.
 * @returns ten probes in declaration order [L77-L87].
 */
// JUDGMENT CALL: build the `Brand` and `Option` far sides locally but take `Sku`, `Product` and
// `ProductType` from the fixture graph, because those three modules are NOT in this file's declared
// dependency set. The cost is that three probes carry pre-built entities, which is why every sweep
// asserts the far side is CLEAN before it acts.
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

// --- 1. The ported surface, and what is deliberately absent --------------------------------------

describe('the ported surface is the legacy surface, and four scope rulings hold', () => {
  it('installs exactly the seventy-one authored members and nothing else', () => {
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(71);
  });

  it('keeps every legacy method name verbatim, including the ones that read oddly', () => {
    // C4 interface parity: the acceptance contract is a name-for-name diff against the CFC, so
    // `hasAnyExcludedOption` is never "improved" and `getSimpleRepresentationPropertyName` keeps
    // all five words.
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
    // FOURTEEN relationships.
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
    // INTERFACE PARITY IS THE ACCEPTANCE CONTRACT, AND ARITY IS HALF OF IT. The one permitted
    // widening across the whole port is `PromotionPeriod.isCurrent(now)`
    // [model/entity/PromotionPeriod.cfc:L78], which takes an injected clock so the UTC policy is
    // explicit - and `promotionPeriod.test.ts` owns it.
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
      // ZERO, NOT ONE.
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
      // ASSUMPTION: `Function.prototype.length` excludes only parameters carrying a DEFAULT VALUE
      // (and a rest parameter), and a TypeScript `?` compiles to an ordinary parameter. 1 is also
      // parity-correct - the legacy declares `removePromotionPeriod(required any promotionPeriod)`
      // and `PromotionPeriod` calls it with no argument
      // [model/entity/PromotionPeriod.cfc:L129-L132], which is why the port made the parameter
      // optional while keeping the arity.
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

    // NO `Proxy`, AND THIS IS THE ASSERTION THAT PROVES IT. A proxy carrying a `has` trap - the
    // only way to emulate [org/Hibachi/HibachiEntity.cfc:L507-L565]'s `onMissingMethod` in
    // TypeScript - would answer `true` here.
    expect('getSomeMemberThatWasNeverDeclared' in subject).toBe(false);
    expect(Object.getPrototypeOf(subject)).toBe(PromotionQualifier.prototype);
  });

  it('adds no instance surface through its private comparison helper', () => {
    const subject = aQualifier();

    // `indexOfEntity` is `private static`, so it lives on the constructor. It is the port's own
    // primary-key comparison, standing in for the CFML `arrayFind` object-reference searches at
    // [model/entity/PromotionQualifier.cfc:L132, L149, L169]; it is not part of the
    // interface-parity contract and must not appear on an instance.
    expect(prototypeMembers()).not.toContain('indexOfEntity');
    expect('indexOfEntity' in subject).toBe(false);
    expect(Object.getOwnPropertyNames(PromotionQualifier)).toContain('indexOfEntity');
  });

  it('injects no collaborator port and no clock', () => {
    // CFML parity: a full read of all 373 lines finds ZERO `getService(` sites in this component,
    // so nothing is injected and the constructor takes DATA ONLY.
    const subject = aQualifier({ promotionQualifierID: 'q-no-collaborators' });

    expect(subject.getPromotionQualifierID()).toBe('q-no-collaborators');

    // @ts-expect-error - the constructor accepts columns and materialized associations only; a
    // clock is not one of its slots, and `PromotionPeriod` is the entity that takes one.
    const withClock = aQualifier({ now: fixedClock(NOW_UTC) });
    expect(withClock.getPromotionQualifierID()).toBe('');
  });
});

// --- 2. The ten numeric gates and their asymmetric absence semantics ----------------------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L55-L64]: the ten gates carry ASYMMETRIC null
// semantics -- every minimum* declares hb_nullRBKey="define.0" (absent means zero, i.e. no lower
// bound) while every maximum* declares hb_nullRBKey="define.unlimited" (absent means no upper
// bound). Both are modelled as undefined; coercing a maximum to 0 would forbid every order.
//
// The asymmetry is systematic rather than incidental - it holds for all five pairs, across all
// three type families - and there is NO `default=` attribute on any of the ten. `hb_nullRBKey` is a
// DISPLAY hint naming the label the admin shows for an empty column; it is not an ORM default, so
// coalescing a `minimum*` to `0` would turn "no lower bound configured" into "a lower bound of zero
// was configured". Nothing here asserts how the gates are COMPARED - the comparison cascade
// [model/service/PromotionService.cfc:L629-L750] is sibling-owned.
//
// JUDGMENT CALL: sweep the ten gates through a derived reader table rather than ten hand-rolled
// assertions per property. The table's key type comes from the fixture's own gate list, so an
// eleventh gate added upstream is a COMPILE ERROR here rather than a silent coverage hole. Where a
// sweep would obscure the point the gates are still named explicitly: the type-family block spells
// all ten out.

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
    // THE HIGHEST-CONSEQUENCE ASSERTION IN THIS BLOCK.
    const subject = aQualifier();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      const value: Money | number | undefined = read(subject);

      expect(value, `${gate} must not be numeric zero`).not.toBe(0);
      expect(value, `${gate} must not be a Money zero`).not.toBeInstanceOf(Money);
      expect(typeof value, `${gate} must not be a number at all`).not.toBe('number');
    }
  });

  it('reads every gate as undefined on the fixture graph permissive qualifier too', () => {
    // A second, independently constructed witness: the fixture module builds this exhibit with all
    // ten columns omitted, which is the shape a repository hands back for a row that gates nothing.
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
    // A `maximumOrderQuantity` of 0 is a REAL, restrictive configuration: nothing qualifies.
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
    // of a min/max pair, and no rejection of a maximum below its minimum.
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

// --- 3. Three type families across ten gates - and weight is not money --------------------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L63-L64]: minimumFulfillmentWeight and
// maximumFulfillmentWeight are ormtype="big_decimal" like the currency gates, but
// hb_formatType="weight" -- they are WEIGHTS, not money, and must NOT be modelled as Money.
//
// So `ormtype` alone does NOT decide the target type; `hb_formatType` does. Four gates are
// `currency` [L57, L58, L61, L62] and become `Money`. Four are `ormtype="integer"` with no format
// type at all [L55, L56, L59, L60] and become `number`. Two are `big_decimal` + `weight` [L63, L64]
// and become `number` as well - typing a shipping weight as `Money` would assert a currency the
// column does not have. THIS ENTITY HAS NO `currencyCode` COLUMN, so even the four monetary gates
// carry no currency of their own. Every monetary expectation below is a `Money` or a decimal
// STRING, and no computed JavaScript float appears anywhere.

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

    // Decimal STRINGS, never floats.
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
    // THE ASSERTION THIS BLOCK EXISTS FOR. `big_decimal` on [L63-L64] makes these look exactly like
    // the currency gates in the ORM metadata, and `hb_formatType="weight"` is the only thing that
    // distinguishes them.
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
    const subject = aQualifier({ minimumFulfillmentWeight: 2.5, maximumFulfillmentWeight: 47.5 });

    expect(subject.getMinimumFulfillmentWeight()).toBe(2.5);
    expect(subject.getMaximumFulfillmentWeight()).toBe(47.5);
  });
});

// --- 4. The property / accessor double orphan - both halves preserved ---------------------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L99,L107-L115]: a DOUBLE ORPHAN.
// qualifierApplicationTypeOptions is declared as a non-persistent property at L99 but has no
// getter, while getRewardMatchingTypeOptions at L107-L115 is a getter with no declared property.
// Both halves preserved as-written; neither is completed. The two sit FIVE LINES APART and are
// exact mirror images, which is what makes them a single finding rather than two coincidences:
//
//   * L99 DECLARES A PROPERTY WITH NO PROVIDER:
//     `property name="qualifierApplicationTypeOptions" type="array" persistent="false";`
//     Nothing in the component's 373 lines reads it, writes it, or offers a
//     `getQualifierApplicationTypeOptions()`. The legacy dispatcher would synthesise an accessor
//     resolving to nothing; a driver-only port has no dispatcher, so it authors NO member at all.
//   * L107-L115 declares `getRewardMatchingTypeOptions()` - A PROVIDER WITH NO DECLARED PROPERTY.
//     It serves `rewardMatchingType` [L65], which IS declared, so the method is genuinely live:
//     `hb_formFieldType="select"` on L65 means the admin form consumes it.
//
// AUTHORING ONE AND NOT THE OTHER IS FIDELITY, NOT REPAIR. Completing either half would invent
// surface the legacy component does not have. There is NO numbered legacy defect for this: the
// orphan pair costs nothing at runtime and changes no money, so it is a `CFML parity` note and the
// divergence budget stays at zero.

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
    // HALF ONE. `qualifierApplicationTypeOptions` [L99] is `persistent="false"` and unreachable in
    // the source, so the port exposes nothing for it under any spelling.
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
    // HALF TWO.
    const subject = aQualifier();

    expect(prototypeMembers()).toContain('getRewardMatchingTypeOptions');
    expect(typeof subject.getRewardMatchingTypeOptions).toBe('function');
    expect(subject.getRewardMatchingTypeOptions()).toHaveLength(5);
  });

  it('serves the option list from a bare instance, with no column set', () => {
    // The list is a CONSTANT of the class, not a projection of the row: the admin form needs the
    // domain before the user has chosen from it.
    const bare = aQualifier();

    expect(bare.getRewardMatchingType()).toBeUndefined();
    expect(bare.getRewardMatchingTypeOptions().map((option) => option.value)).toEqual(
      REWARD_MATCHING_TYPES,
    );
  });

  it('serves the same option list from every instance, whatever the column holds', () => {
    // Two independently built subjects - one saved with a chosen mode, one transient with none -
    // must offer identical vocabularies.
    const chosen = aSavedQualifier('qualifier-with-mode', { rewardMatchingType: 'productType' });
    const bare = aQualifier();

    expect(chosen.getRewardMatchingTypeOptions()).toEqual(bare.getRewardMatchingTypeOptions());
    expect(chosen.getRewardMatchingType()).toBe('productType');
  });
});

// --- 5. The matching vocabulary, the inert rbKeys, and the un-narrowed qualifierType ------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: five values in the source's own
// order, `any`, `sku`, `product`, `productType`, `brand`. `RewardMatchingType` is a CLOSED union of
// exactly those five, and the option list's `value` fields match them one-for-one IN THAT ORDER.
// Order is asserted, not membership alone, because L65 declares `hb_formFieldType="select"`: the
// list IS the admin dropdown.
//
// A SHIPPED-SURFACE FINDING THAT INVERTS AN EXPECTATION. The agent contract anticipated that
// `rewardMatchingType` [L65] would stay an un-narrowed `string`. The shipped module narrows it and
// leaves `qualifierType` [L53] as the un-narrowed one, and that asymmetry is EVIDENCE-DRIVEN:
//
//   * `rewardMatchingType` has a SELF-DECLARED option list on the entity [L107-L115] and
//     `hb_formFieldType="select"` [L65], so the union reproduces a constraint the source asserts.
//   * `qualifierType` has NO option list - there is no `getQualifierTypeOptions()` anywhere in the
//     373 lines - and the engine tests it with a CASE-INSENSITIVE COMMA-LIST MEMBERSHIP CHECK
//     [model/service/PromotionService.cfc:L714]. Narrowing it would reject rows the legacy schema
//     accepts, which is a behaviour change dressed as a type improvement.
//
// This suite PINS THE SHIPPED REALITY and does not narrow `qualifierType`.

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
    // validation - there is no PromotionQualifier.json to reject it.
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
    // JavaRB is not ported and no i18n runtime is introduced, so the keys are preserved verbatim as
    // strings the legacy admin can still resolve.
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
    // [L53] declares `ormtype="string"` with `hb_formatType="rbKey"`, NO option list and NO length
    // constraint. The three values the engine tests for [model/service/PromotionService.cfc:L714]
    // are asserted as DATA the column accepts, NOT as a closed domain and NOT as engine behaviour.
    for (const qualifierType of ['merchandise', 'contentAccess', 'subscription']) {
      expect(aQualifier({ qualifierType }).getQualifierType()).toBe(qualifierType);
    }

    // And a value outside that trio is accepted without complaint, at compile time and at run time,
    // which is precisely what "un-narrowed" means.
    const unexpected = aQualifier({ qualifierType: 'somethingTheAdminTyped' });
    expect(unexpected.getQualifierType()).toBe('somethingTheAdminTyped');
    expect(aQualifier({ qualifierType: 'MERCHANDISE' }).getQualifierType()).toBe('MERCHANDISE');
    expect(aQualifier({ qualifierType: '' }).getQualifierType()).toBe('');
  });

  it('resolves an absent qualifierType to undefined rather than to an empty string', () => {
    // A NULL column and a column holding `''` are different rows, and the port keeps them
    // different, applying the discipline the ten gates get to the string column.
    expect(aQualifier().getQualifierType()).toBeUndefined();
    expect(aQualifier({ qualifierType: '' }).getQualifierType()).not.toBeUndefined();
  });

  it('resolves an absent rewardMatchingType to undefined rather than to the first option', () => {
    // The narrowed union does NOT imply a default. [L65] declares no `default=`, so an unset column
    // reads `undefined`; defaulting it to `'any'` would widen every unconfigured qualifier into one
    // that matches everything.
    const bare = aQualifier();

    expect(bare.getRewardMatchingType()).toBeUndefined();
    expect(bare.getRewardMatchingType()).not.toBe('any');
  });
});

// --- 6. The thirteen associations, the Group A / B / C split, and the link tables ---------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L73-L87]: thirteen many-to-many OWNER
// collections, one fewer than PromotionReward's fourteen -- the qualifier has NO
// eligiblePriceGroups. Do not invent one. That single missing collection IS the structural
// difference between the two entities: `PromotionReward` declares `eligiblePriceGroups` pointing at
// `SwPromoRewardEligiblePriceGrp` [model/entity/PromotionReward.cfc:L74]; nothing here corresponds
// to it under any spelling.
//
// The thirteen split three ways, and only TEN materialize as entity arrays:
//
//   * GROUP A [L73-L75] - `fulfillmentMethods`, `shippingMethods`, `shippingAddressZones`. The far
//     sides (`FulfillmentMethod`, `ShippingMethod`, `AddressZone`) are OUT OF SCOPE and NOT PORTED,
//     so they collapse to `readonly string[]` opaque identifiers with NO add, NO remove and NO has.
//     These are the relationships for which the component hand-writes no helper anywhere in its 373
//     lines, so the collapse is LOSSLESS with respect to authored logic.
//   * GROUP B [L77-L81] - the five INCLUDE lists, real entity arrays.
//   * GROUP C [L83-L87] - the five EXCLUDE lists, real entity arrays.
//
// NONE of the thirteen is marked `inverse="true"`, so this entity OWNS every link table - which is
// why both sides of every helper are synchronised by hand rather than by the ORM.

describe('the thirteen associations split three ways, and the fourteenth is not invented', () => {
  it('counts exactly thirteen many-to-many collections', () => {
    const { qualifierManyToManyCollectionCount } = freshFixtures();

    expect(qualifierManyToManyCollectionCount).toBe(13);
    expect(Object.keys(LEGACY_LINK_TABLES)).toHaveLength(13);
  });

  it('declares no eligiblePriceGroups, under any spelling', () => {
    // The one-collection difference from `PromotionReward` [model/entity/PromotionReward.cfc:L74].
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
    // The renamed readers are the ONE departure from verbatim CFML naming here, and the rename is
    // what makes it honest: `getFulfillmentMethodIDs()` says "strings", where
    // `getFulfillmentMethods()` would promise entities this port does not have.
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
    // The absence is the assertion.
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
    // from the ten gates, and correct for the opposite reason: emptiness is knowable from the link
    // table itself, whereas a NULL numeric column is genuinely unset.
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
    // C5 SCHEMA CONTINUITY.
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
    // `excludedOptions` declare `type="array"`; the other ELEVEN many-to-many declarations omit it.
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

// --- 7. Membership, the live arrays, and the far-side guard -------------------------------------
//
// Three rulings meet in this block, each pinned to the shipped module rather than assumed.
//
// (a) COMPARISON IS BY PRIMARY KEY FOR A PERSISTED CANDIDATE - never object identity, never deep
//     equality. BUT THE SHIPPED RULE IS MIXED: when the candidate's key is still the
//     `unsavedvalue=""` empty string, `indexOfEntity` falls back to REFERENCE IDENTITY, because
//     every transient entity shares the key `''`. Both halves are asserted.
//
// (b) THE COLLECTION ACCESSORS RETURN LIVE ARRAYS, not defensive copies. That is required rather
//     than tolerated: `add*`/`remove*` reach the FAR side through the far side's own accessor, so a
//     defensive copy anywhere in that chain would silently discard half of every bidirectional
//     update. It also makes A2 freshness non-negotiable.
//
// (c) THE FAR-SIDE GUARD IS `this.isNew() || !far.hasPromotionQualifier(this)`, reproduced from
//     [model/entity/PromotionQualifier.cfc:L144] and its nine siblings. CFML `or` short-circuits,
//     so on a TRANSIENT qualifier the containment probe never runs and a repeated `add*` APPENDS A
//     DUPLICATE to the far side - a `CFML parity` fact rather than a numbered defect, since no
//     in-scope caller adds the same pair twice.
//
// INVERSION CROSS-CHECK - VERDICT: ALL ELEVEN `remove*` HELPERS HERE ARE CORRECT; all twenty-two
// guarded deletions remove from the collection they should, near side and far. The contrast is
// [model/entity/Option.cfc:L145-L147], whose `removePromotionQualifierExclusion` calls
// `addExcludedOption(this)` at L146 - a genuine inversion on the FAR side of this same link, OWNED
// AND ASSERTED BY `option.test.ts`, cited and deliberately NOT re-asserted here.

describe('membership compares by primary key, and the collections are live', () => {
  it('matches a persisted far side by primary key across distinct objects', () => {
    // (a) FIRST HALF.
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
    // (a) SECOND HALF - THE MIXED RULE.
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
    // THE `findIndex` BASE-CHANGE TRAP, asserted rather than trusted.
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
    // Both guarded deletions simply do not fire.
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
    // (b).
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
    // brand may legitimately sit on both lists - the legacy schema forbids it nowhere.
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
    // (c) far-side symmetry, swept across every helper pair rather than sampled.
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
    // BOTH `isNew()` short-circuits false, both containment probes run, and a repeated `add*` is
    // idempotent on both sides.
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
    // (c) THE SHORT-CIRCUIT CONSEQUENCE, REPRODUCED DELIBERATELY. CFML parity
    // [model/entity/PromotionQualifier.cfc:L144], the far-side guard:
    //   if(isNew() OR NOT arguments.brand.hasPromotionQualifier(this))
    // CFML `or` short-circuits and `isNew()` is TRUE for an unsaved qualifier, so the containment
    // probe is never reached and the far side receives a second copy.
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
    const subject = aSavedQualifier('qualifier-near-duplicate');
    const transientBrand = aBrand();

    subject.addBrand(transientBrand);
    subject.addBrand(transientBrand);

    expect(subject.getBrands()).toEqual([transientBrand, transientBrand]);
    // The far side's probe DID run - the qualifier is saved - so it holds one entry.
    expect(transientBrand.getPromotionQualifiers()).toEqual([subject]);
  });

  it('leaks no membership between tests, because every subject is fresh', () => {
    // A2 FRESHNESS, proven rather than promised.
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
    // THE INVERSION CROSS-CHECK, EXECUTED. The verdict recorded above the block - all eleven
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
    // The period side is the eleventh pair and the only one that is not many-to-many
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
    // neither supplied nor stored raises.
    expect(() => {
      subject.removePromotionPeriod();
    }).toThrow(/promotionPeriod/i);
  });
});

// --- 8. hasAnyOption / hasAnyExcludedOption, and the empty-collection polarity -------------------
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: hasAnyInProperty dispatches via evaluate()
// (not ported) and returns false at L348 for an empty array. That false is PERMISSIVE when read
// against an exclude-list (nothing excluded) and RESTRICTIVE when read against an include-list
// (nothing qualifies) -- two of the five distinct empty-collection semantics in this migration.
// Collapsing any of them is a money bug. The remaining three are NOTED AND DELIBERATELY NOT
// RE-TESTED, because each is owned elsewhere:
//
//   3. RESTRICTIVE in the address-zone evaluator - a zone with an EMPTY `locations` collection
//      reports "not in zone", so a qualifier gated on it never fires. Owned by the address-zone
//      port's own suite; this entity holds only opaque zone identifiers.
//   4. THE FULFILLMENT THREE-WAY GATE [model/service/PromotionService.cfc:L333-L420] - empty
//      fulfillment-method, shipping-method and address-zone sets read with three DIFFERENT
//      polarities inside one method. Owned by `tests/unit/services/promotion/**`.
//   5. `Brand.getProducts()` DEFAULTING TO `[]` - the one with genuine legacy coverage, asserted by
//      `meta/tests/unit/entity/BrandTest.cfc:L58-L60` and carried forward by `brand.test.ts`.
//
// THE `evaluate()`-BASED DYNAMIC DISPATCH IS NOT PORTED. [org/Hibachi/HibachiEntity.cfc:L344]
// builds a method name as a STRING and evaluates it, so in the legacy runtime `hasAnyOption` and
// `hasAnyExcludedOption` are synthesised at call time rather than declared. The port authors both
// explicitly: no `evaluate`, no `eval`, no `new Function`, no `vm`, no tokenizer, no `Proxy`
// dispatch. The BEHAVIOUR is reproduced exactly - primary-key comparison, `false` on an empty
// array, short-circuit on first match.

describe('the any-of predicates keep their polarity, on both an include and an exclude list', () => {
  it('authors both predicates explicitly, with no dynamic dispatch behind them', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    expect(members).toContain('hasAnyOption');
    expect(members).toContain('hasAnyExcludedOption');
    expect(typeof subject.hasAnyOption).toBe('function');
    expect(typeof subject.hasAnyExcludedOption).toBe('function');

    // The legacy synthesises ANY `hasAny<Property>` name [org/Hibachi/HibachiEntity.cfc:L517-L519].
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
    // Comparison is by `optionID` only.
    const subject = aSavedQualifier('qualifier-any-option');
    const held = anOption('option-shared-key');
    const twin = anOption('option-shared-key');

    subject.addOption(held);

    expect(subject.hasAnyOption([held])).toBe(true);
    expect(subject.hasAnyOption([twin])).toBe(true);
    expect(twin).not.toBe(held);
  });

  it('finds an option on the exclude list without consulting the include list', () => {
    // The two predicates read two different collections [L78 versus L84].
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
    // EMPTY CASE ONE, RESTRICTIVE POLARITY. [org/Hibachi/HibachiEntity.cfc:L348] falls straight
    // through to `return false` when there is nothing to iterate.
    const subject = aSavedQualifier('qualifier-empty-input');

    subject.addOption(anOption('option-held'));

    expect(subject.getOptions()).toHaveLength(1);
    expect(subject.hasAnyOption([])).toBe(false);
  });

  it('answers false for an empty supplied array on the exclude list - PERMISSIVE', () => {
    // EMPTY CASE TWO, PERMISSIVE POLARITY - THE SAME `false` FROM THE SAME LINE, MEANING THE
    // OPPOSITE THING.
    const subject = aSavedQualifier('qualifier-empty-input');

    subject.addExcludedOption(anOption('option-excluded'));

    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.hasAnyExcludedOption([])).toBe(false);
  });

  it('answers false when the qualifier collection itself is empty, on both lists', () => {
    // The other emptiness: a populated input against an EMPTY near-side collection.
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
    // `Sku.getOptions()`, which is itself `readonly`.
    const subject = aSavedQualifier('qualifier-readonly-input');
    const held = anOption('option-readonly');
    const frozen: readonly Option[] = Object.freeze([held]);

    subject.addOption(held);
    subject.addExcludedOption(held);

    expect(subject.hasAnyOption(frozen)).toBe(true);
    expect(subject.hasAnyExcludedOption(frozen)).toBe(true);
  });

  it('does not mutate either collection while answering', () => {
    // Both predicates are READ-ONLY, which the live-array ruling makes worth proving: a probe that
    // appended a miss while searching would corrupt the membership the engine reads next.
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
    // The mixed comparison rule reaches the any-of predicates too, because they delegate.
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

// --- 9. The simple representation, its property name, and the formatter boundary -----------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L101-L103], the body verbatim:
//
//   return "#rbKey('entity.promotionQualifier')# - #getFormattedValue('qualifierType')#";
//
// Two resource-bundle lookups and a literal `" - "` separator. NEITHER LOOKUP RESOLVES IN THE
// TARGET: JavaRB is not ported, no i18n runtime is introduced, and this entity has ZERO
// `getService(` sites, so injecting a label provider would add a collaborator the source does not
// have. Both keys are emitted as INERT STRINGS the admin tier can still resolve, so the method is
// TOTAL - it cannot fail.
//
// A CASING DISAGREEMENT THAT IS CARRIED, NOT CORRECTED. The first key is hand-written in the source
// and is lower-camel, `entity.promotionQualifier`. The second is composed by the framework from
// `getEntityName()` [org/Hibachi/HibachiTransient.cfc:L504-L510] and therefore carries an INITIAL
// CAPITAL, `entity.PromotionQualifier.qualifierType.<value>`. Normalising either would change a
// bundle lookup, so both are reproduced exactly as the legacy produces them.
//
// THE INHERITED LEGACY ASSERTION IS NOT FORCED. `simple_representation_exists_and_is_simple`
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] is inherited by every legacy entity
// test, and `PromotionQualifier` HAS NO LEGACY TEST AT ALL, so the shipped reality was MEASURED
// rather than assumed: an unset `qualifierType` yields the formatter's empty string, so the value
// is `'entity.promotionQualifier - '` WITH A TRAILING SPACE. Odd looking, still perfectly simple,
// and asserted as it is.
//
// BANNER-PLACEMENT WART, ANNOTATED AND NEVER NORMALISED: `getSimpleRepresentation()` sits at
// L101-L103, OUTSIDE every banner - "START: Non-Persistent Property Methods" opens at L105 - while
// its partner `getSimpleRepresentationPropertyName()` sits inside "Overridden Methods" at
// L353-L363. The port reproduces the members, not the banners.

describe('the simple representation composes two inert keys around a literal separator', () => {
  it('composes the entity key, the separator and the formatted qualifier type', () => {
    const subject = aQualifier({ qualifierType: 'merchandise' });

    expect(subject.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.merchandise',
    );
  });

  it('keeps the separator exactly space-hyphen-space', () => {
    // The literal is `" - "` in the source, not `" | "` and not `": "`.
    const subject = aQualifier({ qualifierType: 'subscription' });
    const representation: string = subject.getSimpleRepresentation();

    expect(representation).toContain(' - ');
    expect(representation.split(' - ')).toHaveLength(2);
    expect(representation.startsWith('entity.promotionQualifier - ')).toBe(true);
  });

  it('resolves neither key, and emits no translated text', () => {
    // THE RULING THIS TEST EXISTS FOR. `getFormattedValue('qualifierType')` would resolve a bundle
    // key in the legacy because [L53] declares `hb_formatType="rbKey"`.
    const representation: string = aQualifier({
      qualifierType: 'merchandise',
    }).getSimpleRepresentation();

    expect(representation).toContain('entity.promotionQualifier');
    expect(representation).toContain('entity.PromotionQualifier.qualifierType.');
    expect(representation).not.toContain('Merchandise ');
    expect(representation).not.toMatch(/promotion qualifier/i);
  });

  it('carries the framework casing on the composed key and the hand-written casing on the first', () => {
    //Both spellings in one string, side by side, so the disagreement cannot be quietly
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
    // MEASURED, NOT ASSUMED.
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
    // MEASURED, AND IT CORRECTS A PLAUSIBLE ASSUMPTION. The shipped presence test is `isNullish`,
    // carrying CFML `isNull()` semantics: `null` or `undefined` only, DELIBERATELY NOT `len()`. So
    // a row holding `''` composes the rbKey with an EMPTY SUFFIX instead of short-circuiting, and
    // `''` and NULL produce DIFFERENT representations.
    //
    // JUDGMENT CALL: assert the measured string rather than the tidier one this test originally
    // expected. The first draft asserted that `''` and NULL collapse; it FAILED, and the failure
    // was correct, so the assertion was corrected to the shipped reality rather than the port to
    // the guess.
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
    // TOTAL.
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
    // The representation reads ONE column.
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
    // [model/entity/PromotionQualifier.cfc:L355-L357], return at L356. LOCATOR CORRECTION,
    // RECORDED: an upstream summary cites `L355-L356` for this member. Read first-hand it spans
    // L355-L357 with its `return` on L356.
    const subject = aQualifier();

    expect(subject.getSimpleRepresentationPropertyName()).toBe('qualifierType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('QualifierType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('promotionQualifierID');
  });

  it('names the same property the representation actually formats', () => {
    // The two overridden members agree in the source, and the agreement is the point: the property
    // NAMED here is the property FORMATTED there.
    const subject = aQualifier({ qualifierType: 'merchandise' });
    const named: string = subject.getSimpleRepresentationPropertyName();

    expect(named).toBe('qualifierType');
    expect(subject.getSimpleRepresentation()).toContain(
      `entity.PromotionQualifier.${named}.merchandise`,
    );
  });

  it('returns the same property name for every instance, saved or not', () => {
    // A CONSTANT of the class, not a projection of state - the same ruling the option list gets.
    // SIBLING COMPARISON, FOR CONTEXT ONLY AND ASSERTED NOWHERE HERE: the other overriding in-scope
    // entities name `'promotionCode'` [model/entity/PromotionCode.cfc:L171-L173], the reward type
    // [model/entity/PromotionReward.cfc:L414], the CAPITAL-D `'DisplayName'`
    // [model/entity/PriceGroupRate.cfc:L270-L271] - a wart owned by `priceGroupRate.test.ts` - and
    // `'productName'` [model/entity/Product.cfc:L791-L793].
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

// --- 10. isDeletable() - a three-level chain with two unguarded dereferences ---------------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L359-L361]: isDeletable chains three levels
// (qualifier -> period -> promotion) and calls getPromotionPeriod() TWICE in one expression, so an
// absent period or an absent promotion both throw. PromotionReward.isDeletable follows the
// identical double-call throw pattern. The source body, verbatim:
//
//   return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();
//
// FIVE OUTCOMES, and every one of them is reachable rather than theoretical:
//
//   1. ABSENT PERIOD                        -> THROWS. [L68] declares no `notnull`, so the key is
//                                              nullable, and `removePromotionPeriod()` clears it.
//   2. EXPIRED PERIOD                       -> false, by short-circuit. The promotion is NEVER
//                                              reached, so it cannot raise even when absent.
//   3. UNEXPIRED PERIOD, ABSENT PROMOTION   -> THROWS. `isExpired()` IS guarded
//                                              [model/entity/PromotionPeriod.cfc:L84 tests
//                                              `isDate()`], `getPromotion()` is NOT.
//   4. UNEXPIRED PERIOD, UNDELETABLE PROMO  -> false, delegated.
//   5. UNEXPIRED PERIOD, DELETABLE PROMO    -> true, delegated.
//
// THE DOUBLE `getPromotionPeriod()` CALL IS A DEREFERENCE-SURFACE FACT, NOT A PERFORMANCE ONE: it
// names the SAME nullable link twice in one expression, which is why outcome 1 raises on the FIRST
// call, before `isExpired()` can be consulted, and outcome 3 on the SECOND. The port reads the link
// once into a local. THE THROWS ARE REPRODUCED, NOT REPAIRED: answering `false` would invent a
// permissive rule the legacy does not have, `true` the opposite. `PromotionReward.isDeletable()`
// follows the identical pattern - asserted by `promotionReward.test.ts`.

describe('isDeletable climbs three levels, and raises where the legacy raises', () => {
  it('raises when the qualifier has no promotion period', () => {
    // OUTCOME 1. The first dereference [L360] is unguarded, so there is nothing to short-circuit.
    const orphan = aSavedQualifier('qualifier-no-period', { promotionPeriod: undefined });

    expect(orphan.getPromotionPeriod()).toBeUndefined();
    expect(() => orphan.isDeletable()).toThrow(/promotion period/i);
    expect(() => orphan.isDeletable()).toThrow(/L360/);
  });

  it('raises after its period has been cleared, which is how the absence is reached', () => {
    // `removePromotionPeriod()` sets the nullable link back to `undefined`, so a qualifier that WAS
    // deletable becomes a raising one.
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
    // OUTCOME 2.
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
    // OUTCOME 3, THE SUBTLEST. `isExpired()` IS GUARDED [model/entity/PromotionPeriod.cfc:L84] and
    // answers false for an absent end bound, so the chain proceeds past the first link and breaks
    // on the second, which has no guard at all.
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
    // Two different broken links, two different diagnostics.
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
    // OUTCOME 4, delegated.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-undeletable-promotion');
    const period = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');

    subject.setPromotionPeriod(period);

    expect(period.isExpired()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('answers true for an unexpired period whose promotion is deletable', () => {
    // OUTCOME 5, delegated.
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
    // The two conditions are ANDed, so either one alone is not enough.
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
    // Two periods identical but for their end bound, read through the SAME fixed instant.
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
    // undeletable between two calls is reported honestly rather than from a stale answer.
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
    // transient qualifier answers exactly as a persisted one does.
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

// --- 11. No validation schema - the absence is asserted, and nothing is invented -----------------
//
// CFML parity [model/validation/]: there is NO PromotionQualifier.json - one of exactly six
// in-scope artefacts with no validation schema, enumerated with the folder census on the
// `ABSENT_VALIDATION_SURFACE` constant above. The absence is deliberate and is NOT completed here.
//
// WHAT FOLLOWS FROM THE ABSENCE, STATED AS CONSEQUENCES RATHER THAN AS GAPS TO FILL:
//
//   * NO required-field rule. A qualifier with no `qualifierType`, no period and no gates is
//     acceptable data.
//   * NO `dataType`, NO `minValue`, NO `maxValue`. Nothing rejects a NEGATIVE minimum or a maximum
//     BELOW its own minimum - the gate block asserts that inverted pair round-trips untouched.
//   * NO length constraint on `qualifierType` [L53], because L53 declares none.
//   * NO DELETE GATE, DESPITE `isDeletable()` EXISTING IN CODE - the sharpest consequence.
//     `model/validation/Promotion.json` wires a `"method"` validator into its delete context, so
//     the framework consults it before a delete. This entity has no schema to wire anything into,
//     so its `isDeletable()` is advisory: callers may consult it, and NOTHING enforces it.
//   * NONE of the five declaratively-invoked entity validators, enumerated on the same constant.
//
// NO ZOD SCHEMA IS ASSERTED IN THIS FILE. Schema enforcement lives at the service tier in this
// port; entities carry property metadata.

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
    // THE ABSENCE, EXERCISED RATHER THAN MERELY STATED.
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
    // THE DELETE-GATE ASYMMETRY.
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

// --- 12. Structural facts, and the framework base class that is not ported ----------------------
//
// CFML parity [model/entity/PromotionQualifier.cfc:L49]: `hb_permission` IS CORRECTLY SPELLED here,
// `promotionPeriod.promotionQualifiers`. The direct contrast is
// [model/entity/PromotionReward.cfc:L57], whose equivalent reads
// `hb_permission="promotionPeriod.promtionRewards"`, missing the `o` in "promotion". THE SIBLING'S
// MISSPELLING IS THE PROMOTION FOLDER'S SINGLE RENAME AND THIS FILE REQUIRES NONE; this
// correctly-spelled control is what makes the sibling's identifiable as a typo rather than a
// convention. `promotionReward.test.ts` owns the rename; cited here, not re-asserted.
//
// LOCATOR CORRECTION, RECORDED: the reward's component declaration - and therefore its
// `hb_permission` - is at `PromotionReward.cfc:L57`, not the L49 an upstream summary cites. Source
// wins.
//
// FOUR MORE WARTS, ANNOTATED AND NEVER NORMALISED: [L49] declares NEITHER `output="false"` NOR
// `accessors="true"`, unlike several siblings, and both are CFML-engine directives with no target
// analogue; [L83-L84] carry `type="array"` while the other eleven many-to-many declarations omit
// it, asserted in the association block in both directions; [L349]/[L351] spell the tail banner
// "Overridden Implicet Getters", the same misspelling as
// [model/entity/PromotionCode.cfc:L165]/[L167], and the banner is EMPTY so there is no member to
// port; [L101-L103] files `getSimpleRepresentation()` outside every banner, recorded in block 9.
//
// [L365]/[L367] IS AN EMPTY ORM EVENT HOOKS PAIR, SO THIS ENTITY HAS NO HOOKS. Contrast
// [model/entity/PriceGroup.cfc:L206-L214] and [model/entity/ProductType.cfc:L305-L313], which
// maintain a materialized path BEFORE calling `super`, and [model/entity/Category.cfc:L126-L134],
// which calls `super` FIRST. This entity has no path column of any kind.
//
// THE HIBACHI BASE CLASS IS DOCUMENTED, NOT PORTED. `PromotionQualifier` does not declare
// `attributeValues`, so in CFML an unknown `getX()` THROWS through
// [org/Hibachi/HibachiEntity.cfc:L565] - one of the fourteen throwing entities, against the four
// silent ones (`Sku.cfc:L70`, `Product.cfc:L75`, `ProductType.cfc:L67`, `Brand.cfc:L60`). The
// target has NO dynamic dispatch, so an unknown member is simply `undefined`. The unported base
// members are enumerated on `UNPORTED_FRAMEWORK_MEMBERS` above.

describe('the structural facts hold, and the framework base class stays unported', () => {
  it('spells hb_permission correctly, unlike its sibling', () => {
    // The control that proves the reward's spelling is a typo.
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
    // `isNew()` can answer truthfully without a separate flag.
    const fresh = aQualifier();

    expect(fresh.getPromotionQualifierID()).toBe('');
    expect(fresh.isNew()).toBe(true);
    expect(aSavedQualifier('qualifier-persisted').isNew()).toBe(false);
    expect(aSavedQualifier('qualifier-persisted').getPromotionQualifierID()).toBe(
      'qualifier-persisted',
    );
  });

  it('carries remoteID as an optional string', () => {
    // [L90].
    expect(aQualifier().getRemoteID()).toBeUndefined();
    expect(aQualifier({ remoteID: 'legacy-system-key-42' }).getRemoteID()).toBe(
      'legacy-system-key-42',
    );
  });

  it('carries the four audit columns as dates or undefined, never an epoch stand-in', () => {
    // [L93-L96].
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
    // [L365]/[L367].
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
    // The base-class distinction, DOCUMENTED and not reproduced. In CFML an unknown `getX()` on
    // this entity THROWS [org/Hibachi/HibachiEntity.cfc:L565] because it declares no
    // `attributeValues`; in the target there is no dispatcher, no `Proxy` and no evaluated method
    // name, so an unknown member is plainly absent.
    const subject: unknown = aQualifier();
    const asRecord = subject as Record<string, unknown>;

    expect(asRecord['getSomeAttributeThatNeverExisted']).toBeUndefined();
    expect('getSomeAttributeThatNeverExisted' in asRecord).toBe(false);
    expect(asRecord['attributeValues']).toBeUndefined();
    expect(asRecord['getAttributeValue']).toBeUndefined();
  });

  it('builds without a collaborator port and without a clock', () => {
    // ZERO `getService(` SITES IN THE SOURCE.
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
    // rather than only against hand-built minimal ones.
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
    // A2, PROVEN AT THE FIXTURE BOUNDARY TOO.
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
