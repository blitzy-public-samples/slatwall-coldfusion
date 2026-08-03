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
//   The suite has two halves and they guard the same thing from two directions.
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
//   ★ THE TOTALITY HALF ASSERTS THAT THE BUILDER NEVER THROWS, AND AN EARLIER
//   REVISION OF THIS FILE ASSERTED THE OPPOSITE.
//
//   That revision imported a `SELECTED_OPTIONS_INPUT_CONTRACT` from the module
//   under test and pinned a list of rejections: a list past a count bound, a list
//   past a serialized-length bound, an option ID wider than the `SwOption` key
//   column, an untrimmed element, an element carrying a character with meaning in
//   SQL. The bounds and the rejections are gone, and the cases that pinned them
//   have been INVERTED rather than deleted - every input that was rejected is now
//   asserted to be ACCEPTED and to emit the statement the legacy emitted for it.
//   Deleting them would have left the restored behaviour unpinned; inverting them
//   makes a re-introduction of any single guard fail a named case.
//
//   The authority is the module's own authoring contract, which grants the folder
//   "zero deliberate divergences", forbids adding "a null guard" or "a
//   `len()`/`trim()` check", and forbids throwing on the degenerate empty-list
//   case. [model/dao/SkuDAO.cfc:L106-L128] validates NOTHING. Every input the
//   removed checks refused, the legacy accepted, bound, and answered with an
//   EMPTY RESULT SET - because an over-long identifier cannot name a row in
//   `SwOption`, a repeated identifier is one option asked for twice, an untrimmed
//   `' b'` matches nothing, and an option belonging to another product cannot
//   satisfy the product conjunct. "No SKU matches" is an answer. The earlier
//   revision turned each of them into a request failure.
//
//   Both halves meet at the EMPTY LIST, which is legal and must stay legal.
//   `listLen('')` is 0, so the loop runs zero times and the statement degenerates
//   to the seed alone. That is what the legacy does, and a guard that rejected it
//   - or that short-circuited it to an empty result - would be a divergence
//   dressed up as a safety check. Several cases below exist only to hold that
//   line.
//
//   One property that removal did NOT touch, stated here so no reader has to
//   infer it: EVERY option ID and the `productID` still travel as positional `?`
//   binds, and the only interpolations in the emitted text are structural - a
//   repeated EXISTS group and fixed alias names. The injection-safety guarantee
//   that `cfqueryparam` provided is therefore structural and never depended on any
//   bound that was removed; there was no concatenation of caller input for a
//   length or shape check to guard. The cases that assert a value is bound rather
//   than interpolated are what hold that line, and they are unchanged.
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

import { buildSkusBySelectedOptionsStatement } from '../../../src/repositories/mysql/sql/skusBySelectedOptions.sql.js';

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
 * The declared width of the `SwOption` key column, restated for readability.
 *
 * It is NOT a bound the builder enforces - the builder enforces nothing - and it
 * is not imported from the module under test, because the module publishes no
 * such value any more. It appears here only so the cases that build well-formed
 * identifiers can say why 32 is the width they pad to:
 * [model/entity/Option.cfc:L52] declares `length="32"`.
 */
const OPTION_ID_COLUMN_WIDTH = 32;

/**
 * A list length large enough to stand in for "unbounded", used by the case that
 * pins the ABSENCE of a count bound.
 *
 * The legacy loop appends another EXISTS clause and another placeholder for every
 * element and imposes no upper bound of any kind [model/dao/SkuDAO.cfc:L113-L120].
 * An earlier revision of this file capped the count at 64 and asserted a
 * `RangeError` past it; the cap is gone, so this number now demonstrates the
 * opposite property and its exact value carries no meaning beyond being well past
 * any bound a reader might suspect survives.
 */
const UNBOUNDED_LIST_LENGTH = 200;

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
    ids.push(`opt${String(index).padStart(OPTION_ID_COLUMN_WIDTH - 3, '0')}`);
  }

  return ids.join(',');
}

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
    // 64 is an arbitrary sweep ceiling, not a bound: an earlier revision capped the
    // count here and the cap is gone. The case below named for UNBOUNDED_LIST_LENGTH
    // is what proves no ceiling survives.
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
    // CFML parity [model/dao/SkuDAO.cfc:L122-L126]: the legacy guard is
    // structKeyExists() with no len()/trim() test, so an empty string appends
    // the clause and binds '', yielding zero rows. Do not add a length guard,
    // and do not let the input contract reach productID.
    const statement = buildSkusBySelectedOptionsStatement(OPTION_A, '');

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE);
    expect(statement.params).toEqual([OPTION_A, '']);
    expect(placeholderCount(statement.sql)).toBe(2);
  });

  it('does not shape-check productID, because it multiplies nothing', () => {
    // A malformed productID appends exactly one clause and one bind value, the
    // same as a well-formed one, so bounding it would buy nothing and would
    // reject the empty string the guard above deliberately accepts.
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
    ).sql.toLowerCase();

    expect(lowered).not.toContain('order by');
    expect(lowered).not.toContain('limit');
    expect(lowered).not.toContain('coalesce');
    expect(lowered).not.toContain('ifnull');
    expect(lowered).not.toContain('use index');
    expect(lowered).not.toContain('force index');
  });
});

// ---------------------------------------------------------------------------
// ★ THE INPUTS AN EARLIER REVISION REJECTED, EACH NOW PINNED AS ACCEPTED
// ---------------------------------------------------------------------------
// Every case in this block was written the other way round. It asserted a
// `RangeError` or a `TypeError`; it now asserts the statement the legacy emits.
// The cases were INVERTED rather than deleted so that re-introducing any single
// guard fails a case that names it, and so that the reason each input is harmless
// is recorded next to the input rather than in a commit message.
//
// The shared reason, stated once: an input that cannot match is not an input that
// cannot be asked. [model/dao/SkuDAO.cfc:L106-L128] binds whatever it is handed
// and lets the database answer, and for all of these the answer is ZERO ROWS. A
// 33-character identifier cannot name a row in `SwOption`, whose key column is
// declared `length="32"` [model/entity/Option.cfc:L52]. An untrimmed `' b'`
// matches no identifier. A repeated identifier is one option asked for twice, and
// `A and A` is `A`. An identifier belonging to another product cannot satisfy the
// product conjunct. None of them is a request failure, and the legacy never
// treated them as one.
// ---------------------------------------------------------------------------

describe('buildSkusBySelectedOptionsStatement - totality: it never throws', () => {
  it('accepts the widest list an earlier revision called the widest admissible', () => {
    const widest = listOfWellFormedIDs(64);

    expect(widest).toHaveLength(2111);

    const statement = buildSkusBySelectedOptionsStatement(widest);

    expect(statement.params).toHaveLength(64);
    expect(placeholderCount(statement.sql)).toBe(64);
  });

  it('CARRIES NO COUNT BOUND: one option past the old cap still emits and binds', () => {
    // The old cap was 64 and this is 65. The clause count and the bind count are
    // the assertions that matter: a surviving cap could not produce either.
    const pastTheOldCap = listOfWellFormedIDs(65);
    const statement = buildSkusBySelectedOptionsStatement(pastTheOldCap);

    expect(statement.params).toHaveLength(65);
    expect(placeholderCount(statement.sql)).toBe(65);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(65);
  });

  it('CARRIES NO COUNT BOUND at a length no reader would mistake for admissible', () => {
    // The legacy loop appends one clause per element and imposes no upper bound
    // of any kind [model/dao/SkuDAO.cfc:L113-L120]. That an unbounded conjunction
    // is expensive is true and is not this module's business: it is a request
    // boundary's, and no such boundary is in scope for this folder.
    const statement = buildSkusBySelectedOptionsStatement(
      listOfWellFormedIDs(UNBOUNDED_LIST_LENGTH),
    );

    expect(statement.params).toHaveLength(UNBOUNDED_LIST_LENGTH);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(UNBOUNDED_LIST_LENGTH);
  });

  it('CARRIES NO SERIALIZED-LENGTH BOUND: a list past the old 4096 still emits', () => {
    const overlong = 'a'.repeat(4097);
    const statement = buildSkusBySelectedOptionsStatement(overlong);

    // One element, because the string holds no delimiter: `listLen` sees a single
    // 4097-character identifier. It names no row, so the statement returns none.
    expect(statement.params).toEqual([overlong]);
    expect(placeholderCount(statement.sql)).toBe(1);
    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS);
  });

  it('CARRIES NO COLUMN-WIDTH BOUND: a 33-character option ID is bound, not refused', () => {
    // [model/entity/Option.cfc:L52] declares length="32", so a 33-character ID
    // cannot exist in SwOption - which is exactly why binding it is safe. The
    // EXISTS subquery finds nothing and the statement returns an empty set. The
    // legacy answer for this input was an empty array; so is this one.
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
    // Position mattered to the old check only because it walked the list to find
    // the first offender. Nothing walks the list now except the emit loop, so all
    // three of these bind every element in list order.
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
    // ★ THIS IS THE CASE THAT REPLACES THE OLD INJECTION-SHAPED ONE, AND IT PROVES
    // MORE THAN THE OLD ONE DID. The old case asserted a TypeError, which
    // demonstrated only that a check existed. These assert the two properties that
    // actually make the statement safe: the value NEVER APPEARS IN THE TEXT, and
    // the placeholder count stays 1. Safety here is structural - the value travels
    // as a positional bind, so there is no concatenation for a shape check to
    // guard - and structural safety is what these assertions pin.
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
    // CFML `listGetAt` returns the element untrimmed, so 'a, b' yields 'a' and
    // ' b'. Trimming would repair the caller's input and refusing would fail the
    // request; the legacy did neither, and the authoring contract forbids adding
    // "a `len()`/`trim()` check". ' b' names no option, so the answer is zero rows.
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A}, ${OPTION_B}`);

    expect(statement.params).toEqual([OPTION_A, ` ${OPTION_B}`]);
    expect(occurrences(statement.sql, EXPECTED_OPTION_EXISTS)).toBe(2);
  });

  it('BINDS A REPEATED OPTION TWICE rather than refusing the duplicate', () => {
    // `A and A` is `A`, so the duplicate is redundant and harmless: the legacy
    // emitted two identical EXISTS clauses and matched the same SKUs as one. An
    // earlier revision refused the input outright.
    const statement = buildSkusBySelectedOptionsStatement(`${OPTION_A},${OPTION_A}`);

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_OPTION_EXISTS);
    expect(statement.params).toEqual([OPTION_A, OPTION_A]);
  });

  it('BINDS AN OPTION FOREIGN TO THE NARROWED PRODUCT rather than refusing it', () => {
    // ★ THE CASE THE REMOVED PREREQUISITE QUERY EXISTED TO SERVE. An earlier
    // revision read the product's own option identifiers first and refused any
    // selection containing one that did not belong to it. The conjunction already
    // decides this: a SKU must satisfy both the EXISTS for the foreign option and
    // `sku.productID = ?`, and no SKU can. The extra statement changed no result
    // set - it only turned an empty one into an exception.
    const statement = buildSkusBySelectedOptionsStatement('option-of-another-product', 'prod-1');

    expect(statement.sql).toBe(EXPECTED_SEED + EXPECTED_OPTION_EXISTS + EXPECTED_PRODUCT_PREDICATE);
    expect(statement.params).toEqual(['option-of-another-product', 'prod-1']);
  });

  it('IS TOTAL over every input the removed guards named, in one sweep', () => {
    // A single case that fails if ANY guard returns, whatever form it takes.
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
