// ---------------------------------------------------------------------------
// The sale-price promotion-reward statement.
//
// Legacy source: `<cffunction name="getSalePricePromotionRewardsQuery">` at
// [model/dao/PromotionDAO.cfc:L298-L591] - the largest statement in the migration slice: a
// preliminary query [L309-L326], a SIX-branch `UNION` [L332-L542], and THREE chained in-engine
// query-of-queries steps [L544-L559, L561-L569, L571-L588], returning a query object rather than
// entities [L590].
//
// JUDGMENT CALL: the function span is L298-L591, not the L298-L593 the plan and the folder
// specification both claim. The file was read: L590 is `<cfreturn skuResults />`, L591 is
// `</cffunction>`, L592 is whitespace and L593 is `</cfcomponent>` - the end of the FILE, not of
// the function. The corrected span is cited throughout this module.
//
// A pure, synchronous statement builder: it composes SQL text and the positional values to bind to
// it, and returns both. It opens no connection, executes nothing, hydrates no entity, constructs no
// `Money`, reads no clock and no `process.env`, logs nothing and is not `async`. All of that
// belongs one tier out in `src/repositories/mysql/mysqlPromotionRepository.ts`, which owns row
// hydration, the DECIMAL-string to `Money` conversion and the fetch-shape decision. That boundary
// is what lets `tests/integration/repositories/*.test.ts` assert the emitted SQL text and the
// bound-parameter array with NO live MySQL.
//
// Two imports only: `../dialect.js` for the dialect-branching join fragment at
// [model/dao/PromotionDAO.cfc:L482-L488], resolved inside the builder body and never at module
// load; and `../../../lib/cfml/list.js` for the CFML `listToArray` semantics the
//   `cfqueryparam list="true"`
// expansion at [model/dao/PromotionDAO.cfc:L525] needs. The port
// `src/domain/ports/promotionRepository.ts` was consulted for the result contract and is
// deliberately NOT imported - a statement builder has no business depending on the domain.
//
// NOTHING IS ADDED THAT THE LEGACY LACKS: no `ORDER BY`, `LIMIT`, `HAVING`, `ROW_NUMBER`, extra or
// removed `DISTINCT`, tiebreaker, `COALESCE`, `IFNULL`, `ELSE` arm, `ROUND`, `CAST`, index hint,
// `FIND_IN_SET` in place of the unanchored `LIKE`, `UNION ALL` in place of `UNION`, outer join,
// fifth `NOT EXISTS`, join to `SwRoundingRule`, null guard, emptiness check, or "more correct"
// boundary operator. Each would change either the rows returned or the money computed for them.
//
// EXHIBITS: the three query-of-queries bodies [L544-L559, L561-L569, L571-L588] are transcribed
// verbatim beside the CTEs that replace them, because AAP 0.4.3 requires that rewrite to be
// readable side by side. Every other legacy fragment is cited by locator, not transcribed. In an
// exhibit each leading TAB becomes four spaces and the eight spaces common to every line are
// dropped.
//
// JUDGMENT CALL: the EMITTED text preserves what carries meaning - line structure, clause order,
// alias names and keyword case, including the source's own case inconsistencies - and normalises
// only leading whitespace, which the legacy itself writes inconsistently at [L350]/[L354] and
// [L356]/[L358]. The trailing TABs at [L361], [L392], [L425], [L458], [L499] and [L540] are
// dropped.
// ---------------------------------------------------------------------------

import { materializedIdPathLikePatternFragment, resolveConfiguredDialect } from '../dialect.js';
import { listToArray } from '../../../lib/cfml/list.js';

/**
 * A value bound to one positional placeholder.
 *
 * The union is exactly as wide as the statement's own bind census and no wider: `Date` for the
 * fourteen timestamp positions, `number` for the single active flag, `string` for the three reward
 * types and the six product identifiers.
 */
type BindValue = string | number | Date;

/**
 * The builder's input.
 *
 * `productID` is OPTIONAL, and its optionality is load-bearing: [model/dao/PromotionDAO.cfc:L299]
 * declares it with NO `required` attribute and NO default, which is what makes the six
 * `structKeyExists` guards meaningful. Under `exactOptionalPropertyTypes` the member must be ABSENT
 * to mean absent - assigning `undefined` does not compile - so key presence and value emptiness
 * stay distinguishable here as they are in CFML.
 *
 * Not exported: this module exposes exactly one unit, the builder.
 */
interface SalePricePromotionRewardsInput {
  /**
   * The single instant every date predicate is compared against. An INPUT, never read from the
   * clock here. See the builder's own note.
   */
  readonly now: Date;

  /**
   * Optional product identifier narrowing every branch. Omit it for every product.
   *
   * A PRESENT but empty string is a real, reachable case and is not intercepted: it binds
   * `SwSku.productID = ''` in all six branches and returns no rows, exactly as the legacy does.
   */
  readonly productID?: string;
}

/**
 * A statement ready to hand to a prepared-statement call: the text, and the values to bind to its
 * placeholders in order. Not exported, for the same reason as the input shape.
 */
interface SalePricePromotionRewardsStatement {
  /**
   * The statement text. One positional `?` per element of `params`, and no interpolated value.
   */
  readonly sql: string;

  /**
   * The values to bind, in the order their placeholders appear in `sql`.
   *
   * An open array rather than a fixed tuple, because the arity is genuinely variable: 18
   * placeholders when `productID` is absent and 24 when it is present, since each of the six
   * branches carries its own `WHERE` clause and therefore its own bind.
   *
   * Frozen at construction as well as typed `readonly`: the type erases at emit, and these elements
   * do NOT mean the same thing as each other - a runtime reorder would bind a timestamp where a
   * product identifier belongs. The executor copies the array before handing it to the driver.
   */
  readonly params: readonly BindValue[];
}

/**
 * One branch of the six-branch `UNION`.
 *
 * The six share an identical nine-column projection and an identical pair of date predicates,
 * differing only in the level literal they emit, the two aliases they read those columns through,
 * the join chain that reaches them, and - in the `global` branch alone - a set of predicates
 * preceding the date pair. Describing that difference as data rather than as five near-copies of
 * text is what keeps the emitted SQL verifiably uniform where the legacy is uniform.
 */
interface DiscountBranch {
  /**
   * The branch-constant level literal, emitted INLINE in the projection: a projection label, not a
   * filter value, so it is not bound. See the builder's note on the inline-versus-bound split.
   */
  readonly discountLevel: 'sku' | 'product' | 'brand' | 'option' | 'productType' | 'global';

  /** The `SwPromoReward` alias this branch reads the reward columns through. */
  readonly rewardAlias: string;

  /** The `SwPromotionPeriod` alias this branch reads the period columns through. */
  readonly periodAlias: string;

  /** The branch's `FROM` clause and its complete join chain, in source order. */
  readonly fromClause: string;

  /**
   * Predicates that precede the date pair inside this branch's `WHERE`. Empty for five of the six.
   * The `global` branch supplies the reward-type membership test and the four `NOT EXISTS`
   * exclusions, in source order.
   */
  readonly leadingPredicates: readonly string[];

  /**
   * The values bound by `leadingPredicates`, in placeholder order. Held alongside the text rather
   * than derived from it, so a fragment can never be emitted without the values it needs.
   */
  readonly leadingBindValues: readonly BindValue[];
}

// ---------------------------------------------------------------------------
// Structural fragments. These carry no value and are pure SQL text; every VALUE in this statement
// travels as a positional `?`.
// ---------------------------------------------------------------------------

/** The `WHERE` keyword line of a `UNION` branch. */
const BRANCH_WHERE_KEYWORD = '    WHERE';

/** The `AND` separator between two predicates, at the depth the source uses. */
const BRANCH_PREDICATE_SEPARATOR = '\n      AND\n';

/**
 * The `UNION` keyword between two branches. Sits one indentation level to the LEFT of the `SELECT`
 * it separates, which is how the source writes it [model/dao/PromotionDAO.cfc:L363].
 */
const BRANCH_UNION_SEPARATOR = '\n  UNION\n';

/**
 * The optional product predicate, appended to a branch's `WHERE` when `productID` is present.
 *
 * Translates [model/dao/PromotionDAO.cfc:L360-L361] and its five siblings. One bound placeholder,
 * never an interpolated value.
 */
const BRANCH_PRODUCT_ID_PREDICATE = '        SwSku.productID = ?';

/**
 * The value bound to the active-flag placeholder in the preliminary query. Supplied by this module
 * rather than by the caller, because it is a constant in the source:
 * [model/dao/PromotionDAO.cfc:L321] writes `<cfqueryparam cfsqltype="cf_sql_bit" value="1">` with
 * no argument behind it.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L321]: activeFlag is bound here as cf_sql_bit, while the
 * HQL at [model/dao/PromotionDAO.cfc:L118] and [model/dao/PriceGroupDAO.cfc:L95] binds a numeric 1.
 * The matched row set is identical in MySQL, where BIT and TINYINT(1) both compare equal to 1; each
 * site keeps its own legacy binding shape and the inconsistency is recorded, not harmonised.
 */
const PROMOTION_ACTIVE_FLAG = 1;

/**
 * The reward types the `global` branch admits, held as the legacy comma-list verbatim.
 *
 * Kept as the LIST the source writes rather than as an array literal, because the source writes a
 * list: [model/dao/PromotionDAO.cfc:L525] passes
 *   `value="merchandise,subscription,contentAccess" list="true"`
 * to a single `<cfqueryparam>`, and `listToArray` is the boundary converter that turns it into one
 * bound value per element.
 *
 * These three are a SUBSET of the valid reward types, not the whole set: the component declares
 * five (merchandise, subscription, contentAccess, fulfillment and order, at
 * [model/entity/PromotionReward.cfc:L50-L54]), and this statement admits the first three. The last
 * two are deliberately absent, and none is added.
 */
const GLOBAL_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess';

/**
 * The product-type identifier column tested for membership in the materialized path.
 *
 * AN IDENTIFIER, NOT AN EXPRESSION, and it is the SEARCHED-FOR id rather than the path:
 * [model/dao/PromotionDAO.cfc:L483] reads `SwProductType.productTypeIDPath LIKE concat('%',
 * SwPromoRewardProductType.productTypeID, '%')`, so the path column is the left operand of the
 * `LIKE` and this constant is what the pattern wraps. `../dialect.js` validates it as a
 * dot-qualified identifier and composes the `concat(...)` itself.
 */
const REWARD_PRODUCT_TYPE_ID_COLUMN = 'SwPromoRewardProductType.productTypeID';

// ---------------------------------------------------------------------------
// CTE 1 - `noQualifierCurrentActivePromotionPeriods`, the preliminary query, and the whole reason
// these rows are "sale prices" rather than conditional discounts: it admits only currently-active
// periods on active promotions carrying NEITHER a qualifier NOR a promotion code.
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PromotionDAO.cfc:L317-L537]: every date-boundary test here is INCLUSIVE
// (<= / >=) - the seven pairs are L317/L319, L356/L358, L387/L389, L420/L422, L453/L455, L494/L496
// and L535/L537 - whereas getActivePromotionRewards uses EXCLUSIVE (< / >) at [L73] and [L75]. Both
// forms are preserved. The two null-tolerant parenthesised disjunctions are reproduced exactly,
// lower-case `is null` and lower-case `or` included; neither becomes a COALESCE.
//
// CFML parity [model/dao/PromotionDAO.cfc:L323,L325]: `SwPromoQual` is the physical table of the
// PromotionQualifier entity [model/entity/PromotionQualifier.cfc:L49] and is correct as written -
// it is not expanded to `SwPromotionQualifier`. `NOT EXISTS(` is emitted with no space before the
// parenthesis, as the source writes it.
//
// CFML parity [model/dao/PromotionDAO.cfc:L307,L328-L330]: the legacy local
// `salePromotionPeriodIDs` is built by the <cfloop> at L328-L330 via listAppend and then never
// read. It is not declared in the target, because `noUnusedLocals` would reject it; its absence
// changes no behavior. The pre-QUERY itself is NOT dead - CTE 3 consumes it
// [model/dao/PromotionDAO.cfc:L556,L558].
//
// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L303,L309]: `var noQualifierPromotionPeriods` is
// declared and never assigned or read, because the actual pre-query at L309 is named
// `noQualifierCurrentActivePromotionPeriods` - a different identifier. The L303 local is therefore
// dead AND the L309 query name is un-var'd, leaking into the component variables scope.
// Unobservable in this module, which holds no runtime state at all.
//
// Preserved deliberately; do not fix without a product decision.
//
// JUDGMENT CALL: the folder specification records ONE dead local here (`salePromotionPeriodIDs`).
// Reading [model/dao/PromotionDAO.cfc:L301-L309] surfaced a SECOND - `noQualifierPromotionPeriods`
// at L303, never even assigned - so both are documented rather than only the one that was named.
/**
 * The preliminary query [model/dao/PromotionDAO.cfc:L309-L326], as CTE 1.
 *
 * Three placeholders, bound in this order: the instant [L317], the same instant again [L319], and
 * the active flag [L321]. The two `NOT EXISTS` exclusions at [L353] and [L355] bind nothing.
 */
const NO_QUALIFIER_CURRENT_ACTIVE_PROMOTION_PERIODS_CTE = `WITH noQualifierCurrentActivePromotionPeriods AS (
    SELECT
        promotionPeriodID
    FROM
        SwPromotionPeriod
      INNER JOIN
        SwPromotion on SwPromotionPeriod.promotionID = SwPromotion.promotionID
    WHERE
        (SwPromotionPeriod.startDateTime is null or SwPromotionPeriod.startDateTime <= ?)
      AND
        (SwPromotionPeriod.endDateTime is null or SwPromotionPeriod.endDateTime >= ?)
      AND
        SwPromotion.activeFlag = ?
      AND
        NOT EXISTS(SELECT promotionPeriodID FROM SwPromoQual WHERE SwPromoQual.promotionPeriodID = SwPromotionPeriod.promotionPeriodID)
      AND
        NOT EXISTS(SELECT promotionID FROM SwPromotionCode WHERE SwPromotionCode.promotionID = SwPromotion.promotionID)
),
allDiscounts AS (
`;

// ---------------------------------------------------------------------------
// CTE 2 - `allDiscounts`, the six-branch UNION. Six branches, in source order, resolving a sale
// price at SKU, product, brand, option, product-type and global level. There is NO `category`
// branch: sale-price rewards are never resolved at category level here, and none is added.
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PromotionDAO.cfc:L363,L394,L427,L460,L501]: the five separators are plain
// `UNION`, which DEDUPLICATES across branches. That deduplication is load-bearing twice over - it
// changes the row set feeding MIN(salePrice) in CTE 4 and the join-back in the final SELECT - so
// `UNION ALL` is forbidden here.
//
// CFML parity [model/dao/PromotionDAO.cfc:L338-L342]: the CASE has NO `ELSE` arm in any of the six
// branches, so any amountType outside 'amount', 'amountOff' and 'percentageOff' yields SQL NULL for
// salePrice. That NULL is not papered over: no ELSE 0, no ELSE NULL "for clarity", no COALESCE or
// IFNULL downstream, and the WHEN arms are not reordered. The consequence is deliberate - SQL MIN()
// ignores NULL, so a NULL-salePrice row is skipped by the aggregate in CTE 4 yet still EXISTS in
// CTE 3, and such rows are not filtered out. A NULL reward amount propagates the same way:
// `PromotionReward.amount` is big_decimal with NO default [model/entity/PromotionReward.cfc:L61],
// unlike `Sku.price` which declares default="0" [model/entity/Sku.cfc:L56].
//
// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L343,L551,L578]: roundingRuleID is projected through
// every branch and both surviving query-of-queries steps, but no rounding rule is ever applied to
// the computed salePrice. No join to SwRoundingRule exists and none is added.
//
// Preserved deliberately; do not fix without a product decision.
//
// JUDGMENT CALL: the CASE arithmetic and MIN(salePrice) are computed by MySQL, not by TypeScript,
// and that does not violate E4's single-arithmetic-surface rule: no floating-point operation on a
// monetary value occurs in TypeScript here. The DECIMAL result is read out of mysql2 as a string
// and converted to Money by mysqlPromotionRepository.ts. The expression is reproduced exactly - the
// parenthesisation stands, the literal 100 stays 100 and is not rewritten as multiplication by
// 0.01, and no ROUND or CAST is introduced to settle a scale question.
//
// JUDGMENT CALL: the level literal and the two aliases are interpolated into the SQL TEXT, which is
// structural rather than a bound value. All three come from the module-private descriptor table
// below: `discountLevel` is typed by a closed six-member union, so the compiler admits only the six
// legacy tokens, and the aliases are module constants. NO CHARACTER OF ANY CALLER-SUPPLIED VALUE
// EVER REACHES THE SQL TEXT - the only caller inputs are `now` and `productID`, and both travel
// exclusively as bound `?` placeholders.
/**
 * The nine-column projection shared by all six branches, ported from
 * [model/dao/PromotionDAO.cfc:L333-L346] and character-identical in the other five apart from the
 * level literal and the two aliases: product [L364-L377], brand [L395-L408], option [L428-L441],
 * product type [L461-L474] and global [L502-L515].
 *
 * Nine columns, in this order, each with its explicit `as` alias: skuID, originalPrice,
 * discountLevel, salePriceDiscountType, the `CASE`-computed salePrice, roundingRuleID,
 * salePriceExpirationDateTime, promotionPeriodID and promotionID. The order does not vary, no `as`
 * is dropped and no tenth column is added. Describing the projection once rather than as six
 * near-copies is what makes the uniformity the source has mechanically verifiable instead of
 * something a reviewer has to diff by eye.
 *
 * @param branch - the branch whose level literal and aliases are emitted.
 * @returns the `SELECT` keyword line and the nine projected columns.
 */
function discountBranchProjection(branch: DiscountBranch): string {
  const { discountLevel, rewardAlias, periodAlias } = branch;

  return `    SELECT
        SwSku.skuID as skuID,
        SwSku.price as originalPrice,
        '${discountLevel}' as discountLevel,
        ${rewardAlias}.amountType as salePriceDiscountType,
        CASE ${rewardAlias}.amountType
            WHEN 'amount' THEN ${rewardAlias}.amount
            WHEN 'amountOff' THEN SwSku.price - ${rewardAlias}.amount
            WHEN 'percentageOff' THEN SwSku.price - (SwSku.price * (${rewardAlias}.amount / 100))
        END as salePrice,
        ${rewardAlias}.roundingRuleID as roundingRuleID,
        ${periodAlias}.endDateTime as salePriceExpirationDateTime,
        ${periodAlias}.promotionPeriodID as promotionPeriodID,
        ${periodAlias}.promotionID as promotionID`;
}

/**
 * The pair of null-tolerant date predicates shared by all six branches, ported from
 * [model/dao/PromotionDAO.cfc:L356-L358] and identical in the other five apart from the alias
 * [L387-L389, L420-L422, L453-L455, L494-L496, L535-L537].
 *
 * Two placeholders, and they are the SECOND and THIRD-from-last binds of a branch rather than the
 * first: in the global branch three reward-type binds precede them.
 *
 * @param periodAlias - the promotion-period alias this branch reads.
 * @returns the two predicates, as separate entries for the `AND` join.
 */
function discountBranchDatePredicates(periodAlias: string): readonly string[] {
  return [
    `        (${periodAlias}.startDateTime is null or ${periodAlias}.startDateTime <= ?)`,
    `        (${periodAlias}.endDateTime is null or ${periodAlias}.endDateTime >= ?)`,
  ];
}

// CFML parity [model/dao/PromotionDAO.cfc:L359,L390,L423,L456,L497,L538]: the productID guard is
// structKeyExists() with NO len()/trim() check, so a PRESENT-but-empty productID still binds
// `SwSku.productID = ''` in all six branches and yields zero rows. Presence is tested with the `in`
// operator - not `!== undefined` - because `structKeyExists` tests key presence, not value
// emptiness. There are SIX separate guards because each branch carries its own WHERE clause, so a
// present productID produces six clauses and six binds. No length guard, trim or early return.
/**
 * One branch's complete `WHERE` clause.
 *
 * Predicate ORDER is the source's own and is load-bearing for the bind census: a branch's leading
 * predicates come first (only the global branch has any), then the date pair, then the optional
 * product predicate. In the global branch the four `NOT EXISTS` exclusions sit between the
 * reward-type membership test and the date pair and carry no binds at all, which is why the three
 * reward-type values precede the two timestamps in `params`.
 *
 * @param branch - the branch whose predicates are emitted.
 * @param includeProductID - whether the caller supplied a product identifier.
 * @returns the `WHERE` keyword line and every predicate, `AND`-separated.
 */
function discountBranchWhereClause(branch: DiscountBranch, includeProductID: boolean): string {
  const predicates = [
    ...branch.leadingPredicates,
    ...discountBranchDatePredicates(branch.periodAlias),
  ];

  if (includeProductID) {
    predicates.push(BRANCH_PRODUCT_ID_PREDICATE);
  }

  return `${BRANCH_WHERE_KEYWORD}\n${predicates.join(BRANCH_PREDICATE_SEPARATOR)}`;
}

// CFML parity [model/dao/PromotionDAO.cfc:L520-L521]: `CROSS JOIN SwPromoReward prGlobal` sits
// BETWEEN two INNER JOINs and correctly carries no ON clause. MySQL permits that mixed ordering and
// the join is emitted at exactly that position: not hoisted to the head of the join list, not
// converted to `INNER JOIN ... ON 1=1`, not given an ON clause. The cross product against every
// reward row is what makes the four NOT EXISTS exclusions the ONLY mechanism narrowing the reward
// set - which is what gives the omission recorded below its consequence.

// CFML parity [model/dao/PromotionDAO.cfc:L518-L519]: this INNER JOIN to SwProduct is never
// referenced by any column in the 'global' branch, yet it is load-bearing - it excludes SKUs whose
// parent product row does not exist. Deliberately unreferenced; do not remove it.

// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L527-L533]: the 'global' branch's NOT EXISTS set covers
// four SwPromoReward* link tables and omits SwPromoRewardSku, so a reward with SKU-level inclusions
// can still surface as global.
//
// Preserved deliberately; do not fix without a product decision.

// CFML parity [model/dao/PromotionDAO.cfc:L525]: cfqueryparam list="true" expands a comma-list into
// one bound parameter per element. The legacy literal is retained verbatim and expanded with CFML
// listToArray semantics, so the emitted SQL carries three placeholders and params three values in
// token order. `String.prototype.split` is deliberately not used - its empty-token and delimiter
// handling differs from CFML's - and the placeholder group is derived from the SAME array that
// supplies the values, so text and binds cannot drift apart.

// CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the productTypeIDPath containment test is a
// THREE-ARM dialect branch inside a join's ON clause - concat() for MySQL at L483, `||` for
// Oracle10g at L485, `+` for everything else at L487. Only the MySQL arm is targeted, and WHICH arm
// is delegated entirely to `../dialect.js`; the `getApplicationValue("databaseType") eq "MySQL"`
// comparison is never re-implemented here. That matters because the source spells the product name
// three ways across the tree - "MySQL" at [model/dao/PromotionDAO.cfc:L482] and in
// [config/configORM.cfm], "mySQL" at [model/dao/PriceGroupDAO.cfc:L57] and
// [model/dao/ProductDAO.cfc:L288], "mySql" at [model/dao/ProductDAO.cfc:L304] - which is why the
// dialect module folds case and owns the comparison. No non-MySQL path is implemented.

// JUDGMENT CALL: this SQL-side containment test is an UNANCHORED substring LIKE, so it deliberately
// diverges in implementation from materializedIdPath.ts, which centralises the in-memory comma-list
// path walking. The two match in observable outcome for well-formed paths, but the unanchored LIKE
// can over-match a productTypeID that appears as a substring of another ID inside the path. That
// over-matching IS the legacy behaviour and is reproduced, not repaired. The house pattern is
// corroborated at [model/dao/PhysicalDAO.cfc:L121].

/*
 * The six-branch `UNION` [model/dao/PromotionDAO.cfc:L332-L542] is cited rather than transcribed,
 * because its shape is uniform and is encoded as data below: the nine-column projection identical
 * across all six branches [L333-L346, L364-L377, L395-L408, L428-L441, L461-L474, L502-L515], a
 * per-branch `FROM` and join chain, the null-tolerant date pair, and the optional productID
 * predicate. The six levels in source order are sku [L333-L362], product [L364-L393], brand
 * [L395-L426], option [L428-L459], productType [L461-L500] and global [L502-L541].
 *
 * Every non-obvious property of that text is recorded in the markers above with its own locator:
 * the plain `UNION`, the absent `ELSE` arm, the projected-but-unapplied roundingRuleID, the
 * product-type dialect branch, the global branch's mid-list `CROSS JOIN`, its deliberately
 * unreferenced `SwProduct` join, its four-of-five `NOT EXISTS` set and its `list="true"` expansion.
 */

/**
 * The six branches of the `UNION`, in source order.
 *
 * A FUNCTION rather than a module-level constant, and deliberately so: the product-type branch's
 * join chain embeds the dialect-selected `LIKE` pattern [model/dao/PromotionDAO.cfc:L482-L488], and
 * the dialect is resolved inside the builder body rather than at module load, which keeps this
 * module free of load-time work.
 *
 * @param productTypePathPattern - the dialect-composed pattern the `productTypeIDPath` column is
 *   tested against, supplied by `../dialect.js`.
 * @returns the six branch descriptors, in the order the source unions them.
 */
function discountBranches(productTypePathPattern: string): readonly DiscountBranch[] {
  // The three reward types the global branch admits, and the placeholder group that binds them.
  // Both come from the SAME array, so the emitted `?` count and the bound value count cannot
  // disagree.
  const globalRewardTypes = listToArray(GLOBAL_REWARD_TYPE_LIST);
  const globalRewardTypePlaceholders = globalRewardTypes.map(() => '?').join(', ');

  return [
    {
      // model/dao/PromotionDAO.cfc:L333-L362
      discountLevel: 'sku',
      rewardAlias: 'prSku',
      periodAlias: 'ppSku',
      fromClause: `    FROM
        SwSku
      INNER JOIN
        SwPromoRewardSku on SwPromoRewardSku.skuID = SwSku.skuID
      INNER JOIN
        SwPromoReward prSku on prSku.promotionRewardID = SwPromoRewardSku.promotionRewardID
      INNER JOIN
        SwPromotionPeriod ppSku on ppSku.promotionPeriodID = prSku.promotionPeriodID`,
      leadingPredicates: [],
      leadingBindValues: [],
    },
    {
      // model/dao/PromotionDAO.cfc:L364-L393
      discountLevel: 'product',
      rewardAlias: 'prProduct',
      periodAlias: 'ppProduct',
      fromClause: `    FROM
        SwSku
      INNER JOIN
        SwPromoRewardProduct on SwPromoRewardProduct.productID = SwSku.productID
      INNER JOIN
        SwPromoReward prProduct on prProduct.promotionRewardID = SwPromoRewardProduct.promotionRewardID
      INNER JOIN
        SwPromotionPeriod ppProduct on ppProduct.promotionPeriodID = prProduct.promotionPeriodID`,
      leadingPredicates: [],
      leadingBindValues: [],
    },
    {
      // model/dao/PromotionDAO.cfc:L395-L426. `SwProduct` IS referenced here - `SwProduct.brandID`
      // feeds the very next join - so unlike the global branch's join to the same table, this one
      // is not an unreferenced join.
      discountLevel: 'brand',
      rewardAlias: 'prBrand',
      periodAlias: 'ppBrand',
      fromClause: `    FROM
        SwSku
      INNER JOIN
        SwProduct on SwProduct.productID = SwSku.productID
      INNER JOIN
        SwPromoRewardBrand on SwPromoRewardBrand.brandID = SwProduct.brandID
      INNER JOIN
        SwPromoReward prBrand on prBrand.promotionRewardID = SwPromoRewardBrand.promotionRewardID
      INNER JOIN
        SwPromotionPeriod ppBrand on ppBrand.promotionPeriodID = prBrand.promotionPeriodID`,
      leadingPredicates: [],
      leadingBindValues: [],
    },
    {
      // model/dao/PromotionDAO.cfc:L428-L459. The join through `SwSkuOption` is an INNER JOIN, so
      // this branch EXCLUDES SKUs that carry no options at all. That exclusion is load-bearing: no
      // join here is widened to a LEFT JOIN.
      discountLevel: 'option',
      rewardAlias: 'prOption',
      periodAlias: 'ppOption',
      fromClause: `    FROM
        SwSku
      INNER JOIN
        SwSkuOption on SwSkuOption.skuID = SwSku.skuID
      INNER JOIN
        SwPromoRewardOption on SwPromoRewardOption.optionID = SwSkuOption.optionID
      INNER JOIN
        SwPromoReward prOption on prOption.promotionRewardID = SwPromoRewardOption.promotionRewardID
      INNER JOIN
        SwPromotionPeriod ppOption on ppOption.promotionPeriodID = prOption.promotionPeriodID`,
      leadingPredicates: [],
      leadingBindValues: [],
    },
    {
      // model/dao/PromotionDAO.cfc:L461-L500. `SwProduct` IS referenced here too -
      // `SwProduct.productTypeID` feeds the next join. The fourth join carries the dialect-selected
      // pattern; see the markers above.
      discountLevel: 'productType',
      rewardAlias: 'prProductType',
      periodAlias: 'ppProductType',
      fromClause: `    FROM
        SwSku
      INNER JOIN
        SwProduct on SwProduct.productID = SwSku.productID
      INNER JOIN
        SwProductType on SwProduct.productTypeID = SwProductType.productTypeID
      INNER JOIN
        SwPromoRewardProductType on SwProductType.productTypeIDPath LIKE ${productTypePathPattern}
      INNER JOIN
        SwPromoReward prProductType on prProductType.promotionRewardID = SwPromoRewardProductType.promotionRewardID
      INNER JOIN
        SwPromotionPeriod ppProductType on ppProductType.promotionPeriodID = prProductType.promotionPeriodID`,
      leadingPredicates: [],
      leadingBindValues: [],
    },
    {
      // model/dao/PromotionDAO.cfc:L502-L541. The only branch with leading predicates: the
      // reward-type membership test [L525] followed by the four NOT EXISTS exclusions [L527, L529,
      // L531, L533], in source order. There are FOUR, never five - see the LEGACY-DEFECT marker
      // above.
      discountLevel: 'global',
      rewardAlias: 'prGlobal',
      periodAlias: 'ppGlobal',
      fromClause: `    FROM
        SwSku
      INNER JOIN
        SwProduct on SwProduct.productID = SwSku.productID
      CROSS JOIN
        SwPromoReward prGlobal
      INNER JOIN
        SwPromotionPeriod ppGlobal on prGlobal.promotionPeriodID = ppGlobal.promotionPeriodID`,
      leadingPredicates: [
        `        prGlobal.rewardType IN (${globalRewardTypePlaceholders})`,
        '        NOT EXISTS(SELECT promotionRewardID FROM SwPromoRewardProduct WHERE SwPromoRewardProduct.promotionRewardID = prGlobal.promotionRewardID)',
        '        NOT EXISTS(SELECT promotionRewardID FROM SwPromoRewardBrand WHERE SwPromoRewardBrand.promotionRewardID = prGlobal.promotionRewardID)',
        '        NOT EXISTS(SELECT promotionRewardID FROM SwPromoRewardOption WHERE SwPromoRewardOption.promotionRewardID = prGlobal.promotionRewardID)',
        '        NOT EXISTS(SELECT promotionRewardID FROM SwPromoRewardProductType WHERE SwPromoRewardProductType.promotionRewardID = prGlobal.promotionRewardID)',
      ],
      leadingBindValues: globalRewardTypes,
    },
  ];
}

// ---------------------------------------------------------------------------
// CTE 3 - `noQualifierDiscounts`, and CTE 4 - `skuPrice`: the first two of the three chained
// in-engine steps. CTE 3 is where CTE 1 is consumed, keeping only those discount rows whose
// promotion period is one of the no-qualifier, no-code, currently-active periods.
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PromotionDAO.cfc:L545,L555-L558]: the `SELECT DISTINCT` is the source's
// own and is kept - the six-branch UNION can present the same nine-column row through more than one
// level, and removing the DISTINCT would change the row set feeding MIN(salePrice). The
//   `FROM a, b WHERE a.x = b.x`
// comma join is reproduced as written rather than rewritten as an explicit
//   `INNER JOIN ... ON`:
// the two forms mean the same thing, and rewriting it would break the line-for-line diff against
// the legacy body below.
//
// CFML parity [model/dao/PromotionDAO.cfc:L562-L568]: CTE 4 carries NO `DISTINCT` (only CTE 3 does)
// and SQL MIN() IGNORES NULL. A row whose CASE fell through to NULL [L338-L342] is therefore
// skipped by this aggregate while still EXISTING in CTE 3. Such rows are neither filtered out of
// CTE 3 nor coalesced into a number here.
/**
 * The two intermediate steps, as CTE 3 and CTE 4.
 *
 * VERBATIM LEGACY SQL - model/dao/PromotionDAO.cfc:L544-L559, STEP 1:
 *
 *     <cfquery name="noQualifierDiscounts" dbtype="query">
 *         SELECT DISTINCT
 *             allDiscounts.skuID,
 *             allDiscounts.originalPrice,
 *             allDiscounts.discountLevel,
 *             allDiscounts.salePriceDiscountType,
 *             allDiscounts.salePrice,
 *             allDiscounts.roundingRuleID,
 *             allDiscounts.salePriceExpirationDateTime,
 *             allDiscounts.promotionPeriodID,
 *             allDiscounts.promotionID
 *         FROM
 *             allDiscounts, noQualifierCurrentActivePromotionPeriods
 *         WHERE
 *             allDiscounts.promotionPeriodID =
 *             noQualifierCurrentActivePromotionPeriods.promotionPeriodID
 *     </cfquery>
 *
 * VERBATIM LEGACY SQL - model/dao/PromotionDAO.cfc:L561-L569, STEP 2:
 *
 *     <cfquery name="skuPrice" dbtype="query">
 *         SELECT
 *             skuID,
 *             MIN(salePrice) as salePrice
 *         FROM
 *             noQualifierDiscounts
 *         GROUP BY
 *             skuID
 *     </cfquery>
 *
 * No placeholders: neither step binds a value.
 */
const NO_QUALIFIER_DISCOUNTS_AND_SKU_PRICE_CTES = `),
noQualifierDiscounts AS (
    SELECT DISTINCT
        allDiscounts.skuID,
        allDiscounts.originalPrice,
        allDiscounts.discountLevel,
        allDiscounts.salePriceDiscountType,
        allDiscounts.salePrice,
        allDiscounts.roundingRuleID,
        allDiscounts.salePriceExpirationDateTime,
        allDiscounts.promotionPeriodID,
        allDiscounts.promotionID
    FROM
        allDiscounts, noQualifierCurrentActivePromotionPeriods
    WHERE
        allDiscounts.promotionPeriodID = noQualifierCurrentActivePromotionPeriods.promotionPeriodID
),
skuPrice AS (
    SELECT
        skuID,
        MIN(salePrice) as salePrice
    FROM
        noQualifierDiscounts
    GROUP BY
        skuID
)
`;

// ---------------------------------------------------------------------------
// The final SELECT - STEP 3, the join-back. Recovers the winning row's own attributes by joining
// the grouped minimum back to the ungrouped rows on both the SKU and the price.
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PromotionDAO.cfc:L553,L572-L580]: STEP 1 projects nine columns including
// promotionPeriodID; STEP 3 projects eight and DROPS it. The narrowing is reproduced exactly - the
// column is carried through CTE 3 because CTE 3's own WHERE needs it, and is then absent from the
// final projection. It is neither carried through nor added back.
//
// CFML parity [model/dao/PromotionDAO.cfc:L571-L588]: the final step has no LIMIT, no ORDER BY and
// no DISTINCT, so two rewards tying on the minimum salePrice both survive as duplicate skuID rows.
// No tiebreaker is added.
//
// CFML parity [model/dao/PromotionDAO.cfc:L586]: the second predicate is joined by a LOWER-CASE
// `and`, where every other conjunction in this statement is upper-case `AND`. Preserved, not
// normalised.
/**
 * The outer `SELECT`, as STEP 3.
 *
 * VERBATIM LEGACY SQL - model/dao/PromotionDAO.cfc:L571-L588:
 *
 *     <cfquery name="skuResults" dbtype="query">
 *         SELECT
 *             noQualifierDiscounts.skuID,
 *             noQualifierDiscounts.originalPrice,
 *             noQualifierDiscounts.discountLevel,
 *             noQualifierDiscounts.salePriceDiscountType,
 *             noQualifierDiscounts.salePrice,
 *             noQualifierDiscounts.roundingRuleID,
 *             noQualifierDiscounts.salePriceExpirationDateTime,
 *             noQualifierDiscounts.promotionID
 *         FROM
 *             noQualifierDiscounts,
 *             skuPrice
 *         WHERE
 *             noQualifierDiscounts.skuID = skuPrice.skuID
 *           and
 *             noQualifierDiscounts.salePrice = skuPrice.salePrice
 *     </cfquery>
 *
 * `<cfreturn skuResults />` at [model/dao/PromotionDAO.cfc:L590] returns this as a CFML query
 * object rather than as entities, which is why the adapter's return contract is a row array and
 * this method carries no row-to-entity factory.
 *
 * No placeholders: the join-back binds no value.
 */
const SKU_RESULTS_SELECT = `SELECT
    noQualifierDiscounts.skuID,
    noQualifierDiscounts.originalPrice,
    noQualifierDiscounts.discountLevel,
    noQualifierDiscounts.salePriceDiscountType,
    noQualifierDiscounts.salePrice,
    noQualifierDiscounts.roundingRuleID,
    noQualifierDiscounts.salePriceExpirationDateTime,
    noQualifierDiscounts.promotionID
FROM
    noQualifierDiscounts,
    skuPrice
WHERE
    noQualifierDiscounts.skuID = skuPrice.skuID
  and
    noQualifierDiscounts.salePrice = skuPrice.salePrice`;

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

// JUDGMENT CALL: the three chained in-engine `dbtype="query"` steps
// [model/dao/PromotionDAO.cfc:L544-L559, L561-L569, L571-L588] are expressed as SQL common table
// expressions. Node has no query-of-queries equivalent - there is no in-process engine to hand a
// result set back to for a second pass - so the only way to compute the same result is to compute
// it in the database, which MySQL 8.0 supports through `WITH`. That is the whole of the rationale:
// a mechanical necessity of the target runtime, and no other property is claimed for it. The four
// derived-result names are preserved verbatim as the CTE names -
// `noQualifierCurrentActivePromotionPeriods`, `allDiscounts`, `noQualifierDiscounts`, `skuPrice` -
// so the CTE form and the legacy chain stay diffable name for name.

// JUDGMENT CALL: `now` is an input rather than an internally-captured clock read. The legacy
// captures `var timeNow = now()` ONCE at [model/dao/PromotionDAO.cfc:L306] and reuses it at all
// fourteen timestamp positions, so binding one supplied value fourteen times is faithful. Keeping
// the read outside this module preserves purity, so the emitted SQL and params are deterministic
// and testable without a live MySQL.

// JUDGMENT CALL: the inline-versus-bound split in the emitted SQL is exactly the legacy's own
// split, not a judgement about what is safe to interpolate. INLINE, because the source writes them
// inline and two of the three would be semantically wrong as parameters: the six `discountLevel`
// branch constants [L336, L367, L398, L431, L464, L505], which label the branch rather than filter
// it; the three `CASE ... WHEN` discriminators; and the literal `100` in the percentageOff arm.
// BOUND, because the source binds them: the fourteen timestamps, the single activeFlag `1`, the
// three `rewardType` tokens and the six `productID` values. Nothing is over-bound to look more
// careful than the source, and nothing the source binds is inlined. The E5 exception documented
// elsewhere in the slice - [model/dao/ProductDAO.cfc:L64-L69], which binds a joined comma STRING as
// a single parameter - is NOT cross-applied here; the reward-type list is bound per element.

// JUDGMENT CALL: presence is tested with `'productID' in input` rather than
//   `input.productID !== undefined`,
// because `structKeyExists(arguments, "productID")` [L359, L390, L423, L456, L497, L538] is a
// KEY-PRESENCE test and `exactOptionalPropertyTypes` is what makes the two distinguishable in
// TypeScript at all. The boolean and the bound value are both derived from that one test, so a
// branch can never emit the predicate without the value or vice versa.

// JUDGMENT CALL: every table name in this statement is already a correct physical Sw* name, so the
// Slatwall*-in-raw-SQL naming correction does NOT apply here. That correction is confined to three
// adapter methods ([model/dao/ProductTypeDAO.cfc:L53-L54], [model/dao/SkuDAO.cfc:L131-L138],
// [model/dao/ProductDAO.cfc:L420-L427]). This statement also contains no HQL at all, so there is no
// entity-to-table translation to perform anywhere in this file.
/**
 * Builds the sale-price promotion-reward statement.
 *
 * Reproduces `getSalePricePromotionRewardsQuery` [model/dao/PromotionDAO.cfc:L298-L591] as a single
 * MySQL statement: four common table expressions and an outer `SELECT`, in place of a preliminary
 * query, a six-branch `UNION` and three chained in-engine query-of-queries steps.
 *
 * The result set is the eight columns of [model/dao/PromotionDAO.cfc:L572-L580], one row per SKU
 * per reward that ties the minimum sale price for that SKU. Ties are not broken and
 * `roundingRuleID` is projected without being applied; both are the legacy's behaviour and both are
 * recorded above.
 *
 * A row whose `CASE` fell through to SQL NULL [L338-L342] survives into CTE 3 and is skipped by
 * `MIN` in CTE 4, but it cannot reach this result set: the join-back compares
 * `noQualifierDiscounts.salePrice = skuPrice.salePrice` [L587], and equality against NULL is
 * UNKNOWN rather than true. That is why `salePrice` is a required member of the adapter's row
 * contract even though the projection computing it has no `ELSE` arm - a consequence of the
 * legacy's shape, not a guard added here.
 *
 * Pure and synchronous: opens nothing, executes nothing, reads no clock and no configuration beyond
 * the dialect, and returns a frozen, inspectable pair. The placeholder count is a function of the
 * input alone - 18 when `productID` is absent (three in CTE 1, two in each of the six branches, and
 * three more for the reward types in the global branch) and 24 when it is present. `params` always
 * holds exactly one value per `?`, in the order the placeholders appear.
 *
 * @param input - the instant every date predicate is compared against, and optionally a product
 *   identifier narrowing every branch.
 * @returns the statement text and the values to bind to it, in placeholder order.
 */
export function buildSalePricePromotionRewardsStatement(
  input: SalePricePromotionRewardsInput,
): SalePricePromotionRewardsStatement {
  // Key presence, not value definedness. See the note above.
  const productIDIsPresent = 'productID' in input;

  // Resolved HERE rather than at module load, so importing this module does no work and reads no
  // environment. `../dialect.js` owns the databaseType comparison and composes the pattern for the
  // arm it selects.
  const productTypePathPattern = materializedIdPathLikePatternFragment(
    resolveConfiguredDialect(),
    REWARD_PRODUCT_TYPE_ID_COLUMN,
  );

  // CTE 1's three binds, in its own clause order: the instant, the same instant again [L317, L319],
  // then the active flag [L321].
  const params: BindValue[] = [input.now, input.now, PROMOTION_ACTIVE_FLAG];

  const branchStatements: string[] = [];

  for (const branch of discountBranches(productTypePathPattern)) {
    branchStatements.push(
      [
        discountBranchProjection(branch),
        branch.fromClause,
        discountBranchWhereClause(branch, productIDIsPresent),
      ].join('\n'),
    );

    // Text and binds move together, in the branch's own predicate order: the leading predicates
    // first - which for the global branch means the three reward types [L525], the four NOT EXISTS
    // exclusions in between binding nothing at all - then the date pair, then the optional product
    // identifier.
    params.push(...branch.leadingBindValues, input.now, input.now);

    if (productIDIsPresent) {
      params.push(input.productID);
    }
  }

  // CTE 1 opens the `WITH` and leaves `allDiscounts AS (` open; the six branches fill it; CTE 3
  // closes it and adds itself and CTE 4; the outer SELECT closes the statement. The lone newline is
  // the line break between the last branch's final predicate and the `),` that closes
  // `allDiscounts`.
  const sql =
    NO_QUALIFIER_CURRENT_ACTIVE_PROMOTION_PERIODS_CTE +
    branchStatements.join(BRANCH_UNION_SEPARATOR) +
    '\n' +
    NO_QUALIFIER_DISCOUNTS_AND_SKU_PRICE_CTES +
    SKU_RESULTS_SELECT;

  // Frozen at both levels. The `readonly` types are a compile-time claim that erases at emit, and
  // these elements do not mean the same thing as one another - a runtime reorder would bind a
  // timestamp where a product identifier belongs.
  return Object.freeze({ sql, params: Object.freeze(params) });
}
