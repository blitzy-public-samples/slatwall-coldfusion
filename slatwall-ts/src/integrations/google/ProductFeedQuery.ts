/**
 * ProductFeedQuery — the record-selection half of the Google merchant product feed, translated out of
 * `integrationServices/google/controllers/feed.cfc:L49-L74` and layered on top of
 * `model/service/SkuService.cfc:L309-L325`.
 *
 * M2 (AAP §0.6.6) is flagged and owned by `../../handlers/googleFeedHandler.ts`: the legacy view asks for
 * `requesttimeout="360"` at `integrationServices/google/views/feed/product.cfm:L9`, and the choice of an
 * asynchronous or streamed delivery model is left to the deployment. Nothing here pages, chunks, caps or
 * re-times the selection to fit a ceiling, so this file settles no part of that decision.
 *
 * TODO(parity) D12 — `integrationServices/google/model/dao/FeedDAO.cfc` is orphaned dead code and is not
 * ported; its itemised evidence lives in `./README.md` §9, the one home for the entry.
 */

/*
 * Imports — five modules, all downward, all relative and extensionless, and all but two type-only.
 */
import { DomainError } from '../../errors/DomainError';
import { composeSkuSmartListQuery } from '../../ports/SmartListQueryPort';

import type { Sku } from '../../domain/sku/Sku';
import type {
  SmartListInput,
  SmartListJoin,
  SmartListQueryPort,
} from '../../ports/SmartListQueryPort';
import type { SMART_LIST_RANGE_DELIMITER } from '../../ports/SmartListQueryPort';

/*
 * The feed's three related-property joins, in the exact order feed.cfc registers them.
 * TODO(parity): feed join #1 is a duplicate, and it is carried rather than collapsed. The SKU smart
 * list's own base list already declares the identical join at `model/service/SkuService.cfc:L314` —
 * `../../ports/SmartListQueryPort.ts` carries it, and both `skuService.getSkuSmartList` and this
 * file inherit it from there — and the controller re-issues it at
 * `integrationServices/google/controllers/feed.cfc:L64` because the feed layers onto the smart list
 * returned by the zero-argument call at feed.cfc:L63. both locators are named because the phrase
 * "duplicate product join" is unintelligible until they are. De-duplicating would be repairing
 * rather than preserving (AAP §0.8.2 Guideline 4), so both joins are emitted exactly as the legacy
 * emits them.
 */
export const PRODUCT_FEED_JOINS: readonly SmartListJoin[] = Object.freeze([
  // feed.cfc:L64 — join kind omitted; a duplicate of SkuService.cfc:L314, carried deliberately.
  Object.freeze({
    parentEntityName: 'SlatwallSku',
    relatedProperty: 'product',
  }),
  // feed.cfc:L65 — join kind omitted. `defaultSku`, not a second `product` join.
  Object.freeze({
    parentEntityName: 'SlatwallProduct',
    relatedProperty: 'defaultSku',
  }),
  // feed.cfc:L66 — `left` is load-bearing: an inner join would drop every brandless product.
  Object.freeze({
    parentEntityName: 'SlatwallProduct',
    relatedProperty: 'brand',
    joinType: 'left',
  }),
]);

/** The value all three feed filters test for, taken verbatim from feed.cfc:L68-L70. */
const PRODUCT_FEED_FLAG_FILTER_VALUE = 1;

/**
 * The availability gate's range value, taken verbatim from feed.cfc:L72: the two characters `1^`.
 */
const PRODUCT_FEED_AVAILABILITY_RANGE: `1${typeof SMART_LIST_RANGE_DELIMITER}` = '1^';

/**
 * The filter-and-range half of the feed's record selection — four of the seven feed additions of
 * feed.cfc:L64-L72. The other three are the joins, which travel as {@link PRODUCT_FEED_JOINS} through
 * the structural channel rather than through this map (translation decision).
 */
const PRODUCT_FEED_INPUT: SmartListInput = Object.freeze({
  /*
   * feed.cfc:L64-L66, in source order, appended after SkuService.cfc:L314-L316 by the translator.
   */
  additionalJoins: PRODUCT_FEED_JOINS,
  // feed.cfc:L68.
  'F:activeFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L69.
  'F:product.activeFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L70.
  'F:product.publishedFlag': PRODUCT_FEED_FLAG_FILTER_VALUE,
  // feed.cfc:L72 — the availability gate; `1^` means `>= 1` with no upper bound.
  'R:product.calculatedQATS': PRODUCT_FEED_AVAILABILITY_RANGE,
});

/*
 * Removed here: A feed-local relationship assembler. The paragraph above records why.
 * A `ProductFeedRelationshipAssembler` class stood at this point, together with the four helpers only
 * it used — an in-filter list delimiter, a distinct-identifier collector, an index-by-identifier map
 * builder and a resolve-or-raise lookup — and `ProductFeedQuery` took its `resolve` member as a second
 * constructor parameter. All of it is gone, and the deletion is a decision rather than a tidy-up.
 */

/**
 * The single capability the feed's selection needs: one records-only execution of a described query.
 */
export type ProductFeedSkuSource = Pick<SmartListQueryPort, 'executeRecords'>;

/**
 * The Google product feed's record selection: the port of the seven working lines of
 * `integrationServices/google/controllers/feed.cfc`.
 */
/** Optional invocation-scoped controls for one {@link ProductFeedQuery.getFeedSkus} call. */
export interface ProductFeedQueryOptions {
  /** A cancellation signal owned by the caller. */
  readonly signal?: AbortSignal;
}

export class ProductFeedQuery {
  /**
   * @param skuSelection the records-only execution seam — see {@link ProductFeedSkuSource}. The
   * composition root hands over the one smart-list query port the graph holds, narrowed to its
   * records-only member; nothing here holds a service, a repository, an executor or a pool.
   */
  public constructor(private readonly skuSelection: ProductFeedSkuSource) {}

  /*
   * reads the SKUs the feed contains.  @param options optional invocation-scoped controls that
   * change neither the selection nor its order; see {@link ProductFeedQueryOptions}  @throws
   * {DomainError} when {@link ProductFeedQueryOptions.signal} is already aborted, in which case no
   * statement is issued at all  @returns The feed's SKUs, unpaged, in the selection's own order —
   * exactly the collection `integrationServices/google/views/feed/product.cfm:L16` loops. Nothing
   * is re-shaped, re-ordered or paged on the way out.
   */
  public async getFeedSkus(options?: ProductFeedQueryOptions): Promise<Sku[]> {
    /*
     * The one boundary this member has, checked before it is crossed. Everything above this
     * line is synchronous composition and everything below it is a single read, so there is exactly one
     * place a cancellation can be honoured without abandoning work in progress. Nothing is invented: no
     * signal is created here, no deadline is derived and no budget is imposed; with no signal supplied
     * this is a no-op and the read is issued exactly as before.
     */
    if (options?.signal?.aborted === true) {
      throw new DomainError(
        'The Google product feed selection was cancelled before it was issued.',
      );
    }

    // feed.cfc:L63 with L68-L72 folded in: one call, with the selection declared up front. Every
    // companion argument is left unsupplied, matching the legacy call exactly.
    /*
     * The joins travel inside {@link PRODUCT_FEED_INPUT}, not as a companion argument — and the choice
     * decides an observable value, so it is argued rather than assumed.
     */
    /*
     * feed.cfc:L63 with L68-L72 folded in: one described selection, executed once, with every companion
     * argument left unsupplied — which matches `feed.cfc:L63` calling the member with no arguments at all.
     */
    return this.skuSelection.executeRecords(composeSkuSmartListQuery(PRODUCT_FEED_INPUT));
  }
}
