/**
 * ProductUpdateSkus — the typed input object for the legacy `updateSkus` process context.
 *
 * Ported from [model/process/Product_UpdateSkus.cfc], whose entire body is twelve lines after a
 * 48-line licence header: the component declaration at [:L49], one injected entity at [:L51-L52],
 * four data properties at [:L54-L58], and the closing brace at [:L60]. Two facts about that body
 * govern everything here.
 *
 * Fact one — the component declares zero functions, so this module declares zero methods. There is no
 * behaviour to port: it carries five values and does nothing with them. Per IR-8,
 * `extends="HibachiProcess"` at [:L49] resolves to the local base `model/process/HibachiProcess.cfc`,
 * which is an empty passthrough, so there is no local base behaviour to port either.
 */

import type { ColumnPropertyDescriptor, PropertyDescriptorSet } from '../base/populate';
import type { Product } from '../product/Product';

/*
 * Translation decision — an `interface`, not a `class`, and the reason is technical
 * Guideline 6 requires every technology-specific judgment call to be documented, and this is the
 * first of them. Three arguments point the same way, and the third is decisive — and it is more
 * decisive here than in either sibling, because this is the one process object whose validation
 * genuinely turns on absence.
 */

/*
 * Translation decision — the member names are derived from the framework, not chosen
 * `product` reads like an ordinary field name that a translator might improve — `productEntity`,
 * `target`, `owner`, `parent`, `subject`. It cannot be renamed, because it is not a name anybody
 * picked. It is a mechanical consequence of the producer.
 */

/*
 * Translation decision — the four data properties are `string | number`, and six narrower types
 * were rejected
 * This is the load-bearing judgment call of the file. The legacy declarations give no type at all,
 * so every one of the four is typed as the union of the shapes the system actually delivers. Two
 * shapes are inhabited, both demonstrably:
 *
 * The trimmed-string shape is real and reachable. Population branch 1 assigns request data through
 * the private property helper at [org/Hibachi/HibachiTransient.cfc:L207], and what it assigns is
 * `trim(arguments.data[ currentProperty.name ])` — a trimmed string, never a converted number.
 * (`trim` is applied twice on that path: once at [:L196] for the blank test and again at [:L207]
 * for the value.) The admin form that submits this payload,
 * `admin/views/entity/preprocessproduct_updateskus.cfm`, renders each flag with a yes/no field
 * type and wraps each price in a display toggle keyed on that input, and an HTML control posts a
 * string. So a flag arriving from a form is the string `'1'`.
 */

/*
 * Translation decision — the flags arrive as a string and are compared against a number
 * This is the subtlest hazard in the file, and it is the reason the union above must not be
 * collapsed. The chain has four verified links:
 *
 * 1. The admin form renders both flags with a yes/no field type, so an HTTP request carries the
 * character `1`, not the integer.
 * 2. population assigns the trimmed string [org/Hibachi/HibachiTransient.cfc:L207], so the value
 * the object holds after a form submission is the string `'1'`.
 * 3. `model/validation/Product_UpdateSkus.json` writes each condition as an equality against the
 * number `1`.
 */

/*
 * Translation decision — absence is behaviour: an absent flag leaves its price unvalidated
 * `model/validation/Product_UpdateSkus.json` is fourteen lines and its shape matters more than its
 * size. It declares two conditions, each testing exactly one flag for equality with a single value,
 * and then attaches to each price a single rule gated on its own condition — required, and numeric
 * when present. Neither flag carries a rule of its own; each appears only as a condition input.
 */

/*
 * Ambiguity, flagged and deliberately not resolved (AAP §0.7.3)
 * The consumer tests each flag with a bare truth test:
 * [model/service/ProductService.cfc:L222] `if(arguments.processObject.getUpdatePriceFlag())` and
 * [:L226] the identical form for the list-price flag. With the property unset the generated accessor
 * returns null, and CFML's behaviour for a null condition expression is engine-dependent — Railo and
 * Lucee do not agree with Adobe ColdFusion on it. The unset case is genuinely reachable, because
 * nothing in `model/validation/Product_UpdateSkus.json` makes either flag required; as the block
 * above shows, an absent flag is not a validation failure but simply an unmet condition.
 */

/*
 * Parity note — two consumer facts that belong to the service layer, stated here for accuracy
 * The sole consumer is `processProduct_updateSkus` at [model/service/ProductService.cfc:L216-L233],
 * and AAP §0.4.2.1 marks it "Fully ported" rather than boundary-stubbed — unlike five of that
 * service's fifteen members. So this input object sits on a live path and its typing has real
 * consequences. Two peculiarities of that consumer are recorded here because a reader comparing the
 * three process-object modules will look for them, and because assuming symmetry that has not been
 * verified is how a port goes quietly wrong. Neither is implemented here.
 */

/*
 * Translation decision — this is the only one of the three process objects with its own rules
 * Document, and the asymmetry is not an omission in the other two
 * Stated here because it is easy to misread from either direction, and because the AAP flags it in
 * §0.2.1.5 as "a subtlety that must not be mistaken for an omission".
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
 * Translation decision — the post-construction defaults hook is a no-op here, so nothing is
 * defaulted (contrast proof 1)
 */

/*
 * Translation decision — no presentation metadata is added (contrast proof 2)
 * The yes/no field type on the two flags, cited above as evidence about the shape of posted values,
 * is supplied by the admin view — not by any attribute on any property of this component. The
 * component declares exactly two `hb_`-prefixed attributes and both are resource-bundle keys; there is
 * no form-field-type attribute anywhere in the file.
 */

/** The declared property names of {@link ProductUpdateSkus}, in source declaration order. */
export type ProductUpdateSkusPropertyName =
  'product' | 'updatePriceFlag' | 'price' | 'updateListPriceFlag' | 'listPrice';

/**
 * The input object for the `updateSkus` process context — a product, plus a flag-and-value pair for each
 * of the two prices that may be applied across every one of its SKUs.
 */
export interface ProductUpdateSkus {
  /*
   * Injected Entity — the grouping comment at [model/process/Product_UpdateSkus.cfc:L51], reproduced
   * because it records the framework's own distinction between the entity the producer pushes in and
   * the data a request payload supplies.
   */

  /** The product whose SKUs are being repriced. */
  product?: Product;

  /** Whether the price should be applied to every SKU of the product. */
  updatePriceFlag?: string | number;

  /** The price to apply to every SKU of the product, when its flag is met. */
  price?: string | number;

  /** Whether the list price should be applied to every SKU of the product. */
  updateListPriceFlag?: string | number;

  /** The list price to apply to every SKU of the product, when its flag is met. */
  listPrice?: string | number;
}

/* The five declared properties, in source declaration order, as column descriptors. */
const PRODUCT_UPDATE_SKUS_COLUMN_DESCRIPTORS: readonly ColumnPropertyDescriptor<ProductUpdateSkusPropertyName>[] =
  Object.freeze([
    { name: 'product', valueType: 'untyped' },
    { name: 'updatePriceFlag', valueType: 'untyped' },
    { name: 'price', valueType: 'untyped' },
    { name: 'updateListPriceFlag', valueType: 'untyped' },
    { name: 'listPrice', valueType: 'untyped' },
  ]);

/**
 * The complete population contract for {@link ProductUpdateSkus} — the declared replacement for the
 * legacy runtime metadata walk.
 */
export const PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<
  ProductUpdateSkus,
  ProductUpdateSkusPropertyName
> = Object.freeze({
  /*
   * The legacy `getClassName()` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
   * [model/process/Product_UpdateSkus.cfc:L49] — the bare component name, underscore and all. The CFML
   * file name is `Product_UpdateSkus.cfc`, so `listLast(getClassFullname(), ".")` yields
   * `Product_UpdateSkus` and not the TypeScript class name `ProductUpdateSkus`. It is never consulted
   * for this type — `persistent: false` below short-circuits the authorisation or on its first arm —
   * and is declared anyway so the fact is stated per type rather than inferred from an omission.
   */
  entityName: 'Product_UpdateSkus',

  persistent: false,
  properties: PRODUCT_UPDATE_SKUS_COLUMN_DESCRIPTORS,
});
