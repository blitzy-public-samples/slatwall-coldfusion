/**
 * `OptionService` — the Catalog's option and option-group service.
 *
 * Legacy origin: `model/service/OptionService.cfc`. AAP §0.4.1.8 mandates this file, §0.4.2.4 fixes the
 * three declared members and §0.4.2.5 fixes the four synthesized members that had no declaration
 * anywhere in the legacy tree, so interface parity is checkable member by member (AAP §0.8.3.1).
 *
 * Why the parity surface is seven members and not three. A reader who opens
 * `model/service/OptionService.cfc` finds three `public` declarations and might reasonably conclude the
 * port is three methods long. It is not, and the reason is IR-1: `onMissingMethod` at
 * `org/Hibachi/HibachiService.cfc:L255-L281` fabricated an implicit surface by prefix, dispatching a
 * `get`-prefixed name at `:L258` and splitting on the `smartlist` suffix at `:L259-L260`. That is why
 * four calls resolve at run time against a component that declares none of them — `getOption`,
 * `getOptionGroup`, `getOptionSmartList` and `getOptionGroupSmartList()`, each declared explicitly here.
 */

import type { ProductOptionFinder, ProductOptionGroupFinder } from '../domain/product/Product';
import type { Option } from '../domain/option/Option';
import type { OptionGroup } from '../domain/option/OptionGroup';
import type {
  SmartListInput,
  SmartListQueryPort,
  SmartListResult,
} from '../ports/SmartListQueryPort';
import type { OptionRepository } from '../ports/repositories/OptionRepository';
import { buildIdentifierQuery, translateSmartListInput } from '../ports/SmartListQueryPort';

/** One entry of a select projection — a display label paired with the value that is submitted. */
export interface SelectOption {
  readonly name: string;
  readonly value: string;
}

/** The ORM logical entity name for an option — `SwOption` rows. */
const OPTION_ENTITY_NAME = 'SlatwallOption';

/** The ORM logical entity name for an option group — `SwOptionGroup` rows. */
const OPTION_GROUP_ENTITY_NAME = 'SlatwallOptionGroup';

/*
 * The three property paths product's two relocated queries filter and ORDER on
 * Written as named constants rather than inline literals for one specific reason: the two product
 * paths differ by exactly one hop, they are used in adjacent members, and an inline literal in the
 * wrong one of the two would be a silent behaviour change that reads as a harmless copy. Naming them
 * makes the difference legible at each use site and confines the strings to one place.
 */

/**
 * `options.skus.product.productID` — the option-group-side path, at [model/entity/Product.cfc:L256].
 */
const PRODUCT_VIA_OPTIONS_PATH = 'options.skus.product.productID';

/** `skus.product.productID` — the option-side path, at [model/entity/Product.cfc:L344]. */
const PRODUCT_VIA_SKUS_PATH = 'skus.product.productID';

/**
 * `optionGroup.optionGroupID` — the group restriction, at [model/entity/Product.cfc:L343]. One hop,
 * over the required many-to-one at [model/entity/Option.cfc:L59].
 */
const OPTION_GROUP_ID_PATH = 'optionGroup.optionGroupID';

/**
 * `sortOrder` — the ordering property both relocated queries use, at
 * [model/entity/Product.cfc:L257] and [:L345], in both cases ascending.
 */
const SORT_ORDER_PROPERTY = 'sortOrder';

/**
 * The primary-identifier property of an option, as declared at [model/entity/Option.cfc:L52]
 * (`fieldtype="id"`). Used as the filter property for the identifier lookup in
 * {@link OptionService.getOption}.
 */
const OPTION_ID_PROPERTY = 'optionID';

/**
 * The primary-identifier property of an option group, as declared at
 * [model/entity/OptionGroup.cfc:L52] (`fieldtype="id"`). Used as the filter property for the
 * identifier lookup in {@link OptionService.getOptionGroup}.
 */
const OPTION_GROUP_ID_PROPERTY = 'optionGroupID';

/* Caller-input projection — turning a `SmartListInput` into a `SmartListQuery`. */

/*
 * Smart-list translation — delegated, NOT duplicated
 * A local copy of the entire `applyData` grammar used to live here: the key delimiters and prefix
 * constants, the add/remove filter folding, pattern-value wrapping, range parsing, order-statement and
 * keyword parsing, page-figure acceptance and a query composer. An equivalent copy lived in
 * `./SkuService`, and both restated what `../ports/SmartListQueryPort` now owns.
 */

/** The catalog's option and option-group service. */
export class OptionService {
  /**
   * Constructs the service from its two collaborators.
   *
   * @param optionRepository - The two option queries of `model/dao/OptionDAO.cfc`.
   * @param smartListQueryPort - The paginated dynamic-query abstraction.
   */
  public constructor(
    private readonly optionRepository: OptionRepository,
    private readonly smartListQueryPort: SmartListQueryPort,
  ) {}

  /**
   * Projects options into select entries — label and submitted value, one entry per input option.
   *
   * @param options - The options to project, in the order they should appear. Not mutated.
   * @returns One entry per input option, in input order. Empty when the input is empty.
   */
  public getOptionsForSelect(options: Option[]): SelectOption[] {
    const sortedOptions: SelectOption[] = [];

    for (const option of options) {
      sortedOptions.push({ name: option.optionName ?? '', value: option.optionID });
    }

    return sortedOptions;
  }

  /**
   * Lists the options a product may still be offered, as select entries.
   *
   * @param productID - The product whose SKUs determine what already counts as used.
   * @param existingOptionGroupIDList - Comma-delimited option-group identifiers already on that
   * product. An empty string is a legal and ordinary input.
   *
   * @returns The qualifying options as select entries, ordered by group name then option name.
   */
  public getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<SelectOption[]> {
    return this.optionRepository.findUnusedOptions(productID, existingOptionGroupIDList);
  }

  /**
   * Lists the option groups not yet present on a product, as select entries.
   *
   * @param existingOptionGroupIDList - Comma-delimited option-group identifiers already on the
   * product. An empty string is a legal and ordinary input, and yields every group.
   *
   * @returns The qualifying option groups as select entries, ordered by group name.
   */
  public getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<SelectOption[]> {
    return this.optionRepository.findUnusedOptionGroups(existingOptionGroupIDList);
  }

  /**
   * Loads one option by its identifier, or resolves `null` when no such option exists.
   *
   * @param optionID - The 32-character identifier of the option to load.
   * @returns The option, or `null` when none matches.
   */
  public async getOption(optionID: string): Promise<Option | null> {
    const records = await this.smartListQueryPort.executeRecords(
      buildIdentifierQuery(OPTION_ENTITY_NAME, OPTION_ID_PROPERTY, optionID),
    );

    return records[0] ?? null;
  }

  /**
   * Loads one option group by its identifier, or resolves `null` when no such group exists.
   *
   * @param optionGroupID - The 32-character identifier of the option group to load.
   * @returns The option group, or `null` when none matches.
   */
  public async getOptionGroup(optionGroupID: string): Promise<OptionGroup | null> {
    const records = await this.smartListQueryPort.executeRecords(
      buildIdentifierQuery(OPTION_GROUP_ENTITY_NAME, OPTION_GROUP_ID_PROPERTY, optionGroupID),
    );

    return records[0] ?? null;
  }

  /**
   * Runs a dynamic query over options and returns its materialised outcome.
   *
   * @param input - The caller-supplied query input. Optional, because the real call site supplies
   * none.
   *
   * @returns The records, the current page, and the count and paging figures derived from them.
   */
  public getOptionSmartList(input?: SmartListInput): Promise<SmartListResult<Option>> {
    return this.smartListQueryPort.execute(
      translateSmartListInput({ entityName: OPTION_ENTITY_NAME, input }),
    );
  }

  /**
   * Runs a dynamic query over option groups and returns its materialised outcome.
   *
   * @param input - The caller-supplied query input. Optional, because the real call site supplies
   * none.
   *
   * @returns The records, the current page, and the count and paging figures derived from them.
   */
  public getOptionGroupSmartList(input?: SmartListInput): Promise<SmartListResult<OptionGroup>> {
    return this.smartListQueryPort.execute(
      translateSmartListInput({ entityName: OPTION_GROUP_ENTITY_NAME, input }),
    );
  }

  /* Product's two relocated distinct queries. */
}

/*
 * The two product-scoped option queries — module scope, not service members
 * Relocated out of {@link OptionService} because they answer an entity's question rather than the
 * service's — `product.getOptionGroups` and `product.getOptionsByOptionGroup` — and not because of
 * any limit on how many members the service may declare. The reasoning for the placement, and for building
 * `SmartListQuery` values rather than routing through `SmartListInput`, is recorded once on the
 * section comment inside the class and is not repeated here.
 */

/**
 * Resolves the option groups in use by a product — the query relocated out of
 * [model/entity/Product.cfc:L251-L261].
 *
 * @param smartListQueryPort - The paginated dynamic-query boundary (AAP §0.2.2.7).
 * @param productID - The product's 32-character identifier (IR-6).
 * @returns The product's option groups: distinct, ordered by `sortOrder` ascending, unpaginated.
 */
export async function findProductOptionGroups(
  smartListQueryPort: SmartListQueryPort,
  productID: string,
): Promise<OptionGroup[]> {
  const result = await smartListQueryPort.execute({
    entityName: OPTION_GROUP_ENTITY_NAME,
    selectDistinctFlag: true,
    whereGroups: [
      { filters: [{ propertyIdentifier: PRODUCT_VIA_OPTIONS_PATH, value: productID }] },
    ],
    orders: [{ propertyIdentifier: SORT_ORDER_PROPERTY, direction: 'ASC' }],
  });
  return [...result.records];
}

/**
 * Resolves the options of one option group that are in use by a product — the query relocated out of
 * [model/entity/Product.cfc:L340-L347].
 *
 * @param smartListQueryPort - The paginated dynamic-query boundary (AAP §0.2.2.7).
 * @param optionGroupID - The option group to restrict to; the legacy first filter.
 * @param productID - The product's 32-character identifier; the legacy second filter.
 * @returns The matching options: distinct, ordered by `sortOrder` ascending, unpaginated.
 */
export async function findProductOptionsByOptionGroup(
  smartListQueryPort: SmartListQueryPort,
  optionGroupID: string,
  productID: string,
): Promise<Option[]> {
  const result = await smartListQueryPort.execute({
    entityName: OPTION_ENTITY_NAME,
    selectDistinctFlag: true,
    whereGroups: [
      {
        filters: [
          { propertyIdentifier: OPTION_GROUP_ID_PATH, value: optionGroupID },
          { propertyIdentifier: PRODUCT_VIA_SKUS_PATH, value: productID },
        ],
      },
    ],
    orders: [{ propertyIdentifier: SORT_ORDER_PROPERTY, direction: 'ASC' }],
  });
  return [...result.records];
}

/**
 * Binds the two module-scope queries to a port and returns the pair of finder capabilities
 * `src/domain/product/Product.ts` asks for.
 *
 * @param smartListQueryPort - The paginated dynamic-query boundary (AAP §0.2.2.7).
 * @returns One object satisfying both finder contracts, safe to share for the life of an invocation.
 */
export function createProductOptionFinders(
  smartListQueryPort: SmartListQueryPort,
): ProductOptionGroupFinder & ProductOptionFinder {
  return Object.freeze({
    getOptionGroupsForProduct: (productID: string): Promise<OptionGroup[]> =>
      findProductOptionGroups(smartListQueryPort, productID),
    getOptionsForProductByOptionGroup: (
      optionGroupID: string,
      productID: string,
    ): Promise<Option[]> =>
      findProductOptionsByOptionGroup(smartListQueryPort, optionGroupID, productID),
  });
}

/*
 * Compile-time guards — OptionService really satisfies product's two injected contracts
 * `src/domain/product/Product.ts` declares `ProductOptionGroupFinder` and `ProductOptionFinder` and
 * takes each as a parameter, because puts paginated dynamic queries outside the domain layer. Those
 * two interfaces name the capability; the two members above are what provides it.
 */

/** Fails to instantiate unless its argument is exactly `true`. */
type SatisfiesContract<TRelation extends true> = TRelation;

/** `OptionService` provides `Product.getOptionGroups`'s injected capability. */
export type ProductOptionFindersSatisfyGroupFinder = SatisfiesContract<
  ReturnType<typeof createProductOptionFinders> extends ProductOptionGroupFinder ? true : false
>;

/** `OptionService` provides `Product.getOptionsByOptionGroup`'s injected capability. */
export type ProductOptionFindersSatisfyOptionFinder = SatisfiesContract<
  ReturnType<typeof createProductOptionFinders> extends ProductOptionFinder ? true : false
>;
