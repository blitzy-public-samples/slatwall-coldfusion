// slatwall-ts - the composition root: every service, repository and port instantiated and wired
// once, explicitly, replacing the DI/1 convention scan (AAP 0.4.1, handlers table).
//
// JUDGMENT CALL: the seven services and the six repositories are constructed PER REQUEST rather than
// at module scope, precisely because they own request-scoped memos - `RoundingRuleService` holds
// `roundingRuleDetails` and `MysqlSkuRepository` holds `nextOptionGroupSortOrder`. What is module
// scope here is the graph of stateless collaborators below, alongside the pool in
// `../repositories/mysql/connection.ts`, the configuration memo in `../lib/config.ts` and the logger
// threshold in `../lib/logger.ts`; none of them holds request data.
//
// `productTypeDAO` is dead as a `ProductService` collaborator [model/service/ProductService.cfc:L54],
// yet the ported constructor genuinely declares a `ProductTypeRepository`, because `saveProductType`
// needs one.

// The only Node built-in this file imports, and it is imported for exactly one purpose: minting
// the 32-character identifiers the two framework writers below assign to new rows.
import { randomUUID } from 'node:crypto';

import { appConfig } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { cfEquals, cfFoldKey, structGet } from '../lib/cfml/struct.js';
import { listFindNoCase, listToArray } from '../lib/cfml/list.js';
import { getPreparedStatementExecutor } from '../repositories/mysql/connection.js';
import { assertMySqlDialect, resolveDialect } from '../repositories/mysql/dialect.js';
import { MysqlProductRepository } from '../repositories/mysql/mysqlProductRepository.js';
import { MysqlSkuRepository } from '../repositories/mysql/mysqlSkuRepository.js';
import { MysqlOptionRepository } from '../repositories/mysql/mysqlOptionRepository.js';
import { MysqlProductTypeRepository } from '../repositories/mysql/mysqlProductTypeRepository.js';
import { MysqlPromotionRepository } from '../repositories/mysql/mysqlPromotionRepository.js';
import { MySqlPriceGroupRepository } from '../repositories/mysql/mysqlPriceGroupRepository.js';
import { Option } from '../domain/entities/option.js';
import { OptionGroup } from '../domain/entities/optionGroup.js';
import { Promotion } from '../domain/entities/promotion.js';
// VALUE imports, not `import type`: the two framework writers below CONSTRUCT these entities to
// describe the row they just wrote, the way each writing repository constructs the entity it
// persisted.
import { Brand } from '../domain/entities/brand.js';
import { RoundingRule } from '../domain/entities/roundingRule.js';
import {
  currencyCodeEquals,
  getByCurrencyCode,
  toCurrencyCode,
} from '../domain/valueObjects/currencyCode.js';
import type { CurrencyCode } from '../domain/valueObjects/currencyCode.js';
import { RoundingRuleService } from '../services/roundingRuleService.js';
import { BrandService } from '../services/brandService.js';
import { OptionService } from '../services/optionService.js';
import { SkuService } from '../services/skuService.js';
import { ProductService } from '../services/productService.js';
import { PriceGroupService } from '../services/priceGroupService.js';
import { PromotionService } from '../services/promotionService.js';
import { GoogleFeedRepository } from '../integrations/google/googleFeedRepository.js';
import { GoogleFeedService } from '../integrations/google/googleFeedService.js';
import { GoogleIntegration } from '../integrations/google/integration.js';
import type {
  AppConfig,
  DatabaseTlsMode,
  EnvironmentSource,
  LoggingConfig,
  LogThresholdSource,
  RuntimeEnvironment,
  TlsMinimumVersion,
} from '../lib/config.js';
import type { CfBooleanInput } from '../lib/cfml/truthiness.js';
import { cfBoolean } from '../lib/cfml/truthiness.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlRow,
} from '../repositories/mysql/connection.js';
import {
  resolveAuditActorAccountID,
  resolveStampedModifiedByAccountID,
  sqlUpdateAssignment,
} from '../repositories/mysql/connection.js';
import type { DatabaseDialect } from '../repositories/mysql/dialect.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneLocationProjection,
  AddressZoneProjection,
} from '../domain/ports/addressZoneEvaluator.js';
import type { CurrencyConverter } from '../domain/ports/currencyConverter.js';
import type {
  ImageStore,
  ImageUploadResultProjection,
  SkuImageFileNameDescriptor,
} from '../domain/ports/imageStore.js';
import type { OptionRepository } from '../domain/ports/optionRepository.js';
import type { CurrentAccountContext } from '../domain/ports/priceGroupRepository.js';
import type { PriceGroupRepository } from '../domain/ports/priceGroupRepository.js';
import type { ProductRepository } from '../domain/ports/productRepository.js';
import type { FeedCriteria, ProductFeedPort } from '../domain/ports/productFeedPort.js';
import type { ProductTypeRepository } from '../domain/ports/productTypeRepository.js';
import type { PromotionRepository } from '../domain/ports/promotionRepository.js';
import type { SalePriceDetail, SalePriceResolver } from '../domain/ports/promotionRepository.js';
import type { SettingKey, SettingsProvider } from '../domain/ports/settingsProvider.js';
import type { SkuRepository } from '../domain/ports/skuRepository.js';
import type {
  SubscriptionBenefitHandle,
  SubscriptionTermHandle,
  SubscriptionTermProvider,
} from '../domain/ports/subscriptionTermProvider.js';
import type { UrlTitleGenerator, UrlTitleTableName } from '../domain/ports/urlTitleGenerator.js';
import type { PriceGroup } from '../domain/entities/priceGroup.js';
// `materializeOrderViewDocument` holds each loaded product so every SKU arrives with its product
// association wired; `ProductType` is also published through the existing read-only entity
// loaders.
import type { Product } from '../domain/entities/product.js';
import type { ProductType } from '../domain/entities/productType.js';
import type { PriceGroupRate } from '../domain/entities/priceGroupRate.js';
import type { Sku, SkuImageSettingValues, SkuPriceGroupResolver } from '../domain/entities/sku.js';
import type { CfStruct } from '../lib/cfml/struct.js';
import { Money } from '../domain/valueObjects/money.js';
import type {
  ResolvedFeedSettingValues,
  ResolvedSkuShippingWeightSetting,
  SkuFeedSettingResolver,
  SkuFeedSettingSubject,
} from '../integrations/google/googleFeedRepository.js';
import type { OrderView } from '../domain/views/orderView.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type {
  AppliedPromotionView,
  OrderFulfillmentView,
} from '../domain/views/orderFulfillmentView.js';
import type { PriceGroupAppliedIntent } from '../services/priceGroupService.js';
import type {
  OptionLoadingCollaborator,
  ProductSaveInput,
  SkuBatchWriteCollaborator,
  SkuCreationCollaborator,
} from '../services/productService.js';
import type { CreateSkusInput } from '../services/skuService.js';
import type { PromotionAppliedIntent } from '../domain/promotionEngine/qualifiedDiscountTypes.js';

// Section 1 - the published surface.

/**
 * The per-invocation inputs a handler supplies when it opens a request scope.
 *
 * Every member is optional and every one may be passed as an explicit `undefined`, because a
 * handler assembles these from an API Gateway event whose fields are themselves optional.
 */
export interface RequestScopeInput {
  /**
   * The injected clock, under an explicit UTC policy.
   *
   * A `Date` is an absolute instant, so threading one is what makes every date-dependent entity
   * method deterministic.
   */
  readonly now?: Date | undefined;

  /**
   * The authenticated account, as an opaque identifier.
   */
  readonly accountID?: string | undefined;

  /**
   * Whether the authenticated account carries the ADMIN flag - the second half of the
   * audit-stamping gate, and the only thing this member is used for.
   *
   * `!account.isNew()` means "a persisted account exists", which `accountID` above already answers:
   * a present, non-empty identifier IS that half of the gate. The legacy expression reads
   * `!getHibachiScope().getAccount().isNew() && getHibachiScope().getAccount().getAdminAccountFlag()`,
   * so only the ADMIN half of it needs a member here.
   */
  readonly adminAccountFlag?: boolean | undefined;

  /**
   * The candidate host the product feed should render, as observed on the request - and nothing
   * ELSE.
   *
   * The allow-list is no longer part of this input, and that is the whole point of the member's
   * shape.
   *
   * What survives is exactly the legacy behaviour: the host is observed on the request, as
   * `CGI.HTTP_HOST` was [integrationServices/google/views/feed/product.cfm:L14], and it is then
   * checked.
   */
  readonly feedHost?: string | undefined;
}

/**
 * A SKU named the way the schema names one: by its product and its own identifier.
 *
 * Both members are required, and the product identifier is not redundant.
 *
 * Both identifiers are OPAQUE: they are keys, never handles, and nothing derives anything from
 * their content.
 */
export interface SkuIdentity {
  /**
   * The owning product's identifier [model/entity/Product.cfc:L52].
   */
  readonly productID: string;

  /**
   * The SKU's own identifier [model/entity/Sku.cfc:L52].
   */
  readonly skuID: string;
}

/**
 * A SKU and the product it belongs to, as one load produced them.
 */
export interface LoadedSku {
  /**
   * The product the SKU belongs to, as the read wired it.
   */
  readonly product: Product;

  /**
   * The SKU itself, hydrated with its options and its per-currency price rows.
   */
  readonly sku: Sku;
}

/**
 * Whether this request's established account may be told about a price group at all.
 *
 * The five `...BasedOnPriceGroup` and `...BasedOnPriceGroupRate` operations take the price group
 * as a DECLARED ARGUMENT, which is correct.
 *
 * The three-surface split is deliberate and follows the precedent already set here.
 */
export interface PriceGroupEntitlements {
  /**
   * Whether the request's account may name this price group.
   *
   * The identifier is compared CASE-FOLDED, because every other identifier comparison in this
   * module is - `foldIdentifier` is applied to the SKU load.
   */
  isEntitledToPriceGroup(priceGroupID: string): Promise<boolean>;

  /**
   * Whether the request's account may name this price-group RATE.
   *
   * Decided by the rate's owning group, which the rate already carries.
   *
   * A rate whose owning group is absent - a null foreign key, or a group the read could not
   * resolve - is not entitled to a non-administrative caller.
   */
  isEntitledToPriceGroupRate(rate: PriceGroupRate): Promise<boolean>;
}

/**
 * The READ-ONLY entity loads published to the request tier.
 *
 * A miss is `undefined`, never an empty entity and never a throw.
 */
export interface RequestEntityLoaders {
  /**
   * The product a caller named, or nothing.
   *
   * Delegates to `ProductRepository.getProductByProductID`, whose fetch shape carries the
   * product's brand, product type, options and sale-price detail.
   */
  getProductByProductID(productID: string): Promise<Product | undefined>;

  /**
   * The product type a caller named, or nothing.
   *
   * Delegates to `ProductTypeRepository.getProductTypeByProductTypeID`, which materializes the
   * `productTypeIDPath` the cascade and the promotion engine walk.
   */
  getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined>;

  /**
   * The SKU a caller named, with its product, or nothing.
   *
   * `sorted` is FALSE and `fetchOptions` is left at its default, deliberately: sorting would take
   * the dialect-dependent option-group ordering path for a read filtered down to one row.
   *
   * @returns the SKU and its product, or `undefined` when either identifier names nothing.
   */
  getSkuBySkuIdentity(identity: SkuIdentity): Promise<LoadedSku | undefined>;

  /**
   * The price group a caller named, or nothing.
   */
  getPriceGroup(priceGroupID: string): Promise<PriceGroup | undefined>;

  /**
   * The price-group rate a caller named, or nothing.
   *
   * Delegates to `PriceGroupRepository.getPriceGroupRate`, so
   * `calculateSkuPriceBasedOnPriceGroupRate` can be bound to the rate it declares rather than to
   * one derived by re-running the cascade.
   */
  getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined>;

  /**
   * The brand a caller named, or nothing.
   *
   * This is the one load with no repository behind it, and that is a fact about the legacy rather
   * than an omission here.
   */
  getBrandByBrandID(brandID: string): Promise<Brand | undefined>;

  /**
   * The options a caller named, keyed by CASE-FOLDED identifier, in one statement.
   *
   * FETCH SHAPE: each option arrives with its `OptionGroup`, and that group with an EMPTY options
   * collection - identical to the singular form.
   *
   * An empty request issues no statement and answers an empty map.
   */
  getOptionsByOptionIDList(optionIDs: readonly string[]): Promise<ReadonlyMap<string, Option>>;
}

// The wire-shaped order document, and why it lives here.
//
// Why every absence is `| null` rather than `| undefined`.

/**
 * One already-applied promotion, as it travels on the wire.
 *
 * The engine reads this collection at [model/service/PromotionService.cfc:L427] as a
 * first-writer-wins test and never removes from it - the legacy's three backwards clear-out loops
 * [model/service/PromotionService.cfc:L64-L80] are replaced by emitted intents.
 */
export interface AppliedPromotionDocument {
  /**
   * The persisted row's own handle [model/entity/PromotionApplied.cfc:L55].
   */
  readonly promotionAppliedID: string;

  /**
   * The recorded discount as a decimal numeral, or `null`.
   *
   * `null` is a real state: `SwPromotionApplied.discountAmount` is a nullable `big_decimal`
   * [model/entity/PromotionApplied.cfc:L51], and it is never defaulted to zero here.
   */
  readonly discountAmount: string | null;

  /**
   * The promotion this row belongs to, or `null` when the row names none.
   */
  readonly promotion: { readonly promotionID: string } | null;
}

/**
 * One order item, as it travels on the wire.
 */
export interface OrderItemDocument {
  /**
   * The opaque handle every emitted intent is keyed by [model/entity/PromotionApplied.cfc:L58].
   */
  readonly orderItemID: string;

  /**
   * The product owning the named SKU.
   *
   * `SkuRepository.getSkuBySkuCode` and `getSkusBySelectedOptions` hydrate a SKU with no `product`
   * association - `src/repositories/mysql/mysqlSkuRepository.ts` calls them with its bare fetch
   * shape.
   */
  readonly productID: string;

  /**
   * The SKU this item sells. Loaded, never described by the caller.
   */
  readonly skuID: string;

  /**
   * The quantity ordered - a COUNT, hence the one plain number here
   * [model/entity/OrderItem.cfc:L56 `ormtype="integer"`].
   */
  readonly quantity: number;

  /**
   * The current price, as a decimal numeral. The base of the L244 arm.
   */
  readonly price: string;

  /**
   * The undiscounted SKU price, as a decimal numeral. The base of the L249 arm.
   */
  readonly skuPrice: string;

  /**
   * `price × quantity` as the aggregate holds it [model/entity/OrderItem.cfc:L200].
   */
  readonly extendedPrice: string;

  /**
   * `skuPrice × quantity` as the aggregate holds it [model/entity/OrderItem.cfc:L204].
   */
  readonly extendedSkuPrice: string;

  /**
   * The price group already applied to this item, or `null`.
   */
  readonly appliedPriceGroupID: string | null;

  /**
   * The item type, dereferenced with no absence test at [model/service/PromotionService.cfc:L206].
   */
  readonly orderItemType: { readonly systemCode: string };

  /**
   * The owning fulfillment, as an opaque identifier [model/entity/PromotionApplied.cfc:L59].
   */
  readonly orderFulfillmentID: string;

  /**
   * Promotions already applied to this item.
   */
  readonly appliedPromotions: readonly AppliedPromotionDocument[];
}

/**
 * One shipping address, as it travels on the wire.
 *
 * All four comparison members are nullable, because the legacy schema declares them so. Each
 * comparison is guarded on the ZONE LOCATION's member rather than on the address's
 * [model/service/AddressService.cfc:L63, L66, L69, L72]: a null on the location side SKIPS that
 * comparison, and is never a wildcard match.
 */
export interface ShippingAddressDocument {
  /**
   * The postal code compared at [model/service/AddressService.cfc:L63].
   */
  readonly postalCode: string | null;

  /**
   * The city compared at [model/service/AddressService.cfc:L66].
   */
  readonly city: string | null;

  /**
   * The state code compared at [model/service/AddressService.cfc:L69].
   */
  readonly stateCode: string | null;

  /**
   * The country code compared at [model/service/AddressService.cfc:L72].
   */
  readonly countryCode: string | null;

  /**
   * `getAddress().getNewFlag()` [model/service/PromotionService.cfc:L703] - a definite boolean.
   */
  readonly isNew: boolean;
}

/**
 * One order fulfillment, as it travels on the wire.
 */
export interface OrderFulfillmentDocument {
  /**
   * The opaque handle a fulfillment-level intent is keyed by.
   */
  readonly orderFulfillmentID: string;

  /**
   * The fulfillment charge, as a decimal numeral.
   */
  readonly fulfillmentCharge: string;

  /**
   * The fulfillment method the qualifier gates test.
   */
  readonly fulfillmentMethod: {
    readonly fulfillmentMethodID: string;
    readonly fulfillmentMethodType: string;
  };

  /**
   * The shipping method, or `null`.
   *
   * `null` is a real state rather than a missing value: the gate at
   * [model/service/PromotionService.cfc:L701] tests `isNull(orderFulfillment.getShippingMethod())`
   * explicitly.
   */
  readonly shippingMethod: { readonly shippingMethodID: string } | null;

  /**
   * Promotions already applied to this fulfillment.
   */
  readonly appliedPromotions: readonly AppliedPromotionDocument[];

  /**
   * A weight, hence a count rather than money.
   */
  readonly totalShippingWeight: number;

  /**
   * The address the zone evaluator consumes, or `null`.
   */
  readonly address: ShippingAddressDocument | null;
}

/**
 * An order, as it travels on the wire: the JSON-materializable naming of an {@link OrderView}.
 */
export interface OrderViewDocument {
  /**
   * The opaque order handle [model/entity/PromotionApplied.cfc:L61].
   */
  readonly orderID: string;

  /**
   * The order-type gate.
   */
  readonly orderType: { readonly systemCode: string };

  /**
   * The account this order prices for, or `null` for the logged-out arm.
   *
   * `PriceGroupService.updateOrderAmountsWithPriceGroups` resolves the account's price groups from
   * it (`src/services/priceGroupService.ts`, the equivalent of the `!isNull(getAccount())` test at
   * [model/service/PriceGroupService.cfc:L365]).
   */
  readonly accountID: string | null;

  /**
   * The comma-delimited promotion-code list.
   *
   * A string for signature parity: the legacy declares it `type="string"`
   * [model/dao/PromotionDAO.cfc:L53] and expands it with `listToArray`
   * [model/dao/PromotionDAO.cfc:L126].
   */
  readonly promotionCodeList: string;

  /**
   * A count [model/entity/Order.cfc:L624-L631], the seed for the qualification count.
   */
  readonly totalSaleQuantity: number;

  /**
   * `getSubtotal()`, tested by the qualifier gates
   * [model/service/PromotionService.cfc:L648, L650].
   */
  readonly subtotal: string;

  /**
   * `getSubtotalAfterItemDiscounts()`, read by the order-level reward branch
   * [model/service/PromotionService.cfc:L417].
   */
  readonly subtotalAfterItemDiscounts: string;

  /**
   * The order-level fulfillment total the same branch measures against.
   */
  readonly fulfillmentChargeAfterDiscountTotal: string;

  /**
   * The three-character currency code [model/entity/Order.cfc:L54 `length="3"`].
   *
   * Minted through `toCurrencyCode`, which checks the column's own constraint and nothing more:
   * which codes are real is the `skuEligibleCurrencies` setting's decision
   * [model/service/SettingService.cfc:L222].
   */
  readonly currencyCode: string;

  /**
   * Order-level applied promotions.
   */
  readonly appliedPromotions: readonly AppliedPromotionDocument[];

  /**
   * The items to price.
   */
  readonly orderItems: readonly OrderItemDocument[];

  /**
   * The fulfillments the shipping-related gates read.
   */
  readonly orderFulfillments: readonly OrderFulfillmentDocument[];
}

/**
 * The result of the one composed pricing operation this root publishes.
 *
 * Both passes return INTENTS rather than mutating an order, because the order aggregate is out of
 * scope - the anti-corruption seam.
 */
export interface OrderPricingResult {
  /**
   * What the price-group pass decided, in the order it decided it.
   */
  readonly priceGroupIntents: readonly PriceGroupAppliedIntent[];

  /**
   * What the promotion pass decided, given `pricedOrder`.
   */
  readonly promotionIntents: readonly PromotionAppliedIntent[];

  /**
   * The order view the promotion pass actually read.
   */
  readonly pricedOrder: OrderView;
}

/**
 * The price-group capability this root publishes: `PriceGroupService` MINUS its order pass.
 *
 * `updateOrderAmountsWithPriceGroups` [model/service/PriceGroupService.cfc:L364] must run before
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58], because the
 * promotion pass reads price-group state in its branch CONDITION at
 * [model/service/PromotionService.cfc:L241-L254] - no applied group, or an eligible applied group.
 */
export type PriceResolutionCapability = Omit<
  PriceGroupService,
  'updateOrderAmountsWithPriceGroups'
>;

/**
 * The promotion capability this root publishes: `PromotionService` MINUS its order pass.
 *
 * `updateOrderAmountsWithPromotions` [model/service/PromotionService.cfc:L58] is the pass that
 * READS what the price-group pass wrote.
 */
export type PromotionQueryCapability = Omit<PromotionService, 'updateOrderAmountsWithPromotions'>;

/**
 * One request's worth of wired graph.
 *
 * Created by `CompositionRoot.createRequestScope` and discarded when the invocation ends.
 */
export interface RequestScope extends SalePriceResolver {
  /**
   * The instant every date comparison in this request resolves against.
   */
  readonly now: Date;

  /**
   * The explicit replacement for `getHibachiScope()` / `getSlatwallScope()`.
   */
  readonly currentAccountContext: CurrentAccountContext;

  // They carried SEVEN durable mutations onto the request-tier surface - `saveProduct` and
  // `deleteProduct` `src/domain/ports/productRepository.ts`, `saveSku`, `saveProductType`,
  // `savePriceGroup`, `savePriceGroupRate` and `deletePriceGroup`.

  /**
   * The seven READ-ONLY entity loads a handler may perform to bind a service argument.
   *
   * Several ported service methods take an ENTITY - `getRateForProductBasedOnPriceGroup` takes a
   * `Product` [model/service/PriceGroupService.cfc:L102], `calculateSkuPriceBasedOnPriceGroupRate`
   * takes a `PriceGroupRate` [model/service/PriceGroupService.cfc:L316], the promotion engine's order
   * items carry a `Sku` and an `appliedPriceGroup`.
   */
  readonly entityLoaders: RequestEntityLoaders;

  /**
   * The price-group authorization decision for this request's account.
   *
   * See {@link PriceGroupEntitlements} for what makes an account entitled, why an administrative
   * caller bypasses it, and why authorizing a NET-NEW route breaks no parity with the ported
   * cascade.
   */
  readonly priceGroupEntitlements: PriceGroupEntitlements;

  readonly roundingRuleService: RoundingRuleService;
  readonly brandService: BrandService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  readonly productService: ProductService;

  /**
   * Every method AAP 0.4.1 requires of `priceResolutionHandler.ts` survives -
   * `calculateSkuPriceBasedOnCurrentAccount`, `calculateSkuPriceBasedOnAccount`,
   * `calculateSkuPriceBasedOnPriceGroup`, `calculateSkuPriceBasedOnPriceGroupRate`,
   * `getBestPriceGroupDetailsBasedOnSkuAndAccount`, all three `getRateFor*` cascade entry points,
   * `getPriceGroupDataJSON`, `updatePriceGroupSKUSettings`.
   */
  readonly priceGroupService: PriceResolutionCapability;

  /**
   * Every other published method survives, including the four the AAP 0.4.2 interface-parity table
   * names as must-preserve or visibility-widened: `getDiscountAmount`, `getPromotionCodeUseCount`,
   * `getPromotionCodeAccountUseCount`, `getOrderItemInQualifier`, `getOrderItemInReward`,
   * `getSalePriceDetailsForProductSkus`, `getShippingMethodOptionsDiscountAmountDetails`.
   */
  readonly promotionService: PromotionQueryCapability;

  /**
   * The currency converter for this request; never shared across requests.
   */
  readonly currencyConverter: CurrencyConverter;

  /**
   * The feed port, present only when `RequestScopeInput.feedHost` was supplied.
   */
  readonly productFeedPort: ProductFeedPort | undefined;

  /**
   * The argument to pass `productFeedPort.generateProductFeed` - present under exactly the same
   * condition as the port itself.
   *
   * Why the scope hands this over rather than letting a handler build it.
   *
   * A handler therefore checks one thing - that the pair is present - and forwards it unchanged.
   */
  readonly feedCriteria: FeedCriteria | undefined;

  /**
   * Turn a wire-shaped order document into the `OrderView` the two passes consume.
   *
   * @param document the caller's projection of the order aggregate.
   * @returns the read-only order view, with every entity loaded and every value object minted.
   * @throws `CompositionDataError` naming the member and identifier that could not be resolved.
   */
  materializeOrderView(document: OrderViewDocument): Promise<OrderView>;

  // `getSalePriceDetailsForProductSkus(productID)` is inherited, not redeclared.
  //
  // `MysqlProductRepository` holds the same adapter as a collaborator and resolves the map on its
  // read path before every `Product` it constructs.

  /**
   * The price-group pass and the promotion pass, as one operation whose order the caller cannot
   * invert.
   *
   * Why withdrawal is sound rather than merely tidy: running either pass alone is never correct,
   * so there is no legitimate caller to break.
   */
  updateOrderAmountsWithPriceGroupsThenPromotions(order: OrderView): Promise<OrderPricingResult>;

  /**
   * Load this request's address-zone index so a synchronous zone test can answer.
   *
   * A direct zone consultation before preparation throws rather than answering "not in zone".
   */
  prepareAddressZoneEvaluation(): Promise<void>;
}

/**
 * What a caller may learn about how this process was configured.
 *
 * So the redaction is moved from the serializer to the type.
 */
export interface CompositionDiagnostics {
  /**
   * `development` | `test` | `production`, as resolved. A closed enumeration.
   */
  readonly environment: RuntimeEnvironment;

  /**
   * The dialect this composition committed to. Always `'MySQL'`.
   */
  readonly dialect: DatabaseDialect;

  /**
   * Whether the database channel is protected and how weak the protocol may be - without the trust
   * anchor, and without anything that names the server.
   */
  readonly tls: {
    readonly mode: DatabaseTlsMode;
    readonly minimumVersion: TlsMinimumVersion;
    readonly certificateAuthorityConfigured: boolean;
  };

  /**
   * How MANY hosts the product-feed allow-list admits, never which ones.
   *
   * Always a number, because `0` is a reading and absence is not.
   */
  readonly feed: {
    readonly allowedHostCount: number;
  };

  /**
   * How MANY conversion rates were supplied, and WHETHER a retrieval instant came with them -
   * never the rates themselves and never the instant.
   *
   * The instant is reduced to a boolean rather than published because a timestamp is a fact about
   * the operator's data pipeline.
   */
  readonly currency: {
    readonly referenceRateCount: number;
    readonly ratesRetrievedAtConfigured: boolean;
  };
}

/**
 * The module-scope graph, created once and reused across warm invocations.
 */
export interface CompositionRoot {
  /**
   * What this process was configured to do, REDACTED.
   *
   * `AppConfig` remains reachable INSIDE this module - `ModuleScopeGraph.config` still holds it,
   * because the pool factory and the feed host allow-list genuinely need the live values.
   */
  readonly diagnostics: CompositionDiagnostics;

  /**
   * The dialect this composition committed to. Always `'MySQL'`.
   */
  readonly dialect: DatabaseDialect;

  /**
   * The settings provider, with `skuEligibleCurrencies` ALREADY RESOLVED. Stateless and immutable,
   * which is why it is safe at module scope.
   */
  readonly settingsProvider: SettingsProvider;

  /**
   * The Google integration adapter. No constructor parameters, no state -
   * [integrationServices/google/controllers/feed.cfc:L51] `productService` is the fifth dead
   * injection and is not wired.
   */
  readonly integration: GoogleIntegration;

  /**
   * Open one request's scope. Called exactly once per invocation.
   *
   * Asynchronous because the refusals it can produce - an unlisted product-feed host among them -
   * arrive as REJECTIONS rather than as synchronous throws.
   */
  createRequestScope(input?: RequestScopeInput): Promise<RequestScope>;

  /**
   * Open one request's scope and the six adapters that scope was assembled with.
   *
   * The assembly-inspection hook, which exists because {@link RequestScope} no longer publishes
   * the adapters.
   *
   * One assembly, not two, `AND` that is the whole reason this returns a pair rather than being a
   * second method beside `createRequestScope`.
   *
   * @param input the same per-request input `createRequestScope` accepts.
   */
  createInspectableRequestScope(input?: RequestScopeInput): Promise<InspectableRequestScope>;
}

/**
 * The six MySQL adapters one request's graph was assembled with.
 *
 * Each member is typed to its PORT rather than to its adapter class, exactly as the retired
 * `RequestScope` members were.
 */
export interface RequestScopeAdapters {
  /**
   * The product adapter, published with both facets this root composes it through.
   */
  readonly productRepository: ProductRepository & ProductSetLoader;

  /**
   * The SKU adapter, published with both facets, for the reason given just above.
   */
  readonly skuRepository: SkuRepository & SkuSetLoader;
  readonly optionRepository: OptionRepository;
  readonly productTypeRepository: ProductTypeRepository;
  readonly promotionRepository: PromotionRepository;
  readonly priceGroupRepository: PriceGroupRepository;
}

/**
 * One request's scope together with the adapters it was assembled with, from a single assembly.
 *
 * The two halves are returned as siblings rather than the adapters being hung off the scope.
 */
export interface InspectableRequestScope {
  readonly scope: RequestScope;
  readonly adapters: RequestScopeAdapters;
}

/**
 * The test seam, and the only way to build a root that is not memoized.
 *
 * Passing any overrides bypasses the module memo entirely, so a suite can drive the whole graph
 * against a fake executor without patching module state and without a live database.
 *
 * This root, for its own configuration and its one dialect decision; 2. The pool factory in
 * `../repositories/mysql/connection.js`, when no `executor` override is supplied.
 */
export interface CompositionOverrides {
  /**
   * A prepared-statement executor to use INSTEAD of the module-scope pool. Supplying one means no
   * pool is ever created.
   */
  readonly executor?: PreparedStatementExecutor | undefined;

  /**
   * The European Central Bank reference rates.
   *
   * Absent, the DEPLOYMENT's configured table applies, and absent that the documented empty table
   * is used - see section 4.3, where the choice is recorded as a JUDGMENT CALL against
   * [model/service/CurrencyService.cfc:L100-L101].
   */
  readonly europeanCentralBankRates?: EuropeanCentralBankRateTable | undefined;

  /**
   * When the OVERRIDDEN rate table above was retrieved.
   */
  readonly europeanCentralBankRatesRetrievedAt?: Date | undefined;

  /**
   * The environment to resolve configuration from, instead of `process.env`.
   *
   * Supplying one is what lets a suite compose the whole graph with no credential anywhere in the
   * repository.
   */
  readonly environment?: EnvironmentSource | undefined;
}

/**
 * Refuse a set of overrides that would give one composition two configurations.
 *
 * @param overrides the overrides this composition was handed.
 */
function assertSingleConfigurationAuthority(overrides: CompositionOverrides): void {
  if (overrides.environment === undefined) {
    return;
  }

  if (overrides.executor === undefined) {
    throw new TypeError(
      'CompositionOverrides.environment requires CompositionOverrides.executor. An explicit ' +
        'environment source is not memoized, so the pool factory in ' +
        'repositories/mysql/connection.ts would go on reading process.env and this composition ' +
        'would hold two configurations at once.',
    );
  }

  // No dialect check here, deliberately.
}

// Section 2 - legacy-declared values this root owns.
//
// None of these is a credential, a secret, a host, an IP or a connection string.

/**
 * The first segment of a product path: `getProductURL()` returns
 * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"` [model/entity/Product.cfc:L207-L209].
 */
const GLOBAL_URL_KEY_PRODUCT_DEFAULT = 'sp';
const GLOBAL_URL_KEY_PRODUCT_TYPE_DEFAULT = 'spt';

/**
 * `setting('skuCurrency')` [model/service/SettingService.cfc:L221], declared
 * `{fieldType="select", defaultValue="USD"}`.
 *
 * Hardcoded `"USD"` anywhere in `model/entity/Sku.cfc`; `getCurrencyCode()`
 * [model/entity/Sku.cfc:L360-L365] merely memoizes `this.setting('skuCurrency')`.
 */
const SKU_CURRENCY_DEFAULT = 'USD';
const PRODUCT_IMAGE_DEFAULT_EXTENSION_DEFAULT = 'jpg';

/**
 * `setting('productImageOptionCodeDelimiter')` [model/service/SettingService.cfc:L192], whose
 * legacy option list is exactly `['-','_']` [model/service/SettingService.cfc:L346-L347].
 *
 * Also one of the three product-presentation setting names - not a port key.
 */
const PRODUCT_IMAGE_OPTION_CODE_DELIMITER_DEFAULT = '-';

/**
 * `setting('productTitleString')` [model/service/SettingService.cfc:L193], declared
 * `{fieldType="text", defaultValue="${brand.brandName} ${productName}"}`.
 *
 * A template, not a title, and not a javascript template literal.
 *
 * The third of the three product-presentation setting names, and the only one whose consumer is
 * not ported: `Product.getTitle()` stays out because that renderer lives under `org/Hibachi/`.
 */
const PRODUCT_TITLE_STRING_DEFAULT = '${brand.brandName} ${productName}';

/**
 * `getHibachiScope().getBaseImageURL()`, resolved to the host-relative prefix it is.
 */
const BASE_IMAGE_URL_DEFAULT = '/custom/assets/images';

/**
 * The EFFECTIVE missing-image path, with the legacy three-candidate precedence already resolved.
 *
 * JUDGMENT CALL: each legacy candidate is selected by `fileExists(expandPath(...))`, a FILESYSTEM
 * PROBE that has no counterpart under the target's execution model - the assets live behind an
 * asset host.
 */
const MISSING_IMAGE_PATH_DEFAULT = '/assets/images/missingimage.jpg';

/**
 * The two setting names the feed view reads, exactly as it spells them
 * [integrationServices/google/views/feed/product.cfm:L58].
 *
 * They are bound values rather than interpolated text, and their case is preserved as declared
 * even though the statement folds them.
 */
const SKU_SHIPPING_WEIGHT_SETTING_NAME = 'skuShippingWeight';
const SKU_SHIPPING_WEIGHT_UNIT_CODE_SETTING_NAME = 'skuShippingWeightUnitCode';

/**
 * `setting('skuShippingWeight')` [model/service/SettingService.cfc:L232], `1`.
 */
const SKU_SHIPPING_WEIGHT_DEFAULT = '1';

/**
 * `setting('skuShippingWeightUnitCode')` [model/service/SettingService.cfc:L233], `"lb"`. The last
 * step of the cascade; see above.
 */
const SKU_SHIPPING_WEIGHT_UNIT_CODE_DEFAULT = 'lb';

/**
 * The site handed to `assertMySqlDialect`, so a refusal names where it happened.
 */
const DIALECT_DECISION_SITE = 'bootstrap.ts composition root';

/**
 * The European Central Bank rate table when no rates are supplied.
 *
 * JUDGMENT CALL: this empty default is the E3 resolution. Reproducing
 * `getEuropeanCentralBankRates()` [model/service/CurrencyService.cfc:L104-L118] needs both an HTTP
 * client and an XML parser, and the thirteen exactly-pinned packages contain neither.
 *
 * TODO: Add integration support Carried forward verbatim from
 * [model/service/CurrencyService.cfc:L81]. It is flagged, never silently completed: a rate
 * integration is what would let this table be populated from a live source rather than from
 * configuration.
 */
const EMPTY_EUROPEAN_CENTRAL_BANK_RATES: EuropeanCentralBankRateTable = Object.freeze({});

/**
 * How old a supplied rate table may be before its age is reported, in days.
 *
 * CFML parity [model/service/CurrencyService.cfc:L105]: the legacy refetched whenever
 * `variables.europeanCentralBankRates.retrieved <= dateFormat(now() - 1, "yyyy-mm-dd")` - a
 * one-day window, and the only freshness rule the source has.
 */
const EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS = 1;

/**
 * Milliseconds in a day, for the age comparison above.
 */
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * How far ahead of this host's clock a rate table's retrieval instant may sit before it is
 * reported as a future instant rather than as an age of zero.
 *
 * Mirrors the allowance `../lib/config.js` applies when it REFUSES a future
 * `ECB_RATES_RETRIEVED_AT`.
 */
const MAX_RATE_INSTANT_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/**
 * Which threshold-resolution outcomes have already been announced in this process.
 *
 * The tier-1 graph is memoized, so in production this file builds one composition per container
 * and this set holds at most one member.
 *
 * Keyed by the classifier rather than by a bare boolean, for two reasons.
 */
const announcedLogThresholdSources = new Set<LogThresholdSource>();

/**
 * Hand the validated emission threshold to `../lib/logger.js`, and announce a coerced one exactly
 * once.
 */
function adoptConfiguredLogThreshold(logging: LoggingConfig): void {
  logger.adoptConfiguredThreshold(logging.level);

  // `configured` and `defaulted-unset` are both correct operator intent - naming a level, or
  // leaving the variable unset to accept the default - so neither is worth a line.
  if (
    logging.levelSource !== 'defaulted-unrecognized' ||
    announcedLogThresholdSources.has(logging.levelSource)
  ) {
    return;
  }

  announcedLogThresholdSources.add(logging.levelSource);

  // Emitted at `warn`, which the coerced threshold `info` admits, so the report about the
  // threshold can never be suppressed by the threshold it is reporting on.
  logger.warn(
    'LOG_LEVEL holds a value this service does not recognize, so the default threshold is in force; recognized values are debug, info, warn, error',
    { logThresholdSource: logging.levelSource, thresholdInForce: logging.level },
  );
}

/**
 * Report the age of the configured rate table, once, at module-graph construction.
 *
 * Cardinality is the point of doing it here rather than per conversion: the table is fixed for the
 * lifetime of the execution container.
 *
 * `ageInDays` is load-bearing on a logger allow-list entry, and the coupling is worth naming
 * because it is invisible from here and fails silently.
 */
function reportRateTableAge(
  retrievedAt: Date | undefined,
  rates: EuropeanCentralBankRateTable,
): void {
  const rowCount = Object.keys(rates).length;

  if (rowCount === 0) {
    // The unavailable state, and it is not an anomaly to warn about on every cold a deployment
    // that publishes a single currency configures no rates and is correct to.
    logger.info('No currency conversion rates are configured; conversions will pass through', {
      rowCount,
    });
    return;
  }

  if (retrievedAt === undefined) {
    // Unreachable through configuration - `../lib/config.js` refuses a rate table with no
    // retrieval instant - so this arm exists for the override seam.
    logger.info('Currency conversion rates supplied without a retrieval instant', { rowCount });
    return;
  }

  const ageInMilliseconds = Date.now() - retrievedAt.getTime();

  // Staleness comparison rather than after.
  //
  // Reach this function and only one of them is validated: `../lib/config.js` refuses a future
  // `ECB_RATES_RETRIEVED_AT` outright, but `CompositionOverrides` supplies a rate table directly
  // and bypasses that resolver entirely.
  if (ageInMilliseconds < -MAX_RATE_INSTANT_CLOCK_SKEW_MS) {
    logger.warn(
      'Currency conversion rates carry a retrieval instant in the future; their age cannot be assessed',
      { rowCount, ageInDays: Math.ceil(ageInMilliseconds / MILLISECONDS_PER_DAY) },
    );
    return;
  }

  const ageInDays = Math.max(0, Math.floor(ageInMilliseconds / MILLISECONDS_PER_DAY));

  if (ageInDays > EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS) {
    logger.warn('Currency conversion rates are older than the one-day refresh window', {
      rowCount,
      ageInDays,
    });
    return;
  }

  logger.info('Currency conversion rates resolved from configuration', { rowCount, ageInDays });
}

// Section 3 - fault reporting, SQL, and row reading.
//
// Every statement this root owns is a LITERAL constant with positional `?` placeholders, executed
// through the narrow prepared-statement executor.

/**
 * A column the composition root read could not be interpreted.
 *
 * Module-local, following the sibling adapters: the constructor is not exported and no message
 * ever echoes a rejected value - only the column, the statement that produced it.
 */
class CompositionColumnError extends Error {
  public constructor(columnName: string, observedType: string, statementLabel: string) {
    super(
      `Statement '${statementLabel}' produced column '${columnName}' as ${observedType}, ` +
        'which the composition root cannot interpret. The Sw* schema is unchanged by this ' +
        'migration, so a mismatch here indicates a driver or statement problem.',
    );
    this.name = 'CompositionColumnError';
  }
}

/**
 * A row the schema's own constraints say cannot exist.
 *
 * Raised where a foreign key resolves to nothing - a dangling reference the legacy ORM association
 * could not have produced.
 */
class CompositionDataError extends Error {
  public constructor(detail: string) {
    super(`The composition root read data the Sw* schema forbids: ${detail}.`);
    this.name = 'CompositionDataError';
  }
}

/**
 * One member of a caller's own document that this tier could not use, reduced to what is safe to
 * publish.
 *
 * Declared locally and structurally identical to `MappedFieldIssue` in `./errorMapper.ts`, which
 * is the type a primary adapter hands to `invalidRequestResponse`.
 *
 * `path` is a dotted member path into the submitted document and `message` describes the
 * constraint that failed.
 */
export interface OrderViewDocumentFieldIssue {
  /**
   * Dotted path to the offending member of the submitted order document.
   */
  readonly path: string;
  /**
   * What the member had to satisfy and did not. Never the value it held.
   */
  readonly message: string;
}

/**
 * A wire order document named a catalogue row this request cannot price.
 *
 * A separate class from {@link CompositionDataError}, and exported, because conflating the two
 * costs on both sides: a caller cannot tell a bad reference from a broken composition, and the
 * handler cannot map the two onto different statuses.
 */
export class OrderViewDocumentDataError extends Error {
  /**
   * The member paths that could not be resolved, and the constraint each failed.
   */
  public readonly fields: readonly OrderViewDocumentFieldIssue[];

  public constructor(fields: readonly OrderViewDocumentFieldIssue[]) {
    super(
      'The order document names catalogue data this request cannot price, so no order view was ' +
        'materialized and neither pass was run.',
    );
    this.name = 'OrderViewDocumentDataError';
    this.fields = fields;
  }
}

/**
 * The dotted path to the submitted order document's item array.
 *
 * It includes the `order.` prefix on purpose, so a member path this tier publishes is
 * indistinguishable in shape from one the schema publishes for the same member.
 *
 * SERVER-AUTHORED, like the prefix it mirrors: it is a frozen literal, never composed from
 * anything a caller sent.
 */
const ORDER_ITEMS_DOCUMENT_PATH = 'order.orderItems';

/**
 * A collaborator was reached before the wiring that binds it had completed.
 *
 * Unreachable through any published entry point: all three late bindings are closed before
 * `createRequestGraph` returns - and that closure is now ASSERTED there rather than merely
 * arranged.
 */
class CompositionWiringError extends Error {
  public constructor(collaborator: string) {
    super(
      `The composition root reached '${collaborator}' before its wiring completed. ` +
        'This is a programming error in the composition root, not a data condition.',
    );
    this.name = 'CompositionWiringError';
  }
}

/**
 * A runtime value violated a contract this module's TYPES declare, so nothing was attempted.
 *
 * `createUniqueURLTitle('Nike', <out-of-union table>)` indexed a frozen three-key statement table
 * with no membership test, so `executor.execute(undefined, ['nike','nike-%'])` was issued and the
 * method RETURNED `"nike"`.
 */
class CompositionContractError extends Error {
  public constructor(contract: string, site: string) {
    super(
      `The composition root refused to continue: ${contract}. The site was '${site}'. This is a ` +
        'programming error at a boundary the compiler cannot police, not a data condition, so ' +
        'nothing was read, nothing was written and no result may be read as an answer.',
    );
    this.name = 'CompositionContractError';
  }
}

/**
 * The rows a statement answered, or a named refusal.
 *
 * `PreparedStatementExecutor.execute` declares `Promise<readonly SqlRow[]>`, and every
 * implementation in this repository honours it - but the port is an INJECTION POINT.
 *
 * @param rows whatever the injected executor answered.
 * @param statementLabel the statement's own label, so a refusal is attributable.
 * @returns the rows, unchanged, when the contract holds.
 */
function requireStatementRows(rows: readonly SqlRow[], statementLabel: string): readonly SqlRow[] {
  // The predicate is captured as a BOOLEAN rather than used as a type guard, deliberately:
  // `Array.isArray` narrows a `readonly T[]` to `any[]`.
  const answeredAnArray: boolean = Array.isArray(rows);

  if (!answeredAnArray) {
    throw new CompositionContractError(
      'the injected PreparedStatementExecutor answered a result set that is not an array, which its ' +
        'own declared return type forbids',
      statementLabel,
    );
  }

  return rows;
}

/**
 * An assembled request graph was missing a binding, so the root was not exposed.
 *
 * This is the refusal that replaces a silent partial root.
 *
 * Module-local, following every sibling fault type in this section: the constructor is not
 * exported, and the message names the BINDING and nothing else - no value.
 */
class CompositionIncompleteError extends Error {
  public constructor(binding: string) {
    super(
      `The composition root assembled a request graph whose '${binding}' binding is ` +
        'absent, so no composition root was exposed. This is a programming error in ' +
        'the composition root, not a data condition.',
    );
    this.name = 'CompositionIncompleteError';
  }
}

/**
 * A zone test was reached before this request's zone-to-locations index was loaded.
 *
 * The evaluator is synchronous, so it cannot start the read itself.
 */
class AddressZoneEvaluationNotPreparedError extends Error {
  public constructor() {
    super(
      'An address-zone test was reached before this request loaded its zone-to-locations ' +
        'index, so no verdict was produced. Answering "not in zone" here would silently ' +
        'disable configured address-zone restrictions. Await ' +
        "'RequestScope.prepareAddressZoneEvaluation()' before reaching a zone-consulting " +
        "promotion query directly, or use 'updateOrderAmountsWithPriceGroupsThenPromotions', " +
        'which loads the index itself.',
    );
    this.name = 'AddressZoneEvaluationNotPreparedError';
  }
}

/**
 * The image store this root wires performs no I/O. See section 4.5.
 */
class ImageStoreNotConfiguredError extends Error {
  public constructor(operation: string, request: string) {
    super(
      `No image store is configured in this composition, so '${operation}' did not run. ` +
        'The image subsystem is out of scope for this migration; nothing was written, ' +
        'nothing was deleted, and no result may be read as a successful one. The request ' +
        `was: ${request}.`,
    );
    this.name = 'ImageStoreNotConfiguredError';
  }
}

/**
 * The subscription term provider this root wires answers nothing. See section 4.6.
 */
class SubscriptionTermsNotConfiguredError extends Error {
  public constructor(operation: string, request: string) {
    super(
      `No subscription term provider is configured in this composition, so '${operation}' ` +
        'did not run. Subscription handling is out of scope for this migration; the absence ' +
        'of an answer must not be read as "no such record exists". The request was: ' +
        `${request}.`,
    );
    this.name = 'SubscriptionTermsNotConfiguredError';
  }
}

// One label per statement, as constants rather than inline strings, because they appear in fault
// messages and are the handle a suite asserts emitted SQL by.

const SELECT_CURRENCY_RECORDS = 'bootstrapSelectCurrencyRecords';
const SELECT_OPTION_WITH_GROUP_BY_ID = 'bootstrapSelectOptionWithGroupByID';
const SELECT_OPTIONS_WITH_GROUP_BY_ID = 'bootstrapSelectOptionsWithGroupByID';
const SELECT_OPTION_GROUP_BY_ID = 'bootstrapSelectOptionGroupByID';
const SELECT_OPTIONS_BY_OPTION_GROUP_ID = 'bootstrapSelectOptionsByOptionGroupID';
const SELECT_ACCOUNT_PRICE_GROUP_IDS = 'bootstrapSelectAccountPriceGroupIDs';
const SELECT_PRICE_GROUP_PAGE_IDS = 'bootstrapSelectPriceGroupPageIDs';
const SELECT_PROMOTION_BY_ID = 'bootstrapSelectPromotionByID';
// One statement answers the whole candidate family, rather than one candidate per round trip.
const SELECT_URL_TITLE_FAMILY = 'bootstrapSelectUrlTitleFamily';
const SELECT_ADDRESS_ZONE_LOCATIONS = 'bootstrapSelectAddressZoneLocations';

// The brand read behind `RequestEntityLoaders.getBrandByBrandID`.
//
// `BrandService.cfc` declares exactly one function, `saveBrand`
// [model/service/BrandService.cfc:L67]; every brand READ a caller might expect arrived by
// inheritance from the framework base `org/Hibachi/HibachiService.cfc`.
const SELECT_BRAND_BY_BRAND_ID = 'bootstrapSelectBrandByBrandID';

// The two statements behind per-SKU setting resolution.
const SELECT_SKU_FEED_SETTINGS = 'bootstrapSelectSkuFeedSettings';
const SELECT_PRODUCT_TYPE_PATHS = 'bootstrapSelectProductTypePaths';

// The statement behind the SETTINGS RESOLUTION - the general, relationship-free rows for the seven
// names this composition resolves: the four keys the one published `SettingsProvider` contract
// answers.
const SELECT_GENERAL_SETTINGS = 'bootstrapSelectGeneralSettings';

// The framework-generated writes.
const INSERT_ROUNDING_RULE = 'bootstrapInsertRoundingRule';
const UPDATE_ROUNDING_RULE = 'bootstrapUpdateRoundingRule';
const INSERT_BRAND = 'bootstrapInsertBrand';
const UPDATE_BRAND = 'bootstrapUpdateBrand';
// No `SELECT_BRAND_BY_URL_TITLE` LABEL. The uniqueness probe below asks EXISTENCE only, so it
// reads no column through `readIdentifier` and needs no statement label to attribute a read
// failure to.

/**
 * The two `SwCurrency` columns the currency projection needs.
 */
const SELECT_CURRENCY_RECORDS_SQL = 'SELECT currencyCode, activeFlag FROM SwCurrency';

/**
 * The `SwOption` columns, in the order `mysqlSkuRepository.ts` selects them.
 */
const OPTION_COLUMN_NAMES = [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
  'optionGroupID',
  'defaultImageID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
];

/**
 * The `SwOptionGroup` columns, aliased so a joined row cannot collide.
 */
const OPTION_GROUP_ALIAS_PREFIX = 'optionGroup_';

const OPTION_GROUP_COLUMN_NAMES = [
  'optionGroupID',
  'optionGroupName',
  'optionGroupCode',
  'optionGroupImage',
  'optionGroupDescription',
  'imageGroupFlag',
  'sortOrder',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
];

const OPTION_GROUP_COLUMNS_SQL = OPTION_GROUP_COLUMN_NAMES.map(
  (columnName: string): string =>
    `optionGroup.${columnName} AS ${OPTION_GROUP_ALIAS_PREFIX}${columnName}`,
).join(', ');

/**
 * One option with its group, for `OptionLoadingCollaborator.getOption`.
 *
 * The join is a LEFT JOIN because `Option.optionGroup` is a nullable many-to-one
 * [model/entity/Option.cfc:L59]; an inner join would silently drop an option whose group column is
 * null.
 */
const SELECT_OPTION_WITH_GROUP_BY_ID_SQL = [
  'SELECT',
  OPTION_COLUMN_NAMES.map((columnName: string): string => `swOption.${columnName}`).join(', '),
  `, ${OPTION_GROUP_COLUMNS_SQL}`,
  'FROM SwOption swOption',
  'LEFT JOIN SwOptionGroup optionGroup ON swOption.optionGroupID = optionGroup.optionGroupID',
  'WHERE swOption.optionID = ?',
].join(' ');

/**
 * The same read as {@link SELECT_OPTION_WITH_GROUP_BY_ID_SQL}, for a set of keys.
 *
 * @param identifierCount how many keys the statement will bind, one or more.
 */
function buildSelectOptionsWithGroupByIDSql(identifierCount: number): string {
  return [
    'SELECT',
    OPTION_COLUMN_NAMES.map((columnName: string): string => `swOption.${columnName}`).join(', '),
    `, ${OPTION_GROUP_COLUMNS_SQL}`,
    'FROM SwOption swOption',
    'LEFT JOIN SwOptionGroup optionGroup ON swOption.optionGroupID = optionGroup.optionGroupID',
    `WHERE swOption.optionID IN (${new Array<string>(identifierCount).fill('?').join(', ')})`,
  ].join(' ');
}

/**
 * One option group, for `OptionLoadingCollaborator.getOptionGroup`.
 */
const SELECT_OPTION_GROUP_BY_ID_SQL = [
  `SELECT ${OPTION_GROUP_COLUMN_NAMES.join(', ')}`,
  'FROM SwOptionGroup',
  'WHERE optionGroupID = ?',
].join(' ');

/**
 * A group's options, ordered as the ORM orders them.
 *
 * `OptionGroup.options` declares `orderby="sortOrder"` [model/entity/OptionGroup.cfc:L70] - one
 * COLUMN, no second term - so Hibernate emitted `ORDER BY sortOrder` and nothing more.
 *
 * The premise was true and the conclusion did not follow from it.
 */
const SELECT_OPTIONS_BY_OPTION_GROUP_ID_SQL = [
  `SELECT ${OPTION_COLUMN_NAMES.join(', ')}`,
  'FROM SwOption',
  'WHERE optionGroupID = ?',
  'ORDER BY sortOrder',
].join(' ');

/**
 * The price groups assigned DIRECTLY to an account.
 *
 * `PriceGroup.accounts` is a many-to-many over link table `SwAccountPriceGroup` with
 * `fkcolumn="priceGroupID"` and `inversejoincolumn="accountID"` [model/entity/PriceGroup.cfc:L67].
 */
const SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL = [
  'SELECT priceGroupID',
  'FROM SwAccountPriceGroup',
  'WHERE accountID = ?',
].join(' ');

/**
 * The price-group page - the first ten rows, unordered.
 *
 * The reasoning conflated "the CALLER states no page size" with "no page size is stated".
 *
 * The ten is a literal, not a parameter, and deliberately so.
 */
const SELECT_PRICE_GROUP_PAGE_IDS_SQL = 'SELECT priceGroupID FROM SwPriceGroup LIMIT 10';

/**
 * The greatest number of price groups one page read will hydrate.
 *
 * JUDGMENT CALL on the number, stated as one: 1,000.
 *
 * The sibling read `getAccountPriceGroups` needs no ceiling of its own: it is keyed on one account
 * and bounded by that account's own `SwAccountPriceGroup` rows.
 */
const MAX_PRICE_GROUP_PAGE_RECORDS = 1_000;

/**
 * One promotion, for `PromotionFrameworkReads.getPromotion`.
 */
const SELECT_PROMOTION_BY_ID_SQL = [
  'SELECT promotionID, promotionName, promotionSummary, promotionDescription, activeFlag,',
  'defaultImageID, remoteID, createdDateTime, createdByAccountID, modifiedDateTime,',
  'modifiedByAccountID',
  'FROM SwPromotion',
  'WHERE promotionID = ?',
].join(' ');

/**
 * Every title in one slug's family - the bare slug and everything prefixed `slug-` - read in a single
 * statement, one literal per table.
 *
 * Deliberately broader than the candidate sequence the caller will try, so the whole family is read
 * once and the candidates are then narrowed in memory rather than by one statement each.
 */
const SELECT_URL_TITLE_FAMILY_SQL: Readonly<Record<UrlTitleTableName, string>> = Object.freeze({
  SwBrand: 'SELECT urlTitle FROM SwBrand WHERE urlTitle = ? OR urlTitle LIKE ?',
  SwProduct: 'SELECT urlTitle FROM SwProduct WHERE urlTitle = ? OR urlTitle LIKE ?',
  SwProductType: 'SELECT urlTitle FROM SwProductType WHERE urlTitle = ? OR urlTitle LIKE ?',
});

/**
 * Every address zone's locations, keyed by zone, in one parameterless statement.
 *
 * `LEFT JOIN` would answer a link row whose `SwAddress` row is absent as a location with all four
 * fields NULL - and a location that constrains no field matches every address
 * [model/service/AddressService.cfc:L63-L74].
 *
 * No `ORDER BY` either, and that absence is faithful rather than an oversight.
 */
const SELECT_ADDRESS_ZONE_LOCATIONS_SQL = [
  'SELECT zoneLocation.addressZoneID,',
  'location.postalCode, location.city, location.stateCode, location.countryCode',
  'FROM SwAddressZoneLocation zoneLocation',
  'INNER JOIN SwAddress location ON zoneLocation.addressID = location.addressID',
].join(' ');

/**
 * Every column `SwSetting` discriminates a setting row by, in the order the legacy `WHERE` clause
 * tests them.
 */
const SETTING_RELATIONSHIP_COLUMNS: readonly string[] = Object.freeze([
  'accountID',
  'contentID',
  'cmsContentID',
  'brandID',
  'emailID',
  'emailTemplateID',
  'fulfillmentMethodID',
  'paymentMethodID',
  'productID',
  'productTypeID',
  'shippingMethodID',
  'shippingMethodRateID',
  'siteID',
  'skuID',
  'subscriptionTermID',
  'subscriptionUsageID',
  'taskID',
]);

/**
 * The candidate setting rows for the feed's two keys.
 *
 * REPLACES `getAllSettingsQuery` [model/dao/SettingDAO.cfc:L51-L62], whose whole body was
 * `SELECT * FROM SwSetting` - every row of the table.
 *
 * Narrowed to two names, and the narrowing cannot change an answer.
 */
const SELECT_SKU_FEED_SETTINGS_SQL = [
  `SELECT settingName, settingValue, ${SETTING_RELATIONSHIP_COLUMNS.join(', ')}`,
  'FROM SwSetting',
  'WHERE LOWER(settingName) IN (?, ?)',
].join(' ');

/**
 * The configured value of every one of the SEVEN names this composition resolves - the four keys
 * the one published `SettingsProvider` contract answers.
 *
 * One READ for every NAME, matching the legacy's own shape: it read the whole table once
 * [model/dao/SettingDAO.cfc:L51-L62].
 *
 * @param nameCount how many setting names the statement binds; one or more.
 */
function buildSelectGeneralSettingsSql(nameCount: number): string {
  return [
    `SELECT settingName, settingValue, ${SETTING_RELATIONSHIP_COLUMNS.join(', ')}`,
    'FROM SwSetting',
    `WHERE LOWER(settingName) IN (${new Array<string>(nameCount).fill('?').join(', ')})`,
  ].join(' ');
}

/**
 * The materialized ancestry paths of the product types a batch mentions.
 *
 * `productTypeIDPath` is a stored column, not a computation [model/entity/ProductType.cfc:L53],
 * and that is why this is one flat read rather than a recursive CTE.
 *
 * @param identifierCount how many product-type keys the statement binds, one or more.
 */
function buildSelectProductTypePathsSql(identifierCount: number): string {
  return [
    'SELECT productTypeID, productTypeIDPath',
    'FROM SwProductType',
    `WHERE productTypeID IN (${new Array<string>(identifierCount).fill('?').join(', ')})`,
  ].join(' ');
}

/**
 * The `SwRoundingRule` column set [model/entity/RoundingRule.cfc:L52-L62].
 *
 * Four scalars and four audit columns, and deliberately no `remoteID`.
 */
const ROUNDING_RULE_COLUMNS: readonly string[] = Object.freeze([
  'roundingRuleID',
  'roundingRuleName',
  'roundingRuleExpression',
  'roundingRuleDirection',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/**
 * The UPDATE set list: the key moves to the WHERE clause, and the two created-* columns are
 * WRITE-ONCE.
 *
 * `createdDateTime` and `createdByAccountID` are excluded because `HibachiEntity.preUpdate`
 * [org/Hibachi/HibachiEntity.cfc:L651-L679] never restamps them.
 */
const UPDATED_ROUNDING_RULE_COLUMNS: readonly string[] = Object.freeze(
  ROUNDING_RULE_COLUMNS.filter(
    (columnName) =>
      columnName !== 'roundingRuleID' &&
      columnName !== 'createdDateTime' &&
      columnName !== 'createdByAccountID',
  ),
);

const INSERT_ROUNDING_RULE_SQL = [
  `INSERT INTO SwRoundingRule (${ROUNDING_RULE_COLUMNS.join(', ')})`,
  `VALUES (${ROUNDING_RULE_COLUMNS.map(() => '?').join(', ')})`,
].join(' ');

const UPDATE_ROUNDING_RULE_SQL = [
  'UPDATE SwRoundingRule',
  `SET ${UPDATED_ROUNDING_RULE_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(', ')}`,
  'WHERE roundingRuleID = ?',
].join(' ');

/**
 * The `SwBrand` column set [model/entity/Brand.cfc:L52-L57, L74, L77-L80].
 */
const BRAND_COLUMNS: readonly string[] = Object.freeze([
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/**
 * The UPDATE set list, on the same write-once reasoning as the rounding rule's.
 */
const UPDATED_BRAND_COLUMNS: readonly string[] = Object.freeze(
  BRAND_COLUMNS.filter(
    (columnName) =>
      columnName !== 'brandID' &&
      columnName !== 'createdDateTime' &&
      columnName !== 'createdByAccountID',
  ),
);

const INSERT_BRAND_SQL = [
  `INSERT INTO SwBrand (${BRAND_COLUMNS.join(', ')})`,
  `VALUES (${BRAND_COLUMNS.map(() => '?').join(', ')})`,
].join(' ');

const UPDATE_BRAND_SQL = [
  'UPDATE SwBrand',
  `SET ${UPDATED_BRAND_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(', ')}`,
  'WHERE brandID = ?',
].join(' ');

/**
 * The uniqueness probe behind `model/validation/Brand.json`'s `"urlTitle": {"unique":true}` rule.
 *
 * One STATEMENT SERVES both PATHS: on an INSERT the minted identifier cannot match any stored row,
 * and the legacy passed `getPrimaryIDValue()` there too - `""` for an unsaved entity.
 *
 * `LIMIT 1` because existence is the whole question - the legacy tested `arrayLen(results)` and
 * nothing else.
 */
const SELECT_BRAND_BY_URL_TITLE_SQL = [
  'SELECT brandID FROM SwBrand',
  'WHERE urlTitle = ? AND brandID <> ?',
  'LIMIT 1',
].join(' ');

/**
 * Read one brand by its own primary key, projecting exactly the columns the write set names.
 *
 * It projects {@link BRAND_COLUMNS} rather than a hand-written list, and that is the whole reason
 * a caller can hand the result straight back to `BrandService.saveBrand`.
 *
 * No association is materialized, and that follows from the mapping rather than from convenience.
 */
const SELECT_BRAND_BY_BRAND_ID_SQL = [
  `SELECT ${BRAND_COLUMNS.join(', ')} FROM SwBrand`,
  'WHERE brandID = ?',
  'LIMIT 1',
].join(' ');

type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Fold an identifier the way CFML folds one.
 *
 * A driver may answer a column under a different case than the statement asked for, and CFML query
 * columns are case-insensitive, so the lookup is too.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  if (Object.prototype.hasOwnProperty.call(row, columnName)) {
    return { found: true, value: row[columnName] };
  }

  const foldedColumnName = foldIdentifier(columnName);

  for (const presentColumnName of Object.keys(row)) {
    if (foldIdentifier(presentColumnName) === foldedColumnName) {
      return { found: true, value: row[presentColumnName] };
    }
  }

  return { found: false };
}

function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new CompositionColumnError(columnName, 'absent', statementLabel);
  }

  return lookup.value;
}

function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'a Date';
  }

  if (value instanceof Uint8Array) {
    return 'a Uint8Array';
  }

  return `a ${typeof value}`;
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

function readOptionalText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

function readOptionalInteger(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }

    throw new CompositionColumnError(
      columnName,
      'a big integer outside the exactly representable range',
      statementLabel,
    );
  }

  throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
}

function readRequiredInteger(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalInteger(row, columnName, statementLabel);

  if (value === undefined) {
    throw new CompositionColumnError(
      columnName,
      'null where the schema declares it required',
      statementLabel,
    );
  }

  return value;
}

function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (!(value instanceof Date)) {
    throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * A boolean column, left in the persisted form the entity layer expects.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isAbsent(value)) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value[0];

    return firstByte === undefined ? undefined : firstByte;
  }

  throw new CompositionColumnError(columnName, describeColumnType(value), statementLabel);
}

// Section 4 - the non-repository port adapters.
//
// Only two of the thirteen ports are synchronous - `settingsProvider` and `addressZoneEvaluator`.
//
// Reconciliation, recorded rather than papered over: six of the seven non-repository adapters are
// implemented inline below.

// 4.1 settingsProvider - SYNCHRONOUS, four published keys, non-optional `string`

/**
 * The three product-presentation setting names this composition resolves EAGERLY, as data.
 *
 * The name therefore lives at composition scope, where it names a column this file reads, and is
 * not exported: nothing outside this module needs to spell it.
 */
type ProductPresentationSettingName =
  'productImageDefaultExtension' | 'productImageOptionCodeDelimiter' | 'productTitleString';

/**
 * Every setting name this composition resolves: the four of the frozen settings port plus the
 * three product-presentation values it resolves eagerly.
 */
type BootstrapSettingName = SettingKey | ProductPresentationSettingName;

/**
 * The seven names, folded, exactly as they are spelled in `model/service/SettingService.cfc`.
 *
 * The list is the bind list of `buildSelectGeneralSettingsSql`, folded once here because every
 * legacy probe compares `LOWER(allSettings.settingName)` [model/service/SettingService.cfc:L784].
 */
const GENERAL_SETTING_NAMES: readonly BootstrapSettingName[] = Object.freeze([
  'globalURLKeyProduct',
  'globalURLKeyProductType',
  'productImageDefaultExtension',
  'productImageOptionCodeDelimiter',
  'productTitleString',
  'skuCurrency',
  'skuEligibleCurrencies',
]);

/**
 * One step of the legacy cascade's tail: the configured value when a row matched, otherwise the
 * declared default.
 *
 * @param configured the folded name-to-value map from `readGeneralSettingValues`.
 * @param settingName the name being resolved, in its declared spelling.
 * @param declaredDefault the `defaultValue` from the legacy declaration.
 * @returns the effective value; never `undefined`, which is what the ports promise.
 */
function resolveConfiguredSetting(
  configured: ReadonlyMap<string, string>,
  settingName: BootstrapSettingName,
  declaredDefault: string,
): string {
  return configured.get(cfFoldKey(settingName)) ?? declaredDefault;
}

/**
 * Reads the relationship-free `SwSetting` row for each of the seven names, once.
 *
 * See `buildSelectGeneralSettingsSql` for why this statement exists and which legacy probe it is.
 *
 * @param executor the request's prepared-statement executor.
 * @returns configured values keyed by FOLDED setting name.
 */
async function readGeneralSettingValues(
  executor: PreparedStatementExecutor,
): Promise<ReadonlyMap<string, string>> {
  const rows = await executor.execute(
    buildSelectGeneralSettingsSql(GENERAL_SETTING_NAMES.length),
    GENERAL_SETTING_NAMES.map((settingName: BootstrapSettingName): string =>
      settingName.toLowerCase(),
    ),
  );

  const index = indexSettingRows(rows, SELECT_GENERAL_SETTINGS);
  const configured = new Map<string, string>();

  for (const settingName of GENERAL_SETTING_NAMES) {
    // The EMPTY CANDIDATE: no participating relationship column, so only a row with every one of
    // them NULL can match.
    const settingValue = lookupSettingValue(index, settingName, []);

    if (settingValue !== undefined) {
      configured.set(cfFoldKey(settingName), settingValue);
    }
  }

  logger.debug('Resolved general setting values', {
    rowCount: rows.length,
    resultCount: configured.size,
  });

  return configured;
}

/**
 * The single flat settings resolver.
 *
 * The legacy reached settings through four DISTINCT SURFACES - a bare `setting(...)` on self,
 * `getHibachiScope().setting(...)`, the `settingService` collaborator.
 *
 * `setting()` returns `string`, never `string | undefined`, which is why `skuEligibleCurrencies`
 * must be resolved before an instance exists.
 */
class BootstrapSettingsProvider implements SettingsProvider {
  private readonly values: Readonly<Record<BootstrapSettingName, string>>;

  /**
   * @param configured the values this installation has CONFIGURED, read from the relationship-free
   * `SwSetting` rows by `readGeneralSettingValues`.
   * @param skuEligibleCurrencies the runtime-computed DEFAULT for `skuEligibleCurrencies`, already
   * resolved.
   */
  public constructor(configured: ReadonlyMap<string, string>, skuEligibleCurrencies: string) {
    // The seven names in the order their declarations appear in `model/service/SettingService.cfc`,
    // so the table can be checked against the legacy file top to bottom: L178, L179, L191, L192,
    // L193, L221 and L222.
    this.values = Object.freeze({
      globalURLKeyProduct: resolveConfiguredSetting(
        configured,
        'globalURLKeyProduct',
        GLOBAL_URL_KEY_PRODUCT_DEFAULT,
      ),
      globalURLKeyProductType: resolveConfiguredSetting(
        configured,
        'globalURLKeyProductType',
        GLOBAL_URL_KEY_PRODUCT_TYPE_DEFAULT,
      ),
      productImageDefaultExtension: resolveConfiguredSetting(
        configured,
        'productImageDefaultExtension',
        PRODUCT_IMAGE_DEFAULT_EXTENSION_DEFAULT,
      ),
      productImageOptionCodeDelimiter: resolveConfiguredSetting(
        configured,
        'productImageOptionCodeDelimiter',
        PRODUCT_IMAGE_OPTION_CODE_DELIMITER_DEFAULT,
      ),
      productTitleString: resolveConfiguredSetting(
        configured,
        'productTitleString',
        PRODUCT_TITLE_STRING_DEFAULT,
      ),
      skuCurrency: resolveConfiguredSetting(configured, 'skuCurrency', SKU_CURRENCY_DEFAULT),
      skuEligibleCurrencies: resolveConfiguredSetting(
        configured,
        'skuEligibleCurrencies',
        skuEligibleCurrencies,
      ),
    });
  }

  /**
   * The declared value of one setting.
   *
   * @param settingName one of the FOUR keys `SettingsProvider` publishes.
   * @returns the declared value.
   */
  public setting(settingName: SettingKey): string {
    return this.declaredValue(settingName);
  }

  /**
   * The three product-presentation values, resolved, as plain frozen data.
   *
   * Not a second `setting()` overload and not a second contract.
   *
   * READ out of the same TABLE the four published keys are answered from, so one installation
   * cannot resolve `skuCurrency` and `productTitleString` from two different reads of `SwSetting`.
   */
  public presentationValues(): Readonly<Record<ProductPresentationSettingName, string>> {
    return Object.freeze({
      productImageDefaultExtension: this.declaredValue('productImageDefaultExtension'),
      productImageOptionCodeDelimiter: this.declaredValue('productImageOptionCodeDelimiter'),
      productTitleString: this.declaredValue('productTitleString'),
    });
  }

  /**
   * One name's resolved value, looked up the way CFML looks up a struct key.
   */
  private declaredValue(settingName: BootstrapSettingName): string {
    return structGet(this.values, settingName) ?? this.values[settingName];
  }
}

// 4.0 currencyConverter - the european central bank rate-table implementation.
//
// The ALGORITHM is still AN ALGORITHM, and the earlier header's real point survives as a
// constraint on maintenance rather than on location: the pivot currency, the guard's evaluation
// ORDER.

/**
 * The pivot currency of the European Central Bank reference-rate table.
 *
 * CFML parity [model/service/CurrencyService.cfc:L87, L93]: the legacy hardcodes the literal
 * `"EUR"` at both ends of the pivot.
 *
 * The code is compared through `currencyCodeEquals`, never with `===`, because CFML's `eq` is
 * case-insensitive and `"eur"` must satisfy the pivot test.
 */
const EURO_CURRENCY_CODE = 'EUR';

/**
 * The European Central Bank reference-rate table, as this adapter consumes it.
 *
 * Keys are currency codes, matched CASE-INSENSITIVELY to reproduce CFML struct semantics.
 *
 * CFML parity [model/service/CurrencyService.cfc:L118-L119]: the legacy builds this struct by
 * copying the `currency` and `rate` XML attributes of each `Cube` element, so a rate is a string
 * there too.
 */
type EuropeanCentralBankRateTable = Readonly<Record<string, string>>;

/**
 * Notified when a conversion could not be performed and the amount passed through.
 *
 * The observer is a plain callback rather than a logger, so this module keeps its single outward
 * dependency direction and a test can assert the notification without a log sink.
 *
 * @param originalCurrencyCode the currency the amount was denominated in.
 * @param convertToCurrencyCode the currency the caller asked for.
 */
type CurrencyPassThroughObserver = (
  originalCurrencyCode: string,
  convertToCurrencyCode: string,
) => void;

/**
 * The default observer: a pass-through that nobody asked to hear about is silent.
 */
const IGNORE_PASS_THROUGH: CurrencyPassThroughObserver = () => {
  // Intentionally empty. See CurrencyPassThroughObserver - the sink is optional so that no caller
  // is forced to supply one, and a no-op is the honest default rather than a hidden console write.
};

/**
 * The two `SwCurrency` columns the two listing methods read, and nothing else.
 *
 * CFML parity [model/entity/Currency.cfc:L52-L53]: `currencyCode` is the entity identifier and
 * `activeFlag` is a nullable boolean.
 *
 * `activeFlag` is `CfBooleanInput` rather than `boolean` so that a column hydrating as SQL NULL is
 * representable; `cfBoolean` resolves absent to false.
 */
interface CurrencyRecordProjection {
  /**
   * The `SwCurrency` primary key [model/entity/Currency.cfc:L52].
   */
  readonly currencyCode: CurrencyCode;

  /**
   * The nullable active flag [model/entity/Currency.cfc:L53].
   */
  readonly activeFlag: CfBooleanInput;
}

/**
 * A `SwCurrency` row with its active flag already resolved to a boolean.
 *
 * The resolution happens once, in the constructor, for two reasons.
 *
 * That failure is a schema surprise rather than a data variation: the legacy filter is emitted as
 * `activeFlag = 1` against a boolean column, so no value reaching it could be unrecognised.
 */
type ResolvedCurrencyRecord = {
  readonly currencyCode: CurrencyCode;
  readonly active: boolean;
};

/**
 * One resolved half of the euro pivot.
 */
type EuroPivotScaling =
  { readonly kind: 'euro' } | { readonly kind: 'rate'; readonly rate: string };

/**
 * The `CurrencyConverter` port, implemented over a European Central Bank reference-rate table and
 * a `SwCurrency` projection supplied at construction.
 *
 * Replaces the `getService("currencyService")` locator calls embedded in the SKU entity at
 * [model/entity/Sku.cfc:L371, L418, L422, L425] - transformation rule T2.
 */
// It refused a cross-currency conversion whenever the injected rate table was EMPTY, on the
// argument that `model/service/CurrencyService.cfc` has two distinct failure states: table present
// with an unlisted code.

// What genuinely changed on the behavioural side is recorded at `convertCurrency` below: an
// unavailable rate table takes the [model/service/CurrencyService.cfc:L100-L101] PASS-THROUGH and
// REPORTS it.
export class EuropeanCentralBankCurrencyConverter implements CurrencyConverter {
  /**
   * The `SwCurrency` projection both listing methods read, active flags resolved.
   *
   * Built fresh in the constructor, so a later mutation of the caller's array cannot reach in
   * here, and never handed back - every listing returns a fresh array built from it.
   */
  private readonly currencies: readonly ResolvedCurrencyRecord[];

  /**
   * The per-euro reference rates `convertCurrency` consults.
   *
   * Snapshotted one level deep, which is the whole depth: the values are strings, so a shallow
   * copy is a complete copy.
   */
  private readonly rates: EuropeanCentralBankRateTable;

  /**
   * Notified whenever a conversion takes the [model/service/CurrencyService.cfc:L100-L101]
   * pass-through.
   *
   * Defaults to a no-op, so no caller is forced to supply one and no test has to thread a sink it
   * does not care about.
   */
  private readonly onUnconvertedPassThrough: CurrencyPassThroughObserver;

  /**
   * The rate table is deliberately not validated here - `src/lib/config.ts` already refused every
   * malformed entry before it reached this far.
   *
   * @param currencies the `SwCurrency` rows this converter should see, in the order the second
   * listing method should answer in.
   * @param rates the European Central Bank per-euro rate table, keyed by currency code with
   * plain-decimal-string values.
   * @param onUnconvertedPassThrough notified on each pass-through conversion; defaults to a no-op.
   * @throws {CfmlBooleanConversionError} when a supplied `activeFlag` is present but carries no
   * boolean meaning.
   */
  constructor(
    currencies: readonly CurrencyRecordProjection[],
    rates: EuropeanCentralBankRateTable,
    onUnconvertedPassThrough: CurrencyPassThroughObserver = IGNORE_PASS_THROUGH,
  ) {
    // `map` produces the defensive copy as a side effect of resolving the flags, so there is no
    // second spread to keep in step with it.
    this.currencies = currencies.map(
      (record: CurrencyRecordProjection): ResolvedCurrencyRecord => ({
        currencyCode: record.currencyCode,
        active: cfBoolean(record.activeFlag),
      }),
    );

    this.rates = { ...rates };
    this.onUnconvertedPassThrough = onUnconvertedPassThrough;
  }

  /**
   * List the currency codes flagged active.
   *
   * CFML parity [model/service/CurrencyService.cfc:L57-L67]: the legacy filters `activeFlag` to 1,
   * selects `currencyCode`, and appends each record to a comma-delimited string.
   *
   * The active flag was resolved at construction, so this method cannot raise.
   *
   * @returns every active currency code, as a fresh array.
   */
  getAllActiveCurrencyIDList(): Promise<CurrencyCode[]> {
    const active = this.currencies
      .filter((record: ResolvedCurrencyRecord): boolean => record.active)
      .map((record: ResolvedCurrencyRecord): CurrencyCode => record.currencyCode);

    return Promise.resolve(active);
  }

  /**
   * Resolve the currencies named by a comma-delimited currency-code list.
   *
   * CFML parity [model/entity/Sku.cfc:L371-L375]: the cascade takes a Currency smart list and
   * narrows it with `addInFilter('currencyCode',...)` on the eligible-currency setting.
   *
   * @param currencyCodeList a comma-delimited list of currency codes, in the form the
   * `skuEligibleCurrencies` setting stores.
   * @returns the currencies whose code appears in the list, as a fresh array.
   */
  getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]> {
    const eligible = this.currencies
      .filter(
        (record: ResolvedCurrencyRecord): boolean =>
          listFindNoCase(currencyCodeList, record.currencyCode) > 0,
      )
      .map((record: ResolvedCurrencyRecord): CurrencyCode => record.currencyCode);

    return Promise.resolve(eligible);
  }

  // TODO [model/service/CurrencyService.cfc:L81]: add integration support so a configured
  // currency-conversion integration can supply the rate.
  /**
   * CFML parity [model/service/CurrencyService.cfc:L85-L101], branch for branch: the guard at
   * [model/service/CurrencyService.cfc:L86] resolves both halves before any arithmetic;
   * [model/service/CurrencyService.cfc:L87-L91] expresses the amount in euro, dividing by the
   * source rate unless the source is the euro; [model/service/CurrencyService.cfc:L93-L97] scales
   * into the target.
   *
   * @param amount the amount expressed in `originalCurrencyCode`.
   * @param originalCurrencyCode the currency `amount` is denominated in.
   * @param convertToCurrencyCode the currency to express the result in.
   * @returns the converted amount rounded to cents, or `amount` unchanged when either currency has
   * no reachable rate.
   * @throws rejects when a CONSULTED rate is not a plain decimal numeral, or when the SOURCE rate
   * is zero - both of which the legacy engine also raised on.
   */
  convertCurrency(
    amount: Money,
    originalCurrencyCode: CurrencyCode,
    convertToCurrencyCode: CurrencyCode,
  ): Promise<Money> {
    // Why a promise executor rather than `Promise.resolve(...)`.
    return new Promise<Money>((resolve) => {
      // [model/service/CurrencyService.cfc:L86] Both halves first. No arithmetic has happened yet,
      // and none may.
      const source: EuroPivotScaling | undefined = this.resolveScaling(originalCurrencyCode);
      const target: EuroPivotScaling | undefined = this.resolveScaling(convertToCurrencyCode);

      if (source === undefined || target === undefined) {
        // The euro pivot is unaffected either way: a EUR-to-EUR conversion resolves both sides as
        // `{ kind: 'euro' }` and never reaches this branch.

        // [model/service/CurrencyService.cfc:L100-L101] The pass-through.
        this.onUnconvertedPassThrough(originalCurrencyCode, convertToCurrencyCode);

        resolve(amount);
      } else {
        // [model/service/CurrencyService.cfc:L87-L91] `amountInEUR`. The euro branch divides by
        // nothing at all, which is [model/service/CurrencyService.cfc:L88]; every other source
        // divides by its own rate, [model/service/CurrencyService.cfc:L90].
        const amountInEuro: Money = source.kind === 'euro' ? amount : amount.dividedBy(source.rate);

        // [model/service/CurrencyService.cfc:L93-L97] Into the target. The euro branch multiplies
        // by nothing, which is [model/service/CurrencyService.cfc:L94]; every other target
        // multiplies by its own rate, [model/service/CurrencyService.cfc:L96].
        const scaled: Money =
          target.kind === 'euro' ? amountInEuro : amountInEuro.times(target.rate);

        // [model/service/CurrencyService.cfc:L94]/[model/service/CurrencyService.cfc:L96]
        // `round(... * 100) / 100`. Two decimals, half away from zero.
        resolve(Money.fromDecimalString(scaled.toFixed2()));
      }
    });
  }

  /**
   * Resolve one side of the pivot, or report that it cannot be resolved.
   *
   * CFML parity [model/service/CurrencyService.cfc:L86]: one half of the guard, which is
   * `structKeyExists(cbRates, code) || code eq "EUR"`.
   *
   * @param currencyCode the code to resolve.
   * @returns how to scale through the euro for this code, or `undefined` when the code is neither
   * the pivot nor present in the rate table.
   */
  private resolveScaling(currencyCode: CurrencyCode): EuroPivotScaling | undefined {
    if (currencyCodeEquals(currencyCode, EURO_CURRENCY_CODE)) {
      return { kind: 'euro' };
    }

    // Case-insensitive, because CFML struct keys are. `getByCurrencyCode` is the domain's
    // published accessor for exactly this lookup shape.
    const rate: string | undefined = getByCurrencyCode(this.rates, currencyCode);

    return rate === undefined ? undefined : { kind: 'rate', rate };
  }
}

// 4.2 addressZoneEvaluator - a live port, not a stub.

/**
 * Is one address inside one address zone?
 *
 * SYNCHRONOUS, because the legacy body reaches neither the DAO nor the ORM: it walks an
 * already-loaded collection and compares strings.
 *
 * The zone-to-locations state arrives as a SOURCE rather than as an already-materialised array,
 * because no caller is in a position to materialise one: the index is built per request.
 */
class CfmlAddressZoneEvaluator implements AddressZoneEvaluator {
  /**
   * @param addressZoneLocations THIS REQUEST'S zone-to-locations state, as a SOURCE rather than as
   * the index itself.
   */
  public constructor(private readonly addressZoneLocations: AddressZoneLocationSource) {}

  public isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean {
    // [model/service/AddressService.cfc:L58] `var addressInZone = false;`
    let addressInZone = false;

    // [model/service/AddressService.cfc:L60]
    // `for(var i=1; i<=arrayLen(arguments.addressZone.getAddressZoneLocations()); i++)`
    for (const location of this.resolveAddressZoneLocations(addressZone)) {
      // [model/service/AddressService.cfc:L62] `var inLocation = true;` - reset for every
      // location.
      let inLocation = true;

      // [model/service/AddressService.cfc:L63-L74] four tests, each of the form
      // `if(!isNull(location.getX()) && location.getX() != address.getX())`. The guard is on the
      // LOCATION value: a location that does not constrain a field imposes nothing.
      if (locationValueExcludes(location, 'postalCode', address.postalCode)) {
        inLocation = false;
      }

      if (locationValueExcludes(location, 'city', address.city)) {
        inLocation = false;
      }

      if (locationValueExcludes(location, 'stateCode', address.stateCode)) {
        inLocation = false;
      }

      if (locationValueExcludes(location, 'countryCode', address.countryCode)) {
        inLocation = false;
      }

      // [model/service/AddressService.cfc:L75-L78] the first fully-matching location wins and
      // stops the search.
      if (inLocation) {
        addressInZone = true;
        break;
      }
    }

    // [model/service/AddressService.cfc:L81] `return addressInZone;`
    return addressInZone;
  }

  /**
   * Which locations this zone is tested on - the one decision the port delegates here.
   *
   * A NON-EMPTY supplied list is authoritative and nothing is resolved: a caller that has already
   * materialized the association knows its own zone better than any index does.
   *
   * An EMPTY supplied list means not SUPPLIED, so this request's index is consulted.
   */
  private resolveAddressZoneLocations(
    addressZone: AddressZoneProjection,
  ): readonly AddressZoneLocationProjection[] {
    if (addressZone.addressZoneLocations.length !== 0) {
      return addressZone.addressZoneLocations;
    }

    const index = this.addressZoneLocations.loaded();

    if (index === undefined) {
      throw new AddressZoneEvaluationNotPreparedError();
    }

    return index.get(foldIdentifier(addressZone.addressZoneID)) ?? NO_LOCATIONS;
  }
}

/**
 * One request's zone-to-locations state: folded `addressZoneID` to that zone's locations.
 *
 * A `ReadonlyMap`, so the index cannot be added to, cleared or re-keyed after the request that
 * built it - and a `readonly` array per entry, so a zone's locations cannot be appended to either.
 *
 * Module-local, like every other internal shape of this file's wiring.
 */
type AddressZoneLocationIndex = ReadonlyMap<string, readonly AddressZoneLocationProjection[]>;

/**
 * The answer for a zone the index does not carry. Shared because it is frozen and empty.
 */
const NO_LOCATIONS: readonly AddressZoneLocationProjection[] = Object.freeze([]);

/**
 * An index carrying no zone at all.
 *
 * Used by tier one's validation probe, which builds a request graph without issuing a statement.
 */
const NO_ADDRESS_ZONE_LOCATIONS: AddressZoneLocationIndex = new Map();

/**
 * One request's access to its zone-to-locations index, loaded on demand.
 *
 * The unbounded zone-location statement is not issued while a scope is assembled.
 */
interface AddressZoneLocationSource {
  load(): Promise<AddressZoneLocationIndex>;
  loaded(): AddressZoneLocationIndex | undefined;
}

/**
 * Build a per-request source that executes the zone read on first demand.
 */
function createDeferredAddressZoneLocationSource(
  executor: PreparedStatementExecutor,
): AddressZoneLocationSource {
  let inFlight: Promise<AddressZoneLocationIndex> | undefined;
  let settled: AddressZoneLocationIndex | undefined;

  return {
    load: async (): Promise<AddressZoneLocationIndex> => {
      if (settled !== undefined) {
        return settled;
      }

      inFlight ??= readAddressZoneLocationIndex(executor).then(
        (index: AddressZoneLocationIndex): AddressZoneLocationIndex => {
          settled = index;
          return index;
        },
        (reason: unknown): never => {
          inFlight = undefined;
          throw reason;
        },
      );

      return await inFlight;
    },
    loaded: (): AddressZoneLocationIndex | undefined => settled,
  };
}

/**
 * Build a source that is already loaded and never issues a statement.
 */
function createPreparedAddressZoneLocationSource(
  index: AddressZoneLocationIndex,
): AddressZoneLocationSource {
  return {
    load: (): Promise<AddressZoneLocationIndex> => Promise.resolve(index),
    loaded: (): AddressZoneLocationIndex => index,
  };
}

/**
 * Read every zone's locations, once, for this request.
 *
 * One STATEMENT for every ZONE, deliberately, and this is the shape that keeps the port
 * synchronous.
 *
 * ROWS are GROUPED in ARRIVAL ORDER, which is the faithful treatment: the legacy walks the
 * Hibernate collection in association order and stops at the first match
 * [model/service/AddressService.cfc:L60-L61, L75-L78].
 */
async function readAddressZoneLocationIndex(
  executor: PreparedStatementExecutor,
): Promise<AddressZoneLocationIndex> {
  const rows = requireStatementRows(
    await executor.execute(SELECT_ADDRESS_ZONE_LOCATIONS_SQL),
    SELECT_ADDRESS_ZONE_LOCATIONS,
  );
  const locationsByFoldedZoneID = new Map<string, AddressZoneLocationProjection[]>();

  for (const row of rows) {
    const foldedZoneID = foldIdentifier(
      readIdentifier(row, 'addressZoneID', SELECT_ADDRESS_ZONE_LOCATIONS),
    );

    const location: AddressZoneLocationProjection = {
      postalCode: readOptionalText(row, 'postalCode', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
      city: readOptionalText(row, 'city', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
      stateCode: readOptionalText(row, 'stateCode', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
      countryCode: readOptionalText(row, 'countryCode', SELECT_ADDRESS_ZONE_LOCATIONS) ?? null,
    };

    const existing = locationsByFoldedZoneID.get(foldedZoneID);

    if (existing === undefined) {
      locationsByFoldedZoneID.set(foldedZoneID, [location]);
    } else {
      existing.push(location);
    }
  }

  // Frozen per zone on the way out, into a SECOND map, so the returned index's immutability is not
  // merely a type-level claim over arrays that the grouping pass still holds a mutable handle to.
  const index = new Map<string, readonly AddressZoneLocationProjection[]>();

  for (const [foldedZoneID, locations] of locationsByFoldedZoneID) {
    index.set(foldedZoneID, Object.freeze(locations));
  }

  return index;
}

/**
 * One field of the four-field location test.
 *
 * The legacy tests `!isNull(location.getX())`, so an ABSENT location value constrains nothing and
 * the field cannot exclude the address.
 *
 * An absent ADDRESS value is normalised to the empty string rather than refused, because that is
 * what CFML does: a null operand in a `!=` comparison behaves as an empty string.
 */
function locationValueExcludes(
  location: AddressZoneLocationProjection,
  field: 'postalCode' | 'city' | 'stateCode' | 'countryCode',
  addressValue: string | null | undefined,
): boolean {
  const locationValue = location[field];

  if (locationValue === null || locationValue === undefined) {
    return false;
  }

  return !cfEquals(locationValue, addressValue ?? '');
}

// 4.3 currencyConverter - wired, not re-implemented.
//
// Duplicating it was never the question and is still refused.
//
// What this ROOT does own is the one currency question that file deliberately does not answer -
// WHERE the records and the rates come from.

// 4.4 urlTitleGenerator - ASYNC, executor-backed.

/**
 * Why a host trait table exists instead of the host itself.
 *
 * So a refusal describes the candidate rather than reproducing it.
 *
 * Each entry names a class of character rather than a position or a value, which is what makes the
 * summary non-reversible - it cannot be read back into the candidate.
 */
const REJECTED_FEED_HOST_TRAITS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  Object.freeze(['a scheme separator', /:\/\//] as const),
  Object.freeze(['credentials', /@/] as const),
  Object.freeze(['a path separator', /\//] as const),
  Object.freeze(['a query separator', /\?/] as const),
  Object.freeze(['a fragment separator', /#/] as const),
  Object.freeze(['whitespace', /\s/] as const),
  Object.freeze(['a character outside printable ASCII', /[^\u0020-\u007e]/] as const),
]);

/**
 * Describe a refused feed-host candidate without reproducing it.
 *
 * The summary is a character count plus the trait names that matched, both of which are derived
 * facts rather than input bytes: no substring, no prefix and no normalised form is included.
 *
 * The two degenerate candidates get their own wording, adopted from the comment review that
 * introduced this function on the withdrawn mint.
 */
function summarizeRejectedFeedHost(candidate: string): string {
  if (candidate.length === 0) {
    return 'an empty string';
  }

  const measurement = `${String(candidate.length)} character${candidate.length === 1 ? '' : 's'} long`;

  if (candidate.trim().length === 0) {
    return `${measurement}, of whitespace only`;
  }

  const traits: string[] = REJECTED_FEED_HOST_TRAITS.filter(([, pattern]) =>
    pattern.test(candidate),
  ).map(([trait]) => trait);

  return traits.length === 0
    ? `${measurement}, carrying no disallowed character class`
    : `${measurement} and contains ${traits.join(', ')}`;
}

/**
 * A feed host that this deployment does not serve.
 *
 * `message` carries the reason and a redacted summary; `candidateSummary` and `reason` expose the
 * two halves separately, so a caller can log the diagnosis, or branch on the ground of the
 * refusal.
 */
export class UntrustedFeedHostError extends Error {
  public readonly candidateSummary: string;

  public readonly reason: string;

  public constructor(candidate: string, reason: string) {
    const candidateSummary = summarizeRejectedFeedHost(candidate);

    super(
      `A candidate feed host was refused: ${reason}. The value itself is not reproduced; it was ${candidateSummary}.`,
    );
    this.name = 'UntrustedFeedHostError';
    this.candidateSummary = candidateSummary;
    this.reason = reason;
  }
}

/**
 * @param candidate the host observed on the request; never trusted for provenance.
 * @param allowedHosts the frozen, deployment-owned list resolved once at module scope.
 * @returns the normalized host, which is what the feed criteria carries.
 * @throws UntrustedFeedHostError when the candidate is empty, or when it is not a member of the
 * authorized list - including the case where that list authorizes nothing at all.
 */
function assertAllowedFeedHost(candidate: string, allowedHosts: readonly string[]): string {
  const normalized = candidate.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new UntrustedFeedHostError(candidate, 'it is empty or contains only whitespace');
  }

  // No `allowedHosts === undefined` ESCAPE. An unconfigured deployment reaches this test with an
  // empty list and fails it, which is what makes the feed fail closed by default.
  const permitted = allowedHosts.some((allowed) => allowed.trim().toLowerCase() === normalized);

  if (!permitted) {
    throw new UntrustedFeedHostError(
      candidate,
      allowedHosts.length === 0
        ? 'this deployment authorizes no feed host at all; set FEED_ALLOWED_HOSTS to the ' +
            'authority this feed is published on before requesting it'
        : 'it is not on this deployment\u2019s authorized-host list',
    );
  }

  return normalized;
}

/**
 * Unique URL-title generation, replacing the `dataService` collaborator.
 *
 * LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the product save path guards the urlTitle
 * with a null-only test, so a product already holding an EMPTY urlTitle keeps it and never reaches
 * this generator - unlike the brand and product-type paths.
 * Preserved deliberately; do not fix without a product decision.
 */
class SqlUrlTitleGenerator implements UrlTitleGenerator {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async createUniqueURLTitle(
    titleString: string,
    tableName: UrlTitleTableName,
  ): Promise<string> {
    // [model/service/DataService.cfc:L57]
    // `reReplace(lcase(trim(titleString)), "[^a-z0-9 \-]", "", "all")`.
    const sanitized = titleString
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '');

    // [model/service/DataService.cfc:L58] `reReplace(urlTitle, "[ ]+", "-", "all")` - runs of
    // spaces collapse to a single hyphen.
    const urlTitle = sanitized.replace(/ +/g, '-');

    // The one statement, and the only structural change from the legacy body.
    const takenTitles = await this.readUrlTitleFamily(tableName, urlTitle);

    // [model/service/DataService.cfc:L55] `var addon = 1;` - one, not two, so that the first
    // suffix [model/service/DataService.cfc:L65-L66] produces is `-2`.
    let addon = 1;

    // [model/service/DataService.cfc:L60] `var returnTitle = urlTitle;` - the unsuffixed
    // candidate is tried first, which is why the FIRST SUFFIX is `-2` and never `-1`.
    let returnTitle = urlTitle;

    // [model/service/DataService.cfc:L64-L68]
    // `while(!unique) { addon++; returnTitle = "#urlTitle#-#addon#"; unique =... }`
    //
    // Why this terminates, without a ceiling and without an unreachable branch.
    //
    // And gap reuse is preserved because the walk is ascending.
    while (takenTitles.has(returnTitle)) {
      addon += 1;
      returnTitle = `${urlTitle}-${String(addon)}`;
    }

    // [model/service/DataService.cfc:L70] `return returnTitle;`
    return returnTitle;
  }

  /**
   * Every stored title in this slug's family, folded for the comparison the column's collation
   * performs.
   *
   * The fold is the collation's behaviour, not leniency added here.
   *
   * A ROW WHOSE `urlTitle` is NULL CONTRIBUTES nothing, which is why the read is optional rather
   * than required: the column is nullable on all three tables, `WHERE urlTitle = ?` never matches
   * NULL in SQL.
   */
  private async readUrlTitleFamily(
    tableName: UrlTitleTableName,
    urlTitle: string,
  ): Promise<ReadonlySet<string>> {
    // Read through an explicit `string | undefined`: the closed `UrlTitleTableName` union erases
    // at emit, so it cannot make this lookup total.
    const familyStatement: string | undefined = SELECT_URL_TITLE_FAMILY_SQL[tableName];

    if (familyStatement === undefined) {
      throw new CompositionContractError(
        'createUniqueURLTitle was given a table that is not one of the three the url-title union ' +
          'declares (SwBrand, SwProduct, SwProductType), so no statement exists for it and no ' +
          'title may be reported as available',
        SELECT_URL_TITLE_FAMILY,
      );
    }

    // The bare slug, then the family prefix. The pattern needs no escaping - see
    // `SELECT_URL_TITLE_FAMILY_SQL` for why the sanitization above makes a metacharacter
    // impossible.
    const rows = requireStatementRows(
      await this.executor.execute(familyStatement, [urlTitle, `${urlTitle}-%`]),
      SELECT_URL_TITLE_FAMILY,
    );

    const takenTitles = new Set<string>();

    for (const row of rows) {
      const storedTitle = readOptionalText(row, 'urlTitle', SELECT_URL_TITLE_FAMILY);

      if (storedTitle !== undefined) {
        takenTitles.add(storedTitle.toLowerCase());
      }
    }

    // Only the row count is published.
    logger.debug(`Read the urlTitle family (${SELECT_URL_TITLE_FAMILY})`, {
      rowCount: takenTitles.size,
    });

    return takenTitles;
  }
}

// 4.5 imageStore - one of exactly two stub ports.

/**
 * The two image settings this composition resolves, and nothing else.
 */
type ImageFileNameSettingValues = Pick<
  SkuImageSettingValues,
  'productImageDefaultExtension' | 'productImageOptionCodeDelimiter'
>;

/**
 * The image store wired by this composition.
 *
 * No image business logic is ADDED here, and none may be: no resizing, no format conversion, no
 * thumbnailing, no provider selection, no upload validation.
 */
class RefusingImageStore implements ImageStore {
  public constructor(private readonly settingValues: ImageFileNameSettingValues) {}

  public saveImageFile(
    uploadResult: ImageUploadResultProjection,
    filePath: string,
    allowedExtensions: string,
  ): Promise<boolean> {
    // The three parameter names are the legacy's, verbatim and in order
    // [model/service/SkuService.cfc:L212], and `allowedExtensions` has no default:
    // `"jpg,jpeg,png,gif"` is a literal at the CALL SITE.
    return Promise.reject(
      new ImageStoreNotConfiguredError(
        'saveImageFile',
        `filePath='${filePath}', allowedExtensions='${allowedExtensions}', ` +
          `clientFileExt='${uploadResult.clientFileExt}'`,
      ),
    );
  }

  public deleteImageFile(filePath: string): Promise<void> {
    // The port is explicit that a refusal here must be a throw: this method returns nothing at
    // all, so it has no channel through which to report one.
    return Promise.reject(
      new ImageStoreNotConfiguredError('deleteImageFile', `filePath='${filePath}'`),
    );
  }

  /**
   * Compose one SKU's default-image file name, per the port's five-point specification.
   */
  public generateSkuImageFileName(descriptor: SkuImageFileNameDescriptor): string {
    let fileName = sanitizeImageNameSegment(descriptor.productCode);

    for (const optionCode of descriptor.imageGroupOptionCodes) {
      fileName += this.settingValues.productImageOptionCodeDelimiter;
      fileName += sanitizeImageNameSegment(optionCode);
    }

    return `${fileName}.${this.settingValues.productImageDefaultExtension}`;
  }
}

/**
 * Point 1 of the file-name specification, applied to one segment.
 */
function sanitizeImageNameSegment(segment: string | undefined): string {
  return (segment ?? '').replace(/[^a-z0-9\-_]/gi, '');
}

// 4.6 subscriptionTermProvider - the other stub port.

/**
 * The subscription term provider wired by this composition.
 *
 * LEGACY-DEFECT [model/service/SkuService.cfc:L163-L165]: the `renewalSubscriptionBenefits` loop
 * dereferences the loaded benefit with no null guard, unlike the guarded sites at
 * [model/service/SkuService.cfc:L142] and [model/service/SkuService.cfc:L147].
 * Preserved deliberately; do not fix without a product decision.
 *
 * No subscription business logic is added here, and none may be.
 */
class RefusingSubscriptionTermProvider implements SubscriptionTermProvider {
  public getSubscriptionTerm(
    subscriptionTermID: string,
  ): Promise<SubscriptionTermHandle | undefined> {
    // Refuse, never answer `undefined`. The port documents `undefined` as "no row matched", which
    // is a factual claim about data that a provider reaching no data cannot make.
    return Promise.reject(
      new SubscriptionTermsNotConfiguredError(
        'getSubscriptionTerm',
        `subscriptionTermID='${subscriptionTermID}'`,
      ),
    );
  }

  public getSubscriptionBenefit(
    subscriptionBenefitID: string,
  ): Promise<SubscriptionBenefitHandle | undefined> {
    // LEGACY-DEFECT [model/service/SkuService.cfc:L163-L165]: the `renewalSubscriptionBenefits`
    // loop reaches this lookup with no preceding existence guard, unlike the guarded reads at
    // [model/service/SkuService.cfc:L142] and [model/service/SkuService.cfc:L147], so the
    // legacy raised there on a null.
    // Preserved deliberately; do not fix without a product decision.
    return Promise.reject(
      new SubscriptionTermsNotConfiguredError(
        'getSubscriptionBenefit',
        `subscriptionBenefitID='${subscriptionBenefitID}'`,
      ),
    );
  }
}

// 4.7 The per-SKU feed setting resolver.

/**
 * One probe's participating relationship columns, as `[column, value]` pairs.
 *
 * This is the TypeScript spelling of `settingDetails.settingRelationships`
 * [model/service/SettingService.cfc:L519], and its emptiness is meaningful rather than degenerate:
 * the empty candidate is step 5 of the cascade.
 */
type SettingRelationshipCandidate = readonly (readonly [string, string])[];

/**
 * Setting rows indexed for O(1) probing: setting name, then relationship key, to setting value.
 *
 * The inner key is built by {@link buildSettingRelationshipKey}, which is what lets a six-step
 * cascade over hundreds of SKUs cost no I/O and no scanning.
 */
type SettingRowIndex = ReadonlyMap<string, ReadonlyMap<string, string>>;

/**
 * The canonical key of a relationship set: which columns are non-NULL, and to what.
 *
 * This one function is the whole of the legacy `WHERE` clause, which is why it is worth being
 * explicit about the correspondence.
 *
 * Separated by control characters so no identifier can forge a key boundary.
 */
function buildSettingRelationshipKey(candidate: SettingRelationshipCandidate): string {
  return [...candidate]
    .map(([columnName, value]): string => `${columnName}\u0001${value.toLowerCase()}`)
    .sort()
    .join('\u0002');
}

/**
 * Folds the rows of `SELECT_SKU_FEED_SETTINGS_SQL` into a probe-able index.
 *
 * A row whose `settingValue` is null still wins, and answers the empty string.
 *
 * False for `''` in SQL, and so is `LOWER(col) = '<some-id>'`, which means such a row was
 * unreachable from every probe the legacy issued.
 */
function indexSettingRows(
  rows: readonly SqlRow[],
  statementLabel: string = SELECT_SKU_FEED_SETTINGS,
): SettingRowIndex {
  const index = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const settingName = readIdentifier(row, 'settingName', statementLabel);
    const settingValue = readOptionalText(row, 'settingValue', statementLabel) ?? '';

    const participating: [string, string][] = [];

    for (const columnName of SETTING_RELATIONSHIP_COLUMNS) {
      const value = readOptionalText(row, columnName, statementLabel);

      if (value !== undefined) {
        participating.push([columnName, value]);
      }
    }

    const foldedName = settingName.toLowerCase();
    const byRelationship = index.get(foldedName) ?? new Map<string, string>();
    const relationshipKey = buildSettingRelationshipKey(participating);

    if (!byRelationship.has(relationshipKey)) {
      byRelationship.set(relationshipKey, settingValue);
    }

    index.set(foldedName, byRelationship);
  }

  return index;
}

/**
 * One probe against the index: the row's value, or `undefined` when no row matched.
 */
function lookupSettingValue(
  settingRows: SettingRowIndex,
  settingName: string,
  candidate: SettingRelationshipCandidate,
): string | undefined {
  return settingRows.get(settingName.toLowerCase())?.get(buildSettingRelationshipKey(candidate));
}

/**
 * The five probes of the `sku` lookup order, in the exact sequence the legacy issues them.
 *
 * The sixth step - the declared default - is not a probe and is not listed; it is the caller's
 * `return` once this sequence is exhausted.
 *
 * An absent identifier skips its probes rather than probing for an empty one, and the two are
 * equivalent.
 */
function buildSkuSettingCandidates(
  subject: SkuFeedSettingSubject,
  productTypePaths: ReadonlyMap<string, readonly string[]>,
): readonly SettingRelationshipCandidate[] {
  const candidates: SettingRelationshipCandidate[] = [
    // Step 1. The object's own identifier [model/service/SettingService.cfc:L519-L523].
    [['skuID', subject.skuID]],
    // Step 2. Lookup entry 1, `product.productID` [model/service/SettingService.cfc:L104].
    [['productID', subject.productID]],
  ];

  // Leaf first, then outwards to the root.
  const storedPath =
    subject.productTypeID === undefined ? [] : (productTypePaths.get(subject.productTypeID) ?? []);
  const walkOrder = [...storedPath].reverse();

  // Step 3. Lookup entry 2, `productTypeIDPath & brand.brandID`, once per segment.
  if (subject.brandID !== undefined) {
    for (const productTypeID of walkOrder) {
      candidates.push([
        ['productTypeID', productTypeID],
        ['brandID', subject.brandID],
      ]);
    }
  }

  // Step 4. Lookup entry 3, `productTypeIDPath` alone, once per segment.
  for (const productTypeID of walkOrder) {
    candidates.push([['productTypeID', productTypeID]]);
  }

  // Step 5. No relationships at all [model/service/SettingService.cfc:L594-L608] - the row an
  // administrator sets as the installation-wide value, which requires all seventeen columns NULL.
  candidates.push([]);

  return candidates;
}

// `DeclaredDefaultSkuFeedSettingResolver` was here, and it was the answer to the wrong question.
//
// "declared defaults are what this composition can honestly answer with... A per-SKU override
// lives in `SwSetting` rows whose resolution order [model/service/SettingService.cfc:L104] walks
// the product.

/**
 * Per-SKU shipping-weight settings for the product feed, resolved through the legacy precedence.
 *
 * `{ skuID }` the object's own identifier [model/service/SettingService.cfc:L519-L523]
 *
 * `nextPathListIndex = listLen(pathList)` then `listGetAt(pathList, nextPathListIndex)` followed
 * by `nextPathListIndex--` [model/service/SettingService.cfc:L552-L557] walks down.
 */
class SqlSkuFeedSettingResolver implements SkuFeedSettingResolver {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async resolveSkuShippingWeightSettings(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, ResolvedSkuShippingWeightSetting>> {
    const resolved = new Map<string, ResolvedSkuShippingWeightSetting>();

    // No subjects means no feed rows, and `IN ()` is a MySQL syntax error besides. The repository
    // already returns early on an empty selection; this guard makes the resolver safe on its own
    // terms.
    if (subjects.length === 0) {
      return resolved;
    }

    const settingRows = await this.readSettingRows();
    const productTypePaths = await this.readProductTypePaths(subjects);

    for (const subject of subjects) {
      resolved.set(subject.skuID, {
        skuShippingWeight: this.resolveOne(
          SKU_SHIPPING_WEIGHT_SETTING_NAME,
          SKU_SHIPPING_WEIGHT_DEFAULT,
          subject,
          settingRows,
          productTypePaths,
        ),
        skuShippingWeightUnitCode: this.resolveOne(
          SKU_SHIPPING_WEIGHT_UNIT_CODE_SETTING_NAME,
          SKU_SHIPPING_WEIGHT_UNIT_CODE_DEFAULT,
          subject,
          settingRows,
          productTypePaths,
        ),
      });
    }

    // Legible keys only; see the note at `SqlUrlTitleGenerator`. `rowCount` is what was asked
    // about and `resultCount` what was answered, and they must agree - the cascade's last step is
    // unconditional.
    logger.debug('Resolved per-SKU shipping-weight settings', {
      rowCount: subjects.length,
      resultCount: resolved.size,
    });

    return resolved;
  }

  /**
   * Runs the six-step cascade for one setting and one subject, in memory.
   *
   * Every step is a lookup into the index built by `readSettingRows`, so the cascade costs no I/O
   * and the ordering below is the whole of the behaviour.
   */
  private resolveOne(
    settingName: string,
    declaredDefault: string,
    subject: SkuFeedSettingSubject,
    settingRows: SettingRowIndex,
    productTypePaths: ReadonlyMap<string, readonly string[]>,
  ): string {
    for (const candidate of buildSkuSettingCandidates(subject, productTypePaths)) {
      const settingValue = lookupSettingValue(settingRows, settingName, candidate);

      if (settingValue !== undefined) {
        return settingValue;
      }
    }

    // Step 6. [model/service/SettingService.cfc:L482-L487] seeded this before any probe ran, so
    // reaching it means every probe missed rather than that no probe was attempted.
    return declaredDefault;
  }

  /**
   * Step 1 of the two reads: every candidate row for the feed's two keys.
   */
  private async readSettingRows(): Promise<SettingRowIndex> {
    const rows = await this.executor.execute(SELECT_SKU_FEED_SETTINGS_SQL, [
      SKU_SHIPPING_WEIGHT_SETTING_NAME.toLowerCase(),
      SKU_SHIPPING_WEIGHT_UNIT_CODE_SETTING_NAME.toLowerCase(),
    ]);

    return indexSettingRows(rows);
  }

  /**
   * Step 2 of the two reads: the ancestry path of every product type the batch mentions.
   *
   * The batch is deduplicated first, so a feed of five hundred SKUs sharing one product type binds
   * one key rather than five hundred.
   */
  private async readProductTypePaths(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const leafIdentifiers = [
      ...new Set(
        subjects
          .map((subject) => subject.productTypeID)
          .filter((productTypeID): productTypeID is string => productTypeID !== undefined),
      ),
    ];

    if (leafIdentifiers.length === 0) {
      return new Map<string, readonly string[]>();
    }

    const rows = await this.executor.execute(
      buildSelectProductTypePathsSql(leafIdentifiers.length),
      leafIdentifiers,
    );

    const paths = new Map<string, readonly string[]>();

    for (const row of rows) {
      const productTypeID = readIdentifier(row, 'productTypeID', SELECT_PRODUCT_TYPE_PATHS);
      const storedPath = readOptionalText(row, 'productTypeIDPath', SELECT_PRODUCT_TYPE_PATHS);

      // `listToArray` drops empty elements exactly as CFML's does, so a trailing comma or a
      // doubled separator yields no phantom segment.
      paths.set(productTypeID, listToArray(storedPath ?? ''));
    }

    // A leaf whose row is absent, or whose stored path is empty, still has one known segment:
    // itself.
    for (const leafIdentifier of leafIdentifiers) {
      const knownPath = paths.get(leafIdentifier);

      if (knownPath === undefined || knownPath.length === 0) {
        paths.set(leafIdentifier, [leafIdentifier]);
      }
    }

    return paths;
  }
}

// Section 5 - the framework-generic reads this root owns.
//
// Three ported services declare a collaborator interface for a read the legacy obtained from the
// Hibachi framework rather than from a DAO the AAP puts in scope - a generic
// `get<Entity>(primaryKey)` affordance.
//
// Every statement is a literal with positional parameters (E5).

/**
 * Hydrate one `SwOptionGroup` row.
 */
function hydrateOptionGroup(
  row: SqlRow,
  statementLabel: string,
  columnPrefix: string,
  options: Option[],
): OptionGroup | undefined {
  const optionGroupID = readOptionalText(row, `${columnPrefix}optionGroupID`, statementLabel);

  // A null group identifier is the LEFT JOIN answering "this option has no group", which
  // [model/entity/Option.cfc:L59] permits.
  if (optionGroupID === undefined) {
    return undefined;
  }

  return new OptionGroup({
    optionGroupID,
    optionGroupName: readOptionalText(row, `${columnPrefix}optionGroupName`, statementLabel),
    optionGroupCode: readOptionalText(row, `${columnPrefix}optionGroupCode`, statementLabel),
    optionGroupImage: readOptionalText(row, `${columnPrefix}optionGroupImage`, statementLabel),
    optionGroupDescription: readOptionalText(
      row,
      `${columnPrefix}optionGroupDescription`,
      statementLabel,
    ),
    imageGroupFlag: readFlag(row, `${columnPrefix}imageGroupFlag`, statementLabel),
    // `required="true"` on the column [model/entity/OptionGroup.cfc:L58], and the entity declares
    // it non-optional, so a null is a schema surprise rather than a value to substitute for.
    sortOrder: readRequiredInteger(row, `${columnPrefix}sortOrder`, statementLabel),
    remoteID: readOptionalText(row, `${columnPrefix}remoteID`, statementLabel),
    createdDateTime: readTimestamp(row, `${columnPrefix}createdDateTime`, statementLabel),
    createdByAccountID: readOptionalText(row, `${columnPrefix}createdByAccountID`, statementLabel),
    modifiedDateTime: readTimestamp(row, `${columnPrefix}modifiedDateTime`, statementLabel),
    modifiedByAccountID: readOptionalText(
      row,
      `${columnPrefix}modifiedByAccountID`,
      statementLabel,
    ),
    options,
    // The entity supplies its own tie-breaker when none is handed in; this root has no reason to
    // substitute a different one.
    optionSortTieBreaker: undefined,
  });
}

/**
 * Hydrate one `SwBrand` row into the entity `BrandService.saveBrand` declares.
 *
 * The literal passes the whole record in one go rather than through a draft, because `Brand`'s
 * constructor declares every slot `?: T | undefined`.
 *
 * The column names carry no alias prefix, unlike the brand half of a product graph row.
 */
function hydrateBrand(row: SqlRow, statementLabel: string): Brand {
  return new Brand({
    brandID: readIdentifier(row, 'brandID', statementLabel),
    activeFlag: readFlag(row, 'activeFlag', statementLabel),
    publishedFlag: readFlag(row, 'publishedFlag', statementLabel),
    urlTitle: readOptionalText(row, 'urlTitle', statementLabel),
    brandName: readOptionalText(row, 'brandName', statementLabel),
    brandWebsite: readOptionalText(row, 'brandWebsite', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * Hydrate one `SwOption` row, binding it to an already-built group.
 */
function hydrateOption(
  row: SqlRow,
  statementLabel: string,
  optionGroup: OptionGroup | undefined,
): Option {
  return new Option({
    optionID: readIdentifier(row, 'optionID', statementLabel),
    optionCode: readOptionalText(row, 'optionCode', statementLabel),
    optionName: readOptionalText(row, 'optionName', statementLabel),
    optionDescription: readOptionalText(row, 'optionDescription', statementLabel),
    sortOrder: readOptionalInteger(row, 'sortOrder', statementLabel),
    optionGroup,
    defaultImageID: readOptionalText(row, 'defaultImageID', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * The two entity-by-identifier loaders `ProductService` needs.
 *
 * JUDGMENT CALL: `productService.ts` therefore declares the two loaders on its own
 * `OptionLoadingCollaborator` "for bootstrap to satisfy", and this class is that satisfaction.
 */
class SqlOptionEntityLoader {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  /**
   * One option, with its group.
   *
   * FETCH SHAPE: the group arrives with an EMPTY options collection, exactly as
   * `mysqlSkuRepository.ts` hydrates a group reached through a SKU's option.
   */
  public async getOption(optionID: string): Promise<Option | undefined> {
    const rows = await this.executor.execute(SELECT_OPTION_WITH_GROUP_BY_ID_SQL, [optionID]);
    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    const optionGroup = hydrateOptionGroup(
      row,
      SELECT_OPTION_WITH_GROUP_BY_ID,
      OPTION_GROUP_ALIAS_PREFIX,
      [],
    );

    return hydrateOption(row, SELECT_OPTION_WITH_GROUP_BY_ID, optionGroup);
  }

  /**
   * A SET of options, each with its group, in one statement, keyed by case-folded identifier.
   *
   * A key that matches no row is absent from the map, and that is the load-bearing half of the
   * contract.
   *
   * @param optionIDs the keys to load, in any order and with any repetition.
   */
  public async getOptionsByID(optionIDs: readonly string[]): Promise<ReadonlyMap<string, Option>> {
    // De-duplicated by FOLDED key while BINDING the first spelling seen, so the bound parameters
    // stay the caller's own values while `'ABC'` and `'abc'` cost one placeholder rather than two.
    const requestedOptionIDs: string[] = [];
    const seenFoldedOptionIDs = new Set<string>();

    for (const optionID of optionIDs) {
      const foldedOptionID = foldIdentifier(optionID);

      if (seenFoldedOptionIDs.has(foldedOptionID)) {
        continue;
      }

      seenFoldedOptionIDs.add(foldedOptionID);
      requestedOptionIDs.push(optionID);
    }

    if (requestedOptionIDs.length === 0) {
      return new Map<string, Option>();
    }

    const rows = await this.executor.execute(
      buildSelectOptionsWithGroupByIDSql(requestedOptionIDs.length),
      requestedOptionIDs,
    );

    const optionsByFoldedID = new Map<string, Option>();

    for (const row of rows) {
      const optionGroup = hydrateOptionGroup(
        row,
        SELECT_OPTIONS_WITH_GROUP_BY_ID,
        OPTION_GROUP_ALIAS_PREFIX,
        [],
      );

      const option = hydrateOption(row, SELECT_OPTIONS_WITH_GROUP_BY_ID, optionGroup);

      optionsByFoldedID.set(foldIdentifier(option.getOptionID()), option);
    }

    return optionsByFoldedID;
  }

  /**
   * One option group, with its options materialized.
   *
   * FETCH SHAPE: the options are materialized, in the association's own order, because the caller
   * reads them.
   *
   * The relationship is populated in both directions with one instance per row: each option is
   * constructed with this group, and each is pushed into the same array the group holds by
   * reference.
   */
  public async getOptionGroup(optionGroupID: string): Promise<OptionGroup | undefined> {
    const groupRows = await this.executor.execute(SELECT_OPTION_GROUP_BY_ID_SQL, [optionGroupID]);
    const groupRow = groupRows[0];

    if (groupRow === undefined) {
      return undefined;
    }

    const options: Option[] = [];
    const optionGroup = hydrateOptionGroup(groupRow, SELECT_OPTION_GROUP_BY_ID, '', options);

    if (optionGroup === undefined) {
      // Unreachable through this statement: `optionGroupID` is the primary key and was matched by
      // the WHERE clause, so it cannot read back as null. Handled rather than asserted, because
      // `!` is banned in `src/**`.
      throw new CompositionDataError(
        `option group '${optionGroupID}' matched a row whose primary key read back as null`,
      );
    }

    const optionRows = await this.executor.execute(SELECT_OPTIONS_BY_OPTION_GROUP_ID_SQL, [
      optionGroupID,
    ]);

    for (const optionRow of optionRows) {
      options.push(hydrateOption(optionRow, SELECT_OPTIONS_BY_OPTION_GROUP_ID, optionGroup));
    }

    return optionGroup;
  }
}

/**
 * The one set-based price-group read this root needs, and nothing else.
 *
 * Not a fourteenth port and not a seventh member of `PriceGroupRepository` -
 * `src/domain/ports/priceGroupRepository.ts` locks its count at six explicitly.
 *
 * Why the three consumers take this rather than the whole port.
 */
interface PriceGroupSetLoader {
  getPriceGroupsByID(priceGroupIDs: readonly string[]): Promise<ReadonlyMap<string, PriceGroup>>;
}

/**
 * The set-based product load the wire-document hydration needs.
 */
export interface ProductSetLoader {
  getProductsByProductID(productIDs: readonly string[]): Promise<ReadonlyMap<string, Product>>;
}

/**
 * The set-based SKU load the wire-document hydration needs.
 *
 * `getProductSkus` chooses its eager-fetch join from the product's own base type
 * [model/dao/SkuDAO.cfc:L150-L168], so products of different base types need different statements.
 *
 * `SkuRepository` is locked at seven members - its own header records the removal of an eighth.
 */
export interface SkuSetLoader {
  getProductSkusForProducts(
    products: readonly Product[],
    fetchOptions: boolean,
  ): Promise<ReadonlyMap<string, Sku[]>>;
}

/**
 * The two price-group reads `PriceGroupService` declares.
 *
 * Satisfied structurally, with no `implements` clause: the interface is module-local to
 * `priceGroupService.ts` and is checked at the constructor call.
 */
class SqlPriceGroupFrameworkReads {
  /**
   * One account's live price-group association, keyed by `accountID`, for the lifetime of this
   * INSTANCE - which is one request.
   *
   * Class is constructed inside `createRequestScope`, so one instance serves one invocation and
   * this map dies with it.
   */
  private readonly accountPriceGroupAssociations = new Map<string, PriceGroup[]>();

  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly priceGroupSetLoader: PriceGroupSetLoader,
  ) {}

  /**
   * The price groups assigned DIRECTLY to an account.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L276, L351, L365]:
   * `account.getPriceGroups()`, the ORM association on the out-of-scope `Account` entity, which is
   * identified opaquely here.
   *
   * Each price group is hydrated by its own repository, so there is exactly one hydration path for
   * a `PriceGroup` and this read owns none of it.
   */
  public async getAccountPriceGroups(accountID: string): Promise<PriceGroup[]> {
    const memoized = this.accountPriceGroupAssociations.get(accountID);

    if (memoized !== undefined) {
      return memoized;
    }

    const rows = await this.executor.execute(SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL, [accountID]);
    const association = await this.hydrateByIdentifier(rows, SELECT_ACCOUNT_PRICE_GROUP_IDS);

    // Stored before returning, so the FIRST caller and every later one hold the same instance.
    this.accountPriceGroupAssociations.set(accountID, association);

    return association;
  }

  /**
   * The current page of price groups - at most ten, unordered.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L233-L236]: legacy builds a framework smart
   * list and iterates `getPageRecords()`.
   */
  public async getPriceGroupPageRecords(): Promise<readonly PriceGroup[]> {
    const rows = await this.executor.execute(SELECT_PRICE_GROUP_PAGE_IDS_SQL);
    if (rows.length > MAX_PRICE_GROUP_PAGE_RECORDS) {
      throw new CompositionDataError(
        `statement '${SELECT_PRICE_GROUP_PAGE_IDS}' returned ${String(rows.length)} price groups ` +
          `and at most ${String(MAX_PRICE_GROUP_PAGE_RECORDS)} will be hydrated: each one costs a ` +
          'further statement and its whole rate graph',
      );
    }

    return this.hydrateByIdentifier(rows, SELECT_PRICE_GROUP_PAGE_IDS);
  }

  /**
   * Turn identifier rows into entities: de-duplicate, load the whole set at once, rebuild the
   * order.
   *
   * A link table can name the same price group twice; the ORM association could not, so the
   * duplicate is collapsed rather than hydrated twice.
   *
   * One set read, not one read per identifier, and the shape is the whole point.
   */
  private async hydrateByIdentifier(
    rows: readonly SqlRow[],
    statementLabel: string,
  ): Promise<PriceGroup[]> {
    const seenFoldedIdentifiers = new Set<string>();
    const requestedPriceGroupIDs: string[] = [];

    for (const row of rows) {
      const priceGroupID = readIdentifier(row, 'priceGroupID', statementLabel);
      const foldedPriceGroupID = foldIdentifier(priceGroupID);

      if (seenFoldedIdentifiers.has(foldedPriceGroupID)) {
        continue;
      }

      seenFoldedIdentifiers.add(foldedPriceGroupID);
      requestedPriceGroupIDs.push(priceGroupID);
    }

    const priceGroupsByFoldedID =
      await this.priceGroupSetLoader.getPriceGroupsByID(requestedPriceGroupIDs);

    const priceGroups: PriceGroup[] = [];

    for (const priceGroupID of requestedPriceGroupIDs) {
      const priceGroup = priceGroupsByFoldedID.get(foldIdentifier(priceGroupID));

      if (priceGroup === undefined) {
        throw new CompositionDataError(
          `statement '${statementLabel}' named price group '${priceGroupID}', which SwPriceGroup ` +
            'does not contain',
        );
      }

      priceGroups.push(priceGroup);
    }

    return priceGroups;
  }
}

/**
 * And it is lazy, which is why the other operations pay nothing.
 *
 * The subscription half has no identifier-only equivalent published, so it goes through the port's
 * `getAccountSubscriptionPriceGroups` and takes the identifiers off the entities it answers.
 */
class SqlPriceGroupEntitlements implements PriceGroupEntitlements {
  /**
   * The folded identifiers of every price group this request's account holds, or the in-flight
   * promise of them. `undefined` means "not yet asked".
   *
   * Instance state, never module state - the same rule, and the same reason.
   */
  private entitledFoldedPriceGroupIDs: Promise<ReadonlySet<string>> | undefined;

  public constructor(
    private readonly accountID: string | undefined,
    private readonly adminAccountFlag: boolean,
    private readonly executor: PreparedStatementExecutor,
    private readonly priceGroupRepository: PriceGroupRepository,
  ) {}

  public async isEntitledToPriceGroup(priceGroupID: string): Promise<boolean> {
    if (this.adminAccountFlag) {
      return true;
    }
    if (this.accountID === undefined) {
      return false;
    }

    const entitled = await this.resolveEntitledFoldedPriceGroupIDs(this.accountID);

    return entitled.has(foldIdentifier(priceGroupID));
  }

  public async isEntitledToPriceGroupRate(rate: PriceGroupRate): Promise<boolean> {
    if (this.adminAccountFlag) {
      return true;
    }

    const owningPriceGroupID = rate.getPriceGroup()?.getPriceGroupID();
    if (owningPriceGroupID === undefined || owningPriceGroupID === '') {
      return false;
    }

    return this.isEntitledToPriceGroup(owningPriceGroupID);
  }

  private resolveEntitledFoldedPriceGroupIDs(accountID: string): Promise<ReadonlySet<string>> {
    // Assigned before the first await inside the builder, so a second caller entering while the
    // first is still in flight receives the same promise rather than starting a second pair of
    // reads.
    this.entitledFoldedPriceGroupIDs ??= this.readEntitledFoldedPriceGroupIDs(accountID);

    return this.entitledFoldedPriceGroupIDs;
  }

  private async readEntitledFoldedPriceGroupIDs(accountID: string): Promise<ReadonlySet<string>> {
    const [directRows, subscriptionPriceGroups] = await Promise.all([
      this.executor.execute(SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL, [accountID]),
      this.priceGroupRepository.getAccountSubscriptionPriceGroups(accountID),
    ]);

    const entitled = new Set<string>();

    for (const row of directRows) {
      entitled.add(
        foldIdentifier(readIdentifier(row, 'priceGroupID', SELECT_ACCOUNT_PRICE_GROUP_IDS)),
      );
    }

    for (const priceGroup of subscriptionPriceGroups) {
      entitled.add(foldIdentifier(priceGroup.getPriceGroupID()));
    }

    return entitled;
  }
}

/**
 * A freshly minted 32-character identifier, in the shape
 * `fieldtype="id" generator="uuid" length="32"` expects
 * [model/entity/RoundingRule.cfc:L52, model/entity/Brand.cfc:L52].
 *
 * The hyphens are stripped because the column is 32 characters and a canonical UUID string is.
 */
function mintFrameworkIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * The value-rounding delegate a persisted `RoundingRule` is reconstructed with.
 *
 * Declared module-locally and un-exported, mirroring `src/domain/entities/roundingRule.ts` and
 * `src/repositories/mysql/mysqlPromotionRepository.ts`, which each declare their own structural
 * copy for the same reason: the entity's own interface is not exported.
 */
interface FrameworkWriteValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * Raised when a framework write affects a different number of rows than the one it addressed.
 */
class FrameworkWriteError extends Error {
  public constructor(statementLabel: string, identifier: string, affectedRows: number) {
    super(
      `${statementLabel} affected ${String(affectedRows)} rows for identifier ${identifier}; ` +
        'exactly one was expected. The row may have been deleted by another request.',
    );
    this.name = 'FrameworkWriteError';
  }
}

// Retired - `BrandUrlTitleNotUniqueError`.

/**
 * The durable half of `super.save` for `SwRoundingRule`, over the request's executor.
 *
 * This is the collaborator that makes `RoundingRuleService.saveRoundingRule` actually save.
 *
 * Per REQUEST, because it closes over the request's `AuditActorContext`.
 */
class SqlRoundingRuleFrameworkWrites {
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
    private readonly valueRounder: FrameworkWriteValueRounder,
  ) {}

  /**
   * Insert or update one rule and answer the persisted row.
   *
   * `isNew()` selects the path, reading the `unsavedvalue=""` sentinel
   * [model/entity/RoundingRule.cfc:L52] exactly as Hibernate did when deciding whether a managed
   * entity was transient.
   *
   * One CAPTURED INSTANT per save, written to every stamped column, matching the single `now()`
   * each of [org/Hibachi/HibachiEntity.cfc:L609] and [org/Hibachi/HibachiEntity.cfc:L661] takes.
   */
  public async saveRoundingRule(rule: RoundingRule): Promise<RoundingRule> {
    const auditTimestamp = new Date();
    const stampedBy = resolveAuditActorAccountID(this.auditActor);

    if (rule.isNew()) {
      const mintedID = mintFrameworkIdentifier();

      const inserted = await this.executor.executeMutation(INSERT_ROUNDING_RULE_SQL, [
        mintedID,
        rule.getRoundingRuleName() ?? null,
        rule.getRoundingRuleExpression() ?? null,
        rule.getRoundingRuleDirection() ?? null,
        auditTimestamp,
        // A refused actor gate binds NULL on an INSERT, which is what the legacy produced: a
        // skipped `setCreatedByAccount` left the property unset and Hibernate inserted null.
        stampedBy ?? null,
        auditTimestamp,
        stampedBy ?? null,
      ]);

      if (inserted.affectedRows !== 1) {
        throw new FrameworkWriteError(INSERT_ROUNDING_RULE, mintedID, inserted.affectedRows);
      }

      return this.rehydrate(rule, mintedID, {
        createdDateTime: auditTimestamp,
        createdByAccountID: stampedBy,
        modifiedDateTime: auditTimestamp,
        modifiedByAccountID: stampedBy,
      });
    }

    const roundingRuleID = rule.getRoundingRuleID();

    const result = await this.executor.executeMutation(UPDATE_ROUNDING_RULE_SQL, [
      rule.getRoundingRuleName() ?? null,
      rule.getRoundingRuleExpression() ?? null,
      rule.getRoundingRuleDirection() ?? null,
      auditTimestamp,
      // Bound NULL when the gate refuses, and `sqlUpdateAssignment` has rendered this column as
      // `COALESCE(?, modifiedByAccountID)` so the DATABASE keeps the stored value rather than
      // losing it.
      stampedBy ?? null,
      // The key binds LAST, because it belongs to the WHERE clause and every SET placeholder
      // precedes it.
      roundingRuleID,
    ]);

    if (result.affectedRows !== 1) {
      throw new FrameworkWriteError(UPDATE_ROUNDING_RULE, roundingRuleID, result.affectedRows);
    }

    return this.rehydrate(rule, roundingRuleID, {
      createdDateTime: rule.getCreatedDateTime(),
      createdByAccountID: rule.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      // The TypeScript mirror of the statement's `COALESCE`, so the returned entity agrees with
      // the row.
      modifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        rule.getModifiedByAccountID(),
      ),
    });
  }

  /**
   * A fresh entity describing the row just written.
   */
  private rehydrate(
    rule: RoundingRule,
    roundingRuleID: string,
    stamps: {
      readonly createdDateTime: Date | undefined;
      readonly createdByAccountID: string | undefined;
      readonly modifiedDateTime: Date | undefined;
      readonly modifiedByAccountID: string | undefined;
    },
  ): RoundingRule {
    return new RoundingRule(
      {
        roundingRuleID,
        roundingRuleName: rule.getRoundingRuleName(),
        roundingRuleExpression: rule.getRoundingRuleExpression(),
        roundingRuleDirection: rule.getRoundingRuleDirection(),
        createdDateTime: stamps.createdDateTime,
        createdByAccountID: stamps.createdByAccountID,
        modifiedDateTime: stamps.modifiedDateTime,
        modifiedByAccountID: stamps.modifiedByAccountID,
        priceGroupRates: rule.getPriceGroupRates(),
      },
      this.valueRounder,
    );
  }
}

/**
 * The durable half of `super.save` for `SwBrand`, over the request's executor.
 *
 * Every one of `Brand`'s eight associations is declared `inverse="true"`
 * [model/entity/Brand.cfc:L60-L61, L66-L72], making the brand the owning side of none of them.
 */
class SqlBrandFrameworkWrites {
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
  ) {}

  /**
   * Whether `urlTitle` is free - the query half of `model/validation/Brand.json`'s
   * `"urlTitle": {"unique":true}` save rule.
   *
   * Transcribes `HibachiDAO.isUniqueProperty` [org/Hibachi/HibachiDAO.cfc:L130-L147]: it counts
   * rows holding the value while EXCLUDING the saving entity's own row.
   */
  public async isUrlTitleUnique(urlTitle: string, brandID: string): Promise<boolean> {
    const conflicting = await this.executor.execute(SELECT_BRAND_BY_URL_TITLE_SQL, [
      urlTitle,
      brandID,
    ]);

    return conflicting[0] === undefined;
  }

  /**
   * Insert or update one brand and answer the persisted row.
   *
   * One CAPTURED INSTANT, and the audit columns follow exactly the rules
   * `SqlRoundingRuleFrameworkWrites.saveRoundingRule` documents: NULL on insert when the gate
   * refuses.
   */
  public async saveBrand(brand: Brand): Promise<Brand> {
    const auditTimestamp = new Date();
    const stampedBy = resolveAuditActorAccountID(this.auditActor);
    const isInsert = brand.isNew();
    const brandID = isInsert ? mintFrameworkIdentifier() : brand.getBrandID();
    const urlTitle = brand.getUrlTitle();

    if (isInsert) {
      const inserted = await this.executor.executeMutation(INSERT_BRAND_SQL, [
        brandID,
        // The flags are booleans on the entity
        // [model/entity/Brand.cfc:L53-L54, `ormtype="boolean"`], and the entity has already
        // resolved CFML truthiness for them, so they bind directly.
        brand.getActiveFlag(),
        brand.getPublishedFlag(),
        urlTitle ?? null,
        brand.getBrandName() ?? null,
        brand.getBrandWebsite() ?? null,
        brand.getRemoteID() ?? null,
        auditTimestamp,
        stampedBy ?? null,
        auditTimestamp,
        stampedBy ?? null,
      ]);

      if (inserted.affectedRows !== 1) {
        throw new FrameworkWriteError(INSERT_BRAND, brandID, inserted.affectedRows);
      }

      return this.rehydrate(brand, brandID, {
        createdDateTime: auditTimestamp,
        createdByAccountID: stampedBy,
        modifiedDateTime: auditTimestamp,
        modifiedByAccountID: stampedBy,
      });
    }

    const result = await this.executor.executeMutation(UPDATE_BRAND_SQL, [
      brand.getActiveFlag(),
      brand.getPublishedFlag(),
      urlTitle ?? null,
      brand.getBrandName() ?? null,
      brand.getBrandWebsite() ?? null,
      brand.getRemoteID() ?? null,
      auditTimestamp,
      stampedBy ?? null,
      brandID,
    ]);

    if (result.affectedRows !== 1) {
      throw new FrameworkWriteError(UPDATE_BRAND, brandID, result.affectedRows);
    }

    return this.rehydrate(brand, brandID, {
      createdDateTime: brand.getCreatedDateTime(),
      createdByAccountID: brand.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        brand.getModifiedByAccountID(),
      ),
    });
  }

  /**
   * A fresh entity describing the row just written, carrying the caller's associations unchanged.
   *
   * No re-read, for the reason given on the rounding-rule counterpart.
   */
  private rehydrate(
    brand: Brand,
    brandID: string,
    stamps: {
      readonly createdDateTime: Date | undefined;
      readonly createdByAccountID: string | undefined;
      readonly modifiedDateTime: Date | undefined;
      readonly modifiedByAccountID: string | undefined;
    },
  ): Brand {
    return new Brand({
      brandID,
      activeFlag: brand.getActiveFlag(),
      publishedFlag: brand.getPublishedFlag(),
      urlTitle: brand.getUrlTitle(),
      brandName: brand.getBrandName(),
      brandWebsite: brand.getBrandWebsite(),
      remoteID: brand.getRemoteID(),
      products: brand.getProducts(),
      promotionRewards: brand.getPromotionRewards(),
      promotionRewardExclusions: brand.getPromotionRewardExclusions(),
      promotionQualifiers: brand.getPromotionQualifiers(),
      promotionQualifierExclusions: brand.getPromotionQualifierExclusions(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: stamps.createdByAccountID,
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: stamps.modifiedByAccountID,
    });
  }
}

/**
 * The one promotion read `PromotionService` declares.
 *
 * FETCH SHAPE: the promotion arrives with `promotionPeriods`, `promotionCodes` and
 * `appliedPromotions` UNMATERIALIZED - the entity resolves each absent collection to an empty
 * array.
 */
class SqlPromotionFrameworkReads {
  public constructor(private readonly executor: PreparedStatementExecutor) {}

  public async getPromotion(promotionID: string): Promise<Promotion> {
    const rows = await this.executor.execute(SELECT_PROMOTION_BY_ID_SQL, [promotionID]);
    const row = rows[0];

    if (row === undefined) {
      throw new CompositionDataError(
        `promotion '${promotionID}' is referenced but SwPromotion does not contain it`,
      );
    }

    return new Promotion({
      promotionID: readIdentifier(row, 'promotionID', SELECT_PROMOTION_BY_ID),
      promotionName: readOptionalText(row, 'promotionName', SELECT_PROMOTION_BY_ID),
      promotionSummary: readOptionalText(row, 'promotionSummary', SELECT_PROMOTION_BY_ID),
      promotionDescription: readOptionalText(row, 'promotionDescription', SELECT_PROMOTION_BY_ID),
      // Handed over RAW, so the entity applies the ORM default of `1`
      // [model/entity/Promotion.cfc:L56] rather than this root deciding it.
      activeFlag: readFlag(row, 'activeFlag', SELECT_PROMOTION_BY_ID),
      defaultImageID: readOptionalText(row, 'defaultImageID', SELECT_PROMOTION_BY_ID),
      remoteID: readOptionalText(row, 'remoteID', SELECT_PROMOTION_BY_ID),
      createdDateTime: readTimestamp(row, 'createdDateTime', SELECT_PROMOTION_BY_ID),
      createdByAccountID: readOptionalText(row, 'createdByAccountID', SELECT_PROMOTION_BY_ID),
      modifiedDateTime: readTimestamp(row, 'modifiedDateTime', SELECT_PROMOTION_BY_ID),
      modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', SELECT_PROMOTION_BY_ID),
    });
  }
}

/**
 * Read every `SwCurrency` row, once, at composition time.
 *
 * The projection carries only `currencyCode` and `activeFlag`, which is the whole of what the
 * converter needs [model/entity/Currency.cfc:L52-L53].
 *
 * Boundary where the row is read, which is here: `toCurrencyCode` brands the value and raises on
 * anything else.
 */
async function readCurrencyRecords(
  executor: PreparedStatementExecutor,
): Promise<readonly CurrencyRecordProjection[]> {
  const rows = requireStatementRows(
    await executor.execute(SELECT_CURRENCY_RECORDS_SQL),
    SELECT_CURRENCY_RECORDS,
  );

  return rows.map((row: SqlRow): CurrencyRecordProjection => ({
    currencyCode: toCurrencyCode(readIdentifier(row, 'currencyCode', SELECT_CURRENCY_RECORDS)),
    activeFlag: readFlag(row, 'activeFlag', SELECT_CURRENCY_RECORDS),
  }));
}

/**
 * The eagerly-resolved value of `setting('skuEligibleCurrencies')`.
 *
 * CFML parity [model/service/SettingService.cfc:L222]: the setting's default is
 * `getCurrencyService().getAllActiveCurrencyIDList()`, and
 * [model/service/CurrencyService.cfc:L57-L67] applies `addFilter('activeFlag', 1)` and returns a
 * comma-delimited list string.
 */
async function resolveEligibleCurrencyCodeList(
  records: readonly CurrencyRecordProjection[],
  rates: EuropeanCentralBankRateTable,
): Promise<string> {
  // The active filter is not re-implemented here.
  const eligibleCurrencyReader = new EuropeanCentralBankCurrencyConverter(records, rates);
  const activeCurrencyCodes = await eligibleCurrencyReader.getAllActiveCurrencyIDList();

  // The legacy returns a comma-delimited list string, and the setting's readers measure it with
  // `len()` [model/entity/Sku.cfc:L373] and split it with `listToArray`.
  return activeCurrencyCodes.join(',');
}

// Section 6 - tier 1: the module-scope graph.
//
// Created once, reused across warm invocations, in this exact order: 1. Read configuration 2.
// Resolve the SQL dialect, failing hard 3. Create the one pool.

/**
 * Everything tier 1 owns, handed to `createRequestGraph` as one value.
 *
 * Module-local: it is an internal shape of this file's wiring, not part of the published surface,
 * so it is not exported.
 */
interface ModuleScopeGraph {
  readonly config: AppConfig;
  readonly dialect: DatabaseDialect;
  readonly executor: PreparedStatementExecutor;
  readonly settingsProvider: SettingsProvider;

  /**
   * The resolved `productTitleString` value, as a plain string.
   *
   * It is the template `Product.getTitle()` [model/entity/Product.cfc:L542] renders, and it is
   * resolved at this tier because module scope is where settings resolution happens once per
   * container.
   */
  readonly productTitleTemplate: string;
  readonly currencyRecords: readonly CurrencyRecordProjection[];
  readonly europeanCentralBankRates: EuropeanCentralBankRateTable;
  readonly urlTitleGenerator: UrlTitleGenerator;
  readonly imageStore: ImageStore;
  readonly imageSettingValues: SkuImageSettingValues;
  readonly subscriptionTermProvider: SubscriptionTermProvider;
  readonly skuFeedSettingResolver: SkuFeedSettingResolver;
  readonly optionEntityLoader: SqlOptionEntityLoader;
  readonly feedSettingValues: ResolvedFeedSettingValues;
  readonly integration: GoogleIntegration;
}

/**
 * The memoized tier-1 promise.
 *
 * A PROMISE, not a resolved value, and that is the concurrency guard: the assignment happens
 * synchronously before the first `await` inside `createModuleScopeGraph`.
 */
let memoizedCompositionRoot: Promise<CompositionRoot> | undefined;

/**
 * Build the module-scope graph.
 *
 * top-level `await` anywhere in this module - the CJS bundle mandate forbids one - so the one
 * asynchronous step lives here.
 */
async function createModuleScopeGraph(overrides: CompositionOverrides): Promise<ModuleScopeGraph> {
  // `../lib/config.js` is static process configuration and is never used as a request scope.
  const config = appConfig.load(overrides.environment);

  // FIRST, and before ANYTHING that LOGS. `../lib/logger.js` reads no environment variable of its
  // own, so until this line runs it is emitting at its built-in `info` floor.
  adoptConfiguredLogThreshold(config.logging);

  // Legacy - it is not a port of `<cfabort/>`.
  //
  // Here it fails hard, at startup, with no silent default.
  const dialect = resolveDialect(config.dialect);

  assertMySqlDialect(dialect, DIALECT_DECISION_SITE);

  // What travels onwards is the EXECUTOR, never the pool: every repository and every read in this
  // file receives it as a CONSTRUCTOR PARAMETER, no consumer imports the pool module.
  const executor = overrides.executor ?? getPreparedStatementExecutor();

  const currencyRecords = await readCurrencyRecords(executor);
  const europeanCentralBankRates =
    overrides.europeanCentralBankRates ??
    (Object.keys(config.currency.europeanCentralBankRates).length > 0
      ? config.currency.europeanCentralBankRates
      : EMPTY_EUROPEAN_CENTRAL_BANK_RATES);

  // The instant travels with the table it describes.
  const ratesRetrievedAt =
    overrides.europeanCentralBankRates === undefined
      ? config.currency.ratesRetrievedAt
      : overrides.europeanCentralBankRatesRetrievedAt;

  reportRateTableAge(ratesRetrievedAt, europeanCentralBankRates);
  const skuEligibleCurrencies = await resolveEligibleCurrencyCodeList(
    currencyRecords,
    europeanCentralBankRates,
  );

  // The configured values, read from `SwSetting`. Everything above resolves DEFAULTS; this is the
  // step that lets an installation's own configuration be seen at all.
  const configuredSettings = await readGeneralSettingValues(executor);
  const settingsProvider = Object.freeze(
    new BootstrapSettingsProvider(configuredSettings, skuEligibleCurrencies),
  );

  // Each is immutable and holds no memo, which is what makes module scope safe for it.
  const presentationValues = settingsProvider.presentationValues();

  const imageSettingValues: SkuImageSettingValues = {
    baseImageURL: BASE_IMAGE_URL_DEFAULT,
    productImageOptionCodeDelimiter: presentationValues.productImageOptionCodeDelimiter,
    productImageDefaultExtension: presentationValues.productImageDefaultExtension,
  };

  const feedSettingValues: ResolvedFeedSettingValues = {
    globalURLKeyProduct: settingsProvider.setting('globalURLKeyProduct'),
    baseImageURL: BASE_IMAGE_URL_DEFAULT,
    missingImagePath: MISSING_IMAGE_PATH_DEFAULT,
  };

  const graph: ModuleScopeGraph = {
    config,
    dialect,
    executor,
    settingsProvider,
    // The resolved value, not the resolver - see the member's own note and section 4.1.
    productTitleTemplate: presentationValues.productTitleString,
    currencyRecords,
    europeanCentralBankRates,
    urlTitleGenerator: new SqlUrlTitleGenerator(executor),
    imageStore: new RefusingImageStore(imageSettingValues),
    imageSettingValues,
    subscriptionTermProvider: new RefusingSubscriptionTermProvider(),
    // Takes the executor and reads lazily, inside the call - the same shape as
    // `SqlUrlTitleGenerator` and `SqlOptionEntityLoader` above.
    skuFeedSettingResolver: new SqlSkuFeedSettingResolver(executor),
    optionEntityLoader: new SqlOptionEntityLoader(executor),
    feedSettingValues,
    // No constructor parameters.
    integration: Object.freeze(new GoogleIntegration()),
  };

  // The graph has been built once, in order, and is checked here.
  //
  // It is free of i/o, which is why it can run here at all.
  //
  // The empty input is the honest probe: it exercises the same defaults a request carrying no
  // clock, no account and no feed host would, and its wall-clock read.
  assertCompleteRequestGraph(
    createRequestGraph(
      graph,
      {},
      createPreparedAddressZoneLocationSource(NO_ADDRESS_ZONE_LOCATIONS),
    ),
  );

  // `../lib/logger.js` treats `environment`, `config` and `settings` as OPAQUE CONTAINER keys and
  // redacts a scalar under any of them, and it fails closed on every key it does not recognize -
  // so a payload naming the dialect.
  logger.info(
    'Composition root wired; complete request graph assembled and validated; ' +
      'sku eligible currencies resolved eagerly',
    {
      rowCount: currencyRecords.length,
      resultCount: listToArray(skuEligibleCurrencies).length,
    },
  );

  return graph;
}

/**
 * Project the live configuration onto the redacted surface a caller may see.
 *
 * No member of the live configuration is handed over, which is what makes this a projection rather
 * than a rename.
 */
function projectCompositionDiagnostics(config: AppConfig): CompositionDiagnostics {
  return Object.freeze({
    environment: config.environment,
    dialect: config.dialect,
    tls: Object.freeze({
      mode: config.tls.mode,
      minimumVersion: config.tls.minimumVersion,
      certificateAuthorityConfigured: config.tls.certificateAuthority !== undefined,
    }),
    feed: Object.freeze({
      allowedHostCount: config.feed.allowedHosts.length,
    }),
    currency: Object.freeze({
      referenceRateCount: Object.keys(config.currency.europeanCentralBankRates).length,
      ratesRetrievedAtConfigured: config.currency.ratesRetrievedAt !== undefined,
    }),
  });
}

/**
 * Wrap the tier-1 graph in the published accessor.
 */
async function createCompositionRoot(overrides: CompositionOverrides): Promise<CompositionRoot> {
  const graph = await createModuleScopeGraph(overrides);

  // Frozen, for the reason recorded on `projectRequestScope`: this is a published object, every
  // tier-1 object beside it is frozen.
  return Object.freeze({
    // `graph.config` STAYS INSIDE the CLOSURE. What crosses the boundary is the redacted
    // projection, so `AppConfig` - and with it the database credential - is unreachable from the
    // returned root.
    diagnostics: projectCompositionDiagnostics(graph.config),
    dialect: graph.dialect,
    settingsProvider: graph.settingsProvider,
    integration: graph.integration,
    createRequestScope: (input?: RequestScopeInput): Promise<RequestScope> =>
      createRequestScope(graph, input ?? {}),
    createInspectableRequestScope: (input?: RequestScopeInput): Promise<InspectableRequestScope> =>
      createInspectableRequestScope(graph, input ?? {}),
  });
}

/**
 * The one entry point into the wired graph.
 *
 * Idempotent and memoized: the first caller starts the initialization, every concurrent caller
 * awaits the same in-flight promise, and a warm container resolves immediately.
 *
 * @param overrides the test seam.
 */
export function bootstrapCompositionRoot(
  overrides?: CompositionOverrides,
): Promise<CompositionRoot> {
  if (overrides !== undefined) {
    // Before anything is resolved, and SYNCHRONOUSLY, so a composition that would hold two
    // configurations at once never reaches a pool factory or a statement builder.
    assertSingleConfigurationAuthority(overrides);

    return createCompositionRoot(overrides);
  }

  memoizedCompositionRoot ??= createCompositionRoot({}).catch((error: unknown): never => {
    memoizedCompositionRoot = undefined;

    throw error;
  });

  return memoizedCompositionRoot;
}

/**
 * Discard the memoized graph.
 *
 * The seam a suite uses to prove that initialization is performed once, and the same idiom
 * `appConfig.reset()` and `closeConnectionPool()` already publish.
 */
export function resetCompositionRoot(): void {
  memoizedCompositionRoot = undefined;
}

// Section 7 - tier 2: the per-request graph.
//
// Invoked once per invocation, and once more at initialization as tier 1's validation probe.
//
// `createRequestGraph` builds the graph and returns every binding as one value;
// `createRequestScope` projects that value onto the published surface and builds nothing.

/**
 * One request's complete binding graph, as `createRequestGraph` assembles it.
 *
 * `PriceGroupService` and the whole `PromotionService` are constructed inside `createRequestGraph`
 * and stay in its closure.
 *
 * And it carries a feed-port factory rather than a feed port.
 */
interface RequestGraph {
  /**
   * The one instant this request's every date comparison resolves against.
   */
  readonly now: Date;

  /**
   * The explicit T6 replacement for ambient scope, built from this request's input.
   */
  readonly currentAccountContext: CurrentAccountContext;

  /**
   * Per request, because the ECB daily-rate memo must not outlive one.
   */
  readonly currencyConverter: CurrencyConverter;

  /**
   * The six MySQL adapters, each satisfying its correspondingly-named port.
   */
  readonly productRepository: ProductRepository & ProductSetLoader;
  readonly skuRepository: SkuRepository & SkuSetLoader;
  readonly optionRepository: OptionRepository;
  readonly productTypeRepository: ProductTypeRepository;
  readonly promotionRepository: PromotionRepository;
  readonly priceGroupRepository: PriceGroupRepository;

  /**
   * The seven read-only entity loads, projected onto {@link RequestScope.entityLoaders} unchanged.
   */
  readonly entityLoaders: RequestEntityLoaders;
  readonly priceGroupEntitlements: PriceGroupEntitlements;

  // The five ported services published whole, plus the two published narrowed.
  readonly roundingRuleService: RoundingRuleService;
  readonly brandService: BrandService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  readonly productService: ProductService;

  /**
   * `PriceGroupService` minus its order pass. See {@link PriceResolutionCapability}.
   */
  readonly priceResolution: PriceResolutionCapability;

  /**
   * `PromotionService` minus its order pass. See {@link PromotionQueryCapability}.
   */
  readonly promotionQueries: PromotionQueryCapability;

  /**
   * The feed query side, built unconditionally - it needs no host.
   */
  readonly feedRepository: GoogleFeedRepository;

  /**
   * The feed port, built unconditionally from collaborators alone.
   */
  readonly productFeedPort: ProductFeedPort;

  /**
   * This request's `FeedCriteria`, or `undefined` when it carried no feed host.
   */
  readonly feedCriteria: FeedCriteria | undefined;

  /**
   * The same sale-price adapter the product repository hydrates through.
   */
  readonly getSalePriceDetailsForProductSkus: (
    productID: string,
  ) => Promise<CfStruct<SalePriceDetail>>;

  /**
   * The wire-document hydration `RequestScope.materializeOrderView` publishes.
   */
  readonly materializeOrderView: (document: OrderViewDocument) => Promise<OrderView>;

  /**
   * The one route by which either order pass executes, in the mandated order.
   */
  readonly updateOrderAmountsWithPriceGroupsThenPromotions: (
    order: OrderView,
  ) => Promise<OrderPricingResult>;

  /**
   * Load this request's address-zone index before a direct synchronous consultation.
   */
  readonly prepareAddressZoneEvaluation: () => Promise<void>;
}

/**
 * The request-graph bindings that {@link assertCompleteRequestGraph} allows to be absent.
 *
 * EXACTLY one MEMBER, and it is typed `keyof RequestGraph` so a rename cannot leave a stale string
 * behind: `feedCriteria` is absent for every request that carried no feed host, which is most of
 * them.
 *
 * Typed `ReadonlySet<string>` at the binding and `keyof RequestGraph` at the literal.
 */
const OPTIONAL_REQUEST_GRAPH_BINDINGS: ReadonlySet<string> = new Set<keyof RequestGraph>([
  'feedCriteria',
]);

/**
 * Refuse an incomplete request graph, naming the binding that is absent.
 *
 * Widening to `unknown` is what makes the walk cast-free.
 *
 * @throws `CompositionIncompleteError` naming the first absent binding.
 */
function assertCompleteRequestGraph(requestGraph: RequestGraph): void {
  const bindings: Readonly<Record<keyof RequestGraph, unknown>> = requestGraph;

  for (const [binding, value] of Object.entries(bindings)) {
    if (value === undefined && !OPTIONAL_REQUEST_GRAPH_BINDINGS.has(binding)) {
      throw new CompositionIncompleteError(binding);
    }
  }
}

/**
 * Assemble one request's binding graph. Synchronous, and it issues no statement.
 *
 * @param graph tier one's shared, stateless bindings.
 * @param input this request's clock, account and feed host, all optional.
 * @param addressZoneLocations this request's deferred access to the zone index.
 */
function createRequestGraph(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
  addressZoneLocations: AddressZoneLocationSource,
): RequestGraph {
  // A `Date` is an absolute instant - it carries no zone - so threading one and comparing with it
  // is UTC by construction, with no local-time reading anywhere.
  //
  // `Date` is mutable, so holding one instance and handing it out would let any consumer - a
  // handler, a repository, an entity - move the baseline every other consumer compares against.
  const requestEpochMilliseconds = (input.now ?? new Date()).getTime();

  // A `TypeError` rather than a named domain error, matching `assertSingleConfigurationAuthority`
  // above: an invalid `Date` is a caller programming error at the handler seam.
  if (!Number.isFinite(requestEpochMilliseconds)) {
    throw new TypeError(
      'RequestScopeInput.now is an invalid Date: its time value is not finite. Every date-dependent ' +
        'read of a request - the promotion-period window, the sale-price reduction, the ' +
        'subscription-eligibility window and the feed build stamp - resolves to this instant, and a ' +
        'non-finite one becomes SQL NULL rather than a comparison, which silently answers "no match" ' +
        'and changes the price a customer is charged. Omit the member to use the wall clock.',
    );
  }

  // It reads no clock: it answers the instant already captured above. `PromotionPeriod` hydration
  // receives the same value through the adapter, which copies again before handing it to an
  // entity.
  const requestClock = {
    now: (): Date => new Date(requestEpochMilliseconds),
  };

  // `config.database`, the settings table, the pool executor and `UNATTRIBUTED_AUDIT_ACTOR` are
  // all `Object.freeze`d, and so is this: an unfrozen request tier would let
  // `scope.currentAccountContext.accountID = 'HACK'` succeed.
  const currentAccountContext: CurrentAccountContext = Object.freeze(
    input.accountID === undefined ? {} : { accountID: input.accountID },
  );
  const auditActor: AuditActorContext = {
    ...(input.accountID === undefined ? {} : { accountID: input.accountID }),
    adminAccountFlag: input.adminAccountFlag ?? false,
  };
  const currencyConverter: CurrencyConverter = new EuropeanCentralBankCurrencyConverter(
    graph.currencyRecords,
    graph.europeanCentralBankRates,
    (originalCurrencyCode: string, convertToCurrencyCode: string): void => {
      logger.warn('Currency conversion passed through unconverted; no reachable rate', {
        originalCurrencyCode,
        convertToCurrencyCode,
      });
    },
  );

  // Each initializer is spelled out rather than left implicit: the whole point of these variables
  // is that they are UNBOUND for a stretch and bound thereafter.

  // Cycle 1: rounding service <-> promotion repository.
  let roundingRuleServiceBinding: RoundingRuleService | undefined = undefined;

  // One METHOD, which is the whole of what both `mysqlPromotionRepository.ts` and
  // `mysqlPriceGroupRepository.ts` ask for.
  const valueRounder = {
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      if (roundingRuleServiceBinding === undefined) {
        throw new CompositionWiringError('roundingRuleService');
      }

      return roundingRuleServiceBinding.roundValueByRoundingRule(value, rule);
    },
  };

  // Cycle 2: product repository <-> SKU repository <-> price groups.
  let priceGroupServiceBinding: PriceGroupService | undefined = undefined;

  function requirePriceGroupService(): PriceGroupService {
    if (priceGroupServiceBinding === undefined) {
      throw new CompositionWiringError('priceGroupService');
    }

    return priceGroupServiceBinding;
  }

  /**
   * `SkuPriceGroupResolver`, satisfied by adapting the ported `src/services/priceGroupService.ts`
   * surface and injected into the `Sku` entity from here - transformation rule T2.
   *
   * `PriceGroupService` already declares `implements SkuPriceGroupResolver`, so the instance is
   * one; this delegating object exists only to break the construction cycle.
   */
  const priceGroupResolver: SkuPriceGroupResolver = {
    calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
      return requirePriceGroupService().calculateSkuPriceBasedOnPriceGroup(sku, priceGroup);
    },

    getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
      return requirePriceGroupService().getRateForSkuBasedOnPriceGroup(sku, priceGroup);
    },

    calculateSkuPriceBasedOnCurrentAccount(
      sku: Sku,
      context: CurrentAccountContext,
    ): Promise<Money> {
      return requirePriceGroupService().calculateSkuPriceBasedOnCurrentAccount(sku, context);
    },
  };

  // Cycle 3: product repository <-> promotion service.
  let promotionServiceBinding: PromotionService | undefined = undefined;

  /**
   * The sale-price capability `MysqlProductRepository` consults before it constructs a `Product`,
   * satisfied by adapting the ported `src/services/promotionService.ts` surface - transformation
   * rule T2.
   *
   * It goes into the repository, not only onto `RequestScope`, and that is the whole point.
   */
  const salePriceResolver: SalePriceResolver = {
    getSalePriceDetailsForProductSkus(productID: string): Promise<CfStruct<SalePriceDetail>> {
      if (promotionServiceBinding === undefined) {
        throw new CompositionWiringError('promotionService');
      }

      return promotionServiceBinding.getSalePriceDetailsForProductSkus(productID);
    },
  };
  const promotionRepository: PromotionRepository = new MysqlPromotionRepository(
    graph.executor,
    valueRounder,
    requestClock,
  );
  const mysqlPriceGroupRepository = new MySqlPriceGroupRepository(
    graph.executor,
    auditActor,
    valueRounder,
    requestClock,
  );
  const priceGroupRepository: PriceGroupRepository = mysqlPriceGroupRepository;

  // `nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220] is an instance field on this
  // adapter, so the memo is per request.
  //
  // Request-scoping neutralizes the consequence without repairing the defect: a memo that cannot
  // be cleared still cannot outlive the request that created it.
  const mysqlSkuRepository = new MysqlSkuRepository(graph.executor, auditActor, {
    settingsProvider: graph.settingsProvider,
    currencyConverter,
    priceGroupResolver,
    currentAccountContext,
    imageSettingValues: graph.imageSettingValues,
  });
  const skuRepository: SkuRepository = mysqlSkuRepository;

  const optionRepository: OptionRepository = new MysqlOptionRepository(graph.executor);
  const productTypeRepository: ProductTypeRepository = new MysqlProductTypeRepository(
    graph.executor,
    auditActor,
  );

  // The third argument is the `ProductSkuCascadeWriter` that reproduces
  // `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73].
  //
  // `salePriceResolver` is the fifth collaborator, and it discharges the reach the legacy entity
  // makes at [model/entity/Product.cfc:L519] through `getService("promotionService")`.
  const mysqlProductRepository = new MysqlProductRepository(
    graph.executor,
    auditActor,
    {
      settingsProvider: graph.settingsProvider,
      productTitleTemplate: graph.productTitleTemplate,
      skuRepository: mysqlSkuRepository,
      optionRepository,
      subscriptionTermProvider: graph.subscriptionTermProvider,
      salePriceResolver,
      productTypeRepository,
    },
    mysqlSkuRepository,
  );

  // The narrowing is still published to services, and the graph binding carries both facets - see
  // `RequestGraph.productRepository`. Every service constructor below takes the port-typed name.
  const productRepository: ProductRepository = mysqlProductRepository;

  // EXIST. A ported service method that declares a `Product`, a `ProductType`, a `Sku` or a
  // `PriceGroupRate` can only be bound EXACTLY if the boundary publishes a way to turn an
  // identifier into that entity.
  const entityLoaders: RequestEntityLoaders = Object.freeze({
    getProductByProductID: (productID: string): Promise<Product | undefined> =>
      productRepository.getProductByProductID(productID),

    getProductTypeByProductTypeID: (productTypeID: string): Promise<ProductType | undefined> =>
      productTypeRepository.getProductTypeByProductTypeID(productTypeID),

    getSkuBySkuIdentity: async (identity: SkuIdentity): Promise<LoadedSku | undefined> => {
      const product = await productRepository.getProductByProductID(identity.productID);

      if (product === undefined) {
        return undefined;
      }

      // `fetchOptions` FALSE, deliberately: eager option fetching branches on the product's base
      // type and does not change which SKU carries the identifier.
      const skus = await skuRepository.getProductSkus(product, false);

      // The read adds no `DISTINCT`, so one SKU can arrive as several instances of the same row.
      //
      // The read itself is unaffected: `getProductByProductID` above and `getProductSkus` here
      // bind their identifiers as parameters.
      const foldedSkuID = foldIdentifier(identity.skuID);
      const sku = skus.find((candidate) => foldIdentifier(candidate.getSkuID()) === foldedSkuID);

      return sku === undefined ? undefined : { product, sku };
    },

    getPriceGroup: (priceGroupID: string): Promise<PriceGroup | undefined> =>
      priceGroupRepository.getPriceGroup(priceGroupID),

    getPriceGroupRate: (priceGroupRateID: string): Promise<PriceGroupRate | undefined> =>
      priceGroupRepository.getPriceGroupRate(priceGroupRateID),

    getBrandByBrandID: async (brandID: string): Promise<Brand | undefined> => {
      // The one load with no repository behind it, because `BrandService.cfc` declares no read -
      // see `RequestEntityLoaders.getBrandByBrandID`.
      const rows = await graph.executor.execute(SELECT_BRAND_BY_BRAND_ID_SQL, [brandID]);
      const row = rows[0];

      return row === undefined ? undefined : hydrateBrand(row, SELECT_BRAND_BY_BRAND_ID);
    },

    getOptionsByOptionIDList: (
      optionIDs: readonly string[],
    ): Promise<ReadonlyMap<string, Option>> =>
      // Forwarded verbatim to the collaborator that already existed for `SkuService`'s option
      // resolution.
      graph.optionEntityLoader.getOptionsByID(optionIDs),
  });

  // In dependency order, and every one of them after every repository. Each of the three late
  // bindings above is closed inside this block, the moment the service it names exists.
  //
  // The two `Sql*FrameworkReads` collaborators are constructed INLINE, as arguments to the single
  // service that declares each.
  const roundingRuleService = new RoundingRuleService(
    promotionRepository,
    new SqlRoundingRuleFrameworkWrites(graph.executor, auditActor, valueRounder),
  );

  roundingRuleServiceBinding = roundingRuleService;

  // `PriceGroupService` declares only three collaborators and never injects `roundingRuleService`
  // [model/service/PriceGroupService.cfc:L51, L53, L54].
  const priceGroupService = new PriceGroupService(
    priceGroupRepository,
    productRepository,
    new SqlPriceGroupFrameworkReads(graph.executor, mysqlPriceGroupRepository),
  );

  priceGroupServiceBinding = priceGroupService;

  // Built here, beside the service whose five group-named members it guards, and from the same
  // request-scoped pair - this request's executor and this request's price-group port.
  //
  // It takes the administrative claim from `input`, not from `auditActor`.
  const priceGroupEntitlements: PriceGroupEntitlements = new SqlPriceGroupEntitlements(
    input.accountID,
    input.adminAccountFlag ?? false,
    graph.executor,
    priceGroupRepository,
  );

  // Its only collaborator [model/service/BrandService.cfc:L51] `dataService`, which is
  // BrandService's entire dependency surface.
  const brandService = new BrandService(
    graph.urlTitleGenerator,
    new SqlBrandFrameworkWrites(graph.executor, auditActor),
  );

  // Legacy [model/service/OptionService.cfc:L53] declared `property name="productService"` but the
  // component body never references it.
  const optionService = new OptionService(optionRepository);

  // Legacy [model/service/SkuService.cfc:L54] declared `property name="productService"` but the
  // component body never references it.
  const skuService = new SkuService(
    skuRepository,
    graph.imageStore,
    graph.subscriptionTermProvider,
    undefined,
    graph.imageSettingValues,
  );

  /**
   * The two loaders and the one transform `ProductService` needs.
   *
   * `getOptionsForSelect` is the already-constructed `OptionService`'s own synchronous method
   * [model/service/OptionService.cfc:L55]; the two loaders are this root's.
   */
  const optionLoading: OptionLoadingCollaborator = {
    getOptionsForSelect: (options) => optionService.getOptionsForSelect(options),
    getOptionGroup: (optionGroupID) => graph.optionEntityLoader.getOptionGroup(optionGroupID),
    getOption: (optionID) => graph.optionEntityLoader.getOption(optionID),
  };

  /**
   * SKU creation, satisfied by the already-constructed `SkuService`.
   *
   * The legacy call is `getSkuService().createSkus(...)` from
   * [model/service/ProductService.cfc:L58], a live collaborator - unlike the two dead declarations
   * noted below.
   */
  const skuCreation: SkuCreationCollaborator = {
    createSkus: async (product, data) =>
      skuService.createSkus(product, await toCreateSkusInput(data, graph.optionEntityLoader)),
  };

  // Legacy [model/service/ProductService.cfc:L54] declared `property name="productTypeDAO"` and
  // [model/service/SettingService.cfc:L57] `property name="contentService"`; the component body
  // references neither.
  //
  // An empty set opens no transaction and issues no statement, which is what a Hibernate session
  // that dirtied no entity did.
  const skuBatchWrite: SkuBatchWriteCollaborator = {
    saveMutatedSkus: async (skus): Promise<void> => {
      if (skus.length === 0) {
        return;
      }

      await graph.executor.transaction(async (tx): Promise<void> => {
        for (const sku of skus) {
          await mysqlSkuRepository.saveSku(sku, undefined, tx);
        }
      });
    },
  };

  const productService = new ProductService(
    productRepository,
    skuRepository,
    productTypeRepository,
    graph.urlTitleGenerator,
    graph.imageStore,
    graph.subscriptionTermProvider,
    skuCreation,
    optionLoading,
    skuBatchWrite,
  );

  // Three collaborators, matching [model/service/PromotionService.cfc:L51, L53, L54] exactly: the
  // promotion DAO, the address service reduced to its one in-scope method, and the rounding-rule
  // service.
  const promotionService = new PromotionService(
    promotionRepository,
    new CfmlAddressZoneEvaluator(addressZoneLocations),
    roundingRuleService,
    new SqlPromotionFrameworkReads(graph.executor),
  );

  // Cycle 3 closed. The product adapter has held `salePriceResolver` since its own construction
  // and calls nothing during it, so the first invocation of that delegate cannot precede this
  // line.
  promotionServiceBinding = promotionService;

  // This is where the ordering obligation stops being a convention.
  //
  // The annotations are what enforce completeness: `Omit` leaves every surviving member REQUIRED,
  // so a service member renamed or dropped fails to compile here.
  const priceResolution: PriceResolutionCapability = priceGroupService;
  const promotionQueries: PromotionQueryCapability = promotionService;

  // `salePriceSource` is the promotion repository narrowed to `getSalePricePromotionRewardsQuery`,
  // and `valueRounder` the rounding service narrowed to `roundValueByRoundingRuleID`; both are
  // structural picks.
  const feedRepository = new GoogleFeedRepository(
    graph.executor,
    graph.feedSettingValues,
    graph.skuFeedSettingResolver,
    promotionRepository,
    roundingRuleService,
  );

  // It is constructible from the module-scope graph alone, like every other binding here - which
  // is the property the factory was invented to simulate, now held for real.
  const productFeedPort: ProductFeedPort = new GoogleFeedService(feedRepository);

  // AAP 0.4.2's `FeedCriteria` carries the origin AUTHORITY and the request INSTANT, and this is
  // the one function with access to the frozen deployment allow-list (`graph.config`) and to this
  // request's clock.
  //
  // `undefined` when no HOST was SUPPLIED, gated on exactly the condition that gates the port in
  // the projection.
  const feedCriteria: FeedCriteria | undefined =
    input.feedHost === undefined
      ? undefined
      : Object.freeze({
          feedHost: assertAllowedFeedHost(input.feedHost, graph.config.feed.allowedHosts),
          now: requestClock.now(),
        });

  // Each of the three is assigned by an unconditional straight-line statement above, so a reader
  // can see that all three are closed.
  const lateBindings: Readonly<Record<string, () => unknown>> = {
    roundingRuleService: () => roundingRuleServiceBinding,
    priceGroupService: () => priceGroupServiceBinding,
    promotionService: () => promotionServiceBinding,
  };

  for (const [collaborator, readBinding] of Object.entries(lateBindings)) {
    if (readBinding() === undefined) {
      throw new CompositionWiringError(collaborator);
    }
  }

  return {
    get now(): Date {
      return requestClock.now();
    },
    currentAccountContext,
    currencyConverter,
    // The CONCRETE instances, because this binding declares both facets.
    productRepository: mysqlProductRepository,
    skuRepository: mysqlSkuRepository,
    optionRepository,
    productTypeRepository,
    promotionRepository,
    priceGroupRepository,
    entityLoaders,
    priceGroupEntitlements,
    roundingRuleService,
    brandService,
    optionService,
    skuService,
    productService,
    // The narrowed capabilities, and not the services - not even onto this module-local shape.
    priceResolution,
    promotionQueries,
    feedRepository,
    productFeedPort,
    feedCriteria,
    materializeOrderView: (document) =>
      materializeOrderViewDocument(
        document,
        // The CONCRETE ADAPTERS, not the port-typed narrowings above them: the two set-based loads
        // are adapter members composed through a structural contract, exactly as the
        // price-group set load already was.
        mysqlProductRepository,
        mysqlSkuRepository,
        mysqlPriceGroupRepository,
        input.accountID,
      ),
    getSalePriceDetailsForProductSkus: (productID) =>
      salePriceResolver.getSalePriceDetailsForProductSkus(productID),
    updateOrderAmountsWithPriceGroupsThenPromotions: (order) =>
      updateOrderAmountsWithPriceGroupsThenPromotions(
        priceGroupService,
        promotionService,
        mysqlPriceGroupRepository,
        addressZoneLocations,
        order,
      ),
    prepareAddressZoneEvaluation: async (): Promise<void> => {
      await addressZoneLocations.load();
    },
  };
}

/**
 * Project one assembled request graph onto the PUBLISHED request scope.
 *
 * The two pricing members keep their names and change their types.
 *
 * The feed port is built here, and only when a host was supplied.
 */
function createRequestScope(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
): Promise<RequestScope> {
  return Promise.resolve().then(() => {
    if (input.feedHost !== undefined) {
      assertAllowedFeedHost(input.feedHost, graph.config.feed.allowedHosts);
    }

    return projectRequestScope(assembleRequestGraph(graph, input), input);
  });
}

/**
 * Open one request's scope and hand back the adapters it was assembled with.
 *
 * The refusal semantics are the `createRequestScope` ones unchanged, because the refusal lives in
 * `createProductFeedPort` and this route reaches it through the same projection: an unlisted feed
 * host rejects with `UntrustedFeedHostError`.
 */
function createInspectableRequestScope(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
): Promise<InspectableRequestScope> {
  return Promise.resolve().then(() => {
    if (input.feedHost !== undefined) {
      assertAllowedFeedHost(input.feedHost, graph.config.feed.allowedHosts);
    }

    return projectInspectableRequestScope(graph, input);
  });
}

/**
 * Assemble once, then publish the scope together with the adapters it closes over.
 */
function projectInspectableRequestScope(
  graph: ModuleScopeGraph,
  input: RequestScopeInput,
): InspectableRequestScope {
  const requestGraph = assembleRequestGraph(graph, input);

  // Frozen at both levels, for the reason recorded on `projectRequestScope`: the two halves are
  // published objects and every other published object in this file is frozen.
  return Object.freeze({
    scope: projectRequestScope(requestGraph, input),
    // Copied out member by member rather than spread from the graph, so that a member added to
    // `RequestGraph` later cannot arrive on this surface without someone deciding it should.
    adapters: Object.freeze({
      productRepository: requestGraph.productRepository,
      skuRepository: requestGraph.skuRepository,
      optionRepository: requestGraph.optionRepository,
      productTypeRepository: requestGraph.productTypeRepository,
      promotionRepository: requestGraph.promotionRepository,
      priceGroupRepository: requestGraph.priceGroupRepository,
    }),
  });
}

/**
 * Assemble one request's graph, performing the one read that has to precede assembly.
 */
function assembleRequestGraph(graph: ModuleScopeGraph, input: RequestScopeInput): RequestGraph {
  return createRequestGraph(graph, input, createDeferredAddressZoneLocationSource(graph.executor));
}

/**
 * Project the request-tier surface from an assembled graph.
 */
function projectRequestScope(requestGraph: RequestGraph, input: RequestScopeInput): RequestScope {
  // FROZEN, for the reason recorded on `currentAccountContext` in `createRequestGraph`: every
  // tier-1 object this file publishes is frozen, so no caller can reassign a member of it.
  return Object.freeze({
    // FORWARDED as AN ACCESSOR, because the graph's own member is one: copying the value here would
    // put the held instance straight back onto the published surface, which is the arrangement a
    // frozen tier exists to prevent.
    get now(): Date {
      return requestGraph.now;
    },
    currentAccountContext: requestGraph.currentAccountContext,
    // Forwarded UNCHANGED - already frozen where it was built, and already narrowed to five loads,
    // so the projection has nothing to add and nothing to withhold.
    entityLoaders: requestGraph.entityLoaders,
    // Forwarded UNCHANGED for the same reason as the loaders above: it was built per request,
    // closes over that request's account and executor, and publishes two closed yes/no members.
    priceGroupEntitlements: requestGraph.priceGroupEntitlements,
    roundingRuleService: requestGraph.roundingRuleService,
    brandService: requestGraph.brandService,
    optionService: requestGraph.optionService,
    skuService: requestGraph.skuService,
    productService: requestGraph.productService,
    priceGroupService: requestGraph.priceResolution,
    promotionService: requestGraph.promotionQueries,
    currencyConverter: requestGraph.currencyConverter,
    // The port and its criteria are projected under one condition, and it is the graph's own -
    // `requestGraph.feedCriteria` is already `undefined` for a request that carried no host.
    productFeedPort:
      requestGraph.feedCriteria === undefined ? undefined : requestGraph.productFeedPort,
    feedCriteria: requestGraph.feedCriteria,
    materializeOrderView: requestGraph.materializeOrderView,
    getSalePriceDetailsForProductSkus: requestGraph.getSalePriceDetailsForProductSkus,
    updateOrderAmountsWithPriceGroupsThenPromotions:
      requestGraph.updateOrderAmountsWithPriceGroupsThenPromotions,
    prepareAddressZoneEvaluation: requestGraph.prepareAddressZoneEvaluation,
  });
}

/**
 * Reconcile the product-save payload with the SKU-creation payload.
 *
 * `SkuCreationCollaborator.createSkus` declares `ProductSaveInput`, whose `price` and `listPrice`
 * are `Money`; `SkuService.createSkus` declares `CreateSkusInput`, whose `price` and `listPrice`
 * are the DECIMAL NUMERALS the legacy struct carried.
 *
 * @param data The product-save payload the product tier hands over.
 * @param optionLoader This root's option loader.
 */
async function toCreateSkusInput(
  data: ProductSaveInput,
  optionLoader: SqlOptionEntityLoader,
): Promise<CreateSkusInput> {
  const optionIDList = data.options;

  // De-duplicated because `resolveOptionByID` matches by identifier rather than by position, so
  // one entity per DISTINCT identifier is exactly what it needs.
  //
  // de-duplicated identifiers are collected first, loaded together, then walked in their original
  // first-appearance order to build `resolvedOptions`.
  const resolvedOptions: Option[] = [];

  if (optionIDList !== undefined && optionIDList.length > 0) {
    const requestedOptionIDs: string[] = [];
    const seenOptionIDs = new Set<string>();

    for (const optionID of listToArray(optionIDList)) {
      const foldedOptionID = foldIdentifier(optionID);

      if (seenOptionIDs.has(foldedOptionID)) {
        continue;
      }

      seenOptionIDs.add(foldedOptionID);
      requestedOptionIDs.push(optionID);
    }

    const optionsByFoldedID = await optionLoader.getOptionsByID(requestedOptionIDs);

    for (const optionID of requestedOptionIDs) {
      const option = optionsByFoldedID.get(foldIdentifier(optionID));

      // Absent stays absent. `SkuService.resolveOptionByID` is the thing that raises for an
      // identifier the payload named and the schema does not carry, at the exact legacy locator;
      // skipping here is what lets it.
      if (option !== undefined) {
        resolvedOptions.push(option);
      }
    }
  }

  if (data.price === undefined) {
    // LEGACY-NOTE [model/service/SkuService.cfc:L93]: `arguments.data.price` is read with no
    // `structKeyExists` guard - at [model/service/SkuService.cfc:L93],
    // [model/service/SkuService.cfc:L129], [model/service/SkuService.cfc:L156],
    // [model/service/SkuService.cfc:L157], [model/service/SkuService.cfc:L183] and
    // [model/service/SkuService.cfc:L193] - so an absent price raised in CFML.
    throw new CompositionDataError(
      'SKU creation was asked for without a price. [model/service/ProductService.cfc:L133] ' +
        'reads it unguarded from the default SKU, and [model/service/SkuService.cfc:L93] ' +
        'reads it unguarded again, so a missing price raised in the legacy as well. No ' +
        'default is substituted.',
    );
  }

  return {
    price: data.price.toDecimalString(),
    listPrice: data.listPrice === undefined ? undefined : data.listPrice.toDecimalString(),
    options: optionIDList,
    resolvedOptions,
  };
}

// Section 7b - wire-document hydration.

/**
 * Load every product the document names, once each, keyed by case-folded identifier.
 *
 * @throws {@link OrderViewDocumentDataError} naming the MEMBER PATH of the first order item whose
 * product the catalogue does not carry.
 */
async function loadDocumentProducts(
  document: OrderViewDocument,
  productSetLoader: ProductSetLoader,
): Promise<ReadonlyMap<string, Product>> {
  // One read for every distinct product, not one read each.
  const requestedProductIDs: string[] = [];
  const seenFoldedProductIDs = new Set<string>();

  for (const item of document.orderItems) {
    const foldedProductID = foldIdentifier(item.productID);

    if (seenFoldedProductIDs.has(foldedProductID)) {
      continue;
    }

    seenFoldedProductIDs.add(foldedProductID);
    requestedProductIDs.push(item.productID);
  }

  const loadedByFoldedID = await productSetLoader.getProductsByProductID(requestedProductIDs);
  const productsByFoldedID = new Map<string, Product>();

  // INDEXED, so a refusal can name `order.orderItems.<i>.productID` rather than merely saying that
  // some product did not resolve.
  for (const [itemIndex, item] of document.orderItems.entries()) {
    const foldedProductID = foldIdentifier(item.productID);
    const product = loadedByFoldedID.get(foldedProductID);

    if (product === undefined) {
      // Refused, never skipped.
      throw new OrderViewDocumentDataError([
        {
          path: `${ORDER_ITEMS_DOCUMENT_PATH}.${String(itemIndex)}.productID`,
          message: 'does not name a product this request can price',
        },
      ]);
    }

    productsByFoldedID.set(foldedProductID, product);
  }

  return productsByFoldedID;
}

/**
 * The key under which one product's SKU is filed, and under which one order item looks its SKU up.
 *
 * Both halves arrive already folded, and this function does not fold them again.
 *
 * @param foldedProductID the case-folded identifier of the product the SKU hangs off.
 * @param foldedSkuID the case-folded identifier of the SKU itself.
 * @returns the composite map key.
 */
function documentSkuKey(foldedProductID: string, foldedSkuID: string): string {
  return `${foldedProductID}\u0000${foldedSkuID}`;
}

/**
 * Resolve every SKU the document names, keyed by case-folded identifier.
 *
 * Reached through `getProductSkus(product, true)`, which is the one ported read that wires a sku's
 * `product` association through.
 *
 * @throws {@link OrderViewDocumentDataError} naming the MEMBER PATH of the first order item whose
 * SKU the named product does not carry.
 */
async function loadDocumentSkus(
  document: OrderViewDocument,
  productsByFoldedID: ReadonlyMap<string, Product>,
  skuSetLoader: SkuSetLoader,
): Promise<ReadonlyMap<string, Sku>> {
  // Reviews land on this loop from opposite directions and both fixes are here.
  const skusByProductAndSkuID = new Map<string, Sku>();
  const skusByProduct = await skuSetLoader.getProductSkusForProducts(
    [...productsByFoldedID.values()],
    true,
  );

  for (const [foldedProductID, productSkus] of skusByProduct) {
    for (const sku of productSkus) {
      skusByProductAndSkuID.set(
        documentSkuKey(foldedProductID, foldIdentifier(sku.getSkuID())),
        sku,
      );
    }
  }

  const resolved = new Map<string, Sku>();

  for (const [itemIndex, item] of document.orderItems.entries()) {
    // Looked up by the item's own pair, so a SKU that exists elsewhere in the document is not a
    // SKU this item may name.
    const sku = skusByProductAndSkuID.get(
      documentSkuKey(foldIdentifier(item.productID), foldIdentifier(item.skuID)),
    );

    if (sku === undefined) {
      // The SKU is not among the SKUs of the product the caller named it under.
      throw new OrderViewDocumentDataError([
        {
          path: `${ORDER_ITEMS_DOCUMENT_PATH}.${String(itemIndex)}.skuID`,
          message: 'does not name a sku carried by the product named on the same order item',
        },
        {
          path: `${ORDER_ITEMS_DOCUMENT_PATH}.${String(itemIndex)}.productID`,
          message: 'names a product that does not carry the sku named on the same order item',
        },
      ]);
    }

    resolved.set(foldIdentifier(item.skuID), sku);
  }

  return resolved;
}

/**
 * Resolve every applied price group the document names, in one KEYED READ.
 *
 * The same set loader, keyed the same case-folded way, that `projectPriceGroupIntents` uses - so
 * two order items naming one price group receive the same INSTANCE.
 *
 * @throws {@link OrderViewDocumentDataError} naming the MEMBER PATH of every order item whose
 * applied price group the schema does not carry.
 */
async function loadDocumentPriceGroups(
  document: OrderViewDocument,
  priceGroupSetLoader: PriceGroupSetLoader,
): Promise<ReadonlyMap<string, PriceGroup>> {
  const requested = [
    ...new Set(
      document.orderItems.flatMap((item) =>
        item.appliedPriceGroupID === null ? [] : [item.appliedPriceGroupID],
      ),
    ),
  ];

  if (requested.length === 0) {
    return new Map<string, PriceGroup>();
  }

  const priceGroupsByFoldedID = await priceGroupSetLoader.getPriceGroupsByID(requested);

  const unresolvedFields: OrderViewDocumentFieldIssue[] = [];

  // The paths are recovered from the document rather than from `requested`, because `requested` is
  // a de-duplicated set and a caller needs the array positions it actually sent.
  for (const [itemIndex, item] of document.orderItems.entries()) {
    const appliedPriceGroupID = item.appliedPriceGroupID;

    if (
      appliedPriceGroupID === null ||
      priceGroupsByFoldedID.has(foldIdentifier(appliedPriceGroupID))
    ) {
      continue;
    }

    // Refused rather than dropped, for the reason `projectPriceGroupIntents` states about its own
    // identical refusal: dropping it would move the L241 discriminator to the other arm and change
    // the discount.
    unresolvedFields.push({
      path: `${ORDER_ITEMS_DOCUMENT_PATH}.${String(itemIndex)}.appliedPriceGroupID`,
      message: 'does not name a price group this request can price against',
    });
  }

  if (unresolvedFields.length > 0) {
    throw new OrderViewDocumentDataError(unresolvedFields);
  }

  return priceGroupsByFoldedID;
}

/**
 * Mint one applied-promotion view from its wire form.
 */
function materializeAppliedPromotion(document: AppliedPromotionDocument): AppliedPromotionView {
  return {
    promotionAppliedID: document.promotionAppliedID,
    discountAmount:
      document.discountAmount === null
        ? undefined
        : Money.fromDecimalString(document.discountAmount),
    promotion:
      document.promotion === null ? undefined : { promotionID: document.promotion.promotionID },
  };
}

/**
 * Build the read-only order view the two passes consume from the caller's projection.
 *
 * Every entity is LOADED, every value object is MINTED through its own constructor, and every
 * absence the document states as `null` becomes the `undefined` the views state it as.
 *
 * @param document the caller-authored order document to materialize.
 * @param productSetLoader loads every named product in one statement.
 * @param skuSetLoader loads every named SKU in one statement.
 * @param priceGroupSetLoader loads every named price group in one statement.
 * @param establishedAccountID the account THIS REQUEST proved, from `RequestScopeInput.accountID`.
 * @throws `CompositionDataError` when a named product, SKU or price group cannot be loaded.
 */
async function materializeOrderViewDocument(
  document: OrderViewDocument,
  productSetLoader: ProductSetLoader,
  skuSetLoader: SkuSetLoader,
  priceGroupSetLoader: PriceGroupSetLoader,
  establishedAccountID: string | undefined,
): Promise<OrderView> {
  // Three set-based loads, one per entity kind. Each takes the whole distinct set the
  // document names; none loops a singular read.
  const productsByFoldedID = await loadDocumentProducts(document, productSetLoader);
  const skusByFoldedID = await loadDocumentSkus(document, productsByFoldedID, skuSetLoader);
  const priceGroupsByFoldedID = await loadDocumentPriceGroups(document, priceGroupSetLoader);

  const orderItems: OrderItemView[] = document.orderItems.map((item): OrderItemView => {
    const sku = skusByFoldedID.get(foldIdentifier(item.skuID));

    if (sku === undefined) {
      // Unreachable: `loadDocumentSkus` resolved every item or threw. Stated as a refusal so the
      // compiler never needs a non-null assertion here.
      throw new CompositionDataError(
        `sku "${item.skuID}" was resolved but is missing from the hydration map`,
      );
    }

    const appliedPriceGroup =
      item.appliedPriceGroupID === null
        ? undefined
        : priceGroupsByFoldedID.get(foldIdentifier(item.appliedPriceGroupID));

    if (item.appliedPriceGroupID !== null && appliedPriceGroup === undefined) {
      // Likewise unreachable: `loadDocumentPriceGroups` resolved every named group or threw.
      throw new CompositionDataError(
        `price group "${item.appliedPriceGroupID}" was resolved but is missing from the ` +
          'hydration map',
      );
    }

    return {
      orderItemID: item.orderItemID,
      sku,
      quantity: item.quantity,
      // All four monetary members, each minted from the document's own decimal numeral.
      price: Money.fromDecimalString(item.price),
      skuPrice: Money.fromDecimalString(item.skuPrice),
      extendedPrice: Money.fromDecimalString(item.extendedPrice),
      extendedSkuPrice: Money.fromDecimalString(item.extendedSkuPrice),
      appliedPriceGroup,
      orderItemType: { systemCode: item.orderItemType.systemCode },
      orderFulfillmentID: item.orderFulfillmentID,
      appliedPromotions: item.appliedPromotions.map(materializeAppliedPromotion),
    };
  });

  const orderFulfillments: readonly OrderFulfillmentView[] = document.orderFulfillments.map(
    (fulfillment): OrderFulfillmentView => ({
      orderFulfillmentID: fulfillment.orderFulfillmentID,
      fulfillmentCharge: Money.fromDecimalString(fulfillment.fulfillmentCharge),
      fulfillmentMethod: {
        fulfillmentMethodID: fulfillment.fulfillmentMethod.fulfillmentMethodID,
        fulfillmentMethodType: fulfillment.fulfillmentMethod.fulfillmentMethodType,
      },
      shippingMethod:
        fulfillment.shippingMethod === null
          ? undefined
          : { shippingMethodID: fulfillment.shippingMethod.shippingMethodID },
      appliedPromotions: fulfillment.appliedPromotions.map(materializeAppliedPromotion),
      totalShippingWeight: fulfillment.totalShippingWeight,
      // The four comparison members keep their stated absences as `undefined`, which the zone
      // evaluator SKIPS [model/service/AddressService.cfc:L63, L66, L69, L72].
      address:
        fulfillment.address === null
          ? undefined
          : {
              postalCode: fulfillment.address.postalCode ?? undefined,
              city: fulfillment.address.city ?? undefined,
              stateCode: fulfillment.address.stateCode ?? undefined,
              countryCode: fulfillment.address.countryCode ?? undefined,
              isNew: fulfillment.address.isNew,
            },
    }),
  );

  return {
    orderID: document.orderID,
    orderItems,
    orderFulfillments,
    appliedPromotions: document.appliedPromotions.map(materializeAppliedPromotion),
    totalSaleQuantity: document.totalSaleQuantity,
    subtotal: Money.fromDecimalString(document.subtotal),
    orderType: { systemCode: document.orderType.systemCode },
    // `??` rather than a test on `establishedAccountID`, because both absences are `null` or
    // `undefined` and the precedence is what matters: a stated account WINS here.
    accountID: document.accountID ?? establishedAccountID,
    subtotalAfterItemDiscounts: Money.fromDecimalString(document.subtotalAfterItemDiscounts),
    promotionCodeList: document.promotionCodeList,
    fulfillmentChargeAfterDiscountTotal: Money.fromDecimalString(
      document.fulfillmentChargeAfterDiscountTotal,
    ),
    currencyCode: toCurrencyCode(document.currencyCode),
  };
}

// Section 8 - the composed pricing operation.
//
// The corollary that makes the ordering unconditional: `getAppliedPriceGroup()` is read at L241 in
// the branch condition itself, so the obligation holds whichever arm executes.

async function updateOrderAmountsWithPriceGroupsThenPromotions(
  priceGroupService: PriceGroupService,
  promotionService: PromotionService,
  priceGroupSetLoader: PriceGroupSetLoader,
  addressZoneLocations: AddressZoneLocationSource,
  order: OrderView,
): Promise<OrderPricingResult> {
  // The promotion pass reaches a synchronous zone predicate, so the deferred index must be ready
  // before either pricing pass begins.
  await addressZoneLocations.load();

  // PASS one. Emits intents rather than mutating an order aggregate, because the order aggregate
  // is out of scope - that inversion is the anti-corruption seam.
  const priceGroupIntents = await priceGroupService.updateOrderAmountsWithPriceGroups(order);

  // The projection step that stands in for the legacy L370/L371 in-place writes. Without it, pass
  // two would read the pre-pass-one order and the L241 discriminator would take the wrong arm.
  const pricedOrder = await projectPriceGroupIntents(order, priceGroupIntents, priceGroupSetLoader);

  // PASS two, over the projected order.
  const promotionIntents = await promotionService.updateOrderAmountsWithPromotions(pricedOrder);

  return { priceGroupIntents, promotionIntents, pricedOrder };
}

/**
 * Apply pass one's intents to a fresh read-only order view for pass two.
 *
 * What is REWRITTEN, and why each is exactly what the legacy wrote: `price` ← the intent's price,
 * standing in for `setPrice(...)` [model/service/PriceGroupService.cfc:L370].
 *
 * `skuPrice` and `extendedSkuPrice`, which are the UNDISCOUNTED baseline the L249/L252 arm
 * measures against.
 */
async function projectPriceGroupIntents(
  order: OrderView,
  intents: readonly PriceGroupAppliedIntent[],
  priceGroupSetLoader: PriceGroupSetLoader,
): Promise<OrderView> {
  if (intents.length === 0) {
    // Pass one wrote nothing, which is the L369 conditional declining for every item - a NORMAL
    // outcome, not a failure, and the L241 `isNull(...)` arm is what pass two will then take.
    return order;
  }

  // Keyed by the opaque `orderItemID`, which is the only handle the anti-corruption boundary
  // carries into the out-of-scope aggregate.
  const intentsByOrderItemID = new Map<string, PriceGroupAppliedIntent>();

  for (const intent of intents) {
    intentsByOrderItemID.set(intent.orderItemID, intent);
  }

  // Resolve each distinct price group once, in one read.
  //
  // The loader keys its answer by identifier, so two intents naming one price group receive the
  // same INSTANCE.
  const requestedPriceGroupIDs = [...intentsByOrderItemID.values()].map(
    (intent) => intent.priceGroupID,
  );

  // Keyed by CASE-FOLDED identifier, matching the loader's own key, because CFML identifiers are
  // case-insensitive and the intent's spelling need not match the stored row's.
  const priceGroupsByFoldedID =
    await priceGroupSetLoader.getPriceGroupsByID(requestedPriceGroupIDs);

  for (const priceGroupID of requestedPriceGroupIDs) {
    if (priceGroupsByFoldedID.has(foldIdentifier(priceGroupID))) {
      continue;
    }

    // The legacy L369 conditional tested `isObject(priceGroupDetails.priceGroup)` before writing,
    // so a non-object never reached `setAppliedPriceGroup`.
    //
    // Refused here, before any item is projected, so the refusal does not depend on whether an
    // order item happens to reference the unloadable group.
    throw new CompositionDataError(
      `price group "${priceGroupID}" named by a price-group intent could not be loaded`,
    );
  }

  const projectedOrderItems: OrderItemView[] = order.orderItems.map((orderItem): OrderItemView => {
    const intent = intentsByOrderItemID.get(orderItem.orderItemID);

    if (intent === undefined) {
      return orderItem;
    }

    const appliedPriceGroup = priceGroupsByFoldedID.get(foldIdentifier(intent.priceGroupID));

    if (appliedPriceGroup === undefined) {
      // Unreachable: every distinct identifier was resolved above or threw. Stated as a refusal so
      // the compiler never needs an assertion.
      throw new CompositionDataError(
        `price group "${intent.priceGroupID}" was resolved but is missing from the projection map`,
      );
    }

    return {
      ...orderItem,
      price: intent.price,
      // [model/entity/OrderItem.cfc:L200] - derived, never stored, so a changed price necessarily
      // changes it.
      extendedPrice: intent.price.times(orderItem.quantity),
      appliedPriceGroup,
    };
  });

  // [model/entity/Order.cfc:L686-L699] re-derived over the projected items, exactly as the live
  // graph would derive it for the next reader.
  const projectedSubtotal = computeProjectedOrderSubtotal(projectedOrderItems);

  // [model/entity/Order.cfc:L700-L702] `getSubtotal() - getItemDiscountAmountTotal()`, with the
  // subtrahend recovered from the caller's own consistent pair; see the note above for why that
  // recovery is exact.
  const itemDiscountAmountTotal = order.subtotal.minus(order.subtotalAfterItemDiscounts);

  return {
    ...order,
    orderItems: projectedOrderItems,
    subtotal: projectedSubtotal,
    subtotalAfterItemDiscounts: projectedSubtotal.minus(itemDiscountAmountTotal),
  };
}

/**
 * `Order.getSubtotal()` re-derived over projected order items.
 *
 * [model/entity/Order.cfc:L686-L699] is a SIGNED sum: an `oitSale` item adds its extended price,
 * an `oitReturn` item subtracts it.
 *
 * CFML parity [model/entity/Order.cfc:L689, L691]: the type-code comparisons are CFML `==` on
 * strings and therefore CASE-INSENSITIVE, so they are routed through the case-folding helper
 * rather than through `===`.
 */
function computeProjectedOrderSubtotal(orderItems: readonly OrderItemView[]): Money {
  let subtotal = Money.zero;

  for (const orderItem of orderItems) {
    const typeCode = orderItem.orderItemType.systemCode;
    if (cfEquals(typeCode, 'oitSale')) {
      subtotal = subtotal.plus(orderItem.extendedPrice);
      continue;
    }
    if (cfEquals(typeCode, 'oitReturn')) {
      subtotal = subtotal.minus(orderItem.extendedPrice);
      continue;
    }

    // [model/entity/Order.cfc:L693-L694] the legacy `throw()`.
    throw new CompositionDataError(
      'there was an issue calculating the subtotal because of a orderItemType associated with one ' +
        `of the items. Reproduces model/entity/Order.cfc:L694 for orderItemID ` +
        `"${orderItem.orderItemID}" carrying orderItemType systemCode "${typeCode}".`,
    );
  }

  return subtotal;
}
