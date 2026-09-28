// Google Merchant Center product feed - orchestration.
//
// This module owns one decision: the ORDER of two collaborators.
//
// GRAMMAR is `./rssFeedRenderer.js`'s, which refuses a scheme, credentials, a path, a query, a
// fragment, whitespace, control characters, a non-ASCII byte and emptiness.
//
// The HAZARD it names was real; the DESIGN that avoided it was the wrong one.

// The first import is deliberately a RUNTIME import: `tsconfig.build.json` keeps comments, but the
// compiler erases a type-only import statement together with the comment block attached to it.
import { renderGoogleProductFeed } from './rssFeedRenderer.js';
// Nothing is IMPORTED from `src/lib/config.ts`: this adapter holds no configuration edge at all.
import type { FeedCriteria, ProductFeedPort } from '../../domain/ports/productFeedPort.js';
import type { GoogleFeedRepository } from './googleFeedRepository.js';

export type GoogleProductFeedRenderer = typeof renderGoogleProductFeed;

/**
 * The row-source collaborator: the one repository capability this module consumes. Derived from
 * `./googleFeedRepository.js`, which owns it.
 *
 * JUDGMENT CALL: narrowed to the one method consumed rather than typed as the whole repository
 * class, and narrowed by reference so that it tracks the real one. Two consequences.
 *
 * The repository's constructor collaborators, its statement text and its private hydration helpers
 * are none of this module's business.
 */
export type GoogleProductFeedRowSource = Pick<GoogleFeedRepository, 'fetchProductFeedRows'>;

// The feed host is a plain string, and no host policy lives in this module.
//
// Every absolute URL in the document - the channel link, the channel description, each item's
// link, its image link and each additional image link.
//
// PROVENANCE is the composition root's, and it is stated as a documented obligation on the
// constructor parameter below.

/**
 * Orchestrates the Google Merchant Center product feed: one query, one rendered document.
 *
 * JUDGMENT CALL: the class name is `GoogleFeedService`, following the sibling adapter's precedent -
 * interface parity binds method names, not class names, and the one method below is
 * `generateProductFeed(criteria)` exactly as AAP 0.4.2 specifies.
 *
 * Both collaborators are constructor-injected, which is what replaces the framework's dependency
 * injection with wiring the compiler checks; the renderer parameter defaults to the real renderer so
 * a caller needs to supply only the row source.
 */
export class GoogleFeedService implements ProductFeedPort {
  private readonly repository: GoogleProductFeedRowSource;

  private readonly renderFeed: GoogleProductFeedRenderer;

  /**
   * Constructs the feed generator from its collaborators alone.
   *
   * @param repository the sole route to feed data.
   * @param renderFeed the document renderer, defaulted to the real one.
   */
  constructor(
    repository: GoogleProductFeedRowSource,
    renderFeed: GoogleProductFeedRenderer = renderGoogleProductFeed,
  ) {
    this.repository = repository;
    this.renderFeed = renderFeed;
  }

  /**
   * Builds the whole feed document for one request.
   *
   * The legacy controller's dead DAO collaborator
   * [integrationServices/google/model/dao/FeedDAO.cfc:L52-L75] is not carried forward: its query
   * cannot execute as written, and the live filter set is the controller's own
   * [integrationServices/google/controllers/feed.cfc:L68-L72].
   *
   * @param criteria the per-request context of this one generation: the origin authority and the
   * instant.
   * @returns the whole feed as a single RSS 2.0 document string, for machine consumption by Google
   * Merchant Center.
   * @throws whatever either collaborator raises, unchanged and unwrapped - a column narrowing
   * failure, a malformed monetary numeral or a driver-level read failure from the row source.
   */
  async generateProductFeed(criteria: FeedCriteria): Promise<string> {
    // CFML parity [integrationServices/google/controllers/feed.cfc:L58-L73]: the legacy performed
    // one selection and then rendered it once, in that order, for one request.
    //
    // The criteria is not consulted here and must not be: the selection is invariant, so nothing
    // about this read depends on which request asked for it.
    const rows = await this.repository.fetchProductFeedRows();

    // Straight through: the rows are neither filtered, sorted, sliced, mapped nor copied, and the
    // origin's authority and the instant are forwarded exactly as they were supplied.
    return this.renderFeed(rows, criteria.feedHost, criteria.now);
  }
}
