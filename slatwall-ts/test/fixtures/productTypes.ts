/**
 * Seeded product-type discriminators of Slatwall 3.1.39 — shared test fixture.
 *
 * Provenance: **TRACEABLE** — source `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`
 * (the `<Record>` elements of the `SwProductType` seed-data document). Every literal in
 * this file is transcribed verbatim from that span.
 *
 * Purpose: give every suite under `test/` one authoritative place to reference the three
 * product-type discriminators *without importing production code paths*.
 */

/*
 * Why these are fixed data, not test data (IR-7)
 * These values are hard-coded rather than generated, and that is the faithful choice:
 *
 * 1. The `systemCode` strings are literal branch keys of production logic. The legacy
 * `skuService.createSkus` discriminates three ways on
 * `product.getProductType().getBaseProductType()` at model/service/SkuService.cfc:L61
 * (merchandise), :L139 (subscription) and :L173 (contentAccess). A single wrong character
 * silently stops a branch from ever matching, with no compile error and no obvious failure.
 */

/**
 * Shape of a seeded product-type record: every column the legacy `<Record>` elements carry,
 * and no others.
 */
interface SeededProductTypeRecord {
  /** `config/dbdata/SlatwallProductType.xml.cfm:L8` — the value production logic branches on. */
  readonly systemCode: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L4` — `fieldtype="id"`, 32-char lowercase hex. */
  readonly productTypeID: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L7` — declared `update="false"`. */
  readonly productTypeName: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L9` — declared `update="false"`. */
  readonly urlTitle: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L6` — the materialised hierarchy path. */
  readonly productTypeIDPath: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L5` — the parent reference. */
  readonly parentProductTypeID: string;

  /** `config/dbdata/SlatwallProductType.xml.cfm:L10` — active on all three seeded records. */
  readonly activeFlag: string;
}

/**
 * `productTypeID` of the `merchandise` product type.
 * Transcribed from `config/dbdata/SlatwallProductType.xml.cfm:L13`.
 */
export const MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * `productTypeID` of the `subscription` product type.
 * Transcribed from `config/dbdata/SlatwallProductType.xml.cfm:L14`.
 */
export const SUBSCRIPTION_PRODUCT_TYPE_ID = '444df2f9c7deaa1582e021e894c0e299';

/**
 * `productTypeID` of the `contentAccess` product type.
 * Transcribed from `config/dbdata/SlatwallProductType.xml.cfm:L15`.
 */
export const CONTENT_ACCESS_PRODUCT_TYPE_ID = '444df313ec53a08c32d8ae434af5819a';

/* The three record constants below. */

/** The `merchandise` product type — `config/dbdata/SlatwallProductType.xml.cfm:L13`. */
export const MERCHANDISE_PRODUCT_TYPE = Object.freeze({
  systemCode: 'merchandise',
  productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
  productTypeName: 'Merchandise',
  urlTitle: 'merchandise',
  productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
  parentProductTypeID: 'NULL',
  activeFlag: '1',
} as const satisfies SeededProductTypeRecord);

/** The `subscription` product type — `config/dbdata/SlatwallProductType.xml.cfm:L14`. */
export const SUBSCRIPTION_PRODUCT_TYPE = Object.freeze({
  systemCode: 'subscription',
  productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
  productTypeName: 'Subscription',
  urlTitle: 'subscription',
  productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
  parentProductTypeID: 'NULL',
  activeFlag: '1',
} as const satisfies SeededProductTypeRecord);

/** The `contentAccess` product type — `config/dbdata/SlatwallProductType.xml.cfm:L15`. */
export const CONTENT_ACCESS_PRODUCT_TYPE = Object.freeze({
  systemCode: 'contentAccess',
  productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
  productTypeName: 'Content Access',
  urlTitle: 'content-access',
  productTypeIDPath: CONTENT_ACCESS_PRODUCT_TYPE_ID,
  parentProductTypeID: 'NULL',
  activeFlag: '1',
} as const satisfies SeededProductTypeRecord);

/**
 * All three seeded product types, in the order they are declared in the legacy seed-data
 * document (`config/dbdata/SlatwallProductType.xml.cfm:L13-L15`).
 */
export const ALL_SEEDED_PRODUCT_TYPES = Object.freeze([
  MERCHANDISE_PRODUCT_TYPE,
  SUBSCRIPTION_PRODUCT_TYPE,
  CONTENT_ACCESS_PRODUCT_TYPE,
] as const);

/**
 * Compile-time guard for the lookup below: requires every key to be exactly the
 * `systemCode` of the record stored under it, so the two can never drift apart. Key
 * remapping over the tuple derives the required keys from the records themselves rather
 * than restating them, which is what makes the agreement machine-checked.
 */
type SeededProductTypesBySystemCode = {
  readonly [Seeded in (typeof ALL_SEEDED_PRODUCT_TYPES)[number] as Seeded['systemCode']]: Seeded;
};

/**
 * The three seeded product types keyed by `systemCode`, for resolving a record from the
 * code that legacy production logic branches on.
 */
export const SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE = Object.freeze({
  merchandise: MERCHANDISE_PRODUCT_TYPE,
  subscription: SUBSCRIPTION_PRODUCT_TYPE,
  contentAccess: CONTENT_ACCESS_PRODUCT_TYPE,
} as const satisfies SeededProductTypesBySystemCode);
