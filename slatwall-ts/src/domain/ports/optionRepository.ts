// Option repository port: the two "unused option / unused option-group" lookups that back product
// option assignment.
//
// CFML parity [model/dao/OptionDAO.cfc:L87-L89, L112-L114]: neither legacy function hydrates an
// entity.
//
// CFML parity [model/dao/OptionDAO.cfc:L53, L95]: `existingOptionGroupIDList` stays a
// comma-delimited `string`, never `string[]`, because that is what the legacy signatures declare.
//
// LEGACY-NOTE [model/validation/Product.json:L13-L14]: both results sit under a `minCollection 1`
// declarative constraint, so an EMPTY array is a meaningful outcome that fails validation in the
// `addOption`/`addOptionGroup` contexts.

/**
 * One select-list row as the legacy queries build it.
 *
 * `name` is the label the legacy loop composes and `value` is the identifier: for options it is
 * "<optionGroupName> - <optionName>" [model/dao/OptionDAO.cfc:L88].
 */
export interface SelectOption {
  readonly name: string;

  readonly value: string;
}

/**
 * Reads the option and option-group select lists that back product option assignment.
 *
 * The legacy component declares exactly two functions, so this port declares two methods - not the
 * service-tier transformation at [model/service/OptionService.cfc:L55], and no load, save, delete.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L51-L117]: neither method guards an empty list - no length
 * test, no default, no branch.
 */
export interface OptionRepository {
  // CFML parity [model/dao/OptionDAO.cfc:L51-L92]: the group list is matched with `IN`, so the
  // result is restricted to groups already attached to the product, and the `NOT EXISTS` subquery
  // then drops any option already carried by one of that product's SKUs.
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

  // CFML parity [model/dao/OptionDAO.cfc:L94-L117]: this list is matched with `NOT IN` the
  // opposite of the sibling query because an unused group is one the product does not already
  // carry.
  /**
   * Option groups the product does not already carry.
   *
   * @param existingOptionGroupIDList comma-delimited option group identifiers to exclude.
   * @returns rows ordered by option group name.
   */
  getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<readonly SelectOption[]>;
}
