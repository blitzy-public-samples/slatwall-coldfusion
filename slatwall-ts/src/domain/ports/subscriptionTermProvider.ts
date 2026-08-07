// Subscription term / subscription benefit lookup port.
//
// It is a STUB PORT by design: the subscription module is out of scope, so this declares the
// lookup shape the in-scope branch needs and nothing more.
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
 * One of exactly two stub ports in `src/domain/ports/` (the other is `imageStore`): a narrow
 * interface with documented stub behaviour, not a partial implementation.
 *
 * It is also not the single deliberate read-only subscription-table reach-through in this target;
 * that is `getAccountSubscriptionPriceGroups` on `priceGroupRepository`.
 */
export interface SubscriptionTermProvider {
  /**
   * Resolve one subscription term by identifier.
   *
   * CFML parity [model/service/SkuService.cfc:L158]: the legacy call is not declared on the
   * subscription service; it resolves by convention at [org/Hibachi/HibachiService.cfc:L305-L328].
   *
   * @param subscriptionTermID the identifier to load.
   * @returns the term, or undefined when no row matches.
   */
  getSubscriptionTerm(subscriptionTermID: string): Promise<SubscriptionTermHandle | undefined>;

  // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits` is read
  // without the presence check its two sibling lists receive, so the renewal loop depends on the
  // caller always supplying that key.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Resolve one subscription benefit by identifier.
   *
   * @param subscriptionBenefitID the identifier to load.
   * @returns the benefit, or undefined when no row matches.
   */
  getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitHandle | undefined>;
}
