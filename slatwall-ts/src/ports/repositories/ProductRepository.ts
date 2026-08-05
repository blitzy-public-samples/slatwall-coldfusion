/**
 * ProductRepository — the repository port for the Catalog's product-side data access.
 *
 * Legacy origin: `model/dao/ProductDAO.cfc`, declaring exactly three public members and one private
 * helper. Authority: AAP §0.4.1.6 "Ports" — "Three public members typed; the importer's return
 * contract made explicit" — with the member-by-member mapping fixed by AAP §0.4.2.6.
 * The prompt named no DAOs; AAP §0.2.1.3 adds all four as implicit scope, because this is where the
 * catalog's business logic actually resides and transliterating the four named services alone would
 * produce thin, nearly empty classes.
 */

/**
 * The element type returned by {@link ProductRepository.findAttributeSets}.
 *
 * TODO(boundary): `model/dao/ProductDAO.cfc:L52` yields hydrated attribute-set entities from
 * the excluded attribute domain (AAP §0.2.2.1). Should a future iteration bring that domain
 * into scope, this alias is the single place to replace with a typed row shape; until then no
 * primary-key or column name is invented for it.
 */
export type AttributeSetRow = unknown;

import type { Product } from '../../domain/product/Product';

/**
 * One row of the product type-ahead projection returned by
 * {@link ProductRepository.searchByProductType}.
 */
export interface ProductSearchRow {
  readonly id: string;

  readonly value: string;
}

/*
 * — the policy is mandatory, and every value inside it is the operator's
 * what this module establishes. {@link ProductImportSourcePolicy} is a required member of any
 * retrieving reader, and {@link ValidatedProductImportSource} is branded by a symbol declared and never
 * exported here, so the branded value can be produced nowhere except
 * {@link ProductImportSourcePolicy.validateSource}. Because the reader's read members accept only that
 * branded type, a location that never met a policy cannot reach a retrieval — a guarantee the type system
 * enforces, which the same obligation stated in prose could not.
 */

/**
 * A unique symbol that brands a location which has passed an operator-supplied import-source policy.
 */
declare const validatedProductImportSourceBrand: unique symbol;

/** An import location that has been through {@link ProductImportSourcePolicy.validateSource}. */
export type ValidatedProductImportSource = string & {
  readonly [validatedProductImportSourceBrand]: true;
};

/** The transfer bounds an import reader must enforce while retrieving a file. */
export interface ProductImportSourceBounds {
  /** The maximum number of bytes the reader may accept before abandoning the transfer. */
  readonly maxBytes: number;

  /**
   * The maximum wall-clock milliseconds the reader may spend on the transfer before abandoning it.
   */
  readonly maxMilliseconds: number;

  /** The maximum number of redirect hops the reader may follow. */
  readonly maxRedirectHops: number;
}

/** One redirect hop, presented for re-validation before it is followed. */
export interface ProductImportRedirectHop {
  /** The location the previous response redirected to, exactly as that response gave it. */
  readonly location: string;

  /**
   * The address the reader resolved {@link ProductImportRedirectHop.location} to and will connect to.
   */
  readonly resolvedAddress: string;
}

/** The operator-supplied policy every import reader must satisfy before it retrieves anything. */
export interface ProductImportSourcePolicy {
  /**
   * Vet a caller-supplied location and brand it, or raise.
   *
   * @param fileURL - the caller's location, forwarded verbatim.
   * @returns the same location, branded, when the policy admits it.
   */
  validateSource(fileURL: string): Promise<ValidatedProductImportSource>;

  /**
   * Vet one redirect hop, given the address the reader will connect to, and brand it, or raise.
   *
   * @param hop - the location and the address it resolved to.
   * @returns the hop's location, branded, when the policy admits it.
   */
  revalidateRedirectHop(hop: ProductImportRedirectHop): Promise<ValidatedProductImportSource>;

  /**
   * The bounds this policy requires of the transfer.
   *
   * @returns the byte, time and redirect bounds the reader must enforce.
   */
  readBounds(): ProductImportSourceBounds;
}

/**
 * The product-side repository boundary: five members, of which the three public members of
 * `model/dao/ProductDAO.cfc` are the ported core and two are additive. The total is stated here as
 * well as in the reconciliation below so the ported three are not read as the whole surface.
 */
export interface ProductRepository {
  /**
   * Returns the attribute sets matching the given attribute-set type codes, restricted by
   * product-type assignment.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L52`. Both arguments are declared `required array`
   * there, so both are required and both are arrays here — under `exactOptionalPropertyTypes` that
   * distinction is load-bearing. Result ordering is fixed by the clause appended unconditionally at
   * `model/dao/ProductDAO.cfc:L62`.
   *
   * TODO(parity): `model/dao/ProductDAO.cfc:L64` carries a literal source TODO asking for its
   * conditional to be removed once the two CFML engines agree on how arrays are handled for an
   * `IN` clause. Its subject is the binding divergence immediately beneath it: the branch at
   * `model/dao/ProductDAO.cfc:L66` binds the attribute-set type codes as a flattened list while
   * `model/dao/ProductDAO.cfc:L68` binds the very same named parameter as an array — one
   * parameter, two shapes, purely to work around an engine difference. Per AAP §0.6.7.1 the
   * treatment is an intentional simplification with its reason recorded: no such engine
   * divergence exists in TypeScript, so the migration itself satisfies the TODO's precondition
   *
   * @param attributeSetTypeCode - Attribute-set type system codes to match; required, and an array,
   * per `model/dao/ProductDAO.cfc:L52`.
   *
   * @param productTypeIDs - Product-type identifiers as a genuine array; required per
   * `model/dao/ProductDAO.cfc:L52`. An empty array is meaningful, not degenerate: it selects the
   * globally-flagged-only predicate at `model/dao/ProductDAO.cfc:L60`.
   */
  findAttributeSets(
    attributeSetTypeCode: string[],
    productTypeIDs: string[],
  ): Promise<AttributeSetRow[]>;

  /**
   * Imports products, SKUs, options, custom attributes and content assignments from a delimited file
   * fetched over HTTP.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L73`. `fileURL` is `required string`; `textQualifier` is
   * optional with an empty-string default.
   *
   * TODO(boundary): the legacy importer reaches collaborators this slice excludes, and each is an
   * adapter concern rather than a change to this signature, since ports are injected at the
   * composition root (AAP §0.7.3). It reads the current account at
   * `model/dao/ProductDAO.cfc:L153` and `model/dao/ProductDAO.cfc:L341`, which maps to the
   * account-context port; it reads the global image-extension setting at
   * `model/dao/ProductDAO.cfc:L307`, `L313` and `L320`, which maps to the setting-resolver port; and
   * at `model/dao/ProductDAO.cfc:L262` it reads a Mura cms content table, which belongs to a
   * different application altogether and has no port in this plan.
   *
   * @param fileURL - Location of the delimited file to retrieve and import, forwarded exactly as the
   * caller supplied it. Occupies the first argument position of `model/dao/ProductDAO.cfc:L73`, where
   * it is declared `required string fileURL`; the name, type, arity and argument order all match that
   * declaration (TR-1). The file type is still derived from the extension inside the implementation,
   * at `model/dao/ProductDAO.cfc:L74`. Forwarding the location unchanged is load-bearing: `:L74`
   * derives the delimiter from the raw string, and the operator policy seam judges the same string,
   * so normalising it here would change both decisions.
   *
   * @param textQualifier The optional text qualifier, second argument of
   * `model/dao/ProductDAO.cfc:L73`.
   */
  importFromFile(fileURL: string, textQualifier?: string): Promise<void>;

  /**
   * Type-ahead search over product names, optionally narrowed to a set of product types.
   *
   * Legacy origin: `model/dao/ProductDAO.cfc:L419`, where neither argument is declared
   * `required` — so both are optional here, and the untyped legacy return becomes a declared
   * projection array, a tightening recorded under transformation rule TR-1.
   *
   * TODO(parity): `model/dao/ProductDAO.cfc:L421` embeds a stale logical entity name inside a
   * native statement — the statement is assembled through the native query object created at
   * `model/dao/ProductDAO.cfc:L420` and set at `model/dao/ProductDAO.cfc:L427`, so a logical
   * name has no meaning there and only resolves at all because of the application-key prefixing
   * at `org/Hibachi/HibachiDAO.cfc:L102-L106`. The contrast that makes the finding legible is
   * `model/dao/ProductDAO.cfc:L53`, where a logical name is used inside HQL, which is exactly
   * where a logical name is correct. This also corrects the direction of the received account of
   * this defect: the component contains zero physical `Sw*` names anywhere, so the problem is a
   *
   * @param term - Bare search term for the product name, optional per
   * `model/dao/ProductDAO.cfc:L419`; wildcards are added by the implementation at
   * `model/dao/ProductDAO.cfc:L422`.
   *
   * @param productTypeIDs - Optional comma-delimited product-type identifier list, bound as a
   * list at `model/dao/ProductDAO.cfc:L425`. Plural by preservation; a string, not an array.
   */
  searchByProductType(term?: string, productTypeIDs?: string): Promise<ProductSearchRow[]>;

  /**
   * Write one product — insert when it is transient, update when it is not.
   *
   * @param product - The product to write. Mutated when transient: it receives its 32-character
   * identifier, because `model/entity/Product.cfc:L52` declares `fieldtype="id" generator="uuid"` and
   * the legacy generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`.
   *
   * @returns The same product, so the member satisfies `EntityPersister<Product>` directly.
   */
  saveProduct(product: Product): Promise<Product>;

  /**
   * Remove one product.
   *
   * @param product - The product to remove. Must carry a persistent identifier.
   * @returns Nothing, so the member satisfies `EntityRemover<Product>` directly.
   */
  removeProduct(product: Product): Promise<void>;
}
