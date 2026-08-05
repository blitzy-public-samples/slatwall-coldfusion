/**
 * PricingPort — the extracted Catalog slice's single window onto the excluded pricing subsystem.
 * Type-only: it declares an interface and two supporting types, contains no executable statement
 * and imports nothing, so it emits no runtime code. It exists for one reason — so that retained
 * catalog members can read excluded pricing members without the promotion, price-group and currency
 * subsystems being dragged into the port (TR-5: cross the boundary only through a declared port,
 * and never quietly drop the member from the interface).
 * IR-3 (calculated-property containment) is why it is so small: the pricing, promotion, inventory
 * and currency-derived members among the non-persistent properties at
 * model/entity/Product.cfc:L102-L123 and model/entity/Sku.cfc:L99-L121 reach exclusively into
 * excluded services, so a reader following those getters would pull half the platform in. This port
 * exposes one retrieval.
 */

/**
 * One SKU's sale-price details, as returned by the boundary call for a single SKU identifier.
 *
 * TODO(parity): `salePriceDiscountAmount` is declared as a non-persistent property at
 * model/entity/Sku.cfc:L117 and appears on the AAP §0.2.2.6 exclusion list, so a reader arriving
 * from that list expects a fourth key here. There is none: the property has no getter, reader or
 * writer anywhere in the legacy tree, so it is deliberately absent. (The AAP cites the declaration
 * as L118; L118 is `salePriceExpirationDateTime`, and the verified locator is L117.)
 */
export interface SalePriceDetails {
  /**
   * The promotional sale price for this SKU, already rounded by the collaborator
   * (model/service/PromotionService.cfc:L1024-L1028).
   *
   * TODO(parity): the product-side counterpart diverges and the divergence is carried, not
   * reconciled. `Product.getSalePrice()` at model/entity/Product.cfc:L594-L601 returns a literal
   * `0` at model/entity/Product.cfc:L600, and its second branch at
   * model/entity/Product.cfc:L598 calls the first SKU's accessor but discards the result — there is
   * no `return` on that line — so the literal `0` is what a product with no default SKU yields. The
   * feed reads the SKU-side accessor, so the SKU-side fallback is the one that governs the
   * comparison above; both behaviours are preserved as observed.
   */
  readonly salePrice?: number;

  /**
   * The kind of discount that produced `salePrice`.
   *
   * TODO(parity): the product-side counterpart seeds a different default. `Product`'s accessor at
   * model/entity/Product.cfc:L604-L612 memoizes the literal string `none` at
   * model/entity/Product.cfc:L606 before delegating, whereas the SKU-side fallback is the empty
   * string at model/entity/Sku.cfc:L557. Two different "no discount" representations coexist in the
   * legacy source. Both are carried; neither is normalised, and this port supplies no default of
   * its own for either.
   */
  readonly salePriceDiscountType?: string;

  /**
   * When the sale price stops applying. Consumed by the feed's `g:sale_price_effective_date` range
   * at integrationServices/google/views/feed/product.cfm:L30.
   *
   * TODO(parity): there is a real latent type violation in the legacy source here, and it is
   * annotated rather than repaired (standard 7). The SKU-side accessor returns an empty string when
   * the key is absent — model/entity/Sku.cfc:L563 is the closing brace of the guard and the
   * `return "";` is at model/entity/Sku.cfc:L564 — while the product-side counterpart is declared
   * `public date function getSalePriceExpirationDateTime` at model/entity/Product.cfc:L614. An
   * empty string is not a date. This port does not inherit the empty-string lie: absence is
   * modelled by the property being absent, so a consumer is forced by the compiler to handle the
   * missing case explicitly instead of receiving a value that claims to be a date and is not.
   *
   * TODO(parity): two further defects on the product-side accessor are carried unchanged.
   * Model/entity/Product.cfc:L616 seeds the current time as its default rather than reporting
   * absence, and model/entity/Product.cfc:L618 delegates to a misspelled SKU accessor —
   * `getSalePricExpirationDateTime`, missing a letter — where the member actually declared on the
   * SKU is `getSalePriceExpirationDateTime` at model/entity/Sku.cfc:L560. Neither is fixed here.
   */
  readonly salePriceExpirationDateTime?: Date;
}

/** Every SKU's sale-price details for one product, keyed by SKU identifier. */
export type SalePriceDetailsBySkuId = Readonly<Record<string, SalePriceDetails>>;

/** The catalog slice's read-only window onto the excluded pricing subsystem. */
export interface PricingPort {
  /**
   * Retrieves the sale-price details for every SKU of one product, in a single boundary crossing.
   *
   * TODO(boundary): `model/service/PromotionService.cfc:L1022` is an unconverted collaborator.
   * It is excluded from this slice along with the other 8 `Promotion*` components under
   * `model/entity/`, `model/service/`, `model/dao/` and `model/process/` (9 in total), and with the
   * neighbouring 4 `PriceGroup*` and 2 `Currency*` components in those same directories. This
   * interface is the flagged gap, declared per TR-5 so the dependency is visible and finite rather
   * than followed; the member is not dropped, and the excluded components stay out of the
   * deliverable. An implementation of this port that reaches real promotional data must live in the
   * adapter layer and remains outside the converted slice.
   *
   * @param productId The product whose SKUs are being priced — the identifier passed as `productID`
   * at model/entity/Product.cfc:L519. required, because the legacy parameter is declared
   * `required` at model/service/PromotionService.cfc:L1022 and the only call site always supplies
   * it.
   *
   * @returns The product's details map, keyed by SKU identifier. Absent keys mean "no sale for that
   * SKU"; see `SalePriceDetailsBySkuId`.
   */
  getSalePriceDetailsForProductSkus(productId: string): Promise<SalePriceDetailsBySkuId>;
}

/*
 * Read but deliberately not ported — recorded so each omission reads as a decision
 *
 * TODO(parity): those last three siblings do not guard alike, and the asymmetry is preserved
 * rather than tidied. model/entity/Sku.cfc:L269's guard tests only the outer currency key
 * (model/entity/Sku.cfc:L270) and then reads the inner `price` member at
 * model/entity/Sku.cfc:L271, so it can fail where its neighbours return cleanly, whereas
 * model/entity/Sku.cfc:L275 and model/entity/Sku.cfc:L281 each test both the outer key and the
 * inner member (model/entity/Sku.cfc:L276 and model/entity/Sku.cfc:L282). Whoever ports those
 * delegators must carry the one-guard-short shape, not harmonise the three.
 */
