// slatwall-ts - repository suite for the AND-of-EXISTS selected-options statement.
//
// The suite has two halves and they guard the same thing from two directions.
//
// The PARITY HALF asserts the emitted text and the bind order character for character.
//
// The REFUSAL HALF asserts the input bound instead: `MAX_PLACEHOLDER_COUNT` is imported from the
// module the statement builder shares with the pool, and the rejections are pinned - a list one
// element past the placeholder ceiling is refused, and the ceiling itself is accepted.
//
// Why this sits under tests/integration/repositories/ and needs no database: the tier names the
// layer under test - the seam between adapter and statement - not the presence of a server. This
// half builds statement text from a pure function, so `TEST_LIVE_DATABASE` is neither imported nor
// consulted and setting it changes nothing this suite proves.

import { describe, expect, it } from 'vitest';

import { MAX_PLACEHOLDER_COUNT } from '../../../src/repositories/mysql/connection.js';
import { buildSkusBySelectedOptionsStatement } from '../../../src/repositories/mysql/sql/skusBySelectedOptions.sql.js';

/**
 * The seed fragment, restated here independently of the module under test.
 *
 * Restating it rather than importing it is the point: the module's fragments are not exported.
 */
const EXPECTED_SEED =
  'select distinct sku.* from SwSku as sku \n' +
  '\t\t\t\t\tinner join SwSkuOption as opt on opt.skuID = sku.skuID \n' +
  '\t\t\t\t\twhere \n' +
  '\t\t\t\t\t0 = 0 ';

/**
 * One correlated EXISTS, transcribed from [model/dao/SkuDAO.cfc:L115-L119].
 */
const EXPECTED_OPTION_EXISTS =
  'and exists (\n' +
  '\t\t\t\t\t\tselect * from SwOption o\n' +
  '\t\t\t\t\t\tjoin SwSkuOption s on s.optionID = o.optionID where s.skuID = sku.skuID\n' +
  '\t\t\t\t\t\tand o.optionID = ?\n' +
  '\t\t\t\t\t) ';

/**
 * The closing conjunct, transcribed from [model/dao/SkuDAO.cfc:L124].
 */
const EXPECTED_PRODUCT_PREDICATE = 'and sku.productID = ?';

/**
 * A well-formed option ID: 32 lowercase hex characters, as the generator emits.
 */
const OPTION_A = '4f2a91c8b73e40d6ae15c92fb8074d3a';

/**
 * A second well-formed option ID, distinct from the first.
 */
const OPTION_B = 'c81d05e4fa6b47289d3e6170ba52cf9e';

/**
 * A third well-formed option ID, distinct from the first two.
 */
const OPTION_C = '9b6e37f0d24c418aa5710e83c6fd92b1';

/**
 * The declared width of the `SwOption` key column, restated for readability.
 *
 * It is not a bound the builder enforces - the builder enforces nothing - and it is not imported
 * from the module under test, because the module publishes no such value any more.
 */
const OPTION_ID_COLUMN_WIDTH = 32;

/**
 * A list length large enough to stand in for "unbounded", used by the case that pins the ABSENCE
 * of a count bound.
 */
const UNBOUNDED_LIST_LENGTH = 200;

/**
 * Count the positional placeholders in a statement.
 */
function placeholderCount(sql: string): number {
  return sql.split('?').length - 1;
}

/**
 * Count non-overlapping occurrences of a fragment in a statement.
 */
function occurrences(sql: string, fragment: string): number {
  return sql.split(fragment).length - 1;
}

/**
 * Build a comma-delimited list of `count` distinct well-formed option IDs.
 *
 * Each ID is padded to the full 32-character column width, so the list this returns is the widest
 * a well-formed list of that length can be.
 */
function listOfWellFormedIDs(count: number): string {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    ids.push(`opt${String(index).padStart(OPTION_ID_COLUMN_WIDTH - 3, '0')}`);
  }

  return ids.join(',');
}

describe('buildSkusBySelectedOptionsStatement - the empty list', () => {
  it('emits the seed alone and binds nothing [model/dao/SkuDAO.cfc:L113]', () => {
    // `listLen('')` is 0, so the loop body never runs. No early return, no throw, no forced-empty
    // result set: the legacy has none, so neither does this.
    const statement = buildSkusBySelectedOptionsStatement('');

    expect(statement.sql).toBe(EXPECTED_SEED);
    expect(statement.params).toEqual([]);
    expect(placeholderCount(statement.sql)).toBe(0);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(0);
  });

  it('is not a contract violation, because the contract bounds size and shape only', () => {
    expect(() => buildSkusBySelectedOptionsStatement('')).not.toThrow();
  });

  it('treats a list of only delimiters as empty, because listLen(",,,") is 0', () => {
    const statement = buildSkusBySelectedOptionsStatement(',,,');

    expect(statement.sql).toBe(EXPECTED_SEED);
    expect(statement.params).toEqual([]);
  });

  it('still appends the product conjunct when productID accompanies an empty list', () => {
    const statement = buildSkusBySelectedOptionsStatement('', 'prod-1');

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_PRODUCT_PREDICATE);
    expect(statement.params).toEqual(['prod-1']);
  });
});

describe('buildSkusBySelectedOptionsStatement - one selected option', () => {
  it('appends exactly one EXISTS and binds exactly one value', () => {
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS);
    expect(statement.params).toEqual([OPTION_A]);
    expect(placeholderCount(statement.sql)).toBe(1);
  });

  it('joins the seed and the clause across the seed trailing space, not a newline', () => {
    // The seed ends `0 = 0 ` and the fragment begins `and`, so the two land on the same line.
    // Losing that space yields `0 = 0and exists (`.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(statement.sql).toContain('0 = 0 and exists (');
    expect(statement.sql).not.toContain('0 = 0and');
  });

  it('binds the value rather than interpolating it', () => {
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(statement.sql).not.toContain(OPTION_A);
    expect(statement.sql).toContain('and o.optionID = ?');
  });
});

describe('buildSkusBySelectedOptionsStatement - several selected options', () => {
  it('appends one EXISTS per option, ANDed, and binds in list order', () => {
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_B},${OPTION_C}`);

    expect(statement.sql).toBe(
      EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_OPTION_EXISTS + EXPECTED_OPTION_EXISTS,
    );
    expect(statement.params).toEqual([OPTION_A, OPTION_B, OPTION_C]);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(3);
  });

  it('is CONJUNCTIVE: the clauses are ANDed, never ORed', () => {
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_B}`);

    expect(occurrences(statement.sql, 'and exists (')).toBe(2);
    expect(statement.sql.toLowerCase()).not.toContain(' or ');
  });

  it('carries NO cardinality test, so a SKU with extra options still matches', () => {
    // The contract is "at least these options", never "exactly these options". A HAVING COUNT /
    // GROUP by / INTERSECT formulation would change that.
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_B},${OPTION_C}`);
    const lowered = statement.sql.toLowerCase();

    expect(lowered).not.toContain('group by');
    expect(lowered).not.toContain('having');
    expect(lowered).not.toContain('count(');
    expect(lowered).not.toContain('intersect');
    expect(lowered).not.toContain('find_in_set');
    expect(lowered).not.toContain(' in (');
  });

  it('reuses the aliases o and s in every subquery rather than de-duplicating them', () => {
    // Legal, because each subquery is its own scope. Reproduced as-is.
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_B}`);

    expect(occurrences(statement.sql, 'select * from SwOption o')).toBe(2);
    expect(occurrences(statement.sql, 'join SwSkuOption s on s.optionID = o.optionID')).toBe(2);
  });

  it('keeps one parameter per placeholder for every list length from 0 to 64', () => {
    for (let count = 0; count <= 64; count += 1) {
      const statement = buildSkusBySelectedOptionsStatement(listOfWellFormedIDs(count));

      expect(statement.params).toHaveLength(count);
      expect(placeholderCount(statement.sql)).toBe(count);
      expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(count);
    }
  });
});

describe('buildSkusBySelectedOptionsStatement - CFML list element boundaries', () => {
  it('collapses consecutive delimiters, so "a,,b" contributes two predicates', () => {
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},,${OPTION_B}`);

    expect(statement.params).toEqual([OPTION_A, OPTION_B]);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(2);
  });

  it('ignores a leading and a trailing delimiter', () => {
    const statement = buildSkusBySelectedOptionsStatement(`,${OPTION_A},`);

    expect(statement.params).toEqual([OPTION_A]);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(1);
  });
});

describe('buildSkusBySelectedOptionsStatement - the productID conjunct', () => {
  it('omits the conjunct when productID is absent [model/dao/SkuDAO.cfc:L122]', () => {
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(statement.sql).not.toContain('sku.productID');
    expect(statement.params).toEqual([OPTION_A]);
  });

  it('omits the conjunct when productID is explicitly undefined', () => {
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A, undefined);

    expect(statement.sql).not.toContain('sku.productID');
    expect(statement.params).toEqual([OPTION_A]);
  });

  it('appends the conjunct LAST and binds productID LAST', () => {
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_B}`, 'prod-9');

    expect(statement.sql).toBe(
      EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE,
    );
    expect(statement.params).toEqual([OPTION_A, OPTION_B, 'prod-9']);
    expect(statement.sql.endsWith(EXPECTED_PRODUCT_PREDICATE)).toBe(true);
  });

  it('fires on PRESENCE, not truthiness: an empty productID still appends and binds', () => {
    // CFML parity [model/dao/SkuDAO.cfc:L122-L126]: the legacy guard is structKeyExists() with no
    // len()/trim() test, so an empty string appends the clause and binds '', yielding zero rows.
    // Do not add a length guard, and do not let the input contract reach productID.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A, '');

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE);
    expect(statement.params).toEqual([OPTION_A, '']);
    expect(placeholderCount(statement.sql)).toBe(2);
  });

  it('does not shape-check productID, because it multiplies nothing', () => {
    // A malformed productID appends exactly one clause and one bind value, the same as a
    // well-formed one, so bounding it would buy nothing and would reject the empty string the
    // guard above deliberately accepts.
    expect(() =>
      buildSkusBySelectedOptionsStatement(OPTION_A, 'not a well formed id at all, with a comma'),
    ).not.toThrow();
  });
});

describe('buildSkusBySelectedOptionsStatement - the returned value', () => {
  it('freezes the statement, because a statement is a value', () => {
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(Object.isFrozen(statement)).toBe(true);
  });

  it('freezes the bind array too, so a statement cannot be reordered after the fact', () => {
    // Deliberately the OPPOSITE of what this module documented when the case was first written.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(Object.isFrozen(statement.params)).toBe(true);
  });

  it('returns an independent statement per call, sharing no accumulator', () => {
    const first = buildSkusBySelectedOptionsStatement(OPTION_A);
    const second = buildSkusBySelectedOptionsStatement(`${OPTION_B},${OPTION_C}`);

    expect(first.params).toEqual([OPTION_A]);
    expect(second.params).toEqual([OPTION_B, OPTION_C]);
    expect(first.params).not.toBe(second.params);
  });
});

describe('buildSkusBySelectedOptionsStatement - the seed is preserved exactly', () => {
  it('keeps the 0 = 0 accumulator seed [model/dao/SkuDAO.cfc:L111-L112]', () => {
    const statement = buildSkusBySelectedOptionsStatement('');

    expect(statement.sql).toContain('0 = 0 ');
  });

  it('keeps the unreferenced opt join and the single distinct', () => {
    // The join excludes SKUs with zero options and is what makes DISTINCT necessary. Removing
    // either changes results.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(statement.sql).toContain('inner join SwSkuOption as opt on opt.skuID = sku.skuID');
    expect(occurrences(statement.sql, 'distinct')).toBe(1);
    expect(statement.sql.startsWith('select distinct sku.* from SwSku as sku ')).toBe(true);
  });

  it('adds no ORDER BY, LIMIT, COALESCE, IFNULL or index hint', () => {
    const lowered = buildSkusBySelectedOptionsStatement(
      `${OPTION_A},${OPTION_B}`,
      'prod-1',
    ).sql.toLowerCase();

    expect(lowered).not.toContain('order by');
    expect(lowered).not.toContain('limit');
    expect(lowered).not.toContain('coalesce');
    expect(lowered).not.toContain('ifnull');
    expect(lowered).not.toContain('use index');
    expect(lowered).not.toContain('force index');
  });
});

// Every case in this block was written the other way round. It asserted a `RangeError` or a
// `TypeError`; it now asserts the statement the legacy emits.
//
// The shared reason, stated once: an input that cannot match is not an input that cannot be asked.

describe('buildSkusBySelectedOptionsStatement - totality: it never throws', () => {
  it('accepts a list at the widest admissible width', () => {
    const widest = listOfWellFormedIDs(64);

    expect(widest).toHaveLength(2111);

    const statement = buildSkusBySelectedOptionsStatement(widest);

    expect(statement.params).toHaveLength(64);
    expect(placeholderCount(statement.sql)).toBe(64);
  });

  it('CARRIES NO COUNT BOUND: one option past the old cap still emits and binds', () => {
    // The old cap was 64 and this is 65. The clause count and the bind count are the assertions
    // that matter: a surviving cap could not produce either.
    const pastTheOldCap = listOfWellFormedIDs(65);
    const statement = buildSkusBySelectedOptionsStatement(pastTheOldCap);

    expect(statement.params).toHaveLength(65);
    expect(placeholderCount(statement.sql)).toBe(65);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(65);
  });

  it('CARRIES NO COUNT BOUND at a length no reader would mistake for admissible', () => {
    // The legacy loop appends one clause per element and imposes no upper bound of any kind
    // [model/dao/SkuDAO.cfc:L113-L120].
    const statement = buildSkusBySelectedOptionsStatement(
      listOfWellFormedIDs(UNBOUNDED_LIST_LENGTH),
    );

    expect(statement.params).toHaveLength(UNBOUNDED_LIST_LENGTH);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(UNBOUNDED_LIST_LENGTH);
  });

  it('CARRIES NO SERIALIZED-LENGTH BOUND: a list past the old 4096 still emits', () => {
    const overlong = 'a'.repeat(4097);
    const statement = buildSkusBySelectedOptionsStatement(overlong);

    // One element, because the string holds no delimiter: `listLen` sees a single 4097-character
    // identifier. It names no row, so the statement returns none.
    expect(statement.params).toEqual([overlong]);
    expect(placeholderCount(statement.sql)).toBe(1);
    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS);
  });

  it('CARRIES NO COLUMN-WIDTH BOUND: a 33-character option ID is bound, not refused', () => {
    // [model/entity/Option.cfc:L52] declares length="32", so a 33-character ID cannot exist in
    // SwOption - which is exactly why binding it is safe.
    const tooWide = 'a'.repeat(OPTION_ID_COLUMN_WIDTH + 1);
    const statement = buildSkusBySelectedOptionsStatement(tooWide);

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS);
    expect(statement.params).toEqual([tooWide]);
  });

  it('accepts an option ID exactly at the declared column width', () => {
    const exact = 'a'.repeat(OPTION_ID_COLUMN_WIDTH);
    const statement = buildSkusBySelectedOptionsStatement(exact);

    expect(statement.params).toEqual([exact]);
  });

  it('CARRIES NO SHAPE CHECK: a malformed element is bound wherever it sits', () => {
    // Position mattered to the old check only because it walked the list to find the first
    // offender. Nothing walks the list now except the emit loop, so all three of these bind every
    // element in list order.
    expect(buildSkusBySelectedOptionsStatement(`bad id,${OPTION_A}`).params).toEqual([
      'bad id',
      OPTION_A,
    ]);
    expect(buildSkusBySelectedOptionsStatement(`${OPTION_A},bad id`).params).toEqual([
      OPTION_A,
      'bad id',
    ]);
    expect(buildSkusBySelectedOptionsStatement(`${OPTION_A},bad id,${OPTION_B}`).params).toEqual([
      OPTION_A,
      'bad id',
      OPTION_B,
    ]);
  });

  it('BINDS characters that carry meaning in SQL rather than refusing them', () => {
    // MORE THAN the OLD one did. The old case asserted a TypeError, which demonstrated only that a
    // check existed.
    for (const malformed of [
      "a'b",
      'a"b',
      'a;b',
      'a b',
      'a)b',
      'a(b',
      'a*b',
      'a%b',
      'a=b',
      'a\nb',
      'a\tb',
      'a.b',
      'a/b',
      "' or 1=1 --",
      'a; drop table SwSku; --',
    ]) {
      const statement = buildSkusBySelectedOptionsStatement(malformed);

      expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS);
      expect(statement.sql).not.toContain(malformed);
      expect(statement.params).toEqual([malformed]);
      expect(placeholderCount(statement.sql)).toBe(1);
    }
  });

  it('DOES NOT TRIM: " b" is bound as " b", neither repaired nor refused', () => {
    // CFML `listGetAt` returns the element untrimmed, so 'a, b' yields 'a' and ' b'.
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A}, ${OPTION_B}`);

    expect(statement.params).toEqual([OPTION_A, ` ${OPTION_B}`]);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(2);
  });

  it('BINDS A REPEATED OPTION TWICE rather than refusing the duplicate', () => {
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_A}`);

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_OPTION_EXISTS);
    expect(statement.params).toEqual([OPTION_A, OPTION_A]);
  });

  it('BINDS AN OPTION FOREIGN TO THE NARROWED PRODUCT rather than refusing it', () => {
    // Revision read the product's own option identifiers first and refused any selection
    // containing one that did not belong to it.
    const statement = buildSkusBySelectedOptionsStatement('option-of-another-product', 'prod-1');

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE);
    expect(statement.params).toEqual(['option-of-another-product', 'prod-1']);
  });

  it('IS TOTAL over every input the removed guards named, in one sweep', () => {
    // A single case that fails if any guard returns, whatever form it takes.
    const previouslyRejected: readonly (readonly [string, string | undefined])[] = [
      [listOfWellFormedIDs(65), undefined],
      [listOfWellFormedIDs(UNBOUNDED_LIST_LENGTH), undefined],
      ['a'.repeat(4097), undefined],
      ['a'.repeat(OPTION_ID_COLUMN_WIDTH + 1), undefined],
      [`${OPTION_A}, ${OPTION_B}`, undefined],
      [`${OPTION_A},${OPTION_A}`, undefined],
      ["' or 1=1 --", undefined],
      ['option-of-another-product', 'prod-1'],
      ['', 'prod-1'],
      ['', ''],
      [OPTION_A, ''],
    ];

    for (const [selectedOptions, productID] of previouslyRejected) {
      expect(() => buildSkusBySelectedOptionsStatement(selectedOptions, productID)).not.toThrow();

      const statement = buildSkusBySelectedOptionsStatement(selectedOptions, productID);

      // The invariant that holds for every one of them: one bind per placeholder.
      expect(statement.params).toHaveLength(placeholderCount(statement.sql));
    }
  });
});

describe('buildSkusBySelectedOptionsStatement - the protocol placeholder ceiling', () => {
  // The two cases that matter are therefore: at the ceiling is accepted, and one PAST it is
  // refused - on the COUNT alone, with no element altered.

  /**
   * A list of `count` single-character elements.
   *
   * Deliberately not `listOfWellFormedIDs`, whose 32-character identifiers would make a
   * ceiling-sized list two megabytes of test input for no gain: what is under test is the ELEMENT
   * COUNT.
   */
  function listOfCountedElements(count: number): string {
    return new Array<string>(count).fill('x').join(',');
  }

  it('accepts a list EXACTLY at the ceiling, because the server accepts one', () => {
    const atCeiling = buildSkusBySelectedOptionsStatement(
      listOfCountedElements(MAX_PLACEHOLDER_COUNT),
    );

    expect(atCeiling.params).toHaveLength(MAX_PLACEHOLDER_COUNT);
    expect(occurrences(atCeiling.sql, EXPECTED_OPTION_EXISTS)).toBe(MAX_PLACEHOLDER_COUNT);
  });

  it('refuses ONE PAST the ceiling, naming the count and never the list', () => {
    const oneTooMany = listOfCountedElements(MAX_PLACEHOLDER_COUNT + 1);

    expect(() => buildSkusBySelectedOptionsStatement(oneTooMany)).toThrow(
      /cannot prepare more than 65535/,
    );

    // The refusal reproduces no element of the submitted list: an error raised on the request path
    // can reach the shared error mapper and from there a log stream.
    try {
      buildSkusBySelectedOptionsStatement(oneTooMany);
      expect.unreachable('the builder accepted a statement the server cannot prepare');
    } catch (thrown: unknown) {
      expect(thrown).toBeInstanceOf(Error);
      const { name, message } = thrown as Error;
      expect(name).toBe('SkusBySelectedOptionsPlaceholderCountError');
      expect(message).toContain(String(MAX_PLACEHOLDER_COUNT + 1));
      expect(message).not.toContain('x,x');
    }
  });

  it("counts the optional productID bind, because the ceiling is the STATEMENT's", () => {
    // A list exactly at the ceiling plus a `productID` is one placeholder too many. Testing the
    // list in isolation would have missed it.
    const atCeiling = listOfCountedElements(MAX_PLACEHOLDER_COUNT);

    expect(() => buildSkusBySelectedOptionsStatement(atCeiling, 'product-1')).toThrow(
      /SkusBySelectedOptionsPlaceholderCountError|cannot prepare more than 65535/,
    );

    // And one BELOW the ceiling plus the product bind lands exactly on it, so it is accepted.
    const justUnder = buildSkusBySelectedOptionsStatement(
      listOfCountedElements(MAX_PLACEHOLDER_COUNT - 1),
      'product-1',
    );

    expect(justUnder.params).toHaveLength(MAX_PLACEHOLDER_COUNT);
  });

  it('LEAVES THE 64- AND 200-ELEMENT TOTALITY CASES UNTOUCHED, which is the point', () => {
    // Restated here as a guard rather than duplicated coverage: the ceiling is nine hundred times
    // the largest list any other case uses, so a policy cap could not hide behind it.
    expect(buildSkusBySelectedOptionsStatement(listOfCountedElements(64)).params).toHaveLength(64);
    expect(buildSkusBySelectedOptionsStatement(listOfCountedElements(200)).params).toHaveLength(
      200,
    );
  });
});
