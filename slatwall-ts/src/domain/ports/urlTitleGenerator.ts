// Unique URL-title generation port: one collaborator, one method.
//
// Replaces `DataService.createUniqueURLTitle(titleString, tableName)`, reached
// from `model/service/BrandService.cfc:L67-L77` and
// `model/service/ProductService.cfc:L264-L311`. A catalog save path hands it a
// human-readable title and a physical table name and it answers with a title that
// does not collide in that table.
//
// It is async because the legacy body queries for collisions. `tableName` is a
// physical `Sw*` table name supplied by the caller, so the implementing adapter
// must treat it as an identifier under its own allowlist and must never
// interpolate a caller-supplied value into statement text.
export type UrlTitleTableName = 'SwBrand' | 'SwProduct' | 'SwProductType';

// LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the urlTitle guard on the product save
// path
// is null-only. An empty string is not null, so the guard does not fire, the generation call at
// L269
// is skipped, and the empty value survives into `validate(context="save")` at L273 - where
// [model/validation/Product.json:L16] declares urlTitle required and unique, so the save fails.
// Preserved deliberately; do not fix without a product decision.
//
// The asymmetry is one against two, which makes it a divergence in saveProduct rather than an
// unsettled convention: [model/service/ProductService.cfc:L295-L301] (saveProductType) and
// [model/service/BrandService.cfc:L68-L74] both test null OR empty, both also inspect
// `arguments.data.urlTitle`, and both write the generated value back through an unscoped `data`
// reference, where saveProduct writes through the entity setter at L269.
//
// The guard lives in the service tier, so this port only records the asymmetry for the service tier
// to reproduce. It therefore offers no `force`, `overwrite` or `allowEmpty` flag, no second "safe"
// method, and no normalisation of an empty title to an absent one - each would be the repair by
// another route.

/**
 * Generates a URL-safe `urlTitle` that is unique within a catalog table.
 *
 * Ported from `createUniqueURLTitle(titleString, tableName)`
 * [model/service/DataService.cfc:L53-L71]. The whole component narrows to this one method because
 * it
 * is the only part of `DataService` the in-scope catalog slice consumes; its XML-directory loading
 * and bulk-population methods serve out-of-scope features and are not ported.
 */
export interface UrlTitleGenerator {
  // LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the product save path tests only for
  // null, so a product already holding an empty urlTitle keeps it, unlike the brand and
  // product-type paths which also test length. See the module-scope marker above for the evidence.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Derive a URL title from a display string and make it unique within one table.
   *
   * CFML parity [model/service/DataService.cfc:L57-L68]: the title is lowercased and trimmed, every
   * character other than a letter, digit, space or hyphen is removed, runs of spaces collapse to a
   * single hyphen, and a colliding title is suffixed with an incrementing number starting at `-2`
   * until the value is unique for the table.
   *
   * @param titleString the display string to derive the title from.
   * @param tableName the table the result must be unique within.
   * @returns the unique URL title.
   */
  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string>;
}
