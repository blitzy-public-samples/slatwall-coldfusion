// slatwall-ts - the Google product-feed repository.
//
// It owns exactly three things: the statement text, the bound parameters, and the hydration of
// driver rows into the projection.
//
// [integrationServices/google/controllers/feed.cfc:L58-L73] is the LIVE path and the authority for
// the filter and join set.

import { chunkTupleRows, sqlPlaceholderList } from '../../repositories/mysql/connection.js';
import type { PreparedStatementExecutor, SqlRow } from '../../repositories/mysql/connection.js';
import { Money } from '../../domain/valueObjects/money.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type {
  PromotionRepository,
  SalePricePromotionRewardRow,
} from '../../domain/ports/promotionRepository.js';
import type { RoundingRuleService } from '../../services/roundingRuleService.js';

// `decimal.js` is never imported: `src/domain/valueObjects/money.ts` is the one arithmetic surface
// and the only module besides `src/lib/cfml/precision.ts` that may name the substrate.

/**
 * The legacy setting values this feed needs, ALREADY RESOLVED, handed in once.
 *
 * JUDGMENT CALL: three values that the legacy read through `setting()` and `getBaseImageURL()`
 * arrive as plain resolved strings on this interface rather than being read here.
 *
 * JUDGMENT CALL: this interface cannot widen the four-filter invariant, and that is why it is
 * admissible at all.
 */
export interface ResolvedFeedSettingValues {
  /**
   * The resolved value of `setting('globalURLKeyProduct')`, the first segment of a product's path.
   *
   * CFML parity [model/entity/Product.cfc:L207-L209]: `getProductURL()` returns
   * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"`, and that exact shape leading slash,
   * both segments, trailing slash - is what {@link GoogleProductFeedRow.productUrlPath} carries.
   */
  readonly globalURLKeyProduct: string;

  /**
   * The resolved value of `getHibachiScope().getBaseImageURL()`.
   *
   * CFML parity [model/transient/HibachiScope.cfc:L186-L188]: the legacy value is
   * `getURLFromPath(setting('globalAssetsImageFolderPath'))` - a host-relative URL prefix, not a
   * hostname.
   */
  readonly baseImageURL: string;

  /**
   * The EFFECTIVE missing-image path, already chosen from the legacy's three candidates.
   *
   * CFML parity [model/service/ImageService.cfc:L82-L89]: when the stored image cannot be found
   * the legacy substitutes, in this order, the caller-supplied `missingImagePath` - which for a
   * SKU is `setting('imageMissingImagePath')` [model/entity/Sku.cfc:L198-L200] and for a product
   * image is the same setting [model/entity/Image.cfc:L126-L128] - then
   * `setting('globalMissingImagePath')` [model/service/ImageService.cfc:L85-L86].
   */
  readonly missingImagePath: string;
}

/**
 * The identifiers one selected SKU contributes to a per-SKU setting lookup.
 *
 * CFML parity [model/service/SettingService.cfc:L102-L106, L516-L604]: `setting()` on a persistent
 * object first looks for a value bound to the object itself
 * [model/service/SettingService.cfc:L517-L519] and then walks the lookup order declared for its
 * class.
 */
export interface SkuFeedSettingSubject {
  /**
   * `SwSku.skuID` - the object-level lookup [model/service/SettingService.cfc:L519].
   */
  readonly skuID: string;

  /**
   * `SwSku.productID` - the first lookup step [model/service/SettingService.cfc:L104].
   */
  readonly productID: string;

  /**
   * `SwProduct.productTypeID`, the leaf of the product-type path used by the second and third
   * lookup steps. Absent when the product has no product type.
   */
  readonly productTypeID: string | undefined;

  /**
   * `SwProduct.brandID`, the `&brand.brandID` conjunct of the second lookup step. Absent when the
   * product has no brand.
   */
  readonly brandID: string | undefined;
}

/**
 * The two shipping-weight setting values, resolved for one SKU.
 *
 * Both are STRINGS, deliberately - not numbers and not `Money`.
 */
export interface ResolvedSkuShippingWeightSetting {
  /**
   * The resolved value of `sku.setting('skuShippingWeight')`.
   */
  readonly skuShippingWeight: string;

  /**
   * The resolved value of `sku.setting('skuShippingWeightUnitCode')`.
   */
  readonly skuShippingWeightUnitCode: string;
}

/**
 * Resolves the shipping-weight settings of every selected SKU, per SKU.
 *
 * Why this exists as a collaborator rather than as two more resolved values.
 *
 * One call for the whole selection, and the shape says so: it takes every subject at once and
 * answers a map.
 */
export interface SkuFeedSettingResolver {
  /**
   * @param subjects one entry per selected SKU, in selection order, distinct by `skuID`.
   * @returns a resolved pair for EVERY subject, keyed by `skuID`.
   */
  resolveSkuShippingWeightSettings(
    subjects: readonly SkuFeedSettingSubject[],
  ): Promise<ReadonlyMap<string, ResolvedSkuShippingWeightSetting>>;
}

/**
 * The winning sale-price rewards, narrowed to the one capability this feed consumes.
 *
 * `Pick` rather than a hand-written one-method interface, so the signature is the port's own and a
 * change to it is a compile error here rather than a silent divergence.
 */
export type GoogleFeedSalePriceSource = Pick<
  PromotionRepository,
  'getSalePricePromotionRewardsQuery'
>;

/**
 * The rounding-rule application, narrowed to the one capability this feed consumes.
 *
 * CFML parity [model/service/PromotionService.cfc:L1024-L1028]: rounding is applied by the SERVICE
 * tier, after the query, and only to rows whose `roundingRuleID` is non-empty.
 */
export type GoogleFeedValueRounder = Pick<RoundingRuleService, 'roundValueByRoundingRuleID'>;

/**
 * One SKU's resolved sale-price pair, ready for the projection.
 *
 * Both members come from the same reward row, which is what keeps the pair coherent - the view
 * emits `g:sale_price` and `g:sale_price_effective_date` inside one conditional
 * [integrationServices/google/views/feed/product.cfm:L28-L31].
 */
interface ResolvedSalePriceDetail {
  /**
   * The winning sale price, rounded when the winning reward names a rounding rule.
   */
  readonly salePrice: Money;

  /**
   * The winning reward's expiration, `undefined` when the row carries none.
   */
  readonly salePriceExpirationDateTime: Date | undefined;
}

/**
 * One qualifying SKU, flattened into exactly the values the product feed emits.
 *
 * JUDGMENT CALL: this is a ROW PROJECTION, not an entity, and it is named so it cannot be mistaken
 * for one. Two reasons, both structural: * The feed needs a FLAT ROW, not an object graph.
 *
 * Three prices are carried separately and must not be collapsed.
 */
export interface GoogleProductFeedRow {
  /**
   * The SKU's primary key.
   */
  readonly skuID: string;

  /**
   * The owning product's primary key, from `SwProduct` rather than from the SKU's foreign key
   * column.
   */
  readonly productID: string;

  /**
   * `SwSku.skuCode` is unique and 50 characters [model/entity/Sku.cfc:L54] but declares no
   * `notNull`, so SQL `NULL` is a legitimate hydration and absence is modelled rather than papered
   * over.
   */
  readonly skuCode: string | undefined;

  /**
   * `SwProduct.calculatedTitle` [model/entity/Product.cfc:L65] is a persisted calculated column,
   * written by [org/Hibachi/HibachiEntity.cfc:L31-L48] from `getTitle()`.
   */
  readonly calculatedTitle: string | undefined;

  /**
   * The primary `description` candidate [integrationServices/google/views/feed/product.cfm:L19].
   */
  readonly productDescription: string | undefined;

  /**
   * The fallback `description` candidate [integrationServices/google/views/feed/product.cfm:L19].
   */
  readonly productTypeDescription: string | undefined;

  /**
   * CFML parity [model/entity/ProductType.cfc:L273-L278]: `ProductType` OVERRIDES
   * `getSimpleRepresentation()` with an unbounded upward recursion -
   * `getParentProductType().getSimpleRepresentation() & " &raquo; " & getProductTypeName()` - so
   * the value is a ROOT-FIRST breadcrumb of every ancestor's name joined by that exact separator.
   */
  readonly productTypeSimpleRepresentation: string | undefined;

  /**
   * The path segment of `link` [integrationServices/google/views/feed/product.cfm:L22].
   *
   * Derived, not a column.
   * CFML parity [model/entity/Product.cfc:L207-L209]:
   * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"`.
   *
   * Absent when `SwProduct.urlTitle` is SQL `NULL`, which the schema permits
   * [model/entity/Product.cfc:L54]: a path assembled around an absent title addresses nothing.
   */
  readonly productUrlPath: string | undefined;

  /**
   * The path segment of `g:image_link` [integrationServices/google/views/feed/product.cfm:L23].
   *
   * DERIVED, not a column, and host-relative for the same reason as {@link productUrlPath}.
   *
   * Always PRESENT, because the legacy always had a path to emit.
   */
  readonly imageLinkPath: string;

  /**
   * The 0..n path segments of `g:additional_image_link`
   * [integrationServices/google/views/feed/product.cfm:L24].
   *
   * DERIVED.
   * CFML parity [model/entity/Image.cfc:L79-L81]: each entry is
   * `"#baseImageURL#/#getDirectory()#/#getImageFile()#"` for one row of the product's
   * `productImages` association [model/entity/Product.cfc:L74], a one-to-many on
   * `SwImage.productID`.
   */
  readonly additionalImageLinkPaths: readonly string[];

  /**
   * `g:price` [integrationServices/google/views/feed/product.cfm:L27] - the PRODUCT's price, which
   * is not the SKU's.
   *
   * It is `undefined` when the product has no default SKU, or when that SKU's price column is
   * `NULL`.
   */
  readonly productPrice: Money | undefined;

  /**
   * The SKU's own price, the left operand of the sale gate at
   * [integrationServices/google/views/feed/product.cfm:L28].
   */
  readonly skuPrice: Money | undefined;

  /**
   * The SKU's sale price - the right operand of the sale gate at
   * [integrationServices/google/views/feed/product.cfm:L28] and the body of `g:sale_price` at
   * [integrationServices/google/views/feed/product.cfm:L29].
   *
   * ABSENT MEANS no SALE, and absent is the common case: the reward query returns a row only for a
   * SKU a sale-price reward actually wins [model/dao/PromotionDAO.cfc:L298-L591].
   *
   * The pairing survives that, which is why the fallback is safe.
   */
  readonly skuSalePrice: Money | undefined;

  /**
   * The end of the `g:sale_price_effective_date` range
   * [integrationServices/google/views/feed/product.cfm:L30].
   *
   * RESOLVED ALONGSIDE {@link skuSalePrice}, from the same reward row, for the reason given there
   * in full.
   */
  readonly salePriceExpirationDateTime: Date | undefined;

  /**
   * Whether the product has a brand at all - the gate for `g:brand`
   * [integrationServices/google/views/feed/product.cfm:L32].
   *
   * `SwBrand.brandID` as the left join resolved it - not `SwProduct.brandID`, the foreign-key
   * column of the `brand` many-to-one [model/entity/Product.cfc:L68].
   */
  readonly brandID: string | undefined;

  /**
   * The body of `g:brand` [integrationServices/google/views/feed/product.cfm:L32].
   *
   * Optional by construction, matching the left join at
   * [integrationServices/google/controllers/feed.cfc:L66]: a product with no brand still appears
   * in the feed.
   */
  readonly brandName: string | undefined;
  readonly productCode: string | undefined;

  /**
   * The numeric half of `g:shipping_weight`
   * [integrationServices/google/views/feed/product.cfm:L58], carried as a STRING.
   */
  readonly skuShippingWeight: string;

  /**
   * The unit half of `g:shipping_weight`, emitted after a single space
   * [integrationServices/google/views/feed/product.cfm:L58], resolved for this SKU.
   */
  readonly skuShippingWeightUnitCode: string;

  /**
   * The SKU's active flag - filter 1 [integrationServices/google/controllers/feed.cfc:L68].
   */
  readonly skuActiveFlag: boolean;

  /**
   * The product's active flag - filter 2 [integrationServices/google/controllers/feed.cfc:L69].
   *
   * `SwProduct.activeFlag` declares no ORM default [model/entity/Product.cfc:L53], unlike its SKU
   * counterpart's `default="1"` [model/entity/Sku.cfc:L53].
   */
  readonly productActiveFlag: boolean;

  /**
   * The product's published flag - filter 3 [integrationServices/google/controllers/feed.cfc:L70].
   *
   * `SwProduct.publishedFlag` declares `default="false"` - the string literal form
   * [model/entity/Product.cfc:L58] - where `Sku.activeFlag` declares `"1"`.
   */
  readonly productPublishedFlag: boolean;

  /**
   * The product's quantity available to sell - filter 4
   * [integrationServices/google/controllers/feed.cfc:L72].
   */
  readonly productCalculatedQATS: number;
}

// All three statements are module-level `const` strings, carry no state, and are executed as
// server-side prepared statements through the injected executor.

/**
 * The feed selection: one row per qualifying SKU, with everything the projection needs from `SwSku`,
 * `SwProduct`, the product's default SKU, its brand and its product type.
 *
 * JUDGMENT CALL: the quantity bound is `>= 1`, taken from the live path at
 * [integrationServices/google/controllers/feed.cfc:L72] in preference to the dead DAO's
 * `calculatedQATS > 0` at [integrationServices/google/model/dao/FeedDAO.cfc:L71].
 *
 * JUDGMENT CALL: `SwProduct` is joined inner while the other three are left, and there is no
 * `ORDER BY` - the legacy chain calls `addOrder` nowhere
 * [integrationServices/google/controllers/feed.cfc:L58-L73], so item order was whatever the ORM
 * returned. The fetch shape is stated per statement because the ORM's laziness has no equivalent
 * here, and the dead DAO carries no `JOIN FETCH` to port.
 */
const FEED_SELECTION_SQL = `
  SELECT
    SwSku.skuID                          AS skuID,
    SwSku.skuCode                        AS skuCode,
    SwSku.activeFlag                     AS skuActiveFlag,
    SwSku.price                          AS skuPrice,
    SwSku.imageFile                      AS skuImageFile,
    SwProduct.productID                  AS productID,
    SwProduct.productCode                AS productCode,
    SwProduct.calculatedTitle            AS calculatedTitle,
    SwProduct.productDescription         AS productDescription,
    SwProduct.urlTitle                   AS productUrlTitle,
    SwProduct.activeFlag                 AS productActiveFlag,
    SwProduct.publishedFlag              AS productPublishedFlag,
    SwProduct.calculatedQATS             AS productCalculatedQATS,
    SwProduct.productTypeID              AS productTypeID,
    SwProduct.brandID                    AS brandID,
    defaultSku.price                     AS productPrice,
    SwBrand.brandID                      AS joinedBrandID,
    SwBrand.brandName                    AS brandName
  FROM SwSku
  INNER JOIN SwProduct
    ON SwProduct.productID = SwSku.productID
  LEFT JOIN SwSku AS defaultSku
    ON defaultSku.skuID = SwProduct.defaultSkuID
  LEFT JOIN SwBrand
    ON SwBrand.brandID = SwProduct.brandID
  WHERE SwSku.activeFlag = 1
    AND SwProduct.activeFlag = 1
    AND SwProduct.publishedFlag = 1
    AND SwProduct.calculatedQATS >= 1
`;

/**
 * The deepest product-type chain the walk will follow, derived from the legacy schema.
 *
 * `productTypeID` is `length="32"` [model/entity/ProductType.cfc:L52] and the materialized
 * `productTypeIDPath` is `length="4000"` [model/entity/ProductType.cfc:L53].
 */
const MAX_PRODUCT_TYPE_ANCESTRY_DEPTH = 121;

/**
 * The greatest `ancestorDistance` the recursive member may PRODUCE.
 */
const MAX_PRODUCT_TYPE_ANCESTRY_DISTANCE = MAX_PRODUCT_TYPE_ANCESTRY_DEPTH - 1;

/**
 * The head of the product-type ancestry statement, up to and including its `IN` keyword. {@link
 * PRODUCT_TYPE_ANCESTRY_SQL_TAIL} completes it.
 *
 * JUDGMENT CALL: a recursive common table expression rather than the `productTypeIDPath` column or
 * a fixed chain of self-joins, and split around the placeholder list rather than built by a
 * function, so both halves stay readable as SQL and only the number of `?` marks varies.
 */
const PRODUCT_TYPE_ANCESTRY_SQL_HEAD = `
  WITH RECURSIVE productTypeAncestry AS (
    SELECT
      leaf.productTypeID          AS leafProductTypeID,
      leaf.parentProductTypeID    AS parentProductTypeID,
      leaf.productTypeName        AS productTypeName,
      leaf.productTypeDescription AS productTypeDescription,
      leaf.productTypeID          AS ancestorProductTypeID,
      0                           AS ancestorDistance
    FROM SwProductType AS leaf
    WHERE leaf.productTypeID IN`;

/**
 * The tail of the product-type ancestry statement: the recursive step that walks one link up the
 * parent chain, and the projection the adapter reads.
 *
 * The recursive member selects its name and its next parent from `SwProductType` while carrying
 * the originating leaf's identifier and the originating leaf's description through unchanged.
 */
const PRODUCT_TYPE_ANCESTRY_SQL_TAIL = `
    UNION ALL
    SELECT
      descendant.leafProductTypeID,
      ancestor.parentProductTypeID,
      ancestor.productTypeName,
      descendant.productTypeDescription,
      ancestor.productTypeID,
      descendant.ancestorDistance + 1
    FROM productTypeAncestry AS descendant
    INNER JOIN SwProductType AS ancestor
      ON ancestor.productTypeID = descendant.parentProductTypeID
    WHERE descendant.ancestorDistance < ${String(MAX_PRODUCT_TYPE_ANCESTRY_DISTANCE)}
  )
  SELECT
    leafProductTypeID,
    productTypeName,
    productTypeDescription,
    ancestorProductTypeID,
    ancestorDistance
  FROM productTypeAncestry
`;

/**
 * The head of the additional-images statement, up to and including its `IN` keyword. The
 * placeholder list and the closing parenthesis complete it.
 *
 * JUDGMENT CALL: the product's images are fetched by a SECOND statement keyed on product
 * identifier, rather than by joining `SwImage` into the selection above.
 */
const PRODUCT_IMAGES_SQL_HEAD = `
  SELECT
    SwImage.productID AS productID,
    SwImage.directory AS imageDirectory,
    SwImage.imageFile AS imageFile
  FROM SwImage
  WHERE SwImage.productID IN`;

/**
 * The literal segment the legacy SKU image path carries between the base image URL and the file
 * name.
 *
 * CFML parity [model/entity/Sku.cfc:L145-L147]: `getImagePath()` interpolates `/product/default/`
 * verbatim. It is a constant of the legacy source, not a configured value, which is why it is a
 * literal here and the base URL is not.
 */
const SKU_IMAGE_PATH_SEGMENT = 'product/default';

/**
 * The breadcrumb separator, carried verbatim from [model/entity/ProductType.cfc:L275] including
 * its HTML entity and both spaces.
 *
 * CFML parity: the view then passes the assembled breadcrumb through `htmlEditFormat`
 * [integrationServices/google/views/feed/product.cfm:L21], which escapes the ampersand again.
 */
const PRODUCT_TYPE_BREADCRUMB_SEPARATOR = ' &raquo; ';

/**
 * Reused for a product with no additional images, so no array is allocated per row and nothing
 * downstream can mutate a shared empty.
 */
const NO_IMAGE_PATHS: readonly string[] = Object.freeze([]);

// Used only in failure messages, so that a hydration failure names which statement produced the
// offending row without echoing the statement text.

const FEED_SELECTION_LABEL = 'the product feed selection';
const PRODUCT_TYPE_ANCESTRY_LABEL = 'the product type ancestry lookup';
const PRODUCT_IMAGES_LABEL = 'the product image lookup';

// Two distinct faults, two distinct types, following the pattern
// `src/repositories/mysql/connection.ts` and `src/repositories/mysql/dialect.ts` already
// establish: each class is local and UNEXPORTED, it sets an explicit `name`.

/**
 * A statement returned a row that does not carry a column the reader needs.
 *
 * This is a defect in this module rather than a condition of the data.
 */
class GoogleFeedColumnMissingError extends Error {
  /**
   * The column the reader looked for. Part of the statement, never of the data.
   */
  readonly columnName: string;

  /**
   * Which statement produced the row. A label, never the statement text.
   */
  readonly statementLabel: string;

  constructor(columnName: string, statementLabel: string) {
    super(
      [
        `A row from ${statementLabel} carries no column named "${columnName}".`,
        'A column that is present but SQL NULL arrives as null and becomes undefined, so an absent',
        'KEY means the projection no longer selects it: the statement and the reader that consumes',
        'it have diverged.',
      ].join(' '),
    );
    this.name = 'GoogleFeedColumnMissingError';
    this.columnName = columnName;
    this.statementLabel = statementLabel;
  }
}

/**
 * A column is present but carries a driver representation this reader will not accept.
 */
class GoogleFeedColumnTypeError extends Error {
  /**
   * The column that could not be read.
   */
  readonly columnName: string;

  /**
   * Which statement produced the row. A label, never the statement text.
   */
  readonly statementLabel: string;

  /**
   * The offending value's JavaScript type or constructor name. Never its value.
   */
  readonly receivedType: string;

  constructor(
    columnName: string,
    statementLabel: string,
    receivedType: string,
    expectation: string,
  ) {
    super(
      [
        `Column "${columnName}" from ${statementLabel} carries ${receivedType}, but ${expectation}.`,
        'No coercion is attempted: a representation this reader does not recognise means the schema',
        'or the pool configuration changed, and guessing at it is how a big_decimal column silently',
        'becomes a float.',
      ].join(' '),
    );
    this.name = 'GoogleFeedColumnTypeError';
    this.columnName = columnName;
    this.statementLabel = statementLabel;
    this.receivedType = receivedType;
  }
}

/**
 * Raised when {@link SkuFeedSettingResolver} answers for fewer SKUs than it was asked about.
 *
 * The message names the count and one example identifier, never the resolver's own output, so a
 * log line cannot leak configured values.
 */
class GoogleFeedSkuSettingMissingError extends Error {
  /**
   * How many requested SKUs the resolver did not answer for.
   */
  readonly missingCount: number;

  /**
   * The first unanswered SKU identifier, in selection order.
   */
  readonly firstMissingSkuID: string;

  constructor(missingCount: number, firstMissingSkuID: string) {
    super(
      [
        `The SKU setting resolver answered for ${missingCount} fewer SKU(s) than requested;`,
        `the first unanswered identifier is "${firstMissingSkuID}".`,
        'Every selected SKU must receive a shipping-weight pair, because the legacy setting',
        'lookup fell back to a declared default and so could not fail to answer',
        '[model/service/SettingService.cfc:L232-L233]. No value is substituted here.',
      ].join(' '),
    );
    this.name = 'GoogleFeedSkuSettingMissingError';
    this.missingCount = missingCount;
    this.firstMissingSkuID = firstMissingSkuID;
  }
}

/**
 * Names a value's TYPE for a failure message, never its contents.
 *
 * `null` is reported as `SQL NULL` because that is what it means coming back from the driver.
 */
function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'SQL NULL';
  }

  if (typeof value !== 'object') {
    return typeof value;
  }

  // `Object.create(null)` has no constructor, and a cross-realm value may have an unhelpful one;
  // both fall back to the bare structural name rather than throwing inside an error constructor.
  const constructorName: unknown = (value as { constructor?: { name?: unknown } }).constructor
    ?.name;

  return typeof constructorName === 'string' && constructorName.length > 0
    ? constructorName
    : 'object';
}

// One reader per column SHAPE, each narrowing `unknown` explicitly.
//
// `noUncheckedIndexedAccess` is honoured throughout: every indexed read is treated as possibly
// absent and narrowed, and there is no postfix `!` anywhere in this file.

/**
 * Fetches a column's raw value, proving the key exists first.
 *
 * The presence check is separate from the type checks deliberately: an ABSENT key and a `NULL`
 * value are different faults with different causes.
 *
 * `Object.hasOwn` rather than `in`, so that a column named after an `Object` prototype member
 * cannot be reported as present when the row does not carry it.
 */
function readColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  if (!Object.hasOwn(row, columnName)) {
    throw new GoogleFeedColumnMissingError(columnName, statementLabel);
  }

  return row[columnName];
}

/**
 * A nullable text column: `string` when present, `undefined` for SQL `NULL`.
 */
function readOptionalString(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const value = readColumn(row, columnName, statementLabel);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new GoogleFeedColumnTypeError(
    columnName,
    statementLabel,
    describeColumnType(value),
    'a varchar column must arrive as a string or as null',
  );
}

/**
 * A primary-key column, which must carry a value.
 *
 * Every in-scope entity declares `fieldtype="id" generator="uuid"`, so these are
 * application-generated `varchar` keys and a `NULL` one is impossible in a well-formed row.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = readOptionalString(row, columnName, statementLabel);

  if (value === undefined) {
    throw new GoogleFeedColumnTypeError(
      columnName,
      statementLabel,
      'SQL NULL',
      'an identifier column must carry a value',
    );
  }

  return value;
}

/**
 * A nullable `big_decimal` money column: `Money` when present, `undefined` for SQL `NULL`.
 *
 * SQL `NULL` becomes `undefined`, and `Money.zero` is never substituted.
 */
function readOptionalMoney(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): Money | undefined {
  const value = readColumn(row, columnName, statementLabel);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    // Malformed numerals are refused by the validating brander inside the factory, and that
    // refusal is allowed to propagate unwrapped - it already carries a stable name and describes
    // the fault precisely.
    return Money.fromDecimalString(value);
  }

  throw new GoogleFeedColumnTypeError(
    columnName,
    statementLabel,
    describeColumnType(value),
    'a big_decimal column must arrive as a decimal string, which leaving decimalNumbers unset guarantees',
  );
}

/**
 * A persisted boolean flag, resolved through the shared CFML decision table.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): boolean {
  const value = readColumn(row, columnName, statementLabel);

  return cfBoolean(narrowFlagValue(value, columnName, statementLabel));
}

/**
 * Reduces a driver flag representation to the shared decision table's input union.
 */
function narrowFlagValue(
  value: unknown,
  columnName: string,
  statementLabel: string,
): CfBooleanInput {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // `Buffer` extends `Uint8Array`, so testing the base covers both and keeps this branch
  // independent of the Node global.
  if (value instanceof Uint8Array) {
    const firstByte = value[0];

    return firstByte === undefined ? undefined : firstByte;
  }

  throw new GoogleFeedColumnTypeError(
    columnName,
    statementLabel,
    describeColumnType(value),
    'a boolean column must arrive as a bit buffer, a number, a string or null',
  );
}

/**
 * A non-nullable integer column, which stays a `number` and never becomes `Money`.
 *
 * `bigint` is admitted because the driver may widen an integral column to one and refusing a shape
 * the driver legitimately produces would be inventing a restriction.
 */
function readInteger(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readColumn(row, columnName, statementLabel);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint' && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
    if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
  }

  throw new GoogleFeedColumnTypeError(
    columnName,
    statementLabel,
    describeColumnType(value),
    'an integer column must arrive as a finite number, or as a bigint within safe-integer range',
  );
}

// Narrowed row shapes.
//
// Each of the three statements gets a NAMED INTERFACE for its narrowed row, and none of them is
// `Record<string, unknown>` and none carries an index signature.
//
// They are also where the boundary between "what the database said" and "what the feed emits"
// sits.

/**
 * One row of {@link FEED_SELECTION_SQL}, narrowed.
 *
 * Column-for-column with the statement's select list, in the same order, so the two can be read
 * side by side.
 */
interface FeedSelectionColumns {
  readonly skuID: string;
  readonly skuCode: string | undefined;
  readonly skuActiveFlag: boolean;
  readonly skuPrice: Money | undefined;
  readonly skuImageFile: string | undefined;
  readonly productID: string;
  readonly productCode: string | undefined;
  readonly calculatedTitle: string | undefined;
  readonly productDescription: string | undefined;
  readonly productUrlTitle: string | undefined;
  readonly productActiveFlag: boolean;
  readonly productPublishedFlag: boolean;
  readonly productCalculatedQATS: number;
  readonly productTypeID: string | undefined;
  readonly brandID: string | undefined;
  readonly productPrice: Money | undefined;

  /**
   * `SwBrand.brandID`, i.e. the brand key as the left join resolved it, which is a different fact
   * from the `brandID` above.
   *
   * `SwProduct.brandID`, the FOREIGN KEY, and it is what the setting-lookup path
   * `product.brand.brandID` [model/service/SettingService.cfc:L519] needs - the key as the product
   * records it.
   */
  readonly joinedBrandID: string | undefined;
  readonly brandName: string | undefined;
}

/**
 * One ancestry row: a single ancestor's name, tagged with the product type it was reached from and
 * how many parent links away it sits.
 *
 * `ancestorDistance` is zero for the type itself and grows by one per step upward.
 *
 * `productTypeDescription` belongs to the LEAF, not to the ancestor this row names: every row of
 * one leaf's group repeats the same value.
 */
interface ProductTypeAncestrySegment {
  readonly leafProductTypeID: string;

  /**
   * The identifier of the ancestor this row names - the requested type itself at distance zero,
   * and one link further up at each greater distance.
   */
  readonly ancestorProductTypeID: string;
  readonly productTypeName: string | undefined;
  readonly productTypeDescription: string | undefined;
  readonly ancestorDistance: number;
}

/**
 * Both product-type values one leaf product type contributes to a feed row.
 *
 * Returned as one record per product type so the ancestry statement is read once and the two
 * values cannot drift apart: they come from the same rows, resolved in the same pass.
 */
interface ResolvedProductTypeDetail {
  /**
   * The root-first breadcrumb, or `undefined` when the group yielded none.
   */
  readonly simpleRepresentation: string | undefined;

  /**
   * The leaf's own description column, `undefined` when it is SQL `NULL`.
   */
  readonly productTypeDescription: string | undefined;
}

/**
 * One `SwImage` row belonging to a product, narrowed.
 *
 * Both path components are nullable because both columns are, and [model/entity/Image.cfc:L79-L81]
 * interpolates them without checking.
 */
interface ProductImageColumns {
  readonly productID: string;
  readonly imageDirectory: string | undefined;
  readonly imageFile: string | undefined;
}

/**
 * Narrows one feed-selection row. Every column is read exactly once, here.
 */
function narrowFeedSelectionRow(row: SqlRow): FeedSelectionColumns {
  return {
    skuID: readIdentifier(row, 'skuID', FEED_SELECTION_LABEL),
    skuCode: readOptionalString(row, 'skuCode', FEED_SELECTION_LABEL),
    skuActiveFlag: readFlag(row, 'skuActiveFlag', FEED_SELECTION_LABEL),
    skuPrice: readOptionalMoney(row, 'skuPrice', FEED_SELECTION_LABEL),
    skuImageFile: readOptionalString(row, 'skuImageFile', FEED_SELECTION_LABEL),
    productID: readIdentifier(row, 'productID', FEED_SELECTION_LABEL),
    productCode: readOptionalString(row, 'productCode', FEED_SELECTION_LABEL),
    calculatedTitle: readOptionalString(row, 'calculatedTitle', FEED_SELECTION_LABEL),
    productDescription: readOptionalString(row, 'productDescription', FEED_SELECTION_LABEL),
    productUrlTitle: readOptionalString(row, 'productUrlTitle', FEED_SELECTION_LABEL),
    productActiveFlag: readFlag(row, 'productActiveFlag', FEED_SELECTION_LABEL),
    productPublishedFlag: readFlag(row, 'productPublishedFlag', FEED_SELECTION_LABEL),
    productCalculatedQATS: readInteger(row, 'productCalculatedQATS', FEED_SELECTION_LABEL),
    productTypeID: readOptionalString(row, 'productTypeID', FEED_SELECTION_LABEL),
    brandID: readOptionalString(row, 'brandID', FEED_SELECTION_LABEL),
    productPrice: readOptionalMoney(row, 'productPrice', FEED_SELECTION_LABEL),
    joinedBrandID: readOptionalString(row, 'joinedBrandID', FEED_SELECTION_LABEL),
    brandName: readOptionalString(row, 'brandName', FEED_SELECTION_LABEL),
  };
}

/**
 * Narrows one product-type ancestry row.
 */
function narrowAncestrySegment(row: SqlRow): ProductTypeAncestrySegment {
  return {
    leafProductTypeID: readIdentifier(row, 'leafProductTypeID', PRODUCT_TYPE_ANCESTRY_LABEL),
    ancestorProductTypeID: readIdentifier(
      row,
      'ancestorProductTypeID',
      PRODUCT_TYPE_ANCESTRY_LABEL,
    ),
    productTypeName: readOptionalString(row, 'productTypeName', PRODUCT_TYPE_ANCESTRY_LABEL),
    productTypeDescription: readOptionalString(
      row,
      'productTypeDescription',
      PRODUCT_TYPE_ANCESTRY_LABEL,
    ),
    ancestorDistance: readInteger(row, 'ancestorDistance', PRODUCT_TYPE_ANCESTRY_LABEL),
  };
}

/**
 * Narrows one product-image row.
 */
function narrowProductImageRow(row: SqlRow): ProductImageColumns {
  return {
    productID: readIdentifier(row, 'productID', PRODUCT_IMAGES_LABEL),
    imageDirectory: readOptionalString(row, 'imageDirectory', PRODUCT_IMAGES_LABEL),
    imageFile: readOptionalString(row, 'imageFile', PRODUCT_IMAGES_LABEL),
  };
}

// The four values the projection carries DERIVED rather than as columns are built here, once each,
// from the narrowed columns plus the resolved settings.
//
// One rule governs all of them, and it is deliberate: only SQL `NULL` - arriving as `undefined` -
// suppresses a value.

/**
 * The host-relative path segment of a product's `link`.
 *
 * CFML parity [model/entity/Product.cfc:L207-L209]:
 * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"` - leading slash, key, slash, title,
 * trailing slash.
 *
 * @returns the path, or `undefined` when `SwProduct.urlTitle` is SQL `NULL` - a path assembled
 * around an absent title addresses nothing.
 */
function buildProductUrlPath(
  productUrlTitle: string | undefined,
  globalURLKeyProduct: string,
): string | undefined {
  if (productUrlTitle === undefined) {
    return undefined;
  }

  return `/${globalURLKeyProduct}/${productUrlTitle}/`;
}

/**
 * Whether an interpolated path component can address a stored asset at all.
 *
 * So the trigger is now: a component is unusable when it is absent or when it holds nothing but
 * whitespace.
 *
 * @param component the raw column value the path would interpolate.
 * @returns `true` when the component cannot address a file.
 */
function isUnusablePathComponent(component: string | undefined): boolean {
  return component === undefined || component.trim().length === 0;
}

/**
 * The host-relative path segment of a SKU's `g:image_link`.
 *
 * CFML parity [model/entity/Sku.cfc:L145-L147]:
 * `"#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"`. The middle segment
 * is a literal of the legacy source, which is why it is {@link SKU_IMAGE_PATH_SEGMENT} here and
 * not configuration.
 *
 * @returns the stored path when `SwSku.imageFile` can address a file, and `missingImagePath` when
 * it cannot.
 */
function buildSkuImagePath(
  baseImageURL: string,
  skuImageFile: string | undefined,
  missingImagePath: string,
): string {
  if (isUnusablePathComponent(skuImageFile)) {
    return missingImagePath;
  }

  return `${baseImageURL}/${SKU_IMAGE_PATH_SEGMENT}/${skuImageFile}`;
}

/**
 * The host-relative path segment of one `g:additional_image_link`.
 *
 * CFML parity [model/entity/Image.cfc:L79-L81]:
 * `"#baseImageURL#/#getDirectory()#/#getImageFile()#"`. Unlike the SKU path, the middle segment is
 * the image row's own `directory` column.
 *
 * @returns the stored path when BOTH components can address a file, and `missingImagePath` when
 * either cannot - the same trigger the SKU path uses.
 */
function buildProductImagePath(
  baseImageURL: string,
  image: ProductImageColumns,
  missingImagePath: string,
): string {
  if (isUnusablePathComponent(image.imageDirectory) || isUnusablePathComponent(image.imageFile)) {
    return missingImagePath;
  }

  return `${baseImageURL}/${image.imageDirectory}/${image.imageFile}`;
}

/**
 * Assembles one product type's breadcrumb from its ancestry segments.
 *
 * CFML parity [model/entity/ProductType.cfc:L273-L278]: the override recurses to the parent FIRST
 * and appends its own name after the separator, so the result is root-first.
 *
 * @returns the breadcrumb, or `undefined` when the product type had no ancestry rows at all -
 * which is what a product with no product type looks like.
 */
function buildProductTypeBreadcrumb(
  segments: readonly ProductTypeAncestrySegment[],
): string | undefined {
  if (segments.length === 0) {
    return undefined;
  }

  // A copy, because the caller's array is shared between every SKU of the product and an in-place
  // sort would mutate what the other rows read.
  const leafFirst = [...segments].sort(
    (left, right) => left.ancestorDistance - right.ancestorDistance,
  );

  const visitedAncestorIDs = new Set<string>();
  const acyclicLeafFirst: ProductTypeAncestrySegment[] = [];

  for (const segment of leafFirst) {
    if (visitedAncestorIDs.has(segment.ancestorProductTypeID)) {
      break;
    }

    visitedAncestorIDs.add(segment.ancestorProductTypeID);
    acyclicLeafFirst.push(segment);
  }

  return acyclicLeafFirst
    .reverse()
    .map((segment) => segment.productTypeName ?? '')
    .join(PRODUCT_TYPE_BREADCRUMB_SEPARATOR);
}

/**
 * The distinct, present values of a nullable key column, in first-seen order.
 */
function distinctDefinedKeys(keys: readonly (string | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const key of keys) {
    if (key !== undefined && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }

  return ordered;
}

/**
 * @param columns the narrowed selection row.
 * @param settingValues the three resolved legacy setting values.
 * @param productTypeDetail both product-type values, or `undefined` when the product has no
 * product type or the type produced no ancestry rows.
 * @param additionalImageLinkPaths the product's additional image paths, shared between every SKU
 * of that product and never mutated.
 * @param shippingWeight this SKU's own resolved shipping-weight pair.
 * @param salePriceDetail this SKU's winning sale-price pair, or `undefined` when no sale-price
 * reward wins for it, which is the ordinary case.
 */
function hydrateFeedRow(
  columns: FeedSelectionColumns,
  settingValues: ResolvedFeedSettingValues,
  productTypeDetail: ResolvedProductTypeDetail | undefined,
  additionalImageLinkPaths: readonly string[],
  shippingWeight: ResolvedSkuShippingWeightSetting,
  salePriceDetail: ResolvedSalePriceDetail | undefined,
): GoogleProductFeedRow {
  return {
    skuID: columns.skuID,
    productID: columns.productID,
    skuCode: columns.skuCode,
    calculatedTitle: columns.calculatedTitle,
    productDescription: columns.productDescription,
    productTypeDescription: productTypeDetail?.productTypeDescription,
    productTypeSimpleRepresentation: productTypeDetail?.simpleRepresentation,
    productUrlPath: buildProductUrlPath(columns.productUrlTitle, settingValues.globalURLKeyProduct),
    imageLinkPath: buildSkuImagePath(
      settingValues.baseImageURL,
      columns.skuImageFile,
      settingValues.missingImagePath,
    ),
    additionalImageLinkPaths,
    productPrice: columns.productPrice,
    skuPrice: columns.skuPrice,

    // Both from one reward row, and their no-reward answers differ.
    //
    // That asymmetry is what keeps the sale block coherent rather than being a curiosity.
    skuSalePrice: salePriceDetail?.salePrice ?? columns.skuPrice,
    salePriceExpirationDateTime: salePriceDetail?.salePriceExpirationDateTime,
    brandID: columns.joinedBrandID,
    brandName: columns.brandName,
    productCode: columns.productCode,
    skuShippingWeight: shippingWeight.skuShippingWeight,
    skuShippingWeightUnitCode: shippingWeight.skuShippingWeightUnitCode,
    skuActiveFlag: columns.skuActiveFlag,
    productActiveFlag: columns.productActiveFlag,
    productPublishedFlag: columns.productPublishedFlag,
    productCalculatedQATS: columns.productCalculatedQATS,
  };
}

/**
 * Reads the qualifying product-feed rows out of the existing `Sw*` MySQL schema.
 *
 * The four-filter selection is reproduced exactly and is not tunable.
 *
 * JUDGMENT CALL: every collaborator is CONSTRUCTOR-INJECTED, which is what replaces DI/1's
 * convention scan of `property name="xService";` declarations with wiring the compiler checks.
 *
 * @example
 */
export class GoogleFeedRepository {
  /**
   * The only route to the database from this class.
   *
   * Typed to the narrow executor port rather than to a pool or a connection, so `query`,
   * `getConnection`, `end` and the transaction methods are all unreachable - the
   * prepared-statement guarantee is structural.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * The three legacy setting values, already resolved by the composition root.
   *
   * Not one of them reaches a `WHERE` clause, which is precisely why accepting them cannot widen
   * the four-filter invariant.
   */
  private readonly settingValues: ResolvedFeedSettingValues;

  /**
   * Answers the shipping-weight pair of every selected SKU, per SKU.
   *
   * Consulted once per feed, after the selection has named its SKUs.
   */
  private readonly skuSettingResolver: SkuFeedSettingResolver;

  /**
   * The winning sale-price rewards for the whole catalog.
   *
   * Typed to the single port method consumed, so no other promotion capability - qualification,
   * use limits, applied promotions - is reachable from here.
   */
  private readonly salePriceSource: GoogleFeedSalePriceSource;

  /**
   * Applies a winning reward's rounding rule to its sale price.
   */
  private readonly valueRounder: GoogleFeedValueRounder;

  constructor(
    executor: PreparedStatementExecutor,
    settingValues: ResolvedFeedSettingValues,
    skuSettingResolver: SkuFeedSettingResolver,
    salePriceSource: GoogleFeedSalePriceSource,
    valueRounder: GoogleFeedValueRounder,
  ) {
    this.executor = executor;
    this.settingValues = settingValues;
    this.skuSettingResolver = skuSettingResolver;
    this.salePriceSource = salePriceSource;
    this.valueRounder = valueRounder;
  }

  /**
   * Returns every SKU that qualifies for the product feed, flattened.
   *
   * Three STATEMENTS, and the shape of that is a fidelity decision rather than anything else.
   *
   * Two collaborator calls, also batched, and for the same reason.
   *
   * @returns one entry per qualifying SKU.
   * @throws `GoogleFeedColumnMissingError` or `GoogleFeedColumnTypeError` when a row cannot be
   * narrowed; the decimal-numeral error from `money.ts` when a money column is malformed.
   */
  async fetchProductFeedRows(): Promise<readonly GoogleProductFeedRow[]> {
    const selectedRows = await this.executor.execute(FEED_SELECTION_SQL);
    const selections = selectedRows.map((row) => narrowFeedSelectionRow(row));
    const productTypeDetails = await this.fetchProductTypeDetails(
      distinctDefinedKeys(selections.map((selection) => selection.productTypeID)),
    );
    const imagePathsByProductID = await this.fetchAdditionalImagePaths(
      distinctDefinedKeys(selections.map((selection) => selection.productID)),
    );

    // Both per-SKU resolutions are batched for the whole selection, for the same reason the two
    // statements above are: a statement count that grows in bounded steps with the catalog rather
    // than one statement per row. An identifier-keyed follow-up chunks its key set, so a batch is
    // bounded by `SQL_TUPLE_ROW_LIMIT` rather than by how large a selection happens to be.
    const shippingWeightsBySkuID = await this.resolveShippingWeights(selections);
    const salePriceDetailsBySkuID = await this.resolveSalePriceDetails(selections);

    return selections.map((selection) =>
      hydrateFeedRow(
        selection,
        this.settingValues,
        // A product with no product type has no entry, and `undefined` is exactly what the
        // projection carries for both product-type values.
        selection.productTypeID === undefined
          ? undefined
          : productTypeDetails.get(selection.productTypeID),
        imagePathsByProductID.get(selection.productID) ?? NO_IMAGE_PATHS,
        // Present for every selection, enforced in `resolveShippingWeights` rather than defaulted
        // here.
        this.requireShippingWeight(shippingWeightsBySkuID, selection.skuID),
        salePriceDetailsBySkuID.get(selection.skuID),
      ),
    );
  }

  /**
   * Asks the resolver for every selected SKU's shipping-weight pair, once.
   *
   * The subject list is built from the selection in selection order and is distinct by `skuID` -
   * the selection returns one row per SKU, so it is already distinct.
   *
   * @param selections the narrowed selection rows.
   * @returns the resolver's map, unmodified.
   */
  private async resolveShippingWeights(
    selections: readonly FeedSelectionColumns[],
  ): Promise<ReadonlyMap<string, ResolvedSkuShippingWeightSetting>> {
    if (selections.length === 0) {
      return new Map<string, ResolvedSkuShippingWeightSetting>();
    }

    const subjects: SkuFeedSettingSubject[] = selections.map((selection) => ({
      skuID: selection.skuID,
      productID: selection.productID,
      productTypeID: selection.productTypeID,
      brandID: selection.brandID,
    }));

    return await this.skuSettingResolver.resolveSkuShippingWeightSettings(subjects);
  }

  /**
   * Reads one SKU's resolved shipping-weight pair, refusing to invent one.
   *
   * @throws `GoogleFeedSkuSettingMissingError` when the resolver did not answer for this SKU.
   */
  private requireShippingWeight(
    resolved: ReadonlyMap<string, ResolvedSkuShippingWeightSetting>,
    skuID: string,
  ): ResolvedSkuShippingWeightSetting {
    const shippingWeight = resolved.get(skuID);

    if (shippingWeight === undefined) {
      throw new GoogleFeedSkuSettingMissingError(1, skuID);
    }

    return shippingWeight;
  }

  /**
   * Resolves the winning sale price of every SKU that has one.
   *
   * CFML parity [model/service/PromotionService.cfc:L1022-L1030]: the legacy runs the sale-price
   * reward query, keys the result by `skuID`, and then rounds each surviving entry whose
   * `roundingRuleID` is non-empty.
   *
   * @param selections the narrowed selection rows, used only to decide whether any SKU qualifies
   * at all and to discard rewards for SKUs outside this feed.
   * @returns a detail per SKU that a sale-price reward wins.
   */
  private async resolveSalePriceDetails(
    selections: readonly FeedSelectionColumns[],
  ): Promise<ReadonlyMap<string, ResolvedSalePriceDetail>> {
    const details = new Map<string, ResolvedSalePriceDetail>();

    if (selections.length === 0) {
      return details;
    }

    // No product identifier: one call answers for the whole catalog, which is what a whole-catalog
    // feed needs. See `GoogleFeedSalePriceSource`.
    const rewardRows = await this.salePriceSource.getSalePricePromotionRewardsQuery();

    const selectedSkuIDs = new Set(selections.map((selection) => selection.skuID));

    // Keyed in row order, so a duplicate SKU resolves to the LAST row exactly as the legacy's
    // struct assignment did.
    const winningRowBySkuID = new Map<string, SalePricePromotionRewardRow>();

    for (const rewardRow of rewardRows) {
      if (selectedSkuIDs.has(rewardRow.skuID)) {
        winningRowBySkuID.set(rewardRow.skuID, rewardRow);
      }
    }

    for (const [skuID, rewardRow] of winningRowBySkuID) {
      const roundingRuleID = rewardRow.roundingRuleID;

      const salePrice =
        roundingRuleID === undefined || roundingRuleID === ''
          ? rewardRow.salePrice
          : await this.valueRounder.roundValueByRoundingRuleID(rewardRow.salePrice, roundingRuleID);

      details.set(skuID, {
        salePrice,
        salePriceExpirationDateTime: rewardRow.salePriceExpirationDateTime,
      });
    }

    return details;
  }

  /**
   * Resolves both product-type values - the `g:product_type` breadcrumb and the fallback
   * `description` - for each requested product type.
   *
   * One recursive statement serves every requested type at once because the recursive member
   * carries the originating leaf's identifier and description through unchanged.
   *
   * @param productTypeIDs distinct, present product-type identifiers.
   * @returns a record per identifier that produced ancestry rows.
   */
  private async fetchProductTypeDetails(
    productTypeIDs: readonly string[],
  ): Promise<ReadonlyMap<string, ResolvedProductTypeDetail>> {
    const details = new Map<string, ResolvedProductTypeDetail>();

    if (productTypeIDs.length === 0) {
      return details;
    }

    const ancestryRows = await this.executeInIdentifierBatches(
      productTypeIDs,
      (placeholders: string) =>
        `${PRODUCT_TYPE_ANCESTRY_SQL_HEAD} (${placeholders})${PRODUCT_TYPE_ANCESTRY_SQL_TAIL}`,
    );

    const segmentsByLeaf = new Map<string, ProductTypeAncestrySegment[]>();

    for (const row of ancestryRows) {
      const segment = narrowAncestrySegment(row);
      const existing = segmentsByLeaf.get(segment.leafProductTypeID);

      if (existing === undefined) {
        segmentsByLeaf.set(segment.leafProductTypeID, [segment]);
      } else {
        existing.push(segment);
      }
    }

    for (const [leafProductTypeID, segments] of segmentsByLeaf) {
      const leafSegment = segments.find((segment) => segment.ancestorDistance === 0);

      details.set(leafProductTypeID, {
        simpleRepresentation: buildProductTypeBreadcrumb(segments),
        productTypeDescription: leafSegment?.productTypeDescription,
      });
    }

    return details;
  }

  /**
   * Run one identifier-keyed follow-up statement over a key set, in batches, returning every row.
   *
   * What this exists to prevent, and it is what made removing the selection ceiling safe.
   *
   * The emitted SQL is unchanged for every realistic key set.
   *
   * @param identifiers the keys to bind; never empty, both callers short-circuit first.
   * @param buildSql renders the statement text around a placeholder list.
   * @returns every row from every batch, concatenated in batch order.
   */
  private async executeInIdentifierBatches(
    identifiers: readonly string[],
    buildSql: (placeholders: string) => string,
  ): Promise<readonly SqlRow[]> {
    // `chunkTupleRows` refuses an empty set rather than yielding zero batches, and MySQL cannot
    // parse `IN ()`, so the empty case is answered before either can be reached.
    if (identifiers.length === 0) {
      return [];
    }

    const collected: SqlRow[] = [];

    for (const batch of chunkTupleRows(identifiers)) {
      const batchRows = await this.executor.execute(
        buildSql(sqlPlaceholderList(batch.length)),
        batch,
      );

      collected.push(...batchRows);
    }

    return collected;
  }

  /**
   * Resolves each product's additional image paths.
   *
   * Keyed on product rather than on SKU because the association is the product's
   * [model/entity/Product.cfc:L74], so every SKU of a product shares one array.
   *
   * @param productIDs distinct product identifiers from the selection.
   * @returns one path per image row, per product that has at least one image row.
   */
  private async fetchAdditionalImagePaths(
    productIDs: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const pathsByProductID = new Map<string, readonly string[]>();

    if (productIDs.length === 0) {
      return pathsByProductID;
    }

    const imageRows = await this.executeInIdentifierBatches(
      productIDs,
      (placeholders: string) => `${PRODUCT_IMAGES_SQL_HEAD} (${placeholders})`,
    );

    const collected = new Map<string, string[]>();

    for (const row of imageRows) {
      const image = narrowProductImageRow(row);
      const path = buildProductImagePath(
        this.settingValues.baseImageURL,
        image,
        this.settingValues.missingImagePath,
      );

      const existing = collected.get(image.productID);

      if (existing === undefined) {
        collected.set(image.productID, [path]);
      } else {
        existing.push(path);
      }
    }

    for (const [productID, paths] of collected) {
      pathsByProductID.set(productID, paths);
    }

    return pathsByProductID;
  }
}
