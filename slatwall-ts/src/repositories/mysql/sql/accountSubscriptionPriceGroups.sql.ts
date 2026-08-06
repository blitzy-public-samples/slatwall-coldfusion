// ---------------------------------------------------------------------------
// slatwall-ts - extracted SQL: an account's subscription-derived price groups
//
// WHAT THIS MODULE IS
//   The physical statement text, and the values bound to it, for
//   `getAccountSubscriptionPriceGroups` - the one and only function declared by
//   [model/dao/PriceGroupDAO.cfc:L49-L104]. There are TWO builders because the
//   legacy function is TWO-STAGE: a raw `<cfquery>` that reduces the
//   subscription graph to a set of price group identifiers (L58-L72), then an
//   ORM query that loads the ACTIVE price groups among those identifiers
//   (L93-L95).
//
//   It owns the statement text and its bind values, and nothing else. Row
//   hydration, the `PriceGroup` entity factory, association materialization and
//   fetch-shape commentary belong to `mysqlPriceGroupRepository.ts` under
//   transformation rule T3 - not here. That adapter SHIPS, as do the other five.
//   An earlier revision of this block carried a `(planned)` marker against the
//   name and defined the marker as "a target named by the Agent Action Plan that
//   is ABSENT from the subtree at this checkpoint"; that stopped being true the
//   moment the adapter was authored, so both the marker and its definition are
//   gone. The division of labour they described is unchanged and is the point:
//   this file owns statement text and bind values, that one owns hydration.
//
// LOCATOR VERIFICATION - THERE IS NO DRIFT IN THIS SPAN
//   Every locator cited in this file was opened in the legacy tree and matched
//   character for character before it was written down. The component is 104
//   lines long; `<cffunction>` appears exactly ONCE, opening at L52 and closing
//   at L100; `</cfcomponent>` is at L101; L102-L104 are blank. The cited span
//   L52-L100 is therefore correct as given, and this file records no
//   locator-drift caution because there is none to record.
//
// PURITY - SYNCHRONOUS, DETERMINISTIC, OFFLINE
//   No connection, no pool, no statement execution, no entity, no monetary
//   type, no configuration read, no logging, no clock and no I/O of any kind.
//   Both builders are ordinary synchronous functions returning
//   `{ sql, params }`, so the repository suite can assert the emitted text and
//   the bind array with NO live MySQL. Everything the statements need that is
//   not a constant - the account identifier, the instant, the resolved dialect,
//   the identifier set - arrives as an argument.
//
// WHITESPACE, AND WHY THE SQL IS LAID OUT THE WAY IT IS
//   The emitted SQL mirrors the legacy `<cfquery>` body clause for clause and
//   line for line so that the two formulations can be diffed directly, and each
//   emitted statement sits immediately below a verbatim exhibit of the source it
//   translates. Three mechanical notes on that reproduction:
//
//     * The legacy body is indented with TABS. Each legacy tab level becomes two
//       spaces here - this subtree's indentation width - and the per-line level
//       pattern is preserved exactly: L59-L64 at level 0, L65 at level 2,
//       L66-L67 at level 1, L68-L71 at level 4.
//     * The SQL template literals deliberately start at column 0 rather than
//       following the surrounding code's indentation, so the emitted text
//       carries no accidental leading whitespace from its position in this file.
//     * L67 and L83 each end in a single TRAILING SPACE in the source. It is not
//       reproduced, in the exhibit or in the emitted text: a newline already
//       separates the tokens either side of it, Prettier never looks inside a
//       template literal so it could not be caught there, and `git diff --check`
//       rejects a source line that ends in a blank. That is the only
//       character-level difference between this file and the legacy body.

// JUDGMENT CALL: this module is the single sanctioned data-layer reach-through into the out-of-scope
// subscription subsystem. It is ported because account price-group resolution
// (PriceGroupService.cfc:L271-L298) is otherwise unreproducible. It is READ-ONLY: it emits SELECT text
// only, its projection is limited to SwSubsUsageBenefitPriceGroup.priceGroupID exactly as the legacy
// declares (PriceGroupDAO.cfc:L59), and NO subscription business logic is ported. Six out-of-scope tables
// are read — SwSubsUsageBenefitAccount, SwSubsUsageBenefit, SwSubsUsageBenefitPriceGroup, SwSubsUsage,
// SwSubscriptionStatus, SwType — and none is ever written.

// JUDGMENT CALL: the read-only boundary above is enforced by what this file contains, not by intention.
// The only verbs it emits are SELECT and its clauses; there is no mutating statement of any kind, no
// schema statement, and no second subscription query. The stage-1 projection stays the single column the
// legacy declares at PriceGroupDAO.cfc:L59 and is never widened: no subscription status, benefit, usage
// or type field reaches the return shape, and no subscription rule is re-expressed anywhere below. The
// stage-2 result is price groups, which is what the sole consumer needs
// (PriceGroupService.cfc:L280-L291).

// JUDGMENT CALL: no Slatwall*→Sw* naming correction applies to this module. Every table in the stage-1 raw
// SQL is already physical Sw*, and stage 2 is HQL where SlatwallPriceGroup is correct by construction. The
// documented runtime-throwing correction is confined to three adapter methods — ProductTypeDAO L53-L54,
// SkuDAO.searchSkusByProductType L131-L138, ProductDAO.searchProductsByProductType L420-L427 — and none of
// them is here. Mapping SlatwallPriceGroup to SwPriceGroup below is a TRANSLATION, not a repair.

// JUDGMENT CALL: four defects sit in the service tier that consumes this statement — PriceGroupService.cfc
// L236 (a `local.i` reference where the loop variable is `i`), L461-L470 (a loop over a collection
// snapshot that is never re-read), L174 (the parent recursion calling the product variant rather than the
// SKU variant) and L316-L340 (only the percentageOff branch applying the rounding rule). NONE of them is
// compensated for here. This module adds no guard, no live view, no bounded-iteration limit and no
// re-read on their behalf: it returns the collection the legacy query returns, and the defects stay where
// they are, to be reproduced and annotated by the modules that own them.

// JUDGMENT CALL, AND HOW IT TURNED OUT: the export shape here is the specified default — ONE frozen
// const object grouping the two stage builders — chosen so that it did not depend on an import name
// read out of the consuming adapter. `mysqlPriceGroupRepository.ts` now exists and consumes both
// members under that shape without a rename, so the choice cost nothing and the decision is recorded
// rather than quietly dropped. Both member names carry the folder's `build…Statement` convention.

import { listToArray } from '../../../lib/cfml/list.js';
import type { DatabaseDialect } from '../dialect.js';
import { singleRowLimitFragments } from '../dialect.js';

// ---------------------------------------------------------------------------
// Stage 1: the subscription-derived price group identifier set
// ---------------------------------------------------------------------------

/**
 * The inputs stage 1 needs, all of them already resolved by the caller.
 *
 * A single object rather than positional arguments, for a reason specific to
 * this statement: `accountID` and `dialect` are both strings, so a positional
 * signature would let a caller transpose them and still type-check, and the
 * transposition would produce a statement that runs and returns the wrong rows.
 */
export interface SubscriptionPriceGroupIDsCriteria {
  /**
   * The account whose subscription-derived price groups are wanted. Bound, never
   * interpolated, exactly as the legacy binds it at
   * [model/dao/PriceGroupDAO.cfc:L66].
   *
   * JUDGMENT CALL: modelled as a REQUIRED, non-optional `string`, and the three
   * sources agree once they are read carefully. The DAO argument is declared
   * `<cfargument name="accountID" type="string">` at
   * [model/dao/PriceGroupDAO.cfc:L53] with no `required` and no `default`, so
   * the declaration reads optional - but the body interpolates
   * `#arguments.accountID#` at L66 with no `structKeyExists` test, so omitting
   * it does not produce a query with a missing predicate; it produces a runtime
   * failure before any SQL is composed. The sole caller
   * ([model/service/PriceGroupService.cfc:L277]) always supplies it, and
   * `getAccountSubscriptionPriceGroups` at
   * `slatwall-ts/src/domain/ports/priceGroupRepository.ts:L180` declares it
   * required for that reason. (That locator read `:L674`, past the end of a
   * 415-line file, until a review checked it against disk.) A required property is therefore the honest
   * model, and it is also the one that behaves under
   * `exactOptionalPropertyTypes`, where `accountID?: string` would introduce an
   * `undefined` state the legacy has no representation for.
   *
   * An EMPTY STRING is a legitimate value and is passed straight through to the
   * bind. It is not trimmed, not length-checked and not rejected: the legacy
   * applies no such test, and an empty account identifier simply matches no row.
   */
  readonly accountID: string;

  /**
   * The one instant the statement is evaluated against, captured by the caller.
   * Bound TWICE - once at [model/dao/PriceGroupDAO.cfc:L65] and once at L70 -
   * and both binds receive this same value.
   */
  readonly now: Date;

  /**
   * The already-resolved database dialect, used only to select the row-limiting
   * fragment of the correlated subquery. It is not a tuning knob and it never
   * reaches the emitted text as a value.
   */
  readonly dialect: DatabaseDialect;
}

/**
 * The three bind values of stage 1, in emitted-text order.
 *
 * Typed as a fixed-length tuple rather than an array so that the bind census is
 * a compile-time fact: position 1 is the instant from
 * [model/dao/PriceGroupDAO.cfc:L65], position 2 the account identifier from L66,
 * position 3 the SAME instant again from L70.
 */
export type SubscriptionPriceGroupIDsBindValues = readonly [Date, string, Date];

/** The stage-1 statement and its bind values. */
export interface SubscriptionPriceGroupIDsStatement {
  readonly sql: string;

  readonly params: SubscriptionPriceGroupIDsBindValues;
}

// ---------------------------------------------------------------------------
// Stage 2: the active price groups among those identifiers
// ---------------------------------------------------------------------------

/** The inputs stage 2 needs. */
export interface ActivePriceGroupsByIDCriteria {
  /**
   * The identifiers stage 1 returned.
   *
   * PRECONDITION: NON-EMPTY. See the builder for why, and for what happens if
   * it is violated.
   */
  readonly priceGroupIDs: readonly string[];
}

/**
 * The bind values of stage 2, in emitted-text order: every price group
 * identifier in list order, then the active flag.
 *
 * A variadic tuple rather than a plain union array, so that "the flag is bound
 * LAST, after all of the identifiers" is carried by the type and not only by the
 * comment.
 */
export type ActivePriceGroupsByIDBindValues = readonly [...string[], number];

/** The stage-2 statement and its bind values. */
export interface ActivePriceGroupsByIDStatement {
  readonly sql: string;

  readonly params: ActivePriceGroupsByIDBindValues;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PriceGroupDAO.cfc:L95]: activeFlag is bound numerically as 1 here, whereas
// PromotionDAO.cfc:L118 binds numeric 1 in HQL and PromotionDAO.cfc:L321 uses cf_sql_bit in raw SQL. The
// matched row set is identical in MySQL (BIT/TINYINT(1) compares equal to 1). Each site is bound in its
// own legacy shape; the inconsistency is recorded rather than harmonised.
//
// It is a bound value and not a literal in the text, because the legacy passes it through the ORM
// parameter map rather than writing it into the query string. `activeFlag` is declared
// `ormtype="boolean"` at [model/entity/PriceGroup.cfc:L54], and 1 is what the legacy binds against it.
const ACTIVE_FLAG_BOUND_VALUE = 1;

/**
 * The delimiter CFML's `valueList()` puts between column values.
 *
 * Stage 2's identifier normalization reproduces `valueList(...)` followed by
 * `listToArray(...)` [model/dao/PriceGroupDAO.cfc:L95], and this is the joining
 * character of the first half.
 */
const VALUE_LIST_DELIMITER = ',';

/**
 * One positional placeholder, used to compose the `IN` group of stage 2.
 *
 * Every placeholder that is part of a FIXED clause is written literally in the
 * SQL below rather than interpolated, so that the emitted text reads as SQL and
 * the placeholder count can be checked by eye against the bind census. The only
 * interpolations that reach a statement in this file are structural and there are
 * exactly two kinds: this repeated group, and the dialect-selected row-limiting
 * fragment. A value is never interpolated.
 */
const BIND_PLACEHOLDER = '?';

/** What separates the placeholders of an `IN` group. */
const BIND_PLACEHOLDER_SEPARATOR = ', ';

/**
 * Raised when stage 2 is asked to build a statement for no identifiers at all.
 *
 * Deliberately NOT exported. The class is an implementation detail of the
 * precondition; `name` is assigned a stable string so a caller or a suite can
 * identify it without importing it, which keeps this module at one exported
 * unit.
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

// ---------------------------------------------------------------------------
// Stage 1 - builder
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PriceGroupDAO.cfc:L55]: the legacy local `getpg` is initialized to "" before
// either <cfquery> overwrites it. Not declared in the target — `noUnusedLocals` would reject an unread
// local, and the initializer has no observable effect. Its absence changes no behavior.

// CFML parity [model/dao/PriceGroupDAO.cfc:L57-L88]: the two dialect arms are identical except for row
// limiting — the MySQL arm ends the correlated subquery with LIMIT 1 (L71), the <cfelse> arm uses TOP 1
// after SELECT (L83) and no LIMIT. The MySQL arm is emitted. The legacy compares
// getApplicationValue("databaseType") eq "mySQL" at L57; the source spells MySQL three ways across the
// codebase ("MySQL", "mySQL", "mySql"), which is why dialect.ts folds case and owns the comparison. It is
// not re-implemented here.

// CFML parity [model/dao/PriceGroupDAO.cfc:L67-L71]: the literal 'sstActive' sits on the LEFT of the
// comparison and the correlated scalar subquery on the right; the projected `systemCode` and the
// `ORDER BY changeDateTime` are both UNQUALIFIED in the source. systemCode resolves through the unaliased
// SwType join at L68 (SwSubscriptionStatus has no systemCode column), which is what makes that join
// load-bearing; changeDateTime resolves to SwSubscriptionStatus. All three shapes emitted as written —
// orientation not flipped, references not qualified.

// JUDGMENT CALL: 'sstActive' is kept as an inline SQL literal exactly as PriceGroupDAO.cfc:L67 writes it.
// It is a hardcoded literal with no caller influence and therefore no injection surface, and binding it
// would change the emitted SQL text and break diffability. Contrast promotionUseCounts.sql.ts, where
// "ostNotPlaced" IS bound — because PromotionDAO.cfc:L139/L194/L266/L290 binds it. Each site reproduces
// the legacy's own choice.

// JUDGMENT CALL: the legacy calls now() twice per executed arm (L65 and L70 in the MySQL arm). CFML
// evaluates each call independently; the target instead accepts ONE already-captured timestamp from
// mysqlPriceGroupRepository.ts and binds that same value to both positions — one timestamp per invocation.
// The capture lives in the adapter because this module must stay pure and synchronous so the SQL-shape
// tests can assert a fixed params array with no live MySQL. No SQL NOW()/CURRENT_TIMESTAMP is emitted and
// no clock abstraction is introduced.

// JUDGMENT CALL: the dialect ARRIVES resolved rather than being resolved here. This was once a
// divergence from the two sibling builders - sortedProductSkus.sql.ts and
// salePricePromotionRewards.sql.ts each called resolveConfiguredDialect() in its own body - and it is
// now the settled rule for all three: both siblings were corrected to accept the dialect, because
// loading the validated configuration to compose a string is ambient state (AAP transformation rule
// T6) and it demanded five DB_* values, four of them unused, breaking the empty-environment guarantee
// in tests/setup.ts.
// This module may not read configuration or the environment at all: a builder that did could not be
// asserted against a fixed params array without a live environment. Resolution therefore belongs to the
// adapter, which is also what the port requires - priceGroupRepository.ts:L93-L102 states that the
// row-limiting clause "must be COMPOSED by the adapter and must never concatenate a caller value", and it
// declares no row-limiting parameter for exactly that reason. The fragment is still selected by
// ../dialect.js, INSIDE the function body below and never at module load, so importing this module
// resolves nothing and cannot fail.

/**
 * Build the statement that reduces an account's subscription graph to the set of
 * price group identifiers it is entitled to.
 *
 * Legacy: the MySQL arm of [model/dao/PriceGroupDAO.cfc:L58-L72].
 *
 * THE BIND CENSUS IS EXACTLY THREE, in emitted-text order: the instant (L65),
 * the account identifier (L66), then the SAME instant again (L70). Positions 1
 * and 3 are the identical value. `'sstActive'` is NOT among them.
 *
 * Nothing is added that the legacy lacks. The `DISTINCT` it declares at L59 is
 * kept and the projection stays that one column; the four-table join chain keeps
 * its order, its aliases and its predicates; the end-date test keeps its
 * parentheses and its exclusive `>`; the effective-date test keeps its inclusive
 * `<=`; and the only `ORDER BY` and the only `LIMIT` in the emitted text are the
 * ones the legacy writes at L71. There is no de-duplication beyond that
 * `DISTINCT`, no null-coalescing, no additional sort key, no grouping, no
 * aggregate filter, no set operation, no set-membership function and no index
 * hint - because the legacy query has none of them, and each would change either
 * the rows returned or which status row the subquery picks.
 *
 * @param criteria - The account identifier, the single captured instant, and the
 *   resolved dialect.
 * @returns The frozen statement text and its three positional bind values.
 * @throws An error named `UnsupportedDialectError`, from `../dialect.js`, when
 *   the dialect is `MicrosoftSQLServer` or `Oracle10g`. That arm exists in the
 *   legacy source at L74-L88 and is therefore reproducible, but it is not
 *   implemented by this port, and emitting the MySQL text under another engine's
 *   name would compose `LIMIT 1` for an engine that does not accept it.
 */
function buildSubscriptionPriceGroupIDsStatement(
  criteria: SubscriptionPriceGroupIDsCriteria,
): SubscriptionPriceGroupIDsStatement {
  // The row-limiting arm is chosen HERE, inside the body. `selectPrefix` is what
  // the other arm would place after `SELECT` (`TOP 1`) and `trailingClause` is
  // what this arm appends after the `ORDER BY` (`LIMIT 1`); for MySQL the prefix
  // is empty and the trailing clause carries the limit, so the emitted text
  // matches L67 and L71 exactly. Both members are consumed rather than only the
  // one that is non-empty, so the arm difference stays visibly delegated to
  // ../dialect.js instead of being half-inlined here.
  const { selectPrefix, trailingClause } = singleRowLimitFragments(criteria.dialect);

  // Carried forward verbatim from [model/dao/PriceGroupDAO.cfc:L56], which is the
  // legacy author's own rationale for why this stage is raw SQL while stage 2 is
  // HQL. It is reproduced character for character, stripped only of the CFML
  // comment delimiters, and it is the legacy author's sentence - not this port's:
  //
  // can't figure out top 1 hql so, doing query: Sumit

  /*
   * Verbatim [model/dao/PriceGroupDAO.cfc:L58-L72], dedented to the <cfquery>
   * tag and with the trailing space of L67 omitted:
   *
   * <cfquery name="getpg">
   * 	SELECT DISTINCT subpg.priceGroupID
   * 	FROM SwSubsUsageBenefitAccount suba
   * 	INNER JOIN SwSubsUsageBenefit sub ON suba.subscriptionUsageBenefitID = sub.subscriptionUsageBenefitID
   * 	INNER JOIN SwSubsUsageBenefitPriceGroup subpg ON sub.subscriptionUsageBenefitID = subpg.subscriptionUsageBenefitID
   * 	INNER JOIN SwSubsUsage su ON sub.subscriptionUsageID = su.subscriptionUsageID
   * 	WHERE (suba.endDateTime IS NULL
   * 			OR suba.endDateTime > <cfqueryparam value="#now()#" cfsqltype="cf_sql_timestamp" />)
   * 		AND suba.accountID = <cfqueryparam value="#arguments.accountID#" cfsqltype="cf_sql_varchar" />
   * 		AND 'sstActive' = (SELECT systemCode FROM SwSubscriptionStatus
   * 					INNER JOIN SwType ON SwSubscriptionStatus.subscriptionStatusTypeID = SwType.typeID
   * 					WHERE SwSubscriptionStatus.subscriptionUsageID = su.subscriptionUsageID
   * 					AND SwSubscriptionStatus.effectiveDateTime <= <cfqueryparam value="#now()#" cfsqltype="cf_sql_timestamp" />
   * 					ORDER BY changeDateTime DESC LIMIT 1)
   * </cfquery>
   */
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

  // One captured instant, bound twice. `criteria.now` is read at positions 1 and
  // 3 so the two comparisons cannot drift apart mid-statement the way two
  // independent now() calls can.
  const params: SubscriptionPriceGroupIDsBindValues = [
    criteria.now,
    criteria.accountID,
    criteria.now,
  ];

  // BOTH the statement and its bind array are frozen. `Object.freeze` is shallow,
  // so freezing only the enclosing object would leave `params` mutable and let a
  // caller rebind placeholders to different values after construction.
  return Object.freeze({ sql, params: Object.freeze(params) });
}

// ---------------------------------------------------------------------------
// Stage 2 - builder
// ---------------------------------------------------------------------------

// CFML parity [model/dao/PriceGroupDAO.cfc:L92,L98]: stage 2 is gated on stage 1 having returned rows, and
// the legacy falls through to an empty array when it did not. The target MUST return [] before issuing
// stage 2 on an empty ID set — an empty array would otherwise render IN (), which is a MySQL syntax error.
// The short-circuit decision lives in mysqlPriceGroupRepository.ts because it depends on stage 1's result;
// this builder documents the non-empty precondition.
//
// It also defends it: reaching this builder with nothing to bind means the L92 gate was skipped, and
// failing by name is more useful than composing a statement MySQL will reject. Reproducing the gate is not
// an addition - the gate is in the legacy, at L92.

// JUDGMENT CALL: mysqlOptionRepository.ts reproduces OptionDAO's IN ('')/NOT IN ('') asymmetry (OptionDAO
// L68 vs L107) by binding a single empty-string element, because OptionDAO has no emptiness guard.
// PriceGroupDAO DOES have one (L92), so the faithful reproduction here is an early [] return, not an
// empty-string bind. The two treatments differ because the two legacy sources differ.

// JUDGMENT CALL: the `IN` list is bound ONE PLACEHOLDER PER ELEMENT. `mysql2` does not expand an array
// into an `IN` group, so the group is composed structurally and one value is pushed per `?`. This is
// deliberately NOT the treatment in mysqlProductRepository.ts, which reproduces ProductDAO.cfc:L64-L69 -
// where the legacy joins a list into a single comma STRING and binds that one value, under its own legacy
// note about Railo and ACF disagreeing over arrays in an `IN` clause. That asymmetry is preserved where it
// belongs and is not generalised: PriceGroupDAO.cfc:L95 hands the ORM an ARRAY, so an array is what is
// bound here.

// CFML parity [model/entity/PriceGroup.cfc:L69]: the link table this statement reaches is corroborated by
// the entity metadata, so no schema guesswork is involved - `subscriptionUsageBenefits` is declared
// many-to-many with linktable="SwSubsUsageBenefitPriceGroup", fkcolumn="priceGroupID" and
// inversejoincolumn="subscriptionUsageBenefitID", which is exactly the table and the two key columns the
// stage-1 join at PriceGroupDAO.cfc:L62 uses. The entity also fixes stage 2's names: entityname
// "SlatwallPriceGroup" maps to table "SwPriceGroup" (L49), the primary key is priceGroupID (L52), and
// activeFlag is ormtype="boolean" (L54).

// JUDGMENT CALL: the legacy stage-2 HQL is a bare "FROM SlatwallPriceGroup pg" with no SELECT clause,
// which returns whole PriceGroup entities. The physical rendering therefore uses a full-row projection;
// which columns the PriceGroup factory reads is mysqlPriceGroupRepository.ts's hydration contract, not this
// module's concern. Two independent readings agree that entities are what is wanted: the legacy itself
// returns them (L95), and the sole consumer appends them to the account's directly-assigned groups and
// then walks each one's rates and parent group (PriceGroupService.cfc:L280-L291), which a narrower
// projection could not survive.

/**
 * Build the statement that loads the ACTIVE price groups among a set of
 * identifiers.
 *
 * Legacy: [model/dao/PriceGroupDAO.cfc:L93-L95] - HQL, executed through
 * `ormExecuteQuery` with a two-key parameter map.
 *
 * THE BIND CENSUS IS N + 1, in emitted-text order: every identifier in list
 * order, then the active flag. The clause order of the legacy is kept - the `IN`
 * test first, the flag second - so the bind order follows from the text rather
 * than from a convention.
 *
 * @param criteria - The identifiers stage 1 returned. MUST be non-empty; see the
 *   parity note above for why, and `EmptyPriceGroupIDSetError` for what happens
 *   if it is not.
 * @returns The frozen statement text and its bind values.
 * @throws An error named `EmptyPriceGroupIDSetError` when the identifier set is
 *   empty, or becomes empty under the CFML list normalization below.
 */
function buildActivePriceGroupsByIDStatement(
  criteria: ActivePriceGroupsByIDCriteria,
): ActivePriceGroupsByIDStatement {
  // CFML parity [model/dao/PriceGroupDAO.cfc:L95]: the legacy does not hand the query column to the ORM
  // directly. It runs `listToArray(valueList(getpg.priceGroupID))` - `valueList` joins the column into one
  // comma-delimited string, and `listToArray` splits it back into an array. Both halves are reproduced,
  // in that order, because the round trip is OBSERVABLE: `listToArray` drops empty elements, so a row
  // carrying an empty identifier disappears between the two stages rather than becoming an empty bind.
  // `valueList` is deliberately absent from src/lib/cfml/list.ts (its surface is closed at five exports),
  // so its half is the join here, while the split is the real helper with the real CFML semantics.
  const priceGroupIDs = listToArray(criteria.priceGroupIDs.join(VALUE_LIST_DELIMITER));

  if (priceGroupIDs.length === 0) {
    throw new EmptyPriceGroupIDSetError();
  }

  // One placeholder per element, joined into the `IN` group. This is the only
  // structural interpolation in the statement; no value is ever interpolated.
  const placeholderGroup = priceGroupIDs
    .map(() => BIND_PLACEHOLDER)
    .join(BIND_PLACEHOLDER_SEPARATOR);

  /*
   * Verbatim [model/dao/PriceGroupDAO.cfc:L93]:
   *
   * FROM SlatwallPriceGroup pg WHERE pg.priceGroupID IN (:priceGroupIDs) AND pg.activeFlag = :activeFlag
   *
   * The two named placeholders belong to that HQL formulation and appear nowhere
   * in the emitted text: `ormExecuteQuery` resolved them from the parameter map
   * at L95, and a prepared statement carries positional placeholders instead.
   */
  const sql = `SELECT pg.* FROM SwPriceGroup pg WHERE pg.priceGroupID IN (${placeholderGroup}) AND pg.activeFlag = ?`;

  const params: ActivePriceGroupsByIDBindValues = [...priceGroupIDs, ACTIVE_FLAG_BOUND_VALUE];

  return Object.freeze({ sql, params: Object.freeze(params) });
}

// ---------------------------------------------------------------------------
// The single exported unit
// ---------------------------------------------------------------------------

/**
 * The two stages of `getAccountSubscriptionPriceGroups`, as pure statement
 * builders.
 *
 * Grouped into one frozen object because the two stages are one legacy function
 * and are meaningless apart: stage 1 produces the identifiers stage 2 consumes,
 * and the caller must honour the L92 gate between them - if stage 1 returns no
 * rows, the answer is an empty array and stage 2 is never built.
 */
export const ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS = Object.freeze({
  buildSubscriptionPriceGroupIDsStatement,
  buildActivePriceGroupsByIDStatement,
});
