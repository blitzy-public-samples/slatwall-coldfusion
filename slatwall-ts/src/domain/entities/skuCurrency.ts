// slatwall-ts - SkuCurrency entity. Port of model/entity/SkuCurrency.cfc (131 lines).
//
// Schema continuity is binding and the property metadata is the contract: table `SwSkuCurrency`,
// entity name `SlatwallSkuCurrency`, no migration, no rename, no new or dropped column.
//
// `hb_serviceName="skuService"` points at model/service/SkuService.cfc, not at a service of its
// own.
//
// `hb_permission="sku.skuCurrencies"` is A NESTED PATH rather than the usual `"this"`: it names
// the parent entity and the parent's collection, placing this entity in the small child/link
// family that does the same.
// strictness with no `any`, no `@ts-ignore`/`@ts-expect-error` and no non-null

import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { Money } from '../valueObjects/money.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE [model/entity/SkuCurrency.cfc:L59] and [model/entity/Sku.cfc:L72]: the `skuCurrency`
// <-> `sku` type cycle is unavoidable and safe.
//
// Both directions are `import type` only, which TypeScript erases at emit.
//
// Nothing else about `Sku` is depended upon here; the coupling is deliberately narrow.

/**
 * One `SwSkuCurrency` row: a per-currency price override for a single SKU.
 *
 * Immutable except for one field: every field is `readonly` apart from `sku`, which
 * `setSku`/`removeSku` must be able to assign and clear.
 */
export class SkuCurrency {
  // Persistent Properties [model/entity/SkuCurrency.cfc:L51-L55]

  /**
   * Primary key. [model/entity/SkuCurrency.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one.
   */
  private readonly skuCurrencyID: string;

  // The three monetary columns. All three are `Money | undefined`, and this is the
  // highest-consequence decision in this file.
  //
  // Never substitute `0` for a missing value - not `?? Money.zero`, not an `orZero()` helper, not
  // a `0` constructor default, not a `0` accessor fallback.

  /**
   * `price`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L53]
   */
  private readonly price: Money | undefined;

  /**
   * `renewalPrice`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L54]
   */
  private readonly renewalPrice: Money | undefined;

  /**
   * `listPrice`, or `undefined` when the column is NULL. [model/entity/SkuCurrency.cfc:L55]
   */
  private readonly listPrice: Money | undefined;

  // Related Object Properties (many-to-one) [model/entity/SkuCurrency.cfc:L57-L59]
  //
  // Exactly two, and they are resolved in two DIFFERENT ways because only one of their targets is
  // in scope.

  /**
   * The currency this override is denominated in, as the branded three-character code.
   *
   * L58's foreign-key column is `currencyCode` itself, not a surrogate id, so the association and
   * its key are the same column and L68 is that column surfaced as a readable property.
   *
   * JUDGMENT CALL: non-optional, though neither L58 nor L68 declares `notnull` and the column is
   * therefore nullable at the schema level - and the column is deliberately not changed.
   */
  private readonly currencyCode: CurrencyCode;

  /**
   * The materialized far side of the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L59]
   *
   * The only mutable field on this class: `setSku` assigns it and `removeSku` clears it.
   *
   * Declared `Sku | undefined` and deliberately not as an optional `sku?: Sku`.
   */
  private sku: Sku | undefined;

  // Remote Properties [model/entity/SkuCurrency.cfc:L70-L71]

  /**
   * `remoteID` - the external-system correlation key. [model/entity/SkuCurrency.cfc:L71]
   */
  private readonly remoteID: string | undefined;

  // Audit Properties [model/entity/SkuCurrency.cfc:L73-L77]
  //
  // All four carry `hb_populateEnabled="false"`, the legacy mechanism for excluding them from mass
  // assignment.
  //
  // The two account associations collapse to opaque ID strings.

  /**
   * `createdDateTime`. [model/entity/SkuCurrency.cfc:L74] `ormtype="timestamp"`.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L75]
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * `modifiedDateTime`. [model/entity/SkuCurrency.cfc:L76] `ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L77]
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwSkuCurrency` row.
   *
   * A single readonly parameter object, typed inline rather than as a second exported interface,
   * because this module exports exactly one unit.
   *
   * No defaults are applied here - not `0`, not `Money.zero`, not a clock reading, not a currency
   * code.
   */
  constructor(init: {
    readonly skuCurrencyID: string;
    readonly price: Money | undefined;
    readonly renewalPrice: Money | undefined;
    readonly listPrice: Money | undefined;
    readonly currencyCode: CurrencyCode;
    readonly sku: Sku | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.skuCurrencyID = init.skuCurrencyID;
    this.price = init.price;
    this.renewalPrice = init.renewalPrice;
    this.listPrice = init.listPrice;
    this.currencyCode = init.currencyCode;
    this.sku = init.sku;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // ColdFusion generated every one of these from the property metadata - `accessors="true"` on
  // [model/entity/SkuCurrency.cfc:L49] - so there is no legacy body to port.

  /**
   * [model/entity/SkuCurrency.cfc:L52] Read by cascade Step 2 at [model/entity/Sku.cfc:L412].
   */
  getSkuCurrencyID(): string {
    return this.skuCurrencyID;
  }

  /**
   * `price`, or `undefined`. [model/entity/SkuCurrency.cfc:L53]
   */
  getPrice(): Money | undefined {
    return this.price;
  }

  /**
   * `renewalPrice`, or `undefined`. [model/entity/SkuCurrency.cfc:L54]
   */
  getRenewalPrice(): Money | undefined {
    return this.renewalPrice;
  }

  /**
   * `listPrice`, or `undefined`. [model/entity/SkuCurrency.cfc:L55]
   */
  getListPrice(): Money | undefined {
    return this.listPrice;
  }

  /**
   * The read-only projection of the `currency` foreign key. [model/entity/SkuCurrency.cfc:L68],
   * projecting the FK column named at [model/entity/SkuCurrency.cfc:L58].
   *
   * On A live must-preserve path: cascade Step 2 keys its per-currency override lookup off exactly
   * this value at [model/entity/Sku.cfc:L400], comparing with CFML `eq`.
   *
   * CFML `eq` is case-insensitive and `===` is not, so a caller comparing two currency codes must
   * route through `currencyCodeEquals`.
   */
  getCurrencyCode(): CurrencyCode {
    return this.currencyCode;
  }

  /**
   * The materialized far side of the `sku` many-to-one, or `undefined`.
   * [model/entity/SkuCurrency.cfc:L59]
   *
   * `undefined` when the repository did not fetch it, when `setSku` has never run, or after
   * `removeSku` has cleared it.
   */
  getSku(): Sku | undefined {
    return this.sku;
  }

  /**
   * [model/entity/SkuCurrency.cfc:L71] Inert in this slice; no synchronisation is ported.
   */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L75]
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/SkuCurrency.cfc:L77]
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // Bidirectional Helper Methods [model/entity/SkuCurrency.cfc:L86]..

  // Dropping either half would produce a SILENT inconsistency rather than avoid one: two accessors
  // disagreeing about one link, with no error anywhere.
  //
  // The L91 guard is ported too, with the `isNew()` it calls and the `isSameRowAs` the `arrayFind`
  // needs.

  /**
   * Bidirectional helper for the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L89]
   *
   * The parameter is required, matching L89's `required any sku`.
   *
   * Both statements are reproduced in the source's order: the near-side assignment at
   * [model/entity/SkuCurrency.cfc:L90] runs first and unconditionally.
   */
  setSku(sku: Sku): void {
    // [model/entity/SkuCurrency.cfc:L90] - before the guard, always.
    this.sku = sku;

    // [model/entity/SkuCurrency.cfc:L91-L93] - the guarded append onto the sku's LIVE array.
    // `push` mutates in place, which is required: `arrayAppend` mutated the very array that
    // `Sku.getSkuCurrencies()` hands back.
    if (this.isNew() || !sku.hasSkuCurrency(this)) {
      sku.getSkuCurrencies().push(this);
    }
  }

  /**
   * Whether this row has never been persisted. [org/Hibachi/HibachiEntity.cfc:L571-L576] via
   * [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * The framework base defines `isNew()` as `getNewFlag()`, and `getNewFlag()` as
   * `getPrimaryIDValue() == ""`.
   */
  isNew(): boolean {
    return this.skuCurrencyID === '';
  }

  /**
   * Whether `candidate` denotes the same `SwSkuCurrency` row as this instance.
   *
   * Private, with no legacy counterpart by name: it stands for CFML's `arrayFind(array, this)` at
   * [model/entity/SkuCurrency.cfc:L99].
   */
  private isSameRowAs(candidate: SkuCurrency): boolean {
    const candidateSkuCurrencyID: string = candidate.getSkuCurrencyID();

    if (candidateSkuCurrencyID === '' || this.skuCurrencyID === '') {
      return candidate === this;
    }

    return candidateSkuCurrencyID === this.skuCurrencyID;
  }

  /**
   * Bidirectional helper for the `sku` many-to-one. [model/entity/SkuCurrency.cfc:L95]
   *
   * It throws when the argument is omitted and no sku is set, and that is behaviour preservation
   * rather than defensiveness: at [model/entity/SkuCurrency.cfc:L97] the legacy executes
   * `arguments.sku = variables.sku;`, and with the key already absent.
   */
  removeSku(sku?: Sku): void {
    const resolvedSku: Sku | undefined = sku !== undefined ? sku : this.sku;

    if (resolvedSku === undefined) {
      // [model/entity/SkuCurrency.cfc:L97] - CFML fails here reading an absent `variables.sku`.
      throw new Error(
        'SkuCurrency.removeSku was called with no argument while no sku is set. ' +
          'model/entity/SkuCurrency.cfc:L96-L98 defaults the argument from variables.sku, and ' +
          'CFML raises "Element SKU is undefined in VARIABLES." on that read once the key has ' +
          'been structDelete-d at L103. Reproduced rather than silently absorbed.',
      );
    }

    // [model/entity/SkuCurrency.cfc:L99] array index base change: CFML `arrayFind` returns a
    // 1-BASED index, or 0 for "not found", which is why the source guards with `index > 0` at
    // L100.
    //
    // Containment is by PRIMARY KEY with a reference fallback for an unsaved row, per
    // `isSameRowAs`.
    const skuCurrencies: SkuCurrency[] = resolvedSku.getSkuCurrencies();
    const index: number = skuCurrencies.findIndex((candidate: SkuCurrency) =>
      this.isSameRowAs(candidate),
    );
    if (index !== -1) {
      skuCurrencies.splice(index, 1);
    }

    // [model/entity/SkuCurrency.cfc:L103] - unconditional, outside the `if(index > 0)` block at
    // L100-L102.
    this.sku = undefined;
  }

  // Bidirectional Helper Methods.

  // Overridden Methods [model/entity/SkuCurrency.cfc:L116]..
  // [model/entity/SkuCurrency.cfc:L122]

  /**
   * A short human-readable label for this row. [model/entity/SkuCurrency.cfc:L118-L120]
   *
   * The separator is EXACTLY `' - '` - space, hyphen, space - reproduced byte for byte.
   *
   * JUDGMENT CALL: an unhydrated sku is GUARDED rather than thrown on, with the empty string
   * standing in for the missing code.
   */
  getSimpleRepresentation(): string {
    // [model/entity/SkuCurrency.cfc:L119] - `getSku().getSkuCode()`, guarded on both levels.
    const skuCode: string = this.sku === undefined ? '' : (this.sku.getSkuCode() ?? '');

    // [model/entity/SkuCurrency.cfc:L119] - the separator is EXACTLY one space, one hyphen, one
    // space, reproduced byte for byte from `& " - " &`.
    return `${skuCode} - ${this.currencyCode}`;
  }

  // Overridden Methods.
}

// HAND-OFF NOTES - obligations that belong to other modules, recorded here because this entity's
// contract assumes them.
