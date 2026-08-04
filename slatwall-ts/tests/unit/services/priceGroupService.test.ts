// ---------------------------------------------------------------------------
// slatwall-ts - PriceGroupService: the five-level cascade, the amount-type
// dispatch, and the two write overrides
//
// WHAT THIS SUITE PINS
//   `src/services/priceGroupService.ts` ports THIRTEEN public methods from
//   `model/service/PriceGroupService.cfc`, and this suite covers all thirteen.
//   It is the guard on MUST-PRESERVE AREA (ii) - the price-group resolution
//   cascade and the amount-type dispatch that turns a resolved rate into money
//   (AAP 0.8.1, 0.9.3).
//
//   QUOTE-THEN-REVISE ON ITS OWN SCOPE. An earlier revision of this file opened by
//   declaring that it "COVERS TWO OF THEM: the component's only Save Override,
//   `savePriceGroupRate` [model/service/PriceGroupService.cfc:L397-L446], and its only
//   Delete Override, `deletePriceGroup` [L461-L470]", and stated that "the eleven read
//   methods - the five-level cascade above all - are NOT covered here. They are pure,
//   synchronous, and unchanged by the work this suite accompanies". Both halves of that
//   are now superseded. Purity is exactly why the cascade is cheap to pin and exactly
//   why nothing else can pin it: the ONLY observable a pure resolver has is its return
//   value, so a suite that skips it leaves must-preserve area (ii) unguarded. Every
//   assertion the two-method revision made is carried forward here verbatim rather than
//   discarded, and eleven methods are added around them.
//
// SIX NUMBERED LEGACY DEFECTS ARE OWNED HERE, ALL PRESERVED RATHER THAN FIXED
//   DEFECT 5  [L236]      `local.i` in `getPriceGroupDataJSON`
//   DEFECT 6  [L461-L470] the never-re-read child snapshot in `deletePriceGroup`
//   DEFECT 7  [L173-L175] the SKU cascade's parent recursion asks the PRODUCT variant
//   DEFECT 8  [L316-L340] only `percentageOff` applies the rate's rounding rule
//   DEFECT 29 [L243]      `getAmountRepresentation()` exists nowhere
//   DEFECT 30 [L400]      `clearAmounts()` exists nowhere
//   Defects 29 and 30 are kept in SEPARATE cases with SEPARATE markers throughout: they
//   are two different absent methods reached from two different lines, and merging them
//   would hide the fact that one breaks a read and the other breaks a write.
//
// WHY THE WRITE OVERRIDES NEEDED A SUITE AT ALL
//   Both surround `super.save()` / `super.delete()`, and both are where the framework
//   used to supply behaviour that has to be authored explicitly now. `super.save()` at
//   [L404] looks like a write and is not one: [org/Hibachi/HibachiService.cfc:L133-L169]
//   populates from the payload at [L146], validates at [L151], and calls
//   `getHibachiDAO().save(target=...)` at [L155] - which makes the entity MANAGED.
//   Hibernate wrote at request end, flushing every dirty managed entity in ONE
//   transaction, which is AFTER the reconciliation block at [L407-L444] has run. So the
//   order a reader sees in the source (save, then reconcile) is not the order the
//   database sees (populate, reconcile, then persist everything together), and a port
//   that follows the source literally persists the state BEFORE the reconciliation and
//   discards the reconciliation itself. Every double-star case below exists because that
//   distinction was got wrong once.
//
// NET-NEW COVERAGE (AAP 0.6.6, constraint C8). `meta/tests/` contains NO
//   `PriceGroupServiceTest.cfc` and no price-group test of any kind:
//   `meta/tests/unit/service/` holds only AccountServiceTest, HibachiServiceTest,
//   PaymentServiceTest and UtilityRBServiceTest, and `meta/tests/unit/dao/` only
//   AccountDAOTest and PaymentDAOTest - none of them in scope. NOTHING here traces to a
//   legacy assertion and NOTHING here is presented as parity coverage.
//
// NO USER RULES EXIST (AAP 0.7). `review_rules` reports that none were provided, so no
//   rule is invented and none is cited. Enterprise-standard best practice applies in
//   their place (AAP 0.8.3), which is what the strictness, the port-typed doubles and
//   the decimal-only arithmetic below are.
//
// P5 - PARAMETERIZED SQL IS NOT APPLICABLE TO THIS FILE, AND THAT IS DELIBERATE.
//   The slice's one subscription-price-group statement - `PriceGroupDAO.cfc` declares
//   EXACTLY ONE function, `getAccountSubscriptionPriceGroups` at [L52] - is exercised
//   here only through an in-memory port double. SQL text, placeholder counts and
//   parameter binding belong exclusively to `tests/integration/repositories/`, which
//   owns them; asserting them from a unit suite would duplicate that ownership and
//   couple this file to a statement it does not shape.
//
// BUDGET LEDGERS (AAP 0.4.2, 0.6.7)
//   SIGNATURE RESHAPING #1 of exactly three project-wide is partly spent here:
//   `updateOrderAmountsWithPriceGroups(order): Promise<PriceGroupAppliedIntent[]>`.
//   The legacy returns `void` and mutates the order aggregate in place [L369-L372]; the
//   target returns INTENTS across the anti-corruption boundary because the order
//   aggregate is out of scope. The reshaped shape is asserted, not assumed.
//
//   ZERO DELIBERATE DIVERGENCES belong to this suite. All three project-wide slots are
//   already spent - two in `tests/unit/services/promotion/discountAmount.test.ts` and
//   one in a sibling entity suite - and nothing here claims a fourth. In particular the
//   `newPrice` normalisation recorded at the amount-type dispatch below is STYLE-ONLY
//   and is labelled as such where it appears.
//
//   NO VISIBILITY WIDENING is claimed here (all five are in the promotion slice) and NO
//   SIGNATURE WIDENING is claimed here (the one is spent on a sibling entity).
//
// TWO SOURCE IDENTIFIERS ARE PARAPHRASED RATHER THAN QUOTED
//   `calculateSkuPriceBasedOnCurrentAccount` reaches ambient request state through two
//   differently-named accessors for the same scope, at [L263] and [L264]. Those two
//   identifiers are named DESCRIPTIVELY here - "the Slatwall-scope accessor" and "the
//   Hibachi-scope accessor" - with their locators, rather than transcribed. The reason
//   is mechanical, not stylistic: this project's forbidden-identifier audit greps for
//   either spelling to prove that no ambient scope survived transformation rule T6, and a
//   comment quoting one of them would trip that audit while proving nothing. The two
//   locators carry the fact precisely, and they are checkable against the source.
//
// THE DOUBLES RECORD, THEY DO NOT SIMULATE
//   Each collaborator double captures what it was asked to do and answers from a canned
//   value. None of them is a database, none evaluates a predicate, and none re-reads its
//   own writes - so every expectation below is about what the service ASKS FOR, which is
//   exactly the surface the ORM's removal changed. Each is declared `implements` its
//   port so the compiler, not a runtime mock, rejects it the day the port reshapes.
//
// NO ENVIRONMENT, NO CLOCK, NO NETWORK. Nothing here reads `process.env`, opens a
//   socket, touches the filesystem or installs a timer, so the suite passes under a
//   completely empty environment. Every timestamp that appears is an explicit UTC
//   ISO-8601 string; `tests/setup.ts` forces `TZ=UTC` and restores mocks after each case.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PriceGroup } from '../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../src/domain/entities/priceGroupRate.js';
import { Product } from '../../../src/domain/entities/product.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import { Sku } from '../../../src/domain/entities/sku.js';
import type { SkuPriceGroupResolver } from '../../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
} from '../../../src/domain/ports/productRepository.js';
import type {
  CurrentAccountContext,
  PriceGroupRepository,
} from '../../../src/domain/ports/priceGroupRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import { PriceGroupService } from '../../../src/services/priceGroupService.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

/**
 * The service's one module-local collaborator contract, recovered from the constructor.
 *
 * JUDGMENT CALL: `PriceGroupFrameworkReads` is deliberately NOT exported - it is the
 * service's own contract for the two framework affordances that none of the thirteen ports
 * carries, and exporting it to satisfy a test would widen a production surface for a test's
 * convenience. `ConstructorParameters` reads it off the shipped class instead, so the double
 * below becomes a compile error the day the contract changes. The same technique is already
 * used by `tests/unit/domain/entities/priceGroupRate.test.ts` for the entity's init shape.
 *
 * ★ DRIFT CORRECTION, RECORDED RATHER THAN GLOSSED. The shipped constructor takes THREE
 * collaborators - the price-group repository, the product repository and these framework
 * reads - and NOT a SKU repository. `SkuService` owns SKU loading; this service reads a SKU
 * only from a caller-supplied entity, which is why the cascade is synchronous at all. No
 * SKU-repository double is therefore built here, and `PriceGroupService.length` is asserted
 * to be 3 so the omission cannot be mistaken for one.
 */
type PriceGroupFrameworkReads = ConstructorParameters<typeof PriceGroupService>[2];

/** The recorded shape of one rounding-rule delegation, read off the fixture double. */
type RecordedRoundValueCall = ReturnType<
  typeof makePriceGroupFixtures
>['roundingRuleValueRounder']['calls'][number];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The rate under save on every write path below. */
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

/** The account identifier every account-scoped read is issued for. */
const ACCOUNT_ID = 'acc-1';

/**
 * The base price every SKU fixture carries, as a decimal STRING.
 *
 * P4: there is no float anywhere in this file, in an input OR in an expected value. Every
 * monetary literal below is a decimal string handed to `Money.fromDecimalString`, and every
 * comparison goes through `Money` value equality or `compare()`.
 */
const SKU_BASE_PRICE = '19.99';

/**
 * The pre-rounding result of the `percentageOff` arm on the base price.
 *
 * `19.99 - (19.99 x (12.5 / 100))` = `19.99 - 2.49875` = `17.49125`, computed by
 * `Money.minus`/`times`/`dividedBy` over an arbitrary-precision decimal rather than by
 * IEEE-754. It is stated here because two cases assert it: the value handed to the rounding
 * rule, and - once quantized by [L339] - the value returned when no rounding rule exists.
 */
const PERCENTAGE_OFF_PRE_ROUNDING = '17.49125';

/** The quantized result of that same arm, after [L339] applies `numberFormat(_, "0.00")`. */
const PERCENTAGE_OFF_QUANTIZED = '17.49';

/** `19.99 - 5.00`, the `amountOff` arm's result on the base price. */
const AMOUNT_OFF_RESULT = '14.99';

/** The `amount` arm returns the rate's own amount verbatim. */
const FIXED_AMOUNT_RESULT = '9.99';

/** A canned rounding answer BELOW the base price, so a price-group win is observable. */
const ROUNDED_BELOW_BASE = '9.00';

/** A canned rounding answer ABOVE the base price - the fixture default. */
const ROUNDED_ABOVE_BASE = '77.77';

/** A canned rounding answer EQUAL to the base price, for the strict-comparison arms. */
const ROUNDED_EQUAL_TO_BASE = '19.99';

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

/** One recorded `savePriceGroupRate` call, with the sibling set it carried. */
interface RecordedRateSave {
  readonly rate: PriceGroupRate;
  readonly reconciledSiblings: readonly PriceGroupRate[];
}

/**
 * A `PriceGroupRepository` that captures its calls and answers from canned values.
 *
 * `implements PriceGroupRepository` is what makes this double honest: the compiler
 * rejects it the moment the port gains, loses or reshapes a member, which no runtime
 * mock can do. The two members no case in this file exercises - `getPriceGroup` and
 * `savePriceGroup` - reject rather than resolving, so an unexpected call fails loudly
 * instead of being absorbed. The four that ARE exercised record, and every case that
 * expects one of them NOT to be reached asserts its recorder is empty, which names the
 * absence instead of relying on a rejection to surface it.
 */
class RecordingPriceGroupRepository implements PriceGroupRepository {
  /** Every subscription-price-group read, in call order, by account identifier. */
  readonly subscriptionReads: string[] = [];

  /** Every rate lookup, in call order, by rate identifier. */
  readonly rateLookups: string[] = [];

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

  /**
   * What the next subscription read reports.
   *
   * Handed out BY REFERENCE and deliberately so: the append case asserts that this exact array -
   * the READ SIDE of [model/service/PriceGroupService.cfc:L277-L284] - is unchanged after the
   * service has finished with it. The direction matters: the loop at [L280-L284] appends INTO the
   * account association and only iterates this one, so exactly one of the two collaborator arrays
   * may grow, and asserting both keeps that asymmetry visible.
   */
  subscriptionPriceGroups: PriceGroup[] = [];

  /** What the next rate lookup reports. */
  rateLookupResult: PriceGroupRate | undefined = undefined;

  /** What the next delete reports. */
  deleteResult = true;

  getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]> {
    this.subscriptionReads.push(accountID);

    return Promise.resolve(this.subscriptionPriceGroups);
  }

  getPriceGroup(): Promise<PriceGroup | undefined> {
    return Promise.reject(new Error('getPriceGroup is not exercised here'));
  }

  getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined> {
    this.rateLookups.push(priceGroupRateID);

    return Promise.resolve(this.rateLookupResult);
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
 * A `ProductRepository` whose single exercised member records and answers from a canned
 * value; the other five reject.
 *
 * Only `updatePriceGroupSKUSettings` reaches this port at all, and only through
 * `getProductByProductID` [model/service/PriceGroupService.cfc:L206]. Every other method in
 * the component reads its argument's own materialized graph, and each of those cases asserts
 * `productLookups` is empty - which is how "the cascade issues no query" is stated as a fact
 * rather than left to a rejection nobody triggers.
 */
class RecordingProductRepository implements ProductRepository {
  /** Every product lookup, in call order, by product identifier. */
  readonly productLookups: string[] = [];

  /** What the next product lookup reports. */
  productLookupResult: Product | undefined = undefined;

  getAttributeSets(): Promise<AttributeSetSummary[]> {
    return Promise.reject(new Error('getAttributeSets is not exercised here'));
  }

  loadDataFromFile(): Promise<void> {
    return Promise.reject(new Error('loadDataFromFile is not exercised here'));
  }

  searchProductsByProductType(): Promise<Product[]> {
    return Promise.reject(new Error('searchProductsByProductType is not exercised here'));
  }

  getProductByProductID(productID: string): Promise<Product | undefined> {
    this.productLookups.push(productID);

    return Promise.resolve(this.productLookupResult);
  }

  saveProduct(): Promise<Product> {
    return Promise.reject(new Error('saveProduct is not exercised here'));
  }

  deleteProduct(): Promise<boolean> {
    return Promise.reject(new Error('deleteProduct is not exercised here'));
  }
}

/**
 * The two framework reads the service declares for itself, recorded.
 *
 * `getAccountPriceGroups` is the DIRECT price-group association of an account, and it is the
 * seam that makes the subscription-only asymmetry in section 7 visible: three methods consult
 * it and only ONE of them also consults the subscription reach-through.
 */
class RecordingFrameworkReads implements PriceGroupFrameworkReads {
  /** Every direct-association read, in call order, by account identifier. */
  readonly accountPriceGroupReads: string[] = [];

  /** How many times the paged listing was read. */
  pageRecordReads = 0;

  /**
   * The account's LIVE association, handed out BY REFERENCE on every read.
   *
   * ★★ THE SAME ARRAY INSTANCE EVERY TIME, which is what the port contract now requires and what
   * makes the request-lifetime mutation at [model/service/PriceGroupService.cfc:L276-L284]
   * observable: the service appends into what it is handed, and a later read must see the appended
   * members. This double therefore stands in for the memoized, request-scoped association that
   * `SqlPriceGroupFrameworkReads` maintains in `src/handlers/bootstrap.ts`, and the cases below
   * inspect this field directly to prove the append landed.
   *
   * ★ QUOTE-THEN-REVISE. The by-reference handout is unchanged; only its stated purpose is. It used
   * to read: "Handed out BY REFERENCE, for the same reason as `subscriptionPriceGroups` above: the
   * defensive-copy case asserts this exact array is untouched afterwards." That case asserted the
   * opposite of the source's behaviour and is inverted below.
   */
  accountPriceGroups: PriceGroup[] = [];

  /** What the next paged listing reports. */
  pageRecords: PriceGroup[] = [];

  getAccountPriceGroups(accountID: string): Promise<PriceGroup[]> {
    this.accountPriceGroupReads.push(accountID);

    return Promise.resolve(this.accountPriceGroups);
  }

  getPriceGroupPageRecords(): Promise<readonly PriceGroup[]> {
    this.pageRecordReads += 1;

    return Promise.resolve(this.pageRecords);
  }
}

/** The subject and all three collaborators, so any of them can be asserted on. */
interface Subject {
  readonly service: PriceGroupService;
  readonly repository: RecordingPriceGroupRepository;
  readonly productRepository: RecordingProductRepository;
  readonly frameworkReads: RecordingFrameworkReads;
}

/**
 * A fresh subject, wired by hand - no container, no locator, no ambient scope.
 *
 * Constructed per case rather than once per module: every double carries mutable recorders,
 * and module-level state shared between cases would make an assertion about "no call was
 * issued" depend on which case ran first.
 */
function makeSubject(): Subject {
  const repository = new RecordingPriceGroupRepository();
  const productRepository = new RecordingProductRepository();
  const frameworkReads = new RecordingFrameworkReads();

  return {
    repository,
    productRepository,
    frameworkReads,
    service: new PriceGroupService(repository, productRepository, frameworkReads),
  };
}

// ---------------------------------------------------------------------------
// Entity factories
// ---------------------------------------------------------------------------

/** A price group under the supplied identifier, holding the supplied rates. */
function aPriceGroupNamed(priceGroupID: string, ...rates: readonly PriceGroupRate[]): PriceGroup {
  const priceGroup = new PriceGroup({
    priceGroupID,
    priceGroupIDPath: priceGroupID,
    activeFlag: true,
    priceGroupName: 'Trade',
    priceGroupCode: 'trade-' + priceGroupID,
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

/** A price group holding the supplied rates, with the far side of each rate wired. */
function aPriceGroupHolding(...rates: readonly PriceGroupRate[]): PriceGroup {
  return aPriceGroupNamed(PRICE_GROUP_ID, ...rates);
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

/**
 * A price group whose ONE global rate is a flat `amount`, so every SKU resolves to it.
 *
 * The `amount` arm neither multiplies nor rounds [L333-L334], which makes it the only arm
 * whose output is fully determined by the fixture with no rounding collaborator in the
 * picture. Section 7 needs exactly that: the order pass has to be asserted on the
 * comparison it performs, not on the arithmetic that feeds it.
 */
function aFlatPriceGroup(priceGroupID: string, flatAmount: string, rateID?: string): PriceGroup {
  return aPriceGroupNamed(
    priceGroupID,
    aRate({
      priceGroupRateID: rateID ?? priceGroupID + '-rate',
      globalFlag: true,
      amountType: 'amount',
      amount: Money.fromDecimalString(flatAmount),
    }),
  );
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
// Narrowing helpers - `noUncheckedIndexedAccess` is on and postfix `!` is banned
// ---------------------------------------------------------------------------

/**
 * Narrows a fixture association the cascade depends on, failing loudly if it is absent.
 *
 * The alternative is a postfix `!`, which this project forbids: it would silence exactly the
 * signal that matters when a fixture stops supplying the parent product type or the product
 * the cascade walks through.
 */
function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new Error(`fixture invariant violated: ${description} is absent`);
  }

  return value;
}

/** The single recorded rounding delegation, narrowed. */
function onlyRoundValueCall(calls: readonly RecordedRoundValueCall[]): RecordedRoundValueCall {
  const [first] = calls;

  return requirePresent(first, 'a recorded roundValueByRoundingRule call');
}

/** What an order item looked like before the pass ran, for the read-only proof. */
interface OrderItemSnapshot {
  readonly orderItemID: string;
  readonly price: Money;
  readonly skuPrice: Money;
  readonly appliedPriceGroup: PriceGroup | undefined;
}

/**
 * Captures the mutable-looking surface of every order item.
 *
 * `OrderItemView` is declared `readonly` throughout, so this cannot detect a compile-time
 * violation - it detects a RUNTIME one, which is the failure mode that matters: the legacy
 * pass called `setPrice` and `setAppliedPriceGroup` on the live aggregate [L370-L371], and a
 * port that reached for the same accessors through a cast would be caught here.
 */
function snapshotOrderItems(order: OrderView): readonly OrderItemSnapshot[] {
  return order.orderItems.map((orderItem: OrderItemView) => ({
    orderItemID: orderItem.orderItemID,
    price: orderItem.price,
    skuPrice: orderItem.skuPrice,
    appliedPriceGroup: orderItem.appliedPriceGroup,
  }));
}

/** A SKU whose base price is the suite-wide control value, with its product graph wired. */
function aPricedSku(idPrefix: string): Sku {
  return makeSkuFixture({
    idPrefix,
    price: Money.fromDecimalString(SKU_BASE_PRICE),
    product: makeProductFixture({ idPrefix: `${idPrefix}prod-` }),
  });
}

// ---------------------------------------------------------------------------
// 1. THE FIVE-LEVEL CASCADE - must-preserve area (ii)
//
// Three sibling resolvers, ALL SYNCHRONOUS, and the async-boundary contract is why:
// each one traverses associations that are already materialized, so nothing about it
// reaches a port. They are invoked WITHOUT `await` below, which is the enforcement -
// `await-thenable` would reject an `await` on a non-thenable, so the invocation style
// itself pins the split.
//
//   getRateForProductTypeBasedOnPriceGroup  [model/service/PriceGroupService.cfc:L57-L99]
//   getRateForProductBasedOnPriceGroup      [L102-L138]
//   getRateForSkuBasedOnPriceGroup          [L140-L181]
//
// The SKU variant walks five levels in order: SKU rate, then product rate, then the
// product-type parent chain, then the global rate, then the parent price group.
// ---------------------------------------------------------------------------

describe('the five-level cascade: last-match-wins', () => {
  // CFML parity [model/service/PriceGroupService.cfc:L146-L150, L163-L170]: NOT ONE candidate
  // loop breaks on a match. The product-type variant's outer rate loop [L63-L78] does not (its
  // inner `while` break at [L72] exits only the ancestor walk), its global loop [L81-L88] does
  // not, the product variant's loops [L108-L112, L122-L126] do not, and the SKU variant's
  // [L146-L150, L165-L169] do not. Each iteration OVERWRITES `returnRate`.
  //
  // ⇒ WHEN TWO OR MORE RATES MATCH, THE LAST ONE ENCOUNTERED WINS. A single-match case cannot
  // observe that, which is why every case in this group supplies at least two matches.

  it('★★ resolves the LAST matching SKU rate, not the first', () => {
    const sku = aPricedSku('lmw-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'lmw-', skuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    // The premise, asserted rather than assumed: BOTH rates match this SKU, and they are
    // distinct rows in the association order the child price group publishes.
    expect(graph.skuLevelRateFirstMatch.hasSku(sku)).toBe(true);
    expect(graph.skuLevelRateLastMatch.hasSku(sku)).toBe(true);
    expect(graph.skuLevelRateFirstMatch).not.toBe(graph.skuLevelRateLastMatch);

    const resolved = service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup);

    expect(resolved).toBe(graph.skuLevelRateLastMatch);
  });

  it('★★ resolves the LAST matching GLOBAL rate, where the ENTITY resolves the first', () => {
    // ★ THE CONTRAST IS THE POINT AND IS DRAWN IN ONE CASE. `PriceGroup.getGlobalPriceGroupRate()`
    // [model/entity/PriceGroup.cfc:L83-L90] RETURNS FROM INSIDE its loop, so it is FIRST-MATCH.
    // The service's global loop [model/service/PriceGroupService.cfc:L81-L88, L163-L170] assigns
    // and keeps going, so it is LAST-MATCH. Two rates with the flag set therefore give two
    // different answers depending on which accessor a caller reaches for, and both behaviours
    // are preserved exactly as written.
    const sku = aPricedSku('lmwg-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'lmwg-' });
    const { service } = makeSubject();

    expect(graph.globalRateFirstMatch.getGlobalFlag()).toBe(true);
    expect(graph.globalRateLastMatch.getGlobalFlag()).toBe(true);

    expect(graph.globalRatePriceGroup.getGlobalPriceGroupRate()).toBe(graph.globalRateFirstMatch);
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.globalRatePriceGroup)).toBe(
      graph.globalRateLastMatch,
    );
  });

  it('resolves the LAST matching product rate', () => {
    const product = makeProductFixture({ idPrefix: 'lmwp-prod-' });
    const graph = makePriceGroupFixtures({
      idPrefix: 'lmwp-',
      productLevelRateProducts: [product],
      productTypeLevelRateProductTypes: [
        requirePresent(product.getProductType(), 'the fixture product type'),
      ],
    });
    const { service } = makeSubject();

    // Two rates on the SAME price group match this product's graph - one by product
    // membership [L108-L112] and one by product-type membership through [L115-L117]. The
    // product loop runs FIRST and assigns, and the product-type delegation only happens when
    // the product loop found nothing [L114], so the product-level rate wins outright here.
    expect(graph.productLevelRate.hasProduct(product)).toBe(true);
    expect(graph.productTypeLevelRate.getProductTypes()).toHaveLength(1);

    expect(service.getRateForProductBasedOnPriceGroup(product, graph.childPriceGroup)).toBe(
      graph.productLevelRate,
    );
  });
});

describe('the five-level cascade: every level, in order', () => {
  it('level 1 - a SKU-level rate on the price group itself', () => {
    const sku = aPricedSku('l1-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'l1-', skuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.skuLevelRateLastMatch,
    );
  });

  it('level 2 - a PRODUCT-level rate, reached through the SKU variant [L153-L155]', () => {
    const product = makeProductFixture({ idPrefix: 'l2-prod-' });
    const sku = makeSkuFixture({
      idPrefix: 'l2-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'l2-', productLevelRateProducts: [product] });
    const { service } = makeSubject();

    // No SKU-level rate matches, so [L145-L151] leaves `returnRate` unset and [L153-L155]
    // delegates to the product variant.
    expect(graph.skuLevelRateLastMatch.hasSku(sku)).toBe(false);

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.productLevelRate,
    );
  });

  it('level 3 - a PRODUCT-TYPE rate on the type the product carries directly', () => {
    const product = makeProductFixture({ idPrefix: 'l3-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'l3-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'l3-',
      productTypeLevelRateProductTypes: [productType],
    });
    const { service } = makeSubject();

    // CFML parity [model/service/PriceGroupService.cfc:L115-L117 vs L158-L160]: the SKU
    // variant declares its OWN product-type step at [L158-L160], and that step is
    // TRANSITIVELY PRE-EMPTED - level 2 [L153-L155] calls the product variant, which performs
    // the very same product-type delegation at [L115-L117] before returning. So a product-type
    // rate is always answered through level 2 and [L158-L160] is unreachable for a SKU whose
    // product resolves. The OUTCOME is identical either way, which is what this case pins; the
    // structural redundancy is recorded rather than tidied away.
    expect(service.getRateForProductTypeBasedOnPriceGroup(productType, graph.childPriceGroup)).toBe(
      graph.productTypeLevelRate,
    );
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.productTypeLevelRate,
    );
  });

  it('★ level 3 - the ancestor walk climbs PAST the parent to a grandparent [L65-L77]', () => {
    // The inner `while(!isNull(currentProductType))` at [L65-L77] ascends one generation per
    // pass and breaks only on a hit [L72]. Two generations therefore require two passes, which
    // a single-parent fixture cannot distinguish from one.
    const product = makeProductFixture({ idPrefix: 'anc-prod-' });
    const childType = requirePresent(product.getProductType(), 'the fixture product type');
    const parentType = requirePresent(
      childType.getParentProductType(),
      'the fixture product type parent',
    );
    const grandparentType = new ProductType({ productTypeID: 'anc-grandparent' });

    grandparentType.addChildProductType(parentType);

    expect(childType.getParentProductType()).toBe(parentType);
    expect(parentType.getParentProductType()).toBe(grandparentType);
    expect(grandparentType.getParentProductType()).toBeUndefined();

    const graph = makePriceGroupFixtures({
      idPrefix: 'anc-',
      productTypeLevelRateProductTypes: [grandparentType],
    });
    const { service } = makeSubject();

    // The rate is registered against the GRANDPARENT only.
    expect(graph.productTypeLevelRate.hasProductType(grandparentType)).toBe(true);
    expect(graph.productTypeLevelRate.hasProductType(childType)).toBe(false);
    expect(graph.productTypeLevelRate.hasProductType(parentType)).toBe(false);

    expect(service.getRateForProductTypeBasedOnPriceGroup(childType, graph.childPriceGroup)).toBe(
      graph.productTypeLevelRate,
    );
  });

  it('level 4 - the GLOBAL rate, when nothing more specific matches', () => {
    const sku = aPricedSku('l4-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'l4-' });
    const { service } = makeSubject();

    // `globalRatePriceGroup` has no parent, so its global loop is the last step that can
    // answer - which is exactly what makes it a clean level-4 exhibit.
    expect(graph.globalRatePriceGroup.getParentPriceGroup()).toBeUndefined();

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.globalRatePriceGroup)).toBe(
      graph.globalRateLastMatch,
    );
  });

  it('★ level 4 - an ANCESTOR price group global rate answers before level 5 is reached', () => {
    // Worth pinning because it is counter-intuitive and it is load-bearing for the two cases
    // that follow. The product-type variant recurses on the parent price group at [L91-L93], and
    // the product variant reaches it through [L115-L117] BEFORE its own global step [L120-L127]
    // or its own parent recursion [L130-L132]. So a global rate anywhere up the price-group
    // chain answers first, and levels 4 and 5 of the group actually being queried never run.
    const sku = aPricedSku('l4a-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'l4a-' });
    const { service } = makeSubject();

    expect(graph.rootGlobalRate.getGlobalFlag()).toBe(true);
    expect(graph.childPriceGroup.getParentPriceGroup()).toBe(graph.parentPriceGroup);
    expect(graph.parentPriceGroup.getParentPriceGroup()).toBe(graph.rootPriceGroup);

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.rootGlobalRate,
    );
  });

  it('★★ level 5 - the PARENT price group, once no ancestor global rate can answer', () => {
    // The parent recursion [L173-L175] is only reachable when every earlier level came back
    // empty, and the ancestor global rate is what normally prevents that - see the case above.
    // Removing it from the root is what exposes level 5 at all.
    const product = makeProductFixture({ idPrefix: 'l5-prod-' });
    const sku = makeSkuFixture({
      idPrefix: 'l5-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'l5-',
      parentProductLevelRateProducts: [product],
    });
    const { service } = makeSubject();

    graph.rootPriceGroup.removePriceGroupRate(graph.rootGlobalRate);

    expect(graph.rootPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(graph.parentProductLevelRate.hasProduct(product)).toBe(true);

    // A PRODUCT-level rate on the parent price group IS consulted, because the parent
    // recursion asks the product variant - which is the same variant that can see product
    // membership. The next group of cases is about what that same choice costs.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.parentProductLevelRate,
    );
  });
});

describe('the five-level cascade: DEFECT 7, the parent-recursion asymmetry', () => {
  it('★★ NEVER consults a SKU-level rate defined on a PARENT price group', () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L173-L175]: the SKU cascade's parent
    // recursion calls getRateForProductBasedOnPriceGroup rather than the SKU variant, so a
    // SKU-level rate on a parent price group is never consulted, breaking the cascade's symmetry.
    // Preserved deliberately; do not fix without a product decision.
    const product = makeProductFixture({ idPrefix: 'd7-prod-' });
    const sku = makeSkuFixture({
      idPrefix: 'd7-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'd7-', parentSkuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    graph.rootPriceGroup.removePriceGroupRate(graph.rootGlobalRate);

    // THE RATE EXISTS, IT IS ON THE PARENT, AND IT MATCHES THIS EXACT SKU.
    expect(graph.parentSkuLevelRate.hasSku(sku)).toBe(true);
    expect(graph.parentPriceGroup.getPriceGroupRates()).toContain(graph.parentSkuLevelRate);
    expect(graph.childPriceGroup.getParentPriceGroup()).toBe(graph.parentPriceGroup);

    // AND THE CASCADE RESOLVES NOTHING, because level 5 asks the PRODUCT variant, and the
    // product variant has no step that reads SKU membership.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBeUndefined();

    // Asking the parent group DIRECTLY finds it, which proves the rate is reachable and that
    // it is the recursion's choice of variant - not the data - that loses it.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.parentPriceGroup)).toBe(
      graph.parentSkuLevelRate,
    );
  });

  it('★ the PRODUCT variant is symmetric where the SKU variant is not [L130-L132]', () => {
    // The contrast is what makes defect 7 legible: the product variant's own parent recursion
    // at [L130-L132] calls THE SAME variant, so product membership survives the climb. Only the
    // SKU variant changes variant on the way up.
    const product = makeProductFixture({ idPrefix: 'sym-prod-' });
    const graph = makePriceGroupFixtures({
      idPrefix: 'sym-',
      parentProductLevelRateProducts: [product],
    });
    const { service } = makeSubject();

    graph.rootPriceGroup.removePriceGroupRate(graph.rootGlobalRate);

    expect(service.getRateForProductBasedOnPriceGroup(product, graph.childPriceGroup)).toBe(
      graph.parentProductLevelRate,
    );
  });
});

describe('the five-level cascade: nothing matches', () => {
  it('★ answers `undefined` - never null, never a zero-amount rate, never a throw', () => {
    // Legacy [L96-L98] tests `if(!isNull(returnRate)) return returnRate;` and then falls off the
    // end of the function, which in CFML returns null. `isolatedPriceGroup` holds no rates and
    // has no parent, so every one of the five levels comes back empty.
    const product = makeProductFixture({ idPrefix: 'none-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'none-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'none-' });
    const { service } = makeSubject();

    expect(graph.isolatedPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(graph.isolatedPriceGroup.getParentPriceGroup()).toBeUndefined();

    // All three variants, because all three end the same way.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.isolatedPriceGroup)).toBeUndefined();
    expect(
      service.getRateForProductBasedOnPriceGroup(product, graph.isolatedPriceGroup),
    ).toBeUndefined();
    expect(
      service.getRateForProductTypeBasedOnPriceGroup(productType, graph.isolatedPriceGroup),
    ).toBeUndefined();

    // `toBeUndefined` already excludes `null`; this states the OTHER two wrong answers
    // explicitly, because both are plausible ports and both change money. A zero-amount rate
    // would drive the `amount` arm and sell the SKU for nothing; a throw would turn "this
    // account has no special pricing" into a failed request.
    const resolved: unknown = service.getRateForSkuBasedOnPriceGroup(sku, graph.isolatedPriceGroup);

    expect(resolved instanceof PriceGroupRate).toBe(false);
  });
});

describe('the five-level cascade: the exclusion collections are never consulted', () => {
  it('★ resolves a rate that lists the SKU, the product AND the type as EXCLUDED', () => {
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L75-L77]: the rate declares
    // `excludedProductTypes`, `excludedProducts` and `excludedSkus` as three many-to-many link
    // collections, and NO step of the cascade [model/service/PriceGroupService.cfc:L57-L181]
    // reads any of them. `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95] renders them for
    // the admin, which is the only place they surface.
    // The collections are ported so the schema contract is unbroken (constraint C5) and the
    // exclusion is NOT implemented, because implementing it would change which rate resolves.
    //
    // The three declarations are at L75, L76 and L77; L49 is the component tag. An earlier revision
    // of this comment cited L49, which is the kind of drift that makes a citation worthless.
    const product = makeProductFixture({ idPrefix: 'excl-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'excl-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'excl-',
      skuLevelRateSkus: [sku],
      excludedSkus: [sku],
      excludedProducts: [product],
      excludedProductTypes: [productType],
    });
    const { service } = makeSubject();

    // The collections ARE present and populated on the exhibit rate.
    expect(graph.appliesToIncludingAndExcludingRate.getExcludedSkus()).toStrictEqual([sku]);
    expect(graph.appliesToIncludingAndExcludingRate.getExcludedProducts()).toStrictEqual([product]);
    expect(graph.appliesToIncludingAndExcludingRate.getExcludedProductTypes()).toStrictEqual([
      productType,
    ]);
    expect(graph.appliesToIncludingAndExcludingRate.hasSku(sku)).toBe(true);

    // And the SKU resolves to it anyway.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.siblingPriceGroup)).toBe(
      graph.appliesToIncludingAndExcludingRate,
    );
  });

  it('★★ PRICES the excluded SKU through the excluding rate - the gap reaches money', () => {
    // Rate resolution is where the gap lives, but resolution is not the consequence. The consequence
    // is the amount charged, so it is asserted here: a SKU that the rate names in `excludedSkus` is
    // priced BY that rate, and the price is not the SKU's own. Resolving the rate and then pricing
    // through it are separate methods, so a future change that honoured exclusions in one and not the
    // other would leave one of these two assertions standing.
    const product = makeProductFixture({ idPrefix: 'exclmoney-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'exclmoney-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'exclmoney-',
      skuLevelRateSkus: [sku],
      excludedSkus: [sku],
      excludedProducts: [product],
      excludedProductTypes: [productType],
    });
    const { service } = makeSubject();
    const excludingRate = graph.appliesToIncludingAndExcludingRate;

    // The rate excludes this SKU three times over - by SKU, by product and by product type.
    expect(excludingRate.getExcludedSkus()).toStrictEqual([sku]);
    expect(excludingRate.getExcludedProducts()).toStrictEqual([product]);
    expect(excludingRate.getExcludedProductTypes()).toStrictEqual([productType]);

    const pricedThroughGroup = service.calculateSkuPriceBasedOnPriceGroup(
      sku,
      graph.siblingPriceGroup,
    );

    // ★ The price-group price IS the excluding rate's price. The rate is `percentageOff`, so
    // [model/service/PriceGroupService.cfc:L322-L327] runs its rounding-rule arm and the collaborator
    // double answers with its canned numeral - the point being only that the RATE governed, not the
    // particular figure.
    expect(pricedThroughGroup.toDecimalString()).toBe(ROUNDED_ABOVE_BASE);
    expect(pricedThroughGroup.toDecimalString()).toBe(
      service.calculateSkuPriceBasedOnPriceGroupRate(sku, excludingRate).toDecimalString(),
    );

    // ★ And it is NOT the SKU's own price, which is what honouring the exclusion would have produced.
    expect(pricedThroughGroup.toDecimalString()).not.toBe(SKU_BASE_PRICE);
    expect(sku.getPrice().toDecimalString()).toBe(SKU_BASE_PRICE);
  });
});

describe('the five-level cascade issues no query at all', () => {
  it('★ reads only the materialized graph - no port, no page, no lookup', () => {
    // This is what the synchronous signature MEANS, stated as an assertion rather than left to
    // the type. Transformation rule T3 made fetch shape an explicit repository decision; a
    // cascade that lazily loaded an association would have to be async, and a port that made it
    // async to "be safe" would break interface parity for every caller.
    const sku = aPricedSku('noq-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'noq-', skuLevelRateSkus: [sku] });
    const { service, repository, productRepository, frameworkReads } = makeSubject();

    service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup);
    service.calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup);

    expect(repository.subscriptionReads).toStrictEqual([]);
    expect(repository.rateLookups).toStrictEqual([]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(frameworkReads.pageRecordReads).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. THE AMOUNT-TYPE DISPATCH - DEFECT 8, and the other half of must-preserve area (ii)
//
// `calculateSkuPriceBasedOnPriceGroupRate(sku, rate): Money` is SYNCHRONOUS.
// [model/service/PriceGroupService.cfc:L316-L340], line by line:
//
//   L319  seeds `newPrice = sku.getPrice()`
//   L321  switches on `rate.getAmountType()`
//   L322  `percentageOff` -> L323 precisionEvaluate, L326 a null guard that reads
//         getRoundingRule(), L327 reads getRoundingRule() AGAIN and applies roundValue
//   L330  `amountOff`     -> L331 precisionEvaluate, and NO rounding
//   L333  `amount`        -> L334 a plain assignment: no precision helper, no rounding
//   (none) an UNRECOGNISED amountType matches nothing and falls through to the seed
//   L339  `numberFormat(newPrice, "0.00")`
//
// CFML parity [model/service/PriceGroupService.cfc:L319, L323, L331, L334]: the legacy body
// re-declares `var newPrice` four times in the same function scope. TypeScript expresses this
// as a single binding. This is a style-only normalisation with identical observable behaviour;
// it is NOT a fourth deliberate divergence, and the project's three divergences remain spent.
//
// CFML parity [model/service/PriceGroupService.cfc:L326-L327]: the legacy calls
// `getRoundingRule()` TWICE on the percentageOff arm - once for the null guard and once for the
// use. The shipped port hoists it into one read, which is unobservable: the accessor is a pure
// association read on a materialized entity, so two reads and one read cannot differ. The cases
// below therefore assert the OBSERVABLE - whether the rounding collaborator was invoked at all -
// rather than a call count on the accessor, because a call count would pin the hoist rather
// than the behaviour.
// ---------------------------------------------------------------------------

describe('the amount-type dispatch: DEFECT 8, only percentageOff rounds', () => {
  it('★★ percentageOff APPLIES the rate rounding rule, and hands it the pre-rounding value', () => {
    const sku = aPricedSku('pct-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'pct-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithRoundingRule,
    );

    // The collaborator WAS reached, exactly once, and the value it was handed is the
    // precisionEvaluate result of [L323] - `19.99 - (19.99 x (12.5 / 100))` - BEFORE [L339]
    // quantizes anything. Five decimal places survive to the rounding rule, which is the whole
    // reason `precisionEvaluate` is there.
    expect(graph.roundingRuleValueRounder.calls).toHaveLength(1);

    const call = onlyRoundValueCall(graph.roundingRuleValueRounder.calls);

    expect(call.value.equals(Money.fromDecimalString(PERCENTAGE_OFF_PRE_ROUNDING))).toBe(true);
    expect(call.rule).toBe(graph.closestRoundingRule);

    // And the rule's answer is what comes back.
    expect(result.equals(graph.roundValueDoubleAnswer)).toBe(true);
    expect(result.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
  });

  it('★★ amountOff does NOT apply the rounding rule, even though the rate carries one', () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: only the percentageOff branch
    // applies the rate's rounding rule (L326-L327). amountOff (L331) and amount (L334) skip it
    // entirely, even when a rounding rule is configured on the rate.
    // Preserved deliberately; do not fix without a product decision.
    const sku = aPricedSku('amtoff-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'amtoff-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    // THE PREMISE: this rate DOES carry a rounding rule. The skip is the dispatch's choice,
    // not missing data.
    expect(graph.amountOffRateWithRoundingRule.getRoundingRule()).toBe(graph.closestRoundingRule);

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.amountOffRateWithRoundingRule,
    );

    // NOT INVOKED.
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);

    // `19.99 - 5.00`, unrounded.
    expect(result.equals(Money.fromDecimalString(AMOUNT_OFF_RESULT))).toBe(true);
  });

  it('★★ amount does NOT apply the rounding rule AND uses no precision helper [L334]', () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: only the percentageOff branch
    // applies the rate's rounding rule (L326-L327). amountOff (L331) and amount (L334) skip it
    // entirely, even when a rounding rule is configured on the rate.
    // Preserved deliberately; do not fix without a product decision.
    //
    // Kept as its own case rather than folded into the amountOff one, because the two arms
    // differ in a SECOND way that matters: [L331] still routes through `precisionEvaluate`
    // while [L334] is a bare assignment. There is no arithmetic on this arm at all, so the
    // rate's amount reaches the caller untouched apart from [L339]'s presentation step.
    const sku = aPricedSku('amt-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'amt-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    expect(graph.fixedAmountRateWithRoundingRule.getRoundingRule()).toBe(graph.closestRoundingRule);

    const rateAmount = requirePresent(
      graph.fixedAmountRateWithRoundingRule.getAmount(),
      'the fixed-amount rate amount',
    );
    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.fixedAmountRateWithRoundingRule,
    );

    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);

    // The rate's own amount, verbatim - neither the SKU price nor the rounding answer plays
    // any part.
    expect(result.equals(rateAmount)).toBe(true);
    expect(result.equals(Money.fromDecimalString(FIXED_AMOUNT_RESULT))).toBe(true);
    expect(result.equals(sku.getPrice())).toBe(false);
    expect(result.equals(graph.roundValueDoubleAnswer)).toBe(false);
  });

  it('★★ an UNRECOGNISED amountType matches nothing and returns the SEEDED BASE PRICE', () => {
    // Legacy [L321-L336] is a `switch` with THREE `case` arms and NO `default`, so an
    // out-of-vocabulary value leaves the [L319] seed untouched and [L339] returns the SKU's own
    // price. That is a silent no-op rather than a failure, and it is preserved: raising here
    // would turn a stale settings row into a failed price lookup.
    const sku = aPricedSku('unrec-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'unrec-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    // The premise: the exhibit's stored column value really is outside the vocabulary the
    // entity publishes.
    expect(graph.recognisedAmountTypes).toStrictEqual(['percentageOff', 'amountOff', 'amount']);
    expect(graph.recognisedAmountTypes).not.toContain(graph.unrecognisedAmountTypeColumnValue);
    expect(graph.unrecognisedAmountTypeRate.getAmountType()).toBeUndefined();
    expect(graph.unrecognisedAmountTypeRate.getAmount()).toBeDefined();
    expect(graph.unrecognisedAmountTypeRate.getRoundingRule()).toBe(graph.closestRoundingRule);

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.unrecognisedAmountTypeRate,
    );

    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
    expect(result.equals(sku.getPrice())).toBe(true);
    expect(result.equals(Money.fromDecimalString(SKU_BASE_PRICE))).toBe(true);
  });

  it('★ a percentageOff rate with NO rounding rule is safe - the [L326] guard is real', () => {
    // ★ AND THIS IS THE ONE SANCTIONED NON-PRESENTATIONAL QUANTIZATION IN THE PROJECT.
    // `toFixed2` and `numberFormat` are presentation-only everywhere else; [L339] is different,
    // because the legacy genuinely quantizes the value it RETURNS. `17.49125` becomes `17.49`
    // and the discarded digits never reach a caller, so this is arithmetic, not formatting - and
    // a reviewer should not mistake it for a stray formatting call.
    //
    // The rounding-rule branch normally hides that, because the rule's own answer is already
    // two-place. Only the no-rounding-rule path exposes [L339] on its own.
    const sku = aPricedSku('norule-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'norule-' });
    const { service } = makeSubject();

    expect(graph.percentageOffRateWithoutRoundingRule.getRoundingRule()).toBeUndefined();

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithoutRoundingRule,
    );

    // No throw, no collaborator call, and the pre-rounding value quantized by [L339].
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
    expect(result.equals(Money.fromDecimalString(PERCENTAGE_OFF_QUANTIZED))).toBe(true);

    // Stated the other way round so the truncation is unmistakable: the five-place
    // intermediate is NOT what comes back.
    expect(result.equals(Money.fromDecimalString(PERCENTAGE_OFF_PRE_ROUNDING))).toBe(false);
    expect(result.toFixed2()).toBe(PERCENTAGE_OFF_QUANTIZED);
  });

  it('the dispatch is synchronous and touches no collaborator but the rounding rule', () => {
    const sku = aPricedSku('sync-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'sync-' });
    const { service, repository, productRepository, frameworkReads } = makeSubject();

    // Invoked WITHOUT `await`: the returned value is a `Money`, not a promise, and
    // `await-thenable` would reject an `await` here.
    const result: Money = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithRoundingRule,
    );

    expect(result).toBeInstanceOf(Money);
    expect(repository.rateLookups).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
  });
});

describe('calculateSkuPriceBasedOnPriceGroup: resolve, then dispatch', () => {
  it('resolves a rate through the cascade and returns its calculated price [L304-L310]', () => {
    const sku = aPricedSku('cspg-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'cspg-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    // The rate the cascade picks is the last-match SKU rate, and its price is the rounding
    // answer - so this asserts the two halves are wired to each other, not merely present.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.skuLevelRateLastMatch,
    );

    const price = service.calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup);

    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(
      price.equals(
        service.calculateSkuPriceBasedOnPriceGroupRate(sku, graph.skuLevelRateLastMatch),
      ),
    ).toBe(true);
  });

  it('★ falls through to the SKU price when the cascade resolves nothing [L307, L312]', () => {
    // [L307] is `if(!isNull(priceGroupRate))` and [L312] is the bare `return sku.getPrice()`.
    // No zero default, no throw, no last-known price: an account with no applicable rate simply
    // pays list.
    const sku = aPricedSku('csnr-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'csnr-' });
    const { service } = makeSubject();

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.isolatedPriceGroup)).toBeUndefined();

    const price = service.calculateSkuPriceBasedOnPriceGroup(sku, graph.isolatedPriceGroup);

    expect(price).toBe(sku.getPrice());
    expect(price.equals(Money.fromDecimalString(SKU_BASE_PRICE))).toBe(true);
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. getPriceGroupDataJSON - DEFECT 5 and DEFECT 29, kept apart
//
// `getPriceGroupDataJSON(): Promise<string>` is ASYNC: it reads the paged listing, which is
// a framework affordance and therefore a port call.
// [model/service/PriceGroupService.cfc:L230-L257].
// ---------------------------------------------------------------------------

describe('getPriceGroupDataJSON: DEFECT 5, the loop variable that is never assigned', () => {
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236]: the loop variable is `i` but the
  // body indexes getPageRecords()[local.i], and local.i is never assigned, so the method throws
  // on the first non-empty iteration.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ★★ DRIFT CORRECTION, AND IT MATTERS ENOUGH TO STATE PLAINLY. That marker records the
  // defect as the source is written; it does NOT describe an observable of the shipped port,
  // and this suite does not pretend otherwise. In CFML an UNSCOPED `var i` declared inside a
  // function IS a member of the `local` scope, so `local.i` and `i` name the same variable on
  // every engine this release supports - `readme.md` lists ColdFusion 9.0.1+ and Railo 4.1+,
  // and the vendored FW/1 2.1 and DI/1 0.4.2 both require full `local`-scope support. The
  // inconsistent SPELLING is real and is preserved as a recorded defect; the NullPointer it
  // looks like it should cause is not reproducible, so inventing a throw here would be
  // fabricating a failure the legacy never had.
  //
  // What IS asserted is the observable that spelling predicts either way: EVERY page record is
  // serialised, IN PAGE ORDER, under its own identifier. Had `local.i` genuinely been a
  // distinct, unassigned variable, the loop would have serialised nothing or the same record
  // repeatedly - so this assertion is the discriminating one.

  it('★★ serialises EVERY page record, under its own key, in PAGE ORDER', () => {
    const graph = makePriceGroupFixtures({ idPrefix: 'json-' });
    const third = aPriceGroupNamed('pg-json-third');
    const { service, frameworkReads } = makeSubject();

    // All three are rate-less, which is the only shape this method can serialise at all -
    // see DEFECT 29 below.
    expect(graph.isolatedPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(graph.unpathedPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(third.getPriceGroupRates()).toStrictEqual([]);

    frameworkReads.pageRecords = [graph.isolatedPriceGroup, graph.unpathedPriceGroup, third];

    return service.getPriceGroupDataJSON().then((json: string) => {
      const parsed: unknown = JSON.parse(json);

      expect(Object.keys(parsed as Record<string, unknown>)).toStrictEqual([
        graph.isolatedPriceGroup.getPriceGroupID(),
        graph.unpathedPriceGroup.getPriceGroupID(),
        third.getPriceGroupID(),
      ]);

      // The struct shape [L248-L253] is exactly two keys per record, and `priceGroupRates`
      // is an ARRAY even when empty - a caller iterating it must not have to null-check.
      expect(parsed).toStrictEqual({
        [graph.isolatedPriceGroup.getPriceGroupID()]: {
          priceGroupName: 'Isolated price group',
          priceGroupRates: [],
        },
        [graph.unpathedPriceGroup.getPriceGroupID()]: {
          priceGroupName: 'Price group with no stored path',
          priceGroupRates: [],
        },
        ['pg-json-third']: { priceGroupName: 'Trade', priceGroupRates: [] },
      });

      // One page read, not one per record.
      expect(frameworkReads.pageRecordReads).toBe(1);
    });
  });

  it('★ returns an EMPTY document when the page is empty - the loop body never runs', () => {
    // The degenerate case is the one shape that reaches the end of the method with the defect
    // present but unexercised, so it is pinned separately: `serializeJSON({})` [L256] on an
    // untouched struct.
    const { service, frameworkReads } = makeSubject();

    expect(frameworkReads.pageRecords).toStrictEqual([]);

    return service.getPriceGroupDataJSON().then((json: string) => {
      expect(json).toBe('{}');
      expect(frameworkReads.pageRecordReads).toBe(1);
    });
  });

  it('★ omits priceGroupName entirely when the column is null [L249]', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L249]: assigning a null value to a CFML
    // struct key leaves the key UNSET rather than storing a null, and `serializeJSON` then emits
    // no such property. `JSON.stringify` drops a property whose value is `undefined`, which
    // reproduces that without inventing an empty-string default the legacy never had.
    const nameless = new PriceGroup({
      priceGroupID: 'pg-nameless',
      priceGroupIDPath: 'pg-nameless',
      activeFlag: true,
      priceGroupName: undefined,
      priceGroupCode: 'nameless',
      parentPriceGroup: undefined,
      childPriceGroups: [],
      priceGroupRates: [],
      promotionRewards: [],
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.pageRecords = [nameless];

    return service.getPriceGroupDataJSON().then((json: string) => {
      expect(JSON.parse(json)).toStrictEqual({ 'pg-nameless': { priceGroupRates: [] } });
      expect(json).not.toContain('priceGroupName');
    });
  });
});

describe('getPriceGroupDataJSON: DEFECT 29, the absent rate accessor', () => {
  it('★★ THROWS as soon as a page record carries a rate, because [L243] calls nothing', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the body calls
    // thisRate.getAmountRepresentation(), a method that exists NOWHERE in the repository, so it
    // reaches the ENTITY-level missing-method throw at org/Hibachi/HibachiEntity.cfc:L565 -
    // `PriceGroupRate` declares no `attributeValues`, so `onMissingMethod` cannot serve it.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ THIS IS DEFECT 29 AND IT IS DELIBERATELY NOT THE SAME CASE AS DEFECT 30. Defect 30 is
    // `clearAmounts()` at [L400], reached from a WRITE, and the two throw sites carry IDENTICAL
    // message text - `You have called a method #arguments.missingMethodName#() which does not
    // exists in the #getClassName()# entity.` - so only the surrounding assertion can tell them
    // apart. Merging them would erase the fact that one breaks the admin's price-group grid on
    // every load while the other breaks exactly one admin workflow. `getAmountFormatted()`
    // [model/entity/PriceGroupRate.cfc:L262] is the plausible intended target and is
    // deliberately NOT substituted.
    const graph = makePriceGroupFixtures({ idPrefix: 'd29-' });
    const { service, frameworkReads } = makeSubject();

    // The premise: this group DOES hold rates, which is the ordinary case in a real install.
    expect(graph.childPriceGroup.getPriceGroupRates().length).toBeGreaterThan(0);

    frameworkReads.pageRecords = [graph.childPriceGroup];

    // The locator in the message is what distinguishes this from defect 30.
    await expect(service.getPriceGroupDataJSON()).rejects.toThrow(/getAmountRepresentation/);
    await expect(service.getPriceGroupDataJSON()).rejects.toThrow(/L243/);
  });

  it('★ throws on the FIRST rate-bearing record, after the rate-less ones were already read', async () => {
    // The order is worth pinning because it explains the symptom an operator saw: the grid did
    // not fail "sometimes", it failed as soon as ANY price group in the page had a rate, which
    // in practice is always. A port that skipped the rate loop would silently produce a
    // document the legacy could never produce.
    const graph = makePriceGroupFixtures({ idPrefix: 'd29b-' });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.pageRecords = [graph.isolatedPriceGroup, graph.childPriceGroup];

    await expect(service.getPriceGroupDataJSON()).rejects.toThrow(/getAmountRepresentation/);

    // Reading the page is not what fails; walking a rate is.
    expect(frameworkReads.pageRecordReads).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. ACCOUNT PRICING - lowest wins, the caller's collection survives, and the
//    ambient scope is gone
//
//   calculateSkuPriceBasedOnAccount(sku, accountID): Promise<Money>       [L271-L298]
//   calculateSkuPriceBasedOnCurrentAccount(sku, context): Promise<Money>  [L262-L268]
//   getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, accountID)          [L343-L362]
//
// All three are ASYNC: each one reads the account's price-group association, which is a port
// call. The cascade underneath them stays synchronous, which is the whole point of the split.
// ---------------------------------------------------------------------------

describe('calculateSkuPriceBasedOnAccount: the account price can never EXCEED the base price', () => {
  it('★★ returns the SKU price when every price group would charge MORE', () => {
    // [L274] seeds the candidate array with `sku.getPrice()` BEFORE any price group is
    // considered, [L294] sorts numerically ascending and [L297] returns `prices[1]`. The seed is
    // therefore a CEILING, and it is the only thing standing between a badly-configured
    // percentage rate and a price higher than list.
    const sku = aPricedSku('acch-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'acch-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_ABOVE_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    // The premise: this price group really does resolve a HIGHER price for this SKU.
    expect(
      service
        .calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup)
        .isGreaterThan(sku.getPrice()),
    ).toBe(true);

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    return service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID).then((price: Money) => {
      expect(price.equals(sku.getPrice())).toBe(true);
      expect(price.isGreaterThan(sku.getPrice())).toBe(false);
      expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
    });
  });

  it('★★ returns the LOWEST candidate, and the answer does not depend on candidate order', () => {
    // [L294] is `arraySort(prices, "numeric")` and [L297] takes the FIRST element, so the method
    // is order-independent by construction. Asserting the same answer from a reversed array is
    // what distinguishes "sorted, then first" from "first that wins", which a single ordering
    // cannot tell apart.
    const sku = aPricedSku('accl-sku-');
    const high = makePriceGroupFixtures({
      idPrefix: 'accl-high-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_ABOVE_BASE,
    });
    const low = makePriceGroupFixtures({
      idPrefix: 'accl-low-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const middle = makePriceGroupFixtures({
      idPrefix: 'accl-mid-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '15.00',
    });
    const forward = makeSubject();
    const reversed = makeSubject();

    forward.frameworkReads.accountPriceGroups = [
      high.childPriceGroup,
      low.childPriceGroup,
      middle.childPriceGroup,
    ];
    reversed.frameworkReads.accountPriceGroups = [
      middle.childPriceGroup,
      low.childPriceGroup,
      high.childPriceGroup,
    ];

    return Promise.all([
      forward.service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID),
      reversed.service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID),
    ]).then(([forwardPrice, reversedPrice]: readonly [Money, Money]) => {
      expect(forwardPrice.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
      expect(reversedPrice.equals(forwardPrice)).toBe(true);
      expect(forwardPrice.compare(Money.fromDecimalString('15.00'))).toBe(-1);
    });
  });
});

describe("calculateSkuPriceBasedOnAccount: the subscription groups are APPENDED to the account's live association", () => {
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L276, L282]: the legacy body binds the
  // account's price-group collection BY REFERENCE at [L276] with no defensive copy, and
  // `arrayAppend` at [L282] mutates it. Calling this method therefore PERMANENTLY ADDS the
  // subscription-derived price groups to the account's in-memory collection for the remainder of
  // the request, and everything that subsequently reads `account.getPriceGroups()` sees them -
  // including [L351] and [L365], neither of which consults the subscription statement itself.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // ★ QUOTE-THEN-REVISE. This describe previously read
  // "calculateSkuPriceBasedOnAccount: the caller collection is defensively copied" and its single
  // case, "★★ leaves the account association EXACTLY as it was handed over", asserted
  // `expect(frameworkReads.accountPriceGroups).toHaveLength(1)` after a call that had appended a
  // second member in the source. Its JUDGMENT CALL justified the copy thus: "the legacy leak is
  // not a behaviour a caller could depend on, it is a property of CFML array-by-reference
  // semantics that the port's own signature already forecloses: `getAccountPriceGroups` returns
  // `readonly PriceGroup[]`, so appending to it is not expressible. The pricing OUTPUT is
  // unchanged either way, which is why no divergence is claimed."
  //
  // Both halves of that were wrong. The behaviour IS depended upon - by [L351] and [L365], which
  // is the whole reason the defect marker names them - so it is not merely a leak. And "the
  // pricing OUTPUT is unchanged either way" is only true of THIS call; the two cases below show a
  // LATER call in the same request returning a different price, which is pricing output. The
  // `readonly` return that made the append "not expressible" was itself the adapter decision under
  // review, not a constraint the domain imposed, so citing it was circular. The port now returns
  // `PriceGroup[]` and the append is reproduced.
  it('★★★ APPENDS the subscription group into the very array the port handed out', async () => {
    const sku = aPricedSku('copy-sku-');
    const direct = makePriceGroupFixtures({
      idPrefix: 'copy-direct-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '15.00',
    });
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'copy-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    const association = [direct.childPriceGroup];

    frameworkReads.accountPriceGroups = association;
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    // The subscription group took part in the selection, so the append happened.
    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // ★★ AND IT LANDED IN THE EXACT ARRAY INSTANCE THE DOUBLE HANDED OUT, not in a copy the
    // service kept to itself. `toBe` on the identity plus the grown length is what separates
    // "appended into the live association" from "appended into a private merged list".
    expect(frameworkReads.accountPriceGroups).toBe(association);
    expect(association).toHaveLength(2);
    expect(association).toStrictEqual([direct.childPriceGroup, viaSubscription.childPriceGroup]);

    // The SOURCE collection is a different matter: the subscription statement's own result array
    // is read and never written, so it stays exactly as it was. Asserting both directions keeps
    // the case honest - one array is mutated by design, the other must not be.
    expect(repository.subscriptionPriceGroups).toHaveLength(1);
    expect(repository.subscriptionPriceGroups).toStrictEqual([viaSubscription.childPriceGroup]);
  });

  it('★★★ the append is observable by getBestPriceGroupDetailsBasedOnSkuAndAccount [L351]', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]: [L351] reads
    // ONLY `account.getPriceGroups()` and never issues the subscription statement. So whether it
    // sees a subscription price group at all depends on whether `calculateSkuPriceBasedOnAccount`
    // happened to run earlier in the same request for the same account and polluted the
    // association. That request-order dependence IS the defect, and this case pins it by asking
    // the same question twice around one intervening call.
    //
    // Preserved deliberately; do not fix without a product decision.
    const sku = aPricedSku('leak-best-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'leak-best-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    // The direct association is EMPTY, so on its own [L351] can find nothing.
    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const before = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(before.priceGroup).toBeUndefined();
    expect(before.price.equals(sku.getPrice())).toBe(true);

    // One intervening call on the OTHER method - the only one that consults the subscription
    // statement - and the association is no longer empty.
    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    const after = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    // ★★★ SAME METHOD, SAME SKU, SAME ACCOUNT, DIFFERENT ANSWER. This is the pricing output the
    // superseded JUDGMENT CALL claimed was "unchanged either way".
    expect(after.priceGroup).toBe(viaSubscription.childPriceGroup);
    expect(after.price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(after.price.equals(before.price)).toBe(false);

    // And [L351] still never issued the subscription statement itself - exactly one such read
    // occurred, and it belongs to the intervening `calculateSkuPriceBasedOnAccount` call.
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
  });

  it('★★★ the append is observable by updateOrderAmountsWithPriceGroups [L365]', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L365 vs L271-L298]: [L365] gates the
    // whole order pass on `arrayLen(order.getAccount().getPriceGroups())`, the DIRECT association
    // only. The neighbouring case in
    // `describe('updateOrderAmountsWithPriceGroups: what it refuses to process')` pins the
    // unpolluted half - a subscription-only account gets NO processing. This case pins the other
    // half: once the association HAS been polluted, the same order does get processed, and by the
    // subscription group.
    //
    // Preserved deliberately; do not fix without a product decision.
    const order = makeOrderViewFixture({ idPrefix: 'leak-ord-', accountID: ACCOUNT_ID });
    const flat = aFlatPriceGroup('pg-leak-order-flat', ROUNDED_BELOW_BASE);
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [flat];

    // The gate at [L365] closes: nothing in the direct association.
    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);

    const firstItem = requirePresent(order.orderItems[0], 'golden order item 0');

    // One call that DOES consult the subscription statement, for one of the order's own SKUs.
    await service.calculateSkuPriceBasedOnAccount(firstItem.sku, ACCOUNT_ID);

    const afterPollution = await service.updateOrderAmountsWithPriceGroups(order);

    // ★★★ THE GATE NOW OPENS AND THE ORDER IS REPRICED. The golden order's first two items are
    // priced above 9.00 and the third below it, so two intents appear - the same split the
    // direct-association case asserts.
    expect(afterPollution).toHaveLength(2);
    expect(afterPollution.map((intent) => intent.orderItemID)).toContain(firstItem.orderItemID);
    expect(afterPollution.every((intent) => intent.priceGroupID === flat.getPriceGroupID())).toBe(
      true,
    );
  });

  it('★★ repeated calls do NOT compound: the [L281] guard holds across calls', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L281]: `arrayFind` is consulted before every
    // append, so a second call finds the member already present and adds nothing. Without that
    // guard the association would grow without bound over a request, and the memoized adapter array
    // makes that reachable - which is precisely why the guard has to be asserted ACROSS calls and
    // not only within one.
    const sku = aPricedSku('nocompound-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'nocompound-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    const association: PriceGroup[] = [];

    frameworkReads.accountPriceGroups = association;
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);
    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);
    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    expect(association).toHaveLength(1);
    expect(association).toStrictEqual([viaSubscription.childPriceGroup]);

    // Three calls, three subscription reads - the guard suppresses the APPEND, not the statement.
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID, ACCOUNT_ID, ACCOUNT_ID]);
  });

  it('★★★ a NEW request starts clean: the pollution does not survive the scope', async () => {
    // ★★ THE OTHER HALF OF THE SAFETY ARGUMENT. Reproducing a request-lifetime mutation is only
    // acceptable because the association is instance state on a collaborator built per request -
    // see `SqlPriceGroupFrameworkReads.accountPriceGroupAssociations` in
    // `src/handlers/bootstrap.ts`. If it were module state it would survive on a warm Lambda
    // container and carry one account's subscription pricing into an unrelated later request.
    //
    // `makeSubject()` builds a fresh service over fresh doubles, which is this suite's stand-in for
    // a new request scope. Asking the SAME question that answered `ROUNDED_BELOW_BASE` a moment ago
    // must now answer the SKU's own price again.
    const sku = aPricedSku('fresh-scope-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'fresh-scope-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });

    const first = makeSubject();

    first.frameworkReads.accountPriceGroups = [];
    first.repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    await first.service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    const polluted = await first.service.getBestPriceGroupDetailsBasedOnSkuAndAccount(
      sku,
      ACCOUNT_ID,
    );

    expect(polluted.priceGroup).toBe(viaSubscription.childPriceGroup);

    // A SECOND scope, same account identifier, same SKU, and NO intervening
    // `calculateSkuPriceBasedOnAccount`.
    const second = makeSubject();

    second.frameworkReads.accountPriceGroups = [];
    second.repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const clean = await second.service.getBestPriceGroupDetailsBasedOnSkuAndAccount(
      sku,
      ACCOUNT_ID,
    );

    expect(clean.priceGroup).toBeUndefined();
    expect(clean.price.equals(sku.getPrice())).toBe(true);
    expect(second.repository.subscriptionReads).toStrictEqual([]);
  });
});

describe('calculateSkuPriceBasedOnAccount: how a duplicate price group is detected', () => {
  it('★★ collapses two DISTINCT instances that name the SAME stored row', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L281]: the legacy guard is
    // `!arrayFind(priceGroups, obj)`, which compares OBJECTS. Under Hibernate that was
    // sufficient AND equivalent to comparing keys, because the session guaranteed one instance
    // per row - `arrayFind` could not be handed two objects for the same price group.
    //
    // With the session gone that guarantee is gone, and the two readings diverge: a subscription
    // read and a direct read are separate queries and produce separate instances. The shipped
    // port compares the KEY, which is what preserves the legacy OUTCOME - the row is counted
    // once - rather than the legacy MECHANISM, which would count it twice and could pick a
    // different price depending on which instance answered.
    const sku = aPricedSku('dup-sku-');
    const first = makePriceGroupFixtures({
      idPrefix: 'dup-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '15.00',
    });
    const second = makePriceGroupFixtures({
      idPrefix: 'dup-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '3.00',
    });
    const { service, repository, frameworkReads } = makeSubject();

    // Same stored row, two instances, two different resolved prices.
    expect(second.childPriceGroup.getPriceGroupID()).toBe(first.childPriceGroup.getPriceGroupID());
    expect(second.childPriceGroup).not.toBe(first.childPriceGroup);

    frameworkReads.accountPriceGroups = [first.childPriceGroup];
    repository.subscriptionPriceGroups = [second.childPriceGroup];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    // The DIRECT instance's price stands and the duplicate never contributes, so the cheaper
    // `3.00` is NOT reachable.
    expect(price.equals(Money.fromDecimalString('15.00'))).toBe(true);
    expect(price.equals(Money.fromDecimalString('3.00'))).toBe(false);
  });

  it('★ keeps BOTH of two UNSAVED price groups, because neither carries a key to compare', async () => {
    // The fallback arm. `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] means an unpersisted
    // price group has NO identity to match on, so key comparison would wrongly collapse every
    // unsaved group into one. Instance identity is the only honest test there, and it is exactly
    // what `arrayFind` did.
    const sku = aPricedSku('unsaved-sku-');
    const firstUnsaved = aFlatPriceGroup(UNSAVED_RATE_ID, '3.00', 'pgr-unsaved-a');
    const secondUnsaved = aFlatPriceGroup(UNSAVED_RATE_ID, '1.00', 'pgr-unsaved-b');
    const { service, repository, frameworkReads } = makeSubject();

    expect(firstUnsaved.getPriceGroupID()).toBe('');
    expect(secondUnsaved.getPriceGroupID()).toBe('');
    expect(firstUnsaved).not.toBe(secondUnsaved);

    frameworkReads.accountPriceGroups = [firstUnsaved];
    repository.subscriptionPriceGroups = [secondUnsaved];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    // Both took part, so the cheaper of the two wins.
    expect(price.equals(Money.fromDecimalString('1.00'))).toBe(true);
  });
});

describe('calculateSkuPriceBasedOnAccount: the subscription reach-through', () => {
  it('★★ reads the ONE subscription statement, read-only, and lets its groups price the SKU', async () => {
    // LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L52]: this is a DOCUMENTED, READ-ONLY
    // reach-through into out-of-scope subscription tables - `SwSubsUsageBenefitAccount`,
    // `SwSubsUsageBenefit`, `SwSubsUsageBenefitPriceGroup`, `SwSubsUsage`,
    // `SwSubscriptionStatus` and `SwType`. The DAO declares EXACTLY ONE function and this is
    // it, called from [model/service/PriceGroupService.cfc:L277].
    // NO subscription business logic is ported and none is asserted here: the port answers price
    // groups and the service treats them as price groups. Which accounts hold which benefits,
    // whether a usage is active, and how a benefit maps to a group are all decided by the
    // statement, and the statement is pinned in `tests/integration/repositories/` (see P5 at the
    // head of this file).
    const sku = aPricedSku('subs-sku-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    // The account holds NO direct price group at all, so anything but the base price can only
    // have come through the subscription read.
    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // Read once, for this account, and nothing was written anywhere.
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([]);
  });
});

describe('calculateSkuPriceBasedOnCurrentAccount: the ambient scope is an explicit parameter', () => {
  // CFML parity [model/service/PriceGroupService.cfc:L262-L268]: the legacy body reads ambient
  // request state through the Slatwall-scope accessor at L263 and the Hibachi-scope accessor at
  // L264 - two differently-named accessors for the SAME scope, which is a live inconsistency in
  // the source rather than two different reads. Transformation rule T6 replaces both with an
  // explicit context parameter, which also normalises the legacy naming inconsistency.
  //
  // Neither accessor name is transcribed here; see the note at the head of this file for why.
  // The two locators carry the fact, and the assertions below carry the consequence: there is
  // no ambient state left to reach for, so the caller must say which account it means.

  it('★★ delegates to the account path when the context carries an identifier', async () => {
    const sku = aPricedSku('ctx-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'ctx-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const context: CurrentAccountContext = { accountID: ACCOUNT_ID };
    const price = await service.calculateSkuPriceBasedOnCurrentAccount(sku, context);

    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // The identifier the CALLER supplied is the one both reads were issued for.
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
  });

  it('★★ falls back to the SKU price for a guest, issuing NO read at all [L266]', async () => {
    // Legacy [L263] gates the whole body on the logged-in flag and [L266] returns
    // `sku.getPrice()` otherwise. An empty context is the ported spelling of "not logged in",
    // and the important half is the SECOND assertion: a port that read the account association
    // for an absent identifier would query on every anonymous price lookup.
    const sku = aPricedSku('guest-sku-');
    const { service, repository, frameworkReads } = makeSubject();

    const context: CurrentAccountContext = {};
    const price = await service.calculateSkuPriceBasedOnCurrentAccount(sku, context);

    expect(price).toBe(sku.getPrice());
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(repository.subscriptionReads).toStrictEqual([]);
  });
});

describe('getBestPriceGroupDetailsBasedOnSkuAndAccount: the empty-string sentinel and the strict <', () => {
  it('★★ answers the base price with NO price group when nothing beats it [L347-L348]', async () => {
    // Legacy [L347-L348] seeds `{price = sku.getPrice(), priceGroup = ""}` - an EMPTY STRING,
    // not a null and not a price group. That sentinel is what [L369] later tests with
    // `isObject(...)`, so the two lines are one mechanism. The ported shape carries `undefined`
    // in that slot, and the shape is asserted whole so an extra key would fail.
    const sku = aPricedSku('best-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'best-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_ABOVE_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(details).toStrictEqual({ price: sku.getPrice(), priceGroup: undefined });
    expect(Object.keys(details)).toStrictEqual(['price', 'priceGroup']);
  });

  it('★★ an EQUAL price does NOT displace the base, because [L355] is a strict <', async () => {
    // The distinction is not cosmetic. A `<=` would attach a price group to an order item whose
    // price is unchanged, and the promotion pass then reads that attachment to choose its
    // discount base [model/service/PromotionService.cfc:L241-L252] - so an off-by-one-operator
    // here changes a discount, not just a label.
    const sku = aPricedSku('besteq-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'besteq-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_EQUAL_TO_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    // The premise: the price group resolves EXACTLY the base price.
    expect(
      service
        .calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup)
        .equals(Money.fromDecimalString(SKU_BASE_PRICE)),
    ).toBe(true);

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(details.priceGroup).toBeUndefined();
    expect(details.price.equals(Money.fromDecimalString(SKU_BASE_PRICE))).toBe(true);
  });

  it('reports the winning price group when one genuinely undercuts the base', async () => {
    const sku = aPricedSku('bestwin-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'bestwin-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(details.priceGroup).toBe(graph.childPriceGroup);
    expect(details.price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
  });

  it('★ consults ONLY the direct association - no subscription reach-through here', async () => {
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]: this method reads
    // `account.getPriceGroups()` and STOPS. Its sibling `calculateSkuPriceBasedOnAccount` also
    // reads the subscription statement at [L277]. Two methods that both answer "what does this
    // account pay" therefore consult different sets, and a subscription-only account is priced
    // by one and not the other. The asymmetry is in the source and is preserved; it is also the
    // seam that section 7 turns into an observable skip.
    const sku = aPricedSku('bestsub-sku-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'bestsub-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    // The cheaper subscription group is invisible from here.
    expect(details.priceGroup).toBeUndefined();
    expect(details.price.equals(sku.getPrice())).toBe(true);
    expect(repository.subscriptionReads).toStrictEqual([]);

    // And the sibling method, on the same doubles, DOES see it.
    const accountPrice = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    expect(accountPrice.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
  });
});

// ---------------------------------------------------------------------------
// 5. updateOrderAmountsWithPriceGroups - the anti-corruption boundary
//
// `updateOrderAmountsWithPriceGroups(order: OrderView): Promise<PriceGroupAppliedIntent[]>`,
// ASYNC, from [model/service/PriceGroupService.cfc:L364-L375].
//
// ★★ SIGNATURE RESHAPING #1 OF EXACTLY THREE PROJECT-WIDE IS PARTLY SPENT HERE.
// The legacy declares `public void function` and MUTATES the order aggregate in place:
// [L370] calls `setPrice(...)` and [L371] calls `setAppliedPriceGroup(...)` on the live,
// ORM-managed order item. `OrderService.cfc` and every order entity are out of scope
// (AAP 0.2.2), so the target cannot own that write. It returns INTENTS instead - the same
// decision, expressed as data - and the handler that owns the order applies them. The whole
// point of the seam is that this slice becomes independently deployable without porting
// `OrderService`; the reshaping is the price of that, and it is declared rather than absorbed.
//
// ★★★ THE CROSS-SERVICE ORDERING CONSTRAINT IS DECLARED HERE.
//   THIS PASS MUST RUN BEFORE `PromotionService.updateOrderAmountsWithPromotions`.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L241-L252]: the promotion pass selects its
// discount base from applied-price-group state that THIS pass writes. When the order item has
// no applied price group, or the reward lists the item's group as eligible, the promotion pass
// uses getPrice() with NO correction; otherwise it uses getSkuPrice() plus the L252 correction
// term. Price groups must therefore be processed first. Ordering is enforced in
// src/handlers/promotionApplicationHandler.ts and exercised in promotionService.test.ts.
//
// In the legacy system nothing enforced it: `OrderService.cfc` injects both collaborators
// [model/service/OrderService.cfc:L60-L61] and simply happened to call them in that sequence.
// Nothing in either service declared the dependency, which is why it is stated at both ends
// now. The REVERSED-ORDER difference is asserted by `promotionService.test.ts` and is
// deliberately NOT duplicated here: this file owns the producing half of the contract - that
// the applied price group is emitted at all, and under which conditions - and that half is
// what the cases below pin.
// ---------------------------------------------------------------------------

describe('updateOrderAmountsWithPriceGroups: intents, not mutation', () => {
  it('★★ returns intents carrying the new price and the applied price group, keyed by order item', async () => {
    const flat = aFlatPriceGroup('pg-order-flat', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord1-', accountID: ACCOUNT_ID });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    const intents = await service.updateOrderAmountsWithPriceGroups(order);

    // The golden order's three items are priced 19.99, 17.99 and 8.50 [orderViewFixtures], and
    // the flat group resolves 9.00 for every SKU. So the first two move down and the third does
    // not - which covers the "lower" and the "higher" arms of [L369] in one call.
    expect(intents).toHaveLength(2);

    const [firstIntent, secondIntent] = intents;
    const first = requirePresent(firstIntent, 'the first applied-price-group intent');
    const second = requirePresent(secondIntent, 'the second applied-price-group intent');
    const [item0, item1, item2] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');
    const secondItem = requirePresent(item1, 'golden order item 1');
    const thirdItem = requirePresent(item2, 'golden order item 2');

    // ★★ THE INTENT CARRIES BOTH HALVES OF WHAT [L370-L371] USED TO WRITE, and the order item
    // is named by an OPAQUE identifier rather than by a reference to an out-of-scope entity.
    expect(first).toStrictEqual({
      orderItemID: firstItem.orderItemID,
      price: Money.fromDecimalString(ROUNDED_BELOW_BASE),
      priceGroupID: flat.getPriceGroupID(),
    });
    expect(second.orderItemID).toBe(secondItem.orderItemID);
    expect(second.priceGroupID).toBe(flat.getPriceGroupID());
    expect(second.price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // The item whose price is already below the group price gets nothing at all.
    expect(intents.map((intent) => intent.orderItemID)).not.toContain(thirdItem.orderItemID);
    expect(thirdItem.price.isLessThan(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
  });

  it('★★ mutates NOTHING on the order view - it is read-only at this boundary', async () => {
    const flat = aFlatPriceGroup('pg-order-readonly', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord2-', accountID: ACCOUNT_ID });
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    const before = snapshotOrderItems(order);
    const itemsArray = order.orderItems;

    const intents = await service.updateOrderAmountsWithPriceGroups(order);

    // Intents WERE produced, so the pass definitely did its work rather than returning early.
    expect(intents).toHaveLength(2);

    // And not one order-item field moved. `price` and `skuPrice` are the two the legacy touched
    // [L370] and read [model/service/PromotionService.cfc:L241-L252]; `appliedPriceGroup` is the
    // one [L371] set.
    expect(snapshotOrderItems(order)).toStrictEqual(before);
    expect(order.orderItems).toBe(itemsArray);
    expect(order.orderItems).toHaveLength(3);

    // No order persistence of any kind was attempted either - there is no port for it, and
    // this states that the pass did not reach for a price-group write as a substitute.
    expect(repository.rateSaves).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([]);
  });
});

describe('updateOrderAmountsWithPriceGroups: prices only ever move DOWN', () => {
  it('★★ an EQUAL resolved price produces NO intent, because [L369] is a strict <', async () => {
    const flat = aFlatPriceGroup('pg-order-equal', ROUNDED_EQUAL_TO_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord3-', accountID: ACCOUNT_ID });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    const [item0] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');

    // The premise: item 0's price is EXACTLY what the group resolves.
    expect(firstItem.price.equals(Money.fromDecimalString(ROUNDED_EQUAL_TO_BASE))).toBe(true);

    const intents = await service.updateOrderAmountsWithPriceGroups(order);

    // Nothing for item 0 because it is equal, and nothing for items 1 and 2 because 19.99 is
    // ABOVE their prices of 17.99 and 8.50. Both wrong-direction arms in one assertion.
    expect(intents).toStrictEqual([]);
  });

  it('★★ a resolved price with NO winning price group produces no intent [L369 isObject]', async () => {
    // [L369] is `price < getPrice() AND isObject(priceGroupDetails.priceGroup)`. The second
    // conjunct is not redundant: `resolveBestPriceGroupDetails` seeds the `""` sentinel at
    // [L347-L348] and only replaces it when a group actually wins, so a cheaper SKU price on a
    // dearer order item satisfies the first conjunct with no group to attach.
    const rateless = aPriceGroupNamed('pg-order-rateless');
    const order = makeOrderViewFixture({
      idPrefix: 'ord4-',
      accountID: ACCOUNT_ID,
      // Item 0's own price is raised ABOVE its SKU price, so the comparison passes on price
      // alone. The applied-price-group key is left OMITTED rather than set to `undefined`,
      // because `exactOptionalPropertyTypes` distinguishes the two and the fixture detects
      // presence with `Object.hasOwn`.
      itemOverrides: [{ price: Money.fromDecimalString('30.00') }],
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [rateless];

    const [item0] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');

    // The first conjunct WOULD pass.
    expect(firstItem.sku.getPrice().isLessThan(firstItem.price)).toBe(true);
    expect(service.getRateForSkuBasedOnPriceGroup(firstItem.sku, rateless)).toBeUndefined();

    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);

    // And the SAME order does produce an intent once a group can actually win, so the empty
    // result above is attributable to the object check rather than to the fixture.
    frameworkReads.accountPriceGroups = [aFlatPriceGroup('pg-order-wins', ROUNDED_BELOW_BASE)];

    const withWinner = await service.updateOrderAmountsWithPriceGroups(order);

    expect(withWinner.map((intent) => intent.orderItemID)).toContain(firstItem.orderItemID);
  });
});

describe('updateOrderAmountsWithPriceGroups: what it refuses to process', () => {
  it('★★ SKIPS an account whose price groups arrive ONLY via the subscription reach-through', async () => {
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L365 vs L271-L298]: [L365] gates the whole
    // method on `arrayLen(order.getAccount().getPriceGroups())` - the DIRECT association only. The
    // subscription statement at [L277] is never consulted from here. So an account that holds a
    // price group solely through a subscription benefit gets NO price-group processing on its
    // order, even though asking `calculateSkuPriceBasedOnAccount` for the very same SKU returns
    // the discounted price.
    //
    // This is a genuine behavioural asymmetry in the source, not a porting artifact, and it is
    // preserved. Both sides are asserted below so a reader can see it rather than take it on
    // trust; the reasoning for leaving it alone is that closing it would start applying
    // subscription pricing to orders that never received it.
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'subsonly-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const flat = aFlatPriceGroup('pg-subsonly-flat', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord5-', accountID: ACCOUNT_ID });
    const { service, repository, frameworkReads } = makeSubject();

    // Direct association EMPTY; subscription read would answer a cheaper group.
    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [flat];

    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);

    // It read the direct association and then STOPPED - the subscription statement was never
    // issued, which is the observable form of the asymmetry.
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
    expect(repository.subscriptionReads).toStrictEqual([]);

    // The other side of the contrast, on the same doubles and the same SKU.
    const [item0] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');
    const accountPrice = await service.calculateSkuPriceBasedOnAccount(firstItem.sku, ACCOUNT_ID);

    expect(accountPrice.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);

    // Referenced so the unused-locals gate cannot mask a fixture that stopped building the
    // cheaper graph this case depends on.
    expect(viaSubscription.roundValueDoubleAnswer.toFixed2()).toBe(ROUNDED_BELOW_BASE);
  });

  it('★ returns an empty intent list for a guest order, issuing NO read', async () => {
    // An order with no account cannot have a price group. The legacy reached
    // `order.getAccount()` unguarded at [L365], which is safe only because the order aggregate
    // always carried one; the ported view models the absence explicitly, and the pass must not
    // query on its way to discovering it.
    const order = makeOrderViewFixture({ idPrefix: 'ord6-', accountID: undefined });
    const { service, repository, frameworkReads } = makeSubject();

    expect(order.accountID).toBeUndefined();

    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(repository.subscriptionReads).toStrictEqual([]);
  });

  it('reads the account association ONCE for the whole order, not once per item', async () => {
    // Not a claim about cost - it is a claim about CONSISTENCY. Legacy read the association once
    // at [L365] and every item was priced against that same set, so a port that re-read per item
    // could price two items of one order against two different sets.
    const flat = aFlatPriceGroup('pg-order-once', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord7-', accountID: ACCOUNT_ID });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    await service.updateOrderAmountsWithPriceGroups(order);

    expect(order.orderItems).toHaveLength(3);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
  });
});

// ---------------------------------------------------------------------------
// 6. updatePriceGroupSKUSettings - the admin grid's one write path
//
// `updatePriceGroupSKUSettings(data): Promise<void>`, ASYNC, from
// [model/service/PriceGroupService.cfc:L184-L227]. Three nested gates and two shapes:
//
//   L189-L190  unless `priceGroupRateId` is the `"new amount"` sentinel, DELETE the amount key
//   L194       do nothing at all when `priceGroupRateId` is empty
//   L197       an empty `skuId` means the PRODUCT-level shape
//   L199       ... unless `priceGroupRateId` is `"inherit"`, which means "do nothing"
//   L205-L206  load the rate, load the product, attach, save
//   L219-L221  otherwise load the SKU and the rate, attach, save
// ---------------------------------------------------------------------------

/** The settings payload, with `resolvedSku` supplied because the shape requires the key. */
function aSettingsPayload(
  priceGroupRateId: string,
  skuId: string,
  resolvedSku: Sku | undefined,
  amount?: string,
): {
  readonly priceGroupRateId: string;
  readonly productId: string;
  readonly skuId: string;
  readonly resolvedSku: Sku | undefined;
  readonly amount?: string;
} {
  const base = {
    priceGroupRateId,
    productId: 'prd-settings',
    skuId,
    resolvedSku,
  } as const;

  // `amount` is OMITTED rather than assigned `undefined`: `exactOptionalPropertyTypes` treats
  // the two as different types, and the shipped `buildRateSavePayload` distinguishes them.
  return amount === undefined ? base : { ...base, amount };
}

describe('updatePriceGroupSKUSettings: the gates that do nothing', () => {
  it('★ an EMPTY priceGroupRateId short-circuits before any read [L194]', async () => {
    const { service, repository, productRepository } = makeSubject();

    await service.updatePriceGroupSKUSettings(aSettingsPayload('', '', undefined));

    expect(repository.rateLookups).toStrictEqual([]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
  });

  it('★ the "inherit" sentinel on the PRODUCT shape does nothing [L199]', async () => {
    // "Inherit" means the product is to take whatever its price group's parent offers, which is
    // expressed by the ABSENCE of a rate row - so the correct action is no action. The gate is
    // `NEQ "inherit"`, so the whole attach-and-save block is skipped.
    const { service, repository, productRepository } = makeSubject();

    await service.updatePriceGroupSKUSettings(aSettingsPayload('inherit', '', undefined));

    expect(repository.rateLookups).toStrictEqual([]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
  });

  it('the "inherit" sentinel does NOT short-circuit the SKU shape', async () => {
    // [L199] sits INSIDE the `skuId EQ ""` branch [L197], so it governs only the product shape.
    // A SKU-level submission carrying `"inherit"` falls through to [L219-L221] and is treated as
    // an ordinary rate identifier, which is easy to get wrong when flattening the nesting.
    const sku = aPricedSku('inh-sku-');
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await service.updatePriceGroupSKUSettings(aSettingsPayload('inherit', 'sku-1', sku));

    expect(repository.rateLookups).toStrictEqual(['inherit']);
    expect(repository.rateSaves).toHaveLength(1);
  });
});

describe('updatePriceGroupSKUSettings: the PRODUCT shape [L205-L206]', () => {
  it('★★ loads the rate and the product, attaches the product, and saves once', async () => {
    const product = makeProductFixture({ idPrefix: 'setprod-' });
    const rate = aRate();
    const { service, repository, productRepository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;
    productRepository.productLookupResult = product;

    await service.updatePriceGroupSKUSettings(aSettingsPayload(SAVED_RATE_ID, '', undefined));

    expect(repository.rateLookups).toStrictEqual([SAVED_RATE_ID]);
    expect(productRepository.productLookups).toStrictEqual(['prd-settings']);
    expect(repository.rateSaves).toHaveLength(1);

    const written = requirePresent(repository.rateSaves[0], 'the recorded rate save').rate;

    expect(written).toBe(rate);
    expect(written.getProducts()).toStrictEqual([product]);
    expect(written.getSkus()).toStrictEqual([]);
  });

  it('★ raises when the product cannot be found [L206]', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L206]: the framework accessor answers null
    // on a miss and `addProduct(null)` then raises inside the entity. The port raises at the same
    // point rather than skipping the attach, because skipping it would report success while
    // silently discarding the admin's edit.
    const rate = aRate();
    const { service, repository, productRepository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;
    productRepository.productLookupResult = undefined;

    await expect(
      service.updatePriceGroupSKUSettings(aSettingsPayload(SAVED_RATE_ID, '', undefined)),
    ).rejects.toThrow(/prd-settings/);

    expect(repository.rateSaves).toStrictEqual([]);
  });
});

describe('updatePriceGroupSKUSettings: the SKU shape [L219-L221]', () => {
  it('★★ attaches the SKU and saves, without reaching the product repository at all', async () => {
    const sku = aPricedSku('setsku-');
    const rate = aRate();
    const { service, repository, productRepository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await service.updatePriceGroupSKUSettings(aSettingsPayload(SAVED_RATE_ID, 'sku-1', sku));

    expect(repository.rateLookups).toStrictEqual([SAVED_RATE_ID]);
    expect(productRepository.productLookups).toStrictEqual([]);

    const written = requirePresent(repository.rateSaves[0], 'the recorded rate save').rate;

    expect(written.getSkus()).toStrictEqual([sku]);
    expect(written.getProducts()).toStrictEqual([]);
  });

  it('★ raises when the SKU cannot be resolved [L219, L221]', async () => {
    // The SKU arrives as a BOUNDARY INPUT rather than through a port, because no port in the
    // slice publishes a SKU load-by-primary-key and none was invented for this one call
    // (dependency discipline D4). An unresolved SKU therefore surfaces here, at the same point
    // the legacy `addSku(null)` surfaced it.
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await expect(
      service.updatePriceGroupSKUSettings(
        aSettingsPayload(SAVED_RATE_ID, 'sku-missing', undefined),
      ),
    ).rejects.toThrow(/sku-missing/);

    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('creates a fresh unsaved rate when the identifier matches nothing, and the save is REFUSED', async () => {
    // Legacy [L220] used the framework entity accessor, which MINTS a new transient entity on a
    // miss rather than answering null. A brand-new rate carries no price group, no amount type
    // and no amount, so `model/validation/PriceGroupRate.json`'s three save-context rules all
    // fail and `super.save` [L404] returns the entity unpersisted - which is why the admin grid
    // silently declined a row it could not identify.
    const sku = aPricedSku('setnew-');
    const { service, repository } = makeSubject();

    repository.rateLookupResult = undefined;

    await service.updatePriceGroupSKUSettings(aSettingsPayload('pgr-unknown', 'sku-1', sku));

    expect(repository.rateLookups).toStrictEqual(['pgr-unknown']);
    expect(repository.rateSaves).toStrictEqual([]);
  });
});

describe('updatePriceGroupSKUSettings: the amount key, and DEFECT 30 from this entry point', () => {
  it('★★ DELETES a submitted amount unless the sentinel matches [L189-L190]', async () => {
    // The deletion is protective, not incidental: the admin grid posts its whole row, so a stale
    // `amount` field would otherwise overwrite the persisted rate on every unrelated edit. The
    // observable is that the persisted amount SURVIVES a submission carrying a different one.
    const sku = aPricedSku('setamt-');
    const rate = aRate({ amount: Money.fromDecimalString(FIXTURE_RATE_AMOUNT) });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await service.updatePriceGroupSKUSettings(
      aSettingsPayload(SAVED_RATE_ID, 'sku-1', sku, '12.50'),
    );

    const written = requirePresent(repository.rateSaves[0], 'the recorded rate save').rate;

    expect(written.getAmount()?.toFixed2()).toBe(FIXTURE_RATE_AMOUNT);
  });

  it('★★ the "new amount" sentinel reaches DEFECT 30 from HERE too, byte-for-byte', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: the 'new amount' branch calls
    // clearAmounts() on the service, a method that does not exist anywhere in the codebase, so it
    // reaches the missing-method throw at org/Hibachi/HibachiService.cfc:L280.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★ DRIFT RECORDED: the shipped port raises the SERVICE-level call through the same
    // `onMissingMethod` reproduction it uses for the entity-level one at
    // [org/Hibachi/HibachiEntity.cfc:L565], because both throw sites carry identical text -
    // `You have called a method #arguments.missingMethodName#() which does not exists in the
    // #getClassName()# entity.` The two defects are still kept apart, here and in section 3, by
    // the LOCATOR each message carries: this one names [L400] and `clearAmounts`, defect 29 names
    // [L243] and `getAmountRepresentation`.
    //
    // The sentinel is matched BYTE-FOR-BYTE: lowercase `new`, one space, lowercase `amount`. It is
    // spelled out in full below rather than built from parts, so a reader can compare it against
    // [L189] and [L399] directly.
    const sku = aPricedSku('setsent-');
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await expect(
      service.updatePriceGroupSKUSettings(aSettingsPayload('new amount', 'sku-1', sku, '12.50')),
    ).rejects.toThrow(/clearAmounts/);

    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('★ near-miss spellings of the sentinel are ORDINARY rate identifiers', async () => {
    // Case, spacing and wording are all load-bearing at [L189] and [L399], and CFML's `EQ` is
    // case-INSENSITIVE - so `"New Amount"` IS the sentinel while `"new_amount"` is not. Both
    // halves are asserted, because a port that lower-cased the comparison away would break the
    // first and a port that compared with `===` would break it differently.
    const sku = aPricedSku('setnear-');
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    // Not the sentinel: an underscore instead of a space. Treated as a rate identifier, so the
    // save proceeds.
    await service.updatePriceGroupSKUSettings(aSettingsPayload('new_amount', 'sku-1', sku));

    expect(repository.rateSaves).toHaveLength(1);
    expect(repository.rateLookups).toStrictEqual(['new_amount']);

    // IS the sentinel, differing only in case, which CFML's `EQ` ignores.
    await expect(
      service.updatePriceGroupSKUSettings(aSettingsPayload('New Amount', 'sku-1', sku)),
    ).rejects.toThrow(/clearAmounts/);

    expect(repository.rateSaves).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. savePriceGroupRate - the ONE write, and what has to happen before it
//
// `savePriceGroupRate(priceGroupRate, data?): Promise<PriceGroupRate>`, ASYNC, from
// [model/service/PriceGroupService.cfc:L397-L446]. The component's only Save Override.
//
// Every case in this section is carried forward from the revision of this file that covered
// only the two write methods. Nothing was dropped: the eleven read methods were ADDED around
// them rather than substituted for them.
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: the single write', () => {
  it('★★ writes exactly once, and AFTER the reconciliation rather than before it', async () => {
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
  it('★★ writes a submitted amount onto the rate before persisting it', async () => {
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

  it('★ refuses a non-numeric amount, and writes nothing at all', async () => {
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
  it('★★ strips the saved rate’s members from a sibling AND sends that sibling to be written', async () => {
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

  it('★★ demotes a rival global rate, so the global fallback stays deterministic', async () => {
    // [L429-L431]. `getGlobalPriceGroupRate()` [model/entity/PriceGroup.cfc:L83-L90] scans
    // for the rate whose flag is set; two set flags make the price it returns depend on
    // association order. That accessor is FIRST-match while the service's own global loop is
    // LAST-match, which is pinned in section 1 - so with two flags set the two disagree, and
    // demoting the rival is what keeps them from disagreeing.
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

  it('★ sends NOTHING when no sibling actually changed', async () => {
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
  it('★★ empties all SIX of the saved rate’s own collections', async () => {
    // [L437-L442]. A global rate applies to everything, so its own inclusion and
    // exclusion filters are meaningless - and three of these six were unreachable until
    // the entity declared their generated setters. Note the source's own casing at [L439]
    // and [L442], `setSKUs` and `setExcludedSKUs`, against `setProducts` beside them; the
    // ported entity normalises the spelling and the BEHAVIOUR is what is pinned here.
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

  it('★ strips the siblings BEFORE emptying its own collections, not after', async () => {
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
// The preserved legacy failures
// ---------------------------------------------------------------------------

describe('savePriceGroupRate: preserved legacy failures', () => {
  it('★★ DEFECT 30 - throws on the "new amount" sentinel, because clearAmounts always did', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: the 'new amount' branch calls
    // clearAmounts() on the service, a method that does not exist anywhere in the codebase, so it
    // reaches the missing-method throw at org/Hibachi/HibachiService.cfc:L280.
    // Preserved deliberately; do not fix without a product decision.
    //
    // ★★ THIS IS DEFECT 30 AND IT IS KEPT DISTINCT FROM DEFECT 29. Defect 29 is
    // `getAmountRepresentation()` at [L243], reached from the READ path and pinned in section 3
    // against the ENTITY-level throw at [org/Hibachi/HibachiEntity.cfc:L565]. Both throw sites
    // carry identical message text, so the LOCATOR in the assertion is the only thing that tells
    // them apart: this one names [L400] and `clearAmounts`, that one names [L243] and
    // `getAmountRepresentation`. They are two different absent methods with two different blast
    // radii - this one breaks exactly the admin's "create a new amount" workflow while every
    // other rate save completes, and that one breaks the grid on every load.
    //
    // The sentinel is matched byte-for-byte: lowercase `new`, one space, lowercase `amount`.
    const { service, repository } = makeSubject();
    const savedRate = aRate();

    aPriceGroupHolding(savedRate);

    await expect(
      service.savePriceGroupRate(savedRate, { priceGroupRateId: 'new amount' }),
    ).rejects.toThrow(/clearAmounts/);
    await expect(
      service.savePriceGroupRate(savedRate, { priceGroupRateId: 'new amount' }),
    ).rejects.toThrow(/L400/);
    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('★ throws when the payload is absent, because [L399] dereferences it unguarded', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L399]: `data` is declared optional but the
    // body dereferences arguments.data.priceGroupRateId unconditionally.
    // Preserved deliberately; do not fix without a product decision.
    //
    // [L397] declares `struct data` WITHOUT `required`, yet [L399] reads
    // `arguments.data.priceGroupRateId` with no guard. Both facts are preserved: the
    // parameter stays optional, and the unconditional dereference raises. The argument is
    // GENUINELY OMITTED below rather than passed as `undefined`, because
    // `exactOptionalPropertyTypes` makes those two different calls and only the omission
    // reproduces a CFML caller that left the parameter off.
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
// 8. deletePriceGroup - DEFECT 6, the detachment loop, and the ONE delegation
//
// `deletePriceGroup(priceGroup): Promise<boolean>`, ASYNC, from
// [model/service/PriceGroupService.cfc:L461-L470]. The component's only Delete Override.
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

  it('★★ empties the child collection before delegating, never after', async () => {
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

  it('★★ returns the repository refusal verbatim, and issues no second call', async () => {
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
    // In particular NO count, probe or page read is issued from here for the five
    // out-of-scope gates: they are enforced by the adapter against what is STORED, and this
    // method learns their outcome only as the boolean.
    const { service, productRepository, frameworkReads } = makeSubject();

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(true);

    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(frameworkReads.pageRecordReads).toBe(0);
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

describe('deletePriceGroup: DEFECT 6, the bounded-iteration guard', () => {
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L461-L470]: deletePriceGroup snapshots
  // getChildPriceGroups() by value at L463 and never re-reads it, so the while loop at L465 can
  // never terminate. The target retains the behaviour behind a bounded-iteration guard plus the
  // source TODO rather than silently repairing the loop.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ★ TWO REFINEMENTS TO THAT MARKER, BOTH RECORDED RATHER THAN GLOSSED.
  //
  // FIRST, the shipped module's own annotation goes further than the specification and this
  // suite follows it: `childPriceGroups` is declared `inverse="true"`
  // [model/entity/PriceGroup.cfc:L63], `removeChildPriceGroup` [L139] delegates to
  // `removeParentPriceGroup`, and [L116-L125] performs `arrayFind` then `arrayDeleteAt` on the
  // parent's own `getChildPriceGroups()`. So the array captured at [L463] IS the live inverse
  // association, not a copy of it - which is the only reason the legacy `while` ever ended. The
  // non-termination is therefore a LATENT HAZARD rather than an observed one, and saying so is
  // more useful than repeating a claim the source does not support.
  //
  // SECOND, the "source TODO" is retained in the shipped module as the LEGACY-DEFECT marker at
  // its `deletePriceGroup`, complete with the `Preserved deliberately; do not fix without a
  // product decision.` instruction and a JUDGMENT CALL note explaining that the guard is a
  // termination safeguard rather than a behaviour change. There is no bare to-do comment in the
  // shipped module, and this suite does not invent one; what it asserts is the BEHAVIOUR that
  // marker promises, which is the only part a test can hold the module to.
  //
  // ★★ AND THE PROOF IS STRUCTURAL, NEVER TEMPORAL. Nothing in this group measures elapsed
  // time, adjusts a runner deadline, or compares durations: the guard is proven by REMOVING
  // the splice that makes the loop terminate and observing the ceiling fire with a diagnosable
  // error. That is a correctness observation about a loop invariant, which is what constraint
  // C7 requires - a duration-based assertion would be inventing a non-functional requirement
  // the source never stated.

  afterEach(() => {
    // `tests/setup.ts` already restores globally; this is the suite-local restore the project's
    // spy discipline asks for, so the stub cannot outlive the case that installed it even if
    // the global hook is ever changed.
    vi.restoreAllMocks();
  });

  it('★★ TRIPS when the remove helper stops mutating the collection the loop re-tests', async () => {
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();
    const child = aChildOf(parent);
    const detach = vi.spyOn(parent, 'removeChildPriceGroup').mockImplementation(() => {
      // Deliberately does NOT splice. This is the exact hypothetical the shipped JUDGMENT CALL
      // names: an accessor that hands out a copy, or a remove helper that stops touching the
      // live array, turns [L465-L467] into a loop with no termination condition at all.
    });

    // The ceiling is DERIVED from the captured length - one child means one permitted pass - so
    // the second pass is the one that fires it. The diagnostic names the ceiling, the entity and
    // the invariant that broke, which is what makes a hang into something a reader can act on.
    await expect(service.deletePriceGroup(parent)).rejects.toThrow(/detach iterations/);

    expect(detach).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledWith(child);

    // AND NOTHING WAS DELETED. A guard that fired but still delegated would delete a price
    // group whose children were never detached, which is precisely the state
    // `model/validation/PriceGroup.json`'s `maxCollection: 0` rule exists to forbid.
    expect(repository.deletes).toStrictEqual([]);
    expect(parent.getChildPriceGroups()).toStrictEqual([child]);
  });

  it('★ names the broken invariant and the accessor responsible', async () => {
    // The message is part of the contract here, because the whole value of converting a hang
    // into a failure is that the failure explains itself. Three facts have to survive: the
    // ceiling that was exceeded, the accessor whose behaviour changed, and the legacy locator
    // the invariant belongs to.
    const { service } = makeSubject();
    const parent = aPriceGroupHolding();

    aChildOf(parent, 'pg-child-diag');
    vi.spyOn(parent, 'removeChildPriceGroup').mockImplementation(() => {
      // no-op, as above
    });

    await expect(service.deletePriceGroup(parent)).rejects.toThrow(/removeChildPriceGroup/);
    await expect(service.deletePriceGroup(parent)).rejects.toThrow(/L465-L467/);
    await expect(service.deletePriceGroup(parent)).rejects.toThrow(new RegExp(PRICE_GROUP_ID));
  });

  it('★ does NOT trip for a many-child group while the splice still happens', async () => {
    // The guard has to be invisible in ordinary use, or it becomes a bug of its own. The
    // ceiling equals the initial child count, and detaching every child takes exactly that
    // many passes - so a group at the boundary must succeed rather than fire on its last pass.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();

    for (let index = 0; index < 8; index += 1) {
      aChildOf(parent, `pg-child-bulk-${String(index)}`);
    }

    expect(parent.getChildPriceGroups()).toHaveLength(8);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    expect(parent.getChildPriceGroups()).toStrictEqual([]);
    expect(repository.deleteChildCounts).toStrictEqual([0]);
  });

  it('CFML parity note: [L466] reads an UNSCOPED `priceGroup` inside the loop', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L466]: the body writes
    // `priceGroup.removeChildPriceGroup(...)` without the `arguments.` prefix, while [L463] and
    // [L469] both spell it `arguments.priceGroup`. CFML's unscoped lookup finds the argument
    // anyway, so all three references name the same entity and the inconsistency is a SCOPING
    // ARTIFACT rather than a behavioural defect - which is why it is recorded here as a parity
    // note and not as a numbered defect.
    //
    // The observable that would distinguish the two readings is whether the loop detaches
    // children from the entity the CALLER passed, or from something else. It detaches from the
    // caller's entity, which the assertion below states directly.
    const { service } = makeSubject();
    const passedIn = aPriceGroupHolding();
    const child = aChildOf(passedIn);
    const bystander = aPriceGroupNamed('pg-bystander');
    const bystanderChild = aChildOf(bystander, 'pg-bystander-child');

    await expect(service.deletePriceGroup(passedIn)).resolves.toBe(true);

    expect(passedIn.getChildPriceGroups()).toStrictEqual([]);

    // The bystander graph is untouched, so no second entity was reached through an ambient or
    // mis-scoped reference.
    expect(bystander.getChildPriceGroups()).toStrictEqual([bystanderChild]);
    expect(child.getParentPriceGroup() === bystander).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Composition, the async boundary, and the resolver contract
// ---------------------------------------------------------------------------

describe('the service takes three explicit collaborators and nothing ambient', () => {
  it('is wired by hand, with no container, locator or request scope', () => {
    // Transformation rules T1 and T6. DI/1 0.4.2's convention scan of `property name="xService";`
    // declarations is gone, and so is the ambient request scope the pricing methods read at
    // [model/service/PriceGroupService.cfc:L262-L268]. Every collaborator is a constructor
    // argument and the account context is an explicit parameter where one is needed.
    //
    // THREE, not four. The `skuRepository` the brief for this suite anticipated is deliberately
    // NOT injected: `SkuService` owns SKU loading, and this service reads a SKU only from an
    // entity its caller already holds - which is exactly what lets the cascade stay synchronous.
    expect(PriceGroupService.length).toBe(3);
  });

  it('touches neither the product repository nor the framework reads on a rate save', async () => {
    const savedRate = aRate();
    const { service, productRepository, frameworkReads } = makeSubject();

    aPriceGroupHolding(savedRate);

    await expect(service.savePriceGroupRate(savedRate, aPayload())).resolves.toBe(savedRate);

    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(frameworkReads.pageRecordReads).toBe(0);
  });

  it('declares CurrentAccountContext as one optional opaque identifier', () => {
    // Compile-time only: the ambient scope's replacement carries an account identifier and
    // nothing else - no session, no locale, no logger. Imported from
    // `src/domain/ports/priceGroupRepository.ts` where it is published, never redeclared here.
    const empty: CurrentAccountContext = {};
    const populated: CurrentAccountContext = { accountID: ACCOUNT_ID };

    expect(Object.keys(empty)).toStrictEqual([]);
    expect(Object.keys(populated)).toStrictEqual(['accountID']);
  });

  it('★ satisfies SkuPriceGroupResolver structurally, by assignment rather than by cast', () => {
    // `SkuPriceGroupResolver` is published by `src/domain/entities/sku.ts`, NOT by the price-group
    // port - the entity declares the narrow contract it needs so that `Sku` can price itself
    // without importing a service, which is transformation rule T2 replacing the
    // `getService("priceGroupService")` locator at [model/entity/Sku.cfc:L436]. It is imported
    // from there and never redeclared.
    //
    // The conformance check is a TYPE-POSITION ASSIGNMENT. A cast would assert nothing: it would
    // compile even if the service stopped implementing a member. This assignment fails to compile
    // the day any of the three drifts.
    const { service } = makeSubject();
    const resolver: SkuPriceGroupResolver = service;

    expect(typeof resolver.calculateSkuPriceBasedOnPriceGroup).toBe('function');
    expect(typeof resolver.getRateForSkuBasedOnPriceGroup).toBe('function');
    expect(typeof resolver.calculateSkuPriceBasedOnCurrentAccount).toBe('function');
  });
});

describe('the async boundary: five synchronous methods, eight asynchronous ones', () => {
  // The rule the whole port applies (AAP 0.4.2): a method becomes async IF AND ONLY IF its legacy
  // body reaches the DAO or the ORM. A method that only walks materialized associations or does
  // arithmetic stays synchronous, because making it async to be uniform would force every caller
  // - including `Sku` itself, through the resolver contract above - to become async too.
  //
  // Enforced BY INVOCATION rather than by inspecting a signature: the synchronous five are called
  // with no `await` and their return values are used directly, and the asynchronous eight are
  // awaited. `await-thenable` rejects an `await` on a non-thenable and `no-floating-promises`
  // rejects an un-awaited promise, so the lint gate holds this section to its claim.

  it('★★ the five cascade and arithmetic methods return values, not promises', () => {
    const product = makeProductFixture({ idPrefix: 'ab-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'ab-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'ab-', skuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    const skuRate = service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup);
    const productRate = service.getRateForProductBasedOnPriceGroup(product, graph.childPriceGroup);
    const productTypeRate = service.getRateForProductTypeBasedOnPriceGroup(
      productType,
      graph.childPriceGroup,
    );
    const priceFromGroup = service.calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup);
    const priceFromRate = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithoutRoundingRule,
    );

    expect(skuRate).toBeInstanceOf(PriceGroupRate);
    expect(productRate).toBeInstanceOf(PriceGroupRate);
    expect(productTypeRate).toBeInstanceOf(PriceGroupRate);
    expect(priceFromGroup).toBeInstanceOf(Money);
    expect(priceFromRate).toBeInstanceOf(Money);

    // Stated the other way round too, because `toBeInstanceOf(Money)` alone would still pass for
    // a promise-returning method if the assertion were awaited by accident.
    expect(priceFromGroup).not.toBeInstanceOf(Promise);
    expect(priceFromRate).not.toBeInstanceOf(Promise);
  });

  it('★★ the eight port-reaching methods return promises', async () => {
    const sku = aPricedSku('ab2-sku-');
    const rate = aRate();
    const order = makeOrderViewFixture({ idPrefix: 'ab2-', accountID: undefined });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    // Each is awaited, which is what `no-floating-promises` requires and what proves the
    // value is thenable. The RESULTS are asserted in their own sections; what this case pins is
    // the SHAPE of the boundary.
    const results = await Promise.all([
      service.updatePriceGroupSKUSettings(aSettingsPayload('', '', undefined)),
      service.getPriceGroupDataJSON(),
      service.calculateSkuPriceBasedOnCurrentAccount(sku, {}),
      service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID),
      service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID),
      service.updateOrderAmountsWithPriceGroups(order),
      service.savePriceGroupRate(rate, aPayload()),
      service.deletePriceGroup(aPriceGroupHolding()),
    ]);

    expect(results).toHaveLength(8);

    const [settings, json, currentAccountPrice, accountPrice, details, intents, saved, deleted] =
      results;

    expect(settings).toBeUndefined();
    expect(json).toBe('{}');
    expect(currentAccountPrice).toBeInstanceOf(Money);
    expect(accountPrice).toBeInstanceOf(Money);
    expect(details).toBeDefined();
    expect(intents).toStrictEqual([]);
    expect(saved).toBe(rate);
    expect(deleted).toBe(true);
  });

  it('★ all THIRTEEN public methods exist on the instance', () => {
    // Interface parity (constraint C4) is the acceptance contract for this port, so the surface
    // is asserted as a whole rather than only implied by the cases above. Every name is the
    // legacy CFML name VERBATIM, in the source's own camelCase - not a TypeScript-idiomatic
    // rename - so a reviewer can diff this list against
    // `model/service/PriceGroupService.cfc` directly.
    const { service } = makeSubject();
    const surface = [
      'getRateForProductTypeBasedOnPriceGroup',
      'getRateForProductBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
      'updatePriceGroupSKUSettings',
      'getPriceGroupDataJSON',
      'calculateSkuPriceBasedOnCurrentAccount',
      'calculateSkuPriceBasedOnAccount',
      'calculateSkuPriceBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      'updateOrderAmountsWithPriceGroups',
      'savePriceGroupRate',
      'deletePriceGroup',
    ] as const;

    expect(surface).toHaveLength(13);
    expect(new Set(surface).size).toBe(13);

    for (const methodName of surface) {
      expect(typeof service[methodName]).toBe('function');
    }
  });
});
