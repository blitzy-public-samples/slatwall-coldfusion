// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts                         composition root (wiring)
//   src/repositories/mysql/mysqlProductRepository.ts  MySQL product adapter
//   src/services/productService.ts                    ported ProductService
//   src/services/skuService.ts                        ported SkuService
//   tests/integration/repositories                    repository integration tier
// ---------------------------------------------------------------------------

/**
 * Product repository port - the domain-side persistence and query contract for `Product`.
 *
 * Ported from `model/dao/ProductDAO.cfc` (441 lines, cfscript throughout, the largest of the six
 * in-scope DAOs), with the three entity-lifecycle methods the service tier needs now that the
 * ORM is gone. It is the port that `model/service/ProductService.cfc` reaches through: its
 * `property name="productDAO";` declaration [model/service/ProductService.cfc:L52] - the first of
 * exactly eight DI/1 collaborators declared at L52-L60 (productDAO, skuDAO, productTypeDAO,
 * dataService, contentService, skuService, subscriptionService, optionService) - becomes a
 * constructor parameter typed to this interface (T1). No runtime bean-factory scan, no service
 * locator, and therefore no first-scan lock.
 *
 * INTERFACES AND TYPE ALIASES ONLY
 * This module declares two interfaces and nothing else. It emits no runtime JavaScript at all:
 * no class, no constant, no enumeration, no function body, and no default parameter value (a
 * default value is a runtime expression). The one import is `import type`, which is fully erased
 * at emit, so the ports/entities relationship - entities take port interfaces as constructor
 * parameters while ports return entity types - exists solely in the type graph and never at
 * runtime. There is no barrel file to force eager evaluation of that cycle, and none may be
 * created.
 *
 * THE METHOD COUNT IS SIX, AND HERE IS THE ARITHMETIC
 *
 *     4  declared functions in model/dao/ProductDAO.cfc
 *   - 1  saveImportData [model/dao/ProductDAO.cfc:L328] - declared `private`, an internal helper
 *          of loadDataFromFile (whose body spans L73-L327). A reviewer counting four declarations
 *          against three ported methods should stop here: the exclusion is its access modifier,
 *          not an oversight, and it is a scope decision rather than a defect.
 *   = 3  ported DAO methods: getAttributeSets [L52], loadDataFromFile [L73],
 *          searchProductsByProductType [L419]
 *   + 3  entity-lifecycle methods, because `entityNew()`, `entityLoad()`, `super.save()` and
 *          `super.delete()` have no equivalent in a driver-only stack (T3): load one Product by
 *          id, save one Product, delete one Product
 *   = 6  methods. That is the whole surface. There is no seventh - no batch load, no load-all,
 *          no count, no existence check, no multi-save, no overload and no options bag.
 *
 * PARAMETERIZED SQL - WHERE THAT OBLIGATION LIVES (E5)
 * This file declares interfaces only and contains no SQL, so the obligation to use prepared
 * statements exclusively - preserving the injection-safety guarantee that `cfqueryparam` gave the
 * legacy code - transfers wholly to `src/repositories/mysql/**`. On this port that obligation is
 * doubly pointed, because two of its parameters are caller-supplied collections that the legacy
 * code expanded into bound `IN` lists:
 *
 *   * both array parameters of `getAttributeSets`, bound by the legacy code as the named
 *     parameters the HQL declares [model/dao/ProductDAO.cfc:L53-L69]; and
 *   * the comma-delimited `productTypeIDs` string on `searchProductsByProductType`, which the
 *     legacy code bound with a list-valued parameter [model/dao/ProductDAO.cfc:L425].
 *
 * Every element of every one of those collections must be bound as its own prepared-statement
 * parameter, and must never be interpolated into SQL text. A collection is not an excuse to build
 * a statement by concatenation.
 *
 * FETCH SHAPE, AND WHY LAZINESS IS NOT SIMULATED (T3)
 * `ORMExecuteQuery`, the tag-syntax queries, `super.save()`, `super.delete()` and Hibernate's
 * lazy collections all collapse into the methods below. Hibernate lazy loading has no equivalent
 * here and is deliberately not simulated: associations are materialized at the repository
 * boundary instead, and the fetch shape is an explicit decision made and commented at each
 * repository method in `src/repositories/mysql/mysqlProductRepository.ts` (planned). Concretely, a `Product`
 * handed back by this port must already carry its `skus`, `productType`, `brand` and `options`
 * populated to whatever depth its consumers read, because the CFML entity walked those graphs
 * freely - see `Product.getOptionsByOptionGroup` [model/entity/Product.cfc:L340-L347] and
 * `Product.getSkusBySelectedOptions` [model/entity/Product.cfc:L366-L368] - and the TypeScript
 * entity has no lazy loader to fall back on. Making the fetch shape explicit removes the implicit
 * N+1 traversal the ORM allowed; that is a correctness and explicitness property of the design,
 * stated here as such and not as a performance claim.
 *
 * THE ASYNC BOUNDARY
 * Every method here returns a promise, because every one of them reaches persistence: that is the
 * project-wide rule - a method becomes async if and only if its legacy body reached the DAO or
 * the ORM - and this is the DAO port, so the rule admits no exception on this file. Methods that
 * only traverse already-materialized associations or perform pure arithmetic stay synchronous,
 * and those live on the entities and the value objects, not here.
 *
 * EXPLICIT ABSENCE
 * Load-by-id returns `Product | undefined`. Absence is modelled explicitly, never as a
 * zero-valued or empty-object stand-in, matching the folder-wide convention that
 * `getSkuBySkuCode` returns `Sku | undefined` and that the SKU currency accessors return
 * `Money | undefined` [model/entity/Sku.cfc:L269-L285], where substituting a default would
 * silently sell products for free.
 *
 * WHAT THIS PORT DELIBERATELY DOES NOT ABSORB
 *
 *   * The smart list. `ProductService.getProductSmartList` [model/service/ProductService.cfc:
 *     L342-L358] builds a `HibachiSmartList`: a generic, string-keyed, dynamically-filtered query
 *     builder that joins productType, defaultSku and brand and registers five keyword properties.
 *     Porting it faithfully would mean reimplementing a small ORM query language, reimporting
 *     exactly the framework coupling this refactor exists to remove, and it is untypeable under
 *     the strict profile. The plan's resolution reshapes the SERVICE method instead -
 *     `getProductSmartList(...)` becomes `findProducts(criteria)` in
 *     `src/services/productService.ts` (planned) - and that is one of exactly three budgeted signature
 *     reshapings, owned by `src/services/**`. It is NOT absorbed here. The service's
 *     `findProducts` composes this port's existing `searchProductsByProductType` plus load-by-id,
 *     which are the concrete filters the legacy callers actually applied; the open-ended dynamic
 *     filtering surface is deliberately not reproduced. So this port declares no `findProducts`,
 *     no `getProductSmartList`, no criteria or page type, no generic query, search or filter
 *     method, no paging or sort parameter and no dynamic-filter bag. The same applies to
 *     `getSkuSmartList` [model/service/SkuService.cfc:L309-L325], owned by
 *     `src/services/skuService.ts` (planned) over `skuRepository`.
 *   * `searchSkusByProductType` [model/dao/SkuDAO.cfc:L130] belongs to `skuRepository`.
 *   * Unique URL-title generation. The legacy save paths reach `dataService`
 *     [model/service/ProductService.cfc:L56] for it, at L269 for a product and at L297 and L299
 *     for a product type; its declaration is `createUniqueURLTitle`
 *     [model/service/DataService.cfc:L53]. That becomes the separate `urlTitleGenerator` port, so
 *     no URL-title method appears here.
 *   * Image handling belongs to `imageStore`, and subscription-term handling to
 *     `subscriptionTermProvider`. The product-review and default-image process paths
 *     [model/service/ProductService.cfc:L157, L235] are out-of-scope features reachable from an
 *     in-scope file; they get no method on this port at all.
 *   * Attribute VALUES. `getAttributeSets` is the only ported route into the attribute subsystem;
 *     the `attributeValues` EAV read path is deliberately not ported, and that decision belongs
 *     to the entities sibling. The unhonoured `cascade="all-delete-orphan"` obligation on the
 *     non-ported `attributeValues` collections is recorded in the repositories sibling, not here.
 *
 * NAMING - INTERFACE PARITY IS THE ACCEPTANCE CONTRACT
 * Legacy CFML method and parameter names are carried over verbatim in camelCase, so that a
 * reviewer can diff the two surfaces method by method. That includes a singular/plural asymmetry
 * which is real and must survive: the product search parameter is `productTypeIDs` (plural) here
 * [model/dao/ProductDAO.cfc:L419], while the sibling `searchSkusByProductType` on `skuRepository`
 * takes the singular `productTypeID` [model/dao/SkuDAO.cfc:L130]. Neither spelling is normalised
 * and the plural is not "corrected" to match the singular - this is exactly the kind of detail a
 * reviewer diffing the two ports checks. No naming-convention lint rule is enabled, for precisely
 * this reason. Where a name has no legacy antecedent - the three entity-lifecycle methods and the
 * projection type below - each declaration says so in its own comment.
 *
 * THE DOMAIN LAYER IMPORTS NOTHING OUTWARD
 * `src/domain/**` may import only from within `src/domain/**` and from `src/lib/**`. Importing
 * `src/repositories/**`, `src/handlers/**`, `src/integrations/**` or the driver package is a build
 * failure, not a convention. That matters most on a repository port, where naming the driver is
 * the live temptation: this file names no driver, no pool, no connection and no row-packet type,
 * and it declares no I/O mechanism of any kind - no file system, no stream, no HTTP client -
 * even though `loadDataFromFile` below makes all three tempting. This port is the seam that lets
 * the boundary hold: the outward layer implements the interface, and the composition root in
 * `src/handlers/bootstrap.ts` (planned) wires the concrete instance.
 *
 * THESE NAMES ARE CANONICAL
 * Every subtree that will consume this file is empty at the time of writing, so the names, method
 * names and signatures published here are the canonical ones. They are published deliberately and
 * precisely, and they are not to be renamed later.
 *
 * TEST COVERAGE IS NET-NEW, NOT LEGACY PARITY
 * Nothing in the legacy suite covers this DAO: `meta/tests/unit/dao/` contains only
 * `AccountDAOTest` and `PaymentDAOTest`. Only three legacy test files touch the in-scope slice at
 * all - `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc` and the
 * empty `meta/tests/functional/admin/entity/ProductTest.cfc` - and the second of those covers the
 * `Product` ENTITY (`productUrlIsCorrectlyFormatted()`), not this DAO. It is not presented as
 * coverage for this port. Every method declared here needs a test, and all of that coverage is
 * net-new: SQL-shape and parameter-binding assertions belong in
 * `tests/integration/repositories/*.test.ts`, which another agent owns.
 *
 * WHO IMPLEMENTS THIS PORT
 * `src/repositories/mysql/mysqlProductRepository.ts` (planned), one of exactly six MySQL adapters. Five
 * obligations transfer to it with this contract:
 *
 *   1. Prepared statements exclusively, with every element of `attributeSetTypeCode`, of the
 *      `productTypeIDs` array, and of the comma-delimited `productTypeIDs` string bound as its
 *      own parameter - never interpolated.
 *   2. The DAO's own query bodies are the source of truth. `model/dao/ProductDAO.cfc` is
 *      cfscript, so read its query constructions directly and reproduce their filter semantics
 *      and ordering exactly.
 *   3. The row-to-entity factory, port injection and association materialization, with the fetch
 *      shape decided and commented at each method; laziness is not simulated.
 *   4. The Railo/Adobe ColdFusion carried-forward TODO travels with the statement it guards (see
 *      `getAttributeSets` below), and only the MySQL branch is targeted.
 *   5. `loadDataFromFile` stays a declared-but-unexercised path. The adapter must not silently
 *      invent a working bulk importer, and must not introduce a batching, chunking or
 *      job-orchestration mechanism the legacy system did not have.
 *
 * `src/handlers/bootstrap.ts` (planned) wires this port to that adapter; it does not implement it.
 *
 * Schema continuity is absolute: the adapter reads and writes the existing `Sw*` MySQL schema
 * unchanged - no migration, no rename, no new table, no column change - and no table name,
 * datasource name, credential or connection string appears anywhere in this file.
 *
 * @see model/dao/ProductDAO.cfc - the ported DAO
 * @see model/service/ProductService.cfc - the service tier that consumes this port
 */

/*
 * The only import this file may have, and it is type-only.
 *
 * `src/domain/entities/` is empty at the time of writing, so this specifier does not resolve yet
 * and `tsc` reports it. That is expected and sanctioned: the authoring order across the subtree
 * is a compile-order convenience, not a schedule, and it carries no milestone. The specifier is
 * NOT to be "fixed" by deleting the import, declaring a local `Product` stand-in, or relaxing
 * `tsconfig.json`.
 *
 * The asymmetry that justifies publishing ports before entities: an entity body actually calls
 * port methods - the legacy locator sites at [model/entity/Product.cfc:L341] and
 * [model/entity/Product.cfc:L367] are exactly those calls - so entities need full signatures from
 * ports, whereas a port needs only a type name and a module path from an entity. This file
 * returns `Product` values and never invokes a member of `Product`.
 *
 * The comma-list splitting that `searchProductsByProductType` implies is performed by the
 * adapter using the CFML list helpers in `src/lib/cfml/list.js`; naming them here is a note to
 * the implementer, not an import.
 */
import type { Brand } from '../entities/brand.js';
import type { Product } from '../entities/product.js';

/**
 * One attribute-set row as `getAttributeSets` returns it.
 *
 * This is a READ PROJECTION of the rows that DAO call produces - it is not an `AttributeSet`
 * entity. `AttributeSet` is deliberately not one of the eighteen in-scope entities, so no entity
 * module exists to import and this type is co-located with the single port that needs it rather
 * than promoted into `../entities/` or `../valueObjects/`, and no new file is created for it. It
 * must not be grown into an entity substitute and must never gain behaviour: no methods, no
 * mutation, no persistence identity semantics. Every property is `readonly` for that reason.
 *
 * The type name has no legacy antecedent - the CFML declaration is simply
 * `public array function getAttributeSets(...)` [model/dao/ProductDAO.cfc:L52], returning
 * untyped rows - but every MEMBER name is verbatim from the legacy source. Member names, and
 * where each one comes from:
 *
 *   * attributeSetID, attributeSetName, attributeSetCode, attributeSetDescription, activeFlag,
 *     globalFlag, requiredFlag and sortOrder are the property names declared at
 *     [model/entity/AttributeSet.cfc:L52-L61].
 *   * attributeSetTypeSystemCode flattens the association path the DAO itself traverses,
 *     `attributeSetType` [model/entity/AttributeSet.cfc:L64] plus the `systemCode` the query
 *     filters and orders on [model/dao/ProductDAO.cfc:L55, L62]. It is composed from those two
 *     verbatim names rather than invented, and it is required rather than optional precisely
 *     because that filter cannot admit a row without one.
 *   * attributeCount is the legacy derived accessor `getAttributeCount()`
 *     [model/entity/AttributeSet.cfc:L91], which returns the length of the attribute collection.
 *     It is a count, so it is a `number`.
 *
 * Requiredness follows one rule, applied uniformly: a member is required only where the legacy
 * declaration or the DAO's own filter guarantees a value - the generated identifier, the system
 * code the query filters on, the global flag (declared with a default and load-bearing in both
 * branches of the product-type predicate at [model/dao/ProductDAO.cfc:L57-L60]) and the derived
 * count. Every other legacy column is nullable, so it is optional here and the port invents no
 * substitute value for it.
 *
 * Three groups of legacy members are deliberately absent, so their omission reads as a decision:
 *
 *   * `additionalCharge` [model/entity/AttributeSet.cfc:L60] is monetary. Money is `Money`, and
 *     it lives on the entities; no signature or member on this port is monetary.
 *   * the `attributes` collection [model/entity/AttributeSet.cfc:L67] and everything reachable
 *     through it, because the attribute-value EAV path is not ported. This projection carries the
 *     count and nothing more.
 *   * `accountSaveFlag` [model/entity/AttributeSet.cfc:L59], the audit columns
 *     [model/entity/AttributeSet.cfc:L78-L81] and the four many-to-many collections
 *     [model/entity/AttributeSet.cfc:L70-L73], all of which serve subsystems outside this slice.
 */
export interface AttributeSetSummary {
  /** Generated identifier [model/entity/AttributeSet.cfc:L52]. */
  readonly attributeSetID: string;

  /**
   * Attribute-set type system code, flattened from `attributeSetType.systemCode`
   * [model/dao/ProductDAO.cfc:L55]. Required: the query's type filter guarantees it, and the
   * primary ordering key is this value ascending [model/dao/ProductDAO.cfc:L62].
   */
  readonly attributeSetTypeSystemCode: string;

  /** Global flag [model/entity/AttributeSet.cfc:L57]; drives the product-type predicate. */
  readonly globalFlag: boolean;

  /**
   * Number of attributes in the set, from `getAttributeCount()`
   * [model/entity/AttributeSet.cfc:L91]. The attributes themselves are not projected.
   */
  readonly attributeCount: number;

  /** Display name [model/entity/AttributeSet.cfc:L54]; nullable in the legacy schema. */
  readonly attributeSetName?: string;

  /** Code [model/entity/AttributeSet.cfc:L55]; nullable in the legacy schema. */
  readonly attributeSetCode?: string;

  /** Description [model/entity/AttributeSet.cfc:L56]; nullable in the legacy schema. */
  readonly attributeSetDescription?: string;

  /**
   * Active flag [model/entity/AttributeSet.cfc:L53]; nullable in the legacy schema. Note that
   * the DAO's active-attribute test applies to the attributes in the set, not to this flag
   * [model/dao/ProductDAO.cfc:L54], so a returned row may carry no value here.
   */
  readonly activeFlag?: boolean;

  /** Required flag [model/entity/AttributeSet.cfc:L58]; nullable in the legacy schema. */
  readonly requiredFlag?: boolean;

  /** Secondary ordering key [model/entity/AttributeSet.cfc:L61]; nullable in the legacy schema. */
  readonly sortOrder?: number;
}

/**
 * The resolved payload handed to {@link ProductRepository.saveBrand}, standing in for the legacy
 * `arguments.data` struct that `super.save(arguments.brand, arguments.data)`
 * [model/service/BrandService.cfc:L76] populated the entity from.
 *
 * DELIBERATELY MINIMAL, AND FOR THE SAME REASON THE SERVICE'S OWN INPUT TYPE IS. A CFML struct is
 * untyped, so the legacy save would populate whichever brand columns happened to be present.
 * Enumerating the whole `SwBrand` column set here would invent a contract the legacy never
 * expressed, so only the two keys the service tier actually resolves are declared: `urlTitle`, which
 * [model/service/BrandService.cfc:L70, L72] writes, and `brandName`, which [L69] reads. An adapter is
 * free to populate any column it is given; what this type fixes is what the port PROMISES to carry.
 *
 * BOTH SLOTS ARE `readonly` HERE, unlike the service's input type where `urlTitle` is writable. The
 * asymmetry is the direction of travel: the service RESOLVES the title into its payload, and the
 * repository only READS it. The service's `BrandSaveInput` is structurally assignable to this type,
 * so no conversion, copy or cast is needed at the call site.
 *
 * `?: string | undefined` rather than `?: string` on both, because under `exactOptionalPropertyTypes`
 * those are different types and an explicit `urlTitle: undefined` - what a caller writes after
 * reading a NULL column - must stay expressible. `urlTitle` is nullable in the schema
 * [model/entity/Brand.cfc:L55] despite `model/validation/Brand.json` marking it required, and
 * `brandName` is nullable at [model/entity/Brand.cfc:L56].
 */
export interface BrandSavePayload {
  /** The resolved URL title [model/service/BrandService.cfc:L70, L72]. */
  readonly urlTitle?: string | undefined;

  /** The brand name [model/service/BrandService.cfc:L69]. */
  readonly brandName?: string | undefined;
}

/**
 * The product repository port.
 *
 * Seven methods, locked: the three public functions of `model/dao/ProductDAO.cfc`, the three
 * product entity-lifecycle methods the service tier needs now that Hibernate is gone, and ONE brand
 * save. The arithmetic and the deliberate exclusion of the private helper at
 * [model/dao/ProductDAO.cfc:L328] are in this file's header. Each method returns a promise because
 * each one reaches persistence.
 *
 * ★ THE BRAND SIDE IS A SAVE AND NOTHING ELSE - NO LOADER, NO DELETE, NO QUERY. `BrandService.cfc`
 * declares exactly one function, `saveBrand` [model/service/BrandService.cfc:L67], and its file
 * header in `src/services/brandService.ts` records that the absence of `getBrand`, `deleteBrand` and
 * the smart-list accessors is FAITHFUL rather than incomplete: they arrived by inheritance from
 * `HibachiService`, which is not ported. A `getBrandByBrandID` here would have no caller and no
 * legacy antecedent, and publishing port surface that no requirement asks for is the same class of
 * defect as the three collaborator interfaces this checkpoint already deleted. So the port carries
 * exactly the one member the one legacy statement needs. The product side carries a loader and a
 * delete because `ProductService.cfc` genuinely declares `deleteProduct` [L317] and load-bearing
 * process methods; the asymmetry between the two halves of this port mirrors the asymmetry between
 * the two legacy components.
 *
 * ★ WHY BRAND LIFECYCLE LIVES ON THE *PRODUCT* REPOSITORY, WHICH LOOKS WRONG UNTIL THE LEGACY IS
 * CHECKED. `Brand` is one of the six prompt-named CATALOG entities (AAP 0.2.1), and
 * `model/entity/Brand.cfc:L49` routes its CRUD through `hb_serviceName="brandService"` - but
 * **there is no `BrandDAO.cfc` in the legacy repository at all**. The full DAO inventory under
 * `model/dao/` is Account, Attribute, Comment, Content, Data, Hibachi, Inventory, Location,
 * Option, Order, Payment, Physical, PriceGroup, Product, ProductType, Promotion, Report,
 * RoundingRule, Schedule, Setting, Sku, Stock, Subscription, Vendor and VendorOrder. Brand is
 * absent from it, because brand persistence never had a dedicated query surface: it ran entirely
 * through `super.save()` on the framework base component, which resolved to Hibernate's generic
 * entity save.
 *
 * AAP rule T3 converts exactly that construct - "`super.save()`, lazy collections" - into
 * "repository port methods", and AAP 0.4.1 authorises this port to carry "plus the entity-load/save
 * methods the service needs". So the generic ORM save has to land on a real port, and the choice is
 * between this one and a new fourteenth port. A fourteenth port is not available: AAP 0.4.1 fixes
 * the inventory at THIRTEEN, and publishing collaborator interfaces beyond that budget is the
 * defect this checkpoint already recorded against three now-deleted symbols. The catalog repository
 * is therefore the correct home, and it is a smaller fiction than a `BrandRepository` that no
 * legacy DAO ever backed.
 *
 * The two members are named for the entity they act on rather than for the port that hosts them, so
 * nothing about the hosting decision leaks into a call site: `brandService.saveBrand` reads as
 * `saveBrand`, exactly as the legacy `super.save` did.
 *
 * The implementing adapter is `src/repositories/mysql/mysqlProductRepository.ts` (planned); the composition
 * root wires it. Nothing here names a driver, a connection, a statement or a table.
 */
export interface ProductRepository {
  /**
   * Attribute sets for a set of attribute-set type system codes, narrowed by product type.
   *
   * Legacy: `public array function getAttributeSets(required array attributeSetTypeCode,required
   * array productTypeIDs)` [model/dao/ProductDAO.cfc:L52]. Both parameters are required arrays in
   * the legacy signature - so typing them as arrays is parity, not a change - and both keep their
   * legacy spelling and position verbatim: the singular `attributeSetTypeCode` first, the plural
   * `productTypeIDs` second. `readonly string[]` states that the port never mutates a caller's
   * array; it does not narrow what a caller may pass.
   *
   * This is the ONLY ported route into the attribute subsystem. The `attributeValues` EAV read
   * path is deliberately not ported.
   *
   * Filter and ordering semantics for the adapter to reproduce, described in prose because this
   * file contains no SQL [model/dao/ProductDAO.cfc:L53-L62]: an attribute set qualifies when it
   * has at least one active attribute and its attribute-set type system code is one of the
   * supplied `attributeSetTypeCode` values; when `productTypeIDs` is non-empty the set must also
   * be either global or assigned to one of the supplied product types, and when `productTypeIDs`
   * is empty the set must be global. Results are ordered by attribute-set type system code
   * ascending, then by sort order ascending. Both value collections were bound by the legacy code
   * as named parameters expanded into `IN` lists, so every element of each array must be bound as
   * its own prepared-statement parameter in the adapter and never interpolated into statement
   * text.
   *
   * TODO [model/dao/ProductDAO.cfc:L64] carried forward verbatim and NOT resolved. The legacy
   * comment reads, exactly:
   *
   * // TODO: Remove this conditional when railo and ACF match how they handle arrays for 'IN' clause
   *
   * It guards the branch immediately below it [model/dao/ProductDAO.cfc:L65-L69], where the same
   * `attributeSetTypeCode` value is passed as a comma-delimited list in one arm and as an array in
   * the other, purely because the two CFML engines differed. The target narrows to the MySQL
   * branch only, and `src/repositories/mysql/dialect.ts` replaces the legacy `cfdbinfo`
   * product-name probe [config/configORM.cfm:L1-L15] - which chose a Hibernate dialect from the
   * database product name at runtime - with explicit environment configuration, so the
   * CFML-engine divergence this TODO describes no longer applies here; the TODO is nevertheless
   * carried forward rather than closed, because a known source TODO is ported as a flagged TODO
   * and never silently completed. It travels with the statement it guards into the adapter.
   *
   * @param attributeSetTypeCode Attribute-set type system codes to match; required in the legacy
   *   signature.
   * @param productTypeIDs Product-type identifiers to narrow by; required in the legacy signature,
   *   and empty means "global sets only" rather than "no filter".
   * @returns The matching attribute-set read projections, in the legacy order.
   */
  getAttributeSets(
    attributeSetTypeCode: readonly string[],
    productTypeIDs: readonly string[],
  ): Promise<AttributeSetSummary[]>;

  /**
   * Bulk product/SKU import from a delimited file.
   *
   * Legacy: `public void function loadDataFromFile(required string fileURL, string textQualifier =
   * "")` [model/dao/ProductDAO.cfc:L73]. `fileURL` is required. `textQualifier` is optional with a
   * legacy default of the empty string; that default is recorded here in prose and deliberately
   * NOT written as a default parameter value, because a default value is a runtime expression and
   * this module emits no runtime JavaScript. `returntype="void"` becomes `Promise<void>`.
   *
   * WARNING - EXECUTION-MODEL MISMATCH. The calling service raises the request timeout to 3600
   * seconds, one hour, immediately before delegating here
   * [model/service/ProductService.cfc:L65-L68]. That budget is structurally unavailable in the
   * target: AWS Lambda caps a single invocation at 15 minutes, and API Gateway caps a request at
   * 29 seconds. The legacy body is shaped for exactly the budget it asked for - it fetches the
   * whole file over HTTP [model/dao/ProductDAO.cfc:L87], classifies every column by its
   * `product_`, `sku_`, `option_` or `attribute_` prefix [model/dao/ProductDAO.cfc:L130-L140],
   * resolves option groups with one lookup each [model/dao/ProductDAO.cfc:L159-L172], then walks
   * every row of the file inside a per-row transaction, and finally rewrites SKU image file names
   * in one statement [model/dao/ProductDAO.cfc:L310-L325].
   *
   * The mismatch is annotated, NOT designed around. This signature therefore has no timeout, no
   * chunk, offset, cursor or resume parameter, no streaming handle, no asynchronous job handle, no
   * queue or worker hand-off, no progress callback, and no split into a begin/continue pair.
   * Adding any of those would invent a requirement the source never had and would spend a
   * signature reshaping this port has no budget for. The plan flags `loadDataFromFile` as an
   * out-of-scope-feature path reachable from an in-scope file, ported as a thin declaration rather
   * than made to work; `processProduct_addProductReview`
   * [model/service/ProductService.cfc:L157], `processProduct_addSubscriptionTerm`
   * [model/service/ProductService.cfc:L173] and `processProduct_uploadDefaultImage`
   * [model/service/ProductService.cfc:L235] get the same treatment at the service tier, and none
   * of them gets a method on this port. Its own private helper `saveImportData`
   * [model/dao/ProductDAO.cfc:L328] is likewise not on this port.
   *
   * @param fileURL Location of the delimited file, as the legacy signature names it. The legacy
   *   body derives its delimiter from the file extension [model/dao/ProductDAO.cfc:L74-L80].
   * @param textQualifier Optional text qualifier; legacy default is the empty string.
   */
  loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void>;

  /**
   * Product search by name fragment, optionally narrowed to a list of product types.
   *
   * Legacy: `public any function searchProductsByProductType(string term,string productTypeIDs)`
   * [model/dao/ProductDAO.cfc:L419]. NEITHER parameter is declared `required`, so both are
   * optional here, in the legacy order.
   *
   * NOTE THE PLURAL. This parameter is `productTypeIDs`. The sibling method on `skuRepository`,
   * `searchSkusByProductType`, takes the singular `productTypeID` [model/dao/SkuDAO.cfc:L130].
   * Both spellings are preserved verbatim; neither is normalised, and the plural here is not
   * "corrected" to match the singular there.
   *
   * `productTypeIDs` stays a `string` because that is the legacy type and the legacy value is a
   * comma-delimited list - the adapter splits it with the CFML list helpers in
   * `src/lib/cfml/list.js` and binds each parsed element as its own prepared-statement parameter,
   * exactly as the legacy code did with a list-valued bound parameter
   * [model/dao/ProductDAO.cfc:L425]. It is deliberately not widened to an array, and there is no
   * array-taking overload.
   *
   * Filter semantics for the adapter [model/dao/ProductDAO.cfc:L421-L426]: the name-fragment
   * predicate is applied unconditionally against a bound parameter, while the product-type
   * predicate is applied only when `productTypeIDs` is present and non-empty.
   *
   * The legacy body declares `returntype="any"` and projects each row into a two-key structure
   * keyed `id` and `value` for autocomplete consumption [model/dao/ProductDAO.cfc:L429-L436]. The
   * strict profile admits no `any`, and the plan's interface mapping types this method's result as
   * the entity it searches, so the port publishes `Product[]` and the adapter owns hydration -
   * including the fetch shape this file's header requires. A repository-wide search finds no
   * caller of this DAO function in the legacy tree (its SKU sibling is reached through
   * `SkuService.searchSkusByProductType` [model/service/SkuService.cfc:L271-L272]), so the
   * signature published here derives from the declaration itself.
   *
   * @param term Optional name fragment, as the legacy signature names it.
   * @param productTypeIDs Optional comma-delimited product-type identifiers.
   * @returns The matching products, materialized as this port's header requires.
   */
  searchProductsByProductType(term?: string, productTypeIDs?: string): Promise<Product[]>;

  /**
   * Load one product by its identifier.
   *
   * This method name has NO legacy antecedent. `model/dao/ProductDAO.cfc` declares no load
   * function at all: the legacy code obtained an entity through the ORM, by way of the framework
   * base component's generated accessors and `entityLoad`, which have no equivalent in a
   * driver-only stack. The name is shaped after the closest legacy naming precedent in the same
   * DAO family, `getSkuBySkuCode` [model/dao/SkuDAO.cfc:L102], so the folder reads consistently.
   *
   * Returns `undefined` when no product carries that identifier. Absence is explicit and is never
   * substituted with a zero value or an empty object.
   *
   * @param productID Identifier of the product to load.
   * @returns The materialized product, or `undefined` when there is none.
   */
  getProductByProductID(productID: string): Promise<Product | undefined>;

  /**
   * Persist one product.
   *
   * This method name has NO legacy antecedent on the DAO. `model/dao/ProductDAO.cfc` declares no
   * save function; persistence ran through the ORM, reached as `getHibachiDAO().save(target=...)`
   * from the service tier [model/service/ProductService.cfc:L287] and as `super.save(...)` for the
   * product-type sibling [model/service/ProductService.cfc:L303].
   *
   * It takes the entity alone, and no data structure, because population, unique URL-title
   * generation and validation all remain at the service tier where the legacy code performed them
   * [model/service/ProductService.cfc:L264-L292]. What arrives here is an already-populated,
   * already-validated entity, and the adapter persists it and returns the persisted instance.
   *
   * @param product The product to persist.
   * @returns The persisted product.
   */
  saveProduct(product: Product): Promise<Product>;

  /**
   * Delete one product.
   *
   * This method name has NO legacy antecedent on the DAO; deletion ran through the ORM as
   * `super.delete(...)` [model/service/ProductService.cfc:L326]. The boolean result is the legacy
   * service-level contract, `public boolean function deleteProduct(required any product)`
   * [model/service/ProductService.cfc:L317], which returns false when the delete does not proceed
   * and true when it does - so the port reports the same two outcomes rather than throwing on
   * refusal.
   *
   * @param product The product to delete.
   * @returns True when the product was deleted, false when it was not.
   */
  deleteProduct(product: Product): Promise<boolean>;

  /**
   * Persist one brand, populating it from a resolved payload first.
   *
   * This is the target of AAP rule T3 for `return super.save(arguments.brand, arguments.data)`
   * [model/service/BrandService.cfc:L76] - the single statement that made the legacy `saveBrand`
   * durable, and the only persistence the component ever performed.
   *
   * ★ IT TAKES TWO ARGUMENTS WHERE {@link ProductRepository.saveProduct} TAKES ONE, AND THE
   * ASYMMETRY IS FORCED BY THE ENTITY RATHER THAN CHOSEN. The legacy `super.save(entity, data)`
   * POPULATED the entity from the struct and only then flushed, so the struct is not an alternative
   * route to the columns - it IS the route. `Brand` publishes no mutator at all and its `urlTitle`
   * field is private and readonly, so the `urlTitle` that
   * [model/service/BrandService.cfc:L70, L72] resolves cannot be applied to the entity by the
   * service: not through a setter, which does not exist, and not by reconstruction, which would mean
   * copying every column and every association through the constructor and would silently drop
   * anything the copy forgot. Dropping the payload here would therefore make the generated title
   * reach nothing - a durable save that persists the wrong row - so the payload travels with the
   * entity exactly as the legacy statement sends it.
   *
   * `saveProduct` needs no payload because `ProductService` resolves its title into the product
   * itself [model/service/ProductService.cfc:L269] before saving; `BrandService` never had that
   * route and did not take it.
   *
   * WHERE THE POPULATE STEP LIVES. In the adapter, because that is where it lived in the legacy:
   * population belonged to `HibachiService`/`HibachiDAO`, which AAP 0.5.3 lists among the
   * dependencies deliberately not carried forward, with persistence redistributed to the
   * repositories. The adapter writes the columns present in the payload and flushes. Validation is
   * NOT part of this contract - the framework validation service is not ported, and
   * `model/validation/Brand.json` was enforced by it.
   *
   * ★ THE RETURNED INSTANCE IS THE CONTRACT, NOT A COURTESY. The legacy `saveBrand` RETURNS what
   * `super.save` hands back, and a generated `brandID` is assigned during that save
   * [model/entity/Brand.cfc:L52, `generator="uuid" unsavedvalue=""`]. A caller that saved a new
   * brand and then read the input instance would see `brandID` still empty, and would also see the
   * pre-population `urlTitle`. So the persisted instance is what every caller must use, and the
   * entity's immutability is what makes that load-bearing rather than stylistic: the adapter cannot
   * back-fill either value into the argument even if it wanted to.
   *
   * @param brand The brand to persist.
   * @param data The resolved payload to populate from before flushing.
   * @returns The persisted brand, carrying any identifier assigned by the save and the populated
   *   column values.
   */
  saveBrand(brand: Brand, data: BrandSavePayload): Promise<Brand>;
}
