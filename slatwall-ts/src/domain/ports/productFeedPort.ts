// Product-feed generation contract, kept separate from the integration interface, whose documented
// type vocabulary carries no feed type [integrationServices/IntegrationInterface.cfc:L63-L72].
//
// Replaces `public void function product(required struct rc)`
// [integrationServices/google/controllers/feed.cfc:L58], which returned nothing and instead
// suppressed the layout and left a smart list on the request context for a view to render.
//
// The signature is `generateProductFeed(criteria)`, one argument returning the document, because
// AAP 0.4.2 specifies it and AAP 0.9.2 counts it as one of exactly three permitted signature
// reshapings. The legacy subsystem exposed a single public action -
// `this.publicMethods="product"` [integrationServices/google/controllers/feed.cfc:L54] - so one
// method is the whole contract.

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L58-L63]: the feed query's
// select list ends in a trailing comma before `FROM` and its `INNER JOIN` carries no `ON` clause,
// so the statement cannot execute as written.
// Preserved deliberately; do not fix without a product decision.
/**
 * The per-request inputs of one feed generation - the type AAP 0.4.2 names.
 *
 * `feedHost` is `CGI.HTTP_HOST`, which the legacy template interpolated into every product link
 * and into the channel's own link `integrationServices/google/views/feed/product.cfm`.
 */
export interface FeedCriteria {
  /**
   * The origin's AUTHORITY - host, optionally with a port - and nothing else.
   *
   * Already normalised and already checked against the deployment's allow-list by the composition
   * root before it reaches here; `../../integrations/google/rssFeedRenderer.js` re-validates its
   * grammar as the last line of defence.
   */
  readonly feedHost: string;

  /**
   * The instant this document is generated at, and the instant every sale-price effective-date
   * range in it is evaluated against.
   *
   * Treated as read-only by every consumer: the renderer reads it and does not mutate it, so one
   * `Date` may be shared across the whole document without any consumer moving another's baseline.
   */
  readonly now: Date;
}

/**
 * The product-feed generation capability.
 */
export interface ProductFeedPort {
  /**
   * Build the product feed document.
   *
   * CFML parity [integrationServices/google/controllers/feed.cfc:L68-L72]: the four filters are
   * fixed rather than chosen by the caller - the SKU is active, its product is active and
   * published, and the product's calculated quantity available to sell is at least one - so
   * {@link FeedCriteria} does not carry them.
   *
   * @param criteria the per-request context of this one generation - the origin authority and the
   * instant.
   * @returns the whole feed as one RSS 2.0 document string for machine consumption by Google
   * Merchant Center.
   */
  generateProductFeed(criteria: FeedCriteria): Promise<string>;
}
