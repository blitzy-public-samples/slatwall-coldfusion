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
 * identifier: D22's register home is `../../ports/repositories/SkuRepository`, which is where it is
 * DEFINED, and this file is where it is DISCHARGED (AAP §0.7.3 S7). Neither register is extended
 * here.
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
 * whitelist admits the six in-scope entity tables plus the SKU-option link table, refuses everything
 * else, and states the division of responsibility for exactly this case: "the repository that meets
 * that join is answerable for flagging it". This file is that repository, so:
 *
 * ⚠️ ONE NAME SITS IN BOTH LISTS, AND THIS FILE DOES NOT USE THE WHITELISTED FORM.
 * `SwAlternateSkuCode` appears in the whitelist as an eighth entry — the paginated dynamic-query
 * builder needs it as a join target for the third base join of `model/service/SkuService.cfc:L316` —
 * yet the SKU-code fallback below reaches it through an authored out-of-scope literal instead, because
 * that statement is composed here from no caller input at all — the legacy spells it as HQL over
 * `ss.alternateSkuCodes` at `model/dao/SkuDAO.cfc:L103`, and the ported form is a native join over a
 * family AAP §0.2.2.1 excludes. Both routes are deliberate
 * and the duplication is stated rather than tidied away: see the reconciliation on the whitelist
 * declaration in `QueryRunner.ts`. So the sentence above says "six plus the link table" and not
 * "seven": the eighth name exists, and pretending otherwise here would be the false statement.
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
import type { BoundedReadResult, BoundedReadWindow } from '../../ports/repositories/BoundedRead';
import type { SkuRepository, SkuRow, SkuSearchRow } from '../../ports/repositories/SkuRepository';
import type { PhysicalTableName, SqlMutationExecutor } from './QueryRunner';
import {
  assertColumnName,
  assertTableName,
  prepareBoundedRead,
  settleBoundedRead,
} from './QueryRunner';
import { attachFetchedSkuAssociations } from './catalogAggregates';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../domain/base/AuditableEntity';
import type { AccountContextPort } from '../../ports/AccountContextPort';
import type { MySqlRow } from './rowMappers';
import { mapOptionGroupRow, mapOptionRow, mapRows, mapSkuRow, mapSkuSearchRow } from './rowMappers';

/* ================================================================================================
 * IN-SCOPE PHYSICAL IDENTIFIERS — RESOLVED THROUGH THE WHITELIST, NEVER WRITTEN AS BARE TEXT
 * ============================================================================================== */

/** `SwSku` — `model/entity/Sku.cfc:L49`. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwSkuOption`, the owning side's link table — `model/entity/Sku.cfc:L76`. */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/**
 * The other three link tables `model/entity/Sku.cfc` owns — `:L77`, `:L78` and `:L79`.
 *
 * ⚠️ ALL FOUR OF THE SKU'S MANY-TO-MANY COLLECTIONS ARE OWNED BY THIS ENTITY, so all four link rows are
 * this adapter's to write. Only the option table was named here originally, which meant three of the
 * four collections were silently discarded on every save: the entity accepted them, `createSkus`
 * populated them from the subscription and content-access branches, validation reported on them, and the
 * rows were never written. A later read reconstructed a SKU with three empty collections and nothing
 * anywhere reported a loss.
 *
 * ⚠️ THE FAR ENTITIES ARE OUT OF SCOPE AND THAT DOES NOT CHANGE THE OWNERSHIP. Nothing here reads or
 * writes `SwContent` or `SwSubscriptionBenefit`; what is written is the LINK ROW, whose owning side is
 * `SwSku`. The far column carries a 32-character identifier the port already models as a plain
 * reference (`AccessContentReference`, `SubscriptionBenefitReference`), so no excluded entity is
 * hydrated, constructed or queried.
 *
 * ⚠️ THE ABBREVIATION IN TWO OF THE THREE NAMES IS VERBATIM. `SwSkuSubsBenefit` and
 * `SwSkuRenewalSubsBenefit` abbreviate "Subscription" where their far COLUMN does not; both spellings
 * come straight from the `linktable` and `inversejoincolumn` attributes and neither may be regularised.
 */
const SKU_ACCESS_CONTENT_TABLE = assertTableName('SwSkuAccessContent');

/** `model/entity/Sku.cfc:L78` — `subscriptionBenefits`. */
const SKU_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuSubsBenefit');

/** `model/entity/Sku.cfc:L79` — `renewalSubscriptionBenefits`. A DIFFERENT table, the same far column. */
const SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuRenewalSubsBenefit');

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

/**
 * The three remaining link tables, each as its own owning and far column pair.
 *
 * ⚠️ THE FAR COLUMN OF THE CONTENT LINK IS `contentID`, NOT `accessContentID`. The collection is named
 * for the ROLE it plays on the SKU while the column names the entity it points at
 * (`model/entity/Sku.cfc:L77`, `inversejoincolumn="contentID"`), so deriving the column from the
 * property name would produce a column that does not exist. The whitelist would refuse it, which is the
 * gate working — but only if the correct name is written here in the first place.
 *
 * ⚠️ THE TWO BENEFIT LINKS SHARE A FAR COLUMN NAME AND THAT IS CORRECT. Both point at the same entity
 * and are distinguished by their TABLE alone, so a SKU may legitimately carry one benefit identifier in
 * both roles and the two rows live in two different tables. Reading this as a duplication to collapse
 * would merge two distinct associations.
 */
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

/**
 * The `SwOption` and `SwOptionGroup` columns {@link MySqlSkuRepository.hydrateSkuOptions} selects.
 *
 * ⚠️ THIS IS A SEPARATE REGISTRY FROM {@link OPTION_COLUMN} AND {@link OPTION_GROUP_COLUMN} ON PURPOSE.
 * Those two exist for the odometer ordering and name only the three columns it multiplies; this one
 * names every column its mapper reads, because a partially selected row would hand the mapper an
 * `undefined` where the table has a value and the entity would come back missing fields the legacy
 * hydrates. Merging the two registries would silently couple the ordering query to the hydration
 * query, and either one growing a column would change the other's statement.
 *
 * Every name is still routed through `assertColumnName`, so a column that is not registered for its
 * table in `QueryRunner.ts` fails at module load rather than at query time.
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

/**
 * The prefix that keeps `SwOptionGroup`'s columns from colliding with `SwOption`'s.
 *
 * ⚠️ `sortOrder`, `remoteID` and all four audit columns exist on BOTH tables. `rowMappers.ts` RULE 2
 * states that a joining repository must split or alias before handing a row to a mapper, and this
 * prefix plus the explicit row rebuild in {@link MySqlSkuRepository.hydrateSkuOptions} is how that is
 * done. Without it the option's `sortOrder` and the group's `sortOrder` would be one column and the
 * loser would be decided by the driver's key order.
 */
const HYDRATION_GROUP_PREFIX = 'optionGroup_';

/**
 * The alias under which the LINK table's `skuID` is returned.
 *
 * It is aliased rather than selected bare because `SwSku`, `SwSkuOption` and several out-of-scope
 * tables all carry `skuID`; a distinct name makes the owner key unambiguous no matter what else the
 * projection grows.
 */
const HYDRATION_KEY_COLUMN = 'hydrationOwnerSkuID';

/** A single positional placeholder. Values only — `?` cannot substitute an identifier (TR-4, S2). */
const BIND_PLACEHOLDER = '?';

/** The separator between placeholders in an `IN` list. Structure, never bound. */
const CLAUSE_JOINER = ', ';

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
  /** `model/entity/Sku.cfc:L78` `linktable="SwSkuSubsBenefit"` — the subscription fetch branch, `model/dao/SkuDAO.cfc:L160`. */
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
  /**
   * `model/entity/AlternateSkuCode.cfc:L57`, `model/entity/Sku.cfc:L77` (`SwSkuAccessContent`) and
   * `:L78` (`SwSkuSubsBenefit`) — all keyed by SKU, all declaring `fkcolumn="skuID"`.
   *
   * The neighbouring `:L79` is deliberately NOT cited: it declares `renewalSubscriptionBenefits`
   * over the DIFFERENT link table `SwSkuRenewalSubsBenefit`, which no member of this adapter joins.
   * `../../ports/SubscriptionTermPort` is the module that legitimately cites `:L79`.
   */
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
 * The statement-execution surface this adapter needs: the read-plus-write pair, under a local name.
 *
 * ⭐ AN ALIAS OF {@link SqlMutationExecutor}, NOT A SECOND DECLARATION OF THE SAME SHAPE. `QueryRunner.ts`
 * declares the pair once — `execute` for reads, `executeMutation` for writes, both bound to whatever
 * connection the object was built over — and every `TransactionScope` hands one out. An earlier revision
 * widened the read-only `SqlExecutor` privately here, and two sibling adapters did the same, with the
 * result that NO transaction scope satisfied any of the three and the only executor that fitted them was
 * the pool-backed `QueryRunner`. Naming the shared declaration instead is what makes the M6 requirement
 * below a fact the compiler checks.
 *
 * ⚠️ ONE executor, not two, AND THAT IS WHAT MAKES M6 WORK. `Sku.hasUniqueOptions()`
 * [`model/entity/Sku.cfc:L756-L769`] is a declarative validation rule that EXECUTES
 * {@link MySqlSkuRepository.findSkusBySelectedOptions} while a batch of sibling SKUs is being written,
 * so the read must observe the writes the same transaction has already issued and not yet committed.
 * Splitting reads and writes across two executors, or reaching past the injected one to a pool, breaks
 * that visibility silently — no error, no failing statement, just a different answer. The write member
 * is required for the same reason it exists in the shared declaration: the read member normalises a
 * driver result into rows and raises when the driver answers with a write acknowledgement, so it cannot
 * carry {@link SkuRepository.persistSku}'s statements. That write pair is the port of the legacy
 * `save()`/`delete()` members at `org/Hibachi/HibachiDAO.cfc:L48-L77`.
 *
 * Nothing in this file constructs a connection or a pool, and nothing here commits — the transaction is
 * opened and closed by the caller.
 */
export type SkuStatementExecutor = SqlMutationExecutor;

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

/**
 * The one object that satisfies BOTH entity-level transaction-existence contracts.
 *
 * `SkuTransactionExistenceChecker` in `../../domain/sku/Sku` and
 * `ProductTransactionExistenceChecker` in `../../domain/product/Product` are declared separately —
 * neither entity module imports the other for it — but they are structurally identical, so one
 * instance serves both. Intersecting them here is what makes that claim checked rather than asserted:
 * the factory below cannot compile unless its result really does satisfy both.
 */
export type TransactionExistenceChecker = SkuTransactionExistenceChecker &
  ProductTransactionExistenceChecker;

/**
 * Adapt {@link SkuRepository.transactionExists} to the caller-ordered checker the two entities take.
 *
 * ⭐ D23 — THIS IS THE ARGUMENT CROSSING, AND IT EXISTS BECAUSE THE TWO LAYERS ARE ORDERED
 * DIFFERENTLY ON PURPOSE. The entity-level contract is CALLER-ordered, `(skuID?, productID?)`, because
 * that is the order the legacy call sites read in — `model/entity/Sku.cfc:L594` names `skuID=` and
 * `model/entity/Product.cfc:L626` names `productID=`. The repository member is DAO-ordered,
 * `(productID?, skuID?)`, because `model/dao/SkuDAO.cfc:L54-L55` declares `productID` first. AAP 0.4.2.6
 * pins the second order and AAP 0.4.2.2 Discrepancy 4 pins the zero-argument service signature that
 * sits between them, so neither order may be "tidied" to remove this function.
 *
 * ⛔ WITHOUT IT THE ONLY BINDING AVAILABLE WAS THE WRONG ONE. `SkuService.getTransactionExistsFlag`
 * declares zero arguments, and TypeScript accepts a lower-arity function wherever a higher-arity one is
 * expected — so binding the service to either checker compiled and then discarded the identifier the
 * entity had just supplied, leaving the DAO's else-branch to answer a wider question than the caller
 * asked. Both flags gate DELETES (`model/validation/Sku.json` and `model/validation/Product.json:L12`),
 * so the substitution is destructive in both directions and reports nothing. The `argumentOrder` member
 * both contracts now require is what turns that mis-binding into a compile error; this function is what
 * makes the correct binding available in production rather than only in test support.
 *
 * ⚠️ IT LIVES BESIDE `transactionExists` FOR A REASON THAT TYPES CANNOT COVER. Both identifiers are
 * 32-character strings (IR-6), so a crossing written backwards type-checks perfectly and silently
 * queries the wrong column. No brand can distinguish them. The mitigation is therefore structural and
 * behavioural rather than nominal: the crossing exists in exactly ONE place, immediately below the
 * implementation whose order it inverts, and order assertions — not the compiler — are what hold it.
 *
 * ⚠️ NEITHER IDENTIFIER IS DEFAULTED OR VALIDATED HERE. Passing both is the caller's business and the
 * DAO's precedence rule decides the outcome: `skuID` WINS when both are present
 * [model/dao/SkuDAO.cfc:L58-L64]. Supplying neither reaches the same failure the legacy reaches at
 * [`:L90`], which `SkuRepository.transactionExists` documents and keeps — this function does not
 * pre-empt it with a guard, because pre-empting would move a legacy failure to a new place.
 *
 * @param repository - Narrowed to the single member used, so a test double or any other
 *   {@link SkuRepository} implementation can be adapted without depending on this file's MySQL parts.
 * @returns A checker both `Sku.getTransactionExistsFlag` and `Product.getTransactionExistsFlag` accept.
 */
export function createTransactionExistenceChecker(
  repository: Pick<SkuRepository, 'transactionExists'>,
): TransactionExistenceChecker {
  return {
    argumentOrder: 'skuID-first-productID-second',
    /* THE CROSSING: caller slot 1 (`skuID`) becomes DAO slot 2, caller slot 2 (`productID`) becomes
     * DAO slot 1. Reading this line as `transactionExists(skuID, productID)` is the mistake it exists
     * to prevent. */
    getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> =>
      repository.transactionExists(productID, skuID),
  };
}

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

/**
 * The alias the existence chain's scalar verdict is projected under.
 *
 * The legacy projected `count(ss.skuID) as transactionCount` [`model/dao/SkuDAO.cfc:L57`]. This port
 * projects an existence flag instead — see {@link MySqlSkuRepository.transactionExists} for why that
 * is answer-preserving — so the alias is named for what it now carries rather than for the aggregate
 * it replaced. The alias is internal to the statement and its reader: no caller sees it, no test
 * asserts it, and the legacy read its own aggregate positionally rather than by name.
 */
const TRANSACTION_EXISTS_ALIAS = 'transactionExists';

/**
 * Composes the SKU-code search statement and its bound values — the whole of
 * `model/dao/SkuDAO.cfc:L130-L148` except the execution and the row mapping.
 *
 * EXTRACTED SO THE UNBOUNDED AND BOUNDED MEMBERS SHARE ONE TRANSLATION. Both
 * {@link MySqlSkuRepository.searchByProductType} and
 * {@link MySqlSkuRepository.searchByProductTypeBounded} must apply the same predicate, the same
 * wildcard wrapping, the same list splitting, the same two differently-strict guards and the same bind
 * order. Two copies would be two chances for the pair to diverge — and a divergence here is silent,
 * because both members return the same row type and neither would fail to compile. Everything below is
 * the original translation, moved verbatim rather than rewritten; the bounded member appends its
 * window to the returned text and its two values to the returned array, and touches nothing else.
 *
 * @param term - the bare search fragment. Optional in the signature and read unguarded by the legacy.
 * @param productTypeID - comma-delimited product-type identifiers, despite the singular legacy name.
 * @returns the statement text and its bound values, in legacy positional order (TR-4).
 * @throws {DomainError} when the term is omitted, reproducing the `model/dao/SkuDAO.cfc:L133`
 *   failure, or when a supplied product-type list yields no segments.
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

  return { sql, params };
}

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
  /**
   * @param executor - Issues every statement this adapter composes.
   * @param optionGroupSortOrderMemo - The request-scoped sort-order memo, per M7.
   * @param productTypeRootResolver - Walks a product type to its root, for the base-type discriminator.
   * @param accountContext - Resolves the acting account for the audit block {@link
   *   MySqlSkuRepository.persistSku} stamps. Required rather than optional: the legacy write always
   *   reached the framework audit block at `org/Hibachi/HibachiEntity.cfc:L598-L649`, so a write seam
   *   that could not name an actor could not reproduce it. The port answers `undefined` for an
   *   unauthenticated request and the stamping functions accept that, so "nobody is acting" is a
   *   legitimate ANSWER rather than a missing collaborator.
   */
  public constructor(
    private readonly executor: SkuStatementExecutor,
    private readonly optionGroupSortOrderMemo: OptionGroupSortOrderMemo,
    private readonly productTypeRootResolver: MySqlSkuRepositoryProductTypeRootResolver,
    private readonly accountContext: AccountContextPort,
  ) {}

  /**
   * Returns an equivalent {@link MySqlSkuRepository} bound to a DIFFERENT statement executor.
   *
   * ⭐ THIS IS THE FIX FOR REVIEW FINDING 2, AND THE DEFECT IT CLOSES WAS STRUCTURAL. Every repository
   * in this folder captures its executor at construction, which is correct — but while that was the ONLY
   * way to supply one, an executor chosen at construction time was necessarily the POOL-bound one, and
   * no later act could change it. Wrapping a service call in `UnitOfWork.run` therefore did nothing
   * useful: the boundary acquired a connection, began a transaction, and handed out a scope executor
   * that this class had no way to adopt, so every read and write still went to the pool and straight out
   * of the transaction. Rollback-on-errors and M6's same-connection read-back visibility were
   * unreachable no matter how the graph was wired.
   *
   * Re-binding closes that. Inside a boundary a caller re-binds this repository to `scope.executor` and
   * uses the result for the duration of the boundary; every statement the returned instance issues then
   * runs on the connection the boundary owns.
   *
   * ⚠️ A NEW INSTANCE, NOT A MUTATION, AND THE DIFFERENCE IS THE POINT. The captured executor stays
   * `private readonly` and this method never reassigns it, so the pool-bound instance a composition root
   * built is still valid and still pool-bound after the call. Mutating it in place would make the
   * repository's connection depend on WHEN it was used rather than on WHICH instance was used — an
   * ambient current-transaction slot in all but name, which is exactly what
   * `src/adapters/mysql/UnitOfWork.ts` refuses to keep (M7, AAP 0.7.3 S3). Two concurrent boundaries on
   * one warm container get two instances and cannot observe each other's connection.
   *
   * ⚠️ IT IS NOT ON THE PORT INTERFACE, AND MUST NOT BE PUT THERE. A service may not know that a
   * statement executor exists at all (AAP 0.7.3 S2 inverted), so re-binding is exposed on the CONCRETE
   * adapter and used only by the layer that already holds concrete adapters. Adding it to the port would
   * leak the persistence mechanism into `src/services/**`.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns A new instance identical in every other respect.
   */
  public withExecutor(executor: SkuStatementExecutor): MySqlSkuRepository {
    /*
     * The memo travels ACROSS the re-binding rather than being re-created. It is request-scoped (M7) and
     * a transaction sits INSIDE a request, so a boundary that started its own memo would re-read a sort
     * order the same invocation had already resolved — and `model/dao/SkuDAO.cfc:L204-L220` memoises
     * exactly to avoid that. The product-type root resolver is stateless and travels for the same reason
     * the executor does not: nothing about it is connection-bound.
     */
    return new MySqlSkuRepository(
      executor,
      this.optionGroupSortOrderMemo,
      this.productTypeRootResolver,
      this.accountContext,
    );
  }

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
   * TODO(parity) `model/dao/SkuDAO.cfc:L93-L95` — THE LEGACY READS ITS SCALAR ROW UNGUARDED. It
   * indexes the first element of the result and compares it to zero without checking that a row came
   * back or that the value is numeric. A single-row scalar select does return one row, so the read
   * happens to be safe; it is unguarded all the same. This port guards it, because
   * `noUncheckedIndexedAccess` types the read as possibly absent and the honest response to that is a
   * narrowing check, not a non-null assertion. The behaviour on the normal path is identical.
   *
   * Discrepancy 4, resolved one layer up as carried defect D23 and recorded here because this member
   * is the thing that raises. `model/service/SkuService.cfc:L285` declares the SERVICE member with NO
   * arguments at all, while its real callers pass one by name — `model/entity/Sku.cfc:L594` passes the
   * SKU identifier and `model/entity/Product.cfc:L626` passes the product identifier — and CFML's
   * argument-collection forwarding at `L286` carries the undeclared name through to the DAO. A literal
   * zero-arity transcription of the service member DELETES that forwarding, so both delete guards
   * would reach this method with neither identifier bound and take the `DomainError` below. The
   * service therefore declares `(skuID?, productID?)` and forwards them here. This repository is
   * unchanged by that: it keeps both optional identifiers because the DAO declares both
   * [`model/dao/SkuDAO.cfc:L54-L55`], untyped and not required, and it still raises when neither
   * arrives — which is precisely the legacy behaviour of a genuinely argument-free invocation.
   *
   * @param productID - the product whose SKUs are tested. Used only when no SKU identifier is given.
   * @param skuID - the SKU tested. Takes precedence whenever it is supplied.
   * @returns `true` when at least one transaction references the selection
   * @throws {DomainError} when neither identifier is supplied
   * @throws {DataIntegrityError} when the probe does not come back as a single numeric row
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

    /*
     * ⚠️ A SCALAR EXISTENCE VERDICT WHERE THE LEGACY COUNTED EVERY MATCH. Structural, and provably
     * answer-preserving from the legacy body rather than by argument. `model/dao/SkuDAO.cfc:L57`
     * projects `count(ss.skuID) as transactionCount`, and `:L93-L97` is the ONLY thing that ever reads
     * it: `results[1] eq 0` returns false, and anything else returns true. The magnitude is never
     * read, never returned and never compared to any other number, so the count's only contribution
     * was its non-zeroness. `skuID` is the primary key and cannot be null, so `COUNT(ss.skuID)` is a
     * count of matching rows and is non-zero on exactly the selections `EXISTS` reports as 1 — the two
     * projections agree on every input, including the empty selection, where both yield the false
     * branch.
     *
     * WHAT THE SHAPE PRESERVES, DELIBERATELY. The disjunction is still {@link
     * TRANSACTION_EXISTS_CHAIN} verbatim, still all ten disjuncts in legacy order, still one statement
     * and one round trip per AAP §0.4.1.7, and still exactly one placeholder. It still returns exactly
     * ONE ROW for every input, because a scalar `SELECT EXISTS(...)` with no FROM clause of its own
     * does, just as an unaggregated-group `COUNT` does — which is what keeps BOTH guards below
     * meaningful rather than turning either into dead code. What changes is that the engine may stop
     * at the first SKU satisfying the chain instead of walking every one of them.
     *
     * NO `LIMIT`, NO `ORDER BY` AND NO OTHER INVENTED CLAUSE. `EXISTS` already carries the one-row
     * stop in its own definition, so nothing has to be added to obtain it (AAP §0.7.3 S9).
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
    const sku = mapSkuRow(row);
    await this.hydrateSkuOptions([sku]);
    return sku;
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
    const { sql, params } = composeSkuSearch(term, productTypeID);

    const rows = await this.executor.execute(sql, params);
    return mapRows(rows, mapSkuSearchRow);
  }

  /**
   * The windowed form of {@link MySqlSkuRepository.searchByProductType}.
   *
   * The predicate, the wildcard wrapping, the list splitting, both guards and the bind order are not
   * re-implemented: {@link composeSkuSearch} composes them ONCE for both members, so the two cannot
   * drift into answering different questions. Everything this member adds is appended after that.
   *
   * ⚠️ THE PROBE IS BOUND, NOT INTERPOLATED. `LIMIT ? OFFSET ?` carries two more placeholders, bound
   * LAST — after the term and after any product-type identifiers — so the legacy bind order (TR-4) is
   * untouched and the window occupies positions the legacy statement never used. Writing the numbers
   * into the statement text would put caller-supplied values in the text, which S2 forbids even when
   * they have been validated.
   *
   * ⚠️ THE ROWS ARE MAPPED BEFORE THE WINDOW IS SETTLED, and the order matters. The probe row is
   * discarded by {@link settleBoundedRead} after mapping, which costs one extra row's hydration and
   * buys a guarantee: {@link mapSkuSearchRow} refuses a row whose projection has drifted, so the probe
   * row is validated exactly like every other row rather than being trusted because it is about to be
   * dropped. Discarding first would let a malformed final row through unnoticed.
   *
   * @param window - the caller's ceiling and zero-based offset; validated, never defaulted.
   * @param term - bare SKU-code fragment. Omitting it raises, exactly as on the unbounded member.
   * @param productTypeID - comma-delimited product-type identifiers, despite the singular name.
   * @returns the window's rows and whether a further match lies past it.
   * @throws {DomainError} for an unusable window, an omitted term, or a product-type list with
   *   segments that all vanish under list splitting.
   */
  public async searchByProductTypeBounded(
    window: BoundedReadWindow,
    term?: string,
    productTypeID?: string,
  ): Promise<BoundedReadResult<SkuSearchRow>> {
    const bound = prepareBoundedRead(window, 'MySqlSkuRepository.searchByProductTypeBounded');
    const { sql, params } = composeSkuSearch(term, productTypeID);

    const rows = await this.executor.execute(`${sql} limit ? offset ?`, [
      ...params,
      ...bound.boundValues,
    ]);

    return settleBoundedRead(mapRows(rows, mapSkuSearchRow), bound.limit);
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

    /* Retained beyond the branch below so the eager fetch can reuse it without resolving twice. */
    let baseProductType: string | undefined;

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
      baseProductType = await product.getBaseProductType(this.productTypeRootResolver);

      /*
       * ⭐ THE LEGACY CHAIN AT [`model/dao/SkuDAO.cfc:L154-L161`] COMPARES WITH CFML `==`, WHICH FOLDS
       * CASE, so a `SwProductType` row holding `Merchandise` DID receive the option join. `===` against
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
    const skus = mapRows(rows, mapSkuRow);

    /*
     * THE `FETCH` HALF OF `INNER JOIN FETCH`, WHICH THE JOINS ABOVE ARE ONLY THE FIRST HALF OF.
     *
     * Every branch above is `INNER JOIN FETCH` in the legacy [`model/dao/SkuDAO.cfc:L155`, `:L157`,
     * `:L160`], and that keyword does two things: it restricts the result set, which the joins reproduce,
     * and it POPULATES the association on the returned entities, which they do not. Emitting the joins
     * without the fetch produced the right NUMBER of SKUs — duplicates and all — carrying empty
     * collections, so every member that reads one answered from an empty array instead of raising.
     * `getOptionsDisplay` returned the empty string, `getSkuDefinition` returned nothing, and
     * `getOptionsIDList` returned no identifiers, none of them reporting a thing.
     *
     * Gated on the same flag as the joins, and reusing the base product type already resolved above so a
     * second resolver round trip is not made. With the flag lowered `baseProductType` is `undefined`,
     * exactly as the legacy never asks for it, and the fetch is skipped.
     */
    if (fetchOptions) {
      await attachFetchedSkuAssociations(this.executor, skus, baseProductType);
    }

    return skus;
  }

  /**
   * Fill the `options` collection of every supplied SKU, and the `optionGroup` of every option
   * loaded, from `SwSkuOption` -> `SwOption` -> `SwOptionGroup`.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════════
   * WHY THIS EXISTS, AND WHY IT LIVES HERE RATHER THAN IN A ROW MAPPER
   * ═══════════════════════════════════════════════════════════════════════════════════════════════
   * `rowMappers.ts` RULE 3 leaves every association UNRESOLVED, and that rule is not being weakened
   * here. Its own text states the licence this member uses verbatim: *"The foreign-key value is not
   * lost either — the repository holds the same row and reads the `*ID` column itself when it needs
   * to resolve the other side."* This is the repository doing exactly that, in a SECOND statement,
   * for a relationship whose absence is otherwise observable.
   *
   * The absence WAS observable, in three separate places:
   *
   *   1. `Sku.getOptionsDisplay` / `getSkuDefinition` / `getOptionsIDList` iterate `getOptions()`
   *      [`model/entity/Sku.cfc:L236`], so an empty collection renders an empty definition where the
   *      legacy renders the option names.
   *   2. `Sku.hasUniqueOptions` and `hasOneOptionPerOptionGroup` [`model/entity/Sku.cfc:L756-L784`]
   *      are the two METHOD-BASED validation rules of `model/validation/Sku.json`. Both walk
   *      `getOptions()`, and `hasOneOptionPerOptionGroup` dereferences
   *      `option.getOptionGroup().getOptionGroupID()` — which is why the group is hydrated too, not
   *      just the option.
   *   3. ⚠️ MOST SERIOUSLY: {@link MySqlSkuRepository.persistSku} DELETES every `SwSkuOption` row of
   *      a pre-existing SKU and then re-inserts from `sku.getOptions()`. A SKU loaded WITHOUT its
   *      options and then saved would therefore have deleted its links and written none — silent
   *      data loss on a round trip that no compile error and no existing test reported. Hydrating on
   *      every entity-returning read is what closes that hole, which is why `findBySkuCode` calls
   *      this member as well even though F05 names only the sorted-SKU path.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * RULE 2 IS SATISFIED BY SPLITTING, NOT BY TRUSTING THE MAPPERS
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * `SwOption` and `SwOptionGroup` BOTH carry `sortOrder`, `remoteID` and all four audit columns, and
   * `SwSkuOption` carries `skuID`. Handing one joined row to two mappers would let a same-named
   * column resolve silently to the wrong table — the precise failure RULE 2 exists to prevent. So the
   * group's columns are selected under a distinct prefix, and each mapper is handed a FRESH row object
   * containing only the columns of the table it owns. No mapper ever sees a foreign column.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * RULE 4: THE LIVE ARRAY IS FILLED, NEVER REPLACED
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * `Sku.options` is initialised to `[]` by its class and `model/entity/Option.cfc:L95` mutates the
   * corresponding legacy collection in place. This member pushes into the array the entity already
   * holds; it never assigns a new one. Assigning would break any reference taken before the load.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * THE IDENTITY MAP, AND WHY IT IS PER CALL RATHER THAN PER MODULE
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * One `Option` instance per `optionID` and one `OptionGroup` instance per `optionGroupID`, for the
   * whole batch — so two SKUs sharing an option share the object, exactly as one Hibernate session
   * returns one instance per identifier. The maps are LOCAL to this call and are discarded when it
   * returns: M7 records that nothing may survive between Lambda invocations, and a module-scope
   * identity map on a warm container would leak rows across requests and across tenants.
   *
   * `manageEntity` returns THE SAME OBJECT it was given (`rowMappers.ts` RULE 5, `Object.assign`), so
   * reference identity and `instanceof` both survive and the map is coherent.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * ORDERING — WHAT THE LEGACY DECLARES, AND WHAT IT DOES NOT
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * ⚠️ `model/entity/Sku.cfc:L76` declares the collection as
   * `fieldtype="many-to-many" linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"`
   * with **NO `orderby` attribute**. It is an unordered bag: the legacy's option order is whatever the
   * query plan happened to yield, and it is therefore NOT specified behaviour. Ordering by
   * `option.sortOrder` here would look like the obvious choice and would be an INVENTED business
   * ordering (S9, AAP §0.7.3 standard 9) — `sortOrder` orders options WITHIN A GROUP for display, and
   * nothing in the legacy applies it to this collection.
   *
   * The statement therefore orders by the LINK TABLE's own columns, `skuID` then `optionID`. That
   * choice adds no business meaning, and it buys the one property an unordered read cannot give: the
   * same rows come back in the same order every time, so a rendered `getSkuDefinition` is
   * reproducible. `TODO(parity)`: a round trip does not preserve the order `persistSku` wrote, because
   * `SwSkuOption` has no sequence column to record it — a property the legacy shares exactly.
   *
   * Contrast `model/entity/OptionGroup.cfc:L70`, which DOES declare `orderby="sortOrder"`. That
   * collection is a different relationship and is hydrated elsewhere; the difference between the two
   * declarations is why neither ordering may be copied onto the other.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * NULLABILITY AND FAN-OUT
   * ───────────────────────────────────────────────────────────────────────────────────────────────
   * `SwOption.optionGroupID` has no `notnull` in the mapping [`model/entity/Option.cfc:L59`], so the
   * join to the group is a LEFT join and an option whose FK is NULL keeps `optionGroup` ABSENT rather
   * than receiving a stub — RULE 3 forbids stubs precisely because
   * `option.getOptionGroup().getImageGroupFlag()` [`model/entity/Sku.cfc:L134`] would silently read a
   * class default off one. `model/validation/Option.json` requires the group on save, so a NULL is a
   * pre-existing row the legacy would also fail to validate; it is loaded as-is, not repaired.
   *
   * `Option.skus`, the INVERSE side of the same many-to-many, is deliberately left unhydrated: no
   * consumer in the slice dereferences it, and populating it would build a reference cycle whose only
   * effect would be to make the object graph harder to reason about.
   *
   * @param skus - The SKUs to fill. A SKU with no link rows keeps its empty collection, which is the
   *   correct load for an option-less default SKU rather than an error.
   */
  private async hydrateSkuOptions(skus: readonly Sku[]): Promise<void> {
    const skuIDs: string[] = [];
    const skusByID = new Map<string, Sku[]>();
    for (const sku of skus) {
      const skuID = sku.skuID;
      if (skuID === SKU_UNSAVED_ID_VALUE || skuID === '') {
        continue;
      }
      const existing = skusByID.get(skuID);
      if (existing === undefined) {
        skusByID.set(skuID, [sku]);
        skuIDs.push(skuID);
      } else {
        existing.push(sku);
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
   * ⭐ WHO ACTUALLY OPENS THAT TRANSACTION, NAMED HERE BECAUSE FOR A WHILE NOBODY DID. The service is
   * the caller of THIS member, but it is not the boundary owner — a service in a hexagonal design does
   * not open a transaction. The owner is `UnitOfWork.runScoped` in ./UnitOfWork, reached from the
   * writing route through `createProductSkuCreationBoundary` in `src/handlers/skuHandler.ts`: the
   * boundary builds the product read and the SKU service FROM the transaction's scope, runs them, and
   * settles on the product's accumulated error state — the port of the gate at
   * `model/service/ProductService.cfc:L286-L288` and `org/Hibachi/Hibachi.cfc:L456-L457`. Until that
   * boundary existed the paragraph above described an obligation with no holder: the route resolved the
   * product on one collaborator and wrote through another, so "writes and reads share the injected
   * executor" was true of this member and false of the invocation containing it.
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
   * ⚠️ NO IDENTIFIER IS GENERATED HERE, AND THE CALLER THAT DOES GENERATE IT IS NAMED. Identifiers are
   * 32-character values assigned in application code (IR-6), and this member neither returns nor assigns
   * one — so a SKU still carrying the unsaved sentinel [`model/entity/Sku.cfc:L52`, whose mapping
   * declares an empty unsaved value] cannot be written and is reported rather than silently given an
   * identifier. TR-5 requires the gap be surfaced, not swallowed.
   *
   * The assignment happens one layer up, in `SkuService.validateNewSku`, and it happens BEFORE the rule
   * set runs so that the uniqueness rule's self-exclusion clause at [`model/entity/Sku.cfc:L763-L768`]
   * has a key to compare against. Refusing the sentinel here is what makes that ordering enforceable
   * rather than merely documented: a future caller that skipped the mint would fail loudly on its first
   * SKU instead of writing a row keyed on the empty string.
   *
   * It used to REJECT any SKU still carrying the unsaved sentinel [`model/entity/Sku.cfc:L52`, whose
   * mapping declares an empty unsaved value], on the reasoning that generation is "application code's"
   * job and TR-5 requires an unfilled gap to be surfaced. The premise was right; the conclusion was
   * not. Nothing anywhere assigned a SKU identifier, so the guard rejected 100% of new SKUs before any
   * statement ran — `../../services/SkuService`'s combination engine could not write a single row.
   *
   * ⚠️ THIS ADAPTER *IS* THE APPLICATION CODE IR-6 MEANS. `fieldtype="id" generator="uuid"` is
   * resolved by the legacy mapping layer at save time, not by the database — there is no
   * auto-increment and no default — so the port's equivalent of "save time" is the write itself. That
   * is already the settled convention in this slice, and this member now follows it rather than
   * contradicting it: `MySqlBrandRepository.saveBrand` assigns `brand.brandID` on insert, and
   * `MySqlProductRepository` does the same for the identifiers it writes. The domain layer is
   * explicitly barred from doing it — `../../domain/sku/Sku.ts` states that entity "never generates
   * one", and `../../domain/product/ProductType.ts` names `src/adapters/mysql/**` as the layer that
   * decides when to call the generator.
   *
   * The value is `createSlatwallUUID()` from `../../util/uuid` — 32 hexadecimal characters, no
   * dashes, never RFC-4122 form and never re-cased (IR-6). It is assigned ONLY when the SKU is new;
   * an existing identifier is never regenerated, because that would orphan the row's link records
   * rather than update them.
   *
   * ⛔ ASSIGNED BEFORE THE LINK ROWS ARE WRITTEN, WHICH IS WHY IT CANNOT BE DEFERRED TO THE CALLER.
   * The option links below key on this identifier, and the M6 uniqueness read matches on the link
   * table — so a SKU written without a resolvable identifier would be invisible to the very rule that
   * must see it. Assigning here keeps the identifier, the row and its links in one operation.
   *
   * THE COUNTER-ARGUMENT, RECORDED BECAUSE IT IS A GOOD ONE. `generator="uuid"` is an instruction to
   * the MAPPING layer, `createSlatwallUUID()` lives in `model/dao/HibachiDAO.cfc` — the data-access
   * layer this file replaces (AAP §0.4.1.11) — and `MySqlBrandRepository.saveBrand` does assign on its
   * own insert branch. On that reading this layer is the generator's home, and while nothing upstream
   * minted, the guard below made the whole SKU-creation path unreachable: `Sku.skuID` defaults to the
   * sentinel and `src/services/SkuService.ts` calls this member unconditionally, so every creation
   * raised.
   *
   * WHY THE SERVICE STILL OWNS IT. That premise no longer holds — `SkuService` now mints for every
   * combination it enumerates, including the no-options branch, which is what closed the unreachable
   * path. Minting HERE as well would put two implementations of one rule on the same write, and the
   * one thing an identifier must not have is two authorities. The service is the surviving site
   * because the odometer needs the value BEFORE this member is reached: the `SwSkuOption` link rows
   * reference it, `SwProduct.defaultSkuID` is set from it, and the uniqueness rule's self-exclusion
   * clause at `model/entity/Sku.cfc:L763-L768` compares against it while the batch is still being
   * written (§0.6.2). So the guard below reports a caller that skipped that step, and it is retained
   * precisely because it is what would catch one.
   *
   * WHO DOES ASSIGN IT, NAMED HERE SO THE GUARD IS NOT MISTAKEN FOR AN UNCLOSED GAP.
   * `src/services/SkuService.ts` mints the value with `createSlatwallUUID()` in the private member that
   * validates each new SKU, on the statement immediately preceding its call to this one — which is the
   * translation of Hibernate assigning `generator="uuid"` at write time rather than at construction
   * time. The guard below therefore reports a caller that skipped that step, not a missing
   * collaborator, and it stays in place precisely because it is what would catch such a caller.
   *
   * Audit columns ARE stamped here, and that is the one lifecycle step this layer does own (F03). The
   * legacy stamped them from Hibernate's `preInsert`/`preUpdate` during the flush the framework
   * triggered at request end; a stateless invocation has no such flush, so the write seam is the only
   * place left that knows which branch is being taken. That is a different question from who mints the
   * identifier: the stamp needs the INSERT-versus-UPDATE verdict, which only the probe below has.
   *
   * @param sku - the SKU to write, with its options attached
   * @returns Nothing. The SKU is mutated in place — the audit columns are stamped on the instance the
   *   caller already holds — and `../../ports/repositories/SkuRepository` declares the member
   *   `Promise<void>` for that reason. A composition root that wants the `EntityPersister<Sku>`
   *   callback shape instead binds `(sku) => repository.persistSku(sku).then(() => sku)`; the seam is
   *   one line wide either way, and no caller in the slice reads a returned instance.
   */
  public async persistSku(sku: Sku): Promise<void> {
    /*
     * DATA-01 — THIS MEMBER REFUSES AN UNIDENTIFIED SKU RATHER THAN IDENTIFYING ONE, and the refusal is
     * the FIRST thing it does, before any statement is prepared. `src/services/SkuService.ts` mints the
     * 32-character value one statement before the write, because the combination engine's uniqueness
     * read has to be able to exclude the SKU it is about to insert — AAP §0.6.2's read-back cycle — and
     * only the service knows the enumeration order that read depends on. Minting here instead would
     * hand the identifier back too late for that exclusion to work.
     *
     * The guard therefore stays as defence in depth: it converts "the caller forgot to mint" from a row
     * written under the empty-string sentinel — silent, and corrupting, because every such row collides
     * on the primary key after the first — into a raised error with the SKU code attached.
     */
    if (sku.isNew() || sku.skuID === SKU_UNSAVED_ID_VALUE) {
      throw new DomainError('A SKU cannot be written before it has been assigned an identifier.', {
        context: { skuCode: sku.skuCode },
      });
    }

    const skuIdentifier = sku.skuID;

    /*
     * ==================================================================================================
     * THE EXISTENCE PROBE IS RESOLVED BEFORE THE VALUES ARE COLLECTED, AND THAT ORDER IS FORCED (F03)
     * ==================================================================================================
     * It used to sit below the value array, which was harmless while nothing between the two touched the
     * entity. The audit stamp below does touch it, and the stamp needs to know which branch is being
     * taken — an insert moves both timestamps, an update moves only `modifiedDateTime` and must leave
     * `createdByAccount` alone. Collecting first and probing second would therefore have written the
     * PREVIOUS save's audit values, silently and with no error.
     *
     * The probe is used here rather than `isNew()`, and the divergence from
     * `MySqlProductRepository.saveProduct` and `MySqlProductTypeRepository.saveProductType` — both of
     * which branch on `isNew()` — is deliberate. The combination engine in `src/services/SkuService.ts`
     * assigns an identifier and may hand the SAME entity back on a later pass, so `isNew()` cannot be
     * trusted to distinguish "never written" from "written a moment ago in this very transaction". Those
     * two members receive either a freshly constructed instance or one loaded from a row, where `isNew()`
     * is decisive.
     */
    const probeSql = `SELECT ${SKU_COLUMN.skuID} FROM ${SKU_TABLE} WHERE ${SKU_COLUMN.skuID} = ?`;
    const existingRows = await this.executor.execute(probeSql, [skuIdentifier]);
    const skuRowAlreadyExists = existingRows.length > 0;

    /*
     * ==================================================================================================
     * THE AUDIT BLOCK IS STAMPED HERE, BECAUSE THIS IS THE FLUSH (F03)
     * ==================================================================================================
     * Hibernate fired `preInsert`/`preUpdate` as part of the flush the framework triggered at request end
     * (`org/Hibachi/Hibachi.cfc`, double `ormFlush()` gated on the ORM reporting no errors, with
     * `flushAtRequestEnd=false`). A stateless Lambda invocation has no ORM session, no automatic flush and
     * no request-end hook (mismatch M5, AAP §0.6.6), so nothing fires the hook unless a write seam calls
     * it — and `src/services/BaseService.ts` explicitly declines the job and places it "behind
     * `EntityPersister`", which is this member. Before this call existed the four audit columns were
     * written exactly as a transient entity held them, i.e. as NULLs, where the legacy wrote a timestamp.
     *
     * The free functions are called rather than a hook on the entity because `model/entity/Sku.cfc` does
     * NOT override `preInsert`/`preUpdate` — a SKU only ever received the framework block. Contrast
     * `MySqlProductTypeRepository`, whose entity DOES override both and additionally refreshes a persisted
     * column, and which therefore calls the entity's own hooks.
     *
     * ⚠️ STAMP FIRST, COLLECT SECOND. The value array below reads the four audit fields off the entity.
     *
     * ⚠️ THE BRANCH IS THE PROBE'S ANSWER, NOT `isNew()`. A SKU the combination engine has already written
     * once in this transaction takes the UPDATE stamp, which is what the mapping layer did for an entity
     * already present in its session.
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
     * ALL FOUR OWNED LINK COLLECTIONS, written after the row itself — the order the mapping layer flushes
     * in, and the only order that works, since every link row references the SKU.
     *
     * ⚠️ ONLY THE FIRST OF THESE FOUR USED TO BE WRITTEN. The other three collections were accepted by the
     * entity, populated by `createSkus`' subscription and content-access branches, reported on by
     * validation — and then silently discarded, because this adapter never emitted a statement for them.
     * The SKU row was written, the save returned successfully, and a later read produced a SKU with three
     * empty collections. Nothing anywhere reported the loss, which is what made it worth finding.
     *
     * ⚠️ ONE RULE, WRITTEN ONCE, FOR ALL FOUR. The replacement semantics — delete only when the SKU row
     * PRE-EXISTED, insert in the entity's own ORDER, no deduplication — are a single rule that every one
     * of the SKU's owned collections obeys, so they are expressed as a single member
     * ({@link MySqlSkuRepository.replaceSkuLinkRows}) rather than as four similar blocks. Four copies of
     * a rule are four places for it to drift. The option link was previously written out inline; routing
     * it through the shared member emits byte-identical SQL and removes the last place the rule was
     * duplicated.
     *
     * ⚠️ THE ORDER IS THE ENTITY'S DECLARATION ORDER — `model/entity/Sku.cfc:L76` through `:L79`. Nothing
     * depends on it; it is followed so a statement log reads in the order the source declares.
     *
     * ⚠️ IN PRACTICE THE THREE NON-OPTION COLLECTIONS ARE MUTUALLY EXCLUSIVE, AND THAT IS NOT RELIED ON.
     * `createSkus` fills the two benefit roles from its subscription branch
     * (`model/service/SkuService.cfc:L161` and `:L164`) and the contents from its content-access branch
     * (`:L187` and `:L196`), and those branches are alternatives of one three-way discriminator, so a SKU
     * built by that member carries at most one of the two groups. Nothing enforces the exclusivity at the
     * persistence layer, the entity permits all three to be populated at once, and this write therefore
     * handles all three unconditionally rather than inferring which branch produced the SKU.
     */
    await this.replaceSkuLinkRows(
      SKU_OPTION_TABLE,
      SKU_LINK_COLUMN.option,
      skuIdentifier,
      skuRowAlreadyExists,
      sku.getOptions().map((option) => option.optionID),
    );

    await this.replaceSkuLinkRows(
      SKU_ACCESS_CONTENT_TABLE,
      SKU_LINK_COLUMN.accessContent,
      skuIdentifier,
      skuRowAlreadyExists,
      sku.accessContents.map((accessContent) => accessContent.contentID),
    );

    await this.replaceSkuLinkRows(
      SKU_SUBSCRIPTION_BENEFIT_TABLE,
      SKU_LINK_COLUMN.subscriptionBenefit,
      skuIdentifier,
      skuRowAlreadyExists,
      sku.subscriptionBenefits.map((benefit) => benefit.subscriptionBenefitID),
    );

    await this.replaceSkuLinkRows(
      SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE,
      SKU_LINK_COLUMN.renewalSubscriptionBenefit,
      skuIdentifier,
      skuRowAlreadyExists,
      sku.renewalSubscriptionBenefits.map((benefit) => benefit.subscriptionBenefitID),
    );
  }

  /**
   * Replaces one SKU-owned link collection, with the replacement semantics the option link established.
   *
   * Extracted as one member rather than repeated four times because the semantics — delete-when-present,
   * insert in source order, no deduplication — are a single rule that all four of the SKU's owned
   * collections obey. Four copies of a rule are four places for it to diverge.
   *
   * ⚠️ THE OPTION LINK CALLS THIS TOO, and the SQL it emits is byte-for-byte what the inline block it
   * replaced emitted: same statement text, same column order, same `(?, ?)` grouping, same value
   * sequence. It is included rather than left inline because a rule with one exception is two rules.
   *
   * ⚠️ NO DEDUPLICATION, DELIBERATELY. A repeated far identifier is a data fault the link table's own key
   * is entitled to reject, and collapsing it here would hide that fault from the caller that created it.
   *
   * ⚠️ AN EMPTY COLLECTION ON A PRE-EXISTING SKU STILL ISSUES THE DELETE, and that is the whole meaning
   * of replacement. Removing every benefit from a SKU and saving it must clear the rows; skipping the
   * delete for an empty collection would make removal impossible.
   *
   * ⚠️ NOTHING IS COMMITTED HERE (M5). The boundary belongs to `src/adapters/mysql/UnitOfWork.ts`.
   *
   * @param table - the link table, already whitelisted.
   * @param columns - its owning and far column names, already whitelisted.
   * @param skuIdentifier - the owning SKU's 32-character identifier.
   * @param skuRowAlreadyExists - whether the SKU row pre-existed this save, which decides the delete.
   * @param farIdentifiers - the far-side identifiers, in the order the entity holds them, undeduplicated.
   */
  private async replaceSkuLinkRows(
    table: PhysicalTableName,
    columns: { readonly skuID: string; readonly far: string },
    skuIdentifier: string,
    skuRowAlreadyExists: boolean,
    farIdentifiers: readonly string[],
  ): Promise<void> {
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
