// slatwall-ts - product / product-type / brand test data.
//
// A single deterministic factory returning one fully-formed `SwProduct` aggregate - the product
// itself, its eagerly-joined `SwBrand`.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigns `productData` without
// `var`, leaking it into component `variables` scope. The same omission appears at
// [meta/tests/unit/IssuesTest.cfc:L51].
//
// ANNOTATION LEGEND, used verbatim throughout: `//
// LEGACY-DEFECT:...` followed by `//
// ` - data that exists only because a legacy defect is being preserved. - the one exception is a documented DELIBERATE DIVERGENCE, which keeps the `LEGACY-DEFECT`
// marker but closes without that trailer.

import { Brand } from '../../src/domain/entities/brand.js';
import { Product } from '../../src/domain/entities/product.js';
import { ProductType } from '../../src/domain/entities/productType.js';
import { buildIdPathList } from '../../src/domain/valueObjects/materializedIdPath.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { listToArray } from '../../src/lib/cfml/list.js';

import type { Category } from '../../src/domain/entities/category.js';
import type { Option } from '../../src/domain/entities/option.js';
import type { OptionGroup } from '../../src/domain/entities/optionGroup.js';
import type { ProductHydrationInput } from '../../src/domain/entities/product.js';
import type { Sku } from '../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
  ProductSearchMatches,
  ProductSearchWindow,
} from '../../src/domain/ports/productRepository.js';
import type { OptionRepository, SelectOption } from '../../src/domain/ports/optionRepository.js';
import type { SettingKey, SettingsProvider } from '../../src/domain/ports/settingsProvider.js';
import type { SkuRepository } from '../../src/domain/ports/skuRepository.js';
import type { CfBooleanInput } from '../../src/lib/cfml/truthiness.js';

// Structurally derived types.
//
// JUDGMENT CALL: four types this graph needs are declared in modules that are not among this
// fixture's declared dependencies - the promotion-reward, promotion-qualifier and price-group-rate
// entities.

/**
 * Element type of any array or readonly array.
 */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The promotion-reward entity, as seen through the product hydration surface.
 *
 * `promotionRewards` is the many-to-many through `SwPromoRewardProduct`
 * [model/entity/Product.cfc:L84], and `promotionRewardExclusions` its mirror through
 * `SwPromoRewardExclProduct` [model/entity/Product.cfc:L85].
 */
type PromotionRewardRef = ElementOf<NonNullable<ProductHydrationInput['promotionRewards']>>;

/**
 * The promotion-qualifier entity, as seen through the product hydration surface.
 */
type PromotionQualifierRef = ElementOf<NonNullable<ProductHydrationInput['promotionQualifiers']>>;

/**
 * The price-group-rate entity, as seen through the product hydration surface.
 *
 * CFML parity [model/entity/Product.cfc:L88]: `priceGroupRates` links through
 * `SwPriceGroupRateProduct` and is the inverse of [model/entity/PriceGroupRate.cfc:L72].
 */
type PriceGroupRateRef = ElementOf<NonNullable<ProductHydrationInput['priceGroupRates']>>;

/**
 * The sale-price detail map, keyed by `skuID`, exactly as the entity accepts it.
 *
 * CFML parity [model/entity/Product.cfc:L517-L521]: the legacy computed this by reaching
 * `promotionService` through the service locator.
 */
type SalePriceDetailsMap = NonNullable<ProductHydrationInput['salePriceDetailsForSkus']>;

// Every member is `readonly x?: T | undefined` deliberately.

interface ProductFixtureOverrides {
  /**
   * Seeds every identifier this factory derives, so two graphs in one suite can be told apart.
   */
  readonly idPrefix?: string | undefined;

  /**
   * [model/entity/Product.cfc:L52] `unsavedvalue="" default=""`.
   *
   * Default `''`, which is what makes `isNew()` honest and keeps the four cases inherited from
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] expressible.
   */
  readonly productID?: string | undefined;

  /**
   * [model/entity/Product.cfc:L53] `ormtype="boolean"` with no `default=`.
   */
  readonly activeFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L54] `ormtype="string" unique="true"`.
   *
   * Default `'nike-air-jorden'` - see `LEGACY_PRODUCT_URL_TITLE` for why the misspelling is
   * load-bearing.
   */
  readonly urlTitle?: string | undefined;

  /**
   * [model/entity/Product.cfc:L55] `ormtype="string" notNull="true"`.
   */
  readonly productName?: string | undefined;

  /**
   * [model/entity/Product.cfc:L56] `ormtype="string" unique="true"`.
   */
  readonly productCode?: string | undefined;

  /**
   * [model/entity/Product.cfc:L57] `length="4000" hb_formFieldType="wysiwyg"`.
   */
  readonly productDescription?: string | undefined;

  /**
   * [model/entity/Product.cfc:L58] `ormtype="boolean" default="false"`.
   */
  readonly publishedFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L59] `ormtype="integer"`. Not money.
   */
  readonly sortOrder?: number | undefined;

  /**
   * [model/entity/Product.cfc:L62] `ormtype="big_decimal"` - monetary.
   */
  readonly calculatedSalePrice?: Money | undefined;

  /**
   * [model/entity/Product.cfc:L63] `ormtype="integer"`. A quantity, not money.
   */
  readonly calculatedQATS?: number | undefined;

  /**
   * [model/entity/Product.cfc:L64] `ormtype="boolean"` with no `default=`.
   */
  readonly calculatedAllowBackorderFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L65] `ormtype="string"`. The persisted snapshot of `getTitle()`.
   */
  readonly calculatedTitle?: string | undefined;

  /**
   * [model/entity/Product.cfc:L118] `persistent="false"` - the non-column price slot.
   *
   * Default `Money` from `LEGACY_PRODUCT_PRICE`, the legacy helper's `price = 100` expressed as a
   * decimal string.
   */
  readonly price?: Money | undefined;

  /**
   * [model/entity/Product.cfc:L68] `fetch="join"` - eager, and nullable via
   * `hb_optionsNullRBKey="define.none"`.
   *
   * Default: a `Brand` built by this factory, so the brand-PRESENT path through `getBrandName()`
   * is the default.
   */
  readonly brand?: Brand | undefined;

  /**
   * [model/entity/Product.cfc:L69] `fetch="join"` - eager.
   */
  readonly productType?: ProductType | undefined;

  /**
   * [model/entity/Product.cfc:L70] `fetch="join" cascade="delete"` - eager and nullable.
   */
  readonly defaultSku?: Sku | undefined;

  /**
   * [model/entity/Product.cfc:L73] `cascade="all-delete-orphan" inverse="true"`.
   *
   * CFML parity [model/entity/Product.cfc:L73]: the source spells `singularname="Sku"` with a
   * CAPITAL S - the generated helpers are therefore `addSku`/`removeSku`, and the port declares
   * them with exactly that casing.
   *
   * JUDGMENT CALL: supplying a sku here from a sibling fixture is the caller's job, never this
   * module's. Importing `skuFixtures` would close the product/sku cycle the `[]` default exists to
   * break.
   */
  readonly skus?: Sku[] | undefined;

  /**
   * [model/entity/Product.cfc:L80] many-to-many through `SwProductCategory`.
   */
  readonly categories?: readonly Category[] | undefined;

  /**
   * [model/entity/Product.cfc:L81] self-referential many-to-many over `SwRelatedProduct`.
   */
  readonly relatedProducts?: readonly Product[] | undefined;

  /**
   * [model/entity/Product.cfc:L84] `SwPromoRewardProduct`. Default `[]`, fresh per call.
   */
  readonly promotionRewards?: PromotionRewardRef[] | undefined;

  /**
   * [model/entity/Product.cfc:L85] `SwPromoRewardExclProduct`. Default `[]`, fresh per call.
   */
  readonly promotionRewardExclusions?: PromotionRewardRef[] | undefined;

  /**
   * [model/entity/Product.cfc:L86] `SwPromoQualProduct`. Default `[]`, fresh per call.
   */
  readonly promotionQualifiers?: PromotionQualifierRef[] | undefined;

  /**
   * [model/entity/Product.cfc:L87] `SwPromoQualExclProduct`. Default `[]`, fresh per call.
   */
  readonly promotionQualifierExclusions?: PromotionQualifierRef[] | undefined;

  /**
   * [model/entity/Product.cfc:L88] `SwPriceGroupRateProduct`. Default `[]`, fresh per call.
   */
  readonly priceGroupRates?: PriceGroupRateRef[] | undefined;

  /**
   * The option groups reachable through this product's skus' options.
   *
   * Default `[]`, and that is a fidelity decision rather than a convenience.
   *
   * The "never materialized" state remains reachable, and it matters: the port refuses
   * `getOptionGroups()` outright when the slot is unset.
   */
  readonly optionGroups?: readonly OptionGroup[] | undefined;

  /**
   * Sale-price details keyed by `skuID`, already reduced and already rounded.
   */
  readonly salePriceDetailsForSkus?: SalePriceDetailsMap | undefined;

  /**
   * `max(SwOptionGroup.sortOrder) + 1` across all option groups - a GLOBAL aggregate
   * [model/dao/SkuDAO.cfc:L204-L220], not derivable from one product's graph.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L222-L226]: the legacy cached this on the DAO component and
   * its `clearNextOptionGroupSortOrder` guard is INVERTED - it deletes the key only when the key
   * does not exist - so the cache could never be cleared.
   */
  readonly nextOptionGroupSortOrder?: number | undefined;

  /**
   * [model/entity/Product.cfc:L93] `ormtype="string"`. Default `REMOTE_ID`.
   */
  readonly remoteID?: string | undefined;

  /**
   * [model/entity/Brand.cfc:L56] the brand's common name.
   */
  readonly brandName?: string | undefined;

  /**
   * The value the settings double answers for `globalURLKeyProduct`.
   */
  readonly globalURLKeyProduct?: string | undefined;

  /**
   * The candidate skus the sku-repository double matches against.
   */
  readonly selectedOptionsCandidateSkus?: readonly Sku[] | undefined;

  /**
   * Resolves the four published settings keys.
   */
  readonly settingsProvider?: SettingsProvider | undefined;

  /**
   * The already-resolved `productTitleString` template `getTitle()` renders at
   * [model/entity/Product.cfc:L542].
   *
   * Default `'${brand.brandName} ${productName}'`, the verified legacy default at
   * [model/service/SettingService.cfc:L193].
   */
  readonly productTitleString?: string | undefined;

  /**
   * Discharges the [model/entity/Product.cfc:L367] and [model/entity/Product.cfc:L626] reaches.
   *
   * Default: the hand-written double from `makeFixtureSkuRepository`, whose
   * `getSkusBySelectedOptions` reproduces the AND-of-EXISTS matching semantics.
   */
  readonly skuRepository?: SkuRepository | undefined;

  /**
   * Discharges the [model/entity/Product.cfc:L637] and [model/entity/Product.cfc:L644] reaches.
   */
  readonly optionRepository?: OptionRepository | undefined;

  /**
   * Discharges the one ported attribute path, `getAttributeSets`
   * [model/entity/Product.cfc:L832-L838].
   */
  readonly productRepository?: ProductRepository | undefined;
}

/**
 * Seeds every derived identifier.
 */
const DEFAULT_ID_PREFIX = 'prfx';

/**
 * [meta/tests/unit/Helper.cfc:L54] `productName = "Test Product"`, verbatim.
 */
const LEGACY_PRODUCT_NAME = 'Test Product';

/**
 * [meta/tests/unit/Helper.cfc:L56] `productCode = "TESTPRODUCTXXX"`, verbatim.
 */
const LEGACY_PRODUCT_CODE = 'TESTPRODUCTXXX';

/**
 * [meta/tests/unit/Helper.cfc:L55] `price = 100`, expressed as a decimal string.
 */
const LEGACY_PRODUCT_PRICE = '100.00';

/**
 * CFML parity [meta/tests/unit/entity/ProductTest.cfc:L59, L61]: the misspelling of "jordan" is
 * verbatim and must not be corrected.
 */
const LEGACY_PRODUCT_URL_TITLE = 'nike-air-jorden';

/**
 * [meta/tests/unit/Helper.cfc:L57]
 * `productType = { productTypeID = "444df2f7ea9c87e60051f3cd87b435a1" }`.
 */
const LEGACY_MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The verified legacy default of `globalURLKeyProduct` [model/service/SettingService.cfc:L178] -
 * `{fieldType="text",defaultValue="sp"}`.
 *
 * It is answered by the settings DOUBLE and never spliced into a URL literal anywhere:
 * `getProductURL()` reads it through the port.
 */
const GLOBAL_URL_KEY_PRODUCT = 'sp';

/**
 * The verified legacy default of `globalURLKeyProductType`
 * [model/service/SettingService.cfc:L179].
 */
const GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * The default template a fixture product renders its title from.
 *
 * `productTitleString` [model/service/SettingService.cfc:L193] is the verified legacy default, and
 * it is a TEMPLATE rather than a title.
 */
const PRODUCT_TITLE_STRING = '${brand.brandName} ${productName}';

/**
 * The verified legacy default of `skuCurrency` [model/service/SettingService.cfc:L221] -
 * `defaultValue="USD"`.
 */
const SKU_CURRENCY = 'USD';

/**
 * What the double answers for `skuEligibleCurrencies`.
 *
 * CFML parity [model/service/SettingService.cfc:L222]: this key's legacy default is not a literal
 * it is `getCurrencyService().getAllActiveCurrencyIDList()`, computed at runtime from the
 * active-currency table.
 */
const SKU_ELIGIBLE_CURRENCIES = SKU_CURRENCY;

/**
 * Plain text, well inside the 4000-character column at [model/entity/Product.cfc:L57].
 */
const PRODUCT_DESCRIPTION = 'A deterministic merchandise product used by the unit tier.';

/**
 * [model/entity/Product.cfc:L65] the persisted snapshot column.
 *
 * Deliberately DIFFERENT from `LEGACY_PRODUCT_NAME`, so a suite can prove the column is read
 * rather than recomputed from the name.
 */
const CALCULATED_TITLE = 'Test Product (calculated title snapshot)';

/**
 * [model/entity/Product.cfc:L62] `ormtype="big_decimal"`, as a decimal string.
 *
 * JUDGMENT CALL: the figure is the extended price of the project's pre-verified reference
 * calculation - a unit price of 19.99 at quantity 3 - so a suite pinning that arithmetic can start
 * from a fixture value instead of a bare literal.
 */
const CALCULATED_SALE_PRICE = '59.97';

/**
 * [model/entity/Product.cfc:L63] a quantity count, never money.
 */
const CALCULATED_QATS = 7;

/**
 * [model/entity/Product.cfc:L59] `ormtype="integer"`, never money.
 */
const SORT_ORDER = 1;

/**
 * [model/entity/Product.cfc:L93] the remote-system correlation id.
 */
const REMOTE_ID = 'remote-test-product';

/**
 * The global option-group radix [model/dao/SkuDAO.cfc:L204-L220].
 *
 * Seeded high enough that a two-group product weights cleanly, and supplied so the sorted
 * `getSkus(true)` path is computable rather than silently degrading.
 */
const NEXT_OPTION_GROUP_SORT_ORDER = 3;

/**
 * [model/entity/Brand.cfc:L56] the brand's common name.
 */
const BRAND_NAME = 'Test Brand';

/**
 * [model/entity/Brand.cfc:L55] `unique="true"`, used in URL strings.
 */
const BRAND_URL_TITLE = 'test-brand';

/**
 * [model/entity/ProductType.cfc:L57] the child type's display name.
 */
const CHILD_PRODUCT_TYPE_NAME = 'Merchandise';

/**
 * [model/entity/ProductType.cfc:L57] the root type's display name.
 */
const PARENT_PRODUCT_TYPE_NAME = 'Product';

/**
 * [model/entity/ProductType.cfc:L59] `systemCode` on the child type.
 */
const CHILD_PRODUCT_TYPE_SYSTEM_CODE = 'merchandise';

/**
 * [model/entity/ProductType.cfc:L59] `systemCode` on the root type.
 */
const PARENT_PRODUCT_TYPE_SYSTEM_CODE = 'product';

/**
 * Audit timestamps, as explicit UTC ISO-8601 literals.
 *
 * No clock is read anywhere in this module: the runner pins the process timezone to UTC, and a
 * relative date would make an assertion depend on the day it ran.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * Reads one override, distinguishing an OMITTED key from a key present with the value `undefined`.
 */
function resolveOverride<TKey extends keyof ProductFixtureOverrides>(
  overrides: ProductFixtureOverrides | undefined,
  key: TKey,
  documentedDefault: ProductFixtureOverrides[TKey],
): ProductFixtureOverrides[TKey] {
  if (hasOverride(overrides, key)) {
    return overrides?.[key];
  }
  return documentedDefault;
}

/**
 * Was `key` written by the caller at all, whatever value it carries?
 *
 * The companion to `resolveOverride`, used at the four sites whose default has to be CONSTRUCTED
 * rather than named - the brand, the product-type chain and the collaborator doubles.
 */
function hasOverride(
  overrides: ProductFixtureOverrides | undefined,
  key: keyof ProductFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// Module-scope pure builders.

/**
 * The audit columns every entity in one graph carries.
 */
type AuditTrail = {
  readonly createdDateTime: Date;
  readonly createdByAccountID: string;
  readonly modifiedDateTime: Date;
  readonly modifiedByAccountID: string;
};

/**
 * Fresh `Date` instances per graph: a `Date` is mutable, so it is never shared.
 */
function makeAuditTrail(idPrefix: string): AuditTrail {
  return {
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: `${idPrefix}-account-created`,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: `${idPrefix}-account-modified`,
  };
}

/**
 * A hand-written in-memory stand-in for the settings port.
 *
 * CFML parity [model/entity/Product.cfc:L208, L212]: the legacy read
 * `setting('globalURLKeyProduct')` through the framework's ambient settings mechanism.
 *
 * All four published keys are answered, not just the one this entity reads, so the double
 * satisfies the port's total contract: `setting` is declared to return `string` and never
 * `undefined`.
 */
function makeFixtureSettingsProvider(globalURLKeyProduct: string): SettingsProvider {
  // The table is the published union, exactly.
  const table: Readonly<Record<SettingKey, string>> = {
    globalURLKeyProduct,
    globalURLKeyProductType: GLOBAL_URL_KEY_PRODUCT_TYPE,
    skuCurrency: SKU_CURRENCY,
    skuEligibleCurrencies: SKU_ELIGIBLE_CURRENCIES,
  };

  return {
    setting(settingName: SettingKey): string {
      return table[settingName];
    },
  };
}

/**
 * Does one candidate sku carry the option named by `selectedOptionID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L107-L128]: the legacy predicate is an `EXISTS` subquery whose
 * comparison is `SwOption.optionID` against a `cfqueryparam` value.
 */
function skuCarriesOptionID(candidate: Sku, selectedOptionID: string): boolean {
  const wanted: string = selectedOptionID.toLowerCase();

  return candidate
    .getOptions()
    .some((option: Option): boolean => option.getOptionID().toLowerCase() === wanted);
}

/**
 * A hand-written in-memory stand-in for the sku repository port.
 *
 * `getSkusBySelectedOptions` is the fixture side of a must-preserve behaviour.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L107-L128]: with an EMPTY option list the statement carries no
 * `EXISTS` clause at all and returns every sku of the product.
 */
function makeFixtureSkuRepository(candidateSkus: readonly Sku[]): SkuRepository {
  // A defensive snapshot taken here, inside the call. The caller keeps ownership of its own array
  // and a later mutation of it cannot reach into this graph.
  const candidates: readonly Sku[] = [...candidateSkus];

  return {
    getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
      void productID;
      void skuID;

      // [model/dao/SkuDAO.cfc:L53] counts order-item rows.
      return Promise.resolve(false);
    },

    getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
      const wanted: string = skuCode.toLowerCase();
      // Case-insensitive for the same collation reason recorded on `skuCarriesOptionID`; the
      // legacy compares `SwSku.skuCode` in SQL.
      return Promise.resolve(
        candidates.find(
          (candidate: Sku): boolean => (candidate.getSkuCode() ?? '').toLowerCase() === wanted,
        ),
      );
    },

    getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
      void productID;

      const selectedOptionIDs: readonly string[] = listToArray(selectedOptions);

      return Promise.resolve(
        candidates.filter((candidate: Sku): boolean =>
          selectedOptionIDs.every((selectedOptionID: string): boolean =>
            skuCarriesOptionID(candidate, selectedOptionID),
          ),
        ),
      );
    },

    searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
      void term;
      void productTypeID;

      return Promise.resolve([]);
    },

    getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
      void fetchOptions;

      // The unflagged accessor returns the product's own live array; this projection is a NEW
      // array, matching [model/entity/Product.cfc:L159], which returns the service's result rather
      // than the field.
      return Promise.resolve([...product.getSkus()]);
    },

    getSortedProductSkusID(productID: string): Promise<string[]> {
      void productID;

      return Promise.resolve(candidates.map((candidate: Sku): string => candidate.getSkuID()));
    },

    saveSku(sku: Sku): Promise<Sku> {
      // No persistence: the instance is handed straight back, which is the only part of the legacy
      // save a fixture can honour without a database.
      return Promise.resolve(sku);
    },
  };
}

/**
 * A hand-written in-memory stand-in for the option repository port.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L51-L117]: both queries answer what the product does not
 * already carry - the first matched with `IN` over the existing group list, the second with
 * `NOT IN`, which is the opposite direction.
 */
function makeFixtureOptionRepository(): OptionRepository {
  return {
    getUnusedProductOptions(
      productID: string,
      existingOptionGroupIDList: string,
    ): Promise<readonly SelectOption[]> {
      void productID;
      void existingOptionGroupIDList;

      return Promise.resolve([]);
    },

    getUnusedProductOptionGroups(
      existingOptionGroupIDList: string,
    ): Promise<readonly SelectOption[]> {
      void existingOptionGroupIDList;

      return Promise.resolve([]);
    },
  };
}

/**
 * A hand-written in-memory stand-in for the product repository port.
 *
 * Only one attribute path is ported - `getAttributeSets` [model/entity/Product.cfc:L832-L838],
 * backed by [model/dao/ProductDAO.cfc:L52] - and the wider EAV read path is out of scope.
 */
function makeFixtureProductRepository(): ProductRepository {
  return {
    getAttributeSets(
      attributeSetTypeCode: readonly string[],
      productTypeIDs: readonly string[],
    ): Promise<AttributeSetSummary[]> {
      void attributeSetTypeCode;
      void productTypeIDs;

      return Promise.resolve([]);
    },

    loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void> {
      void fileURL;
      void textQualifier;

      return Promise.reject(
        new Error(
          'productFixtures: loadDataFromFile is deliberately not available. The legacy bulk ' +
            'import [model/service/ProductService.cfc:L65-L68] is out of scope for this slice, ' +
            'so no fixture answers it. Supply your own productRepository through overrides if a ' +
            'suite genuinely needs to observe this call.',
        ),
      );
    },

    searchProductsByProductType(
      term?: string,
      productTypeIDs?: string,
      window?: ProductSearchWindow,
    ): Promise<ProductSearchMatches> {
      void term;
      void productTypeIDs;
      // The window is accepted and unused: the double holds no store, so there is nothing to
      // window. Declaring it keeps the double honest about the port's shape rather than narrowing
      // it.
      void window;

      return Promise.resolve({ records: [], matchedCount: 0 });
    },

    getProductByProductID(productID: string): Promise<Product | undefined> {
      void productID;

      // The double holds no store, so nothing can be found by identity. A suite that needs a
      // lookup to succeed supplies its own port.
      return Promise.resolve(undefined);
    },

    saveProduct(product: Product): Promise<Product> {
      // Nothing is persisted and nothing is flushed - the two mechanisms the legacy helper used
      // and this fixture drops. The instance comes straight back, which is the observable part of
      // a save a fixture can honour.
      return Promise.resolve(product);
    },

    deleteProduct(product: Product): Promise<boolean> {
      void product;

      // Nothing was persisted, so nothing can be deleted, and the port declares a `boolean`.
      // `false` is the answer that claims least.
      return Promise.resolve(false);
    },

    // No `saveBrand` member, because the port publishes none.
  };
}

// The materialized product-type path.

/**
 * One link of the identifier chain the path builder walks.
 *
 * JUDGMENT CALL: the path is built over this tiny local shape rather than over the `ProductType`
 * instances themselves, because a product type needs its path at construction and cannot supply
 * its own parent chain before it exists.
 */
type IdPathNode = {
  readonly productTypeID: string;
  readonly parent: IdPathNode | undefined;
};

/**
 * The primary-id accessor the path builder requires.
 */
function readIdPathNodeID(node: IdPathNode): string {
  return node.productTypeID;
}

/**
 * The parent accessor the path builder requires.
 */
function readIdPathNodeParent(node: IdPathNode): IdPathNode | undefined {
  return node.parent;
}

/**
 * Builds the eagerly-joined brand [model/entity/Product.cfc:L68].
 *
 * CFML parity [model/entity/Brand.cfc:L53-L54]: neither `activeFlag` NOR `publishedFlag` declares
 * a `default=`, so both are left unset and both accessors answer `false` through `cfBoolean()` -
 * the CFML answer for an undefaulted flag, not an invented `true`.
 *
 * CFML parity [model/entity/Brand.cfc:L90-L103]: the source's own helpers are asymmetric in two
 * ways worth recording, and neither is normalised here.
 *
 * CFML parity [model/entity/Brand.cfc:L57]: `brandWebsite` carries `hb_formatType="url"`, which is
 * presentation metadata on a plain string.
 */
function makeFixtureBrand(idPrefix: string, brandName: string | undefined): Brand {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  return new Brand({
    brandID: '',
    activeFlag: undefined,
    publishedFlag: undefined,
    urlTitle: BRAND_URL_TITLE,
    brandName,
    brandWebsite: undefined,
    products: [],
    promotionRewards: [],
    promotionRewardExclusions: [],
    promotionQualifiers: [],
    promotionQualifierExclusions: [],
    remoteID: `${idPrefix}-brand`,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
  });
}

/**
 * Builds a two-level product-type chain and returns its CHILD.
 *
 * CFML parity [model/entity/ProductType.cfc:L53]: `productTypeIDPath` is the materialized path the
 * promotion engine walks, `length="4000"`.
 *
 * CFML parity [model/entity/ProductType.cfc:L54-L55]: neither flag declares a `default=` here -
 * unlike `Product.publishedFlag`, which does [model/entity/Product.cfc:L58] - so the fixture must
 * set both explicitly rather than rely on a default.
 */
function makeFixtureProductTypeChain(idPrefix: string): ProductType {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const parentProductTypeID = `${idPrefix}-producttype-parent`;
  const childProductTypeID = LEGACY_MERCHANDISE_PRODUCT_TYPE_ID;

  const parentIdPathNode: IdPathNode = {
    productTypeID: parentProductTypeID,
    parent: undefined,
  };
  const childIdPathNode: IdPathNode = {
    productTypeID: childProductTypeID,
    parent: parentIdPathNode,
  };

  const parentProductTypeIDPath: string = buildIdPathList(
    parentIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const childProductTypeIDPath: string = buildIdPathList(
    childIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );

  const parentProductType = new ProductType({
    productTypeID: parentProductTypeID,
    productTypeIDPath: parentProductTypeIDPath,
    activeFlag: undefined,
    publishedFlag: undefined,
    urlTitle: 'product',
    productTypeName: PARENT_PRODUCT_TYPE_NAME,
    productTypeDescription: 'The root product type of the fixture chain.',
    systemCode: PARENT_PRODUCT_TYPE_SYSTEM_CODE,
    parentProductType: undefined,
    childProductTypes: [],
    products: [],
    promotionRewards: [],
    promotionRewardExclusions: [],
    promotionQualifiers: [],
    promotionQualifierExclusions: [],
    priceGroupRates: [],
    priceGroupRateExclusions: [],
    remoteID: `${idPrefix}-producttype-parent-remote`,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    productTypeRepository: undefined,
  });

  const childProductType = new ProductType({
    productTypeID: childProductTypeID,
    productTypeIDPath: childProductTypeIDPath,
    activeFlag: undefined,
    publishedFlag: undefined,
    urlTitle: 'merchandise',
    productTypeName: CHILD_PRODUCT_TYPE_NAME,
    productTypeDescription: 'The merchandise product type the legacy helper referenced.',
    systemCode: CHILD_PRODUCT_TYPE_SYSTEM_CODE,
    parentProductType: undefined,
    childProductTypes: [],
    products: [],
    promotionRewards: [],
    promotionRewardExclusions: [],
    promotionQualifiers: [],
    promotionQualifierExclusions: [],
    priceGroupRates: [],
    priceGroupRateExclusions: [],
    remoteID: `${idPrefix}-producttype-child-remote`,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    productTypeRepository: undefined,
  });

  // Wires both directions once, through the entity's own helper.
  parentProductType.addChildProductType(childProductType);

  return childProductType;
}

/**
 * Builds one deterministic merchandise `Product`, fully formed and independent.
 *
 * LEGACY-DEFECT [model/entity/Product.cfc:L524-L532]: `getBrandName()` seeds its memo with `""`
 * and then returns the brand's real name without storing it, so the method answers correctly
 * exactly once and `""` forever after.
 * Preserved deliberately; do not fix without a product decision.
 *
 * CFML parity [model/entity/Product.cfc:L207-L212]: `getProductURL()` and `getListingProductURL()`
 * differ by EXACTLY one CHARACTER - the leading slash - and both keep the trailing one, so the
 * fixture's URL-key value has to be usable by both.
 *
 * JUDGMENT CALL: the sibling price-group fixture is not imported, so this product carries no
 * price-group state and a caller that needs one composes the two fixtures itself.
 *
 * @param overrides the only axis of variation.
 * @returns one fully-formed product, disposable by dropping the reference.
 */
export function makeProductFixture(overrides?: ProductFixtureOverrides): Product {
  // `??` where the default is simply a value and absence carries no distinct meaning;
  // `resolveOverride` where an explicit `undefined` must survive as absence; and no operator at
  // all on the three boolean columns.

  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;
  const productID: string = overrides?.productID ?? '';

  // No `??` and no `resolveOverride`: an absent key and an explicit `undefined` both mean the
  // undefaulted column.
  const activeFlag: CfBooleanInput = overrides?.activeFlag;
  const publishedFlag: CfBooleanInput = overrides?.publishedFlag;
  const calculatedAllowBackorderFlag: CfBooleanInput = resolveOverride(
    overrides,
    'calculatedAllowBackorderFlag',
    false,
  );

  const urlTitle: string | undefined = resolveOverride(
    overrides,
    'urlTitle',
    LEGACY_PRODUCT_URL_TITLE,
  );
  const productName: string | undefined = resolveOverride(
    overrides,
    'productName',
    LEGACY_PRODUCT_NAME,
  );
  const productCode: string | undefined = resolveOverride(
    overrides,
    'productCode',
    LEGACY_PRODUCT_CODE,
  );
  const productDescription: string | undefined = resolveOverride(
    overrides,
    'productDescription',
    PRODUCT_DESCRIPTION,
  );
  const calculatedTitle: string | undefined = resolveOverride(
    overrides,
    'calculatedTitle',
    CALCULATED_TITLE,
  );
  const remoteID: string | undefined = resolveOverride(overrides, 'remoteID', REMOTE_ID);
  const sortOrder: number | undefined = resolveOverride(overrides, 'sortOrder', SORT_ORDER);
  const calculatedQATS: number | undefined = resolveOverride(
    overrides,
    'calculatedQATS',
    CALCULATED_QATS,
  );
  const nextOptionGroupSortOrder: number | undefined = resolveOverride(
    overrides,
    'nextOptionGroupSortOrder',
    NEXT_OPTION_GROUP_SORT_ORDER,
  );

  // Both monetary slots are built from decimal strings.
  const price: Money | undefined = resolveOverride(
    overrides,
    'price',
    Money.fromDecimalString(LEGACY_PRODUCT_PRICE),
  );
  const calculatedSalePrice: Money | undefined = resolveOverride(
    overrides,
    'calculatedSalePrice',
    Money.fromDecimalString(CALCULATED_SALE_PRICE),
  );

  const brandName: string | undefined = resolveOverride(overrides, 'brandName', BRAND_NAME);
  const globalURLKeyProduct: string = overrides?.globalURLKeyProduct ?? GLOBAL_URL_KEY_PRODUCT;
  const selectedOptionsCandidateSkus: readonly Sku[] =
    overrides?.selectedOptionsCandidateSkus ?? [];

  // Each default is CONSTRUCTED, so `hasOverride` separates "omitted" from "explicitly absent"
  // without building an object the graph would discard.

  const brand: Brand | undefined = hasOverride(overrides, 'brand')
    ? overrides?.brand
    : makeFixtureBrand(idPrefix, brandName);

  const productType: ProductType | undefined = hasOverride(overrides, 'productType')
    ? overrides?.productType
    : makeFixtureProductTypeChain(idPrefix);

  // Absent by default. Its absence is load-bearing - see the DEFECT annotations above - so there
  // is nothing to construct and no `hasOverride` to perform.
  const defaultSku: Sku | undefined = overrides?.defaultSku;

  const settingsProvider: SettingsProvider | undefined = hasOverride(overrides, 'settingsProvider')
    ? overrides?.settingsProvider
    : makeFixtureSettingsProvider(globalURLKeyProduct);

  // The RESOLVED TEMPLATE, exactly as `src/handlers/bootstrap.ts` reads it once out of the
  // settings table and hands the string to the product it hydrates.
  const productTitleTemplate: string | undefined = hasOverride(overrides, 'productTitleString')
    ? overrides?.productTitleString
    : PRODUCT_TITLE_STRING;

  const skuRepository: SkuRepository | undefined = hasOverride(overrides, 'skuRepository')
    ? overrides?.skuRepository
    : makeFixtureSkuRepository(selectedOptionsCandidateSkus);

  const optionRepository: OptionRepository | undefined = hasOverride(overrides, 'optionRepository')
    ? overrides?.optionRepository
    : makeFixtureOptionRepository();

  const productRepository: ProductRepository | undefined = hasOverride(
    overrides,
    'productRepository',
  )
    ? overrides?.productRepository
    : makeFixtureProductRepository();

  // First, isolation: the unflagged `getSkus()` returns `variables.skus` ITSELF, uncopied
  // [model/entity/Product.cfc:L157].
  //
  // Second,
  // CFML parity [model/service/PriceGroupService.cfc:L276, L282]: CFML copies arrays by VALUE on
  // assignment, so the legacy `var priceGroups = account.getPriceGroups();` followed by
  // `arrayAppend` left the account's own collection untouched.

  const skus: Sku[] = [...(overrides?.skus ?? [])];
  const categories: readonly Category[] = [...(overrides?.categories ?? [])];
  const relatedProducts: readonly Product[] = [...(overrides?.relatedProducts ?? [])];
  const promotionRewards: PromotionRewardRef[] = [...(overrides?.promotionRewards ?? [])];
  const promotionRewardExclusions: PromotionRewardRef[] = [
    ...(overrides?.promotionRewardExclusions ?? []),
  ];
  const promotionQualifiers: PromotionQualifierRef[] = [...(overrides?.promotionQualifiers ?? [])];
  const promotionQualifierExclusions: PromotionQualifierRef[] = [
    ...(overrides?.promotionQualifierExclusions ?? []),
  ];
  const priceGroupRates: PriceGroupRateRef[] = [...(overrides?.priceGroupRates ?? [])];

  // Materialized as EMPTY by default - the accurate answer for a product with no skus, since the
  // legacy smart list joins through them - and left UNSET only when the caller explicitly writes
  // `undefined`.
  const suppliedOptionGroups: readonly OptionGroup[] | undefined = resolveOverride(
    overrides,
    'optionGroups',
    [],
  );
  const optionGroups: readonly OptionGroup[] | undefined =
    suppliedOptionGroups === undefined ? undefined : [...suppliedOptionGroups];

  // A shallow copy of caller-owned read-only data. The map is keyed by `skuID` and is only ever
  // read by `getSkuSalePriceDetails`; copying keeps a later caller-side mutation out of this
  // graph.
  const suppliedSalePriceDetails: SalePriceDetailsMap | undefined =
    overrides?.salePriceDetailsForSkus;
  const salePriceDetailsForSkus: SalePriceDetailsMap | undefined =
    suppliedSalePriceDetails === undefined ? undefined : { ...suppliedSalePriceDetails };

  const audit: AuditTrail = makeAuditTrail(idPrefix);

  // Every OPTIONAL member is written through a conditional spread rather than assigned a
  // possibly-`undefined` value.

  const hydrationInput: ProductHydrationInput = {
    productID,

    // Always present, always owned by this graph.
    skus,
    categories,
    relatedProducts,
    promotionRewards,
    promotionRewardExclusions,
    promotionQualifiers,
    promotionQualifierExclusions,
    priceGroupRates,

    // The audit columns [model/entity/Product.cfc:L96-L99]; the two account keys are inert opaque
    // identifiers for an out-of-scope entity.
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,

    // The three booleans [model/entity/Product.cfc:L53, L58, L64].
    ...(activeFlag === undefined ? {} : { activeFlag }),
    ...(publishedFlag === undefined ? {} : { publishedFlag }),
    ...(calculatedAllowBackorderFlag === undefined ? {} : { calculatedAllowBackorderFlag }),

    // The scalar columns [model/entity/Product.cfc:L54-L57, L59, L93].
    ...(urlTitle === undefined ? {} : { urlTitle }),
    ...(productName === undefined ? {} : { productName }),
    ...(productCode === undefined ? {} : { productCode }),
    ...(productDescription === undefined ? {} : { productDescription }),
    ...(sortOrder === undefined ? {} : { sortOrder }),
    ...(remoteID === undefined ? {} : { remoteID }),

    // The four persisted denormalized cache columns [model/entity/Product.cfc:L62-L65]. All four
    // are present for schema continuity, and only the first is money.
    ...(calculatedSalePrice === undefined ? {} : { calculatedSalePrice }),
    ...(calculatedQATS === undefined ? {} : { calculatedQATS }),
    ...(calculatedTitle === undefined ? {} : { calculatedTitle }),

    // The three eager many-to-ones [model/entity/Product.cfc:L68-L70].
    ...(brand === undefined ? {} : { brand }),
    ...(productType === undefined ? {} : { productType }),
    ...(defaultSku === undefined ? {} : { defaultSku }),

    // The non-persistent slots.
    ...(price === undefined ? {} : { price }),
    ...(optionGroups === undefined ? {} : { optionGroups }),
    ...(salePriceDetailsForSkus === undefined ? {} : { salePriceDetailsForSkus }),
    ...(nextOptionGroupSortOrder === undefined ? {} : { nextOptionGroupSortOrder }),

    // The five wired ports. The sixth, `subscriptionTermProvider`, is deliberately never supplied
    // see the judgment call above.
    ...(settingsProvider === undefined ? {} : { settingsProvider }),
    ...(productTitleTemplate === undefined ? {} : { productTitleTemplate }),
    ...(skuRepository === undefined ? {} : { skuRepository }),
    ...(optionRepository === undefined ? {} : { optionRepository }),
    ...(productRepository === undefined ? {} : { productRepository }),
  };

  return new Product(hydrationInput);
}
