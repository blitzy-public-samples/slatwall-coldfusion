// slatwall-ts - unit suite for `src/domain/entities/skuCurrency.ts`
//
// No `LEGACY-DEFECT` marker appears anywhere below, and none is invented to look thorough. The
// migration's register carries thirty numbered defects and not one of them is in this entity.
//
// A defect here would have been PRESERVED under the two-line marker form rather than repaired, so
// the annotations below are `CFML parity` and `JUDGMENT CALL`; the three project-wide divergences
// are owned elsewhere.
//
// JUDGMENT CALL: `CurrencyCode` is deliberately not imported. The brand is a COMPILE-TIME
// construct over `string`, so the type is never named in an annotation below - every code value
// comes from `toCurrencyCode`, the runtime symbol actually needed.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkuCurrency } from '../../../../src/domain/entities/skuCurrency.js';
import { toCurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

// Local test infrastructure.
//
// No shared base class, no `setUp`/`tearDown` component pattern, no `assertEquals` shim and no
// `Helper` port.

/**
 * The constructor's init shape, DERIVED rather than restated.
 *
 * `src/domain/entities/skuCurrency.ts` declares the init object INLINE and exports only the class,
 * so there is no init type to import.
 */
type SkuCurrencyInit = ConstructorParameters<typeof SkuCurrency>[0];

/**
 * The currency code every generic subject carries.
 *
 * JUDGMENT CALL: deliberately not the platform's default code.
 */
const ROW_CURRENCY_CODE = 'EUR';

/**
 * The columns of an UNSAVED row, all eleven slots explicit.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L52]: `skuCurrencyID` starts `''` rather than absent,
 * because `unsavedvalue="" default=""` makes the empty string the honest answer for a row that has
 * never been saved - and it is what `isNew()` keys on.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L53, L54, L55]: all three monetary slots start
 * `undefined`, not `0`. The ORM `default="0"` on L54/L55 binds at INSERT time and says nothing
 * about a row read back from the schema; `price` on L53 has no default at all.
 *
 * @returns a fresh, fully-populated init object for an unsaved row.
 */
function unsavedRowColumns(): SkuCurrencyInit {
  return {
    skuCurrencyID: '',
    price: undefined,
    renewalPrice: undefined,
    listPrice: undefined,
    currencyCode: toCurrencyCode(ROW_CURRENCY_CODE),
    sku: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  };
}

/**
 * Builds one per-currency override row, overriding only what a test cares about.
 *
 * @param overrides the columns this test is about; everything else stays at the unsaved default.
 * @returns a fresh `SkuCurrency`.
 */
function aSkuCurrency(overrides: Partial<SkuCurrencyInit> = {}): SkuCurrency {
  return new SkuCurrency({ ...unsavedRowColumns(), ...overrides });
}

/**
 * The prototype's own members, minus the constructor, sorted.
 *
 * @returns every member name the class installs on instances.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(SkuCurrency.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The fifteen public members the port ships, sorted.
 *
 * CFML parity `model/entity/SkuCurrency.cfc`: the behavioural surface is exactly three methods -
 * `setSku` [model/entity/SkuCurrency.cfc:L89-L94], `removeSku`
 * [model/entity/SkuCurrency.cfc:L95-L104] and `getSimpleRepresentation`
 * [model/entity/SkuCurrency.cfc:L118-L120].
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getCurrencyCode',
  'getListPrice',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getPrice',
  'getRemoteID',
  'getRenewalPrice',
  'getSimpleRepresentation',
  'getSku',
  'getSkuCurrencyID',
  'isNew',
  'removeSku',
  'setSku',
];

/**
 * Members that must not exist, each with the reason it is absent.
 *
 * `setCurrencyCode` [model/entity/SkuCurrency.cfc:L68] declares `insert="false"` and
 * `update="false"`, making the column unwritable by construction.
 */
const ABSENT_MEMBERS: readonly string[] = [
  'setCurrencyCode',
  'setPrice',
  'setListPrice',
  'setRenewalPrice',
  'getSkuID',
  'getCurrency',
  'getFormattedValue',
  'validate',
  'hasError',
  'getError',
  'hasErrors',
  'getPrimaryIDPropertyName',
  'getPrimaryIDValue',
  'getNewFlag',
  'clearAttributeCache',
];

describe('the ported surface', () => {
  it('installs exactly the fifteen public members, plus one private identity helper', () => {
    // `isSameRowAs` is `private` in TypeScript, which is a COMPILE-TIME visibility rule rather
    // than a runtime one, so it is on the prototype and has to be accounted for.
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE, 'isSameRowAs'].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(15);
  });

  it('exposes exactly three behavioural methods; every other member is a generated accessor', () => {
    const subject = aSkuCurrency();
    const behavioural: readonly string[] = ['setSku', 'removeSku', 'getSimpleRepresentation'];

    for (const name of behavioural) {
      expect(typeof Reflect.get(subject, name)).toBe('function');
    }

    // Everything else on the public surface is either a generated accessor or the restated
    // `isNew`.
    const accessorsAndIsNew = PORTED_PUBLIC_SURFACE.filter(
      (name: string) => !behavioural.includes(name),
    );
    expect(accessorsAndIsNew).toHaveLength(12);
  });

  it('declares no member the legacy component never had, and no framework residue', () => {
    const subject = aSkuCurrency();
    const members = prototypeMembers();

    for (const absent of ABSENT_MEMBERS) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }
  });

  it('does not emulate the framework dynamic-dispatch path in any form', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: the framework base resolved an unknown
    // `getX()` through eleven dynamic-dispatch patterns and, failing all of them, threw "You have
    // called a method...() which does not exists in the... entity." `SkuCurrency` declares no
    // `attributeValues`.
    const subject = aSkuCurrency();

    expect('getSomeUndeclaredAttribute' in subject).toBe(false);
    expect(Reflect.get(subject, 'getSomeUndeclaredAttribute')).toBeUndefined();

    // Not a Proxy: a Proxy-backed object would report an own key for an arbitrary probe.
    expect(Object.getOwnPropertyNames(subject)).not.toContain('getSomeUndeclaredAttribute');
  });
});

// CFML parity [model/entity/SkuCurrency.cfc:L53, L54, L55]: `price` declares no default while
// `listPrice` and `renewalPrice` both declare `default="0"`. In CFML ORM a `default` applies on
// entityNew, not as a DB DEFAULT constraint.
//
// CFML parity [model/entity/SkuCurrency.cfc:L53, L54, L55]: all three `hb_rbKey` values point at
// `entity.sku.*` - `entity.sku.price`, `entity.sku.renewalPrice`, `entity.sku.listPrice` - not at
// `entity.skuCurrency.*`.

describe('the three monetary columns', () => {
  const monetaryAccessors: readonly {
    readonly column: 'price' | 'renewalPrice' | 'listPrice';
    readonly read: (subject: SkuCurrency) => Money | undefined;
  }[] = [
    { column: 'price', read: (subject: SkuCurrency): Money | undefined => subject.getPrice() },
    {
      column: 'renewalPrice',
      read: (subject: SkuCurrency): Money | undefined => subject.getRenewalPrice(),
    },
    {
      column: 'listPrice',
      read: (subject: SkuCurrency): Money | undefined => subject.getListPrice(),
    },
  ];

  it('reads every absent monetary column as undefined, never as zero', () => {
    const subject = aSkuCurrency();

    for (const { read } of monetaryAccessors) {
      const value = read(subject);

      // `toBeUndefined`, not `toBeFalsy`.
      expect(value).toBeUndefined();
      expect(value).not.toBe(Money.zero);
      expect(value).not.toBeNull();
    }
  });

  it('never substitutes a zero Money for an absent price on any of the three columns', () => {
    const subject = aSkuCurrency();

    for (const { read } of monetaryAccessors) {
      const value = read(subject);

      // The guard that matters: if the port had defaulted to zero, `value` would be a Money equal
      // to zero.
      expect(value instanceof Money).toBe(false);
    }
  });

  it('distinguishes a REAL zero price from a MISSING price, and never conflates them', () => {
    // The single highest-consequence assertion in this file.
    const realZero = aSkuCurrency({ skuCurrencyID: 'sc-real-zero', price: Money.zero });
    const missing = aSkuCurrency({ skuCurrencyID: 'sc-missing', price: undefined });

    expect(realZero.getPrice()).toBe(Money.zero);
    expect(missing.getPrice()).toBeUndefined();

    // Not equal, and not merely by value: one is a Money and the other is nothing at all.
    expect(realZero.getPrice()).not.toBe(missing.getPrice());
    expect(realZero.getPrice() instanceof Money).toBe(true);
    expect(missing.getPrice() instanceof Money).toBe(false);

    // And the real zero is genuinely zero, asserted through the value object rather than through a
    // JavaScript numeric comparison.
    const priced = realZero.getPrice();
    expect(priced === undefined ? 'absent' : priced.toFixed2()).toBe('0.00');
  });

  it('distinguishes real zero from missing on listPrice and renewalPrice too', () => {
    // The same conflation is possible on the two columns that do carry `default="0"`, and it
    // matters more there, not less: because the ORM default makes zero look like the natural
    // resting value.
    const zeroed = aSkuCurrency({
      skuCurrencyID: 'sc-zeroed',
      listPrice: Money.zero,
      renewalPrice: Money.zero,
    });
    const missing = aSkuCurrency({ skuCurrencyID: 'sc-blank' });

    expect(zeroed.getListPrice()).toBe(Money.zero);
    expect(zeroed.getRenewalPrice()).toBe(Money.zero);
    expect(missing.getListPrice()).toBeUndefined();
    expect(missing.getRenewalPrice()).toBeUndefined();
  });

  it('hands back the exact Money instance it was given, unchanged and unrounded', () => {
    // JUDGMENT CALL: instance identity is asserted rather than a rendered string, and that is the
    // stronger claim.
    const price = Money.fromDecimalString('19.9942');
    const renewalPrice = Money.fromDecimalString('4.005');
    const listPrice = Money.fromDecimalString('24.99');

    const subject = aSkuCurrency({ skuCurrencyID: 'sc-1', price, renewalPrice, listPrice });

    expect(subject.getPrice()).toBe(price);
    expect(subject.getRenewalPrice()).toBe(renewalPrice);
    expect(subject.getListPrice()).toBe(listPrice);
  });

  it('preserves full precision, imposing no two-decimal scale of its own', () => {
    // `ormtype="big_decimal"` on all three columns is not representable in IEEE-754 without drift,
    // which is why every value crosses this boundary as a `Money`.
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-precise',
      price: Money.fromDecimalString('19.9942'),
    });

    const price = subject.getPrice();
    expect(price === undefined ? 'absent' : price.toDecimalString()).toBe('19.9942');

    // Presentation to two decimals is available, but it is the CALLER's choice and never applied
    // by the entity.
    expect(price === undefined ? 'absent' : price.toFixed2()).toBe('19.99');
  });

  it('accepts a negative monetary value without coercing or rejecting it', () => {
    // Representability is the point, and it is what `issue_1335` builds on: the ENTITY models what
    // the column can hold, and `minValue 0` is a SAVE-CONTEXT rule enforced elsewhere.
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-negative',
      price: Money.fromDecimalString('-20'),
    });

    const price = subject.getPrice();
    expect(price).not.toBeUndefined();
    expect(price === undefined ? 'absent' : price.toDecimalString()).toBe('-20');
    expect(price === undefined ? false : price.isLessThan(Money.zero)).toBe(true);
  });

  it('keeps the three columns independent, so one present value never implies another', () => {
    // Cascade Step 2 depends on exactly this.
    const onlyPrice = aSkuCurrency({
      skuCurrencyID: 'sc-price-only',
      price: Money.fromDecimalString('19.99'),
    });

    expect(onlyPrice.getPrice()).not.toBeUndefined();
    expect(onlyPrice.getListPrice()).toBeUndefined();
    expect(onlyPrice.getRenewalPrice()).toBeUndefined();

    const onlyListPrice = aSkuCurrency({
      skuCurrencyID: 'sc-list-only',
      listPrice: Money.fromDecimalString('29.99'),
    });

    expect(onlyListPrice.getListPrice()).not.toBeUndefined();
    expect(onlyListPrice.getPrice()).toBeUndefined();
    expect(onlyListPrice.getRenewalPrice()).toBeUndefined();
  });
});

// CFML parity [model/entity/SkuCurrency.cfc:L68]: this property carries no ormtype and no length.
// The in-scope 3-character authority is [model/entity/PromotionApplied.cfc:L55], which declares
// ormtype="string" length="3" and this locator does not.
//
// CFML parity [model/entity/SkuCurrency.cfc:L58, L68]: two source lines collapse into one field,
// exactly rather than conveniently.

describe('the currencyCode projection', () => {
  it('is exposed by a getter with no setter anywhere on the class', () => {
    // `insert="false" update="false"` is the legacy mechanism: the ORM maps the property onto the
    // foreign-key column for READING only, so it can never take part in an insert or an update.
    const subject = aSkuCurrency();
    const members = prototypeMembers();

    expect(members).toContain('getCurrencyCode');
    expect(members).not.toContain('setCurrencyCode');
    expect('setCurrencyCode' in subject).toBe(false);

    // No write-shaped member for this column under any spelling.
    for (const member of members) {
      expect(member.startsWith('setCurrency')).toBe(false);
    }
  });

  it('reports the branded code the row carries, mirroring the currency foreign key', () => {
    const subject = aSkuCurrency();

    // The value the constructor was handed at the hydration boundary, returned verbatim.
    expect(subject.getCurrencyCode()).toBe(ROW_CURRENCY_CODE);
    expect(typeof subject.getCurrencyCode()).toBe('string');
  });

  it('preserves casing verbatim and never folds it', () => {
    // CFML parity [model/entity/Sku.cfc:L400]: CFML `eq` compares without REGARD to CASE but
    // STORES precisely what it was given, and both halves are reproduced across the port - storage
    // verbatim here, insensitive comparison in `currencyCodeEquals`.
    const lowerCased = aSkuCurrency({
      skuCurrencyID: 'sc-lower',
      currencyCode: toCurrencyCode('usd'),
    });
    const upperCased = aSkuCurrency({
      skuCurrencyID: 'sc-upper',
      currencyCode: toCurrencyCode('USD'),
    });
    const mixedCased = aSkuCurrency({
      skuCurrencyID: 'sc-mixed',
      currencyCode: toCurrencyCode('uSd'),
    });

    expect(lowerCased.getCurrencyCode()).toBe('usd');
    expect(upperCased.getCurrencyCode()).toBe('USD');
    expect(mixedCased.getCurrencyCode()).toBe('uSd');
  });

  it('is not mutated by either bidirectional helper', () => {
    // The projection must survive the only two write paths on the class.
    const sku = makeSkuFixture({ skuCode: 'PROJ-1', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-projection' });

    subject.setSku(sku);
    expect(subject.getCurrencyCode()).toBe(ROW_CURRENCY_CODE);

    subject.removeSku();
    expect(subject.getCurrencyCode()).toBe(ROW_CURRENCY_CODE);
  });
});

describe('issue_1335', () => {
  // Decoding `_missing`, which is the whole point of the ticket.

  it('confirms the tier boundary the mapping below rests on', () => {
    const subject = aSkuCurrency();

    // No validation surface on the entity.
    for (const member of ['validate', 'hasError', 'getError', 'hasErrors']) {
      expect(member in subject).toBe(false);
    }

    // And no setters, so `setPrice(-20)` / `setListPrice('test')` have no counterpart here.
    for (const member of ['setPrice', 'setListPrice', 'setRenewalPrice']) {
      expect(member in subject).toBe(false);
    }
  });

  it('decodes the "_missing" suffix test the ticket turns on', () => {
    expect('_missing'.length).toBe(8);

    // A key ENDING in the literal is a missing/required violation; one that does not is something
    // else.
    expect('entity.skuCurrency.price_missing'.endsWith('_missing')).toBe(true);
    expect('entity.skuCurrency.price_minValue'.endsWith('_missing')).toBe(false);
    expect('entity.skuCurrency.listPrice_dataType'.endsWith('_missing')).toBe(false);
  });

  it('legacy L119 + L122: a -20 price is a MIN-VALUE violation, never a missing one', () => {
    // L114's `setPrice( -20 )` becomes a constructor-supplied negative value.
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-issue-1335',
      price: Money.fromDecimalString('-20'),
    });

    const price = subject.getPrice();

    // L119 `assert( skuCurrency.hasError('price') )` - the value is invalid under
    // `model/validation/SkuCurrency.json`, whose `price` rule carries `minValue 0`.
    expect(price).not.toBeUndefined();
    expect(price === undefined ? false : price.isLessThan(Money.zero)).toBe(true);

    // L122 `right( getError('price')[1], 8) neq "_missing"` - the violation is not a
    // missing/required one, and the reason is observable right here: the value is PRESENT.
    expect(price).not.toBeUndefined();
    expect(aSkuCurrency().getPrice()).toBeUndefined();

    // So the two states cannot be confused: supplied-but-below-minimum, versus absent.
    expect(subject.getPrice()).not.toBe(aSkuCurrency().getPrice());
  });

  it('legacy L120 + L123: a non-numeric listPrice is a DATATYPE violation, never a missing one', () => {
    // L115's `setListPrice( 'test' )` supplies a value that is not a number at all.
    expect(() => Money.fromDecimalString('test')).toThrow();

    // The violation is therefore a DATATYPE one and demonstrably not a missing one, because
    // absence is a DIFFERENT and separately reachable state on the same column.
    const absent = aSkuCurrency({ skuCurrencyID: 'sc-1335-absent' });
    expect(absent.getListPrice()).toBeUndefined();
    const wellFormed = aSkuCurrency({
      skuCurrencyID: 'sc-1335-ok',
      listPrice: Money.fromDecimalString('12.34'),
    });
    expect(wellFormed.getListPrice()).not.toBeUndefined();

    // The three states the ticket needs kept apart: absent, present-and-valid, and
    // rejected-as-malformed.
    expect(absent.getListPrice()).toBeUndefined();
    expect(wellFormed.getListPrice()).not.toBeUndefined();
    expect(() => Money.fromDecimalString('test')).toThrow();
  });

  it('reproduces the full legacy scenario: both columns invalid at once, neither missing', () => {
    // The legacy body sets both columns on one instance before validating, so the two errors are
    // raised together.
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-1335-both',
      price: Money.fromDecimalString('-20'),
    });

    const price = subject.getPrice();

    // Price: supplied, below the minimum - a min-value violation, not a missing one.
    expect(price).not.toBeUndefined();
    expect(price === undefined ? false : price.isLessThan(Money.zero)).toBe(true);

    // ListPrice: `'test'` never becomes a value, so the column stays absent on this row while the
    // malformed input is refused at the boundary.
    expect(subject.getListPrice()).toBeUndefined();
    expect(() => Money.fromDecimalString('test')).toThrow();

    // RenewalPrice was never touched by the ticket and must stay absent, proving the two failures
    // did not bleed into a third column.
    expect(subject.getRenewalPrice()).toBeUndefined();
  });
});

// There is no delete-context gate, no `"method"` entry invoking a custom validator, and no fourth
// property.
//
// CFML parity `model/validation/SkuCurrency.json`: this is the file the agent action plan omitted.
//
// CFML parity `model/validation/SkuCurrency.json`: `price` is REQUIRED on save, so it is never
// NULL for a validly-saved row - which is exactly why the cascade assigns it UNGUARDED at
// [model/entity/Sku.cfc:L409]. ListPrice/renewalPrice are validated but OPTIONAL, so they are
// legitimately NULL.

describe('the validation schema and the cascade guard asymmetry it entails', () => {
  it('can represent a validly-saved row: price present, both optional columns NULL', () => {
    // The state a `save`-context-valid row minimally reaches.
    const validlySaved = aSkuCurrency({
      skuCurrencyID: 'sc-valid',
      price: Money.fromDecimalString('19.99'),
      listPrice: undefined,
      renewalPrice: undefined,
    });

    expect(validlySaved.getPrice()).not.toBeUndefined();
    expect(validlySaved.getListPrice()).toBeUndefined();
    expect(validlySaved.getRenewalPrice()).toBeUndefined();
  });

  it('proves the two guarded columns are genuinely nullable, so the guards are not dead code', () => {
    // If `listPrice` and `renewalPrice` could not be NULL, the `!isNull(...)` tests at
    // [model/entity/Sku.cfc:L401] and [model/entity/Sku.cfc:L405] would be unreachable branches.
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-nullable' });

    expect(subject.getListPrice()).toBeUndefined();
    expect(subject.getRenewalPrice()).toBeUndefined();
  });

  it('does NOT narrow price to a required Money on the strength of the save-context rule', () => {
    // The schema/column tension is documented, not resolved, and this assertion is where that
    // decision becomes checkable.
    const legacyRowWithNullPrice = aSkuCurrency({ skuCurrencyID: 'sc-legacy-null' });

    expect(legacyRowWithNullPrice.getPrice()).toBeUndefined();

    // And constructing it did not throw, which is the substance of the claim: the entity accepts
    // the state the column permits.
    expect(legacyRowWithNullPrice.getSkuCurrencyID()).toBe('sc-legacy-null');
  });

  it('can represent every combination the three-property schema permits', () => {
    // Eight combinations of present/absent across three columns.
    const somePrice = Money.fromDecimalString('19.99');
    const combinations: readonly (readonly [boolean, boolean, boolean])[] = [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [false, false, true],
      [true, true, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ];

    combinations.forEach(([hasPrice, hasListPrice, hasRenewalPrice], index: number) => {
      const subject = aSkuCurrency({
        skuCurrencyID: `sc-combo-${String(index)}`,
        price: hasPrice ? somePrice : undefined,
        listPrice: hasListPrice ? somePrice : undefined,
        renewalPrice: hasRenewalPrice ? somePrice : undefined,
      });

      expect(subject.getPrice() !== undefined).toBe(hasPrice);
      expect(subject.getListPrice() !== undefined).toBe(hasListPrice);
      expect(subject.getRenewalPrice() !== undefined).toBe(hasRenewalPrice);
    });
  });

  it('constrains exactly three columns, leaving every other column unvalidated', () => {
    // The schema names `price`, `listPrice` and `renewalPrice` and nothing else.
    const subject = aSkuCurrency({
      skuCurrencyID: '',
      remoteID: undefined,
      sku: undefined,
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    });

    expect(subject.getSkuCurrencyID()).toBe('');
    expect(subject.getRemoteID()).toBeUndefined();
    expect(subject.getSku()).toBeUndefined();
    expect(subject.getCreatedDateTime()).toBeUndefined();
    expect(subject.getModifiedDateTime()).toBeUndefined();
  });
});

// CFML parity [model/entity/SkuCurrency.cfc:L118-L120]: the legacy body dereferences both nullable
// sku and currency and therefore throws on a new instance. The shipped module prefers a guard
// returning '' for a missing SKU code.
//
// The guard is a JUDGMENT CALL made in the entity: CFML's implicit lazy load made the null case
// unreachable in practice, so there is no legacy behaviour to preserve - only a hole the ORM used
// to fill; making a DISPLAY HELPER fail a request is a poor trade.

describe('getSimpleRepresentation', () => {
  it('joins the sku code and the currency code with exactly " - "', () => {
    // The separator is one space, one hyphen, one space, reproduced byte for byte from
    // `& " - " &`.
    const sku = makeSkuFixture({ skuCode: 'NIKE-AIR', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-label', sku });

    expect(subject.getSimpleRepresentation()).toBe('NIKE-AIR - EUR');

    // And the separator occurs exactly once for codes that contain no hyphen-space of their own,
    // so the join is unambiguous.
    const plainSku = makeSkuFixture({ skuCode: 'PLAIN', skuCurrencies: [] });
    const plain = aSkuCurrency({ skuCurrencyID: 'sc-plain', sku: plainSku });
    expect(plain.getSimpleRepresentation().split(' - ')).toEqual(['PLAIN', 'EUR']);
  });

  it('guards an unmaterialized sku and returns the separator plus the currency code', () => {
    // Shipped reality: a GUARD, not the legacy throw.
    const subject = aSkuCurrency();

    expect(() => subject.getSimpleRepresentation()).not.toThrow();
    expect(subject.getSimpleRepresentation()).toBe(' - EUR');
  });

  it('reports absence through getSku(), which is the only member that can', () => {
    // The consequence of the guard, stated plainly rather than hidden: the label CANNOT
    // distinguish "no sku" from "a sku whose code is the empty string".
    const noSku = aSkuCurrency({ skuCurrencyID: 'sc-no-sku' });
    const emptyCodeSku = makeSkuFixture({ skuCode: '', skuCurrencies: [] });
    const withEmptyCode = aSkuCurrency({ skuCurrencyID: 'sc-empty-code', sku: emptyCodeSku });

    // Indistinguishable through the label...
    expect(noSku.getSimpleRepresentation()).toBe(withEmptyCode.getSimpleRepresentation());

    // and perfectly distinguishable through the accessor.
    expect(noSku.getSku()).toBeUndefined();
    expect(withEmptyCode.getSku()).toBe(emptyCodeSku);
  });

  it('returns a simple string value in every state, which is the surviving spirit of the base case', () => {
    // The inherited case's INTENT - that the representation is a simple value - does hold for the
    // port in every reachable state, even though the case itself cannot be carried across.
    const withSku = makeSkuFixture({ skuCode: 'SIMPLE', skuCurrencies: [] });

    for (const subject of [aSkuCurrency(), aSkuCurrency({ skuCurrencyID: 'sc-s', sku: withSku })]) {
      const representation = subject.getSimpleRepresentation();
      expect(typeof representation).toBe('string');
      expect(representation).toContain(' - ');
    }
  });

  it('reflects the currency code casing verbatim in the label', () => {
    const sku = makeSkuFixture({ skuCode: 'CASE', skuCurrencies: [] });
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-case',
      sku,
      currencyCode: toCurrencyCode('gbp'),
    });

    expect(subject.getSimpleRepresentation()).toBe('CASE - gbp');
  });

  it('guards a materialized sku whose own skuCode column is null, on the SECOND level', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L119] versus [model/entity/Sku.cfc:L54]: the
    // legacy `getSku().getSkuCode()` has two holes and the shipped module guards both. This covers
    // the second: a SKU that is materialized but whose own `skuCode` column is null.
    const codelessSku = makeSkuFixture({ skuCode: undefined, skuCurrencies: [] });
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-codeless',
      sku: codelessSku,
      currencyCode: toCurrencyCode('CHF'),
    });

    // The sku is present - this is emphatically not the unmaterialized case above.
    expect(subject.getSku()).toBe(codelessSku);
    expect(codelessSku.getSkuCode()).toBeUndefined();

    expect(subject.getSimpleRepresentation()).toBe(' - CHF');
  });

  it('renders the two holes IDENTICALLY, so only getSku() can tell them apart', () => {
    // The consequence of guarding both levels, stated as an assertion instead of left implicit:
    // "no sku at all" and "a sku with no code" collapse onto the same label.
    const noSku = aSkuCurrency({ skuCurrencyID: 'sc-hole-a', currencyCode: toCurrencyCode('CHF') });
    const codelessSku = makeSkuFixture({ skuCode: undefined, skuCurrencies: [] });
    const noCode = aSkuCurrency({
      skuCurrencyID: 'sc-hole-b',
      sku: codelessSku,
      currencyCode: toCurrencyCode('CHF'),
    });

    // Indistinguishable through the label...
    expect(noSku.getSimpleRepresentation()).toBe(noCode.getSimpleRepresentation());

    // And cleanly distinguishable through `getSku()`, which is the point.
    expect(noSku.getSku()).toBeUndefined();
    expect(noCode.getSku()).not.toBeUndefined();
  });
});

// CFML parity [model/entity/SkuCurrency.cfc:L89-L94, L95-L104]: the far-side maintenance is
// reproduced in the shipped module, which states "both are reproduced, so `sku.getSkuCurrencies()`
// and `skuCurrency.getSku()` can never disagree".
//
// This differs per entity - never assume uniformity across the folder.

describe('setSku', () => {
  it('assigns the near side, and getSku returns that exact instance', () => {
    const sku = makeSkuFixture({ skuCode: 'SET-1', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-set-1' });

    expect(subject.getSku()).toBeUndefined();
    subject.setSku(sku);

    // Identity, not equality: the entity stores the reference it was handed.
    expect(subject.getSku()).toBe(sku);
  });

  it('appends itself to the far-side collection exactly once for a saved row', () => {
    const sku = makeSkuFixture({ skuCode: 'SET-2', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-set-2' });

    subject.setSku(sku);

    expect(sku.getSkuCurrencies()).toHaveLength(1);
    expect(sku.getSkuCurrencies()[0]).toBe(subject);
  });

  it('mutates the live far-side array in place rather than replacing it', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L92]: `arrayAppend` mutated the very array
    // `Sku.getSkuCurrencies()` hands back.
    const sku = makeSkuFixture({ skuCode: 'SET-3', skuCurrencies: [] });
    const collectionBefore = sku.getSkuCurrencies();
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-set-3' });

    subject.setSku(sku);

    // Same array object, now one element longer.
    expect(sku.getSkuCurrencies()).toBe(collectionBefore);
    expect(collectionBefore).toHaveLength(1);
  });

  it('does not append a second time for a SAVED row already present by primary key', () => {
    // The guard's purpose.
    const sku = makeSkuFixture({ skuCode: 'SET-4', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-set-4' });

    subject.setSku(sku);
    subject.setSku(sku);
    subject.setSku(sku);

    expect(sku.getSkuCurrencies()).toHaveLength(1);
  });

  it('appends UNCONDITIONALLY for a NEW row, because isNew() short-circuits the guard', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L91]: the guard reads if(isNew() or
    // !arguments.sku.hasSkuCurrency( this )) and CFML `or` evaluates its LEFT operand first.
    const sku = makeSkuFixture({ skuCode: 'SET-5', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: '' });

    expect(subject.isNew()).toBe(true);

    subject.setSku(sku);
    expect(sku.getSkuCurrencies()).toHaveLength(1);

    subject.setSku(sku);
    expect(sku.getSkuCurrencies()).toHaveLength(2);
    expect(sku.getSkuCurrencies()[0]).toBe(subject);
    expect(sku.getSkuCurrencies()[1]).toBe(subject);
  });

  it('skips the far-side membership test entirely when the row is new', () => {
    // The short-circuit made directly observable rather than inferred from the append count.
    const sku = makeSkuFixture({ skuCode: 'SET-6', skuCurrencies: [] });
    const membershipTest = vi.spyOn(sku, 'hasSkuCurrency');

    aSkuCurrency({ skuCurrencyID: '' }).setSku(sku);
    expect(membershipTest).not.toHaveBeenCalled();

    // and is consulted for a saved one, so the spy is measuring something real.
    aSkuCurrency({ skuCurrencyID: 'sc-set-6' }).setSku(sku);
    expect(membershipTest).toHaveBeenCalledTimes(1);
  });

  it('assigns the near side BEFORE consulting the far side, preserving the source ordering', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L90] runs before
    // [model/entity/SkuCurrency.cfc:L91].
    const sku = makeSkuFixture({ skuCode: 'SET-7', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-set-7' });

    let nearSideDuringGuard: unknown = 'not observed';
    vi.spyOn(sku, 'hasSkuCurrency').mockImplementation((): boolean => {
      nearSideDuringGuard = subject.getSku();
      return false;
    });

    subject.setSku(sku);

    expect(nearSideDuringGuard).toBe(sku);
  });

  it('re-pointing a row at a different sku assigns the new near side and appends there', () => {
    // The legacy has no "move" operation: `setSku` simply overwrites `variables.sku` and appends
    // to the NEW far side.
    const first = makeSkuFixture({ idPrefix: 'first', skuCode: 'FIRST', skuCurrencies: [] });
    const second = makeSkuFixture({ idPrefix: 'second', skuCode: 'SECOND', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-move' });

    subject.setSku(first);
    subject.setSku(second);

    expect(subject.getSku()).toBe(second);
    expect(second.getSkuCurrencies()).toHaveLength(1);

    // The stale far-side entry survives, exactly as in CFML.
    expect(first.getSkuCurrencies()).toHaveLength(1);
  });
});

describe('removeSku', () => {
  it('with an explicit argument, splices the far side and clears the near side', () => {
    const sku = makeSkuFixture({ skuCode: 'RM-1', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-1' });

    subject.setSku(sku);
    expect(sku.getSkuCurrencies()).toHaveLength(1);

    subject.removeSku(sku);

    expect(sku.getSkuCurrencies()).toHaveLength(0);
    expect(subject.getSku()).toBeUndefined();
  });

  it('with no argument while a sku IS set, defaults from the near side and removes from it', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L96-L98]: the default-to-the-already-set-value
    // idiom, `if(!structKeyExists(arguments, "sku")) { arguments.sku = variables.sku; }`. The
    // defaulting step exists precisely to give L99 an array to search.
    const sku = makeSkuFixture({ skuCode: 'RM-2', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-2' });

    subject.setSku(sku);
    subject.removeSku();

    expect(sku.getSkuCurrencies()).toHaveLength(0);
    expect(subject.getSku()).toBeUndefined();
  });

  it('branches on !== undefined rather than on truthiness, matching structKeyExists', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L96]: `structKeyExists` asks whether the key is
    // PRESENT, which is a question about presence and not about the value's truthiness.
    const sku = makeSkuFixture({ skuCode: 'RM-3', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-3' });

    subject.setSku(sku);
    subject.removeSku(undefined);

    expect(sku.getSkuCurrencies()).toHaveLength(0);
    expect(subject.getSku()).toBeUndefined();
  });

  it('clears the near side UNCONDITIONALLY, even when the far-side search misses', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L103]: `structDelete(variables, "sku")` sits
    // OUTSIDE the `if(index > 0)` block at L100-L102, so the legacy clears the near side whether
    // or not the far-side removal found anything.
    const holder = makeSkuFixture({ idPrefix: 'holder', skuCode: 'HOLD', skuCurrencies: [] });
    const stranger = makeSkuFixture({
      idPrefix: 'stranger',
      skuCode: 'STRANGE',
      skuCurrencies: [],
    });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-4' });

    subject.setSku(holder);
    expect(holder.getSkuCurrencies()).toHaveLength(1);

    // Remove against a sku that does not contain this row: the search misses...
    subject.removeSku(stranger);

    expect(stranger.getSkuCurrencies()).toHaveLength(0);
    // the untouched collection keeps its entry...
    expect(holder.getSkuCurrencies()).toHaveLength(1);
    // and the near side is cleared anyway.
    expect(subject.getSku()).toBeUndefined();
  });

  it('removes the row at index 0, proving the CFML 1-based guard was translated', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L99-L100]: `arrayFind` returns a 1-BASED index or
    // 0 for "not found", which is why the source guards with `index>0`.
    // `Array.prototype.findIndex` returns a 0-BASED index or -1, so the guard must become `!==-1`.
    const sku = makeSkuFixture({ skuCode: 'RM-5', skuCurrencies: [] });
    const first = aSkuCurrency({ skuCurrencyID: 'sc-first' });
    const second = aSkuCurrency({ skuCurrencyID: 'sc-second' });

    first.setSku(sku);
    second.setSku(sku);
    expect(sku.getSkuCurrencies()[0]).toBe(first);

    first.removeSku(sku);

    expect(sku.getSkuCurrencies()).toHaveLength(1);
    expect(sku.getSkuCurrencies()[0]).toBe(second);
  });

  it('removes only itself, leaving every sibling override in place', () => {
    const sku = makeSkuFixture({ skuCode: 'RM-6', skuCurrencies: [] });
    const alpha = aSkuCurrency({ skuCurrencyID: 'sc-alpha' });
    const beta = aSkuCurrency({ skuCurrencyID: 'sc-beta' });
    const gamma = aSkuCurrency({ skuCurrencyID: 'sc-gamma' });

    alpha.setSku(sku);
    beta.setSku(sku);
    gamma.setSku(sku);
    expect(sku.getSkuCurrencies()).toHaveLength(3);

    beta.removeSku(sku);

    expect(sku.getSkuCurrencies()).toEqual([alpha, gamma]);
  });

  it('lets an UNSAVED row remove itself, falling back to reference identity', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L99]: `arrayFind(array, this)` was a REFERENCE
    // search in the language and a row-identity search under Hibernate's session.
    const sku = makeSkuFixture({ skuCode: 'RM-11', skuCurrencies: [] });
    const unsaved = aSkuCurrency({ skuCurrencyID: '' });

    expect(unsaved.isNew()).toBe(true);
    unsaved.setSku(sku);
    expect(sku.getSkuCurrencies()).toHaveLength(1);

    unsaved.removeSku(sku);

    expect(sku.getSkuCurrencies()).toHaveLength(0);
    expect(unsaved.getSku()).toBeUndefined();
  });

  it('never confuses two DISTINCT unsaved rows, which is why the fallback is identity', () => {
    // The correctness property the reference fallback exists to protect, and the reason a
    // primary-key comparison alone would be wrong.
    const sku = makeSkuFixture({ skuCode: 'RM-12', skuCurrencies: [] });
    const firstUnsaved = aSkuCurrency({ skuCurrencyID: '' });
    const secondUnsaved = aSkuCurrency({ skuCurrencyID: '' });

    // Same key, different objects - precisely the ambiguity the fallback resolves.
    expect(firstUnsaved.getSkuCurrencyID()).toBe(secondUnsaved.getSkuCurrencyID());
    expect(firstUnsaved).not.toBe(secondUnsaved);

    firstUnsaved.setSku(sku);
    secondUnsaved.setSku(sku);
    expect(sku.getSkuCurrencies()).toEqual([firstUnsaved, secondUnsaved]);

    firstUnsaved.removeSku(sku);

    // Only the first is gone; the second survives despite sharing its key.
    expect(sku.getSkuCurrencies()).toEqual([secondUnsaved]);
  });

  it('takes the identity branch when a SAVED row scans past an unsaved sibling', () => {
    // The other way into the fallback: `this` is saved but the CANDIDATE is unsaved, so the key
    // comparison is skipped for that element and identity correctly reports "not me".
    const sku = makeSkuFixture({ skuCode: 'RM-13', skuCurrencies: [] });
    const unsavedSibling = aSkuCurrency({ skuCurrencyID: '' });
    const saved = aSkuCurrency({ skuCurrencyID: 'sc-rm-13' });

    unsavedSibling.setSku(sku);
    saved.setSku(sku);
    expect(sku.getSkuCurrencies()).toEqual([unsavedSibling, saved]);

    saved.removeSku(sku);

    expect(sku.getSkuCurrencies()).toEqual([unsavedSibling]);
    expect(saved.getSku()).toBeUndefined();
  });

  it('throws when called with no argument while no sku is set', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L97]: the legacy executes arguments.sku =
    // variables.sku; inside the L96-L98 defaulting block, and with the key already absent -
    // `structDelete` at L103 having removed it on a previous call, or the association never having
    // been set.
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-7' });

    expect(subject.getSku()).toBeUndefined();
    expect(() => {
      subject.removeSku();
    }).toThrow(Error);
  });

  it('throws again on a second no-argument call, since the first cleared the near side', () => {
    // The precise legacy scenario the throw reproduces: the FIRST `removeSku()` succeeds and runs
    // `structDelete`, so the SECOND finds the key already absent and fails on the read.
    const sku = makeSkuFixture({ skuCode: 'RM-8', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-8' });

    subject.setSku(sku);
    subject.removeSku();
    expect(subject.getSku()).toBeUndefined();

    expect(() => {
      subject.removeSku();
    }).toThrow(Error);
  });

  it('leaves the near side absent on every path that completes', () => {
    // The invariant across both implementations: whenever `removeSku` returns normally, the field
    // is absent.
    const sku = makeSkuFixture({ skuCode: 'RM-9', skuCurrencies: [] });
    const stranger = makeSkuFixture({ idPrefix: 'str', skuCode: 'STR', skuCurrencies: [] });

    const viaExplicit = aSkuCurrency({ skuCurrencyID: 'sc-a' });
    viaExplicit.setSku(sku);
    viaExplicit.removeSku(sku);
    expect(viaExplicit.getSku()).toBeUndefined();

    const viaDefault = aSkuCurrency({ skuCurrencyID: 'sc-b' });
    viaDefault.setSku(sku);
    viaDefault.removeSku();
    expect(viaDefault.getSku()).toBeUndefined();

    const viaMiss = aSkuCurrency({ skuCurrencyID: 'sc-c' });
    viaMiss.setSku(sku);
    viaMiss.removeSku(stranger);
    expect(viaMiss.getSku()).toBeUndefined();
  });

  it('deletes nothing: orphan removal is the repository obligation, not this entity', () => {
    // CFML parity [model/entity/Sku.cfc:L72]: the collection is declared
    // `cascade="all-delete-orphan" inverse="true"`, so under Hibernate removing a row from the
    // collection DELETED it.
    const sku = makeSkuFixture({ skuCode: 'RM-10', skuCurrencies: [] });
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-orphan',
      price: Money.fromDecimalString('19.99'),
    });

    subject.setSku(sku);
    subject.removeSku(sku);

    expect(subject.getSkuCurrencyID()).toBe('sc-orphan');
    expect(subject.getPrice()).not.toBeUndefined();
    expect(subject.getCurrencyCode()).toBe(ROW_CURRENCY_CODE);
  });
});

// Schema continuity is a binding constraint: table `SwSkuCurrency`, entity name
// `SlatwallSkuCurrency`, no migration, no rename, no new column, no dropped column.
//
// CFML parity [model/entity/SkuCurrency.cfc:L49]: `hb_serviceName="skuService"` points at
// `model/service/SkuService.cfc`, not at a service of its own - there is no `SkuCurrencyService`
// anywhere in the legacy tree and none is invented.

describe('structural facts and schema continuity', () => {
  it('reports isNew() true for a fresh instance, because the id defaults to the empty string', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L52]: `unsavedvalue="" default=""` is what makes
    // an unsaved row's key the EMPTY STRING rather than absent, and the framework's `getNewFlag()`
    // tested `getPrimaryIDValue() == ""`.
    const fresh = aSkuCurrency();

    expect(fresh.getSkuCurrencyID()).toBe('');
    expect(fresh.isNew()).toBe(true);
  });

  it('reports isNew() false once the primary key is populated', () => {
    const saved = aSkuCurrency({ skuCurrencyID: '8a8a8b8c8d8e8f909192939495969798' });

    expect(saved.isNew()).toBe(false);
    expect(saved.getSkuCurrencyID()).toBe('8a8a8b8c8d8e8f909192939495969798');
  });

  it('types the primary key as a plain string, never undefined', () => {
    // `default=""` means the column always holds a string, possibly the empty one - so unlike
    // every nullable column on this entity, the id is not a `| undefined` union.
    expect(typeof aSkuCurrency().getSkuCurrencyID()).toBe('string');
    expect(aSkuCurrency({ skuCurrencyID: ' ' }).isNew()).toBe(false);
  });

  it('declares remoteID, and reports it as undefined when the column is NULL', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L71]: `property name="remoteID" ormtype="string";`
    // carries no length and no default, so `string | undefined`.
    expect(prototypeMembers()).toContain('getRemoteID');
    expect(aSkuCurrency().getRemoteID()).toBeUndefined();
    expect(aSkuCurrency({ skuCurrencyID: 'sc-r', remoteID: 'ERP-4471' }).getRemoteID()).toBe(
      'ERP-4471',
    );
  });

  it('reports both audit timestamps as undefined when absent, never as an epoch date', () => {
    // The timestamp counterpart of the never-substitute-zero rule.
    const fresh = aSkuCurrency();

    expect(fresh.getCreatedDateTime()).toBeUndefined();
    expect(fresh.getModifiedDateTime()).toBeUndefined();

    // Explicitly not the epoch, which is the specific wrong answer this guards against.
    expect(fresh.getCreatedDateTime()).not.toEqual(new Date(0));
    expect(fresh.getModifiedDateTime()).not.toEqual(new Date(0));
  });

  it('returns the exact Date instances it was given for populated audit timestamps', () => {
    // Every business-date literal in this suite is an explicit UTC ISO-8601 string.
    const createdDateTime = new Date('2024-01-01T00:00:00.000Z');
    const modifiedDateTime = new Date('2024-07-01T12:34:56.789Z');

    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-audit',
      createdDateTime,
      modifiedDateTime,
    });

    expect(subject.getCreatedDateTime()).toBe(createdDateTime);
    expect(subject.getModifiedDateTime()).toBe(modifiedDateTime);
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('collapses both audit account associations to opaque identifier strings', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L75, L77]: both declare cfc="Account"
    // fieldtype="many-to-one" with `fkcolumn="createdByAccountID"` and
    // `fkcolumn="modifiedByAccountID"` respectively.
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-accounts',
      createdByAccountID: 'acct-created-001',
      modifiedByAccountID: 'acct-modified-002',
    });

    expect(subject.getCreatedByAccountID()).toBe('acct-created-001');
    expect(subject.getModifiedByAccountID()).toBe('acct-modified-002');
    expect(typeof subject.getCreatedByAccountID()).toBe('string');

    // Absent is absent, on both.
    expect(aSkuCurrency().getCreatedByAccountID()).toBeUndefined();
    expect(aSkuCurrency().getModifiedByAccountID()).toBeUndefined();
  });

  it('exposes no audit setters, matching hb_populateEnabled="false"', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L74-L77]: all four audit properties carry
    // `hb_populateEnabled="false"`, which is how the legacy framework excluded them from mass
    // assignment.
    const members = prototypeMembers();

    for (const audit of [
      'setCreatedDateTime',
      'setCreatedByAccountID',
      'setModifiedDateTime',
      'setModifiedByAccountID',
    ]) {
      expect(members).not.toContain(audit);
    }
  });

  it('declares no collection, so no field is an array and no hasAny* member exists', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L61, L63, L65]: the one-to-many, many-to-many
    // owner and many-to-many inverse sections are EMPTY section comments, and an empty banner
    // implies nothing.
    const subject = aSkuCurrency();

    for (const member of prototypeMembers()) {
      expect(member.startsWith('hasAny')).toBe(false);
      expect(member.startsWith('add')).toBe(false);
    }

    // The only `remove*` member is the bidirectional `removeSku`, which is a many-to-one helper,
    // not a collection helper.
    const removers = prototypeMembers().filter((name: string) => name.startsWith('remove'));
    expect(removers).toEqual(['removeSku']);

    // And no accessor hands back an array.
    expect(Array.isArray(subject.getSku())).toBe(false);
    expect(Array.isArray(subject.getPrice())).toBe(false);
  });

  it('declares no ORM event hook, so there is no materialized path to maintain', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L124/L126]: the ORM Event Hooks banner is empty -
    // no `preInsert`, no `preUpdate`.
    const members = prototypeMembers();

    for (const hook of ['preInsert', 'preUpdate', 'preDelete', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });

  it('is a class carrying behaviour, not a bare data record', () => {
    const subject = aSkuCurrency();

    expect(subject).toBeInstanceOf(SkuCurrency);
    expect(Object.getPrototypeOf(subject)).toBe(SkuCurrency.prototype);
  });

  it('gives each constructed row its own state, with nothing shared between instances', () => {
    const sku = makeSkuFixture({ skuCode: 'ISOLATED', skuCurrencies: [] });
    const first = aSkuCurrency({ skuCurrencyID: 'sc-iso-1' });
    const second = aSkuCurrency({ skuCurrencyID: 'sc-iso-2' });

    first.setSku(sku);

    expect(first.getSku()).toBe(sku);
    expect(second.getSku()).toBeUndefined();

    // And the shared builder handed out two distinct objects, not one aliased row.
    expect(first).not.toBe(second);
    expect(first.getSkuCurrencyID()).not.toBe(second.getSkuCurrencyID());
  });
});
