// ---------------------------------------------------------------------------
// slatwall-ts - repository suite for the AND-of-EXISTS selected-options statement
//
// WHAT THIS PINS
//   src/repositories/mysql/sql/skusBySelectedOptions.sql.ts - the extracted SQL
//   behind `ProductService.getProductSkusBySelectedOptions()`, one of the three
//   named must-preserve behaviours of the TypeScript / AWS Lambda `nodejs20.x`
//   port of the Slatwall 3.1.39 catalog + promotions/pricing slice
//   (`version.txt` = `3.1.39`).
//
//   Legacy source: [model/dao/SkuDAO.cfc:L106-L128]. That span assembles HQL by
//   string concatenation - a seed, then one correlated EXISTS per element of a
//   comma-delimited list, then an optional product conjunct - and binds one
//   positional parameter per appended clause. Every locator cited below was
//   opened in the legacy tree and matched byte-for-byte.
//
//   The suite has two halves and they guard opposite things.
//
//   THE PARITY HALF asserts the emitted text and the bind order character for
//   character. That granularity is deliberate: the seed literal ends in a SPACE
//   and every appended fragment BEGINS with `and`, so the trailing space is the
//   token separator rather than decoration, and an editor or formatter that
//   trimmed it would produce `0 = 0and exists (` - a syntax error that no
//   shape-level assertion would catch. The same half pins the three properties
//   that read like bugs and are not: the `0 = 0` accumulator seed, the `opt` join
//   that is declared and never referenced, and the absence of any cardinality
//   test.
//
//   THE CONTRACT HALF asserts that an argument outside
//   `SELECTED_OPTIONS_INPUT_CONTRACT` is rejected. `selectedOptions` is the one
//   argument whose value is a multiplier: the legacy loop appends another EXISTS
//   clause and another placeholder for every element and imposes no upper bound
//   of any kind [model/dao/SkuDAO.cfc:L113-L120]. Under a CFML request measured
//   in minutes that was merely slow; behind an HTTP entrypoint the admissible
//   input has to be stated, and these cases are what hold the statement to it.
//
//   The two halves meet at one place worth naming: the EMPTY LIST is legal and
//   must stay legal. `listLen('')` is 0, so the loop runs zero times and the
//   statement degenerates to the seed alone. That is what the legacy does, and a
//   contract that rejected it - or that short-circuited it to an empty result -
//   would be a divergence dressed up as a safety check. Several cases below exist
//   only to hold that line.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE
// PRESENTED AS PARITY.
// ---------------------------------------------------------------------------
//   No legacy test under meta/tests/** exercises this query, this DAO, or any
//   DAO in the in-scope slice: meta/tests/unit/dao/ contains only AccountDAOTest
//   and PaymentDAOTest, neither of which is in scope.
//
//   The only legacy suites extended anywhere in this port are
//   [meta/tests/unit/entity/BrandTest.cfc] and
//   [meta/tests/unit/entity/ProductTest.cfc], both owned by
//   tests/unit/domain/entities/, and
//   [meta/tests/functional/admin/entity/ProductTest.cfc] is an empty stub
//   contributing zero coverage. No case in this file has a legacy antecedent and
//   none is dressed up as one. The `issue_<ticket#>` regression convention taken
//   from [meta/tests/unit/IssuesTest.cfc:L51] appears nowhere below, because no
//   ticket governs this statement.
//
// WHY THIS SITS UNDER tests/integration/repositories/ AND NEEDS NO DATABASE
//   The tier reflects the layer under test, not the presence of a server. The
//   subject is a pure function of its arguments - it opens no connection, reads
//   no configuration and holds no state - which is precisely what lets the
//   repository tier assert emitted SQL text and bound-parameter arrays with
//   nothing running. `liveDatabaseTestsEnabled` from tests/setup.ts is therefore
//   not consulted: there is no live path here to gate.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import {
  SELECTED_OPTIONS_INPUT_CONTRACT,
  buildSkusBySelectedOptionsStatement,
} from '../../../src/repositories/mysql/sql/skusBySelectedOptions.sql.js';

/**
 * The seed fragment, restated here independently of the module under test.
 *
 * Restating it rather than importing it is the point: the module's fragments are
 * not exported, and a suite that reassembled its expectations FROM the subject
 * would pass no matter what the subject emitted. These literals are transcribed
 * from [model/dao/SkuDAO.cfc:L109-L112] with the entity names translated to the
 * physical `Sw*` tables, and the trailing space on every line is intentional.
 */
const EXPECTED_SEED =
  'select distinct sku.* from SwSku as sku \n' +
  '\t\t\t\t\tinner join SwSkuOption as opt on opt.skuID = sku.skuID \n' +
  '\t\t\t\t\twhere \n' +
  '\t\t\t\t\t0 = 0 ';

/** One correlated EXISTS, transcribed from [model/dao/SkuDAO.cfc:L115-L119]. */
const EXPECTED_OPTION_EXISTS =
  'and exists (\n' +
  '\t\t\t\t\t\tselect * from SwOption o\n' +
  '\t\t\t\t\t\tjoin SwSkuOption s on s.optionID = o.optionID where s.skuID = sku.skuID\n' +
  '\t\t\t\t\t\tand o.optionID = ?\n' +
  '\t\t\t\t\t) ';

/** The closing conjunct, transcribed from [model/dao/SkuDAO.cfc:L124]. */
const EXPECTED_PRODUCT_PREDICATE = 'and sku.productID = ?';

/** A well-formed option ID: 32 lowercase hex characters, as the generator emits. */
const OPTION_A = '4f2a91c8b73e40d6ae15c92fb8074d3a';

/** A second well-formed option ID, distinct from the first. */
const OPTION_B = 'c81d05e4fa6b47289d3e6170ba52cf9e';

/** A third well-formed option ID, distinct from the first two. */
const OPTION_C = '9b6e37f0d24c418aa5710e83c6fd92b1';

/**
 * The product's own option identifiers, passed whenever `productID` is.
 *
 * The builder validates the selected options against the product's real options
 * and FAILS CLOSED when a `productID` arrives without them - a deliberate
 * precondition, documented on `assertSelectedOptionsAreBindable`, so that a
 * product narrowing can never silently skip the membership check. Supplying the
 * scope keeps every case below a parity case: for admissible input the emitted
 * SQL and the bind order are unchanged, which is what these assertions pin.
 */
const PRODUCT_OPTION_SCOPE: readonly string[] = [OPTION_A, OPTION_B, OPTION_C];

/** Count the positional placeholders in a statement. */
function placeholderCount(sql: string): number {
  return sql.split('?').length - 1;
}

/** Count non-overlapping occurrences of a fragment in a statement. */
function occurrences(sql: string, fragment: string): number {
  return sql.split(fragment).length - 1;
}

/**
 * Build a comma-delimited list of `count` distinct well-formed option IDs.
 *
 * Each ID is padded to the full 32-character column width, so the list this
 * returns is the widest a well-formed list of that length can be.
 */
function listOfWellFormedIDs(count: number): string {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    ids.push(`opt${String(index).padStart(29, '0')}`);
  }

  return ids.join(',');
}

describe('SELECTED_OPTIONS_INPUT_CONTRACT', () => {
  it('publishes the bounds so a request boundary can reject before this builder runs', () => {
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.maxSerializedLength).toBe(4096);
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount).toBe(64);
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionIDLength).toBe(32);
  });

  it('is frozen, so no caller can widen the bounds it enforces', () => {
    expect(Object.isFrozen(SELECTED_OPTIONS_INPUT_CONTRACT)).toBe(true);
  });

  it('bounds the serialized length above the widest well-formed list it admits', () => {
    // 64 IDs of 32 characters plus 63 delimiters is 2111 characters, so the
    // length bound cannot be the binding constraint on a well-formed list.
    const widest =
      SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount *
        SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionIDLength +
      (SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount - 1);

    expect(widest).toBe(2111);
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.maxSerializedLength).toBeGreaterThan(widest);
  });

  it('admits the 32 lowercase hex characters the legacy generator emits', () => {
    // [org/Hibachi/HibachiObject.cfc:L144-L146]:
    //   return replace(lcase(createUUID()), '-', '', 'all');
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.test(OPTION_A)).toBe(true);
    expect(OPTION_A).toHaveLength(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionIDLength);
  });

  it('carries neither the global nor the sticky flag, so test() is stateless', () => {
    // A shared RegExp instance with `g` or `y` would advance `lastIndex` between
    // calls and start returning false for inputs it had already accepted.
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.global).toBe(false);
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.sticky).toBe(false);

    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.test(OPTION_A)).toBe(true);
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.test(OPTION_A)).toBe(true);
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.test(OPTION_A)).toBe(true);
  });

  it('excludes the comma, which is the list delimiter itself', () => {
    expect(SELECTED_OPTIONS_INPUT_CONTRACT.optionIDPattern.test('a,b')).toBe(false);
  });
});

describe('buildSkusBySelectedOptionsStatement - the empty list', () => {
  it('emits the seed alone and binds nothing [model/dao/SkuDAO.cfc:L113]', () => {
    // `listLen('')` is 0, so the loop body never runs. No early return, no
    // throw, no forced-empty result set: the legacy has none, so neither does
    // this. The statement degenerates to "every SKU that has at least one
    // option", courtesy of the inner join in the seed.
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
    const statement = buildSkusBySelectedOptionsStatement('', 'prod-1', PRODUCT_OPTION_SCOPE);

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
    // The seed ends `0 = 0 ` and the fragment begins `and`, so the two land on
    // the same line. Losing that space yields `0 = 0and exists (`.
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
    // The contract is "at least these options", never "exactly these options".
    // A HAVING COUNT / GROUP BY / INTERSECT formulation would change that.
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
    for (let count = 0; count <= SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount; count += 1) {
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
    const statement = buildSkusBySelectedOptionsStatement(
      `${OPTION_A},${OPTION_B}`,
      'prod-9',
      PRODUCT_OPTION_SCOPE,
    );

    expect(statement.sql).toBe(
      EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE,
    );
    expect(statement.params).toEqual([OPTION_A, OPTION_B, 'prod-9']);
    expect(statement.sql.endsWith(EXPECTED_PRODUCT_PREDICATE)).toBe(true);
  });

  it('fires on PRESENCE, not truthiness: an empty productID still appends and binds', () => {
    // CFML parity [model/dao/SkuDAO.cfc:L122-L126]: the legacy guard is
    // structKeyExists() with no len()/trim() test, so an empty string appends
    // the clause and binds '', yielding zero rows. Do not add a length guard,
    // and do not let the input contract reach productID.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A, '', PRODUCT_OPTION_SCOPE);

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE);
    expect(statement.params).toEqual([OPTION_A, '']);
    expect(placeholderCount(statement.sql)).toBe(2);
  });

  it('does not shape-check productID, because it multiplies nothing', () => {
    // A malformed productID appends exactly one clause and one bind value, the
    // same as a well-formed one, so bounding it would buy nothing and would
    // reject the empty string the guard above deliberately accepts.
    expect(() =>
      buildSkusBySelectedOptionsStatement(
        OPTION_A,
        'not a well formed id at all, with a comma',
        PRODUCT_OPTION_SCOPE,
      ),
    ).not.toThrow();
  });
});

describe('buildSkusBySelectedOptionsStatement - the returned value', () => {
  it('freezes the statement, because a statement is a value', () => {
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(Object.isFrozen(statement)).toBe(true);
  });

  it('freezes the bind array too, so a statement cannot be reordered after the fact', () => {
    // Deliberately the OPPOSITE of what this module documented when the case was
    // first written. The bind array is positional: element i answers placeholder
    // i, so a caller that reorders it after construction silently rebinds the
    // statement. `connection.ts` accepts `readonly unknown[]` and materializes
    // its own `SqlParameter[]` in `toBoundParameters`, so nothing downstream
    // needs the array to be mutable and no adapter is forced into a cast.
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
    // The join excludes SKUs with zero options and is what makes DISTINCT
    // necessary. Removing either changes results.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A);

    expect(statement.sql).toContain('inner join SwSkuOption as opt on opt.skuID = sku.skuID');
    expect(occurrences(statement.sql, 'distinct')).toBe(1);
    expect(statement.sql.startsWith('select distinct sku.* from SwSku as sku ')).toBe(true);
  });

  it('adds no ORDER BY, LIMIT, COALESCE, IFNULL or index hint', () => {
    const lowered = buildSkusBySelectedOptionsStatement(
      `${OPTION_A},${OPTION_B}`,
      'prod-1',
      PRODUCT_OPTION_SCOPE,
    ).sql.toLowerCase();

    expect(lowered).not.toContain('order by');
    expect(lowered).not.toContain('limit');
    expect(lowered).not.toContain('coalesce');
    expect(lowered).not.toContain('ifnull');
    expect(lowered).not.toContain('use index');
    expect(lowered).not.toContain('force index');
  });
});

describe('buildSkusBySelectedOptionsStatement - contract rejection', () => {
  it('accepts the widest well-formed list: 64 IDs of the full column width', () => {
    const widest = listOfWellFormedIDs(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount);

    expect(widest).toHaveLength(2111);

    const statement = buildSkusBySelectedOptionsStatement(widest);

    expect(statement.params).toHaveLength(64);
    expect(placeholderCount(statement.sql)).toBe(64);
  });

  it('rejects one option beyond the count bound', () => {
    const tooMany = listOfWellFormedIDs(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount + 1);

    expect(() => buildSkusBySelectedOptionsStatement(tooMany)).toThrow(RangeError);
    expect(() => buildSkusBySelectedOptionsStatement(tooMany)).toThrow(
      /maximum admissible count of 64 option IDs/,
    );
  });

  it('rejects a list far beyond the count bound without emitting anything', () => {
    // The unbounded-expansion case the finding names: 5,000 elements would have
    // become 5,000 correlated subqueries and 5,000 placeholders.
    const absurd = listOfWellFormedIDs(5000);

    expect(() => buildSkusBySelectedOptionsStatement(absurd)).toThrow(RangeError);
  });

  it('rejects a list beyond the serialized-length bound BEFORE parsing it', () => {
    // Length is the one check makeable without walking the list, so it is the
    // check that bounds the walk. It therefore has to fire first: this input
    // would also fail the shape check, and the message proves which one ran.
    const overlong = 'a'.repeat(SELECTED_OPTIONS_INPUT_CONTRACT.maxSerializedLength + 1);

    expect(() => buildSkusBySelectedOptionsStatement(overlong)).toThrow(RangeError);
    expect(() => buildSkusBySelectedOptionsStatement(overlong)).toThrow(
      /maximum admissible length of 4096 characters/,
    );
  });

  it('accepts a list exactly at the serialized-length bound', () => {
    // 128 characters short of the bound is 4096 exactly: 124 IDs would exceed
    // the count bound, so the boundary case is built from the count bound and
    // padded with ignored delimiters, which CFML list semantics tolerate.
    const padded = `${listOfWellFormedIDs(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionCount)}${','.repeat(
      SELECTED_OPTIONS_INPUT_CONTRACT.maxSerializedLength - 2111,
    )}`;

    expect(padded).toHaveLength(SELECTED_OPTIONS_INPUT_CONTRACT.maxSerializedLength);
    expect(() => buildSkusBySelectedOptionsStatement(padded)).not.toThrow();
  });

  it('rejects an option ID wider than the declared SwOption key column', () => {
    // [model/entity/Option.cfc:L52] declares length="32", so a 33-character ID
    // cannot exist in SwOption.
    const tooWide = 'a'.repeat(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionIDLength + 1);

    expect(() => buildSkusBySelectedOptionsStatement(tooWide)).toThrow(TypeError);
    expect(() => buildSkusBySelectedOptionsStatement(tooWide)).toThrow(
      /expected 1 to 32 characters from \[A-Za-z0-9_-\]/,
    );
  });

  it('accepts an option ID exactly at the declared column width', () => {
    const exact = 'a'.repeat(SELECTED_OPTIONS_INPUT_CONTRACT.maxOptionIDLength);

    expect(() => buildSkusBySelectedOptionsStatement(exact)).not.toThrow();
  });

  it('rejects a malformed element wherever it sits in the list', () => {
    expect(() => buildSkusBySelectedOptionsStatement(`bad id,${OPTION_A}`)).toThrow(TypeError);
    expect(() => buildSkusBySelectedOptionsStatement(`${OPTION_A},bad id`)).toThrow(TypeError);
    expect(() => buildSkusBySelectedOptionsStatement(`${OPTION_A},bad id,${OPTION_B}`)).toThrow(
      TypeError,
    );
  });

  it('rejects characters that carry meaning in the surrounding SQL text', () => {
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
    ]) {
      expect(() => buildSkusBySelectedOptionsStatement(malformed)).toThrow(TypeError);
    }
  });

  it('does not silently trim: " b" is rejected rather than repaired to "b"', () => {
    // CFML `listGetAt` returns the element untrimmed, so 'a, b' yields 'a' and
    // ' b'. Trimming would repair the caller's input, and this folder is granted
    // no repairs.
    expect(() => buildSkusBySelectedOptionsStatement(`${OPTION_A}, ${OPTION_B}`)).toThrow(
      TypeError,
    );
  });

  it('never echoes the rejected value in the message it raises', () => {
    // A rejection must not carry request content into whatever records it.
    const planted = 'PLANTED-SECRET-9c41ab27de';

    expect(() => buildSkusBySelectedOptionsStatement(`${planted}!`)).toThrow(TypeError);

    try {
      buildSkusBySelectedOptionsStatement(`${planted}!`);
      expect.unreachable('the malformed element should have been rejected');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(TypeError);
      expect((thrown as TypeError).message).not.toContain(planted);
      expect((thrown as TypeError).message).toContain('not a well-formed option ID');
    }
  });
});
