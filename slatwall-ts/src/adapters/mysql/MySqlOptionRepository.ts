/*
 * MySqlOptionRepository — the MySQL adapter for the Catalog's two option queries
 * port of `model/dao/OptionDAO.cfc`. That component's whole body is two members —
 * `getUnusedProductOptions` [`:L51-L92`] and `getUnusedProductOptionGroups` [`:L94-L117`] — and AAP
 * §0.4.1.7 gives this file one instruction for them: "Both not EXISTS queries translated; the dynamic
 * not in list built from validated identifiers rather than interpolated". AAP §0.4.2.6 fixes the two
 * target names, `findUnusedOptions` and `findUnusedOptionGroups`, and
 * `../../ports/repositories/OptionRepository.ts` declares the contract this class implements.
 *
 * The legacy component is reference-only: it is never edited, moved, renamed or deleted (TR-6).
 *
 * Why a DAO is ported at all. Both members of `model/service/OptionService.cfc` are one-line
 * pass-throughs [`:L73`, `:L77`], so every behaviour worth preserving — the composed drop-down label,
 * the set polarity, the row ordering, the parameter binding order — is expressed in the DAO. AAP
 * §0.2.1.3 adds all four catalog DAOs as implicit scope for exactly this reason.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L82-L84` and `:L108-L109` — the absence of a `sortOrder` clause is not a licence to retouch
 * the two orderings that do exist. Both existing statements order by name: the first by the group's
 * name then the option's name, the second by the group's name alone. Neither mentions `sortOrder`,
 * and both sequences reach a rendered drop-down directly, so they are observable output and are
 * carried exactly as written.
 */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import {
  assertColumnName,
  assertStatementComplexityWithinBudget,
  assertTableName,
} from './QueryRunner';
import { mapRows, mapUnusedOptionGroupRow, mapUnusedOptionRow } from './rowMappers';

import type { SqlExecutor, StatementComplexityBudget } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../ports/repositories/OptionRepository';

/*
 * Validated identifiers
 * Every table and column token this file can place into statement text is resolved here, once, when
 * the module is evaluated. Three properties follow, and all three are the reason it is done here
 * rather than inline:
 *
 * * A name that is not part of the extracted schema is refused at cold start rather than on the
 * first request that happens to reach the statement.
 * * The resolvers return canonical spellings, so the statement text below cannot drift from the
 * column set the entity declarations define.
 * * The values are immutable strings. They are identifiers, not a cache: nothing a caller supplies
 * is ever stored in module scope, so there is nothing here to bleed across warm invocations (M7,
 * and see the module header).
 */

/** `model/entity/Option.cfc:L49` — `table="SwOption"`. */
const OPTION_TABLE = assertTableName('SwOption');

/** `model/entity/OptionGroup.cfc:L49` — `table="SwOptionGroup"`. */
const OPTION_GROUP_TABLE = assertTableName('SwOptionGroup');

/**
 * The SKU-to-option link table, named directly in the non-existence guard at
 * `model/dao/OptionDAO.cfc:L74`.
 */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** `model/entity/Sku.cfc:L49` — `table="SwSku"`, joined at `model/dao/OptionDAO.cfc:L76`. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwOption.optionID` — projected at `model/dao/OptionDAO.cfc:L60`, correlated at `:L80`. */
const OPTION_ID_COLUMN = assertColumnName(OPTION_TABLE, 'optionID');

/** `SwOption.optionName` — projected at `model/dao/OptionDAO.cfc:L61`, sorted at `:L84`. */
const OPTION_NAME_COLUMN = assertColumnName(OPTION_TABLE, 'optionName');

/**
 * `SwOption.optionGroupID` — the child side of the required many-to-one at
 * `model/entity/Option.cfc:L59`, joined at `model/dao/OptionDAO.cfc:L66` and filtered at `:L68`.
 */
const OPTION_GROUP_ID_ON_OPTION_COLUMN = assertColumnName(OPTION_TABLE, 'optionGroupID');

/** `SwOptionGroup.optionGroupID` — the parent side of that same relationship. */
const OPTION_GROUP_ID_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupName` — projected by both statements, at
 * `model/dao/OptionDAO.cfc:L62` and `:L103`, and the sort term of both, at `:L83` and `:L109`.
 */
const OPTION_GROUP_NAME_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupName');

/** `SwSkuOption.optionID` — the link column correlated back to the outer row at `:L80`. */
const SKU_OPTION_OPTION_ID_COLUMN = assertColumnName(SKU_OPTION_TABLE, 'optionID');

/** `SwSkuOption.skuID` — the link column joined to the SKU table at `:L76`. */
const SKU_OPTION_SKU_ID_COLUMN = assertColumnName(SKU_OPTION_TABLE, 'skuID');

/** `SwSku.skuID` — the join target at `model/dao/OptionDAO.cfc:L76`. */
const SKU_SKU_ID_COLUMN = assertColumnName(SKU_TABLE, 'skuID');

/** `SwSku.productID` — the bound predicate inside the non-existence guard, at `:L78`. */
const SKU_PRODUCT_ID_COLUMN = assertColumnName(SKU_TABLE, 'productID');

/** The alias the legacy gives the link table inside the non-existence guard [`:L74`]. */
const SKU_OPTION_TABLE_ALIAS = 'a';

/** The alias the legacy gives the SKU table inside the same guard [`:L76`]. */
const SKU_TABLE_ALIAS = 'b';

/* Literals that are observable behaviour. */

/**
 * The three-character separator that joins an option group's name to its option's name.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L88` — the label is composed in the data-access layer, which
 * is where the legacy composes it. It is tempting to treat a display label as presentation and move
 * it up to the service, or out to the caller. That would be wrong twice over: the service is a
 * one-line pass-through [`model/service/OptionService.cfc:L73`] that adds nothing, and AAP §0.4.2.4
 * requires the `"<group> - <option>"` format to be preserved as the projection contract the service
 * hands to its caller. It stays here, unchanged, untrimmed.
 */
const UNUSED_OPTION_LABEL_SEPARATOR = ' - ';

/** The delimiter used to split the comma-delimited option-group identifier list. */
const OPTION_GROUP_ID_LIST_DELIMITER = ',';

/** The bind marker for one value in a prepared statement. Never used for an identifier. */
const BIND_PLACEHOLDER = '?';

/** The text placed between consecutive bind markers inside a set-membership clause. */
const PLACEHOLDER_JOINER = ', ';

/* List and placeholder handling — where the easiest mistake in this file lives. */

/**
 * Splits the comma-delimited option-group identifier list into the values to bind.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L68` and `:L107` — the naive translation is the correct one,
 * and every "improvement" to it is a regression. This is the single most likely accidental failure in
 * this file, so the reasoning is recorded in full rather than summarised.
 *
 * @param existingOptionGroupIDList - the caller's comma-delimited list, possibly the empty string.
 * @returns one value to bind per token, in list order, unmodified.
 */
function splitOptionGroupIdList(existingOptionGroupIDList: string): string[] {
  return existingOptionGroupIDList.split(OPTION_GROUP_ID_LIST_DELIMITER);
}

/**
 * Builds the bind-marker text for a set-membership clause from the values that will be bound to it.
 *
 * @param values - the values that will be bound to this clause, in bind order.
 * @returns the marker text, for example `?` for one value and `?, ?, ?` for three.
 */
function toPlaceholderList(values: readonly string[]): string {
  return values.map(() => BIND_PLACEHOLDER).join(PLACEHOLDER_JOINER);
}

/*
 * Statement composition
 * Both statements are composed per call, because the number of bind markers in the set-membership
 * clause depends on the input. Nothing about a call is retained afterwards.
 */

/**
 * Composes the unused-product-options statement — the translation of
 * `model/dao/OptionDAO.cfc:L58-L85`.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L70-L81` — the guard stays a `NOT EXISTS`. Rewriting a
 * correlated non-existence test as an outer join with a null test is the textbook transformation, and
 * it is forbidden here by AAP §0.8.2 Guideline 4: the two forms are not obviously equivalent in the
 * presence of the inner `DISTINCT`, the outer form fans the result out and would then need its own
 * de-duplication, and neither difference would announce itself. The correlation
 * `a.optionID = SwOption.optionID` [`:L80`] also stays inside the sub-query, where the legacy puts it;
 * Lifting it into the outer predicate changes what the sub-query is correlated to.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L71-L72` — the inner projection is redundant and is kept
 * anyway. `SELECT DISTINCT a.optionID` inside a non-existence test computes a column list that is
 * never read, and the `DISTINCT` de-duplicates rows whose existence is all that is being tested.
 * Both are harmless, and both are reproduced: this is preserved source, not a defect, and trimming it
 * would make the generated text stop matching the legacy line for line for no behavioural gain.
 *
 * @param optionGroupIdPlaceholders - the bind-marker text for the set-membership clause, from
 * {@link toPlaceholderList}. never empty; see {@link splitOptionGroupIdList}.
 *
 * @returns the statement text, every value position a bind marker and every identifier validated.
 */
function composeUnusedOptionsStatement(optionGroupIdPlaceholders: string): string {
  return `SELECT
    ${OPTION_TABLE}.${OPTION_ID_COLUMN},
    ${OPTION_TABLE}.${OPTION_NAME_COLUMN},
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME_COLUMN}
  FROM
    ${OPTION_TABLE}
    INNER JOIN
    ${OPTION_GROUP_TABLE} on ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN} = ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION_COLUMN}
  WHERE
    ${OPTION_TABLE}.${OPTION_GROUP_ID_ON_OPTION_COLUMN} IN (${optionGroupIdPlaceholders})
    AND
    NOT EXISTS(
      SELECT DISTINCT
        ${SKU_OPTION_TABLE_ALIAS}.${SKU_OPTION_OPTION_ID_COLUMN}
      FROM
        ${SKU_OPTION_TABLE} ${SKU_OPTION_TABLE_ALIAS}
        INNER JOIN
        ${SKU_TABLE} ${SKU_TABLE_ALIAS} on ${SKU_OPTION_TABLE_ALIAS}.${SKU_OPTION_SKU_ID_COLUMN} = ${SKU_TABLE_ALIAS}.${SKU_SKU_ID_COLUMN}
      WHERE
        ${SKU_TABLE_ALIAS}.${SKU_PRODUCT_ID_COLUMN} = ${BIND_PLACEHOLDER}
        AND
        ${SKU_OPTION_TABLE_ALIAS}.${SKU_OPTION_OPTION_ID_COLUMN} = ${OPTION_TABLE}.${OPTION_ID_COLUMN}
    )
  ORDER BY
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME_COLUMN},
    ${OPTION_TABLE}.${OPTION_NAME_COLUMN}`;
}

/**
 * Composes the unused-product-option-groups statement — the translation of
 * `model/dao/OptionDAO.cfc:L100-L110`.
 *
 * @param optionGroupIdPlaceholders - the bind-marker text for the negated set-membership clause, from
 * {@link toPlaceholderList}. never empty; see {@link splitOptionGroupIdList}.
 *
 * @returns the statement text, every value position a bind marker and every identifier validated.
 */
function composeUnusedOptionGroupsStatement(optionGroupIdPlaceholders: string): string {
  return `SELECT
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN},
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME_COLUMN}
  FROM
    ${OPTION_GROUP_TABLE}
  WHERE
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN} NOT IN (${optionGroupIdPlaceholders})
  ORDER BY
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_NAME_COLUMN}`;
}

/* Row shaping. */

/**
 * Reads one projected text column, reproducing how a CFML query column read behaves.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L88` — the label is composed in typescript, not in SQL, and
 * that is a deliberate judgement call (AAP §0.8.2 Guideline 6). Concatenating the two names in the
 * statement instead would be shorter and would let the mapper read the label straight from the
 * projection — but MySQL's string concatenation yields NULL when any argument is NULL, whereas the
 * legacy interpolation yields a label built from empty strings. A NULL group name would then arrive as
 * a NULL label and be rejected downstream, where the legacy produced a visible, if oddly empty, entry.
 * Composing here reproduces the legacy outcome exactly across that difference.
 *
 * @param row - one raw row of a projection composed in this file.
 * @param columnName - a validated column name from the constants above.
 * @returns the column's text, or the empty string when the column is NULL.
 * @throws {DataIntegrityError} when the column is absent from the row.
 * @throws {DomainError} when the column holds a value that is not text.
 */
function readProjectedText(row: MySqlRow, columnName: string): string {
  const value = row[columnName];

  if (value === undefined) {
    throw new DataIntegrityError(
      `The option projection supplied no "${columnName}" column, so its drop-down label could not ` +
        'be assembled. The statement text and the row reader have drifted apart.',
      { context: { columnName } },
    );
  }

  if (value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new DomainError(
    `The "${columnName}" column of the option projection holds a value that is not text, so its ` +
      'drop-down label could not be assembled.',
    { context: { columnName, valueType: typeof value } },
  );
}

/**
 * Shapes one raw row of the unused-product-options projection into its port row.
 *
 * @param row - one raw row of the projection {@link composeUnusedOptionsStatement} defines.
 * @returns the port row, its label composed.
 * @throws {DataIntegrityError} when a column the label or the identifier needs is absent.
 * @throws {DomainError} when a column holds a value that is not text.
 */
function toUnusedOptionRow(row: MySqlRow): UnusedOptionRow {
  const optionGroupName = readProjectedText(row, OPTION_GROUP_NAME_COLUMN);
  const optionName = readProjectedText(row, OPTION_NAME_COLUMN);

  return mapUnusedOptionRow({
    ...row,
    name: `${optionGroupName}${UNUSED_OPTION_LABEL_SEPARATOR}${optionName}`,
  });
}

/* The adapter. */

/** The MySQL implementation of {@link optionRepository}. */
export class MySqlOptionRepository implements OptionRepository {
  /** The injected execution boundary. */
  private readonly executor: SqlExecutor;

  /** The operator-stated ceiling on how complex either composed statement may be. */
  private readonly statementComplexityBudget: StatementComplexityBudget;

  /**
   * @param executor - the statement executor, supplied by the composition root. It replaces the DI/1
   * property declared at `model/service/OptionService.cfc:L51` together with the accessor
   * fabricated for it, which resolved by name at run time (AAP §0.4.3.1 R1, AAP §0.4.3.2 R2). No
   * connection is built here and no connection setting is read here.
   *
   * @param statementComplexityBudget - the ceiling on query-complexity units one composed statement
   * may carry. Required rather than optional: BOTH members of this class compose a set-membership
   * clause whose marker count is the length of a caller-supplied list, so an instance that could be
   * built without the ceiling would be an instance that could serve both members unbounded.
   */
  public constructor(executor: SqlExecutor, statementComplexityBudget: StatementComplexityBudget) {
    this.executor = executor;
    this.statementComplexityBudget = statementComplexityBudget;
  }

  /**
   * Returns an equivalent {@link MySqlOptionRepository} bound to a different statement executor.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns a new instance identical in every other respect.
   */
  public withExecutor(executor: SqlExecutor): MySqlOptionRepository {
    /*
     * The budget travels across the re-binding for the reason the executor does not: it is a
     * deployment figure rather than a connection-bound one, and an instance re-bound to a
     * transaction's executor must apply the same ceiling the pooled instance applied. `strict` makes
     * that a compile-time guarantee — an omitted argument here would not type-check.
     */
    return new MySqlOptionRepository(executor, this.statementComplexityBudget);
  }

  /**
   * Lists the options a product may still be offered, as drop-down rows.
   *
   * TODO(parity) `model/dao/OptionDAO.cfc:L52-L53` versus `:L68` and `:L78` — bind order is statement
   * order, which is the reverse of this signature. This is the second most likely way to break this
   * file, and it is invisible to every static check available.
   *
   * @param productID - the product whose SKUs decide what already counts as used. Required, as at
   * `model/dao/OptionDAO.cfc:L52`.
   *
   * @param existingOptionGroupIDList - comma-delimited option-group identifiers already present on
   * that product. Required, as at `model/dao/OptionDAO.cfc:L53`.
   *
   * @returns the qualifying options, ordered by group name then option name. Possibly empty.
   * @throws {DataIntegrityError} when the projection and the row reader have drifted apart.
   */
  public async findUnusedOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<UnusedOptionRow[]> {
    const optionGroupIds = splitOptionGroupIdList(existingOptionGroupIDList);

    /*
     * The work bound, applied before any marker text is generated (CWE-400 / CWE-770 / CWE-1284).
     * `splitOptionGroupIdList` never shortens its input, so one caller-supplied token yields one bind
     * marker, and the statement's size and bind count grow with the list the caller sends. The account
     * uses the same three counts the smart list uses, derived from the split length rather than from
     * the assembled text:
     *
     *   bound parameters = N option-group identifiers + the one product identifier   [`:L68`, `:L78`]
     *   sources          = `SwOption` + the `SwOptionGroup` join + the two the `NOT EXISTS` carries
     *   ordering terms   = two, the group name then the option name
     *
     * so the account is `N + 7` units. The refusal REJECTS rather than trimming the list: a trimmed
     * list would answer about a different set of already-present groups and quietly offer an option the
     * product already carries.
     */
    assertStatementComplexityWithinBudget(this.statementComplexityBudget, {
      statement: 'findUnusedOptions',
      boundParameters: optionGroupIds.length + 1,
      sources: 4,
      orderingTerms: 2,
      listLength: optionGroupIds.length,
    });

    const sql = composeUnusedOptionsStatement(toPlaceholderList(optionGroupIds));

    // Statement order, not signature order: the group list binds at `:L68`, the product identifier at
    // `:L78`. See the TODO(parity) above before touching this line.
    const rows = await this.executor.execute(sql, [...optionGroupIds, productID]);

    return mapRows(rows, toUnusedOptionRow);
  }

  /**
   * Lists the option groups not yet present on a product, as drop-down rows.
   *
   * TODO(parity) `model/dao/OptionDAO.cfc:L68` versus `:L107` — opposite set polarity, and its
   * observable consequence. The two members receive the same argument and filter it with inverted
   * predicates: the sibling keeps rows whose group is a member of the supplied list [`:L68`], this one
   * keeps rows whose group is not [`:L107`]. One token of difference, and the two members answer
   * opposite questions about the same input.
   *
   * @param existingOptionGroupIDList - comma-delimited option-group identifiers already present on
   * the product. Required, as at `model/dao/OptionDAO.cfc:L95`.
   *
   * @returns the qualifying option groups, ordered by name. Possibly empty.
   * @throws {DataIntegrityError} when the projection and the row reader have drifted apart.
   * @throws {DomainError} when a projected column holds a value that is not text.
   */
  public async findUnusedOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<UnusedOptionGroupRow[]> {
    const optionGroupIds = splitOptionGroupIdList(existingOptionGroupIDList);

    /*
     * The same bound as the sibling, with the counts this statement actually carries: N markers in the
     * negated set-membership clause and no product identifier [`:L107`], one source, and one ordering
     * term — `N + 2` units. Applied before the marker text is generated, and rejecting rather than
     * trimming, because a trimmed list inverts to a WIDER `NOT IN` result and would offer option groups
     * the product already has.
     */
    assertStatementComplexityWithinBudget(this.statementComplexityBudget, {
      statement: 'findUnusedOptionGroups',
      boundParameters: optionGroupIds.length,
      sources: 1,
      orderingTerms: 1,
      listLength: optionGroupIds.length,
    });

    const sql = composeUnusedOptionGroupsStatement(toPlaceholderList(optionGroupIds));
    const rows = await this.executor.execute(sql, optionGroupIds);

    return mapRows(rows, mapUnusedOptionGroupRow);
  }
}
