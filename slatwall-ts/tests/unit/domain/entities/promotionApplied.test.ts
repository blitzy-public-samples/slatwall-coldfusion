// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/promotionApplied.ts`
//
// WHAT THIS SUITE PINS
// `PromotionApplied` is the `SwPromotionApplied` row, and it plays two roles that make
// its contract worth pinning in detail:
//
//   1. IT IS THE WRITE-SIDE OUTPUT OF THE PROMOTION ENGINE. It is the only row the
//      promotion pipeline creates, and the `discountAmount` it carries IS the discount a
//      customer receives. `PromotionService.updateOrderAmountsWithPromotions` builds one
//      at each of its three application points, and the three blocks are identical in
//      shape [model/service/PromotionService.cfc:L400-L406, L446-L452, L529-L535].
//   2. IT CARRIES THE ANTI-CORRUPTION BOUNDARY AT THE ENTITY LEVEL. Of its four foreign
//      keys, THREE point at the out-of-scope order aggregate - `orderItem`
//      [model/entity/PromotionApplied.cfc:L59], `orderFulfillment` [L60] and `order`
//      [L61] - and exactly ONE, `promotion` [L58], has an in-scope far side. That ratio
//      is why the port keeps two of the component's eight bidirectional helpers and
//      drops six, and why the three order-side keys are opaque strings.
//
// So the suite is organised around what those two roles demand: the closed `appliedType`
// union, the money column that must read `undefined` rather than zero, the
// three-character currency authority, the three opaque identifiers, the two surviving
// bidirectional helpers with their load-bearing guard polarity, and the structural facts
// the row carries.
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent, and that was MEASURED rather than
// assumed: a case-insensitive search of all 32 `.cfc` files under `meta/tests/` for
// `PromotionApplied`, for `appliedType` and for `appliedPromotion` returns ZERO matching
// files. The only legacy suites extended anywhere in this port are
// [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc],
// neither of which mentions this entity, and
// [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing
// zero coverage. There is nothing here to extend, so this file is one of the sixteen
// net-new entity suites and is labelled as such. Presenting it as parity would fail the
// coverage gate.
//
// The four cases that [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed
// every legacy entity suite for free are NOT inherited, and no shared base class is
// introduced to imitate them: `validate_as_save_for_a_new_instance_doesnt_pass` [L51-L54],
// `simple_representation_exists_and_is_simple` [L56-L58] and `has_primary_id_property_name`
// [L60-L62] each rest on framework members the port does not ship. The one assertion of
// theirs that survives is the `isNew()` half of `defaults_are_correct` [L64-L67], authored
// below against the member the port does ship - and authored net-new, not carried forward.
//
// ---------------------------------------------------------------------------
// !! HARD BOUNDARY - THE ENGINE'S BEHAVIOUR IS NOT TESTED HERE !!
// ---------------------------------------------------------------------------
// Everything that DECIDES a discount lives in the service tier and is pinned there. This
// entity is the write TARGET, so the suite proves the row carries what it is given and
// stops. Concretely out of bounds here, with the site that owns each:
//
//   * The descending insert-sort and the `[1]` best-discount selection
//     [model/service/PromotionService.cfc:L529-L534], including the misspelled
//     accumulator key `orderItemQulifiedDiscounts` - service-side, and registered there.
//   * The two-pass reward iteration and its empty-collection guard
//     [model/service/PromotionService.cfc:L458-L461].
//   * The over-use stripping loop [model/service/PromotionService.cfc:L468-L521].
//   * `getDiscountAmount`'s amount-type arithmetic and its rounding
//     [model/service/PromotionService.cfc:L987-L1018].
//   * The ordering requirement that the price-group pass precede the promotion pass.
//
// No assertion below computes a discount. Every amount that appears is supplied BY the
// test and handed straight back, which is the only claim a pure carrier can support.
//
// ---------------------------------------------------------------------------
// NO DEFECT BELONGS TO THIS ENTITY, AND NO DIVERGENCE IS SPENT
// ---------------------------------------------------------------------------
// All eight legacy bidirectional helpers [model/entity/PromotionApplied.cfc:L79-L148] are
// SOUND CODE. Each `set*` guards on `isNew() or !arguments.x.hasAppliedPromotion( this )`
// before appending, and each `remove*` finds by index before deleting. This is the exact
// opposite of `PromotionAccount.setPromotion`, which reaches for a collection
// `model/entity/Promotion.cfc` never declares, and of the four throwing
// `PromotionPeriod` helpers. So this suite carries no defect marker of its own: emitting
// one would misclassify working code. It also claims no deliberate divergence - the
// domain layer's only divergences are the entity memo fixes in the `sku` and `product`
// suites, and this entity declares no non-persistent property for a memo to live in.
//
// One runtime failure IS pinned below, in the `removePromotion` block: calling it with no
// argument on a row that holds no promotion throws. That is faithful reproduction, not a
// finding of this suite - CFML defaults the omitted argument from `variables.promotion`
// [model/entity/PromotionApplied.cfc:L86-L88] and then dereferences it at L89 - and the
// shipped module is where that behaviour is classified. This file pins the outcome.
//
// ---------------------------------------------------------------------------
// FRESHNESS, DATES, AND WHY THERE IS NO `beforeEach`
// ---------------------------------------------------------------------------
// Every test builds its own subject through `aPromotionApplied()` and its own far side
// through `aPromotion()`, so no state crosses a test boundary and there is nothing to
// reset. The two module-level helpers are FUNCTIONS returning fresh objects, never shared
// literals, and no module-level binding in this file is mutable.
//
// Both business-date literals are explicit UTC ISO-8601 strings. Nothing here calls
// `new Date()` with no argument or `Date.now()`, and no fake timer is installed:
// [model/entity/PromotionApplied.cfc] compares no date anywhere, so this entity has no
// clock-dependent branch to control. `tests/setup.ts` pins the process to UTC before any
// suite loads a subject.
//
// `afterEach` restores spies. `tests/setup.ts` already does this globally; it is restated
// here so the file is self-contained and a reader can see that the two far-side spies
// below cannot leak.
//
// No assertion below touches a database, the network, the filesystem, an environment
// variable or a clock, and no SQL appears in this file. No non-functional requirement is
// asserted anywhere, because none exists in the source.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionApplied } from '../../../../src/domain/entities/promotionApplied.js';
import type { PromotionAppliedType } from '../../../../src/domain/entities/promotionApplied.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { toCurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';

// JUDGMENT CALL: `toCurrencyCode` is imported as a VALUE, alongside the `CurrencyCode`
// type, because `CurrencyCode` is a branded alias with no runtime existence
// [src/domain/valueObjects/currencyCode.ts:L342] and a suite cannot build one without
// either the module's own validating brander or a cast. A cast would assert the brand
// without earning it - and would quietly accept a two- or four-character string, which is
// precisely the invariant the `length="3"` column relies on. So the brander is used. It
// lives in `src/domain/valueObjects/`, the same whitelisted layer as the subject, so no
// layer boundary is crossed to reach it.

/**
 * The constructor's parameter object, derived rather than restated.
 *
 * `src/domain/entities/promotionApplied.ts` declares the init shape INLINE and exports only
 * the class and the `appliedType` union, so there is no init type to import. Deriving it with
 * `ConstructorParameters` keeps this suite honest: if a column is added, removed or retyped
 * upstream, the builder below stops compiling instead of silently drifting. Restating the
 * fourteen slots by hand would have hidden exactly that.
 */
type PromotionAppliedInit = ConstructorParameters<typeof PromotionApplied>[0];

/**
 * The columns of an unsaved row, every one of the fourteen slots explicit.
 *
 * A FUNCTION, not a shared literal, so each subject is built from a fresh object and no
 * test can reach another test's data. All thirteen nullable columns start `undefined`,
 * which is exactly the state the engine leaves them in: the three construction blocks
 * [model/service/PromotionService.cfc:L400-L406, L446-L452, L529-L535] set only
 * `appliedType`, `promotion`, one order-side foreign key and `discountAmount`.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L52]: `promotionAppliedID` starts `''`
 * rather than absent, because `unsavedvalue="" default=""` is what makes the empty string
 * the honest answer for a row that has never been saved.
 *
 * @returns a fresh, fully-populated init object for an unsaved row.
 */
function unsavedRowColumns(): PromotionAppliedInit {
  return {
    promotionAppliedID: '',
    discountAmount: undefined,
    appliedType: undefined,
    currencyCode: undefined,
    promotion: undefined,
    promotionID: undefined,
    orderItemID: undefined,
    orderFulfillmentID: undefined,
    orderID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  };
}

/**
 * Builds one applied-promotion row, overriding only what a test cares about.
 *
 * @param overrides - the columns this test is about; everything else stays at the unsaved
 *   default.
 * @returns a fresh `PromotionApplied`.
 */
function aPromotionApplied(overrides: Partial<PromotionAppliedInit> = {}): PromotionApplied {
  return new PromotionApplied({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds the one in-scope far side.
 *
 * `promotionID` is the only slot `Promotion`'s constructor requires; `appliedPromotions`
 * defaults to a fresh empty array, which is what
 * [model/entity/Promotion.cfc:L64] declares and what
 * [meta/tests/unit/entity/BrandTest.cfc]'s `defaults_are_correct` shape would have expected
 * of an unsaved parent.
 *
 * @param promotionID - the identifier to give it.
 * @returns a fresh `Promotion` holding no applied promotions.
 */
function aPromotion(promotionID: string): Promotion {
  return new Promotion({ promotionID });
}

/**
 * The three values `SwPromotionApplied.appliedType` may hold, in the exported union's order.
 *
 * PINNED FROM BOTH SIDES, which is why three literals can be called exhaustive rather than
 * merely observed:
 *
 *   WRITE SIDE - the engine, three string literals and nothing else:
 *     [model/service/PromotionService.cfc:L402] setAppliedType('orderFulfillment')
 *     [model/service/PromotionService.cfc:L448] setAppliedType('order')
 *     [model/service/PromotionService.cfc:L531] setAppliedType('orderItem')
 *
 *   READ SIDE - three raw-SQL predicates in the reporting layer, an INDEPENDENT
 *   confirmation of the same three:
 *     [model/report/PromotionUsageReport.cfc:L82] appliedType = 'order'
 *     [model/report/PromotionUsageReport.cfc:L84] appliedType = 'orderItem'
 *     [model/report/PromotionUsageReport.cfc:L86] appliedType = 'orderFulfillment'
 *
 * Repo-wide, `appliedType` occurs in exactly five places: the property declaration
 * [model/entity/PromotionApplied.cfc:L54], the unrelated [model/entity/TaxApplied.cfc:L58],
 * and those three predicates. There is no fourth value and no sentinel.
 */
const ENGINE_APPLIED_TYPES: readonly PromotionAppliedType[] = [
  'order',
  'orderItem',
  'orderFulfillment',
];

/**
 * The legacy table, named verbatim.
 *
 * SCHEMA CONTINUITY IS BINDING [model/entity/PromotionApplied.cfc:L49]: the port reads and
 * writes `SwPromotionApplied` unchanged - no migration, no rename, no new table, no column
 * change. The name is restated here so that any attempt to normalise it shows up as a diff
 * in this file, and so the test that names it names it correctly.
 */
const LEGACY_TABLE = 'SwPromotionApplied';

/**
 * The four `fkcolumn` values, verbatim, keyed by the property that declares each.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L60]: the fulfillment column is spelled
 * `orderfulfillmentID` with a LOWERCASE f, unlike `orderItemID` [L59] and `orderID` [L61],
 * which both capitalise consistently. Preserved verbatim as a schema contract; annotated,
 * not normalised. The accessor the port authors is `getOrderFulfillmentID`, camel-cased from
 * the PROPERTY name `orderFulfillment` [L60] rather than from the column - the two genuinely
 * differ, and the test below pins that they do so a future "harmonisation" of either name
 * fails here rather than at a database.
 */
const LEGACY_FK_COLUMNS = {
  promotion: 'promotionID',
  orderItem: 'orderItemID',
  orderFulfillment: 'orderfulfillmentID',
  order: 'orderID',
} as const;

/**
 * Every member the port authors on the prototype, sorted - the interface-parity contract in
 * executable form.
 *
 * Nineteen names. Seventeen are legacy CFML names verbatim: the four persistent-column
 * getters over [model/entity/PromotionApplied.cfc:L52-L55], the four foreign-key accessors
 * over [L58-L61] (three of them reduced to opaque identifiers, one hydrated), the
 * `promotionID` projection of [L58], the remote getter [L64], the four audit accessors
 * [L67-L70], and the two surviving bidirectional helpers [L79-L84, L85-L94]. Two are the
 * writable columns' setters, which exist because the engine calls them
 * [model/service/PromotionService.cfc:L402, L405]. The nineteenth, `isNew`, is the single
 * framework member this component genuinely calls, at
 * [model/entity/PromotionApplied.cfc:L81, L99, L117, L135].
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  'getAppliedType',
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getCurrencyCode',
  'getDiscountAmount',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getOrderFulfillmentID',
  'getOrderID',
  'getOrderItemID',
  'getPromotion',
  'getPromotionAppliedID',
  'getPromotionID',
  'getRemoteID',
  'isNew',
  'removePromotion',
  'setAppliedType',
  'setDiscountAmount',
  'setPromotion',
];

/**
 * The six bidirectional helpers the port deliberately drops.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L97-L112, L115-L130, L133-L148]: all six are
 * sound legacy code, and all six take or return an entity from the out-of-scope order
 * aggregate - `OrderItem`, `OrderFulfillment`, `Order`. Porting any one of them would require
 * porting that aggregate, so the three keys they maintain become opaque identifiers instead
 * and the helpers go. Their absence is a SCOPE RULING, which is why it is asserted rather
 * than merely documented: a later well-meaning addition would silently undo it.
 */
const DROPPED_ORDER_SIDE_HELPERS: readonly string[] = [
  'setOrderItem',
  'removeOrderItem',
  'setOrderFulfillment',
  'removeOrderFulfillment',
  'setOrder',
  'removeOrder',
];

/**
 * Setters the port authors for no column, because nothing writes them.
 *
 * `setCurrencyCode` and `setRemoteID` are absent because a case-insensitive sweep of the
 * whole of [model/service/PromotionService.cfc] returns ZERO hits for either, so no in-scope
 * caller exists. The three order-side identifier setters and the primary-key setter are
 * absent because those columns are `readonly` on the ported row: the repository supplies them
 * at hydration and nothing may re-point them afterwards.
 */
const UNAUTHORED_SETTERS: readonly string[] = [
  'setCurrencyCode',
  'setRemoteID',
  'setOrderItemID',
  'setOrderFulfillmentID',
  'setOrderID',
  'setPromotionAppliedID',
  'setPromotionID',
];

/**
 * Members the legacy framework base and its dispatcher supplied, none of them ported.
 *
 * [org/Hibachi/HibachiEntity.cfc:L507-L565] is an `onMissingMethod` dispatcher matching eleven
 * method-name patterns and TERMINATING IN A THROW AT L565. TypeScript must not emulate dynamic
 * dispatch, so there is no `Proxy`, no index signature and no `variables.` scope object in the
 * port - only concretely-called members are authored. The EAV fallback at
 * [org/Hibachi/HibachiEntity.cfc:L559] is doubly unreachable from this entity, because it
 * guards on `hasProperty("attributeValues")` and
 * [model/entity/PromotionApplied.cfc:L52-L70] declares no `attributeValues` collection, so in
 * CFML an unknown `getX()` on this component throws directly at L565.
 */
const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = [
  'getNewFlag',
  'getPrimaryIDValue',
  'getPrimaryIDPropertyName',
  'getSimpleRepresentation',
  'getPrintTemplates',
  'getEmailTemplates',
  'getAttributeValue',
  'clearAttributeCache',
  'validate',
  'hasErrors',
  'getErrors',
  'preInsert',
  'preUpdate',
  'isDeletable',
  'getAppliedTypeOptions',
  'getDiscountAmountFormatted',
];

/**
 * The prototype's own members, minus the constructor, sorted.
 *
 * @returns every member name the class installs on instances.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionApplied.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  // A2: the two far-side spies below must not outlive their test. `tests/setup.ts` already
  // restores globally; this makes the guarantee local and visible.
  vi.restoreAllMocks();
});

describe('the ported surface, and the six helpers deliberately dropped', () => {
  it('installs exactly the nineteen authored members, plus one private identity helper', () => {
    // `isSameRowAs` is `private` in TypeScript, which is a compile-time visibility rule and not
    // a runtime one, so it is present on the prototype and has to be accounted for here. It is
    // listed separately rather than folded into the public surface precisely because it is not
    // part of the interface-parity contract - it is the port's own primary-key comparison,
    // standing in for the CFML `arrayFind` object-reference search at
    // [model/entity/PromotionApplied.cfc:L89].
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE, 'isSameRowAs'].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(19);
  });

  it('drops all six order-side bidirectional helpers', () => {
    const subject = aPromotionApplied();
    const members = prototypeMembers();

    for (const dropped of DROPPED_ORDER_SIDE_HELPERS) {
      expect(members).not.toContain(dropped);
      expect(dropped in subject).toBe(false);
    }

    expect(DROPPED_ORDER_SIDE_HELPERS).toHaveLength(6);
  });

  it('keeps exactly the two helpers whose far side is in scope', () => {
    const members = prototypeMembers();

    // [model/entity/PromotionApplied.cfc:L58] is the one foreign key with an in-scope far
    // side, and [model/entity/Promotion.cfc:L64] is the collection that makes the pair
    // resolvable rather than throwing.
    expect(members).toContain('setPromotion');
    expect(members).toContain('removePromotion');

    const helpers = members.filter(
      (name: string) => name.startsWith('set') || name.startsWith('remove'),
    );

    expect(helpers.sort()).toEqual([
      'removePromotion',
      'setAppliedType',
      'setDiscountAmount',
      'setPromotion',
    ]);
  });

  it('refuses a dropped helper at compile time as well as at run time', () => {
    const subject = aPromotionApplied();

    // Removing the dispatcher is what makes this a TYPE error rather than a runtime surprise:
    // in CFML the call would reach [org/Hibachi/HibachiEntity.cfc:L565] and throw only when
    // executed, whereas here it cannot be written at all.
    // @ts-expect-error PromotionApplied authors no setOrderItem: the far side is the out-of-scope OrderItem aggregate [model/entity/PromotionApplied.cfc:L97-L102].
    const absentHelper: unknown = subject.setOrderItem;

    expect(absentHelper).toBeUndefined();
  });

  it('authors no setter for a column nothing writes', () => {
    const subject = aPromotionApplied();
    const members = prototypeMembers();

    for (const unauthored of UNAUTHORED_SETTERS) {
      expect(members).not.toContain(unauthored);
      expect(unauthored in subject).toBe(false);
    }
  });

  it('invents no accessor for the component attributes that stayed documentation', () => {
    const members = prototypeMembers();

    // [model/entity/PromotionApplied.cfc:L49] carries `displayname`, `entityname`, `table`,
    // `cacheuse` and `hb_serviceName` as component metadata. Metadata is not behaviour, so it
    // is carried forward in comments on the members it governs and nowhere else.
    for (const invented of [
      'getTableName',
      'getEntityName',
      'getDisplayName',
      'getServiceName',
      'getCacheUse',
    ]) {
      expect(members).not.toContain(invented);
    }
  });

  it('names the legacy table verbatim and exposes no accessor for it', () => {
    // C5 schema continuity: the physical name is `SwPromotionApplied`, not a pluralised or
    // prefixed variant, and the entity name is `SlatwallPromotionApplied`
    // [model/entity/PromotionApplied.cfc:L49]. The table name belongs to the repository tier;
    // the entity neither knows nor reports it.
    expect(LEGACY_TABLE).toBe('SwPromotionApplied');
    expect(prototypeMembers()).not.toContain('getTableName');
  });

  it('carries no hb_permission-derived member, because the component declares none', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L49]: this component declares NO
    // `hb_permission` attribute at all - unusual in this codebase, where
    // [model/entity/PriceGroupRate.cfc:L49] carries the dotted
    // `hb_permission="priceGroup.priceGroupRates"` and [model/entity/PriceGroup.cfc:L49]
    // carries `hb_permission="this"`. The absence is recorded, and nothing is invented to
    // fill it: no permission constant, no authorisation hook, no `hb_*` accessor.
    const members = prototypeMembers();

    for (const invented of ['getPermission', 'getHibachiPermission', 'checkPermission']) {
      expect(members).not.toContain(invented);
    }
  });
});

describe('appliedType is a closed union of exactly the three values the engine writes', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L54, model/service/PromotionService.cfc:L402,
  // L448, L531]: the legacy column is an UNCONSTRAINED `ormtype="string"` - it carries no
  // `hb_formFieldType="select"` and the entity declares no options method, so the vocabulary is
  // not discoverable from the declaration at all. The target narrows it to a closed union
  // derived from the only three values the engine ever writes, independently confirmed by the
  // three reporting predicates at [model/report/PromotionUsageReport.cfc:L82, L84, L86]. That
  // narrowing is the one place this entity is more constrained than its source, and it is a
  // TYPE-LEVEL narrowing only: no runtime check is added, no value is rejected at run time, and
  // any string already in the column still round-trips through the repository unchanged.

  it('round-trips each of the three literals through the setter', () => {
    for (const appliedType of ENGINE_APPLIED_TYPES) {
      const subject = aPromotionApplied();

      subject.setAppliedType(appliedType);

      expect(subject.getAppliedType()).toBe(appliedType);
    }
  });

  it('round-trips each of the three literals through the constructor', () => {
    // The repository hydration path, as distinct from the engine's write path.
    for (const appliedType of ENGINE_APPLIED_TYPES) {
      expect(aPromotionApplied({ appliedType }).getAppliedType()).toBe(appliedType);
    }
  });

  it('admits exactly three values, and the union names all three', () => {
    expect(ENGINE_APPLIED_TYPES).toHaveLength(3);
    expect([...ENGINE_APPLIED_TYPES].sort()).toEqual(['order', 'orderFulfillment', 'orderItem']);
  });

  it('is exhaustive: a switch over the union needs no default branch', () => {
    // Exhaustiveness proved by construction rather than asserted in prose. `never` is only
    // assignable from an exhausted union, so if a fourth member were ever added upstream this
    // function would stop compiling - which is the whole point of closing the union.
    const describeType = (appliedType: PromotionAppliedType): string => {
      switch (appliedType) {
        case 'order':
          return LEGACY_FK_COLUMNS.order;
        case 'orderItem':
          return LEGACY_FK_COLUMNS.orderItem;
        case 'orderFulfillment':
          return LEGACY_FK_COLUMNS.orderFulfillment;
        default: {
          const unreachable: never = appliedType;
          return unreachable;
        }
      }
    };

    expect(ENGINE_APPLIED_TYPES.map(describeType)).toEqual([
      'orderID',
      'orderItemID',
      'orderfulfillmentID',
    ]);
  });

  it('rejects a fourth value, which is not representable without a cast', () => {
    const subject = aPromotionApplied();

    // The union is CLOSED, so this is the one deliberately-asserted type failure in the suite.
    // `'orderShipment'` is a plausible-looking fourth value and there is no such applied type:
    // the engine never writes one [model/service/PromotionService.cfc:L402, L448, L531] and the
    // reporting layer never reads one [model/report/PromotionUsageReport.cfc:L82, L84, L86].
    // @ts-expect-error 'orderShipment' is not a PromotionAppliedType: the union is closed over the only three values the engine writes.
    subject.setAppliedType('orderShipment');

    // The call still EXECUTES - the narrowing is a compile-time gate, not a runtime guard - so
    // the assertion below records what actually lands in the field rather than pretending the
    // assignment was refused. This is the honest shape of a type-only narrowing.
    expect(subject.getAppliedType()).toBe('orderShipment');
  });

  it('reports undefined for a NULL column, and never a sentinel string', () => {
    // A row read back before the engine has typed it. `''` and `'none'` would both be
    // inventions: [model/entity/PromotionApplied.cfc:L54] declares no default of any kind.
    const subject = aPromotionApplied();

    expect(subject.getAppliedType()).toBeUndefined();
    expect(subject.getAppliedType()).not.toBe('');
    expect(subject.getAppliedType()).not.toBe('order');
  });

  it('replaces the value in place on a second set, accumulating nothing', () => {
    const subject = aPromotionApplied({ appliedType: 'orderItem' });

    subject.setAppliedType('orderFulfillment');

    expect(subject.getAppliedType()).toBe('orderFulfillment');
  });

  it('offers no options method, because the property declares no select field type', () => {
    // Contrast [model/entity/PriceGroupRate.cfc:L55], where `amountType` carries
    // `hb_formFieldType="select"` and therefore does have an options surface. This column
    // carries none, so inventing one would add a vocabulary the source never published.
    expect(prototypeMembers()).not.toContain('getAppliedTypeOptions');
  });

  it('leaves the applied type independent of which foreign key is populated', () => {
    // A faithful absence rather than an oversight: nothing in
    // [model/entity/PromotionApplied.cfc] ties `appliedType` to the matching foreign key, and no
    // database constraint does either. The engine happens to keep them consistent because each
    // of its three blocks sets the pair together, but that consistency is the SERVICE's
    // invariant and this row does not enforce it. Inventing enforcement here would reject data
    // the legacy schema accepts.
    const subject = aPromotionApplied({ appliedType: 'order', orderItemID: 'oi-1' });

    expect(subject.getAppliedType()).toBe('order');
    expect(subject.getOrderItemID()).toBe('oi-1');
    expect(subject.getOrderID()).toBeUndefined();
  });
});

describe('discountAmount is Money or undefined, and absence is never zero', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L53]: one of exactly four no-default money
  // columns in the slice (with SkuCurrency.price L53, PriceGroupRate.amount L54,
  // PromotionReward.amount L61). Contrast Sku.listPrice/price/renewalPrice L55-L57, which all
  // declare default="0". The ORM schema itself encodes the asymmetry; substituting 0 for a
  // missing discount would silently alter money.
  //
  // All four sibling locators above were re-verified against source rather than carried over
  // from a summary. One further asymmetry: this column also carries NO `hb_formatType`, where
  // all four of those siblings do - `"currency"` on the two SkuCurrency-family columns and
  // `"custom"` on the two amount columns - which is why no formatted accessor is authored.

  it('reports undefined when the column was NULL', () => {
    expect(aPromotionApplied().getDiscountAmount()).toBeUndefined();
  });

  it('is neither Money.zero nor a zero string when absent', () => {
    // The highest-consequence assertion in the suite, stated three ways so no substitution can
    // pass unnoticed. `Money.zero` exists to seed the engine's accumulators
    // [model/service/PromotionService.cfc:L988-L989] and is explicitly prohibited as a fallback
    // for an absent amount.
    const absent = aPromotionApplied().getDiscountAmount();

    expect(absent).toBeUndefined();
    expect(absent).not.toBe(Money.zero);
    expect(absent).not.toBe('0');
    expect(absent).not.toBe(0);
  });

  it('distinguishes a real zero discount from a missing discount', () => {
    // Both rows are legitimate. A zero discount is a promotion that qualified and computed to
    // nothing; a missing discount is a row whose amount was never written. They are different
    // facts, they must not collapse into one, and only one of them is a `Money`.
    const zeroDiscount = aPromotionApplied({ discountAmount: Money.fromDecimalString('0') });
    const missingDiscount = aPromotionApplied();

    const zero = zeroDiscount.getDiscountAmount();

    expect(zero).toBeDefined();
    expect(zero?.toFixed2()).toBe('0.00');
    expect(zero?.equals('0')).toBe(true);

    expect(missingDiscount.getDiscountAmount()).toBeUndefined();
    expect(missingDiscount.getDiscountAmount()).not.toBe(zero);
  });

  it('treats a zero written as 0.00 as the same value as a zero written as 0', () => {
    // Scale is not identity for a decimal: `'0.00'` and `'0'` are the same amount, and the value
    // object says so. This matters because a `big_decimal` column can hand back either.
    const padded = Money.fromDecimalString('0.00');

    expect(aPromotionApplied({ discountAmount: padded }).getDiscountAmount()?.equals('0')).toBe(
      true,
    );
    expect(padded.toFixed2()).toBe('0.00');
  });

  it('round-trips an arbitrary-precision amount unchanged', () => {
    // Proof that nothing coerces the amount through a JavaScript number on the way in or out:
    // seventeen significant decimal places survive intact, which they could not do through an
    // IEEE-754 double. This is what `precisionEvaluate`
    // [model/service/PromotionService.cfc:L990, L995, L1001, L1007] protected in the source.
    const highPrecision = Money.fromDecimalString('12.34567890123456789');
    const subject = aPromotionApplied({ discountAmount: highPrecision });

    expect(subject.getDiscountAmount()?.toDecimalString()).toBe('12.34567890123456789');
    expect(subject.getDiscountAmount()).toBe(highPrecision);
  });

  it('hands back the very instance it was given, computing nothing', () => {
    // A pure carrier. `Money` is immutable and frozen by construction, so identity is the
    // strongest available statement that no arithmetic, rounding or reformatting happened here.
    const amount = Money.fromDecimalString('19.99');
    const subject = aPromotionApplied({ discountAmount: amount });

    expect(subject.getDiscountAmount()).toBe(amount);
    expect(subject.getDiscountAmount()?.toDecimalString()).toBe('19.99');
  });

  it('updates in place, mirroring the engine greater-discount replacement', () => {
    // CFML parity [model/service/PromotionService.cfc:L389, L435]: when a fulfillment or an order
    // already carries an applied promotion FROM THE SAME PROMOTION and a larger discount is
    // found, the engine does not build a second row - it calls
    // `getAppliedPromotions()[1].setDiscountAmount(discountAmount)` on the existing one. That is
    // the only reason `discountAmount` is mutable while every other hydrated column is readonly.
    const original = Money.fromDecimalString('5.00');
    const larger = Money.fromDecimalString('7.50');
    const subject = aPromotionApplied({
      promotionAppliedID: 'pa-1',
      appliedType: 'order',
      discountAmount: original,
    });

    subject.setDiscountAmount(larger);

    expect(subject.getDiscountAmount()).toBe(larger);
    expect(subject.getDiscountAmount()?.toFixed2()).toBe('7.50');
    expect(larger.isGreaterThan(original)).toBe(true);
  });

  it('accepts a negative amount, because the carrier constrains no sign', () => {
    // No negative discount is produced TODAY: the only path that would create one is the return
    // and exchange branch [model/service/PromotionService.cfc:L542-L544], which is an empty block
    // carrying the legacy `TODO [issue #1766]` and does nothing. The TODO is carried forward as a
    // TODO by the service tier and is NOT completed here. What this row can be asked to do,
    // though, is carry whatever the column holds - and `big_decimal` is signed
    // [model/entity/PromotionApplied.cfc:L53], so a sign check would be an invention.
    const credit = Money.fromDecimalString('-2.50');

    expect(aPromotionApplied({ discountAmount: credit }).getDiscountAmount()?.toFixed2()).toBe(
      '-2.50',
    );
  });

  it('exposes no formatted accessor, because the column carries no hb_formatType', () => {
    // Contrast [model/entity/PriceGroupRate.cfc:L54] and [model/entity/PromotionReward.cfc:L61],
    // which each carry `hb_formatType="custom"` and do have a formatted surface. Presentation is
    // `Money.toFixed2()`'s business, and it is the caller's choice to apply it.
    expect(prototypeMembers()).not.toContain('getDiscountAmountFormatted');
    expect(prototypeMembers()).not.toContain('getFormattedDiscountAmount');
  });
});

describe('currencyCode is the three-character authority, and the engine never sets it', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L55]: this is the in-scope 3-character
  // authority. SkuCurrency.cfc:L68 carries NO ormtype and NO length -- any claim of length="3"
  // there is false.
  //
  // Re-verified rather than repeated: [model/entity/SkuCurrency.cfc:L68] reads
  // `property name="currencyCode" insert="false" update="false";` and nothing else, so it is a
  // read-only projection of the `currencyCode` foreign key declared at
  // [model/entity/SkuCurrency.cfc:L58] and carries no width at all. The only in-scope property
  // that DECLARES `ormtype="string" length="3"` is this one.

  it('is undefined on a freshly-built engine row, because the engine never writes it', () => {
    // CFML parity [model/service/PromotionService.cfc:L400-L406, L446-L452, L529-L535]: all three
    // construction blocks set exactly four things - the applied type, the promotion, one
    // order-side foreign key and the discount amount. A case-insensitive sweep of the whole of
    // that file for `setCurrencyCode` returns ZERO hits, so an engine-built row leaves this
    // column NULL by construction, not by accident. The port authors no setter at all, which
    // makes the omission structural rather than a habit a future caller could break.
    const engineBuiltRow = aPromotionApplied({
      appliedType: 'orderItem',
      orderItemID: 'oi-1',
      discountAmount: Money.fromDecimalString('3.25'),
    });

    expect(engineBuiltRow.getCurrencyCode()).toBeUndefined();
    expect(prototypeMembers()).not.toContain('setCurrencyCode');
  });

  it('is undefined rather than an empty string when the column was NULL', () => {
    // `''` would be a three-way lie: it is not a currency, it is not three characters, and it
    // would satisfy a naive truthiness test on the way to a conversion.
    const absent = aPromotionApplied().getCurrencyCode();

    expect(absent).toBeUndefined();
    expect(absent).not.toBe('');
    expect(absent).not.toBe('USD');
  });

  it('round-trips a branded code verbatim when a repository supplies one', () => {
    // The hydration path. A repository that reads the column brands it through the value
    // object's own validator, and the row carries the result unchanged.
    const currencyCode: CurrencyCode = toCurrencyCode('EUR');

    expect(aPromotionApplied({ currencyCode }).getCurrencyCode()).toBe('EUR');
    expect(aPromotionApplied({ currencyCode }).getCurrencyCode()).toBe(currencyCode);
  });

  it('preserves casing exactly, folding nothing', () => {
    // [src/domain/valueObjects/currencyCode.ts:L416] validates LENGTH ONLY - no trimming and no
    // case folding - so a lowercase column value stays lowercase all the way through. CFML would
    // have compared it case-insensitively with `eq`; the port keeps the stored bytes intact and
    // leaves case-insensitive comparison to the value object's own equality helper rather than
    // silently normalising at the entity boundary.
    const lowercase: CurrencyCode = toCurrencyCode('usd');

    expect(aPromotionApplied({ currencyCode: lowercase }).getCurrencyCode()).toBe('usd');
    expect(aPromotionApplied({ currencyCode: lowercase }).getCurrencyCode()).not.toBe('USD');
  });

  it('carries a code of exactly the declared width', () => {
    // The `length="3"` declaration made executable. The brander this column's type comes from
    // refuses anything else, which is what lets the entity treat the width as an invariant
    // rather than re-checking it on every read.
    expect(toCurrencyCode('GBP')).toHaveLength(3);
    expect(() => toCurrencyCode('EURO')).toThrow();
    expect(() => toCurrencyCode('EU')).toThrow();
    expect(() => toCurrencyCode('')).toThrow();
  });

  it('is read-only on the row: the repository supplies it and nothing re-points it', () => {
    const subject = aPromotionApplied({ currencyCode: toCurrencyCode('CAD') });

    // @ts-expect-error PromotionApplied authors no setCurrencyCode: the engine never writes the column [model/service/PromotionService.cfc:L400-L406, L446-L452, L529-L535].
    const absentSetter: unknown = subject.setCurrencyCode;

    expect(absentSetter).toBeUndefined();
    expect(subject.getCurrencyCode()).toBe('CAD');
  });
});

describe('the three order-side foreign keys are opaque identifiers with getters only', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L59-L61]: `orderItem`, `orderFulfillment` and
  // `order` are `many-to-one` associations onto `OrderItem`, `OrderFulfillment` and `Order`, every
  // one of which is EXPLICITLY OUT OF SCOPE along with the whole order, checkout, cart, payment,
  // shipping and fulfillment pipeline. The port reduces all three to opaque `string | undefined`
  // identifiers with getters only. No setter is invented, no order-side entity is constructed, and
  // no persistence or order-service behaviour is added. This is the anti-corruption boundary doing
  // its job at the entity level: the out-of-scope aggregate becomes an INPUT, never a dependency.

  it('returns opaque strings for all three, constructing no out-of-scope entity', () => {
    const subject = aPromotionApplied({
      orderItemID: 'oi-7',
      orderFulfillmentID: 'of-7',
      orderID: 'o-7',
    });

    expect(subject.getOrderItemID()).toBe('oi-7');
    expect(subject.getOrderFulfillmentID()).toBe('of-7');
    expect(subject.getOrderID()).toBe('o-7');

    // Opaque means opaque: strings, not objects, and nothing to traverse into.
    expect(typeof subject.getOrderItemID()).toBe('string');
    expect(typeof subject.getOrderFulfillmentID()).toBe('string');
    expect(typeof subject.getOrderID()).toBe('string');
  });

  it('returns undefined for each key the row does not carry', () => {
    // The ordinary case. Each engine block populates exactly ONE of the three
    // [model/service/PromotionService.cfc:L404, L450, L533], so two are always NULL on a
    // freshly-built row and `undefined` is the only honest answer for them.
    const itemLevel = aPromotionApplied({ appliedType: 'orderItem', orderItemID: 'oi-1' });

    expect(itemLevel.getOrderItemID()).toBe('oi-1');
    expect(itemLevel.getOrderFulfillmentID()).toBeUndefined();
    expect(itemLevel.getOrderID()).toBeUndefined();
  });

  it('exposes no hydrated accessor for any out-of-scope association', () => {
    const subject = aPromotionApplied({ orderItemID: 'oi-1' });
    const members = prototypeMembers();

    // `getOrderItem()` returning an `OrderItem` would drag the aggregate in. Only the identifier
    // crosses the boundary. Note that `getOrderID` IS authored while `getOrder` is not - the
    // distinction is exactly the boundary.
    for (const hydrated of ['getOrderItem', 'getOrderFulfillment', 'getOrder']) {
      expect(members).not.toContain(hydrated);
      expect(hydrated in subject).toBe(false);
    }

    expect(members).toContain('getOrderItemID');
    expect(members).toContain('getOrderFulfillmentID');
    expect(members).toContain('getOrderID');
  });

  it('keeps the lowercase-f orderfulfillmentID column spelling distinct from the accessor', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L60]: the fkcolumn is spelled
    // `orderfulfillmentID` with a LOWERCASE f, unlike orderItemID (L59) and orderID (L61).
    // Preserved verbatim as a schema contract; annotated, not normalised.
    //
    // The accessor is camel-cased from the PROPERTY name `orderFulfillment`, so the two names
    // legitimately differ. Both halves are pinned: normalising the column would break the schema
    // contract, and renaming the accessor would break interface parity.
    expect(LEGACY_FK_COLUMNS.orderFulfillment).toBe('orderfulfillmentID');
    expect(LEGACY_FK_COLUMNS.orderFulfillment).not.toBe('orderFulfillmentID');
    expect(prototypeMembers()).toContain('getOrderFulfillmentID');

    // The other three columns capitalise consistently, which is what makes L60 the outlier
    // rather than the convention.
    expect(LEGACY_FK_COLUMNS.orderItem).toBe('orderItemID');
    expect(LEGACY_FK_COLUMNS.order).toBe('orderID');
    expect(LEGACY_FK_COLUMNS.promotion).toBe('promotionID');
  });

  it('records the hb_cascadeCalculate asymmetry without shipping a calculated property', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L59]: `orderItem` alone carries
    // `hb_cascadeCalculate="true"`, and the other three associations [L58, L60, L61] do not. The
    // hint told the framework to cascade recalculation of `calculated*` properties across that
    // association - and this component declares NO calculated property anywhere in L52-L70, so
    // the hint is INERT here. It is recorded because the attribute is real and asymmetric; no
    // calculation surface is invented to give it something to do.
    const subject = aPromotionApplied({ orderItemID: 'oi-1' });
    const members = prototypeMembers();

    for (const invented of [
      'getCalculatedDiscountAmount',
      'cascadeCalculate',
      'updateCalculatedProperties',
    ]) {
      expect(members).not.toContain(invented);
      expect(invented in subject).toBe(false);
    }
  });

  it('holds all three identifiers at once, because the row enforces no exclusivity', () => {
    // Faithful, and deliberately so. Nothing in [model/entity/PromotionApplied.cfc] and no
    // database constraint restricts a row to a single order-side key; the engine simply never
    // writes more than one. Rejecting a row that carries several would refuse data the legacy
    // schema accepts, which is a behaviour change dressed as a validation improvement.
    const subject = aPromotionApplied({
      appliedType: 'order',
      orderItemID: 'oi-1',
      orderFulfillmentID: 'of-1',
      orderID: 'o-1',
    });

    expect(subject.getOrderItemID()).toBe('oi-1');
    expect(subject.getOrderFulfillmentID()).toBe('of-1');
    expect(subject.getOrderID()).toBe('o-1');
  });

  it('treats the identifiers as opaque, normalising and interpreting nothing', () => {
    // A 32-character hex UUID is what the schema actually stores
    // [model/entity/PromotionApplied.cfc:L52 declares the same width for the primary key], but the
    // port parses none of it. An identifier that is not a UUID still round-trips, because the
    // boundary's whole promise is that the shape of an out-of-scope key is not this layer's
    // business.
    const uuidLike = 'ffffffffffffffffffffffffffffffff';
    const notUuidLike = 'legacy-import-42';

    expect(aPromotionApplied({ orderID: uuidLike }).getOrderID()).toBe(uuidLike);
    expect(aPromotionApplied({ orderID: notUuidLike }).getOrderID()).toBe(notUuidLike);
    expect(aPromotionApplied({ orderID: '  padded  ' }).getOrderID()).toBe('  padded  ');
  });
});

describe('setPromotion is guarded, functional, and polarised on THIS row', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L79-L84]:
  //
  //   variables.promotion = arguments.promotion;
  //   if(isNew() or !arguments.promotion.hasAppliedPromotion( this )) {
  //       arrayAppend(arguments.promotion.getAppliedPromotions(), this);
  //   }
  //
  // THIS IS CORRECT CODE AND IS NOT A DEFECT. Both `setPromotion` and `setOrderItem`
  // [model/entity/PromotionApplied.cfc:L97-L102] - and the other six helpers with them - are
  // guarded and functional. The contrast is explicit and worth naming: `PromotionAccount.setPromotion`
  // is genuinely broken because [model/entity/Promotion.cfc] declares no `promotionAccounts`
  // collection for its containment probe to resolve against, and the four `PromotionPeriod`
  // helpers throw for the same class of reason. Here the far side really does declare the
  // collection - `appliedPromotions` at [model/entity/Promotion.cfc:L64], with the explicit
  // `addAppliedPromotion`/`removeAppliedPromotion` pair at [L157-L164] around it - so this pair
  // resolves and works.
  //
  // THE GUARD POLARITY IS LOAD-BEARING, AND IT IS THE OPPOSITE OF `PriceGroupRate.setPriceGroup`.
  // `isNew()` at [model/entity/PromotionApplied.cfc:L81] is called on `this` - the
  // `PromotionApplied` BEING ATTACHED - and never on the promotion. So the short-circuit is
  // decided by the NEAR side's newness, and for an unsaved row the containment probe is never
  // consulted at all. A "harmonisation" that swapped the subject of `isNew()` would change which
  // rows get appended twice, so the polarity is pinned in both directions below.

  it('assigns the near-side reference and appends to the far-side collection', () => {
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);

    expect(subject.getPromotion()).toBe(promotion);
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(promotion.getAppliedPromotions()[0]).toBe(subject);
  });

  it('appends to the very array the far side hands out, never to a copy', () => {
    // [model/entity/Promotion.cfc:L64] is mutated in place by `arrayAppend`
    // [model/entity/PromotionApplied.cfc:L82], and `Promotion.isDeletable()`
    // [model/entity/Promotion.cfc:L170-L171] reads that same collection's length, so a defensive
    // copy here would silently make a promotion look deletable while applications still exist.
    const promotion = aPromotion('p-1');
    const collectionBefore = promotion.getAppliedPromotions();
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);

    expect(promotion.getAppliedPromotions()).toBe(collectionBefore);
    expect(collectionBefore).toHaveLength(1);
    expect(collectionBefore[0]).toBe(subject);
  });

  it('does not append twice for a saved row already present in the collection', () => {
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.setPromotion(promotion);

    expect(promotion.getAppliedPromotions()).toHaveLength(1);
  });

  it('recognises presence by primary key, not by object identity', () => {
    // Two hydrations of the SAME persisted row. CFML `arrayFind`
    // [model/entity/PromotionApplied.cfc:L89] compared object references, which the ORM's identity
    // map made safe because one row produced one object per session. A driver-only stack has no
    // identity map, so the port compares the primary key instead - and that is what keeps a
    // re-read row from being appended a second time.
    const promotion = aPromotion('p-1');
    const firstHydration = aPromotionApplied({ promotionAppliedID: 'pa-1' });
    const secondHydration = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    firstHydration.setPromotion(promotion);
    secondHydration.setPromotion(promotion);

    expect(firstHydration).not.toBe(secondHydration);
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(promotion.getAppliedPromotions()[0]).toBe(firstHydration);
  });

  it('short-circuits the containment probe entirely for an unsaved row', () => {
    // THE GUARD-POLARITY TEST. `isNew()` is true, so `||` short-circuits and
    // `hasAppliedPromotion` is never reached - which is why calling it twice yields TWO entries.
    // The spy proves the probe was not merely satisfied but never asked, and a future change that
    // reversed the polarity would fail on the call count before it failed on the length.
    const promotion = aPromotion('p-1');
    const probe = vi.spyOn(promotion, 'hasAppliedPromotion');
    const unsavedRow = aPromotionApplied();

    expect(unsavedRow.isNew()).toBe(true);

    unsavedRow.setPromotion(promotion);
    unsavedRow.setPromotion(promotion);

    expect(probe).not.toHaveBeenCalled();
    expect(promotion.getAppliedPromotions()).toHaveLength(2);
    expect(promotion.getAppliedPromotions()[0]).toBe(unsavedRow);
    expect(promotion.getAppliedPromotions()[1]).toBe(unsavedRow);
  });

  it('consults the containment probe for a saved row, once per call', () => {
    // The other arm of the same guard. `isNew()` is false, so the probe decides.
    const promotion = aPromotion('p-1');
    const probe = vi.spyOn(promotion, 'hasAppliedPromotion');
    const savedRow = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    expect(savedRow.isNew()).toBe(false);

    savedRow.setPromotion(promotion);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(savedRow);
    expect(promotion.getAppliedPromotions()).toHaveLength(1);

    savedRow.setPromotion(promotion);

    expect(probe).toHaveBeenCalledTimes(2);
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
  });

  it('tests the newness of the row being attached, not of the promotion', () => {
    // The polarity stated as directly as it can be: an UNSAVED promotion holding a SAVED row is
    // the case that separates the two readings. `isNew()` on the near side is false, so the probe
    // runs and the duplicate is refused - whereas a far-side reading of the guard would have seen
    // a new promotion and appended twice.
    const unsavedPromotion = aPromotion('');
    const savedRow = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    savedRow.setPromotion(unsavedPromotion);
    savedRow.setPromotion(unsavedPromotion);

    expect(unsavedPromotion.getAppliedPromotions()).toHaveLength(1);
  });

  it('re-points the near side on a second set without unlinking the first promotion', () => {
    // Faithful to [model/entity/PromotionApplied.cfc:L79-L84], which contains NO removal: the
    // legacy `setPromotion` overwrites `variables.promotion` and appends to the new far side,
    // leaving the previous collection holding a row that no longer points back. The engine never
    // hits this because it calls `removeOrder`/`removeOrderFulfillment` first when swapping
    // promotions [model/service/PromotionService.cfc:L393, L439]. Repairing it here would be a
    // behaviour change in an entity the promotion engine writes through, so it is reproduced.
    const first = aPromotion('p-1');
    const second = aPromotion('p-2');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(first);
    subject.setPromotion(second);

    expect(subject.getPromotion()).toBe(second);
    expect(second.getAppliedPromotions()).toHaveLength(1);
    expect(first.getAppliedPromotions()).toHaveLength(1);
    expect(first.getAppliedPromotions()[0]).toBe(subject);
  });

  it('is reachable through the far side delegation helper', () => {
    // [model/entity/Promotion.cfc:L157-L164] declares the explicit pair around the collection, and
    // `addAppliedPromotion` is pure delegation - `arguments.promotionApplied.setPromotion(this)`.
    // Driving the bidirectional link from the parent must land in exactly the same place as
    // driving it from the child.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    promotion.addAppliedPromotion(subject);

    expect(subject.getPromotion()).toBe(promotion);
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(promotion.getAppliedPromotions()[0]).toBe(subject);
  });
});

describe('removePromotion deletes by index and clears the near side unconditionally', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L85-L94]:
  //
  //   if(!structKeyExists(arguments, "promotion")) { arguments.promotion = variables.promotion; }
  //   var index = arrayFind(arguments.promotion.getAppliedPromotions(), this);
  //   if(index > 0) { arrayDeleteAt(arguments.promotion.getAppliedPromotions(), index); }
  //   structDelete(variables, "promotion");
  //
  // Three properties matter and all three are pinned below: the argument DEFAULTS FROM THE FIELD
  // when omitted, the deletion is BY INDEX after a find, and the `structDelete` sits OUTSIDE the
  // `if` so the near side is cleared whether or not the far side held the row.

  it('removes the row from the live far-side collection and clears the near side', () => {
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion(promotion);

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('removes a first-element match, which a mistranslated one-based guard would skip', () => {
    // CFML `arrayFind` is ONE-based and the guard is `if(index > 0)`
    // [model/entity/PromotionApplied.cfc:L90]. A JavaScript `findIndex` is ZERO-based, so
    // carrying `> 0` across unchanged would silently refuse to remove the FIRST element - and the
    // first element is exactly the one the engine reaches for, at
    // `getAppliedPromotions()[1]` [model/service/PromotionService.cfc:L393, L439]. This test is
    // here to fail if that mistranslation is ever introduced.
    const promotion = aPromotion('p-1');
    const firstRow = aPromotionApplied({ promotionAppliedID: 'pa-1' });
    const secondRow = aPromotionApplied({ promotionAppliedID: 'pa-2' });

    firstRow.setPromotion(promotion);
    secondRow.setPromotion(promotion);
    expect(promotion.getAppliedPromotions()[0]).toBe(firstRow);

    firstRow.removePromotion(promotion);

    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(promotion.getAppliedPromotions()[0]).toBe(secondRow);
  });

  it('clears the near side even when the far side never held the row', () => {
    // The unconditional `structDelete` at [model/entity/PromotionApplied.cfc:L93] is OUTSIDE the
    // index guard, so a miss still unlinks. Moving it inside the guard would leave a stale
    // reference behind, which is why the miss case is asserted rather than assumed harmless.
    const holder = aPromotion('p-1');
    const stranger = aPromotion('p-2');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(holder);
    expect(holder.getAppliedPromotions()).toHaveLength(1);

    subject.removePromotion(stranger);

    expect(subject.getPromotion()).toBeUndefined();
    expect(stranger.getAppliedPromotions()).toHaveLength(0);
    expect(holder.getAppliedPromotions()).toHaveLength(1);
    expect(holder.getAppliedPromotions()[0]).toBe(subject);
  });

  it('falls back to the currently assigned promotion when the argument is omitted', () => {
    // This is REAL production usage, not a theoretical branch: the engine calls the no-argument
    // form at [model/service/PromotionService.cfc:L393] `removeOrderFulfillment()` and
    // [model/service/PromotionService.cfc:L439] `removeOrder()` when it swaps one promotion's
    // discount for a larger one from a different promotion.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion();

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('treats an explicitly passed undefined exactly as an omitted argument', () => {
    // The CFML idiom is `structKeyExists(arguments, "promotion")`
    // [model/entity/PromotionApplied.cfc:L86], which tests PRESENCE. The port's parameter type
    // admits only `Promotion | undefined`, so "absent" and "undefined" are the same condition here
    // and both take the default-from-field path. Nothing else can be passed, so no third case
    // exists to distinguish.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion(undefined);

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('throws when no argument is supplied and no promotion is set', () => {
    // Faithful reproduction of a legacy runtime failure, not a finding of this suite. CFML
    // defaults the omitted argument from `variables.promotion`
    // [model/entity/PromotionApplied.cfc:L86-L88] and then dereferences it at L89
    // (`arguments.promotion.getAppliedPromotions()`), so a row holding no promotion fails there
    // too. The shipped module is where that behaviour is classified and annotated; this suite pins
    // the outcome and adds no classification of its own, because the eight legacy helpers are
    // sound code.
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    expect(subject.getPromotion()).toBeUndefined();
    expect(() => subject.removePromotion()).toThrow(/removePromotion/);
  });

  it('throws again after a successful removal, because the near side is now clear', () => {
    // The direct consequence of the unconditional clear. Once unlinked there is nothing left to
    // default from, so a second no-argument call reaches the same failure.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion();

    expect(() => subject.removePromotion()).toThrow();
  });

  it('is a no-op on the far side when called twice with the same promotion', () => {
    // The explicit-argument form has nothing to default from, so it stays safe after the row is
    // already unlinked, and the second find simply misses.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion(promotion);
    subject.removePromotion(promotion);

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('removes only the matching row and preserves the order of the rest', () => {
    const promotion = aPromotion('p-1');
    const first = aPromotionApplied({ promotionAppliedID: 'pa-1' });
    const second = aPromotionApplied({ promotionAppliedID: 'pa-2' });
    const third = aPromotionApplied({ promotionAppliedID: 'pa-3' });

    first.setPromotion(promotion);
    second.setPromotion(promotion);
    third.setPromotion(promotion);

    second.removePromotion(promotion);

    expect(promotion.getAppliedPromotions()).toHaveLength(2);
    expect(promotion.getAppliedPromotions()[0]).toBe(first);
    expect(promotion.getAppliedPromotions()[1]).toBe(third);
    expect(first.getPromotion()).toBe(promotion);
    expect(third.getPromotion()).toBe(promotion);
  });

  it('removes the correct instance when two unsaved rows share the empty key', () => {
    // The reference-identity fallback. Both rows have `promotionAppliedID === ''`, so a
    // primary-key comparison alone would conflate them and remove whichever came first. Matching
    // on identity for unsaved rows is what keeps them distinct - and unsaved rows are exactly what
    // the engine produces, since `newPromotionApplied()` has not been saved when
    // `setPromotion` runs [model/service/PromotionService.cfc:L401-L403].
    //
    // JUDGMENT CALL: every assertion in this test compares by IDENTITY (`toBe`) and never by deep
    // equality (`toEqual`), and that is not a style preference - it is the only thing that makes
    // the test discriminating. The two rows are STRUCTURALLY INDISTINGUISHABLE, which the guard
    // immediately below proves, so a deep-equality assertion would pass even if the wrong row had
    // been removed. Membership itself is compared by primary key with an identity fallback; the
    // assertions here have to be at least as precise as the behaviour they judge.
    const promotion = aPromotion('p-1');
    const firstUnsaved = aPromotionApplied();
    const secondUnsaved = aPromotionApplied();

    expect(firstUnsaved).not.toBe(secondUnsaved);
    expect(firstUnsaved).toEqual(secondUnsaved);
    expect(firstUnsaved.getPromotionAppliedID()).toBe(secondUnsaved.getPromotionAppliedID());

    firstUnsaved.setPromotion(promotion);
    secondUnsaved.setPromotion(promotion);

    const collection = promotion.getAppliedPromotions();

    expect(collection).toHaveLength(2);
    expect(collection[0]).toBe(firstUnsaved);
    expect(collection[1]).toBe(secondUnsaved);

    firstUnsaved.removePromotion(promotion);

    expect(collection).toHaveLength(1);
    expect(collection[0]).toBe(secondUnsaved);
    expect(collection[0]).not.toBe(firstUnsaved);
    expect(secondUnsaved.getPromotion()).toBe(promotion);
    expect(firstUnsaved.getPromotion()).toBeUndefined();
  });

  it('is reachable through the far side delegation helper', () => {
    // [model/entity/Promotion.cfc:L162-L164] delegates straight back:
    // `arguments.promotionApplied.removePromotion(this)`.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    promotion.addAppliedPromotion(subject);
    promotion.removeAppliedPromotion(subject);

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });
});

describe('the structural facts the row carries', () => {
  it('is new when the primary key is the empty string', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L52]: `unsavedvalue="" default=""` is what
    // makes the empty string LOAD-BEARING rather than incidental, and the framework chain resolved
    // to exactly this test - `isNew()` returns `getNewFlag()`, which is
    // `getPrimaryIDValue() == ""` [org/Hibachi/HibachiEntity.cfc:L571-L576].
    //
    // This is the one assertion in the suite with a shape borrowed from the legacy tier: it is the
    // `isNew()` half of `defaults_are_correct` [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67].
    // It is authored NET-NEW all the same - that base class was extended only by the Brand and
    // Product suites, neither of which touches this entity - so the shape is a pattern followed,
    // never coverage carried forward.
    expect(aPromotionApplied().isNew()).toBe(true);
    expect(aPromotionApplied({ promotionAppliedID: '' }).isNew()).toBe(true);
  });

  it('is not new once a key is present', () => {
    expect(aPromotionApplied({ promotionAppliedID: 'pa-1' }).isNew()).toBe(false);
  });

  it('reports the primary key verbatim, normalising nothing', () => {
    // A 32-character identifier is what `ormtype="string" length="32" generator="uuid"`
    // [model/entity/PromotionApplied.cfc:L52] produces, and the accessor is a pure read.
    const generated = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

    expect(aPromotionApplied({ promotionAppliedID: generated }).getPromotionAppliedID()).toBe(
      generated,
    );
    expect(aPromotionApplied().getPromotionAppliedID()).toBe('');
  });

  it('reports the primary key as a string, never undefined', () => {
    // The one non-nullable column on the row. `''` is a value, not an absence, which is precisely
    // what lets `isNew()` be honest instead of guessing.
    const key = aPromotionApplied().getPromotionAppliedID();

    expect(typeof key).toBe('string');
    expect(key).not.toBeUndefined();
  });

  it('declares remoteID, which the engine nonetheless never writes', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L64]: `property name="remoteID"
    // ormtype="string";` IS declared here - unlike [model/entity/RoundingRule.cfc], which declares
    // none - so the column is real and must round-trip. A case-insensitive sweep of
    // [model/service/PromotionService.cfc] for `setRemoteID` returns ZERO hits, so it stays NULL on
    // an engine-built row and is populated only by an external integration through a repository.
    expect(prototypeMembers()).toContain('getRemoteID');
    expect(aPromotionApplied().getRemoteID()).toBeUndefined();
    expect(aPromotionApplied({ remoteID: 'ext-9001' }).getRemoteID()).toBe('ext-9001');
  });

  it('reports audit timestamps as Date or undefined, never an epoch and never zero', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L67, L69]: both are
    // `hb_populateEnabled="false" ormtype="timestamp"`, so nothing user-supplied ever sets them and
    // an unsaved row genuinely has neither. `new Date(0)` would be a silent lie about January 1970
    // and `0` would not even be a date, so both are asserted against.
    //
    // The two literals below are explicit UTC ISO-8601 strings. This entity compares no date
    // anywhere, so the UTC policy has no branch here - the columns are carried, not interpreted.
    const created = new Date('2024-06-01T00:00:00.000Z');
    const modified = new Date('2024-06-02T12:30:45.000Z');

    const unsaved = aPromotionApplied();

    expect(unsaved.getCreatedDateTime()).toBeUndefined();
    expect(unsaved.getModifiedDateTime()).toBeUndefined();
    expect(unsaved.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(unsaved.getModifiedDateTime()).not.toEqual(new Date(0));

    const audited = aPromotionApplied({
      promotionAppliedID: 'pa-1',
      createdDateTime: created,
      modifiedDateTime: modified,
    });

    expect(audited.getCreatedDateTime()).toBe(created);
    expect(audited.getModifiedDateTime()).toBe(modified);
    expect(audited.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(audited.getModifiedDateTime()?.toISOString()).toBe('2024-06-02T12:30:45.000Z');
  });

  it('reduces the two audit account associations to opaque identifiers', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L68, L70]: `createdByAccount` and
    // `modifiedByAccount` are `many-to-one` onto `Account`, which is out of scope along with the
    // whole account module. Only the identifier crosses, exactly as with the three order-side keys,
    // and no `Account` is ever constructed.
    const members = prototypeMembers();

    expect(members).toContain('getCreatedByAccountID');
    expect(members).toContain('getModifiedByAccountID');
    expect(members).not.toContain('getCreatedByAccount');
    expect(members).not.toContain('getModifiedByAccount');

    const subject = aPromotionApplied({
      createdByAccountID: 'acct-1',
      modifiedByAccountID: 'acct-2',
    });

    expect(subject.getCreatedByAccountID()).toBe('acct-1');
    expect(subject.getModifiedByAccountID()).toBe('acct-2');
    expect(aPromotionApplied().getCreatedByAccountID()).toBeUndefined();
    expect(aPromotionApplied().getModifiedByAccountID()).toBeUndefined();
  });

  it('hydrates the one in-scope association and projects its key alongside', () => {
    // `promotion` [model/entity/PromotionApplied.cfc:L58] is the sole association with an in-scope
    // far side, so it is the sole one carried as an OBJECT. The `promotionID` projection exists
    // beside it because a repository can know the foreign key without having fetched the parent -
    // which is the explicit, documented alternative to simulating Hibernate lazy loading.
    const promotion = aPromotion('p-1');
    const hydrated = aPromotionApplied({ promotion, promotionID: 'p-1' });

    expect(hydrated.getPromotion()).toBe(promotion);
    expect(hydrated.getPromotionID()).toBe('p-1');

    const keyOnly = aPromotionApplied({ promotionID: 'p-2' });

    expect(keyOnly.getPromotion()).toBeUndefined();
    expect(keyOnly.getPromotionID()).toBe('p-2');
  });

  it('exposes none of the framework members the legacy dispatcher supplied', () => {
    const subject = aPromotionApplied();
    const members = prototypeMembers();

    for (const unported of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(unported);
      expect(unported in subject).toBe(false);
    }
  });

  it('has no dynamic dispatch, so an unknown accessor cannot even be written', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L507-L565]: the legacy `onMissingMethod`
    // dispatcher matched eleven method-name patterns and then THREW AT L565 -
    // `'You have called a method #arguments.missingMethodName#() which does not exists ...'`. Its
    // one remaining fallback, the attribute lookup at [L559], guards on
    // `hasProperty("attributeValues")`, and [model/entity/PromotionApplied.cfc:L52-L70] declares no
    // `attributeValues` collection, so on THIS component every unmatched `getX()` reached the
    // throw directly.
    //
    // The port reproduces none of that machinery: no `Proxy`, no index signature, no `evaluate`, no
    // `variables.` scope object. DOCUMENTED, NOT REPRODUCED - the failure simply moves from run
    // time to compile time, which is strictly better and is the point of dropping the dispatcher.
    const subject = aPromotionApplied();

    // @ts-expect-error PromotionApplied has no dynamic dispatch: an unmatched accessor is a compile error, where CFML threw at [org/Hibachi/HibachiEntity.cfc:L565].
    const unknownAccessor: unknown = subject.getSomeAttributeThatWasNeverDeclared;

    expect(unknownAccessor).toBeUndefined();
    expect('attributeValues' in subject).toBe(false);
    expect('getAttributeValue' in subject).toBe(false);
  });

  it('declares no collection, so no containment probe belongs on this row', () => {
    // A census of [model/entity/PromotionApplied.cfc:L52-L70] finds ZERO `one-to-many` and ZERO
    // `many-to-many` properties, so nothing here is an array and there is nothing for a `has*`
    // predicate to search. The direction runs the other way: it is the FAR side, `Promotion`, that
    // must expose `hasAppliedPromotion` [model/entity/Promotion.cfc:L64 declares the collection it
    // searches].
    const subject = aPromotionApplied();
    const members = prototypeMembers();

    expect(members.filter((name: string) => name.startsWith('has'))).toEqual([]);
    expect(members.filter((name: string) => name.startsWith('add'))).toEqual([]);
    expect('hasAppliedPromotion' in subject).toBe(false);
  });

  it('declares no non-persistent property, so no memoized accessor can drift', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L72-L74]: the non-persistent block is an EMPTY
    // BANNER PAIR - the START comment at L72 and the END comment at L74 with nothing between them.
    // The banner is a source wart and it is annotated rather than normalised away.
    //
    // The consequence is worth stating because it is the reason this suite spends no divergence: the
    // three known legacy memo-defect shapes all live in non-persistent accessors, and this entity
    // has none, so none of them can appear here. Every getter is a direct field read.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({
      promotionAppliedID: 'pa-1',
      promotion,
      discountAmount: Money.fromDecimalString('4.00'),
      currencyCode: toCurrencyCode('USD'),
    });

    // Read each twice: a memoizing accessor that poisoned its cache on the first call would differ
    // on the second, and none of them does.
    expect(subject.getDiscountAmount()).toBe(subject.getDiscountAmount());
    expect(subject.getCurrencyCode()).toBe(subject.getCurrencyCode());
    expect(subject.getPromotion()).toBe(subject.getPromotion());
    expect(subject.getPromotionAppliedID()).toBe(subject.getPromotionAppliedID());
    expect(subject.isNew()).toBe(subject.isNew());
  });

  it('ships neither ORM lifecycle hook, matching the second empty banner pair', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L152-L154]: the ORM Event Hooks block is the
    // second EMPTY BANNER PAIR in the component - START at L152, END at L154, nothing between.
    // Contrast [model/entity/PriceGroup.cfc:L206, L211], which declares a real `preInsert`/`preUpdate`
    // pair to maintain a materialized path. This entity maintains nothing, so no hook is invented
    // and no repository callback is implied. Annotated, never normalised.
    const members = prototypeMembers();

    for (const hook of ['preInsert', 'preUpdate', 'preDelete', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });

  it('reaches outward for nothing, so every member is synchronous', () => {
    // [model/entity/PromotionApplied.cfc] contains ZERO `getService(` sites - the only in-scope
    // entity family that does - so there is no collaborator port, no repository call and nothing to
    // await. Every accessor returns a value directly, which is what keeps
    // `getDiscountAmount()` and `getCurrencyCode()` usable from the engine's synchronous inner
    // loops. It is also why this suite needs no port double and imports no `src/lib/cfml` helper:
    // the entity declares no boolean column, no comma-list column, no `hb_formatType` and no CFML
    // struct traversal for one to serve.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({
      promotionAppliedID: 'pa-1',
      discountAmount: Money.fromDecimalString('1.00'),
    });

    expect(subject.getDiscountAmount()).not.toBeInstanceOf(Promise);
    expect(subject.getCurrencyCode()).not.toBeInstanceOf(Promise);
    expect(subject.setPromotion(promotion)).toBeUndefined();
    expect(subject.setDiscountAmount(Money.fromDecimalString('2.00'))).toBeUndefined();
    expect(subject.removePromotion(promotion)).toBeUndefined();
  });
});

describe('there is no validation surface, and none is invented', () => {
  // CFML parity: `model/validation/PromotionApplied.json` DOES NOT EXIST. Verified by direct
  // enumeration - `model/validation/` holds 96 `.json` schemas and this is not one of them - and it
  // is one of exactly SIX deliberate absences, alongside `Category`, `PromotionQualifier`,
  // `PromotionAccount`, `Product_AddOption` and `Product_AddOptionGroup`.
  //
  // The absence is BY DESIGN and is ported as-is. Legacy validation coverage is carried over as it
  // stands and never completed: inventing a schema here would add enforcement the source never had,
  // which is a behaviour change no matter how defensible the individual rule looked. Note what is
  // therefore absent by consequence, so nobody goes looking for it: no zod schema, no declaratively
  // invoked validator method, no `maxCollection:0` delete-context rule to reconcile, and no
  // conditional requiredness of the kind [model/validation/Product_UpdateSkus.json] carries.

  it('ships no validator method, no error accumulator and no delete gate', () => {
    const subject = aPromotionApplied();
    const members = prototypeMembers();

    for (const absent of [
      'validate',
      'hasErrors',
      'getErrors',
      'getValidations',
      'isDeletable',
      'isNotDeletable',
    ]) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }
  });

  it('accepts a row with every nullable column empty, refusing nothing', () => {
    // The direct, testable consequence of there being no schema: a row with nothing but its empty
    // primary key is constructible and readable. A required-field check on `discountAmount`, on
    // `appliedType` or on `currencyCode` would be exactly the invented validation this project
    // forbids - and would reject rows the `SwPromotionApplied` table accepts today.
    const subject = aPromotionApplied();

    expect(subject.getPromotionAppliedID()).toBe('');
    expect(subject.getAppliedType()).toBeUndefined();
    expect(subject.getDiscountAmount()).toBeUndefined();
    expect(subject.getCurrencyCode()).toBeUndefined();
    expect(subject.getPromotion()).toBeUndefined();
    expect(subject.getPromotionID()).toBeUndefined();
    expect(subject.getOrderItemID()).toBeUndefined();
    expect(subject.getOrderFulfillmentID()).toBeUndefined();
    expect(subject.getOrderID()).toBeUndefined();
    expect(subject.getRemoteID()).toBeUndefined();
    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();
  });

  it('constructs the row the engine builds, and nothing more', () => {
    // The end-to-end shape of an engine write, assembled in the order the three construction blocks
    // use [model/service/PromotionService.cfc:L401-L405, L447-L451, L530-L534]: build, type,
    // attach the promotion, attach one order-side key, set the amount. The order-side key arrives
    // through the constructor here rather than through a dropped setter, which is the whole
    // adaptation the anti-corruption boundary required.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ orderItemID: 'oi-1' });

    subject.setAppliedType('orderItem');
    subject.setPromotion(promotion);
    subject.setDiscountAmount(Money.fromDecimalString('12.50'));

    expect(subject.getAppliedType()).toBe('orderItem');
    expect(subject.getPromotion()).toBe(promotion);
    expect(subject.getOrderItemID()).toBe('oi-1');
    expect(subject.getDiscountAmount()?.toFixed2()).toBe('12.50');
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(promotion.getAppliedPromotions()[0]).toBe(subject);

    // The two columns the engine never touches stay NULL, which is the assertion that keeps a
    // future "completeness" fix from quietly populating them.
    expect(subject.getCurrencyCode()).toBeUndefined();
    expect(subject.getRemoteID()).toBeUndefined();

    // And it is still an unsaved row: the primary key is assigned by the database, not by the
    // engine [model/entity/PromotionApplied.cfc:L52 `generator="uuid"`].
    expect(subject.isNew()).toBe(true);
  });
});
