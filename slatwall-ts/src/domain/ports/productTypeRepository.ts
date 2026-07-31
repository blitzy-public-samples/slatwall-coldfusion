/**
 * Product-type repository port - the domain-side persistence and query contract for
 * `ProductType`.
 *
 * Ported from `model/dao/ProductTypeDAO.cfc` (68 lines, cfscript, body L45-L68 - the smallest and
 * the cleanest of the six in-scope DAOs), with the entity read and save methods the service tier
 * needs now that the ORM is gone. It is the port that `model/service/ProductService.cfc` reaches
 * through: its `property name="productTypeDAO" type="any";` declaration
 * [model/service/ProductService.cfc:L54] - the third of exactly eight DI/1 collaborators declared
 * at L52-L60 - becomes a constructor parameter typed to this interface (T1). No runtime
 * bean-factory scan, no service locator, and therefore no first-scan lock.
 *
 * INTERFACES AND TYPE ALIASES ONLY
 * This module declares two interfaces and nothing else. It emits no runtime JavaScript at all: no
 * class, no constant, no enumeration, no function body, and no default parameter value (a default
 * value is a runtime expression). The single import is `import type`, which is fully erased at
 * emit, so the ports/entities relationship - entities take port interfaces as constructor
 * parameters while ports return entity types - exists solely in the type graph and never at
 * runtime (M3). There is no barrel file to force eager evaluation of that cycle, and none may be
 * created.
 *
 * THE METHOD COUNT IS FOUR, AND HERE IS THE ARITHMETIC
 *
 *     1  declared function in model/dao/ProductTypeDAO.cfc: getProductTypeQuery [L52], `public`,
 *          returntype `query`, and taking ZERO parameters. That is the DAO's entire surface -
 *          there is no second function, public or private. A reviewer counting declarations
 *          against ported methods should start here rather than suspect an omission.
 *   + 3  entity read and save methods, because `entityNew()`, `entityLoad()` and `super.save()`
 *          have no equivalent in a driver-only stack (T3). The legacy service tier loaded and
 *          persisted product types through framework CRUD inherited from `HibachiService`, never
 *          through this DAO, so with the ORM gone those operations must surface somewhere and the
 *          repository port is where: load one by identifier, load by materialized identifier
 *          path, save one.
 *   = 4  methods. That is the whole surface. There is no fifth - no delete, no search, no
 *          listing-by-parent, no load-all, no count, no existence check, no tree builder, no
 *          path-computing helper, no batch variant, no overload and no options bag.
 *
 * The path-based read is not a convenience. `productTypeIDPath` is a materialized,
 * comma-delimited identifier path declared `ormtype="string" length="4000"`
 * [model/entity/ProductType.cfc:L53], and it is walked at two in-scope places: the promotion
 * qualifier and reward membership tests, and the price-group product-type cascade. A read keyed by
 * that path is therefore a genuine requirement of the slice.
 *
 * PARAMETERIZED SQL - WHERE THAT OBLIGATION LIVES (E5)
 * This file declares interfaces only and contains no SQL, so the obligation to use prepared
 * statements exclusively - preserving the injection-safety guarantee that `cfqueryparam` gave the
 * legacy `<cfquery>` bodies - transfers WHOLLY to `src/repositories/mysql/**`. Nothing below names
 * a driver, a pool, a connection, a row packet, a statement or a table. Note that the legacy tree
 * read builds its statement with `setSQL` over a string with no bound parameter at all, because it
 * takes no argument; the two identifier-bearing reads and the save below are the methods where the
 * adapter's binding discipline actually bites, and every caller-supplied value must be bound as
 * its own prepared-statement parameter rather than interpolated into statement text.
 *
 * SCHEMA CONTINUITY (B5)
 * This port reads and writes the existing product-type table unchanged. Nothing below proposes or
 * implies a migration, a rename, a new table or a column change: every member of the projection is
 * an already-declared column, and the materialized ancestry path keeps its declared
 * 4000-character width. Table and column names are referred to in prose only and are never
 * restated as literals here (E6) - which is why the only quoted string anywhere in this file is the
 * module specifier of its single import.
 *
 * THE TREE READ'S ORDERING IS PART OF THE CONTRACT
 * The legacy hint above the function reads, verbatim, `//@hint for caching product types as a
 * tree-sorted query` [model/dao/ProductTypeDAO.cfc:L51]. What is contractual in that sentence is
 * `tree-sorted`, not `caching`: the statement's terminal clause orders by product-type name
 * ascending [model/dao/ProductTypeDAO.cfc:L62], the row set is consumed as a tree-sorted listing,
 * and the implementing adapter MUST preserve that ordering exactly and MUST NOT substitute a
 * different sort. This port declares no cache, no memo, no expiry and no invalidation surface, and
 * none may be added to it; where the legacy engine chose to retain a result is not part of this
 * contract.
 *
 * That rule is deliberately the opposite of the one governing
 * `promotionRepository.getActivePromotionRewards`, whose legacy statement
 * [model/dao/PromotionDAO.cfc:L51-L132] carries NO ordering clause at all and where the adapter
 * must therefore NOT add one - the resulting reward order is genuinely unspecified, and imposing
 * an order there would invent behaviour. Two repository ports, two opposing rules, both
 * intentional: preserve the ordering here, preserve its absence there.
 *
 * FETCH SHAPE, AND WHY LAZINESS IS NOT SIMULATED (T3)
 * Hibernate lazy collections have no equivalent in a driver-only stack and are deliberately not
 * simulated. Associations are materialized at the repository boundary instead, and the fetch shape
 * is an explicit decision made and commented at each repository method in
 * `src/repositories/mysql/mysqlProductTypeRepository.ts`, which also owns the row-to-entity
 * factory, port injection and association materialization. Concretely, a `ProductType` handed back
 * by this port must already carry its parent and child linkage and its `productTypeIDPath` value
 * populated to whatever depth its consumers read, because the CFML entity walked those graphs
 * freely under lazy loading and the ported consumers still expect to. Making the shape an explicit
 * per-method decision is what removes implicit repeated loading by construction; that is a
 * correctness and explicitness property of the design, and it is claimed as nothing else.
 *
 * No `eagerLoad`, `fetch` or `include` parameter appears on any method below. The legacy DAO has
 * no such parameter, and adding one would invent a requirement the source never stated.
 *
 * WHY THE PARENT AND PATH READS DECIDE MONEY (B2)
 * This port supports one of the three must-preserve areas. `getRateForProductTypeBasedOnPriceGroup`
 * [model/service/PriceGroupService.cfc:L57-L100] resolves a rate by climbing the product-type
 * ancestry in a `while (!isNull(currentProductType))` loop that reassigns
 * `currentProductType = currentProductType.getParentProductType()` on every pass, and it feeds the
 * five-level cascade at [model/service/PriceGroupService.cfc:L140-L181]. The promotion engine
 * independently walks `productTypeIDPath` to decide qualifier and reward membership. A product
 * type returned without its parent linkage, or with a stale path, therefore does not merely read
 * oddly - it selects a different rate and charges a different amount. The parent and path reads
 * are money-critical and must be exact.
 *
 * MATERIALIZED-PATH WALKING IS NOT REIMPLEMENTED HERE
 * Splitting, joining, root extraction and membership testing over a comma-delimited identifier
 * path belong to `../valueObjects/materializedIdPath.js`, the sanctioned walker, and this file
 * neither duplicates nor re-brands any of it. This port's only relationship to the path is that
 * one method accepts one and returns the product types matching it.
 *
 * WHY THE PATH PARAMETER IS A PLAIN `string`
 * A deliberate, verified choice rather than an oversight. `materializedIdPath.js` exports two
 * types and five functions; both types - `PrimaryIdAccessor` and `ParentNodeAccessor` - are generic
 * callbacks for walking a node hierarchy, and neither is a path type. That module exports no
 * branded or validated path type at all, and its own path-consuming functions take the path as a
 * plain `string`. So there is nothing to import for this parameter position, and declaring a
 * branded path type here instead would create a second, structurally incompatible brand - exactly
 * the mistake that redeclaring `DecimalString` rather than importing it from
 * `../../lib/cfml/numberFormat.js` would be. A plain `string` is also parity with the persisted
 * column. Hence one import below, not two.
 *
 * EVERY METHOD IS ASYNCHRONOUS
 * All four return a promise, because all four reach persistence. That is the rule for all six
 * repository ports; only `settingsProvider` and `addressZoneEvaluator` are synchronous in this
 * folder.
 *
 * THE DOMAIN LAYER IMPORTS INWARD ONLY (E2)
 * `src/domain/**` may import only from within `src/domain/**` and from `src/lib/**`. Importing
 * `src/repositories/**`, `src/handlers/**` or `src/integrations/**`, or the `mysql2`,
 * `aws-lambda`, `@types/aws-lambda` or `dotenv` packages, is a build failure enforced by the
 * `no-restricted-imports` block in `eslint.config.mjs`. On a repository port `mysql2` is the live
 * temptation, and it is forbidden here: that is the entire point of the port. The boundary is
 * never to be weakened and no exception may be added for this file.
 *
 * THESE NAMES ARE CANONICAL
 * The consumer subtrees that will import this module - the entity, service, repository, handler
 * and integration layers - do not yet reference it. The names, method names and signatures
 * published here are therefore the contract those consumers will be written against. They are not
 * to be renamed later.
 *
 * THIS PORT'S TEST COVERAGE IS NET-NEW, NOT LEGACY PARITY
 * Nothing in the legacy suite covers this DAO. `meta/tests/unit/dao/` contains only
 * `AccountDAOTest` and `PaymentDAOTest`, and the only legacy suites touching the in-scope slice at
 * all are `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc` and the
 * empty stub `meta/tests/functional/admin/entity/ProductTest.cfc`, which contributes nothing.
 * Coverage for every method below is consequently net-new and must be labelled net-new rather than
 * presented as parity. Statement-shape and parameter-binding assertions for the adapter belong in
 * `tests/integration/repositories/`. This file states the obligation and does not discharge it; no
 * test is authored here.
 *
 * A NOTE ON THE TREE READ HAVING NO SURVIVING CALLER
 * A search of the checkout finds `getProductTypeQuery` declared at
 * [model/dao/ProductTypeDAO.cfc:L52] and invoked nowhere. That is recorded as an observation, not
 * as a fault, and it is emphatically not licence to drop the method: it is the DAO's entire
 * declared surface, and interface parity at the persistence boundary is the acceptance contract
 * (B4), so it is carried over verbatim - name, zero parameters and ordering alike.
 *
 * WHO IMPLEMENTS THIS PORT (see the interface doc below for the four transferred obligations)
 * `src/repositories/mysql/mysqlProductTypeRepository.ts`. `src/handlers/bootstrap.ts` wires that
 * adapter to this interface; it does not implement it.
 *
 * NO USER RULES WERE PROVIDED
 * The project rules source was queried three times while this file was authored - with no range,
 * with the full range, and probing well past the end of the document - and returned the identical
 * single line, `No user rules provided.`, every time; AAP section 0.7 reports the same result
 * independently. No rule has been invented to fill that gap and nothing here paraphrases one. The
 * absence is not licence to lower the bar: the enterprise-standard substitute applies at full
 * strength, which in this file means maximal strictness with no suppression comment, no non-null
 * assertion and no escape hatch, one cohesive closed surface, no barrel, no runtime value
 * whatsoever, and every judgment call annotated where it was made. Zero files enter scope by rule
 * mandate, so there are no rule conflicts to resolve here.
 */
import type { ProductType } from '../entities/productType.js';

/**
 * One product-type row as the legacy tree read returns it.
 *
 * This is a READ PROJECTION of the row set that `getProductTypeQuery` produces - it is NOT the
 * `ProductType` entity, and it must never be grown into a substitute for one. No method, no
 * mutation, no persistence identity semantics, and no behaviour of any kind: the entity is the
 * only thing that carries behaviour, and a consumer needing behaviour must load the entity through
 * `getProductTypeByProductTypeID`. Every property is `readonly` for that reason.
 *
 * The type name has no legacy antecedent - the CFML declaration is simply
 * `public query function getProductTypeQuery()` [model/dao/ProductTypeDAO.cfc:L52], handing back an
 * untyped query object - and the `TreeRow` suffix is chosen so the name reads as a projection
 * rather than as an entity. Every MEMBER name below, by contrast, is verbatim from the legacy
 * source:
 *
 *   * `isAssigned` and `childCount` are the two aliases the legacy statement's correlated scalar
 *     subqueries introduce [model/dao/ProductTypeDAO.cfc:L55-L60]. Described in prose because this
 *     file contains no SQL: `isAssigned` counts the products assigned to the row's product type,
 *     and `childCount` counts the product types whose parent is the row's product type.
 *   * `productTypeID`, `productTypeName` and `productTypeIDPath` are property names declared at
 *     [model/entity/ProductType.cfc:L52], [model/entity/ProductType.cfc:L57] and
 *     [model/entity/ProductType.cfc:L53].
 *   * `parentProductTypeID` is the physical foreign-key column of the `parentProductType`
 *     association [model/entity/ProductType.cfc:L62] - the very column the `childCount` subquery
 *     correlates on. It is the row's tree edge, so a listing cannot be assembled into a tree
 *     without it.
 *
 * `isAssigned` and `childCount` are COUNTS, so `number` is correct and `Money` would be wrong.
 * Neither is monetary, and no member of this projection is; stated once here so that no later pass
 * "helpfully" wraps either of them in a money type.
 *
 * THE LEGACY `SELECT *` IS NOT LICENCE FOR AN UNTYPED BAG. The statement selects every column of
 * the product-type table, but this projection deliberately declares a precise, explicit, named set
 * of members instead of an index signature or a `Record` of unknowns. Where a column has no
 * evidenced role in a tree-sorted listing it is OMITTED rather than modelled loosely, because an
 * omission is recoverable by a later, evidenced addition whereas an untyped bag defeats every
 * check the strictness profile exists to apply. Omitted on exactly that ground, and listed so the
 * omissions read as decisions: `activeFlag` and `publishedFlag`
 * [model/entity/ProductType.cfc:L54-L55], `urlTitle` [model/entity/ProductType.cfc:L56],
 * `productTypeDescription` [model/entity/ProductType.cfc:L58], `systemCode`
 * [model/entity/ProductType.cfc:L59], `remoteID` [model/entity/ProductType.cfc:L80], the audit
 * columns [model/entity/ProductType.cfc:L83-L86], and every collection and many-to-many
 * association on the entity. None of them is needed to render the tree, and none is invented here.
 *
 * REQUIREDNESS FOLLOWS ONE RULE, APPLIED UNIFORMLY: a member is required only where the legacy
 * declaration or the statement itself guarantees a value. That yields the generated identifier and
 * the two counts as required - a SQL count answers zero rather than nothing, so neither count can
 * be absent - and everything else as optional, because every remaining legacy column is declared
 * without a not-null constraint. Optional members are written `prop?: T` rather than
 * `prop?: T | undefined`: under `exactOptionalPropertyTypes` the bare form says the key may be
 * absent without also asserting that an explicit `undefined` is a distinct legal value, which is
 * the honest reading of a nullable column and matches the co-located projection on the sibling
 * product repository.
 */
export interface ProductTypeTreeRow {
  /**
   * Generated identifier [model/entity/ProductType.cfc:L52]. Required: the column is the entity's
   * `fieldtype="id"` with a uuid generator, so a persisted row always carries one.
   */
  readonly productTypeID: string;

  /**
   * Number of products assigned to this product type, from the `isAssigned` alias
   * [model/dao/ProductTypeDAO.cfc:L55-L57]. Name verbatim. Required: it is a count, which answers
   * zero rather than nothing. A count, so a `number` - not monetary.
   */
  readonly isAssigned: number;

  /**
   * Number of product types whose parent is this product type, from the `childCount` alias
   * [model/dao/ProductTypeDAO.cfc:L58-L60]. Name verbatim. Required for the same reason as
   * `isAssigned`, and likewise a plain `number`. A zero here identifies a leaf of the tree.
   */
  readonly childCount: number;

  /**
   * Display name [model/entity/ProductType.cfc:L57], and the key the row set is ordered by
   * ascending [model/dao/ProductTypeDAO.cfc:L62]. Optional because the legacy column is declared
   * with no not-null constraint - the ordering key is itself nullable in the legacy schema, and
   * this port invents no substitute value to paper over that.
   */
  readonly productTypeName?: string;

  /**
   * Materialized, comma-delimited ancestry path [model/entity/ProductType.cfc:L53], declared
   * `length="4000"`. Optional because the legacy column is nullable. Walking it is the job of
   * `../valueObjects/materializedIdPath.js`, never of this projection.
   */
  readonly productTypeIDPath?: string;

  /**
   * Identifier of the parent product type - the row's tree edge - being the foreign-key column of
   * the `parentProductType` association [model/entity/ProductType.cfc:L62]. Optional, and
   * genuinely so: a root product type has no parent, and its absence here is precisely what
   * identifies a root.
   */
  readonly parentProductTypeID?: string;
}

/**
 * The product-type repository port.
 *
 * Four methods, locked: the single public function of `model/dao/ProductTypeDAO.cfc` plus the three
 * entity read and save methods the service tier needs now that Hibernate is gone. The arithmetic
 * behind that count is in this file's header. Each method returns a promise because each one
 * reaches persistence.
 *
 * TWO METHODS THAT LOOK LIKE THEY BELONG HERE, AND DO NOT. Both are declared on sibling ports, and
 * the boundary is drawn deliberately rather than by accident:
 *
 *   * `searchProductsByProductType` belongs to `productRepository`, from
 *     [model/dao/ProductDAO.cfc:L419]. It is keyed by product type but it returns products, so it
 *     is a product read.
 *   * `searchSkusByProductType` belongs to `skuRepository`, from [model/dao/SkuDAO.cfc:L130]. Same
 *     reasoning: keyed by product type, returns SKUs.
 *
 * A method's home is the aggregate it returns, not the argument it filters on. Neither is declared
 * below, and neither may be added.
 *
 * THE IMPLEMENTING ADAPTER IS `src/repositories/mysql/mysqlProductTypeRepository.ts`, and exactly
 * four obligations transfer to it:
 *
 *   1. Prepared statements exclusively (E5), preserving the injection-safety guarantee that
 *      `cfqueryparam` provided. Every caller-supplied value is bound as its own parameter and
 *      never interpolated into statement text.
 *   2. The tree read's ordering - by product-type name ascending
 *      [model/dao/ProductTypeDAO.cfc:L62] - preserved verbatim, and no different sort substituted.
 *   3. The row-to-entity factory, port injection and association materialization, with the fetch
 *      shape decided and commented at each repository method (T3). Laziness is not simulated.
 *   4. Explicit materialized-path maintenance wherever the ORM previously used persistence
 *      lifecycle hooks. [model/entity/PriceGroup.cfc:L206] and [model/entity/PriceGroup.cfc:L211]
 *      are the documented precedent for that pattern; the product type carries the same kind of
 *      path [model/entity/ProductType.cfc:L53], maintained at
 *      [model/entity/ProductType.cfc:L305-L313] in the legacy source, so the same discipline
 *      applies to any path this adapter writes.
 *
 * `src/handlers/bootstrap.ts` wires that adapter to this interface. Nothing here names a driver, a
 * pool, a connection, a row packet, a statement or a table.
 */
export interface ProductTypeRepository {
  /**
   * Every product type as a tree-sorted row set.
   *
   * Legacy: `public query function getProductTypeQuery()`
   * [model/dao/ProductTypeDAO.cfc:L52]. The name is carried over verbatim and the parameter list is
   * empty exactly as the legacy declaration is (B4) - this method takes no argument, and none may
   * be added to it.
   *
   * The legacy hint calls this a tree-sorted query [model/dao/ProductTypeDAO.cfc:L51], and the
   * tree-sorted part is the contract: the row set arrives ordered by product-type name ascending
   * [model/dao/ProductTypeDAO.cfc:L62] and the adapter must preserve that ordering rather than
   * substitute another. Each row also carries the two counts the legacy statement computes per row
   * - products assigned to the product type, and product types parented by it - described in prose
   * on {@link ProductTypeTreeRow} because this file contains no SQL. This port declares no cache,
   * memo, expiry or invalidation surface, and none may be added.
   *
   * The legacy function hands back a raw CFML query object. That has no target equivalent and is
   * deliberately not imitated: the return is a plain array of read-only rows, never a
   * query-shaped object and never a map keyed by identifier, so ordering survives in the only
   * structure that can carry it. The array is `readonly` because a projection is the port's to
   * produce and not the caller's to rewrite.
   *
   * @returns Product-type rows, ordered by product-type name ascending.
   */
  getProductTypeQuery(): Promise<readonly ProductTypeTreeRow[]>;

  /**
   * Load one product type by its identifier.
   *
   * NO LEGACY ANTECEDENT (B4). `model/dao/ProductTypeDAO.cfc` declares no such function; the
   * legacy service tier loaded product types through framework CRUD inherited from
   * `HibachiService`, which the target does not have (T3). The name follows the convention the
   * sibling repository ports already use for an identifier-keyed entity read.
   *
   * A miss returns `undefined` - explicitly, and never a zero value, an empty object, or an error
   * baked into the return type. The distinction from the nullable columns on
   * {@link ProductTypeTreeRow} is deliberate: those model a column that exists and holds no value,
   * whereas this models no entity at all, and collapsing the two would let a caller mistake an
   * absent product type for a present one.
   *
   * The returned entity must arrive with its parent and child linkage and its `productTypeIDPath`
   * already populated, per the fetch-shape obligation in this file's header. That is not a
   * nicety: the price-group cascade climbs the parent chain
   * [model/service/PriceGroupService.cfc:L57-L100] and the promotion engine walks the path, so an
   * unpopulated graph changes which rate is selected and therefore what a customer is charged.
   *
   * @param productTypeID Identifier of the product type to load.
   * @returns The materialized product type, or `undefined` when there is none.
   */
  getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined>;

  /**
   * Load the product types identified by a materialized ancestry path.
   *
   * NO LEGACY ANTECEDENT (B4). Like the identifier-keyed read above, this is work the ORM used to
   * supply and the repository port must now surface (T3). It exists because
   * `productTypeIDPath` [model/entity/ProductType.cfc:L53] is genuinely walked in the slice: by the
   * promotion qualifier and reward membership tests, and by the price-group product-type cascade.
   *
   * The parameter is a plain `string`, for parity with the persisted column and for the verified
   * reason given in this file's header - `../valueObjects/materializedIdPath.js` exports no branded
   * path type to import, and declaring one here would create a second, incompatible brand.
   * Interpreting the path - splitting it, extracting its root, testing membership - is that
   * module's job and is not reimplemented here or on the returned entities. This method's whole
   * responsibility is to accept a path and answer with the product types it denotes.
   *
   * Returns an empty array when the path denotes nothing. An empty result is a legitimate answer
   * rather than a miss, which is why this method has no `undefined` in its return type while the
   * single-entity read above does.
   *
   * @param productTypeIDPath A comma-delimited, root-first materialized ancestry path.
   * @returns The matching product types, empty when there are none.
   */
  getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]>;

  /**
   * Persist one product type and answer with the persisted entity.
   *
   * NO LEGACY ANTECEDENT (B4) as a DAO function: persistence ran through `super.save()` inside
   * `saveProductType` [model/service/ProductService.cfc:L294-L311], which is framework CRUD rather
   * than a declared DAO method. The method name mirrors that service method and the convention the
   * sibling repository ports use for a save.
   *
   * Deliberately minimal - entity in, persisted entity out - because the surrounding steps of the
   * legacy save belong elsewhere and must not migrate here:
   *
   *   * URL-title generation, which the legacy service performs before saving
   *     [model/service/ProductService.cfc:L297-L300], belongs to the `urlTitleGenerator` port, and
   *     the setting supplying the product-type URL key resolves through `settingsProvider`.
   *     Neither port is imported here: no port imports another.
   *   * Inheriting the parent's products after a successful save
   *     [model/service/ProductService.cfc:L306-L308] is service-tier orchestration and stays in
   *     the service.
   *
   * The adapter is responsible for maintaining the materialized ancestry path on write, since the
   * ORM lifecycle hooks that did so in the legacy source have no target equivalent - obligation 4
   * in this interface's doc comment above.
   *
   * @param productType The product type to persist.
   * @returns The persisted product type.
   */
  saveProductType(productType: ProductType): Promise<ProductType>;
}
