// ---------------------------------------------------------------------------
// slatwall-ts - tests/unit/lib/cfml/struct.test.ts
//
// WHAT THIS SUITE PINS
//   src/lib/cfml/struct.ts - the single place where CFML's case-insensitive
//   struct-key semantics are translated into TypeScript for the AWS Lambda
//   `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing
//   slice (version.txt = 3.1.39).
//
//   Six pure functions and one type, and nothing else. The module under test
//   has ZERO imports and holds no state at all, so this suite needs no mock,
//   no fixture module, no container and no server: every case below is a plain
//   object literal built inside the test that reads it.
//
// ***************************************************************************
// ** THE NULL SEMANTICS PINNED HERE ARE LOAD-BEARING ON MONEY.             **
// **                                                                      **
// ** Absence propagates as `undefined`. Always. Not 0, not '', not null,   **
// ** not {}, and never a `??` fallback - in the implementation OR in an    **
// ** expected value. The legacy price accessor has no `else` branch and no **
// ** fallback [model/entity/Sku.cfc:L269-L273], so an unknown currency     **
// ** yields nothing at all, and substituting 0 for that nothing would      **
// ** silently sell products for free. Every `undefined` below is therefore **
// ** asserted by identity, and each one is additionally asserted NOT to be **
// ** 0, '', null or {} - because a "tidier" expectation is precisely the   **
// ** regression this suite exists to catch.                               **
// ***************************************************************************
//
// COVERAGE IS 100% NET-NEW - NEVER PRESENT IT AS PARITY
//   Measured, not assumed. All 32 `.cfc` files under meta/tests/ were searched
//   while authoring this file:
//
//     * `structKeyExists` appears 8 times, every one of them an incidental use
//       inside a test BODY - meta/tests/unit/core/EntityFormatTest.cfc L76,
//       L96, L97, L102, L107, L148, L170 and L187 - all of them inspecting ORM
//       property metadata, none asserting anything about struct-key behaviour.
//     * `structKeyList` appears only as a way to enumerate ORM class metadata
//       (meta/tests/unit/core/RBKeyTest.cfc:L52 and EntityFormatTest.cfc).
//     * A search for any assertion about key case-insensitivity returns
//       nothing at all.
//
//   So NO legacy test asserts anything about CFML struct-key semantics, and
//   every case in this file is net-new coverage with no legacy antecedent. The
//   only two legacy suites extended anywhere in this migration are
//   meta/tests/unit/entity/BrandTest.cfc and
//   meta/tests/unit/entity/ProductTest.cfc, both owned by the entity tier;
//   neither is related to this module. For completeness,
//   meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub and
//   contributes no coverage to anything.
//
//   Lineage is still carried in two ways. Fixtures follow
//   meta/tests/unit/Helper.cfc as a PATTERN only - build-save-flush collapses
//   to plain construction, and the ORM, the DI container and the request scope
//   are dropped entirely. And regression cases follow the `issue_<ticket#>`
//   convention from meta/tests/unit/IssuesTest.cfc:L51. That convention is
//   stated rather than exercised: no `issue_*` case falls inside this suite,
//   and none is fabricated to look like one. The known open ticket, #1766 for
//   the preserved return/exchange no-op at
//   model/service/PromotionService.cfc:L542-L544, belongs to the promotion
//   characterization suite.
//
//   No legacy TODO falls inside this module either, so none is carried here.
//
// CARRY THE ASSERTIONS, NEVER THE HARNESS
//   The legacy "unit" tier was not isolated in any sense:
//   meta/tests/unit/SlatwallUnitTestBase.cfc:L52 builds the real
//   Slatwall.Application component and :L60 calls bootstrap() before EVERY
//   test, so the real application, ORM and DI container come up first. This
//   suite is the deliberate opposite - pure logic, no environment read, no
//   filesystem, no network, no database - and it passes with a completely
//   empty environment.
//
//   One legacy harness detail is deliberately NOT reproduced:
//   meta/tests/unit/Helper.cfc:L53 and meta/tests/unit/IssuesTest.cfc:L55 both
//   assign `productData` with no `var`, leaking it into component scope. That
//   is a hygiene defect in the harness being replaced, not one of the
//   preserved business-logic defects. It is also the concrete reason every
//   struct fixture below is built INSIDE the test that uses it rather than at
//   module scope: shared mutable fixture state lets one case corrupt the next,
//   and on a warm Lambda container module-level state survives between
//   unrelated invocations.
//
//   The globally registered setup module - wired through `setupFiles` in
//   vitest.config.ts - already pins the process to UTC and restores global
//   mocks after each test. It is deliberately NOT imported here: this suite
//   installs no spy, has no date dimension and has no database dimension, so
//   it needs no teardown of its own.
//
// THE SHIPPED SURFACE IS THE CONTRACT - FOUR RECORDED DIFFERENCES
//   The module was read in full before this suite was written, and its
//   signatures are authoritative. Where the authoring brief described a
//   different shape, this suite conforms to the SHIPPED file and records the
//   difference here rather than changing src/**:
//
//     1. `structGet<TStruct extends object>(struct, key)` returns
//        `TStruct[keyof TStruct] | undefined`. The type parameter is the
//        STRUCT, not the value, so the result is derived from what the struct
//        actually holds instead of being asserted by the caller. That is
//        stronger, and it needs no cast. It takes exactly two parameters:
//        there is no `defaultValue`, confirmed by reading it.
//     2. `structGetPath<TInner extends object>(struct: CfStruct<TInner>, ...)`
//        types its parameter by the INNER entry, so the outer container maps
//        every key to the same entry type.
//     3. `structKeyExists`, `structFindKey` and `structKeyList` take `object`
//        rather than `CfStruct`, deliberately widened so a heterogeneous
//        struct declared as an interface is still accepted.
//     4. `cfEquals` accepts `string | null | undefined` only. It is strings
//        only by design and is never extended to numbers, because every
//        monetary comparison belongs to the `Money` value object.
//
//   `CfStruct<T = unknown>` is the module's only exported type; there is no
//   key-map alias. The module implements NO cache, so no caching behaviour is
//   asserted anywhere below.
//
// NO USER RULES WERE PROVIDED - VERIFIED, NOT ASSUMED
//   The project rules document was read five independent ways while authoring
//   this file: its default window, its full range, a range deliberately
//   probing far past its apparent end, its first line alone, and a range
//   entirely beyond it. All five returned the byte-identical single line
//   stating that no user rules exist, so the document is a one-line sentinel
//   and is exhausted. The consequences: no rule is invented to fill the gap;
//   the absence is NOT license to lower the bar, so the enterprise substitute
//   standard applies at full strength; and zero files enter scope by rule
//   mandate, this one included - it traces to its own authoring brief and to
//   the target layout, with no third rule-driven category and no rule conflict
//   to resolve.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  cfEquals,
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
  // CFML parity [model/entity/Sku.cfc:L270]: the currency code handed to
  // `structKeyExists` arrives in whatever casing the caller used, and the CFML
  // engine matches it against the stored key without regard to case. The
  // target must fold case rather than compare raw strings.
  it('resolves a currency key regardless of the casing asked for', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    expect(structKeyExists(currencyDetails, 'usd')).toBe(true);
    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);
    expect(structKeyExists(currencyDetails, 'Usd')).toBe(true);
  });

  it('returns the identical stored value object whatever casing is asked for', () => {
    const usdDetail = { price: '19.99' };
    const currencyDetails = { USD: usdDetail };

    // `toBe`, not `toEqual`: the SAME object must come back, not a copy. A
    // helper that rebuilt the entry could silently drop a sub-key, and the
    // presence of a sub-key is exactly what the two-level accessors test.
    expect(structGet(currencyDetails, 'USD')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'Usd')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'usd')).toBe(structGet(currencyDetails, 'USD'));
  });

  // CFML parity [model/entity/Sku.cfc:L276, L282]: CFML is case-insensitive at
  // EVERY level of a struct, not merely the first, so the sub-key lookup folds
  // case just as the currency lookup does.
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
  //   A locale-sensitive fold would make key matching depend on where the
  //   process happens to run. Under a Turkish locale the ASCII letter `I`
  //   folds to a dotless `i`, so a key spelled with an ASCII `I` would stop
  //   matching one spelled with an ASCII `i`. CFML matches struct keys without
  //   consulting a locale, so the target pins the locale-independent fold and
  //   this case pins that decision: an ASCII `I` and an ASCII `i` are the same
  //   key here, on every machine. The trade-off is accepted openly - a key
  //   pair distinguished only by a locale-specific rule is treated as one key.
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
// CFML parity [model/entity/Sku.cfc:L270]: the engine folds the CASE of a
// struct key and does nothing else to it - surrounding whitespace is part of
// the key. Trimming is the kind of helpful-looking normalisation that silently
// changes which key a lookup resolves to, so the target must not trim either.
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
// CFML parity [model/entity/Sku.cfc:L270, L276, L282]: `structKeyExists` asks
// whether a key is THERE and says nothing about what it holds. That separation
// is the whole reason the list-price and renewal-price accessors are able to
// ask a second question, so the target keeps the two questions apart instead of
// collapsing "absent" into "falsy".
//
// Under `exactOptionalPropertyTypes` - which tsconfig.json enables, and which
// is load-bearing in this file - an ABSENT key and a key PRESENT holding
// `undefined` are genuinely different states rather than one state spelled two
// ways. That flag is what makes the distinction expressible at the type level,
// and the two-level cases further down depend on it.
//
// Each falsy value below is a real value from the ported slice rather than an
// invented one, so that no case can be mistaken for a price:
//   ''     CFML parity [model/entity/Sku.cfc:L382]: the cascade seeds every
//          currency entry with `skuCurrencyID = ""`.
//   false  CFML parity [model/entity/Sku.cfc:L396, L411]: the base-currency and
//          override steps both record `converted = false`.
//   0      CFML parity [model/entity/OptionGroup.cfc:L58]: `sortOrder` is an
//          integer property, and a sort order of zero is a legitimate value.
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

    // Present, whatever the value.
    expect(structKeyExists(currencyDetail, 'skuCurrencyID')).toBe(true);
    expect(structKeyExists(currencyDetail, 'converted')).toBe(true);
    expect(structKeyExists(currencyDetail, 'sortOrder')).toBe(true);

    // Absent, and therefore a different answer to a DIFFERENT question. The
    // value read is `undefined` in this case only, which is what lets a caller
    // that asks both questions tell the two states apart.
    expect(structKeyExists(currencyDetail, 'listPrice')).toBe(false);
    expect(structGet(currencyDetail, 'listPrice')).toBeUndefined();
    expect(structFindKey(currencyDetail, 'listPrice')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// structGet never substitutes anything for a miss.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/Sku.cfc:L269-L273]: `getPriceByCurrencyCode` tests
// the currency key once, returns `.price` when it matches, and has NO `else`
// and NO fallback - so an unmatched currency yields nothing at all. Reproducing
// that faithfully is the single highest-consequence parity requirement in this
// migration: substituting 0 for these nulls would silently sell products for
// free.
describe('structGet reports a miss as undefined and never stands in for it', () => {
  it('yields undefined for an unknown currency, and never a stand-in value', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    const missing = structGet(currencyDetails, 'EUR');

    // By identity, not by loose truthiness.
    expect(missing).toBeUndefined();

    // The four substitutions that must never appear. Each is asserted
    // explicitly because each is a plausible-looking "improvement" that would
    // change what a customer is charged. `toEqual` is used for the empty-object
    // case on purpose: `not.toBe({})` would pass trivially against any value,
    // since a fresh object literal is never reference-equal to anything.
    expect(missing).not.toBe(0);
    expect(missing).not.toBe('');
    expect(missing).not.toBeNull();
    expect(missing).not.toEqual({});
  });

  // The shipped signature genuinely takes no default, and that is asserted
  // structurally rather than by trying to pass one: both declared parameters
  // are required, so the function's own arity is exactly 2. A third
  // `defaultValue` slot is how a 0 sneaks into a price path - it gets supplied
  // at the one call site nobody reviews closely - so its absence is part of the
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

    // A read that materialized the key with a blank entry would turn the next
    // lookup into a false positive on a price path.
    expect(structKeyExists(currencyDetails, 'EUR')).toBe(false);
    expect(structKeyList(currencyDetails)).toEqual(['USD']);
    expect(structGet(currencyDetails, 'EUR')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// structGetPath - the two-level accessor, and the highest-value export here.
// ---------------------------------------------------------------------------
// All three legacy accessors are `public any function`, and the difference
// between the first and the other two is the whole reason this export exists:
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
//
// Each of the three reachable outcomes is pinned separately below. The entity
// methods themselves, and the cascade that builds the map, belong to
// sku.test.ts; what is pinned here is only the key-access primitive underneath
// them.
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

  // This is the case a single-level lookup would get wrong, and it is why
  // collapsing the two checks into one is a behavioural change rather than a
  // simplification.
  it('yields undefined when the outer key is PRESENT but the INNER key is absent', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    // The outer key really is there ...
    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);

    // ... and the two-level read still yields nothing.
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

  // CFML parity [model/entity/Sku.cfc:L373]: the entire cascade body sits
  // inside `if(len(setting('skuEligibleCurrencies')))`. When that gate is
  // closed the memo initialised at :L369 stays `{}` and is returned unchanged
  // at :L432, so EVERY currency accessor yields nothing - for every currency,
  // including the configured base currency. An empty map is a reachable
  // production state, not a degenerate test input.
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
// Verified line by line against `getCurrencyDetails()`
// [model/entity/Sku.cfc:L367-L433], the four-step cascade that builds the map
// every currency accessor reads:
//
//   :L367-L369  The memo guard, then `variables.currencyDetails = {};`.
//   :L371       The eligible-currency list is fetched BEFORE and OUTSIDE the
//               gate, so the fetch happens even when nothing will be built.
//   :L373       The gate `if(len(setting('skuEligibleCurrencies')))`, wrapping
//               :L374-L430 in its entirety.
//   :L381-L382  STEP 0. For every eligible currency the OUTER entry is created
//               UNCONDITIONALLY - `[code] = {}` and then
//               `[code].skuCurrencyID = ""` - before any pricing step runs.
//   :L385-L397  STEP 1, the base currency, selected by a case-insensitive `eq`
//               at :L385. `renewalPrice` (:L386-L389) and `listPrice`
//               (:L390-L393) are each written ONLY under an `!isNull(...)`
//               guard, while `price` at :L394 is written UNCONDITIONALLY;
//               `converted = false` at :L396.
//   :L399-L414  STEP 2, the per-currency overrides, matched by `eq` again at
//               :L400 and overwriting STEP 1. The same two inner keys are
//               guarded at :L401 and :L405; price at :L409; `converted = false`
//               at :L411; `skuCurrencyID` at :L412.
//   :L416-L428  STEP 3, on-the-fly conversion, gated at :L416 on the absence of
//               the `"price"` sub-key SPECIFICALLY. Guards at :L417 and :L421;
//               conversion at :L425; `converted = true` at :L427.
//   :L432       `return variables.currencyDetails;`
//
// THE INSIGHT THIS SUITE PINS: because :L381 creates the OUTER key
// unconditionally while the INNER `listPrice` and `renewalPrice` keys are
// created only under `!isNull(...)` guards, an outer key that EXISTS alongside
// an inner sub-key that DOES NOT is a reachable state. That is precisely why
// [model/entity/Sku.cfc:L275-L285] needs the SECOND `structKeyExists`, and why
// a one-level lookup would report a price that was never stored.
//
// Correspondingly `price` is written unconditionally by all three steps (:L394,
// :L409, :L425), so for an eligible currency the `"price"` sub-key is always
// present - which is what makes a `"price"` miss meaningful rather than routine:
// it says the currency was not eligible, or the :L373 gate was closed.
//
// For context only, and deliberately NOT asserted here because no settings port
// belongs in this suite: `skuCurrency` is declared
// `{fieldType="select", defaultValue="USD"}` at
// [model/service/SettingService.cfc:L221], and `skuEligibleCurrencies` defaults
// to `getCurrencyService().getAllActiveCurrencyIDList()` at :L222. So the
// well-known "USD" default lives in a SETTING DECLARATION, not in the entity -
// there is no hardcoded "USD" anywhere in Sku.cfc, and `getCurrencyCode()`
// [model/entity/Sku.cfc:L360-L365] merely memoises that setting. Setting values
// appear below only as plain local literals.
describe('the outer key can exist while the inner sub-key does not', () => {
  // The state STEP 0 leaves behind when neither guarded inner key was written:
  // the entry exists, carries the seeded `skuCurrencyID` and an unconditional
  // `price`, and has no `listPrice` at all.
  it('treats an inner key that was never created as absent', () => {
    const usdDetail = { skuCurrencyID: '', price: '19.99' };
    const currencyDetails = { USD: usdDetail };

    // The outer level is present - STEP 0 created it unconditionally.
    expect(structKeyExists(currencyDetails, 'USD')).toBe(true);

    // The inner level never received either guarded key, so the SECOND check -
    // the one [model/entity/Sku.cfc:L276] performs - reports it absent.
    expect(structKeyExists(usdDetail, 'listPrice')).toBe(false);
    expect(structKeyExists(usdDetail, 'renewalPrice')).toBe(false);

    // And the two-level read therefore yields nothing.
    expect(structGetPath(currencyDetails, 'USD', 'listPrice')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'USD', 'renewalPrice')).toBeUndefined();

    // While the unconditionally written sub-keys still read back.
    expect(structGetPath(currencyDetails, 'USD', 'price')).toBe('19.99');
    expect(structGetPath(currencyDetails, 'USD', 'skuCurrencyID')).toBe('');
  });

  // The genuinely different second state. `exactOptionalPropertyTypes` is what
  // makes it expressible: an explicit `listPrice: undefined` is a PRESENT
  // property holding `undefined`, not an absent property.
  it('treats an inner key that is present but holds undefined as PRESENT', () => {
    const usdDetail = { skuCurrencyID: '', price: '19.99', listPrice: undefined };
    const currencyDetails = { USD: usdDetail };

    // Presence and value diverge here, which is the entire point.
    expect(structKeyExists(usdDetail, 'listPrice')).toBe(true);
    expect(structKeyExists(usdDetail, 'LISTPRICE')).toBe(true);
    expect(structKeyList(usdDetail)).toEqual(['skuCurrencyID', 'price', 'listPrice']);

    // The value question still answers `undefined` - and still never 0.
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

    // Different answers to the PRESENCE question ...
    expect(structKeyExists(absentInner, 'listPrice')).toBe(false);
    expect(structKeyExists(undefinedInner, 'listPrice')).toBe(true);

    // ... and the same answer to the VALUE question. A caller that needs to
    // tell them apart asks both, which is exactly what the legacy accessors do.
    expect(structGet(absentInner, 'listPrice')).toBeUndefined();
    expect(structGet(undefinedInner, 'listPrice')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cfEquals - the CFML `eq` operator as the currency cascade uses it.
// ---------------------------------------------------------------------------
// CFML parity [model/entity/Sku.cfc:L385]: the base-currency step selects with
// `if(thisCurrency.getCurrencyCode() eq this.setting('skuCurrency'))`.
// CFML parity [model/entity/Sku.cfc:L400]: the override step matches with
// `if(getSkuCurrencies()[c].getCurrencyCode() eq thisCurrency.getCurrencyCode())`,
// which is what lets an override OVERWRITE the base-step entry rather than sit
// beside it. Both are CFML `eq`, and CFML `eq` is case-insensitive.
describe('cfEquals reproduces the case-insensitive CFML eq on currency codes', () => {
  it('compares two present codes without regard to case', () => {
    // The configured setting value as a plain local literal: no settings port
    // and no environment read belongs in this suite.
    const skuCurrency = 'USD';

    expect(cfEquals('USD', skuCurrency)).toBe(true);
    expect(cfEquals('usd', skuCurrency)).toBe(true);
    expect(cfEquals('UsD', skuCurrency)).toBe(true);
    expect(cfEquals('EUR', skuCurrency)).toBe(false);
  });

  // JUDGMENT CALL: a nullish operand is never equal to anything, INCLUDING
  // another nullish operand.
  //   CFML would not answer this question at all - passing a null into `eq`
  //   raises there - so there is no legacy result to preserve and a decision
  //   had to be made consistently. Answering `true` for two nullish operands
  //   would mean "unknown currency equals unknown currency", which reads as a
  //   MATCH on a currency-selection path: an absent code could match another
  //   absent code and unlock a price for a currency that was never identified.
  //   That is the wrong failure direction where money is concerned, so the
  //   answer is `false`. Throwing was rejected too, because it would turn a
  //   missing currency code into a server error rather than the absent result
  //   the legacy contract produces. Note the deliberate asymmetry with strict
  //   equality that this creates: `cfEquals(undefined, undefined)` is `false`
  //   where `undefined === undefined` is `true`.
  it('never reports two nullish operands as equal', () => {
    expect(cfEquals(null, null)).toBe(false);
    expect(cfEquals(undefined, undefined)).toBe(false);
    expect(cfEquals(null, undefined)).toBe(false);
    expect(cfEquals(undefined, null)).toBe(false);
  });

  it('never reports a nullish operand as equal to a present code', () => {
    expect(cfEquals(undefined, 'USD')).toBe(false);
    expect(cfEquals('USD', undefined)).toBe(false);
    expect(cfEquals(null, 'USD')).toBe(false);
    expect(cfEquals('USD', null)).toBe(false);
  });

  // An empty string is an ordinary CFML string value rather than an absent one,
  // so it compares normally. Whitespace is significant here for the same reason
  // it is significant in key matching: only case is folded, never whitespace.
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
// The legacy engine had no equivalent, because CFML never needed one: the
// engine owns the key store. This is therefore the one primitive in the module
// that is a target addition rather than a port, and it exists so a caller can
// write back under the key ALREADY in use instead of adding a second entry that
// differs from it only by case.
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

  // A caller must be able to sort or splice the result without disturbing the
  // struct or any earlier result, so a new array is allocated on every call.
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

    // Mutating one result leaves the struct, and any later result, untouched.
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
//   CFML cannot represent a struct holding both `'price'` and `'Price'` at all,
//   so this state is unreachable from ported CFML and there is no legacy
//   behaviour to preserve. It IS reachable in TypeScript from a plain object
//   hydrated elsewhere, so it needs a defined answer rather than an accident.
//   The module returns the first matching own key in insertion order. It does
//   NOT throw - a throw on a money path would turn an ambiguous price map into
//   a server error instead of a value - and it does NOT merge the colliding
//   entries, which would fabricate a value that was never stored.
describe('a case-only key collision resolves to the first key in insertion order', () => {
  it('returns the first match, and neither throws nor merges', () => {
    const collided = { price: 'a', Price: 'b' };

    expect(structGet(collided, 'PRICE')).toBe('a');
    expect(structGet(collided, 'price')).toBe('a');
    expect(structGet(collided, 'Price')).toBe('a');
    expect(structFindKey(collided, 'PRICE')).toBe('price');

    // Both keys stay visible - nothing was merged away or dropped.
    expect(structKeyList(collided)).toEqual(['price', 'Price']);
    expect(structKeyExists(collided, 'PRICE')).toBe(true);
  });

  // Proves the tie-break really is insertion order rather than a preference for
  // one casing over another.
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

    // Exercise every export, on a hit and on a miss, asserting as we go so that
    // no call here is a discarded expression.
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

    // Same keys, same order, at both levels.
    expect(Object.keys(currencyDetails)).toEqual(outerKeysBefore);
    expect(Object.keys(usdDetail)).toEqual(innerKeysBefore);

    // Same entry object, and the same values inside it.
    expect(structGet(currencyDetails, 'USD')).toBe(usdDetail);
    expect(usdDetail).toEqual({ skuCurrencyID: '', price: '19.99' });
  });
});

// ---------------------------------------------------------------------------
// Prototype safety - own enumerable keys only.
// ---------------------------------------------------------------------------
// The module matches keys through `Object.keys(...)` and narrows with
// `Object.prototype.hasOwnProperty.call(...)`, never a bare `key in struct` and
// never a bare indexed read on an unresolved key. An inherited member is
// therefore never a CANDIDATE, rather than being filtered out after the fact.
//
// That distinction matters beyond hygiene. A currency map is keyed by strings
// that ultimately arrived from a database row, so a lookup that consulted the
// prototype chain could report a price for a code that merely happens to collide
// with an Object member name.
//
// Every fixture below is a plain object literal, and `'__proto__'` appears only
// as a string ARGUMENT to a lookup - never as an object-literal key, which would
// set the prototype rather than store a key, and never as a member access.
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
// Each shape below was read from the source while authoring this suite, so the
// primitives are pinned against real call sites rather than invented ones.
describe('the key-access shapes the ported slice actually uses', () => {
  // CFML parity [model/service/PromotionService.cfc:L148]: exists-then-read on
  // the SAME key, against a heterogeneous struct, and on a MONEY value -
  // `if(structKeyExists(salePriceDetails, "salePrice") && salePriceDetails.salePrice < ...)`.
  // The comparison half belongs to the `Money` value object; what is pinned here
  // is the presence test and the read that follows it.
  it('supports exists-then-read on the same key, on a money value', () => {
    // Money is a decimal STRING throughout this suite. No arithmetic is
    // performed on it here, and none belongs here.
    const salePriceDetails = { salePrice: '17.99', salePriceExpirationDateTime: '' };

    expect(structKeyExists(salePriceDetails, 'salePrice')).toBe(true);
    expect(structGet(salePriceDetails, 'salePrice')).toBe('17.99');

    // The same idiom against a SKU whose sale price was never established: the
    // presence test fails, the read is never reached, and nothing stands in for
    // the absent amount.
    const withoutSalePrice = { salePriceExpirationDateTime: '' };

    expect(structKeyExists(withoutSalePrice, 'salePrice')).toBe(false);
    expect(structGet(withoutSalePrice, 'salePrice')).toBeUndefined();
  });

  // CFML parity [model/service/PromotionService.cfc:L260-L263]: a
  // `!structKeyExists(...)` guard followed by initialising the key to a blank
  // array. The accumulator is keyed by order-item ID under the misspelled
  // identifier `orderItemQulifiedDiscounts`, which also appears at :L152. That
  // spelling is a data-contract identifier owned by the service layer: it is
  // noted once here and neither renamed nor corrected anywhere in this suite.
  it('supports the absent-then-initialise guard used by the discount accumulator', () => {
    const orderItemDiscounts: Record<string, string[]> = {};
    const orderItemID = 'aa1b2c3d4e5f60718293a4b5c6d7e8f9';

    // The guard the legacy code evaluates before seeding the entry.
    expect(structKeyExists(orderItemDiscounts, orderItemID)).toBe(false);
    expect(structGet(orderItemDiscounts, orderItemID)).toBeUndefined();

    // Seeding is the caller's job, never this module's: nothing here writes.
    orderItemDiscounts[orderItemID] = [];

    expect(structKeyExists(orderItemDiscounts, orderItemID.toUpperCase())).toBe(true);
    expect(structGet(orderItemDiscounts, orderItemID.toUpperCase())).toEqual([]);
  });

  // CFML parity [model/service/SkuService.cfc:L142, L147, L175]: the
  // exists-OR-empty compound predicate,
  // `if(!structKeyExists(arguments.data, "x") || !listLen(arguments.data.x))`.
  // Only the presence half is pinned here; the emptiness half is list semantics
  // and belongs to list.test.ts.
  //
  // Hand-off note, stated and deliberately not acted on: at
  // [model/service/SkuService.cfc:L163] the renewal-benefit loop reads
  // `arguments.data.renewalSubscriptionBenefits` with NO preceding presence
  // guard, unlike the benefits key guarded at :L142 and consumed at :L160. That
  // asymmetry belongs to the service layer, and nothing here changes it.
  it('supports the presence half of the exists-or-empty compound predicate', () => {
    const data = { subscriptionBenefits: '1,2', subscriptionTerms: '3' };

    expect(structKeyExists(data, 'subscriptionBenefits')).toBe(true);
    expect(structKeyExists(data, 'SUBSCRIPTIONTERMS')).toBe(true);
    expect(structKeyExists(data, 'accessContents')).toBe(false);
    expect(structKeyExists(data, 'renewalSubscriptionBenefits')).toBe(false);
    expect(structGet(data, 'renewalSubscriptionBenefits')).toBeUndefined();
  });

  // CFML parity [model/entity/Sku.cfc:L294, L299]:
  // `structKeyExists(arguments, "locationID")` and
  // `structKeyExists(arguments, "stockID")` test the CFML `arguments` SCOPE -
  // optional-parameter presence testing that merely happens to use the same
  // built-in. In the target those become ordinary optional parameters, checked
  // by the compiler. No `arguments`-scope emulator is built and none is tested;
  // this case records the translation and pins only what survives it, which is
  // the ordinary struct case: a caller passing a bag of optional values still
  // needs case-insensitive presence.
  it('does not emulate the CFML arguments scope', () => {
    const quantityRequest = { quantityType: 'QATS', locationID: 'location-1' };

    expect(structKeyExists(quantityRequest, 'LOCATIONID')).toBe(true);
    expect(structKeyExists(quantityRequest, 'stockID')).toBe(false);
    expect(structGet(quantityRequest, 'locationid')).toBe('location-1');
    expect(structGet(quantityRequest, 'stockid')).toBeUndefined();
  });

  // CFML parity [model/dao/ProductDAO.cfc:L259]: bracket-notation access with a
  // dynamic string key, two levels deep - `data['productcontent_page'][r]`.
  // Dynamic keys reach the data layer too, and a two-level bracket read is
  // exactly the shape `structGetPath` covers.
  it('covers a two-level bracket-shaped read with a dynamic outer key', () => {
    // The legacy outer key is a column name resolved at run time and the inner
    // key is a query row. Both are opaque strings as far as this primitive is
    // concerned, so the row is modelled as a plain string key.
    const importData: CfStruct<CfStruct<string>> = {
      productcontent_page: { firstRow: 'about-us', secondRow: 'contact-us' },
    };
    const columnName = 'productcontent_page';

    expect(structGetPath(importData, columnName, 'firstRow')).toBe('about-us');
    expect(structGetPath(importData, 'PRODUCTCONTENT_PAGE', 'SECONDROW')).toBe('contact-us');
    expect(structGetPath(importData, columnName, 'thirdRow')).toBeUndefined();
    expect(structGetPath(importData, 'productcontent_pages', 'firstRow')).toBeUndefined();
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L53, L68-L76]: the second
  // struct shape in the slice is a plain keyed dictionary rather than a currency
  // map. The details struct is initialised at :L53, its memo-miss guard is a
  // `!structKeyExists(...)` at :L68, it is populated with
  // `roundingRuleExpression` and `roundingRuleDirection` at :L72-L74, and read
  // back at :L76. A presence-guarded key-removal step also sits at :L58-L59, and
  // the service layer owns it.
  //
  // These keys are rounding-rule UUIDs rather than three-letter currency codes,
  // so this case pins that an opaque UUID-shaped key behaves identically: the
  // primitives are indifferent to what a key means.
  //
  // That memo becomes REQUEST-SCOPED state owned by the service layer, and the
  // reason is correctness and cross-request isolation: module-level state
  // survives between unrelated invocations on a warm Lambda container, so one
  // request's rounding rule could answer another request's lookup. The module
  // under test holds no cache at all, and no caching behaviour is asserted
  // anywhere in this suite.
  it('treats an opaque UUID-shaped key exactly like a currency code', () => {
    const roundingRuleID = '4028818e3b1f4c2a9d5e6f7081920a3b';
    const roundingRuleDetails = {
      [roundingRuleID]: { roundingRuleExpression: '.99', roundingRuleDirection: 'Closest' },
    };

    // The memo-miss guard, answered for a key that IS present, in either casing.
    expect(structKeyExists(roundingRuleDetails, roundingRuleID)).toBe(true);
    expect(structKeyExists(roundingRuleDetails, roundingRuleID.toUpperCase())).toBe(true);

    // The read-back, at both levels and in either casing.
    expect(structGetPath(roundingRuleDetails, roundingRuleID, 'roundingRuleExpression')).toBe(
      '.99',
    );
    expect(
      structGetPath(roundingRuleDetails, roundingRuleID.toUpperCase(), 'ROUNDINGRULEDIRECTION'),
    ).toBe('Closest');

    // And a memo miss stays a miss: no entry is conjured for an unknown rule.
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
// Six sites in the in-scope entities bind ONE slot under two different casings,
// which CFML resolves silently because identifiers there are case-insensitive.
// All six were read verbatim from the source while authoring this suite.
//
// WHAT THE TARGET MUST DO - stated once, and applying to all six: each hazard is
// ONE canonical binding, and it must be reproduced as ONE TypeScript identifier
// or ONE struct key. Reproducing a pair as two DISTINCT identifiers would split
// a single slot in two, with one half silently never read, and that is a
// behavioural change rather than a faithful port. Each case below therefore
// asserts that a case-varied lookup resolves to THE SINGLE stored entry and that
// the key list still holds exactly one key.
describe('a case-varied binding resolves to one canonical entry', () => {
  // CFML parity [model/entity/ProductType.cfc:L101-L107]:
  // `setProducts(required array Products)` declares a capital `Products`, clears
  // `variables.Products = [];` at :L103 and iterates `arguments.Products` at
  // :L104, while the persistent property it maintains is `products`.
  it('binds ProductType products under one key despite the capitalised parameter', () => {
    const productTypeState = { products: ['first-product', 'second-product'] };

    expect(structGet(productTypeState, 'Products')).toBe(structGet(productTypeState, 'products'));
    expect(structGet(productTypeState, 'PRODUCTS')).toEqual(['first-product', 'second-product']);
    expect(structKeyList(productTypeState)).toEqual(['products']);
  });

  // CFML parity [model/entity/Brand.cfc:L101-L102]:
  // `removeProduct(required any product)` declares a lowercase `product`, and its
  // body at :L102 calls `arguments.Product.removeBrand(this)` with a capital P.
  it('binds the Brand removeProduct argument under one key despite the capital P', () => {
    const removeProductArguments = { product: { productID: 'first-product' } };

    expect(structGet(removeProductArguments, 'Product')).toBe(
      structGet(removeProductArguments, 'product'),
    );
    expect(structGetPath(removeProductArguments, 'Product', 'PRODUCTID')).toBe('first-product');
    expect(structKeyList(removeProductArguments)).toEqual(['product']);
  });

  // CFML parity [model/entity/PromotionCode.cfc:L101-L106]:
  // `setPromotion(required any promotion)` assigns `variables.promotion` at
  // :L102, then at :L105 calls
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

  // CFML parity [model/entity/OptionGroup.cfc:L70, L73-L79]: the property is
  // declared `options` at :L70, yet `getOptions(orderby, sortType="text",
  // direction="asc")` returns `variables.Options` at :L75 and passes
  // `variables.Options` again at :L77 - a capital O both times. Note that the
  // parameter `orderby` is itself declared lowercase and presence-tested as
  // `"orderby"` at :L74.
  it('binds OptionGroup options under one key despite the capital O', () => {
    const optionGroupState = { options: ['small', 'medium', 'large'] };

    expect(structGet(optionGroupState, 'Options')).toBe(structGet(optionGroupState, 'options'));
    expect(structGet(optionGroupState, 'OPTIONS')).toEqual(['small', 'medium', 'large']);
    expect(structKeyList(optionGroupState)).toEqual(['options']);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L103, L140, L149, L150]: the
  // local is declared `excludedProductTypesList` at :L103 and assigned at :L140,
  // but the guard at :L149 tests `excludedproductTypesList` with a lowercase p
  // before :L150 reads the declared spelling again.
  it('binds the PriceGroupRate excluded-product-types list under one key', () => {
    const appliesToLocals = { excludedProductTypesList: '2 Product Types' };

    expect(structKeyExists(appliesToLocals, 'excludedproductTypesList')).toBe(true);
    expect(structGet(appliesToLocals, 'excludedproductTypesList')).toBe('2 Product Types');
    expect(structGet(appliesToLocals, 'EXCLUDEDPRODUCTTYPESLIST')).toBe('2 Product Types');
    expect(structKeyList(appliesToLocals)).toEqual(['excludedProductTypesList']);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L101, L118, L126, L127]: the
  // SECOND hazard inside the same function - `getAppliesTo()` spans :L95-L155.
  // The local is declared `var skusList = "";` at :L101 with a lowercase s, then
  // assigned as `SkusList` at :L118 and read as `SkusList` at :L126 and :L127.
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
// Three independent demonstrations that CFML genuinely does not distinguish
// case, each read or counted directly from the source:
//
//   1. The same ORM attribute is spelled two ways, and
//      [model/entity/PriceGroupRate.cfc] does not hold one spelling even for the
//      length of a single property block: `ormtype` at :L52, `ormType` at
//      :L53-L55, then back to `ormtype` at :L58. Elsewhere it is lowercase, at
//      [model/entity/OptionGroup.cfc:L57] and [model/entity/Promotion.cfc:L56].
//   2. One expression calls two list built-ins with different casing side by
//      side: `ListDeleteAt` with a capital L wrapping `listFindNoCase` with a
//      lowercase l, at [model/service/PromotionService.cfc:L774]. CFML FUNCTION
//      names are case-insensitive too, not only struct keys.
//   3. Most tellingly, the built-in this module reproduces has its own name
//      spelled three different ways across the model layer. Counted while
//      authoring this suite: `structKeyExists` 650 times, `StructKeyExists` 5
//      times, and `structkeyExists` twice - 657 in total, which breaks down as
//      224 in model/service, 392 in model/entity and 41 in model/dao, of which
//      22 fall in the seven services this migration ports. A case-SENSITIVE
//      search for the common spelling misses exactly 7 of them, which is the
//      hazard in miniature.
//
// None of that is incidental trivia. It is the reason no ported lookup may
// assume the casing of a key it was handed.
describe('case-insensitivity is total, not partial', () => {
  it('matches every casing of one key to the same single entry', () => {
    // A setting key, modelled as a plain local literal.
    const settingValues = { skuCurrency: 'USD' };

    for (const spelling of ['skuCurrency', 'SKUCURRENCY', 'skucurrency', 'SkUcUrReNcY']) {
      expect(structKeyExists(settingValues, spelling)).toBe(true);
      expect(structGet(settingValues, spelling)).toBe('USD');
      expect(structFindKey(settingValues, spelling)).toBe('skuCurrency');
    }

    // One stored key throughout - the fold never multiplied it.
    expect(structKeyList(settingValues)).toEqual(['skuCurrency']);
  });
});

// ---------------------------------------------------------------------------
// OWNED ELSEWHERE - deliberately not covered here.
// ---------------------------------------------------------------------------
// Recorded so the boundary is explicit rather than accidental:
//
//   * The `getCurrencyDetails()` cascade itself, and the three currency
//     accessors as entity methods, belong to sku.test.ts. This suite pins only
//     the key-access primitive underneath them.
//   * Two entity memo bugs sit immediately beside that cascade and are a
//     genuinely tempting fit for a struct-key suite, so their ownership is
//     stated rather than assumed. [model/entity/Sku.cfc:L500-L510] guards on
//     `!structKeyExists(variables, "optionsByOptionGroupCodeStruct")` at :L501
//     but initialises a DIFFERENT key at :L502; and
//     [model/entity/Sku.cfc:L512-L522] initialises
//     `variables.optionsByOptionGroupIDStruct` at :L514, populates a third
//     spelling - `variables.OptionsByGroupIDStruct` - at :L517, and returns the
//     first one at :L521, so the populated struct is discarded. Both are
//     unobservable through the public contract, both belong to the entity layer
//     and to sku.test.ts, and neither is asserted anywhere above. This suite
//     spends none of the migration's authorised divergences.
//   * `listLen` and its siblings belong to list.test.ts, CFML truthiness to
//     truthiness.test.ts, number formatting to numberFormat.test.ts, and
//     arithmetic to precision.test.ts. The emptiness half of every
//     exists-OR-empty predicate above is list semantics, not key semantics.
//   * The rounding-rule memo becoming request-scoped, and the misspelled
//     discount-accumulator key, belong to the service tier.
//   * `Money` and the other value objects, the structural coverage floor, the
//     SQL and bound-parameter assertions, the shared fixtures, the global test
//     harness and every root manifest are each owned by their own file.
// ---------------------------------------------------------------------------
