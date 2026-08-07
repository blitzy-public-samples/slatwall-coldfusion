/**
 * The four promotion use-count statements, extracted from `model/dao/PromotionDAO.cfc:L134-L296`.
 *
 * Four legacy HQL statements become four physical SQL statements here, and nothing else happens in
 * this module.
 *
 * The two neighbours in that file are deliberately absent from this module:
 * `getActivePromotionRewards` [model/dao/PromotionDAO.cfc:L51-L132] belongs to the adapter.
 *
 * JUDGMENT CALL: the join counts were counted directly in the source rather than taken from
 * description, because the counts in circulation are wrong.
 *
 * @see model /dao/PromotionDAO.cfc for the four legacy bodies, each reproduced verbatim below as
 * an exhibit sitting directly above the text it became.
 */

// JUDGMENT CALL: this module imports nothing, and that is a deliberate design constraint rather
// than an accident of a short implementation.

// JUDGMENT CALL: every builder below is pure and synchronous. Nothing here is `async`, nothing
// awaits, nothing reads `process.env`, nothing calls `new Date()` and nothing logs.

// JUDGMENT CALL: all entity dereferencing stays in the adapter, so the builders here accept
// already-resolved primitive scalars.

// JUDGMENT CALL: the boolean-returntype defect is not reproduced here, because it is not in this
// file.

/**
 * The literal order-status system code that every one of the four statements excludes.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L139, L194, L266, L290]: the legacy sets the string
 * `"ostNotPlaced"` into the parameter map rather than writing it into the HQL text, at all four
 * sites. It is therefore bound here too, never inlined into statement text.
 */
const OST_NOT_PLACED = 'ostNotPlaced';

/**
 * A value that can be bound to one of these statements' placeholders.
 *
 * Three of the four possibilities are identifiers or the status code above, and all of those are
 * strings.
 */
export type UseCountBoundValue = string | Date | null;

/**
 * A statement ready to hand to a prepared-statement call: the text, and the values to bind to its
 * placeholders in the order the placeholders appear.
 *
 * JUDGMENT CALL: one uniform result shape for all four builders, with an open readonly array
 * rather than a fixed-length tuple per builder.
 */
export interface UseCountStatement {
  /**
   * The statement text. Exactly one `?` per bound value, and no interpolated value of any kind -
   * the only interpolation anywhere in this module is structural, appending a whole clause.
   */
  readonly sql: string;

  /**
   * The values to bind, in the order their placeholders appear in `sql`.
   *
   * Frozen at construction as well as typed `readonly`, because `readonly` is a compile-time claim
   * that erases at emit while the array is an ordinary array at runtime.
   */
  readonly params: readonly UseCountBoundValue[];
}

/**
 * Input to the promotion-period use count.
 *
 * JUDGMENT CALL: the two dates are required properties of a nullable type, not optional
 * properties.
 */
export interface PromotionPeriodUseCountInput {
  /**
   * Identifier of the promotion behind the period - not of the period itself.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L138]: the legacy binds
   * `arguments.promotionPeriod.getPromotion().getPromotionID()`, so applied promotions are counted
   * for the period's PROMOTION across every period, which is what the statement's predicate
   * compares.
   */
  readonly promotionID: string;

  /**
   * Lower bound of the counted window, or `null` when the period has no start date.
   *
   * Nullable because `startDateTime` is declared nullable on the entity with
   * `hb_nullRBKey="define.forever"` [model/entity/PromotionPeriod.cfc:L53].
   */
  readonly startDateTime: Date | null;

  /**
   * Upper bound of the counted window, or `null` when the period has no end date.
   */
  readonly endDateTime: Date | null;
}
export interface PromotionPeriodAccountUseCountInput extends PromotionPeriodUseCountInput {
  /**
   * Opaque identifier of the account whose use is counted.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L193]: the legacy takes `required any account` and
   * immediately reduces it to `getAccountID()`, so the identifier is exactly the value the legacy
   * query bound.
   */
  readonly accountID: string;
}

/**
 * Input to the promotion-code use count.
 */
export interface PromotionCodeUseCountInput {
  /**
   * Identifier of the promotion code whose use is counted.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L267]: the legacy binds
   * `arguments.promotionCode.getPromotionCodeID()`.
   */
  readonly promotionCodeID: string;
}

/**
 * Input to the promotion-code, single-account use count.
 */
export interface PromotionCodeAccountUseCountInput extends PromotionCodeUseCountInput {
  /**
   * Opaque identifier of the account whose use is counted [model/dao/PromotionDAO.cfc:L292].
   */
  readonly accountID: string;
}

/**
 * Count applied promotions for the promotion behind a promotion period, across every account.
 *
 * Legacy: `model/dao/PromotionDAO.cfc:L134-L185`, whose HQL body at L141-L179 is reproduced
 * verbatim below as an exhibit sitting directly above the text it became.
 *
 * @param input Already-resolved promotion identifier and the period's two nullable bounds.
 * @returns The statement text and its bind values, in placeholder order.
 */
function promotionPeriodUseCount(input: PromotionPeriodUseCountInput): UseCountStatement {
  // CFML parity [model/dao/PromotionDAO.cfc:L144-L145, L171, L238]: query 1 declares LEFT JOIN
  // pa.promotion pap and filters the joined alias; query 2 declares no such join and filters the
  // path pa.promotion.promotionID.

  // CFML parity [model/dao/PromotionDAO.cfc:L165-L169, L232-L236, L262, L284]: queries 1 and 2
  // LEFT JOIN their order-status types, so every status test is wrapped in (x is null or x != ?).

  // CFML parity [model/entity/PromotionApplied.cfc:L60]: the fulfillment join compares
  // `pa.orderfulfillmentID` against `orderf.orderFulfillmentID`, and the two spellings genuinely
  // differ.

  // JUDGMENT CALL: the `on` predicates are translation artifacts with no legacy counterpart.

  let sql = `SELECT count(pa.promotionAppliedID) as count
FROM
    SwPromotionApplied pa
  LEFT JOIN
    SwPromotion pap on pa.promotionID = pap.promotionID
  LEFT JOIN
    SwOrderItem oi on pa.orderItemID = oi.orderItemID
  LEFT JOIN
    SwOrder oio on oi.orderID = oio.orderID
  LEFT JOIN
    SwType oioost on oio.orderStatusTypeID = oioost.typeID

  LEFT JOIN
    SwOrder o on pa.orderID = o.orderID
  LEFT JOIN
    SwType oost on o.orderStatusTypeID = oost.typeID

  LEFT JOIN
    SwOrderFulfillment orderf on pa.orderfulfillmentID = orderf.orderFulfillmentID
  LEFT JOIN
    SwOrder ofo on orderf.orderID = ofo.orderID
  LEFT JOIN
    SwType ofoost on ofo.orderStatusTypeID = ofoost.typeID
WHERE
    (oioost.systemCode is null or oioost.systemCode != ?)
  and
    (oost.systemCode is null or oost.systemCode != ?)
  and
    (ofoost.systemCode is null or ofoost.systemCode != ?)
  and
    pap.promotionID = ?`;

  // Every occurrence of a named HQL parameter becomes its own placeholder and its own pushed
  // value, even where the value is identical.
  const params: UseCountBoundValue[] = [
    OST_NOT_PLACED,
    OST_NOT_PLACED,
    OST_NOT_PLACED,
    input.promotionID,
  ];

  // CFML parity [model/dao/PromotionDAO.cfc:L173-L175]: the lower bound is appended to the built
  // string rather than being part of it, so its placeholder lands after every predicate above -
  // and the comparison is strictly exclusive `>`, reproduced as written.
  if (input.startDateTime !== null) {
    sql += ' and pa.createdDateTime > ?';
    params.push(input.startDateTime);
  }

  // Pinned rather than repaired, and the pin is named precisely because a wrong pointer is worse
  // than none: `tests/integration/repositories/mysqlPromotionRepository.test.ts`, describe block
  // "PROMOTION_USE_COUNT_STATEMENTS.
  //
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177]: the second date guard tests
  // getStartDateTime() while assigning getEndDateTime() (L178), so the end-date filter is keyed
  // off the START date.
  // Preserved deliberately; do not fix without a product decision.
  if (input.startDateTime !== null) {
    sql += ' and pa.createdDateTime < ?';
    params.push(input.endDateTime);
  }

  return Object.freeze({ sql, params: Object.freeze(params) });
}

/**
 * Count applied promotions for the promotion behind a promotion period, for one account.
 *
 * Legacy: `model/dao/PromotionDAO.cfc:L187-L252`, whose HQL body at L196-L246 is reproduced
 * verbatim below.
 *
 * Bind arity: SEVEN values when the period has no start date, and NINE when it has one.
 *
 * @param input Already-resolved promotion and account identifiers, and the period's two nullable
 * bounds.
 * @returns The statement text and its bind values, in placeholder order.
 */
function promotionPeriodAccountUseCount(
  input: PromotionPeriodAccountUseCountInput,
): UseCountStatement {
  // CFML parity [model/dao/PromotionDAO.cfc:L238]: this statement declares no promotion join.

  // CFML parity [model/dao/PromotionDAO.cfc:L205-L206, L212-L213, L221-L222, L225-L229, L288]: the
  // account comparisons here go through three explicitly declared LEFT JOINs to the account -
  // `oioa`, `oa`, `ofoa` - and compare the joined table's primary key.

  // CFML parity [model/dao/PromotionDAO.cfc:L224-L230]: the three account tests form a single
  // parenthesised or group, conjoined with everything else.

  let sql = `SELECT count(pa.promotionAppliedID) as count
FROM
    SwPromotionApplied pa
  LEFT JOIN
    SwOrderItem oi on pa.orderItemID = oi.orderItemID
  LEFT JOIN
    SwOrder oio on oi.orderID = oio.orderID
  LEFT JOIN
    SwType oioost on oio.orderStatusTypeID = oioost.typeID
  LEFT JOIN
    SwAccount oioa on oio.accountID = oioa.accountID

  LEFT JOIN
    SwOrder o on pa.orderID = o.orderID
  LEFT JOIN
    SwType oost on o.orderStatusTypeID = oost.typeID
  LEFT JOIN
    SwAccount oa on o.accountID = oa.accountID

  LEFT JOIN
    SwOrderFulfillment orderf on pa.orderfulfillmentID = orderf.orderFulfillmentID
  LEFT JOIN
    SwOrder ofo on orderf.orderID = ofo.orderID
  LEFT JOIN
    SwType ofoost on ofo.orderStatusTypeID = ofoost.typeID
  LEFT JOIN
    SwAccount ofoa on ofo.accountID = ofoa.accountID
WHERE
    (
        oioa.accountID = ?
      or
        oa.accountID = ?
      or
        ofoa.accountID = ?
    )
  and
    (oioost.systemCode is null or oioost.systemCode != ?)
  and
    (oost.systemCode is null or oost.systemCode != ?)
  and
    (ofoost.systemCode is null or ofoost.systemCode != ?)
  and
    pa.promotionID = ?`;

  // Emitted-text order, and note that it differs from the order the legacy sets its parameter map
  // in [model/dao/PromotionDAO.cfc:L192-L194], where the promotion identifier is assigned first.
  const params: UseCountBoundValue[] = [
    input.accountID,
    input.accountID,
    input.accountID,
    OST_NOT_PLACED,
    OST_NOT_PLACED,
    OST_NOT_PLACED,
    input.promotionID,
  ];

  // CFML parity [model/dao/PromotionDAO.cfc:L240-L242]: exclusive `>` lower bound, appended after
  // the base statement so its placeholder lands last.
  if (input.startDateTime !== null) {
    sql += ' and pa.createdDateTime > ?';
    params.push(input.startDateTime);
  }

  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L244]: the identical duplicated guard, independently
  // present in getPromotionPeriodAccountUseCount - L244 tests getStartDateTime() while L245
  // assigns getEndDateTime(). Same two reachable failure states as L177.
  // Preserved deliberately; do not fix without a product decision.
  //
  // JUDGMENT CALL: this branch is duplicated from the period builder above rather than factored
  // into a shared helper, and the duplication is the point.
  if (input.startDateTime !== null) {
    sql += ' and pa.createdDateTime < ?';
    params.push(input.endDateTime);
  }

  return Object.freeze({ sql, params: Object.freeze(params) });
}

// CFML parity [model/dao/PromotionDAO.cfc:L254-L296]: first, they join with INNER JOIN rather than
// LEFT JOIN [model/dao/PromotionDAO.cfc:L259, L281], so an order that fails to join is excluded
// outright.

// JUDGMENT CALL: the alias `ost` is a translation artifact and has no legacy counterpart.

// JUDGMENT CALL: the alias `opc` is likewise a translation artifact.

// JUDGMENT CALL: PromotionCode.orders is declared lazy="extra"
// (model/entity/PromotionCode.cfc:L68), but these two statements use it only as an aggregate INNER
// JOIN inside COUNT().

/**
 * Count the orders that have used a promotion code, across every account.
 *
 * Legacy: `model/dao/PromotionDAO.cfc:L254-L272`, whose HQL body at L257-L265 is reproduced
 * verbatim below.
 *
 * @param input The already-resolved promotion-code identifier.
 * @returns The statement text and its two bind values, in placeholder order.
 */
function promotionCodeUseCount(input: PromotionCodeUseCountInput): UseCountStatement {
  /*
   * Verbatim legacy HQL - model/dao/PromotionDAO.cfc:L257-L265, the single string argument to
   * `ormExecuteQuery` opening at L257.
   */

  const sql = `SELECT count(o.orderID) as count FROM
    SwPromotionCode pc
  INNER JOIN
    SwOrderPromotionCode opc on pc.promotionCodeID = opc.promotionCodeID
  INNER JOIN
    SwOrder o on opc.orderID = o.orderID
  INNER JOIN
    SwType ost on o.orderStatusTypeID = ost.typeID
WHERE
    ost.systemCode != ?
  AND
    pc.promotionCodeID = ?`;

  // Two placeholders, two values, in emitted-text order. The legacy's own parameter map at
  // [model/dao/PromotionDAO.cfc:L266-L267] happens to list them in this same order, unlike query.
  const params: UseCountBoundValue[] = [OST_NOT_PLACED, input.promotionCodeID];

  return Object.freeze({ sql, params: Object.freeze(params) });
}

/**
 * Count the orders belonging to one account that have used a promotion code.
 *
 * Legacy: `model/dao/PromotionDAO.cfc:L274-L296`, whose HQL body at L278-L289 is reproduced
 * verbatim below.
 *
 * @param input The already-resolved promotion-code and account identifiers.
 * @returns The statement text and its three bind values, in placeholder order.
 */
function promotionCodeAccountUseCount(input: PromotionCodeAccountUseCountInput): UseCountStatement {
  // CFML parity [model/dao/PromotionDAO.cfc:L288]: the account predicate is `o.account.accountID`,
  // a path terminating in the identifier, so it dereferences `SwOrder.accountID`
  // [model/entity/Order.cfc:L63] directly and `SwAccount` is not joined.

  /*
   * Verbatim legacy HQL - model/dao/PromotionDAO.cfc:L278-L289, the single string argument to
   * `ormExecuteQuery` opening at L278.
   */

  const sql = `SELECT count(o.orderID) as count
FROM
    SwPromotionCode pc
  INNER JOIN
    SwOrderPromotionCode opc on pc.promotionCodeID = opc.promotionCodeID
  INNER JOIN
    SwOrder o on opc.orderID = o.orderID
  INNER JOIN
    SwType ost on o.orderStatusTypeID = ost.typeID
WHERE
    ost.systemCode != ?
  AND
    pc.promotionCodeID = ?
  AND
    o.accountID = ?`;

  // Three placeholders, three values, in emitted-text order
  // [model/dao/PromotionDAO.cfc:L290-L292].
  const params: UseCountBoundValue[] = [OST_NOT_PLACED, input.promotionCodeID, input.accountID];

  return Object.freeze({ sql, params: Object.freeze(params) });
}

// JUDGMENT CALL: nothing in this module binds a comma list, so the one documented exception to
// per-value parameterization elsewhere in this port does not reach here.

/**
 * The four promotion use-count statement builders.
 *
 * JUDGMENT CALL: one exported const object grouping four builders, rather than four separate
 * top-level function exports.
 *
 * JUDGMENT CALL: the member names are the legacy method names with their `get` prefix dropped,
 * since these are statement builders rather than the accessor methods themselves -
 * `getPromotionPeriodUseCount` becomes `promotionPeriodUseCount`, and so on.
 */
export const PROMOTION_USE_COUNT_STATEMENTS = Object.freeze({
  promotionPeriodUseCount,
  promotionPeriodAccountUseCount,
  promotionCodeUseCount,
  promotionCodeAccountUseCount,
});
