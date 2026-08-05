/**
 * `src/lib/jsonDocumentKeys.ts` - locating a `__proto__` own key in a parsed request document.
 *
 * NET-NEW COVERAGE, declared as such per AAP 0.6.6. Nothing under `meta/tests/` touches this
 * behaviour, because the behaviour has no CFML antecedent at all: a CFML struct has no prototype
 * chain and `structKeyExists` has no key it silently refuses to see. This module exists because
 * `zod`'s strict-object contract has exactly one such key, and QA testing found it.
 *
 * WHAT THIS SUITE IS FOR. Two things, and they pull in opposite directions, which is why both are
 * asserted rather than one. It must FIND the key wherever a caller can put it - the root, a nested
 * object, inside an array, several levels down - because a guard that only covers the root leaves the
 * inconsistency it was written to close in place one level lower. And it must NOT find one where there
 * is none, because this runs on the happy path of every request that carries a body: a false positive
 * here refuses legitimate traffic.
 *
 * ★ EVERY DOCUMENT UNDER TEST IS BUILT WITH `JSON.parse`, NOT WITH AN OBJECT LITERAL. That is not a
 * stylistic choice, it is the only construction that reproduces the thing being detected. A literal
 * `{ __proto__: {} }` INVOKES THE PROTOTYPE SETTER and creates no own property, so a suite written
 * with literals would assert against documents that do not contain what the production input
 * contains, and would pass while the guard did nothing. `JSON.parse` creates an ordinary own data
 * property, which is both what API Gateway delivers and what makes the key detectable.
 */

import { describe, expect, it } from 'vitest';

import { findPrototypeKeyPath } from '../../../src/lib/jsonDocumentKeys.js';

/**
 * Parse a document the way the handlers do, and refuse to hand back anything but an object.
 *
 * The narrowing is the point: `findPrototypeKeyPath` declares `object`, and both call sites have
 * already established that much before they reach it. A helper that returned `unknown` would push a
 * cast into every case.
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
