// Subscription term / subscription benefit lookup port.
//
// The narrow port through which the OUT-OF-SCOPE subscription branch of `SkuService.createSkus()`
// [model/service/SkuService.cfc:L139-L202] resolves a subscription term and a subscription benefit
// by identifier.
//
// It is a STUB PORT by design: the subscription module is out of scope, so this declares the lookup
// shape the in-scope branch needs and nothing more. No subscription business logic is ported, and
// results are modelled as opaque identifiers rather than as subscription entities.
export interface SubscriptionTermHandle {
  readonly handleType: 'subscriptionTerm';

  readonly subscriptionTermID: string;
}

/**
 * A reference to one subscription benefit.
 */
export interface SubscriptionBenefitHandle {
  readonly handleType: 'subscriptionBenefit';

  readonly subscriptionBenefitID: string;
}

/**
 * The subscription-term and subscription-benefit lookup port.
 *
 * ONE OF EXACTLY TWO STUB PORTS in `src/domain/ports/` (the other is `imageStore`): a narrow
 * interface with DOCUMENTED STUB BEHAVIOUR, NOT a partial implementation. The contract is whole and
 * honestly typed; only its implementation is a stub, and that implementation belongs to the
 * composition root - this port has no adapter under `src/repositories/**`.
 *
 * It replaces the DI/1 property `property name="subscriptionService";`, declared at
 * [model/service/SkuService.cfc:L55] and [model/service/ProductService.cfc:L59], with an explicit
 * constructor parameter on the services that need it. It must never be reached through a service
 * locator.
 *
 * SCOPE - WHAT THIS PORT DOES AND DOES NOT COVER It covers the subscription branch of `createSkus`
 * [model/service/SkuService.cfc:L139-L172] and the term lookup in the out-of-scope
 * `processProduct_addSubscriptionTerm` [model/service/ProductService.cfc:L173].
 *
 * It DOES NOT COVER the `contentAccess` branch [model/service/SkuService.cfc:L173-L202], which
 * reaches `getContentService().getContent( <id> )` at [model/service/SkuService.cfc:L187] and
 * [model/service/SkuService.cfc:L196]. That branch has NO PORT AND NONE MAY BE INVENTED: there is
 * no `contentAccessProvider` and no `contentRepository`, the folder is LOCKED AT 13, and no
 * `getContent` method may be added here. The only `ContentService` slice in implicit scope is the
 * Category access path that `Category.cfc`'s `hb_serviceName="contentService"` resolves to, which
 * is a different concern entirely.
 *
 * It is also NOT the single deliberate read-only subscription-table reach-through in this target;
 * that is `getAccountSubscriptionPriceGroups` on `priceGroupRepository`. This port owns no SQL, no
 * table and no query.
 *
 * Whenever the base product type matches no branch at all, legacy throws "There was an unexpected
 * error when creating this product" [model/service/SkuService.cfc:L203-L205]. That is intended
 * behaviour for the service tier to preserve, recorded here so the message is not paraphrased.
 *
 * THE SURFACE IS CLOSED AT TWO METHODS. Both legacy names are carried over verbatim, singular nouns
 * intact, because interface parity at the service boundary is this migration's acceptance contract.
 */
export interface SubscriptionTermProvider {
  /**
   * Resolve one subscription term by identifier.
   *
   * CFML parity [model/service/SkuService.cfc:L158]: the legacy call is not declared on the
   * subscription service; it resolves by convention at [org/Hibachi/HibachiService.cfc:L305-L328],
   * which loads by identifier and yields nothing when the row is absent rather than raising.
   *
   * @param subscriptionTermID the identifier to load.
   * @returns the term, or undefined when no row matches.
   */
  getSubscriptionTerm(subscriptionTermID: string): Promise<SubscriptionTermHandle | undefined>;

  // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits` is read
  // without the presence check its two sibling lists receive, so the renewal loop depends on the
  // caller always supplying that key.
  //
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Resolve one subscription benefit by identifier.
   *
   * Called for the benefits of the new SKU [model/service/SkuService.cfc:L161] and again for its
   * renewal benefits [model/service/SkuService.cfc:L164], with the same absent-row semantics as
   * {@link SubscriptionTermProvider.getSubscriptionTerm}.
   *
   * @param subscriptionBenefitID the identifier to load.
   * @returns the benefit, or undefined when no row matches.
   */
  getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitHandle | undefined>;
}
