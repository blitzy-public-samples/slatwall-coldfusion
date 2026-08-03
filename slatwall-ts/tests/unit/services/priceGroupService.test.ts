// ---------------------------------------------------------------------------
// slatwall-ts - PriceGroupService: the two write overrides
//
// WHAT THIS PINS, AND WHAT IT DELIBERATELY DOES NOT
//   `src/services/priceGroupService.ts` ports thirteen public methods from
//   `model/service/PriceGroupService.cfc`. THIS SUITE COVERS TWO OF THEM: the
//   component's only Save Override, `savePriceGroupRate`
//   [model/service/PriceGroupService.cfc:L397-L446], and its only Delete Override,
//   `deletePriceGroup` [L461-L470].
//
//   The scope is stated up front because a reader is entitled to know that the
//   eleven read methods - the five-level cascade above all - are NOT covered here.
//   They are pure, synchronous, and unchanged by the work this suite accompanies;
//   folding them in would have meant a suite whose subject was "the service" rather
//   than "the two methods that write", and the two methods that write are where the
//   ORM's removal actually cost something.
//
// WHY THESE TWO NEEDED A SUITE AT ALL
//   Both methods surround `super.save()` / `super.delete()`, and both are the place
//   where the framework used to supply behaviour that has to be authored explicitly
//   now. `super.save()` at [L404] looks like a write and is not one:
//   [org/Hibachi/HibachiService.cfc:L133-L169] populates from the payload at [L146],
//   validates at [L151], and calls `getHibachiDAO().save(target=...)` at [L155] -
//   which makes the entity MANAGED. Hibernate wrote at request end, flushing every
//   dirty managed entity in ONE transaction, which is AFTER the reconciliation block
//   at [L407-L444] has run. So the order a reader sees in the source
//   (save, then reconcile) is not the order the database sees
//   (populate, reconcile, then persist everything together), and a port that follows
//   the source literally persists the state BEFORE the reconciliation and discards
//   the reconciliation itself.
//
//   Every ⭐⭐ case below exists because that distinction was got wrong once.
//
// NET-NEW COVERAGE (AAP 0.6.6). `meta/tests/` contains NO `PriceGroupServiceTest.cfc`
//   and no price-group test of any kind: `meta/tests/unit/service/` holds only
//   AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest,
//   none of them in scope. Nothing here traces to a legacy assertion, and nothing here
//   is presented as parity coverage.
//
// THE DOUBLES RECORD, THEY DO NOT SIMULATE
//   Each collaborator double captures what it was asked to do and answers from a
//   canned value. None of them is a database, none evaluates a predicate, and none
//   re-reads its own writes - so every expectation below is about what the service
//   ASKS FOR, which is exactly the surface the ORM's removal changed.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import { PriceGroup } from '../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../src/domain/entities/priceGroupRate.js';
import { Product } from '../../../src/domain/entities/product.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import { Sku } from '../../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
} from '../../../src/domain/ports/productRepository.js';
import type {
  CurrentAccountContext,
  PriceGroupRepository,
} from '../../../src/domain/ports/priceGroupRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { PriceGroupService } from '../../../src/services/priceGroupService.js';

/**
 * The service's one module-local collaborator contract, recovered from the constructor.
 *
 * JUDGMENT CALL: `PriceGroupFrameworkReads` is deliberately NOT exported - it is the
 * service's own contract for three framework affordances that none of the thirteen ports
 * carries, and exporting it to satisfy a test would widen a production surface for a test's
 * convenience. `ConstructorParameters` reads it off the shipped class instead, so the double
 * below becomes a compile error the day the contract changes. The same technique is already
 * used by `tests/unit/domain/entities/priceGroupRate.test.ts` for the entity's init shape.
 */
type PriceGroupFrameworkReads = ConstructorParameters<typeof PriceGroupService>[2];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The rate under save on every path below. */
const SAVED_RATE_ID = 'pgr-saved';

/** A sibling rate of the same price group. */
const SIBLING_RATE_ID = 'pgr-sibling';

/** A second sibling, for the ordering and selection cases. */
const OTHER_SIBLING_RATE_ID = 'pgr-sibling-2';

/** The price group both rates belong to. */
const PRICE_GROUP_ID = 'pg-1';

/** The identifier of the price group that inherits from `PRICE_GROUP_ID`. */
const CHILD_PRICE_GROUP_ID = 'pg-child';

/** The `unsavedvalue=""` key from [model/entity/PriceGroupRate.cfc:L52]. */
const UNSAVED_RATE_ID = '';

/**
 * The amount every fixture rate carries unless a case states otherwise.
 *
 * Present so the save-context `amount` rule passes; the VALUE is arbitrary and no case reads
 * it except the two that assert population, which supply their own.
 */
const FIXTURE_RATE_AMOUNT = '5.00';

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

/** One recorded `savePriceGroupRate` call, with the sibling set it carried. */
interface RecordedRateSave {
  readonly rate: PriceGroupRate;
  readonly reconciledSiblings: readonly PriceGroupRate[];
}

/**
 * A `PriceGroupRepository` that captures its write calls.
 *
 * `implements PriceGroupRepository` is what makes this double honest: the compiler
 * rejects it the moment the port gains, loses or reshapes a member, which no runtime
 * mock can do. The four members this suite never exercises reject rather than
 * resolving, so an unexpected call fails loudly instead of being absorbed.
 */
class RecordingPriceGroupRepository implements PriceGroupRepository {
  /** Every rate save, in call order. */
  readonly rateSaves: RecordedRateSave[] = [];

  /** Every price-group delete, in call order. */
  readonly deletes: PriceGroup[] = [];

  /**
   * How many children the entity still held AT EACH DELEGATION, in call order.
   *
   * Captured here rather than reconstructed afterwards, because the assertion that matters
   * is about the state at the MOMENT of the call: the collection is empty by then either
   * way, so reading it after the fact could not distinguish a loop that ran before the
   * delegation from one that ran after it. In legacy that ordering was load-bearing -
   * `validate(context="delete")` ran inside `super.delete()`
   * [org/Hibachi/HibachiService.cfc:L55] and `model/validation/PriceGroup.json` sets
   * `maxCollection: 0` on `childPriceGroups`, so a collection still populated at that
   * instant failed the gate.
   */
  readonly deleteChildCounts: number[] = [];

  /** What the next delete reports. */
  deleteResult = true;

  getAccountSubscriptionPriceGroups(): Promise<PriceGroup[]> {
    return Promise.reject(new Error('getAccountSubscriptionPriceGroups is not exercised here'));
  }

  getPriceGroup(): Promise<PriceGroup | undefined> {
    return Promise.reject(new Error('getPriceGroup is not exercised here'));
  }

  getPriceGroupRate(): Promise<PriceGroupRate | undefined> {
    return Promise.reject(new Error('getPriceGroupRate is not exercised here'));
  }

  savePriceGroup(): Promise<PriceGroup> {
    return Promise.reject(new Error('savePriceGroup is not exercised here'));
  }

  /**
   * Records the save and hands back the SAME instance.
   *
   * The real adapter returns a new instance on an insert, because the minted identifier
   * and the audit stamps are immutable on the ported entity. Returning the argument here
   * keeps the assertions about identity meaningful: a case that cares about the minted
   * key says so explicitly rather than relying on the double to mint one.
   */
  savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    reconciledSiblings?: readonly PriceGroupRate[],
  ): Promise<PriceGroupRate> {
    this.rateSaves.push({ rate: priceGroupRate, reconciledSiblings: reconciledSiblings ?? [] });

    return Promise.resolve(priceGroupRate);
  }

  deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    this.deletes.push(priceGroup);
    this.deleteChildCounts.push(priceGroup.getChildPriceGroups().length);

    return Promise.resolve(this.deleteResult);
  }
}

/**
 * A `ProductRepository` that rejects every call.
 *
 * Neither method under test touches it - `savePriceGroupRate` reads only its
 * argument's own graph, and `deletePriceGroup` reads only price groups - so the
 * double's whole job is to prove that by failing if either one reaches for it.
 */
class UnusedProductRepository implements ProductRepository {
  getAttributeSets(): Promise<AttributeSetSummary[]> {
    return Promise.reject(new Error('getAttributeSets is not exercised here'));
  }

  loadDataFromFile(): Promise<void> {
    return Promise.reject(new Error('loadDataFromFile is not exercised here'));
  }

  searchProductsByProductType(): Promise<Product[]> {
    return Promise.reject(new Error('searchProductsByProductType is not exercised here'));
  }

  getProductByProductID(): Promise<Product | undefined> {
    return Promise.reject(new Error('getProductByProductID is not exercised here'));
  }

  saveProduct(): Promise<Product> {
    return Promise.reject(new Error('saveProduct is not exercised here'));
  }

  deleteProduct(): Promise<boolean> {
    return Promise.reject(new Error('deleteProduct is not exercised here'));
  }
}

/** The two framework reads, neither of which either method under test performs. */
class UnusedFrameworkReads implements PriceGroupFrameworkReads {
  getAccountPriceGroups(): Promise<readonly PriceGroup[]> {
    return Promise.reject(new Error('getAccountPriceGroups is not exercised here'));
  }

  getPriceGroupPageRecords(): Promise<readonly PriceGroup[]> {
    return Promise.reject(new Error('getPriceGroupPageRecords is not exercised here'));
  }
}

/** The subject and the one collaborator whose calls are asserted on. */
interface Subject {
  readonly service: PriceGroupService;
  readonly repository: RecordingPriceGroupRepository;
}

/** A fresh subject, wired by hand - no container, no locator, no ambient scope. */
function makeSubject(): Subject {
  const repository = new RecordingPriceGroupRepository();

  return {
    repository,
    service: new PriceGroupService(
      repository,
      new UnusedProductRepository(),
      new UnusedFrameworkReads(),
    ),
  };
}

// ---------------------------------------------------------------------------
// Entity factories
// ---------------------------------------------------------------------------

/** A price group holding the supplied rates, with the far side of each rate wired. */
function aPriceGroupHolding(...rates: readonly PriceGroupRate[]): PriceGroup {
  const priceGroup = new PriceGroup({
    priceGroupID: PRICE_GROUP_ID,
    priceGroupIDPath: PRICE_GROUP_ID,
    activeFlag: true,
    priceGroupName: 'Trade',
    priceGroupCode: 'trade',
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates: [...rates],
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });

  for (const rate of rates) {
    rate.setPriceGroup(priceGroup);
  }

  return priceGroup;
}

/**
 * A persisted child of the supplied parent, wired through the bidirectional setter.
 *
 * `setParentPriceGroup` is used rather than seeding `childPriceGroups` in the constructor,
 * and that is deliberate: it is the accessor `addChildPriceGroup`
 * [model/entity/PriceGroup.cfc:L136-L138] delegates to, so the far side of the association
 * is established exactly as production code establishes it. Seeding both sides by hand
 * would let a fixture construct a graph the entity itself cannot produce, and the
 * detachment loop under test depends on the two sides being the same array.
 */
function aChildOf(parent: PriceGroup, childID = CHILD_PRICE_GROUP_ID): PriceGroup {
  const child = new PriceGroup({
    priceGroupID: childID,
    priceGroupIDPath: PRICE_GROUP_ID + ',' + childID,
    activeFlag: true,
    priceGroupName: 'Trade child',
    priceGroupCode: 'trade-child-' + childID,
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });

  child.setParentPriceGroup(parent);

  return child;
}

/**
 * A rate, defaulting to a persisted key, empty collections and a VALID SAVE-CONTEXT SHAPE.
 *
 * ★★ THE `amountType` AND `amount` DEFAULTS ARE NOT DECORATION - THEY ARE WHAT MAKES THE
 * WRITE REACHABLE. `model/validation/PriceGroupRate.json` declares three save-context rules,
 * and TWO of them are properties this factory owns:
 * `"amountType": [{"contexts":"save","required":true}]` and
 * `"amount": [{"contexts":"save","required":true,"dataType":"numeric"}]`. `super.save`
 * [model/service/PriceGroupService.cfc:L404] validates between populating and saving
 * [org/Hibachi/HibachiService.cfc:L146, L151, L155], and [L407] then gates the ENTIRE
 * reconciliation block on `!hasErrors()`. A rate missing either property is therefore
 * refused BEFORE the write and before the reconciliation, so a factory that left them unset
 * would make every case in this file assert against a refusal it never asked for.
 *
 * QUOTE-THEN-REVISE: this factory used to be described as "defaulting to a persisted key, NO
 * AMOUNT and empty collections". The third rule, `priceGroup`, is satisfied separately by
 * `aPriceGroupHolding`, which is why the cases that omit it exercise the refusal deliberately.
 *
 * Both defaults are overridable, and `'percentageOff'` is chosen for `amountType` because it
 * is the one arm of the strategy switch [model/service/PriceGroupService.cfc:L316-L340] that
 * applies the rounding rule - the arm a reader is most likely to be thinking about.
 */
function aRate(
  overrides: Partial<ConstructorParameters<typeof PriceGroupRate>[0]> = {},
): PriceGroupRate {
  return new PriceGroupRate({
    amountType: 'percentageOff',
    amount: Money.fromDecimalString(FIXTURE_RATE_AMOUNT),
    ...overrides,
    priceGroupRateID: overrides.priceGroupRateID ?? SAVED_RATE_ID,
  });
}

/** The payload shape the method reads, with the sentinel deliberately not matched. */
function aPayload(amount?: string): {
  readonly priceGroupRateId: string;
  readonly amount?: string;
} {
  return amount === undefined
    ? { priceGroupRateId: SAVED_RATE_ID }
    : { priceGroupRateId: SAVED_RATE_ID, amount };
}

// ---------------------------------------------------------------------------
// savePriceGroupRate - the ONE write, and what has to happen before it
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: the single write', () => {
  it('⭐⭐ writes exactly once, and AFTER the reconciliation rather than before it', async () => {
    // The whole shape of the method. `super.save()` at [L404] made the entity managed;
    // Hibernate wrote at request end, after [L407-L444]. Writing at [L404] instead
    // persists the pre-reconciliation state and throws the reconciliation away.
    const savedRate = aRate({ globalFlag: true, skus: [new Sku({ skuID: 'sku-1' })] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves).toHaveLength(1);
    // The global clear-out at [L437-L439] had already emptied the collection by the time
    // the write happened, which is only observable if the write came second.
    expect(repository.rateSaves[0]?.rate.getSkus()).toStrictEqual([]);
  });

  it('returns whatever the repository persisted, not the argument it was handed', async () => {
    // On an insert the adapter mints an identifier and audit stamps, both immutable on
    // the ported entity, so it returns a NEW instance. The service must hand that one
    // back or its caller never learns the key.
    const savedRate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    const returned = await service.savePriceGroupRate(savedRate, aPayload());

    expect(returned).toBe(repository.rateSaves[0]?.rate);
  });
});

// ---------------------------------------------------------------------------
// The population half of super.save()
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: population from the payload', () => {
  it('⭐⭐ writes a submitted amount onto the rate before persisting it', async () => {
    // [org/Hibachi/HibachiService.cfc:L146] populates from the payload before validating.
    // Skipping it means a submitted amount is silently dropped and the rate is saved with
    // whatever it already carried.
    const savedRate = aRate({ amount: Money.fromDecimalString('5.00') });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload('12.50'));

    expect(repository.rateSaves[0]?.rate.getAmount()?.toFixed2()).toBe('12.50');
  });

  it('leaves the persisted amount alone when the payload carries none', async () => {
    // [model/service/PriceGroupService.cfc:L189-L190] DELETES the key from the request
    // context on every path but `"new amount"`, precisely so a stale value cannot
    // overwrite the persisted rate. An absent key must therefore not clear the amount.
    const savedRate = aRate({ amount: Money.fromDecimalString('5.00') });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.rate.getAmount()?.toFixed2()).toBe('5.00');
  });

  it('⭐ refuses a non-numeric amount, and writes nothing at all', async () => {
    // `model/validation/PriceGroupRate.json` declares amount as
    // {"contexts":"save","required":true,"dataType":"numeric"}, so a non-numeric
    // submission fails validation at [org/Hibachi/HibachiService.cfc:L151] and the entity
    // never reaches the DAO at [L155]. What matters is that no write happens - coercing,
    // or defaulting to zero, would persist a value legacy rejected.
    const savedRate = aRate({ amount: Money.fromDecimalString('5.00') });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    // ★ QUOTE-THEN-REVISE ON HOW THE REFUSAL IS DELIVERED. This case used to assert
    // `rejects.toThrow(/plain decimal numeral/)`, on the reading that `Money` has no tolerant
    // parse so an unreadable amount propagates. `Money` still has none - and the failure is
    // caught at the POPULATE step and recorded as the `dataType: numeric` rule's verdict
    // instead, because that is what the legacy did: `super.save` populates [L146], VALIDATES
    // [L151], and skips the DAO when `hasErrors()` [L155], then RETURNS THE ENTITY EITHER WAY
    // [org/Hibachi/HibachiService.cfc:L167]. A refused save was never an exception to the
    // caller, so raising here would invent a failure mode the admin never saw.
    const returned = await service.savePriceGroupRate(savedRate, aPayload('not a number'));

    // What matters is unchanged and is asserted twice over: NO WRITE happened, and the
    // property was LEFT AS IT WAS rather than coerced or defaulted to zero - which is the
    // failure mode that sells product for nothing.
    expect(repository.rateSaves).toStrictEqual([]);
    expect(returned).toBe(savedRate);
    expect(returned.getAmount()?.toFixed2()).toBe('5.00');
  });

  it('never populates the primary key from the payload', async () => {
    // `priceGroupRateId` is the SELECTOR the caller used to reach this rate - [L399] reads
    // it to detect the sentinel. Populating a primary key from a request payload would let
    // a save reassign the row it writes.
    const savedRate = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, { priceGroupRateId: 'pgr-somewhere-else' });

    expect(repository.rateSaves[0]?.rate.getPriceGroupRateID()).toBe(SAVED_RATE_ID);
  });
});

// ---------------------------------------------------------------------------
// The exclusivity reconciliation, and the set it hands to the write
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: sibling exclusivity', () => {
  it('⭐⭐ strips the saved rate’s members from a sibling AND sends that sibling to be written', async () => {
    // [L416-L426]. Under the ORM the sibling was already managed, so mutating it was
    // enough; with the ORM gone a mutation nobody hands to the repository is a mutation
    // nobody writes.
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ skus: [contested] });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getSkus()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });

  it('strips product types and products as well as SKUs', async () => {
    // [L416-L418] and [L420-L422]. All three include collections, not just the one.
    const productType = new ProductType({ productTypeID: 'ptp-1' });
    const product = new Product({ productID: 'prd-1' });
    const savedRate = aRate({ productTypes: [productType], products: [product] });
    const sibling = aRate({
      priceGroupRateID: SIBLING_RATE_ID,
      productTypes: [productType],
      products: [product],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getProductTypes()).toStrictEqual([]);
    expect(sibling.getProducts()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });

  it('⭐⭐ demotes a rival global rate, so the global fallback stays deterministic', async () => {
    // [L429-L431]. `getGlobalPriceGroupRate()` [model/entity/PriceGroup.cfc:L83-L90] scans
    // for the rate whose flag is set; two set flags make the price it returns depend on
    // association order.
    const savedRate = aRate({ globalFlag: true });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, globalFlag: true });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getGlobalFlag()).toBe(false);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });

  it('leaves a rival global rate alone when the saved rate is not global', async () => {
    // [L429] uses `&&`, which short-circuits: a non-global saved rate never even reads the
    // sibling's flag.
    const savedRate = aRate({ globalFlag: false });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, globalFlag: true });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getGlobalFlag()).toBe(true);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([]);
  });

  it('never reconciles the saved rate against itself', async () => {
    // [L414] skips the rate whose key matches. Without the guard the saved rate would
    // strip its own membership and demote its own flag.
    const contested = new Sku({ skuID: 'sku-1' });
    const savedRate = aRate({ globalFlag: true, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([]);
  });

  it('⭐ sends NOTHING when no sibling actually changed', async () => {
    // Hibernate flushed the entities it had detected as DIRTY, so a sibling the `remove*`
    // calls did not actually alter was never written. Sending it anyway is observable:
    // each rate write rewrites all six of its link collections and bumps
    // `modifiedDateTime`.
    const savedRate = aRate({ skus: [new Sku({ skuID: 'sku-saved' })] });
    const sibling = aRate({
      priceGroupRateID: SIBLING_RATE_ID,
      skus: [new Sku({ skuID: 'sku-unrelated' })],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getSkus()).toHaveLength(1);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([]);
  });

  it('collects several siblings, in the order the association yields them', async () => {
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ skus: [contested] });
    const first = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const second = aRate({ priceGroupRateID: OTHER_SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, first, second);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([first, second]);
  });

  it('processes every sibling of an unsaved rate, whose key is the empty string', async () => {
    // Legacy compared against a uuid Hibernate had already assigned; the target compares
    // before the write, so a brand-new rate carries `unsavedvalue=""`. Neither value can
    // equal a persisted sibling's key, so the outcome is the same.
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ priceGroupRateID: UNSAVED_RATE_ID, skus: [contested] });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });
});

// ---------------------------------------------------------------------------
// The global-rate clear-out
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: the global clear-out', () => {
  it('⭐⭐ empties all SIX of the saved rate’s own collections', async () => {
    // [L437-L442]. A global rate applies to everything, so its own inclusion and
    // exclusion filters are meaningless - and three of these six were unreachable until
    // the entity declared their generated setters.
    const savedRate = aRate({
      globalFlag: true,
      productTypes: [new ProductType({ productTypeID: 'ptp-1' })],
      products: [new Product({ productID: 'prd-1' })],
      skus: [new Sku({ skuID: 'sku-1' })],
      excludedProductTypes: [new ProductType({ productTypeID: 'ptp-x' })],
      excludedProducts: [new Product({ productID: 'prd-x' })],
      excludedSkus: [new Sku({ skuID: 'sku-x' })],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    const written = repository.rateSaves[0]?.rate;

    expect(written?.getProductTypes()).toStrictEqual([]);
    expect(written?.getProducts()).toStrictEqual([]);
    expect(written?.getSkus()).toStrictEqual([]);
    expect(written?.getExcludedProductTypes()).toStrictEqual([]);
    expect(written?.getExcludedProducts()).toStrictEqual([]);
    expect(written?.getExcludedSkus()).toStrictEqual([]);
  });

  it('leaves a non-global rate’s collections exactly as they were', async () => {
    const savedRate = aRate({
      globalFlag: false,
      skus: [new Sku({ skuID: 'sku-1' })],
      excludedSkus: [new Sku({ skuID: 'sku-x' })],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.rate.getSkus()).toHaveLength(1);
    expect(repository.rateSaves[0]?.rate.getExcludedSkus()).toHaveLength(1);
  });

  it('⭐ strips the siblings BEFORE emptying its own collections, not after', async () => {
    // The ordering is load-bearing and easy to invert. [L416-L426] reads the saved rate's
    // membership to decide what to remove from each sibling; [L437-L439] then empties that
    // same membership. Clearing first would leave every sibling untouched, so a rate
    // promoted to global would silently stop taking its members off its rivals.
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ globalFlag: true, skus: [contested] });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getSkus()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.rate.getSkus()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });
});

// ---------------------------------------------------------------------------
// The two preserved legacy failures
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: preserved legacy failures', () => {
  it('throws on the "new amount" sentinel, because clearAmounts always did - DEFECT 30', async () => {
    // [L399-L400] guards `clearAmounts()` with the sentinel, and `clearAmounts` calls
    // `getAmountRepresentation()`, which [model/entity/PriceGroupRate.cfc] does not
    // declare. So the admin "create a new amount" workflow always failed and every other
    // rate save completed. Preserved deliberately; do not fix without a product decision.
    const { service, repository } = makeSubject();
    const savedRate = aRate();

    aPriceGroupHolding(savedRate);

    await expect(
      service.savePriceGroupRate(savedRate, { priceGroupRateId: 'new amount' }),
    ).rejects.toThrow();
    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('throws when the payload is absent, because [L399] dereferences it unguarded', async () => {
    // [L397] declares `struct data` WITHOUT `required`, yet [L399] reads
    // `arguments.data.priceGroupRateId` with no guard. Both facts are preserved: the
    // parameter stays optional, and the unconditional dereference raises.
    const { service, repository } = makeSubject();
    const savedRate = aRate();

    aPriceGroupHolding(savedRate);

    await expect(service.savePriceGroupRate(savedRate)).rejects.toThrow();
    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('REFUSES a rate with no price group before the unguarded dereference is ever reached', async () => {
    // ★★ QUOTE-THEN-REVISE, AND THE REVISION IS A STATEMENT ABOUT THE SOURCE RATHER THAN
    // ABOUT THIS PORT. This case used to assert `rejects.toThrow(/has no price group/)` on the
    // reading that "[L408-L409] dereferences `priceGroup.getPriceGroupRates()` with no null
    // test. The target raises at the same point rather than skipping the block, because
    // skipping it would silently omit the exclusivity enforcement."
    //
    // The dereference IS unguarded, and it is also UNREACHABLE in that state.
    // `model/validation/PriceGroupRate.json` declares
    // `"priceGroup": [{"contexts":"save","required":true}]`, `super.save` [L404] validates
    // before returning, and [L407] gates the whole block on `!hasErrors()` - so a rate with no
    // price group never gets as far as [L408]. The legacy answers the unpersisted entity
    // [org/Hibachi/HibachiService.cfc:L167] and this does the same.
    //
    // The exclusivity enforcement is NOT silently omitted, which was the real worry: it is
    // omitted exactly when the legacy omits it, for a rate the legacy refuses to save at all.
    // The service keeps a defensive raise for the impossible combination - validation passing
    // while the accessor answers nothing - so the two can never drift apart unnoticed.
    const { service, repository } = makeSubject();
    const orphanRate = aRate();

    const returned = await service.savePriceGroupRate(orphanRate, aPayload());

    expect(returned).toBe(orphanRate);
    expect(repository.rateSaves).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// deletePriceGroup - the detachment loop, and the ONE delegation
// ---------------------------------------------------------------------------

describe('deletePriceGroup: the child detachment loop', () => {
  // ★★ NET-NEW COVERAGE (AAP 0.6.6), like every case in this file. `meta/tests/` carries
  // no PriceGroupService test at all, so nothing here traces to a legacy antecedent.
  //
  // WHAT THIS GROUP OWNS AND WHAT IT DOES NOT. The loop
  // [model/service/PriceGroupService.cfc:L462-L467] decides WHICH children detach; the
  // repository PERSISTS that decision and enforces the five out-of-scope delete gates,
  // and those two behaviours are asserted in
  // `tests/integration/repositories/mysqlPriceGroupRepository.test.ts`. The split is the
  // point: under the ORM the loop mutated MANAGED entities and Hibernate flushed the
  // resulting UPDATEs, so "decide" and "write" were one act; separating them is what the
  // removal of the session forced, and each half is pinned where it lives.

  it('⭐⭐ empties the child collection before delegating, never after', async () => {
    // The ordering is the whole reason the loop is in this method rather than the adapter:
    // in legacy the collection had to be empty by the time `validate(context="delete")`
    // ran inside `super.delete()` [org/Hibachi/HibachiService.cfc:L55], because
    // `model/validation/PriceGroup.json` sets `maxCollection: 0` on `childPriceGroups`.
    // A loop that ran after the delegation would have failed that gate every time.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();
    const child = aChildOf(parent);

    expect(parent.getChildPriceGroups()).toStrictEqual([child]);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    // Observed AT the delegation, not after it - see `deleteChildCounts`.
    expect(repository.deleteChildCounts).toStrictEqual([0]);
    expect(parent.getChildPriceGroups()).toStrictEqual([]);
  });

  it('detaches every child, however many there are', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L465-L467]: `while(arrayLen(...)
    // != 0)` removing index 1 each pass. Three children take three passes, and the loop
    // terminates because `removeChildPriceGroup` splices the live array the accessor
    // handed out - which is the ONLY reason the legacy `while` ever ended, and is recorded
    // at the method as DEFECT 6.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();
    const children = [
      aChildOf(parent, 'pg-child-1'),
      aChildOf(parent, 'pg-child-2'),
      aChildOf(parent, 'pg-child-3'),
    ];

    expect(parent.getChildPriceGroups()).toHaveLength(children.length);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    expect(parent.getChildPriceGroups()).toStrictEqual([]);

    // All three were gone by the delegation, not merely by the end of the method.
    expect(repository.deleteChildCounts).toStrictEqual([0]);

    // Each child's own parent link is cleared too, because the remove helper is
    // bidirectional [model/entity/PriceGroup.cfc:L139 -> L116-L125].
    for (const child of children) {
      expect(child.getParentPriceGroup()).toBeUndefined();
    }
  });

  it('delegates exactly once, passing the entity itself and no cascade flag', async () => {
    // Legacy [L469]: `return super.delete(priceGroup);` - positional, bare, one argument.
    // The port declares one parameter and no options bag, so a force flag, a cascade
    // switch or a rate-delete companion could not be passed even by accident.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();

    await service.deletePriceGroup(parent);

    expect(repository.deletes).toStrictEqual([parent]);
    expect(repository.rateSaves).toHaveLength(0);
  });

  it('⭐⭐ returns the repository refusal verbatim, and issues no second call', async () => {
    // The five out-of-scope gates resolve `false` from the adapter, and this method must
    // pass that straight through: [org/Hibachi/HibachiService.cfc:L79] returned `false`
    // from `super.delete()` and [model/service/PriceGroupService.cfc:L469] returned it
    // unexamined. A service that retried, threw, or coerced the boolean would turn an
    // ordinary expected refusal into something the caller has to handle differently.
    const { service, repository } = makeSubject();

    repository.deleteResult = false;

    const parent = aPriceGroupHolding();
    const child = aChildOf(parent);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(false);
    expect(repository.deletes).toHaveLength(1);

    // ★★ THE IN-MEMORY DETACHMENT IS NOT REWOUND, AND THAT IS FAITHFUL RATHER THAN
    // OVERSIGHT. Legacy discarded the SESSION on a refusal, not the objects the request
    // still held: a failed delete context set the request-wide flag
    // [org/Hibachi/HibachiTransient.cfc:L455-L457] and `endHibachiLifecycle()` then
    // skipped the flush entirely [org/Hibachi/Hibachi.cfc:L455-L459], so no child UPDATE
    // reached the database while the detached objects stayed detached in memory for the
    // rest of the request. The adapter reproduces the database half by evaluating every
    // gate before its first mutation; this is the in-memory half.
    expect(parent.getChildPriceGroups()).toStrictEqual([]);
    expect(child.getParentPriceGroup()).toBeUndefined();
  });

  it('resolves a boolean, never a truthy entity or an undefined', async () => {
    // [model/service/PriceGroupService.cfc:L461] declares `public boolean function`, and
    // the delete gates make the `false` arm reachable in ordinary use rather than only on
    // a missing row - so a caller that branched on truthiness of something else would be
    // branching on the wrong thing.
    const { service, repository } = makeSubject();

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(true);

    repository.deleteResult = false;

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(false);
  });

  it('touches neither the product repository nor the framework reads', async () => {
    // Both doubles reject on every member. In particular NO count, probe or page read is
    // issued from here for the five out-of-scope gates: they are enforced by the adapter
    // against what is STORED, and this method learns their outcome only as the boolean.
    const { service } = makeSubject();

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(true);
  });

  it('leaves a childless price group untouched, emitting no loop iteration', async () => {
    // `while(arrayLen(...) != 0)` never enters when the collection is already empty, and
    // the bounded-iteration ceiling is derived from that same initial length - so a
    // childless group has a ceiling of zero and reaches the delegation without a pass.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();

    expect(parent.getChildPriceGroups()).toStrictEqual([]);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    expect(parent.getChildPriceGroups()).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([parent]);
  });
});

describe('the service takes three explicit collaborators and nothing ambient', () => {
  it('is wired by hand, with no container, locator or request scope', () => {
    // T1/T6. `getSlatwallScope()` [model/service/PriceGroupService.cfc:L262-L268] and the
    // DI/1 property scan are both gone; every collaborator is a constructor argument and
    // the account context is an explicit parameter where one is needed.
    expect(PriceGroupService.length).toBe(3);
  });

  it('touches neither the product repository nor the framework reads on a rate save', async () => {
    // Both doubles reject on every member, so reaching for either one fails this case
    // rather than passing silently.
    const savedRate = aRate();
    const { service } = makeSubject();

    aPriceGroupHolding(savedRate);

    await expect(service.savePriceGroupRate(savedRate, aPayload())).resolves.toBe(savedRate);
  });

  it('declares CurrentAccountContext as one optional opaque identifier', () => {
    // Compile-time only: the ambient scope's replacement carries an account identifier and
    // nothing else - no session, no locale, no logger.
    const empty: CurrentAccountContext = {};
    const populated: CurrentAccountContext = { accountID: 'acc-1' };

    expect(Object.keys(empty)).toStrictEqual([]);
    expect(Object.keys(populated)).toStrictEqual(['accountID']);
  });
});
