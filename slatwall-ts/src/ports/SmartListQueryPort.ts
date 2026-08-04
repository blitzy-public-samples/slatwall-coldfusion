/**
 * SmartListQueryPort — the paginated dynamic-query abstraction the ported SmartList members and the
 * Google product-feed controller depend on.
 *
 * Legacy origin:
 * Org/Hibachi/HibachiSmartList.cfc — the framework's dynamic paginated HQL composition. Per AAP
 * §0.8.3.2 the `org/Hibachi/**` tree is "a boundary to extract from, never modify": its contract
 * is read here and none of its implementation is carried over. Every declaration this file
 * mirrors is cited by line so the mapping is checkable.
 * Model/service/ProductService.cfc:L342 — `getProductSmartList`, consumer 1.
 * Model/service/SkuService.cfc:L309 — `getSkuSmartList`, consumer 2.
 * integrationServices/google/controllers/feed.cfc:L58 — `product(rc)`, consumer 3.
 * Why this is a boundary port rather than something the feed resolves itself. The feed's
 * availability gate is `addRange('product.calculatedQATS','1^')` at
 * integrationServices/google/controllers/feed.cfc:L72, which reads a calculated inventory property
 * (AAP §0.6.4.1). Inventory and stock are excluded from the slice (AAP §0.2.2.1), so the port is
 * what lets the feed express that gate without converting the inventory subsystem (TR-5). It is also
 * the mechanism behind AAP §0.8.3.8 strangler-fig independence.
 */

/*
 * Translation decisions — AAP §0.8.2 Guideline 6 requires that "all technology-specific translation
 * decisions" be documented "with clear comments, especially anywhere legacy behavior ... required
 * an explicit judgment call". Each judgment made in this file is recorded below with its locator.
 */

/* Omission record — AAP §0.7.3 ("flag mismatches rather than assume them away"). */

import type { Option, OptionPropertyName } from '../domain/option/Option';
import type { OptionGroup, OptionGroupPropertyName } from '../domain/option/OptionGroup';
import type { Brand, BrandPropertyName } from '../domain/product/Brand';
import type { Product, ProductPropertyName } from '../domain/product/Product';
import type { ProductType, ProductTypePropertyName } from '../domain/product/ProductType';
import type { Sku, SkuPropertyName } from '../domain/sku/Sku';

/** The sub-entity path delimiter, declared at org/Hibachi/HibachiSmartList.cfc:L32. */
const SMARTLIST_SUB_ENTITY_DELIMITER = '.';

/**
 * A logical property path, exactly as the legacy members accept it.
 *
 * TODO(parity): an unresolvable path is silently discarded rather than reported. Every legacy
 * accumulator is wrapped in a length test on the resolved property — filters at
 * org/Hibachi/HibachiSmartList.cfc:L369, like filters at org/Hibachi/HibachiSmartList.cfc:L396, in
 * filters at org/Hibachi/HibachiSmartList.cfc:L422, ranges at
 * org/Hibachi/HibachiSmartList.cfc:L449, orders at org/Hibachi/HibachiSmartList.cfc:L480 and
 * keyword properties at org/Hibachi/HibachiSmartList.cfc:L487 — so a mistyped path yields a query
 * with the entry missing instead of an error. Carried, not repaired: the adapter drops the entry
 * silently, and this interface deliberately provides no channel for reporting that it did.
 */
export type SmartListPropertyIdentifier<TEntity extends SmartListEntityName = SmartListEntityName> =
  SmartListPropertyPath<TEntity> | ResolvedSmartListProperty<TEntity>;

/* The entity schema the closed identifiers are derived from. */

/** The ORM logical entity names this port's identifiers may be rooted at or traverse. */
export type SmartListEntityName =
  | 'SlatwallSku'
  | 'SlatwallProduct'
  | 'SlatwallProductType'
  | 'SlatwallBrand'
  | 'SlatwallOption'
  | 'SlatwallOptionGroup'
  | 'SlatwallAlternateSkuCode';

/** Each entity's own filterable property names, keyed by logical entity name. */
export interface SmartListEntityOwnProperty {
  SlatwallSku: SkuPropertyName;
  SlatwallProduct: ProductPropertyName;
  SlatwallProductType: ProductTypePropertyName;
  SlatwallBrand: BrandPropertyName;
  SlatwallOption: OptionPropertyName;
  SlatwallOptionGroup: OptionGroupPropertyName;
  SlatwallAlternateSkuCode: AlternateSkuCodePropertyName;
}

/**
 * `SlatwallAlternateSkuCode`'s property surface, read from model/entity/AlternateSkuCode.cfc:L52-L57.
 */
export type AlternateSkuCodePropertyName =
  'alternateSkuCodeID' | 'alternateSkuCode' | 'alternateSkuCodeType' | 'sku';

/**
 * Each entity's traversable relationships, mapping the relationship property to the entity it
 * reaches. Read from the legacy `many-to-one` and `one-to-many` declarations of the six in-scope
 * entity files plus `model/entity/AlternateSkuCode.cfc:L57`; only relationships whose target is
 * itself a {@link SmartListEntityName} appear.
 *
 * Every path the slice writes is spanned by this map:
 * - `product.productName`, `product.productType.productTypeName` — model/service/SkuService.cfc:L317
 * - `alternateSkuCodes.alternateSkuCode` — model/service/SkuService.cfc:L321
 * - `product.activeFlag`, `product.publishedFlag`, `product.calculatedQATS` —
 *   integrationServices/google/controllers/feed.cfc:L68-L72
 * - `optionGroup.optionGroupID`, `skus.product.productID` — model/entity/Product.cfc:L343-L344
 * - `options.skus.product.productID` — model/entity/Product.cfc:L256
 * - `brand.brandName` — model/service/ProductService.cfc:L352
 */
export interface SmartListEntityRelationships {
  SlatwallSku: {
    product: 'SlatwallProduct';
    options: 'SlatwallOption';
    alternateSkuCodes: 'SlatwallAlternateSkuCode';
  };
  SlatwallProduct: {
    brand: 'SlatwallBrand';
    productType: 'SlatwallProductType';
    defaultSku: 'SlatwallSku';
    skus: 'SlatwallSku';
  };
  SlatwallProductType: {
    parentProductType: 'SlatwallProductType';
    childProductTypes: 'SlatwallProductType';
    products: 'SlatwallProduct';
  };
  SlatwallBrand: { products: 'SlatwallProduct' };
  SlatwallOption: { optionGroup: 'SlatwallOptionGroup'; skus: 'SlatwallSku' };
  SlatwallOptionGroup: { options: 'SlatwallOption' };
  SlatwallAlternateSkuCode: { sku: 'SlatwallSku' };
}

/** The number of dot-separated segments the literal path union is generated to. */
export type SMARTLIST_MAX_TYPED_PATH_SEGMENTS = 4;

/** Recursion budget for {@link SmartListPropertyPathToDepth}; index `n` yields `n - 1`. */
type SmartListPathDepth = 0 | 1 | 2 | 3 | 4;
type SmartListDepthPredecessor = [never, 0, 1, 2, 3];

/** Every legal property path on `TEntity`, generated to `TDepth` segments. */
type SmartListPropertyPathToDepth<
  TEntity extends SmartListEntityName,
  TDepth extends SmartListPathDepth,
> = TEntity extends SmartListEntityName
  ? TDepth extends 0
    ? never
    : | SmartListEntityOwnProperty[TEntity]
      | {
          [TRelationship in keyof SmartListEntityRelationships[TEntity]]: `${TRelationship &
            string}.${SmartListPropertyPathToDepth<
            SmartListEntityRelationships[TEntity][TRelationship] & SmartListEntityName,
            SmartListDepthPredecessor[TDepth] & SmartListPathDepth
          >}`;
        }[keyof SmartListEntityRelationships[TEntity]]
  : never;

/** Every legal property path on `TEntity`, as a compile-time union. */
export type SmartListPropertyPath<TEntity extends SmartListEntityName> =
  SmartListPropertyPathToDepth<TEntity, SMARTLIST_MAX_TYPED_PATH_SEGMENTS>;

declare const RESOLVED_SMARTLIST_PROPERTY: unique symbol;

/** A property path that has been validated at runtime against {@link SMARTLIST_ENTITY_SCHEMA}. */
export type ResolvedSmartListProperty<TEntity extends SmartListEntityName> = string & {
  readonly [RESOLVED_SMARTLIST_PROPERTY]: TEntity;
};

/** One entity's runtime whitelist: its own filterable names, and its traversable relationships. */
interface SmartListEntitySchemaEntry {
  readonly ownProperties: readonly string[];
  readonly relationships: Readonly<Record<string, SmartListEntityName | undefined>>;
}

/* The one runtime pair this port retains. */

/** The runtime whitelist {@link resolveSmartListPropertyIdentifier} consults. */
export const SMARTLIST_ENTITY_SCHEMA: Readonly<
  Record<SmartListEntityName, SmartListEntitySchemaEntry>
> = Object.freeze({
  SlatwallSku: Object.freeze({
    ownProperties: Object.freeze([
      'skuID',
      'activeFlag',
      'skuCode',
      'listPrice',
      'price',
      'renewalPrice',
      'imageFile',
      'userDefinedPriceFlag',
      'calculatedQATS',
      'product',
      'subscriptionTerm',
      'alternateSkuCodes',
      'attributeValues',
      'orderItems',
      'skuCurrencies',
      'stocks',
      'options',
      'accessContents',
      'subscriptionBenefits',
      'renewalSubscriptionBenefits',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'physicals',
      'remoteID',
    ] as const satisfies readonly SkuPropertyName[]),
    relationships: Object.freeze({
      product: 'SlatwallProduct',
      options: 'SlatwallOption',
      alternateSkuCodes: 'SlatwallAlternateSkuCode',
    } as const),
  }),
  SlatwallProduct: Object.freeze({
    ownProperties: Object.freeze([
      'productID',
      'activeFlag',
      'urlTitle',
      'productName',
      'productCode',
      'productDescription',
      'publishedFlag',
      'sortOrder',
      'calculatedSalePrice',
      'calculatedQATS',
      'calculatedAllowBackorderFlag',
      'calculatedTitle',
      'brand',
      'productType',
      'defaultSku',
      'skus',
      'productImages',
      'attributeValues',
      'productReviews',
      'listingPages',
      'categories',
      'relatedProducts',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'vendors',
      'physicals',
      'remoteID',
    ] as const satisfies readonly ProductPropertyName[]),
    relationships: Object.freeze({
      brand: 'SlatwallBrand',
      productType: 'SlatwallProductType',
      defaultSku: 'SlatwallSku',
      skus: 'SlatwallSku',
    } as const),
  }),
  SlatwallProductType: Object.freeze({
    ownProperties: Object.freeze([
      'productTypeID',
      'productTypeIDPath',
      'activeFlag',
      'publishedFlag',
      'urlTitle',
      'productTypeName',
      'productTypeDescription',
      'systemCode',
      'parentProductType',
      'childProductTypes',
      'products',
      'attributeValues',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'priceGroupRates',
      'priceGroupRateExclusions',
      'attributeSets',
      'physicals',
      'remoteID',
    ] as const satisfies readonly ProductTypePropertyName[]),
    relationships: Object.freeze({
      parentProductType: 'SlatwallProductType',
      childProductTypes: 'SlatwallProductType',
      products: 'SlatwallProduct',
    } as const),
  }),
  SlatwallBrand: Object.freeze({
    ownProperties: Object.freeze([
      'brandID',
      'activeFlag',
      'publishedFlag',
      'urlTitle',
      'brandName',
      'brandWebsite',
      'attributeValues',
      'products',
      'promotionRewards',
      'promotionRewardExclusions',
      'promotionQualifiers',
      'promotionQualifierExclusions',
      'vendors',
      'physicals',
      'remoteID',
    ] as const satisfies readonly BrandPropertyName[]),
    relationships: Object.freeze({ products: 'SlatwallProduct' } as const),
  }),
  SlatwallOption: Object.freeze({
    ownProperties: Object.freeze([
      'optionID',
      'optionCode',
      'optionName',
      'optionDescription',
      'sortOrder',
      'optionGroup',
      'skus',
      'remoteID',
    ] as const satisfies readonly OptionPropertyName[]),
    relationships: Object.freeze({
      optionGroup: 'SlatwallOptionGroup',
      skus: 'SlatwallSku',
    } as const),
  }),
  SlatwallOptionGroup: Object.freeze({
    ownProperties: Object.freeze([
      'optionGroupID',
      'optionGroupName',
      'optionGroupCode',
      'optionGroupImage',
      'optionGroupDescription',
      'imageGroupFlag',
      'sortOrder',
      'remoteID',
      'options',
    ] as const satisfies readonly OptionGroupPropertyName[]),
    relationships: Object.freeze({ options: 'SlatwallOption' } as const),
  }),
  SlatwallAlternateSkuCode: Object.freeze({
    ownProperties: Object.freeze([
      'alternateSkuCodeID',
      'alternateSkuCode',
      'alternateSkuCodeType',
      'sku',
    ] as const satisfies readonly AlternateSkuCodePropertyName[]),
    relationships: Object.freeze({ sku: 'SlatwallSku' } as const),
  }),
});

/* Drift guards — the runtime whitelist and the type-level whitelist must state the same thing. */
type SmartListWhitelistIsComplete<TDeclared extends string, TRuntime extends string> = [
  TDeclared,
] extends [TRuntime]
  ? true
  : never;

type _SkuWhitelistComplete = SmartListWhitelistIsComplete<
  SkuPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallSku']['ownProperties'][number]
>;
type _ProductWhitelistComplete = SmartListWhitelistIsComplete<
  ProductPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallProduct']['ownProperties'][number]
>;
type _ProductTypeWhitelistComplete = SmartListWhitelistIsComplete<
  ProductTypePropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallProductType']['ownProperties'][number]
>;
type _BrandWhitelistComplete = SmartListWhitelistIsComplete<
  BrandPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallBrand']['ownProperties'][number]
>;
type _OptionWhitelistComplete = SmartListWhitelistIsComplete<
  OptionPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallOption']['ownProperties'][number]
>;
type _OptionGroupWhitelistComplete = SmartListWhitelistIsComplete<
  OptionGroupPropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallOptionGroup']['ownProperties'][number]
>;
type _AlternateSkuCodeWhitelistComplete = SmartListWhitelistIsComplete<
  AlternateSkuCodePropertyName,
  (typeof SMARTLIST_ENTITY_SCHEMA)['SlatwallAlternateSkuCode']['ownProperties'][number]
>;

/**
 * Forces the seven drift guards to be evaluated. Each must be `true`; a `never` from any of them
 * makes this declaration fail to compile.
 */
const SMARTLIST_WHITELIST_GUARDS: readonly [
  _SkuWhitelistComplete,
  _ProductWhitelistComplete,
  _ProductTypeWhitelistComplete,
  _BrandWhitelistComplete,
  _OptionWhitelistComplete,
  _OptionGroupWhitelistComplete,
  _AlternateSkuCodeWhitelistComplete,
] = [true, true, true, true, true, true, true];
void SMARTLIST_WHITELIST_GUARDS;

/**
 * Resolves a caller-supplied property path against the declared whitelist, or reports that it does
 * not resolve.
 *
 * @param entityName - The entity the path is rooted at.
 * @param candidate - The raw path, as supplied. Never mutated, trimmed or rewritten: this function
 * decides membership and nothing else, so the value the adapter receives is the value that was
 * validated.
 *
 * @returns The same string, branded as resolved, or `undefined` when any segment fails to resolve.
 */
export function resolveSmartListPropertyIdentifier<TEntity extends SmartListEntityName>(
  entityName: TEntity,
  candidate: string,
): SmartListPropertyIdentifier<TEntity> | undefined {
  const segments = candidate.split(SMARTLIST_SUB_ENTITY_DELIMITER);
  let cursor: SmartListEntityName = entityName;

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    // A leading, trailing or doubled delimiter yields an empty segment, which names nothing.
    if (segment === undefined || segment.length === 0) {
      return undefined;
    }

    const schema = SMARTLIST_ENTITY_SCHEMA[cursor];

    if (index === segments.length - 1) {
      return schema.ownProperties.includes(segment)
        ? (candidate as ResolvedSmartListProperty<TEntity>)
        : undefined;
    }

    const nextEntityName = schema.relationships[segment];
    if (nextEntityName === undefined) {
      return undefined;
    }
    cursor = nextEntityName;
  }

  // Unreachable for any string: `split` always yields at least one segment, and the loop returns on
  // the last one. Present because `noImplicitReturns` requires every path to produce a value.
  return undefined;
}

/** A value supplied to a filter. */
export type SmartListFilterValue = string | number | boolean;

/** How a related-property join is performed. */
export type SmartListJoinType = '' | 'left';

/** One related-property join. */
export type SmartListJoin = {
  [TParentEntityName in SmartListEntityName]: {
    /**
     * The already-present entity the join hangs off, as an ORM logical entity name —
     * `SlatwallProduct` or `SlatwallSku` in this slice. First parameter at
     * org/Hibachi/HibachiSmartList.cfc:L212.
     */
    readonly parentEntityName: TParentEntityName;

    /**
     * The relationship on that parent entity to join across — for example `productType`,
     * `defaultSku`, `brand`, `product` or `alternateSkuCodes`. Second parameter at
     * org/Hibachi/HibachiSmartList.cfc:L212. Drawn from
     * {@link SmartListEntityRelationships}, so only relationships the parent actually declares are
     * admitted, and only those whose target is itself in scope — see the traversal-boundary note on
     * {@link SmartListEntityRelationships}.
     */
    readonly relatedProperty: keyof SmartListEntityRelationships[TParentEntityName] & string;

    /**
     * How to join. Absent means the empty-string default of org/Hibachi/HibachiSmartList.cfc:L212,
     * which the emitter resolves to a left join at org/Hibachi/HibachiSmartList.cfc:L539-L541.
     */
    readonly joinType?: SmartListJoinType;
  };
}[SmartListEntityName];

/**
 * One association to project onto each returned record — see {@link SmartListQuery.associationProjections}.
 */
export type SmartListAssociationProjection = {
  [TParentEntityName in SmartListEntityName]: {
    /** The entity the association hangs off — must be the parent of a declared join. */
    readonly parentEntityName: TParentEntityName;

    /** The relationship to project, constrained to those the parent entity actually declares. */
    readonly relatedProperty: keyof SmartListEntityRelationships[TParentEntityName] & string;
  };
}[SmartListEntityName];

/**
 * One equality, like or in filter, depending on which collection of a where group it appears in.
 */
export interface SmartListFilter<TEntity extends SmartListEntityName = SmartListEntityName> {
  /**
   * The logical property path to test. First parameter at org/Hibachi/HibachiSmartList.cfc:L362.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

  readonly value: SmartListFilterValue;
}

/**
 * One range filter, with each bound independently optional.
 *
 * TODO(parity): a malformed range value is silently discarded. The entire body of the legacy
 * accumulator sits inside the well-formedness test at org/Hibachi/HibachiSmartList.cfc:L446, so a
 * value failing it is dropped and the query runs unfiltered. Carried: `translateSmartListRange` in
 * the caller-struct translation section of `src/ports/SmartListQueryPort.ts` returns `undefined` for such a value and nothing throws. That function
 * is the sole interpreter of a range string in this subtree — it reproduces both the acceptance test
 * above and the emission rules at org/Hibachi/HibachiSmartList.cfc:L632-L655 — so this note describes
 * real behaviour with one implementation rather than a convention each caller is trusted to follow.
 *
 * TODO(parity): reading a range back yields an empty string, not an empty collection, when the
 * property has no range in the group — org/Hibachi/HibachiSmartList.cfc:L468, inside the accessor
 * at org/Hibachi/HibachiSmartList.cfc:L461-L471. The equality, like and in accessors do the same at
 * org/Hibachi/HibachiSmartList.cfc:L388, org/Hibachi/HibachiSmartList.cfc:L414 and
 * org/Hibachi/HibachiSmartList.cfc:L440. This port carries no read-back accessors at all — a
 * description is its own state, so there is nothing to read back — but the behaviour is recorded
 * because a port that did add accessors would have to reproduce it rather than return an empty
 * list.
 *
 * TODO(parity): a range value of length one or less is skipped at emission by the guard at
 * org/Hibachi/HibachiSmartList.cfc:L632, and a value carrying no delimiter takes the both-bounds
 * branch with the first and last elements equal, so it constrains the property to a single value
 * rather than to an interval. Both behaviours belong to the adapter's translation of these bounds.
 */
export interface SmartListRange<TEntity extends SmartListEntityName = SmartListEntityName> {
  /**
   * The logical property path to bound. First parameter at org/Hibachi/HibachiSmartList.cfc:L445.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

  /**
   * Inclusive lower bound. Present alone for the open-ended lower case of
   * org/Hibachi/HibachiSmartList.cfc:L642 — the shape of the feed's gate at
   * integrationServices/google/controllers/feed.cfc:L72. Absent means unbounded below.
   */
  readonly lowerBound?: string | number;

  /**
   * Inclusive upper bound. Present alone for the open-ended upper case of
   * org/Hibachi/HibachiSmartList.cfc:L635. Absent means unbounded above.
   */
  readonly upperBound?: string | number;
}

/**
 * One where group: the unit of grouping declared at org/Hibachi/HibachiSmartList.cfc:L14, whose
 * hint reads "this holds all filters and ranges".
 */
export interface SmartListWhereGroup {
  /**
   * Equality tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L362 and emitted
   * at org/Hibachi/HibachiSmartList.cfc:L578-L600.
   */
  readonly filters?: readonly SmartListFilter[];

  /**
   * Pattern tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L393. The
   * caller-supplied input wraps each element of a multi-value entry in the pattern wildcard at
   * org/Hibachi/HibachiSmartList.cfc:L108-L113, so a value arriving here already carries whatever
   * wildcards were intended — as at model/entity/Product.cfc:L132, which supplies its own trailing
   * wildcard.
   */
  readonly likeFilters?: readonly SmartListFilter[];

  /**
   * Set-membership tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L419, whose
   * value is a delimited list of candidates using the delimiter at
   * org/Hibachi/HibachiSmartList.cfc:L33.
   */
  readonly inFilters?: readonly SmartListFilter[];

  /**
   * Bounded-range tests. Accumulated by the member at org/Hibachi/HibachiSmartList.cfc:L445 and
   * emitted at org/Hibachi/HibachiSmartList.cfc:L630-L657.
   */
  readonly ranges?: readonly SmartListRange[];
}

/**
 * One property registered as searchable, with its weight.
 *
 * TODO(parity): the weight never reaches the emitted predicate. Its complete set of references in
 * the legacy file is the declaration at org/Hibachi/HibachiSmartList.cfc:L20, the assignment at
 * org/Hibachi/HibachiSmartList.cfc:L488, a presence count at org/Hibachi/HibachiSmartList.cfc:L672,
 * a key-only iteration at org/Hibachi/HibachiSmartList.cfc:L685 and a copy into the serialised
 * state at org/Hibachi/HibachiSmartList.cfc:L1073. The predicate written at
 * org/Hibachi/HibachiSmartList.cfc:L687 is a plain pattern test with no weighting whatsoever, so
 * the stored number has no effect on which rows match or on the order they arrive in. It is carried
 * because it is part of the observable argument list, and because all ten in-scope values are equal
 * anyway, so no call site can demonstrate a difference.
 */
export interface SmartListKeywordProperty<
  TEntity extends SmartListEntityName = SmartListEntityName,
> {
  /**
   * The logical property path to search. First parameter at org/Hibachi/HibachiSmartList.cfc:L485.
   * Observed values span plain, one-hop and two-hop paths — see
   * model/service/SkuService.cfc:L318-L322.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

  /**
   * Relative weight. Second parameter at org/Hibachi/HibachiSmartList.cfc:L485; required, and one
   * at every in-scope call site.
   */
  readonly weight: number;
}

/** Sort direction. */
export type SmartListOrderDirection = 'ASC' | 'DESC';

/**
 * One ordering term.
 *
 * TODO(parity): the legacy accumulator declares a position argument at
 * org/Hibachi/HibachiSmartList.cfc:L473 and never reads it — terms are always appended at the end
 * (org/Hibachi/HibachiSmartList.cfc:L481). No insert-at-position capability is therefore offered
 * here; adding one would be new behavior.
 */
export interface SmartListOrder<TEntity extends SmartListEntityName = SmartListEntityName> {
  /**
   * The logical property path to sort by. Parsed from the statement at
   * org/Hibachi/HibachiSmartList.cfc:L474.
   */
  readonly propertyIdentifier: SmartListPropertyIdentifier<TEntity>;

  /** Sort direction, resolved at org/Hibachi/HibachiSmartList.cfc:L475-L478. */
  readonly direction: SmartListOrderDirection;
}

/** Offset pagination. */
export interface SmartListPagination {
  /**
   * One-based index of the first record on the page. Declared at
   * org/Hibachi/HibachiSmartList.cfc:L23; converted to a zero-based offset at
   * org/Hibachi/HibachiSmartList.cfc:L762.
   */
  readonly pageRecordsStart?: number;

  /**
   * Number of records per page. Declared at org/Hibachi/HibachiSmartList.cfc:L24 and used as the
   * maximum-results bound at org/Hibachi/HibachiSmartList.cfc:L762.
   */
  readonly pageRecordsShow?: number;

  /**
   * The requested page.
   *
   * TODO(parity): this is declared as a string, not a number, at
   * org/Hibachi/HibachiSmartList.cfc:L26, and the string typing is carried deliberately. The legacy
   * treats the value loosely: it seeds it with the number one at
   * org/Hibachi/HibachiSmartList.cfc:L56, assigns it from a numerically validated caller value at
   * org/Hibachi/HibachiSmartList.cfc:L131-L132, then compares and multiplies with it at
   * org/Hibachi/HibachiSmartList.cfc:L793-L794. Typing this member numerically would narrow the
   * page-declaration syntax the legacy accepts, so the declared width is preserved and the adapter
   * coerces at precisely the point org/Hibachi/HibachiSmartList.cfc:L793-L794 does.
   */
  readonly currentPageDeclaration?: string;
}

/**
 * A complete, immutable description of one query — the eight capability groups AAP §0.4.1.6 and
 * §0.4.1.7 name (filter, like filter, in filter, range, keyword, related-property join, ordering
 * and pagination), plus the base entity and the distinct flag that the source ties to them.
 */
export interface SmartListQuery<TEntityName extends SmartListEntityName = SmartListEntityName> {
  /**
   * The ORM logical entity name being queried — `SlatwallProduct` for consumer 1
   * (model/service/ProductService.cfc:L343) and `SlatwallSku` for consumer 2
   * (model/service/SkuService.cfc:L310). First parameter of the setup member at
   * org/Hibachi/HibachiSmartList.cfc:L39; see the `SmartListJoin` note for why these names are correct
   * as written. This is also what tells the adapter which row mapper produces the result element
   * type, exactly as it tells the legacy which entity its record collection contains.
   */
  readonly entityName: TEntityName;

  /**
   * Related-property joins, in application order. Accumulated one at a time by the member at
   * org/Hibachi/HibachiSmartList.cfc:L212. Twenty-one join registrations occur across the slice, so
   * this is the most heavily exercised group of the eight.
   */
  readonly joins?: readonly SmartListJoin[];

  /** Which joined associations to project and attach to each returned record. */
  readonly associationProjections?: readonly SmartListAssociationProjection[];

  /**
   * Where groups, disjoined with one another and conjoined within — see `SmartListWhereGroup`.
   * Array position carries the legacy's one-based group number. Declared at
   * org/Hibachi/HibachiSmartList.cfc:L14.
   */
  readonly whereGroups?: readonly SmartListWhereGroup[];

  /**
   * Search terms. Declared at org/Hibachi/HibachiSmartList.cfc:L18 and derived by the caller-input
   * interpreter, which splits a search string on spaces and two encoded space forms at
   * org/Hibachi/HibachiSmartList.cfc:L145-L151. Each term is matched as a pattern against every
   * registered keyword property (org/Hibachi/HibachiSmartList.cfc:L681-L691) and is bound as a
   * parameter wrapped in wildcards at org/Hibachi/HibachiSmartList.cfc:L683.
   */
  readonly keywords?: readonly string[];

  /**
   * The properties search terms are matched against. Declared at
   * org/Hibachi/HibachiSmartList.cfc:L20. Searching requires both this collection and `keywords` to
   * be non-empty — the guard at org/Hibachi/HibachiSmartList.cfc:L672 — so registering properties
   * without supplying terms filters nothing, which is exactly the state consumers 1 and 2 leave
   * behind when their smart list is returned unsearched.
   */
  readonly keywordProperties?: readonly SmartListKeywordProperty[];

  /** Ordering terms, in application order. Declared at org/Hibachi/HibachiSmartList.cfc:L16. */
  readonly orders?: readonly SmartListOrder[];

  readonly pagination?: SmartListPagination;

  /** Whether duplicate rows are collapsed. */
  readonly selectDistinctFlag?: boolean;
}

/**
 * The caller-supplied query input — the typed counterpart of the legacy untyped data structure that
 * every smart-list member accepts as its first argument.
 *
 * TODO(parity): an unrecognised key is silently ignored — the interpreter's chain at
 * org/Hibachi/HibachiSmartList.cfc:L100-L133 simply falls through with no error. This shape names
 * the keys the legacy acts on, so a caller assembling input in TypeScript learns at compile time
 * what would otherwise have been discarded at run time; the adapter still ignores rather than
 * rejects anything that does reach it.
 */
export interface SmartListInput {
  /**
   * Restores a previously saved query state. Handled first, ahead of the prefix scan, at
   * org/Hibachi/HibachiSmartList.cfc:L93-L95.
   */
  readonly savedStateID?: string;

  /**
   * A search string. Aliased onto the plural form at org/Hibachi/HibachiSmartList.cfc:L137-L138, so
   * the two members are interchangeable and the singular is a convenience spelling.
   */
  readonly keyword?: string;

  /**
   * A search string, split into terms at org/Hibachi/HibachiSmartList.cfc:L145-L151. Searching also
   * requires registered keyword properties — the guard at org/Hibachi/HibachiSmartList.cfc:L672.
   */
  readonly keywords?: string;

  /**
   * Ordering terms as one delimited statement, read at org/Hibachi/HibachiSmartList.cfc:L118-L122
   * using the property delimiter at org/Hibachi/HibachiSmartList.cfc:L35 and the direction
   * delimiter at org/Hibachi/HibachiSmartList.cfc:L34. The member name matches the legacy key
   * exactly.
   *
   * TODO(parity): the interpreter clears the accumulated ordering terms inside its own loop, at
   * org/Hibachi/HibachiSmartList.cfc:L120, so a multi-term statement retains only its final term
   * and ordering registered earlier is discarded as well. Carried, not repaired.
   */
  readonly OrderBy?: string;

  /**
   * Page size. Read at org/Hibachi/HibachiSmartList.cfc:L123-L128. The literal string `ALL` is
   * accepted and maps to the very large page size written at org/Hibachi/HibachiSmartList.cfc:L125;
   * Otherwise the value is taken only when numeric, greater than zero and within the bound tested
   * at org/Hibachi/HibachiSmartList.cfc:L126. Values failing those tests are silently ignored.
   */
  readonly 'P:Show'?: string | number;

  /**
   * First record to display. Read, and bounds-tested, at
   * org/Hibachi/HibachiSmartList.cfc:L129-L130.
   */
  readonly 'P:Start'?: string | number;

  /**
   * Requested page. Read, and bounds-tested, at org/Hibachi/HibachiSmartList.cfc:L131-L132. See the
   * string-typing note on `SmartListPagination` for why this is not narrowed to a number.
   */
  readonly 'P:Current'?: string | number;

  /*
   * A second join member was declared here and has been removed. It named the same concept as
   * {@link SmartListInput.additionalJoins} below and had no reader anywhere: the live translator,
   * `translateSmartListInput` in the caller-struct translation section of `src/ports/SmartListQueryPort.ts`, reads `options.input?.additionalJoins`
   * and nothing else, so a value written under the other name reached no query. Two members for one
   * concept is worse than either alone — `Object.freeze<T>(literal)` defeats excess-property checking,
   * so writing the unread name produced no type error and no test failure, only joins that silently
   * vanished. The arguments that were unique to its documentation — the `rc` non-simple-member evidence
   * and the exact seven-names-and-seven-prefixes enforcement — are carried below.
   */

  readonly [filterKey: `F:${string}`]: SmartListFilterValue;

  /** Removes an equality filter when true — org/Hibachi/HibachiSmartList.cfc:L102-L103. */
  readonly [filterRemovalKey: `FR:${string}`]: SmartListFilterValue;

  /** Adds a set-membership filter — org/Hibachi/HibachiSmartList.cfc:L104-L105. */
  readonly [inFilterKey: `FI:${string}`]: SmartListFilterValue;

  /** Removes a set-membership filter when true — org/Hibachi/HibachiSmartList.cfc:L106-L107. */
  readonly [inFilterRemovalKey: `FIR:${string}`]: SmartListFilterValue;

  /** Adds a pattern filter, wildcard-wrapped — org/Hibachi/HibachiSmartList.cfc:L108-L113. */
  readonly [likeFilterKey: `FK:${string}`]: SmartListFilterValue;

  /** Removes a pattern filter when true — org/Hibachi/HibachiSmartList.cfc:L114-L115. */
  readonly [likeFilterRemovalKey: `FKR:${string}`]: SmartListFilterValue;

  /** Adds a range filter — org/Hibachi/HibachiSmartList.cfc:L116-L117. */
  readonly [rangeKey: `R:${string}`]: SmartListFilterValue;

  /** Structural joins the caller contributes, applied after the owning service's own base joins. */
  readonly additionalJoins?: readonly SmartListJoin[];
}

/** Which domain entity a smart list rooted at each logical entity name produces. */
export interface SmartListEntityRecordTypes {
  readonly SlatwallProduct: Product;
  readonly SlatwallSku: Sku;
  readonly SlatwallProductType: ProductType;
  readonly SlatwallBrand: Brand;
  readonly SlatwallOption: Option;
  readonly SlatwallOptionGroup: OptionGroup;
}

/**
 * The logical entity names a smart list may be rooted at — every {@link SmartListEntityName} for which
 * {@link SmartListEntityRecordTypes} declares a record type.
 */
export type SmartListRootEntityName = keyof SmartListEntityRecordTypes & SmartListEntityName;

/** The record type a smart list rooted at `TEntityName` yields. */
export type SmartListRecord<TEntityName extends SmartListRootEntityName> =
  SmartListEntityRecordTypes[TEntityName];

/** The materialised outcome of one query. */
export interface SmartListResult<T> {
  /** All matching records, unpaged. Produced at org/Hibachi/HibachiSmartList.cfc:L751-L755. */
  readonly records: readonly T[];

  /**
   * The current page of records. Produced at org/Hibachi/HibachiSmartList.cfc:L759-L764, using the
   * offset and maximum-results pair assembled at org/Hibachi/HibachiSmartList.cfc:L762.
   */
  readonly pageRecords: readonly T[];

  /**
   * Total number of matching records, independent of paging. Produced at
   * org/Hibachi/HibachiSmartList.cfc:L771, which counts distinct primary identifiers through the
   * dedicated counting statement assembled at org/Hibachi/HibachiSmartList.cfc:L777-L778 rather
   * than by materialising the rows.
   */
  readonly recordsCount: number;

  /**
   * One-based index of the first record on the current page. Produced at
   * org/Hibachi/HibachiSmartList.cfc:L792, which derives it from the requested page and the page
   * size at org/Hibachi/HibachiSmartList.cfc:L793-L794.
   */
  readonly pageRecordsStart: number;

  /**
   * One-based index of the last record on the current page. Produced at
   * org/Hibachi/HibachiSmartList.cfc:L800 and clamped to the total count at
   * org/Hibachi/HibachiSmartList.cfc:L802-L803, so a short final page reports its real end.
   */
  readonly pageRecordsEnd: number;

  /** The current page number. Produced at org/Hibachi/HibachiSmartList.cfc:L808-L809. */
  readonly currentPage: number;

  /** The total number of pages. Produced at org/Hibachi/HibachiSmartList.cfc:L812-L813. */
  readonly totalPages: number;
}

/** The port: run a described query and return its materialised outcome. */
export interface SmartListQueryPort {
  /**
   * Executes a described query.
   * @typeParam TEntityName - The root entity, inferred from `query.entityName`. Constrained to
   * {@link SmartListRootEntityName}, so rooting a list at an entity the slice models no
   * domain type for does not compile.
   *
   * @param query - The complete, immutable description of the query to run.
   * @returns The unpaged records, the current page, and the count and paging figures derived from
   * them, with the element type {@link SmartListEntityRecordTypes} pairs with the root entity.
   */
  execute<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListResult<SmartListRecord<TEntityName>>>;

  /**
   * Executes a described query for its unpaged records only — the `getRecords()` view on its own.
   * @typeParam TEntityName - The root entity, inferred from `query.entityName`. Constrained to
   * {@link SmartListRootEntityName}, so rooting a list at an entity the slice models no
   * domain type for does not compile.
   *
   * @param query - The complete, immutable description of the query to run.
   * @returns Every matching record, in the order the query's ordering terms produce, unpaged, with the
   * element type {@link SmartListEntityRecordTypes} pairs with the root entity.
   */
  executeRecords<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListRecord<TEntityName>[]>;
}

/** The explicit, caller-stated window a bounded read takes. */
export interface BoundedReadWindow {
  /** The maximum number of rows to return. Must be a positive integer. */
  readonly limit: number;

  /** How many matching rows to skip before the window starts. Must be a non-negative integer. */
  readonly offset: number;
}

/*
 * The caller-struct translation — `struct data` into a typed {@link SmartListQuery}
 * smartListInput — the single translation of the FW/1 `rc` request grammar into the declarative
 * query description that `src/ports/SmartListQueryPort.ts` declares.
 *
 * Legacy origin:
 * Org/Hibachi/HibachiSmartList.cfc — `setup` at :L39 reads the caller's `data` structure and the
 * `add*` / `remove*` members at :L362, :L389, :L416, :L445, :L476 and :L502 accumulate the
 * filters, ranges, orders, keywords and paging figures this module now produces as data. Per AAP
 * §0.8.3.2 that tree is "a boundary to extract from, never modify": its contract is read here and
 * none of its implementation is carried over.
 * Model/service/ProductService.cfc:L342 — `getProductSmartList(struct data={}, currentURL="")`.
 * Model/service/SkuService.cfc:L309 — `getSkuSmartList(struct data={}, currentURL="")`.
 */

/* The shared range translator: the one place a caller-supplied range string is interpreted. */

/** The range delimiter, `variables.rangeDelimiter` at org/Hibachi/HibachiSmartList.cfc:L36. */
export const SMART_LIST_RANGE_DELIMITER = '^';

/** CFML list semantics over the range delimiter: empty elements are ignored. */
function splitRangeValue(value: string): string[] {
  return value.split(SMART_LIST_RANGE_DELIMITER).filter((element) => element.length > 0);
}

/*
 * `readsAsCfmlNumeric` and `readsAsCfmlDate` are declared once, lower in this file, alongside the
 * other engine-semantics helpers. The single `unknown`-accepting pair serves both range acceptance
 * and `rc` entry translation, so neither grammar can drift from the other. Function declarations
 * hoist, so the range translator below calls them freely.
 */

/**
 * Translates one caller-supplied range entry into bounds, reproducing
 * org/Hibachi/HibachiSmartList.cfc:L446 (acceptance) and org/Hibachi/HibachiSmartList.cfc:L632-L655
 * (emission) exactly.
 *
 * TODO(parity) — the acceptance test's lower clause tests `listLast`, not `listFirst`. both halves
 * of `:L446` share the identical third term `isDate(listLast(value, delimiter))`. In the lower-bound
 * clause that is almost certainly a typo, and it has a real consequence: a value whose last element
 * reads as a date admits the entry outright, however malformed its first element is, so
 * `'abc^2024-01-15'` is accepted and yields the literal lower bound `'abc'`. It is carried verbatim,
 * because it decides which strings the legacy admits and "correcting" it would silently narrow the
 * accepted set (preserve and annotate, AAP §0.7.3).
 *
 * @param propertyIdentifier - The property the range constrains, taken from the entry key.
 * @param value - The raw range entry exactly as the caller supplied it.
 * @returns The structured bounds, or `undefined` when the legacy would emit no predicate.
 * @example
 * ```ts
 * translateSmartListRange('p', '1^'); // { propertyIdentifier: 'p', lowerBound: '1' }
 * translateSmartListRange('p', '^10'); // { propertyIdentifier: 'p', upperBound: '10' }
 * translateSmartListRange('p', '5^10'); // both bounds
 * translateSmartListRange('p', '10'); // both bounds '10' — exact equality
 * ```
 */
export function translateSmartListRange(
  propertyIdentifier: SmartListPropertyIdentifier,
  value: string,
): SmartListRange | undefined {
  const elements = splitRangeValue(value);
  const first = elements[0] ?? '';
  const last = elements.length > 0 ? (elements[elements.length - 1] ?? '') : '';

  const startsWithDelimiter = value.startsWith(SMART_LIST_RANGE_DELIMITER);
  const endsWithDelimiter = value.endsWith(SMART_LIST_RANGE_DELIMITER);

  // [:L446] — the two clauses, with the shared `isDate(listLast(...))` term hoisted so the quirk
  // documented above is visible as a single value used by both rather than written out twice.
  const lastReadsAsDate = readsAsCfmlDate(last);
  const lowerAcceptable = startsWithDelimiter || readsAsCfmlNumeric(first) || lastReadsAsDate;
  const upperAcceptable = endsWithDelimiter || readsAsCfmlNumeric(last) || lastReadsAsDate;
  if (!lowerAcceptable || !upperAcceptable) {
    return undefined;
  }

  // [:L632] — the emission loop skips any stored value of one character or fewer.
  if (value.length <= 1) {
    return undefined;
  }

  // [:L635] Only a higher bound, taken from the last element at [:L638].
  if (startsWithDelimiter) {
    return { propertyIdentifier, upperBound: last };
  }
  // [:L642] Only a lower bound, taken from the first element at [:L645].
  if (endsWithDelimiter) {
    return { propertyIdentifier, lowerBound: first };
  }
  // [:L649] Both bounds, first and last respectively at [:L653-L654]. For a delimiter-free value the
  // two elements are the same string, so this is exact equality — `>= v AND <= v`.
  return { propertyIdentifier, lowerBound: first, upperBound: last };
}

/*
 * The one shared smartlist input translator
 * — why there is exactly one of it.
 */

/** CFML's default list delimiter, used by every `list*` function that is not given one. */
const CFML_LIST_DELIMITER = ',';

/** The data-key delimiter of the FW/1 `rc` grammar: `F:propertyName`, `P:Show`, and so on. */
const SMART_LIST_DATA_KEY_DELIMITER = ':';

const FILTER_PREFIX = `F${SMART_LIST_DATA_KEY_DELIMITER}`;
const FILTER_REMOVAL_PREFIX = `FR${SMART_LIST_DATA_KEY_DELIMITER}`;
const IN_FILTER_PREFIX = `FI${SMART_LIST_DATA_KEY_DELIMITER}`;
const IN_FILTER_REMOVAL_PREFIX = `FIR${SMART_LIST_DATA_KEY_DELIMITER}`;
const LIKE_FILTER_PREFIX = `FK${SMART_LIST_DATA_KEY_DELIMITER}`;
const LIKE_FILTER_REMOVAL_PREFIX = `FKR${SMART_LIST_DATA_KEY_DELIMITER}`;
const RANGE_PREFIX = `R${SMART_LIST_DATA_KEY_DELIMITER}`;
const ORDER_BY_KEY = 'OrderBy';
const PAGE_SHOW_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Show`;
const PAGE_START_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Start`;
const PAGE_CURRENT_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Current`;
const KEYWORD_KEY = 'keyword';
const KEYWORDS_KEY = 'keywords';

/** `HibachiSmartList.cfc` treats this literal as "no paging at all". */
const PAGE_RECORDS_SHOW_ALL_KEYWORD = 'ALL';

/**
 * The row count `PAGE_RECORDS_SHOW_ALL_KEYWORD` resolves to, and the ceiling on any page figure.
 */
const PAGE_RECORDS_SHOW_ALL = 1000000000;

const ORDER_DIRECTION_DELIMITER = '|';
const LIKE_FILTER_WILDCARD = '%';

/*
 * The range delimiter is deliberately absent from this group of private literals. It is exported once
 * as {@link SMART_LIST_RANGE_DELIMITER} above, and {@link translateSmartListRange} owns the range
 * grammar; a second private `'^'` here would be a silent drift risk.
 */

/**
 * The `"D,DESC"` list of `HibachiSmartList.cfc:L476`, compared case-insensitively and untrimmed.
 */
const DESCENDING_ORDER_TOKENS: readonly string[] = Object.freeze(['D', 'DESC']);

/** The three spellings of a keyword separator the legacy normalises before splitting. */
const KEYWORD_SEPARATORS: readonly string[] = Object.freeze([' ', '%20', '+']);

/** CFML `listToArray`, which drops empty elements rather than preserving them as `''`. */
function cfmlListToArray(list: string, delimiter: string = CFML_LIST_DELIMITER): string[] {
  return list.split(delimiter).filter((entry) => entry.length > 0);
}

/** CFML `isSimpleValue` for the three scalar kinds an `rc` entry can carry. */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * CFML `isNumeric` — deliberately narrower than `Number`, which accepts hex and empty strings.
 */
function readsAsCfmlNumeric(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/** CFML numeric coercion. Yields `NaN` for anything {@link readsAsCfmlNumeric} rejects. */
function toCfmlNumber(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!readsAsCfmlNumeric(value)) {
    return Number.NaN;
  }
  return Number(typeof value === 'string' ? value.trim() : value);
}

/** CFML `isDate`. A numeric string is not a date here, matching the engine's precedence. */
function readsAsCfmlDate(value: string): boolean {
  if (value.trim().length === 0 || readsAsCfmlNumeric(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value.trim()));
}

/** CFML `isBoolean` — the first half of the two-step coercion of divergence 6. */
function readsAsCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return (
    normalised === 'true' ||
    normalised === 'false' ||
    normalised === 'yes' ||
    normalised === 'no' ||
    readsAsCfmlNumeric(value)
  );
}

/** CFML boolean coercion — the second half. Meaningful only after {@link readsAsCfmlBoolean}. */
function toCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'true' || normalised === 'yes') {
      return true;
    }
    if (normalised === 'false' || normalised === 'no') {
      return false;
    }
    if (readsAsCfmlNumeric(value)) {
      return toCfmlNumber(value) !== 0;
    }
  }
  return false;
}

/** Wraps each comma-delimited element of a `FK:` value in the SQL `LIKE` wildcard. */
function buildPatternFilterValue(raw: string): string {
  return cfmlListToArray(raw)
    .map((element) => `${LIKE_FILTER_WILDCARD}${element}${LIKE_FILTER_WILDCARD}`)
    .join(CFML_LIST_DELIMITER);
}

/** `HibachiSmartList.cfc:L446` — the range acceptability gate and the bound split. */
/**
 * Range parsing for an `rc` entry delegates to {@link translateSmartListRange} rather than repeating
 * it. This function previously carried a second, independent implementation of `:L446` acceptance and
 * `:L632-L655` emission, and the two had already drifted in two observable ways before they were
 * noticed:
 * 1. the `:L632` length gate was missing here, so a one-character stored value such as `"5"`
 * produced a predicate where the legacy emission loop skips it and produces none.
 * 2. the bounds were sliced around the first delimiter instead of taken from the first and last
 * list elements, so a three-element value like `"1^2^3"` yielded an upper bound of `"2^3"` where
 * `:L638`/`:L654`'s `listLast` yields `"3"`.
 */
function parseRangeValue(
  entityName: SmartListEntityName,
  rawProperty: string,
  raw: string,
): SmartListRange | undefined {
  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);
  if (propertyIdentifier === undefined) {
    return undefined;
  }
  return translateSmartListRange(propertyIdentifier, raw);
}

/** `HibachiSmartList.cfc:L473-L482` — property identifier, direction, and the `len()` guard. */
function parseOrderStatement(
  entityName: SmartListEntityName,
  statement: string,
): SmartListOrder | undefined {
  const parts = cfmlListToArray(statement, ORDER_DIRECTION_DELIMITER);
  const rawProperty = parts[0];
  if (rawProperty === undefined || rawProperty.length === 0) {
    return undefined;
  }
  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);
  if (propertyIdentifier === undefined) {
    return undefined;
  }
  const lastPart = parts[parts.length - 1];
  const descending =
    parts.length > 1 &&
    lastPart !== undefined &&
    DESCENDING_ORDER_TOKENS.some((token) => token === lastPart.toUpperCase());
  return { propertyIdentifier, direction: descending ? 'DESC' : 'ASC' };
}

/** Normalises the three keyword separator spellings, then splits on the CFML list delimiter. */
function parseKeywords(raw: string): string[] {
  let keywordList = raw;
  for (const separator of KEYWORD_SEPARATORS) {
    keywordList = keywordList.split(separator).join(CFML_LIST_DELIMITER);
  }
  return cfmlListToArray(keywordList);
}

/** A page figure is acceptable only when CFML would read it as a number in `(0, ALL]`. */
function readAcceptablePageValue(value: string | number | boolean): number | undefined {
  if (!readsAsCfmlNumeric(value)) {
    return undefined;
  }
  const numeric = toCfmlNumber(value);
  return numeric > 0 && numeric <= PAGE_RECORDS_SHOW_ALL ? numeric : undefined;
}

/** `removeFilter` and friends drop every entry for the property, not merely the first. */
function removeEntriesForProperty(entries: SmartListFilter[], propertyIdentifier: string): void {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]?.propertyIdentifier === propertyIdentifier) {
      entries.splice(index, 1);
    }
  }
}

/**
 * The mutable accumulator the entry loop fills before {@link composeQuery} freezes it into shape.
 */
interface SmartListQueryDraft {
  readonly filters: SmartListFilter[];
  readonly likeFilters: SmartListFilter[];
  readonly inFilters: SmartListFilter[];
  readonly ranges: SmartListRange[];
  readonly orders: SmartListOrder[];
  keywords: string[];
  pageRecordsStart?: number;
  pageRecordsShow?: number;
  currentPageDeclaration?: string;
}

/** `OrderBy` carries a comma-delimited list of `property|direction` statements. */
function applyOrderByEntry(
  entityName: SmartListEntityName,
  draft: SmartListQueryDraft,
  raw: string,
): void {
  for (const statement of cfmlListToArray(raw, CFML_LIST_DELIMITER)) {
    const order = parseOrderStatement(entityName, statement);
    if (order !== undefined) {
      draft.orders.push(order);
    }
  }
}

/** `P:Show` accepts the literal `ALL` in addition to a numeric page size. */
function applyPageShowEntry(draft: SmartListQueryDraft, value: string | number | boolean): void {
  if (typeof value === 'string' && value.trim().toUpperCase() === PAGE_RECORDS_SHOW_ALL_KEYWORD) {
    draft.pageRecordsShow = PAGE_RECORDS_SHOW_ALL;
    return;
  }
  const show = readAcceptablePageValue(value);
  if (show !== undefined) {
    draft.pageRecordsShow = show;
  }
}

/** Dispatches one `rc` entry onto the draft by its data-key prefix. */
function applyInputEntry(
  entityName: SmartListEntityName,
  draft: SmartListQueryDraft,
  key: string,
  value: string | number | boolean,
): void {
  /* — every property path that reaches a draft is resolved against the entity schema first. */
  const resolve = (raw: string): SmartListPropertyIdentifier | undefined =>
    resolveSmartListPropertyIdentifier(entityName, raw);

  if (key.startsWith(FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.filters.push({ propertyIdentifier, value });
    }
    return;
  }
  if (key.startsWith(FILTER_REMOVAL_PREFIX) && readsAsCfmlBoolean(value) && toCfmlBoolean(value)) {
    removeEntriesForProperty(draft.filters, key.slice(FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(IN_FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(IN_FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.inFilters.push({ propertyIdentifier, value });
    }
    return;
  }
  if (
    key.startsWith(IN_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.inFilters, key.slice(IN_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(LIKE_FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(LIKE_FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.likeFilters.push({
        propertyIdentifier,
        value: buildPatternFilterValue(String(value)),
      });
    }
    return;
  }
  if (
    key.startsWith(LIKE_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.likeFilters, key.slice(LIKE_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(RANGE_PREFIX)) {
    const range = parseRangeValue(entityName, key.slice(RANGE_PREFIX.length), String(value));
    if (range !== undefined) {
      draft.ranges.push(range);
    }
    return;
  }
  if (key === ORDER_BY_KEY) {
    applyOrderByEntry(entityName, draft, String(value));
    return;
  }
  if (key === PAGE_SHOW_KEY) {
    applyPageShowEntry(draft, value);
    return;
  }
  if (key === PAGE_START_KEY) {
    const start = readAcceptablePageValue(value);
    if (start !== undefined) {
      draft.pageRecordsStart = start;
    }
    return;
  }
  if (key === PAGE_CURRENT_KEY) {
    const current = readAcceptablePageValue(value);
    if (current !== undefined) {
      draft.currentPageDeclaration = String(current);
    }
  }
}

/**
 * Folds the draft into a {@link SmartListQuery}, omitting every section the input did not populate.
 */
function composeQuery<TEntityName extends SmartListEntityName>(
  options: SmartListTranslationOptions<TEntityName>,
  draft: SmartListQueryDraft,
): SmartListQuery<TEntityName> {
  const whereGroup: SmartListWhereGroup = {
    ...(draft.filters.length > 0 ? { filters: draft.filters } : {}),
    ...(draft.likeFilters.length > 0 ? { likeFilters: draft.likeFilters } : {}),
    ...(draft.inFilters.length > 0 ? { inFilters: draft.inFilters } : {}),
    ...(draft.ranges.length > 0 ? { ranges: draft.ranges } : {}),
  };
  const pagination: SmartListPagination = {
    ...(draft.pageRecordsStart !== undefined ? { pageRecordsStart: draft.pageRecordsStart } : {}),
    ...(draft.pageRecordsShow !== undefined ? { pageRecordsShow: draft.pageRecordsShow } : {}),
    ...(draft.currentPageDeclaration !== undefined
      ? { currentPageDeclaration: draft.currentPageDeclaration }
      : {}),
  };

  // The caller's structural additions, applied after the owning service's base joins — the legacy's
  // own order, since `integrationServices/google/controllers/feed.cfc:L64-L66` mutates the object the
  // service has already built at `:L63`. See `SmartListInput.additionalJoins`.
  const additionalJoins = options.input?.additionalJoins;
  const joins: readonly SmartListJoin[] | undefined =
    additionalJoins !== undefined && additionalJoins.length > 0
      ? [...(options.joins ?? []), ...additionalJoins]
      : options.joins;

  return {
    entityName: options.entityName,
    ...(joins !== undefined ? { joins } : {}),
    ...(options.keywordProperties !== undefined
      ? { keywordProperties: options.keywordProperties }
      : {}),
    ...(Object.keys(whereGroup).length > 0 ? { whereGroups: [whereGroup] } : {}),
    ...(draft.keywords.length > 0 ? { keywords: draft.keywords } : {}),
    ...(draft.orders.length > 0 ? { orders: draft.orders } : {}),
    ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
  };
}

/**
 * The per-call inputs to {@link translateSmartListInput}.
 * @typeParam TEntityName - The root entity, inferred from the `entityName` supplied.
 */
export interface SmartListTranslationOptions<
  TEntityName extends SmartListEntityName = SmartListEntityName,
> {
  /** The entity the query selects from, e.g. `SlatwallSku`. */
  readonly entityName: TEntityName;

  /**
   * The raw FW/1 `rc` data structure. An absent input still yields joins and keyword properties.
   */
  readonly input?: SmartListInput | undefined;

  /** Structural joins the calling service declares for every one of its SmartLists. */
  readonly joins?: readonly SmartListJoin[] | undefined;

  /** Weighted keyword properties the calling service declares for keyword search. */
  readonly keywordProperties?: readonly SmartListKeywordProperty[] | undefined;
}

/**
 * Translates an FW/1 `rc` data structure into a {@link SmartListQuery} — the single authority for the
 * data-key grammar, consumed by every service that exposes a smartList member .
 *
 * @param options - The entity name, the raw input, and the caller's structural declarations.
 * @returns The immutable query description, with every unpopulated section absent.
 */
export function translateSmartListInput<TEntityName extends SmartListEntityName>(
  options: SmartListTranslationOptions<TEntityName>,
): SmartListQuery<TEntityName> {
  const draft: SmartListQueryDraft = {
    filters: [],
    likeFilters: [],
    inFilters: [],
    ranges: [],
    orders: [],
    keywords: [],
  };

  if (options.input === undefined) {
    return composeQuery(options, draft);
  }

  const entries = options.input as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(entries)) {
    const value = entries[key];
    if (isCfmlSimpleValue(value)) {
      applyInputEntry(options.entityName, draft, key, value);
    }
  }

  const singularKeyword = entries[KEYWORD_KEY];
  const pluralKeywords = entries[KEYWORDS_KEY];
  const rawKeywords = typeof singularKeyword === 'string' ? singularKeyword : pluralKeywords;
  if (typeof rawKeywords === 'string') {
    draft.keywords = parseKeywords(rawKeywords);
  }

  return composeQuery(options, draft);
}

/* The join merger, declared beside the rest of the smart-list input grammar. */

/**
 * Merge a caller's extra joins into a member's own base joins, keeping the base joins first and
 * dropping any duplicate.
 *
 * @param baseJoins - The member's own joins, emitted first and never dropped.
 * @param additionalJoins - A caller's joins. `undefined` returns `baseJoins` unchanged, so a member
 * that no caller extends pays nothing and emits precisely the statement it emitted before.
 *
 * @returns a frozen list. Frozen because a member's base joins are module-scope constants and a
 * returned array that a caller could mutate would let one invocation edit the next one's selection on
 * a warm container (M7).
 */
export function mergeSmartListJoins(
  baseJoins: readonly SmartListJoin[],
  additionalJoins?: readonly SmartListJoin[],
): readonly SmartListJoin[] {
  if (additionalJoins === undefined || additionalJoins.length === 0) {
    return baseJoins;
  }

  const merged: SmartListJoin[] = [];
  const seen = new Set<string>();
  for (const join of [...baseJoins, ...additionalJoins]) {
    const key = `${join.parentEntityName}.${join.relatedProperty}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(join);
  }
  return Object.freeze(merged);
}

/*
 * Folded in: `buildIdentifierQuery`, hoisted out of the three byte-identical readings it had grown
 * into (`../services/ProductService.ts`, `../services/OptionService.ts` and the inline copy in
 * `../config/container.ts`). It is stated once, here, beside the `translateSmartListInput` grammar
 * every smart list already routes through, so stating it here adds no import edge: both services and
 * the composition root already depend on this port.
 */

/**
 * Describes a primary-key load as a single-filter dynamic query.
 *
 * @param entityName - The ORM logical entity name to load from.
 * @param propertyIdentifier - The entity's primary-identifier property, resolved against that entity's
 * own schema by the branded identifier type, so an unresolved path is not assignable here.
 *
 * @param value - The identifier to match.
 * @returns The query description. Nothing is executed.
 */
export function buildIdentifierQuery<TEntity extends SmartListEntityName>(
  entityName: TEntity,
  propertyIdentifier: SmartListPropertyIdentifier<TEntity>,
  value: string,
): SmartListQuery<TEntity> {
  return { entityName, whereGroups: [{ filters: [{ propertyIdentifier, value }] }] };
}

/*
 * The SKU smart list's selection — its root entity, its three joins and its five weight-1 keyword
 * properties — plus the composer that turns them into a query description. It is stated here, on a
 * leaf module, so the Google feed can reach the selection without instantiating `SkuService` and so
 * materialising all three legacy smart-list views in order to read one of them.
 */

/** `arguments.entityName = "SlatwallSku"` — [model/service/SkuService.cfc:L310]. */
export const SKU_SMART_LIST_ENTITY_NAME = 'SlatwallSku';

/** `SlatwallProduct` is the parent of the second join — [model/service/SkuService.cfc:L315]. */
const PRODUCT_ENTITY_NAME = 'SlatwallProduct';

/** Every `addKeywordProperty` call in the member passes `weight=1` — [:L318-L322]. */
const SKU_KEYWORD_PROPERTY_WEIGHT = 1;

/** The three joins, in source order. */
export const SKU_SMART_LIST_JOINS: readonly SmartListJoin[] = Object.freeze([
  { parentEntityName: SKU_SMART_LIST_ENTITY_NAME, relatedProperty: 'product' },
  { parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'productType' },
  {
    parentEntityName: SKU_SMART_LIST_ENTITY_NAME,
    relatedProperty: 'alternateSkuCodes',
    joinType: 'left',
  },
] satisfies SmartListJoin[]);

/** The five keyword properties, in source order, every one at weight 1. */
export const SKU_SMART_LIST_KEYWORD_PROPERTIES: readonly SmartListKeywordProperty[] = Object.freeze(
  [
    Object.freeze({ propertyIdentifier: 'skuCode', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
    Object.freeze({ propertyIdentifier: 'skuID', weight: SKU_KEYWORD_PROPERTY_WEIGHT }),
    Object.freeze({
      propertyIdentifier: 'product.productName',
      weight: SKU_KEYWORD_PROPERTY_WEIGHT,
    }),
    Object.freeze({
      propertyIdentifier: 'product.productType.productTypeName',
      weight: SKU_KEYWORD_PROPERTY_WEIGHT,
    }),
    Object.freeze({
      propertyIdentifier: 'alternateSkuCodes.alternateSkuCode',
      weight: SKU_KEYWORD_PROPERTY_WEIGHT,
    }),
  ],
);

/**
 * Describes the SKU smart list's selection: the root entity, the base joins, the keyword properties,
 * and whatever the caller's `data` struct adds to them.
 *
 * @param data the caller's smart-list input struct, in the legacy `applyData` key grammar, or omitted
 * for the bare selection. `additionalJoins` inside it is the channel a caller contributes structural
 * joins through.
 *
 * @param additionalJoins joins contributed positionally rather than inside `data` — the channel
 * `skuService.getSkuSmartList`'s own trailing parameter forwards. Merged identically.
 *
 * @returns the described selection, rooted at `SlatwallSku` so the port can derive the element type.
 */
export function composeSkuSmartListQuery(
  data?: SmartListInput,
  additionalJoins?: readonly SmartListJoin[],
  /*
   * The root entity stays in the return type, which is what lets a caller hand the query straight to
   * the port and receive SKUs. `SmartListQueryPort.execute` and `executeRecords` both derive their
   * element type from `query.entityName` through `SmartListEntityRecordTypes`, so widening this to the
   * bare `SmartListQuery` would erase the one fact the derivation reads.
   */
): SmartListQuery<typeof SKU_SMART_LIST_ENTITY_NAME> {
  return translateSmartListInput({
    entityName: SKU_SMART_LIST_ENTITY_NAME,
    input: data,
    joins: mergeSmartListJoins(SKU_SMART_LIST_JOINS, additionalJoins),
    keywordProperties: SKU_SMART_LIST_KEYWORD_PROPERTIES,
  });
}
