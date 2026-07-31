// ---------------------------------------------------------------------------
// slatwall-ts - Product entity
//
// PORT OF model/entity/Product.cfc (841 lines, confirmed by `wc -l`).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/Product.cfc:L49]
//
//   component displayname="Product" entityname="SlatwallProduct" table="SwProduct"
//   persistent="true" extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="productService" hb_permission="this"
//   hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm" {
//
// Schema continuity is a binding constraint: entity property metadata IS the contract. Table
// `SwProduct`, entity name `SlatwallProduct`. No migration, no rename, no new table, no column
// change. Every `hb_*` attribute value is carried forward verbatim so the legacy admin can still
// resolve it - including `hb_processContexts`, whose four values name the four process objects the
// admin can drive against a product. Three of those four are in scope
// (`Product_UpdateSkus`, `Product_AddOptionGroup`, `Product_AddOption`); `addSubscriptionTerm` is
// not, and that asymmetry is recorded rather than tidied out of the attribute.
//
// ★ WHY THIS ENTITY IS THE CENTRE OF THE SLICE. It is the aggregate root of the catalog half of the
// migration. It owns the SKU collection the promotion engine prices, it is the join point between
// `Brand`, `ProductType`, `Category` and `Option`, it carries the ONE entity method with legacy test
// coverage (`getProductURL()`, pinned by meta/tests/unit/entity/ProductTest.cfc), and it is named
// directly in the must-preserve list through `getSkuBySelectedOptions()` /
// `getSkusBySelectedOptions()` - the entity-side face of
// `ProductService.getProductSkusBySelectedOptions()`.
//
// THE ASSOCIATION CENSUS, receiver-qualified against every `arrayAppend`/`arrayDeleteAt` site in
// model/entity/*.cfc. This is the project's ONE association-ownership rule and it is mechanical, not
// a judgment call: an accessor returns the LIVE mutable array iff some entity mutates it IN PLACE
// THROUGH that accessor with the receiver resolving to a product. The census command was
//
//   grep -rnE "array(Append|DeleteAt)\(\s*(arguments\.)?product\.get" model/ integrationServices/
//
// and it returns twenty-two hits over eleven accessors; the three remaining collections return no
// hit at all.
//
//   | locator | property                      | fieldtype             | accessor | mutated at |
//   |---------|-------------------------------|-----------------------|----------|------------|
//   | L73     | skus                          | one-to-many           | LIVE     | Sku.cfc:L607, L616 |
//   | L74     | productImages                 | one-to-many           | LIVE     | Image.cfc:L158, L167 |
//   | L75     | attributeValues               | one-to-many           | LIVE     | AttributeValue.cfc:L242, L251 |
//   | L76     | productReviews                | one-to-many           | LIVE     | ProductReview.cfc:L117, L126 |
//   | L79     | listingPages                  | many-to-many owner    | readonly | (no site)  |
//   | L80     | categories                    | many-to-many owner    | readonly | (no site)  |
//   | L81     | relatedProducts               | many-to-many owner    | readonly | (no site)  |
//   | L84     | promotionRewards              | many-to-many inverse  | LIVE     | PromotionReward.cfc:L263, L273 |
//   | L85     | promotionRewardExclusions     | many-to-many inverse  | LIVE     | PromotionReward.cfc:L363, L373 |
//   | L86     | promotionQualifiers           | many-to-many inverse  | LIVE     | PromotionQualifier.cfc:L205, L215 |
//   | L87     | promotionQualifierExclusions  | many-to-many inverse  | LIVE     | PromotionQualifier.cfc:L305, L315 |
//   | L88     | priceGroupRates               | many-to-many inverse  | LIVE     | PriceGroupRate.cfc:L224, L234 |
//   | L89     | vendors                       | many-to-many inverse  | LIVE     | Vendor.cfc:L158, L168 |
//   | L90     | physicals                     | many-to-many inverse  | LIVE     | Physical.cfc:L164, L174 |
//
// FOUR ROWS DESERVE COMMENT, BECAUSE THEY LOOK WRONG AND ARE NOT.
//
//   * `listingPages` is `readonly` even though this entity OWNS the link table and hand-writes
//     `addListingPage`/`removeListingPage` [L712-L730]. Those helpers mutate the PRIVATE FIELD
//     directly (`arrayAppend(variables.listingPages, ...)`), never `getListingPages()`, and no other
//     entity reaches in - model/entity/Content.cfc declares the `listingProducts` inverse at its L75
//     but hand-writes no helper pair for it. Private storage mutable, accessor `readonly`: exactly
//     what the rule prescribes.
//   * `categories` is `readonly` and has NO helper pair at all, on EITHER side. This entity declares
//     the owning `categories` many-to-many at L80 and then never writes an `addCategory`; verified by
//     grep, model/entity/Category.cfc declares no `addProduct`, no `removeProduct` and no
//     `hasProduct`. The link table `SwProductCategory` is therefore only ever written by the ORM
//     through `populate()`. Recorded because the absence is easy to mistake for an omission here.
//   * `relatedProducts` is SELF-REFERENTIAL (`SwRelatedProduct`, `Product` on both ends) and also
//     helper-free. It is materialized and exposed `readonly`; the self-reference is why the field is
//     typed `Product[]` and why nothing in this class walks it.
//   * `vendors` and `physicals` ARE materialized here, whereas src/domain/entities/brand.ts
//     deliberately materializes NEITHER. That is not an inconsistency, it is the census speaking: no
//     entity mutates `brand.getVendors()` or `brand.getPhysicals()`, so brand.ts could omit both
//     accessors and keep only the delegating helpers, while model/entity/Vendor.cfc:L158 and
//     model/entity/Physical.cfc:L164 DO mutate `product.getVendors()` and `product.getPhysicals()`
//     in place. An accessor that a far side appends to cannot be omitted. Both far-side types are
//     out of scope and outside the eighteen-file entity budget, so both are typed by the module-local
//     projections {@link ProductVendorLink} and {@link ProductPhysicalLink} rather than by an entity
//     class this port does not author.
//
// TWELVE CONTAINMENT PROBES ARE AUTHORED, AND EVERY ONE HAS A REAL CALLER. Eleven are called by a
// far side's owning-side helper - `hasSku` [Sku.cfc:L605], `hasProductImage` [Image.cfc:L156],
// `hasAttributeValue` [AttributeValue.cfc:L240], `hasProductReview` [ProductReview.cfc:L115],
// `hasPriceGroupRate` [PriceGroupRate.cfc:L222], `hasPromotionReward` [PromotionReward.cfc:L261],
// `hasPromotionRewardExclusion` [PromotionReward.cfc:L361], `hasPromotionQualifier`
// [PromotionQualifier.cfc:L203], `hasPromotionQualifierExclusion` [PromotionQualifier.cfc:L303],
// `hasVendor` [Vendor.cfc:L156] and `hasPhysical` [Physical.cfc:L162] - and the twelfth,
// `hasListingPage`, is called by THIS class's own `addListingPage` [L713]. No aggregate `hasAnyXXX`
// probe is authored, because no in-scope caller invokes one against a product: the promotion engine's
// four aggregate calls [PromotionService.cfc:L885, L914, L951, L980] all target a REWARD or a
// QUALIFIER, never a product.
//
// TWELVE DISTINCT DEFECTS LIVE IN THIS COMPONENT. Eleven are reproduced; ONE is fixed as a
// documented deliberate divergence because the AAP directs it. Each is marked at its site.
//
//   D1  L227-L239  `getProductRating()` averages the FIRST review's rating N times - it indexes
//                  `getProductReviews()[1]` inside a loop counted by `i`. The returned average is
//                  therefore always review #1's rating, whatever the others say. It also re-declares
//                  `var totalRatingPoints` INSIDE the loop with `+=`.
//   D2  L191-L197  `getPageIDs()` calls `getPages()`, which does not exist - the property is
//                  `listingPages` [L79]. RAISES.
//   D3  L173       `getTemplateOptions()` calls `getService("ProductService").getProductTemplates()`,
//                  which is declared NOWHERE in the repository. RAISES.
//   D4  L184-L190  `getTemplate()`'s first branch is DEAD: it tests `variables.template`, but
//                  `template` is not a declared property of this component and nothing assigns it.
//   D5  L534-L538  `getBrandOptions()` is a NO-OP OVERRIDE - it writes `rbKey('define.none')` into
//                  the row the framework already prepended with that exact value.
//   D6  L272-L315  `getImageGalleryArray()` assigns the image DESCRIPTION to the `name` key
//                  [L303-L305], leaving `description` empty; and it dedupes the two loops against ONE
//                  shared list using two DIFFERENT keys - image FILENAME in the sku loop [L272] and
//                  image ID in the alternate-image loop [L289].
//   D7  L479-L484  `getQuantity()`'s `locationID` branch computes its value and DISCARDS it - the
//                  statement has no `return` - so that branch always falls through to `return 0`.
//   D8  L594-L602  `getSalePrice()`'s second branch evaluates `getSkus()[1].getSalePrice();` with no
//                  `return`, so a product with skus but no default sku always answers `0`.
//   D9  L614-L622  `getSalePriceExpirationDateTime()` calls `getSalePricExpirationDateTime()` on the
//                  default sku - missing the `e` - while model/entity/Sku.cfc:L560 declares the
//                  correctly-spelled method. RAISES on the `returntype="date"` coercion.
//   D10 L631-L633  `getProductOptionsByGroup()` calls `getProductService()`, which is defined
//                  nowhere. RAISES.
//   D11 L556       `getAllowBackorderFlag()` declares `returntype="numeric"` and returns the BOOLEAN
//                  setting `skuAllowBackorderFlag`; the matching non-persistent property at L103 is
//                  declared `type="boolean"`. Two of the three disagree.
//   D12 L524-L532  `getBrandName()` POISONS ITS OWN MEMO - it writes `variables.brandName = ""` and
//                  then returns the computed name WITHOUT storing it, so every call after the first
//                  answers `""`. ★ THIS IS THE ONE FIXED DEFECT; see the method for the AAP citation
//                  and for why the AAP's stated rationale is corrected rather than repeated.
//
// FIVE SECONDARY ITEMS are recorded at their sites and are not counted above: the
// `singlularname="productReview"` typo in the L76 property ATTRIBUTE NAME itself; the unguarded
// `getBaseProductType()` dereference [L493]; the unscoped `quantityType` / `stockID` reads inside
// `getQuantity()` [L458-L459, L466]; the two typo'd keys `retrictgroups` and `targetPrams` in
// `getCrumbData()`'s returned struct [L387, L392], which are Mura DATA CONTRACT keys and are
// therefore preserved byte-for-byte; and - S5, found while porting the helper block rather than while
// reading the property block - the two `isNew()` disjuncts in `addListingPage()` [L713, L716] are
// SWAPPED relative to every other many-to-many owner in the tree, which moves the duplicate-admitting
// case from "the argument is unsaved" onto "THIS PRODUCT is unsaved" - the common path in the admin.
// It is a secondary item rather than a numbered defect because it changes duplicate handling on a
// multi-add rather than a returned value; see `addListingPage` for the full argument.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines), whose own L49
// reads `component output="false" accessors="true" persistent="false"
// extends="Slatwall.org.Hibachi.HibachiEntity"`. That intermediate class is where `setting()` [L129],
// `populate()` [L56] and `getAttributeValue()` [L151] actually live, and 112 of the 113 components
// under model/entity/ pass through it. Neither level is ported: an entity reaching outward through a
// service locator is exactly the pattern the ESLint `no-restricted-imports` layer boundary exists to
// make impossible. This component has TWENTY-ONE `getService(` sites of its own, and every one
// becomes either a constructor-materialized value, an injected narrow port, or a documented
// non-port - never a direct import. That is transformation rule T2.
//
// ★ AND THE INTERMEDIATE CLASS IS WHAT MAKES D2, D3, D9 AND D10 FAIL THE WAY THEY DO. The framework
// dispatcher [org/Hibachi/HibachiEntity.cfc:L507-L565] tries eleven prefix/suffix conventions and
// then, as its LAST branch [L559-L561], falls back to `getAttributeValue(<rest of the name>)` for any
// unmatched `getXXX` - but only when the entity declares an `attributeValues` property. Product
// declares one at L75, so `getPages()`, `getProductService()` and Sku's
// `getSalePricExpirationDateTime()` all reach that fallback and receive the EMPTY STRING
// [model/entity/HibachiEntity.cfc:L151] instead of the L565 throw. The failure then happens one step
// later - `arrayLen("")`, `"".getProductOptionsByGroup()`, `returntype="date"` coercion - which is
// why each of those methods raises with a DIFFERENT message than a plain missing-method error. The
// fallback is `get`-only, so an unmatched `addXXX`/`removeXXX` still reaches the L565 throw.
//
// SMART LISTS ARE NOT PORTED, BY EXPLICIT PLAN DECISION, and this component has more of them than
// any other in-scope entity: `getProductTypeOptions()` [L125-L143],
// `getListingPagesOptionsSmartList()` [L145-L152], `getOptionGroups()` [L250-L259],
// `getOptionsByOptionGroup()` [L339-L346], `getDefaultProductImageFiles()` [L497-L514],
// `getBrandOptions()` [L534-L538], `getAssignedAttributeSetSmartList()` [L795-L822] and the
// deprecated `getAttributeSets()` [L832-L838]. Reproducing `HibachiSmartList` - a generic,
// string-keyed, dynamically-filtered query builder - would import exactly the framework coupling this
// refactor exists to remove and would be untypeable under the strict profile. THE DECISION IS NOT
// UNIFORM, AND THE DIVIDING LINE IS STATED ONCE HERE SO IT IS AUDITABLE:
//
//   * WHERE THE SMART LIST ONLY RE-QUERIES DATA THIS ENTITY ALREADY HOLDS, the method is PORTED and
//     computed in memory from the materialized graph. That covers `getOptionGroups()`,
//     `getOptionsByOptionGroup()` and `getDefaultProductImageFiles()`, each of which filters on
//     `...product.productID = this.getProductID()` and reads nothing the graph does not contain.
//   * WHERE THE SMART LIST REACHES BEYOND THIS PRODUCT, the ROWS are materialized at construction
//     and this entity performs only its own contribution - the projection and the filtering. That
//     covers `getProductTypeOptions()` and `getBrandOptions()`, and it follows
//     `ProductType.getParentProductTypeOptions()` and `PriceGroup.getParentPriceGroupOptions()`.
//   * WHERE THE SMART LIST IS THE ENTIRE BEHAVIOUR AND ITS CONSUMER IS OUT OF SCOPE, the method is
//     RECORDED AT ITS LOCATOR AND NOT PORTED. That covers `getListingPagesOptionsSmartList()`,
//     `getAssignedAttributeSetSmartList()` and `getAttributeSets()`.
//
// SIX METHODS REACH SUBSYSTEMS THE AAP EXCLUDES OUTRIGHT and are ported as DOCUMENTED THROWING STUBS
// rather than silently dropped or given a plausible default: `getEstimatedReceivalDetails()` and
// `getEstimatedReceivalDates()` (stockService), `getQuantity()` and `getQATS()` (inventoryService),
// `getUnusedProductSubscriptionTerms()` (subscriptionService), and `getTransactionExistsFlag()` -
// which is the one exception, because `SkuDAO.getTransactionExistsFlag` [model/dao/SkuDAO.cfc:L53] IS
// in scope and is reached through a narrow injected port instead. A throwing stub keeps the public
// surface complete and the failure DETECTABLE; a default would hand a caller a well-formed wrong
// number, and quantity numbers drive purchasing decisions.
//
// VALIDATION: model/validation/Product.json EXISTS and is one of the twelve in-scope schemas, as does
// model/validation/Product_UpdateSkus.json with its conditional requiredness. Both are ported as
// typed zod schemas by the owner of the validation tier; this class carries no validator method,
// exactly as the source carries none.
//
// TEST COVERAGE: ★ THIS IS ONE OF ONLY TWO MODULES IN THE PORT WITH A LEGACY ANTECEDENT.
// meta/tests/unit/entity/ProductTest.cfc contributes `productUrlIsCorrectlyFormatted()`, which
// asserts `getProductURL()` equals `/<globalURLKeyProduct>/nike-air-jorden/` with that fixture
// spelling retained verbatim, plus the four cases inherited from
// meta/tests/unit/entity/SlatwallEntityTestBase.cfc. Everything else on this class is NET-NEW
// coverage and is labelled as such rather than presented as parity;
// meta/tests/functional/admin/entity/ProductTest.cfc is an EMPTY STUB and contributes nothing.
//
// NO USER RULES WERE PROVIDED. The enterprise substitute standard applies at full strength - maximal
// strictness, no `any` and no suppression comment, one exported unit per file, no barrel, and every
// judgment call annotated where it was made.
// ---------------------------------------------------------------------------

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { cfBoolean, cfLen } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { SalePriceDetail } from '../ports/promotionRepository.js';
import { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Category } from './category.js';
import type { Option } from './option.js';
import type { OptionGroup } from './optionGroup.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { ProductType } from './productType.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';
import type { Sku } from './sku.js';

/**
 * The keys the legacy passes through `argumentCollection` when it asks for a resized image.
 * [model/entity/Sku.cfc:L192-L219], [model/entity/Image.cfc:L120]
 *
 * NEITHER LEGACY METHOD DECLARES A SINGLE ARGUMENT. Both are written as `public string function
 * getResizedImagePath()` and then read `arguments` dynamically, so the argument contract exists only
 * as the union of what call sites pass and what bodies read. The keys below are exactly that union,
 * derived from three places: `getImageGalleryArray()` passes `{size:'s'|'m'|'l'}`
 * [model/entity/Product.cfc:L266], the deprecated size branch reads `size`, `width` and `height`
 * [model/entity/Sku.cfc:L200-L214], and the surrounding body reads `alt`, `resizeMethod` and
 * `missingImagePath` [model/entity/Sku.cfc:L195-L198, L212].
 *
 * Every key is OPTIONAL, because in CFML every one of them is tested with `structKeyExists` before
 * being read. A `type` alias rather than an `interface`, for the reason recorded on
 * {@link ImageGalleryEntry}.
 */
type ImageResizeOptions = {
  readonly size?: string;
  readonly width?: number;
  readonly height?: number;
  readonly alt?: string;
  readonly resizeMethod?: string;
  readonly missingImagePath?: string;
};

/**
 * The far side of the `productImages` one-to-many. [model/entity/Product.cfc:L74]
 *
 * `model/entity/Image.cfc` is OUT OF SCOPE - the image subsystem is excluded and `Image` is not one
 * of the eighteen entity modules - but the collection cannot be dropped, because
 * [model/entity/Image.cfc:L158] appends into `product.getProductImages()` IN PLACE. An accessor a far
 * side mutates has to exist. So the rows are typed by this projection instead of by an entity class
 * this port does not author.
 *
 * THE SEVEN MEMBERS ARE EXACTLY WHAT THIS CLASS INVOKES, no more:
 *   * `getImageID()` - the dedupe key of the alternate-image loop [model/entity/Product.cfc:L289].
 *   * `getImageFile()`, `getImagePath()`, `getResizedImagePath()` - the three values that loop copies
 *     into a gallery entry [L290-L291, L310].
 *   * `getImageName()`, `getImageDescription()` - both read behind an `isNull` guard [L296-L305].
 *   * `setProduct()` / `removeProduct()` - what `addProductImage`/`removeProductImage` delegate to
 *     [L687, L690].
 */
interface ProductImageLink {
  getImageID(): string;
  getImageFile(): string | undefined;
  getImagePath(): string;
  getImageName(): string | undefined;
  getImageDescription(): string | undefined;
  getResizedImagePath(options?: ImageResizeOptions): string;
  setProduct(product: Product): void;
  removeProduct(product: Product): void;
}

/**
 * The far side of the `attributeValues` one-to-many. [model/entity/Product.cfc:L75]
 *
 * The EAV subsystem is out of scope, but the same rule applies as for {@link ProductImageLink}:
 * [model/entity/AttributeValue.cfc:L242] appends into `product.getAttributeValues()` in place, so the
 * collection stays. TWO MEMBERS ONLY - `addAttributeValue`/`removeAttributeValue`
 * [model/entity/Product.cfc:L680, L683] delegate outward and read nothing off the row.
 *
 * ★ THIS PROPERTY IS ALSO WHAT MAKES FOUR OF THIS COMPONENT'S DEFECTS FAIL LATE RATHER THAN EARLY -
 * see the note on the dispatcher fallback in the file header. Its mere PRESENCE changes what an
 * unmatched `getXXX()` returns.
 */
interface ProductAttributeValueLink {
  setProduct(product: Product): void;
  removeProduct(product: Product): void;
}

/**
 * The far side of the `productReviews` one-to-many. [model/entity/Product.cfc:L76]
 *
 * ★ AND NOTE THE SOURCE ATTRIBUTE ITSELF IS MISSPELLED, verbatim:
 *
 *   property name="productReviews" singlularname="productReview" cfc="ProductReview" ...
 *
 * `singlularname` should be `singularname`. This is not a value typo, it is a typo in the ATTRIBUTE
 * NAME, so the framework never sees a singular name for this collection at all and the ORM-generated
 * `addProductReview`/`removeProductReview` pair is not what a correctly-spelled declaration would
 * have produced. It does not matter in practice only because this class hand-writes both helpers
 * [L702-L707]. Recorded because it is invisible unless read character by character, and preserved
 * because attribute metadata is schema-adjacent contract.
 *
 * THREE MEMBERS: the two delegation targets, plus `getRating()` - read by `getProductRating()`
 * [L233], which is where defect D1 lives.
 */
interface ProductReviewLink {
  getRating(): number;
  setProduct(product: Product): void;
  removeProduct(product: Product): void;
}

/**
 * The far side of the `listingPages` many-to-many. [model/entity/Product.cfc:L79]
 *
 * `model/entity/Content.cfc` is out of scope (the CMS bridge is excluded), yet all three members are
 * genuinely required, because `addListingPage`/`removeListingPage` [L712-L730] are the only
 * hand-written OWNER-side helpers on this class and they reach across:
 *   * `isNew()` and `hasListingProduct()` form the far-side guard [L716].
 *   * `getListingProducts()` is the LIVE inverse collection both helpers splice
 *     [L717, L727-L729]; `Content` declares it at [model/entity/Content.cfc:L75].
 */
interface ListingPageLink {
  isNew(): boolean;
  hasListingProduct(product: Product): boolean;
  getListingProducts(): Product[];
}

/**
 * The far side of the `vendors` many-to-many inverse. [model/entity/Product.cfc:L89]
 *
 * The vendor module is excluded outright by the plan, so `Vendor` is not authored - but
 * [model/entity/Vendor.cfc:L158] appends into `product.getVendors()` in place, so this collection is
 * materialized and its accessor is LIVE. `getVendorID()` backs `hasVendor()`; the two helpers back
 * `addVendor`/`removeVendor` [L771-L776].
 */
interface ProductVendorLink {
  getVendorID(): string;
  addProduct(product: Product): void;
  removeProduct(product: Product): void;
}

/**
 * The far side of the `physicals` many-to-many inverse. [model/entity/Product.cfc:L90]
 *
 * Structurally identical to {@link ProductVendorLink} and still declared separately for the reason
 * brand.ts records: these describe two DIFFERENT link tables (`SwVendorProduct` and
 * `SwPhysicalProduct`) on two different owning entities, and collapsing them would erase which
 * locator a reviewer is meant to check. Helpers at [L779-L784].
 */
interface ProductPhysicalLink {
  getPhysicalID(): string;
  addProduct(product: Product): void;
  removeProduct(product: Product): void;
}

/**
 * ★ THE F11-RELOCATED SALE-PRICE COLLABORATOR. Replaces
 * `getService("promotionService").getSalePriceDetailsForProductSkus(productID=getProductID())`
 * [model/entity/Product.cfc:L519] under transformation rule T2.
 *
 * THIS CONTRACT USED TO BE EXPORTED FROM `src/domain/ports/promotionRepository.ts` AND WAS MOVED
 * HERE DELIBERATELY. The AAP locks the port inventory at THIRTEEN exported contracts under
 * `src/domain/ports/`, and the inventory counts EXPORTED CONTRACTS rather than files, so a
 * fourteenth exported collaborator interface was a budget violation wherever it sat - co-location
 * does not make an exported contract invisible to the budget. The relocation note left behind at
 * src/domain/ports/promotionRepository.ts records the move from the other end, so the pair is
 * auditable in both directions. Same treatment as `SkuPriceGroupResolver` (relocated into
 * src/domain/entities/sku.ts) and `RoundingRuleValueRounder` (relocated into
 * src/domain/entities/roundingRule.ts).
 *
 * NOTHING ELSE CHANGED BY MOVING IT. It still has no adapter file of its own, and
 * `src/handlers/bootstrap.ts` still satisfies it STRUCTURALLY by adapting the ported
 * `src/services/promotionService.ts` surface - which is where `getSalePriceDetailsForProductSkus`
 * itself lives [model/service/PromotionService.cfc:L1022] - and injecting the result at
 * construction. Structural satisfaction needs no exported name to import.
 *
 * `SalePriceDetail` is NOT relocated and IS still imported from the port module: it is a read
 * projection named directly in the ported signature (AAP 0.4.2), so it belongs to this slice's
 * sanctioned published vocabulary rather than being an extra collaborator port.
 *
 * ASYNC, because the legacy body reaches the DAO through the service - that is the whole async
 * boundary rule, applied.
 */
interface SalePriceResolver {
  getSalePriceDetailsForProductSkus(productID: string): Promise<Record<string, SalePriceDetail>>;
}

/**
 * The three in-scope repository-backed lookups this entity reaches for, gathered into ONE
 * module-local port.
 *
 * They share a contract for the reason `ProductTypeHydrationSupport` gives in
 * src/domain/entities/productType.ts: all three are query-backed lookups that the same composition
 * root satisfies from the same repositories, and a separate interface per method would add three
 * names without adding a distinction. Declared module-local and UN-EXPORTED, per the
 * thirteen-exported-port budget.
 *
 * WHY THESE THREE AND NOT THE OTHER OUTWARD REACHES. Each one lands on a DAO method the plan
 * explicitly keeps in scope, so a narrow port is the faithful T2 translation rather than a
 * concession:
 *   * `ProductService.getProductSkusBySelectedOptions` [model/service/ProductService.cfc:L104],
 *     backed by `SkuDAO.getSkusBySelectedOptions` [model/dao/SkuDAO.cfc:L107] - a MUST-PRESERVE
 *     behaviour.
 *   * `OptionService.getUnusedProductOptions` / `getUnusedProductOptionGroups`
 *     [model/service/OptionService.cfc:L72, L76], backed by `OptionDAO.cfc:L51, L94`.
 *   * `SkuService.getTransactionExistsFlag` [model/service/SkuService.cfc:L285], backed by
 *     `SkuDAO.getTransactionExistsFlag` [model/dao/SkuDAO.cfc:L53].
 * Everything else this component reaches for lands in an EXCLUDED subsystem, which is why those
 * become throwing stubs instead of members here.
 */
interface ProductQuerySupport {
  /**
   * [model/entity/Product.cfc:L367] verbatim:
   * `getService("productService").getProductSkusBySelectedOptions(arguments.selectedOptions,
   * this.getProductID())`.
   *
   * ★ THE POSITIONAL ARGUMENT ORDER IS THE SOURCE'S, not alphabetical and not tidied: the selected
   * options come FIRST and the product ID SECOND, matching both the call site and the declaration at
   * [model/service/ProductService.cfc:L104].
   */
  getProductSkusBySelectedOptions(selectedOptions: string, productID: string): Promise<Sku[]>;

  /**
   * [model/entity/Product.cfc:L637] `getService('optionService').getUnusedProductOptions(
   * getProductID(), structKeyList(getOptionGroupsStruct()) )`.
   *
   * The second parameter stays a COMMA LIST rather than becoming an array, for signature parity with
   * [model/service/OptionService.cfc:L72] - the list stays a string right up to the query layer and
   * becomes an array exactly once, at `listToArray` inside the repository.
   */
  getUnusedProductOptions(productID: string, existingOptionGroupIDList: string): Promise<Option[]>;

  /**
   * [model/entity/Product.cfc:L644] `getService('optionService').getUnusedProductOptionGroups(
   * structKeyList(getOptionGroupsStruct()) )`.
   *
   * ★ NOTE THIS ONE TAKES NO PRODUCT ID. The legacy passes only the option-group list, so the answer
   * is "every option group not in this list" across the WHOLE catalog rather than anything scoped to
   * this product. That is the source's behaviour and the signature preserves it.
   */
  getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<OptionGroup[]>;

  /**
   * [model/entity/Product.cfc:L627] `getService("skuService").getTransactionExistsFlag(
   * productID=this.getProductID() )`.
   */
  getTransactionExistsFlag(productID: string): Promise<boolean>;
}

/**
 * The one resource-bundle label this entity needs resolved.
 *
 * JavaRB IS NOT PORTED (AAP 0.5.3), and the project policy is to emit the key verbatim as a constant
 * where the key itself is the contract, or to inject an already-resolved label where the VALUE flows
 * into returned data a consumer renders. `getBrandOptions()` [model/entity/Product.cfc:L536] is the
 * second case: `rbKey('define.none')` becomes the visible text of a select row, so a raw key string
 * would surface in an admin dropdown.
 *
 * ONE MEMBER, because this component calls `rbKey` exactly once. Declared module-local and
 * UN-EXPORTED, matching `PromotionRewardLabelProvider` in src/domain/entities/promotionReward.ts and
 * `CurrencyValueFormatter` in src/domain/entities/priceGroupRate.ts.
 */
interface ProductLabelProvider {
  /** `rbKey('define.none')` [model/entity/Product.cfc:L536]. */
  getNoneOptionLabel(): string;
}

/**
 * A single `{name, value}` row of the brand select. [model/entity/Product.cfc:L534-L538]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is NOT assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no
 * implicit index signature, whereas a type alias IS. Recorded the same way on
 * `ParentProductTypeOption` in src/domain/entities/productType.ts and `ParentPriceGroupOption` in
 * src/domain/entities/priceGroup.ts. The two keys are the framework's own
 * [org/Hibachi/HibachiEntity.cfc:L375-L417] `alias="name"` / `alias="value"` pair, reproduced
 * verbatim rather than renamed.
 */
type BrandOption = {
  readonly name: string;
  readonly value: string;
};

/**
 * A single `{name, value}` row of the product-type select. [model/entity/Product.cfc:L139]
 *
 * Structurally identical to {@link BrandOption} and deliberately a separate name: the two rows are
 * built by different bodies from different sources - this one from
 * `records[i].getSimpleRepresentation()` / `records[i].getProductTypeID()` [L139], the other from a
 * framework-generated projection - and collapsing them would erase which locator produced which.
 */
type ProductTypeOption = {
  readonly name: string;
  readonly value: string;
};

/**
 * One entry of the image gallery. [model/entity/Product.cfc:L265-L316]
 *
 * ★ `skuID` IS OPTIONAL BECAUSE THE TWO LOOPS BUILD DIFFERENT SHAPES, and that asymmetry is the
 * source's, not this port's. The sku loop [L269-L286] sets six keys and NO `skuID`; the
 * alternate-image loop [L288-L314] sets the same six PLUS `skuID = ""` [L295]. A CFML struct has no
 * declared shape so the difference is invisible there; in TypeScript it has to be expressed, and an
 * optional key is the honest expression. Normalising both branches to carry `skuID` would hand
 * consumers a key the legacy never emitted for sku-default images.
 *
 * A `type` alias rather than an `interface`, for the index-signature reason recorded on
 * {@link BrandOption}.
 */
type ImageGalleryEntry = {
  readonly originalFilename: string | undefined;
  readonly originalPath: string;
  readonly type: 'skuDefaultImage' | 'productAlternateImage';
  readonly skuID?: string;
  readonly productID: string;
  readonly name: string;
  readonly description: string;
  readonly resizedImagePaths: readonly string[];
};

/**
 * The Mura breadcrumb row `getCrumbData()` returns. [model/entity/Product.cfc:L371-L397]
 *
 * ★ EVERY KEY IS SPELLED EXACTLY AS THE SOURCE SPELLS IT, TYPOS INCLUDED. This struct is handed
 * straight to the Mura CMS bridge, so the key names are a DATA CONTRACT and correcting them would
 * break the consumer:
 *   * `retrictgroups` [L387] is missing its first `s` - it is meant to be `restrictgroups`.
 *   * `targetPrams` [L392] is missing its `a` - it is meant to be `targetParams`.
 *   * `siteid` [L389] is lower-case `id` while `contentID`, `parentID` and `contentHistID` are
 *     upper-case. All four spellings are preserved as written.
 *
 * A NOTE ON CFML STRUCT-KEY CASING, so a reviewer is not surprised: an unquoted struct literal key
 * is stored UPPER-CASE by the CFML engine, and Mura reads it case-insensitively, so the source's
 * mixed casing is invisible at runtime there. TypeScript keys are case-sensitive, so this port
 * preserves the SOURCE SPELLING - the form a reader of the CFC sees - rather than the engine's
 * internal upper-casing.
 *
 * `parentArray` is carried as `unknown` because the source copies it straight through from
 * `arguments.baseCrumbArray[1].parentArray` [L379] and never reads inside it; inventing a shape for
 * it would be inventing a contract.
 */
type ProductCrumbData = {
  readonly contentHistID: string;
  readonly contentID: string;
  readonly filename: string;
  readonly inheritobjects: string;
  readonly menuTitle: string;
  readonly metaDesc: string;
  readonly metaKeywords: string;
  readonly parentArray: unknown;
  readonly parentID: string;
  readonly restricted: number;
  readonly retrictgroups: string;
  readonly siteid: string;
  readonly sortby: string;
  readonly sortdirection: string;
  readonly target: string;
  readonly targetPrams: string;
  readonly template: string;
  readonly type: string;
};

/**
 * One element of the `baseCrumbArray` argument. [model/entity/Product.cfc:L369, L379]
 *
 * ONE MEMBER, because the body reads exactly one: `arguments.baseCrumbArray[1].parentArray`. Nothing
 * else about the caller's crumb rows is derivable from the source, so nothing else is declared.
 */
type BaseCrumbEntry = {
  readonly parentArray: unknown;
};

/**
 * `SwProduct` - the catalog aggregate root.
 *
 * A CLASS RATHER THAN AN INTERFACE, because the legacy component carries real behaviour and not just
 * data: option-to-SKU resolution [model/entity/Product.cfc:L349-L368], the option-group derivation
 * [L250-L259], the weighted SKU ordering it delegates for [L155-L159], the gallery assembly
 * [L265-L316] and eight price delegations [L554-L602] are all methods, and several of them are named
 * in the must-preserve list. Collapsing them into free functions would break interface parity, which
 * is the acceptance contract.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so every association arrives already populated and the fetch
 * shape is a documented decision at the repository method that produced it. AN EMPTY COLLECTION IS
 * THEREFORE A FETCH-SHAPE STATEMENT, NOT A DOMAIN CLAIM - it says the repository did not ask for
 * those rows, never that the product has none.
 *
 * THE SYNC/ASYNC BOUNDARY IS THE PLAN'S RULE, APPLIED MECHANICALLY: a method is `async` iff its
 * legacy body reaches the DAO or ORM. Four do - `getSkusBySelectedOptions`,
 * `getSkuBySelectedOptions`, `getSalePriceDetailsForSkus` (and `getSkuSalePriceDetails` through it),
 * `getTransactionExistsFlag`, `getUnusedProductOptions` and `getUnusedProductOptionGroups`.
 * Everything else traverses already-materialized state or is pure arithmetic and stays synchronous,
 * INCLUDING the three in-memory smart-list ports, whose legacy bodies queried but whose data the
 * graph already holds.
 *
 * ALL MONEY IS `Money`. `calculatedSalePrice` is a `big_decimal` column [L62] and the six price
 * delegators [L554-L602] all return currency, so none of them touches a float. Persisting goes
 * through `Money.toDecimalString()`, never `toFixed2()`, which is presentation-only.
 *
 * WHICH MEMBERS CAN THROW, enumerated so no caller is surprised - the dividing line throughout this
 * port is whether the return type has a spare value to spend, and where it does not, raising beats
 * inventing an answer:
 *   * REPRODUCING A SOURCE FAILURE (the legacy raises too): {@link Product.getPageIDs} (D2),
 *     {@link Product.getTemplateOptions} (D3), {@link Product.getSalePriceExpirationDateTime} (D9),
 *     {@link Product.getProductOptionsByGroup} (D10), {@link Product.getBaseProductType} and
 *     {@link Product.getProductTypeOptions} when `productType` is absent,
 *     {@link Product.getCrumbData} on an empty crumb array or a path that reduces to nothing, and
 *     {@link Product.getSkuBySelectedOptions} on all three of its explicit `throw` branches.
 *   * DECLINING AN EXCLUDED SUBSYSTEM: {@link Product.getEstimatedReceivalDetails},
 *     {@link Product.getEstimatedReceivalDates}, {@link Product.getQuantity}, {@link Product.getQATS}
 *     and {@link Product.getUnusedProductSubscriptionTerms}.
 *   * DECLINING TO INVENT A VALUE THE HYDRATION DID NOT SUPPLY: {@link Product.getProductURL},
 *     {@link Product.getListingProductURL}, {@link Product.getTemplate},
 *     {@link Product.getAlternateImageDirectory}, {@link Product.getTitle},
 *     {@link Product.getAllowBackorderFlag}, {@link Product.getBrandOptions} and
 *     {@link Product.getImageDirectory}.
 *   * REPRODUCING A LEGACY INDEX FAILURE: {@link Product.getSkus} when a sorted ordering cannot place
 *     a materialized sku.
 */
export class Product {
  // --- Persistent properties [model/entity/Product.cfc:L52-L59] --------------------------------

  /**
   * [model/entity/Product.cfc:L52]
   *
   *   property name="productID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *   unsavedvalue="" default="";
   *
   * `default=""` is ported as the literal default, not as a sentinel of this port's invention.
   * `isNew()` reads it directly, and `unsavedvalue=""` is precisely why every containment probe on
   * this class falls back to reference identity when the candidate key is `''`.
   */
  private readonly productID: string;

  /** [model/entity/Product.cfc:L53] `ormtype="boolean"`, NO default; coerced through `cfBoolean()`. */
  private readonly activeFlag: boolean;

  /**
   * [model/entity/Product.cfc:L54] `ormtype="string" unique="true"`.
   *
   * ★ THE URL SLUG, AND THE ONE PROPERTY WITH LEGACY TEST COVERAGE THROUGH
   * {@link Product.getProductURL}. Spelled `urlTitle` here and read by an accessor spelled
   * `getURLTitle()` in the source [L208] - CFML is case-insensitive, TypeScript is not. The accessor
   * below follows the project-wide house spelling `getUrlTitle()`, exactly as
   * src/domain/entities/brand.ts does for the identical property, and NO alias is added.
   */
  private readonly urlTitle: string | undefined;

  /**
   * [model/entity/Product.cfc:L55] `ormtype="string" notNull="true"`.
   *
   * TYPED `string | undefined` DESPITE `notNull`, and deliberately: `notNull` is a DATABASE
   * constraint enforced at the repository boundary and by model/validation/Product.json, not an
   * invariant of an in-memory instance. An unsaved product legitimately has no name yet - that is
   * the state the validator exists to reject - so a non-optional type here would make the port unable
   * to represent the very input it must validate. Same ruling as `productTypeName` in
   * src/domain/entities/productType.ts.
   */
  private readonly productName: string | undefined;

  /** [model/entity/Product.cfc:L56] `ormtype="string" unique="true"`. */
  private readonly productCode: string | undefined;

  /**
   * [model/entity/Product.cfc:L57] `ormtype="string" length="4000" hb_formFieldType="wysiwyg"`.
   *
   * The 4000-character limit and the WYSIWYG form-field hint are both metadata: the limit is enforced
   * by the column and the schema, and this port neither truncates nor validates here. The value is
   * carried as an opaque string - it is authored HTML and no escaping, sanitising or parsing is
   * applied, exactly as the legacy applies none.
   */
  private readonly productDescription: string | undefined;

  /** [model/entity/Product.cfc:L58] `ormtype="boolean" default="false"`; through `cfBoolean()`. */
  private readonly publishedFlag: boolean;

  /** [model/entity/Product.cfc:L59] `ormtype="integer"`. */
  private readonly sortOrder: number | undefined;

  // --- Calculated properties [model/entity/Product.cfc:L62-L65] --------------------------------
  //
  // These four are PERSISTED COLUMNS that a background calculation fills in, not derived values this
  // class computes. They are carried as data with no recomputation, because recomputing them here
  // would diverge from whatever the legacy calculation wrote - and the two implementations would then
  // disagree against the same row.

  /**
   * [model/entity/Product.cfc:L62] `ormtype="big_decimal"`.
   *
   * A `big_decimal` column, so `Money` and never a float. Note this is NOT the same value as
   * {@link Product.getSalePrice}, which delegates to the default sku and carries defect D8; the
   * calculated column and the live delegation can legitimately disagree, and nothing here reconciles
   * them.
   */
  private readonly calculatedSalePrice: Money | undefined;

  /** [model/entity/Product.cfc:L63] `ormtype="integer"`. */
  private readonly calculatedQATS: number | undefined;

  /** [model/entity/Product.cfc:L64] `ormtype="boolean"`; through `cfBoolean()`. */
  private readonly calculatedAllowBackorderFlag: boolean;

  /**
   * [model/entity/Product.cfc:L65] `ormtype="string"`.
   *
   * ★ NOT READ BY {@link Product.getTitle}, and the divergence is the source's. `getTitle()` [L540]
   * recomputes the title from `setting('productTitleString')` through
   * `hibachiUtilityService.replaceStringTemplate` and never consults this column. Both are exposed;
   * neither is derived from the other.
   */
  private readonly calculatedTitle: string | undefined;

  // --- Related objects, many-to-one [model/entity/Product.cfc:L68-L70] -------------------------

  /**
   * [model/entity/Product.cfc:L68]
   *
   *   property name="brand" cfc="Brand" fieldtype="many-to-one" fkcolumn="brandID"
   *   hb_optionsNullRBKey="define.none" fetch="join";
   *
   * ★ NOT `readonly`, because `setBrand` [L662] and `removeBrand` [L668] rebind it - `removeBrand`
   * ends with `structDelete(variables, "brand")`, which is `undefined` here.
   *
   * ★ AND `hb_optionsNullRBKey="define.none"` IS THE ATTRIBUTE THAT MAKES DEFECT D5 A NO-OP. The
   * framework's `getPropertyOptions` [org/Hibachi/HibachiEntity.cfc:L407-L410] prepends a
   * `{value:"", name:rbKey(<that key>)}` row to the option list for any many-to-one property carrying
   * this attribute - so by the time `getBrandOptions()` [L536] writes `rbKey('define.none')` into
   * row 1, row 1 already holds exactly that value. See {@link Product.getBrandOptions}.
   *
   * `fetch="join"` is an ORM fetch-plan hint, preserved as metadata only: the port materializes at
   * the repository boundary and has no lazy tier to configure.
   */
  private brand: Brand | undefined;

  /**
   * [model/entity/Product.cfc:L69]
   *
   *   property name="productType" cfc="ProductType" fieldtype="many-to-one"
   *   fkcolumn="productTypeID" fetch="join";
   *
   * ★ `readonly`, unlike `brand` - and the asymmetry is the source's. This component declares NO
   * `setProductType`/`removeProductType` pair, which is also why
   * src/domain/entities/productType.ts exposes its `products` collection `readonly`: neither side
   * reaches into the other. Re-verified by grep over model/entity/Product.cfc.
   *
   * The product type is what the promotion engine walks: `getProductTypeIDPath()` is the
   * materialized path both qualifier membership [model/service/PromotionService.cfc:L858-L870] and
   * reward membership [L921-L985] test against.
   */
  private readonly productType: ProductType | undefined;

  /**
   * [model/entity/Product.cfc:L70]
   *
   *   property name="defaultSku" cfc="Sku" fieldtype="many-to-one" fkcolumn="defaultSkuID"
   *   cascade="delete" fetch="join";
   *
   * ★ THE SINGLE MOST LOAD-BEARING MANY-TO-ONE ON THIS CLASS: thirteen methods delegate to it -
   * five image members [L320-L338] and eight price members [L554-L602] - and every one of them tests
   * `structKeyExists(variables, "defaultSku")` first, which is `this.defaultSku !== undefined` here.
   *
   * `cascade="delete"` is a persistence obligation, not an in-memory one: deleting a product deletes
   * its default sku row. The port carries that obligation at the repository, and this class performs
   * no cascade of its own - exactly as the CFC performs none.
   */
  private readonly defaultSku: Sku | undefined;

  // --- Related objects, one-to-many [model/entity/Product.cfc:L73-L76] -------------------------

  /**
   * [model/entity/Product.cfc:L73]
   *
   *   property name="skus" type="array" cfc="Sku" singularname="Sku" fieldtype="one-to-many"
   *   fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
   *
   * LIVE - `Sku.setProduct` [model/entity/Sku.cfc:L607] appends into `product.getSkus()` in place and
   * `Sku.removeProduct` [L616] splices it, so {@link Product.getSkus} must hand back the mutable
   * array for the far side's mutation to be observable. That is why the field is `Sku[]` and not
   * `readonly Sku[]`.
   *
   * `cascade="all-delete-orphan"` is a persistence obligation carried at the repository. `inverse`
   * says the FK lives on `SwSku.productID`, which is what makes `Sku` the owning side and this
   * collection's only writer.
   */
  private readonly skus: Sku[];

  /**
   * [model/entity/Product.cfc:L74] `productImages`, one-to-many onto `Image`,
   * `cascade="all-delete-orphan" inverse="true"`.
   *
   * LIVE - [model/entity/Image.cfc:L158, L167]. Typed by {@link ProductImageLink} because `Image` is
   * out of scope; see that contract for why the collection cannot simply be dropped the way
   * src/domain/entities/brand.ts drops its out-of-scope collections.
   *
   * ★ TWO ACCESSORS READ THIS ONE FIELD, and both are part of the surface:
   * {@link Product.getProductImages} is the ORM-generated name, and {@link Product.getImages} is a
   * hand-written alias declared at [L177-L179] whose body is literally `return
   * variables.productImages;`. They must return the SAME live array, not two copies.
   */
  private readonly productImages: ProductImageLink[];

  /**
   * [model/entity/Product.cfc:L75] `attributeValues`, one-to-many onto `AttributeValue`,
   * `cascade="all-delete-orphan" inverse="true"`.
   *
   * LIVE - [model/entity/AttributeValue.cfc:L242, L251]. Typed by
   * {@link ProductAttributeValueLink}; see that contract for the ★ note on how this property's mere
   * presence changes what four of this component's defects do.
   */
  private readonly attributeValues: ProductAttributeValueLink[];

  /**
   * [model/entity/Product.cfc:L76] `productReviews`, one-to-many onto `ProductReview`,
   * `cascade="all-delete-orphan" inverse="true"`, and carrying the misspelled `singlularname`
   * attribute recorded on {@link ProductReviewLink}.
   *
   * LIVE - [model/entity/ProductReview.cfc:L117, L126].
   */
  private readonly productReviews: ProductReviewLink[];

  // --- Related objects, many-to-many owner [model/entity/Product.cfc:L79-L81] ------------------

  /**
   * [model/entity/Product.cfc:L79] `listingPages`, many-to-many onto `Content` over
   * `SwProductListingPage`, THIS SIDE OWNING (no `inverse`).
   *
   * PRIVATE STORAGE MUTABLE, ACCESSOR `readonly`, and the split is exactly what the census
   * prescribes: `addListingPage`/`removeListingPage` [L712-L730] mutate `variables.listingPages`
   * DIRECTLY, and nothing anywhere mutates `product.getListingPages()`. Typed by
   * {@link ListingPageLink} because `Content` is out of scope.
   */
  private readonly listingPages: ListingPageLink[];

  /**
   * [model/entity/Product.cfc:L80] `categories`, many-to-many onto `Category` over
   * `SwProductCategory`, THIS SIDE OWNING.
   *
   * `readonly`, AND HELPER-FREE ON BOTH SIDES - see the file header. Read by
   * {@link Product.getCategoryIDs} [L199-L205] and by nothing else on this class.
   */
  private readonly categories: Category[];

  /**
   * [model/entity/Product.cfc:L81] `relatedProducts`, SELF-REFERENTIAL many-to-many over
   * `SwRelatedProduct`, THIS SIDE OWNING.
   *
   * `readonly` and helper-free. The self-reference is why the element type is `Product`; nothing in
   * this class walks the collection, so there is no cycle risk and no depth guard is needed.
   */
  private readonly relatedProducts: Product[];

  // --- Related objects, many-to-many inverse [model/entity/Product.cfc:L84-L90] ----------------
  //
  // All seven are `inverse="true"`, so the far side owns the link table and hand-writes the helper
  // pair; this class's own helpers delegate outward without touching a local array. All seven are
  // nonetheless LIVE, because each far side splices THIS product's accessor in place - which is the
  // inversion the census keeps catching: an INVERSE association ends up with a LIVE accessor
  // precisely because the OWNER reaches back through it.

  /**
   * [model/entity/Product.cfc:L84] over `SwPromoRewardProduct`. LIVE -
   * [model/entity/PromotionReward.cfc:L263, L273].
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * [model/entity/Product.cfc:L85] over `SwPromoRewardExclProduct`. LIVE -
   * [model/entity/PromotionReward.cfc:L363, L373].
   *
   * A SEPARATE LINK TABLE FROM `promotionRewards`, not a filtered view of it. Inclusion and exclusion
   * are independent, which is what lets the promotion engine test both
   * [model/service/PromotionService.cfc:L945, L971] against the same reward.
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * [model/entity/Product.cfc:L86] over `SwPromoQualProduct`. LIVE -
   * [model/entity/PromotionQualifier.cfc:L205, L215].
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * [model/entity/Product.cfc:L87] over `SwPromoQualExclProduct`. LIVE -
   * [model/entity/PromotionQualifier.cfc:L305, L315].
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /**
   * [model/entity/Product.cfc:L88] over `SwPriceGroupRateProduct`. LIVE -
   * [model/entity/PriceGroupRate.cfc:L224, L234].
   *
   * ★ NOTE WHAT IS ABSENT: this component declares NO `priceGroupRateExclusions` collection, even
   * though model/entity/PriceGroupRate.cfc:L104 declares an `excludedProducts` side over
   * `SwPriceGroupRateExclProduct`. The link table exists and only ONE end of it is mapped. That
   * one-sidedness is the same shape src/domain/entities/productType.ts records for its own
   * `priceGroupRateExclusions`, and it is recorded here rather than repaired.
   */
  private readonly priceGroupRates: PriceGroupRate[];

  /**
   * [model/entity/Product.cfc:L89] over `SwVendorProduct`. LIVE - [model/entity/Vendor.cfc:L158,
   * L168]. Typed by {@link ProductVendorLink}; see the file header for why this is materialized here
   * and not in src/domain/entities/brand.ts.
   */
  private readonly vendors: ProductVendorLink[];

  /**
   * [model/entity/Product.cfc:L90] over `SwPhysicalProduct`. LIVE - [model/entity/Physical.cfc:L164,
   * L174]. Typed by {@link ProductPhysicalLink}.
   */
  private readonly physicals: ProductPhysicalLink[];

  // --- Remote and audit properties [model/entity/Product.cfc:L93-L99] -------------------------

  /**
   * [model/entity/Product.cfc:L93] `ormtype="string"`.
   *
   * The external-system correlation key. Present because the column is present; carried as an inert
   * string with no parsing and no default. ★ It IS read by in-scope logic, unlike most `remoteID`
   * columns: `getQuantity()` passes `productRemoteID=getRemoteID()` into the inventory service
   * [L441], which is recorded on that method's throwing stub.
   */
  private readonly remoteID: string | undefined;

  /** [model/entity/Product.cfc:L96] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/Product.cfc:L97] `createdByAccount`, many-to-one onto the OUT-OF-SCOPE `Account`.
   *
   * COLLAPSED TO THE OPAQUE FK VALUE, which preserves a column that genuinely exists on `SwProduct`
   * (`createdByAccountID`). Contrast the many-to-many `vendors`/`physicals`, whose keys live only in
   * link tables: inventing an ID member for those would be inventing a column, whereas preserving
   * this one is preserving a column. Same ruling as src/domain/entities/brand.ts.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/Product.cfc:L98] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/Product.cfc:L99] `modifiedByAccount`, collapsed to its FK for the same reason. */
  private readonly modifiedByAccountID: string | undefined;

  // --- Non-persistent, populatable [model/entity/Product.cfc:L102-L123] -----------------------
  //
  // The source declares twelve non-persistent properties [L102-L113] plus six currency-formatted
  // ones [L116-L123]. MOST OF THEM ARE MEMO SLOTS RATHER THAN INPUTS - `brandName`, `title`,
  // `qats`, `transactionExistsFlag`, `salePriceDetailsForSkus`, `estimatedReceivalDetails`,
  // `unusedProductOptions`, `unusedProductOptionGroups`, `unusedProductSubscriptionTerms`,
  // `brandOptions`, `baseProductType`, `allowBackorderFlag` - and appear below as memo fields, not as
  // constructor inputs. Exactly ONE of the eighteen is genuinely read as populated input:

  /**
   * [model/entity/Product.cfc:L118] `property name="price" hb_formatType="currency"
   * persistent="false"`.
   *
   * ★ THE ONE NON-PERSISTENT PROPERTY THIS CLASS READS AS AN INPUT. `getPrice()` [L559-L565] tests
   * `structKeyExists(variables, "price")` FIRST and only falls through to the default sku when it is
   * absent - so a populated override wins. None of the other five currency delegators has that first
   * branch; compare `getRenewalPrice()` [L567], which goes straight to the default sku. The asymmetry
   * is the source's and is preserved.
   */
  private readonly price: Money | undefined;

  // --- Repository-materialized inputs that replace an outward reach ----------------------------
  //
  // Each field below holds an ALREADY-RESOLVED value that the legacy obtained through
  // `setting(...)`, `getURLFromPath(...)`, `replaceStringTemplate(...)` or a smart list. The ruling
  // that puts them here rather than deleting the methods that read them is the one recorded on
  // `Option.getImageDirectory` in src/domain/entities/option.ts: moving an input outward does not
  // license removing the behaviour built on it. Each is OPTIONAL and each reader RAISES when it is
  // absent, because none of these return types has a spare value and every plausible default would be
  // a well-formed WRONG answer rather than a detectable marker.

  /**
   * The resolved value of `setting('globalURLKeyProduct')`, read at [model/entity/Product.cfc:L208]
   * and [L212].
   *
   * ★ THIS IS ONE OF THE FOUR AAP-APPROVED SETTING KEYS, and it is still materialized rather than
   * read through the settings port - the house pattern, because an entity that holds a port to read
   * one string has taken on a collaborator it does not need. Its legacy default is `"sp"`
   * [model/service/SettingService.cfc:L178], and that default belongs to the settings tier, not
   * here: baking `'sp'` into this class would make the port answer differently from the CFML
   * application whenever an installation overrides the setting.
   */
  private readonly globalURLKeyProductSetting: string | undefined;

  /**
   * The resolved value of `setting('productDisplayTemplate')`, read at
   * [model/entity/Product.cfc:L187].
   *
   * ★ NOT ONE OF THE FOUR APPROVED KEYS, and that is precisely why it arrives pre-resolved: the
   * `SettingsProvider` contract is CLOSED at four keys, so this entity may not resolve it and does
   * not try to. Only {@link Product.getTemplate} reads it.
   */
  private readonly productDisplayTemplateSetting: string | undefined;

  /**
   * The resolved value of `setting("skuAllowBackorderFlag")`, read at
   * [model/entity/Product.cfc:L556].
   *
   * Carried as `boolean` because the SETTING is boolean, even though the reader declares
   * `returntype="numeric"` - that mismatch is defect D11 and is reproduced at the accessor, not
   * hidden by mistyping the input. Not an approved key, so it arrives pre-resolved.
   */
  private readonly skuAllowBackorderFlagSetting: boolean | undefined;

  /**
   * The already-expanded product title: the result of
   * `hibachiUtilityService.replaceStringTemplate(template=setting('productTitleString'),
   * object=this)` [model/entity/Product.cfc:L541].
   *
   * BOTH HALVES OF THAT EXPRESSION ARE OUTSIDE THE DOMAIN. `hibachiUtilityService` is explicitly not
   * ported (AAP 0.6.2, 0.5.3), and `productTitleString` is not one of the four approved setting keys.
   * What this class contributes is the MEMO and the delegation, which is what
   * {@link Product.getTitle} keeps.
   */
  private readonly resolvedTitle: string | undefined;

  /**
   * The already-resolved image base URL: the result of `getURLFromPath(setting(
   * 'globalAssetsImageFolderPath'))` [model/entity/Product.cfc:L224].
   *
   * IDENTICAL IN KIND to `Option.assetsImageBaseUrl` in src/domain/entities/option.ts, and named the
   * same way on purpose - the two entities append different suffixes (`'/product/'` here,
   * `'/option/'` there) to the same resolved base. `getURLFromPath` belongs to the unported Hibachi
   * base and `globalAssetsImageFolderPath` is not an approved key, so both inner calls happen at the
   * boundary. Read only by {@link Product.getAlternateImageDirectory}.
   */
  private readonly assetsImageBaseUrl: string | undefined;

  /**
   * The brand select rows, materialized EXACTLY AS `getPropertyOptions("brand")`
   * [org/Hibachi/HibachiEntity.cfc:L375-L414] RETURNS THEM - which means WITH the
   * `{value:'', name:<define.none>}` row already PREPENDED at index 0.
   *
   * ★ THE PREPEND IS NOT OPTIONAL AND NOT COSMETIC. The framework prepends it for any many-to-one
   * property that carries `hb_optionsNullRBKey`, and `brand` carries it [model/entity/Product.cfc:L68].
   * {@link Product.getBrandOptions} then writes into row 1 UNCONDITIONALLY [L536], so a candidate
   * list supplied WITHOUT the prepended row would have a REAL BRAND'S NAME overwritten with the
   * "none" label. That is why the accessor raises on an empty list instead of returning `[]`: an
   * empty list is a state the legacy could not be in, and silently tolerating it would convert a
   * hydration mistake into wrong data.
   */
  private readonly brandOptionCandidates: readonly BrandOption[] | undefined;

  /**
   * The product-type rows `getProductTypeOptions()` [model/entity/Product.cfc:L125-L143] projects,
   * ALREADY FILTERED by the two conditions its smart list applies: a `productTypeIDPath` LIKE prefix
   * derived from the base product type [L131], and `NOT EXISTS (<any child product type>)` [L132] -
   * i.e. LEAF product types only.
   *
   * The FILTERING is an input here; the PROJECTION is this entity's contribution and stays. Same
   * split as `ProductType.parentProductTypeOptionCandidates`.
   */
  private readonly productTypeOptionCandidates: readonly ProductType[] | undefined;

  /**
   * `max(SwOptionGroup.sortOrder) + 1` across the WHOLE `SwOptionGroup` table - the exponent base of
   * the weighted SKU ordering at [model/dao/SkuDAO.cfc:L172-L200]:
   *
   *   ORDER BY SUM(SwOption.sortOrder * POWER(10, <this value> - SwOptionGroup.sortOrder)) ASC
   *
   * ★ AND IT DOES NOT AFFECT THE ORDERING AT ALL, which is worth proving rather than asserting:
   * `POWER(10, N - g)` is `10^N / 10^g`, so the entire sum is the ordering-relevant quantity
   * `SUM(sortOrder / 10^g)` multiplied by the POSITIVE CONSTANT `10^N`. Multiplying every key by one
   * positive constant cannot reorder them. The value is therefore accepted as an OPTIONAL input, used
   * when supplied so the double arithmetic matches MySQL's bit for bit, and otherwise derived locally
   * from the option groups actually present - which keeps the exponents non-negative and small.
   *
   * This is also why {@link Product.getSkus} does not need a repository call to sort: the only
   * genuinely global input to the SQL ordering turns out to be ordering-irrelevant.
   */
  private readonly nextOptionGroupSortOrder: number | undefined;

  // --- Injected collaborators ------------------------------------------------------------------

  /**
   * The F11-relocated sale-price collaborator. See {@link SalePriceResolver}. Optional, because a
   * product hydrated for a path that never asks for sale prices should not be forced to carry one;
   * {@link Product.getSalePriceDetailsForSkus} raises when it is absent.
   */
  private readonly salePriceResolver: SalePriceResolver | undefined;

  /**
   * The three in-scope repository lookups. See {@link ProductQuerySupport}. Optional for the same
   * reason as {@link Product.salePriceResolver}; each reader raises when it is absent.
   */
  private readonly querySupport: ProductQuerySupport | undefined;

  /**
   * The one resource-bundle label. See {@link ProductLabelProvider}. Read only by
   * {@link Product.getBrandOptions}.
   */
  private readonly labelProvider: ProductLabelProvider | undefined;

  // --- Memo slots ------------------------------------------------------------------------------
  //
  // ★ EVERY MEMO ON THIS CLASS IS REQUEST-SCOPED, WHICH IS A CORRECTNESS PROPERTY AND NOT A
  // PERFORMANCE ONE. On a warm Lambda container, module-level or process-level state survives between
  // UNRELATED invocations, so a memoized price or title could leak from one customer's request into
  // another's. Instances are constructed per request by the repository, so these fields cannot
  // outlive the request that produced them.
  //
  // ★ AND EVERY MEMO GUARD TESTS PRESENCE, NEVER TRUTHINESS - `=== undefined`, never `!field`. The
  // legacy guards are all `structKeyExists`, and an empty array, an empty string and a zero are all
  // legitimate memoized answers that must not re-trigger the computation.

  /** Memo for {@link Product.getOptionGroups}; source memo `variables.optionGroups` [L251]. */
  private optionGroups: readonly OptionGroup[] | undefined;

  /** Memo for {@link Product.getOptionGroupsStruct}; source `variables.optionGroupsStruct` [L242]. */
  private optionGroupsStruct: Readonly<Record<string, OptionGroup>> | undefined;

  /** Memo for {@link Product.getProductTypeOptions}; source `variables.productTypeOptions` [L126]. */
  private productTypeOptions: readonly ProductTypeOption[] | undefined;

  /**
   * Memo for {@link Product.getBrandName}; source `variables.brandName` [L525].
   *
   * ★ THIS IS THE FIELD DEFECT D12 POISONS IN THE LEGACY. See the accessor for the AAP citation that
   * makes the fix mandatory and for why the AAP's stated rationale is corrected rather than repeated.
   */
  private brandName: string | undefined;

  /** Memo for {@link Product.getTitle}; source `variables.title` [L540]. */
  private title: string | undefined;

  /** Memo for {@link Product.getSalePriceDiscountType}; source memo at [L605]. */
  private salePriceDiscountType: string | undefined;

  /** Memo for {@link Product.getDefaultProductImageFiles}; source memo at [L498]. */
  private defaultProductImageFiles: readonly string[] | undefined;

  /** Memo for {@link Product.getSalePriceDetailsForSkus}; source memo at [L517]. */
  private salePriceDetailsForSkus: Readonly<Record<string, SalePriceDetail>> | undefined;

  /** Memo for {@link Product.getTransactionExistsFlag}; source memo at [L626]. */
  private transactionExistsFlag: boolean | undefined;

  /** Memo for {@link Product.getUnusedProductOptions}; source memo at [L636]. */
  private unusedProductOptions: readonly Option[] | undefined;

  /** Memo for {@link Product.getUnusedProductOptionGroups}; source memo at [L643]. */
  private unusedProductOptionGroups: readonly OptionGroup[] | undefined;

  /**
   * Constructs a product from a repository row plus its materialized associations.
   *
   * EVERY COLLECTION IS OPTIONAL AND DEFAULTS TO `[]`, so a partially-hydrated product is a
   * first-class shape rather than a broken one - which is what makes the repository free to choose a
   * fetch shape per query method. Every scalar is optional except where the source declares a
   * literal default, and those two defaults (`productID=''`, `publishedFlag=false`) are ported as the
   * source's defaults rather than invented here.
   */
  constructor(
    init: {
      readonly productID?: string | undefined;
      readonly activeFlag?: CfBooleanInput;
      readonly urlTitle?: string | undefined;
      readonly productName?: string | undefined;
      readonly productCode?: string | undefined;
      readonly productDescription?: string | undefined;
      readonly publishedFlag?: CfBooleanInput;
      readonly sortOrder?: number | undefined;
      readonly calculatedSalePrice?: Money | undefined;
      readonly calculatedQATS?: number | undefined;
      readonly calculatedAllowBackorderFlag?: CfBooleanInput;
      readonly calculatedTitle?: string | undefined;
      readonly brand?: Brand | undefined;
      readonly productType?: ProductType | undefined;
      readonly defaultSku?: Sku | undefined;
      readonly skus?: Sku[] | undefined;
      readonly productImages?: ProductImageLink[] | undefined;
      readonly attributeValues?: ProductAttributeValueLink[] | undefined;
      readonly productReviews?: ProductReviewLink[] | undefined;
      readonly listingPages?: ListingPageLink[] | undefined;
      readonly categories?: Category[] | undefined;
      readonly relatedProducts?: Product[] | undefined;
      readonly promotionRewards?: PromotionReward[] | undefined;
      readonly promotionRewardExclusions?: PromotionReward[] | undefined;
      readonly promotionQualifiers?: PromotionQualifier[] | undefined;
      readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
      readonly priceGroupRates?: PriceGroupRate[] | undefined;
      readonly vendors?: ProductVendorLink[] | undefined;
      readonly physicals?: ProductPhysicalLink[] | undefined;
      readonly remoteID?: string | undefined;
      readonly createdDateTime?: Date | undefined;
      readonly createdByAccountID?: string | undefined;
      readonly modifiedDateTime?: Date | undefined;
      readonly modifiedByAccountID?: string | undefined;
      readonly price?: Money | undefined;
      readonly globalURLKeyProductSetting?: string | undefined;
      readonly productDisplayTemplateSetting?: string | undefined;
      readonly skuAllowBackorderFlagSetting?: boolean | undefined;
      readonly resolvedTitle?: string | undefined;
      readonly assetsImageBaseUrl?: string | undefined;
      readonly brandOptionCandidates?: readonly BrandOption[] | undefined;
      readonly productTypeOptionCandidates?: readonly ProductType[] | undefined;
      readonly nextOptionGroupSortOrder?: number | undefined;
      readonly salePriceResolver?: SalePriceResolver | undefined;
      readonly querySupport?: ProductQuerySupport | undefined;
      readonly labelProvider?: ProductLabelProvider | undefined;
    } = {},
  ) {
    // `default=""` at [model/entity/Product.cfc:L52] ported as the literal default; `isNew()` reads
    // it directly and every containment probe branches on it.
    this.productID = init.productID ?? '';

    // All three booleans through the shared helper. An undefaulted, unset column reads `false` -
    // the answer the legacy engine gave a flag it had no value for. `publishedFlag` additionally
    // carries `default="false"` at L58, which agrees with the helper rather than adding to it.
    this.activeFlag = cfBoolean(init.activeFlag);
    this.publishedFlag = cfBoolean(init.publishedFlag);
    this.calculatedAllowBackorderFlag = cfBoolean(init.calculatedAllowBackorderFlag);

    this.urlTitle = init.urlTitle;
    this.productName = init.productName;
    this.productCode = init.productCode;
    this.productDescription = init.productDescription;
    this.sortOrder = init.sortOrder;

    this.calculatedSalePrice = init.calculatedSalePrice;
    this.calculatedQATS = init.calculatedQATS;
    this.calculatedTitle = init.calculatedTitle;

    this.brand = init.brand;
    this.productType = init.productType;
    this.defaultSku = init.defaultSku;

    // The eleven LIVE collections and the three readonly ones all default to `[]`. The default is
    // uniform on purpose: no consumer of this class has to special-case one collection against
    // another, and an absent association reads as empty everywhere.
    this.skus = init.skus ?? [];
    this.productImages = init.productImages ?? [];
    this.attributeValues = init.attributeValues ?? [];
    this.productReviews = init.productReviews ?? [];
    this.listingPages = init.listingPages ?? [];
    this.categories = init.categories ?? [];
    this.relatedProducts = init.relatedProducts ?? [];
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];
    this.priceGroupRates = init.priceGroupRates ?? [];
    this.vendors = init.vendors ?? [];
    this.physicals = init.physicals ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;

    this.price = init.price;

    // The materialized replacements for the legacy's outward reaches. NONE of them is defaulted -
    // `?? ''` would make `getProductURL()` return the plausible-looking but wrong `//nike-air-jorden/`
    // instead of raising, and `?? false` would make `getAllowBackorderFlag()` answer a policy question
    // it has no data for.
    this.globalURLKeyProductSetting = init.globalURLKeyProductSetting;
    this.productDisplayTemplateSetting = init.productDisplayTemplateSetting;
    this.skuAllowBackorderFlagSetting = init.skuAllowBackorderFlagSetting;
    this.resolvedTitle = init.resolvedTitle;
    this.assetsImageBaseUrl = init.assetsImageBaseUrl;
    this.brandOptionCandidates = init.brandOptionCandidates;
    this.productTypeOptionCandidates = init.productTypeOptionCandidates;
    this.nextOptionGroupSortOrder = init.nextOptionGroupSortOrder;

    this.salePriceResolver = init.salePriceResolver;
    this.querySupport = init.querySupport;
    this.labelProvider = init.labelProvider;
  }

  // --- Accessors -------------------------------------------------------------------------------
  //
  // `accessors=true` is implied for a persistent CFML component, so ColdFusion generated one getter
  // per persistent property and callers throughout the legacy tree use them. These are part of the
  // interface-parity contract, not boilerplate, and the names are the generated CFML names verbatim.

  /** [model/entity/Product.cfc:L52] Always a string; `''` for an unsaved entity. */
  getProductID(): string {
    return this.productID;
  }

  /** [model/entity/Product.cfc:L53] Coerced through `cfBoolean()` during hydration. */
  getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /**
   * [model/entity/Product.cfc:L54]
   *
   * Spelled `getUrlTitle`, matching the property. [model/entity/Product.cfc:L208] calls it
   * `getURLTitle()` because CFML is case-insensitive; TypeScript is not, and no alias is added. Same
   * ruling and same house spelling as src/domain/entities/brand.ts.
   */
  getUrlTitle(): string | undefined {
    return this.urlTitle;
  }

  /** [model/entity/Product.cfc:L55] See the field for why `notNull` does not make this required. */
  getProductName(): string | undefined {
    return this.productName;
  }

  /** [model/entity/Product.cfc:L56] */
  getProductCode(): string | undefined {
    return this.productCode;
  }

  /** [model/entity/Product.cfc:L57] Opaque authored HTML; no escaping or parsing is applied. */
  getProductDescription(): string | undefined {
    return this.productDescription;
  }

  /** [model/entity/Product.cfc:L58] Coerced through `cfBoolean()`; source default is `false`. */
  getPublishedFlag(): boolean {
    return this.publishedFlag;
  }

  /** [model/entity/Product.cfc:L59] */
  getSortOrder(): number | undefined {
    return this.sortOrder;
  }

  /** [model/entity/Product.cfc:L62] A `big_decimal` column, so `Money`; never a float. */
  getCalculatedSalePrice(): Money | undefined {
    return this.calculatedSalePrice;
  }

  /** [model/entity/Product.cfc:L63] */
  getCalculatedQATS(): number | undefined {
    return this.calculatedQATS;
  }

  /** [model/entity/Product.cfc:L64] */
  getCalculatedAllowBackorderFlag(): boolean {
    return this.calculatedAllowBackorderFlag;
  }

  /** [model/entity/Product.cfc:L65] Not consulted by {@link Product.getTitle}; see the field. */
  getCalculatedTitle(): string | undefined {
    return this.calculatedTitle;
  }

  /** [model/entity/Product.cfc:L68] `undefined` after `removeBrand()`; see the field. */
  getBrand(): Brand | undefined {
    return this.brand;
  }

  /** [model/entity/Product.cfc:L69] */
  getProductType(): ProductType | undefined {
    return this.productType;
  }

  /** [model/entity/Product.cfc:L70] The receiver of thirteen delegating members. */
  getDefaultSku(): Sku | undefined {
    return this.defaultSku;
  }

  /** [model/entity/Product.cfc:L93] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/Product.cfc:L96] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/Product.cfc:L97] The FK value of the out-of-scope `createdByAccount`. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/Product.cfc:L98] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/Product.cfc:L99] The FK value of the out-of-scope `modifiedByAccount`. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- Association accessors -------------------------------------------------------------------
  //
  // Liveness is decided by the census in the file header and by nothing else. The eleven LIVE
  // accessors hand back the mutable array because a far side splices it; the three readonly ones hand
  // back a projection because nothing does.

  /**
   * The product's SKUs. [model/entity/Product.cfc:L155-L160]
   *
   *   public array function getSkus(boolean sorted=false, boolean fetchOptions=false) {
   *       if(!arguments.sorted && !arguments.fetchOptions) {
   *           return variables.skus;
   *       }
   *       return getService("skuService").getProductSkus(product=this, sorted=arguments.sorted,
   *                                                      fetchOptions=arguments.fetchOptions);
   *   }
   *
   * ★ THE DEFAULT CALL RETURNS THE LIVE ARRAY AND THE FLAGGED CALLS RETURN A FRESH ONE. That is the
   * source's shape, not a convenience: `Sku.setProduct` [model/entity/Sku.cfc:L607] appends into
   * `product.getSkus()`, which only works because the no-argument form hands back `variables.skus`
   * itself. Both flagged branches build a new array in the legacy too, since the service returns
   * whatever the DAO query produced.
   *
   * ★ AND THE FLAGGED BRANCHES ARE PORTED IN MEMORY RATHER THAN THROUGH A PORT, per AAP 0.4.2 - "Sync
   * over a materialized array; sorting is applied in memory when the array was fetched unsorted". The
   * two things the legacy needed a query for both turn out to be derivable: the INNER JOIN FETCH
   * filter reads only `sku.getOptions()`, and the ORDER BY key is ordering-equivalent to a purely
   * local computation (proved on {@link Product.nextOptionGroupSortOrder}). See
   * `applyFetchOptionsFilter` and `sortSkusByOptionGroupWeighting` for the two reproductions and for
   * the two behaviours they preserve that a naive port would lose.
   *
   * WHAT CAN THROW HERE: the `fetchOptions` branch dereferences the product type
   * [model/dao/SkuDAO.cfc:L156] and raises when it is absent, exactly as the legacy does; it raises
   * for the two out-of-scope base product types; and the sorted branch raises when a materialized
   * sku has no place in the computed ordering, which is the legacy's index-zero assignment failure.
   */
  getSkus(sorted: boolean = false, fetchOptions: boolean = false): Sku[] {
    // [model/entity/Product.cfc:L156-L158] the LIVE fast path, byte for byte.
    if (!sorted && !fetchOptions) {
      return this.skus;
    }

    // [model/service/SkuService.cfc:L221] `getSkuDAO().getProductSkus(product, fetchOptions)`.
    let skus: Sku[] = this.applyFetchOptionsFilter(fetchOptions);

    // [model/service/SkuService.cfc:L223] the three-part guard, in order and with CFML's
    // short-circuit semantics that `&&` reproduces exactly. ★ NOTE IT TESTS ONLY `skus[1]`: a
    // product whose FIRST sku has no options is never sorted, however many options the others have.
    // That is preserved, not normalised.
    const firstSku: Sku | undefined = skus[0];
    if (sorted && skus.length > 1 && firstSku !== undefined && firstSku.getOptions().length > 0) {
      skus = this.sortSkusByOptionGroupWeighting(skus);
    }

    return skus;
  }

  /**
   * The alternate product images. [model/entity/Product.cfc:L74]
   *
   * LIVE, because [model/entity/Image.cfc:L158] appends into this very accessor's result.
   * {@link Product.getImages} is a hand-written alias over the SAME array; see that method.
   */
  getProductImages(): ProductImageLink[] {
    return this.productImages;
  }

  /** The EAV attribute values. [model/entity/Product.cfc:L75] LIVE - AttributeValue.cfc:L242. */
  getAttributeValues(): ProductAttributeValueLink[] {
    return this.attributeValues;
  }

  /** The product reviews. [model/entity/Product.cfc:L76] LIVE - ProductReview.cfc:L117. */
  getProductReviews(): ProductReviewLink[] {
    return this.productReviews;
  }

  /**
   * The content pages this product is listed on. [model/entity/Product.cfc:L79]
   *
   * `readonly` even though this side OWNS the link table, because the owning helpers mutate the
   * private field and no far side reaches through this accessor. See the field.
   */
  getListingPages(): readonly ListingPageLink[] {
    return this.listingPages;
  }

  /**
   * The categories this product belongs to. [model/entity/Product.cfc:L80]
   *
   * `readonly`, and the association is helper-free on BOTH sides - see the file header. Read by
   * {@link Product.getCategoryIDs}.
   */
  getCategories(): readonly Category[] {
    return this.categories;
  }

  /** The self-referential related products. [model/entity/Product.cfc:L81] `readonly`. */
  getRelatedProducts(): readonly Product[] {
    return this.relatedProducts;
  }

  /** [model/entity/Product.cfc:L84] LIVE - PromotionReward.cfc:L263. */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /** [model/entity/Product.cfc:L85] LIVE - PromotionReward.cfc:L363. A separate link table. */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /** [model/entity/Product.cfc:L86] LIVE - PromotionQualifier.cfc:L205. */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /** [model/entity/Product.cfc:L87] LIVE - PromotionQualifier.cfc:L305. */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /** [model/entity/Product.cfc:L88] LIVE - PriceGroupRate.cfc:L224. See the field for what is absent. */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /** [model/entity/Product.cfc:L89] LIVE - Vendor.cfc:L158. Rows typed by {@link ProductVendorLink}. */
  getVendors(): ProductVendorLink[] {
    return this.vendors;
  }

  /** [model/entity/Product.cfc:L90] LIVE - Physical.cfc:L164. Rows typed by {@link ProductPhysicalLink}. */
  getPhysicals(): ProductPhysicalLink[] {
    return this.physicals;
  }

  // --- Containment probes ----------------------------------------------------------------------
  //
  // ALL TWELVE MATCH BY PRIMARY KEY WITH A REFERENCE FALLBACK, and the fallback is not defensive
  // padding - it is required by `unsavedvalue=""`. Every unsaved row's key is `''`, so a pure key
  // comparison would report two DIFFERENT unsaved rows as the same one and the far side's guard would
  // skip a legitimate append.
  //
  // ★ AND NOTE THE DELIBERATE ASYMMETRY WITH THE `remove*` HELPERS BELOW: a probe matches by KEY, a
  // remove splices by REFERENCE (`arrayFind` with an object needle). Those are two different legacy
  // mechanisms and they are never normalised together.
  //
  // THE PARAMETER TYPES ARE THE CONCRETE IN-SCOPE CLASSES where one exists, and the `*Link`
  // projection where the far side is out of scope - in which case the projection carries the primary
  // key accessor precisely so the probe can do its job.

  /**
   * Called by `Sku.setProduct` [model/entity/Sku.cfc:L605]:
   * `if(isNew() or !arguments.product.hasSku( this ))`.
   */
  hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Called by `Image.setProduct` [model/entity/Image.cfc:L156]:
   * `if(isNew() or !arguments.product.hasProductImage( this ))`.
   */
  hasProductImage(productImage: ProductImageLink): boolean {
    const candidateID: string = productImage.getImageID();
    if (candidateID === '') {
      return this.productImages.includes(productImage);
    }
    return this.productImages.some((held: ProductImageLink) => held.getImageID() === candidateID);
  }

  /**
   * Called by `AttributeValue.setProduct` [model/entity/AttributeValue.cfc:L240]:
   * `if(isNew() or !arguments.product.hasAttributeValue( this ))`.
   *
   * ★ THE ONE PROBE THAT CANNOT MATCH BY KEY, and the reason is recorded rather than worked around:
   * {@link ProductAttributeValueLink} carries no primary-key accessor, because the two members it
   * does carry are the only ones this class invokes and widening the projection to satisfy a probe
   * would make it less precise for the helpers that use it. Reference identity is therefore the whole
   * test here. That is STRICTER than the legacy for saved rows - two distinct instances of the same
   * `SwAttributeValue` row would compare unequal - and it is safe in this port because association
   * arrays are materialized once per request from one repository pass, so a row appears as exactly
   * one instance.
   */
  hasAttributeValue(attributeValue: ProductAttributeValueLink): boolean {
    return this.attributeValues.includes(attributeValue);
  }

  /**
   * Called by `ProductReview.setProduct` [model/entity/ProductReview.cfc:L115]:
   * `if(isNew() or !arguments.product.hasProductReview( this ))`.
   *
   * Reference identity for the same reason as {@link Product.hasAttributeValue}:
   * {@link ProductReviewLink} carries `getRating()` and the two delegation members, none of which is
   * a primary key.
   */
  hasProductReview(productReview: ProductReviewLink): boolean {
    return this.productReviews.includes(productReview);
  }

  /**
   * Called by this class's own `addListingPage` [model/entity/Product.cfc:L714]:
   * `if(isNew() or !hasListingPage(arguments.listingPage))`.
   *
   * ★ THE ONLY PROBE ON THIS CLASS WITH AN INTERNAL CALLER RATHER THAN A FAR-SIDE ONE, which is a
   * direct consequence of `listingPages` being the one association this side owns AND hand-writes
   * helpers for. Reference identity, because {@link ListingPageLink} carries no key accessor - the
   * three members it declares are exactly the three the helpers invoke.
   */
  hasListingPage(listingPage: ListingPageLink): boolean {
    return this.listingPages.includes(listingPage);
  }

  /**
   * Called by `PriceGroupRate.addProduct` [model/entity/PriceGroupRate.cfc:L222]:
   * `if(isNew() or !arguments.product.hasPriceGroupRate( this ))`.
   */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const candidateID: string = priceGroupRate.getPriceGroupRateID();
    if (candidateID === '') {
      return this.priceGroupRates.includes(priceGroupRate);
    }
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addProduct` [model/entity/PromotionReward.cfc:L261]:
   * `if(isNew() or !arguments.product.hasPromotionReward( this ))`.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addExcludedProduct` [model/entity/PromotionReward.cfc:L361]:
   * `if(isNew() or !arguments.product.hasPromotionRewardExclusion( this ))`.
   */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addProduct` [model/entity/PromotionQualifier.cfc:L203]:
   * `if(isNew() or !arguments.product.hasPromotionQualifier( this ))`.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addExcludedProduct` [model/entity/PromotionQualifier.cfc:L303]:
   * `if(isNew() or !arguments.product.hasPromotionQualifierExclusion( this ))`.
   */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `Vendor.addProduct` [model/entity/Vendor.cfc:L156]:
   * `if(isNew() or !arguments.product.hasVendor( this ))`.
   */
  hasVendor(vendor: ProductVendorLink): boolean {
    const candidateID: string = vendor.getVendorID();
    if (candidateID === '') {
      return this.vendors.includes(vendor);
    }
    return this.vendors.some((held: ProductVendorLink) => held.getVendorID() === candidateID);
  }

  /**
   * Called by `Physical.addProduct` [model/entity/Physical.cfc:L162]:
   * `if(isNew() or !arguments.product.hasPhysical( this ))`.
   */
  hasPhysical(physical: ProductPhysicalLink): boolean {
    const candidateID: string = physical.getPhysicalID();
    if (candidateID === '') {
      return this.physicals.includes(physical);
    }
    return this.physicals.some((held: ProductPhysicalLink) => held.getPhysicalID() === candidateID);
  }

  /**
   * Whether this product has never been persisted.
   * [org/Hibachi/HibachiEntity.cfc:L571-L576, L707-L709]
   *
   * The framework compares the primary key against the property's `unsavedvalue`, which
   * [model/entity/Product.cfc:L52] declares as `""`. TOTAL: it never throws.
   */
  isNew(): boolean {
    return this.productID === '';
  }

  // --- Pre-banner members [model/entity/Product.cfc:L125-L186] ---------------------------------
  //
  // The source declares these BEFORE its first section banner, in this order, and the order is
  // preserved so a reviewer diffing the two files reads the same sequence.

  /**
   * The LEAF product types under a base type, as `{name, value}` select rows.
   * [model/entity/Product.cfc:L125-L143]
   *
   *   public any function getProductTypeOptions( string baseProductType ) {
   *     if(!structKeyExists(variables, "productTypeOptions")) {
   *       if(!structKeyExists(arguments, "baseProductType")) {
   *         arguments.baseProductType = getProductType().getBaseProductType();
   *       }
   *       var smartList = getPropertyOptionsSmartList( "productType" );
   *       smartList.addLikeFilter( "productTypeIDPath", "#...getProductTypeID()#%" );
   *       smartList.addWhereCondition( "NOT EXISTS( SELECT pt FROM SlatwallProductType pt
   *                                     WHERE pt.parentProductType.productTypeID = ...)" );
   *       ... arrayAppend(variables.productTypeOptions,
   *             {name=records[i].getSimpleRepresentation(), value=records[i].getProductTypeID()});
   *     }
   *     return variables.productTypeOptions;
   *   }
   *
   * WHAT IS PORTED AND WHAT IS NOT, on the dividing line stated in the file header: the SMART LIST is
   * an input, so the already-prefix-filtered LEAF rows arrive at construction; the PROJECTION is this
   * entity's contribution and stays. Same split as `ProductType.getParentProductTypeOptions()`.
   *
   * ★ THE ARGUMENT IS OPTIONAL WITH NO DEFAULT, AND THAT IS OBSERVABLE. `string baseProductType`
   * [L125] declares no `="..."`, so omitting it takes the L127-L129 branch, which dereferences
   * `getProductType()` UNGUARDED. On a product with no product type the legacy therefore RAISES
   * before it ever reaches the query. The port reproduces that raise by dereferencing the product
   * type in exactly that case - and then discards the derived value, because the prefix filter has
   * already been applied upstream. Discarding it is not sloppiness: the value's only legacy use was
   * the filter, and dropping the dereference would silently make a raising call succeed.
   *
   * ★ AND IT CAN RAISE A SECOND WAY: a candidate row whose product type has no name cannot be
   * projected, because `ProductTypeOption.name` is a string. `ProductType.getSimpleRepresentation()`
   * types its return honestly as `string | undefined` - `productTypeName`
   * [model/entity/ProductType.cfc:L57] is a nullable column that model/validation/ProductType.json
   * requires in the SAVE context only - so the absent-name failure is raised HERE, at the projection
   * that cannot represent it, rather than inside the representation itself. The method still raises on
   * the same input; only the origin of the raise moved, and it moved to the line that actually has the
   * problem.
   *
   * ★ ASYNCHRONOUS, BECAUSE THE RAISE IT REPRODUCES IS. The L127-L129 branch derives the base type
   * through {@link Product.getBaseProductType}, which is async because
   * `ProductType.getBaseProductType()` reaches the repository for the root product type
   * [model/entity/ProductType.cfc:L112]. The derived value is still discarded - see above - but the
   * dereference and the round trip it entails are not, because dropping them would silently turn a
   * raising call into a succeeding one.
   */
  async getProductTypeOptions(baseProductType?: string): Promise<readonly ProductTypeOption[]> {
    // [model/entity/Product.cfc:L126] the memo guard, testing PRESENCE and not truthiness.
    if (this.productTypeOptions !== undefined) {
      return this.productTypeOptions;
    }

    // [model/entity/Product.cfc:L127-L129] reproduced for its RAISE, not for its value. See the doc.
    if (baseProductType === undefined) {
      if (this.productType === undefined) {
        throw new Error(
          'Product.getProductTypeOptions was called without a baseProductType on a product that ' +
            'has no product type. The legacy body at model/entity/Product.cfc:L127-L129 derives ' +
            'the base type with an unguarded getProductType().getBaseProductType(), which fails ' +
            'the same way on the same input.',
        );
      }
      // The derived value is deliberately unused - the prefix filter it fed has already been
      // applied by the repository that supplied `productTypeOptionCandidates`. It is still AWAITED
      // rather than left floating, because the dereference is reproduced for its RAISE and an
      // unawaited rejection would surface as an unhandled promise instead of as this call failing.
      await this.productType.getBaseProductType();
    }

    if (this.productTypeOptionCandidates === undefined) {
      throw new Error(
        'Product.getProductTypeOptions was called on a product hydrated without product-type ' +
          'option candidates. The legacy body at model/entity/Product.cfc:L130-L134 obtains them ' +
          'from a smart list filtered by productTypeIDPath prefix and restricted to leaf types, ' +
          'and that query is outside the domain in this port, so the rows must be supplied at ' +
          'construction. No default is substituted because an empty list is indistinguishable ' +
          'from a catalog that genuinely has no leaf types under the base.',
      );
    }

    // [model/entity/Product.cfc:L136-L140] the projection, verbatim: the framework's own
    // `alias="name"` / `alias="value"` key pair, built from the simple representation and the key.
    const options: ProductTypeOption[] = [];
    for (const candidate of this.productTypeOptionCandidates) {
      // `getSimpleRepresentation()` is honestly typed `string | undefined` because
      // `productTypeName` [model/entity/ProductType.cfc:L57] is nullable. A row that cannot name
      // itself cannot be projected into a `{name, value}` select option, so it raises here - see the
      // second raise note on this method's doc.
      const name: string | undefined = candidate.getSimpleRepresentation();
      if (name === undefined) {
        throw new Error(
          'Product.getProductTypeOptions cannot project product type ' +
            `'${candidate.getProductTypeID()}' into a select option because it has no ` +
            'productTypeName, so ProductType.getSimpleRepresentation() ' +
            '[model/entity/ProductType.cfc:L273-L278] resolves to nothing. The legacy projection at ' +
            'model/entity/Product.cfc:L137-L139 assigns that null straight into the option struct.',
        );
      }
      options.push({
        name,
        value: candidate.getProductTypeID(),
      });
    }

    this.productTypeOptions = options;
    return this.productTypeOptions;
  }

  // LEGACY-NOTE [model/entity/Product.cfc:L145-L152]: `getListingPagesOptionsSmartList()` IS
  // DELIBERATELY NOT PORTED. Its whole body memoizes
  // `getService("contentService").getContentSmartList()` and adds one `addOrder("title|ASC")`, so the
  // method IS the smart list - there is no local contribution to keep, and its only consumer is the
  // admin listing-page picker, which is out of scope. This is the third bullet of the smart-list
  // dividing line in the file header. Recorded rather than silently dropped, so the omission is
  // auditable.

  /**
   * Finds one of this product's SKUs by ID. [model/entity/Product.cfc:L162-L169]
   *
   *   public any function getSkuByID(required string skuID) {
   *     var skus = getSkus();
   *     for(var i = 1; i <= arrayLen(skus); i++) {
   *       if(skus[i].getSkuID() == arguments.skuID) { return skus[i]; }
   *     }
   *   }
   *
   * ★ IT FALLS OFF THE END WITH NO `return`, so a miss yields CFML null - which is `undefined` here,
   * and that is why the return type is widened rather than defaulted. Substituting a zero-ish or
   * empty-object answer would let a caller price the wrong sku.
   *
   * ★ THE COMPARISON IS CFML `==`, WHICH IS CASE-INSENSITIVE FOR STRINGS. A UUID key makes that
   * academic in practice, but the port folds both sides anyway rather than relying on the data's
   * shape - a case-sensitive `===` would MISS a row CFML finds, which is the more dangerous
   * direction.
   *
   * It searches `getSkus()` with NO arguments, so it sees the live materialized array and never
   * triggers the sorted or fetch-options paths.
   */
  getSkuByID(skuID: string): Sku | undefined {
    const needle: string = skuID.toLowerCase();
    for (const sku of this.getSkus()) {
      if (sku.getSkuID().toLowerCase() === needle) {
        return sku;
      }
    }
    return undefined;
  }

  /**
   * The display templates a product can be rendered with. [model/entity/Product.cfc:L171-L176]
   *
   *   if(!isDefined("variables.templateOptions")){
   *     variables.templateOptions = getService("ProductService").getProductTemplates();
   *   }
   *   return variables.templateOptions;
   *
   * ★ LEGACY-DEFECT D3 - THIS METHOD CANNOT SUCCEED IN THE LEGACY EITHER, and the mechanism is worth
   * spelling out because it is not a missing-method error. `getProductTemplates()` is declared
   * NOWHERE in the repository - verified by grep across every `.cfc` and `.cfm` - so the call reaches
   * `HibachiService.onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L263], which routes any
   * unmatched `get*` that does not end in `smartlist` to `onMissingGetMethod`
   * [org/Hibachi/HibachiService.cfc:L305-L328]. That helper strips the `get` prefix to get the entity
   * name `ProductTemplates`, finds no `by` in it, and then reads `missingMethodArguments[1]` for the
   * ID [L325] - but the call passes NO ARGUMENTS AT ALL, so the struct has no key `1` and the read
   * itself fails.
   *
   * Reproduced as a raise rather than repaired: authoring a working template lookup would be
   * inventing a capability the legacy never had, and returning `[]` would silently convert a hard
   * failure into an empty admin dropdown.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getTemplateOptions(): never {
    throw new Error(
      'Product.getTemplateOptions reproduces LEGACY-DEFECT [model/entity/Product.cfc:L173]: it ' +
        'calls getService("ProductService").getProductTemplates(), which is declared nowhere in ' +
        'the repository. The call falls through to HibachiService.onMissingMethod and then to ' +
        'onMissingGetMethod [org/Hibachi/HibachiService.cfc:L305-L326], which reads ' +
        'missingMethodArguments[1] for an entity ID that the argument-less call never supplied. ' +
        'The legacy fails on the same input.',
    );
  }

  /**
   * The alternate product images. [model/entity/Product.cfc:L177-L179]
   *
   *   public any function getImages() { return variables.productImages; }
   *
   * ★ A HAND-WRITTEN ALIAS OVER `productImages`, NOT A SECOND COLLECTION. It returns the same array
   * object as {@link Product.getProductImages}, which is why it is LIVE here too: an alias that
   * copied would break `Image.setProduct` [model/entity/Image.cfc:L158] for any caller that reached
   * the collection through this name. Both names are kept because both have callers - this one is
   * what {@link Product.getImageGalleryArray} uses [L288-L313].
   */
  getImages(): ProductImageLink[] {
    return this.productImages;
  }

  /**
   * The sale-price detail for one of this product's SKUs. [model/entity/Product.cfc:L181-L186]
   *
   *   public struct function getSkuSalePriceDetails( required any skuID ) {
   *     if(structKeyExists(getSalePriceDetailsForSkus(), arguments.skuID)) {
   *       return getSalePriceDetailsForSkus()[ arguments.skuID ];
   *     }
   *     return {};
   *   }
   *
   * ASYNC, because it reads through {@link Product.getSalePriceDetailsForSkus}, whose legacy body
   * reaches the DAO. The `required any skuID` parameter is narrowed to `string`; the legacy `any` is
   * a consequence of CFML having no narrower option, not a design choice.
   *
   * ★ A MISS ANSWERS `undefined`, NOT `{}` - a documented divergence, and the argument for it is the
   * same one that governs the currency accessors under AAP 0.6.3. The legacy `{}` is a struct whose
   * every key is absent, so every downstream `structKeyExists(details,'salePrice')` test fails and
   * every read of `details.salePrice` raises. `undefined` reproduces exactly that pair of outcomes in
   * TypeScript - a property test fails, a property read is a type error - while ALSO being
   * distinguishable at the type level, which `{}` typed as `SalePriceDetail` would not be. Returning
   * a `SalePriceDetail`-shaped object with zeroed money would be the dangerous alternative: it would
   * put a sale price of zero on a sku that has no sale.
   */
  async getSkuSalePriceDetails(skuID: string): Promise<SalePriceDetail | undefined> {
    const details: Readonly<Record<string, SalePriceDetail>> =
      await this.getSalePriceDetailsForSkus();

    // [model/entity/Product.cfc:L182] `structKeyExists` on a struct keyed by skuID. CFML struct keys
    // are CASE-INSENSITIVE, so a lookup that differs only in case still hits; the port therefore
    // matches the key case-insensitively rather than relying on `Object.hasOwn`.
    const needle: string = skuID.toLowerCase();
    for (const [key, detail] of Object.entries(details)) {
      if (key.toLowerCase() === needle) {
        return detail;
      }
    }

    return undefined;
  }

  // --- Non-Persistent Helpers [model/entity/Product.cfc:L188] ----------------------------------
  //
  // The source's own comment banner. Its members run from L191 to L248.

  /**
   * The IDs of the pages this product is listed on. [model/entity/Product.cfc:L191-L197]
   *
   *   public string function getPageIDs() {
   *     var pageIDs = "";
   *     for( var i=1; i<= arrayLen(getPages()); i++ ) {
   *       pageIDs = listAppend(pageIDs,getPages()[i].getPageID());
   *     }
   *     return pageIDs;
   *   }
   *
   * ★ LEGACY-DEFECT D2 - `getPages()` DOES NOT EXIST. The property is `listingPages` [L79], and no
   * `pages` property, alias or method is declared anywhere on this component or its two base classes.
   *
   * THE FAILURE PATH IS TWO STEPS, NOT ONE, AND THAT MATTERS FOR THE MESSAGE. `getPages` reaches
   * `HibachiEntity.onMissingMethod` [org/Hibachi/HibachiEntity.cfc:L507-L565] and matches NONE of the
   * ten prefix/suffix conventions - it is not `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, and it ends
   * in neither `AssignedIDList`, `ID`, `Options`, `OptionsSmartList`, `SmartList`, `Struct` nor
   * `Count`. It therefore reaches the LAST branch [L559-L561], which fires because this entity
   * declares `attributeValues` [L75], and returns `getAttributeValue("Pages")` - the EMPTY STRING
   * [model/entity/HibachiEntity.cfc:L151]. The L565 throw is never reached. The actual failure is the
   * NEXT line: `arrayLen("")` on a string.
   *
   * Reproduced as a raise. Note there is a correct implementation sitting right beside it -
   * {@link Product.getCategoryIDs} is the same loop over `getCategories()` and it works - so the fix
   * is obvious and is still not applied, because a method that fails today must fail identically
   * after the port.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getPageIDs(): never {
    throw new Error(
      'Product.getPageIDs reproduces LEGACY-DEFECT [model/entity/Product.cfc:L193]: it iterates ' +
        'getPages(), but this entity declares no such property - the collection is listingPages ' +
        '[model/entity/Product.cfc:L79]. In the legacy the call reaches the onMissingMethod ' +
        'attribute-value fallback [org/Hibachi/HibachiEntity.cfc:L559-L561], which returns the ' +
        'empty string, and arrayLen("") then fails. Compare getCategoryIDs(), which is the same ' +
        'loop written correctly.',
    );
  }

  /**
   * The IDs of the categories this product belongs to, as a comma list.
   * [model/entity/Product.cfc:L199-L205]
   *
   *   var categoryIDs = "";
   *   for( var i=1; i<= arrayLen(getCategories()); i++ ) {
   *     categoryIDs = listAppend(categoryIDs,getCategories()[i].getCategoryID());
   *   }
   *   return categoryIDs;
   *
   * ★ THE COMMA-LIST RETURN IS PRESERVED RATHER THAN BECOMING `string[]`, because the list stays a
   * string right up to the query layer everywhere in this port - the same discipline
   * `getUnusedProductOptions`' `existingOptionGroupIDList` parameter follows. `listAppend` is the
   * ported CFML helper, so the empty-list behaviour matches exactly: an empty collection yields `''`
   * rather than `','`.
   *
   * TOTAL: it never throws. An empty collection yields the empty string, which is truthful rather
   * than a substituted default.
   */
  getCategoryIDs(): string {
    let categoryIDs: string = '';
    for (const category of this.getCategories()) {
      categoryIDs = listAppend(categoryIDs, category.getCategoryID());
    }
    return categoryIDs;
  }

  /**
   * The product's public URL. [model/entity/Product.cfc:L207-L209]
   *
   *   public string function getProductURL() {
   *     return "/#setting('globalURLKeyProduct')#/#getURLTitle()#/";
   *   }
   *
   * ★ THE ONE METHOD ON THIS ENTIRE PORT WITH GENUINE LEGACY TEST PARITY.
   * meta/tests/unit/entity/ProductTest.cfc's `productUrlIsCorrectlyFormatted()` pins it, asserting
   * the result equals `/<globalURLKeyProduct>/nike-air-jorden/` with that fixture spelling - typo
   * included - retained verbatim. The leading AND trailing slashes are both part of the asserted
   * value, which is why neither is trimmed and why the sibling
   * {@link Product.getListingProductURL} is a genuinely different string rather than a duplicate.
   *
   * `globalURLKeyProduct` IS one of the four AAP-approved setting keys, and it still arrives
   * pre-resolved - see {@link Product.globalURLKeyProductSetting} for why an entity holding a port to
   * read one string is the wrong trade.
   *
   * IT RAISES ON EITHER MISSING INPUT, and the reasoning is the standard one: `returntype="string"`
   * leaves no spare value, and both plausible defaults produce a WELL-FORMED WRONG URL rather than a
   * detectable marker - `//nike-air-jorden/` for an absent key, `/sp//` for an absent slug. A wrong
   * URL is not a detectable failure, it is a 404 or, worse, another product's page.
   */
  getProductURL(): string {
    if (this.globalURLKeyProductSetting === undefined) {
      throw new Error(
        'Product.getProductURL was called on a product hydrated without a resolved ' +
          "globalURLKeyProduct setting. The legacy body reads setting('globalURLKeyProduct') " +
          '[model/entity/Product.cfc:L208], whose default is "sp" ' +
          '[model/service/SettingService.cfc:L178]; that resolution happens at the boundary in ' +
          'this port, so the value must be supplied at construction. No default is substituted ' +
          'because every candidate produces a well-formed wrong URL rather than a detectable marker.',
      );
    }
    if (this.urlTitle === undefined) {
      throw new Error(
        'Product.getProductURL was called on a product with no urlTitle. The legacy interpolates ' +
          'getURLTitle() directly [model/entity/Product.cfc:L208] and would emit a URL with an ' +
          'empty path segment, which resolves to a different page rather than failing.',
      );
    }

    // [model/entity/Product.cfc:L208] verbatim, including both slashes.
    return `/${this.globalURLKeyProductSetting}/${this.urlTitle}/`;
  }

  /**
   * The product's URL as embedded in a listing page. [model/entity/Product.cfc:L211-L213]
   *
   *   return "#setting('globalURLKeyProduct')#/#getURLTitle()#/";
   *
   * ★ IDENTICAL TO {@link Product.getProductURL} EXCEPT FOR THE LEADING SLASH, and the difference is
   * deliberate on the source's part: this form is concatenated onto a listing page's own path, so a
   * leading slash would make it absolute and discard that prefix. Both methods are kept, and neither
   * delegates to the other, because the legacy keeps them separate and a shared helper would invite
   * exactly the "harmless" normalisation that breaks one of the two.
   *
   * Raises on the same two missing inputs, for the same reasons.
   */
  getListingProductURL(): string {
    if (this.globalURLKeyProductSetting === undefined) {
      throw new Error(
        'Product.getListingProductURL was called on a product hydrated without a resolved ' +
          'globalURLKeyProduct setting. See getProductURL() for the full reasoning; the two ' +
          'methods differ only in the leading slash [model/entity/Product.cfc:L208 vs L212].',
      );
    }
    if (this.urlTitle === undefined) {
      throw new Error(
        'Product.getListingProductURL was called on a product with no urlTitle. See ' +
          'getProductURL() for the full reasoning.',
      );
    }

    // [model/entity/Product.cfc:L212] verbatim - NO leading slash, trailing slash retained.
    return `${this.globalURLKeyProductSetting}/${this.urlTitle}/`;
  }

  /**
   * The display template for this product. [model/entity/Product.cfc:L215-L221]
   *
   *   if(!structKeyExists(variables, "template") || variables.template == "") {
   *     return setting('productDisplayTemplate');
   *   } else {
   *     return variables.template;
   *   }
   *
   * ★ LEGACY-DEFECT D4 - THE `else` BRANCH IS UNREACHABLE. `template` is NOT a declared property of
   * this component: it appears in no `property` tag, `populate()` only writes declared properties, and
   * the only `setTemplate(` call in the whole repository
   * [integrationServices/mura/model/handler/MuraEventHandler.cfc:L821] targets a MURA PAGE object,
   * not a Slatwall product. So `structKeyExists(variables, "template")` is always false, the
   * short-circuit fires on the first disjunct, and the method always returns the setting.
   *
   * The port therefore holds NO `template` field. Adding one to preserve a branch nothing can enter
   * would be adding dead state, and the shape of the source is recorded here instead - which is the
   * auditable form of the same information. The `|| variables.template == ""` half is doubly
   * unreachable and is recorded for the same reason.
   *
   * `productDisplayTemplate` is NOT one of the four approved setting keys, so it arrives pre-resolved
   * and the method raises when it was not supplied.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getTemplate(): string {
    if (this.productDisplayTemplateSetting === undefined) {
      throw new Error(
        'Product.getTemplate was called on a product hydrated without a resolved ' +
          "productDisplayTemplate setting. The legacy body reads setting('productDisplayTemplate') " +
          '[model/entity/Product.cfc:L187], and productDisplayTemplate is not one of the four ' +
          'settings keys this port exposes to the domain, so the value must be supplied at ' +
          'construction. No default is substituted because a wrong template name renders the ' +
          'wrong page rather than failing.',
      );
    }
    return this.productDisplayTemplateSetting;
  }

  /**
   * The directory this product's ALTERNATE images live in. [model/entity/Product.cfc:L223-L225]
   *
   *   public string function getAlternateImageDirectory() {
   *     return getURLFromPath(setting('globalAssetsImageFolderPath')) & '/product/';
   *   }
   *
   * ★ THE SAME SHAPE AS `Option.getImageDirectory` IN src/domain/entities/option.ts, DOWN TO THE
   * WART. This entity contributes exactly `& '/product/'`; the `assetsImageBaseUrl` field holds the
   * already-resolved `getURLFromPath(setting('globalAssetsImageFolderPath'))`, so no setting is read
   * here and no framework helper is re-implemented here. `getURLFromPath` belongs to the unported
   * Hibachi base and `globalAssetsImageFolderPath` is not an approved settings key, which is why both
   * inner calls happen at the boundary.
   *
   * THE CONCATENATION IS VERBATIM INCLUDING ITS WART: the separator before `product` is
   * unconditional, so a base that already ends in one produces a DOUBLED separator -
   * `.../images//product/`. Reproduced rather than tidied, because normalising it here would make
   * this port emit a different path than the CFML application does for the same setting value, and
   * both write into the same filesystem. A trailing-slash policy, if one is ever wanted, belongs at
   * the boundary that resolves the base, where it applies to every consumer at once.
   *
   * IT RAISES WHEN THE BASE WAS NOT MATERIALIZED. `returntype="string"` leaves no spare value, and
   * `'/product/'` would be a well-formed WRONG directory rather than a detectable marker - and the
   * legacy consumers of this value do file existence checks, deletes and moves against it. Returning
   * a wrong directory to code that deletes files is the one outcome worse than raising.
   */
  getAlternateImageDirectory(): string {
    if (this.assetsImageBaseUrl === undefined) {
      throw new Error(
        'Product.getAlternateImageDirectory was called on a product hydrated without an assets ' +
          'image base URL. The legacy body at model/entity/Product.cfc:L224 resolves its base ' +
          "through getURLFromPath(setting('globalAssetsImageFolderPath')), and both of those calls " +
          'are outside the domain in this port, so the resolved base must be supplied at ' +
          'construction. No default is substituted because every candidate value would be a ' +
          'well-formed wrong path rather than a detectable marker.',
      );
    }

    // [model/entity/Product.cfc:L224] verbatim: `<base> & '/product/'`.
    return `${this.assetsImageBaseUrl}/product/`;
  }

  /**
   * The product's average review rating. [model/entity/Product.cfc:L227-L239]
   *
   *   var totalRatingPoints = 0;
   *   var averageRating = 0;
   *   if(arrayLen(getProductReviews())) {
   *     for(var i=1; i<=arrayLen(getProductReviews()); i++) {
   *       var totalRatingPoints += getProductReviews()[1].getRating();
   *     }
   *     averageRating = totalRatingPoints / arrayLen(getProductReviews());
   *   }
   *   return averageRating;
   *
   * ★ LEGACY-DEFECT D1 - THE LOOP INDEXES `[1]`, NOT `[i]`. It therefore adds REVIEW #1's rating
   * once per review and divides by the review count, so the "average" is always review #1's rating
   * exactly - `(r1 * n) / n`. Reviews 2..n are read from the database, iterated over, and ignored.
   *
   * A SECOND WART IN THE SAME LINE: `var totalRatingPoints +=` re-declares the variable INSIDE the
   * loop body with a compound assignment. CFML tolerates the redundant `var` and treats it as an
   * assignment to the existing function-scoped variable, so the accumulation does happen - but the
   * line reads as though it should reset each iteration, and a reviewer needs to know it does not.
   *
   * BOTH ARE REPRODUCED, and the arithmetic is written to make the defect legible rather than to hide
   * it behind a `* n / n` simplification: the loop really does run `n` times and really does add the
   * same value each time, so a test that spies on `getRating()` sees `n` calls on review #1 and none
   * on the others. Simplifying to `firstRating` would be observationally equal in the RESULT and
   * unequal in the CALLS, and the calls are what a characterization test pins.
   *
   * TOTAL: it never throws. No reviews yields `0`, which is the source's own initialisation and not a
   * substituted default.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getProductRating(): number {
    let totalRatingPoints: number = 0;
    let averageRating: number = 0;

    const reviews: readonly ProductReviewLink[] = this.getProductReviews();

    // [model/entity/Product.cfc:L232] `if(arrayLen(getProductReviews()))` - CFML numeric truthiness,
    // i.e. non-zero. The guard is what keeps the division below from dividing by zero.
    if (reviews.length > 0) {
      const firstReview: ProductReviewLink | undefined = reviews[0];
      for (let i: number = 0; i < reviews.length; i += 1) {
        // *** LEGACY-DEFECT [model/entity/Product.cfc:L233]: indexes `getProductReviews()[1]`
        // inside a loop counted by `i`, so every iteration adds the FIRST review's rating.
        // Preserved deliberately; do not fix without a product decision.
        if (firstReview !== undefined) {
          totalRatingPoints += firstReview.getRating();
        }
      }
      averageRating = totalRatingPoints / reviews.length;
    }

    return averageRating;
  }

  /**
   * This product's option groups, keyed by option-group ID. [model/entity/Product.cfc:L241-L248]
   *
   *   if( !structKeyExists(variables, "optionGroupsStruct") ) {
   *     variables.optionGroupsStruct = {};
   *     for(var optionGroup in getOptionGroups()){
   *       variables.optionGroupsStruct[optionGroup.getOptionGroupID()] = optionGroup;
   *     }
   *   }
   *   return variables.optionGroupsStruct;
   *
   * Built over {@link Product.getOptionGroups}, so it inherits that method's in-memory derivation and
   * its fetch-shape caveat. Its only consumers are `structKeyList(...)` calls in
   * {@link Product.getUnusedProductOptions} and {@link Product.getUnusedProductOptionGroups}.
   *
   * ★ AND THE KEY ORDER THOSE CONSUMERS SEE IS NON-DETERMINISTIC IN THE LEGACY, which is worth
   * stating so nobody "fixes" it later: a plain CFML struct is an unordered hash map, so
   * `structKeyList()` emits keys in hash order rather than insertion order. Any total order therefore
   * complies with the source, and both consumers pass the list into an SQL `IN (...)` predicate where
   * order is irrelevant anyway. This port emits insertion order because that is what a JavaScript
   * object with string keys gives, not because the source specifies it.
   *
   * TOTAL: it never throws.
   */
  getOptionGroupsStruct(): Readonly<Record<string, OptionGroup>> {
    if (this.optionGroupsStruct !== undefined) {
      return this.optionGroupsStruct;
    }

    const struct: Record<string, OptionGroup> = {};
    for (const optionGroup of this.getOptionGroups()) {
      struct[optionGroup.getOptionGroupID()] = optionGroup;
    }

    this.optionGroupsStruct = struct;
    return this.optionGroupsStruct;
  }

  /**
   * The distinct option groups used by this product's SKUs, ordered by sort order.
   * [model/entity/Product.cfc:L250-L259]
   *
   *   if( !structKeyExists(variables, "optionGroups") ) {
   *     variables.optionGroups = [];
   *     var smartList = getService("OptionService").getOptionGroupSmartList();
   *     smartList.setSelectDistinctFlag(1);
   *     smartList.addFilter("options.skus.product.productID", this.getProductID());
   *     smartList.addOrder("sortOrder|ASC");
   *     variables.optionGroups = smartList.getRecords();
   *   }
   *   return variables.optionGroups;
   *
   * ★ PORTED IN MEMORY, NOT STUBBED, AND THE JUSTIFICATION IS MECHANICAL: the smart list's ONLY
   * filter is `options.skus.product.productID = <this product>`, so it re-queries precisely the
   * subgraph this entity already holds - `this.skus` -> `sku.getOptions()` -> `option.getOptionGroup()`.
   * Nothing outside the product is read. That is the first bullet of the smart-list dividing line in
   * the file header, and it is why this method stays SYNCHRONOUS despite its legacy body querying.
   *
   * THREE FIDELITY POINTS.
   *
   *   1. `setSelectDistinctFlag(1)` [L253] is why the same option group reached through two different
   *      SKUs appears ONCE. Distinctness is by option-group ID, which is the projection SQL DISTINCT
   *      would compare.
   *   2. `addOrder("sortOrder|ASC")` [L255] is the ONLY ordering, and `OptionGroup.getSortOrder()` is
   *      non-optional in this port, so no null-ordering question arises. Ties are database-ordered in
   *      the legacy, i.e. NON-DETERMINISTIC; the port uses a stable sort so ties keep encounter order,
   *      and any total order complies with the source.
   *   3. An option whose `optionGroup` is absent contributes NOTHING. The smart list navigates
   *      `options.skus...` from the OptionGroup side, so a group-less option cannot appear in the
   *      result at all - the join has nothing to match. The `undefined` skip below is that join, not a
   *      defensive guard.
   *
   * AN EMPTY RESULT IS A FETCH-SHAPE STATEMENT, NOT A DOMAIN CLAIM. The legacy queried the database
   * and so saw every sku of the product regardless of what was loaded; this port sees the materialized
   * skus. A repository method that fetched skus without their options will answer `[]` here, and that
   * is a property of the fetch shape it chose.
   *
   * TOTAL: it never throws.
   */
  getOptionGroups(): readonly OptionGroup[] {
    if (this.optionGroups !== undefined) {
      return this.optionGroups;
    }

    // Distinctness by option-group ID, insertion-ordered so the stable sort below is meaningful.
    const distinct: Map<string, OptionGroup> = new Map<string, OptionGroup>();
    for (const sku of this.skus) {
      for (const option of sku.getOptions()) {
        const optionGroup: OptionGroup | undefined = option.getOptionGroup();
        if (optionGroup === undefined) {
          // The legacy INNER JOIN from OptionGroup through options has nothing to match here.
          continue;
        }
        const key: string = optionGroup.getOptionGroupID();
        if (!distinct.has(key)) {
          distinct.set(key, optionGroup);
        }
      }
    }

    // [model/entity/Product.cfc:L255] `addOrder("sortOrder|ASC")`. `Array.prototype.sort` is stable,
    // so equal sort orders retain encounter order - see fidelity point 2.
    const ordered: OptionGroup[] = [...distinct.values()].sort(
      (left: OptionGroup, right: OptionGroup) => left.getSortOrder() - right.getSortOrder(),
    );

    this.optionGroups = ordered;
    return this.optionGroups;
  }

  /**
   * How many distinct option groups this product's SKUs use. [model/entity/Product.cfc:L261-L263]
   *
   *   return arrayLen(getOptionGroups());
   *
   * A one-line delegation, kept as its own member because it is part of the public surface and
   * because callers use it as a cheap "is this product optioned at all" test. It inherits
   * {@link Product.getOptionGroups}' memo, so repeated calls do not re-derive.
   *
   * TOTAL: it never throws.
   */
  getOptionGroupCount(): number {
    return this.getOptionGroups().length;
  }

  /**
   * A flattened gallery of every image this product can show. [model/entity/Product.cfc:L265-L316]
   *
   * The body is two loops sharing ONE dedupe list. Loop A [L269-L286] walks the SKUs and emits their
   * DEFAULT images; loop B [L288-L314] walks `getImages()` and emits the product's ALTERNATE images.
   *
   * ★ LEGACY-DEFECT D6, AND IT IS TWO DEFECTS IN ONE METHOD.
   *
   *   (a) THE DEDUPE KEYS DISAGREE ACROSS THE TWO LOOPS while the list is shared. Loop A tests and
   *       appends the image FILENAME [L271-L272]; loop B tests and appends the image ID [L289-L290].
   *       So an alternate image whose ID happens to equal some sku's filename would be dropped, and
   *       - far more likely - two alternate images of the same FILE are both emitted because their
   *       IDs differ. Reproduced exactly, including the shared list.
   *   (b) THE DESCRIPTION IS WRITTEN INTO `name`. Loop B sets `thisImage.description = ""` [L302] and
   *       then, if the image has a description, assigns it to `thisImage.name` [L303-L305] instead of
   *       to `thisImage.description` - overwriting the name it set two lines earlier from
   *       `getImageName()` [L296-L298]. The `description` key therefore stays empty for every
   *       alternate image, and an image with both a name and a description shows the DESCRIPTION as
   *       its name.
   *
   * A THIRD ASYMMETRY THAT IS NOT A DEFECT: loop B sets `skuID = ""` [L295] and loop A sets no `skuID`
   * key at all. See {@link ImageGalleryEntry} for why that is expressed as an optional key rather than
   * normalised.
   *
   * ★ AND NOTE WHAT LOOP A USES FOR ITS `name` AND `description`: `getTitle()` [L276] and
   * `getProductDescription()` [L277] - the PRODUCT'S, not the sku's. So every sku-default entry
   * carries identical text. That is the source's choice and is preserved.
   *
   * THIS METHOD RAISES TRANSITIVELY, AND THAT IS EXPECTED. `getResizedImagePath()` on both a sku
   * [model/entity/Sku.cfc:L192-L219] and an image [model/entity/Image.cfc:L120] reaches
   * `imageService`, which the plan makes a STUB PORT - subscription and image handling are out of
   * scope. `getTitle()` likewise raises unless a resolved title was materialized. Both are recorded
   * rather than worked around: the gallery's STRUCTURE is real behaviour worth porting, and its
   * consumers are the out-of-scope admin and storefront views.
   *
   * `resizeSizes` keeps its source default `[{size:'s'},{size:'m'},{size:'l'}]` [L265] verbatim,
   * lower-case single letters included - `Sku.getResizedImagePath`'s deprecated size branch lower-cases
   * and then maps them to `Small`/`Medium`/`Large` [model/entity/Sku.cfc:L201-L208].
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getImageGalleryArray(
    resizeSizes: readonly ImageResizeOptions[] = [{ size: 's' }, { size: 'm' }, { size: 'l' }],
  ): readonly ImageGalleryEntry[] {
    const imageGalleryArray: ImageGalleryEntry[] = [];

    // [model/entity/Product.cfc:L267] `var filenames = "";` - ONE list shared by both loops, which is
    // half of defect D6(a). Modelled as the CFML comma list it is, through the ported helpers, so the
    // empty-element behaviour matches: `listAppend('', '')` stays `''` and `listToArray('')` is `[]`,
    // which means a sku with no image file is NOT deduped against the next one.
    let filenames: string = '';

    // --- Loop A [model/entity/Product.cfc:L269-L286]: every sku's default image.
    for (const sku of this.getSkus()) {
      const imageFile: string | undefined = sku.getImageFile();

      // [L271] `if( !listFind(filenames, getSkus()[i].getImageFile()) )` - CASE-SENSITIVE exact
      // element match, which is why the comparison below is `===` and not folded.
      if (!listToArray(filenames).includes(imageFile ?? '')) {
        filenames = listAppend(filenames, imageFile ?? '');

        const resizedImagePaths: string[] = [];
        for (const resizeSize of resizeSizes) {
          // [L283] `getResizedImagePath(argumentCollection = arguments.resizeSizes[s])`.
          resizedImagePaths.push(sku.getResizedImagePath(resizeSize));
        }

        imageGalleryArray.push({
          originalFilename: imageFile,
          originalPath: sku.getImagePath(),
          type: 'skuDefaultImage',
          // ★ NO `skuID` KEY - loop B sets one, loop A does not. See ImageGalleryEntry.
          productID: this.getProductID(),
          // ★ THE PRODUCT'S title and description, not the sku's [L276-L277].
          name: this.getTitle(),
          description: this.getProductDescription() ?? '',
          resizedImagePaths,
        });
      }
    }

    // --- Loop B [model/entity/Product.cfc:L288-L314]: every alternate product image.
    for (const image of this.getImages()) {
      // *** LEGACY-DEFECT [model/entity/Product.cfc:L289]: tests the image ID against a list that
      // loop A filled with image FILENAMES. The two loops share one list and key it differently.
      // Preserved deliberately; do not fix without a product decision.
      const imageID: string = image.getImageID();
      if (!listToArray(filenames).includes(imageID)) {
        filenames = listAppend(filenames, imageID);

        // [L296-L298] the name defaults to `""` and is replaced only when `getImageName()` is
        // non-null.
        let name: string = '';
        const imageName: string | undefined = image.getImageName();
        if (imageName !== undefined) {
          name = imageName;
        }

        // [L302-L305] the description is initialised to `""` and then NEVER reassigned, because the
        // conditional below writes to `name` instead.
        const description: string = '';
        const imageDescription: string | undefined = image.getImageDescription();
        if (imageDescription !== undefined) {
          // *** LEGACY-DEFECT [model/entity/Product.cfc:L304]: assigns the image DESCRIPTION to the
          // `name` key rather than to `description`, discarding the name set three lines earlier and
          // leaving `description` permanently empty.
          // Preserved deliberately; do not fix without a product decision.
          name = imageDescription;
        }

        const resizedImagePaths: string[] = [];
        for (const resizeSize of resizeSizes) {
          // [L311] `getResizedImagePath(argumentCollection = arguments.resizeSizes[s])`.
          resizedImagePaths.push(image.getResizedImagePath(resizeSize));
        }

        imageGalleryArray.push({
          originalFilename: image.getImageFile(),
          originalPath: image.getImagePath(),
          type: 'productAlternateImage',
          // [L295] `thisImage.skuID = "";` - the empty string, not the owning sku's ID.
          skuID: '',
          productID: this.getProductID(),
          name,
          description,
          resizedImagePaths,
        });
      }
    }

    return imageGalleryArray;
  }

  // --- Functions that delegate to the default sku [model/entity/Product.cfc:L318] --------------
  //
  // The source opens this run with the comment `// Start: Functions that delegate to the default sku`
  // and it covers L319 to L338. FIVE MEMBERS, and NONE of them guards `getDefaultSku()` - every one
  // dereferences it directly, so every one raises on a product without a default sku. That is
  // reproduced: the guarded form appears further down in the PRICE delegators [L554-L602], and the
  // difference between the two runs is the source's, not an oversight of this port.

  /**
   * The directory this product's DEFAULT image lives in. [model/entity/Product.cfc:L319-L321]
   *
   *   public string function getImageDirectory() {
   *     return getDefaultSku().getImageDirectory();
   *   }
   *
   * ★ THE DELEGATE DOES NOT EXIST, AND THE RESULT IS SILENT RATHER THAN LOUD. `model/entity/Sku.cfc`
   * declares NO `getImageDirectory` - verified by grep, which finds `getImagePath`, `getImage`,
   * `getResizedImagePath`, `getImageExistsFlag` and `getImageFile` but not this one. So the call
   * reaches `HibachiEntity.onMissingMethod`, matches none of the ten conventions, and lands on the
   * attribute-value fallback [org/Hibachi/HibachiEntity.cfc:L559-L561] - which FIRES, because
   * `Sku` declares `attributeValues` [model/entity/Sku.cfc:L70]. `getAttributeValue("ImageDirectory")`
   * returns the EMPTY STRING [model/entity/HibachiEntity.cfc:L151], `returntype="string"` accepts it,
   * and the caller gets `''` with no error at all.
   *
   * SO THIS PORT RETURNS `''`, AND DOES NOT AUTHOR A `getImageDirectory` ON `Sku`. Adding one there
   * would be inventing a method the CFC does not declare and would change the observable answer from
   * `''` to a real path - which is a behaviour change dressed up as a fix. The empty string is
   * reproduced HERE, where the mechanism can be documented, rather than papered over THERE.
   *
   * The `getDefaultSku()` dereference is still performed, because it is what raises on a product with
   * no default sku - the one failure this method really does have.
   *
   * Contrast {@link Product.getAlternateImageDirectory}, which is a genuinely working sibling for the
   * product's non-default images.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getImageDirectory(): string {
    if (this.defaultSku === undefined) {
      throw new Error(
        'Product.getImageDirectory dereferences getDefaultSku() unguarded ' +
          '[model/entity/Product.cfc:L320] and this product has no default sku. The legacy fails ' +
          'on the same input.',
      );
    }

    // *** LEGACY-DEFECT [model/entity/Product.cfc:L320]: model/entity/Sku.cfc declares no
    // getImageDirectory, so the legacy call falls through to the onMissingMethod attribute-value
    // fallback [org/Hibachi/HibachiEntity.cfc:L559-L561] and silently yields the empty string.
    // Preserved deliberately; do not fix without a product decision.
    return '';
  }

  /**
   * The URL of this product's default image. [model/entity/Product.cfc:L323-L325]
   *
   *   return getDefaultSku().getImagePath();
   *
   * A real delegation - `Sku.getImagePath()` exists [model/entity/Sku.cfc:L144-L146] and builds
   * `<baseImageURL>/product/default/<imageFile>`. Unguarded, so it raises without a default sku.
   */
  getImagePath(): string {
    if (this.defaultSku === undefined) {
      throw new Error(
        'Product.getImagePath dereferences getDefaultSku() unguarded ' +
          '[model/entity/Product.cfc:L324] and this product has no default sku. The legacy fails ' +
          'on the same input.',
      );
    }
    return this.defaultSku.getImagePath();
  }

  /**
   * A rendered `<img>` for this product's default image. [model/entity/Product.cfc:L327-L329]
   *
   *   return getDefaultSku().getImage(argumentCollection = arguments);
   *
   * `argumentCollection = arguments` forwards whatever the caller passed, which is why the parameter
   * is the same optional {@link ImageResizeOptions} bag the sku's own method reads. Raises transitively
   * once it reaches the stubbed image service; see {@link Product.getImageGalleryArray}.
   */
  getImage(options?: ImageResizeOptions): string {
    if (this.defaultSku === undefined) {
      throw new Error(
        'Product.getImage dereferences getDefaultSku() unguarded ' +
          '[model/entity/Product.cfc:L328] and this product has no default sku. The legacy fails ' +
          'on the same input.',
      );
    }
    return this.defaultSku.getImage(options);
  }

  /**
   * The path of a resized version of this product's default image.
   * [model/entity/Product.cfc:L331-L333]
   *
   *   return getDefaultSku().getResizedImagePath(argumentCollection = arguments);
   */
  getResizedImagePath(options?: ImageResizeOptions): string {
    if (this.defaultSku === undefined) {
      throw new Error(
        'Product.getResizedImagePath dereferences getDefaultSku() unguarded ' +
          '[model/entity/Product.cfc:L332] and this product has no default sku. The legacy fails ' +
          'on the same input.',
      );
    }
    return this.defaultSku.getResizedImagePath(options);
  }

  /**
   * Whether the default image file is actually on disk. [model/entity/Product.cfc:L335-L337]
   *
   *   return getDefaultSku().getImageExistsFlag();
   *
   * The delegate performs a real filesystem check - `fileExists(expandPath(getImagePath()))`
   * [model/entity/Sku.cfc:L221-L227] - so what this returns depends on the deployment's filesystem,
   * not on the database.
   */
  getImageExistsFlag(): boolean {
    if (this.defaultSku === undefined) {
      throw new Error(
        'Product.getImageExistsFlag dereferences getDefaultSku() unguarded ' +
          '[model/entity/Product.cfc:L336] and this product has no default sku. The legacy fails ' +
          'on the same input.',
      );
    }
    return this.defaultSku.getImageExistsFlag();
  }

  /**
   * The distinct options in one option group that this product's SKUs actually use.
   * [model/entity/Product.cfc:L339-L346]
   *
   *   var smartList = getService("optionService").getOptionSmartList();
   *   smartList.setSelectDistinctFlag(1);
   *   smartList.addFilter("optionGroup.optionGroupID", arguments.optionGroupID);
   *   smartList.addFilter("skus.product.productID", this.getProductID());
   *   smartList.addOrder("sortOrder|ASC");
   *   return smartList.getRecords();
   *
   * PORTED IN MEMORY for the same mechanical reason as {@link Product.getOptionGroups}: both filters
   * are satisfiable from `this.skus` -> `sku.getOptions()`, and nothing outside the product is read.
   * SYNCHRONOUS, and NOT memoized - the legacy memoizes nothing here either, because the answer
   * depends on the argument.
   *
   * THREE FIDELITY POINTS.
   *   1. Distinctness [L341] is by option ID.
   *   2. `optionGroup.optionGroupID` [L342] is compared CASE-INSENSITIVELY, because a CFML smart-list
   *      filter compares through the database and MySQL's default collation is case-insensitive; a
   *      case-sensitive match here would MISS rows the legacy finds.
   *   3. `addOrder("sortOrder|ASC")` [L344] orders by `Option.getSortOrder()`, which is OPTIONAL on
   *      that entity - unlike `OptionGroup`'s. A NULL sort order sorts FIRST in MySQL's `ASC`, so
   *      absent values are treated as ordering below every present one rather than being dropped or
   *      pushed to the end.
   *
   * TOTAL: it never throws. An empty result means either that no materialized sku uses that group or
   * that the skus were fetched without their options - a fetch-shape statement, not a domain claim.
   */
  getOptionsByOptionGroup(optionGroupID: string): readonly Option[] {
    const needle: string = optionGroupID.toLowerCase();
    const distinct: Map<string, Option> = new Map<string, Option>();

    for (const sku of this.skus) {
      for (const option of sku.getOptions()) {
        const optionGroup: OptionGroup | undefined = option.getOptionGroup();
        if (optionGroup === undefined) {
          // The legacy filter navigates `optionGroup.optionGroupID`, so a group-less option cannot
          // satisfy it.
          continue;
        }
        if (optionGroup.getOptionGroupID().toLowerCase() !== needle) {
          continue;
        }
        const key: string = option.getOptionID();
        if (!distinct.has(key)) {
          distinct.set(key, option);
        }
      }
    }

    // [model/entity/Product.cfc:L344] `sortOrder|ASC`, with NULL ordering first - see point 3.
    return [...distinct.values()].sort((left: Option, right: Option) => {
      const leftOrder: number = left.getSortOrder() ?? Number.NEGATIVE_INFINITY;
      const rightOrder: number = right.getSortOrder() ?? Number.NEGATIVE_INFINITY;
      if (leftOrder === rightOrder) {
        return 0;
      }
      return leftOrder < rightOrder ? -1 : 1;
    });
  }

  /**
   * Resolves EXACTLY ONE sku from a comma list of selected option IDs.
   * [model/entity/Product.cfc:L348-L364]
   *
   *   if(len(arguments.selectedOptions) > 0) {
   *     var skus = getSkusBySelectedOptions(selectedOptions=arguments.selectedOptions);
   *     if(arrayLen(skus) == 1) { return skus[1]; }
   *     else if (arrayLen(skus) > 1) { throw("More than one sku is returned when the selected
   *                                          options are: #arguments.selectedOptions#"); }
   *     else if (arrayLen(skus) < 1) { throw("No Skus are found for these selected options:
   *                                          #arguments.selectedOptions#"); }
   *   } else if (arrayLen(getSkus()) == 1) { return getSkus()[1]; }
   *   else { throw("You must submit a comma seperated list of selectOptions to find an indvidual
   *                sku in this product"); }
   *
   * ★ A MUST-PRESERVE BEHAVIOUR (AAP 0.4.2), and the strictest method on this class: it has FOUR
   * outcomes and THREE of them are throws. All three messages are reproduced BYTE FOR BYTE, typos
   * included - `seperated`, `selectOptions` and `indvidual` in the last one - because an error message
   * a caller may be matching on is a contract like any other.
   *
   * ASYNC, because it reads through {@link Product.getSkusBySelectedOptions}, whose legacy body
   * reaches the DAO.
   *
   * `len(arguments.selectedOptions) > 0` [L349] goes through the ported `cfLen`, so the empty-string
   * and whitespace semantics match CFML rather than JavaScript truthiness.
   *
   * ★ NOTE THE ASYMMETRY IN THE `else` BRANCH: with no selected options it succeeds ONLY when the
   * product has EXACTLY ONE sku [L358-L359], and a product with zero or several skus falls into the
   * final throw. So "no options supplied" is not a wildcard - it is an assertion that the product is
   * single-sku. Preserved as written.
   */
  async getSkuBySelectedOptions(selectedOptions: string = ''): Promise<Sku> {
    // [model/entity/Product.cfc:L349]
    if (cfLen(selectedOptions) > 0) {
      const skus: readonly Sku[] = await this.getSkusBySelectedOptions(selectedOptions);

      // [L351-L352]
      const onlySku: Sku | undefined = skus[0];
      if (skus.length === 1 && onlySku !== undefined) {
        return onlySku;
      }

      // [L353-L354] verbatim message.
      if (skus.length > 1) {
        throw new Error(
          `More than one sku is returned when the selected options are: ${selectedOptions}`,
        );
      }

      // [L355-L356] verbatim message. `arrayLen(skus) < 1` is the only remaining case.
      throw new Error(`No Skus are found for these selected options: ${selectedOptions}`);
    }

    // [L358-L359] exactly one sku, or nothing.
    const skus: readonly Sku[] = this.getSkus();
    const singleSku: Sku | undefined = skus[0];
    if (skus.length === 1 && singleSku !== undefined) {
      return singleSku;
    }

    // [L360-L362] verbatim message, with all three source typos preserved.
    throw new Error(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this ' +
        'product',
    );
  }

  /**
   * Every sku of this product matching ALL the selected options. [model/entity/Product.cfc:L366-L368]
   *
   *   return getService("productService").getProductSkusBySelectedOptions(
   *            arguments.selectedOptions, this.getProductID());
   *
   * ★ A MUST-PRESERVE BEHAVIOUR (AAP 0.4.2). The matching semantics live in the SQL -
   * `model/dao/SkuDAO.cfc:L107-L128` builds an AND-of-EXISTS, one `EXISTS` clause per selected option,
   * so a sku qualifies only if it carries EVERY selected option. That is why this method delegates
   * instead of filtering `sku.getOptions()` locally: an in-memory reproduction would have to
   * re-derive the AND-of-EXISTS semantics, and the plan puts that statement in
   * `src/repositories/mysql/sql/skusBySelectedOptions.sql.ts` where it can be reviewed AS SQL.
   *
   * The delegation goes through {@link ProductQuerySupport}, which is transformation rule T2 applied
   * to the `getService("productService")` locator at L367. ASYNC, because the legacy body reaches the
   * DAO. Positional argument order is the source's - options first, product ID second.
   */
  async getSkusBySelectedOptions(selectedOptions: string = ''): Promise<Sku[]> {
    if (this.querySupport === undefined) {
      throw new Error(
        'Product.getSkusBySelectedOptions was called on a product hydrated without query support. ' +
          'The legacy body reaches getService("productService").getProductSkusBySelectedOptions ' +
          '[model/entity/Product.cfc:L367], which transformation rule T2 replaces with an injected ' +
          'port; that port must be supplied at construction.',
      );
    }
    return this.querySupport.getProductSkusBySelectedOptions(selectedOptions, this.getProductID());
  }

  /**
   * The Mura breadcrumb row for this product. [model/entity/Product.cfc:L370-L397]
   *
   * PURE - it reads only its arguments and `getTitle()`, and reaches no service. Ported in full even
   * though the Mura CMS bridge is out of scope, because the method is on this entity's public surface
   * and its body is entirely local: excluding the bridge excludes the CONSUMER, not this producer.
   *
   * ★ EVERY RETURNED KEY IS SPELLED AS THE SOURCE SPELLS IT, TWO TYPOS INCLUDED. See
   * {@link ProductCrumbData} for the full list and for the CFML struct-key-casing note.
   *
   * TWO WAYS IT RAISES, both reproducing a source failure:
   *   1. `arguments.baseCrumbArray[1].parentArray` [L379] is UNGUARDED, so an empty crumb array
   *      raises on the index.
   *   2. `left(productFilename, len(productFilename)-1)` [L372] passes `-1` to `left()` when the
   *      replace leaves nothing, which CFML rejects. That happens when `path` is exactly
   *      `/<siteID>/`, which is precisely the site root - a reachable input, not a pathological one.
   *
   * `replace(..., "all")` [L371] removes EVERY occurrence of `/<siteID>/`, not just the first, and the
   * port's `split`/`join` reproduces that. The trailing character the `left()` then drops is the
   * path's final `/`.
   */
  getCrumbData(
    path: string,
    siteID: string,
    baseCrumbArray: readonly BaseCrumbEntry[],
  ): ProductCrumbData {
    // [model/entity/Product.cfc:L371] `replace(arguments.path, "/#arguments.siteID#/", "", "all")`.
    const stripped: string = path.split(`/${siteID}/`).join('');

    // [L372] `left(productFilename, len(productFilename)-1)`. CFML's `left()` rejects a negative
    // count, so an empty intermediate raises rather than yielding `''`.
    if (stripped.length === 0) {
      throw new Error(
        'Product.getCrumbData reproduces a source failure [model/entity/Product.cfc:L372]: after ' +
          `removing "/${siteID}/" from the path the remainder is empty, and the legacy then calls ` +
          'left(value, -1), which CFML rejects.',
      );
    }
    const productFilename: string = stripped.slice(0, stripped.length - 1);

    // [L379] `arguments.baseCrumbArray[1].parentArray` - unguarded in the source.
    const firstCrumb: BaseCrumbEntry | undefined = baseCrumbArray[0];
    if (firstCrumb === undefined) {
      throw new Error(
        'Product.getCrumbData reproduces a source failure [model/entity/Product.cfc:L379]: it ' +
          'reads baseCrumbArray[1].parentArray without checking that the array has an element.',
      );
    }

    // [L374-L395] the struct literal, key for key and value for value.
    return {
      contentHistID: '',
      contentID: '',
      filename: productFilename,
      inheritobjects: 'Cascade',
      menuTitle: this.getTitle(),
      metaDesc: '',
      metaKeywords: '',
      parentArray: firstCrumb.parentArray,
      parentID: '',
      restricted: 0,
      // ★ `retrictgroups`, missing its first `s`, is the source's spelling and a Mura data-contract
      // key. Preserved deliberately.
      retrictgroups: '',
      siteid: siteID,
      sortby: 'orderno',
      sortdirection: 'asc',
      target: '_self',
      // ★ `targetPrams`, missing its `a`, likewise.
      targetPrams: '',
      template: '',
      type: 'Page',
    };
  }

  // --- Availability [model/entity/Product.cfc:L399] ---------------------------------------------
  //
  // The source's own `// Availability` comment. Both members reach `stockService`, and the stock and
  // inventory subsystems are EXCLUDED by the plan (AAP 0.2.2), so both are documented throwing stubs.
  // A stub keeps the public surface complete and the failure DETECTABLE; a default would hand a
  // caller a well-formed wrong date, and receival dates drive purchasing.

  /**
   * Expected inbound stock, keyed three ways. [model/entity/Product.cfc:L400-L405]
   *
   *   if(!structKeyExists(variables, "estimatedReceivalDetails")) {
   *     variables.estimatedReceivalDetails =
   *       getService("stockService").getEstimatedReceivalDetails( getProductID() );
   *   }
   *   return variables.estimatedReceivalDetails;
   *
   * NOT PORTED - `stockService` belongs to the excluded stock subsystem, and the returned struct's
   * shape is defined entirely by that service: {@link Product.getEstimatedReceivalDates} shows it
   * carries `stocks`, `skus` (each with `locations` and `estimatedReceivals`), `locations` and a
   * top-level `estimatedReceivals`. Reproducing the shape without the service that fills it would be
   * inventing data.
   *
   * The memo slot is deliberately not declared: memoizing a value that can never be produced would be
   * dead state.
   */
  getEstimatedReceivalDetails(): never {
    throw new Error(
      'Product.getEstimatedReceivalDetails is not ported. The legacy body reaches ' +
        'getService("stockService").getEstimatedReceivalDetails(getProductID()) ' +
        '[model/entity/Product.cfc:L401], and the stock subsystem is explicitly out of scope for ' +
        'this migration slice. The method is retained with its verbatim signature so the public ' +
        'surface stays complete and the omission is detectable rather than silent.',
    );
  }

  /**
   * Expected inbound dates for a stock, a sku, a sku at a location, or a location.
   * [model/entity/Product.cfc:L407-L432]
   *
   * A four-way `structKeyExists(arguments, ...)` cascade over the struct
   * {@link Product.getEstimatedReceivalDetails} returns, falling back to `[]` [L431]. It is entirely
   * derived from that struct, so it cannot be ported while its source cannot.
   *
   * ★ WORTH RECORDING RATHER THAN LOSING: the cascade's ORDER is `stockID`, then `skuID` AND
   * `locationID` together, then `skuID` alone, then `locationID` alone, and the final `else` [L427]
   * returns the product-wide list. Because CFML's `structKeyExists(arguments, "x")` is true for ANY
   * supplied argument - including an empty string - passing `skuID=""` takes the sku branch and
   * returns `[]`, not the product-wide list. That is a real trap in the source's argument handling and
   * it is documented here so a future port of the stock subsystem reproduces it deliberately.
   */
  getEstimatedReceivalDates(_skuID?: string, _locationID?: string, _stockID?: string): never {
    throw new Error(
      'Product.getEstimatedReceivalDates is not ported. It is derived entirely from ' +
        'getEstimatedReceivalDetails() [model/entity/Product.cfc:L408], which reaches the ' +
        'out-of-scope stock subsystem. See that method and this one for the argument-cascade ' +
        'semantics a future port must reproduce.',
    );
  }

  // --- Quantity [model/entity/Product.cfc:L434] -------------------------------------------------

  /**
   * A quantity of this product, by type and optional scope. [model/entity/Product.cfc:L435-L489]
   *
   * NOT PORTED - both branches of its lookup reach `getService("inventoryService")` [L441, L443], and
   * the inventory subsystem is excluded (AAP 0.2.2). Retained as a documented throwing stub so the
   * surface is complete and the omission detectable.
   *
   * WHAT A FUTURE PORT MUST REPRODUCE, recorded here because the body would otherwise be lost:
   *
   *   * TWO DISJOINT TYPE WHITELISTS, and the type determines which service call is made.
   *     `"QOH,QOSH,QNDOO,QNDORVO,QNDOSA,QNRORO,QNROVO,QNROSA"` [L440] are looked up by
   *     `{productID, productRemoteID}` and return a STRUCT that is then indexed by stock, sku or
   *     location. `"QC,QE,QNC,QATS,QIATS"` [L442] are looked up by `{entity=this}` and return a
   *     SCALAR that is returned directly [L450-L452]. Anything else throws with a message listing all
   *     thirteen valid types [L445].
   *   * THE RESULT IS MEMOIZED ONTO `variables[quantityType]` [L441, L443] - a DYNAMIC key, so this
   *     entity ends up carrying up to thirteen ad-hoc fields named after quantity types. That is the
   *     shape a port has to decide about; it is not a fixed property.
   *   * ★ LEGACY-DEFECT D7 [L479-L484]: the `locationID` branch computes
   *     `variables[qt].locations[locationID]` as a BARE STATEMENT with no `return`, so it always
   *     falls through to `return 0`. Every other branch returns its value. A location-scoped quantity
   *     is therefore ALWAYS ZERO in the legacy.
   *   * TWO UNSCOPED READS, which work in CFML only because unscoped names resolve through
   *     `arguments`: `variables[ quantityType ].stocks` [L458] and `stocks[stockID]` [L459], and
   *     `variables[ quantityType ].skus[...]` inside the sku-and-location test [L466]. They are noted
   *     because they read as `variables`-scope lookups and are not.
   *   * `remoteID` IS PART OF THE LOOKUP KEY [L441], which is the one in-scope reason this entity
   *     carries {@link Product.getRemoteID} at all.
   */
  getQuantity(
    _quantityType: string,
    _skuID?: string,
    _locationID?: string,
    _stockID?: string,
  ): never {
    throw new Error(
      'Product.getQuantity is not ported. Both lookup branches reach ' +
        'getService("inventoryService") [model/entity/Product.cfc:L441, L443], and the inventory ' +
        'subsystem is explicitly out of scope for this migration slice. The method doc records the ' +
        'two type whitelists, the dynamic memo keys and LEGACY-DEFECT D7 so a future port can ' +
        'reproduce them deliberately.',
    );
  }

  // --- Non-Persistent Property Methods [model/entity/Product.cfc:L491] -------------------------
  //
  // The source's own banner opens at L491 and closes at L655.

  /**
   * This product's base product type. [model/entity/Product.cfc:L493-L495]
   *
   *   return getProductType().getBaseProductType();
   *
   * ★ UNGUARDED, so it raises on a product with no product type - and that raise is load-bearing
   * rather than incidental: `SkuDAO.getProductSkus` calls it [model/dao/SkuDAO.cfc:L156] to choose an
   * eager-fetch join, so a type-less product fails there too. See `applyFetchOptionsFilter`, which
   * reproduces the same dereference at the same point.
   *
   * `ProductType.getBaseProductType()` itself returns `string | undefined`, so a product type with no
   * base type yields `undefined` here rather than raising - two different failure modes, kept
   * distinct.
   *
   * ★ ASYNCHRONOUS, BECAUSE THE DELEGATE IS. `ProductType.getBaseProductType()` short-circuits on its
   * own `systemCode` when it has one and otherwise LOADS THE ROOT PRODUCT TYPE named by the first
   * element of `productTypeIDPath` [model/entity/ProductType.cfc:L112] - a repository round trip. The
   * async boundary rule makes a method async if and only if its legacy body genuinely reached the DAO
   * or the ORM, and this one does, one hop down. The boundary propagates from here to
   * {@link Sku.getBaseProductType}, which delegates to this method in turn. It does NOT propagate into
   * {@link Product.getSkus}: see `applyFetchOptionsFilter`, which resolves the branch key from the
   * already-materialised product-type ancestry precisely so that accessor can stay synchronous.
   */
  async getBaseProductType(): Promise<string | undefined> {
    if (this.productType === undefined) {
      throw new Error(
        'Product.getBaseProductType dereferences getProductType() unguarded ' +
          '[model/entity/Product.cfc:L494] and this product has no product type. The legacy fails ' +
          'on the same input, including when reached through SkuDAO.getProductSkus ' +
          '[model/dao/SkuDAO.cfc:L156].',
      );
    }
    return await this.productType.getBaseProductType();
  }

  /**
   * The distinct default-image filenames across this product's SKUs.
   * [model/entity/Product.cfc:L497-L514]
   *
   *   var sl = getService("skuService").getSkuSmartList();
   *   sl.addFilter('product.productID', getProductID());
   *   sl.addSelect('imageFile', 'imageFile');
   *   sl.setSelectDistinctFlag( true );
   *   var records = sl.getRecords();
   *   for(var record in records) {
   *     if(structKeyExists(record, "imageFile")) {
   *       arrayAppend(variables.defaultProductImageFiles, record["imageFile"]);
   *     }
   *   }
   *
   * PORTED IN MEMORY - the smart list's only filter is `product.productID = <this product>`, so it
   * re-queries the subgraph this entity already holds. First bullet of the smart-list dividing line.
   *
   * ★ WHY THE `structKeyExists` GUARD IS REPRODUCED AS AN `undefined` SKIP, and why that is the
   * defensible reading of two possible ones. `getRecords()` with `addSelect` yields ORM PROJECTION
   * rows, not `cfquery` rows, and a CFML struct cannot hold a null - assigning one omits the key
   * entirely. So a sku with a NULL `imageFile` produces a row with NO `imageFile` key and the guard
   * SKIPS it. Under the competing reading - that the rows are `cfquery`-like, where every selected
   * column exists and NULL surfaces as `''` - the guard would be dead code and the result would carry
   * one `''` element after DISTINCT collapsing. The projection reading is the one the guard's very
   * existence supports: an author who knew keys were always present would not have written it.
   *
   * DISTINCTNESS is by the filename value itself [L501], so two skus sharing an image contribute one
   * element. NO `ORDER BY` is applied, so the legacy order is database-determined and
   * NON-DETERMINISTIC; the port emits encounter order, and any total order complies.
   *
   * TOTAL: it never throws. Its only consumer is an admin view
   * [admin/views/entity/producttabs/defaultimages.cfm:L53], which is out of scope.
   */
  getDefaultProductImageFiles(): readonly string[] {
    if (this.defaultProductImageFiles !== undefined) {
      return this.defaultProductImageFiles;
    }

    const seen: Set<string> = new Set<string>();
    const files: string[] = [];
    for (const sku of this.skus) {
      const imageFile: string | undefined = sku.getImageFile();
      // [model/entity/Product.cfc:L508] the `structKeyExists(record, "imageFile")` guard - see the doc
      // for why an absent key is the faithful reading of a NULL projection value.
      if (imageFile === undefined) {
        continue;
      }
      if (!seen.has(imageFile)) {
        seen.add(imageFile);
        files.push(imageFile);
      }
    }

    this.defaultProductImageFiles = files;
    return this.defaultProductImageFiles;
  }

  /**
   * Sale-price details for every sku of this product, keyed by sku ID.
   * [model/entity/Product.cfc:L516-L521]
   *
   *   if(!structKeyExists(variables, "salePriceDetailsForSkus")) {
   *     variables.salePriceDetailsForSkus =
   *       getService("promotionService").getSalePriceDetailsForProductSkus(productID=getProductID());
   *   }
   *   return variables.salePriceDetailsForSkus;
   *
   * ★ THE ONE PLACE THE F11-RELOCATED {@link SalePriceResolver} IS USED, and the reason it exists.
   * Transformation rule T2 replaces the `getService("promotionService")` locator at L519 with a
   * constructor-injected narrow port; see that interface for why the contract lives module-locally
   * here rather than being exported from `src/domain/ports/promotionRepository.ts`.
   *
   * ASYNC, because the service body reaches the DAO - specifically the six-branch UNION at
   * `model/dao/PromotionDAO.cfc:L298-L591`, whose three query-of-queries post-processing steps become
   * SQL common table expressions in this port.
   *
   * THE MEMO IS REQUEST-SCOPED, like every memo on this class, and here that is not merely a
   * correctness nicety: sale prices are promotion-dependent, so a value cached across warm Lambda
   * invocations could price one request's cart with another request's promotions.
   */
  async getSalePriceDetailsForSkus(): Promise<Readonly<Record<string, SalePriceDetail>>> {
    if (this.salePriceDetailsForSkus !== undefined) {
      return this.salePriceDetailsForSkus;
    }

    if (this.salePriceResolver === undefined) {
      throw new Error(
        'Product.getSalePriceDetailsForSkus was called on a product hydrated without a sale-price ' +
          'resolver. The legacy body reaches ' +
          'getService("promotionService").getSalePriceDetailsForProductSkus ' +
          '[model/entity/Product.cfc:L519], which transformation rule T2 replaces with an injected ' +
          'port; that port must be supplied at construction.',
      );
    }

    this.salePriceDetailsForSkus = await this.salePriceResolver.getSalePriceDetailsForProductSkus(
      this.getProductID(),
    );
    return this.salePriceDetailsForSkus;
  }

  /**
   * This product's brand name. [model/entity/Product.cfc:L523-L532]
   *
   *   public string function getBrandName() {
   *     if(!structKeyExists(variables, "brandName")) {
   *       variables.brandName = "";
   *       if( structKeyExists(variables, "brand") ) {
   *         return getBrand().getBrandName();
   *       }
   *     }
   *     return variables.brandName;
   *   }
   *
   * ★ LEGACY-DEFECT D12, AND THE ONE DEFECT ON THIS CLASS THAT IS FIXED RATHER THAN REPRODUCED.
   *
   * WHAT THE LEGACY DOES. First call: the memo is absent, so it is set to `""`, the brand is present,
   * and the method returns the brand's name WITHOUT writing it to the memo. Second call: the memo now
   * EXISTS - holding `""` - so the whole block is skipped and the method returns `""`. The memo is
   * poisoned by its own initialisation.
   *
   * ★ THE AAP DIRECTS THE FIX, AND ITS STATED RATIONALE IS INACCURATE - BOTH FACTS ARE RECORDED HERE
   * DELIBERATELY. AAP 0.6.7 lists this among three "deliberate divergences" and describes all three
   * as "unobservable through the public contract - they cause redundant recomputation or a poisoned
   * cache, not a different returned value". For its two siblings (the `Sku` struct-init defects) that
   * characterisation holds. FOR THIS ONE IT DOES NOT: the second call returns a DIFFERENT VALUE than
   * the first - `""` instead of the brand name - which is observable by any caller that asks twice.
   * The correction strengthens the case for the fix rather than weakening it, so the AAP's DIRECTIVE
   * is followed and its REASONING is superseded, with both stated so a reviewer can check the claim
   * instead of inheriting it. AAP precedence rule 1 makes an explicit AAP instruction authoritative;
   * it does not make an inaccurate justification true.
   *
   * ONE THING THAT DOES BOUND THE LEGACY BLAST RADIUS, and it is worth knowing: memos in this port are
   * REQUEST-SCOPED (AAP 0.6.5), and they were per-instance in the legacy too, so the poisoning never
   * escaped a single entity instance within a single request. It was still wrong within it.
   *
   * WHAT THE FIX IS. The computed value is STORED in the memo before being returned, which is what
   * the source's own structure plainly intends - `variables.brandName = ""` is a default, and the
   * missing assignment is the bug. Nothing else changes: the `""` default for a brand-less product is
   * kept, the presence test on `brand` is kept, and the return type stays `string` rather than
   * widening to include `undefined`, because `Brand.getBrandName()` can itself answer `undefined` and
   * the source's `returntype="string"` coerces that to `""`.
   */
  getBrandName(): string {
    // [model/entity/Product.cfc:L524] the memo guard, testing PRESENCE and not truthiness - `''` is
    // a legitimate memoized answer for a brand-less product and must not re-trigger the computation.
    if (this.brandName === undefined) {
      // [L525] the default, kept exactly.
      this.brandName = '';

      // [L526] `structKeyExists(variables, "brand")`.
      if (this.brand !== undefined) {
        // ★ DELIBERATE DIVERGENCE from [L527], which returns WITHOUT assigning and thereby poisons
        // the memo it just initialised. The computed value is stored first. `?? ''` reproduces the
        // source's `returntype="string"` coercion of a null brand name.
        this.brandName = this.brand.getBrandName() ?? '';
      }
    }

    return this.brandName;
  }

  /**
   * The brand select rows, with the null row's label applied. [model/entity/Product.cfc:L534-L538]
   *
   *   public array function getBrandOptions() {
   *     var options = getPropertyOptions( "brand" );
   *     options[1].name = rbKey('define.none');
   *     return options;
   *   }
   *
   * ★ LEGACY-DEFECT D5 - THIS METHOD IS A NO-OP OVERRIDE, and proving it requires reading the
   * framework rather than the entity. `getPropertyOptions` [org/Hibachi/HibachiEntity.cfc:L375-L414]
   * ends with:
   *
   *   if(getPropertyMetaData( propertyName ).fieldType == "many-to-one"
   *      && structKeyExists(getPropertyMetaData( propertyName ), "hb_optionsNullRBKey")) {
   *     arrayPrepend(variables[ cacheKey ], {value="", name=rbKey(<that key>)});
   *   }
   *
   * and `brand` is declared `fieldtype="many-to-one"` WITH `hb_optionsNullRBKey="define.none"`
   * [model/entity/Product.cfc:L68]. So row 1 already holds `{value:"", name:rbKey('define.none')}`
   * before this method touches it, and L536 writes that same value back over itself.
   *
   * ★ TWO CONSEQUENCES THAT CORRECT AN OBVIOUS FIRST READING OF THIS CODE. First, the unguarded
   * `options[1]` CANNOT fail on an empty array in the legacy, because the prepend guarantees at least
   * one element - so this is NOT an index defect, however much it looks like one. Second, the write
   * mutates the FRAMEWORK'S MEMOIZED ARRAY in place [L379, L405], so it would poison that cache - and
   * it does not, only because the value written is identical to the one already there.
   *
   * ★ WHICH IS EXACTLY WHY THIS PORT RAISES ON AN EMPTY CANDIDATE LIST INSTEAD OF RETURNING `[]`. An
   * empty list means the repository did NOT reproduce the framework's prepend, and in that state the
   * L536 write would land on a REAL BRAND and rename it "none". Tolerating the empty case would
   * convert a hydration mistake into wrong data on screen; raising surfaces it. See
   * {@link Product.brandOptionCandidates}.
   *
   * THE MECHANISM DIVERGES AND THE OBSERVABLE RESULT DOES NOT: this port builds a new array with row 0
   * relabelled rather than mutating the supplied one, because {@link BrandOption} is `readonly`.
   * Observational equivalence is not assumed here, it follows from the write being idempotent - the
   * label written is provably the label already present.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getBrandOptions(): readonly BrandOption[] {
    if (this.brandOptionCandidates === undefined) {
      throw new Error(
        'Product.getBrandOptions was called on a product hydrated without brand option candidates. ' +
          'The legacy body obtains them from getPropertyOptions("brand") ' +
          '[model/entity/Product.cfc:L535], which queries every brand and PREPENDS a null-select ' +
          'row; that query is outside the domain in this port, so the rows must be supplied at ' +
          'construction.',
      );
    }
    if (this.labelProvider === undefined) {
      throw new Error(
        'Product.getBrandOptions was called on a product hydrated without a label provider. The ' +
          "legacy body writes rbKey('define.none') into the first option row " +
          '[model/entity/Product.cfc:L536], and JavaRB is not ported, so the resolved label must be ' +
          'supplied at construction.',
      );
    }

    const firstOption: BrandOption | undefined = this.brandOptionCandidates[0];
    if (firstOption === undefined) {
      throw new Error(
        'Product.getBrandOptions was supplied an EMPTY brand option list. The legacy could not be ' +
          'in this state: getPropertyOptions unconditionally prepends a null-select row for any ' +
          'many-to-one property carrying hb_optionsNullRBKey ' +
          '[org/Hibachi/HibachiEntity.cfc:L407-L410], and model/entity/Product.cfc:L68 carries it. ' +
          'An empty list therefore means the prepended row is missing, and applying ' +
          "model/entity/Product.cfc:L536's unconditional write to row 1 would rename a real brand " +
          '"none".',
      );
    }

    // [model/entity/Product.cfc:L536] `options[1].name = rbKey('define.none')` - here as a new array
    // with row 0 relabelled, for the reason in the doc block.
    return [
      { name: this.labelProvider.getNoneOptionLabel(), value: firstOption.value },
      ...this.brandOptionCandidates.slice(1),
    ];
  }

  /**
   * The product's display title. [model/entity/Product.cfc:L540-L545]
   *
   *   if(!structKeyExists(variables, "title")) {
   *     variables.title = getService("hibachiUtilityService").replaceStringTemplate(
   *                         template=setting('productTitleString'), object=this);
   *   }
   *   return variables.title;
   *
   * BOTH INPUTS ARE OUTSIDE THE DOMAIN and neither is re-implemented here: `hibachiUtilityService` is
   * explicitly not ported (AAP 0.6.2, 0.5.3), and `productTitleString` is not one of the four settings
   * keys this port exposes. What remains is the memo and the delegation, which is what this method
   * keeps - the same ruling `Option.getImageDirectory` records in src/domain/entities/option.ts.
   *
   * ★ IT DOES NOT READ `calculatedTitle` [L65], EVEN THOUGH THAT COLUMN EXISTS AND HOLDS A TITLE. The
   * source recomputes instead, so the persisted column and this method can legitimately disagree. Both
   * are exposed; neither is derived from the other, and reconciling them here would be a behaviour
   * change.
   *
   * IT RAISES WHEN THE RESOLVED TITLE WAS NOT MATERIALIZED, and that raise propagates into
   * {@link Product.getCrumbData} and {@link Product.getImageGalleryArray}, both of which interpolate
   * it. `returntype="string"` leaves no spare value, and the plausible defaults are all worse than
   * failing: `''` would render an untitled breadcrumb and an untitled gallery entry, and
   * `getProductName()` would silently substitute a DIFFERENT string than the template produces.
   */
  getTitle(): string {
    if (this.title !== undefined) {
      return this.title;
    }

    if (this.resolvedTitle === undefined) {
      throw new Error(
        'Product.getTitle was called on a product hydrated without a resolved title. The legacy ' +
          "body expands setting('productTitleString') through " +
          'hibachiUtilityService.replaceStringTemplate [model/entity/Product.cfc:L541]; that ' +
          'service is not ported and productTitleString is not one of the four settings keys this ' +
          'port exposes, so the expanded title must be supplied at construction. No default is ' +
          'substituted because every candidate would render a different string than the template ' +
          'produces.',
      );
    }

    this.title = this.resolvedTitle;
    return this.title;
  }

  /**
   * Quantity available to sell. [model/entity/Product.cfc:L547-L549]
   *
   *   return getQuantity("QATS");
   *
   * A one-line delegation, and it is preserved AS a delegation rather than being given its own stub
   * message: `QATS` is in the second whitelist [L442], so in the legacy this call goes through
   * `inventoryService` with `{entity=this}` and returns a scalar. Delegating means the failure a
   * caller sees names the real reason - the excluded inventory subsystem - rather than restating it
   * second-hand.
   *
   * ★ NOTE the persisted `calculatedQATS` column [L63] holds a QATS value and this method does NOT
   * read it, exactly as {@link Product.getTitle} does not read `calculatedTitle`. Same shape, same
   * ruling.
   */
  getQATS(): number {
    return this.getQuantity('QATS');
  }

  /**
   * Whether backorders are allowed for this product. [model/entity/Product.cfc:L551-L553]
   *
   *   public numeric function getAllowBackorderFlag() {
   *     return setting("skuAllowBackorderFlag");
   *   }
   *
   * ★ LEGACY-DEFECT D11 - THREE DECLARATIONS OF THE SAME THING DISAGREE. The method declares
   * `returntype="numeric"` [L551]; the matching non-persistent property declares `type="boolean"`
   * [L103]; and the setting it returns is a boolean. CFML papers over it by coercing `true` to `1` on
   * the way out, so callers see a number that behaves like a flag.
   *
   * THE PORT KEEPS THE `number` RETURN TYPE, because interface parity is the acceptance contract and
   * `returntype="numeric"` is what the surface declares - and it stores the input as `boolean`,
   * because that is what the setting genuinely is. The coercion happens in exactly one place, at the
   * return, mirroring where CFML does it. Mistyping the input as `number` to make the return
   * type-check trivially would hide the defect rather than record it.
   *
   * `skuAllowBackorderFlag` is NOT one of the four approved settings keys, so it arrives pre-resolved
   * and this method raises when it was not supplied. No default: a wrong backorder policy either
   * refuses sellable stock or oversells.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getAllowBackorderFlag(): number {
    if (this.skuAllowBackorderFlagSetting === undefined) {
      throw new Error(
        'Product.getAllowBackorderFlag was called on a product hydrated without a resolved ' +
          'skuAllowBackorderFlag setting. The legacy body reads ' +
          'setting("skuAllowBackorderFlag") [model/entity/Product.cfc:L552], and that key is not ' +
          'one of the four this port exposes to the domain, so the value must be supplied at ' +
          'construction. No default is substituted because a wrong backorder policy either refuses ' +
          'sellable stock or oversells.',
      );
    }

    // The `returntype="numeric"` coercion of a boolean setting, in the one place CFML does it.
    return this.skuAllowBackorderFlagSetting ? 1 : 0;
  }

  // --- The eight default-sku price delegators [model/entity/Product.cfc:L554-L602] --------------
  //
  // ★ THESE ARE GUARDED WHERE THE FIVE IMAGE DELEGATORS [L319-L338] ARE NOT, and the asymmetry is the
  // source's: every member below tests `structKeyExists(variables, "defaultSku")` first and falls off
  // the end - i.e. answers CFML null - when there is no default sku, whereas every image delegator
  // dereferences blind. Both behaviours are reproduced as written.
  //
  // ★ AND THE `undefined` RETURNS ARE LOAD-BEARING, not incidental. AAP 0.6.3 makes this explicit for
  // the sku-level currency accessors and the same argument applies one level up: substituting `0` for
  // an absent price would sell the product for free. Every one of these returns `... | undefined`.
  //
  // ALL MONEY IS `Money`. `hb_formatType="currency"` [L118-L123] is presentation metadata and is not
  // applied here; formatting belongs to whoever renders.

  /**
   * The product's price. [model/entity/Product.cfc:L555-L565]
   *
   *   if( structKeyExists(variables, "price") ) { return variables.price; }
   *   if( structKeyExists(variables, "defaultSku") ) { return getDefaultSku().getPrice(); }
   *
   * ★ THE ONLY ONE OF THE EIGHT WITH A POPULATED-OVERRIDE BRANCH. It checks the non-persistent `price`
   * property FIRST [L556] and only then the default sku. None of the other seven has that first
   * branch - compare {@link Product.getRenewalPrice}, which goes straight to the sku. The asymmetry is
   * the source's and is preserved; see {@link Product.price} for why that one field is a constructor
   * input while the other non-persistent properties are memo slots.
   */
  getPrice(): Money | undefined {
    if (this.price !== undefined) {
      return this.price;
    }
    if (this.defaultSku !== undefined) {
      return this.defaultSku.getPrice();
    }
    return undefined;
  }

  /** [model/entity/Product.cfc:L567-L571] `getDefaultSku().getRenewalPrice()`, guarded. */
  getRenewalPrice(): Money | undefined {
    if (this.defaultSku !== undefined) {
      return this.defaultSku.getRenewalPrice();
    }
    return undefined;
  }

  /** [model/entity/Product.cfc:L573-L577] `getDefaultSku().getListPrice()`, guarded. */
  getListPrice(): Money | undefined {
    if (this.defaultSku !== undefined) {
      return this.defaultSku.getListPrice();
    }
    return undefined;
  }

  /**
   * [model/entity/Product.cfc:L579-L583] `getDefaultSku().getLivePrice()`, guarded.
   *
   * ★ ASYNC BY CONTAGION, AND THE ONLY REASON IS THE DELEGATE. `Sku.getLivePrice` awaits
   * `Sku.getCurrentAccountPrice`, which AAP 0.4.2 makes async because
   * `PriceGroupService.calculateSkuPriceBasedOnCurrentAccount` reaches the subscription price-group
   * query. Nothing in THIS body touches a repository - the asynchrony is inherited, not introduced,
   * and the guard and the `undefined` fallback are unchanged.
   */
  async getLivePrice(): Promise<Money | undefined> {
    if (this.defaultSku !== undefined) {
      return await this.defaultSku.getLivePrice();
    }
    return undefined;
  }

  /**
   * [model/entity/Product.cfc:L585-L589] `getDefaultSku().getCurrentAccountPrice()`, guarded.
   *
   * ★ ASYNC FOR THE SAME INHERITED REASON as {@link Product.getLivePrice}, one step closer to the
   * source: the delegate IS the member AAP 0.4.2 declares async. Note that the account itself is not a
   * parameter here or there - `Sku` carries the current-account context as a constructor input, which is
   * how transformation rule T6's "no ambient state" requirement is met without widening a signature.
   */
  async getCurrentAccountPrice(): Promise<Money | undefined> {
    if (this.defaultSku !== undefined) {
      return await this.defaultSku.getCurrentAccountPrice();
    }
    return undefined;
  }

  /**
   * The product's currency code. [model/entity/Product.cfc:L554-L558]
   *
   *   if( structKeyExists(variables, "defaultSku") ) { return getDefaultSku().getCurrencyCode(); }
   *
   * Guarded, falling off the end to CFML null. `Sku.getCurrencyCode()` [model/entity/Sku.cfc:L360]
   * memoizes `setting('skuCurrency')`, whose default is `"USD"`
   * [model/service/SettingService.cfc:L221] - so the "USD default" of the currency cascade lives in
   * the SETTINGS TIER, not in any entity, and certainly not here. This method contributes only the
   * guard and the delegation.
   */
  getCurrencyCode(): string | undefined {
    if (this.defaultSku !== undefined) {
      return this.defaultSku.getCurrencyCode();
    }
    return undefined;
  }

  /**
   * The product's sale price. [model/entity/Product.cfc:L594-L602]
   *
   *   public any function getSalePrice() {
   *     if( structKeyExists(variables,"defaultSku") ) {
   *       return getDefaultSku().getSalePrice();
   *     } else if (arrayLen(getSkus())) {
   *       getSkus()[1].getSalePrice();
   *     }
   *     return 0;
   *   }
   *
   * ★ LEGACY-DEFECT D8 - THE SECOND BRANCH HAS NO `return`. It calls `getSalePrice()` on the first
   * sku, DISCARDS the answer, and falls through to `return 0`. So a product with skus but no default
   * sku always reports a sale price of ZERO, however the skus are priced.
   *
   * ★ THE DISCARDED CALL IS STILL MADE, and that is deliberate rather than pedantic: `Sku.getSalePrice`
   * can raise, so eliding the call would turn a failing input into a quiet `0`. A characterization
   * test that spies on the first sku sees exactly one call and a `0` result.
   *
   * `return 0` becomes `Money.fromDecimalString('0')`, because every money value in this port is
   * `Money` and a bare `0` would reintroduce the float arithmetic the value object exists to prevent.
   *
   * ★ THE RETURN TYPE IS `Money | undefined` EVEN THOUGH THE SOURCE HAS AN EXPLICIT ZERO FALLBACK, AND
   * THE REASON IS THE FIRST BRANCH RATHER THAN THE LAST. `Sku.getSalePrice()` falls back to
   * `Sku.getPrice()` [model/entity/Sku.cfc:L550], which is nullable, so the first branch can hand back
   * CFML null - and `returntype="any"` [L594] lets it. The zero fallback governs only the two paths that
   * reach it. Declaring `Money` here would force a substitution on the one path where the legacy really
   * does answer null, and a zero sale price is a price a customer is charged rather than a sentinel.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getSalePrice(): Money | undefined {
    // [model/entity/Product.cfc:L595-L596]
    if (this.defaultSku !== undefined) {
      return this.defaultSku.getSalePrice();
    }

    // [L597-L599] `else if (arrayLen(getSkus()))` - CFML numeric truthiness.
    const skus: readonly Sku[] = this.getSkus();
    const firstSku: Sku | undefined = skus[0];
    if (skus.length > 0 && firstSku !== undefined) {
      // *** LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement has no `return`, so the
      // computed sale price is discarded and execution falls through to `return 0` below. The call is
      // still performed because it can raise.
      // Preserved deliberately; do not fix without a product decision.
      firstSku.getSalePrice();
    }

    // [L601] `return 0;`
    return Money.fromDecimalString('0');
  }

  /**
   * How this product's sale price is discounted. [model/entity/Product.cfc:L604-L612]
   *
   *   if(!structKeyExists(variables, "salePriceDiscountType")) {
   *     variables.salePriceDiscountType = "none";
   *     if( structKeyExists(variables, "defaultSku") ) {
   *       variables.salePriceDiscountType = getDefaultSku().getSalePriceDiscountType();
   *     }
   *   }
   *   return variables.salePriceDiscountType;
   *
   * ★ STRUCTURALLY THE SAME AS {@link Product.getBrandName} AND YET CORRECT, which is what makes the
   * pair worth reading together: this one ASSIGNS into the memo inside the inner branch [L608] instead
   * of returning past it. The `"none"` default survives only for a product with no default sku. Same
   * shape, one assignment apart - and that one assignment is defect D12.
   *
   * TOTAL: it never throws.
   */
  getSalePriceDiscountType(): string {
    if (this.salePriceDiscountType === undefined) {
      // [model/entity/Product.cfc:L606] the default.
      this.salePriceDiscountType = 'none';

      // [L607-L609] and here the source DOES assign - contrast getBrandName(). The intermediate local
      // is annotated rather than inferred so the memo's declared `string | undefined` narrows to
      // `string` on both branches; `Sku.getSalePriceDiscountType` [model/entity/Sku.cfc:L553-L558]
      // returns the struct value or `""` and never null, so the annotation is a statement of that
      // contract and not a cast.
      if (this.defaultSku !== undefined) {
        const fromDefaultSku: string = this.defaultSku.getSalePriceDiscountType();
        this.salePriceDiscountType = fromDefaultSku;
      }
    }

    return this.salePriceDiscountType;
  }

  /**
   * When this product's sale price expires. [model/entity/Product.cfc:L614-L622]
   *
   *   public date function getSalePriceExpirationDateTime() {
   *     if(!structKeyExists(variables, "salePriceExpirationDateTime")) {
   *       variables.salePriceExpirationDateTime = now();
   *       if( structKeyExists(variables,"defaultSku") ) {
   *         variables.salePriceExpirationDateTime = getDefaultSku().getSalePricExpirationDateTime();
   *       }
   *     }
   *     return variables.salePriceExpirationDateTime;
   *   }
   *
   * ★ LEGACY-DEFECT D9 - THE DELEGATE'S NAME IS MISSPELLED. It calls
   * `getSalePricExpirationDateTime()` - no `e` in `Price` - while model/entity/Sku.cfc:L560 declares
   * the correctly-spelled `getSalePriceExpirationDateTime()`. The typo is in the CALL, not the
   * declaration, so the correctly-named method is simply never reached.
   *
   * THE FAILURE PATH IS THE SAME TWO-STEP ONE AS D2 AND D3, resolved on the SKU rather than here:
   * `getSalePricExpirationDateTime` reaches `HibachiEntity.onMissingMethod`, matches none of the ten
   * conventions, and lands on the attribute-value fallback [org/Hibachi/HibachiEntity.cfc:L559-L561] -
   * which fires because `Sku` declares `attributeValues` [model/entity/Sku.cfc:L70] - and receives the
   * EMPTY STRING. The method then declares `returntype="date"`, and `""` cannot be coerced to a date,
   * so the failure is a TYPE COERCION on the way out rather than a missing method on the way in.
   *
   * ★ NOTE THE BRANCH THAT NEVER RUNS AS A RESULT: a product with NO default sku would return `now()`
   * [L617] perfectly happily. The defect only fires when a default sku EXISTS - so the method works
   * exactly for the products that have no sale price to expire, and fails for the ones that might.
   * Reproduced faithfully, guard and all.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getSalePriceExpirationDateTime(): Date {
    // [model/entity/Product.cfc:L617] the `now()` default, which IS the answer for a product with no
    // default sku - the defect below is unreachable in that case.
    if (this.defaultSku === undefined) {
      return new Date();
    }

    // *** LEGACY-DEFECT [model/entity/Product.cfc:L619]: calls
    // getDefaultSku().getSalePricExpirationDateTime() - missing the `e` in `Price` - while
    // model/entity/Sku.cfc:L560 declares getSalePriceExpirationDateTime(). In the legacy the misspelt
    // call reaches the onMissingMethod attribute-value fallback, receives the empty string, and then
    // fails the `returntype="date"` coercion.
    // Preserved deliberately; do not fix without a product decision.
    throw new Error(
      'Product.getSalePriceExpirationDateTime reproduces LEGACY-DEFECT ' +
        '[model/entity/Product.cfc:L619]: it calls getSalePricExpirationDateTime() on the default ' +
        'sku - missing the "e" in "Price" - while model/entity/Sku.cfc:L560 declares ' +
        'getSalePriceExpirationDateTime(). In the legacy the misspelt call falls through to the ' +
        'onMissingMethod attribute-value fallback [org/Hibachi/HibachiEntity.cfc:L559-L561], ' +
        'receives the empty string, and then fails the returntype="date" coercion. Note this path ' +
        'is reached ONLY when a default sku exists; a product without one returns now().',
    );
  }

  /**
   * Whether any order transaction references a sku of this product.
   * [model/entity/Product.cfc:L624-L629]
   *
   *   if(!structKeyExists(variables, "transactionExistsFlag")) {
   *     variables.transactionExistsFlag =
   *       getService("skuService").getTransactionExistsFlag( productID=this.getProductID() );
   *   }
   *   return variables.transactionExistsFlag;
   *
   * ★ THE ONE SERVICE REACH ON THIS CLASS THAT IS NEITHER A SMART LIST NOR AN EXCLUDED SUBSYSTEM, and
   * therefore the one that becomes a real injected port rather than a stub:
   * `SkuService.getTransactionExistsFlag` [model/service/SkuService.cfc:L285] is in scope and is
   * backed by `SkuDAO.getTransactionExistsFlag` [model/dao/SkuDAO.cfc:L53], which the plan keeps.
   *
   * ASYNC, because it reaches the DAO. The flag gates deletion in the admin - a product with
   * transactions must not be removed - so a default would be actively dangerous in either direction:
   * `false` permits deleting sold history, `true` blocks a legitimate delete forever.
   */
  async getTransactionExistsFlag(): Promise<boolean> {
    if (this.transactionExistsFlag !== undefined) {
      return this.transactionExistsFlag;
    }

    if (this.querySupport === undefined) {
      throw new Error(
        'Product.getTransactionExistsFlag was called on a product hydrated without query support. ' +
          'The legacy body reaches getService("skuService").getTransactionExistsFlag ' +
          '[model/entity/Product.cfc:L627], which transformation rule T2 replaces with an injected ' +
          'port; that port must be supplied at construction.',
      );
    }

    this.transactionExistsFlag = await this.querySupport.getTransactionExistsFlag(
      this.getProductID(),
    );
    return this.transactionExistsFlag;
  }

  /**
   * This product's options, grouped. [model/entity/Product.cfc:L631-L633]
   *
   *   public array function getProductOptionsByGroup(){
   *     return getProductService().getProductOptionsByGroup( this );
   *   }
   *
   * ★ LEGACY-DEFECT D10 - AND IT IS BROKEN TWICE OVER. `getProductService()` is defined NOWHERE: not
   * on this component, not on either `HibachiEntity`, nowhere in the tree. Every other service reach
   * in this file uses `getService("...")`; this one line uses a bare accessor that does not exist. AND
   * the method it tries to call, `ProductService.getProductOptionsByGroup`, is also declared nowhere -
   * grep finds exactly two hits for that name in the entire repository, and both are these two lines.
   *
   * THE FAILURE PATH: `getProductService` reaches `HibachiEntity.onMissingMethod`, matches none of the
   * ten conventions - it ends in `Service`, not in any recognised suffix - and lands on the
   * attribute-value fallback [org/Hibachi/HibachiEntity.cfc:L559-L561], which fires because this
   * entity declares `attributeValues` [L75]. It receives the EMPTY STRING, and the next step calls
   * `.getProductOptionsByGroup(this)` ON A STRING.
   *
   * Reproduced as a raise. Note {@link Product.getOptionGroups} and
   * {@link Product.getOptionsByOptionGroup} together already provide the grouping this method's name
   * promises - which is why authoring an implementation would be inventing a capability rather than
   * porting one.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  getProductOptionsByGroup(): never {
    throw new Error(
      'Product.getProductOptionsByGroup reproduces LEGACY-DEFECT ' +
        '[model/entity/Product.cfc:L632]: it calls getProductService(), which is defined nowhere in ' +
        'the repository, and the method it then invokes - ProductService.getProductOptionsByGroup - ' +
        'is likewise declared nowhere. In the legacy the accessor falls through to the ' +
        'onMissingMethod attribute-value fallback [org/Hibachi/HibachiEntity.cfc:L559-L561], ' +
        'receives the empty string, and the subsequent method call on a string fails.',
    );
  }

  /**
   * Options not yet used by any of this product's SKUs. [model/entity/Product.cfc:L635-L640]
   *
   *   variables.unusedProductOptions = getService('optionService').getUnusedProductOptions(
   *     getProductID(), structKeyList(getOptionGroupsStruct()) );
   *
   * ASYNC, through {@link ProductQuerySupport} - `OptionService.getUnusedProductOptions`
   * [model/service/OptionService.cfc:L72] is in scope, backed by `OptionDAO.cfc:L51`.
   *
   * The second argument is a COMMA LIST built by `structKeyList` over
   * {@link Product.getOptionGroupsStruct}, and it stays a string all the way to the query layer - see
   * that method for the note on why its key order is non-deterministic in the legacy and why that
   * does not matter here.
   */
  async getUnusedProductOptions(): Promise<readonly Option[]> {
    if (this.unusedProductOptions !== undefined) {
      return this.unusedProductOptions;
    }

    if (this.querySupport === undefined) {
      throw new Error(
        'Product.getUnusedProductOptions was called on a product hydrated without query support. ' +
          "The legacy body reaches getService('optionService').getUnusedProductOptions " +
          '[model/entity/Product.cfc:L637], which transformation rule T2 replaces with an injected ' +
          'port; that port must be supplied at construction.',
      );
    }

    // [model/entity/Product.cfc:L637] `structKeyList(getOptionGroupsStruct())`.
    const existingOptionGroupIDList: string = Object.keys(this.getOptionGroupsStruct()).join(',');

    this.unusedProductOptions = await this.querySupport.getUnusedProductOptions(
      this.getProductID(),
      existingOptionGroupIDList,
    );
    return this.unusedProductOptions;
  }

  /**
   * Option groups not yet used by this product. [model/entity/Product.cfc:L642-L647]
   *
   *   variables.unusedProductOptionGroups = getService('optionService')
   *     .getUnusedProductOptionGroups( structKeyList(getOptionGroupsStruct()) );
   *
   * ★ IT PASSES NO PRODUCT ID, unlike its sibling one method above. So the answer is "every option
   * group not in this list" across the WHOLE catalog, not "every option group this product does not
   * use" - which happen to coincide only because the list was built from this product. The asymmetry
   * is the source's and the port's signature preserves it; see {@link ProductQuerySupport}.
   */
  async getUnusedProductOptionGroups(): Promise<readonly OptionGroup[]> {
    if (this.unusedProductOptionGroups !== undefined) {
      return this.unusedProductOptionGroups;
    }

    if (this.querySupport === undefined) {
      throw new Error(
        'Product.getUnusedProductOptionGroups was called on a product hydrated without query ' +
          "support. The legacy body reaches getService('optionService')." +
          'getUnusedProductOptionGroups [model/entity/Product.cfc:L644], which transformation rule ' +
          'T2 replaces with an injected port; that port must be supplied at construction.',
      );
    }

    const existingOptionGroupIDList: string = Object.keys(this.getOptionGroupsStruct()).join(',');

    this.unusedProductOptionGroups =
      await this.querySupport.getUnusedProductOptionGroups(existingOptionGroupIDList);
    return this.unusedProductOptionGroups;
  }

  /**
   * Subscription terms not yet used by this product. [model/entity/Product.cfc:L649-L654]
   *
   *   variables.unusedProductSubscriptionTerms = getService('subscriptionService')
   *     .getUnusedProductSubscriptionTerms( getProductID() );
   *
   * NOT PORTED - `subscriptionService` belongs to the excluded subscription module (AAP 0.2.2), which
   * this port represents only as a documented stub port. Retained as a throwing stub so the surface
   * stays complete: `hb_processContexts` on L49 advertises an `addSubscriptionTerm` process, so a
   * caller has reason to look for this method and deserves a message rather than a missing property.
   */
  getUnusedProductSubscriptionTerms(): never {
    throw new Error(
      'Product.getUnusedProductSubscriptionTerms is not ported. The legacy body reaches ' +
        "getService('subscriptionService').getUnusedProductSubscriptionTerms " +
        '[model/entity/Product.cfc:L651], and the subscription module is explicitly out of scope ' +
        'for this migration slice.',
    );
  }

  // --- Bidirectional Helper Methods [model/entity/Product.cfc:L659] -----------------------------
  //
  // The source's own banner, running L659-L787. THIRTEEN pairs, in exactly three shapes, and the
  // shape is what decides how much code each pair carries:
  //
  //   SHAPE 1 - THIS SIDE OWNS THE FOREIGN KEY (one pair: `brand`, many-to-one [L662-L679]). Both
  //     sides are maintained HERE: the field is assigned and the far side's LIVE `getProducts()` array
  //     is mutated in place. This is the ONLY pair on this class that touches a far-side array.
  //
  //   SHAPE 2 - PURE DELEGATION (eleven pairs). `add*`/`remove*` forward to a single far-side call and
  //     do nothing else: the four one-to-many pairs delegate to the child's `setProduct`/
  //     `removeProduct` [L680-L709], and the seven many-to-many INVERSE pairs delegate to the owning
  //     side's `addProduct`/`removeProduct` or `addExcludedProduct`/`removeExcludedProduct`
  //     [L732-L785]. The near-side array is never touched, because in the legacy Hibernate repopulates
  //     it from the far side's write; here the far side mutates this entity's LIVE accessor directly.
  //
  //   SHAPE 3 - THIS SIDE OWNS THE LINK TABLE (one pair: `listingPages`, many-to-many owner
  //     [L712-L729]). Both arrays are mutated explicitly.
  //
  // ★ THREE OF THE FOURTEEN MATERIALIZED ASSOCIATIONS HAVE NO HELPER PAIR AT ALL, which is a real
  // asymmetry and not an omission in this port: `categories` [L80] and `relatedProducts` [L81] are
  // many-to-many properties for which NEITHER side declares helpers - `model/entity/Category.cfc`
  // declares no `addProduct`, no `removeProduct` and no `hasProduct`, and `relatedProducts` is
  // self-referential with nothing declared either - so both are maintained by the ORM alone and are
  // `readonly` here. See the file header's census table.

  /**
   * Assign this product's brand, maintaining the inverse. [model/entity/Product.cfc:L662-L667]
   *
   *   public void function setBrand(required any brand) {
   *     variables.brand = arguments.brand;
   *     if(isNew() or !arguments.brand.hasProduct( this )) {
   *       arrayAppend(arguments.brand.getProducts(), this);
   *     }
   *   }
   *
   * ★ THE ONE PAIR ON THIS CLASS THAT MUTATES A FAR-SIDE ARRAY, which is why `Brand.getProducts()`
   * hands back a LIVE mutable array [src/domain/entities/brand.ts] rather than a `readonly` one. That
   * liveness exists FOR this method; nothing else reaches through it.
   *
   * THE GUARD IS REPRODUCED VERBATIM, `isNew()` disjunct and all. Its purpose is to skip a probe that
   * cannot answer usefully: for an unsaved product every primary key is `''` [unsavedvalue=""], so
   * `hasProduct` would match ANY other unsaved product and wrongly report containment. Short-circuiting
   * on `isNew()` avoids that, at the cost of admitting a duplicate when the same new product is set
   * twice - which is the trade the source made.
   *
   * NOTE THE ORDER: the field is assigned BEFORE the guard runs [L663], so `isNew()` and the far-side
   * probe both observe a product that already points at this brand. That ordering matters if a future
   * change makes either depend on `variables.brand`, so it is preserved rather than tidied.
   */
  setBrand(brand: Brand): void {
    // [model/entity/Product.cfc:L663] assignment first.
    this.brand = brand;

    // [L664] `if(isNew() or !arguments.brand.hasProduct( this ))`.
    if (this.isNew() || !brand.hasProduct(this)) {
      // [L665] `arrayAppend(arguments.brand.getProducts(), this)` - into the far side's LIVE array.
      brand.getProducts().push(this);
    }
  }

  /**
   * Detach this product from its brand. [model/entity/Product.cfc:L668-L677]
   *
   *   public void function removeBrand(any brand) {
   *     if(!structKeyExists(arguments, "brand")) { arguments.brand = variables.brand; }
   *     var index = arrayFind(arguments.brand.getProducts(), this);
   *     if(index > 0) { arrayDeleteAt(arguments.brand.getProducts(), index); }
   *     structDelete(variables, "brand");
   *   }
   *
   * THE ARGUMENT IS OPTIONAL and defaults to the currently-assigned brand [L669-L671] - the same
   * shape `PromotionReward.removePromotionPeriod` carries.
   *
   * ★ AND IT RAISES WHEN OMITTED ON A BRAND-LESS PRODUCT. With no argument and no `variables.brand`,
   * `arguments.brand` stays null and `arguments.brand.getProducts()` [L672] is a null dereference. That
   * is reproduced rather than smoothed to a no-op, because a silent no-op would let a caller believe a
   * detach happened.
   *
   * ★ THE LOOKUP IS BY REFERENCE, NOT BY KEY [L672]. `arrayFind` with an object needle compares
   * identity, so `indexOf` is the exact analogue - and it is deliberately NOT unified with
   * {@link Product.hasSku}-style key matching. The two are different operations in the source and
   * normalising them would change which elements are removed. CFML's `arrayFind` is 1-BASED with 0 for
   * "not found", hence `> 0` there and `!== -1` here.
   *
   * `structDelete(variables, "brand")` [L676] runs UNCONDITIONALLY - outside the `index > 0` guard - so
   * the field is cleared even when the far-side array did not contain this product.
   */
  removeBrand(brand?: Brand): void {
    // [model/entity/Product.cfc:L669-L671] the argument defaults to the assigned brand.
    const target: Brand | undefined = brand ?? this.brand;

    if (target === undefined) {
      throw new Error(
        'Product.removeBrand was called with no argument on a product that has no brand. The ' +
          'legacy defaults the argument from variables.brand [model/entity/Product.cfc:L670] and ' +
          'then dereferences it unguarded at L672, so this is a null-reference error there too. ' +
          'Reproduced rather than treated as a no-op, which would report a detach that did not ' +
          'happen.',
      );
    }

    // [L672-L675] reference match into the far side's LIVE array, 1-based `arrayFind` becoming
    // 0-based `indexOf`.
    const products: Product[] = target.getProducts();
    const index: number = products.indexOf(this);
    if (index !== -1) {
      products.splice(index, 1);
    }

    // [L676] `structDelete(variables, "brand")` - unconditional, outside the guard above.
    this.brand = undefined;
  }

  /** [model/entity/Product.cfc:L680-L682] `arguments.attributeValue.setProduct( this )`. */
  addAttributeValue(attributeValue: ProductAttributeValueLink): void {
    attributeValue.setProduct(this);
  }

  /** [model/entity/Product.cfc:L683-L685] `arguments.attributeValue.removeProduct( this )`. */
  removeAttributeValue(attributeValue: ProductAttributeValueLink): void {
    attributeValue.removeProduct(this);
  }

  /** [model/entity/Product.cfc:L688-L690] `arguments.productImage.setProduct( this )`. */
  addProductImage(productImage: ProductImageLink): void {
    productImage.setProduct(this);
  }

  /** [model/entity/Product.cfc:L691-L693] `arguments.productImage.removeProduct( this )`. */
  removeProductImage(productImage: ProductImageLink): void {
    productImage.removeProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L696-L698] `arguments.sku.setProduct( this )`.
   *
   * `Sku.setProduct` [model/entity/Sku.cfc:L607] appends into `product.getSkus()`, which is why that
   * accessor is LIVE - the write lands in this entity's own array without this method touching it.
   */
  addSku(sku: Sku): void {
    sku.setProduct(this);
  }

  /** [model/entity/Product.cfc:L699-L701] `arguments.sku.removeProduct( this )` - Sku.cfc:L616. */
  removeSku(sku: Sku): void {
    sku.removeProduct(this);
  }

  /** [model/entity/Product.cfc:L704-L706] `arguments.productReview.setProduct( this )`. */
  addProductReview(productReview: ProductReviewLink): void {
    productReview.setProduct(this);
  }

  /** [model/entity/Product.cfc:L707-L709] `arguments.productReview.removeProduct( this )`. */
  removeProductReview(productReview: ProductReviewLink): void {
    productReview.removeProduct(this);
  }

  /**
   * Add a content page this product is listed on. [model/entity/Product.cfc:L712-L719]
   *
   *   public void function addListingPage(required any listingPage) {
   *     if(isNew() or !hasListingPage(arguments.listingPage)) {
   *       arrayAppend(variables.listingPages, arguments.listingPage);
   *     }
   *     if(arguments.listingPage.isNew() or !arguments.listingPage.hasListingProduct( this )) {
   *       arrayAppend(arguments.listingPage.getListingProducts(), this);
   *     }
   *   }
   *
   * ★ SECONDARY ITEM S5 - THE TWO `isNew()` TESTS ARE THE WRONG WAY ROUND relative to every other
   * many-to-many owner in the tree. The house pattern guards the NEAR array with the ARGUMENT's
   * newness and the FAR array with THIS entity's newness - compare
   * `model/entity/PromotionQualifier.cfc:L202-L209`:
   *
   *   if(arguments.product.isNew() or !hasProduct(arguments.product)) { <near append> }
   *   if(isNew() or !arguments.product.hasPromotionQualifier( this ))  { <far append> }
   *
   * Here it is `isNew()` for the near array [L713] and `arguments.listingPage.isNew()` for the far one
   * [L716] - both disjuncts swapped.
   *
   * ★ AND IT IS OBSERVABLE, which is why it is recorded rather than dismissed as cosmetic. The
   * `isNew()` disjunct exists to skip a probe that cannot answer for an unsaved entity, so swapping it
   * moves WHICH input produces a duplicate. Under the house pattern, adding the same page twice
   * duplicates the NEAR array only when the PAGE is unsaved. Here it duplicates whenever THIS PRODUCT
   * is unsaved - and a product being built in the admin is unsaved for its entire construction, which
   * is precisely when listing pages get attached. The defective ordering fires on the common path, not
   * the rare one.
   *
   * REPRODUCED EXACTLY AS WRITTEN. Correcting it would change which arrays hold duplicates after a
   * multi-add, and that is a product decision.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  addListingPage(listingPage: ListingPageLink): void {
    // *** LEGACY-DEFECT [model/entity/Product.cfc:L713]: the NEAR array is guarded by THIS entity's
    // isNew(), where the house pattern guards it by the ARGUMENT's - see the doc block.
    // Preserved deliberately; do not fix without a product decision.
    if (this.isNew() || !this.hasListingPage(listingPage)) {
      // [L714] `arrayAppend(variables.listingPages, arguments.listingPage)` - the private field, which
      // is why getListingPages() can stay `readonly`.
      this.listingPages.push(listingPage);
    }

    // *** LEGACY-DEFECT [model/entity/Product.cfc:L716]: and the FAR array is guarded by the
    // ARGUMENT's isNew(), where the house pattern guards it by THIS entity's.
    // Preserved deliberately; do not fix without a product decision.
    if (listingPage.isNew() || !listingPage.hasListingProduct(this)) {
      // [L717] `arrayAppend(arguments.listingPage.getListingProducts(), this)`.
      listingPage.getListingProducts().push(this);
    }
  }

  /**
   * Remove a content page this product is listed on. [model/entity/Product.cfc:L720-L729]
   *
   *   var thisIndex = arrayFind(variables.listingPages, arguments.listingPage);
   *   if(thisIndex > 0) { arrayDeleteAt(variables.listingPages, thisIndex); }
   *   var thatIndex = arrayFind(arguments.listingPage.getListingProducts(), this);
   *   if(thatIndex > 0) { arrayDeleteAt(arguments.listingPage.getListingProducts(), thatIndex); }
   *
   * BOTH SIDES BY REFERENCE, and both independently guarded - so a half-linked pair is half-removed
   * rather than raising. Unlike its `add*` partner this method has NO `isNew()` involvement at all and
   * therefore no defect: reference identity answers correctly for saved and unsaved entities alike,
   * which is exactly why the source could omit the guard here and could not there.
   *
   * ★ `arrayDeleteAt` REMOVES ONLY THE FIRST MATCH. So a duplicate created by the defect in
   * {@link Product.addListingPage} survives one removal, and a caller has to remove twice. Reproduced.
   */
  removeListingPage(listingPage: ListingPageLink): void {
    // [model/entity/Product.cfc:L721-L724] the near side, by reference.
    const thisIndex: number = this.listingPages.indexOf(listingPage);
    if (thisIndex !== -1) {
      this.listingPages.splice(thisIndex, 1);
    }

    // [L725-L728] the far side, by reference, independently guarded.
    const listingProducts: Product[] = listingPage.getListingProducts();
    const thatIndex: number = listingProducts.indexOf(this);
    if (thatIndex !== -1) {
      listingProducts.splice(thatIndex, 1);
    }
  }

  /** [model/entity/Product.cfc:L732-L734] `arguments.promotionReward.addProduct( this )`. */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProduct(this);
  }

  /** [model/entity/Product.cfc:L735-L737] `arguments.promotionReward.removeProduct( this )`. */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L740-L742] `arguments.promotionReward.addExcludedProduct( this )`.
   *
   * ★ NOTE THE PARAMETER NAME IN THE SOURCE IS `promotionReward`, not `promotionRewardExclusion` - the
   * exclusion is a SECOND link table over the SAME entity [L84 vs L85], not a different entity. The
   * type here reflects that.
   */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L743-L745] `...promotionReward.removeExcludedProduct( this )`. */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L748-L750] `arguments.promotionQualifier.addProduct( this )`. */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProduct(this);
  }

  /** [model/entity/Product.cfc:L751-L753] `arguments.promotionQualifier.removeProduct( this )`. */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProduct(this);
  }

  /** [model/entity/Product.cfc:L756-L758] `...promotionQualifier.addExcludedProduct( this )`. */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L759-L761] `...promotionQualifier.removeExcludedProduct( this )`. */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L764-L766] `arguments.priceGroupRate.addProduct( this )`. */
  addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProduct(this);
  }

  /** [model/entity/Product.cfc:L767-L769] `arguments.priceGroupRate.removeProduct( this )`. */
  removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProduct(this);
  }

  /**
   * [model/entity/Product.cfc:L772-L774] `arguments.vendor.addProduct( this )`.
   *
   * `model/entity/Vendor.cfc` is out of scope, so the parameter is the module-local
   * {@link ProductVendorLink} projection rather than a `Vendor` class - see the file header for why
   * this association is materialized here and NOT on `Brand`, which declares the same property.
   */
  addVendor(vendor: ProductVendorLink): void {
    vendor.addProduct(this);
  }

  /** [model/entity/Product.cfc:L775-L777] `arguments.vendor.removeProduct( this )`. */
  removeVendor(vendor: ProductVendorLink): void {
    vendor.removeProduct(this);
  }

  /** [model/entity/Product.cfc:L780-L782] `arguments.physical.addProduct( this )`. */
  addPhysical(physical: ProductPhysicalLink): void {
    physical.addProduct(this);
  }

  /** [model/entity/Product.cfc:L783-L785] `arguments.physical.removeProduct( this )`. */
  removePhysical(physical: ProductPhysicalLink): void {
    physical.removeProduct(this);
  }

  // --- Overridden Methods [model/entity/Product.cfc:L789] ---------------------------------------

  /**
   * The property that stands in for this entity in a one-line summary.
   * [model/entity/Product.cfc:L791-L793]
   *
   *   return "productName";
   *
   * ★ NOT DEAD CODE, and it is worth saying why because a three-word override looks like one. Two
   * framework consumers read it: `HibachiEntity.cfc:L390` builds a smart-list projection
   * `addSelect(propertyName=getSimpleRepresentationPropertyName(), alias="name")`, so this string
   * decides which column becomes the `name` of every option row this entity appears in - including the
   * `{value, name}` rows behind {@link Product.getBrandOptions}' sibling
   * `getPropertyOptions("product")`. And `HibachiService.cfc:L31` registers it as a keyword property
   * with `weight=1`, so it decides what admin search matches on. Returning the wrong property silently
   * changes both.
   *
   * TOTAL: a constant, and it never throws.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'productName';
  }

  // LEGACY-NOTE [model/entity/Product.cfc:L795-L822]: `getAssignedAttributeSetSmartList()` IS NOT
  // PORTED, and it is the clearest case on this class for the third bullet of the smart-list dividing
  // line - the smart list IS the whole behaviour and its consumer is out of scope.
  //
  // The body is 28 lines that do nothing but ASSEMBLE A QUERY: it obtains
  // `getService("attributeService").getAttributeSetSmartList()` [L798] - and `attributeService` is
  // outside this slice - filters on `activeFlag` and `attributeSetType.systemCode = 'astProduct'`
  // [L800-L801], LEFT JOINs three related properties [L803-L805], and then builds a RAW WHERE-CONDITION
  // STRING [L807-L816] that it hands to `addWhereCondition` [L818]. Nothing is computed; nothing is
  // returned but the builder. There is no behaviour here to preserve independently of the framework
  // component that executes it, and the EAV attribute subsystem it queries is out of scope.
  //
  // ★ TWO THINGS ABOUT THAT WHERE-CONDITION ARE RECORDED SO THEY ARE NOT LOST, because they matter to
  // whoever eventually ports the attribute subsystem:
  //
  //   * IT INTERPOLATES THREE ENTITY VALUES DIRECTLY INTO SQL TEXT [L810, L812, L814] with no
  //     parameterisation - `getProductType().getProductTypeIDPath()`, `getProductID()` and
  //     `getBrand().getBrandID()`. All three are system-generated UUIDs, so this is not an exploitable
  //     hole today; it is nevertheless the one construction in the whole in-scope slice that builds SQL
  //     by concatenation rather than through `cfqueryparam`, and AAP 0.8.3 commits this port to
  //     parameterised SQL exclusively. A future port must bind these, not interpolate them.
  //   * IT CONVERTS A COMMA PATH INTO AN SQL `IN` LIST BY STRING SURGERY [L810]:
  //     `replace(getProductType().getProductTypeIDPath(), ",", "','", "all")` wrapped in outer quotes.
  //     `src/domain/valueObjects/materializedIdPath.ts` is where that idiom belongs in this port.
  //
  // Both `getProductType()` and `getBrand()` are correctly `isNull`-guarded here [L809, L813], which is
  // notable precisely because {@link Product.getBaseProductType} two hundred lines earlier is not.

  // --- ORM Event Hooks [model/entity/Product.cfc:L826-L828] -------------------------------------
  //
  // ★ THE BANNER IS PRESENT AND EMPTY IN THE SOURCE, and it is recorded rather than dropped because
  // "this entity declares no lifecycle hooks" is a FACT about the port's lifecycle contract, not an
  // absence of one. Compare `src/domain/entities/priceGroup.ts` and
  // `src/domain/entities/productType.ts`, which both declare `preInsert()`/`preUpdate()` to maintain a
  // materialized ID path, and `src/domain/entities/category.ts`, which declares them for the same
  // reason with the OPPOSITE super-call ordering. `Product` has no materialized path and no generated
  // column, so it needs neither hook - and a reader checking whether this port dropped one can settle
  // the question here instead of grepping the CFC.

  // --- Deprecated Methods [model/entity/Product.cfc:L830] ---------------------------------------
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L832-L838]: `getAttributeSets(attributeSetTypeCode=[])` IS
  // NOT PORTED. It is marked deprecated by the source's own banner, it is a thin wrapper over
  // `getAssignedAttributeSetSmartList()` above, and AAP 0.4.1 lists it among the surfaces recorded at
  // their locator rather than converted.
  //
  // ★ ONE WART IN IT IS WORTH RECORDING, because it is the kind of thing a mechanical port would carry
  // forward without noticing. The body takes a reference to the memoized smart list [L833], and then -
  // if the argument array contains `"astProductCustomization"` or `"astOrderItem"` [L834] - calls
  // `getAssignedAttributeSetSmartList().addFilter('attributeSetType.systemCode', 'astOrderItem')`
  // [L835]. Because the list is MEMOIZED, that second call returns the SAME object, so the filter is
  // added to the very list already filtered to `'astProduct'` [L801] - two equality filters on one
  // property - AND the mutation persists in the memo, so every later reader of
  // `getAssignedAttributeSetSmartList()` on this instance inherits it. Deprecated or not, that is a
  // memo-poisoning write of exactly the family as LEGACY-DEFECT D12.

  // --- Private helpers -------------------------------------------------------------------------
  //
  // NEITHER OF THE TWO BELOW EXISTS IN `model/entity/Product.cfc`. They carry the two halves of
  // `SkuService.getProductSkus` [model/service/SkuService.cfc:L220-L243] that
  // {@link Product.getSkus}'s non-default argument combinations reach through, and they live here -
  // private and un-exported - because AAP 0.4.2 requires `getSkus(sorted?, fetchOptions?)` to stay
  // SYNCHRONOUS ("sorting applied in memory when the array was fetched unsorted"). Extracting them
  // keeps `getSkus` a readable three-branch method while leaving both reproductions individually
  // documented and individually testable through it.

  /**
   * Resolve a product type's base system code from MATERIALISED STATE ONLY, with no repository call.
   *
   * Not a member of `model/entity/Product.cfc` and not a member of `model/entity/ProductType.cfc`
   * either - it is the synchronous half of `ProductType.getBaseProductType()`
   * [model/entity/ProductType.cfc:L110-L115], extracted here because {@link Product.getSkus} is fixed
   * as a synchronous accessor by AAP 0.4.2 and `applyFetchOptionsFilter` therefore cannot await. It is
   * private and un-exported so nothing outside this file can mistake it for the authoritative
   * resolution, which remains `ProductType.getBaseProductType()`.
   *
   * TWO STEPS, in the legacy's own order:
   *   1. The product type's OWN `systemCode`, when it has a non-empty one - the short-circuit at
   *      [model/entity/ProductType.cfc:L111], reproduced with the same absent-then-empty pair of tests
   *      rather than a single truthiness check.
   *   2. Otherwise the system code of the ROOT of the `parentProductType` chain. The legacy instead
   *      loads the row named by the first element of the STORED `productTypeIDPath` [L112]; the two
   *      agree whenever the ancestry is hydrated to the root, and the one case where they diverge is
   *      documented on `applyFetchOptionsFilter`.
   *
   * `undefined` is returned when the root carries no system code, which is a legitimate answer and the
   * one that makes `applyFetchOptionsFilter` fall through to its no-filter branch - matching a legacy
   * `eq` against null, which matches none of the three literals.
   *
   * NO CYCLE GUARD AND NO DEPTH LIMIT, deliberately, matching both the legacy walk and
   * `buildIdPathList` in `src/domain/valueObjects/materializedIdPath.ts`. A looping ancestry is a data
   * defect the legacy surfaces loudly, and adding a guard here would invent a non-functional
   * requirement the source does not state.
   */
  private resolveBaseProductTypeSystemCodeFromAncestry(
    productType: ProductType,
  ): string | undefined {
    // Step 1 - [model/entity/ProductType.cfc:L111] `isNull(getSystemCode()) || getSystemCode() == ""`.
    const ownSystemCode: string | undefined = productType.getSystemCode();
    if (ownSystemCode !== undefined && cfLen(ownSystemCode) > 0) {
      return ownSystemCode;
    }

    // Step 2 - climb to the root of the materialised ancestry. Same do/while shape as the path
    // builder, so the starting node is considered and the walk is never empty.
    let cursor: ProductType = productType;
    let parent: ProductType | undefined = cursor.getParentProductType();
    while (parent !== undefined) {
      cursor = parent;
      parent = cursor.getParentProductType();
    }

    return cursor.getSystemCode();
  }

  /**
   * Reproduce the eager-fetch filtering of `SkuDAO.getProductSkus`. [model/dao/SkuDAO.cfc:L150-L168]
   *
   *   var hql = "SELECT sku FROM SlatwallSku sku ";
   *   if(fetchOptions) {
   *     if(arguments.product.getBaseProductType() eq "contentAccess") {
   *       hql &= "INNER JOIN FETCH sku.accessContents contents ";
   *     } else if (arguments.product.getBaseProductType() eq "merchandise") {
   *       hql &= "INNER JOIN FETCH sku.options option ";
   *     } else if (arguments.product.getBaseProductType() eq "subscription") {
   *       hql &= "INNER JOIN sku.subscriptionTerm st INNER JOIN FETCH sku.subscriptionBenefits sb ";
   *     }
   *   }
   *   var hql &= "WHERE sku.product.productID = :productID ";
   *
   * ★ THE JOINS ARE `INNER`, WHICH MAKES THEM FILTERS AND NOT MERELY EAGER LOADS. That is the whole
   * reason this helper exists: a merchandise sku with NO options is excluded from the result set
   * entirely. In this port the associations are already materialized, so the eager-load half is a
   * no-op and only the filtering half is observable - and the filtering half is computable in memory
   * from `sku.getOptions()`, with no repository call.
   *
   * SECONDARY ITEM: `var hql &=` on the WHERE line re-declares an already-declared local
   * [model/dao/SkuDAO.cfc:L163]. CFML tolerates the redundant `var`; it is recorded because it is the
   * same class of slip as the `var totalRatingPoints +=` inside D1's loop.
   *
   * THE `eq` COMPARISONS ARE CASE-INSENSITIVE and a null base product type normalises to `''`, so a
   * product whose product type carries no system code matches none of the three branches and is not
   * filtered - reproduced with `(x ?? '').toLowerCase()` rather than by reaching for `cfEquals`, which
   * raises on a nullish operand and would turn a legitimate fall-through into a failure.
   *
   * ★ THE OTHER TWO BRANCHES RAISE RATHER THAN FILTER, and that is a scope decision rather than a
   * defect: `sku.accessContents` [model/entity/Sku.cfc:L77] and `sku.subscriptionBenefits`
   * [model/entity/Sku.cfc:L78] belong to the content-access and subscription modules, which AAP 0.2.2
   * excludes, so this port never materializes them and cannot compute their filters. Returning the
   * unfiltered array instead would silently include skus the legacy excludes.
   *
   * IT DEREFERENCES `getBaseProductType()` UNGUARDED, exactly as the source does at
   * [model/dao/SkuDAO.cfc:L152] - so a product with no product type raises here too, and only when
   * `fetchOptions` is true. See {@link Product.getBaseProductType}.
   *
   * ★ AND IT RESOLVES THE BRANCH KEY WITHOUT A REPOSITORY ROUND TRIP, WHICH IS WHY
   * {@link Product.getSkus} CAN STAY SYNCHRONOUS. {@link Product.getBaseProductType} is asynchronous
   * because `ProductType.getBaseProductType()` loads the ROOT product type named by the first element
   * of `productTypeIDPath` when the immediate type carries no system code
   * [model/entity/ProductType.cfc:L110-L115]. AAP 0.4.2 fixes `getSkus(sorted?, fetchOptions?)` as a
   * SYNCHRONOUS accessor - "sorting applied in memory when the array was fetched unsorted" - so this
   * helper cannot await, and widening `getSkus` to a promise would break that contract for every
   * caller. It therefore resolves the same value from the ALREADY-MATERIALISED product-type ancestry:
   * the immediate type's own `systemCode` first, exactly the short-circuit the legacy takes at
   * [model/entity/ProductType.cfc:L111], and otherwise the system code of the root of the
   * `parentProductType` chain - which is the row the stored path's first element names whenever that
   * chain is hydrated to the root.
   *
   * The ONE boundary where the two disagree is worth stating plainly rather than burying: if the
   * ancestry is hydrated only partially, the in-memory climb stops early and yields no system code,
   * which falls through to the no-filter branch, whereas the legacy would have loaded the root row.
   * That makes the ancestry a FETCH-SHAPE OBLIGATION on the repository - a repository that hydrates a
   * product for `getSkus(sorted, fetchOptions=true)` must hydrate the product-type chain to its root -
   * and fetch shape is exactly the kind of decision this architecture pushes to the repository and
   * documents at the producing method. The chain is NOT substituted inside
   * `ProductType.getBaseProductType()` itself, where the stored path remains the authority; the
   * accommodation is bounded to this one site, which is the site that cannot await.
   *
   * A FRESH ARRAY IS ALWAYS RETURNED, never the live one, because the caller may sort it in place.
   */
  private applyFetchOptionsFilter(fetchOptions: boolean): Sku[] {
    // [model/dao/SkuDAO.cfc:L151] `if(fetchOptions)` - without it there is no join and no filter.
    if (!fetchOptions) {
      return [...this.skus];
    }

    // [L152] the unguarded dereference, reproduced here rather than delegated, because the accessor
    // that reproduces it is asynchronous and this helper serves a synchronous caller. The raise, its
    // message and its trigger condition are identical.
    if (this.productType === undefined) {
      throw new Error(
        'Product.getSkus(sorted, fetchOptions=true) dereferences getProductType() unguarded ' +
          '[model/dao/SkuDAO.cfc:L152 via model/entity/Product.cfc:L494] and this product has no ' +
          'product type. The legacy fails on the same input.',
      );
    }

    // The base type, resolved from materialised state - see the doc. `?? ''` is CFML's normalisation
    // of a null operand in a string comparison; `toLowerCase()` is its case-insensitive `eq`.
    const baseProductType: string = (
      this.resolveBaseProductTypeSystemCodeFromAncestry(this.productType) ?? ''
    ).toLowerCase();

    // [L153-L154] the contentAccess branch.
    if (baseProductType === 'contentaccess') {
      throw new Error(
        'Product.getSkus(sorted, fetchOptions=true) cannot be evaluated for a contentAccess ' +
          'product. model/dao/SkuDAO.cfc:L154 adds "INNER JOIN FETCH sku.accessContents", which ' +
          'FILTERS OUT skus with no access contents, and sku.accessContents ' +
          '[model/entity/Sku.cfc:L77] belongs to the content-access module that AAP 0.2.2 excludes - ' +
          'so this port cannot reproduce the filter. Returning the unfiltered array would silently ' +
          'include skus the legacy omits.',
      );
    }

    // [L155-L156] the merchandise branch - the one this slice CAN reproduce, because `sku.options` is
    // materialized here.
    if (baseProductType === 'merchandise') {
      return this.skus.filter((sku: Sku): boolean => sku.getOptions().length > 0);
    }

    // [L157-L158] the subscription branch.
    if (baseProductType === 'subscription') {
      throw new Error(
        'Product.getSkus(sorted, fetchOptions=true) cannot be evaluated for a subscription ' +
          'product. model/dao/SkuDAO.cfc:L158 adds "INNER JOIN sku.subscriptionTerm" and ' +
          '"INNER JOIN FETCH sku.subscriptionBenefits", both of which FILTER, and both associations ' +
          'belong to the subscription module that AAP 0.2.2 excludes - so this port cannot reproduce ' +
          'the filter.',
      );
    }

    // No branch matched, so the legacy HQL carries no join and no filter [L151-L160 fall-through].
    return [...this.skus];
  }

  /**
   * Reproduce the option-group weighted sort of `SkuService.getProductSkus`.
   * [model/service/SkuService.cfc:L224-L240] over [model/dao/SkuDAO.cfc:L172-L202]
   *
   * The DAO orders sku IDs by a weighted sum across each sku's options:
   *
   *   SELECT SwSku.skuID FROM SwSku
   *     INNER JOIN SwSkuOption   ON SwSku.skuID = SwSkuOption.skuID
   *     INNER JOIN SwOption      ON SwSkuOption.optionID = SwOption.optionID
   *     INNER JOIN SwOptionGroup ON SwOption.optionGroupID = SwOptionGroup.optionGroupID
   *   WHERE SwSku.productID = ?
   *   GROUP BY SwSku.skuID
   *   ORDER BY SUM(SwOption.sortOrder * POWER(10, N - SwOptionGroup.sortOrder)) ASC
   *
   * and the service then rebuilds its entity array into that order [L234-L238].
   *
   * ★ PORTED IN MEMORY, AND THAT IS SOUND RATHER THAN CONVENIENT - THE PROOF MATTERS. `N` is
   * `getNextOptionGroupSortOrder()` [model/dao/SkuDAO.cfc:L203-L216], a GLOBAL `max(sortOrder)+1` over
   * every option group in the database. Since `POWER(10, N - g) = 10^N / 10^g`, the whole ordering key
   * is `10^N x SUM(sortOrder / 10^g)` - and multiplying every row's key by one positive constant cannot
   * reorder them. So the ordering does NOT depend on `N`, the query needs no global reach, and
   * {@link Product.getSkus} needs no repository call to stay faithful.
   *
   * `N` IS STILL ACCEPTED AS AN OPTIONAL CONSTRUCTOR INPUT ({@link Product.nextOptionGroupSortOrder})
   * for the one thing it does affect: the exact floating-point magnitudes. Supplying the real value
   * reproduces MySQL's doubles bit for bit; omitting it derives a local `max(group sortOrder)+1` over
   * this product's own materialized groups, defaulting to 1 when there are none - which is exactly what
   * the DAO's own empty-table fallback yields [L205, L211-L213].
   *
   * ★ THREE FIDELITY POINTS THAT A NAIVE "SORT BY OPTION SORT ORDER" WOULD GET WRONG:
   *
   *   1. THE INNER JOIN CHAIN EXCLUDES OPTION-LESS SKUS from the ordered ID list, so the legacy's
   *      `arrayFind(sortedArray, skuID)` [L236] returns 0 for such a sku and the very next line
   *      assigns `sortedArrayReturn[0]` - an invalid 1-based index. That is a genuine raise, and it is
   *      REACHABLE: the guard at [L223] only requires the FIRST sku to have options. Reproduced as a
   *      raise. Note it cannot fire when `fetchOptions` is true for a merchandise product, because
   *      `applyFetchOptionsFilter` has already removed those skus.
   *   2. A NULL `SwOption.sortOrder` CONTRIBUTES NOTHING TO THE SUM - SQL `SUM` skips nulls - and a sku
   *      whose every option has a null sort order therefore has a NULL key, which MySQL orders FIRST
   *      ascending. Both behaviours are reproduced: undefined sort orders are skipped, and a sku with
   *      no contributing term sorts ahead of every sku with one.
   *   3. THE SORT IS STABLE HERE AND UNSPECIFIED THERE. Two skus with equal keys have no defined
   *      relative order in SQL; a stable sort is one of the permitted outcomes, and it is the one that
   *      makes this method's own tests deterministic.
   *
   * NOT REPRODUCED, AND DELIBERATELY: `arrayResize(sortedArrayReturn, arrayLen(sortedArray))` [L232]
   * sizes the result to the ORDERED ID LIST's length rather than to the entity array's, so when the two
   * differ - which `fetchOptions` filtering can cause for a contentAccess or subscription product - the
   * legacy returns an array with UNINITIALISED HOLES. Those two product types already raise in
   * `applyFetchOptionsFilter`, so the hole case is unreachable in this port; it is recorded here so the
   * absence is a decision rather than an oversight.
   */
  private sortSkusByOptionGroupWeighting(skus: Sku[]): Sku[] {
    // `N` - supplied for bit-identical arithmetic, otherwise derived locally. Ordering is invariant in
    // it either way; see the doc block.
    let n: number;
    if (this.nextOptionGroupSortOrder !== undefined) {
      n = this.nextOptionGroupSortOrder;
    } else {
      let maxGroupSortOrder: number | undefined;
      for (const sku of skus) {
        for (const option of sku.getOptions()) {
          const group: OptionGroup | undefined = option.getOptionGroup();
          if (group === undefined) {
            continue;
          }
          const groupSortOrder: number = group.getSortOrder();
          if (maxGroupSortOrder === undefined || groupSortOrder > maxGroupSortOrder) {
            maxGroupSortOrder = groupSortOrder;
          }
        }
      }
      // [model/dao/SkuDAO.cfc:L205] the seed of 1, which also survives an empty table [L211-L213].
      n = maxGroupSortOrder === undefined ? 1 : maxGroupSortOrder + 1;
    }

    // The ordering key per sku: `SUM(option.sortOrder * 10^(N - optionGroup.sortOrder))`, with a
    // `undefined` key standing for SQL NULL. Computed once per sku rather than inside the comparator.
    const weights: Map<Sku, number | undefined> = new Map<Sku, number | undefined>();
    const orderedSkuIds: Set<string> = new Set<string>();

    for (const sku of skus) {
      let weight: number | undefined;
      for (const option of sku.getOptions()) {
        const group: OptionGroup | undefined = option.getOptionGroup();
        if (group === undefined) {
          continue;
        }
        const optionSortOrder: number | undefined = option.getSortOrder();
        // [model/dao/SkuDAO.cfc:L199] `SUM(SwOption.sortOrder * ...)` - SQL SUM skips NULL terms.
        if (optionSortOrder === undefined) {
          continue;
        }
        const term: number = optionSortOrder * Math.pow(10, n - group.getSortOrder());
        weight = weight === undefined ? term : weight + term;
      }
      weights.set(sku, weight);

      // The INNER JOIN chain [L180-L191] admits a sku only if it has at least one option joined
      // through to an option group - which is exactly the condition under which a term was computed.
      if (sku.getOptions().length > 0) {
        orderedSkuIds.add(sku.getSkuID());
      }
    }

    // [model/service/SkuService.cfc:L234-L238] the rebuild loop, and the raise it hides. A sku absent
    // from the ordered ID list yields `arrayFind` = 0, and `sortedArrayReturn[0] = ...` is an invalid
    // 1-based assignment.
    for (const sku of skus) {
      if (!orderedSkuIds.has(sku.getSkuID())) {
        throw new Error(
          `Product.getSkus(sorted=true) cannot place sku ${JSON.stringify(sku.getSkuID())}, which ` +
            'has no options. model/dao/SkuDAO.cfc:L180-L191 joins SwSkuOption INNER, so an ' +
            'option-less sku is absent from the ordered id list, model/service/SkuService.cfc:L236 ' +
            'then gets arrayFind = 0, and L237 assigns sortedArrayReturn[0] - an invalid 1-based ' +
            'index. The legacy fails on the same input; the guard at L223 only requires the FIRST ' +
            'sku to have options.',
        );
      }
    }

    // `ORDER BY ... ASC` [model/dao/SkuDAO.cfc:L199] with SQL's NULLS FIRST for ascending order.
    return [...skus].sort((left: Sku, right: Sku): number => {
      const leftWeight: number | undefined = weights.get(left);
      const rightWeight: number | undefined = weights.get(right);
      if (leftWeight === undefined && rightWeight === undefined) {
        return 0;
      }
      if (leftWeight === undefined) {
        return -1;
      }
      if (rightWeight === undefined) {
        return 1;
      }
      return leftWeight - rightWeight;
    });
  }
}

// ---------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE
//
// AAP 0.6.6 records that only TWO legacy test files touch the in-scope slice, and ONE OF THEM IS THIS
// ENTITY'S: `meta/tests/unit/entity/ProductTest.cfc`. Obligation 1 below is therefore the single
// LEGACY-EXTENDED assertion on this class - it must carry the original fixture forward byte for byte.
// Everything else is NET-NEW and must be labelled as such in `tests/traceability/legacyTestMap.ts`;
// presenting any of it as parity would fail AAP 0.9.4.
//
//   1. ★ LEGACY-EXTENDED - `getProductURL()` returns `/<globalURLKeyProduct>/nike-air-jorden/`, from
//      `productUrlIsCorrectlyFormatted()` in `meta/tests/unit/entity/ProductTest.cfc`. The fixture's
//      `urlTitle` is the misspelled `nike-air-jorden` and it is retained VERBATIM: it is the legacy
//      assertion's input, not a typo to tidy. The four cases inherited from
//      `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` come with it.
//   2. `getProductURL()` and `getListingProductURL()` differ ONLY by the leading slash, and BOTH RAISE
//      when the resolved `globalURLKeyProduct` setting or the `urlTitle` is absent. Assert the raise -
//      an empty-string default would render a URL that resolves to the wrong page.
//   3. ★ D1 - `getProductRating()` averages review #1's rating n times, so a product with ratings
//      [5, 1, 1] reports 5. Spy on the reviews array and assert `getRating()` is called n times ON
//      THE FIRST ELEMENT. A test that only checks the number would pass against a corrected loop.
//   4. ★ D2 - `getPageIDs()` ALWAYS raises, and the message must name both steps: the `getPages()`
//      call against a `listingPages` property, and the attribute-value fallback that turns it into
//      `""` before `arrayLen("")` fails.
//   5. ★ D3 - `getTemplateOptions()` ALWAYS raises, naming `getProductTemplates()` as declared nowhere
//      in the repository and `HibachiService.onMissingGetMethod`'s read of an empty argument struct as
//      the mechanism.
//   6. ★ D4 - `getTemplate()` never returns a `variables.template` value, because nothing in the
//      repository calls `setTemplate` on a product. Assert the setting-backed branch is the only live
//      one, and that it RAISES when the setting was not materialized.
//   7. ★ D5 - `getBrandOptions()` returns row 0 relabelled and rows 1..n untouched, and it RAISES on
//      an EMPTY candidate list. The empty-list raise is the assertion that documents why the legacy's
//      unguarded `options[1]` is safe there and would not be here.
//   8. ★ D6 - `getImageGalleryArray()` puts the image DESCRIPTION in `name`, and its two loops dedupe
//      against ONE shared filename list using TWO different keys. Build a fixture where a product
//      image and a sku image share a filename and assert exactly which entries survive; then assert
//      the `skuID` key is PRESENT on sku entries and ABSENT on product-image entries.
//   9. ★ D7 - `getQuantity()` ALWAYS raises here, so the location-branch discard cannot be asserted
//      directly. Assert instead that the message names the inventory subsystem AND records D7, so the
//      defect survives into whichever port eventually implements it. Same for `getQATS()`, which must
//      raise THROUGH `getQuantity` rather than with its own message.
//  10. ★ D8 - `getSalePrice()` on a product with skus and NO default sku returns `Money` zero AND
//      calls `getSalePrice()` exactly once on the first sku. Both halves matter: the return value
//      pins the missing `return`, the spy pins that the discarded call is still made.
//  11. ★ D9 - `getSalePriceExpirationDateTime()` returns `now()` for a product with NO default sku and
//      RAISES for a product WITH one. That pair is the whole defect: it works precisely for the
//      products that cannot have a sale price to expire.
//  12. ★ D10 - `getProductOptionsByGroup()` ALWAYS raises, naming both `getProductService()` and
//      `ProductService.getProductOptionsByGroup` as undeclared.
//  13. ★ D11 - `getAllowBackorderFlag()` returns the NUMBER 1 or 0, never a boolean, and raises when
//      the setting was not materialized. Assert `typeof === 'number'` explicitly; a boolean return
//      would satisfy a loose truthiness assertion and silently drop the `returntype="numeric"`
//      contract.
//  14. ★ D12 - THE ONE FIXED DEFECT. Call `getBrandName()` TWICE and assert BOTH calls return the
//      brand name. Under the legacy the second returns `''`. Then assert a brand-less product returns
//      `''` on every call, so the fix did not also remove the default. This is the test that makes the
//      divergence auditable, and its doc comment must state that AAP 0.6.7's "unobservable" framing
//      does not hold for this member.
//  15. `getSkus()` with NO arguments returns the SAME ARRAY OBJECT on every call - assert identity,
//      not deep equality - because `Sku.setProduct` [model/entity/Sku.cfc:L607] mutates it in place.
//      Then assert that `getSkus(true)` and `getSkus(false, true)` return FRESH arrays, so a caller
//      sorting the result cannot reorder the entity's own state.
//  16. `getSkus(sorted=true)` orders by the option-group weighted sum, and the ORDER IS IDENTICAL
//      whether `nextOptionGroupSortOrder` is supplied or derived. That is the executable form of the
//      ordering-invariance proof on `sortSkusByOptionGroupWeighting`, and it is what licenses the
//      method staying synchronous.
//  17. `getSkus(sorted=true)` RAISES when any materialized sku has no options, reproducing
//      `model/service/SkuService.cfc:L237`'s invalid `sortedArrayReturn[0]` assignment - and does NOT
//      raise when the same product is fetched with `fetchOptions=true`, because the merchandise filter
//      removed those skus first. Assert both directions.
//  18. `getSkus(sorted=true)` does NOT sort when only the FIRST sku lacks options, however many
//      options the others have - the guard at `model/service/SkuService.cfc:L223` tests `skus[1]`
//      alone.
//  19. `getSkus(fetchOptions=true)` filters to option-bearing skus for a `merchandise` product,
//      RAISES for `contentAccess` and `subscription` naming the AAP exclusion, and filters NOTHING
//      for a product whose product type carries no system code - the null-normalises-to-`''` case.
//      And it RAISES on a product with no product type at all, reproducing
//      `model/dao/SkuDAO.cfc:L152`.
//  20. `getOptionGroups()` derives distinct groups from `skus -> options -> optionGroup`, sorted by
//      the group's REQUIRED `sortOrder`, and `getOptionGroupCount()` agrees with its length. Include a
//      sku whose option has NO group to prove those options are skipped rather than throwing.
//  21. `getOptionsByOptionGroup()` matches the group id CASE-INSENSITIVELY, returns distinct options,
//      and sorts options with a NULL `sortOrder` FIRST.
//  22. `getSkuByID()` matches case-insensitively and returns `undefined` for a miss - the legacy falls
//      off the end, so `undefined` is the faithful answer and `null` is not.
//  23. `getSkuSalePriceDetails()` returns `undefined` for a sku id with no entry, NOT `{}`, and
//      matches the key case-insensitively.
//  24. `getImages()` returns the SAME ARRAY OBJECT as `getProductImages()` - assert identity. It is an
//      alias, not a copy, and a copy would silently break `model/entity/Image.cfc:L158`'s in-place
//      append.
//  25. The five default-sku image delegators all RAISE on a product with no default sku, while the
//      SIX price delegators all return `undefined` on the same product. That asymmetry is the
//      source's and this pair of assertions is what stops a future sweep from "harmonising" it.
//  26. ★ `getImageDirectory()` returns `''` - the empty string - and does NOT raise, because `Sku`
//      declares no such method and the legacy therefore lands on the attribute-value fallback. Assert
//      the empty string explicitly, and assert `Sku.prototype` has no `getImageDirectory`.
//  27. `getPrice()` prefers a supplied `price` over the default sku's, and it is the ONLY one of the
//      six price delegators with that first branch. Assert the other five ignore any such override.
//  28. `getSalePriceDiscountType()` returns `'none'` for a product with no default sku, delegates
//      otherwise, and MEMOIZES the delegated value - contrast obligation 14. Calling twice must hit
//      the sku once.
//  29. `getCrumbData()` returns all EIGHTEEN keys including the misspelled `retrictgroups` and
//      `targetPrams`, and RAISES both when the base crumb array is empty and when the supplied path
//      reduces to nothing. Assert the key spellings by exact string - they are Mura data-contract
//      keys and a "corrected" spelling would break the consumer.
//  30. `getSkuBySelectedOptions()`'s three error messages are byte-for-byte the source's, INCLUDING
//      the typos `seperated`, `selectOptions` and `indvidual`. Assert the exact strings; they are the
//      only record that this port did not quietly rewrite them.
//  31. `getCategoryIDs()` emits a comma list in encounter order and returns `''` for a product in no
//      categories - `listAppend`'s empty-list behaviour, not a leading comma.
//  32. `getDefaultProductImageFiles()` skips skus whose `imageFile` is absent and de-duplicates by
//      filename. Include two skus sharing an image and one with none.
//  33. ★ `setBrand()` appends into the brand's LIVE array unconditionally when THIS PRODUCT is new,
//      and at most once when it is saved. Construct all four newness combinations. Then assert
//      `removeBrand()` splices BY REFERENCE - a distinct `Product` object with the same primary key
//      must NOT be removed - clears the field EVEN when the product was absent from the array, and
//      RAISES when called with no argument on a brand-less product.
//  34. ★ S5 - `addListingPage()`'s two `isNew()` disjuncts are SWAPPED relative to the house pattern.
//      Build the four newness combinations and assert which appends happen; specifically, adding the
//      same SAVED page twice to an UNSAVED product must produce TWO near-side entries. Reversing
//      either polarity must fail a test. Then assert `removeListingPage()` removes only ONE of them.
//  35. The eleven pure-delegation pairs each make EXACTLY ONE far-side call and touch no near-side
//      array. Spy on the far side; assert the near-side array is unchanged by the helper itself.
//  36. The twelve `has*` probes match by PRIMARY KEY across two distinct objects representing the same
//      saved row, EXCEPT `hasAttributeValue`, `hasProductReview` and `hasListingPage`, which are
//      REFERENCE-ONLY because their link projections expose no key accessor. Assert that difference
//      deliberately - it is stricter than the legacy, and the assertion is where that choice is
//      recorded.
//  37. `isNew()` is TRUE for `productID: ''` and FALSE otherwise, and `setBrand`/`addListingPage`
//      observe it consistently with obligations 33 and 34.
//  38. ★ THE ANTI-CONTRACT, in three parts. (a) `preInsert` and `preUpdate` are ABSENT from this
//      class - the source's ORM hook banner is empty - so a future "every entity needs hooks" sweep
//      has to read the note rather than add them. (b) `getAttributeSets`,
//      `getAssignedAttributeSetSmartList` and `getListingPagesOptionsSmartList` are ABSENT, recorded
//      at their locators instead. (c) NO aggregate `hasAnyXXX` probe exists on this class, because
//      every aggregate call in the promotion engine targets a reward or a qualifier.
//  39. `getSimpleRepresentationPropertyName()` returns exactly `'productName'`. A one-line test, and
//      it guards two framework contracts: the `name` alias of every product option row and the admin
//      keyword-search property.
//  40. Every money-returning member answers with `Money`, never a `number` - `getPrice`,
//      `getRenewalPrice`, `getListPrice`, `getLivePrice`, `getCurrentAccountPrice` and `getSalePrice`.
//      AAP 0.8.3 admits no float arithmetic on a monetary value anywhere in the target, and
//      `getSalePrice()`'s zero fallback is the one place a bare `0` could have crept in.
// ---------------------------------------------------------------------------
