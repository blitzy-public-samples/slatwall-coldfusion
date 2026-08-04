/**
 * ProductAddOptionGroup — the typed input object for the legacy `addOptionGroup` process context.
 *
 * Ported from [model/process/Product_AddOptionGroup.cfc], whose entire body is nine lines: the component declaration
 * at [:L49], one injected entity at [:L51-L52], one data property at [:L54-L55], and the closing
 * brace at [:L57]. Two facts about that body govern everything here.
 *
 * Fact one — the component declares zero functions, so this module declares zero methods. There is no
 * behaviour to port because the legacy component has none: it carries two values and does nothing with
 * them. Every rule the `addOptionGroup` context obeys lives somewhere else, and each of those places is
 * named below, so a reader who comes here looking for the missing logic learns where it went instead of
 * concluding it was lost.
 */

import type { ColumnPropertyDescriptor, PropertyDescriptorSet } from '../base/populate';
import type { Product } from '../product/Product';

/*
 * Translation decision — an `interface`, not a `class`, and the reason is technical
 * Guideline 6 requires every technology-specific judgment call to be documented, and this is the
 * first of them. Three arguments point the same way, and the third is decisive.
 */

/*
 * Translation decision — the member names are derived from the framework, not chosen
 * `product` reads like an ordinary field name that a translator might improve — `productEntity`,
 * `target`, `owner`, `parent`, `subject`. It cannot be renamed, because it is not a name anybody
 * picked. It is a mechanical consequence of the producer.
 */

/*
 * Translation decision — `optionGroup` is an identifier string, not an `optionGroup` entity
 * This is the load-bearing judgment call of the file. The member is named `optionGroup` and the
 * legacy declaration gives no type, so typing it as the entity of the same name is the obvious
 * reading — and it is wrong. Three independent lines of evidence
 * establish that the value is the option group's 32-character identifier.
 */

/*
 * Translation decision — this object has no validation rule of its own, and that is correct
 * There is no `model/validation/Product_AddOptionGroup.json`. A directory listing filtered for the
 * add-option contexts matches nothing, and the complete product-family set is `Product.json`,
 * `ProductImage.json`, `ProductReview.json`, `ProductType.json`, `Product_AddSubscriptionTerm.json`,
 * `Product_UpdateSkus.json` and `Product_UploadDefaultImage.json`. The AAP flags this in §0.2.1.5
 * as "a subtlety that must not be mistaken for an omission", and it is not one: the sibling
 * `Product_UpdateSkus.cfc` does have its own rules document, so the legacy authors wrote one where
 * they wanted one and pointedly did not here.
 */

/*
 * Translation decision — the transient lifecycle, and why nothing here is memoised (AAP §0.7.3 / M7)
 * [org/Hibachi/Hibachi.cfc:L289-L292] configures the legacy container:
 *
 * Var coreBF = new DI1.ioc("/#variables.framework.applicationKey#/model", {
 * transients=["entity", "process", "transient", "report"],
 * transientPattern="Bean$"
 */

/*
 * Translation decision — the post-construction defaults hook is a no-op here
 * [org/Hibachi/HibachiEntity.cfc:L179] invokes a defaults hook on the freshly built process object,
 * immediately after the entity injection at [:L175]. It would be reasonable to assume that hook seeds
 * something; for this component it does not. The hook is declared at
 * [org/Hibachi/HibachiProcess.cfc:L10-L12] with an empty body whose entire content is the comment
 * "Left Blank To Be Done By Each Process Object", and the only two overrides anywhere under `model/`
 * are [model/process/Order_AddOrderPayment.cfc:L81] and [model/process/Order_CreateReturn.cfc:L64],
 * both in the out-of-scope order domain. `Product_AddOptionGroup.cfc` does not override it.
 */

/** The declared property names of {@link ProductAddOptionGroup}, in source declaration order. */
export type ProductAddOptionGroupPropertyName = 'product' | 'optionGroup';

/**
 * The input object for the `addOptionGroup` process context — a product plus the identifier of the
 * option group to add to it.
 *
 * @example
 * ```ts
 * // Satisfiable with no arguments at all — the producer at
 * // [org/Hibachi/HibachiEntity.cfc:L174-L175] constructs first and assigns second.
 * Const processObject: ProductAddOptionGroup = {};
 * processObject.product = product;
 * ```
 */
export interface ProductAddOptionGroup {
  /*
   * Injected Entity — the grouping comment at [model/process/Product_AddOptionGroup.cfc:L51],
   * reproduced because it records the framework's own distinction between the entity the producer
   * pushes in and the data a request payload supplies.
   */

  /** The product the option group is being added to. */
  product?: Product;

  /* Data properties — the grouping comment at [model/process/Product_AddOptionGroup.cfc:L54]. */

  /** The identifier of the option group to add — a string, not an entity. */
  optionGroup?: string;
}

/* The two declared properties, in source declaration order, as column descriptors. */
const PRODUCT_ADD_OPTION_GROUP_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<ProductAddOptionGroupPropertyName>[] =
  Object.freeze([
    { name: 'product', valueType: 'untyped' },
    { name: 'optionGroup', valueType: 'untyped' },
  ]);

/**
 * The complete population contract for {@link ProductAddOptionGroup} — the declared replacement for
 * the legacy runtime metadata walk.
 */
export const PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<
  ProductAddOptionGroup,
  ProductAddOptionGroupPropertyName
> = Object.freeze({
  /*
   * The legacy `getClassName()` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
   * [model/process/Product_AddOptionGroup.cfc:L49] — the bare component name, underscore and all. The CFML file name is
   * `Product_AddOptionGroup.cfc`, so `listLast(getClassFullname(), ".")` yields `Product_AddOptionGroup` and
   * not the TypeScript class name `ProductAddOptionGroup`. The legacy spelling is carried because it is
   * what arm 3 of the population gate would have been keyed by
   * [org/Hibachi/HibachiTransient.cfc:L190].
   */
  entityName: 'Product_AddOptionGroup',

  persistent: false,
  properties: PRODUCT_ADD_OPTION_GROUP_COLUMN_DESCRIPTORS,
});
