// ---------------------------------------------------------------------------
// slatwall-ts - Product entity
//
// Port of model/entity/Product.cfc (841 lines), the second-largest in-scope entity after
// model/entity/Sku.cfc. It owns MUST-PRESERVE option-to-SKU resolution
// [model/entity/Product.cfc:L349-L369], the brand-name and sale-price cascades, and the memoized
// accessors built on them.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/Product.cfc:L49]
//
//   component displayname="Product" entityname="SlatwallProduct" table="SwProduct"
//   persistent="true" extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="productService" hb_permission="this"
//   hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm" {
//
// Schema continuity is binding: table `SwProduct`, entity name `SlatwallProduct`, no migration, no
// rename, no column change. Every `hb_*` and `rbKey` value is carried forward verbatim as an inert
// string constant so the legacy admin can still resolve it - including `hb_processContexts`, whose
// four values name four process objects of which three are in scope (`Product_UpdateSkus`,
// `Product_AddOptionGroup`, `Product_AddOption`) and `addSubscriptionTerm` is not.
//
// LEGACY-NOTE [model/entity/Product.cfc:L68-L70]: THREE EAGER `fetch="join"` MANY-TO-ONES, NOT ONE.
// `brand` [L68], `productType` [L69] and `defaultSku` [L70] are all eager, so the AAP's claim that
// `PromotionPeriod.promotion` is the slice's only eager fetch is wrong. The consequence is
// mechanical: the repository materializes all three, so every accessor reading them is SYNCHRONOUS.
// There is no `lazy=` attribute anywhere in `Product.cfc`, so unlike `ProductType.products`
// [model/entity/ProductType.cfc:L66], `PromotionCode.orders` [model/entity/PromotionCode.cfc:L68]
// and `Sku.orderItems` [model/entity/Sku.cfc:L71] this component has no `lazy="extra"` collection.
//
// BOOLEAN CENSUS - THREE persistent boolean columns, of which EXACTLY ONE declares a default. Only
// the lowercase `ormtype="boolean"` spelling occurs here, and every column is read through
// `cfBoolean()` from ../../lib/cfml/truthiness.js, so a SQL `NULL` becomes `false`.
//
//   | line | property                      | default   | hydration                          |
//   | L53  | activeFlag                    | NONE      | cfBoolean(input) - `false` on NULL |
//   | L58  | publishedFlag                 | "false"   | cfBoolean(input) - default honoured|
//   | L64  | calculatedAllowBackorderFlag  | NONE      | cfBoolean(input) - `false` on NULL |
//
// Two further boolean-typed properties are NON-persistent and outside this census -
// `allowBackorderFlag` [L102] and `transactionExistsFlag` [L110] - both computed.
//
// THE `getService(` VERDICT TABLE - ALL EIGHTEEN SITES ACCOUNTED FOR. Every one is a domain file
// reaching outward, which is what the T2 transformation removes and what the ESLint
// `no-restricted-imports` boundary makes impossible to reintroduce. The AAP's citation of the
// `optionService` reach at "L343" is wrong; the verified site is L341. NINE of the eighteen resolve
// to OMIT and are itemized with their locators in the OMISSION REGISTER at the foot of the class -
// [L132], [L148], [L173], [L401], [L441], [L443], [L501], [L542], [L798]. The other nine:
//
//   |  # | line | service reached        | disposition                                            |
//   |  3 | L159 | skuService             | RESOLVED IN MEMORY - getSkus over the array            |
//   |  5 | L254 | OptionService (cap. O) | EAGER ASSOCIATION - optionGroups materialized upstream |
//   |  6 | L341 | optionService          | RESOLVED IN MEMORY - getOptionsByOptionGroup, see below|
//   |  7 | L367 | productService         | PORT - skuRepository.getSkusBySelectedOptions          |
//   | 12 | L519 | promotionService       | PORT - salePriceResolver, §3.9 branch (a), see below    |
//   | 14 | L626 | skuService             | PORT - skuRepository.getTransactionExistsFlag          |
//   | 15 | L637 | optionService          | PORT - optionRepository.getUnusedProductOptions        |
//   | 16 | L644 | optionService          | PORT - optionRepository.getUnusedProductOptionGroups   |
//   | 17 | L651 | subscriptionService    | REFUSED - the stub port declares no such member        |
//
// The six injected collaborators, and what each discharges:
//
//   skuRepository            [L367] getSkusBySelectedOptions, [L626] getTransactionExistsFlag
//   optionRepository         [L637] getUnusedProductOptions, [L644] getUnusedProductOptionGroups
//   productRepository        [L833] getAttributeSets, the ONE ported attribute path
//   settingsProvider         [L208] and [L212] the product URL-key setting
//   salePriceResolver        [L519] getSalePriceDetailsForProductSkus, the §3.9 branch-(a) reach
//   subscriptionTermProvider held only so row 17's refusal can name a real collaborator
//
// ROW 12 IS THE §3.9 DECISION, AND THIS IS THE STATEMENT OF WHICH ARM WAS TAKEN. The plan makes the
// choice conditional on what `../ports/promotionRepository.js` declares: branch (a) - inject and
// call - if a member there can serve `getSalePriceDetailsForProductSkus`
// [model/service/PromotionService.cfc:L1022], branch (b) - omit - if none can. That file exports a
// SECOND interface, `SalePriceResolver`, whose single method is exactly that call, so BRANCH (a) IS
// THE LIVE ARM and `getSalePriceDetailsForSkus()` [L517-L522] ships. No fourteenth port file was
// created, and no port member was invented: the interface is co-located in the thirteenth port
// file, it is satisfied in `src/handlers/bootstrap.ts` by adapting the ported
// `src/services/promotionService.ts` surface, and it is injected into this entity from there - so
// the reduction and the rounding at [model/service/PromotionService.cfc:L1024-L1028] happen in the
// composition root, and this file imports the TYPE only.
//
// LEGACY-NOTE [model/entity/Product.cfc:L254 vs L341/L637/L644/L651]: the service name's casing and
// quoting are inconsistent in the source - [L254] writes `getService("OptionService")` with a
// capital `O` and double quotes, [L341]/[L637]/[L644] write `getService('optionService')` lower
// case with single quotes. DI/1 resolves bean names case-insensitively. Annotated, NOT normalised.
//
// THE `remove*` INVERSION CROSS-CHECK - VERDICT: THIRTEEN CLEAN, ZERO INVERTED.
// [model/entity/Option.cfc:L129-L131] and [L145-L147] carry a real inversion defect - a `remove*`
// helper calling `add*` on the far side - so all thirteen `remove*` helpers here were read verbatim
// and checked: [L668] Brand, [L683] AttributeValue, [L691] ProductImage, [L699] Sku, [L707]
// ProductReview, [L720] ListingPage, [L735] PromotionReward, [L743] PromotionRewardExclusion,
// [L751] PromotionQualifier, [L759] PromotionQualifierExclusion, [L767] PriceGroupRate, [L775]
// Vendor and [L783] Physical. Six - [L683], [L691], [L707], [L720], [L775], [L783] - target
// entities outside the eighteen and are DROPPED.
//
// LEGACY-NOTE [model/entity/Product.cfc:L672-L675]: THE INDEX-BASE CHANGE, ONCE, FOR THE WHOLE
// FILE. CFML `arrayFind` returns a 1-BASED index or 0, so `if(index > 0)` is the idiomatic
// found-test there; TypeScript `findIndex` returns 0-BASED or -1, so the same guard must be written
// `!== -1`. `removeBrand` is the only surviving helper here that uses the pattern.
//
// THE INHERITED SURFACE IS DELIBERATELY NOT PORTED. `extends="HibachiEntity"` is UNQUALIFIED,
// resolving to model/entity/HibachiEntity.cfc (274 lines), which itself extends
// `Slatwall.org.Hibachi.HibachiEntity` - a THREE-LEVEL chain. That intermediate class holds twelve
// further `getService(...)` sites (L123, L130, L135, L145, L178, L180, L182, L194, L196, L207,
// L257, L266), seven of them `attributeService`, all moot because the EAV read path is not ported.
// [org/Hibachi/HibachiEntity.cfc:L507-L565] then dispatches ELEVEN method-name patterns dynamically
// (`hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`, `get*ID`, `get*Options`,
// `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, plus a `getAttributeValue`
// fallback at [L559]) and terminates in a THROW at [L565]. TYPESCRIPT DOES NOT EMULATE DYNAMIC
// DISPATCH: no `Proxy`, no index signature, no `evaluate`. Only concretely-called patterns are
// authored. `Product` declares `attributeValues` [L75], so it is one of only four in-scope entities
// that can reach the [L559] fallback; for the other fourteen an unmatched `get...` throws at
// [L565].
//
// DEFECT 19, `getBrandName()` [model/entity/Product.cfc:L524-L532], IS FIXED as a deliberate
// divergence - unobservable through the public contract - and annotated at its own site. Every
// other defect here is reproduced as-is. `Product.cfc` carries the ORM Event Hooks banner pair
// [L826]/[L828] with NOTHING between them, so there are no hooks to re-express as explicit path
// maintenance.
//
// THREE SIGNATURES FOLLOW THE SHIPPED SIBLING RATHER THAN THE PLAN, because the artefact is the
// authority: `getBaseProductType()` is ASYNC, since `ProductType.getBaseProductType()` is async and
// src/domain/entities/sku.ts awaits it; the unused-* trio returns `readonly SelectOption[]`, which
// is what `OptionRepository` declares; and `getTitle()` is OMITTED FOR ONE REASON ONLY, WHICH IS NOT
// A SETTINGS REASON. `productTitleString` IS published on the `SettingKey` union - it is the fifth of
// its seven literals [model/service/SettingService.cfc:L193] - and this entity holds the provider
// that resolves it. What is missing is the RENDERER: [model/entity/Product.cfc:L542] hands the
// template to `getService("hibachiUtilityService").replaceStringTemplate(...)`, a framework utility
// under `org/Hibachi/`, the boundary this migration extracts from and never ports, so the `${...}`
// markers in the value have nothing to resolve them. `getTemplate` (`productDisplayTemplate` [:L190]),
// the whole image cluster and `getAllowBackorderFlag` (`skuAllowBackorderFlag` [:L219]) are omitted on
// the settings ground the title member does not have: each of those keys is genuinely outside the
// closed seven-key union, and no eighth key may be added.
//
// ASYNC APPLIES PER METHOD, NOT PER ENTITY: a method stays synchronous when it only traverses
// already-materialized state or performs pure arithmetic, and becomes `async` only where its body
// genuinely reaches a port - eight async members here, each naming the port it reaches.
// ---------------------------------------------------------------------------

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { structGet, structKeyExists, structKeyList, type CfStruct } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, cfTruthy, type CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { AttributeSetSummary, ProductRepository } from '../ports/productRepository.js';
import type { OptionRepository, SelectOption } from '../ports/optionRepository.js';
import type { SalePriceDetail, SalePriceResolver } from '../ports/promotionRepository.js';
import type { SettingsProvider } from '../ports/settingsProvider.js';
import type { SkuRepository } from '../ports/skuRepository.js';
import type { SubscriptionTermProvider } from '../ports/subscriptionTermProvider.js';
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

// ---------------------------------------------------------------------------
// THE IMPORT SURFACE
//
// `src/domain/**` may import ONLY from `src/lib/**` and from within `src/domain/**` - never
// `src/repositories/**`, `src/handlers/**`, `src/integrations/**`, `mysql2`, `aws-lambda`, `dotenv`
// or `decimal.js`. `no-restricted-imports` in slatwall-ts/eslint.config.mjs enforces it under the
// glob `src/domain/**/*.ts`, so a violation is a BUILD FAILURE rather than a review note. Every
// port and sibling-entity reference uses `import type`, erased at emit; `Money` is the single VALUE
// import from within `src/domain/**` and is not part of any cycle.
//
// Two absences are decisions rather than oversights. `../valueObjects/currencyCode.js` is not
// imported because `getCurrencyCode()` [L555-L559] delegates to `Sku.getCurrencyCode()`, whose
// shipped signature returns a plain `string`. `../valueObjects/materializedIdPath.js` is not
// imported because `getCategoryIDs()` [L199-L205] builds a comma list from each category's own
// primary key and does NOT walk a `categoryIDPath`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE PROPERTY CONTRACT - EVERY `property name=` DECLARATION, TRANSCRIBED VERBATIM
//
// Read from model/entity/Product.cfc L51 through L123. Attribute values are reproduced exactly as
// written, including the `ormtype`/`ormType` casing as it appears, the `singlularname` typo, the
// abbreviated physical link-table names and every `hb_*` / `rbKey` value. NOTHING IS NORMALISED -
// annotation is the remedy for a wart, never a rewrite.
//
//   // Persistent Properties
//   L52  property name="productID" ormtype="string" length="32" fieldtype="id" generator="uuid"
//   unsavedvalue="" default="";
//   L53  property name="activeFlag" ormtype="boolean";
//   L54  property name="urlTitle" ormtype="string" unique="true";
//   L55  property name="productName" ormtype="string" notNull="true";
//   L56  property name="productCode" ormtype="string" unique="true";
//   L57  property name="productDescription" ormtype="string" length="4000"
//   hb_formFieldType="wysiwyg";
//   L58  property name="publishedFlag" ormtype="boolean" default="false";
//   L59  property name="sortOrder" ormtype="integer";
//
//   // Calculated Properties
//   L62  property name="calculatedSalePrice" ormtype="big_decimal";
//   L63  property name="calculatedQATS" ormtype="integer";
//   L64  property name="calculatedAllowBackorderFlag" ormtype="boolean";
//   L65  property name="calculatedTitle" ormtype="string";
//
//   // Related Object Properties (many-to-one)
//   L68  property name="brand" cfc="Brand" fieldtype="many-to-one" fkcolumn="brandID"
//   hb_optionsNullRBKey="define.none" fetch="join";
//   L69  property name="productType" cfc="ProductType" fieldtype="many-to-one"
//   fkcolumn="productTypeID" fetch="join";
//   L70  property name="defaultSku" cfc="Sku" fieldtype="many-to-one" fkcolumn="defaultSkuID"
//   cascade="delete" fetch="join";
//
//   // Related Object Properties (one-to-many)
//   L73  property name="skus" type="array" cfc="Sku" singularname="Sku" fieldtype="one-to-many"
//   fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//   L74  property name="productImages" type="array" cfc="Image" singularname="productImage"
//   fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//   L75  property name="attributeValues" singularname="attributeValue" cfc="AttributeValue"
//   fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//   L76  property name="productReviews" singlularname="productReview" cfc="ProductReview"
//   fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//
//   // Related Object Properties (many-to-many - owner)
//   L79  property name="listingPages" singularname="listingPage" cfc="Content"
//   fieldtype="many-to-many" linktable="SwProductListingPage" fkcolumn="productID"
//   inversejoincolumn="contentID";
//   L80  property name="categories" singularname="category" cfc="Category" fieldtype="many-to-many"
//   linktable="SwProductCategory" fkcolumn="productID" inversejoincolumn="categoryID";
//   L81  property name="relatedProducts" singularname="relatedProduct" cfc="Product" type="array"
//   fieldtype="many-to-many" linktable="SwRelatedProduct" fkcolumn="productID"
//   inversejoincolumn="relatedProductID";
//
//   // Related Object Properties (many-to-many - inverse)
//   L84  property name="promotionRewards" singularname="promotionReward" cfc="PromotionReward"
//   fieldtype="many-to-many" linktable="SwPromoRewardProduct" fkcolumn="productID"
//   inversejoincolumn="promotionRewardID" inverse="true";
//   L85  property name="promotionRewardExclusions" singularname="promotionRewardExclusion"
//   cfc="PromotionReward" type="array" fieldtype="many-to-many"
//   linktable="SwPromoRewardExclProduct" fkcolumn="productID" inversejoincolumn="promotionRewardID"
//   inverse="true";
//   L86  property name="promotionQualifiers" singularname="promotionQualifier"
//   cfc="PromotionQualifier" fieldtype="many-to-many" linktable="SwPromoQualProduct"
//   fkcolumn="productID" inversejoincolumn="promotionQualifierID" inverse="true";
//   L87  property name="promotionQualifierExclusions" singularname="promotionQualifierExclusion"
//   cfc="PromotionQualifier" type="array" fieldtype="many-to-many"
//   linktable="SwPromoQualExclProduct" fkcolumn="productID"
//   inversejoincolumn="promotionQualifierID" inverse="true";
//   L88  property name="priceGroupRates" singularname="priceGroupRate" cfc="PriceGroupRate"
//   fieldtype="many-to-many" linktable="SwPriceGroupRateProduct" fkcolumn="productID"
//   inversejoincolumn="priceGroupRateID" inverse="true";
//   L89  property name="vendors" singularname="vendor" cfc="Vendor" type="array"
//   fieldtype="many-to-many" linktable="SwVendorProduct" fkcolumn="productID"
//   inversejoincolumn="vendorID" inverse="true";
//   L90  property name="physicals" singularname="physical" cfc="Physical" type="array"
//   fieldtype="many-to-many" linktable="SwPhysicalProduct" fkcolumn="productID"
//   inversejoincolumn="physicalID" inverse="true";
//
//   // Remote Properties
//   L93  property name="remoteID" ormtype="string";
//
//   // Audit Properties
//   L96  property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";
//   L97  property name="createdByAccount" hb_populateEnabled="false" cfc="Account"
//   fieldtype="many-to-one" fkcolumn="createdByAccountID";
//   L98  property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";
//   L99  property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account"
//   fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
//
//   // Non-Persistent Properties
//   L102 property name="allowBackorderFlag" type="boolean" persistent="false";
//   L103 property name="baseProductType" type="string" persistent="false";
//   L104 property name="brandName" type="string" persistent="false";
//   L105 property name="brandOptions" type="array" persistent="false";
//   L106 property name="estimatedReceivalDetails" type="struct" persistent="false";
//   L107 property name="qats" type="numeric" persistent="false";
//   L108 property name="salePriceDetailsForSkus" type="struct" persistent="false";
//   L109 property name="title" type="string" persistent="false";
//   L110 property name="transactionExistsFlag" type="boolean" persistent="false";
//   L111 property name="unusedProductOptions" type="array" persistent="false";
//   L112 property name="unusedProductOptionGroups" type="array" persistent="false";
//   L113 property name="unusedProductSubscriptionTerms" type="array" persistent="false";
//
//   // Non-Persistent Properties - Delegated to default sku
//   L116 property name="currencyCode" persistent="false";
//   L117 property name="defaultProductImageFiles" persistent="false";
//   L118 property name="price" hb_formatType="currency" persistent="false";
//   L119 property name="renewalPrice" hb_formatType="currency" persistent="false";
//   L120 property name="listPrice" hb_formatType="currency" persistent="false";
//   L121 property name="livePrice" hb_formatType="currency" persistent="false";
//   L122 property name="salePrice" hb_formatType="currency" persistent="false";
//   L123 property name="currentAccountPrice" hb_formatType="currency" persistent="false";
//
// ---------------------------------------------------------------------------
// THE INERT `hb_*` / `rbKey` VALUES ON THIS COMPONENT, PRESERVED VERBATIM AS STRING CONSTANTS
//
//   hb_optionsNullRBKey="define.none"   [L68]  the null-option label for the brand select
//   hb_formFieldType="wysiwyg"          [L57]  the admin editor for productDescription
//   hb_formatType="currency"            [L118-L123]  six delegated money properties
//   hb_populateEnabled="false"          [L96-L99]  the four audit properties
//   hb_permission="this"                [L49]
//   hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm"   [L49]
//   rbKey('define.none')                [L536] read by the omitted getBrandOptions
//
// They are declared as `ProductLegacyMetadata` below so they survive into the emitted JavaScript
// and remain greppable from the legacy admin's point of view. NOTHING RESOLVES THEM at runtime.
// ---------------------------------------------------------------------------

/**
 * The inert legacy metadata this component carries, preserved verbatim.
 *
 * Every value is a string exactly as it appears in `model/entity/Product.cfc`. This object exists
 * for schema and admin continuity only - no code branches on it, nothing resolves it, and it holds
 * no behaviour. It is exported so a reviewer checking schema continuity and the `rbKey`-as-inert-
 * constant rule can reach it without reading the comment block above.
 */
export const ProductLegacyMetadata = {
  /** [model/entity/Product.cfc:L49] */
  entityName: 'SlatwallProduct',
  /** [model/entity/Product.cfc:L49] */
  table: 'SwProduct',
  /** [model/entity/Product.cfc:L49] */
  serviceName: 'productService',
  /** [model/entity/Product.cfc:L49] */
  permission: 'this',
  /**
   * [model/entity/Product.cfc:L49] The four admin process contexts. Three of the four name in-scope
   * process objects; `addSubscriptionTerm` names an out-of-scope one and is preserved anyway.
   */
  processContexts: 'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
  /** [model/entity/Product.cfc:L68] The brand select's null-option resource-bundle key. */
  brandOptionsNullRBKey: 'define.none',
  /** [model/entity/Product.cfc:L57] The admin form-field type for `productDescription`. */
  productDescriptionFormFieldType: 'wysiwyg',
  /** [model/entity/Product.cfc:L118-L123] The format type on all six delegated money properties. */
  delegatedPriceFormatType: 'currency',
  /**
   * [model/validation/Product.json] The `productCode` format constraint, recorded as the schema's
   * own text. IDENTICAL to `Option.optionCode`'s and `OptionGroup.optionGroupCode`'s constraint,
   * which is published as the exported `ENTITY_CODE_PATTERN` in ./optionGroup.js.
   *
   * IT IS DELIBERATELY NOT VALUE-IMPORTED FROM THERE: a value import between two entity modules
   * would turn the type-only `entities` cycle into a runtime one, which prohibition 28 forbids
   * outright. The pattern is recorded as inert schema text rather than a live `RegExp`. THE SAME
   * PATTERN APPEARS IN THREE SCHEMAS: Product.json, Option.json and OptionGroup.json. Enforcement
   * lives at the service tier as a zod schema, never here (§6.1).
   */
  productCodeRegexText: '^[a-zA-Z0-9-_.|:~^]+$',
} as const;

/**
 * Everything the repository boundary supplies when it hydrates one `Product`.
 *
 * A single input object rather than a positional parameter list, matching the folder precedent set
 * by `SkuHydrationInput` in ./sku.js. With `exactOptionalPropertyTypes` on, an omitted key and a
 * key present with the value `undefined` are DIFFERENT things, and that distinction is
 * load-bearing: `defaultSku` absent is what makes the [L595] and [L617] guards answer `false`,
 * which is what makes DEFECT 25 reachable at all.
 *
 * ONLY `productID` IS REQUIRED, and that is a live contract:
 * `src/repositories/mysql/mysqlPriceGroupRepository.ts` constructs `new Product({ productID })` to
 * carry an identity across the price-group boundary without materializing a graph, and every method
 * needing more than an identity refuses explicitly rather than inventing a default.
 *
 * WHAT THE REPOSITORY OWES, PER FIELD, is documented on each member. THE THREE EAGER MANY-TO-ONES
 * (`brand`, `productType`, `defaultSku`) are `fetch="join"` at [L68-L70], so the repository joins
 * them in the same statement and their accessors are synchronous; THE LIVE COLLECTIONS (`skus`,
 * `promotionRewards`, `promotionRewardExclusions`, `promotionQualifiers`,
 * `promotionQualifierExclusions`, `priceGroupRates`) are handed out BY REFERENCE because the
 * far-side bidirectional helpers splice them in place - see the ABSOLUTE LIVE-ARRAY RULE on the
 * accessors. THE FIVE PORTS are optional so an identity-only product is constructible; a method
 * whose port is absent throws a message naming the port and the legacy locator.
 */
export type ProductHydrationInput = {
  /**
   * [model/entity/Product.cfc:L52] `fieldtype="id" generator="uuid" unsavedvalue="" default=""`.
   *
   * The `unsavedvalue=""` / `default=""` pair is what makes `isNew()` computable: an unsaved
   * product carries the empty string, never a UUID. Required here, and legitimately `''`.
   */
  readonly productID: string;

  /** [model/entity/Product.cfc:L53] `ormtype="boolean"`, NO default - may arrive as SQL NULL. */
  readonly activeFlag?: CfBooleanInput;

  /** [model/entity/Product.cfc:L54] `ormtype="string" unique="true"`. */
  readonly urlTitle?: string;

  /**
   * [model/entity/Product.cfc:L55] `ormtype="string" notNull="true"`.
   *
   * `notNull="true"` is an ORM-level constraint the target does not re-declare (B5, prohibition
   * 18): the column stays as it is and enforcement stays where it already lives - `productName` is
   * `required` on the `save` context in model/validation/Product.json, checked at the service tier.
   */
  readonly productName?: string;

  /** [model/entity/Product.cfc:L56] `ormtype="string" unique="true"`. */
  readonly productCode?: string;

  /** [model/entity/Product.cfc:L57] `length="4000" hb_formFieldType="wysiwyg"`. */
  readonly productDescription?: string;

  /**
   * [model/entity/Product.cfc:L58] `ormtype="boolean" default="false"`.
   *
   * THE ONE BOOLEAN ON THIS COMPONENT THAT DECLARES A DEFAULT. Omitting it yields `false`, which is
   * the declared default rather than a substitution.
   */
  readonly publishedFlag?: CfBooleanInput;

  /** [model/entity/Product.cfc:L59] `ormtype="integer"`. Not money; stays `number`. */
  readonly sortOrder?: number;

  /**
   * [model/entity/Product.cfc:L62] `ormtype="big_decimal"`.
   *
   * MONETARY, therefore `Money` and never `number` (E4). No `default` is declared, so absence is a
   * real state and is preserved as `undefined` rather than coerced to zero - the same asymmetry the
   * ORM schema encodes on `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53],
   * `PriceGroupRate.amount` [L54], `PromotionApplied.discountAmount` [L53] and
   * `PromotionReward.amount` [L61].
   */
  readonly calculatedSalePrice?: Money;

  /** [model/entity/Product.cfc:L63] `ormtype="integer"`. A quantity, not money. */
  readonly calculatedQATS?: number;

  /** [model/entity/Product.cfc:L64] `ormtype="boolean"`, NO default. */
  readonly calculatedAllowBackorderFlag?: CfBooleanInput;

  /** [model/entity/Product.cfc:L65] `ormtype="string"`. The persisted snapshot of `getTitle()`. */
  readonly calculatedTitle?: string;

  /**
   * [model/entity/Product.cfc:L68] `fetch="join"` - EAGER. Nullable FK `brandID`, so a product
   * genuinely may have no brand and `undefined` is a real answer, not an unloaded association.
   */
  readonly brand?: Brand;

  /**
   * [model/entity/Product.cfc:L69] `fetch="join"` - EAGER. `productType` is `required` on the
   * `save` context in model/validation/Product.json, but the COLUMN is nullable, so an unsaved or
   * partially-hydrated product may carry none.
   */
  readonly productType?: ProductType;

  /**
   * [model/entity/Product.cfc:L70] `fetch="join" cascade="delete"` - EAGER.
   *
   * THE MOST CONSEQUENTIAL OPTIONAL FIELD ON THIS TYPE. Its ABSENCE is what the [L556], [L565],
   * [L571], [L577], [L583], [L589], [L595] and [L607] guards test, and its PRESENCE is what makes
   * DEFECT 25 fire at [L617-L618]. Supplying a placeholder here would change money.
   */
  readonly defaultSku?: Sku;

  /**
   * [model/entity/Product.cfc:L73] `cascade="all-delete-orphan" inverse="true"`.
   *
   * MUTABLE AND LIVE. `Sku.setProduct` pushes into `product.getSkus()` and `Sku.removeProduct`
   * splices it, so this array is handed out by reference. Defaults to `[]`.
   */
  readonly skus?: Sku[];

  /**
   * [model/entity/Product.cfc:L80] link table `SwProductCategory`,
   * `inversejoincolumn="categoryID"`.
   *
   * Materialized because `getCategoryIDs()` [L199-L205] reads it. `Category` IS in scope. There are
   * no `addCategory`/`removeCategory` helpers declared on `Product.cfc`, so none is authored here.
   */
  readonly categories?: readonly Category[];

  /**
   * [model/entity/Product.cfc:L81] self-referential many-to-many over `SwRelatedProduct`.
   *
   * Read-only: no helper on either side mutates it in place, and nothing in the in-scope slice
   * reads it either. Preserved for schema continuity (B5) and defaults to `[]`.
   */
  readonly relatedProducts?: readonly Product[];

  /** [model/entity/Product.cfc:L84] `SwPromoRewardProduct`. MUTABLE AND LIVE - see §2.2. */
  readonly promotionRewards?: PromotionReward[];

  /** [model/entity/Product.cfc:L85] `SwPromoRewardExclProduct`. MUTABLE AND LIVE - see §2.2. */
  readonly promotionRewardExclusions?: PromotionReward[];

  /** [model/entity/Product.cfc:L86] `SwPromoQualProduct`. MUTABLE AND LIVE - see §2.2. */
  readonly promotionQualifiers?: PromotionQualifier[];

  /** [model/entity/Product.cfc:L87] `SwPromoQualExclProduct`. MUTABLE AND LIVE - see §2.2. */
  readonly promotionQualifierExclusions?: PromotionQualifier[];

  /** [model/entity/Product.cfc:L88] `SwPriceGroupRateProduct`. MUTABLE AND LIVE - see §2.2. */
  readonly priceGroupRates?: PriceGroupRate[];

  /**
   * The option groups reachable through this product's skus' options.
   *
   * [model/entity/Product.cfc:L251-L261] computes this with a framework smart list. The port
   * materializes it instead, and the repository owes the smart list's EXACT fetch shape - see the
   * `getOptionGroups` accessor for the three-part specification and for the two source warts the
   * substitution has to preserve.
   */
  readonly optionGroups?: readonly OptionGroup[];

  /** [model/entity/Product.cfc:L93] `ormtype="string"`. The remote-system correlation id. */
  readonly remoteID?: string;

  /** [model/entity/Product.cfc:L96] `hb_populateEnabled="false" ormtype="timestamp"`. */
  readonly createdDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L97] `cfc="Account" fkcolumn="createdByAccountID"`.
   *
   * COLLAPSED TO AN OPAQUE ID per §1.5: `Account` is not one of the eighteen in scope, so the FK
   * survives as an inert column and no `Account` type is imported and no entity accessor authored.
   * Established precedent - `PromotionApplied`'s order-side keys and `PromotionCode.accounts` were
   * collapsed the same way.
   */
  readonly createdByAccountID?: string;

  /** [model/entity/Product.cfc:L98] `hb_populateEnabled="false" ormtype="timestamp"`. */
  readonly modifiedDateTime?: Date;

  /** [model/entity/Product.cfc:L99] Collapsed to an opaque ID, exactly as `createdByAccountID`. */
  readonly modifiedByAccountID?: string;

  /**
   * [model/entity/Product.cfc:L118] `hb_formatType="currency" persistent="false"`.
   *
   * NOT A COLUMN, AND YET IT MUST BE SETTABLE. `getPrice()` [L561-L568] probes
   * `structKeyExists(variables, "price")` FIRST and only falls through to the default sku second,
   * so a caller-supplied override genuinely takes precedence over the delegate. Reproducing the
   * precedence requires reproducing the slot.
   */
  readonly price?: Money;

  /**
   * The sale-price details for this product's skus, keyed by `skuID`.
   *
   * [model/entity/Product.cfc:L517-L521] computed this by reaching `promotionService`, and the
   * ported `getSalePriceDetailsForSkus()` reproduces that reach through the injected
   * `salePriceResolver` (§3.9 branch (a)). SUPPLYING THIS MEMBER PRE-SEEDS THAT MEMO: the legacy
   * probe at [L518] tests the very key this field lands in, so a repository that already holds the
   * reduced, rounded map hands it in and the reach never runs. Absent means "not supplied", not
   * "empty" - the reader reproduces the legacy's empty-struct answer for a miss [L186] rather than
   * guessing, and it answers absence rather than refusing when no resolver was injected either.
   *
   * ★ QUOTE-THEN-REVISE. This block previously read "That reach is REFUSED here under §3.9 branch
   * (b) - see the `getSalePriceDetailsForSkus` entry in the OMISSION REGISTER". §3.9 is a
   * CONDITIONAL decision procedure, and its branch-(a) precondition holds: `promotionRepository.ts`
   * exports a second interface, `SalePriceResolver`, carrying exactly the member that serves
   * `getSalePriceDetailsForProductSkus`. So branch (a) is the live arm, the method ships above, and
   * CLUSTER 7 of the OMISSION REGISTER now records that nothing is omitted there.
   *
   * WHERE THE PRE-SEEDED MAP COMES FROM, so the two arrangements are not mistaken for rivals:
   * `src/repositories/mysql/mysqlProductRepository.ts` holds a module-local
   * `ProductSalePriceResolver` collaborator - satisfied in `src/handlers/bootstrap.ts` by adapting
   * the ported `PromotionService.getSalePriceDetailsForProductSkus`
   * [model/service/PromotionService.cfc:L1022] - and resolves the map on its read path BEFORE it
   * constructs each product, forwarding the resolver itself alongside it. A repository-loaded
   * product therefore arrives with the memo already filled AND with the collaborator that would
   * have filled it; a hand-built one arrives with neither and answers the legacy empty struct.
   */
  readonly salePriceDetailsForSkus?: CfStruct<SalePriceDetail>;

  /**
   * `max(SwOptionGroup.sortOrder) + 1` across ALL option groups.
   *
   * [model/dao/SkuDAO.cfc:L204-L220] `getNextOptionGroupSortOrder()` - a GLOBAL aggregate over
   * `SwOptionGroup`, seeded to `1` when the table is empty. It is the radix of the positional
   * weighting that orders sorted skus, so `getSkus(sorted)` cannot reproduce the legacy ordering
   * without it, and it cannot be derived from this product's own graph.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L222-L226]: the legacy caches this value on the DAO component
   * and its `clearNextOptionGroupSortOrder` guard is INVERTED - it deletes the key only when the
   * key does not exist - so the cache can never be cleared. On a warm Lambda container a
   * component-level cache would become cross-invocation state, which is why this arrives as a
   * per-instance hydration input instead (AAP 0.6.5). The inverted guard is a `SkuDAO` defect owned
   * by the repositories sibling, not by this file.
   */
  readonly nextOptionGroupSortOrder?: number;

  /**
   * Resolves the seven published settings keys. SYNCHRONOUS: `setting(key: SettingKey): string`.
   *
   * Needed for exactly ONE key on this component - `globalURLKeyProduct`, read at [L208] and
   * [L212]. That key's default value is declared at [model/service/SettingService.cfc:L178] and
   * MUST NOT be transcribed into this file in any form, not even inside a comment (E6, prohibition
   * 5).
   */
  readonly settingsProvider?: SettingsProvider;

  /**
   * Discharges the [L367] and [L626] reaches.
   *
   *   getSkusBySelectedOptions(selectedOptions, productID?)  <- [L367], a MUST-PRESERVE behaviour
   *   getTransactionExistsFlag(productID?, skuID?)           <- [L626]
   */
  readonly skuRepository?: SkuRepository;

  /**
   * Discharges the [L637] and [L644] reaches, both on a LIVE validation path (§6.1).
   *
   *   getUnusedProductOptions(productID, existingOptionGroupIDList)
   *   getUnusedProductOptionGroups(existingOptionGroupIDList)
   */
  readonly optionRepository?: OptionRepository;

  /**
   * Discharges the ONE ported attribute path: `getAttributeSets` [L832-L838].
   *
   * `getAttributeSets(attributeSetTypeCode, productTypeIDs)`, backed by
   * [model/dao/ProductDAO.cfc:L52]. The EAV READ PATH IS NOT PORTED (§6.3) and this port is not it.
   */
  readonly productRepository?: ProductRepository;

  /**
   * The subscription STUB port, injected so the refusal at `getUnusedProductSubscriptionTerms`
   * names a real collaborator rather than an imaginary one. IT CANNOT SERVE THAT METHOD, AND THAT
   * IS THE POINT: `SubscriptionTermProvider` declares exactly two members - `getSubscriptionTerm`
   * and `getSubscriptionBenefit` - and its own documentation lists
   * `getUnusedProductSubscriptionTerms` under "WHAT IS DELIBERATELY NOT DECLARED IN THIS FILE".
   * Adding it would be inventing an undeclared port member (prohibition 12).
   */
  readonly subscriptionTermProvider?: SubscriptionTermProvider;

  /**
   * Discharges the [L519] reach - `getSalePriceDetailsForSkus()` [L517-L522] - under §3.9 branch (a).
   *
   *   getSalePriceDetailsForProductSkus(productID)
   *
   * `SalePriceResolver` is the second interface exported by ../ports/promotionRepository.js, and it
   * exists for exactly this constructor parameter. It is NOT a fourteenth port: the port folder
   * still holds thirteen modules, and the resolver is co-located with `PromotionRepository` because
   * the resolver's output is the rounding-rule-adjusted form of the rows that port's method 6
   * returns. Satisfied in src/handlers/bootstrap.ts by adapting src/services/promotionService.ts,
   * which is where `getSalePriceDetailsForProductSkus` itself lives
   * [model/service/PromotionService.cfc:L1022].
   */
  readonly salePriceResolver?: SalePriceResolver;
};

/**
 * What `getAttributeSets` hands back: the port's own read projection, unchanged.
 *
 * Re-exported under a `Product`-scoped name so a caller can spell the return type without importing
 * the port itself, which keeps the port a repository-boundary concern. This is a type alias in THIS
 * file, not a `types.ts` and not a barrel (E7).
 */
export type ProductAttributeSet = AttributeSetSummary;

/**
 * What the two unused-* accessors hand back: the option repository's own `{name, value}`
 * projection.
 *
 * NOT `Option[]` AND NOT `OptionGroup[]`, though the specification named those. `OptionRepository`
 * declares `Promise<readonly SelectOption[]>` for both members, and "use the port's exact
 * signature" outranks the prose.
 */
export type ProductUnusedOption = SelectOption;

/**
 * Store `value` on `target` under `key` as an OWN, enumerable data property.
 *
 * ★ WHY THIS EXISTS INSTEAD OF `target[key] = value`. The key is a persisted
 * `SwOptionGroup.optionGroupID` value, so it is EXTERNALLY SOURCED. A plain object inherits
 * `Object.prototype`, whose legacy `__proto__` accessor intercepts `target['__proto__'] = value`:
 * the entry is silently DISCARDED while every key around it is recorded, and an object value
 * replaces the record's own prototype. `Object.defineProperty` declares an own, enumerable,
 * writable, configurable data property, so the write cannot be intercepted.
 *
 * CFML parity [model/entity/Product.cfc:L243-L246]: a CFML struct has no prototype chain and no
 * reserved keys, so an option group whose identifier is `__proto__` occupied an ordinary key. The
 * plain assignment this replaces was the divergence; restoring the own-key write restores parity.
 *
 * The identical mechanism, for the identical reason, is used by `src/lib/logger.ts`
 * `redactPlainObject` and by the sibling entity `./sku.ts`.
 *
 * ★ IT IS NOT A CASE-FOLDING WRITE. Key matching stays with `../../lib/cfml/struct.js`, which the
 * accessor's reads already route through; this function decides only HOW the key is stored.
 *
 * @param target the record being built. Mutated in place.
 * @param key the externally sourced key. Used verbatim, never normalised.
 * @param value the value to store.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * `SlatwallProduct` / `SwProduct` - the aggregate root of the catalog half of this migration.
 *
 * It owns the SKU collection the promotion engine prices, joins `Brand`, `ProductType`, `Category`
 * and `OptionGroup`, carries THE ONLY ENTITY METHOD IN THE SUBTREE WITH LEGACY TEST COVERAGE
 * (`getProductURL()`, pinned by meta/tests/unit/entity/ProductTest.cfc), and is named in the
 * must-preserve list through `getSkuBySelectedOptions()` / `getSkusBySelectedOptions()`.
 *
 * THE THREE OPPOSITE ABSENCE CONVENTIONS, NAMED SIDE BY SIDE BECAUSE COLLAPSING ANY PAIR IS A MONEY
 * BUG. (1) `Sku.getPriceByCurrencyCode()` MUST return `Money | undefined` and NEVER `0`, because
 * [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback - substituting `0` would SILENTLY
 * SELL PRODUCTS FOR FREE. (2) `Product.getSalePrice()` MUST return `0` and NEVER `undefined`,
 * because [model/entity/Product.cfc:L594-L601] falls through to an explicit `return 0` when the
 * statement at [L598] omits its `return` - DEFECT 20, PRESERVED, and the exact OPPOSITE of (1) on
 * the same quantity. (3) Promotion use-limits and period bounds MUST stay `undefined`, where
 * `undefined` means UNLIMITED / FOREVER - the PERMISSIVE extreme. Here `calculatedSalePrice` [L62]
 * declares no `default`, so it is `Money | undefined`, matching the four in-scope money columns
 * that likewise declare none while their immediate neighbours declare `default="0"`.
 *
 * EMPTY-COLLECTION SEMANTICS REACH THIS CLASS THROUGH TWO FACTS ABOUT ITS OWN ARRAYS.
 * `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` on an empty
 * `entityArray`, and that `false` is PERMISSIVE on an exclude list and RESTRICTIVE on an include
 * list
 * - and this class hands the promotion engine BOTH families, `promotionRewards` /
 * `promotionQualifiers` as include lists and `promotionRewardExclusions` /
 * `promotionQualifierExclusions` as exclude lists, all defaulting to `[]`. Separately,
 * `Brand.getProducts()` MUST default to `[]` (meta/tests/unit/entity/BrandTest.cfc ->
 * `defaults_are_correct()`), and `setBrand` / `removeBrand` here mutate that very array.
 *
 * A PHANTOM VALIDATION RULE. model/validation/Product.json declares
 *   `"physicalCounts": [{"contexts":"delete","maxCollection":0}]`,
 * unenforceable for TWO independent reasons: (a) `Physical` is out of scope, so a rule reading "at
 * most zero" against a collection this domain does not expose TRIVIALLY PASSES in TypeScript where
 * it would BLOCK in CFML; and (b) THE PROPERTY DOES NOT EXIST - `Product.cfc` declares `physicals`
 * at [L90], so the rule was already unsatisfiable in CFML, resolving through `onMissingMethod` to
 * `getPhysicalCountsCount()` and terminating at the [L565] throw. The one delete-context rule this
 * class DOES participate in is `"transactionExistsFlag": [{"contexts":"delete","eq":false}]` - see
 * {@link Product.getTransactionExistsFlag}.
 */
export class Product {
  // -------------------------------------------------------------------------
  // PERSISTENT COLUMNS [model/entity/Product.cfc:L52-L59]
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L52] `''` for an unsaved product - see {@link Product.isNew}. */
  private readonly productID: string;

  /** [model/entity/Product.cfc:L53] `ormtype="boolean"`, no default. */
  private readonly activeFlag: boolean;

  /**
   * [model/entity/Product.cfc:L54] `unique="true"`. Read by {@link Product.getProductURL}.
   *
   * NOT `readonly`, for the same reason {@link Product.brand} is not: a legacy caller inside the
   * ported slice assigns to it. [model/service/ProductService.cfc:L269] is
   * `arguments.product.setURLTitle( getDataService().createUniqueURLTitle(...) )` - a WRITE ONTO THE
   * ENTITY, and the one place in the slice where a save override resolves a title onto the entity
   * rather than into the caller's data struct (contrast [L297], [L299] and
   * [model/service/BrandService.cfc:L70], [L72], which all write to the struct). See
   * {@link Product.setUrlTitle}.
   */
  private urlTitle: string | undefined;

  /** [model/entity/Product.cfc:L55] `notNull="true"` at the ORM level; required on save. */
  private readonly productName: string | undefined;

  /** [model/entity/Product.cfc:L56] `unique="true"`; format constraint recorded as inert text. */
  private readonly productCode: string | undefined;

  /** [model/entity/Product.cfc:L57] `length="4000" hb_formFieldType="wysiwyg"`. */
  private readonly productDescription: string | undefined;

  /** [model/entity/Product.cfc:L58] `default="false"` - the one boolean here that declares one. */
  private readonly publishedFlag: boolean;

  /** [model/entity/Product.cfc:L59] `ormtype="integer"`. */
  private readonly sortOrder: number | undefined;

  // -------------------------------------------------------------------------
  // CALCULATED COLUMNS [model/entity/Product.cfc:L62-L65] Persisted snapshots the ORM maintained.
  // All four are preserved and readable (B5); only their RECOMPUTATION is out of scope where the
  // recomputing method is omitted.
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L62] `ormtype="big_decimal"`, NO default - hence `| undefined`. */
  private readonly calculatedSalePrice: Money | undefined;

  /** [model/entity/Product.cfc:L63] `ormtype="integer"`. Snapshot of the omitted `getQATS()`. */
  private readonly calculatedQATS: number | undefined;

  /** [model/entity/Product.cfc:L64] `ormtype="boolean"`, no default. */
  private readonly calculatedAllowBackorderFlag: boolean;

  /** [model/entity/Product.cfc:L65] Snapshot of the omitted `getTitle()`. */
  private readonly calculatedTitle: string | undefined;

  // -------------------------------------------------------------------------
  // EAGER MANY-TO-ONES [model/entity/Product.cfc:L68-L70] - all three `fetch="join"`
  // -------------------------------------------------------------------------

  /**
   * [model/entity/Product.cfc:L68] EAGER. NOT `readonly`: {@link Product.setBrand} reassigns it and
   * {@link Product.removeBrand} clears it, reproducing `structDelete(variables, "brand")` at
   * [L676].
   */
  private brand: Brand | undefined;

  /** [model/entity/Product.cfc:L69] EAGER. Read by {@link Product.getBaseProductType}. */
  private readonly productType: ProductType | undefined;

  /**
   * [model/entity/Product.cfc:L70] EAGER, `cascade="delete"`.
   *
   * Its absence drives eight guards and its presence drives DEFECT 25. See the field note on
   * {@link ProductHydrationInput.defaultSku}.
   *
   * NOT `readonly`: {@link Product.setDefaultSku} reassigns it, reproducing the Hibachi-generated
   * setter that [model/service/SkuService.cfc:L102, L134, L167, L189, L198] calls while creating a
   * product's first SKUs, and that [model/service/ProductService.cfc:L323] calls as
   * `setDefaultSku(javaCast("null",""))` to CLEAR the designation ahead of a delete. It is the second
   * of only two reassignable association fields on this class, the other being `brand`.
   */
  private defaultSku: Sku | undefined;

  // -------------------------------------------------------------------------
  // MATERIALIZED ASSOCIATIONS
  //
  // THE ABSOLUTE LIVE-ARRAY RULE. Six of these are handed out BY REFERENCE and must NEVER be copied
  // defensively, because the far-side bidirectional helpers mutate them in place:
  //
  //   skus                          <- Sku.setProduct pushes; Sku.removeProduct splices
  //   promotionRewards              <- PromotionReward.addProduct pushes
  //   promotionRewardExclusions     <- PromotionReward.addExcludedProduct pushes
  //   promotionQualifiers           <- PromotionQualifier.addProduct pushes
  //   promotionQualifierExclusions  <- PromotionQualifier.addExcludedProduct pushes
  //   priceGroupRates               <- PriceGroupRate.addProduct pushes
  //
  // A defensive copy would silently break bidirectional removal: the far side would splice a
  // throwaway array and the association would survive. This rule is stated as ABSOLUTE in ./sku.js
  // §2.3 and identically here. The two read-only collections below hand back a `readonly`
  // projection precisely because nothing mutates them through this class.
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L73] LIVE. Defaults to `[]`. */
  private readonly skus: Sku[];

  /** [model/entity/Product.cfc:L80] READ-ONLY projection; read by `getCategoryIDs()`. */
  private readonly categories: readonly Category[];

  /** [model/entity/Product.cfc:L81] READ-ONLY projection; nothing in the slice reads it. */
  private readonly relatedProducts: readonly Product[];

  /** [model/entity/Product.cfc:L84] LIVE - `SwPromoRewardProduct`. */
  private readonly promotionRewards: PromotionReward[];

  /** [model/entity/Product.cfc:L85] LIVE - `SwPromoRewardExclProduct`. */
  private readonly promotionRewardExclusions: PromotionReward[];

  /** [model/entity/Product.cfc:L86] LIVE - `SwPromoQualProduct`. */
  private readonly promotionQualifiers: PromotionQualifier[];

  /** [model/entity/Product.cfc:L87] LIVE - `SwPromoQualExclProduct`. */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /** [model/entity/Product.cfc:L88] LIVE - `SwPriceGroupRateProduct`. */
  private readonly priceGroupRates: PriceGroupRate[];

  // -------------------------------------------------------------------------
  // REMOTE AND AUDIT COLUMNS [model/entity/Product.cfc:L93-L99]
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L93] */
  private readonly remoteID: string | undefined;

  /** [model/entity/Product.cfc:L96] `hb_populateEnabled="false"`. */
  private readonly createdDateTime: Date | undefined;

  /** [model/entity/Product.cfc:L97] Opaque ID - `Account` is out of scope (§1.5). */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/Product.cfc:L98] `hb_populateEnabled="false"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/Product.cfc:L99] Opaque ID - `Account` is out of scope (§1.5). */
  private readonly modifiedByAccountID: string | undefined;

  // -------------------------------------------------------------------------
  // NON-PERSISTENT STATE SUPPLIED AT HYDRATION
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L118] The override slot `getPrice()` probes FIRST. */
  private readonly price: Money | undefined;

  /**
   * VARIANT C memo [model/entity/Product.cfc:L518], reduced and rounded, keyed by `skuID`.
   *
   * NOT `readonly`, and the reason is the legacy shape rather than convenience: the memo key the
   * source probes at [L518] IS SPELLED `variables.salePriceDetailsForSkus`, so this one field is
   * simultaneously the memo and the slot hydration may PRE-SEED. A repository that already holds
   * the reduced map hands it in and the [L519] reach never runs; a repository that does not leaves
   * it absent and `getSalePriceDetailsForSkus()` fills it through the injected resolver exactly
   * once. Both routes end at the same value, which is why one field rather than two is correct.
   */
  private salePriceDetailsForSkus: CfStruct<SalePriceDetail> | undefined;

  /** `max(SwOptionGroup.sortOrder) + 1` - the radix of the sorted-sku weighting. */
  private readonly nextOptionGroupSortOrder: number | undefined;

  // -------------------------------------------------------------------------
  // INJECTED PORTS - the five collaborators that discharge the surviving outward reaches (T1/T2)
  // -------------------------------------------------------------------------

  /** Resolves `globalURLKeyProduct` for [L208] and [L212]. Synchronous. */
  private readonly settingsProvider: SettingsProvider | undefined;

  /** Discharges [L367] `getSkusBySelectedOptions` and [L626] `getTransactionExistsFlag`. */
  private readonly skuRepository: SkuRepository | undefined;

  /** Discharges [L637] and [L644], the unused-* pair on the live validation path. */
  private readonly optionRepository: OptionRepository | undefined;

  /** Discharges [L833] `getAttributeSets`, the one ported attribute path. */
  private readonly productRepository: ProductRepository | undefined;

  /** The subscription STUB port. Present so a refusal can name a real collaborator. */
  private readonly subscriptionTermProvider: SubscriptionTermProvider | undefined;

  /** Discharges [L519] `getSalePriceDetailsForProductSkus`, the §3.9 branch (a) reach. */
  private readonly salePriceResolver: SalePriceResolver | undefined;

  // -------------------------------------------------------------------------
  // MEMOS
  //
  // EVERY MEMO IS INSTANCE-SCOPED, AND INSTANCES ARE REQUEST-SCOPED. Module-level state would be
  // CROSS-INVOCATION state on a warm Lambda container - actively unsafe, not merely untidy (AAP
  // 0.6.5). All four component-level caches in the legacy slice become request-scoped.
  //
  // THE THREE-WAY SEED/GUARD PATTERN, AND WHY THE VARIATION IS THE BEHAVIOUR. The legacy shape is
  // `if(!structKeyExists(variables,"<n>")) { variables.<n> = <seed>; if(<guard>) { variables.<n> =
  // <real>; } }`, and which variant an accessor uses decides whether it is sync or async and
  // whether it carries a fallback. Every memoized accessor is CLASSIFIED at its own declaration,
  // deliberately NOT normalised behind a shared helper.
  //
  //   VARIANT A - seed THEN guard (the seed survives when the guard fails):
  //     getSalePriceDiscountType [L604-L612]  seed "none",  guard defaultSku  -> ASSIGNS [L608]
  //     getSalePriceExpirationDateTime [L614-L622]  seed now(), guard defaultSku -> DEFECT 25
  //     getBrandName [L524-L532]  seed "",  guard brand  -> DEFECT 19, RETURNS PAST IT [L528]
  //   VARIANT B - seed, NO guard (the seed is DEAD because the next line overwrites it):
  //     getOptionGroups [L251-L261]  seed [], then unconditional reassignment at [L258]
  //   VARIANT C - NO seed, NO guard (one unconditional computation):
  //     getTransactionExistsFlag [L624-L629]
  //     getUnusedProductOptions [L635-L640], getUnusedProductOptionGroups [L642-L647],
  //     getUnusedProductSubscriptionTerms [L649-L654], getOptionGroupsStruct [L241-L249]
  // -------------------------------------------------------------------------

  /** VARIANT B memo [model/entity/Product.cfc:L252]. */
  private optionGroups: readonly OptionGroup[] | undefined;

  /** VARIANT C memo [model/entity/Product.cfc:L242]. Keyed by `optionGroupID`. */
  private optionGroupsStruct: CfStruct<OptionGroup> | undefined;

  /** VARIANT A memo [model/entity/Product.cfc:L525] - DEFECT 19's memo, repaired here. */
  private brandName: string | undefined;

  /** VARIANT A memo [model/entity/Product.cfc:L605], seeded `"none"`. */
  private salePriceDiscountType: string | undefined;

  /** VARIANT C memo [model/entity/Product.cfc:L625]. */
  private transactionExistsFlag: boolean | undefined;

  /** VARIANT C memo [model/entity/Product.cfc:L636]. */
  private unusedProductOptions: readonly SelectOption[] | undefined;

  /** VARIANT C memo [model/entity/Product.cfc:L643]. */
  private unusedProductOptionGroups: readonly SelectOption[] | undefined;

  /**
   * Hydrate one product from a repository row.
   *
   * Only `productID` is required; every other member is optional and its absence is a MEANINGFUL
   * state rather than a hole to plug. No default is invented anywhere in this body: where the
   * source declares `default="false"` the default is reproduced [L58], and where it declares none
   * the value stays `undefined` so that the guards which test presence keep working.
   *
   * With `exactOptionalPropertyTypes` on, an optional field cannot be assigned `undefined`
   * explicitly, which is why the nullable members are assigned under a presence test rather than
   * with `?? undefined` - the same "absent key versus present-but-undefined" distinction the legacy
   * `structKeyExists` probes turn on.
   */
  public constructor(input: ProductHydrationInput) {
    this.productID = input.productID;

    // [L53] NO default declared, so a NULL column reads as `false` through the CFML boolean helper
    // rather than through JavaScript truthiness - `cfBoolean` accepts 0 | 1 | '0' | '1' | 'true' |
    // 'false' | null | undefined and answers deterministically for every one.
    this.activeFlag = cfBoolean(input.activeFlag);

    // [L58] `default="false"` - reproduced, and `cfBoolean(undefined)` IS `false`, so the declared
    // default and the NULL-column reading coincide here. Recorded because they do NOT coincide
    // everywhere: ./sku.js has `activeFlag default="1"`, where omission must yield `true`.
    this.publishedFlag = cfBoolean(input.publishedFlag);

    // [L64] NO default declared.
    this.calculatedAllowBackorderFlag = cfBoolean(input.calculatedAllowBackorderFlag);

    if (input.urlTitle !== undefined) {
      this.urlTitle = input.urlTitle;
    }
    if (input.productName !== undefined) {
      this.productName = input.productName;
    }
    if (input.productCode !== undefined) {
      this.productCode = input.productCode;
    }
    if (input.productDescription !== undefined) {
      this.productDescription = input.productDescription;
    }
    if (input.sortOrder !== undefined) {
      this.sortOrder = input.sortOrder;
    }

    // [L62] MONETARY and with NO `default="0"`, so absence is preserved rather than zeroed (E4 and
    // the four-no-default-columns asymmetry documented on the class).
    if (input.calculatedSalePrice !== undefined) {
      this.calculatedSalePrice = input.calculatedSalePrice;
    }
    if (input.calculatedQATS !== undefined) {
      this.calculatedQATS = input.calculatedQATS;
    }
    if (input.calculatedTitle !== undefined) {
      this.calculatedTitle = input.calculatedTitle;
    }

    // [L68-L70] the three EAGER `fetch="join"` many-to-ones.
    if (input.brand !== undefined) {
      this.brand = input.brand;
    }
    if (input.productType !== undefined) {
      this.productType = input.productType;
    }
    if (input.defaultSku !== undefined) {
      this.defaultSku = input.defaultSku;
    }

    // The six LIVE collections and the two read-only projections. Each defaults to `[]` - never to
    // `undefined` - because the far-side helpers push into the accessor's result unconditionally
    // and because every consumer counts before it indexes.
    this.skus = input.skus ?? [];
    this.categories = input.categories ?? [];
    this.relatedProducts = input.relatedProducts ?? [];
    this.promotionRewards = input.promotionRewards ?? [];
    this.promotionRewardExclusions = input.promotionRewardExclusions ?? [];
    this.promotionQualifiers = input.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = input.promotionQualifierExclusions ?? [];
    this.priceGroupRates = input.priceGroupRates ?? [];

    // The option-group memo may be pre-seeded by the repository. Left `undefined` when it is not,
    // so that `getOptionGroups()` can distinguish "materialized as empty" from "never materialized"
    // and refuse rather than answer `[]` - see that accessor.
    if (input.optionGroups !== undefined) {
      this.optionGroups = input.optionGroups;
    }

    if (input.remoteID !== undefined) {
      this.remoteID = input.remoteID;
    }
    if (input.createdDateTime !== undefined) {
      this.createdDateTime = input.createdDateTime;
    }
    if (input.createdByAccountID !== undefined) {
      this.createdByAccountID = input.createdByAccountID;
    }
    if (input.modifiedDateTime !== undefined) {
      this.modifiedDateTime = input.modifiedDateTime;
    }
    if (input.modifiedByAccountID !== undefined) {
      this.modifiedByAccountID = input.modifiedByAccountID;
    }

    if (input.price !== undefined) {
      this.price = input.price;
    }
    if (input.salePriceDetailsForSkus !== undefined) {
      this.salePriceDetailsForSkus = input.salePriceDetailsForSkus;
    }
    if (input.nextOptionGroupSortOrder !== undefined) {
      this.nextOptionGroupSortOrder = input.nextOptionGroupSortOrder;
    }

    if (input.settingsProvider !== undefined) {
      this.settingsProvider = input.settingsProvider;
    }
    if (input.skuRepository !== undefined) {
      this.skuRepository = input.skuRepository;
    }
    if (input.optionRepository !== undefined) {
      this.optionRepository = input.optionRepository;
    }
    if (input.productRepository !== undefined) {
      this.productRepository = input.productRepository;
    }
    if (input.subscriptionTermProvider !== undefined) {
      this.subscriptionTermProvider = input.subscriptionTermProvider;
    }
    if (input.salePriceResolver !== undefined) {
      this.salePriceResolver = input.salePriceResolver;
    }
  }

  /**
   * The uniform refusal for a collaborator that hydration failed to supply.
   *
   * Matched verbatim in shape to src/domain/entities/sku.ts's helper of the same name, so the two
   * largest entities in the folder fail identically. Every message names the SOURCE LOCATOR that
   * cannot be evaluated, because "port missing" on its own tells a debugger nothing about which
   * legacy line it was standing in for. Absence is a refusal rather than a silent default ON
   * PURPOSE: a defaulted setting would fabricate a URL, and a defaulted repository would fabricate
   * a price.
   */
  private missingCollaborator(collaborator: string, locator: string): Error {
    return new Error(
      `Product '${this.productID}': the ${collaborator} collaborator was not injected, so ` +
        `[model/entity/Product.cfc:${locator}] cannot be evaluated. Repositories own hydration ` +
        `and must supply it.`,
    );
  }

  // ===========================================================================
  // GENERATED PERSISTENT-PROPERTY ACCESSORS
  //
  // Hibernate generated these; they are authored explicitly because TypeScript must not emulate
  // dynamic dispatch (prohibition 11) - no `Proxy`, no index signature, no `variables.` emulation.
  //
  // THE SPELLING IS `getUrlTitle()` AND THERE IS NO `getURLTitle()` ALIAS, even though the legacy
  // reads the value back as `getURLTitle()` with a capital `URL` at [L208] and [L212] and the
  // property is spelled `urlTitle` at [L54]. CFML is case-insensitive so both resolve to one method
  // there; TypeScript is not, and two sibling entities already state `getUrlTitle()` as the only
  // spelling.
  // ===========================================================================

  /** [model/entity/Product.cfc:L52] `''` when unsaved - see {@link Product.isNew}. */
  public getProductID(): string {
    return this.productID;
  }

  /** [model/entity/Product.cfc:L53] */
  public getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /** [model/entity/Product.cfc:L54] Read by {@link Product.getProductURL} as `getURLTitle()`. */
  public getUrlTitle(): string | undefined {
    return this.urlTitle;
  }

  /** [model/entity/Product.cfc:L55] */
  public getProductName(): string | undefined {
    return this.productName;
  }

  /** [model/entity/Product.cfc:L56] */
  public getProductCode(): string | undefined {
    return this.productCode;
  }

  /** [model/entity/Product.cfc:L57] */
  public getProductDescription(): string | undefined {
    return this.productDescription;
  }

  /** [model/entity/Product.cfc:L58] `default="false"`. */
  public getPublishedFlag(): boolean {
    return this.publishedFlag;
  }

  /** [model/entity/Product.cfc:L59] */
  public getSortOrder(): number | undefined {
    return this.sortOrder;
  }

  /**
   * [model/entity/Product.cfc:L62] The persisted sale-price snapshot.
   *
   * `Money | undefined` because [L62] declares NO `default="0"`. This is NOT
   * {@link Product.getSalePrice}, which is a different method with the opposite absence convention
   * - see DEFECT 20.
   */
  public getCalculatedSalePrice(): Money | undefined {
    return this.calculatedSalePrice;
  }

  /** [model/entity/Product.cfc:L63] Snapshot of the omitted `getQATS()`. */
  public getCalculatedQATS(): number | undefined {
    return this.calculatedQATS;
  }

  /** [model/entity/Product.cfc:L64] Snapshot of the omitted `getAllowBackorderFlag()`. */
  public getCalculatedAllowBackorderFlag(): boolean {
    return this.calculatedAllowBackorderFlag;
  }

  /** [model/entity/Product.cfc:L65] Snapshot of the omitted `getTitle()`. */
  public getCalculatedTitle(): string | undefined {
    return this.calculatedTitle;
  }

  /** [model/entity/Product.cfc:L68] EAGER `fetch="join"`. */
  public getBrand(): Brand | undefined {
    return this.brand;
  }

  /** [model/entity/Product.cfc:L69] EAGER `fetch="join"`. */
  public getProductType(): ProductType | undefined {
    return this.productType;
  }

  /**
   * [model/entity/Product.cfc:L70] EAGER `fetch="join"`.
   *
   * Called live by `Sku.getDefaultFlag()` in ./sku.ts, which reproduces
   * [model/entity/Sku.cfc:L443]'s unconditional dereference by raising when this answers nothing.
   */
  public getDefaultSku(): Sku | undefined {
    return this.defaultSku;
  }

  /** [model/entity/Product.cfc:L80] READ-ONLY projection; the source of `getCategoryIDs()`. */
  public getCategories(): readonly Category[] {
    return this.categories;
  }

  /** [model/entity/Product.cfc:L81] READ-ONLY projection. */
  public getRelatedProducts(): readonly Product[] {
    return this.relatedProducts;
  }

  /** [model/entity/Product.cfc:L93] */
  public getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/Product.cfc:L96] */
  public getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/Product.cfc:L97] The opaque account identifier, NOT an `Account` entity.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L97]: `createdByAccount` is `cfc="Account"`, which is not
   * one of the eighteen in-scope entities, so the association collapses to its foreign key per
   * §1.5.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  public getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/Product.cfc:L98] */
  public getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/Product.cfc:L99] The opaque account identifier, NOT an `Account` entity.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L99]: `modifiedByAccount` is `cfc="Account"`, out of
   * scope, so the association collapses to its foreign key per §1.5.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  public getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ===========================================================================
  // FRAMEWORK MEMBER
  // ===========================================================================

  /**
   * Whether this instance has never been persisted.
   *
   * The empty-string test is literally what the framework does: `isNew()`
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`, and `getNewFlag()`
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   *   `if(getPrimaryIDValue() == "") { return true; } return false;`.
   * The empty string it compares against is the `unsavedvalue=""` on the id property at
   * [model/entity/Product.cfc:L52].
   *
   * WHY IT IS AUTHORED even though `Product.cfc` never calls it itself: FIVE far-side guards in
   * already-shipped siblings call `arguments.product.isNew()` across a module boundary -
   * [model/entity/PriceGroupRate.cfc:L219], [model/entity/PromotionQualifier.cfc:L201] and [L301],
   * [model/entity/PromotionReward.cfc:L259] and [L359] - and the legacy suite asserts it directly
   * through the inherited `defaults_are_correct()` at
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc].
   *
   * NOTHING ELSE THE DISPATCHER AT [org/Hibachi/HibachiEntity.cfc:L507-L565] CAN SYNTHESISE IS
   * AUTHORED BEYOND THE SIX CONTAINMENT PROBES BELOW - no `hasAny*`, no `hasUnique*`, no
   * `get*AssignedIDList`, no `get*OptionsSmartList`, no `get*SmartList`, and no
   * `getPrimaryIDValue`, `getPrimaryIDPropertyName`, `getSimpleRepresentation`, `validate` or
   * `hasErrors`.
   */
  public isNew(): boolean {
    return this.productID === '';
  }

  // ===========================================================================
  // CONTAINMENT PROBES - THE SIX FAR-SIDE CONTRACT MEMBERS (§2)
  //
  // NOT ONE of these is declared in `Product.cfc`. All six are synthesised by the dispatcher at
  // [org/Hibachi/HibachiEntity.cfc:L507-L565], whose CFML semantics are Hibernate's implicit
  // collection-contains - SESSION IDENTITY, i.e. the primary key for a persistent row. So the
  // comparison basis is the PRIMARY KEY: never object reference, never deep equality.
  //
  // WITH ONE NECESSARY EXCEPTION - THE UNSAVED-CANDIDATE REFERENCE FALLBACK. Every unsaved row's
  // key is `''` (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved
  // rows as the same one and the far side's guard would then skip a legitimate append. Where the
  // candidate is unsaved, identity is the only thing left to compare. This is the rule
  // src/domain/entities/brand.ts states as project-wide and src/domain/entities/promotionReward.ts
  // implements; src/domain/entities/priceGroupRate.ts omits the fallback, and the divergence is
  // recorded here rather than silently copied either way.
  //
  // THE SPECIFICATION LISTS FIVE PROBES. THERE ARE SIX. `hasSku` is required too: `Sku.setProduct`
  // calls `product.hasSku(this)` verbatim from [model/entity/Sku.cfc:L607], and
  // src/domain/entities/sku.ts reproduces that call live. Omitting it would break the compile of an
  // already-shipped sibling, so the census was re-run against the actual TypeScript call sites.
  // ===========================================================================

  /**
   * Called by `PriceGroupRate.addProduct` [model/entity/PriceGroupRate.cfc:L223]:
   *   `if(isNew() or !arguments.product.hasPriceGroupRate( this ))`.
   */
  public hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const candidateID: string = priceGroupRate.getPriceGroupRateID();
    if (candidateID === '') {
      return this.priceGroupRates.includes(priceGroupRate);
    }
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addProduct` [model/entity/PromotionQualifier.cfc:L204]:
   * `if(isNew() or !arguments.product.hasPromotionQualifier( this ))`. INCLUDE side [L86].
   */
  public hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addExcludedProduct` [model/entity/PromotionQualifier.cfc:L304].
   * EXCLUDE side [L87].
   */
  public hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addProduct` [model/entity/PromotionReward.cfc:L262]:
   *   `if(isNew() or !arguments.product.hasPromotionReward( this ))`.
   * INCLUDE side [L84].
   */
  public hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addExcludedProduct` [model/entity/PromotionReward.cfc:L362]. EXCLUDE
   * side [L85].
   */
  public hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `Sku.setProduct` [model/entity/Sku.cfc:L607]:
   *   `if(isNew() or !arguments.product.hasSku( this ))`.
   *
   * THE SIXTH PROBE, ABSENT FROM THE §2.1 TABLE - see the section banner.
   */
  public hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  // ===========================================================================
  // THE FIVE LIVE-ARRAY ACCESSORS (§2.1 / §2.2)
  //
  // EVERY ONE RETURNS THE LIVE INTERNAL ARRAY REFERENCE, NEVER A DEFENSIVE COPY. This is ABSOLUTE,
  // and the per-array inventory of which far-side helper pushes into and splices out of which array
  // is on the MATERIALIZED ASSOCIATIONS banner above. The return types are therefore MUTABLE arrays
  // rather than `readonly` ones - `readonly` would make the far-side `push` a compile error and
  // force a cast to defeat a boundary this file declared. {@link Product.getSkus} is the sixth and
  // is authored separately, because [L155-L161] OVERRIDES the generated accessor with two
  // parameters.
  // ===========================================================================

  /** [model/entity/Product.cfc:L88] LIVE. Mutated by `PriceGroupRate.add/removeProduct`. */
  public getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /** [model/entity/Product.cfc:L86] LIVE. Mutated by `PromotionQualifier.addProduct`. */
  public getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /** [model/entity/Product.cfc:L87] LIVE. Mutated by `PromotionQualifier.addExcludedProduct`. */
  public getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /** [model/entity/Product.cfc:L84] LIVE. Mutated by `PromotionReward.addProduct`. */
  public getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /** [model/entity/Product.cfc:L85] LIVE. Mutated by `PromotionReward.addExcludedProduct`. */
  public getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  // ===========================================================================
  // THE URL PAIR - `getProductURL()` IS THE ONLY LEGACY-TESTED ENTITY METHOD IN THE SUBTREE
  // ===========================================================================

  /**
   * THE PRODUCT DETAIL URL - THE ONE ENTITY METHOD IN THIS WHOLE SUBTREE THAT AN EXISTING LEGACY
   * TEST PINS.
   *
   * [model/entity/Product.cfc:L207-L209] returns
   * `"/#setting('globalURLKeyProduct')#/#getURLTitle()#/"`.
   *
   * THE ASSERTION THIS MUST SATISFY. `meta/tests/unit/entity/ProductTest.cfc` ->
   * `productUrlIsCorrectlyFormatted()` builds a product with `urlTitle = "nike-air-jorden"` and
   * asserts the result equals `/<globalURLKeyProduct>/nike-air-jorden/` - WITH BOTH THE LEADING AND
   * THE TRAILING SLASH. The fixture spelling `nike-air-jorden` is retained verbatim in the ported
   * suite, typo and all, because changing a fixture is changing the test. That makes this file one
   * of only TWO in the folder whose suite is PARITY rather than net-new; the other is
   * src/domain/entities/brand.ts.
   *
   * SYNCHRONOUS, because `SettingsProvider.setting()` is synchronous by design - the composition
   * root resolves every default eagerly so the domain layer never awaits a setting.
   *
   * THE DEFAULT URL KEY IS NOT HERE AND MUST NEVER BE - NOT EVEN QUOTED IN A COMMENT. It is
   * declared once, at [model/service/SettingService.cfc:L178], as the `defaultValue` of the
   * `globalURLKeyProduct` text setting, and the legacy entity carries no literal fallback.
   *
   * `getURLTitle()` in the legacy body is this class's `getUrlTitle()`. A `urlTitle` of `undefined`
   * interpolates as the empty string, exactly as CFML does with an unset `urlTitle`.
   */
  public getProductURL(): string {
    if (this.settingsProvider === undefined) {
      throw this.missingCollaborator('settings provider', 'L208');
    }
    const urlKey: string = this.settingsProvider.setting('globalURLKeyProduct');
    return `/${urlKey}/${this.urlTitle ?? ''}/`;
  }

  /**
   * The same URL WITHOUT the leading slash, for use inside a listing page's own path.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L211-L213]: the ONLY difference from `getProductURL()` is
   * the absent leading slash - the trailing one is present in both. The two methods sit four lines
   * apart and differ by one character, so the difference is reproduced explicitly rather than by
   * deriving one from the other.
   */
  public getListingProductURL(): string {
    if (this.settingsProvider === undefined) {
      throw this.missingCollaborator('settings provider', 'L212');
    }
    const urlKey: string = this.settingsProvider.setting('globalURLKeyProduct');
    return `${urlKey}/${this.urlTitle ?? ''}/`;
  }

  // ===========================================================================
  // ID-LIST ACCESSORS
  // ===========================================================================

  /**
   * The comma-delimited list of this product's category IDs.
   *
   * [model/entity/Product.cfc:L199-L205]. THIS IS A PLAIN COMMA-LIST BUILD, NOT A MATERIALIZED PATH
   * WALK, and the distinction decided an import: `../valueObjects/materializedIdPath.js`
   * centralises `productTypeIDPath` / `priceGroupIDPath` / `categoryIDPath` walking and is
   * deliberately NOT imported here, because this loop appends one key per element of an
   * already-materialized collection.
   *
   * `listAppend` from `../../lib/cfml/list.js` is used rather than `Array.join`, because the helper
   * is PURE and emits NO LEADING DELIMITER ON AN EMPTY LIST - the property proven load-bearing at
   * [model/entity/Sku.cfc:L234-L236] and [L886-L888]. `join` would agree here by coincidence; the
   * helper agrees by contract.
   *
   * `Category` is ported as a read-mostly leaf: its `cmsCategoryID` column (index
   * `RI_CMSCATEGORYID`) and its `site` association survive as INERT persisted columns with NO CMS
   * behaviour. There is no `CategoryService` and none may be invented - `Category.cfc` declares
   * `hb_serviceName="contentService"`, and `ContentService` is out of scope beyond the narrow
   * category access path.
   */
  public getCategoryIDs(): string {
    let categoryIDs = '';
    for (const category of this.categories) {
      categoryIDs = listAppend(categoryIDs, category.getCategoryID());
    }
    return categoryIDs;
  }

  /**
   * PRESERVED AS THROWING - the legacy body calls a method that does not exist.
   *
   * [model/entity/Product.cfc:L191-L197] builds a comma list over `getPages()`, and `getPages()` IS
   * NOT DECLARED ANYWHERE IN `Product.cfc` - NO `pages` PROPERTY EXISTS. The component declares
   * `listingPages` at [L82], a many-to-many against `Content` through `SwProductListingPage`, and
   * nothing named `pages`. So the call falls into `onMissingMethod`
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], matches none of the ten name patterns, reaches the
   * `getAttributeValue` fallback at [L559] - reachable here, this being one of only four in-scope
   * entities declaring `attributeValues` [L75] - finds no such attribute, and throws at [L565].
   * Writing a working implementation over `listingPages` would be inventing a feature and calling
   * it a port.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L191-L197]: `getPageIDs()` iterates `getPages()`, which
   * is undeclared, so the call reaches [org/Hibachi/HibachiEntity.cfc:L559] and then throws at
   * [L565].
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  public getPageIDs(): never {
    throw new Error(
      `Product '${this.productID}': getPageIDs() cannot return. ` +
        `[model/entity/Product.cfc:L193] iterates getPages(), which is not declared on the ` +
        `component and corresponds to no property - the component declares listingPages at [L82], ` +
        `not pages. In CFML the call reaches the onMissingMethod dispatcher at ` +
        `[org/Hibachi/HibachiEntity.cfc:L507-L565], matches no name pattern, falls through to the ` +
        `getAttributeValue fallback at [L559] and terminates at the throw at [L565]. This throw is ` +
        `the faithful port of that behaviour, not a stub awaiting implementation.`,
    );
  }

  // ===========================================================================
  // OVERRIDDEN METHODS [model/entity/Product.cfc:L789-L791]
  // ===========================================================================

  /**
   * Which property represents this product in a listing.
   *
   * [model/entity/Product.cfc:L791-L793] returns `"productName"`. The framework's
   * `getSimpleRepresentation()` consumes this and is deliberately not ported - it is
   * metadata-driven dispatch. The override itself is a one-line constant with no framework reach of
   * its own.
   */
  public getSimpleRepresentationPropertyName(): string {
    return 'productName';
  }

  // ===========================================================================
  // ORM-GENERATED PROPERTY SETTERS
  //
  // Neither member below is DECLARED in `Product.cfc`. Both are implicit accessors that the CFML ORM
  // generates for every persistent property, and §0.6's MEMBER-GENERATION PRINCIPLE governs them:
  // generate ONLY the concretely-called patterns, each annotated with the branch it replaces. Two
  // persistent properties are concretely ASSIGNED from inside the ported slice, so exactly two
  // setters are authored. The other thirty-three persistent properties are never assigned from
  // in-scope code and get none, which is why this section is two members long and not thirty-five.
  //
  // ★ THESE ARE RESTORATIONS OF OMITTED LEGACY ACCESSORS, NOT NEW SURFACE. `setURLTitle` and
  // `setDefaultSku` are both callable against a `SlatwallProduct` today; the port simply had not
  // authored them yet. That distinction decides the budget question: the four ledgers - signature
  // reshapings, signature widenings, visibility widenings and deliberate divergences - all govern
  // CHANGES to a mapped signature, and a mapped signature that was never authored is not a change.
  // None of the four is touched. Nor is either lock §8 imposes: the entity folder stays at exactly
  // eighteen FILES and the port count stays at exactly thirteen PORTS. Neither lock is a cap on
  // class members, and §0.6 positively instructs generating members for concretely-called patterns.
  // ===========================================================================

  /**
   * Assigns this product's URL title.
   *
   * Ports the ORM-generated `setURLTitle()` called at [model/service/ProductService.cfc:L268-L270]:
   *
   *   if(isNull(arguments.product.getURLTitle())) {
   *     arguments.product.setURLTitle(getDataService().createUniqueURLTitle(
   *       titleString=arguments.product.getTitle(), tableName="SwProduct"));
   *   }
   *
   * ★ THAT CALL WRITES ONTO THE ENTITY, AND IT IS THE ONLY ONE OF THE THREE IN-SCOPE SAVE OVERRIDES
   * THAT DOES. `saveProductType` resolves its title into the bare unscoped `data.urlTitle`
   * [model/service/ProductService.cfc:L297], [L299], and `saveBrand` does the same
   * [model/service/BrandService.cfc:L70], [L72]. The asymmetry is load-bearing rather than
   * incidental: because THIS one writes onto the entity, the `Product.json` `save` context that runs
   * immediately afterwards at [model/service/ProductService.cfc:L273] validates the RESOLVED title,
   * whereas the other two validate whatever the entity already held. Routing all three through a
   * data struct would silently move this product's `urlTitle` requiredness from "satisfied by
   * generation" to "must be supplied by the caller", and would reject saves the source accepts.
   *
   * LEGACY-NOTE: the source spells the accessor `setURLTitle`, CFML's convention for the property
   * `urlTitle` [model/entity/Product.cfc:L54]. The TypeScript member is `setUrlTitle`, matching the
   * already-shipped {@link Product.getUrlTitle} getter, whose own note records the identical casing
   * decision. This is an internal-consistency rename only - the persistent property name that
   * reaches `SwProduct` is untouched, and the getter/setter pair now agree with each other.
   */
  public setUrlTitle(urlTitle: string): void {
    this.urlTitle = urlTitle;
  }

  /**
   * Designates - or clears - this product's default SKU.
   *
   * Ports the ORM-generated `setDefaultSku()`. There is NO hand-written `setDefaultSku` in
   * `model/entity/Product.cfc` to quote, and that is the point: unlike `setBrand`
   * [model/entity/Product.cfc:L662-L667], which the legacy authors wrote out so it could wire the
   * far side, `defaultSku` is served by the setter Hibachi generates for every persistent property -
   * a plain assignment. So this body is a plain assignment too.
   *
   * ★ WHY IT IS PUBLISHED AT ALL, WHEN SO MUCH OF THIS ENTITY IS READ-ONLY. `model/service/
   * SkuService.cfc` calls it at FIVE creation sites, spread across all four of its branches, and its
   * call is the only reason a freshly created product has a default SKU at all:
   *
   *   [model/service/SkuService.cfc:L102]  first-wins inside the option-combination loop
   *                                        if(isNull(arguments.product.getDefaultSku())) {
   *                                          arguments.product.setDefaultSku(newSku);
   *                                        }
   *   [model/service/SkuService.cfc:L134]  unconditionally, single-SKU merchandise branch
   *                                        arguments.product.setDefaultSku( thisSku );
   *   [model/service/SkuService.cfc:L167]  loop-index test, subscription branch
   *   [model/service/SkuService.cfc:L189]  unconditionally, single-content content-access branch
   *   [model/service/SkuService.cfc:L198]  loop-index test, per-content content-access branch
   *
   * The first two are the in-scope merchandise and bundle branches; the last three sit inside the
   * subscription and content-access branches that AAP §0.2.2 places out of scope and are named for
   * completeness. Without this member the designation had nowhere to land, `getDefaultSku()` answered
   * `undefined` for every product the service had just built, and `SwProduct.defaultSkuID` was
   * written NULL - which is a product no storefront can price, because eight accessors on this very
   * class read through `defaultSku` and answer their fallback when it is absent.
   *
   * ★ THE PARAMETER IS `Sku | undefined` BECAUSE OF A SIXTH SITE. `arguments.product.setDefaultSku(
   * javaCast("null",""))` [model/service/ProductService.cfc:L323] is how CFML nulls a persistent
   * many-to-one, and the legacy delete is built on it: it snapshots the current default at [L320],
   * NULLS IT at [L323] so `defaultSkuID` stops pointing at a row that is about to disappear,
   * delegates to the framework delete at [L326], and RESTORES the snapshot at [L330] when that
   * delete was refused. A setter that accepted only a `Sku` would leave the null-out inexpressible.
   *
   * WHERE THAT CLEAR IS ACTUALLY PERFORMED, IN THE PORT. Not in `ProductService.deleteProduct`. The
   * adapter nulls the column with `DETACH_PRODUCT_DEFAULT_SKU_SQL` at the head of the SAME
   * transaction as the delete (see src/repositories/mysql/mysqlProductRepository.ts), so a refusal
   * rolls the detach back and the [L330] restore has nothing left to do. This member therefore keeps
   * the clear expressible - the entity contract matches the legacy one - while the delete path that
   * needs it is served atomically one layer down.
   *
   * NO FAR SIDE IS WIRED, deliberately. `defaultSku` is a plain many-to-one
   * [model/entity/Product.cfc:L70] with no inverse collection on the SKU - `Sku.getDefaultFlag()`
   * [model/entity/Sku.cfc:L443] answers by asking its product rather than by holding a flag - so
   * there is nothing on the far side to append to or splice from. Contrast {@link Product.setBrand},
   * which DOES push onto `Brand.getProducts()`, because there that inverse collection exists. Adding
   * a push here would invent an association the schema does not have.
   *
   * `cascade="delete"` on the mapping is a PERSISTENCE concern and is not honoured here: assigning
   * `undefined` detaches the reference, it does not delete the previously-held sku row. Whatever the
   * cascade implies is owned by the adapter, per the fetch-shape and cascade notes in
   * src/repositories/mysql/mysqlProductRepository.ts.
   *
   * @param defaultSku the SKU to designate, or `undefined` to clear the designation. May be
   *   transient: the designation is made in memory before either the SKU or the product has a key,
   *   exactly as it is at [L102] and [L134], and the adapter that persists the aggregate is what
   *   resolves the key ordering.
   */
  public setDefaultSku(defaultSku: Sku | undefined): void {
    this.defaultSku = defaultSku;
  }

  // ===========================================================================
  // BIDIRECTIONAL HELPER METHODS [model/entity/Product.cfc:L659-L787]
  //
  // THE INVERSION CROSS-CHECK VERDICT: THIRTEEN `remove*` HELPERS, ALL CLEAN, ZERO INVERTED. The
  // full verdict table is in the file header. The defect class screened for is real and lives
  // elsewhere in this folder - [model/entity/Option.cfc:L129-L131] and [L145-L147] each declare a
  // `remove*` whose body calls `add*` on the far side - so every body here was read verbatim and
  // checked. Every `remove*` in `Product.cfc` calls a far-side `remove*`.
  //
  // Of the thirteen pairs, SEVEN have an in-scope far side and are authored below - Brand, Sku,
  // PromotionReward, PromotionRewardExclusion, PromotionQualifier, PromotionQualifierExclusion and
  // PriceGroupRate. The other SIX point at entities outside the eighteen - AttributeValue,
  // ProductImage, ProductReview, ListingPage (Content), Vendor and Physical - and are omitted with
  // a note apiece in the OMISSION REGISTER.
  // ===========================================================================

  // --- Brand (many-to-one) [model/entity/Product.cfc:L661]

  /**
   * Points this product at a brand, wiring both sides.
   *
   * [model/entity/Product.cfc:L662-L667]. THE `isNew() or` SHORT-CIRCUIT IS PRESERVED EXACTLY: a
   * brand-new product is appended WITHOUT the containment probe, which is how the legacy avoided
   * probing against an unsaved key. Reversing the operands would change nothing observable today
   * but would reintroduce the ambiguity the short-circuit exists to dodge.
   *
   * `getProducts()` on the far side hands back src/domain/entities/brand.ts's LIVE array, and this
   * push mutates it. That array defaults to `[]` there, asserted by the legacy test
   * `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()`.
   */
  public setBrand(brand: Brand): void {
    this.brand = brand;
    if (this.isNew() || !brand.hasProduct(this)) {
      brand.getProducts().push(this);
    }
  }

  /**
   * Detaches this product from a brand, unwiring both sides.
   *
   * [model/entity/Product.cfc:L668-L677]. The omitted-argument default at [L669-L671] becomes an
   * optional parameter. The `structDelete` at [L676] becomes an assignment of `undefined`, NEVER
   * `delete this.brand` - with `exactOptionalPropertyTypes` on, assignment is the checkable form
   * and `delete` on a non-optional field is not even legal.
   *
   * `index > 0` BECOMES `!== -1`, AND THAT IS NOT A STYLE CHANGE. CFML's `arrayFind` returns a
   * 1-BASED index or 0, so `> 0` is exactly right there; TypeScript's `findIndex` returns 0-BASED
   * or -1, so carrying `> 0` across literally would SILENTLY REFUSE TO REMOVE THE FIRST PRODUCT OF
   * A BRAND. Recorded again here because the failure is invisible to testing that never targets
   * element 0.
   */
  public removeBrand(brand?: Brand): void {
    const target = brand ?? this.brand;
    if (target === undefined) {
      // LEGACY-NOTE [model/entity/Product.cfc:L669-L672]: with no argument and no
      // `variables.brand`, CFML raises on `arguments.brand.getProducts()`. Raising here is the
      // faithful port.
      throw new Error(
        `Product '${this.productID}': removeBrand was called with no argument and no owning ` +
          `brand, which raises at [model/entity/Product.cfc:L672].`,
      );
    }
    const farSideProducts: Product[] = target.getProducts();
    const index = farSideProducts.findIndex(
      (held: Product) => held.getProductID() === this.productID,
    );
    if (index !== -1) {
      farSideProducts.splice(index, 1);
    }
    this.brand = undefined;
  }

  // --- Default Sku (many-to-one, NO bidirectional helper) [model/entity/Product.cfc:L70] --------
  //
  // NO HELPER LIVES HERE, AND THAT IS THE POINT. `defaultSku` is a plain many-to-one with no
  // inverse collection on the far side - `Sku` declares no "products I am the default for"
  // collection [model/entity/Sku.cfc:L65-L79] - so there is nothing to append to or splice from
  // and the legacy never hand-wrote a helper for it. The designation is made through the
  // ORM-GENERATED setter, {@link Product.setDefaultSku}, declared in the property-accessor
  // section above alongside the other generated setters. Contrast {@link Product.setBrand}
  // immediately above, which DOES exist as a hand-written helper precisely because there the
  // inverse collection `Brand.getProducts()` is real.

  // --- Skus (one-to-many) [model/entity/Product.cfc:L695]

  /**
   * [model/entity/Product.cfc:L696-L698] verbatim: `arguments.sku.setProduct( this );`
   *
   * Delegates to the OWNING side. `Sku` holds the `productID` FK
   * [model/entity/Sku.cfc:L65], so the sku is what changes; this product's `skus` array is
   * appended to BY `Sku.setProduct` rather than here, exactly as in the legacy body.
   */
  public addSku(sku: Sku): void {
    sku.setProduct(this);
  }

  /** [model/entity/Product.cfc:L699-L701] verbatim: `arguments.sku.removeProduct( this );` */
  public removeSku(sku: Sku): void {
    sku.removeProduct(this);
  }

  // --- Promotion Rewards (many-to-many, inverse) [model/entity/Product.cfc:L731]

  /** [model/entity/Product.cfc:L732-L734]: `arguments.promotionReward.addProduct( this );` */
  public addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProduct(this);
  }

  /** [model/entity/Product.cfc:L735-L737]: `arguments.promotionReward.removeProduct( this );` */
  public removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProduct(this);
  }

  // --- Promotion Reward Exclusions (many-to-many, inverse) [L739]

  /** [model/entity/Product.cfc:L740-L742] `promotionReward.addExcludedProduct( this )`. */
  public addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L743-L745]: `...removeExcludedProduct( this );` */
  public removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProduct(this);
  }

  // --- Promotion Qualifiers (many-to-many, inverse) [L747]

  /** [model/entity/Product.cfc:L748-L750]: `arguments.promotionQualifier.addProduct( this );` */
  public addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProduct(this);
  }

  /** [model/entity/Product.cfc:L751-L753]: `arguments.promotionQualifier.removeProduct( this );` */
  public removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProduct(this);
  }

  // --- Promotion Qualifier Exclusions (many-to-many, inverse) [L755]

  /** [model/entity/Product.cfc:L756-L758]: `...addExcludedProduct( this );` */
  public addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L759-L761]: `...removeExcludedProduct( this );` */
  public removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProduct(this);
  }

  // --- Price Group Rates (many-to-many, inverse) [L763]

  /** [model/entity/Product.cfc:L764-L766]: `arguments.priceGroupRate.addProduct( this );` */
  public addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProduct(this);
  }

  /** [model/entity/Product.cfc:L767-L769]: `arguments.priceGroupRate.removeProduct( this );` */
  public removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProduct(this);
  }

  // ===========================================================================
  // THE OPTION-GROUP MEMO TRIO [model/entity/Product.cfc:L241-L265]
  //
  // These three feed the LIVE VALIDATION PATH and therefore cannot be omitted:
  // `model/validation/Product.json` requires `unusedProductOptions` and `unusedProductOptionGroups`
  // with `minCollection:1` in the `addOption` and `addOptionGroup` contexts, the accessors
  // satisfying those rules are built from `structKeyList(getOptionGroupsStruct())`, and
  // `getOptionGroupsStruct()` is built from `getOptionGroups()`. Drop the first and the other two
  // become unsatisfiable.
  // ===========================================================================

  /**
   * This product's option groups, ordered by `sortOrder` ascending.
   *
   * [model/entity/Product.cfc:L251-L261]. THE RULING: THIS IS A SYNCHRONOUS ACCESSOR OVER AN
   * EAGERLY-MATERIALIZED ARRAY, forced by three independent facts. (i) `HibachiSmartList` is a
   * framework artefact the plan explicitly declines to clone (AAP 0.6.2); porting it faithfully
   * would mean reimplementing a small ORM query language, untypeable under the strict profile. (ii)
   * `../ports/optionRepository.js` declares EXACTLY TWO members - `getUnusedProductOptions`
   * [model/dao/OptionDAO.cfc:L51] and `getUnusedProductOptionGroups` [L94] - NEITHER of which
   * serves this query, and no port member may be invented. (iii) It feeds a live validation path,
   * so omitting it is not available either.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L254-L258]: THE EXACT FETCH SHAPE THE REPOSITORY OWES,
   * transcribed from the smart-list configuration: `DISTINCT` (from `setSelectDistinctFlag(1)` at
   * [L255]), filtered on the traversal `options.skus.product.productID = <this productID>` at
   * [L256], ordered by `sortOrder ASC` at [L257]. The filter reaches THROUGH options and skus - an
   * option group belongs to this product only transitively - which is why the result is not simply
   * the product's own collection and why `DISTINCT` is required rather than decorative.
   *
   * ★ THAT DEBT IS DISCHARGED, AND BY WHOM IS RECORDED HERE SO THE PAIR CAN BE REVIEWED TOGETHER.
   * `src/repositories/mysql/mysqlProductRepository.ts` reduces the option rows it already reads for
   * `Sku.options` down to the distinct groups, ordered by `sortOrder`, and supplies the result at
   * construction - and it does so WITHOUT A FOURTH STATEMENT, because the group joins onto the option
   * read through a LEFT OUTER JOIN. Until it did, this accessor raised for every product that adapter
   * returned, and `getOptionGroupsStruct()` and `getOptionGroupCount()` raised with it, which took the
   * `minCollection:1` rules in `model/validation/Product.json` down too. The ID-ONLY products that
   * `mysqlPriceGroupRepository.ts` and `mysqlPromotionRepository.ts` construct are deliberately NOT
   * given the array: they are shallow owners reached from a link row, they materialize nothing, and the
   * refusal below is the correct answer for them rather than an accident.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L253]: SEED-THEN-OVERWRITE WART.
   *   `variables.optionGroups = []`
   * is DEAD - [L258] reassigns unconditionally on the next executable line, so the empty array can
   * never be observed. This is memo VARIANT B (seed, no guard). Annotated, not tidied.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L254]: CASING AND QUOTING WART. This line writes
   * `getService("OptionService")` with a CAPITAL `O` and DOUBLE quotes, while [L637], [L644] and
   * [L651] write `getService('optionService')` lower case with SINGLE quotes. DI/1 resolution is
   * case-insensitive so all four reach the same bean. Recorded rather than normalised.
   */
  public getOptionGroups(): readonly OptionGroup[] {
    // The `!structKeyExists(variables, "optionGroups")` probe at [L252] distinguishes "hydration
    // materialized this association, possibly as empty" from "hydration never materialized it at
    // all". An empty array is a legitimate answer; a MISSING array is not, and answering `[]` for
    // it would silently pass the `minCollection:1` rules that depend on it.
    if (this.optionGroups === undefined) {
      throw new Error(
        `Product '${this.productID}': getOptionGroups() requires its option groups to have been ` +
          `materialized during hydration. [model/entity/Product.cfc:L254-L258] resolves them ` +
          `through a HibachiSmartList - DISTINCT, filtered on options.skus.product.productID, ` +
          `ordered by sortOrder ASC - which is deliberately not cloned, and no declared port member ` +
          `serves the query. Answering an empty array instead would silently satisfy the ` +
          `minCollection:1 rules in model/validation/Product.json that read through this value.`,
      );
    }
    return this.optionGroups;
  }

  /**
   * The same option groups, keyed by `optionGroupID`.
   *
   * [model/entity/Product.cfc:L241-L249]. Memo VARIANT C in effect (the `{}` at [L243] is the
   * loop's accumulator, not a seed surviving a failed guard - there is no guard), synchronous,
   * memoized per instance.
   *
   * THE RETURN IS `CfStruct<OptionGroup>`, NOT `Record<string, OptionGroup>`, AND THE DIFFERENCE IS
   * CORRECTNESS: CFML struct keys are CASE-INSENSITIVE and TypeScript's are not, so a caller
   * holding an `optionGroupID` of differing case would find the entry in CFML and miss it in
   * TypeScript. Routing every read through `structKeyExists` / `structGet` from
   * `../../lib/cfml/struct.js` restores the legacy semantics.
   */
  public getOptionGroupsStruct(): CfStruct<OptionGroup> {
    if (this.optionGroupsStruct === undefined) {
      // [L243] the accumulator, then [L244-L246] the loop. Built as a mutable record and published
      // through the readonly `CfStruct` alias, so no caller can write into the memo.
      const accumulator: Record<string, OptionGroup> = {};
      for (const optionGroup of this.getOptionGroups()) {
        // `putOwnStructKey`, not `accumulator[id] = optionGroup`: the key is a persisted
        // identifier column, so it can be `__proto__` and a plain assignment would drop it.
        putOwnStructKey(accumulator, optionGroup.getOptionGroupID(), optionGroup);
      }
      this.optionGroupsStruct = accumulator;
    }
    return this.optionGroupsStruct;
  }

  /**
   * How many option groups this product has.
   *
   * [model/entity/Product.cfc:L263-L265]: `return arrayLen(getOptionGroups());`. Not memoized in
   * the legacy either - it recomputes from the memoized array every call, which `.length`
   * reproduces.
   */
  public getOptionGroupCount(): number {
    return this.getOptionGroups().length;
  }

  // ===========================================================================
  // MUST-PRESERVE BEHAVIOUR - OPTION-TO-SKU RESOLUTION [model/entity/Product.cfc:L340-L368]
  //
  // One of the three areas the plan names as behaviour that must survive unchanged, and the
  // entity-side face of `ProductService.getProductSkusBySelectedOptions()`
  // [model/service/ProductService.cfc:L104]. The behaviour that must not move is the AND-OF-EXISTS
  // OPTION MATCHING in the backing SQL at [model/dao/SkuDAO.cfc:L107-L128] - one `EXISTS` subquery
  // per selected option, all `AND`ed, so a sku qualifies only if it carries EVERY selected option.
  // An `IN`-list rewrite would match a sku carrying ANY of them and would return the wrong sku for
  // a multi-option product.
  //
  // That SQL is preserved AT THE REPOSITORY. What this file owes it is a signature shape that does
  // not prevent it: the selected options travel as the ORIGINAL COMMA-DELIMITED STRING, exactly as
  // the legacy passes them, rather than being parsed into an array here and re-joined there.
  // ===========================================================================

  /**
   * The options of one option group that this product's SKUs actually carry.
   *
   * [model/entity/Product.cfc:L340-L347]. SYNCHRONOUS, AND COMPUTED FROM THE MATERIALIZED GRAPH
   * RATHER THAN FROM A PORT. Both filters at [L343] and [L344] are satisfiable from data this
   * entity already holds: `skus.product.productID = this.productID` is by definition every element
   * of `this.skus`, and `optionGroup.optionGroupID` is a member of each option those SKUs carry. So
   * the smart list is reproduced in memory - DISTINCT by `optionID` [L342], filtered by option
   * group [L343], ordered by `sortOrder` ascending [L345] - with no outward reach.
   * `../ports/optionRepository.js` declares EXACTLY TWO members and neither serves this query;
   * adding a third would be inventing a port member.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L345]: `sortOrder` on `Option` is
   * `sortContext="optionGroup"` - ordered WITHIN an option group, exactly the scope this method
   * filters to, so a plain ascending sort reproduces the intended order. `Option.getSortOrder()` is
   * `number | undefined` (the column declares no default), and MySQL places `NULL` FIRST on an
   * ascending sort, so an option with no sort order precedes every option that has one. That
   * ordering is pinned explicitly below rather than left to a comparator accident.
   */
  public getOptionsByOptionGroup(optionGroupID: string): readonly Option[] {
    // [L344] the `skus.product.productID` filter - every sku of this product, by construction.
    // [L342] `setSelectDistinctFlag(1)` - de-duplicated by primary key, because two SKUs of the
    // same product routinely carry the SAME option row and the legacy DISTINCT collapses them.
    const seen = new Set<string>();
    const matches: Option[] = [];

    for (const sku of this.skus) {
      for (const option of sku.getOptions()) {
        // [L343] the `optionGroup.optionGroupID` filter. An option whose group was not materialized
        // cannot match a concrete id, and is skipped rather than assumed to belong.
        const group = option.getOptionGroup();
        if (group === undefined || group.getOptionGroupID() !== optionGroupID) {
          continue;
        }
        const optionID = option.getOptionID();
        if (seen.has(optionID)) {
          continue;
        }
        seen.add(optionID);
        matches.push(option);
      }
    }

    // [L345] `addOrder("sortOrder|ASC")`. MySQL sorts `NULL` FIRST on an ascending order, so an
    // option with no sort order precedes every option that has one. Reproduced explicitly rather
    // than relying on how `undefined` happens to compare.
    matches.sort((left: Option, right: Option) => {
      const leftOrder = left.getSortOrder();
      const rightOrder = right.getSortOrder();
      if (leftOrder === undefined && rightOrder === undefined) {
        return 0;
      }
      if (leftOrder === undefined) {
        return -1;
      }
      if (rightOrder === undefined) {
        return 1;
      }
      return leftOrder - rightOrder;
    });

    return matches;
  }

  /**
   * MUST-PRESERVE. The single SKU identified by a comma-delimited list of selected option IDs.
   *
   * [model/entity/Product.cfc:L349-L364]. `async`, because [L351] reaches
   * `getSkusBySelectedOptions`, which reaches the repository. The empty-string default at [L349] is
   * reproduced, and the truthiness test at [L350] is `len(...) > 0`, so `cfLen` is used rather than
   * JavaScript truthiness.
   *
   * WHY THE RETURN TYPE IS `Sku | undefined` WHEN EVERY VISIBLE BRANCH RETURNS OR THROWS. The inner
   * chain at [L352-L358] is `if / else if / else if` WITH NO FINAL `else`. Its three conditions -
   * `== 1`, `> 1`, `< 1` - are logically exhaustive over an array length, so the `undefined` arm is
   * unreachable in practice; but the chain is SYNTACTICALLY OPEN, the legacy declares
   * `returntype="any"`, and a CFML function that falls off the end returns null. Typing the honest
   * control flow is the faithful port; the alternative is a final `else` the source does not have,
   * or a non-null assertion, which is a lint error here by design. The two misspellings in the
   * legacy messages - `seperated` and `indvidual` at [L362] - are carried over verbatim, because an
   * error message is an observable.
   */
  public async getSkuBySelectedOptions(selectedOptions = ''): Promise<Sku | undefined> {
    // [L350] `if(len(arguments.selectedOptions) > 0)`.
    if (cfLen(selectedOptions) > 0) {
      // [L351] - the delegate, which is where the AND-of-EXISTS SQL is reached.
      const skus: Sku[] = await this.getSkusBySelectedOptions(selectedOptions);

      // [L352-L353] exactly one match is the success case. `noUncheckedIndexedAccess` makes the
      // element access `Sku | undefined`, and the length test is what proves it present; the
      // narrowing is done by a local rather than by an assertion.
      if (skus.length === 1) {
        return skus[0];
      }
      // [L354-L355]
      if (skus.length > 1) {
        throw new Error(
          `More than one sku is returned when the selected options are: ${selectedOptions}`,
        );
      }
      // [L356-L357]
      if (skus.length < 1) {
        throw new Error(`No Skus are found for these selected options: ${selectedOptions}`);
      }
      // [L358] the chain closes here with no `else`. Unreachable, and deliberately not closed.
      return undefined;
    }

    // [L359-L360] no options submitted, but a single-sku product needs none.
    const ownSkus: Sku[] = this.getSkus();
    if (ownSkus.length === 1) {
      return ownSkus[0];
    }

    // [L361-L363] - misspellings preserved verbatim.
    throw new Error(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    );
  }

  /**
   * MUST-PRESERVE. Every SKU of this product that carries ALL of the selected options.
   *
   * [model/entity/Product.cfc:L366-L368] delegates to
   * `getService("productService").getProductSkusBySelectedOptions(selectedOptions, productID)`.
   * `async`, and called live by `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L763] through
   * src/domain/entities/sku.ts, which awaits it and expects `Sku[]`.
   *
   * THE [L367] `getService("productService")` LOCATOR IS ELIMINATED (T2). The legacy hop is entity
   * -> `ProductService.getProductSkusBySelectedOptions` -> `SkuDAO.getSkusBySelectedOptions`, and
   * `ProductService`'s method [model/service/ProductService.cfc:L104-L106] is a pure pass-through
   * that adds nothing. The port therefore stands in for the DAO directly, preserving the ARGUMENT
   * ORDER of the legacy call - selected options first, product id second - because
   * `SkuRepository.getSkusBySelectedOptions(selectedOptions, productID?)` declares exactly that
   * order. Passing them the other way round would compile and silently return nothing.
   *
   * THE EMPTY-STRING DEFAULT IS REPRODUCED AND IS NOT SHORT-CIRCUITED. The legacy does NOT guard
   * the empty case here - it hands `''` straight to the DAO, whose option loop then contributes no
   * `EXISTS` clause and returns every sku of the product.
   */
  public async getSkusBySelectedOptions(selectedOptions = ''): Promise<Sku[]> {
    if (this.skuRepository === undefined) {
      throw this.missingCollaborator('sku repository', 'L367');
    }
    return this.skuRepository.getSkusBySelectedOptions(selectedOptions, this.productID);
  }

  // ===========================================================================
  // THE SKU AND PRICE ACCESSOR CLUSTER - MONEY-CRITICAL [model/entity/Product.cfc:L155-L187,
  // L555-L601]
  //
  // Every monetary return in this cluster is `Money`, never `number`. Every no-`else` guard yields
  // `undefined` rather than `0` - WITH THE ONE DELIBERATE EXCEPTION OF `getSalePrice()`, which is
  // DEFECT 20 and returns `0` precisely because the legacy does.
  // ===========================================================================

  /**
   * This product's SKUs - LIVE on the default call, a projection when either flag is set.
   *
   * [model/entity/Product.cfc:L155-L160]. THIS OVERRIDES THE ORM-GENERATED COLLECTION ACCESSOR,
   * which is why it takes parameters at all, and it MUST STAY SYNCHRONOUS. Two shipped call sites
   * depend on that: `Sku.setProduct` does `product.getSkus().push(this)` and `Sku.removeProduct`
   * does `target.getSkus()` then `.splice(index, 1)`, both from synchronous bodies reproducing
   * [model/entity/Sku.cfc:L607] and [L613]. An async accessor would break the compile of a shipped
   * sibling, and a defensive copy would break bidirectional removal silently.
   *
   * THE UNFLAGGED CALL RETURNS THE LIVE ARRAY, exactly as [L157] returns `variables.skus` itself;
   * the flagged calls return a NEW array, exactly as [L159] returns the service's result.
   *
   * SORTING IS APPLIED IN MEMORY, AND THE WEIGHTING IS REPRODUCED RATHER THAN APPROXIMATED. The
   * legacy hop is [L159] -> `SkuService.getProductSkus` [model/service/SkuService.cfc:L220-L244] ->
   * `SkuDAO.getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172-L202], whose ordering clause is
   * `ORDER BY SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder -
   * SwOptionGroup.sortOrder)) ASC` - a POSITIONAL WEIGHTING in which each option group acts as a
   * decimal digit and the LOWEST-ordered group is the MOST significant, with
   * `nextOptionGroupSortOrder` being `max(SwOptionGroup.sortOrder) + 1` across the whole table.
   * Every term is available from the materialized graph plus the one hydration input carrying that
   * global maximum.
   *
   * THE LEGACY GUARD IS REPRODUCED EXACTLY: [model/service/SkuService.cfc:L223] sorts only when
   * `sorted AND arrayLen(skus) gt 1 AND arrayLen(skus[1].getOptions())` - so a single-sku product
   * is never sorted, and NEITHER IS A MULTI-SKU PRODUCT WHOSE FIRST SKU CARRIES NO OPTIONS, even if
   * later SKUs do.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L232-L238]: THE LEGACY SORT IS UNSAFE AND THE PORT IS
   * NOT. `sortedArrayReturn` is resized to the length of the ID query, then filled by
   * `sortedArrayReturn[arrayFind(sortedArray, skuID)] = skus[i]`, so a sku absent from that query
   * makes `arrayFind` return 0 and `sortedArrayReturn[0]` RAISES in CFML. Reproducing a raise that
   * depends on a DAO-level row-count coincidence would be reproducing an accident, so the port
   * sorts by computed weight - the same order whenever the legacy succeeds. The defect is in
   * `SkuService`/`SkuDAO`.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L150-L168]: `fetchOptions` selected an eager-fetch JOIN whose
   * branch came from the product's base type, and ALL THREE BRANCHES USE AN INNER JOIN, so a
   * product whose SKUs have none of the fetched children returned NOTHING when the flag was set.
   * Associations are now materialized at the repository boundary, so the flag has no fetch to
   * perform here; it is retained in the signature for interface parity.
   */
  public getSkus(sorted = false, fetchOptions = false): Sku[] {
    // [L156-L158] the unflagged fast path - THE LIVE ARRAY, by reference.
    if (!sorted && !fetchOptions) {
      return this.skus;
    }

    // [L159] the delegating path. A NEW array in the legacy, and a new array here.
    const projection: Sku[] = [...this.skus];

    // [model/service/SkuService.cfc:L223] - the three-clause guard, verbatim in order. The third
    // clause deliberately probes only the FIRST element.
    const firstSku = projection.length > 0 ? projection[0] : undefined;
    const firstSkuHasOptions = firstSku !== undefined && firstSku.getOptions().length > 0;
    if (!sorted || projection.length <= 1 || !firstSkuHasOptions) {
      return projection;
    }

    // [model/dao/SkuDAO.cfc:L172-L202] - the positional weighting. `nextOptionGroupSortOrder` is a
    // GLOBAL aggregate over `SwOptionGroup`, not derivable from this product's own graph, so it
    // arrives as a hydration input. Absent, the weighting cannot be computed, and the honest answer
    // is the unsorted projection rather than a silently different order.
    const radixCeiling = this.nextOptionGroupSortOrder;
    if (radixCeiling === undefined) {
      return projection;
    }

    const weights = new Map<string, number>();
    for (const sku of projection) {
      let weight = 0;
      for (const option of sku.getOptions()) {
        const optionSortOrder = option.getSortOrder();
        const group = option.getOptionGroup();
        if (optionSortOrder === undefined || group === undefined) {
          // A term the SQL could not have contributed either: `SwOption.sortOrder` is NULLable and
          // `SUM` skips NULL products, and the inner join drops an option with no group.
          continue;
        }
        weight += optionSortOrder * Math.pow(10, radixCeiling - group.getSortOrder());
      }
      weights.set(sku.getSkuID(), weight);
    }

    projection.sort((left: Sku, right: Sku) => {
      const leftWeight = weights.get(left.getSkuID()) ?? 0;
      const rightWeight = weights.get(right.getSkuID()) ?? 0;
      return leftWeight - rightWeight;
    });

    return projection;
  }

  /**
   * One of this product's SKUs by id, or nothing.
   *
   * [model/entity/Product.cfc:L162-L169] loops `getSkus()` and returns the match. THERE IS NO FINAL
   * `return`, so a miss yields null - and `undefined` is the faithful port, NOT a throw and NOT the
   * first sku. The legacy declares `returntype="any"`, which is what lets it fall off the end.
   *
   * [L163] calls `getSkus()` UNFLAGGED, so the search runs over the live array in insertion order.
   */
  public getSkuByID(skuID: string): Sku | undefined {
    for (const sku of this.getSkus()) {
      if (sku.getSkuID() === skuID) {
        return sku;
      }
    }
    return undefined;
  }

  /**
   * The winning sale-price detail row for one of this product's SKUs, or nothing.
   *
   * [model/entity/Product.cfc:L182-L187] probes `getSalePriceDetailsForSkus()` for the key, returns
   * the entry when present, and returns `{}` otherwise.
   *
   * THIS IS A COMPILE-HARD CONTRACT. src/domain/entities/sku.ts declares
   *   `export type SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>`
   * and assigns `this.salePriceDetail` (an optional field) to a return of that type, so the type
   * MUST admit `undefined` and the contract MUST stay a promise. Both were read off the shipped
   * sibling.
   *
   * `{}` BECOMES `undefined`, safely rather than conveniently: every legacy reader tests for its
   * key first - [model/entity/Sku.cfc:L547] and [L554] both guard with `structKeyExists` - so an
   * empty struct and an absent one are INDISTINGUISHABLE to every caller.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L182]: THE PARAMETER IS DECLARED `required any skuID`,
   * NOT `required string skuID`. It is a primary key and every call site passes a string -
   * [model/entity/Sku.cfc:L541] passes `getSkuID()` - so it is typed `string` here: a NARROWING of
   * `any`, recorded because a reviewer diffing the signatures will see it.
   *
   * `structKeyExists` / `structGet` from `../../lib/cfml/struct.js` are used rather than a bare
   * index, because CFML struct keys are CASE-INSENSITIVE and TypeScript's are not. `structGet`
   * deliberately takes NO `defaultValue`, which is how a `0` is kept out of a price path.
   *
   * IT DELEGATES TO `getSalePriceDetailsForSkus()`, WHICH IS WHAT THE SOURCE DOES. [L183] and
   * [L184] each call that accessor, and the target now carries it (§3.9 branch (a)), so the
   * delegation is literal rather than inlined. The `async` keyword is correct here because the
   * delegate genuinely awaits: `require-await` is satisfied, and `Awaited<ReturnType<...>>` is
   * unchanged by the keyword, so the compile-hard contract above is untouched.
   *
   * THE NO-COLLABORATOR EARLY RETURN IS PRESERVED BEHAVIOUR, NOT A NEW DEFAULT. When hydration
   * supplied neither the pre-reduced map nor a resolver there is nothing to probe, and this method
   * has always answered ABSENCE for that state rather than refusing. Routing it into the delegate's
   * refusal instead would turn a `Product` built with no price collaborators at all - which is what
   * a bare `new Product({ productID })` is, and what `src/repositories/mysql` builds wherever it
   * hydrates a product stub rather than a full graph - from silent into throwing. The refusal stays
   * where it belongs: on the delegate, which a caller reaches only by asking for the whole map. The
   * catalog adapter itself DOES forward the resolver, so a fully hydrated product resolves.
   */
  public async getSkuSalePriceDetails(skuID: string): Promise<SalePriceDetail | undefined> {
    if (this.salePriceDetailsForSkus === undefined && this.salePriceResolver === undefined) {
      return undefined;
    }
    const details = await this.getSalePriceDetailsForSkus();
    // [L183] the containment probe, then [L184] the read. Both case-insensitive, as CFML's are.
    if (!structKeyExists(details, skuID)) {
      // [L186] `return {};` - absent, which every caller already treats as "no sale price".
      return undefined;
    }
    return structGet(details, skuID);
  }

  /**
   * Every SKU's winning sale-price detail for this product, keyed by SKU identifier, memoized.
   *
   * Ported 1:1 from `public struct function getSalePriceDetailsForSkus()`
   * [model/entity/Product.cfc:L517-L522]: probe the memo at [L518], fill it at [L519], return it at
   * [L521]. The values are REDUCED and already ROUNDED, so no caller may round them again.
   *
   * §3.9 BRANCH (a), AND HERE IS WHY IT IS AVAILABLE. The decision procedure says to read
   * ../ports/promotionRepository.js and take branch (a) - inject and call - if a member there can
   * serve `getSalePriceDetailsForProductSkus`, and branch (b) - omit - if none can. That port
   * exports `SalePriceResolver` carrying exactly that method, declared for exactly this constructor
   * parameter, so branch (a) applies. `PromotionRepository`'s own
   * `getSalePricePromotionRewardsQuery` still CANNOT serve it - it is the port for
   * [model/dao/PromotionDAO.cfc:L298], the raw six-branch UNION, and it returns UNREDUCED, UNROUNDED
   * rows, whereas the rounding happens in the service at
   * [model/service/PromotionService.cfc:L1024-L1028] and `roundingRuleService` is outside this
   * file's legal import surface. Reaching for that member would return unrounded prices under a
   * method name promising rounded ones. `SalePriceResolver` is the narrow contract that closes the
   * gap without a fourteenth port and without importing anything this entity may not see.
   *
   * THE LEGACY LOCATOR CALL BECOMES AN INJECTED PORT CALL - transformation rule T2:
   *
   *     // Legacy [model/entity/Product.cfc:L519]:
   *     //   getService("promotionService")
   *     //     .getSalePriceDetailsForProductSkus(productID=getProductID())
   *     // Target:
   *     //   this.salePriceResolver.getSalePriceDetailsForProductSkus(this.productID)
   *
   * ASYNC BECAUSE THE REACH IS REAL. The legacy body reaches a service that reaches a DAO, so the
   * promise is honest rather than ceremonial; `getSkuSalePriceDetails` awaits it. The memo is
   * INSTANCE-SCOPED and instances are REQUEST-SCOPED, so [L518]'s component-level cache does not
   * become cross-invocation state on a warm container (AAP 0.6.5).
   *
   * NO SIGNATURE BUDGET IS SPENT. The name, the empty parameter list and the struct return are the
   * source's; only `struct` becomes a typed record, which is the folder-wide treatment.
   *
   * @returns The reduced, rounded detail map. A SKU with no qualifying sale-price reward simply has
   *   no key, and the map is empty when the product has none at all.
   * @throws When hydration supplied neither the pre-reduced map nor the resolver - the uniform
   *   refusal, because a defaulted empty map here would read as "this product is on no promotion".
   */
  public async getSalePriceDetailsForSkus(): Promise<CfStruct<SalePriceDetail>> {
    // [L518] `if(!structKeyExists(variables, "salePriceDetailsForSkus"))` - the memo probe, which in
    // the target is also the test of whether hydration pre-seeded the map.
    if (this.salePriceDetailsForSkus === undefined) {
      if (this.salePriceResolver === undefined) {
        throw this.missingCollaborator('sale-price resolver', 'L519');
      }
      // [L519] the T2 reach, memoized into the same slot the source memoizes into.
      this.salePriceDetailsForSkus = await this.salePriceResolver.getSalePriceDetailsForProductSkus(
        this.productID,
      );
    }
    // [L521] `return variables.salePriceDetailsForSkus;`
    return this.salePriceDetailsForSkus;
  }

  // ---------------------------------------------------------------------------
  // DELEGATING PRICE ACCESSORS [model/entity/Product.cfc:L555-L601]
  //
  // THE ELEVEN LAZY-LOAD PROBES. `structKeyExists(variables, "brand" | "defaultSku" | "price")`
  // appears eleven times in `Product.cfc`, and every one tests LAZY-LOAD STATE, not whether a value
  // exists. Eager materialization (structural decision #2) makes them statically true whenever
  // hydration supplied the association, so each becomes a `!== undefined` check. Each is annotated
  // at its own use site as `PROBE n OF 11`: [L527] `brand`, [L562] `price`, and [L556] [L565]
  // [L571] [L577] [L583] [L589] [L595] [L607] [L617] `defaultSku`. Three carry defects - [L527]
  // guards DEFECT 19, [L595] guards DEFECT 20, and [L617] is DEFECT 25.
  //
  // A twelfth family of `structKeyExists(variables, ...)` probes guards MEMO keys rather than
  // associations - [L242], [L252], [L498], [L518], [L525], [L541], [L605], [L615], [L625], [L636],
  // [L643], [L650], plus `isDefined("variables.templateOptions")` at [L172] - and belongs to the
  // three-way seed/guard pattern instead.
  //
  // WHICH HELPER IS CORRECT WHERE. `structKeyExists` from `../../lib/cfml/struct.js` returns true
  // EVEN WHEN THE VALUE IS `undefined`, so it is used where the legacy semantics turn on key
  // presence in a struct (`getSkuSalePriceDetails`); `!== undefined` where they turn on presence of
  // a value in an instance field, which is every probe above.
  // ---------------------------------------------------------------------------

  /**
   * The currency code of this product's default SKU, or nothing.
   *
   * [model/entity/Product.cfc:L555-L559]. PROBE 2 OF 11, no `else`.
   *
   * THIS METHOD READS NO SETTING - it delegates, full stop. The `skuCurrency` key and its
   * three-letter default are resolved one level down, in `Sku.getCurrencyCode()`
   * [model/entity/Sku.cfc:L360-L365]; the default itself is declared at
   * [model/service/SettingService.cfc:L221]. Reading the setting here would bypass the SKU's memo
   * and could disagree with the SKU's own answer.
   *
   * `string` where present, NOT the branded `CurrencyCode` - that is the SKU's decision, matched
   * rather than re-decided, which is why `../valueObjects/currencyCode.js` is not imported here.
   */
  public getCurrencyCode(): string | undefined {
    // [L556] lazy-load probe on `defaultSku`; statically true once hydration materialized it.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getCurrencyCode();
  }

  /**
   * This product's price - the override slot first, then the default SKU.
   *
   * [model/entity/Product.cfc:L561-L568]. TWO PROBES IN ONE BODY - PROBES 3 AND 4 OF 11 - AND THE
   * ORDER IS LOAD-BEARING. `variables.price` is NOT a persistent column of `SwProduct`; it is a
   * non-persistent override slot [L118] that a populate or a service can set, and when set IT WINS
   * OVER THE DEFAULT SKU. Reversing the probes, or collapsing them into one `??`, would make the
   * SKU's price win and change what a price-overridden product costs.
   *
   * `Money | undefined`, never `0`. Read live by the Google feed renderer, whose legacy guard is
   * `local.sku.getProduct().getPrice()` - the PRODUCT's price, not the SKU's - so a `0` substituted
   * here would surface in a published product feed.
   */
  public getPrice(): Money | undefined {
    // [L562] PROBE 3 OF 11 - the override slot. Checked FIRST, deliberately.
    if (this.price !== undefined) {
      return this.price;
    }
    // [L565] PROBE 4 OF 11 - the default SKU. `Sku.getPrice()` is `Money` (its column declares
    // `default="0"`), so the only source of `undefined` here is an unmaterialized default SKU.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getPrice();
  }

  /**
   * The default SKU's renewal price, or nothing.
   *
   * [model/entity/Product.cfc:L570-L574]. PROBE 5 OF 11, no `else`. NOTE THE ABSENCE OF A
   * `price`-STYLE OVERRIDE PROBE: `getPrice()` checks two slots, while this method,
   * `getListPrice()`, `getLivePrice()` and `getCurrentAccountPrice()` check exactly one each. The
   * asymmetry is the source's and no override slot is invented for symmetry.
   */
  public getRenewalPrice(): Money | undefined {
    // [L571] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getRenewalPrice();
  }

  /**
   * The default SKU's list price, or nothing.
   *
   * [model/entity/Product.cfc:L576-L580]. PROBE 6 OF 11.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L577]: a whitespace wart, recorded because a reviewer
   * diffing the cluster will notice it - [L577] writes `structKeyExists(variables,"defaultSku")`
   * with no space after the comma while [L556], [L565] and [L571] all write one. Purely cosmetic,
   * and not normalised.
   */
  public getListPrice(): Money | undefined {
    // [L577] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getListPrice();
  }

  /**
   * The default SKU's live price, or nothing.
   *
   * [model/entity/Product.cfc:L582-L586]. PROBE 7 OF 11.
   *
   * `async`, because `Sku.getLivePrice()` is async - it resolves through the price-group path. The
   * asynchrony is INHERITED FROM THE DELEGATE: this body performs no reach of its own, but it
   * cannot be more synchronous than the thing it delegates to.
   */
  public async getLivePrice(): Promise<Money | undefined> {
    // [L583] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getLivePrice();
  }

  /**
   * The default SKU's price for the requesting account, or nothing.
   *
   * [model/entity/Product.cfc:L588-L592]. PROBE 8 OF 11. `async`, inherited from
   * `Sku.getCurrentAccountPrice()`.
   *
   * THE AMBIENT REQUEST SCOPE IS GONE (T6), AND THE CONTEXT IS THREADED BY THE DELEGATE. The legacy
   * chain ends in `PriceGroupService.calculateSkuPriceBasedOnCurrentAccount`
   * [model/service/PriceGroupService.cfc:L262-L268], which reaches the request scope through
   * `getSlatwallScope()` - THE ONE ANOMALOUS SCOPE ACCESSOR IN THE CODEBASE, where every other site
   * uses `getHibachiScope()`. An explicit context parameter normalises it away, and that parameter
   * is held by `Sku`, so THIS signature gains none.
   */
  public async getCurrentAccountPrice(): Promise<Money | undefined> {
    // [L589] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getCurrentAccountPrice();
  }

  // ===========================================================================
  // THE DEFECT CLUSTER
  //
  //   DEFECT 19  getBrandName()                      FIXED - the third and FINAL divergence
  //   DEFECT 20  getSalePrice()                       PRESERVED - returns 0, never undefined
  //   DEFECT 25  getSalePriceExpirationDateTime()     PRESERVED AS A THROW
  //
  // Plus two methods preserved as throwing that carry no defect number, and one memo variant that
  // exists only to be contrasted with DEFECT 19. NO OTHER DEFECT IN THIS FILE MAY BE REPAIRED.
  // ===========================================================================

  /**
   * DEFECT 19 - FIXED. DELIBERATE DIVERGENCE [model/entity/Product.cfc:L524-L532] - the third and
   * final one of the entire project.
   *
   * [model/entity/Product.cfc:L524-L532] seeds `variables.brandName` to `""` at [L526], then at
   * [L528] writes `return getBrand().getBrandName();` - computing the value and returning it
   * WITHOUT assigning it. The memo therefore stays `""`, and every call after the first returns the
   * empty string. The assignment is added here, so the shared return at [L531] answers correctly on
   * every call rather than only the first.
   *
   * WHY THIS ONE IS REPAIRED AND DEFECT 20 IS NOT: the defect is a POISONED MEMO, not a different
   * answer. The first call is already correct, and the port makes every later call agree with it,
   * so nothing observable through the public contract changes value. The memo is instance-scoped
   * and instances are request-scoped, so reproducing the poisoning would preserve a mechanism while
   * losing the meaning. `getTitle()` [L540-L546] CONSUMES this value through the
   * `productTitleString` template, so with the memo fixed it would keep the brand in the title on
   * repeat calls; it is omitted here for an unrelated reason (see the OMISSION REGISTER).
   *
   * THIS SPENDS THE LAST DIVERGENCE IN THE ENTIRE PROJECT. The three are (a) the un-`var`'d
   * `discountAmount` [model/service/PromotionService.cfc:L1007, L1009]; (b) the `amountOff` float
   * gap [model/service/PromotionService.cfc:L998]; (c) DEFECTS 17, 18 and 19 - the entity memo
   * bugs, two in `sku.ts` and this one. NO FOURTH DIVERGENCE MAY EVER BE SPENT ANYWHERE.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L524-L532]: `getBrandName()` seeds its memo to `""` at
   * [L526] and then returns the computed brand name at [L528] without assigning it, so the memo
   * stays `""` and every call after the first returns the empty string. Fixed deliberately as
   * documented divergence (c); do not extend this treatment to any other defect.
   *
   * MEMO VARIANT A (seed then guard), and the ONLY variant-A member here whose seed was reachable
   * through a bug rather than by design.
   */
  public getBrandName(): string {
    // [L525] the memo guard. This is a MEMO probe, not one of the eleven lazy-load probes.
    if (this.brandName === undefined) {
      // [L526] the seed. It survives when the brand is absent, which is legitimate and preserved.
      this.brandName = '';
      // [L527] PROBE 1 OF 11 - lazy-load probe on `brand`; statically true once hydration
      // materialized the eager `fetch="join"` association at [L68].
      if (this.brand !== undefined) {
        // THE FIX. [L528] reads `return getBrand().getBrandName();` - computing the value and
        // returning it WITHOUT the assignment. The assignment is added here, and the shared return
        // at [L531] then answers correctly on every call rather than only the first.
        this.brandName = this.brand.getBrandName() ?? '';
      }
    }
    // [L531]
    return this.brandName;
  }

  /**
   * DEFECT 20 - PRESERVED. THIS METHOD MUST RETURN `0`, NEVER `undefined`.
   *
   * [model/entity/Product.cfc:L594-L601]. LOOK AT [L598]: `getSkus()[1].getSalePrice();` IS A BARE
   * STATEMENT WITH NO `return`. The call is made, the result computed, and it is DISCARDED - after
   * which execution falls through to the terminal `return 0` at [L600]. So a product with SKUs but
   * NO default SKU reports a sale price of ZERO whatever its first SKU's sale price actually is.
   *
   * RULING: PRESERVE THE FALL-THROUGH EXACTLY, INCLUDING THE DISCARDED CALL. Evaluating it is
   * OBSERVABLE - `Sku.getSalePrice()` reads the pre-materialized detail row and falls back to
   * `getPrice()`, and the call could throw from deeper in the delegate, which a port that skipped
   * it would swallow. This is the exact OPPOSITE of `Sku.getPriceByCurrencyCode()`; see the class
   * doc.
   *
   * WHY `Money.fromDecimalString('0')` AND NOT `Money.zero`: that constant carries an explicit
   * prohibition on its own declaration, existing only for the two promotion accumulator seeds at
   * [model/service/PromotionService.cfc:L988-L989]. The zero here is the source's own literal
   * `return 0` at [L600], but reaching for a reserved constant would blur the line it exists to
   * draw.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L598]: `getSkus()[1].getSalePrice();` has no `return`,
   * so a product with SKUs but no default SKU falls through to the terminal `return 0` at [L600]
   * and reports a sale price of zero regardless of its first SKU's actual sale price.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  public getSalePrice(): Money {
    // [L595] PROBE 9 OF 11 - lazy-load probe on `defaultSku`.
    if (this.defaultSku !== undefined) {
      // [L596] the only arm that returns a real sale price. `Sku.getSalePrice()` is `Money`, never
      // undefined, because it falls back to `getPrice()` whose column declares `default="0"`.
      return this.defaultSku.getSalePrice();
    }

    // [L597] `else if (arrayLen(getSkus()))` - CFML numeric truthiness on an array length, so a
    // non-empty array enters the branch. `cfTruthy` reproduces that rather than relying on
    // JavaScript coercion agreeing by coincidence.
    const ownSkus: Sku[] = this.getSkus();
    if (cfTruthy(ownSkus.length)) {
      const firstSku = ownSkus[0];
      if (firstSku !== undefined) {
        // [L598] THE DISCARDED CALL. Evaluated for its observable effects and its result thrown
        // away, exactly as the source does. `void` states the discard explicitly so that no reader,
        // and no linter, mistakes it for a missing `return` introduced by the port.
        void firstSku.getSalePrice();
      }
    }

    // [L600] the terminal zero - reached by BOTH the no-default-sku-with-skus path and the
    // nothing-at-all path.
    return Money.fromDecimalString('0');
  }

  /**
   * The discount type behind this product's sale price, or the string `"none"`.
   *
   * [model/entity/Product.cfc:L604-L612]. MEMO VARIANT A (seed THEN guard), AND THE CONTROL CASE
   * FOR DEFECT 19: this is the same shape as `getBrandName()` and it ASSIGNS at [L608] instead of
   * returning past the memo, which is what makes the other one a defect rather than a convention.
   * No fix is needed or permitted here.
   *
   * `"none"` IS THE PRODUCT-LEVEL STAND-IN, AND IT DIFFERS FROM THE SKU-LEVEL ONE. This method
   * substitutes `"none"` [L606] while `Sku.getSalePriceDiscountType()` substitutes the EMPTY STRING
   * [model/entity/Sku.cfc:L557]. `../ports/promotionRepository.js` records the divergence on
   * `SalePriceDetail.salePriceDiscountType` and deliberately does NOT encode either stand-in as a
   * union member, because neither is a value the projection can ever carry. So this returns a plain
   * `string`, not the three-member union.
   */
  public getSalePriceDiscountType(): string {
    // [L605] memo guard.
    if (this.salePriceDiscountType === undefined) {
      // [L606] the seed, which survives a missing default SKU.
      this.salePriceDiscountType = 'none';
      // [L607] PROBE 10 OF 11 - lazy-load probe on `defaultSku`.
      if (this.defaultSku !== undefined) {
        // [L608] THE ASSIGNMENT DEFECT 19 IS MISSING.
        this.salePriceDiscountType = this.defaultSku.getSalePriceDiscountType();
      }
    }
    // [L611]
    return this.salePriceDiscountType;
  }

  /**
   * DEFECT 25 - PRESERVED AS A THROW. DUAL-MODE IN CFML, SINGLE-MODE IN THE PORT.
   *
   * [model/entity/Product.cfc:L614-L622]. A NAMING PRECISION POINT: THE DECLARATION AT [L614] IS
   * SPELLED CORRECTLY, `getSalePriceExpirationDateTime`. THE TYPO IS AT THE CALL SITE IN THE BODY,
   * AT [L618], WHICH CALLS `getSalePricExpirationDateTime` ON THE DELEGATE - missing the `e` in
   * `Price`. The method is authored under the declaration's correct spelling and the misspelled
   * call is preserved; neither is renamed.
   *
   * WHY THE PORT ALWAYS TAKES THE FAILING ARM. [L617] guards on
   *   `structKeyExists(variables, "defaultSku")`,
   * in CFML a LAZY-LOAD STATE probe with two outcomes: unloaded, and the seeded `now()` from [L616]
   * is returned; loaded, and the computation at [L618] runs. THIS IS PROBE 11 OF 11 AND THE
   * MONEY-CRITICAL ONE. Eager materialization makes the port ALWAYS take the second arm, which
   * fails twice over. MECHANISM 1, THE MISSING METHOD: `getSalePricExpirationDateTime` does not
   * exist on `Sku` ([model/entity/Sku.cfc:L560] declares the correct name), so the call falls into
   * `onMissingMethod` [org/Hibachi/HibachiEntity.cfc:L507-L565], matches no property, reaches the
   * `getAttributeValue` fallback at [L559] and terminates at the [L565] throw. MECHANISM 2, THE
   * RETURN-TYPE COERCION BOUNDARY: [L614] declares `returntype="date"`, which the dispatcher's
   * fallback cannot produce even if mechanism 1 yielded a value. The one behaviour lost is the
   * unloaded arm's seeded `now()`, which would have meant "already expiring" rather than a real
   * expiry.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L614]: `getSalePriceExpirationDateTime()` is declared
   * `returntype="date"` and, at [L617], guards on lazy-load state; with eager materialization the
   * guard is always true, so the port always reaches [L618], which calls the MISSPELLED
   * `getSalePricExpirationDateTime` - absent from `Sku`, whose correct spelling is at
   * [model/entity/Sku.cfc:L560] - reaching [org/Hibachi/HibachiEntity.cfc:L559] and throwing at
   * [L565], and which could not satisfy the `date` coercion in any case.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  public getSalePriceExpirationDateTime(): never {
    throw new Error(
      `Product '${this.productID}': getSalePriceExpirationDateTime() cannot return. ` +
        `[model/entity/Product.cfc:L617] guards on lazy-load state, which eager materialization ` +
        `makes always true, so [model/entity/Product.cfc:L618] is always reached - and it calls the ` +
        `MISSPELLED getSalePricExpirationDateTime (no "e" in "Price"), which Sku does not declare; ` +
        `its correct spelling is at [model/entity/Sku.cfc:L560]. In CFML that call reaches the ` +
        `onMissingMethod dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565], matches ` +
        `get<Prop> against a nonexistent property, falls through to the getAttributeValue fallback ` +
        `at [L559] and throws at [L565]; and the returntype="date" coercion declared at ` +
        `[model/entity/Product.cfc:L614] could not be satisfied by that fallback either. This ` +
        `throw reproduces the arm the port always takes; it is not a stub awaiting implementation.`,
    );
  }

  /**
   * PRESERVED AS THROWING - the legacy body calls an undefined function.
   *
   * [model/entity/Product.cfc:L631-L633] returns
   *   `getProductService().getProductOptionsByGroup( this )`,
   * and `getProductService()` IS NOT A METHOD. Every other outward reach in this component goes
   * through `getService("...")`; `getProductService()` appears exactly once, here. It is not
   * declared on `Product.cfc`, not on `model/entity/HibachiEntity.cfc`, and not among the
   * generated-accessor patterns, so the call falls into `onMissingMethod`
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], matches the `get<Prop>` shape against a nonexistent
   * `ProductService` property, continues to the `getAttributeValue` fallback at [L559] and throws
   * at [L565]. `ProductService` declares NO `getProductOptionsByGroup` either, so the intended
   * target does not exist. Two independent reasons this can never work.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L631-L633]: `getProductOptionsByGroup()` calls
   * `getProductService()`, which is not a method on this component or its bases, so the call
   * reaches [org/Hibachi/HibachiEntity.cfc:L559] and throws at [L565]; `ProductService` declares no
   * `getProductOptionsByGroup` either.
   *
   * Preserved deliberately; do not fix without a product decision.
   */
  public getProductOptionsByGroup(): never {
    throw new Error(
      `Product '${this.productID}': getProductOptionsByGroup() cannot return. ` +
        `[model/entity/Product.cfc:L632] calls getProductService(), which is not declared on the ` +
        `component, on model/entity/HibachiEntity.cfc, or as a generated accessor - every other ` +
        `outward reach in the component uses getService("..."). In CFML the call reaches the ` +
        `onMissingMethod dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565], matches get<Prop> ` +
        `against a nonexistent ProductService property, falls through to the getAttributeValue ` +
        `fallback at [L559] and throws at [L565]. ProductService declares no ` +
        `getProductOptionsByGroup method either, so the intended target does not exist. This throw ` +
        `is the faithful port, not a stub awaiting implementation.`,
    );
  }

  // ===========================================================================
  // THE UNUSED-* TRIO - A LIVE VALIDATION PATH [model/entity/Product.cfc:L635-L654]
  //
  // `model/validation/Product.json` requires all three with `minCollection:1`:
  //
  //   "unusedProductOptions":           [{"contexts":"addOption",         "minCollection":1}]
  //   "unusedProductOptionGroups":      [{"contexts":"addOptionGroup",    "minCollection":1}]
  //   "unusedProductSubscriptionTerms": [{"contexts":"addSubscriptionTerm","minCollection":1}]
  //
  // So none may be omitted, even though the third serves an out-of-scope subsystem: a validation
  // rule pointing at an absent accessor is a broken contract, not a tidy one.
  //
  // ALL THREE PASS THE OPTION-GROUP IDS AS A COMMA-DELIMITED STRING, built with `listAppend` rather
  // than `Array.join` for the reason recorded on `getCategoryIDs()`: the helper emits NO LEADING
  // DELIMITER ON AN EMPTY LIST by contract, and a leading comma would reach the DAO as an empty
  // first element.
  // ===========================================================================

  /**
   * The option-group id list the unused-* queries filter against. Reproduces
   * `structKeyList(getOptionGroupsStruct())` as it appears at [L637] and [L644].
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L637, L644]: CFML STRUCT KEY ORDER IS UNORDERED while
   * `Object.keys` returns insertion order, so the two implementations can emit the SAME ids in a
   * DIFFERENT sequence. Not observable: both `OptionDAO.getUnusedProductOptions`
   * [model/dao/OptionDAO.cfc:L51] and `getUnusedProductOptionGroups` [L94] consume the parameter as
   * a SET - an `IN`-list membership test - where order carries no meaning. Recorded rather than
   * stabilised, because imposing a sort would invent an ordering the source never promised.
   */
  private buildExistingOptionGroupIDList(): string {
    let existingOptionGroupIDList = '';
    for (const optionGroupID of structKeyList(this.getOptionGroupsStruct())) {
      existingOptionGroupIDList = listAppend(existingOptionGroupIDList, optionGroupID);
    }
    return existingOptionGroupIDList;
  }

  /**
   * Options not yet used by this product, for the `addOption` form.
   * [model/entity/Product.cfc:L635-L640]. MEMO VARIANT C (no seed, no guard) behind a memo probe.
   * `async`, because [L637] reaches the option repository.
   *
   * TWO POSITIONAL ARGUMENTS, IN THE LEGACY ORDER: the product id first, the option-group id list
   * second, exactly as
   *   `OptionRepository.getUnusedProductOptions(productID, existingOptionGroupIDList)`
   * declares. Swapping them would compile and silently return the wrong rows. THE RETURN IS
   * `readonly SelectOption[]`, NOT `Option[]`, BECAUSE THAT IS THE PORT'S CONTRACT -
   * [model/dao/OptionDAO.cfc:L51] returns name/value pairs for a select control, not hydrated
   * entities.
   */
  public async getUnusedProductOptions(): Promise<readonly SelectOption[]> {
    // [L636] memo probe. VARIANT C: no seed to fall back on, so a failed reach must raise rather
    // than answer an empty array - `minCollection:1` would otherwise fail for the wrong reason.
    if (this.unusedProductOptions === undefined) {
      if (this.optionRepository === undefined) {
        throw this.missingCollaborator('option repository', 'L637');
      }
      // [L637] - two positional arguments, legacy order preserved.
      this.unusedProductOptions = await this.optionRepository.getUnusedProductOptions(
        this.productID,
        this.buildExistingOptionGroupIDList(),
      );
    }
    // [L639]
    return this.unusedProductOptions;
  }

  /**
   * Option groups not yet used by this product, for the `addOptionGroup` form.
   * [model/entity/Product.cfc:L642-L647]. MEMO VARIANT C. `async`.
   *
   * ONE ARGUMENT, NOT TWO - the asymmetry between the two sibling methods. [L637] passes the
   * product id AND the group list; [L644] passes ONLY the group list, and the DAO signatures match
   * ([model/dao/OptionDAO.cfc:L51] takes two, [L94] takes one), so a product id must NOT be added
   * here for symmetry. The consequence is real: unused option GROUPS are computed globally, not per
   * product. `readonly SelectOption[]` because that is what `../ports/optionRepository.js`
   * declares.
   */
  public async getUnusedProductOptionGroups(): Promise<readonly SelectOption[]> {
    // [L643] memo probe. VARIANT C.
    if (this.unusedProductOptionGroups === undefined) {
      if (this.optionRepository === undefined) {
        throw this.missingCollaborator('option repository', 'L644');
      }
      // [L644] - ONE argument.
      this.unusedProductOptionGroups = await this.optionRepository.getUnusedProductOptionGroups(
        this.buildExistingOptionGroupIDList(),
      );
    }
    // [L646]
    return this.unusedProductOptionGroups;
  }

  /**
   * Subscription terms not yet used by this product, for the `addSubscriptionTerm` form.
   * [model/entity/Product.cfc:L649-L654].
   *
   * AUTHORED, AND IT REFUSES. `../ports/subscriptionTermProvider.js` declares EXACTLY TWO members -
   * `getSubscriptionTerm` and `getSubscriptionBenefit` - and its own module documentation lists
   * `getUnusedProductSubscriptionTerms` as deliberately not declared, so there is no member to pass
   * through to and none may be invented. Omitting the accessor is equally illegal, because
   * `model/validation/Product.json` requires `unusedProductSubscriptionTerms` with
   * `minCollection:1`. Authoring it and refusing with an accurate message is the only legal option:
   * a caller in the `addSubscriptionTerm` context learns which boundary it crossed rather than
   * receiving an empty array that would fail `minCollection:1` and suggest the product genuinely
   * has no unused terms. `async` for signature parity with its two siblings.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L649-L654]: subscription is out of scope. This is an
   * out-of-scope branch reachable from an in-scope file - the same category as
   * `processProduct_addSubscriptionTerm` [model/service/ProductService.cfc:L173] and the
   * subscription/contentAccess SKU-creation arms [model/service/SkuService.cfc:L139-L202].
   */
  public async getUnusedProductSubscriptionTerms(): Promise<never> {
    // THE `async` KEYWORD IS LOAD-BEARING HERE, AND THE `await` IS WHAT KEEPS IT LEGAL - the
    // OPPOSITE treatment from `getSkuSalePriceDetails` above, deliberately. An `async` function
    // that throws produces a REJECTED PROMISE while a plain function that throws throws
    // SYNCHRONOUSLY, and only the first is catchable by the `.catch()` / `await`-in-`try` shape its
    // two siblings require. The `await` on an already-settled promise satisfies `require-await` by
    // making the asynchrony genuine rather than by suppressing the rule.
    await Promise.resolve();
    throw new Error(
      `Product '${this.productID}': getUnusedProductSubscriptionTerms() is not available in this ` +
        `slice. [model/entity/Product.cfc:L651] reaches ` +
        `subscriptionService.getUnusedProductSubscriptionTerms(productID), and subscription is out ` +
        `of scope: ../ports/subscriptionTermProvider.js declares only getSubscriptionTerm and ` +
        `getSubscriptionBenefit and documents this method as deliberately not declared, so there is ` +
        `no port member to delegate to and none may be invented. The accessor exists because ` +
        `model/validation/Product.json requires unusedProductSubscriptionTerms with ` +
        `minCollection:1 in the addSubscriptionTerm context; it refuses rather than returning an ` +
        `empty array, which would fail that rule for the wrong reason. ` +
        `A subscription term provider was ` +
        `${this.subscriptionTermProvider === undefined ? 'not wired' : 'wired'} on this instance.`,
    );
  }

  // ===========================================================================
  // REMAINING OUTWARD REACHES
  // ===========================================================================

  /**
   * Whether any transaction already references one of this product's SKUs.
   * [model/entity/Product.cfc:L624-L629].
   *
   * MEMO VARIANT C - NO SEED AND NO GUARD: one unconditional computation behind a single memo
   * probe, with nothing to fall back on, so it must raise rather than default when the port is
   * missing.
   *
   * AND `false` IS PRECISELY THE DANGEROUS DEFAULT HERE. `model/validation/Product.json` declares
   * `"transactionExistsFlag": [{"contexts":"delete","eq":false}]` - deletion is permitted ONLY when
   * this answers `false` - so a defaulted `false` would authorise deleting a product that
   * transactions already reference. This is the ONE delete-context rule in that schema this entity
   * participates in.
   *
   * `async`, reaching `SkuRepository.getTransactionExistsFlag(productID?, skuID?)`, the port member
   * declared for [model/dao/SkuDAO.cfc:L53]. The legacy passes ONLY `productID` as a named
   * argument, so `skuID` is left absent rather than passed as `''`.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L626]: the legacy writes `this.getProductID()` with an
   * explicit `this.` scope where the surrounding methods write the bare `getProductID()`, as do
   * [L256] and [L344]. Both resolve identically in CFML. Recorded, not normalised.
   */
  public async getTransactionExistsFlag(): Promise<boolean> {
    // [L625] memo probe. VARIANT C.
    if (this.transactionExistsFlag === undefined) {
      if (this.skuRepository === undefined) {
        throw this.missingCollaborator('sku repository', 'L626');
      }
      // [L626] - `productID` only; `skuID` deliberately not supplied.
      this.transactionExistsFlag = await this.skuRepository.getTransactionExistsFlag(
        this.productID,
      );
    }
    // [L628]
    return this.transactionExistsFlag;
  }

  /**
   * This product's base product type - the root of its product-type path.
   * [model/entity/Product.cfc:L493-L495].
   *
   * `async`, INHERITED FROM THE DELEGATE. `ProductType.getBaseProductType()` in
   * src/domain/entities/productType.ts is `async`, because [model/entity/ProductType.cfc:L112]
   * resolves the ROOT of `productTypeIDPath` through
   * `getService("ProductService").getProductType(listFirst(getProductTypeIDPath()))` - a genuine
   * load of a DIFFERENT row - before reading its system code, and src/domain/entities/sku.ts awaits
   * this.
   *
   * THIS SITS ON A LIVE VALIDATION PATH. `model/validation/Product.json` gates `baseProductType`
   * with `inList` over `merchandise` and `subscription`, so what this returns decides whether a
   * product validates. `string | undefined` is therefore correct rather than convenient: the root
   * product type may legitimately carry no system code, and `undefined` fails the `inList` rule
   * honestly where a fabricated `"merchandise"` would pass it falsely.
   *
   * THE LEGACY DEREFERENCES [L494] UNCONDITIONALLY - no `isNull` guard, no `structKeyExists` probe
   * - so a product with no product type raises there. Reproduced as a raise.
   */
  public async getBaseProductType(): Promise<string | undefined> {
    if (this.productType === undefined) {
      throw new Error(
        `Product '${this.productID}': getBaseProductType() requires the product type, which ` +
          `[model/entity/Product.cfc:L494] dereferences unconditionally.`,
      );
    }
    return this.productType.getBaseProductType();
  }

  /**
   * Attribute sets assigned to this product, optionally narrowed by attribute-set type code.
   * [model/entity/Product.cfc:L832-L838], inside the `Deprecated Methods` section [L830]-[L840].
   *
   * THIS IS THE ONE PORTED ROUTE INTO THE ATTRIBUTE SUBSYSTEM; the `attributeValues` EAV read path
   * is not ported (see the OMISSION REGISTER). `async`, reaching
   * `ProductRepository.getAttributeSets(attributeSetTypeCode, productTypeIDs)`, the member declared
   * for [model/dao/ProductDAO.cfc:L52]. The `array attributeSetTypeCode=[]` default at [L832] is
   * reproduced.
   *
   * THE ARGUMENT IS A TRIGGER, NOT A FILTER VALUE. At [L834] `arguments.attributeSetTypeCode` is
   * tested for membership and then NEVER PASSED ANYWHERE. The value actually filtered on is the
   * literal `'astProduct'` fixed at [L801], plus `'astOrderItem'` conditionally added at [L835].
   *
   * `arrayFind` USED AS A BOOLEAN IS THE INDEX-BASE TRAP, LIVE ON THIS LINE: CFML returns a 1-BASED
   * index or 0 and `||` over it works because 0 is falsy, whereas `findIndex` returns 0-BASED or -1
   * and BOTH ARE TRUTHY. `includes()` is used instead.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L833-L836]: THE CONDITIONAL FILTER WORKS ONLY BY ACCIDENT
   * OF MEMOIZATION. [L833] captures the smart list into `smartList`, then [L835] calls
   * `getAssignedAttributeSetSmartList()` AGAIN to add the filter rather than using the local;
   * because that accessor memoizes into `variables.assignedAttributeSetSmartList` [L796], both
   * expressions denote the SAME object and the filter does reach the list [L837] returns.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L807-L818]: A FIDELITY GAP THAT CANNOT BE CLOSED FROM
   * HERE. The omitted `getAssignedAttributeSetSmartList()` builds a four-disjunct `WHERE`:
   * `globalFlag = 1` OR product-type id IN the `productTypeIDPath` OR `productID = <this product>`
   * OR `brandID = <this brand>`. The declared port member accepts `attributeSetTypeCode` and
   * `productTypeIDs` ONLY, so the PRODUCT-ID and BRAND-ID disjuncts are NOT expressible and such an
   * attribute set will be ABSENT. The legacy `WHERE` also interpolates those ids directly into
   * statement text [L810, L812, L814]; the port binds every value as a parameter.
   */
  public async getAttributeSets(
    attributeSetTypeCode: readonly string[] = [],
  ): Promise<AttributeSetSummary[]> {
    if (this.productRepository === undefined) {
      throw this.missingCollaborator('product repository', 'L833');
    }

    // [L801] the fixed base filter, then [L834-L836] the conditional addition. `includes` rather
    // than an index test - see the index-base note above.
    const effectiveTypeCodes: string[] = ['astProduct'];
    if (
      attributeSetTypeCode.includes('astProductCustomization') ||
      attributeSetTypeCode.includes('astOrderItem')
    ) {
      effectiveTypeCodes.push('astOrderItem');
    }

    // [L810] the product-type disjunct: `productTypeIDPath` split on commas. Empty when this
    // product has no product type, which the port documents as meaning "global sets only" rather
    // than "no filter" - matching [L808], where `globalFlag = 1` is the disjunct that always
    // applies.
    const productTypeIDs: readonly string[] =
      this.productType === undefined ? [] : listToArray(this.productType.getProductTypeIDPath());

    // [L837] `return smartList.getRecords();`
    return this.productRepository.getAttributeSets(effectiveTypeCodes, productTypeIDs);
  }

  // ===========================================================================
  // THE OMISSION REGISTER
  //
  // Every method declared in `model/entity/Product.cfc` that is deliberately NOT authored above,
  // with its locator and reason. "OMIT" means the member is not authored here; it never means a
  // legacy file was altered - `model/**` is reference-only.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 1 - IMAGE AND ASSET PATHS.  NINE MEMBERS.
  //
  //   getImages()                    [L178-L180]   returns `variables.productImages`
  //   getAlternateImageDirectory()   [L223-L225]   reads `globalAssetsImageFolderPath`
  //   getImageGalleryArray(...)      [L267-L319]   ~53 lines, default sizes s/m/l
  //   getImageDirectory()            [L320-L323]
  //   getImagePath()                 [L324-L327]
  //   getImage()                     [L328-L331]
  //   getResizedImagePath()          [L332-L335]
  //   getImageExistsFlag()           [L336-L338]   `getDefaultSku().getImageExistsFlag()`
  //   getDefaultProductImageFiles()  [L497-L515]   `getService` at [L501], a sku smart list
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L178-L180, L223-L225, L267-L339, L497-L515]: the image path
  // requires `globalAssetsImageFolderPath` [model/service/SettingService.cfc:L164], which is NOT one
  // of the seven keys published by ../ports/settingsProvider.js - and `imageStore` is a STUB port
  // for out-of-scope branches only. This is the same reasoning that omitted `Option.getImageDirectory()`
  // [model/entity/Option.cfc:L81-L83] and the whole of `Sku`'s image path, and the annotation wording
  // is matched to src/domain/entities/sku.ts so the two largest entities read consistently.
  // `getDefaultProductImageFiles()` additionally reaches a `HibachiSmartList`, which is not cloned
  // (AAP 0.6.2). Note that `Sku.getImageExistsFlag()` is itself authored as a refusing stub in
  // src/domain/entities/sku.ts, so [L337]'s delegation would have refused anyway.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 2 - STOCK AND INVENTORY.  FIVE MEMBERS.
  //
  //   getEstimatedReceivalDetails()   [L399-L405]   `getService` at [L401]
  //   getEstimatedReceivalDates(...)  [L406-L434]
  //   getQuantity(type, skuID, locationID, stockID)  [L435-L492]  ~58 lines, THE LARGEST METHOD
  //                                   IN THE COMPONENT, `getService` at [L441] AND [L443]
  //   getQATS()                       [L547-L549]   `return getQuantity("QATS");`
  //   getAllowBackorderFlag()         [L551-L553]   reads `skuAllowBackorderFlag`
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L399-L492, L547-L553]: `Stock`, `Location` and every
  // inventory entity are out of scope, and `skuAllowBackorderFlag` [model/service/SettingService.cfc:L219]
  // is not one of the seven keys ../ports/settingsProvider.js declares - it is explicitly excluded from
  // that union. The persisted snapshots `calculatedQATS` [L63] and
  // `calculatedAllowBackorderFlag` [L64] ARE preserved and readable, so the schema contract is
  // intact; only the RECOMPUTATION is out of scope. `getQuantity` also holds the only three
  // `listFindNoCase` uses [L440, L442, L451], which is why that helper is not imported here.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 3 - CMS, PAGES AND TEMPLATES.  FOUR MEMBERS.
  //
  //   getListingPagesOptionsSmartList()  [L146-L153]  `getService("contentService")` at [L148]
  //   getTemplateOptions()               [L171-L176]  `getService("ProductService")` at [L173],
  //                                                   guarded by `isDefined` - the ONLY one
  //   getTemplate()                      [L215-L221]  `setting('productDisplayTemplate')`
  //   getCrumbData(path, siteID, baseCrumbArray)      [L370-L398]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L146-L153, L171-L176, L215-L221, L370-L398]: the Mura CMS
  // bridge is out of scope, `Content` and `Template` are not among the eighteen entities,
  // `productDisplayTemplate` is not one of the seven `SettingKey` members, and two of the four
  // build a `HibachiSmartList`. Schema continuity is unaffected: `Category.cmsCategoryID` (index
  // `RI_CMSCATEGORYID`) and its `site` association survive as inert persisted columns in
  // src/domain/entities/category.ts.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 4 - PRODUCT REVIEWS.  ONE MEMBER.  getProductRating()  [L227-L239]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L227-L239]: `ProductReview` is not one of the eighteen
  // in-scope entities, so `getProductReviews()` has nothing to return. The `singlularname` typo on
  // the [L76] property declaration is still preserved as metadata - omitting the METHOD does not
  // omit the COLUMN METADATA. The omitted body carries two defects of its own, recorded so nobody
  // "restores" it believing it worked: [L233] reads `var totalRatingPoints += ...`, an invalid
  // `var` declaration fused to a compound assignment that re-declares [L228]; and the same line
  // indexes `getProductReviews()[1]` inside a loop over `i`, summing the FIRST review N times.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 5 - FRAMEWORK PROPERTY-OPTION AND SMART-LIST HELPERS.  THREE MEMBERS.
  //
  //   getProductTypeOptions(baseProductType)  [L125-L144]  `getPropertyOptionsSmartList` [L131],
  //                                                        `getService('productService')` [L132]
  //   getBrandOptions()                       [L534-L538]  `getPropertyOptions("brand")` [L535]
  //   getAssignedAttributeSetSmartList()      [L795-L822]  ~27 lines, `getService` at [L798]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L125-L144, L534-L538, L795-L822]: `getPropertyOptions`
  // and `getPropertyOptionsSmartList` are metadata-driven framework dispatch on
  // org/Hibachi/HibachiEntity.cfc, a boundary to extract from and never modify. The third also
  // fails on the non-ported `attributeValues` EAV path; its filter and `WHERE` semantics are
  // transcribed onto `getAttributeSets()` above. `getBrandOptions()` reads `rbKey('define.none')`
  // [L536], preserved as an inert constant in `ProductLegacyMetadata` because JavaRB is not ported.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 6 - THE PRODUCT TITLE.  ONE MEMBER.  getTitle()  [L540-L545]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L540-L545]: `getTitle()` reads
  // `setting('productTitleString')` - declared at [model/service/SettingService.cfc:L193] - and
  // hands it to `hibachiUtilityService.replaceStringTemplate(...)` via `getService` at [L542]. ONE
  // boundary blocks it, and it is NOT a settings boundary: `productTitleString` IS one of the seven
  // keys ../ports/settingsProvider.js declares - the fifth of them - and this entity holds the
  // provider that resolves it, exactly as the class header records. What is missing is the
  // RENDERER: `replaceStringTemplate` is an unported Hibachi utility, so the `${...}` markers in
  // the value have nothing to resolve them. The default template text is deliberately NOT quoted
  // here and NOT carried in `ProductLegacyMetadata`. The persisted snapshot `calculatedTitle` [L65]
  // IS preserved.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 7 - NOTHING IS OMITTED HERE.  `getSalePriceDetailsForSkus()` IS PORTED, under §3.9
  // branch (a).  [L517-L522], `getService` at [L519].
  //
  // This cluster is retained rather than deleted because the register is an audit of the decision
  // procedure, and the procedure was RUN for this member: read ../ports/promotionRepository.js, take
  // branch (a) if a member there can serve `getSalePriceDetailsForProductSkus`
  // [model/service/PromotionService.cfc:L1022], take branch (b) and omit if none can. The port
  // exports `SalePriceResolver` declaring exactly that one method, so BRANCH (a) APPLIES and the
  // member is authored above with `salePriceResolver` as an injected collaborator.
  //
  // The half of the argument that still holds, and that branch (a) does NOT overturn:
  // `PromotionRepository.getSalePricePromotionRewardsQuery(productID?)` cannot serve it. That member
  // is the port for [model/dao/PromotionDAO.cfc:L298] - the raw six-branch UNION - and it returns
  // UNREDUCED, UNROUNDED rows, whereas the SERVICE method reduces that result AND APPLIES THE
  // ROUNDING RULE at [model/service/PromotionService.cfc:L1024-L1028], which an entity cannot do
  // because `roundingRuleService` lives outside this file's legal import surface. Calling that
  // raw-query member here would return UNROUNDED prices under a method name promising rounded ones -
  // a money bug dressed as a port call. `SalePriceResolver` is a DIFFERENT contract on the same
  // module: one method, already-rounded output, satisfied in src/handlers/bootstrap.ts by adapting
  // src/services/promotionService.ts, which is the tier that owns the rounding step. So branch (a)
  // is reached without a fourteenth port and without this file importing anything it may not see.
  //
  // Its one in-scope consumer, `getSkuSalePriceDetails(skuID)` [L182-L187], delegates to it - and
  // still answers from the pre-reduced map when a repository supplies one, which is what
  // src/repositories/mysql/mysqlProductRepository.ts does not do today.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 8 - THE SIX OUT-OF-SCOPE BIDIRECTIONAL HELPER PAIRS.  TWELVE MEMBERS.
  //
  //   addAttributeValue / removeAttributeValue  [L680-L685]  cfc="AttributeValue", one-to-many
  //   addProductImage   / removeProductImage    [L688-L693]  cfc="Image", one-to-many
  //   addProductReview  / removeProductReview   [L704-L709]  cfc="ProductReview", one-to-many
  //   addListingPage    / removeListingPage     [L712-L729]  cfc="Content", many-to-many OWNER,
  //                                                          link table SwProductListingPage
  //   addVendor         / removeVendor          [L772-L777]  cfc="Vendor", many-to-many inverse
  //   addPhysical       / removePhysical        [L780-L785]  cfc="Physical", many-to-many inverse
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L680-L685, L688-L693, L704-L709, L712-L729, L772-L777,
  // L780-L785]: each far side is outside the eighteen entities in scope, so the association
  // collapses to an inert opaque identifier or is omitted and every `add*` / `remove*` / `has*` /
  // `get*` member is dropped. `addListingPage` is the only OWNING side, and its `arrayFind`-based
  // removal at [L721-L727] is exactly the 1-based-versus-0-based trap documented on `removeBrand`.
  // All six pairs were still read verbatim for the inversion cross-check; all six are CLEAN.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 9 - THE `attributeValues` EAV READ PATH.  NO NINETEENTH FILE.  [L75].
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L75]: the census across all eighteen in-scope entities
  // finds EXACTLY FOUR `attributeValues` declarations - [model/entity/Sku.cfc:L70] and
  // [model/entity/Brand.cfc:L60] with `type="array"`, [model/entity/Product.cfc:L75] and
  // [model/entity/ProductType.cfc:L67] without it - all four `cfc="AttributeValue"`,
  // `cascade="all-delete-orphan"`, `inverse="true"`. The `type="array"` inconsistency is annotated,
  // not normalised. The collection is not materialized, no nineteenth entity file is created, and
  // the unhonoured `cascade="all-delete-orphan"` obligation is recorded in the repositories
  // sibling. The one consequence this file carries is that `Product` remains one of only four
  // in-scope entities able to reach the `getAttributeValue` fallback at
  // [org/Hibachi/HibachiEntity.cfc:L559] before the [L565] throw - the mechanism behind
  // `getPageIDs()`, `getProductOptionsByGroup()` and `getSalePriceExpirationDateTime()` above.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 10 - THE TWELVE `getService(` SITES ON model/entity/HibachiEntity.cfc.
  //
  // LEGACY-NOTE [model/entity/HibachiEntity.cfc:L123, L130, L135, L145, L178, L180, L182, L194,
  // L196, L207, L257, L266]: twelve `getService(...)` sites on the intermediate class, seven of
  // them `attributeService`. Moot because the EAV path is not ported (cluster 9), but recorded so
  // they are not silently re-implemented. Neither is `buildIDPathList`, `getPropertyOptions`,
  // `getPropertyOptionsSmartList`, `formatValue`, `getFormattedValue`, `rbKey` or `isDeletable`.
  // `isNew()` is the ONE framework-derived member that survives, being genuine entity-local state.
  //
  // ---------------------------------------------------------------------------------------------
  // NOT IN THIS REGISTER, BECAUSE THEY ARE AUTHORED AS THROWING RATHER THAN OMITTED:
  //   getPageIDs()                        [L191-L197]
  //   getProductOptionsByGroup()          [L631-L633]
  //   getSalePriceExpirationDateTime()    [L614-L622]  (DEFECT 25)
  //   getUnusedProductSubscriptionTerms() [L649-L654]
  // A throwing member is PRESENT in the public surface and reproduces a runtime failure; an omitted
  // member is ABSENT.
  // ===========================================================================
}
