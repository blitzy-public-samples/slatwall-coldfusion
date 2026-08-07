// slatwall-ts - Price group resolution and rate application service.
//
// Five of thirteen methods are synchronous, and that is contractual.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L49]: the component header is the LONG form,
// `persistent="false" accessors="true" output="false"` - both ORM and framework directives a
// TypeScript class needs no equivalent of.
//
// LEGACY-NOTE [model/service/PriceGroupService.cfc:L205, L207, L220, L224, L233]: five self-calls
// go through `this.` while the component's eleven others are unqualified.

import { PriceGroupRate } from '../domain/entities/priceGroupRate.js';
import { Money } from '../domain/valueObjects/money.js';
import { CfmlNumberFormatError, numberFormat } from '../lib/cfml/numberFormat.js';
import { cfEquals } from '../lib/cfml/struct.js';
import { cfLen, isNullish } from '../lib/cfml/truthiness.js';

import type { PriceGroup } from '../domain/entities/priceGroup.js';
import type { PriceGroupRateAmountType } from '../domain/entities/priceGroupRate.js';
import type { Product } from '../domain/entities/product.js';
import type { ProductType } from '../domain/entities/productType.js';
import type { RoundingRule } from '../domain/entities/roundingRule.js';
import type { Sku, SkuPriceGroupResolver } from '../domain/entities/sku.js';
import type {
  CurrentAccountContext,
  PriceGroupRepository,
} from '../domain/ports/priceGroupRepository.js';
import type { ProductRepository } from '../domain/ports/productRepository.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { OrderView } from '../domain/views/orderView.js';

// Arithmetic goes through `Money`, so `src/lib/cfml/precision.ts` is deliberately not imported -
// reasoned out at `calculateSkuPriceBasedOnPriceGroupRate`.

// The four co-located public types.
//
// JUDGMENT CALL: `PriceGroupAppliedIntent`, `BestPriceGroupDetails`, `PriceGroupSkuSettingsInput`
// and `PriceGroupRateSaveInput` are declared INLINE here rather than in a new domain module or a
// new port.

/**
 * The output of {@link PriceGroupService.updateOrderAmountsWithPriceGroups} for a single order
 * item, and the ANTI-CORRUPTION BOUNDARY that lets the price-group engine deploy without porting
 * the order aggregate.
 *
 * Legacy [model/service/PriceGroupService.cfc:L364] returns `void` and MUTATES the order aggregate
 * in place - `setPrice()` at [model/service/PriceGroupService.cfc:L370] and
 * `setAppliedPriceGroup()` at [model/service/PriceGroupService.cfc:L371].
 */
export interface PriceGroupAppliedIntent {
  /**
   * The order item the intent applies to, as an opaque identifier.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L370]: legacy reaches the item itself through
   * `order.getOrderItems()[i]`. Here the item is identified, never held.
   */
  readonly orderItemID: string;

  /**
   * CFML parity [model/service/PriceGroupService.cfc:L370]: `setPrice(priceGroupDetails.price)`.
   */
  readonly price: Money;

  /**
   * The winning price group, as an opaque identifier.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L371]:
   * `setAppliedPriceGroup(priceGroupDetails.priceGroup)` assigns the entity.
   */
  readonly priceGroupID: string;
}

/**
 * The return shape of {@link PriceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount}.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L348, L369]: the legacy struct seeds
 * `priceGroup` with an EMPTY STRING as its "no price group" sentinel
 * [model/service/PriceGroupService.cfc:L348] and later tests it with `isObject(...)`
 * [model/service/PriceGroupService.cfc:L369].
 */
export interface BestPriceGroupDetails {
  /**
   * The best price found, seeded from the SKU's own price.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L347]: seeded with `sku.getPrice()`, never
   * with zero. A zero seed would make every price group look worse than "no price group" and sell
   * the SKU for nothing.
   */
  readonly price: Money;

  /**
   * The price group that produced {@link BestPriceGroupDetails.price}, or `undefined` when no
   * price group beat the SKU's own price.
   */
  readonly priceGroup: PriceGroup | undefined;
}

/**
 * LEGACY-NOTE [model/service/PriceGroupService.cfc:L184]: the legacy signature is
 * `public void function updatePriceGroupSKUSettings(data)` - the parameter is UNTYPED and not
 * declared `required`.
 *
 * `"inherit"` and `""` arrive on the request context, so they are preserved verbatim as literals
 * and every comparison against them is CASE-INSENSITIVE, matching CFML string comparison.
 */
export interface PriceGroupSkuSettingsInput {
  /**
   * The rate to update, or one of the two keyword sentinels.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L189, L194, L199]: read as a rate identifier
   * at [model/service/PriceGroupService.cfc:L205] and [model/service/PriceGroupService.cfc:L220],
   * and compared against `"new amount"`, `""` and `"inherit"` as a keyword. Required, because
   * [model/service/PriceGroupService.cfc:L194] dereferences it unconditionally.
   */
  readonly priceGroupRateId: string;

  /**
   * The product the rate is being attached to on the whole-product branch.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L206]: dereferenced unconditionally on that
   * branch with no existence check.
   */
  readonly productId: string;

  /**
   * The SKU identifier. An empty string selects the whole-product branch.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L197, L219]: dereferenced unconditionally at
   * [model/service/PriceGroupService.cfc:L197], before either branch is chosen.
   */
  readonly skuId: string;
  readonly resolvedSku: Sku | undefined;
  readonly amount?: string;
}

/**
 * The payload {@link PriceGroupService.savePriceGroupRate} reads.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L397]: declared `struct data` and therefore
 * OPTIONAL, yet [model/service/PriceGroupService.cfc:L399] dereferences `data.priceGroupRateId`
 * unconditionally.
 */
export interface PriceGroupRateSaveInput {
  /**
   * The rate identifier, or the `"new amount"` keyword.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L399]: the only key the method reads.
   */
  readonly priceGroupRateId: string;

  /**
   * The submitted amount.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L190]: absent on the paths where the in-slice
   * caller deletes it.
   */
  readonly amount?: string;
  readonly amountType?: PriceGroupRateAmountType;

  /**
   * It is read by the reconciliation block immediately after populate.
   */
  readonly globalFlag?: boolean;

  /**
   * `remoteID` [model/entity/PriceGroupRate.cfc:L58] - the integration-identity column.
   *
   * In the populate set because the legacy reflection reached it like any other scalar column.
   */
  readonly remoteID?: string;

  /**
   * `roundingRule` [model/entity/PriceGroupRate.cfc:L68], as the resolved entity.
   *
   * An entity rather than an identifier, because resolving one would mean a service tier loading
   * entities by ID through a locator no in-scope port publishes.
   */
  readonly roundingRule?: RoundingRule | null;
}

// The one module-local collaborator contract.

/**
 * The two framework-generic reads this service needs and no port publishes. Deliberately
 * un-exported, so it is not read as an addition to the locked port inventory.
 */
interface PriceGroupFrameworkReads {
  /**
   * The price groups assigned DIRECTLY to an account.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L276, L351, L365]:
   * `account.getPriceGroups()`, the ORM association on the out-of-scope `Account` entity, which is
   * identified opaquely here.
   *
   * @param accountID the account, as an opaque identifier.
   * @returns the account's live, mutable, request-scoped association; empty when there are none.
   */
  getAccountPriceGroups(accountID: string): Promise<PriceGroup[]>;

  /**
   * The current page of price groups.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L233-L236]: legacy builds a framework smart
   * list and iterates `getPageRecords()` - one page, not the whole collection.
   *
   * The page holds at most ten rows, and the ten is stated by the source rather than chosen here.
   *
   * @returns the price groups on the current page - at most ten, empty when there are none.
   */
  getPriceGroupPageRecords(): Promise<readonly PriceGroup[]>;
}

/**
 * One entry of the {@link PriceGroupService.getPriceGroupDataJSON} rate array.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L242-L243]: the legacy struct has exactly the
 * two keys `id` and `name`. Module-local and un-exported, because it is an internal shape of one
 * method's JSON output and not part of this file's published surface.
 */
interface PriceGroupRateDataEntry {
  readonly id: string;
  readonly name: string;
}

/**
 * One entry of the {@link PriceGroupService.getPriceGroupDataJSON} outer map.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L248-L251]: the legacy struct has exactly the
 * two keys `priceGroupName` and `priceGroupRates`.
 */
interface PriceGroupDataEntry {
  readonly priceGroupName: string | undefined;
  readonly priceGroupRates: readonly PriceGroupRateDataEntry[];
}

// MODULE-LOCAL HELPERS - all un-exported. No helper joins this file's published surface, and there
// is no fourteenth public method.

/**
 * Does a rate's `amountType` select the given dispatch arm, with case folded as CFML folds it?
 *
 * @param subject the rate's persisted `amountType`, which may be absent.
 * @param arm the dispatch arm being tested, in the source's canonical spelling.
 * @returns `true` only when the subject is present and equals the arm with case folded.
 */
function matchesAmountType(subject: PriceGroupRateAmountType | undefined, arm: string): boolean {
  return subject !== undefined && cfEquals(subject, arm);
}

/**
 * Reads a rate's amount, throwing when it is absent.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L323, L331, L334]: `getAmount()` is read at all
 * three sites without A GUARD, and `PriceGroupRate.amount` is declared `ormType="big_decimal"`
 * with no default at [model/entity/PriceGroupRate.cfc:L54].
 *
 * @param priceGroupRate the rate whose amount is read.
 * @param amountType the branch requiring it, for the diagnostic only.
 * @returns the rate's amount.
 * @throws when the rate carries no amount.
 */
function requireRateAmount(
  priceGroupRate: PriceGroupRate,
  amountType: PriceGroupRateAmountType,
): Money {
  const amount = priceGroupRate.getAmount();

  if (amount === undefined) {
    throw new Error(
      `PriceGroupRate "${priceGroupRate.getPriceGroupRateID()}" has amountType ` +
        `"${amountType}" but carries no amount. ` +
        'CFML parity [model/service/PriceGroupService.cfc:L323,L331,L334]: the amount is read ' +
        'without a guard and a null operand raises. No zero default is substituted, because a ' +
        'zero amount would silently mean "no discount" or "free".',
    );
  }

  return amount;
}

/**
 * Reproduces the unconditional throw behind [model/service/PriceGroupService.cfc:L243].
 *
 * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: `getAmountRepresentation()` does not
 * exist on `PriceGroupRate` and cannot be served by the framework's `onMissingMethod`.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Declared `never` so the compiler knows the call site cannot continue.
 *
 * @throws always.
 */
function getAmountRepresentation(priceGroupRate: PriceGroupRate): never {
  throw new Error(
    `getAmountRepresentation() does not exist on PriceGroupRate ` +
      `"${priceGroupRate.getPriceGroupRateID()}". ` +
      'LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the legacy call reaches ' +
      'HibachiEntity.onMissingMethod, which cannot serve it because PriceGroupRate declares no ' +
      'attributeValues, and throws. getAmountFormatted() is the plausible intended target and is ' +
      'deliberately not substituted.',
  );
}

/**
 * Reproduces the unconditional throw behind [model/service/PriceGroupService.cfc:L400].
 *
 * LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: `clearAmounts()` does not exist on
 * `PriceGroupRate` and cannot be served by `onMissingMethod`, since the entity declares no
 * `attributeValues`, so it throws. Guarded by L399, so only the "new amount" admin path fails.
 * Preserved deliberately; do not fix without a product decision.
 *
 * @throws always.
 */
function clearAmounts(priceGroupRate: PriceGroupRate): never {
  throw new Error(
    `clearAmounts() does not exist on PriceGroupRate ` +
      `"${priceGroupRate.getPriceGroupRateID()}". ` +
      'LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: the legacy call reaches ' +
      'HibachiEntity.onMissingMethod, which cannot serve it because PriceGroupRate declares no ' +
      'attributeValues, and throws. It is guarded by L399, so only the "new amount" admin path ' +
      'fails; every other rate-save path completes and runs the exclusivity block.',
  );
}

/**
 * What population observed about the payload, for the validation step that follows it.
 */
interface PriceGroupRatePopulationOutcome {
  /**
   * `true` when the payload carried an `amount` that is not a decimal numeral.
   *
   * Kept apart from "no amount at all" because `model/validation/PriceGroupRate.json` declares two
   * rules on the column - `required` and `dataType: "numeric"`.
   */
  readonly submittedAmountWasNonNumeric: boolean;
}

/**
 * Reproduces the population step that `super.save` performs internally
 * [org/Hibachi/HibachiService.cfc:L143-L148], for every key
 * [model/service/PriceGroupService.cfc:L397]'s declared input carries.
 *
 * Only `amount` is POPULATED, because it is the only populate-enabled key the declared payload
 * type carries.
 *
 * @param priceGroupRate the entity population writes onto.
 * @param data the submitted payload.
 * @returns what population observed, for the validation step.
 */
function populatePriceGroupRateFromPayload(
  priceGroupRate: PriceGroupRate,
  data: PriceGroupRateSaveInput,
): PriceGroupRatePopulationOutcome {
  // Every branch is `!== undefined`, never a truthiness test.

  // `amountType` [model/entity/PriceGroupRate.cfc:L55] - the property the save context requires.
  if (data.amountType !== undefined) {
    priceGroupRate.setAmountType(data.amountType);
  }

  // `globalFlag` [model/entity/PriceGroupRate.cfc:L53] - read by the reconciliation block that
  // runs immediately after this step.
  if (data.globalFlag !== undefined) {
    priceGroupRate.setGlobalFlag(data.globalFlag);
  }
  if (data.remoteID !== undefined) {
    priceGroupRate.setRemoteID(data.remoteID);
  }
  if (data.roundingRule !== undefined) {
    priceGroupRate.setRoundingRule(data.roundingRule ?? undefined);
  }

  const submittedAmount = data.amount;

  // UNCONDITIONAL on PRESENCE, never conditional on emptiness: populate copied whatever the key
  // held, and an empty string is a submitted value rather than an absent one.
  if (submittedAmount === undefined) {
    return { submittedAmountWasNonNumeric: false };
  }

  try {
    priceGroupRate.setAmount(Money.fromDecimalString(submittedAmount));
  } catch (error: unknown) {
    if (!(error instanceof CfmlNumberFormatError)) {
      throw error;
    }

    // The numeric rule's failure, recorded rather than raised.
    return { submittedAmountWasNonNumeric: true };
  }

  return { submittedAmountWasNonNumeric: false };
}

/**
 * Reproduces the `validate(context="save")` that `super.save` performs internally
 * [org/Hibachi/HibachiService.cfc:L151], against the SAVE-CONTEXT rules declared in
 * `model/validation/PriceGroupRate.json`.
 *
 * @param priceGroupRate the entity being saved, read for all three rules.
 * @param population what population observed, or `undefined` when no payload was passed.
 * @returns one entry per failed rule, empty when the rate passes.
 */
function collectPriceGroupRateSaveContextErrors(
  priceGroupRate: PriceGroupRate,
  population: PriceGroupRatePopulationOutcome | undefined,
): { readonly propertyIdentifier: string; readonly errorMessage: string }[] {
  const errors: { readonly propertyIdentifier: string; readonly errorMessage: string }[] = [];
  if (priceGroupRate.getPriceGroup() === undefined) {
    errors.push({ propertyIdentifier: 'priceGroup', errorMessage: 'priceGroup is required' });
  }

  // `"amountType": [{"contexts":"save","required":true}]`. Read off the ENTITY, so a value carried
  // in by population satisfies the rule - which is the order
  // [model/service/PriceGroupService.cfc:L146] then [model/service/PriceGroupService.cfc:L151]
  // establishes.
  if (priceGroupRate.getAmountType() === undefined) {
    errors.push({ propertyIdentifier: 'amountType', errorMessage: 'amountType is required' });
  }

  // `"amount": [{"contexts":"save","required":true,"dataType":"numeric"}]` - two rules on one
  // property, reported separately because the legacy reported whichever one the value broke.
  if (population?.submittedAmountWasNonNumeric === true) {
    errors.push({ propertyIdentifier: 'amount', errorMessage: 'amount must be numeric' });
  } else if (priceGroupRate.getAmount() === undefined) {
    errors.push({ propertyIdentifier: 'amount', errorMessage: 'amount is required' });
  }

  return errors;
}

/**
 * Two of the six delete rules are answerable here, and B5 is enforced by omission for the rest.
 *
 * Loop at [model/service/PriceGroupService.cfc:L465-L467] runs before the delete and empties
 * `childPriceGroups` itself, so that rule normally passes by the time this runs - it is still
 * asserted.
 *
 * @param priceGroup the price group being deleted, read for both rules.
 * @returns one entry per failed rule, empty when the price group may be deleted.
 */
function collectPriceGroupDeleteContextErrors(
  priceGroup: PriceGroup,
): { readonly propertyIdentifier: string; readonly errorMessage: string }[] {
  const errors: { readonly propertyIdentifier: string; readonly errorMessage: string }[] = [];
  if (priceGroup.getChildPriceGroups().length !== 0) {
    errors.push({
      propertyIdentifier: 'childPriceGroups',
      errorMessage: 'childPriceGroups must be empty to delete',
    });
  }
  if (priceGroup.getPromotionRewards().length !== 0) {
    errors.push({
      propertyIdentifier: 'promotionRewards',
      errorMessage: 'promotionRewards must be empty to delete',
    });
  }

  return errors;
}

/**
 * Builds the payload `updatePriceGroupSKUSettings` forwards to `savePriceGroupRate`, omitting
 * `amount` on every path but `"new amount"`.
 *
 * JUDGMENT CALL: legacy achieves this by DELETING the key from the caller's own struct -
 * `StructDelete(arguments.data, "amount")` at [model/service/PriceGroupService.cfc:L190].
 */
function buildRateSavePayload(data: PriceGroupSkuSettingsInput): PriceGroupRateSaveInput {
  // Legacy [model/service/PriceGroupService.cfc:L188], verbatim: "If we are not updating to a new
  // amount then make sure to delete "amount" from RC or else it will overwrite the Rate.".
  if (!cfEquals(data.priceGroupRateId, 'new amount')) {
    return { priceGroupRateId: data.priceGroupRateId };
  }

  const amount = data.amount;

  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional property, so an
  // absent amount is expressed by omitting the key.
  if (amount === undefined) {
    return { priceGroupRateId: data.priceGroupRateId };
  }

  return { priceGroupRateId: data.priceGroupRateId, amount };
}

/**
 * Reads the caller-resolved SKU, throwing when it is absent.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L219, L221]: legacy loads the SKU through the
 * framework generic `getSku(primaryKey)`, which returns null on a miss, and then calls
 * `addSku(null)` at [model/service/PriceGroupService.cfc:L221], which raises.
 */
function requireResolvedSku(data: PriceGroupSkuSettingsInput): Sku {
  const sku = data.resolvedSku;

  if (sku === undefined) {
    throw new Error(
      `No SKU was resolved for skuId "${data.skuId}". ` +
        'CFML parity [model/service/PriceGroupService.cfc:L219,L221]: the framework accessor ' +
        'returns null on a miss and addSku(null) then raises. The SKU is a boundary input ' +
        'because no port publishes a SKU load-by-primary-key and no port member was invented.',
    );
  }

  return sku;
}

/**
 * Whether two `PriceGroup` instances are the same ROW, by the rule Hibernate's session identity
 * actually followed - which is not the same rule as "their primary keys are equal".
 *
 * The unsaved arm is unreachable on this path, and is still written.
 *
 * @param held a price group already held in the accumulating collection.
 * @param candidate the price group being sought.
 * @returns whether the two refer to the same row.
 */
function isSamePriceGroupRow(held: PriceGroup, candidate: PriceGroup): boolean {
  const heldKey = held.getPriceGroupID();
  const candidateKey = candidate.getPriceGroupID();

  if (heldKey === '' || candidateKey === '') {
    return held === candidate;
  }

  return cfEquals(heldKey, candidateKey);
}

/**
 * Narrows an association that the five-level cascade passes on or dereferences with no null test,
 * failing in the same place and for the same reason the legacy does.
 *
 * The four unguarded sites are [model/service/PriceGroupService.cfc:L116, L154, L159, L174]: two
 * pass a null into a `required any` parameter and two dereference a method on null, and CFML raises
 * at each. Answering "no rate resolved at this level" instead would not be conservative - the
 * cascade falls through to the next level and selects a different rate, which is a different price
 * arrived at silently, and this is must-preserve area 2.
 *
 * @param value the association the legacy statement reads.
 * @param failureDescription the whole message, carrying the legacy locator and the mechanism.
 * @returns the association, narrowed.
 * @throws when the association is absent, which is exactly where the legacy raises.
 */
function requireCascadeAssociation<T>(value: T | undefined, failureDescription: string): T {
  if (value === undefined) {
    throw new Error(failureDescription);
  }

  return value;
}

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L253]: a CFML struct has no prototype chain and
 * no reserved keys, so `priceGroupData[ '__proto__' ]` was an ordinary key and `serializeJSON`
 * emitted it. The plain assignment this replaces was the divergence.
 *
 * @param target the record being built.
 * @param key the externally sourced identifier.
 * @param value the value to store.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Price group resolution, price-group rate application, and the price-group order pass.
 *
 * Ordering constraint - {@link PriceGroupService.updateOrderAmountsWithPriceGroups} must be
 * executed before `PromotionService.updateOrderAmountsWithPromotions()`, explicitly and
 * non-optionally.
 *
 * The class declares `implements SkuPriceGroupResolver` so that any divergence in the three
 * signatures that contract names is a compile error rather than a review item.
 */
export class PriceGroupService implements SkuPriceGroupResolver {
  /**
   * T1 - every collaborator is an explicit constructor argument typed to a contract and wired once
   * in the composition root, with no optional parameter and no default.
   *
   * @param priceGroupRepository price-group persistence and the one subscription reach-through.
   * @param productRepository product load-by-identifier.
   * @param frameworkReads the two `HibachiService`/ORM generics no port publishes.
   */
  constructor(
    private readonly priceGroupRepository: PriceGroupRepository,
    private readonly productRepository: ProductRepository,
    private readonly frameworkReads: PriceGroupFrameworkReads,
  ) {}

  // must-preserve area #2 - the five-level cascade.
  //
  // Every selection loop in all three is last-match-wins, not first-match-wins.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L60, L105, L143]: `javaCast("null","")`
  // initialises `returnRate` in all three methods and becomes an explicitly-typed
  // `PriceGroupRate | undefined` local.

  /**
   * Resolves the price-group rate that applies to a product type, walking the product-type
   * ancestor chain and then the price-group parent chain.
   *
   * @returns the applicable rate, or `undefined` when none applies.
   */
  getRateForProductTypeBasedOnPriceGroup(
    productType: ProductType,
    priceGroup: PriceGroup,
  ): PriceGroupRate | undefined {
    let returnRate: PriceGroupRate | undefined = undefined;

    const rates = priceGroup.getPriceGroupRates();

    // Level 1 - [model/service/PriceGroupService.cfc:L63-L78]: the productType ancestor walk, per
    // rate.
    //
    // CFML parity [model/service/PriceGroupService.cfc:L63-L78]: the `break` at
    // [model/service/PriceGroupService.cfc:L72] exits only the inner `while` - the ancestor walk -
    // and not the rate loop.
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      // Legacy [model/service/PriceGroupService.cfc:L66]: re-initialised inside the rate loop,
      // once per rate.
      let currentProductType: ProductType | undefined = productType;

      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L68-L77]: this walk carries no cycle
      // guard of its own, exactly as the legacy does, and none is ADDED here.
      //
      // A cycle is unreachable from the entity side: `ProductType.setParentProductType` refuses an
      // assignment that would make a node reachable from itself, and `buildIdPathList` throws on a
      // revisited node.
      while (currentProductType !== undefined) {
        if (rate.hasProductType(currentProductType)) {
          returnRate = rate;
          // Legacy [model/service/PriceGroupService.cfc:L72]: exits the ancestor walk only.
          break;
        }

        // Legacy [model/service/PriceGroupService.cfc:L76]: ascend one level.
        currentProductType = currentProductType.getParentProductType();
      }
    }

    // Level 2 - [model/service/PriceGroupService.cfc:L81-L88]: the global-rate scan, also
    // LAST-match-wins, since the legacy loop carries no `break` anywhere.
    //
    // JUDGMENT CALL: `PriceGroup.getGlobalPriceGroupRate()` exists at
    // [model/entity/PriceGroup.cfc:L83] and is deliberately not substituted for this scan or for
    // either of the other two.
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        // CFML parity [model/service/PriceGroupService.cfc:L84]: `if(rates[i].getGlobalFlag())`.
        // `globalFlag` is declared `ormType="boolean" default="false"` at
        // [model/entity/PriceGroupRate.cfc:L53] and the ported accessor returns a strict
        // `boolean`, so no truthiness coercion occurs.
        if (rate.getGlobalFlag()) {
          returnRate = rate;
        }
      }
    }

    // Level 3 - [model/service/PriceGroupService.cfc:L91-L93]: recurse into the parent price
    // group, same productType.
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        returnRate = this.getRateForProductTypeBasedOnPriceGroup(productType, parentPriceGroup);
      }
    }

    // Level 4 - [model/service/PriceGroupService.cfc:L96-L98]: return if found, otherwise fall off
    // the end.
    if (!isNullish(returnRate)) {
      return returnRate;
    }

    // Legacy falls off the end here and CFML returns null. `undefined` is the contract; nothing is
    // substituted for it.
    return undefined;
  }

  /**
   * Resolves the price-group rate that applies to a product.
   *
   * @returns the applicable rate, or `undefined` when none applies.
   */
  getRateForProductBasedOnPriceGroup(
    product: Product,
    priceGroup: PriceGroup,
  ): PriceGroupRate | undefined {
    // Legacy [model/service/PriceGroupService.cfc:L105]: javaCast("null","").
    let returnRate: PriceGroupRate | undefined = undefined;

    const rates = priceGroup.getPriceGroupRates();

    // Level 1 - [model/service/PriceGroupService.cfc:L108-L112].
    // CFML parity: no `break`, so LAST-match-wins.
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      if (rate.hasProduct(product)) {
        returnRate = rate;
      }
    }

    // Level 2 - [model/service/PriceGroupService.cfc:L115-L117]: delegate with the product's
    // product type.
    if (isNullish(returnRate)) {
      // CFML parity [model/service/PriceGroupService.cfc:L116]: legacy passes
      // `arguments.product.getProductType()` straight through with no null test, into a parameter
      // declared `required any productType` at [model/service/PriceGroupService.cfc:L57].
      returnRate = this.getRateForProductTypeBasedOnPriceGroup(
        requireCascadeAssociation(
          product.getProductType(),
          `Product "${product.getProductID()}" has no product type, so the price-group cascade ` +
            'cannot resolve a rate for it. CFML parity ' +
            '[model/service/PriceGroupService.cfc:L116]: the legacy statement passes the null ' +
            'product type into getRateForProductTypeBasedOnPriceGroup, whose productType parameter ' +
            'is declared required at [L57], and CFML raises there.',
        ),
        priceGroup,
      );
    }

    // Level 3 - [model/service/PriceGroupService.cfc:L120-L127].
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        if (rate.getGlobalFlag()) {
          returnRate = rate;
        }
      }
    }

    // Level 4 - [model/service/PriceGroupService.cfc:L130-L132]: recurse into the parent price
    // group.
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        returnRate = this.getRateForProductBasedOnPriceGroup(product, parentPriceGroup);
      }
    }

    // Level 5 - [model/service/PriceGroupService.cfc:L135-L137].
    if (!isNullish(returnRate)) {
      return returnRate;
    }

    return undefined;
  }

  /**
   * Resolves the price-group rate that applies to a SKU.
   *
   * @returns the applicable rate, or `undefined` when none applies.
   */
  getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
    // Legacy [model/service/PriceGroupService.cfc:L143]: javaCast("null","").
    let returnRate: PriceGroupRate | undefined = undefined;

    const rates = priceGroup.getPriceGroupRates();

    // Level 1 - [model/service/PriceGroupService.cfc:L146-L150].
    // CFML parity: no `break`, so LAST-match-wins.
    for (let i = 0; i < rates.length; i += 1) {
      const rate = rates[i];

      if (rate === undefined) {
        continue;
      }

      if (rate.hasSku(sku)) {
        returnRate = rate;
      }
    }

    // Level 2 - [model/service/PriceGroupService.cfc:L153-L155]: delegate with the SKU's product.
    if (isNullish(returnRate)) {
      returnRate = this.getRateForProductBasedOnPriceGroup(
        requireCascadeAssociation(
          sku.getProduct(),
          `Sku "${sku.getSkuID()}" has no product, so the price-group cascade cannot resolve a rate ` +
            'for it. CFML parity [model/service/PriceGroupService.cfc:L154]: the legacy statement ' +
            'passes the null product into getRateForProductBasedOnPriceGroup, whose product ' +
            'parameter is declared required at [L102], and CFML raises there.',
        ),
        priceGroup,
      );
    }

    // Levels 3, 4 and 5 - [model/service/PriceGroupService.cfc:L158-L175].
    //
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L157-L175]: levels 3, 4 and 5 cannot change
    // the result.

    // Level 3 - [model/service/PriceGroupService.cfc:L158-L160].
    if (isNullish(returnRate)) {
      // CFML parity [model/service/PriceGroupService.cfc:L159]: legacy chains
      // `arguments.sku.getProduct().getProductType()` with no null test at either step, and the
      // two steps fail DIFFERENTLY.
      const productOfSku = requireCascadeAssociation(
        sku.getProduct(),
        `Sku "${sku.getSkuID()}" has no product, so getProductType() cannot be called on it. CFML ` +
          'parity [model/service/PriceGroupService.cfc:L159]: the legacy statement chains ' +
          'sku.getProduct().getProductType() with no null test and raises at the dereference.',
      );

      returnRate = this.getRateForProductTypeBasedOnPriceGroup(
        requireCascadeAssociation(
          productOfSku.getProductType(),
          `Product "${productOfSku.getProductID()}" has no product type, so the price-group cascade ` +
            'cannot resolve a rate for the SKU. CFML parity ' +
            '[model/service/PriceGroupService.cfc:L159]: the legacy statement passes the null ' +
            'product type into getRateForProductTypeBasedOnPriceGroup, whose productType parameter ' +
            'is declared required at [L57], and CFML raises there.',
        ),
        priceGroup,
      );
    }

    // Level 4 - [model/service/PriceGroupService.cfc:L163-L170].
    if (isNullish(returnRate)) {
      for (let i = 0; i < rates.length; i += 1) {
        const rate = rates[i];

        if (rate === undefined) {
          continue;
        }

        if (rate.getGlobalFlag()) {
          returnRate = rate;
        }
      }
    }

    // Level 5 - [model/service/PriceGroupService.cfc:L173-L175] - defect.
    //
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L173-L175]: the parent-price-group
    // recursion calls `getRateForProductBasedOnPriceGroup` - the product variant, not the sku
    // variant.
    // Preserved deliberately; do not fix without a product decision.
    if (isNullish(returnRate)) {
      const parentPriceGroup = priceGroup.getParentPriceGroup();

      if (parentPriceGroup !== undefined) {
        // CFML parity [model/service/PriceGroupService.cfc:L174]: the same unguarded
        // `arguments.sku.getProduct()` as [model/service/PriceGroupService.cfc:L154], into the
        // same `required any product` parameter.
        returnRate = this.getRateForProductBasedOnPriceGroup(
          requireCascadeAssociation(
            sku.getProduct(),
            `Sku "${sku.getSkuID()}" has no product, so the parent price group cannot be searched ` +
              'for a rate. CFML parity [model/service/PriceGroupService.cfc:L174]: the legacy ' +
              'statement passes the null product into getRateForProductBasedOnPriceGroup, whose ' +
              'product parameter is declared required at [L102], and CFML raises there.',
          ),
          parentPriceGroup,
        );
      }
    }

    // Level 6 - [model/service/PriceGroupService.cfc:L178-L180].
    if (!isNullish(returnRate)) {
      return returnRate;
    }

    return undefined;
  }

  /**
   * Applies a price-group rate to a SKU's price.
   *
   * The `amount` case uses no precision arithmetic because it performs none - it is a direct
   * assignment.
   *
   * @returns the resulting price, quantized to two decimals.
   */
  calculateSkuPriceBasedOnPriceGroupRate(sku: Sku, priceGroupRate: PriceGroupRate): Money {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L321-L336]: only the `percentageOff` branch
    // applies the rate's rounding rule, at L326-L328; `amountOff` at L331 and `amount` at L334 skip
    // it, so one rounding rule attached to two rates changes the price for one amount type and
    // leaves it untouched for the others.
    // Preserved deliberately; do not fix without a product decision.
    // JUDGMENT CALL: how the two `precisionEvaluate` sites are translated. Legacy
    // [model/service/PriceGroupService.cfc:L323] and [model/service/PriceGroupService.cfc:L331]
    // pass a CFML source-code string to `precisionEvaluate(...)`.
    let newPrice: Money = sku.getPrice();

    // Legacy [model/service/PriceGroupService.cfc:L321]:
    // switch(arguments.priceGroupRate.getAmountType())
    //
    // Read once into a local, so three tests that are meant to be mutually exclusive cannot
    // disagree about their subject.
    const rateAmountType: PriceGroupRateAmountType | undefined = priceGroupRate.getAmountType();
    if (matchesAmountType(rateAmountType, 'percentageOff')) {
      const skuPrice = sku.getPrice();
      const rateAmount = requireRateAmount(priceGroupRate, 'percentageOff');

      // Legacy [model/service/PriceGroupService.cfc:L323]: price - (price * (amount / 100)).
      newPrice = skuPrice.minus(skuPrice.times(rateAmount.dividedBy(100)));

      // JUDGMENT CALL: the ENTITY METHOD is used, because `src/domain/entities/roundingRule.ts`
      // publishes `roundValue(value: Money): Money` - synchronous - and routing through it
      // reproduces the legacy call chain exactly.
      //
      // One word of the original note is revised, and nothing else.
      const roundingRule = priceGroupRate.getRoundingRule();

      if (roundingRule !== undefined) {
        newPrice = roundingRule.roundValue(newPrice);
      }

      // Legacy [model/service/PriceGroupService.cfc:L330-L332]. No rounding rule is applied -
      // DEFECT.
    } else if (matchesAmountType(rateAmountType, 'amountOff')) {
      const rateAmount = requireRateAmount(priceGroupRate, 'amountOff');

      // Legacy [model/service/PriceGroupService.cfc:L331]: price - amount.
      newPrice = sku.getPrice().minus(rateAmount);

      // Legacy [model/service/PriceGroupService.cfc:L333-L335]. A direct assignment: no
      // arithmetic, therefore no precision call, and no rounding rule - DEFECT.
    } else if (matchesAmountType(rateAmountType, 'amount')) {
      newPrice = requireRateAmount(priceGroupRate, 'amount');
    }
    // No FINAL `else`, reproducing the absent `default` at
    // [model/service/PriceGroupService.cfc:L321-L336]: an `amountType` outside the three published
    // values - including an absent one - leaves `newPrice` at the
    // [model/service/PriceGroupService.cfc:L319] passthrough seed. See the LEGACY-NOTE above the
    // chain.

    // CFML parity [model/service/PriceGroupService.cfc:L339]: the two-decimal quantization is
    // load-bearing arithmetic, not presentation.
    return Money.fromDecimalString(numberFormat(newPrice.toDecimalString()));
  }

  /**
   * Resolves and applies the price-group rate for a SKU within one price group.
   *
   * [model/service/PriceGroupService.cfc:L304] resolves the rate;
   * [model/service/PriceGroupService.cfc:L307-L309] applies it when one was found;
   * [model/service/PriceGroupService.cfc:L312] otherwise returns `sku.getPrice()` UNCHANGED - the
   * legacy comment at [model/service/PriceGroupService.cfc:L300] calls it "just a passthough of
   * sku.getPrice()".
   */
  calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
    const priceGroupRate = this.getRateForSkuBasedOnPriceGroup(sku, priceGroup);

    // Legacy [model/service/PriceGroupService.cfc:L307-L309]: if(!isNull(priceGroupRate)) {... }.
    if (priceGroupRate !== undefined) {
      return this.calculateSkuPriceBasedOnPriceGroupRate(sku, priceGroupRate);
    }

    // Legacy [model/service/PriceGroupService.cfc:L312]: the passthrough.
    return sku.getPrice();
  }

  /**
   * Resolves the lowest price available to an account across all of its price groups, including
   * the ones it holds through subscription usage benefits.
   *
   * @returns the lowest price found, never lower-bounded by zero.
   */
  async calculateSkuPriceBasedOnAccount(sku: Sku, accountID: string): Promise<Money> {
    // Seeded with the sku's own price, never `Money.zero` - a zero seed would win the
    // [model/service/PriceGroupService.cfc:L294] ascending sort every time and give the sku away.
    const prices: Money[] = [sku.getPrice()];

    // LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L52]: `getAccountSubscriptionPriceGroups` is the
    // only function `PriceGroupDAO` declares, and it reads subscription-owned tables -
    // `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`, `SwSubsUsageBenefitPriceGroup`,
    // `SwSubsUsage`.
    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    const accountSubscriptionPriceGroups =
      await this.priceGroupRepository.getAccountSubscriptionPriceGroups(accountID);

    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L276, L282]: the account's live
    // `priceGroups` association array is captured at [model/service/PriceGroupService.cfc:L276]
    // with no defensive copy, and [model/service/PriceGroupService.cfc:L282] `arrayAppend`s into
    // it.
    // Preserved deliberately; do not fix without a product decision.
    const priceGroups: PriceGroup[] = accountPriceGroups;

    // CFML parity [model/service/PriceGroupService.cfc:L281]: the fifth instance of the
    // find-result-truthiness anti-pattern in this slice.
    //
    // JUDGMENT CALL: CFML's `arrayFind` over an array of entity objects performs an object
    // comparison, not a key comparison.
    for (let i = 0; i < accountSubscriptionPriceGroups.length; i += 1) {
      const subscriptionPriceGroup = accountSubscriptionPriceGroups[i];

      if (subscriptionPriceGroup === undefined) {
        continue;
      }

      const foundIndex = priceGroups.findIndex((held) =>
        isSamePriceGroupRow(held, subscriptionPriceGroup),
      );

      if (foundIndex === -1) {
        priceGroups.push(subscriptionPriceGroup);
      }
    }

    // Legacy [model/service/PriceGroupService.cfc:L287-L291]: one candidate price per price group.
    for (let i = 0; i < priceGroups.length; i += 1) {
      const priceGroup = priceGroups[i];

      if (priceGroup === undefined) {
        continue;
      }

      prices.push(this.calculateSkuPriceBasedOnPriceGroup(sku, priceGroup));
    }

    // CFML parity: CFML arrays are 1-BASED, so `prices[1]` after an ascending sort is the minimum,
    // and index `0` is the translation.
    const sortedPrices = [...prices].sort((left, right) => left.compare(right));

    const lowestPrice = sortedPrices[0];

    if (lowestPrice === undefined) {
      // Unreachable: `prices` was seeded with exactly one element at
      // [model/service/PriceGroupService.cfc:L274] and is only ever appended to, so index 0 always
      // exists.
      throw new Error(
        'calculateSkuPriceBasedOnAccount produced no candidate price. ' +
          'This is unreachable: the candidate list is seeded with the SKU price at ' +
          '[model/service/PriceGroupService.cfc:L274] and is never emptied.',
      );
    }

    return lowestPrice;
  }

  /**
   * Resolves the lowest price available to the CURRENT account, or the SKU's own price when no
   * account is signed in.
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L263-L264]: legacy reaches the ambient
   * request scope through `getSlatwallScope().getLoggedInFlag()` on one line and
   * `getHibachiScope().getAccount()` on the very next line.
   */
  async calculateSkuPriceBasedOnCurrentAccount(
    sku: Sku,
    context: CurrentAccountContext,
  ): Promise<Money> {
    // Legacy [model/service/PriceGroupService.cfc:L263]: if(getSlatwallScope().getLoggedInFlag())
    // {... }.
    //
    // CFML parity: "signed in" becomes "the context carries an account identifier".
    const accountID = context.accountID;

    if (accountID !== undefined) {
      return await this.calculateSkuPriceBasedOnAccount(sku, accountID);
    }

    // The not-signed-in branch returns the SKU's own price - no rate lookup, no zero.
    return sku.getPrice();
  }

  /**
   * Finds the best price group for a SKU and account, together with the price it produces. Ported
   * from [model/service/PriceGroupService.cfc:L343-L362].
   *
   * @returns the best price and the price group that produced it, `priceGroup` left `undefined`
   * when nothing beat the SKU's own price.
   */
  async getBestPriceGroupDetailsBasedOnSkuAndAccount(
    sku: Sku,
    accountID: string,
  ): Promise<BestPriceGroupDetails> {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]: this method reads
    // only `account.getPriceGroups()` at L351, while `calculateSkuPriceBasedOnAccount` also folds in
    // the account's subscription price groups at L277-L284 - and because L282 mutates the account's
    // live association array, whether the order pass at L364 sees them depends on whether that
    // other method already ran in the same request. The two paths are not harmonised here.
    // Preserved deliberately; do not fix without a product decision.
    return this.resolveBestPriceGroupDetails(
      sku,
      await this.frameworkReads.getAccountPriceGroups(accountID),
    );
  }

  /**
   * The price-group selection itself, over a price-group collection the caller has already
   * resolved.
   *
   * @param sku the SKU to price.
   * @param accountPriceGroups the account's price groups, resolved ONCE by the caller.
   * @returns the best price and the price group that produced it, with `priceGroup` left
   * `undefined` when nothing beat the SKU's own price.
   */
  private resolveBestPriceGroupDetails(
    sku: Sku,
    accountPriceGroups: readonly PriceGroup[],
  ): BestPriceGroupDetails {
    // CFML parity [model/service/PriceGroupService.cfc:L348, L369]: the legacy struct uses an
    // EMPTY-STRING SENTINEL for "no price group" and tests it with `isObject(...)` at
    // [model/service/PriceGroupService.cfc:L369]. The target models the field as
    // `PriceGroup | undefined`.
    let bestPrice: BestPriceGroupDetails = {
      price: sku.getPrice(),
      priceGroup: undefined,
    };

    // Legacy [model/service/PriceGroupService.cfc:L351]: the loop bound. The collection arrives as
    // a parameter, so the three re-invocations the note above records collapse to zero further
    // reads.
    for (let i = 0; i < accountPriceGroups.length; i += 1) {
      const priceGroup = accountPriceGroups[i];

      if (priceGroup === undefined) {
        continue;
      }
      const thisPrice = this.calculateSkuPriceBasedOnPriceGroup(sku, priceGroup);

      // Legacy [model/service/PriceGroupService.cfc:L355]: if(thisPrice < bestPrice.price) {... }.
      //
      // CFML parity [model/service/PriceGroupService.cfc:L355]: strictly less-than.
      if (thisPrice.isLessThan(bestPrice.price)) {
        // The ported interface is `readonly`, so [model/service/PriceGroupService.cfc:L356-L358]'s
        // in-place struct assignment becomes a replacement; the observable result is identical.
        bestPrice = { price: thisPrice, priceGroup };
      }
    }
    return bestPrice;
  }

  /**
   * The price-group order pass: selects the best price group for every order item and reports the
   * price changes to apply.
   *
   * This pass must be executed before `PromotionService.updateOrderAmountsWithPromotions()`,
   * explicitly and non-optionally.
   *
   * @param order a read-only view carrying an opaque `accountID` and no `Account`.
   * @returns one intent per order item whose price a price group improves; items that fail the
   * gate produce NO intent.
   */
  async updateOrderAmountsWithPriceGroups(order: OrderView): Promise<PriceGroupAppliedIntent[]> {
    // CFML parity [model/service/PromotionService.cfc:L241-L254]: the promotion pass reads the
    // price and appliedPriceGroup this pass writes. Do not reorder.
    const intents: PriceGroupAppliedIntent[] = [];

    // Legacy [model/service/PriceGroupService.cfc:L365]: if(!isNull(arguments.order.getAccount())
    // && arrayLen(arguments.order.getAccount().getPriceGroups())) {... }.
    const accountID = order.accountID;

    if (accountID === undefined) {
      return intents;
    }

    const accountPriceGroups = await this.frameworkReads.getAccountPriceGroups(accountID);

    if (!(cfLen(accountPriceGroups) > 0)) {
      return intents;
    }

    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L366, L369, L370, L371]: the legacy loop
    // re-invokes `arguments.order.getOrderItems()` in its bound and re-indexes it three further
    // times inside the body.
    const orderItems = order.orderItems;

    for (let i = 0; i < orderItems.length; i += 1) {
      const orderItem: OrderItemView | undefined = orderItems[i];

      if (orderItem === undefined) {
        continue;
      }

      // LEGACY-NOTE [model/service/PriceGroupService.cfc:L367]: this is the only POSITIONAL
      // internal call in the component - every other self-call in all 475 lines uses keyword
      // arguments.
      const priceGroupDetails = this.resolveBestPriceGroupDetails(
        orderItem.sku,
        accountPriceGroups,
      );

      const winningPriceGroup = priceGroupDetails.priceGroup;

      // Legacy [model/service/PriceGroupService.cfc:L369]: if(priceGroupDetails.price <
      // arguments.order.getOrderItems()[i].getPrice() && isObject(priceGroupDetails.priceGroup))
      // {... }.
      if (priceGroupDetails.price.isLessThan(orderItem.price) && winningPriceGroup !== undefined) {
        // Legacy [model/service/PriceGroupService.cfc:L370]: setPrice(priceGroupDetails.price)
        // Legacy [model/service/PriceGroupService.cfc:L371]:
        // setAppliedPriceGroup(priceGroupDetails.priceGroup)
        //
        // What legacy assigns into the aggregate, the target reports as an intent.
        intents.push({
          orderItemID: orderItem.orderItemID,
          price: priceGroupDetails.price,
          priceGroupID: winningPriceGroup.getPriceGroupID(),
        });
      }

      // Items that fail the gate produce no intent. Legacy leaves them entirely untouched - it
      // does not re-assign an unchanged price - so emitting an "unchanged" intent would invent a
      // write the source never performs.
    }

    return intents;
  }

  /**
   * Serialises the current page of price groups and their rates to JSON, for the admin price-group
   * editor.
   *
   * JUDGMENT CALL: the listing resolves through the `getPriceGroupPageRecords()` member of the
   * module-local {@link PriceGroupFrameworkReads} collaborator, because the price-group port
   * publishes six members and none is a listing.
   *
   * @throws whenever any price group on the page has at least one rate - DEFECT 29.
   */
  async getPriceGroupDataJSON(): Promise<string> {
    // Legacy [model/service/PriceGroupService.cfc:L232]: var priceGroupData = {};
    // ([model/service/PriceGroupService.cfc:L231]'s `var local = {};` sits immediately above it,
    // is never read, and is deleted per the module header note.)
    const priceGroupData: Record<string, PriceGroupDataEntry> = {};

    // Legacy [model/service/PriceGroupService.cfc:L233]: var priceGroupSmartList =
    // this.getPriceGroupSmartList(); Legacy [model/service/PriceGroupService.cfc:L235]: for(var
    // i=1; i LTE arrayLen(priceGroupSmartList.getPageRecords()); i++)
    const pageRecords = await this.frameworkReads.getPriceGroupPageRecords();

    for (let i = 0; i < pageRecords.length; i += 1) {
      // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236] (register DEFECT 5): indexes
      // `getPageRecords()` by `local.i` while the loop counter declared at
      // [model/service/PriceGroupService.cfc:L235] is `i`.
      // Preserved deliberately; do not fix without a product decision.
      const thisPriceGroup = pageRecords[i];

      if (thisPriceGroup === undefined) {
        continue;
      }
      const priceGroupRates: PriceGroupRateDataEntry[] = [];

      // Legacy [model/service/PriceGroupService.cfc:L239]: for(var j=1; j LTE
      // arrayLen(thisPriceGroup.getPriceGroupRates()); j++)
      const rates = thisPriceGroup.getPriceGroupRates();

      for (let r = 0; r < rates.length; r += 1) {
        const thisRate = rates[r];

        if (thisRate === undefined) {
          continue;
        }

        // CFML parity [model/service/PriceGroupService.cfc:L242 vs L414]: the source spells the
        // accessor `getPriceGroupRateId()` at [model/service/PriceGroupService.cfc:L242] with a
        // lowercase `d` and `getPriceGroupRateID()` at [model/service/PriceGroupService.cfc:L414]
        // with an uppercase `D`.
        priceGroupRates.push({
          id: thisRate.getPriceGroupRateID(),
          name: getAmountRepresentation(thisRate),
        });
      }

      // CFML parity [model/service/PriceGroupService.cfc:L249]: `priceGroupName` is nullable on
      // the entity, and a CFML struct assignment of a null value leaves the key unset.
      putOwnStructKey(priceGroupData, thisPriceGroup.getPriceGroupID(), {
        priceGroupName: thisPriceGroup.getPriceGroupName(),
        priceGroupRates,
      });
    }
    return JSON.stringify(priceGroupData);
  }

  /**
   * Applies the admin price-group SKU settings form: attaches a rate to either a whole product or
   * one specific SKU, and saves it.
   */
  async updatePriceGroupSKUSettings(data: PriceGroupSkuSettingsInput): Promise<void> {
    // Legacy [model/service/PriceGroupService.cfc:L185] declares `var local = {};` and never reads
    // it. Deleted, per the module header note; this is the first of the file's two dead `local`
    // structs.
    const ratePayload = buildRateSavePayload(data);

    // CFML parity [model/service/PriceGroupService.cfc:L189, L194, L197, L199, L399]: CFML's `!=`,
    // `NEQ`, `EQ` and `==` are CASE-INSENSITIVE for strings, so all five sentinel comparisons in
    // this component are case-insensitive in the target too - `"NEW AMOUNT"`, `"New Amount"`.

    // Legacy [model/service/PriceGroupService.cfc:L193], verbatim: "If the user has selected the
    // 'Select a Rate' rate, ignore all of this logic.
    if (cfEquals(data.priceGroupRateId, '')) {
      return;
    }

    // Legacy [model/service/PriceGroupService.cfc:L197]: if(arguments.data.skuId EQ "") - the
    // whole-product branch.
    if (cfEquals(data.skuId, '')) {
      // Legacy [model/service/PriceGroupService.cfc:L199]: if(arguments.data.priceGroupRateId NEQ
      // "inherit")
      if (!cfEquals(data.priceGroupRateId, 'inherit')) {
        const priceGroupRate = await this.getOrCreatePriceGroupRate(data.priceGroupRateId);
        const product: Product | undefined = await this.productRepository.getProductByProductID(
          data.productId,
        );

        if (product === undefined) {
          // CFML parity [model/service/PriceGroupService.cfc:L206]: the framework accessor returns
          // null on a miss and `addProduct(null)` then raises. The target throws at the same point
          // rather than passing an absent product on.
          throw new Error(
            `No product was found for productId "${data.productId}". ` +
              'CFML parity [model/service/PriceGroupService.cfc:L206]: the framework accessor ' +
              'returns null on a miss and addProduct(null) raises.',
          );
        }

        priceGroupRate.addProduct(product);
        await this.savePriceGroupRate(priceGroupRate, ratePayload);
      }

      return;
    }

    // Legacy [model/service/PriceGroupService.cfc:L212-L225]: the specific-SKU branch. No
    // `"inherit"` guard here.
    const sku = requireResolvedSku(data);
    const priceGroupRate = await this.getOrCreatePriceGroupRate(data.priceGroupRateId);
    priceGroupRate.addSku(sku);
    await this.savePriceGroupRate(priceGroupRate, ratePayload);
  }

  /**
   * Loads a price-group rate by identifier, or constructs an unsaved one when no such rate exists.
   *
   * LEGACY-NOTE [model/service/PriceGroupService.cfc:L218]: that comment misspells
   * `priceGrouRate`, dropping the `p`. Recorded because it is quoted verbatim above.
   */
  private async getOrCreatePriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate> {
    const existingRate = await this.priceGroupRepository.getPriceGroupRate(priceGroupRateID);

    if (existingRate !== undefined) {
      return existingRate;
    }

    return new PriceGroupRate({ priceGroupRateID: '' });
  }

  /**
   * CFML parity [model/service/PriceGroupService.cfc:L397, L399]: `data` is optional and is
   * dereferenced unconditionally.
   *
   * @param priceGroupRate the rate to save.
   * @param data the payload; optional in the signature, required in practice.
   * @returns the saved rate when validation passed, or the unpersisted rate when it did not - and
   * possibly with its own collections cleared.
   * @throws when `data` is absent, and always on the `"new amount"` path - DEFECT 30.
   */
  async savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    data?: PriceGroupRateSaveInput,
  ): Promise<PriceGroupRate> {
    // Legacy [model/service/PriceGroupService.cfc:L399]: if(arguments.data.priceGroupRateId ==
    // "new amount")
    //
    // `cfEquals` THROWS `CfmlComparisonError` on a nullish operand, which is exactly the
    // reproduction wanted here: an absent payload makes `data?.priceGroupRateId` `undefined` and
    // the comparison raises.
    if (cfEquals(data?.priceGroupRateId, 'new amount')) {
      clearAmounts(priceGroupRate);
    }

    // [org/Hibachi/HibachiService.cfc:L133-L169] is the whole of `save`: it populates the entity
    // from `data` at [model/service/PriceGroupService.cfc:L146], validates it at
    // [model/service/PriceGroupService.cfc:L151].
    //
    // And not populate-persist-reconcile, even though the source reads that way.

    // Legacy [org/Hibachi/HibachiService.cfc:L143-L148]: the population step, and it is
    // conditional on a payload being passed - the framework wraps only this call in
    // `if(structKeyExists(arguments,"data"))`.
    const population =
      data === undefined ? undefined : populatePriceGroupRateFromPayload(priceGroupRate, data);

    // Step 1 - populate, only when a payload was passed
    // [org/Hibachi/HibachiService.cfc:L143-L148].
    const errors = collectPriceGroupRateSaveContextErrors(priceGroupRate, population);

    if (errors.length > 0) {
      // Legacy [org/Hibachi/HibachiService.cfc:L153-L155] and
      // [model/service/PriceGroupService.cfc:L167]: the DAO call is SKIPPED when the entity has
      // errors and the framework returns the entity anyway.
      //
      // And the rules are recorded on the entity on the way out, which is the half that was
      // missing.
      for (const error of errors) {
        priceGroupRate.addError(error.propertyIdentifier, error.errorMessage);
      }

      return priceGroupRate;
    }
    const priceGroup = priceGroupRate.getPriceGroup();

    if (priceGroup === undefined) {
      // Provably unreachable, and narrowed rather than asserted.
      throw new Error(
        `PriceGroupRate "${priceGroupRate.getPriceGroupRateID()}" passed save-context validation yet ` +
          'reports no price group. The priceGroup rule in model/validation/PriceGroupRate.json ' +
          'makes that combination impossible, so this indicates the validation step and the ' +
          'entity accessor have gone out of step.',
      );
    }

    // Legacy [model/service/PriceGroupService.cfc:L409-L433]: the exclusivity-enforcement loop.
    // For every other rate in the price group, strip from it everything the saved rate now covers,
    // and clear its global flag when the saved rate is global.
    const rates = priceGroup.getPriceGroupRates();

    // Every sibling this loop changes must be persisted, and only those.
    /**
     * Siblings the exclusivity rule mutated, persisted with the saved rate in one unit of work.
     */
    const reconciledSiblings: PriceGroupRate[] = [];

    for (let i = 0; i < rates.length; i += 1) {
      const thisRate = rates[i];

      if (thisRate === undefined) {
        continue;
      }

      // Legacy [model/service/PriceGroupService.cfc:L414]: if(rates[i].getPriceGroupRateID() !=
      // priceGroupRate.getPriceGroupRateID())
      //
      // CFML parity: `!=` on strings is case-insensitive, so `cfEquals` is used here too rather
      // than a bare `!==`.
      if (cfEquals(thisRate.getPriceGroupRateID(), priceGroupRate.getPriceGroupRateID())) {
        continue;
      }

      // Membership size before the three removal loops, so the dirty check below is exact.
      const membershipSizeBefore =
        thisRate.getProductTypes().length +
        thisRate.getProducts().length +
        thisRate.getSkus().length;

      // The second witness: set by each removal loop below when it actually took a member out, and
      // by the demote arm when it clears a global flag.
      let siblingChanged = false;

      // Legacy [model/service/PriceGroupService.cfc:L416-L418]: remove every productType the saved
      // rate covers.
      const savedProductTypes = priceGroupRate.getProductTypes();

      for (let pt = 0; pt < savedProductTypes.length; pt += 1) {
        const productType = savedProductTypes[pt];

        if (productType !== undefined && thisRate.hasProductType(productType)) {
          thisRate.removeProductType(productType);
          siblingChanged = true;
        }
      }

      // Legacy [model/service/PriceGroupService.cfc:L420-L422]: remove every product the saved
      // rate covers.
      const savedProducts = priceGroupRate.getProducts();

      for (let p = 0; p < savedProducts.length; p += 1) {
        const product = savedProducts[p];

        if (product !== undefined && thisRate.hasProduct(product)) {
          thisRate.removeProduct(product);
          siblingChanged = true;
        }
      }

      // Legacy [model/service/PriceGroupService.cfc:L424-L426]: remove every SKU the saved rate
      // covers.
      const savedSkus = priceGroupRate.getSkus();

      for (let s = 0; s < savedSkus.length; s += 1) {
        const sku = savedSkus[s];

        if (sku !== undefined && thisRate.hasSku(sku)) {
          thisRate.removeSku(sku);
          siblingChanged = true;
        }
      }

      // The alternative that refusal chose was worse than editing an adjacent file: it left a
      // documented nondeterminism in the global fallback rate `getGlobalPriceGroupRate()`
      // [model/entity/PriceGroup.cfc:L83-L90] selects.
      if (priceGroupRate.getGlobalFlag() && thisRate.getGlobalFlag()) {
        thisRate.setGlobalFlag(false);

        siblingChanged = true;
      }

      // Enrolled once, on either witness.
      const membershipSizeAfter =
        thisRate.getProductTypes().length +
        thisRate.getProducts().length +
        thisRate.getSkus().length;

      if (siblingChanged || membershipSizeAfter !== membershipSizeBefore) {
        reconciledSiblings.push(thisRate);
      }
    }

    // Legacy [model/service/PriceGroupService.cfc:L436-L443]: the global-rate clear-out. A global
    // rate applies to everything, so its own inclusion and exclusion lists are emptied.
    //
    // Revision spliced the three LIVE include arrays and recorded
    // [model/service/PriceGroupService.cfc:L440-L442] as "not REPRODUCIBLE".
    if (priceGroupRate.getGlobalFlag()) {
      // Legacy [model/service/PriceGroupService.cfc:L437]: setProducts([]).
      priceGroupRate.setProducts([]);

      // Legacy [model/service/PriceGroupService.cfc:L438]: setProductTypes([]).
      priceGroupRate.setProductTypes([]);

      // Legacy [model/service/PriceGroupService.cfc:L439]: setSKUs([]).
      priceGroupRate.setSkus([]);

      // Legacy [model/service/PriceGroupService.cfc:L440]: setExcludedProducts([]).
      priceGroupRate.setExcludedProducts([]);

      // Legacy [model/service/PriceGroupService.cfc:L441]: setExcludedProductTypes([]).
      priceGroupRate.setExcludedProductTypes([]);

      // Legacy [model/service/PriceGroupService.cfc:L442]: setExcludedSKUs([]).
      priceGroupRate.setExcludedSkus([]);

      // No SEPARATE SAVE is ISSUED for this BLOCK, and none is needed: the single write at the
      // foot of this method carries the rate with its six collections already emptied.
    }

    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L440-L442 vs L70, L109, L147]: the
    // exclusion-list gap, and both sides of it live in this file.

    // The write, and why it is here rather than at [model/service/PriceGroupService.cfc:L404].
    //
    // Everything above mutated an object graph; this is the only line that persists any of it.
    const savedRate = await this.priceGroupRepository.savePriceGroupRate(
      priceGroupRate,
      reconciledSiblings,
    );

    // CFML returns the same reference it was handed, because Hibernate mutated the managed
    // instance in place.
    return savedRate;
  }

  /**
   * Deletes a price group, first detaching every price group that inherits from it.
   *
   * `removeAllManyToManyRelationships()` [org/Hibachi/HibachiEntity.cfc:L271-L284] is provably
   * vacuous for this entity, and that is a proof rather than an omission.
   *
   * @param priceGroup the price group to delete.
   * @returns whether the delete succeeded - `false` when the delete-context rules refuse it,
   * exactly as [org/Hibachi/HibachiService.cfc:L79] returns `false` without deleting.
   */
  async deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    const inheritingPriceGroups = priceGroup.getChildPriceGroups();

    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L465-L467] (register defect 6): the
    // `while` loop re-tests the length of a collection captured at
    // [model/service/PriceGroupService.cfc:L463] and always removes index 1, with no independent
    // termination condition.
    // Preserved deliberately; do not fix without a product decision.
    const iterationCeiling = inheritingPriceGroups.length;
    let iterations = 0;

    // CFML parity [model/service/PriceGroupService.cfc:L465]: `arrayLen(...) != 0` is already an
    // explicit comparison in the source and is carried over as one.
    while (inheritingPriceGroups.length !== 0) {
      iterations += 1;

      if (iterations > iterationCeiling) {
        throw new Error(
          `deletePriceGroup exceeded ${String(iterationCeiling)} detach iterations for price ` +
            `group "${priceGroup.getPriceGroupID()}" while its childPriceGroups collection was ` +
            'still non-empty. This breaks the termination invariant recorded at this method: ' +
            'PriceGroup.removeChildPriceGroup is no longer mutating the array returned by ' +
            'getChildPriceGroups(), which the legacy loop at ' +
            '[model/service/PriceGroupService.cfc:L465-L467] relies on for termination.',
        );
      }

      // CFML parity [model/service/PriceGroupService.cfc:L466]: CFML arrays are 1-BASED, so
      // `inheritingPriceGroups[1]` is index `0` here.
      const firstInheritingPriceGroup = inheritingPriceGroups[0];

      if (firstInheritingPriceGroup === undefined) {
        // Unreachable while the length is non-zero. `noUncheckedIndexedAccess` types the read as
        // `PriceGroup | undefined` and a non-null assertion is banned, so the narrowing is
        // required.
        break;
      }

      priceGroup.removeChildPriceGroup(firstInheritingPriceGroup);
    }

    // JUDGMENT CALL: `super.delete(...)` is a framework-accessor gap of the same kind as
    // `super.save` above, and it is called POSITIONALLY and with the bare unscoped `priceGroup` -
    // matching `ProductService.cfc:L326`.
    const deleteErrors = collectPriceGroupDeleteContextErrors(priceGroup);

    if (deleteErrors.length > 0) {
      // [org/Hibachi/HibachiService.cfc:L79]: `return false` - and no statement is issued.
      return false;
    }

    const deleted = await this.priceGroupRepository.deletePriceGroup(priceGroup);

    return deleted;
  }
}
