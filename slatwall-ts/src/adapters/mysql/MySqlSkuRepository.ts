/**
 * `MySqlSkuRepository` — the MySQL implementation of `SkuRepository`, and the file where the
 * Catalog's option-to-SKU resolution algorithm actually lands.
 *
 * Legacy origin: `model/dao/SkuDAO.cfc`. AAP §0.4.1.7 row 1 specifies this file as "The
 * option-resolution HQL [L106-L128] becomes parameterized SQL over `SwSku`/`SwSkuOption` per
 * §0.3.3.1; the sorted-SKU `SUM(sortOrder * POWER(10, …))` ordering [L172-L204] translated with
 * defect D8 and its TODO carried; the 10-way transaction-existence chain [L53-L98] translated as a
 * single query; SKU-code lookup with alternate-code fallback [L102-L104]; conditional fetch
 * behaviour [L150-L168] with defect D9 noted".
 *
 * AAP §0.1.1 explains why this matters more than its position in the layer diagram suggests: the
 * option-to-SKU resolution algorithm "lives in a DAO as a hand-assembled HQL string", so a
 * syntax-level transliteration of the four named services would produce thin, nearly empty classes
 * and silently lose the system's behaviour. AAP §0.2.1.3 says it plainly — this is where the
 * Catalog's business logic actually resides.
 *
 */

import {
  resolveBaseProductType,
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE,
} from '../../domain/BaseProductType';
import type { Option } from '../../domain/option/Option';
import type { OptionGroup } from '../../domain/option/OptionGroup';
import type { Product, ProductTransactionExistenceChecker } from '../../domain/product/Product';
import type { Sku, SkuTransactionExistenceChecker } from '../../domain/sku/Sku';
import { SKU_UNSAVED_ID_VALUE } from '../../domain/sku/Sku';
import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import type { SkuRepository, SkuRow, SkuSearchRow } from '../../ports/repositories/SkuRepository';
import type {
  PhysicalTableName,
  RegisteredTableName,
  SqlMutationExecutor,
  StatementComplexityBudget,
} from './QueryRunner';
import {
  assertColumnName,
  assertRegisteredColumnName,
  assertRegisteredTableName,
  assertStatementComplexityWithinBudget,
  assertTableName,
} from './QueryRunner';
import { attachFetchedSkuAssociations } from './SmartListQueryBuilder';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../domain/base/AuditableEntity';
import type { AccountContextPort } from '../../ports/AccountContextPort';
import type { MySqlRow } from './rowMappers';
import type { SkuOwnedLinkCollection } from './rowMappers';
import {
  isSkuOwnedLinkAuthoritative,
  mapOptionGroupRow,
  mapOptionRow,
  mapRows,
  mapSkuRow,
  mapSkuSearchRow,
  markSkuOwnedLinkLoaded,
  readHydratedSkuSubscriptionTermID,
} from './rowMappers';

/* In-scope physical identifiers — resolved through the whitelist, never written as bare text. */

/** `SwSku` — `model/entity/Sku.cfc:L49`. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwSkuOption`, the owning side's link table — `model/entity/Sku.cfc:L76`. */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** The other three link tables `model/entity/Sku.cfc` owns — `:L77`, `:L78` and `:L79`. */
const SKU_ACCESS_CONTENT_TABLE = assertTableName('SwSkuAccessContent');

/** `model/entity/Sku.cfc:L78` — `subscriptionBenefits`. */
const SKU_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuSubsBenefit');

/**
 * `model/entity/Sku.cfc:L79` — `renewalSubscriptionBenefits`. A different table, the same far column.
 */
const SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuRenewalSubsBenefit');

/** `SwOption` — `model/entity/Option.cfc:L49`. */
const OPTION_TABLE = assertTableName('SwOption');

/** `SwOptionGroup` — `model/entity/OptionGroup.cfc:L49`. */
const OPTION_GROUP_TABLE = assertTableName('SwOptionGroup');

/** `SwProduct` — `model/entity/Product.cfc:L49`. */
const PRODUCT_TABLE = assertTableName('SwProduct');

/** The `SwSku` columns this adapter names, each validated against the table it belongs to. */
const SKU_COLUMN = Object.freeze({
  /**
   * Primary key, 32 characters, generated in application code — `model/entity/Sku.cfc:L52` (IR-6).
   */
  skuID: assertColumnName(SKU_TABLE, 'skuID'),
  /** `unique="true"` — `model/entity/Sku.cfc:L54`, which is why a multi-match is a data fault. */
  skuCode: assertColumnName(SKU_TABLE, 'skuCode'),
  /** The product foreign key — `model/entity/Sku.cfc:L65` `fkcolumn="productID"`. */
  productID: assertColumnName(SKU_TABLE, 'productID'),
  /**
   * The subscription-term foreign key — `model/entity/Sku.cfc:L66` `fkcolumn="subscriptionTermID"`.
   */
  subscriptionTermID: assertColumnName(SKU_TABLE, 'subscriptionTermID'),
  activeFlag: assertColumnName(SKU_TABLE, 'activeFlag'),
  listPrice: assertColumnName(SKU_TABLE, 'listPrice'),
  price: assertColumnName(SKU_TABLE, 'price'),
  renewalPrice: assertColumnName(SKU_TABLE, 'renewalPrice'),
  imageFile: assertColumnName(SKU_TABLE, 'imageFile'),
  userDefinedPriceFlag: assertColumnName(SKU_TABLE, 'userDefinedPriceFlag'),
  calculatedQATS: assertColumnName(SKU_TABLE, 'calculatedQATS'),
  remoteID: assertColumnName(SKU_TABLE, 'remoteID'),
  createdDateTime: assertColumnName(SKU_TABLE, 'createdDateTime'),
  createdByAccountID: assertColumnName(SKU_TABLE, 'createdByAccountID'),
  modifiedDateTime: assertColumnName(SKU_TABLE, 'modifiedDateTime'),
  modifiedByAccountID: assertColumnName(SKU_TABLE, 'modifiedByAccountID'),
});

/** The two `SwSkuOption` columns — `model/entity/Sku.cfc:L76`. */
const SKU_OPTION_COLUMN = Object.freeze({
  skuID: assertColumnName(SKU_OPTION_TABLE, 'skuID'),
  optionID: assertColumnName(SKU_OPTION_TABLE, 'optionID'),
});

/** The three remaining link tables, each as its own owning and far column pair. */
const SKU_LINK_COLUMN = Object.freeze({
  /**
   * The option link, restated in the shared shape. The names are the same two the dedicated
   * {@link SKU_OPTION_COLUMN} carries and both are kept: that constant is read by the option-resolution
   * and sorted-SKU queries elsewhere in this adapter, where `optionID` is the meaningful name, while this
   * member exists so the write path can treat all four collections as one kind of thing.
   */
  option: Object.freeze({
    skuID: SKU_OPTION_COLUMN.skuID,
    far: SKU_OPTION_COLUMN.optionID,
  }),
  accessContent: Object.freeze({
    skuID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'skuID'),
    far: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'contentID'),
  }),
  subscriptionBenefit: Object.freeze({
    skuID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
    far: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'subscriptionBenefitID'),
  }),
  renewalSubscriptionBenefit: Object.freeze({
    skuID: assertColumnName(SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
    far: assertColumnName(SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE, 'subscriptionBenefitID'),
  }),
});

/** The `SwOption` columns the odometer reads — `model/entity/Option.cfc:L56`, `:L59`. */
const OPTION_COLUMN = Object.freeze({
  optionID: assertColumnName(OPTION_TABLE, 'optionID'),
  optionGroupID: assertColumnName(OPTION_TABLE, 'optionGroupID'),
  /**
   * Nullable, and it is the multiplicand of the ordering sum. See
   * {@link MySqlSkuRepository.findSortedSkuIdsByProduct}.
   */
  sortOrder: assertColumnName(OPTION_TABLE, 'sortOrder'),
});

/** The `SwOptionGroup` columns the odometer reads — `model/entity/OptionGroup.cfc:L52`, `:L58`. */
const OPTION_GROUP_COLUMN = Object.freeze({
  optionGroupID: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID'),
  sortOrder: assertColumnName(OPTION_GROUP_TABLE, 'sortOrder'),
});

/**
 * The `SwOption` and `SwOptionGroup` columns {@link MySqlSkuRepository.hydrateSkuOptions} selects.
 */
const SKU_OPTION_HYDRATION_COLUMN = Object.freeze({
  optionID: assertColumnName(OPTION_TABLE, 'optionID'),
  optionCode: assertColumnName(OPTION_TABLE, 'optionCode'),
  optionName: assertColumnName(OPTION_TABLE, 'optionName'),
  optionDescription: assertColumnName(OPTION_TABLE, 'optionDescription'),
  sortOrder: assertColumnName(OPTION_TABLE, 'sortOrder'),
  optionGroupID: assertColumnName(OPTION_TABLE, 'optionGroupID'),
  remoteID: assertColumnName(OPTION_TABLE, 'remoteID'),
  createdDateTime: assertColumnName(OPTION_TABLE, 'createdDateTime'),
  createdByAccountID: assertColumnName(OPTION_TABLE, 'createdByAccountID'),
  modifiedDateTime: assertColumnName(OPTION_TABLE, 'modifiedDateTime'),
  modifiedByAccountID: assertColumnName(OPTION_TABLE, 'modifiedByAccountID'),
  optionGroupName: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupName'),
  optionGroupCode: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupCode'),
  optionGroupDescription: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupDescription'),
  imageGroupFlag: assertColumnName(OPTION_GROUP_TABLE, 'imageGroupFlag'),
});

/** Statement aliases for the option-hydration join. Structure, never bound. */
const HYDRATION_LINK_ALIAS = 'skuOptionLink';
const HYDRATION_OPTION_ALIAS = 'hydratedOption';
const HYDRATION_GROUP_ALIAS = 'hydratedOptionGroup';

/** The prefix that keeps `SwOptionGroup`'s columns from colliding with `SwOption`'s. */
const HYDRATION_GROUP_PREFIX = 'optionGroup_';

/** The alias under which the link table's `skuID` is returned. */
const HYDRATION_KEY_COLUMN = 'hydrationOwnerSkuID';

/**
 * A single positional placeholder. Values only — `?` cannot substitute an identifier (TR-4, AAP §0.7.3).
 */
const BIND_PLACEHOLDER = '?';

/** The separator between placeholders in an `IN` list. Structure, never bound. */
const CLAUSE_JOINER = ', ';

/**
 * The `SwProduct` columns the nested membership subquery reads — `model/entity/Product.cfc:L52`, `:L69`.
 */
const PRODUCT_COLUMN = Object.freeze({
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  productTypeID: assertColumnName(PRODUCT_TABLE, 'productTypeID'),
});

/*
 * Cross-domain physical identifiers, every one validated through the same registry the in-scope names
 * use, so the service's whole schema surface is enumerable from one place and no table identifier
 * reaches statement text through an ungated literal.
 */

/** Tables reached only to answer a question about SKUs, never to project a column of their own. */
const OUT_OF_SCOPE_TABLE = Object.freeze({
  /**
   * `model/entity/AlternateSkuCode.cfc:L49` — reached by the SKU-code fallback at `model/dao/SkuDAO.cfc:L103`.
   */
  alternateSkuCode: assertRegisteredTableName('SwAlternateSkuCode'),
  /**
   * `model/entity/Sku.cfc:L77` `linktable="SwSkuAccessContent"` — the contentAccess fetch branch, `model/dao/SkuDAO.cfc:L155`.
   */
  skuAccessContent: assertRegisteredTableName('SwSkuAccessContent'),
  /**
   * `model/entity/Sku.cfc:L78` `linktable="SwSkuSubsBenefit"` — the subscription fetch branch, `model/dao/SkuDAO.cfc:L160`.
   */
  skuSubscriptionBenefit: assertRegisteredTableName('SwSkuSubsBenefit'),
  /**
   * `model/entity/SubscriptionTerm.cfc` — the non-fetching join of the subscription branch, `model/dao/SkuDAO.cfc:L159`.
   */
  subscriptionTerm: assertRegisteredTableName('SwSubscriptionTerm'),
  /**
   * `model/entity/Stock.cfc:L49` — the mediating table eight of the ten existence tests traverse.
   */
  stock: assertRegisteredTableName('SwStock'),
  /** `model/entity/OrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L66`. */
  orderItem: assertRegisteredTableName('SwOrderItem'),
  /** `model/entity/Inventory.cfc:L49` — `model/dao/SkuDAO.cfc:L68`. */
  inventory: assertRegisteredTableName('SwInventory'),
  /** `model/entity/OrderDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L70`. */
  orderDeliveryItem: assertRegisteredTableName('SwOrderDeliveryItem'),
  /** `model/entity/PhysicalCountItem.cfc:L49` — `model/dao/SkuDAO.cfc:L72`. */
  physicalCountItem: assertRegisteredTableName('SwPhysicalCountItem'),
  /** `model/entity/StockAdjustmentDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L74`. */
  stockAdjustmentDeliveryItem: assertRegisteredTableName('SwStockAdjustmentDeliveryItem'),
  /**
   * `model/entity/StockAdjustmentItem.cfc:L49` — reached twice, `model/dao/SkuDAO.cfc:L76` and `:L78`.
   */
  stockAdjustmentItem: assertRegisteredTableName('SwStockAdjustmentItem'),
  /** `model/entity/StockHold.cfc:L49` — `model/dao/SkuDAO.cfc:L80`. */
  stockHold: assertRegisteredTableName('SwStockHold'),
  /** `model/entity/StockReceiverItem.cfc:L49` — `model/dao/SkuDAO.cfc:L82`. */
  stockReceiverItem: assertRegisteredTableName('SwStockReceiverItem'),
  /** `model/entity/VendorOrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L84`. */
  vendorOrderItem: assertRegisteredTableName('SwVendorOrderItem'),
});

/**
 * Foreign-key and primary-key columns on the out-of-scope tables above, each read from the
 * `fkcolumn` attribute of the declaration cited.
 */
const OUT_OF_SCOPE_COLUMN = Object.freeze({
  /** `model/entity/AlternateSkuCode.cfc:L53` — the code itself. */
  alternateSkuCode: assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.alternateSkuCode,
    'alternateSkuCode',
  ),
  /**
   * `model/entity/AlternateSkuCode.cfc:L57`, `model/entity/Sku.cfc:L77` (`SwSkuAccessContent`) and
   * `:L78` (`SwSkuSubsBenefit`) — all keyed by SKU, all declaring `fkcolumn="skuID"`.
   */
  skuID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.alternateSkuCode, 'skuID'),
  /** `model/entity/Stock.cfc` primary key, and the target of every mediated join below. */
  stockID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.stock, 'stockID'),
  /** `model/entity/StockAdjustmentItem.cfc:L57` `fkcolumn="fromStockID"`. */
  fromStockID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.stockAdjustmentItem, 'fromStockID'),
  /** `model/entity/StockAdjustmentItem.cfc:L58` `fkcolumn="toStockID"`. */
  toStockID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.stockAdjustmentItem, 'toStockID'),
  /**
   * `model/entity/Sku.cfc:L66` and `model/entity/SubscriptionTerm.cfc` — the term key on both sides.
   */
  subscriptionTermID: assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.subscriptionTerm,
    'subscriptionTermID',
  ),
});

/* Injected seams (AAP §0.7.3, AAP §0.7.3) */

/**
 * The statement-execution surface this adapter needs: the read-plus-write pair, under a local name.
 */
export type SkuStatementExecutor = SqlMutationExecutor;

/** The request-scoped holder for the memoized option-group sort order. */
export interface OptionGroupSortOrderMemo {
  /** The memoized value, or `undefined` while the memo is unset. */
  value: number | undefined;
}

/** Create an empty request-scoped memo holder. */
export function createOptionGroupSortOrderMemo(): OptionGroupSortOrderMemo {
  return { value: undefined };
}

/** The root-product-type resolver `product.getBaseProductType()` requires. */
export type MySqlSkuRepositoryProductTypeRootResolver = Parameters<
  Product['getBaseProductType']
>[0];

/** The one object that satisfies both entity-level transaction-existence contracts. */
export type TransactionExistenceChecker = SkuTransactionExistenceChecker &
  ProductTransactionExistenceChecker;

/**
 * Adapt {@link SkuRepository.transactionExists} to the caller-ordered checker the two entities take.
 *
 * @param repository - Narrowed to the single member used, so a test double or any other
 * {@link skuRepository} implementation can be adapted without depending on this file's MySQL parts.
 *
 * @returns a checker both `Sku.getTransactionExistsFlag` and `Product.getTransactionExistsFlag` accept.
 */
export function createTransactionExistenceChecker(
  repository: Pick<SkuRepository, 'transactionExists'>,
): TransactionExistenceChecker {
  return {
    argumentOrder: 'skuID-first-productID-second',
    /*
     * The crossing: caller slot 1 (`skuID`) becomes DAO slot 2, caller slot 2 (`productID`) becomes
     * DAO slot 1. Reading this line as `transactionExists(skuID, productID)` is the mistake it exists
     * to prevent.
     */
    getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> =>
      repository.transactionExists(productID, skuID),
  };
}

/*
 * Guarded scalar reads (AAP §0.7.3)
 * `rowMappers.ts` exports row mappers but keeps its scalar readers private, so the few scalar reads
 * below are guarded locally. Under `noUncheckedIndexedAccess` every indexed read is `T | undefined`
 * and every property of an untyped row is `unknown`, which is exactly the class of bug the legacy
 * left unguarded at `model/dao/SkuDAO.cfc:L93-L95`. The strict setting is not relaxed to make any of
 * this compile; the reads are narrowed instead.
 */

/**
 * Read a required identifier column from a driver row.
 *
 */
function readRequiredIdentifier(row: MySqlRow, column: string, statement: string): string {
  const raw: unknown = row[column];
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  throw new DataIntegrityError(
    `The ${statement} statement returned a row whose ${column} column is not a usable identifier.`,
    { context: { column, statement, received: raw } },
  );
}

/**
 * Read a required whole-number column from a driver row.
 *
 */
function readOptionalNumber(row: MySqlRow, column: string, statement: string): number | undefined {
  const raw: unknown = row[column];
  if (raw === null || raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (raw.trim().length > 0 && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new DataIntegrityError(
    `The ${statement} statement returned a non-numeric ${column} column.`,
    { context: { column, statement, received: raw } },
  );
}

/**
 * The alias every statement below gives the `SwSku` root, and the alias each correlated existence
 * test gives its own table.
 */
const SKU_ALIAS = 's';
const ITEM_ALIAS = 'a';
const STOCK_ALIAS = 'st';

/*
 * Why the two builders below re-validate their column arguments.
 *
 * `../mysql/QueryRunner.ts`'s column gate answers a pairing question, not a spelling one: it validates a
 * name against the table that declares it, because `skuID` and `stockID` are each declared on several of
 * the registered tables, so a mis-paired name is still a real column and still composes SQL that parses
 * and simply answers the wrong question. `OUT_OF_SCOPE_COLUMN` above resolves each name once, against
 * whichever table it cites — `skuID` against `SwAlternateSkuCode`, `stockID` against `SwStock` — and those
 * resolutions are correct for their own citations. What they cannot establish is that the *item* table a
 * clause is being applied to declares the foreign key the clause names on it, because that pairing is
 * chosen here, at the call site, and was previously never checked anywhere.
 *
 * That gap is what let the registry and the emitted statement disagree about `SwVendorOrderItem`: the
 * chain emitted `a.stockID` for it while the registry declared only `skuID`, and nothing in the port
 * objected — the disagreement surfaced as an `ER_BAD_FIELD_ERROR` from MySQL, on an environment
 * provisioned from the registry, in the delete guards that consult `transactionExists`. Re-validating each
 * item-side column against its own table closes that class outright: because the chain below is a
 * module-level constant, a disagreement of this shape now fails at composition, before a connection
 * exists, exactly as `assertRegisteredTableName` already fails for a table.
 *
 * The re-validation cannot change the emitted text. `assertRegisteredColumnName` answers the declared
 * spelling, every name passed in is already the declared spelling, and the clause templates are
 * untouched — so these two builders produce byte-identical SQL to the statement the checkpoint measured.
 */

/**
 * Build one correlated existence test that reaches a SKU directly through its own foreign key.
 *
 * @param table - the item table, already registry-validated.
 * @returns the `EXISTS(...)` fragment, with the SKU foreign key validated against `table` itself.
 * @throws {DomainError} when `table` does not declare a SKU foreign key — a composition-time refusal.
 */
function directSkuExistsClause(table: RegisteredTableName): string {
  const itemSkuForeignKey = assertRegisteredColumnName(table, OUT_OF_SCOPE_COLUMN.skuID);

  return (
    `EXISTS( SELECT 1 FROM ${table} ${ITEM_ALIAS} ` +
    `WHERE ${ITEM_ALIAS}.${itemSkuForeignKey} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} )`
  );
}

/**
 * Build one correlated existence test that reaches a SKU through a stock row.
 *
 * @param table - the item table, already registry-validated.
 * @param stockForeignKey - the column on `table` that references stock. Validated against `table`.
 * @returns the `EXISTS(...)` fragment, with all three of its columns validated against their own tables.
 * @throws {DomainError} when `table` does not declare `stockForeignKey` — a composition-time refusal.
 */
function stockMediatedSkuExistsClause(table: RegisteredTableName, stockForeignKey: string): string {
  /*
   * Validate the foreign key against the item table that owns it, not merely against `SwStock`.
   * This makes the whitelist enforce the relationship declared by each entity and prevents a real
   * stock column from masking a phantom item-table column. In particular,
   * `model/entity/VendorOrderItem.cfc:L60` declares `fkcolumn="stockID"` and no `skuID`.
   */
  const itemStockForeignKey = assertRegisteredColumnName(table, stockForeignKey);

  /*
   * The stock-side pair is validated against `SwStock` for the same reason, and the emitted text below
   * uses the validated names rather than the raw constants, so every identifier in this clause has been
   * checked against the table it is actually applied to.
   */
  const stockPrimaryKey = assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.stock,
    OUT_OF_SCOPE_COLUMN.stockID,
  );
  const stockSkuForeignKey = assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.stock,
    OUT_OF_SCOPE_COLUMN.skuID,
  );

  return (
    `EXISTS( SELECT 1 FROM ${table} ${ITEM_ALIAS} ` +
    `INNER JOIN ${OUT_OF_SCOPE_TABLE.stock} ${STOCK_ALIAS} ` +
    `ON ${STOCK_ALIAS}.${stockPrimaryKey} = ${ITEM_ALIAS}.${itemStockForeignKey} ` +
    `WHERE ${STOCK_ALIAS}.${stockSkuForeignKey} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} )`
  );
}

/** The ten existence tests of `model/dao/SkuDAO.cfc:L65-L85`, in legacy order, joined by `OR`. */
const TRANSACTION_EXISTS_CHAIN: string = [
  directSkuExistsClause(OUT_OF_SCOPE_TABLE.orderItem),
  stockMediatedSkuExistsClause(OUT_OF_SCOPE_TABLE.inventory, OUT_OF_SCOPE_COLUMN.stockID),
  stockMediatedSkuExistsClause(OUT_OF_SCOPE_TABLE.orderDeliveryItem, OUT_OF_SCOPE_COLUMN.stockID),
  stockMediatedSkuExistsClause(OUT_OF_SCOPE_TABLE.physicalCountItem, OUT_OF_SCOPE_COLUMN.stockID),
  stockMediatedSkuExistsClause(
    OUT_OF_SCOPE_TABLE.stockAdjustmentDeliveryItem,
    OUT_OF_SCOPE_COLUMN.stockID,
  ),
  stockMediatedSkuExistsClause(
    OUT_OF_SCOPE_TABLE.stockAdjustmentItem,
    OUT_OF_SCOPE_COLUMN.fromStockID,
  ),
  stockMediatedSkuExistsClause(
    OUT_OF_SCOPE_TABLE.stockAdjustmentItem,
    OUT_OF_SCOPE_COLUMN.toStockID,
  ),
  stockMediatedSkuExistsClause(OUT_OF_SCOPE_TABLE.stockHold, OUT_OF_SCOPE_COLUMN.stockID),
  stockMediatedSkuExistsClause(OUT_OF_SCOPE_TABLE.stockReceiverItem, OUT_OF_SCOPE_COLUMN.stockID),
  stockMediatedSkuExistsClause(OUT_OF_SCOPE_TABLE.vendorOrderItem, OUT_OF_SCOPE_COLUMN.stockID),
].join(' OR ');

/** The alias the existence chain's scalar verdict is projected under. */
const TRANSACTION_EXISTS_ALIAS = 'transactionExists';

/**
 * Composes the SKU-code search statement and its bound values — the whole of
 * `model/dao/SkuDAO.cfc:L130-L148` except the execution and the row mapping.
 *
 * @param term - the bare search fragment. Optional in the signature and read unguarded by the legacy.
 * @param productTypeID - comma-delimited product-type identifiers, despite the singular legacy name.
 * @returns the statement text and its bound values, in legacy positional order (TR-4).
 * @throws {DomainError} when the term is omitted, reproducing the `model/dao/SkuDAO.cfc:L133`
 * failure, or when a supplied product-type list yields no segments.
 */
function composeSkuSearch(
  term?: string,
  productTypeID?: string,
): { readonly sql: string; readonly params: unknown[] } {
  if (term === undefined) {
    throw new DomainError(
      'A SKU search requires a term; the legacy DAO reads it without a guard and fails when it is absent.',
      { context: { productTypeID } },
    );
  }

  let sql =
    `select ${SKU_COLUMN.skuID},${SKU_COLUMN.skuCode} from ${SKU_TABLE} ` +
    `where ${SKU_COLUMN.skuCode} like ?`;

  /* The wildcards belong to the value (`model/dao/SkuDAO.cfc:L133`), never to the statement. */
  const params: unknown[] = [`%${term}%`];

  /* Presence and non-blank-after-trim, exactly as `model/dao/SkuDAO.cfc:L134` tests it. */
  if (productTypeID !== undefined && productTypeID.trim() !== '') {
    /*
     * Platform list semantics: split on commas, drop empty segments, do not trim what remains.
     * One placeholder per surviving segment, each bound individually — a single comma-joined value
     * bound to one placeholder would be compared as one long string and match nothing.
     */
    const productTypeIDs = productTypeID.split(',').filter((segment) => segment !== '');
    if (productTypeIDs.length === 0) {
      throw new DomainError(
        'The product-type restriction contained no usable identifiers after list splitting.',
        { context: { productTypeID } },
      );
    }

    const placeholders = productTypeIDs.map(() => '?').join(',');
    sql +=
      ` and ${SKU_COLUMN.productID} in (select ${PRODUCT_COLUMN.productID} ` +
      `from ${PRODUCT_TABLE} where ${PRODUCT_COLUMN.productTypeID} in (${placeholders}))`;
    params.push(...productTypeIDs);
  }

  return { sql, params };
}

/** The `SwSku` columns every SKU-returning statement projects, qualified with the root alias. */
const SKU_PROJECTION: string = [
  SKU_COLUMN.skuID,
  SKU_COLUMN.activeFlag,
  SKU_COLUMN.skuCode,
  SKU_COLUMN.listPrice,
  SKU_COLUMN.price,
  SKU_COLUMN.renewalPrice,
  SKU_COLUMN.imageFile,
  SKU_COLUMN.userDefinedPriceFlag,
  SKU_COLUMN.calculatedQATS,
  SKU_COLUMN.productID,
  SKU_COLUMN.subscriptionTermID,
  SKU_COLUMN.remoteID,
  SKU_COLUMN.createdDateTime,
  SKU_COLUMN.createdByAccountID,
  SKU_COLUMN.modifiedDateTime,
  SKU_COLUMN.modifiedByAccountID,
]
  .map((column) => `${SKU_ALIAS}.${column}`)
  .join(', ');

/** The predicate that keeps option-less SKUs out of the option resolver's results. */
const OPTION_BEARING_GUARD =
  `EXISTS( SELECT 1 FROM ${SKU_OPTION_TABLE} sob ` +
  `WHERE sob.${SKU_OPTION_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} )`;

/** One correlated existence test asserting that a SKU carries one particular option. */
const OPTION_MATCH_CLAUSE =
  `EXISTS( SELECT 1 FROM ${SKU_OPTION_TABLE} so ` +
  `WHERE so.${SKU_OPTION_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} ` +
  `AND so.${SKU_OPTION_COLUMN.optionID} = ? )`;

/* The repository. */

/** MySQL implementation of {@link skuRepository}, ported from `model/dao/SkuDAO.cfc`. */
export class MySqlSkuRepository implements SkuRepository {
  /**
   * @param executor - the transaction-scoped statement executor. Replaces the framework's implicit
   * session: reads and writes share it so validation observes uncommitted siblings (M6).
   *
   * @param optionGroupSortOrderMemo - the request-scoped memo holder (M7). Supplied per invocation
   * by the composition root; this class never creates one and never caches at module scope.
   *
   * @param productTypeRootResolver - resolves a product type to its seeded root discriminator, which
   * {@link MySqlSkuRepository.findByProduct} branches on.
   */
  /**
   * @param executor - Issues every statement this adapter composes.
   * @param optionGroupSortOrderMemo - The request-scoped sort-order memo, per M7.
   * @param productTypeRootResolver - Walks a product type to its root, for the base-type discriminator.
   * @param accountContext - Supplies the acting account for the audit columns a write stamps.
   * @param statementComplexityBudget - The operator-stated ceiling on how complex one composed
   * statement may be. Required rather than optional, and injected rather than read from the
   * environment here, because exactly one member of this class composes a statement whose shape the
   * caller controls — {@link MySqlSkuRepository.findSkusBySelectedOptions} — and an adapter that could
   * be constructed without the ceiling would be an adapter that could serve that member unbounded.
   */
  public constructor(
    private readonly executor: SkuStatementExecutor,
    private readonly optionGroupSortOrderMemo: OptionGroupSortOrderMemo,
    private readonly productTypeRootResolver: MySqlSkuRepositoryProductTypeRootResolver,
    private readonly accountContext: AccountContextPort,
    private readonly statementComplexityBudget: StatementComplexityBudget,
  ) {}

  /**
   * Returns an equivalent {@link MySqlSkuRepository} bound to a different statement executor.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns a new instance identical in every other respect.
   */
  public withExecutor(executor: SkuStatementExecutor): MySqlSkuRepository {
    /*
     * The memo travels across the re-binding rather than being re-created. It is request-scoped (M7) and
     * a transaction sits inside a request, so a boundary that started its own memo would re-read a sort
     * order the same invocation had already resolved — and `model/dao/SkuDAO.cfc:L204-L220` memoises
     * exactly to avoid that. The product-type root resolver is stateless and travels for the same reason
     * the executor does not: nothing about it is connection-bound.
     *
     * The complexity budget travels for that reason too, and it has to: a re-binding that dropped it
     * would produce an instance that could not be constructed at all under `strict`, which is the
     * property that makes "the bound cannot be lost on the transaction path" a compile-time fact
     * rather than a review note.
     */
    return new MySqlSkuRepository(
      executor,
      this.optionGroupSortOrderMemo,
      this.productTypeRootResolver,
      this.accountContext,
      this.statementComplexityBudget,
    );
  }

  /**
   * Does any transaction anywhere in the system reference this SKU, or any SKU of this product?
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L93-L95` — the legacy reads its scalar row unguarded. It
   * indexes the first element of the result and compares it to zero without checking that a row came
   * back or that the value is numeric. A single-row scalar select does return one row, so the read
   * happens to be safe; it is unguarded all the same. This port guards it, because
   * `noUncheckedIndexedAccess` types the read as possibly absent and the honest response to that is a
   * narrowing check, not a non-null assertion. The behaviour on the normal path is identical.
   *
   * @param productID - the product whose SKUs are tested. Used only when no SKU identifier is given.
   * @param skuID - the SKU tested. Takes precedence whenever it is supplied.
   */
  public async transactionExists(productID?: string, skuID?: string): Promise<boolean> {
    /*
     * The legacy tests presence and non-nullness [`model/dao/SkuDAO.cfc:L59`, `:L87`]. Under strict
     * TypeScript an optional parameter has exactly one absent form, so the two-part test collapses
     * into one check with no loss of meaning. The precedence order is preserved exactly: the SKU
     * identifier wins whenever it is present, and the product identifier is the alternative branch.
     */
    const identifier: string | undefined = skuID !== undefined ? skuID : productID;
    if (identifier === undefined) {
      throw new DomainError(
        'A transaction-existence check requires either a SKU identifier or a product identifier.',
        { context: { productID, skuID } },
      );
    }

    /*
     * `ss.product.productID` [`model/dao/SkuDAO.cfc:L62`] navigates the many-to-one association and
     * then reads the far side's key. For a many-to-one that key is the near side's foreign key
     * column, so the product predicate resolves to `SwSku.productID`
     * [`model/entity/Sku.cfc:L65`] and needs no join.
     */
    const rootPredicate =
      skuID !== undefined
        ? `${SKU_ALIAS}.${SKU_COLUMN.skuID} = ?`
        : `${SKU_ALIAS}.${SKU_COLUMN.productID} = ?`;

    /*
     * A scalar existence verdict where the legacy counted every match. Structural, and provably
     * answer-preserving from the legacy body rather than by argument. `model/dao/SkuDAO.cfc:L57`
     */
    const sql =
      `SELECT EXISTS( SELECT 1 FROM ${SKU_TABLE} ${SKU_ALIAS} ` +
      `WHERE ${rootPredicate} AND ( ${TRANSACTION_EXISTS_CHAIN} ) ) AS ${TRANSACTION_EXISTS_ALIAS}`;

    const rows = await this.executor.execute(sql, [identifier]);
    const verdictRow = rows[0];
    if (verdictRow === undefined) {
      throw new DataIntegrityError(
        'The transaction-existence probe returned no row, so its verdict cannot be read.',
        { context: { productID, skuID } },
      );
    }

    const transactionExistsFlag = readOptionalNumber(
      verdictRow,
      TRANSACTION_EXISTS_ALIAS,
      'transaction-existence',
    );
    if (transactionExistsFlag === undefined) {
      throw new DataIntegrityError(
        'The transaction-existence probe returned a null verdict, which cannot be interpreted.',
        { context: { productID, skuID } },
      );
    }

    /*
     * `model/dao/SkuDAO.cfc:L93-L97`: zero is false, anything else is true. Kept in that direction
     * rather than rewritten as `=== 1`, so the behaviour on any unexpected value is the legacy's.
     */
    return transactionExistsFlag !== 0;
  }

  /**
   * Resolve a SKU from either its own code or one of its alternate codes.
   *
   * @param skuCode - the code to resolve. Required at the DAO level [`model/dao/SkuDAO.cfc:L102`].
   */
  public async findBySkuCode(skuCode: string): Promise<Sku | null> {
    const sql =
      `SELECT ${SKU_PROJECTION} FROM ${SKU_TABLE} ${SKU_ALIAS} ` +
      `LEFT JOIN ${OUT_OF_SCOPE_TABLE.alternateSkuCode} alt ` +
      `ON alt.${OUT_OF_SCOPE_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} ` +
      `WHERE ${SKU_ALIAS}.${SKU_COLUMN.skuCode} = ? ` +
      `OR alt.${OUT_OF_SCOPE_COLUMN.alternateSkuCode} = ?`;

    /* Two placeholders, one value, bound in the order the placeholders appear (point 1 above). */
    const rows = await this.executor.execute(sql, [skuCode, skuCode]);

    if (rows.length > 1) {
      throw new DataIntegrityError(
        'More than one SKU matched the requested code, so no single SKU can be returned.',
        { context: { skuCode, matchedRowCount: rows.length } },
      );
    }

    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const sku = mapSkuRow(row);
    await this.hydrateSkuOptions([sku]);
    return sku;
  }

  /**
   * Return the SKUs of a product that carry every one of the supplied options.
   *
   * TODO(parity) `model/entity/Sku.cfc:L756-L769` — D19, a consequence of T5 that is not repaired.
   * A SKU carrying no options resolves an empty option list, so by T5 this returns every
   * option-bearing SKU of the product. The rule's guard then passes only when that set is empty or is
   * the SKU itself — and an option-less SKU is never in an option-bearing set — so an option-less
   * default SKU on a product that already has option-bearing SKUs fails its uniqueness rule. Carried
   * as observed behaviour.
   *
   * @param optionIds - the selected option identifiers, in caller order, duplicates preserved. An
   * empty array is valid and meaningful (T5).
   *
   * @param productId - the product to restrict to. Required (T2).
   */
  public async findSkusBySelectedOptions(
    optionIds: string[],
    productId: string,
  ): Promise<SkuRow[]> {
    /*
     * The work bound, applied BEFORE anything is composed (CWE-400 / CWE-770 / CWE-1284).
     *
     * This is the one member of this class whose statement SHAPE the caller controls: T1 requires one
     * correlated `EXISTS` per element of `optionIds`, duplicates included, so a caller who sends N
     * identifiers gets N subqueries, N placeholders and N sources. The counts below are the same three
     * the smart list counts, derived arithmetically from `optionIds.length` rather than by measuring
     * assembled text, which is what lets the refusal precede assembly entirely:
     *
     *   bound parameters = N option identifiers + the one product identifier   (T2 always emits it)
     *   sources          = the base `SwSku` + the option-bearing guard subquery + N match subqueries
     *   ordering terms   = none; this statement carries no `ORDER BY`
     *
     * so the account is `2N + 3` units, and the effective ceiling on N is `(bound - 3) / 2`.
     *
     * No ROW ceiling is applied here, and that omission is deliberate rather than an oversight. The
     * result cardinality of this statement is fixed by how many SKUs the product has in stored data —
     * the caller cannot amplify it — and this member is reached from `Sku.hasUniqueOptions()`
     * [`model/entity/Sku.cfc:L756-L769`] and from `Product.getSkuBySelectedOptions()`
     * [`model/entity/Product.cfc:L349-L364`], both of which run during a save. A row ceiling would
     * therefore make a product with more SKUs than the figure unsaveable, which is a functional
     * regression rather than a bound. Only the list length is caller-amplifiable, and only the list
     * length is bounded.
     */
    assertStatementComplexityWithinBudget(this.statementComplexityBudget, {
      statement: 'findSkusBySelectedOptions',
      boundParameters: optionIds.length + 1,
      sources: optionIds.length + 2,
      orderingTerms: 0,
      listLength: optionIds.length,
    });

    /*
     * The legacy seeds its predicate with a tautology [`model/dao/SkuDAO.cfc:L111`] so that every
     * subsequent fragment can be appended with a leading conjunction. That is a string-builder
     * convenience with no effect on the result, so it is replaced by joining the predicates — the
     * one place in this method where idiom is allowed to change (AAP §0.8.1).
     */
    const predicates: string[] = [OPTION_BEARING_GUARD];

    /*
     * T1: one test per element, in order, duplicates included. Mapped over the array rather than
     * over a set of it, and mapped over the array itself rather than over its distinct values, so
     * that a repeated identifier yields a repeated test and a repeated placeholder.
     */
    predicates.push(...optionIds.map(() => OPTION_MATCH_CLAUSE));

    /* T2: always emitted. */
    predicates.push(`${SKU_ALIAS}.${SKU_COLUMN.productID} = ?`);

    /* T4: DISTINCT is mandatory — the option link fans out one row per SKU-option pair. */
    const sql =
      `SELECT DISTINCT ${SKU_PROJECTION} FROM ${SKU_TABLE} ${SKU_ALIAS} ` +
      `WHERE ${predicates.join(' AND ')}`;

    /* TR-4: option identifiers in list order, then the product identifier. */
    const params: unknown[] = [...optionIds, productId];

    const rows = await this.executor.execute(sql, params);
    return mapRows(rows, mapSkuRow);
  }

  /**
   * Find SKUs whose code contains a search term, optionally restricted to a set of product types.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L132` and `model/dao/SkuDAO.cfc:L135` put
   * mapping-layer entity names inside a native statement. These two lines are the only such sites in
   * the component; thirty lines further on, `model/dao/SkuDAO.cfc:L179-L211` uses physical table names
   * in an equally native statement. One file, two conventions. The conclusion is carried verbatim:
   * Never "fix" HQL entity names to `Sw*`, and never assume a logical name works in native SQL. This
   * method is where that bites hardest, and it resolves the physical tables through the whitelist —
   * `SwSku` and `SwProduct` — rather than by stripping a prefix off the legacy text.
   *
   * @param term - the substring to search for. Optional in the signature; omitting it raises.
   * @param productTypeID - a comma-separated list of product-type identifiers. Genuinely optional;
   * Absent, blank or whitespace-only values leave the restriction off.
   *
   */
  public async searchByProductType(term?: string, productTypeID?: string): Promise<SkuSearchRow[]> {
    const { sql, params } = composeSkuSearch(term, productTypeID);

    const rows = await this.executor.execute(sql, params);
    return mapRows(rows, mapSkuSearchRow);
  }

  /**
   * Return a product's SKUs, optionally restricted to those that carry the structure its base
   * product type expects.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L153` — D9: the flag is read unscoped. The legacy reads the
   * bare name rather than the argument, which resolves through the scope chain and would silently pick
   * up a same-named component variable if one existed. Nothing shadows it today, so the behaviour is
   * unchanged; the defect is recorded and not repaired.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L163` — D9: the statement variable is re-declared mid-body.
   * The trailing clause is appended with a second declaration of a name already declared at `:L152`,
   * which is a no-op on this engine and would be a redeclaration error on a stricter one. Carried as a
   * note; the concatenation it performs is preserved.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L152-L163` — no DISTINCT projection, so the result fans out.
   * With the flag raised, a merchandise SKU carrying three options appears three times, and a
   * subscription SKU with two benefits twice. Contrast `:L109`, which does project distinctly. The
   * duplication is passed through unchanged in the array cardinality, because callers observe the
   * length. Rows carrying the same `skuID` nevertheless resolve to the same object, reproducing the
   * identity map Hibernate applied before it returned that repeated reference. This annotation mints
   * no register identifier.
   *
   * @param product - the product whose SKUs are wanted
   * @param fetchOptions - when `true`, restrict to SKUs carrying the structure the base product type
   * expects. Required (Discrepancy 5).
   *
   */
  public async findByProduct(product: Product, fetchOptions: boolean): Promise<Sku[]> {
    let sql = `SELECT ${SKU_PROJECTION} FROM ${SKU_TABLE} ${SKU_ALIAS} `;

    /* Retained beyond the branch below so the eager fetch can reuse it without resolving twice. */
    let baseProductType: string | undefined;

    if (fetchOptions) {
      /*
       * Resolved inside the branch, as the legacy does [`model/dao/SkuDAO.cfc:L154`]: with the flag
       * lowered the base product type is never asked for, so the resolver is never consulted.
       */
      baseProductType = await product.getBaseProductType(this.productTypeRootResolver);

      /*
       * The legacy chain at [`model/dao/SkuDAO.cfc:L154-L161`] compares with CFML `==`, which folds
       * case, so a `SwProductType` row holding `Merchandise` did receive the option join. `===` against
       * the seeded spelling silently added no join at all and returned every SKU of the product — the
       * unrecognised-code outcome — which is the same shape of failure as T3. Recognition therefore goes
       * through `resolveBaseProductType`, which answers with the canonical code so the three arms below
       * stay literal comparisons. The observed value is neither modified nor written back.
       */
      const recognisedBaseProductType = resolveBaseProductType(baseProductType);

      if (
        recognisedBaseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode
      ) {
        sql +=
          `INNER JOIN ${OUT_OF_SCOPE_TABLE.skuAccessContent} sac ` +
          `ON sac.${OUT_OF_SCOPE_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} `;
      } else if (
        recognisedBaseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode
      ) {
        sql +=
          `INNER JOIN ${SKU_OPTION_TABLE} so ` +
          `ON so.${SKU_OPTION_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} `;
      } else if (
        recognisedBaseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode
      ) {
        /* Two joins, in legacy order: the term first [`:L159`], then the benefits [`:L160`]. */
        sql +=
          `INNER JOIN ${OUT_OF_SCOPE_TABLE.subscriptionTerm} stm ` +
          `ON stm.${OUT_OF_SCOPE_COLUMN.subscriptionTermID} = ` +
          `${SKU_ALIAS}.${SKU_COLUMN.subscriptionTermID} `;
        sql +=
          `INNER JOIN ${OUT_OF_SCOPE_TABLE.skuSubscriptionBenefit} ssb ` +
          `ON ssb.${OUT_OF_SCOPE_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} `;
      }
    }

    sql += `WHERE ${SKU_ALIAS}.${SKU_COLUMN.productID} = ?`;

    const rows = await this.executor.execute(sql, [product.productID]);
    const mappedSkus = mapRows(rows, mapSkuRow);
    const skusByID = new Map<string, Sku>();
    const skus = mappedSkus.map((sku) => {
      const existing = skusByID.get(sku.skuID);
      if (existing !== undefined) {
        return existing;
      }

      skusByID.set(sku.skuID, sku);
      return sku;
    });

    /* The `fetch` half of `inner join fetch`, which the joins above are only the first half of. */
    if (fetchOptions) {
      await attachFetchedSkuAssociations(this.executor, skus, baseProductType);
    }

    return skus;
  }

  /**
   * Fill the `options` collection of every supplied SKU, and the `optionGroup` of every option
   * loaded, from `SwSkuOption` -> `SwOption` -> `SwOptionGroup`.
   *
   * @param skus - The SKUs to fill. A SKU with no link rows keeps its empty collection, which is the
   * correct load for an option-less default SKU rather than an error.
   */
  private async hydrateSkuOptions(skus: readonly Sku[]): Promise<void> {
    const skuIDs: string[] = [];
    const skusByID = new Map<string, Set<Sku>>();
    for (const sku of skus) {
      const skuID = sku.skuID;
      if (skuID === SKU_UNSAVED_ID_VALUE || skuID === '') {
        continue;
      }
      const existing = skusByID.get(skuID);
      if (existing === undefined) {
        skusByID.set(skuID, new Set([sku]));
        skuIDs.push(skuID);
      } else {
        existing.add(sku);
      }
    }
    if (skuIDs.length === 0) {
      return;
    }

    const optionColumns = [
      SKU_OPTION_HYDRATION_COLUMN.optionID,
      SKU_OPTION_HYDRATION_COLUMN.optionCode,
      SKU_OPTION_HYDRATION_COLUMN.optionName,
      SKU_OPTION_HYDRATION_COLUMN.optionDescription,
      SKU_OPTION_HYDRATION_COLUMN.sortOrder,
      SKU_OPTION_HYDRATION_COLUMN.optionGroupID,
      SKU_OPTION_HYDRATION_COLUMN.remoteID,
      SKU_OPTION_HYDRATION_COLUMN.createdDateTime,
      SKU_OPTION_HYDRATION_COLUMN.createdByAccountID,
      SKU_OPTION_HYDRATION_COLUMN.modifiedDateTime,
      SKU_OPTION_HYDRATION_COLUMN.modifiedByAccountID,
    ];
    const groupColumns = [
      SKU_OPTION_HYDRATION_COLUMN.optionGroupName,
      SKU_OPTION_HYDRATION_COLUMN.optionGroupCode,
      SKU_OPTION_HYDRATION_COLUMN.optionGroupDescription,
      SKU_OPTION_HYDRATION_COLUMN.imageGroupFlag,
      SKU_OPTION_HYDRATION_COLUMN.sortOrder,
      SKU_OPTION_HYDRATION_COLUMN.remoteID,
      SKU_OPTION_HYDRATION_COLUMN.createdDateTime,
      SKU_OPTION_HYDRATION_COLUMN.createdByAccountID,
      SKU_OPTION_HYDRATION_COLUMN.modifiedDateTime,
      SKU_OPTION_HYDRATION_COLUMN.modifiedByAccountID,
    ];

    const projection = [
      `${HYDRATION_LINK_ALIAS}.${SKU_OPTION_COLUMN.skuID} AS ${HYDRATION_KEY_COLUMN}`,
      ...optionColumns.map((column) => `${HYDRATION_OPTION_ALIAS}.${column}`),
      `${HYDRATION_GROUP_ALIAS}.${SKU_OPTION_HYDRATION_COLUMN.optionGroupID} ` +
        `AS ${HYDRATION_GROUP_PREFIX}${SKU_OPTION_HYDRATION_COLUMN.optionGroupID}`,
      ...groupColumns.map(
        (column) => `${HYDRATION_GROUP_ALIAS}.${column} AS ${HYDRATION_GROUP_PREFIX}${column}`,
      ),
    ].join(', ');

    const placeholders = skuIDs.map(() => BIND_PLACEHOLDER).join(CLAUSE_JOINER);
    const sql =
      `SELECT ${projection} ` +
      `FROM ${SKU_OPTION_TABLE} ${HYDRATION_LINK_ALIAS} ` +
      `INNER JOIN ${OPTION_TABLE} ${HYDRATION_OPTION_ALIAS} ` +
      `ON ${HYDRATION_OPTION_ALIAS}.${SKU_OPTION_HYDRATION_COLUMN.optionID} ` +
      `= ${HYDRATION_LINK_ALIAS}.${SKU_OPTION_COLUMN.optionID} ` +
      `LEFT JOIN ${OPTION_GROUP_TABLE} ${HYDRATION_GROUP_ALIAS} ` +
      `ON ${HYDRATION_GROUP_ALIAS}.${SKU_OPTION_HYDRATION_COLUMN.optionGroupID} ` +
      `= ${HYDRATION_OPTION_ALIAS}.${SKU_OPTION_HYDRATION_COLUMN.optionGroupID} ` +
      `WHERE ${HYDRATION_LINK_ALIAS}.${SKU_OPTION_COLUMN.skuID} IN (${placeholders}) ` +
      `ORDER BY ${HYDRATION_LINK_ALIAS}.${SKU_OPTION_COLUMN.skuID}, ` +
      `${HYDRATION_LINK_ALIAS}.${SKU_OPTION_COLUMN.optionID}`;

    const rows = await this.executor.execute(sql, skuIDs);

    const optionsByID = new Map<string, Option>();
    const groupsByID = new Map<string, OptionGroup>();

    for (const row of rows) {
      const ownerKey = row[HYDRATION_KEY_COLUMN];
      if (typeof ownerKey !== 'string') {
        throw new DataIntegrityError(
          `Option hydration returned a link row whose ${HYDRATION_KEY_COLUMN} is not a string.`,
        );
      }
      const owners = skusByID.get(ownerKey);
      if (owners === undefined) {
        throw new DataIntegrityError(
          `Option hydration returned a link row for SKU ${ownerKey}, which was not requested.`,
        );
      }

      const optionRow: MySqlRow = {};
      for (const column of optionColumns) {
        optionRow[column] = row[column];
      }
      const optionKey = optionRow[SKU_OPTION_HYDRATION_COLUMN.optionID];
      if (typeof optionKey !== 'string') {
        throw new DataIntegrityError(
          'Option hydration returned an option row without a string identifier.',
        );
      }

      let option = optionsByID.get(optionKey);
      if (option === undefined) {
        option = mapOptionRow(optionRow);
        optionsByID.set(optionKey, option);

        const groupKey =
          row[`${HYDRATION_GROUP_PREFIX}${SKU_OPTION_HYDRATION_COLUMN.optionGroupID}`];
        if (typeof groupKey === 'string') {
          let group = groupsByID.get(groupKey);
          if (group === undefined) {
            const groupRow: MySqlRow = {
              [SKU_OPTION_HYDRATION_COLUMN.optionGroupID]: groupKey,
            };
            for (const column of groupColumns) {
              groupRow[column] = row[`${HYDRATION_GROUP_PREFIX}${column}`];
            }
            group = mapOptionGroupRow(groupRow);
            groupsByID.set(groupKey, group);
          }
          option.optionGroup = group;
        }
      }

      for (const owner of owners) {
        owner.options.push(option);
      }
    }

    /*
     * A successful read establishes the complete option collection even when the link table returned
     * no row. Mark every distinct saved SKU that participated in the query, not merely the owners that
     * appeared in `rows`, so clearing the last option remains distinguishable from never loading any.
     */
    for (const owners of skusByID.values()) {
      for (const owner of owners) {
        markSkuOwnedLinkLoaded(owner, 'options');
      }
    }
  }

  /**
   * Return a product's option-bearing SKU identifiers, ordered by their option selection.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L177` — the literal source TODO, carried verbatim:
   *
   * TODO: test to see if this query works with DB's other than MSSQL and MySQL
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L179-L188` — this query returns option-bearing SKUs only, and
   * that is the root cause of D13. Three INNER joins carry the SKU through the link table, the option
   * and the option group, so a SKU with no options cannot appear. The two service members that consume
   * this result — `model/service/SkuService.cfc:L223-L232` and `:L252-L262` — search the sorted
   * identifiers for each SKU they hold and index the result of that search without checking it, so for
   * any SKU missing from this list the search yields nothing and the indexed write fails. The defect
   * is annotated in the service, where the unguarded index lives; the cause is here, and it is not
   * repaired.
   *
   * TODO(parity) `model/entity/Option.cfc:L56` and `model/entity/OptionGroup.cfc:L58` — nullable, A
   * Latent NULL hazard, flagged and deliberately not fixed. The option's sort order carries no
   * required constraint while the option group's is required — yet the option's is the multiplicand of
   * the ordering sum. In MySQL one null multiplicand makes that SKU's entire sum null, and the SKU then
   * sorts unpredictably relative to the rest. No null-coalescing wrapper and no null-excluding
   * predicate is added: either would change which rows come back or in what order, and AAP §0.7.3
   * requires the hazard be recorded rather than repaired.
   *
   */
  public async findSortedSkuIdsByProduct(productID: string): Promise<string[]> {
    const nextOptionGroupSortOrder = await this.resolveNextOptionGroupSortOrder();

    const sql =
      `SELECT ${SKU_TABLE}.${SKU_COLUMN.skuID} ` +
      `FROM ${SKU_TABLE} ` +
      `INNER JOIN ${SKU_OPTION_TABLE} ` +
      `ON ${SKU_TABLE}.${SKU_COLUMN.skuID} = ${SKU_OPTION_TABLE}.${SKU_OPTION_COLUMN.skuID} ` +
      `INNER JOIN ${OPTION_TABLE} ` +
      `ON ${SKU_OPTION_TABLE}.${SKU_OPTION_COLUMN.optionID} = ` +
      `${OPTION_TABLE}.${OPTION_COLUMN.optionID} ` +
      `INNER JOIN ${OPTION_GROUP_TABLE} ` +
      `ON ${OPTION_TABLE}.${OPTION_COLUMN.optionGroupID} = ` +
      `${OPTION_GROUP_TABLE}.${OPTION_GROUP_COLUMN.optionGroupID} ` +
      `WHERE ${SKU_TABLE}.${SKU_COLUMN.productID} = ? ` +
      `GROUP BY ${SKU_TABLE}.${SKU_COLUMN.skuID} ` +
      `ORDER BY SUM(${OPTION_TABLE}.${OPTION_COLUMN.sortOrder} * ` +
      `POWER(10, ? - ${OPTION_GROUP_TABLE}.${OPTION_GROUP_COLUMN.sortOrder})) ASC`;

    /*
     * Placeholder order follows the statement text: the product identifier in the predicate first
     * [`model/dao/SkuDAO.cfc:L190`], then the memoized term in the ordering expression [`:L197`].
     */
    const rows = await this.executor.execute(sql, [productID, nextOptionGroupSortOrder]);

    return rows.map((row) =>
      readRequiredIdentifier(row, SKU_COLUMN.skuID, 'sorted product SKU identifier'),
    );
  }

  /**
   * Discard the memoized option-group sort order.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L223` — D7: the guard is inverted, so this member is A
   * guaranteed no-op, and the inversion is reproduced rather than corrected. The legacy deletes the
   * memo only when the memo is absent — that is, only in the one case where there is nothing to
   * delete. When a value has been memoized, the guard fails and the value survives. So the memo is
   * never actually cleared by the member whose whole purpose is to clear it.
   */
  public clearOptionGroupSortOrderCache(): void {
    /*
     * The inverted condition, kept exactly: clear only when there is nothing to clear. Written as the
     * unset of an already-unset value so the no-op is explicit rather than an empty branch, and so a
     * reader can see that the assignment is reached — on the one path where it has no effect.
     */
    if (this.optionGroupSortOrderMemo.value === undefined) {
      this.optionGroupSortOrderMemo.value = undefined;
    }
  }

  /**
   * Write a SKU and its option links, without committing.
   *
   * @param sku - the SKU to write, with its options attached
   * @returns Nothing. The SKU is mutated in place — the audit columns are stamped on the instance the
   * caller already holds — and `../../ports/repositories/SkuRepository` declares the member
   * `promise<void>` for that reason. A composition root that wants the `EntityPersister<Sku>`
   * callback shape instead binds `(sku) => repository.persistSku(sku).then( => sku)`; the seam is
   * one line wide either way, and no caller in the slice reads a returned instance.
   */
  public async persistSku(sku: Sku): Promise<void> {
    /*
     * This member refuses an unidentified SKU rather than identifying one, and the refusal is
     * the first thing it does, before any statement is prepared. `src/services/SkuService.ts` mints the
     * 32-character value one statement before the write, because the combination engine's uniqueness
     * read has to be able to exclude the SKU it is about to insert — AAP §0.6.2's read-back cycle — and
     * only the service knows the enumeration order that read depends on. Minting here instead would
     * hand the identifier back too late for that exclusion to work.
     */
    if (sku.isNew() || sku.skuID === SKU_UNSAVED_ID_VALUE) {
      throw new DomainError('A SKU cannot be written before it has been assigned an identifier.', {
        context: { skuCode: sku.skuCode },
      });
    }

    const skuIdentifier = sku.skuID;
    const optionIdentifiers = sku.getOptions().map((option) => option.optionID);
    const accessContentIdentifiers = sku.accessContents.map(
      (accessContent) => accessContent.contentID,
    );
    const subscriptionBenefitIdentifiers = sku.subscriptionBenefits.map(
      (benefit) => benefit.subscriptionBenefitID,
    );
    const renewalSubscriptionBenefitIdentifiers = sku.renewalSubscriptionBenefits.map(
      (benefit) => benefit.subscriptionBenefitID,
    );

    /*
     * Validate every owned collection before the existence probe, audit mutation or scalar write.
     * A hydrated-but-unloaded collection may stay empty and preserve its stored rows; once a caller
     * adds a member, however, the adapter cannot know which unseen rows should remain. Refusing here
     * keeps that ambiguity from committing a scalar UPDATE before the link write is rejected.
     */
    this.assertSkuOwnedLinkWriteSafe(
      sku,
      'options',
      SKU_OPTION_TABLE,
      skuIdentifier,
      optionIdentifiers,
    );
    this.assertSkuOwnedLinkWriteSafe(
      sku,
      'accessContents',
      SKU_ACCESS_CONTENT_TABLE,
      skuIdentifier,
      accessContentIdentifiers,
    );
    this.assertSkuOwnedLinkWriteSafe(
      sku,
      'subscriptionBenefits',
      SKU_SUBSCRIPTION_BENEFIT_TABLE,
      skuIdentifier,
      subscriptionBenefitIdentifiers,
    );
    this.assertSkuOwnedLinkWriteSafe(
      sku,
      'renewalSubscriptionBenefits',
      SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE,
      skuIdentifier,
      renewalSubscriptionBenefitIdentifiers,
    );

    /*
     * The existence probe is resolved before the values are collected, and that order is forced: the
     * probe sits above the value array so nothing between the two can touch the entity. The audit stamp
     * below does touch it, and the stamp needs to know which branch is being
     * taken — an insert moves both timestamps, an update moves only `modifiedDateTime` and must leave
     * `createdByAccount` alone. Collecting first and probing second would therefore have written the
     * previous save's audit values, silently and with no error.
     */
    const probeSql = `SELECT ${SKU_COLUMN.skuID} FROM ${SKU_TABLE} WHERE ${SKU_COLUMN.skuID} = ?`;
    const existingRows = await this.executor.execute(probeSql, [skuIdentifier]);
    const skuRowAlreadyExists = existingRows.length > 0;

    /*
     * The audit block is stamped here, because this is the flush
     * Hibernate fired `preInsert`/`preUpdate` as part of the flush the framework triggered at request end
     * (`org/Hibachi/Hibachi.cfc`, double `ormFlush()` gated on the ORM reporting no errors, with
     * `flushAtRequestEnd=false`). A stateless Lambda invocation has no ORM session, no automatic flush and
     * no request-end hook (mismatch M5, AAP §0.6.6), so nothing fires the hook unless a write seam calls
     * it — and `src/services/BaseService.ts` explicitly declines the job and places it "behind
     * `EntityPersister`", which is this member. Before this call existed the four audit columns were
     * written exactly as a transient entity held them, i.e. as NULLs, where the legacy wrote a timestamp.
     */
    const auditActor = this.accountContext.getCurrentAccount();
    if (skuRowAlreadyExists) {
      applyPreUpdateAudit(sku, auditActor);
    } else {
      applyPreInsertAudit(sku, auditActor);
    }

    /*
     * Column values in the order of {@link SKU_COLUMN}, minus the identifier, which is handled
     * separately because the insert lists it and the update matches on it.
     */
    const writableColumns: readonly string[] = [
      SKU_COLUMN.activeFlag,
      SKU_COLUMN.skuCode,
      SKU_COLUMN.listPrice,
      SKU_COLUMN.price,
      SKU_COLUMN.renewalPrice,
      SKU_COLUMN.imageFile,
      SKU_COLUMN.userDefinedPriceFlag,
      SKU_COLUMN.calculatedQATS,
      SKU_COLUMN.productID,
      SKU_COLUMN.subscriptionTermID,
      SKU_COLUMN.remoteID,
      SKU_COLUMN.createdDateTime,
      SKU_COLUMN.createdByAccountID,
      SKU_COLUMN.modifiedDateTime,
      SKU_COLUMN.modifiedByAccountID,
    ];

    const writableValues: readonly unknown[] = [
      sku.activeFlag,
      sku.skuCode ?? null,
      sku.listPrice,
      sku.price,
      sku.renewalPrice,
      sku.imageFile ?? null,
      sku.userDefinedPriceFlag,
      sku.calculatedQATS ?? null,
      /*
       * The foreign keys are read from the associations, mirroring the mapping declarations at
       * `model/entity/Sku.cfc:L65` and `:L66`.
       */
      sku.product?.productID ?? null,
      sku.subscriptionTerm?.subscriptionTermID ?? readHydratedSkuSubscriptionTermID(sku) ?? null,
      sku.remoteID ?? null,
      sku.createdDateTime ?? null,
      sku.createdByAccount ?? null,
      sku.modifiedDateTime ?? null,
      sku.modifiedByAccount ?? null,
    ];

    if (skuRowAlreadyExists) {
      const assignments = writableColumns.map((column) => `${column} = ?`).join(', ');
      await this.executor.executeMutation(
        `UPDATE ${SKU_TABLE} SET ${assignments} WHERE ${SKU_COLUMN.skuID} = ?`,
        [...writableValues, skuIdentifier],
      );
    } else {
      const insertColumns = [SKU_COLUMN.skuID, ...writableColumns].join(', ');
      const insertPlaceholders = [SKU_COLUMN.skuID, ...writableColumns].map(() => '?').join(', ');
      await this.executor.executeMutation(
        `INSERT INTO ${SKU_TABLE} (${insertColumns}) VALUES (${insertPlaceholders})`,
        [skuIdentifier, ...writableValues],
      );
    }

    /*
     * All four owned link collections, written after the row itself — the order the mapping layer flushes
     * in, and the only order that works, since every link row references the SKU.
     */
    await this.replaceSkuLinkRows(
      sku,
      'options',
      SKU_OPTION_TABLE,
      SKU_LINK_COLUMN.option,
      skuIdentifier,
      skuRowAlreadyExists,
      optionIdentifiers,
    );

    await this.replaceSkuLinkRows(
      sku,
      'accessContents',
      SKU_ACCESS_CONTENT_TABLE,
      SKU_LINK_COLUMN.accessContent,
      skuIdentifier,
      skuRowAlreadyExists,
      accessContentIdentifiers,
    );

    await this.replaceSkuLinkRows(
      sku,
      'subscriptionBenefits',
      SKU_SUBSCRIPTION_BENEFIT_TABLE,
      SKU_LINK_COLUMN.subscriptionBenefit,
      skuIdentifier,
      skuRowAlreadyExists,
      subscriptionBenefitIdentifiers,
    );

    await this.replaceSkuLinkRows(
      sku,
      'renewalSubscriptionBenefits',
      SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE,
      SKU_LINK_COLUMN.renewalSubscriptionBenefit,
      skuIdentifier,
      skuRowAlreadyExists,
      renewalSubscriptionBenefitIdentifiers,
    );
  }

  /**
   * Refuses a non-empty owned collection whose database rows were never loaded.
   *
   * @param sku - the owning entity.
   * @param collection - the owned collection being validated.
   * @param table - its whitelisted link table, included only in diagnostic context.
   * @param skuIdentifier - the owning SKU identifier.
   * @param farIdentifiers - the collection's intended far-side identifiers.
   */
  private assertSkuOwnedLinkWriteSafe(
    sku: Sku,
    collection: SkuOwnedLinkCollection,
    table: PhysicalTableName,
    skuIdentifier: string,
    farIdentifiers: readonly string[],
  ): void {
    if (!isSkuOwnedLinkAuthoritative(sku, collection) && farIdentifiers.length > 0) {
      throw new DomainError(
        `The SKU's ${collection} collection was modified without having been loaded, ` +
          'so its stored links cannot be replaced without discarding rows this save never read.',
        {
          context: { skuID: skuIdentifier, collection, table, entryCount: farIdentifiers.length },
        },
      );
    }
  }

  /**
   * Replaces one SKU-owned link collection, with the replacement semantics the option link established.
   *
   * @param sku - the owning entity, consulted only for its rule 3c load state.
   * @param collection - which of the four owned collections this call writes, by the entity's own
   * property name at `model/entity/Sku.cfc:L76-L79`.
   *
   * @param table - the link table, already whitelisted.
   * @param columns - its owning and far column names, already whitelisted.
   * @param skuIdentifier - the owning SKU's 32-character identifier.
   */
  private async replaceSkuLinkRows(
    sku: Sku,
    collection: SkuOwnedLinkCollection,
    table: PhysicalTableName,
    columns: { readonly skuID: string; readonly far: string },
    skuIdentifier: string,
    skuRowAlreadyExists: boolean,
    farIdentifiers: readonly string[],
  ): Promise<void> {
    if (!isSkuOwnedLinkAuthoritative(sku, collection)) {
      this.assertSkuOwnedLinkWriteSafe(sku, collection, table, skuIdentifier, farIdentifiers);

      /*
       * Never read and still empty: the stored rows are the truth, and this save has nothing to say
       * about them. No statement is emitted — exactly what an unloaded lazy collection produced.
       */
      return;
    }

    if (skuRowAlreadyExists) {
      await this.executor.executeMutation(`DELETE FROM ${table} WHERE ${columns.skuID} = ?`, [
        skuIdentifier,
      ]);
    }

    if (farIdentifiers.length === 0) {
      return;
    }

    const placeholders = farIdentifiers.map(() => '(?, ?)').join(', ');
    const values: unknown[] = [];
    for (const farIdentifier of farIdentifiers) {
      values.push(skuIdentifier, farIdentifier);
    }

    await this.executor.executeMutation(
      `INSERT INTO ${table} (${columns.skuID}, ${columns.far}) VALUES ${placeholders}`,
      values,
    );
  }

  /**
   * Resolve the exponent seed the sorted-SKU ordering multiplies by, memoizing it for the request.
   *
   * @returns the memoized exponent seed for this request.
   */
  private async resolveNextOptionGroupSortOrder(): Promise<number> {
    const memoized = this.optionGroupSortOrderMemo.value;
    if (memoized !== undefined) {
      return memoized;
    }

    /* Seeded before the statement runs, exactly as `model/dao/SkuDAO.cfc:L206` does. */
    let nextOptionGroupSortOrder = 1;

    const maximumAlias = 'max';
    const rows = await this.executor.execute(
      `SELECT max(${OPTION_GROUP_TABLE}.${OPTION_GROUP_COLUMN.sortOrder}) AS ${maximumAlias} ` +
        `FROM ${OPTION_GROUP_TABLE}`,
      [],
    );

    const aggregateRow = rows[0];
    if (aggregateRow !== undefined) {
      const highestOptionGroupSortOrder = readOptionalNumber(
        aggregateRow,
        maximumAlias,
        'option-group sort-order aggregate',
      );
      if (highestOptionGroupSortOrder !== undefined) {
        nextOptionGroupSortOrder = highestOptionGroupSortOrder + 1;
      }
    }

    this.optionGroupSortOrderMemo.value = nextOptionGroupSortOrder;
    return nextOptionGroupSortOrder;
  }
}
