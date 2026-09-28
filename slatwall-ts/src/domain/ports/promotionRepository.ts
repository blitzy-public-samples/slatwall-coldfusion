/**
 * Promotion repository port - the domain-side read contract for the promotion subsystem, plus the
 * one rounding-rule lookup that has nowhere else to live.
 *
 * "A save that silently does not save" was the sharpest line in the withdrawn argument, and it is
 * answered rather than ignored: the gap is now DOCUMENTED at the service method with a
 * `LEGACY-NOTE`.
 *
 * @see model /dao/PromotionDAO.cfc - the ported DAO; its `<cfquery>` bodies are the source of
 * truth.
 */

/*
 * The five imports this file may have, and every one of them is type-only.
 *
 * The asymmetry that justifies publishing ports before entities: an entity body actually CALLS
 * port methods - the locator site at [model/entity/Product.cfc:L519] is exactly such a call.
 *
 * `Money` is the sole arithmetic surface in the target: it wraps an arbitrary-precision decimal
 * and replaces `precisionEvaluate`.
 */
import type { PromotionReward } from '../entities/promotionReward.js';
import type { PromotionPeriod } from '../entities/promotionPeriod.js';
import type { PromotionCode } from '../entities/promotionCode.js';
import type { RoundingRule } from '../entities/roundingRule.js';
import type { Money } from '../valueObjects/money.js';

/**
 * One row of the sale-price promotion-reward result set, as method 6 returns it.
 *
 * This is a read projection of query output - it is not an entity.
 */
export interface SalePricePromotionRewardRow {
  /**
   * SKU identifier, and the key the reduction groups by
   * [model/dao/PromotionDAO.cfc:L563, L568, L573]. Required: it is the join key on both sides of
   * the final step, so a row cannot exist without it.
   */
  readonly skuID: string;

  /**
   * The SKU's own price before any sale-price reward is applied [model/dao/PromotionDAO.cfc:L574],
   * projected by every union branch from the SKU price column [model/dao/PromotionDAO.cfc:L335].
   *
   * Optional, and the reason is specific rather than defensive: the SKU price column is nullable.
   */
  readonly originalPrice?: Money;

  /**
   * Which level of the catalog hierarchy the winning reward attached to
   * [model/dao/PromotionDAO.cfc:L575].
   */
  readonly discountLevel: 'sku' | 'product' | 'brand' | 'option' | 'productType' | 'global';

  /**
   * How the winning reward's amount was interpreted [model/dao/PromotionDAO.cfc:L576], projected
   * from the reward's own amount-type column [model/dao/PromotionDAO.cfc:L337].
   *
   * The three values are the three the legacy conditional recognises
   * [model/dao/PromotionDAO.cfc:L338-L342]: a flat replacement amount, an amount off, and a
   * percentage off.
   */
  readonly salePriceDiscountType: 'amount' | 'amountOff' | 'percentageOff';

  /**
   * The winning sale price for this SKU [model/dao/PromotionDAO.cfc:L577] - the per-SKU MINIMUM
   * across every qualifying reward [model/dao/PromotionDAO.cfc:L562-L568].
   *
   * Required: see this type's own note on how the final join excludes nulls.
   */
  readonly salePrice: Money;

  /**
   * Identifier of the rounding rule the winning reward carries, if any
   * [model/dao/PromotionDAO.cfc:L578], projected from the reward's rounding-rule foreign key
   * [model/dao/PromotionDAO.cfc:L343].
   *
   * Optional, because the association is nullable: a reward need not carry a rounding rule.
   */
  readonly roundingRuleID?: string;

  /**
   * When this sale price stops applying [model/dao/PromotionDAO.cfc:L579], projected from the
   * promotion period's end date [model/dao/PromotionDAO.cfc:L344].
   *
   * Optional, because that column is explicitly nullable - every branch's date predicate admits a
   * null end date [model/dao/PromotionDAO.cfc:L319], which is how a period with no expiry
   * qualifies.
   */
  readonly salePriceExpirationDateTime?: Date;

  /**
   * Identifier of the promotion the winning reward belongs to [model/dao/PromotionDAO.cfc:L580],
   * projected from the promotion period [model/dao/PromotionDAO.cfc:L346].
   *
   * Required: the preliminary query that gates every row of this result set joins the period to
   * its promotion and filters on the promotion's active flag
   * [model/dao/PromotionDAO.cfc:L314-L321].
   */
  readonly promotionID: string;
}

/**
 * One SKU's sale-price detail, as `SalePriceResolver` returns it keyed by SKU identifier.
 *
 * This is a READ PROJECTION of service output - it is not an entity, and it must not grow
 * behaviour or gain persistence identity.
 *
 * The TYPE NAME has no legacy antecedent: the CFML declaration is
 * `public struct function getSalePriceDetailsForProductSkus(required string productID)`
 * [model/service/PromotionService.cfc:L1022].
 */
export interface SalePriceDetail {
  /**
   * SKU identifier - also the key this detail is stored under. Required.
   */
  readonly skuID: string;

  /**
   * The SKU's own price before the sale-price reward. Optional; see the row projection.
   */
  readonly originalPrice?: Money;

  /**
   * Catalog level the winning reward attached to. Required; the six literals the branches emit.
   */
  readonly discountLevel: 'sku' | 'product' | 'brand' | 'option' | 'productType' | 'global';

  /**
   * How the winning reward's amount was interpreted. Required; the three the legacy conditional
   * recognises.
   *
   * The two legacy entity accessors that read this member substitute DIFFERENT stand-ins when the
   * detail is absent altogether.
   */
  readonly salePriceDiscountType: 'amount' | 'amountOff' | 'percentageOff';

  /**
   * The sale price after the rounding rule has been applied, when the detail carried one
   * [model/service/PromotionService.cfc:L1026]; otherwise the unadjusted winning price. Required,
   * and monetary, so `Money`.
   */
  readonly salePrice: Money;

  /**
   * Identifier of the rounding rule that was applied, retained after application exactly as the
   * legacy loop retains it. Optional, because the reward's association is nullable.
   */
  readonly roundingRuleID?: string;

  /**
   * When this sale price stops applying. Optional; absent means it does not expire.
   */
  readonly salePriceExpirationDateTime?: Date;

  /**
   * Identifier of the promotion behind the winning reward. Required.
   */
  readonly promotionID: string;
}

/**
 * The promotion repository port.
 *
 * SEVEN methods, locked: the six public functions of `model/dao/PromotionDAO.cfc` and the single
 * lookup of `model/dao/RoundingRuleDAO.cfc`.
 *
 * Eighth member, `saveRoundingRule`, was added on the reasoning that this contract already owned
 * the `SwRoundingRule` table through the lookup above.
 */
export interface PromotionRepository {
  /**
   * @param rewardTypeList Comma-delimited reward types, required in the legacy signature.
   * @param promotionCodeList Comma-delimited promotion codes, required in the legacy signature and
   * permitted to be empty - the legacy body tests its length before binding it at all
   * [model/dao/PromotionDAO.cfc:L125-L127].
   * @param qualificationRequired Optional; legacy default is `false`.
   * @returns The matching rewards, materialized as this file's header requires, in the engine's
   * own unspecified order.
   */
  getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]>;

  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: the active-reward query carries no
  // `ORDER BY`, so reward order is whatever the engine returns and the usage ledger threaded
  // through the two reward passes can settle a tie either way.
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177, L244]: both use-count queries test
  // getStartDateTime() in a clause where getEndDateTime() is plainly intended.
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-NOTE [model/service/PromotionService.cfc:L1094-L1100]: `getPromotionCodeUseCount` and
  // `getPromotionCodeAccountUseCount` declare `returntype="boolean"` while returning the DAO's
  // numeric count. Recorded, not reproduced: this port and the service both type the honest number,
  // as AAP 0.4.2 specifies.
  /**
   * How many times any account has used the promotion behind a promotion period.
   *
   * Counting semantics for the adapter [model/dao/PromotionDAO.cfc:L137-L182]: applied promotions
   * are counted for the period's PROMOTION - not for the period itself.
   *
   * @param promotionPeriod The period whose promotion is counted.
   * @returns The count.
   */
  getPromotionPeriodUseCount(promotionPeriod: PromotionPeriod): Promise<number>;

  /**
   * How many times one account has used the promotion behind a promotion period.
   *
   * The second parameter is the opaque identifier rather than an entity: `Account` is out of
   * scope.
   *
   * @param promotionPeriod The period whose promotion is counted, with its promotion materialized.
   * @param accountID Opaque identifier of the account, replacing the out-of-scope entity.
   * @returns The count.
   */
  getPromotionPeriodAccountUseCount(
    promotionPeriod: PromotionPeriod,
    accountID: string,
  ): Promise<number>;

  /**
   * How many placed orders have used a promotion code.
   *
   * The DAO declares `numeric` honestly; the SERVICE method that forwards to it declares `boolean`
   * over the same value [model/service/PromotionService.cfc:L1094] - see the second marker above.
   *
   * @param promotionCode The code whose use is counted; the legacy body reduces it to its
   * identifier [model/dao/PromotionDAO.cfc:L267].
   * @returns The count.
   */
  getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number>;

  /**
   * How many placed orders belonging to one account have used a promotion code.
   *
   * The forwarding service method declares `boolean` over this numeric count too
   * [model/service/PromotionService.cfc:L1098]; this port types the number.
   *
   * @param promotionCode The code whose use is counted.
   * @param accountID Opaque identifier of the account, replacing the out-of-scope entity.
   * @returns The count.
   */
  getPromotionCodeAccountUseCount(promotionCode: PromotionCode, accountID: string): Promise<number>;

  /**
   * Winning sale-price rewards, one row per SKU per winning reward.
   *
   * Legacy: `<cffunction name="getSalePricePromotionRewardsQuery">`
   * [model/dao/PromotionDAO.cfc:L298] - the only one of the six declaring neither a `returntype`
   * NOR an `access` attribute.
   *
   * @param productID Optional product identifier narrowing the result set.
   * @returns The winning rows, unrounded.
   */
  getSalePricePromotionRewardsQuery(productID?: string): Promise<SalePricePromotionRewardRow[]>;

  /**
   * Load one rounding rule by its identifier.
   *
   * @param roundingRuleID Identifier of the rule to load; required in the legacy signature.
   * @returns The rule, or `undefined` when there is none.
   */
  getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined>;
}

// AAP-contract review and the completeness review reached the same verdict from different
// directions, and the docblock that follows carries the fuller record of the removal argument and
// why it fails.
/**
 * The narrow sale-price collaborator the `Product` entity depends on.
 *
 * The note left behind at the time said the contract "now lives module-locally and un-exported
 * inside `src/domain/entities/product.ts`".
 *
 * The resolved VALUE is supplied too, by the product adapter, so the memo arrives pre-seeded and
 * the reach never runs for a repository-loaded product.
 */
export interface SalePriceResolver {
  /**
   * The sale-price details for every SKU of one product, keyed by SKU identifier.
   *
   * @param productID The product whose SKUs are being resolved.
   * @returns A record keyed by SKU identifier.
   */
  getSalePriceDetailsForProductSkus(productID: string): Promise<Record<string, SalePriceDetail>>;
}
