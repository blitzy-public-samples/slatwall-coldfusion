/**
 * Boundary port for the platform-configuration reads made by the extracted Catalog slice.
 * Type-only: it declares a contract and imports nothing, so it emits no runtime code.
 *
 * Legacy origin (reference only; the CFML tree is never modified — AAP §0.4.1.1 / TR-6):
 * Model/entity/HibachiEntity.cfc:L128-L131 — `setting`, the one accessor every in-scope entity
 * reads configuration through. Its body delegates to `settingService.getSettingValue(...)`
 * passing `object=this`, which is what makes resolution per-object rather than global; see the
 * resolution context block below.
 * Model/service/SettingService.cfc:L443 — `getSettingValue(...)`, the effective-value engine that
 * `setting` delegates to. Out of scope: AAP §0.2.2.1 excludes the `setting*.cfc` family, and
 * that exclusion is precisely why this port exists.
 */

/* The eighteen names — how the closed union was derived (AAP §0.8.2 Guideline 6). */

/** The sixteen literal setting names the catalog slice reads. */
export type CatalogSettingName =
  | 'globalURLKeyProduct'
  | 'productDisplayTemplate'
  /**
   * Model/entity/Product.cfc:L224 (`getAlternateImageDirectory`),
   * model/entity/Option.cfc:L82 (`getImageDirectory`),
   * model/service/ProductService.cfc:L200, L201, L240 — the three service reads take the
   * no-entity receiver form described in the resolution context block below.
   */
  | 'globalAssetsImageFolderPath'
  | 'productTitleString'
  | 'skuAllowBackorderFlag'
  | 'productImageOptionCodeDelimiter'
  | 'productImageDefaultExtension'
  | 'imageAltString'
  | 'imageMissingImagePath'
  /**
   * Model/entity/Sku.cfc:L362 (`getCurrencyCode`), L385, L418, L422, L425
   * (`getCurrencyDetails`) — five reads, the most of any single name in the slice.
   */
  | 'skuCurrency'
  | 'skuEligibleCurrencies'
  /**
   * Model/entity/Sku.cfc:L452 (`getEligibleFulfillmentMethods`). The only one of the eighteen
   * with seeded rows: config/dbdata/SlatwallSetting.xml.cfm:L14-L16.
   */
  | 'skuEligibleFulfillmentMethods'
  | 'globalDateFormat'
  | 'skuShippingWeight'
  | 'skuShippingWeightUnitCode'
  | 'productAutoApproveReviewsFlag';

/*
 * The two interpolated forms — and why the size segment stays open.
 *
 * TODO(parity): the two methods that build these names disagree about what the size segment can
 * contain, and the disagreement is carried across rather than repaired (AAP §0.7.3 —
 * preserve and annotate; this file claims no AAP §0.7.3 exception, the only declared one in the plan
 * being D18, which belongs to src/adapters/mysql/MySqlProductRepository.ts).
 */

/** A `productImage<size>Width` setting name. */
export type ProductImageWidthSettingName = `productImage${string}Width`;

/** A `productImage<size>Height` setting name. */
export type ProductImageHeightSettingName = `productImage${string}Height`;

/**
 * The interpolated pair, which IR-2 names as a single form. Declared as a type in its own right
 * because the image-sizing consumers read the two together, always adjacently
 * [model/entity/Sku.cfc:L184-L185, L212-L213].
 */
export type ProductImageDimensionSettingName =
  ProductImageWidthSettingName | ProductImageHeightSettingName;

/**
 * Every setting name the Catalog slice may ask for: the 16 literals of {@link CatalogSettingName}
 * plus the 2 interpolated forms of {@link ProductImageDimensionSettingName}. 16 + 2 = 18, which
 * is the count IR-2 states.
 */
export type SettingName = CatalogSettingName | ProductImageDimensionSettingName;

/*
 * The resolved value — why one normalised shape, and where the coercion went
 * (AAP §0.8.2 Guideline 6; AAP §0.7.3 permits "`string` with the coercion documented").
 */

/** The resolved effective value of a setting, in its normalised text shape. */
export type SettingValue = string;

/*
 * Resolution context — AAP §0.7.3 decision (AAP §0.7.3, AAP §0.8.2 Guideline 6).
 *
 * TODO(boundary): the hierarchical resolution algorithm is deliberately absent from this file. It
 * lives in the out-of-scope collaborator `model/service/SettingService.cfc`, which AAP §0.2.2.1
 * excludes along with the rest of the `Setting*.cfc` family, and it is substantial:
 * - The lookup order is declared as data at model/service/SettingService.cfc:L102-L112, keyed by
 * the resolving object's class name — `sku` walks to `product.productID`, then to the
 * product's product-type path combined with its brand, then to the product-type path alone
 * [L104]; `product` walks to its product-type path with brand, then to the path alone [L105].
 */

/** The kinds of object the slice resolves settings against. */
export type SettingResolutionEntityName = 'Product' | 'Sku' | 'Option';

/**
 * Identifies the object a setting is resolved against — the port's stand-in for the legacy
 * `object=this` argument at model/entity/HibachiEntity.cfc:L130.
 */
export interface SettingResolutionContext {
  readonly entityName: SettingResolutionEntityName;
  /**
   * That object's primary identifier — the counterpart of `getPrimaryIDValue()`
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which the legacy schema stores as a 32-character
   * string (IR-6).
   */
  readonly entityId: string;
}

/*
 * This port is declared synchronous, and that is mismatch M8's only consequence for the slice: the
 * excluded setting service launches an out-of-band `cfthread` (AAP §0.6.6 M8), so no caller here may
 * depend on background completion. Sibling ports that perform a genuine database read —
 * {@link AccessContentPort}, {@link SubscriptionTermPort} — are asynchronous for the opposite reason;
 * The two must not be harmonised.
 */

/*
 * Members deliberately not ported — the omission is annotated rather than filled with an invented
 * surface (AAP §0.7.3).
 */

/**
 * The contract through which the Catalog slice reads platform configuration.
 * @example
 * ```ts
 * const urlKey = settings.setting('globalURLKeyProduct');
 * ```
 */
export interface SettingResolverPort {
  /**
   * Resolves the effective value of one setting.
   *
   * @param settingName One of the eighteen names the slice reads: a {@link CatalogSettingName} or
   * one of the interpolated {@link ProductImageDimensionSettingName} forms. Closed on purpose,
   * so an out-of-slice name or a typo is a compile error rather than a silent runtime miss.
   */
  setting(settingName: SettingName, context?: SettingResolutionContext): SettingValue;
}

/**
 * The same contract in callable form, for consumers that want a resolver function rather than an
 * object with one method.
 */
export type SettingResolver = (
  settingName: SettingName,
  context?: SettingResolutionContext,
) => SettingValue;
