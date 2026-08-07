// Unique URL-title generation port: one collaborator, one method.
//
// It is async because the legacy body queries for collisions.
export type UrlTitleTableName = 'SwBrand' | 'SwProduct' | 'SwProductType';

// LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the urlTitle guard on the product save
// path is null-only.
// Preserved deliberately; do not fix without a product decision.
//
// The guard lives in the service tier, so this port only records the asymmetry for the service
// tier to reproduce.

/**
 * Generates a URL-safe `urlTitle` that is unique within a catalog table.
 */
export interface UrlTitleGenerator {
  // LEGACY-DEFECT [model/service/ProductService.cfc:L268]: the product save path tests only for
  // null, so a product already holding an empty urlTitle keeps it, unlike the brand and
  // product-type paths which also test length.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Derive a URL title from a display string and make it unique within one table.
   *
   * CFML parity [model/service/DataService.cfc:L57-L68]: the title is lowercased and trimmed,
   * every character other than a letter, digit, space or hyphen is removed, runs of spaces
   * collapse to a single hyphen.
   *
   * @param titleString the display string to derive the title from.
   * @param tableName the table the result must be unique within.
   * @returns the unique URL title.
   */
  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string>;
}
