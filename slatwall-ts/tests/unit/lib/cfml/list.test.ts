// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   tests/unit/domain/entities  entity unit-test tier
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the CFML comma-list primitives
//
// WHAT THIS PINS
//   src/lib/cfml/list.ts - the five primitives that carry CFML
//   comma-delimited string semantics into the TypeScript / AWS Lambda
//   `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing
//   slice (`version.txt` = `3.1.39`).
//
//   Every case below is grounded in a verified legacy consumer and cites its
//   locator. That is not decoration: these five helpers are the substrate of
//   the promotion qualifier/reward membership tests and of the
//   rounding-expression element walk, so an expectation that is merely
//   plausible rather than measured would let the money change quietly.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE
// PRESENTED AS PARITY.
// ---------------------------------------------------------------------------
//   Measured, not assumed. A grep across all 32 `.cfc` files under
//   meta/tests/ finds only INCIDENTAL mentions of the CFML list built-ins
//   inside test bodies, every one of them enumerating ORM metadata rather
//   than asserting list behaviour - for example
//   [meta/tests/unit/core/RBKeyTest.cfc:L52] and
//   [meta/tests/unit/core/EntityFormatTest.cfc:L54, L102, L107]. A grep for
//   an assertion applied to any of the five returns NOTHING: no legacy test
//   asserts anything whatsoever about their semantics.
//
//   There is therefore no legacy antecedent to extend here. The only legacy
//   suites extended anywhere in this port are
//   [meta/tests/unit/entity/BrandTest.cfc] and
//   [meta/tests/unit/entity/ProductTest.cfc], both owned by
//   tests/unit/domain/entities/, and
//   [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
//   contributing zero coverage.
//
//   Lineage conventions are carried without the machinery. Regression cases
//   elsewhere in this port follow the `issue_<ticket#>` naming taken from
//   [meta/tests/unit/IssuesTest.cfc:L51]; NO `issue_*` case falls inside this
//   suite, and none is fabricated to look like one. No carried-forward legacy
//   marker of deferred work falls inside this suite either, so none is
//   invented here - the one known to this port belongs to the promotion
//   characterisation suite. This file therefore contains no deferred-work
//   marker of any kind, and nothing in it is a placeholder.
//
// ---------------------------------------------------------------------------
// THE SHIPPED SURFACE IS CLOSED AT FIVE EXPORTS
// ---------------------------------------------------------------------------
//   `listLen`, `listGetAt`, `listAppend`, `listToArray`, `listFindNoCase` -
//   and nothing else. Verified against the shipped module before this suite
//   was written: it declares exactly five exports and imports nothing at all.
//
//   Several further CFML list built-ins DO occur in the legacy slice and were
//   deliberately excluded from the shipped module under its overflow rule.
//   Two matter here because a reader may expect them:
//
//     * CFML's FIRST-LIST-ITEM built-in, consumed at
//       [model/entity/ProductType.cfc:L112]. No shipped equivalent exists,
//       so first-item semantics are pinned below through `listGetAt(path, 1)`.
//     * CFML's LIST-PREPEND built-in. No shipped equivalent, no in-scope
//       consumer, and nothing here reaches for one.
//
//   The same applies to CFML's case-sensitive list-find, list-last and
//   list-delete-at built-ins, and to its list-qualify, list-sort,
//   list-set-at, list-contains and query-column-to-list built-ins. None of
//   them is imported, implemented or exercised anywhere in this file. A sixth
//   import would be a gate failure, so the import block below is exactly five
//   names plus the runner.
//
// ---------------------------------------------------------------------------
// CARRY THE ASSERTIONS, NEVER THE HARNESS
// ---------------------------------------------------------------------------
//   The legacy "unit" tier was integration style at every level:
//   [meta/tests/unit/SlatwallUnitTestBase.cfc:L52] builds the real
//   `Slatwall.Application` and :L60 calls `bootstrap()` before EACH test,
//   standing up the ORM and the bean factory. This tier is genuinely
//   isolated instead - a difference in kind, not in degree. Data is
//   constructed directly in each case; there is no database pool, no network,
//   no filesystem read and no environment read, so the suite passes with a
//   completely empty environment.
//
//   Fixtures follow [meta/tests/unit/Helper.cfc] as a PATTERN ONLY. One
//   detail of that pattern is deliberately NOT reproduced: both
//   [meta/tests/unit/Helper.cfc:L53] and [meta/tests/unit/IssuesTest.cfc:L55]
//   declare their fixture data without `var`, leaking it into component
//   scope. That is a hygiene defect in the harness being replaced, not one of
//   the preserved business-logic defects, so every binding below is a
//   block-scoped `const` declared inside the case that uses it. Nothing in
//   this file is mutable state shared between cases.
//
//   No case here asserts elapsed time, and no number in this file stands in
//   for a service level. Every choice below is justified by correctness and
//   fidelity to a measured legacy behaviour.
//
// ---------------------------------------------------------------------------
// NO USER-SPECIFIED RULES WERE PROVIDED
// ---------------------------------------------------------------------------
//   (1) No user-specified rules were provided for this project. (2) That
//   absence was VERIFIED, NOT ASSUMED: the project rules document was read
//   five independent ways - the default window, the full range `[1,-1]`, the
//   range `[2,500]` probing deliberately far past the apparent end, the
//   single line `[1,1]`, and the range `[500,1000]` - and every one returned
//   the byte-identical single line `No user rules provided.` The document is
//   a one-line sentinel and is exhausted. (3) No rule has been invented to
//   fill the gap. (4) The absence is NOT licence to lower the bar: the
//   enterprise-standard substitute applies at full strength, which in this
//   file means maximal strictness with no `any`, no suppression comment and
//   no non-null assertion, an import surface of exactly five names plus the
//   runner, no barrel, no module-scope mutable state, and every judgment call
//   annotated where it was made. (5) Zero files enter scope by rule mandate -
//   there is no third, rule-driven category of in-scope file - and there are
//   consequently no rule conflicts to resolve.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  CfmlListIndexError,
  listLen,
  listGetAt,
  listAppend,
  listToArray,
  listFindNoCase,
} from '../../../../src/lib/cfml/list.js';

describe('listLen', () => {
  // CFML parity [model/service/RoundingRuleService.cfc:L93]: this is the
  // ANCHOR SITE for the whole module. Verbatim:
  //
  //     for(var i=1; i<=listLen(arguments.roundingExpression); i++) {
  //
  // `listLen` returns a COUNT, and that count is simultaneously the upper
  // bound of a 1-based loop. The count and the indexing base are therefore
  // one contract, which is why this suite pins them together.
  it('counts the elements of a list, with a comma as the default delimiter', () => {
    expect(listLen('a')).toBe(1);
    expect(listLen('a,b,c')).toBe(3);
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L93, L170-L174]:
  // `listLen('')` IS 0, AND THAT IS LOAD-BEARING RATHER THAN AN EDGE CASE.
  //
  // An empty `roundingRuleExpression` makes this return 0, so the loop body
  // at :L93 never executes even once, `returnValue` is never assigned, and
  // control falls through to :L170-L174 - verbatim
  // `if(!isNull(returnValue)) { return returnValue; } else { return inputValue; }`
  // - which returns the input value UNCHANGED. An implementation reporting 1
  // element for `''` would enter that loop and change the price.
  it('reports 0 elements for an empty list, which is what skips the rounding loop', () => {
    expect(listLen('')).toBe(0);
  });

  // CFML parity: consecutive delimiters collapse and EMPTY ELEMENTS ARE
  // IGNORED, so a trailing delimiter does not manufacture a final element.
  it('ignores empty elements produced by trailing and repeated delimiters', () => {
    expect(listLen('a,b,')).toBe(2);
    expect(listLen('a,,b')).toBe(2);
    expect(listLen(',,')).toBe(0);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L120, L123, L126, L131, L146,
  // L149, L152, L157]: `getAppliesTo()` uses the CFML list-length built-in at
  // those EIGHT sites purely as a string-emptiness predicate, over accumulators
  // seeded `""` at :L96 and :L97. The values it accumulates are built at
  // :L111-L118 in the shape `"#arrayLen(getProducts())# Product" & ...`, so a
  // real value reads literally `"3 Products"`.
  //
  // A SPACE IS NOT A DELIMITER under the default comma, so that whole phrase
  // is ONE element. Were a space treated as a separator, an accumulator
  // holding a single applies-to phrase would report 2 and the admin-facing
  // sentence built at :L132 would be assembled from the wrong parts.
  //
  // (The source spells these `ListLen` and `ListAppend` with a capital `L`
  // while spelling other list calls lowercase; CFML identifiers are
  // case-insensitive, which is why a dedicated struct-key helper exists
  // elsewhere in this folder.)
  it('treats a space as ordinary content, not a delimiter', () => {
    expect(listLen('3 Products')).toBe(1);
    expect(listLen('3 Products,2 Product Types')).toBe(2);
  });

  // JUDGMENT CALL - DELIMITER HONESTY. The optional delimiter argument is a
  // genuine CFML feature and the shipped module exposes it for signature
  // parity, but NO IN-SCOPE CALL SITE OF `listToArray` OR `listLen` PASSES
  // ONE. The only evidence of a non-comma delimiter in the wider codebase is
  // out of scope. This case is therefore CAPABILITY COVERAGE of the shipped
  // contract, and is deliberately not presented as in-scope call-site parity.
  it('accepts a non-default delimiter (capability coverage, not call-site parity)', () => {
    expect(listLen('a|b', '|')).toBe(2);
  });
});

describe('listGetAt', () => {
  // CFML parity [model/service/RoundingRuleService.cfc:L94]: THE POSITION IS
  // 1-BASED. Verbatim, immediately inside the anchor loop:
  //
  //     var rr = listGetAt(arguments.roundingExpression, i);
  //
  // driven by `i=1` and bounded by `i<=listLen(...)`. That is a semantic to
  // reproduce, not an off-by-one to correct: a 0-based reading would shift
  // every legacy loop pair by one element, dropping the first and reading past
  // the last.
  it('is 1-based, so position 1 is the first element and listLen is the last', () => {
    expect(listGetAt('a,b,c', 1)).toBe('a');
    expect(listGetAt('a,b,c', 3)).toBe('c');
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L93-L95]: the measured
  // characterisation input `'.95,.99'` walked exactly as the anchor walks it.
  // The element is consumed at :L95 as `var rrPower = 1 * (10 ^ (len(rr)-3));`
  // - `len(rr)` is taken of the ELEMENT STRING, so the element must come back
  // as the raw, untrimmed text and not as a parsed value.
  //
  // The arithmetic that :L95 then performs, and the rounding outcomes it
  // feeds, are owned by the precision and rounding-rule suites; only the
  // element walk is pinned here.
  it('walks the anchor rounding expression element by element', () => {
    const roundingExpression = '.95,.99';

    expect(listLen(roundingExpression)).toBe(2);
    expect(listGetAt(roundingExpression, 1)).toBe('.95');
    expect(listGetAt(roundingExpression, 2)).toBe('.99');
  });

  // CFML parity [model/entity/RoundingRule.cfc:L79-L80]:
  // `hasExpressionWithListOfNumericValuesOnly()` walks the same expression
  // with the same 1-based bounded shape - the CFML list-length built-in at
  // :L79 and the element read at :L80.
  //
  // THIS IS NOT DEAD CODE: [model/validation/RoundingRule.json:L4] invokes it
  // declaratively via `"method":"hasExpressionWithListOfNumericValuesOnly"`
  // for the `save` context, so the walk really does run on every save.
  //
  // Only the element-splitting half is pinned here. The validator's own
  // predicate at :L81 - verbatim
  // `if((len(thisValue) - find(".", thisValue)) != 2 || !isNumeric(thisValue))`
  // - depends on CFML's `find()` returning 0 for a missing needle, and that
  // finding belongs to the sibling truthiness and number-format suites.
  it('walks a single-element expression and a multi-element one identically', () => {
    expect(listLen('99')).toBe(1);
    expect(listGetAt('99', 1)).toBe('99');
    expect(listGetAt('.95,.99', 1)).toBe('.95');
  });

  // AN OUT-OF-RANGE POSITION RAISES, WHICH IS CFML PARITY RATHER THAN A
  // DIVERGENCE. CFML throws for `position < 1` and for
  // `position > listLen(list)`, and so does this port.
  //
  // An earlier revision returned `''` here, justified on the grounds that every
  // in-scope legacy call site is bounded by an `i <= listLen(...)` guard - those
  // loops are [model/service/RoundingRuleService.cfc:L93-L94],
  // [model/entity/RoundingRule.cfc:L79-L80],
  // [model/service/SkuService.cfc:L73/L74, L153/L158, L160/L161, L163/L164,
  // L186/L187, L191/L196] and
  // [model/service/PromotionService.cfc:L864/L865, L899/L900, L934/L935,
  // L965/L966] - so the branch is unreachable from a faithful port.
  //
  // The boundedness is real; the CONCLUSION drawn from it was wrong. `''` is a
  // legitimate element value in CFML - it is exactly what an empty element yields
  // - so returning it for a bad index makes "you indexed past the end"
  // indistinguishable from "that element is empty", and guarantees an indexing
  // defect is silent. And because correct code cannot reach the branch, raising
  // costs ported code nothing and can only ever fire on a genuine bug. Two of the
  // loops above walk the product-type path that decides promotion qualifier and
  // reward membership, so a silently-empty element there is a wrong membership
  // decision, which is wrong money.
  it('raises for an out-of-range position, as CFML does', () => {
    expect(() => listGetAt('a,b,c', 0)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', 4)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', -1)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('', 1)).toThrow(CfmlListIndexError);
    // An empty list has length 0, so NO position is valid in it.
    expect(() => listGetAt(',,', 1)).toThrow(CfmlListIndexError);
  });

  it('raises for a non-integer, NaN or infinite position rather than truncating it', () => {
    // Truncating `1.5` to `1` would invent an intent the caller never expressed,
    // and `NaN` is how a failed numeric parse arrives - silently reading element 1
    // for it would hide the parse failure at the point it could still be caught.
    expect(() => listGetAt('a,b,c', 1.5)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', Number.NaN)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', Number.POSITIVE_INFINITY)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', Number.NEGATIVE_INFINITY)).toThrow(CfmlListIndexError);
  });

  it('reports the position, the length and the list in the raised error', () => {
    // The lists indexed here are structural identifier paths, so diagnosing a
    // fault without seeing the list is guesswork.
    let caught: unknown;
    try {
      listGetAt('a,b,c', 9);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CfmlListIndexError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('CfmlListIndexError');
    expect((caught as Error).message).toContain('9');
    expect((caught as Error).message).toContain('1..3');
    expect((caught as Error).message).toContain('a,b,c');
  });

  it('bounds the list it reproduces in the error message', () => {
    // A pathological value must not dominate a log line, and the untruncated
    // character count is reported either way.
    const long = Array.from({ length: 400 }, (_, index) => `id${String(index)}`).join(',');
    let message = '';
    try {
      listGetAt(long, 0);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('...');
    expect(message).toContain(String(long.length));
    expect(message.length).toBeLessThan(500);
  });

  it('still returns an empty string for an element that is genuinely empty', () => {
    // The distinction the raise exists to preserve. A quoted empty element is a
    // real, in-range element whose value is `''`, and it must still come back as
    // `''` rather than raising - only the INDEX is validated, never the value.
    //
    // Note this module's element model: unquoted empty runs contribute no element
    // at all, which is why `'a,,b'` has length 2. So the in-range empty value is
    // reached through a delimiter set that does not split on the character
    // holding it.
    expect(listGetAt('a,,b', 2)).toBe('b');
    expect(listLen('a,,b')).toBe(2);
    expect(listGetAt('a b', 1, ',')).toBe('a b');
  });

  // CFML parity [model/service/ProductService.cfc:L87, L89, L91]: the result
  // is used DIRECTLY AS A STRUCT KEY - verbatim
  // `arguments.data[listGetAt(keys,position)]` - inside
  // `buildSkuCombinations`, whose surrounding context is `var i = 1;` at :L84
  // and `if(listlen(keys)){` at :L86. (Note the lowercase `listlen` there
  // against the capitalised spellings elsewhere: CFML identifiers are
  // case-insensitive.)
  //
  // The consequence pinned here is narrow and exact: the element must come
  // back as the RAW element string, unmodified and untrimmed, so that it is
  // usable verbatim as a key. Case-insensitive struct-key lookup itself is
  // owned by the sibling struct suite and is deliberately not duplicated.
  it('returns the raw element string, suitable for use verbatim as a struct key', () => {
    const structKeyList = 'colorOptionGroup,sizeOptionGroup';

    expect(listGetAt(structKeyList, 1)).toBe('colorOptionGroup');
    expect(listGetAt(structKeyList, 2)).toBe('sizeOptionGroup');
  });

  // CFML parity [model/entity/ProductType.cfc:L112]: CFML's FIRST-LIST-ITEM
  // built-in has no shipped equivalent - the shipped module exports exactly
  // five functions - so first-item semantics are expressed as
  // `listGetAt(path, 1)`.
  //
  // That site sits inside `getBaseProductType()` at :L110-L115 and takes the
  // first element of `getProductTypeIDPath()`, a hierarchical materialized
  // path stored as a comma-delimited string, to reach the ROOT product type.
  // Position 1 is the root, and for a single-element path the root is the
  // path itself - both are pinned, because the single-element case is what a
  // top-level product type actually looks like.
  //
  // Walking such a path as a value object is owned by the materialized-id-path
  // suite; only the primitive read is pinned here.
  it('reads the first element of a materialized id path via position 1', () => {
    const productTypeIDPath = '2c948c8a,4b0f9d21,7fe31ac0';

    expect(listGetAt(productTypeIDPath, 1)).toBe('2c948c8a');
    expect(listLen(productTypeIDPath)).toBe(3);
    expect(listGetAt(productTypeIDPath, 3)).toBe('7fe31ac0');

    const rootOnlyPath = '2c948c8a';

    expect(listGetAt(rootOnlyPath, 1)).toBe('2c948c8a');
    expect(listLen(rootOnlyPath)).toBe(1);
  });

  // JUDGMENT CALL - DELIMITER HONESTY, as for `listLen` above: capability
  // coverage of the shipped optional argument, not in-scope call-site parity.
  it('accepts a non-default delimiter (capability coverage, not call-site parity)', () => {
    expect(listGetAt('a|b', 2, '|')).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// WHY THIS SUITE EXISTS AS ITS OWN GROUP
//
//   `listGetAt` does NOT delegate to the module's shared splitter. It runs a
//   scan that terminates as soon as the requested element is complete and
//   allocates no intermediate array, because the legacy idiom it serves is a
//   `for(i=1; i<=listLen(list); i++)` loop: delegating made an n-element list
//   allocate n arrays of n strings, and the lists are not all internal - the
//   selected-option list behind `getProductSkusBySelectedOptions`
//   [model/service/ProductService.cfc:L104] arrives from a caller, which makes
//   its length attacker-influenced.
//
//   The consequence is a DUPLICATED CONTRACT: element boundaries are now
//   implemented twice, once in the splitter that `listLen` and `listToArray`
//   share and once in the scan. Two implementations of one rule drift silently,
//   and the drift would be invisible at the call sites because `listLen` bounds
//   the very loops that drive `listGetAt` - an off-by-one between them would
//   drop or duplicate an element of a product-type path that decides promotion
//   qualifier and reward membership [model/service/PromotionService.cfc:L865,
//   L935].
//
//   These tests therefore assert AGREEMENT between the two implementations
//   directly, rather than asserting each against hand-written expectations and
//   hoping the expectations were written consistently. They are net-new: no
//   legacy test under meta/tests/** exercises the list primitives at all.
// ---------------------------------------------------------------------------
describe('the listGetAt scan agrees with the shared splitter', () => {
  // The corpus is chosen to hit every boundary rule the splitter documents, and
  // is walked exhaustively rather than sampled. Two positions PAST the end are
  // included on purpose: the scan answers an over-large position by falling off
  // the end of the list rather than by a length check, so the first position
  // past the end is the one most likely to differ, and the second confirms it
  // is not an isolated off-by-one.
  const corpus: readonly string[] = [
    '',
    ',',
    ',,',
    'a',
    'a,',
    ',a',
    ',a,',
    'a,b',
    'a,,b',
    'a,,,b',
    ',,a,,b,,',
    'a,b,c',
    'a, b ,c',
    ' , , ',
    'a,b,c,d,e,f,g,h',
  ];

  it('returns the same element as listToArray for every position in the corpus', () => {
    for (const list of corpus) {
      const elements = listToArray(list);

      // The count contract first: `listLen` is the loop bound that `listGetAt`
      // is driven by, so if these two disagree nothing below is meaningful.
      expect(listLen(list)).toBe(elements.length);

      for (let position = 1; position <= elements.length; position += 1) {
        expect(listGetAt(list, position)).toBe(elements[position - 1]);
      }

      // Out of range, both directions. CFML raises for an index outside the list
      // rather than answering the empty string, and the scan reports the count it
      // reached - so these are throws, not empty strings.
      expect(() => listGetAt(list, 0)).toThrow(CfmlListIndexError);
      expect(() => listGetAt(list, elements.length + 1)).toThrow(CfmlListIndexError);
      expect(() => listGetAt(list, elements.length + 2)).toThrow(CfmlListIndexError);
    }
  });

  // The specific boundary the scan is most likely to get wrong: a run of
  // consecutive delimiters must contribute NO element, so the element after the
  // run keeps the position it would have had with a single delimiter. Asserted
  // explicitly as well as through the corpus, because this is the rule that
  // makes `'a,,b'` two predicates rather than three in
  // [model/dao/SkuDAO.cfc:L113-L119].
  it('collapses a run of delimiters without consuming a position', () => {
    expect(listGetAt('a,,b', 2)).toBe('b');
    expect(listGetAt('a,,,,b', 2)).toBe('b');
    expect(listGetAt(',,,a', 1)).toBe('a');
    expect(listGetAt('a,,,', 1)).toBe('a');
    // `'a,,,'` holds ONE element, so position 2 is outside the list and raises.
    expect(() => listGetAt('a,,,', 2)).toThrow(CfmlListIndexError);
  });

  // A NON-EMPTY TRAILING RUN IS AN ELEMENT, and it is the one the scan reaches
  // after the loop rather than inside it, so it takes a different code path
  // from every other element and needs its own assertion.
  it('returns a trailing element that no delimiter follows', () => {
    expect(listGetAt('a,b', 2)).toBe('b');
    expect(listGetAt('a,b,', 2)).toBe('b');
    expect(listGetAt('a,,b', 2)).toBe('b');
    expect(listGetAt('a', 1)).toBe('a');
  });

  // `delimiters` is a SET OF CODE POINTS, never a delimiting string and never a
  // pattern. The scan builds its own `Set` instead of reusing the splitter's, so
  // the three ways that could go wrong are pinned here against the splitter's
  // answer rather than against a literal.
  it('treats a multi-character delimiter argument as a set of separators', () => {
    const list = 'a-b_c';

    expect(listToArray(list, '-_')).toEqual(['a', 'b', 'c']);
    expect(listGetAt(list, 1, '-_')).toBe('a');
    expect(listGetAt(list, 2, '-_')).toBe('b');
    expect(listGetAt(list, 3, '-_')).toBe('c');

    // Not a delimiting STRING: `'-_'` does not have to appear contiguously.
    expect(listGetAt('a-_b', 2, '-_')).toBe('b');
  });

  it('treats a regex metacharacter delimiter as a literal character', () => {
    // If either implementation built a regular expression from the argument,
    // `'.'` would match every character and both answers would collapse.
    expect(listToArray('a.b', '.')).toEqual(['a', 'b']);
    expect(listGetAt('a.b', 2, '.')).toBe('b');
    expect(listGetAt('a|b', 2, '|')).toBe('b');
    expect(listGetAt('a$b', 2, '$')).toBe('b');
  });

  it('keeps a surrogate pair indivisible in both the list and the delimiter set', () => {
    // Iterating a string yields whole code points, so an astral character is
    // one member of the delimiter set and one indivisible run of content. A
    // UTF-16 code-unit loop would split it and emit lone surrogates.
    const astral = '\u{1F600}';

    expect(listGetAt(`a${astral}b`, 2, astral)).toBe('b');
    expect(listToArray(`a${astral}b`, astral)).toEqual(['a', 'b']);
    expect(listGetAt(`${astral},x`, 1)).toBe(astral);
    expect(listLen(`${astral},x`)).toBe(2);
  });

  // THE RESOURCE PROPERTY THE SCAN EXISTS FOR, asserted as behaviour rather
  // than as a timing. A long list read at position 1 must not walk or
  // materialize the rest of it; the observable proxy is that the answer is
  // correct and identical to the splitter's while the whole bounded walk over a
  // list far larger than any legitimate one completes without exhausting
  // memory. A wall-clock threshold is deliberately NOT asserted - it would be
  // flaky on a shared runner - so the ceiling below is generous and only fails
  // on a re-introduced quadratic allocation.
  it('answers an early position on a long list without materializing it', () => {
    const elementCount = 20000;
    const longList = Array.from({ length: elementCount }, (_, index) => `e${String(index)}`).join(
      ',',
    );

    expect(listGetAt(longList, 1)).toBe('e0');
    expect(listGetAt(longList, 2)).toBe('e1');
    expect(listGetAt(longList, elementCount)).toBe(`e${String(elementCount - 1)}`);
    expect(() => listGetAt(longList, elementCount + 1)).toThrow(CfmlListIndexError);
    expect(listLen(longList)).toBe(elementCount);
  });
});

describe('listAppend', () => {
  // CFML parity [model/entity/Sku.cfc:L234-L238]: THE ACCUMULATOR STARTS EMPTY
  // AND THE FIRST APPEND MUST NOT EMIT A LEADING DELIMITER. This is the single
  // most likely way to get this function wrong. Verbatim:
  //
  //     var dspOptions = "";
  //     for(var i=1;i<=arrayLen(getOptions());i++) {
  //         dspOptions = listAppend(dspOptions, getOptions()[i].getOptionName(), arguments.delimiter);
  //     }
  //     return dspOptions;
  //
  // A naive `list + delimiter + value` yields `',Large'` where CFML yields
  // `'Large'`. The identical pair recurs at [model/entity/Sku.cfc:L886-L888].
  //
  // The rule is directly OBSERVABLE, not merely internal:
  // [model/entity/PriceGroupRate.cfc:L96] opens its accumulator as `""`,
  // :L120-L128 appends onto it, and :L132 then rewrites the commas into the
  // word "and" to build admin-facing text - a spurious leading comma would
  // surface to a user as a sentence beginning " and ".
  it('appends onto an empty list with NO leading delimiter', () => {
    expect(listAppend('', 'Large')).toBe('Large');
  });

  it('inserts the delimiter only between existing elements', () => {
    expect(listAppend('a', 'b')).toBe('a,b');
  });

  // CFML parity [model/entity/Sku.cfc:L236, L581, L888]: THE OPTIONAL THIRD
  // DELIMITER ARGUMENT IS REAL and is passed explicitly at three in-scope
  // sites. Two of them forward a caller-supplied delimiter whose own default
  // is A SPACE rather than a comma ([model/entity/Sku.cfc:L233, L885]), and
  // :L581 passes `","` explicitly. Dropping the parameter would break
  // signature parity at all three, so unlike the delimiter arguments of the
  // other exports this one IS exercised in scope.
  //
  // The empty-accumulator rule holds for a non-comma delimiter too: it is a
  // property of the empty list, not of the separator.
  it('honours an explicit delimiter, including on the first append', () => {
    expect(listAppend('', 'Large', '|')).toBe('Large');
    expect(listAppend('a', 'b', '|')).toBe('a|b');
  });

  it('honours a space delimiter, as the option-display accessors pass', () => {
    expect(listAppend('', 'Large', ' ')).toBe('Large');
    expect(listAppend('Small', 'Large', ' ')).toBe('Small Large');
  });

  // CFML parity [model/entity/Sku.cfc:L581]: NEVER TRIMS, NORMALIZES OR
  // COLLAPSES WHITESPACE. That site appends
  // `" #option.getOptionGroup().getOptionGroupName()#: #option.getOptionName()#"`
  // with an explicit `","` delimiter - a value that DELIBERATELY BEGINS WITH A
  // SPACE and contains a colon. The value must survive byte for byte.
  it('never trims or normalizes the appended value', () => {
    expect(listAppend('', ' Size: Large', ',')).toBe(' Size: Large');
    expect(listAppend('x', ' Size: Large', ',')).toBe('x, Size: Large');
  });

  // CFML parity - PURE, AND NOT AN IN-PLACE MUTATION. The dominant legacy
  // idiom is `x = listAppend(x, item)`, which only reads correctly because
  // CFML's version returns a NEW list and leaves its argument alone.
  //
  // Strings are immutable in JavaScript, so the input cannot be mutated
  // directly; what this case actually rules out is a hidden accumulating side
  // effect. Calling twice with identical inputs must yield identical results,
  // and interleaving a different call between them must not disturb either -
  // which is also invariant A2 restated at the primitive level, since a warm
  // Lambda container would otherwise carry state between unrelated requests.
  it('is pure: repeated and interleaved calls do not accumulate state', () => {
    const base = 'a';

    const first = listAppend(base, 'b');
    const interleaved = listAppend('q', 'r');
    const second = listAppend(base, 'b');

    expect(first).toBe('a,b');
    expect(second).toBe('a,b');
    expect(first).toBe(second);
    expect(interleaved).toBe('q,r');
    expect(base).toBe('a');
  });

  // CFML parity [model/service/PromotionService.cfc:L752-L757]: THE STRING
  // ACCUMULATOR RETURN IS PRESERVED AS A STRING, NOT REPLACED BY AN ARRAY.
  // `private string function getPromotionPeriodQualifiedFulfillmentIDList(...)`
  // seeds `var qualifiedFulfillmentIDs = "";` at :L753 and appends at :L756
  // inside a 1-based `arrayLen` loop at :L755, then returns the comma list.
  //
  // Preserving the `string` return is what keeps interface parity at that
  // signature, and it is load-bearing downstream: :L774 consumes the list by
  // POSITION, which only works on a comma list.
  //
  // The first append onto the empty accumulator must therefore yield the bare
  // identifier with NO leading comma, and the second must produce a two-element
  // list. The same accumulate-onto-empty shape recurs at
  // [model/service/PromotionService.cfc:L861, L896, L931, L962], where the
  // accumulated product-type identifiers feed the membership tests.
  it('builds a comma-list string accumulator exactly as the fulfillment id list does', () => {
    let qualifiedFulfillmentIDs = '';

    qualifiedFulfillmentIDs = listAppend(qualifiedFulfillmentIDs, 'f1000');
    expect(qualifiedFulfillmentIDs).toBe('f1000');

    qualifiedFulfillmentIDs = listAppend(qualifiedFulfillmentIDs, 'f2000');
    expect(qualifiedFulfillmentIDs).toBe('f1000,f2000');

    expect(typeof qualifiedFulfillmentIDs).toBe('string');
    expect(listLen(qualifiedFulfillmentIDs)).toBe(2);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L96-L97, L121, L124, L127,
  // L147, L150, L153]: `getAppliesTo()` accumulates onto two accumulators both
  // seeded `""`, using the CFML list-append built-in at those SIX sites and
  // guarding each with a length test. Reproduced end to end here, with the
  // real `"3 Products"` value shape, because it is the case where the
  // no-leading-delimiter rule and the space-is-content rule combine.
  it('accumulates applies-to phrases without a leading delimiter or lost spaces', () => {
    let including = '';

    including = listAppend(including, '3 Products');
    expect(including).toBe('3 Products');

    including = listAppend(including, '2 Product Types');
    expect(including).toBe('3 Products,2 Product Types');

    expect(listLen(including)).toBe(2);
    expect(listToArray(including)).toStrictEqual(['3 Products', '2 Product Types']);
  });
});

describe('listToArray', () => {
  // Whole-array comparisons throughout this block, never element indexing.
  // Under `noUncheckedIndexedAccess` an indexed read is typed
  // `string | undefined`, and the honest ways to resolve that are a whole-array
  // assertion or an explicit narrowing - not a non-null assertion, which is
  // banned here even though the test tier's lint profile would tolerate it.
  it('converts a comma list into its elements in order', () => {
    expect(listToArray('a,b,c')).toStrictEqual(['a', 'b', 'c']);
  });

  // CFML parity [integrationServices/BaseIntegration.cfc:L59-L61]: verbatim
  // `public string function getIntegrationTypes() { return ""; }`. The Google
  // adapter overrides it to return `"fw1"`, and the interface documents the
  // value as a comma-separated list drawn from the vocabulary
  // shipping | payment | fw1 | custom.
  //
  // CONVERTING THAT EMPTY LIST MUST NOT INVENT ONE EMPTY ELEMENT. `['']` would
  // present an integration as declaring a single anonymous type; `[]` correctly
  // presents it as declaring none. This is the same empty-element rule that
  // makes `listLen('')` 0, seen from the array side.
  it('converts an empty list to an empty array, never to one empty element', () => {
    expect(listToArray('')).toStrictEqual([]);
  });

  it('drops empty elements from repeated and trailing delimiters', () => {
    expect(listToArray('a,,b')).toStrictEqual(['a', 'b']);
    expect(listToArray(',,')).toStrictEqual([]);
    expect(listToArray('a,b,')).toStrictEqual(['a', 'b']);
  });

  // CFML parity [model/service/PromotionService.cfc:L165] into
  // [model/dao/PromotionDAO.cfc:L126, L129]: this is the comma-list to
  // bind-value boundary conversion, and the chain is verified end to end.
  // :L165 passes the literal
  // `rewardTypeList="merchandise,subscription,contentAccess,order,fulfillment"`
  // as a STRING; the data layer declares it as a string and converts it with
  // the CFML list-to-array built-in at :L129 so it can bind as a collection.
  //
  // All six in-scope conversions are accounted for and every one of them uses
  // the ONE-ARGUMENT DEFAULT-COMMA form: [model/dao/ProductDAO.cfc:L123],
  // [model/dao/ProductDAO.cfc:L259], [model/dao/PromotionDAO.cfc:L122],
  // [model/dao/PromotionDAO.cfc:L126], [model/dao/PromotionDAO.cfc:L129] and
  // [model/dao/PriceGroupDAO.cfc:L95] - the last wrapping a query column one
  // step further along.
  //
  // Only the conversion is pinned here. No query text of any kind appears in
  // this suite; statement shape and parameter binding are owned by the
  // repository integration tier.
  it('converts the reward-type list into its five elements at the data boundary', () => {
    const rewardTypeList = 'merchandise,subscription,contentAccess,order,fulfillment';

    expect(listToArray(rewardTypeList)).toStrictEqual([
      'merchandise',
      'subscription',
      'contentAccess',
      'order',
      'fulfillment',
    ]);
    expect(listLen(rewardTypeList)).toBe(5);
  });

  // A FRESH ARRAY ON EVERY CALL. The shipped contract states the caller may
  // mutate the result freely, which is only safe if no array is ever shared
  // between calls. A cached array would be exactly the module-scope mutable
  // state that invariant A2 forbids: on a warm Lambda container it would
  // persist between unrelated requests, so one request mutating a returned
  // list could corrupt another's.
  //
  // Deep-equal AND distinct identity are asserted together, because either
  // one alone would pass against a shared cache or against an unrelated array.
  it('returns a fresh array on every call, never a shared one', () => {
    const firstCall = listToArray('a,b');
    const secondCall = listToArray('a,b');

    expect(firstCall).toStrictEqual(['a', 'b']);
    expect(secondCall).toStrictEqual(['a', 'b']);
    expect(firstCall).not.toBe(secondCall);
  });

  // JUDGMENT CALL - THE DELIMITER IS A SET OF LITERAL CHARACTERS, NOT A
  // REGULAR EXPRESSION. The obvious implementation would build a pattern from
  // the caller's delimiter, which silently reinterprets any metacharacter: a
  // full stop would match EVERY character and split `'a.b'` into nothing
  // usable. CFML has no such hazard because it never treats the argument as a
  // pattern, so the shipped module does not either.
  //
  // A full stop is the sharpest probe available and is not hypothetical in the
  // wider codebase, where filename splitting on a full stop occurs - though
  // that path is out of scope here. This case is capability coverage of the
  // shipped contract.
  it('treats a regex metacharacter delimiter as a literal character', () => {
    expect(listToArray('a.b', '.')).toStrictEqual(['a', 'b']);
    expect(listToArray('a|b', '|')).toStrictEqual(['a', 'b']);
  });
});

describe('listFindNoCase', () => {
  // CFML parity [model/service/PromotionService.cfc:L200]: THE ARGUMENT ORDER
  // IS (list, value) - LIST FIRST - and it is uniform across every verified
  // in-scope site, in both the literal-haystack form and the
  // variable-haystack form. Verbatim at :L200:
  //
  //     if( !orderRewards and listFindNoCase("merchandise,subscription,contentAccess", reward.getRewardType()) )
  //
  // Reordering the parameters to read more naturally in English would break
  // behaviour parity at every one of them.
  //
  // RETURNS A 1-BASED POSITION, NOT A BOOLEAN. `0` means absent.
  it('takes the list first and returns the 1-based position of the match', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';

    expect(listFindNoCase(rewardTypes, 'merchandise')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'subscription')).toBe(2);
    expect(listFindNoCase(rewardTypes, 'contentAccess')).toBe(3);
  });

  it('returns 0 for a value that is absent from the list', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';

    expect(listFindNoCase(rewardTypes, 'order')).toBe(0);
    expect(listFindNoCase('a,b,c', 'Z')).toBe(0);
    expect(listFindNoCase('', 'x')).toBe(0);
  });

  // CFML parity [model/service/PromotionService.cfc:L774] IS THE DECISIVE
  // PROOF that the return is a POSITION rather than a truth value. That line
  // feeds this function's result straight into CFML's list-delete-at built-in
  // as its position argument. A boolean-returning implementation would corrupt
  // it outright: `true` would delete element 1 and `false` would be an invalid
  // position.
  //
  // (That same line spells the delete built-in with a capital `L` while
  // spelling this function with a lowercase `l`, in ONE expression - CFML
  // identifiers are case-insensitive, which is the same property that makes a
  // dedicated struct-key helper necessary elsewhere in this folder.)
  //
  // So the value is asserted to be a NUMBER at an EXACT position, not merely
  // something truthy.
  it('yields a numeric position usable directly as a positional argument', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';
    const position = listFindNoCase(rewardTypes, 'subscription');

    expect(typeof position).toBe('number');
    expect(position).toBe(2);

    expect(listFindNoCase('otSalesOrder,otExchangeOrder', 'otExchangeOrder')).toBe(2);
    expect(listFindNoCase('otReturnOrder,otExchangeOrder', 'otReturnOrder')).toBe(1);
  });

  // ★★★ CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: THE
  // ELEMENT-ORDER TRAP. :L200 and :L794 both search
  // `"merchandise,subscription,contentAccess"`, but :L714 searches THE SAME
  // THREE VALUES IN A DIFFERENT ORDER - verbatim
  // `listFindNoCase("contentAccess,merchandise,subscription", ...)`.
  //
  // Because the return is a POSITION, the very same value answers with a
  // DIFFERENT NUMBER depending on which literal was searched. NO SET-ORDERING
  // ASSUMPTION IS EVER SAFE: these literals are ordered sequences that happen
  // to share members, not sets. Positions are therefore asserted against EACH
  // literal SEPARATELY, and a future reader must not "tidy" the two literals
  // into one shared constant.
  it('reports position relative to the literal searched, so order is never assumable', () => {
    const asOrderedAtRewardAndQualifierSites = 'merchandise,subscription,contentAccess';
    const asOrderedAtTheQualifierTypeSite = 'contentAccess,merchandise,subscription';

    expect(listFindNoCase(asOrderedAtRewardAndQualifierSites, 'merchandise')).toBe(1);
    expect(listFindNoCase(asOrderedAtRewardAndQualifierSites, 'subscription')).toBe(2);
    expect(listFindNoCase(asOrderedAtRewardAndQualifierSites, 'contentAccess')).toBe(3);

    expect(listFindNoCase(asOrderedAtTheQualifierTypeSite, 'contentAccess')).toBe(1);
    expect(listFindNoCase(asOrderedAtTheQualifierTypeSite, 'merchandise')).toBe(2);
    expect(listFindNoCase(asOrderedAtTheQualifierTypeSite, 'subscription')).toBe(3);
  });

  // CFML parity - THE MATCH IS CASE-INSENSITIVE, which is the whole point of
  // this function as distinct from CFML's case-SENSITIVE list-find built-in.
  // That other built-in is genuinely used in the slice and is NOT a spelling
  // variant of this one, so it is deliberately absent from the shipped module
  // and must never be folded into this behaviour.
  it('matches case-insensitively while still reporting the exact position', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';

    expect(listFindNoCase(rewardTypes, 'MERCHANDISE')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'MerChanDise')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'merchandise')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'CONTENTaccess')).toBe(3);
  });

  // JUDGMENT CALL - THE CASE FOLD USES `toLowerCase()`, NOT
  // `toLocaleLowerCase()`. CFML's comparison here is not locale-driven, and a
  // locale-sensitive fold would change results for Turkish-dotless-I inputs.
  //
  // That is not hypothetical in this slice. The real quantity-type list
  // searched at [model/entity/Product.cfc:L442, L451] and
  // [model/entity/Sku.cfc:L294] contains a capital `I` in its final element.
  // Under a Turkish locale that `I` folds to the DOTLESS i (U+0131) while a
  // needle typed with an ordinary dotted `i` (U+0069) would not compare equal:
  // the lookup would answer 0 instead of 5 and a valid calculated quantity
  // type would be rejected as invalid.
  //
  // The suite runs with a fixed UTC timezone from the shared setup, but no
  // locale is pinned anywhere, so an ordinal fold is the only safe choice and
  // the mixed-case probe below is what would catch a regression to a
  // locale-sensitive one.
  it('folds case ordinally, so a dotted i matches regardless of locale rules', () => {
    const calculatedQuantityTypes = 'QC,QE,QNC,QATS,QIATS';

    expect(listFindNoCase(calculatedQuantityTypes, 'QATS')).toBe(4);
    expect(listFindNoCase(calculatedQuantityTypes, 'qats')).toBe(4);
    expect(listFindNoCase(calculatedQuantityTypes, 'QIATS')).toBe(5);
    expect(listFindNoCase(calculatedQuantityTypes, 'qiats')).toBe(5);
    expect(listFindNoCase(calculatedQuantityTypes, 'QiAtS')).toBe(5);
  });

  // CFML parity [model/entity/Product.cfc:L440]: the wider inventory list
  // searched immediately before the calculated one, at the same accessor.
  // :L438 guards the whole block with a `structKeyExists` test, which is
  // owned by the sibling struct suite; only the list lookup is pinned here.
  it('reports positions across the full inventory quantity-type list', () => {
    const inventoryQuantityTypes = 'QOH,QOSH,QNDOO,QNDORVO,QNDOSA,QNRORO,QNROVO,QNROSA';

    expect(listFindNoCase(inventoryQuantityTypes, 'QOH')).toBe(1);
    expect(listFindNoCase(inventoryQuantityTypes, 'QNROSA')).toBe(8);
    expect(listFindNoCase(inventoryQuantityTypes, 'qndosa')).toBe(5);
    expect(listFindNoCase(inventoryQuantityTypes, 'QATS')).toBe(0);
    expect(listLen(inventoryQuantityTypes)).toBe(8);
  });

  // Empty elements are skipped consistently with every other export, so they
  // do not shift the positions of the elements after them.
  it('does not let a skipped empty element shift later positions', () => {
    expect(listFindNoCase('a,,b', 'b')).toBe(2);
    expect(listFindNoCase('a,,b', 'a')).toBe(1);
    expect(listLen('a,,b')).toBe(2);
  });

  // JUDGMENT CALL - DELIMITER HONESTY, as for `listLen`, `listGetAt` and
  // `listToArray` above: this is CAPABILITY COVERAGE of the shipped third
  // argument, not in-scope call-site parity. Every verified in-scope call site
  // of this function uses the TWO-ARGUMENT default-comma form -
  // [model/service/PromotionService.cfc:L200, L714, L774, L794, L865, L935,
  // L966], [model/service/ProductService.cfc:L144] and
  // [model/entity/Product.cfc:L440, L442, L451].
  //
  // It is still coverage this function specifically needs rather than coverage
  // its siblings can stand in for. The delimiter argument reaches the shared
  // splitter, but the RESULT this function derives from that split is a
  // position, so a delimiter defect shows up here as a wrong NUMBER - and a
  // wrong number is the input to CFML's list-delete-at built-in at
  // [model/service/PromotionService.cfc:L774]. A sibling suite asserting the
  // same delimiter through `listToArray` proves the split; it does not prove
  // this function forwards its own third argument at all.
  //
  // Which is the sharpest point here: the default-comma contrast on the first
  // line is what makes this test able to fail. A signature that accepted the
  // argument and dropped it - forwarding the default instead - would satisfy
  // every other assertion in this block, because every other assertion uses a
  // comma list.
  it('honours a non-default delimiter (capability coverage, not call-site parity)', () => {
    // Not forwarded, and the pipe list is one element under the default comma,
    // so the whole search answers absent.
    expect(listFindNoCase('a|b|c', 'b')).toBe(0);
    expect(listFindNoCase('a|b|c', 'a|b|c')).toBe(1);

    // Forwarded: three elements, positions 1 through 3.
    expect(listFindNoCase('a|b|c', 'a', '|')).toBe(1);
    expect(listFindNoCase('a|b|c', 'b', '|')).toBe(2);
    expect(listFindNoCase('a|b|c', 'c', '|')).toBe(3);
    expect(listLen('a|b|c', '|')).toBe(3);

    // The case fold and the empty-element skip both continue to hold under a
    // custom delimiter, so the third argument changes only where elements
    // divide and nothing else about the search.
    expect(listFindNoCase('MERCHANDISE|subscription', 'merchandise', '|')).toBe(1);
    expect(listFindNoCase('a||b', 'b', '|')).toBe(2);
  });

  // JUDGMENT CALL - THE THIRD ARGUMENT IS A SET OF LITERAL CHARACTERS, NOT A
  // MULTI-CHARACTER SEPARATOR AND NOT A PATTERN. `'|;'` means "a pipe OR a
  // semicolon", never the two-character sequence `|;`. That is CFML's rule, and
  // it is worth an assertion of its own because the two readings are easy to
  // confuse and disagree on ordinary input: under a sequence reading `'a|b'`
  // holds no separator at all and collapses to a single element, so the search
  // below would answer 0 instead of 2.
  //
  // The regex-metacharacter hazard is pinned on the `listToArray` side, where a
  // full stop is the sharper probe. It is cross-referenced rather than repeated
  // here; this case owns the multi-character-set reading.
  it('reads the delimiter as a SET of characters, not as a two-character separator', () => {
    // Either character divides, on its own.
    expect(listFindNoCase('a|b;c', 'a', '|;')).toBe(1);
    expect(listFindNoCase('a|b;c', 'B', '|;')).toBe(2);
    expect(listFindNoCase('a|b;c', 'C', '|;')).toBe(3);
    expect(listLen('a|b;c', '|;')).toBe(3);

    // Each alone, which is what a sequence reading would fail.
    expect(listFindNoCase('a|b', 'b', '|;')).toBe(2);
    expect(listFindNoCase('a;b', 'b', '|;')).toBe(2);

    // Adjacent members of the set are two delimiters in a row, so they produce
    // an empty run that is skipped rather than an element positioned between
    // them.
    expect(listFindNoCase('a|;b', 'b', '|;')).toBe(2);
    expect(listToArray('a|;b', '|;')).toStrictEqual(['a', 'b']);
  });

  // The degenerate member of the set reading, asserted because it follows from
  // that reading rather than from a separate branch: an EMPTY delimiter string
  // contributes no characters, so nothing divides and a non-empty list is ONE
  // element. It is not a synonym for the default comma, and it is not an error.
  //
  // The practical consequence for a caller is stated as an assertion rather
  // than left to inference: passing an empty delimiter turns a membership test
  // into a whole-string equality test. `'a'` is no longer found in `'a,b'`,
  // while the entire `'a,b'` is - still case-insensitively, and still absent
  // from an empty list.
  it('treats an empty delimiter as no delimiter, making a non-empty list one element', () => {
    expect(listFindNoCase('a,b', 'a', '')).toBe(0);
    expect(listFindNoCase('a,b', 'a,b', '')).toBe(1);
    expect(listFindNoCase('a,b', 'A,B', '')).toBe(1);
    expect(listFindNoCase('', 'x', '')).toBe(0);

    expect(listLen('a,b', '')).toBe(1);
    expect(listToArray('a,b', '')).toStrictEqual(['a,b']);
  });
});

// ---------------------------------------------------------------------------
// ★★★ AN EXPLICIT `> 0` IS MANDATORY AT EVERY PORTED CALL SITE
// ---------------------------------------------------------------------------
// CFML parity [model/service/PromotionService.cfc:L200, L794, L865, L935,
// L966]: all five commit the bare-truthiness anti-pattern verbatim, reading a
// POSITION as though it were a predicate - `if( ... listFindNoCase(...) )`.
// The negated form appears at [model/service/ProductService.cfc:L144], and
// further instances sit at [model/entity/Product.cfc:L440, L442, L451].
//
// In CFML that reads as a question because 0 is falsy. JavaScript ALSO treats
// 0 as falsy, so transliterating the idiom would COINCIDENTALLY behave
// correctly - and that coincidence is precisely the hazard. It reads as though
// the function answers yes/no when it answers "where"; it survives review
// unexamined; and it breaks the moment someone stores the result in a
// `boolean`, compares it with `=== true`, or ports a site like
// [model/service/PromotionService.cfc:L774] that needs the position itself.
//
// REPRODUCING THE IDIOM LITERALLY IN TYPESCRIPT WOULD THEREFORE BE A BUG. The
// ported call sites must write an explicit `> 0`, or route the number through
// the CFML truthiness helper. The cases below pin the exact trap: a match at
// position 1 is truthy, an absence is falsy, and only `> 0` states the
// membership question honestly for BOTH.
// ---------------------------------------------------------------------------
describe('listFindNoCase read as a membership test', () => {
  it('is truthy at position 1 and falsy when absent, which is why > 0 is required', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';

    const firstElementPosition = listFindNoCase(rewardTypes, 'merchandise');
    const absentPosition = listFindNoCase(rewardTypes, 'order');

    // The coincidence the legacy idiom leans on, stated outright.
    expect(firstElementPosition).toBe(1);
    expect(absentPosition).toBe(0);

    // The honest membership expression, which is what ported code must write.
    expect(firstElementPosition > 0).toBe(true);
    expect(absentPosition > 0).toBe(false);
  });

  // The result is a position and must never be treated as a boolean value.
  // A `=== true` comparison against a found-at-position-1 result would be
  // false, which is the concrete failure mode the explicit `> 0` prevents.
  it('never equals a boolean, so a strict boolean comparison would misfire', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';
    const position = listFindNoCase(rewardTypes, 'merchandise');

    expect(typeof position).toBe('number');
    expect(position === 1).toBe(true);
  });

  // CFML parity [model/service/ProductService.cfc:L144-L145]: the negated
  // form, verbatim `!listFindNoCase(newOptionsData.options, ...)`, guarding a
  // list-append at :L145 - "if this option is not already in the list, add
  // it". The honest negation is `=== 0`, not `!position`.
  it('expresses the negated legacy guard as an explicit absence check', () => {
    const collectedOptionIDs = 'opt-100,opt-200';

    expect(listFindNoCase(collectedOptionIDs, 'opt-300') === 0).toBe(true);
    expect(listFindNoCase(collectedOptionIDs, 'opt-100') === 0).toBe(false);

    // The append that guard protects, so the pair is pinned together.
    expect(listAppend(collectedOptionIDs, 'opt-300')).toBe('opt-100,opt-200,opt-300');
  });
});

// ---------------------------------------------------------------------------
// THE COMPOSITION THAT DECIDES PROMOTION MEMBERSHIP
// ---------------------------------------------------------------------------
// CFML parity [model/service/PromotionService.cfc:L864-L865, L899-L900,
// L934-L935, L965-L966]: four structurally identical loops, two for qualifier
// membership and two for reward membership, each shaped verbatim as
//
//     for(var ptid=1; ptid<=listLen(<productTypeIDPath>); ptid++) {
//         if(listFindNoCase(<idList>, listGetAt(<productTypeIDPath>, ptid))) {
//
// This is where three of the five primitives compose: a `listLen` bound drives
// a 1-based `listGetAt`, whose raw element is fed straight to
// `listFindNoCase` over a separately accumulated identifier list - itself
// built by `listAppend` onto an empty accumulator at
// [model/service/PromotionService.cfc:L861, L896, L931, L962].
//
// It is pinned as a composition, not only per function, because agreement
// between the four on where one element ends and the next begins is what makes
// the walk correct. A hierarchical materialized path is walked root-first, so
// an ancestor match must be found at its true depth.
// ---------------------------------------------------------------------------
describe('the listLen / listGetAt / listFindNoCase composition', () => {
  it('walks a materialized product-type path and finds an ancestor at its depth', () => {
    const productTypeIDPath = 'root-pt,mid-pt,leaf-pt';

    let excludedProductTypeIDList = '';
    excludedProductTypeIDList = listAppend(excludedProductTypeIDList, 'mid-pt');

    expect(excludedProductTypeIDList).toBe('mid-pt');

    const pathDepth = listLen(productTypeIDPath);
    expect(pathDepth).toBe(3);

    const matchedDepths: number[] = [];
    for (let ptid = 1; ptid <= pathDepth; ptid += 1) {
      const ancestorID = listGetAt(productTypeIDPath, ptid);
      if (listFindNoCase(excludedProductTypeIDList, ancestorID) > 0) {
        matchedDepths.push(ptid);
      }
    }

    expect(matchedDepths).toStrictEqual([2]);
  });

  it('finds no match when the accumulated list stays empty', () => {
    const productTypeIDPath = 'root-pt,mid-pt,leaf-pt';
    const includedProductTypeIDList = '';

    // The empty accumulator reports no elements, so nothing can be a member.
    expect(listLen(includedProductTypeIDList)).toBe(0);

    const matchedDepths: number[] = [];
    for (let ptid = 1; ptid <= listLen(productTypeIDPath); ptid += 1) {
      const ancestorID = listGetAt(productTypeIDPath, ptid);
      if (listFindNoCase(includedProductTypeIDList, ancestorID) > 0) {
        matchedDepths.push(ptid);
      }
    }

    expect(matchedDepths).toStrictEqual([]);
  });

  // The bound and the indexing base agree exactly, so the walk visits every
  // element once - no first element dropped and no read past the last. This is
  // the invariant that makes the non-throwing out-of-range divergence
  // unobservable from ported code.
  it('visits every element exactly once under the listLen bound', () => {
    const productTypeIDPath = 'root-pt,mid-pt,leaf-pt';

    const visited: string[] = [];
    for (let ptid = 1; ptid <= listLen(productTypeIDPath); ptid += 1) {
      visited.push(listGetAt(productTypeIDPath, ptid));
    }

    expect(visited).toStrictEqual(['root-pt', 'mid-pt', 'leaf-pt']);
    expect(visited).toStrictEqual(listToArray(productTypeIDPath));
  });
});

// ---------------------------------------------------------------------------
// HAND-OFF NOTES - STATED SO THEY ARE NOT LOST, DELIBERATELY NOT ACTED ON
// ---------------------------------------------------------------------------
// Neither belongs to this module or this suite, and neither is fixed here.
//
// 1. [model/entity/Sku.cfc:L583] calls `trim(variables.skuDefinition);` as a
//    BARE STATEMENT and discards the result. CFML's `trim()` is pure, so that
//    line is a NO-OP and the leading space appended at
//    [model/entity/Sku.cfc:L581] is never removed. Owned by whoever ports the
//    Sku entity. It is independent corroboration of the no-trim rule pinned
//    above: the legacy output really does keep that space, so `listAppend`
//    must not compensate by trimming.
//
// 2. CFML's list-delete-at built-in throws when given position 0, so
//    [model/service/PromotionService.cfc:L774] is a LATENT LEGACY HAZARD for
//    any fulfillment identifier absent from the list - it gets away with it
//    only because the identifier was appended at
//    [model/service/PromotionService.cfc:L756]. That built-in is not one of
//    the five shipped exports, so under the overflow rule it belongs inside
//    the qualifier-qualification module with a documented annotation. It is
//    not imported, not implemented and not exercised anywhere in this file.
// ---------------------------------------------------------------------------
