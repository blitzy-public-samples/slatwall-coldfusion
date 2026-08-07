// slatwall-ts - PromotionAccount entity.
// Schema contract [model/entity/PromotionAccount.cfc:L49]: table `SwPromotionAccount`, ORM entity name `SlatwallPromotionAccount`; no migration,
// no rename, no column change.
//
// Schema continuity is a binding constraint: entity property metadata is the contract.
//
// `hb_serviceName="promotionService"` points at model/service/PromotionService.cfc - the same
// service PromotionApplied names.

import type { Promotion } from './promotion.js';

/**
 * Build the framework's terminal missing-method message, BYTE for BYTE.
 *
 * "does not exists" is grammatically wrong in the source.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className The bare component name of the entity the call was made ON.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

/**
 * The `SwPromotionAccount` link row, associating a promotion with an account over an optional time
 * window.
 *
 * The entity declares ZERO collections - no `one-to-many`, no `many-to-many`, both re-verified
 * case-insensitively - so nothing here is an array and no `hasAny*` member exists.
 */
export class PromotionAccount {
  /**
   * Primary key. [model/entity/PromotionAccount.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one.
   */
  private readonly promotionAccountID: string;

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L53-L54]: both timestamps declare no ORM
  // default. `undefined` is the PERMISSIVE extreme and means "no bound / forever" - an absent
  // bound is no bound, so the association is unconstrained in that direction.

  /**
   * Start of the window, or `undefined` for no lower bound.
   * [model/entity/PromotionAccount.cfc:L53]
   */
  private readonly startDateTime: Date | undefined;

  /**
   * End of the window, or `undefined` for no upper bound. [model/entity/PromotionAccount.cfc:L54]
   */
  private readonly endDateTime: Date | undefined;

  /**
   * The in-scope `promotion` many-to-one. [model/entity/PromotionAccount.cfc:L57]
   *
   * MUTABLE, and deliberately so: `setPromotion` assigns it at
   * [model/entity/PromotionAccount.cfc:L91] before the method throws.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionAccount.cfc:L57]
   *
   * Held alongside the materialized association so the key is readable even when the repository
   * chose not to fetch the far side.
   */
  private readonly promotionID: string | undefined;

  /**
   * The `accountID` foreign-key column, as an OPAQUE identifier.
   * [model/entity/PromotionAccount.cfc:L58]
   *
   * model/entity/Account.cfc is explicitly out of scope - the plan excludes
   * model/service/AccountService.cfc and the whole account module - so this many-to-one collapses
   * to an inert ID string.
   */
  private readonly accountID: string | undefined;

  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded them
  // from mass assignment.

  /**
   * `createdDateTime`, or `undefined`. [model/entity/PromotionAccount.cfc:L62]
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L63]
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * `modifiedDateTime`, or `undefined`. [model/entity/PromotionAccount.cfc:L64]
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L65]
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwPromotionAccount` row.
   *
   * A single readonly parameter object, matching the convention established at
   * `src/lib/config.ts`: an inline object type rather than a second exported interface.
   *
   * Every nullable field is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot.
   */
  constructor(init: {
    readonly promotionAccountID: string;
    readonly startDateTime: Date | undefined;
    readonly endDateTime: Date | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly accountID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.promotionAccountID = init.promotionAccountID;
    this.startDateTime = init.startDateTime;
    this.endDateTime = init.endDateTime;
    this.promotion = init.promotion;
    this.promotionID = init.promotionID;
    this.accountID = init.accountID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to
  // port; the locator on each one cites the property declaration it serves.
  getPromotionAccountID(): string {
    return this.promotionAccountID;
  }

  /**
   * [model/entity/PromotionAccount.cfc:L53] `undefined` means no lower bound. Never epoch, never.
   */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /**
   * [model/entity/PromotionAccount.cfc:L54] `undefined` means no upper bound. Never epoch, never.
   */
  getEndDateTime(): Date | undefined {
    return this.endDateTime;
  }

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionAccount.cfc:L57]
   *
   * `undefined` when the repository did not fetch it, or after `setPromotion` has never run.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  /**
   * The `promotionID` column. [model/entity/PromotionAccount.cfc:L57]
   */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /**
   * The `accountID` column, opaque. [model/entity/PromotionAccount.cfc:L58]
   */
  getAccountID(): string | undefined {
    return this.accountID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L63]
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L65]
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly two
   * sites: [model/entity/PromotionAccount.cfc:L74] inside `setAccount`.
   *
   * The empty-string test is not an approximation of the framework - it is literally what the
   * framework does.
   */
  isNew(): boolean {
    return this.promotionAccountID === '';
  }

  // The legacy block holds two pairs and four methods in total, under two inline sub-banners:
  // `// Account (many-to-one)` at L71 and `// Promotion (many-to-one)` at L89.

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L68-L109]: the mandatory "remove-that-ADDs"
  // inversion cross-check was performed against all four bidirectional helpers, and independently
  // re-run against the verbatim source rather than taken on trust.

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L74, L92]: both legacy `set*` helpers guard
  // with `if(isNew() or !far.hasX( this ))`, testing this instance's newness. Contrast
  // `PriceGroupRate.addProductType`, which guards on the ARGUMENT's newness instead.

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L72, L78]: `setAccount` and `removeAccount` are
  // deliberately not authored.

  // Promotion (many-to-one) [model/entity/PromotionAccount.cfc:L89]

  // LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L90-L95]: `setPromotion` throws on every code
  // path. model/entity/Promotion.cfc declares exactly three collections - L62 `promotionPeriods`,
  // L63 `promotionCodes`, L64 `appliedPromotions` - and no `promotionAccounts` collection.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionAccount.cfc:L90]
   *
   * A throwing stub, mirroring the legacy runtime failure exactly rather than repairing it.
   *
   * The parameter is retained for interface parity even though the method cannot use it for
   * anything beyond the L91 assignment.
   */
  setPromotion(promotion: Promotion): void {
    // [model/entity/PromotionAccount.cfc:L91]: the assignment runs FIRST and succeeds.
    this.promotion = promotion;

    // [model/entity/PromotionAccount.cfc:L92]:
    // `if(isNew() or !arguments.promotion.hasPromotionAccount( this ))`.
    if (this.isNew()) {
      // [model/entity/PromotionAccount.cfc:L93]:
      // `arrayAppend(arguments.promotion.getPromotionAccounts(), this)`.
      throw new Error(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
    }

    throw new Error(hibachiMissingMethodMessage('hasPromotionAccount', 'Promotion'));
  }

  // LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L101, L103]: two more independent defects
  // stacked behind the first - L101 calls `getPromotionAccounts()` on `Promotion`, which declares
  // no such collection, and L103 deletes from `arguments.account`, which this method never
  // declares. Neither can succeed, whether or not an argument is supplied.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionAccount.cfc:L97]
   *
   * No target resolves - called with no argument while `variables.promotion` has never been set,
   * or has already been `structDelete`-d.
   *
   * `void` and not `never`, for the same parity reason as `setPromotion`.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionAccount.cfc:L98-L100]: CFML probes
    // `structKeyExists(arguments, "promotion")` and, when the argument is absent, defaults it to
    // `variables.promotion`.
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionAccount.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionAccount.cfc:L98-L100 defaults the argument from ' +
          'variables.promotion, and CFML raises "Element PROMOTION is undefined in VARIABLES." on ' +
          'that read. Reproduced rather than silently absorbed, and deliberately NOT the ' +
          'missing-method contract message - no method has been called on anything yet.',
      );
    }

    // [model/entity/PromotionAccount.cfc:L101]:
    // `arrayFind(arguments.promotion.getPromotionAccounts(), this)`. Unconditional, before any
    // index guard, so this is where the method always ends once a target resolved.
    throw new Error(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
  }
}

// LEGACY-NOTE [model/entity/PromotionAccount.cfc:L68, L109, L113-L123]: this component's banner
// layout is malformed and unique among the 18 in-scope entities.

// LEGACY-NOTE [model/entity/PromotionAccount.cfc:L113-L123]: all three remaining sections of the
// legacy component - Non-Persistent Property Methods, Overridden Methods and Validation - are EMPTY
// in the source, so nothing is authored for any of them here.

// Test contract - net-new coverage, never parity.
//
// `tests/unit/domain/entities/promotionAccount.test.ts` is authored separately; the test tier is
// owned elsewhere and no test file is created from here.
