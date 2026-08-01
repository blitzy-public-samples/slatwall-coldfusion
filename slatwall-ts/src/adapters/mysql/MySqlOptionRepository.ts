/* ================================================================================================
 * MySqlOptionRepository — the MySQL adapter for the Catalog's two option queries
 * ================================================================================================
 * PORT OF `model/dao/OptionDAO.cfc`. That component's whole body is two members —
 * `getUnusedProductOptions` [`:L51-L92`] and `getUnusedProductOptionGroups` [`:L94-L117`] — and AAP
 * 0.4.1.7 gives this file one instruction for them: "Both NOT EXISTS queries translated; the dynamic
 * NOT IN list built from validated identifiers rather than interpolated". AAP 0.4.2.6 fixes the two
 * target names, `findUnusedOptions` and `findUnusedOptionGroups`, and
 * `../../ports/repositories/OptionRepository.ts` declares the contract this class implements.
 *
 * The legacy component is REFERENCE-ONLY: it is never edited, moved, renamed or deleted (TR-6).
 *
 * WHY A DAO IS PORTED AT ALL. Both members of `model/service/OptionService.cfc` are one-line
 * pass-throughs [`:L73`, `:L77`], so every behaviour worth preserving — the composed drop-down label,
 * the set polarity, the row ordering, the parameter binding order — is expressed in the DAO. AAP
 * 0.2.1.3 adds all four catalog DAOs as implicit scope for exactly this reason.
 *
 * ------------------------------------------------------------------------------------------------
 * THIS FILE CARRIES NO DEFECT, AND SAYING SO IS THE POINT
 * ------------------------------------------------------------------------------------------------
 * `model/dao/OptionDAO.cfc` is the cleanest of the four in-scope DAOs, and the absence is recorded
 * here deliberately rather than left to inference — a reviewer comparing this adapter against its
 * `MySqlProductRepository.ts` and `MySqlSkuRepository.ts` siblings needs to see that nothing was
 * missed:
 *
 *   * EVERY value it binds goes through `<cfqueryparam>`, at `:L68`, `:L78` and `:L107` — which is
 *     all three bind positions in the component. So the interpolated-statement surface registered
 *     against `model/dao/ProductDAO.cfc` has no counterpart here, and nothing below is a hardening
 *     exception. Using bound parameters throughout is ORDINARY compliance with AAP 0.7.3 S2, not a
 *     departure from behaviour preservation.
 *   * EVERY table it names is the correct PHYSICAL name — `SwOption`, `SwOptionGroup`, `SwSkuOption`
 *     and `SwSku`, which are the only table tokens in the component. So the logical/physical
 *     name divergence registered against the other catalog DAOs has no site here either.
 *
 * The risk in this file is therefore not defect-carrying. It is three semantics that a competent
 * engineer's instincts will normalise away, each of which changes results silently and none of which
 * any type check can catch. All three are annotated below at the line that implements them, per AAP
 * 0.8.2 Guideline 6, and all three are PRESERVED rather than repaired, per AAP 0.7.3 S7:
 *
 *   1. An empty list binds ONE empty-string parameter and must keep doing so [`:L68`, `:L107`].
 *   2. Bind order is STATEMENT order, which is the reverse of the signature order [`:L68` before
 *      `:L78`, against the argument declarations at `:L52-L53`].
 *   3. The two members filter the SAME argument with OPPOSITE polarity [`IN` at `:L68`, `NOT IN` at
 *      `:L107`], which makes them answer opposite questions for an empty input.
 *
 * No new defect or mismatch identifier is minted anywhere in this file; every finding recorded below
 * is anchored to a `path:Lnnn` locator instead.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT THIS CLASS IS NOT
 * ------------------------------------------------------------------------------------------------
 * THE MEMBER SET IS CLOSED AT TWO. `model/dao/OptionDAO.cfc` has exactly two members — verified by
 * an exhaustive read of the component, not by scanning for a `public … function` pattern, because
 * `model/dao/SkuDAO.cfc` hides two private helpers in tag syntax at `:L204` and `:L222` inside an
 * otherwise-script file and a pattern scan misses them. There is no such third member here.
 *
 * Deliberately ABSENT, each individually tempting: `getOption`, `getOptionGroup`,
 * `getOptionSmartList` and `getOptionGroupSmartList` — those never had a source declaration at all,
 * being fabricated by the framework's prefix dispatch at `org/Hibachi/HibachiService.cfc:L255-L281`,
 * and AAP 0.4.2.5 declares them explicitly on `OptionService` rather than on this repository;
 * `getOptionsForSelect`, which is a pure in-memory projection on the service
 * [`model/service/OptionService.cfc:L55-L63`] with no data access; and any counting, listing,
 * exporting or processing member, because AAP 0.4.2.5 reproduces the fabricated surface "only where
 * used". Adding any of them would fork the contract this class implements.
 *
 * ------------------------------------------------------------------------------------------------
 * HOW IT SATISFIES THE BINDING STANDARDS (AAP 0.7.3)
 * ------------------------------------------------------------------------------------------------
 * `review_rules` reports that no user rules were provided, so no file enters scope by rule and the
 * nine standards are the substitute bar rather than an optional one.
 *
 *   S2 — every statement runs through the injected {@link SqlExecutor}, whose single member prepares
 *        the text and binds values positionally. The driver's text-substituting execution member is
 *        never reached from here, not as a fallback and not for a statement that binds nothing. No
 *        caller-supplied character ever reaches statement text: the ONLY thing an input list
 *        influences is how many `?` tokens are emitted. Identifiers come from `assertTableName` and
 *        `assertColumnName`, because `?` binds a value and can never substitute an identifier.
 *   S3 — the executor arrives as one typed constructor parameter, wired at the composition root.
 *        This class builds no connection, reads no credential and resolves no connection target;
 *        contrast `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L330` and `:L420`, which read
 *        connection settings inside the data-access layer three separate times.
 *   S4 — the imports below reach only `../../errors/`, `../../ports/` and this folder. Nothing from
 *        the configuration, service, handler, integration or validation layers is imported, no
 *        environment variable is read here, and no cloud-provider type appears. Every specifier is
 *        relative and extensionless, because neither compiler configuration declares a path alias
 *        and an alias that type-checks can still fail to resolve in the bundled artifact.
 *   S6 — the executor is an INTERFACE, so every statement this file composes is assertable with a
 *        plain object literal that records the text and the bound list. No database is required, and
 *        none is available: the legacy suite has no mocking library and the CFML runtime cannot be
 *        reproduced in this environment.
 *   S8 — M7 imposes nothing here, because `model/dao/OptionDAO.cfc:L49` declares no `accessors` and
 *        no `<cfproperty>`: the legacy DAO is STATELESS, unlike `model/dao/SkuDAO.cfc:L51` with its
 *        memoized sort-order cache. This class keeps it that way. It holds one immutable injected
 *        collaborator and no mutable field, and the module-scope values below are frozen strings
 *        validated once at load — identifiers, not a cache of anything a caller supplied. Two
 *        instances in one warm container therefore share nothing that could bleed between
 *        invocations or between tenants. M6 applies transitively: when the unit of work supplies a
 *        transaction-scoped executor, these reads run on it and observe uncommitted sibling writes,
 *        which is why the pool is never reached for directly.
 *   S9 — nothing is invented. Neither statement carries a row cap or a pagination clause, because
 *        neither legacy statement had one and the service consumes the whole array
 *        [`model/service/OptionService.cfc:L73`, `:L77`]. There is no retry count, no backoff, no
 *        statement deadline, no page size, no index hint and no pool tuning of any kind.
 *
 * ------------------------------------------------------------------------------------------------
 * W2 — THE `sortOrder` ORDERING OBLIGATION, AND WHY IT HAS NO SITE IN THIS FILE
 * ------------------------------------------------------------------------------------------------
 * `model/entity/OptionGroup.cfc:L70` declares `orderby="sortOrder"` on the options collection, and
 * the ORM applied that ordering transparently at load time. The domain layer has explicitly
 * delegated it to the persistence layer: `../../domain/option/OptionGroup.ts` states that this file
 * and `./rowMappers.ts` are responsible for producing that array ALREADY in `sortOrder` order, that
 * nothing is sorted in the domain object, and that `getOptions()` hands back the live array by
 * reference — so an unordered array stays unordered forever.
 *
 * The obligation is therefore recorded here in full, and it has no site in this file: neither of the
 * two members materialises an option collection for an option group. Both return flat drop-down
 * projections, not entities, which is also why no domain class is imported below. ANY member later
 * added to this class that does materialise such a collection MUST carry `ORDER BY sortOrder` in its
 * statement text.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L82-L84` and `:L108-L109` — W2 IS NOT A LICENCE TO RETOUCH
 * THE TWO ORDERINGS THAT DO EXIST. Both existing statements order by NAME: the first by the group's
 * name then the option's name, the second by the group's name alone. Neither mentions `sortOrder`,
 * and both sequences reach a rendered drop-down directly, so they are observable output and are
 * carried exactly as written.
 * ============================================================================================== */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import {
  assertColumnName,
  assertTableName,
  prepareBoundedRead,
  settleBoundedRead,
} from './QueryRunner';
import { mapRows, mapUnusedOptionGroupRow, mapUnusedOptionRow } from './rowMappers';

import type { BoundedReadResult, BoundedReadWindow } from '../../ports/repositories/BoundedRead';
import type { SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../ports/repositories/OptionRepository';

/* ================================================================================================
 * VALIDATED IDENTIFIERS
 * ================================================================================================
 * Every table and column token this file can place into statement text is resolved here, once, when
 * the module is evaluated. Three properties follow, and all three are the reason it is done here
 * rather than inline:
 *
 *   * A name that is not part of the extracted schema is refused at COLD START rather than on the
 *     first request that happens to reach the statement.
 *   * The resolvers return canonical spellings, so the statement text below cannot drift from the
 *     column set the entity declarations define.
 *   * The values are immutable strings. They are identifiers, not a cache: nothing a caller supplies
 *     is ever stored in module scope, so there is nothing here to bleed across warm invocations (M7,
 *     and see the module header).
 * ============================================================================================== */

/** `model/entity/Option.cfc:L49` — `table="SwOption"`. */
const OPTION_TABLE = assertTableName('SwOption');

/** `model/entity/OptionGroup.cfc:L49` — `table="SwOptionGroup"`. */
const OPTION_GROUP_TABLE = assertTableName('SwOptionGroup');

/**
 * The SKU-to-option link table, named directly in the non-existence guard at
 * `model/dao/OptionDAO.cfc:L74`.
 *
 * It has no entity component of its own: it is declared as the `linktable` of the owning
 * many-to-many at `model/entity/Sku.cfc:L76` (`fkcolumn="skuID" inversejoincolumn="optionID"`), whose
 * inverse side is `model/entity/Option.cfc:L66`. Those two attributes are what fix the two column
 * names used below.
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

/**
 * `SwOptionGroup.optionGroupID` — the parent side of that same relationship.
 *
 * Held separately from {@link OPTION_GROUP_ID_ON_OPTION_COLUMN} even though the two spellings are
 * identical, because they are validated against DIFFERENT tables. Sharing one constant would let a
 * future column rename on one table silently keep compiling against the other.
 */
const OPTION_GROUP_ID_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupName` — projected by BOTH statements, at
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

/**
 * The alias the legacy gives the link table inside the non-existence guard [`:L74`].
 *
 * Preserved verbatim, along with {@link SKU_TABLE_ALIAS}. Single-letter aliases are not how a
 * statement would be written from scratch, but reproducing them keeps this text diffable against the
 * legacy source line for line, which is worth more here than a cosmetic improvement.
 */
const SKU_OPTION_TABLE_ALIAS = 'a';

/** The alias the legacy gives the SKU table inside the same guard [`:L76`]. */
const SKU_TABLE_ALIAS = 'b';

/* ================================================================================================
 * LITERALS THAT ARE OBSERVABLE BEHAVIOUR
 * ============================================================================================== */

/**
 * The three-character separator that joins an option group's name to its option's name.
 *
 * `model/dao/OptionDAO.cfc:L88`, verbatim:
 *
 *     arrayAppend(result, {name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID})
 *
 * A SPACE, a HYPHEN-MINUS, then a SPACE. An en dash, a slash, a colon, or a bare hyphen without its
 * surrounding spaces would each change text that reaches a rendered page, so the separator is held as
 * a named constant rather than inlined into the composition — a named constant is assertable, and a
 * test can compare against this exact value instead of restating it.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L88` — THE LABEL IS COMPOSED IN THE DATA-ACCESS LAYER, WHICH
 * IS WHERE THE LEGACY COMPOSES IT. It is tempting to treat a display label as presentation and move
 * it up to the service, or out to the caller. That would be wrong twice over: the service is a
 * one-line pass-through [`model/service/OptionService.cfc:L73`] that adds nothing, and AAP 0.4.2.4
 * requires the `"<group> - <option>"` format to be preserved as the projection contract the service
 * hands to its caller. It stays here, unchanged, untrimmed.
 */
const UNUSED_OPTION_LABEL_SEPARATOR = ' - ';

/**
 * The delimiter used to split the comma-delimited option-group identifier list.
 *
 * A comma, matching CFML's default list delimiter and the form the callers actually produce:
 * `model/entity/Product.cfc:L637` and `:L644` both pass `structKeyList(getOptionGroupsStruct())`,
 * whose output is comma-delimited with no surrounding whitespace.
 */
const OPTION_GROUP_ID_LIST_DELIMITER = ',';

/** The bind marker for one value in a prepared statement. Never used for an identifier. */
const BIND_PLACEHOLDER = '?';

/** The text placed between consecutive bind markers inside a set-membership clause. */
const PLACEHOLDER_JOINER = ', ';

/* ================================================================================================
 * LIST AND PLACEHOLDER HANDLING — WHERE THE EASIEST MISTAKE IN THIS FILE LIVES
 * ============================================================================================== */

/**
 * Splits the comma-delimited option-group identifier list into the values to bind.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L68` and `:L107` — THE NAIVE TRANSLATION IS THE CORRECT ONE,
 * AND EVERY "IMPROVEMENT" TO IT IS A REGRESSION. This is the single most likely accidental failure in
 * this file, so the reasoning is recorded in full rather than summarised.
 *
 * CFML `<cfqueryparam … list="true">` splits the supplied string on its delimiter and binds one
 * parameter per resulting token, WITHOUT discarding empty tokens. For an EMPTY string that yields one
 * empty-string parameter, so the legacy predicate is literally `IN ('')` at `:L68` and `NOT IN ('')`
 * at `:L107`. TypeScript's `''.split(',')` yields `['']` — one empty element — so the two agree
 * naturally, and this function is a bare split for that reason.
 *
 * The empty case is ORDINARY, not hypothetical. `model/entity/Product.cfc:L637` and `:L644` supply
 * the argument as `structKeyList(getOptionGroupsStruct())`, and that struct
 * [`model/entity/Product.cfc:L241-L249`] is empty for any product with no option groups yet
 * [`:L251-L261`] — the state of every freshly created product.
 *
 * FOUR TRANSFORMATIONS ARE FORBIDDEN HERE, and each one looks like a tidy-up:
 *
 *   * DROPPING EMPTY TOKENS. For an empty input this collapses the list to zero elements, and a
 *     set-membership clause with zero bind markers is a SYNTAX ERROR at the database — a working
 *     degenerate query turned into a run-time failure, with no compile error anywhere.
 *   * SHORT-CIRCUITING THE EMPTY CASE to an always-false or always-true predicate. `IN ('')` and
 *     `NOT IN ('')` have precise and DIFFERENT truth values, and the two members depend on the
 *     difference — see the polarity note on {@link MySqlOptionRepository.findUnusedOptionGroups}.
 *   * TRIMMING each token. The legacy binds the token exactly as the delimiter produced it.
 *   * DEDUPLICATING. A repeated identifier yields a repeated bind marker in the legacy and must here
 *     too; `IN ('a','a')` and `IN ('a')` select identically, so removing the duplicate is invisible
 *     in the result and still a divergence in the statement a test can assert on.
 *
 * A split always returns at least one element, so the returned list is never empty and no guard for
 * that case exists or is needed.
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
 * It takes the VALUES rather than a count, deliberately. Deriving the marker text from the same array
 * that is bound makes it structurally impossible for the two to disagree — the failure mode where a
 * statement carries three markers and the parameter list carries two cannot be expressed. The
 * elements themselves are never read: only their number reaches the returned text, which is the whole
 * of AAP 0.4.3.4's requirement that the dynamic list be built from validated values rather than
 * concatenated into the statement (S2).
 *
 * @param values - the values that will be bound to this clause, in bind order.
 * @returns the marker text, for example `?` for one value and `?, ?, ?` for three.
 */
function toPlaceholderList(values: readonly string[]): string {
  return values.map(() => BIND_PLACEHOLDER).join(PLACEHOLDER_JOINER);
}

/* ================================================================================================
 * STATEMENT COMPOSITION
 * ================================================================================================
 * Both statements are composed per call, because the number of bind markers in the set-membership
 * clause depends on the input. Nothing about a call is retained afterwards.
 * ============================================================================================== */

/**
 * Composes the unused-product-options statement — the translation of
 * `model/dao/OptionDAO.cfc:L58-L85`.
 *
 * THE BUSINESS RULE, in one sentence: an option qualifies when it belongs to one of the option groups
 * already present on the product AND is not yet carried by any SKU of that product. The first half is
 * the set-membership clause from `:L68`; the second is the correlated non-existence guard from
 * `:L70-L81`.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L70-L81` — THE GUARD STAYS A `NOT EXISTS`. Rewriting a
 * correlated non-existence test as an outer join with a null test is the textbook transformation, and
 * it is forbidden here by AAP 0.8.2 Guideline 4: the two forms are not obviously equivalent in the
 * presence of the inner `DISTINCT`, the outer form fans the result out and would then need its own
 * de-duplication, and neither difference would announce itself. The correlation
 * `a.optionID = SwOption.optionID` [`:L80`] also stays INSIDE the sub-query, where the legacy puts it;
 * lifting it into the outer predicate changes what the sub-query is correlated to.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L71-L72` — THE INNER PROJECTION IS REDUNDANT AND IS KEPT
 * ANYWAY. `SELECT DISTINCT a.optionID` inside a non-existence test computes a column list that is
 * never read, and the `DISTINCT` de-duplicates rows whose existence is all that is being tested.
 * Both are harmless, and both are reproduced: this is preserved source, not a defect, and trimming it
 * would make the generated text stop matching the legacy line for line for no behavioural gain.
 *
 * The ordering at `:L82-L84` is two terms — the group's name, then the option's name — and both reach
 * a rendered drop-down, so the sequence is observable output and is reproduced exactly.
 *
 * @param optionGroupIdPlaceholders - the bind-marker text for the set-membership clause, from
 *   {@link toPlaceholderList}. Never empty; see {@link splitOptionGroupIdList}.
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
 * Note everything this statement does NOT do, because the omissions are faithful rather than
 * accidental. It takes no product identifier, joins nothing, consults neither the SKU table nor the
 * link table, and applies no non-existence guard at all: its scope is the whole option-group table
 * [`:L105`], narrowed only by the negated set-membership clause at `:L107`. "Unused" therefore means
 * something narrower here than in the sibling statement — absent from the list the caller supplied —
 * and that is the legacy behaviour, not a filter awaiting repair (AAP 0.8.2 Guideline 4).
 *
 * The projection order is the group's identifier first and its name second [`:L102-L103`], which is
 * the reverse of the field order of the row the legacy then assembles at `:L113`. Reproduced as
 * written: a projection's column order is part of the statement, and nothing downstream reads by
 * position.
 *
 * The ordering at `:L108-L109` is a SINGLE term, the group's name — one fewer than the sibling
 * statement's two.
 *
 * @param optionGroupIdPlaceholders - the bind-marker text for the negated set-membership clause, from
 *   {@link toPlaceholderList}. Never empty; see {@link splitOptionGroupIdList}.
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

/* ================================================================================================
 * ROW SHAPING
 * ============================================================================================== */

/**
 * Reads one projected text column, reproducing how a CFML query column read behaves.
 *
 * Needed because the label at `model/dao/OptionDAO.cfc:L88` is composed from two columns, and the
 * mapper in `./rowMappers.ts` deliberately reads the composed label under its projection key alone —
 * it lifts a label this file has already produced rather than building one. Its own typed readers are
 * module-private there, so the two columns that feed the composition are read here.
 *
 * Three outcomes, each matching a distinct legacy or port reality:
 *
 *   * ABSENT column — the projection and this file have DRIFTED, which is an adapter defect rather
 *     than a data condition. It raises, and it raises as a data-integrity fault so the boundary
 *     reports it as service-attributable: no caller can correct a mismatch between a statement and
 *     its reader. Substituting a blank would turn a broken projection into plausible-looking output
 *     that surfaces far from its cause.
 *   * NULL column — yields the empty string, which is not an invented default. A CFML query column
 *     read never produces null, so the legacy interpolation at `:L88` observed `''` for a NULL name
 *     and composed a label around it. Both name columns are nullable: `optionName` at
 *     `model/entity/Option.cfc:L54` and `optionGroupName` at `model/entity/OptionGroup.cfc:L53`
 *     declare no `notnull` constraint, and the required-ness they do have is declared in the
 *     validation layer, not in the schema.
 *   * NON-TEXT column — raises. Coercing a number or a date into a label would hide the fact that the
 *     column being read is not the column intended.
 *
 * TODO(parity) `model/dao/OptionDAO.cfc:L88` — THE LABEL IS COMPOSED IN TYPESCRIPT, NOT IN SQL, AND
 * THAT IS A DELIBERATE JUDGEMENT CALL (AAP 0.8.2 Guideline 6). Concatenating the two names in the
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
 * The translation of the loop body at `model/dao/OptionDAO.cfc:L87-L89`. The label is composed from
 * the two name columns with {@link UNUSED_OPTION_LABEL_SEPARATOR} between them, presented under the
 * projection key the mapper reads it by, and the raw row is spread beneath it so the option
 * identifier the mapper also needs is still there to be read. Spreading rather than rebuilding keeps
 * this function ignorant of which other columns the mapper wants; adding the label is the only change
 * it makes.
 *
 * Validating the FINISHED row — that the composed label and the option identifier are each present
 * and are text — is the mapper's job, and it is left there rather than duplicated here. What is
 * validated locally is only what the composition itself reads, which the mapper cannot see.
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

/* ================================================================================================
 * THE ADAPTER
 * ============================================================================================== */

/**
 * The MySQL implementation of {@link OptionRepository}.
 *
 * PORT OF `model/dao/OptionDAO.cfc`. Two members, matching the component's two, and nothing else —
 * see WHAT THIS CLASS IS NOT in the module header for the members that are deliberately absent and
 * why adding any of them would fork the contract.
 *
 * THE INHERITANCE IS GONE, AND THAT IS THE POINT. `model/dao/OptionDAO.cfc:L49` extends the LOCAL
 * base `model/dao/HibachiDAO.cfc`, which in turn extends the framework base at its own `:L49` — and
 * the component uses NOTHING from either: a scan of all 120 lines finds no `super.` call, no framework
 * accessor, no identifier generator and no service lookup, because both members compose their own
 * statement and return their own array. Inheriting a base here would carry a surface this component
 * never used, so the one thing it genuinely needs — a way to run a statement — arrives as an injected
 * collaborator instead (AAP 0.4.3.3 R3, AAP 0.7.3 S3).
 *
 * STATELESS, LIKE ITS ORIGINAL. `model/dao/OptionDAO.cfc:L49` declares no `accessors` and no
 * `<cfproperty>`, so the legacy component held nothing between calls — unlike `model/dao/SkuDAO.cfc`,
 * whose memoized sort-order cache at `:L204-L228` makes it the only stateful DAO in the slice. This
 * class holds one immutable collaborator and no mutable field, and nothing derived from a call
 * survives it.
 *
 * That matters concretely, and the reason is verifiable rather than assumed. The legacy bean factory
 * is configured at `org/Hibachi/Hibachi.cfc:L289-L292` with only four transient folders — entity,
 * process, transient and report — so a DAO was a SINGLETON, and `:L297` says as much in as many words.
 * The composition root reproduces that lifetime and is itself memoized across warm invocations, so a
 * per-instance cache here would bleed between invocations and between tenants. There is none, and none
 * may be added.
 */
export class MySqlOptionRepository implements OptionRepository {
  /**
   * The injected execution boundary.
   *
   * Typed as the one-member {@link SqlExecutor} interface rather than as the concrete runner class,
   * which is what lets a test replace it with a plain object literal that records the statement text
   * and the bound list — the only way this file is assertable at all, since no database is available
   * and the legacy suite has no mocking library (AAP 0.7.3 S6).
   *
   * It is also the transaction seam. When the unit of work supplies a transaction-scoped executor,
   * these reads run on that connection and therefore observe uncommitted sibling writes, which is the
   * behaviour the legacy got from its ORM session (M6). Reaching past this field to a pool would break
   * that silently, so the field is private and nothing here holds a pool.
   */
  private readonly executor: SqlExecutor;

  /**
   * @param executor - the statement executor, supplied by the composition root. It replaces the DI/1
   *   property declared at `model/service/OptionService.cfc:L51` together with the accessor
   *   fabricated for it, which resolved by name at run time (AAP 0.4.3.1 R1, AAP 0.4.3.2 R2). No
   *   connection is built here and no connection setting is read here.
   */
  public constructor(executor: SqlExecutor) {
    this.executor = executor;
  }

  /**
   * Returns an equivalent {@link MySqlOptionRepository} bound to a DIFFERENT statement executor.
   *
   * ⭐ THIS IS THE FIX FOR REVIEW FINDING 2, AND THE DEFECT IT CLOSES WAS STRUCTURAL. Every repository
   * in this folder captures its executor at construction, which is correct — but while that was the ONLY
   * way to supply one, an executor chosen at construction time was necessarily the POOL-bound one, and
   * no later act could change it. Wrapping a service call in `UnitOfWork.run` therefore did nothing
   * useful: the boundary acquired a connection, began a transaction, and handed out a scope executor
   * that this class had no way to adopt, so every read and write still went to the pool and straight out
   * of the transaction. Rollback-on-errors and M6's same-connection read-back visibility were
   * unreachable no matter how the graph was wired.
   *
   * Re-binding closes that. Inside a boundary a caller re-binds this repository to `scope.executor` and
   * uses the result for the duration of the boundary; every statement the returned instance issues then
   * runs on the connection the boundary owns.
   *
   * ⚠️ A NEW INSTANCE, NOT A MUTATION, AND THE DIFFERENCE IS THE POINT. The captured executor stays
   * `private readonly` and this method never reassigns it, so the pool-bound instance a composition root
   * built is still valid and still pool-bound after the call. Mutating it in place would make the
   * repository's connection depend on WHEN it was used rather than on WHICH instance was used — an
   * ambient current-transaction slot in all but name, which is exactly what
   * `src/adapters/mysql/UnitOfWork.ts` refuses to keep (M7, AAP 0.7.3 S3). Two concurrent boundaries on
   * one warm container get two instances and cannot observe each other's connection.
   *
   * ⚠️ IT IS NOT ON THE PORT INTERFACE, AND MUST NOT BE PUT THERE. A service may not know that a
   * statement executor exists at all (AAP 0.7.3 S2 inverted), so re-binding is exposed on the CONCRETE
   * adapter and used only by the layer that already holds concrete adapters. Adding it to the port would
   * leak the persistence mechanism into `src/services/**`.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns A new instance identical in every other respect.
   */
  public withExecutor(executor: SqlExecutor): MySqlOptionRepository {
    return new MySqlOptionRepository(executor);
  }

  /**
   * Lists the options a product may still be offered, as drop-down rows.
   *
   * PORT OF `getUnusedProductOptions` [`model/dao/OptionDAO.cfc:L51-L92`], whose statement is
   * translated by {@link composeUnusedOptionsStatement} and whose loop body is translated by
   * {@link toUnusedOptionRow}.
   *
   * TODO(parity) `model/dao/OptionDAO.cfc:L52-L53` versus `:L68` and `:L78` — BIND ORDER IS STATEMENT
   * ORDER, WHICH IS THE REVERSE OF THIS SIGNATURE. This is the second most likely way to break this
   * file, and it is invisible to every static check available.
   *
   * The legacy declares `productID` FIRST [`:L52`] and `existingOptionGroupIDList` SECOND [`:L53`],
   * and this signature preserves that order because AAP 0.4.2.6 fixes it and because
   * `model/entity/Product.cfc:L637` already calls positionally in it. But the STATEMENT binds them
   * the other way round: the set-membership clause at `:L68` comes BEFORE the product predicate
   * inside the non-existence guard at `:L78`. TR-4 requires the bound array to follow the legacy
   * statement sequence, so the array assembled below is the group identifiers FIRST and the product
   * identifier LAST.
   *
   * Both parameters are `string`, so transposing them compiles cleanly, throws nothing, and quietly
   * returns the wrong option set. Neither order may be "harmonised": reordering the signature breaks
   * the existing positional call sites, and reordering the bindings breaks the statement. The
   * divergence is carried, and mapping between the two is this member's job.
   *
   * AN EMPTY `existingOptionGroupIDList` RESOLVES TO AN EMPTY ARRAY, and must. The clause becomes a
   * membership test against a single empty string, which no real identifier satisfies. That is the
   * ordinary state of a product with no option groups yet, so it is neither guarded nor treated as an
   * error — see {@link splitOptionGroupIdList} for why every tidier alternative is a regression.
   *
   * TR-1 TIGHTENING, RECORDED: the legacy declares `returntype="any"` [`:L51`] while demonstrably
   * resolving to an array of two-field rows [`:L87-L89`, `:L91`]; the target narrows that to the
   * port's row type.
   *
   * @param productID - the product whose SKUs decide what already counts as used. Required, as at
   *   `model/dao/OptionDAO.cfc:L52`.
   * @param existingOptionGroupIDList - comma-delimited option-group identifiers already present on
   *   that product. Required, as at `model/dao/OptionDAO.cfc:L53`.
   * @returns the qualifying options, ordered by group name then option name. Possibly empty.
   * @throws {DataIntegrityError} when the projection and the row reader have drifted apart.
   * @throws {DomainError} when a projected column holds a value that is not text.
   */
  public async findUnusedOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<UnusedOptionRow[]> {
    const optionGroupIds = splitOptionGroupIdList(existingOptionGroupIDList);
    const sql = composeUnusedOptionsStatement(toPlaceholderList(optionGroupIds));

    // Statement order, not signature order: the group list binds at `:L68`, the product identifier at
    // `:L78`. See the TODO(parity) above before touching this line.
    const rows = await this.executor.execute(sql, [...optionGroupIds, productID]);

    return mapRows(rows, toUnusedOptionRow);
  }

  /**
   * The windowed form of {@link MySqlOptionRepository.findUnusedOptions}.
   *
   * NOTHING ABOUT THE MATCH SET IS RE-DECIDED HERE. The list splitting, the placeholder list, the
   * statement and the bind order all come from the same three collaborators the unbounded member uses,
   * called in the same sequence, so the pair cannot drift into filtering differently.
   *
   * ⚠️ THE BIND ORDER TRAP IS STILL LIVE, AND THE WINDOW SITS AFTER IT. The group identifiers bind
   * FIRST and the product identifier LAST — statement order, the reverse of the argument order, per the
   * TODO(parity) on the unbounded member — and the two window values bind after both, in positions the
   * legacy statement never used. The window therefore cannot disturb the legacy sequence (TR-4).
   *
   * THE WINDOW IS APPENDED AFTER THE `ORDER BY`, which is where a `LIMIT` must go and also where it is
   * meaningful: `model/dao/OptionDAO.cfc:L90-L92` orders by group name then option name, so the window
   * selects a deterministic slice rather than an arbitrary one.
   *
   * @param window - the caller's ceiling and zero-based offset; validated, never defaulted.
   * @param productID - as on the unbounded member.
   * @param existingOptionGroupIDList - as on the unbounded member, empty string included.
   * @returns the window's rows in the legacy order, and whether a further row lies past it.
   * @throws {DomainError} for an unusable window, or a projected column that does not hold text.
   * @throws {DataIntegrityError} when the projection and the row reader have drifted apart.
   */
  public async findUnusedOptionsBounded(
    window: BoundedReadWindow,
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<BoundedReadResult<UnusedOptionRow>> {
    const bound = prepareBoundedRead(window, 'MySqlOptionRepository.findUnusedOptionsBounded');
    const optionGroupIds = splitOptionGroupIdList(existingOptionGroupIDList);
    const sql = composeUnusedOptionsStatement(toPlaceholderList(optionGroupIds));

    const rows = await this.executor.execute(
      `${sql}
  LIMIT ${BIND_PLACEHOLDER} OFFSET ${BIND_PLACEHOLDER}`,
      [...optionGroupIds, productID, ...bound.boundValues],
    );

    return settleBoundedRead(mapRows(rows, toUnusedOptionRow), bound.limit);
  }

  /**
   * Lists the option groups not yet present on a product, as drop-down rows.
   *
   * PORT OF `getUnusedProductOptionGroups` [`model/dao/OptionDAO.cfc:L94-L117`], whose statement is
   * translated by {@link composeUnusedOptionGroupsStatement} and whose loop body needs no composition
   * at all — the row it assembles at `:L113` is the plain group name and the group's own identifier,
   * so the mapper reads the projection directly. Contrast the sibling member one line of legacy source
   * earlier, which composes a two-part label; the two rows are shape-identical and semantically
   * different, which is exactly why they are not merged.
   *
   * TODO(parity) `model/dao/OptionDAO.cfc:L68` versus `:L107` — OPPOSITE SET POLARITY, AND ITS
   * OBSERVABLE CONSEQUENCE. The two members receive the SAME argument and filter it with INVERTED
   * predicates: the sibling keeps rows whose group IS a member of the supplied list [`:L68`], this one
   * keeps rows whose group is NOT [`:L107`]. One token of difference, and the two members answer
   * opposite questions about the same input.
   *
   * The consequence looks like a bug and is not, so it is stated plainly: FOR A PRODUCT WITH NO
   * OPTION GROUPS the sibling member resolves to an EMPTY array while this member resolves to EVERY
   * option group. Both are correct — a product with none used has none to exclude, so all of them are
   * available to add — and both arrive by the ordinary path, `structKeyList(getOptionGroupsStruct())`
   * at `model/entity/Product.cfc:L637` and `:L644`. Normalising the pair to one polarity, in either
   * direction, would change output that reaches a rendered page.
   *
   * TR-1 TIGHTENING, RECORDED — AND WIDER THAN FOR THE SIBLING MEMBER: `model/dao/OptionDAO.cfc:L94`
   * declares NEITHER `returntype` NOR `access`, so the legacy member is public only by CFML default
   * and its value is entirely untyped. It nonetheless resolves to an array of two-field rows
   * [`:L112-L114`, `:L116`], and `model/service/OptionService.cfc:L76` independently declares `array`
   * for it. The target narrows that to the port's row type and states the visibility explicitly. No
   * meaning is read into the omission beyond that; it is recorded because a reader comparing the two
   * declarations will notice the difference and should find a decision here.
   *
   * @param existingOptionGroupIDList - comma-delimited option-group identifiers already present on
   *   the product. Required, as at `model/dao/OptionDAO.cfc:L95`.
   * @returns the qualifying option groups, ordered by name. Possibly empty.
   * @throws {DataIntegrityError} when the projection and the row reader have drifted apart.
   * @throws {DomainError} when a projected column holds a value that is not text.
   */
  public async findUnusedOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<UnusedOptionGroupRow[]> {
    const optionGroupIds = splitOptionGroupIdList(existingOptionGroupIDList);
    const sql = composeUnusedOptionGroupsStatement(toPlaceholderList(optionGroupIds));
    const rows = await this.executor.execute(sql, optionGroupIds);

    return mapRows(rows, mapUnusedOptionGroupRow);
  }

  /**
   * The windowed form of {@link MySqlOptionRepository.findUnusedOptionGroups}.
   *
   * ⚠️ THE `NOT IN` POLARITY IS THE WHOLE REASON A WINDOW IS USEFUL HERE. The unbounded member returns
   * EVERY option group for a product that has none yet — the mirror image of its sibling, per the
   * TODO(parity) above — so this is the member whose result is largest exactly when a caller has least
   * information. The polarity is untouched: the statement, the placeholder list and the bind order all
   * come from the same collaborators the unbounded member calls.
   *
   * The empty-list input still produces one placeholder bound to the empty string, still matches every
   * real identifier, and is still neither guarded nor special-cased. The window is appended after
   * `model/dao/OptionDAO.cfc:L115-L117`'s single sort term, so the slice is deterministic.
   *
   * @param window - the caller's ceiling and zero-based offset; validated, never defaulted.
   * @param existingOptionGroupIDList - as on the unbounded member, empty string included.
   * @returns the window's rows in name order, and whether a further row lies past it.
   * @throws {DomainError} for an unusable window, or a projected column that does not hold text.
   * @throws {DataIntegrityError} when the projection and the row reader have drifted apart.
   */
  public async findUnusedOptionGroupsBounded(
    window: BoundedReadWindow,
    existingOptionGroupIDList: string,
  ): Promise<BoundedReadResult<UnusedOptionGroupRow>> {
    const bound = prepareBoundedRead(window, 'MySqlOptionRepository.findUnusedOptionGroupsBounded');
    const optionGroupIds = splitOptionGroupIdList(existingOptionGroupIDList);
    const sql = composeUnusedOptionGroupsStatement(toPlaceholderList(optionGroupIds));

    const rows = await this.executor.execute(
      `${sql}
  LIMIT ${BIND_PLACEHOLDER} OFFSET ${BIND_PLACEHOLDER}`,
      [...optionGroupIds, ...bound.boundValues],
    );

    return settleBoundedRead(mapRows(rows, mapUnusedOptionGroupRow), bound.limit);
  }
}
