// slatwall-ts - PromotionApplied entity.
// Schema contract [model/entity/PromotionApplied.cfc:L49]: table `SwPromotionApplied`, ORM entity name `SlatwallPromotionApplied`; no
// migration, no rename, no column change.
//
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L49]: `persistent="true"` is QUOTED here, where
// model/entity/PriceGroup.cfc:L49 and model/entity/PriceGroupRate.cfc:L49 write the unquoted
// `persistent=true output=false accessors=true` form.

import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { Money } from '../valueObjects/money.js';
import type { Promotion } from './promotion.js';

// The far-side contract this file requires of `./promotion.js`
//
// LEGACY-NOTE [model/entity/Promotion.cfc:L62-L64]: `appliedPromotions` uses `cascade="all"`, not
// `cascade="all-delete-orphan"` - unlike both of its siblings on the same component,
// `promotionPeriods` (L62) and `promotionCodes` (L63).

/**
 * The three values `SwPromotionApplied.appliedType` may hold.
 *
 * The union is exported because a downstream consumer genuinely needs the literal type -
 * `src/services/promotion/promotionApplication.ts` emits these intents.
 */
export type PromotionAppliedType = 'order' | 'orderItem' | 'orderFulfillment';

/**
 * The applied-promotion entity.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L52-L55, L58-L61, L64, L67-L70]: the persistent
 * columns, the four many-to-one foreign keys, the remote ID and the audit columns.
 */
export class PromotionApplied {
  private readonly promotionAppliedID: string;

  // `Money`, never `number`: the column is `big_decimal` [model/entity/PromotionApplied.cfc:L53].
  // Mutable because the engine builds a row and then assigns the computed discount to it.
  private discountAmount: Money | undefined;

  private appliedType: PromotionAppliedType | undefined;

  private readonly currencyCode: CurrencyCode | undefined;

  private promotion: Promotion | undefined;

  private readonly promotionID: string | undefined;

  private readonly orderItemID: string | undefined;

  private readonly orderFulfillmentID: string | undefined;

  private readonly orderID: string | undefined;

  private readonly remoteID: string | undefined;

  private readonly createdDateTime: Date | undefined;

  private readonly createdByAccountID: string | undefined;

  private readonly modifiedDateTime: Date | undefined;

  private readonly modifiedByAccountID: string | undefined;

  /**
   * Builds an applied-promotion row.
   *
   * @param init the row's values; the promotion may be supplied hydrated, by ID, or both.
   */
  constructor(init: {
    readonly promotionAppliedID: string;
    readonly discountAmount: Money | undefined;
    readonly appliedType: PromotionAppliedType | undefined;
    readonly currencyCode: CurrencyCode | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly orderItemID: string | undefined;
    readonly orderFulfillmentID: string | undefined;
    readonly orderID: string | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.promotionAppliedID = init.promotionAppliedID;
    this.discountAmount = init.discountAmount;
    this.appliedType = init.appliedType;
    this.currencyCode = init.currencyCode;
    this.promotion = init.promotion;
    this.promotionID = init.promotionID;
    this.orderItemID = init.orderItemID;
    this.orderFulfillmentID = init.orderFulfillmentID;
    this.orderID = init.orderID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  getPromotionAppliedID(): string {
    return this.promotionAppliedID;
  }

  getDiscountAmount(): Money | undefined {
    return this.discountAmount;
  }

  setDiscountAmount(discountAmount: Money): void {
    this.discountAmount = discountAmount;
  }

  getAppliedType(): PromotionAppliedType | undefined {
    return this.appliedType;
  }

  setAppliedType(appliedType: PromotionAppliedType): void {
    this.appliedType = appliedType;
  }

  getCurrencyCode(): CurrencyCode | undefined {
    return this.currencyCode;
  }

  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  getOrderItemID(): string | undefined {
    return this.orderItemID;
  }

  getOrderFulfillmentID(): string | undefined {
    return this.orderFulfillmentID;
  }

  getOrderID(): string | undefined {
    return this.orderID;
  }

  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * CFML parity [org/Hibachi/HibachiEntity.cfc:L571-L576]: newness is the primary ID matching the
   * empty `unsavedvalue` declared at [model/entity/PromotionApplied.cfc:L52].
   *
   * @returns whether this row has no primary ID yet.
   */
  isNew(): boolean {
    return this.promotionAppliedID === '';
  }

  /**
   * Identity for collection removal.
   *
   * CFML parity [model/entity/PromotionApplied.cfc:L89]: the legacy `arrayFind` compares object
   * references.
   *
   * @param candidate the row to compare against.
   * @returns whether both refer to the same persisted row, or are the same instance.
   */
  private isSameRowAs(candidate: PromotionApplied): boolean {
    const candidateID: string = candidate.getPromotionAppliedID();

    if (candidateID === '' || this.promotionAppliedID === '') {
      return candidate === this;
    }

    return candidateID === this.promotionAppliedID;
  }

  /**
   * CFML parity [model/entity/PromotionApplied.cfc:L79-L84]: sets the reference and appends to the
   * promotion's applied collection, guarded so an unsaved row is always appended and a saved one
   * only when not already present.
   *
   * @param promotion the promotion this discount came from.
   */
  setPromotion(promotion: Promotion): void {
    this.promotion = promotion;

    if (this.isNew() || !promotion.hasAppliedPromotion(this)) {
      promotion.getAppliedPromotions().push(this);
    }
  }

  /**
   * Unlinks this row from its promotion.
   *
   * @param promotion the promotion to unlink from; omitted, it defaults to this row's own
   * promotion.
   * @throws Error when no argument is supplied and no promotion is set, reproducing the legacy
   * runtime failure.
   */
  removePromotion(promotion?: Promotion): void {
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionApplied.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionApplied.cfc:L86-L89 defaults the argument to variables.promotion ' +
          'and then dereferences it at L89, so CFML fails here too. Reproduced rather than ' +
          'silently absorbed.',
      );
    }

    const appliedPromotions: PromotionApplied[] = target.getAppliedPromotions();
    const index: number = appliedPromotions.findIndex((candidate: PromotionApplied) =>
      this.isSameRowAs(candidate),
    );

    if (index !== -1) {
      appliedPromotions.splice(index, 1);
    }

    this.promotion = undefined;
  }
}

// Test contract - net-new coverage, never parity.
//
// `tests/unit/domain/entities/promotionApplied.test.ts` is authored separately; that tier is owned
// elsewhere and no test file is created from here.
// belongs here too, using `@ts-expect-error` with a description - permitted
