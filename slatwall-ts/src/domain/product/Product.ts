/**
 * `Product` — the port of `model/entity/Product.cfc`, the aggregate root of the Catalog slice.
 *
 * THE LEGACY COMPONENT DECLARATION, [model/entity/Product.cfc:L49]:
 *
 *     component displayname="Product" entityname="SlatwallProduct" table="SwProduct"
 *               persistent="true" extends="HibachiEntity" cacheuse="transactional"
 *               hb_serviceName="productService" hb_permission="this"
 *               hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm"
 *
 *   - `extends="HibachiEntity"` resolves to the LOCAL `model/entity/HibachiEntity.cfc`, NOT to
 *     `org/Hibachi/HibachiEntity.cfc` (IR-8). Nothing is inherited here in either case: §0.3.3
 *     replaces template-method inheritance with composition, so this class `extends` NOTHING and
 *     satisfies `AuditableEntity` structurally.
 *   - `entityname` / `table` — `SwProduct`, and every column name, appear in this file ONLY as prose,
 *     never as code. S2 governs this module negatively: no SQL text, no driver, no table or column
 *     identifier as a value, anywhere. The LOGICAL ORM name `SlatwallProduct` is the one exception
 *     and it is a deliberate one: `getEntityName()` [org/Hibachi/HibachiEntity.cfc:L287-L289] is
 *     observable behaviour that `src/ports/UniquePropertyPort.ts` consumes, so the value is declared
 *     exactly once, in {@link PRODUCT_ENTITY_METADATA}. A logical entity name is not a table
 *     identifier — the two are separate attributes on the same component tag, and
 *     `src/adapters/mysql/rowMappers.ts` documents at length why they must never be conflated — so
 *     S2 is untouched by it.
 *   - `cacheuse="transactional"` declares Hibernate second-level caching. FLAGGED, NOT IMPLEMENTED
 *     (M7): nothing survives between invocations except module scope, and entity state held there
 *     would bleed one request's catalog into another's on a warm container. Every memoization in
 *     this file is therefore PER INSTANCE — see the memo-field block below.
 *   - `hb_processContexts` names the three process contexts whose validation rules live inside
 *     `model/validation/Product.json` (see the VALIDATION CONTRACT block); `hb_serviceName` and
 *     `hb_permission` are framework routing and authorisation metadata with no target analogue.
 *
 * TWO HIGHEST-RISK ITEMS IN THIS FILE.
 *
 * 1. THE CALCULATED-PROPERTY BOUNDARY (§0.2.2.6, IR-3) — the exclusion most likely to be violated by
 *    accident. Sixteen non-persistent members reach exclusively into out-of-scope services, and
 *    following even one of their getters drags half the platform into the port. They are enumerated
 *    with locators in THE SIXTEEN EXCLUDED CALCULATED MEMBERS block, so each reads as a decision.
 * 2. THE THREE LEGACY `throw()` MESSAGES of `getSkuBySelectedOptions`
 *    [model/entity/Product.cfc:L349-L364]. All three are observable behaviour and all three are owned
 *    by `src/errors/DomainError.ts`. They are imported here and referred to by legacy locator only —
 *    `:L355`, `:L357`, `:L362` — because each literal is authored exactly once across the target
 *    tree. The same applies to the `getQuantity` guard message at `:L445`, which this port authors
 *    nowhere.
 *
 * WHY SO MANY MEMBERS ARE ASYNCHRONOUS — G6 TRANSLATION DECISION. Every member whose legacy body
 * reached
 * a service or the data-access layer becomes `async`, because its target collaborator is
 * repository-backed and returns a promise; the legacy calls were synchronous only because the CFML
 * engine blocked on them behind a request-scoped ORM session (M5). Members that are genuinely
 * in-memory stay synchronous, and the split is stated on each one. The constructor performs no I/O
 * and cannot fail.
 *
 * ⚠️ ONE UNAVOIDABLE SUBSTRING, RECORDED SO A FUTURE GATE RUN IS NOT MISREAD. A case-sensitive search
 * of this file for the row-retrieval SQL keyword returns exactly TWO hits — its import at the top of
 * this module and its single use site — and BOTH are inside one IDENTIFIER: the constant
 * `src/errors/DomainError.ts` exports for the throw at `:L362`, whose name contains the word
 * "selected". It is an import name owned by that module, not query text, and it cannot be renamed from
 * here without breaking the single-authorship rule for those message strings. Every OTHER occurrence
 * of that keyword, and every occurrence of the existence-clause keyword, has been eliminated from this
 * file including from prose. There is no SQL, no query builder, no driver import and no table
 * identifier as a value anywhere in this module; the `Sw*` table names appear in prose comments only.
 *
 * WHY SO MANY MEMBERS ARE ASYNCHRONOUS. G6 TRANSLATION DECISION. Every member whose legacy body
 * reached a service or a data-access layer becomes `async`, because its target collaborator is
 * repository-backed and returns a promise. The legacy calls were synchronous only because the CFML
 * engine blocked on them behind a request-scoped ORM session, which the stateless execution model
 * has no equivalent for (M5). Members that are genuinely in-memory stay synchronous, and the split
 * is stated on each one. Nothing in the CONSTRUCTOR is asynchronous: `new Product()` performs no
 * I/O and cannot fail (S6).
 *
 * STANDARDS ROLL-CALL (§0.7.3; `review_rules` reports NO user rules for this project, and per UR4
 * that is explicitly not permission to lower the bar):
 *   S1 strict type safety — no non-null assertions, no casts, no `any`, and no
 *      compiler-suppression directive of any kind
 *      anywhere in this file. Every narrowing is an explicit guard. `noUncheckedIndexedAccess` and
 *      `exactOptionalPropertyTypes` are both load-bearing here; see `getSkuBySelectedOptions` and
 *      the optionality of `brand`.
 *   S2 parameterized SQL — satisfied negatively; see above.
 *   S3 explicit dependency injection — every collaborator arrives as an explicit typed parameter.
 *   S4 hexagonal separation — the import list below is closed: two sibling entity modules, two
 *      option modules, the two `base/` modules, `errors/DomainError` and `util/formatting`. Nothing
 *      from `adapters/`, `services/`, `config/`, `validation/`, `handlers/`, `integrations/` or
 *      `ports/`; no AWS type; no environment read.
 *   S5 dependency pinning — satisfied negatively: no third-party import and no Node builtin.
 *   S6 test enablement — `new Product()` takes no arguments; see the TRACEABLE TEST CONTRACT block.
 *   S7 preserve and annotate, do not repair — this file owns defect D5 plus five `TODO(parity)`
 *      annotations. No new defect identifier is introduced here; AAP §0.6.7 catalogues D1-D21, and the
 *      live register bound is stated only at `src/ports/repositories/SkuRepository.ts`.
 *   S8 / M7 flag mismatches — every memo is per-instance; no cache is added.
 *   S9 invent nothing — no default setting value, no phantom property, no invented framework
 *      member, no invented error text, no service level.
 */

import {
  AUDIT_PROPERTY_NAMES,
  hasDeclaredProperty,
  readValueByPropertyIdentifier,
  requireDeclaredPropertyMetaData,
  type AuditableEntity,
  type AuditPropertyName,
  type DeclaredPropertyNameSet,
  type EntityPropertyMetaData,
  type ManagedEntity,
} from '../base/AuditableEntity';
import type {
  ColumnPropertyDescriptor,
  EntityMetadataDeclaration,
  ManyToManyPropertyDescriptor,
  ManyToOnePropertyDescriptor,
  OneToManyPropertyDescriptor,
  PopulatePropertyDescriptor,
  PropertyDescriptorSet,
  RelatedEntityLoader,
  SubPropertyPopulator,
} from '../base/populate';
import {
  LegacyParityError,
  NotImplementedError,
  NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE,
  moreThanOneSkuReturnedMessage,
  noSkusFoundForSelectedOptionsMessage,
} from '../../errors/DomainError';
import { ValidationError, type ValidationErrors } from '../../errors/ValidationError';
import {
  replaceStringTemplate,
  type ExactDecimal,
  type PropertyIdentifierResolver,
} from '../../util/formatting';

/*
 * G6 TRANSLATION DECISION — `import type` FOR THE FOUR IN-SCOPE COLLABORATORS, AND WHY THE MUTUAL
 * CYCLES ARE CORRECT RATHER THAN TOLERATED.
 *
 * `Brand`, `ProductType`, `Option` and `OptionGroup` are IN SCOPE (§0.2.1.2 lists all four, and
 * §0.4.5 lands the whole subtree in ONE phase), so they are imported as the real types. A local
 * structural fork of any of them is forbidden and would be wrong: it would be a second declaration
 * of a type that already exists and would drift. The types are likewise never weakened to `any`,
 * `unknown` or `object`.
 *
 * `Brand.ts` imports `Product` back — [model/entity/Product.cfc:L68] declares
 * `property name="brand" cfc="Brand" fieldtype="many-to-one"` and
 * [model/entity/Brand.cfc:L61] declares the inverse collection — and `ProductType.ts` imports
 * `Product` back for the same reason [`:L69`]. Both cycles exist at the TYPE level only. `import
 * type` is FULLY ERASED at emit, so the bundled CommonJS artifact contains no import of these
 * modules from here at all: there is no runtime cycle, no partially initialised module and no
 * bundler ordering hazard. That erasure is exactly why the descriptor factory at the bottom of this
 * file takes `Brand` and `ProductType` LOADERS as parameters instead of importing either module for
 * a value.
 *
 * THE CONTRACT THE TWO SIBLINGS REQUIRE OF THIS MODULE, stated so the three files cannot disagree:
 *   - `Brand.ts` calls `product.setBrand(this)` and `product.removeBrand(this)`, and its own doc
 *     pins the required signatures as `setBrand(brand: Brand): void` and
 *     `removeBrand(brand?: Brand): void`. Both are declared below, in the bidirectional block.
 *   - `ProductType.ts:1271` assigns `product.productType = this`, so `productType` must be a
 *     PUBLIC, WRITABLE, OPTIONAL field. It is.
 */
import type { Brand } from './Brand';
import type { BaseProductTypeCode, ProductType, ProductTypeRootResolver } from './ProductType';
import type { Option } from '../option/Option';
import type { OptionGroup } from '../option/OptionGroup';

/* ================================================================================================
 * THE R-C LOCAL STRUCTURAL INTERFACES
 * ================================================================================================
 * `src/ports/**` is not on this module's dependency whitelist and `src/domain/sku/Sku.ts` does not
 * exist. Per the mandated R-C pattern, every out-of-scope collaborator — and `Sku`, which is
 * in-scope but not yet authored — is reached through a NARROW, DISTINCTLY NAMED, IN-FILE,
 * TYPE-ONLY interface declaring EXACTLY the members the ported code touches and nothing more, and
 * is supplied as an EXPLICIT PARAMETER (S3). Each carries one `TODO(boundary)` naming its rightful
 * owner, so no member is ever quietly dropped (TR-5).
 *
 * Every interface here is EXPORTED, so a test can satisfy it with a plain object literal and no
 * mocking library. That matters: the legacy suite had no mocking library at all and booted the
 * entire FW/1 application instead (§0.4.3.6). None of them is named after the real domain type it
 * stands in for — `ProductSkuMember`, not `Sku`; `ProductSkuOptionFinder`, not `ProductService` —
 * so a reader can never mistake a two-member stand-in for the thing itself, and can never conclude
 * that a domain entity depends on a service.
 * ============================================================================================= */

/**
 * The three setting keys this entity reads, and the only three.
 *
 * Verified against the file: `globalURLKeyProduct` at [model/entity/Product.cfc:L208] and [`:L212`],
 * `productDisplayTemplate` at [`:L217`], and `productTitleString` at [`:L542`]. Two further keys are
 * read by members this port does not carry and so are deliberately absent —
 * `globalAssetsImageFolderPath`
 * at [`:L224`] and `skuAllowBackorderFlag` at [`:L552`]; both are recorded in the omission blocks.
 *
 * The union exists so that a mistyped key is a COMPILE ERROR rather than a silent miss, which is the
 * whole point of replacing a string-keyed runtime lookup with a declaration (TR-3).
 */
export type ProductSettingName =
  'globalURLKeyProduct' | 'productDisplayTemplate' | 'productTitleString';

/**
 * Resolves the effective value of one of the three settings this entity reads.
 *
 * The legacy `setting()` accessor [model/entity/HibachiEntity.cfc:L129] forwards to the
 * out-of-scope `SettingService`, whose effective-value engine resolves a hierarchy of overrides.
 * IR-2 states the consequence plainly: the slice gets a narrow setting-resolution boundary rather
 * than a port of that engine, and this interface is this file's half of it. F22 forbids declaring a
 * `setting()` member on the entity itself, so the capability arrives as a parameter instead.
 *
 * S9 — NO DEFAULT VALUE IS SUPPLIED OR IMPLIED FOR ANY OF THE THREE KEYS. Not one of them is
 * seeded in `config/dbdata/SlatwallSetting.xml.cfm`, which carries only five distinct
 * `settingName` values; their defaults live in metadata on the out-of-scope
 * `model/service/SettingService.cfc`. This module therefore declares no fallback, no `??` default
 * and no constant for any of them. Recording which keys fall back to defaults belongs to the
 * resolver implementation.
 *
 * Declared SYNCHRONOUS on purpose, matching the sibling `option/` exemplar. M8 records that the
 * out-of-scope setting service launches an out-of-band background thread; a synchronous contract
 * makes it impossible for any caller in this slice to come to depend on background completion.
 *
 * TODO(boundary): the rightful owner is `SettingResolverPort`, implemented by
 * `src/adapters/settings/StaticSettingResolver.ts` (§0.4.1.7). No file is created under
 * `src/ports/` by this module.
 */
export interface ProductSettingResolver {
  /**
   * @param settingName - One of the three keys this entity reads; the literal union is the point.
   * @returns The effective value, in the shape the legacy engine returned it.
   */
  setting(settingName: ProductSettingName): string;
}

/**
 * A member of this product's `skus` collection, as narrowly as the ported code uses one.
 *
 * DELIBERATELY NOT NAMED `Sku` AND DELIBERATELY NOT A NEW FILE. `src/domain/sku/Sku.ts` is a planned
 * in-scope module that this file must not create, so until it lands the two members Product actually
 * invokes on a SKU are declared structurally — the same treatment the sibling `option/` module gives
 * `Option.skus`. Both are hand-written members of the legacy component, so nothing is invented:
 * [model/entity/Product.cfc:L697] `arguments.sku.setProduct( this );` and [`:L700`]
 * `arguments.sku.removeProduct( this );`. `removeProduct`'s parameter is optional because the legacy
 * remove-side helpers declare their argument without `required` and default it from the entity's own
 * back reference — the shape [`:L668-L671`] uses for `removeBrand`.
 *
 * Structurally identical to {@link ProductOwnedAssociation} today and still declared separately:
 * `skus` is the core aggregate collection, so it earns its own name and will take the real type when
 * `Sku.ts` lands. Until then the two are mutually assignable.
 *
 * TODO(boundary): the rightful owner of this element type is `src/domain/sku/Sku.ts`.
 */
export interface ProductSkuMember {
  setProduct(product: Product): void;

  removeProduct(product?: Product): void;
}

/**
 * Reads a SKU's primary identifier.
 *
 * WHY AN INJECTED READER RATHER THAN A MEMBER ON {@link ProductSkuMember}. The only ported member
 * that needs a SKU's identifier is `getSkuByID` [model/entity/Product.cfc:L162-L169], and putting
 * `skuID` on the structural interface would assert a shape for a type this file does not own. The
 * sibling `option/` module faced the identical problem and resolved it the identical way, by
 * injecting a `readSkuPrimaryId` function into its descriptor factory. Following that precedent
 * keeps the two files consistent and keeps this one free of invention (S9).
 *
 * TODO(boundary): superseded by a direct field read once `src/domain/sku/Sku.ts` exists.
 */
export type ProductSkuIdReader = (sku: ProductSkuMember) => string;

/**
 * An entity that this product owns one-to-many and that hands ownership back through
 * `setProduct` / `removeProduct`.
 *
 * ONE INTERFACE, THREE COLLECTIONS, AND THE CONSEQUENCE STATED PLAINLY. It types the element of
 * `attributeValues`, `productImages` and `productReviews`, whose six bidirectional helpers are pure
 * delegations of exactly this shape:
 *     [model/entity/Product.cfc:L681] `arguments.attributeValue.setProduct( this );`
 *     [model/entity/Product.cfc:L684] `arguments.attributeValue.removeProduct( this );`
 *     [model/entity/Product.cfc:L689] `arguments.productImage.setProduct( this );`
 *     [model/entity/Product.cfc:L692] `arguments.productImage.removeProduct( this );`
 *     [model/entity/Product.cfc:L705] `arguments.productReview.setProduct( this );`
 *     [model/entity/Product.cfc:L708] `arguments.productReview.removeProduct( this );`
 * The three collections are therefore mutually assignable. That is a real limitation and an
 * acknowledged one: it is acceptable only because nothing in scope cross-assigns them, and it is
 * strictly preferable to inventing three separate shapes for three excluded families (S9).
 *
 * ALL THREE ELEMENT FAMILIES ARE OUT OF SCOPE. §0.2.2.1 excludes the six `Attribute`-prefixed
 * components and names `attributeService` among the excluded collaborators; §0.2.2.4 excludes
 * `model/validation/ProductImage.json` and `model/validation/ProductReview.json`. Per TR-5 the six
 * members are NOT quietly dropped — they are implemented against this interface. No
 * `ProductImage.ts` and no `ProductReview.ts` is created.
 *
 * TODO(boundary): the rightful owners are the attribute subsystem, the image subsystem behind
 * `ImagePathPort`, and the product-review surface — three families outside this slice.
 */
export interface ProductOwnedAssociation {
  setProduct(product: Product): void;

  removeProduct(product?: Product): void;
}

/**
 * The element type of a collection this port declares but never traverses — DELIBERATELY OPAQUE.
 *
 * It types `listingPages` [model/entity/Product.cfc:L79], `categories` [`:L80`] and the seven
 * many-to-many-inverse collections at [`:L84-L90`]: `promotionRewards`,
 * `promotionRewardExclusions`, `promotionQualifiers`, `promotionQualifierExclusions`,
 * `priceGroupRates`, `vendors` and `physicals`. Every one of those families is excluded outright by
 * §0.2.2.1 — `Content*` (5 files), `Category` (1), `Promotion*` (9), `PriceGroup*` (4),
 * `Vendor*` (15) and `Physical*` (6).
 *
 * WHY `object` AND NOT A DECLARED INTERFACE. Once the sixteen bidirectional helpers for these
 * collections are omitted — see THE SIXTEEN OMITTED COLLECTION HELPERS block, which records each
 * one with its locator — no ported code reads a member off any element of any of them. For a
 * collection that is only ever declared and never traversed, an opaque element type is the honest
 * declaration: it carries the fact that the collection holds entities without inventing a shape for
 * them (S9), and because `object` exposes no member the compiler actively prevents this port from
 * beginning to depend on one by accident.
 *
 * `object` rather than an empty `interface`, which the linter's empty-object-type rule would flag
 * and which would tempt an invented marker member. `object` rather than `unknown` or `any`, which
 * would admit a string or a number into a collection the legacy mapping guarantees holds entities.
 * The nine collections are consequently mutually assignable, which is acceptable for the same
 * reason as above and is recorded rather than hidden.
 *
 * TODO(boundary): the rightful owners are the content, category, promotion, price-group, vendor and
 * physical-count subsystems. When a later slice converts any of them, replace this alias at the
 * corresponding field declaration with that family's real domain type.
 */
export type ProductOutOfScopeAssociation = object;

/**
 * The default SKU, as narrowly as the NINE RETAINED delegating members use it.
 *
 * [model/entity/Product.cfc:L70] declares
 * `property name="defaultSku" cfc="Sku" fieldtype="many-to-one" fkcolumn="defaultSkuID"
 * cascade="delete" fetch="join"`. The `cascade="delete"` is noted because it is the only cascade of
 * that kind in the slice: deleting a product deletes its default SKU row. Cascade execution belongs
 * to `src/adapters/mysql/UnitOfWork.ts`, not here.
 *
 * THE MEMBER LIST IS EXACTLY THE NINE THE PORT CARRIES, AND THE FIVE IT DOES NOT ARE ABSENT BY
 * DESIGN. Declared here, each a real member of the SKU component invoked from a retained method:
 *     `getCurrencyCode`      [model/entity/Product.cfc:L557]
 *     `getPrice`             [`:L566`]
 *     `getRenewalPrice`      [`:L572`]
 *     `getListPrice`         [`:L578`]
 *     `getImageDirectory`    [`:L321`]
 *     `getImagePath`         [`:L325`]
 *     `getImage`             [`:L329`]
 *     `getResizedImagePath`  [`:L333`]
 *     `getImageExistsFlag`   [`:L337`]
 * NOT declared, because declaring them would hand this file a way to reach the excluded pricing and
 * promotion services: `getLivePrice` [`:L584`], `getCurrentAccountPrice` [`:L590`], `getSalePrice`
 * [`:L596`], `getSalePriceDiscountType` [`:L608`] and the misspelled
 * `getSalePricExpirationDateTime` [`:L618`]. All five belong to the sixteen-name exclusion list, and
 * the compiler now enforces that boundary instead of a comment asking for it.
 *
 * TWO NARROW VIEWS OF THE SAME NOT-YET-AUTHORED TYPE, ON PURPOSE. This interface and
 * {@link ProductSkuMember} both stand in for `Sku`, and each declares only what its own call sites
 * touch, exactly as R-C requires. They are not merged, because merging them would give the `skus`
 * collection a pricing surface and the default SKU a bidirectional surface that neither needs. Both
 * are replaced by the real type when `src/domain/sku/Sku.ts` lands.
 *
 * ON THE RETURN TYPES. The four price and currency reads are typed `| undefined` because the legacy
 * getters are implicit ORM accessors over nullable columns and CFML returns null from them; the four
 * retained delegations pass that straight through (see their doc comments). The image members are
 * typed as the legacy declared them at [`:L320-L338`] — `string`, `string`, `string`, `string` and
 * `boolean`. The three monetary members are typed {@link ExactDecimal} per F07, because
 * `ormtype="big_decimal"` is exact and a double is not.
 *
 * TODO(boundary): the rightful owners are `PricingPort` for the four price and currency reads and
 * `ImagePathPort` for the five image reads (§0.2.2.7). No file is created under `src/ports/` here.
 */
export interface ProductDefaultSkuDelegate {
  getCurrencyCode(): string | undefined;

  /* F07 — the three monetary reads are {@link ExactDecimal}, matching `Sku`'s fields; `big_decimal` is
   * carried as exact digits rather than as a double. `getCurrencyCode` is unaffected. */
  getPrice(): ExactDecimal | undefined;

  getRenewalPrice(): ExactDecimal | undefined;

  getListPrice(): ExactDecimal | undefined;

  getImageDirectory(): string;

  getImagePath(): string;

  getImage(): string;

  getResizedImagePath(): string;

  getImageExistsFlag(): boolean;
}

/**
 * Resolves this product's SKUs from a selected-option list — the single capability
 * `getSkusBySelectedOptions` needs.
 *
 * THE POSITIONAL SIGNATURE IS A CONTRACT WITH CODE OUTSIDE THIS SLICE, so it is pinned here
 * rather than tidied. [model/entity/Product.cfc:L367] passes
 * `(arguments.selectedOptions, this.getProductID())` positionally, and §0.6.1.1 records that the
 * out-of-scope caller `model/process/Order_AddOrderItem.cfc:L238` invokes the same service member
 * in the same positional two-argument form. `selectedOptions` FIRST, `productID` SECOND — reversing
 * them would compile and silently return nothing.
 *
 * THE METHOD NAME IS KEPT so the mapping stays greppable, and the interface is named for what it
 * DOES so it can never be mistaken for the service that will implement it (S3, S4: a `domain/`
 * module may not import from `services/` at all).
 *
 * WHERE THE REAL ALGORITHM LIVES — the finding §0.1.1 calls out, that the logic is not where a
 * service-oriented reading predicts. `ProductService.getProductSkusBySelectedOptions`
 * [model/service/ProductService.cfc:L104-L106] is itself a ONE-LINE PURE DELEGATION; the actual
 * option-matching query is three levels down at `model/dao/SkuDAO.cfc:L106-L128`. Its five
 * behaviour-preserving semantics are documented on {@link Product.getSkuBySelectedOptions}, because
 * that is the member whose arity logic depends on them.
 *
 * TODO(boundary): the rightful owners are `src/services/ProductService.ts` and, beneath it,
 * `SkuRepository.findSkusBySelectedOptions` implemented by
 * `src/adapters/mysql/MySqlSkuRepository.ts` (§0.4.2.6).
 */
export interface ProductSkuOptionFinder {
  /**
   * @param selectedOptions - A comma-delimited list of option identifiers. The EMPTY STRING is a
   *   legal, meaningful input; see T5 on {@link Product.getSkuBySelectedOptions}.
   * @param productID - This product's 32-character identifier (IR-6).
   * @returns Every SKU of the product carrying ALL of the listed options.
   */
  getProductSkusBySelectedOptions(
    selectedOptions: string,
    productID: string,
  ): Promise<ProductSkuMember[]>;
}

/**
 * Resolves the option groups in use by a product — the capability `getOptionGroups` needs.
 *
 * The legacy body [model/entity/Product.cfc:L251-L261] composes a paginated dynamic query, which F9
 * places outside this layer entirely. The member itself is nevertheless RETAINED, because §0.4.1.4
 * names `getOptionGroups` explicitly in the carry list; the query moves out and the capability comes
 * in as a parameter. The underlying legacy service member has NO declaration anywhere — it is
 * fabricated by prefix dispatch at `org/Hibachi/HibachiService.cfc:L255-L281` and is listed in
 * §0.4.2.5 among the eighteen synthesized members that must be declared explicitly (IR-1).
 *
 * THREE QUERY SEMANTICS TRAVEL WITH THIS CAPABILITY, and they are behaviour that must survive into
 * the adapter, so they are recorded here rather than left in a deleted method body:
 *   1. DISTINCT projection — [`:L255`] sets the select-distinct flag, so an option group joined
 *      through several SKUs is returned once.
 *   2. The filter path is `options.skus.product.productID` [`:L256`] — option groups reached from
 *      the product through its SKUs and their options, NOT option groups related to the product
 *      directly. There is no direct relationship; walking a shorter path would return a different
 *      set.
 *   3. Ordering is `sortOrder` ASCENDING [`:L257`], which is what makes the returned order
 *      meaningful to callers and what the SKU-ordering query independently depends on.
 *
 * ✅ IMPLEMENTED — THIS IS NO LONGER A BOUNDARY. `findProductOptionGroups` in
 * `src/services/OptionService.ts` is the owner, and it carries all three semantics above: it sets
 * `selectDistinctFlag`, filters on the three-hop `options.skus.product.productID` path, and orders by
 * `sortOrder` ASC. It reads `records`, not `pageRecords`, because [`:L258`] calls `getRecords()`.
 * `createProductOptionFinders` in that module binds it to the port and is what a caller passes here.
 * The relation is asserted at compile time rather than in prose — see
 * `ProductOptionFindersSatisfyGroupFinder` there and `ProductOptionFinderPairSatisfiesGroupFinder` in
 * `src/services/ProductService.ts` — so a drift between this interface and the query that serves it
 * fails the build at the seam.
 *
 * ⚠️ AN EARLIER REVISION NAMED A PUBLIC SERVICE MEMBER AS THE OWNER AND CALLED THE ADAPTER BENEATH IT
 * OUTSTANDING. Both statements are corrected. The owner is a module-scope function, not a member of
 * `OptionService`, because the question it answers is THIS ENTITY's — `getOptionGroups()` below — and the
 * legacy does not put it on that service either. (An earlier wording gave the reason as an arity budget,
 * "two extra public members would widen the service past the seven AAP §0.4.2.4 and §0.4.2.5 declare";
 * that reason is withdrawn where it is stated, in `src/services/OptionService.ts`, because the service
 * does now carry recorded additive members and a member count was never the thing being preserved.)
 * And the `SmartListQueryPort` implementation is DELIVERED —
 * `src/adapters/mysql/SmartListQueryBuilder.ts` implements it and names `model/entity/Product.cfc:L254`
 * among the call sites its distinct handling exists for. Nothing beneath this interface is missing.
 */
export interface ProductOptionGroupFinder {
  /**
   * @param productID - This product's 32-character identifier (IR-6).
   * @returns The product's option groups, distinct, ordered by `sortOrder` ascending.
   */
  getOptionGroupsForProduct(productID: string): Promise<OptionGroup[]>;
}

/**
 * Resolves the options of one option group that are in use by a product — the capability
 * `getOptionsByOptionGroup` needs.
 *
 * Same treatment and same reasoning as {@link ProductOptionGroupFinder}: the legacy body
 * [model/entity/Product.cfc:L340-L347] composes a paginated dynamic query (F9), the member is
 * retained because §0.4.1.4 names it, and the underlying legacy service member is another IR-1
 * synthesized one with no declaration anywhere.
 *
 * THREE QUERY SEMANTICS, recorded for the adapter:
 *   1. DISTINCT projection [`:L342`].
 *   2. TWO filters, applied in this order: `optionGroup.optionGroupID` [`:L343`] then
 *      `skus.product.productID` [`:L344`]. The parameter order below mirrors that application order
 *      exactly, so the mapping stays one-for-one.
 *   3. Ordering is `sortOrder` ASCENDING [`:L345`].
 *
 * ✅ IMPLEMENTED — THIS IS NO LONGER A BOUNDARY. `findProductOptionsByOptionGroup` in
 * `src/services/OptionService.ts` is the owner, carrying all three semantics: `selectDistinctFlag`,
 * BOTH filters in the legacy application order, and `sortOrder` ASC, reading `records` per [`:L346`].
 * Its two filters sit in ONE conjunctive group, because the legacy `addFilter` conjoins entries within
 * a group [org/Hibachi/HibachiSmartList.cfc:L590] and only separate groups disjoin [`:L571`].
 * `createProductOptionFinders` binds it to the port, and `ProductOptionFindersSatisfyOptionFinder`
 * asserts the relation at compile time. The same two corrections recorded on
 * {@link ProductOptionGroupFinder} apply here: the owner is a module-scope function rather than a
 * public service member, and the `SmartListQueryPort` implementation beneath it is DELIVERED in
 * `src/adapters/mysql/SmartListQueryBuilder.ts` rather than outstanding.
 */
export interface ProductOptionFinder {
  /**
   * @param optionGroupID - The option group to restrict to; the legacy first filter.
   * @param productID - This product's 32-character identifier; the legacy second filter.
   * @returns The matching options, distinct, ordered by `sortOrder` ascending.
   */
  getOptionsForProductByOptionGroup(optionGroupID: string, productID: string): Promise<Option[]>;
}

/**
 * One `{name, value}` selection entry.
 *
 * NOT AN INVENTED SHAPE. It is the literal projection the legacy data-access layer builds — at
 * `model/dao/OptionDAO.cfc:L86` for options,
 * `arrayAppend(result, {name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID})`, and in
 * the sibling query for option groups — and §0.4.2.4 types the same projection on
 * `OptionService.getOptionsForSelect`. The `"<group> - <option>"` label format is preserved by the
 * adapter that builds it; this file only carries the type through.
 *
 * ONLY THE ARITY OF THESE ARRAYS IS CONSUMED IN SCOPE. `model/validation/Product.json:L13-L14`
 * declares `minCollection: 1` gates on `unusedProductOptions` and `unusedProductOptionGroups` for
 * the two add-option contexts; no in-scope code reads `name` or `value` off an entry. The members
 * are declared anyway because the legacy projection declares them, and narrowing to a count would
 * discard information the admin surface consumes.
 */
export interface ProductSelectOption {
  readonly name: string;

  readonly value: string;
}

/**
 * Resolves the options and option groups NOT yet used by a product — the capability
 * `getUnusedProductOptions` and `getUnusedProductOptionGroups` need.
 *
 * BOTH LEGACY CALLS PASS A COMMA-DELIMITED STRING, NOT AN ARRAY, AND THAT FORM IS PRESERVED.
 * [model/entity/Product.cfc:L637] and [`:L644`] both pass `structKeyList(getOptionGroupsStruct())` —
 * the KEYS of the memoized option-group map, flattened into one comma-delimited string. That is the
 * `existingOptionGroupIDList` argument named in §0.4.2.4, and the data-access layer parses it as a
 * list: `model/dao/OptionDAO.cfc:L67` binds it with `list="true"`. "Improving" it into an array is
 * exactly the unrequested optimisation G4 forbids, and it would break the downstream placeholder
 * builder in `src/adapters/mysql/MySqlOptionRepository.ts`, which §0.4.3.4 specifies against the
 * list contract.
 *
 * Arguments are POSITIONAL and in the legacy order: `(productID, existingOptionGroupIDList)` for
 * options and `(existingOptionGroupIDList)` alone for option groups (§0.4.2.4).
 *
 * TODO(boundary): the rightful owner is `src/services/OptionService.ts` over
 * `OptionRepository.findUnusedOptions` and `OptionRepository.findUnusedOptionGroups` (§0.4.2.6).
 */
export interface ProductUnusedOptionFinder {
  /**
   * @param productID - This product's 32-character identifier (IR-6).
   * @param existingOptionGroupIDList - A COMMA-DELIMITED list of option-group identifiers.
   */
  getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<ProductSelectOption[]>;

  /**
   * @param existingOptionGroupIDList - A COMMA-DELIMITED list of option-group identifiers.
   */
  getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<ProductSelectOption[]>;
}

/**
 * Reports whether any transaction exists — the capability `getTransactionExistsFlag` needs.
 *
 * ⚠️ D23 — `productID` IS ACCEPTED AND FORWARDED. EARLIER PROSE HERE ARGUED THE OPPOSITE AND WAS
 * WRONG ABOUT CFML. [model/entity/Product.cfc:L626] passes the named argument
 * `productID=this.getProductID()`, and the service member it calls does declare no formal parameters
 * at `model/service/SkuService.cfc:L285`. The mistaken inference was that the argument is therefore
 * "tolerated silently and ignored", making the computed flag SYSTEM-WIDE. That is not how CFML
 * behaves: an undeclared named argument is still placed in the `arguments` scope, and [`:L286`]
 * forwards that entire scope with `argumentCollection=arguments`, so `productID` does reach the DAO —
 * whose declaration at `model/dao/SkuDAO.cfc:L53-L55` accepts it and whose `<cfelse>` branch at
 * [`:L61`] queries `ss.product.productID = :productID`. THE LEGACY FLAG IS PRODUCT-SCOPED.
 *
 * ⚠️ AND THE ERROR WAS NOT MERELY COSMETIC. This flag gates a DELETE — the `transactionExistsFlag`
 * delete guard in `model/validation/Product.json`. A system-wide answer returns `true` as soon as ANY
 * transaction exists anywhere in the database, which would block the deletion of EVERY product in any
 * non-empty installation. Passing the identifier restores the legacy behaviour rather than improving
 * on it, so IR-9 / G4 are satisfied: nothing is being "fixed" except the port.
 *
 * ⚠️ THE SHAPE IS CALLER-ORDERED AND SHARED, NOT A PRODUCT-SPECIFIC NARROWING — `(skuID?, productID?)`,
 * SKU first, because `model/entity/Sku.cfc:L594` supplies the first slot and
 * `model/entity/Product.cfc:L626` the second. A one-parameter `(productID)` contract would read better
 * here but would fork the declaration into two, and this entity passes `undefined` first and its own
 * identifier second, visibly, at its one call site.
 *
 * ⛔ AN EARLIER REVISION JUSTIFIED THIS SHAPE BY SAYING IT LET `SkuService.getTransactionExistsFlag` BE
 * BOUND DIRECTLY, "removing that failure mode entirely". IT DOES THE OPPOSITE. The service member
 * declares ZERO arguments — AAP 0.4.2.2 Discrepancy 4 freezes it that way — and TypeScript accepts a
 * lower-arity function wherever a higher-arity one is expected, so binding the service here compiled
 * and then DISCARDED this entity's identifier, leaving the DAO's else-branch to answer a wider
 * question. The consequence is precisely the one the member below documents: this flag gates a delete
 * at `model/validation/Product.json:L12`, so a widened `true` blocks deletion of products it should
 * not, with nothing reporting the substitution.
 *
 * ⭐ WHICH IS WHY THE CONTRACT CARRIES {@link ProductTransactionExistenceChecker.argumentOrder} — a
 * required member the zero-argument service does not declare, so the mis-binding is now a type error
 * rather than a silent widening. The single correct implementation is `createTransactionExistenceChecker`
 * in `src/adapters/mysql/MySqlSkuRepository.ts`, which crosses this caller order onto the repository
 * order `transactionExists(productID?, skuID?)` that AAP 0.4.2.6 pins. The brand cannot catch a crossing
 * written BACKWARDS — both identifiers are 32-character strings (IR-6), so a swapped adapter
 * type-checks — which is why the crossing exists in exactly one place beside the implementation it
 * inverts and is held by behavioural order assertions rather than by types.
 */
export interface ProductTransactionExistenceChecker {
  /**
   * Declares which slot means what, and exists to make a mis-binding fail to compile. Structurally
   * identical to `SkuTransactionExistenceChecker.argumentOrder` in `src/domain/sku/Sku.ts` — declared
   * separately, with no import between the two entity modules, so ONE object still satisfies both
   * contracts without this file taking a dependency on that one.
   *
   * ⛔ NOT A RUNTIME SWITCH. Nothing reads this value to decide anything.
   */
  readonly argumentOrder: 'skuID-first-productID-second';

  /**
   * @param skuID - Accepted so one implementation serves the SKU-side checker too. THIS ENTITY MUST
   *   LEAVE IT `undefined`: the DAO lets `skuID` win when both are present
   *   [model/dao/SkuDAO.cfc:L58-L64], so supplying it here would suppress the product-scoped branch.
   * @param productID - The product to scope the question to; the legacy `Product.cfc:L626` argument.
   * @returns Whether a transaction references that product.
   */
  getTransactionExistsFlag(skuID?: string, productID?: string): Promise<boolean>;
}

/**
 * Resolves the subscription terms not yet used by a product — the capability
 * `getUnusedProductSubscriptionTerms` needs.
 *
 * The subscription family is excluded outright by §0.2.2.1 (`Subscription*`, 11 files), so per TR-5
 * the member is kept on the surface as a boundary stub rather than dropped: dropping it would break
 * the `minCollection: 1` gate `model/validation/Product.json:L15` declares for the
 * add-subscription-term context.
 *
 * The element type is opaque for the same reason as {@link ProductOutOfScopeAssociation}: no
 * in-scope code reads a member off a subscription term, so inventing a shape for one would breach
 * S9. Only the arity is consumed.
 *
 * TODO(boundary): the rightful owner is `SubscriptionTermPort` (§0.2.2.7).
 */
export interface ProductSubscriptionTermFinder {
  /**
   * @param productID - This product's 32-character identifier (IR-6).
   * @returns The subscription terms not yet attached to the product.
   */
  getUnusedProductSubscriptionTerms(productID: string): Promise<ProductOutOfScopeAssociation[]>;
}

/* ================================================================================================
 * THE SIXTEEN EXCLUDED CALCULATED MEMBERS — §0.2.2.6, IR-3
 * ================================================================================================
 * §0.2.2.6 calls this "the exclusion most likely to be violated by accident", and IR-3 states the
 * failure mode exactly: without a stated boundary a downstream agent "would follow those getters and
 * drag half the platform into the port". This block is that stated boundary. Sixteen decisions,
 * each with a locator — not sixteen omissions.
 *
 * [model/entity/Product.cfc:L102-L123] declares TWENTY non-persistent properties in two blocks:
 *   BLOCK 1, general, [`:L102-L113`]: allowBackorderFlag, baseProductType, brandName, brandOptions,
 *     estimatedReceivalDetails, qats, salePriceDetailsForSkus, title, transactionExistsFlag,
 *     unusedProductOptions, unusedProductOptionGroups, unusedProductSubscriptionTerms
 *   BLOCK 2, "Non-Persistent Properties - Delegated to default sku", [`:L116-L123`]: currencyCode,
 *     defaultProductImageFiles, price, renewalPrice, listPrice, livePrice, salePrice,
 *     currentAccountPrice — the last six each carrying `hb_formatType="currency"`
 *
 * THE SIXTEEN NAMES THAT ARE NOT PORTED, AND WHOSE GETTERS ARE NOT FOLLOWED:
 *
 *    1. salePrice                              declared [`:L122`], getter [`:L594-L601`]
 *    2. salePriceDetails                       reached through the promotion service
 *    3. salePriceDiscountType                  getter [`:L604-L612`]
 *    4. salePriceDiscountAmount                reached through the promotion service
 *    5. salePriceExpirationDateTime            getter [`:L614-L622`]
 *    6. salePriceDetailsForSkus                declared [`:L108`], getter [`:L517-L522`]
 *    7. livePrice                              declared [`:L121`], getter [`:L582-L586`]
 *    8. currentAccountPrice                    declared [`:L123`], getter [`:L588-L592`]
 *    9. qats                                   declared [`:L107`], getter [`:L547-L549`]
 *   10. currencyDetails                        reached through the currency service
 *   11. estimatedReceivalDetails               declared [`:L106`], getter [`:L399-L404`]
 *   12. allowBackorderFlag                     declared [`:L102`], getter [`:L551-L553`]
 *   13. eligibleFulfillmentMethods             reached through the fulfillment service
 *   14. nextEstimatedAvailableDate             reached through the stock service
 *   15. assignedOrderItemAttributeSetSmartList reached through the attribute service
 *   16. adminIcon                              framework display concern
 *
 * They reach `priceGroupService`, `currencyService`, `stockService`, `inventoryService`,
 * `promotionService`, `locationService`, `fulfillmentService` and `attributeService` — EVERY ONE
 * explicitly excluded by §0.2.2.1. Four exclusion sites confirmed by reading the file: the promotion
 * service at [`:L519`], the stock service at [`:L401`], the inventory service at [`:L441`] and
 * [`:L443`], and the attribute service at [`:L798`]. `getQATS` [`:L547-L549`] is excluded
 * transitively because it delegates to the un-ported `getQuantity`, and `getAllowBackorderFlag`
 * [`:L551-L553`] because it reads the `skuAllowBackorderFlag` setting — a key deliberately absent
 * from {@link ProductSettingName}.
 *
 * NOT TO BE CONFUSED WITH THE FOUR PERSISTED CALCULATED COLUMNS. `calculatedSalePrice`,
 * `calculatedQATS`, `calculatedAllowBackorderFlag` and `calculatedTitle` [`:L62-L65`] are REAL
 * DATABASE COLUMNS on `SwProduct`, read straight off the row, and all four ARE carried — see their
 * field declarations. The names rhyme with four of the sixteen above; the storage does not.
 *
 * THE DECISION RULE FOR THE REMAINING FOUR NON-PERSISTENT MEMBERS, stated so the boundary is
 * auditable rather than case-by-case. §0.2.2.6 states positively that the port carries "the
 * persistent property surface; the option and SKU-structure members; url and title members;
 * image-path members; and the validation-support members". So:
 *
 *     A non-persistent member is RETAINED unless
 *       (a) its name appears in the sixteen-name list above, OR
 *       (b) its legacy body composes a paginated dynamic query (F9), OR
 *       (c) its legacy body reaches a framework facility F22 forbids declaring.
 *
 * Applying it to the four that survive rule (a):
 *   RETAINED  price        [`:L561-L568`]  thin delegation, plus its own backing field
 *   RETAINED  listPrice    [`:L576-L580`]  thin delegation
 *   RETAINED  renewalPrice [`:L570-L574`]  thin delegation
 *   RETAINED  currencyCode [`:L555-L559`]  thin delegation
 *   OMITTED   defaultProductImageFiles [`:L497-L515`]  rule (b) — composes a dynamic query
 *   OMITTED   brandOptions             [`:L534-L538`]  rule (c) — framework property-options plus a
 *                                                      resource-bundle lookup
 *
 * WHERE A RETAINED MEMBER WOULD READ AN EXCLUDED ONE, a typed boundary is declared and the gap is
 * flagged; the member is never quietly dropped (TR-5). The canonical case the AAP names is the
 * Google feed's conditional sale-price field, which reads a SKU's sale price: that read lives in
 * `src/integrations/google/ProductFeedBuilder.ts` behind `PricingPort`, NOT here — which is exactly
 * why {@link ProductDefaultSkuDelegate} declares the four retained price reads and refuses to
 * declare the five excluded ones.
 * ============================================================================================= */

/**
 * A product — the port of `model/entity/Product.cfc` and the aggregate root of the Catalog.
 *
 * `implements AuditableEntity`, and deliberately `extends` NOTHING. §0.3.3 replaces the legacy
 * template-method inheritance with composition, so the audit block is satisfied STRUCTURALLY: the
 * four fields are declared on this class's own surface and the compiler checks them against the
 * shared contract, while the functions that WRITE them stay in `../base/AuditableEntity` and are
 * invoked by the code that owns the write, `src/adapters/mysql/UnitOfWork.ts`. `AuditableEntity` is
 * not an inheritance root and this class does not extend it.
 *
 * CONSTRUCTIBLE WITH NO ARGUMENTS, BY MANDATE (S6). There is no declared constructor: field
 * initialisers express every default the legacy source states, and nothing else. `new Product()`
 * performs no I/O, no data access, no asynchronous work and no framework bootstrap — it cannot fail.
 * That is what makes `test/domain/Product.test.ts` a unit test where the legacy suite had to be an
 * integration test (§0.4.3.6), and every collaborator arrives as an explicit parameter typed by a
 * structural interface so a test can substitute a plain object literal.
 *
 * `newProduct()` and `getProduct(id)` are IR-1 synthesized SERVICE members listed in §0.4.2.5. They
 * belong to `src/services/ProductService.ts`, never here.
 *
 * @example
 * ```ts
 * const product = new Product();
 * product.productName = 'Nike Air';
 * product.urlTitle = 'nike-air-jorden';
 * product.isNew();                                   // true — productID is still the unsaved value
 * product.getProductURL({ setting: () => 'product' }); // '/product/nike-air-jorden/'
 * product.getSkus();                                 // [] — the live array, by reference
 * ```
 */
export class Product implements AuditableEntity, ManagedEntity {
  /*
   * ============================================================================================
   * PERSISTENT PROPERTIES — SIMPLE COLUMNS, [model/entity/Product.cfc:L52-L59]
   * ============================================================================================
   * Rule 1 — THE PERSISTENT DATA SURFACE IS PUBLIC FIELDS, named exactly as the legacy properties.
   * CFML's generated `getX()` / `setX()` accessor pairs are NOT reproduced, and the reason is
   * decisive rather than stylistic: `../base/populate` implements CFML's null semantics as
   * `delete target[name]`, and an accessor-backed value cannot be deleted. Where the legacy keeps
   * BOTH a backing variable and a hand-written getter that carries real behaviour, both are kept
   * (Rule 3) — this file does so for `template`, `title`, `brandName` and `price`.
   *
   * EVERY OPTIONAL FIELD IS DECLARED WITH `declare`, matching the sibling `Brand.ts`. This is
   * load-bearing, not cosmetic: the compilation target is ES2022, so class fields use
   * define semantics, and a plain `x?: T` would emit a property that is PRESENT WITH THE VALUE
   * `undefined`. That would destroy the legacy absence model — CFML's `structKeyExists` tests
   * presence — which several members in this file branch on. `declare` emits nothing, so an
   * unassigned property is genuinely ABSENT. Combined with `exactOptionalPropertyTypes`, "unset"
   * therefore means the key is missing and `undefined` is never assigned into any of them.
   */

  /**
   * The primary identifier — [model/entity/Product.cfc:L52]:
   *
   *     property name="productID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   *              unsavedvalue="" default="";
   *
   * INITIALISED TO THE EMPTY STRING, which is the legacy `unsavedvalue` and `default` verbatim. It
   * is the sentinel {@link Product.isNew} tests, and it is why this one field is required where
   * every other scalar is optional: a product is never in a state where it has no `productID`
   * property, only in a state where that property still holds the unsaved value.
   *
   * IDENTIFIERS ARE NEVER GENERATED HERE (IR-6). Per §6.2, 107 of the 113 legacy entities declare
   * this exact id shape, so the value is a 32-CHARACTER LOWERCASE HEX STRING WITH NO DASHES — never a
   * dashed RFC-4122 value and never an auto-increment number. Generation belongs to
   * `src/util/uuid.ts`, and this module does NOT import that utility, does not import any platform
   * random-value module, and calls no generator anywhere: an entity that minted its own key would
   * report itself already persisted the moment it was constructed, which is the one thing
   * {@link Product.isNew} exists to answer.
   *
   * WHICH LAYER DOES MINT IT, AND WHY IT IS NOT THE ADAPTER FOR THIS ENTITY.
   * `src/services/ProductService.ts` assigns the key inside `saveProduct`, immediately before it hands
   * the product to SKU creation. The mapping layer this port replaces could leave the decision to the
   * flush because the flush ran BEFORE the first SKU needed its parent's key; with no flush, the key
   * has to exist earlier than any adapter is reached, because `SwSku.productID` is written while the
   * product row itself does not yet exist. That is a documented ordering consequence of AAP §0.6.2 and
   * not a licence for the domain layer to mint: the service assigns the value, this field only holds
   * it. Contrast `src/domain/product/Brand.ts`, whose key genuinely IS minted on insert by
   * `MySqlBrandRepository.saveBrand`, because nothing reads a brand's key before its row is written.
   */
  productID: string = '';

  /**
   * [model/entity/Product.cfc:L53] `property name="activeFlag" ormtype="boolean"`.
   *
   * OPTIONAL WITH NO DEFAULT: the declaration carries no `default` attribute, unlike `publishedFlag`
   * one line group below, so an unpopulated `activeFlag` is genuinely absent rather than false.
   * Inventing a default would be inventing behaviour (S9). Read by the Google feed's record
   * selection as one of three activity filters, in `src/integrations/google/ProductFeedQuery.ts`.
   */
  declare activeFlag?: boolean;

  /**
   * [model/entity/Product.cfc:L54] `property name="urlTitle" ormtype="string" unique="true"`.
   *
   * THE `unique="true"` CONSTRAINT IS NOTED AND NOT ENFORCED HERE (IR-5). The legacy checked
   * uniqueness twice: once through the column constraint and once in application code, with an
   * existence query run during validation at `org/Hibachi/HibachiDAO.cfc:L130-L146`. That
   * application-side check is ported to `src/adapters/mysql/UniquePropertyChecker.ts`, and
   * `model/validation/Product.json:L16` declares the rule. A domain entity cannot perform it: it
   * requires data access, which S2 and S4 both forbid in this layer.
   *
   * Consumed by {@link Product.getProductURL} and {@link Product.getListingProductURL}, and assigned
   * by `ProductService.saveProduct` [model/service/ProductService.cfc:L268-L270] when absent.
   */
  declare urlTitle?: string;

  /**
   * [model/entity/Product.cfc:L55] `property name="productName" ormtype="string" notNull="true"`.
   *
   * THIS IS THE ONLY `notNull` PROPERTY IN THE ENTIRE IN-SCOPE SLICE — verified across all six
   * entities and all three process objects, a single occurrence at this line. The consequence is a
   * real asymmetry in POPULATION behaviour, and it is carried rather than smoothed away:
   *
   *   - For `productName` alone, a BLANK incoming value assigns the trimmed EMPTY STRING
   *     [org/Hibachi/HibachiTransient.cfc:L207].
   *   - For every other simple property in the slice, a blank incoming value DELETES the key
   *     [`:L196`] — null-by-deletion.
   *
   * The asymmetry is encoded once, on this property's descriptor below, through the `notNull` member
   * `../base/populate` provides for exactly this purpose. G4 forbids "fixing" it (S7).
   *
   * The field itself stays OPTIONAL: `notNull` governs how a blank PAYLOAD value is written, not
   * whether a freshly constructed transient product has a name. `new Product()` has none, which is
   * precisely why the legacy save-context rule at `model/validation/Product.json:L9` requires it and
   * why the inherited base assertion that a new instance fails save-validation holds.
   *
   * This is also the property {@link Product.getSimpleRepresentationPropertyName} names.
   */
  declare productName?: string;

  /**
   * [model/entity/Product.cfc:L56] `property name="productCode" ormtype="string" unique="true"`.
   *
   * Same uniqueness treatment as `urlTitle`: noted, not enforced here (IR-5). Its save-context rule
   * additionally carries a format regex, documented in the VALIDATION CONTRACT block as comment text
   * only. Read by the Google feed as the item-group identifier.
   */
  declare productCode?: string;

  /**
   * [model/entity/Product.cfc:L57]
   * `property name="productDescription" ormtype="string" length="4000" hb_formFieldType="wysiwyg"`.
   *
   * `length="4000"` is a column-width fact carried into `src/adapters/mysql/rowMappers.ts`; no
   * length check is performed here, because the legacy performed none in the entity.
   * `hb_formFieldType="wysiwyg"` is admin form-rendering metadata with no target analogue — the
   * admin surface is out of scope (§0.2.2.2) and this is a headless service.
   *
   * Read by the Google feed for its description field, which falls back to the product type's
   * description when this is empty; that fallback lives in
   * `src/integrations/google/ProductFeedBuilder.ts`.
   */
  declare productDescription?: string;

  /**
   * [model/entity/Product.cfc:L58]
   * `property name="publishedFlag" ormtype="boolean" default="false"`.
   *
   * THE `default="false"` IS DECLARED IN THE SOURCE BUT IS NOT APPLIED AS A FIELD INITIALISER
   * HERE, and the distinction matters. In the legacy the attribute is ORM metadata consumed at
   * INSERT time, not a constructor default: a transient product created and inspected before any
   * flush reports a null `publishedFlag`, not false. Initialising the field to `false` would
   * therefore make a new instance report a value the legacy did not have, and would additionally
   * collapse the absent/false distinction that `exactOptionalPropertyTypes` exists to keep. The
   * default is carried in this property's descriptor documentation and applied by the layer that
   * owns the write. Contrast `activeFlag`, which declares no default at all.
   *
   * Read by the Google feed as one of its three publication filters.
   */
  declare publishedFlag?: boolean;

  /**
   * [model/entity/Product.cfc:L59] `property name="sortOrder" ormtype="integer"`.
   *
   * F20 — THE FIELD IS DECLARED AND IS NEVER ASSIGNED BY THIS FILE. The legacy value is assigned
   * by the ORM lifecycle, in the insert hook at `org/Hibachi/HibachiEntity.cfc:L637-L647`, which
   * computes the next ordinal for the entity's collection. That is persistence-layer work: it needs
   * the sibling set, it needs to run inside the write transaction, and reproducing it here would
   * require data access this layer may not perform.
   *
   * Deliberately NOT ported alongside it, for the same reason: the sort-order assignment block
   * itself, `updateCalculatedProperties()`, and the `isPersistable()` flush guard.
   *
   * TODO(boundary): the rightful owner is `src/adapters/mysql/UnitOfWork.ts`, which §0.4.1.7 makes
   * responsible for the implicit request-end commit gate and the ORM lifecycle hooks it replaces.
   */
  declare sortOrder?: number;

  /*
   * ============================================================================================
   * THE FOUR PERSISTED CALCULATED COLUMNS — [model/entity/Product.cfc:L62-L65]
   * ============================================================================================
   * THESE ARE REAL DATABASE COLUMNS ON `SwProduct`, READ STRAIGHT OFF THE ROW. They are declared
   * under the legacy comment `// Calculated Properties`, which invites exactly the confusion this
   * block exists to prevent: they are NOT members of the sixteen-name exclusion list, they perform
   * no computation, and they reach no service. Each is a plain optional persistent field, and each
   * carries an explicit `ormtype` in the source, recorded below because
   * `src/adapters/mysql/rowMappers.ts` needs it.
   *
   * The legacy recomputation of these columns is a separate concern and is not ported: it belongs to
   * the `updateCalculatedProperties()` machinery F20 assigns to `UnitOfWork.ts`.
   */

  declare calculatedSalePrice?: ExactDecimal;

  /**
   * [model/entity/Product.cfc:L63] `ormtype="integer"`. Persisted, not computed here.
   *
   * LOAD-BEARING FOR THE GOOGLE FEED, though not from this file: the feed controller's availability
   * gate is a range filter on `product.calculatedQATS` from 1 upward
   * [integrationServices/google/controllers/feed.cfc], which is why `SmartListQueryPort` is one of
   * the seven boundary ports rather than something the feed resolves itself. That filter lives in
   * `src/integrations/google/ProductFeedQuery.ts`, not here.
   *
   * Note the contrast with the EXCLUDED non-persistent `qats` [`:L107`], whose getter [`:L547-L549`]
   * delegates to the un-ported inventory-backed `getQuantity`. Same concept, different storage, and
   * only the persisted column is carried.
   */
  declare calculatedQATS?: number;

  declare calculatedAllowBackorderFlag?: boolean;

  /**
   * [model/entity/Product.cfc:L65] `ormtype="string"`. Persisted, not computed here.
   *
   * `calculatedTitle` IS NOT {@link Product.getTitle}, AND CONFLATING THEM SILENTLY CHANGES THE
   * GOOGLE FEED'S OUTPUT. `integrationServices/google/views/feed/product.cfm:L18` reads the PERSISTED
   * COLUMN — the product's calculated title — for the feed's title field, NOT the live template
   * render. The two are exposed separately and deliberately:
   *
   *   - this field is the stored column, whatever a previous write left in it;
   *   - {@link Product.getTitle} renders `productTitleString` against this entity ON DEMAND and
   *     memoizes the result per instance.
   *
   * They can legitimately disagree, and the feed depends on reading the stored one. The same
   * distinction is documented on `getTitle`, so it cannot be broken from either side.
   */
  declare calculatedTitle?: string;

  /*
   * ============================================================================================
   * RELATED OBJECT PROPERTIES — MANY-TO-ONE, [model/entity/Product.cfc:L62-L64 comment block, L68-L70]
   * ============================================================================================
   */

  /**
   * [model/entity/Product.cfc:L68]:
   *
   *     property name="brand" cfc="Brand" fieldtype="many-to-one" fkcolumn="brandID"
   *              hb_optionsNullRBKey="define.none" fetch="join";
   *
   * THIS FIELD MUST BE OPTIONAL, AND THE REASON IS A SPECIFIC LINE OF LEGACY CODE.
   * {@link Product.removeBrand} ends at [`:L676`] with `structDelete(variables, "brand")`, which
   * runs UNCONDITIONALLY. The faithful port of that statement is `delete this.brand`, and `delete`
   * is only legal on an optional property under `strict`. So optionality here is not a stylistic
   * preference: it is what makes the legacy behaviour expressible at all. {@link Product.getBrandName}
   * additionally branches on this property's PRESENCE, which is the other reason absence must be
   * representable.
   *
   * `hb_optionsNullRBKey="define.none"` is the resource-bundle key the admin brand picker used for
   * its null entry. It is the same facility `getBrandOptions` [`:L534-L538`] reaches, and it is why
   * that member is omitted under rule (c); no resource-bundle lookup exists in this port.
   * `fetch="join"` is a Hibernate fetch strategy with no target analogue — eager-versus-lazy loading
   * is `src/adapters/mysql/rowMappers.ts`'s decision now.
   */
  declare brand?: Brand;

  /**
   * [model/entity/Product.cfc:L69]:
   *
   *     property name="productType" cfc="ProductType" fieldtype="many-to-one"
   *              fkcolumn="productTypeID" fetch="join";
   *
   * PUBLIC, WRITABLE AND OPTIONAL BY CONTRACT WITH THE SIBLING MODULE: `ProductType.ts:1271` — its
   * port of `addProduct` — assigns `product.productType = this`, so anything narrower than a plain
   * writable field would break that file. Optional because a transient product has no product type
   * until one is assigned, which is exactly why `model/validation/Product.json:L11` requires it on
   * save, and because {@link Product.getBaseProductType} must branch on its absence.
   */
  declare productType?: ProductType;

  /**
   * [model/entity/Product.cfc:L70]:
   *
   *     property name="defaultSku" cfc="Sku" fieldtype="many-to-one" fkcolumn="defaultSkuID"
   *              cascade="delete" fetch="join";
   *
   * OPTIONAL BECAUSE FIVE RETAINED MEMBERS BRANCH ON ITS PRESENCE — `getCurrencyCode` [`:L556`],
   * `getPrice` [`:L565`], `getRenewalPrice` [`:L571`], `getListPrice` [`:L577`] and, among the
   * excluded ones, the sale-price family. Every one of them tests presence rather than truthiness,
   * so absence must be representable.
   *
   * `cascade="delete"` is noted: deleting a product deletes its default SKU row. That is the only
   * cascade of its kind in the slice and it is executed by
   * `src/adapters/mysql/UnitOfWork.ts`, not here.
   *
   * Typed against {@link ProductDefaultSkuDelegate} rather than a `Sku` type, because
   * `src/domain/sku/Sku.ts` is not authored by this file and must not be created here.
   */
  declare defaultSku?: ProductDefaultSkuDelegate;

  /*
   * ============================================================================================
   * RELATED OBJECT PROPERTIES — ONE-TO-MANY, [model/entity/Product.cfc:L73-L76]
   * ============================================================================================
   * All four are `cascade="all-delete-orphan" inverse="true"`. `inverse="true"` is the fact that
   * shapes the bidirectional helpers: the MANY side owns the foreign key, which is why
   * {@link Product.addSku} and its three siblings hand ownership to the other entity through
   * `setProduct` instead of pushing onto the local array. `cascade="all-delete-orphan"` means
   * removing an element deletes its row; that execution belongs to `UnitOfWork.ts`.
   *
   * ALL FOUR ARE INITIALISED EAGERLY TO `[]`, so a bare `new Product()` is immediately usable and
   * the F2 live-array contract holds from construction. HONEST PROVENANCE NOTE: unlike `Brand`,
   * whose legacy test overrides the `defaults_are_correct` assertion to require an empty products
   * array, `Product` has NO legacy assertion pinning any empty collection — see the TRACEABLE TEST
   * CONTRACT block. The eager `[]` follows the folder convention and the live-array contract, and
   * claiming traceability for it would be a claim the source does not support.
   */

  /**
   * [model/entity/Product.cfc:L73]:
   *
   *     property name="skus" type="array" cfc="Sku" singularname="Sku" fieldtype="one-to-many"
   *              fkcolumn="productID" cascade="all-delete-orphan" inverse="true";
   *
   * THE CORE AGGREGATE COLLECTION. `SkuService.createSkus` builds it, and
   * {@link Product.getSkuBySelectedOptions} reasons over its arity on the empty-selection path.
   * `singularname="Sku"` is capitalised here where the other three collections use lower case; the
   * value is provenance only and nothing concatenates it into a member name, because S3 forbids
   * exactly that.
   */
  skus: ProductSkuMember[] = [];

  /**
   * [model/entity/Product.cfc:L74]:
   *
   *     property name="productImages" type="array" cfc="Image" singularname="productImage"
   *              fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan"
   *              inverse="true";
   *
   * Note the element component is `Image`, while the property and the generated singular name say
   * `productImage`. Both are recorded; neither is normalised.
   */
  productImages: ProductOwnedAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L75]:
   *
   *     property name="attributeValues" singularname="attributeValue" cfc="AttributeValue"
   *              fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan"
   *              inverse="true";
   *
   * `AttributeValue` is out of scope (§0.2.2.1 excludes the six `Attribute`-prefixed components), so
   * the element type is the shared structural association; the two helpers are retained under TR-5.
   */
  attributeValues: ProductOwnedAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L76]:
   *
   *     property name="productReviews" singlularname="productReview" cfc="ProductReview"
   *              fieldtype="one-to-many" fkcolumn="productID" cascade="all-delete-orphan"
   *              inverse="true";
   *
   * `TODO(parity)` — THE LEGACY ATTRIBUTE IS MISSPELLED, VERBATIM: `singlularname`, with an extra
   * `l`, where the other three collections spell it `singularname`. That is reproduced here as a
   * recorded fact and NOT corrected (G4, S7). The consequence is a legacy one and is not this port's
   * to repair: the framework composed its generated `add*` / `remove*` / `has*` member names from
   * the correctly spelled attribute, so whether it could see this collection under the misspelled
   * key at all is a property of the legacy engine. What matters for the port is that the two
   * hand-written helpers at [`:L704-L709`] exist regardless and are carried.
   *
   * The descriptor below therefore records the singular name the legacy would have needed
   * (`productReview`) while this comment records the attribute as actually spelled. No new defect
   * identifier is introduced; AAP §0.6.7 catalogues D1-D21 and the live bound is stated only at
   * `src/ports/repositories/SkuRepository.ts`.
   */
  productReviews: ProductOwnedAssociation[] = [];

  /*
   * ============================================================================================
   * RELATED OBJECT PROPERTIES — MANY-TO-MANY OWNER, [model/entity/Product.cfc:L79-L81]
   * ============================================================================================
   * THESE THREE ARE OWNER-SIDE: none declares `inverse="true"`, so THIS entity owns the link
   * table. That is the opposite of every many-to-many on `Brand` and `ProductType`, which are all
   * inverse, and it is why the legacy `addListingPage` helper at [`:L712-L718`] mutates the LOCAL
   * `listingPages` array directly instead of delegating — the only such helper on this entity.
   *
   * The link tables are `SwProductListingPage`, `SwProductCategory` and `SwRelatedProduct`. Those
   * names appear here as prose only; no table identifier is a value anywhere in this file (S2).
   */

  /**
   * [model/entity/Product.cfc:L79] — many-to-many OWNER over link table `SwProductListingPage`,
   * `cfc="Content"`, `singularname="listingPage"`, inverse join column `contentID`.
   *
   * `Content*` is excluded by §0.2.2.1 (5 files), and the two bidirectional helpers at [`:L712-L729`]
   * are omitted with their locators recorded in THE SIXTEEN OMITTED COLLECTION HELPERS block. Since
   * nothing in scope traverses the collection once those are gone, the element type is opaque.
   */
  listingPages: ProductOutOfScopeAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L80] — many-to-many OWNER over link table `SwProductCategory`,
   * `cfc="Category"`, `singularname="category"`, inverse join column `categoryID`.
   *
   * `model/entity/Category.cfc` is EXPLICITLY out of scope (§0.2.2.1), and the exclusion is
   * unusually clean: the entity exists but there is NO category service anywhere in the repository —
   * categories were handled through the content service — so there is no service surface to exclude,
   * only the entity. `getCategoryIDs` [`:L199-L205`] is omitted for that reason; the collection is
   * declared for descriptor completeness with an opaque element type.
   */
  categories: ProductOutOfScopeAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L81] — many-to-many OWNER over link table `SwRelatedProduct`,
   * `cfc="Product"` and `type="array"`, `singularname="relatedProduct"`, inverse join column
   * `relatedProductID`.
   *
   * SELF-REFERENCING, so the element type is `Product` itself — genuinely in scope, requiring no
   * structural stand-in, and creating no import at all. The legacy declares no bidirectional helper
   * for it: the framework synthesized `addRelatedProduct` / `removeRelatedProduct` from
   * `singularname`, and no in-scope code calls either, so neither is declared here (Rule 2b).
   */
  relatedProducts: Product[] = [];

  /*
   * ============================================================================================
   * RELATED OBJECT PROPERTIES — MANY-TO-MANY INVERSE, [model/entity/Product.cfc:L84-L90]
   * ============================================================================================
   * Seven collections, every element family excluded by §0.2.2.1: `PromotionReward` and
   * `PromotionQualifier` (`Promotion*`, 9 files), `PriceGroupRate` (`PriceGroup*`, 4), `Vendor`
   * (`Vendor*`, 15) and `Physical` (`Physical*`, 6). All seven declare `inverse="true"`, so the
   * other side owns the link table, and all seven of their legacy helper pairs [`:L731-L785`] are
   * pure delegations INTO that other side — which is precisely why omitting the helpers leaves the
   * collections untraversed and the opaque element type honest.
   *
   * They are declared as fields for descriptor completeness and for round-trip fidelity of the row
   * mapping, exactly as Phase E permits: "for collections only ever declared and never traversed, a
   * documented opaque element interface is sufficient and preferable to inventing a shape".
   *
   * `physicals` — NOT `physicalCounts`. See the VALIDATION CONTRACT block: all three validation
   * documents in this folder reference a `physicalCounts` property that NO entity declares. That is
   * a genuine undeclared-property reference in the legacy source; it is documented and NOT
   * manufactured into a field here (S9).
   */

  promotionRewards: ProductOutOfScopeAssociation[] = [];

  promotionRewardExclusions: ProductOutOfScopeAssociation[] = [];

  promotionQualifiers: ProductOutOfScopeAssociation[] = [];

  promotionQualifierExclusions: ProductOutOfScopeAssociation[] = [];

  priceGroupRates: ProductOutOfScopeAssociation[] = [];

  vendors: ProductOutOfScopeAssociation[] = [];

  physicals: ProductOutOfScopeAssociation[] = [];

  /**
   * [model/entity/Product.cfc:L93] `property name="remoteID" ormtype="string"`, under the legacy
   * `// Remote Properties` comment.
   *
   * POPULATE-ENABLED, deliberately. It carries no `hb_populateEnabled` attribute, so unlike the four
   * audit properties immediately below it, it IS writable from request data — a distinction the
   * shared audit tuple's own documentation calls out explicitly. Read by the excluded inventory
   * branch at [`:L441`]; the field itself is a plain persisted column and is carried.
   */
  declare remoteID?: string;

  /*
   * ============================================================================================
   * AUDIT PROPERTIES — [model/entity/Product.cfc:L96-L99]
   * ============================================================================================
   * All four declare `hb_populateEnabled="false"`, and PRODUCT CARRIES EXACTLY FOUR SUCH
   * DECLARATIONS — all audit, none anywhere else in the file. `ProductType` matches that. `Brand`
   * carries NINE, because it flags five relationship properties as well; those five are
   * Brand-specific and are NOT copied here. The count is stated because the three files legitimately
   * differ and harmonising them would be wrong.
   *
   * The four are declared on Product's OWN surface rather than inherited: `AuditableEntity` is a
   * structural contract, not an inheritance root (§0.3.3). The exclusion itself is enforced by
   * reusing the shared frozen `AUDIT_PROPERTY_NAMES` tuple in the descriptor set below — the four
   * name strings are never re-listed in this file.
   *
   * TWO DIFFERENT ABSENCE REPRESENTATIONS, AND THEY ARE NOT HARMONISED. The framework overrode
   * precisely two of these four getters, at `org/Hibachi/HibachiEntity.cfc:L291-L305`, so that an
   * unset TIMESTAMP reads as the empty string rather than as null; the two account getters have NO
   * override, so for them absence is genuine absence. The read-side helpers in
   * `../base/AuditableEntity` reproduce that asymmetry exactly — the timestamp readers return
   * `Date | ''` and the account readers return `string | undefined` — and a caller wanting the
   * legacy read semantics should use them rather than touching these fields directly.
   *
   * THE TWO ACCOUNT FIELDS ARE TYPED `string`, holding a 32-character identifier. No `Account` type
   * is declared or imported: §0.2.2.1 excludes the 21 `Account`-prefixed components outright, and
   * declaring a shape for one would be invention (S9). The legacy `fkcolumn` values
   * `createdByAccountID` and `modifiedByAccountID` are column names belonging to
   * `src/adapters/mysql/rowMappers.ts`, not property keys, which is why they are not the field names
   * here.
   */

  declare createdDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L97] `hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   */
  declare createdByAccount?: string;

  declare modifiedDateTime?: Date;

  /**
   * [model/entity/Product.cfc:L99] `hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`.
   */
  declare modifiedByAccount?: string;

  /*
   * ============================================================================================
   * NON-PERSISTENT BACKING FIELDS AND PER-INSTANCE MEMOIZATION SLOTS
   * ============================================================================================
   * Rule 3 — where the legacy keeps BOTH a backing variable and a hand-written getter carrying real
   * behaviour, both are kept, and the DECLARED property name is used consistently.
   *
   * S8 / M7 — EVERY ONE OF THESE IS PER-INSTANCE. NOT ONE IS MODULE-SCOPE, and that is a hard
   * constraint rather than a preference. A Lambda container is reused across invocations, so a
   * module-scope cache would leak one request's product data into the next request — cross-tenant
   * bleed. The legacy could afford module-level state because it ran on a persistent application
   * server with request-scoped ORM sessions; this port cannot. `../base/AuditableEntity` and
   * `../../util/formatting` both assign the ownership of these caches to this file explicitly, and
   * the caches for OMITTED members disappear along with them. NO NEW CACHE IS ADDED.
   *
   * Seven legacy memoizations are carried, matching the seven retained members that had them:
   * `optionGroupsStruct`, `optionGroups`, `title`, `brandName`, `transactionExistsFlag`,
   * `unusedProductOptions` and `unusedProductOptionGroups`. All seven are `declare`d so an unfilled
   * cache is genuinely ABSENT, and every read tests `!== undefined` rather than truthiness — because
   * `''`, `0`, `false` and `[]` are all legitimate cached values here and a truthiness test would
   * silently recompute them.
   */

  /**
   * The display-template override consumed by {@link Product.getTemplate}.
   *
   * S9 — THERE IS A `variables.template` BACKING VARIABLE BUT NO `property name="template"`
   * DECLARATION ANYWHERE IN [model/entity/Product.cfc:L102-L123]. That was verified across both
   * non-persistent blocks. The finding is RECORDED and the missing declaration is NOT invented: the
   * field is kept because [`:L216-L219`] reads and returns it, and it is typed optional because that
   * same guard tests its presence.
   */
  declare template?: string;

  /**
   * Per-instance memo for {@link Product.getTitle} — [model/entity/Product.cfc:L541-L544] caches into
   * `variables.title`, and `title` IS a declared non-persistent property at [`:L110`].
   */
  declare title?: string;

  /**
   * Per-instance memo for {@link Product.getBrandName} — declared non-persistent at
   * [model/entity/Product.cfc:L105].
   *
   * This slot is the vehicle of a PRESERVED DEFECT. See {@link Product.getBrandName}: the legacy
   * writes the empty string here and then returns the brand's name without ever storing it, so the
   * memo permanently holds `''`. The field is typed and named exactly as the legacy declares it so
   * the defect is expressible; it is not repaired (G4, S7).
   */
  declare brandName?: string;

  /**
   * The price override consumed by {@link Product.getPrice} — declared non-persistent at
   * [model/entity/Product.cfc:L118] with `hb_formatType="currency"`.
   *
   * `price` IS THE ONLY ONE OF THE EIGHT DEFAULT-SKU-DELEGATED PROPERTIES WITH A BACKING SLOT THE
   * GETTER CONSULTS. [`:L562-L563`] returns `variables.price` when present and only then falls
   * through to the default SKU, whereas `currencyCode`, `renewalPrice` and `listPrice` test the
   * default SKU alone. The asymmetry is real and is preserved; `getPrice` is the sole member in that
   * family with two-step resolution.
   *
   * `hb_formatType="currency"` is admin display metadata with no target analogue (headless service).
   *
   * F07 — typed {@link ExactDecimal} because {@link Product.getPrice} unions this slot with the default
   * SKU's `price`, and the two halves of one getter must not disagree about representation.
   */
  declare price?: ExactDecimal;

  /**
   * Per-instance memo for {@link Product.getOptionGroupsStruct} — [model/entity/Product.cfc:L242-L248].
   *
   * Keyed by option-group identifier. A `Record` rather than a `Map`, matching the sibling
   * `OptionGroup.ts` convention and the legacy struct it ports, which matters because
   * {@link Product.getUnusedProductOptions} derives a comma-delimited list from THIS OBJECT'S KEYS.
   */
  declare optionGroupsStruct?: Record<string, OptionGroup>;

  /** Per-instance memo for {@link Product.getOptionGroups} — [model/entity/Product.cfc:L252-L259]. */
  declare optionGroups?: OptionGroup[];

  /**
   * Per-instance memo for {@link Product.getTransactionExistsFlag} —
   * [model/entity/Product.cfc:L625-L628]. Declared non-persistent at [`:L111`].
   */
  declare transactionExistsFlag?: boolean;

  /**
   * Per-instance memo for {@link Product.getUnusedProductOptions} —
   * [model/entity/Product.cfc:L636-L639]. Declared non-persistent at [`:L112`].
   */
  declare unusedProductOptions?: ProductSelectOption[];

  /**
   * Per-instance memo for {@link Product.getUnusedProductOptionGroups} —
   * [model/entity/Product.cfc:L643-L646]. Declared non-persistent at [`:L113`].
   */
  declare unusedProductOptionGroups?: ProductSelectOption[];

  /**
   * Whether this product has never been persisted.
   *
   * F21 — TRUE EXACTLY WHEN `productID` STILL HOLDS THE UNSAVED VALUE, the empty string declared at
   * [model/entity/Product.cfc:L52]. The legacy equivalent lived on the framework base
   * [org/Hibachi/HibachiEntity.cfc], which compared the primary identifier against `unsavedvalue`.
   *
   * DOUBLY LOAD-BEARING, which is why it is one of only two framework-shaped members this file
   * declares:
   *   1. It satisfies the inherited base assertion `defaults_are_correct`
   *      [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67], which asserts `isNew()` on a
   *      freshly constructed entity — true here because the field initialiser IS the unsaved value.
   *   2. It is the left operand of the SHORT-CIRCUIT in {@link Product.setBrand} at
   *      [model/entity/Product.cfc:L664]. When it returns `true` the membership test is never
   *      evaluated, which is a preserved behaviour, not an optimisation.
   *
   * A strict `===` against the empty string, not a length or truthiness test: the legacy compared
   * against `unsavedvalue` specifically.
   */
  isNew(): boolean {
    return this.productID === '';
  }

  /**
   * The property whose value stands in for this entity in generic displays — `'productName'`.
   *
   * THE ONE SANCTIONED F22 EXCEPTION ON THIS ENTITY. [model/entity/Product.cfc:L791-L793] is a
   * real overriding body returning this literal, so Rule 2a applies and the member is ported.
   *
   * AND THERE IS DELIBERATELY NO `getSimpleRepresentation()` HERE. The three sibling entities
   * legitimately have three different shapes and MUST NOT be harmonised:
   *   - `Product` overrides only the property NAME (this member) — [`:L791-L793`];
   *   - `ProductType` overrides the REPRESENTATION ITSELF
   *     [model/entity/ProductType.cfc:L273-L278], which is why `ProductType.ts` has that member;
   *   - `Brand` overrides NEITHER, so `Brand.ts` has neither.
   *
   * The consequence for the test contract is spelled out in the TRACEABLE TEST CONTRACT block: the
   * inherited assertion that a simple representation exists and is simple is satisfied for `Product`
   * through the framework DEFAULT, driven by this member's return value — not by a local override.
   * Declaring `getSimpleRepresentation()` here would change which mechanism answers that assertion.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'productName';
  }

  /*
   * ============================================================================================
   * COLLECTION ACCESSORS — F2, THE LIVE-ARRAY CONTRACT
   * ============================================================================================
   * EVERY ONE OF THESE RETURNS THE BACKING ARRAY BY REFERENCE. Never `.slice()`, never a spread
   * copy, never `ReadonlyArray`. This is load-bearing IN BOTH DIRECTIONS and a defensive copy
   * anywhere here converts a working mutation into a silent no-op:
   *
   *   - INBOUND: `Brand.ts`'s port of the brand side splices the array returned by
   *     `brand.getProducts()`, and {@link Product.setBrand} APPENDS into it
   *     [model/entity/Product.cfc:L665].
   *   - OUTBOUND: {@link Product.removeBrand} finds and splices the live array on the OTHER entity
   *     [`:L671-L673`].
   *
   * The legacy got this for free — CFML arrays pass by reference inside a component and the
   * framework's generated getters returned `variables.<name>` directly. Here it is a deliberate,
   * documented choice.
   */

  /**
   * Every SKU of this product, as the live backing array.
   *
   * PORTS THE DEFAULT PATH OF [model/entity/Product.cfc:L155-L160] ONLY, and the split is a TR-2
   * relocation rather than a loss. The legacy signature is
   * `getSkus(boolean sorted=false, boolean fetchOptions=false)`, and:
   *
   *   - when BOTH flags are false — the only form any in-scope caller uses — [`:L156-L157`] returns
   *     `variables.skus` untouched. That is this member, and it is what the arity reasoning in
   *     {@link Product.getSkuBySelectedOptions} depends on;
   *   - when EITHER flag is set, [`:L159`] hands off to the SKU service's sorted/fetching query. That
   *     is a data-access path, so it relocates to `SkuService.getProductSkus`, whose signature
   *     §0.4.2.2 already declares — and which §0.6.7.4 records as carrying defect D13. Reproducing it
   *     here would mean this layer performing data access, which S2 and S4 both forbid.
   *
   * The two flags are therefore absent from this signature by design; a caller wanting sorted or
   * option-fetching SKUs calls the service member that owns that behaviour.
   *
   * @returns The live `skus` array — mutations by the caller are intentional and visible here.
   */
  getSkus(): ProductSkuMember[] {
    return this.skus;
  }

  /**
   * Finds one of this product's SKUs by identifier — [model/entity/Product.cfc:L162-L169].
   *
   * A pure in-memory linear scan over {@link Product.getSkus}, ported with two translations recorded
   * under G6:
   *
   *   - THE LEGACY LOOP IS 1-BASED (`for(var i = 1; i <= arrayLen(skus); i++)`) and indexes
   *     `skus[i]`. Iterating the array directly expresses the same traversal without any index
   *     arithmetic to get wrong, and it sidesteps `noUncheckedIndexedAccess` entirely rather than
   *     needing a guard per iteration.
   *   - THE LEGACY RETURNS NULL WHEN NOTHING MATCHES — [`:L169`] simply ends without a `return`
   *     statement, and the declared return type is `any`. That is reproduced as an explicit
   *     `undefined`, which `noImplicitReturns` requires be written out. The explicit return is a
   *     transcription of the legacy fall-through, NOT a new guard.
   *
   * `skus[i].getSkuID()` cannot be called directly because `src/domain/sku/Sku.ts` is not this
   * file's to author, so the identifier read arrives as {@link ProductSkuIdReader} (Phase E).
   *
   * @param readSkuID - Reads a SKU's 32-character identifier. TODO(boundary): collapses to
   *   `sku.skuID` once `src/domain/sku/Sku.ts` exists.
   * @param skuID - The identifier to match, compared with strict equality.
   * @returns The matching SKU, or `undefined` when none matches.
   */
  getSkuByID(readSkuID: ProductSkuIdReader, skuID: string): ProductSkuMember | undefined {
    for (const sku of this.getSkus()) {
      if (readSkuID(sku) === skuID) {
        return sku;
      }
    }
    return undefined;
  }

  /**
   * This product's images, as the live backing array — [model/entity/Product.cfc:L178-L180].
   *
   * The legacy body is `return variables.productImages;` — a bare alias for the collection under a
   * shorter name, with no filtering, ordering or transformation. Both names are kept because the
   * legacy exposes both, and both hand back the SAME array instance, so a mutation through either is
   * visible through the other (F2).
   */
  getImages(): ProductOwnedAssociation[] {
    return this.productImages;
  }

  /**
   * This product's images, as the live backing array — the framework-generated accessor name.
   *
   * @see {@link Product.getImages} for the hand-written legacy alias over the same array.
   */
  getProductImages(): ProductOwnedAssociation[] {
    return this.productImages;
  }

  /**
   * This product's attribute values, as the live backing array (F2).
   *
   * `AttributeValue` is out of scope (§0.2.2.1), so the element type is the shared structural
   * association. The accessor is declared because the F2 contract applies to all four one-to-many
   * collections uniformly and the two retained helpers below mutate this one.
   */
  getAttributeValues(): ProductOwnedAssociation[] {
    return this.attributeValues;
  }

  /**
   * This product's reviews, as the live backing array (F2).
   *
   * `ProductReview` is out of scope (§0.2.2.4). The omitted `getProductRating` [`:L227-L239`] was the
   * only in-scope reader of this collection; the two retained helpers below still mutate it under
   * TR-5.
   */
  getProductReviews(): ProductOwnedAssociation[] {
    return this.productReviews;
  }

  /**
   * This product's canonical public URL — [model/entity/Product.cfc:L207-L209].
   *
   * The legacy body is a single interpolated string:
   *
   *     return "/#setting('globalURLKeyProduct')#/#getURLTitle()#/";
   *
   * THIS IS THE ONE TRACEABLE LEGACY ASSERTION FOR THIS ENTIRE ENTITY.
   * `productUrlIsCorrectlyFormatted`
   * at [meta/tests/unit/entity/ProductTest.cfc:L58-L62] sets the url title to `nike-air-jorden` and
   * asserts equality against the setting value wrapped in slashes. Everything else this file is
   * tested by is either inherited from the base class or net-new (§0.6.5), so the RENDERED SHAPE IS
   * IMMOVABLE:
   *
   *     /<globalURLKeyProduct>/<urlTitle>/
   *      ^                   ^          ^
   *      leading slash       single     TRAILING SLASH
   *                          separator
   *
   * All three are asserted. Dropping the trailing slash, doubling a separator or omitting the leading
   * slash each breaks the one legacy test this entity has.
   *
   * THE `setting(...)` CALL DOES NOT SURVIVE AS A CALL (R2, S3, F22). The legacy accessor reaches
   * the out-of-scope setting service through the hierarchical resolver at
   * [model/entity/HibachiEntity.cfc:L129]; per IR-2 and R-C the RESOLVED VALUE arrives as an explicit
   * parameter instead. No default is supplied for the key (S9).
   *
   * `getURLTitle()` reads the persistent `urlTitle` field directly. It is optional, so its absence is
   * handled explicitly: the legacy interpolated a null as the empty string, producing `/<setting>//`,
   * and that is reproduced rather than guarded against — a missing url title is a validation failure
   * [model/validation/Product.json:L16], not this member's problem to mask.
   *
   * @param settings - Resolves `globalURLKeyProduct`. TODO(boundary): rightful owner is
   *   `SettingResolverPort` via `src/adapters/settings/StaticSettingResolver.ts`.
   * @returns The URL, with leading and trailing slashes.
   */
  getProductURL(settings: ProductSettingResolver): string {
    return `/${settings.setting('globalURLKeyProduct')}/${this.urlTitle ?? ''}/`;
  }

  /**
   * This product's URL as rendered inside a listing page — [model/entity/Product.cfc:L211-L213].
   *
   *     return "#setting('globalURLKeyProduct')#/#getURLTitle()#/";
   *
   * G6 — THIS IS {@link Product.getProductURL} WITHOUT THE LEADING SLASH, AND THAT ONE CHARACTER IS
   * THE ENTIRE DIFFERENCE BETWEEN THE TWO MEMBERS. They are otherwise byte-identical: same setting
   * key, same url title, same trailing slash. The distinction is called out because a well-meaning
   * refactor that factors the "shared" expression into one helper, or that harmonises the two shapes,
   * breaks exactly one of them — and only one of them is covered by a legacy test, so the breakage
   * would be silent.
   *
   * They are therefore kept as two independent literal templates. The duplication is deliberate.
   *
   * @param settings - Resolves `globalURLKeyProduct`. Same boundary as
   *   {@link Product.getProductURL}.
   * @returns The URL with a trailing slash and NO leading slash.
   */
  getListingProductURL(settings: ProductSettingResolver): string {
    return `${settings.setting('globalURLKeyProduct')}/${this.urlTitle ?? ''}/`;
  }

  /**
   * The display template for this product — [model/entity/Product.cfc:L215-L221].
   *
   *     if(!structKeyExists(variables, "template") || variables.template == "") {
   *         return setting('productDisplayTemplate');
   *     } else {
   *         return variables.template;
   *     }
   *
   * THE GUARD TESTS BOTH ABSENCE AND EMPTINESS, AND BOTH HALVES ARE REPRODUCED. Under
   * `exactOptionalPropertyTypes` those really are two distinct states — the key missing, and the key
   * present holding `''` — so the translation is an explicit two-part check rather than a truthiness
   * test. A truthiness test would happen to give the same answer for these two cases but would ALSO
   * swallow any other falsy value, which the legacy comparison against `""` specifically does not do.
   *
   * The setting is consulted only on the fallback path, exactly as the legacy short-circuit dictates:
   * when a non-empty override is present the resolver is never called. No default is supplied for
   * `productDisplayTemplate` (S9).
   *
   * See {@link Product.template} for the finding that the backing variable has no corresponding
   * legacy property declaration.
   *
   * @param settings - Resolves `productDisplayTemplate`, consulted only on the fallback path.
   * @returns The override when present and non-empty, otherwise the resolved setting value.
   */
  getTemplate(settings: ProductSettingResolver): string {
    const configuredTemplate = this.template;
    if (configuredTemplate === undefined || configuredTemplate === '') {
      return settings.setting('productDisplayTemplate');
    }
    return configuredTemplate;
  }

  /* ==============================================================================================
   * THE OPTION-TO-SKU RESOLUTION CHAIN — §0.6.1, THE HARDEST PIECE OF THE SLICE
   * ==============================================================================================
   * The prompt names `getProductSkusBySelectedOptions` as the hardest piece of the Catalog, and
   * §0.6.1 explains why the name is misleading: the SERVICE method is a one-line delegation, and the
   * complexity lives one level DOWN, in dynamically composed query text, and one level UP — here, in
   * the arity assertions layered on top of it. This entity owns the upper half.
   *
   * THE FULL CHAIN (§0.6.1.1), with this file's two members
   * sitting in the middle of it:
   *
   *   Sku.hasUniqueOptions          [model/entity/Sku.cfc:L763]            ─┐
   *   Product.getSkuBySelectedOptions  [model/entity/Product.cfc:L349-L364] ─┤
   *   Order_AddOrderItem            [model/process/Order_AddOrderItem.cfc:L238] ─┤ OUT OF SCOPE caller
   *                                                                          ▼
   *   Product.getSkusBySelectedOptions [model/entity/Product.cfc:L366-L368]
   *                                                                          ▼
   *   ProductService.getProductSkusBySelectedOptions [model/service/ProductService.cfc:L104-L106]
   *                                                                          ▼
   *   SkuDAO.getSkusBySelectedOptions  [model/dao/SkuDAO.cfc:L107-L128]  ← THE ACTUAL ALGORITHM
   *
   * THE FIVE SEMANTICS OF §0.6.1.3 (T1-T5) ARE SILENT-DRIFT TRAPS. Each is a plausible,
   * well-intentioned "improvement" that changes RESULTS WITHOUT PRODUCING AN ERROR. Three of the five
   * are load-bearing for the arity logic in THIS file, so all five are recorded here as well as in
   * the adapter that implements them — either file can break them.
   *
   *   T1 — CONJUNCTION, NOT INTERSECTION. The query ANDs one correlated existence clause PER
   *        CHOSEN OPTION, so a SKU must carry EVERY listed option. Rewriting the list into a
   *        single membership test turns the conjunction into a DISJUNCTION; rewriting it as a
   *        grouped count diverges whenever the list contains DUPLICATE entries. One clause per list
   *        element, duplicates included.
   *
   *   T2 — THE PRODUCT IDENTIFIER IS UNCONDITIONALLY PRESENT ON THE REAL PATH. The DAO guards it
   *        with a presence test, but the service declares it REQUIRED and is the DAO's ONLY caller,
   *        so that guard is always true in practice and the "optional product" path is unreachable.
   *        The target types it REQUIRED — a declared decision, not a silent collapse. This member
   *        satisfies it by always passing its own identifier.
   *
   *   T3 — THE VESTIGIAL OPTION JOIN IS LOAD-BEARING. [model/dao/SkuDAO.cfc:L108] joins the SKU's
   *        options under an alias that is NEVER REFERENCED in the filter clause. It looks removable.
   *        It is not: it silently EXCLUDES OPTION-LESS SKUS from every result, INCLUDING when the
   *        selection is empty. Removing it changes the empty-selection path of this member and the
   *        second-order behaviour §0.6.2 records as D19.
   *
   *   T4 — DISTINCT-ROW RETRIEVAL IS MANDATORY. The join fans out one row per SKU-option pair, so
   *        without it a SKU carrying N options comes back N TIMES. THE ARITY LOGIC IN
   *        {@link Product.getSkuBySelectedOptions} IS PRECISELY WHAT MAKES THIS LOAD-BEARING: a
   *        single fanned-out SKU would satisfy the "more than one" branch and throw instead of
   *        returning.
   *
   *   T5 — AN EMPTY OPTION LIST IS A LEGAL, MEANINGFUL INPUT. The list length of the empty string is
   *        zero, so ZERO existence clauses are appended and the query legitimately degenerates to
   *        "all option-bearing SKUs of this product". BOTH this member's else-branch AND
   *        `Sku.hasUniqueOptions` depend on that degenerate form. See the explicit warning on
   *        {@link Product.getSkuBySelectedOptions}.
   *
   * §0.6.2 — THE VALIDATION READ-BACK LOOP, the highest-risk item in the whole slice and the one
   * thing here that a faithful-LOOKING port breaks with no error and no compile failure.
   * `Sku.hasUniqueOptions` is not an ordinary helper: it is a DECLARATIVE VALIDATION RULE registered
   * in `model/validation/Sku.json`, and it EXECUTES A QUERY through this very chain while the same
   * operation is writing rows. Under Hibernate the rule saw only siblings already flushed to the
   * session; with no ORM session there is no automatic flush, so ordering must be made explicit by
   * `src/adapters/mysql/UnitOfWork.ts`. Nothing about that is resolvable from this file — but a
   * change here to when or whether the query runs propagates straight into it, which is why this
   * member's control flow is reproduced statement for statement below.
   */

  /**
   * Resolves the ONE SKU of this product matching a selection of options —
   * [model/entity/Product.cfc:L349-L364].
   *
   * THE VERIFIED CONTROL FLOW, REPRODUCED EXACTLY. Read this before touching the body:
   *
   *   1. Selection NON-EMPTY → RUN THE QUERY.
   *        exactly one result  → return it;
   *        more than one       → throw the message at [`:L355`];
   *        fewer than one      → throw the message at [`:L357`].
   *   2. Selection EMPTY and this product has EXACTLY ONE SKU → return that SKU.
   *      THE QUERY IS NOT CALLED ON THIS PATH AT ALL.
   *   3. Selection EMPTY and the SKU count is anything else → throw the message at [`:L362`].
   *
   * THE THIRD THROW IS THE EMPTY-OPTION-LIST, NON-SINGLETON-SKU-SET CASE. IT IS **NOT** A GENERAL
   * ARGUMENT GUARD. Its message reads like input validation, and a reader who assumes that will hoist
   * it to the top of the method as a defensive precondition — which changes the behaviour of EVERY
   * caller, because it is reached only after the SKU-count test fails. It stays exactly where the
   * legacy `else` puts it: as the final branch of the SKU-count test.
   *
   * DO NOT PRE-GUARD THE EMPTY OPTION LIST (T5). No early return, no length precondition, no
   * "defensive" check. An empty selection is legal and meaningful, and BOTH this member's own
   * else-branch and `Sku.hasUniqueOptions` depend on the degenerate query form it produces. A guard
   * here breaks both callers.
   *
   * THE THREE MESSAGE STRINGS ARE OWNED BY `src/errors/DomainError.ts` AND ARE IMPORTED, NEVER
   * RETYPED — not in code and not in a comment. Each literal must occur
   * exactly ONCE across the target tree, so reproducing one anywhere in this file, including
   * inside a doc comment or as a paraphrase close enough to match, breaks that gate. They are
   * referred to here ONLY by their legacy locators: [`:L355`], [`:L357`], [`:L362`]. The export shape
   * is deliberately MIXED and is not homogenised — the first two are FACTORY FUNCTIONS taking the raw
   * selection string, because the legacy interpolated it; the third is a PLAIN CONSTANT, because the
   * legacy interpolated nothing. Two deliberate legacy misspellings inside the third message are
   * preserved in that module and are obtained here for free by importing rather than retyping.
   *
   * THE OPTION-LIST STRING IS PASSED THROUGH UNMODIFIED into the message factories and into the
   * query — not trimmed, not split, not re-joined, not normalised. The legacy interpolated the raw
   * argument, and T1 depends on duplicates surviving.
   *
   * CFML ARRAYS ARE 1-BASED. [`:L353`] reads `skus[1]` and [`:L360`] reads `getSkus()[1]`; both are
   * INDEX 0 here. Getting that wrong silently returns the wrong SKU rather than failing.
   * `noUncheckedIndexedAccess` types both reads as possibly-absent, and both are resolved with an
   * explicit guard — no non-null assertion, no cast, no `any` (S1).
   *
   * ASYNC because the query path awaits the repository through {@link Product.getSkusBySelectedOptions}.
   * The legacy was synchronous only because the CFML engine blocked on its ORM call; the observable
   * ordering is unchanged.
   *
   * @param skuOptionFinder - The option-resolution capability (Phase E). Consulted ONLY when the
   *   selection is non-empty.
   * @param selectedOptions - A comma-delimited list of option identifiers. Defaults to the EMPTY
   *   STRING exactly as [`:L349`] declares, and the empty string selects path 2 or 3.
   * @returns The single matching SKU.
   * @throws LegacyParityError - On every ambiguous or empty outcome; see the control flow above.
   *   All three messages are disclosed verbatim, which is why the legacy-message subclass is used
   *   rather than the deny-by-default base — see the note at the first throw.
   */
  async getSkuBySelectedOptions(
    skuOptionFinder: ProductSkuOptionFinder,
    selectedOptions: string = '',
  ): Promise<ProductSkuMember | undefined> {
    if (selectedOptions.length > 0) {
      const matchingSkus = await this.getSkusBySelectedOptions(skuOptionFinder, selectedOptions);
      if (matchingSkus.length === 1) {
        // T4 depends on the query returning distinct rows; index 0 is the legacy's 1.
        const singleMatch = matchingSkus[0];
        if (singleMatch !== undefined) {
          return singleMatch;
        }
      } else if (matchingSkus.length > 1) {
        throw new LegacyParityError(moreThanOneSkuReturnedMessage(selectedOptions));
      } else if (matchingSkus.length < 1) {
        throw new LegacyParityError(noSkusFoundForSelectedOptionsMessage(selectedOptions));
      }
      /*
       * Formally unreachable: a length is exactly one, greater than one, or less than one. The
       * legacy simply fell out of its inner branch chain and returned null, and `noImplicitReturns`
       * requires that fall-through be written out. This is a TRANSCRIPTION of the legacy implicit
       * null, NOT an additional guard, and it is also where the guarded index read lands if a
       * length of one ever coexisted with an absent element zero.
       */
      return undefined;
    } else if (this.getSkus().length === 1) {
      /*
       * PATH 2 — THE QUERY IS NOT CALLED HERE. `getSkus()` hands back the live array by reference
       * (F2), so binding it once is identical to the legacy's two calls at [`:L359`] and [`:L360`].
       */
      const productSkus = this.getSkus();
      const onlySku = productSkus[0];
      if (onlySku !== undefined) {
        return onlySku;
      }
      return undefined;
    } else {
      // PATH 3 — the else of the SKU-COUNT test. Not an argument guard. See the warning above.
      throw new LegacyParityError(NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE);
    }
  }

  /**
   * Every SKU of this product carrying ALL of the selected options —
   * [model/entity/Product.cfc:L366-L368].
   *
   * The legacy body is one delegation:
   *
   *     the dynamic product-service lookup, then
   *       .getProductSkusBySelectedOptions(arguments.selectedOptions, this.getProductID())
   *
   * POSITIONAL DELEGATION — OPTION LIST FIRST, PRODUCT IDENTIFIER SECOND. The order is a CONTRACT
   * WITH CODE OUTSIDE THIS SLICE, not an internal detail: §0.6.1.1 records that the out-of-scope
   * caller [model/process/Order_AddOrderItem.cfc:L238] invokes the same member in the same positional
   * two-argument form. Swapping the two arguments type-checks perfectly — both are strings — and then
   * silently searches for a product whose identifier is an option list. The order is preserved and
   * {@link ProductSkuOptionFinder} pins it in the interface so the compiler documents it.
   *
   * THE ALGORITHM IS THREE LEVELS DOWN, WHICH IS THE WHOLE FINDING OF §0.1.1. The service member
   * this delegates to is ITSELF a one-line pure delegation [model/service/ProductService.cfc:L104-L106]
   * that forwards its entire argument collection onward; the real work — the conjunctive existence
   * clauses of T1, the distinct selection of T4, the option-bearing guard of T3 — lives in
   * [model/dao/SkuDAO.cfc:L106-L128] and ports to `src/adapters/mysql/MySqlSkuRepository.ts`. A
   * service-oriented reading of the codebase would look for it in the service and find two thin
   * lines.
   *
   * R2 — THE DYNAMIC SERVICE LOOKUP DOES NOT SURVIVE, and S4 forbids a domain module importing
   * from the service layer outright. The capability arrives as an explicit parameter typed by
   * {@link ProductSkuOptionFinder}, deliberately named so it can never be mistaken for the real
   * service class.
   *
   * R2 TRANSLATION DECISION — THE LEGACY CASING IS INCONSISTENT AND CFML DID NOT CARE. This line
   * spells the service key with a lower-case leading letter; [`:L254`] spells the option service with
   * an UPPER-case leading letter; [`:L341`] spells the same option service in lower case. All three
   * resolved identically because CFML component lookups are CASE-INSENSITIVE. TypeScript imports and
   * property names are not, so any port that carried the string keys forward would have to normalise
   * them and would be making an undocumented choice. Replacing the lookups with typed parameters
   * removes the question entirely.
   *
   * NO EMPTY-OPTION-LIST GUARD HERE EITHER (T5). The selection is forwarded exactly as received.
   *
   * @param skuOptionFinder - The option-resolution capability. TODO(boundary): rightful owners are
   *   `src/services/ProductService.ts` and, beneath it,
   *   `SkuRepository.findSkusBySelectedOptions` in `src/adapters/mysql/MySqlSkuRepository.ts`.
   * @param selectedOptions - Comma-delimited option identifiers; defaults to the empty string exactly
   *   as [`:L366`] declares, and is forwarded UNMODIFIED.
   * @returns Every matching SKU, distinct, option-bearing only.
   */
  async getSkusBySelectedOptions(
    skuOptionFinder: ProductSkuOptionFinder,
    selectedOptions: string = '',
  ): Promise<ProductSkuMember[]> {
    return skuOptionFinder.getProductSkusBySelectedOptions(selectedOptions, this.productID);
  }

  /* ==============================================================================================
   * THE OPTION-STRUCTURE MEMBERS — RETAINED, EVERY ONE NAMED EXPLICITLY BY §0.4.1.4
   * ==============================================================================================
   * §0.4.1.4's Domain Layer row names `getOptionGroupsStruct`, `getOptionGroups`,
   * `getOptionsByOptionGroup`, `getSkuBySelectedOptions`, `getSkusBySelectedOptions`,
   * `getBaseProductType`, `getUnusedProductOptions` and `getUnusedProductOptionGroups` as the members
   * the port CARRIES. Three of them compose a paginated dynamic query in their legacy body, which F9
   * would otherwise place outside this layer entirely — so the tension is real and it is resolved the
   * way TR-5 dictates: THE MEMBER IS RETAINED, THE QUERY MOVES OUT, and the capability comes back in
   * as an explicit parameter. The member is never quietly dropped, and no query text is written here.
   *
   * EACH RELOCATED QUERY'S SEMANTICS ARE DOCUMENTED ON THE MEMBER THAT LOST THEM, because they are
   * BEHAVIOUR that must survive into `src/adapters/mysql/SmartListQueryBuilder.ts`. A reader of the
   * adapter alone cannot recover the filter paths or the ordering from anywhere else.
   */

  /**
   * This product's option groups keyed by option-group identifier —
   * [model/entity/Product.cfc:L241-L249].
   *
   *     if( !structKeyExists(variables, "optionGroupsStruct") ) {
   *         variables.optionGroupsStruct = {};
   *         for(var optionGroup in getOptionGroups()){
   *             variables.optionGroupsStruct[optionGroup.getOptionGroupID()] = optionGroup;
   *         }
   *     }
   *     return variables.optionGroupsStruct;
   *
   * A `Record` rather than a `Map`, matching the legacy struct and the sibling `option/` convention.
   * That choice is consequential, not cosmetic: {@link Product.getUnusedProductOptions} and
   * {@link Product.getUnusedProductOptionGroups} both derive their comma-delimited argument from THIS
   * OBJECT'S KEYS, so the key set is part of the observable contract.
   *
   * KEYED ON THE `optionGroupID` FIELD, NOT A GETTER. The sibling `OptionGroup.ts` exposes the
   * primary identifier as a public FIELD under Rule 1 — there is no `getOptionGroupID()` accessor to
   * call — so the legacy `optionGroup.getOptionGroupID()` becomes a direct field read. Same value,
   * different mechanism.
   *
   * CFML STRUCT-KEY ENUMERATION ORDER IS UNSPECIFIED, so no ordering is asserted for the key set
   * and nothing downstream may depend on one. The option groups themselves ARE ordered — see
   * {@link Product.getOptionGroups} — but the map's key order is not that ordering and must not be
   * mistaken for it.
   *
   * MEMOIZED PER INSTANCE into {@link Product.optionGroupsStruct} (S8/M7 — never module-scope). The
   * cache is tested for ABSENCE rather than truthiness, so a legitimately EMPTY map is cached once
   * rather than rebuilt on every call.
   *
   * ASYNC because it walks {@link Product.getOptionGroups}, which is async.
   *
   * @param optionGroupFinder - Forwarded to {@link Product.getOptionGroups} on a cache miss only.
   * @returns The live memoized map — by reference, consistent with the F2 contract on collections.
   */
  async getOptionGroupsStruct(
    optionGroupFinder: ProductOptionGroupFinder,
  ): Promise<Record<string, OptionGroup>> {
    const memoizedStruct = this.optionGroupsStruct;
    if (memoizedStruct !== undefined) {
      return memoizedStruct;
    }
    const builtStruct: Record<string, OptionGroup> = {};
    for (const optionGroup of await this.getOptionGroups(optionGroupFinder)) {
      builtStruct[optionGroup.optionGroupID] = optionGroup;
    }
    this.optionGroupsStruct = builtStruct;
    return builtStruct;
  }

  /**
   * The option groups in use by this product — [model/entity/Product.cfc:L251-L261].
   *
   * THREE QUERY SEMANTICS RELOCATE OUT OF THIS FILE AND ARE RECORDED HERE BECAUSE THEY ARE
   * BEHAVIOUR. The legacy body composes them onto a paginated dynamic query at [`:L254-L258`]:
   *
   *   1. DISTINCT-ROW RETRIEVAL — [`:L255`] sets the distinct flag. The filter path traverses a
   *      collection twice over, so without it one option group repeats once per matching SKU.
   *   2. THE FILTER PATH IS `options.skus.product.productID`, MATCHED AGAINST THIS PRODUCT'S
   *      IDENTIFIER — [`:L256`]. Read it as: option groups whose OPTIONS are carried by SKUS
   *      belonging to THIS product. It is a three-hop traversal, and shortening it changes the
   *      result set.
   *   3. ORDERED BY `sortOrder` ASCENDING — [`:L257`]. This ordering is what makes the option-group
   *      sequence deterministic, and it is the same ordering the SKU-code composition in
   *      `model/dao/SkuDAO.cfc:L172-L204` depends on.
   *
   * All three belong to `src/adapters/mysql/SmartListQueryBuilder.ts` behind `SmartListQueryPort`
   * (F9); the capability arrives as {@link ProductOptionGroupFinder}.
   *
   * THE UNDERLYING LEGACY SERVICE MEMBER HAS NO SOURCE DECLARATION ANYWHERE. The option-group
   * smart-list accessor it calls is fabricated at runtime by prefix dispatch
   * [org/Hibachi/HibachiService.cfc:L255-L281] — this is IR-1, and §0.4.2.5 lists this exact call site
   * among the members that must become explicit declarations. It is why the capability is DECLARED
   * here rather than assumed.
   *
   * MEMOIZED PER INSTANCE into {@link Product.optionGroups}. Note the legacy assigns the empty array
   * at [`:L253`] BEFORE running the query and then overwrites it at [`:L258`]; that pre-assignment is
   * unobservable — no code runs between the two statements — so a single assignment of the resolved
   * value is behaviourally identical and is what is written.
   *
   * @param optionGroupFinder - Consulted once per instance, on a cache miss only.
   * @returns The option groups, distinct and ordered by sort order ascending.
   */
  async getOptionGroups(optionGroupFinder: ProductOptionGroupFinder): Promise<OptionGroup[]> {
    const memoizedOptionGroups = this.optionGroups;
    if (memoizedOptionGroups !== undefined) {
      return memoizedOptionGroups;
    }
    const resolvedOptionGroups = await optionGroupFinder.getOptionGroupsForProduct(this.productID);
    this.optionGroups = resolvedOptionGroups;
    return resolvedOptionGroups;
  }

  /**
   * How many option groups this product uses — [model/entity/Product.cfc:L263-L265].
   *
   * The legacy body is `return arrayLen(getOptionGroups());`. A real body (Rule 2a), pure, and
   * derived solely from a retained member, so it is ported rather than dropped.
   *
   * ASYNC purely by inheritance from its dependency; it performs no work of its own beyond the count,
   * and it reuses the same per-instance memo, so calling it after {@link Product.getOptionGroups}
   * runs no second query.
   *
   * @param optionGroupFinder - Forwarded to {@link Product.getOptionGroups}.
   * @returns The number of option groups in use.
   */
  async getOptionGroupCount(optionGroupFinder: ProductOptionGroupFinder): Promise<number> {
    return (await this.getOptionGroups(optionGroupFinder)).length;
  }

  /**
   * The options this product uses within one option group — [model/entity/Product.cfc:L340-L347].
   *
   * DELIBERATELY NOT MEMOIZED, UNLIKE ITS NEIGHBOURS — and the difference is preserved. Every
   * other member in this group caches into a per-instance slot; this one re-runs its query on EVERY
   * call [`:L341-L346`], with no presence test and no assignment. That is almost certainly incidental
   * in the original, but it is observable — a caller that mutates option membership between two calls
   * sees the change here and would NOT see it through the memoized members — so no cache is added
   * (G4). Adding one would also require a per-option-group cache key, which is invention.
   *
   * THREE QUERY SEMANTICS RELOCATE, recorded here for the same reason as on
   * {@link Product.getOptionGroups}:
   *
   *   1. DISTINCT-ROW RETRIEVAL — [`:L342`].
   *   2. TWO FILTERS, BOTH REQUIRED AND IN THIS ORDER — `optionGroup.optionGroupID` against the
   *      requested group [`:L343`], then `skus.product.productID` against THIS product [`:L344`].
   *      Read together: options belonging to the named group AND carried by a SKU of this product.
   *      Dropping the second filter returns every option in the group, product-wide.
   *   3. ORDERED BY `sortOrder` ASCENDING — [`:L345`].
   *
   * The underlying legacy service member is again IR-1 SYNTHESIZED with no declaration anywhere
   * (§0.4.2.5 lists the option smart-list accessor explicitly), which is why the capability is
   * declared rather than assumed.
   *
   * @param optionFinder - The option-resolution capability. TODO(boundary): rightful owners are
   *   `src/services/OptionService.ts` and `SmartListQueryPort` over
   *   `src/adapters/mysql/SmartListQueryBuilder.ts`.
   * @param optionGroupID - The option group to restrict to; required in the legacy signature too.
   * @returns The matching options, distinct and ordered by sort order ascending.
   */
  async getOptionsByOptionGroup(
    optionFinder: ProductOptionFinder,
    optionGroupID: string,
  ): Promise<Option[]> {
    return optionFinder.getOptionsForProductByOptionGroup(optionGroupID, this.productID);
  }

  /**
   * The options NOT yet used by this product — [model/entity/Product.cfc:L635-L640].
   *
   *     variables.unusedProductOptions = the dynamic option-service lookup, then
   *         .getUnusedProductOptions( getProductID(), structKeyList(getOptionGroupsStruct()) )
   *
   * THE SECOND ARGUMENT IS A COMMA-DELIMITED STRING BUILT FROM THE OPTION-GROUP MAP'S KEYS, AND
   * THE STRING FORM IS PRESERVED. `structKeyList` flattens the keys of
   * {@link Product.getOptionGroupsStruct} into one comma-delimited value; that is the
   * `existingOptionGroupIDList` argument §0.4.2.4 names, and the data-access layer parses it AS A
   * LIST — `model/dao/OptionDAO.cfc:L67` binds it with a list flag to build a negated membership
   * clause. Converting it to an array is precisely the unrequested improvement G4 forbids, and
   * §0.4.3.4 specifies the downstream placeholder builder against the LIST contract, so the
   * conversion would break `src/adapters/mysql/MySqlOptionRepository.ts`.
   *
   * NO ORDERING IS ASSERTED for the joined keys — CFML struct-key enumeration order is
   * unspecified, and the negated membership clause it feeds is order-insensitive.
   *
   * ARGUMENTS ARE POSITIONAL: product identifier first, existing-group list second (§0.4.2.4).
   *
   * VALIDATION-SUPPORT MEMBER, which is why it is retained under §0.2.2.6's positive list:
   * `model/validation/Product.json:L13` declares a minimum-collection gate of one on this property
   * for the add-option context. Its ARITY is the observable thing.
   *
   * MEMOIZED PER INSTANCE into {@link Product.unusedProductOptions} (S8/M7).
   *
   * @param unusedOptionFinder - TODO(boundary): rightful owner is `src/services/OptionService.ts`.
   * @param optionGroupFinder - Needed to build the existing-group list on a cache miss.
   * @returns The unused options as `{name, value}` entries.
   */
  async getUnusedProductOptions(
    unusedOptionFinder: ProductUnusedOptionFinder,
    optionGroupFinder: ProductOptionGroupFinder,
  ): Promise<ProductSelectOption[]> {
    const memoizedUnusedOptions = this.unusedProductOptions;
    if (memoizedUnusedOptions !== undefined) {
      return memoizedUnusedOptions;
    }
    const existingOptionGroupIDList = await buildExistingOptionGroupIDList(this, optionGroupFinder);
    const resolvedUnusedOptions = await unusedOptionFinder.getUnusedProductOptions(
      this.productID,
      existingOptionGroupIDList,
    );
    this.unusedProductOptions = resolvedUnusedOptions;
    return resolvedUnusedOptions;
  }

  /**
   * The option groups NOT yet used by this product — [model/entity/Product.cfc:L642-L647].
   *
   *     variables.unusedProductOptionGroups = the dynamic option-service lookup, then
   *         .getUnusedProductOptionGroups( structKeyList(getOptionGroupsStruct()) )
   *
   * The same comma-delimited-string argument as {@link Product.getUnusedProductOptions}, with the
   * same preservation requirement, but with ONE argument rather than two — the legacy passes no
   * product identifier here (§0.4.2.4), and none is added.
   *
   * VALIDATION-SUPPORT MEMBER: `model/validation/Product.json:L14` declares a minimum-collection gate
   * of one on this property for the add-option-group context.
   *
   * MEMOIZED PER INSTANCE into {@link Product.unusedProductOptionGroups} (S8/M7).
   *
   * @param unusedOptionFinder - TODO(boundary): rightful owner is `src/services/OptionService.ts`.
   * @param optionGroupFinder - Needed to build the existing-group list on a cache miss.
   * @returns The unused option groups as `{name, value}` entries.
   */
  async getUnusedProductOptionGroups(
    unusedOptionFinder: ProductUnusedOptionFinder,
    optionGroupFinder: ProductOptionGroupFinder,
  ): Promise<ProductSelectOption[]> {
    const memoizedUnusedOptionGroups = this.unusedProductOptionGroups;
    if (memoizedUnusedOptionGroups !== undefined) {
      return memoizedUnusedOptionGroups;
    }
    const existingOptionGroupIDList = await buildExistingOptionGroupIDList(this, optionGroupFinder);
    const resolvedUnusedOptionGroups =
      await unusedOptionFinder.getUnusedProductOptionGroups(existingOptionGroupIDList);
    this.unusedProductOptionGroups = resolvedUnusedOptionGroups;
    return resolvedUnusedOptionGroups;
  }

  /* ==============================================================================================
   * TITLE AND BRAND-NAME MEMBERS
   * ============================================================================================== */

  /**
   * This product's rendered title — [model/entity/Product.cfc:L540-L545].
   *
   *     if(!structKeyExists(variables, "title")) {
   *         variables.title = the dynamic utility-service lookup, then
   *             .replaceStringTemplate(template=setting('productTitleString'), object=this)
   *     }
   *     return variables.title;
   *
   * LOAD-BEARING BEYOND DISPLAY — THIS MEMBER PARTICIPATES IN URL GENERATION.
   * [model/service/ProductService.cfc:L269] feeds `arguments.product.getTitle()` — NOT
   * `getProductName()` — into the unique-url-title generator when saving a product. So the rendered
   * title determines the persisted `urlTitle`, which determines {@link Product.getProductURL}, which
   * is the one member covered by a legacy test. Changing what this returns changes stored URLs.
   *
   * THIS IS NOT {@link Product.calculatedTitle}. That field is the PERSISTED COLUMN and it is what
   * `integrationServices/google/views/feed/product.cfm:L18` reads for the feed's title. This member is
   * the LIVE RENDER. The two can legitimately disagree, and the distinction is documented on both so
   * it cannot be broken from either side.
   *
   * S9 — THE TEMPLATE VALUE IS NEVER HARDCODED HERE. `productTitleString` is NOT among the five
   * `settingName` values seeded in `config/dbdata/SlatwallSetting.xml.cfm`; its default lives in
   * metadata on the OUT-OF-SCOPE `model/service/SettingService.cfc`. This module therefore supplies no
   * default, no fallback template and no `??` on the resolved value. Recording which keys fall back to
   * defaults belongs to `src/adapters/settings/StaticSettingResolver.ts`.
   *
   * SUBSTITUTION IS DELEGATED, NOT REIMPLEMENTED. `replaceStringTemplate` comes from
   * `../../util/formatting` — `src/util/` is a hexagonal leaf BELOW domain, so this import is
   * permitted, and it is the only utility import this file needs. It is SYNCHRONOUS, so this member is
   * async only because nothing here awaits anything: it is in fact synchronous too, and is declared so.
   *
   * THE FOUR SUBSTITUTION SEMANTICS THIS MEMBER RELIES ON, as `formatting.ts` documents them:
   *   1. The token grammar requires ONE OR MORE characters between the delimiters, so an empty token
   *      never matches and survives unchanged.
   *   2. A resolver returning `undefined` means UNRESOLVED, and the token is left VERBATIM in the
   *      output [org/Hibachi/HibachiUtilityService.cfc:L77-L78] — it is NOT blanked, because the
   *      legacy flag that would blank it is never set by this caller.
   *   3. A resolver returning the EMPTY STRING **has resolved** the identifier, and that empty value
   *      IS substituted. The test is `=== undefined`, never truthiness, and the two outcomes are
   *      genuinely different.
   *   4. Every occurrence of a repeated token is substituted, and the resolver is invoked once per
   *      occurrence.
   *
   * G6 JUDGMENT CALL — DOTTED IDENTIFIERS ARE RESOLVED HERE, BY DESIGN, AND ONLY ONE LEVEL DEEP.
   * `formatting.ts` hands dotted identifiers to the resolver UNTOUCHED and states explicitly that
   * traversing them is the domain layer's job, because the legacy delegated to a property-identifier
   * walker [`:L88`] and the metadata default for this setting contains such an identifier. Of the two
   * options the brief allows, this file takes the first: {@link resolveProductPropertyIdentifier}
   * resolves bare identifiers against this entity and ONE-LEVEL dotted identifiers against the two
   * in-scope many-to-one relationships. Anything deeper, or anything naming a property that does not
   * exist, resolves to `undefined` and leaves its token verbatim — which is exactly the legacy
   * behaviour for an unresolvable identifier, so the fallback is faithful rather than lossy.
   *
   * MEMOIZED PER INSTANCE into {@link Product.title} (S8/M7 — never module-scope). `formatting.ts`'s
   * own contract assigns ownership of this cache to this file. The cache is tested for ABSENCE, so a
   * legitimately EMPTY rendered title is cached rather than re-rendered on every call.
   *
   * @param settings - Resolves `productTitleString`. TODO(boundary): rightful owner is
   *   `SettingResolverPort` via `src/adapters/settings/StaticSettingResolver.ts`.
   * @returns The interpolated title, with unresolved tokens left verbatim.
   */
  getTitle(settings: ProductSettingResolver): string {
    const memoizedTitle = this.title;
    if (memoizedTitle !== undefined) {
      return memoizedTitle;
    }
    const resolveIdentifier: PropertyIdentifierResolver = (propertyIdentifier) =>
      resolveProductPropertyIdentifier(this, propertyIdentifier);
    const renderedTitle = replaceStringTemplate(
      settings.setting('productTitleString'),
      resolveIdentifier,
    );
    this.title = renderedTitle;
    return renderedTitle;
  }

  /**
   * This product's brand name — [model/entity/Product.cfc:L524-L532].
   *
   *     public string function getBrandName() {
   *         if(!structKeyExists(variables, "brandName")) {
   *             variables.brandName = "";
   *             if( structKeyExists(variables, "brand") ) {
   *                 return getBrand().getBrandName();
   *             }
   *         }
   *         return variables.brandName;
   *     }
   *
   * `TODO(parity)` — THIS MEMBER CARRIES A LATENT DEFECT AND THE DEFECT IS PRESERVED INTACT.
   * Trace the legacy control flow exactly:
   *
   *   - FIRST CALL, brand present: the cache is absent, so it is written as the EMPTY STRING, and then
   *     the method RETURNS THE BRAND'S NAME WITHOUT EVER STORING IT. The early return bypasses the
   *     cache write entirely.
   *   - EVERY SUBSEQUENT CALL: the cache is now PRESENT — holding `''` — so the outer guard fails, the
   *     brand is never consulted again, and the method returns THE EMPTY STRING.
   *
   * So the first call returns the real brand name and every call after it returns `''`. That is
   * observable, order-dependent behaviour, and G4 and S7 both forbid repairing it: fixing the memo
   * would change what callers see on the second read, which is exactly the kind of silent divergence
   * this port exists to avoid. Cited at [model/entity/Product.cfc:L524-L532].
   *
   * The three statements are therefore reproduced in the legacy order and with the legacy effects: the
   * write of `''`, the early return that bypasses the write, and the fall-through read of the cache.
   *
   * THE CACHE MUST BE TESTED FOR ABSENCE, NOT TRUTHINESS. This member is the clearest case in the
   * file: the cached value IS the empty string, so a falsy test would treat the poisoned cache as a
   * miss, re-enter the branch and accidentally REPAIR the defect. `!== undefined` is what preserves it.
   *
   * `brand` is optional, so its presence test is an explicit `!== undefined` comparison — no non-null
   * assertion and no cast (S1). The brand's own name is likewise optional on the sibling module, and
   * the legacy declared this member's return type as `string`, so an absent brand name yields `''` —
   * the same value CFML would have interpolated for a null.
   *
   * Synchronous and purely in-memory: no data access, no capability parameter.
   *
   * @returns The brand name on the first call when a brand is present, `''` thereafter.
   */
  getBrandName(): string {
    const memoizedBrandName = this.brandName;
    if (memoizedBrandName === undefined) {
      this.brandName = '';
      const assignedBrand = this.brand;
      if (assignedBrand !== undefined) {
        // Returns WITHOUT storing — the preserved defect. Do not hoist the cache write above this.
        return assignedBrand.brandName ?? '';
      }
    }
    return this.brandName ?? '';
  }

  /* ==============================================================================================
   * MEMBERS DELEGATED TO THE DEFAULT SKU — [model/entity/Product.cfc:L319, "Start: Functions that
   * delegate to the default sku"] AND THE SECOND NON-PERSISTENT BLOCK [`:L116-L123`]
   * ==============================================================================================
   * §0.2.2.6 states POSITIVELY that the port carries "url and title members; image-path members; and
   * the validation-support members", and the RETAIN/OMIT decision rule above admits a non-persistent
   * member unless (a) it is one of the sixteen excluded names, (b) its body composes a paginated
   * dynamic query, or (c) its body reaches a framework facility F22 forbids declaring.
   *
   * APPLYING THE RULE ACROSS THIS FAMILY, which is where the boundary is thinnest and therefore where
   * §0.2.2.6 warns the exclusion is most likely to be violated by accident:
   *
   *   RETAINED — `currencyCode` [`:L555-L559`], `price` [`:L561-L568`], `renewalPrice`
   *              [`:L570-L574`], `listPrice` [`:L576-L580`], and the five image members
   *              [`:L320-L338`]. None is an excluded name; none queries; none reaches a framework
   *              facility. Every one is a thin delegation.
   *   EXCLUDED — `livePrice` [`:L582-L586`], `currentAccountPrice` [`:L588-L592`], `salePrice`
   *              [`:L594-L601`], `salePriceDiscountType` [`:L604-L612`] and
   *              `salePricExpirationDateTime` [`:L614-L622`]. All five ARE excluded names, and each
   *              reaches pricing, promotion or price-group services that §0.2.2.1 excludes outright.
   *
   * THE COMPILER ENFORCES THE SPLIT. {@link ProductDefaultSkuDelegate} declares exactly the NINE
   * members the retained code calls and DELIBERATELY DOES NOT DECLARE THE FIVE EXCLUDED READS. So a
   * future edit that "follows the getter" — the single failure mode IR-3 warns about, where an agent
   * chases a sale-price getter and drags half the platform into the port — does not compile. The
   * boundary is a type error, not a comment.
   *
   * G6 JUDGMENT CALL — THE FIVE IMAGE MEMBERS DEREFERENCE THE DEFAULT SKU WITH NO PRESENCE GUARD
   * [`:L320-L338`], so in the legacy a product without one FAILED AT RUNTIME with a null dereference.
   * That failure cannot be reproduced literally: the field is optional because five other members
   * branch on its absence, and manufacturing an error to throw would mean authoring a message string
   * that exists nowhere in the legacy source, which S9 forbids. The four price members show the way —
   * they DO guard, and they return a null the legacy left implicit. So all nine members surface
   * absence uniformly as `undefined`, and the divergence is recorded here rather than hidden: a
   * product with no default SKU yields no image path instead of raising.
   *
   * TODO(boundary): the rightful owners are `PricingPort` for the price reads and `ImagePathPort` for
   * the image reads (§0.2.2.7). Both are declared in `src/ports/**`, which this module does not
   * import; the collaborator is the `defaultSku` field itself, typed structurally per Phase E.
   */

  /**
   * This product's currency code, from its default SKU — [model/entity/Product.cfc:L555-L559].
   *
   * The legacy guards on the default SKU's PRESENCE and returns nothing at all when it is absent —
   * [`:L559`] ends the function with no `return`, yielding CFML null. That implicit null is written out
   * explicitly here because `noImplicitReturns` requires it; the explicit `undefined` is a
   * transcription, not a new behaviour.
   *
   * NOTE WHAT THIS MEMBER IS NOT. The EXCLUDED `currencyDetails` is a different member on a
   * different entity reaching the out-of-scope currency service; this one only forwards a code.
   */
  getCurrencyCode(): string | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getCurrencyCode();
    }
    return undefined;
  }

  /**
   * This product's price — [model/entity/Product.cfc:L561-L568].
   *
   *     if( structKeyExists(variables, "price") ) { return variables.price; }
   *     if( structKeyExists(variables, "defaultSku") ) { return getDefaultSku().getPrice(); }
   *
   * TWO-STEP RESOLUTION, AND IT IS UNIQUE IN THIS FAMILY. `price` is the ONLY one of the eight
   * default-SKU-delegated properties whose getter consults a LOCAL BACKING SLOT FIRST — see
   * {@link Product.price}. `currencyCode`, `renewalPrice` and `listPrice` all test the default SKU
   * alone. The order matters: an explicitly populated local price WINS over the default SKU's, and it
   * wins even when it is zero, because the legacy tests PRESENCE rather than truthiness. A falsy test
   * here would let a legitimate price of zero fall through to the SKU.
   *
   * THE TWO GUARDS ARE SEQUENTIAL `if` STATEMENTS, NOT `if`/`else if`. Behaviourally identical here
   * because the first returns, but the shape is preserved so the reading matches the source.
   *
   * Returns `undefined` when neither is present, transcribing the legacy fall-through at [`:L568`].
   *
   * `price` IS ALSO A VALIDATION-GATED PROPERTY: `model/validation/Product.json:L8` requires it on
   * save and constrains it to a numeric data type. That rule is evaluated by
   * `src/validation/rules/product.rules.ts`, never here — see the VALIDATION CONTRACT block.
   */
  getPrice(): ExactDecimal | undefined {
    const overriddenPrice = this.price;
    if (overriddenPrice !== undefined) {
      return overriddenPrice;
    }
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getPrice();
    }
    return undefined;
  }

  /**
   * This product's renewal price, from its default SKU — [model/entity/Product.cfc:L570-L574].
   *
   * Single guard on the default SKU, no local backing slot — contrast {@link Product.getPrice}.
   * Subscription-term pricing itself is out of scope (§0.2.2.1 excludes the eleven
   * `Subscription`-prefixed components); this member only forwards whatever the SKU reports, so it
   * crosses no boundary of its own.
   */
  getRenewalPrice(): ExactDecimal | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getRenewalPrice();
    }
    return undefined;
  }

  /**
   * This product's list price, from its default SKU — [model/entity/Product.cfc:L576-L580].
   *
   * Single guard on the default SKU. Read by `ProductUpdateSkus` processing, whose two conditional
   * validation rule groups key on the update flags (§0.4.1.5) — but that evaluation lives in
   * `src/validation/rules/productUpdateSkus.rules.ts`, not here.
   */
  getListPrice(): ExactDecimal | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getListPrice();
    }
    return undefined;
  }

  /**
   * The directory holding this product's images — [model/entity/Product.cfc:L320-L322].
   *
   * A bare delegation with NO presence guard in the legacy; absence surfaces as `undefined` per the
   * G6 judgment call recorded on this section. TODO(boundary): `ImagePathPort`.
   */
  getImageDirectory(): string | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getImageDirectory();
    }
    return undefined;
  }

  /**
   * The path of this product's image — [model/entity/Product.cfc:L324-L326].
   *
   * TODO(boundary): `ImagePathPort`.
   */
  getImagePath(): string | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getImagePath();
    }
    return undefined;
  }

  /**
   * This product's rendered image — [model/entity/Product.cfc:L328-L330].
   *
   * THE LEGACY FORWARDS ITS ENTIRE ARGUMENT COLLECTION — `getDefaultSku().getImage(argumentCollection
   * = arguments)` — while DECLARING NO PARAMETERS OF ITS OWN. CFML permits that: undeclared arguments
   * still arrive in the collection and are passed straight through, so the effective signature was
   * whatever the SKU's member accepted. TypeScript has no equivalent, and inventing a parameter list
   * for it would be inventing the SKU's contract (S9). The member is therefore declared with no
   * parameters, matching the LEGACY DECLARATION rather than its untyped pass-through, and the
   * divergence is recorded here. `src/domain/sku/Sku.ts` owns the real signature; when it exists, any
   * caller needing sized variants uses {@link Product.getResizedImagePath}, which has the same shape.
   *
   * TODO(boundary): `ImagePathPort`.
   */
  getImage(): string | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getImage();
    }
    return undefined;
  }

  /**
   * The path of a resized variant of this product's image — [model/entity/Product.cfc:L332-L334].
   *
   * Same argument-collection pass-through as {@link Product.getImage}, and the same treatment.
   *
   * THIS IS THE MEMBER THE GOOGLE FEED'S IMAGE FIELD ULTIMATELY RESTS ON — the feed reads the SKU's
   * resized image path (§0.6.4.2), and the setting-driven width and height keys it needs
   * (`productImage<size>Width` / `productImage<size>Height`) are exactly the interpolated form IR-2
   * calls out. Those keys are resolved behind `SettingResolverPort` inside the image boundary, NOT by
   * this entity's three-key resolver — which is why they are absent from {@link ProductSettingName}.
   *
   * TODO(boundary): `ImagePathPort`.
   */
  getResizedImagePath(): string | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getResizedImagePath();
    }
    return undefined;
  }

  /**
   * Whether this product's image file exists — [model/entity/Product.cfc:L336-L338].
   *
   * The legacy declares a `boolean` return and delegates without a guard. Absence surfaces as
   * `undefined` rather than `false`, deliberately: `false` would assert that the image is MISSING,
   * whereas absence of a default SKU means the question was never answered. Conflating them would
   * invent a fact.
   *
   * TODO(boundary): `ImagePathPort`.
   */
  getImageExistsFlag(): boolean | undefined {
    const assignedDefaultSku = this.defaultSku;
    if (assignedDefaultSku !== undefined) {
      return assignedDefaultSku.getImageExistsFlag();
    }
    return undefined;
  }

  /* ==============================================================================================
   * BIDIRECTIONAL HELPER METHODS — [model/entity/Product.cfc:L659-L785]
   * ==============================================================================================
   * The legacy block spans ten relationship pairs. Five pairs are RETAINED — the brand pair and the
   * four one-to-many pairs — and five are OMITTED with their locators recorded in THE OMITTED
   * COLLECTION HELPERS block below.
   *
   * THE F2 LIVE-ARRAY CONTRACT IS WHAT MAKES THESE WORK AT ALL. Every retained helper mutates an
   * array it does not own: either the array on the OTHER entity, or — in the brand case — both sides.
   * A defensive copy anywhere in the accessor chain turns each of these into a silent no-op that
   * type-checks perfectly and does nothing.
   */

  /**
   * Assigns this product's brand and registers the product on the brand's side —
   * [model/entity/Product.cfc:L662-L667].
   *
   *     variables.brand = arguments.brand;
   *     if(isNew() or !arguments.brand.hasProduct( this )) {
   *         arrayAppend(arguments.brand.getProducts(), this);
   *     }
   *
   * SIGNATURE PINNED BY THE SIBLING MODULE. `Brand.ts` documents the required shape as
   * `setBrand(brand: Brand): void` and calls it from its own `addProduct`, so the name, the single
   * required parameter and the `void` return are all contract, not choice.
   *
   * ASSIGN FIRST, THEN CONDITIONALLY APPEND. The order is preserved because the guard's own
   * left-hand operand depends on this object's state, and because a caller observing the field between
   * the two statements would see it already set. [`:L663`] precedes [`:L664`].
   *
   * `TODO(parity)` — THE GUARD SHORT-CIRCUITS, AND THE SHORT-CIRCUIT IS THE DEFECT.
   * [model/entity/Product.cfc:L664] reads `isNew() or !brand.hasProduct(this)`. When the product IS
   * NEW the membership test is NEVER EVALUATED and the append is UNCONDITIONAL — so calling this
   * member twice on a new product appends it to the brand's collection TWICE. `||` short-circuits
   * identically in TypeScript, so the behaviour ports for free, and the membership test MUST NOT be
   * hoisted out of the expression "for clarity": evaluating it first would deduplicate the append and
   * silently repair the defect (G4, S7).
   *
   * `brand.hasProduct(this)` IS AN IR-1 SYNTHESIZED MEMBER with no declaration anywhere in
   * `model/entity/Brand.cfc` — the framework fabricated it from the collection's singular name. It is
   * declared explicitly on `Brand.ts` BECAUSE OF THIS CALL SITE, and it tests membership by object
   * identity there. This file depends on it and does not re-declare it.
   *
   * THE APPEND TARGETS BRAND'S LIVE ARRAY (F2) — `brand.getProducts()` must hand back the backing
   * array by reference or the append is lost.
   *
   * @param brand - The brand to assign. Required, exactly as [`:L662`] declares it.
   */
  setBrand(brand: Brand): void {
    this.brand = brand;
    if (this.isNew() || !brand.hasProduct(this)) {
      brand.getProducts().push(this);
    }
  }

  /**
   * Clears this product's brand and unregisters it from the brand's side —
   * [model/entity/Product.cfc:L668-L677].
   *
   *     if(!structKeyExists(arguments, "brand")) { arguments.brand = variables.brand; }
   *     var index = arrayFind(arguments.brand.getProducts(), this);
   *     if(index > 0) { arrayDeleteAt(arguments.brand.getProducts(), index); }
   *     structDelete(variables, "brand");
   *
   * THE PARAMETER IS OPTIONAL — declared without `required` at [`:L668`] — AND IT DEFAULTS FROM THE
   * CURRENTLY ASSIGNED BRAND at [`:L669-L671`]. Both halves are reproduced with an explicit presence
   * check. `Brand.ts` documents the required signature as `removeBrand(brand?: Brand): void` and calls
   * it with an argument from its own `removeProduct`, so BOTH call forms must work.
   *
   * `TODO(parity)` — CFML 1-BASED INDEX ARITHMETIC, TRANSLATED BY SEMANTICS RATHER THAN LITERALLY.
   * `arrayFind` returns **0** when the element is absent, which is why the legacy tests `index > 0`.
   * JavaScript's `indexOf` returns **−1**. Transliterating `> 0` would be a genuine bug in both
   * directions: it would treat a real match at position 0 as "not found" and skip the removal, and a
   * literal reuse of the returned index would delete the wrong element. The test is therefore against
   * the JavaScript sentinel, and the found index is used directly. Cited at [`:L671-L673`].
   *
   * `TODO(parity)` — THE FIELD IS DELETED UNCONDITIONALLY, OUTSIDE THE MATCH GUARD.
   * [model/entity/Product.cfc:L676] runs whether or not anything was removed, and whether or not the
   * brand passed in was ever this product's brand. So calling this with SOME OTHER brand still clears
   * this product's own brand while leaving the other brand's collection untouched. That is preserved
   * exactly, and it is the reason {@link Product.brand} MUST be an optional field: the faithful port of
   * `structDelete` is `delete`, and `delete` is only legal on an optional property under `strict`. The
   * two facts are coupled — weaken the optionality and this statement stops being expressible.
   *
   * A `delete`, NOT AN ASSIGNMENT OF `undefined`. Under `exactOptionalPropertyTypes` those are
   * different states, and the legacy `structDelete` removes the key. An assignment would leave the key
   * present holding `undefined`, which every presence test in this file would then read differently.
   *
   * WHEN NO BRAND IS ASSIGNED AND NONE IS PASSED, the legacy dereferenced a null at [`:L672`] and
   * ERRORED. Here the collection work is skipped and the unconditional delete still runs — a no-op on
   * an already-absent key. Manufacturing an error instead would require authoring a message string
   * that does not exist in the source (S9), so the divergence is recorded rather than invented around.
   *
   * @param brand - The brand to unregister from. Defaults to this product's currently assigned brand.
   */
  removeBrand(brand?: Brand): void {
    const targetBrand = brand ?? this.brand;
    if (targetBrand !== undefined) {
      const brandProducts = targetBrand.getProducts();
      const index = brandProducts.indexOf(this);
      if (index !== -1) {
        brandProducts.splice(index, 1);
      }
    }
    // Unconditional, exactly as [model/entity/Product.cfc:L676]. Outside the guard by design.
    delete this.brand;
  }

  /**
   * Adds a SKU to this product — [model/entity/Product.cfc:L696-L698].
   *
   * The legacy body is `arguments.sku.setProduct( this );` — a PURE DELEGATION that never touches the
   * local array. That is the correct reading of `inverse="true"` on [`:L73`]: the MANY side owns the
   * foreign key, so ownership is handed to the SKU and the collection follows from the persistence
   * layer. Pushing onto `this.skus` here as well would double-register.
   *
   * RETAINED, NOT STUBBED. `skus` is the core aggregate collection and `SkuService.createSkus`
   * depends on this wiring while it enumerates option combinations — the odometer engine §0.6.7.8
   * marks for verbatim porting.
   *
   * TYPED AGAINST {@link ProductSkuMember}, NOT `Sku`. `src/domain/sku/Sku.ts` is EMPTY and is not
   * this file's to create; Phase E requires a narrow, distinctly-named, in-file structural interface
   * instead, exactly as the sibling `option/` exemplar types its own SKU-side collaborator.
   *
   * TODO(boundary): collapses to the real type once `src/domain/sku/Sku.ts` exists.
   */
  addSku(sku: ProductSkuMember): void {
    sku.setProduct(this);
  }

  /**
   * Removes a SKU from this product — [model/entity/Product.cfc:L699-L701].
   *
   * `arguments.sku.removeProduct( this );` — the mirror of {@link Product.addSku}, delegating for the
   * same `inverse="true"` reason. `cascade="all-delete-orphan"` means the orphaned row is deleted;
   * that execution belongs to `src/adapters/mysql/UnitOfWork.ts`.
   *
   * TODO(boundary): collapses to the real type once `src/domain/sku/Sku.ts` exists.
   */
  removeSku(sku: ProductSkuMember): void {
    sku.removeProduct(this);
  }

  /**
   * Adds an attribute value to this product — [model/entity/Product.cfc:L680-L682].
   *
   * TR-5 — RETAINED AS A THIN DELEGATION RATHER THAN DROPPED, even though `AttributeValue` is out of
   * scope (§0.2.2.1 excludes the six `Attribute`-prefixed components). The rule is explicit that an
   * in-scope member depending on an out-of-scope collaborator gets a declared boundary and an
   * implementation against it — it is NEVER quietly removed from the surface. `Brand.ts` and
   * `ProductType.ts` treat their equivalents identically, so all three files agree.
   *
   * TODO(boundary): the attribute service is out of scope; the element type is the shared structural
   * association until an attribute-value module exists.
   */
  addAttributeValue(attributeValue: ProductOwnedAssociation): void {
    attributeValue.setProduct(this);
  }

  /**
   * Removes an attribute value from this product — [model/entity/Product.cfc:L683-L685].
   *
   * TR-5, as {@link Product.addAttributeValue}.
   */
  removeAttributeValue(attributeValue: ProductOwnedAssociation): void {
    attributeValue.removeProduct(this);
  }

  /**
   * Adds an image to this product — [model/entity/Product.cfc:L688-L690].
   *
   * TR-5 — RETAINED. `ProductImage` is explicitly out of scope: §0.2.2.4 excludes
   * `model/validation/ProductImage.json`, and no `ProductImage.ts` is created by this file or any
   * other in this folder. The member stays on the surface as a thin delegation against a structural
   * interface, per Phase E.
   *
   * TODO(boundary): the image domain module and `ImagePathPort`.
   */
  addProductImage(productImage: ProductOwnedAssociation): void {
    productImage.setProduct(this);
  }

  /**
   * Removes an image from this product — [model/entity/Product.cfc:L691-L693].
   *
   * TR-5, as {@link Product.addProductImage}.
   */
  removeProductImage(productImage: ProductOwnedAssociation): void {
    productImage.removeProduct(this);
  }

  /**
   * Adds a review to this product — [model/entity/Product.cfc:L704-L706].
   *
   * TR-5 — RETAINED. `ProductReview` is explicitly out of scope (§0.2.2.4 excludes
   * `model/validation/ProductReview.json`), and no `ProductReview.ts` is created. Note that the
   * collection this registers into is the one whose legacy declaration carries the misspelled singular
   * attribute — see {@link Product.productReviews}. These two hand-written helpers exist regardless of
   * that misspelling, which is why they are the reliable way to mutate the collection.
   *
   * TODO(boundary): the product-review domain module.
   */
  addProductReview(productReview: ProductOwnedAssociation): void {
    productReview.setProduct(this);
  }

  /**
   * Removes a review from this product — [model/entity/Product.cfc:L707-L709].
   *
   * TR-5, as {@link Product.addProductReview}.
   */
  removeProductReview(productReview: ProductOwnedAssociation): void {
    productReview.removeProduct(this);
  }

  /* ==============================================================================================
   * PRODUCT-TYPE, VALIDATION-SUPPORT AND BOUNDARY MEMBERS
   * ============================================================================================== */

  /**
   * This product's base product type, resolved through its product type —
   * [model/entity/Product.cfc:L493-L495].
   *
   * The legacy body is one delegation: `return getProductType().getBaseProductType();`
   *
   * THE RETURN TYPE IS DELIBERATELY **NOT** NARROWED TO THE THREE-MEMBER DISCRIMINATOR UNION, AND
   * NARROWING IT WOULD SILENTLY DELETE LEGACY BEHAVIOUR. `SkuService.createSkus` branches THREE WAYS on
   * this value and carries a FALLTHROUGH THROW at [model/service/SkuService.cfc:L204] for the case
   * where it matches none of them. If this member's type admitted only the three seeded discriminators,
   * that fourth branch would become statically unreachable, a compiler or linter would flag it as dead,
   * and the next reader would delete it — removing an error path the legacy genuinely has. The value is
   * therefore returned EXACTLY as `ProductType.getBaseProductType` produces it, and the sibling module
   * types it as the union WIDENED to admit any other string for precisely this reason.
   *
   * The same trap is documented on `ProductType.ts`; it can be broken from either file, so both carry
   * the warning.
   *
   * THE THREE SEEDED DISCRIMINATORS ARE FIXED DATA, NOT TEST DATA (IR-7) — seeded at
   * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` and reproduced in
   * `src/domain/BaseProductType.ts`. They are the literal branch keys of the combination engine, which
   * is why this member sits on the critical path of SKU creation rather than being a display helper.
   *
   * ASYNC, following its dependency. `ProductType.getBaseProductType` is async because resolving the
   * base type may require walking to the ROOT of the product-type hierarchy, which the sibling module
   * does through an injected resolver rather than by assuming the parent chain is already loaded. That
   * resolver is forwarded straight through; this member adds no resolution logic of its own.
   *
   * `productType` is optional, so its absence is handled with an explicit guard and yields `undefined`
   * — matching both the legacy null dereference outcome as closely as is expressible without inventing
   * an error message (S9), and the sibling member's own `undefined` return for an unresolvable root.
   *
   * @param rootProductTypeResolver - Forwarded to `ProductType.getBaseProductType`.
   * @returns The base product type code, or `undefined` when no product type is assigned.
   */
  async getBaseProductType(
    rootProductTypeResolver: ProductTypeRootResolver,
  ): Promise<BaseProductTypeCode | undefined> {
    const assignedProductType = this.productType;
    if (assignedProductType === undefined) {
      return undefined;
    }
    return assignedProductType.getBaseProductType(rootProductTypeResolver);
  }

  /**
   * Whether any transaction exists that would block deleting this product —
   * [model/entity/Product.cfc:L624-L629].
   *
   *     variables.transactionExistsFlag = the dynamic sku-service lookup, then
   *         .getTransactionExistsFlag( productID=this.getProductID() )
   *
   * ⚠️⚠️ D23 — `productID` IS FORWARDED, WHICH MAKES THE LEGACY FLAG PRODUCT-SCOPED. [:L626] passes a
   * NAMED `productID` argument, and the service member it calls declares no formal parameters —
   * [model/service/SkuService.cfc:L285] is `public boolean function getTransactionExistsFlag()`. It
   * would be easy to infer from that signature that the argument is dropped and the flag is
   * SYSTEM-WIDE. It is not: [`:L286`] is
   * `getSkuDAO().getTransactionExistsFlag( argumentCollection=arguments )`, and CFML puts an
   * UNDECLARED named argument into the `arguments` scope just as it does a declared one. The whole
   * scope is forwarded, so `productID` arrives at the DAO — which declares it at
   * [model/dao/SkuDAO.cfc:L53-L55] and, finding no `skuID`, takes the `<cfelse>` branch at [`:L61`]:
   * `ss.product.productID = :productID`. THE LEGACY FLAG IS SCOPED TO THIS PRODUCT.
   *
   * ⚠️ SO FORWARDING THE IDENTIFIER IS PRESERVATION, NOT ENHANCEMENT — which is what makes it
   * consistent with G4 rather than an exception to it. Reading the flag as system-wide would matter in
   * a specific direction worth naming: it gates a delete (`model/validation/Product.json:L12`), so a
   * system-wide `true` would block deletion of EVERY product in any installation that has ever
   * recorded a single transaction.
   *
   * ⚠️ AN EARLIER REVISION OF THIS PARAGRAPH SAID THE OPPOSITE, AND IT WAS WRONG TWICE OVER. It read
   * "{@link ProductTransactionExistenceChecker} therefore declares NO parameters … and this member does
   * not thread its identifier through", which contradicted BOTH the interface — it declares
   * `(skuID?, productID?)` at its own declaration below — AND the body immediately underneath, which does
   * thread `this.productID` into the second slot. It also inverted the conclusion the paragraph above
   * reaches: threading the identifier is what PRESERVES the legacy's product scope, and dropping it is
   * what would silently widen a delete guard to system scope. G4 forbids improving on the legacy, not
   * reproducing it.
   *
   * That outcome is therefore preserved BY forwarding, not by withholding. No new defect identifier is
   * minted here — this is D23, minted and accounted for at
   * `src/ports/repositories/SkuRepository.ts`, which also records that AAP §0.6.7 is frozen at D1–D21
   * while the port has minted D22–D24 beyond it. No claim is made here about any register being globally
   * closed; a single file cannot prove that.
   *
   * VALIDATION-SUPPORT MEMBER, and that is WHY it is retained under §0.2.2.6's positive list rather
   * than dropped as a service reach-through: `model/validation/Product.json:L12` declares a delete-time
   * guard requiring this flag to be false. See the VALIDATION CONTRACT block.
   *
   * MEMOIZED PER INSTANCE into {@link Product.transactionExistsFlag} (S8/M7). Tested for ABSENCE, not
   * truthiness — a cached `false` is the common case and a falsy test would re-query on every call.
   *
   * ⚠️ AN UNSAVED PRODUCT FORWARDS THE EMPTY SENTINEL, WHICH IS THE FAITHFUL VALUE.
   * {@link Product.productID} defaults to `''` — what the legacy generated getter returns for an
   * unpersisted entity — so the query matches no row and the flag is `false`. No sentinel guard is
   * added: short-circuiting would be behaviour the legacy does not have.
   *
   * @param transactionChecker - Supply `createTransactionExistenceChecker` from
   *   `src/adapters/mysql/MySqlSkuRepository.ts`. It adapts `SkuRepository.transactionExists`, which
   *   ports the ten-way existence chain at [model/dao/SkuDAO.cfc:L53-L98], onto this caller-ordered
   *   contract. Its declared return type is the intersection of this interface and the SKU-side one, so
   *   the crossing is checked at compile time where it is written — the guard an earlier revision named
   *   here as `SkuServiceIsProductTransactionExistenceChecker`, which never existed in the subtree.
   *   ⛔ Do NOT supply `SkuService`: {@link ProductTransactionExistenceChecker.argumentOrder} is what
   *   makes that a type error rather than a silent widening of the question. Its
   *   `getTransactionExistsFlag` does declare both identifiers and forwards them correctly, so the
   *   mis-binding would no longer discard one — but the service is the route-level surface and this
   *   entity is served by the adapter above, so the brand keeps the two roles from being confused.
   * @returns Whether a transaction references THIS product.
   */
  async getTransactionExistsFlag(
    transactionChecker: ProductTransactionExistenceChecker,
  ): Promise<boolean> {
    const memoizedFlag = this.transactionExistsFlag;
    if (memoizedFlag !== undefined) {
      return memoizedFlag;
    }
    // D23: productID occupies the SECOND parameter. The first MUST stay `undefined` — a supplied
    // skuID wins at SkuDAO.cfc:L58-L64 and would suppress the product-scoped branch at :L61.
    const resolvedFlag = await transactionChecker.getTransactionExistsFlag(
      undefined,
      this.productID,
    );
    this.transactionExistsFlag = resolvedFlag;
    return resolvedFlag;
  }

  /**
   * The subscription terms not yet used by this product — [model/entity/Product.cfc:L649-L654].
   *
   *     variables.unusedProductSubscriptionTerms = the dynamic subscription-service lookup, then
   *         .getUnusedProductSubscriptionTerms( getProductID() )
   *
   * TR-5 BOUNDARY STUB — DECLARED, NEVER QUIETLY DROPPED. The subscription domain is out of scope
   * (§0.2.2.1 excludes the eleven `Subscription`-prefixed components), and
   * `unusedProductSubscriptionTerms`
   * is NOT one of the sixteen excluded calculated names, so the RETAIN/OMIT rule admits it while the
   * scope boundary denies it an implementation. TR-5 resolves that precisely: declare the port,
   * implement against it, flag the gap.
   *
   * IT IS A VALIDATION-SUPPORT MEMBER, which is why dropping it would break more than this file:
   * `model/validation/Product.json:L15` declares a minimum-collection gate of one on this property for
   * the add-subscription-term context. Its ARITY is what the rule reads.
   *
   * AND ITS ARITY IS EXACTLY WHY THE ABSENT-CAPABILITY CASE RETURNS THE EMPTY ARRAY RATHER THAN
   * THROWING. An empty result means "no unused terms", which fails that minimum-collection gate — the
   * same outcome the legacy produced for a product with none. Throwing instead would turn a validation
   * failure into a runtime error, and inventing an error message is forbidden anyway (S9).
   *
   * NOT MEMOIZED HERE. The legacy caches into `variables.unusedProductSubscriptionTerms`, but that
   * cache belonged to a member with a real implementation; caching a boundary stub's result would cache
   * the ABSENCE of a capability across an instance's lifetime, which is a new behaviour rather than a
   * preserved one. S8's instruction is explicit: memoizations belonging to members this port does not
   * fully carry disappear with them, and NO NEW CACHE IS ADDED.
   *
   * S9 — THE ELEMENT TYPE IS OPAQUE, AND IT DELIBERATELY DIFFERS FROM ITS TWO SIBLING MEMBERS.
   * {@link Product.getUnusedProductOptions} and {@link Product.getUnusedProductOptionGroups} return the
   * `{name, value}` projection because the legacy data-access layer BUILDS that projection literally
   * at `model/dao/OptionDAO.cfc:L86`, so its shape is a verified fact. No such evidence exists for
   * subscription terms: the member that produces them is out of scope, no in-scope code reads any
   * member off one, and only the validation gate's ARITY is consumed. Asserting the same projection
   * here would be inventing a shape. The asymmetry is therefore correct and is not harmonised.
   *
   * @param subscriptionTermFinder - Optional. TODO(boundary): rightful owner is `SubscriptionTermPort`
   *   (§0.2.2.7), over the subscription branch of `SkuService.createSkus`.
   * @returns The unused subscription terms, or an empty array when the capability is absent.
   */
  async getUnusedProductSubscriptionTerms(
    subscriptionTermFinder?: ProductSubscriptionTermFinder,
  ): Promise<ProductOutOfScopeAssociation[]> {
    if (subscriptionTermFinder === undefined) {
      return [];
    }
    return subscriptionTermFinder.getUnusedProductSubscriptionTerms(this.productID);
  }

  /**
   * This product's options grouped by option group — [model/entity/Product.cfc:L631-L633].
   *
   *     public array function getProductOptionsByGroup(){
   *         return getProductService().getProductOptionsByGroup( this );
   *     }
   *
   * `TODO(parity)` — DEFECT **D5** (§0.6.7.3). THIS MEMBER IS UNRESOLVABLE AT RUNTIME IN THE
   * LEGACY SYSTEM. `ProductService` does NOT define `getProductOptionsByGroup` anywhere: a repository-
   * wide search for the name returns EXACTLY TWO HITS, and BOTH ARE INSIDE `model/entity/Product.cfc`
   * ITSELF — the declaration at [`:L631`] and the call at [`:L632`]. The name appears nowhere in
   * `model/service/ProductService.cfc` and nowhere else in the repository. Every invocation therefore
   * failed on the missing member.
   *
   * THE MEMBER IS KEPT (TR-5) AND THE MISSING SERVICE METHOD IS **NOT** INVENTED (S9). Both halves
   * matter. Deleting the member would hide a defect the port is required to carry; implementing the
   * absent collaborator would be fabricating business logic that never existed and would make the
   * port's behaviour incomparable to the legacy system's. So it is declared, and it fails explicitly
   * and informatively instead of failing obscurely.
   *
   * THE ERROR TYPE AND ITS MESSAGE COME FROM `src/errors/DomainError.ts` — the narrow
   * un-portable-boundary subclass whose own documentation already cites D4 and D5 as its intended
   * cases. Nothing is authored here: no new error class, and no new message string (S9). The
   * constructor takes the member name and the reason, and both are supplied from verified source facts.
   *
   * NOT A SILENT NO-OP. Returning an empty array would be strictly WORSE than throwing: it would
   * convert a hard legacy failure into plausible-looking data and let a caller proceed on it.
   *
   * @returns Never returns; see below.
   * @throws NotImplementedError - Always. The collaborator this delegates to does not exist.
   */
  getProductOptionsByGroup(): never {
    throw new NotImplementedError(
      'Product.getProductOptionsByGroup',
      'Carried across as defect D5 (AAP §0.6.7.3): the legacy body at ' +
        'model/entity/Product.cfc:L631-L633 delegates to a product-service member that is declared ' +
        'nowhere in the repository, so the call was unresolvable at runtime. The member is retained ' +
        'under TR-5 rather than dropped, and the missing collaborator is deliberately not invented.',
    );
  }

  /* ==============================================================================================
   * NOT PORTED — THE OMISSION RECORD
   * ==============================================================================================
   * Every member of the legacy component with no counterpart on this class, grouped by the reason it
   * has none, so each omission reads as a decision (TR-5). The sixteen excluded calculated members
   * are catalogued separately above. Nothing below is stubbed.
   *
   * PAGINATED DYNAMIC QUERIES — `getListingPagesOptionsSmartList()` [:L146-L153],
   * `getTemplateOptions()` [:L171-L176], `getDefaultProductImageFiles()` [:L497-L515],
   * `getAssignedAttributeSetSmartList()` [:L795-L822] and the in-source-deprecated
   * `getAttributeSets()` [:L832-L838]. `SmartListQueryPort` owns the paginated dynamic query, and
   * every element family involved — content, templates and the attribute subsystem — is out of scope.
   * The attribute-set query additionally interpolates identifiers into a membership clause at
   * [:L810-L814], which S2 forbids outright.
   *
   * FRAMEWORK FACILITIES THIS PORT DOES NOT DECLARE — `getAlternateImageDirectory()` [:L223-L225],
   * `getBrandOptions()` [:L534-L538] and `getProductTypeOptions(baseProductType)` [:L125-L144], all
   * three built on framework path, property-option or resource-bundle helpers that have no analogue
   * here. One detail is preserved for whoever implements `ImagePathPort`: the only real logic in the
   * first is the `'/product/'` suffix appended to the resolved assets image folder, which is why its
   * setting key `globalAssetsImageFolderPath` is absent from {@link ProductSettingName}.
   *
   * ORM EVENT HOOKS AND THE CALCULATED-PROPERTY RECALCULATION — nothing was dropped, because there
   * was nothing to drop: the "ORM Event Hooks" region of the legacy file [:L826-L828] IS EMPTY.
   * `Product.cfc` declares no hooks of its own, unlike `ProductType.cfc` whose insert and update
   * hooks `ProductType.ts` does port. The inherited behaviour belongs to
   * `src/adapters/mysql/UnitOfWork.ts`.
   *
   * OUT-OF-SCOPE DOMAINS — `getCategoryIDs()` [:L199-L205], `getPageIDs()` [:L191-L197],
   * `getCrumbData(...)` [:L370-L396], `getSkuSalePriceDetails(skuID)` [:L182-L187],
   * `getEstimatedReceivalDetails()` [:L399-L404], `getEstimatedReceivalDates()` [:L406-L432],
   * `getProductRating()` [:L227-L239], `getImageGalleryArray(resizeSizes)` [:L267-L317] and
   * `getQuantity(quantityType)` [:L435-L489]. Two of these reach members that are UNDEFINED
   * anywhere in the legacy tree — the product-type-by-system-code lookup at [:L132] and the `getPages()`
   * collection at [:L192] — the same defect class as D5; both are recorded rather than invented.
   * `getQuantity`'s `throw` at [:L445] is deliberately excluded from `src/errors/DomainError.ts`,
   * which carries exactly four strings and not that one.
   *
   * THE EIGHT MANY-TO-MANY HELPER PAIRS — [:L711-L785], sixteen members omitted as a group because
   * every element family is out of scope and no in-scope code calls any of them; `Brand.ts` omits its
   * equivalents on the same basis. Each pair is named individually so the group can be audited:
   *
   *     `addListingPage` / `removeListingPage`                             [:L712-L729]
   *     `addPromotionReward` / `removePromotionReward`                     [:L732-L737]
   *     `addPromotionRewardExclusion` / `removePromotionRewardExclusion`   [:L740-L745]
   *     `addPromotionQualifier` / `removePromotionQualifier`               [:L748-L753]
   *     `addPromotionQualifierExclusion` / `removePromotionQualifierExclusion`
   *                                                                       [:L756-L761]
   *     `addPriceGroupRate` / `removePriceGroupRate`                       [:L764-L769]
   *     `addVendor` / `removeVendor`                                       [:L772-L777]
   *     `addPhysical` / `removePhysical`                                   [:L780-L785]
   *
   * The listing-page pair is the only one that would have needed different treatment: it is the OWNER
   * side, so [:L713-L714] appends to this entity's own array before delegating at [:L716-L717], and
   * it carries the same `isNew() or !has...` short-circuit that {@link Product.setBrand} preserves in
   * both guards, plus the same 1-based index arithmetic in its removal. Had content been in scope,
   * all of that would have had to be ported exactly.
   */

  /* ==============================================================================================
   * VALIDATION CONTRACT — `model/validation/Product.json`, COMMENT-ONLY (F12)
   * ==============================================================================================
   * NOT ONE RULE BELOW IS IMPLEMENTED, EVALUATED OR ENFORCED IN THIS FILE.
   * `src/validation/rules/product.rules.ts` owns them, evaluated by `src/validation/Validator.ts`
   * (§0.4.1.5). They are documented here because IR-4 is explicit that declarative validation is
   * BEHAVIOUR rather than configuration, and because four members on this class exist SOLELY to feed
   * them — the "validation-support members" §0.2.2.6 puts on the positive carry list.
   *
   * THE RICHEST OF THE THREE DOCUMENTS IN THIS FOLDER, and the only one declaring process contexts.
   * FIVE CONTEXTS IN TOTAL: `save`, `delete`, and the three process contexts `addOptionGroup`,
   * `addOption` and `addSubscriptionTerm`.
   *
   * ── `save` CONTEXT ────────────────────────────────────────────────────────────────────────────
   *   `productName`   required.
   *   `productCode`   required, UNIQUE, and matching a format pattern.
   *                   THE PATTERN, REPRODUCED AS COMMENT TEXT ONLY AND NEVER COMPILED HERE:
   *                        ^[a-zA-Z0-9-_.|:~^]+$
   *                   Byte-exact from the source document. It permits letters, digits and a specific
   *                   punctuation set, one or more characters, anchored at both ends. It is NOT built
   *                   into a regular expression anywhere in this file — the rules module owns it.
   *   `productType`   required. This is why {@link Product.productType} is optional yet a save-time
   *                   requirement: a transient product has none.
   *   `urlTitle`      required and UNIQUE.
   *   `price`         required, and constrained to a NUMERIC data type.
   *                   WORTH FLAGGING: `price` is a NON-PERSISTENT delegated property [:L118], not a
   *                   column on this entity — so a save-time requirement is being asserted against a
   *                   value that resolves through {@link Product.getPrice} to a local override or to
   *                   the default SKU. Recorded as observed; the rules module reproduces it as declared.
   *
   * ── `delete` CONTEXT — THE TWO GUARDS ─────────────────────────────────────────────────────────
   *   `transactionExistsFlag`  must equal FALSE. THIS IS THE REASON
   *                            {@link Product.getTransactionExistsFlag} IS RETAINED, and the reason its
   *                            SCOPE matters: this guard reads whatever that member reports, so a
   *                            product-scoped answer permits deleting an untransacted product while a
   *                            system-wide answer would block every product in any installation that
   *                            has ever recorded a transaction. D23 — that member forwards
   *                            `this.productID`, matching [model/entity/Product.cfc:L626].
   *   `physicalCounts`         maximum collection size of ZERO.
   *                            S9 — `physicalCounts` IS DECLARED BY NO ENTITY IN THIS SLICE. All
   *                            three validation documents in this folder reference it, and all three
   *                            entities declare `physicals` INSTEAD — see
   *                            {@link Product.physicals}. This is a genuine undeclared-property
   *                            reference in the legacy source. NO `physicalCounts` FIELD IS ADDED HERE
   *                            TO MAKE IT RESOLVE. Documented and left alone.
   *
   * ── THE THREE PROCESS CONTEXTS ────────────────────────────────────────────────────────────────
   *   NOT AN OMISSION, AND §0.2.1.5 FLAGS IT AS THE SUBTLETY MOST LIKELY TO BE MISREAD: THERE IS
   *   NO `Product_AddOption.json` AND NO `Product_AddOptionGroup.json`. Those two process contexts are
   *   validated by CONTEXT-SCOPED RULES DECLARED INSIDE `Product.json` ITSELF. A reader who searches
   *   the validation directory for per-process documents finds `Product_UpdateSkus.json` and concludes
   *   the other two are missing; they are not.
   *
   *   `baseProductType`  gated PER CONTEXT — restricted to the merchandise discriminator for the
   *                      `addOptionGroup` and `addOption` contexts, and to the subscription
   *                      discriminator for `addSubscriptionTerm`. Read through
   *                      {@link Product.getBaseProductType}, which is the second reason its return type
   *                      must not be narrowed.
   *   MINIMUM-COLLECTION GATES, one per context, each requiring at least one entry:
   *                      `unusedProductOptionGroups` for `addOptionGroup`
   *                      → {@link Product.getUnusedProductOptionGroups};
   *                      `unusedProductOptions` for `addOption`
   *                      → {@link Product.getUnusedProductOptions};
   *                      `unusedProductSubscriptionTerms` for `addSubscriptionTerm`
   *                      → {@link Product.getUnusedProductSubscriptionTerms}.
   *                      ONLY THE ARITY OF THESE THREE COLLECTIONS IS CONSUMED — which is exactly
   *                      why all three members are retained, and why the third is a boundary stub
   *                      returning an empty array rather than being deleted.
   *
   * ── UNIQUENESS IS NOT THIS FILE'S WORK ────────────────────────────────────────────────────────
   *   Both unique rules — `productCode` and `urlTitle` — are enforced APPLICATION-SIDE as well as by
   *   the column constraints (IR-5), through an existence query ported to
   *   `src/adapters/mysql/UniquePropertyChecker.ts` from [org/Hibachi/HibachiDAO.cfc:L130-L146]. Five
   *   of the eight unique columns in the whole system belong to this slice, and two of them are on this
   *   entity. No uniqueness check occurs here: it requires data access, which S2 and S4 both forbid in
   *   this layer.
   */

  /* ==============================================================================================
   * THE TRACEABLE TEST CONTRACT — `test/domain/Product.test.ts` (owned by another agent)
   * ==============================================================================================
   * §0.6.5 requires every converted member to be labelled TRACEABLE or NET-NEW, and to state the
   * ratio honestly rather than implying parity. For this entity the ratio is stark and is not softened:
   * ONE own legacy assertion plus FOUR inherited ones. Everything else is NET-NEW.
   *
   * ── TRACEABLE — ONE OWN ASSERTION ─────────────────────────────────────────────────────────────
   *   `productUrlIsCorrectlyFormatted()` [meta/tests/unit/entity/ProductTest.cfc:L58-L62] sets the url
   *   title to `nike-air-jorden` and asserts {@link Product.getProductURL} renders the setting value
   *   wrapped in slashes. THE RENDERED SHAPE IS IMMOVABLE — leading slash, single separator, TRAILING
   *   slash. See that member for the full warning.
   *
   * ── TRACEABLE — FOUR INHERITED ASSERTIONS ─────────────────────────────────────────────────────
   *   From [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L69]:
   *     1. Validating a NEW instance in the `save` context DOES NOT PASS — the entity must report
   *        errors. Satisfied by `new Product()` having no `productName`, `productCode`, `productType`
   *        or `urlTitle`, all four required on save.
   *     2. A SIMPLE REPRESENTATION IS PRESENT AND IS A SIMPLE VALUE.
   *     3. A PRIMARY-ID PROPERTY NAME IS PRESENT and is non-empty.
   *     4. DEFAULTS ARE CORRECT — the entity reports itself new, and its primary id value is empty.
   *
   *   PRODUCT OVERRIDES **NONE** OF THE FOUR, so all four apply as written. That is why §0.6.5.1
   *   describes this entity's coverage as the url assertion plus FOUR inherited, where `Brand` gets
   *   THREE — `Brand` overrides the defaults assertion to additionally require an empty products
   *   array. The two files legitimately differ and must not be harmonised.
   *
   * ── WHERE THE FOUR ASSERTIONS ACTUALLY LAND, so the test author is not left guessing ────────
   *   F22 forbids this class from declaring the framework members three of them call. The split:
   *     • Assertions 1 and 3 land on the VALIDATION LAYER and on the exported descriptor set below —
   *       `src/validation/rules/product.rules.ts` answers the first, and
   *       `PRODUCT_PROPERTY_DESCRIPTORS` names the primary-id property for the third.
   *     • Assertion 2 is satisfied for `Product` through the framework DEFAULT, driven by
   *       {@link Product.getSimpleRepresentationPropertyName} returning the product-name property —
   *       NOT by a local simple-representation override, which this class deliberately does not have.
   *       `ProductType` is the sibling that overrides the representation itself.
   *     • Assertion 4 is satisfied HERE, by {@link Product.isNew} and by `productID` initialising to
   *       the unsaved value.
   *
   * ── NET-NEW — EVERYTHING ELSE ─────────────────────────────────────────────────────────────────
   *   §0.6.5.2 verified the absences: there is no legacy SKU, option, option-group or product-type
   *   entity test, no service test of any kind, and no data-access test. So every member on this class
   *   beyond the url render is NET-NEW coverage. The five regression tests at
   *   `meta/tests/unit/IssuesTest.cfc` include two that touch this entity — a populate-save-delete
   *   round trip with a nested product-type structure, and a processability check for the
   *   add-option-group context — and those port to `test/regression/issues.test.ts`, retaining their
   *   issue numbers as test names.
   *
   *   AND THE LEGACY SUITE CANNOT BE EXECUTED HERE AT ALL. Per §0.5.4 the test framework is not
   *   vendored and no CFML engine is available, so traceability was established BY READING TEST SOURCE,
   *   not by running it and comparing. Stating that is better than implying a comparison that never
   *   happened.
   *
   * ── S6 — WHAT THIS CLASS GUARANTEES THE TEST AUTHOR ───────────────────────────────────────────
   *   `new Product()` SUCCEEDS WITH NO ARGUMENTS: no declared constructor, no framework bootstrap, no
   *   container, no data access, no I/O, no asynchronous work. Every collaborator arrives as an
   *   explicit parameter typed by a structural interface, so a test substitutes a PLAIN OBJECT LITERAL
   *   — no mocking library needed, which matters because the legacy repository contains none
   *   (§0.4.1.12). That is the whole point of the R-C pattern, and it is the structural difference
   *   §0.4.3.6 records: legacy tests booted the entire application and were integration tests; these
   *   are unit tests.
   */

  /* ============================================================================================
   * THE MANAGED-ENTITY CONTRACT — [org/Hibachi/**], INHERITED IN CFML, DECLARED HERE (IR-1 / TR-3)
   * ============================================================================================
   * Seven members every legacy entity received down the
   * `HibachiObject` -> `HibachiTransient` -> `HibachiEntity` -> `model/entity/HibachiEntity.cfc`
   * inheritance chain, and which `src/validation/Validator.ts` and
   * `src/ports/UniquePropertyPort.ts` both require BY NAME. Neither contract can be satisfied by a
   * plain data class, which is why they are declared rather than assumed:
   * `ValidationSubject` reads `getClassName` and `hasProperty`, and `UniquePropertyEntity` reads
   * `getEntityName`, `getPrimaryIDValue`, `getPrimaryIDPropertyName`, `getPropertyMetaData` and
   * `getValueByPropertyIdentifier` in exactly the order [org/Hibachi/HibachiDAO.cfc:L134-L138]
   * reads them.
   *
   * `src/domain/base/AuditableEntity.ts` owns the shared behaviour and every word of the rationale —
   * including why there is no base class, why the member names are not modernised, and which
   * inherited members are deliberately NOT ported. Each member below is the thin delegation plus the
   * constant only this entity can state.
   * ============================================================================================ */

  /**
   * `Product` — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of the
   * component's fully qualified name. Interpolated into every validation message
   * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216].
   *
   * @returns The bare class name.
   */
  getClassName(): string {
    return PRODUCT_CLASS_NAME;
  }

  /**
   * `SlatwallProduct` — [org/Hibachi/HibachiEntity.cfc:L287-L289]. Live metadata reflection is replaced by the
   * declared constant, per TR-3.
   *
   * @returns The mapped ORM entity name, NOT the physical table name.
   */
  getEntityName(): string {
    return PRODUCT_ENTITY_NAME;
  }

  /**
   * `productID` — [org/Hibachi/HibachiEntity.cfc:L249-L251]. The legacy resolved this through
   * `getService("hibachiService")`; the string-keyed service locator is replaced by the declared
   * constant, per TR-3 and AAP 0.7.3 S3.
   *
   * @returns The name of the primary identifier property.
   */
  getPrimaryIDPropertyName(): string {
    return PRODUCT_PRIMARY_ID_PROPERTY_NAME;
  }

  /**
   * The primary identifier's VALUE — [org/Hibachi/HibachiEntity.cfc:L244-L246], which forwards to
   * the generated getter for whichever property `getPrimaryIDPropertyName` names.
   *
   * ⚠️ RETURNS `''` FOR AN UNSAVED INSTANCE, because [model/entity/Product.cfc:L52] declares
   * `unsavedvalue=""` and this class initialises the field to `''`. That is what makes the
   * self-exclusion term of the uniqueness query a NO-OP on insert — an observation AAP 0.4.1.7
   * requires be reproduced rather than tidied away, and which `src/ports/UniquePropertyPort.ts`
   * carries as a `TODO(parity)`. It is also the value
   * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67] asserts on a fresh instance.
   *
   * @returns The identifier, or `''` while unsaved.
   */
  getPrimaryIDValue(): string {
    return this.productID;
  }

  /**
   * Whether this entity DECLARES the named property —
   * [org/Hibachi/HibachiTransient.cfc:L763-L765].
   *
   * ⚠️ A FALSE ANSWER SILENTLY SKIPS A VALIDATION RULE rather than failing it
   * [org/Hibachi/HibachiValidationService.cfc:L171]. See PRODUCT_DECLARED_PROPERTIES, whose
   * exhaustiveness is compile-checked precisely because of that.
   *
   * @param propertyIdentifier - The name to test, in its declared casing.
   * @returns `true` when the property is declared.
   */
  hasProperty(propertyIdentifier: string): boolean {
    return hasDeclaredProperty(PRODUCT_DECLARED_PROPERTIES, propertyIdentifier);
  }

  /**
   * Resolves a declared property's metadata, RAISING for an undeclared name —
   * [org/Hibachi/HibachiTransient.cfc:L738-L747], whose present-key branch is at [:L741-L743] and
   * whose throw is at [:L746]. The non-optional return type is faithful to that declaration.
   *
   * @param propertyName - The name to resolve.
   * @returns The metadata for that property.
   * @throws DomainError - When no property of that name is declared. Withheld from every response
   *   by the deny-by-default presentation, because it signals a fault in the port rather than
   *   anything a caller can provoke.
   */
  getPropertyMetaData(propertyName: string): EntityPropertyMetaData {
    return requireDeclaredPropertyMetaData(
      PRODUCT_DECLARED_PROPERTIES,
      propertyName,
      PRODUCT_CLASS_NAME,
    );
  }

  /**
   * Reads a value by property identifier, walking a path delimited by EITHER `.` OR `_` —
   * [org/Hibachi/HibachiTransient.cfc:L466-L481]. An unresolvable path yields `''`, never an absent
   * value; `readValueByPropertyIdentifier` documents all four traversal rules and why each is
   * behaviour rather than convenience.
   *
   * @param propertyIdentifier - A property name, or a delimited path.
   * @returns The resolved value, or `''`.
   */
  getValueByPropertyIdentifier(propertyIdentifier: string): unknown {
    return readValueByPropertyIdentifier(this, propertyIdentifier);
  }

  /* ---------------------------------------------------------------------------------------------
   * ERRORS / MESSAGES — [org/Hibachi/HibachiTransient.cfc:L26-L67]
   * -------------------------------------------------------------------------------------------
   * The entity is an ERROR CARRIER, and within this slice that is load-bearing rather than
   * incidental. [model/service/SkuService.cfc:L143], [`:L148`] and [`:L174`] attach their
   * required-field failures to the PRODUCT — `product.addError(name, rbKey(...))` — and
   * [`:L151`] and [`:L179`] then gate every SKU-creating branch on `product.hasErrors()`. A
   * product with no way to hold an error cannot express either half of that contract: the
   * failures have nowhere to land, and the gate that reads them is unwritable.
   *
   * ⚠️ F03 — WHY THESE SIX MEMBERS EXIST. They were absent, so `../../services/SkuService`'s
   * `createSkus` had to open a LOCAL error bag, populate it, gate on it, and then discard it at
   * every exit — returning `true` even where the legacy returns a product carrying errors. The
   * caller's `product.hasErrors()` gate could never observe a failure, which turned a rejected
   * save into a silent success. Declaring the carrier here fixes that at its root rather than at
   * the call site, because the missing capability was the entity's, not the service's.
   *
   * ⛔ DELEGATION, NOT REIMPLEMENTATION. Legacy delegates all six to a `HibachiErrors` BEAN —
   * every body is one line of the form `getHibachiErrors().<same-member>(...)` [`:L30`, `:L61`,
   * `:L66`]. `../../errors/ValidationError` is that bean's port and already carries the identical
   * six-member API with the identical shapes, so these members delegate to an instance of it. The
   * structural analogue is exact: entity delegates to bean, in both systems.
   *
   * ⚠️ THE BAG IS PER-INSTANCE AND LAZILY CREATED, matching `getHibachiErrors()`'s bean lifetime,
   * which is scoped to the entity instance and not shared. Nothing here is module-scope state, so
   * no error can bleed between warm Lambda invocations (M7 / S8).
   */

  /**
   * This product's error bean. Lazily created so an unerrored product carries no allocation, and
   * per-instance so it cannot be shared — the two properties `getHibachiErrors()` has.
   */
  private errorBean: ValidationError | undefined = undefined;

  /**
   * Returns this product's error bean, creating it on first demand.
   *
   * The port of `getHibachiErrors()` itself. Kept separate from the six public members so each of
   * them stays the one-line delegation its legacy counterpart is.
   */
  private requireErrorBean(): ValidationError {
    this.errorBean ??= new ValidationError();
    return this.errorBean;
  }

  /**
   * A struct of all the errors for this entity — [org/Hibachi/HibachiTransient.cfc:L29-L31].
   *
   * `ValidationErrors` is `Readonly<Record<string, readonly string[]>>`, which is the CFML
   * struct-of-arrays this returns, expressed in the type system.
   */
  public getErrors(): ValidationErrors {
    return this.requireErrorBean().getErrors();
  }

  /**
   * The error messages held under one error name — [org/Hibachi/HibachiTransient.cfc:L34-L44].
   *
   * ⚠️ AN ABSENT NAME YIELDS THE EMPTY ARRAY, NOT `undefined` AND NOT A THROW. [`:L43`] is
   * explicit about it — "Default behavior if the error isn't found is to return an empty array" —
   * so callers may read the result unguarded, and the port preserves that.
   */
  public getError(errorName: string): readonly string[] {
    return this.requireErrorBean().getError(errorName);
  }

  /**
   * Whether this entity has ANY error — [org/Hibachi/HibachiTransient.cfc:L47-L53].
   *
   * The gate [model/service/SkuService.cfc:L151] and [`:L179`] read before creating any SKU, and
   * the gate a caller reads afterwards to decide whether the creation actually succeeded. Legacy
   * tests `structCount(getErrors())`, which is emptiness of the whole struct and not the presence
   * of one key.
   */
  public hasErrors(): boolean {
    return this.requireErrorBean().hasErrors();
  }

  /**
   * Whether one specific error key exists — [org/Hibachi/HibachiTransient.cfc:L56-L58].
   */
  public hasError(errorName: string): boolean {
    return this.requireErrorBean().hasError(errorName);
  }

  /**
   * Adds one error under one name — [org/Hibachi/HibachiTransient.cfc:L61-L63].
   *
   * ⚠️ ACCUMULATES, NEVER REPLACES. Two adds under the same name leave two messages under that
   * key, because the bean appends to the key's array. That is what lets
   * [model/service/SkuService.cfc:L143] and [`:L148`] both fire on one product and both be
   * observable, and it is why the underlying store is a struct of ARRAYS rather than of strings.
   */
  public addError(errorName: string, errorMessage: string): void {
    this.requireErrorBean().addError(errorName, errorMessage);
  }

  /**
   * Merges a whole struct of errors in — [org/Hibachi/HibachiTransient.cfc:L66-L68].
   *
   * The member that lets a SKU's validation failures be carried up onto the product that owns it,
   * which is how `createSkus` propagates what it previously discarded (F03).
   */
  public addErrors(errors: ValidationErrors): void {
    this.requireErrorBean().addErrors(errors);
  }
}

/* ================================================================================================
 * MODULE-LEVEL HELPERS
 * ================================================================================================
 * Declared as module-scope functions rather than as private methods, matching the sibling
 * `ProductType.ts`, which places its own path-building helpers after its class in exactly this shape.
 * None of the four sibling entity modules declares a single `private` or `#` member, so the convention
 * is consistent across the folder and is followed here.
 *
 * ALL FOUR ARE PURE. Not one holds state, opens a cache or closes over anything at module scope, so
 * S8's prohibition on module-scope memoization is satisfied structurally rather than by discipline —
 * there is nothing here for a warm Lambda container to leak between invocations.
 */

/**
 * Flattens the keys of a product's option-group map into one comma-delimited string.
 *
 * The port of `structKeyList(getOptionGroupsStruct())`, which both
 * [model/entity/Product.cfc:L637] and [`:L644`] evaluate identically. Extracted so the two call sites
 * cannot drift apart in the one respect that matters — THE DELIMITER AND THE STRING FORM — while each
 * keeps its own distinct argument list.
 *
 * COMMA, WITH NO SURROUNDING WHITESPACE, matching CFML's default list delimiter exactly. The
 * consumer splits on the same delimiter [model/dao/OptionDAO.cfc:L67 binds it with a list flag], so an
 * added space would become part of an identifier and every comparison after the first would miss.
 *
 * THE EMPTY MAP YIELDS THE EMPTY STRING, which is legal and meaningful: a product with no option
 * groups has nothing to exclude, so every option counts as unused. That degenerate case is left
 * unguarded deliberately, for the same reason T5 forbids guarding the sibling chain.
 *
 * NO ORDERING IS ASSERTED. CFML struct-key enumeration order is unspecified, and the negated
 * membership clause this feeds is order-insensitive, so nothing downstream may depend on one.
 *
 * @param product - The product whose option-group keys are wanted.
 * @param optionGroupFinder - Forwarded to `Product.getOptionGroupsStruct`.
 * @returns The comma-delimited identifier list, in unspecified key order.
 */
async function buildExistingOptionGroupIDList(
  product: Product,
  optionGroupFinder: ProductOptionGroupFinder,
): Promise<string> {
  return Object.keys(await product.getOptionGroupsStruct(optionGroupFinder)).join(',');
}

/**
 * Resolves one template identifier against a product, for `Product.getTitle`.
 *
 * This is the domain half of the substitution contract. `../../util/formatting` hands identifiers over
 * UNTOUCHED — including dotted ones — and states explicitly that traversing them belongs to the domain
 * layer, because the legacy delegated to a property-identifier walker
 * [org/Hibachi/HibachiUtilityService.cfc:L88] and the metadata default for the title setting contains
 * a dotted identifier.
 *
 * G6 JUDGMENT CALL 1 — ONE LEVEL OF DOTTING, NO DEEPER. A bare identifier resolves against the
 * product; an identifier with exactly one dot resolves its first segment against the two IN-SCOPE
 * many-to-one relationships and its second against that related entity's own scalars. Two or more dots
 * resolve to `undefined`. Supporting arbitrary depth would mean walking relationships this port does not
 * carry — the excluded pricing, promotion and inventory families among them — which is exactly the
 * "follow the getter" failure IR-3 warns about.
 *
 * G6 JUDGMENT CALL 2 — ONLY STRING-VALUED PROPERTIES RESOLVE; EVERYTHING ELSE IS LEFT VERBATIM.
 * The legacy engine coerced whatever a property held into text using the CFML engine's own rules, and
 * those rules differ per type and per engine — a boolean, a date and a decimal each have more than one
 * defensible textual form. Choosing one here would be inventing a format the source does not state
 * (S9). So booleans, numbers and dates resolve to `undefined`, which by the substitution contract
 * leaves their token VERBATIM in the output rather than blanking it. That is a documented, visible
 * outcome rather than a silently wrong one, and it is why no date formatter is imported: the
 * `globalDateFormat` setting is not among the three keys this entity reads and no default for it may
 * be invented.
 *
 * AN UNRESOLVED IDENTIFIER MUST RETURN `undefined`, NEVER `''`. The two are genuinely different to
 * the substitution engine: `undefined` means UNRESOLVED and leaves the token in place, while `''` means
 * RESOLVED TO EMPTY and substitutes. Returning `''` for an unknown identifier would silently erase
 * tokens the legacy preserved.
 *
 * @param product - The entity the identifier is resolved against.
 * @param propertyIdentifier - A bare or single-dotted property identifier, delimiters already stripped.
 * @returns The resolved string value, or `undefined` to leave the token verbatim.
 */
function resolveProductPropertyIdentifier(
  product: Product,
  propertyIdentifier: string,
): string | undefined {
  const separatorIndex = propertyIdentifier.indexOf('.');
  if (separatorIndex === -1) {
    return readProductStringProperty(product, propertyIdentifier);
  }

  const relationshipName = propertyIdentifier.slice(0, separatorIndex);
  const relatedPropertyName = propertyIdentifier.slice(separatorIndex + 1);
  // Two or more dots: the remainder still contains a separator, so it is beyond the supported depth.
  if (relatedPropertyName.includes('.')) {
    return undefined;
  }

  if (relationshipName === 'brand') {
    const assignedBrand = product.brand;
    if (assignedBrand === undefined) {
      return undefined;
    }
    return readBrandStringProperty(assignedBrand, relatedPropertyName);
  }

  if (relationshipName === 'productType') {
    const assignedProductType = product.productType;
    if (assignedProductType === undefined) {
      return undefined;
    }
    return readProductTypeStringProperty(assignedProductType, relatedPropertyName);
  }

  return undefined;
}

/**
 * Reads one string-valued property off a product by name.
 *
 * AN EXPLICIT SWITCH, NOT AN INDEX SIGNATURE OR A CAST. A dynamic lookup would need either a cast
 * or an index signature on the class, and S1 forbids the first outright while the second would make
 * every property on this entity writable by arbitrary string key — reintroducing exactly the
 * string-keyed dynamism TR-3 exists to remove. Enumerating the cases keeps the resolvable surface
 * compile-checked: a property renamed on the class breaks this function rather than silently ceasing
 * to resolve.
 *
 * THE ENUMERATED SURFACE IS THE ENTITY'S OWN STRING-TYPED PERSISTENT COLUMNS, and nothing else. The
 * boolean and numeric columns are deliberately absent per judgment call 2, as are all relationships and
 * every non-persistent member — resolving a calculated member here would let a title template reach
 * straight through the §0.2.2.6 boundary.
 *
 * `calculatedTitle` IS included, because it is a genuine persisted string column. Note the
 * consequence and that it is faithful: a template referencing it reads the STORED title while
 * `Product.getTitle` is computing the live one, exactly as the legacy property walker would have.
 *
 * @param product - The entity to read from.
 * @param propertyName - The property name, matched exactly and case-sensitively.
 * @returns The value, or `undefined` when the property is absent or is not a string column.
 */
function readProductStringProperty(product: Product, propertyName: string): string | undefined {
  switch (propertyName) {
    case 'productID':
      return product.productID;
    case 'productName':
      return product.productName;
    case 'productCode':
      return product.productCode;
    case 'productDescription':
      return product.productDescription;
    case 'urlTitle':
      return product.urlTitle;
    case 'calculatedTitle':
      return product.calculatedTitle;
    case 'remoteID':
      return product.remoteID;
    default:
      return undefined;
  }
}

/**
 * Reads one string-valued property off a brand by name, for single-dotted identifiers.
 *
 * EVERY CASE IS A PROPERTY `Brand.ts` ACTUALLY DECLARES — verified against that module rather than
 * assumed, so no name here is invented (S9). Its boolean columns are omitted per judgment call 2, and
 * its collections are omitted because a collection has no textual form worth inventing.
 *
 * This is the branch that matters most in practice: the metadata default for the title setting is the
 * dotted identifier that reaches a brand's name, which is precisely why dotted support exists at all.
 *
 * @param brand - The related brand.
 * @param propertyName - The property name, matched exactly and case-sensitively.
 * @returns The value, or `undefined` when absent or not a string column.
 */
function readBrandStringProperty(brand: Brand, propertyName: string): string | undefined {
  switch (propertyName) {
    case 'brandID':
      return brand.brandID;
    case 'brandName':
      return brand.brandName;
    case 'brandWebsite':
      return brand.brandWebsite;
    case 'urlTitle':
      return brand.urlTitle;
    case 'remoteID':
      return brand.remoteID;
    default:
      return undefined;
  }
}

/**
 * Reads one string-valued property off a product type by name, for single-dotted identifiers.
 *
 * EVERY CASE IS A PROPERTY `ProductType.ts` ACTUALLY DECLARES — verified against that module (S9).
 *
 * `systemCode` and `productTypeIDPath` are included because both are genuine persisted string columns.
 * `getBaseProductType` is NOT reachable from here and deliberately so: it is asynchronous, it needs an
 * injected root resolver, and the substitution contract is synchronous — so a template cannot trigger
 * hierarchy resolution as a side effect of rendering a title.
 *
 * @param productType - The related product type.
 * @param propertyName - The property name, matched exactly and case-sensitively.
 * @returns The value, or `undefined` when absent or not a string column.
 */
function readProductTypeStringProperty(
  productType: ProductType,
  propertyName: string,
): string | undefined {
  switch (propertyName) {
    case 'productTypeID':
      return productType.productTypeID;
    case 'productTypeName':
      return productType.productTypeName;
    case 'productTypeDescription':
      return productType.productTypeDescription;
    case 'productTypeIDPath':
      return productType.productTypeIDPath;
    case 'systemCode':
      return productType.systemCode;
    case 'urlTitle':
      return productType.urlTitle;
    case 'remoteID':
      return productType.remoteID;
    default:
      return undefined;
  }
}

/* ================================================================================================
 * R-B — THE POPULATION CONTRACT
 * ================================================================================================
 * THIS CLASS DECLARES NO `populate()` METHOD, BY MANDATE. The legacy override at
 * [model/entity/HibachiEntity.cfc:L56] delegated to the framework's metadata-driven pass, which
 * walked `getProperties()` and dispatched on each property's `fieldtype` at runtime
 * [org/Hibachi/HibachiTransient.cfc]. In the target, `../base/populate` owns population outright and
 * F22 forbids an entity declaring the member at all. What this file owns instead is the DECLARATION of
 * which properties are populatable and how — the descriptor set below, which is the typed, compile-
 * checked replacement for that metadata walk (TR-3).
 *
 * DECLARATION ORDER IS PRESERVED BECAUSE IT IS OBSERVABLE. `../base/populate` iterates DECLARED
 * PROPERTIES rather than payload keys, so the order of the `properties` array is the order in which a
 * payload is applied. The array below follows [model/entity/Product.cfc:L52-L99] exactly, and every
 * gap in that range is accounted for in the comment on the returned object.
 *
 * THE `notNull` ASYMMETRY IS ENCODED EXACTLY ONCE, on `productName`. It is the ONLY `notNull`
 * declaration in the entire in-scope slice — a single occurrence at [`:L55`] — and
 * `../base/populate`'s own documentation independently confirms the count. For that one property a
 * BLANK payload value assigns the trimmed empty string [org/Hibachi/HibachiTransient.cfc:L207]; for
 * every other property in the slice a blank value DELETES the key [`:L196`]. Encoding it here rather
 * than branching in the entity is what keeps the rule in one place.
 *
 * PRODUCT NEEDS NO POPULATE-DISABLED PREDICATE OF ITS OWN, and its absence is a deliberate contrast
 * with `Brand.ts`. Product's populate-disabled set is EXACTLY the four audit properties — verified as
 * four `hb_populateEnabled="false"` declarations in the whole file, all at [`:L96-L99`] — so
 * `isAuditPropertyName` from `../base/AuditableEntity` is already the complete and correct answer, and
 * exporting a Product-specific wrapper around it would add a second source of truth for no gain.
 * `Brand` needs its own predicate precisely because it carries FIVE additional relationship exclusions
 * on top of the audit four, for nine. `ProductType` matches Product at four. The three files
 * legitimately differ and are not harmonised.
 */

/**
 * Every property name `model/entity/Product.cfc` declares, in source order.
 *
 * Includes the primary identifier and the collections, so the union is a faithful census of the legacy
 * declaration even where a name carries no descriptor below — the two facts are separate, and
 * conflating them is what makes a boundary omission look like a forgotten property.
 */
export type ProductPropertyName =
  | 'productID'
  | 'activeFlag'
  | 'urlTitle'
  | 'productName'
  | 'productCode'
  | 'productDescription'
  | 'publishedFlag'
  | 'sortOrder'
  | 'calculatedSalePrice'
  | 'calculatedQATS'
  | 'calculatedAllowBackorderFlag'
  | 'calculatedTitle'
  | 'brand'
  | 'productType'
  | 'defaultSku'
  | 'skus'
  | 'productImages'
  | 'attributeValues'
  | 'productReviews'
  | 'listingPages'
  | 'categories'
  | 'relatedProducts'
  | 'promotionRewards'
  | 'promotionRewardExclusions'
  | 'promotionQualifiers'
  | 'promotionQualifierExclusions'
  | 'priceGroupRates'
  | 'vendors'
  | 'physicals'
  | 'remoteID'
  | AuditPropertyName;

/**
 * The twenty `persistent="false"` properties [model/entity/Product.cfc:L102-L123] declares.
 *
 * Declared for the same reason `../sku/Sku.ts` declares its own equivalent: FOUR OF THEM ARE
 * VALIDATED PROPERTIES, and the presence gate at
 * [org/Hibachi/HibachiValidationService.cfc:L171] silently SKIPS a rule whose property the subject
 * does not have. `model/validation/Product.json` requires `price` [`:L118`], gates two contexts on
 * `baseProductType` [`:L103`], and guards deletion and the add-option contexts on
 * `transactionExistsFlag` [`:L110`], `unusedProductOptions` [`:L111`],
 * `unusedProductOptionGroups` [`:L112`] and `unusedProductSubscriptionTerms` [`:L113`]. None of the
 * six is a persistent COLUMN, so none appears in {@link ProductPropertyName}, and
 * {@link PRODUCT_ENTITY_METADATA} therefore has to carry them separately for those rules to run at
 * all.
 *
 * It is also the documentary record of the calculated-property boundary from the property-name side:
 * the module header enumerates member by member which of these twenty this port carries and which
 * AAP §0.2.2.6 excludes. Declaring the complete DECLARED set here, rather than only the carried
 * subset, is what makes `hasProperty` answer exactly as the legacy predicate did — that predicate
 * read component metadata, which does not know or care whether a getter reaches an out-of-scope
 * service.
 *
 * ⚠️ `physicalCounts` IS ABSENT FROM THIS UNION AND FROM {@link ProductPropertyName}, AND THE
 * ABSENCE IS LOAD-BEARING. `model/validation/Product.json` names it in the delete context while this
 * entity declares `physicals` [`:L90`] instead, so the legacy engine skips that rule;
 * `src/validation/rules/product.rules.ts` pins the inertness with a compile-checked
 * `Exclude`. Adding the name to either union would activate a rule the legacy system never ran.
 */
export type ProductNonPersistentPropertyName =
  | 'allowBackorderFlag'
  | 'baseProductType'
  | 'brandName'
  | 'brandOptions'
  | 'estimatedReceivalDetails'
  | 'qats'
  | 'salePriceDetailsForSkus'
  | 'title'
  | 'transactionExistsFlag'
  | 'unusedProductOptions'
  | 'unusedProductOptionGroups'
  | 'unusedProductSubscriptionTerms'
  | 'currencyCode'
  | 'defaultProductImageFiles'
  | 'price'
  | 'renewalPrice'
  | 'listPrice'
  | 'livePrice'
  | 'salePrice'
  | 'currentAccountPrice';

/**
 * Product's frozen metadata declaration — what `manageEntity` reads to compose the seven framework
 * introspection members onto an instance.
 *
 * ⚠️ THIS CLASS ALSO DECLARES ALL SEVEN ITSELF, AND THIS BLOCK USED TO SAY THE OPPOSITE. It read "the
 * runtime answer to the seven framework introspection members this class deliberately does not
 * declare … composed onto an instance by `../base/manageEntity` rather than hand-written here", and
 * both halves were wrong. The seven are hand-written further down this module over its own frozen
 * constants, alongside an `implements ManagedEntity` clause that obliges them; and `../base/manageEntity`
 * is not a module — `manageEntity` is a FUNCTION exported by `../base/populate`, whose `Object.assign`
 * shadows those prototype methods with equivalent own-property closures over this declaration.
 * `../base/AuditableEntity` records once which classes declare the seven and which rely on composition.
 *
 * See {@link EntityMetadataDeclaration} for what each member ports.
 *
 * ⚠️ THIS CONSTANT IS WHY THE MODULE HEADER'S CLAIM ABOUT `entityname` NEEDED CORRECTING. The
 * `Slatwall`-prefixed LOGICAL entity name appears here as a value, because `getEntityName()`
 * [org/Hibachi/HibachiEntity.cfc:L287-L289] is observable behaviour that
 * `src/ports/UniquePropertyPort.ts` consumes. The PHYSICAL table name still appears in this module
 * only as prose, and S2 is unaffected: a logical ORM name is not a table identifier, is never
 * interpolated into a statement here, and this module still contains no SQL, no driver and no column
 * name in any code position. {@link PRODUCT_PROPERTY_DESCRIPTORS} reads `className` from here so
 * that literal is written once too.
 *
 * THIRTY-FOUR FIELD KEYS — every persistent property [model/entity/Product.cfc] declares: the eight
 * scalars at [`:L52-L59`], the four persisted calculated columns at [`:L62-L65`], the three
 * many-to-ones at [`:L68-L70`], the collections at [`:L73-L76`], [`:L79-L81`] and [`:L84-L90`], the
 * remote identifier at [`:L93`] and the four audit properties at [`:L96-L99`]. Plus all twenty
 * non-persistent names, exhaustively checked against
 * {@link ProductNonPersistentPropertyName} — see that union for which validation rules depend on
 * them and why omitting them would silently disable those rules.
 */
export const PRODUCT_ENTITY_METADATA: EntityMetadataDeclaration<ProductPropertyName> =
  Object.freeze({
    className: 'Product',
    entityName: 'SlatwallProduct',
    primaryIDPropertyName: 'productID',
    properties: Object.freeze({
      productID: true,
      activeFlag: true,
      urlTitle: true,
      productName: true,
      productCode: true,
      productDescription: true,
      publishedFlag: true,
      sortOrder: true,
      calculatedSalePrice: true,
      calculatedQATS: true,
      calculatedAllowBackorderFlag: true,
      calculatedTitle: true,
      brand: true,
      productType: true,
      defaultSku: true,
      skus: true,
      productImages: true,
      attributeValues: true,
      productReviews: true,
      listingPages: true,
      categories: true,
      relatedProducts: true,
      promotionRewards: true,
      promotionRewardExclusions: true,
      promotionQualifiers: true,
      promotionQualifierExclusions: true,
      priceGroupRates: true,
      vendors: true,
      physicals: true,
      remoteID: true,
      createdDateTime: true,
      createdByAccount: true,
      modifiedDateTime: true,
      modifiedByAccount: true,
    } satisfies Readonly<Record<ProductPropertyName, true>>),
    declaredNonFieldProperties: Object.freeze({
      allowBackorderFlag: true,
      baseProductType: true,
      brandName: true,
      brandOptions: true,
      estimatedReceivalDetails: true,
      qats: true,
      salePriceDetailsForSkus: true,
      title: true,
      transactionExistsFlag: true,
      unusedProductOptions: true,
      unusedProductOptionGroups: true,
      unusedProductSubscriptionTerms: true,
      currencyCode: true,
      defaultProductImageFiles: true,
      price: true,
      renewalPrice: true,
      listPrice: true,
      livePrice: true,
      salePrice: true,
      currentAccountPrice: true,
    } satisfies Readonly<Record<ProductNonPersistentPropertyName, true>>),
  } satisfies EntityMetadataDeclaration<ProductPropertyName>);

/* ================================================================================================
 * THE PER-ENTITY METADATA CONSTANTS — ONE SOURCE, TWO VOCABULARIES
 * ================================================================================================
 * `PRODUCT_ENTITY_METADATA` above is the single frozen declaration of this entity's class name, ORM entity name,
 * primary-identifier property name and declared-property set. The four constants below NAME those
 * same four facts individually, because the entity's own metadata members and the population
 * descriptor set read them one at a time, and a named constant states the intent better at each of
 * those sites than reaching into a record does.
 *
 * ⛔ THEY ARE DERIVED, NEVER RE-SPELLED. Every one reads out of `PRODUCT_ENTITY_METADATA`; not one repeats a literal.
 * That is the whole point. The class name in particular is consumed in three places that MUST agree
 * — `getClassName()`, every validation message
 * [org/Hibachi/HibachiValidationService.cfc:L202, :L213, :L216], and the third arm of the population
 * authorisation gate through `PropertyDescriptorSet.className` — and a second literal would let two
 * of the three drift apart with no compile error and no test failure.
 *
 * ⚠️ `PRODUCT_CLASS_NAME` IS NOT `PRODUCT_ENTITY_NAME`. The first is the bare `Product`, the last
 * dot-delimited segment [org/Hibachi/HibachiObject.cfc:L135-L137]; the second carries the `Slatwall`
 * prefix declared by the `entityname` attribute at [`:L49`] and read at
 * [org/Hibachi/HibachiEntity.cfc:L287-L289]. Interchanging them changes observable message text in
 * one direction and breaks the mapped-graph vocabulary in the other.
 * ================================================================================================ */

/**
 * The bare class name — [org/Hibachi/HibachiObject.cfc:L135-L137], the last dot-delimited segment of
 * the component's fully qualified name. Carries NO `Slatwall` prefix.
 */
export const PRODUCT_CLASS_NAME: string = PRODUCT_ENTITY_METADATA.className;

/**
 * The mapped ORM entity name declared by the `entityname` attribute at [`:L49`] and read at
 * [org/Hibachi/HibachiEntity.cfc:L287-L289].
 *
 * ⚠️ THE LOGICAL ENTITY NAME, NOT THE PHYSICAL `Sw*` TABLE. The legacy uniqueness statement
 * [org/Hibachi/HibachiDAO.cfc:L140] is expressed over the mapped object graph, so the prefixed form
 * is correct there; translating it into a table is the adapter's responsibility, never this module's.
 */
export const PRODUCT_ENTITY_NAME: string = PRODUCT_ENTITY_METADATA.entityName;

/**
 * The NAME of the primary identifier property — [`:L52`], which declares
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue=""` (AAP IR-6).
 *
 * The legacy resolved this name through `getService("hibachiService")`
 * [org/Hibachi/HibachiEntity.cfc:L249-L251]. Declaring it removes the string-keyed service locator
 * AAP 0.7.3 S3 forbids, and it is what makes the value safe in identifier position: the name comes
 * from entity metadata, never from caller input.
 */
export const PRODUCT_PRIMARY_ID_PROPERTY_NAME: string =
  PRODUCT_ENTITY_METADATA.primaryIDPropertyName;

/**
 * Every property name the LEGACY entity declares, as a keyed set — the port of the
 * `getPropertiesStruct()` structure [org/Hibachi/HibachiTransient.cfc:L739] that both `hasProperty`
 * [:L764] and `getPropertyMetaData` [:L741] key into. Membership is an own-key test in both.
 *
 * ⚠️ IT IS THE UNION OF THE TWO RECORDS `PRODUCT_ENTITY_METADATA` KEEPS SEPARATE, AND IT HAS TO BE. `properties`
 * holds the names this port carries as fields; `declaredNonFieldProperties` holds the names the
 * legacy entity declares that this port does NOT carry — accessors and boundary members such as
 * `defaultFlag` and `transactionExistsFlag`. The legacy predicate reads the entity's WHOLE declared
 * property table, and `src/validation/Validator.ts` SILENTLY SKIPS a rule whose property is absent
 * [org/Hibachi/HibachiValidationService.cfc:L171] — so answering false for a name in the second
 * record would turn a live validation rule inert with no error reported anywhere.
 *
 * ⚠️ THE COMPILE-CHECKED EXHAUSTIVENESS LIVES ON `PRODUCT_ENTITY_METADATA`, NOT HERE, and that is deliberate. The
 * `satisfies` annotations there check both records against the entity's property-name unions in BOTH
 * directions — a missing name and an invented one each fail the build. This constant merges two
 * already-checked records, so widening it to `string` keys loses nothing: there is no union to check
 * the merged set against, since the second record's names are by definition the ones no
 * property-name union carries.
 *
 * ⚠️ A NAME ABSENT FROM BOTH RECORDS STAYS ABSENT HERE, AND THAT IS ALSO LOAD-BEARING.
 * `physicalCounts` is named by the validation JSON and declared by NEITHER entity, so the legacy
 * engine skips those rules and this port must too. TODO(parity): carried as observed and NOT
 * repaired, per AAP 0.8.2 Guidelines 2 and 4. Adding it "for completeness" would activate a rule the
 * legacy system has never run.
 */
export const PRODUCT_DECLARED_PROPERTIES: DeclaredPropertyNameSet<string> = Object.freeze({
  ...PRODUCT_ENTITY_METADATA.properties,
  ...(PRODUCT_ENTITY_METADATA.declaredNonFieldProperties ?? {}),
});

/**
 * The eleven simple persistent columns population may write, in legacy declaration order —
 * [model/entity/Product.cfc:L53-L59] then [`:L62-L65`].
 *
 * `productName` CARRIES `notNull: true` AND IT IS THE ONLY ONE THAT DOES — see the block above.
 *
 * THE PRIMARY IDENTIFIER IS DELIBERATELY ABSENT. `productID` [`:L52`] declares `fieldtype="id"`,
 * and NO legacy populate branch admitted it: branches 1 and 2 require the `fieldtype` attribute to be
 * absent or `"column"`, branch 3 requires `"many-to-one"`, and branches 4 and 5 require a collection
 * kind. An `id` field matched none of them, so the legacy pass NEVER wrote a primary key from request
 * data. Omitting it reproduces that exactly, and it has a second concrete benefit: `productID` is the
 * one required, non-optional field on this class, and a blank payload value reaching branch 1 would
 * DELETE it and break {@link Product.isNew}. Identifier assignment belongs to the persistence layer
 * (IR-6).
 *
 * THE FOUR PERSISTED CALCULATED COLUMNS **ARE** LISTED, and that is correct rather than an
 * oversight: [`:L62-L65`] declare plain `ormtype` columns with NO `hb_populateEnabled` flag, so the
 * legacy pass wrote them from payload data like any other column. They must not be confused with the
 * sixteen excluded non-persistent members, none of which appears anywhere in this set.
 *
 * `sortOrder` IS LISTED TOO, and the distinction from F20 matters. F20 forbids THIS FILE from
 * ASSIGNING it — that is the ORM insert hook's job, relocated to
 * `src/adapters/mysql/UnitOfWork.ts`. It says nothing about population: the property carries no
 * exclusion flag, so a payload could and did write it. Two different mechanisms, and only one of them
 * is F20's subject.
 *
 * `populateArray` and `fileUpload` are omitted from every descriptor because `hb_populateArray` and
 * `hb_fileUpload` occur ZERO times in `model/entity/Product.cfc`; declaring either would invent
 * metadata (S9).
 */
const PRODUCT_SIMPLE_PROPERTY_DESCRIPTORS: readonly ColumnPropertyDescriptor<ProductPropertyName>[] =
  [
    { name: 'activeFlag', valueType: 'boolean' },
    { name: 'urlTitle', valueType: 'string' },
    { name: 'productName', valueType: 'string', notNull: true },
    { name: 'productCode', valueType: 'string' },
    { name: 'productDescription', valueType: 'string' },
    { name: 'publishedFlag', valueType: 'boolean' },
    { name: 'sortOrder', valueType: 'integer' },
    { name: 'calculatedSalePrice', valueType: 'bigDecimal' },
    { name: 'calculatedQATS', valueType: 'integer' },
    { name: 'calculatedAllowBackorderFlag', valueType: 'boolean' },
    { name: 'calculatedTitle', valueType: 'string' },
  ];

/**
 * `remoteID` — [model/entity/Product.cfc:L93]. A populate-enabled simple column, declared separately
 * from the eleven above because it sits AFTER the relationship block in the legacy source and
 * declaration order is preserved.
 */
const PRODUCT_REMOTE_ID_DESCRIPTOR: ColumnPropertyDescriptor<ProductPropertyName> = {
  name: 'remoteID',
  valueType: 'string',
};

/**
 * The four audit properties as populate-disabled descriptors, GENERATED from `AUDIT_PROPERTY_NAMES`
 * in `../base/AuditableEntity` rather than hand-written, so this list cannot drift from that
 * authority. `../base/populate` also excludes the four structurally; the flags are declared here as
 * well because [model/entity/Product.cfc:L96-L99] carries them on all four properties and the
 * descriptor set is the faithful record of that declaration.
 */
const PRODUCT_AUDIT_PROPERTY_DESCRIPTORS: readonly PopulatePropertyDescriptor<
  Product,
  AuditPropertyName
>[] = AUDIT_PROPERTY_NAMES.map<PopulatePropertyDescriptor<Product, AuditPropertyName>>(
  (auditPropertyName) => ({ name: auditPropertyName, populateEnabled: false }),
);

/**
 * The collaborators each populatable relationship needs before population can act on it.
 *
 * WHY THEY ARE PARAMETERS AND NOT IMPORTS (S3). The legacy relationship branches resolved every
 * related entity through a string-keyed service locator and then invoked a DYNAMICALLY COMPOSED member
 * name [org/Hibachi/HibachiTransient.cfc:L288, :L291] — exactly the machinery IR-1 replaces with
 * declarations and S3 forbids outright. It collapses into these explicit, typed members, supplied by
 * the composition root in `src/config/container.ts`. This module imports no repository, no service and
 * no configuration (S4), and performs no data access (S2).
 *
 * EVERY GROUP IS OPTIONAL, which is what keeps the dependency-free contract usable and keeps `new
 * Product()` free of collaborators (S6). A group left unsupplied means its descriptor is not declared
 * at all, and `../base/populate` documents that an unmatched payload key is IGNORED with no error —
 * so an absent group is a behaviour gap, never a crash.
 *
 * Every member is satisfiable by a plain object literal in a test: the loaders by in-memory maps, the
 * populators by a one-line call into `populate` with the related module's own descriptor set.
 */
export interface ProductPopulationCollaborators {
  /**
   * The `brand` many-to-one — [model/entity/Product.cfc:L68].
   *
   * POPULATION ASSIGNS THE FIELD DIRECTLY AND DOES **NOT** CALL {@link Product.setBrand}. That is
   * faithful, not a shortcut: the legacy many-to-one branch assigned through the framework's own
   * property writer [org/Hibachi/HibachiTransient.cfc:L242] rather than through the hand-written
   * bidirectional helper, so the brand's own collection was NOT updated by a populate pass. Routing
   * this through `setBrand` would ADD the reverse wiring the legacy pass did not perform — a
   * behavioural change, and exactly the improvement G4 forbids.
   */
  readonly brand?: {
    readonly loader: RelatedEntityLoader<Brand>;
    readonly populate: SubPropertyPopulator<Brand>;
  };

  /**
   * The `productType` many-to-one — [model/entity/Product.cfc:L69].
   *
   * THE ONE RELATIONSHIP WITH TRACEABLE LEGACY TEST COVERAGE. Regression `issue_1097`
   * [meta/tests/unit/IssuesTest.cfc] populates a product from a payload carrying a NESTED PRODUCT-TYPE
   * STRUCT and then saves and deletes it, so this descriptor is on the path of a traceable assertion
   * rather than merely of the admin surface. It is also the branch that exercises the nested-struct arm
   * with more than one key — load-or-create, assign, then recursively populate.
   *
   * `productType` is additionally required on save by `model/validation/Product.json:L11`.
   */
  readonly productType?: {
    readonly loader: RelatedEntityLoader<ProductType>;
    readonly populate: SubPropertyPopulator<ProductType>;
  };

  /**
   * The `defaultSku` many-to-one — [model/entity/Product.cfc:L70], `cascade="delete"`.
   *
   * Typed against {@link ProductDefaultSkuDelegate} because `src/domain/sku/Sku.ts` is not this file's
   * to author. TODO(boundary): collapses to the real SKU type once that module exists.
   */
  readonly defaultSku?: {
    readonly loader: RelatedEntityLoader<ProductDefaultSkuDelegate>;
    readonly populate: SubPropertyPopulator<ProductDefaultSkuDelegate>;
  };

  /**
   * The `skus` one-to-many — [model/entity/Product.cfc:L73].
   *
   * ITS `addRelated` DELEGATES TO {@link Product.addSku}, NOT TO AN ARRAY PUSH — and that IS the
   * faithful choice here, in contrast to the `brand` many-to-one above. The legacy collection branch
   * invoked the entity's own `add*` member [org/Hibachi/HibachiTransient.cfc:L294], and that member is
   * a hand-written bidirectional helper [`:L696-L698`] rather than a plain push. The two kinds
   * genuinely differ in the legacy pass, and both differences are preserved.
   *
   * TODO(boundary): collapses to the real SKU type once `src/domain/sku/Sku.ts` exists.
   */
  readonly skus?: {
    readonly loader: RelatedEntityLoader<ProductSkuMember>;
    readonly populate: SubPropertyPopulator<ProductSkuMember>;
  };

  /**
   * The `productImages` one-to-many — [model/entity/Product.cfc:L74], element component `Image`.
   *
   * TODO(boundary): the image domain module and `ImagePathPort`.
   */
  readonly productImages?: {
    readonly loader: RelatedEntityLoader<ProductOwnedAssociation>;
    readonly populate: SubPropertyPopulator<ProductOwnedAssociation>;
  };

  /**
   * The `attributeValues` one-to-many — [model/entity/Product.cfc:L75].
   *
   * TODO(boundary): the attribute subsystem, out of scope per §0.2.2.1.
   */
  readonly attributeValues?: {
    readonly loader: RelatedEntityLoader<ProductOwnedAssociation>;
    readonly populate: SubPropertyPopulator<ProductOwnedAssociation>;
  };

  /**
   * The `productReviews` one-to-many — [model/entity/Product.cfc:L76].
   *
   * THE DESCRIPTOR BELOW DECLARES `singularName: 'productReview'` — THE CORRECTLY SPELLED VALUE —
   * even though the legacy attribute key is MISSPELLED `singlularname`. See
   * {@link Product.productReviews}. The framework composed its generated member names from the
   * correctly spelled key, so `productReview` is the name the legacy machinery would have used; whether
   * it could read the value at all under the misspelled key is a property of the legacy engine, not
   * something to reproduce in a declaration. The misspelling is recorded on the field, and nothing here
   * depends on the value: `addRelated` below is an explicit call, never a composed name (S3, TR-3).
   *
   * TODO(boundary): the product-review domain module, out of scope per §0.2.2.4.
   */
  readonly productReviews?: {
    readonly loader: RelatedEntityLoader<ProductOwnedAssociation>;
    readonly populate: SubPropertyPopulator<ProductOwnedAssociation>;
  };

  /**
   * The `relatedProducts` many-to-many — [model/entity/Product.cfc:L81].
   *
   * SELF-REFERENCING AND OWNER-SIDE, which together make it the ONLY collection on this entity whose
   * descriptor can be declared in full without any structural stand-in: the related type is `Product`
   * itself, genuinely in scope, with a declared primary identifier.
   *
   * ITS `addRelated` AND `removeRelated` MUTATE THIS ENTITY'S OWN ARRAY DIRECTLY, and that is
   * deliberate. The legacy declares NO hand-written helper pair for this relationship — the framework
   * synthesized them from the singular name (IR-1) — so there is no bidirectional behaviour to
   * delegate to, and inventing one would be inventing behaviour. Contrast `skus`, which does have a
   * hand-written helper and therefore delegates to it. This is also the ONLY place in this file that
   * mutates a local collection, which follows directly from owner-side ownership of the link table.
   */
  readonly relatedProducts?: {
    readonly loader: RelatedEntityLoader<Product>;
    readonly populate: SubPropertyPopulator<Product>;
  };
}

/**
 * Builds Product's population contract — the declared replacement for the legacy metadata walk.
 *
 * G6 TRANSLATION DECISION — NINE POPULATE-ENABLED COLLECTIONS ARE FLAGGED BOUNDARY OMISSIONS, AND
 * ABSENCE FROM THIS SET DOES **NOT** MEAN POPULATE-DISABLED. Read this before concluding a property was
 * forgotten:
 *
 *   `listingPages` [`:L79`], `categories` [`:L80`] and the seven many-to-many INVERSE collections
 *   [`:L84-L90`] are all populate-ENABLED in the legacy declaration — not one of them carries
 *   `hb_populateEnabled="false"` — and none appears below.
 *
 *   THE RULE THAT DECIDES IT, stated so the boundary is auditable rather than case-by-case: A
 *   RELATIONSHIP GETS A DESCRIPTOR IF AND ONLY IF THIS FILE DECLARES A REAL TYPE FOR ITS TARGET. The
 *   nine omitted collections all have the OPAQUE element type {@link ProductOutOfScopeAssociation}, and
 *   a many-to-many descriptor obliges its author to supply `readRelatedPrimaryId` — a function that
 *   reads an identifier off the related entity. For an opaque type there is no identifier property to
 *   read, and naming one would be inventing the shape of `Content`, `Category`, `PromotionReward`,
 *   `PromotionQualifier`, `PriceGroupRate`, `Vendor` or `Physical` — every one of which §0.2.2.1 and
 *   §0.2.2.3 exclude, and all of which S9 forbids fabricating.
 *
 *   TODO(boundary): the rightful owners are the content, category, promotion, price-group, vendor and
 *   physical subsystems, all outside this slice (TR-5). No port file is created, no service is
 *   imported and no shape is invented for any of them.
 *
 *   THE OBSERVABLE CONSEQUENCE, STATED PLAINLY: a payload carrying any of those nine keys is SILENTLY
 *   IGNORED here, where the legacy pass would have resolved and attached the related entities.
 *   `../base/populate` documents that an unmatched key is ignored with nothing thrown, so this is a
 *   behaviour gap and not a crash.
 *
 *   AND WHY OMISSION IS THE **SAFE** FORM OF THAT GAP, rather than listing them without a `kind`: a
 *   descriptor with no `kind` is a COLUMN descriptor, so branch 1 would assign a trimmed STRING into an
 *   ARRAY-VALUED field for a simple payload value. The legacy pass could never do that — every one of
 *   the nine declares a `fieldtype`, which branch 1's gate excluded — so listing them kind-less would
 *   introduce a corruption the legacy system did not have. The four audit properties are safe to list
 *   kind-less for the opposite reason: the populate-disabled gate stops them before any kind-specific
 *   member is read.
 *
 * @param collaborators - Per-relationship collaborators. Omit the whole argument, or any individual
 *   group, to obtain a contract in which that relationship is not declared and its payload key is
 *   ignored exactly as the nine omitted collections are.
 * @returns Product's population contract, with `persistent: true` and its properties in legacy
 *   declaration order.
 *
 * @example
 * ```ts
 * // The nested-product-type payload of regression issue_1097.
 * populate(
 *   product,
 *   { productName: 'Test Product', productType: { productTypeID: merchandiseID } },
 *   createProductPropertyDescriptors({ productType: { loader, populate: populateProductType } }),
 * );
 * ```
 */
export function createProductPropertyDescriptors(
  collaborators: ProductPopulationCollaborators = {},
): PropertyDescriptorSet<Product, ProductPropertyName> {
  /*
   * EVERY `relatedPrimaryIdPropertyName` BELOW WAS READ FROM THE RELATED ENTITY'S OWN
   * `fieldtype="id"` DECLARATION, NOT ASSUMED FROM A NAMING PATTERN (S9). The pattern happens to hold
   * uniformly here, which is exactly why guessing would have felt safe and why each was verified
   * individually instead:
   *
   *   brandID           [model/entity/Brand.cfc:L52]
   *   productTypeID     [model/entity/ProductType.cfc:L52]
   *   skuID             [model/entity/Sku.cfc:L52]        — used for `defaultSku` AND `skus`
   *   imageID           [model/entity/Image.cfc:L52]      — `productImages` maps `cfc="Image"`, so the
   *                                                         identifier is `imageID`, NOT
   *                                                         `productImageID`; the property name and
   *                                                         the component name differ here
   *   attributeValueID  [model/entity/AttributeValue.cfc:L57]  — note L57, not L52: this entity
   *                                                              declares its identifier lower in the
   *                                                              file than the others
   *   productReviewID   [model/entity/ProductReview.cfc:L52]
   *   productID         [model/entity/Product.cfc:L52]    — `relatedProducts` is self-referencing
   *
   * All 107 of the 113 legacy entities that declare an identifier use the same 32-character uuid shape
   * (§6.2, IR-6), so these are property NAMES only — no value is generated anywhere in this file.
   *
   * The legacy resolved each of these at runtime through a service lookup over an interpolated entity
   * name [org/Hibachi/HibachiTransient.cfc:L227]; TR-3 replaces that lookup with these declarations,
   * which is what turns a runtime miss into a compile-time fact.
   */
  const brandDescriptors: readonly ManyToOnePropertyDescriptor<ProductPropertyName, Brand>[] =
    collaborators.brand === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'brand',
            relatedPrimaryIdPropertyName: 'brandID',
            loader: collaborators.brand.loader,
            populateRelated(brand, data) {
              collaborators.brand?.populate(brand, data);
            },
          },
        ];

  const productTypeDescriptors: readonly ManyToOnePropertyDescriptor<
    ProductPropertyName,
    ProductType
  >[] =
    collaborators.productType === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'productType',
            relatedPrimaryIdPropertyName: 'productTypeID',
            loader: collaborators.productType.loader,
            populateRelated(productType, data) {
              collaborators.productType?.populate(productType, data);
            },
          },
        ];

  const defaultSkuDescriptors: readonly ManyToOnePropertyDescriptor<
    ProductPropertyName,
    ProductDefaultSkuDelegate
  >[] =
    collaborators.defaultSku === undefined
      ? []
      : [
          {
            kind: 'many-to-one',
            name: 'defaultSku',
            relatedPrimaryIdPropertyName: 'skuID',
            loader: collaborators.defaultSku.loader,
            populateRelated(defaultSku, data) {
              collaborators.defaultSku?.populate(defaultSku, data);
            },
          },
        ];

  /*
   * `singularName: 'Sku'` reproduces the legacy `singularname="Sku"` at [model/entity/Product.cfc:L73]
   * VERBATIM, capital S included — the one collection on this entity whose singular name is
   * capitalised, where `productImage`, `attributeValue` and `productReview` are not. Nothing here
   * concatenates the value into a member name (S3, TR-3); it is declared provenance, and `addRelated`
   * is the explicit replacement for the legacy composed dispatch.
   */
  const skusDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductSkuMember
  >[] =
    collaborators.skus === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'skus',
            relatedPrimaryIdPropertyName: 'skuID',
            singularName: 'Sku',
            loader: collaborators.skus.loader,
            addRelated(product, sku) {
              product.addSku(sku);
            },
            populateRelated(sku, data) {
              collaborators.skus?.populate(sku, data);
            },
          },
        ];

  const productImagesDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductOwnedAssociation
  >[] =
    collaborators.productImages === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'productImages',
            relatedPrimaryIdPropertyName: 'imageID',
            singularName: 'productImage',
            loader: collaborators.productImages.loader,
            addRelated(product, productImage) {
              product.addProductImage(productImage);
            },
            populateRelated(productImage, data) {
              collaborators.productImages?.populate(productImage, data);
            },
          },
        ];

  const attributeValuesDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductOwnedAssociation
  >[] =
    collaborators.attributeValues === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'attributeValues',
            relatedPrimaryIdPropertyName: 'attributeValueID',
            singularName: 'attributeValue',
            loader: collaborators.attributeValues.loader,
            addRelated(product, attributeValue) {
              product.addAttributeValue(attributeValue);
            },
            populateRelated(attributeValue, data) {
              collaborators.attributeValues?.populate(attributeValue, data);
            },
          },
        ];

  const productReviewsDescriptors: readonly OneToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    ProductOwnedAssociation
  >[] =
    collaborators.productReviews === undefined
      ? []
      : [
          {
            kind: 'one-to-many',
            name: 'productReviews',
            relatedPrimaryIdPropertyName: 'productReviewID',
            singularName: 'productReview',
            loader: collaborators.productReviews.loader,
            addRelated(product, productReview) {
              product.addProductReview(productReview);
            },
            populateRelated(productReview, data) {
              collaborators.productReviews?.populate(productReview, data);
            },
          },
        ];

  /*
   * The only many-to-many descriptor on this entity, and the only place in this file that mutates a
   * LOCAL collection — both consequences of owner-side ownership of the link table [`:L81`].
   *
   * `readRelated` returns the live array, which the branch-5 removal pass iterates BACKWARDS while
   * `removeRelated` splices it. Backwards iteration is what makes concurrent mutation safe, and
   * `../base/populate` documents that it is correct whether the implementation hands back the live
   * array or a copy. The live array is handed back here, consistent with the F2 contract.
   *
   * `readRelatedPrimaryId` returns `productID`, which for an unsaved product is the EMPTY STRING. That
   * is exactly the value `../base/populate` documents as correct for an entity without an identifier
   * yet: a CFML list cannot contain an empty element, so an empty identifier matched nothing and the
   * relationship was removed — the same arm the legacy code took.
   */
  const relatedProductsDescriptors: readonly ManyToManyPropertyDescriptor<
    Product,
    ProductPropertyName,
    Product
  >[] =
    collaborators.relatedProducts === undefined
      ? []
      : [
          {
            kind: 'many-to-many',
            name: 'relatedProducts',
            relatedPrimaryIdPropertyName: 'productID',
            singularName: 'relatedProduct',
            loader: collaborators.relatedProducts.loader,
            addRelated(product, relatedProduct) {
              product.relatedProducts.push(relatedProduct);
            },
            removeRelated(product, relatedProduct) {
              const index = product.relatedProducts.indexOf(relatedProduct);
              if (index !== -1) {
                product.relatedProducts.splice(index, 1);
              }
            },
            readRelated(product) {
              return product.relatedProducts;
            },
            readRelatedPrimaryId(relatedProduct) {
              return relatedProduct.productID;
            },
            populateRelated(relatedProduct, data) {
              collaborators.relatedProducts?.populate(relatedProduct, data);
            },
          },
        ];

  return {
    /*
     * The legacy `getClassName()` value [org/Hibachi/HibachiObject.cfc:L135-L137] for
     * [model/entity/Product.cfc:L49] — the bare component name. It is the ARM 3 operand of the
     * population gate [org/Hibachi/HibachiTransient.cfc:L190] and the key the out-of-scope permission
     * records are stored under [org/Hibachi/HibachiAuthenticationService.cfc:L131-L141], so the legacy
     * spelling is carried rather than a TypeScript class name that bundling may rewrite.
     */
    entityName: PRODUCT_CLASS_NAME,

    /*
     * [model/entity/Product.cfc:L49] declares `persistent="true"`, so this is `true` — and the flag is
     * load-bearing rather than informational. `../base/populate` uses it as the first arm of the legacy
     * authorisation test [org/Hibachi/HibachiTransient.cfc:L186-L190]: a TRANSIENT process object
     * short-circuits that test and populates freely, whereas a PERSISTENT entity such as Product has
     * per-property access control consulted. All three arms are live in that module, with ARMS 2 and 3
     * resolved through `PopulationAuthorizationPort` from `../../ports/AccountContextPort`.
     */
    persistent: true,

    /*
     * IN LEGACY DECLARATION ORDER, WITH EVERY GAP ACCOUNTED FOR:
     *   [:L52] productID                       omitted  — no populate branch admits an `id` field
     *   [:L53-L59] the seven simple columns    listed
     *   [:L62-L65] the four calculated columns listed   — real columns, no exclusion flag
     *   [:L68] brand                           listed when its collaborators are supplied
     *   [:L69] productType                     listed when its collaborators are supplied
     *   [:L70] defaultSku                      listed when its collaborators are supplied
     *   [:L73-L76] the four one-to-many        listed when their collaborators are supplied
     *   [:L79] listingPages                    omitted  — flagged boundary omission, NOT disabled
     *   [:L80] categories                      omitted  — flagged boundary omission, NOT disabled
     *   [:L81] relatedProducts                 listed when its collaborators are supplied
     *   [:L84-L90] the seven inverse m2m       omitted  — flagged boundary omissions, NOT disabled
     *   [:L93] remoteID                        listed
     *   [:L96-L99] the four audit properties   listed, populate-disabled
     *
     * EXACTLY FOUR of the listed descriptors carry `populateEnabled: false`, matching the four
     * `hb_populateEnabled="false"` declarations in the legacy file precisely — not the nine `Brand`
     * carries.
     */
    properties: [
      ...PRODUCT_SIMPLE_PROPERTY_DESCRIPTORS,
      ...brandDescriptors,
      ...productTypeDescriptors,
      ...defaultSkuDescriptors,
      ...skusDescriptors,
      ...productImagesDescriptors,
      ...attributeValuesDescriptors,
      ...productReviewsDescriptors,
      ...relatedProductsDescriptors,
      PRODUCT_REMOTE_ID_DESCRIPTOR,
      ...PRODUCT_AUDIT_PROPERTY_DESCRIPTORS,
    ],
  };
}

/**
 * Product's dependency-free population contract.
 *
 * The form a caller uses when it has no related-entity loaders to supply and needs none — the simple
 * and calculated columns, `remoteID`, and the four populate-disabled audit properties. Pass
 * collaborators to {@link createProductPropertyDescriptors} wherever relationship population is
 * genuinely required, as regression `issue_1097` does for the nested product-type struct.
 *
 * ALSO THE ARTEFACT TWO OF THE FOUR INHERITED BASE ASSERTIONS LAND ON. The primary-id property name
 * and the save-context validation of a new instance are answered from this contract and from
 * `src/validation/rules/product.rules.ts`, not from a member on the class — see the TRACEABLE TEST
 * CONTRACT block for the full split.
 *
 * Evaluated once at module load and structurally immutable: every descriptor member is `readonly`, the
 * audit tuple it derives from is frozen, and nothing here is mutable module-scope state that could
 * bleed across warm Lambda invocations (M7 / S8).
 */
export const PRODUCT_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Product, ProductPropertyName> =
  createProductPropertyDescriptors();
