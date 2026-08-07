// slatwall-ts - tests/unit/lib/cfml/struct.test.ts.
//
// The legacy tier was not isolated: meta/tests/unit/SlatwallUnitTestBase.cfc:L52 builds the real
// Slatwall.Application component and:L60 calls bootstrap() before every legacy test.
//
// `CfStruct<T = unknown>` is the only exported type; there is no key-map alias, the module
// implements no cache, and no caching behaviour is asserted.

import { describe, expect, it } from 'vitest';

import {
  CfmlComparisonError,
  cfEquals,
  cfFoldKey,
  structFindKey,
  structGet,
  structGetPath,
  structKeyExists,
  structKeyList,
} from '../../../../src/lib/cfml/struct.js';
import type { CfStruct } from '../../../../src/lib/cfml/struct.js';

// Case-insensitive resolution, across every export that matches a key.
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

    // `toBe`, not `toEqual`: the same object must come back, not a copy. A rebuilt entry could
    // silently drop a sub-key, and sub-key presence is exactly what the two-level accessors test.
    expect(structGet(currencyDetails, 'USD')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'Usd')).toBe(usdDetail);
    expect(structGet(currencyDetails, 'usd')).toBe(structGet(currencyDetails, 'USD'));
  });

  // CFML parity [model/entity/Sku.cfc:L276, L282]: CFML is case-insensitive at every level of a
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
  it('folds the ASCII I/i pair the same way regardless of ambient locale', () => {
    const productTypeRow = { productTypeIDPath: '1,2,3' };

    expect(structKeyExists(productTypeRow, 'PRODUCTTYPEIDPATH')).toBe(true);
    expect(structKeyExists(productTypeRow, 'producttypeidpath')).toBe(true);
    expect(structGet(productTypeRow, 'ProductTypeIdPath')).toBe('1,2,3');
  });
});

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

// Presence is not value.
// CFML parity [model/entity/Sku.cfc:L270, L276, L282]: `structKeyExists` asks whether a key is
// there and says nothing about what it holds.
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
    // `undefined` in this case only, which is what lets a caller asking both questions tell the
    // two states apart.
    expect(structKeyExists(currencyDetail, 'listPrice')).toBe(false);
    expect(structGet(currencyDetail, 'listPrice')).toBeUndefined();
    expect(structFindKey(currencyDetail, 'listPrice')).toBeUndefined();
  });
});

// StructGet never substitutes anything for a miss.
describe('structGet reports a miss as undefined and never stands in for it', () => {
  it('yields undefined for an unknown currency, and never a stand-in value', () => {
    const currencyDetails = { USD: { price: '19.99' } };

    const missing = structGet(currencyDetails, 'EUR');

    expect(missing).toBeUndefined();

    // The four substitutions that must never appear. `toEqual` is used for the empty-object case
    // on purpose: `not.toBe({})` would pass trivially, since a fresh object literal is never
    // reference-equal to anything.
    expect(missing).not.toBe(0);
    expect(missing).not.toBe('');
    expect(missing).not.toBeNull();
    expect(missing).not.toEqual({});
  });

  // The shipped signature genuinely takes no default, asserted structurally rather than by trying
  // to pass one: both declared parameters are required, so the arity is exactly.
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

// CFML parity [model/entity/Sku.cfc:L269-L273] getPriceByCurrencyCode one
// `structKeyExists(getCurrencyDetails(), arguments.currencyCode)`, returning `.price`, with no
// `else` and no fallback.
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
  // `if(len(setting('skuEligibleCurrencies')))`.
  it('answers every question with a miss when the eligibility gate left the map empty', () => {
    const currencyDetails: CfStruct<{ price: string }> = {};

    expect(structKeyExists(currencyDetails, 'USD')).toBe(false);
    expect(structGet(currencyDetails, 'USD')).toBeUndefined();
    expect(structGetPath(currencyDetails, 'USD', 'price')).toBeUndefined();
    expect(structFindKey(currencyDetails, 'USD')).toBeUndefined();
    expect(structKeyList(currencyDetails)).toEqual([]);
  });
});

// The insight this suite pins: because:L381 creates the outer key unconditionally while the inner
// `listPrice` and `renewalPrice` keys are created only under `!isNull(...)` guards.
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

// CfEquals - the CFML `eq` operator as the currency cascade uses it.
// CFML parity [model/entity/Sku.cfc:L385]: the base-currency step selects with
// `if(thisCurrency.getCurrencyCode() eq this.setting('skuCurrency'))`.
describe('cfFoldKey supplies CFML struct identity to a Map or Set', () => {
  // Why it is PUBLISHED: some ported CFML struct state is a `Map` or a `Set` rather than a plain
  // object - a request-scoped memo keyed by identifier, a visited-set guarding a hierarchy walk.
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

  // Passing a null into `eq` raises in CFML, so this raises too.
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

  // The message has to say which operand was absent and what survived, because on the cascade path
  // the survivor is the clue to where the missing one should have come from: if `'USD'` survived.
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
  // normally.
  it('compares empty strings normally and keeps whitespace significant', () => {
    expect(cfEquals('', '')).toBe(true);
    expect(cfEquals('', 'USD')).toBe(false);
    expect(cfEquals(' USD', 'USD')).toBe(false);
    expect(cfEquals(' usd', ' USD')).toBe(true);
  });
});

// StructFindKey - the canonical spelling of a key. The legacy engine had no equivalent because
// CFML never needed one: the engine owns the key store.
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

// A case-only key collision.
// JUDGMENT CALL: on a collision the FIRST match in insertion order wins.
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

// Purity - reading never writes.
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

// Prototype safety - own enumerable keys only.
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

// The key-access shapes the ported slice actually uses. Each shape below was read from the source,
// so the primitives are pinned against real call sites rather than invented ones.
describe('the key-access shapes the ported slice actually uses', () => {
  // CFML parity [model/service/PromotionService.cfc:L148]: exists-then-read on the same key,
  // against a heterogeneous struct, and on a MONEY value:
  // `if(structKeyExists(salePriceDetails, "salePrice") && salePriceDetails.salePrice <...)` The
  // comparison half belongs to `Money`.
  it('supports exists-then-read on the same key, on a money value', () => {
    const salePriceDetails = { salePrice: '17.99', salePriceExpirationDateTime: '' };

    expect(structKeyExists(salePriceDetails, 'salePrice')).toBe(true);
    expect(structGet(salePriceDetails, 'salePrice')).toBe('17.99');

    const withoutSalePrice = { salePriceExpirationDateTime: '' };

    expect(structKeyExists(withoutSalePrice, 'salePrice')).toBe(false);
    expect(structGet(withoutSalePrice, 'salePrice')).toBeUndefined();
  });

  // CFML parity [model/service/PromotionService.cfc:L260-L263]: a `!structKeyExists(...)` guard
  // followed by initialising the key to a blank array.
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
  // presence half is pinned here; the emptiness half is list semantics.
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
  // presence testing that happens to use the same built-in.
  it('does not emulate the CFML arguments scope', () => {
    const quantityRequest = { quantityType: 'QATS', locationID: 'location-1' };

    expect(structKeyExists(quantityRequest, 'LOCATIONID')).toBe(true);
    expect(structKeyExists(quantityRequest, 'stockID')).toBe(false);
    expect(structGet(quantityRequest, 'locationid')).toBe('location-1');
    expect(structGet(quantityRequest, 'stockid')).toBeUndefined();
  });

  // CFML parity [model/dao/ProductDAO.cfc:L259]: bracket-notation access with a dynamic string
  // key, two levels deep - `data['productcontent_page'][r]`. Dynamic keys reach the data layer
  // too, and a two-level bracket read is exactly the shape `structGetPath` covers.
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
  // shape is a plain keyed dictionary rather than a currency map.
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

// The case-binding hazards that make this module necessary.
//
// What the TARGET must do - stated once, applying to all six: each hazard is one canonical binding
// and must be reproduced as one TypeScript identifier or one struct key.
describe('a case-varied binding resolves to one canonical entry', () => {
  // CFML parity [model/entity/ProductType.cfc:L101-L107]: `setProducts(required array Products)`
  // declares a capital `Products`, clears `variables.Products = [];` at:L103 and iterates
  // `arguments.Products` at:L104.
  it('binds ProductType products under one key despite the capitalised parameter', () => {
    const productTypeState = { products: ['first-product', 'second-product'] };

    expect(structGet(productTypeState, 'Products')).toBe(structGet(productTypeState, 'products'));
    expect(structGet(productTypeState, 'PRODUCTS')).toEqual(['first-product', 'second-product']);
    expect(structKeyList(productTypeState)).toEqual(['products']);
  });

  // CFML parity [model/entity/Brand.cfc:L101-L102]: `removeProduct(required any product)` declares
  // a lowercase `product`, and its body at:L102 calls `arguments.Product.removeBrand(this)` with a
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
  // assigns `variables.promotion` at:L102, then at:L105 calls
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

  // CFML parity [model/entity/OptionGroup.cfc:L70, L73-L79]: the property is declared `options`
  // at:L70, yet the accessor `getOptions(orderby, sortType="text", direction="asc")` returns
  // `variables.Options` at:L75 and passes it again at:L77.
  it('binds OptionGroup options under one key despite the capital O', () => {
    const optionGroupState = { options: ['small', 'medium', 'large'] };

    expect(structGet(optionGroupState, 'Options')).toBe(structGet(optionGroupState, 'options'));
    expect(structGet(optionGroupState, 'OPTIONS')).toEqual(['small', 'medium', 'large']);
    expect(structKeyList(optionGroupState)).toEqual(['options']);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L103, L140, L149, L150]: the local is declared
  // `excludedProductTypesList` at:L103 and assigned at:L140.
  it('binds the PriceGroupRate excluded-product-types list under one key', () => {
    const appliesToLocals = { excludedProductTypesList: '2 Product Types' };

    expect(structKeyExists(appliesToLocals, 'excludedproductTypesList')).toBe(true);
    expect(structGet(appliesToLocals, 'excludedproductTypesList')).toBe('2 Product Types');
    expect(structGet(appliesToLocals, 'EXCLUDEDPRODUCTTYPESLIST')).toBe('2 Product Types');
    expect(structKeyList(appliesToLocals)).toEqual(['excludedProductTypesList']);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L101, L118, L126, L127]: the SECOND hazard inside
  // the same function: `getAppliesTo()` spans:L95-L155.
  it('binds the PriceGroupRate skus list under one key despite the capital S', () => {
    const appliesToLocals = { skusList: '3 SKUs' };

    expect(structKeyExists(appliesToLocals, 'SkusList')).toBe(true);
    expect(structGet(appliesToLocals, 'SkusList')).toBe('3 SKUs');
    expect(structFindKey(appliesToLocals, 'SKUSLIST')).toBe('skusList');
    expect(structKeyList(appliesToLocals)).toEqual(['skusList']);
  });
});

// `model/entity/PriceGroupRate.cfc` does not hold one spelling of an ORM attribute even across a
// single property block: `ormtype` at:L52, `ormType` at:L53-L55, back to `ormtype` at:L58.
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

// FindPrototypeKeyPath - these cases are gone because the export is gone.
//
// What remains the concern of this suite is unchanged: `isOwnKeyOf` still routes every own-key
// test in the module through `Object.prototype.hasOwnProperty.call`.
