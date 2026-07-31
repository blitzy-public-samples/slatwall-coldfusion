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
 * `model/dao/SkuDAO.cfc` and every other legacy file cited below are REFERENCE-ONLY and are never
 * modified (AAP §0.4.1.1, TR-6).
 *
 * =================================================================================================
 * WHAT CHANGED, AND WHAT MAY NEVER CHANGE (the Minimal Change Clause, AAP §0.8.1)
 * =================================================================================================
 * The clause has two halves and the line between them is BEHAVIOUR. Idiom changes freely here: HQL
 * becomes SQL, mixed tag-and-script syntax disappears, column-oriented record sets become typed
 * arrays, one-based loops become zero-based, `structKeyExists` guards become optional parameters,
 * and named bindings become positional ones. Behaviour does not change at all: the five semantics
 * T1-T5 of AAP §0.6.1.3, the alternate-code disjunction with no distinct projection, the ten-way
 * chain as ONE statement, the filtering (not merely loading) effect of the fetch flag, the
 * odometer's subtraction direction, the inverted clear-cache guard, the nested membership subquery,
 * the trimming strictness of one guard and the absence of it on another, and the wildcards applied
 * inside this file rather than by a caller.
 *
 * Guideline 6 of AAP §0.8.2 names this file's subject matter explicitly — "especially anywhere
 * legacy behavior (e.g. option-to-SKU resolution edge cases) required an explicit judgment call" —
 * so every judgement call below is commented at the point where it is made.
 *
 * =================================================================================================
 * TWO DOCUMENTED EQUIVALENCES IN THE OPTION RESOLVER (AAP §0.3.3.1)
 * =================================================================================================
 * 1. NAVIGATION SIDE. The legacy existence test at `model/dao/SkuDAO.cfc:L115-L119` navigates the
 *    many-to-many relationship from the OPTION end in two hops (`from SlatwallOption o join o.skus
 *    s where s.id = sku.id and o.optionID = ?`). This adapter reads the LINK TABLE directly, which
 *    AAP §0.3.3.1 fixes as the target shape. The link table and its two column names are not
 *    guesses: `model/entity/Sku.cfc:L76` declares the OWNING side as `linktable="SwSkuOption"
 *    fkcolumn="skuID" inversejoincolumn="optionID"`, and `model/entity/Option.cfc:L66` declares the
 *    matching inverse side. The two forms are equivalent; the simplification is recorded because a
 *    reader diffing the statements will otherwise find a TABLE in no legacy text (TR-2).
 *
 * 2. IDENTIFIER ALIASES. The legacy mixes the mapping layer's implicit `.id` alias
 *    (`model/dao/SkuDAO.cfc:L117`, `:L124`) with spelled-out property names (`:L60`, `:L62`,
 *    `:L163`) inside ONE component. Nothing in the legacy text says which columns `.id` denotes.
 *    This adapter resolves it: on a SKU it is `SwSku.skuID` (`model/entity/Sku.cfc:L52`), and
 *    `sku.product.id` is the product's own identifier reached through the foreign key
 *    `SwSku.productID` (`model/entity/Sku.cfc:L65`).
 *
 * =================================================================================================
 * TODO(parity) D22 — ONE LEGACY COMPONENT, TWO NAMING CONVENTIONS
 * =================================================================================================
 * `model/dao/SkuDAO.cfc:L132` and `model/dao/SkuDAO.cfc:L135` place MAPPING-LAYER entity names
 * inside a NATIVE statement, while `model/dao/SkuDAO.cfc:L179-L211` correctly uses PHYSICAL table
 * names in an equally native statement. One file, two conventions. The conclusion for implementers
 * is carried verbatim: never "fix" HQL entity names to `Sw*`, and never assume a logical name works
 * in native SQL. Every statement this adapter emits therefore names PHYSICAL tables, resolved
 * through the whitelist rather than transformed by a prefix rule. This annotation mints no register
 * identifier; D22 is owned here per AAP §0.7.3 S7 and the mismatch and defect registers are not
 * extended by this file.
 *
 * ⚠️ D18 IS NOT THIS FILE'S. The one declared departure from byte-for-byte preservation — the
 * importer's unparameterized statements — is exclusive to `MySqlProductRepository.ts` (AAP
 * §0.6.7.7). Parameterizing everything here is ordinary S2 compliance and is not a declared
 * exception to anything.
 *
 * =================================================================================================
 * THE SCOPE BOUNDARY, AND HOW THIS FILE CROSSES IT WITHOUT WIDENING IT
 * =================================================================================================
 * Three of this adapter's statements legitimately reach tables that AAP §0.2.2.1 excludes from the
 * slice: the ten-way existence chain spans nine order, inventory, physical, stock and vendor
 * families; the SKU-code fallback reads the alternate-code table; and two of the three fetch
 * branches read the access-content and subscription-benefit link tables. `QueryRunner.ts`'s
 * whitelist deliberately holds ONLY the seven in-scope tables and refuses everything else, and it
 * states the division of responsibility for exactly this case: "the repository that meets that join
 * is answerable for flagging it". This file is that repository, so:
 *
 *   - Every IN-SCOPE identifier is resolved through `assertTableName` / `assertColumnName`, which is
 *     the only sanctioned route for a table or column name into statement text (AAP §0.7.3 S2).
 *   - Every OUT-OF-SCOPE table name is an authored, frozen literal declared once below, with its
 *     legacy locator. It is never derived from caller input, never concatenated from a parameter and
 *     never added to the whitelist — admitting it there would silently extend the port's surface
 *     past the boundary AAP §0.2.2 draws and break the independence AAP §0.8.3.8 requires.
 *   - No entity TYPE from any excluded family is imported, referenced or described. The boundary is
 *     crossed by a scalar or by SKU columns and nothing else.
 *
 * =================================================================================================
 * LAYERING (AAP §0.7.3 S4) AND WHAT THIS FILE DELIBERATELY DOES NOT DO
 * =================================================================================================
 * An adapter may import `domain/`, `ports/`, `util/` and `errors/` and the driver package, and
 * nothing else. This file imports from `domain/` and `ports/` only. It reads no environment
 * variable, builds no connection pool, holds no credential and names no AWS type — contrast
 * `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L330` and `:L420`, which build a credential-reading
 * connection three separate times inside the data-access layer itself. Configuration and pool
 * construction belong to `src/config/**`, which this file must not import; that one-way arrow is
 * what keeps the two layers acyclic.
 *
 * Nothing here commits, and no statement is ever run through the driver's text-substituting
 * execution member. Every value position is a `?` (TR-4, S2). No timeout, retry count, backoff,
 * batch size, page size, row limit, index hint, collation option, cache lifetime or eviction policy
 * appears anywhere: the legacy declares none, and AAP §0.7.3 S9 forbids inventing one. The only
 * numbers below are source-declared values carrying their locators.
 */

import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../domain/BaseProductType';
import type { Product } from '../../domain/product/Product';
import type { Sku } from '../../domain/sku/Sku';
import { SKU_UNSAVED_ID_VALUE } from '../../domain/sku/Sku';
import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import type { SkuRepository, SkuRow, SkuSearchRow } from '../../ports/repositories/SkuRepository';
import type { SqlExecutor } from './QueryRunner';
import { assertColumnName, assertTableName } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import { mapRows, mapSkuRow, mapSkuSearchRow } from './rowMappers';

/* ================================================================================================
 * IN-SCOPE PHYSICAL IDENTIFIERS — RESOLVED THROUGH THE WHITELIST, NEVER WRITTEN AS BARE TEXT
 * ============================================================================================== */

/** `SwSku` — `model/entity/Sku.cfc:L49`. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwSkuOption`, the owning side's link table — `model/entity/Sku.cfc:L76`. */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** `SwOption` — `model/entity/Option.cfc:L49`. */
const OPTION_TABLE = assertTableName('SwOption');

/** `SwOptionGroup` — `model/entity/OptionGroup.cfc:L49`. */
const OPTION_GROUP_TABLE = assertTableName('SwOptionGroup');

/** `SwProduct` — `model/entity/Product.cfc:L49`. */
const PRODUCT_TABLE = assertTableName('SwProduct');

/**
 * The `SwSku` columns this adapter names, each validated against the table it belongs to.
 *
 * Only the columns that appear in a statement are resolved. The full column-to-field mapping is
 * `rowMappers.ts`'s responsibility and is deliberately not duplicated here.
 */
const SKU_COLUMN = Object.freeze({
  /** Primary key, 32 characters, generated in application code — `model/entity/Sku.cfc:L52` (IR-6). */
  skuID: assertColumnName(SKU_TABLE, 'skuID'),
  /** `unique="true"` — `model/entity/Sku.cfc:L54`, which is why a multi-match is a data fault. */
  skuCode: assertColumnName(SKU_TABLE, 'skuCode'),
  /** The product foreign key — `model/entity/Sku.cfc:L65` `fkcolumn="productID"`. */
  productID: assertColumnName(SKU_TABLE, 'productID'),
  /** The subscription-term foreign key — `model/entity/Sku.cfc:L66` `fkcolumn="subscriptionTermID"`. */
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

/** The `SwOption` columns the odometer reads — `model/entity/Option.cfc:L56`, `:L59`. */
const OPTION_COLUMN = Object.freeze({
  optionID: assertColumnName(OPTION_TABLE, 'optionID'),
  optionGroupID: assertColumnName(OPTION_TABLE, 'optionGroupID'),
  /**
   * ⚠️ W4 — NULLABLE, AND IT IS THE MULTIPLICAND OF THE ORDERING SUM. See
   * {@link MySqlSkuRepository.findSortedSkuIdsByProduct}.
   */
  sortOrder: assertColumnName(OPTION_TABLE, 'sortOrder'),
});

/** The `SwOptionGroup` columns the odometer reads — `model/entity/OptionGroup.cfc:L52`, `:L58`. */
const OPTION_GROUP_COLUMN = Object.freeze({
  optionGroupID: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID'),
  sortOrder: assertColumnName(OPTION_GROUP_TABLE, 'sortOrder'),
});

/** The `SwProduct` columns the nested membership subquery reads — `model/entity/Product.cfc:L52`, `:L69`. */
const PRODUCT_COLUMN = Object.freeze({
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  productTypeID: assertColumnName(PRODUCT_TABLE, 'productTypeID'),
});

/* ================================================================================================
 * OUT-OF-SCOPE PHYSICAL IDENTIFIERS — AUTHORED LITERALS, DECLARED ONCE, FLAGGED
 * ================================================================================================
 * ⚠️ BOUNDARY CROSSING, FLAGGED HERE: every name below belongs to a family AAP §0.2.2.1 excludes, so
 * none of them is in `QueryRunner.ts`'s whitelist and none may be added to it. They are nonetheless
 * required, because the legacy statements this file ports reach them and the RESULT of reaching them
 * is observable through the port: the existence chain answers a delete guard, the fallback decides
 * which SKU a code resolves to, and two fetch branches change which SKUs come back.
 *
 * Each is a compile-time constant authored here from the entity declaration cited beside it. None
 * is derived from caller input, so none is an injection surface: S2's requirement is that no
 * caller-supplied string reaches statement text except as a bound `?`, and that holds throughout.
 * ============================================================================================== */

/**
 * Tables reached only to answer a question about SKUs, never to project a column of their own.
 *
 * Frozen so nothing can extend the set at run time. Every entry cites the `entityname`/`table`
 * declaration it was read from, so a reviewer can re-verify each one against the legacy tree.
 */
const OUT_OF_SCOPE_TABLE = Object.freeze({
  /** `model/entity/AlternateSkuCode.cfc:L49` — reached by the SKU-code fallback at `model/dao/SkuDAO.cfc:L103`. */
  alternateSkuCode: 'SwAlternateSkuCode',
  /** `model/entity/Sku.cfc:L77` `linktable="SwSkuAccessContent"` — the contentAccess fetch branch, `model/dao/SkuDAO.cfc:L155`. */
  skuAccessContent: 'SwSkuAccessContent',
  /** `model/entity/Sku.cfc:L79` `linktable="SwSkuSubsBenefit"` — the subscription fetch branch, `model/dao/SkuDAO.cfc:L160`. */
  skuSubscriptionBenefit: 'SwSkuSubsBenefit',
  /** `model/entity/SubscriptionTerm.cfc` — the non-fetching join of the subscription branch, `model/dao/SkuDAO.cfc:L159`. */
  subscriptionTerm: 'SwSubscriptionTerm',
  /** `model/entity/Stock.cfc:L49` — the mediating table eight of the ten existence tests traverse. */
  stock: 'SwStock',
  /** `model/entity/OrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L66`. */
  orderItem: 'SwOrderItem',
  /** `model/entity/Inventory.cfc:L49` — `model/dao/SkuDAO.cfc:L68`. */
  inventory: 'SwInventory',
  /** `model/entity/OrderDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L70`. */
  orderDeliveryItem: 'SwOrderDeliveryItem',
  /** `model/entity/PhysicalCountItem.cfc:L49` — `model/dao/SkuDAO.cfc:L72`. */
  physicalCountItem: 'SwPhysicalCountItem',
  /** `model/entity/StockAdjustmentDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L74`. */
  stockAdjustmentDeliveryItem: 'SwStockAdjustmentDeliveryItem',
  /** `model/entity/StockAdjustmentItem.cfc:L49` — reached TWICE, `model/dao/SkuDAO.cfc:L76` and `:L78`. */
  stockAdjustmentItem: 'SwStockAdjustmentItem',
  /** `model/entity/StockHold.cfc:L49` — `model/dao/SkuDAO.cfc:L80`. */
  stockHold: 'SwStockHold',
  /** `model/entity/StockReceiverItem.cfc:L49` — `model/dao/SkuDAO.cfc:L82`. */
  stockReceiverItem: 'SwStockReceiverItem',
  /** `model/entity/VendorOrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L84`. */
  vendorOrderItem: 'SwVendorOrderItem',
});

/**
 * Foreign-key and primary-key columns on the out-of-scope tables above, each read from the
 * `fkcolumn` attribute of the declaration cited.
 *
 * These exist because the legacy existence tests reference UNQUALIFIED association PATHS — `sku`,
 * `stock.sku`, `fromStock.sku`, `toStock.sku` — that are never bound to their subquery's own alias.
 * The mapping layer resolves such a path against the single entity of the enclosing subquery, which
 * is why the legacy text works at all; native SQL performs no equivalent resolution, so a
 * path-for-path transcription would either fail to parse or resolve against the wrong table. Every
 * path is therefore made EXPLICIT against the physical foreign key here.
 */
const OUT_OF_SCOPE_COLUMN = Object.freeze({
  /** `model/entity/AlternateSkuCode.cfc:L53` — the code itself. */
  alternateSkuCode: 'alternateSkuCode',
  /** `model/entity/AlternateSkuCode.cfc:L57`, `model/entity/Sku.cfc:L77`, `:L79` — all keyed by SKU. */
  skuID: 'skuID',
  /** `model/entity/Stock.cfc` primary key, and the target of every mediated join below. */
  stockID: 'stockID',
  /** `model/entity/StockAdjustmentItem.cfc:L57` `fkcolumn="fromStockID"`. */
  fromStockID: 'fromStockID',
  /** `model/entity/StockAdjustmentItem.cfc:L58` `fkcolumn="toStockID"`. */
  toStockID: 'toStockID',
  /** `model/entity/Sku.cfc:L66` and `model/entity/SubscriptionTerm.cfc` — the term key on both sides. */
  subscriptionTermID: 'subscriptionTermID',
});

/* ================================================================================================
 * INJECTED SEAMS (AAP §0.7.3 S3, S6)
 * ============================================================================================== */

/**
 * The statement-execution surface this adapter needs.
 *
 * `SqlExecutor` from `QueryRunner.ts` is deliberately one member wide so a test can substitute a
 * plain object literal, and that width is preserved: `SkuStatementExecutor` extends it rather than
 * replacing it. It adds exactly one member, and only because {@link SkuRepository.persistSku}
 * requires a write. The read member cannot carry a write — it normalises a driver result into rows
 * and raises when the driver returns a write acknowledgement instead of a row set — so an adapter
 * that must both read and write needs both members named.
 *
 * ⚠️ ONE executor, not two. `QueryRunner` satisfies this shape structurally, so the composition root
 * injects a single instance and both members run on the SAME connection. That is not a convenience:
 * it is what makes M6 work. `Sku.hasUniqueOptions()` [`model/entity/Sku.cfc:L756-L769`] is a
 * declarative validation rule that EXECUTES {@link MySqlSkuRepository.findSkusBySelectedOptions}
 * while a batch of sibling SKUs is being written, so the read must observe the writes the same
 * transaction has already issued and not yet committed. Splitting reads and writes across two
 * executors, or reaching past the injected one to a pool, silently breaks that visibility with no
 * error and no failing statement. Nothing in this file constructs a connection or a pool, and
 * nothing here commits — the transaction is opened and closed by the caller.
 */
export interface SkuStatementExecutor extends SqlExecutor {
  /**
   * Run a data-modifying statement and return the number of rows it affected.
   *
   * Matches `QueryRunner.executeMutation`, which is the port of the legacy `save()`/`delete()`
   * members of `org/Hibachi/HibachiDAO.cfc:L48-L77`.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

/**
 * The request-scoped holder for the memoized option-group sort order.
 *
 * ⚠️ M7 IS BINDING HERE, AND THIS IS ITS SHARPEST INSTANCE IN THE WHOLE PORT. The legacy memo lives
 * in the component's own variables scope [`model/dao/SkuDAO.cfc:L51`, `:L204-L220`], which makes
 * `SkuDAO` the only stateful DAO of the four. Because the dependency framework registers services
 * and DAOs as SINGLETONS, that state is process-wide for the lifetime of the application — and the
 * aggregate it caches [`model/dao/SkuDAO.cfc:L210-L212`] takes NO parameters and applies NO product
 * scoping whatsoever, so the cached value is a property of the entire option-group table rather than
 * of any one product.
 *
 * On a persistent application server that is merely stale. On a warm, reused function container it
 * is a correctness bug that produces no exception, no log line and no failing test: one caller's
 * maximum group sort order silently sets the digit weighting of a later, unrelated caller's SKU
 * ordering. AAP §0.6.6 resolves it in one sentence — "Memoization is therefore scoped to the request
 * object rather than the module, to avoid cross-tenant bleed on a warm container."
 *
 * Two consequences are enforced by the shape of this type. Module-scope caching is impossible here
 * because there is no module-level mutable binding to cache into — the only module-scope state
 * permitted anywhere in the subtree is the driver pool in `src/config/database.ts`. And an
 * instance-level accumulating field on the repository would reintroduce exactly the singleton bleed,
 * so the memo is a CONSTRUCTOR PARAMETER whose lifetime the composition root controls: one holder
 * per invocation, discarded with the invocation. Making the scope visible in the type is the point.
 */
export interface OptionGroupSortOrderMemo {
  /**
   * The memoized value, or `undefined` while the memo is unset.
   *
   * Mutable by design — this is the one piece of state the sorted-SKU ordering needs, and its
   * lifetime is the caller's, not this adapter's.
   */
  value: number | undefined;
}

/**
 * Create an empty request-scoped memo holder.
 *
 * The composition root calls this once per invocation, immediately before constructing the
 * repository, and lets both go out of scope together. Exported because the holder's lifetime is a
 * wiring decision and wiring lives outside this layer; the adapter must not create its own, or the
 * request scope it is documenting would be a fiction.
 */
export function createOptionGroupSortOrderMemo(): OptionGroupSortOrderMemo {
  return { value: undefined };
}

/**
 * The root-product-type resolver `Product.getBaseProductType()` requires.
 *
 * Derived from the entity's own signature rather than imported, because the resolver's declaring
 * module is not among this file's permitted dependencies and S4 does not bend for convenience. The
 * same derivation is already used by `src/services/SkuService.ts`, so the two agree by construction
 * and cannot drift apart when the entity's signature changes.
 */
export type MySqlSkuRepositoryProductTypeRootResolver = Parameters<
  Product['getBaseProductType']
>[0];

/* ================================================================================================
 * GUARDED SCALAR READS (AAP §0.7.3 S1)
 * ================================================================================================
 * `rowMappers.ts` exports row mappers but keeps its scalar readers private, so the few scalar reads
 * below are guarded locally. Under `noUncheckedIndexedAccess` every indexed read is `T | undefined`
 * and every property of an untyped row is `unknown`, which is exactly the class of bug the legacy
 * left unguarded at `model/dao/SkuDAO.cfc:L93-L95`. The strict setting is not relaxed to make any of
 * this compile; the reads are narrowed instead.
 * ============================================================================================== */

/**
 * Read a required identifier column from a driver row.
 *
 * The mapping layer's own row mappers cover full entities. This covers the two statements that
 * project a single identifier column — the sorted-SKU ordering and the existence probe — where
 * building an entity would be wrong.
 *
 * @param row - the driver row
 * @param column - the projected column name
 * @param statement - a short description used only in the failure message
 * @throws {DataIntegrityError} when the column is absent, null, or not a non-empty string
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
 * The driver returns MySQL integer columns as numbers, but a `MAX()` over an empty table yields
 * `null`, and a `DECIMAL` may arrive as a string depending on driver configuration. Both are
 * narrowed rather than assumed.
 *
 * @param row - the driver row
 * @param column - the projected column name
 * @param statement - a short description used only in the failure message
 * @returns the value as a finite number, or `undefined` when the column is null or absent
 * @throws {DataIntegrityError} when the column holds something that is neither null nor numeric
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
 *
 * Fixed here rather than inlined so the ten near-identical existence tests cannot drift apart.
 */
const SKU_ALIAS = 's';
const ITEM_ALIAS = 'a';
const STOCK_ALIAS = 'st';

/**
 * Build one correlated existence test that reaches a SKU DIRECTLY through its own foreign key.
 *
 * Ports the first of the ten legacy tests, `model/dao/SkuDAO.cfc:L66`, whose unqualified path `sku`
 * resolves against the subquery's single entity. Only one of the ten works this way: order items
 * carry `skuID` themselves [`model/entity/OrderItem.cfc:L63`].
 *
 * The projection is a constant. The legacy projects a named identifier column and aliases it — `as
 * id` — which an existence test discards entirely, so reproducing the projection would carry noise,
 * not behaviour.
 *
 * @param table - the physical table to test for a referencing row
 * @returns statement text, correlated to the outer SKU alias, with no placeholder of its own
 */
function directSkuExistsClause(table: string): string {
  return (
    `EXISTS( SELECT 1 FROM ${table} ${ITEM_ALIAS} ` +
    `WHERE ${ITEM_ALIAS}.${OUT_OF_SCOPE_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} )`
  );
}

/**
 * Build one correlated existence test that reaches a SKU THROUGH a stock row.
 *
 * Ports the other nine legacy tests. Their paths — `stock.sku`, `fromStock.sku`, `toStock.sku` — are
 * two-hop associations the mapping layer resolves implicitly; native SQL resolves nothing, so the
 * hop through the stock table is spelled out as an explicit join on the physical foreign key.
 *
 * Note that `model/entity/StockHold.cfc` declares BOTH `skuID` [`:L63`] and `stockID` [`:L64`], so a
 * direct test would have parsed. The legacy chose the mediated path at `model/dao/SkuDAO.cfc:L80`
 * and this port keeps it: the two are not equivalent — a hold row whose stock has been repointed
 * answers differently — and Guideline 4 forbids substituting the tidier form.
 *
 * `model/entity/PhysicalCountItem.cfc` shows why the legacy had no choice elsewhere: its `sku`
 * property [`:L80`] is `persistent="false"`, so `stockID` [`:L61`] is the only path that exists.
 *
 * @param table - the physical table to test for a referencing row
 * @param stockForeignKey - the column on that table holding the stock identifier
 * @returns statement text, correlated to the outer SKU alias, with no placeholder of its own
 */
function stockMediatedSkuExistsClause(table: string, stockForeignKey: string): string {
  return (
    `EXISTS( SELECT 1 FROM ${table} ${ITEM_ALIAS} ` +
    `INNER JOIN ${OUT_OF_SCOPE_TABLE.stock} ${STOCK_ALIAS} ` +
    `ON ${STOCK_ALIAS}.${OUT_OF_SCOPE_COLUMN.stockID} = ${ITEM_ALIAS}.${stockForeignKey} ` +
    `WHERE ${STOCK_ALIAS}.${OUT_OF_SCOPE_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} )`
  );
}

/**
 * The ten existence tests of `model/dao/SkuDAO.cfc:L65-L85`, in legacy order, joined by `OR`.
 *
 * ⚠️ TEN TESTS ACROSS NINE TABLES — the stock-adjustment table is tested TWICE, once through its
 * `fromStockID` [`model/dao/SkuDAO.cfc:L76`] and once through its `toStockID` [`:L78`]. AAP §0.4.1.7
 * requires the chain be "translated as a single query", so this is assembled once, at module load,
 * into one disjunction that becomes one statement and one round trip. Ten separate queries would be
 * a different execution shape, and collapsing the chain into something tidier is forbidden by
 * Guideline 4 wherever it would change results.
 *
 * Frozen and computed from constants only. It embeds no caller input and no placeholder, so the
 * whole chain contributes nothing to the bound parameter list.
 */
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

/** The alias the existence chain's aggregate is projected under. */
const TRANSACTION_COUNT_ALIAS = 'transactionCount';

/**
 * The `SwSku` columns every SKU-returning statement projects, qualified with the root alias.
 *
 * Spelled out rather than starred for two reasons. `rowMappers.ts` states that a mapper never
 * inspects a joined table's columns and that "a repository that joins is responsible for splitting or
 * aliasing the row" — and two statements below DO join a table that has its own `skuID` column, so an
 * unqualified star would hand the mapper a collision. An explicit list also keeps the projection
 * stable if the physical table ever carries a column the entity does not declare.
 *
 * Column order follows `model/entity/Sku.cfc` and is immaterial to the mapper, which reads by name.
 */
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

/**
 * The predicate that keeps option-less SKUs out of the option resolver's results.
 *
 * ⚠️ T3 — THIS IS THE TRANSLATION OF A JOIN THAT LOOKS DEAD AND IS NOT. See
 * {@link MySqlSkuRepository.findSkusBySelectedOptions}, which is where the full reasoning lives.
 * Extracted to a named constant precisely so it cannot be mistaken for scaffolding and deleted.
 */
const OPTION_BEARING_GUARD =
  `EXISTS( SELECT 1 FROM ${SKU_OPTION_TABLE} sob ` +
  `WHERE sob.${SKU_OPTION_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} )`;

/**
 * One correlated existence test asserting that a SKU carries one particular option.
 *
 * ⚠️ T1 — EMITTED ONCE PER SUPPLIED OPTION AND ANDed WITH THE OTHERS. Carries exactly one
 * placeholder, so the number of copies emitted is also the number of option parameters bound. The
 * reasoning lives at {@link MySqlSkuRepository.findSkusBySelectedOptions}; the clause is a constant
 * because every copy is textually identical and only the BOUND VALUE differs.
 */
const OPTION_MATCH_CLAUSE =
  `EXISTS( SELECT 1 FROM ${SKU_OPTION_TABLE} so ` +
  `WHERE so.${SKU_OPTION_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} ` +
  `AND so.${SKU_OPTION_COLUMN.optionID} = ? )`;

/* ================================================================================================
 * THE REPOSITORY
 * ============================================================================================== */

/**
 * MySQL implementation of {@link SkuRepository}, ported from `model/dao/SkuDAO.cfc`.
 *
 * ---------------------------------------------------------------------------------------------
 * THE MEMBER SET IS CLOSED. THREE LEGACY MEMBERS ARE ABSENT BY DESIGN.
 * ---------------------------------------------------------------------------------------------
 * `SkuRepository` declares the whole surface this class exposes, and nothing is added to it. Three
 * members a reader may expect are deliberately missing:
 *
 * 1. The option-group sort-order accessor of `model/dao/SkuDAO.cfc:L204-L220` is `access="private"`
 *    in the legacy component and stays private here — see
 *    {@link MySqlSkuRepository.resolveNextOptionGroupSortOrder}. It is an implementation detail of
 *    the sorted-SKU ordering, not part of the contract.
 *
 * 2. The dynamic paginated-query member is not implemented here. It belongs to the smart-list port
 *    and its query builder. `model/service/SkuService.cfc:L312` reaches it through the SKU DAO rather
 *    than through the shared base DAO, but both resolve to the same inherited framework member at
 *    `org/Hibachi/HibachiDAO.cfc:L102`, so that is a legacy inconsistency and not a semantic
 *    difference. Implementing a member here to accommodate it would widen this port for no
 *    behavioural reason.
 *
 * 3. ⚠️ `getSkuStocksDeletableFlag` IS DEFECT D4 AND IS NOT INVENTED HERE. `model/service/
 *    SkuService.cfc:L281` declares a service member of that name which delegates at `:L282` to a DAO
 *    member of the same name, and `model/entity/Sku.cfc:L569` calls the service. Those three locators
 *    are the ONLY occurrences in the repository: the DAO member does not exist, in any syntax, at
 *    any line of `model/dao/SkuDAO.cfc`. Writing one here would invent behaviour the legacy never
 *    had and would hide the defect. The explicit not-implemented boundary lives in the service, which
 *    is where the declaration that cannot be satisfied lives.
 *
 * ---------------------------------------------------------------------------------------------
 * EVERY STATEMENT IS ASSERTABLE WITHOUT A DATABASE (AAP §0.7.3 S6)
 * ---------------------------------------------------------------------------------------------
 * The legacy suite vendors no mocking library and boots the whole application to reach a DAO, and no
 * CFML runtime exists in this environment, so the legacy statements cannot be executed for
 * comparison at all. The single injected executor is the substitute: a test supplies a plain object
 * literal that records the statement text and the bound parameter array, which is how the five
 * option-resolution semantics get one explicit assertion each. Nothing in this class reaches around
 * that seam.
 */
export class MySqlSkuRepository implements SkuRepository {
  /**
   * @param executor - the transaction-scoped statement executor. Replaces the framework's implicit
   *   session: reads and writes share it so validation observes uncommitted siblings (M6).
   * @param optionGroupSortOrderMemo - the request-scoped memo holder (M7). Supplied per invocation
   *   by the composition root; this class never creates one and never caches at module scope.
   * @param productTypeRootResolver - resolves a product type to its seeded root discriminator, which
   *   {@link MySqlSkuRepository.findByProduct} branches on.
   */
  public constructor(
    private readonly executor: SkuStatementExecutor,
    private readonly optionGroupSortOrderMemo: OptionGroupSortOrderMemo,
    private readonly productTypeRootResolver: MySqlSkuRepositoryProductTypeRootResolver,
  ) {}

  /**
   * Does any transaction anywhere in the system reference this SKU, or any SKU of this product?
   *
   * Ports `model/dao/SkuDAO.cfc:L53-L98`. Backs the delete guards declared in
   * `model/validation/Sku.json` and `model/validation/Product.json`, so a wrong answer here either
   * blocks a legitimate delete or permits one that orphans transactional history.
   *
   * ONE STATEMENT, TEN DISJUNCTS. AAP §0.4.1.7 requires the chain be translated as a single query,
   * and {@link TRANSACTION_EXISTS_CHAIN} assembles it once. The two identifiers are MUTUALLY
   * EXCLUSIVE, never combined: the legacy binds exactly one named parameter at
   * `model/dao/SkuDAO.cfc:L87-L91`, so this statement carries exactly one placeholder.
   *
   * ⚠️ THE LEGACY DOES NOT RAISE EXPLICITLY WHEN BOTH ARGUMENTS ARE OMITTED — AND IT DOES NOT RETURN
   * FALSE EITHER. `model/dao/SkuDAO.cfc:L87` is a two-part guard, so with both arguments absent
   * control reaches the alternative branch at `:L89` and dereferences an argument that was never
   * supplied, which the CFML runtime reports as an undefined-variable error. The failure is real but
   * incidental. This port fails deliberately instead, with a message authored here: an argument fault
   * must not be answered with `false`, because `false` is the answer that permits a delete.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L93-L95` — THE LEGACY READS ITS AGGREGATE ROW UNGUARDED. It
   * indexes the first element of the result and compares it to zero without checking that a row came
   * back or that the value is numeric. An aggregate over a joined set does return one row, so the
   * read happens to be safe; it is unguarded all the same. This port guards it, because
   * `noUncheckedIndexedAccess` types the read as possibly absent and the honest response to that is a
   * narrowing check, not a non-null assertion. The behaviour on the normal path is identical.
   *
   * Discrepancy 4, noted and not resolved here: `model/service/SkuService.cfc:L285` declares the
   * SERVICE member with NO arguments at all, while its real callers pass one by name —
   * `model/entity/Sku.cfc:L594` passes the SKU identifier and `model/entity/Product.cfc:L626` passes
   * the product identifier. The narrower service contract is preserved in the service layer; this
   * repository keeps both optional identifiers because the DAO declares both
   * [`model/dao/SkuDAO.cfc:L54-L55`], untyped and not required.
   *
   * @param productID - the product whose SKUs are tested. Used only when no SKU identifier is given.
   * @param skuID - the SKU tested. Takes precedence whenever it is supplied.
   * @returns `true` when at least one transaction references the selection
   * @throws {DomainError} when neither identifier is supplied
   * @throws {DataIntegrityError} when the aggregate does not come back as a single numeric row
   */
  public async transactionExists(productID?: string, skuID?: string): Promise<boolean> {
    /*
     * The legacy tests presence AND non-nullness [`model/dao/SkuDAO.cfc:L59`, `:L87`]. Under strict
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
     * then reads the far side's key. For a many-to-one that key IS the near side's foreign key
     * column, so the product predicate resolves to `SwSku.productID`
     * [`model/entity/Sku.cfc:L65`] and needs no join.
     */
    const rootPredicate =
      skuID !== undefined
        ? `${SKU_ALIAS}.${SKU_COLUMN.skuID} = ?`
        : `${SKU_ALIAS}.${SKU_COLUMN.productID} = ?`;

    const sql =
      `SELECT COUNT(${SKU_ALIAS}.${SKU_COLUMN.skuID}) AS ${TRANSACTION_COUNT_ALIAS} ` +
      `FROM ${SKU_TABLE} ${SKU_ALIAS} ` +
      `WHERE ${rootPredicate} AND ( ${TRANSACTION_EXISTS_CHAIN} )`;

    const rows = await this.executor.execute(sql, [identifier]);
    const aggregateRow = rows[0];
    if (aggregateRow === undefined) {
      throw new DataIntegrityError(
        'The transaction-existence aggregate returned no row, so the count cannot be read.',
        { context: { productID, skuID } },
      );
    }

    const matchingSkuCount = readOptionalNumber(
      aggregateRow,
      TRANSACTION_COUNT_ALIAS,
      'transaction-existence',
    );
    if (matchingSkuCount === undefined) {
      throw new DataIntegrityError(
        'The transaction-existence aggregate returned a null count, which cannot be interpreted.',
        { context: { productID, skuID } },
      );
    }

    /*
     * `model/dao/SkuDAO.cfc:L93-L97`: zero is false, anything else is true. Kept in that direction
     * rather than rewritten as `> 0`, so the behaviour on any unexpected value is the legacy's.
     */
    return matchingSkuCount !== 0;
  }

  /**
   * Resolve a SKU from either its own code or one of its alternate codes.
   *
   * Ports `model/dao/SkuDAO.cfc:L102-L104`, a single statement whose behaviour is carried by four
   * details that are all easy to lose.
   *
   * 1. ONE VALUE, TWO PLACEHOLDERS. The legacy names its parameter once and references it TWICE in
   *    the statement text. Positional binding has no such sharing, so the same value is bound twice,
   *    in occurrence order (TR-4).
   *
   * 2. ⚠️ KEEP THE DISJUNCTION AS ONE PREDICATE. Splitting the two matches into two separate selects
   *    and combining their results is the obvious rewrite, and it is wrong: that combination
   *    deduplicates, and with no distinct projection here (point 3) it would change how many rows come
   *    back — which turns the failure of point 4 into a success.
   *
   * 3. TODO(parity) `model/dao/SkuDAO.cfc:L103` — THERE IS NO DISTINCT PROJECTION, AND NONE IS ADDED.
   *    Two lines earlier the same component does use one [`:L109`], so its absence here is a real
   *    asymmetry rather than an oversight this port may correct. It has a consequence: because the
   *    join to the alternate-code table is a one-to-many [`model/entity/Sku.cfc:L69`], a SKU that
   *    carries several alternate codes and whose OWN code matches produces one row per alternate
   *    code, and point 4 then makes the lookup FAIL. That is the legacy's behaviour and it is
   *    preserved.
   *
   * 4. SINGLE-RESULT SEMANTICS ARE ENFORCED HERE, NOT BY THE EXECUTOR. The third argument of the
   *    legacy call requests a unique result: no match yields nothing, more than one match RAISES.
   *    `QueryRunner.executeOne` is deliberately lenient and hands back the first row, so this method
   *    counts the rows itself. ⚠️ And no row limit is added — a limit would silently turn the failure
   *    of point 3 into a quiet, arbitrary success.
   *
   * The join reaches `SwAlternateSkuCode`, which is outside the slice; it is named as an authored
   * literal and flagged with the rest of the boundary crossings at {@link OUT_OF_SCOPE_TABLE}. The
   * projection is explicit because that table carries its own `skuID` column
   * [`model/entity/AlternateSkuCode.cfc:L57`] and the mapper must not be handed the collision.
   *
   * Out-of-scope caller whose contract this must keep: `model/service/PhysicalService.cfc:L199`
   * resolves a counted item's code through the service member that delegates here.
   *
   * @param skuCode - the code to resolve. Required at the DAO level [`model/dao/SkuDAO.cfc:L102`].
   * @returns the single matching SKU, or `null` when nothing matches
   * @throws {DataIntegrityError} when more than one row matches
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
    return mapSkuRow(row);
  }

  /**
   * Return the SKUs of a product that carry EVERY one of the supplied options.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════════
   * THIS IS THE PIVOTAL TRANSLATION OF THE WHOLE PORT. Ports `model/dao/SkuDAO.cfc:L106-L128`.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════
   * The legacy comment at `model/dao/SkuDAO.cfc:L106` is quoted verbatim because the source uses it
   * to state the contract in one word, capitalised, by someone who had evidently been bitten:
   *
   *     // returns product skus which matches ALL options (list of optionIDs) that are passed in
   *
   * AAP §0.3.3.1 fixes the translated shape and commits to four properties, all of which hold below:
   * the conjunction is expressed as N separate correlated existence tests rather than a membership
   * list or an aggregate rewrite; the distinct projection is retained; the option-bearing guard is
   * retained; and the parameter array is assembled with the option identifiers in list order followed
   * by the product identifier, matching the legacy positional order precisely.
   *
   * Four callers reach this, and each constrains it: `model/entity/Sku.cfc:L763` inside a validation
   * rule; `model/entity/Product.cfc:L349-L364` singular, which layers arity assertions on the result;
   * `model/entity/Product.cfc:L366-L368` plural; and the out-of-scope
   * `model/process/Order_AddOrderItem.cfc:L238`, which calls positionally and must not break.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * T1 — CONJUNCTION, NOT INTERSECTION. THE MOST LIKELY ACCIDENTAL FAILURE IN THE ENTIRE PORT.
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * Each supplied option becomes its OWN correlated existence test, and they are ANDed. A SKU
   * qualifies only if it carries EVERY option in the list.
   *
   * A membership list over the option identifiers is shorter, reads as obviously equivalent, compiles,
   * and returns plausible rows for every hand-written example — and it silently converts "a SKU
   * carrying ALL of these options" into "a SKU carrying ANY of them". An aggregate rewrite that counts
   * matched options and compares the count to the list length is closer, and still diverges: it
   * collapses a repeated identifier, so a list containing the same option twice would be satisfied by
   * a SKU carrying it once.
   *
   * ⚠️ CONSEQUENTLY THE INPUT ARRAY IS NOT DEDUPLICATED. The legacy walks the list positionally
   * [`model/dao/SkuDAO.cfc:L113-L114`] and appends one test per element, duplicates included. Three
   * elements produce three tests even when two of them are the same identifier.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * T2 — THE PRODUCT PREDICATE IS UNCONDITIONAL HERE, AND THAT IS A DECLARED DECISION.
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * The legacy appends the product predicate only when the argument is present
   * [`model/dao/SkuDAO.cfc:L123`] — a presence test with no emptiness test. That branch is
   * unreachable on the real path: `model/service/ProductService.cfc:L104` declares the argument
   * REQUIRED and forwards the whole argument collection, and that service member is this DAO member's
   * ONLY caller. So the parameter is typed as required and the predicate is ALWAYS emitted. Recorded
   * as a decision rather than quietly collapsed, because the unreachable branch is visible in the
   * legacy text and its disappearance would otherwise look like a translation slip.
   *
   * The absence of an emptiness test survives too: an empty product identifier still appends the
   * predicate and matches nothing, exactly as the legacy would.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * T3 — THE VESTIGIAL JOIN IS LOAD-BEARING. THE SECOND MOST LIKELY ACCIDENTAL FAILURE.
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * The legacy seed joins the SKU's options and aliases them [`model/dao/SkuDAO.cfc:L109-L112`], and
   * that alias is never referenced anywhere in the predicate. Every reviewer and every linter would
   * call it dead. It is not: because the join is INNER, it silently excludes SKUs that carry NO
   * options — from every single call, including the empty-selection call of T5. Removing it changes
   * the result set on every invocation by admitting option-less SKUs.
   *
   * The equivalent is {@link OPTION_BEARING_GUARD}, an existence test against the link table, emitted
   * unconditionally. Existence rather than a join because a join would also fan the result out, and
   * the fan-out is a side effect of the legacy form rather than part of its meaning.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * T4 — THE DISTINCT PROJECTION IS RETAINED.
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * In the legacy form the inner join fans one row out per SKU-and-option pair, so without it a SKU
   * carrying N options comes back N times and every arity assertion layered on the result — the three
   * raised in `model/entity/Product.cfc:L349-L364`, and the uniqueness rule at
   * `model/entity/Sku.cfc:L756-L769` — breaks.
   *
   * The existence form emitted here does not fan out, so the projection is arguably redundant. It is
   * kept anyway: AAP §0.3.3.1 commits to keeping it, and dropping it would stake the correctness of
   * the arity assertions on this translation being exactly fan-out-free forever.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * T5 — AN EMPTY SELECTION IS LEGAL, MEANINGFUL, AND MUST NOT BE GUARDED AGAINST.
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * The legacy loop bound is the length of the supplied list [`model/dao/SkuDAO.cfc:L113`], and an
   * empty list has length zero, so NO existence tests are appended and the statement legitimately
   * degenerates to "every option-bearing SKU of this product". Two callers depend on precisely that
   * degenerate form: the uniqueness rule at `model/entity/Sku.cfc:L756-L769`, and the plural
   * `model/entity/Product.cfc:L366-L368`, whose own parameter defaults to empty.
   *
   * Precision, because the singular member is easy to miscount as a third dependant:
   * `model/entity/Product.cfc:L349-L364` branches on the selection being non-empty and NEVER calls
   * this on the empty path — it falls through to its own single-SKU check. So an empty array is
   * accepted here, raises nothing, and returns rows.
   *
   * TODO(parity) `model/entity/Sku.cfc:L756-L769` — D19, A CONSEQUENCE OF T5 THAT IS NOT REPAIRED.
   * A SKU carrying no options resolves an empty option list, so by T5 this returns every
   * option-bearing SKU of the product. The rule's guard then passes only when that set is empty or is
   * the SKU itself — and an option-less SKU is never in an option-bearing set — so an option-less
   * default SKU on a product that already has option-bearing SKUs FAILS its uniqueness rule. Carried
   * as observed behaviour.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * M6 — THIS QUERY RUNS DURING A SAVE, AND MUST SEE WHAT THAT SAVE HAS WRITTEN.
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * `model/entity/Sku.cfc:L756-L769` is a declarative validation rule that executes this query while a
   * batch of sibling SKUs is being created, so what it observes depends on writes the enclosing
   * transaction has issued and not yet committed. That is why the statement runs on the INJECTED
   * executor and why nothing here reaches for a pool: the same connection carries both the sibling
   * inserts and this read. See {@link SkuStatementExecutor}.
   *
   * @param optionIds - the selected option identifiers, in caller order, duplicates preserved. An
   *   empty array is valid and meaningful (T5).
   * @param productId - the product to restrict to. Required (T2).
   * @returns the matching SKUs, distinct, option-bearing
   */
  public async findSkusBySelectedOptions(
    optionIds: string[],
    productId: string,
  ): Promise<SkuRow[]> {
    /*
     * The legacy seeds its predicate with a tautology [`model/dao/SkuDAO.cfc:L111`] so that every
     * subsequent fragment can be appended with a leading conjunction. That is a string-builder
     * convenience with no effect on the result, so it is replaced by joining the predicates — the
     * one place in this method where idiom is allowed to change (AAP §0.8.1).
     *
     * Predicate ORDER mirrors the legacy exactly, because the parameter array must: the option tests
     * first, in list order, then the product predicate. The option-bearing guard binds nothing, so
     * placing it first — where the legacy join sat, at the top of the statement — moves no parameter.
     */
    const predicates: string[] = [OPTION_BEARING_GUARD];

    /*
     * T1: one test per element, in order, duplicates included. Mapped over the array rather than
     * over a set of it, and mapped over the ARRAY ITSELF rather than over its distinct values, so
     * that a repeated identifier yields a repeated test and a repeated placeholder.
     */
    predicates.push(...optionIds.map(() => OPTION_MATCH_CLAUSE));

    /* T2: always emitted. */
    predicates.push(`${SKU_ALIAS}.${SKU_COLUMN.productID} = ?`);

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
   * Ports `model/dao/SkuDAO.cfc:L130-L148`. Discrepancy 3: BOTH arguments are optional in the legacy
   * declaration, and the port keeps them optional — but only one of them is actually safe to omit.
   *
   * ⚠️ TODO(parity) D22 — `model/dao/SkuDAO.cfc:L132` AND `model/dao/SkuDAO.cfc:L135` PUT
   * MAPPING-LAYER ENTITY NAMES INSIDE A NATIVE STATEMENT. These two lines are the only D22 sites in
   * the component; thirty lines further on, `model/dao/SkuDAO.cfc:L179-L211` uses PHYSICAL table names
   * in an equally native statement. One file, two conventions. The conclusion is carried verbatim:
   * never "fix" HQL entity names to `Sw*`, and never assume a logical name works in native SQL. This
   * method is where that bites hardest, and it resolves the physical tables through the whitelist —
   * `SwSku` and `SwProduct` — rather than by stripping a prefix off the legacy text.
   *
   * ⚠️ THE WILDCARDS ARE APPLIED HERE, NOT BY THE CALLER. `model/dao/SkuDAO.cfc:L133` wraps the term
   * in leading and trailing wildcards inside the DAO, and moving that to the caller would change the
   * contract of every existing call site. The wrapped value is bound as a parameter, so the wildcards
   * are part of the VALUE and not part of the statement text.
   *
   * ⚠️ THE TERM IS READ WITH NO GUARD. `model/dao/SkuDAO.cfc:L133` interpolates the argument
   * unconditionally, so omitting it makes the legacy dereference an argument that is not there and
   * fail. It does not search for everything. The failure is reproduced deliberately, with a message
   * authored here; returning every SKU instead would be a new behaviour.
   *
   * ⚠️ THE PRODUCT-TYPE GUARD TRIMS, AND ITS TWIN DOES NOT. `model/dao/SkuDAO.cfc:L134` requires the
   * argument to be present AND non-blank after trimming, so a whitespace-only value is REJECTED and
   * the restriction is simply not applied. The product-side equivalent at
   * `model/dao/ProductDAO.cfc:L423` tests length only, so the same whitespace-only value is ACCEPTED
   * there (Discrepancy 6). Both strictnesses are preserved as they are; harmonising them would change
   * one of the two.
   *
   * ⚠️ THE MEMBERSHIP TEST IS NESTED, AND STAYS NESTED. `model/dao/SkuDAO.cfc:L135` restricts SKUs to
   * products drawn from an inner select over the product table, rather than joining the product table
   * and filtering it directly the way `model/dao/ProductDAO.cfc:L424` does. Flattening it into a join
   * would also fan the result out, so the nesting is retained.
   *
   * ⚠️ THE PARAMETER NAME AND THE ARGUMENT NAME DIFFER. The legacy binds the term under the name
   * `code`, not `term` [`model/dao/SkuDAO.cfc:L133`]. Positional binding erases the names, so what
   * survives is the ORDER: the term first, then the product-type identifiers. The legacy fixes that
   * order by adding both parameters BEFORE it installs the statement text
   * [`model/dao/SkuDAO.cfc:L138`], and no type in TypeScript can catch a transposed array — only a
   * test can, which is why the ad-hoc suite asserts it explicitly.
   *
   * The parameter is named in the singular even though its value is a COMMA-SEPARATED LIST
   * [`model/dao/SkuDAO.cfc:L136`, which marks it as a list]. The misnomer is part of the preserved
   * signature. List semantics are the platform's: the value is split on commas, EMPTY SEGMENTS ARE
   * DROPPED, and segments are NOT trimmed — a segment of `" x"` is bound with its leading space, and a
   * value of `",,"` yields no segments at all.
   *
   * @param term - the substring to search for. Optional in the signature; omitting it raises.
   * @param productTypeID - a comma-separated list of product-type identifiers. Genuinely optional;
   *   absent, blank or whitespace-only values leave the restriction off.
   * @returns one `{ id, value }` projection per matching SKU, in the order the database returned them
   * @throws {DomainError} when the term is omitted, or when the product-type list has segments in it
   *   but none of them survive splitting
   */
  public async searchByProductType(term?: string, productTypeID?: string): Promise<SkuSearchRow[]> {
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

    /* Presence AND non-blank-after-trim, exactly as `model/dao/SkuDAO.cfc:L134` tests it. */
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

    const rows = await this.executor.execute(sql, params);
    return mapRows(rows, mapSkuSearchRow);
  }

  /**
   * Return a product's SKUs, optionally restricted to those that carry the structure its base
   * product type expects.
   *
   * Ports `model/dao/SkuDAO.cfc:L150-L168`.
   *
   * ⚠️ THE FLAG FILTERS. IT IS NOT A LOADING HINT, WHATEVER ITS NAME SUGGESTS. Every join the legacy
   * adds under the flag [`model/dao/SkuDAO.cfc:L155`, `:L157`, `:L159-L160`] is an INNER join, so
   * raising the flag REMOVES SKUs from the result: a merchandise SKU with no options, a
   * content-access SKU with no contents, a subscription SKU with no term or no benefits all disappear.
   * That is observable through the port and is preserved. Reading the flag as a mere eager-load
   * directive and translating it away is the single easiest way to break this member.
   *
   * The eager-load HALF of those joins is a different matter and is deliberately not reproduced. The
   * legacy marks three of the four as fetch joins, which loads access contents, options and
   * subscription benefits alongside the SKU. Access contents and subscription benefits belong to
   * families AAP §0.2.2.1 excludes and this port carries no types for them, so there is nothing to
   * load them into; the FILTERING effect, which is what crosses the port boundary, is what these
   * statements keep. Callers that need a SKU's options read them through the option-bearing members.
   *
   * Discrepancy 5: the flag is declared REQUIRED at this level [`model/dao/SkuDAO.cfc:L150`] and
   * untyped, while the service member that calls it declares it optional with a default. The
   * repository keeps it REQUIRED, and types it — the legacy type carries no information and AAP TR-1
   * asks that a loose signature be tightened to the observed contract rather than transliterated. The
   * member also takes the PRODUCT ENTITY rather than an identifier, because the branch is chosen from
   * the product's base product type and only the entity can answer that.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L153` — D9a: THE FLAG IS READ UNSCOPED. The legacy reads the
   * bare name rather than the argument, which resolves through the scope chain and would silently pick
   * up a same-named component variable if one existed. Nothing shadows it today, so the behaviour is
   * unchanged; the defect is recorded and not repaired.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L163` — D9b: THE STATEMENT VARIABLE IS RE-DECLARED MID-BODY.
   * The trailing clause is appended with a second declaration of a name already declared at `:L152`,
   * which is a no-op on this engine and would be a redeclaration error on a stricter one. Carried as a
   * note; the concatenation it performs is preserved.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L152-L163` — NO DISTINCT PROJECTION, SO THE RESULT FANS OUT.
   * With the flag raised, a merchandise SKU carrying three options appears THREE TIMES, and a
   * subscription SKU with two benefits twice. Contrast `:L109`, which does project distinctly. The
   * duplication is passed through unchanged rather than collapsed, because callers observe the array
   * length. This annotation mints no register identifier.
   *
   * ⚠️ THE FOURTH ARGUMENT OF THE LEGACY CALL IS SURFACED, NOT REPRODUCED. `model/dao/SkuDAO.cfc:L165`
   * is the only call in the component that passes a fourth options argument, requesting
   * case-insensitive ordering. There is no ordering clause in the statement for it to apply to, so it
   * affects nothing. No collation parameter is added to this signature or to the statement, because
   * inventing one would create a knob the legacy never had (AAP §0.7.3 S9).
   *
   * An unrecognised base product type adds NO join at all. The legacy chain
   * [`model/dao/SkuDAO.cfc:L154-L161`] has no final alternative, so an unmatched product type simply
   * leaves the statement as it was and every SKU of the product comes back. It does not raise, and
   * neither does this.
   *
   * @param product - the product whose SKUs are wanted
   * @param fetchOptions - when `true`, restrict to SKUs carrying the structure the base product type
   *   expects. Required (Discrepancy 5).
   * @returns the product's SKUs, with duplicates as the legacy produces them
   */
  public async findByProduct(product: Product, fetchOptions: boolean): Promise<Sku[]> {
    let sql = `SELECT ${SKU_PROJECTION} FROM ${SKU_TABLE} ${SKU_ALIAS} `;

    if (fetchOptions) {
      /*
       * Resolved inside the branch, as the legacy does [`model/dao/SkuDAO.cfc:L154`]: with the flag
       * lowered the base product type is never asked for, so the resolver is never consulted.
       *
       * The three discriminators are imported rather than written out. Their system codes and the
       * 32-character identifiers behind them are seeded data
       * [`config/dbdata/SlatwallProductType.xml.cfm:L13-L15`] and IR-7 keeps them in exactly one
       * place; a literal here would be a second, silently divergeable copy.
       */
      const baseProductType = await product.getBaseProductType(this.productTypeRootResolver);

      if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode) {
        sql +=
          `INNER JOIN ${OUT_OF_SCOPE_TABLE.skuAccessContent} sac ` +
          `ON sac.${OUT_OF_SCOPE_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} `;
      } else if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode) {
        sql +=
          `INNER JOIN ${SKU_OPTION_TABLE} so ` +
          `ON so.${SKU_OPTION_COLUMN.skuID} = ${SKU_ALIAS}.${SKU_COLUMN.skuID} `;
      } else if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode) {
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
    return mapRows(rows, mapSkuRow);
  }

  /**
   * Return a product's option-bearing SKU identifiers, ordered by their option selection.
   *
   * Ports `model/dao/SkuDAO.cfc:L172-L202`.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * THE ORDERING IS A BASE-10 ODOMETER, AND ITS DIRECTION IS LOAD-BEARING
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * Each SKU's options are collapsed into ONE number: every option contributes its own sort order
   * multiplied by a power of ten chosen from its GROUP's sort order, and the sum is what the rows are
   * ordered by. The exponent is `nextGroupSortOrder - group.sortOrder`, so a group with a LOWER sort
   * order gets a LARGER exponent and therefore a MORE SIGNIFICANT DIGIT. The result is that SKUs sort
   * as if their option selection were a multi-digit number read left to right in group order.
   *
   * ⚠️ ORDERING BY THE GROUP AND THEN BY THE OPTION IS NOT EQUIVALENT, and neither is reversing the
   * subtraction. A per-column ordering sorts on the FIRST group's option and breaks ties with the
   * second, which coincides with the odometer only while every SKU carries an option in every group;
   * reversing the subtraction inverts which group is significant. Both rewrites look like
   * simplifications and both change the returned order — which is the entire output of this member.
   *
   * ⚠️ THE EXPONENT'S MEMOIZED TERM IS A VALUE, SO IT IS BOUND. The legacy interpolates the memoized
   * number straight into the statement text [`model/dao/SkuDAO.cfc:L195`, `:L197`]. It is a number in
   * a value position, not an identifier, so it becomes a placeholder here (S2, TR-4). The base `10`
   * and the exponent's arithmetic are statement STRUCTURE and stay in the text.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L177` — the literal source TODO, carried verbatim:
   *
   *     TODO: test to see if this query works with DB's other than MSSQL and MySQL
   *
   * It is one of only three literal TODOs in the whole slice, and it is NOT resolved by this port.
   * The legacy branches on the configured database type [`:L194`] and emits a cast-wrapped variant for
   * one engine [`:L195`] and a plain one for the other [`:L197`]. The target runs on MySQL, so the
   * branch collapses to the plain form — declared here as a deliberate collapse. AAP §0.6.7.1 is
   * explicit that targeting one engine is "consistent with the untested state rather than a resolution
   * of it": the untested engines are still untested, and the TODO still stands.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L179-L188` — THIS QUERY RETURNS OPTION-BEARING SKUs ONLY, AND
   * THAT IS THE ROOT CAUSE OF D13. Three INNER joins carry the SKU through the link table, the option
   * and the option group, so a SKU with no options cannot appear. The two service members that consume
   * this result — `model/service/SkuService.cfc:L223-L232` and `:L252-L262` — search the sorted
   * identifiers for each SKU they hold and index the result of that search WITHOUT checking it, so for
   * any SKU missing from this list the search yields nothing and the indexed write fails. The defect
   * is annotated in the service, where the unguarded index lives; the cause is here, and it is not
   * repaired.
   *
   * ⚠️ TODO(parity) `model/entity/Option.cfc:L56` and `model/entity/OptionGroup.cfc:L58` — W4, A
   * LATENT NULL HAZARD, FLAGGED AND DELIBERATELY NOT FIXED. The option's sort order carries NO
   * required constraint while the option group's IS required — yet the option's is the MULTIPLICAND of
   * the ordering sum. In MySQL one null multiplicand makes that SKU's entire sum null, and the SKU then
   * sorts unpredictably relative to the rest. No null-coalescing wrapper and no null-excluding
   * predicate is added: either would change which rows come back or in what order, and AAP §0.7.3 S7
   * requires the hazard be recorded rather than repaired.
   *
   * ⚠️ NOTE THE NAMING CONTRAST WITHIN THE LEGACY COMPONENT. This statement correctly uses PHYSICAL
   * table names [`model/dao/SkuDAO.cfc:L179-L211`] while the search member thirty lines earlier uses
   * mapping-layer names in an equally native statement [`:L132`, `:L135`]. That contrast IS D22, and it
   * is why every identifier in this file is resolved through the whitelist rather than derived by
   * transforming the legacy text.
   *
   * The return type is TIGHTENED from the legacy record set to an ordered array of identifiers (TR-1).
   * Justified by the consumers: both read only the row count and the identifier column
   * [`model/service/SkuService.cfc:L228-L229`, `:L256-L257`], so nothing observes the record set's
   * other capabilities. ROW ORDER IS THE ENTIRE POINT of the member and is preserved as returned.
   *
   * @param productID - the product whose SKU identifiers are wanted
   * @returns the option-bearing SKU identifiers, in odometer order
   * @throws {DataIntegrityError} when a returned row carries no usable identifier
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
   * Ports `model/dao/SkuDAO.cfc:L222-L226`.
   *
   * ⚠️ TODO(parity) `model/dao/SkuDAO.cfc:L223` — D7: THE GUARD IS INVERTED, SO THIS MEMBER IS A
   * GUARANTEED NO-OP, AND THE INVERSION IS REPRODUCED RATHER THAN CORRECTED. The legacy deletes the
   * memo only when the memo is ABSENT — that is, only in the one case where there is nothing to
   * delete. When a value has been memoized, the guard fails and the value survives. So the memo is
   * never actually cleared by the member whose whole purpose is to clear it.
   *
   * It is inert twice over: a repository-wide search finds NO caller at all, in any layer. Fixing the
   * guard would therefore change nothing that anything observes today, and would change the ordering
   * of {@link MySqlSkuRepository.findSortedSkuIdsByProduct} the moment a caller appeared. AAP §0.7.3
   * S7 and Guideline 4 both require it be preserved and annotated, and TR-5 requires the member remain
   * on the port rather than being quietly dropped for being useless.
   *
   * SYNCHRONOUS, because the legacy declares no return value and performs no I/O — nothing here is
   * awaited and nothing needs to be.
   */
  public clearOptionGroupSortOrderCache(): void {
    /*
     * The inverted condition, kept exactly: clear only when there is nothing to clear. Written as the
     * unset of an already-unset value so the no-op is explicit rather than an empty branch, and so a
     * reader can see that the assignment IS reached — on the one path where it has no effect.
     */
    if (this.optionGroupSortOrderMemo.value === undefined) {
      this.optionGroupSortOrderMemo.value = undefined;
    }
  }

  /**
   * Write a SKU and its option links, without committing.
   *
   * Replaces the framework's implicit flush. The legacy never calls a persist member: the mapping
   * layer tracks the entity, decides insert against update from its own session state, and emits the
   * statements at flush time. AAP §0.6.6 M5 records that there is no request-end hook to flush at in a
   * stateless invocation, so the decision and the statements are made explicit here.
   *
   * ⚠️ THIS MEMBER DOES NOT COMMIT, AND MUST NOT. The transaction is opened and closed by the caller —
   * `src/services/SkuService.ts` writes each SKU immediately after validating it and before validating
   * the next one, so a failed batch is discarded by the caller's rollback. Committing here would make
   * each SKU independently durable and turn a rejected batch into a partial catalogue.
   *
   * ⚠️ AND IT IS WHAT MAKES M6 WORK. The uniqueness rule at `model/entity/Sku.cfc:L756-L769` runs the
   * option resolver against SKUs this member has already written but not committed. That only holds
   * because writes and reads share the injected executor, hence the single-executor design at
   * {@link SkuStatementExecutor}. The option LINKS are written here too, and they have to be: the
   * resolver matches on the link table, so a SKU inserted without its links would be invisible to the
   * very rule that must see it.
   *
   * WHY AN EXISTENCE PROBE, AND NOT THE TWO OBVIOUS ALTERNATIVES. Insert-or-update in one statement
   * decides on ANY unique key, and the SKU code is unique [`model/entity/Sku.cfc:L54`], so a row whose
   * code collides with a DIFFERENT SKU would be silently rewritten instead of rejected — strictly
   * worse than an extra round trip. Update-then-insert-if-nothing-changed is also unsound, because an
   * update that sets a row to the values it already holds reports zero affected rows and would provoke
   * a duplicate insert. A probe is deterministic and says what it means.
   *
   * ⚠️ NO IDENTIFIER IS GENERATED HERE. Identifiers are 32-character values assigned in application
   * code (IR-6), and this member neither returns nor assigns one — so a SKU still carrying the unsaved
   * sentinel [`model/entity/Sku.cfc:L52`, whose mapping declares an empty unsaved value] cannot be
   * written and is reported rather than silently given an identifier. TR-5 requires the gap be
   * surfaced, not swallowed.
   *
   * Audit columns are written exactly as the entity carries them. Stamping created and modified values
   * is the entity lifecycle's job, not the adapter's, and duplicating it here would produce two
   * disagreeing implementations of one rule.
   *
   * @param sku - the SKU to write, with its options attached
   * @throws {DomainError} when the SKU carries no identifier
   */
  public async persistSku(sku: Sku): Promise<void> {
    if (sku.isNew() || sku.skuID === SKU_UNSAVED_ID_VALUE) {
      throw new DomainError('A SKU cannot be written before it has been assigned an identifier.', {
        context: { skuCode: sku.skuCode },
      });
    }

    const skuIdentifier = sku.skuID;

    /*
     * Column values in the order of {@link SKU_COLUMN}, minus the identifier, which is handled
     * separately because the insert lists it and the update matches on it.
     *
     * Absent optional fields become null rather than being omitted: a partial column list on insert
     * would let the database apply its own defaults, which is a different behaviour from writing the
     * absence the entity actually holds.
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
      /* The foreign keys are read from the associations, mirroring the mapping declarations at
       * `model/entity/Sku.cfc:L65` and `:L66`. */
      sku.product?.productID ?? null,
      sku.subscriptionTerm?.subscriptionTermID ?? null,
      sku.remoteID ?? null,
      sku.createdDateTime ?? null,
      sku.createdByAccount ?? null,
      sku.modifiedDateTime ?? null,
      sku.modifiedByAccount ?? null,
    ];

    const probeSql = `SELECT ${SKU_COLUMN.skuID} FROM ${SKU_TABLE} WHERE ${SKU_COLUMN.skuID} = ?`;
    const existingRows = await this.executor.execute(probeSql, [skuIdentifier]);
    const skuRowAlreadyExists = existingRows.length > 0;

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
     * The option links, written after the row itself — the order the mapping layer flushes in, and the
     * only order that works, since the link rows reference the SKU.
     *
     * The delete is issued only when the row PRE-EXISTED. A fresh insert has no links to replace, and
     * the mapping layer likewise issues no collection delete for an entity it has just inserted.
     *
     * The option list is written as the entity holds it, in order and WITHOUT deduplication: a
     * repeated option is a data fault the link table's own key is entitled to reject, and silently
     * collapsing it here would hide the fault from the caller that created it.
     */
    if (skuRowAlreadyExists) {
      await this.executor.executeMutation(
        `DELETE FROM ${SKU_OPTION_TABLE} WHERE ${SKU_OPTION_COLUMN.skuID} = ?`,
        [skuIdentifier],
      );
    }

    const options = sku.getOptions();
    if (options.length > 0) {
      const linkPlaceholders = options.map(() => '(?, ?)').join(', ');
      const linkValues: unknown[] = [];
      for (const option of options) {
        linkValues.push(skuIdentifier, option.optionID);
      }
      await this.executor.executeMutation(
        `INSERT INTO ${SKU_OPTION_TABLE} ` +
          `(${SKU_OPTION_COLUMN.skuID}, ${SKU_OPTION_COLUMN.optionID}) VALUES ${linkPlaceholders}`,
        linkValues,
      );
    }
  }

  /**
   * Resolve the exponent seed the sorted-SKU ordering multiplies by, memoizing it for the request.
   *
   * Ports `model/dao/SkuDAO.cfc:L204-L220`, which is `access="private"` in the legacy component and
   * stays private here — it is not part of {@link SkuRepository}.
   *
   * ⚠️ M7 — THE MEMO IS REQUEST-SCOPED, AND THE LEGACY AGGREGATE IS WHY IT HAS TO BE. The cached
   * statement [`model/dao/SkuDAO.cfc:L210-L212`] is a WHOLE-TABLE MAXIMUM over the option-group sort
   * order: it takes NO parameters and applies NO product scoping of any kind, so the cached number is a
   * property of the entire option-group table rather than of the product being sorted. Held in the
   * legacy component's own scope [`:L51`] on a singleton DAO, it lives for the life of the application.
   *
   * Carry that into a reused function container and the value crosses invocation boundaries: one
   * caller's maximum silently sets the digit weighting of a later, unrelated caller's SKU ordering,
   * with no exception, no log line and nothing that fails. AAP §0.6.6 requires the memo be scoped to
   * the request instead, so it lives in an injected holder whose lifetime the composition root owns
   * — see {@link OptionGroupSortOrderMemo}. There is no module-level cache in this file, and no
   * accumulating field on the repository either, since the repository is itself a singleton and an
   * instance field would reintroduce exactly the same bleed.
   *
   * The seed is `1` [`model/dao/SkuDAO.cfc:L206`] and the resolved value is the maximum plus one
   * [`:L214`]. Both numbers are the legacy's; neither is a tuning choice.
   *
   * ⚠️ THE LEGACY GUARD ON THAT ASSIGNMENT CANNOT FAIL. `model/dao/SkuDAO.cfc:L213` tests the row
   * count of a bare aggregate, which always returns exactly one row, so the branch is always taken and
   * the seed is always overwritten. When the option-group table is EMPTY the maximum comes back null
   * and the legacy would attempt arithmetic on it. This port keeps the seed in that case — the value
   * the line immediately above establishes — and the choice is unobservable: an empty option-group
   * table means no options and therefore no link rows, so the ordering this feeds returns no rows at
   * all whatever the exponent seed is.
   *
   * @returns the memoized exponent seed for this request
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
