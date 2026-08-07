// slatwall-ts - PromotionCode entity.
// Schema contract [model/entity/PromotionCode.cfc:L49]: table `SwPromotionCode`, ORM entity name `SlatwallPromotionCode`; no
// migration, no rename, no column change.
//
// `getCurrentFlag`, `setPromotion` and `removePromotion` carry no defect, so none of them carries
// a LEGACY-DEFECT marker.

import { randomUUID } from 'node:crypto';

import { cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { Promotion } from './promotion.js';

// `node:crypto` is a runtime built-in, not an outward dependency, and that distinction is why it
// is allowed here.
//
// It is also the closest analogue to what the source does.

/**
 * The anti-corruption projection of one `SwAccount` row, as reached across the
 * `SwPromotionCodeAccount` link table. [model/entity/PromotionCode.cfc:L65]
 *
 * Everything else on `model/entity/Account.cfc` - the name columns, the email and phone
 * collections, the price groups, the permission groups.
 */
interface PromotionCodeAccountLink {
  /**
   * The `SwAccount.accountID` primary key. [model/entity/Account.cfc:L52]
   */
  getAccountID(): string;
  /**
   * `getPrimaryIDValue() == ""`. [org/Hibachi/HibachiEntity.cfc:L571-L576, L707-L709]
   */
  isNew(): boolean;
  /**
   * ORM-generated containment probe. [model/entity/PromotionCode.cfc:L126]
   */
  hasPromotionCode(promotionCode: PromotionCode): boolean;
  /**
   * The account's own side of `SwPromotionCodeAccount`, LIVE.
   * [model/entity/PromotionCode.cfc:L127]
   */
  getPromotionCodes(): PromotionCode[];
}

/**
 * The anti-corruption projection of one `SwOrder` row, as reached across the
 * `SwOrderPromotionCode` link table. [model/entity/PromotionCode.cfc:L68]
 *
 * module-local and un-exported, for the same reasons as {@link PromotionCodeAccountLink}.
 */
interface OrderPromotionCodeLink {
  /**
   * The `SwOrder.orderID` primary key. [model/entity/Order.cfc:L52]
   */
  getOrderID(): string;
  /**
   * Owning-side add. [model/entity/Order.cfc:L840-L847]
   */
  addPromotionCode(promotionCode: PromotionCode): void;
  /**
   * Owning-side remove. [model/entity/Order.cfc:L848-L857]
   */
  removePromotionCode(promotionCode: PromotionCode): void;
}

/**
 * Narrowing adapter over the CFML `isNull()` parity helper: `isNullish()` returns a plain
 * `boolean`, and this returns a type predicate. It delegates rather than restating the comparison,
 * so the CFML `isNull()` semantic stays decided in one place across the port.
 */
function isPresent<T>(value: T | undefined): value is T {
  return !isNullish(value);
}

/**
 * The CFML `createUUID()` grouping: 8-4-4-16 hexadecimal digits joined by three hyphens, which is
 * 32 digits plus 3 separators = 35 characters.
 */
const CFML_UUID_GROUP_BOUNDARIES: readonly [number, number, number, number] = [8, 12, 16, 32];

/**
 * A CFML-shaped UUID, generated the way `createUUID()` is generated.
 * [model/entity/PromotionCode.cfc:L182]
 *
 * [model/entity/PromotionCode.cfc:L53] declares `property name="promotionCode" ormtype="string";`
 * with no `length` attribute - contrast `promotionCodeID` on the line above.
 *
 * Module-local and deliberately not exported: this module exports exactly one unit, the class.
 */
function createCfmlShapedUuid(): string {
  const digits = randomUUID().replaceAll('-', '').toUpperCase();

  const [firstBoundary, secondBoundary, thirdBoundary, fourthBoundary] = CFML_UUID_GROUP_BOUNDARIES;

  return [
    digits.slice(0, firstBoundary),
    digits.slice(firstBoundary, secondBoundary),
    digits.slice(secondBoundary, thirdBoundary),
    digits.slice(thirdBoundary, fourthBoundary),
  ].join('-');
}

/**
 * A `SwPromotionCode` row: the redeemable code that grants access to a promotion, optionally
 * bounded by a date window and optionally capped by per-code and per-account use limits.
 *
 * `Sku.getPriceByCurrencyCode()` must return `Money | undefined` and never `0`.
 *
 * `define.forever` for an absent bound and `define.unlimited` for an absent count.
 */
export class PromotionCode {
  /**
   * Primary key. [model/entity/PromotionCode.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one.
   *
   * `length="32"` is recorded for schema continuity and is not enforced here as a constructor
   * invariant.
   */
  private readonly promotionCodeID: string;

  /**
   * The redeemable code itself - the entity's natural key. [model/entity/PromotionCode.cfc:L53]
   *
   * MUTABLE, unlike almost every other field on this class: `setPromotionCode` assigns it, and so
   * does the ported `preInsert` guard by way of that setter.
   *
   * model/validation/PromotionCode.json marks it `"required":true` in the `save` context and
   * attaches the `hasUniquePromotionCode` validator there.
   */
  private promotionCode: string | undefined;

  /**
   * Start of the code's active window, or `undefined` for no LOWER BOUND.
   * [model/entity/PromotionCode.cfc:L54]
   *
   * `hb_formatType="dateTime"` and `hb_nullRBKey="define.forever"` are carried forward verbatim as
   * inert documentation for schema continuity; no i18n runtime resolves either one here.
   *
   * Absence convention 3 applies: `undefined` means FOREVER and is the permissive extreme.
   */
  private readonly startDateTime: Date | undefined;

  /**
   * End of the code's active window, or `undefined` for no upper bound.
   * [model/entity/PromotionCode.cfc:L55]
   */
  private readonly endDateTime: Date | undefined;

  /**
   * Cap on total redemptions of this code, or `undefined` for UNLIMITED.
   * [model/entity/PromotionCode.cfc:L56]
   *
   * `notnull="false"` is explicit in the source, and `hb_nullRBKey="define.unlimited"` is the
   * legacy UI's own instruction to render an absent value as "unlimited".
   */
  private readonly maximumUseCount: number | undefined;

  /**
   * Cap on redemptions of this code by a single account, or `undefined` for unlimited.
   * [model/entity/PromotionCode.cfc:L57]
   */
  private readonly maximumAccountUseCount: number | undefined;

  /**
   * The in-scope `promotion` many-to-one - the one association this entity genuinely materializes.
   * [model/entity/PromotionCode.cfc:L60]
   *
   * `Promotion | undefined`, nullable because nothing in the declaration says `notnull`, and
   * because the repository may legitimately choose not to fetch the far side.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionCode.cfc:L60]
   *
   * Held alongside the materialized association so the key stays readable even when the repository
   * chose not to fetch the far side - something the legacy proxy-based `getPromotionID()` could
   * not do. See the LEGACY-NOTE on that accessor.
   */
  private readonly promotionID: string | undefined;

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L62]: the source carries a
  // `// Related Object Properties (one-to-many)` banner with nothing declared beneath it - an
  // empty section.

  // Many-to-many collections across out-of-scope far sides
  // [model/entity/PromotionCode.cfc:L64-L68]
  //
  // Revision declared both as permanently-empty `readonly never[]` placeholders and authored none
  // of the four bidirectional helpers, on the ground that both point at out-of-scope aggregates.

  /**
   * `accounts` - the many-to-many OWNER side, materialized. [model/entity/PromotionCode.cfc:L65]
   *
   * Note the absent `inverse` attribute - this side owns `SwPromotionCodeAccount`, which is why
   * `addAccount` [model/entity/PromotionCode.cfc:L122-L128] appends to `variables.accounts`
   * directly instead of delegating.
   *
   * Elements are {@link PromotionCodeAccountLink}, the narrow structural projection over the four
   * members the legacy helper bodies actually call.
   */
  private readonly accounts: PromotionCodeAccountLink[];

  /**
   * `orders` - the many-to-many INVERSE side, materialized. [model/entity/PromotionCode.cfc:L68]
   *
   * `inverse="true"`, so `model/entity/Order.cfc` owns the link table - and owns the writes into
   * this very array, at [model/entity/Order.cfc:L845] and `model/entity/PromotionCode.cfc`.
   *
   * Elements are {@link OrderPromotionCodeLink}, the narrow structural projection over the three
   * members the legacy helper bodies and the owning side's guards actually call.
   */
  private readonly orders: OrderPromotionCodeLink[];

  /**
   * External-system correlation id. [model/entity/PromotionCode.cfc:L71]
   */
  private readonly remoteID: string | undefined;

  // All four carry `hb_populateEnabled="false"`, meaning the legacy framework never populated them
  // from user input.

  /**
   * [model/entity/PromotionCode.cfc:L74] `hb_populateEnabled="false"`, `ormtype="timestamp"`.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, as an OPAQUE identifier. [model/entity/PromotionCode.cfc:L75]
   *
   * The locked out-of-scope foreign-key ruling, applied identically here as in the sibling
   * entities: the far side is model/entity/Account.cfc, which is out of scope.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionCode.cfc:L76] `hb_populateEnabled="false"`, `ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionCode.cfc:L77]
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Backing store for the `getCurrentFlag()` memo. [model/entity/PromotionCode.cfc:L80]
   *
   * Not a database column - `persistent="false"`, and declared with `type=` rather than
   * `ormtype=`.
   *
   * `boolean | undefined` with no initializer, because `undefined` is not a value here: it is the
   * "memo has not been computed yet" state.
   */
  private currentFlag: boolean | undefined;

  /**
   * The clock, supplying "now" to `getCurrentFlag()`.
   *
   * A plain constructor parameter typed `() => Date`, and deliberately not a port.
   */
  private readonly now: () => Date;

  /**
   * Hydrates one `SwPromotionCode` row.
   *
   * A single readonly parameter object rather than a positional list, matching the convention the
   * sibling entities establish: an inline object type and not a second exported interface.
   *
   * Every nullable field is a required slot typed `T | undefined`, never an optional `?:` slot.
   */
  constructor(init: {
    readonly promotionCodeID: string;
    readonly promotionCode: string | undefined;
    readonly startDateTime: Date | undefined;
    readonly endDateTime: Date | undefined;
    readonly maximumUseCount: number | undefined;
    readonly maximumAccountUseCount: number | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly accounts?: PromotionCodeAccountLink[] | undefined;
    readonly orders?: OrderPromotionCodeLink[] | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
    readonly now: () => Date;
  }) {
    this.promotionCodeID = init.promotionCodeID;
    this.promotionCode = init.promotionCode;
    this.startDateTime = init.startDateTime;
    this.endDateTime = init.endDateTime;
    this.maximumUseCount = init.maximumUseCount;
    this.maximumAccountUseCount = init.maximumAccountUseCount;
    this.promotion = init.promotion;
    // [model/entity/PromotionCode.cfc:L65, L68] Collections default to EMPTY rather than to
    // `undefined`: a Hibernate-managed collection never handed back null - an unpopulated
    // many-to-many read as an empty array.
    //
    // Not defensively copied, and that is deliberate for both.
    this.accounts = init.accounts ?? [];
    this.orders = init.orders ?? [];

    this.promotionID = init.promotionID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.now = init.now;
  }

  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to
  // port; the locator on each one cites the property declaration it serves.
  //
  // Getters only, with two exceptions that the source itself declares as writable: the
  // `promotionCode` setter below, and the `promotion` association.

  /**
   * [model/entity/PromotionCode.cfc:L52] Always a string; `''` means unsaved.
   */
  getPromotionCodeID(): string {
    return this.promotionCodeID;
  }

  /**
   * `undefined` when the column is NULL, which is a state the schema genuinely permits and which
   * `preInsert()` exists to repair.
   */
  getPromotionCode(): string | undefined {
    return this.promotionCode;
  }

  /**
   * [model/entity/PromotionCode.cfc:L53] - the ORM-generated setter for the natural key.
   *
   * Concretely called at [model/entity/PromotionCode.cfc:L182], inside the `preInsert` hook, which
   * is the only place the legacy component writes this property itself.
   */
  setPromotionCode(promotionCode: string): void {
    this.promotionCode = promotionCode;
  }

  /**
   * [model/entity/PromotionCode.cfc:L54] `undefined` means FOREVER - no lower bound.
   */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /**
   * [model/entity/PromotionCode.cfc:L55] `undefined` means FOREVER - no upper bound.
   */
  getEndDateTime(): Date | undefined {
    return this.endDateTime;
  }

  /**
   * [model/entity/PromotionCode.cfc:L56] `undefined` means unlimited.
   *
   * Never `0` and never `Infinity` - the money consequence of either coercion is set out on the
   * class doc comment.
   */
  getMaximumUseCount(): number | undefined {
    return this.maximumUseCount;
  }
  getMaximumAccountUseCount(): number | undefined {
    return this.maximumAccountUseCount;
  }

  /**
   * The materialized far side of the `promotion` many-to-one. [model/entity/PromotionCode.cfc:L60]
   *
   * `undefined` when the repository did not fetch it, when `setPromotion` has never run, or after
   * `removePromotion` has cleared it.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  /**
   * The `promotionID` column. [model/entity/PromotionCode.cfc:L60]
   */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /**
   * The materialized `accounts` many-to-many, projected across `SwPromotionCodeAccount`.
   * [model/entity/PromotionCode.cfc:L65]
   */
  getAccounts(): readonly PromotionCodeAccountLink[] {
    return this.accounts;
  }

  /**
   * The materialized `orders` many-to-many, projected across `SwOrderPromotionCode`.
   * [model/entity/PromotionCode.cfc:L68]
   */
  getOrders(): OrderPromotionCodeLink[] {
    return this.orders;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PromotionCode.cfc:L75]
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionCode.cfc:L77]
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this instance has been persisted yet.
   *
   * The empty-string test is not an approximation of the framework - it is literally what the
   * framework does.
   */
  isNew(): boolean {
    return this.promotionCodeID === '';
  }

  /**
   * Row identity, used by both containment tests on this class.
   *
   * PRIMARY-KEY COMPARISON on `promotionCodeID` is the project convention, and it is the correct
   * translation of the legacy semantics: `arrayFind(collection, this)` in CFML resolves through
   * Hibernate's session identity.
   *
   * The unsaved case is handled explicitly, and this is a documented judgment call rather than an
   * oversight.
   */
  private isSameRowAs(candidate: PromotionCode): boolean {
    const candidateID: string = candidate.getPromotionCodeID();

    if (candidateID === '' || this.promotionCodeID === '') {
      return candidate === this;
    }

    return candidateID === this.promotionCodeID;
  }

  // [model/entity/PromotionCode.cfc:L83-L96] - the FIRST of two banners with this title; the
  // duplicate at L149/L151 is completely empty.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L85-L94]: this is the correct-memo control case,
  // and it carries no defect marker for exactly that reason. Seed key, write key and return key
  // are all `currentFlag`, so the memo behaves as intended.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L86]: the
  // `structKeyExists(variables, "currentFlag")` probe is a MEMO guard, not a lazy-load probe, and
  // the two are categorically different.

  /**
   * Comparison is on absolute epoch milliseconds via `getTime()`, per the UTC policy on the class
   * doc comment.
   */
  getCurrentFlag(): boolean {
    if (this.currentFlag === undefined) {
      this.currentFlag = true;

      const startDateTime: Date | undefined = this.startDateTime;
      const endDateTime: Date | undefined = this.endDateTime;

      if (
        (isPresent(startDateTime) && startDateTime.getTime() > this.now().getTime()) ||
        (isPresent(endDateTime) && endDateTime.getTime() < this.now().getTime())
      ) {
        this.currentFlag = false;
      }
    }

    return this.currentFlag;
  }

  // [model/entity/PromotionCode.cfc:L96]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L109, L130, L145] - the mandatory
  // "remove-that-ADDs" inversion cross-check.
  //
  // | helper | locator | verdict | | removePromotion | L109 | CLEAN - `arrayDeleteAt` on the far
  // side (L116) and a | | | | `structDelete` on the near side (L118).

  // Promotion (many-to-one) [model/entity/PromotionCode.cfc:L100]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L101-L107]: `setPromotion` is sound, and carries
  // no defect marker.

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionCode.cfc:L101]
   *
   * The append targets the LIVE far-side array returned by `getPromotionCodes()`, never a
   * defensive copy - see the far-side contract published at the foot of this file.
   */
  setPromotion(promotion: Promotion): void {
    this.promotion = promotion;
    if (this.isNew() || !promotion.hasPromotionCode(this)) {
      promotion.getPromotionCodes().push(this);
    }
  }

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionCode.cfc:L109]
   *
   * The parameter is optional, matching the legacy signature exactly: L109 declares
   * `any promotion`, not `required any promotion`.
   *
   * It throws when the argument is omitted and no promotion is set, and that is behaviour
   * preservation rather than defensiveness.
   */
  removePromotion(promotion?: Promotion): void {
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionCode.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionCode.cfc:L110-L113 defaults the argument to variables.promotion ' +
          'and then dereferences it unconditionally at L113, so CFML fails here too. Reproduced ' +
          'rather than silently absorbed.',
      );
    }

    // [model/entity/PromotionCode.cfc:L113] array index base change: CFML `arrayFind` returns a
    // 1-BASED index, or 0 for "not found", which is why the source tests `index > 0` at L115.
    const promotionCodes: PromotionCode[] = target.getPromotionCodes();
    const index: number = promotionCodes.findIndex((candidate: PromotionCode) =>
      this.isSameRowAs(candidate),
    );
    if (index !== -1) {
      promotionCodes.splice(index, 1);
    }

    // [model/entity/PromotionCode.cfc:L118] - unconditional, outside the found-branch.
    this.promotion = undefined;
  }

  // Accounts (many-to-many - owner) [model/entity/PromotionCode.cfc:L121]

  // The `accounts` collection is correspondingly MATERIALIZED - see the field - and the link table
  // `SwPromotionCodeAccount` is recorded there so the schema contract stays auditable.

  /**
   * ORM-generated containment probe for the `accounts` collection.
   * [model/entity/PromotionCode.cfc:L123]
   *
   * Containment is by primary key, with a reference fallback, matching the rule this folder
   * applies uniformly.
   */
  hasAccount(account: PromotionCodeAccountLink): boolean {
    const candidateAccountID: string = account.getAccountID();

    if (candidateAccountID === '' || this.accountsContainUnsavedRow()) {
      return this.accounts.some((held: PromotionCodeAccountLink) => held === account);
    }

    return this.accounts.some(
      (held: PromotionCodeAccountLink) => held.getAccountID() === candidateAccountID,
    );
  }

  /**
   * Whether any held account row is unsaved, in which case primary-key containment cannot separate
   * rows and {@link PromotionCode.hasAccount} falls back to object identity.
   *
   * Module-private and deliberately not part of the public surface: the legacy has no counterpart,
   * because CFML never needed one - `arrayFind` was reference-based throughout.
   */
  private accountsContainUnsavedRow(): boolean {
    return this.accounts.some((held: PromotionCodeAccountLink) => held.getAccountID() === '');
  }

  /**
   * Bidirectional helper for the `accounts` many-to-many.
   * [model/entity/PromotionCode.cfc:L122-L128]
   *
   * Inconsistency recorded in the LEGACY-NOTE directly above, and it is preserved in code rather
   * than normalised: L123 tests the ARGUMENT's newness before touching the near side, L126 tests
   * `this`'s newness before touching the far side.
   *
   * `void`, matching the legacy declaration exactly, and synchronous - nothing here reaches
   * outward.
   */
  addAccount(account: PromotionCodeAccountLink): void {
    // [model/entity/PromotionCode.cfc:L123-L125] The near-side guard tests the ARGUMENT's newness.
    if (account.isNew() || !this.hasAccount(account)) {
      // [model/entity/PromotionCode.cfc:L124] `arrayAppend(variables.accounts, arguments.account)`
      // the private field, not the accessor.
      this.accounts.push(account);
    }

    // [model/entity/PromotionCode.cfc:L126-L128] The far-side guard tests `this`'s newness. A
    // separate `if`, never an `else`.
    if (this.isNew() || !account.hasPromotionCode(this)) {
      // [model/entity/PromotionCode.cfc:L127] The LIVE far-side array.
      account.getPromotionCodes().push(this);
    }
  }

  /**
   * Bidirectional helper for the `accounts` many-to-many.
   * [model/entity/PromotionCode.cfc:L130-L139]
   *
   * Two separate index lookups, each with its own guard, and the legacy's two local names -
   * `thisIndex` and `thatIndex` - are kept so the two halves stay individually traceable.
   */
  removeAccount(account: PromotionCodeAccountLink): void {
    // [model/entity/PromotionCode.cfc:L131] `thisIndex` - the NEAR side, over the private field.
    const thisIndex: number = this.accounts.findIndex((held: PromotionCodeAccountLink) =>
      this.isSameAccountRow(held, account),
    );

    // [model/entity/PromotionCode.cfc:L132-L134] `if(thisIndex > 0)` becomes `!== -1`.
    if (thisIndex !== -1) {
      this.accounts.splice(thisIndex, 1);
    }

    // [model/entity/PromotionCode.cfc:L135] `thatIndex` - the FAR side, over the live array.
    const promotionCodes: PromotionCode[] = account.getPromotionCodes();
    const thatIndex: number = promotionCodes.findIndex((candidate: PromotionCode) =>
      this.isSameRowAs(candidate),
    );

    // [model/entity/PromotionCode.cfc:L136-L138] `if(thatIndex > 0)` becomes `!== -1`.
    if (thatIndex !== -1) {
      promotionCodes.splice(thatIndex, 1);
    }
  }

  /**
   * Row identity for two account projections.
   *
   * The same rule {@link PromotionCode.isSameRowAs} applies to promotion codes, restated for the
   * far-side element type: primary key when both keys are non-empty, object identity otherwise.
   *
   * Module-private: it exists because the target has no Hibernate session, and the legacy needed
   * no counterpart.
   */
  private isSameAccountRow(
    held: PromotionCodeAccountLink,
    candidate: PromotionCodeAccountLink,
  ): boolean {
    const heldAccountID: string = held.getAccountID();
    const candidateAccountID: string = candidate.getAccountID();

    if (heldAccountID === '' || candidateAccountID === '') {
      return held === candidate;
    }

    return heldAccountID === candidateAccountID;
  }

  // Orders (many-to-many - inverse) [model/entity/PromotionCode.cfc:L141]

  // Both legacy bodies are pure inverse-side delegation and are correctly PAIRED, as re-verified
  // in the inversion cross-check above: `addOrder` -> `addPromotionCode`.

  /**
   * ORM-generated containment probe for the `orders` collection. [model/entity/Order.cfc:L844]
   *
   * Not hand-written in the source, and not called from this component either - which is exactly
   * why it needs recording.
   *
   * Containment is by primary key with a reference fallback, identical in shape and identical in
   * justification to {@link PromotionCode.hasAccount}.
   */
  hasOrder(order: OrderPromotionCodeLink): boolean {
    const candidateOrderID: string = order.getOrderID();

    if (candidateOrderID === '' || this.ordersContainUnsavedRow()) {
      return this.orders.some((held: OrderPromotionCodeLink) => held === order);
    }

    return this.orders.some(
      (held: OrderPromotionCodeLink) => held.getOrderID() === candidateOrderID,
    );
  }

  /**
   * Whether any held order row is unsaved, in which case primary-key containment cannot separate
   * rows and {@link PromotionCode.hasOrder} falls back to object identity.
   */
  private ordersContainUnsavedRow(): boolean {
    return this.orders.some((held: OrderPromotionCodeLink) => held.getOrderID() === '');
  }

  /**
   * Bidirectional helper for the `orders` many-to-many. [model/entity/PromotionCode.cfc:L142-L144]
   */
  addOrder(order: OrderPromotionCodeLink): void {
    order.addPromotionCode(this);
  }

  /**
   * Bidirectional helper for the `orders` many-to-many. [model/entity/PromotionCode.cfc:L145-L147]
   */
  removeOrder(order: OrderPromotionCodeLink): void {
    order.removePromotionCode(this);
  }

  /**
   * `isDeletable` - may this promotion code be deleted?
   *
   * NOT declared on `model/entity/PromotionCode.cfc`: the legacy call at
   * [model/entity/Promotion.cfc:L127] resolves to the framework base
   * [org/Hibachi/HibachiEntity.cfc:L204-L206], whose body is
   * `!getService("hibachiValidationService").validate(object=this, context="delete",
   * setErrors=false).hasErrors()`. AAP 0.5.3 replaces that framework responsibility with typed
   * schemas rather than porting the base class, so the predicate is resolved here from the entity's
   * own declarative rules.
   *
   * `model/validation/PromotionCode.json` declares, as its ENTIRE delete context, exactly one rule:
   * `"orders": [{"contexts":"delete","maxCollection":0}]`. Under that schema the framework body
   * reduces to "no order references this code", which is what this reads.
   *
   * The same construction the legacy uses for the parent: `Promotion.cfc:L170-L172` overrides
   * `isDeletable()` as `arrayLen(getAppliedPromotions()) == 0`, which is verbatim its own
   * `model/validation/Promotion.json` rule `"appliedPromotions": [{"contexts":"delete",
   * "maxCollection":0}]`.
   *
   * Synchronous, and over the already-materialized inverse collection - no `lazy="extra"` count
   * query is issued, because the repository decided the fetch shape when it hydrated the row.
   *
   * @returns `true` when no `SwOrderPromotionCode` row references this code.
   */
  isDeletable(): boolean {
    return this.orders.length === 0;
  }

  // NOTE: the source has no `END: Bidirectional Helper Methods` banner closing the block opened at
  // [model/entity/PromotionCode.cfc:L98]. See wart 1 in the banner table at the foot of the file.

  // [model/entity/PromotionCode.cfc:L157-L159] - and the source block is completely empty.

  // LEGACY-NOTE `hasUniquePromotionCode` is not DECLARED in model/entity/PromotionCode.cfc. It
  // appears nowhere in the 192 lines - the `// START: Custom Validation Methods` / `// END` banner
  // pair at L157/L159 is empty.
  //
  // Naming the obligation without saying whether anything discharges it reads as though something
  // does.

  /**
   * Whether this code's `promotionCode` value is unique among the siblings this entity can see.
   *
   * ZERO ARGUMENTS and the verbatim framework-synthesised name, so the declarative invocation in
   * model/validation/PromotionCode.json resolves exactly as it does in CFML.
   *
   * Synchronous and side-effect-free: it reads only already-materialized state and mutates
   * nothing, not even the memo.
   */
  hasUniquePromotionCode(): boolean {
    const promotionCode: string | undefined = this.promotionCode;

    if (!isPresent(promotionCode) || cfLen(promotionCode) === 0) {
      return true;
    }

    const promotion: Promotion | undefined = this.promotion;

    if (promotion === undefined) {
      return true;
    }

    const normalizedPromotionCode: string = promotionCode.toLowerCase();

    const hasCollidingSibling: boolean = promotion
      .getPromotionCodes()
      .some((sibling: PromotionCode): boolean => {
        const siblingID: string = sibling.getPromotionCodeID();

        // Unsaved siblings are invisible to the legacy database query, so they cannot collide.
        if (siblingID === '') {
          return false;
        }

        // Self-exclusion by primary key [org/Hibachi/HibachiDAO.cfc:L139].
        if (siblingID === this.promotionCodeID) {
          return false;
        }

        const siblingCode: string | undefined = sibling.getPromotionCode();

        if (!isPresent(siblingCode) || cfLen(siblingCode) === 0) {
          return false;
        }

        return siblingCode.toLowerCase() === normalizedPromotionCode;
      });

    return !hasCollidingSibling;
  }

  // [model/entity/PromotionCode.cfc:L159]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L171-L173]: this is the DECLARATIVE form of simple
  // representation - the entity names the property and the framework reads it - which is the same
  // shape as [model/entity/PriceGroupRate.cfc:L270].

  /**
   * The property whose value stands in as this entity's human-readable label.
   * [model/entity/PromotionCode.cfc:L171]
   *
   * Returns the literal `'promotionCode'`, exactly as the source returns the literal
   * `"promotionCode"`.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'promotionCode';
  }

  // [model/entity/PromotionCode.cfc:L175]

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L177-L187]: this hook section is insert-only, and
  // that makes `PromotionCode` the odd one out among the four hook-bearing in-scope entities.
  //
  // | entity | hooks | path column | | Category | preInsert() L126, preUpdate(struct oldData)
  // L131| categoryIDPath | | PriceGroup | preInsert() L206.

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L181-L184] - the hook ordering, which must not be
  // normalised. The guarded assignment (L181-L183) runs before `super.preInsert()` (L184).

  // LEGACY-NOTE [model/entity/PromotionCode.cfc:L184] `super.preInsert()`: there is no base class
  // in the target, and none is emulated.

  // What does change is the INVOCATION MECHANISM - the ORM event dispatcher becomes an explicit
  // call from the persistence tier.
  //
  // The mandate reaches the METHOD, which is why it is authored.
  //
  // Nothing else in this file spends anything either: zero widenings, zero reshapings, zero
  // visibility changes, zero deliberate divergences.

  /**
   * The ported `preInsert` hook. [model/entity/PromotionCode.cfc:L179-L185]
   *
   * To be invoked at save time by whatever saves a promotion code, mirroring where the ORM event
   * fired - and no such saver exists in this port's scope.
   *
   * `preInsert(): void` and `preUpdate(oldData?: Readonly<Record<string, unknown>>): void`, and it
   * is the same pair on `category.ts` and `priceGroup.ts`.
   */
  preInsert(): void {
    // Override the preInsert method to set a promotion code if one wasn't assinged.
    //
    // LEGACY-NOTE [model/entity/PromotionCode.cfc:L180]: the comment line above is carried over
    // VERBATIM, misspelling intact - "assinged", not "assigned".
    if (isNullish(this.promotionCode) || cfLen(this.promotionCode) === 0) {
      this.setPromotionCode(createCfmlShapedUuid());
    }
  }

  // [model/entity/PromotionCode.cfc:L187]

  // [model/entity/PromotionCode.cfc:L189-L191] - empty in the source.
}

// Canonical far-side contract required of `./promotion.js`
//
// `slatwall-ts/src/domain/entities/promotion.ts` is authored separately, so the requirements this
// file places on it are stated here as CANONICAL and must not be renamed later.

// Banner warts - `PromotionCode` has the messiest banner structure in the in-scope set.
//
// | section | locators | state | | Non-Persistent Property Methods (first) | L83 start / L96 end|
// populated.

// Validation schema - model/validation/PromotionCode.json exists, read verbatim.
//
// The entity carries the PROPERTY METADATA; schema ENFORCEMENT belongs to the service tier, where
// the ported declarative rules become zod schemas.

// Test contract - net-new coverage, never parity.
//
// `tests/unit/domain/entities/promotionCode.test.ts` is authored separately; that tier is owned
// elsewhere and no test file is created from here.
