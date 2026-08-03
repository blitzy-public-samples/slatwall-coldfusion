// ---------------------------------------------------------------------------
// slatwall-ts - characterisation suite for the European Central Bank currency
// converter
//
// WHAT THIS SUITE PINS
//   `src/integrations/europeanCentralBankCurrencyConverter.ts`, the shipped
//   implementation of the `CurrencyConverter` port, against
//   `model/service/CurrencyService.cfc` read line by line. The currency cascade
//   this adapter feeds is one of the three named MUST-PRESERVE areas (AAP 0.6.3),
//   so every assertion below cites the legacy line it holds in place.
//
// ******************************************************************************
// ** THIS COVERAGE IS NET-NEW. IT IS NOT LEGACY PARITY.                       **
// **                                                                          **
// ** AAP 0.6.6 records that exactly three legacy test files reach the         **
// ** in-scope slice - `meta/tests/unit/entity/BrandTest.cfc`,                 **
// ** `meta/tests/unit/entity/ProductTest.cfc`, and                            **
// ** `meta/tests/functional/admin/entity/ProductTest.cfc`, the last of which  **
// ** is an empty stub contributing zero coverage. NONE of them covers         **
// ** `CurrencyService.cfc`, and `meta/tests/unit/service/` contains only      **
// ** AccountServiceTest, HibachiServiceTest, PaymentServiceTest and           **
// ** UtilityRBServiceTest - none in scope.                                    **
// **                                                                          **
// ** So there is no legacy assertion to carry forward here and none is        **
// ** claimed. Every expectation below was derived by READING                  **
// ** [model/service/CurrencyService.cfc:L57-L101] and then EXECUTING the      **
// ** ported implementation to record what it answers, which is what makes     **
// ** this a characterisation suite rather than a specification.               **
// ******************************************************************************
//
// THE FIVE THINGS MOST WORTH GUARDING, AND WHY EACH IS HERE
//   1. THE SILENT PASS-THROUGH. [L100-L101] returns the amount UNCONVERTED when
//      either code has no reachable rate. Turning that into a rejection looks
//      safer and is not: the cascade awaits each conversion inside the body that
//      builds the price map, so one unlisted currency would fail
//      `getCurrencyDetails()` outright. Turning it into a zero would sell the
//      product for free.
//   2. THE FALLBACK IS NOT ROUNDED while both converted paths are. Asserted by
//      identity - `toBe(amount)` - which is the strongest available statement:
//      the very instance that went in comes back.
//   3. NO EQUAL-CODE SHORT-CIRCUIT. [L79-L101] has no `original eq convertTo`
//      test, so a same-code conversion with a known rate divides, multiplies and
//      ROUNDS. `USD -> USD` and `CHF -> CHF` on the same amount therefore answer
//      DIFFERENTLY, and that pair of tests is what proves the guard is presence-
//      based rather than an identity rule.
//   4. THE GUARD RUNS BEFORE ANY ARITHMETIC. [L86] resolves both halves before
//      [L90] divides, so a zero or malformed SOURCE rate paired with an
//      unreachable target is a pass-through and not a raise.
//   5. THE `activeFlag` ASYMMETRY. [L60] and [L72] filter on active status;
//      [model/entity/Sku.cfc:L375] does not. An inactive-but-eligible currency
//      must still be priced.
//
// EVERY EXPECTED AMOUNT IS A DECIMAL STRING
//   No assertion computes a monetary value with JavaScript arithmetic. Rates and
//   amounts are chosen so the exact result is stated as a literal - `21.70 / 1.0850`
//   is exactly `20`, and `20 * 0.8500` is exactly `17` - so a reader can check
//   the expectation by hand rather than trusting a second implementation written
//   in the test.
//
// MONEY IS COMPARED THROUGH `toFixed2()`, NOT `toDecimalString()`
//   `toDecimalString()` renders full precision with TRAILING ZEROS DROPPED, so a
//   converted `17.00` renders as `17`. `toFixed2()` is the two-decimal form and is
//   what the rounding assertions need. `toDecimalString()` is used deliberately
//   in the pass-through tests, where the point is that a third decimal SURVIVED.
//
// NO DATABASE, NO NETWORK, NO CLOCK
//   The adapter takes its currency records and its rate table as constructor
//   arguments, so this suite needs no fixture module, no executor double and no
//   environment. That is a property of the design under test, not a convenience:
//   the legacy rate retrieval at [L104-L131] performs a live HTTP GET and memoizes
//   the result on the component, and neither is ported.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  EuropeanCentralBankCurrencyConverter,
  type CurrencyRecordProjection,
  type EuropeanCentralBankRateTable,
} from '../../../src/integrations/europeanCentralBankCurrencyConverter.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
import type { CurrencyConverter } from '../../../src/domain/ports/currencyConverter.js';
import { CfmlBooleanConversionError } from '../../../src/lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../../src/lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// Currency codes
// ---------------------------------------------------------------------------

/** The pivot. Deliberately NOT a key of the rate table - see `ECB_RATES`. */
const EUR: CurrencyCode = toCurrencyCode('EUR');

const USD: CurrencyCode = toCurrencyCode('USD');
const GBP: CurrencyCode = toCurrencyCode('GBP');
const JPY: CurrencyCode = toCurrencyCode('JPY');

/** Present as a `SwCurrency` record but ABSENT from every rate table below. */
const CHF: CurrencyCode = toCurrencyCode('CHF');

// ---------------------------------------------------------------------------
// Rates, chosen so every expected result is exact
// ---------------------------------------------------------------------------

const USD_RATE = '1.0850';
const GBP_RATE = '0.8500';
const JPY_RATE = '160.50';

/**
 * A European Central Bank reference-rate table in its real shape.
 *
 * CFML parity [model/service/CurrencyService.cfc:L118-L119]: the legacy copies
 * the `currency` and `rate` XML attributes of each `Cube` element, so there is
 * NO `EUR` KEY - the table is quoted per euro, so the euro has no rate of its
 * own. Every pivot assertion below therefore also proves that the euro converts
 * without an entry.
 */
const ECB_RATES: EuropeanCentralBankRateTable = {
  USD: USD_RATE,
  GBP: GBP_RATE,
  JPY: JPY_RATE,
};

// ---------------------------------------------------------------------------
// Amounts. Each is exact under the rates above.
// ---------------------------------------------------------------------------

/** 20 EUR. */
const TWENTY_EUR = '20.00';

/** Exactly 20 EUR at `USD_RATE`, because 1.0850 * 20 = 21.70. */
const TWENTY_EUR_IN_USD = '21.70';

/** Exactly 20 EUR at `GBP_RATE`, because 0.8500 * 20 = 17. */
const TWENTY_EUR_IN_GBP = '17.00';

/** Exactly 20 EUR at `JPY_RATE`, because 160.50 * 20 = 3210. */
const TWENTY_EUR_IN_JPY = '3210.00';

/**
 * A three-decimal amount, which is the whole point of it.
 *
 * A sub-cent third decimal is what makes the difference between the rounded
 * converted paths and the unrounded pass-through OBSERVABLE.
 */
const SUB_CENT_AMOUNT = '19.999';

/** `SUB_CENT_AMOUNT` after the cent rounding at [L94] / [L96]. */
const SUB_CENT_AMOUNT_ROUNDED = '20.00';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A monetary amount from a decimal string. Never from a JavaScript number. */
function money(value: string): Money {
  return Money.fromDecimalString(value);
}

/** A `SwCurrency` projection row. */
function currencyRecord(
  currencyCode: CurrencyCode,
  activeFlag: CfBooleanInput,
): CurrencyRecordProjection {
  return { currencyCode, activeFlag };
}

/** A converter over the real-shaped rate table and no currency records. */
function converterWithRates(
  rates: EuropeanCentralBankRateTable = ECB_RATES,
): EuropeanCentralBankCurrencyConverter {
  return new EuropeanCentralBankCurrencyConverter([], rates);
}

/** A converter over currency records and no rates - for the listing suites. */
function converterWithRecords(
  records: readonly CurrencyRecordProjection[],
): EuropeanCentralBankCurrencyConverter {
  return new EuropeanCentralBankCurrencyConverter(records, {});
}

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - the euro pivot [model/service/CurrencyService.cfc:L87-L97]', () => {
  it('scales OUT of the euro by the target rate [L96]', async () => {
    // [L93] is false, so [L96] multiplies `amountInEUR` by the target rate.
    // 20 * 1.0850 = 21.70, exactly.
    const converted = await converterWithRates().convertCurrency(money(TWENTY_EUR), EUR, USD);

    expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_USD);
  });

  it('scales INTO the euro by dividing by the source rate [L90, L94]', async () => {
    // [L87] is false so [L90] divides; [L93] is true so [L94] returns without a
    // second scaling. 21.70 / 1.0850 = 20, exactly.
    const converted = await converterWithRates().convertCurrency(
      money(TWENTY_EUR_IN_USD),
      USD,
      EUR,
    );

    expect(converted.toFixed2()).toBe(TWENTY_EUR);
  });

  it('pivots between two non-euro currencies, dividing then multiplying [L90, L96]', async () => {
    // Both scalings run: 21.70 / 1.0850 = 20, then 20 * 0.8500 = 17.
    const converted = await converterWithRates().convertCurrency(
      money(TWENTY_EUR_IN_USD),
      USD,
      GBP,
    );

    expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_GBP);
  });

  it('handles a rate far from unity in both directions', async () => {
    // A three-figure rate is the case where a float implementation would start to
    // drift. 20 * 160.50 = 3210, and 3210 / 160.50 = 20.
    const converter = converterWithRates();

    expect((await converter.convertCurrency(money(TWENTY_EUR), EUR, JPY)).toFixed2()).toBe(
      TWENTY_EUR_IN_JPY,
    );
    expect((await converter.convertCurrency(money(TWENTY_EUR_IN_JPY), JPY, EUR)).toFixed2()).toBe(
      TWENTY_EUR,
    );
    expect((await converter.convertCurrency(money(TWENTY_EUR_IN_JPY), JPY, USD)).toFixed2()).toBe(
      TWENTY_EUR_IN_USD,
    );
  });

  it('★ pivots through the euro even though the rate table carries no EUR key', async () => {
    // CFML parity [model/service/CurrencyService.cfc:L86]: each half of the guard
    // is `structKeyExists(cbRates, code) || code eq "EUR"`, and the pivot test is
    // the half that answers for the euro. The real table has no `EUR` entry, so an
    // implementation that only consulted the table would refuse every euro
    // conversion - which is to say, all of them.
    const converter = converterWithRates();

    expect(structKeyPresent(ECB_RATES, 'EUR')).toBe(false);
    expect((await converter.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe(
      TWENTY_EUR_IN_USD,
    );
    expect((await converter.convertCurrency(money(TWENTY_EUR_IN_USD), USD, EUR)).toFixed2()).toBe(
      TWENTY_EUR,
    );
  });

  it('★ converts euro to euro through the no-scaling path, and still rounds [L88, L94]', async () => {
    // [L87] takes the assignment branch and [L93] takes the early return, so
    // NEITHER rate is consulted - yet [L94] still rounds. A same-currency
    // conversion is therefore not the identity.
    const converted = await converterWithRates().convertCurrency(money(SUB_CENT_AMOUNT), EUR, EUR);

    expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - the silent pass-through [model/service/CurrencyService.cfc:L100-L101]', () => {
  it('★★ returns the very amount it received when the TARGET has no rate', async () => {
    // `toBe` rather than a value comparison: the instance is returned untouched,
    // which is the strongest form of "unconverted" available.
    const amount = money(SUB_CENT_AMOUNT);
    const answered = await converterWithRates().convertCurrency(amount, EUR, CHF);

    expect(answered).toBe(amount);
  });

  it('★★ returns the very amount it received when the SOURCE has no rate', async () => {
    const amount = money(SUB_CENT_AMOUNT);
    const answered = await converterWithRates().convertCurrency(amount, CHF, EUR);

    expect(answered).toBe(amount);
  });

  it('★★ returns the very amount it received when NEITHER side has a rate', async () => {
    const amount = money(SUB_CENT_AMOUNT);
    const answered = await converterWithRates().convertCurrency(amount, CHF, USD);

    expect(answered).toBe(amount);

    const bothUnlisted = await converterWithRates().convertCurrency(amount, CHF, CHF);

    expect(bothUnlisted).toBe(amount);
  });

  it('★★ does NOT round the pass-through, while every converted path does', async () => {
    // THE ASYMMETRY AT [L101] vs [L94]/[L96], stated as one assertion pair.
    // [L101] hands back `arguments.amount` verbatim; both return paths round.
    const converter = converterWithRates();
    const amount = money(SUB_CENT_AMOUNT);

    const passedThrough = await converter.convertCurrency(amount, CHF, CHF);
    const converted = await converter.convertCurrency(amount, EUR, EUR);

    expect(passedThrough.toDecimalString()).toBe(SUB_CENT_AMOUNT);
    expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
  });

  it('★ answers at par for EVERY non-euro currency when the rate table is empty', async () => {
    // CFML parity [model/service/CurrencyService.cfc:L127-L128]: the retrieval's
    // `catch` IS EMPTY, so a failed fetch leaves the table as it was - possibly
    // never populated at all. An empty table is therefore a reachable production
    // state, not a test-only contrivance, and it must degrade to par rather than
    // to a failure.
    const converter = converterWithRates({});
    const amount = money(TWENTY_EUR);

    expect(await converter.convertCurrency(amount, EUR, USD)).toBe(amount);
    expect(await converter.convertCurrency(amount, USD, EUR)).toBe(amount);
    expect(await converter.convertCurrency(amount, USD, GBP)).toBe(amount);
  });

  it('★ still converts euro to euro with an empty table, because the pivot needs no rate', async () => {
    const converter = converterWithRates({});
    const amount = money(SUB_CENT_AMOUNT);
    const converted = await converter.convertCurrency(amount, EUR, EUR);

    expect(converted).not.toBe(amount);
    expect(converted.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - there is no equal-code short-circuit', () => {
  it('★★ USD to USD with a known rate divides, multiplies and ROUNDS [L90, L96]', async () => {
    // CFML parity [model/service/CurrencyService.cfc:L79-L101]: there is no
    // `original eq convertTo` test anywhere in the legacy body. So the same code
    // on both sides still takes the full arithmetic path, and a sub-cent amount
    // comes back rounded rather than intact.
    const amount = money(SUB_CENT_AMOUNT);
    const answered = await converterWithRates().convertCurrency(amount, USD, USD);

    expect(answered).not.toBe(amount);
    expect(answered.toFixed2()).toBe(SUB_CENT_AMOUNT_ROUNDED);
  });

  it('★★ CHF to CHF with NO rate answers differently, which is what proves the guard', async () => {
    // Same amount, same-code pair, OPPOSITE answer - and the only difference is
    // whether the code has a rate. An identity short-circuit would make these two
    // tests agree, so this pair is the one that would catch it.
    const amount = money(SUB_CENT_AMOUNT);
    const answered = await converterWithRates().convertCurrency(amount, CHF, CHF);

    expect(answered).toBe(amount);
    expect(answered.toDecimalString()).toBe(SUB_CENT_AMOUNT);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - the guard runs before any arithmetic [model/service/CurrencyService.cfc:L86]', () => {
  it('★★ a ZERO source rate with an unreachable target is a pass-through, not a division error', async () => {
    // THE ORDERING TEST. [L86] tests both halves before [L90] divides, so the
    // legacy never divides here. An implementation that divided first and checked
    // the target afterwards would raise instead - and would agree with this one on
    // every other input, which is exactly why this case is pinned.
    const converter = converterWithRates({ USD: '0' });
    const amount = money(SUB_CENT_AMOUNT);

    const answered = await converter.convertCurrency(amount, USD, CHF);

    expect(answered).toBe(amount);
  });

  it('★★ a MALFORMED source rate with an unreachable target is also a pass-through', async () => {
    // The guard is PRESENCE-based, exactly as `structKeyExists` is: it never looks
    // at the value. So a corrupt rate that is never consulted is harmless.
    const converter = converterWithRates({ USD: 'not-a-number' });
    const amount = money(SUB_CENT_AMOUNT);

    expect(await converter.convertCurrency(amount, USD, CHF)).toBe(amount);
  });

  it('a zero source rate DOES fail once the target is reachable, as CFML division did', async () => {
    // Not a pass-through: this is malformed data, and swallowing it would turn a
    // corrupt rate table into silently wrong prices. Rejecting rather than
    // throwing synchronously is the promise contract the port declares.
    const converter = converterWithRates({ USD: '0' });

    await expect(converter.convertCurrency(money(TWENTY_EUR), USD, EUR)).rejects.toThrow(
      /zero divisor/,
    );
  });

  it('a malformed rate fails once it is CONSULTED, in either position', async () => {
    const converter = converterWithRates({ USD: 'not-a-number' });

    await expect(converter.convertCurrency(money(TWENTY_EUR), EUR, USD)).rejects.toThrow(
      /plain decimal numeral/,
    );
    await expect(converter.convertCurrency(money(TWENTY_EUR), USD, EUR)).rejects.toThrow(
      /plain decimal numeral/,
    );
  });

  it('★ a ZERO TARGET rate is legitimate arithmetic and answers zero, not a failure', async () => {
    // [L96] multiplies by the target rate, and multiplying by zero is defined.
    // The asymmetry with the source position is the division, not the value.
    const converted = await converterWithRates({ USD: '0' }).convertCurrency(
      money(TWENTY_EUR),
      EUR,
      USD,
    );

    expect(converted.toFixed2()).toBe('0.00');
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - cent rounding [model/service/CurrencyService.cfc:L94, L96]', () => {
  it('rounds half AWAY FROM ZERO, which is what CFML round() does', async () => {
    // 1.00 * 1.005 = 1.005 exactly, which sits on the half cent. Half-up takes it
    // to 1.01; a half-to-even implementation would answer 1.00.
    const converted = await converterWithRates({ USD: '1.005' }).convertCurrency(
      money('1.00'),
      EUR,
      USD,
    );

    expect(converted.toFixed2()).toBe('1.01');
  });

  it('normalises a value that rounds to zero from below, as round(-0.1)/100 does', async () => {
    const converted = await converterWithRates().convertCurrency(money('-0.001'), EUR, EUR);

    expect(converted.toFixed2()).toBe('0.00');
    expect(converted.equals(Money.zero)).toBe(true);
  });

  it('leaves the amount handed in untouched - Money is immutable', async () => {
    const amount = money(TWENTY_EUR);

    await converterWithRates().convertCurrency(amount, EUR, JPY);

    expect(amount.toFixed2()).toBe(TWENTY_EUR);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter.getAllActiveCurrencyIDList [model/service/CurrencyService.cfc:L57-L67]', () => {
  it('answers only the active codes, in record order', async () => {
    // [L60] filters `activeFlag` to 1 and [L63-L65] appends each surviving record
    // in the order the query returned it. There is no `ORDER BY`, so record order
    // is the contract.
    const converter = converterWithRecords([
      currencyRecord(JPY, true),
      currencyRecord(USD, false),
      currencyRecord(EUR, true),
    ]);

    expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([JPY, EUR]);
  });

  it('treats an ABSENT flag as inactive, matching the `activeFlag = 1` predicate', async () => {
    // [model/entity/Currency.cfc:L53] declares `ormtype="boolean"` with no
    // default, so the column can hydrate as SQL NULL, and SQL NULL fails `= 1`.
    const converter = converterWithRecords([
      currencyRecord(USD, null),
      currencyRecord(GBP, undefined),
      currencyRecord(EUR, true),
    ]);

    expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([EUR]);
  });

  it('reads the CFML boolean literals a persisted flag can carry, in any casing', async () => {
    const active = converterWithRecords([
      currencyRecord(USD, '1'),
      currencyRecord(GBP, 'TRUE'),
      currencyRecord(JPY, 'Yes'),
      currencyRecord(EUR, 1),
    ]);

    expect(await active.getAllActiveCurrencyIDList()).toStrictEqual([USD, GBP, JPY, EUR]);

    const inactive = converterWithRecords([
      currencyRecord(USD, '0'),
      currencyRecord(GBP, 'False'),
      currencyRecord(JPY, 'no'),
      currencyRecord(EUR, ''),
    ]);

    expect(await inactive.getAllActiveCurrencyIDList()).toStrictEqual([]);
  });

  it('answers an empty array for an empty record set', async () => {
    expect(await converterWithRecords([]).getAllActiveCurrencyIDList()).toStrictEqual([]);
  });

  it('hands back a FRESH array each call, so a caller cannot reach the internal state', async () => {
    const converter = converterWithRecords([currencyRecord(USD, true)]);

    const first = await converter.getAllActiveCurrencyIDList();
    first.push(GBP);

    expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
  });

  it('★ refuses a flag that carries no boolean meaning, at CONSTRUCTION', async () => {
    // A `tinyint` column cannot hold `'maybe'`, so this is a schema surprise
    // rather than a data variation, and failing fast at the boundary beats
    // surfacing it from a listing call several layers away. Asserted on the
    // constructor, which is where the resolution happens.
    expect(() => converterWithRecords([currencyRecord(USD, 'maybe')])).toThrow(
      CfmlBooleanConversionError,
    );

    // And the well-formed neighbour still constructs, so the refusal is about the
    // value and not about the shape.
    await expect(
      converterWithRecords([currencyRecord(USD, true)]).getAllActiveCurrencyIDList(),
    ).resolves.toStrictEqual([USD]);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter.getCurrenciesByCurrencyCodeList [model/entity/Sku.cfc:L371-L375]', () => {
  it('★★ applies NO active filter, so an inactive-but-eligible currency is still returned', async () => {
    // ★ THE ASYMMETRY, AND THE SINGLE MOST CONSEQUENTIAL ASSERTION IN THIS FILE.
    // [model/entity/Sku.cfc:L375] narrows the currency list with
    // `addInFilter('currencyCode', setting('skuEligibleCurrencies'))` and NOTHING
    // ELSE - there is no `activeFlag` clause on the cascade's path, unlike
    // [model/service/CurrencyService.cfc:L60] and [L72]. Adding one here is how an
    // inactive-but-eligible currency silently stops being priced.
    const converter = converterWithRecords([
      currencyRecord(USD, true),
      currencyRecord(GBP, false),
      currencyRecord(JPY, null),
    ]);

    expect(await converter.getCurrenciesByCurrencyCodeList(`${USD},${GBP},${JPY}`)).toStrictEqual([
      USD,
      GBP,
      JPY,
    ]);

    // The contrast that makes the point: the SAME records, the other method.
    expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
  });

  it('★ omits a listed code that has no currency record at all', async () => {
    // The legacy narrows a smart list over the Currency ENTITY, so it answers with
    // RECORDS - not with the codes the setting happened to name. A code present in
    // `skuEligibleCurrencies` but absent from `SwCurrency` yields no record, the
    // cascade never seeds an entry for it at [model/entity/Sku.cfc:L381], and
    // `getPriceByCurrencyCode` answers `undefined` for it.
    const converter = converterWithRecords([currencyRecord(USD, true)]);

    expect(await converter.getCurrenciesByCurrencyCodeList(`${USD},${CHF}`)).toStrictEqual([USD]);
  });

  it('★ answers in RECORD order, not in the order the list names them', async () => {
    // An `IN` predicate does not reorder a table, and the cascade seeds one outer
    // key per returned record, so record order becomes the key order of the
    // currency-details map.
    const converter = converterWithRecords([
      currencyRecord(USD, true),
      currencyRecord(GBP, true),
      currencyRecord(JPY, true),
    ]);

    expect(await converter.getCurrenciesByCurrencyCodeList(`${JPY},${USD},${GBP}`)).toStrictEqual([
      USD,
      GBP,
      JPY,
    ]);
  });

  it('matches case-insensitively, as the IN predicate does against a ci collation', async () => {
    const converter = converterWithRecords([currencyRecord(USD, true), currencyRecord(GBP, true)]);

    expect(await converter.getCurrenciesByCurrencyCodeList('usd,gbp')).toStrictEqual([USD, GBP]);
  });

  it('omits every record for an empty list, which is the gate-shut shape', async () => {
    // [model/entity/Sku.cfc:L373]'s eligibility gate never opens for an empty
    // setting, so this call would not be reached with one - but answering nothing
    // is the only consistent reading if it ever were.
    const converter = converterWithRecords([currencyRecord(USD, true)]);

    expect(await converter.getCurrenciesByCurrencyCodeList('')).toStrictEqual([]);
  });

  it('omits a record the list does not name', async () => {
    const converter = converterWithRecords([currencyRecord(USD, true), currencyRecord(GBP, true)]);

    expect(await converter.getCurrenciesByCurrencyCodeList(GBP)).toStrictEqual([GBP]);
  });

  it('hands back a FRESH array each call', async () => {
    const converter = converterWithRecords([currencyRecord(USD, true)]);

    const first = await converter.getCurrenciesByCurrencyCodeList(USD);
    first.length = 0;

    expect(await converter.getCurrenciesByCurrencyCodeList(USD)).toStrictEqual([USD]);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - case-insensitive currency codes', () => {
  it('matches the euro pivot case-insensitively, as CFML `eq` does [L87, L93]', async () => {
    const converter = converterWithRates();

    expect(
      (await converter.convertCurrency(money(TWENTY_EUR), toCurrencyCode('eur'), USD)).toFixed2(),
    ).toBe(TWENTY_EUR_IN_USD);
    expect(
      (
        await converter.convertCurrency(money(TWENTY_EUR_IN_USD), USD, toCurrencyCode('eur'))
      ).toFixed2(),
    ).toBe(TWENTY_EUR);
  });

  it('finds a rate for a lower-cased code, as CFML struct keys are case-insensitive [L86]', async () => {
    const converted = await converterWithRates().convertCurrency(
      money(TWENTY_EUR_IN_USD),
      toCurrencyCode('usd'),
      EUR,
    );

    expect(converted.toFixed2()).toBe(TWENTY_EUR);
  });

  it('finds a lower-cased TABLE KEY from an upper-cased code', async () => {
    // The table is built from XML attributes, so its casing is the source's, not
    // this port's. Both directions of the mismatch have to work.
    const converted = await converterWithRates({ usd: USD_RATE }).convertCurrency(
      money(TWENTY_EUR),
      EUR,
      USD,
    );

    expect(converted.toFixed2()).toBe(TWENTY_EUR_IN_USD);
  });
});

// ===========================================================================
describe('EuropeanCentralBankCurrencyConverter - construction, isolation and surface', () => {
  it('satisfies the CurrencyConverter port', () => {
    // Compile-time as much as run-time: the annotation is the assertion, and it
    // fails the typecheck gate rather than this suite if the surface drifts.
    const port: CurrencyConverter = converterWithRates();

    expect(typeof port.getAllActiveCurrencyIDList).toBe('function');
    expect(typeof port.getCurrenciesByCurrencyCodeList).toBe('function');
    expect(typeof port.convertCurrency).toBe('function');
  });

  it('★ snapshots the currency records, so a later mutation cannot reach in', async () => {
    // A caller keeps ownership of its own array. Reading it live would let a
    // mutation between two calls change which currencies get priced.
    const records: CurrencyRecordProjection[] = [currencyRecord(USD, true)];
    const converter = new EuropeanCentralBankCurrencyConverter(records, ECB_RATES);

    records.push(currencyRecord(GBP, true));
    records.length = 0;

    expect(await converter.getAllActiveCurrencyIDList()).toStrictEqual([USD]);
  });

  it('★ snapshots the rate table, so a later mutation cannot change a price', async () => {
    const rates: Record<string, string> = { USD: USD_RATE };
    const converter = new EuropeanCentralBankCurrencyConverter([], rates);

    rates.USD = '99.0000';
    delete rates.USD;

    expect((await converter.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe(
      TWENTY_EUR_IN_USD,
    );
  });

  it('★ shares no state between two instances', async () => {
    // The correctness property behind the instance scoping: two converters built
    // from different rate tables must never agree by accident. This is what makes
    // one instance per request safe and a module-level memo unsafe.
    const cheap = converterWithRates({ USD: '1.0000' });
    const dear = converterWithRates({ USD: '2.0000' });

    expect((await cheap.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe('20.00');
    expect((await dear.convertCurrency(money(TWENTY_EUR), EUR, USD)).toFixed2()).toBe('40.00');
  });

  it('★ exposes no cache control and no state accessor', () => {
    // The port has no `refreshRates` and no `clearCache`, and neither does this
    // class: a cache it does not own is a cache it cannot mismanage. Pinning the
    // prototype is what catches an accidental widening of the surface.
    //
    // `resolveScaling` is `private` in TypeScript, which is a compile-time
    // guarantee and not a runtime one, so it appears here. It is not part of the
    // port and no consumer can name it.
    const names = Object.getOwnPropertyNames(
      Object.getPrototypeOf(converterWithRates()) as object,
    ).sort();

    expect(names).toStrictEqual([
      'constructor',
      'convertCurrency',
      'getAllActiveCurrencyIDList',
      'getCurrenciesByCurrencyCodeList',
      'resolveScaling',
    ]);
  });
});

/**
 * Whether a plain object carries a key, without the case-insensitive matching the
 * production lookup applies.
 *
 * Declared here rather than imported so that the `EUR`-absence assertion says
 * something about the FIXTURE, in plain JavaScript terms, instead of restating
 * the very lookup it is meant to constrain.
 */
function structKeyPresent(struct: Readonly<Record<string, string>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(struct, key);
}
