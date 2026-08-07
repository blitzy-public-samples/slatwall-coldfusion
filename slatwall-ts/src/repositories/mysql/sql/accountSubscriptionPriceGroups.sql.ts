// slatwall-ts - extracted SQL: an account's subscription-derived price groups.
//
// The physical statement text, and the values bound to it, for `getAccountSubscriptionPriceGroups`
// the one and only function declared by [model/dao/PriceGroupDAO.cfc:L49-L104].
//
// Every locator cited in this file was opened in the legacy tree and matched character for
// character before it was written down.
//
// No connection, no pool, no statement execution, no entity, no monetary type, no configuration
// read, no logging, no clock and no I/O of any kind.

// JUDGMENT CALL: this module is the single sanctioned data-layer reach-through into the
// out-of-scope subscription subsystem. It is ported because account price-group resolution
// (PriceGroupService.cfc:L271-L298) is otherwise unreproducible.

// JUDGMENT CALL: the read-only boundary above is enforced by what this file contains, not by
// intention. The only verbs it emits are SELECT and its clauses; there is no mutating statement of
// any kind, no schema statement, and no second subscription query.

// JUDGMENT CALL: no Slatwall*→Sw* naming correction applies to this module. Every table in the
// stage-1 raw SQL is already physical Sw*, and stage 2 is HQL where SlatwallPriceGroup is correct
// by construction.

// JUDGMENT CALL: four defects sit in the service tier that consumes this statement
// PriceGroupService.cfc L236 (a `local.i` reference where the loop variable is `i`), L461-L470 (a
// loop over a collection snapshot that is never re-read).

// JUDGMENT CALL, and how it TURNED out: the export shape here is the specified default one frozen
// const object grouping the two stage builders chosen so that it did not depend on an import name
// read out of the consuming adapter.

import { listToArray } from '../../../lib/cfml/list.js';
import type { DatabaseDialect } from '../dialect.js';
import { singleRowLimitFragments } from '../dialect.js';

// Stage 1: the subscription-derived price group identifier set.

/**
 * The inputs stage 1 needs, all of them already resolved by the caller.
 *
 * A single object rather than positional arguments, for a reason specific to this statement:
 * `accountID` and `dialect` are both strings.
 */
export interface SubscriptionPriceGroupIDsCriteria {
  /**
   * The account whose subscription-derived price groups are wanted. Bound, never interpolated,
   * exactly as the legacy binds it at [model/dao/PriceGroupDAO.cfc:L66].
   *
   * JUDGMENT CALL: modelled as a REQUIRED, non-optional `string`, and the three sources agree once
   * they are read carefully.
   *
   * An EMPTY STRING is a legitimate value and is passed straight through to the bind.
   */
  readonly accountID: string;

  /**
   * The one instant the statement is evaluated against, captured by the caller. Bound twice - once
   * at [model/dao/PriceGroupDAO.cfc:L65] and once at L70 - and both binds receive this same value.
   */
  readonly now: Date;

  /**
   * The already-resolved database dialect, used only to select the row-limiting fragment of the
   * correlated subquery. It is not a tuning knob and it never reaches the emitted text as a value.
   */
  readonly dialect: DatabaseDialect;
}

/**
 * The three bind values of stage 1, in emitted-text order.
 *
 * Typed as a fixed-length tuple rather than an array so that the bind census is a compile-time
 * fact: position 1 is the instant from [model/dao/PriceGroupDAO.cfc:L65], position 2 the account
 * identifier from L66.
 */
export type SubscriptionPriceGroupIDsBindValues = readonly [Date, string, Date];

/**
 * The stage-1 statement and its bind values.
 */
export interface SubscriptionPriceGroupIDsStatement {
  readonly sql: string;

  readonly params: SubscriptionPriceGroupIDsBindValues;
}

// Stage 2: the active price groups among those identifiers.

/**
 * The inputs stage 2 needs.
 */
export interface ActivePriceGroupsByIDCriteria {
  /**
   * The identifiers stage 1 returned.
   */
  readonly priceGroupIDs: readonly string[];
}

/**
 * The bind values of stage 2, in emitted-text order: every price group identifier in list order,
 * then the active flag.
 *
 * A variadic tuple rather than a plain union array, so that "the flag is bound LAST, after all of
 * the identifiers" is carried by the type and not only by the comment.
 */
export type ActivePriceGroupsByIDBindValues = readonly [...string[], number];

/**
 * The stage-2 statement and its bind values.
 */
export interface ActivePriceGroupsByIDStatement {
  readonly sql: string;

  readonly params: ActivePriceGroupsByIDBindValues;
}

// CFML parity [model/dao/PriceGroupDAO.cfc:L95]: activeFlag is bound numerically as 1 here,
// whereas PromotionDAO.cfc:L118 binds numeric 1 in HQL and PromotionDAO.cfc:L321 uses cf_sql_bit
// in raw SQL.
const ACTIVE_FLAG_BOUND_VALUE = 1;

/**
 * The delimiter CFML's `valueList()` puts between column values.
 *
 * Stage 2's identifier normalization reproduces `valueList(...)` followed by `listToArray(...)`
 * [model/dao/PriceGroupDAO.cfc:L95], and this is the joining character of the first half.
 */
const VALUE_LIST_DELIMITER = ',';

/**
 * One positional placeholder, used to compose the `IN` group of stage.
 *
 * Every placeholder that is part of a FIXED clause is written literally in the SQL below rather
 * than interpolated.
 */
const BIND_PLACEHOLDER = '?';

/**
 * What separates the placeholders of an `IN` group.
 */
const BIND_PLACEHOLDER_SEPARATOR = ', ';

/**
 * Raised when stage 2 is asked to build a statement for no identifiers at all.
 */
class EmptyPriceGroupIDSetError extends Error {
  constructor() {
    super(
      [
        'Cannot build the active price group statement for an empty identifier set.',
        'model/dao/PriceGroupDAO.cfc:L92 gates this second stage on the first stage having',
        'returned rows, and L98 falls through to an empty array when it did not, so reaching',
        'this builder with no identifiers means that gate was skipped upstream.',
        'Return an empty array instead of calling this builder: an empty group would render',
        'IN (), which MySQL rejects as a syntax error.',
        'No identifier is echoed here, because there is none.',
      ].join(' '),
    );
    this.name = 'EmptyPriceGroupIDSetError';
  }
}

// CFML parity [model/dao/PriceGroupDAO.cfc:L55]: the legacy local `getpg` is initialized to ""
// before either <cfquery> overwrites it. Not declared in the target `noUnusedLocals` would reject
// an unread local, and the initializer has no observable effect.

// CFML parity [model/dao/PriceGroupDAO.cfc:L57-L88]: the two dialect arms are identical except for
// row limiting the MySQL arm ends the correlated subquery with LIMIT 1 (L71), the <cfelse> arm
// uses TOP 1 after SELECT (L83) and no LIMIT. The MySQL arm is emitted.

// CFML parity [model/dao/PriceGroupDAO.cfc:L67-L71]: the literal 'sstActive' sits on the LEFT of
// the comparison and the correlated scalar subquery on the right.

// JUDGMENT CALL: 'sstActive' is kept as an inline SQL literal exactly as PriceGroupDAO.cfc:L67
// writes it.

// JUDGMENT CALL: the legacy calls now() twice per executed arm (L65 and L70 in the MySQL arm).

// JUDGMENT CALL: the dialect ARRIVES resolved rather than being resolved here.

/**
 * Build the statement that reduces an account's subscription graph to the set of price group
 * identifiers it is entitled to.
 *
 * @param criteria The account identifier, the single captured instant, and the resolved dialect.
 * @returns The frozen statement text and its three positional bind values.
 * @throws An error named `UnsupportedDialectError`, from `../dialect.js`, when the dialect is
 * `MicrosoftSQLServer` or `Oracle10g`.
 */
function buildSubscriptionPriceGroupIDsStatement(
  criteria: SubscriptionPriceGroupIDsCriteria,
): SubscriptionPriceGroupIDsStatement {
  // The row-limiting arm is chosen here, inside the body.
  const { selectPrefix, trailingClause } = singleRowLimitFragments(criteria.dialect);
  const sql = `SELECT DISTINCT subpg.priceGroupID
FROM SwSubsUsageBenefitAccount suba
INNER JOIN SwSubsUsageBenefit sub ON suba.subscriptionUsageBenefitID = sub.subscriptionUsageBenefitID
INNER JOIN SwSubsUsageBenefitPriceGroup subpg ON sub.subscriptionUsageBenefitID = subpg.subscriptionUsageBenefitID
INNER JOIN SwSubsUsage su ON sub.subscriptionUsageID = su.subscriptionUsageID
WHERE (suba.endDateTime IS NULL
    OR suba.endDateTime > ?)
  AND suba.accountID = ?
  AND 'sstActive' = (SELECT ${selectPrefix}systemCode FROM SwSubscriptionStatus
        INNER JOIN SwType ON SwSubscriptionStatus.subscriptionStatusTypeID = SwType.typeID
        WHERE SwSubscriptionStatus.subscriptionUsageID = su.subscriptionUsageID
        AND SwSubscriptionStatus.effectiveDateTime <= ?
        ORDER BY changeDateTime DESC ${trailingClause})`;

  // One captured instant, bound twice. `criteria.now` is read at positions 1 and 3 so the two
  // comparisons cannot drift apart mid-statement the way two independent now() calls can.
  const params: SubscriptionPriceGroupIDsBindValues = [
    criteria.now,
    criteria.accountID,
    criteria.now,
  ];

  // Both the statement and its bind array are frozen.
  return Object.freeze({ sql, params: Object.freeze(params) });
}

// CFML parity [model/dao/PriceGroupDAO.cfc:L92, L98]: stage 2 is gated on stage 1 having returned
// rows, and the legacy falls through to an empty array when it did not.

// JUDGMENT CALL: mysqlOptionRepository.ts reproduces OptionDAO's in ('')/not in ('') asymmetry
// (OptionDAO L68 vs L107) by binding a single empty-string element, because OptionDAO has no
// emptiness guard.

// JUDGMENT CALL: the `IN` list is bound one PLACEHOLDER per ELEMENT. `mysql2` does not expand an
// array into an `IN` group, so the group is composed structurally and one value is pushed per `?`.

// CFML parity [model/entity/PriceGroup.cfc:L69]: the link table this statement reaches is
// corroborated by the entity metadata, so no schema guesswork is involved -
// `subscriptionUsageBenefits` is declared many-to-many with
// linktable="SwSubsUsageBenefitPriceGroup".

// JUDGMENT CALL: the legacy stage-2 HQL is a bare "from SlatwallPriceGroup pg" with no SELECT
// clause, which returns whole PriceGroup entities.

/**
 * Build the statement that loads the ACTIVE price groups among a set of identifiers.
 *
 * Legacy: [model/dao/PriceGroupDAO.cfc:L93-L95] - HQL, executed through `ormExecuteQuery` with a
 * two-key parameter map.
 *
 * @param criteria The identifiers stage 1 returned.
 * @returns The frozen statement text and its bind values.
 * @throws An error named `EmptyPriceGroupIDSetError` when the identifier set is empty, or becomes
 * empty under the CFML list normalization below.
 */
function buildActivePriceGroupsByIDStatement(
  criteria: ActivePriceGroupsByIDCriteria,
): ActivePriceGroupsByIDStatement {
  // CFML parity [model/dao/PriceGroupDAO.cfc:L95]: the legacy does not hand the query column to
  // the ORM directly.
  const priceGroupIDs = listToArray(criteria.priceGroupIDs.join(VALUE_LIST_DELIMITER));

  if (priceGroupIDs.length === 0) {
    throw new EmptyPriceGroupIDSetError();
  }

  // One placeholder per element, joined into the `IN` group. This is the only structural
  // interpolation in the statement; no value is ever interpolated.
  const placeholderGroup = priceGroupIDs
    .map(() => BIND_PLACEHOLDER)
    .join(BIND_PLACEHOLDER_SEPARATOR);

  /*
   * The two named placeholders belong to that HQL formulation and appear nowhere in the emitted
   * text: `ormExecuteQuery` resolved them from the parameter map at L95.
   */
  const sql = `SELECT pg.* FROM SwPriceGroup pg WHERE pg.priceGroupID IN (${placeholderGroup}) AND pg.activeFlag = ?`;

  const params: ActivePriceGroupsByIDBindValues = [...priceGroupIDs, ACTIVE_FLAG_BOUND_VALUE];

  return Object.freeze({ sql, params: Object.freeze(params) });
}

// The single exported unit.

/**
 * The two stages of `getAccountSubscriptionPriceGroups`, as pure statement builders.
 *
 * Grouped into one frozen object because the two stages are one legacy function and are
 * meaningless apart: stage 1 produces the identifiers stage 2 consumes.
 */
export const ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS = Object.freeze({
  buildSubscriptionPriceGroupIDsStatement,
  buildActivePriceGroupsByIDStatement,
});
