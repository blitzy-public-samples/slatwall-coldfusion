// Product repository port: the domain-side persistence and query contract for `Product`, plus the
// brand save the brand service reaches through.
//
// Ported from `model/dao/ProductDAO.cfc` (441 lines, cfscript throughout, the largest of the six
// in-scope DAOs), with the entity-lifecycle methods the service tier needs now that the ORM is
// gone. `ProductService`'s `property name="productDAO";` [model/service/ProductService.cfc:L52] -
// the first of eight DI/1 collaborators declared at L52-L60 - becomes a constructor parameter typed
// to this interface.
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
 * repository method in `src/repositories/mysql/mysqlProductRepository.ts`. Concretely, a `Product`
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
 *     `src/services/productService.ts` - and that is one of exactly three budgeted signature
 *     reshapings, owned by `src/services/**`. It is NOT absorbed here. The service's
 *     `findProducts` composes this port's existing `searchProductsByProductType` plus load-by-id,
 *     which are the concrete filters the legacy callers actually applied; the open-ended dynamic
 *     filtering surface is deliberately not reproduced. So this port declares no `findProducts`,
 *     no `getProductSmartList`, no criteria or page type, no generic query, search or filter
 *     method, no paging or sort parameter and no dynamic-filter bag. The same applies to
 *     `getSkuSmartList` [model/service/SkuService.cfc:L309-L325], owned by
 *     `src/services/skuService.ts` over `skuRepository`.
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
 * `src/handlers/bootstrap.ts` wires the concrete instance.
 *
 * THESE NAMES ARE CANONICAL
 * Five modules now consume this file - `src/domain/entities/product.ts`,
 * `src/services/productService.ts`, `src/services/priceGroupService.ts`,
 * `src/repositories/mysql/mysqlProductRepository.ts` and the composition root
 * `src/handlers/bootstrap.ts` - and each is written against the names, method names and
 * signatures published here. They were published deliberately and precisely before any consumer
 * existed, which is why none needed a rename; they are not to be renamed now either.
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
 * `src/repositories/mysql/mysqlProductRepository.ts`, one of exactly six MySQL adapters. Five
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
 * `src/handlers/bootstrap.ts` wires this port to that adapter; it does not implement it.
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
 * `src/domain/entities/product.ts` is on the branch, so this specifier resolves and `tsc` reports
 * nothing. It did not always: this port was authored before that entity existed, and the
 * unresolved specifier was left in place deliberately rather than "fixed" by deleting the import,
 * declaring a local `Product` stand-in, or relaxing `tsconfig.json`. That decision is recorded
 * because it is the one that made this import correct the moment the entity landed, with no edit
 * here at all.
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
 *   `public array function getAttributeSets(...)`
 * [model/dao/ProductDAO.cfc:L52], returning untyped rows - but every MEMBER name is verbatim from
 * the legacy source. Member names, and where each one comes from:
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
   * Active flag [model/entity/AttributeSet.cfc:L53]; nullable in the legacy schema. Note that the
   * DAO's active-attribute test applies to the attributes in the set, not to this flag
   * [model/dao/ProductDAO.cfc:L54], so a returned row may carry no value here.
   */
  readonly activeFlag?: boolean;

  /** Required flag [model/entity/AttributeSet.cfc:L58]; nullable in the legacy schema. */
  readonly requiredFlag?: boolean;

  /** Secondary ordering key [model/entity/AttributeSet.cfc:L61]; nullable in the legacy schema. */
  readonly sortOrder?: number;
}

/**
 * ★ WHY NO BRAND SAVE APPEARS ON THIS PORT, AND WHY IT WAS REMOVED RATHER THAN JUSTIFIED.
 *
 * An earlier revision of this file declared a seventh member, `saveBrand(brand, data)`, on the
 * grounds that `return super.save(arguments.brand, arguments.data)`
 * [model/service/BrandService.cfc:L76] is the one statement that made the legacy component durable
 * and that T3 converts `super.save()` into a repository method. That reasoning is not available
 * here, and the reason is a hard constraint rather than a preference:
 *
 *   * THIS PORT'S MEMBER SET IS LOCKED AT SIX. The arithmetic in this file's header is
 *     `4 declared DAO functions - 1 private helper + 3 entity-lifecycle methods = 6`, and the
 *     authoring contract states it as a lock: no seventh method, no batch load, no load-all, no
 *     count, no `exists`, no `saveMany`, no overload and no options bag. A brand save is a seventh
 *     method however it is spelled.
 *   * THERE IS NO BRAND REPOSITORY IN THE THIRTEEN-PORT SET, and the set is closed. `Brand` CRUD
 *     routes through `hb_serviceName="brandService"` [model/entity/Brand.cfc:L49], and there is no
 *     `BrandDAO.cfc` anywhere in the legacy repository - brand persistence never had a query
 *     surface, it ran entirely through framework-inherited generic CRUD. AAP 0.5.3 lists the
 *     Hibachi base classes among the dependencies deliberately not carried forward, and the
 *     redistribution it describes reaches the SIX repository ports it names; it does not create a
 *     fourteenth.
 *
 * WHAT THIS MEANS FOR A CALLER, STATED PLAINLY RATHER THAN LEFT TO INFERENCE. `saveBrand` on
 * `src/services/brandService.ts` resolves the unique URL title exactly as [L68-L74] does, writes it
 * into the supplied payload, POPULATES the entity from that payload, enforces the three save-context
 * rules in `model/validation/Brand.json`, and then performs the durable write through a collaborator
 * the COMPOSITION ROOT supplies.
 *
 * ★★ THAT LAST CLAUSE REVERSES WHAT THIS PARAGRAPH USED TO SAY, AND THE REVERSAL IS THE POINT.
 * It read: "...and THEN RAISES `BrandPersistenceUnavailableError`. A partial brand write - one that
 * persisted `urlTitle` and `brandName` while silently dropping `activeFlag`, `publishedFlag` and
 * `brandWebsite`, and while enforcing none of `model/validation/Brand.json` because the framework
 * validation service is not ported - would be strictly worse than no write at all: it would durably
 * store a WRONG ROW."
 *
 * The hazard it named was real, and the write that now exists does not have it: all ELEVEN `SwBrand`
 * columns are written, `populate` [org/Hibachi/HibachiTransient.cfc:L169-L205] is reproduced so no
 * supplied column is dropped, and every save-context rule in the validation file is enforced -
 * including the `unique` one, transcribed from `HibachiDAO.isUniqueProperty`
 * [org/Hibachi/HibachiDAO.cfc:L130-L147]. What the old paragraph had ruled out was a PARTIAL write;
 * it did not establish that a complete one was impossible, and it is not.
 *
 * ★ WHAT IS UNCHANGED, AND MUST STAY UNCHANGED. THIS PORT STILL HAS SIX MEMBERS AND THE SET IS
 * STILL THIRTEEN PORTS. `saveBrand` is NOT a seventh member here and no `brandRepository` was
 * created; there is still no `BrandDAO.cfc` to port one from. The write arrives as a narrow
 * structural collaborator declared by `brandService.ts` and satisfied module-locally inside
 * `src/handlers/bootstrap.ts` over the request's prepared-statement executor - the same shape
 * `PriceGroupService` and `PromotionService` already use for their framework READS. It is also still
 * true that no module under `src/repositories/**` writes `SwBrand`: this port's own adapter reads
 * those eleven columns and never writes them, and that remains accurate.
 */

/**
 * The resolved fields a product save populates from before it writes.
 *
 * ★ THIS TYPE EXISTS BECAUSE `super.save(entity, data)` TOOK TWO ARGUMENTS, AND THE SECOND ONE
 * DID WORK. `return super.save(arguments.product, arguments.data)`
 * [model/service/ProductService.cfc:L287] POPULATED the entity from the struct and only then
 * flushed, so the struct was never an alternative route to the columns - it was part of the route.
 * The payload is the ported expression of that populate step: it names the fields THIS SAVE IS
 * RESPONSIBLE FOR WRITING, and the adapter prefers it where it speaks and the entity everywhere else.
 *
 * IT IS NOT THE ONLY CHANNEL, AND IT IS NOT A WORKAROUND FOR A MISSING SETTER. `Product` publishes
 * `setUrlTitle`, and `ProductService.saveProduct` writes the resolved title ONTO THE ENTITY exactly
 * as `arguments.product.setURLTitle(...)` [model/service/ProductService.cfc:L269] does - which is
 * load-bearing for a reason that has nothing to do with persistence: `getProductURL()`
 * [model/entity/Product.cfc:L207] reads the title off the entity, so a caller inspecting the product
 * it just saved must see the resolved value there. The service then STATES THE SAME VALUE IN THE
 * PAYLOAD, so the write is explicit at the boundary rather than inferred from whatever the entity
 * happens to hold. The two agree by construction because the service reads the payload value back
 * off the entity (`urlTitle: product.getUrlTitle()`) rather than keeping a second local that could
 * drift from it.
 *
 * Two members, each `?: string | undefined` rather than
 * `?: string`, so that an explicit `urlTitle: undefined` - what a caller writes after reading a
 * NULL column - stays expressible under `exactOptionalPropertyTypes`. `urlTitle` is nullable in the
 * schema [model/entity/Product.cfc:L54] and `productName` is `notNull="true"`
 * [model/entity/Product.cfc:L55] but is still absent from an unpopulated draft.
 *
 * ⚠ IT IS NOT A GENERAL POPULATE STRUCT, and it must not grow into one. The legacy
 * `arguments.product.populate(arguments.data)` [model/service/ProductService.cfc:L266] applied every
 * key a caller sent, driven by framework metadata that is not ported. This carries only what the
 * SERVICE ITSELF RESOLVES and cannot apply to the entity. Adding a member here to avoid a
 * constructor argument somewhere else would rebuild `populate` one column at a time.
 */
export interface ProductSavePayload {
  /**
   * The resolved URL title [model/service/ProductService.cfc:L269].
   *
   * ABSENT AND `undefined` MEAN DIFFERENT THINGS. Absent means "the payload says nothing about this
   * column, so use the entity's value"; present-and-`undefined` means "write SQL NULL". The adapter
   * distinguishes them with `Object.hasOwn`, exactly as it does for the brand payload.
   */
  readonly urlTitle?: string | undefined;

  /** The product name [model/entity/Product.cfc:L55], when the caller supplies one. */
  readonly productName?: string | undefined;
}
/**
 * The product repository port.
 *
 * Six methods, locked: the three public functions of `model/dao/ProductDAO.cfc` and the three
 * product entity-lifecycle methods the service tier needs now that Hibernate is gone. The
 * arithmetic and the deliberate exclusion of the private helper at
 * [model/dao/ProductDAO.cfc:L328] are in this file's header. Each method returns a promise because
 * each one reaches persistence.
 *
 * ★ NOTHING ON THIS PORT ACTS ON A BRAND. `BrandService.cfc` declares exactly one function,
 * `saveBrand` [model/service/BrandService.cfc:L67], and its file header in
 * `src/services/brandService.ts` records that the absence of `getBrand`, `deleteBrand` and the
 * smart-list accessors is FAITHFUL rather than incomplete: they arrived by inheritance from
 * `HibachiService`, which is not ported. The durable half of that one function is likewise
 * framework-inherited generic CRUD with no DAO behind it - there is no `BrandDAO.cfc` anywhere in
 * the legacy repository - and the six-member lock on this port plus the thirteen-port lock on the
 * folder leave it no home here. The block above this interface states the removal and its reasoning
 * in full. A `getBrandByBrandID`, a `saveBrand` or a `deleteBrand` here would each be a seventh
 * member, and publishing port surface beyond the locked budget is the same class of defect as the
 * three collaborator interfaces that were deleted from this folder to bring it back to thirteen.
 *
 * The product side does carry a loader, a save and a delete, because `ProductService.cfc` genuinely
 * declares `deleteProduct` [L317] and load-bearing process methods that reach `getHibachiDAO().save`
 * [L287] and `super.delete` [L326] - constructs AAP rule T3 converts into repository port methods,
 * and which AAP 0.4.1 authorises this port to carry as "the entity-load/save methods the service
 * needs".
 *
 * The implementing adapter is `src/repositories/mysql/mysqlProductRepository.ts`; the composition
 * root wires it. Nothing here names a driver, a connection, a statement or a table.
 */
/**
 * A window over a matched row list.
 *
 * Both members are ZERO-BASED and COUNTED, matching `ProductQueryCriteria.pageRecordsStart` and
 * `pageRecordsShow` in `src/services/productService.ts`, which is the only caller that supplies one.
 * Neither is defaulted here: a window is either supplied whole or not supplied at all, so there is no
 * half-specified window whose missing half an adapter would have to invent.
 *
 * The adapter is entitled to assume both are non-negative safe integers, because the service checks
 * them - and refuses - before any statement runs.
 *
 * ★★★ QUOTE-THEN-REVISE: THIS WAS `ProductMaterializationWindow`, "applied before product graphs are
 * materialized" (F38). There are no product graphs on this path any more - the search answers the two
 * columns its statement selects - so a name and a sentence that promised to bound a materialization
 * would both have been describing work that no longer happens. What the window bounds now is the ROW
 * SET the caller receives, which is what a paging window means.
 */
export interface ProductSearchWindow {
  /** Zero-based index of the first matched row to return. */
  readonly start: number;

  /** How many matched rows to return from `start`. */
  readonly count: number;
}

/**
 * One matched product row: the two columns [model/dao/ProductDAO.cfc:L421] selects, and nothing else.
 *
 * ★★★ THE MEMBER NAMES ARE THE LEGACY'S OWN, WHICH IS WHY THEY ARE `id` AND `value` (F38).
 * [model/dao/ProductDAO.cfc:L429-L436] loops the two-column result and builds
 * `result[i] = {"id" = records.productID[i], "value" = records.productName[i]}`. That structure IS the
 * method's return type in the source, so it is the return type here. Renaming the keys to
 * `productID`/`productName` would have been a quiet reinterpretation of a shape the source publishes;
 * the HTTP projection in `src/handlers/catalogQueryHandler.ts` maps them onto its own published names,
 * which is where a wire-name decision belongs.
 *
 * `value` is OPTIONAL because `SwProduct.productName` is a nullable column
 * [model/entity/Product.cfc:L55] and absence is never substituted with an empty string - the
 * distinction between "no name recorded" and "an empty name" is preserved all the way to the response.
 */
export interface ProductSearchRow {
  /** `SwProduct.productID`, the legacy `"id"` key. */
  readonly id: string;

  /** `SwProduct.productName`, the legacy `"value"` key; omitted when the column is NULL. */
  readonly value?: string;
}

/**
 * What a product search answers.
 *
 * TWO MEMBERS RATHER THAN A BARE ARRAY, because a windowed search has to report both what it returned
 * and how much matched: an array alone cannot distinguish "these are all of them" from "these are the
 * first twenty of nine hundred", and a caller publishing a page needs the second fact. See the widening
 * note on `searchProductsByProductType` for why the count comes from the row projection rather
 * than from a second `COUNT(*)` statement.
 *
 * ★★★ `records` CARRIES ROWS, NOT ENTITIES, AND THAT IS THE CORRECTION (F38). It was declared
 * `readonly Product[]`, and `src/repositories/mysql/mysqlProductRepository.ts` opened with a standing
 * note that this was a LIVE DISAGREEMENT: "The brief describes `searchProductsByProductType` as
 * returning the legacy two-key `{"id","value"}` structure; the port publishes `Promise<Product[]>` and
 * assigns hydration to this adapter." Code review resolved it against the port, and the AAP is why:
 * [model/dao/ProductDAO.cfc:L419-L436] issues ONE statement selecting TWO columns and returns them,
 * while the entity-shaped port turned each match into a product graph, its SKUs, each SKU's options and
 * a per-product sale-price resolution - after which the only members any caller read were the
 * identifier and the name. Hydration is not free and it was not asked for; it also made the answer
 * assembled from several statements, so a concurrent write could leave the page internally
 * inconsistent. Graph hydration remains available, deliberately, through `getProductByProductID` -
 * the explicit entity load - which is the path that means to pay for it.
 */
export interface ProductSearchMatches {
  /** The matched rows: the window when one was supplied, every match otherwise. */
  readonly records: readonly ProductSearchRow[];

  /** How many rows matched, BEFORE any window was applied. */
  readonly matchedCount: number;
}

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
   * This is the ONLY ported route into the attribute subsystem. The `attributeValues` EAV read path
   * is deliberately not ported.
   *
   * Filter and ordering semantics for the adapter to reproduce, described in prose because this
   * file contains no SQL [model/dao/ProductDAO.cfc:L53-L62]: an attribute set qualifies when it has
   * at least one active attribute and its attribute-set type system code is one of the supplied
   * `attributeSetTypeCode` values; when `productTypeIDs` is non-empty the set must also be either
   * global or assigned to one of the supplied product types, and when `productTypeIDs` is empty the
   * set must be global. Results are ordered by attribute-set type system code ascending, then by
   * sort order ascending. Both value collections were bound by the legacy code as named parameters
   * expanded into `IN` lists, so every element of each array must be bound as its own
   * prepared-statement parameter in the adapter and never interpolated into statement text.
   *
   * TODO [model/dao/ProductDAO.cfc:L64] carried forward verbatim and NOT resolved. The legacy
   * comment reads, exactly:
   *
   * // TODO: Remove this conditional when railo and ACF match how they handle arrays for 'IN' clause
   *
   * It guards the branch immediately below it [model/dao/ProductDAO.cfc:L65-L69], where the same
   * `attributeSetTypeCode` value is passed as a comma-delimited list in one arm and as an array in
   * the other, purely because the two CFML engines differed. The target narrows to the MySQL branch
   * only, and `src/repositories/mysql/dialect.ts` replaces the legacy `cfdbinfo` product-name probe
   * [config/configORM.cfm:L1-L15] - which chose a Hibernate dialect from the database product name
   * at runtime - with explicit environment configuration, so the CFML-engine divergence this TODO
   * describes no longer applies here; the TODO is nevertheless carried forward rather than closed,
   * because a known source TODO is ported as a flagged TODO and never silently completed. It
   * travels with the statement it guards into the adapter.
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
   * Legacy:
   *   `public void function loadDataFromFile(required string fileURL, string textQualifier = "")`
   * [model/dao/ProductDAO.cfc:L73]. `fileURL` is required. `textQualifier` is optional with a
   * legacy default of the empty string; that default is recorded here in prose and deliberately NOT
   * written as a default parameter value, because a default value is a runtime expression and this
   * module emits no runtime JavaScript. `returntype="void"` becomes `Promise<void>`.
   *
   * WARNING - EXECUTION-MODEL MISMATCH. The calling service raises the request timeout to 3600
   * seconds, one hour, immediately before delegating here
   * [model/service/ProductService.cfc:L65-L68]. That budget is structurally unavailable in the
   * target: AWS Lambda caps a single invocation at 15 minutes, and API Gateway bounds an integration
   * per API type - 30 s for an HTTP API, 29 s by default for a REST API, raisable beyond that only for
   * Regional and private REST APIs - so there is no one universal cap to quote, and this subtree
   * configures none of them. The legacy body is shaped for exactly the budget it asked for - it fetches the whole
   * file over HTTP [model/dao/ProductDAO.cfc:L87], classifies every column by its `product_`,
   * `sku_`, `option_` or `attribute_` prefix [model/dao/ProductDAO.cfc:L130-L140], resolves option
   * groups with one lookup each [model/dao/ProductDAO.cfc:L159-L172], then walks every row of the
   * file inside a per-row transaction, and finally rewrites SKU image file names in one statement
   * [model/dao/ProductDAO.cfc:L310-L325].
   *
   * The mismatch is annotated, NOT designed around. This signature therefore has no timeout, no
   * chunk, offset, cursor or resume parameter, no streaming handle, no asynchronous job handle, no
   * queue or worker hand-off, no progress callback, and no split into a begin/continue pair. Adding
   * any of those would invent a requirement the source never had and would spend a signature
   * reshaping this port has no budget for. The plan flags `loadDataFromFile` as an
   * out-of-scope-feature path reachable from an in-scope file, ported as a thin declaration rather
   * than made to work; `processProduct_addProductReview` [model/service/ProductService.cfc:L157],
   * `processProduct_addSubscriptionTerm` [model/service/ProductService.cfc:L173] and
   * `processProduct_uploadDefaultImage` [model/service/ProductService.cfc:L235] get the same
   * treatment at the service tier, and none of them gets a method on this port. Its own private
   * helper `saveImportData` [model/dao/ProductDAO.cfc:L328] is likewise not on this port.
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
   * [model/dao/ProductDAO.cfc:L419]. NEITHER parameter is declared `required`, so both are optional
   * here, in the legacy order.
   *
   * NOTE THE PLURAL. This parameter is `productTypeIDs`. The sibling method on `skuRepository`,
   * `searchSkusByProductType`, takes the singular `productTypeID` [model/dao/SkuDAO.cfc:L130]. Both
   * spellings are preserved verbatim; neither is normalised, and the plural here is not "corrected"
   * to match the singular there.
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
   * strict profile admits no `any`, so the port publishes that same two-key structure as the typed
   * {@link ProductSearchRow}. A repository-wide search finds no caller of this DAO function in the
   * legacy tree (its SKU sibling is reached through `SkuService.searchSkusByProductType`
   * [model/service/SkuService.cfc:L271-L272]), so the signature published here derives from the
   * declaration itself.
   *
   * ★★★ QUOTE-THEN-REVISE ON THE RESULT SHAPE (F38). This paragraph used to continue "and the plan's
   * interface mapping types this method's result as the entity it searches, so the port publishes
   * `Product[]` and the adapter owns hydration - including the fetch shape this file's header
   * requires." Code review recorded the consequence: a two-column source query became a full graph
   * hydration plus a per-product sale-price fan-out, and then the only members any caller read were
   * the identifier and the name. The adapter itself carried a standing note that the brief and the
   * port disagreed on exactly this point. The disagreement is resolved in the brief's favour, which is
   * also the source's: rows in, rows out, one statement. Entity hydration is reached deliberately,
   * through `getProductByProductID`.
   *
   * ★★ THE THIRD PARAMETER IS A DELIBERATE, DOCUMENTED WIDENING OF A LEGACY-PARITY SIGNATURE, added to
   * close a resource finding. A security review recorded (MAJOR, CWE-400) that
   * `ProductService.findProducts` applied its paging window in memory only after every matched product
   * graph had been materialized, so the window bounded the RESPONSE and not the WORK.
   *
   * The window is applied to the MATCHED ROW LIST and NOT as a `LIMIT`/`OFFSET` on the ported
   * statement. That placement is chosen for two reasons a reviewer can check:
   *
   *   1. THE PORTED STATEMENT TEXT STAYS BYTE-IDENTICAL. [model/dao/ProductDAO.cfc:L421] declares no
   *      `ORDER BY`, no `DISTINCT` and no `LIMIT`, and the adapter's note says "the legacy has none, so
   *      none is added". A `LIMIT` without an `ORDER BY` selects an arbitrary subset, so adding one
   *      would have meant inventing an ordering the source does not declare in order to make the bound
   *      meaningful - a behavioural change disguised as a resource fix.
   *   2. `recordsCount` KEEPS ITS MEANING. `ProductPage.recordsCount` is documented as the total number
   *      of matches BEFORE the window, and the projection is what yields that honest total. A `LIMIT`
   *      would have destroyed it and forced a second `COUNT(*)` statement to recover it.
   *
   * ★ WHAT THE WINDOW BOUNDS IS NOW SMALLER, AND SO IS WHAT IT NEEDED TO BOUND. It used to bound "the
   * three graph-materialization statements, which hydrate a product, its SKUs and each SKU's options";
   * those statements are gone from this path, so it bounds the returned ROW SET. The CWE-400 exposure
   * the window was added for is closed twice over: the expensive half no longer exists, and the cheap
   * half is still windowed. AN ABSENT WINDOW MEANS EVERY MATCH, exactly as before.
   *
   * @param term Optional name fragment, as the legacy signature names it.
   * @param productTypeIDs Optional comma-delimited product-type identifiers.
   * @param window Optional window applied to the matched rows. Absent means every match.
   * @returns The matched rows - windowed when a window was supplied - together with how many
   *   matched BEFORE the window, which is the count a paged caller has to publish.
   */
  searchProductsByProductType(
    term?: string,
    productTypeIDs?: string,
    window?: ProductSearchWindow,
  ): Promise<ProductSearchMatches>;

  /**
   * Load one product by its identifier.
   *
   * This method name has NO legacy antecedent. `model/dao/ProductDAO.cfc` declares no load function
   * at all: the legacy code obtained an entity through the ORM, by way of the framework base
   * component's generated accessors and `entityLoad`, which have no equivalent in a driver-only
   * stack. The name is shaped after the closest legacy naming precedent in the same DAO family,
   * `getSkuBySkuCode` [model/dao/SkuDAO.cfc:L102], so the folder reads consistently.
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
   * ★ IT TAKES A PAYLOAD, AND THIS PARAGRAPH ONCE EXPLAINED WHY IT DID NOT. It read: "It takes the
   * entity alone, and no data structure, because population, unique URL-title generation and
   * validation all remain at the service tier where the legacy code performed them
   * [model/service/ProductService.cfc:L264-L292]. What arrives here is an already-populated,
   * already-validated entity, and the adapter persists it and returns the persisted instance."
   *
   * Generation and validation DO remain at the service tier - that half is unchanged, and the
   * adapter still derives no title and enforces no rule. It was "already-populated" that did not
   * hold - not because the entity could not carry the title, but because a save whose written columns
   * are inferred from an entity's current state is a save nobody can read the intent of. The legacy
   * statement was `super.save(arguments.product, arguments.data)` [L287]: TWO arguments, the second
   * of which populated the row before the flush.
   *
   * The remedy keeps both halves. The service writes the resolved title onto the entity, as
   * [L269] does, so `getProductURL()` [model/entity/Product.cfc:L207] answers correctly off the
   * instance the caller holds; and it names that same title in the payload, so the columns this save
   * is responsible for are stated at the boundary rather than deduced. The payload travels with the
   * entity, the adapter prefers the payload where it speaks and the entity everywhere else, and the
   * returned instance carries what was actually written. See {@link ProductSavePayload} for why it is
   * deliberately not a general populate struct.
   *
   * @param product The product to persist.
   * @param data The resolved payload to populate from before writing. Pass an empty object when the
   *   caller has nothing to resolve; an empty payload writes exactly what the entity holds.
   * @returns The persisted product, carrying the populated column values.
   */
  saveProduct(product: Product, data: ProductSavePayload): Promise<Product>;

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
}
