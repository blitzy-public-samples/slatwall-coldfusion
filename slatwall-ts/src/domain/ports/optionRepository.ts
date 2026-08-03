// Option repository port: the two "unused option / unused option-group" lookups
// that back product option assignment.
//
// Replaces `model/dao/OptionDAO.cfc`, whose two `<cffunction>` bodies wrap an
// embedded `<cfquery>`; those query bodies - not any paraphrase - are the source
// of truth for the statements the adapter reproduces.
//
// CFML parity [model/dao/OptionDAO.cfc:L87-L89, L112-L114]: neither legacy
// function hydrates an entity. Each runs a query and appends a `{ name, value }`
// struct per row, so this port returns that projection rather than the
// `Option[]`/`OptionGroup[]` the plan's interface table published. It therefore
// references no entity type and imports nothing.
//
// CFML parity [model/dao/OptionDAO.cfc:L53, L95]: `existingOptionGroupIDList`
// stays a comma-delimited `string`, never `string[]`, because that is what the
// legacy signatures declare. Splitting it belongs to the adapter, which must bind
// each parsed element as its own prepared-statement parameter and must never
// interpolate the list - whole or split - into statement text. Legacy bound every
// value via `cfqueryparam ... list="true"` at [model/dao/OptionDAO.cfc:L68] and
// [model/dao/OptionDAO.cfc:L107].
//
// LEGACY-NOTE [model/validation/Product.json:L13-L14]: both results sit under a
// `minCollection 1` declarative constraint, so an EMPTY array is a meaningful
// outcome that fails validation in the `addOption`/`addOptionGroup` contexts. It
// must be returned as an empty array and never smoothed into a default, a
// fallback or a synthesised placeholder row.

/**
 * One select-list row as the legacy queries build it.
 *
 * `name` is the label the legacy loop composes and `value` is the identifier: for options it is
 * "<optionGroupName> - <optionName>" [model/dao/OptionDAO.cfc:L88], and for option groups it is the
 * group name alone [model/dao/OptionDAO.cfc:L113].
 */
export interface SelectOption {
  readonly name: string;

  readonly value: string;
}

/**
 * Reads the option and option-group select lists that back product option
 * assignment.
 *
 * The legacy component declares exactly two functions, so this port declares two
 * methods - not the service-tier transformation at
 * [model/service/OptionService.cfc:L55], and no load, save, delete, count or
 * existence variant. The service tier receives it as a constructor parameter in
 * place of the DI/1 `property name="optionDAO";` at
 * [model/service/OptionService.cfc:L51].
 *
 * CFML parity [model/dao/OptionDAO.cfc:L51-L117]: NEITHER METHOD GUARDS AN EMPTY
 * LIST - no length test, no default, no branch. Because the two statements use the
 * list with OPPOSITE polarity, an empty list leaves `getUnusedProductOptions`
 * matching nothing while it leaves `getUnusedProductOptionGroups` excluding
 * nothing. Both outcomes are ported as they stand; no guard smooths them over.
 */
export interface OptionRepository {
  // CFML parity [model/dao/OptionDAO.cfc:L51-L92]: the group list is matched with `IN`, so the
  // result
  // is restricted to groups already attached to the product, and the `NOT EXISTS` subquery then
  // drops
  // any option already carried by one of that product's SKUs.
  /**
   * Options belonging to the product's existing option groups that none of its SKUs uses yet.
   *
   * @param productID product whose SKUs are checked for existing option use.
   * @param existingOptionGroupIDList comma-delimited option group identifiers to search within.
   * @returns rows ordered by option group name then option name.
   */
  getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]>;

  // CFML parity [model/dao/OptionDAO.cfc:L94-L117]: this list is matched with `NOT IN` — the
  // opposite
  // of the sibling query — because an unused group is one the product does not already carry.
  /**
   * Option groups the product does not already carry.
   *
   * @param existingOptionGroupIDList comma-delimited option group identifiers to exclude.
   * @returns rows ordered by option group name.
   */
  getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<readonly SelectOption[]>;
}
