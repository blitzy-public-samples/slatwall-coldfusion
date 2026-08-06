// ---------------------------------------------------------------------------
// slatwall-ts - tests/unit/lib/cfml/struct.test.ts
//
// WHAT THIS SUITE PINS
//   src/lib/cfml/struct.ts - the single place where CFML's case-insensitive
//   struct-key semantics are translated into TypeScript for the AWS Lambda
//   `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing slice
//   (version.txt = 3.1.39). Six pure functions and one type, ZERO imports and no
//   state, so this suite needs no mock, container or server: every case below is a
//   plain object literal built inside its test.
//
// THE NULL SEMANTICS PINNED HERE ARE LOAD-BEARING ON MONEY
//   Absence propagates as `undefined`. Always. Not 0, not '', not null, not {},
//   and never a `??` fallback - in the implementation OR in an expected value.
//   The legacy price accessor has no `else` branch and no fallback
//   [model/entity/Sku.cfc:L269-L273], so an unknown currency yields nothing at
//   all, and substituting 0 for that nothing would silently sell products for
//   free. Every `undefined` below is asserted by identity AND asserted not to be
//   0, '', null or {}.
//
// COVERAGE IS 100% NET-NEW - NEVER PRESENT IT AS PARITY
//   Measured, not assumed: all 32 `.cfc` files under meta/tests/ were searched.
//   `structKeyExists` appears 8 times, all incidental uses inside test BODIES
//   (meta/tests/unit/core/EntityFormatTest.cfc L76, L96, L97, L102, L107, L148,
//   L170, L187) inspecting ORM property metadata; `structKeyList` appears only to
//   enumerate ORM class metadata (meta/tests/unit/core/RBKeyTest.cfc:L52); and a
//   search for any assertion about key case-insensitivity returns nothing.
//   Fixtures follow meta/tests/unit/Helper.cfc as a PATTERN only, and regression
//   cases follow the `issue_<ticket#>` convention from
//   meta/tests/unit/IssuesTest.cfc:L51.
//
// CARRY THE ASSERTIONS, NEVER THE HARNESS
//   The legacy tier was not isolated:
//   meta/tests/unit/SlatwallUnitTestBase.cfc:L52 builds the real
//   Slatwall.Application component and :L60 calls bootstrap() before EVERY legacy
//   test. This suite is the deliberate opposite. One harness detail is also
//   deliberately NOT reproduced:
//   meta/tests/unit/Helper.cfc:L53 and meta/tests/unit/IssuesTest.cfc:L55 both
//   assign `productData` with no `var`, leaking it into component scope. That is a
//   hygiene defect in the harness being replaced, not a preserved business-logic
//   defect, and it is why every fixture below is built INSIDE its test: on a warm
//   Lambda container module-level state survives between unrelated invocations.
//
// THE SHIPPED SURFACE IS THE CONTRACT - FOUR RECORDED DIFFERENCES
//   The module was read in full first and its signatures are authoritative. Where
//   the authoring brief differed, this suite conforms to the SHIPPED file and
//   records the difference rather than changing src/**:
//
//     1. `structGet<TStruct extends object>(struct, key)` returns
//        `TStruct[keyof TStruct] | undefined`, typed by the STRUCT rather than the
//        value, so the result needs no cast. Exactly two parameters - there is no
//        `defaultValue`, confirmed by reading it.
//     2. `structGetPath<TInner extends object>(struct: CfStruct<TInner>, ...)`
//        types its parameter by the INNER entry, so the outer container maps every
//        key to the same entry type.
//     3. `structKeyExists`, `structFindKey` and `structKeyList` take `object`
//        rather than `CfStruct`, widened so a heterogeneous struct declared as an
//        interface is still accepted.
//     4. `cfEquals` accepts `string | null | undefined` only, never numbers,
//        because every monetary comparison belongs to `Money`. It is also the ONE
//        export that is not total: it raises `CfmlComparisonError` for a nullish
//        operand, matching CFML, where a null reaching `eq` raises. The six readers
//        stay total because each returns `T | undefined` or a `boolean` every
//        struct can genuinely answer, whereas `cfEquals` returns a `boolean` whose
//        `false` already means "different currencies", leaving no spare value for
//        "unanswerable".
//
//   `CfStruct<T = unknown>` is the only exported type; there is no key-map alias,
//   the module implements NO cache, and no caching behaviour is asserted.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  CfmlComparisonError,
  cfEquals,
  cfFoldKey,
  findPrototypeKeyPath,
  structFindKey,
  structGet,
  structGetPath,
  structKeyExists,
  structKeyList,
} from '../../../../src/lib/cfml/struct.js';
import type { CfStruct } from '../../../../src/lib/cfml/struct.js';

// ---------------------------------------------------------------------------
// Case-insensitive resolution, across every export that matches a key.
// ---------------------------------------------------------------------------
describe('case-insensitive key resolution', () => {
  // CFML parity [model/entity/Sku.cfc:L270]: the currency code handed to `structKeyExists` arrives
  // in whatever casing the caller used and the engine matches it against the stored key regardless
  // of case, so the target folds case rather than comparing raw strings.
  it('resolves a currency key regardless of the casing asked for', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structKeyExists(currencyDetails, 'usd')).toBe(true);
    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);
    expect(structKeyExists(currencyDetails, 'Usd')).toBe(true);
  });

  it('returns the identical stored value object whatever casing is asked for', () => {
    const usdDetail = { price: '19.99' };
    const currencyDetails = { USD: usdDetail };

    // `toBe`, not `toEqual`: the SAME object must come back, not a copy. A rebuilt entry could
    // silently drop a sub-key, and sub-key presence is exactly what the two-level accessors test.
    expect(structGet(currencyDetails, 'USD')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'Usd')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'usd')).toBe(structGet(currencyDetails, 'USD'));
  });

  // CFML parity [model/entity/Sku.cfc:L276, L282]: CFML is case-insensitive at EVERY level of a
  // struct, not merely the first, so the sub-key lookup folds case just as the currency lookup
  // does.
  it('folds case at BOTH levels of a two-level read', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structGetPath(currencyDetails, 'usd', 'PRICE')).toBe('19.99');
    expect(structGetPath(currencyDetails, 'USD', 'price')).toBe('19.99');
    expect(structGetPath(currencyDetails, 'UsD', 'PrIcE')).toBe('19.99');
  });

  it('reports the actual stored key, not the casing that was asked for', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structFindKey(currencyDetails, 'uSd')).toBe('USD');
  });

  // JUDGMENT CALL: the fold is `toLowerCase()`, never `toLocaleLowerCase()`.
  //   A locale-sensitive fold would make key matching depend on where the process
  //   happens to run: under a Turkish locale an ASCII `I` folds to a dotless `i`, so
  //   a key spelled with an ASCII `I` would stop matching one spelled with an ASCII
  //   `i`. CFML matches struct keys without consulting a locale, so the target pins
  //   the locale-independent fold, accepting that a key pair distinguished only by a
  //   locale-specific rule is treated as one key.
  it('folds the ASCII I/i pair the same way regardless of ambient locale', () => {
    const productTypeRow = { productTypeIDPath: '1,2,3' };

    expect(structKeyExists(productTypeRow, 'PRODUCTTYPEIDPATH')).toBe(true);
    expect(structKeyExists(productTypeRow, 'producttypeidpath')).toBe(true);
    expect(structGet(productTypeRow, 'ProductTypeIdPath')).toBe('1,2,3');
  });
});

// ---------------------------------------------------------------------------
// Case is folded. Whitespace is NOT.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/Sku.cfc:L270]: the engine folds the CASE of a struct key and does
// nothing else to it - surrounding whitespace is part of the key, so trimming would silently change
// which key a lookup resolves to.
describe('keys are matched with case folded but whitespace intact', () => {
  it('does not let a leading-space key answer a lookup for the bare key', () => {
    const currencyDetails = { ' USD': { price: '1.00' } };

    expect(structKeyExists(currencyDetails, 'USD')).toBe(false);
    expect(structGet(currencyDetails, 'USD')).toBeUndefined();
    expect(structFindKey(currencyDetails, 'USD')).toBeUndefined();

    // The stored key still answers its own exact spelling, case-folded.
    expect(structKeyExists(currencyDetails, ' usd')).toBe(true);
    expect(structFindKey(currencyDetails, ' usd')).toBe(' USD');
  });

  it('does not let a bare key answer a lookup carrying a leading space', () => {
    const currencyDetails = { USD: { price: '1.00' } };

    expect(structKeyExists(currencyDetails, ' USD')).toBe(false);
    expect(structGet(currencyDetails, ' USD')).toBeUndefined();
    expect(structGetPath(currencyDetails, ' USD', 'price')).toBeUndefined();
  });

  it('hands back keys with their whitespace and original casing intact', () => {
    const currencyDetails = { ' USD': { price: '1.00' }, CAD: { price: '2.00' } };

    expect(structKeyList(currencyDetails)).toEqual([' USD', 'CAD']);
  });
});

// ---------------------------------------------------------------------------
// Presence is not value.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/Sku.cfc:L270, L276, L282]: `structKeyExists` asks whether a key is
// THERE and says nothing about what it holds. That separation is the whole reason the list-price
// and renewal-price accessors can ask a second question, so the target keeps the two apart instead
// of collapsing "absent" into "falsy". Under `exactOptionalPropertyTypes`, which tsconfig.json
// enables, an ABSENT key and a key PRESENT holding `undefined` are genuinely different states. Each
// falsy value below is real, so no case can be mistaken for a price:
//   ''     CFML parity [model/entity/Sku.cfc:L382]: the cascade seeds every
//          currency entry with `skuCurrencyID = ""`.
//   false  CFML parity [model/entity/Sku.cfc:L396, L411]: the base-currency and
//          override steps both record `converted = false`.
//   0      CFML parity [model/entity/OptionGroup.cfc:L58]: `sortOrder` is an
//          integer property, and a sort order of zero is legitimate.
describe('presence is reported independently of the value stored', () => {
  it('reports a key holding undefined as PRESENT while reading it as undefined', () => {
    const salePriceDetails = { salePrice: undefined };

    expect(structKeyExists(salePriceDetails, 'salePrice')).toBe(true);
    expect(structKeyExists(salePriceDetails, 'SALEPRICE')).toBe(true);
    expect(structGet(salePriceDetails, 'salePrice')).toBeUndefined();
    expect(structFindKey(salePriceDetails, 'SALEPRICE')).toBe('salePrice');
    expect(structKeyList(salePriceDetails)).toEqual(['salePrice']);
  });

  it('reports a key holding null as PRESENT while reading it as null', () => {
    const salePriceDetails = { salePrice: null };

    expect(structKeyExists(salePriceDetails, 'salePrice')).toBe(true);
    expect(structGet(salePriceDetails, 'salePrice')).toBeNull();
  });

  it('reports a key holding an empty string as PRESENT and reads it back exactly', () => {
    const currencyDetail = { skuCurrencyID: '' };

    expect(structKeyExists(currencyDetail, 'SKUCURRENCYID')).toBe(true);
    expect(structGet(currencyDetail, 'skucurrencyid')).toBe('');
  });

  it('reports a key holding zero as PRESENT and reads it back exactly', () => {
    const optionGroupRow = { sortOrder: 0 };

    expect(structKeyExists(optionGroupRow, 'SORTORDER')).toBe(true);
    expect(structGet(optionGroupRow, 'sortorder')).toBe(0);
  });

  it('reports a key holding false as PRESENT and reads it back exactly', () => {
    const currencyDetail = { converted: false };

    expect(structKeyExists(currencyDetail, 'CONVERTED')).toBe(true);
    expect(structGet(currencyDetail, 'converted')).toBe(false);
  });

  it('distinguishes an absent key from a present key holding a falsy value', () => {
    const currencyDetail = { skuCurrencyID: '', converted: false, sortOrder: 0 };

    expect(structKeyExists(currencyDetail, 'skuCurrencyID')).toBe(true);
    expect(structKeyExists(currencyDetail, 'converted')).toBe(true);
    expect(structKeyExists(currencyDetail, 'sortOrder')).toBe(true);

    // Absent, and therefore a different answer to a DIFFERENT question: the value read is
    // `undefined` in this case only, which is what lets a caller asking both questions tell the two
    // states apart.
    expect(structKeyExists(currencyDetail, 'listPrice')).toBe(false);
    expect(structGet(currencyDetail, 'listPrice')).toBeUndefined();
    expect(structFindKey(currencyDetail, 'listPrice')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// structGet never substitutes anything for a miss.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/Sku.cfc:L269-L273]: `getPriceByCurrencyCode` tests the currency key
// once, returns `.price` when it matches, and has NO `else` and NO fallback, so an unmatched
// currency yields nothing at all - the single highest-consequence parity requirement in this
// migration.
describe('structGet reports a miss as undefined and never stands in for it', () => {
  it('yields undefined for an unknown currency, and never a stand-in value', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    const missing = structGet(currencyDetails, 'EUR');

    expect(missing).toBeUndefined();

    // The four substitutions that must never appear. `toEqual` is used for the empty-object case on
    // purpose: `not.toBe({})` would pass trivially, since a fresh object literal is never
    // reference-equal to anything.
    expect(missing).not.toBe(0);
    expect(missing).not.toBe('');
    expect(missing).not.toBeNull();
    expect(missing).not.toEqual({});
  });

  // The shipped signature genuinely takes no default, asserted structurally rather than by trying
  // to pass one: both declared parameters are required, so the arity is exactly 2. A third
  // `defaultValue` slot is how a 0 sneaks into a price path, so its absence is part of the
  // contract, not an omission.
  it('declares exactly two parameters, so there is no default-value slot', () => {
    expect(structGet.length).toBe(2);
    expect(structKeyExists.length).toBe(2);
    expect(structFindKey.length).toBe(2);
    expect(structGetPath.length).toBe(3);
  });

  it('does not create the key it failed to find, so reading never writes', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structGet(currencyDetails, 'EUR')).toBeUndefined();

    expect(structKeyExists(currencyDetails, 'EUR')).toBe(false);
    expect(structKeyList(currencyDetails)).toEqual(['USD']);
    expect(structGet(currencyDetails, 'EUR')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// structGetPath - the two-level accessor, and the highest-value export here.
// ---------------------------------------------------------------------------
// All three legacy accessors are `public any function`, and the difference between the first and
// the other two is the whole reason this export exists:
//
//   CFML parity [model/entity/Sku.cfc:L269-L273] getPriceByCurrencyCode
//     ONE `structKeyExists(getCurrencyDetails(), arguments.currencyCode)`,
//     returning `.price`, with no `else` and no fallback.
//   CFML parity [model/entity/Sku.cfc:L275-L279] getListPriceByCurrencyCode
//     TWO `structKeyExists` calls on a single line - the currency key AND the
//     `"listPrice"` sub-key - so it yields nothing even for a currency that IS
//     present in the map.
//   CFML parity [model/entity/Sku.cfc:L281-L285] getRenewalPriceByCurrencyCode
//     The identical two-level shape on the `"renewalPrice"` sub-key.
describe('structGetPath resolves two levels or yields undefined', () => {
  it('yields undefined when the OUTER key is absent', () => {
    const currencyDetails = { USD: { price: '19.99', listPrice: '24.99' } };

    const missing = structGetPath(currencyDetails, 'EUR', 'price');

    expect(missing).toBeUndefined();
    expect(missing).not.toBe(0);
    expect(missing).not.toBe('');
    expect(missing).not.toBeNull();
    expect(missing).not.toEqual({});
  });

  it('yields undefined when the outer key is PRESENT but the INNER key is absent', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);

    const missing = structGetPath(currencyDetails, 'USD', 'listPrice');

    expect(missing).toBeUndefined();
    expect(missing).not.toBe(0);
    expect(missing).not.toBe('');
    expect(missing).not.toBeNull();
    expect(missing).not.toEqual({});
  });

  it('returns the stored value when BOTH levels are present', () => {
    const currencyDetails = { USD: { price: '19.99', listPrice: '24.99' } };

    expect(structGetPath(currencyDetails, 'USD', 'price')).toBe('19.99');
    expect(structGetPath(currencyDetails, 'USD', 'listPrice')).toBe('24.99');
  });

  // CFML parity [model/entity/Sku.cfc:L373]: the entire cascade body sits inside
  // `if(len(setting('skuEligibleCurrencies')))`. With that gate closed the memo initialised at
  // :L369 stays `{}` and is returned unchanged at :L432, so EVERY currency accessor yields nothing,
  // including for the configured base currency.
  it('answers every question with a miss when the eligibility gate left the map empty', () => {
    const currencyDetails: CfStruct<{ price: string }> = {};

    expect(structKeyExists(currencyDetails, 'USD')).toBe(false);
    expect(structGet(currencyDetails, 'USD')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'USD', 'price')).toBeUndefined();
    expect(structFindKey(currencyDetails, 'USD')).toBeUndefined();
    expect(structKeyList(currencyDetails)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// WHY the second presence check exists - the structural fact behind it.
// ---------------------------------------------------------------------------
// Verified line by line against `getCurrencyDetails()` [model/entity/Sku.cfc:L367-L433], the
// four-step cascade that builds the map every currency accessor reads:
//
//   :L367-L369  The memo guard, then `variables.currencyDetails = {};`.
//   :L373       The gate `if(len(setting('skuEligibleCurrencies')))`, wrapping
//               :L374-L430 in its entirety.
//   :L381-L382  STEP 0. Every eligible currency's OUTER entry is created
//               UNCONDITIONALLY (`[code] = {}` then `[code].skuCurrencyID = ""`).
//   :L385-L397  STEP 1, base currency, selected by case-insensitive `eq` at :L385.
//               `renewalPrice` (:L386-L389) and `listPrice` (:L390-L393) are
//               written ONLY under an `!isNull(...)` guard, `price` at :L394
//               UNCONDITIONALLY, `converted = false` at :L396.
//   :L399-L414  STEP 2, per-currency overrides, matched by `eq` at :L400 and
//               overwriting STEP 1. Same two keys guarded at :L401 and :L405;
//               price :L409; `converted = false` :L411; `skuCurrencyID` :L412.
//   :L416-L428  STEP 3, on-the-fly conversion, gated at :L416 on absence of the
//               `"price"` sub-key SPECIFICALLY. Guards :L417 and :L421;
//               conversion :L425; `converted = true` :L427.
//   :L432       `return variables.currencyDetails;`
//
// THE INSIGHT THIS SUITE PINS: because :L381 creates the OUTER key unconditionally while the INNER
// `listPrice` and `renewalPrice` keys are created only under `!isNull(...)` guards, an outer key
// that EXISTS alongside an inner sub-key that DOES NOT is a reachable state - precisely why
// [model/entity/Sku.cfc:L275-L285] needs the SECOND `structKeyExists`. And `price` is written
// unconditionally by all three steps (:L394, :L409, :L425), so a `"price"` miss is meaningful: the
// currency was not eligible, or :L373 was closed.
//
// For context only: `skuCurrency` is declared `{fieldType="select", defaultValue="USD"}` at
// [model/service/SettingService.cfc:L221] and `skuEligibleCurrencies` defaults to
// `getCurrencyService().getAllActiveCurrencyIDList()` at :L222, so the well-known "USD" default
// lives in a SETTING DECLARATION rather than the entity, whose `getCurrencyCode()`
// [model/entity/Sku.cfc:L360-L365] merely memoises it.
describe('the outer key can exist while the inner sub-key does not', () => {
  it('treats an inner key that was never created as absent', () => {
    const usdDetail = { skuCurrencyID: '', price: '19.99' };
    const currencyDetails = { USD: usdDetail };

    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);

    expect(structKeyExists(usdDetail, 'listPrice')).toBe(false);
    expect(structKeyExists(usdDetail, 'renewalPrice')).toBe(false);

    expect(structGetPath(currencyDetails, 'USD', 'listPrice')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'USD', 'renewalPrice')).toBeUndefined();

    expect(structGetPath(currencyDetails, 'USD', 'price')).toBe('19.99');
    expect(structGetPath(currencyDetails, 'USD', 'skuCurrencyID')).toBe('');
  });

  it('treats an inner key that is present but holds undefined as PRESENT', () => {
    const usdDetail = { skuCurrencyID: '', price: '19.99', listPrice: undefined };
    const currencyDetails = { USD: usdDetail };

    expect(structKeyExists(usdDetail, 'listPrice')).toBe(true);
    expect(structKeyExists(usdDetail, 'LISTPRICE')).toBe(true);
    expect(structKeyList(usdDetail)).toEqual(['skuCurrencyID', 'price', 'listPrice']);

    const listPrice = structGetPath(currencyDetails, 'USD', 'listPrice');

    expect(listPrice).toBeUndefined();
    expect(listPrice).not.toBe(0);
    expect(listPrice).not.toBe('');
    expect(listPrice).not.toBeNull();
    expect(listPrice).not.toEqual({});
  });

  it('keeps the two inner states distinguishable from one another', () => {
    const absentInner = { skuCurrencyID: '', price: '19.99' };
    const undefinedInner = { skuCurrencyID: '', price: '19.99', listPrice: undefined };

    expect(structKeyExists(absentInner, 'listPrice')).toBe(false);
    expect(structKeyExists(undefinedInner, 'listPrice')).toBe(true);

    expect(structGet(absentInner, 'listPrice')).toBeUndefined();
    expect(structGet(undefinedInner, 'listPrice')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cfEquals - the CFML `eq` operator as the currency cascade uses it.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/Sku.cfc:L385]: the base-currency step selects with
// `if(thisCurrency.getCurrencyCode() eq this.setting('skuCurrency'))`. CFML parity
// [model/entity/Sku.cfc:L400]: the override step matches with
// `if(getSkuCurrencies()[c].getCurrencyCode() eq thisCurrency.getCurrencyCode())`, which is what
// lets an override OVERWRITE the base-step entry. Both are CFML `eq`, and CFML `eq` is
// case-insensitive.
describe('cfFoldKey supplies CFML struct identity to a Map or Set', () => {
  // WHY IT IS PUBLISHED: some ported CFML struct state is a `Map` or a `Set` rather than a plain
  // object - a request-scoped memo keyed by identifier, a visited-set guarding a hierarchy walk -
  // and those compare keys with SameValueZero, which is case-SENSITIVE. A cycle guard keyed by a
  // raw identifier could be re-entered forever by a parent link differing only in case, because the
  // predicate that loaded the row is itself case-insensitive.
  it('answers one comparison form for every casing of a key', () => {
    expect(cfFoldKey('USD')).toBe(cfFoldKey('usd'));
    expect(cfFoldKey('PGFX-Rule-1')).toBe(cfFoldKey('pgfx-rule-1'));
    expect(cfFoldKey('ABC123')).toBe(cfFoldKey('abc123'));
  });

  it('agrees with cfEquals and with structGet, because it is the same fold', () => {
    // The property that matters is not the exact form returned but that a `Map` keyed through this
    // function and an object read through `structGet` can never disagree about identity.
    for (const [left, right] of [
      ['USD', 'usd'],
      ['skuCurrency', 'SKUCURRENCY'],
      ['a', 'A'],
      ['USD', 'EUR'],
      [' USD', 'USD'],
    ] as const) {
      expect(cfFoldKey(left) === cfFoldKey(right)).toBe(cfEquals(left, right));
    }
  });

  it('does not trim, transliterate or shorten - it folds case and nothing else', () => {
    // Both JUDGMENT CALLs recorded on the module-local fold apply: whitespace is significant, so
    // `' usd'` is a different key from `'usd'`, and the fold is locale-independent.
    expect(cfFoldKey(' usd')).not.toBe(cfFoldKey('usd'));
    expect(cfFoldKey('usd ')).not.toBe(cfFoldKey('usd'));
    expect(cfFoldKey('')).toBe('');
    expect(cfFoldKey('already-folded')).toBe('already-folded');
  });

  it('collapses a Set the way a CFML struct collapsed its keys', () => {
    const visited = new Set<string>();

    for (const spelling of ['abc', 'ABC', 'AbC']) {
      visited.add(cfFoldKey(spelling));
    }

    expect(visited.size).toBe(1);
    expect(visited.has(cfFoldKey('aBc'))).toBe(true);
  });
});

describe('cfEquals reproduces the case-insensitive CFML eq on currency codes', () => {
  it('compares two present codes without regard to case', () => {
    const skuCurrency = 'USD';

    expect(cfEquals('USD', skuCurrency)).toBe(true);
    expect(cfEquals('usd', skuCurrency)).toBe(true);
    expect(cfEquals('UsD', skuCurrency)).toBe(true);
    expect(cfEquals('EUR', skuCurrency)).toBe(false);
  });

  // A NULLISH OPERAND RAISES, WHICH IS THE CFML ANSWER.
  //   Passing a null into `eq` raises in CFML, so this raises too. Returning
  //   `false` would relocate the harm rather than avoid it: on the cascade at
  //   [model/entity/Sku.cfc:L385] `false` already MEANS "these are different
  //   currencies", so answering `false` for "one of these is not a currency code at
  //   all" is indistinguishable from a definite negative: the base-currency step
  //   is silently skipped and the fault surfaces only when
  //   `getPriceByCurrencyCode` returns `undefined` elsewhere. Raising stops at the
  //   comparison that could not be made, so
  //   `cfEquals(undefined, undefined)` does not return `false` where
  //   `undefined === undefined` is `true` - it refuses the question.
  it('raises for two nullish operands rather than answering either way', () => {
    expect(() => cfEquals(null, null)).toThrow(CfmlComparisonError);
    expect(() => cfEquals(undefined, undefined)).toThrow(CfmlComparisonError);
    expect(() => cfEquals(null, undefined)).toThrow(CfmlComparisonError);
    expect(() => cfEquals(undefined, null)).toThrow(CfmlComparisonError);
  });

  it('raises when either operand is nullish beside a present code', () => {
    expect(() => cfEquals(undefined, 'USD')).toThrow(CfmlComparisonError);
    expect(() => cfEquals('USD', undefined)).toThrow(CfmlComparisonError);
    expect(() => cfEquals(null, 'USD')).toThrow(CfmlComparisonError);
    expect(() => cfEquals('USD', null)).toThrow(CfmlComparisonError);
  });

  // The message has to say WHICH operand was absent and what survived, because on the cascade path
  // the survivor is the clue to where the missing one should have come from: if `'USD'` survived,
  // the setting resolved and the row did not.
  it('names the absent operand and reports the surviving one', () => {
    expect(() => cfEquals(undefined, 'USD')).toThrow(/operand "a"/);
    expect(() => cfEquals('USD', undefined)).toThrow(/operand "b"/);

    expect(() => cfEquals(undefined, 'USD')).toThrow(/"USD"/);
    expect(() => cfEquals('EUR', null)).toThrow(/"EUR"/);
  });

  // `null` and `undefined` arrive from different places - a hydrated SQL NULL versus an unset
  // property or a missed struct read - so the message keeps them apart instead of flattening both
  // to "nullish".
  it('distinguishes null from undefined in the reported operand', () => {
    expect(() => cfEquals(null, 'USD')).toThrow(/received null as operand/);
    expect(() => cfEquals(undefined, 'USD')).toThrow(/received undefined as operand/);
    expect(() => cfEquals('USD', null)).toThrow(/received null as operand/);
    expect(() => cfEquals('USD', undefined)).toThrow(/received undefined as operand/);
  });

  // Quoting the survivor keeps an EMPTY one visibly different from an ABSENT one, the very
  // distinction this error exists to protect, since `''` is an ordinary string that compares
  // normally.
  it('quotes the surviving operand so an empty one is not mistaken for absent', () => {
    expect(() => cfEquals(null, '')).toThrow(/being ""/);
    expect(() => cfEquals(null, undefined)).toThrow(/being undefined/);
    expect(() => cfEquals(undefined, null)).toThrow(/being null/);
  });

  // A currency code is three characters, so a long survivor is itself evidence of a different
  // fault, and an unbounded message would put caller-supplied text of arbitrary length into a log
  // line.
  it('bounds the surviving operand it reproduces', () => {
    const overlong = 'C'.repeat(500);

    let message = '';
    try {
      cfEquals(null, overlong);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toBe('');
    expect(message.length).toBeLessThan(overlong.length);
    expect(message).toContain('...');
  });

  it('raises a named Error subclass', () => {
    let caught: unknown;
    try {
      cfEquals('USD', undefined);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CfmlComparisonError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('CfmlComparisonError');
  });

  it('checks the first operand before the second', () => {
    expect(() => cfEquals(null, undefined)).toThrow(/operand "a"/);
  });

  // An empty string is an ordinary CFML string value rather than an absent one, so it compares
  // normally. Whitespace is significant here for the same reason it is significant in key matching:
  // only case is folded, never whitespace.
  it('compares empty strings normally and keeps whitespace significant', () => {
    expect(cfEquals('', '')).toBe(true);
    expect(cfEquals('', 'USD')).toBe(false);
    expect(cfEquals(' USD', 'USD')).toBe(false);
    expect(cfEquals(' usd', ' USD')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// structFindKey - the canonical spelling of a key.
// ---------------------------------------------------------------------------
// The legacy engine had no equivalent because CFML never needed one: the engine owns the key store.
// This is the one primitive here that is a target addition rather than a port, and it exists so a
// caller can write back under the key ALREADY in use instead of adding a second entry differing
// only by case.
describe('structFindKey reports the key as it is actually stored', () => {
  it('returns the stored spelling rather than the spelling asked for', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structFindKey(currencyDetails, 'usd')).toBe('USD');
    expect(structFindKey(currencyDetails, 'Usd')).toBe('USD');
    expect(structFindKey(currencyDetails, 'USD')).toBe('USD');
  });

  it('yields undefined when no own key matches', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structFindKey(currencyDetails, 'EUR')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// structKeyList - the stored keys, as a fresh array.
// ---------------------------------------------------------------------------
describe('structKeyList returns stored keys as a fresh array', () => {
  it('preserves insertion order and original casing', () => {
    const currencyDetails = {
      USD: { price: '19.99' },
      CAD: { price: '26.49' },
      EUR: { price: '18.25' },
    };

    expect(structKeyList(currencyDetails)).toEqual(['USD', 'CAD', 'EUR']);
  });

  it('allocates a new array on every call', () => {
    const currencyDetails = {
      USD: { price: '19.99' },
      CAD: { price: '26.49' },
      EUR: { price: '18.25' },
    };

    const first = structKeyList(currencyDetails);
    const second = structKeyList(currencyDetails);

    expect(first).not.toBe(second);
    expect(first).toEqual(second);

    first.sort();

    expect(first).toEqual(['CAD', 'EUR', 'USD']);
    expect(structKeyList(currencyDetails)).toEqual(['USD', 'CAD', 'EUR']);
    expect(second).toEqual(['USD', 'CAD', 'EUR']);
  });
});

// ---------------------------------------------------------------------------
// A case-only key collision.
// ---------------------------------------------------------------------------
// JUDGMENT CALL: on a collision the FIRST match in insertion order wins.
//   CFML cannot represent a struct holding both `'price'` and `'Price'`, so this
//   state is unreachable from ported CFML and there is no legacy behaviour to
//   preserve. It IS reachable in TypeScript from a plain object hydrated elsewhere,
//   so it needs a defined answer rather than an accident. The module returns the
//   first matching own key in insertion order. It does NOT throw - on a money path
//   that would turn an ambiguous price map into a server error instead of a value -
//   and it does NOT merge the entries, which would fabricate a value never stored.
describe('a case-only key collision resolves to the first key in insertion order', () => {
  it('returns the first match, and neither throws nor merges', () => {
    const collided = { price: 'a', Price: 'b' };

    expect(structGet(collided, 'PRICE')).toBe('a');
    expect(structGet(collided, 'price')).toBe('a');
    expect(structGet(collided, 'Price')).toBe('a');
    expect(structFindKey(collided, 'PRICE')).toBe('price');

    expect(structKeyList(collided)).toEqual(['price', 'Price']);
    expect(structKeyExists(collided, 'PRICE')).toBe(true);
  });

  it('follows insertion order rather than any preferred casing', () => {
    const reversed = { Price: 'b', price: 'a' };

    expect(structGet(reversed, 'PRICE')).toBe('b');
    expect(structFindKey(reversed, 'price')).toBe('Price');
  });
});

// ---------------------------------------------------------------------------
// Purity - reading never writes.
// ---------------------------------------------------------------------------
describe('every export is pure and leaves its input untouched', () => {
  it('mutates neither level of the struct, on hits or on misses', () => {
    const usdDetail = { skuCurrencyID: '', price: '19.99' };
    const currencyDetails = { USD: usdDetail, CAD: { skuCurrencyID: '', price: '26.49' } };

    const outerKeysBefore = Object.keys(currencyDetails);
    const innerKeysBefore = Object.keys(usdDetail);

    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);
    expect(structKeyExists(currencyDetails, 'EUR')).toBe(false);
    expect(structFindKey(currencyDetails, 'usd')).toBe('USD');
    expect(structFindKey(currencyDetails, 'EUR')).toBeUndefined();
    expect(structKeyList(currencyDetails)).toEqual(['USD', 'CAD']);
    expect(structGet(currencyDetails, 'USD')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'EUR')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'USD', 'price')).toBe('19.99');
    expect(structGetPath(currencyDetails, 'USD', 'listPrice')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'EUR', 'price')).toBeUndefined();
    expect(cfEquals('usd', 'USD')).toBe(true);

    expect(Object.keys(currencyDetails)).toEqual(outerKeysBefore);
    expect(Object.keys(usdDetail)).toEqual(innerKeysBefore);

    expect(structGet(currencyDetails, 'USD')).toBe(usdDetail);
    expect(usdDetail).toEqual({ skuCurrencyID: '', price: '19.99' });
  });
});

// ---------------------------------------------------------------------------
// Prototype safety - own enumerable keys only.
// ---------------------------------------------------------------------------
// The module matches keys through `Object.keys(...)` and narrows with
// `Object.prototype.hasOwnProperty.call(...)`, never a bare `key in struct` and never a bare
// indexed read on an unresolved key, so an inherited member is never a CANDIDATE rather than being
// filtered out afterwards. A currency map is keyed by strings that arrived from a database row, so
// a lookup consulting the prototype chain could report a price for a code that merely collides with
// an Object member name. `'__proto__'` therefore appears below only as a string ARGUMENT to a
// lookup, never as an object-literal key, which would set the prototype.
describe('inherited members are never treated as struct keys', () => {
  it('reports no inherited member as present', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structKeyExists(currencyDetails, 'toString')).toBe(false);
    expect(structKeyExists(currencyDetails, 'constructor')).toBe(false);
    expect(structKeyExists(currencyDetails, 'hasOwnProperty')).toBe(false);
    expect(structKeyExists(currencyDetails, '__proto__')).toBe(false);
    expect(structKeyExists(currencyDetails, 'valueOf')).toBe(false);
    expect(structKeyExists(currencyDetails, 'propertyIsEnumerable')).toBe(false);
  });

  it('reads no inherited member as a value', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structGet(currencyDetails, 'toString')).toBeUndefined();
    expect(structGet(currencyDetails, 'constructor')).toBeUndefined();
    expect(structGet(currencyDetails, '__proto__')).toBeUndefined();
    expect(structGet(currencyDetails, 'hasOwnProperty')).toBeUndefined();
    expect(structGet(currencyDetails, 'valueOf')).toBeUndefined();
  });

  it('finds no inherited member as a key, and lists none of them', () => {
    const currencyDetails = { USD: { price: '19.99' }, CAD: { price: '26.49' } };

    expect(structFindKey(currencyDetails, 'toString')).toBeUndefined();
    expect(structFindKey(currencyDetails, '__proto__')).toBeUndefined();
    expect(structKeyList(currencyDetails)).toEqual(['USD', 'CAD']);
    expect(structKeyList(currencyDetails)).not.toContain('toString');
    expect(structKeyList(currencyDetails)).not.toContain('constructor');
    expect(structKeyList(currencyDetails)).not.toContain('__proto__');
  });

  it('does not reach an inherited member through the inner level either', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structGetPath(currencyDetails, 'USD', 'toString')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'USD', '__proto__')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'toString', 'price')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The key-access shapes the ported slice actually uses.
// ---------------------------------------------------------------------------
// Each shape below was read from the source, so the primitives are pinned against real call sites
// rather than invented ones.
describe('the key-access shapes the ported slice actually uses', () => {
  // CFML parity [model/service/PromotionService.cfc:L148]: exists-then-read on the SAME key,
  // against a heterogeneous struct, and on a MONEY value:
  //   `if(structKeyExists(salePriceDetails, "salePrice") && salePriceDetails.salePrice < ...)`
  // The comparison half belongs to `Money`; pinned here is the presence test and the read that
  // follows it.
  it('supports exists-then-read on the same key, on a money value', () => {
    const salePriceDetails = { salePrice: '17.99', salePriceExpirationDateTime: '' };

    expect(structKeyExists(salePriceDetails, 'salePrice')).toBe(true);
    expect(structGet(salePriceDetails, 'salePrice')).toBe('17.99');

    const withoutSalePrice = { salePriceExpirationDateTime: '' };

    expect(structKeyExists(withoutSalePrice, 'salePrice')).toBe(false);
    expect(structGet(withoutSalePrice, 'salePrice')).toBeUndefined();
  });

  // CFML parity [model/service/PromotionService.cfc:L260-L263]: a `!structKeyExists(...)` guard
  // followed by initialising the key to a blank array. The accumulator is keyed by order-item ID
  // under the misspelled identifier `orderItemQulifiedDiscounts`, which also appears at :L152 - a
  // data-contract identifier owned by the service layer, neither renamed nor corrected here.
  it('supports the absent-then-initialise guard used by the discount accumulator', () => {
    const orderItemDiscounts: Record<string, string[]> = {};
    const orderItemID = 'aa1b2c3d4e5f60718293a4b5c6d7e8f9';

    expect(structKeyExists(orderItemDiscounts, orderItemID)).toBe(false);
    expect(structGet(orderItemDiscounts, orderItemID)).toBeUndefined();

    orderItemDiscounts[orderItemID] = [];

    expect(structKeyExists(orderItemDiscounts, orderItemID.toUpperCase())).toBe(true);
    expect(structGet(orderItemDiscounts, orderItemID.toUpperCase())).toEqual([]);
  });

  // CFML parity [model/service/SkuService.cfc:L142, L147, L175]: the exists-OR-empty compound
  // predicate, `if(!structKeyExists(arguments.data, "x") || !listLen(arguments.data.x))`. Only the
  // presence half is pinned here; the emptiness half is list semantics. One asymmetry owned by the
  // service layer: at [model/service/SkuService.cfc:L163] the renewal-benefit loop reads
  // `arguments.data.renewalSubscriptionBenefits` with NO presence guard, unlike the benefits key
  // guarded at :L142 and consumed at :L160.
  it('supports the presence half of the exists-or-empty compound predicate', () => {
    const data = { subscriptionBenefits: '1,2', subscriptionTerms: '3' };

    expect(structKeyExists(data, 'subscriptionBenefits')).toBe(true);
    expect(structKeyExists(data, 'SUBSCRIPTIONTERMS')).toBe(true);
    expect(structKeyExists(data, 'accessContents')).toBe(false);
    expect(structKeyExists(data, 'renewalSubscriptionBenefits')).toBe(false);
    expect(structGet(data, 'renewalSubscriptionBenefits')).toBeUndefined();
  });

  // CFML parity [model/entity/Sku.cfc:L294, L299]: `structKeyExists(arguments, "locationID")` and
  // `structKeyExists(arguments, "stockID")` test the CFML `arguments` SCOPE - optional-parameter
  // presence testing that happens to use the same built-in. In the target those become ordinary
  // optional parameters checked by the compiler, so no `arguments`-scope emulator is built or
  // tested.
  it('does not emulate the CFML arguments scope', () => {
    const quantityRequest = { quantityType: 'QATS', locationID: 'location-1' };

    expect(structKeyExists(quantityRequest, 'LOCATIONID')).toBe(true);
    expect(structKeyExists(quantityRequest, 'stockID')).toBe(false);
    expect(structGet(quantityRequest, 'locationid')).toBe('location-1');
    expect(structGet(quantityRequest, 'stockid')).toBeUndefined();
  });

  // CFML parity [model/dao/ProductDAO.cfc:L259]: bracket-notation access with a dynamic string key,
  // two levels deep - `data['productcontent_page'][r]`. Dynamic keys reach the data layer too, and
  // a two-level bracket read is exactly the shape `structGetPath` covers.
  it('covers a two-level bracket-shaped read with a dynamic outer key', () => {
    const importData: CfStruct<CfStruct<string>> = {
      productcontent_page: { firstRow: 'about-us', secondRow: 'contact-us' },
    };
    const columnName = 'productcontent_page';

    expect(structGetPath(importData, columnName, 'firstRow')).toBe('about-us');
    expect(structGetPath(importData, 'PRODUCTCONTENT_PAGE', 'SECONDROW')).toBe('contact-us');
    expect(structGetPath(importData, columnName, 'thirdRow')).toBeUndefined();
    expect(structGetPath(importData, 'productcontent_pages', 'firstRow')).toBeUndefined();
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L53, L68-L76]: the slice's second struct
  // shape is a plain keyed dictionary rather than a currency map. It is initialised at :L53, its
  // memo-miss guard is a `!structKeyExists(...)` at :L68, it is populated with
  // `roundingRuleExpression` and `roundingRuleDirection` at :L72-L74 and read back at :L76; a
  // presence-guarded key-removal step sits at :L58-L59. Its keys are rounding-rule UUIDs rather
  // than currency codes, so this case pins that an opaque UUID-shaped key behaves identically. That
  // memo becomes REQUEST-SCOPED state owned by the service layer, because module-level state
  // survives between unrelated invocations on a warm Lambda container; the module under test holds
  // no cache.
  it('treats an opaque UUID-shaped key exactly like a currency code', () => {
    const roundingRuleID = '4028818e3b1f4c2a9d5e6f7081920a3b';
    const roundingRuleDetails = {
      [roundingRuleID]: { roundingRuleExpression: '.99', roundingRuleDirection: 'Closest' },
    };

    expect(structKeyExists(roundingRuleDetails, roundingRuleID)).toBe(true);
    expect(structKeyExists(roundingRuleDetails, roundingRuleID.toUpperCase())).toBe(true);

    expect(structGetPath(roundingRuleDetails, roundingRuleID, 'roundingRuleExpression')).toBe(
      '.99',
    );
    expect(
      structGetPath(roundingRuleDetails, roundingRuleID.toUpperCase(), 'ROUNDINGRULEDIRECTION'),
    ).toBe('Closest');

    const unknownRoundingRuleID = 'ffffffffffffffffffffffffffffffff';

    expect(structKeyExists(roundingRuleDetails, unknownRoundingRuleID)).toBe(false);
    expect(structGet(roundingRuleDetails, unknownRoundingRuleID)).toBeUndefined();
    expect(
      structGetPath(roundingRuleDetails, unknownRoundingRuleID, 'roundingRuleExpression'),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The case-binding hazards that make this module necessary.
// ---------------------------------------------------------------------------
// Six sites in the in-scope entities bind ONE slot under two different casings, which CFML resolves
// silently because identifiers there are case-insensitive, and all six were read verbatim from the
// source.
//
// WHAT THE TARGET MUST DO - stated once, applying to all six: each hazard is ONE canonical binding
// and must be reproduced as ONE TypeScript identifier or ONE struct key. Two DISTINCT identifiers
// would split one slot in two, with one half silently never read - a behavioural change rather than
// a faithful port.
describe('a case-varied binding resolves to one canonical entry', () => {
  // CFML parity [model/entity/ProductType.cfc:L101-L107]: `setProducts(required array Products)`
  // declares a capital `Products`, clears `variables.Products = [];` at :L103 and iterates
  // `arguments.Products` at :L104, while the persistent property it maintains is `products`.
  it('binds ProductType products under one key despite the capitalised parameter', () => {
    const productTypeState = { products: ['first-product', 'second-product'] };

    expect(structGet(productTypeState, 'Products')).toBe(structGet(productTypeState, 'products'));
    expect(structGet(productTypeState, 'PRODUCTS')).toEqual(['first-product', 'second-product']);
    expect(structKeyList(productTypeState)).toEqual(['products']);
  });

  // CFML parity [model/entity/Brand.cfc:L101-L102]: `removeProduct(required any product)` declares
  // a lowercase `product`, and its body at :L102 calls `arguments.Product.removeBrand(this)` with a
  // capital P.
  it('binds the Brand removeProduct argument under one key despite the capital P', () => {
    const removeProductArguments = { product: { productID: 'first-product' } };

    expect(structGet(removeProductArguments, 'Product')).toBe(
      structGet(removeProductArguments, 'product'),
    );
    expect(structGetPath(removeProductArguments, 'Product', 'PRODUCTID')).toBe('first-product');
    expect(structKeyList(removeProductArguments)).toEqual(['product']);
  });

  // CFML parity [model/entity/PromotionCode.cfc:L101-L106]: `setPromotion(required any promotion)`
  // assigns `variables.promotion` at :L102, then at :L105 calls
  // `arrayAppend(arguments.Promotion.getPromotionCodes(), this)` with a capital P.
  it('binds the PromotionCode promotion argument under one key', () => {
    const setPromotionArguments = { promotion: { promotionID: 'first-promotion' } };

    expect(structGet(setPromotionArguments, 'Promotion')).toBe(
      structGet(setPromotionArguments, 'promotion'),
    );
    expect(structGetPath(setPromotionArguments, 'PROMOTION', 'promotionID')).toBe(
      'first-promotion',
    );
    expect(structKeyList(setPromotionArguments)).toEqual(['promotion']);
  });

  // CFML parity [model/entity/OptionGroup.cfc:L70, L73-L79]: the property is declared `options` at
  // :L70, yet the accessor
  //   `getOptions(orderby, sortType="text", direction="asc")`
  // returns `variables.Options` at :L75 and passes it again at :L77 - a capital O both times. The
  // parameter `orderby` is itself declared lowercase and presence-tested as `"orderby"` at :L74.
  it('binds OptionGroup options under one key despite the capital O', () => {
    const optionGroupState = { options: ['small', 'medium', 'large'] };

    expect(structGet(optionGroupState, 'Options')).toBe(structGet(optionGroupState, 'options'));
    expect(structGet(optionGroupState, 'OPTIONS')).toEqual(['small', 'medium', 'large']);
    expect(structKeyList(optionGroupState)).toEqual(['options']);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L103, L140, L149, L150]: the local is declared
  // `excludedProductTypesList` at :L103 and assigned at :L140, but the guard at :L149 tests
  // `excludedproductTypesList` with a lowercase p before :L150 reads the declared spelling again.
  it('binds the PriceGroupRate excluded-product-types list under one key', () => {
    const appliesToLocals = { excludedProductTypesList: '2 Product Types' };

    expect(structKeyExists(appliesToLocals, 'excludedproductTypesList')).toBe(true);
    expect(structGet(appliesToLocals, 'excludedproductTypesList')).toBe('2 Product Types');
    expect(structGet(appliesToLocals, 'EXCLUDEDPRODUCTTYPESLIST')).toBe('2 Product Types');
    expect(structKeyList(appliesToLocals)).toEqual(['excludedProductTypesList']);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L101, L118, L126, L127]: the SECOND hazard inside
  // the same function: `getAppliesTo()` spans :L95-L155. The local is declared
  //   `var skusList = "";`
  // at :L101 with a lowercase s, then assigned as `SkusList` at :L118 and read as `SkusList` at
  // :L126 and :L127.
  it('binds the PriceGroupRate skus list under one key despite the capital S', () => {
    const appliesToLocals = { skusList: '3 SKUs' };

    expect(structKeyExists(appliesToLocals, 'SkusList')).toBe(true);
    expect(structGet(appliesToLocals, 'SkusList')).toBe('3 SKUs');
    expect(structFindKey(appliesToLocals, 'SKUSLIST')).toBe('skusList');
    expect(structKeyList(appliesToLocals)).toEqual(['skusList']);
  });
});

// ---------------------------------------------------------------------------
// The in-source proofs that justify this module existing at all.
// ---------------------------------------------------------------------------
// Three demonstrations, each counted or read directly from the source:
//
//   1. [model/entity/PriceGroupRate.cfc] does not hold one spelling of an ORM
//      attribute even across a single property block: `ormtype` at :L52, `ormType`
//      at :L53-L55, back to `ormtype` at :L58. It is lowercase at
//      [model/entity/OptionGroup.cfc:L57] and [model/entity/Promotion.cfc:L56].
//   2. One expression calls two list built-ins with different casing side by side,
//      `ListDeleteAt` wrapping `listFindNoCase`, at
//      [model/service/PromotionService.cfc:L774]: CFML FUNCTION names are
//      case-insensitive too, not only struct keys.
//   3. Most tellingly, the built-in this module reproduces has its own name spelled
//      three ways across the model layer: `structKeyExists` 650 times,
//      `StructKeyExists` 5 and `structkeyExists` twice - 657 in total, breaking
//      down as 224 in model/service, 392 in model/entity and 41 in model/dao, of
//      which 20 fall in the six services this migration ports. A case-SENSITIVE
//      search for the common spelling misses exactly 7 of them.
//
// That is the reason no ported lookup may assume the casing of a key it was handed.
describe('case-insensitivity is total, not partial', () => {
  it('matches every casing of one key to the same single entry', () => {
    const settingValues = { skuCurrency: 'USD' };

    for (const spelling of ['skuCurrency', 'SKUCURRENCY', 'skucurrency', 'SkUcUrReNcY']) {
      expect(structKeyExists(settingValues, spelling)).toBe(true);
      expect(structGet(settingValues, spelling)).toBe('USD');
      expect(structFindKey(settingValues, spelling)).toBe('skuCurrency');
    }

    expect(structKeyList(settingValues)).toEqual(['skuCurrency']);
  });
});

// ---------------------------------------------------------------------------
// OWNED ELSEWHERE - deliberately not covered here.
// ---------------------------------------------------------------------------
// Recorded so the boundary is explicit rather than accidental:
//
//   * The `getCurrencyDetails()` cascade itself, and the three currency accessors
//     as entity methods, belong to sku.test.ts.
//   * Two entity memo bugs sit immediately beside that cascade, so their ownership
//     is stated rather than assumed. [model/entity/Sku.cfc:L500-L510] guards on
//     `!structKeyExists(variables, "optionsByOptionGroupCodeStruct")` at :L501 but
//     initialises a DIFFERENT key at :L502; and [model/entity/Sku.cfc:L512-L522]
//     initialises `variables.optionsByOptionGroupIDStruct` at :L514, populates a
//     third spelling `variables.OptionsByGroupIDStruct` at :L517 and returns the
//     first at :L521, discarding the populated struct. Both belong to sku.test.ts.
//   * List semantics belong to list.test.ts, truthiness to truthiness.test.ts,
//     formatting to numberFormat.test.ts and arithmetic to precision.test.ts, as do
//     the request-scoped rounding-rule memo and the misspelled accumulator key.
// ---------------------------------------------------------------------------

// ===========================================================================
// findPrototypeKeyPath - relocated with the implementation it covers
// ===========================================================================
//
// ★★★ THESE CASES WERE THEIR OWN SUITE, `tests/unit/lib/jsonDocumentKeys.test.ts`. They moved here
// because the implementation moved: `findPrototypeKeyPath` is now part of `src/lib/cfml/struct.ts`,
// for the scope-census reason recorded at that section. AAP 0.9.4 requires every in-scope module to
// carry coverage, so the cases are relocated in full rather than dropped - not one assertion is
// lost, and the count below is the count that stood before the move.
//
// They are appended rather than interleaved so that a reviewer diffing against the deleted suite
// sees an unbroken block.

/**
 * Parse a document the way the handlers do, and refuse to hand back anything but an object.
 *
 * The narrowing is the point: `findPrototypeKeyPath` declares `object`, and both call sites have
 * already established that much before they reach it. A helper that returned `unknown` would push a
 * cast into every case.
 *
 * Relocated with the cases below, unchanged. It is module-local rather than exported because it is a
 * fixture parser for this block alone.
 */
function parseDocument(text: string): object {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`the fixture ${text} did not parse to an object`);
  }

  return parsed;
}

describe('findPrototypeKeyPath', () => {
  describe('the documents it must REFUSE', () => {
    it('★★ finds a `__proto__` own key at the ROOT', () => {
      // The exact body QA testing submitted to the price-resolution endpoint. Before this guard it
      // was accepted: zod's `strictObject` reported no unrecognized key even though `Object.keys`
      // lists it, and the request went on to be priced.
      expect(
        findPrototypeKeyPath(parseDocument('{"operation":"x","__proto__":{"polluted":1}}')),
      ).toBe('__proto__');
    });

    it('★★★ finds one NESTED inside a member, which is the case a root-only guard would miss', () => {
      // The measured asymmetry this module exists for: at this same position a `constructor` key is
      // REFUSED by the strict object with `unrecognized_keys`, while `__proto__` is accepted and
      // dropped. The path names the member so the caller can find it.
      expect(
        findPrototypeKeyPath(parseDocument('{"order":{"orderID":"o-1","__proto__":{"p":1}}}')),
      ).toBe('order.__proto__');
    });

    it('★★ finds one inside an ARRAY ELEMENT, and names the element by index', () => {
      // Array indices are spelled as the AAP's own field paths spell them - `order.orderItems.1.…` -
      // so a refusal reads the same way as every other field issue this service publishes.
      expect(
        findPrototypeKeyPath(
          parseDocument(
            '{"order":{"orderItems":[{"skuID":"s-1"},{"skuID":"s-2","__proto__":{"p":1}}]}}',
          ),
        ),
      ).toBe('order.orderItems.1.__proto__');
    });

    it('reports the FIRST offending key in document order when there are several', () => {
      // Determinism, so a suite can assert an exact path rather than a set, and so two runs on the
      // same body produce the same refusal. Depth-first over own keys in insertion order.
      expect(
        findPrototypeKeyPath(
          parseDocument('{"a":{"__proto__":{"p":1}},"b":{"__proto__":{"p":2}}}'),
        ),
      ).toBe('a.__proto__');
    });

    it('finds one several levels down, past objects and arrays alike', () => {
      expect(
        findPrototypeKeyPath(parseDocument('{"a":[{"b":{"c":[{"__proto__":{"p":1}}]}}]}')),
      ).toBe('a.0.b.c.0.__proto__');
    });

    it('finds a `__proto__` key whose VALUE is a harmless scalar, not only an object', () => {
      // The guard is about the KEY. A caller sending `"__proto__": "x"` is sending a member this
      // request does not accept, exactly as one sending an object is, and the reason it is refused
      // does not depend on what would have happened had it been merged somewhere.
      expect(findPrototypeKeyPath(parseDocument('{"__proto__":"x"}'))).toBe('__proto__');
      expect(findPrototypeKeyPath(parseDocument('{"__proto__":null}'))).toBe('__proto__');
    });
  });

  describe('the documents it must ADMIT', () => {
    it('★★★ answers `undefined` for an ORDINARY document, which is the happy path of every request', () => {
      expect(
        findPrototypeKeyPath(
          parseDocument(
            '{"operation":"updateOrderAmountsWithPromotions","order":{"orderID":"o-1",' +
              '"orderItems":[{"orderItemID":"oi-1","skuID":"s-1","quantity":2}]}}',
          ),
        ),
      ).toBeUndefined();
    });

    it('★★ does not report the INHERITED `__proto__` every object carries', () => {
      // The whole guard would be useless the other way round: `'__proto__' in {}` is `true` for every
      // ordinary object, so an `in` test would refuse every request ever sent. `Object.hasOwn` is what
      // distinguishes a key the CALLER wrote from one the language provides.
      const ordinary = parseDocument('{"a":1}');

      expect('__proto__' in ordinary).toBe(true);
      expect(Object.hasOwn(ordinary, '__proto__')).toBe(false);
      expect(findPrototypeKeyPath(ordinary)).toBeUndefined();
    });

    it('admits a member merely NAMED like the key, without matching it', () => {
      // Substring and prefix matching would both refuse these. The test is key equality.
      expect(
        findPrototypeKeyPath(
          parseDocument('{"proto":1,"_proto_":2,"__proto":3,"proto__":4,"__prototype__":5}'),
        ),
      ).toBeUndefined();
    });

    it('admits `constructor` and `prototype`, which are NOT this module\u2019s concern', () => {
      // `constructor` is already refused by every `strictObject` in this service as an ordinary
      // unrecognized key - measured, and recorded on the module - so refusing it a second time here
      // would duplicate a rule that already works and would change the reason a caller is given.
      expect(
        findPrototypeKeyPath(parseDocument('{"constructor":{"a":1},"prototype":{"b":2}}')),
      ).toBeUndefined();
    });

    it('admits an empty object and an empty array', () => {
      expect(findPrototypeKeyPath(parseDocument('{}'))).toBeUndefined();
      expect(findPrototypeKeyPath(parseDocument('[]'))).toBeUndefined();
    });

    it('traverses `null` members and scalars without faulting', () => {
      // `typeof null === 'object'`, so a walk that reached `Object.hasOwn(null, …)` would THROW - and
      // a security guard that throws converts a refusal into an unrecognized 500.
      expect(
        findPrototypeKeyPath(parseDocument('{"a":null,"b":1,"c":"x","d":true,"e":[null,null]}')),
      ).toBeUndefined();
    });
  });

  describe('the properties that keep it from becoming a failure of its own', () => {
    it('★★★ survives 10 000 levels of nesting WITHOUT a stack overflow', () => {
      // The reason the walk is iterative rather than recursive. QA testing sent a 2 000-level document
      // to this very endpoint; a recursive implementation raises `RangeError: Maximum call stack size
      // exceeded`, which `./errorMapper.js` would map to an unrecognized 500 - a guard added for
      // robustness becoming the outage. Ten thousand is deeper than anything a bounded body can carry,
      // and it is asserted on BOTH answers so neither the miss nor the hit path recurses.
      const depth = 10_000;
      const clean = `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;
      const offending = `${'{"a":'.repeat(depth)}{"__proto__":1}${'}'.repeat(depth)}`;

      expect(findPrototypeKeyPath(parseDocument(clean))).toBeUndefined();
      expect(findPrototypeKeyPath(parseDocument(offending))).toBe(`${'a.'.repeat(depth)}__proto__`);
    });

    it('survives a WIDE document, and one holding a long array', () => {
      const wide = `{${Array.from({ length: 5_000 }, (_unused, index) => `"k${String(index)}":${String(index)}`).join(',')}}`;
      const long = `{"a":[${Array.from({ length: 5_000 }, () => '{"b":1}').join(',')}]}`;

      expect(findPrototypeKeyPath(parseDocument(wide))).toBeUndefined();
      expect(findPrototypeKeyPath(parseDocument(long))).toBeUndefined();
    });

    it('★★ MUTATES NOTHING - neither the document it walks nor `Object.prototype`', () => {
      // A guard against prototype pollution that polluted anything would be self-defeating, and a
      // guard that deleted the offending key would be making a decision the CALLER should be told
      // about instead. This asserts the reporting-only contract.
      const document = parseDocument('{"a":1,"__proto__":{"polluted":"yes"}}');
      const before = JSON.stringify(document);

      expect(findPrototypeKeyPath(document)).toBe('__proto__');
      expect(JSON.stringify(document)).toBe(before);
      expect(Object.hasOwn(document, '__proto__')).toBe(true);

      // And the finding's own central observation, re-asserted here rather than taken on trust: the
      // parse itself never reached the prototype setter.
      expect(Object.prototype).not.toHaveProperty('polluted');
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('is a pure function of its argument, answering identically on repeat calls', () => {
      const document = parseDocument('{"order":{"__proto__":{"p":1}}}');

      expect(findPrototypeKeyPath(document)).toBe('order.__proto__');
      expect(findPrototypeKeyPath(document)).toBe('order.__proto__');
    });
  });
});
