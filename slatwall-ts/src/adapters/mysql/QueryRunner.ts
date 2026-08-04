/**
 * QueryRunner — the single parameterized-execution boundary of the extracted Catalog slice, and the
 * home of the validated identifier whitelist the whole adapter folder depends on.
 *
 * AAP §0.4.1.7 makes this file create against `model/dao/HibachiDAO.cfc`, with
 * `org/Hibachi/HibachiDAO.cfc` as reference: *"`pool.execute` wrapper enforcing parameterized
 * binding; the get / list / save / delete / count surface the slice actually uses"*. Rule R4
 * (AAP §0.4.3.4) names the translation — `ormExecuteQuery(hql, positionalParams)` becomes
 * `pool.execute(sql, params)` — and TR-4 names the invariant that must survive it: the bound value
 * list is assembled in exactly the legacy sequence, one placeholder per legacy positional parameter,
 * because binding ORDER is observable behaviour even when the statement text is not.
 *
 * Which legacy surface this is, and why it is reached through a local subclass (IR-8)
 * The four in-scope data-access components extend `model/dao/HibachiDAO.cfc`, whose declaration at
 * `:L49` is `extends="Slatwall.org.Hibachi.HibachiDAO"` and whose entire body — `:L51-L53` — is one
 * identifier helper that is already ported to `src/util/uuid.ts`. The surface actually being ported
 * therefore belongs to the framework class, reached through a Slatwall-local subclass that adds
 * nothing to it. That indirection is easy to miss and worth stating once: reading only the local
 * file would suggest there is no persistence surface to port at all.
 *
 * @see `src/adapters/mysql/rowMappers.ts` for the hydration half of the same boundary.
 */

import {
  DatabaseStatementError,
  DataIntegrityError,
  DomainError,
  UniqueConstraintViolationError,
  type DatabaseStatementFailureClass,
} from '../../errors/DomainError';
import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../domain/BaseProductType';
import {
  mapBrandRow,
  mapOptionGroupRow,
  mapOptionRow,
  mapProductRow,
  mapProductTypeRow,
  mapSkuRow,
  markSkuOwnedLinkLoaded,
  toRows,
} from './rowMappers';

import type { Option } from '../../domain/option/Option';
import type { OptionGroup } from '../../domain/option/OptionGroup';
import type { Product, ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type { Sku } from '../../domain/sku/Sku';
import type { SmartListEntityName } from '../../ports/SmartListQueryPort';
import type { MySqlRow } from './rowMappers';

/*
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] — the legacy tree speaks two table vocabularies at once, and both are correct
 * This is the single most consequential design decision in this file, and getting it wrong produces
 * code that compiles, passes every test anybody happens to write, and then fails at run time the
 * first time a real caller reaches it.
 *
 * TODO(parity) `model/dao/ProductDAO.cfc:L288` and `:L304` — case sensitivity is a deliberate
 * translation decision, not an incidental one (AAP §0.8.2 Guideline 6). CFML `eq` and `==` compare
 * strings case-insensitively, and the legacy source relies on it without noticing: the same
 * database-product test is spelled `eq "mySQL"` at `:L288` and `eq "mySql"` at `:L304`, and the
 * importer matches a column key spelled `brand_brandname` at `:L180` against a differently-cased
 * heading. TypeScript `===` is case-sensitive. Both assertions below therefore normalise their input
 * case, preserving the legacy tolerance, while emitting the exact canonical casing the schema
 * declares, so nothing downstream depends on how a caller happened to spell it.
 */

/** The twelve physical table names the extracted catalog slice may name in a statement. */
const PHYSICAL_TABLE_NAMES = [
  'SwProduct',
  'SwSku',
  'SwProductType',
  'SwBrand',
  'SwOption',
  'SwOptionGroup',
  'SwSkuOption',
  'SwSkuAccessContent',
  'SwSkuSubsBenefit',
  'SwSkuRenewalSubsBenefit',
  'SwRelatedProduct',
  'SwAlternateSkuCode',
] as const;

/*
 * The scope classification (CWE-284, CWE-250). This registry is the one ratified statement of the
 * service's schema surface: the catalog boundary names seven tables, every further table the slice must
 * reach is classified here as cross-domain read-only or cross-domain write, and no adapter may name a
 * table outside it. Ratify the exact unavoidable schema surface, provision least-privilege credentials,
 * and require every emitted table/column to pass one auditable registry."
 */

/** How far outside the catalog boundary a validated table name sits. */
export type TableScope =
  'catalog-core' | 'catalog-owned-link' | 'cross-domain-write' | 'cross-domain-read-only';

/** Every table this service may name, mapped to its scope. */
const TABLE_SCOPES = {
  /*
   * Catalog-core: the seven of AAP §0.2.1.2.
   */
  SwProduct: 'catalog-core',
  SwSku: 'catalog-core',
  SwProductType: 'catalog-core',
  SwBrand: 'catalog-core',
  SwOption: 'catalog-core',
  SwOptionGroup: 'catalog-core',
  /**
   * `model/entity/Sku.cfc:L76` `linktable="SwSkuOption"` — without it the option model is unusable.
   */
  SwSkuOption: 'catalog-core',

  /*
   * Catalog-owned-link: owning side in scope, far side not.
   */
  /** `model/entity/Sku.cfc:L77` `linktable="SwSkuAccessContent"`; far side `Content` excluded. */
  SwSkuAccessContent: 'catalog-owned-link',
  /**
   * `model/entity/Sku.cfc:L78` `linktable="SwSkuSubsBenefit"`; far side `subscriptionBenefit` excluded.
   */
  SwSkuSubsBenefit: 'catalog-owned-link',
  /** `model/entity/Sku.cfc:L79` `linktable="SwSkuRenewalSubsBenefit"`; same far family. */
  SwSkuRenewalSubsBenefit: 'catalog-owned-link',
  /** `model/entity/Product.cfc:L81` — the one of ten collections with `SwProduct` on both sides. */
  SwRelatedProduct: 'catalog-owned-link',

  /*
   * Cross-domain-read-only: excluded families, reached to answer a question.
   */
  /**
   * `model/entity/AlternateSkuCode.cfc:L49` — the SKU-code fallback at `model/dao/SkuDAO.cfc:L103`.
   */
  SwAlternateSkuCode: 'cross-domain-read-only',
  /** `model/entity/SubscriptionTerm.cfc` — the non-fetching join of `model/dao/SkuDAO.cfc:L159`. */
  SwSubscriptionTerm: 'cross-domain-read-only',
  /**
   * `model/entity/Stock.cfc:L49` — the mediating table eight of the ten existence tests traverse.
   */
  SwStock: 'cross-domain-read-only',
  /** `model/entity/OrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L66`. */
  SwOrderItem: 'cross-domain-read-only',
  /** `model/entity/Inventory.cfc:L49` — `model/dao/SkuDAO.cfc:L68`. */
  SwInventory: 'cross-domain-read-only',
  /** `model/entity/OrderDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L70`. */
  SwOrderDeliveryItem: 'cross-domain-read-only',
  /** `model/entity/PhysicalCountItem.cfc:L49` — `model/dao/SkuDAO.cfc:L72`. */
  SwPhysicalCountItem: 'cross-domain-read-only',
  /** `model/entity/StockAdjustmentDeliveryItem.cfc:L49` — `model/dao/SkuDAO.cfc:L74`. */
  SwStockAdjustmentDeliveryItem: 'cross-domain-read-only',
  /**
   * `model/entity/StockAdjustmentItem.cfc:L49` — reached twice, `model/dao/SkuDAO.cfc:L76` and `:L78`.
   */
  SwStockAdjustmentItem: 'cross-domain-read-only',
  /** `model/entity/StockHold.cfc:L49` — `model/dao/SkuDAO.cfc:L80`. */
  SwStockHold: 'cross-domain-read-only',
  /** `model/entity/StockReceiverItem.cfc:L49` — `model/dao/SkuDAO.cfc:L82`. */
  SwStockReceiverItem: 'cross-domain-read-only',
  /** `model/entity/VendorOrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L84`. */
  SwVendorOrderItem: 'cross-domain-read-only',

  /*
   * The attribute family, reached by the importer and the attribute-set selection.
   */
  /**
   * `model/entity/AttributeSet.cfc:L49` — the root of the selection at `model/dao/ProductDAO.cfc:L53`,
   * whose result is the return of `ProductRepository.findAttributeSets`, a declared port member.
   */
  SwAttributeSet: 'cross-domain-read-only',
  /**
   * `model/entity/Attribute.cfc:L49` — the `activeFlag` existence test at `model/dao/ProductDAO.cfc:L54`.
   */
  SwAttribute: 'cross-domain-read-only',
  /**
   * `model/entity/AttributeSet.cfc:L70` `linktable="SwAttributeSetProductType"` — the physical
   * relationship standing in for the association path `model/dao/ProductDAO.cfc:L58` names.
   */
  SwAttributeSetProductType: 'cross-domain-read-only',
  /** `model/entity/Type.cfc:L49` — reached through `attributeSetType` for its `systemCode`. */
  SwType: 'cross-domain-read-only',
  /** `model/entity/AttributeValue.cfc:L54` — the one cross-domain table this service writes. */
  SwAttributeValue: 'cross-domain-write',
} as const satisfies Readonly<Record<string, TableScope>>;

/** Any table name this service may name in a statement, of any scope. */
export type RegisteredTableName = keyof typeof TABLE_SCOPES;

/** The registered names carrying any of the given scopes. */
type TableNamesScoped<S extends TableScope> = {
  [K in RegisteredTableName]: (typeof TABLE_SCOPES)[K] extends S ? K : never;
}[RegisteredTableName];

/** A registered name this service is permitted to write. */
export type WriteableTableName = TableNamesScoped<
  'catalog-core' | 'catalog-owned-link' | 'cross-domain-write'
>;

/**
 * Reports the scope of a table name already validated by {@link assertRegisteredTableName}.
 *
 * @param table - a registered physical name.
 * @returns its scope, as declared in {@link TABLE_SCOPES}.
 */
export function tableScope(table: RegisteredTableName): TableScope {
  return TABLE_SCOPES[table];
}

/**
 * Every registered table name, for the audit a provisioning script performs.
 *
 * @returns the twenty-eight names paired with their scopes, frozen, in declaration order.
 */
export function registeredTableScopes(): readonly (readonly [RegisteredTableName, TableScope])[] {
  return Object.freeze(
    Object.entries(TABLE_SCOPES).map(
      ([name, scope]) => Object.freeze([name, scope]) as readonly [RegisteredTableName, TableScope],
    ),
  );
}

/** A physical `Sw*` table name that has been validated against the extracted schema. */
export type PhysicalTableName = (typeof PHYSICAL_TABLE_NAMES)[number];

/** The application key the framework prefixes onto an entity name to form its logical form. */
const LOGICAL_NAME_PREFIX = 'slatwall';

/** The number of leading characters of a physical name that form its schema prefix. */
const PHYSICAL_NAME_PREFIX_LENGTH = 2;

/**
 * Every column each in-scope physical table declares, harvested from the entity `property` blocks.
 */
const TABLE_COLUMNS: Readonly<Record<PhysicalTableName, ReadonlySet<string>>> = Object.freeze({
  /*
   * Model/entity/Product.cfc — scalars :L52-L59, calculated persistent :L62-L65, many-to-one
   * L68-L70, remote identifier :L93, audit :L96-L99.
   */
  SwProduct: new Set([
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
    'brandID',
    'productTypeID',
    'defaultSkuID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /*
   * Model/entity/Sku.cfc — scalars :L52-L59, calculated persistent :L62, many-to-one :L65-L66,
   * remote identifier :L90, audit :L93-L96.
   */
  SwSku: new Set([
    'skuID',
    'activeFlag',
    'skuCode',
    'listPrice',
    'price',
    'renewalPrice',
    'imageFile',
    'userDefinedPriceFlag',
    'calculatedQATS',
    'productID',
    'subscriptionTermID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /*
   * Model/entity/ProductType.cfc — scalars :L52-L59, self-referencing many-to-one :L62, remote
   * identifier :L80, audit :L83-L86.
   */
  SwProductType: new Set([
    'productTypeID',
    'productTypeIDPath',
    'activeFlag',
    'publishedFlag',
    'urlTitle',
    'productTypeName',
    'productTypeDescription',
    'systemCode',
    'parentProductTypeID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /*
   * Model/entity/Brand.cfc — scalars :L52-L57, remote identifier :L74, audit :L77-L80. Brand
   * declares no non-persistent property at all, so its column set is its whole surface.
   */
  SwBrand: new Set([
    'brandID',
    'activeFlag',
    'publishedFlag',
    'urlTitle',
    'brandName',
    'brandWebsite',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /*
   * Model/entity/Option.cfc — scalars :L52-L56, many-to-one :L59-L60, remote identifier :L73,
   * audit :L76-L79. `sortOrder` at :L56 carries `sortContext="optionGroup"`, which is why the
   * sort-order helper at org/Hibachi/HibachiDAO.cfc:L149-L168 needs a context column at all.
   */
  SwOption: new Set([
    'optionID',
    'optionCode',
    'optionName',
    'optionDescription',
    'sortOrder',
    'optionGroupID',
    'defaultImageID',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /* Model/entity/OptionGroup.cfc — scalars :L52-L58, remote identifier :L61, audit :L64-L67. */
  SwOptionGroup: new Set([
    'optionGroupID',
    'optionGroupName',
    'optionGroupCode',
    'optionGroupImage',
    'optionGroupDescription',
    'imageGroupFlag',
    'sortOrder',
    'remoteID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),

  /*
   * The link table has exactly two columns and no audit members, taken from the owning declaration
   * at model/entity/Sku.cfc:L76 (`fkcolumn="skuID" inversejoincolumn="optionID"`). Both are named in
   * the sorted-SKU statement at model/dao/SkuDAO.cfc:L184 and :L186, and in the existence sub-queries
   * the option-to-SKU resolver composes.
   */
  SwSkuOption: new Set(['skuID', 'optionID']),

  /*
   * `model/entity/Sku.cfc:L77` — `accessContents`, `linktable="SwSkuAccessContent"`,
   * `fkcolumn="skuID"`, `inversejoincolumn="contentID"`. Note the far column is `contentID` and not
   * `accessContentID`: the collection is named for the role it plays on the SKU, while the column names
   * the entity it points at. Deriving the column from the property name would produce a column that
   * does not exist. Two columns, no audit members, exactly as the sibling link tables.
   */
  SwSkuAccessContent: new Set(['skuID', 'contentID']),

  /*
   * `model/entity/Sku.cfc:L78` — `subscriptionBenefits`, `linktable="SwSkuSubsBenefit"`,
   * `fkcolumn="skuID"`, `inversejoincolumn="subscriptionBenefitID"`. The table name is abbreviated
   * where the column name is not; both are verbatim from the declaration and neither may be
   * regularised to match the other.
   */
  SwSkuSubsBenefit: new Set(['skuID', 'subscriptionBenefitID']),

  /*
   * `model/entity/Sku.cfc:L79` — `renewalSubscriptionBenefits`, `linktable="SwSkuRenewalSubsBenefit"`,
   * `fkcolumn="skuID"`, `inversejoincolumn="subscriptionBenefitID"`.
   */
  SwSkuRenewalSubsBenefit: new Set(['skuID', 'subscriptionBenefitID']),

  /*
   * `model/entity/Product.cfc:L81` — `relatedProducts`, `linktable="SwRelatedProduct"`,
   * `fkcolumn="productID"`, `inversejoincolumn="relatedProductID"`.
   */
  SwRelatedProduct: new Set(['productID', 'relatedProductID']),

  /*
   * Model/entity/AlternateSkuCode.cfc — identifier :L52, scalar :L53, the two many-to-one foreign
   * keys :L56 and :L57, audit :L60-L63. Note the first foreign key is `skuTypeID` and not
   * `alternateSkuCodeTypeID`: `:L56` declares the property `alternateSkuCodeType` with
   * `fkcolumn="skuTypeID"`, so the column name does not follow the property name. Deriving it by
   * convention would produce a column that does not exist. This table carries no `remoteID`.
   */
  SwAlternateSkuCode: new Set([
    'alternateSkuCodeID',
    'alternateSkuCode',
    'skuTypeID',
    'skuID',
    'createdDateTime',
    'createdByAccountID',
    'modifiedDateTime',
    'modifiedByAccountID',
  ]),
});

/** A registered table that {@link TABLE_COLUMNS} does not map. */
type ExtendedTableName = Exclude<RegisteredTableName, PhysicalTableName>;

/**
 * The columns this service names on each registered table that {@link TABLE_COLUMNS} does not map.
 */
const EXTENDED_TABLE_COLUMNS: Readonly<Record<ExtendedTableName, ReadonlySet<string>>> =
  Object.freeze({
    /*
     * The ten-way existence chain of `model/dao/SkuDAO.cfc:L53-L98`.
     */
    /*
     * `model/entity/Stock.cfc` — the mediating table eight of the ten tests traverse: they name the
     * association path `stock.sku`, which resolves to this table's own key plus its SKU foreign key.
     */
    SwStock: new Set(['stockID', 'skuID']),
    /* `model/entity/OrderItem.cfc:L49` — `model/dao/SkuDAO.cfc:L66`, keyed directly by SKU. */
    SwOrderItem: new Set(['skuID']),
    /* `model/entity/Inventory.cfc:L49` — `:L68`, mediated through stock. */
    SwInventory: new Set(['stockID']),
    /* `model/entity/OrderDeliveryItem.cfc:L49` — `:L70`, mediated through stock. */
    SwOrderDeliveryItem: new Set(['stockID']),
    /* `model/entity/PhysicalCountItem.cfc:L49` — `:L72`, mediated through stock. */
    SwPhysicalCountItem: new Set(['stockID']),
    /* `model/entity/StockAdjustmentDeliveryItem.cfc:L49` — `:L74`, mediated through stock. */
    SwStockAdjustmentDeliveryItem: new Set(['stockID']),
    /*
     * `model/entity/StockAdjustmentItem.cfc:L57-L58` — reached twice, `:L76` via `fromStockID` and `:L78`
     * via `toStockID`, which is why this is the one chain member carrying two stock keys.
     */
    SwStockAdjustmentItem: new Set(['fromStockID', 'toStockID']),
    /* `model/entity/StockHold.cfc:L49` — `:L80`, mediated through stock. */
    SwStockHold: new Set(['stockID']),
    /* `model/entity/StockReceiverItem.cfc:L49` — `:L82`, mediated through stock. */
    SwStockReceiverItem: new Set(['stockID']),
    /*
     * `model/entity/VendorOrderItem.cfc:L60` — `model/dao/SkuDAO.cfc:L84` reaches the SKU through the
     * row's `stockID`, mediated by the item's `stock` relationship, exactly like the eight mediated
     * tests above it. The entity declares `fkcolumn="stockID"` and no direct SKU association.
     *
     * This row used to read `new Set(['skuID'])` under a comment claiming the table was "keyed directly
     * by SKU", and both halves were wrong. Three sources agree against that reading. `model/dao/SkuDAO.cfc:L84`
     * writes the association path `stock.sku.skuID`, not `sku.skuID`, so this test traverses stock like
     * `:L68`-`:L82` do and unlike the one genuinely direct test at `:L66`. `model/entity/VendorOrderItem.cfc:L60`
     * declares `property name="stock" cfc="Stock" fieldtype="many-to-one" fkcolumn="stockID"` and declares
     * no `sku` property at all, so `skuID` is not a column on this table under any reading. And
     * `../mysql/MySqlSkuRepository.ts`'s own chain emits `INNER JOIN SwStock st ON st.stockID = a.stockID`
     * for this table, so the registry was withholding the one column the statement needs while admitting
     * one no statement anywhere in `src/` names.
     *
     * The registry is this subtree's stated schema contract as well as its identifier whitelist, so the
     * disagreement was not inert: an environment provisioned from the contract got no `stockID` column and
     * every product- and SKU-delete guard that consults `transactionExists` failed with
     * `ER_BAD_FIELD_ERROR` instead of answering. `stockMediatedSkuExistsClause` now validates each
     * item-side foreign key against the item table itself, so a future disagreement of this shape fails at
     * composition rather than at the database.
     */
    SwVendorOrderItem: new Set(['stockID']),

    /*
     * The non-fetching join of `model/dao/SkuDAO.cfc:L159`.
     */
    /*
     * `model/entity/SubscriptionTerm.cfc`, and `model/entity/Sku.cfc:L66` on the near side — the term key
     * carries the same spelling on both, which is why one name serves the join.
     */
    SwSubscriptionTerm: new Set(['subscriptionTermID']),

    /*
     * The attribute-set selection of `model/dao/ProductDAO.cfc:L52-L62`.
     */
    /*
     * `model/entity/AttributeSet.cfc` — key :L52, `globalFlag` :L57, `sortOrder` :L61,
     * `fkcolumn="attributeSetTypeID"` :L64.
     */
    SwAttributeSet: new Set(['attributeSetID', 'globalFlag', 'sortOrder', 'attributeSetTypeID']),
    /*
     * `model/entity/Attribute.cfc` — key :L52, `activeFlag` :L53, `fkcolumn="attributeSetID"` :L67.
     */
    SwAttribute: new Set(['attributeID', 'activeFlag', 'attributeSetID']),
    /*
     * `model/entity/AttributeSet.cfc:L70` — `fkcolumn="attributeSetID"`,
     * `inversejoincolumn="productTypeID"`.
     */
    SwAttributeSetProductType: new Set(['attributeSetID', 'productTypeID']),
    /*
     * `model/entity/Type.cfc` — key :L52, `systemCode` :L55, the bound filter and first sort term.
     */
    SwType: new Set(['typeID', 'systemCode']),

    /*
     * The importer's custom-attribute step, `model/dao/ProductDAO.cfc:L244` and `:L250`.
     */
    /*
     * `model/entity/AttributeValue.cfc` — key :L57, value :L58, `attributeValueType` :L60 (`notnull`,
     * which is why the INSERT supplies it), `attributeID` :L78, `fkcolumn="productID"` :L70.
     */
    SwAttributeValue: new Set([
      'attributeValueID',
      'attributeValue',
      'attributeValueType',
      'attributeID',
      'productID',
    ]),
  });

/**
 * Builds the case-insensitive lookup that resolves any accepted spelling to its physical name.
 *
 * @returns the completed lookup, keyed by lower-cased candidate.
 */
function buildTableNameLookup(): ReadonlyMap<string, PhysicalTableName> {
  const lookup = new Map<string, PhysicalTableName>();

  for (const physicalName of PHYSICAL_TABLE_NAMES) {
    const bareName = physicalName.slice(PHYSICAL_NAME_PREFIX_LENGTH).toLowerCase();

    lookup.set(physicalName.toLowerCase(), physicalName);
    lookup.set(`${LOGICAL_NAME_PREFIX}${bareName}`, physicalName);
    lookup.set(bareName, physicalName);
  }

  return lookup;
}

/**
 * Builds one case-insensitive column index per table from the declared column sets.
 *
 * @param declarations - the declared column sets, normally {@link TABLE_COLUMNS}.
 * @returns one frozen, fully populated index per table.
 */
function buildColumnLookup(
  declarations: Readonly<Record<PhysicalTableName, ReadonlySet<string>>>,
): Readonly<Record<PhysicalTableName, ReadonlyMap<string, string>>> {
  const indexFor = (columnNames: ReadonlySet<string>): ReadonlyMap<string, string> => {
    const index = new Map<string, string>();
    for (const columnName of columnNames) {
      index.set(columnName.toLowerCase(), columnName);
    }
    return index;
  };

  return Object.freeze({
    SwProduct: indexFor(declarations.SwProduct),
    SwSku: indexFor(declarations.SwSku),
    SwProductType: indexFor(declarations.SwProductType),
    SwBrand: indexFor(declarations.SwBrand),
    SwOption: indexFor(declarations.SwOption),
    SwOptionGroup: indexFor(declarations.SwOptionGroup),
    SwSkuOption: indexFor(declarations.SwSkuOption),
    SwSkuAccessContent: indexFor(declarations.SwSkuAccessContent),
    SwSkuSubsBenefit: indexFor(declarations.SwSkuSubsBenefit),
    SwSkuRenewalSubsBenefit: indexFor(declarations.SwSkuRenewalSubsBenefit),
    SwRelatedProduct: indexFor(declarations.SwRelatedProduct),
    SwAlternateSkuCode: indexFor(declarations.SwAlternateSkuCode),
  });
}

/** The resolved table-name lookup, built once at module evaluation and never mutated. */
const TABLE_NAME_LOOKUP: ReadonlyMap<string, PhysicalTableName> = buildTableNameLookup();

/**
 * The case-insensitive index of the sixteen cross-domain names — fifteen read-only, plus the one
 * cross-domain table this service writes. Counted rather than asserted: {@link TABLE_SCOPES} declares
 * twenty-eight names and {@link PHYSICAL_TABLE_NAMES} carries twelve of them with a column map, so this
 * map holds the remaining sixteen. Its membership is a consequence of the filter below, not of a scope
 * test, which is why the write table is in it.
 */
const CROSS_DOMAIN_NAME_LOOKUP: ReadonlyMap<string, RegisteredTableName> = new Map(
  /*
   * Filtered by absence from the sibling map, not by scope, and the difference matters. Filtering on
   * `scope === 'cross-domain-read-only'` is correct only while that is the only cross-domain class:
   * Adding `cross-domain-write` for
   * `SwAttributeValue` immediately made that name resolvable through neither map — absent from
   * `TABLE_NAME_LOOKUP` because it has no column map there, and excluded from this one by the scope test —
   * so `assertRegisteredTableName` refused a name the registry had just ratified, and every statement the
   * importer composes failed at module load. Partitioning by "is it in the other map" is total by
   * construction: a name is in exactly one of the two, whatever scope it is later given.
   */
  Object.entries(TABLE_SCOPES)
    .filter(([name]) => !TABLE_NAME_LOOKUP.has(name.toLowerCase()))
    .map(([name]) => [name.toLowerCase(), name as RegisteredTableName]),
);

/** The resolved per-table column indexes, built once at module evaluation and never mutated. */
const TABLE_COLUMN_LOOKUP: Readonly<Record<PhysicalTableName, ReadonlyMap<string, string>>> =
  buildColumnLookup(TABLE_COLUMNS);

/**
 * Validates a table name against the extracted Catalog schema and returns its physical form.
 *
 * @param candidate - a table name in any of the three accepted vocabularies.
 * @returns the canonical physical table name, safe to place into statement text.
 * @throws {DomainError} when the name is not one of the twelve in-scope tables. The candidate travels
 * on the error's `context` for a server-side log; the presentation this error type reports to a
 * caller is deliberately neutral, so a caller cannot use the refusal to enumerate the schema.
 *
 * @example
 * ```ts
 * const table = assertTableName('SlatwallSku'); // 'SwSku'
 * const sql = `SELECT skuID FROM ${table} WHERE productID = ?`;
 * Const rows = await executor.execute(sql, [productId]);
 * ```
 */
export function assertTableName(candidate: string): PhysicalTableName {
  const resolved = TABLE_NAME_LOOKUP.get(candidate.trim().toLowerCase());

  if (resolved === undefined) {
    throw new DomainError(
      'A statement named a table that the extracted Catalog schema does not contain, so it was ' +
        'refused before any statement text was assembled.',
      { context: { candidate } },
    );
  }

  return resolved;
}

/**
 * Validates any registered table name — including a cross-domain one — for use in a read.
 *
 * @param candidate - the name to validate, in any accepted vocabulary.
 * @returns the canonical physical name.
 * @throws {DomainError} when the name is in no scope at all, refused before any statement text exists.
 */
export function assertRegisteredTableName(candidate: string): RegisteredTableName {
  const normalized = candidate.trim();
  const writeable = TABLE_NAME_LOOKUP.get(normalized.toLowerCase());

  if (writeable !== undefined) {
    return writeable;
  }

  const crossDomain = CROSS_DOMAIN_NAME_LOOKUP.get(normalized.toLowerCase());

  if (crossDomain === undefined) {
    throw new DomainError(
      'A statement named a table that is in neither the extracted Catalog schema nor the ratified ' +
        'cross-domain read surface, so it was refused before any statement text was assembled.',
      { context: { candidate } },
    );
  }

  return crossDomain;
}

/**
 * Validates a table name for a write, refusing any table outside the Catalog boundary.
 *
 * @param candidate - the name to validate, in any accepted vocabulary.
 * @returns the canonical physical name, guaranteed writeable.
 * @throws {DomainError} when the name is unregistered, or is registered as `cross-domain-read-only`.
 */
export function assertWriteTableName(candidate: string): WriteableTableName {
  const resolved = assertRegisteredTableName(candidate);

  /*
   * The predicate is the guard, which is why there is no cast on this path. {@link isWriteableTableName}
   * states the scope test to the compiler as a type predicate, so the narrowing below is checked rather
   * than asserted — and a name whose scope is later changed to read-only starts being refused here without
   * any edit to this function.
   */
  if (!isWriteableTableName(resolved)) {
    throw new DomainError(
      'A write statement named a table on the ratified cross-domain READ surface, which this service ' +
        'reaches only to answer questions and never to modify. It was refused before any statement text ' +
        'was assembled.',
      { context: { table: resolved, scope: TABLE_SCOPES[resolved] } },
    );
  }

  return resolved;
}

/**
 * Type predicate narrowing a registered name to the writeable subset.
 *
 * @param candidate - a registered physical name.
 * @returns true when the name's scope permits writing.
 */
function isWriteableTableName(candidate: RegisteredTableName): candidate is WriteableTableName {
  const scope: TableScope = TABLE_SCOPES[candidate];

  return scope !== 'cross-domain-read-only';
}

/*
 * TODO(parity) D8 — the dialect branch is collapsed as a documented decision, not resolved
 * `model/dao/SkuDAO.cfc:L177` carries one of only three literal TODO comments in the whole slice,
 * immediately above the sorted-SKU statement, recording that the statement is untested against
 * anything other than Microsoft SQL Server and MySQL. The branch it guards is at `:L194-L197`: an
 * ordering expression cast through `bigint` on one engine and left uncast on the other. Two further
 * branches on the same run-time value sit at `model/dao/ProductDAO.cfc:L288` and `:L304`, and the
 * value itself comes from the probe at `config/configORM.cfm:L8-L14`, which reads a database product
 * name and selects `MySQL`, `MicrosoftSQLServer` or `Oracle10g`.
 */

/**
 * Validates a column name against one table's declared columns and returns its canonical casing.
 *
 * @param table - the validated physical table the column must belong to.
 * @param candidate - a column name in any casing, with surrounding whitespace tolerated.
 * @returns the column name in the exact casing the entity declaration uses.
 * @throws {DomainError} when the table does not declare that column. Both the table and the candidate
 * travel on the error's `context`; neither is disclosed to a caller.
 *
 * @example
 * ```ts
 * // 'product_productCode' arrives as a file heading; the importer takes its last segment.
 * Const column = assertColumnName('SwProduct', 'productcode'); // 'productCode'
 * ```
 */
/**
 * Every column the extracted schema declares on one table, in declaration order.
 *
 * @param table - A table name already validated by {@link assertTableName}.
 * @returns That table's declared columns. Never empty, because every entry of {@link TABLE_COLUMNS}
 * declares at least a primary key.
 */
export function columnsForTable(table: PhysicalTableName): readonly string[] {
  return Object.freeze([...TABLE_COLUMNS[table]]);
}

export function assertColumnName(table: PhysicalTableName, candidate: string): string {
  const resolved = TABLE_COLUMN_LOOKUP[table].get(candidate.trim().toLowerCase());

  if (resolved === undefined) {
    throw new DomainError(
      'A statement named a column that the extracted Catalog schema does not declare on the table ' +
        'it was applied to, so it was refused before any statement text was assembled.',
      { context: { table, candidate } },
    );
  }

  return resolved;
}

/**
 * Validates a column on any registered table, Catalog or cross-domain.
 *
 * @param table - a table name already validated by {@link assertRegisteredTableName}.
 * @param candidate - the column name to validate.
 * @returns the canonical column name as its declaration spells it.
 * @throws {DomainError} when the table does not declare the column in this subtree's registry.
 */
export function assertRegisteredColumnName(table: RegisteredTableName, candidate: string): string {
  if (table in TABLE_COLUMN_LOOKUP) {
    return assertColumnName(table as PhysicalTableName, candidate);
  }

  const declared = EXTENDED_TABLE_COLUMNS[table as ExtendedTableName];
  const normalized = candidate.trim();

  /*
   * Matched case-insensitively for the same reason `TABLE_COLUMN_LOOKUP` is: the legacy interpolates these
   * names with inconsistent casing — `modifiedDatetime` at `model/dao/ProductDAO.cfc:L363` beside
   * `CreatedByAccountID` at `:L365` — and got away with it because SQL identifiers are case-insensitive on
   * the engines it targeted. Resolving to the declared spelling removes the dependency on that leniency.
   */
  for (const column of declared) {
    if (column.toLowerCase() === normalized.toLowerCase()) {
      return column;
    }
  }

  throw new DomainError(
    'A statement named a column that this service does not declare on the ratified cross-domain table ' +
      'it was applied to, so it was refused before any statement text was assembled.',
    { context: { table, candidate, scope: TABLE_SCOPES[table] } },
  );
}

/* Bound values — the other half of AAP §0.7.3, and the reason the public boundary is `unknown` */

/** Narrows one unknown parameter to a bindable scalar. */
export type BoundParameterValue = string | number | bigint | boolean | Date | null;

/**
 * Narrows one unknown parameter to a bindable scalar.
 *
 * @param candidate - one element of a caller-supplied parameter list.
 * @returns `true` when the value can be bound to a `?` placeholder as-is.
 */
function isBoundParameterValue(candidate: unknown): candidate is BoundParameterValue {
  return (
    candidate === null ||
    typeof candidate === 'string' ||
    typeof candidate === 'number' ||
    typeof candidate === 'bigint' ||
    typeof candidate === 'boolean' ||
    candidate instanceof Date
  );
}

/**
 * Narrows a whole parameter list to bindable scalars, preserving order exactly.
 *
 * @param params - the caller's parameter list, in legacy positional order.
 * @returns a new list of the same length and order, typed for the driver.
 * @throws {DomainError} when any element is not a bindable scalar. The position and the offending
 * value's runtime type travel on `context`; the value itself deliberately does not, because a bound
 * parameter can hold data that has no business in an error object.
 */
function toBoundValues(params: readonly unknown[]): BoundParameterValue[] {
  const values: BoundParameterValue[] = [];

  for (let index = 0; index < params.length; index += 1) {
    const candidate = params[index];

    if (!isBoundParameterValue(candidate)) {
      throw new DomainError(
        'A bound parameter is not one of the scalar shapes this port binds, so the statement was ' +
          'not prepared. Bind one value per placeholder; a list must be expanded by the caller.',
        {
          context: {
            position: index,
            parameterCount: params.length,
            valueType: candidate === undefined ? 'undefined' : typeof candidate,
          },
        },
      );
    }

    values.push(candidate);
  }

  return values;
}

/**
 * Reads the affected-row count from a write acknowledgement, without asserting the driver's type.
 *
 * @param driverResult - whatever the driver returned, unnarrowed.
 * @returns the affected-row count, or `undefined` when the value is not a write acknowledgement.
 */
export function readAffectedRows(driverResult: unknown): number | undefined {
  if (typeof driverResult !== 'object' || driverResult === null || Array.isArray(driverResult)) {
    return undefined;
  }

  if (!('affectedRows' in driverResult)) {
    return undefined;
  }

  const affectedRows: unknown = driverResult.affectedRows;

  return typeof affectedRows === 'number' && Number.isInteger(affectedRows) && affectedRows >= 0
    ? affectedRows
    : undefined;
}

/**
 * Reads the affected-row count from a write acknowledgement, or refuses.
 *
 * @param driverResult - whatever the driver returned, unnarrowed.
 * @param parameterCount - how many values the statement bound, for the diagnostic record only. The
 * values themselves deliberately never travel, because a bound parameter can hold data that has no
 * business in an error object.
 *
 * @returns the number of rows the statement affected, which may legitimately be zero.
 */
export function requireAffectedRows(driverResult: unknown, parameterCount: number): number {
  const affectedRows = readAffectedRows(driverResult);

  if (affectedRows === undefined) {
    throw new DataIntegrityError(
      'A writing statement did not produce a write acknowledgement, so the number of rows it ' +
        'affected could not be read.',
      { context: { parameterCount } },
    );
  }

  return affectedRows;
}

/**
 * Narrows a single projected column value to a whole, non-negative count.
 *
 * @param projected - the single column value the counting statement produced.
 * @returns the count as a number.
 * @throws {DataIntegrityError} when the value cannot be read as a whole, non-negative count.
 */
function toCount(projected: unknown): number {
  if (typeof projected === 'number' && Number.isInteger(projected) && projected >= 0) {
    return projected;
  }

  if (
    typeof projected === 'bigint' &&
    projected >= 0n &&
    projected <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(projected);
  }

  if (typeof projected === 'string' && /^\d+$/.test(projected)) {
    const parsed = Number(projected);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  throw new DataIntegrityError(
    'A counting statement produced a value that cannot be read as a whole, non-negative count, so ' +
      'no count could be reported.',
    { context: { valueType: typeof projected } },
  );
}

/*
 * (D18-class) — duplicate-key translation, shared by both driver paths
 * A duplicate key is not a uniqueness-path concept — any write in the subtree can hit one — so the report
 * has to be the same wherever it happens, and that is why the translation lives in this shared module
 * rather than beside any one probe.
 */

/** MySQL's server error number for a rejected duplicate key: `ER_DUP_ENTRY`. */
export const MYSQL_DUPLICATE_ENTRY_ERRNO = 1062;

/** The driver's symbolic spelling of {@link MYSQL_DUPLICATE_ENTRY_ERRNO}. */
const MYSQL_DUPLICATE_ENTRY_CODE = 'ER_DUP_ENTRY';

/**
 * MySQL's server error number for a transaction rolled back to break a deadlock: `ER_LOCK_DEADLOCK`.
 */
export const MYSQL_LOCK_DEADLOCK_ERRNO = 1213;

/** The driver's symbolic spelling of {@link MYSQL_LOCK_DEADLOCK_ERRNO}. */
const MYSQL_LOCK_DEADLOCK_CODE = 'ER_LOCK_DEADLOCK';

/**
 * MySQL's server error number for a lock that could not be acquired in time: `ER_LOCK_WAIT_TIMEOUT`.
 */
export const MYSQL_LOCK_WAIT_TIMEOUT_ERRNO = 1205;

/** The driver's symbolic spelling of {@link MYSQL_LOCK_WAIT_TIMEOUT_ERRNO}. */
const MYSQL_LOCK_WAIT_TIMEOUT_CODE = 'ER_LOCK_WAIT_TIMEOUT';

/** Stable server-side statement failures that receive a bounded internal classification. */
interface DatabaseFailureDescriptor {
  readonly errno: number;
  readonly code: string;
  readonly failureClass: DatabaseStatementFailureClass;
}

/** The closed mapping from MySQL identifiers to disclosure-safe failure classes. */
const DATABASE_FAILURE_DESCRIPTORS: readonly DatabaseFailureDescriptor[] = Object.freeze([
  { errno: 1054, code: 'ER_BAD_FIELD_ERROR', failureClass: 'unknown-column' },
  { errno: 1146, code: 'ER_NO_SUCH_TABLE', failureClass: 'unknown-table' },
  { errno: 1142, code: 'ER_TABLEACCESS_DENIED_ERROR', failureClass: 'permission-denied' },
  { errno: 1406, code: 'ER_DATA_TOO_LONG', failureClass: 'data-too-long' },
  { errno: 1064, code: 'ER_PARSE_ERROR', failureClass: 'syntax' },
  { errno: 1210, code: 'ER_WRONG_ARGUMENTS', failureClass: 'binding' },
]);

/** A driver code is retained only when it is one bounded symbolic token. */
const DRIVER_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** SQLSTATE is a five-character alphanumeric classification. */
const SQL_STATE_PATTERN = /^[0-9A-Z]{5}$/;

/** How many characters of a constraint name are retained in the internal account. */
const CONSTRAINT_NAME_ECHO_LIMIT = 96;

/**
 * Reports whether a caught value is MySQL's rejection of a duplicate key.
 *
 * @param cause - the caught value, of unknown type.
 * @returns true when the value identifies itself as a duplicate-key rejection.
 */
export function isDuplicateEntryFailure(cause: unknown): boolean {
  return matchesMySqlFailure(cause, MYSQL_DUPLICATE_ENTRY_ERRNO, MYSQL_DUPLICATE_ENTRY_CODE);
}

/**
 * Reports whether a caught value is one of MySQL's two transient lock failures.
 *
 * @param cause - the caught value, of unknown type.
 * @returns true when the value identifies itself as a deadlock or a lock-wait timeout.
 */
export function isTransientLockFailure(cause: unknown): boolean {
  return (
    matchesMySqlFailure(cause, MYSQL_LOCK_DEADLOCK_ERRNO, MYSQL_LOCK_DEADLOCK_CODE) ||
    matchesMySqlFailure(cause, MYSQL_LOCK_WAIT_TIMEOUT_ERRNO, MYSQL_LOCK_WAIT_TIMEOUT_CODE)
  );
}

/**
 * The one structural match every failure predicate above shares.
 *
 * @param cause - the caught value, of unknown type.
 * @param errno - the server error number to match on `errno`.
 * @param code - the driver's symbolic spelling to match on `code`.
 * @returns true when either field identifies the failure. Both are checked because which fields a driver
 * populates is the driver's choice and not a contract this port can pin.
 */
function matchesMySqlFailure(cause: unknown, errno: number, code: string): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false;
  }

  const candidate = cause as { readonly errno?: unknown; readonly code?: unknown };

  return candidate.errno === errno || candidate.code === code;
}

/** The stable scalar fields that may survive driver-error sanitisation. */
interface StableDriverFailureMetadata {
  readonly errno?: number;
  readonly code?: string;
  readonly sqlState?: string;
}

/**
 * Reads only bounded scalar identifiers from a driver failure.
 *
 * The driver's message, statement text and statement-specific message are deliberately not read at
 * all, so they cannot accidentally enter a replacement error's message, context or cause.
 */
function readStableDriverFailureMetadata(cause: unknown): StableDriverFailureMetadata {
  if (typeof cause !== 'object' || cause === null) {
    return {};
  }

  const candidate = cause as {
    readonly errno?: unknown;
    readonly code?: unknown;
    readonly sqlState?: unknown;
  };
  const errno =
    typeof candidate.errno === 'number' && Number.isSafeInteger(candidate.errno)
      ? candidate.errno
      : undefined;
  const code =
    typeof candidate.code === 'string' && DRIVER_CODE_PATTERN.test(candidate.code)
      ? candidate.code
      : undefined;
  const sqlState =
    typeof candidate.sqlState === 'string' && SQL_STATE_PATTERN.test(candidate.sqlState)
      ? candidate.sqlState
      : undefined;

  return {
    ...(errno !== undefined ? { errno } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(sqlState !== undefined ? { sqlState } : {}),
  };
}

/** Maps stable MySQL identifiers to one bounded class, defaulting safely for every other driver error. */
function classifyDatabaseStatementFailure(
  metadata: StableDriverFailureMetadata,
): DatabaseStatementFailureClass {
  const matched = DATABASE_FAILURE_DESCRIPTORS.find(
    (descriptor) =>
      descriptor.errno === metadata.errno ||
      (metadata.code !== undefined && descriptor.code === metadata.code),
  );

  return matched?.failureClass ?? 'driver';
}

/**
 * Extracts the constraint name from a duplicate-key failure, discarding the colliding value.
 *
 * @param cause - the caught value, already known to be a duplicate-key rejection.
 * @returns the constraint name, truncated to {@link CONSTRAINT_NAME_ECHO_LIMIT}, or undefined when
 * the message does not carry one in the documented shape.
 */
export function describeDuplicateEntryConstraint(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }

  const { message } = cause as { readonly message?: unknown };

  if (typeof message !== 'string') {
    return undefined;
  }

  /*
   * Anchored on the literal `for key '` that MySQL emits, and matching to the next quote rather than
   * greedily to the last one, so a colliding value that itself contains `for key '` cannot extend the
   * captured span. Only printable ASCII other than a quote is admitted, which excludes the control
   * characters a log-injection payload would need.
   */
  const matched = /for key '([\x20-\x26\x28-\x7e]*)'/.exec(message);
  const constraintName = matched?.[1];

  if (constraintName === undefined || constraintName.length === 0) {
    return undefined;
  }

  return constraintName.length > CONSTRAINT_NAME_ECHO_LIMIT
    ? `${constraintName.slice(0, CONSTRAINT_NAME_ECHO_LIMIT)}…`
    : constraintName;
}

/**
 * Re-raises a caught driver failure through one disclosure-safe translation boundary.
 *
 * @param cause - the caught value, of unknown type.
 * @param parameterCount - how many values the failing statement bound. Recorded instead of the
 * statement text and instead of the values, matching the sibling throw sites in this module, which
 * record a count for the same reason: it is diagnostic without being disclosive.
 *
 * @returns never — the function always throws.
 * @throws {UniqueConstraintViolationError} when the failure is a duplicate-key rejection.
 * @throws {DatabaseStatementError} for every other non-transient driver rejection.
 */
export function rethrowTranslatingDuplicateEntry(cause: unknown, parameterCount: number): never {
  /*
   * — the transient pair is checked first, and the order is not arbitrary: the two predicates
   * are disjoint by construction (three distinct error numbers), so either order gives the same answer, and
   * checking the newer arm first keeps the older arm's body exactly as it was.
   */
  if (isTransientLockFailure(cause)) {
    const deadlocked = matchesMySqlFailure(
      cause,
      MYSQL_LOCK_DEADLOCK_ERRNO,
      MYSQL_LOCK_DEADLOCK_CODE,
    );

    throw new UniqueConstraintViolationError(
      deadlocked
        ? 'The database rolled this transaction back to break a deadlock with another writer, so no ' +
            'part of it was applied. The identical request may succeed if it is made again.'
        : 'The database could not acquire a lock another writer was holding before the wait timed ' +
            'out, so the write did not happen. The identical request may succeed if it is made again.',
      {
        cause,
        context: {
          parameterCount,
          errno: deadlocked ? MYSQL_LOCK_DEADLOCK_ERRNO : MYSQL_LOCK_WAIT_TIMEOUT_ERRNO,
          /*
           * The classification, not a decision. `true` says "asking again is not futile", which is what
           * the server's own rollback establishes. Whether asking again is correct is the caller's
           * question, and this module deliberately does not answer it.
           */
          retryable: true,
        },
      },
    );
  }

  if (!isDuplicateEntryFailure(cause)) {
    const metadata = readStableDriverFailureMetadata(cause);

    throw new DatabaseStatementError({
      failureClass: classifyDatabaseStatementFailure(metadata),
      parameterCount,
      ...(metadata.code !== undefined ? { code: metadata.code } : {}),
      ...(metadata.errno !== undefined ? { errno: metadata.errno } : {}),
      ...(metadata.sqlState !== undefined ? { sqlState: metadata.sqlState } : {}),
    });
  }

  const constraintName = describeDuplicateEntryConstraint(cause);

  throw new UniqueConstraintViolationError(
    'The database refused a write because a value it carries is already held by another row, so the ' +
      'uniqueness check that preceded it was overtaken.',
    {
      cause,
      context: {
        parameterCount,
        errno: MYSQL_DUPLICATE_ENTRY_ERRNO,
        /*
         * False, and stated rather than omitted. The value is taken; asking again gets the same answer,
         * and the caller's own validation verdict is stale by now. Recording it explicitly is what lets a
         * caller branch on `retryable` alone instead of having to know which errno means what.
         */
        retryable: false,
        ...(constraintName !== undefined ? { constraintName } : {}),
      },
    },
  );
}

/*
 * Row-COUNT binding — the one place a paging figure is turned into a bound value
 * `toRowCountBinding` is the whole of this section, and its one caller is the smart list's paged read
 * in `./SmartListQueryBuilder.ts` — the port of `org/Hibachi/HibachiSmartList.cfc`'s page view.
 */

/**
 * Converts a validated row count into the form the driver accepts in a `LIMIT` or `OFFSET` position.
 *
 * @param value - a non-negative whole row count.
 * @returns the same count as decimal text, ready to bind.
 * @throws {DomainError} when the value is not a non-negative safe integer, so a `NaN` or a fraction
 * cannot reach a `LIMIT` clause as the string `"NaN"`.
 */
export function toRowCountBinding(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      'A row-count placeholder can only be bound to a whole, non-negative number, and the value ' +
        'supplied is not one.',
      { context: { value } },
    );
  }

  return String(value);
}

/* The injectable seam and the execution boundary. */

/**
 * The narrow read contract every repository in this folder builds its dependency from.
 *
 * @example
 * ```ts
 * // A complete test double, with no mocking library and no database.
 * Const calls: { sql: string; params: readonly unknown[] }[] = [];
 * ```
 */
export interface SqlExecutor {
  /**
   * Runs one statement with its values bound positionally and returns the rows it produced.
   *
   * @param sql - the statement text, whose every value position is a `?` placeholder and whose every
   * identifier came from {@link assertTableName} or {@link assertColumnName}.
   *
   * @param params - the values to bind, in the legacy positional order (TR-4).
   * @returns the rows, in the order the statement produced them; empty when it matched nothing.
   */
  execute(sql: string, params: readonly unknown[]): Promise<MySqlRow[]>;
}

/*
 * The driver port — declared here because this layer is the one that speaks to the driver The three
 * contracts below are the only description of a connection pool that anything in
 * `src/adapters/mysql/**` depends on. They are declared by the consumer rather than imported from
 * the provider, and that direction is the whole point: `src/config/database.ts` owns the one
 * module-scope pool this subtree ever creates (AAP §0.4.1.3 — "Module-scope `mysql2` pool created
 * outside the handler for warm-invocation reuse"), and its exported `pool` satisfies these shapes
 * structurally without either file importing the other. So there is no import edge from an adapter
 * into the configuration layer, no import edge back, and — decisively — no second pool, because
 * nothing here can create one.
 */

/**
 * The prepared-execution surface, satisfied by a pool and by a pooled connection alike.
 *
 * @remarks The driver's answer is intentionally typed as an unnarrowed tuple. The two callers narrow
 * it in the two different ways the two kinds of statement need — a read through the sibling
 * mapper's list narrowing, a write through the acknowledgement reader — and neither narrowing is
 * expressible in terms of the other.
 */
export interface StatementRunner {
  /**
   * Runs one prepared statement.
   *
   * @param sql - the statement text, with one `?` in every value position.
   * @param values - the values to bind, already narrowed and in legacy positional order.
   * @returns the driver's answer: its result in the first position, its field metadata after it.
   */
  execute(sql: string, values: readonly BoundParameterValue[]): Promise<[unknown, unknown[]]>;
}

/** A checked-out connection a transaction can be opened on, settled and then handed back. */
export interface TransactionalStatementRunner extends StatementRunner {
  /** Opens a transaction on this connection. */
  beginTransaction(): Promise<void>;

  /** Commits the open transaction. */
  commit(): Promise<void>;

  /** Rolls the open transaction back. */
  rollback(): Promise<void>;

  /** Returns a known-clean connection to the pool for re-use. */
  release(): void;

  /** Takes a connection of unknown state permanently out of service instead of recycling it. */
  destroy(): void;
}

/**
 * The pool: prepared execution without a transaction, plus the ability to check one connection out.
 */
export interface StatementPool extends StatementRunner {
  /**
   * Checks out one connection for the caller to open a transaction on.
   *
   * @returns the connection, which the caller must settle and then release or destroy.
   */
  getConnection(): Promise<TransactionalStatementRunner>;
}

/**
 * The execution contract for a caller that both reads and writes on one connection.
 *
 * @example
 * ```ts
 * // A complete double, with no mocking library and no database.
 * ```
 */
export type ReadWriteSqlExecutor = SqlMutationExecutor;

/*
 * This name was a second, identical `export interface` of the shape {@link SqlMutationExecutor}
 * declares, in this same file, and it is now an alias of it.
 */

/** A {@link SqlExecutor} that can also write, and that is bound to one connection. */
export interface SqlMutationExecutor extends SqlExecutor {
  /**
   * Runs one writing statement with its values bound positionally and returns the rows it affected.
   *
   * @param sql - the writing statement text, whose every value position is a `?` placeholder and whose
   * every identifier came from {@link assertTableName} or {@link assertColumnName}.
   *
   * @param params - the values to bind, in the legacy positional order (TR-4).
   * @returns the number of rows affected, which may legitimately be zero.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

/**
 * The parameterized-execution boundary: the one object in this port that speaks to the driver.
 *
 * @example
 * ```ts
 * // Wired once in the composition root; never constructed inside a repository.
 * Const runner = new QueryRunner(pool);
 * Const skus = await runner.execute('SELECT * FROM SwSku WHERE productID = ?', [productId]);
 * ```
 */
export class QueryRunner implements ReadWriteSqlExecutor {
  /** The injected connection pool. */
  private readonly pool: StatementPool;

  /**
   * @param pool - the pool to run every statement on, supplied by the composition root. This class
   * never builds one, never reads a credential and never resolves a connection target; contrast
   * `model/dao/ProductDAO.cfc:L155-L158`, `:L329-L332` and `:L420`, which build a credential-reading
   * connection three separate times inside the data-access layer itself.
   */
  public constructor(pool: StatementPool) {
    this.pool = pool;
  }

  /**
   * Runs one statement and returns every row it produced.
   *
   * @param sql - the statement text, with a `?` in every value position.
   * @param params - the values to bind, in legacy positional order.
   * @returns the rows produced, in statement order; an empty list when nothing matched.
   * @throws {DomainError} when a parameter is not a bindable scalar, or when the statement text is
   * blank.
   */
  public async execute(sql: string, params: readonly unknown[]): Promise<MySqlRow[]> {
    return toRows(await this.runStatement(sql, params));
  }

  /**
   * Runs one statement and returns its first row, or `null` when it produced none.
   *
   * TODO(parity) `org/Hibachi/HibachiDAO.cfc:L24` — the `new` fallback is deliberately not
   * reproduced here. The legacy member takes a third argument, `isReturnNewOnNotFound`, and when it is
   * true and nothing was found it returns a newly constructed, unsaved entity instead of nothing. That
   * is Hibernate-session behaviour and it is a service-layer decision about what a miss should mean; a
   * statement runner that manufactured an entity on a miss would fabricate domain objects invisibly,
   * and a caller could not tell a stored row from an invented one. This member therefore returns `null`
   * and the decision stays with the service that wanted it. The legacy member's other side effect —
   * `entity.updateCalculatedProperties()` at `:L19`, mutating the entity it is about to hand back — is
   *
   * @param sql - the statement text, with a `?` in every value position.
   * @param params - the values to bind, in legacy positional order.
   * @returns the first row, or `null` when the statement matched nothing.
   * @throws {DomainError} on the same conditions as {@link QueryRunner.execute}.
   */
  public async executeOne(sql: string, params: readonly unknown[]): Promise<MySqlRow | null> {
    const rows = await this.execute(sql, params);

    // Indexed reads are checked because `noUncheckedIndexedAccess` types this as possibly absent,
    // which is exactly the honest type of "the first row of a result set that may be empty".
    const firstRow = rows[0];

    return firstRow ?? null;
  }

  /**
   * Runs one writing statement and returns how many rows it affected.
   *
   * @param sql - the writing statement text, with a `?` in every value position.
   * @param params - the values to bind, in legacy positional order.
   * @returns the number of rows the statement affected, which may legitimately be zero.
   * @throws {DomainError} when a parameter is not a bindable scalar, or the statement text is blank.
   * @throws {DataIntegrityError} when the driver's answer is not a write acknowledgement — most often a
   * read statement routed into this path, which would otherwise silently report zero rows affected.
   */
  public async executeMutation(sql: string, params: readonly unknown[]): Promise<number> {
    return requireAffectedRows(await this.runStatement(sql, params), params.length);
  }

  /**
   * Runs one counting statement and returns its single numeric result.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L93-L95` — the legacy read was unguarded and this one is not,
   * which is a strict-mode requirement rather than a behaviour change. The legacy code reads
   * `results[1]` with no check that the result holds anything and compares it directly to zero; under
   * CFML an empty result would fail there at run time with an index error. Under
   * `noUncheckedIndexedAccess` the same read is typed as possibly absent and cannot compile unchecked,
   * so the absence has to be handled explicitly. It raises rather than defaulting to zero, because
   * zero is a meaningful count — the legacy comparison at `:L93` treats zero as "no transaction
   * exists" — and manufacturing it from a malformed result would turn a broken statement into a
   *
   * @param sql - the counting statement text, projecting exactly one column.
   * @param params - the values to bind, in legacy positional order.
   * @returns the count.
   * @throws {DomainError} when a parameter is not a bindable scalar, or the statement text is blank.
   * @throws {DataIntegrityError} when the statement produced no row, projected more than one column, or
   * produced a value that is not a whole, non-negative count.
   */
  public async executeScalarCount(sql: string, params: readonly unknown[]): Promise<number> {
    const rows = await this.execute(sql, params);
    const firstRow = rows[0];

    if (firstRow === undefined) {
      throw new DataIntegrityError(
        'A counting statement produced no row at all, so there was no count to read.',
        { context: { parameterCount: params.length } },
      );
    }

    const projectedValues = Object.values(firstRow);

    if (projectedValues.length !== 1) {
      throw new DataIntegrityError(
        'A counting statement did not project exactly one column, so which value is the count is ' +
          'ambiguous.',
        { context: { projectedColumnCount: projectedValues.length } },
      );
    }

    return toCount(projectedValues[0]);
  }

  /**
   * The one and only place in this port where the driver is spoken to.
   *
   * @param sql - the statement text as composed by the caller.
   * @param params - the values to bind, in legacy positional order.
   * @returns the driver's answer, unnarrowed.
   * @throws {DomainError} when the statement text is blank, a parameter is not a bindable scalar, or
   * the statement's placeholder count does not match the number of values supplied.
   *
   * @throws {UniqueConstraintViolationError} when the driver refuses the write as a duplicate key.
   */
  private async runStatement(sql: string, params: readonly unknown[]): Promise<unknown> {
    if (sql.trim().length === 0) {
      throw new DomainError(
        'A blank statement reached the execution boundary, so there was nothing to prepare.',
        { context: { parameterCount: params.length } },
      );
    }

    try {
      const [driverResult] = await this.pool.execute(sql, toBoundValues(params));

      return driverResult;
    } catch (cause: unknown) {
      /*
       * The catch wraps only the driver call, not the blank-statement guard above and not the
       * parameter narrowing inside `toBoundValues`, so a `DomainError` this class raised deliberately
       * can never be mistaken for a driver failure and re-examined as one.
       */
      rethrowTranslatingDuplicateEntry(cause, params.length);
    }
  }
}

/*
 * This module also holds the association loaders that hydrate a selection's brands, product types,
 * default SKUs and SKU options. AAP §0.4.1 freezes the subtree at 102 files, so the loaders live
 * beside the executor they run on rather than in a module of their own.
 */

/**
 * Resolves the many-to-one associations a hydrated Catalog record needs before business logic reads it.
 */
/* The tables and columns this module reads. */

const PRODUCT_TABLE: PhysicalTableName = assertTableName('SwProduct');
const SKU_TABLE: PhysicalTableName = assertTableName('SwSku');
const PRODUCT_TYPE_TABLE: PhysicalTableName = assertTableName('SwProductType');
const BRAND_TABLE: PhysicalTableName = assertTableName('SwBrand');
const OPTION_GROUP_TABLE: PhysicalTableName = assertTableName('SwOptionGroup');
const SKU_OPTION_TABLE: PhysicalTableName = assertTableName('SwSkuOption');
const OPTION_TABLE: PhysicalTableName = assertTableName('SwOption');
const SKU_ACCESS_CONTENT_TABLE: PhysicalTableName = assertTableName('SwSkuAccessContent');
const SKU_SUBSCRIPTION_BENEFIT_TABLE: PhysicalTableName = assertTableName('SwSkuSubsBenefit');

/** The identifier and foreign-key columns each loader reads or filters on. */
const COLUMN = Object.freeze({
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  productBrandID: assertColumnName(PRODUCT_TABLE, 'brandID'),
  productProductTypeID: assertColumnName(PRODUCT_TABLE, 'productTypeID'),
  productDefaultSkuID: assertColumnName(PRODUCT_TABLE, 'defaultSkuID'),
  skuID: assertColumnName(SKU_TABLE, 'skuID'),
  skuProductID: assertColumnName(SKU_TABLE, 'productID'),
  productTypeID: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID'),
  brandID: assertColumnName(BRAND_TABLE, 'brandID'),
  optionGroupID: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID'),
  optionID: assertColumnName(OPTION_TABLE, 'optionID'),
  optionOptionGroupID: assertColumnName(OPTION_TABLE, 'optionGroupID'),
  skuOptionSkuID: assertColumnName(SKU_OPTION_TABLE, 'skuID'),
  skuOptionOptionID: assertColumnName(SKU_OPTION_TABLE, 'optionID'),
  accessContentSkuID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'skuID'),
  accessContentContentID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'contentID'),
  subscriptionBenefitSkuID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
  subscriptionBenefitID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'subscriptionBenefitID'),
});

/** Builds an explicit, table-qualified projection for one table. */
function projectionFor(table: PhysicalTableName, columns: readonly string[]): string {
  return columns.map((column) => `${table}.${assertColumnName(table, column)}`).join(', ');
}

const PRODUCT_PROJECTION = projectionFor(PRODUCT_TABLE, [
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
  'brandID',
  'productTypeID',
  'defaultSkuID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const SKU_PROJECTION = projectionFor(SKU_TABLE, [
  'skuID',
  'activeFlag',
  'skuCode',
  'listPrice',
  'price',
  'renewalPrice',
  'imageFile',
  'userDefinedPriceFlag',
  'calculatedQATS',
  'productID',
  'subscriptionTermID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const PRODUCT_TYPE_PROJECTION = projectionFor(PRODUCT_TYPE_TABLE, [
  'productTypeID',
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
  'parentProductTypeID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const BRAND_PROJECTION = projectionFor(BRAND_TABLE, [
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const OPTION_GROUP_PROJECTION = projectionFor(OPTION_GROUP_TABLE, [
  'optionGroupID',
  'optionGroupName',
  'optionGroupCode',
  'optionGroupImage',
  'optionGroupDescription',
  'imageGroupFlag',
  'sortOrder',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const OPTION_PROJECTION = projectionFor(OPTION_TABLE, [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
  'optionGroupID',
  'defaultImageID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/* The one collaborator these loaders cannot supply themselves. */

/** What a caller must provide before the product and SKU roots can be resolved. */
export interface CatalogAggregateDependencies {
  /** Adapts a hydrated SKU to the shape `product.defaultSku` accepts. */
  readonly bindDefaultSkuDelegate: (sku: Sku) => ProductDefaultSkuDelegate;
}

/* The request shape. */

/** One batch of hydrated records whose associations are to be resolved. */
export interface AggregateLoadRequest {
  /** The executor the caller is already using. */
  readonly executor: SqlExecutor;
  /** The raw rows, carrying the foreign-key columns the mappers deliberately skipped. */
  readonly rows: readonly MySqlRow[];
  /** The mapped entities, index-aligned with `rows` and mutated in place. */
  readonly entities: readonly unknown[];
}

/** Resolves the associations one root entity's consumers require. */
export type CatalogAggregateLoader = (request: AggregateLoadRequest) => Promise<void>;

/* Reading foreign keys off a raw row. */

/**
 * Reads one foreign-key column as a non-empty string, or `undefined` when the association is absent.
 *
 * @param row - one raw result row.
 * @param column - the whitelisted column name to read.
 * @returns the identifier, or `undefined` when the column is absent, NULL or empty.
 * @throws {DataIntegrityError} when the column holds something that is not a string. A foreign key that
 * is not text is a schema disagreement, and guessing at a coercion would hide it.
 */
function readForeignKey(row: MySqlRow, column: string): string | undefined {
  const value = row[column];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DataIntegrityError(
      'A Catalog foreign-key column holds a value that is not text, so the association it names ' +
        'could not be resolved. Every identifier in this schema is a 32-character string ' +
        '[model/entity/Sku.cfc:L52].',
      { context: { column, receivedType: typeof value } },
    );
  }

  return value;
}

/** Every distinct identifier the given column holds across the batch, in first-seen order. */
function collectIdentifiers(rows: readonly MySqlRow[], column: string): readonly string[] {
  const seen = new Set<string>();

  for (const row of rows) {
    const identifier = readForeignKey(row, column);
    if (identifier !== undefined) {
      seen.add(identifier);
    }
  }

  return [...seen];
}

/**
 * Loads rows from one table by identifier and indexes the mapped results.
 *
 * @param request - the batch being resolved, for its executor.
 * @param table - the whitelisted table to read.
 * @param projection - that table's explicit column list.
 * @param idColumn - the whitelisted identifier column to filter on.
 * @param identifiers - the distinct identifiers wanted.
 * @param mapper - the scalar row mapper for this table.
 */
async function loadByIdentifiers<TEntity>(
  request: AggregateLoadRequest,
  table: PhysicalTableName,
  projection: string,
  idColumn: string,
  identifiers: readonly string[],
  mapper: (row: MySqlRow) => TEntity,
): Promise<Map<string, { readonly entity: TEntity; readonly row: MySqlRow }>> {
  const indexed = new Map<string, { readonly entity: TEntity; readonly row: MySqlRow }>();

  if (identifiers.length === 0) {
    return indexed;
  }

  const placeholders = identifiers.map(() => '?').join(', ');
  const rows = await request.executor.execute(
    `SELECT ${projection} FROM ${table} WHERE ${idColumn} IN (${placeholders})`,
    [...identifiers],
  );

  for (const row of rows) {
    const identifier = readForeignKey(row, idColumn);
    if (identifier !== undefined) {
      indexed.set(identifier, { entity: mapper(row), row });
    }
  }

  return indexed;
}

/* The product aggregate, shared by two roots. */

/**
 * Resolves `productType`, `brand` and `defaultSku` on a batch of products.
 *
 * @param request - the batch being resolved, for its executor.
 * @param dependencies - supplies the default-SKU delegate binder.
 * @param productRows - the raw product rows, carrying the three foreign keys.
 * @param products - the mapped products, index-aligned with `productRows`.
 */
async function attachProductAssociations(
  request: AggregateLoadRequest,
  dependencies: CatalogAggregateDependencies,
  productRows: readonly MySqlRow[],
  products: readonly Product[],
): Promise<void> {
  const productTypes = await loadByIdentifiers(
    request,
    PRODUCT_TYPE_TABLE,
    PRODUCT_TYPE_PROJECTION,
    COLUMN.productTypeID,
    collectIdentifiers(productRows, COLUMN.productProductTypeID),
    mapProductTypeRow,
  );

  const brands = await loadByIdentifiers(
    request,
    BRAND_TABLE,
    BRAND_PROJECTION,
    COLUMN.brandID,
    collectIdentifiers(productRows, COLUMN.productBrandID),
    mapBrandRow,
  );

  const defaultSkus = await loadByIdentifiers(
    request,
    SKU_TABLE,
    SKU_PROJECTION,
    COLUMN.skuID,
    collectIdentifiers(productRows, COLUMN.productDefaultSkuID),
    mapSkuRow,
  );

  products.forEach((product, index) => {
    const row = productRows[index];
    if (row === undefined) {
      return;
    }

    const productTypeID = readForeignKey(row, COLUMN.productProductTypeID);
    const resolvedProductType =
      productTypeID === undefined ? undefined : productTypes.get(productTypeID);
    if (resolvedProductType !== undefined) {
      product.productType = resolvedProductType.entity;
    }

    /* Optional by design — see the LEFT-join note in this module's header. */
    const brandID = readForeignKey(row, COLUMN.productBrandID);
    const resolvedBrand = brandID === undefined ? undefined : brands.get(brandID);
    if (resolvedBrand !== undefined) {
      product.brand = resolvedBrand.entity;
    }

    /*
     * Bound through the injected adapter, never assigned directly — the entity does not satisfy the
     * delegate and deliberately never will. See {@link CatalogAggregateDependencies}.
     */
    const defaultSkuID = readForeignKey(row, COLUMN.productDefaultSkuID);
    const resolvedDefaultSku =
      defaultSkuID === undefined ? undefined : defaultSkus.get(defaultSkuID);
    if (resolvedDefaultSku !== undefined) {
      product.defaultSku = dependencies.bindDefaultSkuDelegate(resolvedDefaultSku.entity);
    }
  });
}

/* The loaders. */

/** `SlatwallSku` — attaches each SKU's product, fully associated. Resolves int-02. */
const createSkuAggregateLoader =
  (dependencies: CatalogAggregateDependencies): CatalogAggregateLoader =>
  async (request) => {
    const productIdentifiers = collectIdentifiers(request.rows, COLUMN.skuProductID);

    const products = await loadByIdentifiers(
      request,
      PRODUCT_TABLE,
      PRODUCT_PROJECTION,
      COLUMN.productID,
      productIdentifiers,
      mapProductRow,
    );

    const loaded = [...products.values()];
    await attachProductAssociations(
      request,
      dependencies,
      loaded.map((entry) => entry.row),
      loaded.map((entry) => entry.entity),
    );

    request.entities.forEach((entity, index) => {
      const row = request.rows[index];
      if (row === undefined) {
        return;
      }

      const productID = readForeignKey(row, COLUMN.skuProductID);
      const resolved = productID === undefined ? undefined : products.get(productID);
      if (resolved !== undefined) {
        (entity as Sku).product = resolved.entity;
      }
    });
  };

/** `SlatwallOption` — attaches each option's option group. Resolves data-02. */
const loadOptionAggregates: CatalogAggregateLoader = async (request) => {
  const optionGroups = await loadByIdentifiers(
    request,
    OPTION_GROUP_TABLE,
    OPTION_GROUP_PROJECTION,
    COLUMN.optionGroupID,
    collectIdentifiers(request.rows, COLUMN.optionOptionGroupID),
    mapOptionGroupRow,
  );

  request.entities.forEach((entity, index) => {
    const row = request.rows[index];
    if (row === undefined) {
      return;
    }

    const optionGroupID = readForeignKey(row, COLUMN.optionOptionGroupID);
    const resolved = optionGroupID === undefined ? undefined : optionGroups.get(optionGroupID);
    if (resolved !== undefined) {
      (entity as Option).optionGroup = resolved.entity;
    }
  });
};

/** `SlatwallProduct` — attaches `productType`, `brand`, `defaultSku` and `skus`. */
const createProductAggregateLoader =
  (dependencies: CatalogAggregateDependencies): CatalogAggregateLoader =>
  async (request) => {
    const products = request.entities as readonly Product[];

    await attachProductAssociations(request, dependencies, request.rows, products);

    const productIdentifiers = collectIdentifiers(request.rows, COLUMN.productID);
    if (productIdentifiers.length === 0) {
      return;
    }

    const placeholders = productIdentifiers.map(() => '?').join(', ');
    const skuRows = await request.executor.execute(
      `SELECT ${SKU_PROJECTION} FROM ${SKU_TABLE} WHERE ${COLUMN.skuProductID} IN (${placeholders})`,
      [...productIdentifiers],
    );

    /*
     * The rows are bucketed, and each product entity then maps its own SKU instances from them.
     */
    const skuRowsByProduct = new Map<string, MySqlRow[]>();
    for (const skuRow of skuRows) {
      const owningProductID = readForeignKey(skuRow, COLUMN.skuProductID);
      if (owningProductID === undefined) {
        continue;
      }

      let bucket = skuRowsByProduct.get(owningProductID);
      if (bucket === undefined) {
        bucket = [];
        skuRowsByProduct.set(owningProductID, bucket);
      }
      bucket.push(skuRow);
    }

    const hydratedSkus: Sku[] = [];
    products.forEach((product, index) => {
      const row = request.rows[index];
      if (row === undefined) {
        return;
      }

      const productID = readForeignKey(row, COLUMN.productID);
      const bucket = productID === undefined ? undefined : skuRowsByProduct.get(productID);
      if (bucket === undefined) {
        return;
      }

      for (const skuRow of bucket) {
        const sku = mapSkuRow(skuRow);
        sku.product = product;
        product.skus.push(sku);
        hydratedSkus.push(sku);
      }
    });

    /*
     * Every SKU materialised as part of a product aggregate needs the option collection that the
     * product mutation paths consume. Keeping this second pass beside the canonical aggregate loader
     * prevents the QueryRunner and SmartList import paths from diverging again.
     */
    if (hydratedSkus.length > 0) {
      await attachSkuOptions(request.executor, hydratedSkus);
    }
  };

/** Builds every root's loader, or `undefined` where the root has nothing to resolve. */
export function createCatalogAggregateLoaders(
  dependencies: CatalogAggregateDependencies,
): Readonly<Record<SmartListEntityName, CatalogAggregateLoader | undefined>> {
  return Object.freeze({
    SlatwallSku: createSkuAggregateLoader(dependencies),
    SlatwallOption: loadOptionAggregates,
    SlatwallProduct: createProductAggregateLoader(dependencies),
    /*
     * `getBaseProductType` walks `productTypeIDPath` through an injected resolver and the tree query has
     * its own projection, so `parentProductType` is not read as an association by anything in the slice.
     */
    SlatwallProductType: undefined,
    /* Declares no many-to-one at all [model/entity/Brand.cfc]. */
    SlatwallBrand: undefined,
    /* Declares no many-to-one at all; its `options` collection is the inverse side. */
    SlatwallOptionGroup: undefined,
    /* No domain module and no association the slice reads. */
    SlatwallAlternateSkuCode: undefined,
  });
}

/* The SKU option collection — requested explicitly, not by root. */

/**
 * Attaches each SKU's `options` collection, with its option groups resolved.
 *
 * @param executor - the caller's executor, so the read shares its transaction (M6).
 * @param skus - the SKUs whose options are wanted; mutated in place.
 */
export async function attachSkuOptions(executor: SqlExecutor, skus: readonly Sku[]): Promise<void> {
  const skuIdentifiers = distinctSkuIdentifiers(skus);

  if (skuIdentifiers.length === 0) {
    return;
  }

  const placeholders = skuIdentifiers.map(() => '?').join(', ');
  /*
   * The only join in this module, and therefore the only statement where an unqualified projection
   * is fatal. Both tables declare `optionID` — the link table because that is the association, the
   * option table because that is its primary key — so a bare `optionID` in the field list is ambiguous
   * and MySQL refuses the statement outright with `ER_NON_UNIQ_ERROR (1052)` rather than guessing. That
   * is what happened while {@link projectionFor} emitted bare names: this statement could not run at
   * all, so `SkuRepository.findByProduct` with `fetchOptions` raised — the port of
   * `model/dao/SkuDAO.cfc:L157`'s `inner join fetch sku.options` — failed on every invocation.
   */
  const rows = await executor.execute(
    `SELECT link.${COLUMN.skuOptionSkuID}, ${OPTION_PROJECTION} ` +
      `FROM ${SKU_OPTION_TABLE} link ` +
      `INNER JOIN ${OPTION_TABLE} ON ${OPTION_TABLE}.${COLUMN.optionID} = ` +
      `link.${COLUMN.skuOptionOptionID} ` +
      `WHERE link.${COLUMN.skuOptionSkuID} IN (${placeholders})`,
    [...skuIdentifiers],
  );

  const optionGroups = await loadByIdentifiers(
    { executor, rows, entities: [] },
    OPTION_GROUP_TABLE,
    OPTION_GROUP_PROJECTION,
    COLUMN.optionGroupID,
    collectIdentifiers(rows, COLUMN.optionOptionGroupID),
    mapOptionGroupRow,
  );

  const optionsByID = new Map<string, Option>();
  const optionsBySku = new Map<string, Option[]>();
  for (const row of rows) {
    const owningSkuID = readForeignKey(row, COLUMN.skuOptionSkuID);
    if (owningSkuID === undefined) {
      continue;
    }

    const mappedOption = mapOptionRowWithGroup(row, optionGroups);
    let option = optionsByID.get(mappedOption.optionID);
    if (option === undefined) {
      option = mappedOption;
      optionsByID.set(option.optionID, option);
    }

    let bucket = optionsBySku.get(owningSkuID);
    if (bucket === undefined) {
      bucket = [];
      optionsBySku.set(owningSkuID, bucket);
    }
    bucket.push(option);
  }

  for (const sku of distinctSkuInstances(skus)) {
    /*
     * Rule 3c — the read is authoritative for every saved SKU in the batch, including one with no
     * link rows. Recording that empty result is what makes a later clear distinguishable from a
     * collection that was never loaded.
     */
    markSkuOwnedLinkLoaded(sku, 'options');

    const bucket = optionsBySku.get(sku.skuID);
    if (bucket === undefined) {
      continue;
    }

    /*
     * Pushed onto the live array (rule 4), and not through `Sku.addOption`: hydration replays the
     * persisted link rows in their returned order, while the per-call option identity map above makes
     * one `SwOption` row one object even when several SKUs share it.
     */
    for (const option of bucket) {
      sku.options.push(option);
    }
  }
}

/**
 * Maps one joined option row and resolves its group from the pre-loaded index.
 *
 * @param row - a row carrying the option's own columns plus the link table's SKU identifier.
 * @param optionGroups - the groups already loaded for this batch.
 * @returns the mapped option, with its group attached when the group was found.
 */
function mapOptionRowWithGroup(
  row: MySqlRow,
  optionGroups: ReadonlyMap<string, { readonly entity: OptionGroup }>,
): Option {
  const option = mapOptionRow(row);

  const optionGroupID = readForeignKey(row, COLUMN.optionOptionGroupID);
  const resolved = optionGroupID === undefined ? undefined : optionGroups.get(optionGroupID);
  if (resolved !== undefined) {
    option.optionGroup = resolved.entity;
  }

  return option;
}

/* The three `inner join fetch` branches of `getProductSkus` */

/**
 * Groups one link table's far identifiers by the SKU that owns them.
 *
 * @param executor - the caller's executor, so the read shares its transaction (M6).
 * @param table - the whitelisted link table.
 * @param skuColumn - its owning SKU column.
 * @param farColumn - its far identifier column.
 * @param skuIdentifiers - the SKUs wanted.
 * @returns far identifiers keyed by SKU identifier, in row order.
 */
async function groupLinkIdentifiers(
  executor: SqlExecutor,
  table: PhysicalTableName,
  skuColumn: string,
  farColumn: string,
  skuIdentifiers: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const grouped = new Map<string, string[]>();

  if (skuIdentifiers.length === 0) {
    return grouped;
  }

  const placeholders = skuIdentifiers.map(() => '?').join(', ');
  const rows = await executor.execute(
    `SELECT ${skuColumn}, ${farColumn} FROM ${table} WHERE ${skuColumn} IN (${placeholders})`,
    [...skuIdentifiers],
  );

  for (const row of rows) {
    const owningSkuID = readForeignKey(row, skuColumn);
    const farIdentifier = readForeignKey(row, farColumn);
    if (owningSkuID === undefined || farIdentifier === undefined) {
      continue;
    }

    let bucket = grouped.get(owningSkuID);
    if (bucket === undefined) {
      bucket = [];
      grouped.set(owningSkuID, bucket);
    }
    bucket.push(farIdentifier);
  }

  return grouped;
}

/** The distinct, saved identifiers of a SKU batch, in first-seen order. */
function distinctSkuIdentifiers(skus: readonly Sku[]): readonly string[] {
  return [...new Set(skus.map((sku) => sku.skuID).filter((skuID) => skuID !== ''))];
}

/** The distinct SKU object instances in a batch, preserving first-seen order. */
function distinctSkuInstances(skus: readonly Sku[]): readonly Sku[] {
  return [...new Set(skus)];
}

/**
 * Performs the eager fetch `getProductSkus` requests, for whichever collection its base product type
 * selects.
 *
 * @param executor - the caller's executor, so the fetch shares its transaction (M6).
 * @param skus - the SKUs just hydrated; mutated in place.
 * @param baseProductType - the product's resolved base product type, or `undefined` when unresolved.
 */
export async function attachFetchedSkuAssociations(
  executor: SqlExecutor,
  skus: readonly Sku[],
  baseProductType: string | undefined,
): Promise<void> {
  if (skus.length === 0 || baseProductType === undefined) {
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode) {
    /* `model/dao/SkuDAO.cfc:L157` — `inner join fetch sku.options`. */
    await attachSkuOptions(executor, skus);
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode) {
    /* `model/dao/SkuDAO.cfc:L155` — `inner join fetch sku.accessContents`. */
    const grouped = await groupLinkIdentifiers(
      executor,
      SKU_ACCESS_CONTENT_TABLE,
      COLUMN.accessContentSkuID,
      COLUMN.accessContentContentID,
      distinctSkuIdentifiers(skus),
    );

    for (const sku of distinctSkuInstances(skus)) {
      markSkuOwnedLinkLoaded(sku, 'accessContents');

      for (const contentID of grouped.get(sku.skuID) ?? []) {
        sku.accessContents.push({ contentID });
      }
    }
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode) {
    /*
     * `model/dao/SkuDAO.cfc:L160` — `inner join fetch sku.subscriptionBenefits`. The term join at
     * `:L159` is a plain `INNER JOIN` with no `FETCH`, so `subscriptionTerm` is deliberately left
     * unresolved here; reproducing the restriction without the fetch is exactly what the legacy does.
     */
    const grouped = await groupLinkIdentifiers(
      executor,
      SKU_SUBSCRIPTION_BENEFIT_TABLE,
      COLUMN.subscriptionBenefitSkuID,
      COLUMN.subscriptionBenefitID,
      distinctSkuIdentifiers(skus),
    );

    for (const sku of distinctSkuInstances(skus)) {
      markSkuOwnedLinkLoaded(sku, 'subscriptionBenefits');

      for (const subscriptionBenefitID of grouped.get(sku.skuID) ?? []) {
        sku.subscriptionBenefits.push({ subscriptionBenefitID });
      }
    }
  }
}
