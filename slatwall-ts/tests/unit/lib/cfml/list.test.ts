// slatwall-ts - unit suite for the CFML comma-list primitives.
//
// Every case below is grounded in a verified legacy consumer and cites its locator.
//
// There is therefore no legacy antecedent to extend here.
//
// `listLen`, `listGetAt`, `listAppend`, `listToArray`, `listFindNoCase` - and nothing else.

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
  // `listLen` returns a COUNT, and that count is simultaneously the upper bound of a 1-based loop.
  it('counts the elements of a list, with a comma as the default delimiter', () => {
    expect(listLen('a')).toBe(1);
    expect(listLen('a,b,c')).toBe(3);
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L93, L170-L174]: `listLen('')` is 0, and
  // that is load-bearing rather than an edge case.
  it('reports 0 elements for an empty list, which is what skips the rounding loop', () => {
    expect(listLen('')).toBe(0);
  });

  // CFML parity: consecutive delimiters collapse and EMPTY ELEMENTS are IGNORED, so a trailing
  // delimiter does not manufacture a final element.
  it('ignores empty elements produced by trailing and repeated delimiters', () => {
    expect(listLen('a,b,')).toBe(2);
    expect(listLen('a,,b')).toBe(2);
    expect(listLen(',,')).toBe(0);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L120, L123, L126, L131, L146, L149, L152, L157]:
  // `getAppliesTo()` uses the CFML list-length built-in at those EIGHT sites purely as a
  // string-emptiness predicate, over accumulators seeded `""` at:L96 and:L97.
  it('treats a space as ordinary content, not a delimiter', () => {
    expect(listLen('3 Products')).toBe(1);
    expect(listLen('3 Products,2 Product Types')).toBe(2);
  });

  // JUDGMENT CALL - delimiter honesty. The optional delimiter argument is a genuine CFML feature
  // and the shipped module exposes it for signature parity, but no in-scope call site of
  // `listToArray` `OR` `listLen` passes one.
  it('accepts a non-default delimiter (capability coverage, not call-site parity)', () => {
    expect(listLen('a|b', '|')).toBe(2);
  });
});

describe('listGetAt', () => {
  it('is 1-based, so position 1 is the first element and listLen is the last', () => {
    expect(listGetAt('a,b,c', 1)).toBe('a');
    expect(listGetAt('a,b,c', 3)).toBe('c');
  });

  // CFML parity [model/service/RoundingRuleService.cfc:L93-L95]: the measured characterisation
  // input `'.95,.99'` walked exactly as the anchor walks it.
  //
  // The arithmetic that:L95 then performs, and the rounding outcomes it feeds, are owned by the
  // precision and rounding-rule suites; only the element walk is pinned here.
  it('walks the anchor rounding expression element by element', () => {
    const roundingExpression = '.95,.99';

    expect(listLen(roundingExpression)).toBe(2);
    expect(listGetAt(roundingExpression, 1)).toBe('.95');
    expect(listGetAt(roundingExpression, 2)).toBe('.99');
  });

  // CFML parity [model/entity/RoundingRule.cfc:L79-L80]:
  // `hasExpressionWithListOfNumericValuesOnly()` walks the same expression with the same 1-based
  // bounded shape - the CFML list-length built-in at:L79 and the element read at:L80.
  it('walks a single-element expression and a multi-element one identically', () => {
    expect(listLen('99')).toBe(1);
    expect(listGetAt('99', 1)).toBe('99');
    expect(listGetAt('.95,.99', 1)).toBe('.95');
  });

  // divergence. CFML throws for `position < 1` and for `position > listLen(list)`, and so does
  // this port.
  //
  // The boundedness is real; the CONCLUSION drawn from it was wrong.
  it('raises for an out-of-range position, as CFML does', () => {
    expect(() => listGetAt('a,b,c', 0)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', 4)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', -1)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('', 1)).toThrow(CfmlListIndexError);
    // An empty list has length 0, so no position is valid in it.
    expect(() => listGetAt(',,', 1)).toThrow(CfmlListIndexError);
  });

  it('raises for a non-integer, NaN or infinite position rather than truncating it', () => {
    // Truncating `1.5` to `1` would invent an intent the caller never expressed, and `NaN` is how
    // a failed numeric parse arrives.
    expect(() => listGetAt('a,b,c', 1.5)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', Number.NaN)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', Number.POSITIVE_INFINITY)).toThrow(CfmlListIndexError);
    expect(() => listGetAt('a,b,c', Number.NEGATIVE_INFINITY)).toThrow(CfmlListIndexError);
  });

  it('reports the position, the length and the list in the raised error', () => {
    // The lists indexed here are structural identifier paths, so diagnosing a fault without seeing
    // the list is guesswork.
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
    // A pathological value must not dominate a log line, and the untruncated character count is
    // reported either way.
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
    // The distinction the raise exists to preserve.
    //
    // Note this module's element model: unquoted empty runs contribute no element at all, which is
    // why `'a,,b'` has length.
    expect(listGetAt('a,,b', 2)).toBe('b');
    expect(listLen('a,,b')).toBe(2);
    expect(listGetAt('a b', 1, ',')).toBe('a b');
  });

  // CFML parity [model/service/ProductService.cfc:L87, L89, L91]: the result is used directly as a
  // struct key - verbatim `arguments.data[listGetAt(keys,position)]` - inside
  // `buildSkuCombinations`.
  it('returns the raw element string, suitable for use verbatim as a struct key', () => {
    const structKeyList = 'colorOptionGroup,sizeOptionGroup';

    expect(listGetAt(structKeyList, 1)).toBe('colorOptionGroup');
    expect(listGetAt(structKeyList, 2)).toBe('sizeOptionGroup');
  });

  // CFML parity [model/entity/ProductType.cfc:L112]: CFML's FIRST-LIST-ITEM built-in has no
  // shipped equivalent - the shipped module exports exactly five functions - so first-item
  // semantics are expressed as `listGetAt(path, 1)`.
  it('reads the first element of a materialized id path via position 1', () => {
    const productTypeIDPath = '2c948c8a,4b0f9d21,7fe31ac0';

    expect(listGetAt(productTypeIDPath, 1)).toBe('2c948c8a');
    expect(listLen(productTypeIDPath)).toBe(3);
    expect(listGetAt(productTypeIDPath, 3)).toBe('7fe31ac0');

    const rootOnlyPath = '2c948c8a';

    expect(listGetAt(rootOnlyPath, 1)).toBe('2c948c8a');
    expect(listLen(rootOnlyPath)).toBe(1);
  });

  // JUDGMENT CALL - DELIMITER HONESTY, as for `listLen` above: capability coverage of the shipped
  // optional argument, not in-scope call-site parity.
  it('accepts a non-default delimiter (capability coverage, not call-site parity)', () => {
    expect(listGetAt('a|b', 2, '|')).toBe('b');
  });
});

// Why this suite exists as its own group.
//
// `listGetAt` does not delegate to the module's shared splitter.
//
// The consequence is a DUPLICATED CONTRACT: element boundaries are now implemented twice, once in
// the splitter that `listLen` and `listToArray` share and once in the scan.
describe('the listGetAt scan agrees with the shared splitter', () => {
  // The corpus is chosen to hit every boundary rule the splitter documents, and is walked
  // exhaustively rather than sampled.
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

      // The count contract first: `listLen` is the loop bound that `listGetAt` is driven by, so if
      // these two disagree nothing below is meaningful.
      expect(listLen(list)).toBe(elements.length);

      for (let position = 1; position <= elements.length; position += 1) {
        expect(listGetAt(list, position)).toBe(elements[position - 1]);
      }

      // Out of range, both directions. CFML raises for an index outside the list rather than
      // answering the empty string, and the scan reports the count it reached - so these are
      // throws, not empty strings.
      expect(() => listGetAt(list, 0)).toThrow(CfmlListIndexError);
      expect(() => listGetAt(list, elements.length + 1)).toThrow(CfmlListIndexError);
      expect(() => listGetAt(list, elements.length + 2)).toThrow(CfmlListIndexError);
    }
  });

  // The specific boundary the scan is most likely to get wrong: a run of consecutive delimiters
  // must contribute no element, so the element after the run keeps the position it would have had
  // with a single delimiter.
  it('collapses a run of delimiters without consuming a position', () => {
    expect(listGetAt('a,,b', 2)).toBe('b');
    expect(listGetAt('a,,,,b', 2)).toBe('b');
    expect(listGetAt(',,,a', 1)).toBe('a');
    expect(listGetAt('a,,,', 1)).toBe('a');
    // `'a,,,'` holds one element, so position 2 is outside the list and raises.
    expect(() => listGetAt('a,,,', 2)).toThrow(CfmlListIndexError);
  });

  // A non-empty trailing run is AN ELEMENT, and it is the one the scan reaches after the loop
  // rather than inside it, so it takes a different code path from every other element and needs
  // its own assertion.
  it('returns a trailing element that no delimiter follows', () => {
    expect(listGetAt('a,b', 2)).toBe('b');
    expect(listGetAt('a,b,', 2)).toBe('b');
    expect(listGetAt('a,,b', 2)).toBe('b');
    expect(listGetAt('a', 1)).toBe('a');
  });

  // `delimiters` is a SET of CODE POINTS, never a delimiting string and never a pattern.
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
    // If either implementation built a regular expression from the argument, `'.'` would match
    // every character and both answers would collapse.
    expect(listToArray('a.b', '.')).toEqual(['a', 'b']);
    expect(listGetAt('a.b', 2, '.')).toBe('b');
    expect(listGetAt('a|b', 2, '|')).toBe('b');
    expect(listGetAt('a$b', 2, '$')).toBe('b');
  });

  it('keeps a surrogate pair indivisible in both the list and the delimiter set', () => {
    // Iterating a string yields whole code points, so an astral character is one member of the
    // delimiter set and one indivisible run of content. A UTF-16 code-unit loop would split it and
    // emit lone surrogates.
    const astral = '\u{1F600}';

    expect(listGetAt(`a${astral}b`, 2, astral)).toBe('b');
    expect(listToArray(`a${astral}b`, astral)).toEqual(['a', 'b']);
    expect(listGetAt(`${astral},x`, 1)).toBe(astral);
    expect(listLen(`${astral},x`)).toBe(2);
  });

  // The resource property the scan exists for, asserted as behaviour rather than as a timing.
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
  // CFML parity [model/entity/Sku.cfc:L234-L238]: the accumulator starts empty and the first
  // append must not emit a leading delimiter. This is the single most likely way to get this
  // function wrong.
  //
  // A naive `list + delimiter + value` yields `',Large'` where CFML yields `'Large'`.
  it('appends onto an empty list with NO leading delimiter', () => {
    expect(listAppend('', 'Large')).toBe('Large');
  });

  it('inserts the delimiter only between existing elements', () => {
    expect(listAppend('a', 'b')).toBe('a,b');
  });

  // CFML parity [model/entity/Sku.cfc:L236, L581, L888]: the optional third delimiter argument is
  // real and is passed explicitly at three in-scope sites.
  //
  // The empty-accumulator rule holds for a non-comma delimiter too: it is a property of the empty
  // list, not of the separator.
  it('honours an explicit delimiter, including on the first append', () => {
    expect(listAppend('', 'Large', '|')).toBe('Large');
    expect(listAppend('a', 'b', '|')).toBe('a|b');
  });

  it('honours a space delimiter, as the option-display accessors pass', () => {
    expect(listAppend('', 'Large', ' ')).toBe('Large');
    expect(listAppend('Small', 'Large', ' ')).toBe('Small Large');
  });

  // CFML parity [model/entity/Sku.cfc:L581]: never trims, normalizes or collapses whitespace.
  it('never trims or normalizes the appended value', () => {
    expect(listAppend('', ' Size: Large', ',')).toBe(' Size: Large');
    expect(listAppend('x', ' Size: Large', ',')).toBe('x, Size: Large');
  });

  // CFML parity - PURE, and not an in-place mutation. The dominant legacy idiom is
  // `x = listAppend(x, item)`, which only reads correctly because CFML's version returns a NEW
  // list and leaves its argument alone.
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

  // CFML parity [model/service/PromotionService.cfc:L752-L757]: the string accumulator return is
  // preserved as a string, not replaced by an array.
  //
  // Preserving the `string` return is what keeps interface parity at that signature, and it is
  // load-bearing downstream::L774 consumes the list by POSITION, which only works on a comma list.
  it('builds a comma-list string accumulator exactly as the fulfillment id list does', () => {
    let qualifiedFulfillmentIDs = '';

    qualifiedFulfillmentIDs = listAppend(qualifiedFulfillmentIDs, 'f1000');
    expect(qualifiedFulfillmentIDs).toBe('f1000');

    qualifiedFulfillmentIDs = listAppend(qualifiedFulfillmentIDs, 'f2000');
    expect(qualifiedFulfillmentIDs).toBe('f1000,f2000');

    expect(typeof qualifiedFulfillmentIDs).toBe('string');
    expect(listLen(qualifiedFulfillmentIDs)).toBe(2);
  });

  // CFML parity [model/entity/PriceGroupRate.cfc:L96-L97, L121, L124, L127, L147, L150, L153]:
  // `getAppliesTo()` accumulates onto two accumulators both seeded `""`, using the CFML
  // list-append built-in at those six sites and guarding each with a length test.
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
  it('converts a comma list into its elements in order', () => {
    expect(listToArray('a,b,c')).toStrictEqual(['a', 'b', 'c']);
  });

  // CFML parity [integrationServices/BaseIntegration.cfc:L59-L61]: verbatim
  // `public string function getIntegrationTypes() { return ""; }`.
  //
  // Present an integration as declaring a single anonymous type; `[]` correctly presents it as
  // declaring none.
  it('converts an empty list to an empty array, never to one empty element', () => {
    expect(listToArray('')).toStrictEqual([]);
  });

  it('drops empty elements from repeated and trailing delimiters', () => {
    expect(listToArray('a,,b')).toStrictEqual(['a', 'b']);
    expect(listToArray(',,')).toStrictEqual([]);
    expect(listToArray('a,b,')).toStrictEqual(['a', 'b']);
  });

  // CFML parity [model/service/PromotionService.cfc:L165] into
  // [model/dao/PromotionDAO.cfc:L126, L129]: this is the comma-list to bind-value boundary
  // conversion, and the chain is verified end to end.:L165 passes the literal
  // `rewardTypeList="merchandise,subscription,contentAccess,order,fulfillment"` as a STRING.
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

  // Deep-equal and distinct identity are asserted together, because either one alone would pass
  // against a shared cache or against an unrelated array.
  it('returns a fresh array on every call, never a shared one', () => {
    const firstCall = listToArray('a,b');
    const secondCall = listToArray('a,b');

    expect(firstCall).toStrictEqual(['a', 'b']);
    expect(secondCall).toStrictEqual(['a', 'b']);
    expect(firstCall).not.toBe(secondCall);
  });

  // A full stop is the sharpest probe available and is not hypothetical in the wider codebase,
  // where filename splitting on a full stop occurs - though that path is out of scope here.
  it('treats a regex metacharacter delimiter as a literal character', () => {
    expect(listToArray('a.b', '.')).toStrictEqual(['a', 'b']);
    expect(listToArray('a|b', '|')).toStrictEqual(['a', 'b']);
  });
});

describe('listFindNoCase', () => {
  // Reordering the parameters to read more naturally in English would break behaviour parity at
  // every one of them.
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

  // CFML parity [model/service/PromotionService.cfc:L774] is the DECISIVE PROOF that the return is
  // a POSITION rather than a truth value. That line feeds this function's result straight into
  // CFML's list-delete-at built-in as its position argument.
  //
  // So the value is asserted to be a NUMBER at an EXACT position, not merely something truthy.
  it('yields a numeric position usable directly as a positional argument', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';
    const position = listFindNoCase(rewardTypes, 'subscription');

    expect(typeof position).toBe('number');
    expect(position).toBe(2);

    expect(listFindNoCase('otSalesOrder,otExchangeOrder', 'otExchangeOrder')).toBe(2);
    expect(listFindNoCase('otReturnOrder,otExchangeOrder', 'otReturnOrder')).toBe(1);
  });

  // CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: the element-order
  // TRAP.:L200 and:L794 both search `"merchandise,subscription,contentAccess"`, but:L714 searches
  // the same three values in a different order.
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

  // CFML parity - the match is case-insensitive, which is the whole point of this function as
  // distinct from CFML's case-SENSITIVE list-find built-in.
  it('matches case-insensitively while still reporting the exact position', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';

    expect(listFindNoCase(rewardTypes, 'MERCHANDISE')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'MerChanDise')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'merchandise')).toBe(1);
    expect(listFindNoCase(rewardTypes, 'CONTENTaccess')).toBe(3);
  });

  // JUDGMENT CALL - the case fold uses `toLowerCase()`, not `toLocaleLowerCase()`. CFML's
  // comparison here is not locale-driven, and a locale-sensitive fold would change results for
  // Turkish-dotless-I inputs.
  //
  // The suite runs with a fixed UTC timezone from the shared setup, but no locale is pinned
  // anywhere.
  it('folds case ordinally, so a dotted i matches regardless of locale rules', () => {
    const calculatedQuantityTypes = 'QC,QE,QNC,QATS,QIATS';

    expect(listFindNoCase(calculatedQuantityTypes, 'QATS')).toBe(4);
    expect(listFindNoCase(calculatedQuantityTypes, 'qats')).toBe(4);
    expect(listFindNoCase(calculatedQuantityTypes, 'QIATS')).toBe(5);
    expect(listFindNoCase(calculatedQuantityTypes, 'qiats')).toBe(5);
    expect(listFindNoCase(calculatedQuantityTypes, 'QiAtS')).toBe(5);
  });

  // CFML parity [model/entity/Product.cfc:L440]: the wider inventory list searched immediately
  // before the calculated one, at the same accessor.:L438 guards the whole block with a
  // `structKeyExists` test, which is owned by the sibling struct suite.
  it('reports positions across the full inventory quantity-type list', () => {
    const inventoryQuantityTypes = 'QOH,QOSH,QNDOO,QNDORVO,QNDOSA,QNRORO,QNROVO,QNROSA';

    expect(listFindNoCase(inventoryQuantityTypes, 'QOH')).toBe(1);
    expect(listFindNoCase(inventoryQuantityTypes, 'QNROSA')).toBe(8);
    expect(listFindNoCase(inventoryQuantityTypes, 'qndosa')).toBe(5);
    expect(listFindNoCase(inventoryQuantityTypes, 'QATS')).toBe(0);
    expect(listLen(inventoryQuantityTypes)).toBe(8);
  });

  // Empty elements are skipped consistently with every other export, so they do not shift the
  // positions of the elements after them.
  it('does not let a skipped empty element shift later positions', () => {
    expect(listFindNoCase('a,,b', 'b')).toBe(2);
    expect(listFindNoCase('a,,b', 'a')).toBe(1);
    expect(listLen('a,,b')).toBe(2);
  });

  // JUDGMENT CALL - delimiter honesty, as for `listLen`, `listGetAt` and `listToArray` above: this
  // is capability coverage of the shipped third argument, not in-scope call-site parity.
  //
  // The sharpest point here is the default-comma contrast on the first line: it is what makes this
  // test able to fail.
  it('honours a non-default delimiter (capability coverage, not call-site parity)', () => {
    // Not forwarded, and the pipe list is one element under the default comma, so the whole search
    // answers absent.
    expect(listFindNoCase('a|b|c', 'b')).toBe(0);
    expect(listFindNoCase('a|b|c', 'a|b|c')).toBe(1);

    // Forwarded: three elements, positions 1 through.
    expect(listFindNoCase('a|b|c', 'a', '|')).toBe(1);
    expect(listFindNoCase('a|b|c', 'b', '|')).toBe(2);
    expect(listFindNoCase('a|b|c', 'c', '|')).toBe(3);
    expect(listLen('a|b|c', '|')).toBe(3);

    // The case fold and the empty-element skip both continue to hold under a custom delimiter, so
    // the third argument changes only where elements divide and nothing else about the search.
    expect(listFindNoCase('MERCHANDISE|subscription', 'merchandise', '|')).toBe(1);
    expect(listFindNoCase('a||b', 'b', '|')).toBe(2);
  });

  // A multi-character delimiter is a SET of separators and not a pattern. `'|;'` means "a pipe or a
  // semicolon", never the two-character sequence `|;`.
  //
  // The regex-metacharacter hazard is pinned on the `listToArray` side, where a full stop is the
  // sharper probe.
  it('reads the delimiter as a SET of characters, not as a two-character separator', () => {
    // Either character divides, on its own.
    expect(listFindNoCase('a|b;c', 'a', '|;')).toBe(1);
    expect(listFindNoCase('a|b;c', 'B', '|;')).toBe(2);
    expect(listFindNoCase('a|b;c', 'C', '|;')).toBe(3);
    expect(listLen('a|b;c', '|;')).toBe(3);

    // Each alone, which is what a sequence reading would fail.
    expect(listFindNoCase('a|b', 'b', '|;')).toBe(2);
    expect(listFindNoCase('a;b', 'b', '|;')).toBe(2);

    // Adjacent members of the set are two delimiters in a row, so they produce an empty run that
    // is skipped rather than an element positioned between them.
    expect(listFindNoCase('a|;b', 'b', '|;')).toBe(2);
    expect(listToArray('a|;b', '|;')).toStrictEqual(['a', 'b']);
  });

  // The degenerate member of the set reading, asserted because it follows from that reading rather
  // than from a separate branch: an EMPTY delimiter string contributes no characters.
  it('treats an empty delimiter as no delimiter, making a non-empty list one element', () => {
    expect(listFindNoCase('a,b', 'a', '')).toBe(0);
    expect(listFindNoCase('a,b', 'a,b', '')).toBe(1);
    expect(listFindNoCase('a,b', 'A,B', '')).toBe(1);
    expect(listFindNoCase('', 'x', '')).toBe(0);

    expect(listLen('a,b', '')).toBe(1);
    expect(listToArray('a,b', '')).toStrictEqual(['a,b']);
  });
});

// CFML parity [model/service/PromotionService.cfc:L200, L794, L865, L935, L966]: all five commit
// the bare-truthiness anti-pattern verbatim, reading a POSITION as though it were a predicate -
// `if(... ListFindNoCase(...) )`.
//
// Ported call sites must write an explicit `> 0`, or route the number through the CFML truthiness
// helper.
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
  it('never equals a boolean, so a strict boolean comparison would misfire', () => {
    const rewardTypes = 'merchandise,subscription,contentAccess';
    const position = listFindNoCase(rewardTypes, 'merchandise');

    expect(typeof position).toBe('number');
    expect(position === 1).toBe(true);
  });

  // CFML parity [model/service/ProductService.cfc:L144-L145]: the negated form, verbatim
  // `!listFindNoCase(newOptionsData.options,...)`, guarding a list-append at:L145 - "if this
  // option is not already in the list, add it".
  it('expresses the negated legacy guard as an explicit absence check', () => {
    const collectedOptionIDs = 'opt-100,opt-200';

    expect(listFindNoCase(collectedOptionIDs, 'opt-300') === 0).toBe(true);
    expect(listFindNoCase(collectedOptionIDs, 'opt-100') === 0).toBe(false);

    // The append that guard protects, so the pair is pinned together.
    expect(listAppend(collectedOptionIDs, 'opt-300')).toBe('opt-100,opt-200,opt-300');
  });
});

// CFML parity [model/service/PromotionService.cfc:L864-L865, L899-L900, L934-L935, L965-L966]:
// four structurally identical loops, two for qualifier membership and two for reward membership,
// each shaped verbatim as.
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

  // The bound and the indexing base agree exactly, so the walk visits every element once - no
  // first element dropped and no read past the last.
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

// Neither belongs to this module or this suite, and neither is fixed here.
//
// [model/entity/Sku.cfc:L583] calls `trim(variables.skuDefinition);` as a bare statement and
// discards the result.
