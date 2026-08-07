// slatwall-ts - Option select-list and unused-option lookup service.
//
// LEGACY-NOTE [model/service/OptionService.cfc:L82-L96]: the legacy component closes with four
// section banners that are all EMPTY - Process Methods (L82/L84), Save Overrides (L86/L88), Smart
// List Overrides (L90/L92) and Get Overrides (L94/L96).

import type { Option } from '../domain/entities/option.js';
import type { OptionRepository, SelectOption } from '../domain/ports/optionRepository.js';

/**
 * The ported surface of `model/service/OptionService.cfc`.
 *
 * Three PUBLIC METHODS, which is exactly what the legacy component declared: one synchronous
 * projection and two data passthroughs.
 */
export class OptionService {
  // CFML parity [model/service/OptionService.cfc:L51, L53]: both property declarations carry an
  // explicit `type="any"`, exactly as [model/service/BrandService.cfc:L51] and
  // [model/service/RoundingRuleService.cfc:L51] do.

  // LEGACY-NOTE [model/service/OptionService.cfc:L53]: property name="productService" is declared
  // by DI/1 convention but never referenced anywhere in the component.
  //
  // Consequence for the composition root: `src/handlers/bootstrap.ts` must not wire a product
  // service into this constructor.

  /**
   * @param optionRepository Replaces the legacy `property name="optionDAO" type="any";`
   * [model/service/OptionService.cfc:L51], the component's one and only LIVE collaborator.
   */
  constructor(private readonly optionRepository: OptionRepository) {}

  // CFML parity [model/service/OptionService.cfc:L55]: this method sits OUTSIDE every section
  // banner in the legacy component - it is declared at L55-L63, ahead of the first banner
  // (`START: Logical Methods`, L66).

  /**
   * Ported 1:1 from `public array function getOptionsForSelect(required any options)`
   * [model/service/OptionService.cfc:L55-L63].
   *
   * Synchronous, and that is a rule rather than a preference.
   *
   * @param options The options to project.
   * @returns One row per input option, in the SAME ORDER as the input.
   */
  getOptionsForSelect(options: readonly Option[]): SelectOption[] {
    // CFML parity [model/service/OptionService.cfc:L56]: the legacy local is named
    // `sortedOptions`, but nothing is EVER SORTED - the body only appends in input order at L59
    // and returns that array at L62.
    return options.map((option) => ({
      name: option.getOptionName() ?? '',
      value: option.getOptionID(),
    }));
  }

  // The two data passthroughs.
  //
  // CFML parity [model/service/OptionService.cfc:L70, L80]: the legacy section is opened twice and
  // never closed - L70 and L80 both read
  // `// ===================== START: DAO Passthrough ===========================`, and the second
  // was plainly meant to be `END`.

  /**
   * Ported 1:1 from
   * `public array function getUnusedProductOptions(required string productID, required string existingOptionGroupIDList)`
   * [model/service/OptionService.cfc:L72-L74].
   *
   * @param productID The product whose SKUs are checked for options already in use.
   * @param existingOptionGroupIDList A CFML comma-delimited list of option group identifiers to
   * search within.
   * @returns The select rows the query produced, ordered by option group name then option name.
   */
  async getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]> {
    return this.optionRepository.getUnusedProductOptions(productID, existingOptionGroupIDList);
  }

  /**
   * Ported 1:1 from
   * `public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList)`
   * [model/service/OptionService.cfc:L76-L78].
   *
   * @param existingOptionGroupIDList A CFML comma-delimited list of option group identifiers to
   * EXCLUDE.
   * @returns The select rows the query produced, ordered by option group name.
   */
  async getUnusedProductOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]> {
    return this.optionRepository.getUnusedProductOptionGroups(existingOptionGroupIDList);
  }
}
