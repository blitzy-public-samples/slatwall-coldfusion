/**
 * The three seeded base product types of Slatwall 3.1.39.
 *
 * Ported from `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` — the three `<Record>` elements of
 * the `SwProductType` seed-data document. They are the only product types that carry a `systemCode`,
 * and that `systemCode` is the value the Catalog branches on: `model/service/SkuService.cfc:L61`
 * (merchandise), `:L139` (subscription) and `:L173` (contentAccess); `model/entity/Sku.cfc:L574-L590`
 * (`getSkuDefinition`); and `model/entity/ProductType.cfc:L109-L115` (`getBaseProductType`), which
 * produces the value.
 *
 * Fixed seed data, not test data and not generated identifiers (IR-7). The three `productTypeID`
 * literals are transcribed from that document verbatim — never regenerated through
 * `createSlatwallUUID()` in `src/util/uuid.ts`, never dashed into RFC-4122 form and never re-cased.
 * Per IR-6 a legacy primary key is a 32-character lowercase-hex string with no dashes.
 */

/** The `systemCode` of a seeded product type — the discriminator the catalog branches on. */
export type BaseProductType = 'merchandise' | 'subscription' | 'contentAccess';

/**
 * Shape of a seeded product-type record: exactly the four fields carried across from the legacy
 * `<Record>` elements, and no others.
 */
interface SeededProductTypeRecord {
  readonly systemCode: BaseProductType;
  readonly productTypeID: string;
  readonly productTypeName: string;
  readonly urlTitle: string;
}

/**
 * Compile-time contract for the lookup below. A mapped type over `BaseProductType` makes the
 * lookup total — every discriminator must be present, so a missing entry fails the build — and
 * intersecting each value with `{ readonly systemCode: Code }` requires every key to equal the
 * `systemCode` of the record stored under it, so key and record can never disagree.
 */
type SeededProductTypeRegistry = {
  readonly [Code in BaseProductType]: SeededProductTypeRecord & { readonly systemCode: Code };
};

/** The three seeded product types, keyed by `systemCode`. */
export const SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE = Object.freeze({
  /** The `merchandise` product type — `config/dbdata/SlatwallProductType.xml.cfm:L13`. */
  merchandise: Object.freeze({
    systemCode: 'merchandise',
    productTypeID: '444df2f7ea9c87e60051f3cd87b435a1',
    productTypeName: 'Merchandise',
    urlTitle: 'merchandise',
  } as const satisfies SeededProductTypeRecord),

  /** The `subscription` product type — `config/dbdata/SlatwallProductType.xml.cfm:L14`. */
  subscription: Object.freeze({
    systemCode: 'subscription',
    productTypeID: '444df2f9c7deaa1582e021e894c0e299',
    productTypeName: 'Subscription',
    urlTitle: 'subscription',
  } as const satisfies SeededProductTypeRecord),

  /** The `contentAccess` product type — `config/dbdata/SlatwallProductType.xml.cfm:L15`. */
  contentAccess: Object.freeze({
    systemCode: 'contentAccess',
    productTypeID: '444df313ec53a08c32d8ae434af5819a',
    productTypeName: 'Content Access',
    urlTitle: 'content-access',
  } as const satisfies SeededProductTypeRecord),
} as const satisfies SeededProductTypeRegistry);

/**
 * Recognises an untrusted value as one of the three seeded discriminators, CFML-fashion, and answers
 * with the canonical spelling — the single supported way to select a base-product-type branch.
 *
 * @param value - Any value, typically a `systemCode` read from the database, possibly inherited from a
 * hierarchy root. `null`, `undefined`, the empty string and non-string values are all handled and
 * simply resolve to `undefined`; nothing throws.
 *
 * @returns The canonical seeded `systemCode` whose text equals `value` under CFML's case-insensitive
 * `==`, or `undefined` when no seeded code does. The argument itself is never modified.
 */
export function resolveBaseProductType(value: unknown): BaseProductType | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const foldedValue = value.toLowerCase();

  for (const seededProductType of Object.values(SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE)) {
    if (seededProductType.systemCode.toLowerCase() === foldedValue) {
      return seededProductType.systemCode;
    }
  }

  return undefined;
}
