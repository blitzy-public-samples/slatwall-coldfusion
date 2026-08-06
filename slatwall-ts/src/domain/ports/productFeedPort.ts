// Product-feed generation contract, kept separate from the integration interface.
//
// Replaces `public void function product(required struct rc)`
// [integrationServices/google/controllers/feed.cfc:L58], which returned nothing: it suppressed the
// layout, built a Hibachi SmartList of SKUs and deferred rendering to a `.cfm` view. Here the
// finished document is returned as a string.
//
// The legacy subsystem exposed a single public action - `this.publicMethods="product"`
// [integrationServices/google/controllers/feed.cfc:L54] - so one method is the complete outcome.
//
// ★★★ QUOTE-THEN-REVISE: THE METHOD TAKES ONE ARGUMENT, AND THAT IS THE MAPPED SIGNATURE.
// This header used to end: "The method takes NO arguments because the legacy action reads nothing
// back out of the request context and calls its smart-list factory with none." The OBSERVATION is
// correct and independently re-verified - [integrationServices/google/controllers/feed.cfc:L58-L73]
// only ever WRITES to `rc`, and every one of the four filters is a literal in that body - but the
// CONCLUSION dropped a frozen parameter. AAP 0.4.2 maps this method as
// `async generateProductFeed(criteria: FeedCriteria): Promise<string>` and records it as ONE OF THE
// THREE PERMITTED SIGNATURE RESHAPINGS for the whole migration; AAP 0.9.2 then makes every row of
// that table a parity gate and admits no fourth reshaping. Deleting the declared parameter was a
// fourth. A prior review round accepted the deletion as "RULING B"; a review ruling is not the AAP,
// and where the two disagree the frozen plan governs.
//
// NOTHING ABOUT THE FOUR FILTERS CHANGES, AND {@link FeedCriteria} DOES NOT CARRY THEM. They stay
// invariants of the ported statement, unreachable from a caller. What the criteria carries is the
// per-request context the legacy took from CGI scope and the clock - see its own docblock - so this
// is a relocation of where two existing values ENTER, not a widening of what a caller may select.
// No observable behaviour changes: the same host and the same instant reach the renderer.
//
// The two module-scope markers below must stay at module scope: TypeScript emits them from there,
// and moving them into the interface body would silently delete them from the build.

// LEGACY-DEFECT [integrationServices/google/model/dao/FeedDAO.cfc:L58-L63]: the feed query's select
// list ends in a trailing comma before `FROM` and its `INNER JOIN` carries no `ON` clause, so the
// statement cannot execute as written.
//
// Preserved deliberately; do not fix without a product decision.
//
// LEGACY-NOTE [integrationServices/google/controllers/feed.cfc:L63-L72]: the controller never calls
// that DAO; it expresses the same filter set through a SKU smart list, and states the quantity
// bound as `>= 1` where the DAO states `> 0`.
//
// Retained to preserve the cited legacy behavior.
/**
 * The per-request inputs of one feed generation - the type AAP 0.4.2 names.
 *
 * ★★★ WHAT IT CARRIES AND WHY THOSE TWO VALUES AND NO OTHERS. Both members are values the legacy
 * feed read from REQUEST scope, which is precisely the scope the FW/1 `rc` struct stood for at
 * [integrationServices/google/controllers/feed.cfc:L58]:
 *
 *   `feedHost` is `CGI.HTTP_HOST`, which the legacy template interpolated into every product link
 *   and into the channel's own link [integrationServices/google/views/feed/product.cfm]. It is the
 *   AUTHORITY only - no scheme, no path - because the scheme is a frozen `http://` literal owned by
 *   `../../integrations/google/rssFeedRenderer.js`.
 *
 *   `now` is the instant the request is pinned to. The legacy read the clock per request, and every
 *   generated-at stamp and every sale-price effective-date comparison in one document must agree, so
 *   the instant is supplied once rather than sampled per item.
 *
 * ★★★ WHAT IT DELIBERATELY DOES NOT CARRY, so that no reader mistakes this for a query object.
 * NO selection criteria of any kind: no product identifier, no SKU identifier, no brand, no
 * category, no date window, no page, no limit, no sort and no switch for any of the four filters.
 * Those four - the SKU is active [integrationServices/google/controllers/feed.cfc:L68], its product
 * is active [:L69], its product is published [:L70], and its product has an open-ended quantity
 * available to sell from one upward [:L72] - are INVARIANTS of the ported statement, enforced in
 * `../../integrations/google/googleFeedRepository.js`, and the legacy action reads nothing back out
 * of `rc` that could narrow them. Adding a member here that narrowed the feed would change
 * observable behaviour and invent a capability the source never had.
 *
 * ALSO ABSENT: no account. The legacy action established none, so the feed is anonymous.
 *
 * ★ NEITHER MEMBER IS OPTIONAL. A feed document cannot be composed without an origin authority, and
 * a missing instant would have to be defaulted by sampling a clock inside the domain - which is
 * exactly the ambient state transformation rule T6 removes. The caller that owns the request owns
 * both values, so it supplies both; `../../handlers/productFeedHandler.js` refuses a request that
 * carries no usable host before it ever reaches this contract.
 */
export interface FeedCriteria {
  /**
   * The origin's AUTHORITY - host, optionally with a port - and nothing else.
   *
   * Already normalised and already checked against the deployment's allow-list by the composition
   * root before it reaches here; `../../integrations/google/rssFeedRenderer.js` re-validates its
   * grammar as the last line of defence, because a port contract is open to any caller and a
   * `string` is not a proof of anything.
   */
  readonly feedHost: string;

  /**
   * The instant this document is generated at, and the instant every sale-price effective-date range
   * in it is evaluated against.
   *
   * Treated as read-only by every consumer: the renderer reads it and does not mutate it, so one
   * `Date` may be shared across the whole document without any consumer moving another's baseline.
   */
  readonly now: Date;
}

/**
 * The product-feed generation capability.
 *
 * Implemented by adapting `src/integrations/google/googleFeedService.ts`.
 *
 * THIS IS NOT A REPOSITORY PORT. Six of the thirteen ports in this folder have a MySQL adapter
 * under `src/repositories/mysql/` - product, SKU, option, product-type, promotion and price-group -
 * and this is not one of them. It is not adapterless either, and the paragraph that once said so
 * has been corrected here: this port's implementation is `GoogleFeedService`, which declares
 * `implements ProductFeedPort` in `src/integrations/google/googleFeedService.ts`, and it is the ONLY
 * port outside `src/repositories/mysql/` with an implementing file. SIX ports have no implementing
 * file anywhere under `src/` - `settingsProvider`, `addressZoneEvaluator`, `urlTitleGenerator`,
 * `imageStore`, `subscriptionTermProvider` and `currencyConverter` - and those six are the ones the
 * composition root must satisfy itself.
 *
 * QUOTE-THEN-REVISE: this paragraph used to end "exactly as `currencyConverter` is implemented by
 * `src/integrations/europeanCentralBankCurrencyConverter.ts`. FIVE ports have no implementing file".
 * That module was withdrawn as unplanned architecture - AAP 0.3.1 does not enumerate it - and its
 * behaviour moved into the composition root. The figure read seven, then six, then five as adapters
 * shipped, and is six again after that withdrawal; it is derived from the folder here so the next
 * reader can re-derive it the same way rather than trusting a remembered number.
 */
export interface ProductFeedPort {
  /**
   * Build the product feed document.
   *
   * CFML parity [integrationServices/google/controllers/feed.cfc:L68-L72]: the included SKUs are
   * fixed rather than chosen by the caller — the SKU is active, its product is active and
   * published, and the product has quantity available to sell — which is why {@link FeedCriteria}
   * carries no selection member. The legacy controller returns nothing and defers rendering to a
   * view; the document is returned here instead.
   *
   * FOUR SELECTION FILTERS, ALWAYS APPLIED. They are invariants of this contract, not options, and
   * none is switchable by a caller: the SKU is active
   * [integrationServices/google/controllers/feed.cfc:L68]; its product is active [:L69]; its
   * product is published [:L70]; and its product has a positive quantity available to sell,
   * expressed in the legacy as an open-ended range from one upward [:L72]. All four are enforced in
   * `src/integrations/google/googleFeedRepository.ts`.
   *
   * `integrationServices/google/model/dao/FeedDAO.cfc:L52-L75` is NOT the provenance of this method
   * and is not ported: it is both syntactically invalid and provably uncalled. The module-scope
   * marker above records that finding.
   *
   * @param criteria the per-request context of this one generation - the origin authority and the
   *   instant. It narrows NOTHING; see {@link FeedCriteria} for the full account of why it carries
   *   those two members and no selection member.
   * @returns the whole feed as one RSS 2.0 document string for machine consumption
   *   by Google Merchant Center. Rendering is owned by
   *   `src/integrations/google/rssFeedRenderer.ts`; monetary values are presented
   *   there through `Money`, so no monetary type crosses this boundary.
   */
  generateProductFeed(criteria: FeedCriteria): Promise<string>;
}
