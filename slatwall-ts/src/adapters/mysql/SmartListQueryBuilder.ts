/**
 * SmartListQueryBuilder — the typed, parameterized replacement for the framework's dynamic HQL
 * composer, and the sole implementation of `SmartListQueryPort`.
 *
 * AAP §0.4.1.7 makes this file create with `org/Hibachi/HibachiSmartList.cfc` as reference:
 * *"Filter, like-filter, in-filter, range, keyword and related-property join composition with
 * pagination, emitting parameterized SQL"*. AAP §0.3.3 names the pattern — the query builder that
 * replaces *"HibachiSmartList dynamic paginated HQL composition"*, operating *"behind
 * smartListQueryPort"* — and rule R4 (AAP §0.4.3.4) names the translation: `ormExecuteQuery(hql,
 * positionalParams)` becomes `pool.execute(sql, params)` with the bound list assembled in exactly
 * the legacy sequence (TR-4), because binding ORDER is observable even when statement text is not.
 *
 * Why this is a boundary port at all
 * AAP §0.2.2.7 lists `smartListQueryPort` among the seven ports because the Google feed's
 * availability gate is `addRange('product.calculatedQATS','1^')` at
 * `integrationServices/google/controllers/feed.cfc:L72`, which reads a calculated inventory
 * property. Inventory and stock are excluded from the slice (AAP §0.2.2.1), so the feed cannot
 * resolve its own record selection and the port is what lets it express the gate anyway (TR-5).
 *
 * TODO(parity) `model/service/SkuService.cfc:L312` — consumer 2 obtains its smart list from the wrong
 * collaborator, and it does not matter. Consumer 1 calls `getHibachiDAO().getSmartList(...)` at
 * `model/service/ProductService.cfc:L345`, but consumer 2 calls `getSkuDAO().getSmartList(...)`. The
 * two are behaviourally identical: `SkuDAO` extends the local `model/dao/HibachiDAO.cfc`, which
 * extends `org/Hibachi/HibachiDAO.cfc`, where the only `getSmartList` in the chain lives at `:L102` —
 * so the same application-key prefixing at `:L103-L106` applies either way. Carried as a legacy
 * inconsistency rather than a semantic difference; nothing in this file distinguishes the two, because
 * nothing in the legacy does either. Recorded so a reader comparing the two consumers does not go
 *
 * TODO(parity) `model/service/ProductService.cfc:L342` — discrepancy 1: the paging companion argument
 * is untyped. `getProductSmartList(struct data={}, currentURL="")` declares `currentURL` with no type
 * at all, so CFML accepts anything for it. Its only use is building paging links, which is a
 * presentation concern and belongs to `src/handlers/**` rather than to statement composition, so it
 * has no representation in {@link SmartListQuery} and none here. The tightening to an optional string
 * where it does surface is recorded rather than made silently (TR-1); this file simply never sees it.
 *
 * @see `src/ports/SmartListQueryPort.ts` for the contract, and for why the query is a value rather
 * than a mutable fluent object.
 * @see `src/adapters/mysql/QueryRunner.ts` for the identifier whitelist and the execution boundary.
 */

import type { Brand } from '../../domain/product/Brand';
import type { Option } from '../../domain/option/Option';
import type { OptionGroup } from '../../domain/option/OptionGroup';
import type { Product, ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type { ProductType } from '../../domain/product/ProductType';
import type { Sku } from '../../domain/sku/Sku';
import { ConfigurationError, DataIntegrityError, DomainError } from '../../errors/DomainError';
import { resolveSmartListPropertyIdentifier } from '../../ports/SmartListQueryPort';
import { assertColumnName, assertTableName, toRowCountBinding } from './QueryRunner';
import {
  mapBrandRow,
  mapOptionGroupRow,
  mapOptionRow,
  mapProductRow,
  mapProductTypeRow,
  mapSkuRow,
  mapRows,
} from './rowMappers';

import type { CatalogAggregateLoader, PhysicalTableName, SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type {
  SmartListEntityName,
  SmartListFilter,
  SmartListFilterValue,
  SmartListJoin,
  SmartListJoinType,
  SmartListOrderDirection,
  SmartListPagination,
  SmartListQuery,
  SmartListQueryPort,
  SmartListRange,
  SmartListRecord,
  SmartListResult,
  SmartListRootEntityName,
  SmartListWhereGroup,
} from '../../ports/SmartListQueryPort';

export {
  attachFetchedSkuAssociations,
  attachSkuOptions,
  createCatalogAggregateLoaders,
} from './QueryRunner';
export type {
  AggregateLoadRequest,
  CatalogAggregateDependencies,
  CatalogAggregateLoader,
} from './QueryRunner';

/*
 * Translation decisions — AAP §0.8.2 Guideline 6 requires that "all technology-specific translation
 * decisions" be documented "with clear comments, especially anywhere legacy behavior ... required an
 * explicit judgment call". AAP §0.8.2 additionally names this folder as "the primary site of that
 * requirement". Each judgment is recorded here or at the declaration that makes it, always with a
 * locator.
 *
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] — two table vocabularies, both correct
 * The framework prefixes the application key onto any entity name handed to it, at five sites in
 * `org/Hibachi/HibachiDAO.cfc` — `:L7-L10` in `get`, `:L29-L32` in `list`, `:L39-L42` in
 * `new`, `:L80-L83` in `count` and `:L103-L106` in `getSmartList`, the last of which is the
 * member every smart list in the slice is created through. So `SlatwallProduct` and `SlatwallSku`
 * in an `entityName` position are legitimate logical names, not mistakes.
 */

/*
 * The capability set is closed at eight groups — do not complete the component
 * `org/Hibachi/HibachiSmartList.cfc` is 1,090 lines and declares thirty-three public members. This
 * file ports the eight capability groups AAP §0.4.1.7 names — equality filter, like filter, in
 * filter, range, keyword, related-property join, ordering and pagination — derived from exactly the
 * five call sites listed in the file header, plus the distinctness switch the source ties to them.
 * The temptation to port "the rest of it for completeness" is real and is forbidden by AAP §0.8.2
 * Guideline 4 (*"Do not enhance or optimize business logic beyond what the migration requires"*).
 * The bound is a decision, not an abandoned port.
 */

/*
 * Source-declared figures — every number in this file carries a locator (AAP §0.7.3 / IR-12)
 * No latency, throughput, availability or capacity figure appears anywhere below, and no pool sizing
 * of any kind: AAP §0.4.1.3 records that *"pool sizing is not carried over because the legacy
 * application delegates pooling to the CF/Railo server and pins nothing in source"*, and this file
 * does not construct a pool in any case. The only figures present are the three the legacy declares.
 */

/** The first record of a page when the caller supplies none. */
const LEGACY_DEFAULT_PAGE_RECORDS_START = 1;

/** The page size when the caller supplies none. */
const LEGACY_DEFAULT_PAGE_RECORDS_SHOW = 10;

/**
 * The requested page when the caller supplies none.
 *
 */
const LEGACY_DEFAULT_CURRENT_PAGE_DECLARATION = '1';

/** The alias letters the framework cycles through when an alias collides. */
const ENTITY_ALIAS_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] as const;

/**
 * The sub-entity path delimiter. `variables.subEntityDelimiters` at `:L32` is `"._"`; only `.` is
 * produced by `src/ports/SmartListQueryPort.ts`, which declares `.` as the single delimiter, so the
 * underscore form is not accepted here — admitting it would let `option_group` and `optionGroup`
 * mean different things depending on which delimiter a caller happened to type.
 */
const PROPERTY_PATH_DELIMITER = '.';

/**
 * The value delimiter that turns one filter value into an or-ed set. `variables.valueDelimiter` at
 * `org/Hibachi/HibachiSmartList.cfc:L33`.
 */
const FILTER_VALUE_DELIMITER = ',';

/**
 * The wildcard the keyword search wraps around each keyword at
 * `org/Hibachi/HibachiSmartList.cfc:L681`.
 */
const KEYWORD_WILDCARD = '%';

/**
 * The token a filter value may carry to mean "compare against nothing", tested at
 * `org/Hibachi/HibachiSmartList.cfc:L580` and `:L591`. Compared case-insensitively because CFML
 * `eq` is, exactly as `queryRunner.ts` normalises identifier case for the same reason.
 */
const NULL_FILTER_TOKEN = 'null';

/* Distinctness — two rules, and the asymmetry between them is the legacy's. */

/**
 * Why the record projection and the count disagree about distinctness, carried rather than repaired.
 */
export const SMARTLIST_DISTINCT_ASYMMETRY = Object.freeze({
  recordProjectionHonoursFlag: true,
  countProjectionIsAlwaysDistinct: true,
});

/*
 * The physical schema — read from the entity components, every row with its locator
 * HQL traverses an association by naming it (`joinRelatedProperty` emits `parentAlias.relatedProperty
 * as childAlias` at `org/Hibachi/HibachiSmartList.cfc:L546`) and lets Hibernate supply the predicate
 * from the mapping metadata. Native SQL has no such facility, so the predicate must be stated. These
 * three tables are that metadata, transcribed from the `property` declarations of the in-scope entity
 * components rather than inferred from column-name convention — inference would silently pick
 * `alternateSkuCodeTypeID` where the source declares `skuTypeID`
 * (`model/entity/AlternateSkuCode.cfc:L56`).
 */

/** The primary-key column of each entity in the smart-list graph. */
const ENTITY_PRIMARY_KEY: Readonly<Record<SmartListEntityName, string>> = Object.freeze({
  /** `model/entity/Product.cfc:L52`. */
  SlatwallProduct: 'productID',
  /** `model/entity/Sku.cfc:L52`. */
  SlatwallSku: 'skuID',
  /** `model/entity/ProductType.cfc:L52`. */
  SlatwallProductType: 'productTypeID',
  /** `model/entity/Brand.cfc:L52`. */
  SlatwallBrand: 'brandID',
  /** `model/entity/Option.cfc:L52`. */
  SlatwallOption: 'optionID',
  /** `model/entity/OptionGroup.cfc:L52`. */
  SlatwallOptionGroup: 'optionGroupID',
  /** `model/entity/AlternateSkuCode.cfc:L52`. */
  SlatwallAlternateSkuCode: 'alternateSkuCodeID',
});

/** How one association becomes one or two SQL joins. */
type SmartListJoinSpecification =
  | {
      readonly kind: 'parentForeignKey';
      readonly childEntityName: SmartListEntityName;
      readonly parentColumn: string;
    }
  | {
      readonly kind: 'childForeignKey';
      readonly childEntityName: SmartListEntityName;
      readonly childColumn: string;
    }
  | {
      readonly kind: 'linkTable';
      readonly childEntityName: SmartListEntityName;
      readonly linkEntityTable: string;
      readonly linkParentColumn: string;
      readonly linkChildColumn: string;
    };

/**
 * Every association the smart-list graph can traverse, keyed by parent entity then by the related
 * property the caller names.
 */
const ENTITY_JOIN_SPECIFICATIONS: Readonly<
  Record<SmartListEntityName, Readonly<Record<string, SmartListJoinSpecification | undefined>>>
> = Object.freeze({
  SlatwallSku: Object.freeze({
    /** `model/entity/Sku.cfc:L65` — `many-to-one` `fkcolumn="productID"`. */
    product: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallProduct',
      parentColumn: 'productID',
    }),
    /** `model/entity/Sku.cfc:L69` — `one-to-many` `fkcolumn="skuID" inverse="true"`. */
    alternateSkuCodes: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallAlternateSkuCode',
      childColumn: 'skuID',
    }),
    /**
     * `model/entity/Sku.cfc:L76` — `many-to-many linktable="SwSkuOption" fkcolumn="skuID"
     * inversejoincolumn="optionID"`. This is the owning side; `model/entity/Option.cfc:L66` mirrors
     * it with `inverse="true"`.
     */
    options: Object.freeze({
      kind: 'linkTable',
      childEntityName: 'SlatwallOption',
      linkEntityTable: 'SwSkuOption',
      linkParentColumn: 'skuID',
      linkChildColumn: 'optionID',
    }),
  }),
  SlatwallProduct: Object.freeze({
    /** `model/entity/Product.cfc:L68` — `many-to-one` `fkcolumn="brandID"`. */
    brand: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallBrand',
      parentColumn: 'brandID',
    }),
    /** `model/entity/Product.cfc:L69` — `many-to-one` `fkcolumn="productTypeID"`. */
    productType: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallProductType',
      parentColumn: 'productTypeID',
    }),
    /** `model/entity/Product.cfc:L70` — `many-to-one` `fkcolumn="defaultSkuID"`. */
    defaultSku: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallSku',
      parentColumn: 'defaultSkuID',
    }),
    /** `model/entity/Product.cfc:L73` — `one-to-many` `fkcolumn="productID" inverse="true"`. */
    skus: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallSku',
      childColumn: 'productID',
    }),
  }),
  SlatwallProductType: Object.freeze({
    /** `model/entity/ProductType.cfc:L62` — `many-to-one` `fkcolumn="parentProductTypeID"`. */
    parentProductType: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallProductType',
      parentColumn: 'parentProductTypeID',
    }),
    /**
     * `model/entity/ProductType.cfc:L65` — `one-to-many` `fkcolumn="parentProductTypeID"
     * inverse="true"`. A self-association, which is the case the alias-collision loop of
     * `org/Hibachi/HibachiSmartList.cfc:L249-L262` exists to serve; see {@link registerJoin}.
     */
    childProductTypes: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallProductType',
      childColumn: 'parentProductTypeID',
    }),
    /**
     * `model/entity/ProductType.cfc:L66` — `one-to-many` `fkcolumn="productTypeID" inverse="true"`.
     */
    products: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallProduct',
      childColumn: 'productTypeID',
    }),
  }),
  SlatwallBrand: Object.freeze({
    /** `model/entity/Brand.cfc:L61` — `one-to-many` `fkcolumn="brandID" inverse="true"`. */
    products: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallProduct',
      childColumn: 'brandID',
    }),
  }),
  SlatwallOption: Object.freeze({
    /** `model/entity/Option.cfc:L59` — `many-to-one` `fkcolumn="optionGroupID"`. */
    optionGroup: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallOptionGroup',
      parentColumn: 'optionGroupID',
    }),
    /**
     * `model/entity/Option.cfc:L66` — `many-to-many linktable="SwSkuOption" fkcolumn="optionID"
     * inversejoincolumn="skuID" inverse="true"`. The inverse side of `SlatwallSku.options`, so the
     * two link columns are swapped relative to it. Consumers 4 and 5 traverse this association.
     */
    skus: Object.freeze({
      kind: 'linkTable',
      childEntityName: 'SlatwallSku',
      linkEntityTable: 'SwSkuOption',
      linkParentColumn: 'optionID',
      linkChildColumn: 'skuID',
    }),
  }),
  SlatwallOptionGroup: Object.freeze({
    /**
     * `model/entity/OptionGroup.cfc:L70` — `one-to-many` `fkcolumn="optionGroupID" inverse="true"`,
     * declared with `orderby="sortOrder"`. the mapping-level order is not carried here: a smart list
     * states its own ordering, and consumers 4 and 5 do so explicitly with a pipe-delimited order at
     * `model/entity/Product.cfc:L256` and `:L344`. Reproducing the mapping order as well would add a
     * sort the legacy statement does not carry.
     */
    options: Object.freeze({
      kind: 'childForeignKey',
      childEntityName: 'SlatwallOption',
      childColumn: 'optionGroupID',
    }),
  }),
  SlatwallAlternateSkuCode: Object.freeze({
    /** `model/entity/AlternateSkuCode.cfc:L57` — `many-to-one` `fkcolumn="skuID"`. */
    sku: Object.freeze({
      kind: 'parentForeignKey',
      childEntityName: 'SlatwallSku',
      parentColumn: 'skuID',
    }),
  }),
});

/**
 * The column a `many-to-one` property resolves to when it is the last segment of a path rather than
 * a hop through it.
 */
const FOREIGN_KEY_LEAF_COLUMNS: Readonly<
  Record<SmartListEntityName, Readonly<Record<string, string | undefined>>>
> = Object.freeze({
  SlatwallSku: Object.freeze({
    /** `model/entity/Sku.cfc:L65`. */
    product: 'productID',
    /**
     * `model/entity/Sku.cfc:L66` — the term itself is out of scope, but its foreign key is a column
     * of `SwSku` and a filter may legitimately name it.
     */
    subscriptionTerm: 'subscriptionTermID',
  }),
  SlatwallProduct: Object.freeze({
    /** `model/entity/Product.cfc:L68`. */
    brand: 'brandID',
    /** `model/entity/Product.cfc:L69`. */
    productType: 'productTypeID',
    /** `model/entity/Product.cfc:L70`. */
    defaultSku: 'defaultSkuID',
  }),
  SlatwallProductType: Object.freeze({
    /** `model/entity/ProductType.cfc:L62`. */
    parentProductType: 'parentProductTypeID',
  }),
  SlatwallBrand: Object.freeze({}),
  SlatwallOption: Object.freeze({
    /** `model/entity/Option.cfc:L59`. */
    optionGroup: 'optionGroupID',
  }),
  SlatwallOptionGroup: Object.freeze({}),
  SlatwallAlternateSkuCode: Object.freeze({
    /**
     * `model/entity/AlternateSkuCode.cfc:L56` — declared `fkcolumn="skuTypeID"`. The name does not
     * follow from the property name, which is precisely why this table is transcribed rather than
     * derived.
     */
    alternateSkuCodeType: 'skuTypeID',
    /** `model/entity/AlternateSkuCode.cfc:L57`. */
    sku: 'skuID',
  }),
});

/**
 * The inverse of each collection association, used only by {@link describePropertyScopedSmartList}.
 */
const COLLECTION_INVERSE_PROPERTY: Readonly<
  Record<SmartListEntityName, Readonly<Record<string, string | undefined>>>
> = Object.freeze({
  /**
   * `model/entity/Sku.cfc:L69` inverse is `model/entity/AlternateSkuCode.cfc:L57`; `:L76` inverse is
   * `model/entity/Option.cfc:L66`.
   */
  SlatwallSku: Object.freeze({ alternateSkuCodes: 'sku', options: 'skus' }),
  /** `model/entity/Product.cfc:L73` inverse is `model/entity/Sku.cfc:L65`. */
  SlatwallProduct: Object.freeze({ skus: 'product' }),
  /**
   * `model/entity/ProductType.cfc:L65` and `:L66` inverses are `:L62` and
   * `model/entity/Product.cfc:L69`.
   */
  SlatwallProductType: Object.freeze({
    childProductTypes: 'parentProductType',
    products: 'productType',
  }),
  /** `model/entity/Brand.cfc:L61` inverse is `model/entity/Product.cfc:L68`. */
  SlatwallBrand: Object.freeze({ products: 'brand' }),
  /** `model/entity/Option.cfc:L66` inverse is `model/entity/Sku.cfc:L76`. */
  SlatwallOption: Object.freeze({ skus: 'options' }),
  /** `model/entity/OptionGroup.cfc:L70` inverse is `model/entity/Option.cfc:L59`. */
  SlatwallOptionGroup: Object.freeze({ options: 'optionGroup' }),
  SlatwallAlternateSkuCode: Object.freeze({}),
});

/**
 * The row mapper each base entity hydrates through, selected from the query's entity name exactly as
 * the legacy entity name at `org/Hibachi/HibachiSmartList.cfc:L39` determines what the resulting
 * record collection contains.
 */
type SmartListRowMappers = {
  readonly [TEntityName in SmartListRootEntityName]: (
    row: MySqlRow,
  ) => SmartListRecord<TEntityName>;
};

const ENTITY_ROW_MAPPERS: SmartListRowMappers = Object.freeze({
  SlatwallProduct: mapProductRow,
  SlatwallSku: mapSkuRow,
  SlatwallProductType: mapProductTypeRow,
  SlatwallBrand: mapBrandRow,
  SlatwallOption: mapOptionRow,
  SlatwallOptionGroup: mapOptionGroupRow,
});

/* The composed statement — inspectable without a database (AAP §0.7.3) */

/** One parameterized statement: the text, and the values bound to its placeholders in order. */
export interface SmartListStatement {
  /**
   * The statement text. Every identifier and structural keyword came from a closed whitelist; every
   * runtime value is represented by a `?`.
   */
  readonly sql: string;

  /** The bound values, in placeholder order. */
  readonly params: readonly unknown[];
}

/** Everything one described query compiles to, before anything is executed. */
export interface CompiledSmartListQuery {
  /** The base entity, echoed back so a test can assert the logical name it supplied. */
  readonly entityName: SmartListEntityName;

  /** The physical table the base entity resolved to. */
  readonly baseTable: PhysicalTableName;

  /** The base entity's alias, `a` + the lower-cased logical name, per `:L71`. */
  readonly baseAlias: string;

  /** All matching records, unpaged. Mirrors `org/Hibachi/HibachiSmartList.cfc:L751-L755`. */
  readonly records: SmartListStatement;

  /** The requested page. Mirrors `org/Hibachi/HibachiSmartList.cfc:L759-L764`. */
  readonly pageRecords: SmartListStatement;

  /** The distinct count. Mirrors `org/Hibachi/HibachiSmartList.cfc:L777-L778`. */
  readonly recordsCount: SmartListStatement;

  /** The resolved one-based first record of the page, per `:L790-L796`. */
  readonly pageRecordsStart: number;

  /** The resolved page size, per `:L66` and `:L762`. */
  readonly pageRecordsShow: number;

  /** The resolved page number, per `:L808-L809`. */
  readonly currentPage: number;

  /** Whether the record projection is distinct. */
  readonly selectDistinct: boolean;
}

/* The plan — per-query state, local to one build call (M7) */

/** One entity registered in a plan: the legacy `variables.entities[name]` struct, typed. */
interface PlannedEntity {
  /** The logical entity, used to look up relationships, the primary key and the row mapper. */
  readonly entityName: SmartListEntityName;

  /** The physical table, always obtained through {@link assertTableName}. */
  readonly table: PhysicalTableName;

  /** The SQL alias. Built from the logical name and a letter, never from caller input. */
  readonly alias: string;

  /**
   * The related property this entity was reached through, or the empty string for the base entity —
   * mirroring the `parentRelatedProperty=""` default of the private registrar at
   * `org/Hibachi/HibachiSmartList.cfc:L304`. It is not decoration: the alias-collision test at
   * `:L258` compares against it, which is what makes a repeated join idempotent.
   */
  readonly parentRelatedProperty: string;

  /**
   * The `JOIN ... ON ...` fragments this entity contributes. Empty for the base entity, one entry
   * for a foreign-key association and two for a many-to-many, which needs the link table joined
   * first.
   */
  readonly joinClauses: readonly string[];
}

/**
 * The accumulated shape of one query in progress — the legacy's `variables.entities` plus
 * `variables.entityJoinOrder`, both declared at `org/Hibachi/HibachiSmartList.cfc:L8-L9`.
 */
interface QueryPlan {
  /** The registry key of the base entity. */
  readonly baseEntityKey: string;

  /** Registered entities, keyed exactly as the legacy keys them — by entity name, not by path. */
  readonly entities: Map<string, PlannedEntity>;

  /** Registration order, which is emission order in the `FROM` clause, per `:L534-L549`. */
  readonly joinOrder: string[];
}

/** Opens a plan on a base entity. */
function openPlan(entityName: SmartListEntityName): QueryPlan {
  const baseAlias = `${ENTITY_ALIAS_LETTERS[0] ?? 'a'}${entityName.toLowerCase()}`;
  const plan: QueryPlan = {
    baseEntityKey: entityName,
    entities: new Map<string, PlannedEntity>(),
    joinOrder: [],
  };

  plan.entities.set(entityName, {
    entityName,
    table: assertTableName(entityName),
    alias: baseAlias,
    parentRelatedProperty: '',
    joinClauses: [],
  });
  plan.joinOrder.push(entityName);

  return plan;
}

/** Reads a registered entity, refusing to continue if the key is absent. */
function requireRegisteredEntity(plan: QueryPlan, entityKey: string): PlannedEntity {
  const entity = plan.entities.get(entityKey);

  if (entity === undefined) {
    throw new DomainError(
      'A smart-list join named a parent entity that has not been registered on this query, so the ' +
        'join could not be resolved. Register the parent before the association that hangs off it.',
      { context: { parentEntityName: entityKey, registered: [...plan.entities.keys()] } },
    );
  }

  return entity;
}

/* The join keyword — the empty join type emits **left**, not inner. */

/** Maps a declared join type onto the SQL keyword the legacy actually emits for it. */
function resolveJoinKeyword(joinType: SmartListJoinType | undefined): string {
  switch (joinType) {
    case 'left':
      return 'LEFT JOIN';
    case '':
    case undefined:
      // The empty string is `:L212`'s default and `:L538-L540` turns it into a left join.
      return 'LEFT JOIN';
  }
}

/* Join registration — a faithful port of org/Hibachi/HibachiSmartList.cfc:L246-L270. */

/**
 * Registers the association `relatedProperty` of an already-registered parent, and returns the
 * registry key of the entity it introduced.
 *
 * TODO(parity) `integrationServices/google/controllers/feed.cfc:L64` — the feed re-joins A
 * relationship `model/service/SkuService.cfc:L314` has already joined. The duplicate is preserved as a
 * caller-visible fact: a consumer may declare it, this member accepts it, and it is absorbed rather
 * than refused. It is absorbed only because the trace above proves the legacy absorbs it too; had the
 * proof failed, the second join would have had to be emitted as a second join. No optimisation is
 * being performed and none is claimed.
 *
 * @param plan - The plan being accumulated.
 * @param parentEntityKey - Registry key of the parent. Must already be registered.
 * @param relatedProperty - The association to traverse, as the caller names it.
 * @param joinType - `''` or `'left'`; both emit a left join. See {@link resolveJoinKeyword}.
 * @returns The registry key of the entity on the far side of the association.
 */
function registerJoin(
  plan: QueryPlan,
  parentEntityKey: string,
  relatedProperty: string,
  joinType: SmartListJoinType | undefined,
): string {
  const parent = requireRegisteredEntity(plan, parentEntityKey);
  const specification = ENTITY_JOIN_SPECIFICATIONS[parent.entityName][relatedProperty];

  if (specification === undefined) {
    throw new DomainError(
      'A smart-list query traversed a relationship that the extracted Catalog entity graph does ' +
        'not declare on the entity it was applied to, so the traversal was refused before any ' +
        'statement text was assembled.',
      { context: { parentEntityName: parent.entityName, relatedProperty } },
    );
  }

  const childEntityName = specification.childEntityName;
  const aliasBase = childEntityName.toLowerCase();

  // `:L246-L262` — advance through the twelve letters until the candidate alias is free, renaming the
  // registry key on every advance exactly as `:L255` does.
  let entityKey: string = childEntityName;
  let alias: string | undefined;

  for (let letterIndex = 0; letterIndex < ENTITY_ALIAS_LETTERS.length; letterIndex += 1) {
    const letter = ENTITY_ALIAS_LETTERS[letterIndex];

    if (letter === undefined) {
      break;
    }

    const candidateAlias = `${letter}${aliasBase}`;

    if (letterIndex > 0) {
      entityKey = `${entityKey.toLowerCase()}_${letter.toUpperCase()}`;
    }

    const registered = plan.entities.get(entityKey);
    const collides =
      (registered !== undefined &&
        registered.alias === candidateAlias &&
        registered.parentRelatedProperty !== relatedProperty) ||
      candidateAlias === parent.alias;

    if (!collides) {
      alias = candidateAlias;
      break;
    }
  }

  if (alias === undefined) {
    throw new DomainError(
      'A smart-list query needed more table aliases than the twelve the legacy alias list provides, ' +
        'so it was refused rather than given an alias the legacy could not have produced.',
      {
        context: {
          parentEntityName: parent.entityName,
          relatedProperty,
          aliasCapacity: ENTITY_ALIAS_LETTERS.length,
        },
      },
    );
  }

  // `:L269` — the existence guard. This is the line that makes the feed's duplicate join a no-op.
  const alreadyRegistered = plan.entities.get(entityKey);
  if (alreadyRegistered !== undefined) {
    return entityKey;
  }

  plan.entities.set(entityKey, {
    entityName: childEntityName,
    table: assertTableName(childEntityName),
    alias,
    parentRelatedProperty: relatedProperty,
    joinClauses: composeJoinClauses(parent, specification, alias, joinType),
  });
  plan.joinOrder.push(entityKey);

  return entityKey;
}

/** Registers one declared join — the three-part form a consumer writes out. */
function registerDeclaredJoin(plan: QueryPlan, join: SmartListJoin): string {
  return registerJoin(plan, join.parentEntityName, join.relatedProperty, join.joinType);
}

/** Turns one association into the `JOIN ... ON ...` fragments it needs. */
function composeJoinClauses(
  parent: PlannedEntity,
  specification: SmartListJoinSpecification,
  alias: string,
  joinType: SmartListJoinType | undefined,
): readonly string[] {
  const keyword = resolveJoinKeyword(joinType);
  const childTable = assertTableName(specification.childEntityName);
  const childPrimaryKey = assertColumnName(
    childTable,
    ENTITY_PRIMARY_KEY[specification.childEntityName],
  );
  const parentPrimaryKey = assertColumnName(parent.table, ENTITY_PRIMARY_KEY[parent.entityName]);

  switch (specification.kind) {
    case 'parentForeignKey': {
      // many-to-one: the parent table carries the foreign key.
      const parentColumn = assertColumnName(parent.table, specification.parentColumn);
      return [
        `${keyword} ${childTable} ${alias} ` +
          `ON ${alias}.${childPrimaryKey} = ${parent.alias}.${parentColumn}`,
      ];
    }

    case 'childForeignKey': {
      // one-to-many, inverse: the child table carries the foreign key.
      const childColumn = assertColumnName(childTable, specification.childColumn);
      return [
        `${keyword} ${childTable} ${alias} ` +
          `ON ${alias}.${childColumn} = ${parent.alias}.${parentPrimaryKey}`,
      ];
    }

    case 'linkTable': {
      // many-to-many: the link table first, then the far entity off the link table.
      const linkTable = assertTableName(specification.linkEntityTable);
      const linkAlias = `${alias}_link`;
      const linkParentColumn = assertColumnName(linkTable, specification.linkParentColumn);
      const linkChildColumn = assertColumnName(linkTable, specification.linkChildColumn);
      return [
        `${keyword} ${linkTable} ${linkAlias} ` +
          `ON ${linkAlias}.${linkParentColumn} = ${parent.alias}.${parentPrimaryKey}`,
        `${keyword} ${childTable} ${alias} ` +
          `ON ${alias}.${childPrimaryKey} = ${linkAlias}.${linkChildColumn}`,
      ];
    }
  }
}

/* Path resolution — a port of org/Hibachi/HibachiSmartList.cfc:L308-L349. */

/**
 * Resolves a logical property path to a qualified, whitelisted column, auto-joining every hop.
 *
 */
function resolvePropertyPath(plan: QueryPlan, propertyIdentifier: string): string {
  const segments = propertyIdentifier.split(PROPERTY_PATH_DELIMITER);

  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) {
    throw new DomainError(
      'A smart-list property path was empty or contained an empty segment, so no column could be ' +
        'resolved from it.',
      { context: { propertyIdentifier } },
    );
  }

  let entityKey = plan.baseEntityKey;

  // `:L329-L344` — every segment but the last is a hop, and each hop auto-joins with no join type.
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];

    if (segment === undefined) {
      throw new DomainError(
        'A smart-list property path lost a segment while it was being walked, so the path could ' +
          'not be resolved.',
        { context: { propertyIdentifier, segmentIndex: index } },
      );
    }

    entityKey = registerJoin(plan, entityKey, segment, '');
  }

  const entity = requireRegisteredEntity(plan, entityKey);
  const leaf = segments[segments.length - 1];

  if (leaf === undefined) {
    throw new DomainError(
      'A smart-list property path had no final segment, so there was no column to resolve.',
      { context: { propertyIdentifier } },
    );
  }

  return `${entity.alias}.${resolveLeafColumn(entity, leaf, propertyIdentifier)}`;
}

/** Resolves the final segment of a path to a column of the entity it belongs to. */
function resolveLeafColumn(
  entity: PlannedEntity,
  leaf: string,
  propertyIdentifier: string,
): string {
  const foreignKeyColumn = FOREIGN_KEY_LEAF_COLUMNS[entity.entityName][leaf];

  if (foreignKeyColumn !== undefined) {
    return assertColumnName(entity.table, foreignKeyColumn);
  }

  const specification = ENTITY_JOIN_SPECIFICATIONS[entity.entityName][leaf];

  if (specification !== undefined && specification.kind !== 'parentForeignKey') {
    throw new DomainError(
      'A smart-list property path ended at a collection association, which has no column on the ' +
        'table it belongs to. Extend the path to a stored property of the associated entity.',
      { context: { entityName: entity.entityName, leaf, propertyIdentifier } },
    );
  }

  return assertColumnName(entity.table, leaf);
}

/* Value splitting — CFML list semantics, which are not JavaScript split semantics. */

/** One composed clause: its text, and the values its placeholders consume, in order. */
interface ComposedClause {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * Splits a filter value the way `listLen` and `listGetAt` do, which is not the way `String.split`
 * does, and the difference is observable.
 */
function splitFilterValueForComparison(
  value: SmartListFilterValue,
): readonly SmartListFilterValue[] {
  if (typeof value !== 'string') {
    return [value];
  }

  const elements = value.split(FILTER_VALUE_DELIMITER).filter((element) => element.length > 0);

  // `listLen(...) gt 1` at `:L578` — anything else takes the single-value branch, which uses the raw
  // value and not a trimmed element.
  return elements.length > 1 ? elements : [value];
}

/**
 * Splits an in-filter value the way `listToArray` does — `:L622` — which also discards empty
 * elements, so `listToArray("")` is the empty array.
 */
function splitInFilterValues(value: SmartListFilterValue): readonly SmartListFilterValue[] {
  if (typeof value !== 'string') {
    return [value];
  }

  return value.split(FILTER_VALUE_DELIMITER).filter((element) => element.length > 0);
}

/** The `NULL` sentinel of `org/Hibachi/HibachiSmartList.cfc:L580` and `:L593`. */
function isNullFilterToken(value: SmartListFilterValue): boolean {
  return typeof value === 'string' && value.toLowerCase() === NULL_FILTER_TOKEN;
}

/* Where composition — a port of org/Hibachi/HibachiSmartList.cfc:L556-L712. */

/**
 * Composes one equality filter — `:L577-L601`.
 *
 */
function composeEqualityFilter(
  plan: QueryPlan,
  filter: SmartListFilter,
  params: unknown[],
): string {
  const column = resolvePropertyPath(plan, filter.propertyIdentifier);
  const values = splitFilterValueForComparison(filter.value);

  if (values.length > 1) {
    const disjuncts = values.map((value) => {
      if (isNullFilterToken(value)) {
        return `${column} IS NULL`;
      }
      params.push(value);
      return `${column} = ?`;
    });

    return `(${disjuncts.join(' OR ')})`;
  }

  const value = values[0];

  if (value === undefined) {
    throw new DomainError(
      'A smart-list equality filter produced no comparable value, so no predicate could be ' +
        'composed for it.',
      { context: { propertyIdentifier: filter.propertyIdentifier } },
    );
  }

  if (isNullFilterToken(value)) {
    return `${column} IS NULL`;
  }

  params.push(value);
  return `${column} = ?`;
}

/** Composes one like filter — `:L603-L618`. */
function composeLikeFilter(plan: QueryPlan, filter: SmartListFilter, params: unknown[]): string {
  const column = resolvePropertyPath(plan, filter.propertyIdentifier);
  const values = splitFilterValueForComparison(filter.value);

  if (values.length > 1) {
    const disjuncts = values.map((value) => {
      params.push(value);
      return `${column} LIKE ?`;
    });

    return `(${disjuncts.join(' OR ')})`;
  }

  const value = values[0];

  if (value === undefined) {
    throw new DomainError(
      'A smart-list like filter produced no comparable value, so no predicate could be composed ' +
        'for it.',
      { context: { propertyIdentifier: filter.propertyIdentifier } },
    );
  }

  params.push(value);
  return `${column} LIKE ?`;
}

/** Composes one in filter — `:L620-L628`. */
function composeInFilter(plan: QueryPlan, filter: SmartListFilter, params: unknown[]): string {
  const column = resolvePropertyPath(plan, filter.propertyIdentifier);
  const values = splitInFilterValues(filter.value);

  if (values.length === 0) {
    params.push(filter.value);
    return `${column} IN (?)`;
  }

  for (const value of values) {
    params.push(value);
  }

  return `${column} IN (${values.map(() => '?').join(', ')})`;
}

/**
 * Composes one range — `:L630-L659`, all three branches.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L630-L659` — the `'1^'` normalisation is a decision.
 * The legacy carries the range as the raw string `'1^'` all the way to statement assembly and decides
 * its meaning there by inspecting the first and last characters. Here it arrives already separated
 * into bounds, so the branch is chosen by which bound is present rather than by re-inspecting a
 * string, and `'1^'` becomes a lower bound of `1` with no upper bound — one `>= ?` comparison and one
 * parameter. The comparison, the operand and the absence of an upper bound are all identical to
 * `:L646`; only the point at which the string was decomposed moved, and it moved because the port
 * owns parsing. No bound was invented and none was tightened.
 */
function composeRange(
  plan: QueryPlan,
  range: SmartListRange,
  params: unknown[],
): string | undefined {
  const lowerBound = range.lowerBound;
  const upperBound = range.upperBound;

  if (lowerBound === undefined && upperBound === undefined) {
    return undefined;
  }

  const column = resolvePropertyPath(plan, range.propertyIdentifier);

  if (lowerBound !== undefined && upperBound !== undefined) {
    params.push(lowerBound);
    params.push(upperBound);
    return `${column} >= ? AND ${column} <= ?`;
  }

  if (upperBound !== undefined) {
    params.push(upperBound);
    return `${column} <= ?`;
  }

  params.push(lowerBound);
  return `${column} >= ?`;
}

/** Composes one where group's conjunction, or `undefined` when the group is empty. */
function composeWhereGroup(
  plan: QueryPlan,
  group: SmartListWhereGroup,
  params: unknown[],
): string | undefined {
  const predicates: string[] = [];

  for (const filter of group.filters ?? []) {
    predicates.push(composeEqualityFilter(plan, filter, params));
  }

  for (const likeFilter of group.likeFilters ?? []) {
    predicates.push(composeLikeFilter(plan, likeFilter, params));
  }

  for (const inFilter of group.inFilters ?? []) {
    predicates.push(composeInFilter(plan, inFilter, params));
  }

  for (const range of group.ranges ?? []) {
    const predicate = composeRange(plan, range, params);

    if (predicate !== undefined) {
      predicates.push(predicate);
    }
  }

  if (predicates.length === 0) {
    return undefined;
  }

  return `(${predicates.join(' AND ')})`;
}

/** Composes the keyword search — `:L671-L693`. */
function composeKeywordClause(plan: QueryPlan, query: SmartListQuery, params: unknown[]): string {
  const keywords = query.keywords ?? [];
  const keywordProperties = query.keywordProperties ?? [];

  // `:L670` tests both accumulators; either being empty means no keyword clause at all.
  if (keywords.length === 0 || keywordProperties.length === 0) {
    return '';
  }

  // Resolved first, and deliberately: resolution may register joins but binds no parameter, so doing
  // it up front cannot disturb placeholder order.
  const columns = keywordProperties.map((keywordProperty) =>
    resolvePropertyPath(plan, keywordProperty.propertyIdentifier),
  );

  const blocks = keywords.map((keyword) => {
    const disjuncts = columns.map((column) => {
      params.push(`${KEYWORD_WILDCARD}${keyword}${KEYWORD_WILDCARD}`);
      return `${column} LIKE ?`;
    });

    return `(${disjuncts.join(' OR ')})`;
  });

  return blocks.join(' AND ');
}

/**
 * Composes the whole `WHERE` clause, or an empty clause when there is nothing to constrain.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L565-L667` — the legacy can emit an unbalanced
 * parenthesis. The outer `(` is opened by the first non-empty group at `:L569`, but it is closed at
 * `:L666` only when the loop index equals the last index of the group array. If the final group is
 * empty it is skipped by the `:L562` guard, the index never reaches the closing test, and the outer
 * parenthesis is left open — invalid HQL that fails at prepare time. Balanced text is emitted here
 * instead, because emitting a statement that cannot be prepared preserves nothing. The situation is
 * unreachable through `src/ports/SmartListQueryPort.ts`, which contributes only non-empty groups, so
 * no observable behaviour differs; the divergence is recorded because it is a divergence.
 */
function composeWhereClause(plan: QueryPlan, query: SmartListQuery): ComposedClause {
  const params: unknown[] = [];
  const groups: string[] = [];

  for (const group of query.whereGroups ?? []) {
    const composed = composeWhereGroup(plan, group, params);

    if (composed !== undefined) {
      groups.push(composed);
    }
  }

  const keywordClause = composeKeywordClause(plan, query, params);
  const conjuncts: string[] = [];

  if (groups.length > 0) {
    conjuncts.push(`(${groups.join(' OR ')})`);
  }

  if (keywordClause.length > 0) {
    conjuncts.push(keywordClause);
  }

  if (conjuncts.length === 0) {
    return { sql: '', params };
  }

  return { sql: ` WHERE ${conjuncts.join(' AND ')}`, params };
}

/* Ordering — a port of org/Hibachi/HibachiSmartList.cfc:L717-L744. */

/** The property each base entity falls back to when a query declares no ordering. */
const ENTITY_DEFAULT_ORDER_PROPERTY: Readonly<Record<SmartListEntityName, string>> = Object.freeze({
  SlatwallSku: 'createdDateTime',
  SlatwallProduct: 'createdDateTime',
  SlatwallProductType: 'createdDateTime',
  SlatwallBrand: 'createdDateTime',
  SlatwallOption: 'createdDateTime',
  SlatwallOptionGroup: 'createdDateTime',
  SlatwallAlternateSkuCode: 'createdDateTime',
});

/** The complete set of SQL ordering keywords this builder may emit. */
const SMART_LIST_ORDER_DIRECTIONS = Object.freeze(['ASC', 'DESC'] as const);

/**
 * Narrows a runtime ordering token to the same closed set the port exposes statically.
 *
 * @param candidate - the direction found on the runtime query object.
 * @returns the accepted canonical direction.
 * @throws {DomainError} when erased or untyped input carries any other token.
 */
function assertSmartListOrderDirection(candidate: unknown): SmartListOrderDirection {
  const matched = SMART_LIST_ORDER_DIRECTIONS.find((direction) => direction === candidate);

  if (matched === undefined) {
    throw new DomainError(
      'A smart-list order named a direction outside the supported ASC/DESC set, so it was refused ' +
        'before any statement text was assembled.',
      {
        context: {
          receivedType: typeof candidate,
          allowedDirections: SMART_LIST_ORDER_DIRECTIONS,
        },
      },
    );
  }

  return matched;
}

/**
 * The direction the tiebreaker below is appended under. `ASC` matches the direction the legacy applies
 * to its own single default term at `:L742`, so the tiebreaker reads as a continuation of that clause
 * rather than as a second, differently-oriented ordering.
 */
const ORDER_TIEBREAKER_DIRECTION = 'ASC';

/**
 * Composes the `ORDER BY` clause — `:L717-L744`, plus a final primary-key tiebreaker.
 *
 * Translation decision — why a term the legacy does not emit is appended, and why that is not a
 * behaviour change.
 *
 * `:L717-L744` emits exactly one ordering term. When explicit orders are present it lists them; when
 * none are, it resolves a single default property and emits `ORDER BY <property> ASC`. In neither case
 * is there a tiebreaker, so whenever the final term's values tie, the relative order of the tied rows
 * is left undefined — and MySQL is free to resolve it differently in two statements, or in two
 * executions of the same statement.
 *
 * That is not a theoretical exposure here, because pagination is expressed as `LIMIT`/`OFFSET` over
 * this clause (see {@link SmartListQueryBuilder.build}, where `pageRecordsSql` is `recordsSql` plus the
 * two row bounds). A page is therefore a window into an order the statement did not fully specify: two
 * pages can both contain a given tied row and neither can contain another, so a sweep of every page
 * returns duplicates AND omissions rather than the record set. The default term makes that the ordinary
 * case rather than an exotic one — every in-scope entity falls back to `createdDateTime`, `SwProduct`
 * and `SwSku` declare it as MySQL `datetime` with no fractional seconds, and `SkuService.createSkus`
 * writes a whole combination batch inside one transaction, so every SKU of a product shares a value.
 * The same reasoning applies to an explicit ordering on a non-unique column, which is why the
 * tiebreaker is appended on both paths and not only on the default one.
 *
 * A tiebreaker can only ever order rows the current statement leaves unordered: it is consulted after
 * every term the caller or the fallback supplied, so any pair of rows those terms already separate
 * keeps the ordering they gave it, byte for byte. Nothing that was defined changes; what was undefined
 * becomes total. The column used is the base entity's primary key, which is the one column guaranteed
 * unique and non-null, already declared in {@link ENTITY_PRIMARY_KEY}, and already the expression the
 * legacy itself assembles for this purpose in `getBaseEntityPrimaryAliase()` at `:L713-L715`.
 *
 * It is skipped when the caller's own last term already resolves to that same column, so a query that
 * ordered by the primary key does not receive it twice.
 */
function composeOrderClause(plan: QueryPlan, query: SmartListQuery): string {
  const orders = query.orders ?? [];
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);

  /*
   * Resolved through the same path every other term takes, so the alias is the plan's own and the column
   * is registry-validated rather than interpolated.
   */
  const tiebreakerColumn = resolvePropertyPath(plan, ENTITY_PRIMARY_KEY[base.entityName]);
  const tiebreaker = `${tiebreakerColumn} ${ORDER_TIEBREAKER_DIRECTION}`;

  if (orders.length > 0) {
    const terms = orders.map((order) => {
      const direction = assertSmartListOrderDirection(order.direction);
      return `${resolvePropertyPath(plan, order.propertyIdentifier)} ${direction}`;
    });

    /*
     * A caller that already ends on the primary key has a total order, so appending would add a
     * redundant term. The comparison is on the resolved column, not on the property identifier, because
     * `skuID` and a path that lands on the same column must both count as already ordered by it.
     */
    const lastTerm = terms[terms.length - 1];
    const alreadyTotal = lastTerm !== undefined && lastTerm.startsWith(`${tiebreakerColumn} `);

    return ` ORDER BY ${(alreadyTotal ? terms : [...terms, tiebreaker]).join(', ')}`;
  }

  const defaultProperty = ENTITY_DEFAULT_ORDER_PROPERTY[base.entityName];
  const defaultColumn = resolvePropertyPath(plan, defaultProperty);

  /*
   * The fallback property is `createdDateTime` for all seven in-scope entities, so it is never the
   * primary key — but the guard is kept rather than assumed, because it is the same invariant the
   * explicit path relies on and the legacy's third fallback tier at `:L740` IS the primary key.
   */
  if (defaultColumn === tiebreakerColumn) {
    return ` ORDER BY ${defaultColumn} ${ORDER_TIEBREAKER_DIRECTION}`;
  }

  return ` ORDER BY ${defaultColumn} ${ORDER_TIEBREAKER_DIRECTION}, ${tiebreaker}`;
}

/* Paging — a port of org/Hibachi/HibachiSmartList.cfc:L792-L814. */

/** The paging figures one query resolves to, before any row is read. */
interface ResolvedPagination {
  readonly pageRecordsStart: number;
  readonly pageRecordsShow: number;
  readonly currentPage: number;
}

/**
 * Resolves the paging figures.
 *
 * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L26` — the declared page is typed as a string. The
 * property is `type="string"`, yet `:L56` seeds it with the number `1` and `:L793` compares it with
 * `>` and does arithmetic on it, relying on CFML's implicit coercion. The port keeps the string type
 * on the wire so the legacy shape stays visible; the conversion happens here, once, and refuses a
 * value that is not a number rather than letting `NaN` propagate into a `LIMIT`.
 */
function resolvePagination(pagination: SmartListPagination | undefined): ResolvedPagination {
  const pageRecordsShow = pagination?.pageRecordsShow ?? LEGACY_DEFAULT_PAGE_RECORDS_SHOW;
  const declaredStart = pagination?.pageRecordsStart ?? LEGACY_DEFAULT_PAGE_RECORDS_START;
  const declaredPageText =
    pagination?.currentPageDeclaration ?? LEGACY_DEFAULT_CURRENT_PAGE_DECLARATION;

  assertPositiveInteger(pageRecordsShow, 'page size');
  assertPositiveInteger(declaredStart, 'first record of the page');

  const declaredPage = Number(declaredPageText);

  if (!Number.isInteger(declaredPage) || declaredPage < 1) {
    throw new DomainError(
      'A smart-list query declared a current page that is not a whole number of at least one, so ' +
        'no page bounds could be derived from it.',
      { context: { currentPageDeclaration: declaredPageText } },
    );
  }

  // `:L793-L794` — the declared page wins whenever it is past the first page.
  const pageRecordsStart =
    declaredPage > 1 ? (declaredPage - 1) * pageRecordsShow + 1 : declaredStart;

  return {
    pageRecordsStart,
    pageRecordsShow,
    // `:L808-L809`.
    currentPage: Math.ceil(pageRecordsStart / pageRecordsShow),
  };
}

/** Refuses a paging figure that cannot be expressed as a `LIMIT` or `OFFSET` operand. */
function assertPositiveInteger(value: number, description: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new DomainError(
      `A smart-list query declared a ${description} that is not a whole number of at least one, so ` +
        'the page bounds could not be expressed.',
      { context: { description, value } },
    );
  }
}

/* Projection and source — a port of org/Hibachi/HibachiSmartList.cfc:L499-L553. */

/** Composes the record projection — `:L505-L521`. */
function composeSelectClause(plan: QueryPlan, selectDistinct: boolean): string {
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);

  return `SELECT ${selectDistinct ? 'DISTINCT ' : ''}${base.alias}.*`;
}

/**
 * The column alias the count projection is read back through. A literal of this file, never input.
 */
const RECORDS_COUNT_COLUMN_ALIAS = 'recordsCount';

/** Composes the counting projection — `:L502`. */
function composeCountSelectClause(plan: QueryPlan): string {
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);
  const primaryKey = assertColumnName(base.table, ENTITY_PRIMARY_KEY[base.entityName]);

  return `SELECT COUNT(DISTINCT ${base.alias}.${primaryKey}) AS ${RECORDS_COUNT_COLUMN_ALIAS}`;
}

/** Composes the `FROM` clause and every join, in registration order — `:L534-L549`. */
function composeFromClause(plan: QueryPlan): string {
  const base = requireRegisteredEntity(plan, plan.baseEntityKey);
  const fragments: string[] = [`${base.table} ${base.alias}`];

  for (const entityKey of plan.joinOrder) {
    if (entityKey === plan.baseEntityKey) {
      continue;
    }

    for (const joinClause of requireRegisteredEntity(plan, entityKey).joinClauses) {
      fragments.push(joinClause);
    }
  }

  return ` FROM ${fragments.join(' ')}`;
}

/* Hydration. */

/** Reads the single figure the counting statement produces. */
function readRecordsCount(rows: readonly MySqlRow[]): number {
  const row = rows[0];

  if (row === undefined) {
    throw new DataIntegrityError(
      'The smart-list counting statement returned no row, so the total record count could not be ' +
        'read.',
    );
  }

  const value = row[RECORDS_COUNT_COLUMN_ALIAS];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new DataIntegrityError(
    'The smart-list counting statement returned a value that is not a number, so the total record ' +
      'count could not be read.',
    { context: { column: RECORDS_COUNT_COLUMN_ALIAS } },
  );
}

/** Hydrates rows through the base entity's mapper. */
function materialiseRows<TEntityName extends SmartListRootEntityName>(
  rows: readonly MySqlRow[],
  mapper: (row: MySqlRow) => SmartListRecord<TEntityName>,
  entityName?: TEntityName,
  identityMap?: Map<string, SmartListRecord<TEntityName>>,
  /*
   * Mutable, as the note above states: both branches allocate a fresh array and nothing copies it
   * afterwards. `SmartListResult`'s members are `readonly`, which a mutable array satisfies, so this
   * width costs the result shape nothing and lets `executeRecords` answer without a defensive copy.
   */
): SmartListRecord<TEntityName>[] {
  if (entityName === undefined || identityMap === undefined) {
    return mapRows(rows, mapper);
  }

  // The identifier column is read from the row rather than from the mapped entity, because the entity
  // is what is being decided and because the primary key is the one column every mapper is guaranteed
  // to have been given (rule 3 omits foreign keys, never the primary key).
  const primaryKey = ENTITY_PRIMARY_KEY[entityName];
  const materialised: SmartListRecord<TEntityName>[] = [];
  for (const row of rows) {
    const key = row[primaryKey];
    if (typeof key !== 'string' || key === '') {
      // No usable identifier means nothing can be shared, so the row is mapped on its own rather than
      // being silently collapsed onto some other row's instance. The mapper is applied directly here
      // rather than through `mapRows([row], mapper)[0]`: `mapRows` is that same call in a loop, so for
      // one row the two are identical, while indexing a one-element array yields a possibly-undefined
      // element under `noUncheckedIndexedAccess` that only an assertion could remove.
      materialised.push(mapper(row));
      continue;
    }
    const existing = identityMap.get(key);
    if (existing !== undefined) {
      materialised.push(existing);
      continue;
    }
    // mapped exactly once. `manageEntity` installs a fresh error bag each time it runs, so mapping a
    // row twice would discard anything already accumulated on the first instance.
    const mapped = mapper(row);
    identityMap.set(key, mapped);
    materialised.push(mapped);
  }
  return materialised;
}

/**
 * The two things every execution member needs before it can run anything: the compiled statements and
 * the mapper their rows hydrate through.
 */
interface PreparedSmartList<TEntityName extends SmartListRootEntityName> {
  readonly compiled: CompiledSmartListQuery;
  readonly mapper: (row: MySqlRow) => SmartListRecord<TEntityName>;
}

/**
 * Decides whether the page statement can be skipped because it provably cannot return anything other
 * than the unpaged collection already in hand.
 *
 * @param compiled - The compiled query, for its resolved page bounds.
 * @param recordCount - How many rows the unpaged statement actually returned.
 */
function pageWindowCoversEveryRecord(
  compiled: CompiledSmartListQuery,
  recordCount: number,
): boolean {
  // `:L762` binds `pageRecordsStart - 1` as the offset, so a start of one is an offset of zero.
  return compiled.pageRecordsStart === 1 && recordCount <= compiled.pageRecordsShow;
}

/* The property-scoped smart list — getPropertySmartList. */

/**
 * Describes the smart list of one parent record's collection — the `getPropertySmartList` shape.
 *
 * @param parentEntityName - The entity that owns the collection.
 * @param collectionProperty - The collection property, for example `options`.
 * @param parentPrimaryKeyValue - The parent record's identifier, bound as a value.
 * @returns a query description ready for {@link SmartListQueryBuilder.build} or `execute`.
 */
export function describePropertyScopedSmartList(
  parentEntityName: SmartListEntityName,
  collectionProperty: string,
  parentPrimaryKeyValue: string,
): SmartListQuery {
  const specification = ENTITY_JOIN_SPECIFICATIONS[parentEntityName][collectionProperty];

  if (specification === undefined || specification.kind === 'parentForeignKey') {
    throw new DomainError(
      'A property-scoped smart list named a property that is not a collection on the entity that ' +
        'owns it, so there is no collection to scope.',
      { context: { parentEntityName, collectionProperty } },
    );
  }

  const collectionEntityName = specification.childEntityName;
  const inverseProperty = COLLECTION_INVERSE_PROPERTY[parentEntityName][collectionProperty];

  if (inverseProperty === undefined) {
    throw new DomainError(
      'A property-scoped smart list named a collection whose inverse association back to its owner ' +
        'is not declared, so the collection could not be constrained to one parent record.',
      { context: { parentEntityName, collectionProperty } },
    );
  }

  const inverseSpecification = ENTITY_JOIN_SPECIFICATIONS[collectionEntityName][inverseProperty];

  if (inverseSpecification === undefined) {
    throw new DomainError(
      'A property-scoped smart list resolved an inverse association that the collection entity ' +
        'does not declare, so the constraint could not be composed.',
      { context: { parentEntityName, collectionProperty, inverseProperty } },
    );
  }

  const filterPath =
    inverseSpecification.kind === 'parentForeignKey'
      ? inverseProperty
      : `${inverseProperty}${PROPERTY_PATH_DELIMITER}${ENTITY_PRIMARY_KEY[parentEntityName]}`;

  const propertyIdentifier = resolveSmartListPropertyIdentifier(collectionEntityName, filterPath);

  if (propertyIdentifier === undefined) {
    throw new DomainError(
      'A property-scoped smart list produced a constraint path that the declared entity graph does ' +
        'not admit, so it was refused before any statement text was assembled.',
      { context: { collectionEntityName, filterPath } },
    );
  }

  return {
    entityName: collectionEntityName,
    whereGroups: [{ filters: [{ propertyIdentifier, value: parentPrimaryKeyValue }] }],
  };
}

/* The resource bound —. */

/**
 * The resource bound on smart-list materialisation — (CWE-400, uncontrolled resource
 * consumption).
 */
export interface SmartListMaterialisationBudget {
  /**
   * Answers the largest number of records one smart-list query may materialise.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   * `CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY`
   */
  readonly resolveMaximumRecordsPerQuery: () => number;

  /**
   * Answers the largest number of query-complexity units one compiled statement may carry — review
   * finding's second half.
   *
   * @returns the operator-stated ceiling, as a positive safe integer
   * @throws {ConfigurationError} when this deployment stated no ceiling; the message names
   * `CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY`
   */
  readonly resolveMaximumPredicatesPerQuery: () => number;
}

/**
 * Builds the fail-closed materialisation-and-complexity budget from whatever figures a deployment stated.
 *
 * @param maximumRecordsPerQuery the row ceiling this deployment stated, or `undefined` for none
 * @param maximumPredicatesPerQuery the complexity ceiling this deployment stated, or `undefined`
 */
export function createSmartListMaterialisationBudget(
  maximumRecordsPerQuery: number | undefined,
  maximumPredicatesPerQuery: number | undefined,
): SmartListMaterialisationBudget {
  const requirePositiveSafeInteger = (value: number | undefined, member: string): void => {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new DomainError(
        `The smart-list ${member} must be a positive safe integer, so the configured value cannot ` +
          `bound a query.`,
        { context: { member, value } },
      );
    }
  };

  requirePositiveSafeInteger(maximumRecordsPerQuery, 'materialisation budget');
  requirePositiveSafeInteger(maximumPredicatesPerQuery, 'complexity budget');

  const resolve = (value: number | undefined, variable: string, refusal: string): number => {
    if (value !== undefined) {
      return value;
    }

    throw new ConfigurationError(
      `${refusal} Set ${variable}, or supply resourceBounds when composing the container.`,
      {
        context: { locator: 'org/Hibachi/HibachiSmartList.cfc:L751-L778', variable },
      },
    );
  };

  return Object.freeze({
    resolveMaximumRecordsPerQuery: (): number =>
      resolve(
        maximumRecordsPerQuery,
        'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY to the largest number of records this deployment ' +
          'permits one smart-list query to hydrate',
        'A smart-list query refuses to materialise an unbounded selection.',
      ),
    resolveMaximumPredicatesPerQuery: (): number =>
      resolve(
        maximumPredicatesPerQuery,
        'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY to the largest number of predicate, ordering ' +
          'and join units this deployment permits one smart-list statement to carry',
        'A smart-list query refuses to compile a statement of unbounded complexity.',
      ),
  });
}

/** A check an anonymous caller runs before it materialises anything (CWE-400). */
export type AnonymousMaterialisationGate = () => void;

/**
 * Builds the gate that refuses an unbounded anonymous materialisation (CWE-400).
 *
 * @param bounds the four figures the anonymous feed path applies, each stated or `undefined`
 */
export function createAnonymousMaterialisationGate(bounds: {
  readonly maximumRecordsPerQuery: number | undefined;
  readonly maximumPredicatesPerQuery: number | undefined;
  readonly maximumImagesPerRecord: number | undefined;
  readonly maximumResponseBytes: number | undefined;
}): AnonymousMaterialisationGate {
  /*
   * The order is the order the figures are applied in, so the variable an operator is told to set first is
   * the one the route would have needed first.
   */
  const required: readonly (readonly [number | undefined, string, string])[] = Object.freeze([
    [
      bounds.maximumRecordsPerQuery,
      'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
      'materialise an unbounded selection',
    ],
    [
      bounds.maximumPredicatesPerQuery,
      'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
      'compile a statement of unbounded complexity',
    ],
    [
      bounds.maximumImagesPerRecord,
      'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
      'expand a record by an unbounded number of images',
    ],
    [
      bounds.maximumResponseBytes,
      'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
      'buffer a document of unbounded size',
    ],
  ]);

  return () => {
    for (const [value, variable, refusal] of required) {
      if (value === undefined) {
        throw new ConfigurationError(
          `An anonymous route refuses to ${refusal}. Set ${variable}, or supply resourceBounds when ` +
            `composing the container.`,
          {
            context: {
              locator: 'integrationServices/google/controllers/feed.cfc:L54-L56',
              variable,
            },
          },
        );
      }
    }
  };
}

/* The builder. */

/**
 * Compiles described smart lists into parameterized MySQL, and runs them through an injected executor.
 */
export class SmartListQueryBuilder implements SmartListQueryPort {
  /**
   * @param executor - The statement executor. Injected, never constructed, and never bypassed: when
   * `src/adapters/mysql/UnitOfWork.ts` supplies a transaction-scoped executor, these reads run inside
   * that transaction and therefore observe rows the same transaction has written but not committed —
   * which is the visibility M6 turns on. Reaching for a pool directly would silently read committed
   * state instead, so the pool is not reachable from this file at all.
   *
   * @param aggregateLoaders - Resolves the many-to-one associations each root's consumers require, keyed
   * by root entity. Required, with no default, and the requirement is the point.
   */
  public constructor(
    private readonly executor: SqlExecutor,
    private readonly aggregateLoaders: Readonly<
      Record<SmartListEntityName, CatalogAggregateLoader | undefined>
    >,
    private readonly materialisationBudget: SmartListMaterialisationBudget,
  ) {}

  /** Compiles a description into its three statements and its paging figures, executing nothing. */
  public build(query: SmartListQuery): CompiledSmartListQuery {
    const plan = openPlan(query.entityName);

    for (const join of query.joins ?? []) {
      registerDeclaredJoin(plan, join);
    }

    const where = composeWhereClause(plan, query);
    const order = composeOrderClause(plan, query);
    const from = composeFromClause(plan);

    // `:L59` seeds the flag false, so an unstated flag means a non-distinct record projection.
    const selectDistinct = query.selectDistinctFlag ?? false;
    const paging = resolvePagination(query.pagination);
    const base = requireRegisteredEntity(plan, plan.baseEntityKey);

    /*
     * `getHQL()` at `:L748-L750` — select, from, where, order. The emitted text carries no row bound, and
     * that is still deliberate: it stays byte-parallel to the legacy statement, and appending
     * `LIMIT budget` here would be the silent truncation {@link SmartListMaterialisationBudget} rules
     * out. The row bound is enforced in {@link SmartListQueryBuilder.execute} and
     * {@link SmartListQueryBuilder.executeRecords}, which count first and refuse.
     */
    const recordsSql = `${composeSelectClause(plan, selectDistinct)}${from}${where.sql}${order}`;

    /* The complexity bound (CWE-400). */
    const complexityUnits =
      where.params.length + (query.orders ?? []).length + plan.joinOrder.length;
    const maximumPredicatesPerQuery = this.materialisationBudget.resolveMaximumPredicatesPerQuery();

    if (complexityUnits > maximumPredicatesPerQuery) {
      throw new DomainError(
        'A smart-list query composed more predicate, ordering and join units than the configured ' +
          'complexity budget admits, so it was refused before it could be executed rather than ' +
          'planned as an arbitrarily wide statement.',
        {
          context: {
            entityName: query.entityName,
            complexityUnits,
            maximumPredicatesPerQuery,
            boundParameters: where.params.length,
            orderingTerms: (query.orders ?? []).length,
            sources: plan.joinOrder.length,
          },
        },
      );
    }

    /*
     * `:L762` — the legacy's own offset and maximum-results pair, and the only bound in the emitted
     * text. It is not a resource control: the page figure can legitimately be `P:Show=ALL`, which
     * `src/ports/SmartListQueryPort.ts` resolves to 1,000,000,000. caps what that can actually
     * return, because a page cannot be wider than the record set the gate already admitted.
     */
    const pageRecordsSql = `${recordsSql} LIMIT ? OFFSET ?`;

    // `:L777` — select, from, where. No ORDER BY, and no bound: ordering a scalar aggregate would be
    // pointless and limiting it would change the answer.
    const recordsCountSql = `${composeCountSelectClause(plan)}${from}${where.sql}`;

    return {
      entityName: query.entityName,
      baseTable: base.table,
      baseAlias: base.alias,
      records: { sql: recordsSql, params: where.params },
      pageRecords: {
        sql: pageRecordsSql,
        /*
         * The two paging figures are bound through {@link toRowCountBinding}, and binding them as
         * plain numbers is a run-time failure that nothing here would catch. Against the pinned
         * `mysql2@3.23.2` and MySQL 8.4, a true prepared statement answers a number in a `LIMIT` or
         * `OFFSET` position with ER_WRONG_ARGUMENTS; the same statement with the same values as decimal
         * text returns the expected page. That module documents the measurement and why every
         * alternative was refused. It is applied here — not only in the bounded repository members —
         * because this is the only other row-count placeholder in the port, and the two must agree.
         */
        params: [
          ...where.params,
          toRowCountBinding(paging.pageRecordsShow),
          toRowCountBinding(paging.pageRecordsStart - 1),
        ],
      },
      recordsCount: { sql: recordsCountSql, params: where.params },
      pageRecordsStart: paging.pageRecordsStart,
      pageRecordsShow: paging.pageRecordsShow,
      currentPage: paging.currentPage,
      selectDistinct,
    };
  }

  /**
   * Runs a described query and returns its materialised outcome — all three legacy views.
   *
   * TODO(parity) `org/Hibachi/HibachiSmartList.cfc:L783-L785` — the legacy count is order-dependent.
   * `getRecordsCount` runs the dedicated counting statement only when the unpaged collection has not
   * already been materialised; if it has, the count degrades to the length of that collection, which
   * differs from `count(distinct ...)` whenever a fanning join is present and the distinct flag is off
   * (see {@link SMARTLIST_DISTINCT_ASYMMETRY}). So the same query reports two different totals
   * depending on which member a caller happened to read first. `src/ports/SmartListQueryPort.ts`
   * resolves that ambiguity in favour of the dedicated statement, and this member follows the port:
   * The count is always counted, never inferred.
   */
  public async execute<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListResult<SmartListRecord<TEntityName>>> {
    const { compiled, mapper } = this.prepare(query);

    /*
     *step 0 — the ceiling is resolved before the first statement, not between them. A
     * deployment that stated no figure learns so without a round trip, so a wiring error presents as a
     * wiring error rather than as a read that succeeds and is then discarded. Resolving once also means the
     * count gate and the two row gates below cannot compare against two different figures.
     */
    const maximumRecordsPerQuery = this.materialisationBudget.resolveMaximumRecordsPerQuery();

    /*
     *step 1 — the count runs first, and it is the only statement that can. It returns
     * exactly one row whatever the catalog holds, so it is safe to issue before any bound is known,
     * and running it here is what lets an over-budget query be refused before the unbounded collection
     * is materialised. The previous order — records, page, count — read the collection first, which
     * left a bound nothing to protect.
     */
    const countRows = await this.executor.execute(
      compiled.recordsCount.sql,
      compiled.recordsCount.params,
    );
    const recordsCount = readRecordsCount(countRows);

    /*
     *step 2 — the gate, fail-closed, before a single record row is read. Never skipped: review
     * finding made the budget required, so there is no unbudgeted path to skip for.
     */
    this.refuseOverBudgetCount(recordsCount, query.entityName, maximumRecordsPerQuery);

    // `:L751-L755` — the unpaged collection, from the unbounded statement.
    const recordRows = await this.executor.execute(compiled.records.sql, compiled.records.params);

    /*
     *step 3 — the residual re-check, stated rather than left implicit. The count and the row
     * statements are separate reads: inside a transaction-scoped executor they observe one snapshot and
     * agree, but in autocommit a concurrent insert between them can return more rows than the count
     * promised. The overshoot is refused rather than served, so it never becomes domain objects or a
     * response. Nothing here locks, retries or waits — this port introduces no such semantics (AAP §0.7.3).
     */
    this.refuseOverBudgetRows(
      recordRows.length,
      query.entityName,
      recordsCount,
      maximumRecordsPerQuery,
    );

    /*
     * One instance per row across both collections. `records` is the unpaged collection and
     * `pageRecords` is a window into the same query, so nearly every page record is also a record — but
     * they arrive as two result sets, and mapping them independently produces two objects for one
     * database row. Hydrating a collection then sets each member's back-reference to whichever owner
     * instance was processed last, so `group.options[0].optionGroup === group` is false for the other
     * instance and one option ends up inside two collections. A shared identity map removes that at its
     * root instead of ordering the hydration passes to hide it, and it is what a single Hibernate
     * session gives. Scoped to this call, never to the module (M7).
     */
    const identityMap = new Map<string, SmartListRecord<TEntityName>>();
    const records = materialiseRows(recordRows, mapper, query.entityName, identityMap);

    /*
     * `:L759-L764` — the page. Issued unless {@link pageWindowCoversEveryRecord} has already proved
     * that this statement's bounds cannot exclude a single row of what is in hand, in which case the
     * records are the page and re-reading them would cost a second scan for the same answer.
     */
    const pageReusesRecords = pageWindowCoversEveryRecord(compiled, recordRows.length);
    const pageRows = pageReusesRecords
      ? recordRows
      : await this.executor.execute(compiled.pageRecords.sql, compiled.pageRecords.params);
    if (!pageReusesRecords) {
      this.refuseOverBudgetRows(
        pageRows.length,
        query.entityName,
        recordsCount,
        maximumRecordsPerQuery,
      );
    }

    const pageRecords = pageReusesRecords
      ? records
      : materialiseRows(pageRows, mapper, query.entityName, identityMap);

    // `:L800-L803` — the page end, clamped to the total so a short final page reports its real end.
    const pageRecordsEnd = Math.min(
      compiled.pageRecordsStart + compiled.pageRecordsShow - 1,
      recordsCount,
    );

    /* Resolve the associations the projection could not carry. */
    /*
     * Exactly one association mechanism runs per root, and which one is decided by the root.
     * Two mechanisms exist because they were built for different reaches: the injected loader above is
     * supplied per root by the composition root, keeps catalog-specific statements out of this builder,
     * and is the one the Google feed's roots use; {@link SmartListQueryBuilder.hydrateAssociations} is
     * the built-in relationship pass, and it reaches roots no loader is supplied for — `SlatwallOptionGroup`
     * being the live case, whose `options` collection `ProductService.processProductAddOptionGroup`
     * indexes at `options[1]` (the D14 site), so an unhydrated group would make the carried-forward
     * defect unreproducible.
     */
    const loadAggregates = this.aggregateLoaders[query.entityName];
    if (loadAggregates !== undefined) {
      const batch = collectDistinctRowPairs(
        pageReusesRecords ? recordRows : [...recordRows, ...pageRows],
        pageReusesRecords ? records : [...records, ...pageRecords],
      );
      await loadAggregates({
        executor: this.executor,
        rows: batch.rows,
        entities: batch.entities,
      });
    } else {
      await this.hydrateAssociations(query.entityName, records, pageRecords);
    }

    return {
      records,
      pageRecords,
      recordsCount,
      pageRecordsStart: compiled.pageRecordsStart,
      pageRecordsEnd,
      currentPage: compiled.currentPage,
      // `:L812-L813`.
      totalPages: Math.ceil(recordsCount / compiled.pageRecordsShow),
    };
  }

  /**
   * Runs a described query for its unpaged records alone — one statement and one hydration.
   *
   * @typeParam TEntityName - The root entity, inferred from `query.entityName`, exactly as under
   * {@link execute} (see {@link materialiseRows} for how the element type follows from it rather than
   * being asserted into place).
   *
   * @param query - The complete, immutable description of the query to run.
   * @returns Every matching record, in the order the query's ordering terms produce, unpaged, in a
   * freshly hydrated array the caller owns.
   */
  public async executeRecords<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): Promise<SmartListRecord<TEntityName>[]> {
    const { compiled, mapper } = this.prepare(query);

    /*step 0 — resolved before the first statement, for the reason given on `execute`. */
    const maximumRecordsPerQuery = this.materialisationBudget.resolveMaximumRecordsPerQuery();

    /*
     * Steps 1 and 2 — count and gate, before the unbounded statement is issued. Always both, so no
     * path can issue neither.
     */
    const recordsCount = await this.gateRecordsOnlyRead(
      compiled,
      query.entityName,
      maximumRecordsPerQuery,
    );

    const recordRows = await this.executor.execute(compiled.records.sql, compiled.records.params);

    /*
     *step 3 — the residual re-check, for the same reason it exists on the paged path: the
     * count and the row statement are separate reads, so in autocommit a concurrent insert between
     * them can widen the row set after the gate has already passed it. Checked before hydration, where
     * the per-row cost and the retained memory are.
     */
    this.refuseOverBudgetRows(
      recordRows.length,
      query.entityName,
      recordsCount,
      maximumRecordsPerQuery,
    );

    const records = materialiseRows(
      recordRows,
      mapper,
      query.entityName,
      new Map<string, SmartListRecord<TEntityName>>(),
    );

    /*
     * Association resolution runs on the records-only path too. The Google feed reads the smart list through this
     * member, and `ProductFeedBuilder` dereferences `sku.getProduct` for every field it emits, so
     * omitting the association step here would leave the feed exactly as broken as it was before the
     * fix — with the defect merely relocated to the one path the feed actually uses.
     */
    const loadAggregates = this.aggregateLoaders[query.entityName];
    if (loadAggregates !== undefined) {
      // Deduplicated for the same reason as the paged member: a fanning join repeats one instance.
      const batch = collectDistinctRowPairs(recordRows, records);
      await loadAggregates({ executor: this.executor, rows: batch.rows, entities: batch.entities });
    } else {
      // The same single-mechanism rule as `execute`; see the note there.
      await this.hydrateAssociations(query.entityName, records, records);
    }

    return records;
  }

  /**
   * Compiles the query and selects the mapper its rows hydrate through — the step both execution
   * members share, so neither can compose a different statement from the same description.
   */
  private prepare<TEntityName extends SmartListRootEntityName>(
    query: SmartListQuery<TEntityName>,
  ): PreparedSmartList<TEntityName> {
    /*
     * The mapper lookup is total, so there is nothing left to guard. `ENTITY_ROW_MAPPERS`
     * is keyed by {@link SmartListRootEntityName}, the port constrains `query.entityName` to that same
     * union, and every key holds a mapper — so the lookup cannot answer `undefined` and the run-time
     * refusal it would otherwise need is a compile error at the call site instead. Rooting a
     * list at `SlatwallAlternateSkuCode`, the one entity name the slice models no domain type for, no
     * longer type-checks, which is strictly stronger than reporting it once the query has already been
     * composed and issued.
     */
    return { compiled: this.build(query), mapper: ENTITY_ROW_MAPPERS[query.entityName] };
  }

  /**
   * Resolve the associations of a materialised smart list, in a second pass, with one instance per
   * identifier.
   */
  private async hydrateAssociations(
    entityName: SmartListEntityName,
    records: readonly unknown[],
    pageRecords: readonly unknown[],
  ): Promise<void> {
    const entities = collectDistinctEntities(records, pageRecords);
    if (entities.length === 0) {
      return;
    }

    switch (entityName) {
      case 'SlatwallOption': {
        await this.hydrateOptionGroups(entities as readonly Option[]);
        return;
      }
      case 'SlatwallOptionGroup': {
        await this.hydrateOptionGroupOptions(entities as readonly OptionGroup[]);
        return;
      }
      case 'SlatwallProduct': {
        await this.hydrateProductAssociations(entities as readonly Product[]);
        return;
      }
      case 'SlatwallSku': {
        await this.hydrateSkuProducts(entities as readonly Sku[]);
        return;
      }
      default:
        // `SlatwallBrand`, `SlatwallProductType` and `SlatwallAlternateSkuCode` declare no
        // relationship that an in-scope consumer dereferences, so there is nothing to load. Returning
        // is the correct behaviour rather than a gap: rule 3 leaves the association absent and every
        // consumer of these three entities reads only their own columns.
        return;
    }
  }

  /**
   * Load rows of the far side of one association, grouped by the near side's identifier.
   *
   * @param orderColumns - Far-table columns to order by, for a collection whose legacy mapping declares
   * `orderby`. The near side's key is always prepended, which cannot change the per-owner order and
   * makes the read reproducible.
   *
   * @returns a map from near-side identifier to the far-side rows for it, in statement order. An owner
   * with no far-side row is simply absent from the map.
   */
  private async loadAssociationRows(
    nearEntityName: SmartListEntityName,
    relatedProperty: string,
    ownerKeys: readonly string[],
    orderColumns?: readonly string[],
  ): Promise<ReadonlyMap<string, MySqlRow[]>> {
    const specification = ENTITY_JOIN_SPECIFICATIONS[nearEntityName][relatedProperty];
    if (specification === undefined || specification.kind === 'linkTable') {
      throw new DomainError(
        'An association load was requested for a relationship this member cannot compose a statement ' +
          'for. Many-to-many collections are loaded by the repository that owns them, because the link ' +
          'table needs an alias of its own.',
        { context: { nearEntityName, relatedProperty } },
      );
    }

    const nearTable = assertTableName(nearEntityName);
    const nearPrimaryKey = assertColumnName(nearTable, ENTITY_PRIMARY_KEY[nearEntityName]);
    const farTable = assertTableName(specification.childEntityName);
    const farAlias = ASSOCIATION_FAR_ALIAS;

    let sql: string;
    if (specification.kind === 'parentForeignKey') {
      // many-to-one: the near table carries the foreign key, so the near table must be in the
      // statement to supply both the owner key and the key to join on.
      const nearColumn = assertColumnName(nearTable, specification.parentColumn);
      sql =
        `SELECT ${ASSOCIATION_NEAR_ALIAS}.${nearPrimaryKey} AS ${ASSOCIATION_OWNER_KEY}, ${farAlias}.* ` +
        `FROM ${nearTable} ${ASSOCIATION_NEAR_ALIAS} ` +
        `INNER JOIN ${farTable} ${farAlias} ` +
        `ON ${farAlias}.${assertColumnName(farTable, ENTITY_PRIMARY_KEY[specification.childEntityName])} ` +
        `= ${ASSOCIATION_NEAR_ALIAS}.${nearColumn} ` +
        `WHERE ${ASSOCIATION_NEAR_ALIAS}.${nearPrimaryKey} IN (${composeOwnerPlaceholders(ownerKeys)})`;
      // INNER, not LEFT, and deliberately: a NULL foreign key yields no row, the owner is absent from
      // the map, and the association stays absent on the entity. A LEFT join would return a row of all
      // NULLs that the mapper would have to be taught to recognise as "no association", which is how a
      // stub gets built by accident.
    } else {
      // one-to-many inverse: the far table carries the foreign key, so the near table is not needed at
      // all and the foreign key doubles as the owner key.
      const farColumn = assertColumnName(farTable, specification.childColumn);
      sql =
        `SELECT ${farAlias}.${farColumn} AS ${ASSOCIATION_OWNER_KEY}, ${farAlias}.* ` +
        `FROM ${farTable} ${farAlias} ` +
        `WHERE ${farAlias}.${farColumn} IN (${composeOwnerPlaceholders(ownerKeys)})`;
    }

    const orderTerms = [`${farAlias}.${ASSOCIATION_OWNER_KEY}`];
    if (orderColumns !== undefined && orderColumns.length > 0) {
      orderTerms.length = 0;
      orderTerms.push(ASSOCIATION_OWNER_KEY);
      for (const column of orderColumns) {
        orderTerms.push(`${farAlias}.${assertColumnName(farTable, column)}`);
      }
      sql += ` ORDER BY ${orderTerms.join(', ')}`;
    }

    const rows = await this.executor.execute(sql, [...ownerKeys]);
    const grouped = new Map<string, MySqlRow[]>();
    for (const row of rows) {
      const ownerKey = row[ASSOCIATION_OWNER_KEY];
      if (typeof ownerKey !== 'string') {
        throw new DataIntegrityError(
          `An association load returned a row whose ${ASSOCIATION_OWNER_KEY} is not a string.`,
        );
      }
      const bucket = grouped.get(ownerKey);
      if (bucket === undefined) {
        grouped.set(ownerKey, [row]);
      } else {
        bucket.push(row);
      }
    }
    return grouped;
  }

  /**
   * Resolve `Option.optionGroup` — `model/entity/Option.cfc:L59`, `many-to-one fkcolumn="optionGroupID"`.
   */
  private async hydrateOptionGroups(options: readonly Option[]): Promise<void> {
    const keys = collectIdentifiers(options, (option) => option.optionID);
    if (keys.length === 0) {
      return;
    }
    const grouped = await this.loadAssociationRows('SlatwallOption', 'optionGroup', keys);
    const identityMap = new Map<string, OptionGroup>();
    for (const option of options) {
      const row = grouped.get(option.optionID)?.[0];
      if (row === undefined) {
        continue;
      }
      option.optionGroup = resolveMapped(row, 'optionGroupID', identityMap, mapOptionGroupRow);
    }
  }

  /**
   * Resolve `OptionGroup.options` — `model/entity/OptionGroup.cfc:L70`, `one-to-many`
   * `fkcolumn="optionGroupID" inverse="true" cascade="all-delete-orphan" orderby="sortOrder"`.
   */
  private async hydrateOptionGroupOptions(groups: readonly OptionGroup[]): Promise<void> {
    const keys = collectIdentifiers(groups, (group) => group.optionGroupID);
    if (keys.length === 0) {
      return;
    }
    const grouped = await this.loadAssociationRows('SlatwallOptionGroup', 'options', keys, [
      'sortOrder',
      'optionID',
    ]);
    const identityMap = new Map<string, Option>();
    for (const group of groups) {
      const rows = grouped.get(group.optionGroupID);
      if (rows === undefined) {
        continue;
      }
      for (const row of rows) {
        const option = resolveMapped(row, 'optionID', identityMap, mapOptionRow);
        option.optionGroup = group;
        group.options.push(option);
      }
    }
  }

  /**
   * Resolve `Product.productType`, `Product.brand` and `Product.defaultSku` — the three relationships
   * `integrationServices/google/controllers/feed.cfc:L64-L66` joins, declared at
   * `model/entity/Product.cfc:L68`, `:L69` and `:L70`, all `many-to-one`.
   */
  private async hydrateProductAssociations(products: readonly Product[]): Promise<void> {
    const keys = collectIdentifiers(products, (product) => product.productID);
    if (keys.length === 0) {
      return;
    }

    const [productTypeRows, brandRows, defaultSkuRows] = [
      await this.loadAssociationRows('SlatwallProduct', 'productType', keys),
      await this.loadAssociationRows('SlatwallProduct', 'brand', keys),
      await this.loadAssociationRows('SlatwallProduct', 'defaultSku', keys),
    ];

    const productTypes = new Map<string, ProductType>();
    const brands = new Map<string, Brand>();
    const defaultSkus = new Map<string, Sku>();
    const delegates = new Map<Sku, ProductDefaultSkuDelegate>();

    for (const product of products) {
      const productTypeRow = productTypeRows.get(product.productID)?.[0];
      if (productTypeRow !== undefined) {
        product.productType = resolveMapped(
          productTypeRow,
          'productTypeID',
          productTypes,
          mapProductTypeRow,
        );
      }
      const brandRow = brandRows.get(product.productID)?.[0];
      if (brandRow !== undefined) {
        product.brand = resolveMapped(brandRow, 'brandID', brands, mapBrandRow);
      }
      const defaultSkuRow = defaultSkuRows.get(product.productID)?.[0];
      if (defaultSkuRow !== undefined) {
        const defaultSku = resolveMapped(defaultSkuRow, 'skuID', defaultSkus, mapSkuRow);
        product.defaultSku = resolveDefaultSkuDelegate(defaultSku, delegates);
      }
    }
  }

  /**
   * Resolve `Sku.product` — `model/entity/Sku.cfc:L65`, `many-to-one fkcolumn="productID"` — and then
   * that product's own three associations.
   */
  private async hydrateSkuProducts(skus: readonly Sku[]): Promise<void> {
    const keys = collectIdentifiers(skus, (sku) => sku.skuID);
    if (keys.length === 0) {
      return;
    }
    const grouped = await this.loadAssociationRows('SlatwallSku', 'product', keys);
    const products = new Map<string, Product>();
    for (const sku of skus) {
      const row = grouped.get(sku.skuID)?.[0];
      if (row === undefined) {
        continue;
      }
      sku.product = resolveMapped(row, 'productID', products, mapProductRow);
    }
    await this.hydrateProductAssociations([...products.values()]);
  }

  /**
   * Counts and gates a records-only reading.
   *
   * @param compiled - the compiled query, for its counting statement and bound parameters.
   * @param entityName - the queried entity, for the refusal's diagnostic context.
   * @param maximumRecordsPerQuery - the ceiling the caller already resolved, so no statement is issued
   * before a deployment that stated none has been told so.
   */
  private async gateRecordsOnlyRead(
    compiled: CompiledSmartListQuery,
    entityName: SmartListEntityName,
    maximumRecordsPerQuery: number,
  ): Promise<number | undefined> {
    const countRows = await this.executor.execute(
      compiled.recordsCount.sql,
      compiled.recordsCount.params,
    );
    const recordsCount = readRecordsCount(countRows);
    this.refuseOverBudgetCount(recordsCount, entityName, maximumRecordsPerQuery);

    return recordsCount;
  }

  /**
   * Refuses a query whose count exceeds the materialisation budget —, the primary gate.
   *
   * @param recordsCount - the total the counting statement reported.
   * @param entityName - the queried entity, recorded for diagnosis only.
   * @param maximumRecordsPerQuery - the ceiling the calling member resolved before issuing any statement;
   * See, step 0 on {@link SmartListQueryBuilder.execute}. Passed in rather than resolved
   * here so one reading cannot compare its count and its rows against two different figures.
   */
  private refuseOverBudgetCount(
    recordsCount: number,
    entityName: SmartListEntityName,
    maximumRecordsPerQuery: number,
  ): void {
    if (recordsCount > maximumRecordsPerQuery) {
      throw new DomainError(
        'A smart-list query matched more records than the configured materialisation budget admits, ' +
          'so it was refused before any row was read rather than answered with a silently shortened ' +
          'result.',
        { context: { entityName, recordsCount, maximumRecordsPerQuery } },
      );
    }
  }

  /**
   * Refuses a row set that exceeds the materialisation budget —, the defence-in-depth half.
   *
   * @param rowsRead - how many rows the statement returned.
   * @param entityName - the queried entity, recorded for diagnosis only.
   * @param recordsCount - the total the counting statement reported, recorded so the divergence
   * between the two reads is visible rather than inferred. Retained as optional in the signature
   * because it is diagnostic only; every current caller supplies it, since removed the
   * unbudgeted path on which no counting statement was issued.
   */
  private refuseOverBudgetRows(
    rowsRead: number,
    entityName: SmartListEntityName,
    recordsCount: number | undefined,
    maximumRecordsPerQuery: number,
  ): void {
    if (rowsRead > maximumRecordsPerQuery) {
      throw new DomainError(
        'A smart-list statement returned more rows than the configured materialisation budget ' +
          'admits, so the result was refused before any row was hydrated rather than answered with a ' +
          'silently shortened result.',
        { context: { entityName, rowsRead, recordsCount, maximumRecordsPerQuery } },
      );
    }
  }
}

/**
 * Wrap a mapped SKU as the delegate `Product.defaultSku` declares, memoized per SKU instance.
 *
 * TODO(boundary) — the six raising members become real reads once a composition root can bind
 * `ImagePathPort` and `SettingResolverPort` here (§0.2.2.7). `src/config/container.ts` is not part of this
 * checkpoint's inventory, so no wiring is invented for it; the raise names the gap instead of hiding it.
 *
 * @param sku - The mapped default SKU.
 * @param memo - Per-read memo, so one SKU instance yields one delegate instance. Without it two products
 * sharing a default SKU would receive two wrappers and `===` between them would be false, which would
 * defeat the identity map one level up.
 */
function resolveDefaultSkuDelegate(
  sku: Sku,
  memo: Map<Sku, ProductDefaultSkuDelegate>,
): ProductDefaultSkuDelegate {
  const existing = memo.get(sku);
  if (existing !== undefined) {
    return existing;
  }

  const unresolvable = (member: string, port: string): never => {
    throw new DomainError(
      `A product's default SKU was read through '${member}', which needs ${port} to answer. A default ` +
        'SKU hydrated by the smart-list adapter carries only the columns of its own row, so this read ' +
        'was refused rather than answered with a fabricated value.',
      { context: { member, port, skuID: sku.skuID } },
    );
  };

  const delegate: ProductDefaultSkuDelegate = {
    getPrice: () => sku.getPrice(),
    getListPrice: () => sku.getListPrice(),
    getRenewalPrice: () => sku.getRenewalPrice(),
    getCurrencyCode: () => unresolvable('getCurrencyCode', 'SettingResolverPort'),
    getImageDirectory: () => unresolvable('getImageDirectory', 'ImagePathPort'),
    getImagePath: () => unresolvable('getImagePath', 'ImagePathPort'),
    getImage: () => unresolvable('getImage', 'ImagePathPort'),
    getResizedImagePath: () => unresolvable('getResizedImagePath', 'ImagePathPort'),
    getImageExistsFlag: () => unresolvable('getImageExistsFlag', 'ImagePathPort'),
  };
  memo.set(sku, delegate);
  return delegate;
}

/** The alias under which an association load returns the near side's identifier. */
const ASSOCIATION_OWNER_KEY = 'smartListAssociationOwnerKey';

/** Statement aliases for an association load. Structure, never bound. */
const ASSOCIATION_NEAR_ALIAS = 'associationNear';
const ASSOCIATION_FAR_ALIAS = 'associationFar';

/** One `?` per owner key. Values only — `?` cannot substitute an identifier (TR-4, AAP §0.7.3). */
function composeOwnerPlaceholders(ownerKeys: readonly string[]): string {
  return ownerKeys.map(() => '?').join(', ');
}

/** Collect the entities of both smart-list collections, once each, preserving first-seen order. */
/**
 * Pair each row with the entity it hydrated into, keeping one pair per DISTINCT entity.
 *
 * @param rows - the result rows, index-aligned with `entities`.
 * @param entities - the hydrated entities.
 * @returns The deduplicated, still index-aligned pair of arrays.
 */
function collectDistinctRowPairs<T>(
  rows: readonly MySqlRow[],
  entities: readonly T[],
): { readonly rows: readonly MySqlRow[]; readonly entities: readonly T[] } {
  const seen = new Set<T>();
  const pairedRows: MySqlRow[] = [];
  const pairedEntities: T[] = [];
  entities.forEach((entity, index) => {
    const row = rows[index];
    if (row === undefined || seen.has(entity)) {
      return;
    }
    seen.add(entity);
    pairedRows.push(row);
    pairedEntities.push(entity);
  });
  return { rows: pairedRows, entities: pairedEntities };
}

function collectDistinctEntities(
  records: readonly unknown[],
  pageRecords: readonly unknown[],
): readonly object[] {
  const seen = new Set<object>();
  const collected: object[] = [];
  for (const candidate of [...records, ...pageRecords]) {
    if (typeof candidate !== 'object' || candidate === null || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    collected.push(candidate);
  }
  return collected;
}

/** Collect the distinct, non-empty identifiers of a batch, preserving order. */
function collectIdentifiers<TEntity>(
  entities: readonly TEntity[],
  readIdentifier: (entity: TEntity) => string,
): readonly string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    const key = readIdentifier(entity);
    if (key === '' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * Map a row to an entity, returning the instance already mapped for that identifier when there is one.
 */
function resolveMapped<TEntity>(
  row: MySqlRow,
  identifierColumn: string,
  identityMap: Map<string, TEntity>,
  mapper: (row: MySqlRow) => TEntity,
): TEntity {
  const key = row[identifierColumn];
  if (typeof key !== 'string' || key === '') {
    throw new DataIntegrityError(
      `An association load returned a row whose ${identifierColumn} is not a non-empty string, so it ` +
        'could not be identity-mapped.',
    );
  }
  const existing = identityMap.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const mapped = mapper(row);
  identityMap.set(key, mapped);
  return mapped;
}
