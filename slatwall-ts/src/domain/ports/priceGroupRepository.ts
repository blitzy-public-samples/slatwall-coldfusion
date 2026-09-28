// Price-group repository port: price-group and rate loading, plus the account subscription
// price-group query.
//
// Replaces `model/dao/PriceGroupDAO.cfc`, whose single function
// `getAccountSubscriptionPriceGroups` [model/dao/PriceGroupDAO.cfc:L52-L100] is the whole
// component.
//
// AAP 0.9.3's ordering criterion is asserted, in both halves. That the price-group pass runs first
// is pinned in tests/unit/handlers/bootstrap.test.ts; that REVERSING the two passes changes the
// computed discount is pinned in tests/unit/services/promotionService.test.ts, describe
// "the cross-service ordering constraint" - forward yields 3.01 and reversed yields 4.01 on the
// same order, because [model/service/PromotionService.cfc:L241] chooses the discount base by
// applied-price-group state that only the price-group pass writes.
//
// This port carries no sequence number, phase parameter, `runAfter` field, ordered-pipeline type
// or orchestration method, and none may be added - `src/handlers/**` and `src/services/**` enforce
// the ordering.

import type { PriceGroup } from '../entities/priceGroup.js';
import type { PriceGroupRate } from '../entities/priceGroupRate.js';

/**
 * The explicit request context that replaces CFML's ambient request scope for price-group
 * resolution.
 *
 * Replaces the ambient scope reached through the two accessors at
 * [model/service/PriceGroupService.cfc:L262-L268] - `getSlatwallScope()` at L263 and
 * `getHibachiScope()` at L264.
 *
 * Constructed per request at the handler boundary and passed down the call chain; never read from
 * module scope and never assembled from `src/lib/config.ts`.
 */
export interface CurrentAccountContext {
  /**
   * The current account, reduced to an opaque identifier.
   *
   * Absent means no authenticated account, and that state is load-bearing rather than incidental.
   *
   * The out-of-scope `Account` entity is reduced to this identifier and nothing more.
   */
  readonly accountID?: string;
}

/**
 * The price group repository port.
 *
 * Missing rows yield `undefined`, never `0`, never an empty object, and never a freshly
 * constructed entity.
 */
export interface PriceGroupRepository {
  /**
   * The active price groups an account is entitled to by SUBSCRIPTION, as distinct from those
   * assigned to it directly.
   *
   * The single-column query behind this is an intermediate step and not the result: the entity is
   * what the source produces and what the consumer requires, so no read projection is declared in
   * this file.
   */
  getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]>;

  /**
   * Load one price group by its identifier.
   *
   * Yields `undefined` when no price group carries the identifier.
   *
   * The returned entity must arrive with the associations the cascade walks already populated -
   * its rates, its global rate, and its parent price group.
   */
  getPriceGroup(priceGroupID: string): Promise<PriceGroup | undefined>;

  /**
   * Load one price group rate by its identifier.
   *
   * No LEGACY ANTECEDENT, for the same reason as the price group load above: rate loading was
   * Hibernate's, not the DAO's.
   *
   * The returned rate must arrive with its rounding rule populated, because rate application reads
   * it at `model/service/PriceGroupService.cfc:L326-L327`; with the associations it applies to
   * populated.
   */
  getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined>;

  /**
   * Persist one price group, inserting or updating it, and return the persisted entity.
   *
   * A price group's id path depends on its PARENT, so a re-parenting update has to be detectable -
   * which is why this method's shape differs from the rate save below.
   *
   * `priorState` is therefore the previously persisted state that the `preUpdate`-equivalent path
   * maintenance needs, and it is ABSENT on AN INSERT.
   */
  savePriceGroup(priceGroup: PriceGroup, priorState?: PriceGroup): Promise<PriceGroup>;

  /**
   * Persist one price group rate, inserting or updating it, and return the persisted entity.
   *
   * @param priceGroupRate the rate the caller saved; the returned entity is this one, persisted.
   * @param reconciledSiblings the sibling rates of the SAME price group that the caller's
   * exclusivity reconciliation mutated, to be persisted in the same unit of work.
   */
  savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    reconciledSiblings?: readonly PriceGroupRate[],
  ): Promise<PriceGroupRate>;

  /**
   * Delete one price group, resolving to whether the delete succeeded.
   */
  deletePriceGroup(priceGroup: PriceGroup): Promise<boolean>;
}

// `CurrentAccountContext` above STAYS EXPORTED and is not affected: the transformation plan names
// it directly in the ported signature
// `calculateSkuPriceBasedOnCurrentAccount(sku: Sku, context: CurrentAccountContext)` (AAP 0.4.2).
