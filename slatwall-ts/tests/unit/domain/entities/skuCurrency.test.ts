// --------------------------------------------------------------------------
// slatwall-ts - unit suite for `src/domain/entities/skuCurrency.ts`
//
// One `SwSkuCurrency` row: a per-currency price override for a single SKU. An IMPLICIT-SCOPE
// entity, pulled in because the slice cannot work without it, which makes it the KEYSTONE OF THE
// CURRENCY CASCADE - the third complexity hotspot - out of all proportion to its 131 lines.
//
// The cascade's Step 2 [model/entity/Sku.cfc:L399-L414] reads SIX members, so every one sits on a
// live must-preserve path. Verified line by line against the source:
//
//   [model/entity/Sku.cfc:L400]  getCurrencyCode()   the override match key, CFML `eq`
//   [model/entity/Sku.cfc:L401]  getRenewalPrice()   inside `!isNull(...)`   <- GUARDED
//   [model/entity/Sku.cfc:L405]  getListPrice()      inside `!isNull(...)`   <- GUARDED
//   [model/entity/Sku.cfc:L409]  getPrice()          written UNCONDITIONALLY <- NO GUARD
//   [model/entity/Sku.cfc:L412]  getSkuCurrencyID()  records the override's source row
//   [model/entity/Sku.cfc:L403, L407, L410]  getFormattedValue(...) - a FRAMEWORK member,
//                                deliberately not ported, so deliberately not tested here.
//
// THE MOST VALUABLE THING THIS FILE CARRIES is the explanation of that guard asymmetry. It is
// entailed by `model/validation/SkuCurrency.json`, and the suite proves the entailment rather than
// restating it - see the `validation schema` block.
//
// --- Traceability: net-new overall, with one real legacy case routed through it -----
//
//   1. THE SUITE AS A WHOLE IS NET-NEW. `SkuCurrency` has NO legacy entity test. The only two
//      legacy entity suites extended anywhere in this port are
//      [meta/tests/unit/entity/BrandTest.cfc] and [meta/tests/unit/entity/ProductTest.cfc],
//      neither of which mentions it, and
//      [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub contributing zero
//      coverage, acknowledged rather than counted.
//
//   2. ONE CASE IS GENUINE LEGACY LINEAGE, AND FULLY PORTABLE. `issue_1335` traces to
//      [meta/tests/unit/IssuesTest.cfc:L110-L124] and carries FOUR REAL ASSERTIONS, keeping its
//      legacy name under that file's `issue_<ticket#>` convention so the two can be diffed.
//
// The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed every legacy
// entity suite are NOT inherited, and NO SHARED BASE CLASS imitates them. Three rest on framework
// members this port does not ship: `validate_as_save_for_a_new_instance_doesnt_pass` [L51-L54]
// needs `validate`/`hasErrors`, `has_primary_id_property_name` [L60-L62] needs
// `getPrimaryIDPropertyName`, and `simple_representation_exists_and_is_simple` [L56-L58] PROVABLY
// DOES NOT HOLD here in CFML - see `getSimpleRepresentation`. Only the `isNew()` half of
// `defaults_are_correct` [L64-L67] survives, authored below net-new.
//
// --- Hard boundary: the cascade itself is not tested here -------------------
//
// This suite proves what a `SwSkuCurrency` row CAN AND CANNOT REPRESENT - the schema-level fact the
// cascade's shape depends on. It does not exercise the cascade. Out of bounds here:
//
//   * The four-step cascade and its memo [model/entity/Sku.cfc:L367-L433], including the
//     `skuEligibleCurrencies` eligibility gate at [model/entity/Sku.cfc:L373] that leaves the
//     map empty - `tests/unit/domain/entities/sku.test.ts`.
//   * The three currency accessors and their null returns [model/entity/Sku.cfc:L269-L285].
//   * The case-insensitivity obligation at [model/entity/Sku.cfc:L400]. CFML `eq` ignores case
//     and TypeScript `===` does not, so the comparison must route through
//     `currencyCodeEquals`. That duty is the CALLER's; this row only reports the code it
//     carries.
//   * `getFormattedValue` and money PRESENTATION - `src/lib/cfml/numberFormat.ts`.
//   * Requiredness ENFORCEMENT. `model/validation/SkuCurrency.json` is honoured at the SERVICE
//     tier by the ported zod schema, in a named save context, exactly where the legacy
//     framework enforced it. The tier boundary is documented in `issue_1335`.
//   * Orphan deletion. `cascade="all-delete-orphan"` on [model/entity/Sku.cfc:L72] is the
//     repository's obligation; `removeSku` clears a reference and deletes nothing.
//
// --- A stale claim, corrected against the shipped source --------------------
//
// This entity's in-memory far-side symmetry IS reproduced, not dropped.
// `src/domain/entities/skuCurrency.ts` says so in terms, and both the `isNew()` guard and the
// `isSameRowAs` identity helper the far-side maintenance needs are shipped. So this suite pins the
// SHIPPED behaviour, measured rather than assumed - see `setSku`. SOURCE WINS.
//
// --- Markers: zero preserved defects and zero divergences, and both are findings -----
//
// ---------------------------------------------------------------------------
// MARKERS - ZERO PRESERVED DEFECTS, ZERO DIVERGENCES, AND BOTH ARE FINDINGS
// ---------------------------------------------------------------------------
// NO `LEGACY-DEFECT` MARKER APPEARS ANYWHERE BELOW, and none is invented to look
// thorough. The migration's register carries thirty numbered defects and NOT ONE of them is
// in this entity. That is a positive finding, and the two checks that produced it were run
// against the verbatim source rather than assumed, because both failure modes are real
// elsewhere in this tree:
//
//   1. THE "remove-that-ADDs" INVERSION CHECK. Some Slatwall `remove*` helpers ADD - e.g.
//      [model/entity/Option.cfc:L129-L131]. VERDICT HERE: CLEAN. L101 is `arrayDeleteAt`, L103
//      is a `structDelete`, and no `add*` call sits on any path.
//   2. THE LEAKED-ARGUMENT CHECK. VERDICT HERE: CLEAN. L99's `arrayFind` and L101's
//      `arrayDeleteAt` both dereference the SAME, correctly declared `arguments.sku`. Contrast
//      [model/entity/PromotionPeriod.cfc:L110] and [model/entity/PromotionAccount.cfc:L103],
//      which both leak an undeclared `arguments.account`. This entity is one of the controls
//      proving those are copy-paste errors rather than a CFML idiom.
//
// Had either check found a defect it would have been PRESERVED under the two-line marker form and
// never repaired. Neither did, so the annotations here are `CFML parity` and `JUDGMENT CALL`; the
// three project-wide divergences are owned elsewhere.
//
// --- The import set, and the one place it departs from the sketch it was given -----
//
// Five specifiers, every one narrow, named and ending in `.js` because resolution is `NodeNext`
// with no `paths` and no `allowImportingTsExtensions`. FOUR levels up reaches `src/`, THREE reaches
// `tests/fixtures/`; three would resolve to a nonexistent `tests/src/...`. No barrel file is
// imported and none exists to import.
//
// JUDGMENT CALL: `CurrencyCode` is deliberately NOT imported. The brand is a COMPILE-TIME construct
// over `string`, so the type is never named in an annotation below - every code value comes from
// `toCurrencyCode`, the runtime symbol actually needed. An unused type binding would trip
// `noUnusedLocals`, active over `tests/**`, so the suite would not compile.
//
// `makeSkuFixture` is required rather than convenient: `Sku` carries private fields, so it is
// nominally typed and a hand-written structural double is not assignable to `setSku(sku: Sku)`.
// --------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkuCurrency } from '../../../../src/domain/entities/skuCurrency.js';
import { toCurrencyCode } from '../../../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

// --------------------------------------------------------------------------
// Local test infrastructure
//
// NO SHARED BASE CLASS, NO `setUp`/`tearDown` COMPONENT PATTERN, NO `assertEquals` SHIM AND NO
// `Helper` PORT. The legacy assertions are carried; the MXUnit harness is not.
// [meta/tests/unit/SlatwallUnitTestBase.cfc] is the explicit anti-pattern - it instantiates
// `Slatwall.Application`, bootstraps the ORM and the DI container, elevates a superuser and has its
// teardown commented out - and nothing here emulates it.
// --------------------------------------------------------------------------

/**
 * The constructor's init shape, DERIVED rather than restated.
 *
 * `src/domain/entities/skuCurrency.ts` declares the init object INLINE and exports only the class,
 * so there is no init type to import. `ConstructorParameters` keeps this suite honest: if a column
 * is added, removed or retyped upstream, the builders below stop compiling instead of drifting
 * silently.
 */
type SkuCurrencyInit = ConstructorParameters<typeof SkuCurrency>[0];

/**
 * The currency code every generic subject carries.
 *
 * JUDGMENT CALL: deliberately NOT the platform's default code. The `skuCurrency` setting declares a
 * three-letter `defaultValue` exactly once, at [model/service/SettingService.cfc:L221], and
 * `src/domain/entities/skuCurrency.ts` deliberately keeps that literal out of itself so there is
 * only one source of truth. An arbitrary non-default code is used here, and picking the default
 * would have implied, falsely, that this entity knows about it. Only the casing tests depend on
 * which code it is, and they name their own.
 */
const ROW_CURRENCY_CODE = 'EUR';

/**
 * The columns of an UNSAVED row, all eleven slots explicit.
 *
 * A FUNCTION, never a shared literal, so every subject is built fresh and no test can reach another
 * test's data.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L52]: `skuCurrencyID` starts `''` rather than absent,
 * because `unsavedvalue="" default=""` makes the empty string the honest answer for a row that has
 * never been saved - and it is what `isNew()` keys on.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L53, L54, L55]: all three monetary slots start
 * `undefined`, NOT `0`. The ORM `default="0"` on L54/L55 binds at INSERT time and says nothing
 * about a row read back from the schema; `price` on L53 has no default at all. Seeding `0` would
 * fabricate the very value this suite exists to keep distinguishable from absence.
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
 * @param overrides - the columns this test is about; everything else stays at the unsaved
 *   default.
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
  // A2: the far-side spies used to prove the `setSku` short-circuit must not outlive their test.
  vi.restoreAllMocks();
});

// --- B7: the ported surface -------------------------------------------------

/**
 * The fifteen public members the port ships, sorted.
 *
 * CFML parity [model/entity/SkuCurrency.cfc]: THE BEHAVIOURAL SURFACE IS EXACTLY THREE METHODS -
 * `setSku` [L89-L94], `removeSku` [L95-L104] and `getSimpleRepresentation` [L118-L120]. The rest
 * are accessors ColdFusion generated from the property metadata, because [L49] carries
 * `accessors="true"`. There is no fourth behavioural method: five of the seven banner sections are
 * COMPLETELY EMPTY (L82/L84, L108/L110, L112/L114, L124/L126, L128/L130), and an empty banner
 * implies nothing.
 *
 * `isNew` is listed rather than treated as framework residue because
 * [model/entity/SkuCurrency.cfc:L91] CONCRETELY CALLS IT inside `setSku`'s guard. The framework
 * base defined it as `getPrimaryIDValue() == ""`; the base is not ported, so that one line is
 * restated on the class.
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
 * Members that must NOT exist, each with the reason it is absent.
 *
 *   `setCurrencyCode`  [model/entity/SkuCurrency.cfc:L68] declares `insert="false"` and
 *                      `update="false"`, making the column unwritable by construction.
 *   `setPrice`,        The legacy component declares NO setter for any monetary column;
 *   `setListPrice`,    CFML's `accessors="true"` generated them, the port does not, and values
 *   `setRenewalPrice`  arrive through the constructor. Load-bearing for `issue_1335`.
 *   `getSkuID`         `fkcolumn="skuID"` on [L59] is an ATTRIBUTE OF THE ASSOCIATION, not a
 *                      declared property, so CFML never generated an accessor for it.
 *   `getCurrency`      `model/entity/Currency.cfc` is out of scope; the association collapses
 *                      to the projected code, and no `Currency` class exists.
 *   `getFormattedValue` A framework member driven by `hb_formatType="currency"`. Money
 *                      PRESENTATION belongs to `src/lib/cfml/numberFormat.ts`.
 *   `validate`,        Validation is declarative in `model/validation/SkuCurrency.json` and
 *   `hasError`,        ENFORCED at the service tier - never on the entity. This is the tier
 *   `getError`,        boundary `issue_1335` documents.
 *   `hasErrors`
 *   `getPrimaryIDPropertyName`, `getPrimaryIDValue`, `getNewFlag`, `clearAttributeCache`
 *                      Framework base members. No base class is ported; `isNew()` is restated
 *                      on the class instead.
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
    // `isSameRowAs` is `private` in TypeScript, which is a COMPILE-TIME visibility rule rather than
    // a runtime one, so it is on the prototype and has to be accounted for. It is listed separately
    // because it is NOT part of the interface-parity contract: it is the port's own primary-key
    // comparison, standing in for the CFML object-reference `arrayFind` at
    // [model/entity/SkuCurrency.cfc:L99].
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE, 'isSameRowAs'].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(15);
  });

  it('exposes exactly three behavioural methods; every other member is a generated accessor', () => {
    const subject = aSkuCurrency();
    const behavioural: readonly string[] = ['setSku', 'removeSku', 'getSimpleRepresentation'];

    for (const name of behavioural) {
      expect(typeof Reflect.get(subject, name)).toBe('function');
    }

    // Everything else on the public surface is either a generated accessor or the restated `isNew`.
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
    // called a method ...() which does not exists in the ... entity." `SkuCurrency` declares NO
    // `attributeValues` - only four in-scope entities do, and this is not one of them - so it took
    // the THROWING branch.
    const subject = aSkuCurrency();

    expect('getSomeUndeclaredAttribute' in subject).toBe(false);
    expect(Reflect.get(subject, 'getSomeUndeclaredAttribute')).toBeUndefined();

    // Not a Proxy: a Proxy-backed object would report an own key for an arbitrary probe.
    expect(Object.getOwnPropertyNames(subject)).not.toContain('getSomeUndeclaredAttribute');
  });
});

// --- B1: the three monetary columns - `Money | undefined`, never `0` --------
//
// CFML parity [model/entity/SkuCurrency.cfc:L53, L54, L55]: `price` declares NO default while
// `listPrice` and `renewalPrice` both declare `default="0"`. In CFML ORM a `default` applies on
// entityNew, NOT as a DB DEFAULT constraint. All three are `Money | undefined` in the target;
// substituting 0 for a missing price would silently sell products for free.
//
// CFML parity [model/entity/SkuCurrency.cfc:L53, L54, L55]: all three `hb_rbKey` values point at
// `entity.sku.*` - `entity.sku.price`, `entity.sku.renewalPrice`, `entity.sku.listPrice` - NOT at
// `entity.skuCurrency.*`. The keys are BORROWED FROM Sku and preserved only as inert string
// constants: JavaRB is not ported and no i18n runtime is introduced.

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

      // `toBeUndefined`, NOT `toBeFalsy`.
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
    // The same conflation is possible on the two columns that DO carry `default="0"`, and it
    // matters more there, not less: because the ORM default makes zero look like the natural
    // resting value, a port is most tempted to fabricate it on exactly these two.
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
    // JUDGMENT CALL: INSTANCE IDENTITY is asserted rather than a rendered string, and that is the
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

    // Presentation to two decimals is available, but it is the CALLER's choice and never applied by
    // the entity.
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
    // Cascade Step 2 depends on exactly this. [model/entity/Sku.cfc:L401] and
    // [model/entity/Sku.cfc:L405] each guard their own column with `!isNull(...)` before writing
    // it, while [model/entity/Sku.cfc:L409] writes `price` unguarded - three separate decisions
    // about three separate columns.
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

// --- B2: `currencyCode` is a read-only projection of the foreign key --------
//
// CFML parity [model/entity/SkuCurrency.cfc:L68]: this property carries NO ormtype and NO length.
// The in-scope 3-character authority is [model/entity/PromotionApplied.cfc:L55], which declares
//   ormtype="string" length="3"
// and this locator does not. L68 reads, in full,
//   property name="currencyCode" insert="false" update="false";
// and CFML defaults an undeclared `ormtype` to string, so any assertion of `length="3"` at THIS
// locator would be fabricated.
//
// CFML parity [model/entity/SkuCurrency.cfc:L58, L68]: two source lines collapse into one field,
// exactly rather than conveniently. L58 declares
//   property name="currency" cfc="Currency" fieldtype="many-to-one" fkcolumn="currencyCode";
// so THE FOREIGN-KEY COLUMN IS `currencyCode` ITSELF, not a surrogate id - and L68 is that same
// column surfaced as a readable property. The association and its key are one column, which is what
// makes collapsing `getCurrency().getCurrencyCode()` to the projected code lossless.
// `model/entity/Currency.cfc` is out of scope and no `Currency` class exists.

describe('the currencyCode projection', () => {
  it('is exposed by a getter with no setter anywhere on the class', () => {
    // `insert="false" update="false"` is the legacy mechanism: the ORM maps the property onto the
    // foreign-key column FOR READING ONLY, so it can never take part in an insert or an update.
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
    // CFML parity [model/entity/Sku.cfc:L400]: CFML `eq` compares WITHOUT REGARD TO CASE but STORES
    // precisely what it was given, and both halves are reproduced across the port - storage
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

// --- B3: `issue_1335`, the one real legacy case this suite routes -----------

describe('issue_1335', () => {
  // LEGACY LINEAGE - [meta/tests/unit/IssuesTest.cfc:L110-L124], read verbatim:
  //
  //   public void function issue_1335() {
  //     var skuCurrency = entityNew("SlatwallSkuCurrency");          // L112
  //     skuCurrency.setPrice( -20 );                                 // L114
  //     skuCurrency.setListPrice( 'test' );                          // L115
  //     skuCurrency.validate(context="save");                        // L117
  //     assert( skuCurrency.hasError('price') );                     // L119
  //     assert( skuCurrency.hasError('listPrice') );                 // L120
  //     assert( right( skuCurrency.getError('price')[1], 8) neq "_missing");      // L122
  //     assert( right( skuCurrency.getError('listPrice')[1], 8) neq "_missing");  // L123
  //   }
  //
  // FULLY PORTABLE - FOUR REAL ASSERTIONS. The name is kept under the `issue_<ticket#>` convention
  // that file establishes so the two can be diffed directly.
  //
  // DECODING `_missing`, WHICH IS THE WHOLE POINT OF THE TICKET. `"_missing"` is exactly EIGHT
  // characters, so `right(errorKey, 8) neq "_missing"` is a SUFFIX TEST on the resource-bundle
  // error key the validator produced. L119/L120 already assert THAT the columns errored; L122/L123
  // assert WHICH error each raised: `-20` a MIN-VALUE violation (`minValue 0`), `'test'` a DATATYPE
  // violation (`dataType numeric`), and NEITHER a "required/missing" one, because both values were
  // SUPPLIED. The bug the ticket closed was the framework mis-reporting a supplied-but-invalid
  // value as an absent one, so the behaviour under test is the ABSENT-versus-PRESENT-BUT-INVALID
  // distinction - the same distinction this entire suite is built on.
  //
  // THE TIER BOUNDARY, STATED RATHER THAN WORKED AROUND. Validation ENFORCEMENT lives at the
  // SERVICE tier: `model/validation/SkuCurrency.json` is ported to a zod schema applied in a named
  // save context, exactly where the legacy framework applied it. The shipped entity therefore has
  // NO validation surface AT ALL and NO SETTERS either, so the legacy L114/L115 calls have no
  // direct counterpart. Both facts are asserted below rather than assumed.
  //
  // NO ENTITY-LEVEL VALIDATOR IS INVENTED to make the legacy assertions executable verbatim; that
  // would add a member the port deliberately lacks and move enforcement to the wrong tier. Each
  // legacy assertion is instead mapped to the SCHEMA SEMANTICS this tier owns: a negative price and
  // a non-numeric list price are each REPRESENTABLE-OR-REJECTED in a way that is DISTINGUISHABLE
  // FROM ABSENCE. If this entity could not tell those states apart, no service-tier schema could.

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
    // Made explicit so the decoding is auditable rather than asserted in prose. `right(x, 8)` takes
    // the last eight characters, and the literal it is compared against is exactly eight characters
    // long - which is what makes L122 and L123 suffix tests.
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

    // L122 `right( getError('price')[1], 8) neq "_missing"` - the violation is NOT a
    // missing/required one, and the reason is observable right here: the value is PRESENT.
    expect(price).not.toBeUndefined();
    expect(aSkuCurrency().getPrice()).toBeUndefined();

    // So the two states cannot be confused: supplied-but-below-minimum, versus absent.
    expect(subject.getPrice()).not.toBe(aSkuCurrency().getPrice());
  });

  it('legacy L120 + L123: a non-numeric listPrice is a DATATYPE violation, never a missing one', () => {
    // L115's `setListPrice( 'test' )` supplies a value that is not a number at all.
    expect(() => Money.fromDecimalString('test')).toThrow();

    // The violation is therefore a DATATYPE one and demonstrably not a missing one, because absence
    // is a DIFFERENT and separately reachable state on the same column.
    const absent = aSkuCurrency({ skuCurrencyID: 'sc-1335-absent' });
    expect(absent.getListPrice()).toBeUndefined();

    // And a well-formed value on that same column is accepted, which is what proves the rejection
    // above was about the DATA TYPE and not about the column being unwritable.
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
    // The legacy body sets BOTH columns on ONE instance before validating, so the two errors are
    // raised together.
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-1335-both',
      price: Money.fromDecimalString('-20'),
    });

    const price = subject.getPrice();

    // price: supplied, below the minimum - a min-value violation, not a missing one.
    expect(price).not.toBeUndefined();
    expect(price === undefined ? false : price.isLessThan(Money.zero)).toBe(true);

    // listPrice: `'test'` never becomes a value, so the column stays absent on this row while the
    // malformed input is refused at the boundary. Absence here is the honest observable, and it is
    // NOT the same fact as the datatype rejection - the assertion pair keeps them distinct exactly
    // as L120 and L123 together require.
    expect(subject.getListPrice()).toBeUndefined();
    expect(() => Money.fromDecimalString('test')).toThrow();

    // renewalPrice was never touched by the ticket and must stay absent, proving the two failures
    // did not bleed into a third column.
    expect(subject.getRenewalPrice()).toBeUndefined();
  });
});

// --- B4: the validation schema, and the guard asymmetry it entails --------------
//
// `model/validation/SkuCurrency.json`, verbatim and complete - EXACTLY THREE PROPERTIES:
//
//   "price":        [{"contexts":"save","required":true,"dataType":"numeric","minValue":0}]
//   "listPrice":    [{"contexts":"save","dataType":"numeric","minValue":0}]    <-- NOT required
//   "renewalPrice": [{"contexts":"save","dataType":"numeric","minValue":0}]    <-- NOT required
//
// There is NO delete-context gate, no `"method"` entry invoking a custom validator, and no fourth
// property.
//
// CFML parity [model/validation/SkuCurrency.json]: THIS IS THE FILE THE AGENT ACTION PLAN OMITTED.
// AAP 0.2.1 lists TWELVE present in-scope validation schemas; the count verified against disk is
// FIFTEEN present and SIX absent, and the three the plan missed are `SkuCurrency.json`,
// `OptionGroup.json` and `RoundingRule.json`. `model/validation/` holds 96 `.json` files in total.
// Source wins over the plan.
//
// THE SIX-FILE NO-VALIDATION-FILE INVENTORY IS NOT EXPANDED. `Category`, `PromotionQualifier`,
// `PromotionApplied`, `PromotionAccount`, `Product_AddOption` and `Product_AddOptionGroup` have no
// validation file - all six verified absent, and all six must remain so. `SkuCurrency` is
// emphatically NOT among them.
//
// CFML parity [model/validation/SkuCurrency.json]: `price` is REQUIRED on save, so it is never NULL
// for a validly-saved row - which is exactly why the cascade assigns it UNGUARDED at
// [model/entity/Sku.cfc:L409]. listPrice/renewalPrice are validated but OPTIONAL, so they are
// legitimately NULL - which is why the cascade GUARDS them at [model/entity/Sku.cfc:L401, L405].
// The asymmetry is contract-justified, not accidental, which is why the entity types all three
// columns `Money | undefined` while the cascade treats one differently. The assertions below prove
// the entity can represent every state the schema permits.

describe('the validation schema and the cascade guard asymmetry it entails', () => {
  it('can represent a validly-saved row: price present, both optional columns NULL', () => {
    // The state a `save`-context-valid row minimally reaches. Reading such a row, cascade Step 2
    // finds a price it can write unconditionally [model/entity/Sku.cfc:L409] and two columns whose
    // `!isNull` guards [model/entity/Sku.cfc:L401, L405] both correctly decline to write.
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
    // [model/entity/Sku.cfc:L401] and [model/entity/Sku.cfc:L405] would be unreachable branches -
    // and a port would be entitled to drop them.
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-nullable' });

    expect(subject.getListPrice()).toBeUndefined();
    expect(subject.getRenewalPrice()).toBeUndefined();
  });

  it('does NOT narrow price to a required Money on the strength of the save-context rule', () => {
    // THE SCHEMA/COLUMN TENSION IS DOCUMENTED, NOT RESOLVED, and this assertion is where that
    // decision becomes checkable. Two statements are simultaneously true and BOTH are preserved:
    // the SAVE-CONTEXT schema requires a price, while the ORM COLUMN at
    // [model/entity/SkuCurrency.cfc:L53] tolerates NULL and declares no default.
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

// --- B5: `getSimpleRepresentation()` ----------------------------------------
//
// The legacy body is one line, [model/entity/SkuCurrency.cfc:L118-L120]:
//   return getSku().getSkuCode() & " - " & getCurrency().getCurrencyCode();
//
// CFML parity [model/entity/SkuCurrency.cfc:L118-L120]: the legacy body dereferences both nullable
// sku and currency and therefore throws on a new instance. The shipped module prefers a guard
// returning '' for a missing SKU code. Asserting shipped reality, not the legacy throw.
//
// WHY THE GENERIC INHERITED CASE IS NOT FORCED.
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58] handed every legacy entity suite
// `simple_representation_exists_and_is_simple`, whose body is
//   assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
// against a NEW instance. For this entity that case CANNOT PASS IN CFML: `entityNew` leaves both
// `sku` and `currency` null, so L119 dereferences null twice and raises before `isSimpleValue` is
// reached. The inherited case is therefore not carried forward, and not quietly rewritten into
// something that passes. What IS asserted is the shipped behaviour.
//
// The guard is a JUDGMENT CALL made in the entity: CFML's implicit lazy load made the null case
// unreachable in practice, so there is no legacy behaviour to preserve - only a hole the ORM used
// to fill; making a DISPLAY HELPER fail a request is a poor trade; and A LABEL IS NOT A PRICE.
// Substituting '' for a missing sku code is safe in a way substituting 0 for a price is not.

describe('getSimpleRepresentation', () => {
  it('joins the sku code and the currency code with exactly " - "', () => {
    // The separator is one space, one hyphen, one space, reproduced byte for byte from `& " - " &`.
    const sku = makeSkuFixture({ skuCode: 'NIKE-AIR', skuCurrencies: [] });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-label', sku });

    expect(subject.getSimpleRepresentation()).toBe('NIKE-AIR - EUR');

    // And the separator occurs exactly once for codes that contain no hyphen-space of their own, so
    // the join is unambiguous.
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
    // The consequence of the guard, stated plainly rather than hidden: the label CANNOT distinguish
    // "no sku" from "a sku whose code is the empty string".
    const noSku = aSkuCurrency({ skuCurrencyID: 'sc-no-sku' });
    const emptyCodeSku = makeSkuFixture({ skuCode: '', skuCurrencies: [] });
    const withEmptyCode = aSkuCurrency({ skuCurrencyID: 'sc-empty-code', sku: emptyCodeSku });

    // Indistinguishable through the label...
    expect(noSku.getSimpleRepresentation()).toBe(withEmptyCode.getSimpleRepresentation());

    // ...and perfectly distinguishable through the accessor.
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
    // CFML parity [model/entity/SkuCurrency.cfc:L119] versus [model/entity/Sku.cfc:L54]: the legacy
    // `getSku().getSkuCode()` has TWO holes and the shipped module guards BOTH. This covers the
    // second: a SKU that IS materialized but whose own `skuCode` column is null. That state is
    // reachable rather than hypothetical -
    //   property name="skuCode" ormtype="string" unique="true" length="50";
    // at [model/entity/Sku.cfc:L54] carries NO `notnull` and NO `default`, and `unique` in SQL
    // admits a NULL, so the legacy would have raised here too. Same ruling as the absent SKU: a
    // DISPLAY HELPER is the wrong thing to fail a request on, and A LABEL IS NOT A PRICE.
    const codelessSku = makeSkuFixture({ skuCode: undefined, skuCurrencies: [] });
    const subject = aSkuCurrency({
      skuCurrencyID: 'sc-codeless',
      sku: codelessSku,
      currencyCode: toCurrencyCode('CHF'),
    });

    // The sku IS present - this is emphatically not the unmaterialized case above.
    expect(subject.getSku()).toBe(codelessSku);
    expect(codelessSku.getSkuCode()).toBeUndefined();

    expect(subject.getSimpleRepresentation()).toBe(' - CHF');
  });

  it('renders the two holes IDENTICALLY, so only getSku() can tell them apart', () => {
    // The consequence of guarding both levels, stated as an assertion instead of left implicit: "no
    // sku at all" and "a sku with no code" collapse onto the SAME label.
    const noSku = aSkuCurrency({ skuCurrencyID: 'sc-hole-a', currencyCode: toCurrencyCode('CHF') });
    const codelessSku = makeSkuFixture({ skuCode: undefined, skuCurrencies: [] });
    const noCode = aSkuCurrency({
      skuCurrencyID: 'sc-hole-b',
      sku: codelessSku,
      currencyCode: toCurrencyCode('CHF'),
    });

    // Indistinguishable through the label ...
    expect(noSku.getSimpleRepresentation()).toBe(noCode.getSimpleRepresentation());

    // ... and cleanly distinguishable through `getSku()`, which is the point.
    expect(noSku.getSku()).toBeUndefined();
    expect(noCode.getSku()).not.toBeUndefined();
  });
});

// --- B6: `setSku` / `removeSku`, the bidirectional pair, as shipped -------------
//
// The legacy bodies, verbatim [model/entity/SkuCurrency.cfc:L89-L104]:
//
//   public void function setSku(required any sku) {                              // L89
//     variables.sku = arguments.sku;                                             // L90
//     if(isNew() or !arguments.sku.hasSkuCurrency( this )) {                      // L91
//       arrayAppend(arguments.sku.getSkuCurrencies(), this);                      // L92
//     }
//   }
//   public void function removeSku(any sku) {                                    // L95
//     if(!structKeyExists(arguments, "sku")) { arguments.sku = variables.sku; }   // L96-L98
//     var index = arrayFind(arguments.sku.getSkuCurrencies(), this);              // L99
//     if(index > 0) { arrayDeleteAt(arguments.sku.getSkuCurrencies(), index); }   // L100-L102
//     structDelete(variables, "sku");                                            // L103
//   }
//
// CFML parity [model/entity/SkuCurrency.cfc:L89-L94, L95-L104]: THE FAR-SIDE MAINTENANCE IS
// REPRODUCED IN THE SHIPPED MODULE, which states "BOTH ARE REPRODUCED, so `sku.getSkuCurrencies()`
// and `skuCurrency.getSku()` can never disagree". Dropping the append produced a SILENT
// INCONSISTENCY in which `skuCurrency.setSku(sku)` left `sku.getSkuCurrencies()` not containing a
// row whose own `getSku()` returned that sku. On THIS association that is not academic - an
// override missing from the collection is exactly the state [model/entity/Sku.cfc:L399-L414] cannot
// distinguish from "there is no override", so the cascade would fall through to conversion and
// change a price meant to be read verbatim. SOURCE WINS.
//
// THIS DIFFERS PER ENTITY - NEVER ASSUME UNIFORMITY ACROSS THE FOLDER. `priceGroupRate`,
// `promotionApplied`, `promotionPeriod`, `promotionCode`, `promotionQualifier`, `promotionReward`
// and `priceGroup` each rule on the guarded convention themselves.

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
    // CFML parity [model/entity/SkuCurrency.cfc:L91]: the guard reads
    //   if(isNew() or !arguments.sku.hasSkuCurrency( this ))
    // and CFML `or` evaluates its LEFT operand first, so for an unsaved row THE MEMBERSHIP TEST IS
    // NOT PERFORMED AT ALL and the append happens every time. Two calls therefore leave the row in
    // the collection TWICE - measured, not assumed, and FAITHFUL to L91-L93. It is load-bearing:
    // every unsaved row has an empty `skuCurrencyID`, so a key-based membership test could not tell
    // two unsaved rows apart, and the legacy arranged never to ask.
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

    // ...and IS consulted for a saved one, so the spy is measuring something real.
    aSkuCurrency({ skuCurrencyID: 'sc-set-6' }).setSku(sku);
    expect(membershipTest).toHaveBeenCalledTimes(1);
  });

  it('assigns the near side BEFORE consulting the far side, preserving the source ordering', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L90] runs before [L91].
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
    // The legacy has no "move" operation: `setSku` simply overwrites `variables.sku` and appends to
    // the NEW far side.
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
    // CFML parity [model/entity/SkuCurrency.cfc:L96-L98]: the default-to-the-currently-set- value
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
    // OUTSIDE the `if(index > 0)` block at L100-L102, so the legacy clears the near side whether or
    // not the far-side removal found anything.
    const holder = makeSkuFixture({ idPrefix: 'holder', skuCode: 'HOLD', skuCurrencies: [] });
    const stranger = makeSkuFixture({
      idPrefix: 'stranger',
      skuCode: 'STRANGE',
      skuCurrencies: [],
    });
    const subject = aSkuCurrency({ skuCurrencyID: 'sc-rm-4' });

    subject.setSku(holder);
    expect(holder.getSkuCurrencies()).toHaveLength(1);

    // Remove against a sku that does NOT contain this row: the search misses...
    subject.removeSku(stranger);

    expect(stranger.getSkuCurrencies()).toHaveLength(0);
    // ...the untouched collection keeps its entry...
    expect(holder.getSkuCurrencies()).toHaveLength(1);
    // ...and the near side is cleared anyway.
    expect(subject.getSku()).toBeUndefined();
  });

  it('removes the row at index 0, proving the CFML 1-based guard was translated', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L99-L100]: `arrayFind` returns a 1-BASED index or 0
    // for "not found", which is why the source guards with `index>0`. `Array.prototype.findIndex`
    // returns a 0-BASED index or -1, so the guard MUST become `!==-1`. Carrying `>0` across would
    // silently SKIP ELEMENT 0 - the first override row on the sku, and the very one cascade Step 2
    // would then fail to see. This test exists to catch that translation error, so the subject is
    // placed FIRST in the collection and a second row follows it.
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
    // search in the language and a row-identity search under Hibernate's session. With no session
    // those come apart, so the port compares on the primary key and falls back to REFERENCE
    // IDENTITY WHEN EITHER SIDE IS UNSAVED. This exercises the fallback from the near side: an
    // unsaved row carries an empty `skuCurrencyID`, so a key comparison could not identify it at
    // all. Without the fallback an unsaved row could never be detached from its sku.
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
    // CFML parity [model/entity/SkuCurrency.cfc:L97]: the legacy executes
    //   arguments.sku = variables.sku;
    // inside the L96-L98 defaulting block, and with the key already absent - `structDelete` at L103
    // having removed it on a previous call, or the association never having been set - CFML raises
    // "Element SKU is undefined in VARIABLES." right there. Silently no-opping would invent a
    // success path the legacy does not have, so the throw is faithful rather than invented.
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

// --- B7: structural facts and schema continuity -----------------------------
//
// The component declaration, verbatim [model/entity/SkuCurrency.cfc:L49]:
//
//   component entityname="SlatwallSkuCurrency" table="SwSkuCurrency" persistent="true"
//   accessors="true" extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="skuService" hb_permission="sku.skuCurrencies" {
//
// SCHEMA CONTINUITY IS A BINDING CONSTRAINT: table `SwSkuCurrency`, entity name
// `SlatwallSkuCurrency`, no migration, no rename, no new column, no dropped column. None of those
// metadata values is reachable at runtime in the target - no base class is ported, so there is no
// `getClassName()`, no `getTableName()` and no metadata reflection - so THIS SUITE ASSERTS ONLY
// WHAT THE SHIPPED MODULE EXPOSES.
//
// CFML parity [model/entity/SkuCurrency.cfc:L49]: `hb_serviceName="skuService"` points at
// `model/service/SkuService.cfc`, NOT at a service of its own - there is no `SkuCurrencyService`
// anywhere in the legacy tree and none is invented. `cacheuse="transactional"` was a Hibernate
// second-level-cache directive with no target equivalent, and `hb_permission="sku.skuCurrencies"`
// is a NESTED path naming the parent entity and the parent's collection rather than the usual
// `"this"`. All three are preserved verbatim as inert documentation text.

describe('structural facts and schema continuity', () => {
  it('reports isNew() true for a fresh instance, because the id defaults to the empty string', () => {
    // CFML parity [model/entity/SkuCurrency.cfc:L52]: `unsavedvalue="" default=""` is what makes an
    // unsaved row's key the EMPTY STRING rather than absent, and the framework's `getNewFlag()`
    // tested `getPrimaryIDValue() == ""`. The base is not ported, so that one line is restated on
    // the class - and it is ported because [L91] calls it. This is the surviving half of
    // `defaults_are_correct` [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67], authored
    // net-new rather than presented as carried forward.
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
    // `default=""` means the column always holds a string, possibly the empty one - so unlike every
    // nullable column on this entity, the id is NOT a `| undefined` union.
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
    // CFML parity [model/entity/SkuCurrency.cfc:L75, L77]: both declare
    //   cfc="Account" fieldtype="many-to-one"
    // with `fkcolumn="createdByAccountID"` and `fkcolumn="modifiedByAccountID"` respectively.
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
    // CFML parity [model/entity/SkuCurrency.cfc:L61, L63, L65]: the one-to-many, many-to-many owner
    // and many-to-many inverse sections are EMPTY section comments, and an empty banner implies
    // nothing. The entity declares ZERO collections, which is why the memoized-accessor pattern -
    // and the three known memo defects it carries in sibling entities - is absent here. [L79-L80]
    // "Non-Persistent Properties" is likewise empty.
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
    // CFML parity [model/entity/SkuCurrency.cfc:L124/L126]: the ORM Event Hooks banner is EMPTY -
    // no `preInsert`, no `preUpdate`.
    const members = prototypeMembers();

    for (const hook of ['preInsert', 'preUpdate', 'preDelete', 'postInsert', 'postUpdate']) {
      expect(members).not.toContain(hook);
    }
  });

  it('is a class carrying behaviour, not a bare data record', () => {
    // Interface parity is the acceptance contract, so the port is a CLASS retaining the exact CFML
    // method names in camelCase - which is why the lint configuration enables no naming rule.
    const subject = aSkuCurrency();

    expect(subject).toBeInstanceOf(SkuCurrency);
    expect(Object.getPrototypeOf(subject)).toBe(SkuCurrency.prototype);
  });

  it('gives each constructed row its own state, with nothing shared between instances', () => {
    // The freshness guarantee this suite rests on, asserted rather than assumed.
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
