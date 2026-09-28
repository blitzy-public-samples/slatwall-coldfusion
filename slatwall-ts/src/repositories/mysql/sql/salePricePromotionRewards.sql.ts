// The sale-price promotion-reward statement.
//
// The four derived-result names are carried over verbatim as the CTE names so the diff reads name
// for name.
//
// Removed `DISTINCT`, tiebreaker, `COALESCE`, `IFNULL`, `ELSE` arm, `ROUND`, `CAST`, index hint,
// `FIND_IN_SET` in place of the unanchored `LIKE`, `UNION ALL` in place of `UNION`, outer join,
// fifth `NOT EXISTS`, join to `SwRoundingRule`, null guard, emptiness check.
//
// The emitted text preserves what carries meaning - line structure, clause order, alias names and
// keyword case, including the source's own case inconsistencies.

import type { DatabaseDialect } from '../dialect.js';
import { materializedIdPathLikePatternFragment } from '../dialect.js';
import { listToArray } from '../../../lib/cfml/list.js';

type BindValue = string | number | Date;

/**
 * The builder's input.
 *
 * `productID` is OPTIONAL, and its optionality is load-bearing: [model/dao/PromotionDAO.cfc:L299]
 * declares it with no `required` attribute and no default.
 *
 * Not exported: this module exposes exactly one unit, the builder.
 */
interface SalePricePromotionRewardsInput {
  readonly now: Date;

  /**
   * The ALREADY-RESOLVED database dialect, used for one purpose only: selecting the
   * `productTypeIDPath` containment pattern through `materializedIdPathLikePatternFragment`
   * [model/dao/PromotionDAO.cfc:L482-L488].
   *
   * Revision called `resolveConfiguredDialect()` inside the builder body, which reads
   * `appConfig.load()` and therefore the process `DB_*` environment at REQUEST TIME - so building
   * a statement was a configuration read.
   */
  readonly dialect: DatabaseDialect;

  /**
   * Optional product narrowing, applied to every branch. Omit it for every product.
   *
   * A PRESENT but empty string is a real, reachable case and is not intercepted: it binds
   * `SwSku.productID = ''` in all six branches and returns no rows, exactly as the legacy does.
   *
   * IT ADMITS A SET AS WELL AS A SINGLE IDENTIFIER, AND THE SINGLE-IDENTIFIER EMISSION IS
   * BYTE-IDENTICAL TO WHAT IT ALWAYS WAS. `[model/dao/PromotionDAO.cfc:L299]` declares one optional
   * `productID` and its six `structKeyExists` guards each emit `SwSku.productID = ?`; a `string`, or a
   * one-element array, still emits exactly that text with exactly that bind. An array of two or more
   * emits `SwSku.productID in (?, ?, ...)` in the same six positions, with one bind per member per
   * branch.
   *
   * JUDGMENT CALL [model/dao/PromotionDAO.cfc:L299]: the set form has no legacy counterpart and is
   * admitted on a proved equivalence rather than on a preference. Issuing this statement once per
   * distinct product makes its count grow with the item count, which AAP T3 makes this boundary's own
   * decision to state rather than to inherit, and AAP 0.4.3 names this statement as the one whose
   * reduction moved into SQL for exactly that reason.
   *
   * WHAT MAKES A SET SAFE IS THAT THE REDUCTION DOES NOT MIX PRODUCTS.
   * `noQualifierCurrentActivePromotionPeriods` does not read `SwSku` at all; every branch's product
   * predicate is a per-ROW filter on `SwSku.productID`, so the union over a set is the union of the
   * six-branch results the members produce one at a time; and `noQualifierDiscounts` is a `DISTINCT`
   * row-wise projection joined to CTE 1 row-wise.
   *
   * `skuPrice` groups by `skuID` ALONE - and `SwSku.productID` is single-valued per SKU, so every row
   * bearing one `skuID` came through one product's filter. The group for a SKU is therefore the same
   * whether the filter named that SKU's product alone or any superset of it, and so is
   * `MIN(salePrice)`. The final join-back matches on `skuID` and `salePrice`, row-wise again.
   *
   * So a batched result set is exactly the union of the per-product result sets, per SKU, and a caller
   * holding the product-to-SKU mapping recovers each product's rows unchanged. That mapping stays
   * OUTSIDE this statement: section 4.3 of this module's contract forbids a tenth column, so no owning
   * identifier is projected to make the partition self-describing, and the caller that already holds
   * the mapping does the partitioning. See `../mysqlPromotionRepository.ts`, which will not use a
   * batched result it cannot partition completely.
   *
   * ⚠ AN EMPTY ARRAY IS REFUSED, because it has no honest emission. Absence means "every product"
   * and an empty string means "a product whose identifier is empty"; a caller narrowing to NO
   * product is asking for something the legacy has no shape for, and both `in ()` - invalid SQL -
   * and a fabricated `= ''` bind would answer a question that was not asked. It raises instead.
   */
  readonly productID?: string | readonly string[];
}

interface SalePricePromotionRewardsStatement {
  readonly sql: string;

  /**
   * The values to bind, in the order their placeholders appear in `sql`.
   *
   * An open array rather than a fixed tuple, because the arity is genuinely variable: 18
   * placeholders when `productID` is absent and 24 when it is present.
   *
   * Frozen at construction as well as typed `readonly`: the type erases at emit, and these
   * elements do not mean the same thing as each other.
   */
  readonly params: readonly BindValue[];
}

/**
 * One branch of the six-branch `UNION`.
 *
 * The six share an identical nine-column projection and an identical pair of date predicates,
 * differing only in the level literal they emit, the two aliases they read those columns through.
 */
interface DiscountBranch {
  readonly discountLevel: 'sku' | 'product' | 'brand' | 'option' | 'productType' | 'global';

  readonly rewardAlias: string;

  readonly periodAlias: string;

  readonly fromClause: string;

  readonly leadingPredicates: readonly string[];

  readonly leadingBindValues: readonly BindValue[];
}

const BRANCH_WHERE_KEYWORD = '    WHERE';

const BRANCH_PREDICATE_SEPARATOR = '\n      AND\n';

const BRANCH_UNION_SEPARATOR = '\n  UNION\n';

/**
 * The optional product predicate, appended to a branch's `WHERE` when `productID` is present.
 */
const BRANCH_PRODUCT_ID_PREDICATE = '        SwSku.productID = ?';

/** The indent every branch predicate is written at, shared by the equality and membership forms. */
const BRANCH_PREDICATE_INDENT = '        ';

/**
 * The product predicate for a narrowing of `count` identifiers.
 *
 * ONE identifier renders {@link BRANCH_PRODUCT_ID_PREDICATE} verbatim, so a single-product call emits
 * the text it has always emitted and the committed bind census over it is unaffected. Two or more
 * render a membership test at the same indent, with one placeholder per identifier - never an
 * interpolated value, and never a placeholder count that is not exactly the identifier count.
 *
 * @param count - how many identifiers the caller is narrowing to; at least one.
 * @returns the predicate line.
 */
function branchProductIDPredicate(count: number): string {
  if (count === 1) {
    return BRANCH_PRODUCT_ID_PREDICATE;
  }

  return `${BRANCH_PREDICATE_INDENT}SwSku.productID in (${Array.from({ length: count }, (): string => '?').join(', ')})`;
}

/**
 * The narrowing identifiers a caller supplied, as an array, with the refusal for the one shape that
 * has no emission.
 *
 * A bare `string` - including `''` - is one identifier. An array is taken as given, in order, WITHOUT
 * de-duplication or folding: this module binds what it is handed, and collapsing two spellings of one
 * identifier is a decision about identity that belongs to the caller that knows the collation.
 *
 * @param narrowing - the value of the input's `productID` member, which is known to be present.
 * @returns the identifiers to bind, in order.
 * @throws Error when an empty array is supplied - see the member's own contract for why that shape is
 *   refused rather than approximated.
 */
function branchProductIDValues(narrowing: string | readonly string[]): readonly string[] {
  if (typeof narrowing === 'string') {
    return [narrowing];
  }

  if (narrowing.length === 0) {
    throw new Error(
      'buildSalePricePromotionRewardsStatement: productID was supplied as an EMPTY array, which ' +
        'has no faithful emission. Omit the member to narrow to no product at all (every product ' +
        'is then in scope, as [model/dao/PromotionDAO.cfc:L299] intends), or pass at least one ' +
        'identifier. A caller with no products to ask about must not issue this statement.',
    );
  }

  return narrowing;
}

/**
 * The value bound to the active-flag placeholder in the preliminary query.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L321]: activeFlag is bound here as cf_sql_bit, while the
 * HQL at [model/dao/PromotionDAO.cfc:L118] and [model/dao/PriceGroupDAO.cfc:L95] binds a numeric.
 */
const PROMOTION_ACTIVE_FLAG = 1;

/**
 * The reward types the `global` branch admits, held as the legacy comma-list verbatim.
 *
 * Kept as the LIST the source writes rather than as an array literal, because the source writes a
 * list: [model/dao/PromotionDAO.cfc:L525] passes
 * `value="merchandise,subscription,contentAccess" list="true"` to a single `<cfqueryparam>`.
 */
const GLOBAL_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess';

/**
 * The product-type identifier column tested for membership in the materialized path.
 *
 * An identifier, not an expression, and it is the searched-for id rather than the path:
 * [model/dao/PromotionDAO.cfc:L483] reads
 * `SwProductType.productTypeIDPath LIKE concat('%', SwPromoRewardProductType.productTypeID, '%')`.
 */
const REWARD_PRODUCT_TYPE_ID_COLUMN = 'SwPromoRewardProductType.productTypeID';

// CFML parity [model/dao/PromotionDAO.cfc:L317-L537]: every date-boundary test here is inclusive
// (<= / >=) - the seven pairs are L317/L319, L356/L358, L387/L389, L420/L422, L453/L455, L494/L496
// and L535/L537.
//
// CFML parity [model/dao/PromotionDAO.cfc:L323, L325]: `SwPromoQual` is the physical table of the
// PromotionQualifier entity [model/entity/PromotionQualifier.cfc:L49] and is correct as written -
// it is not expanded to `SwPromotionQualifier`.
//
// CFML parity [model/dao/PromotionDAO.cfc:L307, L328-L330]: the legacy local
// `salePromotionPeriodIDs` is built by the <cfloop> at L328-L330 via listAppend and then never
// read.
//
// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L303]: `var noQualifierPromotionPeriods` is declared
// and never assigned or read, because the actual pre-query at L309 is named
// `noQualifierCurrentActivePromotionPeriods` - a different identifier.
// Preserved deliberately; do not fix without a product decision.
/**
 * The preliminary query [model/dao/PromotionDAO.cfc:L309-L326], as CTE.
 *
 * Three placeholders, bound in this order: the instant [model/dao/PromotionDAO.cfc:L317], the same
 * instant again [model/dao/PromotionDAO.cfc:L319], and the active flag
 * [model/dao/PromotionDAO.cfc:L321].
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

// CTE 2 - `allDiscounts`, the six-branch UNION resolving a sale price at SKU, product, brand,
// option, product-type and global level, in source order.
//
// CFML parity [model/dao/PromotionDAO.cfc:L338-L342, L363]: the five separators are plain `UNION`,
// which deduplicates across branches, and the CASE has no `ELSE` arm, so an `amountType` outside the
// three named ones yields SQL NULL for the sale price.
//
// CFML parity [model/dao/PromotionDAO.cfc:L343, L551, L578]: `roundingRuleID` is projected through
// every branch and both reduction steps, and no statement here applies it - there is no join to
// `SwRoundingRule` and none is added.

// JUDGMENT CALL: the CASE arithmetic and `MIN(salePrice)` are computed by MySQL rather than in
// TypeScript, which keeps the single-arithmetic-surface rule intact - no floating-point operation on
// a monetary value happens in TypeScript here. The level literal and the two aliases are interpolated
// into the statement text because they are structural, not bound values.
/**
 * @param branch the branch whose level literal and aliases are emitted.
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
 * The pair of null-tolerant date predicates shared by all six branches.
 *
 * Two placeholders, and they are the SECOND and THIRD-from-last binds of a branch rather than the
 * first: in the global branch three reward-type binds precede them.
 *
 * @param periodAlias the promotion-period alias this branch reads.
 * @returns the two predicates, as separate entries for the `AND` join.
 */
function discountBranchDatePredicates(periodAlias: string): readonly string[] {
  return [
    `        (${periodAlias}.startDateTime is null or ${periodAlias}.startDateTime <= ?)`,
    `        (${periodAlias}.endDateTime is null or ${periodAlias}.endDateTime >= ?)`,
  ];
}

// CFML parity [model/dao/PromotionDAO.cfc:L359, L390, L423, L456, L497, L538]: the productID guard
// is structKeyExists() with no len()/trim() check, so a PRESENT-but-empty productID still binds
// `SwSku.productID = ''` in all six branches and yields zero rows.
/**
 * One branch's complete `WHERE` clause.
 *
 * Predicate ORDER is the source's own and is load-bearing for the bind census: a branch's leading
 * predicates come first (only the global branch has any), then the date pair.
 *
 * @param branch the branch whose predicates are emitted.
 * @param includeProductID whether the caller supplied a product identifier.
 * @returns the `WHERE` keyword line and every predicate, `AND`-separated.
 */
function discountBranchWhereClause(branch: DiscountBranch, productIDCount: number): string {
  const predicates = [
    ...branch.leadingPredicates,
    ...discountBranchDatePredicates(branch.periodAlias),
  ];

  if (productIDCount > 0) {
    predicates.push(branchProductIDPredicate(productIDCount));
  }

  return `${BRANCH_WHERE_KEYWORD}\n${predicates.join(BRANCH_PREDICATE_SEPARATOR)}`;
}

// CFML parity [model/dao/PromotionDAO.cfc:L518-L521]: the `CROSS JOIN SwPromoReward prGlobal` sits
// between two inner joins and carries no `ON` clause, and the inner join to `SwProduct` is referenced
// by no column in the global branch yet is load-bearing - it excludes SKUs whose parent product row
// does not exist.

// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L527-L533]: the global branch's `NOT EXISTS` set covers
// four `SwPromoReward*` link tables and omits `SwPromoRewardSku`, so a reward carrying SKU-level
// inclusions can still surface as global.
// Preserved deliberately; do not fix without a product decision.

// CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the `productTypeIDPath` containment test is a
// three-arm dialect branch inside a join's `ON` clause, and its MySQL arm is an unanchored substring
// `LIKE`. That is why this test diverges in implementation from `materializedIdPath.ts`, which owns
// the in-memory comma-list walking.

// CFML parity [model/dao/PromotionDAO.cfc:L317-L537]: every date boundary in this statement is
// inclusive, in all seven pairs, while `getActivePromotionRewards` is exclusive at
// [model/dao/PromotionDAO.cfc:L73, L75]. Both forms are reproduced as written, and neither
// null-tolerant disjunction becomes a `COALESCE`.

// LEGACY-NOTE [model/dao/PromotionDAO.cfc:L303, L307, L328-L330]: two legacy locals are dead -
// `noQualifierPromotionPeriods` is never assigned, and `salePromotionPeriodIDs` is built by the loop
// and never read. Neither is declared here, because `noUnusedLocals` would reject it and its absence
// changes nothing; the pre-query itself is NOT dead and CTE 3 consumes it
// [model/dao/PromotionDAO.cfc:L556, L558].

// The six-branch `UNION` [model/dao/PromotionDAO.cfc:L332-L542] is cited rather than transcribed,
// because its shape is uniform and is encoded as data below: the nine-column projection is
// identical across all six branches
// [model/dao/PromotionDAO.cfc:L333-L346, L364-L377, L395-L408, L428-L441, L461-L474, L502-L515].

/**
 * The six branches of the `UNION`, in source order.
 *
 * A FUNCTION rather than a module-level constant, and deliberately so: the product-type branch's
 * join chain embeds the dialect-selected `LIKE` pattern [model/dao/PromotionDAO.cfc:L482-L488].
 *
 * @param productTypePathPattern the dialect-composed pattern the `productTypeIDPath` column is
 * tested against, supplied by `../dialect.js`.
 * @returns the six branch descriptors, in the order the source unions them.
 */
function discountBranches(productTypePathPattern: string): readonly DiscountBranch[] {
  const globalRewardTypes = listToArray(GLOBAL_REWARD_TYPE_LIST);
  const globalRewardTypePlaceholders = globalRewardTypes.map(() => '?').join(', ');

  return [
    {
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
      // model/dao/PromotionDAO.cfc:L395-L426. `SwProduct` is referenced here - `SwProduct.brandID`
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
      // this branch EXCLUDES SKUs that carry no options at all.
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
      // model/dao/PromotionDAO.cfc:L461-L500. `SwProduct` is referenced here too -
      // `SwProduct.productTypeID` feeds the next join.
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
      // reward-type membership test [model/dao/PromotionDAO.cfc:L525] followed by the four not
      // EXISTS exclusions [model/dao/PromotionDAO.cfc:L527, L529, L531, L533], in source order.
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

// CFML parity [model/dao/PromotionDAO.cfc:L545, L555-L558]: the `SELECT DISTINCT` is the source's
// own and is kept - the six-branch UNION can present the same nine-column row through more than
// one level.
//
// CFML parity [model/dao/PromotionDAO.cfc:L562-L568]: CTE 4 carries no `DISTINCT` (only CTE 3
// does) and SQL MIN() ignores null. A row whose case fell through to null
// [model/dao/PromotionDAO.cfc:L338-L342] is therefore skipped by this aggregate while still
// existing in CTE.
/**
 * The two intermediate steps, as CTE 3 and CTE.
 *
 * CTE 3 reproduces query-of-queries step 1 [model/dao/PromotionDAO.cfc:L544-L559]: the nine
 * columns of `allDiscounts`, `DISTINCT`, restricted to the periods CTE 1 admitted.
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

// The final SELECT - STEP 3, the join-back. Recovers the winning row's own attributes by joining
// the grouped minimum back to the ungrouped rows on both the SKU and the price.

// CFML parity [model/dao/PromotionDAO.cfc:L553, L572-L580]: STEP 1 projects nine columns including
// promotionPeriodID; STEP 3 projects eight and DROPS it.
//
// CFML parity [model/dao/PromotionDAO.cfc:L571-L588]: the final step has no LIMIT, no ORDER by and
// no DISTINCT, so every row tying the minimum salePrice for a SKU survives - the result is one row
// per DISTINCT projected detail at that minimum.
//
// CFML parity [model/dao/PromotionDAO.cfc:L586]: the second predicate is joined by a LOWER-CASE
// `and`, where every other conjunction in this statement is upper-case `AND`. Preserved, not
// normalised.
/**
 * The outer `SELECT`, as step.
 *
 * Reproduces query-of-queries step 3 [model/dao/PromotionDAO.cfc:L571-L588]: the grouped minimum
 * joined back to the ungrouped rows on both `skuID` and `salePrice`.
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

// JUDGMENT CALL: the three chained in-engine `dbtype="query"` steps
// [model/dao/PromotionDAO.cfc:L544-L559, L561-L569, L571-L588] are expressed as SQL common table
// expressions - the chosen target rewrite.

// JUDGMENT CALL: `now` is an input rather than an internally-captured clock read.

// JUDGMENT CALL: the inline-versus-bound split in the emitted SQL is exactly the legacy's own
// split, not a judgement about what is safe to interpolate.

// JUDGMENT CALL: every table name in this statement is already a correct physical Sw* name, so the
// Slatwall*-in-raw-SQL naming correction does not apply here.
/**
 * Builds the sale-price promotion-reward statement.
 *
 * @param input the instant every date predicate is compared against, the already-resolved dialect,
 * and optionally a product identifier narrowing every branch.
 * @returns the statement text and the values to bind to it, in placeholder order.
 * @throws Error when `productID` is present as an EMPTY array.
 * @throws An error named `UnsupportedDialectError`, from `../dialect.js`, when `input.dialect` is
 * `MicrosoftSQLServer` or `Oracle10g`.
 */
export function buildSalePricePromotionRewardsStatement(
  input: SalePricePromotionRewardsInput,
): SalePricePromotionRewardsStatement {
  // Key PRESENCE, mirroring `structKeyExists` - not `!== undefined`, because a present-but-empty
  // identifier is a reachable state the six guards deliberately admit. The values are resolved once
  // here so the count drives both the emitted predicate and the binds, and the two cannot disagree.
  const productIDValues =
    'productID' in input ? branchProductIDValues(input.productID) : ([] as readonly string[]);

  // The fragment is composed here, inside the body, from the dialect the CALLER already decided
  // and that ARRIVES on the input, so this builder reads no configuration and no environment at
  // all.
  const productTypePathPattern = materializedIdPathLikePatternFragment(
    input.dialect,
    REWARD_PRODUCT_TYPE_ID_COLUMN,
  );

  const params: BindValue[] = [input.now, input.now, PROMOTION_ACTIVE_FLAG];

  const branchStatements: string[] = [];

  for (const branch of discountBranches(productTypePathPattern)) {
    branchStatements.push(
      [
        discountBranchProjection(branch),
        branch.fromClause,
        discountBranchWhereClause(branch, productIDValues.length),
      ].join('\n'),
    );

    params.push(...branch.leadingBindValues, input.now, input.now);

    // One bind per identifier per branch, in the order the caller supplied them - which is the order
    // the placeholders were just emitted in.
    params.push(...productIDValues);
  }

  const sql =
    NO_QUALIFIER_CURRENT_ACTIVE_PROMOTION_PERIODS_CTE +
    branchStatements.join(BRANCH_UNION_SEPARATOR) +
    '\n' +
    NO_QUALIFIER_DISCOUNTS_AND_SKU_PRICE_CTES +
    SKU_RESULTS_SELECT;

  return Object.freeze({ sql, params: Object.freeze(params) });
}
