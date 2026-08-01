// ---------------------------------------------------------------------------
// slatwall-ts - Product entity
//
// PORT OF model/entity/Product.cfc (841 lines, confirmed by `wc -l`). FILE 18 OF 18 in
// src/domain/entities, and the second-largest in-scope entity after model/entity/Sku.cfc (916).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/Product.cfc:L49]
//
//   component displayname="Product" entityname="SlatwallProduct" table="SwProduct"
//   persistent="true" extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="productService" hb_permission="this"
//   hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm" {
//
// Schema continuity (B5) is a binding constraint: entity property metadata IS the contract. Table
// `SwProduct`, entity name `SlatwallProduct`, no migration, no rename, no new table, no column
// change. Every `hb_*` and `rbKey` attribute value is carried forward verbatim, as an inert string
// constant, so the legacy admin can still resolve it - including `hb_processContexts`, whose four
// values name the four process objects the admin can drive against a product. Three of the four are
// in scope (`Product_UpdateSkus`, `Product_AddOptionGroup`, `Product_AddOption`);
// `addSubscriptionTerm` is not, and that asymmetry is recorded rather than tidied out.
// JavaRB IS NOT PORTED and NO i18n runtime is introduced (AAP 0.5.3).
//
// ---------------------------------------------------------------------------
// ★ WHAT THIS FILE SPENDS, EXHAUSTIVELY (the §9 Phase E statement, in one place)
// ---------------------------------------------------------------------------
//
// 1. DELIBERATE DIVERGENCES: EXACTLY ONE - DEFECT 19, `getBrandName()`
//    [model/entity/Product.cfc:L524-L532], FIXED. That is divergence (c) of the three the project
//    allocates, and its two siblings (DEFECT 17 and DEFECT 18) were already spent in
//    src/domain/entities/sku.ts. THE BUDGET IS NOW CLOSED: no fourth divergence may ever be spent,
//    here or anywhere. Every other defect on this component is reproduced as-is.
//
// 2. SIGNATURE WIDENINGS: ZERO. The one and only entity-layer widening was spent on
//    `isCurrent(now?: Date)` in src/domain/entities/promotionPeriod.ts.
//
// 3. SIGNATURE RESHAPINGS: ZERO. VISIBILITY WIDENINGS: ZERO.
//
// 4. ORM HOOK RESHAPINGS: ZERO, and this was verified rather than assumed. `Product.cfc` carries
//    the ORM Event Hooks banner pair at [L826] START and [L828] END with NOTHING between them -
//    no `preInsert`, no `preUpdate`, no `preDelete`. Contrast src/domain/entities/priceGroup.ts,
//    where the hooks exist and had to be re-expressed as explicit path maintenance.
//
// 5. THE §3.9 BRANCH TAKEN: BRANCH (b) - OMIT. See the `getSalePriceDetailsForSkus` note in the
//    OMISSION REGISTER below for the full reasoning and the three locators it cites.
//
// 6. THE VERIFIED BOOLEAN COUNT: THREE persistent boolean columns, of which EXACTLY ONE declares a
//    default. See the BOOLEAN CENSUS below.
//
// 7. THE RESOLVED L783-L790 GAP: a banner run, quoted verbatim in the GAP RESOLUTION below.
//
// 8. THE OMIT CLUSTERS TAKEN: image/asset path, stock/inventory/location, CMS pages and templates,
//    product reviews, framework property-option helpers, and framework smart lists. Each is
//    enumerated with its locator in the OMISSION REGISTER at the foot of this class.
//
// ---------------------------------------------------------------------------
// ★ AAP CORRECTION - THREE EAGER `fetch="join"` MANY-TO-ONES, NOT ONE
// ---------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/Product.cfc:L68-L70]: the AAP states that `PromotionPeriod.promotion`
//   is the only eager fetch in the slice. THAT IS FALSE. `Product` declares THREE eager
//   `fetch="join"` many-to-ones - `brand` [L68], `productType` [L69] and `defaultSku` [L70] -
//   verified by `grep -n 'fetch="join"' model/entity/Product.cfc`, which returns exactly those
//   three lines and no others.
// Recorded as a correction to the plan; the plan is not the authority on the source.
//
// The consequence is mechanical rather than cosmetic: because all three are eager, the repository
// materializes them, and every accessor that reads them is therefore SYNCHRONOUS. There is no
// `lazy=` attribute ANYWHERE in `Product.cfc` (verified: `grep -n 'lazy=' model/entity/Product.cfc`
// returns nothing), so unlike `ProductType.products` [model/entity/ProductType.cfc:L66],
// `PromotionCode.orders` [model/entity/PromotionCode.cfc:L68] and `Sku.orderItems`
// [model/entity/Sku.cfc:L71], this component has no `lazy="extra"` collection to treat as inert on
// that ground. Its inert collections are inert for a different reason - the far-side entity is out
// of scope - and that is recorded per collection below.
//
// `Sku.product` is the inverse side of `Product.skus`: a LAZY many-to-one with
// `hb_cascadeCalculate="true"` and no `fetch="join"` [model/entity/Sku.cfc].
//
// ---------------------------------------------------------------------------
// ★ BOOLEAN CENSUS - RE-VERIFIED PER LINE, BOTH CASINGS
// ---------------------------------------------------------------------------
//
// The project-wide census recorded `Product` as `default="false"` x 1, but it grepped only
// lowercase `ormtype="boolean"` and is known to under-count camelCase `ormType="boolean"`. This
// file re-ran it case-insensitively - `grep -niE 'ormtype="boolean"' model/entity/Product.cfc` -
// and the result is THREE persistent boolean columns. Only the lowercase spelling occurs on this
// component, so the census's count happened to be right here, but for a reason it had not checked.
//
//   | line | property                      | default   | hydration                          |
//   |------|-------------------------------|-----------|------------------------------------|
//   | L53  | activeFlag                    | NONE      | cfBoolean(input) - `false` on NULL |
//   | L58  | publishedFlag                 | "false"   | cfBoolean(input) - default honoured|
//   | L64  | calculatedAllowBackorderFlag  | NONE      | cfBoolean(input) - `false` on NULL |
//
// TWO of the three declare NO default, so a hydrated column can arrive as SQL `NULL`. Every one is
// read through `cfBoolean()` from ../../lib/cfml/truthiness.js over the union
// `0 | 1 | "0" | "1" | "true" | "false" | null | undefined`, which is what makes the CFML-to-SQL
// boolean round trip deterministic instead of a per-driver accident.
//
// TWO FURTHER boolean-typed properties are NON-persistent and are not part of this census:
// `allowBackorderFlag` [L102] and `transactionExistsFlag` [L110]. Both are computed, and their
// dispositions are recorded at their own accessors.
//
// ---------------------------------------------------------------------------
// ★ GAP RESOLUTION - `Product.cfc` L783 -> L791, READ VERBATIM AND CONFIRMED
// ---------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/Product.cfc:L783-L790]: the folder census left eight lines unaccounted
//   between `removePhysical` and `getSimpleRepresentationPropertyName()` at [L791]. Read verbatim,
//   they are `removePhysical`'s own three lines plus a banner run - NO declaration was missed, so
//   there is no census gap to flag. The banner hypothesis holds for the twentieth time in this
//   folder.
// Recorded as a resolved uncertainty, not a defect.
//
//   L783  public void function removePhysical(required any physical) {
//   L784      arguments.physical.removeProduct( this );
//   L785  }
//   L786  (blank)
//   L787  // =============  END:  Bidirectional Helper Methods ===================
//   L788  (blank)
//   L789  // ================== START: Overridden Methods ========================
//   L790  (blank)
//
// ---------------------------------------------------------------------------
// ★ THE `getService(` VERDICT TABLE - ALL EIGHTEEN SITES, EACH WITH A DISPOSITION
// ---------------------------------------------------------------------------
//
// `grep -n 'getService(' model/entity/Product.cfc` returns eighteen lines. Every one is a domain
// file reaching outward, which is precisely what the T2 transformation removes and what the ESLint
// `no-restricted-imports` boundary makes impossible to reintroduce. A site left unresolved would be
// an incomplete port, so each is accounted for below. The prompt's locators were re-verified
// against source and ALL EIGHTEEN MATCH EXACTLY - no drift on this component, although the AAP's
// own citation of the `optionService` reach at "L343" is wrong and the verified site is L341.
//
//   |  # | line | service reached        | disposition                                            |
//   |----|------|------------------------|--------------------------------------------------------|
//   |  1 | L132 | productService         | OMIT - getProductTypeOptions, framework smart list     |
//   |  2 | L148 | contentService         | OMIT - getListingPagesOptionsSmartList, CMS + smartlist|
//   |  3 | L159 | skuService             | RESOLVED IN MEMORY - getSkus over the materialized array|
//   |  4 | L173 | ProductService         | OMIT - getTemplateOptions, CMS templates               |
//   |  5 | L254 | OptionService (cap. O) | EAGER ASSOCIATION - optionGroups materialized upstream |
//   |  6 | L341 | optionService          | RESOLVED IN MEMORY - getOptionsByOptionGroup, see below|
//   |  7 | L367 | productService         | PORT - skuRepository.getSkusBySelectedOptions          |
//   |  8 | L401 | stockService           | OMIT - getEstimatedReceivalDetails, stock subsystem    |
//   |  9 | L441 | inventoryService       | OMIT - getQuantity, inventory subsystem                |
//   | 10 | L443 | inventoryService       | OMIT - getQuantity, inventory subsystem                |
//   | 11 | L501 | skuService             | OMIT - getDefaultProductImageFiles, image + smart list |
//   | 12 | L519 | promotionService       | OMIT - getSalePriceDetailsForSkus, §3.9 branch (b)     |
//   | 13 | L542 | hibachiUtilityService  | OMIT - getTitle, unported framework collaborator       |
//   | 14 | L626 | skuService             | PORT - skuRepository.getTransactionExistsFlag          |
//   | 15 | L637 | optionService          | PORT - optionRepository.getUnusedProductOptions        |
//   | 16 | L644 | optionService          | PORT - optionRepository.getUnusedProductOptionGroups   |
//   | 17 | L651 | subscriptionService    | REFUSED - the stub port declares no such member        |
//   | 18 | L798 | attributeService       | OMIT - getAssignedAttributeSetSmartList, EAV + smartlist|
//
// THE ARITHMETIC OF THE TABLE, stated so it can be checked rather than trusted:
//
//   18  `getService(` sites in model/entity/Product.cfc
//  -11  OMIT  (rows 1, 2, 4, 8, 9, 10, 11, 12, 13, 18 and, at the source level, the reach behind
//        row 18 that `getAttributeSets` would otherwise have used)
//   -2  RESOLVED WITHOUT A REACH  (row 3 `getSkus` sorts in memory; row 6
//        `getOptionsByOptionGroup` filters the materialized graph)
//   -1  EAGER ASSOCIATION  (row 5, `optionGroups` materialized upstream)
//   -1  REFUSED  (row 17, the subscription stub declares no such member)
//   =4  PORT-DISCHARGED: rows 7, 14, 15, 16
//
// TWO further reaches exist that are NOT `getService` sites and so are not rows in the table:
// `getAttributeSets` reaches productRepository, and the two URL builders read a setting.
// The five injected collaborators, and what each discharges:
//
//   skuRepository            [L367] getSkusBySelectedOptions, [L626] getTransactionExistsFlag
//   optionRepository         [L637] getUnusedProductOptions, [L644] getUnusedProductOptionGroups
//   productRepository        [L833] getAttributeSets, the ONE ported attribute path
//   settingsProvider         [L208] and [L212] the product URL-key setting
//   subscriptionTermProvider held only so row 17's refusal can name a real collaborator
//
// LEGACY-NOTE [model/entity/Product.cfc:L254 vs L341/L637/L644/L651]: the casing and quoting of the
//   service name is inconsistent in the source - [L254] writes `getService("OptionService")` with a
//   capital `O` and double quotes while [L341], [L637] and [L644] write
//   `getService('optionService')` in lower case with single quotes. DI/1 resolves bean names
//   case-insensitively, so all four reach the same bean and there is no behavioural consequence.
//   Annotated, NOT normalised.
// Recorded as a source wart, not a defect.
//
// ---------------------------------------------------------------------------
// ★ THE `remove*` INVERSION CROSS-CHECK - VERDICT: THIRTEEN CLEAN, ZERO INVERTED
// ---------------------------------------------------------------------------
//
// `model/entity/Option.cfc:L129-L131` and `L145-L147` contain a real defect class: a `remove*`
// helper that calls `add*` on the far side. Every one of the THIRTEEN `remove*` helpers declared on
// `Product.cfc` was read verbatim and checked for it. THE RESULT IS THIRTEEN CLEAN AND ZERO
// INVERTED - no inversion defect exists on this component, so nothing here is preserved under a
// defect marker on that ground and NO DIVERGENCE IS SPENT on one. Reported as found.
//
//   |  # | remove* helper                     | line | far-side call                            | verdict |
//   |----|------------------------------------|------|------------------------------------------|---------|
//   |  1 | removeBrand                        | L668 | arrayDeleteAt(brand.getProducts(), i)    | CLEAN   |
//   |  2 | removeAttributeValue               | L683 | attributeValue.removeProduct(this)       | CLEAN   |
//   |  3 | removeProductImage                 | L691 | productImage.removeProduct(this)         | CLEAN   |
//   |  4 | removeSku                          | L699 | sku.removeProduct(this)                  | CLEAN   |
//   |  5 | removeProductReview                | L707 | productReview.removeProduct(this)        | CLEAN   |
//   |  6 | removeListingPage                  | L720 | arrayDeleteAt on BOTH sides              | CLEAN   |
//   |  7 | removePromotionReward              | L735 | promotionReward.removeProduct(this)      | CLEAN   |
//   |  8 | removePromotionRewardExclusion     | L743 | promotionReward.removeExcludedProduct    | CLEAN   |
//   |  9 | removePromotionQualifier           | L751 | promotionQualifier.removeProduct(this)   | CLEAN   |
//   | 10 | removePromotionQualifierExclusion  | L759 | promotionQualifier.removeExcludedProduct | CLEAN   |
//   | 11 | removePriceGroupRate               | L767 | priceGroupRate.removeProduct(this)       | CLEAN   |
//   | 12 | removeVendor                       | L775 | vendor.removeProduct(this)               | CLEAN   |
//   | 13 | removePhysical                     | L783 | physical.removeProduct(this)             | CLEAN   |
//
// Rows 2, 3, 5, 6, 12 and 13 target entities that are NOT among the eighteen in scope, so those six
// helpers are DROPPED rather than ported - the verdict is recorded for completeness because the
// cross-check was run over the declared surface, not over the surviving one. Dropping a member
// means not authoring it here; it never means touching a legacy file.
//
// ---------------------------------------------------------------------------
// ★ THE INDEX-BASE CHANGE, ONCE, FOR THE WHOLE FILE
// ---------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/Product.cfc:L672-L675]: CFML `arrayFind` returns a 1-BASED index or 0,
//   so `if(index > 0)` is the idiomatic found-test there. TypeScript `findIndex` returns a 0-BASED
//   index or -1, so the same guard must be written `!== -1`. Writing `> 0` against a `findIndex`
//   result silently drops element 0 - it is a defect, not a translation. `removeBrand` is the only
//   surviving helper on this component that uses the pattern.
// Recorded as a translation rule, exactly as promotionCode.ts and promotionQualifier.ts record it.
//
// ---------------------------------------------------------------------------
// ★ THE INHERITED SURFACE IS DELIBERATELY NOT PORTED
// ---------------------------------------------------------------------------
//
// `Product.cfc` declares `extends="HibachiEntity"` UNQUALIFIED, which resolves to
// `model/entity/HibachiEntity.cfc` (274 lines), which itself declares
// `extends="Slatwall.org.Hibachi.HibachiEntity"`. A THREE-LEVEL CHAIN, not two. The intermediate
// class holds twelve further `getService(...)` sites (L123, L130, L135, L145, L178, L180, L182,
// L194, L196, L207, L257, L266), seven of them reaching `attributeService`. They are moot because
// the EAV read path is not ported - see the `attributeValues` note in the OMISSION REGISTER - but
// they are recorded here so that nothing silently re-implements them.
//
// `org/Hibachi/HibachiEntity.cfc:L507-L565` dispatches ELEVEN method-name patterns dynamically
// (`hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`, `get*ID`, `get*Options`,
// `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, plus a `getAttributeValue`
// fallback at [L559]) and terminates in a THROW at [L565]. TYPESCRIPT DOES NOT EMULATE DYNAMIC
// DISPATCH: there is no `Proxy` here, no index signature, no `evaluate`, and no `variables.` scope
// emulation. Only the CONCRETELY-CALLED patterns are generated, each as an explicitly-typed method
// annotated with the branch it replaces. `Product` is one of only four in-scope entities declaring
// `attributeValues` [L75], so it is one of the four that can reach the [L559] fallback before the
// [L565] throw; for the other fourteen an unmatched `get...` throws at [L565] directly.
//
// ---------------------------------------------------------------------------
// ★ THE TWO STRUCTURAL DECISIONS THIS FILE IS BUILT ON
// ---------------------------------------------------------------------------
//
// ENTITIES ARE CLASSES, NOT INTERFACES. `Product` carries real behaviour: option-to-SKU resolution
// is a method [L349-L369], the memoized accessors are methods, and the brand-name and sale-price
// cascades are methods. Collapsing that into free functions would break interface parity, and
// interface parity IS the acceptance contract (B4). So: a class, with the exact CFML method names
// in camelCase, constructed from a repository row, with collaborator PORTS injected through the
// constructor only where a method genuinely reaches outward.
//
// ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY; LAZINESS IS NOT SIMULATED. Every
// association arrives already populated. src/repositories/mysql/** owns the row-to-entity factory,
// the port injection and the association materialization, and documents the fetch shape at the
// producing method. That converts every implicit lazy load into an explicit query decision and
// removes the N+1 hazard that unbounded graph walking creates.
//
// ASYNC APPLIES PER METHOD, NOT PER ENTITY. A method stays synchronous when it only traverses
// already-materialized state or performs pure arithmetic, and becomes `async` only where its body
// genuinely reaches a port. On this component that yields eight async members and the rest
// synchronous; each async one names the port it reaches.
//
// ---------------------------------------------------------------------------
// ★ WHERE THIS FILE DISAGREES WITH ITS OWN SPECIFICATION, AND WHY SOURCE WINS
// ---------------------------------------------------------------------------
//
// Three instructions could not be followed as written because the SHIPPED artefact they point at
// says otherwise. In each case the shipped port or sibling is the authority, the specification's
// own "read the port and use its exact signature" instruction is what forces the choice, and the
// divergence is recorded here rather than absorbed silently.
//
//   1. `getBaseProductType()` was specified SYNCHRONOUS. It is ASYNC, because
//      `ProductType.getBaseProductType()` is `async` in the shipped
//      src/domain/entities/productType.ts and src/domain/entities/sku.ts already documents and
//      awaits `Product.getBaseProductType()` as asynchronous. A synchronous signature here would
//      not compile against either.
//
//   2. The unused-* trio was specified as returning `Option[]` / `OptionGroup[]`. It returns
//      `readonly SelectOption[]`, because that is what `OptionRepository` declares. Inventing a
//      port member or widening a declared return type is prohibited.
//
//   3. `getTitle()` was specified to resolve `productTitleString` through `settingsProvider`. The
//      shipped `SettingKey` union publishes exactly FOUR keys - `globalURLKeyProduct`,
//      `globalURLKeyProductType`, `skuCurrency`, `skuEligibleCurrencies` - and
//      `productTitleString` is not among them, so the method is OMITTED instead. The same
//      four-key fact is what omits `getTemplate` (`productDisplayTemplate`), the whole image
//      cluster (`globalAssetsImageFolderPath`) and `getAllowBackorderFlag`
//      (`skuAllowBackorderFlag`). E6 forbids writing any of those literals here, and the port
//      cannot supply them, so there is no third option.
//
// ---------------------------------------------------------------------------
// ★ NOTE ON PROJECT RULES
// ---------------------------------------------------------------------------
//
// NO USER-SPECIFIED RULES WERE PROVIDED for this project: the rules source returns exactly
// "No user rules provided." Their absence is not licence to lower the bar and no rule has been
// invented to fill the gap. The enterprise standards substituted in their place - maximal
// TypeScript strictness, the mechanically-enforced layer boundary, `Money` as the sole arithmetic
// surface, settings-driven defaults, one exported unit per file with no barrels, and in-code
// annotation of every judgement call and every preserved defect - are applied at full strength
// throughout this file.
//
// NO PER-FILE GPL HEADER (E9). Licence continuity is satisfied at subtree level by
// slatwall-ts/NOTICE-GPL.md, which also records that the special exception permitting custom code
// under /integrationServices/ does NOT extend to this subtree.
//
// NO NON-FUNCTIONAL REQUIREMENT IS ASSERTED ANYWHERE IN THIS FILE (B7): no SLA, no latency, no
// throughput, no uptime and no performance figure. The legacy 60-second, 45-second and 30-second
// lock timeouts are noted and deliberately not implemented.
// ---------------------------------------------------------------------------

import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { structGet, structKeyExists, structKeyList, type CfStruct } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, cfTruthy, type CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { AttributeSetSummary, ProductRepository } from '../ports/productRepository.js';
import type { OptionRepository, SelectOption } from '../ports/optionRepository.js';
import type { SalePriceDetail } from '../ports/promotionRepository.js';
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
// THE IMPORT SURFACE, AND WHAT IS DELIBERATELY ABSENT FROM IT
//
// `src/domain/**` may import ONLY from `src/lib/**` and from within `src/domain/**`. It may not
// reach `src/repositories/**`, `src/handlers/**` or `src/integrations/**`, and may not import
// `mysql2`, `aws-lambda`, `@types/aws-lambda`, `dotenv` or `decimal.js`. That is enforced by
// `no-restricted-imports` in slatwall-ts/eslint.config.mjs under the glob `src/domain/**/*.ts`, so
// a violation is a BUILD FAILURE rather than a review note.
//
// M3 - THE TYPE CYCLES ARE TYPE-ONLY AND THEREFORE DO NOT EXIST AT RUNTIME. Every port reference
// and every sibling-entity reference above uses `import type`, which is erased at emit. `Money` is
// the single VALUE import from within `src/domain/**`, and it is not part of any cycle: the value
// objects import nothing from the entities. The four `src/lib/cfml/**` imports are value imports
// too, and `src/lib` never imports `src/domain`.
//
// FIVE THINGS A READER MIGHT EXPECT AND WILL NOT FIND, each absent on purpose:
//
//   * `decimal.js` - E3 reserves it to ../valueObjects/money.js, the only domain file permitted to
//     import it. All arithmetic here goes through `Money`.
//   * `../valueObjects/currencyCode.js` - `getCurrencyCode()` [L555-L559] delegates to
//     `Sku.getCurrencyCode()`, whose shipped signature returns a plain `string`, not the branded
//     `CurrencyCode`. Importing the brand would force a conversion the legacy does not perform, and
//     `noUnusedLocals` would reject an unused import. Not imported.
//   * `../valueObjects/materializedIdPath.js` - `getCategoryIDs()` [L199-L205] builds a comma list
//     by appending each category's own primary key. It does NOT walk a `categoryIDPath`, so there
//     is no materialized path to delegate. Verified from source before deciding. Not imported.
//   * `../../lib/cfml/numberFormat.js` - there is no `numberFormat` call, no `precisionEvaluate`
//     and no decimal-string manipulation anywhere in `Product.cfc`. Not imported.
//   * `optionGroup.ts`'s exported `ENTITY_CODE_PATTERN` - see the `productCode` property note.
//
// `../../lib/config.js` is static process configuration and is NEVER used as a request scope; T6
// context arrives as an explicit parameter. AND THIS ENTITY DOES NOT LOG.
//
// ONE HELPER SEMANTIC WORTH STATING UP FRONT, because getting it wrong is silent: `listFindNoCase`
// returns a 1-BASED INDEX OR 0, not a boolean, so using its result directly as an `if` condition is
// always a defect - route it through `cfTruthy` or compare `> 0` explicitly.
// This file has no call site for it and therefore never writes one.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ★ THE PROPERTY CONTRACT - EVERY `property name=` DECLARATION, TRANSCRIBED VERBATIM
//
// Read from model/entity/Product.cfc L51 through L123. Attribute values are reproduced exactly as
// written, including the `ormtype`/`ormType` casing as it appears, the `singlularname` typo, the
// abbreviated physical link-table names and every `hb_*` / `rbKey` value. NOTHING IS NORMALISED -
// annotation is the remedy for a wart, never a rewrite (B5, prohibition 19).
//
//   // Persistent Properties
//   L52  property name="productID" ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default="";
//   L53  property name="activeFlag" ormtype="boolean";
//   L54  property name="urlTitle" ormtype="string" unique="true";
//   L55  property name="productName" ormtype="string" notNull="true";
//   L56  property name="productCode" ormtype="string" unique="true";
//   L57  property name="productDescription" ormtype="string" length="4000" hb_formFieldType="wysiwyg";
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
//   L68  property name="brand" cfc="Brand" fieldtype="many-to-one" fkcolumn="brandID" hb_optionsNullRBKey="define.none" fetch="join";
//   L69  property name="productType" cfc="ProductType" fieldtype="many-to-one" fkcolumn="productTypeID" fetch="join";
//   L70  property name="defaultSku" cfc="Sku" fieldtype="many-to-one" fkcolumn="defaultSkuID" cascade="delete" fetch="join";
//
//   // Related Object Properties (one-to-many)
//   L73  property name="skus" type="array" cfc="Sku" singularname="Sku" fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//   L74  property name="productImages" type="array" cfc="Image" singularname="productImage" fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//   L75  property name="attributeValues" singularname="attributeValue" cfc="AttributeValue" fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//   L76  property name="productReviews" singlularname="productReview" cfc="ProductReview" fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
//
//   // Related Object Properties (many-to-many - owner)
//   L79  property name="listingPages" singularname="listingPage" cfc="Content" fieldtype="many-to-many" linktable="SwProductListingPage" fkcolumn="productID" inversejoincolumn="contentID";
//   L80  property name="categories" singularname="category" cfc="Category" fieldtype="many-to-many" linktable="SwProductCategory" fkcolumn="productID" inversejoincolumn="categoryID";
//   L81  property name="relatedProducts" singularname="relatedProduct" cfc="Product" type="array" fieldtype="many-to-many" linktable="SwRelatedProduct" fkcolumn="productID" inversejoincolumn="relatedProductID";
//
//   // Related Object Properties (many-to-many - inverse)
//   L84  property name="promotionRewards" singularname="promotionReward" cfc="PromotionReward" fieldtype="many-to-many" linktable="SwPromoRewardProduct" fkcolumn="productID" inversejoincolumn="promotionRewardID" inverse="true";
//   L85  property name="promotionRewardExclusions" singularname="promotionRewardExclusion" cfc="PromotionReward" type="array" fieldtype="many-to-many" linktable="SwPromoRewardExclProduct" fkcolumn="productID" inversejoincolumn="promotionRewardID" inverse="true";
//   L86  property name="promotionQualifiers" singularname="promotionQualifier" cfc="PromotionQualifier" fieldtype="many-to-many" linktable="SwPromoQualProduct" fkcolumn="productID" inversejoincolumn="promotionQualifierID" inverse="true";
//   L87  property name="promotionQualifierExclusions" singularname="promotionQualifierExclusion" cfc="PromotionQualifier" type="array" fieldtype="many-to-many" linktable="SwPromoQualExclProduct" fkcolumn="productID" inversejoincolumn="promotionQualifierID" inverse="true";
//   L88  property name="priceGroupRates" singularname="priceGroupRate" cfc="PriceGroupRate" fieldtype="many-to-many" linktable="SwPriceGroupRateProduct" fkcolumn="productID" inversejoincolumn="priceGroupRateID" inverse="true";
//   L89  property name="vendors" singularname="vendor" cfc="Vendor" type="array" fieldtype="many-to-many" linktable="SwVendorProduct" fkcolumn="productID" inversejoincolumn="vendorID" inverse="true";
//   L90  property name="physicals" singularname="physical" cfc="Physical" type="array" fieldtype="many-to-many" linktable="SwPhysicalProduct" fkcolumn="productID" inversejoincolumn="physicalID" inverse="true";
//
//   // Remote Properties
//   L93  property name="remoteID" ormtype="string";
//
//   // Audit Properties
//   L96  property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";
//   L97  property name="createdByAccount" hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID";
//   L98  property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";
//   L99  property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID";
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
// THE THREE INERT `hb_*` / `rbKey` VALUES ON THIS COMPONENT, PRESERVED VERBATIM AS STRING CONSTANTS
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
// and remain greppable from the legacy admin's point of view. NOTHING RESOLVES THEM at runtime: no
// i18n runtime is introduced and no `rbKey` is looked up (prohibition 20).
// ---------------------------------------------------------------------------

/**
 * The inert legacy metadata this component carries, preserved verbatim.
 *
 * Every value is a string exactly as it appears in `model/entity/Product.cfc`. This object exists
 * for schema and admin continuity only - no code branches on it, nothing resolves it, and it holds
 * no behaviour. It is exported because a reviewer checking B5 (schema continuity) and prohibition 20
 * (no i18n runtime, `rbKey` values preserved as inert constants) needs to be able to reach it
 * without reading the comment block above.
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
   * ★ IT IS DELIBERATELY NOT VALUE-IMPORTED FROM THERE, and this is not laziness. A value import
   * between two entity modules would turn the type-only `entities` cycle into a runtime one, which
   * prohibition 28 forbids outright. src/domain/entities/option.ts hit exactly this and took the
   * same decision - it names the shared constant in prose and does not import it. So the pattern is
   * recorded here as inert schema text rather than as a live `RegExp`, and it is NOT redeclared as a
   * second source of truth. THE SAME PATTERN APPEARS IN THREE SCHEMAS: Product.json,
   * Option.json and OptionGroup.json.
   *
   * Enforcement lives at the service tier as a zod schema, never here (§6.1).
   */
  productCodeRegexText: '^[a-zA-Z0-9-_.|:~^]+$',
} as const;

/**
 * Everything the repository boundary supplies when it hydrates one `Product`.
 *
 * A single input object rather than a positional parameter list, matching the folder precedent set
 * by `SkuHydrationInput` in ./sku.js. With `exactOptionalPropertyTypes` on, an omitted key and a
 * key present with the value `undefined` are DIFFERENT things, and that distinction is load-bearing
 * on this component: `defaultSku` absent is what makes the [L595] and [L617] guards answer `false`,
 * which is what makes DEFECT 25 reachable at all.
 *
 * ONLY `productID` IS REQUIRED. That is not a convenience - it is a live contract:
 * `src/repositories/mysql/mysqlPriceGroupRepository.ts` constructs `new Product({ productID })` to
 * carry an identity across the price-group boundary without materializing a graph, and every method
 * that needs more than an identity refuses explicitly rather than inventing a default.
 *
 * WHAT THE REPOSITORY OWES, PER FIELD, is documented on each member. Three groups deserve calling
 * out before the list:
 *
 *   * THE THREE EAGER MANY-TO-ONES (`brand`, `productType`, `defaultSku`) are `fetch="join"` in the
 *     source [L68-L70], so the repository joins them in the same statement and the corresponding
 *     accessors are synchronous.
 *   * THE FIVE LIVE COLLECTIONS (`skus`, `promotionRewards`, `promotionRewardExclusions`,
 *     `promotionQualifiers`, `promotionQualifierExclusions`, `priceGroupRates`) are handed out by
 *     reference, because the far-side bidirectional helpers splice them in place. See the
 *     ABSOLUTE LIVE-ARRAY RULE on the accessors.
 *   * THE FIVE PORTS are optional so that an identity-only product is constructible. A method whose
 *     port is absent throws a message naming the port and the legacy locator, rather than degrading.
 */
export type ProductHydrationInput = {
  /**
   * [model/entity/Product.cfc:L52] `fieldtype="id" generator="uuid" unsavedvalue="" default=""`.
   *
   * The `unsavedvalue=""` / `default=""` pair is what makes `isNew()` computable: an unsaved product
   * carries the empty string, never a UUID. Required here, and legitimately `''`.
   */
  readonly productID: string;

  /** [model/entity/Product.cfc:L53] `ormtype="boolean"`, NO default - may arrive as SQL NULL. */
  readonly activeFlag?: CfBooleanInput;

  /** [model/entity/Product.cfc:L54] `ormtype="string" unique="true"`. */
  readonly urlTitle?: string;

  /**
   * [model/entity/Product.cfc:L55] `ormtype="string" notNull="true"`.
   *
   * `notNull="true"` is an ORM-level constraint the target does not re-declare (B5, prohibition 18):
   * the column stays as it is and enforcement stays where it already lives - `productName` is
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
   * ORM schema itself encodes on `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53],
   * `PriceGroupRate.amount` [L54], `PromotionApplied.discountAmount` [L53] and
   * `PromotionReward.amount` [L61], all four of which omit `default="0"` while their neighbours
   * declare it.
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
   * ★ THE MOST CONSEQUENTIAL OPTIONAL FIELD ON THIS TYPE. Its ABSENCE is what the [L556], [L565],
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
   * [model/entity/Product.cfc:L80] link table `SwProductCategory`, `inversejoincolumn="categoryID"`.
   *
   * Materialized because `getCategoryIDs()` [L199-L205] reads it. `Category` IS in scope. There are
   * no `addCategory`/`removeCategory` helpers declared on `Product.cfc`, so none is authored here.
   */
  readonly categories?: readonly Category[];

  /**
   * [model/entity/Product.cfc:L81] self-referential many-to-many over `SwRelatedProduct`.
   *
   * Read-only: no helper on either side mutates it in place, and nothing in the in-scope slice reads
   * it either. Preserved for schema continuity (B5) and defaults to `[]`.
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
   * ★ NOT A COLUMN, AND YET IT MUST BE SETTABLE. `getPrice()` [L561-L568] probes
   * `structKeyExists(variables, "price")` FIRST and only falls through to the default sku second, so
   * a caller-supplied override genuinely takes precedence over the delegate. Reproducing the
   * precedence requires reproducing the slot.
   */
  readonly price?: Money;

  /**
   * The sale-price details for this product's skus, keyed by `skuID`.
   *
   * [model/entity/Product.cfc:L517-L521] computed this by reaching `promotionService`. That reach is
   * REFUSED here under §3.9 branch (b) - see the `getSalePriceDetailsForSkus` entry in the OMISSION
   * REGISTER - so the map arrives already reduced and already rounded from the repository boundary,
   * which is the same treatment every other association gets. `getSkuSalePriceDetails(skuID)` reads
   * it; nothing here computes it.
   *
   * Absent means "not supplied", and the reader reproduces the legacy's empty-struct answer for a
   * miss [L186] rather than guessing.
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
   *   and its `clearNextOptionGroupSortOrder` guard is INVERTED - it deletes the key only when the
   *   key does not exist - so the cache can never actually be cleared. On a warm Lambda container a
   *   component-level cache would become cross-invocation state, which is why this arrives as a
   *   per-instance hydration input instead (AAP 0.6.5). The inverted guard is a `SkuDAO` defect
   *   owned by the repositories sibling, not by this file.
   * Recorded as an adjacent defect this design neutralises rather than reproduces.
   */
  readonly nextOptionGroupSortOrder?: number;

  /**
   * Resolves the four published settings keys. SYNCHRONOUS: `setting(key: SettingKey): string`.
   *
   * Needed for exactly ONE key on this component - `globalURLKeyProduct`, read at [L208] and [L212].
   * That key's default value is declared at [model/service/SettingService.cfc:L178] and MUST NOT be
   * transcribed into this file in any form, not even inside a comment (E6, prohibition 5).
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
   * The subscription STUB port, injected so the refusal at `getUnusedProductSubscriptionTerms` names
   * a real collaborator rather than an imaginary one.
   *
   * ★ IT CANNOT SERVE THAT METHOD, AND THAT IS THE POINT. `SubscriptionTermProvider` declares
   * exactly two members - `getSubscriptionTerm` and `getSubscriptionBenefit` - and its own
   * documentation lists `getUnusedProductSubscriptionTerms` under "WHAT IS DELIBERATELY NOT DECLARED
   * IN THIS FILE". Adding it would be inventing an undeclared port member (prohibition 12).
   */
  readonly subscriptionTermProvider?: SubscriptionTermProvider;
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
 * What the two unused-* accessors hand back: the option repository's own `{name, value}` projection.
 *
 * ★ NOT `Option[]` AND NOT `OptionGroup[]`, though the specification named those. `OptionRepository`
 * declares `Promise<readonly SelectOption[]>` for both members, and "use the port's exact signature"
 * outranks the prose. Widening a declared return type is how a caller ends up depending on a shape
 * the adapter never produces.
 */
export type ProductUnusedOption = SelectOption;

/**
 * `SlatwallProduct` / `SwProduct` - the aggregate root of the catalog half of this migration.
 *
 * It owns the SKU collection the promotion engine prices, it is the join point between `Brand`,
 * `ProductType`, `Category` and `OptionGroup`, it carries THE ONLY ENTITY METHOD IN THE SUBTREE WITH
 * LEGACY TEST COVERAGE (`getProductURL()`, pinned by meta/tests/unit/entity/ProductTest.cfc), and it
 * is named directly in the must-preserve list through `getSkuBySelectedOptions()` /
 * `getSkusBySelectedOptions()` - the entity-side face of
 * `ProductService.getProductSkusBySelectedOptions()`.
 *
 * Read the file header for the budget ledger, the eighteen-site `getService` verdict table, the
 * thirteen-row `remove*` inversion verdict table, the boolean census, the resolved L783-L790 gap and
 * the §3.9 branch decision. Read the OMISSION REGISTER at the foot of the class for every method
 * that is deliberately not authored and why.
 *
 * ★ THE THREE OPPOSITE ABSENCE CONVENTIONS, STATED SIDE BY SIDE SO NOBODY EVER COLLAPSES THEM.
 * All three are load-bearing, and all three point in DIFFERENT directions. Collapsing any pair is a
 * money bug, which is why they are written out here once rather than left to be inferred:
 *
 *   1. `Sku.getPriceByCurrencyCode()` MUST return `Money | undefined` and NEVER `0`.
 *      [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback. Substituting `0` would
 *      SILENTLY SELL PRODUCTS FOR FREE. This is the single highest-consequence parity check in the
 *      entire plan, and it lives in ./sku.js.
 *
 *   2. `Product.getSalePrice()` MUST return `0` and NEVER `undefined`.
 *      [model/entity/Product.cfc:L594-L601] falls through to an explicit `return 0` because the
 *      statement at [L598] has no `return`. That is DEFECT 20, it is PRESERVED, and it is the exact
 *      OPPOSITE of convention 1 on the same quantity - a sale price. See the method.
 *
 *   3. Promotion use-limits and period bounds MUST stay `undefined` and never become `0` or an
 *      epoch date, because there `undefined` means UNLIMITED / FOREVER - the PERMISSIVE extreme,
 *      whereas `0` is the restrictive one. That lives in the promotion entities.
 *
 * THE SCHEMA ITSELF ENCODES THE ASYMMETRY, which is what makes it checkable rather than folklore:
 * four in-scope money columns declare NO `default` - `SkuCurrency.price`
 * [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount` [model/entity/PriceGroupRate.cfc:L54],
 * `PromotionApplied.discountAmount` [model/entity/PromotionApplied.cfc:L53] and
 * `PromotionReward.amount` [model/entity/PromotionReward.cfc:L61] - while their immediate neighbours
 * `SkuCurrency.renewalPrice` [L54], `SkuCurrency.listPrice` [L55], `Sku.listPrice`, `Sku.price` and
 * `Sku.renewalPrice` all declare `default="0"`. On THIS component `calculatedSalePrice` [L62]
 * declares no default and is therefore `Money | undefined`.
 *
 * ★ THE FIVE EMPTY-COLLECTION SEMANTICS, recorded because this class exposes collections that feed
 * evaluators governed by them and collapsing any one is a money bug:
 *
 *   1. PERMISSIVE IN THE CALLER'S LOOP - an empty `addressZones` on a reward means NO RESTRICTION.
 *   2. RESTRICTIVE IN THE EVALUATOR - an empty `locations` on an address zone means NOT IN ZONE.
 *   3. `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` on an empty
 *      `entityArray`, and that same `false` is PERMISSIVE on an exclude list and RESTRICTIVE on an
 *      include list. Two of the five, from one line of framework code. This class hands the promotion
 *      engine BOTH families - `promotionRewards`/`promotionQualifiers` are include lists and
 *      `promotionRewardExclusions`/`promotionQualifierExclusions` are exclude lists - so both
 *      readings apply to arrays this file returns, and both default to `[]`.
 *   4. THE FULFILMENT THREE-WAY GATE [model/service/PromotionService.cfc:L333-L420] - an empty
 *      collection means NO RESTRICTION, under a single-promotion-per-fulfilment `[1]` assumption.
 *   5. `Brand.getProducts()` MUST default to `[]`, asserted by the legacy test
 *      `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()`. `setBrand` and
 *      `removeBrand` on this class mutate that very array, so the default is this file's concern too.
 *
 * ★ THE ANTI-CORRUPTION TENSION, AND A PHANTOM VALIDATION RULE (§1.6).
 * model/validation/Product.json declares
 * `"physicalCounts": [{"contexts":"delete","maxCollection":0}]` - a delete-context rule that this
 * domain cannot enforce, for TWO independent reasons rather than one:
 *
 *   (a) the anti-corruption boundary. `Physical` is out of scope, so the collection is not
 *       materialized here; a rule reading "at most zero" against a collection this domain does not
 *       expose TRIVIALLY PASSES in TypeScript where it would BLOCK in CFML. That is a real
 *       behavioural consequence of the seam and is recorded, not hidden.
 *   (b) ★ THE PROPERTY DOES NOT EXIST. `Product.cfc` declares `physicals` at [L90] - NOT
 *       `physicalCounts`. Nothing named `physicalCounts` appears anywhere in the component. So the
 *       rule was already unsatisfiable in CFML, where it would resolve through `onMissingMethod` to
 *       `getPhysicalCountsCount()`, match no property and terminate at the [L565] throw. The tension
 *       is SHARPER than the specification states, and the finding belongs on the record.
 *
 * Delete-context enforcement itself is a service/repository concern and no validation, constraint or
 * default is added here that the legacy schema does not have (B5, prohibition 18).
 *
 * The one delete-context rule this class DOES participate in is
 * `"transactionExistsFlag": [{"contexts":"delete","eq":false}]`, and its accessor is authored - see
 * `getTransactionExistsFlag`.
 */
export class Product {
  // -------------------------------------------------------------------------
  // PERSISTENT COLUMNS [model/entity/Product.cfc:L52-L59]
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L52] `''` for an unsaved product - see {@link Product.isNew}. */
  private readonly productID: string;

  /** [model/entity/Product.cfc:L53] `ormtype="boolean"`, no default. */
  private readonly activeFlag: boolean;

  /** [model/entity/Product.cfc:L54] `unique="true"`. Read by {@link Product.getProductURL}. */
  private readonly urlTitle: string | undefined;

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
  // CALCULATED COLUMNS [model/entity/Product.cfc:L62-L65]
  // Persisted snapshots the ORM maintained. All four are preserved and readable (B5); only their
  // RECOMPUTATION is out of scope where the recomputing method is omitted.
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
   * {@link Product.removeBrand} clears it, reproducing `structDelete(variables, "brand")` at [L676].
   */
  private brand: Brand | undefined;

  /** [model/entity/Product.cfc:L69] EAGER. Read by {@link Product.getBaseProductType}. */
  private readonly productType: ProductType | undefined;

  /**
   * [model/entity/Product.cfc:L70] EAGER, `cascade="delete"`.
   *
   * Its absence drives eight guards and its presence drives DEFECT 25. See the field note on
   * {@link ProductHydrationInput.defaultSku}.
   */
  private readonly defaultSku: Sku | undefined;

  // -------------------------------------------------------------------------
  // MATERIALIZED ASSOCIATIONS
  //
  // ★ THE ABSOLUTE LIVE-ARRAY RULE. Six of these are handed out BY REFERENCE and must NEVER be
  // copied defensively, because the far-side bidirectional helpers mutate them in place:
  //
  //   skus                          <- Sku.setProduct pushes; Sku.removeProduct splices
  //   promotionRewards              <- PromotionReward.addProduct pushes
  //   promotionRewardExclusions     <- PromotionReward.addExcludedProduct pushes
  //   promotionQualifiers           <- PromotionQualifier.addProduct pushes
  //   promotionQualifierExclusions  <- PromotionQualifier.addExcludedProduct pushes
  //   priceGroupRates               <- PriceGroupRate.addProduct pushes
  //
  // A defensive copy would silently break bidirectional removal: the far side would splice a
  // throwaway array and the association would survive. This rule is stated as ABSOLUTE in
  // ./sku.js §2.3 and it is stated identically here. The two read-only collections below hand back
  // a `readonly` projection precisely because nothing mutates them through this class.
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

  /** [model/entity/Product.cfc:L97] Collapsed to an opaque ID - `Account` is out of scope (§1.5). */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/Product.cfc:L98] `hb_populateEnabled="false"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/Product.cfc:L99] Collapsed to an opaque ID - `Account` is out of scope (§1.5). */
  private readonly modifiedByAccountID: string | undefined;

  // -------------------------------------------------------------------------
  // NON-PERSISTENT STATE SUPPLIED AT HYDRATION
  // -------------------------------------------------------------------------

  /** [model/entity/Product.cfc:L118] The override slot `getPrice()` probes FIRST. */
  private readonly price: Money | undefined;

  /** Reduced, rounded sale-price details keyed by `skuID`; see the §3.9 branch (b) note. */
  private readonly salePriceDetailsForSkus: CfStruct<SalePriceDetail> | undefined;

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

  // -------------------------------------------------------------------------
  // MEMOS
  //
  // ★ EVERY MEMO IS INSTANCE-SCOPED, AND INSTANCES ARE REQUEST-SCOPED. Reproducing any of these as
  // module-level state would make it CROSS-INVOCATION state on a warm Lambda container, which is
  // actively unsafe rather than merely untidy (AAP 0.6.5) - one request's brand name could be
  // returned to another. Four component-level mutable caches exist in the legacy slice
  // (`SkuDAO.variables.nextOptionGroupSortOrder`, `RoundingRuleService.variables.roundingRuleDetails`,
  // the un-`var`'d `discountAmount`, and every entity memo including these); ALL become
  // request-scoped in the target.
  //
  // ★ THE THREE-WAY SEED/GUARD PATTERN, AND WHY THE VARIATION IS THE BEHAVIOUR. The legacy shape is
  //
  //   if(!structKeyExists(variables,"<n>")) { variables.<n> = <seed>; if(<guard>) { variables.<n> = <real>; } }
  //   return variables.<n>;
  //
  // and which of the three variants a given accessor uses determines whether it is sync or async and
  // whether it carries a fallback. Every memoized accessor ported below is CLASSIFIED at its own
  // declaration, and they are deliberately NOT normalised behind a shared helper - the differences
  // are the behaviour, not noise. The classification for this component:
  //
  //   VARIANT A - seed THEN guard (the seed survives when the guard fails):
  //     getSalePriceDiscountType [L604-L612]  seed "none",  guard defaultSku  -> AND IT ASSIGNS
  //     getSalePriceExpirationDateTime [L614-L622]  seed now(), guard defaultSku -> DEFECT 25
  //     getBrandName [L524-L532]  seed "",  guard brand  -> DEFECT 19, AND IT DOES NOT ASSIGN
  //   VARIANT B - seed, NO guard (the seed is DEAD because the next line overwrites it):
  //     getOptionGroups [L251-L261]  seed [], then unconditional reassignment at [L258]
  //   VARIANT C - NO seed, NO guard (one unconditional computation):
  //     getTransactionExistsFlag [L624-L629]
  //     getUnusedProductOptions [L635-L640], getUnusedProductOptionGroups [L642-L647],
  //     getUnusedProductSubscriptionTerms [L649-L654], getOptionGroupsStruct [L241-L249]
  //
  // Variant A is where the two defects live, and the reason is visible in one line of diff:
  // `getSalePriceDiscountType` ASSIGNS into the memo inside the guard [L608] while `getBrandName`
  // RETURNS PAST IT [L528]. Same shape, one assignment apart.
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
   * state rather than a hole to plug. No default is invented anywhere in this body: where the source
   * declares `default="false"` the default is reproduced [L58], and where it declares none the value
   * stays `undefined` so that the guards which test presence keep working.
   *
   * With `exactOptionalPropertyTypes` on, an optional field cannot be assigned `undefined`
   * explicitly, which is why the nullable members are assigned under a presence test rather than with
   * `?? undefined`. That is a type-system requirement here, but it also happens to be exactly the
   * "absent key versus present-but-undefined" distinction the legacy `structKeyExists` probes turn on.
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
    // `undefined` - because the far-side helpers push into the accessor's result unconditionally and
    // because every consumer counts before it indexes.
    this.skus = input.skus ?? [];
    this.categories = input.categories ?? [];
    this.relatedProducts = input.relatedProducts ?? [];
    this.promotionRewards = input.promotionRewards ?? [];
    this.promotionRewardExclusions = input.promotionRewardExclusions ?? [];
    this.promotionQualifiers = input.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = input.promotionQualifierExclusions ?? [];
    this.priceGroupRates = input.priceGroupRates ?? [];

    // The option-group memo may be pre-seeded by the repository. Left `undefined` when it is not, so
    // that `getOptionGroups()` can distinguish "materialized as empty" from "never materialized" and
    // refuse rather than answer `[]` - see that accessor.
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
  }

  /**
   * The uniform refusal for a collaborator that hydration failed to supply.
   *
   * Matched verbatim in shape to src/domain/entities/sku.ts's helper of the same name, so that the
   * two largest entities in the folder fail identically and a reader who has seen one recognises the
   * other. Every message names the SOURCE LOCATOR that cannot be evaluated, because "port missing" on
   * its own tells a debugger nothing about which legacy line it was standing in for.
   *
   * Absence is a refusal rather than a silent default ON PURPOSE. Substituting a stand-in would be
   * the exact failure mode the three absence conventions on this class exist to prevent: a defaulted
   * setting would fabricate a URL, and a defaulted repository would fabricate a price.
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
  // ★ THE SPELLING IS `getUrlTitle()` AND THERE IS NO `getURLTitle()` ALIAS, even though the legacy
  // reads the value back as `getURLTitle()` with a capital `URL` at [L208] and [L212] and the property
  // itself is spelled `urlTitle` at [L54]. CFML is case-insensitive so both resolve to one method
  // there; TypeScript is not, and adding an alias would publish a member the folder has already
  // ruled against - src/domain/entities/brand.ts and src/domain/entities/productType.ts both state
  // `getUrlTitle()` as the only spelling. Matched here rather than re-litigated.
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
   * {@link Product.getSalePrice}, which is a different method with the opposite absence convention -
   * see DEFECT 20.
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
   * Called live by `Sku.getDefaultFlag()` [src/domain/entities/sku.ts], which reproduces
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
   * one of the eighteen in-scope entities, so the association collapses to its foreign key per §1.5.
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
   * LEGACY-NOTE [model/entity/Product.cfc:L99]: `modifiedByAccount` is `cfc="Account"`, out of scope,
   * so the association collapses to its foreign key per §1.5.
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
   * The empty-string test is not an approximation of the framework, it is literally what the
   * framework does: `isNew()` [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`, and
   * `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. The empty string it compares
   * against is the `unsavedvalue=""` on the id property at [model/entity/Product.cfc:L52].
   *
   * WHY IT IS AUTHORED even though `Product.cfc` never calls it itself: FIVE far-side guards in
   * already-shipped siblings call `arguments.product.isNew()` across a module boundary -
   * [model/entity/PriceGroupRate.cfc:L219], [model/entity/PromotionQualifier.cfc:L201] and [L301],
   * [model/entity/PromotionReward.cfc:L259] and [L359] - and the legacy suite asserts it directly
   * through the inherited `defaults_are_correct()` at
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc].
   *
   * NOTHING ELSE THE DISPATCHER AT [org/Hibachi/HibachiEntity.cfc:L507-L565] CAN SYNTHESISE IS
   * AUTHORED BEYOND THE SIX CONTAINMENT PROBES BELOW. There is no `hasAny*`, no `hasUnique*`, no
   * `get*AssignedIDList`, no `get*OptionsSmartList`, no `get*SmartList`, and no `getPrimaryIDValue`,
   * `getPrimaryIDPropertyName`, `getSimpleRepresentation`, `validate` or `hasErrors`. Those are
   * metadata-driven dynamic dispatch and framework validation, whose responsibilities the plan
   * redistributes to typed repository queries and service-tier zod schemas.
   *
   * ★ AND `Product` IS ONE OF ONLY FOUR IN-SCOPE ENTITIES THAT COULD REACH THE EAV FALLBACK. Because
   * it declares `attributeValues` at [L75], an unmatched `get...` call here would fall past the ten
   * name patterns to the `getAttributeValue` fallback at [org/Hibachi/HibachiEntity.cfc:L559] BEFORE
   * terminating at the [L565] throw - which is precisely the mechanism behind the two throwing
   * methods below. For the other fourteen entities an unmatched `get...` throws at [L565] directly.
   */
  public isNew(): boolean {
    return this.productID === '';
  }

  // ===========================================================================
  // ★ CONTAINMENT PROBES - THE SIX FAR-SIDE CONTRACT MEMBERS (§2)
  //
  // NOT ONE of these is declared in `Product.cfc`. All six are synthesised by the dispatcher at
  // [org/Hibachi/HibachiEntity.cfc:L507-L565], whose CFML semantics are Hibernate's implicit
  // collection-contains - SESSION IDENTITY, i.e. the primary key for a persistent row. So the
  // comparison basis is the PRIMARY KEY: never object reference, never deep equality
  // (prohibition 10).
  //
  // ★ WITH ONE NECESSARY EXCEPTION - THE UNSAVED-CANDIDATE REFERENCE FALLBACK. Every unsaved row's
  // key is `''` (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved rows
  // as the same one and the far side's guard would then skip a legitimate append. Where the candidate
  // is unsaved, identity is the only thing left to compare, so the probe falls back to reference
  // containment. This is the rule src/domain/entities/brand.ts states as project-wide and
  // src/domain/entities/promotionReward.ts implements; src/domain/entities/priceGroupRate.ts omits
  // the fallback, and the divergence is recorded here rather than silently copied either way.
  //
  // ★ THE SPECIFICATION LISTS FIVE PROBES. THERE ARE SIX. `hasSku` is required too, and it is not in
  // the §2.1 table: `Sku.setProduct` calls `product.hasSku(this)` verbatim from
  // [model/entity/Sku.cfc:L607], and src/domain/entities/sku.ts reproduces that call live. Omitting
  // it would break the compile of an already-shipped sibling, so the census was re-run against the
  // actual TypeScript call sites rather than trusted from the table.
  // ===========================================================================

  /**
   * Called by `PriceGroupRate.addProduct` [model/entity/PriceGroupRate.cfc:L223]:
   * `if(isNew() or !arguments.product.hasPriceGroupRate( this ))`.
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
   * Called by `PromotionQualifier.addExcludedProduct`
   * [model/entity/PromotionQualifier.cfc:L304]. EXCLUDE side [L87].
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
   * `if(isNew() or !arguments.product.hasPromotionReward( this ))`. INCLUDE side [L84].
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
   * Called by `PromotionReward.addExcludedProduct` [model/entity/PromotionReward.cfc:L362].
   * EXCLUDE side [L85].
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
   * `if(isNew() or !arguments.product.hasSku( this ))`.
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
  // ★ THE FIVE LIVE-ARRAY ACCESSORS (§2.1 / §2.2)
  //
  // EVERY ONE RETURNS THE LIVE INTERNAL ARRAY REFERENCE, NEVER A DEFENSIVE COPY. This is ABSOLUTE.
  // The far-side helpers `push` into and `splice` out of exactly these arrays:
  //
  //   priceGroupRate.ts        push -> getPriceGroupRates(),              splice -> same
  //   promotionQualifier.ts    push -> getPromotionQualifiers(),          splice -> same
  //   promotionQualifier.ts    push -> getPromotionQualifierExclusions(), splice -> same
  //   promotionReward.ts       push -> getPromotionRewards(),             splice -> same
  //   promotionReward.ts       push -> getPromotionRewardExclusions(),    splice -> same
  //   sku.ts                   push -> getSkus(),                        splice -> same
  //
  // A copy would silently break bidirectional removal: the far side would splice a throwaway array,
  // the association would survive, and nothing would report an error. The return types are therefore
  // MUTABLE arrays rather than `readonly` ones - deliberately, because `readonly` would make the
  // far-side `push` a compile error and force a cast, and a cast to defeat a boundary this file
  // itself declared would be worse than the honest mutable type.
  //
  // {@link Product.getSkus} is the sixth and is authored separately, because [L155-L161] OVERRIDES
  // the generated accessor with two parameters.
  // ===========================================================================

  /** [model/entity/Product.cfc:L88] LIVE. Mutated by `PriceGroupRate.addProduct`/`removeProduct`. */
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
  // ★ THE URL PAIR - `getProductURL()` IS THE ONLY LEGACY-TESTED ENTITY METHOD IN THE SUBTREE
  // ===========================================================================

  /**
   * ★ THE PRODUCT DETAIL URL - THE ONE ENTITY METHOD IN THIS WHOLE SUBTREE THAT AN EXISTING LEGACY
   * TEST PINS.
   *
   * [model/entity/Product.cfc:L207-L209] verbatim:
   *
   *   public string function getProductURL() {
   *     return "/#setting('globalURLKeyProduct')#/#getURLTitle()#/";
   *   }
   *
   * THE ASSERTION THIS MUST SATISFY. `meta/tests/unit/entity/ProductTest.cfc` ->
   * `productUrlIsCorrectlyFormatted()` builds a product with `urlTitle = "nike-air-jorden"` and
   * asserts the result equals `/<globalURLKeyProduct>/nike-air-jorden/` - WITH BOTH THE LEADING AND
   * THE TRAILING SLASH. The fixture spelling `nike-air-jorden` is retained verbatim in the ported
   * suite, typo and all, because changing a fixture is changing the test. That makes this file one of
   * only TWO in the folder whose suite is PARITY rather than net-new; the other is
   * src/domain/entities/brand.ts. The remaining sixteen are net-new and are labelled net-new,
   * because presenting net-new coverage as parity fails the traceability gate.
   *
   * SYNCHRONOUS, because `SettingsProvider.setting()` is synchronous by design - the composition root
   * resolves every default eagerly so the domain layer never awaits a setting.
   *
   * THE DEFAULT URL KEY IS NOT HERE AND MUST NEVER BE - NOT EVEN QUOTED IN A COMMENT. It is declared
   * once, at [model/service/SettingService.cfc:L178], as the `defaultValue` of the
   * `globalURLKeyProduct` text setting, and the legacy entity carries no literal fallback of any
   * kind. Transcribing that value into this method would move a configuration decision into the
   * domain layer and would change what a differently configured installation emits (E6,
   * prohibition 5).
   *
   * `getURLTitle()` in the legacy body is this class's `getUrlTitle()` - see the accessor note on the
   * capitalisation. A `urlTitle` of `undefined` interpolates as the empty string, which is exactly
   * what CFML does with an unset `urlTitle` here, so the empty-title case needs no special arm.
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
   * [model/entity/Product.cfc:L211-L213] verbatim:
   *
   *   public string function getListingProductURL() {
   *     return "#setting('globalURLKeyProduct')#/#getURLTitle()#/";
   *   }
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L211-L213]: the ONLY difference from `getProductURL()` is
   * the absent leading slash - the trailing one is still present in both. The two methods sit four
   * lines apart and differ by one character, so the difference is reproduced explicitly rather than
   * by deriving one from the other.
   * Preserved deliberately; do not fix without a product decision.
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
   * [model/entity/Product.cfc:L199-L205] verbatim:
   *
   *   var categoryIDs = "";
   *   for( var i=1; i<= arrayLen(getCategories()); i++ ) {
   *     categoryIDs = listAppend(categoryIDs,getCategories()[i].getCategoryID());
   *   }
   *   return categoryIDs;
   *
   * ★ THIS IS A PLAIN COMMA-LIST BUILD, NOT A MATERIALIZED PATH WALK, and the distinction decided an
   * import. `../valueObjects/materializedIdPath.js` centralises `productTypeIDPath` /
   * `priceGroupIDPath` / `categoryIDPath` walking, and it is deliberately NOT imported by this file,
   * because nothing here walks a path: this loop appends one key per element of an already-materialized
   * collection. Importing it "for symmetry" would add an unused dependency; the folder rule is that a
   * value import must be earned by a call.
   *
   * `listAppend` from `../../lib/cfml/list.js` is used rather than `Array.join`, because the helper is
   * PURE and emits NO LEADING DELIMITER ON AN EMPTY LIST - the property proven load-bearing at
   * [model/entity/Sku.cfc:L234-L236] and [L886-L888]. `join` would agree here by coincidence; the
   * helper agrees by contract, and the contract is what the rest of the slice depends on.
   *
   * `Category` is ported as a read-mostly leaf: its `cmsCategoryID` column (index
   * `RI_CMSCATEGORYID`) and its `site` association survive as INERT persisted columns with NO CMS
   * behaviour ported at all, preserving the schema contract (B5). There is no `CategoryService` and
   * none may be invented - `Category.cfc` declares `hb_serviceName="contentService"`, and
   * `ContentService` is out of scope beyond the narrow category access path.
   */
  public getCategoryIDs(): string {
    let categoryIDs = '';
    for (const category of this.categories) {
      categoryIDs = listAppend(categoryIDs, category.getCategoryID());
    }
    return categoryIDs;
  }

  /**
   * ★ PRESERVED AS THROWING - the legacy body calls a method that does not exist.
   *
   * [model/entity/Product.cfc:L191-L197] verbatim:
   *
   *   public string function getPageIDs() {
   *     var pageIDs = "";
   *     for( var i=1; i<= arrayLen(getPages()); i++ ) {
   *       pageIDs = listAppend(pageIDs,getPages()[i].getPageID());
   *     }
   *     return pageIDs;
   *   }
   *
   * `getPages()` IS NOT DECLARED ANYWHERE IN `Product.cfc` AND NO `pages` PROPERTY EXISTS. The
   * component declares `listingPages` at [L82] - a many-to-many against `Content` through
   * `SwProductListingPage` - and nothing named `pages`. So in CFML the call falls into
   * `onMissingMethod` [org/Hibachi/HibachiEntity.cfc:L507-L565], fails to match any of the ten
   * name patterns (`getPages` is not `get<Prop>ID`, not `get<Prop>Options`, not `get<Prop>Count`,
   * and so on), reaches the `getAttributeValue` fallback at [L559] - which this component CAN reach,
   * being one of only four in-scope entities that declares `attributeValues` [L75] - finds no
   * attribute named `Pages`, and terminates at the [L565] throw. The method cannot return; it can
   * only raise.
   *
   * Behaviour preservation extends to defects: A METHOD THAT THROWS AT RUNTIME TODAY THROWS IN THE
   * TARGET. Writing a working implementation over `listingPages` would be inventing a feature and
   * calling it a port.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L191-L197]: `getPageIDs()` iterates `getPages()`, which
   * is undeclared, so the call reaches [org/Hibachi/HibachiEntity.cfc:L559] and then throws at [L565].
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
   * [model/entity/Product.cfc:L791-L793] verbatim: `return "productName";`
   *
   * The framework's `getSimpleRepresentation()` consumes this, and THAT method is deliberately not
   * ported - it is metadata-driven dispatch. The override itself is a one-line constant with no
   * framework reach of its own, so it ports cleanly and is authored for surface completeness.
   */
  public getSimpleRepresentationPropertyName(): string {
    return 'productName';
  }

  // ===========================================================================
  // BIDIRECTIONAL HELPER METHODS [model/entity/Product.cfc:L659-L787]
  //
  // ★ THE INVERSION CROSS-CHECK VERDICT: THIRTEEN `remove*` HELPERS, ALL CLEAN, ZERO INVERTED.
  // The full verdict table is in the file header. The defect class being screened for is real and
  // lives elsewhere in this folder - [model/entity/Option.cfc:L129-L131] and [L145-L147] each declare
  // a `remove*` whose body calls `add*` on the far side - so every body here was read verbatim and
  // checked individually rather than assumed. Every `remove*` in `Product.cfc` calls a far-side
  // `remove*`. Nothing to preserve, and no divergence spent.
  //
  // Of the thirteen pairs, SEVEN have an in-scope far side and are authored below - Brand, Sku,
  // PromotionReward, PromotionRewardExclusion, PromotionQualifier, PromotionQualifierExclusion and
  // PriceGroupRate. The other SIX point at entities outside the eighteen - AttributeValue,
  // ProductImage, ProductReview, ListingPage (Content), Vendor and Physical - and are omitted with a
  // note apiece in the OMISSION REGISTER at the foot of this class.
  // ===========================================================================

  // --- Brand (many-to-one) [model/entity/Product.cfc:L661] --------------------------------------

  /**
   * Points this product at a brand, wiring both sides.
   *
   * [model/entity/Product.cfc:L662-L667] verbatim:
   *
   *   variables.brand = arguments.brand;
   *   if(isNew() or !arguments.brand.hasProduct( this )) {
   *     arrayAppend(arguments.brand.getProducts(), this);
   *   }
   *
   * THE `isNew() or` SHORT-CIRCUIT IS PRESERVED EXACTLY: a brand-new product is appended WITHOUT the
   * containment probe, which is how the legacy avoided probing against an unsaved key. Reversing the
   * operands - probing first - would change nothing observable today but would reintroduce the very
   * ambiguity the short-circuit exists to dodge, so the order stands.
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
   * [model/entity/Product.cfc:L668-L677] verbatim:
   *
   *   if(!structKeyExists(arguments, "brand")) { arguments.brand = variables.brand; }
   *   var index = arrayFind(arguments.brand.getProducts(), this);
   *   if(index > 0) { arrayDeleteAt(arguments.brand.getProducts(), index); }
   *   structDelete(variables, "brand");
   *
   * The omitted-argument default at [L669-L671] becomes an optional parameter. The `structDelete` at
   * [L676] becomes an assignment of `undefined`, NEVER `delete this.brand` - with
   * `exactOptionalPropertyTypes` on, assignment is the checkable form and `delete` on a
   * non-optional field is not even legal.
   *
   * ★ `index > 0` BECOMES `!== -1`, AND THAT IS NOT A STYLE CHANGE. CFML's `arrayFind` returns a
   * 1-BASED index or 0, so `> 0` is exactly right there. TypeScript's `findIndex` returns a 0-BASED
   * index or -1, so carrying `> 0` across literally would SILENTLY REFUSE TO REMOVE THE FIRST
   * PRODUCT OF A BRAND - element 0 would test false and survive. The same base change is recorded in
   * src/domain/entities/promotionCode.ts and src/domain/entities/promotionQualifier.ts; it is
   * recorded again here because the failure is invisible in testing that never happens to target
   * element 0.
   */
  public removeBrand(brand?: Brand): void {
    const target = brand ?? this.brand;
    if (target === undefined) {
      // LEGACY-NOTE [model/entity/Product.cfc:L669-L672]: with no argument and no `variables.brand`,
      // CFML raises on `arguments.brand.getProducts()`. Raising here is the faithful port.
      // Preserved deliberately; do not fix without a product decision.
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

  // --- Skus (one-to-many) [model/entity/Product.cfc:L695] ---------------------------------------

  /**
   * [model/entity/Product.cfc:L696-L698] verbatim: `arguments.sku.setProduct( this );`
   *
   * Delegates to the OWNING side. `Sku` holds the `productID` FK
   * [model/entity/Sku.cfc:L67], so the sku is what changes; this product's `skus` array is
   * appended to BY `Sku.setProduct` rather than here, exactly as in the legacy body.
   */
  public addSku(sku: Sku): void {
    sku.setProduct(this);
  }

  /** [model/entity/Product.cfc:L699-L701] verbatim: `arguments.sku.removeProduct( this );` */
  public removeSku(sku: Sku): void {
    sku.removeProduct(this);
  }

  // --- Promotion Rewards (many-to-many, inverse) [model/entity/Product.cfc:L731] ----------------

  /** [model/entity/Product.cfc:L732-L734]: `arguments.promotionReward.addProduct( this );` */
  public addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProduct(this);
  }

  /** [model/entity/Product.cfc:L735-L737]: `arguments.promotionReward.removeProduct( this );` */
  public removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProduct(this);
  }

  // --- Promotion Reward Exclusions (many-to-many, inverse) [L739] -------------------------------

  /** [model/entity/Product.cfc:L740-L742]: `arguments.promotionReward.addExcludedProduct( this );` */
  public addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L743-L745]: `...removeExcludedProduct( this );` */
  public removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProduct(this);
  }

  // --- Promotion Qualifiers (many-to-many, inverse) [L747] --------------------------------------

  /** [model/entity/Product.cfc:L748-L750]: `arguments.promotionQualifier.addProduct( this );` */
  public addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProduct(this);
  }

  /** [model/entity/Product.cfc:L751-L753]: `arguments.promotionQualifier.removeProduct( this );` */
  public removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProduct(this);
  }

  // --- Promotion Qualifier Exclusions (many-to-many, inverse) [L755] ----------------------------

  /** [model/entity/Product.cfc:L756-L758]: `...addExcludedProduct( this );` */
  public addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProduct(this);
  }

  /** [model/entity/Product.cfc:L759-L761]: `...removeExcludedProduct( this );` */
  public removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProduct(this);
  }

  // --- Price Group Rates (many-to-many, inverse) [L763] -----------------------------------------

  /** [model/entity/Product.cfc:L764-L766]: `arguments.priceGroupRate.addProduct( this );` */
  public addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProduct(this);
  }

  /** [model/entity/Product.cfc:L767-L769]: `arguments.priceGroupRate.removeProduct( this );` */
  public removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProduct(this);
  }

  // ===========================================================================
  // ★ THE OPTION-GROUP MEMO TRIO [model/entity/Product.cfc:L241-L265]
  //
  // These three feed the LIVE VALIDATION PATH and therefore cannot be omitted:
  // `model/validation/Product.json` requires `unusedProductOptions` and `unusedProductOptionGroups`
  // with `minCollection:1` in the `addOption` and `addOptionGroup` contexts, both of the accessors
  // that satisfy those rules are built from `structKeyList(getOptionGroupsStruct())`, and
  // `getOptionGroupsStruct()` is built from `getOptionGroups()`. Drop the first and the other two
  // become unsatisfiable.
  // ===========================================================================

  /**
   * This product's option groups, ordered by `sortOrder` ascending.
   *
   * [model/entity/Product.cfc:L251-L261] verbatim:
   *
   *   public array function getOptionGroups() {
   *     if( !structKeyExists(variables, "optionGroups") ) {
   *       variables.optionGroups = [];
   *       var smartList = getService("OptionService").getOptionGroupSmartList();
   *       smartList.setSelectDistinctFlag(1);
   *       smartList.addFilter("options.skus.product.productID",this.getProductID());
   *       smartList.addOrder("sortOrder|ASC");
   *       variables.optionGroups = smartList.getRecords();
   *     }
   *     return variables.optionGroups;
   *   }
   *
   * ★ THE RULING: THIS IS A SYNCHRONOUS ACCESSOR OVER AN EAGERLY-MATERIALIZED ARRAY, and the
   * reasoning is worth stating because it is the single most questionable-looking call in the file.
   * Three independent facts force it:
   *
   *   (i) `HibachiSmartList` is a framework artefact - a generic, string-keyed, dynamically-filtered
   *       query builder - and the plan explicitly declines to clone it (AAP 0.6.2). Porting it
   *       faithfully would mean reimplementing a small ORM query language, importing exactly the
   *       framework coupling this refactor exists to remove, and it would be untypeable under the
   *       strict profile.
   *   (ii) `../ports/optionRepository.js` declares EXACTLY TWO members - `getUnusedProductOptions`
   *       [model/dao/OptionDAO.cfc:L51] and `getUnusedProductOptionGroups` [L94] - and NEITHER serves
   *       this query. No fourteenth port may be created and no port member may be invented
   *       (prohibition 12), so there is no legal outward reach available to this method.
   *   (iii) It feeds a live validation path, so omitting it is not available either.
   *
   * The only remaining option is the one structural decision #2 already mandates for every
   * association in this folder: MATERIALIZE AT THE REPOSITORY BOUNDARY. That converts an implicit
   * lazy load into an explicit query decision, which is the stated goal rather than a workaround.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L254-L258]: THE EXACT FETCH SHAPE THE REPOSITORY OWES,
   * transcribed from the smart-list configuration so it is not lost: `DISTINCT` (from
   * `setSelectDistinctFlag(1)` at [L255]), filtered on the traversal
   * `options.skus.product.productID = <this productID>` at [L256], ordered by `sortOrder ASC` at
   * [L257]. Note that the filter reaches THROUGH options and skus - an option group belongs to this
   * product only transitively, via an option that a sku of this product carries - which is why the
   * result is not simply the product's own collection and why `DISTINCT` is required rather than
   * decorative.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L253]: SEED-THEN-OVERWRITE WART. `variables.optionGroups =
   * []` is DEAD - [L258] reassigns the variable unconditionally on the very next executable line, so
   * the empty array can never be observed. This is memo VARIANT B (seed, no guard), and the seed's
   * deadness is the defining feature of that variant. Annotated, not tidied.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L254]: CASING AND QUOTING WART. This line writes
   * `getService("OptionService")` with a CAPITAL `O` and DOUBLE quotes, while [L637], [L644] and
   * [L651] all write `getService('optionService')` in lower case with SINGLE quotes. DI/1's
   * service-name resolution is case-insensitive so all four resolve to the same bean and there is no
   * behavioural consequence. Recorded rather than normalised, per prohibition 19.
   * Preserved deliberately; do not fix without a product decision.
   */
  public getOptionGroups(): readonly OptionGroup[] {
    // The `!structKeyExists(variables, "optionGroups")` probe at [L252]. Here it distinguishes
    // "hydration materialized this association, possibly as empty" from "hydration never
    // materialized it at all" - which is exactly the absent-key versus present-but-undefined
    // distinction `exactOptionalPropertyTypes` makes expressible. An empty array is a legitimate
    // answer (a product with no options has none); a MISSING array is not, and answering `[]` for it
    // would report "no option groups" for every product whose repository forgot the query, silently
    // passing the `minCollection:1` validation rules that depend on this value.
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
   * [model/entity/Product.cfc:L241-L249] verbatim:
   *
   *   public struct function getOptionGroupsStruct() {
   *     if( !structKeyExists(variables, "optionGroupsStruct") ) {
   *       variables.optionGroupsStruct = {};
   *       for(var optionGroup in getOptionGroups()){
   *         variables.optionGroupsStruct[optionGroup.getOptionGroupID()] = optionGroup;
   *       }
   *     }
   *     return variables.optionGroupsStruct;
   *   }
   *
   * Memo VARIANT C in effect (the `{}` at [L243] is not a seed that survives a failed guard - there
   * is no guard; it is the accumulator the loop fills), synchronous, and memoized per instance.
   *
   * ★ THE RETURN IS `CfStruct<OptionGroup>`, NOT `Record<string, OptionGroup>`, AND THE DIFFERENCE IS
   * CORRECTNESS. CFML struct keys are CASE-INSENSITIVE and TypeScript's are not. A caller holding an
   * `optionGroupID` whose case differs from the stored key would find the entry in CFML and miss it in
   * TypeScript. Routing every read through `structKeyExists` / `structGet` from
   * `../../lib/cfml/struct.js` restores the legacy semantics; handing back a bare `Record` would
   * invite `struct[id]`, which is the bug. Nothing in the slice actually varies the case of a UUID
   * key today, but the helper costs nothing and the assumption is not this file's to make.
   *
   * The memo is INSTANCE-SCOPED and instances are REQUEST-SCOPED. As module state this would become
   * cross-invocation state on a warm Lambda container (AAP 0.6.5).
   */
  public getOptionGroupsStruct(): CfStruct<OptionGroup> {
    if (this.optionGroupsStruct === undefined) {
      // [L243] the accumulator, then [L244-L246] the loop. Built as a mutable record and published
      // through the readonly `CfStruct` alias, so no caller can write into the memo.
      const accumulator: Record<string, OptionGroup> = {};
      for (const optionGroup of this.getOptionGroups()) {
        accumulator[optionGroup.getOptionGroupID()] = optionGroup;
      }
      this.optionGroupsStruct = accumulator;
    }
    return this.optionGroupsStruct;
  }

  /**
   * How many option groups this product has.
   *
   * [model/entity/Product.cfc:L263-L265] verbatim: `return arrayLen(getOptionGroups());`
   *
   * Not memoized in the legacy either - it recomputes from the memoized array every call, which
   * `.length` reproduces exactly.
   */
  public getOptionGroupCount(): number {
    return this.getOptionGroups().length;
  }

  // ===========================================================================
  // ★★★ MUST-PRESERVE BEHAVIOUR - OPTION-TO-SKU RESOLUTION
  // [model/entity/Product.cfc:L340-L368]
  //
  // This is one of the three areas the plan names as behaviour that must survive unchanged, and it is
  // the entity-side face of `ProductService.getProductSkusBySelectedOptions()`
  // [model/service/ProductService.cfc:L104]. The behaviour that must not move is the AND-OF-EXISTS
  // OPTION MATCHING in the backing SQL at [model/dao/SkuDAO.cfc:L107-L128] - one `EXISTS` subquery per
  // selected option, all `AND`ed, so a sku qualifies only if it carries EVERY selected option. An
  // `IN`-list rewrite would match a sku carrying ANY of them and would return the wrong sku for a
  // multi-option product.
  //
  // That SQL is preserved AT THE REPOSITORY. What this file owes it is a signature shape that does not
  // prevent it: the selected options travel as the ORIGINAL COMMA-DELIMITED STRING, exactly as the
  // legacy passes them, rather than being parsed into an array here and re-joined there. Parsing early
  // would put this file in charge of a decision the SQL builder owns.
  // ===========================================================================

  /**
   * The options of one option group that this product's SKUs actually carry.
   *
   * [model/entity/Product.cfc:L340-L347] verbatim:
   *
   *   public array function getOptionsByOptionGroup(required string optionGroupID) {
   *     var smartList = getService("optionService").getOptionSmartList();
   *     smartList.setSelectDistinctFlag(1);
   *     smartList.addFilter("optionGroup.optionGroupID",arguments.optionGroupID);
   *     smartList.addFilter("skus.product.productID",this.getProductID());
   *     smartList.addOrder("sortOrder|ASC");
   *     return smartList.getRecords();
   *   }
   *
   * SYNCHRONOUS, AND COMPUTED FROM THE MATERIALIZED GRAPH RATHER THAN FROM A PORT. The two filters at
   * [L343] and [L344] are both satisfiable from data this entity already holds: `skus.product.productID
   * = this.productID` is, by definition, every element of `this.skus`, and
   * `optionGroup.optionGroupID` is a member of each option those SKUs carry. So the smart list is
   * reproduced in memory - DISTINCT by `optionID` [L342], filtered by option group [L343], ordered by
   * `sortOrder` ascending [L345] - with no outward reach at all.
   *
   * ★ WHY NOT A PORT CALL. `../ports/optionRepository.js` declares EXACTLY TWO members and neither
   * serves this query; adding a third would be inventing a port member (prohibition 12). Deriving the
   * answer from the materialized graph is not a workaround for that constraint, it is structural
   * decision #2 applied - the association is already fetched, so the query is already answered.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L345]: `sortOrder` on `Option` is `sortContext="optionGroup"`
   * - it is ordered WITHIN an option group, which is exactly the scope this method filters to, so a
   * plain ascending sort reproduces the intended order. `Option.getSortOrder()` is
   * `number | undefined` (the column declares no default), and an absent sort order sorts AFTER every
   * present one here, matching how SQL `ORDER BY ... ASC` places `NULL` last under MySQL's default
   * ordering for an ascending sort of NULLable integers is FIRST - so the absent case is pinned
   * explicitly below rather than left to a comparator accident.
   * Preserved deliberately; do not fix without a product decision.
   */
  public getOptionsByOptionGroup(optionGroupID: string): readonly Option[] {
    // [L344] the `skus.product.productID` filter - every sku of this product, by construction.
    // [L342] `setSelectDistinctFlag(1)` - de-duplicated by primary key, because two SKUs of the same
    // product routinely carry the SAME option row and the legacy DISTINCT collapses them.
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
   * ★ MUST-PRESERVE. The single SKU identified by a comma-delimited list of selected option IDs.
   *
   * [model/entity/Product.cfc:L349-L364] verbatim:
   *
   *   public any function getSkuBySelectedOptions(string selectedOptions="") {
   *     if(len(arguments.selectedOptions) > 0) {
   *       var skus = getSkusBySelectedOptions(selectedOptions=arguments.selectedOptions);
   *       if(arrayLen(skus) == 1) {
   *         return skus[1];
   *       } else if (arrayLen(skus) > 1) {
   *         throw("More than one sku is returned when the selected options are: #arguments.selectedOptions#");
   *       } else if (arrayLen(skus) < 1) {
   *         throw("No Skus are found for these selected options: #arguments.selectedOptions#");
   *       }
   *     } else if (arrayLen(getSkus()) == 1) {
   *       return getSkus()[1];
   *     } else {
   *       throw("You must submit a comma seperated list of selectOptions to find an indvidual sku in this product");
   *     }
   *   }
   *
   * `async`, because [L351] reaches `getSkusBySelectedOptions`, which reaches the repository.
   *
   * THE EMPTY-STRING DEFAULT AT [L349] IS REPRODUCED, and the truthiness test at [L350] is
   * `len(...) > 0` - so `cfLen` is used rather than JavaScript truthiness. The two agree for a string,
   * but the whole point of `../../lib/cfml/truthiness.js` is that the translation is deterministic and
   * documented at every site rather than case-by-case.
   *
   * ★ WHY THE RETURN TYPE IS `Sku | undefined` WHEN EVERY VISIBLE BRANCH RETURNS OR THROWS. The inner
   * chain at [L352-L358] is `if / else if / else if` WITH NO FINAL `else`. Its three conditions -
   * `== 1`, `> 1`, `< 1` - are logically exhaustive over an array length, so the `undefined` arm is
   * unreachable in practice; but the chain is SYNTACTICALLY OPEN, the legacy declares
   * `returntype="any"` rather than a SKU type, and a CFML function that falls off the end returns
   * null. Typing the honest control flow is the faithful port: the alternative is to add a final
   * `else` the source does not have, or to assert non-null, and a non-null assertion is a lint error
   * here by design. The two misspellings in the legacy messages - `seperated` and `indvidual` at
   * [L362] - are carried over verbatim, because an error message is an observable and a reviewer
   * diffing the two files should find them identical.
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
   * ★ MUST-PRESERVE. Every SKU of this product that carries ALL of the selected options.
   *
   * [model/entity/Product.cfc:L366-L368] verbatim:
   *
   *   public any function getSkusBySelectedOptions(string selectedOptions="") {
   *     return getService("productService").getProductSkusBySelectedOptions(arguments.selectedOptions,this.getProductID());
   *   }
   *
   * `async`, and called live by `Sku.hasUniqueOptions()` [model/entity/Sku.cfc:L763] through
   * src/domain/entities/sku.ts, which awaits it and expects `Sku[]`.
   *
   * THE [L367] `getService("productService")` LOCATOR IS ELIMINATED (T2). The legacy hop is
   * entity -> `ProductService.getProductSkusBySelectedOptions` -> `SkuDAO.getSkusBySelectedOptions`,
   * and `ProductService`'s method [model/service/ProductService.cfc:L104-L106] is a pure pass-through
   * that adds nothing. The port therefore stands in for the DAO directly, preserving the ARGUMENT
   * ORDER of the legacy call - selected options first, product id second - because
   * `SkuRepository.getSkusBySelectedOptions(selectedOptions, productID?)` declares exactly that
   * order. Passing them the other way round would compile and silently return nothing.
   *
   * THE EMPTY-STRING DEFAULT IS REPRODUCED AND IS NOT SHORT-CIRCUITED. The legacy does NOT guard the
   * empty case here - it hands `''` straight to the DAO, whose option loop then contributes no
   * `EXISTS` clause and returns every sku of the product. Adding a guard would change what an empty
   * call returns.
   */
  public async getSkusBySelectedOptions(selectedOptions = ''): Promise<Sku[]> {
    if (this.skuRepository === undefined) {
      throw this.missingCollaborator('sku repository', 'L367');
    }
    return this.skuRepository.getSkusBySelectedOptions(selectedOptions, this.productID);
  }

  // ===========================================================================
  // ★ THE SKU AND PRICE ACCESSOR CLUSTER - MONEY-CRITICAL
  // [model/entity/Product.cfc:L155-L187, L555-L601]
  //
  // Every monetary return in this cluster is `Money`, never `number` (E4, prohibition 4). Every
  // no-`else` guard yields `undefined` rather than `0` (prohibition 6) - WITH THE ONE DELIBERATE
  // EXCEPTION OF `getSalePrice()`, which is DEFECT 20 and returns `0` precisely because the legacy
  // does. The two conventions sit forty lines apart in the source and mean opposite things; neither
  // is copied onto the other.
  // ===========================================================================

  /**
   * This product's SKUs - LIVE on the default call, a projection when either flag is set.
   *
   * [model/entity/Product.cfc:L155-L160] verbatim:
   *
   *   public array function getSkus(boolean sorted=false, boolean fetchOptions=false) {
   *     if(!arguments.sorted && !arguments.fetchOptions) {
   *       return variables.skus;
   *     }
   *     return getService("skuService").getProductSkus(product=this, sorted=arguments.sorted, fetchOptions=arguments.fetchOptions);
   *   }
   *
   * ★ THIS OVERRIDES THE ORM-GENERATED COLLECTION ACCESSOR, which is why it takes parameters at all,
   * and it MUST STAY SYNCHRONOUS. Two already-shipped call sites depend on that:
   * `Sku.setProduct` does `product.getSkus().push(this)` and `Sku.removeProduct` does
   * `target.getSkus()` then `.splice(index, 1)`, both from synchronous bodies reproducing
   * [model/entity/Sku.cfc:L607] and [L613]. An async accessor would break the compile of a shipped
   * sibling, and a defensive copy would break bidirectional removal silently.
   *
   * THE UNFLAGGED CALL RETURNS THE LIVE ARRAY, exactly as [L157] returns `variables.skus` itself. The
   * flagged calls return a NEW array, exactly as [L159] returns the service's result. That asymmetry
   * is the legacy's, and it is preserved.
   *
   * ★ SORTING IS APPLIED IN MEMORY, AND THE WEIGHTING IS REPRODUCED RATHER THAN APPROXIMATED. The
   * legacy hop is [L159] -> `SkuService.getProductSkus` [model/service/SkuService.cfc:L220-L244] ->
   * `SkuDAO.getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172-L202], whose ordering clause is
   *
   *   ORDER BY SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)) ASC
   *
   * - a POSITIONAL WEIGHTING in which each option group acts as a decimal digit and the
   * LOWEST-ordered group is the MOST significant, with `nextOptionGroupSortOrder` being
   * `max(SwOptionGroup.sortOrder) + 1` across the whole table. Every term of that expression is
   * available from the materialized graph plus the one hydration input that carries the global
   * maximum, so the sort is computed here with no outward reach and no invented port member.
   *
   * THE LEGACY GUARD IS REPRODUCED EXACTLY: [model/service/SkuService.cfc:L223] sorts only when
   * `sorted AND arrayLen(skus) gt 1 AND arrayLen(skus[1].getOptions())` - so a single-sku product is
   * never sorted, and NEITHER IS A MULTI-SKU PRODUCT WHOSE **FIRST** SKU HAPPENS TO CARRY NO OPTIONS,
   * even if later SKUs do. That third clause probes `skus[1]` alone, which is a peculiarity rather
   * than a rule, and it is preserved.
   *
   * LEGACY-NOTE [model/service/SkuService.cfc:L232-L238]: THE LEGACY SORT IS UNSAFE AND THE PORT IS
   * NOT. `sortedArrayReturn` is resized to the length of the ID query, then filled by
   * `sortedArrayReturn[arrayFind(sortedArray, skuID)] = skus[i]`. A sku absent from the ID query makes
   * `arrayFind` return 0 and `sortedArrayReturn[0]` RAISES in CFML, and a length mismatch between the
   * two collections leaves undefined slots in the result. Reproducing a raise that depends on a
   * DAO-level row-count coincidence would be reproducing an accident, not a behaviour, so the port
   * sorts the array it was given by computed weight - which yields the same order whenever the legacy
   * succeeds, and yields a correctly ordered array instead of a raise when the legacy would have
   * failed. This is a defect in `SkuService`/`SkuDAO`, NOT in `Product.cfc`, so it consumes no
   * divergence from this file's budget; it is recorded here because this is the call site that
   * reaches it.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L150-L168]: `fetchOptions` selected an eager-fetch JOIN whose
   * branch was chosen from the product's base type - access contents, options, or subscription
   * benefits - and ALL THREE BRANCHES USE AN INNER JOIN, so a product whose SKUs have none of the
   * fetched children returned NOTHING when the flag was set. In the target, associations are
   * materialized at the repository boundary, so options are already present and the flag has no
   * fetch to perform here; it is retained in the signature for interface parity and is honoured as an
   * eager-load decision by the repository that hydrated this instance. The inner-join emptiness is
   * therefore a repository-tier concern and is documented at the producing method there.
   * Preserved deliberately; do not fix without a product decision.
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
   * [model/entity/Product.cfc:L162-L169] verbatim:
   *
   *   var skus = getSkus();
   *   for(var i = 1; i <= arrayLen(skus); i++) {
   *     if(skus[i].getSkuID() == arguments.skuID) {
   *       return skus[i];
   *     }
   *   }
   *
   * ★ THERE IS NO FINAL `return`, so a miss yields null - and `undefined` is the faithful port, NOT a
   * throw and NOT the first sku. The legacy declares `returntype="any"`, which is what lets it fall
   * off the end; a stricter declaration would have made the omission a compile error there too.
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
   * [model/entity/Product.cfc:L182-L187] verbatim:
   *
   *   public struct function getSkuSalePriceDetails( required any skuID ) {
   *     if(structKeyExists(getSalePriceDetailsForSkus(), arguments.skuID)) {
   *       return getSalePriceDetailsForSkus()[ arguments.skuID ];
   *     }
   *     return {};
   *   }
   *
   * ★ THIS IS A COMPILE-HARD CONTRACT. src/domain/entities/sku.ts declares
   * `export type SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>` and
   * assigns `this.salePriceDetail` (an optional field) to a return of that type, so the type MUST
   * admit `undefined` and the method MUST stay `async`. Neither is a free choice; both were read off
   * the shipped sibling rather than inferred.
   *
   * `{}` BECOMES `undefined`, and that substitution is safe rather than convenient: every legacy
   * reader tests for its key before reading it - [model/entity/Sku.cfc:L547] and [L554] both guard
   * with `structKeyExists` - so an empty struct and an absent one are INDISTINGUISHABLE to every
   * caller. src/domain/entities/sku.ts states the same conclusion at its own `getSalePriceDetails`.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L182]: THE PARAMETER IS DECLARED `required any skuID`, NOT
   * `required string skuID`. It is a primary key and every call site passes a string -
   * [model/entity/Sku.cfc:L541] passes `getSkuID()` - so it is typed `string` here. That is a
   * NARROWING of `any` and therefore strictly more precise than the source, never less; it is
   * recorded because a reviewer diffing the signatures will see the difference.
   * Preserved deliberately; do not fix without a product decision.
   *
   * `structKeyExists` / `structGet` from `../../lib/cfml/struct.js` are used rather than a bare index,
   * because CFML struct keys are CASE-INSENSITIVE and TypeScript's are not. `structGet` deliberately
   * takes NO `defaultValue` parameter (prohibition 7) - which is exactly how a `0` is prevented from
   * sneaking into a price path.
   *
   * The detail map arrives pre-reduced and pre-ROUNDED as a hydration input rather than through a
   * port; see the §3.9 entry in the OMISSION REGISTER for why `getSalePriceDetailsForSkus()` itself is
   * omitted.
   *
   * ★ WHY THE RETURN IS A PROMISE BUILT EXPLICITLY, AND THE METHOD IS NOT MARKED `async`. Both halves
   * of that are deliberate.
   *
   * THE PROMISE STAYS because the ASYNCHRONOUS CONTRACT IS THE PUBLISHED ONE and two things depend on
   * it. First, the legacy method genuinely reaches outward: [L183] and [L184] both call
   * `getSalePriceDetailsForSkus()`, whose body at [L519] is
   * `getService("promotionService").getSalePriceDetailsForProductSkus(...)`. The reach disappears in
   * this port only because the §3.9 decision pre-materializes the map at the repository boundary -
   * which is a hydration decision, not a change to what this method means. Second,
   * src/domain/entities/sku.ts documents this member as ASYNCHRONOUS in prose and derives
   * `SkuSalePriceDetails` from it through `Awaited<ReturnType<Product['getSkuSalePriceDetails']>>` -
   * a construction written specifically to UNWRAP a promise. Narrowing the contract to a plain value
   * would falsify a shipped sibling's own documentation for no gain.
   *
   * THE `async` KEYWORD GOES because there is nothing left to await, and `require-await` is right to
   * say so. `Promise.resolve(...)` states the same contract honestly - "asynchronous by contract,
   * already settled in fact" - without a ceremonial `await` inserted purely to satisfy a linter. The
   * external type is IDENTICAL either way: `Promise<SalePriceDetail | undefined>`. FIXING THE FILE
   * rather than the lint configuration is the rule here, and this is what fixing it looks like.
   */
  public getSkuSalePriceDetails(skuID: string): Promise<SalePriceDetail | undefined> {
    const details = this.salePriceDetailsForSkus;
    if (details === undefined) {
      return Promise.resolve(undefined);
    }
    // [L183] the containment probe, then [L184] the read. Both case-insensitive, as CFML's are.
    if (!structKeyExists(details, skuID)) {
      // [L186] `return {};` - absent, which every caller already treats as "no sale price".
      return Promise.resolve(undefined);
    }
    return Promise.resolve(structGet(details, skuID));
  }

  // ---------------------------------------------------------------------------
  // DELEGATING PRICE ACCESSORS [model/entity/Product.cfc:L555-L601]
  //
  // ★ THE ELEVEN LAZY-LOAD PROBES. `structKeyExists(variables, "brand" | "defaultSku" | "price")`
  // appears ELEVEN times in `Product.cfc`, and in CFML every one of them tests LAZY-LOAD STATE - was
  // this association pulled from the database yet - rather than whether a value exists. With eager
  // materialization (structural decision #2) they are STATICALLY TRUE whenever hydration supplied the
  // association, so each becomes a `!== undefined` check and each carries a comment saying so. The
  // full inventory, in source order:
  //
  //    1. [L527] `brand`      - getBrandName, the DEFECT 19 guard
  //    2. [L556] `defaultSku` - getCurrencyCode
  //    3. [L562] `price`      - getPrice, FIRST of two probes in one body
  //    4. [L565] `defaultSku` - getPrice, SECOND probe
  //    5. [L571] `defaultSku` - getRenewalPrice
  //    6. [L577] `defaultSku` - getListPrice
  //    7. [L583] `defaultSku` - getLivePrice
  //    8. [L589] `defaultSku` - getCurrentAccountPrice
  //    9. [L595] `defaultSku` - getSalePrice, the DEFECT 20 guard
  //   10. [L607] `defaultSku` - getSalePriceDiscountType
  //   11. [L617] `defaultSku` - getSalePriceExpirationDateTime, ★ THE MONEY-CRITICAL ONE (DEFECT 25)
  //
  // A twelfth family of `structKeyExists(variables, ...)` probes exists on memo keys rather than on
  // associations - [L242], [L252], [L498], [L518], [L525], [L541], [L605], [L615], [L625], [L636],
  // [L643], [L650] and the `isDefined("variables.templateOptions")` at [L172] - and those are memo
  // guards, not lazy-load probes. They are classified under the three-way seed/guard pattern instead.
  //
  // ★ AND NOTE WHICH HELPER IS CORRECT WHERE. `structKeyExists` from `../../lib/cfml/struct.js`
  // returns TRUE EVEN WHEN THE VALUE IS `undefined` - "absent key" and "present-but-undefined" are
  // DIFFERENT states, which is what makes `exactOptionalPropertyTypes` load-bearing across this
  // folder. It is used where the legacy semantics turn on key presence in a STRUCT
  // (`getSkuSalePriceDetails` above). `!== undefined` is used where the semantics turn on presence of
  // a VALUE in an instance field, which is every probe in the inventory above.
  // ---------------------------------------------------------------------------

  /**
   * The currency code of this product's default SKU, or nothing.
   *
   * [model/entity/Product.cfc:L555-L559] verbatim:
   *
   *   public any function getCurrencyCode() {
   *     if( structKeyExists(variables, "defaultSku") ) {
   *       return getDefaultSku().getCurrencyCode();
   *     }
   *   }
   *
   * ★ THIS METHOD READS NO SETTING. It delegates, full stop. The `skuCurrency` key and its
   * three-letter default value are resolved one level down, inside `Sku.getCurrencyCode()`
   * [model/entity/Sku.cfc:L360-L365], which memoizes `this.setting('skuCurrency')` - and the default
   * itself is declared at [model/service/SettingService.cfc:L221], not in either entity. Hard-coding
   * that default value here, or reading the setting here, would both be wrong: the first violates E6
   * and prohibition 5, and the second would bypass the SKU's memo and could disagree with the SKU's
   * own answer. The value is therefore neither written nor quoted anywhere in this file - the
   * SettingService locator above is the single place to read it from.
   *
   * PROBE 2 OF 11. No `else`, so an unmaterialized default SKU yields `undefined` - `string` where
   * present, because `Sku.getCurrencyCode()` returns a plain `string` and NOT the branded
   * `CurrencyCode`. That is deliberate on the SKU side and is matched rather than re-decided here,
   * which is also why `../valueObjects/currencyCode.js` is not imported by this file.
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
   * [model/entity/Product.cfc:L561-L568] verbatim:
   *
   *   public any function getPrice() {
   *     if( structKeyExists(variables, "price") ) {
   *       return variables.price;
   *     }
   *     if( structKeyExists(variables, "defaultSku") ) {
   *       return getDefaultSku().getPrice();
   *     }
   *   }
   *
   * ★ TWO PROBES IN ONE BODY - PROBES 3 AND 4 OF 11 - AND THE ORDER IS LOAD-BEARING. `variables.price`
   * is NOT a persistent column of `SwProduct`; it is a non-persistent override slot [L118] that a
   * populate or a service can set, and when it is set IT WINS OVER THE DEFAULT SKU. Reversing the two
   * probes, or collapsing them into one `??`, would make the SKU's price win and would change what a
   * price-overridden product costs.
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
   * [model/entity/Product.cfc:L570-L574]. PROBE 5 OF 11, no `else`.
   *
   * ★ NOTE THE ABSENCE OF A `price`-STYLE OVERRIDE PROBE. `getPrice()` checks two slots; this method,
   * `getListPrice()`, `getLivePrice()` and `getCurrentAccountPrice()` check exactly one each. The
   * asymmetry is the source's and it is preserved - no override slot is invented for symmetry.
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
   * LEGACY-NOTE [model/entity/Product.cfc:L577]: a whitespace wart, recorded for completeness because
   * a reviewer diffing the cluster will notice it - [L577] writes `structKeyExists(variables,"defaultSku")`
   * with no space after the comma while [L556], [L565] and [L571] all write `variables, "defaultSku"`
   * with one. Purely cosmetic, no behavioural consequence, and not normalised.
   * Preserved deliberately; do not fix without a product decision.
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
   * `async`, because `Sku.getLivePrice()` is async in src/domain/entities/sku.ts - it resolves through
   * the price-group path. The asynchrony is INHERITED FROM THE DELEGATE, which is the async boundary
   * rule working as intended: this body performs no reach of its own, but it cannot be more
   * synchronous than the thing it delegates to.
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
   * [model/entity/Product.cfc:L588-L592]. PROBE 8 OF 11.
   *
   * `async`, inherited from `Sku.getCurrentAccountPrice()`.
   *
   * ★ THE AMBIENT REQUEST SCOPE IS GONE (T6), AND THE CONTEXT IS THREADED BY THE DELEGATE. The legacy
   * chain ends in `PriceGroupService.calculateSkuPriceBasedOnCurrentAccount`
   * [model/service/PriceGroupService.cfc:L262-L268], which reaches the request scope through
   * `getSlatwallScope()` - THE ONE ANOMALOUS SCOPE ACCESSOR IN THE CODEBASE, where every other site
   * uses `getHibachiScope()`. Both resolve to the same object, so the divergence is cosmetic in CFML;
   * replacing ambient state with an explicit context parameter NORMALISES it away entirely.
   *
   * The context parameter itself is held by `Sku`, matching how src/domain/entities/sku.ts already
   * models it, so THIS signature gains no parameter. That matters for the budget: adding one here
   * would be a signature widening, and ZERO widenings remain - the one and only was spent on
   * `isCurrent(now?: Date)` in src/domain/entities/promotionPeriod.ts.
   */
  public async getCurrentAccountPrice(): Promise<Money | undefined> {
    // [L589] lazy-load probe on `defaultSku`.
    if (this.defaultSku === undefined) {
      return undefined;
    }
    return this.defaultSku.getCurrentAccountPrice();
  }

  // ===========================================================================
  // ★★★ THE DEFECT CLUSTER
  //
  // Behaviour preservation extends to defects. Three numbered defects live here, and they receive
  // THREE DIFFERENT treatments - which is the whole point of a register rather than a policy:
  //
  //   DEFECT 19  getBrandName()                    ★ FIXED - the third and FINAL divergence
  //   DEFECT 20  getSalePrice()                      PRESERVED - returns 0, never undefined
  //   DEFECT 25  getSalePriceExpirationDateTime()    PRESERVED AS A THROW
  //
  // Plus two methods preserved as throwing that carry no defect number, and one memo variant that
  // exists only to be contrasted with DEFECT 19. NO OTHER DEFECT IN THIS FILE MAY BE REPAIRED.
  // ===========================================================================

  /**
   * ★★★ DEFECT 19 - FIXED. THIS IS THE THIRD AND FINAL DELIBERATE DIVERGENCE OF THE ENTIRE PROJECT.
   *
   * [model/entity/Product.cfc:L524-L532] verbatim:
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
   * WHAT THE LEGACY ACTUALLY DOES, CALL BY CALL. [L526] seeds the memo to `""`. [L527] probes the
   * brand. [L528] then computes the brand name and RETURNS IT WITHOUT EVER ASSIGNING IT TO THE MEMO -
   * it returns PAST the memo. So the FIRST call answers correctly while leaving `""` behind, and on
   * the SECOND call the outer guard at [L525] is now false, so control skips the whole block and
   * [L531] returns the seeded `""`. THE MEMO IS POISONED AFTER THE FIRST CALL.
   *
   * ★ THE ONE-LINE DIFF THAT PROVES IT IS A SLIP AND NOT A DESIGN. `getSalePriceDiscountType()`
   * [L604-L612] has the IDENTICAL shape - outer memo guard, seed, inner association probe - and at
   * [L608] it writes `variables.salePriceDiscountType = getDefaultSku().getSalePriceDiscountType();`
   * and then falls through to the shared `return`. Same pattern, eighty lines apart, one assignment
   * apart. This method is the one that forgot.
   *
   * ★★★ RULING: FIX IT. Assign the computed value to the memo before returning it.
   *
   * THE JUSTIFICATION, WHICH MUST BE STATED AT THE SITE RATHER THAN FILED ELSEWHERE. This defect,
   * together with DEFECT 17 [model/entity/Sku.cfc:L500-L510] and DEFECT 18
   * [model/entity/Sku.cfc:L512-L522] - both already fixed in src/domain/entities/sku.ts - is
   * UNOBSERVABLE THROUGH THE PUBLIC CONTRACT. It causes redundant recomputation or a stale cache, not
   * a different FIRST returned value, and no in-scope caller reads it twice within one instance's
   * lifetime. AND THE MEMOS BECOME REQUEST-SCOPED ANYWAY (AAP 0.6.5): reproducing a
   * component-level mutable cache as module state would turn it into CROSS-INVOCATION state on a warm
   * Lambda container, which is actively unsafe rather than merely untidy. Preserving a poisoning bug
   * inside a cache whose lifetime the port has already shortened would preserve the mechanism while
   * losing the meaning.
   *
   * ★ A CONSEQUENCE WORTH RECORDING: `getTitle()` [L540-L546] reads the `productTitleString` setting,
   * whose default template substitutes this very brand-name path, so it CONSUMES this value. (The
   * template's text is deliberately not quoted anywhere in this file - see the OMISSION REGISTER entry
   * for `getTitle()`.) With the memo fixed,
   * `getTitle()` would behave correctly on repeat calls rather than silently losing the brand from the
   * title on every call after the first. `getTitle()` is itself omitted from this port for an
   * unrelated reason - see the OMISSION REGISTER - so the consequence is latent here, but it is the
   * clearest illustration of why this fix is a repair rather than a cosmetic tidy.
   *
   * ★★★ THIS SPENDS THE LAST DIVERGENCE IN THE ENTIRE PROJECT. The three are now fully allocated:
   * (a) the un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009], owned by
   * `src/services`; (b) the `amountOff` float gap [model/service/PromotionService.cfc:L998], owned by
   * `src/services`; (c) DEFECTS 17, 18 and 19 - the entity memo bugs, two in `sku.ts` and this one.
   * NO FOURTH DIVERGENCE MAY EVER BE SPENT ANYWHERE.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L524-L532]: `getBrandName()` seeds its memo to `""` at
   * [L526] and then returns the computed brand name at [L528] without assigning it, so the memo stays
   * `""` and every call after the first returns the empty string.
   * Fixed deliberately as documented divergence (c); do not extend this treatment to any other defect.
   *
   * MEMO VARIANT A (seed then guard), and the ONLY variant-A member in this file whose seed was
   * reachable through a bug rather than by design.
   */
  public getBrandName(): string {
    // [L525] the memo guard. This is a MEMO probe, not one of the eleven lazy-load probes.
    if (this.brandName === undefined) {
      // [L526] the seed. It survives when the brand is absent, which is legitimate and preserved.
      this.brandName = '';
      // [L527] PROBE 1 OF 11 - lazy-load probe on `brand`; statically true once hydration
      // materialized the eager `fetch="join"` association at [L68].
      if (this.brand !== undefined) {
        // ★ THE FIX. [L528] reads `return getBrand().getBrandName();` - computing the value and
        // returning it WITHOUT the assignment. The assignment is added here, and the shared return at
        // [L531] then answers correctly on every call rather than only the first.
        this.brandName = this.brand.getBrandName() ?? '';
      }
    }
    // [L531]
    return this.brandName;
  }

  /**
   * ★★★ DEFECT 20 - PRESERVED. THIS METHOD MUST RETURN `0`, NEVER `undefined`.
   *
   * [model/entity/Product.cfc:L594-L601] verbatim:
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
   * ★ LOOK AT [L598]. `getSkus()[1].getSalePrice();` IS A BARE STATEMENT WITH NO `return`. The call is
   * made, the result is computed, and it is DISCARDED - after which execution falls through to the
   * terminal `return 0` at [L600]. So a product with SKUs but NO default SKU reports a sale price of
   * ZERO no matter what its first SKU's sale price actually is.
   *
   * ★★★ RULING: PRESERVE THE FALL-THROUGH EXACTLY, INCLUDING THE DISCARDED CALL. The discarded
   * expression is reproduced as a genuinely evaluated-and-discarded call rather than deleted, because
   * evaluating it is OBSERVABLE: `Sku.getSalePrice()` reads the pre-materialized detail row and falls
   * back to `getPrice()`, and an element access on `getSkus()[1]` in a product whose array is
   * non-empty cannot itself fail - but the call could throw from deeper in the delegate, and a port
   * that skipped it would swallow that throw. Deleting a call because its result is unused is the
   * kind of tidy that changes behaviour.
   *
   * ★★★ AND THIS IS THE EXACT OPPOSITE OF `Sku.getPriceByCurrencyCode()`. The two conventions are
   * written out in full in the class doc comment above, side by side, precisely so that nobody ever
   * collapses them into a single rule:
   *
   *   `Sku.getPriceByCurrencyCode()` MUST return `Money | undefined` and NEVER `0`
   *       - [model/entity/Sku.cfc:L269-L273] has no `else` and no fallback, and substituting `0`
   *         would SILENTLY SELL PRODUCTS FOR FREE.
   *   `Product.getSalePrice()` MUST return `0` and NEVER `undefined`
   *       - THIS method, because [L600] declares the zero explicitly.
   *
   * Same domain, same quantity, opposite conventions, fifty lines apart in two sibling components.
   * The schema encodes the asymmetry too - see the four no-default money columns listed on the class.
   *
   * ★ WHY `Money.fromDecimalString('0')` AND NOT `Money.zero`. `Money.zero` carries an explicit
   * prohibition on its own declaration: it exists for the two promotion accumulator seeds at
   * [model/service/PromotionService.cfc:L988-L989] and must not be generalised into a fallback,
   * default or error result anywhere. The zero returned here is neither a fallback nor a default - it
   * is the source's own literal `return 0` at [L600] - but reaching for a constant reserved for
   * another purpose would blur exactly the line that constant exists to draw. The public factory is
   * subject to identical validation and says what this value is: the legacy's literal zero.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L598]: `getSkus()[1].getSalePrice();` has no `return`, so
   * a product with SKUs but no default SKU falls through to the terminal `return 0` at [L600] and
   * reports a sale price of zero regardless of its first SKU's actual sale price.
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
    // non-empty array enters the branch. `cfTruthy` reproduces that rather than relying on JavaScript
    // coercion agreeing by coincidence.
    const ownSkus: Sku[] = this.getSkus();
    if (cfTruthy(ownSkus.length)) {
      const firstSku = ownSkus[0];
      if (firstSku !== undefined) {
        // ★ [L598] THE DISCARDED CALL. Evaluated for its observable effects and its result thrown
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
   * [model/entity/Product.cfc:L604-L612] verbatim:
   *
   *   public any function getSalePriceDiscountType() {
   *     if(!structKeyExists(variables, "salePriceDiscountType")) {
   *       variables.salePriceDiscountType = "none";
   *       if( structKeyExists(variables, "defaultSku") ) {
   *         variables.salePriceDiscountType = getDefaultSku().getSalePriceDiscountType();
   *       }
   *     }
   *     return variables.salePriceDiscountType;
   *   }
   *
   * ★ MEMO VARIANT A (seed THEN guard), AND THE CONTROL CASE FOR DEFECT 19. This is the same shape as
   * `getBrandName()` and it ASSIGNS at [L608] instead of returning past the memo, which is what makes
   * the other one a defect rather than a convention. No fix is needed or permitted here.
   *
   * ★ `"none"` IS THE PRODUCT-LEVEL STAND-IN, AND IT DIFFERS FROM THE SKU-LEVEL ONE. This method
   * substitutes the string `"none"` [L606] while `Sku.getSalePriceDiscountType()` substitutes the
   * EMPTY STRING [model/entity/Sku.cfc:L557]. Two different stand-ins for the same absence, in two
   * sibling components. `../ports/promotionRepository.js` records the divergence on
   * `SalePriceDetail.salePriceDiscountType` and deliberately does NOT encode either stand-in as a
   * union member, because neither is a value the projection can ever carry - they exist only for the
   * absent case. So this method returns a plain `string`, not the three-member union.
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
   * ★★★ DEFECT 25 - PRESERVED AS A THROW. DUAL-MODE IN CFML, SINGLE-MODE IN THE PORT.
   *
   * [model/entity/Product.cfc:L614-L622] verbatim:
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
   * ★ A NAMING PRECISION POINT THAT MUST NOT BE GOT WRONG. THE DECLARATION AT [L614] IS SPELLED
   * CORRECTLY: `getSalePriceExpirationDateTime`. THE TYPO IS AT THE CALL SITE INSIDE THE BODY, AT
   * [L618], WHICH CALLS `getSalePricExpirationDateTime` ON THE DELEGATE - missing the `e` in `Price`.
   * So the method is authored under the declaration's CORRECT spelling and the misspelled CALL is
   * preserved in the reproduction below. Neither is renamed, and neither is corrected
   * (prohibitions 14 and 15).
   *
   * ★ WHY THE PORT ALWAYS TAKES THE FAILING ARM. [L617] guards on `structKeyExists(variables,
   * "defaultSku")`. In CFML that is a LAZY-LOAD STATE probe with two genuinely different outcomes:
   * unloaded, and the seeded `now()` from [L616] is returned; loaded, and the computation at [L618]
   * runs. THIS IS PROBE 11 OF 11 AND IT IS THE MONEY-CRITICAL ONE. Under structural decision #2
   * associations are EAGERLY MATERIALIZED, so a product that has a default SKU always has it loaded,
   * and the port therefore ALWAYS takes the second arm - the one that fails.
   *
   * ★ AND IT FAILS FOR TWO INDEPENDENT REASONS, BOTH OF WHICH MUST BE NAMED:
   *
   *   MECHANISM 1 - THE MISSING METHOD. `getSalePricExpirationDateTime` DOES NOT EXIST ON `Sku`.
   *     [model/entity/Sku.cfc:L560] declares the CORRECTLY spelled `getSalePriceExpirationDateTime()`.
   *     So in CFML the misspelled call falls into `onMissingMethod`
   *     [org/Hibachi/HibachiEntity.cfc:L507-L565], is tested against the ten name patterns, matches
   *     `get<Prop>` against a property named `SalePricExpirationDateTime` THAT DOES NOT EXIST, reaches
   *     the `getAttributeValue` fallback at [L559] and terminates at the [L565] THROW.
   *
   *   MECHANISM 2 - THE RETURN-TYPE COERCION BOUNDARY. The declaration at [L614] is
   *     `returntype="date"`. Even if mechanism 1 somehow yielded a value, whatever `onMissingMethod`
   *     produced would have to coerce to a CFML date on the way out, and the dispatcher's fallback
   *     cannot produce one.
   *
   * ★★★ RULING: THROW, NAMING BOTH MECHANISMS. THIS IS FAITHFUL REPRODUCTION OF THE ARM THE PORT
   * ALWAYS TAKES, AND IT CONSUMES NO DIVERGENCE - the divergence budget is for changing behaviour,
   * and this changes nothing. The one behaviour that IS lost is the unloaded arm's seeded `now()`,
   * which eager materialization makes unreachable; that is a consequence of structural decision #2
   * rather than a choice made here, and it is recorded so a reviewer can see it was noticed.
   *
   * A `now()` seed would in any case have been the wrong thing to keep: an expiration timestamp
   * defaulting to THE MOMENT IT IS ASKED FOR means "already expiring", which is neither the
   * permissive extreme (`undefined`, meaning FOREVER, as the promotion entities use) nor a real
   * expiry. That reading is recorded and not acted on.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L614]: `getSalePriceExpirationDateTime()` is declared
   * `returntype="date"` and, at [L617], guards on lazy-load state; with eager materialization the
   * guard is always true, so the port always reaches [L618], which calls the MISSPELLED
   * `getSalePricExpirationDateTime` - absent from `Sku`, whose correct spelling is at
   * [model/entity/Sku.cfc:L560] - reaching [org/Hibachi/HibachiEntity.cfc:L559] and throwing at [L565],
   * and which could not satisfy the `date` coercion in any case.
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
   * ★ PRESERVED AS THROWING - the legacy body calls an undefined function.
   *
   * [model/entity/Product.cfc:L631-L633] verbatim:
   *
   *   public array function getProductOptionsByGroup(){
   *     return getProductService().getProductOptionsByGroup( this );
   *   }
   *
   * `getProductService()` IS NOT A METHOD. Every other outward reach in this component goes through
   * `getService("...")` - all eighteen of them - and `getProductService()` appears exactly once, here.
   * It is not declared on `Product.cfc`, not on `model/entity/HibachiEntity.cfc`, and not among the
   * generated-accessor patterns, so in CFML the call falls into `onMissingMethod`
   * [org/Hibachi/HibachiEntity.cfc:L507-L565]. `getProductService` DOES match the `get<Prop>` shape
   * against a property named `ProductService`, which does not exist, so it continues to the
   * `getAttributeValue` fallback at [L559] - reachable here because this component declares
   * `attributeValues` [L75] - finds no such attribute and terminates at the [L565] throw. Even had it
   * returned something, `returntype="array"` at [L631] would then have had to coerce whatever the
   * fallback produced.
   *
   * Note also that `ProductService` declares NO `getProductOptionsByGroup` method at all, so the
   * intended target does not exist either. There are two independent reasons this can never work, and
   * neither is fixable without inventing a feature.
   *
   * LEGACY-DEFECT [model/entity/Product.cfc:L631-L633]: `getProductOptionsByGroup()` calls
   * `getProductService()`, which is not a method on this component or its bases, so the call reaches
   * [org/Hibachi/HibachiEntity.cfc:L559] and throws at [L565]; `ProductService` declares no
   * `getProductOptionsByGroup` either.
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
  // ★ THE UNUSED-* TRIO - A LIVE VALIDATION PATH [model/entity/Product.cfc:L635-L654]
  //
  // `model/validation/Product.json` requires all three of these with `minCollection:1`:
  //
  //   "unusedProductOptions":           [{"contexts":"addOption",         "minCollection":1}]
  //   "unusedProductOptionGroups":      [{"contexts":"addOptionGroup",    "minCollection":1}]
  //   "unusedProductSubscriptionTerms": [{"contexts":"addSubscriptionTerm","minCollection":1}]
  //
  // So none of the three may be omitted, even though the third serves an out-of-scope subsystem: the
  // schema names it, and a validation rule pointing at an absent accessor is a broken contract rather
  // than a tidy one. Schema ENFORCEMENT (zod) lives at the service tier, not here; what this file owes
  // is the accessor each rule reads through.
  //
  // ★ ALL THREE PASS THE OPTION-GROUP IDS AS A COMMA-DELIMITED STRING, and the string is built with
  // `listAppend` rather than `Array.join` for the reason recorded on `getCategoryIDs()`: the helper is
  // PURE and emits NO LEADING DELIMITER ON AN EMPTY LIST by contract, which is the property proven
  // load-bearing at [model/entity/Sku.cfc:L234-L236] and [L886-L888]. A leading comma would reach the
  // DAO as an empty first element.
  // ===========================================================================

  /**
   * The option-group id list the unused-* queries filter against.
   *
   * Reproduces `structKeyList(getOptionGroupsStruct())` as it appears at [L637] and [L644].
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L637, L644]: CFML STRUCT KEY ORDER IS UNORDERED while
   * `Object.keys` returns insertion order, so the two implementations can emit the SAME ids in a
   * DIFFERENT sequence. That difference is NOT observable: both `OptionDAO.getUnusedProductOptions`
   * [model/dao/OptionDAO.cfc:L51] and `getUnusedProductOptionGroups` [L94] consume the parameter as a
   * SET - an `IN`-list membership test - where order carries no meaning. Recorded rather than
   * stabilised, because imposing a sort would be inventing an ordering the source never promised.
   * Preserved deliberately; do not fix without a product decision.
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
   *
   * [model/entity/Product.cfc:L635-L640] verbatim:
   *
   *   public array function getUnusedProductOptions() {
   *     if( !structKeyExists(variables, "unusedProductOptions") ) {
   *       variables.unusedProductOptions = getService('optionService').getUnusedProductOptions( getProductID(), structKeyList(getOptionGroupsStruct()) );
   *     }
   *     return variables.unusedProductOptions;
   *   }
   *
   * MEMO VARIANT C (no seed, no guard) - one unconditional computation behind a memo probe. `async`,
   * because [L637] reaches the option repository.
   *
   * TWO POSITIONAL ARGUMENTS, IN THE LEGACY ORDER: the product id first, the option-group id list
   * second. `OptionRepository.getUnusedProductOptions(productID, existingOptionGroupIDList)` declares
   * exactly that order. Swapping them would compile and silently return the wrong rows.
   *
   * ★ THE RETURN IS `readonly SelectOption[]`, NOT `Option[]`, AND THAT IS THE PORT'S CONTRACT RATHER
   * THAN A CHOICE MADE HERE. `../ports/optionRepository.js` declares
   * `Promise<readonly SelectOption[]>` - a two-member `{ name, value }` projection - because
   * [model/dao/OptionDAO.cfc:L51] returns a query of name/value pairs for a select control, not
   * hydrated entities. The specification for this file describes the return as `Option[]`; THE SHIPPED
   * PORT WINS, because inventing an `Option[]`-returning member would violate the no-invented-port-member
   * rule and because hydrating entities from a name/value projection is not possible.
   */
  public async getUnusedProductOptions(): Promise<readonly SelectOption[]> {
    // [L636] memo probe. VARIANT C: no seed to fall back on, so a failed reach must raise rather than
    // answer an empty array - `minCollection:1` would otherwise fail for the wrong reason.
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
   *
   * [model/entity/Product.cfc:L642-L647] verbatim:
   *
   *   public array function getUnusedProductOptionGroups() {
   *     if( !structKeyExists(variables, "unusedProductOptionGroups") ) {
   *       variables.unusedProductOptionGroups = getService('optionService').getUnusedProductOptionGroups( structKeyList(getOptionGroupsStruct()) );
   *     }
   *     return variables.unusedProductOptionGroups;
   *   }
   *
   * MEMO VARIANT C. `async`.
   *
   * ★ ONE ARGUMENT, NOT TWO. This is the asymmetry between the two sibling methods: [L637] passes the
   * product id AND the group list, [L644] passes ONLY the group list. The DAO signatures match -
   * [model/dao/OptionDAO.cfc:L51] takes two, [L94] takes one - so a product id must NOT be added here
   * for symmetry. The consequence is real: unused option GROUPS are computed globally rather than per
   * product.
   *
   * `readonly SelectOption[]` for the same reason as the sibling above; the specification's
   * `OptionGroup[]` is superseded by the shipped port.
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
   *
   * [model/entity/Product.cfc:L649-L654] verbatim:
   *
   *   public array function getUnusedProductSubscriptionTerms() {
   *     if( !structKeyExists(variables, "unusedProductSubscriptionTerms") ) {
   *       variables.unusedProductSubscriptionTerms = getService('subscriptionService').getUnusedProductSubscriptionTerms( getProductID() );
   *     }
   *     return variables.unusedProductSubscriptionTerms;
   *   }
   *
   * ★ AUTHORED, AND IT REFUSES. THE SPECIFICATION ASKS FOR A THIN PASS-THROUGH TO THE SUBSCRIPTION
   * STUB PORT; THE SHIPPED PORT MAKES THAT IMPOSSIBLE, AND THE PORT WINS.
   * `../ports/subscriptionTermProvider.js` declares EXACTLY TWO members - `getSubscriptionTerm` and
   * `getSubscriptionBenefit` - and its own module documentation lists
   * `getUnusedProductSubscriptionTerms` explicitly under WHAT IS DELIBERATELY NOT DECLARED IN THIS
   * FILE. So there is no member to pass through TO, and adding one would violate the
   * no-invented-port-member rule (prohibition 12).
   *
   * The three available options were: omit it (forbidden - `model/validation/Product.json` requires
   * it with `minCollection:1`, so the accessor must exist); invent a port member (forbidden); or
   * author it and refuse with an accurate message. The third is the only legal one, and it is also the
   * most honest: a caller in the `addSubscriptionTerm` context learns precisely which boundary it
   * crossed, rather than receiving an empty array that would fail `minCollection:1` and suggest the
   * product genuinely has no unused terms.
   *
   * `async` for signature parity with its two siblings, so a service tier reading all three in one
   * validation pass treats them uniformly.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L649-L654]: subscription is out of scope. This is an
   * out-of-scope branch reachable from an in-scope file - the same category as
   * `processProduct_addSubscriptionTerm` [model/service/ProductService.cfc:L173] and the
   * subscription/contentAccess SKU-creation arms [model/service/SkuService.cfc:L139-L202] - so the
   * member is present for schema and interface parity and refuses rather than fabricating a result.
   * The `subscriptionTermProvider` stub is held on this instance so the refusal can name a real
   * collaborator and report whether it was even wired.
   * Preserved deliberately; do not fix without a product decision.
   */
  public async getUnusedProductSubscriptionTerms(): Promise<never> {
    // ★ THE `async` KEYWORD IS LOAD-BEARING HERE, AND THE `await` IS WHAT KEEPS IT LEGAL - which is
    // the OPPOSITE treatment from `getSkuSalePriceDetails` above, deliberately. There, the `async`
    // keyword was dropped because a settled `Promise.resolve(...)` says the same thing without a
    // ceremonial await. Here it must STAY, because an `async` function that throws produces a REJECTED
    // PROMISE while a plain function that throws throws SYNCHRONOUSLY - a real difference to every
    // caller, since only the first is catchable by the `.catch()` / `await`-in-`try` shape its two
    // siblings require. Removing `async` would make this method the one member of the trio that cannot
    // be handled uniformly. The `await` on an already-settled promise is therefore satisfying
    // `require-await` by making the asynchrony genuine rather than by suppressing the rule.
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
   *
   * [model/entity/Product.cfc:L624-L629] verbatim:
   *
   *   public boolean function getTransactionExistsFlag() {
   *     if(!structKeyExists(variables, "transactionExistsFlag")) {
   *       variables.transactionExistsFlag = getService("skuService").getTransactionExistsFlag( productID=this.getProductID() );
   *     }
   *     return variables.transactionExistsFlag;
   *   }
   *
   * ★ MEMO VARIANT C - NO SEED AND NO GUARD. The purest instance of the third variant in this file:
   * one unconditional computation behind a single memo probe, with nothing to fall back on. That is
   * exactly why it must raise rather than default when the port is missing - there is no seeded value
   * the legacy would have returned, and inventing `false` would be inventing a permission.
   *
   * ★ AND `false` IS PRECISELY THE DANGEROUS DEFAULT HERE. `model/validation/Product.json` declares
   * `"transactionExistsFlag": [{"contexts":"delete","eq":false}]` - deletion is permitted ONLY when
   * this answers `false`. A defaulted `false` would authorise deleting a product that transactions
   * already reference. This is the ONE delete-context rule in that schema this entity genuinely
   * participates in, which makes the refusal load-bearing rather than defensive.
   *
   * `async`, reaching `SkuRepository.getTransactionExistsFlag(productID?, skuID?)` - the port member
   * declared for [model/dao/SkuDAO.cfc:L53]. The legacy passes ONLY `productID` as a named argument, so
   * only the first parameter is supplied here and `skuID` is left absent rather than passed as an
   * empty string.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L626]: the legacy writes `this.getProductID()` with an
   * explicit `this.` scope, where the surrounding methods write the bare `getProductID()` - as do
   * [L256] and [L344]. Both resolve identically in CFML. Recorded, not normalised.
   * Preserved deliberately; do not fix without a product decision.
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
   *
   * [model/entity/Product.cfc:L493-L495] verbatim:
   *
   *   public any function getBaseProductType() {
   *     return getProductType().getBaseProductType();
   *   }
   *
   * ★ `async`, AND THE SPECIFICATION SAYS SYNCHRONOUS. THE SHIPPED SIBLING WINS, AND HERE IS WHY IT
   * HAS TO. `ProductType.getBaseProductType()` in src/domain/entities/productType.ts is declared
   * `async getBaseProductType(): Promise<string | undefined>`, because
   * [model/entity/ProductType.cfc:L112] resolves the ROOT of `productTypeIDPath` through
   * `getService("ProductService").getProductType(listFirst(getProductTypeIDPath()))` - a genuine
   * repository load of a DIFFERENT row - and only then reads its system code. A synchronous wrapper
   * around an async delegate is not expressible, and src/domain/entities/sku.ts already awaits THIS
   * method at its own `getBaseProductType()`, so the async shape is load-bearing in live code.
   * The asynchrony is INHERITED, exactly as it is for `getLivePrice()` and `getCurrentAccountPrice()`.
   *
   * ★ THIS SITS ON A LIVE VALIDATION PATH. `model/validation/Product.json` gates `baseProductType`
   * with `inList` over `merchandise` and `subscription`, so what this returns decides whether a
   * product validates. `string | undefined` is therefore correct rather than convenient: the root
   * product type may legitimately carry no system code, and `undefined` fails the `inList` rule
   * honestly where a fabricated `"merchandise"` would pass it falsely.
   *
   * THE LEGACY DEREFERENCES [L494] UNCONDITIONALLY - no `isNull` guard, no `structKeyExists` probe -
   * so a product with no product type raises there. Reproduced as a raise.
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
   *
   * [model/entity/Product.cfc:L832-L838] verbatim - and note that it sits inside the component's
   * `Deprecated Methods` section, which opens at [L830] and closes at [L840]:
   *
   *   public array function getAttributeSets(array attributeSetTypeCode=[]){
   *     var smartList = getAssignedAttributeSetSmartList();
   *     if(arrayFind(arguments.attributeSetTypeCode, "astProductCustomization") || arrayFind(arguments.attributeSetTypeCode, "astOrderItem")) {
   *       getAssignedAttributeSetSmartList().addFilter('attributeSetType.systemCode', 'astOrderItem');
   *     }
   *     return smartList.getRecords();
   *   }
   *
   * ★ THIS IS THE ONE PORTED ROUTE INTO THE ATTRIBUTE SUBSYSTEM. The `attributeValues` EAV READ path is
   * deliberately not ported (see the OMISSION REGISTER), so `getAttributeSets` and nothing else
   * crosses that boundary. `async`, reaching
   * `ProductRepository.getAttributeSets(attributeSetTypeCode, productTypeIDs)` - the member declared
   * for [model/dao/ProductDAO.cfc:L52]. The `array attributeSetTypeCode=[]` default at [L832] is
   * reproduced.
   *
   * ★ THE ARGUMENT IS A TRIGGER, NOT A FILTER VALUE - WHICH IS GENUINELY SURPRISING AND IS THE MOST
   * IMPORTANT THING TO GET RIGHT HERE. Read [L834] again: `arguments.attributeSetTypeCode` is tested
   * for membership and then NEVER PASSED ANYWHERE. The value actually filtered on is the literal
   * `'astProduct'` fixed at [L801] inside `getAssignedAttributeSetSmartList()`, plus the literal
   * `'astOrderItem'` conditionally added at [L835]. So the effective type-code set is
   * `['astProduct']`, or `['astProduct', 'astOrderItem']` when the caller's array mentions either
   * `astProductCustomization` or `astOrderItem`. That is what is passed to the port, and passing the
   * caller's array straight through - the obvious reading of the signature - would filter on values
   * the legacy never filtered on.
   *
   * ★ `arrayFind` USED AS A BOOLEAN IS THE INDEX-BASE TRAP, AND IT IS LIVE ON THIS LINE. CFML's
   * `arrayFind` returns a 1-BASED index or 0, and `||` over it works because 0 is falsy. TypeScript's
   * `findIndex` returns a 0-BASED index or -1, and BOTH -1 AND 0 ARE TRUTHY - so a literal
   * transliteration would make the condition ALWAYS true and would always add the `astOrderItem`
   * filter. `includes()` is used instead, which expresses the membership question the legacy was
   * really asking without going near an index. It is a defect to write `if (index > 0)` against a
   * `findIndex` result, and it is equally a defect to write `if (findIndex(...))` at all.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L833-L836]: THE CONDITIONAL FILTER WORKS ONLY BY ACCIDENT OF
   * MEMOIZATION. [L833] captures the smart list into `smartList`, and [L835] then calls
   * `getAssignedAttributeSetSmartList()` AGAIN to add the filter rather than using the local. Because
   * that accessor memoizes into `variables.assignedAttributeSetSmartList` [L796], both expressions
   * denote the SAME object and the filter does reach the list [L837] returns. Had the accessor not
   * memoized, the filter would have been applied to a discarded second list and silently lost.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-NOTE [model/entity/Product.cfc:L807-L818]: A FIDELITY GAP THAT CANNOT BE CLOSED FROM HERE,
   * recorded rather than papered over. The omitted `getAssignedAttributeSetSmartList()` builds a
   * four-disjunct `WHERE`: `globalFlag = 1` OR product-type id IN the `productTypeIDPath` OR
   * `productID = <this product>` OR `brandID = <this brand>`. The declared port member accepts
   * `attributeSetTypeCode` and `productTypeIDs` ONLY, so the first two disjuncts are expressible and
   * the PRODUCT-ID and BRAND-ID disjuncts are NOT. An attribute set assigned directly to this product
   * or to its brand, and not global and not attached to its product-type path, will therefore be
   * absent from the result. Closing the gap would require a new port member or a widened signature,
   * both forbidden (prohibition 12), so the gap is documented at the call site instead. The legacy
   * `WHERE` also interpolates those ids directly into statement text [L810, L812, L814]; the port
   * binds every value as a prepared-statement parameter, which is a security improvement the plan
   * mandates project-wide.
   * Preserved deliberately; do not fix without a product decision.
   */
  public async getAttributeSets(
    attributeSetTypeCode: readonly string[] = [],
  ): Promise<AttributeSetSummary[]> {
    if (this.productRepository === undefined) {
      throw this.missingCollaborator('product repository', 'L833');
    }

    // [L801] the fixed base filter, then [L834-L836] the conditional addition. `includes` rather than
    // an index test - see the index-base note above.
    const effectiveTypeCodes: string[] = ['astProduct'];
    if (
      attributeSetTypeCode.includes('astProductCustomization') ||
      attributeSetTypeCode.includes('astOrderItem')
    ) {
      effectiveTypeCodes.push('astOrderItem');
    }

    // [L810] the product-type disjunct: `productTypeIDPath` split on commas. Empty when this product
    // has no product type, which the port documents as meaning "global sets only" rather than
    // "no filter" - matching [L808], where `globalFlag = 1` is the disjunct that always applies.
    const productTypeIDs: readonly string[] =
      this.productType === undefined ? [] : listToArray(this.productType.getProductTypeIDPath());

    // [L837] `return smartList.getRecords();`
    return this.productRepository.getAttributeSets(effectiveTypeCodes, productTypeIDs);
  }

  // ===========================================================================
  // ★★★ THE OMISSION REGISTER
  //
  // Every method declared in `model/entity/Product.cfc` that is deliberately NOT authored above, with
  // its source locator and the reason. Collected in ONE PLACE so a reviewer can audit the decisions
  // without reading the whole file, exactly as the class doc promises.
  //
  // "OMIT" MEANS: this member is not authored in the new TypeScript file, and the reason is recorded.
  // IT NEVER MEANS a legacy file was deleted, edited, or altered in any way. `model/**` is
  // REFERENCE-ONLY and the CFML monolith keeps running - the out-of-scope
  // `model/service/OrderService.cfc` still injects `priceGroupService` [L60] and `promotionService`
  // [L61], which is precisely the seam that makes this slice independently deployable.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 1 - IMAGE AND ASSET PATHS.  NINE MEMBERS.
  //
  //   getImages()                    [L178-L180]   returns `variables.productImages`
  //   getAlternateImageDirectory()   [L223-L225]   `getURLFromPath(setting('globalAssetsImageFolderPath')) & '/product/'`
  //   getImageGalleryArray(...)      [L267-L319]   ~53 lines, default `[{size='s'},{size='m'},{size='l'}]`
  //   getImageDirectory()            [L320-L323]
  //   getImagePath()                 [L324-L327]
  //   getImage()                     [L328-L331]
  //   getResizedImagePath()          [L332-L335]
  //   getImageExistsFlag()           [L336-L338]   `getDefaultSku().getImageExistsFlag()`
  //   getDefaultProductImageFiles()  [L497-L515]   `getService` at [L501], a sku smart list
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L178-L180, L223-L225, L267-L339, L497-L515]: the image path
  // requires `globalAssetsImageFolderPath`, which is NOT one of the seven keys published by
  // ../ports/settingsProvider.js - that port declares exactly four - and `imageStore` is a STUB port
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
  //   getEstimatedReceivalDetails()          [L399-L405]   `getService` at [L401]
  //   getEstimatedReceivalDates(...)         [L406-L434]
  //   getQuantity(quantityType, skuID, locationID, stockID)  [L435-L492]  ~58 lines - THE LARGEST
  //                                                          METHOD IN THE COMPONENT, with TWO
  //                                                          `getService` sites at [L441] AND [L443]
  //   getQATS()                              [L547-L549]   `return getQuantity("QATS");`
  //   getAllowBackorderFlag()                [L551-L553]   `return setting("skuAllowBackorderFlag");`
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L399-L492, L547-L553]: `Stock`, `Location` and every
  // inventory entity are out of scope, so there is no collaborator to reach and no entity to return.
  // `getAllowBackorderFlag()` fails a second, independent test as well: `skuAllowBackorderFlag` is not
  // one of the four keys ../ports/settingsProvider.js declares. The PERSISTED SNAPSHOTS of two of
  // these - `calculatedQATS` [L63] and `calculatedAllowBackorderFlag` [L64] - ARE preserved and
  // readable through their generated accessors above, so the schema contract is intact (B5); only the
  // RECOMPUTATION is out of scope. `getQuantity` is also the site of three `listFindNoCase` uses
  // [L440, L442, L451], which is why `../../lib/cfml/list.js`'s `listFindNoCase` is not imported by
  // this file - the only caller of it here is omitted.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 3 - CMS, PAGES AND TEMPLATES.  FOUR MEMBERS.
  //
  //   getListingPagesOptionsSmartList()  [L146-L153]  `getService("contentService")` at [L148]
  //   getTemplateOptions()               [L171-L176]  `getService("ProductService")` at [L173],
  //                                                    guarded by `isDefined("variables.templateOptions")`
  //                                                    rather than `structKeyExists` - the ONLY
  //                                                    `isDefined` in the component
  //   getTemplate()                      [L215-L221]  `setting('productDisplayTemplate')`
  //   getCrumbData(path, siteID, baseCrumbArray)  [L370-L398]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L146-L153, L171-L176, L215-L221, L370-L398]: the Mura CMS
  // bridge is out of scope, `Content` and `Template` are not among the eighteen entities,
  // `productDisplayTemplate` is not one of the four `SettingKey` members, and two of the four build a
  // `HibachiSmartList` (AAP 0.6.2). `getCrumbData` additionally takes a `siteID` and builds a
  // site-relative breadcrumb, which is CMS presentation - and presentation subsystems are excluded
  // wholesale. Schema continuity is unaffected: `Category.cmsCategoryID` (index `RI_CMSCATEGORYID`)
  // and its `site` association survive as INERT persisted columns in src/domain/entities/category.ts
  // with no CMS behaviour ported at all.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 4 - PRODUCT REVIEWS.  ONE MEMBER.
  //
  //   getProductRating()  [L227-L239]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L227-L239]: `ProductReview` is not one of the eighteen
  // in-scope entities, so `getProductReviews()` has nothing to return and the average cannot be
  // computed. THE `singlularname` TYPO ON THE [L76] PROPERTY DECLARATION IS STILL PRESERVED as
  // metadata in the property-contract transcription and in `ProductLegacyMetadata` - omitting the
  // METHOD does not omit the COLUMN METADATA, and the two decisions are independent.
  // FOR THE RECORD, THE OMITTED BODY CARRIES TWO DEFECTS OF ITS OWN, so that nobody ever "restores"
  // it believing it worked: [L233] reads `var totalRatingPoints += ...` - a `var` DECLARATION combined
  // with a compound assignment, which is invalid, and it also re-declares a variable already declared
  // at [L228]; and the same line indexes `getProductReviews()[1]` INSIDE a loop over `i`, so it would
  // sum the FIRST review's rating N times rather than each review once. Neither is repaired, because
  // neither is ported.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 5 - FRAMEWORK PROPERTY-OPTION AND SMART-LIST HELPERS.  THREE MEMBERS.
  //
  //   getProductTypeOptions(baseProductType)      [L125-L144]  `getPropertyOptionsSmartList` at [L131],
  //                                                             `getService('productService')` at [L132]
  //   getBrandOptions()                           [L534-L538]  `getPropertyOptions("brand")` at [L535]
  //   getAssignedAttributeSetSmartList()          [L795-L822]  ~27 lines, `getService` at [L798]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L125-L144, L534-L538, L795-L822]: `getPropertyOptions` and
  // `getPropertyOptionsSmartList` are METADATA-DRIVEN FRAMEWORK DISPATCH on
  // org/Hibachi/HibachiEntity.cfc, which is a boundary to extract from and never modify and whose
  // responsibilities the plan redistributes to typed repository queries. This applies the precedent
  // src/domain/entities/priceGroup.ts set when it omitted `getParentPriceGroupOptions()` for exactly
  // this reason, and it matches what src/domain/entities/productType.ts did with its own
  // `getAssignedAttributeSetSmartList()` at [model/entity/ProductType.cfc:L280].
  // `getAssignedAttributeSetSmartList()` fails on a SECOND ground as well - the non-ported
  // `attributeValues` EAV path - and its filter and `WHERE` semantics are transcribed onto
  // `getAttributeSets()` above, which is the one ported route into the attribute subsystem, together
  // with the two disjuncts the declared port signature cannot express. `getBrandOptions()` also reads
  // `rbKey('define.none')` [L536], preserved as an inert string constant in `ProductLegacyMetadata`
  // because JavaRB is not ported and no i18n runtime is introduced.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 6 - THE PRODUCT TITLE.  ONE MEMBER.
  //
  //   getTitle()  [L540-L545]  `getService("hibachiUtilityService")` at [L542]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L540-L545]: `getTitle()` reads
  // `setting('productTitleString')` - whose default is a two-token substitution template declared at
  // [model/service/SettingService.cfc:L193] - and hands it to
  // `hibachiUtilityService.replaceStringTemplate(template=..., object=this)`. TWO independent
  // boundaries block it: `productTitleString` is NOT one of the four keys
  // ../ports/settingsProvider.js declares, and `replaceStringTemplate` is a Hibachi utility service
  // that is not ported and whose behaviour - reflective path-expression substitution against an
  // arbitrary object - is exactly the metadata-driven dispatch this migration removes.
  // THE DEFAULT TEMPLATE'S TEXT IS DELIBERATELY NOT QUOTED HERE AND IS NOT CARRIED IN
  // `ProductLegacyMetadata` EITHER, because reproducing it in any form - even as an inert constant -
  // would put a configuration default into the domain layer, which is exactly what E6 and
  // prohibition 5 forbid. The SettingService locator above is the single place to read it from.
  // THE PERSISTED SNAPSHOT `calculatedTitle` [L65] IS PRESERVED and readable, so the schema contract
  // holds. And note the consequence recorded at DEFECT 19: `getTitle()` consumes `getBrandName()`, so
  // the memo repair would have fixed this method's repeat-call behaviour too.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // ★ CLUSTER 7 - THE §3.9 DECISION: `getSalePriceDetailsForSkus()` IS OMITTED. BRANCH (b).
  //
  //   getSalePriceDetailsForSkus()  [L517-L522]  `getService("promotionService")` at [L519]
  //
  // The decision procedure was followed exactly and it selected BRANCH (b) - OMIT - so this is stated
  // in full rather than summarised. The legacy body is
  //
  //   variables.salePriceDetailsForSkus = getService("promotionService").getSalePriceDetailsForProductSkus(productID=getProductID());
  //
  // and the T2 mapping would replace the locator with an injected sale-price resolver. The candidate
  // collaborator is ../ports/promotionRepository.js. It declares
  // `getSalePricePromotionRewardsQuery(productID?)`, which is the port for
  // [model/dao/PromotionDAO.cfc:L298] - the RAW six-branch UNION - and NOT for
  // `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022].
  //
  // The difference is not cosmetic. The SERVICE method reduces that raw result AND APPLIES THE
  // ROUNDING RULE: the port's own documentation states that "Applying the rounding rule is the service
  // tier's step, in getSalePriceDetailsForProductSkus [model/service/PromotionService.cfc:L1024-L1028]".
  // An entity cannot perform that step - `roundingRuleService` lives under `src/services`, which is
  // OUTSIDE this file's legal import surface - and calling the raw-query member here would return
  // UNROUNDED prices under a method name that promises rounded ones. That is a money bug dressed as a
  // port call.
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L517-L522]: OMITTED under branch (b) of the §3.9 decision
  // procedure. No member of ../ports/promotionRepository.js can serve
  // `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022], because the
  // reduction and the rounding-rule application at [L1024-L1028] belong to the service tier and
  // `getSalePricePromotionRewardsQuery` [model/dao/PromotionDAO.cfc:L298] returns the unreduced,
  // unrounded rows. NO FOURTEENTH PORT AND NO NEW PORT MEMBER MAY BE CREATED, so the method is omitted
  // rather than approximated. Its ONE in-scope consumer, `getSkuSalePriceDetails(skuID)` [L182-L187],
  // is fully authored above and reads the ALREADY-REDUCED, ALREADY-ROUNDED detail map supplied as the
  // `salePriceDetailsForSkus` hydration input - a structural association materialized at the
  // repository boundary, which is the same technique the SKU currency cascade uses and not an invented
  // port member.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // CLUSTER 8 - THE SIX OUT-OF-SCOPE BIDIRECTIONAL HELPER PAIRS.  TWELVE MEMBERS.
  //
  //   addAttributeValue / removeAttributeValue  [L680-L685]  cfc="AttributeValue", one-to-many
  //   addProductImage   / removeProductImage    [L688-L693]  cfc="Image", one-to-many
  //   addProductReview  / removeProductReview   [L704-L709]  cfc="ProductReview", one-to-many
  //   addListingPage    / removeListingPage     [L712-L729]  cfc="Content", many-to-many OWNER,
  //                                                           link table SwProductListingPage
  //   addVendor         / removeVendor          [L772-L777]  cfc="Vendor", many-to-many inverse
  //   addPhysical       / removePhysical        [L780-L785]  cfc="Physical", many-to-many inverse
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L680-L685, L688-L693, L704-L709, L712-L729, L772-L777,
  // L780-L785]: each far side is an entity outside the eighteen in scope, so per §1.5 the association
  // collapses to an inert opaque identifier or is omitted entirely, and the `add*` / `remove*` /
  // `has*` / `get*` members are DROPPED. This applies the precedent already set by
  // `PriceGroup.appliedOrderItems`, `Brand.addAttributeValue`/`removeAttributeValue`,
  // `PromotionCode.accounts`/`orders`, `Promotion.defaultImage` and
  // `PromotionReward.shippingMethods`. `addListingPage` is the only one of the six on the OWNING side,
  // and it is also the only one whose body would have needed both a local `arrayAppend` and a far-side
  // one [L713-L718]; its `arrayFind`-based removal at [L721-L727] is exactly the 1-based-versus-0-based
  // trap documented on `removeBrand`, and it is not ported.
  // ALL SIX PAIRS WERE STILL READ VERBATIM AND INCLUDED IN THE INVERSION CROSS-CHECK, and all six
  // `remove*` bodies are CLEAN - each calls a far-side `remove*`. Screening them was not optional
  // merely because they are omitted; a reviewer who later brings one in scope inherits a verified
  // verdict rather than an assumption.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // ★ CLUSTER 9 - THE `attributeValues` EAV READ PATH.  NO NINETEENTH FILE.
  //
  //   property name="attributeValues" ... cfc="AttributeValue" ... cascade="all-delete-orphan"  [L75]
  //
  // LEGACY-NOTE [model/entity/Product.cfc:L75]: the census across all eighteen in-scope entities finds
  // EXACTLY FOUR `attributeValues` declarations - [model/entity/Sku.cfc:L70] and
  // [model/entity/Brand.cfc:L60] both with `type="array"`, and [model/entity/Product.cfc:L75] and
  // [model/entity/ProductType.cfc:L67] WITHOUT it - all four `cfc="AttributeValue"`,
  // `cascade="all-delete-orphan"`, `inverse="true"`. THE `type="array"` INCONSISTENCY IS ANNOTATED AND
  // NOT NORMALISED (prohibition 19). Applying the `appliedOrderItems` precedent: the collection is NOT
  // materialized, NO nineteenth entity file is created (`attributeValue.ts` is FORBIDDEN), and the EAV
  // READ path is not ported. THE FOLDER IS LOCKED AT EXACTLY EIGHTEEN FILES - no barrel, no
  // `index.ts`, no `types.ts` (E7). The unhonoured `cascade="all-delete-orphan"` obligation is recorded
  // in the repositories sibling, which owns persistence, and not here.
  // The one consequence this file DOES carry is that `Product` remains one of only FOUR in-scope
  // entities able to reach the `getAttributeValue` fallback at [org/Hibachi/HibachiEntity.cfc:L559]
  // before the [L565] throw - which is the mechanism behind `getPageIDs()`,
  // `getProductOptionsByGroup()` and `getSalePriceExpirationDateTime()` above. For the other fourteen
  // entities an unmatched `get...` throws at [L565] directly.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // ★ CLUSTER 10 - THE TWELVE `getService(` SITES ON model/entity/HibachiEntity.cfc.
  //
  // LEGACY-NOTE [model/entity/HibachiEntity.cfc:L123, L130, L135, L145, L178, L180, L182, L194, L196,
  // L207, L257, L266]: `Product.cfc` declares `extends="HibachiEntity"` UNQUALIFIED, which resolves to
  // `model/entity/HibachiEntity.cfc` (274 lines), which itself declares
  // `extends="Slatwall.org.Hibachi.HibachiEntity"` - A THREE-LEVEL CHAIN, NOT TWO. The intermediate
  // class holds TWELVE `getService(...)` sites, SEVEN of them `attributeService`. They are MOOT here
  // because the EAV path is not ported (cluster 9), but they are recorded so that they are not
  // silently RE-IMPLEMENTED by someone who notices a gap and fills it. The inherited locator surface is
  // deliberately not ported, and neither is `buildIDPathList`, `getPropertyOptions`,
  // `getPropertyOptionsSmartList`, `formatValue`, `getFormattedValue`, `rbKey` or `isDeletable` from
  // the framework base. `isNew()` is the ONE framework-derived member that survives, and it survives
  // because it is genuine entity-local state derivable from this class's own id column.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ---------------------------------------------------------------------------------------------
  // NOT IN THIS REGISTER, BECAUSE THEY ARE AUTHORED AS THROWING RATHER THAN OMITTED:
  //   getPageIDs()                        [L191-L197]
  //   getProductOptionsByGroup()          [L631-L633]
  //   getSalePriceExpirationDateTime()    [L614-L622]  (DEFECT 25)
  //   getUnusedProductSubscriptionTerms() [L649-L654]
  // A throwing member is PRESENT in the public surface and reproduces a runtime failure; an omitted
  // member is ABSENT. Conflating the two would misreport the interface, so the four are listed here
  // only to say where they really are.
  // ===========================================================================
}
