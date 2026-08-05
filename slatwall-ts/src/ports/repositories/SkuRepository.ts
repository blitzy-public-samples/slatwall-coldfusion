/**
 * `SkuRepository` — the repository port for the Catalog's SKU query surface, and the contract that
 * carries the option-to-SKU resolution algorithm across the migration boundary.
 *
 * Legacy origin: `model/dao/SkuDAO.cfc`. AAP §0.1.1 explains why a service-oriented reading of this
 * codebase misleads — the option-to-SKU resolution lives in a DAO as a hand-assembled HQL string
 * [model/dao/SkuDAO.cfc:L107-L128] — so this file, not the service above it, is that algorithm's
 * contract. `model/service/SkuService.cfc` reaches the component eight times, the heaviest dependency
 * in the slice (AAP §0.6.3.2), and four of its members are one-line pass-throughs [:L272, :L282,
 * L286, :L290]. AAP §0.4.1.6 and §0.4.2.6 fix the member set and each target name.
 *
 * TODO(parity) `model/dao/SkuDAO.cfc:L132`, `:L135` versus `:L179-L211` — the component mixes logical
 * entity names with physical table names inside native statements. The logical names arise because
 * the framework prefixes an entity name with the application key
 * [org/Hibachi/HibachiDAO.cfc:L102-L106], a mapping-layer convenience a native statement never
 * receives. Never "fix" a mapping-layer entity name to a physical one, and never assume a logical
 * name works in a native statement; which convention each statement uses is stated on its member.
 * This observation carries the correction alias D22, defined once here and once in README §12.4.
 *
 * The alias set closes at D25 and M9. AAP §0.6.7 is authoritative and frozen at D1-D21 and AAP §0.6.6
 * at M1-M8; an alias is a cross-reference to an observation those registers do not number, never a
 * twenty-second defect or a ninth mismatch, and no file extends either range. A newly discovered
 * observation is annotated by its `path:Lnnn` locator alone, which is the authority whenever an alias
 * and a locator disagree. README §12.4 and §12.5 hold the full register; the aliases are D22 here,
 * D23 and D24 at `src/services/SkuService.ts`, D25 at `src/services/ProductService.ts`, and M9 at
 * `src/services/SkuService.ts`.
 */

import type { Product } from '../../domain/product/Product';
import type { Sku } from '../../domain/sku/Sku';

/** The element type of {@link skuRepository.findSkusBySelectedOptions} — a hydrated SKU. */
export type SkuRow = Sku;

/** One row of {@link skuRepository.searchByProductType} — a SKU offered for selection. */
export interface SkuSearchRow {
  readonly id: string;
  readonly value: string;
}

/**
 * Port for the seven SKU queries of `model/dao/SkuDAO.cfc`, consumed by
 * `src/services/SkuService.ts` and `src/services/ProductService.ts`, and implemented against MySQL
 * in `src/adapters/mysql/**`.
 */
export interface SkuRepository {
  /**
   * Reports whether any transaction record references a SKU — either one specific SKU, or any SKU of
   * one product. A SKU identifier takes precedence over a product identifier whenever both arrive.
   *
   * TODO(boundary): the ten existence tests reach the order, inventory, physical, stock and vendor
   * families, all excluded by AAP §0.2.2.1, so this predicate is the widest reach across the scope
   * boundary in the port — and it is crossed by returning a `boolean` and nothing else. No entity type
   * from an excluded family may be imported or described here, because that would break AAP §0.8.3.8:
   * The extracted services must be callable without the rest of Slatwall being converted.
   *
   * TODO(parity) D23 — the legacy service member declares no arguments [model/service/SkuService.cfc:L285]
   * yet forwards its whole argument scope onward [:L286], which is how its two entity call sites scope
   * the probe; CFML forwards undeclared named arguments through an argument-collection call and
   * TypeScript has no equivalent. IR-1 governs the pattern, so `src/services/SkuService.ts` declares
   * `(skuID?, productID?)` while this member keeps the DAO's own `(productID?, skuID?)` order per TR-4
   * and the service performs the swap once.
   *
   * @param productID A product's identifier. Supplied alone, the question becomes "has any SKU of this
   * product been transacted against"; ignored when a SKU identifier is also supplied.
   *
   * @param skuID A single SKU's identifier, which takes precedence over `productID`.
   * @returns True when at least one of the ten existence tests matches; false when none does.
   */
  transactionExists(productID?: string, skuID?: string): Promise<boolean>;

  /**
   * Reads one SKU by its own SKU code or by any of its alternate SKU codes, in one statement.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L103` — the statement has no distinct projection, in deliberate
   * contrast with the option resolver at `:L109`, which requires it (T4). Because the outer join fans
   * out one row per alternate code, a SKU carrying several alternate codes can produce several rows,
   * and the unique-result request then raises. Implementations must not add distinctness to "fix" it:
   * That would change which inputs raise.
   *
   * TODO(parity) — the SKU code is required here [model/dao/SkuDAO.cfc:L102] and optional one layer up
   * [model/service/SkuService.cfc:L289]. Each signature stays as found: AAP §0.4.2.6 specifies the
   * required form for this port, and the out-of-scope caller at `model/service/PhysicalService.cfc:L199`
   * depends on the optional service form, which AAP Goal B names as not to be broken.
   *
   * @param skuCode The SKU code to resolve, matched against the SKU's own code and every alternate code.
   * @returns The single matching SKU, or `null` when nothing matches. Raises when more than one row
   * matches, reproducing the unique-result request at `model/dao/SkuDAO.cfc:L103`.
   */
  findBySkuCode(skuCode: string): Promise<Sku | null>;

  /**
   * Resolves the SKUs of one product that carry every option in a given list — the algorithm of
   * `model/dao/SkuDAO.cfc:L107-L128`. Five semantics must survive translation and are asserted in
   * `test/adapters/MySqlSkuRepository.test.ts`: one correlated `EXISTS` per list element ANDed
   * together, duplicates included (T1); a required product predicate (T2); the option-bearing guard
   * that keeps option-less SKUs out (T3); `SELECT DISTINCT` against join fan-out (T4); and an empty
   * list degenerating to every option-bearing SKU of the product (T5).
   *
   * TODO(parity) D19 follows directly from T5 and is carried, not repaired. For a SKU with zero options
   * the assembled list is empty, so this member returns all option-bearing SKUs of the product, and the
   * guard at `model/entity/Sku.cfc:L764` can then only pass when the product has none — an option-less
   * default SKU on a product that already has option-bearing SKUs therefore fails its uniqueness rule.
   * The sibling rule at `:L772-L784` does not behave alike: it is pure, walks the SKU's own options and
   * touches no repository.
   *
   * @param optionIds The option identifiers a SKU must all carry. Order is preserved into the bound
   * parameters, duplicates must not be collapsed (T1), and the empty array is legal (T5).
   *
   * @param productId The product whose SKUs are considered. Required (T2); an empty string is passed
   * through and matches nothing rather than being rejected.
   */
  findSkusBySelectedOptions(optionIds: string[], productId: string): Promise<SkuRow[]>;

  /**
   * Searches SKUs by a partial SKU code, optionally narrowed to a set of product types.
   *
   * TODO(parity) — the two arguments are guarded with different strictness and the asymmetry is carried.
   * The product-type argument is double-guarded at `model/dao/SkuDAO.cfc:L134` (present and non-blank
   * after trimming) while the term at `:L133` is read with no guard at all, so omitting it raises
   * despite being declared optional. The same shape exists at `model/dao/ProductDAO.cfc:L422`, which
   * makes it the house pattern rather than a slip. Promoting the term to required would change which
   * calls raise.
   *
   * @param term Partial SKU code, wrapped in wildcards by the implementation. Declared optional per
   * `model/dao/SkuDAO.cfc:L130` but read unguarded there — see the note above.
   *
   * @param productTypeID Comma-delimited product-type identifiers despite the singular name. When
   * omitted or blank, no product-type narrowing is applied.
   *
   * @returns The matching rows, in unspecified order. Possibly empty; never null or undefined.
   */
  searchByProductType(term?: string, productTypeID?: string): Promise<SkuSearchRow[]>;

  /**
   * Reads the SKUs of one product, with an eager-loading flag that also filters: when set, the
   * base-type-specific inner join both fetches the related records and excludes SKUs lacking them
   * [model/dao/SkuDAO.cfc:L150-L168].
   *
   * TODO(parity) D9, both halves, carried and not repaired: at `model/dao/SkuDAO.cfc:L153` the flag is
   * read without its argument scope, so the test resolves against whatever the name finds first, and at
   * `:L163` the statement variable is re-declared mid-function with a compound append.
   *
   * @param product The product whose SKUs are read — the entity, not an identifier: its base type
   * selects the join and its identifier supplies the filter.
   *
   * @param fetchOptions required, exactly as at `model/dao/SkuDAO.cfc:L150`; the default lives in the
   * service.
   */
  findByProduct(product: Product, fetchOptions: boolean): Promise<Sku[]>;

  /**
   * Reads the identifiers of one product's SKUs in option-combination order — the composite odometer
   * ordering built from `SUM(sortOrder * POWER(10, …))` at `model/dao/SkuDAO.cfc:L179-L211`, which
   * reads only option-bearing SKUs.
   *
   * TODO(parity) D13 — that narrower-than-expected result set is the cause of the service-side defect.
   * `model/service/SkuService.cfc:L223-L244` and `:L246-L269` build a position lookup from this output
   * and then index an array by the position found; for a SKU absent from the result the position is
   * "not found" and the assignment raises. Implementations must not pad the result with option-less
   * SKUs to mask it.
   *
   * TODO(parity) D8 — the literal source TODO at `model/dao/SkuDAO.cfc:L177` records that the query was
   * never tested against databases other than the two the legacy targeted. This port addresses one of
   * those two, which is consistent with the untested state rather than a resolution of it; the dialect
   * branch at `:L194-L198` selects between two spellings of the same arithmetic by composing statement
   * text. Neither single-database support nor added dialects close the TODO.
   *
   * @param productID The product whose SKU identifiers are read; bound, per `model/dao/SkuDAO.cfc:L190`.
   * @returns The identifiers of the product's option-bearing SKUs in odometer order — always empty for
   * a product whose SKUs carry no options. Never null or undefined.
   */
  findSortedSkuIdsByProduct(productID: string): Promise<string[]>;

  /**
   * Discards the memoized option-group sort order used by
   * {@link SkuRepository.findSortedSkuIdsByProduct}.
   *
   * TODO(parity) D7 — the member is inert twice over and is still declared. The guard at
   * `model/dao/SkuDAO.cfc:L222-L226` is inverted, so the removal runs only when the memoized key is
   * absent and never touches the key that exists; the legacy member also has no callers. Neither is
   * repaired — AAP §0.8.2 Guideline 4 names "an inverted cache guard" as exactly the kind of thing not
   * to fix — so implementations must not correct the condition or document this member as working.
   *
   * TODO(parity) M7 — the memo's scope is an execution-model mismatch. The memoized value is global
   * rather than per-product: a whole-table maximum [model/dao/SkuDAO.cfc:L210-L212] with no parameters
   * and no product scoping, held in the component property at `:L51`. Combined with D7 that is one
   * global number, computed once, never invalidated, ordering every product's SKUs. Nothing survives a
   * stateless invocation except module-scope state, so the memo is request-scoped here to avoid sharing
   * it across invocations on a warm container.
   *
   * TODO(parity) `model/dao/SkuDAO.cfc:L206`, `:L213-L215` — the seed is always overwritten, because the
   * guard tests whether a bare aggregate returned a row and an aggregate always returns exactly one. On
   * an empty option-group table the maximum is null, which CFML surfaces as an empty string, so
   * incrementing it yields the seed value anyway: the two paths coincide by coincidence. Implementations
   * reproduce both values and must not rely on the guard meaning what it appears to mean.
   *
   * @returns nothing. Synchronous by design, per `model/dao/SkuDAO.cfc:L222`, and with no effect at all
   * in the legacy — see the inverted-guard note above.
   */
  clearOptionGroupSortOrderCache(): void;

  /**
   * Persists one SKU, and makes it visible to every subsequent read issued through this repository —
   * the read-back visibility M6 requires, owned by `src/adapters/mysql/UnitOfWork.ts`.
   *
   * TODO(parity) M5 — the legacy's implicit request-end commit has no equivalent in a stateless
   * invocation, so the transaction this member participates in is opened and closed by the caller.
   *
   * @param sku The SKU to persist. Mutated when transient: the implementation assigns its 32-character
   * identifier here, because `model/entity/Sku.cfc:L52` declares `fieldtype="id" generator="uuid"` —
   * an instruction to the mapping layer to produce the value at save time — and the legacy generator
   * `createSlatwallUUID()` lives in the data-access layer (IR-6).
   */
  persistSku(sku: Sku): Promise<void>;
}
