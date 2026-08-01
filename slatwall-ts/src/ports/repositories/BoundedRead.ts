/* ================================================================================================
 * `BoundedRead` — the explicit, caller-stated window every bounded repository read takes, and the
 * result shape that reports what the window left behind.
 *
 * ------------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A PORT
 * ------------------------------------------------------------------------------------------------
 * It carries no legacy origin, because the legacy has none to carry: not one of the four Catalog
 * data-access components bounds a read. `model/dao/SkuDAO.cfc:L130-L148`, `model/dao/
 * ProductDAO.cfc:L419-L437`, `model/dao/OptionDAO.cfc:L51-L92` and `:L94-L117` all return every
 * matching row, and `model/dao/ProductTypeDAO.cfc:L54-L62` returns the whole table. Those members are
 * ported exactly as they are and REMAIN UNBOUNDED — see the paragraph below, which is the single most
 * important thing in this file.
 *
 * What this file supplies is the vocabulary for the ADDITIONAL, EXPLICITLY BOUNDED members that sit
 * beside them. Those members are new API surface, deliberately: a caller that can state a bound
 * should be able to state one, and the alternative — silently capping the unbounded members — would
 * substitute a confidently wrong answer for a large right one. AAP §0.7.3 S9 and §0.8.2 Guideline 4
 * both forbid that substitution, so the bound is a parameter and never a default.
 *
 * It is NOT a port. It declares no capability and nothing implements it; it is the shared parameter
 * and return vocabulary for members declared on the five repository ports in this folder. It lives
 * here rather than being repeated in each of them for one concrete reason: `test/support/
 * inMemoryRepositories.ts` imports from all five ports at once, so five identically named local
 * declarations would collide at every import site and force alias noise into the one file the whole
 * suite depends on. One declaration, imported by name, removes that. AAP §0.4.4 authorises the
 * `slatwall-ts/src/ports/**` subtree for creation, which is the authority this file rests on.
 *
 * ------------------------------------------------------------------------------------------------
 * ⚠️⚠️ NOTHING HERE TRUNCATES SILENTLY, AND THAT IS THE WHOLE DESIGN
 * ------------------------------------------------------------------------------------------------
 * A bound that quietly drops rows is worse than no bound at all: the caller receives a short answer
 * it cannot distinguish from a complete one. {@link BoundedReadResult} therefore reports
 * {@link BoundedReadResult.hasMore} alongside the rows, and the adapters produce it by asking the
 * database for ONE MORE ROW than the caller wanted and reporting whether it arrived. So:
 *
 *   - `hasMore === false` — the window reached the end of the match set. The rows ARE the remainder.
 *   - `hasMore === true`  — at least one further row exists past the window. The caller decides
 *                          whether to advance {@link BoundedReadWindow.offset} and read again.
 *
 * The probe row itself is never returned. `rows.length` is always at most
 * {@link BoundedReadWindow.limit}.
 *
 * ------------------------------------------------------------------------------------------------
 * ⚠️ ROW ORDER IS THE UNDERLYING STATEMENT'S, AND FOR TWO OF THE FOUR BOUNDED MEMBERS THAT MEANS
 * THERE IS NONE
 * ------------------------------------------------------------------------------------------------
 * A bounded read cannot invent an ordering to page over. `model/dao/ProductDAO.cfc:L421` and
 * `model/dao/SkuDAO.cfc:L132` declare NO `ORDER BY`, so their bounded counterparts inherit the
 * engine's order and successive windows are not guaranteed to be disjoint or exhaustive. Adding a
 * sort term to make paging stable would change the order the existing unbounded members return —
 * observable output — and is forbidden by AAP §0.8.2 Guideline 4 and §0.7.3 S9. The honest contract is
 * therefore stated rather than engineered around: the two search windows are for bounding COST, and a
 * caller that needs stable paging must use a member whose statement already orders. The two
 * unused-option members do order — `model/dao/OptionDAO.cfc:L90-L92` and `:L115-L117` — so their
 * bounded counterparts page deterministically.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ALLOWED TO TOUCH (AAP §0.7.3 S4 — hexagonal separation)
 * ------------------------------------------------------------------------------------------------
 * It imports NOTHING, and cannot: it is two type declarations over `number`, `boolean` and a caller's
 * row type. No domain type, no adapter type, no driver type and no AWS type appears, so it is
 * readable from the port layer, the adapter layer, the service layer and the test suite without any of
 * them acquiring a dependency through it.
 * ============================================================================================== */

/**
 * The window a caller states for a bounded read.
 *
 * BOTH FIELDS ARE REQUIRED, AND NEITHER HAS A DEFAULT. An optional `limit` would need a fallback, and
 * any fallback would be a number the source does not state (AAP §0.7.3 S9, IR-12). Making the caller
 * say what it can afford is the point of the member existing.
 *
 * The adapters validate both fields before composing a statement and raise on a non-integer, a
 * non-positive `limit` or a negative `offset`, rather than clamping. Clamping would silently answer a
 * different question than the one asked.
 *
 * ⚠️ `offset` IS ZERO-BASED, AND THAT DIFFERS FROM THE SMART LIST. The smart-list port's
 * `pageRecordsStart` is ONE-based, because `org/Hibachi/HibachiSmartList.cfc` is one-based and that
 * value is carried from legacy source. This window carries nothing from legacy source — there is no
 * bounded legacy read to carry from — so it uses the zero-based convention the driver's own `OFFSET`
 * clause uses, and says so here so the two are never confused. A window of `{ limit: 10, offset: 0 }`
 * and a smart-list page of `pageRecordsStart: 1, pageRecordsShow: 10` select the same rows.
 */
export interface BoundedReadWindow {
  /**
   * The maximum number of rows to return. Must be a positive integer.
   *
   * The returned array holds at most this many rows. The adapter reads one more than this internally
   * to decide {@link BoundedReadResult.hasMore}, and never returns that extra row.
   */
  readonly limit: number;

  /**
   * How many matching rows to skip before the window starts. Must be a non-negative integer.
   *
   * Zero-based, per the warning on {@link BoundedReadWindow}. An offset past the end of the match set
   * yields an empty array with `hasMore` false, which is a correct answer and not an error.
   */
  readonly offset: number;
}

/**
 * The result of a bounded read: the rows inside the window, and whether anything lies past it.
 *
 * @typeParam Row - the row type the underlying unbounded member already returns. A bounded member
 *   returns THE SAME row type, mapped by the same mapper, so the two differ only in how many rows
 *   arrive. Nothing about a row's shape or content depends on which member read it.
 */
export interface BoundedReadResult<Row> {
  /**
   * The rows inside the window, in the underlying statement's order.
   *
   * At most {@link BoundedReadWindow.limit} entries. Possibly empty — an offset past the end of the
   * match set is a legitimate window.
   *
   * Declared `readonly` because a bounded result is a report about a read rather than a working
   * collection: the unbounded members hand back a mutable array precisely because their legacy call
   * sites mutate it in place, and no such call site exists for these members to honour.
   */
  readonly rows: readonly Row[];

  /**
   * Whether at least one further row exists past the end of the window.
   *
   * ⚠️ THIS IS THE FIELD THAT MAKES THE BOUND HONEST. A caller that ignores it has silently
   * reintroduced truncation, which is the exact failure the bounded members exist to avoid. `false`
   * means the rows above are the complete remainder of the match set.
   */
  readonly hasMore: boolean;
}
