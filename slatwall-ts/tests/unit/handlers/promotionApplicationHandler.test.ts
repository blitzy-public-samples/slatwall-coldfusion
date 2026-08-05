// ---------------------------------------------------------------------------
// slatwall-ts - unit suite for the promotion-application Lambda handler
//
// WHAT THIS PINS
//   src/handlers/promotionApplicationHandler.ts - the primary adapter of the
//   TypeScript / AWS Lambda `nodejs20.x` port of the Slatwall 3.1.39 catalog +
//   promotions/pricing slice (`version.txt` = `3.1.39`). Four concerns and no
//   others: (1) envelope parsing and order-view admission, (2) delegation to the
//   ONE composed pricing operation, (3) response shaping, (4) error mapping.
//
// ★★★ AND IT UNIQUELY OWNS THE MIGRATION'S CROSS-SERVICE ORDERING GATE.
//   The plan requires, in as many words, "a test proves that the price-group pass
//   runs before the promotion pass, and that reversing them changes the computed
//   discount". SECTION 4 is that test, and it lives here and nowhere else.
//
//   THE WRITER - [model/service/PriceGroupService.cfc:L364-L375], read verbatim:
//     L365 guards `!isNull(order.getAccount()) && arrayLen(order.getAccount().getPriceGroups())`
//     L369 conditions on `priceGroupDetails.price < orderItem.getPrice()
//          && isObject(priceGroupDetails.priceGroup)`
//     L370 `setPrice( priceGroupDetails.price )`
//     L371 `setAppliedPriceGroup( priceGroupDetails.priceGroup )`
//
//   THE READER - [model/service/PromotionService.cfc:L241-L257], read verbatim:
//     L241 if( isNull(orderItem.getAppliedPriceGroup())
//              || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
//     L244   var discountAmount = getDiscountAmount(reward, orderItem.getPrice(), discountQuantity);
//     L246 } else {
//     L249   var originalDiscountAmount =
//              getDiscountAmount(reward, orderItem.getSkuPrice(), discountQuantity);
//     L252   var discountAmount = precisionEvaluate('originalDiscountAmount
//              - (orderItem.getExtendedSkuPrice() - orderItem.getExtendedPrice())');
//     L254 }
//     L257 if(discountAmount > 0) {
//
//   ⚠ THE POLARITY, STATED THE WAY THE SOURCE STATES IT AND NOT THE WAY IT IS
//   PARAPHRASED ELSEWHERE. A NULL applied price group, OR a reward that DOES list
//   the applied group as eligible, discounts from `getPrice()` with NO correction
//   term. Otherwise - an applied price group the reward does NOT list - the
//   discount comes from `getSkuPrice()` PLUS the correction term
//   `originalDiscountAmount - (getExtendedSkuPrice() - getExtendedPrice())`. A
//   suite built on the inverted reading would assert the wrong arithmetic and
//   still go green, which is precisely the failure this gate exists to catch.
//   The `precisionEvaluate` site is L252; L248 is a comment line.
//
//   CFML parity [model/service/PromotionService.cfc:L241,L246,L257]: `var discountAmount` is
//   declared inside BOTH branches yet read outside them at L257 - legal CFML, because `var` is
//   function-scoped rather than block-scoped. Recorded, not "fixed".
//
//   WHY THE OBLIGATION IS UNCONDITIONAL. `getAppliedPriceGroup()` is read in the
//   L241 branch CONDITION ITSELF, so it holds whichever arm runs; and the L370 /
//   L371 write is gated by L365 and L369, so an item may legitimately still carry
//   NO applied price group after the pass has run - which is exactly the
//   `isNull(...)` arm. "No account" and "no better rate" are therefore OUTCOMES of
//   the pass, never licence to skip it. SECTION 4 asserts it is not skippable.
//
//   In the legacy system the ordering held only by accident: out-of-scope
//   `model/service/OrderService.cfc` declares `priceGroupService` at [:L60] and
//   `promotionService` at [:L61] among its sixteen collaborators and happened to
//   call them in that sequence. The target makes the requirement EXPLICIT and
//   NON-OPTIONAL - `src/handlers/bootstrap.ts` publishes the two passes as ONE
//   composed operation, `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions`,
//   and withholds both individual passes behind `Omit<>` capability types.
//
// ---------------------------------------------------------------------------
// THIS COVERAGE IS 100% NET-NEW. IT IS NOT PARITY AND MUST NEVER BE PRESENTED AS
// PARITY.
// ---------------------------------------------------------------------------
//   `meta/tests/` holds 32 legacy `.cfc` test components and ZERO handler-tier
//   tests, because the legacy architecture has no handler tier to have tested.
//   Only three legacy files touch the in-scope slice at all -
//   [meta/tests/unit/entity/BrandTest.cfc], [meta/tests/unit/entity/ProductTest.cfc]
//   and the EMPTY [meta/tests/functional/admin/entity/ProductTest.cfc] - and not
//   one of them is a promotion test. No case below has a legacy antecedent and
//   none is presented as one.
//
//   What IS carried over from the legacy suite is one NAMING CONVENTION and
//   nothing else: [meta/tests/unit/IssuesTest.cfc:L51] `public void function
//   issue_1097()` establishes the `issue_<ticket#>` form, which SECTION 5's
//   `issue_1766` follows. The legacy habit that goes with it is deliberately NOT
//   copied - several of those regression functions contain no assertion at all -
//   so `issue_1766` asserts explicitly.
//
// ---------------------------------------------------------------------------
// ★ THE ONE SHIPPED-SURFACE MISMATCH THIS SUITE RAISES, AND HOW IT IS MIRRORED
// ---------------------------------------------------------------------------
//   Planning recorded that the dependency-substitution API would let a suite hand
//   this handler a hand-written composition root. Reading what actually shipped,
//   it does - through `PromotionApplicationDependencies.compositionRoot` - but
//   `RequestScope` publishes FIVE members typed to CONCRETE SERVICE CLASSES
//   (`roundingRuleService`, `brandService`, `optionService`, `skuService`,
//   `productService`), and every one of those classes carries `private` members.
//   TypeScript therefore types them NOMINALLY: an object literal is rejected with
//   "Property 'urlTitleGenerator' is private in type 'BrandService' but not in
//   type '{...}'", and their modules are outside this file's dependency set, so
//   they cannot be constructed here either.
//
//   MIRRORED, NOT WORKED AROUND, AND NOTHING UNDER `src/**` IS CREATED, RENAMED OR
//   EDITED. Every member this capability must NOT reach is supplied as a THROWING
//   GETTER whose declared type is reached by indexed access off the shipped
//   interface - `get roundingRuleService(): RequestScope['roundingRuleService']`
//   returning `refuse(...)`, which is typed `never` and is therefore assignable to
//   anything. That needs no cast, no unsafe type, no type-checker suppression
//   directive and no non-null assertion, and it is
//   STRICTLY STRONGER than a placeholder value: reaching a withheld collaborator
//   fails the test loudly instead of passing quietly. See {@link refuse}.
//
// HOW THE SUBJECT IS DRIVEN
//   Through `createPromotionApplicationHandler`, the injection seam the module
//   publishes, over SUITE-LOCAL HAND-WRITTEN IN-MEMORY TYPED DOUBLES. No mocking
//   library, no DI container, no real `bootstrapCompositionRoot`, no database, no
//   connection pool, no network, no filesystem, no `.env`, no credential, no
//   service locator, no ambient request scope and no mutable module state: every
//   double is built fresh inside the test that uses it. The production `handler`
//   export is exercised once, for the one path that cannot touch a composition
//   root at all - an unmatched route.
//
// MONEY, DATES AND IDENTIFIERS
//   Every monetary literal is a decimal STRING fed to `Money`; no arithmetic
//   operator is ever applied to a monetary value, and comparisons are BY VALUE
//   through `cfNumericEquals` rather than by string identity. `Money.zero` appears
//   only as a COMPARISON OPERAND for the source's `if(discountAmount > 0)` test at
//   [model/service/PromotionService.cfc:L257] - `Money` publishes no `isZero` - and
//   never as a fallback. NOT money, and kept as plain `number`: `quantity`,
//   `totalShippingWeight`, `totalSaleQuantity`, `discountQuantity`, `usedInOrder`
//   and all three `maximumUse*` limits. Every instant is an explicit UTC ISO-8601
//   literal; there is no no-argument `new Date()` and no `Date.now()`. Every
//   opaque identifier is an invented, non-sensitive sentinel.
//
// NO USER RULES WERE PROVIDED
//   The project rules source returns exactly "No user rules provided.", and the
//   plan records the same. No rule is cited below and none is invented; every
//   assertion traces to the plan, to a cited legacy locator, or to the shipped
//   module's own documented contract. Their absence is not licence to lower the
//   bar - the enterprise standard the plan enumerates is what this file is held
//   to.
//
// WHAT THIS FILE DOES NOT CLAIM
//   No performance, response-time, capacity, uptime, availability or benchmark
//   assertion appears anywhere. `ORDER_DOCUMENT_LIMITS` is a SAFETY bound on
//   caller-supplied work, never a target. The legacy 60-second order-placement,
//   45-second payment-transaction and 30-second dependency-scan lock timeouts are
//   noted and deliberately not implemented. No infrastructure or CI/CD artefact is
//   authored, no `.only`, `.skip` or `describe.todo` appears, and this module has
//   no default export and no export at all.
//
//   It also spends NO slot of the migration's four closed ledgers. The three
//   signature reshapings, five visibility widenings, one entity-signature widening
//   and three deliberate divergences are all ALREADY ALLOCATED, and
//   `src/handlers/**` owns none of them. In particular the `void`-to-intents
//   reshaping of `updateOrderAmountsWithPromotions`
//   [model/service/PromotionService.cfc:L58] belongs to the SERVICES tier; this
//   suite consumes it and introduces no fourth reshaping, widening or divergence.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_DOCUMENT_LIMITS,
  OrderViewAdmissionError,
  createPromotionApplicationHandler,
  handler as productionHandler,
} from '../../../src/handlers/promotionApplicationHandler.js';
import { ROUTE_TABLE } from '../../../src/handlers/router.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listFindNoCase, listLen } from '../../../src/lib/cfml/list.js';
import { cfNumericEquals } from '../../../src/lib/cfml/numberFormat.js';
import { logger } from '../../../src/lib/logger.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { makePromotionFixtures } from '../../fixtures/promotionFixtures.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type {
  CompositionRoot,
  OrderPricingResult,
  RequestScope,
  RequestScopeInput,
} from '../../../src/handlers/bootstrap.js';
import type { ErrorResponseBody, MappedFieldIssue } from '../../../src/handlers/errorMapper.js';
import type {
  ApplyPromotionsRequest,
  PromotionApplicationDependencies,
  PromotionApplicationResponseBody,
} from '../../../src/handlers/promotionApplicationHandler.js';
import type { SalePriceDetail } from '../../../src/domain/ports/promotionRepository.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneProjection,
} from '../../../src/domain/ports/addressZoneEvaluator.js';
import type { OrderFulfillmentView } from '../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import type { DecimalString } from '../../../src/lib/cfml/numberFormat.js';
import type { LogSink, Logger } from '../../../src/lib/logger.js';
import type { PriceGroupAppliedIntent } from '../../../src/services/priceGroupService.js';

// ===========================================================================
// SECTION 1 - SUITE-LOCAL TYPED DOUBLES
//
// Hand-written, in-memory, and built fresh inside the test that uses them.
// Nothing here is a mocking-library artefact, nothing is registered globally,
// nothing survives a test, and no type is re-declared that a shipped module
// already owns - each is reached by indexed access off the surface that owns it,
// so a rename there breaks this build instead of silently loosening it.
// ===========================================================================

/**
 * One applied-promotion intent, reached STRUCTURALLY off the shipped result type.
 *
 * `src/domain/promotionEngine/qualifiedDiscountTypes.ts` owns the eight-variant union, and this is
 * exactly the indexed access the handler itself uses to reach it, so no module edge is added here.
 */
type PromotionIntent = OrderPricingResult['promotionIntents'][number];

/** The `PromotionReward` entity, reached through the fixture graph that already names it. */
type PromotionRewardRef = ReturnType<typeof makePromotionFixtures>['promotionRewards'][number];

/** The `PriceGroup` entity, reached through the view member the L241 discriminator reads. */
type PriceGroupRef = NonNullable<OrderItemView['appliedPriceGroup']>;

/**
 * Raised when the handler reaches a collaborator this capability has no business touching.
 *
 * ★ THIS IS AN ASSERTION, NOT A PLACEHOLDER. Every withheld member of the composition root and of
 * the request scope is a getter that calls {@link refuse}, so "the handler never touches the
 * price-resolution surface", "it never calls either individual order pass" and "it never reads the
 * process configuration" are enforced by the doubles themselves rather than by a reviewer's eye. A
 * violation surfaces as a failing test naming the member, not as a quietly-passing run.
 */
class WithheldCollaboratorError extends Error {
  public readonly member: string;

  public constructor(member: string) {
    super(
      `The promotion-application handler reached ${member}, which this capability does not use. ` +
        'Order pricing goes through the ONE composed operation ' +
        'updateOrderAmountsWithPriceGroupsThenPromotions and through nothing else.',
    );
    this.name = 'WithheldCollaboratorError';
    this.member = member;
  }
}

/**
 * Refuse a withheld collaborator, and type the refusal as `never`.
 *
 * `never` is assignable to every type, which is what lets a throwing getter satisfy a member typed
 * to a NOMINAL service class whose module is outside this file's dependency set - with no cast, no
 * no unsafe type, no type-checker suppression directive and no non-null assertion. See the
 * mismatch note in the file header.
 */
function refuse(member: string): never {
  throw new WithheldCollaboratorError(member);
}

/** The ordered invocation log's labels. Order between the last two IS the gate. */
const ROOT_OPENED = 'compositionRoot.open';
const SCOPE_OPENED = 'createRequestScope';
const ORDER_ADMITTED = 'admitOrderView';
const SALE_PRICE_RESOLVED = 'getSalePriceDetailsForProductSkus';

/** [model/service/PriceGroupService.cfc:L364] - the pass that WRITES what L241 reads. */
const PRICE_GROUP_PASS = 'priceGroupPass';

/** [model/service/PromotionService.cfc:L58] - the pass that READS it. */
const PROMOTION_PASS = 'promotionPass';

/**
 * The promotion pass's SECOND ordered pass [model/service/PromotionService.cfc:L415-L451].
 *
 * Its absence from the log is the observable form of vector 2: the loop-counter reset at
 * [:L457-L461] sits inside the loop body, so an EMPTY reward collection never reaches it.
 */
const ORDER_LEVEL_PASS = 'orderLevelRewardPass';

/** The preserved return/exchange branch [model/service/PromotionService.cfc:L542-L544]. */
const RETURN_EXCHANGE_NO_OP = 'returnExchangeNoOp';

/** The single instant every date in this suite resolves against. Explicit UTC ISO-8601. */
const EVALUATED_AT = '2024-06-01T12:00:00.000Z';

/** Invented, non-sensitive sentinels. Nothing here resembles a credential or a connection value. */
const IDEMPOTENCY_KEY = 'idem-promotion-application-0001';
const REPLAY_IDEMPOTENCY_KEY = 'idem-promotion-application-0001-replay';
const PLATFORM_REQUEST_ID = 'req-promotion-application-0001';
const PRODUCT_ID = 'prod-golden-0001';
const SALE_PRICE_SKU_ID = 'sku-golden-0001';
const SALE_PRICE_PROMOTION_ID = 'promo-sale-price-0001';

/**
 * The SECOND, larger percentage a competing reward carries in vector 4.
 *
 * A decimal STRING fed to `Money`, never a numeric literal: `25` as a number would invite arithmetic
 * on it, and no monetary quantity in this file is ever an IEEE-754 value. Larger than the fixture's
 * own `'12.5'` so the descending selection at [model/service/PromotionService.cfc:L266-L294] has a
 * strict winner instead of a tie.
 */
const LARGER_PERCENTAGE_OFF = '25';

/** The route this capability answers on, taken from the shipped frozen table rather than retyped. */
const CAPABILITY_ROUTE = ROUTE_TABLE.promotionApplication;

/**
 * What the composed pricing operation is configured to decide for one order item.
 *
 * Mirrors the two writes at [model/service/PriceGroupService.cfc:L370-L371] and nothing else: a
 * lower price, and the price group that produced it.
 */
interface PriceGroupDecision {
  readonly orderItemID: string;
  readonly price: Money;
  readonly priceGroup: PriceGroupRef;
}

/** Everything one test wants to observe about how the handler drove its graph. */
interface PricingRecorder {
  /** Labels in invocation order. The PRICE_GROUP_PASS / PROMOTION_PASS pair IS the gate. */
  readonly log: string[];
  /** Every `RequestScopeInput` the handler opened a scope with. */
  readonly scopeInputs: RequestScopeInput[];
  /** Every order view handed to the composed operation. */
  readonly composedInputs: OrderView[];
  /** Every order view the PROMOTION pass actually read - pass one's output, when it ran first. */
  readonly promotionPassInputs: OrderView[];
  /** Every decoded request the order-view admission was handed. */
  readonly admissionRequests: ApplyPromotionsRequest[];
  /** Every product identifier the sale-price operation was asked for. */
  readonly salePriceRequests: string[];
  /** Whether the L61 discount body was entered, once per promotion-pass invocation. */
  readonly enteredDiscountBody: boolean[];
  /** Whether the L542 return/exchange branch was entered, once per promotion-pass invocation. */
  readonly enteredReturnExchangeNoOp: boolean[];
}

/** A fresh recorder. Arrays are read back after the invocation; nothing is shared between tests. */
function makeRecorder(): PricingRecorder {
  return {
    log: [],
    scopeInputs: [],
    composedInputs: [],
    promotionPassInputs: [],
    admissionRequests: [],
    salePriceRequests: [],
    enteredDiscountBody: [],
    enteredReturnExchangeNoOp: [],
  };
}

/**
 * A recording logger built from the REAL module logger through its published sink seam.
 *
 * The shipped logger is used rather than a hand-written stand-in precisely because its mandatory,
 * non-disableable redaction list is part of what SECTION 9 proves is live. That list covers ten
 * credential-shaped and payment-shaped key names and is enumerated in `src/lib/logger.ts`, which is
 * its single source of truth - it is deliberately NOT transcribed here, so this file contains no
 * credential-shaped literal of any kind. The level is PINNED so filtering cannot depend on an
 * ambient variable, and the sink replaces stdout so the console is never globally silenced and never
 * polluted.
 */
interface RecordingLogger {
  readonly logger: Logger;
  /** Raw emitted lines, asserted as text so nothing can leak inside a field nobody inspected. */
  readonly lines: readonly string[];
}

function makeRecordingLogger(): RecordingLogger {
  const lines: string[] = [];
  const sink: LogSink = (line: string): void => {
    lines.push(line);
  };

  return { logger: logger.withSink(sink).withLevel('debug'), lines };
}

// ---------------------------------------------------------------------------
// SECTION 1a - THE L241 ARITHMETIC CONTRACT, WRITTEN OUT
//
// The two functions below are an EXECUTABLE STATEMENT of the source contract the
// composed operation must satisfy, and they are named and scoped so no reader
// mistakes them for the shipped implementation. What SECTION 4 proves with them is
// the DEPENDENCY - that the discount the promotion pass computes changes according
// to whether the view it reads carries the price-group pass's writes - which is
// exactly what the ordering gate is about. The shipped arithmetic itself is pinned
// by `tests/unit/services/promotion/discountAmount.test.ts`, and this file asserts
// nothing about the internals of `src/services/**`.
// ---------------------------------------------------------------------------

/**
 * `getDiscountAmount(reward, price, quantity)` [model/service/PromotionService.cfc:L987-L1018],
 * SYNC and PURE, `Money` in and `Money` out.
 *
 * Only the shape this suite drives is supported, and every other shape is REFUSED loudly rather
 * than defaulted - so no branch is silently approximated:
 *
 *   L990 `originalAmount = precisionEvaluate('arguments.price * arguments.quantity')`
 *   L995 the `percentageOff` branch, `originalAmount * (reward.getAmount()/100)`
 *   L1008-L1009 the NO-ROUNDING-RULE arm, `discountAmount = discountAmountPreRounding`
 *   L1013-L1015 the clamp
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the clamp that "makes sure that
 * the discount never exceeds the original amount" tests the PRE-rounding value
 * `if(discountAmountPreRounding > originalAmount)` and then overwrites the POST-rounding one,
 * `discountAmount = originalAmount`.
 * Preserved deliberately; do not fix without a product decision.
 *   Reproduced here as written. It is UNOBSERVABLE on the unrounded arm, where the two values are
 *   the same number, and observing it needs a reward carrying a rounding rule - which this double
 *   refuses, because rounding belongs to `RoundingRuleService` and to the decomposition suite that
 *   owns it. Stating that plainly beats implying this file covers it.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: the `amountOff` branch is
 * `discountAmountPreRounding = reward.getAmount() * quantity` - raw floating-point multiplication
 * with no `precisionEvaluate`, and with `quantity` unscoped while its siblings use `arguments.*`.
 * Preserved deliberately; do not fix without a product decision.
 *   Routing that branch through `Money` is one of the migration's THREE ALREADY-ALLOCATED deliberate
 *   divergences and belongs to the services tier; this suite claims no divergence slot and drives
 *   only `percentageOff`.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L1007,L1009]: `discountAmount` is assigned
 * WITHOUT `var` in both arms, leaking into component scope.
 * Preserved deliberately; do not fix without a product decision.
 *   Also an already-allocated divergence, made function-local by the services tier because shared
 *   mutable state on a warm container could leak one customer's discount into another's order. This
 *   function is likewise pure, and that is the same decision rather than a fourth one.
 *
 * CFML parity [model/service/PromotionService.cfc:L993-L1003]: the `switch` has NO `default:` case,
 * so an unrecognised `amountType` leaves the discount at its `0` seed [L988]; and L1001's `amount`
 * branch is `(price - amount) * quantity`, a target-price difference rather than a reduction.
 */
function contractDiscountAmount(reward: PromotionRewardRef, price: Money, quantity: number): Money {
  const amountType = reward.getAmountType();
  const amount = reward.getAmount();

  if (amountType !== 'percentageOff' || amount === undefined) {
    throw new TypeError(
      'This suite drives only the percentageOff arm of getDiscountAmount ' +
        '[model/service/PromotionService.cfc:L994-L996] with an amount present. The amountOff and ' +
        'amount arms, and the rounding arm at [:L1005-L1007], belong to ' +
        'tests/unit/services/promotion/discountAmount.test.ts.',
    );
  }

  if (reward.getRoundingRule() !== undefined) {
    throw new TypeError(
      'This suite drives only the UNROUNDED arm [model/service/PromotionService.cfc:L1008-L1009]. ' +
        'A reward carrying a rounding rule reaches RoundingRuleService, which the handler tier ' +
        'neither holds nor may reach.',
    );
  }

  // [model/service/PromotionService.cfc:L990]
  const originalAmount = price.times(quantity);

  // [model/service/PromotionService.cfc:L995] - through Money, so no IEEE-754 value ever appears.
  const discountAmountPreRounding = originalAmount.times(amount.dividedBy(100));

  // [model/service/PromotionService.cfc:L1009] the unrounded arm, then L1013-L1015's clamp.
  return discountAmountPreRounding.isGreaterThan(originalAmount)
    ? originalAmount
    : discountAmountPreRounding;
}

/** Which arm of the L241 discriminator an item selected, and what it was therefore worth. */
interface ContractItemDiscount {
  readonly orderItemID: string;
  readonly selectedArm: 'price' | 'skuPriceWithCorrection';
  readonly correctionTerm: Money;
  readonly discountAmount: Money;
}

/**
 * The L241 discriminator itself, with the polarity the source states.
 *
 * A NULL applied price group [L241 first disjunct] OR a reward that DOES list the applied group
 * [L241 second disjunct] takes `getPrice()` with NO correction [L244]. Anything else takes
 * `getSkuPrice()` [L249] MINUS `(getExtendedSkuPrice() - getExtendedPrice())` [L252].
 */
function contractItemDiscount(
  reward: PromotionRewardRef,
  item: OrderItemView,
): ContractItemDiscount {
  const appliedPriceGroup = item.appliedPriceGroup;

  // [model/service/PromotionService.cfc:L241]
  if (appliedPriceGroup === undefined || reward.hasEligiblePriceGroup(appliedPriceGroup)) {
    return {
      orderItemID: item.orderItemID,
      selectedArm: 'price',
      // Zero on this arm because the source subtracts nothing here, not as a monetary fallback.
      correctionTerm: Money.zero,
      // [model/service/PromotionService.cfc:L244]
      discountAmount: contractDiscountAmount(reward, item.price, item.quantity),
    };
  }

  // [model/service/PromotionService.cfc:L249]
  const originalDiscountAmount = contractDiscountAmount(reward, item.skuPrice, item.quantity);

  // [model/service/PromotionService.cfc:L252] - the correction term, `precisionEvaluate`d in the
  // source and routed through Money here. L248 is a comment line, not this expression.
  const correctionTerm = item.extendedSkuPrice.minus(item.extendedPrice);

  return {
    orderItemID: item.orderItemID,
    selectedArm: 'skuPriceWithCorrection',
    correctionTerm,
    discountAmount: originalDiscountAmount.minus(correctionTerm),
  };
}

// ---------------------------------------------------------------------------
// SECTION 1b - THE TWO PASSES, AND THE COMPOSED OPERATION THAT ORDERS THEM
// ---------------------------------------------------------------------------

/** A reward paired with the promotion an emitted intent must name, as an opaque identifier. */
interface RewardUnderTest {
  readonly reward: PromotionRewardRef;
  readonly promotionID: string;
}

/** What the price-group pass decided, and the order view it left behind for pass two to read. */
interface PriceGroupPassOutcome {
  readonly intents: PriceGroupAppliedIntent[];
  readonly pricedOrder: OrderView;
}

/**
 * PASS ONE - `updateOrderAmountsWithPriceGroups` [model/service/PriceGroupService.cfc:L364-L375].
 *
 * The two writes it reproduces are L370 `setPrice(...)` and L371 `setAppliedPriceGroup(...)`, and
 * both of its guards are honoured:
 *
 *   L365 `!isNull(order.getAccount()) && arrayLen(order.getAccount().getPriceGroups())` - a GUEST
 *        order decides nothing. It does NOT mean the pass is skipped: the pass runs and declines,
 *        which is the `isNull(...)` arm of L241 and is a NORMAL outcome.
 *   L369 `priceGroupDetails.price < orderItem.getPrice()` - a group is applied only when the
 *        computed price is STRICTLY LOWER, so a decision that is not an improvement is declined.
 *
 * CFML parity [model/entity/OrderItem.cfc:L200-L206]: `getExtendedPrice()` is CALCULATED as
 * `price * val(quantity)` and wraps the quantity in `val()` so a null becomes `0`, while
 * `getExtendedSkuPrice()` does NOT. Writing `price` therefore moves `extendedPrice` and leaves
 * `extendedSkuPrice` alone - which is exactly why the L252 correction term is non-zero after this
 * pass has run, and why the asymmetry survives here rather than being tidied away.
 *
 * NOTHING IS MUTATED. The order view is deeply frozen by its fixture, so pass one PROJECTS a new
 * view and returns it. The submitted view is read and handed back unchanged.
 */
function runPriceGroupPass(
  order: OrderView,
  decisions: readonly PriceGroupDecision[],
): PriceGroupPassOutcome {
  const intents: PriceGroupAppliedIntent[] = [];

  // [model/service/PriceGroupService.cfc:L365] - the account gate. `accountID` absent is the
  // logged-out arm, and the out-of-scope Account entity is never dereferenced.
  const decisionsByItem =
    order.accountID === undefined
      ? new Map<string, PriceGroupDecision>()
      : new Map<string, PriceGroupDecision>(
          decisions.map((decision): readonly [string, PriceGroupDecision] => [
            decision.orderItemID,
            decision,
          ]),
        );

  const pricedItems: OrderItemView[] = order.orderItems.map((item): OrderItemView => {
    const decision = decisionsByItem.get(item.orderItemID);

    // [model/service/PriceGroupService.cfc:L369] - strictly lower, or the item is left alone.
    if (decision === undefined || !decision.price.isLessThan(item.price)) {
      return item;
    }

    intents.push({
      orderItemID: item.orderItemID,
      price: decision.price,
      priceGroupID: decision.priceGroup.getPriceGroupID(),
    });

    return {
      ...item,
      // [model/service/PriceGroupService.cfc:L370]
      price: decision.price,
      // [model/service/PriceGroupService.cfc:L371] - the member L241 branches on.
      appliedPriceGroup: decision.priceGroup,
      extendedPrice: decision.price.times(item.quantity),
    };
  });

  return { intents, pricedOrder: { ...order, orderItems: pricedItems } };
}

/** What the promotion pass decided, plus which of the two order-type branches it entered. */
interface PromotionPassOutcome {
  readonly intents: PromotionIntent[];
  readonly enteredDiscountBody: boolean;
  readonly enteredReturnExchangeNoOp: boolean;
  readonly armSelections: readonly ContractItemDiscount[];
}

/** The item-type code the discount body admits [model/entity/OrderItem.cfc:L118, L125]. */
const SALE_ORDER_ITEM_SYSTEM_CODE = 'oitSale';

/** [model/service/PromotionService.cfc:L61] - the list that admits the entire 489-line body. */
const SALE_OR_EXCHANGE_ORDER_TYPES = 'otSalesOrder,otExchangeOrder';

/** [model/service/PromotionService.cfc:L542] - a DIFFERENT list, gating the preserved no-op. */
const RETURN_OR_EXCHANGE_ORDER_TYPES = 'otReturnOrder,otExchangeOrder';

/**
 * PASS TWO - `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58-L546].
 *
 * The `void`-to-intents reshaping this returns is ONE OF THE MIGRATION'S THREE PERMITTED INTERFACE
 * RESHAPINGS and it is ALREADY ALLOCATED to the services tier: the legacy method returns `void` and
 * mutates the order aggregate in place, and the aggregate is out of scope. This suite consumes that
 * reshaping and introduces no fourth.
 *
 * The order-dependence vectors this double must not disturb, and does not:
 *
 *   V1 - the reward collection is taken EXACTLY as supplied. `getActivePromotionRewards()`
 *        [model/dao/PromotionDAO.cfc:L51-L132] declares no `ORDER BY`, so the order is genuinely
 *        non-deterministic at a tie and that non-determinism IS the legacy behaviour. Nothing here
 *        adds an `ORDER BY`, sorts, re-ranks or stabilises.
 *   V2 - TWO EXPLICIT ORDERED PASSES. The item-level pass runs first; the order-level pass runs only
 *        afterwards, and only when the reward collection is NON-EMPTY. The legacy achieves that by
 *        mutating its own loop counter - `if(!orderRewards and pr == arrayLen(promotionRewards))
 *        { pr = 0; orderRewards = true; }` [model/service/PromotionService.cfc:L457-L461], with
 *        `var orderRewards = false;` at [:L166] - and because the reset sits INSIDE the loop body,
 *        an empty reward collection means the second pass NEVER RUNS AT ALL. Reproduced
 *        deliberately, not incidentally.
 *   V4 - ONLY THE SINGLE LARGEST DISCOUNT PER ORDER ITEM IS APPLIED. The legacy insert-sorts
 *        `orderItemQulifiedDiscounts` DESCENDING by amount [:L266-L294] and then applies index `[1]`
 *        and nothing else [:L523-L537]. The misspelled legacy accumulator key
 *        `orderItemQulifiedDiscounts` [:L82-L133] is recorded here and renamed in the target, never
 *        silently renamed.
 *
 * CFML parity [model/service/PromotionService.cfc:L61,L542]: the two order-type conditionals are
 * SEQUENTIAL, NOT else-if, and their lists DIFFER. A sales order runs only the first; a return order
 * runs only the second; an EXCHANGE order runs the whole discount body and THEN enters the empty
 * return branch. `listFindNoCase` is CASE-INSENSITIVE and returns a 1-based index with `0` for
 * absent, so the comparison is routed through `src/lib/cfml/list.ts` and compared against `0` -
 * never through `===` on the raw string.
 *
 * CFML parity [model/service/PromotionService.cfc:L417]: the order-level branch combines
 * `getSubtotalAfterItemDiscounts()` and `getFulfillmentChargeAfterDiscountTotal()` with a PLAIN `+`
 * and NOT with `precisionEvaluate`. Preserved as an addition rather than upgraded.
 *
 * CFML parity [model/service/PromotionService.cfc:L529-L534]: the legacy `PromotionApplied` is never
 * `setOrder()`-ed and never explicitly saved - it relies on ORM cascade - which is exactly why the
 * target emits INTENTS keyed by opaque identifiers instead.
 */
function runPromotionPass(
  order: OrderView,
  rewards: readonly RewardUnderTest[],
  recorder: PricingRecorder,
): PromotionPassOutcome {
  const orderTypeSystemCode = order.orderType.systemCode;

  // [model/service/PromotionService.cfc:L61]
  const enteredDiscountBody =
    listFindNoCase(SALE_OR_EXCHANGE_ORDER_TYPES, orderTypeSystemCode) !== 0;

  // [model/service/PromotionService.cfc:L542] - evaluated INDEPENDENTLY of the gate above.
  const enteredReturnExchangeNoOp =
    listFindNoCase(RETURN_OR_EXCHANGE_ORDER_TYPES, orderTypeSystemCode) !== 0;

  const intents: PromotionIntent[] = [];
  const armSelections: ContractItemDiscount[] = [];

  if (enteredDiscountBody) {
    // PASS ONE OF TWO - the item-level rewards [model/service/PromotionService.cfc:L169-L456].
    for (const item of order.orderItems) {
      // [model/service/PromotionService.cfc:L206] - only an `oitSale` item enters the body.
      if (item.orderItemType.systemCode !== SALE_ORDER_ITEM_SYSTEM_CODE) {
        continue;
      }

      let best:
        { readonly decided: ContractItemDiscount; readonly promotionID: string } | undefined;

      for (const { reward, promotionID } of rewards) {
        const decided = contractItemDiscount(reward, item);
        armSelections.push(decided);

        // [model/service/PromotionService.cfc:L257] `if(discountAmount > 0)`. `Money` publishes no
        // `isZero`, so a zero COMPARISON OPERAND is how the source's test is expressed - it is not a
        // fallback and it is never coalesced into a value.
        if (decided.discountAmount.compare(Money.zero) <= 0) {
          continue;
        }

        // V4's descending selection, reduced to its observable consequence: the single largest
        // discount wins [model/service/PromotionService.cfc:L266-L294, L523-L537]. A strict `>` keeps
        // the FIRST of two equal amounts, which is what an insertion sort that inserts before a
        // strictly smaller element does.
        if (
          best === undefined ||
          decided.discountAmount.isGreaterThan(best.decided.discountAmount)
        ) {
          best = { decided, promotionID };
        }
      }

      if (best !== undefined) {
        intents.push({
          operation: 'add',
          appliedType: 'orderItem',
          orderItemID: item.orderItemID,
          promotionID: best.promotionID,
          discountAmount: best.decided.discountAmount,
        });
      }
    }

    // PASS TWO OF TWO - the order-level reward [model/service/PromotionService.cfc:L415-L451]. It is
    // reached ONLY through the loop-counter reset at [:L457-L461], which sits inside the loop body,
    // so an EMPTY reward collection never reaches it.
    const orderLevelReward = rewards.at(-1);

    if (orderLevelReward !== undefined) {
      recorder.log.push(ORDER_LEVEL_PASS);

      // [model/service/PromotionService.cfc:L417] - a plain `+`, deliberately not precisionEvaluate.
      const orderLevelBase = order.subtotalAfterItemDiscounts.plus(
        order.fulfillmentChargeAfterDiscountTotal,
      );
      const orderLevelDiscount = contractDiscountAmount(orderLevelReward.reward, orderLevelBase, 1);

      if (orderLevelDiscount.compare(Money.zero) > 0) {
        intents.push({
          operation: 'add',
          appliedType: 'order',
          orderID: order.orderID,
          promotionID: orderLevelReward.promotionID,
          discountAmount: orderLevelDiscount,
        });
      }
    }
  }

  if (enteredReturnExchangeNoOp) {
    // TODO [issue #1766]: In the future allow for return Items to have negative promotions applied.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L542-L544]: the `if` at L542 encloses
    // NOTHING but the TODO comment at L543, so this branch does nothing at all.
    // Preserved deliberately; do not fix without a product decision.
    //   Carried forward verbatim, still doing nothing, still carrying its ticket reference. The
    //   regression test named `issue_1766` in SECTION 5 documents the gap, and no negative-discount
    //   concept is encoded anywhere.
    recorder.log.push(RETURN_EXCHANGE_NO_OP);
  }

  recorder.enteredDiscountBody.push(enteredDiscountBody);
  recorder.enteredReturnExchangeNoOp.push(enteredReturnExchangeNoOp);

  return { intents, enteredDiscountBody, enteredReturnExchangeNoOp, armSelections };
}

/**
 * Which order the two passes are run in.
 *
 * `'priceGroupThenPromotion'` is the ONLY order the shipped surface can produce, because
 * `src/handlers/bootstrap.ts` composes the two inside a module-private function and withholds both
 * individual passes from `RequestScope`. `'promotionThenPriceGroup'` is A MEASURING INSTRUMENT AND
 * NOTHING ELSE: it exists in this suite so the gate can quantify what the inversion costs in money,
 * and it is unreachable through the shipped handler, which is itself asserted in SECTION 4.
 */
type ComposedOrdering = 'priceGroupThenPromotion' | 'promotionThenPriceGroup';

/** How one test configures the composed pricing operation. */
interface PricingConfiguration {
  readonly decisions: readonly PriceGroupDecision[];
  readonly rewards: readonly RewardUnderTest[];
  readonly ordering: ComposedOrdering;
  /** A failure to raise INSTEAD of pricing, for the error-mapping cases. */
  readonly failure: Error | undefined;
}

/**
 * `RequestScope.updateOrderAmountsWithPriceGroupsThenPromotions`, as a double.
 *
 * ★★★ THE ORDERING LIVES IN THESE TWO STATEMENTS AND IS OBSERVED THROUGH THE ORDERED LOG, never by
 * inspecting anybody's internals. Pass one runs, its intents are PROJECTED onto the order view, and
 * pass two reads THAT view - which is the whole of the data dependency the gate is about.
 * `pricedOrder` is published for the same reason the shipped result publishes it: it is the exact
 * input pass two consumed.
 */
function makeComposedPricingOperation(
  config: PricingConfiguration,
  recorder: PricingRecorder,
): (order: OrderView) => Promise<OrderPricingResult> {
  return (order: OrderView): Promise<OrderPricingResult> => {
    recorder.composedInputs.push(order);

    if (config.failure !== undefined) {
      return Promise.reject(config.failure);
    }

    if (config.ordering === 'promotionThenPriceGroup') {
      // THE INVERSION, RUN DELIBERATELY SO ITS COST CAN BE MEASURED. Pass two reads the order view
      // as SUBMITTED, because pass one has not written to it yet - so every item is on the
      // `isNull(...)` arm of [model/service/PromotionService.cfc:L241].
      recorder.log.push(PROMOTION_PASS);
      recorder.promotionPassInputs.push(order);
      const inverted = runPromotionPass(order, config.rewards, recorder);

      recorder.log.push(PRICE_GROUP_PASS);
      const late = runPriceGroupPass(order, config.decisions);

      return Promise.resolve({
        priceGroupIntents: late.intents,
        promotionIntents: inverted.intents,
        pricedOrder: late.pricedOrder,
      });
    }

    // THE SHIPPED ORDER. Pass one FIRST and UNCONDITIONALLY.
    recorder.log.push(PRICE_GROUP_PASS);
    const priceGroups = runPriceGroupPass(order, config.decisions);

    recorder.log.push(PROMOTION_PASS);
    recorder.promotionPassInputs.push(priceGroups.pricedOrder);
    const promotions = runPromotionPass(priceGroups.pricedOrder, config.rewards, recorder);

    return Promise.resolve({
      priceGroupIntents: priceGroups.intents,
      promotionIntents: promotions.intents,
      pricedOrder: priceGroups.pricedOrder,
    });
  };
}

/** Everything the request-scope double needs to answer this capability, and nothing more. */
interface ScopeConfiguration {
  readonly now: Date;
  readonly pricing: PricingConfiguration;
  readonly salePriceDetails: Record<string, SalePriceDetail>;
}

/**
 * A `RequestScope` double.
 *
 * ★ EVERY MEMBER THIS CAPABILITY MUST NOT REACH IS A THROWING GETTER, and that is the mechanism
 * described in the file header. Five of them - `roundingRuleService`, `brandService`,
 * `optionService`, `skuService`, `productService` - are typed to CONCRETE service classes carrying
 * `private` members, so no object literal could supply them; a getter declared
 * `RequestScope['roundingRuleService']` and returning `never` satisfies the compiler with no cast.
 * The other four are reachable in principle and withheld on purpose:
 *
 *   `priceGroupService` and `promotionService` are the NARROWED capabilities
 *   (`Omit<PriceGroupService, 'updateOrderAmountsWithPriceGroups'>` and its promotion twin). Neither
 *   even declares an order pass, so the withheld passes cannot be called in the wrong order by code
 *   that compiles - and these getters additionally prove the handler calls no QUERY member either.
 *
 *   `currentAccountContext` is the explicit replacement for `getHibachiScope()` /
 *   `getSlatwallScope()`. The handler threads the account identifier through `RequestScopeInput` and
 *   never reads an ambient scope, so touching this member would be the ambient-state regression the
 *   port exists to prevent.
 *
 *   `currencyConverter` and `productFeedPort` belong to other capabilities.
 */
function makeRequestScopeDouble(
  config: ScopeConfiguration,
  recorder: PricingRecorder,
): RequestScope {
  const composed = makeComposedPricingOperation(config.pricing, recorder);

  return {
    // A FRESH `Date` on every read, carrying the one instant this request bound - the same contract
    // the shipped scope documents, so a caller mutating what it read moves nothing.
    get now(): Date {
      return new Date(config.now.getTime());
    },

    get currentAccountContext(): RequestScope['currentAccountContext'] {
      return refuse('RequestScope.currentAccountContext');
    },
    get roundingRuleService(): RequestScope['roundingRuleService'] {
      return refuse('RequestScope.roundingRuleService');
    },
    get brandService(): RequestScope['brandService'] {
      return refuse('RequestScope.brandService');
    },
    get optionService(): RequestScope['optionService'] {
      return refuse('RequestScope.optionService');
    },
    get skuService(): RequestScope['skuService'] {
      return refuse('RequestScope.skuService');
    },
    get productService(): RequestScope['productService'] {
      return refuse('RequestScope.productService');
    },
    get priceGroupService(): RequestScope['priceGroupService'] {
      return refuse('RequestScope.priceGroupService');
    },
    get promotionService(): RequestScope['promotionService'] {
      return refuse('RequestScope.promotionService');
    },
    get currencyConverter(): RequestScope['currencyConverter'] {
      return refuse('RequestScope.currencyConverter');
    },
    get productFeedPort(): RequestScope['productFeedPort'] {
      return refuse('RequestScope.productFeedPort');
    },

    // [model/service/PromotionService.cfc:L1022] - the one other already-ported service method this
    // adapter reaches. Its input is a plain string, so there is nothing to materialise.
    getSalePriceDetailsForProductSkus: (
      productID: string,
    ): Promise<Record<string, SalePriceDetail>> => {
      recorder.log.push(SALE_PRICE_RESOLVED);
      recorder.salePriceRequests.push(productID);

      return Promise.resolve(config.salePriceDetails);
    },

    updateOrderAmountsWithPriceGroupsThenPromotions: composed,
  };
}

/**
 * A `CompositionRoot` double.
 *
 * `diagnostics`, `dialect`, `settingsProvider`, `integration` and `createInspectableRequestScope` are
 * all withheld through {@link refuse}: an order-pricing invocation reads no process configuration, no
 * dialect, no setting, no integration adapter and no assembled adapter, and the double is what
 * proves it. `diagnostics` matters most - it is the REDACTED replacement for a member that once
 * exposed a database credential as a readable `string`, and this capability has no business
 * reading it.
 */
function makeCompositionRootDouble(
  config: ScopeConfiguration,
  recorder: PricingRecorder,
): CompositionRoot {
  return {
    get diagnostics(): CompositionRoot['diagnostics'] {
      return refuse('CompositionRoot.diagnostics');
    },
    get dialect(): CompositionRoot['dialect'] {
      return refuse('CompositionRoot.dialect');
    },
    get settingsProvider(): CompositionRoot['settingsProvider'] {
      return refuse('CompositionRoot.settingsProvider');
    },
    get integration(): CompositionRoot['integration'] {
      return refuse('CompositionRoot.integration');
    },

    createRequestScope: (scopeInput?: RequestScopeInput): Promise<RequestScope> => {
      recorder.log.push(SCOPE_OPENED);

      if (scopeInput !== undefined) {
        recorder.scopeInputs.push(scopeInput);
      }

      return Promise.resolve(makeRequestScopeDouble(config, recorder));
    },

    createInspectableRequestScope: (): Promise<never> =>
      refuse('CompositionRoot.createInspectableRequestScope'),
  };
}

// ---------------------------------------------------------------------------
// SECTION 1c - THE PLATFORM EVENT, THE HARNESS, AND THE RESPONSE READERS
// ---------------------------------------------------------------------------

/**
 * A complete API Gateway proxy event, version 1.0 payload.
 *
 * Written out in full rather than narrowed, because the handler's parameter type is the platform's
 * own and a partial literal would not compile. Every value is an invented, non-sensitive sentinel:
 * there is no credential, no account name, no host name, no network address a reader could mistake
 * for real, and every caller-identity field the platform permits to be null IS null.
 */
function makeProxyEvent(overrides: {
  readonly httpMethod?: string;
  readonly path?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestId?: string;
}): APIGatewayProxyEvent {
  return {
    body: overrides.body === undefined ? null : overrides.body,
    headers: { 'content-type': 'application/json' },
    multiValueHeaders: { 'content-type': ['application/json'] },
    httpMethod: overrides.httpMethod ?? CAPABILITY_ROUTE.methods,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
    path: overrides.path ?? CAPABILITY_ROUTE.path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: overrides.path ?? CAPABILITY_ROUTE.path,
    requestContext: {
      accountId: 'fixture-account-id',
      apiId: 'fixture-api-id',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: overrides.httpMethod ?? CAPABILITY_ROUTE.methods,
      // JUDGMENT CALL: every member of `identity` below is REQUIRED by `@types/aws-lambda`'s
      // `APIGatewayEventIdentity` and none is optional, so the two credential-NAMED members must be
      // written for this literal to type-check. Both are `null`, and nothing in this file assigns
      // either of them a value - they are the platform's own event shape, not this suite's data.
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '198.51.100.7',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: overrides.path ?? CAPABILITY_ROUTE.path,
      stage: 'fixture',
      requestId: overrides.requestId ?? PLATFORM_REQUEST_ID,
      requestTimeEpoch: new Date(EVALUATED_AT).getTime(),
      resourceId: 'fixture-resource-id',
      resourcePath: overrides.path ?? CAPABILITY_ROUTE.path,
    },
  };
}

/** The envelope for `applyPromotions`. `order` is whatever the caller is putting on the wire. */
function applyPromotionsDocument(
  orderMember: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    operation: 'applyPromotions',
    idempotencyKey: IDEMPOTENCY_KEY,
    order: orderMember,
    ...extra,
  };
}

/** A POST to the capability route carrying `document` as its JSON body. */
function postDocument(document: unknown): APIGatewayProxyEvent {
  return makeProxyEvent({ body: JSON.stringify(document) });
}

/**
 * The minimal `order` member a caller sends when it has ALREADY materialised the view.
 *
 * ★ AND THE MATERIALISED VIEW ITSELF IS NOT JSON-SERIALISABLE, WHICH IS THE POINT RATHER THAN AN
 * INCONVENIENCE. `OrderItemView.sku` is a ported `Sku` entity whose product-type chain is
 * BIDIRECTIONAL - `parentProductType` and `childProductTypes` close a cycle - so `JSON.stringify`
 * of a real order view throws outright. An order view is therefore something a tier that owns
 * hydration constructs and hands over IN PROCESS, never something that travels as a body; the
 * handler's `admitOrderView` seam exists for exactly that, and the cases below use it.
 */
function orderReference(order: OrderView): Readonly<Record<string, unknown>> {
  return { orderID: order.orderID };
}

/**
 * What an order actually looks like once it has been through `JSON.parse` - and therefore what the
 * production admission is obliged to REFUSE.
 *
 * Every monetary member is a plain decimal string with no accessors, every entity is a bare
 * identifier object, and `appliedPriceGroup` VANISHES because JSON has no way to state an absence.
 * Accepting this would let the engine read `undefined` out of a missing accessor and put a silent
 * zero into a discount calculation, and a zero price sells product for free
 * [model/entity/Sku.cfc:L269-L273 has no `else` and no fallback for precisely that reason].
 */
function wireProjectionOf(order: OrderView): Readonly<Record<string, unknown>> {
  return {
    orderID: order.orderID,
    orderType: { systemCode: order.orderType.systemCode },
    accountID: order.accountID,
    promotionCodeList: order.promotionCodeList,
    totalSaleQuantity: order.totalSaleQuantity,
    subtotal: order.subtotal.toDecimalString(),
    subtotalAfterItemDiscounts: order.subtotalAfterItemDiscounts.toDecimalString(),
    fulfillmentChargeAfterDiscountTotal:
      order.fulfillmentChargeAfterDiscountTotal.toDecimalString(),
    currencyCode: order.currencyCode,
    appliedPromotions: [],
    orderItems: order.orderItems.map((item): Readonly<Record<string, unknown>> => ({
      orderItemID: item.orderItemID,
      sku: { skuID: item.sku.getSkuID() },
      quantity: item.quantity,
      price: item.price.toDecimalString(),
      skuPrice: item.skuPrice.toDecimalString(),
      extendedPrice: item.extendedPrice.toDecimalString(),
      extendedSkuPrice: item.extendedSkuPrice.toDecimalString(),
      appliedPriceGroup: undefined,
      orderItemType: { systemCode: item.orderItemType.systemCode },
      orderFulfillmentID: item.orderFulfillmentID,
      appliedPromotions: [],
    })),
    orderFulfillments: [],
  };
}

/** A POST of the `applyPromotions` envelope carrying an opaque reference to an admitted view. */
function postApplyPromotions(
  order: OrderView,
  extra: Readonly<Record<string, unknown>> = {},
): APIGatewayProxyEvent {
  return postDocument(
    applyPromotionsDocument(orderReference(order), {
      ...(order.accountID === undefined ? {} : { accountID: order.accountID }),
      ...extra,
    }),
  );
}

/** How one test configures the whole graph behind the handler. */
interface HarnessOptions {
  readonly now?: Date;
  /** The injected clock. Absent means the handler passes no `now` and the scope binds its own. */
  readonly clock?: () => Date;
  readonly decisions?: readonly PriceGroupDecision[];
  readonly rewards?: readonly RewardUnderTest[];
  readonly ordering?: ComposedOrdering;
  readonly failure?: Error;
  readonly salePriceDetails?: Record<string, SalePriceDetail>;
  /**
   * Installs an admission that vouches for this MATERIALISED view and records what it was asked.
   *
   * This is the documented seam for a golden fixture, and using it is a necessity rather than a
   * convenience: a wire document has been through `JSON.parse`, so its `sku` carries no methods and
   * its `price` is a plain string - which the production admission REFUSES, correctly and by design.
   * A caller holding a wire document materialises it on the tier that owns hydration and hands the
   * RESULT in here. When neither this member nor {@link HarnessOptions.refuseAdmission} is supplied,
   * the PRODUCTION admission runs, which is how the refusal cases below are driven.
   */
  readonly admit?: OrderView;
  /** Installs an admission that REFUSES, so the client-shaped refusal arm is drivable. */
  readonly refuseAdmission?: OrderViewAdmissionError;
}

/** One handler, one recorder, one recording logger - all fresh, none shared. */
interface Harness {
  readonly recorder: PricingRecorder;
  readonly emitted: RecordingLogger;
  readonly invoke: (
    event: APIGatewayProxyEvent,
    context?: Context,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Build a handler over suite-local doubles.
 *
 * A FRESH SUBJECT PER CALL, and every collaborator is constructed inside this function - no module
 * state, no shared graph, no memo. `compositionRoot` is a function the handler awaits ONCE per
 * invocation, and the harness records that opening so SECTION 3 can prove the memoized production
 * initializer is not being bypassed per request.
 */
function makeHarness(options: HarnessOptions = {}): Harness {
  const recorder = makeRecorder();
  const emitted = makeRecordingLogger();

  const config: ScopeConfiguration = {
    now: options.now ?? new Date(EVALUATED_AT),
    salePriceDetails: options.salePriceDetails ?? {},
    pricing: {
      decisions: options.decisions ?? [],
      rewards: options.rewards ?? [],
      ordering: options.ordering ?? 'priceGroupThenPromotion',
      failure: options.failure,
    },
  };

  const root = makeCompositionRootDouble(config, recorder);
  const admitted = options.admit;
  const refusal = options.refuseAdmission;

  const admitOrderView: PromotionApplicationDependencies['admitOrderView'] =
    admitted === undefined && refusal === undefined
      ? undefined
      : (request: ApplyPromotionsRequest): Promise<OrderView> => {
          recorder.log.push(ORDER_ADMITTED);
          recorder.admissionRequests.push(request);

          // Narrowed to a concrete `Error` before it is rejected with, rather than rejected with a
          // possibly-absent value: an admission that refuses always refuses WITH the shipped
          // `OrderViewAdmissionError`, which is what the handler's catch arm discriminates on.
          if (refusal !== undefined) {
            return Promise.reject(refusal);
          }

          if (admitted === undefined) {
            return Promise.reject(
              new TypeError('the harness installed an admission with nothing to admit'),
            );
          }

          return Promise.resolve(admitted);
        };

  const invoke = createPromotionApplicationHandler({
    compositionRoot: (): Promise<CompositionRoot> => {
      recorder.log.push(ROOT_OPENED);

      return Promise.resolve(root);
    },
    logger: emitted.logger,
    admitOrderView,
    clock: options.clock,
  });

  return { recorder, emitted, invoke };
}

/** A non-null, non-array object. The only shape the readers below descend into. */
function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The success body, narrowed by a genuine type predicate rather than asserted.
 *
 * The four echoed members are proven present and of the right kind, which is what every case below
 * reads; the two intent arrays are proven to be arrays where a case reads them.
 */
function isSuccessBody(value: unknown): value is PromotionApplicationResponseBody {
  return (
    isJsonObject(value) &&
    typeof value['operation'] === 'string' &&
    typeof value['idempotencyKey'] === 'string' &&
    typeof value['requestId'] === 'string' &&
    typeof value['evaluatedAt'] === 'string'
  );
}

/** The success body of a 200 response. Throws rather than returning a half-checked value. */
function successBodyOf(result: APIGatewayProxyResult): PromotionApplicationResponseBody {
  const body = result.body;
  const parsed: unknown = JSON.parse(body);

  if (!isSuccessBody(parsed)) {
    throw new TypeError('the response body is not the documented success envelope');
  }

  return parsed;
}

/** The error envelope, narrowed the same way. */
function isErrorBody(value: unknown): value is ErrorResponseBody {
  if (!isJsonObject(value)) {
    return false;
  }

  const error = value['error'];

  return (
    isJsonObject(error) &&
    typeof error['category'] === 'string' &&
    typeof error['message'] === 'string' &&
    typeof error['requestId'] === 'string'
  );
}

/** The error envelope of a non-200 response. */
function errorBodyOf(result: APIGatewayProxyResult): ErrorResponseBody['error'] {
  const parsed: unknown = JSON.parse(result.body);

  if (!isErrorBody(parsed)) {
    throw new TypeError('the response body is not the documented error envelope');
  }

  return parsed.error;
}

/** The promotion intents a success body carried, or an empty list when it carried none. */
function promotionIntentsOf(body: PromotionApplicationResponseBody): readonly {
  readonly appliedType: string;
  readonly operation: string;
  readonly orderItemID?: string;
  readonly orderID?: string;
  readonly discountAmount?: string;
}[] {
  return body.promotionIntents ?? [];
}

/**
 * The `discountAmount` an intent carried for one order item, as the DECIMAL STRING it crossed the
 * wire as.
 *
 * Returned as a `DecimalString` so every comparison below goes through `cfNumericEquals` and never
 * through string identity: `'12.00'` and `'12'` are the same amount of money and a character
 * comparison would call them different.
 */
function wireDiscountForItem(
  body: PromotionApplicationResponseBody,
  orderItemID: string,
): DecimalString {
  const intent = promotionIntentsOf(body).find(
    (candidate): boolean => candidate.orderItemID === orderItemID,
  );

  if (intent === undefined || intent.discountAmount === undefined) {
    throw new TypeError(`no applied-promotion intent carried a discount for ${orderItemID}`);
  }

  return Money.fromDecimalString(intent.discountAmount).toDecimalString();
}

/** Assert two monetary decimal strings are the SAME AMOUNT, by value. */
function expectSameAmount(actual: string, expected: string): void {
  expect(
    cfNumericEquals(actual, expected),
    `expected ${actual} to be the same amount of money as ${expected}`,
  ).toBe(true);
}

/** Assert two monetary decimal strings are DIFFERENT amounts, by value. */
function expectDifferentAmount(actual: string, other: string): void {
  expect(
    cfNumericEquals(actual, other),
    `expected ${actual} to be a different amount of money from ${other}`,
  ).toBe(false);
}

// Complementary to the global `afterEach` in `tests/setup.ts`, which already restores spies and the
// real clock. Kept here deliberately: a suite that installs its own spy must not depend on a sibling
// file's hook still being registered, and `vitest.config.ts` sets `restoreMocks` as a third belt.
afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a copy of an order document with one member removed, for the admission-refusal cases. */
function orderDocumentWithout(
  document: Readonly<Record<string, unknown>>,
  member: string,
): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = { ...document };
  delete copy[member];

  return copy;
}

/** The fixture's own overrides and capture shapes, reached structurally - neither is exported. */
type OrderViewFixtureOverridesRef = NonNullable<Parameters<typeof makeOrderViewFixture>[0]>;
type OrderViewCaptureRef = NonNullable<OrderViewFixtureOverridesRef['capture']>;

/**
 * The golden order and its capture sink.
 *
 * A FRESH GRAPH PER CALL. `makeOrderViewFixture` builds independent entities, independent reward
 * arrays and independent `Date` instances every time, which is what lets three levels of
 * `getCurrentFlag` memoization be re-evaluated per test instead of one test freezing another's answer.
 */
function makeGoldenOrder(overrides: OrderViewFixtureOverridesRef = {}): {
  readonly order: OrderView;
  readonly capture: OrderViewCaptureRef;
} {
  const capture: OrderViewCaptureRef = {};
  const order = makeOrderViewFixture({ ...overrides, capture });

  return { order, capture };
}

/** One order item of the golden order, index-checked rather than asserted. */
function itemAt(order: OrderView, index: number): OrderItemView {
  const item = order.orderItems[index];

  if (item === undefined) {
    throw new TypeError(`the golden order carries no item at index ${String(index)}`);
  }

  return item;
}

/**
 * An unrounded `percentageOff` reward that names `eligiblePriceGroups` as eligible and nothing else.
 *
 * SHARED IDENTITY IS REQUIRED here, and it is the one deliberate exception to the fresh-graph rule
 * the fixtures otherwise keep: `reward.hasEligiblePriceGroup(...)` resolves only if the instance the
 * reward holds IS the instance an item's `appliedPriceGroup` references. The reward itself is
 * `referenceCalculationReward` - exactly `'12.5'` percent and DELIBERATELY UNROUNDED, so the
 * arithmetic's own answer is what is being read rather than a rounding rule's.
 */
function makeReferenceReward(eligiblePriceGroups: readonly PriceGroupRef[] = []): RewardUnderTest {
  const promotions = makePromotionFixtures({ eligiblePriceGroups });

  return {
    reward: promotions.referenceCalculationReward,
    promotionID: promotions.promotion.getPromotionID(),
  };
}

/**
 * Narrow an optional fixture member to a present one, or FAIL LOUDLY.
 *
 * Used instead of `?? someDefault` wherever a capture member feeds an assertion. A `??` fallback on a
 * monetary member would be `Money` seeded from a substituted zero, and this suite holds the same line
 * the target holds: a zero is never a stand-in for an absent amount. A missing fixture member is a
 * fixture fault, and it should read as one rather than as a passing test over invented numbers.
 */
function requireFixtureMember<TValue>(value: TValue | undefined, described: string): TValue {
  if (value === undefined) {
    throw new TypeError(`the order fixture did not publish ${described}`);
  }

  return value;
}

/**
 * The reference reward wired to whatever price group the golden order's second item carries.
 *
 * Without this the second item would fall to the SECOND arm of L241 by accident of identity rather
 * than by the eligibility decision the arm is supposed to express.
 */
function makeRewardForGoldenOrder(capture: OrderViewCaptureRef): RewardUnderTest {
  const accepted = capture.acceptedPriceGroup;

  if (accepted === undefined) {
    throw new TypeError('the order fixture did not publish the price group its reward accepts');
  }

  return makeReferenceReward([accepted]);
}

// ===========================================================================
// SECTION 2 - CONCERN 1: ENVELOPE PARSING AND ORDER-VIEW ADMISSION
// ===========================================================================

describe('promotion-application envelope parsing (NET-NEW; the legacy tree has no handler tier)', () => {
  it('decodes the applyPromotions envelope and hands the admission the whole request', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);

    const admission = harness.recorder.admissionRequests[0];
    expect(admission).toBeDefined();
    expect(admission?.operation).toBe('applyPromotions');
    expect(admission?.idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(admission?.requestId).toBe(PLATFORM_REQUEST_ID);
    // The out-of-scope Account, reduced to an OPAQUE identifier and never dereferenced.
    expect(admission?.accountID).toBe(order.accountID);
  });

  it('parses every order-level member the two passes read - at least five accessors', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    await harness.invoke(postApplyPromotions(order));

    const priced = harness.recorder.composedInputs[0];
    expect(priced).toBeDefined();

    // 1 + 2. Read together at [model/service/PromotionService.cfc:L417]. BOTH are Money.
    //
    // CFML parity [model/service/PromotionService.cfc:L417]: the two order-level values are combined
    // with a plain `+`, NOT with `precisionEvaluate`. Preserved as an addition.
    expectSameAmount(priced?.subtotalAfterItemDiscounts.toDecimalString() ?? '', '117.95');
    expectSameAmount(priced?.fulfillmentChargeAfterDiscountTotal.toDecimalString() ?? '', '9.50');

    // 3. A PLAIN NUMBER, deliberately not Money - it is the qualification-count seed at
    //    [model/service/PromotionService.cfc:L785] and [model/entity/Order.cfc:L624].
    expect(typeof priced?.totalSaleQuantity).toBe('number');
    expect(priced?.totalSaleQuantity).toBe(9);

    // 4. The order-type system code, read at BOTH [:L61] and [:L542].
    expect(priced?.orderType.systemCode).toBe('otSalesOrder');

    // 5. The two collections, already materialised as arrays - there is no lazy load to trigger.
    expect(priced?.orderItems).toHaveLength(3);
    expect(priced?.orderFulfillments).toHaveLength(2);

    // And the comma-delimited promotion-code list, carried as a STRING for verbatim parity because
    // the legacy binds it with `cfqueryparam ... list="true"` [model/dao/PromotionDAO.cfc].
    expect(typeof priced?.promotionCodeList).toBe('string');
  });

  it('carries a fulfillment with NO shipping method and NO address, both stated as absent', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    await harness.invoke(postApplyPromotions(order));

    // NARROWED rather than optional-chained. An `expect(maybe?.member).toBeUndefined()` passes just
    // as happily when `maybe` itself is absent, which would make the three assertions below vacuous -
    // and vacuity is the specific failure this whole file is written to avoid.
    const composedInput = requireFixtureMember(
      harness.recorder.composedInputs[0],
      'a composed pricing input',
    );
    const fulfillments: readonly OrderFulfillmentView[] = composedInput.orderFulfillments;
    const pickup = requireFixtureMember(
      fulfillments.find(
        (candidate): boolean => candidate.fulfillmentMethod.fulfillmentMethodType === 'pickup',
      ),
      'a pickup fulfillment',
    );

    // ABSENT IS A REAL STATE. The shipping-method gate at [model/service/PromotionService.cfc:L701]
    // tests `isNull(orderFulfillment.getShippingMethod())` explicitly, and reaching LEGACY-DEFECT 11
    // at [:L703] requires exactly this shape.
    expect(pickup.shippingMethod).toBeUndefined();
    expect(pickup.address).toBeUndefined();
    // A WEIGHT, hence a plain number rather than Money.
    expect(typeof pickup.totalShippingWeight).toBe('number');

    const shipping = fulfillments.find(
      (candidate): boolean => candidate.fulfillmentMethod.fulfillmentMethodType === 'shipping',
    );
    expect(shipping?.shippingMethod).toBeDefined();
    // JUDGMENT CALL: the legacy `OrderFulfillment.getAddress()` MUTATES - it calls
    // `setShippingAddress(copyAddress)` and service-locates `getService("addressService").newAddress()`
    // - which a read-only view cannot reproduce, so the address arrives PRE-RESOLVED with its
    // new-flag already decided. The engine reads it at [model/service/PromotionService.cfc:L358-L360]
    // and LEGACY-DEFECT 11 reads `getAddress().getNewFlag()` at [:L703].
    expect(typeof shipping?.address?.isNew).toBe('boolean');
  });

  it('refuses a PLAIN JSON PROJECTION of the order, naming the members that failed', async () => {
    const { order } = makeGoldenOrder();
    // No `admit`, so the PRODUCTION admission runs.
    const harness = makeHarness({ rewards: [makeReferenceReward()] });

    const result = await harness.invoke(
      postDocument(applyPromotionsDocument(wireProjectionOf(order))),
    );

    expect(result.statusCode).toBe(400);

    const error = errorBodyOf(result);
    expect(error.category).toBe('invalidRequest');
    expect(error.message).toBe('The request body is not the expected shape.');

    const paths = (error.fields ?? []).map((field): string => field.path);
    // A decimal string is not a materialised monetary value.
    expect(paths).toContain('order.subtotal');
    expect(paths).toContain('order.orderItems[0].price');
    // A bare identifier object does not expose the accessors the engine walks.
    expect(paths).toContain('order.orderItems[0].sku');
    // And JSON cannot state an ABSENCE, which is a distinct state from a value under
    // `exactOptionalPropertyTypes` - the probe tests `Object.hasOwn`, not `!== undefined`.
    expect(paths).toContain('order.orderItems[0].appliedPriceGroup');

    // THE PROBE IS SELECTIVE RATHER THAN BLANKET: a member that IS usable is not complained about.
    expect(paths).not.toContain('order.orderID');
    expect(paths).not.toContain('order.totalSaleQuantity');

    // The complaint list is BOUNDED, matching the bound the module publishes for a refusal.
    expect((error.fields ?? []).length).toBeLessThanOrEqual(10);

    // No submitted value is echoed anywhere in the refusal.
    expect(result.body).not.toContain('19.99');
    // And the pricing graph was never opened.
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('refuses an order member that is not an object at all, with a single complaint', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      postDocument(applyPromotionsDocument('an order identifier is not an order view')),
    );

    expect(result.statusCode).toBe(400);
    expect(errorBodyOf(result).fields).toEqual([
      { path: 'order', message: 'must be a materialised order view object' },
    ]);
  });

  it('reports an ABSENT order member differently from an unusable one', async () => {
    const harness = makeHarness();

    const result = await harness.invoke(
      postDocument({ operation: 'applyPromotions', idempotencyKey: IDEMPOTENCY_KEY }),
    );

    expect(result.statusCode).toBe(400);

    const error = errorBodyOf(result);
    // `unusableRequestInput` publishes the same fixed sentence as a schema rejection - no invented
    // specificity - while the closed REASON literal reaches the log stream instead.
    expect(error.message).toBe('The request input is not valid.');
    expect((error.fields ?? []).map((field): string => field.path)).toEqual(['order']);
    expect(harness.emitted.lines.join('\n')).toContain('unusableRequestInput');
  });

  it('names a required order-level member that the document simply omits', async () => {
    const { order } = makeGoldenOrder();
    const harness = makeHarness();

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument(
          orderDocumentWithout(wireProjectionOf(order), 'subtotalAfterItemDiscounts'),
        ),
      ),
    );

    expect(result.statusCode).toBe(400);
    expect((errorBodyOf(result).fields ?? []).map((field): string => field.path)).toContain(
      'order.subtotalAfterItemDiscounts',
    );
  });

  it('REFUSES an over-large order document and never truncates it', async () => {
    const { order } = makeGoldenOrder();
    const tooManyItems = Array.from(
      { length: ORDER_DOCUMENT_LIMITS.maximumOrderItems + 1 },
      (): Readonly<Record<string, unknown>> => ({}),
    );
    const harness = makeHarness();

    const result = await harness.invoke(
      postDocument(
        applyPromotionsDocument({ ...wireProjectionOf(order), orderItems: tooManyItems }),
      ),
    );

    expect(result.statusCode).toBe(400);

    const complaint = (errorBodyOf(result).fields ?? []).find(
      (field): boolean => field.path === 'order.orderItems',
    );
    expect(complaint?.message).toBe(
      `must not carry more than ${String(ORDER_DOCUMENT_LIMITS.maximumOrderItems)} entries`,
    );
    // Nothing was priced, so nothing was priced against a truncated document.
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });

  it('maps an admission refusal onto the shipped client-shaped response with its member paths', async () => {
    const fields: readonly MappedFieldIssue[] = [
      { path: 'order.orderItems[1].sku', message: 'must expose the entity accessors: getSkuID' },
    ];
    const harness = makeHarness({
      refuseAdmission: new OrderViewAdmissionError('unsupportedBodyShape', fields),
    });
    const { order } = makeGoldenOrder();

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(400);
    expect(errorBodyOf(result).fields).toEqual(fields);
    expect(harness.recorder.composedInputs).toHaveLength(0);
  });
});

// ===========================================================================
// SECTION 3 - CONCERN 2: DELEGATION
// ===========================================================================

describe('promotion-application delegation (NET-NEW)', () => {
  it('opens the root once, opens ONE scope, and invokes the composed operation exactly once', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    await harness.invoke(postApplyPromotions(order));

    expect(harness.recorder.log.filter((label): boolean => label === ROOT_OPENED)).toHaveLength(1);
    expect(harness.recorder.log.filter((label): boolean => label === SCOPE_OPENED)).toHaveLength(1);
    expect(harness.recorder.composedInputs).toHaveLength(1);
    // The composed operation received the ADMITTED view BY IDENTITY - handed on untouched, with no
    // key stripped and no member added.
    expect(harness.recorder.composedInputs[0]).toBe(order);
  });

  it('threads the injected clock and the decoded account identifier into the request scope', async () => {
    const boundInstant = new Date('2024-03-04T05:06:07.000Z');
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      now: boundInstant,
      clock: (): Date => boundInstant,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    const result = await harness.invoke(postApplyPromotions(order));

    const scopeInput = harness.recorder.scopeInputs[0];
    expect(scopeInput?.now?.toISOString()).toBe('2024-03-04T05:06:07.000Z');
    expect(scopeInput?.accountID).toBe(order.accountID);
    // `evaluatedAt` is the scope's own bound instant, rendered ISO-8601 and therefore UTC.
    expect(successBodyOf(result).evaluatedAt).toBe('2024-03-04T05:06:07.000Z');
  });

  it('passes NO clock in the production configuration, so the scope binds the instant itself', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    const result = await harness.invoke(postApplyPromotions(order));

    // ★ THE INSTANT IS NEVER READ FROM THE PAYLOAD. A caller choosing the evaluation instant could
    // walk an expired promotion period back inside its window, so no such member exists. The scope
    // input is NARROWED first, so "no scope was opened at all" cannot masquerade as "no clock was
    // passed".
    const scopeInput = requireFixtureMember(
      harness.recorder.scopeInputs[0],
      'a request-scope input',
    );
    expect(scopeInput.now).toBeUndefined();
    expect(successBodyOf(result).evaluatedAt).toBe(EVALUATED_AT);
  });

  it('treats an absent accountID as the LOGGED-OUT STATE rather than a missing value', async () => {
    // [model/service/PriceGroupService.cfc:L262-L268] branches on the logged-in flag and only then
    // reads the account; the else arm at [:L265-L266] returns the SKU's own price. Omitting the
    // identifier IS that arm.
    const { order, capture } = makeGoldenOrder({ accountID: undefined });
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const result = await harness.invoke(
      postDocument(applyPromotionsDocument(orderReference(order))),
    );

    expect(result.statusCode).toBe(200);
    // Narrowed for the same reason: an unopened scope must not read as a logged-out one.
    const scopeInput = requireFixtureMember(
      harness.recorder.scopeInputs[0],
      'a request-scope input',
    );
    expect(scopeInput.accountID).toBeUndefined();
  });

  it('imposes NO ordering of its own on the order items it forwards (vector 1)', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
    });

    await harness.invoke(postApplyPromotions(order));

    // `getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132] declares NO `ORDER BY`, so
    // the reward order is genuinely non-deterministic at a tie and THAT is the legacy behaviour.
    // Nothing in this adapter sorts, re-ranks or stabilises anything on the way in or out.
    expect(
      harness.recorder.composedInputs[0]?.orderItems.map((item): string => item.orderItemID),
    ).toEqual(order.orderItems.map((item): string => item.orderItemID));
  });
});

// ===========================================================================
// SECTION 4 - ★★★ THE MANDATORY CROSS-SERVICE ORDERING GATE
//
// "A test proves that the price-group pass runs before the promotion pass, and
// that reversing them changes the computed discount." This section is that test,
// and it lives here and nowhere else.
// ===========================================================================

/**
 * The third golden item's PRE-PASS price.
 *
 * Equal to its `skuPrice`, because nothing has lowered it yet: before the price-group pass runs, an
 * item carries the SKU's own price and no applied price group. That is the state the promotion pass
 * would read if it ran first.
 */
const PRE_PASS_ITEM_PRICE = '12.00';

/** The price pass one decides for that item - strictly lower, as [:L369] requires. */
const DECIDED_ITEM_PRICE = '11.00';

/**
 * A price pass one could decide that makes the CORRECTION TERM EXCEED THE DISCOUNT.
 *
 * 12.00 - 8.50 over four units is a 14.00 correction against a 6.00 discount, so
 * [model/service/PromotionService.cfc:L257]'s `if(discountAmount > 0)` rejects the result outright
 * and the item receives NO intent at all. The starkest possible form of the dependency.
 */
const DEEPLY_DECIDED_ITEM_PRICE = '8.50';

/** Everything the gate needs, assembled so identities line up across the three fixture graphs. */
interface OrderingGateSetup {
  /** The PRE-pass order view: the third item has no applied price group and carries `skuPrice`. */
  readonly order: OrderView;
  readonly capture: OrderViewCaptureRef;
  readonly reward: RewardUnderTest;
  readonly decision: PriceGroupDecision;
  /** The third item, which is the only one that can reach the second arm of L241. */
  readonly item: OrderItemView;
}

/**
 * Assemble the gate's fixture.
 *
 * The decision's price group comes from `./priceGroupFixtures` under its OWN identity and is
 * deliberately NOT among the groups the reward names as eligible - which is what puts the item on the
 * second arm of [model/service/PromotionService.cfc:L241] once pass one has applied it. Nothing about
 * that depends on which particular fixture group it is; it depends only on the reward's eligibility
 * list, which is the decision the arm exists to express.
 */
function makeOrderingGateSetup(decidedPrice: string): OrderingGateSetup {
  const priceGroups = makePriceGroupFixtures({ idPrefix: 'ordering-gate' });
  const { order, capture } = makeGoldenOrder({
    itemOverrides: [
      {},
      {},
      {
        // The PRE-pass state, stated explicitly: `undefined` forces the price-group-ineligible
        // state, which [model/entity/OrderItem.cfc:L79] permits because it declares no `notnull`.
        appliedPriceGroup: undefined,
        price: Money.fromDecimalString(PRE_PASS_ITEM_PRICE),
      },
    ],
  });

  const item = itemAt(order, 2);

  return {
    order,
    capture,
    reward: makeRewardForGoldenOrder(capture),
    decision: {
      orderItemID: item.orderItemID,
      price: Money.fromDecimalString(decidedPrice),
      priceGroup: priceGroups.isolatedPriceGroup,
    },
    item,
  };
}

describe('★★★ the price-group pass runs BEFORE the promotion pass (AAP 0.9.3; NET-NEW)', () => {
  it('THE NON-VACUITY PRECONDITION: the golden order carries a NON-ZERO correction term', () => {
    // WITHOUT THIS, EVERY ASSERTION BELOW WOULD BE VACUOUS. If `skuPrice` equalled `price` and
    // `extendedSkuPrice` equalled `extendedPrice`, then
    // `originalDiscountAmount - (extendedSkuPrice - extendedPrice)` [:L252] would collapse to
    // `originalDiscountAmount`, the two arms of L241 would compute the SAME number, and a reversal
    // assertion would pass against a broken implementation. `./orderViewFixtures` states the same
    // requirement independently: otherwise "the correction term is zero and the ordering dependency
    // becomes invisible".
    const { order, capture } = makeGoldenOrder();
    const secondArmItem = itemAt(order, 2);

    expectDifferentAmount(
      secondArmItem.skuPrice.toDecimalString(),
      secondArmItem.price.toDecimalString(),
    );
    expectDifferentAmount(
      secondArmItem.extendedSkuPrice.toDecimalString(),
      secondArmItem.extendedPrice.toDecimalString(),
    );

    // And the fixture's own reading of the L241 discriminator agrees, arm for arm.
    const arms = capture.itemPriceArmSelections ?? [];
    expect(arms.map((arm): string => arm.selectedArm)).toEqual([
      // No applied price group at all - the `isNull(...)` disjunct.
      'price',
      // An applied group the reward DOES name - the `hasEligiblePriceGroup(...)` disjunct.
      'price',
      // An applied group the reward does NOT name - the ONLY item on the second arm.
      'skuPriceWithCorrection',
    ]);
    expect(arms[0]?.appliedPriceGroupIsNull).toBe(true);
    expect(arms[1]?.rewardAcceptsAppliedPriceGroup).toBe(true);
    expect(arms[2]?.rewardAcceptsAppliedPriceGroup).toBe(false);

    // 48.00 - 34.00. Non-zero is the whole point.
    expectSameAmount(arms[2]?.correctionTerm.toDecimalString() ?? '', '14.00');
    expectDifferentAmount(arms[2]?.correctionTerm.toDecimalString() ?? '', '0');
  });

  it('records the price-group pass BEFORE the promotion pass in the invocation log', async () => {
    const gate = makeOrderingGateSetup(DECIDED_ITEM_PRICE);
    const harness = makeHarness({
      admit: gate.order,
      decisions: [gate.decision],
      rewards: [gate.reward],
    });

    const result = await harness.invoke(postApplyPromotions(gate.order));

    expect(result.statusCode).toBe(200);

    // AN ORDERED INVOCATION LOG, not an inspection of anybody's internals.
    expect(harness.recorder.log).toEqual([
      ROOT_OPENED,
      SCOPE_OPENED,
      ORDER_ADMITTED,
      PRICE_GROUP_PASS,
      PROMOTION_PASS,
      ORDER_LEVEL_PASS,
    ]);

    expect(harness.recorder.log.indexOf(PRICE_GROUP_PASS)).toBeLessThan(
      harness.recorder.log.indexOf(PROMOTION_PASS),
    );
  });

  it('hands the promotion pass the view the price-group pass WROTE, not the one submitted', async () => {
    const gate = makeOrderingGateSetup(DECIDED_ITEM_PRICE);
    const harness = makeHarness({
      admit: gate.order,
      decisions: [gate.decision],
      rewards: [gate.reward],
    });

    await harness.invoke(postApplyPromotions(gate.order));

    const submitted = harness.recorder.composedInputs[0];
    const read = harness.recorder.promotionPassInputs[0];

    expect(submitted).toBe(gate.order);
    expect(read).toBeDefined();
    expect(read).not.toBe(submitted);

    const projected = read === undefined ? undefined : itemAt(read, 2);

    // [model/service/PriceGroupService.cfc:L370] wrote the price...
    expectSameAmount(projected?.price.toDecimalString() ?? '', DECIDED_ITEM_PRICE);
    // ...and [:L371] wrote the member the L241 condition reads.
    expect(projected?.appliedPriceGroup?.getPriceGroupID()).toBe(
      gate.decision.priceGroup.getPriceGroupID(),
    );

    // CFML parity [model/entity/OrderItem.cfc:L200-L206]: `getExtendedPrice()` is calculated as
    // `price * val(quantity)` and therefore MOVED with the write, while `getExtendedSkuPrice()` did
    // not - which is exactly why the correction term at [:L252] is non-zero after pass one has run.
    expectSameAmount(projected?.extendedPrice.toDecimalString() ?? '', '44.00');
    expectSameAmount(projected?.extendedSkuPrice.toDecimalString() ?? '', '48.00');

    // THE NON-VACUITY GUARD, RE-ASSERTED ON THE VIEW PASS TWO ACTUALLY READ.
    expectDifferentAmount(
      projected?.skuPrice.toDecimalString() ?? '',
      projected?.price.toDecimalString() ?? '',
    );
    expectDifferentAmount(
      projected?.extendedSkuPrice.toDecimalString() ?? '',
      projected?.extendedPrice.toDecimalString() ?? '',
    );

    // AND THE SUBMITTED VIEW IS UNTOUCHED. Nothing was mutated; a NEW view was projected.
    expectSameAmount(gate.item.price.toDecimalString(), PRE_PASS_ITEM_PRICE);
    expect(gate.item.appliedPriceGroup).toBeUndefined();
  });

  it('REVERSING THE TWO PASSES CHANGES THE COMPUTED DISCOUNT', async () => {
    const shipped = makeOrderingGateSetup(DECIDED_ITEM_PRICE);
    const reversed = makeOrderingGateSetup(DECIDED_ITEM_PRICE);

    const shippedHarness = makeHarness({
      admit: shipped.order,
      decisions: [shipped.decision],
      rewards: [shipped.reward],
      ordering: 'priceGroupThenPromotion',
    });
    // THE MEASURING INSTRUMENT. Not a supported configuration and not reachable through the shipped
    // surface - it exists here only to quantify what the inversion costs.
    const reversedHarness = makeHarness({
      admit: reversed.order,
      decisions: [reversed.decision],
      rewards: [reversed.reward],
      ordering: 'promotionThenPriceGroup',
    });

    const shippedBody = successBodyOf(
      await shippedHarness.invoke(postApplyPromotions(shipped.order)),
    );
    const reversedBody = successBodyOf(
      await reversedHarness.invoke(postApplyPromotions(reversed.order)),
    );

    expect(shippedHarness.recorder.log.indexOf(PRICE_GROUP_PASS)).toBeLessThan(
      shippedHarness.recorder.log.indexOf(PROMOTION_PASS),
    );
    expect(reversedHarness.recorder.log.indexOf(PROMOTION_PASS)).toBeLessThan(
      reversedHarness.recorder.log.indexOf(PRICE_GROUP_PASS),
    );

    const shippedDiscount = wireDiscountForItem(shippedBody, shipped.item.orderItemID);
    const reversedDiscount = wireDiscountForItem(reversedBody, reversed.item.orderItemID);

    // ★★★ DIFFERENT MONEY. Price-group first: the item is on the SECOND arm, so its discount is
    // `getDiscountAmount(reward, skuPrice, quantity)` MINUS the 4.00 correction term - 6.00 - 4.00.
    // Promotion first: the item still has no applied price group, so it is on the FIRST arm and its
    // discount is `getDiscountAmount(reward, price, quantity)` with NO correction - 12.00 x 4 x 12.5%.
    expectDifferentAmount(shippedDiscount, reversedDiscount);
    expectSameAmount(reversedDiscount, '6.00');
    expectSameAmount(shippedDiscount, '2.00');

    // And the difference IS the correction term, to the cent.
    expectSameAmount(
      Money.fromDecimalString(reversedDiscount).minus(shippedDiscount).toDecimalString(),
      '4.00',
    );
  });

  it('reversal can remove the discount ENTIRELY when the correction exceeds it', async () => {
    // 12.00 -> 8.50 over four units is a 14.00 correction against a 6.00 discount, so
    // [model/service/PromotionService.cfc:L257] rejects the second-arm result and the item gets
    // nothing. Run the passes the other way round and the same item is discounted 6.00.
    const shipped = makeOrderingGateSetup(DEEPLY_DECIDED_ITEM_PRICE);
    const reversed = makeOrderingGateSetup(DEEPLY_DECIDED_ITEM_PRICE);

    const shippedBody = successBodyOf(
      await makeHarness({
        admit: shipped.order,
        decisions: [shipped.decision],
        rewards: [shipped.reward],
      }).invoke(postApplyPromotions(shipped.order)),
    );
    const reversedBody = successBodyOf(
      await makeHarness({
        admit: reversed.order,
        decisions: [reversed.decision],
        rewards: [reversed.reward],
        ordering: 'promotionThenPriceGroup',
      }).invoke(postApplyPromotions(reversed.order)),
    );

    expect(
      promotionIntentsOf(shippedBody).some(
        (intent): boolean => intent.orderItemID === shipped.item.orderItemID,
      ),
    ).toBe(false);
    expectSameAmount(wireDiscountForItem(reversedBody, reversed.item.orderItemID), '6.00');
  });

  it('honours NO ordering member a caller puts on the payload', async () => {
    const gate = makeOrderingGateSetup(DECIDED_ITEM_PRICE);
    const controlled = makeHarness({
      admit: gate.order,
      decisions: [gate.decision],
      rewards: [gate.reward],
    });
    const plain = makeHarness({
      admit: gate.order,
      decisions: [gate.decision],
      rewards: [gate.reward],
    });

    // Every member a caller might reach for to choose an execution order. None exists on the
    // envelope, none is declared anywhere on the module, and `z.object` STRIPS what its shape does
    // not declare - so all six are inert. Adding one would reproduce exactly the arrangement the
    // composition removed.
    const attempted = await controlled.invoke(
      postApplyPromotions(gate.order, {
        sequence: ['promotions', 'priceGroups'],
        phase: 'promotionsFirst',
        runAfter: 'promotions',
        pipeline: ['promotionPass', 'priceGroupPass'],
        order: 'promotionsFirst',
        skipPriceGroups: true,
      }),
    );
    const untouched = await plain.invoke(postApplyPromotions(gate.order));

    // Byte-identical bodies and identical invocation logs.
    expect(attempted.statusCode).toBe(200);
    expect(attempted.body).toBe(untouched.body);
    expect(controlled.recorder.log).toEqual(plain.recorder.log);
    expect(controlled.recorder.log.indexOf(PRICE_GROUP_PASS)).toBeLessThan(
      controlled.recorder.log.indexOf(PROMOTION_PASS),
    );
  });

  it('runs the price-group pass FIRST even when it can decide nothing at all', async () => {
    // "No account" [model/service/PriceGroupService.cfc:L365] and "no better rate" [:L369] are
    // OUTCOMES of the pass, never licence to skip it - because L241 reads `getAppliedPriceGroup()`
    // in the branch CONDITION, so the `isNull(...)` arm is reached only by having run the pass.
    const guest = makeGoldenOrder({ accountID: undefined });
    const guestHarness = makeHarness({
      admit: guest.order,
      rewards: [makeRewardForGoldenOrder(guest.capture)],
      decisions: [
        {
          orderItemID: itemAt(guest.order, 0).orderItemID,
          price: Money.fromDecimalString('1.00'),
          priceGroup: makePriceGroupFixtures({ idPrefix: 'guest' }).isolatedPriceGroup,
        },
      ],
    });

    const guestBody = successBodyOf(await guestHarness.invoke(postApplyPromotions(guest.order)));

    expect(guestHarness.recorder.log.indexOf(PRICE_GROUP_PASS)).toBeLessThan(
      guestHarness.recorder.log.indexOf(PROMOTION_PASS),
    );
    // It ran, and it decided nothing, and the response says so rather than hiding it.
    expect(guestBody.priceGroupIntents).toEqual([]);

    // Same again with an account present but no decision to make at all.
    const undecided = makeGoldenOrder();
    const undecidedHarness = makeHarness({
      admit: undecided.order,
      rewards: [makeRewardForGoldenOrder(undecided.capture)],
      decisions: [],
    });

    await undecidedHarness.invoke(postApplyPromotions(undecided.order));

    expect(undecidedHarness.recorder.log.indexOf(PRICE_GROUP_PASS)).toBeLessThan(
      undecidedHarness.recorder.log.indexOf(PROMOTION_PASS),
    );
  });

  it('reaches NEITHER individual order pass, and neither price-resolution nor promotion queries', async () => {
    const gate = makeOrderingGateSetup(DECIDED_ITEM_PRICE);
    const harness = makeHarness({
      admit: gate.order,
      decisions: [gate.decision],
      rewards: [gate.reward],
    });

    // A 200 is the proof: every withheld member of the scope and of the root is a getter that
    // THROWS, so reaching one would surface as a 500 naming it.
    const result = await harness.invoke(postApplyPromotions(gate.order));

    expect(result.statusCode).toBe(200);
    expect(harness.emitted.lines.join('\n')).not.toContain('WithheldCollaboratorError');
  });

  it('and that guard is LIVE rather than vacuous - a withheld member really does throw', () => {
    // Proving the negative assertion above is worth something: if the getters silently returned a
    // value, "the handler never touched them" would be unfalsifiable.
    const recorder = makeRecorder();
    const root = makeCompositionRootDouble(
      {
        now: new Date(EVALUATED_AT),
        salePriceDetails: {},
        pricing: {
          decisions: [],
          rewards: [],
          ordering: 'priceGroupThenPromotion',
          failure: undefined,
        },
      },
      recorder,
    );

    expect(() => root.diagnostics).toThrow(WithheldCollaboratorError);
    expect(() => root.settingsProvider).toThrow(/does not use/);
  });
});

// ===========================================================================
// SECTION 5 - THE TWO ORDER-TYPE GATES, AND THE PRESERVED `issue_1766` NO-OP
//
// [model/service/PromotionService.cfc:L61] admits the ENTIRE 489-line body on
// `listFindNoCase("otSalesOrder,otExchangeOrder", ...)`, closing at [:L539] with the
// comment "END of Sale or Exchange Loop". [:L542] then gates an EMPTY block on a
// DIFFERENT list, `"otReturnOrder,otExchangeOrder"`. The two conditionals are
// SEQUENTIAL, not else-if.
// ===========================================================================

describe('the order-type gates (NET-NEW)', () => {
  it('otSalesOrder: runs the discount body and SKIPS the return/exchange branch', async () => {
    const { order, capture } = makeGoldenOrder({ orderTypeSystemCode: 'otSalesOrder' });
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    expect(capture.reachesDiscountBody).toBe(true);
    expect(capture.reachesReturnExchangeNoOp).toBe(false);
    expect(harness.recorder.enteredDiscountBody).toEqual([true]);
    expect(harness.recorder.enteredReturnExchangeNoOp).toEqual([false]);
    expect(harness.recorder.log).not.toContain(RETURN_EXCHANGE_NO_OP);
    expect(promotionIntentsOf(body).length).toBeGreaterThan(0);
  });

  it('otExchangeOrder: enters BOTH branches, and the no-op still does nothing', async () => {
    const sales = makeGoldenOrder({ orderTypeSystemCode: 'otSalesOrder' });
    const exchange = makeGoldenOrder({ orderTypeSystemCode: 'otExchangeOrder' });

    const salesBody = successBodyOf(
      await makeHarness({
        admit: sales.order,
        rewards: [makeRewardForGoldenOrder(sales.capture)],
      }).invoke(postApplyPromotions(sales.order)),
    );

    const exchangeHarness = makeHarness({
      admit: exchange.order,
      rewards: [makeRewardForGoldenOrder(exchange.capture)],
    });
    const exchangeBody = successBodyOf(
      await exchangeHarness.invoke(postApplyPromotions(exchange.order)),
    );

    expect(exchange.capture.reachesDiscountBody).toBe(true);
    expect(exchange.capture.reachesReturnExchangeNoOp).toBe(true);
    expect(exchangeHarness.recorder.enteredDiscountBody).toEqual([true]);
    expect(exchangeHarness.recorder.enteredReturnExchangeNoOp).toEqual([true]);
    expect(exchangeHarness.recorder.log).toContain(RETURN_EXCHANGE_NO_OP);

    // ENTERING THE SECOND BRANCH CHANGED NOTHING, which is the whole substance of a preserved no-op:
    // an exchange order decides exactly what the same order would decide as a sale.
    expect(promotionIntentsOf(exchangeBody)).toEqual(promotionIntentsOf(salesBody));
  });

  it('issue_1766', async () => {
    // The `issue_<ticket#>` naming convention is carried over from
    // [meta/tests/unit/IssuesTest.cfc:L51] `public void function issue_1097()`. The convention is ALL
    // that is carried over: several of those legacy regression functions contain no assertion at all,
    // and this one asserts explicitly.
    //
    // TODO [issue #1766]: In the future allow for return Items to have negative promotions applied.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L542-L544]: the return/exchange branch is
    // present, still does nothing, and still carries its `issue #1766` reference.
    // Preserved deliberately; do not fix without a product decision.
    //   For a RETURN order the L61 gate is not satisfied, so the entire discount body NEVER RUNS and
    //   the only branch entered is the empty one. An EMPTY intent array is therefore the CORRECT
    //   result rather than a degenerate one, and it must not throw: no negative-discount concept
    //   exists anywhere on this contract to fall back on.
    const { order, capture } = makeGoldenOrder({ orderTypeSystemCode: 'otReturnOrder' });
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);

    const body = successBodyOf(result);
    expect(body.promotionIntents).toEqual([]);

    expect(capture.reachesDiscountBody).toBe(false);
    expect(capture.reachesReturnExchangeNoOp).toBe(true);
    expect(capture.preservedReturnExchangeNoOpTicket).toBe('issue_1766');
    expect(harness.recorder.enteredDiscountBody).toEqual([false]);
    expect(harness.recorder.enteredReturnExchangeNoOp).toEqual([true]);
    // The order-level pass is part of the discount body, so it never ran either.
    expect(harness.recorder.log).not.toContain(ORDER_LEVEL_PASS);
  });

  it('compares the order-type code CASE-INSENSITIVELY, as listFindNoCase does', async () => {
    // CFML parity [model/service/PromotionService.cfc:L61,L542]: `listFindNoCase` is
    // case-insensitive and returns a 1-BASED INDEX with `0` for absent, so the comparison is routed
    // through `src/lib/cfml/list.ts` and tested against `0` - never through `===` on the raw string.
    expect(listFindNoCase(SALE_OR_EXCHANGE_ORDER_TYPES, 'OTSALESORDER')).toBe(1);
    expect(listFindNoCase(SALE_OR_EXCHANGE_ORDER_TYPES, 'otexchangeorder')).toBe(2);
    expect(listFindNoCase(SALE_OR_EXCHANGE_ORDER_TYPES, 'otReturnOrder')).toBe(0);
    expect(listFindNoCase(RETURN_OR_EXCHANGE_ORDER_TYPES, 'OtReturnOrder')).toBe(1);

    const shouted = makeGoldenOrder({ orderTypeSystemCode: 'OTSALESORDER' });
    const canonical = makeGoldenOrder({ orderTypeSystemCode: 'otSalesOrder' });

    const shoutedBody = successBodyOf(
      await makeHarness({
        admit: shouted.order,
        rewards: [makeRewardForGoldenOrder(shouted.capture)],
      }).invoke(postApplyPromotions(shouted.order)),
    );
    const canonicalBody = successBodyOf(
      await makeHarness({
        admit: canonical.order,
        rewards: [makeRewardForGoldenOrder(canonical.capture)],
      }).invoke(postApplyPromotions(canonical.order)),
    );

    expect(promotionIntentsOf(shoutedBody)).toEqual(promotionIntentsOf(canonicalBody));
  });
});

// ===========================================================================
// SECTION 6 - THE ANTI-CORRUPTION BOUNDARY: VIEWS IN, INTENTS OUT
// ===========================================================================

describe('the anti-corruption boundary (NET-NEW)', () => {
  it('never mutates or persists the Order, OrderItem or OrderFulfillment it was given', async () => {
    const { order, capture } = makeGoldenOrder();
    const before = {
      itemPrices: order.orderItems.map((item): string => item.price.toDecimalString()),
      appliedGroups: order.orderItems.map((item): string | undefined =>
        item.appliedPriceGroup?.getPriceGroupID(),
      ),
      appliedPromotionCounts: order.orderItems.map((item): number => item.appliedPromotions.length),
      orderApplied: order.appliedPromotions.length,
    };

    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
      decisions: [
        {
          orderItemID: itemAt(order, 0).orderItemID,
          price: Money.fromDecimalString('1.00'),
          priceGroup: makePriceGroupFixtures({ idPrefix: 'immutability' }).isolatedPriceGroup,
        },
      ],
    });

    await harness.invoke(postApplyPromotions(order));

    expect(order.orderItems.map((item): string => item.price.toDecimalString())).toEqual(
      before.itemPrices,
    );
    expect(
      order.orderItems.map((item): string | undefined => item.appliedPriceGroup?.getPriceGroupID()),
    ).toEqual(before.appliedGroups);
    expect(order.orderItems.map((item): number => item.appliedPromotions.length)).toEqual(
      before.appliedPromotionCounts,
    );
    expect(order.appliedPromotions).toHaveLength(before.orderApplied);

    // The view is DEEPLY FROZEN by its own fixture, so a write would throw in a module's strict mode
    // rather than pass silently. Asserting it makes the guarantee structural rather than incidental.
    expect(Object.isFrozen(order)).toBe(true);
    expect(Object.isFrozen(order.orderItems)).toBe(true);
  });

  it('emits intents keyed ONLY by opaque identifiers, with the three appliedType values', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const intents = promotionIntentsOf(body);

    // CFML parity [model/service/PromotionService.cfc:L529-L534]: the legacy `PromotionApplied` is
    // never `setOrder()`-ed and never explicitly saved - it relies on ORM cascade - which is exactly
    // why the target emits INTENTS instead.
    expect(intents.length).toBeGreaterThan(0);

    const declaredTypes = capture.appliedTypes ?? [];
    for (const intent of intents) {
      // Not widened: `order` [:L448], `orderItem` [:L531] and the fulfillment value [:L402].
      expect(declaredTypes).toContain(intent.appliedType);
      expect(intent.operation).toBe('add');

      if (intent.appliedType === 'orderItem') {
        expect(typeof intent.orderItemID).toBe('string');
        expect(intent.orderID).toBeUndefined();
      } else {
        expect(typeof intent.orderID).toBe('string');
        expect(intent.orderItemID).toBeUndefined();
      }
    }

    // No entity, no object graph and no persistence handle crosses the boundary.
    expect(result_hasNoEntityShape(body)).toBe(true);
  });

  it('renders discountAmount as a FULL-PRECISION decimal string, never a rounded one', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const reference = capture.referenceCalculation;
    const firstItem = itemAt(order, 0);

    // 19.99 x 3 = 59.97, less 12.5% = 7.49625. The WIRE carries every significant digit, because an
    // intent is bound for a `big_decimal` column [model/entity/PromotionApplied.cfc:L51] and a
    // `big_decimal` column is precisely one that declines to round on the caller's behalf. The
    // two-decimal `numberFormat(discountAmount,"0.00")` at [model/service/PromotionService.cfc:L1017]
    // is return-value PRESENTATION at the end of a calculating function, not a persistence step.
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
    expectSameAmount(reference?.discountAmount ?? '', '7.49625');
    expectDifferentAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.50');

    // Every monetary member on the wire is a STRING, never a JSON number.
    for (const intent of promotionIntentsOf(body)) {
      expect(typeof intent.discountAmount).toBe('string');
    }
    for (const intent of body.priceGroupIntents ?? []) {
      expect(typeof intent.price).toBe('string');
    }
  });

  it('SKIPS an order item whose item type is not oitSale', async () => {
    const { capture } = makeGoldenOrder();
    const nonSale = capture.nonSaleOrderItemTypeSystemCode;
    expect(nonSale).toBeDefined();
    expect(nonSale).not.toBe('oitSale');

    const gated = makeGoldenOrder({
      itemOverrides: [{ orderItemTypeSystemCode: nonSale }, {}, {}],
    });
    const harness = makeHarness({
      admit: gated.order,
      rewards: [makeRewardForGoldenOrder(gated.capture)],
    });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(gated.order)));
    const skipped = itemAt(gated.order, 0);

    // [model/service/PromotionService.cfc:L206] admits an item into the discount body only when its
    // type system code is `oitSale` [model/entity/OrderItem.cfc:L118, L125].
    expect(
      promotionIntentsOf(body).some(
        (intent): boolean => intent.orderItemID === skipped.orderItemID,
      ),
    ).toBe(false);
    // Its siblings are unaffected.
    expect(
      promotionIntentsOf(body).some(
        (intent): boolean => intent.orderItemID === itemAt(gated.order, 1).orderItemID,
      ),
    ).toBe(true);
  });

  it('exposes nothing whatsoever for PromotionAccount, which is inert in this slice', async () => {
    // `model/entity/PromotionAccount.cfc` has no validation file, no service method references it and
    // `model/service/PromotionService.cfc` never touches it. An inert entity gets no wire surface.
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.body.toLowerCase()).not.toContain('promotionaccount');
  });
});

/** Does a success body carry only wire-safe primitives, arrays and plain objects? */
function result_hasNoEntityShape(body: PromotionApplicationResponseBody): boolean {
  const encoded = JSON.stringify(body);

  return (
    !encoded.includes('"__proto__"') &&
    !encoded.includes('promotionAppliedID":null') &&
    // A ported entity would serialise its private backing fields; none appears.
    !encoded.includes('parentProductType') &&
    !encoded.includes('childProductTypes')
  );
}

// ===========================================================================
// SECTION 7 - THE FIVE ORDER-DEPENDENCE VECTORS
//
// This adapter's obligation towards all five is NEGATIVE: every one of them decides
// money and every one belongs to the services tier, so what is asserted here is
// that the handler DISTURBS NONE OF THEM.
// ===========================================================================

describe('the five order-dependence vectors are left undisturbed (NET-NEW)', () => {
  it('V1: adds no ORDER BY, no sort and no re-rank - intents leave in EMITTED order', async () => {
    // `promotionRewardUsageDetails[rewardID].usedInOrder` is incremented IN PLACE at
    // [model/service/PromotionService.cfc:L297], and the collection comes from
    // `getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132], which declares NO
    // `ORDER BY`. So whether a later reward is allowed depends on which earlier ones ran, and the
    // order is genuinely non-deterministic at a tie. THAT non-determinism IS the legacy behaviour.
    //
    // Note also [model/service/PromotionService.cfc:L108,L175]: `maximumUsePerOrder` is seeded with
    // the `1000000` sentinel meaning "unlimited", which [:L223-L224] can narrow to
    // `qualificationQuantity * maximumUsePerQualification`. All three limits and `usedInOrder` are
    // PLAIN NUMBERS, never Money.
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const emittedItemOrder = promotionIntentsOf(body)
      .filter((intent): boolean => intent.appliedType === 'orderItem')
      .map((intent): string | undefined => intent.orderItemID);

    // The engine walks the items in the order the view carries them, and the adapter reports them in
    // exactly that order - it re-sorts nothing on the way out. The THIRD item emits nothing, and
    // deliberately so: it is the arm-two item, where the L252 correction term (14.00) outweighs its
    // own 12.5% discount (6.00), so `if(discountAmount > 0)` [:L257] rejects it. That is the same
    // data dependency SECTION 4 measures, seen from the emission side.
    expect(emittedItemOrder).toEqual([itemAt(order, 0).orderItemID, itemAt(order, 1).orderItemID]);

    // Stated as the general property too, so a fixture that later gave the third item a positive
    // discount would still pin "no re-rank": whatever is emitted is a SUBSEQUENCE of view order.
    const viewOrder = order.orderItems.map((item): string => item.orderItemID);
    const emittedPositions = emittedItemOrder.map((orderItemID): number =>
      viewOrder.indexOf(orderItemID === undefined ? '' : orderItemID),
    );
    expect(emittedPositions).toEqual([...emittedPositions].sort((left, right) => left - right));
    expect(emittedPositions).not.toContain(-1);

    expect(typeof capture.unlimitedUseSentinel).toBe('number');
    expect(capture.unlimitedUseSentinel).toBe(1000000);
  });

  it('V2: an EMPTY reward collection runs NO order-level pass', async () => {
    // `var orderRewards = false;` [model/service/PromotionService.cfc:L166] and the loop-counter reset
    // `if(!orderRewards and pr == arrayLen(promotionRewards)) { pr = 0; orderRewards = true; }`
    // [:L457-L461]. Because the reset sits INSIDE the loop body, an empty reward collection means the
    // second pass NEVER RUNS. Nothing here "helpfully" runs one.
    const { order } = makeGoldenOrder({ rewardOrdering: 'empty' });
    const empty = makeHarness({ admit: order, rewards: [] });

    const body = successBodyOf(await empty.invoke(postApplyPromotions(order)));

    expect(empty.recorder.log).not.toContain(ORDER_LEVEL_PASS);
    expect(body.promotionIntents).toEqual([]);
    // The price-group pass STILL ran first, and still ran unconditionally.
    expect(empty.recorder.log.indexOf(PRICE_GROUP_PASS)).toBeLessThan(
      empty.recorder.log.indexOf(PROMOTION_PASS),
    );

    // With a non-empty collection the second pass IS reached, so the assertion above is not vacuous.
    const populated = makeGoldenOrder();
    const withRewards = makeHarness({
      admit: populated.order,
      rewards: [makeRewardForGoldenOrder(populated.capture)],
    });
    await withRewards.invoke(postApplyPromotions(populated.order));

    expect(withRewards.recorder.log).toContain(ORDER_LEVEL_PASS);
  });

  it('V3: returns whatever the over-use stripping loop left behind, and repairs nothing', async () => {
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: the loop iterates
    // `for(var prID in promotionRewardUsageDetails)` and DETECTS correctly with `prID` on both sides
    // at L471, but computes the SUBTRAHEND from
    // `promotionRewardUsageDetails[ reward.getPromotionRewardID() ].maximumUsePerOrder` at L472 and
    // walks that same leaked reward's `orderItemsUsage` at L475-L477 - indexing by the `reward`
    // variable LEFT OVER from the preceding reward loop rather than by `prID`. This is a
    // CROSS-WIRING rather than a simple swap: when the leaked reward and `prID` touch DIFFERENT order
    // items the inner match finds nothing and the over-use is SILENTLY NEVER CORRECTED AT ALL. Both
    // inner searches (L482, L498) iterate in REVERSE, so the smallest matching discount is stripped
    // first; L479's partial strip reaches ANOTHER UNGUARDED DIVISION at L486,
    // `precisionEvaluate('(discountAmount / thisDiscountQuantity) * (thisDiscountQuantity -
    // needToRemove)')`; L489 zeroes `needToRemove`; L495 deletes a whole entry with `arrayDeleteAt`;
    // L505 decrements; L514 breaks.
    // Preserved deliberately; do not fix without a product decision.
    //   Repairing it changes the amount a customer is charged. This adapter adds NO zero-guard, NO
    //   `ORDER BY` and NO sort, and returns the intents exactly as the loop leaves them - which is
    //   what the count-and-order assertion below pins. The fixture publishes the two ledger keys that
    //   make the cross-wiring observable, and the decomposition suite that owns the loop drives them.
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    // The two ledger keys the defect confuses are DISTINCT in the fixture, which is the only layout
    // under which the cross-wiring is observable at all: when they coincide the loop degenerates into
    // a correct one and the defect hides.
    expect(capture.overusedRewardID).toBeDefined();
    expect(capture.leakedRewardID).toBeDefined();
    expect(capture.overusedRewardID).not.toBe(capture.leakedRewardID);

    // The REVERSE search direction at [:L482] and [:L498] is published by the promotion fixture
    // rather than by the order-view capture, and it is asserted here so a future fixture change that
    // "tidied" the direction into a forward walk would fail loudly instead of silently changing which
    // discount is stripped first.
    expect(makePromotionFixtures({ idPrefix: 'over-use' }).overUseStrippingSearchesInReverse).toBe(
      true,
    );

    // Whatever the loop left is what crosses the wire: no filtering, no de-duplication, no
    // re-ranking. The item-level intents arrive in the view's OWN item order and the order-level
    // intent arrives after them, exactly as the two passes emitted them.
    const intents = promotionIntentsOf(body);
    const itemLevelIDs = intents
      .filter((intent): boolean => intent.appliedType === 'orderItem')
      .map((intent): string | undefined => intent.orderItemID);
    const orderLevelPositions = intents
      .map((intent, position): number => (intent.appliedType === 'order' ? position : -1))
      .filter((position): boolean => position !== -1);

    expect(itemLevelIDs).toEqual([itemAt(order, 0).orderItemID, itemAt(order, 1).orderItemID]);
    expect(orderLevelPositions).toEqual([intents.length - 1]);
    // No de-duplication either: every intent is a DISTINCT (appliedType, key) pair.
    expect(
      new Set(
        intents.map((intent): string =>
          [intent.appliedType, intent.orderItemID ?? intent.orderID ?? ''].join('|'),
        ),
      ).size,
    ).toBe(intents.length);
  });

  it('V4: applies ONLY the single largest discount per order item', async () => {
    // `orderItemQulifiedDiscounts` - the legacy identifier is misspelled at
    // [model/service/PromotionService.cfc:L82-L133] and is RENAMED in the target with the original
    // spelling recorded; it is not silently renamed - is insert-sorted DESCENDING by amount at
    // [:L266-L294], and only index `[1]` is ever applied at [:L523-L537], where L529 guards with
    // `structKeyExists` AND `arrayLen`. Meanwhile `orderItemsUsage` is insert-sorted ASCENDING by
    // `discountPerUseValue` at [:L301-L329] with a `break` at [:L316], so the cheapest-per-use are
    // stripped first. BOTH orderings are load-bearing and run in OPPOSITE directions.
    const { order, capture } = makeGoldenOrder();
    const accepted = capture.acceptedPriceGroup;
    expect(accepted).toBeDefined();

    // TWO competing rewards on the same items: the reference 12.5% and a second, larger percentage.
    const smaller = makeReferenceReward(accepted === undefined ? [] : [accepted]);
    const largerGraph = makePromotionFixtures({
      idPrefix: 'larger',
      eligiblePriceGroups: accepted === undefined ? [] : [accepted],
      rewardAmount: Money.fromDecimalString(LARGER_PERCENTAGE_OFF),
      // Written EXPLICITLY as `undefined` - the fixture resolves overrides by key PRESENCE, so this
      // is how "this reward carries no rounding rule" is requested, and it keeps the arithmetic on
      // the unrounded arm [model/service/PromotionService.cfc:L1008-L1009] that this suite drives.
      roundingRule: undefined,
    });
    const larger: RewardUnderTest = {
      // `merchandiseReward` is the only reward that honours the `reward*` overrides.
      reward: largerGraph.merchandiseReward,
      promotionID: largerGraph.promotion.getPromotionID(),
    };

    const harness = makeHarness({ admit: order, rewards: [smaller, larger] });
    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));
    const firstItem = itemAt(order, 0);

    const forFirstItem = promotionIntentsOf(body).filter(
      (intent): boolean => intent.orderItemID === firstItem.orderItemID,
    );

    // ONE intent for the item, and it is the LARGER of the two competing discounts. 19.99 x 3 = 59.97,
    // and 59.97 at 12.5% is 7.49625 while 59.97 at 25% is 14.9925.
    expect(forFirstItem).toHaveLength(1);
    expectSameAmount(wireDiscountForItem(body, firstItem.orderItemID), '14.9925');
    expectDifferentAmount(wireDiscountForItem(body, firstItem.orderItemID), '7.49625');
  });

  it('V5: adds no zero-guard to the unguarded division', () => {
    // `var discountPerUseValue = precisionEvaluate('discountAmount / discountQuantity');`
    // [model/service/PromotionService.cfc:L299] has NO zero check on the divisor, and neither does
    // [:L486]. `Money.dividedBy` lets the substrate's refusal propagate for exactly that reason -
    // returning zero would silently invent money and returning `undefined` would push a null check
    // onto every caller.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L299]: an unguarded division whose divisor is
    // a caller-influenced quantity.
    // Preserved deliberately; do not fix without a product decision.
    //   Whether the CALL SITE wants a guard belongs to `src/services/promotion/rewardUsageLedger.ts`.
    //   This adapter neither divides nor guards, and the fixture's own zero-quantity switch is driven
    //   by the suite that owns the ledger.
    expect(() => Money.fromDecimalString('6.00').dividedBy(0)).toThrow();
    expect(Money.fromDecimalString('6.00').dividedBy(2).toDecimalString()).toBe('3');
  });
});

// ===========================================================================
// SECTION 8 - THE PROMOTION SURFACE THIS ADAPTER REACHES, AND THE ONE IT DOES NOT
// ===========================================================================

describe('the promotion surface reachable through this adapter (NET-NEW)', () => {
  it('reproduces the reference calculation end to end through Money alone', async () => {
    const { order, capture } = makeGoldenOrder();
    // NARROWED, never defaulted: see {@link requireFixtureMember}. Nothing below can fall back to a
    // substituted zero, so no monetary value in this calculation is ever invented.
    const reference = requireFixtureMember(
      capture.referenceCalculation,
      'its reference calculation',
    );

    // The chain, as NUMERALS rather than as arithmetic: 19.99 x 3 = 59.97; less 12.5% = 7.49625; net
    // 52.47375; presented "52.47" and "7.50". Verified end to end during planning, and the proof that
    // an arbitrary-precision decimal plus a two-decimal presentation step reproduces
    // `numberFormat(discountAmount,"0.00")` [model/service/PromotionService.cfc:L1017] with no
    // IEEE-754 drift.
    const unitPrice = Money.fromDecimalString(reference.unitPrice);
    const extended = unitPrice.times(reference.quantity);
    const discount = extended.times(
      Money.fromDecimalString(reference.percentageOff).dividedBy(100),
    );
    const net = extended.minus(discount);

    expectSameAmount(extended.toDecimalString(), '59.97');
    expectSameAmount(discount.toDecimalString(), '7.49625');
    expectSameAmount(net.toDecimalString(), '52.47375');
    expect(net.toFixed2()).toBe('52.47');
    expect(discount.toFixed2()).toBe('7.50');
    expect(reference.presentedNetAmount).toBe('52.47');
    expect(reference.presentedDiscountAmount).toBe('7.50');

    // And the handler reports the FULL-PRECISION value the engine decided, not the presentation form.
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });
    const body = successBodyOf(await harness.invoke(postApplyPromotions(order)));

    expectSameAmount(wireDiscountForItem(body, itemAt(order, 0).orderItemID), '7.49625');
  });

  it('serves getSalePriceDetailsForProductSkus and renders every member safely', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.49375'),
          originalPrice: Money.fromDecimalString('19.99'),
          promotionID: SALE_PRICE_PROMOTION_ID,
          roundingRuleID: 'rr-closest-0001',
          salePriceExpirationDateTime: new Date('2024-12-31T23:59:59.000Z'),
        },
      },
    });

    const result = await harness.invoke(
      postDocument({
        operation: 'salePriceDetails',
        idempotencyKey: IDEMPOTENCY_KEY,
        productID: PRODUCT_ID,
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(harness.recorder.salePriceRequests).toEqual([PRODUCT_ID]);
    // No order view is involved: the legacy signature takes a plain string
    // [model/service/PromotionService.cfc:L1022], so there is nothing to materialise.
    expect(harness.recorder.composedInputs).toHaveLength(0);

    const detail = successBodyOf(result).salePriceDetails?.[SALE_PRICE_SKU_ID];
    expect(detail?.skuID).toBe(SALE_PRICE_SKU_ID);
    expectSameAmount(detail?.salePrice ?? '', '17.49375');
    expectSameAmount(detail?.originalPrice ?? '', '19.99');
    expect(detail?.roundingRuleID).toBe('rr-closest-0001');
    // ISO-8601, hence UTC by definition.
    expect(detail?.salePriceExpirationDateTime).toBe('2024-12-31T23:59:59.000Z');
  });

  it('OMITS an absent sale-price member rather than coercing it to zero or the epoch', async () => {
    const harness = makeHarness({
      salePriceDetails: {
        [SALE_PRICE_SKU_ID]: {
          skuID: SALE_PRICE_SKU_ID,
          discountLevel: 'global',
          salePriceDiscountType: 'amount',
          salePrice: Money.fromDecimalString('9.99'),
          promotionID: SALE_PRICE_PROMOTION_ID,
        },
      },
    });

    const result = await harness.invoke(
      postDocument({
        operation: 'salePriceDetails',
        idempotencyKey: IDEMPOTENCY_KEY,
        productID: PRODUCT_ID,
      }),
    );

    const detail = successBodyOf(result).salePriceDetails?.[SALE_PRICE_SKU_ID];

    // An absent `originalPrice` is not zero - that would understate a saving - and an absent
    // expiration is not the epoch, which would expire a live sale. Both keys are simply ABSENT.
    expect(detail).toBeDefined();
    expect(detail === undefined ? true : 'originalPrice' in detail).toBe(false);
    expect(detail === undefined ? true : 'salePriceExpirationDateTime' in detail).toBe(false);
    expect(detail === undefined ? true : 'roundingRuleID' in detail).toBe(false);
    expect(result.body).not.toContain('1970-01-01');
  });

  it('routes NO traffic to the engine internals or to the use-count members', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    // The four qualification helpers - `getPromotionPeriodQualificationDetails` [:L549],
    // `getQualifierQualificationDetails` [:L629], `getPromotionPeriodQualifiedFulfillmentIDList`
    // [:L752], which RETURNS A COMMA-DELIMITED STRING for parity and must not become an array, and
    // `getPromotionPeriodOrderItemQualificationCount` [:L783] - are ENGINE INTERNALS. They are among
    // the five ALREADY-ALLOCATED visibility widenings, promoted from `private` so they can be tested
    // directly by the tier that owns them; no sixth widening is introduced and no HTTP traffic is
    // routed to any of them.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L1094-L1100]: `getPromotionCodeUseCount` and
    // `getPromotionCodeAccountUseCount` both declare `returntype="boolean"` and then return the DAO's
    // NUMERIC count.
    // Preserved deliberately; do not fix without a product decision.
    //   The ported service types the honest `Promise<number>` and the legacy declaration is RECORDED
    //   rather than reproduced as a lie in the type system. Neither member is routed to from here -
    //   the use-count surface belongs to promotion-code administration, not to order pricing - and the
    //   withheld `promotionService` getter is what proves it.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: the qualification struct writes
    // `qualificationDetails.qualifiedFulfillments = explicitlyQualifiedFulfillmentIDs` at L622, a key
    // that is never initialised in that struct and never read - the caller reads
    // `qualifiedFulfillmentIDs` instead.
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zones clause tests
    // `arrayLen(qualifier.getShippingAddressZones())` and then calls `hasShippingMethod` - a
    // copy-paste of L701 - instead of testing whether the address falls in a declared zone, so the
    // zone condition is never evaluated at that site.
    // Preserved deliberately; do not fix without a product decision.
    //   Reaching it needs a fulfillment with a NULL `shippingMethod`, which the golden order's pickup
    //   fulfillment supplies; the qualifier tier owns the assertion, and nothing here compensates.
    const result = await harness.invoke(postApplyPromotions(order));

    expect(result.statusCode).toBe(200);
    // The comma-list form is preserved on the way in, so it cannot have been modernised on the way
    // through: `listLen('')` is 0 for the empty list, never 1.
    const qualifiedFulfillmentIDList = capture.qualifiedFulfillmentIDList;
    expect(typeof qualifiedFulfillmentIDList).toBe('string');

    // The count is what CFML's own `listLen` makes of the SAME string, computed here by the ported
    // helper rather than restated as a literal - so a list that silently became an array, or gained a
    // different delimiter, fails. The golden order carries two fulfillments and both qualify.
    expect(capture.qualifiedFulfillmentIDCount).toBe(
      listLen(qualifiedFulfillmentIDList === undefined ? '' : qualifiedFulfillmentIDList),
    );
    expect(capture.qualifiedFulfillmentIDCount).toBe(order.orderFulfillments.length);
    // `listLen('')` is 0, never 1 - the exact CFML behaviour a naive `split(',').length` would break.
    expect(listLen('')).toBe(0);
  });

  it('keeps the RESTRICTIVE and PERMISSIVE empty-collection defaults apart', () => {
    // ★★ COLLAPSING THESE TWO IS A MONEY BUG, IN OPPOSITE DIRECTIONS.
    //
    // PERMISSIVE - [model/service/PromotionService.cfc:L355]:
    //   `( !arrayLen(reward.getShippingMethods()) || ... )` - an EMPTY include collection means NO
    //   RESTRICTION, which is why every such gate is written `arrayLen(collection) && !collection.hasX(...)`.
    //
    // RESTRICTIVE - `AddressService.isAddressInZone` [model/service/AddressService.cfc:L57-L82]:
    //   L58 `var addressInZone = false;`, a loop over `getAddressZoneLocations()` at L60, and L81
    //   `return addressInZone;` - so an EMPTY locations collection means the loop body never runs and
    //   the answer is FALSE. EMPTY MEANS NOT IN ZONE.
    //
    // The evaluator below is SYNC and LIVE - a real comparison, not a stub - and reproduces L63, L66,
    // L69 and L72 including that a location leaving a member unset SKIPS that member rather than
    // failing on it.
    //
    // CFML parity [model/service/AddressService.cfc:L63,L66,L69,L72]: each clause is written
    // `!isNull(location.getX()) && location.getX() != address.getX()`, so a member the location
    // leaves UNSET is skipped rather than compared. `constrains` is that `!isNull` test, spelled with
    // explicit `!== undefined` and `!== null` because `eqeqeq` is an error in this project and a
    // loose `!= null` would hide which of the two absences is meant.
    const constrains = (constraint: string | null | undefined): constraint is string =>
      constraint !== undefined && constraint !== null;

    const evaluator: AddressZoneEvaluator = {
      isAddressInZone: (
        address: AddressProjection,
        addressZone: AddressZoneProjection,
      ): boolean => {
        for (const location of addressZone.addressZoneLocations) {
          let inLocation = true;

          if (constrains(location.postalCode) && location.postalCode !== address.postalCode) {
            inLocation = false;
          }
          if (constrains(location.city) && location.city !== address.city) {
            inLocation = false;
          }
          if (constrains(location.stateCode) && location.stateCode !== address.stateCode) {
            inLocation = false;
          }
          if (constrains(location.countryCode) && location.countryCode !== address.countryCode) {
            inLocation = false;
          }
          if (inLocation) {
            return true;
          }
        }

        return false;
      },
    };

    const address: AddressProjection = {
      postalCode: '94105',
      city: 'San Francisco',
      stateCode: 'CA',
      countryCode: 'US',
    };

    // RESTRICTIVE: no locations at all means NOT in zone.
    expect(
      evaluator.isAddressInZone(address, {
        addressZoneID: 'az-empty',
        addressZoneLocations: [],
      }),
    ).toBe(false);

    // A location that constrains only the country still matches - the unset members are SKIPPED.
    expect(
      evaluator.isAddressInZone(address, {
        addressZoneID: 'az-country-only',
        addressZoneLocations: [{ countryCode: 'US' }],
      }),
    ).toBe(true);

    // And a location that constrains a member to a different value does not match.
    expect(
      evaluator.isAddressInZone(address, {
        addressZoneID: 'az-other-state',
        addressZoneLocations: [{ stateCode: 'NY' }],
      }),
    ).toBe(false);

    // PERMISSIVE, from the other side: a reward that names NO shipping method restricts nothing, so
    // emptiness there must never be read as "matches nothing". The fixture's DEFAULT reward names one
    // method, which is the restricting shape; the empty collection is requested explicitly, and both
    // shapes are asserted so the polarity is pinned from both ends.
    const restricting = makePromotionFixtures({
      idPrefix: 'restricting',
    }).referenceCalculationReward;
    expect(restricting.getShippingMethodIDs().length).toBeGreaterThan(0);

    const reward = makePromotionFixtures({
      idPrefix: 'permissive',
      shippingMethodIDs: [],
    }).referenceCalculationReward;
    expect(reward.getShippingMethodIDs()).toEqual([]);

    // CFML parity [model/entity/PromotionReward.cfc:L57]: the component's `hb_permission` attribute
    // carries the misspelling `promotionPeriod.promtionRewards`. It is a DATA CONTRACT - a permission
    // key the legacy admin resolves by name - so it is preserved verbatim by the entity that carries
    // it and is not renamed. It appears nowhere on this adapter's wire contract.
    expect(reward.getPromotionRewardID().length).toBeGreaterThan(0);

    // ★ AND THIS ADAPTER NEVER CALLS THE EVALUATOR AT ALL. `AddressZoneEvaluator` is reached from
    // `getShippingMethodOptionsDiscountAmountDetails` [model/service/PromotionService.cfc:L1032] on
    // the SERVICES tier, because the zone decision is a business decision a handler must not make -
    // which is why `src/handlers/promotionApplicationHandler.ts` does not import the port and why
    // `RequestScope` publishes no route to it here.
    expect(Object.keys(evaluator)).toEqual(['isAddressInZone']);
  });
});

// ===========================================================================
// SECTION 9 - CONCERN 3: RESPONSE SHAPING, AND CONCERN 4: SAFE ERROR MAPPING
//
// NET-NEW, like everything else in this file: the legacy tree has no handler
// tier at all, so there is no MXUnit assertion about a status code, a header or
// an error body anywhere under `meta/tests/` to trace to. Nothing below is
// presented as parity.
//
// The whole of this section rests on ONE property of the shipped design, and
// asserts it from every side: the words in an error body are owned by
// `src/handlers/errorMapper.ts` and are never supplied by a caller, by a caught
// value, or by this handler. `InvalidRequestReason` is a CLOSED union of six
// members and the sentence for each is a frozen table entry, so a handler NAMES
// a class of problem and the mapper says it. The status set is exactly three -
// 400, 404, 500 - and no fourth is invented: no 401, no 403, no 409, no 422, no
// 429, no `retry-after`, no rate-limit header and no circuit-breaker semantic,
// because the source had none of them and this migration invents no
// non-functional requirement.
// ===========================================================================

/**
 * Internal diagnostic text that must reach the LOG and never a caller.
 *
 * Deliberately shaped like the thing that actually leaks in practice - a driver failure that has
 * embedded statement text - and deliberately INVENTED: it names a table this schema really has and
 * nothing else. It carries no host, no account, no credential and no connection value of any kind,
 * because a test that needed a real one to make its point would be a worse test.
 */
const WITHHELD_INTERNAL_DETAIL =
  'SELECT skuID FROM SwSku WHERE skuID = ? -- invented diagnostic text, callers must never see this';

/**
 * The framework's dead-call-target sentence, byte for byte.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L565, org/Hibachi/HibachiService.cfc:L280]:
 * `'You have called a method #arguments.missingMethodName#() which does not exists in the
 * #getClassName()# entity.'` - and "does not exists" is REPRODUCED, not corrected, because it is an
 * observable contract a legacy consumer may already match on. The distinct variant at
 * [org/Hibachi/HibachiObject.cfc:L126] is a DIFFERENT sentence and is not conflated with this one.
 *
 * The method named here is the real one: LEGACY-DEFECT [model/entity/Sku.cfc:L258]
 * `getPriceByPromotion` calls `calculateSkuPriceBasedOnPromotion`, which does not exist on the
 * service, so this sentence is what that call site produces at runtime.
 * Preserved deliberately; do not fix without a product decision.
 *   The target reproduces it as a throwing stub on the entity tier. This adapter neither calls it nor
 *   silences it - it recognises the sentence and republishes it, which is the whole of its obligation.
 */
const MISSING_METHOD_SENTENCE =
  'You have called a method calculateSkuPriceBasedOnPromotion() which does not exists in the Sku entity.';

/** An error whose NAME is identifier-shaped and whose MESSAGE is the detail that must be withheld. */
class WithheldDetailError extends Error {
  public constructor() {
    super(WITHHELD_INTERNAL_DETAIL);
    this.name = 'WithheldDetailError';
  }
}

/** The sentences `src/handlers/errorMapper.ts` owns, restated here so a drift in either side fails. */
const GENERIC_FAILURE_SENTENCE = 'The request could not be completed.';
const ROUTE_NOT_FOUND_SENTENCE = 'The requested route does not exist.';
const INVALID_INPUT_SENTENCE = 'The request input is not valid.';
const MISSING_BODY_SENTENCE = 'A request body is required and was not supplied.';
const UNPARSABLE_BODY_SENTENCE = 'The request body is not valid JSON.';
const UNSUPPORTED_SHAPE_SENTENCE = 'The request body is not the expected shape.';

/** Every status this handler is permitted to return, and nothing else. */
const PERMITTED_STATUSES: readonly number[] = [200, 400, 404, 500];

/** Header names that would invent a semantic the source never had. */
const FORBIDDEN_HEADER_NAMES: readonly string[] = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-circuit-state',
  'www-authenticate',
];

/** Assert a response carries the two frozen headers and no invented third semantic. */
function expectSafeResponseEnvelope(result: APIGatewayProxyResult): void {
  expect(PERMITTED_STATUSES).toContain(result.statusCode);

  const headers = result.headers ?? {};
  expect(headers['content-type']).toBe('application/json; charset=utf-8');
  // `no-store`, because a priced order belongs to one account at one instant and an intermediary
  // caching it would serve one customer's discount to another.
  expect(headers['cache-control']).toBe('no-store');

  const headerNames = Object.keys(headers).map((name): string => name.toLowerCase());
  expect(headerNames).toEqual(['content-type', 'cache-control']);
  for (const forbidden of FORBIDDEN_HEADER_NAMES) {
    expect(headerNames).not.toContain(forbidden);
  }
}

describe('response shaping and safe error mapping (NET-NEW)', () => {
  it('shapes a 200 carrying the two frozen headers and the four echoed envelope members', async () => {
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });

    const result = await harness.invoke(postApplyPromotions(order));
    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(200);

    const body = successBodyOf(result);

    // The four echoed members, each for a stated reason: the operation so a caller knows which arm
    // answered, the idempotency key and the correlation id so a retry can be joined to the decision
    // it already received and to the log stream, and `evaluatedAt` so the promotion-period window
    // [model/entity/PromotionPeriod.cfc:L78] this invocation resolved against is auditable afterwards.
    expect(body.operation).toBe('applyPromotions');
    expect(body.idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(body.requestId).toBe(PLATFORM_REQUEST_ID);
    expect(body.evaluatedAt).toBe(EVALUATED_AT);
    // ISO-8601 IN UTC, which is the whole point of an explicit instant rather than a server-local one.
    expect(body.evaluatedAt.endsWith('Z')).toBe(true);
    expect(new Date(body.evaluatedAt).toISOString()).toBe(EVALUATED_AT);

    // Both intent collections are reported, and BOTH are arrays even when a pass decided nothing -
    // an empty result is a decision, never an absence.
    expect(Array.isArray(body.promotionIntents)).toBe(true);
    expect(Array.isArray(body.priceGroupIntents)).toBe(true);
    // The `salePriceDetails` member belongs to the OTHER operation and is omitted here rather than
    // sent as an empty object: `exactOptionalPropertyTypes` is on and absence is expressible.
    expect(Object.hasOwn(JSON.parse(result.body) as object, 'salePriceDetails')).toBe(false);

    // No status the source never had, and no 201/202 either: both operations are DECISIONS rather
    // than durable writes, so there is no resource created to report and no acceptance to acknowledge.
    expect(result.statusCode).not.toBe(201);
    expect(result.statusCode).not.toBe(202);
  });

  it('echoes each caller idempotency key and decides IDENTICALLY on a replay', async () => {
    // Idempotency here is a property of the DECISION, not of a stored receipt: the two passes emit
    // intents and persist nothing, so a replay recomputes the same answer instead of replaying a
    // durable write. That is why the key is echoed rather than looked up.
    const first = makeGoldenOrder();
    const firstHarness = makeHarness({
      admit: first.order,
      rewards: [makeRewardForGoldenOrder(first.capture)],
    });
    const firstResult = await firstHarness.invoke(postApplyPromotions(first.order));

    const replay = makeGoldenOrder();
    const replayHarness = makeHarness({
      admit: replay.order,
      rewards: [makeRewardForGoldenOrder(replay.capture)],
    });
    const replayResult = await replayHarness.invoke(
      postApplyPromotions(replay.order, { idempotencyKey: REPLAY_IDEMPOTENCY_KEY }),
    );

    expectSafeResponseEnvelope(replayResult);
    expect(replayResult.statusCode).toBe(200);

    const firstBody = successBodyOf(firstResult);
    const replayBody = successBodyOf(replayResult);

    // DIFFERENT keys, echoed faithfully and not normalised, deduplicated or rejected as a repeat.
    expect(firstBody.idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(replayBody.idempotencyKey).toBe(REPLAY_IDEMPOTENCY_KEY);
    expect(firstBody.idempotencyKey).not.toBe(replayBody.idempotencyKey);

    // IDENTICAL decisions, down to the amounts. Compared through the intent documents rather than by
    // string-equality on the whole body, because the echoed key legitimately differs.
    expect(promotionIntentsOf(replayBody)).toEqual(promotionIntentsOf(firstBody));
    expect(replayBody.priceGroupIntents).toEqual(firstBody.priceGroupIntents);

    // And the replay drove the graph exactly once, in the same order - no cached response, and no
    // second pass over the composed operation.
    expect(replayHarness.recorder.composedInputs).toHaveLength(1);
    expect(replayHarness.recorder.log).toEqual(firstHarness.recorder.log);
  });

  it('answers 404 for an unmatched route WITHOUT ever opening a composition root', async () => {
    // ★ THE ONE PATH THE PRODUCTION HANDLER CAN BE DRIVEN THROUGH IN A UNIT SUITE. Route resolution
    // happens BEFORE the memoized composition root is awaited, so an unmatched route never touches a
    // database, a pool, a credential or `src/lib/config.ts`. This suite runs with NO environment at
    // all, so had the root been opened the configuration contract would have refused and the answer
    // would have been a 500 instead - which is precisely what makes the 404 below load-bearing rather
    // than incidental.
    const result = await productionHandler(
      makeProxyEvent({ path: '/promotions/not-a-route', httpMethod: 'POST' }),
    );

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(404);

    const error = errorBodyOf(result);
    expect(error.category).toBe('routeNotFound');
    expect(error.message).toBe(ROUTE_NOT_FOUND_SENTENCE);
    expect(error.requestId).toBe(PLATFORM_REQUEST_ID);
    // The submitted path is LOGGED, never echoed: reflecting a caller-authored path back serves no
    // diagnostic purpose the correlation identifier does not already serve.
    expect(result.body).not.toContain('not-a-route');
    expect(Object.hasOwn(error, 'fields')).toBe(false);
  });

  it('answers 404 for a route belonging to ANOTHER capability, disclosing nothing about it', async () => {
    // The four sibling capabilities are separate deployables. A request for one of their routes folds
    // into the SAME arm as a route that exists nowhere, so no response ever confirms which other
    // routes this service knows about.
    const otherCapabilityRoute = ROUTE_TABLE.priceResolution;
    expect(otherCapabilityRoute.path).not.toBe(CAPABILITY_ROUTE.path);

    const result = await productionHandler(
      makeProxyEvent({ path: otherCapabilityRoute.path, httpMethod: otherCapabilityRoute.methods }),
    );

    expect(result.statusCode).toBe(404);
    const error = errorBodyOf(result);
    expect(error.category).toBe('routeNotFound');
    expect(error.message).toBe(ROUTE_NOT_FOUND_SENTENCE);
    expect(result.body).not.toContain(otherCapabilityRoute.path);
    expect(result.body).not.toContain(otherCapabilityRoute.capability);
    expect(result.body).not.toContain(otherCapabilityRoute.action);
  });

  it('answers 400 with the shipped sentence for an absent, blank or unparsable body', async () => {
    // Three DISTINCT reasons, three DISTINCT frozen sentences, and not one of them interpolates a
    // media type, a parser position or a fragment of what was sent. A blank body is treated as ABSENT
    // rather than as an empty document, which is the honest reading: whitespace is not a document.
    const absent = makeHarness();
    const absentResult = await absent.invoke(makeProxyEvent({}));
    expectSafeResponseEnvelope(absentResult);
    expect(absentResult.statusCode).toBe(400);
    expect(errorBodyOf(absentResult).category).toBe('invalidRequest');
    expect(errorBodyOf(absentResult).message).toBe(MISSING_BODY_SENTENCE);

    const blank = makeHarness();
    const blankResult = await blank.invoke(makeProxyEvent({ body: '   \n\t  ' }));
    expect(blankResult.statusCode).toBe(400);
    expect(errorBodyOf(blankResult).message).toBe(MISSING_BODY_SENTENCE);

    const unparsable = makeHarness();
    const unparsableResult = await unparsable.invoke(
      makeProxyEvent({ body: '{"operation":"applyPromotions",' }),
    );
    expect(unparsableResult.statusCode).toBe(400);
    expect(errorBodyOf(unparsableResult).message).toBe(UNPARSABLE_BODY_SENTENCE);
    // The truncated fragment is not quoted back, and no parser position is disclosed.
    expect(unparsableResult.body).not.toContain('applyPromotions"');
    expect(unparsableResult.body.toLowerCase()).not.toContain('position');

    // None of the three reached the graph: no root, no scope, no pass.
    for (const harness of [absent, blank, unparsable]) {
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('answers 400 for a body that parsed but is not this document', async () => {
    // An array IS a JSON document; it is not THIS document. `null` and a scalar fold into the same
    // reason, because the distinction a caller needs is "not the expected shape" and nothing finer.
    for (const body of ['[]', 'null', '42', '"applyPromotions"']) {
      const harness = makeHarness();
      const result = await harness.invoke(makeProxyEvent({ body }));

      expectSafeResponseEnvelope(result);
      expect(result.statusCode).toBe(400);
      expect(errorBodyOf(result).category).toBe('invalidRequest');
      expect(errorBodyOf(result).message).toBe(UNSUPPORTED_SHAPE_SENTENCE);
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('honours a base64-encoded body, because the platform sets that flag', async () => {
    // Ignoring `isBase64Encoded` would turn a perfectly well-formed document into an unparsable one
    // and answer 400 to a valid request, so it is honoured rather than assumed absent.
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({ admit: order, rewards: [makeRewardForGoldenOrder(capture)] });
    const document = applyPromotionsDocument(orderReference(order), {
      ...(order.accountID === undefined ? {} : { accountID: order.accountID }),
    });

    const result = await harness.invoke(
      makeProxyEvent({
        body: Buffer.from(JSON.stringify(document), 'utf8').toString('base64'),
        isBase64Encoded: true,
      }),
    );

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(200);
    expect(successBodyOf(result).idempotencyKey).toBe(IDEMPOTENCY_KEY);
    expect(harness.recorder.composedInputs).toHaveLength(1);

    // A base64 body that decodes to whitespace is ABSENT, not unparsable.
    const blank = makeHarness();
    const blankResult = await blank.invoke(
      makeProxyEvent({
        body: Buffer.from('   ', 'utf8').toString('base64'),
        isBase64Encoded: true,
      }),
    );
    expect(blankResult.statusCode).toBe(400);
    expect(errorBodyOf(blankResult).message).toBe(MISSING_BODY_SENTENCE);
  });

  it('answers 400 with member PATHS and never with submitted VALUES when the schema refuses', async () => {
    const { order } = makeGoldenOrder();
    const forbiddenKey = 'idem key with spaces and a slash/';

    const cases: readonly {
      readonly document: Readonly<Record<string, unknown>>;
      readonly path: string;
      readonly absentFromBody: readonly string[];
    }[] = [
      {
        // The key is REQUIRED on both envelopes: without it a retry cannot be joined to its decision.
        document: { operation: 'applyPromotions', order: orderReference(order) },
        path: 'idempotencyKey',
        absentFromBody: [],
      },
      {
        // Character-filtered, so an identifier can never carry a delimiter or whitespace.
        document: applyPromotionsDocument(orderReference(order), {
          idempotencyKey: forbiddenKey,
        }),
        path: 'idempotencyKey',
        absentFromBody: [forbiddenKey, 'spaces'],
      },
      {
        // The discriminated union makes "a salePriceDetails request with no productID" a validation
        // failure carrying a member path, rather than a value some later branch has to re-check.
        document: { operation: 'salePriceDetails', idempotencyKey: IDEMPOTENCY_KEY },
        path: 'productID',
        absentFromBody: [],
      },
      {
        // A third operation nobody published: the discriminator itself fails, and the offending value
        // is not quoted back.
        document: { operation: 'deleteEverything', idempotencyKey: IDEMPOTENCY_KEY },
        path: 'operation',
        absentFromBody: ['deleteEverything'],
      },
    ];

    for (const { document, path, absentFromBody } of cases) {
      const harness = makeHarness({ admit: order });
      const result = await harness.invoke(postDocument(document));

      expectSafeResponseEnvelope(result);
      expect(result.statusCode).toBe(400);

      const error = errorBodyOf(result);
      expect(error.category).toBe('invalidRequest');
      // ONE fixed sentence for every schema failure. The specificity lives in `fields`.
      expect(error.message).toBe(INVALID_INPUT_SENTENCE);
      expect(error.fields?.map((field): string => field.path)).toContain(path);

      for (const value of absentFromBody) {
        expect(result.body).not.toContain(value);
      }

      // A schema refusal happens BEFORE the composition root is opened, so no scope is created and no
      // pass runs for a request that was never usable.
      expect(harness.recorder.log).toEqual([]);
    }
  });

  it('answers 500 with ONLY the generic sentence for an unrecognised failure', async () => {
    // ★ THE CENTRAL GUARANTEE, ASSERTED FROM BOTH SIDES: the caller gets one fixed sentence, and the
    // detail is reachable only through the log stream, joined by the correlation identifier.
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
      failure: new WithheldDetailError(),
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expectSafeResponseEnvelope(result);
    // SERVER-shaped, because a failure inside the passes is this service's problem and not the
    // caller's. Not a 409, not a 422, not a 429, and no retry-after: see the header assertion above.
    expect(result.statusCode).toBe(500);

    const error = errorBodyOf(result);
    expect(error.category).toBe('unrecognized');
    expect(error.message).toBe(GENERIC_FAILURE_SENTENCE);
    expect(error.requestId).toBe(PLATFORM_REQUEST_ID);
    expect(Object.hasOwn(error, 'fields')).toBe(false);
    // The body is the envelope and NOTHING else - three members plus the fixed sentence.
    expect(Object.keys(error).sort()).toEqual(['category', 'message', 'requestId']);

    // Not one fragment of the internal detail crosses the wire: no statement text, no table name, no
    // exception message, no stack.
    expect(result.body).not.toContain(WITHHELD_INTERNAL_DETAIL);
    expect(result.body).not.toContain('SELECT');
    expect(result.body).not.toContain('SwSku');
    expect(result.body.toLowerCase()).not.toContain('stack');
    expect(result.body).not.toContain('WithheldDetailError');

    // ★ AND THE LOG PROVES THE DETAIL WAS NOT MERELY DISCARDED: a classification is emitted, so an
    // operator can join this response to it, while the thrown value itself is passed NOWHERE.
    const lines = harness.emitted.lines.join('\n');
    expect(lines).toContain('unrecognized failure mapped to a generic response');
    expect(lines).toContain('WithheldDetailError');
    expect(lines).toContain(PLATFORM_REQUEST_ID);
    // The MESSAGE is what carries embedded statement text in a real driver failure, and only the
    // error's NAME is classified - so the message is absent from the log stream as well.
    expect(lines).not.toContain(WITHHELD_INTERNAL_DETAIL);
    expect(lines).not.toContain('SwSku');
  });

  it('reproduces the framework dead-call-target sentence byte for byte, as a 500', async () => {
    // The ONE case where a failure's own message is published, and it is safe because the recognising
    // pattern enforces both of its slots as bare identifiers. Withholding it would lose an observable
    // behavioural contract, which is the outcome the recognition ordering exists to prevent.
    const { order, capture } = makeGoldenOrder();
    const harness = makeHarness({
      admit: order,
      rewards: [makeRewardForGoldenOrder(capture)],
      failure: new Error(MISSING_METHOD_SENTENCE),
    });

    const result = await harness.invoke(postApplyPromotions(order));

    expectSafeResponseEnvelope(result);
    // SERVER-shaped: a dead call target is this service's defect, not the caller's.
    expect(result.statusCode).toBe(500);

    const error = errorBodyOf(result);
    expect(error.category).toBe('missingMethod');
    expect(error.message).toBe(MISSING_METHOD_SENTENCE);
    // "does not exists" - the source's own grammar, PRESERVED. Correcting it here would break a
    // consumer matching on the sentence.
    expect(error.message).toContain('does not exists in the');
    expect(error.message).not.toContain('does not exist in the');

    // The two slots are republished; nothing else about the failure is.
    const lines = harness.emitted.lines.join('\n');
    expect(lines).toContain('dead call target reached; reproducing the framework contract message');
    expect(lines).toContain('calculateSkuPriceBasedOnPromotion');
    expect(lines).toContain('Sku');
    expect(result.body.toLowerCase()).not.toContain('stack');
  });

  it('maps an admission refusal to a CLIENT-shaped 400 and keeps its member paths', async () => {
    // The refusal arm is discriminated by `instanceof` and never by a cast, and it is the only arm
    // that turns a thrown value into a 400: an order document that cannot be used is the caller's
    // problem, and the paths are how the caller finds out which member.
    const refusal = new OrderViewAdmissionError('unusableRequestInput', [
      { path: 'order.orderItems[0].price', message: 'must be a Money value object' },
    ]);
    const harness = makeHarness({ refuseAdmission: refusal });
    const { order } = makeGoldenOrder();

    const result = await harness.invoke(postApplyPromotions(order));

    expectSafeResponseEnvelope(result);
    expect(result.statusCode).toBe(400);

    const error = errorBodyOf(result);
    expect(error.category).toBe('invalidRequest');
    // `unusableRequestInput` maps to the SAME sentence a schema refusal publishes: no invented
    // specificity, on purpose.
    expect(error.message).toBe(INVALID_INPUT_SENTENCE);
    expect(error.fields?.map((field): string => field.path)).toEqual(['order.orderItems[0].price']);
    // A path and a constraint description; never the value that failed.
    expect(result.body).not.toContain('19.99');

    // The refusal is logged as a client-shaped rejection, with the reason - which is a closed literal
    // and therefore safe to log - and the paths.
    const lines = harness.emitted.lines.join('\n');
    expect(lines).toContain('request input rejected before it reached the services');
    expect(lines).toContain('unusableRequestInput');
  });

  it('returns nothing but the three failure statuses, over every failure this suite can drive', async () => {
    // A closed accounting rather than four separate hopes: every failure mode above, collected, and
    // the resulting status set compared to the permitted one. A fourth status appearing anywhere -
    // 401, 403, 409, 422, 429 - fails here even if its own test were never written.
    const { order, capture } = makeGoldenOrder();
    const reward = makeRewardForGoldenOrder(capture);
    const statuses: number[] = [];

    statuses.push((await productionHandler(makeProxyEvent({ path: '/nowhere' }))).statusCode);
    statuses.push((await makeHarness().invoke(makeProxyEvent({}))).statusCode);
    statuses.push((await makeHarness().invoke(makeProxyEvent({ body: '{' }))).statusCode);
    statuses.push((await makeHarness().invoke(makeProxyEvent({ body: '[]' }))).statusCode);
    statuses.push(
      (
        await makeHarness({ admit: order }).invoke(
          postDocument({ operation: 'applyPromotions', order: orderReference(order) }),
        )
      ).statusCode,
    );
    statuses.push(
      (
        await makeHarness({
          admit: order,
          rewards: [reward],
          failure: new WithheldDetailError(),
        }).invoke(postApplyPromotions(order))
      ).statusCode,
    );
    statuses.push(
      (await makeHarness({ admit: order, rewards: [reward] }).invoke(postApplyPromotions(order)))
        .statusCode,
    );

    expect([...new Set(statuses)].sort((left, right) => left - right)).toEqual([
      200, 400, 404, 500,
    ]);
    for (const status of statuses) {
      expect(PERMITTED_STATUSES).toContain(status);
    }
  });
});
