/**
 * `MySqlProductRepository` — the MySQL implementation of `ProductRepository`, and the one file in
 * the whole port where behaviour is deliberately not preserved.
 *
 * Legacy origin: `model/dao/ProductDAO.cfc` (441 lines). AAP §0.4.1.7 row 3 specifies this file as
 * "Attribute-set query with defect D20 (the engine-divergence conditional) declared as an intentional
 * single-path simplification; the importer's per-row transaction boundary preserved; all 21
 * interpolated statements replaced with parameterized equivalents — the single declared departure
 * from byte-for-byte preservation, documented as defect D18".
 *
 * Every legacy file cited below is reference-only and is never modified (AAP §0.4.1.1, TR-6).
 *
 * TODO(parity) `model/dao/ProductDAO.cfc` — the component mixes logical entity names with physical
 * table names, most of its 74 `Slatwall*` occurrences sitting in native SQL rather than HQL. They
 * resolve at all only because `org/Hibachi/HibachiDAO.cfc:L102-L106` prefixes the application key onto
 * entity names, which makes `Slatwall*` legitimate ORM vocabulary while the physical tables are
 * `SwProduct`, `SwSku`, `SwProductType`, `SwBrand`, `SwOption`, `SwOptionGroup` and `SwSkuOption`.
 * Every logical name is translated through {@link assertTableName} below; never "fix" an HQL entity
 * name to `Sw*`, and never assume a logical name works in native SQL. The same observation on
 * `model/dao/SkuDAO.cfc` carries the alias D22 at its canonical site,
 * `src/ports/repositories/SkuRepository.ts`; this one is annotated by locator alone.
 */

import {
  assertColumnName,
  assertRegisteredColumnName,
  assertRegisteredTableName,
  assertTableName,
} from './QueryRunner';
import { createSlatwallUUID } from '../../util/uuid';
import { DataIntegrityError, DomainError, NotImplementedError } from '../../errors/DomainError';
import type { Product } from '../../domain/product/Product';
import type { ProductType } from '../../domain/product/ProductType';
import { PRODUCT_TYPE_CLASS_NAME } from '../../domain/product/ProductType';
import type { DefaultSkuIdReader } from '../../domain/sku/Sku';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../domain/base/AuditableEntity';
import { mapProductSearchRow, mapRows, readHydratedParentProductTypeID } from './rowMappers';
/*
 * The only cross-family adapter import in this file, and the reason it is here rather than injected. `DEPRECATED_SETTING_DEFAULTS` is the settings module's table of source-backed
 * defaults for legacy names the port's closed union deliberately excludes; reading it keeps every
 * setting value this port uses enumerable from one module. It is safe in both directions that matter:
 * `../settings/StaticSettingResolver` imports only `../../domain/BaseProductType`,
 * `../../errors/DomainError` and a type-only port, so nothing reaches back into `./` and no cycle is
 * possible; and it touches no configuration, so importing it does not put this file on the
 * `src/config/**` load path that the adapter layer must stay off.
 */
import { DEPRECATED_SETTING_DEFAULTS } from '../settings/StaticSettingResolver';

import type { AccountContextPort } from '../../ports/AccountContextPort';
import type { MySqlRow } from './rowMappers';
import type { PhysicalTableName, SqlExecutor, SqlMutationExecutor } from './QueryRunner';
import type { TransactionScope, UnitOfWork } from './UnitOfWork';
import type {
  AttributeSetRow,
  ProductImportRedirectHop,
  ProductImportSourceBounds,
  ProductImportSourcePolicy,
  ProductRepository,
  ProductSearchRow,
  ValidatedProductImportSource,
} from '../../ports/repositories/ProductRepository';

/*
 * Physical identifiers — every one validated, none interpolated (AAP §0.7.3)
 * Each table constant is produced by passing the legacy logical name to {@link assertTableName}, so the
 * translation happens in code rather than in a comment, so the legacy
 * vocabulary and the physical result side by side. Each column constant is validated against the table
 * it belongs to, so a well-formed name applied to the wrong table is a load-time failure.
 */

/** `SlatwallProduct` ⇒ `SwProduct` [`model/entity/Product.cfc:L49`]. */
const PRODUCT_TABLE: PhysicalTableName = assertTableName('SlatwallProduct');

/** `SlatwallSku` ⇒ `SwSku` [`model/entity/Sku.cfc:L49`]. */
const SKU_TABLE: PhysicalTableName = assertTableName('SlatwallSku');

/** `SlatwallProductType` ⇒ `SwProductType` [`model/entity/ProductType.cfc:L49`]. */
const PRODUCT_TYPE_TABLE: PhysicalTableName = assertTableName('SlatwallProductType');

/** `SlatwallBrand` ⇒ `SwBrand` [`model/entity/Brand.cfc:L49`]. */
const BRAND_TABLE: PhysicalTableName = assertTableName('SlatwallBrand');

/** `SlatwallOption` ⇒ `SwOption` [`model/entity/Option.cfc:L49`]. */
const OPTION_TABLE: PhysicalTableName = assertTableName('SlatwallOption');

/** `SlatwallOptionGroup` ⇒ `SwOptionGroup` [`model/entity/OptionGroup.cfc:L49`]. */
const OPTION_GROUP_TABLE: PhysicalTableName = assertTableName('SlatwallOptionGroup');

/** `SlatwallSkuOption` ⇒ `SwSkuOption`, the link table [`model/entity/Sku.cfc:L76`]. */
const SKU_OPTION_TABLE: PhysicalTableName = assertTableName('SlatwallSkuOption');

/** `SwProduct.productID` — the identifier column named at `model/dao/ProductDAO.cfc:L193`. */
const PRODUCT_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'productID');

/** `SwProduct.productName` — projected by the search at `model/dao/ProductDAO.cfc:L421`. */
const PRODUCT_NAME_COLUMN = assertColumnName(PRODUCT_TABLE, 'productName');

/** `SwProduct.productCode` — read by the second back-fill at `model/dao/ProductDAO.cfc:L307`. */
const PRODUCT_CODE_COLUMN = assertColumnName(PRODUCT_TABLE, 'productCode');

/** `SwProduct.urlTitle` — probed and written by `model/dao/ProductDAO.cfc:L401-L408`. */
const PRODUCT_URL_TITLE_COLUMN = assertColumnName(PRODUCT_TABLE, 'urlTitle');

/** `SwProduct.productTypeID` — the search's optional filter at `model/dao/ProductDAO.cfc:L424`. */
const PRODUCT_PRODUCT_TYPE_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'productTypeID');

/**
 * `SwProduct.defaultSkuID` — the target of the first back-fill, `model/dao/ProductDAO.cfc:L291`.
 */
const PRODUCT_DEFAULT_SKU_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'defaultSkuID');

/** `SwProduct.brandID` — the many-to-one at `model/entity/Product.cfc:L66`. */
const PRODUCT_BRAND_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'brandID');

/* The remaining `SwProduct` columns, added for the generic write. */

/** [`model/entity/Product.cfc:L53`] */
const PRODUCT_ACTIVE_FLAG_COLUMN = assertColumnName(PRODUCT_TABLE, 'activeFlag');

/** [`model/entity/Product.cfc:L57`] */
const PRODUCT_DESCRIPTION_COLUMN = assertColumnName(PRODUCT_TABLE, 'productDescription');

/** [`model/entity/Product.cfc:L58`] */
const PRODUCT_PUBLISHED_FLAG_COLUMN = assertColumnName(PRODUCT_TABLE, 'publishedFlag');

/** [`model/entity/Product.cfc:L59`] */
const PRODUCT_SORT_ORDER_COLUMN = assertColumnName(PRODUCT_TABLE, 'sortOrder');

/** [`model/entity/Product.cfc:L62`] — `ormtype="big_decimal"`. */
const PRODUCT_CALCULATED_SALE_PRICE_COLUMN = assertColumnName(PRODUCT_TABLE, 'calculatedSalePrice');

/** [`model/entity/Product.cfc:L63`] */
const PRODUCT_CALCULATED_QATS_COLUMN = assertColumnName(PRODUCT_TABLE, 'calculatedQATS');

/** [`model/entity/Product.cfc:L64`] */
const PRODUCT_CALCULATED_ALLOW_BACKORDER_FLAG_COLUMN = assertColumnName(
  PRODUCT_TABLE,
  'calculatedAllowBackorderFlag',
);

/** [`model/entity/Product.cfc:L65`] */
const PRODUCT_CALCULATED_TITLE_COLUMN = assertColumnName(PRODUCT_TABLE, 'calculatedTitle');

/** [`model/entity/Product.cfc:L93`] */
const PRODUCT_REMOTE_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'remoteID');

/** [`model/entity/Product.cfc:L96`] */
const PRODUCT_CREATED_DATE_TIME_COLUMN = assertColumnName(PRODUCT_TABLE, 'createdDateTime');

/** [`model/entity/Product.cfc:L97`] */
const PRODUCT_CREATED_BY_ACCOUNT_ID_COLUMN = assertColumnName(PRODUCT_TABLE, 'createdByAccountID');

/** [`model/entity/Product.cfc:L98`] */
const PRODUCT_MODIFIED_DATE_TIME_COLUMN = assertColumnName(PRODUCT_TABLE, 'modifiedDateTime');

/** [`model/entity/Product.cfc:L99`] */
const PRODUCT_MODIFIED_BY_ACCOUNT_ID_COLUMN = assertColumnName(
  PRODUCT_TABLE,
  'modifiedByAccountID',
);

/** Every writable `SwProduct` column in one fixed order, excluding the identifier. */
const PRODUCT_WRITABLE_COLUMNS: readonly string[] = Object.freeze([
  PRODUCT_ACTIVE_FLAG_COLUMN,
  PRODUCT_URL_TITLE_COLUMN,
  PRODUCT_NAME_COLUMN,
  PRODUCT_CODE_COLUMN,
  PRODUCT_DESCRIPTION_COLUMN,
  PRODUCT_PUBLISHED_FLAG_COLUMN,
  PRODUCT_SORT_ORDER_COLUMN,
  PRODUCT_CALCULATED_SALE_PRICE_COLUMN,
  PRODUCT_CALCULATED_QATS_COLUMN,
  PRODUCT_CALCULATED_ALLOW_BACKORDER_FLAG_COLUMN,
  PRODUCT_CALCULATED_TITLE_COLUMN,
  PRODUCT_BRAND_ID_COLUMN,
  PRODUCT_PRODUCT_TYPE_ID_COLUMN,
  PRODUCT_DEFAULT_SKU_ID_COLUMN,
  PRODUCT_REMOTE_ID_COLUMN,
  PRODUCT_CREATED_DATE_TIME_COLUMN,
  PRODUCT_CREATED_BY_ACCOUNT_ID_COLUMN,
  PRODUCT_MODIFIED_DATE_TIME_COLUMN,
  PRODUCT_MODIFIED_BY_ACCOUNT_ID_COLUMN,
]);

/** `SwSku.skuID` — the identifier column named at `model/dao/ProductDAO.cfc:L207`. */
const SKU_ID_COLUMN = assertColumnName(SKU_TABLE, 'skuID');

/** `SwSku.productID` — the join column both back-fills use, `model/dao/ProductDAO.cfc:L290`. */
const SKU_PRODUCT_ID_COLUMN = assertColumnName(SKU_TABLE, 'productID');

/** `SwSku.imageFile` — the target of the second back-fill, `model/dao/ProductDAO.cfc:L307`. */
const SKU_IMAGE_FILE_COLUMN = assertColumnName(SKU_TABLE, 'imageFile');

/** `SwBrand.brandID` — projected by `model/dao/ProductDAO.cfc:L180`. */
const BRAND_ID_COLUMN = assertColumnName(BRAND_TABLE, 'brandID');

/** `SwBrand.brandName` — the bound predicate of that same lookup. */
const BRAND_NAME_COLUMN = assertColumnName(BRAND_TABLE, 'brandName');

/** `SwProductType.productTypeID` — projected by `model/dao/ProductDAO.cfc:L184`. */
const PRODUCT_TYPE_ID_COLUMN = assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID');

/** `SwProductType.productTypeName` — the bound predicate of that same lookup. */
const PRODUCT_TYPE_NAME_COLUMN = assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeName');

/** `SwOptionGroup.optionGroupID` — projected by `model/dao/ProductDAO.cfc:L165` and `:L213`. */
const OPTION_GROUP_ID_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID');

/**
 * `SwOptionGroup.optionGroupName` — the first of three disjuncts at `model/dao/ProductDAO.cfc:L165`.
 */
const OPTION_GROUP_NAME_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupName');

/** `SwOptionGroup.optionGroupCode` — the second of those three disjuncts. */
const OPTION_GROUP_CODE_COLUMN = assertColumnName(OPTION_GROUP_TABLE, 'optionGroupCode');

/** `SwOption.optionID` — projected at `model/dao/ProductDAO.cfc:L213` and inserted at `:L225`. */
const OPTION_ID_COLUMN = assertColumnName(OPTION_TABLE, 'optionID');

/** `SwOption.optionCode` — the join predicate at `model/dao/ProductDAO.cfc:L213`. */
const OPTION_CODE_COLUMN = assertColumnName(OPTION_TABLE, 'optionCode');

/**
 * `SwOption.optionName` — inserted at `model/dao/ProductDAO.cfc:L225`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L225` — the same cell value is written to both `optionCode`
 * and `optionName` when an option has to be created. An imported option therefore has a machine code
 * as its display name. Carried across unchanged.
 */
const OPTION_NAME_COLUMN = assertColumnName(OPTION_TABLE, 'optionName');

/** `SwOption.optionGroupID` — the child side of the group relationship. */
const OPTION_OPTION_GROUP_ID_COLUMN = assertColumnName(OPTION_TABLE, 'optionGroupID');

/** `SwSkuOption.optionID` — half of the link row inserted at `model/dao/ProductDAO.cfc:L232`. */
const SKU_OPTION_OPTION_ID_COLUMN = assertColumnName(SKU_OPTION_TABLE, 'optionID');

/** `SwSkuOption.skuID` — the other half. */
const SKU_OPTION_SKU_ID_COLUMN = assertColumnName(SKU_OPTION_TABLE, 'skuID');

/**
 * The four audit columns of one table, in the canonical casing that table declares.
 *
 * @param table - a validated physical table.
 * @returns the four canonical audit column names for that table.
 */
function auditColumnsOf(table: PhysicalTableName): {
  readonly created: string;
  readonly modified: string;
  readonly createdBy: string;
  readonly modifiedBy: string;
} {
  return {
    created: assertColumnName(table, 'createdDateTime'),
    modified: assertColumnName(table, 'modifiedDateTime'),
    createdBy: assertColumnName(table, 'createdByAccountID'),
    modifiedBy: assertColumnName(table, 'modifiedByAccountID'),
  };
}

/*
 * Cross-domain physical identifiers — every one validated through the one registry
 * boundary crossing, and it is real. `attribute*` is one of the families AAP §0.2.2.1 excludes (6
 * files). The names below are nonetheless required, because two legacy statements reach them and the
 * result of reaching them is observable through the port: the custom-attribute step writes values the
 * importer was asked to import, and the attribute-set selection is a declared member of the port.
 */

/** Tables from excluded families that two legacy statements nonetheless reach. */
const OUT_OF_SCOPE_TABLE = Object.freeze({
  /**
   * `model/entity/AttributeValue.cfc:L54` — written by `model/dao/ProductDAO.cfc:L244` and `:L250`.
   */
  attributeValue: assertRegisteredTableName('SwAttributeValue'),
  /**
   * `model/entity/AttributeSet.cfc:L49` — the root of the selection at `model/dao/ProductDAO.cfc:L53`.
   */
  attributeSet: assertRegisteredTableName('SwAttributeSet'),
  /** `model/entity/Attribute.cfc:L49` — the existence test at `model/dao/ProductDAO.cfc:L54`. */
  attribute: assertRegisteredTableName('SwAttribute'),
  /**
   * `model/entity/AttributeSet.cfc:L70`, `linktable="SwAttributeSetProductType"` — the physical
   * relationship standing in for the association path `model/dao/ProductDAO.cfc:L58` names. See the
   * long note on {@link composeAttributeSetSelection} for why a path-for-path transcription is
   * impossible and why this is a translation decision rather than a repair.
   */
  attributeSetProductType: assertRegisteredTableName('SwAttributeSetProductType'),
  /** `model/entity/Type.cfc:L49` — reached through `attributeSetType` for its `systemCode`. */
  type: assertRegisteredTableName('SwType'),
});

/** Columns on those tables, each read from the declaration cited. */
const OUT_OF_SCOPE_COLUMN = Object.freeze({
  /**
   * `model/entity/AttributeValue.cfc:L57` primary key, generated at `model/dao/ProductDAO.cfc:L248`.
   */
  attributeValueID: assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.attributeValue,
    'attributeValueID',
  ),
  /** `model/entity/AttributeValue.cfc:L58` — the value itself. */
  attributeValue: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attributeValue, 'attributeValue'),
  /** `model/entity/AttributeValue.cfc:L60` — `notnull="true"`, which is why `:L250` supplies it. */
  attributeValueType: assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.attributeValue,
    'attributeValueType',
  ),
  /**
   * `model/entity/AttributeValue.cfc:L78` quick-lookup property, and `model/entity/Attribute.cfc:L52`.
   */
  attributeID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attributeValue, 'attributeID'),
  /** `model/entity/AttributeValue.cfc:L70` `fkcolumn="productID"`. */
  productID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attributeValue, 'productID'),
  /** `model/entity/AttributeSet.cfc:L52` primary key, and `:L67` `fkcolumn="attributeSetID"`. */
  attributeSetID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attributeSet, 'attributeSetID'),
  /** `model/entity/AttributeSet.cfc:L64` `fkcolumn="attributeSetTypeID"`. */
  attributeSetTypeID: assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.attributeSet,
    'attributeSetTypeID',
  ),
  /**
   * `model/entity/AttributeSet.cfc:L57` — the disjunct at `model/dao/ProductDAO.cfc:L57` and `:L60`.
   */
  globalFlag: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attributeSet, 'globalFlag'),
  /**
   * `model/entity/AttributeSet.cfc:L61` — the second sort term at `model/dao/ProductDAO.cfc:L62`.
   */
  sortOrder: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attributeSet, 'sortOrder'),
  /**
   * `model/entity/Attribute.cfc:L53` — the existence predicate at `model/dao/ProductDAO.cfc:L54`.
   */
  activeFlag: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.attribute, 'activeFlag'),
  /** `model/entity/AttributeSet.cfc:L70` `inversejoincolumn="productTypeID"`. */
  productTypeID: assertRegisteredColumnName(
    OUT_OF_SCOPE_TABLE.attributeSetProductType,
    'productTypeID',
  ),
  /** `model/entity/Type.cfc:L52` primary key. */
  typeID: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.type, 'typeID'),
  /** `model/entity/Type.cfc:L55` — the first sort term and the bound filter of the selection. */
  systemCode: assertRegisteredColumnName(OUT_OF_SCOPE_TABLE.type, 'systemCode'),
});

/* Literals that are observable behaviour. */

/** The bind marker for one value in a prepared statement. Never used for an identifier. */
const BIND_PLACEHOLDER = '?';

/** The text placed between consecutive bind markers inside a set-membership clause. */
const PLACEHOLDER_JOINER = ', ';

/** CFML's default list delimiter, and the delimiter every list this file splits actually uses. */
const LIST_DELIMITER = ',';

/** The delimiter separating a file heading's table prefix from its column name, `:L131`-`:L138`. */
const HEADING_DELIMITER = '_';

/**
 * The delimiter `model/dao/ProductDAO.cfc:L74` splits the source location on to find the file type.
 */
const FILE_TYPE_DELIMITER = '.';

/** `chr(44)` from `model/dao/ProductDAO.cfc:L77` — the delimiter for a `csv` source. */
const COMMA_DELIMITER = ',';

/** `chr(9)` from `model/dao/ProductDAO.cfc:L79` — the delimiter for a `txt` source. A tab. */
const TAB_DELIMITER = '\t';

/**
 * The delimiter for every other file type, from `model/dao/ProductDAO.cfc:L75`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L74-L80` — the map recognises exactly two extensions and
 * there is no UNSUPPORTED-type guard. Anything else leaves the delimiter as the empty string
 * initialised at `:L75` and the retrieval proceeds anyway. No guard, no rejection and no default
 * delimiter is added here (AAP §0.7.3, Guideline 4).
 */
const NO_DELIMITER = '';

/**
 * The file type whose branch at `model/dao/ProductDAO.cfc:L83-L85` is empty.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L83-L85` — `if(fileType == "xls"){ //Read xls }` contains A
 * comment and nothing else. A spreadsheet upload therefore leaves the result set as the empty one
 * created at `:L82` and the importer completes having imported nothing, silently and without error.
 * The branch is preserved as an explicit no-op; no spreadsheet reader is added, and this file declares
 * no such dependency (AAP §0.7.3).
 */
const SPREADSHEET_FILE_TYPE = 'xls';

/** The `csv` file type from `model/dao/ProductDAO.cfc:L76`. */
const CSV_FILE_TYPE = 'csv';

/**
 * The `txt` file type from `model/dao/ProductDAO.cfc:L78`, matched case-insensitively for the same reason.
 */
const TEXT_FILE_TYPE = 'txt';

/*
 * — the import-source policy is mandatory, and this file decides none of it
 * what runs. {@link ProductImportSourcePolicy.validateSource} is called once in
 * {@link MySqlProductRepository.importFromFile}, before any transaction opens and before any read member
 * can be reached, and it is the only way to obtain the branded `ValidatedProductImportSource` those read
 * members accept. A location that never met a policy therefore cannot reach a reader — the guarantee is
 * structural, enforced by the type rather than by this comment.
 */

/**
 * The heading prefixes `model/dao/ProductDAO.cfc:L131-L138` classifies on, via `listFirst(column,"_")`.
 */
const HEADING_PREFIX = Object.freeze({
  /** `:L131` — columns saved onto `SwProduct`. */
  product: 'product',
  /** `:L133` — columns saved onto `SwSku`. */
  sku: 'sku',
  /** `:L135` — headings naming an option group. */
  option: 'option',
  /**
   * `:L137` — headings naming a custom attribute, whose identifier is the heading's last segment.
   */
  attribute: 'attribute',
});

/**
 * The text `model/dao/ProductDAO.cfc:L163` strips from an option heading to obtain the group key.
 */
const OPTION_HEADING_PREFIX = 'option_';

/** The product lookup columns, in priority order, from `model/dao/ProductDAO.cfc:L100`. */
const PRODUCT_LOOKUP_COLUMNS: readonly string[] = Object.freeze([
  'product_remoteID',
  'product_productID',
  'product_productCode',
  'product_productName',
]);

/** The SKU lookup column, hard-coded lowercase at `model/dao/ProductDAO.cfc:L109`. */
const SKU_LOOKUP_COLUMN = 'sku_skucode';

/** The field name `model/dao/ProductDAO.cfc:L204` uses when it appends the generated SKU code. */
const SKU_LOOKUP_COLUMN_FIELD = 'skucode';

/**
 * The heading that carries content-page assignments, `model/dao/ProductDAO.cfc:L258` and `:L259`.
 */
const CONTENT_PAGE_COLUMN = 'productcontent_page';

/**
 * The two headings whose absence causes a default to be supplied, `model/dao/ProductDAO.cfc:L143-L148`.
 */
const PRODUCT_DEFAULTED_HEADINGS: readonly { readonly heading: string; readonly name: string }[] =
  Object.freeze([
    { heading: 'product_activeFlag', name: 'activeFlag' },
    { heading: 'product_publishedFlag', name: 'publishedFlag' },
  ]);

/** The value `model/dao/ProductDAO.cfc:L144` and `:L147` supply for a defaulted flag. */
const DEFAULTED_FLAG_VALUE = '1';

/* — which columns an imported file may assign. */

/** The `SwProduct` columns an imported file may assign, compared case-insensitively. */
const IMPORTABLE_PRODUCT_COLUMNS: ReadonlySet<string> = new Set(
  [
    // `model/entity/Product.cfc:L52-L59` — the plain persistent scalars.
    'activeFlag',
    'publishedFlag',
    'productName',
    'productCode',
    'productDescription',
    'sortOrder',
    // `model/entity/Product.cfc:L93`, required by the lookup walk at `model/dao/ProductDAO.cfc:L100`.
    'remoteID',
  ].map((column) => column.toLowerCase()),
);

/** The `SwSku` columns an imported file may assign, compared case-insensitively. */
const IMPORTABLE_SKU_COLUMNS: ReadonlySet<string> = new Set(
  [
    'activeFlag',
    'skuCode',
    'listPrice',
    'price',
    'renewalPrice',
    'imageFile',
    'userDefinedPriceFlag',
  ].map((column) => column.toLowerCase()),
);

/** The deny-by-default answer for any table the importer does not write from file headings. */
const NO_IMPORTABLE_COLUMNS: ReadonlySet<string> = new Set<string>();

/**
 * The importable-column allowlist for one table —.
 *
 * @param table - the already-validated physical table.
 * @returns the normalised set of columns an imported file may assign on that table.
 */
function importableColumnsOf(table: PhysicalTableName): ReadonlySet<string> {
  if (table === PRODUCT_TABLE) {
    return IMPORTABLE_PRODUCT_COLUMNS;
  }

  if (table === SKU_TABLE) {
    return IMPORTABLE_SKU_COLUMNS;
  }

  return NO_IMPORTABLE_COLUMNS;
}

/**
 * Refuses a heading whose column an imported file may not assign —.
 *
 * @param table - the physical table the heading is classified onto.
 * @param heading - the file heading, for example `product_productCode`.
 * @throws DomainError when the column is not on that table's importable allowlist.
 */
function assertImportableColumn(table: PhysicalTableName, heading: string): void {
  const column = normaliseHeading(listLast(heading, HEADING_DELIMITER));

  if (!importableColumnsOf(table).has(column)) {
    throw new DomainError(
      'An imported file named a column that an import may not assign, so the import was refused ' +
        'before any row was written. Identifiers, audit columns, calculated columns and the columns ' +
        'that control a record relationship are set by the importer itself and cannot be supplied by ' +
        'the file.',
      { context: { table, heading, column } },
    );
  }
}

/**
 * Refuses an entire classified heading list before the import begins —.
 *
 * @param table - the physical table the list is classified onto.
 * @param headings - the classified headings for that table.
 * @throws DomainError on the first heading the allowlist refuses.
 */
function assertImportableColumns(table: PhysicalTableName, headings: readonly string[]): void {
  for (const heading of headings) {
    assertImportableColumn(table, heading);
  }
}

/** The discriminator `model/dao/ProductDAO.cfc:L250` writes into `attributeValueType`. */
const PRODUCT_ATTRIBUTE_VALUE_TYPE = 'Product';

/**
 * The separator `model/dao/ProductDAO.cfc:L202` places between the product key and each option value.
 */
const SKU_CODE_SEGMENT_SEPARATOR = '-';

/**
 * The separator `model/dao/ProductDAO.cfc:L405` places before the product code on a URL-title
 * collision, and the separator `:L307` places before the image extension.
 */
const URL_TITLE_COLLISION_SEPARATOR = '_';

/**
 * The `'.'` that `model/dao/ProductDAO.cfc:L307`, `:L313` and `:L320` place before the extension.
 */
const IMAGE_EXTENSION_SEPARATOR = '.';

/*
 * Injected seams — what di/1 property injection and dynamic string lookup became (AAP §0.7.3, R1, R2)
 */

/**
 * The statement-execution surface this adapter needs: the read-plus-write pair, under a local name.
 */
export type ProductStatementExecutor = SqlMutationExecutor;

/** One per-row transaction's execution surface. */
export type ProductImportTransactionScope = TransactionScope;

/** The transaction boundaries the importer needs, and exactly those two. */
export interface ProductImportTransactionBoundary {
  /**
   * Run one independent transaction per item, strictly in order, RETAINING nothing.
   *
   * @typeParam TItem - the item type, one per transaction.
   *
   * @param items - the items in the order they must be processed: a read-only list or a lazy source.
   * @param work - the per-item unit of work, whose result is not retained.
   */
  runPerItemWithoutResults<TItem>(
    items: readonly TItem[] | AsyncIterable<TItem>,
    work: (item: TItem, scope: ProductImportTransactionScope) => Promise<void>,
  ): Promise<void>;

  /**
   * Run work with no transaction at all.
   *
   * @typeParam T - whatever the work produces.
   *
   * @param work - the untransacted work, receiving a pool-bound executor.
   * @returns whatever the work produced.
   */
  runWithoutTransaction<T>(work: (executor: ProductStatementExecutor) => Promise<T>): Promise<T>;
}

/** Proves a type is assignable to another at compile time, and costs nothing at run time. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/** The guarantee, made unbreakable: `unitOfWork` satisfies the boundary this file requires. */
type _UnitOfWorkSatisfiesProductImportTransactionBoundary = AssertAssignable<
  UnitOfWork,
  ProductImportTransactionBoundary
>;

/** One record of a retrieved delimited file, keyed by its heading. */
export type DelimitedImportRecord = Readonly<Record<string, string>>;

/** A retrieved delimited file: its headings, and its records. */
export interface DelimitedImportRecordSet {
  /** The headings, in file order and in their original casing. */
  readonly columnList: readonly string[];

  /**
   * The records, in file order. The port of the query's rows, `data.recordcount` being their count.
   */
  readonly rows: readonly DelimitedImportRecord[];
}

/*
 * The content-assignment boundary, and why it is a port rather than a refusal. The legacy step queries
 * `tContent`, probes the assignment and inserts it, so refusing the import would be a different outcome
 * rather than a translation. TR-5 states the remedy: declare the port, implement the member against it
 * and flag the gap — never drop the member.
 */

/** A content page resolved from the content-management application — the result of `:L262`. */
export interface ResolvedProductListingContent {
  /** The content identifier, `tContent.contentID` at `:L262`. */
  readonly contentId: string;

  /** The content path, `tContent.path` at `:L262`. */
  readonly contentPath: string;
}

/**
 * One content assignment to insert — the four values `:L277` writes, in that statement's column order.
 */
export interface ProductContentAssignmentRow {
  /** The link row's own primary key, minted by the caller at `:L275`. */
  readonly productContentId: string;
  /** The resolved content identifier. */
  readonly contentId: string;
  /** The resolved content path, denormalised exactly as `:L277` denormalises it. */
  readonly contentPath: string;
  /** The product the page is being assigned to. */
  readonly productId: string;
}

/**
 * The out-of-scope data access the content-assignment step needs — three calls, no business logic.
 */
export interface ProductContentAssignmentPort {
  /**
   * Resolve one content page by file name — `:L262`.
   *
   * @param pageFileName - one file name from the comma-delimited cell, after `:L259`'s split.
   * @returns the content identifier and path, or `null` when `:L269`'s `recordcount` would be zero.
   */
  findProductListingContent(pageFileName: string): Promise<ResolvedProductListingContent | null>;

  /**
   * Report whether the product already carries this content assignment — `:L271`.
   *
   * @returns `true` when a link row exists, which makes the insert a no-op at `:L272`.
   */
  hasContentAssignment(productId: string, contentId: string): Promise<boolean>;

  /** Insert one content assignment — `:L277`. */
  insertContentAssignment(row: ProductContentAssignmentRow): Promise<void>;
}

/**
 * Builds a {@link ProductContentAssignmentPort} bound to one import row's transaction.
 *
 * @param scope - the transaction the row is executing in.
 * @returns the port for that row, valid only for the life of that transaction.
 */
export type ProductContentAssignmentFactory = (
  scope: ProductImportTransactionScope,
) => ProductContentAssignmentPort;

/** The default content-assignment factory: it answers the refusing port, ignoring the scope. */
export const unresolvableProductContentAssignmentFactory: ProductContentAssignmentFactory = () =>
  unresolvableProductContentAssignmentPort;

/**
 * The default content-assignment collaborator: it refuses, because this subtree owns neither schema.
 */
export const unresolvableProductContentAssignmentPort: ProductContentAssignmentPort = {
  findProductListingContent(pageFileName: string): Promise<ResolvedProductListingContent | null> {
    return Promise.reject(
      new NotImplementedError(
        'ProductContentAssignmentPort.findProductListingContent',
        'model/dao/ProductDAO.cfc:L262 resolves an imported content page against tContent, a MURA CMS ' +
          'table belonging to a different application, and AAP §0.2.2.1 excludes the Content family ' +
          'along with its SlatwallProductContent link table, so neither identifier may be composed in ' +
          'this subtree; supply a ProductContentAssignmentPort to complete the step',
        {
          context: {
            pageFileName,
            locator: 'model/dao/ProductDAO.cfc:L262',
            outOfScopeTables: ['tContent', 'SlatwallProductContent'],
            aapExclusion: '§0.2.2.1 Content*',
          },
        },
      ),
    );
  },

  hasContentAssignment(productId: string, contentId: string): Promise<boolean> {
    return Promise.reject(
      new NotImplementedError(
        'ProductContentAssignmentPort.hasContentAssignment',
        'model/dao/ProductDAO.cfc:L271 probes SlatwallProductContent, whose family AAP §0.2.2.1 ' +
          'excludes; supply a ProductContentAssignmentPort to complete the step',
        { context: { productId, contentId, locator: 'model/dao/ProductDAO.cfc:L271' } },
      ),
    );
  },

  insertContentAssignment(row: ProductContentAssignmentRow): Promise<void> {
    return Promise.reject(
      new NotImplementedError(
        'ProductContentAssignmentPort.insertContentAssignment',
        'model/dao/ProductDAO.cfc:L277 inserts into SlatwallProductContent, whose family AAP §0.2.2.1 ' +
          'excludes; supply a ProductContentAssignmentPort to complete the step',
        { context: { ...row, locator: 'model/dao/ProductDAO.cfc:L277' } },
      ),
    );
  },
};

/**
 * Retrieves and parses the delimited file — the injected replacement for the legacy's hidden HTTP call.
 */
export interface ProductImportSourceReader {
  /** The operator-supplied policy this reader enforces before it retrieves anything. */
  readonly sourcePolicy: ProductImportSourcePolicy;

  /**
   * Retrieve the delimited file and parse it into headings and records.
   *
   * @param fileURL - the caller's location, byte-for-byte as the caller supplied it. No gate in this
   * file has judged its scheme, its userinfo component or its host — only the injected
   * {@link ProductImportSourcePolicy} has, and only to whatever depth the operator implemented (see "the
   * import-source policy is mandatory" near the top of this file). All four obligations above are what an
   * implementer owes, and the residual CWE-918 exposure is carried as mismatch M4.
   *
   * @param delimiter - the field delimiter resolved from the file type, `''` for an unrecognised type.
   */
  read(
    source: ValidatedProductImportSource,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordSet>;

  /**
   * Retrieve the delimited file and expose its headings up front and its records one at a time.
   *
   * @param source - the location, already validated, exactly as the materialising member receives it.
   * @param delimiter - the field delimiter resolved from the file type, `''` for an unrecognised type.
   * @param textQualifier - the text qualifier, `''` by default per `model/dao/ProductDAO.cfc:L73`.
   * @returns the headings, and a lazy source of the records.
   */
  readStreaming?(
    source: ValidatedProductImportSource,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordStream>;
}

/** A retrieved delimited file whose headings are known up front and whose records arrive lazily. */
export interface DelimitedImportRecordStream {
  /**
   * The headings, in file order and in their original casing — complete before the first record.
   */
  readonly columnList: readonly string[];

  /**
   * The records, in file order, one at a time. See {@link ProductImportSourceReader.readStreaming}.
   */
  readonly records: AsyncIterable<DelimitedImportRecord>;
}

/**
 * The production {@link ProductImportSourceReader} — and it refuses, because the legacy call it ports
 * has never been able to resolve.
 */
export const unresolvableProductImportSourceReader: ProductImportSourceReader = {
  /*
   * A policy that refuses, rather than a policy that invents. The interface requires a policy, and
   * this reader retrieves nothing, so every member declines for the same documented reason the reader
   * itself declines. That is what lets the contract be mandatory while the subtree still states no scheme,
   * no host, no address range and no numeric bound (AAP §0.7.3, IR-12).
   */
  sourcePolicy: {
    validateSource(fileURL: string): Promise<ValidatedProductImportSource> {
      return Promise.reject(
        new NotImplementedError(
          'ProductImportSourcePolicy.validateSource',
          'the legacy import performs no source validation because it cannot retrieve at all: ' +
            'model/dao/ProductDAO.cfc:L87 resolves getService("utilityTagService"), a bean declared ' +
            'nowhere in the legacy repository, and the only other retrieval text, a new http() ' +
            'sequence at :L89-L98, is commented out; an operator supplying a retrieving reader must ' +
            'supply the policy with it, and its ' +
            "scheme, host, address and bound values are not this port's to invent",
          {
            context: {
              fileURL,
              locator: 'model/dao/ProductDAO.cfc:L87',
              absentBean: 'utilityTagService',
              mismatch: 'M4',
              weakness: 'CWE-918',
            },
          },
        ),
      );
    },

    revalidateRedirectHop(hop: ProductImportRedirectHop): Promise<ValidatedProductImportSource> {
      return Promise.reject(
        new NotImplementedError(
          'ProductImportSourcePolicy.revalidateRedirectHop',
          'no redirect can be reached, because no retrieval is performed; a retrieving reader must ' +
            're-validate every hop against the address it will connect to',
          {
            context: {
              location: hop.location,
              resolvedAddress: hop.resolvedAddress,
              mismatch: 'M4',
              weakness: 'CWE-918',
            },
          },
        ),
      );
    },

    readBounds(): ProductImportSourceBounds {
      throw new NotImplementedError(
        'ProductImportSourcePolicy.readBounds',
        'a byte cap, a transfer timeout and a redirect cap are required of any retrieving reader, and ' +
          'the legacy states none of the three, so no value is invented here (AAP §0.7.3 standard 9, ' +
          'IR-12); the operator supplies them with the reader',
        {
          context: { mismatch: 'M4', required: ['maxBytes', 'maxMilliseconds', 'maxRedirectHops'] },
        },
      );
    },
  },

  read(
    source: ValidatedProductImportSource,
    delimiter: string,
    textQualifier: string,
  ): Promise<DelimitedImportRecordSet> {
    return Promise.reject(
      new NotImplementedError(
        'ProductImportSourceReader.read',
        'model/dao/ProductDAO.cfc:L87 retrieves the import file through ' +
          'getService("utilityTagService").cfhttp(...), and no utilityTagService bean is declared ' +
          'anywhere in the legacy repository — the single occurrence of the name is that call ' +
          'itself — so the legacy import has never been able to retrieve a file; the only other ' +
          'retrieval text, a new http() sequence at :L89-L98, is commented out, and no retrieval ' +
          'client is invented here',
        {
          context: {
            fileURL: source,
            delimiter,
            textQualifier,
            locator: 'model/dao/ProductDAO.cfc:L87',
            absentBean: 'utilityTagService',
            mismatch: 'M4',
          },
        },
      ),
    );
  },
};

/**
 * Produces a URL title from a product name — the injected replacement for a call to a member that does
 * not exist.
 *
 * @param productName - the product name cell of the row being inserted.
 * @returns the candidate URL title.
 */
export type ImportUrlTitleFilter = (productName: string) => string;

/**
 * The production {@link ImportUrlTitleFilter} — and it refuses, for the same reason the reader above
 * does, but by a materially different mechanism worth stating precisely.
 */
export const unresolvableImportUrlTitleFilter: ImportUrlTitleFilter = (
  productName: string,
): string => {
  throw new NotImplementedError(
    'ImportUrlTitleFilter',
    'model/dao/ProductDAO.cfc:L399 derives the URL title through ' +
      'getService("hibachiUtilityService").filterFileName(...); the bean resolves but the member is ' +
      'declared nowhere in the legacy repository — the single occurrence of the name is that call ' +
      'itself — and org/Hibachi/HibachiService.cfc:L255-L280 fabricates only the ' +
      'get/new/list/save/delete/count/export/process prefixes, so the unmatched "filter" prefix ' +
      'reaches the throw at :L280; no filename algorithm is invented here',
    {
      context: {
        productName,
        locator: 'model/dao/ProductDAO.cfc:L399',
        absentMember: 'hibachiUtilityService.filterFileName',
        fabricationHandler: 'org/Hibachi/HibachiService.cfc:L255-L280',
      },
    },
  );
};

/** The collaborators this repository is constructed with. */
export interface MySqlProductRepositoryDependencies {
  /**
   * The pool-bound execution surface, for the three regions the legacy runs outside any transaction:
   * The attribute-set selection, the option-group pre-pass at `model/dao/ProductDAO.cfc:L161-L173`
   * (which sits before `transaction{` opens at `:L177`), and the product search.
   */
  readonly executor: ProductStatementExecutor;

  /**
   * The two transaction boundaries of the importer. See {@link ProductImportTransactionBoundary}.
   */
  readonly transactions: ProductImportTransactionBoundary;

  /** The retrieval collaborator. See {@link ProductImportSourceReader}. */
  readonly sourceReader: ProductImportSourceReader;

  /** The content-assignment collaborator factory — `model/dao/ProductDAO.cfc:L257-L282`. */
  readonly contentAssignment: ProductContentAssignmentFactory;

  /**
   * The current-account context, replacing `getSlatwallScope().getCurrentAccount().getAccountID()` at
   * `model/dao/ProductDAO.cfc:L153` and again at `:L341`.
   */
  readonly accountContext: AccountContextPort;

  /** The URL-title transform. See {@link ImportUrlTitleFilter}. */
  readonly urlTitleFilter: ImportUrlTitleFilter;

  /** Reads the identifier of a product's default SKU, for the `defaultSkuID` foreign key. */
  readonly readDefaultSkuId: DefaultSkuIdReader;
}

/** One `{name, value}` pair of the legacy `extraData` arrays. */
export interface ImportFieldAssignment {
  /** The column name, already stripped of any table prefix — `activeFlag`, `brandID`, `skucode`. */
  readonly name: string;
  /** The value, as text. */
  readonly value: string;
}

/*
 * CFML list and string semantics, reproduced exactly
 * The legacy leans on four CFML behaviours that TypeScript does not share, and every one of them
 * changes an outcome rather than merely a spelling. They are reproduced here, once each, so no call
 * site has to remember them.
 */

/**
 * Splits a delimited list the way CFML's `listToArray` does: empty tokens are dropped.
 *
 * @param value - the delimited text.
 * @param delimiter - the single-character delimiter.
 * @returns the non-empty tokens, in order.
 */
function listToArray(value: string, delimiter: string): string[] {
  const tokens: string[] = [];

  for (const token of value.split(delimiter)) {
    if (token.length > 0) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * The first token of a delimited list, or the empty string when there is none.
 *
 * @param value - the delimited text.
 * @param delimiter - the single-character delimiter.
 * @returns the first token, or `''` when the text contains none.
 */
function listFirst(value: string, delimiter: string): string {
  return listToArray(value, delimiter)[0] ?? '';
}

/**
 * The last token of a delimited list, or the empty string when there is none.
 *
 * @param value - the delimited text.
 * @param delimiter - the single-character delimiter.
 * @returns the last token, or `''` when the text contains none.
 */
function listLast(value: string, delimiter: string): string {
  const tokens = listToArray(value, delimiter);

  return tokens[tokens.length - 1] ?? '';
}

/**
 * Case-insensitive membership, the port of `listFindNoCase` and `arrayFindNoCase`.
 *
 * @param values - the candidate list.
 * @param candidate - the value to look for.
 * @returns `true` when any entry matches ignoring case and surrounding whitespace.
 */
function containsNoCase(values: readonly string[], candidate: string): boolean {
  const normalisedCandidate = normaliseHeading(candidate);

  return values.some((value) => normaliseHeading(value) === normalisedCandidate);
}

/**
 * Normalises a heading or a file type for case-insensitive comparison and lookup.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L179` and `:L183` — this is the column-key casing decision,
 * made once and stated once. CFML struct keys are case-insensitive, so `data['brand_brandname'][r]` at
 * `:L180` resolves against a file heading spelled `brand_brandName`, `Brand_BrandName` or any other
 * casing. A TypeScript record lookup would silently miss all but the exact spelling, and a miss here
 * produces no error at all — it produces an import that quietly fails to find a brand on real-world
 * files.
 *
 * @param value - a heading or file type in any casing.
 * @returns the normalised form used as a lookup key.
 */
function normaliseHeading(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Removes the first case-insensitive occurrence of a prefix, the port of
 * `replaceNoCase(value, search, "", "one")`.
 *
 * @param value - the text to strip.
 * @param search - the prefix text to remove, matched ignoring case.
 * @returns the text with the first occurrence removed, or unchanged when there is none.
 */
function removeFirstNoCase(value: string, search: string): string {
  const position = value.toLowerCase().indexOf(search.toLowerCase());

  if (position < 0) {
    return value;
  }

  return value.slice(0, position) + value.slice(position + search.length);
}

/**
 * Splits a comma-delimited list for binding, the port of `cfqueryparam … list="true"`.
 *
 * @param value - the comma-delimited text.
 * @returns one value to bind per token, in order, empties included.
 */
function splitBoundList(value: string): string[] {
  return value.split(LIST_DELIMITER);
}

/**
 * Renders the bind markers for a set-membership clause.
 *
 * @param count - how many values will be bound.
 * @returns the joined bind markers.
 * @throws {DomainError} when `count` is not a positive integer.
 */
function toPlaceholderList(count: number): string {
  if (!Number.isInteger(count) || count < 1) {
    throw new DomainError(
      'A set-membership clause was composed with no bind markers, which is not a statement any ' +
        'engine accepts. Bind at least one value, as the legacy list binding always did.',
      { context: { count } },
    );
  }

  return new Array<string>(count).fill(BIND_PLACEHOLDER).join(PLACEHOLDER_JOINER);
}

/* Typed reads — where the legacy's unguarded accesses become explicit (AAP §0.7.3) */

/**
 * Reads one projected text column out of a row.
 *
 * @param row - one raw row.
 * @param columnName - a validated column name.
 * @returns the column's text, or `''` when it is NULL.
 * @throws {DataIntegrityError} when the column is absent from the row.
 * @throws {DomainError} when the column holds a value that is not text.
 */
function readTextColumn(row: MySqlRow, columnName: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, columnName)) {
    throw new DataIntegrityError(
      'A projected column is missing from the row the database returned, so the statement and the ' +
        'reader that consumes it have drifted apart.',
      { context: { columnName, availableColumns: Object.keys(row) } },
    );
  }

  const value = row[columnName];

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new DomainError(
      'A projected column holds a value that is not text, so it cannot be read as an identifier or ' +
        'a code.',
      { context: { columnName, valueType: typeof value } },
    );
  }

  return value;
}

/**
 * Reads a column from the first row of a result, yielding `''` when there are no rows.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L182`, `:L186`, `:L216` and `:L390` — the legacy performed
 * this read with no record-COUNT guard, and at `:L390` it performed it before the existence test at
 * `:L392` that would have told it whether there was anything to read. Those reads survived only because
 * a CFML query column used in a string context yields the empty string when the query is empty and the
 * first row's value otherwise.
 *
 * @param rows - the rows a statement returned.
 * @param columnName - a validated column name.
 * @returns the first row's value, or `''` when there are no rows.
 * @throws {DataIntegrityError} when there is a row but the column is absent from it.
 * @throws {DomainError} when the column holds a value that is not text.
 */
function readFirstRowText(rows: readonly MySqlRow[], columnName: string): string {
  const first = rows[0];

  if (first === undefined) {
    return '';
  }

  return readTextColumn(first, columnName);
}

/** One record of a retrieved file, with its one-based position preserved. */
interface NormalisedImportRow {
  /** The one-based position, the port of `r` from `model/dao/ProductDAO.cfc:L176`. */
  readonly rowNumber: number;
  /** The cells, keyed by {@link normaliseHeading} of their heading. */
  readonly cells: ReadonlyMap<string, string>;
}

/** A retrieved file with its headings preserved and its cell keys normalised. */
interface NormalisedImportData {
  readonly columnList: readonly string[];
  readonly rows: AsyncIterable<NormalisedImportRow>;
}

/**
 * Normalises one record, at the moment it is about to be imported.
 *
 * @param record - one record as the reader produced it.
 * @param rowNumber - its one-based position, the port of `r` from `model/dao/ProductDAO.cfc:L176`.
 * @returns the normalised row every read below uses.
 */
function normaliseRecord(record: DelimitedImportRecord, rowNumber: number): NormalisedImportRow {
  const cells = new Map<string, string>();
  for (const [heading, value] of Object.entries(record)) {
    cells.set(normaliseHeading(heading), value);
  }

  return { rowNumber, cells };
}

/**
 * Normalises records as they arrive, one at a time, numbering them from one in arrival order.
 *
 * @param records - the records, in file order.
 * @returns the normalised rows, in the same order, lazily.
 */
async function* normaliseRecords(
  records: AsyncIterable<DelimitedImportRecord> | Iterable<DelimitedImportRecord>,
): AsyncGenerator<NormalisedImportRow> {
  let rowNumber = 0;

  for await (const record of records) {
    rowNumber += 1;
    yield normaliseRecord(record, rowNumber);
  }
}

/**
 * Reads one cell, raising when the heading is not in the file.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L180`, `:L184`, `:L399` and `:L405` — the legacy reads
 * `data['brand_brandname'][r]`, `data['productType_productTypeName'][r]`,
 * `data['product_productName'][r]` and `data['product_productCode'][r]` unconditionally, without ever
 * checking that the file carries those headings. A file lacking any one of them makes the legacy raise
 * an undefined-element error part-way through the import, leaving the rows already committed committed
 * — the M3 partial-import shape. That outcome is preserved: this raises, with the heading named, and
 * the per-row boundary that was open rolls back while earlier rows stay committed. No default cell
 * value is invented (AAP §0.7.3).
 *
 * @param row - the normalised row.
 * @param heading - the heading to read, in any casing.
 * @returns the cell's text.
 * @throws {DataIntegrityError} when the file carries no such heading.
 */
function readCell(row: NormalisedImportRow, heading: string): string {
  const value = row.cells.get(normaliseHeading(heading));

  if (value === undefined) {
    throw new DataIntegrityError(
      'The imported file does not carry a column the importer requires for this row, so the row ' +
        'cannot be saved.',
      { context: { heading, rowNumber: row.rowNumber } },
    );
  }

  return value;
}

/*
 * Statement composition — every value a bind marker, every identifier validated (AAP §0.7.3, D18)
 * The composers are pure and take no executor, so `test/adapters/MySqlProductRepository.test.ts` can
 * assert on the exact text without a database (AAP §0.7.3). Not one of them accepts a fragment, a raw
 * expression or a pre-built clause: there is no seam here through which caller-supplied text could
 * reach statement text, which is what makes D18's closure structural rather than careful.
 */

/**
 * The attribute-set selection — the translation of `model/dao/ProductDAO.cfc:L52-L71`.
 *
 * TODO(parity) D20 — `model/dao/ProductDAO.cfc:L64` carries one of only three literal TODO comments
 * in the entire slice, and only the second of two conditionals collapses. This is the single easiest
 * mistake to make in this file, because the two conditionals test the same predicate nine lines apart
 * and look like duplicated logic:
 *
 * - `:L56-L61` is HQL shaping and is preserved in full. A non-empty product-type list produces
 * `AND (globalFlag = 1 OR exists(...))`; an empty one produces `AND globalFlag = 1`. Collapsing it
 * changes which attribute sets come back, and it would still compile and still pass any test that
 * merely checks a statement was built. Both branches survive below.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L58` — the association the legacy names does not exist, and
 * the physical relationship is substituted as a translation decision. `:L58` reads
 * `exists(FROM sas.attributeSetAssignments asa WHERE asa.productTypeID IN (:productTypeIDs))`, but
 * `model/entity/AttributeSet.cfc` declares no `attributeSetAssignments` property, and no
 * `AttributeSetAssignment` entity exists anywhere in `model/entity/` — the directory holds only
 * `Attribute.cfc`, `AttributeOption.cfc`, `AttributeSet.cfc` and `AttributeValue.cfc`. A
 * repository-wide search for the name returns five hits: four inside
 * `model/entity/ProductType.cfc:L94-L98`, where it is a runtime-synthesized smart list, and this one.
 *
 * @param attributeSetTypeCodeCount - how many system codes will be bound. At least one.
 * @param productTypeIdCount - how many product-type identifiers will be bound. Zero selects the
 * `globalFlag = 1` shape of `:L60`; anything else selects the disjunctive shape of `:L57-L58`.
 *
 * @returns the statement text.
 * @throws {DomainError} when `attributeSetTypeCodeCount` is not a positive integer.
 */
export function composeAttributeSetSelection(
  attributeSetTypeCodeCount: number,
  productTypeIdCount: number,
): string {
  const typeCodePlaceholders = toPlaceholderList(attributeSetTypeCodeCount);

  // `:L56-L61`, preserved in full. Both branches, unchanged.
  const globalOrAssignedClause =
    productTypeIdCount > 0
      ? `( sas.${OUT_OF_SCOPE_COLUMN.globalFlag} = 1
        OR EXISTS (
          SELECT 1
          FROM ${OUT_OF_SCOPE_TABLE.attributeSetProductType} asa
          WHERE asa.${OUT_OF_SCOPE_COLUMN.attributeSetID} = sas.${OUT_OF_SCOPE_COLUMN.attributeSetID}
            AND asa.${OUT_OF_SCOPE_COLUMN.productTypeID} IN (${toPlaceholderList(productTypeIdCount)})
        ) )`
      : `sas.${OUT_OF_SCOPE_COLUMN.globalFlag} = 1`;

  return `SELECT
    sas.*
  FROM
    ${OUT_OF_SCOPE_TABLE.attributeSet} sas
    INNER JOIN ${OUT_OF_SCOPE_TABLE.type} ast
      ON ast.${OUT_OF_SCOPE_COLUMN.typeID} = sas.${OUT_OF_SCOPE_COLUMN.attributeSetTypeID}
  WHERE
    ( EXISTS (
        SELECT 1
        FROM ${OUT_OF_SCOPE_TABLE.attribute} sa
        WHERE sa.${OUT_OF_SCOPE_COLUMN.attributeSetID} = sas.${OUT_OF_SCOPE_COLUMN.attributeSetID}
          AND sa.${OUT_OF_SCOPE_COLUMN.activeFlag} = 1
      )
      AND ast.${OUT_OF_SCOPE_COLUMN.systemCode} IN (${typeCodePlaceholders}) )
    AND ${globalOrAssignedClause}
  ORDER BY
    ast.${OUT_OF_SCOPE_COLUMN.systemCode} ASC,
    sas.${OUT_OF_SCOPE_COLUMN.sortOrder} ASC`;
}

/**
 * The option-group lookup — the translation of `model/dao/ProductDAO.cfc:L164-L166`.
 *
 * @returns the statement text: three bind markers, all for the same value.
 */
const OPTION_GROUP_LOOKUP_STATEMENT = `SELECT
    ${OPTION_GROUP_ID_COLUMN}
  FROM
    ${OPTION_GROUP_TABLE}
  WHERE
    ${OPTION_GROUP_NAME_COLUMN} = ${BIND_PLACEHOLDER}
    OR ${OPTION_GROUP_CODE_COLUMN} = ${BIND_PLACEHOLDER}
    OR ${OPTION_GROUP_ID_COLUMN} = ${BIND_PLACEHOLDER}`;

/**
 * The brand lookup — the translation of `model/dao/ProductDAO.cfc:L179-L181`, a file-fed D18 site.
 */
const BRAND_LOOKUP_STATEMENT = `SELECT
    ${BRAND_ID_COLUMN}
  FROM
    ${BRAND_TABLE}
  WHERE
    ${BRAND_NAME_COLUMN} = ${BIND_PLACEHOLDER}`;

/**
 * The product-type lookup — the translation of `model/dao/ProductDAO.cfc:L183-L185`, a file-fed D18
 * site. Same shape and same no-match behaviour as the brand lookup above.
 */
const PRODUCT_TYPE_LOOKUP_STATEMENT = `SELECT
    ${PRODUCT_TYPE_ID_COLUMN}
  FROM
    ${PRODUCT_TYPE_TABLE}
  WHERE
    ${PRODUCT_TYPE_NAME_COLUMN} = ${BIND_PLACEHOLDER}`;

/** The option lookup — the translation of `model/dao/ProductDAO.cfc:L212-L214`. */
const OPTION_LOOKUP_STATEMENT = `SELECT
    ${OPTION_TABLE}.${OPTION_ID_COLUMN},
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN}
  FROM
    ${OPTION_GROUP_TABLE}
    LEFT JOIN ${OPTION_TABLE}
      ON ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN} = ${OPTION_TABLE}.${OPTION_OPTION_GROUP_ID_COLUMN}
      AND ${OPTION_TABLE}.${OPTION_CODE_COLUMN} = ${BIND_PLACEHOLDER}
  WHERE
    ${OPTION_GROUP_TABLE}.${OPTION_GROUP_ID_COLUMN} = ${BIND_PLACEHOLDER}
  FOR UPDATE`;

/** The SKU-option existence test — the translation of `model/dao/ProductDAO.cfc:L218-L220`. */
const SKU_OPTION_EXISTENCE_STATEMENT = `SELECT
    1
  FROM
    ${SKU_OPTION_TABLE}
  WHERE
    ${SKU_OPTION_OPTION_ID_COLUMN} = ${BIND_PLACEHOLDER}
    AND ${SKU_OPTION_SKU_ID_COLUMN} = ${BIND_PLACEHOLDER}
  LIMIT 1
  FOR UPDATE`;

/** The option insert — the translation of `model/dao/ProductDAO.cfc:L224-L226`. */
const OPTION_INSERT_STATEMENT = ((): string => {
  const audit = auditColumnsOf(OPTION_TABLE);

  return `INSERT INTO ${OPTION_TABLE}
    (${OPTION_ID_COLUMN}, ${OPTION_OPTION_GROUP_ID_COLUMN}, ${OPTION_CODE_COLUMN}, ${OPTION_NAME_COLUMN},
     ${audit.created}, ${audit.modified}, ${audit.createdBy}, ${audit.modifiedBy})
  VALUES
    (${toPlaceholderList(8)})`;
})();

/** The link-row insert — the translation of `model/dao/ProductDAO.cfc:L231-L233`. */
const SKU_OPTION_INSERT_STATEMENT = `INSERT INTO ${SKU_OPTION_TABLE}
    (${SKU_OPTION_OPTION_ID_COLUMN}, ${SKU_OPTION_SKU_ID_COLUMN})
  VALUES
    (${toPlaceholderList(2)})`;

/**
 * The custom-attribute update — the translation of `model/dao/ProductDAO.cfc:L243-L245`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L247` — the branch is on the affected-row count, which is
 * not the same as "A row EXISTS". An update whose new value equals the stored value reports zero
 * affected rows by default, so the legacy proceeds to insert a second attribute value for a row that
 * already had one. Carried across unchanged: the count is read exactly as the legacy reads it, and no
 * existence probe is added.
 */
const ATTRIBUTE_VALUE_UPDATE_STATEMENT = `UPDATE ${OUT_OF_SCOPE_TABLE.attributeValue}
  SET
    ${OUT_OF_SCOPE_COLUMN.attributeValue} = ${BIND_PLACEHOLDER}
  WHERE
    ${OUT_OF_SCOPE_COLUMN.attributeID} = ${BIND_PLACEHOLDER}
    AND ${OUT_OF_SCOPE_COLUMN.productID} = ${BIND_PLACEHOLDER}`;

/** The custom-attribute insert — the translation of `model/dao/ProductDAO.cfc:L249-L251`. */
const ATTRIBUTE_VALUE_INSERT_STATEMENT = `INSERT INTO ${OUT_OF_SCOPE_TABLE.attributeValue}
    (${OUT_OF_SCOPE_COLUMN.attributeValueID}, ${OUT_OF_SCOPE_COLUMN.attributeValueType},
     ${OUT_OF_SCOPE_COLUMN.attributeValue}, ${OUT_OF_SCOPE_COLUMN.attributeID},
     ${OUT_OF_SCOPE_COLUMN.productID})
  VALUES
    (${toPlaceholderList(5)})`;

/**
 * Back-fill 1 — the default-SKU statement, the translation of `model/dao/ProductDAO.cfc:L288-L302`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L288` and `:L304` — the dialect branch collapses to the
 * MYSQL path, and the two branch tests do not even agree on spelling. `:L288` compares against
 * `"mySQL"` while `:L304` compares against `"mySql"`; CFML `eq` is case-insensitive so both matched, and
 * TypeScript `===` would not — evidence in itself that the branches were never meant to diverge. The
 * value comes from the run-time probe at `config/configORM.cfm:L8-L14`, and AAP §0.4.1.3 makes the
 * target "a fixed MySQL target with the branch documented". So the else branches at `:L295-L300`,
 * `:L311-L316` and `:L318-L323` are recorded here and not built: there is no dialect type, no engine
 * enumeration and no per-engine variant anywhere in this file.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L289-L291` — the error-1093 exposure is flagged, and was
 * measured rather than assumed. MySQL refuses a subquery that selects from a table the same statement
 * updates, and the subquery here selects from `SwSku` while `SwSku` is one of the two tables the
 * multi-table update names. That looked like it would need a derived-table wrap. It does not.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L291` — "first SKU" is arbitrary and stays arbitrary. The
 * subquery has `LIMIT 1` and no `ORDER BY`, so which SKU becomes the default is whatever the engine
 * returns first. Adding an ordering to make it deterministic would be an enhancement the source does
 * not have (Guideline 4). The `LIMIT 1` itself is source-declared and stays; it is the only `LIMIT` in
 * this file, and no other is added (AAP §0.7.3).
 */
const DEFAULT_SKU_BACKFILL_STATEMENT = `UPDATE ${PRODUCT_TABLE}
    INNER JOIN ${SKU_TABLE}
      ON ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN} = ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN}
  SET
    ${PRODUCT_DEFAULT_SKU_ID_COLUMN} = (
      SELECT ${SKU_ID_COLUMN}
      FROM ${SKU_TABLE}
      WHERE ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN} = ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN}
      LIMIT 1
    )
  WHERE
    ${PRODUCT_TABLE}.${PRODUCT_DEFAULT_SKU_ID_COLUMN} IS NULL`;

/**
 * Back-fill 2 — the SKU image-file statement, the translation of `model/dao/ProductDAO.cfc:L304-L325`.
 *
 */
const SKU_IMAGE_FILE_BACKFILL_STATEMENT = `UPDATE ${SKU_TABLE}
    INNER JOIN ${PRODUCT_TABLE}
      ON ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN} = ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN}
  SET
    ${SKU_IMAGE_FILE_COLUMN} = (
      SELECT concat(${PRODUCT_CODE_COLUMN}, ${BIND_PLACEHOLDER})
      FROM ${PRODUCT_TABLE}
      WHERE ${SKU_TABLE}.${SKU_PRODUCT_ID_COLUMN} = ${PRODUCT_TABLE}.${PRODUCT_ID_COLUMN}
    )
  WHERE
    ${SKU_TABLE}.${SKU_IMAGE_FILE_COLUMN} IS NULL`;

/** The URL-title collision probe — the translation of `model/dao/ProductDAO.cfc:L401-L403`. */
const URL_TITLE_PROBE_STATEMENT = `SELECT
    1
  FROM
    ${PRODUCT_TABLE}
  WHERE
    ${PRODUCT_URL_TITLE_COLUMN} = ${BIND_PLACEHOLDER}
  LIMIT 1`;

/**
 * The existence lookup of `saveImportData` — the translation of `model/dao/ProductDAO.cfc:L385-L387`,
 * and the worst of the file-fed D18 sites.
 *
 * @param table - a validated physical table.
 * @param idColumn - a validated column name on that table, the identifier to project.
 * @param lookupColumn - a validated column name on that table, the predicate to match.
 * @returns the statement text: one bind marker, for the lookup value only.
 */
export function composeExistenceLookup(
  table: PhysicalTableName,
  idColumn: string,
  lookupColumn: string,
): string {
  // Re-validated here even though the caller already validated. See the note on the section above:
  // These composers are exported, so "the caller validates" is a convention and a convention is not a
  // guarantee. Both assertions are idempotent on an already-canonical name and both raise on anything
  // else, which is what makes the identifier discipline structural (AAP §0.7.3).
  const safeTable = assertTableName(table);

  return `SELECT
    ${assertColumnName(safeTable, idColumn)}
  FROM
    ${safeTable}
  WHERE
    ${assertColumnName(safeTable, lookupColumn)} = ${BIND_PLACEHOLDER}`;
}

/**
 * The update of `saveImportData` — the translation of `model/dao/ProductDAO.cfc:L393-L395`, and the
 * hardest site IN the file.
 *
 * @param table - a validated physical table.
 * @param assignmentColumns - validated column names on that table, in the legacy's assembly order:
 * The file columns first, then the two audit columns.
 *
 * @param idColumn - a validated column name on that table, the predicate to match.
 * @returns the statement text: one bind marker per assignment, then one for the identifier.
 * @throws {DomainError} when there is nothing to assign.
 */
export function composeImportUpdate(
  table: PhysicalTableName,
  assignmentColumns: readonly string[],
  idColumn: string,
): string {
  if (assignmentColumns.length === 0) {
    throw new DomainError(
      'An import update was composed with no columns to assign, which is not a statement any engine ' +
        'accepts.',
      { context: { table, idColumn } },
    );
  }

  // Re-validated, for the reason given on `composeExistenceLookup`. this is the site where a raw-text
  // `SET` clause would otherwise re-enter: every name that reaches the joined string has passed the
  // whitelist immediately beforehand, in this function, and no other value can reach it at all.
  const safeTable = assertTableName(table);

  const assignments = assignmentColumns
    .map((column) => `${assertColumnName(safeTable, column)} = ${BIND_PLACEHOLDER}`)
    .join(PLACEHOLDER_JOINER);

  return `UPDATE ${safeTable}
  SET
    ${assignments}
  WHERE
    ${assertColumnName(safeTable, idColumn)} = ${BIND_PLACEHOLDER}`;
}

/**
 * The insert of `saveImportData` — the translation of `model/dao/ProductDAO.cfc:L411-L413`.
 *
 * @param table - a validated physical table.
 * @param columns - validated column names on that table, in the legacy's assembly order, ending with
 * the identifier column exactly as the legacy appends it last.
 *
 * @returns the statement text: one bind marker per column.
 * @throws {DomainError} when there are no columns to insert.
 */
export function composeImportInsert(table: PhysicalTableName, columns: readonly string[]): string {
  if (columns.length === 0) {
    throw new DomainError(
      'An import insert was composed with no columns, which is not a statement any engine accepts.',
      { context: { table } },
    );
  }

  // Re-validated, for the reason given on `composeExistenceLookup`.
  const safeTable = assertTableName(table);
  const safeColumns = columns.map((column) => assertColumnName(safeTable, column));

  return `INSERT INTO ${safeTable}
    (${safeColumns.join(PLACEHOLDER_JOINER)})
  VALUES
    (${toPlaceholderList(safeColumns.length)})`;
}

/**
 * The product search — the translation of `model/dao/ProductDAO.cfc:L419-L437`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L424` — the product-type filter is direct, with no nested
 * subquery, and that differs from the SKU side. `:L424` filters `productTypeID in (...)` straight on
 * `SwProduct`, whereas `model/dao/SkuDAO.cfc:L135` nests
 * `productID in (select productID from SlatwallProduct where productTypeID in (...))`. Both are
 * preserved as written; harmonising them would change one of the two statements for no reason the source
 * gives.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L427` — this is the twenty-second `setSQL` site and it was
 * already parameterized, so it was never part of D18. Note also that `:L427` calls `setSQL` after both
 * `addParam` calls, which is what fixes the bind order as the search term first and the product-type
 * list second. Nothing in a type system catches a transposition of two same-typed parameters, so the
 * order is asserted in the test rather than trusted.
 *
 * @param productTypeIdCount - how many product-type identifiers will be bound. Zero omits the filter
 * entirely, which is the `:L423` guard's false branch.
 *
 * @returns the statement text.
 */
/**
 * Applies the four caller-facing decisions of `model/dao/ProductDAO.cfc:L422-L427` and returns the
 * statement with its bound values.
 *
 * @param term - the bare name fragment. `:L419` declares it optional; `:L422` reads it unguarded.
 * @param productTypeIDs - the optional comma-delimited product-type identifier list.
 * @param member - the calling member's qualified name, for the error context only.
 * @returns the statement text and its bound values, in `:L427` order — term first, list second.
 * @throws {DomainError} when the term is omitted, reproducing the `:L422` failure.
 */
function composeProductSearchCall(
  term: string | undefined,
  productTypeIDs: string | undefined,
  member: string,
): { readonly sql: string; readonly params: unknown[] } {
  if (term === undefined) {
    throw new DomainError(
      'A product search needs a name fragment to match on, and none was supplied.',
      { context: { member } },
    );
  }

  // `:L422` — the wildcard wrapping, applied here and not by the caller.
  const params: unknown[] = [`%${term}%`];
  let productTypeIdCount = 0;

  // `:L423` — the double guard, reproduced with its exact strictness. `len()`, not `trim`.
  if (productTypeIDs !== undefined && productTypeIDs.length > 0) {
    // `:L425` — the value passes through bare, with no interpolation wrapping, split into the
    // positional values a bound list becomes.
    const productTypeValues = splitBoundList(productTypeIDs);
    productTypeIdCount = productTypeValues.length;
    params.push(...productTypeValues);
  }

  // `:L427` — `setSQL` is called after both `addParam` calls, which fixes the bind order as the term
  // first and the product-type list second. Preserved positionally (TR-4).
  return { sql: composeProductSearch(productTypeIdCount), params };
}

export function composeProductSearch(productTypeIdCount: number): string {
  const productTypeFilter =
    productTypeIdCount > 0
      ? `
    AND ${PRODUCT_PRODUCT_TYPE_ID_COLUMN} IN (${toPlaceholderList(productTypeIdCount)})`
      : '';

  return `SELECT
    ${PRODUCT_ID_COLUMN},
    ${PRODUCT_NAME_COLUMN}
  FROM
    ${PRODUCT_TABLE}
  WHERE
    ${PRODUCT_NAME_COLUMN} LIKE ${BIND_PLACEHOLDER}${productTypeFilter}`;
}

/*
 * File headings the implementation names directly
 * Four headings are read by literal name rather than discovered by classification. They are file
 * headings, not database identifiers, so they never pass through `assertColumnName` — the whitelist
 * governs statement text, and these govern which cell of an uploaded file is read.
 */
const REQUIRED_HEADING = Object.freeze({
  /** `model/dao/ProductDAO.cfc:L180` — read for the brand lookup. All-lowercase in the source. */
  brandName: 'brand_brandname',
  /**
   * `model/dao/ProductDAO.cfc:L184` — read for the product-type lookup. Camel case in the source.
   */
  productTypeName: 'productType_productTypeName',
  /** `model/dao/ProductDAO.cfc:L399` — read for the URL title. */
  productName: 'product_productName',
  /** `model/dao/ProductDAO.cfc:L405` — read for the URL-title collision suffix. */
  productCode: 'product_productCode',
});

/** The empty record set — the port of `queryNew("")` at `model/dao/ProductDAO.cfc:L82`. */
const EMPTY_RECORD_SET: DelimitedImportRecordSet = Object.freeze({
  columnList: Object.freeze([]),
  rows: Object.freeze([]),
});

/**
 * The invariantly empty SKU extra-data list of `model/dao/ProductDAO.cfc:L150`.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L150` — declared, merged, never populated. `:L150` creates
 * the array and `:L197` merges it into the per-row list with `addAll`, but nothing between those two
 * lines ever appends to it, so the merge contributes nothing on every row of every import. It is kept
 * rather than deleted because deleting it would hide that the legacy has a product-side default
 * mechanism and no SKU-side counterpart — a reader comparing the two branches should see the asymmetry.
 */
const SKU_EXTRA_DATA: readonly ImportFieldAssignment[] = Object.freeze([]);

/**
 * Resolves the field delimiter from the file type — the translation of
 * `model/dao/ProductDAO.cfc:L74-L80`.
 *
 * @param fileType - the normalised file extension.
 * @returns the delimiter: a comma, a tab, or the empty string.
 */
function resolveDelimiter(fileType: string): string {
  if (fileType === CSV_FILE_TYPE) {
    // `:L77` — `chr(44)`.
    return COMMA_DELIMITER;
  }

  if (fileType === TEXT_FILE_TYPE) {
    // `:L79` — `chr(9)`.
    return TAB_DELIMITER;
  }

  // `:L76` — the declared initial value, left in place for every other extension.
  return NO_DELIMITER;
}

/**
 * Everything `model/dao/ProductDAO.cfc:L100-L173` computes once, before the record loop opens at
 * `:L176`.
 */
interface ImportPlan {
  /** `:L123` — the headings as an array, the port of `listToArray(data.columnList)`. */
  readonly columnList: readonly string[];
  /** `:L258` — whether the file declares the `productcontent_page` heading, decided once. */
  readonly assignsContentPages: boolean;
  /** `:L131` — headings whose first segment is `product`. */
  readonly productColumns: readonly string[];
  /** `:L133` — headings whose first segment is `sku`. */
  readonly skuColumns: readonly string[];
  /** `:L135`, then filtered by the pre-pass at `:L161-L173`. */
  readonly optionGroupHeadings: readonly string[];
  /** `:L171` — the resolved group identifier for each surviving heading. */
  readonly optionGroupIdsByHeading: ReadonlyMap<string, string>;
  /** `:L137` — headings whose first segment is `attribute`. */
  readonly customAttributeHeadings: readonly string[];
  /** `:L142-L148` — the product-side defaults for absent flag headings. */
  readonly productExtraData: readonly ImportFieldAssignment[];
  /** `:L101-L108` — the resolved product lookup heading, or `''` when the file carries none. */
  readonly productLookupColumn: string;
  /** `:L152` — one timestamp for the whole import. See the field's own note. */
  readonly timeStamp: Date;
  /** `:L153` — one account identifier for the whole import. */
  readonly administratorID: string;
}

/*
 * The import holds no lookup memory: brand, product-type and option identifiers are resolved per row,
 * exactly as `model/dao/ProductDAO.cfc` resolves them, so no cross-row cache can change which statement
 * a row issues or what a rolled-back row leaves behind (M3).
 */

/*
 * `PRODUCT_MANY_TO_MANY_FIELDS` and `clearProductManyToManyCollections` were removed from this module.
 * They existed only to serve a second `removeProduct` implementation that has itself been removed; the
 * full account, including why the many-to-many concern is not lost, sits with the surviving pair at
 * {@link MySqlProductRepository.saveProduct}. The authority the helper ported,
 * `org/Hibachi/HibachiService.cfc:L61`, is honoured in `./MySqlProductRepository.ts`, which draws the
 * scope split between statement-removable link tables and the excluded-family ones its declared
 * `ProductDependencyCleanup` collaborator covers.
 */

/**
 * The MySQL implementation of {@link ProductRepository} — the port of `model/dao/ProductDAO.cfc`.
 */
export class MySqlProductRepository implements ProductRepository {
  /** The pool-bound execution surface. */
  private readonly executor: ProductStatementExecutor;

  /** The two transaction boundaries. See {@link ProductImportTransactionBoundary}. */
  private readonly transactions: ProductImportTransactionBoundary;

  /** The retrieval collaborator, standing in for the `cfhttp` at `:L87` (M4). */
  private readonly sourceReader: ProductImportSourceReader;

  /** The out-of-scope data access the content-assignment step needs — the current contract. */
  private readonly contentAssignment: ProductContentAssignmentFactory;

  /** The current-account context, replacing the scope walk at `:L153` and `:L341`. */
  private readonly accountContext: AccountContextPort;

  /** The URL-title transform, replacing the call at `:L399` to a member that does not exist. */
  private readonly urlTitleFilter: ImportUrlTitleFilter;

  /** @see MySqlProductRepositoryDependencies.readDefaultSkuId. */
  private readonly readDefaultSkuId: DefaultSkuIdReader;

  /**
   * @param dependencies - the seven collaborators, as a named object rather than a positional list.
   */
  public constructor(dependencies: MySqlProductRepositoryDependencies) {
    this.executor = dependencies.executor;
    this.transactions = dependencies.transactions;
    this.sourceReader = dependencies.sourceReader;
    this.contentAssignment = dependencies.contentAssignment;
    this.accountContext = dependencies.accountContext;
    this.urlTitleFilter = dependencies.urlTitleFilter;
    this.readDefaultSkuId = dependencies.readDefaultSkuId;
  }

  /**
   * Returns an equivalent {@link MySqlProductRepository} bound to a different statement executor.
   *
   * @param executor - The executor to bind to, normally a boundary's `scope.executor`.
   * @returns a new instance identical in every other respect.
   */
  public withExecutor(executor: ProductStatementExecutor): MySqlProductRepository {
    return new MySqlProductRepository({
      executor,
      transactions: this.transactions,
      sourceReader: this.sourceReader,
      contentAssignment: this.contentAssignment,
      accountContext: this.accountContext,
      urlTitleFilter: this.urlTitleFilter,
      readDefaultSkuId: this.readDefaultSkuId,
    });
  }

  /**
   * Selects attribute sets — the port of `model/dao/ProductDAO.cfc:L52-L71`.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L52` — zero callers, implemented anyway. A repository-wide
   * search finds no invocation of this member from any service, entity, process object, controller or
   * view. It is implemented rather than dropped because TR-5 requires that a member reaching an
   * out-of-scope collaborator be declared and implemented against a port rather than quietly removed
   * from the interface, and because a later caller must find the same behaviour the legacy would have
   * given it.
   *
   * @param attributeSetTypeCode - the attribute-set type system codes to match. Required, per `:L52`.
   * @param productTypeIDs - the product-type identifiers whose assignments qualify a non-global set.
   * An empty array selects the `globalFlag = 1` shape of `:L60`.
   *
   * @returns the selected rows, unnarrowed.
   */
  public async findAttributeSets(
    attributeSetTypeCode: string[],
    productTypeIDs: string[],
  ): Promise<AttributeSetRow[]> {
    // `:L66` versus `:L68` — the D20 collapse. One binding path, expanded positionally. The reason the
    // collapse is legitimate is recorded on `composeAttributeSetSelection`; the collapse itself is here.
    const typeCodeValues: readonly string[] =
      attributeSetTypeCode.length > 0 ? attributeSetTypeCode : [''];

    const sql = composeAttributeSetSelection(typeCodeValues.length, productTypeIDs.length);

    // Bind order follows statement text: the type codes appear in the `IN` list of `:L54`, the
    // product-type identifiers in the disjunct of `:L57` (TR-4).
    return await this.executor.execute(sql, [...typeCodeValues, ...productTypeIDs]);
  }

  /**
   * Searches products by name and optionally by product type — the port of
   * `model/dao/ProductDAO.cfc:L419-L437`.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L422` — the search term is read unguarded. `:L419` declares
   * `string term` as optional, but `:L422` interpolates `arguments.term` unconditionally, so omitting it
   * raises inside the DAO. The port preserves the failure and makes it typed and explicit rather than
   * incidental: an absent term raises here, before any statement is composed, instead of producing
   * `LIKE '%undefined%'`. Supplying a default would be an enhancement the legacy does not have.
   *
   * @param term - the product-name fragment. Optional in the declaration, required in practice.
   * @param productTypeIDs - a comma-delimited list of product-type identifiers. Optional.
   * @returns one `{id, value}` row per match, in the engine's order — `:L421` declares no `ORDER BY` and
   * none is added (Guideline 4).
   *
   * @throws {DomainError} when `term` is omitted, reproducing the `:L422` failure.
   */
  public async searchByProductType(
    term?: string,
    productTypeIDs?: string,
  ): Promise<ProductSearchRow[]> {
    const { sql, params } = composeProductSearchCall(
      term,
      productTypeIDs,
      'MySqlProductRepository.searchByProductType',
    );

    const rows = await this.executor.execute(sql, params);

    // `:L430-L434` — the row-to-`{id, value}` rename, which lives in `rowMappers.ts`.
    return mapRows(rows, mapProductSearchRow);
  }

  /* No bounded form of the search above, and there was one here. */

  /**
   * Imports products, SKUs, options, custom attributes and content assignments from a delimited file —
   * the port of `model/dao/ProductDAO.cfc:L73-L326`.
   *
   * @param fileURL - the caller's location, forwarded unmodified — no trim, no normalisation, no
   * re-encoding — exactly as `model/dao/ProductDAO.cfc:L73-L87` forwards it. It is put through the
   * injected {@link ProductImportSourcePolicy} before any read member can see it, and no rule of this
   * file's own is applied to it, so the CWE-918 exposure — scheme, credentials, address and name alike —
   * is the injected reader's policy to decide and stays on the register as mismatch M4. See
   * {@link ProductImportSourceReader}.
   */
  public async importFromFile(fileURL: string, textQualifier?: string): Promise<void> {
    // `:L74` — the file type is the last dot-delimited segment of the location, with no validation and
    // no extraction from a URL path. A query string travels with it, exactly as it does in the legacy,
    // which is one reason an unrecognised type is a silent no-delimiter case rather than an error.
    // Normalised for comparison because the `==` tests at `:L76`, `:L78` and `:L83` are
    // case-insensitive.
    const fileType = normaliseHeading(listLast(fileURL, FILE_TYPE_DELIMITER));

    // `:L75-L80`.
    const delimiter = resolveDelimiter(fileType);

    // `:L73` — the declared default for the optional second argument.
    const resolvedTextQualifier = textQualifier ?? '';

    /*
     * No cancellation is observed, because `model/dao/ProductDAO.cfc:L73` cannot express one: the legacy
     * importer runs to completion or dies with
     * its request. AAP §0.6.7.7 admits exactly one behavioural exception (D18) and §0.8.2 Guideline 4
     * forbids the rest, so it is gone rather than merely optional.
     */

    /*
     * No gate of this file's own judges the location, and none may be added. The injected
     * {@link ProductImportSourcePolicy} is what judges it — unconditionally, and on every branch, a few
     * statements below — while this file contributes no scheme set, no host list and no address rule; see
     * "the import-source policy is mandatory" near the top of this file for the authority and for the
     * residual CWE-918 exposure carried as mismatch M4. The location travels to the policy and then to the
     * reader exactly as the caller supplied it, which is what `model/dao/ProductDAO.cfc:L87` does with it.
     */

    // `:L82` — `queryNew("")`, the empty set the spreadsheet branch leaves in place.
    let recordSet: DelimitedImportRecordSet = EMPTY_RECORD_SET;

    // Set only on the streaming path, and read only there. See the convergence note below.
    let streamedColumnList: readonly string[] | undefined;
    let streamedRecords: AsyncIterable<DelimitedImportRecord> | undefined;

    /*
     * The import-source policy runs here, and nothing else can run before it.
     * `importFromFile` keeps the plain-`string` signature AAP §0.4.2.6 fixes for it, so the caller's
     * location arrives unbranded; this is the one place it becomes a
     * {@link ValidatedProductImportSource}, and the read members below accept nothing else. A reader
     * therefore cannot be reached with a location that never met a policy, which is what keeps the latent
     * CWE-918 of mismatch M4 structurally visible instead of resting on prose.
     */
    const validatedSource = await this.sourceReader.sourcePolicy.validateSource(fileURL);

    if (fileType === SPREADSHEET_FILE_TYPE) {
      /*
       * TODO(parity) `model/dao/ProductDAO.cfc:L83-L85` — the spreadsheet branch is empty in the
       * source and it is empty here. `:L83` opens `if(fileType == "xls"){`, `:L84` carries the comment
       * `//Read xls`, and `:L85` closes it. Nothing is read, nothing is parsed and nothing is raised, so
       * an `.xls` upload imports nothing and the caller — which receives no return value — cannot tell.
       */
    } else if (this.sourceReader.readStreaming !== undefined) {
      /*
       * `:L87` — the single retrieval, delegated, in its streaming form. One header pass, then records
       * on demand. Selecting the member the reader actually offers rather than requiring one keeps the
       * collaborator's contract additive: an existing reader is not broken and a streaming reader is not
       * mandated.
       */
      const stream = await this.sourceReader.readStreaming(
        validatedSource,
        delimiter,
        resolvedTextQualifier,
      );

      streamedColumnList = stream.columnList;
      streamedRecords = stream.records;
    } else {
      // `:L87` — the single retrieval, delegated, in its materialising form. See M4 above.
      recordSet = await this.sourceReader.read(validatedSource, delimiter, resolvedTextQualifier);
    }

    /*
     * The two retrieval shapes converge here, and they converge on the lazy one: a materialised record
     * set's `rows` array is itself iterable, so both paths hand `normaliseRecords` the same kind of
     * sequence and neither path builds a second whole-file representation. `columnList` is complete
     * before the first record is normalised on both paths, which is what `:L100-L173` requires.
     */
    /*
     * `const`, not `let` — and that is itself evidence of the current contract's fix. The removed preflight
     * reassigned this to a buffered replay of the rows it had walked; nothing reassigns it now, so the
     * sequence the row loop consumes is the retrieval's own, start to finish.
     */
    const data: NormalisedImportData = {
      columnList: streamedColumnList ?? recordSet.columnList,
      rows: normaliseRecords(streamedRecords ?? recordSet.rows),
    };

    /*
     * No content-assignment preflight runs here: the step is performed per row, at its legacy position, in
     * {@link MySqlProductRepository.assignRequestedContentPages} through
     * {@link ProductContentAssignmentPort}. A whole-file refusal would need every row buffered and would
     * change the outcome for a file declaring `productcontent_page`.
     */

    // `:L100-L173` — everything computed once, before the record loop. M7: local to this call.
    const plan = await this.buildImportPlan(data);

    /* `:L176-L285` — M3. One boundary per row, strictly in order, each committing on its own. */
    await this.transactions.runPerItemWithoutResults(data.rows, async (row, scope) => {
      /*
       * The whole scope, not just its executor (the current contract). The row body needs the executor for
       * its own statements and the scope itself for the content-assignment step, whose collaborator is
       * built per row from that scope so its statements join this row's transaction.
       */
      await this.importRow(scope, row, plan);
    });

    /*
     * `:L287-L325` — the two bulk back-fills, outside every boundary, after the last row commits.
     */
    await this.backfillImportDerivedColumns();
  }

  /*
   * The second persistence pair was removed from this class, and `saveProduct`/`removeProduct` below
   * are the survivors
   * A `persistProduct(ManagedEntity<Product>)` / `removeProduct(ManagedEntity<Product>)` pair once stood
   * here, alongside a private `collectProductValues` and a second `defaultSkuIdReader` field. It was a
   * second implementation of the two members {@link MySqlProductRepository.saveProduct} and
   * {@link MySqlProductRepository.removeProduct} already provide, and TypeScript reported the collision
   * as `Duplicate function implementation` on `removeProduct` — the two could not coexist.
   */
  /**
   * Computes everything `model/dao/ProductDAO.cfc:L100-L173` computes before the record loop opens.
   *
   * @param data - the normalised record set.
   * @returns the per-import plan. Never retained on the instance (M7).
   */
  private async buildImportPlan(data: NormalisedImportData): Promise<ImportPlan> {
    /*
     * `:L100-L108` — the product lookup column, resolved by priority with a short-circuit.
     *
     * TODO(parity) `model/dao/ProductDAO.cfc:L101` — a file carrying none of the four leaves this as
     * the empty string, and nothing checks it. The legacy then composes `WHERE = '...'` from an empty
     * identifier and fails on the first row with a syntax error from the engine. The port fails on the
     * same row for the same reason, one step earlier and with a typed error, because an empty column name
     * cannot pass the identifier whitelist. Supplying a fallback lookup column would be an invented
     * default (AAP §0.7.3).
     */
    let productLookupColumn = '';

    for (const candidate of PRODUCT_LOOKUP_COLUMNS) {
      if (containsNoCase(data.columnList, candidate)) {
        productLookupColumn = candidate;
        break;
      }
    }

    /* `:L130-L140` — heading classification on the first underscore-delimited segment. */
    const productColumns: string[] = [];
    const skuColumns: string[] = [];
    const optionGroupHeadings: string[] = [];
    const customAttributeHeadings: string[] = [];

    for (const heading of data.columnList) {
      const prefix = normaliseHeading(listFirst(heading, HEADING_DELIMITER));

      if (prefix === HEADING_PREFIX.product) {
        productColumns.push(heading);
      } else if (prefix === HEADING_PREFIX.sku) {
        skuColumns.push(heading);
      } else if (prefix === HEADING_PREFIX.option) {
        optionGroupHeadings.push(heading);
      } else if (prefix === HEADING_PREFIX.attribute) {
        customAttributeHeadings.push(heading);
      }
    }

    /* — authorization of the mutation targets, here and not later. */
    assertImportableColumns(PRODUCT_TABLE, productColumns);
    assertImportableColumns(SKU_TABLE, skuColumns);

    /* `:L142-L148` — the two product-side defaults, supplied only when the heading is absent. */
    const productExtraData: ImportFieldAssignment[] = [];

    for (const defaulted of PRODUCT_DEFAULTED_HEADINGS) {
      if (!containsNoCase(data.columnList, defaulted.heading)) {
        productExtraData.push({ name: defaulted.name, value: DEFAULTED_FLAG_VALUE });
      }
    }

    /* `:L152-L153` — one timestamp and one account identifier for the whole import. */
    const timeStamp = new Date();
    const administratorID = this.currentAccountID();

    const { optionGroupIdsByHeading, survivingOptionGroupHeadings } =
      await this.resolveOptionGroups(optionGroupHeadings);

    return {
      columnList: data.columnList,
      /* `:L258`, decided once for the file. See {@link ImportPlan.assignsContentPages}. */
      assignsContentPages: containsNoCase(data.columnList, CONTENT_PAGE_COLUMN),
      productColumns,
      skuColumns,
      optionGroupHeadings: survivingOptionGroupHeadings,
      optionGroupIdsByHeading,
      customAttributeHeadings,
      productExtraData,
      productLookupColumn,
      timeStamp,
      administratorID,
      /*
       * No `lookups` memory is built . nothing replaces it: each row issues its own statements,
       * which is what `model/dao/ProductDAO.cfc:L179-L186` and `:L209-L235` do.
       */
    };
  }

  /**
   * Resolves each option-group heading to a group identifier, discarding the headings that do not
   * resolve — the port of `model/dao/ProductDAO.cfc:L161-L173`.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L161-L173` — reverse iteration with delete-by-value during
   * the iteration, translated to an order-preserving filter. `:L161` counts down with
   * `for(var i=arrayLen(optionGroups); i >= 1; i--)` and `:L169` removes the current heading with
   * `arrayDelete(optionGroups, optionGroup)` — deletion by value, not by index, from the array being
   * walked. The combination is what makes the resulting order and membership non-obvious, so it was
   * worked through rather than assumed:
   *
   * - Counting down means a deletion only ever shifts elements the walk has already passed, so no
   * heading is skipped and none is visited twice.
   * - Deleting by value removes the first equal element; since the walk is descending and headings are
   * unique in a heading row, that is the element the walk is standing on.
   * - The survivors therefore keep their original ascending order, with the unresolved ones removed.
   *
   * @param optionGroupHeadings - the classified option headings, in file order.
   * @returns the resolved identifiers keyed by heading, and the surviving headings in file order.
   */
  private async resolveOptionGroups(optionGroupHeadings: readonly string[]): Promise<{
    readonly optionGroupIdsByHeading: ReadonlyMap<string, string>;
    readonly survivingOptionGroupHeadings: readonly string[];
  }> {
    const optionGroupIdsByHeading = new Map<string, string>();

    // `:L161` — descending, so the statements issue in the legacy's order.
    for (let index = optionGroupHeadings.length - 1; index >= 0; index -= 1) {
      const heading = optionGroupHeadings[index];

      if (heading === undefined) {
        // Unreachable for an in-range index; present because the index signature is checked (AAP §0.7.3).
        continue;
      }

      // `:L163` — case-insensitive, first occurrence only. A heading spelled `option_option_colour`
      // yields the key `option_colour`, not `colour`.
      const optionGroupKey = removeFirstNoCase(heading, OPTION_HEADING_PREFIX);

      // `:L164-L166` — one value, three markers. See `OPTION_GROUP_LOOKUP_STATEMENT`.
      const rows = await this.executor.execute(OPTION_GROUP_LOOKUP_STATEMENT, [
        optionGroupKey,
        optionGroupKey,
        optionGroupKey,
      ]);

      // `:L168-L172` — resolved headings are recorded, unresolved ones are dropped.
      if (rows.length > 0) {
        optionGroupIdsByHeading.set(heading, readFirstRowText(rows, OPTION_GROUP_ID_COLUMN));
      }
    }

    const survivingOptionGroupHeadings = optionGroupHeadings.filter((heading) =>
      optionGroupIdsByHeading.has(heading),
    );

    return { optionGroupIdsByHeading, survivingOptionGroupHeadings };
  }

  /**
   * Imports one row inside its own transaction — the port of `model/dao/ProductDAO.cfc:L178-L283`.
   *
   * @param scope - the transaction this row alone executes in. Its executor carries every statement
   * below, and the scope itself builds the row's content-assignment collaborator .
   *
   * @param row - the row being imported, carrying its one-based number for error context.
   * @param plan - the per-import plan.
   */
  private async importRow(
    scope: ProductImportTransactionScope,
    row: NormalisedImportRow,
    plan: ImportPlan,
  ): Promise<void> {
    const { executor } = scope;
    /*
     * `:L179-L182` — the brand lookup, and `:L183-L186` — the product-type lookup. The reads are guarded
     * here and were not there; see `readFirstRowText`.
     */
    const brandID = await this.resolveImportLookup(
      executor,
      readCell(row, REQUIRED_HEADING.brandName),
      BRAND_LOOKUP_STATEMENT,
      BRAND_ID_COLUMN,
    );

    const productTypeID = await this.resolveImportLookup(
      executor,
      readCell(row, REQUIRED_HEADING.productTypeName),
      PRODUCT_TYPE_LOOKUP_STATEMENT,
      PRODUCT_TYPE_ID_COLUMN,
    );

    // `:L188-L191` — the product's extra data: the defaults, then the two resolved identifiers, in that
    // order. Order matters only for the insert's column list, and it is the legacy's order.
    const productExtraData: ImportFieldAssignment[] = [
      ...plan.productExtraData,
      { name: BRAND_ID_COLUMN, value: brandID },
      { name: PRODUCT_PRODUCT_TYPE_ID_COLUMN, value: productTypeID },
    ];

    // `:L193` — seven positional arguments in the legacy, a named object here.
    const productID = await this.saveImportData(executor, row, {
      table: PRODUCT_TABLE,
      columnList: plan.productColumns,
      lookupColumn: plan.productLookupColumn,
      idColumn: PRODUCT_ID_COLUMN,
      extraData: productExtraData,
    });

    /* `:L196-L198` — the SKU's extra data. */
    const skuExtraData: ImportFieldAssignment[] = [
      ...SKU_EXTRA_DATA,
      { name: SKU_PRODUCT_ID_COLUMN, value: productID },
    ];

    /*
     * `:L199-L205` — the generated SKU code.
     *
     * TODO(parity) `model/dao/ProductDAO.cfc:L199` — the first half of the guard is invariantly true.
     * `:L109` assigns the literal `"sku_skucode"` and `:L199` compares against the same literal, so the
     * comparison can never be false. It is reproduced rather than simplified away because removing it
     * would hide that the legacy left room for a resolved SKU lookup column it never built — the product
     * side has a four-candidate priority walk and the SKU side has one hard-coded name.
     */
    if (
      SKU_LOOKUP_COLUMN === 'sku_skucode' &&
      !containsNoCase(plan.columnList, SKU_LOOKUP_COLUMN)
    ) {
      let skuCode = readCell(row, plan.productLookupColumn);

      for (const heading of plan.optionGroupHeadings) {
        skuCode += SKU_CODE_SEGMENT_SEPARATOR + readCell(row, heading);
      }

      // `:L204` — the legacy names the field `skucode`, all-lowercase; the whitelist restores the
      // entity's own casing when the statement is composed.
      skuExtraData.push({ name: SKU_LOOKUP_COLUMN_FIELD, value: skuCode });
    }

    // `:L207`.
    const skuID = await this.saveImportData(executor, row, {
      table: SKU_TABLE,
      columnList: plan.skuColumns,
      lookupColumn: SKU_LOOKUP_COLUMN,
      idColumn: SKU_ID_COLUMN,
      extraData: skuExtraData,
    });

    // `:L209-L237` — assign one option per surviving option group.
    for (const heading of plan.optionGroupHeadings) {
      const optionGroupID = plan.optionGroupIdsByHeading.get(heading);

      if (optionGroupID === undefined) {
        // Unreachable: the surviving list is derived from the map's own keys. Guarded because the map
        // read is checked (AAP §0.7.3).
        continue;
      }

      await this.assignOptionToSku(executor, row, heading, optionGroupID, skuID, plan);
    }

    // `:L238-L256` — the custom attributes.
    for (const heading of plan.customAttributeHeadings) {
      await this.applyCustomAttribute(executor, row, heading, productID);
    }

    /*
     * `:L257-L282` — the content assignments, at their legacy position: last in the row body, after
     * the product, the SKU, every option and every custom attribute have been written.
     */
    await this.assignRequestedContentPages(scope, row, productID, plan);
  }

  /**
   * Resolves or creates one option and links it to the SKU — the port of
   * `model/dao/ProductDAO.cfc:L209-L237`.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param row - the row being imported.
   * @param heading - the option heading whose cell carries the option code.
   * @param optionGroupID - the group identifier resolved by the pre-pass.
   * @param skuID - the SKU the option is linked to.
   * @param plan - the per-import plan, for the shared timestamp and account identifier.
   */
  private async assignOptionToSku(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    heading: string,
    optionGroupID: string,
    skuID: string,
    plan: ImportPlan,
  ): Promise<void> {
    // `:L210-L211`.
    const optionCode = readCell(row, heading);

    if (optionCode === '') {
      return;
    }

    /*
     * No memory is consulted before the statement: every (group, code) pair is resolved by its own
     * statement, exactly as the legacy resolves it per row.
     */

    // `:L212-L215` — the outer join that returns a row for the group even when the option is absent.
    const lookupRows = await executor.execute(OPTION_LOOKUP_STATEMENT, [optionCode, optionGroupID]);

    // `:L216` — the legacy reads `lookupResult.optionID` unguarded on a set that can be empty when the
    // GROUP itself has vanished between the pre-pass and this row. Guarded; a NULL option identifier
    // reads as the empty string, which is what `:L217` tests for.
    let optionID = readFirstRowText(lookupRows, OPTION_ID_COLUMN);
    let linkExists: boolean;

    if (optionID !== '') {
      // `:L218-L221` — does the link row already exist?
      const existingLink = await executor.execute(SKU_OPTION_EXISTENCE_STATEMENT, [
        optionID,
        skuID,
      ]);
      linkExists = existingLink.length > 0;
    } else {
      /*
       * `:L222-L229` — create the option, then fall through to create the link.
       *
       * TODO(parity) `model/dao/ProductDAO.cfc:L223` — the identifier transform is open-coded here
       * rather than delegated. `:L223` writes `lcase(replace(createUUID(),"-","","all"))` inline instead
       * of calling the generator `model/dao/HibachiDAO.cfc:L51-L53` exposes, and `:L248` and `:L277` do
       * the same thing again. The port calls the single shared generator at every one of those sites; the
       * duplication is recorded rather than reproduced, because reproducing it would mean three copies of
       * one algorithm and IR-6 fixes the algorithm, not its call sites.
       */
      optionID = createSlatwallUUID();

      await executor.executeMutation(OPTION_INSERT_STATEMENT, [
        optionID,
        readFirstRowText(lookupRows, OPTION_GROUP_ID_COLUMN),
        optionCode,
        // `:L226` writes the code into the name column as well. See `OPTION_NAME_COLUMN`.
        optionCode,
        plan.timeStamp,
        plan.timeStamp,
        plan.administratorID,
        plan.administratorID,
      ]);

      // `:L228` — set to false explicitly, so a newly created option always gets its link row.
      linkExists = false;
    }

    /*
     * The resolution is not recorded anywhere: a per-import cache of the option found at `:L216` or created
     * at `:L223` would only be safe while the per-row boundary stops at the first failure (M3), and
     * nothing here depends on that condition holding.
     */

    // `:L230-L234`.
    if (!linkExists) {
      await executor.executeMutation(SKU_OPTION_INSERT_STATEMENT, [optionID, skuID]);
    }
  }

  /**
   * Updates or inserts one custom attribute value — the port of `model/dao/ProductDAO.cfc:L239-L255`.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L247` — the insert is gated on the update's affected-row
   * count, which is not an existence test. `getPrefix().recordcount` on an `UPDATE` is the number of rows
   * changed, and an update writing the value a row already holds changes nothing, so the legacy then
   * inserts a duplicate attribute value for a row that already had one. Carried across exactly: the count
   * is read as the legacy reads it and no existence probe is added.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param row - the row being imported.
   * @param heading - the attribute heading, whose last segment is the attribute identifier.
   * @param productID - the product the value belongs to.
   */
  private async applyCustomAttribute(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    heading: string,
    productID: string,
  ): Promise<void> {
    // `:L240-L242`.
    const attributeID = listLast(heading, HEADING_DELIMITER);
    const attributeValue = readCell(row, heading);

    if (attributeValue === '') {
      return;
    }

    // `:L243-L247` — bind order is value, attribute, product: statement-text order.
    const affectedRows = await executor.executeMutation(ATTRIBUTE_VALUE_UPDATE_STATEMENT, [
      attributeValue,
      attributeID,
      productID,
    ]);

    if (affectedRows === 0) {
      // `:L248-L252`.
      await executor.executeMutation(ATTRIBUTE_VALUE_INSERT_STATEMENT, [
        createSlatwallUUID(),
        PRODUCT_ATTRIBUTE_VALUE_TYPE,
        attributeValue,
        attributeID,
        productID,
      ]);
    }
  }

  /**
   * Assigns this row's content pages — the port of `model/dao/ProductDAO.cfc:L257-L282`, performed per
   * row at the legacy's own position through {@link ProductContentAssignmentPort}.
   *
   * @param row - the row whose content cell is read.
   * @param productId - the product the pages are assigned to.
   * @param plan - carries {@link ImportPlan.assignsContentPages}, the heading test decided once per file.
   */
  private async assignRequestedContentPages(
    scope: ProductImportTransactionScope,
    row: NormalisedImportRow,
    productId: string,
    plan: ImportPlan,
  ): Promise<void> {
    /*
     * `:L258` — the heading test. Hoisted onto the plan so it is decided once for the file rather than
     * re-scanned per row; the answer is identical because `columnList` is final before the first record
     * (see {@link DelimitedImportRecordStream}). Every ordinary import returns here having done nothing.
     */
    if (!plan.assignsContentPages) {
      return;
    }

    /*
     * `:L259` — `listToArray` on the cell, default comma delimiter, empty tokens dropped. A row whose
     * content cell is empty yields an empty array and `:L260` iterates zero times, so this is the second
     * no-op the legacy has and it stays a no-op here.
     */
    const pageFileNames = listToArray(readCell(row, CONTENT_PAGE_COLUMN), LIST_DELIMITER);

    /*
     * — the collaborator is built from this row's transaction, and built only once per row.
     * Every statement it issues below therefore belongs to the same transaction as the product and SKU
     * writes above, exactly as `:L257-L282` belongs to the `transaction{` block `:L177` opens. Two
     * consequences, both of them the legacy's:
     * • the reads see this row's uncommitted product. The existence probe at `:L271` filters on the
     * `productID` the product save has just written and not yet committed; on any other connection it
     * would not find it, and the step would insert a duplicate link on a re-import.
     */
    if (pageFileNames.length === 0) {
      return;
    }

    const contentAssignment = this.contentAssignment(scope);

    /* `:L260` — one page at a time, in file order, sequentially. */
    for (const pageFileName of pageFileNames) {
      /*
       * `:L262-L266` — resolve the page in the content application. The two extra predicates the legacy
       * carries (`subtype = 'slatwallproductlisting'` and `active = 1`) belong to the collaborator's
       * contract, so a page of another subtype or an inactive one resolves to nothing.
       */
      const resolved = await contentAssignment.findProductListingContent(pageFileName);

      if (resolved === null) {
        /*
         * `:L269` — `if(lookupResult.recordcount)`. An unresolved page is silently skipped: no error, no
         * warning, no record. The row still commits and the caller, which receives no return value at
         * all, cannot tell that a requested assignment was dropped.
         *
         * TODO(parity) `model/dao/ProductDAO.cfc:L267-L268` — the legacy reads `lookupResult.contentID`
         * and `.path` before it tests `recordcount`, so on a miss both locals hold the empty string. The
         * read is harmless there and has no equivalent here because absence is `null`; it is recorded so a
         * reader comparing the two does not mistake the missing assignment for a lost step.
         */
        continue;
      }

      /*
       * `:L270-L273` — the existence probe. One of D18's interpolated statements on the legacy side; the
       * collaborator binds it.
       */
      const alreadyAssigned = await contentAssignment.hasContentAssignment(
        productId,
        resolved.contentId,
      );

      if (alreadyAssigned) {
        // `:L274` — `if(!exists)`. Already assigned means nothing is written; the step is idempotent.
        continue;
      }

      /*
       * `:L275` — `lcase(replace(createUUID(),"-","","all"))`. IR-6: 32 lowercase hex characters, no
       * dashes. {@link createSlatwallUUID} is the same generator every other identifier on this path
       * uses, so the link row's key is shaped exactly like the legacy's.
       */
      const productContentId = createSlatwallUUID();

      /*
       * `:L276-L279` — the insert, with the content path denormalised alongside the identifier exactly as
       * the legacy denormalises it.
       */
      await contentAssignment.insertContentAssignment({
        productContentId,
        contentId: resolved.contentId,
        contentPath: resolved.contentPath,
        productId,
      });
    }
  }

  /**
   * Updates an existing row or inserts a new one — the port of `model/dao/ProductDAO.cfc:L328-L417`.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L334-L338` — five `java.lang.StringBuilder` objects are
   * created and immediately discarded. `:l334-l338` allocates them and the code that follows never
   * touches one, building plain strings instead. Nothing replaces them here; the dead allocation is
   * recorded so a reader does not go looking for the builder-based assembly they imply.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L340-L341` — a second timestamp and a second account read.
   * The import already captured both once at `:L152-L153`; this method captures them again, per call,
   * so a row's audit columns carry a later timestamp than the options created for that same row. Both
   * captures are preserved at their own sites rather than unified.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L356-L360` — a dead conditional. `:L356` branches on
   * `isNumeric(...)` and both arms of the branch are byte-identical, so the test cannot change what is
   * produced. It is not reproduced, because reproducing a branch whose arms agree would be noise; the
   * finding is recorded here instead.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L328` — the parameter named `columnList` here is not the
   * `columnList` of the importer. `:L123` declares a local `columnList` holding every heading in the
   * file, while `:L328` declares a parameter of the same name receiving only the classified subset for
   * one table. Two distinct identifiers with one spelling in one file. The port keeps both names, because
   * both appear in the source, and states the distinction here so a reader tracing a value does not
   * conflate them.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param row - the row being saved.
   * @param request - the five remaining legacy arguments, named rather than positional. A five-argument
   * positional list of which four are strings is exactly where a transposition goes unnoticed.
   *
   * @returns the identifier of the row that was updated or inserted — `:L416` returns it on both paths.
   */
  private async saveImportData(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
    request: {
      /**
       * `:L328` `tableName` — already validated, so a logical name cannot reach a statement.
       */
      readonly table: PhysicalTableName;
      /** `:L328` `columnList` — the classified headings for this table only. See the note above. */
      readonly columnList: readonly string[];
      /** `:L328` `lookupColumn` — a heading, whose last segment is the column to match on. */
      readonly lookupColumn: string;
      /** `:L328` `idColumn` — the identifier column to project, match on and generate. */
      readonly idColumn: string;
      /**
       * `:L328` `extraData` — the `{name, value}` pairs, insert-only. See the note at `:L368-L378`.
       */
      readonly extraData: readonly ImportFieldAssignment[];
    },
  ): Promise<string> {
    const auditColumns = auditColumnsOf(request.table);

    // `:L340-L341` — the second capture. See the note above.
    const timeStamp = new Date();
    const administratorID = this.currentAccountID();

    /* `:L385-L387` — the runtime-derived lookup column. */
    const lookupColumnName = assertColumnName(
      request.table,
      listLast(request.lookupColumn, HEADING_DELIMITER),
    );

    // `:L343-L345` — seeded from the file only when the file actually carries the lookup heading.
    let lookupColumnValue = '';

    if (containsNoCase(request.columnList, request.lookupColumn)) {
      lookupColumnValue = readCell(row, request.lookupColumn);
    }

    const updateColumns: string[] = [];
    const updateParams: unknown[] = [];
    const insertColumns: string[] = [];
    const insertParams: unknown[] = [];

    /* `:L347-L361` — one assignment per classified heading, contributing to both statements. */
    for (const heading of request.columnList) {
      const column = assertColumnName(request.table, listLast(heading, HEADING_DELIMITER));

      assertImportableColumn(request.table, heading);

      const value = readCell(row, heading);

      updateColumns.push(column);
      updateParams.push(value);
      insertColumns.push(column);
      insertParams.push(value);
    }

    /* `:L363-L366` — the audit columns. */
    updateColumns.push(auditColumns.modified);
    updateParams.push(timeStamp);
    updateColumns.push(auditColumns.modifiedBy);
    updateParams.push(administratorID);

    insertColumns.push(auditColumns.created);
    insertParams.push(timeStamp);
    insertColumns.push(auditColumns.modified);
    insertParams.push(timeStamp);
    insertColumns.push(auditColumns.createdBy);
    insertParams.push(administratorID);
    insertColumns.push(auditColumns.modifiedBy);
    insertParams.push(administratorID);

    /* `:L368-L378` — the extra data. */
    for (const assignment of request.extraData) {
      const column = assertColumnName(request.table, assignment.name);

      insertColumns.push(column);
      insertParams.push(assignment.value);

      if (normaliseHeading(assignment.name) === normaliseHeading(lookupColumnName)) {
        lookupColumnValue = assignment.value;
      }
    }

    /*
     * `:L381-L383` trims a trailing comma off the hand-built `SET` string. There is no trailing comma to
     * trim here, because the clause is joined from a list rather than accumulated with separators — the
     * whole class of fencepost error the trim exists to correct cannot occur.
     */

    // `:L385-L387` — the existence lookup. Three identifiers from the whitelist, one bound value.
    const lookupRows = await executor.execute(
      composeExistenceLookup(request.table, request.idColumn, lookupColumnName),
      [lookupColumnValue],
    );

    /*
     * `:L389-L390` — the existence flag and the identifier.
     *
     * TODO(parity) `model/dao/ProductDAO.cfc:L390` — the legacy reads the dynamic identifier column
     * unconditionally, before the `if(exists)` at `:L392`. On an empty result set CFML yields an empty
     * string from a query column rather than raising, so the read was harmless and the value was
     * discarded moments later on the insert path. The port keeps the same read at the same point and
     * guards it, because an indexed read is checked here (AAP §0.7.3); the guarded value is the same empty string
     * on the same input.
     */
    const rowExists = lookupRows.length > 0;
    let idColumnValue = readFirstRowText(lookupRows, request.idColumn);

    if (rowExists) {
      /* `:L393-L396` — the update. */
      await executor.executeMutation(
        composeImportUpdate(request.table, updateColumns, request.idColumn),
        [...updateParams, idColumnValue],
      );
    } else {
      // `:L398-L409` — the URL title, on the product table only.
      if (request.table === PRODUCT_TABLE) {
        insertColumns.push(PRODUCT_URL_TITLE_COLUMN);
        insertParams.push(await this.resolveImportUrlTitle(executor, row));
      }

      /*
       * `:L410` — the generated identifier.
       *
       * TODO(parity) `model/dao/ProductDAO.cfc:L410` — open-coded, and reassigned without `var`. The
       * line writes `lcase(replace(createUUID(),"-","","all"))` inline rather than calling the generator
       * `model/dao/HibachiDAO.cfc:L51-L53` exposes, and it reassigns the local declared at `:L390`
       * without a second `var`. The port calls the single shared generator — 32 lowercase hex characters
       * with no separators, per IR-6 — and keeps the reassignment, which is what makes the single return
       * at `:L416` correct for both paths.
       */
      idColumnValue = createSlatwallUUID();

      // `:L411-L413` appends the identifier column last, after every other column. Preserved.
      insertColumns.push(request.idColumn);
      insertParams.push(idColumnValue);

      await executor.executeMutation(
        composeImportInsert(request.table, insertColumns),
        insertParams,
      );
    }

    // `:L416` — one return, reached from both paths.
    return idColumnValue;
  }

  /**
   * Produces the URL title for a newly inserted product — the port of
   * `model/dao/ProductDAO.cfc:L398-L409`.
   *
   * TODO(parity) `model/dao/ProductDAO.cfc:L404-L406` — one append, no re-probe, so a second collision
   * is unhandled. `:l401-l403` probes for an existing product with the candidate title and, on a hit,
   * `:L405` appends `"_" & product_productCode` once and proceeds straight to the insert. Nothing probes
   * again, so two imported products sharing both a name and a code both attempt the same title.
   *
   * @param executor - the row's transaction-scoped executor, so the probe sees this transaction's writes.
   * @param row - the row being inserted.
   * @returns the URL title to insert.
   */
  private async resolveImportUrlTitle(
    executor: ProductStatementExecutor,
    row: NormalisedImportRow,
  ): Promise<string> {
    // `:L399`.
    const candidate = this.urlTitleFilter(readCell(row, REQUIRED_HEADING.productName));

    // `:L401-L403`.
    const collisions = await executor.execute(URL_TITLE_PROBE_STATEMENT, [candidate]);

    // `:L404` — no collision, use the candidate as it stands.
    if (collisions.length === 0) {
      return candidate;
    }

    // `:L405` — one append, and no second probe.
    return candidate + URL_TITLE_COLLISION_SEPARATOR + readCell(row, REQUIRED_HEADING.productCode);
  }

  /**
   * The current account identifier — the port of `getSlatwallScope().getCurrentAccount().getAccountID()`
   * at `model/dao/ProductDAO.cfc:L153` and again at `:L341`.
   *
   * @returns the account identifier, or `''` when there is no authenticated account.
   */
  private currentAccountID(): string {
    return this.accountContext.getCurrentAccount()?.accountID ?? '';
  }

  /**
   * Resolve a single-value lookup by issuing its statement — once per call, on every call.
   *
   * @param executor - the row's transaction-scoped executor.
   * @param value - the cell value to bind, verbatim.
   * @param statement - the lookup statement, whose sole placeholder takes `value`.
   * @param identifierColumn - the column the statement projects.
   * @returns the resolved identifier, or `''` when nothing matched — the legacy's own empty-set value.
   */
  private async resolveImportLookup(
    executor: ProductStatementExecutor,
    value: string,
    statement: string,
    identifierColumn: string,
  ): Promise<string> {
    const rows = await executor.execute(statement, [value]);

    return readFirstRowText(rows, identifierColumn);
  }

  /** Runs the two bulk back-fills — the port of `model/dao/ProductDAO.cfc:L287-L325`. */
  private async backfillImportDerivedColumns(): Promise<void> {
    await this.transactions.runWithoutTransaction(async (executor) => {
      // `:L288-L302` — back-fill 1. Zero parameters, exactly as `:L302` executes it.
      await executor.executeMutation(DEFAULT_SKU_BACKFILL_STATEMENT, []);

      /* `:L304-L325` — back-fill 2. */
      await executor.executeMutation(SKU_IMAGE_FILE_BACKFILL_STATEMENT, [
        IMAGE_EXTENSION_SEPARATOR + DEPRECATED_SETTING_DEFAULTS.globalImageExtension,
      ]);
    });
  }

  /**
   * The writable `SwProduct` values, in exactly the order {@link PRODUCT_WRITABLE_COLUMNS} lists them.
   */
  private collectWritableProductValues(product: Product): readonly unknown[] {
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
      product.brand?.brandID ?? null,
      product.productType?.productTypeID ?? null,
      /*
       * Read through the injected reader: `defaultSku` is a behavioural delegate with no identifier
       * accessor, by design. `undefined` when the product has no default, which is the state a new
       * product is inserted in — see the write-order note on `saveProduct`.
       */
      product.defaultSku === undefined ? null : this.readDefaultSkuId(product.defaultSku),
      product.remoteID ?? null,
      product.createdDateTime ?? null,
      product.createdByAccount ?? null,
      product.modifiedDateTime ?? null,
      product.modifiedByAccount ?? null,
    ];
  }

  /**
   * Write one product. See {@link ProductRepository.saveProduct} for the contract and for why no
   * importer statement could serve as this member.
   */
  public async saveProduct(product: Product): Promise<Product> {
    const isInsert = product.isNew();

    /*
     * The identifier `generator="uuid"` produced at flush time — assigned only while transient, so an
     * update keeps the identifier its stored row is keyed on, and so step 3 above updates rather than
     * inserting a duplicate.
     */
    if (isInsert) {
      product.productID = createSlatwallUUID();
    }

    /*
     * The audit block is stamped here, because this is the flush
     * Hibernate invoked `preInsert`/`preUpdate` automatically as part of the flush the framework
     * triggered at request end — `org/Hibachi/Hibachi.cfc` performs a double `ormFlush()` when the ORM
     * reports no errors, with `flushAtRequestEnd=false`. A stateless Lambda invocation has no ORM
     * session, no automatic flush and no request-end hook (mismatch M5, AAP §0.6.6), so nothing fires
     * the hook unless a write seam calls it. `src/services/BaseService.ts` explicitly declines the job
     * and places it "behind `EntityPersister`", which is this member.
     */
    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      applyPreInsertAudit(product, auditActor);
    } else {
      applyPreUpdateAudit(product, auditActor);
    }

    const writableValues = this.collectWritableProductValues(product);

    if (isInsert) {
      const columnList = [PRODUCT_ID_COLUMN, ...PRODUCT_WRITABLE_COLUMNS].join(', ');
      const placeholders = [PRODUCT_ID_COLUMN, ...PRODUCT_WRITABLE_COLUMNS]
        .map(() => '?')
        .join(', ');

      await this.executor.executeMutation(
        `INSERT INTO ${PRODUCT_TABLE} (${columnList}) VALUES (${placeholders})`,
        [product.productID, ...writableValues],
      );

      return product;
    }

    const assignments = PRODUCT_WRITABLE_COLUMNS.map((column) => `${column} = ?`).join(', ');

    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${assignments} WHERE ${PRODUCT_ID_COLUMN} = ?`,
      [...writableValues, product.productID],
    );

    return product;
  }

  /** Remove one product, together with the SKU rows and option links its cascade owns. */
  public async removeProduct(product: Product): Promise<void> {
    if (product.isNew()) {
      throw new DomainError('A product cannot be removed before it has been persisted.', {
        context: { productCode: product.productCode },
      });
    }

    const productIdentifier = product.productID;

    // 1. Drop the back-reference before the row it points at disappears.
    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${PRODUCT_DEFAULT_SKU_ID_COLUMN} = NULL ` +
        `WHERE ${PRODUCT_ID_COLUMN} = ?`,
      [productIdentifier],
    );

    // 2. The link rows, which reference the SKU rows removed next.
    await this.executor.executeMutation(
      `DELETE FROM ${SKU_OPTION_TABLE} WHERE ${SKU_OPTION_SKU_ID_COLUMN} IN ` +
        `(SELECT ${SKU_ID_COLUMN} FROM ${SKU_TABLE} WHERE ${SKU_PRODUCT_ID_COLUMN} = ?)`,
      [productIdentifier],
    );

    // 3. The SKU rows, which reference the product row removed last.
    await this.executor.executeMutation(
      `DELETE FROM ${SKU_TABLE} WHERE ${SKU_PRODUCT_ID_COLUMN} = ?`,
      [productIdentifier],
    );

    // 4. The product itself.
    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TABLE} WHERE ${PRODUCT_ID_COLUMN} = ?`,
      [productIdentifier],
    );
  }
}

/*
 * The product and product-type write surface for `SwProduct` and `SwProductType`. It lives here because
 * AAP §0.4.1.7 names this file as the product adapter.
 */

/* Validated identifiers (AAP §0.7.3) */

/** `SwRelatedProduct` — the one in-scope product link table, `model/entity/Product.cfc:L81`. */
const RELATED_PRODUCT_TABLE = assertTableName('SwRelatedProduct');

/** `SwSkuAccessContent` — `model/entity/Sku.cfc:L77`. */
const SKU_ACCESS_CONTENT_TABLE = assertTableName('SwSkuAccessContent');

/**
 * `SwSkuSubsBenefit` — `model/entity/Sku.cfc:L78`. The table name is abbreviated; the column is not.
 */
const SKU_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuSubsBenefit');

/** `SwSkuRenewalSubsBenefit` — `model/entity/Sku.cfc:L79`. */
const SKU_RENEWAL_SUBSCRIPTION_BENEFIT_TABLE = assertTableName('SwSkuRenewalSubsBenefit');

/**
 * The four link tables `model/entity/Sku.cfc:L76-L79` declares, each paired with its own SKU column, in
 * declaration order.
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

/** Every `SwProduct` column this file names — `model/entity/Product.cfc:L52-L99`. */
const PRODUCT_COLUMN = Object.freeze({
  /**
   * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` — `:L52` (IR-6).
   */
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
  /** Calculated but persisted, `ormtype="big_decimal"` — `:L62`. */
  calculatedSalePrice: assertColumnName(PRODUCT_TABLE, 'calculatedSalePrice'),
  /** Calculated but persisted — `:L63`. */
  calculatedQATS: assertColumnName(PRODUCT_TABLE, 'calculatedQATS'),
  /** Calculated but persisted — `:L64`. */
  calculatedAllowBackorderFlag: assertColumnName(PRODUCT_TABLE, 'calculatedAllowBackorderFlag'),
  /** Calculated but persisted — `:L65`. Read by the Google feed as the item title. */
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
  /** Audit foreign key carrying the `createdByAccount` field — `:L97`. */
  createdByAccountID: assertColumnName(PRODUCT_TABLE, 'createdByAccountID'),
  /** Audit timestamp — `:L98`. */
  modifiedDateTime: assertColumnName(PRODUCT_TABLE, 'modifiedDateTime'),
  /** Audit foreign key carrying the `modifiedByAccount` field — `:L99`. */
  modifiedByAccountID: assertColumnName(PRODUCT_TABLE, 'modifiedByAccountID'),
});

/** Every `SwProductType` column this file names — `model/entity/ProductType.cfc:L52-L86`. */
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
  /** Audit foreign key carrying the `createdByAccount` field — `:L84`. */
  createdByAccountID: assertColumnName(PRODUCT_TYPE_TABLE, 'createdByAccountID'),
  /** Audit timestamp — `:L85`. */
  modifiedDateTime: assertColumnName(PRODUCT_TYPE_TABLE, 'modifiedDateTime'),
  /** Audit foreign key carrying the `modifiedByAccount` field — `:L86`. */
  modifiedByAccountID: assertColumnName(PRODUCT_TYPE_TABLE, 'modifiedByAccountID'),
});

/** `SwRelatedProduct.productID` — the owner-side column, `model/entity/Product.cfc:L81`. */
const RELATED_PRODUCT_OWNER_COLUMN = assertColumnName(RELATED_PRODUCT_TABLE, 'productID');

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

/* Injected seams (AAP §0.7.3, AAP §0.7.3) */

/**
 * The statement-execution surface this adapter needs.
 *
 * @example
 * ```ts
 * // A complete double: no mocking library, no database, no inheritance.
 * Const calls: { sql: string; params: readonly unknown[] }[] = [];
 * ```
 */
export interface ProductPersistenceExecutor extends SqlExecutor {
  /**
   * Runs a data-modifying statement and returns the number of rows it affected.
   *
   * @param sql - the statement text, with every value position a `?` placeholder.
   * @param params - the values to bind, positionally.
   * @returns the affected-row count the driver reported.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

/**
 * The link and child rows a product or product-type removal must clear that belong to excluded
 * families — declared here, implemented outside this subtree, and flagged (TR-5).
 */
export interface ProductDependencyCleanup {
  /**
   * Clears every excluded-family row that references one product, before its own row is removed.
   *
   * @param productID - the 32-character identifier of the product being removed. Never empty: the
   * caller refuses a transient entity before reaching here.
   */
  removeProductDependencies(productID: string): Promise<void>;

  /**
   * Clears every excluded-family row that references one product type, before its own row is removed.
   *
   * @param productTypeID - the 32-character identifier of the product type being removed. Never empty.
   */
  removeProductTypeDependencies(productTypeID: string): Promise<void>;
}

/* The adapter. */

/** The MySQL implementation of the product and product-type write surface. */
export class MySqlProductPersistence {
  /**
   * @param executor - The statement executor. Injected, never constructed, and never bypassed: when
   * `src/adapters/mysql/UnitOfWork.ts` supplies a transaction-scoped executor every statement here
   * runs inside that boundary and the removal path's read observes the same transaction's writes (M6).
   *
   * @param dependencyCleanup - The excluded-family removal work, per {@link ProductDependencyCleanup}.
   * Required; see that contract for why an optional one would be unsafe.
   */
  public constructor(
    private readonly executor: ProductPersistenceExecutor,
    private readonly dependencyCleanup: ProductDependencyCleanup,
    private readonly readDefaultSkuId: DefaultSkuIdReader,
    private readonly accountContext: AccountContextPort,
  ) {}

  /**
   * Persists an already-populated, already-validated product, inserting or updating as its identity
   * requires.
   *
   * @param product - The fully populated, already-validated product to persist.
   * @returns The same product instance, carrying its identifier. Never null.
   */
  public async saveProduct(product: Product): Promise<Product> {
    const isInsert = product.isNew();

    if (isInsert) {
      product.productID = createSlatwallUUID();
    }

    /* — the flush's audit block, stamped before the statement is composed. See the doc block. */
    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      applyPreInsertAudit(product, auditActor);
    } else {
      applyPreUpdateAudit(product, auditActor);
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
   * @param product - The already-validated product to remove.
   * @throws {DataIntegrityError} When the product was never persisted and therefore has no row.
   */
  public async deleteProduct(product: Product): Promise<void> {
    /* step 1. */
    if (product.isNew()) {
      throw new DataIntegrityError(
        'A product that has never been persisted was handed to the removal path, so there is no row ' +
          'to identify and no statement was issued.',
        { context: { productID: product.productID, className: product.getClassName() } },
      );
    }

    const productID = product.productID;

    /* Step 2 — the stored column, not just the in-memory relationship. */
    await this.executor.executeMutation(
      `UPDATE ${PRODUCT_TABLE} SET ${PRODUCT_COLUMN.defaultSkuID} = NULL ` +
        `WHERE ${PRODUCT_COLUMN.productID} = ${BIND_PLACEHOLDER}`,
      [productID],
    );

    /* Step 3 — the excluded families, before the product row. */
    await this.dependencyCleanup.removeProductDependencies(productID);

    /* Step 4 — the owner side of the self-referencing link table, and only the owner side. */
    await this.executor.executeMutation(
      `DELETE FROM ${RELATED_PRODUCT_TABLE} ` +
        `WHERE ${RELATED_PRODUCT_OWNER_COLUMN} = ${BIND_PLACEHOLDER}`,
      [productID],
    );

    /* Step 5 — the SKU cascade, link rows first. */
    await this.removeSkusOfProduct(productID);

    /* Step 6. */
    await this.executor.executeMutation(
      `DELETE FROM ${PRODUCT_TABLE} WHERE ${PRODUCT_COLUMN.productID} = ${BIND_PLACEHOLDER}`,
      [productID],
    );
  }

  /**
   * Persists an already-populated, already-validated product type.
   *
   * @param productType - The fully populated, already-validated product type to persist.
   * @returns The same product-type instance, carrying its identifier. Never null.
   */
  public async saveProductType(productType: ProductType): Promise<ProductType> {
    const isInsert = productType.isNew();

    if (isInsert) {
      productType.productTypeID = createSlatwallUUID();
    }

    /*
     * — the two values rule 3b's restoration is decided from, read before the hook overwrites the
     * first of them. See the doc block for why recomputing beats restoring in every other case.
     */
    const hydratedProductTypeIDPath = productType.productTypeIDPath;
    const preservedParentProductTypeID = readHydratedParentProductTypeID(productType);

    /*
     * — the entity's own override, which rebuilds the ancestry path and then stamps the audit block.
     */
    const auditActor = this.accountContext.getCurrentAccount();
    if (isInsert) {
      productType.preInsert(auditActor);
    } else {
      productType.preUpdate(undefined, auditActor);
    }

    if (
      productType.parentProductType === undefined &&
      preservedParentProductTypeID !== undefined &&
      hydratedProductTypeIDPath !== undefined
    ) {
      productType.productTypeIDPath = hydratedProductTypeIDPath;
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
            /*
             * The declared constant, not `productType.getClassName`, and the asymmetry with the
             * product side above is deliberate. `src/domain/product/Product.ts` declares the seven
             * managed-entity members as class methods, so the product path can call one. On
             * `src/domain/product/ProductType.ts` records the opposite decision for this entity: the
             * same seven are attached by composition through `manageEntity` and are deliberately not
             * methods of the class, so a bare `ProductType` does not carry `getClassName` and calling
             * it here would not compile. `PRODUCT_TYPE_CLASS_NAME` is derived from the single
             * `PRODUCT_TYPE_ENTITY_METADATA.className` literal that the composed `getClassName`
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
       * An unusable identifier is refused, never skipped. `model/entity/Sku.cfc:L52` declares the
       * primary key `ormtype="string" length="32"`, so a non-text or empty value means the schema is not
       * what it is declared to be. Skipping the row would leave that SKU's link rows behind and then fail
       * the product removal on a foreign-key constraint, with nothing anywhere naming the cause. This
       * matches the posture `SmartListQueryBuilder.ts` takes on the same class of value.
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
      /*
       * Association identity, `model/entity/Product.cfc:L68` — read off the object, not a scalar.
       */
      product.brand?.brandID ?? null,
      /* `:L69`. */
      product.productType?.productTypeID ?? null,
      /*
       * `:L70` — through the injected reader, because the delegate exposes no identifier accessor.
       */
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
      /*
       * Association identity, `model/entity/ProductType.cfc:L62` — the self-referencing parent, with
       * the preserved foreign key as its fallback.
       */
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
