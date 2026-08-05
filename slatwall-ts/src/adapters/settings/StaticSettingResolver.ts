/**
 * Static setting-resolution adapter — the in-scope implementation of
 * `src/ports/SettingResolverPort.ts` for the extracted Slatwall Catalog slice.
 *
 * It answers the eighteen configuration names the slice reads, from the metadata defaults declared in
 * the legacy source, with no input/output of any kind: no database read, no `SwSetting` query, no
 * filesystem access, no network call, no environment variable and no clock. Every value it returns is a
 * compile-time constant transcribed from a legacy declaration, and each value whose transcription
 * required a judgment carries that declaration's `path:Lnnn` locator inline.
 *
 * Legacy origins (reference only; the CFML tree is never modified — AAP §0.4.1.1 / TR-6):
 * - Config/dbdata/SlatwallSetting.xml.cfm — the `SwSetting` seed document, and the reason this adapter
 * can be static at all. See the seed data below.
 * - Model/service/SettingService.cfc — the out-of-scope effective-value engine. Its per-name metadata
 * block (opening above L150 and closing at L269) is the source of every default reproduced here, and
 * `getSettingDetails` at L468-L600 is the source of the resolution order reproduced here.
 * AAP §0.2.2.1 excludes the whole `setting*` family.
 */

import {
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE,
  type BaseProductType,
} from '../../domain/BaseProductType';
import { ConfigurationError } from '../../errors/DomainError';
import type {
  CatalogSettingName,
  ProductImageDimensionSettingName,
  SettingName,
  SettingResolutionContext,
  SettingResolverPort,
  SettingValue,
} from '../../ports/SettingResolverPort';

/*
 * The seed data — what is actually in `SwSetting`, and what is not
 * (config/dbdata/SlatwallSetting.xml.cfm, 98 lines, read in full)
 */

/* The resolution order — default first, row overrides. This is the file's design justification. */

/*
 * Carried, not repaired — the observations this file owns (AAP §0.7.3 / AAP §0.7.3, §0.8.2 Guideline 4)
 *
 */

/**
 * The twelve names whose effective value is a literal `defaultValue` declared in the legacy
 * metadata struct, transcribed character for character from the declaration that produced each.
 */
const METADATA_DEFAULTS = Object.freeze({
  globalDateFormat: 'mmm dd, yyyy',
  globalURLKeyProduct: 'sp',
  /** model/service/SettingService.cfc:L183 — `{fieldType="text", defaultValue=""}`. */
  imageAltString: '',
  /**
   * Model/service/SettingService.cfc:L184 —
   * `{fieldType="text", defaultValue="/assets/images/missingimage.jpg"}`.
   */
  imageMissingImagePath: '/assets/images/missingimage.jpg',
  productImageDefaultExtension: 'jpg',
  productImageOptionCodeDelimiter: '-',
  /**
   * Model/service/SettingService.cfc:L193 —
   * `{fieldType="text", defaultValue="${brand.brandName} ${productName}"}`.
   */
  productTitleString: '${brand.brandName} ${productName}',
  /**
   * Model/service/SettingService.cfc:L198 — `{fieldType="yesno", defaultValue=0}`, an UNQUOTED
   * number in source, carried as text per the TR-1 note above. See also the truthiness warning
   * there: the consumer at model/service/ProductService.cfc:L159 uses it as a boolean.
   */
  productAutoApproveReviewsFlag: '0',
  /**
   * Model/service/SettingService.cfc:L219 — `{fieldType="yesno", defaultValue=0}`, an UNQUOTED
   * number in source, carried as text per the TR-1 note above.
   */
  skuAllowBackorderFlag: '0',
  skuCurrency: 'USD',
  /**
   * Model/service/SettingService.cfc:L232 — `{fieldType="text", defaultValue=1}`, an UNQUOTED
   * number in source, carried as text per the TR-1 note above. Read by the Google product feed at
   * integrationServices/google/views/feed/product.cfm:L58.
   */
  skuShippingWeight: '1',
  /**
   * Model/service/SettingService.cfc:L233 — `{fieldType="select", defaultValue="lb"}`. Read on the
   * same feed line as the weight itself, integrationServices/google/views/feed/product.cfm:L58.
   */
  skuShippingWeightUnitCode: 'lb',
} as const satisfies Readonly<Partial<Record<CatalogSettingName, SettingValue>>>);

type MetadataDefaultedSettingName = keyof typeof METADATA_DEFAULTS;

/** The legacy "nothing found" value, reproduced for the one name that has no declared default. */
const PRODUCT_DISPLAY_TEMPLATE_UNRESOLVED_VALUE: SettingValue = '';

/**
 * The six declared image-dimension defaults — the only locator-backed answers that exist for the
 * two interpolated forms.
 *
 * TODO(parity): these six declarations sit inside a deprecated section of the metadata struct. The
 * comment `// DEPRECATED***` opens at model/service/SettingService.cfc:L246 and the struct does not
 * close until L269, so L261-L266 are enclosed by it — and yet the names are read by live,
 * non-deprecated code at model/entity/Sku.cfc:L184, L185, L212 and L213. (The second of those
 * readers even carries its own `// deprecated size logic` comment at model/entity/Sku.cfc:L202.)
 * The tension is recorded and carried: the defaults are not removed, not modernised, and the names
 * are not marked deprecated in this module's types, because the port does not mark them so
 * (AAP §0.7.3).
 */
const PRODUCT_IMAGE_DIMENSION_DEFAULTS = Object.freeze({
  productImageSmallWidth: '150',
  productImageSmallHeight: '150',
  productImageMediumWidth: '300',
  productImageMediumHeight: '300',
  productImageLargeWidth: '600',
  productImageLargeHeight: '600',
} as const satisfies Readonly<Record<ProductImageDimensionSettingName, SettingValue>>);

type DeclaredProductImageDimensionSettingName = keyof typeof PRODUCT_IMAGE_DIMENSION_DEFAULTS;

/**
 * One seeded `SwSetting` row for `skuEligibleFulfillmentMethods`, reduced to the two columns the row
 * actually populates for this name.
 */
interface SeededProductTypeScopedSetting {
  /**
   * The `productTypeID` the row is scoped to — the `SwSetting.productTypeID` column declared at
   * config/dbdata/SlatwallSetting.xml.cfm:L7.
   */
  readonly productTypeID: string;
  /**
   * The seeded `settingValue` — a single `fulfillmentMethodID`, carried across exactly as stored and
   * never split, wrapped or normalised (see the seed-data note above).
   */
  readonly settingValue: SettingValue;
}

/**
 * The three seeded, product-type-scoped rows for `skuEligibleFulfillmentMethods` — the one name of
 * the eighteen that has any seeded row at all.
 *
 * TODO(boundary): no child product type can be answered, and none is guessed at. A child's
 * `productTypeIDPath` is a multi-element list, so resolving it requires the out-of-scope
 * hierarchical engine — the lookup-order table at model/service/SettingService.cfc:L102-L112 and
 * the walk at L534-L591 — plus a database read to obtain the path in the first place, which
 * execution-model mismatch M8 bars from this synchronous, input/output-free adapter. The gap is
 * flagged per TR-5 rather than filled (AAP §0.2.2.7, IR-2).
 *
 */
export const SEEDED_SKU_ELIGIBLE_FULFILLMENT_METHODS: {
  readonly [Code in BaseProductType]: SeededProductTypeScopedSetting;
} = Object.freeze({
  /**
   * Config/dbdata/SlatwallSetting.xml.cfm:L14 — scoped to the `merchandise` product type
   * [config/dbdata/SlatwallProductType.xml.cfm:L13], resolving to `Shipping`
   * [config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L10].
   */
  merchandise: Object.freeze({
    productTypeID: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.productTypeID,
    settingValue: '444df2fb93d5fa960ba2966ba2017953',
  }),
  /**
   * Config/dbdata/SlatwallSetting.xml.cfm:L15 — scoped to the `subscription` product type
   * [config/dbdata/SlatwallProductType.xml.cfm:L14], resolving to `Auto`
   * [config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L11].
   */
  subscription: Object.freeze({
    productTypeID: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.productTypeID,
    settingValue: '444df2ffeca081dc22f69c807d2bd8fe',
  }),
  /**
   * Config/dbdata/SlatwallSetting.xml.cfm:L16 — scoped to the `contentAccess` product type
   * [config/dbdata/SlatwallProductType.xml.cfm:L15], resolving to `Auto` — the same value as
   * `subscription` above, exactly as seeded [config/dbdata/SlatwallFulfillmentMethod.xml.cfm:L11].
   */
  contentAccess: Object.freeze({
    productTypeID: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.productTypeID,
    settingValue: '444df2ffeca081dc22f69c807d2bd8fe',
  }),
});

/**
 * A legacy setting name that the in-scope slice reads but that the port's public union deliberately
 * does not carry, because the legacy source marks it deprecated.
 */
type DeprecatedSettingName = 'globalImageExtension';

/** Fails the compile unless `T` really is `never`. */
type AssertNever<T extends never> = T;

/**
 * The guard that keeps the public union at eighteen. If a later change adds
 * `globalImageExtension` to `CatalogSettingName`, `Extract` stops being `never`, the constraint on
 * {@link AssertNever} fails, and the compile breaks here — forcing whoever widens the union to decide
 * deliberately instead of ending up with the same name answered from two places. That is the failure
 * mode this whole block exists to prevent, so it is enforced rather than merely requested.
 */
type _DeprecatedNamesStayOutsideThePublicUnion = AssertNever<
  Extract<DeprecatedSettingName, SettingName>
>;

/**
 * The effective values of the deprecated legacy setting names, transcribed from the declaration that
 * produced each — the same treatment {@link METADATA_DEFAULTS} gives the public sixteen, in a
 * separate table because these names are not part of the port's contract.
 */
export const DEPRECATED_SETTING_DEFAULTS: {
  readonly [Name in DeprecatedSettingName]: SettingValue;
} = Object.freeze({
  /**
   * Model/service/SettingService.cfc:L247 — `{fieldType="text", defaultValue="jpg"}`, immediately
   * under the `// DEPRECATED***` marker at `:L246`.
   */
  globalImageExtension: 'jpg',
});

/** Narrows a port-declared name to one this module answers from {@link METADATA_DEFAULTS}. */
function isMetadataDefaultedSettingName(
  settingName: SettingName,
): settingName is MetadataDefaultedSettingName {
  return Object.hasOwn(METADATA_DEFAULTS, settingName);
}

/** Narrows an interpolated name to one of the six that has a declared default. */
function isDeclaredProductImageDimensionSettingName(
  settingName: SettingName,
): settingName is DeclaredProductImageDimensionSettingName {
  return Object.hasOwn(PRODUCT_IMAGE_DIMENSION_DEFAULTS, settingName);
}

/** Renders the resolution context for a diagnostic message. */
function describeResolutionContext(context: SettingResolutionContext | undefined): string {
  if (context === undefined) {
    return 'no resolution context';
  }
  return `${context.entityName} ${context.entityId}`;
}

/** The deployment-supplied values this adapter cannot derive from the legacy source alone. */
export interface StaticSettingResolverConfiguration {
  /**
   * The CFML application scope's `applicationRootMappingPath`, from which
   * `globalAssetsImageFolderPath` is derived exactly as [model/service/SettingService.cfc:L164]
   * derives it.
   */
  readonly applicationRootMappingPath?: string;

  /**
   * The value [model/service/SettingService.cfc:L222] computes as
   * `getCurrencyService().getAllActiveCurrencyIDList()`.
   */
  readonly skuEligibleCurrencies?: string;

  /**
   * The value [model/service/SettingService.cfc:L223] computes as
   * `getFulfillmentService().getAllActiveFulfillmentMethodIDList()`.
   */
  readonly skuEligibleFulfillmentMethods?: string;
}

/**
 * The suffix [model/service/SettingService.cfc:L164] appends to the application root mapping path.
 */
const GLOBAL_ASSETS_IMAGE_FOLDER_SUFFIX = '/custom/assets/images';

/**
 * The static setting-resolution adapter: the in-scope implementation of {@link SettingResolverPort}.
 *
 * @example
 * ```ts
 * // Fifteen of the eighteen names need no configuration at all:
 * Const settings: SettingResolverPort = new StaticSettingResolver;
 * ```
 */
export class StaticSettingResolver implements SettingResolverPort {
  /** The deployment-supplied values; see {@link StaticSettingResolverConfiguration}. */
  private readonly configuration: StaticSettingResolverConfiguration;

  /**
   * Binds the deployment-supplied values, if any.
   *
   * @param configuration - The three run-time-computed legacy defaults this adapter cannot derive from
   * source. Defaults to an empty object, so `new StaticSettingResolver` remains valid for the
   * fifteen names that resolve from frozen literals.
   */
  public constructor(configuration: StaticSettingResolverConfiguration = {}) {
    this.configuration = configuration;
  }

  /**
   * Resolves the effective value of one of the eighteen names the Catalog slice reads.
   *
   * @param settingName One of the port's eighteen names. Closed on purpose, so a typo or an
   * out-of-slice name is a compile error rather than a silent run-time miss.
   */
  public setting(settingName: SettingName, context?: SettingResolutionContext): SettingValue {
    if (isMetadataDefaultedSettingName(settingName)) {
      return METADATA_DEFAULTS[settingName];
    }

    if (isDeclaredProductImageDimensionSettingName(settingName)) {
      return PRODUCT_IMAGE_DIMENSION_DEFAULTS[settingName];
    }

    switch (settingName) {
      case 'productDisplayTemplate':
        // Locator-backed, not fabricated: no `defaultValue` is declared
        // [model/service/SettingService.cfc:L190] and the engine's initialised empty string
        // [L474] therefore survives the default test at [L481]. See the constant's own note.
        return PRODUCT_DISPLAY_TEMPLATE_UNRESOLVED_VALUE;

      case 'globalAssetsImageFolderPath':
        /*
         * — resolved from the deployment-supplied root path. The legacy default is computed at
         * [model/service/SettingService.cfc:L164] as
         * `getApplicationValue('applicationRootMappingPath') & '/custom/assets/images'`, reading the
         * application scope of a running ColdFusion or Railo server. The concatenation is reproduced
         * here exactly — same order, same suffix — with the root path arriving through the
         * constructor instead of the application scope.
         */
        if (this.configuration.applicationRootMappingPath !== undefined) {
          return `${this.configuration.applicationRootMappingPath}${GLOBAL_ASSETS_IMAGE_FOLDER_SUFFIX}`;
        }
        throw new ConfigurationError(
          `Setting 'globalAssetsImageFolderPath' cannot be resolved: its legacy default is computed` +
            ` at model/service/SettingService.cfc:L164 from the CFML application scope, so the` +
            ` deployment must supply 'applicationRootMappingPath' to this resolver (requested for` +
            ` ${describeResolutionContext(context)}).`,
          { context: { settingName, missingConfiguration: 'applicationRootMappingPath' } },
        );

      case 'skuEligibleCurrencies':
        // TODO(boundary): the only declared default is computed at
        // model/service/SettingService.cfc:L222 as
        // `getCurrencyService().getAllActiveCurrencyIDList()`. `currencyService` is out of scope —
        // AAP §0.2.2.1 excludes the `Currency*` family, two files — and reaching it would require a
        // database read that M8 bars. The in-scope readers are model/entity/Sku.cfc:L373 and L375,
        // inside the excluded calculated property `currencyDetails` (AAP §0.2.2.6). No substitute
        // is invented: not an empty string, not an empty list, and not `'USD'` borrowed from the
        // distinct `skuCurrency` default at model/service/SettingService.cfc:L221.
        if (this.configuration.skuEligibleCurrencies !== undefined) {
          return this.configuration.skuEligibleCurrencies;
        }
        throw new ConfigurationError(
          `Setting 'skuEligibleCurrencies' cannot be resolved: its legacy default is computed at` +
            ` model/service/SettingService.cfc:L222 by the out-of-scope currencyService, so the` +
            ` deployment must supply 'skuEligibleCurrencies' to this resolver (requested for` +
            ` ${describeResolutionContext(context)}).`,
          { context: { settingName, missingConfiguration: 'skuEligibleCurrencies' } },
        );

      case 'skuEligibleFulfillmentMethods':
        // TODO(boundary): this is the one name of the eighteen with seeded rows, and it still cannot
        // be answered through this member.
        if (this.configuration.skuEligibleFulfillmentMethods !== undefined) {
          return this.configuration.skuEligibleFulfillmentMethods;
        }
        throw new ConfigurationError(
          `Setting 'skuEligibleFulfillmentMethods' cannot be resolved: its legacy default is computed` +
            ` at model/service/SettingService.cfc:L223 by the out-of-scope fulfillmentService, and` +
            ` its three seeded rows are scoped by productTypeID` +
            ` (config/dbdata/SlatwallSetting.xml.cfm:L14-L16), which a resolution context of` +
            ` ${describeResolutionContext(context)} cannot select among. The deployment must supply` +
            ` 'skuEligibleFulfillmentMethods'; the seeded values are exposed as` +
            ` SEEDED_SKU_ELIGIBLE_FULFILLMENT_METHODS.`,
          { context: { settingName, missingConfiguration: 'skuEligibleFulfillmentMethods' } },
        );

      default:
        // TODO(parity): an interpolated name whose size segment is not one of the three declared
        // sizes. This is reachable in the legacy source, which is exactly why the port leaves the
        // segment open: `getResizedImage` lower-cases the incoming size
        // [model/entity/Sku.cfc:L171, L174] and then maps only "l", "m" and "s"
        // [model/entity/Sku.cfc:L177-L183] with no final `else`, so an unmapped size reaches
        // model/entity/Sku.cfc:L184-L185 unchanged and asks for a name that was never declared. Its
        // sibling `getResizedImagePath` [model/entity/Sku.cfc:L203-L215] does have a final `else`
        throw new ConfigurationError(
          `Setting '${settingName}' has no answer: image dimensions are declared only for` +
            ` the Small, Medium and Large sizes (model/service/SettingService.cfc:L261-L266), and` +
            ` an unmapped size segment reaches model/entity/Sku.cfc:L184-L185 unchanged (requested` +
            ` for ${describeResolutionContext(context)}).`,
          { context: { settingName } },
        );
    }
  }
}
