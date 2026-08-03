// Product-feed generation contract, kept separate from the integration interface.
//
// Replaces `public void function product(required struct rc)`
// [integrationServices/google/controllers/feed.cfc:L58], which returned nothing: it suppressed the
// layout, built a Hibachi SmartList of SKUs and deferred rendering to a `.cfm` view. Here the
// finished document is returned as a string.
//
// The legacy subsystem exposed a single public action - `this.publicMethods="product"`
// [integrationServices/google/controllers/feed.cfc:L54] - so one method is the complete outcome.
// The method takes NO arguments because the legacy action reads nothing back out of the request
// context and calls its smart-list factory with none.
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
 * The product-feed generation capability.
 *
 * Implemented by adapting `src/integrations/google/googleFeedService.ts`.
 *
 * THIS IS NOT A REPOSITORY PORT. Six of the thirteen ports in this folder have a MySQL adapter
 * under `src/repositories/mysql/` - product, SKU, option, product-type, promotion and price-group -
 * and this is not one of them. It is not adapterless either, and the paragraph that once said so
 * has been corrected here: this port's implementation is `GoogleFeedService`, which declares
 * `implements ProductFeedPort` in `src/integrations/google/googleFeedService.ts`, exactly as
 * `currencyConverter` is implemented by `src/integrations/europeanCentralBankCurrencyConverter.ts`.
 * FIVE ports have no implementing file anywhere under `src/` - `settingsProvider`,
 * `addressZoneEvaluator`, `urlTitleGenerator`, `imageStore` and `subscriptionTermProvider` - and
 * those five are the ones the composition root must satisfy itself. The figure read seven, then
 * six, as the two integration adapters shipped; it is derived from the folder here so the next
 * reader can re-derive it the same way.
 */
export interface ProductFeedPort {
  /**
   * Build the product feed document.
   *
   * CFML parity [integrationServices/google/controllers/feed.cfc:L68-L72]: the included SKUs are
   * fixed rather than chosen by the caller — the SKU is active, its product is active and
   * published, and the product has quantity available to sell — which is why this takes no
   * arguments. The legacy controller returns nothing and defers rendering to a view; the document
   * is returned here instead.
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
   * @returns the whole feed as one RSS 2.0 document string for machine consumption
   *   by Google Merchant Center. Rendering is owned by
   *   `src/integrations/google/rssFeedRenderer.ts`; monetary values are presented
   *   there through `Money`, so no monetary type crosses this boundary.
   */
  generateProductFeed(): Promise<string>;
}
