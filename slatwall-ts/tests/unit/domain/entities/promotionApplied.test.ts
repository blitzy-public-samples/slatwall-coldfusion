// slatwall-ts - unit suite for `src/domain/entities/promotionApplied.ts`
//
// `PromotionApplied` is the `SwPromotionApplied` row, and two roles make its contract worth
// pinning in detail.
//
// It is the write-side output of the promotion engine, the only row the pipeline creates, and the
// `discountAmount` it carries is the discount a customer receives.
//
// Everything that DECIDES a discount lives in the service tier and is pinned there; this entity is
// the write TARGET, and no assertion below computes a discount.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionApplied } from '../../../../src/domain/entities/promotionApplied.js';
import type { PromotionAppliedType } from '../../../../src/domain/entities/promotionApplied.js';
import { Promotion } from '../../../../src/domain/entities/promotion.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { toCurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';

// JUDGMENT CALL: `toCurrencyCode` is imported as a value alongside the `CurrencyCode` type.

/**
 * The constructor's parameter object, derived rather than restated.
 *
 * `src/domain/entities/promotionApplied.ts` declares the init shape INLINE and exports only the
 * class and the `appliedType` union, so there is no init type to import.
 */
type PromotionAppliedInit = ConstructorParameters<typeof PromotionApplied>[0];

/**
 * The columns of an unsaved row, every one of the fourteen slots explicit.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L52]: `promotionAppliedID` starts `''` rather
 * than absent, because `unsavedvalue="" default=""` is what makes the empty string the honest
 * answer for a row that has never been saved.
 *
 * @returns a fresh init object for an unsaved row.
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
 * @param overrides the columns this test is about; everything else stays at the unsaved default.
 * @returns a fresh `PromotionApplied`.
 */
function aPromotionApplied(overrides: Partial<PromotionAppliedInit> = {}): PromotionApplied {
  return new PromotionApplied({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds the one in-scope far side. `promotionID` is the only slot `Promotion`'s constructor
 * requires; `appliedPromotions` defaults to a fresh empty array, as
 * [model/entity/Promotion.cfc:L64] declares.
 *
 * @param promotionID the identifier to give it.
 * @returns a fresh `Promotion` holding no applied promotions.
 */
function aPromotion(promotionID: string): Promotion {
  return new Promotion({ promotionID });
}

/**
 * The three values `SwPromotionApplied.appliedType` may hold, in the exported union's order.
 */
const ENGINE_APPLIED_TYPES: readonly PromotionAppliedType[] = [
  'order',
  'orderItem',
  'orderFulfillment',
];

// SCHEMA CONTINUITY IS BINDING [model/entity/PromotionApplied.cfc:L49]: the port reads and writes
// `SwPromotionApplied` unchanged, with no migration, no rename, no new table and no column change.
// The name is not held in a local constant here, because a constant can only be compared with
// itself; tests/traceability/legacyTestMap.ts block A30 holds the shipped source to the frozen
// `table=` attribute instead.

/**
 * The four `fkcolumn` values, verbatim, keyed by the property that declares each.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L60]: the fulfillment column is spelled
 * `orderfulfillmentID` with a LOWERCASE f, unlike `orderItemID`
 * [model/entity/PromotionApplied.cfc:L59] and `orderID` [model/entity/PromotionApplied.cfc:L61],
 * which both capitalise consistently.
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
 * sound legacy code, and all six take or return an entity from the out-of-scope order aggregate -
 * `OrderItem`, `OrderFulfillment`, `Order`.
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
 * method-name patterns and terminating in a throw at L565.
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
 * @returns every member name the class installs on instances, minus the constructor, sorted.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionApplied.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the ported surface, and the six helpers deliberately dropped', () => {
  it('installs exactly the nineteen authored members, plus one private identity helper', () => {
    // `isSameRowAs` is `private` in TypeScript, a compile-time visibility rule and not a runtime
    // one, so it is present on the prototype and has to be accounted for here.
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

    // [model/entity/PromotionApplied.cfc:L58] is the one foreign key with an in-scope far side,
    // and [model/entity/Promotion.cfc:L64] is the collection that makes the pair resolvable.
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

    // Removing the dispatcher is what makes this a TYPE error rather than a runtime surprise: in
    // CFML the call would reach [org/Hibachi/HibachiEntity.cfc:L565] and throw only when executed.
    // @ts-expect-error PromotionApplied authors no setOrderItem.
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
    // `cacheuse` and `hb_serviceName` as component metadata.
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

  // C5 schema continuity - the physical name is `SwPromotionApplied` and the entity name
  // `SlatwallPromotionApplied` [model/entity/PromotionApplied.cfc:L49] - is checked against the
  // shipped source in tests/traceability/legacyTestMap.ts block A30, which derives both from the
  // frozen `table=` / `entityname=` attributes for all 18 entities. Restating them here as a
  // constant and asserting it back proved only that this file can hold its own literals; the
  // `getTableName` half is already covered by the metadata case above.

  it('carries no hb_permission-derived member, because the component declares none', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L49]: this component declares no
    // `hb_permission` attribute at all - unusual in this codebase.
    const members = prototypeMembers();

    for (const invented of ['getPermission', 'getHibachiPermission', 'checkPermission']) {
      expect(members).not.toContain(invented);
    }
  });
});

describe('appliedType is a closed union of exactly the three values the engine writes', () => {
  // CFML parity
  // [model/entity/PromotionApplied.cfc:L54, model/service/PromotionService.cfc:L402, L448, L531]:
  // the legacy column is an UNCONSTRAINED `ormtype="string"` with no `hb_formFieldType="select"`
  // and no options method.

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
    // Exhaustiveness proved by construction rather than asserted in prose.
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
    // @ts-expect-error 'orderShipment' is not a PromotionAppliedType: the union is closed over the only three values the engine writes.
    subject.setAppliedType('orderShipment');

    // The call still EXECUTES - the narrowing is a compile-time gate, not a runtime guard - so the
    // assertion below records what actually lands in the field rather than pretending the
    // assignment was refused.
    expect(subject.getAppliedType()).toBe('orderShipment');
  });

  it('reports undefined for a NULL column, and never a sentinel string', () => {
    // A row read back before the engine has typed it. `''` and `'none'` would both be inventions:
    // [model/entity/PromotionApplied.cfc:L54] declares no default of any kind.
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
    // `hb_formFieldType="select"` and therefore does have an options surface.
    expect(prototypeMembers()).not.toContain('getAppliedTypeOptions');
  });

  it('leaves the applied type independent of which foreign key is populated', () => {
    // A faithful absence rather than an oversight: nothing in `model/entity/PromotionApplied.cfc`
    // ties `appliedType` to the matching foreign key, and no database constraint does either.
    const subject = aPromotionApplied({ appliedType: 'order', orderItemID: 'oi-1' });

    expect(subject.getAppliedType()).toBe('order');
    expect(subject.getOrderItemID()).toBe('oi-1');
    expect(subject.getOrderID()).toBeUndefined();
  });
});

describe('discountAmount is Money or undefined, and absence is never zero', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L53]: one of exactly four no-default money
  // columns in the slice, with SkuCurrency.price L53, PriceGroupRate.amount L54 and
  // PromotionReward.amount L61 - all four re-verified against source.

  it('reports undefined when the column was NULL', () => {
    expect(aPromotionApplied().getDiscountAmount()).toBeUndefined();
  });

  it('is neither Money.zero nor a zero string when absent', () => {
    // The highest-consequence assertion in the suite. `Money.zero` exists to seed the engine's
    // accumulators [model/service/PromotionService.cfc:L988-L989] and is prohibited as a fallback
    // for an absent amount.
    const absent = aPromotionApplied().getDiscountAmount();

    expect(absent).toBeUndefined();
    expect(absent).not.toBe(Money.zero);
    expect(absent).not.toBe('0');
    expect(absent).not.toBe(0);
  });

  it('distinguishes a real zero discount from a missing discount', () => {
    // Both rows are legitimate.
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
    // object says so.
    const padded = Money.fromDecimalString('0.00');

    expect(aPromotionApplied({ discountAmount: padded }).getDiscountAmount()?.equals('0')).toBe(
      true,
    );
    expect(padded.toFixed2()).toBe('0.00');
  });

  it('round-trips an arbitrary-precision amount unchanged', () => {
    // Seventeen significant decimal places survive intact, which they could not do through an
    // IEEE-754 double - proof that nothing coerces the amount through a JavaScript number.
    const highPrecision = Money.fromDecimalString('12.34567890123456789');
    const subject = aPromotionApplied({ discountAmount: highPrecision });

    expect(subject.getDiscountAmount()?.toDecimalString()).toBe('12.34567890123456789');
    expect(subject.getDiscountAmount()).toBe(highPrecision);
  });

  it('hands back the very instance it was given, computing nothing', () => {
    const amount = Money.fromDecimalString('19.99');
    const subject = aPromotionApplied({ discountAmount: amount });

    expect(subject.getDiscountAmount()).toBe(amount);
    expect(subject.getDiscountAmount()?.toDecimalString()).toBe('19.99');
  });

  it('updates in place, mirroring the engine greater-discount replacement', () => {
    // CFML parity [model/service/PromotionService.cfc:L389, L435]: when a fulfillment or an order
    // already carries an applied promotion from the same PROMOTION and a larger discount is found,
    // the engine does not build a second row.
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
    // No path in the ported engine produces a negative discount: the only one that would is the
    // return and exchange branch [model/service/PromotionService.cfc:L542-L544], an empty block carrying
    // the legacy `TODO [issue #1766]` and doing nothing.
    const credit = Money.fromDecimalString('-2.50');

    expect(aPromotionApplied({ discountAmount: credit }).getDiscountAmount()?.toFixed2()).toBe(
      '-2.50',
    );
  });

  it('exposes no formatted accessor, because the column carries no hb_formatType', () => {
    // Contrast [model/entity/PriceGroupRate.cfc:L54] and [model/entity/PromotionReward.cfc:L61],
    // which each carry `hb_formatType="custom"` and do have a formatted surface.
    expect(prototypeMembers()).not.toContain('getDiscountAmountFormatted');
    expect(prototypeMembers()).not.toContain('getFormattedDiscountAmount');
  });
});

describe('currencyCode is the three-character authority, and the engine never sets it', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L55]: this is the in-scope 3-character
  // authority, re-verified rather than repeated. [model/entity/SkuCurrency.cfc:L68] reads.

  it('is undefined on a freshly-built engine row, because the engine never writes it', () => {
    // CFML parity [model/service/PromotionService.cfc:L400-L406, L446-L452, L529-L535]: all three
    // construction blocks set exactly four things - the applied type, the promotion, one
    // order-side foreign key and the discount amount.
    const engineBuiltRow = aPromotionApplied({
      appliedType: 'orderItem',
      orderItemID: 'oi-1',
      discountAmount: Money.fromDecimalString('3.25'),
    });

    expect(engineBuiltRow.getCurrencyCode()).toBeUndefined();
    expect(prototypeMembers()).not.toContain('setCurrencyCode');
  });

  it('is undefined rather than an empty string when the column was NULL', () => {
    // `''` would be a three-way lie: not a currency, not three characters, and it would satisfy a
    // naive truthiness test on the way to a conversion.
    const absent = aPromotionApplied().getCurrencyCode();

    expect(absent).toBeUndefined();
    expect(absent).not.toBe('');
    expect(absent).not.toBe('USD');
  });

  it('round-trips a branded code verbatim when a repository supplies one', () => {
    // The hydration path.
    const currencyCode: CurrencyCode = toCurrencyCode('EUR');

    expect(aPromotionApplied({ currencyCode }).getCurrencyCode()).toBe('EUR');
    expect(aPromotionApplied({ currencyCode }).getCurrencyCode()).toBe(currencyCode);
  });

  it('preserves casing exactly, folding nothing', () => {
    // `slatwall-ts/src/domain/valueObjects/currencyCode.ts` validates LENGTH only - no trimming,
    // no case folding - so a lowercase column value stays lowercase all the way through.
    const lowercase: CurrencyCode = toCurrencyCode('usd');

    expect(aPromotionApplied({ currencyCode: lowercase }).getCurrencyCode()).toBe('usd');
    expect(aPromotionApplied({ currencyCode: lowercase }).getCurrencyCode()).not.toBe('USD');
  });

  it('carries a code of exactly the declared width', () => {
    // The `length="3"` declaration made executable.
    expect(toCurrencyCode('GBP')).toHaveLength(3);
    expect(() => toCurrencyCode('EURO')).toThrow();
    expect(() => toCurrencyCode('EU')).toThrow();
    expect(() => toCurrencyCode('')).toThrow();
  });

  it('is read-only on the row: the repository supplies it and nothing re-points it', () => {
    const subject = aPromotionApplied({ currencyCode: toCurrencyCode('CAD') });

    // The engine never writes the column
    // [model/service/PromotionService.cfc:L400-L406, L446-L452, L529-L535].
    // @ts-expect-error PromotionApplied authors no setCurrencyCode.
    const absentSetter: unknown = subject.setCurrencyCode;

    expect(absentSetter).toBeUndefined();
    expect(subject.getCurrencyCode()).toBe('CAD');
  });
});

describe('the three order-side foreign keys are opaque identifiers with getters only', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L59-L61]: `orderItem`, `orderFulfillment` and
  // `order` are `many-to-one` onto `OrderItem`, `OrderFulfillment` and `Order`, every one
  // EXPLICITLY out of SCOPE with the whole order, checkout, cart, payment.

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
    // Each engine block populates exactly one of the three
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

    // `getOrderItem()` returning an `OrderItem` would drag the aggregate in.
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
    // Preserved verbatim as a schema contract. The COLUMN spellings are not restated here and
    // compared with themselves - `LEGACY_FK_COLUMNS` is authored in this file, so that loop could
    // not notice a target module mis-casing the join. Both halves are read from the frozen
    // component and from the emitted SQL in tests/traceability/legacyTestMap.ts block A30, which
    // also shows the lowercase-f owning column and the capitalised far-side column meeting in the
    // same live join. What IS checkable from here is the accessor this class publishes, which is
    // camel-cased from the PROPERTY name `orderFulfillment` rather than from the column:
    expect(prototypeMembers()).toContain('getOrderFulfillmentID');
    expect(prototypeMembers()).not.toContain('getOrderfulfillmentID');

    // And the identifier really is carried through the constructor, not merely declared.
    expect(aPromotionApplied({ orderFulfillmentID: 'of-42' }).getOrderFulfillmentID()).toBe(
      'of-42',
    );
  });

  it('records the hb_cascadeCalculate asymmetry without shipping a calculated property', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L59]: `orderItem` alone carries
    // `hb_cascadeCalculate="true"` and [model/entity/PromotionApplied.cfc:L58, L60, L61] do not.
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
    // Faithful, and deliberately so. Nothing in `model/entity/PromotionApplied.cfc` and no
    // database constraint restricts a row to a single order-side key; the engine simply never
    // writes more than one.
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
    // port parses none of it.
    const uuidLike = 'ffffffffffffffffffffffffffffffff';
    const notUuidLike = 'legacy-import-42';

    expect(aPromotionApplied({ orderID: uuidLike }).getOrderID()).toBe(uuidLike);
    expect(aPromotionApplied({ orderID: notUuidLike }).getOrderID()).toBe(notUuidLike);
    expect(aPromotionApplied({ orderID: '  padded  ' }).getOrderID()).toBe('  padded  ');
  });
});

describe('setPromotion is guarded, functional, and polarised on THIS row', () => {
  // The guard polarity is load-bearing, and it is the opposite of `PriceGroupRate.setPriceGroup`.

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
    // [model/entity/Promotion.cfc:L170-L171] reads that same collection's length.
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
    // Two hydrations of the same persisted row.
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
    // The guard-polarity test.
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
    // The other arm of the same guard.
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
    // the case that separates the two readings.
    const unsavedPromotion = aPromotion('');
    const savedRow = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    savedRow.setPromotion(unsavedPromotion);
    savedRow.setPromotion(unsavedPromotion);

    expect(unsavedPromotion.getAppliedPromotions()).toHaveLength(1);
  });

  it('re-points the near side on a second set without unlinking the first promotion', () => {
    // Faithful to [model/entity/PromotionApplied.cfc:L79-L84], which contains no removal: the
    // legacy `setPromotion` overwrites `variables.promotion` and appends to the new far side.
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
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    promotion.addAppliedPromotion(subject);

    expect(subject.getPromotion()).toBe(promotion);
    expect(promotion.getAppliedPromotions()).toHaveLength(1);
    expect(promotion.getAppliedPromotions()[0]).toBe(subject);
  });
});

describe('removePromotion deletes by index and clears the near side unconditionally', () => {
  // CFML parity [model/entity/PromotionApplied.cfc:L85-L94]: three properties matter and all three
  // are pinned below.

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
    // [model/entity/PromotionApplied.cfc:L90].
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
    // index guard, so a miss still unlinks.
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
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion();

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('treats an explicitly passed undefined exactly as an omitted argument', () => {
    // The CFML idiom is `structKeyExists(arguments, "promotion")`
    // [model/entity/PromotionApplied.cfc:L86], which tests presence.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion(undefined);

    expect(promotion.getAppliedPromotions()).toHaveLength(0);
    expect(subject.getPromotion()).toBeUndefined();
  });

  it('throws when no argument is supplied and no promotion is set', () => {
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    expect(subject.getPromotion()).toBeUndefined();
    expect(() => subject.removePromotion()).toThrow(/removePromotion/);
  });

  it('throws again after a successful removal, because the near side is now clear', () => {
    // The direct consequence of the unconditional clear.
    const promotion = aPromotion('p-1');
    const subject = aPromotionApplied({ promotionAppliedID: 'pa-1' });

    subject.setPromotion(promotion);
    subject.removePromotion();

    expect(() => subject.removePromotion()).toThrow();
  });

  it('is a no-op on the far side when called twice with the same promotion', () => {
    // The explicit-argument form has nothing to default from, so it stays safe after the row is
    // already unlinked and the second find simply misses.
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
    // The reference-identity fallback. Both rows have `promotionAppliedID  ''`, so a
    // primary-key comparison alone would conflate them and remove whichever came first.
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
    // makes the empty string LOAD-BEARING, and the framework chain resolved to exactly this test -
    // `isNew()` returns `getNewFlag()`.
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
    // The one non-nullable column on the row.
    const key = aPromotionApplied().getPromotionAppliedID();

    expect(typeof key).toBe('string');
    expect(key).not.toBeUndefined();
  });

  it('declares remoteID, which the engine nonetheless never writes', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L64]: a `remoteID` string column is declared
    // here, unlike `model/entity/RoundingRule.cfc`, which declares none - so the column is real
    // and must round-trip.
    expect(prototypeMembers()).toContain('getRemoteID');
    expect(aPromotionApplied().getRemoteID()).toBeUndefined();
    expect(aPromotionApplied({ remoteID: 'ext-9001' }).getRemoteID()).toBe('ext-9001');
  });

  it('reports audit timestamps as Date or undefined, never an epoch and never zero', () => {
    // CFML parity [model/entity/PromotionApplied.cfc:L67, L69]: both are
    // `hb_populateEnabled="false" ormtype="timestamp"`, so nothing user-supplied ever sets them
    // and an unsaved row genuinely has neither.
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
    // whole account module.
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
    // far side, so it is the sole one carried as an OBJECT.
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
    // dispatcher matched eleven method-name patterns and then THREW at L565, reporting a method.
    const subject = aPromotionApplied();

    // An unmatched accessor is a compile error here, where CFML threw at
    // [org/Hibachi/HibachiEntity.cfc:L565].
    // @ts-expect-error PromotionApplied has no dynamic dispatch.
    const unknownAccessor: unknown = subject.getSomeAttributeThatWasNeverDeclared;

    expect(unknownAccessor).toBeUndefined();
    expect('attributeValues' in subject).toBe(false);
    expect('getAttributeValue' in subject).toBe(false);
  });

  it('declares no collection, so no containment probe belongs on this row', () => {
    // A census of [model/entity/PromotionApplied.cfc:L52-L70] finds ZERO `one-to-many` and ZERO
    // `many-to-many` properties, so nothing here is an array for a `has*` predicate to search.
    const subject = aPromotionApplied();
    const members = prototypeMembers();

    expect(members.filter((name: string) => name.startsWith('has'))).toEqual([]);
    expect(members.filter((name: string) => name.startsWith('add'))).toEqual([]);
    expect('hasAppliedPromotion' in subject).toBe(false);
  });

  it('declares no non-persistent property, so no memoized accessor can drift', () => {
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
    // second empty banner pair - start at L152, end at L154, nothing between.
    const members = prototypeMembers();

    for (const hook of ['preInsert', 'preUpdate', 'preDelete', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });

  it('reaches outward for nothing, so every member is synchronous', () => {
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
  // CFML parity: `model/validation/PromotionApplied.json` does not exist.

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
    // The end-to-end shape of an engine write, assembled in the order the three construction
    // blocks use [model/service/PromotionService.cfc:L401-L405, L447-L451, L530-L534]: build,
    // type, attach the promotion, attach one order-side key.
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

    // The two columns the engine never touches stay NULL, which keeps a future "completeness" fix
    // from quietly populating them.
    expect(subject.getCurrencyCode()).toBeUndefined();
    expect(subject.getRemoteID()).toBeUndefined();

    // And it is still an unsaved row: the primary key is assigned by the database, not by the
    // engine [model/entity/PromotionApplied.cfc:L52 declares `generator="uuid"`].
    expect(subject.isNew()).toBe(true);
  });
});
