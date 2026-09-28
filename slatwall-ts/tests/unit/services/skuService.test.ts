// slatwall-ts - unit suite pinning `src/services/skuService.ts`
//
// JUDGMENT CALL: the SHIPPED constructor takes three ports plus one target-side knob and one bag
// of resolved settings, and `SkuService.length` is 3, where this suite was briefed for four.
//
// LEGACY-NOTE [model/service/SkuService.cfc:L54]: the legacy component declares a productService
// DI/1 property that no method ever uses - sweeping all 334 lines for `productService` returns
// exactly one hit and that hit is the L54 declaration.
//
// LEGACY-NOTE [model/dao/SkuDAO.cfc:L163]: the DAO writes `var hql &= "WHERE..."` inside
// `getProductSkus`, a second `var` declaration of a local already declared at
// [model/dao/SkuDAO.cfc:L152] - invalid CFML that only survives because the engine tolerates it.
// price into a float. There is exactly ONE `@ts-expect-error` here and it is not a

import { beforeEach, describe, expect, it } from 'vitest';

import { Option } from '../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../src/domain/entities/optionGroup.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { SkuService } from '../../../src/services/skuService.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

import type { Product } from '../../../src/domain/entities/product.js';
import type { Sku } from '../../../src/domain/entities/sku.js';
import type { ImageStore } from '../../../src/domain/ports/imageStore.js';
import type { OptionRepository, SelectOption } from '../../../src/domain/ports/optionRepository.js';
import type { SkuRepository } from '../../../src/domain/ports/skuRepository.js';
import type {
  SubscriptionBenefitHandle,
  SubscriptionTermHandle,
  SubscriptionTermProvider,
} from '../../../src/domain/ports/subscriptionTermProvider.js';
import type {
  CreateSkusInput,
  ImageUploadResult,
  SkuPage,
  SkuQueryCriteria,
} from '../../../src/services/skuService.js';

// JUDGMENT CALL: every recording array below is typed with `Parameters<...>` read off the shipped
// port instead of with a hand-written record of named fields.

type TransactionExistsFlagArgs = Parameters<SkuRepository['getTransactionExistsFlag']>;

type SkuBySkuCodeArgs = Parameters<SkuRepository['getSkuBySkuCode']>;

type SkusBySelectedOptionsArgs = Parameters<SkuRepository['getSkusBySelectedOptions']>;

type SearchSkusByProductTypeArgs = Parameters<SkuRepository['searchSkusByProductType']>;

type ProductSkusArgs = Parameters<SkuRepository['getProductSkus']>;

type SortedProductSkusIDArgs = Parameters<SkuRepository['getSortedProductSkusID']>;

type SaveSkuArgs = Parameters<SkuRepository['saveSku']>;

type UnusedProductOptionsArgs = Parameters<OptionRepository['getUnusedProductOptions']>;

type UnusedProductOptionGroupsArgs = Parameters<OptionRepository['getUnusedProductOptionGroups']>;

type SaveImageFileArgs = Parameters<ImageStore['saveImageFile']>;

type DeleteImageFileArgs = Parameters<ImageStore['deleteImageFile']>;

type SubscriptionTermArgs = Parameters<SubscriptionTermProvider['getSubscriptionTerm']>;

type SubscriptionBenefitArgs = Parameters<SubscriptionTermProvider['getSubscriptionBenefit']>;

/**
 * The product code `tests/fixtures/productFixtures.ts` gives every product it builds.
 */
const FIXTURE_PRODUCT_CODE = 'TESTPRODUCTXXX';

/**
 * The base price handed to `createSkus`, as a decimal string. Never a float.
 */
const PRICE_DECIMAL = '19.99';

/**
 * A list price that clears the three-clause guard [model/service/SkuService.cfc:L94].
 */
const LIST_PRICE_DECIMAL = '24.99';

/**
 * The raise [model/service/SkuService.cfc:L204] emits, character for character.
 */
const UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE =
  'There was an unexpected error when creating this product';

/**
 * The image extension allow-list [model/service/SkuService.cfc:L212] passes to the image service,
 * verbatim as a comma-delimited list.
 *
 * Preserved character for character: same four extensions, same order, same lower-casing, no
 * leading dot and no whitespace.
 */
const ALLOWED_IMAGE_EXTENSIONS = 'jpg,jpeg,png,gif';

// LEGACY-DEFECT [model/service/SkuService.cfc:L143]: the resource-bundle key for a missing
// subscription-benefits list misspells "benefits" as "benifits". The key is a data contract
// resolved by the legacy admin, so the misspelling is preserved verbatim.
// Preserved deliberately; do not fix without a product decision.
const FIXTURE_SKU_A_ID = 'skfx-sku-a';
const FIXTURE_SKU_B_ID = 'skfx-sku-b';
const FIXTURE_SKU_C_ID = 'skfx-sku-c';
const FIXTURE_SKU_D_ID = 'skfx-sku-d';

/**
 * The product the canonical fixture graph hangs off.
 */
const FIXTURE_PRODUCT_ID = 'skfx-product';

/**
 * The order [model/dao/SkuDAO.cfc:L172-L202] returns for the three OPTIONED members of the
 * canonical graph, written out rather than computed.
 *
 * `10^ceiling * SUM(optionSortOrder * 10^-groupSortOrder)`, so the ORDERING is invariant to
 * `nextOptionGroupSortOrder`: the radix ceiling is a pure scale factor applied to every weight
 * alike.
 */
const FIXTURE_OPTION_GROUP_SORTED_IDS: readonly string[] = [
  FIXTURE_SKU_B_ID,
  FIXTURE_SKU_A_ID,
  FIXTURE_SKU_C_ID,
];

/**
 * Builds an option group with the two columns the cartesian path reads and inert values everywhere
 * else.
 *
 * `sortOrder` is an entity sort ordinal rather than a quantity and no arithmetic is performed on
 * it.
 */
function anOptionGroup(init: {
  readonly optionGroupID: string;
  readonly sortOrder: number;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: init.optionGroupID,
    optionGroupName: init.optionGroupID,
    optionGroupCode: init.optionGroupID,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
    sortOrder: init.sortOrder,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    options: [],
    optionSortTieBreaker: () => 1,
  });
}

/**
 * Builds an option belonging to a group, the only association the cartesian path traverses
 * [model/service/SkuService.cfc:L75-L78].
 *
 * The owning group is REQUIRED here even though the entity allows it to be absent.
 */
function anOption(init: {
  readonly optionID: string;
  readonly sortOrder: number;
  /**
   * Nullable on purpose.
   */
  readonly optionGroup: OptionGroup | undefined;
}): Option {
  return new Option({
    optionID: init.optionID,
    optionCode: init.optionID,
    optionName: init.optionID,
    optionDescription: undefined,
    sortOrder: init.sortOrder,
    optionGroup: init.optionGroup,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/**
 * Builds a product type carrying a system code and nothing else.
 *
 * `getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] answers the system code directly
 * whenever it is present, and only falls back to loading the root of `productTypeIDPath` when it
 * is empty.
 */
function aProductType(init: { readonly productTypeID: string; readonly systemCode: string }) {
  return new ProductType({
    productTypeID: init.productTypeID,
    systemCode: init.systemCode,
  });
}

/**
 * What a {@link RecordingSkuRepository} answers with.
 *
 * Every field is optional and every one is OMITTED by callers that do not need it, never assigned
 * `undefined`.
 */
interface SkuRepositorySeed {
  readonly productSkus?: readonly Sku[];
  readonly sortedProductSkuIDs?: readonly string[];
  readonly searchResults?: readonly Sku[];
  readonly selectedOptionsResults?: readonly Sku[];
  readonly skuBySkuCode?: Sku;
  readonly transactionExistsFlag?: boolean;
}

/**
 * In-memory stand-in for the seven-member SKU data port.
 *
 * Replaces `property name="skuDAO" type="any";` [model/service/SkuService.cfc:L51] - the
 * component's busiest collaborator, live at eight call sites.
 *
 * Implements exactly the port's seven members and no eighth.
 */
class RecordingSkuRepository implements SkuRepository {
  readonly transactionExistsFlagCalls: TransactionExistsFlagArgs[] = [];

  readonly skuBySkuCodeCalls: SkuBySkuCodeArgs[] = [];

  readonly skusBySelectedOptionsCalls: SkusBySelectedOptionsArgs[] = [];

  readonly searchSkusByProductTypeCalls: SearchSkusByProductTypeArgs[] = [];

  readonly productSkusCalls: ProductSkusArgs[] = [];

  readonly sortedProductSkusIDCalls: SortedProductSkusIDArgs[] = [];

  readonly saveSkuCalls: SaveSkuArgs[] = [];

  constructor(private readonly seed: SkuRepositorySeed = {}) {}

  getTransactionExistsFlag(...args: TransactionExistsFlagArgs): Promise<boolean> {
    this.transactionExistsFlagCalls.push(args);

    return Promise.resolve(this.seed.transactionExistsFlag ?? false);
  }

  getSkuBySkuCode(...args: SkuBySkuCodeArgs): Promise<Sku | undefined> {
    this.skuBySkuCodeCalls.push(args);

    return Promise.resolve(this.seed.skuBySkuCode);
  }

  getSkusBySelectedOptions(...args: SkusBySelectedOptionsArgs): Promise<Sku[]> {
    this.skusBySelectedOptionsCalls.push(args);

    return Promise.resolve([...(this.seed.selectedOptionsResults ?? [])]);
  }

  searchSkusByProductType(...args: SearchSkusByProductTypeArgs): Promise<Sku[]> {
    this.searchSkusByProductTypeCalls.push(args);

    return Promise.resolve([...(this.seed.searchResults ?? [])]);
  }

  getProductSkus(...args: ProductSkusArgs): Promise<Sku[]> {
    this.productSkusCalls.push(args);

    return Promise.resolve([...(this.seed.productSkus ?? [])]);
  }

  getSortedProductSkusID(...args: SortedProductSkusIDArgs): Promise<string[]> {
    this.sortedProductSkusIDCalls.push(args);

    return Promise.resolve([...(this.seed.sortedProductSkuIDs ?? [])]);
  }

  saveSku(...args: SaveSkuArgs): Promise<Sku> {
    this.saveSkuCalls.push(args);

    const [sku] = args;

    return Promise.resolve(sku);
  }
}

/**
 * In-memory stand-in for the two-member option port.
 *
 * The shipped `SkuService` does not consume this port, and this double exists to pin that fact
 * rather than to serve a call.
 */
class RecordingOptionRepository implements OptionRepository {
  readonly unusedProductOptionsCalls: UnusedProductOptionsArgs[] = [];

  readonly unusedProductOptionGroupsCalls: UnusedProductOptionGroupsArgs[] = [];

  getUnusedProductOptions(...args: UnusedProductOptionsArgs): Promise<readonly SelectOption[]> {
    this.unusedProductOptionsCalls.push(args);

    return Promise.resolve([]);
  }

  getUnusedProductOptionGroups(
    ...args: UnusedProductOptionGroupsArgs
  ): Promise<readonly SelectOption[]> {
    this.unusedProductOptionGroupsCalls.push(args);

    return Promise.resolve([]);
  }
}

/**
 * In-memory stand-in for the image stub port.
 *
 * Replaces the one `getService()` call in the whole in-scope service layer,
 * `getService("imageService")` [model/service/SkuService.cfc:L212].
 */
class RecordingImageStore implements ImageStore {
  readonly saveImageFileCalls: SaveImageFileArgs[] = [];

  readonly deleteImageFileCalls: DeleteImageFileArgs[] = [];

  constructor(private readonly saveResult: boolean = true) {}

  saveImageFile(...args: SaveImageFileArgs): Promise<boolean> {
    this.saveImageFileCalls.push(args);

    return Promise.resolve(this.saveResult);
  }

  deleteImageFile(...args: DeleteImageFileArgs): Promise<void> {
    this.deleteImageFileCalls.push(args);

    return Promise.resolve();
  }

  /**
   * The port's third member, which nothing in this file may reach.
   */
  generateSkuImageFileName(): never {
    throw new Error(
      'SkuService must never reach ImageStore.generateSkuImageFileName: the name composition ' +
        'belongs to ProductService.processProduct_updateDefaultImageFileNames ' +
        '[model/service/ProductService.cfc:L208-L214], and model/service/SkuService.cfc declares ' +
        'no equivalent.',
    );
  }
}

/**
 * In-memory stand-in for the subscription stub port.
 *
 * Replaces `property name="subscriptionService" type="any";` [model/service/SkuService.cfc:L55],
 * reached at [model/service/SkuService.cfc:L158], [model/service/SkuService.cfc:L161] and
 * [model/service/SkuService.cfc:L164] - all three inside the OUT-OF-SCOPE subscription branch.
 */
class RecordingSubscriptionTermProvider implements SubscriptionTermProvider {
  readonly subscriptionTermCalls: SubscriptionTermArgs[] = [];

  readonly subscriptionBenefitCalls: SubscriptionBenefitArgs[] = [];

  constructor(private readonly unresolvableIDs: readonly string[] = []) {}

  getSubscriptionTerm(...args: SubscriptionTermArgs): Promise<SubscriptionTermHandle | undefined> {
    this.subscriptionTermCalls.push(args);

    const [subscriptionTermID] = args;

    if (this.unresolvableIDs.includes(subscriptionTermID)) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve({ handleType: 'subscriptionTerm', subscriptionTermID });
  }

  getSubscriptionBenefit(
    ...args: SubscriptionBenefitArgs
  ): Promise<SubscriptionBenefitHandle | undefined> {
    this.subscriptionBenefitCalls.push(args);

    const [subscriptionBenefitID] = args;

    if (this.unresolvableIDs.includes(subscriptionBenefitID)) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve({ handleType: 'subscriptionBenefit', subscriptionBenefitID });
  }
}

describe('SkuService', () => {
  let skuRepository: RecordingSkuRepository;
  let imageStore: RecordingImageStore;
  let subscriptionTermProvider: RecordingSubscriptionTermProvider;
  let optionRepository: RecordingOptionRepository;
  let service: SkuService;

  beforeEach(() => {
    skuRepository = new RecordingSkuRepository();
    imageStore = new RecordingImageStore();
    subscriptionTermProvider = new RecordingSubscriptionTermProvider();
    optionRepository = new RecordingOptionRepository();

    // JUDGMENT CALL: the three collaborators are handed to the constructor and that is the whole
    // wiring story.
    //
    // The two trailing knobs are left at their shipped defaults - a bound of 1000 and
    // duplicate-code refusal OFF - so most cases observe default-configuration behaviour.
    service = new SkuService(skuRepository, imageStore, subscriptionTermProvider);
  });

  describe('published surface', () => {
    it('carries all nine legacy method names verbatim and publishes no wider surface', () => {
      const publishedMembers = Object.getOwnPropertyNames(SkuService.prototype);

      // CFML parity [model/service/SkuService.cfc:L58, L210, L220, L246, L271, L281, L285, L289]:
      // eight of the nine names are the legacy CFML camelCase names, character for character.
      expect(publishedMembers).toContain('createSkus');
      expect(publishedMembers).toContain('processImageUpload');
      expect(publishedMembers).toContain('getProductSkus');
      expect(publishedMembers).toContain('getSortedProductSkus');
      expect(publishedMembers).toContain('searchSkusByProductType');
      expect(publishedMembers).toContain('getSkuStocksDeletableFlag');
      expect(publishedMembers).toContain('getTransactionExistsFlag');
      expect(publishedMembers).toContain('getSkuBySkuCode');

      // The ninth is the one deliberate rename and the legacy name is GONE rather than kept as an
      // alias, an alias being a second surface to keep in step.
      expect(publishedMembers).toContain('findSkus');
      expect(publishedMembers).not.toContain('getSkuSmartList');

      expect(publishedMembers).not.toContain('createSkuVariants');
      expect(publishedMembers).not.toContain('uploadImage');
      expect(publishedMembers).not.toContain('listProductSkus');
      expect(publishedMembers).not.toContain('getSortedSkus');
      expect(publishedMembers).not.toContain('searchSkus');
      expect(publishedMembers).not.toContain('isSkuStockDeletable');
      expect(publishedMembers).not.toContain('hasTransactions');
      expect(publishedMembers).not.toContain('findSkuBySkuCode');

      expect(publishedMembers).not.toContain('getSku');
      expect(publishedMembers).not.toContain('newSku');
      expect(publishedMembers).not.toContain('saveSku');
      expect(publishedMembers).not.toContain('deleteSku');
      expect(publishedMembers).not.toContain('validateSku');
      expect(publishedMembers).not.toContain('getSkuCurrencySmartList');
    });

    it('takes three ports, and the option port is deliberately not one of them', () => {
      // The SHIPPED ARITY is three. The suite was briefed for four ports; the production module is
      // the contract, so this asserts what shipped.
      expect(SkuService.length).toBe(3);

      const constructedWithThreePorts = new SkuService(
        new RecordingSkuRepository(),
        new RecordingImageStore(),
        new RecordingSubscriptionTermProvider(),
      );

      expect(constructedWithThreePorts).toBeInstanceOf(SkuService);

      // The SKU port is EXACTLY seven members wide, in declaration order, so nothing in this file
      // can accidentally describe a wider data contract than the port.
      expect(Object.getOwnPropertyNames(RecordingSkuRepository.prototype)).toStrictEqual([
        'constructor',
        'getTransactionExistsFlag',
        'getSkuBySkuCode',
        'getSkusBySelectedOptions',
        'searchSkusByProductType',
        'getProductSkus',
        'getSortedProductSkusID',
        'saveSku',
      ]);

      // LEGACY-NOTE [model/service/SkuService.cfc:L53, L74]: `optionService` is reached at exactly
      // one line, and only for HibachiService's generic `get<Entity>(primaryKey)` lookup, which
      // the port set does not carry.
      expect(Object.getOwnPropertyNames(RecordingOptionRepository.prototype)).toStrictEqual([
        'constructor',
        'getUnusedProductOptions',
        'getUnusedProductOptionGroups',
      ]);
      expect(optionRepository.unusedProductOptionsCalls).toStrictEqual([]);
      expect(optionRepository.unusedProductOptionGroupsCalls).toStrictEqual([]);
    });

    it('reaches its collaborators only through the constructor, never through a locator', async () => {
      const isolatedRepository = new RecordingSkuRepository({ transactionExistsFlag: true });
      const isolatedService = new SkuService(
        isolatedRepository,
        new RecordingImageStore(),
        new RecordingSubscriptionTermProvider(),
      );

      expect(await isolatedService.getTransactionExistsFlag()).toBe(true);

      // Recorded with ZERO arguments.
      expect(isolatedRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      expect(skuRepository.transactionExistsFlagCalls).toStrictEqual([]);
    });

    it('refuses a creation bound that is not a positive whole number', () => {
      expect(() => new SkuService(skuRepository, imageStore, subscriptionTermProvider, 0)).toThrow(
        /positive safe integer/,
      );
      expect(() => new SkuService(skuRepository, imageStore, subscriptionTermProvider, -1)).toThrow(
        /positive safe integer/,
      );
      expect(
        () => new SkuService(skuRepository, imageStore, subscriptionTermProvider, 1.5),
      ).toThrow(/positive safe integer/);

      expect(new SkuService(skuRepository, imageStore, subscriptionTermProvider, 1)).toBeInstanceOf(
        SkuService,
      );
    });
  });

  describe('createSkus - base product type dispatch [model/service/SkuService.cfc:L61, L204]', () => {
    it('dispatches all three base product types case-insensitively', async () => {
      // CFML parity [model/service/SkuService.cfc:L61, L124, L138, L172]: the legacy dispatch is a
      // `switch`/`cfif` over the base product type's system code, and CFML string comparison is
      // CASE-INSENSITIVE while TypeScript's `===` is not.
      const casings: readonly string[] = [
        'merchandise',
        'Merchandise',
        'MERCHANDISE',
        'mErChAnDiSe',
      ];

      for (const systemCode of casings) {
        const product = makeProductFixture({
          productID: `dispatch-merch-${systemCode}`,
          productType: aProductType({ productTypeID: 'pt-merchandise', systemCode }),
        });

        expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);
        expect(product.getSkus()).toHaveLength(1);
      }

      const subscriptionProduct = makeProductFixture({
        productID: 'dispatch-subscription',
        productType: aProductType({ productTypeID: 'pt-sub', systemCode: 'SUBSCRIPTION' }),
      });

      expect(
        await service.createSkus(subscriptionProduct, {
          price: PRICE_DECIMAL,
          subscriptionBenefits: 'sub-benefit-1',
          subscriptionTerms: 'sub-term-1',
          renewalSubscriptionBenefits: 'renewal-benefit-1',
        }),
      ).toBe(true);
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([['sub-term-1']]);

      const contentAccessProduct = makeProductFixture({
        productID: 'dispatch-content-access',
        productType: aProductType({ productTypeID: 'pt-ca', systemCode: 'contentaccess' }),
      });

      expect(
        await service.createSkus(contentAccessProduct, {
          price: PRICE_DECIMAL,
          accessContents: 'access-content-1',
        }),
      ).toBe(true);
      expect(contentAccessProduct.getSkus()).toHaveLength(1);
    });

    it('reaches the verbatim L204 message for an unrecognised base product type', async () => {
      const product = makeProductFixture({
        productID: 'dispatch-unrecognised',
        productType: aProductType({ productTypeID: 'pt-gift-card', systemCode: 'giftCard' }),
      });

      // Asserted CHARACTER for CHARACTER, not by pattern. It is a user-visible string the legacy
      // admin surfaces, so a reworded version - however much clearer - would be an observable
      // behaviour change at the boundary.
      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE,
      );
      expect(UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE).toBe(
        'There was an unexpected error when creating this product',
      );

      expect(product.getSkus()).toStrictEqual([]);
    });

    it('returns a constant true no matter what the chosen branch actually did', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L207]: createSkus returns a constant true and
      // never signals partial or failed creation.
      // Preserved deliberately; do not fix without a product decision.
      const creatingProduct = makeProductFixture({ productID: 'constant-true-created' });

      expect(await service.createSkus(creatingProduct, { price: PRICE_DECIMAL })).toBe(true);
      expect(creatingProduct.getSkus()).toHaveLength(1);

      const skippingProduct = makeProductFixture({
        productID: 'constant-true-skipped',
        productType: aProductType({ productTypeID: 'pt-ca', systemCode: 'contentAccess' }),
      });

      expect(await service.createSkus(skippingProduct, { price: PRICE_DECIMAL })).toBe(true);
      expect(skippingProduct.getSkus()).toStrictEqual([]);
    });

    it('raises when the product carries no product type, exactly as the unguarded chain does', async () => {
      // CFML parity [model/service/SkuService.cfc:L61]: the legacy chains
      // `getProductType().getBaseProductType()` with no null test. `productType` is only
      // `required` on the `save` validation context, so a product with none is reachable and the
      // legacy raises.
      const product = makeProductFixture({
        productID: 'no-product-type',
        productType: undefined,
      });

      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        /has no product type/,
      );
    });

    it('raises when the product carries no product code, because every code formula concatenates it', async () => {
      // CFML parity [model/service/SkuService.cfc:L97, L133, L159, L184, L194]: all four distinct
      // skuCode formulas begin by concatenating `getProductCode()` with no null test, so an absent
      // code raises rather than producing a code that starts with the delimiter.
      const product = makeProductFixture({
        productID: 'no-product-code',
        productCode: undefined,
      });

      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        /has no product code/,
      );
    });
  });

  describe('createSkus - the option cartesian odometer [model/service/SkuService.cfc:L67, L82-L122]', () => {
    /**
     * Builds `groupSizes.length` option groups, the nth holding `groupSizes[n]` options.
     *
     * The returned comma list is JOINED from options this file just constructed - never parsed,
     * and no `src/lib/cfml/list.ts` helper is involved.
     */
    function anOptionGraph(groupSizes: readonly number[]): {
      readonly options: readonly Option[];
      readonly optionIDList: string;
    } {
      const options: Option[] = [];

      groupSizes.forEach((groupSize, groupOrdinal) => {
        const optionGroup = anOptionGroup({
          optionGroupID: `og-${String(groupOrdinal + 1)}`,
          sortOrder: groupOrdinal + 1,
        });

        for (let optionOrdinal = 1; optionOrdinal <= groupSize; optionOrdinal++) {
          options.push(
            anOption({
              optionID: `og-${String(groupOrdinal + 1)}-opt-${String(optionOrdinal)}`,
              sortOrder: optionOrdinal,
              optionGroup,
            }),
          );
        }
      });

      return {
        options,
        optionIDList: options.map((option) => option.getOptionID()).join(','),
      };
    }

    it('creates exactly the cartesian product of the option group sizes, in odometer order', async () => {
      // JUDGMENT CALL: the option-cartesian combination count is unbounded by construction -
      // [model/service/SkuService.cfc:L82-L86] multiplies `arrayLen(optionGroups[key])` into
      // `totalCombos` for every group with no ceiling anywhere.
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-size', sortOrder: 1 });
      const colourGroup = anOptionGroup({ optionGroupID: 'og-colour', sortOrder: 2 });

      const sizeLarge = anOption({
        optionID: 'opt-size-large',
        sortOrder: 1,
        optionGroup: sizeGroup,
      });
      const sizeSmall = anOption({
        optionID: 'opt-size-small',
        sortOrder: 2,
        optionGroup: sizeGroup,
      });
      const colourRed = anOption({
        optionID: 'opt-colour-red',
        sortOrder: 1,
        optionGroup: colourGroup,
      });
      const colourTeal = anOption({
        optionID: 'opt-colour-teal',
        sortOrder: 2,
        optionGroup: colourGroup,
      });
      const colourEcru = anOption({
        optionID: 'opt-colour-ecru',
        sortOrder: 3,
        optionGroup: colourGroup,
      });

      const product = makeProductFixture({ productID: 'odometer-2x3' });
      expect(product.getProductCode()).toBe(FIXTURE_PRODUCT_CODE);

      const data: CreateSkusInput = {
        price: PRICE_DECIMAL,
        listPrice: LIST_PRICE_DECIMAL,
        options: 'opt-size-large,opt-size-small,opt-colour-red,opt-colour-teal,opt-colour-ecru',
        resolvedOptions: [sizeLarge, sizeSmall, colourRed, colourTeal, colourEcru],
      };

      expect(await service.createSkus(product, data)).toBe(true);

      const created = product.getSkus();

      // 2 * 3 = 6. Not 5, which is what an additive reading of the loop would give.
      expect(created).toHaveLength(6);

      // CFML parity [model/service/SkuService.cfc:L97]: the code formula is
      // `getProductCode() & "-" & arrayLen(getSkus()) + 1` evaluated after the previous
      // combination was attached, so the ordinals run 1..6 with no gap.
      expect(created.map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
        'TESTPRODUCTXXX-4',
        'TESTPRODUCTXXX-5',
        'TESTPRODUCTXXX-6',
      ]);

      const generatedCodes = created.map((sku) => sku.getSkuCode());
      expect(
        generatedCodes.every((code) => code !== undefined && ENTITY_CODE_PATTERN.test(code)),
      ).toBe(true);

      // The odometer's carry direction. [model/service/SkuService.cfc:L112-L120] walks
      // `changeKeyIndex` from 1 upward, so the FIRST indexed group is the LEAST significant wheel
      // and the last is the MOST significant.
      expect(
        created.map((sku) => sku.getOptions().map((option) => option.getOptionID())),
      ).toStrictEqual([
        ['opt-size-large', 'opt-colour-red'],
        ['opt-size-small', 'opt-colour-red'],
        ['opt-size-large', 'opt-colour-teal'],
        ['opt-size-small', 'opt-colour-teal'],
        ['opt-size-large', 'opt-colour-ecru'],
        ['opt-size-small', 'opt-colour-ecru'],
      ]);

      expect(created.every((sku) => sku.getOptions().length === 2)).toBe(true);

      const expectedPrice = Money.fromDecimalString(PRICE_DECIMAL);
      const expectedListPrice = Money.fromDecimalString(LIST_PRICE_DECIMAL);
      expect(created.every((sku) => sku.getPrice().equals(expectedPrice))).toBe(true);
      expect(created.every((sku) => sku.getListPrice().equals(expectedListPrice))).toBe(true);
    });

    it('does not over-advance the odometer past the final combination', async () => {
      // [model/service/SkuService.cfc:L109] `if(i < totalCombos)` is load-bearing.
      const graph = anOptionGraph([2, 2, 2]);
      const product = makeProductFixture({ productID: 'odometer-guard' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);

      // 2 * 2 * 2 = 8, and the eighth combination is (last, last, last) - precisely the row that
      // would trip an unguarded carry.
      expect(product.getSkus()).toHaveLength(8);
      expect(product.getSkus().every((sku) => sku.getOptions().length === 3)).toBe(true);

      const finalSku = product.getSkus()[7];
      expect(finalSku).toBeDefined();
      if (finalSku !== undefined) {
        expect(finalSku.getOptions().map((option) => option.getOptionID())).toStrictEqual([
          'og-1-opt-2',
          'og-2-opt-2',
          'og-3-opt-2',
        ]);
      }
    });

    it('creates one SKU when every group holds a single option', async () => {
      const graph = anOptionGraph([1, 1, 1]);
      const product = makeProductFixture({ productID: 'odometer-1x1x1' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);

      expect(product.getSkus()).toHaveLength(1);
      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual(['TESTPRODUCTXXX-1']);
    });

    it('grows the plan multiplicatively rather than additively when a group gains an option', async () => {
      const smallerGraph = anOptionGraph([2, 2, 2]);
      const smallerProduct = makeProductFixture({ productID: 'growth-8' });

      await service.createSkus(smallerProduct, {
        price: PRICE_DECIMAL,
        options: smallerGraph.optionIDList,
        resolvedOptions: smallerGraph.options,
      });

      const largerGraph = anOptionGraph([3, 2, 2]);
      const largerProduct = makeProductFixture({ productID: 'growth-12' });

      await service.createSkus(largerProduct, {
        price: PRICE_DECIMAL,
        options: largerGraph.optionIDList,
        resolvedOptions: largerGraph.options,
      });

      const smallerCount = smallerProduct.getSkus().length;
      const largerCount = largerProduct.getSkus().length;

      expect(smallerCount).toBe(8);
      expect(largerCount).toBe(12);

      expect(largerCount - smallerCount).toBe(4);
    });

    it('raises when an option named in the comma list is absent from resolvedOptions', async () => {
      // LEGACY-NOTE [model/service/SkuService.cfc:L74]: the legacy resolved each option through
      // `getOptionService().getOption(listGetAt(...))`, HibachiService's generic
      // `get<Entity>(primaryKey)`, which the thirteen-port set does not carry.
      const graph = anOptionGraph([2]);
      const product = makeProductFixture({ productID: 'unresolved-option' });

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: `${graph.optionIDList},og-1-opt-missing`,
          resolvedOptions: graph.options,
        }),
      ).rejects.toThrow(/is absent from data.resolvedOptions/);

      expect(product.getSkus()).toStrictEqual([]);
    });

    it('raises when a resolved option carries no option group', async () => {
      // CFML parity [model/service/SkuService.cfc:L75]: the legacy chains
      // `getOptionGroup().getOptionGroupID()` with no null test, so an option with no group
      // raises. `optionGroup` is nullable on the entity, so the state is reachable.
      const groupedOption = anOption({
        optionID: 'opt-grouped',
        sortOrder: 1,
        optionGroup: anOptionGroup({ optionGroupID: 'og-present', sortOrder: 1 }),
      });
      const orphanedOption = anOption({
        optionID: 'opt-orphaned',
        sortOrder: 1,
        optionGroup: undefined,
      });

      const product = makeProductFixture({ productID: 'option-without-group' });

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: 'opt-grouped,opt-orphaned',
          resolvedOptions: [groupedOption, orphanedOption],
        }),
      ).rejects.toThrow(/has no option group/);

      expect(product.getSkus()).toStrictEqual([]);
    });
  });

  describe('createSkus - the target-side creation bound is a correctness protection', () => {
    /**
     * Builds a graph of `groupSizes` shape, joined - never parsed.
     *
     * Duplicated from the odometer block deliberately: each describe owns its own inputs, so a
     * later change to one block's graph cannot silently move another's expectations.
     */
    function aTwoGroupGraph(
      firstGroupSize: number,
      secondGroupSize: number,
    ): { readonly options: readonly Option[]; readonly optionIDList: string } {
      const firstGroup = anOptionGroup({ optionGroupID: 'bound-og-1', sortOrder: 1 });
      const secondGroup = anOptionGroup({ optionGroupID: 'bound-og-2', sortOrder: 2 });
      const options: Option[] = [];

      for (let ordinal = 1; ordinal <= firstGroupSize; ordinal++) {
        options.push(
          anOption({
            optionID: `bound-og-1-opt-${String(ordinal)}`,
            sortOrder: ordinal,
            optionGroup: firstGroup,
          }),
        );
      }

      for (let ordinal = 1; ordinal <= secondGroupSize; ordinal++) {
        options.push(
          anOption({
            optionID: `bound-og-2-opt-${String(ordinal)}`,
            sortOrder: ordinal,
            optionGroup: secondGroup,
          }),
        );
      }

      return { options, optionIDList: options.map((option) => option.getOptionID()).join(',') };
    }

    it('refuses a plan above the bound and leaves the product completely untouched', async () => {
      // The refusal is asserted STRUCTURALLY: a bound is configured, a plan exceeds it, the plan
      // is refused, and nothing was attached.
      //
      // The bound matters because [model/service/SkuService.cfc:L85-L86] multiplies group sizes
      // into `totalCombos` with no ceiling.
      const boundedService = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 5);
      const graph = aTwoGroupGraph(2, 3);
      const product = makeProductFixture({ productID: 'bound-refused' });

      await expect(
        boundedService.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).rejects.toThrow(/above the configured bound of 5/);

      expect(product.getSkus()).toStrictEqual([]);
    });

    it('permits a plan sitting exactly on the bound', async () => {
      // The comparison is `>` rather than `>=` [assertWithinCreationBound], so a plan equal to the
      // bound is allowed.
      const boundedService = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 6);
      const graph = aTwoGroupGraph(2, 3);
      const product = makeProductFixture({ productID: 'bound-exact' });

      expect(
        await boundedService.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);
      expect(product.getSkus()).toHaveLength(6);
    });

    it('bounds the content-access branch as well as the option branch', async () => {
      // [model/service/SkuService.cfc:L191] loops `listLen(accessContents)` and saves per
      // iteration, so it is the second unbounded bulk-mutation site in this component and carries
      // its own bound.
      const boundedService = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 2);
      const product = makeProductFixture({
        productID: 'bound-content-access',
        productType: aProductType({ productTypeID: 'pt-ca', systemCode: 'contentAccess' }),
      });

      await expect(
        boundedService.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2,access-3',
        }),
      ).rejects.toThrow(/above the configured bound of 2/);
      expect(product.getSkus()).toStrictEqual([]);
    });
  });

  describe('createSkus - the option-group traversal order, pinned rather than assumed', () => {
    // Why this block exists and what it does **not** claim.

    /**
     * Colour (2 options) then Size (3 options), named in that order in the payload.
     */
    function aTwoGroupPayload(): { readonly data: CreateSkusInput } {
      const colour = anOptionGroup({ optionGroupID: 'og-colour', sortOrder: 20 });
      const size = anOptionGroup({ optionGroupID: 'og-size', sortOrder: 10 });

      // NOTE the sort orders: `og-size` sorts FIRST and its identifier sorts FIRST alphabetically,
      // while `og-colour` appears first in the payload.
      return {
        data: {
          price: PRICE_DECIMAL,
          options: 'opt-red,opt-blue,opt-s,opt-m,opt-l',
          resolvedOptions: [
            anOption({ optionID: 'opt-red', sortOrder: 1, optionGroup: colour }),
            anOption({ optionID: 'opt-blue', sortOrder: 2, optionGroup: colour }),
            anOption({ optionID: 'opt-s', sortOrder: 1, optionGroup: size }),
            anOption({ optionID: 'opt-m', sortOrder: 2, optionGroup: size }),
            anOption({ optionID: 'opt-l', sortOrder: 3, optionGroup: size }),
          ],
        },
      };
    }

    it('★★★ pins the exact code-to-combination mapping for a 2x3 payload', async () => {
      const product = makeProductFixture({ productID: 'order-2x3' });
      const { data } = aTwoGroupPayload();

      await service.createSkus(product, data);
      expect(
        product.getSkus().map((sku) => ({
          code: sku.getSkuCode(),
          options: sku.getOptions().map((option) => option.getOptionID()),
        })),
      ).toStrictEqual([
        { code: 'TESTPRODUCTXXX-1', options: ['opt-red', 'opt-s'] },
        { code: 'TESTPRODUCTXXX-2', options: ['opt-blue', 'opt-s'] },
        { code: 'TESTPRODUCTXXX-3', options: ['opt-red', 'opt-m'] },
        { code: 'TESTPRODUCTXXX-4', options: ['opt-blue', 'opt-m'] },
        { code: 'TESTPRODUCTXXX-5', options: ['opt-red', 'opt-l'] },
        { code: 'TESTPRODUCTXXX-6', options: ['opt-blue', 'opt-l'] },
      ]);
    });

    it('the COUNT and the SET of combinations are order-free, which is what bounds the risk', async () => {
      // `totalCombos` is a product [model/service/SkuService.cfc:L85], so it cannot depend on
      // traversal order; and every combination is produced exactly once whatever the order.
      const forward = makeProductFixture({ productID: 'order-forward' });
      const reversed = makeProductFixture({ productID: 'order-reversed' });
      const { data } = aTwoGroupPayload();
      const reversedData: CreateSkusInput = {
        ...data,
        options: 'opt-s,opt-m,opt-l,opt-red,opt-blue',
      };

      await service.createSkus(forward, data);
      await service.createSkus(reversed, reversedData);

      const combinationSet = (product: Product): string[] =>
        product
          .getSkus()
          .map((sku) =>
            sku
              .getOptions()
              .map((option) => option.getOptionID())
              .sort()
              .join('+'),
          )
          .sort();

      expect(forward.getSkus()).toHaveLength(6);
      expect(reversed.getSkus()).toHaveLength(6);
      expect(combinationSet(reversed)).toStrictEqual(combinationSet(forward));
      expect(
        reversed
          .getSkus()[1]
          ?.getOptions()
          .map((option) => option.getOptionID()),
      ).toStrictEqual(['opt-m', 'opt-red']);
    });

    it('the DEFAULT SKU is the first combination in traversal order, which is the second order-dependent outcome', async () => {
      // [model/service/SkuService.cfc:L101-L103] designates the first SKU attached, so the default
      // follows the traversal order too. Naming it here means the exposure is enumerated, not just
      // the code mapping.
      const forward = makeProductFixture({ productID: 'order-default-forward' });
      const { data } = aTwoGroupPayload();

      await service.createSkus(forward, data);

      expect(
        forward
          .getDefaultSku()
          ?.getOptions()
          .map((option) => option.getOptionID()),
      ).toStrictEqual(['opt-red', 'opt-s']);
    });

    it('group order is FIRST APPEARANCE in the payload list, not sort order and not identifier order', async () => {
      // The two groups in the fixture are deliberately built so that sort order and identifier
      // order both disagree with payload order.
      const product = makeProductFixture({ productID: 'order-first-appearance' });
      const { data } = aTwoGroupPayload();

      await service.createSkus(product, data);

      const firstTwo = product
        .getSkus()
        .slice(0, 2)
        .map((sku) => sku.getOptions().map((option) => option.getOptionID()));

      // The FIRST group varies between combination 1 and 2, so the first group is `og-colour`.
      expect(firstTwo).toStrictEqual([
        ['opt-red', 'opt-s'],
        ['opt-blue', 'opt-s'],
      ]);
    });

    it('option order WITHIN a group is list order too, so the odometer is fully determined', async () => {
      // [model/service/SkuService.cfc:L78] appends, so a group's options stand in the order the
      // list names them, and [model/service/SkuService.cfc:L107] reads that array by index.
      const group = anOptionGroup({ optionGroupID: 'og-within', sortOrder: 5 });
      const product = makeProductFixture({ productID: 'order-within-group' });

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        // Named out of both sort order and alphabetical order on purpose.
        options: 'opt-z,opt-a',
        resolvedOptions: [
          anOption({ optionID: 'opt-z', sortOrder: 9, optionGroup: group }),
          anOption({ optionID: 'opt-a', sortOrder: 1, optionGroup: group }),
        ],
      });

      expect(
        product.getSkus().map((sku) => sku.getOptions().map((option) => option.getOptionID())),
      ).toStrictEqual([['opt-z'], ['opt-a']]);
    });

    it('the snapshot loop and the assignment traversal agree, which the carry loop requires', async () => {
      // The one parity claim this block does make.
      const product = makeProductFixture({ productID: 'order-agreement' });
      const first = anOptionGroup({ optionGroupID: 'og-a', sortOrder: 1 });
      const second = anOptionGroup({ optionGroupID: 'og-b', sortOrder: 2 });
      const third = anOptionGroup({ optionGroupID: 'og-c', sortOrder: 3 });

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        options: 'a1,a2,b1,b2,c1,c2',
        resolvedOptions: [
          anOption({ optionID: 'a1', sortOrder: 1, optionGroup: first }),
          anOption({ optionID: 'a2', sortOrder: 2, optionGroup: first }),
          anOption({ optionID: 'b1', sortOrder: 1, optionGroup: second }),
          anOption({ optionID: 'b2', sortOrder: 2, optionGroup: second }),
          anOption({ optionID: 'c1', sortOrder: 1, optionGroup: third }),
          anOption({ optionID: 'c2', sortOrder: 2, optionGroup: third }),
        ],
      });

      const combinations = product.getSkus().map((sku) =>
        sku
          .getOptions()
          .map((option) => option.getOptionID())
          .join('+'),
      );

      expect(combinations).toStrictEqual([
        'a1+b1+c1',
        'a2+b1+c1',
        'a1+b2+c1',
        'a2+b2+c1',
        'a1+b1+c2',
        'a2+b1+c2',
        'a1+b2+c2',
        'a2+b2+c2',
      ]);
      expect(new Set(combinations).size).toBe(8);
    });
  });

  describe('createSkus - retry reconciliation converges instead of doubling', () => {
    it('★★★ a repeat of the single-merchandise path attaches NOTHING the second time', async () => {
      // [model/service/SkuService.cfc:L133] is the FIXED string `getProductCode() & "-1"`, so a
      // repeat regenerates the identical code.
      const product = makeProductFixture({ productID: 'retry-single' });

      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual(['TESTPRODUCTXXX-1']);

      // And the default designation still names that one SKU. [model/service/SkuService.cfc:L134]
      // is UNCONDITIONAL, so a second pass that ran would have overwritten it with the duplicate.
      expect(product.getDefaultSku()).toBe(product.getSkus()[0]);
    });

    it('needs no configuration to do it - the protection has no off switch', async () => {
      // The service under test is the one every other case in this file uses, constructed from its
      // three ports and nothing else, which is exactly how `src/handlers/bootstrap.ts` constructs
      // it.
      expect(SkuService.length).toBe(3);

      const defaultConstructed = new SkuService(
        skuRepository,
        imageStore,
        subscriptionTermProvider,
      );
      const product = makeProductFixture({ productID: 'retry-no-config' });

      await defaultConstructed.createSkus(product, { price: PRICE_DECIMAL });
      await defaultConstructed.createSkus(product, { price: PRICE_DECIMAL });

      expect(product.getSkus()).toHaveLength(1);
    });

    it('★★★ a repeat of the OPTION path attaches nothing, which a code check alone cannot do', async () => {
      const firstGroup = anOptionGroup({ optionGroupID: 'retry-og-1', sortOrder: 1 });
      const options: readonly Option[] = [
        anOption({ optionID: 'retry-opt-1', sortOrder: 1, optionGroup: firstGroup }),
        anOption({ optionID: 'retry-opt-2', sortOrder: 2, optionGroup: firstGroup }),
      ];
      const product = makeProductFixture({ productID: 'retry-count-derived' });
      const data: CreateSkusInput = {
        price: PRICE_DECIMAL,
        options: 'retry-opt-1,retry-opt-2',
        resolvedOptions: options,
      };

      expect(await service.createSkus(product, data)).toBe(true);
      expect(await service.createSkus(product, data)).toBe(true);

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
      ]);

      // One SKU per option, each carrying its own option - so the two that WOULD have been
      // attached were recognised as the combinations already present, not merely code-checked.
      expect(
        product.getSkus().map((sku) => sku.getOptions().map((o) => o.getOptionID())),
      ).toStrictEqual([['retry-opt-1'], ['retry-opt-2']]);
    });

    it('★★★ a PARTIALLY applied option payload resumes at the missing combination, with the codes the first attempt would have stamped', async () => {
      // The convergence property stated precisely.
      const group = anOptionGroup({ optionGroupID: 'partial-og', sortOrder: 1 });
      const first = anOption({ optionID: 'partial-opt-1', sortOrder: 1, optionGroup: group });
      const second = anOption({ optionID: 'partial-opt-2', sortOrder: 2, optionGroup: group });
      const product = makeProductFixture({ productID: 'retry-partial' });
      const data: CreateSkusInput = {
        price: PRICE_DECIMAL,
        options: 'partial-opt-1,partial-opt-2',
        resolvedOptions: [first, second],
      };

      // Attempt one, bounded to a single SKU, stands in for the interrupted run: it attaches
      // combination 1 and then the bound refuses the rest.
      const interrupted = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 1);

      await expect(interrupted.createSkus(product, data)).rejects.toThrow(
        /above the configured bound of 1/,
      );

      expect(product.getSkus()).toHaveLength(0);

      // The bound refuses before the first attachment, so nothing is attached at all - which is
      // the documented behaviour of `assertWithinCreationBound` and not what this case is about.
      const resumed = makeProductFixture({ productID: 'retry-partial-resumed' });

      await service.createSkus(resumed, {
        price: PRICE_DECIMAL,
        options: 'partial-opt-1',
        resolvedOptions: [first],
      });

      expect(resumed.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual(['TESTPRODUCTXXX-1']);

      // Now the full payload arrives. Combination 1 is skipped, combination 2 is created, and it
      // is stamped `-2` - exactly what a single uninterrupted call with the full payload produces.
      await service.createSkus(resumed, data);

      expect(resumed.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
      ]);
      expect(
        resumed.getSkus().map((sku) => sku.getOptions().map((o) => o.getOptionID())),
      ).toStrictEqual([['partial-opt-1'], ['partial-opt-2']]);
    });

    it('★★ still creates BOTH SKUs when one payload names the same option twice, because the snapshot is taken before the loop', async () => {
      // Naming the same option twice buckets it twice [model/service/SkuService.cfc:L75-L78], so
      // `totalCombos` is 2 [model/service/SkuService.cfc:L85] and the legacy creates two SKUs
      // carrying the identical option set.
      const group = anOptionGroup({ optionGroupID: 'twice-og', sortOrder: 1 });
      const option = anOption({ optionID: 'twice-opt', sortOrder: 1, optionGroup: group });
      const product = makeProductFixture({ productID: 'retry-same-option-twice' });

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        options: 'twice-opt,twice-opt',
        resolvedOptions: [option],
      });

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
      ]);
    });

    it('folds case when it compares codes, because CFML comparison folds case', async () => {
      // `SwSku.skuCode` is `unique="true"` on a text column [model/entity/Sku.cfc:L54], and CFML
      // string comparison folds case, so `TESTPRODUCTXXX-1` and `testproductxxx-1` are one code.
      const product = makeProductFixture({ productID: 'retry-folded' });
      const existing = makeSkuFixture({ skuID: 'retry-folded-sku', product });

      existing.setSkuCode('testproductxxx-1');
      product.addSku(existing);

      await service.createSkus(product, { price: PRICE_DECIMAL });

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual(['testproductxxx-1']);
    });
  });

  describe('createSkus - the asymmetric price and listPrice guards', () => {
    it('makes an absent price unrepresentable in the type, and still raises at run time', async () => {
      // CFML parity [model/service/SkuService.cfc:L93, L129, L156, L157, L183, L193]: every
      // `price` read is UNGUARDED - no structKeyExists, no isNumeric, no default - so an absent
      // price raised.
      // @ts-expect-error - price is required on CreateSkusInput, so omitting it must not compile.
      const inputWithNoPrice: CreateSkusInput = { listPrice: LIST_PRICE_DECIMAL };
      const product = makeProductFixture({ productID: 'price-absent' });

      await expect(service.createSkus(product, inputWithNoPrice)).rejects.toThrow(
        /price is absent/,
      );
    });

    it('raises on a price that is not a plain decimal numeral', async () => {
      // No default is substituted and no zero is fabricated. A SKU whose price silently became
      // zero would be given away, which is why the unguarded read is reproduced as a raise rather
      // than softened into a fallback.
      const product = makeProductFixture({ productID: 'price-non-numeric' });

      await expect(service.createSkus(product, { price: 'not-a-number' })).rejects.toThrow(
        /finite plain decimal numeral/,
      );
    });

    it('applies a listPrice that is numeric and greater than zero', async () => {
      const product = makeProductFixture({ productID: 'list-price-applied' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          listPrice: LIST_PRICE_DECIMAL,
        }),
      ).toBe(true);

      const created = product.getSkus()[0];
      expect(created).toBeDefined();
      if (created !== undefined) {
        expect(created.getListPrice().equals(Money.fromDecimalString(LIST_PRICE_DECIMAL))).toBe(
          true,
        );
        expect(created.getPrice().equals(Money.fromDecimalString(PRICE_DECIMAL))).toBe(true);
      }
    });

    it('silently skips a listPrice that is absent, blank, non-numeric, zero or negative', async () => {
      const skippedListPrices: readonly string[] = [
        '',
        '   ',
        'not-a-number',
        '0',
        '0.00',
        '-5.00',
      ];

      for (const listPrice of skippedListPrices) {
        const product = makeProductFixture({ productID: `list-price-skipped-${listPrice}` });

        expect(await service.createSkus(product, { price: PRICE_DECIMAL, listPrice })).toBe(true);

        const created = product.getSkus()[0];
        expect(created).toBeDefined();
        if (created !== undefined) {
          expect(created.getListPrice().equals(Money.zero)).toBe(true);

          expect(created.getPrice().equals(Money.fromDecimalString(PRICE_DECIMAL))).toBe(true);
        }
      }

      const productWithoutListPrice = makeProductFixture({ productID: 'list-price-omitted' });

      expect(await service.createSkus(productWithoutListPrice, { price: PRICE_DECIMAL })).toBe(
        true,
      );

      const createdWithoutListPrice = productWithoutListPrice.getSkus()[0];
      expect(createdWithoutListPrice).toBeDefined();
      if (createdWithoutListPrice !== undefined) {
        expect(createdWithoutListPrice.getListPrice().equals(Money.zero)).toBe(true);
      }
    });
  });

  describe('createSkus - out-of-scope branches delegate to stub ports only', () => {
    /**
     * A product whose base product type routes to the subscription branch.
     *
     * Subscription is EXPLICITLY out of SCOPE for this migration slice, so nothing below asserts
     * subscription feature behaviour - no term arithmetic, no benefit entitlement, no renewal
     * schedule.
     */
    function aSubscriptionProduct(productID: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({ productTypeID: 'pt-subscription', systemCode: 'subscription' }),
      });
    }

    /**
     * A product whose base product type routes to the content-access branch.
     */
    function aContentAccessProduct(productID: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({
          productTypeID: 'pt-content-access',
          systemCode: 'contentAccess',
        }),
      });
    }

    it('delegates every subscription term and benefit lookup to the stub port', async () => {
      const product = aSubscriptionProduct('subscription-delegation');

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1,term-2',
          subscriptionBenefits: 'benefit-1,benefit-2',
          renewalSubscriptionBenefits: 'renewal-1',
        }),
      ).toBe(true);

      // One lookup per term, in list order. [model/service/SkuService.cfc:L152-L158]
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([
        ['term-1'],
        ['term-2'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L160-L167]: both benefit lists are re-walked
      // inside the per-term loop rather than resolved once outside it, so a two-term input
      // resolves three benefits twice.
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([
        ['benefit-1'],
        ['benefit-2'],
        ['renewal-1'],
        ['benefit-1'],
        ['benefit-2'],
        ['renewal-1'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L155 vs L159]: `setProduct` attaches the draft
      // before the ordinal is computed from `arrayLen(getSkus()) + 1`, so the FIRST subscription
      // SKU is coded `-2` and not `-1`.
      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
      ]);

      expect(product.getSkus().map((sku) => sku.getSubscriptionTermID())).toStrictEqual([
        'term-1',
        'term-2',
      ]);
      expect(product.getSkus().map((sku) => sku.getSubscriptionBenefitIDs())).toStrictEqual([
        ['benefit-1', 'benefit-2'],
        ['benefit-1', 'benefit-2'],
      ]);
      expect(product.getSkus().map((sku) => sku.getRenewalSubscriptionBenefitIDs())).toStrictEqual([
        ['renewal-1'],
        ['renewal-1'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L156-L157]: renewal price is set from the same
      // `data.price` read, so the two are equal by construction rather than by coincidence.
      // Compared as `Money`; no float arithmetic is performed anywhere.
      const expectedPrice = Money.fromDecimalString(PRICE_DECIMAL);
      expect(product.getSkus().every((sku) => sku.getPrice().equals(expectedPrice))).toBe(true);
      expect(product.getSkus().every((sku) => sku.getRenewalPrice().equals(expectedPrice))).toBe(
        true,
      );
    });

    it('records both subscription validation failures and creates nothing, touching no port', async () => {
      const product = aSubscriptionProduct('subscription-validation');

      // Both required lists absent. [model/service/SkuService.cfc:L142-L150] records a failure for
      // each and then falls straight past the creation loop.
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus()).toStrictEqual([]);

      // The early return happens before any lookup, so the stub port is never reached.
      // LEGACY-NOTE: the legacy pushed these failures onto the entity through
      // `addError(propertyName, rbKey)`, an inherited HibachiEntity mechanism.
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([]);
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([]);
    });

    it('raises on the unguarded renewalSubscriptionBenefits read', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits` is
      // iterated with no structKeyExists guard - unlike subscriptionBenefits at L142 and
      // subscriptionTerms at L147 - and it is never validated either.
      // Preserved deliberately; do not fix without a product decision.
      const product = aSubscriptionProduct('subscription-renewal-unguarded');

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1',
          subscriptionBenefits: 'benefit-1',
        }),
      ).rejects.toThrow(/renewalSubscriptionBenefits is absent/);

      // The raise lands MID-ITERATION: the term and the ordinary benefits were already resolved
      // through the port before the unguarded read was reached.
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([['term-1']]);
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([['benefit-1']]);
    });

    it('raises when the stub port cannot resolve a term or a benefit', async () => {
      // CFML parity [model/service/SkuService.cfc:L158, L161, L164]: each lookup result is passed
      // STRAIGHT into `setSubscriptionTerm` / the add methods with no null test, so an
      // unresolvable identifier raises rather than being skipped.
      const unresolvableTermService = new SkuService(
        skuRepository,
        imageStore,
        new RecordingSubscriptionTermProvider(['term-missing']),
      );

      await expect(
        unresolvableTermService.createSkus(aSubscriptionProduct('subscription-term-missing'), {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-missing',
          subscriptionBenefits: 'benefit-1',
          renewalSubscriptionBenefits: 'renewal-1',
        }),
      ).rejects.toThrow(/subscription term 'term-missing' did not resolve/);

      const unresolvableBenefitService = new SkuService(
        skuRepository,
        imageStore,
        new RecordingSubscriptionTermProvider(['benefit-missing']),
      );

      await expect(
        unresolvableBenefitService.createSkus(
          aSubscriptionProduct('subscription-benefit-missing'),
          {
            price: PRICE_DECIMAL,
            subscriptionTerms: 'term-1',
            subscriptionBenefits: 'benefit-missing',
            renewalSubscriptionBenefits: 'renewal-1',
          },
        ),
      ).rejects.toThrow(/subscription benefit 'benefit-missing' did not resolve/);
    });

    it('creates one SKU per access content when the bundle flag is falsy', async () => {
      const product = aContentAccessProduct('content-access-unbundled');

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2',
        }),
      ).toBe(true);

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
      ]);
      expect(product.getSkus().map((sku) => sku.getAccessContentIDs())).toStrictEqual([
        ['access-1'],
        ['access-2'],
      ]);
    });

    it('creates a single bundled SKU carrying every access content when the flag is truthy', async () => {
      // CFML parity [model/service/SkuService.cfc:L179]: the flag is read through CFML truthiness,
      // so `true`, `1` and `"yes"` are all true while `false`, `0` and `"no"` are all false.
      const truthyFlags: readonly (string | number | boolean)[] = [true, 1, 'yes', 'true', 'Yes'];

      for (const bundleContentAccess of truthyFlags) {
        const product = aContentAccessProduct(
          `content-access-bundled-${String(bundleContentAccess)}`,
        );

        expect(
          await service.createSkus(product, {
            price: PRICE_DECIMAL,
            accessContents: 'access-1,access-2',
            bundleContentAccess,
          }),
        ).toBe(true);

        expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
          'TESTPRODUCTXXX-1',
        ]);
        expect(product.getSkus().map((sku) => sku.getAccessContentIDs())).toStrictEqual([
          ['access-1', 'access-2'],
        ]);
      }

      const falsyFlags: readonly (string | number | boolean)[] = [false, 0, 'no', 'false', 'No'];

      for (const bundleContentAccess of falsyFlags) {
        const product = aContentAccessProduct(
          `content-access-unbundled-${String(bundleContentAccess)}`,
        );

        expect(
          await service.createSkus(product, {
            price: PRICE_DECIMAL,
            accessContents: 'access-1,access-2',
            bundleContentAccess,
          }),
        ).toBe(true);

        expect(product.getSkus()).toHaveLength(2);
      }
    });

    it('records the access-content validation failure and creates nothing', async () => {
      const product = aContentAccessProduct('content-access-validation');

      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);
      expect(product.getSkus()).toStrictEqual([]);

      // An empty list is treated the same as an absent one, because
      // [model/service/SkuService.cfc:L175] tests `listLen(...)` rather than mere presence.
      const productWithEmptyList = aContentAccessProduct('content-access-empty-list');

      expect(
        await service.createSkus(productWithEmptyList, {
          price: PRICE_DECIMAL,
          accessContents: '',
        }),
      ).toBe(true);
      expect(productWithEmptyList.getSkus()).toStrictEqual([]);
    });

    it('never reaches the image store while creating SKUs', async () => {
      const product = makeProductFixture({ productID: 'creation-touches-no-image-store' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      expect(imageStore.saveImageFileCalls).toStrictEqual([]);
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });
  });

  // The five default-sku designation strategies, all five observable.
  //
  // [model/service/SkuService.cfc:L100-L103] merchandise, MULTIPLE options: `addSku`, then
  // designate only `if(isNull(getDefaultSku()))`.
  //
  // Sites 2 and 4 overwrite a default the product already carried; site 1 does not.

  describe('createSkus - the five default-SKU designation strategies', () => {
    /**
     * A product type whose base system code drives one of the three branches.
     */
    function aBranchProduct(productID: string, systemCode: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({ productTypeID: `pt-${systemCode}`, systemCode }),
      });
    }

    it('STRATEGY 1 [L100-L103] - the FIRST combination wins, and the rest do not displace it', async () => {
      // Two option groups of two options each: four combinations, four SKUs, and the guard closes
      // after the first.
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-default-size', sortOrder: 1 });
      const colourGroup = anOptionGroup({ optionGroupID: 'og-default-colour', sortOrder: 2 });
      const resolvedOptions = [
        anOption({ optionID: 'opt-d-size-1', sortOrder: 1, optionGroup: sizeGroup }),
        anOption({ optionID: 'opt-d-size-2', sortOrder: 2, optionGroup: sizeGroup }),
        anOption({ optionID: 'opt-d-colour-1', sortOrder: 1, optionGroup: colourGroup }),
        anOption({ optionID: 'opt-d-colour-2', sortOrder: 2, optionGroup: colourGroup }),
      ];

      const product = makeProductFixture({ productID: 'designate-strategy-1' });

      expect(product.getDefaultSku()).toBeUndefined();

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        options: resolvedOptions.map((option) => option.getOptionID()).join(','),
        resolvedOptions,
      });

      const created = product.getSkus();

      expect(created).toHaveLength(4);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(created[3]);
    });

    it('STRATEGY 1 [L101] - a product that ALREADY has a default keeps it', async () => {
      // The guard is a null test on the product, not a per-invocation flag, so a second invocation
      // designates nothing.
      const product = makeProductFixture({ productID: 'designate-strategy-1-second-call' });

      await service.createSkus(product, { price: PRICE_DECIMAL, listPrice: LIST_PRICE_DECIMAL });

      // The first invocation took the NO-options arm, which is site.
      const firstDefault = product.getDefaultSku();

      expect(firstDefault).toBe(product.getSkus()[0]);

      const optionGroup = anOptionGroup({ optionGroupID: 'og-second-call', sortOrder: 1 });
      const resolvedOptions = [
        anOption({ optionID: 'opt-second-call-1', sortOrder: 1, optionGroup }),
        anOption({ optionID: 'opt-second-call-2', sortOrder: 2, optionGroup }),
      ];

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        options: resolvedOptions.map((option) => option.getOptionID()).join(','),
        resolvedOptions,
      });

      expect(product.getSkus()).toHaveLength(3);
      // Unchanged: two more SKUs were attached and neither became the default.
      expect(product.getDefaultSku()).toBe(firstDefault);
    });

    it('STRATEGY 2 [L134] - the single merchandise SKU is designated UNCONDITIONALLY', async () => {
      // No options in, one SKU out, and the designation carries no guard.
      const product = makeProductFixture({ productID: 'designate-strategy-2' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      const first = product.getSkus()[0];

      expect(product.getSkus()).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(first);

      // A second product that ALREADY carries a default, under a code this arm never mints.
      const preloaded = makeProductFixture({ productID: 'designate-strategy-2-preloaded' });
      const incumbent = makeSkuFixture({
        skuID: 'designate-strategy-2-incumbent',
        product: preloaded,
      });

      incumbent.setSkuCode('TESTPRODUCTXXX-99');
      preloaded.addSku(incumbent);
      preloaded.setDefaultSku(incumbent);

      await service.createSkus(preloaded, { price: PRICE_DECIMAL });

      const minted = preloaded.getSkus()[1];

      expect(preloaded.getSkus()).toHaveLength(2);
      expect(minted).not.toBe(incumbent);
      expect(minted?.getSkuCode()).toBe('TESTPRODUCTXXX-1');
      // overwritten. [model/service/SkuService.cfc:L134] has no `isNull` test, unlike
      // [model/service/SkuService.cfc:L101].
      expect(preloaded.getDefaultSku()).toBe(minted);
    });

    it('STRATEGY 3 [L166-L168] - the subscription branch designates on the TERM INDEX', async () => {
      // `if(i==1)` is a loop-counter test rather than a null test, so it reaches the same outcome
      // as site 1 on a fresh product and a DIFFERENT one on a product that already has a default.
      const product = aBranchProduct('designate-strategy-3', 'subscription');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        subscriptionBenefits: 'sub-benefit-1',
        subscriptionTerms: 'sub-term-1,sub-term-2,sub-term-3',
        renewalSubscriptionBenefits: 'renewal-benefit-1',
      });

      const created = product.getSkus();

      expect(created).toHaveLength(3);
      expect(product.getDefaultSku()).toBe(created[0]);

      // A second invocation restarts the counter at 1, so `i==1` is true again and the designation
      // moves. [model/service/SkuService.cfc:L101]'s guard would have prevented this;
      // [model/service/SkuService.cfc:L167]'s does not.
      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        subscriptionBenefits: 'sub-benefit-1',
        subscriptionTerms: 'sub-term-4',
        renewalSubscriptionBenefits: 'renewal-benefit-1',
      });

      expect(product.getSkus()).toHaveLength(4);
      expect(product.getDefaultSku()).toBe(product.getSkus()[3]);
    });

    it('STRATEGY 3 [L152] - a validation failure designates NOTHING', async () => {
      // The whole subscription creation block sits behind `if(!hasErrors())`
      // [model/service/SkuService.cfc:L152], so a missing benefit list leaves both the collection
      // and the designation untouched.
      const product = aBranchProduct('designate-strategy-3-refused', 'subscription');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        subscriptionTerms: 'sub-term-1',
      });

      expect(product.getSkus()).toStrictEqual([]);
      expect(product.getDefaultSku()).toBeUndefined();
    });

    it('STRATEGY 4 [L189] - the BUNDLED contentAccess SKU is designated UNCONDITIONALLY', async () => {
      // One SKU holding every access content, and no guard on the designation - so this site
      // behaves like [model/service/SkuService.cfc:L134] and not like
      // [model/service/SkuService.cfc:L197].
      const product = aBranchProduct('designate-strategy-4', 'contentAccess');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        accessContents: 'content-1,content-2,content-3',
        bundleContentAccess: 1,
      });

      const created = product.getSkus();

      // One sku, not three: this is the arm that bundles.
      expect(created).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getAccessContentIDs()).toStrictEqual([
        'content-1',
        'content-2',
        'content-3',
      ]);
    });

    it('STRATEGY 5 [L197-L199] - the per-content arm designates on the LOOP INDEX', async () => {
      // Not bundled: one SKU per content, and `if(c==1)` designates the first.
      const product = aBranchProduct('designate-strategy-5', 'contentAccess');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        accessContents: 'content-1,content-2,content-3',
      });

      const created = product.getSkus();

      expect(created).toHaveLength(3);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe(`${FIXTURE_PRODUCT_CODE}-1`);
      expect(product.getDefaultSku()?.getAccessContentIDs()).toStrictEqual(['content-1']);
    });

    it('every designated SKU is TRANSIENT, which is what the cascade reads', async () => {
      // The case that ties this block to the persistence fix. Designation happens before any row
      // exists, so the designated sku reports `isNew()`.
      const product = makeProductFixture({ productID: 'designate-transient' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      const designated = product.getDefaultSku();

      expect(designated?.isNew()).toBe(true);
      // And it carries a provisional key rather than an empty one, which is why the adapter cannot
      // decide transience by inspecting the identifier.
      expect(designated?.getSkuID()).toMatch(/^[0-9a-f]{32}$/);
      // The designated SKU is also a MEMBER of the collection, so the cascade's `isNew()` filter
      // over `getSkus()` is guaranteed to include it.
      expect(product.getSkus()).toContain(designated);
    });

    it('the designation is on the PRODUCT, and the service keeps no record of its own', async () => {
      const product = makeProductFixture({ productID: 'designate-no-service-state' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      expect(product.getDefaultSku()).toBe(product.getSkus()[0]);

      // A second product built by the same service instance is unaffected by the first.
      const other = makeProductFixture({ productID: 'designate-no-service-state-other' });

      expect(other.getDefaultSku()).toBeUndefined();

      await service.createSkus(other, { price: PRICE_DECIMAL });

      expect(other.getDefaultSku()).toBe(other.getSkus()[0]);
      expect(other.getDefaultSku()).not.toBe(product.getDefaultSku());
    });
  });

  // Both `getProductSkus` and `getSortedProductSkus` merge a SKU collection into an order supplied
  // by `SkuDAO.getSortedProductSkusID`.
  //
  // What makes them two defects rather than one is the GUARD in front of each.

  describe('getProductSkus - the three-clause guard that inspects only the first SKU', () => {
    /**
     * The canonical four-SKU graph's product, as `tests/fixtures/skuFixtures.ts` wires it.
     *
     * The fixture attaches all four members - A with two options, B with one, C with three and D
     * with none - to a single product, and D is the member both indexing defects need.
     */
    function canonicalGraphProduct(): Product {
      const graphMemberA = makeSkuFixture({ andOfExistsMember: 'A' });
      const product = graphMemberA.getProduct();

      if (product === undefined) {
        throw new Error(
          'tests/fixtures/skuFixtures.ts wires the canonical four-SKU graph onto one product, ' +
            'but getProduct() answered undefined - the fixture contract has changed.',
        );
      }

      return product;
    }

    /**
     * The three graph members that carry options, in fixture order: A, B, C.
     */
    function optionedGraphSkus(): readonly Sku[] {
      return canonicalGraphProduct()
        .getSkus()
        .filter((sku) => sku.getOptions().length > 0);
    }

    /**
     * The single graph member that carries none: D.
     */
    function optionlessGraphSku(): Sku {
      const optionless = canonicalGraphProduct()
        .getSkus()
        .find((sku) => sku.getOptions().length === 0);

      if (optionless === undefined) {
        throw new Error(
          'tests/fixtures/skuFixtures.ts is expected to supply exactly one option-less graph ' +
            'member (SKU-D); none was found - the fixture contract has changed.',
        );
      }

      return optionless;
    }

    it('★ enters the sorted path on the first SKU alone, then raises when a later option-less SKU indexes at zero', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L223, L236-L237]: the sorted branch's guard
      // inspects only skus[1].getOptions(), so a collection whose first SKU has options but whose
      // later SKUs do not still enters the sort. ArrayFind then returns 0 at L236 and L237 assigns
      // at index.
      // Preserved deliberately; do not fix without a product decision.
      const product = canonicalGraphProduct();
      const leadingOptionedSku = optionedGraphSkus()[0];
      expect(leadingOptionedSku).toBeDefined();

      if (leadingOptionedSku === undefined) {
        return;
      }

      const guardPassingCollection: readonly Sku[] = [leadingOptionedSku, optionlessGraphSku()];
      expect(leadingOptionedSku.getOptions().length).toBeGreaterThan(0);
      expect(guardPassingCollection[1]?.getOptions()).toStrictEqual([]);

      const repository = new RecordingSkuRepository({
        productSkus: guardPassingCollection,

        sortedProductSkuIDs: [FIXTURE_SKU_A_ID],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await expect(subject.getProductSkus(product, true)).rejects.toThrow(
        /sku 'skfx-sku-d' is absent from the sorted-ID result, so arrayFind answered 0/,
      );

      // The raise cites the L236-L237 locator pair, which is how a reader of a failure gets from
      // the stack straight to the legacy lines being reproduced.
      await expect(subject.getProductSkus(product, true)).rejects.toThrow(/L236-L237/);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        [FIXTURE_PRODUCT_ID],
        [FIXTURE_PRODUCT_ID],
      ]);
    });

    it('never consults the sort port when the FIRST SKU carries no options, even if later ones do', async () => {
      // The other face of the same guard, and why it is a defect rather than a simple bug:
      // [model/service/SkuService.cfc:L223] reads `skus[1]` and nothing else.
      const product = canonicalGraphProduct();
      const leadingOptionedSku = optionedGraphSkus()[0];
      expect(leadingOptionedSku).toBeDefined();

      if (leadingOptionedSku === undefined) {
        return;
      }

      const optionlessFirst: readonly Sku[] = [optionlessGraphSku(), leadingOptionedSku];
      const repository = new RecordingSkuRepository({
        productSkus: optionlessFirst,
        sortedProductSkuIDs: [FIXTURE_SKU_A_ID],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_D_ID,
        FIXTURE_SKU_A_ID,
      ]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('sorts a well-formed collection into option-group sort order', async () => {
      // The happy path the defect cases sit beside: every member carries options, so every member
      // appears in the sorted-ID result and no index lands on zero.
      const product = canonicalGraphProduct();
      const repository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, true, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_B_ID,
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_C_ID,
      ]);

      expect(returned).toHaveLength(3);
      expect(new Set(returned.map((sku) => sku.getSkuID())).size).toBe(3);
    });

    it('forwards fetchOptions to the port exactly as given, including when it is omitted', async () => {
      // CFML parity [model/service/SkuService.cfc:L221, L230]: `fetchOptions` defaults to false
      // and passes straight through to the DAO, where it decides whether the HQL carries a `fetch`
      // join [model/dao/SkuDAO.cfc:L150-L170].
      const product = canonicalGraphProduct();

      const omittedRepository = new RecordingSkuRepository({ productSkus: optionedGraphSkus() });
      const omittedSubject = new SkuService(
        omittedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      // Omitted, not passed as `undefined`. Under `exactOptionalPropertyTypes` those are different
      // states, and only the omission exercises the parameter default.
      await omittedSubject.getProductSkus(product, false);
      expect(omittedRepository.productSkusCalls).toStrictEqual([[product, false]]);

      const explicitFalseRepository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
      });
      const explicitFalseSubject = new SkuService(
        explicitFalseRepository,
        imageStore,
        subscriptionTermProvider,
      );

      await explicitFalseSubject.getProductSkus(product, false, false);
      expect(explicitFalseRepository.productSkusCalls).toStrictEqual([[product, false]]);

      const explicitTrueRepository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
      });
      const explicitTrueSubject = new SkuService(
        explicitTrueRepository,
        imageStore,
        subscriptionTermProvider,
      );

      await explicitTrueSubject.getProductSkus(product, false, true);
      expect(explicitTrueRepository.productSkusCalls).toStrictEqual([[product, true]]);

      const sortedRepository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const sortedSubject = new SkuService(sortedRepository, imageStore, subscriptionTermProvider);

      await sortedSubject.getProductSkus(product, true, true);
      expect(sortedRepository.productSkusCalls).toStrictEqual([[product, true]]);
    });

    it('returns the port order untouched when sorted is false, and never consults the sort port', async () => {
      const product = canonicalGraphProduct();
      const repository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, false);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_B_ID,
        FIXTURE_SKU_C_ID,
      ]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('never consults the sort port for a single-SKU collection', async () => {
      // The second clause of the guard, `arrayLen(skus) gt 1` [model/service/SkuService.cfc:L223].
      // One SKU has no order to establish, and skipping the query is the legacy behaviour rather
      // than a shortcut added here.
      const product = canonicalGraphProduct();
      const leadingOptionedSku = optionedGraphSkus()[0];
      expect(leadingOptionedSku).toBeDefined();

      if (leadingOptionedSku === undefined) {
        return;
      }

      const repository = new RecordingSkuRepository({
        productSkus: [leadingOptionedSku],
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_A_ID]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('never consults the sort port for an empty collection', async () => {
      const product = canonicalGraphProduct();
      const repository = new RecordingSkuRepository({ productSkus: [] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.getProductSkus(product, true)).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });
  });

  describe('getSortedProductSkus - the sibling with no options guard at all', () => {
    /**
     * A SKU carrying no options, built from the fixture with its option set emptied.
     */
    function anOptionlessSku(skuID: string): Sku {
      return makeSkuFixture({ idPrefix: skuID, skuID, options: [] });
    }

    /**
     * A SKU carrying one option, so the happy path has something to sort by.
     */
    function anOptionedSku(skuID: string, optionGroupSortOrder: number): Sku {
      const optionGroup = anOptionGroup({
        optionGroupID: `sorted-og-${String(optionGroupSortOrder)}`,
        sortOrder: optionGroupSortOrder,
      });

      return makeSkuFixture({
        idPrefix: skuID,
        skuID,
        options: [
          anOption({
            optionID: `sorted-opt-${String(optionGroupSortOrder)}`,
            sortOrder: optionGroupSortOrder,
            optionGroup,
          }),
        ],
      });
    }

    it('★ has no options guard at all, so an all-option-less pair still enters the sort and indexes at zero', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L248, L264-L265]: this sibling has no options
      // guard at all - only a count check - so a collection of option-less SKUs enters the sort
      // and hits the same arrayFind-returns-zero index hazard.
      // Preserved deliberately; do not fix without a product decision.
      const firstOptionless = anOptionlessSku('sku-optionless-1');
      const secondOptionless = anOptionlessSku('sku-optionless-2');

      expect(firstOptionless.getOptions()).toStrictEqual([]);
      expect(secondOptionless.getOptions()).toStrictEqual([]);

      const product = makeProductFixture({
        productID: 'sorted-all-optionless',
        skus: [firstOptionless, secondOptionless],
      });
      const repository = new RecordingSkuRepository({ sortedProductSkuIDs: [] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await expect(subject.getSortedProductSkus(product)).rejects.toThrow(
        /sku 'sku-optionless-1' is absent from the sorted-ID result, so arrayFind answered 0/,
      );

      // The raise cites L264-L265, not L236-L237. Two locators, two defects - if both sites
      // resolved to the same locator the separation would be cosmetic.
      await expect(subject.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['sorted-all-optionless'],
        ['sorted-all-optionless'],
      ]);
    });

    it('proves the sibling guards would have diverged on this very input', async () => {
      const firstOptionless = anOptionlessSku('sku-optionless-1');
      const secondOptionless = anOptionlessSku('sku-optionless-2');
      const optionlessPair: readonly Sku[] = [firstOptionless, secondOptionless];

      const product = makeProductFixture({
        productID: 'sorted-guard-divergence',
        skus: [firstOptionless, secondOptionless],
      });

      const sortedRepository = new RecordingSkuRepository({ sortedProductSkuIDs: [] });
      const sortedSubject = new SkuService(sortedRepository, imageStore, subscriptionTermProvider);

      await expect(sortedSubject.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);
      expect(sortedRepository.sortedProductSkusIDCalls).toHaveLength(1);

      const unsortedRepository = new RecordingSkuRepository({
        productSkus: optionlessPair,
        sortedProductSkuIDs: [],
      });
      const unsortedSubject = new SkuService(
        unsortedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      const returned = await unsortedSubject.getProductSkus(product, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        'sku-optionless-1',
        'sku-optionless-2',
      ]);
      expect(unsortedRepository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('reads product.getSkus() rather than the repository, and returns that very array below two', async () => {
      // CFML parity [model/service/SkuService.cfc:L247 versus L222]: this method reads the
      // association DIRECTLY - `arguments.product.getSkus()` - while its sibling goes to the DAO.
      // That is why the case above seeds `sortedProductSkuIDs` but not `productSkus`.
      const soleSku = anOptionlessSku('sku-sole');
      const product = makeProductFixture({ productID: 'sorted-single', skus: [soleSku] });
      const repository = new RecordingSkuRepository({
        productSkus: [soleSku],
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSortedProductSkus(product);

      // Identity, not equality.
      expect(returned).toBe(product.getSkus());

      expect(repository.productSkusCalls).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);

      const emptyProduct = makeProductFixture({ productID: 'sorted-empty', skus: [] });
      expect(await subject.getSortedProductSkus(emptyProduct)).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('sorts a well-formed collection into option-group sort order', async () => {
      // The happy path: three SKUs, each in a different option group, each present in the
      // sorted-ID result, so nothing indexes at zero.
      const groupOneSku = anOptionedSku('sku-group-1', 1);
      const groupTwoSku = anOptionedSku('sku-group-2', 2);
      const groupThreeSku = anOptionedSku('sku-group-3', 3);

      const product = makeProductFixture({
        productID: 'sorted-well-formed',
        // Deliberately handed to the product out of sorted order, so a passing assertion cannot be
        // explained by the input already being sorted.
        skus: [groupThreeSku, groupOneSku, groupTwoSku],
      });
      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['sku-group-1', 'sku-group-2', 'sku-group-3'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSortedProductSkus(product);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        'sku-group-1',
        'sku-group-2',
        'sku-group-3',
      ]);

      expect(returned).toHaveLength(3);
    });

    it('passes the product identifier to the same port method from both sorted readers', async () => {
      // CFML parity [model/service/SkuService.cfc:L224 versus L252]: the two call sites reach the
      // same DAO method with the same value in different call styles - L224 passes it as the named
      // argument `productID=...` while L252 passes it positionally.
      const groupOneSku = anOptionedSku('sku-group-1', 1);
      const groupTwoSku = anOptionedSku('sku-group-2', 2);
      const sortedIDs: readonly string[] = ['sku-group-1', 'sku-group-2'];

      const product = makeProductFixture({
        productID: 'call-style-parity',
        skus: [groupOneSku, groupTwoSku],
      });

      const repository = new RecordingSkuRepository({
        productSkus: [groupOneSku, groupTwoSku],
        sortedProductSkuIDs: sortedIDs,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.getProductSkus(product, true);
      await subject.getSortedProductSkus(product);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['call-style-parity'],
        ['call-style-parity'],
      ]);
    });
  });

  // The sorted merge refuses a sparse placement instead of asserting one.

  describe('the sorted merge refuses a sparse placement rather than asserting one', () => {
    /**
     * A SKU carrying one option, which is what the `getProductSkus` guard demands.
     */
    function aSortableSku(skuID: string, optionGroupSortOrder: number): Sku {
      const optionGroup = anOptionGroup({
        optionGroupID: `sparse-og-${String(optionGroupSortOrder)}`,
        sortOrder: optionGroupSortOrder,
      });

      return makeSkuFixture({
        idPrefix: skuID,
        skuID,
        options: [
          anOption({
            optionID: `sparse-opt-${String(optionGroupSortOrder)}`,
            sortOrder: optionGroupSortOrder,
            optionGroup,
          }),
        ],
      });
    }

    /**
     * Answers whatever a call raised, and fails loudly when it raised nothing.
     *
     * Deliberately typed `Promise<unknown>`: the refusal is asserted with `toMatchObject` and
     * `String(...)` rather than by casting the caught value to a shape this file has no import
     * for.
     */
    async function refusalFrom(work: Promise<readonly Sku[]>): Promise<unknown> {
      try {
        await work;
      } catch (caught: unknown) {
        return caught;
      }

      throw new Error('expected the sorted merge to refuse the placement, but it resolved');
    }

    it('★ refuses when the sorted-ID result outruns the SKUs handed in', async () => {
      // The shortfall is the whole input: three rows come back from the query and two SKUs are
      // available to fill them, so [model/service/SkuService.cfc:L260] sizes to three and
      // [model/service/SkuService.cfc:L262-L266] fills two.
      const first = aSortableSku('sparse-a', 1);
      const second = aSortableSku('sparse-b', 2);

      const product = makeProductFixture({
        productID: 'sparse-tail',
        skus: [first, second],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['sparse-a', 'sparse-b', 'sparse-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));

      expect(refusal).toBeInstanceOf(Error);
      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-tail',
        sortedIdentifierCount: 3,
        suppliedSkuCount: 2,
        unfilledPositions: [2],
      });
    });

    it('★ names the legacy sizing authority and the call site, not just the shortfall', async () => {
      // A refusal that only said "sparse" would leave a reader guessing whether the target
      // invented a constraint.
      const product = makeProductFixture({
        productID: 'sparse-message',
        skus: [aSortableSku('msg-a', 1), aSortableSku('msg-b', 2)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['msg-a', 'msg-b', 'msg-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));
      const rendered = String(refusal);

      expect(rendered).toContain('SkuSortOrderError');
      expect(rendered).toContain("product 'sparse-message'");
      expect(rendered).toContain('arrayResize');
      expect(rendered).toContain('model/service/SkuService.cfc:L264-L265');
      expect(rendered).toContain('3 row(s)');
      expect(rendered).toContain('2 SKU(s)');
    });

    it('★ names the INTERIOR hole, so the diagnosis is positional and not merely a count', async () => {
      // The two SKUs in hand are the FIRST and the LAST of the query's three rows, so the surplus
      // position is 1 - in the middle.
      const product = makeProductFixture({
        productID: 'sparse-interior',
        skus: [aSortableSku('interior-a', 1), aSortableSku('interior-c', 3)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['interior-a', 'interior-b', 'interior-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));

      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-interior',
        sortedIdentifierCount: 3,
        suppliedSkuCount: 2,
        unfilledPositions: [1],
      });
    });

    it('★ lists EVERY hole, in ascending order, not only the first one found', async () => {
      // Four rows, two SKUs, and the two SKUs occupy the outermost positions, so both 1 and 2 are
      // unfilled.
      const product = makeProductFixture({
        productID: 'sparse-pair',
        skus: [aSortableSku('pair-a', 1), aSortableSku('pair-d', 4)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['pair-a', 'pair-b', 'pair-c', 'pair-d'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));

      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-pair',
        sortedIdentifierCount: 4,
        suppliedSkuCount: 2,
        unfilledPositions: [1, 2],
      });
      expect(String(refusal)).toContain('position(s) 1, 2 unfilled');
    });

    it('★ refuses through the OTHER call site too, and names that site instead', async () => {
      const first = aSortableSku('other-a', 1);
      const second = aSortableSku('other-b', 2);

      const product = makeProductFixture({
        productID: 'sparse-other-site',
        skus: [first, second],
      });

      const repository = new RecordingSkuRepository({
        productSkus: [first, second],
        sortedProductSkuIDs: ['other-a', 'other-b', 'other-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getProductSkus(product, true));

      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-other-site',
        sortedIdentifierCount: 3,
        suppliedSkuCount: 2,
        unfilledPositions: [2],
      });
      expect(String(refusal)).toContain('model/service/SkuService.cfc:L236-L237');
    });

    it('★ leaves the arrayFind-answers-zero raise in front, where the legacy put it', async () => {
      // Two failure modes live in this body and their ORDER is behaviour.
      //
      // The input is equal-length on purpose: two rows, two SKUs.
      const product = makeProductFixture({
        productID: 'sparse-precedence',
        skus: [aSortableSku('precedence-a', 1), aSortableSku('precedence-absent', 2)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['precedence-a', 'precedence-b'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));
      const rendered = String(refusal);

      expect(rendered).toContain('arrayFind answered 0');
      expect(rendered).toContain('model/service/SkuService.cfc:L264-L265');
      expect(rendered).not.toContain('SkuSortOrderError');
      expect(rendered).not.toContain('arrayResize');
    });

    it('★ still answers a dense placement, by identity of members and with no holes', async () => {
      // The success set must be provably UNCHANGED by the refusal, otherwise the fix would have
      // traded an unsafe cast for a narrower method.
      //
      // `Object.keys(result).length` is the hole test that `toHaveLength` cannot make - a sparse
      // array reports its resized `length` while owning fewer index keys.
      const first = aSortableSku('dense-a', 1);
      const second = aSortableSku('dense-b', 2);
      const third = aSortableSku('dense-c', 3);

      const product = makeProductFixture({
        productID: 'dense-placement',
        skus: [third, second, first],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['dense-a', 'dense-b', 'dense-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const result = await subject.getSortedProductSkus(product);

      expect(result).toStrictEqual([first, second, third]);
      expect(result).toHaveLength(3);
      expect(Object.keys(result)).toHaveLength(3);
      expect(result.every((sku) => sku !== undefined)).toBe(true);
      expect(result.map((sku) => sku.getSkuID())).toStrictEqual(['dense-a', 'dense-b', 'dense-c']);
    });

    it('★ answers a dense placement through the other call site as well', async () => {
      // The same equal-length input through `getProductSkus`, so neither call site pays for the
      // refusal with a false negative.
      const first = aSortableSku('dense-other-a', 1);
      const second = aSortableSku('dense-other-b', 2);

      const product = makeProductFixture({
        productID: 'dense-other-site',
        skus: [first, second],
      });

      const repository = new RecordingSkuRepository({
        productSkus: [second, first],
        sortedProductSkuIDs: ['dense-other-a', 'dense-other-b'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const result = await subject.getProductSkus(product, true);

      expect(result).toStrictEqual([first, second]);
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe('getSkuStocksDeletableFlag - defect 28', () => {
    it('rejects for every input, including a well-formed identifier', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L281-L283]: getSkuStocksDeletableFlag calls a
      // method that exists nowhere in the codebase, so it throws unconditionally through
      // org/Hibachi/HibachiEntity.cfc:L565. Reproduced as a throwing stub rather than invented.
      // Preserved deliberately; do not fix without a product decision.
      const inputs: readonly string[] = [
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_D_ID,
        '',
        '   ',
        'sku-that-does-not-exist',
        '00000000-0000-0000-0000-000000000000',
      ];

      for (const skuID of inputs) {
        await expect(service.getSkuStocksDeletableFlag(skuID)).rejects.toThrow(Error);
      }

      await expect(service.getSkuStocksDeletableFlag(FIXTURE_SKU_A_ID)).rejects.toThrow(
        /is unreachable/,
      );

      // Not a resolved `false`, and not a resolved `undefined`.
      await expect(service.getSkuStocksDeletableFlag(FIXTURE_SKU_A_ID)).rejects.toBeInstanceOf(
        Error,
      );

      expect(skuRepository.productSkusCalls).toStrictEqual([]);
      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
      expect(skuRepository.searchSkusByProductTypeCalls).toStrictEqual([]);
      expect(skuRepository.sortedProductSkusIDCalls).toStrictEqual([]);
      expect(skuRepository.transactionExistsFlagCalls).toStrictEqual([]);
      expect(skuRepository.skusBySelectedOptionsCalls).toStrictEqual([]);
      expect(skuRepository.saveSkuCalls).toStrictEqual([]);
    });

    it('★ is deliberately absent from the SkuRepository port, which declares exactly seven members', () => {
      // The STRUCTURAL HALF of DEFECT 28, and the reason the reproduction is honest rather than
      // lazy: the port set was not widened to give this method something to call.
      // `@ts-expect-error`. `Exclude<K, keyof SkuRepository>` collapses to `never` the
      type AbsentFromSkuRepository = Exclude<'getSkuStocksDeletableFlag', keyof SkuRepository>;
      const absentMemberName: AbsentFromSkuRepository = 'getSkuStocksDeletableFlag';

      expect(absentMemberName).toBe('getSkuStocksDeletableFlag');

      // And the port's membership is EXACTLY these seven, proved exhaustively rather than by
      // counting a hand-written list.
      const declaredPortMembers = [
        'getTransactionExistsFlag',
        'getSkuBySkuCode',
        'getSkusBySelectedOptions',
        'searchSkusByProductType',
        'getProductSkus',
        'getSortedProductSkusID',
        'saveSku',
      ] as const satisfies readonly (keyof SkuRepository)[];

      type AssertNever<T extends never> = T;
      type UnnamedPortMembers = AssertNever<
        Exclude<keyof SkuRepository, (typeof declaredPortMembers)[number]>
      >;

      const unnamedPortMembers: UnnamedPortMembers[] = [];

      expect(unnamedPortMembers).toStrictEqual([]);
      expect(declaredPortMembers).toHaveLength(7);
      expect(declaredPortMembers).not.toContain('getSkuStocksDeletableFlag');
      expect(Object.getOwnPropertyNames(SkuService.prototype)).toContain(
        'getSkuStocksDeletableFlag',
      );
    });
  });

  // [model/dao/SkuDAO.cfc:L204-L220] memoises `variables.nextOptionGroupSortOrder` at COMPONENT
  // level - one value for the whole application lifetime.
  //
  // Two legacy behaviours make that memo actively dangerous rather than merely stale: the
  // aggregate always returns a row.

  describe('sort-order state is request-scoped, not shared between service instances', () => {
    /**
     * A SKU in a single option group, so a sorted read has something to order by.
     */
    function aSortableSku(skuID: string, optionGroupSortOrder: number): Sku {
      const optionGroup = anOptionGroup({
        optionGroupID: `scope-og-${String(optionGroupSortOrder)}`,
        sortOrder: optionGroupSortOrder,
      });

      return makeSkuFixture({
        idPrefix: skuID,
        skuID,
        options: [
          anOption({
            optionID: `scope-opt-${String(optionGroupSortOrder)}`,
            sortOrder: optionGroupSortOrder,
            optionGroup,
          }),
        ],
      });
    }

    it('★ does not let one service instance observe another instance sort order', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L213-L214]: the max() aggregate always returns one
      // row, so the recordCount guard is always true and an empty table yields '' + 1 =.
      // Preserved deliberately; do not fix without a product decision.
      //
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: the cache-clear guard is inverted, so the
      // clear can never fire. The target neutralises the hazard by request-scoping the value; this
      // test proves two independent service instances do not share it.
      // Preserved deliberately; do not fix without a product decision.
      const firstSku = aSortableSku('scope-sku-1', 1);
      const secondSku = aSortableSku('scope-sku-2', 2);
      const product = makeProductFixture({
        productID: 'scope-product',
        skus: [firstSku, secondSku],
      });

      const firstRepository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-1', 'scope-sku-2'],
      });
      const firstService = new SkuService(firstRepository, imageStore, subscriptionTermProvider);

      const secondRepository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-2', 'scope-sku-1'],
      });
      const secondService = new SkuService(secondRepository, imageStore, subscriptionTermProvider);

      const firstOrder = await firstService.getSortedProductSkus(product);
      expect(firstOrder.map((sku) => sku.getSkuID())).toStrictEqual(['scope-sku-1', 'scope-sku-2']);

      const secondOrder = await secondService.getSortedProductSkus(product);
      expect(secondOrder.map((sku) => sku.getSkuID())).toStrictEqual([
        'scope-sku-2',
        'scope-sku-1',
      ]);

      // Each instance asked its own repository, exactly once. A shared memo would have let the
      // second instance skip its query and inherit the first order.
      expect(firstRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-product']]);
      expect(secondRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-product']]);

      const firstOrderAgain = await firstService.getSortedProductSkus(product);
      expect(firstOrderAgain.map((sku) => sku.getSkuID())).toStrictEqual([
        'scope-sku-1',
        'scope-sku-2',
      ]);
    });

    it('★ does not let a populated instance rescue an instance whose order is empty', async () => {
      // The sharpest form of the isolation proof, and the one that directly exercises the
      // empty-aggregate defect. Instance one runs against a POPULATED order and succeeds.
      const firstSku = aSortableSku('scope-sku-1', 1);
      const secondSku = aSortableSku('scope-sku-2', 2);
      const product = makeProductFixture({
        productID: 'scope-empty-order',
        skus: [firstSku, secondSku],
      });

      const populatedRepository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-1', 'scope-sku-2'],
      });
      const populatedService = new SkuService(
        populatedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      expect(
        (await populatedService.getSortedProductSkus(product)).map((sku) => sku.getSkuID()),
      ).toStrictEqual(['scope-sku-1', 'scope-sku-2']);

      const emptyRepository = new RecordingSkuRepository({ sortedProductSkuIDs: [] });
      const emptyService = new SkuService(emptyRepository, imageStore, subscriptionTermProvider);

      await expect(emptyService.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);
      expect(emptyRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-empty-order']]);
    });

    it('re-consults the port on every call rather than memoising within one instance', async () => {
      const firstSku = aSortableSku('scope-sku-1', 1);
      const secondSku = aSortableSku('scope-sku-2', 2);
      const product = makeProductFixture({
        productID: 'scope-repeat',
        skus: [firstSku, secondSku],
      });
      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-1', 'scope-sku-2'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.getSortedProductSkus(product);
      await subject.getSortedProductSkus(product);
      await subject.getSortedProductSkus(product);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['scope-repeat'],
        ['scope-repeat'],
        ['scope-repeat'],
      ]);
    });

    it('holds no class-level or module-level state of its own', () => {
      expect(Object.getOwnPropertyNames(SkuService)).toStrictEqual(['length', 'name', 'prototype']);

      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L163]: the legacy DAO carries an INVALID DUPLICATE
      // `var hql &=...` declaration, re-declaring a name already declared in the same function.
      //
      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L107-L128]: the AND-of-EXISTS option-matching SQL behind
      // `getSkusBySelectedOptions` is likewise not asserted here. SQL text and parameter binding
      // belong to the integration tier.
      expect(skuRepository.skusBySelectedOptionsCalls).toStrictEqual([]);
    });
  });

  describe('processImageUpload - delegation to the image stub port and nothing more', () => {
    /**
     * A projection of the legacy `cffile` upload result struct.
     *
     * The values are deliberately not path-shaped and are never opened, resolved, stat-ed or
     * written.
     */
    function anUploadResult(): ImageUploadResult {
      return {
        serverDirectory: 'fixture-server-directory',
        serverFile: 'fixture-server-file.jpg',
        clientFileExt: 'jpg',
        contentType: 'image',
      };
    }

    it('preserves the allowed-extension allow-list verbatim', () => {
      // CFML parity [model/service/SkuService.cfc:L212]: the legacy passes
      // `allowedExtensions="jpg,jpeg,png,gif"` as a literal comma list, carried character for
      // character - same four extensions, same order, same lowercase, no spaces, no leading dots
      // and no `webp`.
      expect(ALLOWED_IMAGE_EXTENSIONS).toBe('jpg,jpeg,png,gif');
    });

    it('composes the image path and delegates it to the store', async () => {
      // `processImageUpload` is a pure delegation, and it now reaches the port.
      const sku = makeSkuFixture({
        andOfExistsMember: 'A',
        imageFile: 'nikeairjorden-sizeten.jpg',
        imageSettingValues: {
          baseImageURL: '/custom/assets/images',
          productImageOptionCodeDelimiter: '-',
          productImageDefaultExtension: 'jpg',
        },
      });
      await expect(service.processImageUpload(sku, anUploadResult())).resolves.toBe(sku);

      // [model/service/SkuService.cfc:L146] verbatim:
      // `"#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"`.
      expect(imageStore.saveImageFileCalls).toStrictEqual([
        [
          anUploadResult(),
          '/custom/assets/images/product/default/nikeairjorden-sizeten.jpg',
          ALLOWED_IMAGE_EXTENSIONS,
        ],
      ]);

      // The legacy did not delete anything on this path and neither does the port.
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });

    it('returns the same sku when the store reports the bytes were NOT persisted', async () => {
      // [model/service/SkuService.cfc:L213-L217] answered `false` on this branch, and AAP 0.4.2
      // maps the ported method to `Promise<Sku>`, so the value cannot be forwarded.
      //
      // No failure is being swallowed, and that is a property of the port rather than a hope.
      const refusingStore = new RecordingImageStore(false);
      const serviceOverRefusingStore = new SkuService(
        skuRepository,
        refusingStore,
        subscriptionTermProvider,
      );

      const sku = makeSkuFixture({
        andOfExistsMember: 'A',
        imageFile: 'nikeairjorden-sizeten.jpg',
        imageSettingValues: {
          baseImageURL: '/custom/assets/images',
          productImageOptionCodeDelimiter: '-',
          productImageDefaultExtension: 'jpg',
        },
      });

      await expect(
        serviceOverRefusingStore.processImageUpload(sku, anUploadResult()),
      ).resolves.toBe(sku);
      expect(refusingStore.saveImageFileCalls).toStrictEqual([
        [
          anUploadResult(),
          '/custom/assets/images/product/default/nikeairjorden-sizeten.jpg',
          ALLOWED_IMAGE_EXTENSIONS,
        ],
      ]);
      expect(refusingStore.deleteImageFileCalls).toStrictEqual([]);
    });

    it('refuses and stores nothing when the sku was hydrated without image settings', async () => {
      // A sku whose adapter never supplied the resolved image settings cannot compose a path, and
      // `src/domain/entities/sku.ts` RAISES rather than substituting a default.
      const sku = makeSkuFixture({ andOfExistsMember: 'A' });

      await expect(service.processImageUpload(sku, anUploadResult())).rejects.toThrow(
        /hydrated without image setting values/,
      );

      expect(imageStore.saveImageFileCalls).toStrictEqual([]);
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });

    it('never reaches the SKU repository while processing an upload', async () => {
      // The upload path touches neither persistence nor query. [model/service/SkuService.cfc:L212]
      // saves the file and returns; the legacy did not re-save the SKU, and neither does the port.
      const sku = makeSkuFixture({ andOfExistsMember: 'B' });

      await expect(service.processImageUpload(sku, anUploadResult())).rejects.toThrow(Error);

      expect(skuRepository.saveSkuCalls).toStrictEqual([]);
      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
    });
  });

  describe('searchSkusByProductType - both parameters forwarded exactly as given', () => {
    it('forwards a term and a product type identifier unchanged', async () => {
      const searchHit = makeSkuFixture({ andOfExistsMember: 'C' });
      const repository = new RecordingSkuRepository({ searchResults: [searchHit] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.searchSkusByProductType('jordan', 'product-type-1');

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_C_ID]);
      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([['jordan', 'product-type-1']]);
    });

    it('forwards absent parameters as absent, without substituting a default', async () => {
      // CFML parity [model/service/SkuService.cfc:L271-L279]: both parameters are OPTIONAL with no
      // default, and the legacy forwards `argumentCollection=arguments` so an omitted parameter
      // arrives omitted.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.searchSkusByProductType()).toStrictEqual([]);
      expect(await subject.searchSkusByProductType('jordan')).toStrictEqual([]);

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        [undefined, undefined],
        ['jordan', undefined],
      ]);
    });

    it('LEGACY-NOTE: the SKU-side parameter is singular where the product-side one is plural', async () => {
      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L130-L136 versus model/dao/ProductDAO.cfc:L419]:
      // `SkuDAO.searchSkusByProductType` takes a singular `productTypeID` while
      // `ProductDAO.searchProductsByProductType` takes a plural `productTypeIDs`.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.searchSkusByProductType('jordan', 'product-type-1,product-type-2');

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        ['jordan', 'product-type-1,product-type-2'],
      ]);
    });
  });

  describe('getTransactionExistsFlag - the port answer, unmodified', () => {
    it('answers true and false exactly as the port does', async () => {
      // CFML parity [model/service/SkuService.cfc:L285-L287]: the legacy body is a bare
      // `return getSkuDAO().getTransactionExistsFlag()` and applies no interpretation.
      const trueRepository = new RecordingSkuRepository({ transactionExistsFlag: true });
      const trueSubject = new SkuService(trueRepository, imageStore, subscriptionTermProvider);

      expect(await trueSubject.getTransactionExistsFlag()).toBe(true);
      expect(trueRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      const falseRepository = new RecordingSkuRepository({ transactionExistsFlag: false });
      const falseSubject = new SkuService(falseRepository, imageStore, subscriptionTermProvider);

      expect(await falseSubject.getTransactionExistsFlag()).toBe(false);
      expect(falseRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      // A strict boolean, not a truthy value. The legacy declares `returntype="boolean"` and CFML
      // would happily have returned the string "YES"; the port does not.
      expect(typeof (await trueSubject.getTransactionExistsFlag())).toBe('boolean');
    });
  });

  describe('getSkuBySkuCode - a miss is undefined, and an absent code raises', () => {
    it('returns the SKU the port answers with on a hit', async () => {
      const found = makeSkuFixture({ andOfExistsMember: 'A' });
      const repository = new RecordingSkuRepository({ skuBySkuCode: found });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSkuBySkuCode('TESTSKUXXX-A');

      expect(returned).toBe(found);
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['TESTSKUXXX-A']]);
    });

    it('★ returns undefined on a miss - not null, not zero, and not an empty object', async () => {
      // The highest-consequence absence check on this surface.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSkuBySkuCode('NO-SUCH-SKU-CODE');

      expect(returned).toBeUndefined();
      expect(returned).not.toBeNull();
      expect(returned).not.toBe(0);
      expect(returned).not.toStrictEqual({});
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['NO-SUCH-SKU-CODE']]);
    });

    it('raises when the code is omitted, because the DAO parameter is required', async () => {
      // CFML parity [model/service/SkuService.cfc:L289-L291 into model/dao/SkuDAO.cfc:L102]: the
      // SERVICE declares `string skuCode` - optional, no default - but forwards
      // `argumentCollection=arguments` into a DAO declaring `required string skuCode`.
      await expect(service.getSkuBySkuCode()).rejects.toThrow(/skuCode is absent/);

      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
    });

    it('forwards an empty string as an empty string, because the legacy did', async () => {
      // An empty string SATISFIES `required` in CFML, so the legacy reached the query with it and
      // matched nothing.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.getSkuBySkuCode('')).toBeUndefined();
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['']]);
    });
  });

  describe('findSkus - signature reshaping #2, with only the concrete legacy filters', () => {
    it('takes a typed criteria object and answers a typed page', async () => {
      // JUDGMENT CALL: legacy getSkuSmartList [model/service/SkuService.cfc:L309-L325] built a
      // HibachiSmartList, a generic string-keyed dynamic query builder supplied by the framework.
      const firstHit = makeSkuFixture({ andOfExistsMember: 'A' });
      const repository = new RecordingSkuRepository({ searchResults: [firstHit] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const criteria: SkuQueryCriteria = { keyword: 'jordan', productTypeID: 'product-type-1' };
      const page: SkuPage = await subject.findSkus(criteria);

      expect(page.skus.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_A_ID]);
      expect(page.keyword).toBe('jordan');

      expect(Object.keys(criteria).sort()).toStrictEqual(['keyword', 'productTypeID']);
    });

    it('★★ reports the ONE keyword property the executed statement matches, at weight 1', async () => {
      // This case is an inversion and was named "preserves the five keyword properties, all at
      // weight 1".
      //
      // Reporting five was not a documented gap, it was a false statement of what was matched: a
      // caller reading the page would expect a product-name search to find its SKUs.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(page.keywordProperties).toStrictEqual([{ propertyIdentifier: 'skuCode', weight: 1 }]);
      expect(page.keywordProperties).toHaveLength(1);

      // Weight 1 still holds and is still worth pinning: the legacy ranked nothing, and no
      // relevance scoring, boosting or ordering has been invented in the narrowing.
      expect(page.keywordProperties.every((property) => property.weight === 1)).toBe(true);

      // None of the four the smart list additionally configured is reported.
      const reported = page.keywordProperties.map((property) => property.propertyIdentifier);

      for (const unmatched of [
        'skuID',
        'product.productName',
        'product.productType.productTypeName',
        'alternateSkuCodes.alternateSkuCode',
      ]) {
        expect(reported).not.toContain(unmatched);
      }
    });

    it('★★ reports NO joins, because the executed statement performs none', async () => {
      // Every one of those observations is true of the SMART LIST and none is true of the
      // statement that runs.
      //
      // The three configured joins, their join types and the entity-lock reasoning about
      // `alternateSkuCodes` all survive as an inert record on `SKU_SMART_LIST_JOINS`.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(page.joins).toStrictEqual([]);
      expect(page.joins).toHaveLength(0);

      // The MEMBER still EXISTS, and that is deliberate rather than incidental: "this query joins
      // nothing" is the fact that tells a caller a SKU with no alternate codes, and one whose
      // product has no product type.
      expect(Object.keys(page)).toContain('joins');
      expect(Array.isArray(page.joins)).toBe(true);
    });

    it('routes the keyword and product type through the same port the legacy DAO served', async () => {
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.findSkus({ keyword: 'jordan', productTypeID: 'product-type-1' });

      await subject.findSkus({ keyword: 'air' });

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        ['jordan', 'product-type-1'],
        ['air', undefined],
      ]);
    });

    it('publishes no dynamic-filter surface for a caller to reach through', async () => {
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(Object.keys(page).sort()).toStrictEqual([
        'joins',
        'keyword',
        'keywordProperties',
        'skus',
      ]);
      expect(Object.keys(page)).not.toContain('smartList');
      expect(Object.keys(page)).not.toContain('filters');
      expect(Object.keys(page)).not.toContain('whereClause');
      expect(Object.keys(page)).not.toContain('orderBy');
      expect(Object.keys(page)).not.toContain('applyFilter');
    });
  });

  // The five are deliberately not unified in the source and are therefore not unified in the port:
  // a null test, two unconditional writes and two loop-index tests.
  describe('createSkus - the default-SKU designation reaches the product', () => {
    /**
     * A product whose base product type routes to the content-access branch.
     */
    function aContentAccessProduct(productID: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({
          productTypeID: 'pt-content-access',
          systemCode: 'contentAccess',
        }),
      });
    }

    it('STRATEGY 1 OF 5 - merchandise multi: FIRST-WINS, via a one-clause null test', async () => {
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-default-size', sortOrder: 1 });
      const large = anOption({
        optionID: 'opt-default-large',
        sortOrder: 1,
        optionGroup: sizeGroup,
      });
      const small = anOption({
        optionID: 'opt-default-small',
        sortOrder: 2,
        optionGroup: sizeGroup,
      });

      const product = makeProductFixture({ productID: 'default-sku-first-wins' });

      expect(product.getDefaultSku()).toBeUndefined();

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: 'opt-default-large,opt-default-small',
          resolvedOptions: [large, small],
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(2);

      // CFML parity [model/service/SkuService.cfc:L101-L103]: the guard is
      // `if(isNull(arguments.product.getDefaultSku()))` - one clause - and the write at
      // [model/service/SkuService.cfc:L102] is what makes the SECOND iteration's test fail.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(created[1]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe('TESTPRODUCTXXX-1');
    });

    it('STRATEGY 1 OF 5 - merchandise multi: DEFERS to a default the product already carried', async () => {
      // The other half of the null test, and the reason it is a null test rather than an
      // unconditional write: a product that already has a default keeps it, and none of the newly
      // created SKUs displaces it.
      const incumbent = makeSkuFixture({ skuID: 'incumbent-default-sku' });
      const shadeGroup = anOptionGroup({ optionGroupID: 'og-incumbent-shade', sortOrder: 1 });
      const shade = anOption({
        optionID: 'opt-incumbent-shade',
        sortOrder: 1,
        optionGroup: shadeGroup,
      });

      const product = makeProductFixture({
        productID: 'default-sku-incumbent',
        defaultSku: incumbent,
      });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: 'opt-incumbent-shade',
          resolvedOptions: [shade],
        }),
      ).toBe(true);

      expect(product.getSkus()).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(incumbent);
      expect(product.getDefaultSku()).not.toBe(product.getSkus()[0]);
    });

    it('STRATEGY 2 OF 5 - merchandise single: UNCONDITIONAL, overwriting an incumbent', async () => {
      // CFML parity [model/service/SkuService.cfc:L134]: no `isNull` test and no loop-index test.
      // This branch overwrites whatever default the product carried, which is exactly the
      // asymmetry with [model/service/SkuService.cfc:L101] that must survive the port.
      const incumbent = makeSkuFixture({ skuID: 'single-branch-incumbent' });
      const product = makeProductFixture({
        productID: 'default-sku-single-unconditional',
        defaultSku: incumbent,
      });

      // No `options` key at all, which is what routes to the single-SKU sub-branch.
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(incumbent);
    });

    it('STRATEGY 3 OF 5 - subscription: a LOOP-INDEX test on the first term only', async () => {
      const product = makeProductFixture({
        productID: 'default-sku-subscription',
        productType: aProductType({ productTypeID: 'pt-subscription', systemCode: 'subscription' }),
      });

      // All three list keys are supplied, and each for its own reason:
      // [model/service/SkuService.cfc:L143] and [model/service/SkuService.cfc:L148] gate the
      // branch on a non-empty list and record a failure otherwise.
      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1,term-2,term-3',
          subscriptionBenefits: 'benefit-1',
          renewalSubscriptionBenefits: 'renewal-1',
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(3);

      // CFML parity [model/service/SkuService.cfc:L166-L168]: `if(i == 1)`, not a null test. The
      // first iteration's SKU wins, and - unlike [model/service/SkuService.cfc:L101] - it would
      // overwrite an incumbent, because nothing is tested but the counter.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe('TESTPRODUCTXXX-2');
    });

    it('STRATEGY 4 OF 5 - content-access bundle: UNCONDITIONAL, like [L134]', async () => {
      const incumbent = makeSkuFixture({ skuID: 'bundle-branch-incumbent' });
      const product = aContentAccessProduct('default-sku-content-bundled');
      product.setDefaultSku(incumbent);

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2',
          bundleContentAccess: true,
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(1);

      // CFML parity [model/service/SkuService.cfc:L189]: unconditional, so the incumbent is
      // displaced - and note this branch's SIBLING at [model/service/SkuService.cfc:L197] is
      // guarded. Two strategies inside one branch, preserved as two.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(incumbent);
    });

    it('STRATEGY 5 OF 5 - content-access per-content: a LOOP-INDEX test on `c`', async () => {
      const product = aContentAccessProduct('default-sku-content-unbundled');

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2,access-3',
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(3);

      // CFML parity [model/service/SkuService.cfc:L197-L199]: `if(c == 1)`, mirroring
      // [model/service/SkuService.cfc:L166]'s test on `i` but in a branch whose sibling is
      // unconditional.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe('TESTPRODUCTXXX-1');
    });

    it('designates NOTHING when the chosen branch refused to create', async () => {
      // The negative case, and it matters: the content-access branch with no `accessContents`
      // records a validation failure and returns before any SKU exists
      // [model/service/SkuService.cfc:L176-L177].
      const product = aContentAccessProduct('default-sku-refused');

      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus()).toStrictEqual([]);
      expect(product.getDefaultSku()).toBeUndefined();
    });

    it('carries the resolved image-setting values onto every draft it mints', async () => {
      // Why this is pinned here.
      const configuredService = new SkuService(
        skuRepository,
        imageStore,
        subscriptionTermProvider,
        undefined,
        {
          baseImageURL: 'https://synthetic.example/assets/images',
          productImageOptionCodeDelimiter: '_',
          productImageDefaultExtension: 'webp',
        },
      );

      const product = makeProductFixture({ productID: 'draft-image-settings' });

      expect(await configuredService.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      const created = product.getSkus()[0];

      if (created === undefined) {
        throw new Error('the merchandise branch attached no SKU to assert against.');
      }

      // The CONFIGURED extension, not the mirrored default `jpg`.
      expect(created.generateImageFileName()).toBe('TESTPRODUCTXXX.webp');

      // And the base URL arrived too, so the path member can answer at all.
      created.setImageFile(created.generateImageFileName());
      expect(created.getImagePath()).toBe(
        'https://synthetic.example/assets/images/product/default/TESTPRODUCTXXX.webp',
      );

      // The DEFAULT-constructed service in `beforeEach` supplies none, and that is a real
      // hydration state rather than an error: the file-name member mirrors the source's own
      // metadata defaults, so it still answers.
      const defaultProduct = makeProductFixture({ productID: 'draft-no-image-settings' });

      expect(await service.createSkus(defaultProduct, { price: PRICE_DECIMAL })).toBe(true);

      const defaultDraft = defaultProduct.getSkus()[0];

      if (defaultDraft === undefined) {
        throw new Error('the merchandise branch attached no SKU to assert against.');
      }

      expect(defaultDraft.generateImageFileName()).toBe('TESTPRODUCTXXX.jpg');
    });
  });
});
