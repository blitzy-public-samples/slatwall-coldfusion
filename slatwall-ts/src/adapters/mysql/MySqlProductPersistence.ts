/* ==================================================================================================
 * MySqlProductPersistence — the production write surface for `SwProduct` and `SwProductType`.
 *
 * ⭐ WHY THIS FILE EXISTS, STATED AS THE GAP IT CLOSES.
 *
 * `src/services/ProductService.ts` declares three narrow persistence seams and implements every one of
 * its fifteen members against them, but until now NOTHING in `src/` supplied a production
 * implementation of any of them. A repository-wide search for `new BaseService` returned zero hits and
 * a search for `EntityRemover` returned only its own declaration. The consequence was concrete rather
 * than theoretical: a composition root could not have wired a working product flow at all, and the only
 * way to make one work would have been to invent SQL at the wiring site — which is the layer least able
 * to state what `model/entity/Product.cfc` declares. This file supplies the four capabilities so the
 * wiring site has nothing left to invent.
 *
 * The four, each named with the seam it fills:
 *
 *   {@link MySqlProductPersistence.saveProduct}       -> `ProductService.persistProduct`, and the
 *                                                       `persist` collaborator of the product base service
 *   {@link MySqlProductPersistence.deleteProduct}     -> the `remove` collaborator of the product base
 *                                                       service, which `ProductService.deleteProduct`
 *                                                       reaches through `ProductBaseService`
 *   {@link MySqlProductPersistence.saveProductType}   -> the `persist` collaborator of the product-type
 *                                                       base service, which `ProductService.saveProductType`
 *                                                       reaches through `ProductTypeBaseService`
 *   {@link MySqlProductPersistence.deleteProductType} -> the `remove` collaborator of the same
 *
 * ⚠️ STRUCTURALLY — AND ONLY STRUCTURALLY — THE FOUR MEMBERS SATISFY THOSE SEAMS. `EntityPersister` and
 * `EntityRemover` are declared in `src/services/BaseService.ts`, and this file imports NEITHER: an
 * adapter that reached up into the service layer's type surface would invert the dependency direction the
 * whole hexagonal separation exists to fix (AAP §0.7.3 S4). Structural compatibility is sufficient, and
 * `MySqlBrandRepository.ts` records the same decision for the same reason about the URL-title probe. The
 * assignability is nonetheless PROVEN rather than asserted: `test/adapters/MySqlProductPersistence.test.ts`
 * imports both function types and binds all four members to them, so a signature drift is a compile error
 * in the suite rather than a run-time surprise at the wiring site.
 *
 * ⚠️ THE FOURTH IS REQUIRED TO CONSTRUCT AND UNREACHABLE THROUGH THE SEAM, AND THAT IS RECORDED RATHER
 * THAN HIDDEN. `src/services/ProductService.ts` narrows its product-type collaborator to
 * `Pick<BaseService<ProductType, …>, 'save'>`, so nothing in that service can call a product-type
 * removal. But `BaseServiceCollaborators` declares `remove` REQUIRED, so a `BaseService<ProductType, …>`
 * cannot be constructed without one. The member is therefore implemented properly instead of being
 * stubbed or cast away: `model/validation/ProductType.json` declares four delete guards, so the
 * capability is real legacy behaviour even though this slice's service surface does not reach it.
 *
 * --------------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT — THE SERVICE/PERSISTENCE SPLIT
 * --------------------------------------------------------------------------------------------------
 * By the time control arrives, the entity is populated and validated. So there is no population here,
 * no URL-title derivation, no validation dispatch and no delete-guard evaluation:
 *
 *   • population is `src/domain/base/populate.ts`, driven from `model/entity/HibachiEntity.cfc:L56`;
 *   • the URL title is `src/util/urlTitle.ts`, the port of `model/service/DataService.cfc:L53-L71`;
 *   • the save-context and delete-context rules are `src/validation/rules/product.rules.ts` and
 *     `src/validation/rules/productType.rules.ts`, evaluated ABOVE this boundary exactly as
 *     `model/service/HibachiService.cfc:L68-L73` gates its own removal on the outcome. Importing
 *     `src/validation/**` from an adapter is forbidden outright (AAP §0.7.3 S4), so the boundary is
 *     recorded here and not crossed.
 *
 * A blocked removal never reaches this file. That is why the two removal members answer `void` — the
 * boolean verdict is the base service's to compute, at `org/Hibachi/HibachiService.cfc:L71` and `:L79`.
 *
 * --------------------------------------------------------------------------------------------------
 * TWO NAMES FOR ONE THING — `SwProduct` IS PHYSICAL, `SlatwallProduct` IS THE ORM NAME
 * --------------------------------------------------------------------------------------------------
 * `model/entity/Product.cfc:L49` declares `entityname="SlatwallProduct" table="SwProduct"` and
 * `model/entity/ProductType.cfc:L49` declares `entityname="SlatwallProductType" table="SwProductType"`.
 * Every statement in this file is native, so every statement names the physical form, resolved through
 * `assertTableName` so the identifier came from a validated whitelist rather than from a literal at the
 * call site (AAP §0.7.3 S2). The standing warning is carried verbatim: never "fix" a logical entity
 * name to `Sw*`, and never assume a logical name works in native SQL.
 *
 * --------------------------------------------------------------------------------------------------
 * ⭐ THE SCOPE BOUNDARY OF THE REMOVAL PATH — THE ONE JUDGMENT CALL IN THIS FILE
 * --------------------------------------------------------------------------------------------------
 * `org/Hibachi/HibachiService.cfc:L61` calls `removeAllManyToManyRelationships()` before the delete,
 * and `org/Hibachi/HibachiEntity.cfc:L271-L283` implements it: loop every property, skip any
 * many-to-many whose `cascade` lists `all-delete-orphan`, `delete` or `delete-orphan`, and remove each
 * element of every other. The source comment states the reason outright — "so that it doesn't violate
 * fkconstrint". The mapping layer's own `delete()` then cascades the one-to-many collections declared
 * `cascade="all-delete-orphan"` and the `defaultSku` declared `cascade="delete"`.
 *
 * `model/entity/Product.cfc:L79-L90` declares TEN many-to-many collections and NONE of them carries a
 * `cascade` attribute, so the legacy clears all ten. Exactly one of the ten has an in-scope far side:
 *
 *   `:L81`  `relatedProducts`  linktable `SwRelatedProduct`  cfc `Product`     <- IN SCOPE
 *   `:L79`  `listingPages`     linktable `SwProductListingPage`  cfc `Content`
 *   `:L80`  `categories`       linktable `SwProductCategory`     cfc `Category`
 *   `:L84`  `promotionRewards`            linktable `SwPromoRewardProduct`
 *   `:L85`  `promotionRewardExclusions`   linktable `SwPromoRewardExclProduct`
 *   `:L86`  `promotionQualifiers`         linktable `SwPromoQualProduct`
 *   `:L87`  `promotionQualifierExclusions` linktable `SwPromoQualExclProduct`
 *   `:L88`  `priceGroupRates`  linktable `SwPriceGroupRateProduct`  cfc `PriceGroupRate`
 *   `:L89`  `vendors`          linktable `SwVendorProduct`          cfc `Vendor`
 *   `:L90`  `physicals`        linktable `SwPhysicalProduct`        cfc `Physical`
 *
 * `Content*`, `Category`, `Promotion*`, `PriceGroup*`, `Vendor*` and `Physical*` are excluded families
 * (AAP §0.2.2.1), and `src/domain/product/Product.ts` types those nine collections with a DELIBERATELY
 * OPAQUE element type for precisely that reason — nothing in the port ever loads or traverses them.
 * `model/entity/Product.cfc:L74-L76` adds three more excluded-family cascade children: `productImages`
 * (`Image`), `attributeValues` (`Attribute*`) and `productReviews` (`ProductReview`).
 *
 * So the removal splits, and the split is drawn on scope rather than on convenience:
 *
 *   IN THIS FILE, AS STATEMENTS — every table squarely inside the extracted slice: `SwRelatedProduct`,
 *   the four SKU link tables `model/entity/Sku.cfc:L76-L79` declares, `SwSku` itself, and `SwProduct`.
 *
 *   BEHIND {@link ProductDependencyCleanup}, FLAGGED — the nine excluded-family link tables and the
 *   three excluded-family cascade children. TR-5 is explicit that this is the mechanism: "Cross the
 *   scope boundary only through a declared port. Where an in-scope member depends on an out-of-scope
 *   collaborator, the port interface is declared, the member is implemented against it, and the gap is
 *   flagged. The member is never quietly dropped from the interface." Writing those twelve statements
 *   here instead would mean declaring twelve excluded-family tables in a whitelist whose own header
 *   calls itself the extracted Catalog schema, which is the scope creep AAP §0.8.2 Guideline 3 forbids.
 *
 * The collaborator is declared HERE rather than as a new file under `src/ports/` because AAP §0.4.1.6
 * closes that inventory at thirteen files; `src/services/BaseService.ts` sets the same precedent for
 * `EntitySettingCleanupPort` and `EntityCommentCleanupPort`, which are declared in the module that
 * consumes them. And it is REQUIRED rather than optional for the reason AAP-4 gives on those two: an
 * optional collaborator lets a wiring site omit it and silently restores exactly the reported
 * behaviour, with nothing anywhere reporting the omission.
 *
 * --------------------------------------------------------------------------------------------------
 * ASSOCIATION IDENTITY — WHY THE THREE PRODUCT FOREIGN KEYS ARE READ THREE DIFFERENT WAYS
 * --------------------------------------------------------------------------------------------------
 * `rowMappers.ts` RULE 3 resolves no many-to-one to a LOADED entity, and its rule 3a fills each slot
 * with an IDENTIFIER-ONLY reference instead — so a hydrated product carries no foreign-key scalar to copy
 * back out: there is no `product.brandID` field anywhere in the domain. The write path therefore reads
 * each key off the association object, which is what "preserve association identity" means in practice —
 * a stale scalar cannot drift out of step with the object graph because no stale scalar exists.
 *
 * ⚠️ AND THE REFERENCE IS WHY THAT READ FINDS ANYTHING AT ALL ON A HYDRATED PRODUCT. Rule 3a exists
 * precisely because these three writes read those three fields back: with the slots left genuinely
 * absent, hydrating a row and writing it again NULLED all three foreign keys. The reference answers its
 * identifier and REFUSES every other read, so nothing here can mistake it for a loaded entity.
 *
 *   `brandID`        <- `product.brand?.brandID`                     [model/entity/Product.cfc:L68]
 *   `productTypeID`  <- `product.productType?.productTypeID`         [`:L69`]
 *   `defaultSkuID`   <- an INJECTED READER over `product.defaultSku` [`:L70`]
 *
 * ⚠️ THE THIRD IS NOT AN INCONSISTENCY. `src/domain/product/Product.ts` types `defaultSku` as a
 * DELEGATE, not as a `Sku`, and `src/domain/sku/Sku.ts` records why in its own mismatch register: the
 * delegate wants nine synchronous argument-free readers while the entity's equivalents are asynchronous
 * and port-parameterised, so `Sku` is deliberately NOT assignable to it and the value in that slot is a
 * wrapper closing over a SKU. Nothing on the delegate exposes an identifier. `src/domain/sku/Sku.ts`
 * already faced this exact question for the mirror-image direction and already exports the answer,
 * `DefaultSkuIdReader`; the same exported type is reused here rather than a second one being declared,
 * exactly as `src/services/ProductService.ts` reuses it for `defaultSkuIdReader`.
 *
 * --------------------------------------------------------------------------------------------------
 * NO DEFECT IS CARRIED HERE, AND NO NEW IDENTIFIER IS MINTED
 * --------------------------------------------------------------------------------------------------
 * There is no legacy data-access component for either entity: `model/dao/ProductDAO.cfc` declares three
 * business queries — attribute sets, the file import and the product-type search — and no save or
 * delete, and `model/dao/ProductTypeDAO.cfc` declares one tree query and nothing else. Both entities
 * were saved and deleted through the synthesized surface `org/Hibachi/HibachiService.cfc:L255-L281`
 * fabricated by prefix, over the inherited primitives at `org/Hibachi/HibachiDAO.cfc:L48-L67` and
 * `:L69-L77` (IR-1). So there is no legacy statement for these tables to carry a defect FROM.
 *
 * Stated as the identifiers a reviewer will look for: THERE IS NO D18 SITE HERE — that is the single
 * declared hardening exception of the whole port and it is exclusive to `MySqlProductRepository.ts`,
 * which translates the importer's twenty-one value-interpolating statements — and THERE IS NO D22 SITE
 * HERE, because with no legacy statement there is no logical-versus-physical naming mistake to carry.
 * The defect and mismatch registers are CLOSED and nothing in the legacy tree is corrected (TR-6).
 *
 * --------------------------------------------------------------------------------------------------
 * EXECUTION-MODEL POSTURE (AAP §0.7.3 S8)
 * --------------------------------------------------------------------------------------------------
 * M5 — CITED, NOT OWNED. Nothing here begins, commits or rolls back a transaction and no autocommit
 * setting is touched. The legacy commit is implicit at request end and error-conditional; its owner in
 * the target is `src/adapters/mysql/UnitOfWork.ts`. Every member runs inside whatever boundary the
 * caller already established, which is why the removal path's several statements are safe to issue in
 * sequence: a caller that wants them atomic supplies a transaction-scoped executor.
 *
 * M6 — APPLIES TRANSITIVELY, WHICH IS WHY THERE IS EXACTLY ONE INJECTED EXECUTOR. The removal path
 * READS the SKU identifiers it is about to remove, and that read must observe rows the same transaction
 * has written and not yet committed. An executor that reached past the injected one to a pool would miss
 * a SKU inserted moments earlier in the same unit of work and leave its link rows behind.
 *
 * M7 — OWNED AS A PROHIBITION. No module-scope mutable state, no instance cache, no memoized read.
 *
 * M1, M2, M3, M4 and M8 are cited elsewhere and owned elsewhere. Nothing here adds a timeout, a
 * row-count cap, a batch size, a retry, a backoff or an index hint (AAP §0.7.3 S9), and no statement
 * carries a row-restricting or row-skipping clause, because no legacy statement for these tables had
 * one.
 * ============================================================================================== */

import type { Product } from '../../domain/product/Product';
import type { ProductType } from '../../domain/product/ProductType';
import { PRODUCT_TYPE_CLASS_NAME } from '../../domain/product/ProductType';
import type { DefaultSkuIdReader } from '../../domain/sku/Sku';
import { DataIntegrityError } from '../../errors/DomainError';
import type { SqlExecutor } from './QueryRunner';
import { assertColumnName, assertTableName } from './QueryRunner';
import { readHydratedParentProductTypeID } from './rowMappers';
import { createSlatwallUUID } from '../../util/uuid';

/* ==================================================================================================
 * VALIDATED IDENTIFIERS (AAP §0.7.3 S2)
 *
 * A `?` placeholder binds a VALUE and cannot substitute an identifier, so every table and column name
 * below is resolved ONCE, at module load, through the whitelist in `QueryRunner.ts`. Both helpers raise
 * when a name is not declared for the extracted Catalog schema, so a typo here fails at import time
 * rather than at the first statement — and no caller-supplied string can reach an identifier position,
 * because no member of this file accepts one.
 * ============================================================================================== */

/** `SwProduct` — `model/entity/Product.cfc:L49`. */
const PRODUCT_TABLE = assertTableName('SwProduct');

/** `SwProductType` — `model/entity/ProductType.cfc:L49`. */
const PRODUCT_TYPE_TABLE = assertTableName('SwProductType');

/** `SwSku` — `model/entity/Sku.cfc:L49`. Reached by the product removal's cascade, never saved here. */
const SKU_TABLE = assertTableName('SwSku');

/** `SwRelatedProduct` — the one in-scope product link table, `model/entity/Product.cfc:L81`. */
const RELATED_PRODUCT_TABLE = assertTableName('SwRelatedProduct');

/** `SwSkuOption` — `model/entity/Sku.cfc:L76`. */
const SKU_OPTION_TABLE = assertTableName('SwSkuOption');

/** `SwSkuAccessContent` — `model/entity/Sku.cfc:L77`. */
const SKU_ACCESS_CONTENT_TABLE = assertTableName('SwSkuAccessContent');

/** `SwSkuSubsBenefit` — `model/entity/Sku.cfc:L78`. The table name is abbreviated; the column is not. */
const SKU_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuSubsBenefit');

/** `SwSkuRenewalSubsBenefit` — `model/entity/Sku.cfc:L79`. */
const SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuRenewalSubsBenefit');

/**
 * The four link tables `model/entity/Sku.cfc:L76-L79` declares, each paired with its own SKU column, in
 * declaration order.
 *
 * Reached only by the product removal's SKU cascade. The FAR column differs per table and is
 * deliberately NOT named here, because the cascade removes every row a SKU owns rather than a particular
 * relationship — `DELETE … WHERE skuID IN (…)` needs the near column alone. `MySqlSkuRepository.ts`
 * names both columns of all four because it SYNCHRONISES them; this file only clears them.
 *
 * ⚠️ ALL FOUR, NOT JUST THE OPTION ONE. Leaving three out would leave orphan link rows behind after a
 * product removal — rows pointing at a `skuID` that no longer exists, which no error would report.
 */
const SKU_LINK_TABLES: readonly { readonly table: string; readonly skuID: string }[] =
  Object.freeze([
    Object.freeze({
      table: SKU_OPTION_TABLE,
      skuID: assertColumnName(SKU_OPTION_TABLE, 'skuID'),
    }),
    Object.freeze({
      table: SKU_ACCESS_CONTENT_TABLE,
      skuID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'skuID'),
    }),
    Object.freeze({
      table: SKU_SUBSCRIPTION_BENEFIT_TABLE,
      skuID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
    }),
    Object.freeze({
      table: SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE,
      skuID: assertColumnName(SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
    }),
  ]);

/**
 * Every `SwProduct` column this file names — `model/entity/Product.cfc:L52-L99`.
 *
 * The set is the entity's PERSISTENT surface and deliberately not its whole property surface:
 * `model/entity/Product.cfc:L102-L123` declares twenty non-persistent properties and none of them is a
 * column, so none appears here. The four members under the legacy "Calculated Properties" comment at
 * `:L62-L65` ARE columns and DO appear, which is the distinction that makes this list readable against
 * the source rather than against a naming convention.
 *
 * ⚠️ THE TWO ACCOUNT KEYS ARE THE ONE PLACE COLUMN AND FIELD NAMES DIVERGE. The columns are
 * `createdByAccountID` and `modifiedByAccountID` — `fkcolumn` on the many-to-one declarations at
 * `:L97` and `:L99` — while the domain fields they carry are named `createdByAccount` and
 * `modifiedByAccount`. `rowMappers.ts` reads them in exactly that crossed pairing and the write path
 * below binds them the same way round. Getting the pairing wrong is silent in both directions: the
 * whitelist would reject `createdByAccount` as a column, but nothing would reject binding the WRONG
 * FIELD to the right column.
 */
const PRODUCT_COLUMN = Object.freeze({
  /** `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` — `:L52` (IR-6). */
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  /** `:L53`. */
  activeFlag: assertColumnName(PRODUCT_TABLE, 'activeFlag'),
  /** `unique="true"` — `:L54`. One of the five unique columns in this slice. */
  urlTitle: assertColumnName(PRODUCT_TABLE, 'urlTitle'),
  /** `notNull="true"` — `:L55`. */
  productName: assertColumnName(PRODUCT_TABLE, 'productName'),
  /** `unique="true"` — `:L56`. */
  productCode: assertColumnName(PRODUCT_TABLE, 'productCode'),
  /** `length="4000"` — `:L57`. */
  productDescription: assertColumnName(PRODUCT_TABLE, 'productDescription'),
  /** `default="false"` — `:L58`. */
  publishedFlag: assertColumnName(PRODUCT_TABLE, 'publishedFlag'),
  /** `:L59`. */
  sortOrder: assertColumnName(PRODUCT_TABLE, 'sortOrder'),
  /** Calculated but PERSISTED, `ormtype="big_decimal"` — `:L62`. */
  calculatedSalePrice: assertColumnName(PRODUCT_TABLE, 'calculatedSalePrice'),
  /** Calculated but PERSISTED — `:L63`. */
  calculatedQATS: assertColumnName(PRODUCT_TABLE, 'calculatedQATS'),
  /** Calculated but PERSISTED — `:L64`. */
  calculatedAllowBackorderFlag: assertColumnName(PRODUCT_TABLE, 'calculatedAllowBackorderFlag'),
  /** Calculated but PERSISTED — `:L65`. Read by the Google feed as the item title. */
  calculatedTitle: assertColumnName(PRODUCT_TABLE, 'calculatedTitle'),
  /** Many-to-one foreign key, `fkcolumn="brandID"` — `:L68`. */
  brandID: assertColumnName(PRODUCT_TABLE, 'brandID'),
  /** Many-to-one foreign key, `fkcolumn="productTypeID"` — `:L69`. */
  productTypeID: assertColumnName(PRODUCT_TABLE, 'productTypeID'),
  /** Many-to-one foreign key, `fkcolumn="defaultSkuID" cascade="delete"` — `:L70`. */
  defaultSkuID: assertColumnName(PRODUCT_TABLE, 'defaultSkuID'),
  /** `:L93`. */
  remoteID: assertColumnName(PRODUCT_TABLE, 'remoteID'),
  /** Audit timestamp — `:L96`. */
  createdDateTime: assertColumnName(PRODUCT_TABLE, 'createdDateTime'),
  /** Audit foreign key carrying the `createdByAccount` FIELD — `:L97`. */
  createdByAccountID: assertColumnName(PRODUCT_TABLE, 'createdByAccountID'),
  /** Audit timestamp — `:L98`. */
  modifiedDateTime: assertColumnName(PRODUCT_TABLE, 'modifiedDateTime'),
  /** Audit foreign key carrying the `modifiedByAccount` FIELD — `:L99`. */
  modifiedByAccountID: assertColumnName(PRODUCT_TABLE, 'modifiedByAccountID'),
});

/**
 * Every `SwProductType` column this file names — `model/entity/ProductType.cfc:L52-L86`.
 *
 * Same reading rules as {@link PRODUCT_COLUMN}: persistent properties only, the self-referencing
 * many-to-one contributing its `fkcolumn`, and the crossed audit pairing preserved.
 */
const PRODUCT_TYPE_COLUMN = Object.freeze({
  /** `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` — `:L52`. */
  productTypeID: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID'),
  /** `length="4000"` — `:L53`. The materialised ancestor path the base-type walk reads. */
  productTypeIDPath: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeIDPath'),
  /** `:L54`. */
  activeFlag: assertColumnName(PRODUCT_TYPE_TABLE, 'activeFlag'),
  /** `:L55`. */
  publishedFlag: assertColumnName(PRODUCT_TYPE_TABLE, 'publishedFlag'),
  /** `unique="true"` — `:L56`. */
  urlTitle: assertColumnName(PRODUCT_TYPE_TABLE, 'urlTitle'),
  /** `:L57`. Required for the save context by `model/validation/ProductType.json`. */
  productTypeName: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeName'),
  /** `length="4000"` — `:L58`. The Google feed's description fallback reads this. */
  productTypeDescription: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeDescription'),
  /** `:L59`. The three seeded discriminators live here (IR-7), and the delete guard bounds it. */
  systemCode: assertColumnName(PRODUCT_TYPE_TABLE, 'systemCode'),
  /** Self-referencing many-to-one, `fkcolumn="parentProductTypeID"` — `:L62`. */
  parentProductTypeID: assertColumnName(PRODUCT_TYPE_TABLE, 'parentProductTypeID'),
  /** `:L80`. */
  remoteID: assertColumnName(PRODUCT_TYPE_TABLE, 'remoteID'),
  /** Audit timestamp — `:L83`. */
  createdDateTime: assertColumnName(PRODUCT_TYPE_TABLE, 'createdDateTime'),
  /** Audit foreign key carrying the `createdByAccount` FIELD — `:L84`. */
  createdByAccountID: assertColumnName(PRODUCT_TYPE_TABLE, 'createdByAccountID'),
  /** Audit timestamp — `:L85`. */
  modifiedDateTime: assertColumnName(PRODUCT_TYPE_TABLE, 'modifiedDateTime'),
  /** Audit foreign key carrying the `modifiedByAccount` FIELD — `:L86`. */
  modifiedByAccountID: assertColumnName(PRODUCT_TYPE_TABLE, 'modifiedByAccountID'),
});

/** `SwSku.skuID`, read by the removal cascade so link rows can be keyed. */
const SKU_ID_COLUMN = assertColumnName(SKU_TABLE, 'skuID');

/** `SwSku.productID` — the one-to-many back reference `model/entity/Product.cfc:L73` declares. */
const SKU_PRODUCT_ID_COLUMN = assertColumnName(SKU_TABLE, 'productID');

/** `SwRelatedProduct.productID` — the OWNER-side column, `model/entity/Product.cfc:L81`. */
const RELATED_PRODUCT_OWNER_COLUMN = assertColumnName(RELATED_PRODUCT_TABLE, 'productID');

/**
 * The `SwProduct` columns the write path assigns, in `model/entity/Product.cfc` declaration order.
 *
 * The primary key is deliberately absent: the insert names it FIRST and the update matches ON it, so it
 * is handled separately at both call sites rather than folded into this list.
 *
 * The list is COMPLETE rather than sparse, and that is a decision. Omitting an absent field from the
 * insert would let the database apply a column default, which is a different outcome from writing the
 * absence the entity actually holds — and the port invents no defaulting behaviour (AAP §0.7.3 S9).
 */
const PRODUCT_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  PRODUCT_COLUMN.activeFlag,
  PRODUCT_COLUMN.urlTitle,
  PRODUCT_COLUMN.productName,
  PRODUCT_COLUMN.productCode,
  PRODUCT_COLUMN.productDescription,
  PRODUCT_COLUMN.publishedFlag,
  PRODUCT_COLUMN.sortOrder,
  PRODUCT_COLUMN.calculatedSalePrice,
  PRODUCT_COLUMN.calculatedQATS,
  PRODUCT_COLUMN.calculatedAllowBackorderFlag,
  PRODUCT_COLUMN.calculatedTitle,
  PRODUCT_COLUMN.brandID,
  PRODUCT_COLUMN.productTypeID,
  PRODUCT_COLUMN.defaultSkuID,
  PRODUCT_COLUMN.remoteID,
  PRODUCT_COLUMN.createdDateTime,
  PRODUCT_COLUMN.createdByAccountID,
  PRODUCT_COLUMN.modifiedDateTime,
  PRODUCT_COLUMN.modifiedByAccountID,
]);

/** The `SwProductType` counterpart of {@link PRODUCT_WRITABLE_COLUMNS}, on the same terms. */
const PRODUCT_TYPE_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  PRODUCT_TYPE_COLUMN.productTypeIDPath,
  PRODUCT_TYPE_COLUMN.activeFlag,
  PRODUCT_TYPE_COLUMN.publishedFlag,
  PRODUCT_TYPE_COLUMN.urlTitle,
  PRODUCT_TYPE_COLUMN.productTypeName,
  PRODUCT_TYPE_COLUMN.productTypeDescription,
  PRODUCT_TYPE_COLUMN.systemCode,
  PRODUCT_TYPE_COLUMN.parentProductTypeID,
  PRODUCT_TYPE_COLUMN.remoteID,
  PRODUCT_TYPE_COLUMN.createdDateTime,
  PRODUCT_TYPE_COLUMN.createdByAccountID,
  PRODUCT_TYPE_COLUMN.modifiedDateTime,
  PRODUCT_TYPE_COLUMN.modifiedByAccountID,
]);

/** The bind placeholder. Named once so no statement below spells it inline. */
const BIND_PLACEHOLDER = '?';

/** The separator between projected columns, between column assignments and between placeholders. */
const CLAUSE_JOINER = ', ';

/** The `SwProduct` insert's column list: primary key first, then the writable columns in order. */
const PRODUCT_COLUMN_LIST = [PRODUCT_COLUMN.productID, ...PRODUCT_WRITABLE_COLUMNS].join(
  CLAUSE_JOINER,
);

/** The `SwProductType` counterpart of {@link PRODUCT_COLUMN_LIST}. */
const PRODUCT_TYPE_COLUMN_LIST = [
  PRODUCT_TYPE_COLUMN.productTypeID,
  ...PRODUCT_TYPE_WRITABLE_COLUMNS,
].join(CLAUSE_JOINER);

/* ==================================================================================================
 * INJECTED SEAMS (AAP §0.7.3 S3, S6)
 * ============================================================================================== */

/**
 * The statement-execution surface this adapter needs.
 *
 * `SqlExecutor` from `QueryRunner.ts` is deliberately ONE member wide so a test can satisfy it with a
 * plain object literal, and that width is preserved: this interface EXTENDS it rather than replacing
 * it, adding exactly one member. The addition is forced rather than chosen — an adapter that both reads
 * and writes must name both members. `MySqlSkuRepository.ts` and `MySqlBrandRepository.ts` declare the
 * same shape for the same reason, and `QueryRunner` satisfies all three structurally, so the
 * composition root injects ONE instance and every statement runs on the SAME connection. See the M6
 * discussion in the module header for why that matters here.
 *
 * @example
 * ```ts
 * // A complete double: no mocking library, no database, no inheritance.
 * const calls: { sql: string; params: readonly unknown[] }[] = [];
 * const executor: ProductPersistenceExecutor = {
 *   execute: (sql, params) => { calls.push({ sql, params }); return Promise.resolve([]); },
 *   executeMutation: (sql, params) => { calls.push({ sql, params }); return Promise.resolve(1); },
 * };
 * ```
 */
export interface ProductPersistenceExecutor extends SqlExecutor {
  /**
   * Runs a data-modifying statement and returns the number of rows it AFFECTED.
   *
   * Matches `QueryRunner.executeMutation`, the port of the legacy `save()` and `delete()` primitives at
   * `org/Hibachi/HibachiDAO.cfc:L48-L67` and `:L69-L77`.
   *
   * ⚠️ THE COUNT MEANS DIFFERENT THINGS FOR DIFFERENT STATEMENTS, so the members below read it
   * differently — or, on every save path, not at all. For an update it is rows MATCHED when the
   * connection carries the driver's default capability set and rows CHANGED when `CLIENT_FOUND_ROWS` is
   * withdrawn: the same statement over the same data answers 1 in the first case and 0 in the second.
   * `src/config/database.ts` pins no capability flags, so neither figure may become control flow.
   *
   * @param sql - the statement text, with every value position a `?` placeholder.
   * @param params - the values to bind, positionally.
   * @returns the affected-row count the driver reported.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

/**
 * The link and child rows a product or product-type removal must clear that belong to EXCLUDED
 * families — declared here, implemented outside this subtree, and flagged (TR-5).
 *
 * ⚠️ THIS IS NOT A CONVENIENCE HOOK AND IT IS NOT OPTIONAL. `org/Hibachi/HibachiEntity.cfc:L271-L283`
 * clears the many-to-many link rows before the delete precisely "so that it doesn't violate
 * fkconstrint", and the mapping layer's own cascade removes the one-to-many children. A removal that
 * skipped this work would fail against a schema with the constraints the legacy mapping generates, or —
 * worse, on a schema without them — would succeed and leave orphan rows pointing at an identifier that
 * no longer exists. Declaring it REQUIRED makes an omission a compile error at the wiring site instead
 * of a silent data fault at run time, exactly as AAP-4 argues for the two cleanup ports in
 * `src/services/BaseService.ts`.
 *
 * WHY NOT STATEMENTS IN THIS FILE. Each table named below belongs to a family AAP §0.2.2.1 excludes
 * outright, and `src/domain/product/Product.ts` types the corresponding collections with a deliberately
 * opaque element type because nothing in the port loads or traverses them. Naming their tables in
 * `QueryRunner.ts`'s whitelist would widen "the extracted Catalog schema" by twelve tables drawn from
 * six excluded families, which is the scope creep AAP §0.8.2 Guideline 3 forbids.
 *
 * WHY ONE COLLABORATOR WITH TWO MEMBERS rather than one per table. Every implementation of this
 * contract clears rows keyed on a single identifier in a single owning table, so the twelve statements
 * differ only in the table they name. Twelve injected functions would put the same decision in twelve
 * places; two members put it in two, one per entity, which is the granularity the legacy has.
 */
export interface ProductDependencyCleanup {
  /**
   * Clears every excluded-family row that references one product, before its own row is removed.
   *
   * The implementation OWES, and this list is the contract:
   *
   *   the nine many-to-many link tables of `model/entity/Product.cfc:L79-L90` whose far side is
   *   excluded — `SwProductListingPage` (`:L79`, `Content`), `SwProductCategory` (`:L80`, `Category`),
   *   `SwPromoRewardProduct` (`:L84`), `SwPromoRewardExclProduct` (`:L85`), `SwPromoQualProduct`
   *   (`:L86`), `SwPromoQualExclProduct` (`:L87`), `SwPriceGroupRateProduct` (`:L88`),
   *   `SwVendorProduct` (`:L89`) and `SwPhysicalProduct` (`:L90`) — every one keyed on `productID`;
   *
   *   and the three `cascade="all-delete-orphan"` children of `:L74-L76` whose entities are excluded —
   *   the product's images (`:L74`), its attribute values (`:L75`) and its reviews (`:L76`), likewise
   *   keyed on `productID`.
   *
   * ⚠️ `relatedProducts` (`:L81`) IS DELIBERATELY NOT IN THAT LIST. Its far side is `Product` itself, so
   * it is in scope and {@link MySqlProductPersistence.deleteProduct} clears it directly. The `skus`
   * collection (`:L73`) is likewise handled directly, because `SwSku` is the centre of this slice.
   *
   * @param productID - the 32-character identifier of the product being removed. Never empty: the
   *   caller refuses a transient entity before reaching here.
   */
  removeProductDependencies(productID: string): Promise<void>;

  /**
   * Clears every excluded-family row that references one product type, before its own row is removed.
   *
   * The implementation OWES the eight many-to-many link tables of `model/entity/ProductType.cfc:L69-L76`
   * — `SwPromoRewardProductType`, `SwPromoRewardExclProductType`, `SwPromoQualProductType`,
   * `SwPromoQualExclProductType`, `SwPriceGroupRateProductType`, `SwPriceGrpRateExclProductType`,
   * `SwAttributeSetProductType` and `SwPhysicalProductType`, every one keyed on `productTypeID` — plus
   * the `cascade="all-delete-orphan"` attribute values of `:L67`. All nine belong to excluded families.
   *
   * ⚠️ THE TWO `cascade="all"` COLLECTIONS ARE NOT IN THAT LIST, AND THE REASON IS A VALIDATION FACT
   * RATHER THAN AN OMISSION. `model/entity/ProductType.cfc:L65` declares `childProductTypes` and `:L66`
   * declares `products`, both `cascade="all"`, so the mapping layer would have cascaded a delete into
   * them. But `model/validation/ProductType.json` bounds BOTH at `maxCollection 0` for the delete
   * context, so a product type carrying either is REFUSED before any removal is attempted and the
   * cascade is unreachable. Implementing it would add behaviour the legacy cannot reach.
   *
   * @param productTypeID - the 32-character identifier of the product type being removed. Never empty.
   */
  removeProductTypeDependencies(productTypeID: string): Promise<void>;
}

/* ==================================================================================================
 * THE ADAPTER
 * ============================================================================================== */

/**
 * The MySQL implementation of the product and product-type write surface.
 *
 * Every member is bound into `src/services/ProductService.ts`'s existing seams by the composition root;
 * none of them widens `src/ports/repositories/ProductRepository.ts`, which declares the three business
 * queries `model/dao/ProductDAO.cfc` declares and nothing else. Adding a generic `save` there would
 * turn a business-query port into a CRUD port to serve one call site, which is exactly the reasoning
 * `ProductService` records on its `persistProduct` field.
 */
export class MySqlProductPersistence {
  /**
   * @param executor - The statement executor. Injected, never constructed, and never bypassed: when
   *   `src/adapters/mysql/UnitOfWork.ts` supplies a transaction-scoped executor every statement here
   *   runs inside that boundary and the removal path's read observes the same transaction's writes (M6).
   * @param dependencyCleanup - The excluded-family removal work, per {@link ProductDependencyCleanup}.
   *   Required; see that contract for why an optional one would be unsafe.
   * @param readDefaultSkuId - Reads the identifier of the delegate held in `Product.defaultSku`. See
   *   the association-identity note in the module header for why a plain field read is impossible here.
   */
  public constructor(
    private readonly executor: ProductPersistenceExecutor,
    private readonly dependencyCleanup: ProductDependencyCleanup,
    private readonly readDefaultSkuId: DefaultSkuIdReader,
  ) {}

  /**
   * Persists an already-populated, already-validated product, inserting or updating as its identity
   * requires.
   *
   * This is the port of `getHibachiDAO().save( target=arguments.product )` at
   * `model/service/ProductService.cfc:L287` — the DATA-ACCESS save, called DIRECTLY rather than through
   * `super.save()`. `src/services/ProductService.ts` records at length why that bypass is load-bearing;
   * from this side the consequence is simply that this member is reached by two different routes, the
   * service's own `persistProduct` seam and the product base service's `persist` collaborator, and
   * behaves identically down both.
   *
   * ⚠️ THE INSERT-OR-UPDATE DECISION IS THE ENTITY'S OWN, NOT A PROBE'S. `Product.isNew()` tests
   * `productID === ''`, which is exactly the `unsavedvalue=""` declared at
   * `model/entity/Product.cfc:L52`; the mapping layer made the same distinction from the same value. A
   * pre-flight existence read would be a second, competing source of truth for an answer the entity
   * already holds, and it would issue a statement the legacy path never issued.
   *
   * ⚠️ THE IDENTIFIER IS MINTED HERE AND ONLY HERE (IR-6). On the insert path the value comes from
   * `createSlatwallUUID()` in `src/util/uuid.ts` — the port of `createSlatwallUUID()`
   * [`model/dao/HibachiDAO.cfc:L51-L53`] and, through its delegation, of `createHibachiUUID()`
   * [`org/Hibachi/HibachiObject.cfc:L144-L146`], whose body lower-cases a generated identifier and
   * strips every dash. The result is 32 lowercase hexadecimal characters, which is what
   * `ormtype="string" length="32"` requires. Never an auto-increment, never a dashed form, never upper
   * case. It is assigned to the entity BEFORE the statement is composed, so the product this member
   * resolves carries the identifier the row was written with — and so `Product.isNew()` answers false
   * afterwards, which is what makes `saveProduct`'s fourth step a one-time gate.
   *
   * ⚠️ THE AUDIT COLUMNS ARE WRITTEN AS THE ENTITY HOLDS THEM AND ARE NOT SET HERE. The legacy values
   * are applied by the mapping layer's lifecycle hooks, whose port is
   * `src/domain/base/AuditableEntity.ts` and whose stamping members `Product.preInsert` and
   * `Product.preUpdate` already expose. Stamping them here would put the same decision in two places.
   *
   * ⚠️ THE AFFECTED-ROW COUNT IS DELIBERATELY NOT INSPECTED ON THE UPDATE PATH, because on that path it
   * describes the CONNECTION rather than the ROW — see {@link ProductPersistenceExecutor.executeMutation}.
   * The legacy behaviour points the same way independently: the mapping layer issued no statement at all
   * when nothing was dirty, so a no-op save was never an error there either.
   *
   * ⚠️ NOTHING IS COMMITTED HERE (M5).
   *
   * TEST PROVENANCE: NET-NEW. `meta/tests/unit/IssuesTest.cfc:L51-L71` (`issue_1097`) exercises the
   * legacy save-then-delete path end to end and is TRACEABLE for the behaviour, but no legacy test
   * asserts a statement, because no legacy statement for this table exists.
   *
   * @param product - The fully populated, already-validated product to persist.
   * @returns The same product instance, carrying its identifier. Never null.
   */
  public async saveProduct(product: Product): Promise<Product> {
    const isInsert = product.isNew();

    if (isInsert) {
      product.productID = createSlatwallUUID();
    }

    const writableValues = this.collectProductValues(product);

    if (isInsert) {
      const placeholders = [PRODUCT_COLUMN.productID, ...PRODUCT_WRITABLE_COLUMNS]
        .map(() => BIND_PLACEHOLDER)
        .join(CLAUSE_JOINER);

      await this.executor.executeMutation(
        `INSERT INTO ${PRODUCT_TABLE} (${PRODUCT_COLUMN_LIST}) VALUES (${placeholders})`,
        [product.productID, ...writableValues],
      );

      return product;
    }

    const assignments = PRODUCT_WRITABLE_COLUMNS.map(
      (column) => `${column} = ${BIND_PLACEHOLDER}`,
    ).join(CLAUSE_JOINER);

    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${assignments} ` +
        `WHERE ${PRODUCT_COLUMN.productID} = ${BIND_PLACEHOLDER}`,
      [...writableValues, product.productID],
    );

    return product;
  }

  /**
   * Removes a product, its SKUs and every link row either of them owns.
   *
   * The port of the two lines `org/Hibachi/HibachiService.cfc:L61` and `:L64`, plus the cascade the
   * mapping layer performed inside the second of them. The delete guards of
   * `model/validation/Product.json` — `transactionExistsFlag` `eq false` and `physicalCounts`
   * `maxCollection 0` — run ABOVE this boundary, so a blocked removal never arrives and the member
   * answers `void` rather than a verdict.
   *
   * ==============================================================================================
   * THE SIX STEPS, IN ORDER, AND WHY THE ORDER IS THE ONLY WORKABLE ONE
   * ==============================================================================================
   *   1. REFUSE A TRANSIENT PRODUCT. An entity that reports itself new carries the empty identifier
   *      from `model/entity/Product.cfc:L52`, so every statement below would be keyed on `''` — a
   *      predicate that matches nothing in a sound table and an arbitrary row in an unsound one. The
   *      mapping layer would have raised on the same input, since a transient instance has no
   *      persistent identity to remove.
   *
   *   2. BREAK THE `defaultSkuID` SELF-REFERENCE, WITH ITS OWN UPDATE. `SwProduct.defaultSkuID`
   *      references `SwSku` and `SwSku.productID` references `SwProduct`, so neither row can go while
   *      both point at each other. `model/service/ProductService.cfc:L320-L323` stashes the default SKU
   *      and clears the relationship for exactly this reason, its own comment saying "Remove the default
   *      sku so that we can delete this entity" — and `src/services/ProductService.ts` reproduces that
   *      in memory. ⚠️ THE IN-MEMORY CLEAR IS NOT ENOUGH HERE, and that is the whole reason this step
   *      exists: under CFML the cleared relationship reached the row because Hibernate flushed the dirty
   *      entity, and this port has no flush. Without the explicit statement the stored column would
   *      still name a SKU that step 4 is about to remove.
   *
   *   3. CLEAR THE EXCLUDED-FAMILY ROWS through {@link ProductDependencyCleanup}. Before the product
   *      row, exactly as `org/Hibachi/HibachiService.cfc:L61` precedes `:L64`.
   *
   *   4. CLEAR `SwRelatedProduct`, the one in-scope link table. ⚠️ OWNER SIDE ONLY, and the asymmetry is
   *      reproduced rather than tidied: `model/entity/Product.cfc:L81` carries NO `inverse="true"`, so
   *      this product owns the rows whose `productID` is its own and does NOT own the rows whose
   *      `relatedProductID` is — those belong to other products' collections, and
   *      `org/Hibachi/HibachiEntity.cfc:L277` iterates only this entity's own collection, so the legacy
   *      left them too. Widening the predicate to either column would remove rows the legacy keeps.
   *
   *   5. CASCADE THE SKUs — `model/entity/Product.cfc:L73` declares `cascade="all-delete-orphan"`, and
   *      `:L70` declares `cascade="delete"` on the default SKU, which is one of the same rows. The SKU
   *      identifiers are READ first so each of the four link tables `model/entity/Sku.cfc:L76-L79`
   *      declares can be cleared before the SKU rows themselves; a product with no SKUs issues no
   *      statement for any of the five, because `IN ()` is not legal SQL.
   *
   *   6. REMOVE THE PRODUCT ROW.
   *
   * ⚠️ THE STEPS ARE AWAITED SEQUENTIALLY AND `Promise.all` APPEARS NOWHERE. Each step's statements
   * depend on the previous step's having completed — step 5 cannot precede step 2, and step 6 cannot
   * precede either. Running them concurrently would make the outcome depend on scheduling.
   *
   * ⚠️ NOTHING IS COMMITTED HERE (M5). A caller that wants the six steps atomic supplies a
   * transaction-scoped executor; that boundary belongs to `src/adapters/mysql/UnitOfWork.ts`.
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param product - The already-validated product to remove.
   * @throws {DataIntegrityError} When the product was never persisted and therefore has no row.
   */
  public async deleteProduct(product: Product): Promise<void> {
    /* STEP 1. */
    if (product.isNew()) {
      throw new DataIntegrityError(
        'A product that has never been persisted was handed to the removal path, so there is no row ' +
          'to identify and no statement was issued.',
        { context: { productID: product.productID, className: product.getClassName() } },
      );
    }

    const productID = product.productID;

    /* STEP 2 — the stored column, not just the in-memory relationship. */
    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${PRODUCT_COLUMN.defaultSkuID} = NULL ` +
        `WHERE ${PRODUCT_COLUMN.productID} = ${BIND_PLACEHOLDER}`,
      [productID],
    );

    /* STEP 3 — the excluded families, before the product row. */
    await this.dependencyCleanup.removeProductDependencies(productID);

    /* STEP 4 — the owner side of the self-referencing link table, and only the owner side. */
    await this.executor.executeMutation(
      `DELETE FROM ${RELATED_PRODUCT_TABLE} ` +
        `WHERE ${RELATED_PRODUCT_OWNER_COLUMN} = ${BIND_PLACEHOLDER}`,
      [productID],
    );

    /* STEP 5 — the SKU cascade, link rows first. */
    await this.removeSkusOfProduct(productID);

    /* STEP 6. */
    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TABLE} WHERE ${PRODUCT_COLUMN.productID} = ${BIND_PLACEHOLDER}`,
      [productID],
    );
  }

  /**
   * Persists an already-populated, already-validated product type.
   *
   * The port of the persistence step inside `super.save()` at `model/service/ProductService.cfc:L303`,
   * which resolves to the LOCAL override at `model/service/HibachiService.cfc:L86` (IR-8) and reaches
   * `org/Hibachi/HibachiDAO.cfc:L48-L67` beneath it. Everything the local override adds around that step
   * — the activeFlag handling and the settings-cache post-processing — belongs to
   * `src/services/BaseService.ts` and its two cleanup collaborators, not here.
   *
   * Identical in shape to {@link MySqlProductPersistence.saveProduct}, and identical for the same
   * reasons: the entity's own `isNew()` decides, the identifier is minted on the insert path only, the
   * audit columns are written as held, and the update path does not read the affected-row count. The one
   * association is the SELF-REFERENCING parent at `model/entity/ProductType.cfc:L62`, whose identifier
   * is read off the association object rather than from a scalar the domain does not carry.
   *
   * ⚠️ `productTypeIDPath` IS WRITTEN AS THE ENTITY HOLDS IT AND IS NOT DERIVED HERE. `:L53` declares it
   * a plain persistent column, `src/domain/product/ProductType.ts` owns the walk that reads it, and
   * `model/service/ProductService.cfc:L294-L310` never recomputes it on save. Deriving it at this
   * boundary would add behaviour the legacy save path does not have (AAP §0.7.3 S9).
   *
   * TEST PROVENANCE: NET-NEW, with `meta/tests/unit/IssuesTest.cfc:L51-L71` TRACEABLE for the
   * neighbouring nested-product-type population path.
   *
   * @param productType - The fully populated, already-validated product type to persist.
   * @returns The same product-type instance, carrying its identifier. Never null.
   */
  public async saveProductType(productType: ProductType): Promise<ProductType> {
    const isInsert = productType.isNew();

    if (isInsert) {
      productType.productTypeID = createSlatwallUUID();
    }

    const writableValues = this.collectProductTypeValues(productType);

    if (isInsert) {
      const placeholders = [PRODUCT_TYPE_COLUMN.productTypeID, ...PRODUCT_TYPE_WRITABLE_COLUMNS]
        .map(() => BIND_PLACEHOLDER)
        .join(CLAUSE_JOINER);

      await this.executor.executeMutation(
        `INSERT INTO ${PRODUCT_TYPE_TABLE} (${PRODUCT_TYPE_COLUMN_LIST}) VALUES (${placeholders})`,
        [productType.productTypeID, ...writableValues],
      );

      return productType;
    }

    const assignments = PRODUCT_TYPE_WRITABLE_COLUMNS.map(
      (column) => `${column} = ${BIND_PLACEHOLDER}`,
    ).join(CLAUSE_JOINER);

    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TYPE_TABLE} SET ${assignments} ` +
        `WHERE ${PRODUCT_TYPE_COLUMN.productTypeID} = ${BIND_PLACEHOLDER}`,
      [...writableValues, productType.productTypeID],
    );

    return productType;
  }

  /**
   * Removes a product type and the excluded-family rows that reference it.
   *
   * ⚠️ REQUIRED TO CONSTRUCT, UNREACHABLE THROUGH THIS SLICE'S SEAM — see the module header. A
   * `BaseService<ProductType, …>` cannot be built without a `remove` collaborator, while
   * `src/services/ProductService.ts` narrows its product-type collaborator to `Pick<…, 'save'>`. The
   * member is implemented properly rather than stubbed because
   * `model/validation/ProductType.json` declares four real delete guards, so the capability is genuine
   * legacy behaviour that a later slice's service surface may reach.
   *
   * Two steps only, and the reason there is no cascade step is a validation fact rather than an
   * omission: `model/entity/ProductType.cfc:L65-L66` declares `childProductTypes` and `products` with
   * `cascade="all"`, but `model/validation/ProductType.json` bounds both at `maxCollection 0` for the
   * delete context, so a product type carrying either is refused before any removal is attempted. The
   * remaining child collection, the attribute values of `:L67`, and all eight many-to-many link tables
   * of `:L69-L76` belong to excluded families and are cleared through
   * {@link ProductDependencyCleanup.removeProductTypeDependencies}.
   *
   * ⚠️ THE SELF-REFERENCING PARENT KEY IS NOT REPOINTED. `:L62` declares `parentProductType` and `:L65`
   * declares the inverse `childProductTypes`, so a removed type could in principle orphan children —
   * except the `childProductTypes` delete guard makes that state unreachable. The legacy re-parented
   * nothing and neither does this member.
   *
   * ⚠️ NOTHING IS COMMITTED HERE (M5).
   *
   * TEST PROVENANCE: NET-NEW.
   *
   * @param productType - The already-validated product type to remove.
   * @throws {DataIntegrityError} When the product type was never persisted and therefore has no row.
   */
  public async deleteProductType(productType: ProductType): Promise<void> {
    if (productType.isNew()) {
      throw new DataIntegrityError(
        'A product type that has never been persisted was handed to the removal path, so there is ' +
          'no row to identify and no statement was issued.',
        {
          context: {
            productTypeID: productType.productTypeID,
            /* ⚠️ THE DECLARED CONSTANT, NOT `productType.getClassName()`, AND THE ASYMMETRY WITH THE
             * PRODUCT SIDE ABOVE IS DELIBERATE. `src/domain/product/Product.ts` DECLARES the seven
             * managed-entity members as class methods, so the product path can call one. F22 on
             * `src/domain/product/ProductType.ts` records the opposite decision for THIS entity: the
             * same seven are attached by composition through `manageEntity` and are deliberately not
             * methods of the class, so a bare `ProductType` does not carry `getClassName` and calling
             * it here would not compile. `PRODUCT_TYPE_CLASS_NAME` is derived from the single
             * `PRODUCT_TYPE_ENTITY_METADATA.className` literal that the composed `getClassName()`
             * itself returns, so the value is identical and there is no second literal to drift.
             */
            className: PRODUCT_TYPE_CLASS_NAME,
          },
        },
      );
    }

    const productTypeID = productType.productTypeID;

    await this.dependencyCleanup.removeProductTypeDependencies(productTypeID);

    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TYPE_TABLE} ` +
        `WHERE ${PRODUCT_TYPE_COLUMN.productTypeID} = ${BIND_PLACEHOLDER}`,
      [productTypeID],
    );
  }

  /**
   * Removes every SKU of one product, clearing each SKU's four link tables first.
   *
   * Private, and deliberately not a public capability: it is the interior of one cascade, not a
   * removal a caller may request. A SKU removal in its own right would need the SKU delete guards of
   * `model/validation/Sku.json` — `defaultFlag` and `transactionExistsFlag` — evaluated above it, and
   * nothing in this slice declares that member. Exposing this would offer an entry point that bypasses
   * them.
   *
   * ⚠️ THE IDENTIFIERS ARE READ BEFORE ANYTHING IS REMOVED, and the read is what makes the link-row
   * statements possible: a link table names `skuID` and knows nothing about `productID`, so there is no
   * single predicate that reaches its rows from the product. The read runs on the injected executor so
   * it observes the same transaction's writes (M6).
   *
   * ⚠️ NO STATEMENT IS ISSUED FOR A PRODUCT WITH NO SKUs. An empty identifier list would compose
   * `IN ()`, which is a syntax error rather than an empty match — the same rule `catalogAggregates.ts`
   * records for its loaders.
   *
   * @param productID - The owning product's identifier.
   */
  private async removeSkusOfProduct(productID: string): Promise<void> {
    const skuRows = await this.executor.execute(
      `SELECT ${SKU_ID_COLUMN} FROM ${SKU_TABLE} ` +
        `WHERE ${SKU_PRODUCT_ID_COLUMN} = ${BIND_PLACEHOLDER}`,
      [productID],
    );

    const skuIdentifiers: string[] = [];
    for (const row of skuRows) {
      const value = row[SKU_ID_COLUMN];

      /*
       * ⚠️ AN UNUSABLE IDENTIFIER IS REFUSED, NEVER SKIPPED. `model/entity/Sku.cfc:L52` declares the
       * primary key `ormtype="string" length="32"`, so a non-text or empty value means the schema is not
       * what it is declared to be. Skipping the row would leave that SKU's link rows behind AND then fail
       * the product removal on a foreign-key constraint, with nothing anywhere naming the cause. This
       * matches the posture `catalogAggregates.ts` takes on the same class of value.
       */
      if (typeof value !== 'string' || value.length === 0) {
        throw new DataIntegrityError(
          'A SKU row reached the product removal cascade without a usable primary identifier, so its ' +
            'link rows could not be keyed and no removal statement was issued.',
          { context: { table: SKU_TABLE, column: SKU_ID_COLUMN, receivedType: typeof value } },
        );
      }

      skuIdentifiers.push(value);
    }

    if (skuIdentifiers.length === 0) {
      return;
    }

    const placeholders = skuIdentifiers.map(() => BIND_PLACEHOLDER).join(CLAUSE_JOINER);

    /* The four link tables `model/entity/Sku.cfc:L76-L79` declares, in declaration order. */
    for (const link of SKU_LINK_TABLES) {
      await this.executor.executeMutation(
        `DELETE FROM ${link.table} WHERE ${link.skuID} IN (${placeholders})`,
        [...skuIdentifiers],
      );
    }

    await this.executor.executeMutation(
      `DELETE FROM ${SKU_TABLE} WHERE ${SKU_ID_COLUMN} IN (${placeholders})`,
      [...skuIdentifiers],
    );
  }

  /**
   * Collects the `SwProduct` column values for the write path, in the exact order of
   * {@link PRODUCT_WRITABLE_COLUMNS}.
   *
   * The two lists are read together at both call sites, so they are composed from one ordering and that
   * ordering is `model/entity/Product.cfc`'s own declaration order. A value and a column that disagreed
   * on position would bind a product name into a product code with nothing to report it, so the pairing
   * is stated once, here, rather than at each statement.
   *
   * ABSENT MEANS NULL AT THE BOUNDARY, AND THAT IS NOT A CONTRADICTION OF THE DOMAIN CONVENTION. The
   * domain expresses a legacy null by the ABSENCE of a property — `src/domain/base/populate.ts` deletes
   * the key rather than assigning `undefined`, and `rowMappers.ts` hydrates a null column into an absent
   * property for the same reason. A bind position cannot express absence: the driver's parameter list is
   * positional and every column in the statement needs one value. So absence becomes SQL null exactly at
   * this seam and nowhere earlier.
   *
   * @param product - The product whose values are being written.
   * @returns One bindable value per writable column, in column order.
   */
  private collectProductValues(product: Product): readonly unknown[] {
    const defaultSku = product.defaultSku;

    return [
      product.activeFlag ?? null,
      product.urlTitle ?? null,
      product.productName ?? null,
      product.productCode ?? null,
      product.productDescription ?? null,
      product.publishedFlag ?? null,
      product.sortOrder ?? null,
      product.calculatedSalePrice ?? null,
      product.calculatedQATS ?? null,
      product.calculatedAllowBackorderFlag ?? null,
      product.calculatedTitle ?? null,
      /* Association identity, `model/entity/Product.cfc:L68` — read off the object, not a scalar. */
      product.brand?.brandID ?? null,
      /* `:L69`. */
      product.productType?.productTypeID ?? null,
      /* `:L70` — through the injected reader, because the delegate exposes no identifier accessor. */
      defaultSku === undefined ? null : this.readDefaultSkuId(defaultSku),
      product.remoteID ?? null,
      product.createdDateTime ?? null,
      /* Field `createdByAccount` -> column `createdByAccountID` — `:L97`. */
      product.createdByAccount ?? null,
      product.modifiedDateTime ?? null,
      /* Field `modifiedByAccount` -> column `modifiedByAccountID` — `:L99`. */
      product.modifiedByAccount ?? null,
    ];
  }

  /**
   * The `SwProductType` counterpart of {@link MySqlProductPersistence.collectProductValues}, on the same
   * terms and in the order of {@link PRODUCT_TYPE_WRITABLE_COLUMNS}.
   *
   * @param productType - The product type whose values are being written.
   * @returns One bindable value per writable column, in column order.
   */
  private collectProductTypeValues(productType: ProductType): readonly unknown[] {
    return [
      productType.productTypeIDPath ?? null,
      productType.activeFlag ?? null,
      productType.publishedFlag ?? null,
      productType.urlTitle ?? null,
      productType.productTypeName ?? null,
      productType.productTypeDescription ?? null,
      productType.systemCode ?? null,
      /* Association identity, `model/entity/ProductType.cfc:L62` — the self-referencing parent, with
       * the preserved foreign key as its fallback.
       *
       * ⭐ THIS KEY HAD A ROUND-TRIP GAP AND IT IS NOW CLOSED. The expression used to end at
       * `?? null`, so a product type READ through `./rowMappers.ts` — which leaves
       * `parentProductType` unhydrated on purpose, because an identifier-only parent would make
       * `ProductType.getSimpleRepresentation` return `undefined` and empty the feed's `g:product_type`
       * element — was written back with `NULL` and DETACHED from its parent. Rule 3b in
       * `./rowMappers.ts` preserves the row's key beside the entity, so the association still wins
       * whenever one is resolved and `NULL` is stored only for a genuine root.
       *
       * ⚠️ THIS IS NOT "A SECOND MECHANISM FOR A DECISION ALREADY MADE", which is what an earlier
       * comment here called any compensating read. The decision rule 3a made was about what the
       * ASSOCIATION may contain, and it is unchanged — this slot is still never filled with a
       * reference. Preserving the COLUMN for the write paths is a different question with a different
       * answer, and both persisters read it through the one exported accessor rather than each
       * inventing a lookup. `./MySqlProductTypeRepository.ts`'s `collectWritableValues` applies the
       * identical fallback. */
      productType.parentProductType?.productTypeID ??
        readHydratedParentProductTypeID(productType) ??
        null,
      productType.remoteID ?? null,
      productType.createdDateTime ?? null,
      /* Field `createdByAccount` -> column `createdByAccountID` — `:L84`. */
      productType.createdByAccount ?? null,
      productType.modifiedDateTime ?? null,
      /* Field `modifiedByAccount` -> column `modifiedByAccountID` — `:L86`. */
      productType.modifiedByAccount ?? null,
    ];
  }
}
