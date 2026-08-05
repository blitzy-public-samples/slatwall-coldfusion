/**
 * `OptionRepository` — the repository port for the Catalog's two option queries.
 *
 * Legacy origin: `model/dao/OptionDAO.cfc`, a component with exactly two members. AAP §0.4.1.6 and
 * §0.4.2.6 fix both target names: `getUnusedProductOptions` [model/dao/OptionDAO.cfc:L51] becomes
 * {@link optionRepository.findUnusedOptions}, and `getUnusedProductOptionGroups` [:L94] becomes
 * {@link optionRepository.findUnusedOptionGroups}.
 *
 * The DAO is in scope because that is where the behaviour lives (AAP §0.2.1.3): both public members
 * of `model/service/OptionService.cfc` are one-line pass-throughs [:L73, :L77], so the composed
 * label, the set polarity and the row ordering are all expressed in the DAO.
 *
 * The implementation is supplied by constructor injection, replacing the DI/1 property at
 * `model/service/OptionService.cfc:L51` and its synthesized `getOptionDAO()` accessor (R1, R2). The
 * component's second property, `productService` [:L53], is a dead injection with zero call sites
 * (AAP §0.6.3.4) and is deliberately not represented.
 */

/** One row of {@link optionRepository.findUnusedOptions} — an option offered for selection. */
export interface UnusedOptionRow {
  readonly name: string;
  readonly value: string;
}

/**
 * One row of {@link OptionRepository.findUnusedOptionGroups} — an option group offered for
 * selection.
 */
export interface UnusedOptionGroupRow {
  readonly name: string;
  readonly value: string;
}

/**
 * Port for the two option queries of `model/dao/OptionDAO.cfc`, consumed by `OptionService` and
 * implemented against MySQL in `src/adapters/mysql/**`.
 *
 * Opposite set polarity is the one fact a reader of either member alone will get wrong. Both take the
 * same `existingOptionGroupIDList` and filter on it with inverted predicates: `findUnusedOptions`
 * keeps rows whose group is in the list [model/dao/OptionDAO.cfc:L68], `findUnusedOptionGroups` keeps
 * rows whose group is not in it [:L107]. One token of difference, opposite questions, and divergent
 * empty-input outcomes — an empty list yields no rows from the first member and every row from the
 * second.
 *
 * TODO(parity): the asymmetry is carried, not reconciled — the outcomes at `:L68` and `:L107` are
 * observable output, so making the two members agree would change results (AAP §0.8.2 Guideline 4).
 */
export interface OptionRepository {
  /**
   * Lists the options a product may still be offered, as drop-down rows. A row qualifies when the
   * option belongs to an option group already present on the product [model/dao/OptionDAO.cfc:L68]
   * and is not yet carried by any SKU of that product — the correlated non-existence guard at
   * L70-L81 over `SwSkuOption`/`SwSku`, correlating on `a.optionID = SwOption.optionID` at :L80.
   *
   * An empty `existingOptionGroupIDList` is ordinary, not an error: `model/entity/Product.cfc:L637`
   * supplies `structKeyList(getOptionGroupsStruct())`, which is empty for a product with no option
   * groups yet, and CFML's `list="true"` binding turns it into `IN ('')`, matching nothing. An
   * implementation therefore resolves `[]` — and must emit exactly one placeholder for the empty
   * list, since dropping it is a database syntax error rather than a compile error.
   *
   * Adapter obligation: bind in statement order, which is the reverse of this signature. The legacy
   * signature declares `productID` first [:L52] and the list second [:L53], but the statement binds
   * the group list at :L68 before the product identifier at :L78. TR-4 requires the bound array to
   * follow the statement sequence, and two same-typed strings swapped is a fault no type check
   * catches.
   *
   * TODO(parity): the two orders both stay as found — reordering the parameters would break the
   * positional call site at `model/entity/Product.cfc:L637` and the surface AAP §0.4.2.6 mandates,
   * and reordering the bindings would violate TR-4. only the mapping between them is the adapter's.
   *
   * @param productID identifier of the product whose SKUs determine what counts as already used.
   * Required, exactly as at `model/dao/OptionDAO.cfc:L52`.
   *
   * @param existingOptionGroupIDList Comma-delimited option-group identifiers already on the
   * product. Kept as a delimited string because that is what the legacy member receives.
   *
   * @returns The qualifying options as drop-down rows. Possibly empty; never null or undefined.
   */
  findUnusedOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<UnusedOptionRow[]>;

  /**
   * Lists the option groups not yet present on a product, as drop-down rows — the `NOT IN` mirror of
   * {@link optionRepository.findUnusedOptions} [model/dao/OptionDAO.cfc:L107], so an empty list
   * qualifies every group.
   *
   * @param existingOptionGroupIDList Comma-delimited option-group identifiers already present on the
   * product. Required, exactly as at `model/dao/OptionDAO.cfc:L95`.
   *
   * @returns The qualifying option groups as drop-down rows, ordered by name. Possibly empty; never
   * null or undefined.
   */
  findUnusedOptionGroups(existingOptionGroupIDList: string): Promise<UnusedOptionGroupRow[]>;
}
